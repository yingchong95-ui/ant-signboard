// netlify/functions/gemini.js
// Anthropic Claude API 代理 — API Key 只存于 Netlify 环境变量，代码里无任何 Key

// ── 简易限流：记录每个 IP 的请求次数（每次冷启动重置，适合低流量网站）──
const ipRequestCount = {};
const RATE_LIMIT_PER_IP = 20;   // 每个 IP 每次函数实例最多 20 次（可调整）
const MAX_TOKENS_CAP = 400;      // 单次回复最多 400 tokens，防止超额消耗

exports.handler = async function (event) {
  // 处理 CORS 预检
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

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // ── 限流检查 ──────────────────────────────────────────────────
  const clientIP = event.headers['x-forwarded-for']?.split(',')[0]?.trim()
                || event.headers['client-ip']
                || 'unknown';

  ipRequestCount[clientIP] = (ipRequestCount[clientIP] || 0) + 1;

  if (ipRequestCount[clientIP] > RATE_LIMIT_PER_IP) {
    return {
      statusCode: 429,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: '请求太频繁，请稍后再试' }),
    };
  }

  // ── API Key ───────────────────────────────────────────────────
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'ANTHROPIC_API_KEY 未配置' }),
    };
  }

  // ── 解析请求 ──────────────────────────────────────────────────
  let requestBody;
  try {
    requestBody = JSON.parse(event.body);
  } catch (e) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: '请求 body 不是合法 JSON' }),
    };
  }

  // ── 构造 Anthropic 请求（强制限制 max_tokens 上限）────────────
  const anthropicBody = {
    model:      requestBody.model      || 'claude-haiku-4-5-20251001',
    max_tokens: Math.min(requestBody.max_tokens || 400, MAX_TOKENS_CAP), // 强制上限
    messages:   requestBody.messages,
  };

  if (requestBody.system) {
    anthropicBody.system = requestBody.system;
  }

  // ── 调用 Anthropic ────────────────────────────────────────────
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(anthropicBody),
    });

    const data = await res.json();

    return {
      statusCode: res.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(data),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: '调用 Anthropic API 失败: ' + err.message }),
    };
  }
};
