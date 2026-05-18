// netlify/functions/gemini.js
// Anthropic Claude API 代理 — API Key 只存于 Netlify 环境变量，代码里无任何 Key

exports.handler = async function (event) {
  // 处理浏览器 CORS 预检请求
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

  // Key 从 Netlify 环境变量读取，绝不写死在代码里
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'ANTHROPIC_API_KEY 未配置' }),
    };
  }

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

  // 构造发给 Anthropic 的请求体
  const anthropicBody = {
    model:      requestBody.model      || 'claude-haiku-4-5-20251001',
    max_tokens: requestBody.max_tokens || 1024,
    messages:   requestBody.messages,
  };

  // system 是可选参数，有传才加
  if (requestBody.system) {
    anthropicBody.system = requestBody.system;
  }

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

    // 直接透传 Anthropic 的真实状态码和响应体
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
