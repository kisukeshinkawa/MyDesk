// api/send-push.js  ← GitHubの api/ フォルダに置く
// Web Push通知送信 (Webプッシュ購読があるユーザーに通知)
// Vercel環境変数: VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY (任意)
// ※ VAPID未設定の場合はサイレント失敗（プッシュ通知なしでも他機能は動作）

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const secret = req.headers['x-mydesk-secret'];
  if (secret !== 'mydesk2026') return res.status(403).json({ error: 'Forbidden' });

  // send-push は Web Push API を使う。
  // VAPID鍵が設定されていなければ何もしない（プッシュ通知はオプション機能）
  if (!process.env.VAPID_PRIVATE_KEY) {
    return res.status(200).json({ ok: true, skipped: true, reason: 'VAPID not configured' });
  }

  const { toUserIds, title, body, tag } = req.body || {};
  if (!toUserIds?.length) return res.status(200).json({ ok: true, skipped: true });

  try {
    const webpush = await import('web-push');
    webpush.default.setVapidDetails(
      'mailto:info@dustalk.com',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );

    // Supabaseからsubscriptionを取得
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
    );

    const { data: users } = await supabase
      .from('app_data')
      .select('data')
      .eq('id', 'users');

    const allUsers = users?.[0]?.data || [];
    const payload = JSON.stringify({ title: title || 'MyDesk', body: body || '', tag: tag || 'mydesk' });
    
    const sends = allUsers
      .filter(u => toUserIds.includes(u.id) && u.pushSubscription)
      .map(u =>
        webpush.default.sendNotification(u.pushSubscription, payload)
          .catch(() => {}) // 個別失敗は無視
      );

    await Promise.allSettled(sends);
    return res.status(200).json({ ok: true, sent: sends.length });
  } catch (e) {
    console.error('[send-push]', e.message);
    // プッシュ失敗は致命的エラーにしない
    return res.status(200).json({ ok: true, skipped: true, error: e.message });
  }
}
