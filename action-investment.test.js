'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('./game.js');
const random = require('./rng.js');
const saves = require('./save.js');

function actionable(id, seed = 'routine-investment') {
  const state = { ...game.createGame({ seed }), term: 5 };
  const action = game.ACTIONS[id];
  if (action.chain) state.chains[action.chain] = { status: 'active', progress: 0, startedTerm: 4, deadline: 6, nextEligibleTerm: 1, reviewAfter: 4 };
  return state;
}
function roundtrip(state) {
  const values = new Map();
  const store = saves.createSlotService({ getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) });
  const saved = store.save(state, 1);
  assert.equal(saved.ok, true, saved.reason);
  const loaded = store.load(1);
  assert.equal(loaded.ok, true, loaded.reason);
  assert.deepEqual(loaded.state, state);
  return loaded.state;
}

test('16 项日常行动支持三类资源投入，实际成本、随机回报与行动文案一致', () => {
  assert.equal(Object.keys(game.ACTION_INVESTMENTS).length, 16);
  for (const id of Object.keys(game.ACTION_INVESTMENTS)) {
    const state = actionable(id);
    const original = structuredClone(state);
    const profile = game.getActionInvestment(state, id);
    for (const amount of profile.tiers.map(tier => tier.amount)) {
      const preview = game.previewActionInvestment(state, id, amount);
      assert.equal(preview.ok, true, id);
      assert.deepEqual(state, original);
      const result = game.executeAction(state, id, { investment: amount });
      assert.equal(result.ok, true, id + ': ' + result.reason);
      const q = amount / (amount + profile.h), a = 1 + 2 * q;
      const factor = (1 - profile.s) * a / (a + 1) + profile.s * random.draw(state.rng).number ** (1 / a);
      const effect = { ...game.getAction(state, id), [profile.resource]: amount };
      effect.time = profile.tiers.find(tier => tier.amount === amount).time;
      for (const [key, ceiling] of Object.entries(profile.rewards)) effect[key] = Math.round(ceiling * q * factor);
      assert.deepEqual(result.changes, game.previewChanges(state, effect), id);
      assert.equal(result.entry.command.investment, amount);
      assert.equal(result.entry.investment.resource, profile.resource);
      assert.ok(result.entry.investment.description.includes(profile.outcomes[result.entry.investment.outcome]));
      assert.deepEqual(state, original);
    }
  }
});

test('日常投入拒绝空值、小数、越界、资源不足和重复操作，失败不扣费也不抽随机数', () => {
  for (const id of Object.keys(game.ACTION_INVESTMENTS)) {
    const state = actionable(id);
    const profile = game.getActionInvestment(state, id);
    for (const amount of [null, NaN, '5', profile.min - 1, profile.max + 1, profile.min + 0.5]) {
      const rejected = game.executeAction(state, id, { investment: amount });
      assert.equal(rejected.ok, false, id);
      assert.strictEqual(rejected.state, state);
    }
    const poor = { ...state, [profile.resource]: profile.tiers[0].amount - 1 };
    assert.equal(game.executeAction(poor, id, { investment: profile.tiers[0].amount }).ok, false, id);
    const accepted = game.executeAction(state, id, { investment: profile.tiers[0].amount, commandId: 'one-action' });
    assert.equal(accepted.ok, true);
    assert.equal(game.executeAction(accepted.state, id, { investment: profile.tiers[0].amount, commandId: 'one-action' }).ok, false);
  }
  assert.equal(game.executeAction(game.createGame(), 'applyClub', { investment: 5 }).ok, false);
});

test('背景加成作用于自习成本与项目、社团回报参数，不被可调投入覆盖', () => {
  const collected = new Map();
  for (let seed = 0; seed < 100; seed++) {
    const state = game.createGame({ seed });
    collected.set(state.background.id, state);
  }
  const information = game.getActionInvestment(collected.get('information'), 'selfStudy');
  assert.equal(information.default, 9);
  assert.equal(information.h, 9);
  assert.equal(information.max, 21);
  assert.equal(game.getActionInvestment(collected.get('engineering'), 'projectWork').rewards.preparation, 45);
  assert.equal(game.getActionInvestment(collected.get('management'), 'clubWork').rewards.social, 30);
});

test('日常结果与消耗可保存并精确重放，休息不能恢复时间，封顶仅记录实际变化', () => {
  let state = game.createGame({ nickname: '日常重放', seed: 'routine-replay' });
  state = game.executeAction(state, 'study', { investment: 30 }).state;
  state = roundtrip(state);
  while (state.pendingEvent) state = game.submitEventChoice(state, 'later').state;
  state = game.executeAction(state, 'rest', { investment: 2 }).state;
  state = roundtrip(state);
  assert.equal(state.time, 7);
  assert.ok(state.history.filter(entry => entry.command.operation === 'executeAction').every(entry => entry.investment));
  const replayed = game.replay({ nickname: state.nickname, seed: state.rng.seed,
    commands: state.history.map(entry => ({ ...entry.command, commandId: entry.commandId })) });
  assert.equal(replayed.ok, true, replayed.reason);
  assert.deepEqual(replayed.state, state);
  const capped = game.executeAction({ ...game.createGame(), energy: 99, mood: 100 }, 'rest', { investment: 3 });
  assert.equal(capped.changes.energy, 1);
  assert.equal(capped.changes.mood, 0);
  assert.equal(capped.changes.time, -3);
  const bad = structuredClone(state);
  bad.history[0].investment.amount = -1;
  assert.equal(game.validateState(bad).ok, false);
});

test('课程投入可以出现轻投入意外理解和充分投入仍卡住，结果文案与投入档次对应', () => {
  const outcomes = new Set();
  for (let seed = 0; seed < 500; seed++) {
    const state = game.createGame({ seed: 'study-story-' + seed });
    for (const amount of [5, 30]) {
      const result = game.executeAction(state, 'study', { investment: amount });
      outcomes.add(result.entry.investment.level + ':' + result.entry.investment.outcome);
      assert.match(result.entry.investment.description, /课堂|老师|例题|章节|教材|笔记|讲解/);
    }
    if (outcomes.has('light:surprise') && outcomes.has('deep:setback')) break;
  }
  assert.ok(outcomes.has('light:surprise'));
  assert.ok(outcomes.has('deep:setback'));
});
