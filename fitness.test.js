'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('./game.js');
const save = require('./save.js');

function actionableState(id) {
  const state = game.createGame();
  const action = game.ACTIONS[id];
  state.term = 5;
  state.preparation = action.minPreparation || 0;
  if (action.minAverage) state.courses = [{ grade: 80 }];
  if (action.kind === 'work') state.chains[action.chain] = { status: 'active', progress: 0, startedTerm: 4, deadline: 6, nextEligibleTerm: 1, reviewAfter: 4 };
  return state;
}
function pending(event, seed = 'fitness-test') {
  const state = game.createGame({ nickname: '体能测试', seed });
  return { ...state, phase: 'eventPending', pendingEvent: { id: event, term: 1, instanceId: 'daily:' + event + ':1' } };
}
function resolve(state) {
  while (state.pendingEvent) state = game.submitEventChoice(state, 'later').state;
  return state;
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
const band = energy => energy <= 0 ? 0 : energy <= 5 ? 1 : energy <= 10 ? 2 : energy <= 15 ? 3 : energy <= 20 ? 4 : 5;

test('每个行动都显式声明体能消耗：消耗精力的行动至少扣 1 点，休息与散步不扣', () => {
  for (const [id, action] of Object.entries(game.ACTIONS)) {
    assert.ok(Number.isInteger(action.fitnessCost) && action.fitnessCost >= 0, id);
    assert.equal(action.fitnessCost, band(action.energy), id);
  }
  assert.equal(game.ACTIONS.rest.fitnessCost, 0);
  assert.equal(game.ACTIONS.walk.fitnessCost, 0);
  assert.equal(game.ACTIONS.study.fitnessCost, 3);
  assert.equal(game.ACTIONS.work.fitnessCost, 4);
});

test('每个事件选项都显式声明体能消耗，按有效精力分档，并保留零消耗出口', () => {
  let total = 0;
  for (const [id, event] of Object.entries(game.EVENTS)) {
    assert.ok(event.choices.some(choice => choice.fitnessCost === 0), id + ' 缺少零体能出口');
    for (const choice of event.choices) {
      total++;
      assert.ok(Number.isInteger(choice.fitnessCost) && choice.fitnessCost >= 0, id + ':' + choice.id);
      const profile = game.EVENT_INVESTMENTS[id + ':' + choice.id];
      const energy = profile && profile.resource === 'energy' ? profile.default : (choice.energy || 0);
      assert.equal(choice.fitnessCost, band(energy), id + ':' + choice.id);
    }
  }
  assert.equal(total, 110);
  assert.equal(game.EVENTS.military1.choices.find(choice => choice.id === 'join').fitnessCost, 4);
  assert.equal(game.EVENTS.night.choices.find(choice => choice.id === 'join').fitnessCost, 1);
  assert.equal(game.EVENTS.military2.choices.every(choice => choice.fitnessCost === 0), true);
});

test('执行行动按声明扣除体能；锻炼、体检、休息、散步的恢复量大于消耗', () => {
  const plain = ['study', 'tutoring', 'selfStudy', 'furtherStudy', 'work', 'jobPreparation', 'chat', 'applyProject', 'projectWork', 'applyClub', 'clubWork', 'applyInternship', 'internshipWork', 'sickVisit', 'alumniVolunteer', 'show'];
  for (const id of plain) {
    const state = { ...actionableState(id), fitness: 50 };
    const result = game.executeAction(state, id);
    assert.equal(result.ok, true, id + ': ' + result.reason);
    assert.equal(result.changes.fitness, -game.getAction(state, id).fitnessCost, id);
  }
  for (const id of ['exercise', 'checkup', 'rest', 'walk', 'gym', 'teamSport', 'soloSport']) {
    const state = { ...actionableState(id), fitness: 50 };
    const action = game.getAction(state, id);
    const result = game.executeAction(state, id);
    assert.equal(result.ok, true, id + ': ' + result.reason);
    assert.ok(result.changes.fitness > 0, id);
    if (id === 'rest' || id === 'walk') assert.equal(action.fitnessCost, 0);
  }
});

test('体能不足时拒绝行动：不扣费、不写历史、不推进随机数', () => {
  const state = { ...actionableState('study'), fitness: 2 };
  const before = structuredClone(state);
  const result = game.executeAction(state, 'study');
  assert.equal(result.ok, false);
  assert.equal(result.reason, '体能不够：需要 3，现在剩 2');
  assert.strictEqual(result.state, state);
  assert.deepEqual(state, before);
  assert.equal(state.rng.calls, before.rng.calls);
});

test('体能不足时拒绝事件选项，同一事件的零消耗出口仍可继续', () => {
  const state = { ...pending('fitnessTest'), fitness: 1 };
  const before = structuredClone(state);
  const rejected = game.submitEventChoice(state, 'participate');
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, '体能不够：需要 2，现在剩 1');
  assert.strictEqual(rejected.state, state);
  assert.deepEqual(state, before);
  const later = game.submitEventChoice(state, 'later');
  assert.equal(later.ok, true, later.reason);
  assert.equal(later.state.fitness, 1);
  assert.equal(later.state.pendingEvent, null);
});

