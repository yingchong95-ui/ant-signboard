// netlify/functions/design.js
// Claude Design AI 代理 — 为 signboard 页面提供 AI 设计建议
// API Key 只存于 Netlify 环境变量，前端代码里不含任何 Key

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

function reply(statusCode, obj) {
  return { statusCode, headers: CORS, body: JSON.stringify(obj) };
}

exports.handler = async function (event) {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  // API Key
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return reply(500, { error: 'ANTHROPIC_API_KEY 未配置' });

  // Parse request body
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return reply(400, { error: 'Invalid JSON' });
  }

  const { industry, companyName, style } = body;
  if (!industry) return reply(400, { error: 'industry is required' });

  const prompt = `You are a professional signboard design consultant in Malaysia.
A customer wants a signboard design with these details:
- Company name: ${companyName || '(not specified yet)'}
- Industry: ${industry}
- Design style preference: ${style || 'modern'}

Please suggest a complete signboard design in JSON format only. No explanation, just JSON.
Return exactly this structure:
{
  "businessType": "short business type label in Bahasa Malaysia (max 3 words, e.g. 'Pejabat Urusan', 'Kedai Runcit', 'Klinik Pergigian')",
  "slogan": "a short compelling slogan in Bahasa Malaysia (max 8 words)",
  "bgColour": "#hexcode for background/panel colour that suits the industry and style",
  "fgColour": "#hexcode for letter/logo colour that contrasts well",
  "bgColourName": "colour name in English (e.g. Deep Navy, Forest Green)",
  "fgColourName": "colour name in English (e.g. Pure White, Champagne Gold)",
  "lighting": "frontlit or backlit or nonlit — whichever suits the style best",
  "led": "white or warm — whichever suits the colour scheme",
  "reasoning": "one sentence in English explaining the design choice"
}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return reply(res.status, { error: `Claude API error: ${res.status}`, detail: err });
    }

    const data = await res.json();
    const text = data.content[0].text.trim();

    // Strip markdown fences if present
    const clean = text.replace(/```json|```/g, '').trim();
    const design = JSON.parse(clean);

    return reply(200, { design });
  } catch (err) {
    console.error('design function error:', err);
    return reply(500, { error: 'Failed to generate design', detail: err.message });
  }
};
