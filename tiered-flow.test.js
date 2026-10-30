'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('./game.js');
const save = require('./save.js');

function militaryOffer(seed = 1) {
  let state = game.createGame({ seed });
  state = game.executeAction(state, 'study').state;
  state = game.executeAction(state, 'study').state;
  assert.equal(state.pendingEvent.id, 'military1');
  return state;
}
function regularStudent() {
  for (let seed = 0; seed < 100; seed++) {
    const state = game.createGame({ seed });
    if (state.background.id !== 'information') return state;
  }
}
function roundtrip(state) {
  const data = new Map();
  const store = save.createSlotService({ getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) });
  const written = store.save(state, 1);
  assert.equal(written.ok, true, written.reason);
  const loaded = store.load(1);
  assert.equal(loaded.ok, true, loaded.reason);
  assert.deepEqual(loaded.state, state);
  return loaded.state;
}

test('自主学习采用明确的 6/12/20 档位及 1/2/3 时间，规则层拒绝任意数值', () => {
  const state = regularStudent();
  const profile = game.getActionInvestment(state, 'selfStudy');
  assert.deepEqual(profile.tiers.map(tier => [tier.amount, tier.time]), [[6, 1], [12, 2], [20, 3]]);
  for (const amount of [4, 5, 7, 11, 13, 19, 21, 24]) {
    const rejected = game.executeAction(state, 'selfStudy', { investment: amount });
    assert.equal(rejected.ok, false);
    assert.strictEqual(rejected.state, state);
  }
  for (const tier of profile.tiers) {
    const result = game.executeAction(state, 'selfStudy', { investment: tier.amount });
    assert.equal(result.ok, true);
    assert.equal(result.changes.time, -tier.time);
    assert.equal(result.changes.energy, -tier.amount);
    assert.equal(result.entry.investment.tier, tier.id);
  }
});

test('自习背景优惠降低档位精力成本，档位时间保持不变', () => {
  let state;
  for (let seed = 0; seed < 100; seed++) {
    const candidate = game.createGame({ seed });
    if (candidate.background.id === 'information') { state = candidate; break; }
  }
  assert.deepEqual(game.getActionInvestment(state, 'selfStudy').tiers.map(tier => [tier.amount, tier.time]), [[3, 1], [9, 2], [17, 3]]);
});

test('天佑会堂观演固定成本与固定回报，没有可调档位且不抽取收益随机数', () => {
  for (let seed = 0; seed < 20; seed++) {
    const state = { ...game.createGame({ seed }), eventFlags: { 'randomCampusRoll:1': true } };
    assert.equal(game.getActionInvestment(state, 'show'), null);
    const result = game.executeAction(state, 'show');
    assert.equal(result.ok, true);
    assert.equal(result.changes.time, -1);
    assert.equal(result.changes.energy, -2);
    assert.equal(result.changes.money, -40);
    assert.equal(result.changes.mood, 8);
    assert.equal(result.changes.social, 2);
    assert.deepEqual(result.state.rng, state.rng);
    assert.equal(result.entry.investment, undefined);
    assert.equal(game.executeAction(state, 'show', { investment: 100 }).ok, false);
  }
});

test('军训总成本在开始时收取，立即进入汇演，其他行动与结算均不可插入', () => {
  const offered = militaryOffer();
  for (const tier of game.EVENT_INVESTMENTS['military1:join'].tiers) {
    const result = game.submitEventChoice(offered, 'join', { investment: tier.amount });
    assert.equal(result.ok, true);
    const state = roundtrip(result.state);
    assert.equal(state.time, offered.time - tier.time);
    assert.equal(state.energy, offered.energy - tier.amount);
    assert.equal(state.pendingEvent.id, 'military2');
    for (const action of Object.keys(game.ACTIONS)) assert.equal(game.executeAction(state, action).ok, false, action);
    assert.equal(game.endTerm(state).ok, false);
    const done = game.submitEventChoice(state, 'perform');
    assert.equal(done.ok, true);
    assert.equal(done.changes.time, 0);
    assert.equal(done.changes.energy, 0);
    assert.equal(done.state.rng.calls, state.rng.calls);
    assert.equal(done.state.experiences.filter(item => item.type === 'military').length, 1);
    assert.equal(done.state.history.at(-2).event, 'military1');
    assert.equal(done.state.history.at(-1).event, 'military2');
    assert.equal(game.submitEventChoice(done.state, 'perform').ok, false);
    roundtrip(done.state);
  }
});

test('不足以支付整个军训时不能开训；恰好用完资源仍能免费完成汇演', () => {
  const offered = militaryOffer();
  for (const lacking of [{ ...offered, time: 1 }, { ...offered, energy: 9 }]) {
    const rejected = game.submitEventChoice(lacking, 'join', { investment: 10 });
    assert.equal(rejected.ok, false);
    assert.strictEqual(rejected.state, lacking);
    assert.equal(game.submitEventChoice(lacking, 'later').ok, true);
  }
  const exact = { ...offered, time: 2, energy: 10 };
  const joined = game.submitEventChoice(exact, 'join', { investment: 10 }).state;
  assert.equal(joined.time, 0);
  assert.equal(joined.energy, 0);
  const done = game.submitEventChoice(joined, 'perform');
  assert.equal(done.ok, true);
  assert.equal(done.state.experiences.at(-1).type, 'military');
});

test('心情事件等军训结束再处理，过了原汇演窗口也不会中断', () => {
  const offered = { ...militaryOffer(), mood: 20 };
  const joined = game.submitEventChoice(offered, 'join', { investment: 26 }).state;
  assert.equal(joined.pendingEvent.id, 'military2');
  assert.equal(joined.eventQueue.some(item => item.id === 'roommateCare'), false);
  const done = game.submitEventChoice(joined, 'perform').state;
  assert.equal(done.pendingEvent.id, 'roommateCare');
  assert.equal(done.experiences.at(-1).type, 'military');
});

test('旧档中断的军训在恢复时优先续接，保留其他待处理事件与随机位置', () => {
  const joined = game.submitEventChoice(militaryOffer(), 'join', { investment: 18 }).state;
  const legacy = { ...joined, appVersion: '0.4.2', pendingEvent: { id: 'roommateCare', term: 1, instanceId: 'daily:roommateCare:1' }, eventQueue: [] };
  roundtrip(legacy);
  assert.equal(game.submitEventChoice(legacy, 'talk').ok, false);
  const resumed = game.resumeRequiredEvents(legacy);
  assert.equal(resumed.pendingEvent.id, 'military2');
  assert.deepEqual(resumed.eventQueue.map(item => item.id), ['roommateCare']);
  assert.deepEqual(resumed.rng, legacy.rng);
  assert.equal(resumed.time, legacy.time);
  assert.equal(resumed.energy, legacy.energy);
  roundtrip(resumed);
});

test('旧版任意数值及观演随机记录仍能读档，不重算既有结果', () => {
  const state = game.executeAction(game.createGame(), 'show').state;
  const entry = state.history[0];
  entry.investment = { amount: 40, resource: 'money', level: 'steady', outcome: 'steady', description: '旧版观演结果保留。' };
  entry.command.investment = 40;
  roundtrip(state);
  const other = game.executeAction(regularStudent(), 'selfStudy', { investment: 6 }).state;
  other.history[0].investment.amount = 4;
  delete other.history[0].investment.tier;
  other.history[0].command.investment = 4;
  roundtrip(other);
});
