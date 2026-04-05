// api/send-email.js  ← GitHubの api/ フォルダに置く
// 送信元: bm-dx@beetle-ems.com
// 方式: SendGrid（推奨）

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // シークレットキー認証（不正利用防止）
  const secret = req.headers['x-mydesk-secret'];
  if (secret !== 'mydesk2026') return res.status(403).json({ error: 'Forbidden' });

  const { to, toName, subject, body } = req.body || {};
  if (!to || !subject || !body) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // ── SendGrid ──────────────────────────────────────────
    if (process.env.SENDGRID_API_KEY) {
      const resp = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to, name: toName || '' }] }],
          from: { email: 'bm-dx@beetle-ems.com', name: 'MyDesk' },
          reply_to: { email: 'bm-dx@beetle-ems.com' },
          subject: subject,
          content: [{ type: 'text/plain', value: body }],
        }),
      });
      if (!resp.ok) {
        const err = await resp.text();
        throw new Error('SendGrid: ' + err);
      }
      return res.status(200).json({ ok: true });
    }

    // ── SMTP（nodemailerが使える環境向け）──────────────────
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.default.createTransport({
      host:   process.env.SMTP_HOST,
      port:   parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    await transporter.sendMail({
      from:    '"MyDesk" <bm-dx@beetle-ems.com>',
      to:      `"${toName}" <${to}>`,
      subject: subject,
      text:    body,
    });
    return res.status(200).json({ ok: true });

  } catch (e) {
    console.error('[send-email]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
