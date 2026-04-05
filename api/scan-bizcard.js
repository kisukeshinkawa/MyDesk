// api/scan-bizcard.js  ← GitHubの api/ フォルダに置く
// 名刺画像をAnthropicに送り、テキスト情報をJSON抽出して返す
// Vercel環境変数: ANTHROPIC_API_KEY

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (req.headers['x-mydesk-secret'] !== 'mydesk2026')
    return res.status(403).json({ error: 'Forbidden' });

  const { imageBase64, mediaType } = req.body || {};
  if (!imageBase64) return res.status(400).json({ error: 'Missing image' });

  const prompt = `この名刺画像から情報を読み取り、以下のJSONフォーマットのみで返してください。余分なテキストは不要です。

{
  "lastName": "姓",
  "firstName": "名",
  "company": "会社名（株式会社などの法人格も含めて正確に）",
  "department": "部署名",
  "title": "役職",
  "email": "メールアドレス",
  "telDirect": "直通電話番号",
  "telCompany": "代表電話番号",
  "mobile": "携帯電話番号",
  "fax": "FAX番号",
  "zip": "郵便番号",
  "address": "住所（都道府県から）",
  "url": "WebサイトURL"
}

読み取れない項目は空文字列("")にしてください。JSONのみ出力し、他のテキストは含めないでください。`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType || 'image/jpeg',
                data: imageBase64,
              },
            },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'Anthropic error');

    const text = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    // JSON部分だけ抽出
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('JSONを取得できませんでした');

    const fields = JSON.parse(jsonMatch[0]);
    return res.status(200).json({ fields });
  } catch (e) {
    console.error('[scan-bizcard]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
