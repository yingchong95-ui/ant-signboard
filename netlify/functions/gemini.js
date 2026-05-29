// netlify/functions/gemini.js
// Anthropic Claude API 代理 — API Key 只存于 Netlify 环境变量，代码里无任何 Key
// 支持 calculate_price 工具：当请求带 enable_pricing 时，AI 可在对话中算出精确价格。

const { calculatePrice, PRICING_GUIDE, PRODUCT_ENUM } = require('./pricing.js');

// ── 简易限流：记录每个 IP 的请求次数（每次冷启动重置，适合低流量网站）──
const ipRequestCount = {};
const RATE_LIMIT_PER_IP = 30;    // 每个 IP 每个函数实例最多 30 次用户消息
const MAX_TOKENS_CAP = 1024;     // 单次回复 token 上限（报价明细需要更多空间）
const MAX_TOOL_LOOPS = 6;        // 工具调用循环上限，防止死循环
const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

function reply(statusCode, obj) {
  return { statusCode, headers: CORS, body: JSON.stringify(obj) };
}

const PRICE_TOOL = {
  name: 'calculate_price',
  description:
    '计算 A&T Signboard 各产品的精确价格（与官网下单页同一套公式）。' +
    '只有在已知必要参数时才调用；缺参数时先向用户提问。\n\n' + PRICING_GUIDE,
  input_schema: {
    type: 'object',
    properties: {
      product: { type: 'string', enum: PRODUCT_ENUM, description: '产品类型' },
      params: { type: 'object', description: '该产品所需的参数对象（见说明）', additionalProperties: true },
    },
    required: ['product', 'params'],
  },
};

exports.handler = async function (event) {
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

  // ── 限流 ──
  const clientIP = event.headers['x-forwarded-for']?.split(',')[0]?.trim()
                || event.headers['client-ip'] || 'unknown';
  ipRequestCount[clientIP] = (ipRequestCount[clientIP] || 0) + 1;
  if (ipRequestCount[clientIP] > RATE_LIMIT_PER_IP) {
    return reply(429, { error: '请求太频繁，请稍后再试' });
  }

  // ── API Key ──
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return reply(500, { error: 'ANTHROPIC_API_KEY 未配置' });

  // ── 解析请求 ──
  let requestBody;
  try { requestBody = JSON.parse(event.body); }
  catch (e) { return reply(400, { error: '请求 body 不是合法 JSON' }); }

  const model = requestBody.model || DEFAULT_MODEL;
  const maxTokens = Math.min(requestBody.max_tokens || 512, MAX_TOKENS_CAP);
  const enablePricing = !!requestBody.enable_pricing;

  let system = requestBody.system || '';
  let tools;
  if (enablePricing) {
    tools = [PRICE_TOOL];
    system = (system ? system + '\n\n' : '') + PRICING_GUIDE;
  }

  let messages = Array.isArray(requestBody.messages) ? requestBody.messages.slice() : [];

  try {
    let data;
    for (let loop = 0; loop < MAX_TOOL_LOOPS; loop++) {
      const body = { model, max_tokens: maxTokens, messages };
      if (system) body.system = system;
      if (tools) body.tools = tools;

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });

      data = await res.json();
      if (!res.ok) return reply(res.status, data); // 把 API 错误透传给前端

      // 没有工具调用 → 这是最终回复，结束
      if (data.stop_reason !== 'tool_use') break;

      // 有工具调用 → 在本地执行计算，再把结果回传给模型
      messages.push({ role: 'assistant', content: data.content });
      const toolResults = [];
      for (const block of data.content) {
        if (block.type === 'tool_use' && block.name === 'calculate_price') {
          const result = calculatePrice(block.input && block.input.product, block.input && block.input.params);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
        }
      }
      if (!toolResults.length) break; // 安全兜底
      messages.push({ role: 'user', content: toolResults });
    }

    return reply(200, data);
  } catch (err) {
    return reply(500, { error: '调用 Anthropic API 失败: ' + err.message });
  }
};
