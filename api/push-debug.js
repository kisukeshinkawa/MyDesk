// api/push-debug.js — 購読状態の診断エンドポイント
const SB_URL = 'https://lnzczkwnvkjacrmkhyft.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxuemN6a3dudmtqYWNybWtoeWZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNDQwOTUsImV4cCI6MjA4NzcyMDA5NX0.Jx89KsMXlDQCNvuxeRyfLsfAkmkVB5-MeabMq9g1j4Y';
const API_SECRET = 'mydesk2026';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.headers['x-mydesk-secret'] !== API_SECRET)
    return res.status(401).json({ error: 'Unauthorized' });

  const rows = await fetch(
    `${SB_URL}/rest/v1/app_data?id=eq.push_subs&select=data`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
  ).then(r => r.json()).catch(() => []);

  const subs = rows?.[0]?.data || {};
  const users = Object.keys(subs);

  return res.status(200).json({
    subscribedUserCount: users.length,
    subscribedUserIds: users,
    hasSubscriptions: users.length > 0,
  });
};
