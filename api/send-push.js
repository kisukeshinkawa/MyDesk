// api/send-push.js — Vercel Serverless Function
// web-push npm パッケージを使った正しいVAPID実装
import webpush from 'web-push';

const VAPID_PUBLIC  = 'BOlCwpwWlsbXAd_aw4puzgjrshGrRHbsq-fTQYiGnDmsS-4oFknxdZMRoF_Y8p5ObJ7HgVLxW6j5Tl2XLpy5Agg';
const VAPID_PRIVATE = 'IadUHBvDhGT80HRxamONpaIakVED8zl1oifvrPBBDvM';
const VAPID_SUBJECT = 'mailto:admin@mydesk.app';
const SB_URL = 'https://lnzczkwnvkjacrmkhyft.supabase.co';
const SB_KEY = 'sb_publishable_7mnHP6lGylXBN3GZPqyrsQ_K5ytV1SW';
const API_SECRET = 'mydesk2026';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

async function getPushSubs() {
  const res = await fetch(`${SB_URL}/rest/v1/app_data?id=eq.push_subs&select=data`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
  });
  if (!res.ok) return {};
  const rows = await res.json();
  return rows?.[0]?.data || {};
}

async function removeStaleSub(uid, allSubs) {
  try {
    delete allSubs[uid];
    await fetch(`${SB_URL}/rest/v1/app_data?id=eq.push_subs`, {
      method: 'PATCH',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ data: allSubs }),
    });
  } catch {}
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-mydesk-secret');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (req.headers['x-mydesk-secret'] !== API_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  const { toUserIds, title, body, tag } = req.body || {};
  if (!toUserIds?.length || !title) return res.status(400).json({ error: 'Missing params' });

  const allSubs = await getPushSubs();
  const payload = JSON.stringify({
    title: title || 'MyDesk', body: body || '',
    tag: tag || 'mydesk', icon: '/icon-192.png', badge: '/icon-192.png', url: '/',
  });

  const results = [];
  for (const uid of toUserIds) {
    const sub = allSubs[uid];
    if (!sub) { results.push({ uid, skipped: true }); continue; }
    try {
      await webpush.sendNotification(sub, payload, { TTL: 86400, urgency: 'normal' });
      results.push({ uid, ok: true });
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) await removeStaleSub(uid, allSubs);
      results.push({ uid, ok: false, status: err.statusCode, error: err.message });
    }
  }
  return res.status(200).json({ sent: results.filter(r => r.ok).length, results });
}
