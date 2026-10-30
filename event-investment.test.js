'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('./game.js');
const random = require('./rng.js');
const save = require('./save.js');

function pending(event, seed = 'investment-test') {
  const state = game.createGame({ nickname: '投入测试', seed });
  return { ...state, phase: 'eventPending', pendingEvent: { id: event, term: 1, instanceId: 'daily:' + event + ':1' } };
}
function roundtrip(state) {
  const values = new Map();
  const service = save.createSlotService({ getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) });
  const stored = service.save(state, 1);
  assert.equal(stored.ok, true, stored.reason);
  const loaded = service.load(1);
  assert.equal(loaded.ok, true, loaded.reason);
  assert.deepEqual(loaded.state, state);
  return loaded.state;
}

test('全部 11 个投入选项的预览不扣资源、不消耗随机数，结算按指定成本和公式执行', () => {
  assert.equal(Object.keys(game.EVENT_INVESTMENTS).length, 11);
  for (const [key, profile] of Object.entries(game.EVENT_INVESTMENTS)) {
    const [event, choice] = key.split(':');
    for (const amount of profile.tiers.map(tier => tier.amount)) {
      const state = pending(event);
      const original = structuredClone(state);
      const preview = game.previewEventInvestment(state, choice, amount);
      assert.equal(preview.ok, true);
      assert.deepEqual(state, original);
      const result = game.submitEventChoice(state, choice, { investment: amount });
      assert.equal(result.ok, true, key + ': ' + result.reason);
      assert.equal(result.state[profile.resource], state[profile.resource] - amount);
      assert.equal(result.state.rng.calls, state.rng.calls + 1);
      const q = amount / (amount + profile.h);
      const a = 1 + 2 * q;
      const factor = (1 - profile.s) * a / (a + 1) + profile.s * random.draw(state.rng).number ** (1 / a);
      for (const [attribute, ceiling] of Object.entries(profile.rewards)) {
        assert.equal(result.changes[attribute], Math.min(100 - state[attribute], Math.round(ceiling * q * factor)), key + ': ' + attribute);
      }
      assert.equal(result.entry.investment.amount, amount);
      assert.equal(result.entry.command.investment, amount);
      assert.ok(result.entry.investment.description.includes(profile.outcomes[result.entry.investment.outcome]));
      assert.deepEqual(state, original);
      roundtrip(result.state);
    }
  }
});

test('非法投入、资源不足、过期和重复提交均不扣费也不前进随机序列', () => {
  const state = pending('campusDiscussion');
  for (const amount of [0, -1, 1, 21, 2.5, NaN, Infinity, '5', null]) {
    assert.equal(game.previewEventInvestment(state, 'discuss', amount).ok, false);
    const result = game.submitEventChoice(state, 'discuss', { investment: amount });
    assert.equal(result.ok, false);
    assert.strictEqual(result.state, state);
  }
  const before = structuredClone(state);
  for (const resource of ['energy', 'time']) {
    const poor = { ...state, [resource]: 0 };
    assert.strictEqual(game.submitEventChoice(poor, 'discuss', { investment: 5 }).state, poor);
    assert.equal(game.submitEventChoice(poor, 'discuss', { investment: 5 }).ok, false);
    assert.equal(game.submitEventChoice(poor, 'later').ok, true);
  }
  const noMoney = { ...pending('graduation'), money: 19 };
  assert.equal(game.submitEventChoice(noMoney, 'photos', { investment: 20 }).ok, false);
  assert.equal(game.submitEventChoice(state, 'discuss', { investment: 5, eventInstanceId: 'stale' }).ok, false);
  assert.equal(game.submitEventChoice(state, 'discuss', { investment: 5, expectedRevision: 1 }).ok, false);
  assert.equal(game.submitEventChoice(state, 'later', { investment: 5 }).ok, false);
  assert.deepEqual(state, before);
  const result = game.submitEventChoice(state, 'discuss', { investment: 5, commandId: 'one-event' });
  assert.equal(game.submitEventChoice(result.state, 'discuss', { investment: 5, commandId: 'one-event' }).ok, false);
  assert.equal(game.submitEventChoice(result.state, 'discuss', { investment: 5 }).ok, false);
  assert.equal(game.submitEventChoice(state, 'later').state.rng.calls, state.rng.calls);
});

