import { inArray } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';

interface ImportAccount {
  fakeid: string;
  nickname: string;
  round_head_img?: string;
}

interface ImportBody {
  accounts: ImportAccount[];
}

interface ImportResponse {
  total: number;
  created: number;
  skipped: number;
}

/**
 * POST /api/wechat/accounts/import
 *
 * Batch imports WeChat official accounts from a JSON payload.
 * Existing fakeids are skipped and marked as duplicates.
 * Returns statistics: total, created, skipped.
 *
 * Body:
 * - accounts (required): Array of account objects with fakeid, nickname, and optional round_head_img
 *
 * Requirements: 2.5, 2.6
 */
export default defineEventHandler(async (event): Promise<ImportResponse> => {
  const body = await readBody<ImportBody>(event);

  // Validate that accounts is a non-empty array
  if (!body.accounts || !Array.isArray(body.accounts) || body.accounts.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: '缺少必填字段：accounts 必须是非空数组',
    });
  }

  const db = useDB();
  const total = body.accounts.length;

  // Deduplicate input by fakeid (keep first occurrence)
  const uniqueAccountsMap = new Map<string, ImportAccount>();
  for (const account of body.accounts) {
    if (account.fakeid && !uniqueAccountsMap.has(account.fakeid)) {
      uniqueAccountsMap.set(account.fakeid, account);
    }
  }
  const uniqueAccounts = Array.from(uniqueAccountsMap.values());

  // Get all existing fakeids from the sources table (where type='wechat')
  const fakeids = uniqueAccounts.map((a) => a.fakeid);
  const existingRecords = fakeids.length > 0
    ? await db
        .select({ fakeid: schema.sources.fakeid })
        .from(schema.sources)
        .where(inArray(schema.sources.fakeid, fakeids))
    : [];

  const existingFakeids = new Set(existingRecords.map((r) => r.fakeid));

  // Filter out accounts that already exist
  const newAccounts = uniqueAccounts.filter((a) => !existingFakeids.has(a.fakeid));

  // Batch insert new accounts
  if (newAccounts.length > 0) {
    await db.insert(schema.sources).values(
      newAccounts.map((account) => ({
        fakeid: account.fakeid,
        name: account.nickname,
        avatar: account.round_head_img || null,
        type: 'wechat' as const,
      })),
    );
  }

  const created = newAccounts.length;
  const skipped = total - created;

  return {
    total,
    created,
    skipped,
  };
});
