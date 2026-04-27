// MyDesk - Whisper文字起こしAPI
// OpenAI Whisper APIへ音声データを転送して日本語文字起こしを取得する
// Node.js 20.x 必須（fetch組み込み）

const SECRET = 'mydesk2026';

export const handler = async (event) => {
  // CORS プリフライトレスポンス
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-mydesk-secret',
    'Content-Type': 'application/json',
  };

  if (event.requestContext?.http?.method === 'OPTIONS' || event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  // 認証チェック
  const headers = event.headers || {};
  const secret = headers['x-mydesk-secret'] || headers['X-Mydesk-Secret'] || headers['X-MYDESK-SECRET'];
  if (secret !== SECRET) {
    return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  try {
    // OPENAI_API_KEY 確認
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'OPENAI_API_KEY not set in Lambda env' }) };
    }

    // リクエストボディから音声データを取得（base64）
    let body;
    try {
      body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    } catch (e) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON body' }) };
    }

    const audioBase64 = body?.audio;
    const filename = body?.filename || 'recording.webm';
    const mimeType = body?.mimeType || 'audio/webm';

    if (!audioBase64) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'audio (base64) is required' }) };
    }

    // base64 → Buffer
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    if (audioBuffer.length === 0) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'audio data is empty' }) };
    }
    if (audioBuffer.length > 24 * 1024 * 1024) {
      return { statusCode: 413, headers: corsHeaders, body: JSON.stringify({ error: 'audio file too large (max 24MB)' }) };
    }

    // multipart/form-data を手動で構築
    const boundary = '----MyDeskBoundary' + Math.random().toString(36).slice(2);
    const CRLF = '\r\n';

    const buildPart = (name, value) => {
      return Buffer.from(
        `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="${name}"${CRLF}${CRLF}` +
        `${value}${CRLF}`
      );
    };

    const filePartHeader = Buffer.from(
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"${CRLF}` +
      `Content-Type: ${mimeType}${CRLF}${CRLF}`
    );
    const filePartFooter = Buffer.from(CRLF);
    const endBoundary = Buffer.from(`--${boundary}--${CRLF}`);

    const formData = Buffer.concat([
      filePartHeader,
      audioBuffer,
      filePartFooter,
      buildPart('model', 'whisper-1'),
      buildPart('language', 'ja'),
      buildPart('response_format', 'json'),
      buildPart('temperature', '0'),
      endBoundary,
    ]);

    // OpenAI Whisper API 呼び出し
    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: formData,
    });

    if (!whisperRes.ok) {
      const errText = await whisperRes.text();
      console.error('Whisper API error:', whisperRes.status, errText);
      return {
        statusCode: whisperRes.status,
        headers: corsHeaders,
        body: JSON.stringify({ error: `Whisper API error: ${errText}` }),
      };
    }

    const result = await whisperRes.json();
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ text: result.text || '', duration: result.duration || null }),
    };

  } catch (e) {
    console.error('Lambda error:', e);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: e.message || 'Internal error' }),
    };
  }
};
