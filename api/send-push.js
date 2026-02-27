// api/send-push.js - Vercel Serverless Function

const VAPID_PUBLIC = 'BOlCwpwWlsbXAd_aw4puzgjrshGrRHbsq-fTQYiGnDmsS-4oFknxdZMRoF_Y8p5ObJ7HgVLxW6j5Tl2XLpy5Agg';
const VAPID_PRIVATE = 'IadUHBvDhGT80HRxamONpaIakVED8zl1oifvrPBBDvM';
const VAPID_SUBJECT = 'mailto:admin@mydesk.app';

const SB_URL = 'https://lnzczkwnvkjacrmkhyft.supabase.co';
const SB_KEY = 'sb_publishable_7mnHP6lGylXBN3GZPqyrsQ_K5ytV1SW';

function b64urlToUint8(b) {
  const pad = b.replace(/-/g,'+').replace(/_/g,'/');
  return Uint8Array.from(Buffer.from(pad, 'base64'));
}

function uint8ToB64url(u) {
  return Buffer.from(u).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

async function createVapidJWT(audience) {
  const header = { typ:'JWT', alg:'ES256' };
  const now = Math.floor(Date.now()/1000);
  const payload = { aud: audience, exp: now+12*3600, sub: VAPID_SUBJECT };
  const encode = obj => uint8ToB64url(Buffer.from(JSON.stringify(obj)));
  const sigInput = `${encode(header)}.${encode(payload)}`;

  const privKey = await crypto.subtle.importKey(
    'jwk',
    { kty:'EC', crv:'P-256', d: VAPID_PRIVATE,
      x: VAPID_PUBLIC.slice(1, 33),
      y: VAPID_PUBLIC.slice(33),
      key_ops:['sign'] },
    { name:'ECDSA', namedCurve:'P-256' }, false, ['sign']
  ).catch(() => null);

  if (!privKey) throw new Error('Failed to import VAPID private key');

  const sig = await crypto.subtle.sign(
    { name:'ECDSA', hash:'SHA-256' },
    privKey,
    Buffer.from(sigInput)
  );
  return `${sigInput}.${uint8ToB64url(new Uint8Array(sig))}`;
}

async function sendWebPush(subscription, payload) {
  const url = new URL(subscription.endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const jwt = await createVapidJWT(audience).catch(() => null);
  if (!jwt) return { ok: false, error: 'JWT generation failed' };

  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${jwt},k=${VAPID_PUBLIC}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body).toString(),
      'TTL': '86400',
    },
    body,
  });
  return { ok: res.ok, status: res.status };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secret = req.headers['x-mydesk-secret'];
  if (secret !== 'mydesk2026') return res.status(401).json({ error: 'Unauthorized' });

  const { toUserIds, title, body, tag } = req.body;
  if (!toUserIds?.length || !title) return res.status(400).json({ error: 'Missing params' });

  const subRes = await fetch(`${SB_URL}/rest/v1/app_data?id=eq.push_subs&select=data`, {
    headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` }
  });
  const subRows = await subRes.json();
  const allSubs = subRows?.[0]?.data || {};

  const payload = { title, body: body || '', tag: tag || 'mydesk' };
  const results = [];

  for (const uid of toUserIds) {
    const sub = allSubs[uid];
    if (!sub) continue;
    const r = await sendWebPush(sub, payload).catch(e => ({ ok: false, error: e.message }));
    results.push({ uid, ...r });
  }

  return res.status(200).json({ results });
}
