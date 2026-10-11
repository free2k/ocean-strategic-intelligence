ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "reject_reason" varchar(255);--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "classify_method" varchar(16);
