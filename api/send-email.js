// api/send-email.js — Vercel サーバーレス関数
// メール送信 (nodemailer + SMTP)
const nodemailer = require('nodemailer');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-mydesk-secret');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secret = req.headers['x-mydesk-secret'];
  if (secret !== 'mydesk2026') return res.status(401).json({ error: 'Unauthorized' });

  const { to, toName, subject, body } = req.body || {};
  if (!to || !subject || !body) return res.status(400).json({ error: 'to/subject/body required' });

  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = parseInt(process.env.SMTP_PORT || '587');

  if (!smtpUser || !smtpPass) {
    console.log('[send-email] SMTP未設定 — 送信予定:', { to, subject });
    return res.status(200).json({ ok: true, dev: true, message: 'SMTP未設定のためスキップ' });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: `"MyDesk" <${smtpUser}>`,
      to,
      subject,
      text: body,
      html: `<div style="font-family:sans-serif;max-width:480px;padding:24px;background:#f9fafb;border-radius:12px;">
        <div style="font-size:20px;font-weight:800;color:#2563eb;margin-bottom:16px;">📋 MyDesk</div>
        <div style="background:white;border-radius:8px;padding:16px;border:1px solid #e5e7eb;">
          <div style="font-size:16px;font-weight:700;color:#111827;margin-bottom:8px;">${subject}</div>
          <div style="font-size:14px;color:#374151;line-height:1.6;">${body.replace(/\n/g,'<br>')}</div>
        </div>
        <div style="font-size:11px;color:#9ca3af;margin-top:12px;">MyDesk — チーム業務管理</div>
      </div>`,
    });

    console.log('[send-email] 送信成功:', { to, subject });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[send-email] エラー:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
