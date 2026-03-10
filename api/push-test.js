// api/push-test.js — 動作確認・診断用
const webpush = require('web-push');
const VAPID_PUBLIC  = 'BOlCwpwWlsbXAd_aw4puzgjrshGrRHbsq-fTQYiGnDmsS-4oFknxdZMRoF_Y8p5ObJ7HgVLxW6j5Tl2XLpy5Agg';
const VAPID_PRIVATE = 'IadUHBvDhGT80HRxamONpaIakVED8zl1oifvrPBBDvM';
const SB_URL = 'https://lnzczkwnvkjacrmkhyft.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxuemN6a3dudmtqYWNybWtoeWZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNDQwOTUsImV4cCI6MjA4NzcyMDA5NX0.Jx89KsMXlDQCNvuxeRyfLsfAkmkVB5-MeabMq9g1j4Y';
const SECRET = 'mydesk2026';

webpush.setVapidDetails('mailto:admin@mydesk.app', VAPID_PUBLIC, VAPID_PRIVATE);
const SB_H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };

module.exports = async (req, res) => {
  if (req.headers['x-mydesk-secret'] !== SECRET)
    return res.status(401).json({ error: 'need header: x-mydesk-secret: mydesk2026' });

  // Supabaseから購読情報を取得
  const r = await fetch(`${SB_URL}/rest/v1/app_data?id=eq.push_subs&select=data`, { headers: SB_H }).catch(e => ({ ok: false, error: String(e) }));
  const rows = r.ok ? await r.json().catch(() => []) : [];
  const subs = rows?.[0]?.data || {};
  const users = Object.keys(subs);

  // テスト送信（?send=userId でその人にテスト送信）
  let testResult = null;
  const sendTo = req.query?.send;
  if (sendTo && subs[sendTo]) {
    try {
      await webpush.sendNotification(subs[sendTo],
        JSON.stringify({ title: '✅ テスト通知', body: 'バックグラウンド通知が正常に動作しています', tag: 'test', icon: '/icon-192.png', url: '/' }),
        { TTL: 300, urgency: 'high' }
      );
      testResult = { ok: true, uid: sendTo };
    } catch(e) { testResult = { ok: false, uid: sendTo, code: e.statusCode, msg: e.message }; }
  }

  return res.status(200).json({
    status: 'ok',
    nodeVersion: process.version,
    webpushVersion: require('web-push/package.json').version,
    subscribedUsers: users.length,
    userIds: users,
    testSend: testResult,
  });
};
