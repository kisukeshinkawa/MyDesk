// api/send-email.js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (req.headers['x-mydesk-secret'] !== 'mydesk2026') 
    return res.status(403).end();

  const { to, toName, subject, body } = req.body || {};
  if (!to || !subject) return res.status(400).end();

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.re_btGNpMXq_CRSqeuAoNp2oLo2DQFHxiaAJ}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'MyDesk <bm-dx@beetle-ems.com>',
      to: [to],
      subject: subject,
      text: body,
    }),
  });

  const json = await resp.json();
  if (!resp.ok) return res.status(500).json({ error: json.message });
  return res.status(200).json({ ok: true });
}
