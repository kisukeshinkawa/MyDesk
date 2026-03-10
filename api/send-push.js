// api/send-push.js — Vercel Serverless (Node 18, CommonJS)
const webpush = require('web-push');

const VAPID_PUBLIC  = 'BOlCwpwWlsbXAd_aw4puzgjrshGrRHbsq-fTQYiGnDmsS-4oFknxdZMRoF_Y8p5ObJ7HgVLxW6j5Tl2XLpy5Agg';
const VAPID_PRIVATE = 'IadUHBvDhGT80HRxamONpaIakVED8zl1oifvrPBBDvM';
const VAPID_SUBJECT = 'mailto:admin@mydesk.app';
const SB_URL    = 'https://lnzczkwnvkjacrmkhyft.supabase.co';
const SB_KEY    = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxuemN6a3dudmtqYWNybWtoeWZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNDQwOTUsImV4cCI6MjA4NzcyMDA5NX0.Jx89KsMXlDQCNvuxeRyfLsfAkmkVB5-MeabMq9g1j4Y';
const SECRET    = 'mydesk2026';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const SB_H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };

async function getSubs() {
  const r = await fetch(`${SB_URL}/rest/v1/app_data?id=eq.push_subs&select=data`, { headers: SB_H });
  const rows = await r.json();
  return rows?.[0]?.data || {};
}

async function saveSubs(subs) {
  await fetch(`${SB_URL}/rest/v1/app_data`, {
    method: 'POST',
    headers: { ...SB_H, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ id: 'push_subs', data: subs, updated_at: new Date().toISOString() }),
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-mydesk-secret');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).end();
  if (req.headers['x-mydesk-secret'] !== SECRET) return res.status(401).json({ error: 'unauthorized' });

  const { toUserIds, title, body = '', tag = 'mydesk' } = req.body || {};
  if (!toUserIds?.length || !title) return res.status(400).json({ error: 'missing params' });

  let allSubs;
  try { allSubs = await getSubs(); }
  catch (e) { return res.status(500).json({ error: 'supabase read failed', detail: String(e) }); }

  const payload = JSON.stringify({ title, body, tag, icon: '/icon-192.png', badge: '/icon-192.png', url: '/' });
  const results = [];
  let dirty = false;

  for (const uid of toUserIds) {
    if (!allSubs[uid]) { results.push({ uid, skipped: 'no_sub' }); continue; }
    try {
      await webpush.sendNotification(allSubs[uid], payload, { TTL: 86400, urgency: 'high' });
      results.push({ uid, ok: true });
    } catch (e) {
      results.push({ uid, ok: false, code: e.statusCode, msg: e.message });
      if (e.statusCode === 410 || e.statusCode === 404) { delete allSubs[uid]; dirty = true; }
    }
  }

  if (dirty) { try { await saveSubs(allSubs); } catch {} }
  return res.status(200).json({ sent: results.filter(r => r.ok).length, results });
};