test('事件精力也占用相应时间，时间不足可改为少量投入或免费跳过', () => {
  const state = pending('campusDiscussion');
  for (const [amount, time] of [[5, 1], [20, 2]]) {
    assert.equal(game.previewEventInvestment(state, 'discuss', amount).effect.time, time);
    const result = game.submitEventChoice(state, 'discuss', { investment: amount });
    assert.equal(result.ok, true);
    assert.equal(result.changes.time, -time);
  }
  const short = { ...state, time: 1 };
  const rejected = game.submitEventChoice(short, 'discuss', { investment: 20 });
  assert.equal(rejected.ok, false);
  assert.match(rejected.reason, /时间不够/);
  assert.strictEqual(rejected.state, short);
  assert.equal(game.submitEventChoice(short, 'discuss', { investment: 5 }).ok, true);
  assert.equal(game.submitEventChoice(short, 'later').ok, true);
});

test('相同随机条件下多投入不会减小收益，平均回报呈边际递减', () => {
  const state = pending('campusDiscussion');
  let previous = 0;
  const means = [];
  for (const amount of game.EVENT_INVESTMENTS["campusDiscussion:discuss"].tiers.map(tier => tier.amount)) {
    const result = game.submitEventChoice(state, 'discuss', { investment: amount });
    assert.ok(result.changes.preparation >= previous);
    previous = result.changes.preparation;
    const q = amount / (amount + 5);
    const a = 1 + 2 * q;
    means.push(15 * q * a / (a + 1));
  }
  const increments = means.slice(1).map((value, i) => value - means[i]);
  assert.ok(increments.every((value, i) => value > 0 && (!i || value <= increments[i - 1])));
});

test('低投入意外收获和高投入发挥失常都有对应事件文案，竞争经历仍只记一次', () => {
  const seen = new Set();
  for (let seed = 0; seed < 800; seed++) {
    for (const amount of [4, 30]) {
      const result = game.submitEventChoice(pending('singer3', 'story-' + seed), 'perform', { investment: amount });
      const investment = result.entry.investment;
      seen.add(investment.level + ':' + investment.outcome);
      assert.equal(result.state.experiences.filter(item => item.type === 'singer').length, 1);
      if (investment.level === 'deep' && investment.outcome === 'setback') assert.match(investment.description, /反复|排进练习/);
      assert.match(investment.description, /唱|歌|话筒|舞台|伴奏/);
    }
    if (seen.has('deep:setback') && seen.has('light:surprise')) break;
  }
  assert.ok(seen.has('deep:setback'));
  assert.ok(seen.has('light:surprise'));
});

test('投入事件存档、结果存档和整局重放保留成本、叙述与随机位置，封顶显示实际变化', () => {
  let state = game.createGame({ nickname: '重放测试', seed: 'investment-replay' });
  state = game.executeAction(state, 'study').state;
  state = game.executeAction(state, 'study').state;
  assert.equal(state.pendingEvent.id, 'military1');
  state = roundtrip(state);
  const result = game.submitEventChoice(state, 'join', { investment: 26 });
  state = roundtrip(result.state);
  const replayed = game.replay({ nickname: state.nickname, seed: state.rng.seed,
    commands: state.history.map(entry => ({ ...entry.command, commandId: entry.commandId })) });
  assert.equal(replayed.ok, true, replayed.reason);
  assert.deepEqual(replayed.state, state);
  const capped = pending('campusDiscussion');
  capped.preparation = 100;
  capped.social = 99;
  const outcome = game.submitEventChoice(capped, 'discuss', { investment: 20 });
  assert.equal(outcome.changes.preparation, 0);
  assert.ok(outcome.changes.social <= 1);
  const invalid = structuredClone(state);
  invalid.eventHistory.at(-1).investment.amount = -1;
  assert.equal(game.validateState(invalid).ok, false);
  const mismatch = structuredClone(state);
  mismatch.history.at(-1).command.investment = 4;
  assert.equal(game.validateState(mismatch).ok, false);
});