test('NPC 聊天不消耗体能，体能 0 时仍可正常对话', () => {
  const state = { ...game.createGame(), fitness: 0 };
  const result = game.chatWithNpc(state, { identityId: 'senior', quality: 2 });
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.changes.fitness, 0);
  assert.equal(result.state.fitness, 0);
  assert.equal(Object.hasOwn(game.NPC_CHAT, 'fitnessCost'), false);
  assert.equal(game.previewChanges(state, { energy: 1 }).fitness, 0);
});

test('恢复奖励的期望值：休息/散步 5/7/8，锻炼 9/13，健身房 13/23/30，多人 7/10，单人 6/8/10', () => {
  const state = game.createGame();
  for (const [id, amounts, expected] of [['rest', [1, 2, 3], [5, 7, 8]], ['walk', [1, 2, 3], [5, 7, 8]], ['exercise', [10, 25], [9, 13]], ['gym', [20, 50, 100], [13, 23, 30]], ['teamSport', [15, 30], [7, 10]], ['soloSport', [1, 2, 3], [6, 8, 10]]]) {
    for (const [index, amount] of amounts.entries()) {
      const preview = game.previewActionInvestment(state, id, amount);
      assert.equal(preview.ok, true, id + ':' + amount);
      assert.equal(preview.effect.fitness, expected[index], id + ':' + amount);
      if (id === 'rest' || id === 'walk') assert.equal(preview.effect.fitnessCost, 0);
    }
  }
});

test('投入档位不改变体能消耗，事件结果合并后也只扣一次', () => {
  const state = game.createGame();
  for (const amount of [5, 15, 30]) assert.equal(game.previewActionInvestment(state, 'study', amount).effect.fitnessCost, 3);
  for (const amount of [20, 50, 100]) assert.equal(game.previewActionInvestment(state, 'gym', amount).effect.fitnessCost, 3);
  for (const amount of [15, 30]) assert.equal(game.previewActionInvestment(state, 'teamSport', amount).effect.fitnessCost, 3);
  for (const amount of [1, 2, 3]) assert.equal(game.previewActionInvestment(state, 'soloSport', amount).effect.fitnessCost, 1);
  for (const amount of [10, 18, 26]) assert.equal(game.previewEventInvestment(pending('military1'), 'join', amount).effect.fitnessCost, 4);
  const pass = game.executeAction({ ...game.createGame(), term: 3, fitness: 66 }, 'study').state;
  const pendingState = game.executeAction(pass, 'study').state;
  assert.equal(pendingState.pendingEvent.id, 'fitnessTest');
  const result = game.submitEventChoice(pendingState, 'participate');
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.changes.fitness, -2);
  assert.deepEqual(result.state.experiences, [{ term: 3, type: 'fitnessTest', fitness: 60 }]);
});

test('体能消耗可保存、读档并随整局历史精确重放', () => {
  let state = game.createGame({ nickname: '重放体能', seed: 'fitness-replay' });
  for (const id of ['exercise', 'study', 'rest', 'walk', 'gym']) {
    const result = game.executeAction(resolve(state), id);
    assert.equal(result.ok, true, id + ': ' + result.reason);
    state = resolve(result.state);
  }
  const restored = roundtrip(state);
  const replayed = game.replay({ nickname: state.nickname, seed: state.rng.seed, commands: state.history.map(entry => ({ ...entry.command, commandId: entry.commandId })) });
  assert.equal(replayed.ok, true, replayed.reason);
  assert.deepEqual(replayed.state, state);
  assert.deepEqual(restored, state);
});
