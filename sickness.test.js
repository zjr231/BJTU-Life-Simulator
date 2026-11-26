'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('./game.js');
const save = require('./save.js');

function actionableState(id) {
  const state = game.createGame();
  const action = game.ACTIONS[id];
  state.term = 5;
  if (action.sickOnly) state.fitness = 24;
  state.preparation = action.minPreparation || 0;
  if (action.minAverage) state.courses = [{ grade: 80 }];
  if (action.kind === 'work') state.chains[action.chain] = { status: 'active', progress: 0, startedTerm: 4, deadline: 6, nextEligibleTerm: 1, reviewAfter: 4 };
  return state;
}
function pending(event, fitness = 50) {
  const state = game.createGame({ nickname: '生病测试', seed: 'sickness-test' });
  return { ...state, fitness, phase: 'eventPending', pendingEvent: { id: event, term: 1, instanceId: 'daily:' + event + ':1' } };
}
function roundtrip(state) {
  const values = new Map();
  const service = save.createSlotService({ getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) });
  assert.equal(service.save(state, 1).ok, true);
  const loaded = service.load(1);
  assert.equal(loaded.ok, true, loaded.reason);
  assert.deepEqual(loaded.state, state);
  return loaded.state;
}
const at = fitness => ({ ...game.createGame(), fitness });

test('体能挡位边界与中性挡位不改变数值', () => {
  for (const [value, id] of [[0, 'sick'], [24, 'sick'], [25, 'weak'], [44, 'weak'], [45, 'normal'], [64, 'normal'], [65, 'good'], [84, 'good'], [85, 'excellent'], [100, 'excellent']]) {
    assert.equal(game.fitnessTier(value).id, id, String(value));
  }
  const effect = { energy: 10, fitnessCost: 2, preparation: 5, social: 3, mood: -4, fitness: -2, time: 1, money: 20, income: 100, recovery: 10 };
  assert.deepEqual(game.fitnessAdjustedEffect(at(50), effect, 'study'), effect);
});

test('虚弱挡位缩放精力/体能消耗与正向属性，其他数值不动', () => {
  const effect = { energy: 10, fitnessCost: 2, preparation: 5, social: 3, mood: -4, fitness: -2, time: 1, money: 20, income: 100, recovery: 10 };
  const adjusted = game.fitnessAdjustedEffect(at(44), effect, 'study');
  assert.equal(adjusted.energy, 13);
  assert.equal(adjusted.fitnessCost, 3);
  assert.equal(adjusted.preparation, 4);
  assert.equal(adjusted.social, 2);
  assert.equal(adjusted.mood, -4);
  assert.equal(adjusted.fitness, -2);
  assert.equal(adjusted.time, 1);
  assert.equal(adjusted.money, 20);
  assert.equal(adjusted.income, 100);
  assert.equal(adjusted.recovery, 10);
});

test('课程学习的成本与收益随体能挡位变化', () => {
  for (const [fitness, energy, fitnessCost, preparation] of [[44, 19, 4, 15], [50, 15, 3, 20], [66, 13, 3, 23], [85, 11, 2, 26]]) {
    const preview = game.previewActionInvestment(at(fitness), 'study', 15);
    assert.equal(preview.effect.energy, energy, 'fitness ' + fitness);
    assert.equal(preview.effect.fitnessCost, fitnessCost, 'fitness ' + fitness);
    assert.equal(preview.effect.preparation, preparation, 'fitness ' + fitness);
  }
});

test('锻炼与医疗行动完全豁免体能系数', () => {
  const ids = ['exercise', 'gym', 'teamSport', 'soloSport', 'walk', 'rest', 'checkup', 'sickVisit'];
  for (const id of ids) {
    for (const amount of game.ACTION_INVESTMENTS[id].tiers.map(tier => tier.amount)) {
      const normal = game.previewActionInvestment(at(50), id, amount).effect;
      const weak = game.previewActionInvestment(at(44), id, amount).effect;
      const excellent = game.previewActionInvestment(at(85), id, amount).effect;
      assert.deepEqual(weak, normal, id + ':' + amount);
      assert.deepEqual(excellent, normal, id + ':' + amount);
    }
  }
  const treatmentNormal = game.fitnessAdjustedEffect(at(50), game.getAction(at(50), 'treatment'), 'treatment');
  const treatmentWeak = game.fitnessAdjustedEffect(at(44), game.getAction(at(44), 'treatment'), 'treatment');
  assert.deepEqual(treatmentWeak, treatmentNormal);
});

test('NPC 聊天不参与系数缩放，但生病时被拦截', () => {
  const weak = game.chatWithNpc(at(25), { identityId: 'senior', quality: 2 });
  const normal = game.chatWithNpc(at(50), { identityId: 'senior', quality: 2 });
  assert.equal(weak.ok, true);
  assert.equal(normal.ok, true);
  for (const key of ['energy', 'time', 'social', 'mood', 'preparation', 'fitness']) assert.equal(weak.changes[key], normal.changes[key], key);
  const sick = at(24);
  const blocked = game.chatWithNpc(sick, { identityId: 'senior', quality: 2 });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, game.ILLNESS_REASON);
  assert.strictEqual(blocked.state, sick);
});

