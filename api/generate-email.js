// Vercel サーバーレス関数 — Anthropic APIプロキシ
// ファイルの場所: api/generate-email.js
// このファイルをGitHubリポジトリの api/ フォルダに配置してください

export default async function handler(req, res) {
  // CORS対応（MyDesk自身のドメインからのみ許可）
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // OPTIONSリクエスト（プリフライト）への対応
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "APIキーが設定されていません。Vercelの環境変数にANTHROPIC_API_KEYを設定してください。" });
  }

  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "promptが必要です" });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001", // コスト効率の良いモデルを使用
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Anthropic API error:", errorText);
      return res.status(response.status).json({ error: "AI生成に失敗しました", detail: errorText });
    }

    const data = await response.json();
    const text = data.content?.map(c => c.text || "").join("").trim();

    return res.status(200).json({ text });

  } catch (error) {
    console.error("Server error:", error);
    return res.status(500).json({ error: "サーバーエラーが発生しました", detail: error.message });
  }
}
