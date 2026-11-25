'use strict';
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const { openAccounts, sessionAge } = require('./npc-accounts.js');
const { validRequest, modelRequest, record } = require('./npc-request.js');
const agent = require('../character-agent.js');
const { openPlaythroughs } = require('./playthrough-store.js');
const playthroughPath = '/api/playthroughs';

const chatPath = '/api/npc-chat';
const accountPath = '/api/npc-account/';
const maxBody = 24 * 1024;
const cookieName = 'bjtu_npc_session';
const empty = record({});
async function readJson(req, limit = maxBody) {
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new Error('类型');
  const chunks = [];
  let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > limit) { req.resume(); throw new Error('长度'); }
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('JSON'); }
}

function createService({ store, playthroughs, apiKey, origin, fetchFn = fetch, trustProxy = false, servePage }) {
  const originUrl = origin && new URL(origin);
  const secure = originUrl?.protocol === 'https:' ? '; Secure' : '';
  function cookie(token) {
    return cookieName + '=' + token + '; Path=/api/; HttpOnly; SameSite=Strict; Max-Age=' + (token ? sessionAge / 1000 : 0) + secure;
  }
  const uploadCounts = new Map();
  let uploadWindowEnds = 0;
  function allowUpload(client) {
    if (Date.now() >= uploadWindowEnds) { uploadCounts.clear(); uploadWindowEnds = Date.now() + 60000; }
    const count = uploadCounts.get(client) || 0;
    if (count >= 120) return false;
    uploadCounts.set(client, count + 1);
    return true;
  }
  async function handle(req, res) {
    function send(status, data, extra = {}) {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra });
      res.end(JSON.stringify(data));
    }
    const reject = result => send(result.status, { error: result.error });
    const token = (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(cookieName + '='))?.slice(cookieName.length + 1) || '';
    const url = req.url;
    if (servePage && !url.startsWith('/api/')) return servePage(req, res);
    const action = url.startsWith(accountPath) ? url.slice(accountPath.length) : '';
    if (url !== chatPath && url !== playthroughPath && !['session', 'register', 'login', 'logout'].includes(action)) return send(404, { error: '未知接口' });
    if (req.method !== (action === 'session' ? 'GET' : 'POST')) return send(405, { error: '请求方式不正确' });
    if (!originUrl && !/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(req.headers.host || '')) return send(403, { error: '请配置游戏站点地址' });
    const expectedOrigin = originUrl?.origin || 'http://' + req.headers.host;
    if (req.headers.origin && req.headers.origin !== expectedOrigin || req.headers['sec-fetch-site'] === 'cross-site') return send(403, { error: '请从游戏站点访问' });
    const client = trustProxy && req.headers['x-real-ip'] || req.socket.remoteAddress;
    if (url === playthroughPath) {
      if (!playthroughs) return send(503, { error: '存档服务尚未启动' });
      if (!allowUpload(client)) return send(429, { error: '请稍后重试' });
      let capture;
      try { capture = await readJson(req, 2 * 1024 * 1024); }
      catch (error) { return send(error.message === '长度' ? 413 : 400, { error: '存档请求大小或格式有误' }); }
      const result = playthroughs.record(capture);
      return result.error ? reject(result) : send(200, { ok: true });
    }
    if (action === 'session' || url === chatPath) {
      const account = store.identify(token);
      if (account.error) return reject(account);
      if (action === 'session') return send(200, account);
    }
    let body;
    try { body = await readJson(req); }
    catch (error) { return url === chatPath ? reject(store.invalid(token, ['类型','长度'].includes(error.message) ? error.message : 'JSON')) : send(400, { error: '无效的账号请求' }); }
    if (action) {
      const valid = action === 'login' ? record({ code: v => typeof v === 'string' && v.length <= 40 })(body) : empty(body);
      if (!valid) return send(400, { error: '无效的账号请求' });
      if (action === 'logout') {
        store.logout(token);
        return send(200, {}, { 'Set-Cookie': cookie('') });
      }
      const result = store.authenticate(action, body.code?.trim().toUpperCase(), client);
      if (result.error) return reject(result);
      store.logout(token);
      return send(200, { id: result.id, ...(result.code ? { code: result.code } : {}) }, { 'Set-Cookie': cookie(result.token) });
    }
    if (!validRequest(body)) return reject(store.invalid(token, '字段'));
    if (!apiKey) return send(503, { error: '在线对话尚未配置' });
    const reserved = store.reserve(token);
    if (reserved.error) return reject(reserved);
    try {
      const upstream = await fetchFn('https://api.deepseek.com/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
        body: JSON.stringify(modelRequest(body)), signal: AbortSignal.timeout(12000)
      });
      if (!upstream.ok) throw new Error('upstream');
      const reply = (await upstream.json()).choices?.[0]?.message?.content;
      const valid = typeof reply === 'string' && (body.kind === 'reflection' ? reply.length <= 2400 && agent.parseReflection(reply)
        : body.kind === 'summary' ? reply.trim() && reply.length <= 180 : agent.parse(reply, body.context.candidates.map(id => ({ id })), body.npcId));
      if (!valid) throw new Error('reply');
      return send(200, { reply });
    } catch { return send(502, { error: '在线人物暂时无法回复' }); }
  }
  return http.createServer({ requestTimeout: 15000, headersTimeout: 10000 }, (req, res) => {
    handle(req, res).catch(() => { if (!res.headersSent) res.writeHead(500, { 'Cache-Control': 'no-store' }); res.end(); });
  });
}

if (require.main === module) {
  const accountFile = process.env.NPC_DB || path.join(os.homedir(), '.bjtu-life', 'npc.sqlite');
  const store = openAccounts(accountFile);
  const [command = 'serve', id] = process.argv.slice(2);
  if (command === 'serve') {
    const playthroughs = openPlaythroughs(path.join(path.dirname(accountFile), 'playthroughs.sqlite'));
    const server = createService({ store, playthroughs, apiKey: process.env.DEEPSEEK_API_KEY, origin: process.env.NPC_ORIGIN, trustProxy: process.env.NPC_TRUST_PROXY === '1' });
    server.listen(Number(process.env.NPC_PORT || 8080), '127.0.0.1', () => console.log('NPC API listening on', server.address().port));
  } else {
    try {
      if (command === 'accounts') console.table(store.accounts());
      else if (!/^[1-9]\d*$/.test(id || '')) throw new Error('用法：accounts | records ID | ban ID | unban ID');
      else if (command === 'records') console.table(store.records(Number(id)));
      else if (['ban', 'unban'].includes(command)) store.moderate(Number(id), command === 'ban');
      else throw new Error('未知账号管理命令');
    } finally { store.close(); }
  }
}
module.exports = { createService };
