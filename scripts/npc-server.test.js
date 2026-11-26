'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const game = require('../game.js');
const { createService } = require('./npc-server.js');
const { openAccounts } = require('./npc-accounts.js');

async function fixture(t, apiKey = 'test-only') {
  let now = Date.UTC(2026, 10, 25, 8);
  const calls = [];
  const store = openAccounts(':memory:', () => now);
  const server = createService({ store, apiKey, origin: 'https://campus.example', fetchFn: async (url, options) => {
    const request = JSON.parse(options.body);
    calls.push(request);
    const reply = request.messages[0].content.includes('长期记忆') ? '{"coreMemory":"记得散步","reflection":"一起散了步","focus":"运动","memories":[]}'
      : request.messages[0].content.includes('对话摘要') ? '我们约好散步。' : '{"say":"一起散步吗？","intent":"none"}';
    return { ok: true, json: async () => ({ choices: [{ message: { content: reply } }] }) };
  } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); store.close(); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const post = (route, body, cookie = '', origin = 'https://campus.example') => fetch(base + '/api/' + route, { method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie, origin }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  async function startGuest() {
    const res = await post('npc-account/session', {});
    assert.equal(res.status, 200);
    assert.match(res.headers.get('set-cookie'), /HttpOnly; SameSite=Strict; Max-Age=\d+; Secure$/);
    return { ...await res.json(), cookie: res.headers.get('set-cookie').split(';')[0] };
  }
  const state = game.npcCast.meet(game.createGame({ seed: 'npc-api' }), 'linXia');
  const chat = game.characterAgent.chatPayload(state, '你好', [], null, 'linXia');
  const terms = Array.from({ length: 6 }, () => ({ text: '走走？', reply: '好啊。' }));
  const requests = [chat, game.characterAgent.chatPayload(state, '', [], { kind: 'proactive', place: 'track' }, 'linXia'),
    { npcId: 'linXia', kind: 'summary', context: { previous: '', turns: terms } },
    { npcId: 'linXia', kind: 'reflection', context: { term: 1, previousCore: '', previousReflection: '', events: [], memories: [] } }];
  return { store, calls, post, startGuest, chat, requests, advance: ms => { now += ms; } };
}

test('服务端缺少模型密钥时保留账号额度，客户端仍可使用本地回应', async t => {
  const { startGuest, post, chat, calls, store } = await fixture(t, '');
  const { cookie, id } = await startGuest();
  for (let i = 0; i < 7; i++) assert.equal((await post('npc-chat', chat, cookie)).status, 503);
  assert.equal(calls.length, 0);
  assert.deepEqual(store.records(id), []);
});

test('超限请求体返回格式提示，拒绝后可以继续正常聊天', async t => {
  const { startGuest, post, chat, calls } = await fixture(t);
  const { cookie } = await startGuest();
  assert.equal((await post('npc-chat', ' '.repeat(25000), cookie)).status, 400);
  assert.equal((await post('npc-chat', { ...chat, messages: [] }, cookie)).status, 400);
  assert.equal((await post('npc-chat', chat, cookie)).status, 200);
  assert.equal(calls.length, 1);
});

test('同一来源十分钟内最多创建三十个身份，复用已有会话不占创建次数', t => {
  let now = Date.now();
  const store = openAccounts(':memory:', () => now);
  t.after(() => store.close());
  const player = store.guestSession('', 'a');
  for (let i = 1; i < 30; i++) assert.ok(store.guestSession('', 'a').id);
  assert.equal(store.guestSession('', 'a').status, 429);
  assert.deepEqual(store.guestSession(player.token, 'a'), { id: player.id });
  now += 60000 * 10;
  assert.ok(store.guestSession('', 'a').id);
});

test('首次建立免登录会话，复用旧会话并继承封禁；过期后自动领取新会话', async t => {
  const { startGuest, post, chat, calls, advance, store } = await fixture(t);
  assert.equal((await post('npc-chat', chat)).status, 401);
  assert.equal((await post('npc-account/session', {}, '', 'https://another.example')).status, 403);
  for (const old of ['register', 'login']) assert.equal((await post('npc-account/' + old, {})).status, 404);
  const account = await startGuest();
  assert.deepEqual(Object.keys(account).sort(), ['cookie', 'id']);
  assert.equal((await post('npc-chat', chat, account.cookie, 'https://another.example')).status, 403);
  const repeat = await post('npc-account/session', {}, account.cookie);
  assert.deepEqual(await repeat.json(), { id: account.id });
  assert.equal(repeat.headers.get('set-cookie'), null);
  store.moderate(account.id, true);
  assert.equal((await post('npc-account/session', {}, account.cookie)).status, 403);
  assert.equal((await post('npc-chat', chat, account.cookie)).status, 403);
  advance(31 * 86400000);
  assert.equal((await post('npc-chat', chat, account.cookie)).status, 401);
  const renewed = await post('npc-account/session', {}, account.cookie);
  assert.equal(renewed.status, 200);
  assert.notEqual((await renewed.json()).id, account.id);
  assert.equal(calls.length, 0);
});

test('聊天、主动邀请、摘要、反思均由服务端组装，且共用滚动分钟额度', async t => {
  const { startGuest, post, calls, requests, chat, advance } = await fixture(t);
  const { cookie } = await startGuest();
  for (const body of requests) {
    const result = await post('npc-chat', body, cookie);
    assert.equal(result.status, 200, JSON.stringify(body));
    assert.ok((await result.json()).reply);
    assert.deepEqual(calls.at(-1).messages.map(row => row.role), ['system', 'user']);
    assert.match(calls.at(-1).messages[0].content, /林夏/);
  }
  const responses = await Promise.all([1, 2, 3].map(() => post('npc-chat', chat, cookie)));
  assert.deepEqual(responses.map(res => res.status).sort(), [200, 429, 429]);
  assert.equal(calls.length, 5);
  advance(60000);
  assert.equal((await post('npc-chat', chat, cookie)).status, 200);
});

test('三次格式错误触发临时封禁，正常聊天和额度耗尽不计违规；管理员可查看、解封、封禁', async t => {
  const { startGuest, post, store, calls, chat, advance } = await fixture(t);
  const { id, cookie } = await startGuest();
  assert.equal((await post('npc-chat', { ...chat, text: '可以换个话题吗？' }, cookie)).status, 200);
  assert.equal(store.records(id).length, 0);
  for (const [body, expected] of [[{ messages: [] }, 400], [ { ...chat, npcId: 'unknown' }, 400 ], ['{', 403]]) {
    assert.equal((await post('npc-chat', body, cookie)).status, expected);
  }
  assert.equal((await post('npc-chat', chat, cookie)).status, 403);
  assert.equal(store.records(id).filter(row => row.reason.startsWith('格式错误')).length, 3);
  advance(15 * 60000);
  assert.equal((await post('npc-chat', chat, cookie)).status, 200);
  store.moderate(id, true);
  assert.equal((await post('npc-chat', chat, cookie)).status, 403);
  store.moderate(id, false);
  assert.equal((await post('npc-chat', { ...chat, context: { ...chat.context, turns: [{}] } }, cookie)).status, 400);
  assert.equal((await post('npc-chat', chat, cookie)).status, 200);
  assert.equal(calls.length, 3);
});

test('SQLite 重开保留会话、封禁和两级日额度，跨日仍遵守滚动分钟', t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bjtu-npc-'));
  const file = path.join(dir, 'accounts.sqlite');
  let now = Date.UTC(2026, 10, 25, 15, 30), store = openAccounts(file, () => now);
  t.after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  const sign = client => store.guestSession('', client);
  const blocked = sign('blocked'); store.moderate(blocked.id, true);
  const players = Array.from({ length: 25 }, (_, i) => sign('player' + i));
  for (let minute = 0; minute < 4; minute++) {
    for (const player of players) for (let n = 0; n < 5; n++) assert.equal(store.reserve(player.token).id, player.id);
    now += 60000;
  }
  const fresh = sign('fresh');
  store.close(); store = openAccounts(file, () => now);
  assert.equal(store.identify(blocked.token).status, 403);
  assert.equal(store.reserve(players[0].token).status, 429);
  assert.equal(store.reserve(fresh.token).status, 429);
  now = Date.UTC(2026, 10, 25, 16);
  for (let n = 0; n < 5; n++) assert.equal(store.reserve(fresh.token).id, fresh.id);
  now += 60000;
  assert.equal(store.reserve(fresh.token).id, fresh.id);
});

test('个人日额度与项目额度独立；午夜之前的请求仍占用滚动分钟', t => {
  let now = Date.UTC(2026, 10, 25, 15, 56, 30);
  const store = openAccounts(':memory:', () => now);
  t.after(() => store.close());
  const player = store.guestSession('', 'player');
  for (let m = 0; m < 4; m++) {
    for (let n = 0; n < 5; n++) assert.equal(store.reserve(player.token).id, player.id);
    if (m < 3) now += 60000;
  }
  assert.equal(store.reserve(player.token).status, 429);
  now += 30000;
  assert.equal(store.reserve(player.token).status, 429);
  now += 30000;
  assert.equal(store.reserve(player.token).id, player.id);
  for (let m = 0; m < 4; m++) {
    now += 60000;
    for (let n = 0; n < (m === 3 ? 4 : 5); n++) assert.equal(store.reserve(player.token).id, player.id);
  }
  now += 60000;
  assert.equal(store.reserve(player.token).status, 429);
  assert.equal(store.records(player.id).length, 0);
});
