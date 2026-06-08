import nodemailer from 'nodemailer';

let _transporter: nodemailer.Transporter | null = null;
let _lastSmtpUser: string | null = null;

function getTransporter() {
  const smtpHost = process.env.SMTP_HOST || '';
  const smtpPort = parseInt(process.env.SMTP_PORT || '465');
  const smtpUser = process.env.SMTP_USER || '';
  const smtpPass = process.env.SMTP_PASS || '';

  if (!smtpHost || !smtpUser || !smtpPass) {
    throw new Error('SMTP 配置不完整，请检查环境变量 SMTP_HOST / SMTP_USER / SMTP_PASS');
  }

  // 如果配置变了（重启后 process.env 更新），重建 transporter
  if (_transporter && _lastSmtpUser === smtpUser) {
    return _transporter;
  }

  _transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });
  _lastSmtpUser = smtpUser;
  return _transporter;
}

export interface SendMailOptions {
  to: string | string[];
  subject: string;
  html: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

/** 发送邮件 */
export async function sendMail(options: SendMailOptions) {
  const smtpFrom = process.env.SMTP_FROM || process.env.SMTP_USER || '';
  const transporter = getTransporter();

  const result = await transporter.sendMail({
    from: `"海洋能源资讯推送" <${smtpFrom}>`,
    to: Array.isArray(options.to) ? options.to.join(',') : options.to,
    subject: options.subject,
    html: options.html,
    attachments: options.attachments,
  });

  return result;
}

/** 验证 SMTP 连接是否正常 */
export async function verifySmtp(): Promise<boolean> {
  try {
    const transporter = getTransporter();
    await transporter.verify();
    return true;
  } catch {
    return false;
  }
}

/** 将 Markdown 内容转为简单 HTML 邮件格式 */
export function markdownToHtml(markdown: string): string {
  let html = markdown
    .replace(/^# (.+)$/gm, '<h1 style="color:#1a5276;border-bottom:2px solid #2ecc71;padding-bottom:8px;">$1</h1>')
    .replace(/^## (.+)$/gm, '<h2 style="color:#1e8449;margin-top:24px;">$1</h2>')
    .replace(/^### (.+)$/gm, '<h3 style="color:#2c3e50;margin-top:16px;">$1</h3>')
    .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid #ddd;margin:16px 0;" />')
    .replace(/^\*(.+)\*$/gm, '<p style="color:#7f8c8d;font-style:italic;font-size:12px;">$1</p>')
    .replace(/\n\n/g, '</p><p style="line-height:1.8;color:#333;">')
    .replace(/\n/g, '<br/>');

  // 将链接转为可点击
  html = html.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" style="color:#2980b9;text-decoration:none;">查看原文</a>',
  );

  return `
    <div style="max-width:800px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:20px;background:#fff;">
      <p style="line-height:1.8;color:#333;">${html}</p>
      <footer style="margin-top:32px;padding-top:16px;border-top:1px solid #eee;color:#999;font-size:12px;">
        此邮件由「海洋能源资源情报分析系统」自动推送
      </footer>
    </div>
  `;
}
