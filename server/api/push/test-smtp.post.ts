import { sendMail, verifySmtp } from '~/server/utils/mailer';

/** 测试 SMTP 连接并发送测试邮件 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ email: string }>(event);

  if (!body?.email) {
    throw createError({ statusCode: 400, message: '请输入测试邮箱地址' });
  }

  // 先验证连接
  const connected = await verifySmtp();
  if (!connected) {
    throw createError({ statusCode: 500, message: 'SMTP 连接失败，请检查环境变量配置' });
  }

  // 发送测试邮件
  try {
    await sendMail({
      to: body.email,
      subject: '【海洋能源资讯】推送测试邮件',
      html: `
        <div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:20px;">
          <h2 style="color:#1a5276;">🎉 邮件推送配置成功</h2>
          <p style="line-height:1.8;color:#333;">
            您好！这是一封来自「海洋能源资源情报分析系统」的测试邮件。
          </p>
          <p style="line-height:1.8;color:#333;">
            如果您收到此邮件，说明 SMTP 邮件推送功能已配置成功，后续系统将按照您设定的频率自动推送行业资讯摘要到此邮箱。
          </p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
          <p style="color:#999;font-size:12px;">
            此邮件由系统自动发送，发送时间：${new Date().toLocaleString('zh-CN')}
          </p>
        </div>
      `,
    });

    return { success: true, message: `测试邮件已发送至 ${body.email}` };
  } catch (e: any) {
    throw createError({ statusCode: 500, message: `发送失败: ${e.message}` });
  }
});
