// api/send-push.js — Vercel Serverless Function (CommonJS)
const webpush = require('web-push');

const VAPID_PUBLIC  = 'BOlCwpwWlsbXAd_aw4puzgjrshGrRHbsq-fTQYiGnDmsS-4oFknxdZMRoF_Y8p5ObJ7HgVLxW6j5Tl2XLpy5Agg';
const VAPID_PRIVATE = 'IadUHBvDhGT80HRxamONpaIakVED8zl1oifvrPBBDvM';
const VAPID_SUBJECT = 'mailto:admin@mydesk.app';
const SB_URL        = 'https://lnzczkwnvkjacrmkhyft.supabase.co';
const SB_KEY        = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxuemN6a3dudmtqYWNybWtoeWZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNDQwOTUsImV4cCI6MjA4NzcyMDA5NX0.Jx89KsMXlDQCNvuxeRyfLsfAkmkVB5-MeabMq9g1j4Y';
const API_SECRET    = 'mydesk2026';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const SB_HEADERS = {
  'apikey': SB_KEY,
  'Authorization': `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
};

async function getPushSubs() {
  const res = await fetch(
    `${SB_URL}/rest/v1/app_data?id=eq.push_subs&select=data`,
    { headers: SB_HEADERS }
  );
  if (!res.ok) throw new Error(`Supabase error: ${res.status}`);
  const rows = await res.json();
  return rows?.[0]?.data || {};
}

async function savePushSubs(allSubs) {
  await fetch(`${SB_URL}/rest/v1/app_data`, {
    method: 'POST',
    headers: { ...SB_HEADERS, 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify({ id: 'push_subs', data: allSubs }),
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-mydesk-secret');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });
  if (req.headers['x-mydesk-secret'] !== API_SECRET)
    return res.status(401).json({ error: 'Unauthorized' });

  const { toUserIds, title, body, tag } = req.body || {};
  if (!toUserIds?.length || !title)
    return res.status(400).json({ error: 'Missing params' });

  let allSubs = {};
  try { allSubs = await getPushSubs(); } catch(e) {
    return res.status(500).json({ error: 'Failed to load subscriptions', detail: e.message });
  }

  const payload = JSON.stringify({
    title: title || 'MyDesk',
    body:  body  || '',
    tag:   tag   || 'mydesk',
    icon:  '/icon-192.png',
    badge: '/icon-192.png',
    url:   '/',
  });

  const results = [];
  let subsChanged = false;

  for (const uid of toUserIds) {
    const sub = allSubs[uid];
    if (!sub) { results.push({ uid, skipped: true }); continue; }
    try {
      await webpush.sendNotification(sub, payload, { TTL: 86400, urgency: 'high' });
      results.push({ uid, ok: true });
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        delete allSubs[uid];
        subsChanged = true;
      }
      results.push({ uid, ok: false, status: err.statusCode, err: err.message });
    }
  }

  if (subsChanged) { try { await savePushSubs(allSubs); } catch {} }

  return res.status(200).json({
    sent: results.filter(r => r.ok).length,
    results,
  });
};
