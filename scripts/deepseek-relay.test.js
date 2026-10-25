'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { relay, handler, main, corsHeaders, DEEPSEEK_URL } = require('./deepseek-relay.js');

const KEY = 'sk-test-key';
const okJson = { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: ' 你好呀，同学！ ' } }] }) };
const call = (body, fetchFn, options = {}) => relay(body, { apiKey: KEY, fetchFn, timeoutMs: 200, ...options });

test('未配置密钥返回 503，且不发起任何请求', async () => {
  let called = false;
  const result = await relay({ messages: [{ role: 'user', content: 'hi' }] }, { fetchFn: async () => { called = true; return okJson; } });
  assert.equal(result.statusCode, 503);
  assert.equal(called, false);
});

test('参数校验：缺 messages、空数组、无用户消息分别返回 400', async () => {
  assert.equal((await call(null, async () => okJson)).statusCode, 400);
  assert.equal((await call({}, async () => okJson)).statusCode, 400);
  assert.equal((await call({ messages: [] }, async () => okJson)).statusCode, 400);
  assert.equal((await call({ messages: [{ role: 'system', content: 'x' }] }, async () => okJson)).statusCode, 400);
});

test('正常调用 DeepSeek：模型、鉴权头、消息透传与截断，返回 reply', async () => {
  let captured = null;
  const fetchFn = async (url, options) => {
    captured = { url, options, body: JSON.parse(options.body) };
    return okJson;
  };
  const result = await call({
    messages: [
      { role: 'system', content: '你是食堂阿姨' },
      { role: 'user', content: 'x'.repeat(800) },
      { role: 'assistant', content: 'y' },
      { role: 'narrator', content: '旁白' },
      { role: 'user', content: '你好' }
    ]
  }, fetchFn);
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.reply, '你好呀，同学！');
  assert.equal(captured.url, DEEPSEEK_URL);
  assert.equal(captured.options.headers.Authorization, 'Bearer ' + KEY);
  assert.equal(captured.body.model, 'deepseek-chat');
  assert.equal(captured.body.stream, false);
  assert.equal(captured.body.messages[1].role, 'user', '未知角色收敛为用户');
  assert.equal(captured.body.messages[1].content.length, 600, '内容截断到 600 字符');
  assert.equal(captured.body.messages[2].role, 'assistant');
  assert.equal(captured.body.messages[3].role, 'user', '旁白角色收敛为用户');
});

test('上游返回非 200 时转成 502 并带上模型错误信息', async () => {
  const result = await call({ messages: [{ role: 'user', content: 'hi' }] }, async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'Invalid API key' } }) }));
  assert.equal(result.statusCode, 502);
  assert.match(result.body.error, /401/);
  assert.match(result.body.error, /Invalid API key/);
});

test('响应超时返回 504，调用已中止', async () => {
  const fetchFn = (_url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
  const result = await call({ messages: [{ role: 'user', content: 'hi' }] }, fetchFn, { timeoutMs: 30 });
  assert.equal(result.statusCode, 504);
});

test('模型无内容或网络失败分别返回 502 与 504', async () => {
  const empty = await call({ messages: [{ role: 'user', content: 'hi' }] }, async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '' } }] }) }));
  assert.equal(empty.statusCode, 502);
  const offline = await call({ messages: [{ role: 'user', content: 'hi' }] }, async () => { throw new Error('ECONNREFUSED'); });
  assert.equal(offline.statusCode, 504);
});

test('阿里云 HTTP 触发器签名：handler 写入状态码与 JSON 响应', async () => {
  const resp = { statusCode: 0, headers: {}, send(body) { this.body = body; }, setHeader(key, value) { this.headers[key] = value; } };
  await handler({ method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }) }, resp, {}, { apiKey: KEY, fetchFn: async () => okJson });
  assert.equal(resp.statusCode, 200);
  assert.equal(JSON.parse(resp.body).reply, '你好呀，同学！');
  await handler({ method: 'OPTIONS' }, resp, {});
  assert.equal(resp.statusCode, 204);
  assert.equal(resp.headers['Access-Control-Allow-Origin'], '*');
});

test('华为云 API 网关签名：main 返回状态码、CORS 头与非 base64 JSON', async () => {
  const result = await main({ body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }) }, {}, { apiKey: KEY, fetchFn: async () => okJson });
  assert.equal(result.statusCode, 200);
  assert.equal(result.isBase64Encoded, false);
  assert.equal(JSON.parse(result.body).reply, '你好呀，同学！');
  assert.equal(result.headers['Access-Control-Allow-Origin'], '*');
});

test('CORS 头固定允许任意来源并限定方法与请求头', () => {
  assert.deepEqual(corsHeaders(), {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
});
