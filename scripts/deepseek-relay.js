'use strict';
// DeepSeek 对话中转：适配阿里云事件函数（HTTP 触发器，用 exports.handler）
// 或华为云函数工作流（API 网关触发器，用 exports.main）。
// DeepSeek 密钥只放在云函数的环境变量 DEEPSEEK_API_KEY 里，前端永远接触不到；
// 部署与验收步骤见 docs/DeepSeek对话接入说明.md。
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const MAX_MESSAGES = 14;
const MAX_CONTENT = 600;
const MAX_REPLY = 400;
const DEFAULT_TIMEOUT_MS = 20000;

function corsHeaders() {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

// 核心逻辑与平台无关：接收 { messages }，返回 { statusCode, body }。
// options 供本地与测试注入：{ apiKey, fetchFn, timeoutMs }。
async function relay(body, options = {}) {
  const apiKey = options.apiKey || process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return { statusCode: 503, body: { error: '中转未配置密钥，请设置环境变量 DEEPSEEK_API_KEY' } };
  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
    return { statusCode: 400, body: { error: '缺少 messages 数组' } };
  }
  const messages = body.messages.slice(0, MAX_MESSAGES).map((message) => ({
    role: message.role === 'assistant' || message.role === 'system' ? message.role : 'user',
    content: String(message.content ?? '').slice(0, MAX_CONTENT)
  }));
  if (!messages.some((message) => message.role === 'user')) return { statusCode: 400, body: { error: 'messages 里没有用户消息' } };
  const fetchFn = options.fetchFn || fetch;
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(DEEPSEEK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({ model: 'deepseek-chat', messages, max_tokens: 150, temperature: 1.0, stream: false }),
      signal: controller.signal
    });
    if (!response.ok) {
      let detail = '';
      try { detail = String((await response.json()).error?.message || ''); } catch (_) {}
      return { statusCode: 502, body: { error: '模型服务返回 ' + response.status + (detail ? '：' + detail : '') } };
    }
    const data = await response.json();
    const reply = String(data?.choices?.[0]?.message?.content ?? '').trim().slice(0, MAX_REPLY);
    if (!reply) return { statusCode: 502, body: { error: '模型没有返回内容' } };
    return { statusCode: 200, body: { reply } };
  } catch (error) {
    return { statusCode: 504, body: { error: error && error.name === 'AbortError' ? '模型响应超时' : '中转调用失败' } };
  } finally {
    clearTimeout(timer);
  }
}

// 阿里云函数计算 HTTP 触发器：exports.handler = async (event, context) => {}
// 事件函数写法，返回 { statusCode, headers, body } 标准结构。
// FC 3.0 的 Node.js 运行时可能把整个事件以 Buffer/字符串传入，这里统一归一化为对象；
// 末尾的 options 仅供本地测试注入，云平台运行时不会传入。
async function handler(event, context, options = {}) {
  const headers = corsHeaders();
  // 事件归一化：Buffer / JSON 字符串 → 对象（控制台“测试”传入的裸 JSON 也兼容）
  let parsed = event;
  if (Buffer.isBuffer(parsed) || typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed.toString('utf-8')); } catch (_) { parsed = {}; }
  }
  if (!parsed || typeof parsed !== 'object') parsed = {};

  // 获取请求方法，兼容不同版本的事件结构
  const method = parsed.method || parsed.httpMethod || (parsed.requestContext && parsed.requestContext.http && parsed.requestContext.http.method) || 'POST';

  // 处理 CORS 预检请求
  if (method === 'OPTIONS') {
    return { statusCode: 204, headers, body: '', isBase64Encoded: false };
  }
  if (method !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: '只接受 POST' }), isBase64Encoded: false };
  }

  // 解析请求体
  let body = null;
  try {
    let rawBody = parsed.body;
    if (rawBody === undefined || rawBody === null || rawBody === '') {
      body = parsed; // 控制台“测试”直接把 messages JSON 作为事件传入的情况
    } else if (Buffer.isBuffer(rawBody)) {
      body = JSON.parse(rawBody.toString('utf-8'));
    } else if (typeof rawBody === 'string') {
      body = JSON.parse(parsed.isBase64Encoded ? Buffer.from(rawBody, 'base64').toString('utf-8') : rawBody);
    } else {
      body = rawBody; // 网关已把 body 解析成对象
    }
  } catch (err) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: '请求体不是合法的 JSON' }), isBase64Encoded: false };
  }

  // 调用中转逻辑
  const result = await relay(body, options);

  // 返回标准格式
  return {
    statusCode: result.statusCode,
    headers,
    body: JSON.stringify(result.body),
    isBase64Encoded: false
  };
}

// 华为云函数工作流 + API 网关：exports.main = async (event, context) => {}
async function main(event, _context, options = {}) {
  const body = event.body ? (typeof event.body === 'string' ? JSON.parse(event.body) : event.body) : event;
  const result = await relay(body, options);
  return { statusCode: result.statusCode, headers: corsHeaders(), body: JSON.stringify(result.body), isBase64Encoded: false };
}

module.exports = { relay, handler, main, corsHeaders, DEEPSEEK_URL };

// 本地试跑：DEEPSEEK_API_KEY=sk-xxx node scripts/deepseek-relay.js '{"messages":[{"role":"user","content":"你好"}]}'
if (require.main === module) {
  const raw = process.argv[2] || '{}';
  relay(JSON.parse(raw)).then((result) => {
    console.log(result.statusCode, JSON.stringify(result.body, null, 2));
  }, (error) => {
    console.error('本地试跑失败:', error.message);
    process.exitCode = 1;
  });
}
