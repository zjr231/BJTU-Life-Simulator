'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createClient, newId } = require('./playthrough.js');
const { createSlotService } = require('./save.js');
const game = require('./game.js');

function browser() {
  const items = new Map(), keys = new Map();
  let sequence = 0;
  return {
    storage: { getItem: key => keys.get(key) ?? null, setItem: (key, value) => keys.set(key, value), removeItem: key => keys.delete(key) },
    queue: {
      put: async body => items.set(++sequence, body),
      first: async () => { for (const [key, body] of items) return { key, body }; },
      remove: async key => items.delete(key)
    }
  };
}
const ok = () => ({ ok: true, json: async () => ({ ok: true }) });
const nextTask = () => new Promise(resolve => setImmediate(resolve));

test('单局跨栏位和备份保留编号，同名同种子另开一局独立；旧档能补编号', () => {
  const { storage } = browser(), service = createSlotService(storage);
  const state = game.createGame({ seed: 'same-seed', nickname: '同学' });
  const run = newId(), another = newId();
  assert.notEqual(run, another);
  assert.ok(service.save(state, 1).ok);
  assert.equal(service.load(1).runId, undefined);
  const legacy = createClient({ storage }).legacyId(state);
  assert.equal(createClient({ storage }).legacyId(state), legacy);
  assert.ok(service.save(state, 1, legacy).ok);
  assert.equal(service.load(1).runId, legacy);
  assert.ok(service.save(state, 2, run).ok);
  assert.ok(service.save(state, 3, run).ok);
  assert.equal(service.load(2).runId, service.load(3).runId);
  assert.ok(service.save(state, 2, another).ok);
  assert.equal(service.load(2).runId, another);
  assert.equal(service.load(2, 'backup').runId, run);
});

test('断网保留保存时的快照，重开后按序补传，已到达的结局不再上传', async () => {
  const env = browser(), timers = [], received = [];
  const offline = createClient({ ...env, post: async () => { throw new Error('offline'); }, retry: fn => timers.push(fn) });
  const run = newId(), state = { revision: 1, history: [{ commandId: 'first' }], result: { direction: 'test' } };
  await offline.capture(run, state, 'manual', 2, 100);
  state.revision = 2;
  await offline.capture(run, state, 'auto', 2, 200);
  await offline.capture(run, state, 'ending', null, 300);
  await offline.capture(run, state, 'ending', null, 350);
  await offline.capture(run, state, 'ending', null, 400, '希望增加活动');
  await nextTask();
  assert.equal(offline.feedbackStatus(run), 'queued');
  assert.equal(timers.length, 1);
  const online = createClient({ ...env, post: async body => { received.push(JSON.parse(body)); return ok(); } });
  await online.flush();
  assert.deepEqual(received.map(r => [r.kind, r.state.revision, r.slot]), [['manual',1,2], ['auto',2,2], ['ending',2,null], ['ending',2,null]]);
  assert.equal(online.feedbackStatus(run), 'sent');
  assert.equal(received[3].feedback, '希望增加活动');
  assert.equal(received[3].feedbackSource, 'ending');
  await online.capture(run, state, 'ending', null, 500);
  await online.flush();
  assert.equal(received.length, 4);
  const other = newId();
  online.skip(other);
  assert.equal(createClient(env).feedbackStatus(other), 'skipped');
  assert.equal(await env.queue.first(), undefined);
});

test('反馈提示与全局免打扰状态可跨页面读取', () => {
  const { storage } = browser(), client = createClient({ storage }), run = newId();
  assert.equal(client.feedbackPrompted(run), false);
  client.markFeedbackPrompted(run);
  assert.equal(createClient({ storage }).feedbackPrompted(run), true);
  assert.equal(client.feedbackOptOut(), false);
  client.setFeedbackOptOut(true);
  assert.equal(createClient({ storage }).feedbackOptOut(), true);
  client.setFeedbackOptOut(false);
  assert.equal(createClient({ storage }).feedbackOptOut(), false);
});

test('退出快照和后续反馈携带来源，不互相覆盖', async () => {
  const env = browser(), received = [], run = newId();
  const client = createClient({ ...env, post: async body => { received.push(JSON.parse(body)); return ok(); } });
  await client.capture(run, {}, 'exit', null, 1);
  await client.capture(run, {}, 'feedback', null, 2, '后续建议', 'settings');
  await client.flush();
  assert.deepEqual(received.map(item => [item.kind, item.feedbackSource]), [['exit', undefined], ['feedback', 'settings']]);
});

test('超限反馈退回可重填，后续合法存档仍会到达', async () => {
  const env = browser(), calls = [], run = newId();
  const client = createClient({ ...env, post: async body => {
    calls.push(JSON.parse(body));
    return calls.length === 1 ? { ok: false, status: 413 } : ok();
  } });
  await client.capture(run, {}, 'ending', null, 1, '待退回');
  await client.capture(run, {}, 'manual', 1, 2);
  await nextTask();
  assert.equal(client.feedbackStatus(run), 'error');
  assert.deepEqual(calls.map(row => row.kind), ['ending', 'manual']);
  assert.equal(await env.queue.first(), undefined);
});

test('设备无法持久保存时，反馈仅提示本页待发，恢复网络后确认送达', async () => {
  const { storage } = browser(), run = newId(), timers = [];
  let online = false;
  const client = createClient({ storage, post: async () => online ? ok() : { ok: false, status: 503 }, retry: fn => timers.push(fn) });
  await client.capture(run, {}, 'ending', null, 1, '建议');
  await nextTask();
  assert.equal(client.feedbackStatus(run), 'temporary');
  assert.ok(!createClient({ storage }).feedbackStatus(run));
  online = true;
  await client.flush();
  assert.equal(createClient({ storage }).feedbackStatus(run), 'sent');
});