test('生病时除校医院就诊外所有行动被锁定', () => {
  for (const id of Object.keys(game.ACTIONS)) {
    const state = { ...actionableState(id), fitness: 24 };
    const result = game.executeAction(state, id);
    if (id === 'treatment') {
      assert.equal(result.ok, true, id + ': ' + result.reason);
      assert.equal(result.state.fitness, 25);
    } else {
      assert.equal(result.ok, false, id);
      assert.equal(result.reason, game.ILLNESS_REASON, id);
      assert.strictEqual(result.state, state, id);
    }
  }
});

test('生病时仍可结束学期，生病状态跨学期保留', () => {
  const sick = { ...game.createGame(), fitness: 24 };
  const settled = game.endTerm(sick);
  assert.equal(settled.ok, true, settled.reason);
  const next = game.continueGame(settled.state);
  assert.equal(next.ok, true, next.reason);
  assert.equal(game.isSick(next.state), true);
  assert.equal(next.state.fitness, 24);
});

test('校医院就诊收费 20 元、恢复到 25，余额不足按现有余额支付', () => {
  const paid = game.executeAction({ ...actionableState('treatment'), fitness: 24, money: 20, time: 5 }, 'treatment');
  assert.equal(paid.ok, true, paid.reason);
  assert.equal(paid.changes.time, -1);
  assert.equal(paid.changes.money, -20);
  assert.equal(paid.changes.fitness, 1);
  assert.equal(paid.state.fitness, 25);
  const broke = game.executeAction({ ...actionableState('treatment'), fitness: 10, money: 0, time: 5 }, 'treatment');
  assert.equal(broke.ok, true, broke.reason);
  assert.equal(broke.changes.money, 0);
  assert.equal(broke.changes.fitness, 15);
  assert.equal(broke.state.fitness, 25);
  const partial = game.executeAction({ ...actionableState('treatment'), fitness: 10, money: 5, time: 5 }, 'treatment');
  assert.equal(partial.ok, true, partial.reason);
  assert.equal(partial.changes.money, -5);
  const healthy = game.executeAction({ ...actionableState('treatment'), fitness: 50, time: 5 }, 'treatment');
  assert.equal(healthy.ok, false);
  assert.equal(healthy.reason, '现在身体没有不适，不需要就诊');
});

test('生病时待处理事件只能先去校医院，记录全零且可存档重放', () => {
  const state = pending('fitnessTest', 1);
  for (const choice of ['participate', 'later']) {
    const rejected = game.submitEventChoice(state, choice);
    assert.equal(rejected.ok, false);
    assert.equal(rejected.reason, game.ILLNESS_REASON);
    assert.strictEqual(rejected.state, state);
  }
  const calls = state.rng.calls;
  const result = game.submitEventChoice(state, game.SICK_LEAVE_ID);
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.state.pendingEvent, null);
  assert.equal(result.state.eventFlags['daily:fitnessTest:1'], true);
  assert.equal(result.state.eventHistory.at(-1).choice, game.SICK_LEAVE_ID);
  assert.equal(result.state.rng.calls, calls);
  assert.equal(Object.values(result.changes).every(value => value === 0), true);
  const loaded = roundtrip(result.state);
  assert.equal(game.validateState(loaded).ok, true);
  const healthy = game.submitEventChoice(pending('fitnessTest', 50), game.SICK_LEAVE_ID);
  assert.equal(healthy.ok, false);
  assert.equal(healthy.reason, '现在不需要去校医院');
});

test('投资记录同时保存原始档位与实际消耗、缩放后的体能消耗', () => {
  const state = { ...actionableState('study'), fitness: 44 };
  const action = game.executeAction(state, 'study', { investment: 15 });
  assert.equal(action.ok, true, action.reason);
  assert.equal(action.entry.command.investment, 15);
  assert.equal(action.entry.investment.amount, 15);
  assert.equal(action.entry.investment.spent, 19);
  assert.equal(action.entry.fitnessCost, 4);
  assert.equal(action.changes.energy, -19);
  assert.equal(action.changes.fitness, -4);

  const eventState = pending('campusDiscussion', 44);
  const event = game.submitEventChoice(eventState, 'discuss', { investment: 5 });
  assert.equal(event.ok, true, event.reason);
  assert.equal(event.entry.command.investment, 5);
  assert.equal(event.entry.investment.amount, 5);
  assert.equal(event.entry.investment.spent, 6);
  assert.equal(event.entry.fitnessCost, 1);
  assert.equal(event.changes.energy, -6);
  assert.equal(game.validateState(event.state).ok, true);
});
