'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('./game.js');

function actionableState(id) {
  const state = game.createGame();
  const action = game.ACTIONS[id];
  state.term = 5;
  state.preparation = action.minPreparation || 0;
  if (action.minAverage) state.courses = [{ grade: 80 }];
  if (action.kind === 'work') state.chains[action.chain] = { status: 'active', progress: 0, startedTerm: 4, deadline: 6, nextEligibleTerm: 1, reviewAfter: 4 };
  return state;
}
test('未知行动不会修改状态，包括对象原型上的名字', () => {
  const state = game.createGame();
  const before = structuredClone(state);
  for (const id of ['missing', '__proto__', 'constructor', 'toString', null]) {
    const result = game.executeAction(state, id);
    assert.equal(result.ok, false);
    assert.equal(result.reason, '未知行动');
    assert.strictEqual(result.state, state);
  }
  assert.deepEqual(state, before);
});

test('同样的投入与随机条件获得同样的课程回报，不受剩余精力影响且不修改输入', () => {
  let reward;
  for (const energy of [15, 80, 100]) {
    const state = { ...game.createGame(), time: 2, energy };
    const before = structuredClone(state);
    const result = game.executeAction(state, 'study');
    assert.equal(result.ok, true);
    if (reward === undefined) reward = result.state.preparation;
    assert.equal(result.state.preparation, reward);
    assert.ok(reward > 0);
    assert.equal(result.state.energy, energy - 15);
    assert.equal(result.state.time, 0);
    assert.deepEqual(state, before);
  }
});
test('每个行动的资源边界：刚好满足可执行，任一资源不足不扣费', () => {
  for (const id of Object.keys(game.ACTIONS)) {
    const initial = actionableState(id);
    const action = game.getAction(initial, id);
    const state = { ...initial, time: action.time, energy: action.energy, money: action.money };
    assert.equal(game.executeAction(state, id).ok, true, id);
    for (const [key, cost] of [['time', action.time], ['energy', action.energy], ['money', action.money]]) {
      if (!cost) continue;
      const insufficient = { ...state, [key]: cost - 1 };
      const before = structuredClone(insufficient);
      const result = game.executeAction(insufficient, id);
      assert.equal(result.ok, false, `${id}: ${key}`);
      assert.strictEqual(result.state, insufficient);
      assert.deepEqual(insufficient, before);
    }
  }
});
test('收益上限和已满状态，休息不能增加学期时间', () => {
  const rest = game.executeAction({ ...game.createGame(), energy: 95 }, 'rest');
  assert.equal(rest.state.energy, 100);
  assert.equal(rest.changes.energy, 5);
  assert.equal(rest.state.time, 11);
  assert.equal(game.executeAction(rest.state, 'rest').ok, true);
  assert.equal(game.executeAction({ ...rest.state, mood: 100 }, 'rest').ok, false);
  const study = game.executeAction({ ...game.createGame(), preparation: 95 }, 'study');
  assert.equal(study.state.preparation, 100);
  assert.equal(study.changes.preparation, 5);
  assert.equal(game.executeAction(study.state, 'tutoring').ok, false);
});
test('各行动次数限制阻止刷取，学期切换后清空', () => {
  for (const [id, action] of Object.entries(game.ACTIONS)) {
    if (!action.limit) continue;
    const state = { ...actionableState(id), counts: { [id]: action.limit } };
    assert.equal(game.executeAction(state, id).ok, false);
    let next = game.continueGame(game.endTerm(state).state).state;
    while (next.pendingEvent) next = game.submitEventChoice(next, 'later').state;
    assert.equal(game.executeAction(next, id).ok, true);
  }
});
test('结算预览不修改状态，成绩不跨学期累加，资源仅扣一次', () => {
  let state = game.createGame();
  for (const id of ['study', 'study', 'work', 'chat']) {
    state = game.executeAction(state, id).state;
    while (state.pendingEvent) state = game.submitEventChoice(state, 'later').state;
  }
  const before = structuredClone(state);
  const preview = game.previewSettlement(state);
  assert.deepEqual(state, before);
  assert.equal(preview.grade, Math.round(40 + state.preparation * 0.6));
  assert.equal(preview.passed, true);
  const settled = game.endTerm(state).state;
  assert.equal(settled.money, state.money - 300);
  assert.equal(settled.courses.length, 1);
  assert.equal(game.endTerm(settled).ok, false);
  assert.equal(game.executeAction(settled, 'work').ok, false);
  const next = game.continueGame(settled).state;
  assert.equal(next.term, 2);
  assert.equal(next.time, 12);
  assert.equal(next.energy, 80);
  assert.equal(next.preparation, 0);
  assert.deepEqual(next.counts, {});
  assert.equal(next.social, state.social);
  assert.equal(next.fitness, state.fitness);
  assert.equal(next.mood, state.mood);
  assert.equal(next.money, settled.money);
  assert.deepEqual(next.courses, settled.courses);
  assert.equal(game.previewSettlement(next).grade, 40);
});
test('零时间、零精力、无资金仍可结算：援助刚好补足支出', () => {
  for (const money of [0, 299, 300, 301]) {
    const state = { ...game.createGame(), money, time: 0, energy: 0 };
    const result = game.endTerm(state);
    assert.equal(result.ok, true);
    assert.equal(result.summary.aid, Math.max(0, 300 - money));
    assert.equal(result.state.money, Math.max(0, money - 300));
    assert.equal(game.continueGame(result.state).state.term, 2);
  }
});
test('成绩阈值及满准备', () => {
  for (const [preparation, grade, passed] of [[0, 40, false], [32, 59, false], [33, 60, true], [100, 100, true]]) {
    const result = game.previewSettlement({ ...game.createGame(), preparation });
    assert.equal(result.grade, grade);
    assert.equal(result.passed, passed);
  }
});
test('连续八学期完整流程，第八学期只结算一次，不创建第九学期', () => {
  let state = game.createGame();
  for (let term = 1; term <= 8; term++) {
    assert.equal(state.term, term);
    // Include long-term growth, recovery and the optional semester event.
    for (const id of ['study', 'study', 'work', 'rest', 'chat', 'walk', 'exercise']) {
      const result = game.executeAction(state, id);
      assert.equal(result.ok, true, `term ${term}: ${id}`);
      state = result.state;
      while (state.pendingEvent) {
        const eventId = state.pendingEvent.id;
        const choice = { fitnessTest: 'participate', fitnessRetest: 'participate' }[eventId] || 'later';
        const eventResult = game.submitEventChoice(state, choice);
        assert.equal(eventResult.ok, true, `term ${term}: ${eventId}`);
        state = eventResult.state;
      }
    }
    state = game.endTerm(state).state;
    assert.equal(state.courses.length, term);
    state = game.continueGame(state).state;
  }
  assert.equal(state.term, 8);
  assert.equal(state.phase, 'endingChoice');
  assert.equal(game.chooseEnding(state, 'furtherStudy').ok, false);
  state = game.chooseEnding(state, 'ordinary').state;
  assert.equal(state.phase, 'finished');
  assert.equal(state.courses.length, 8);
  assert.ok(state.social > 20 && state.social <= 100);
  assert.ok(state.fitness > 50 && state.fitness <= 100);
  assert.ok(state.mood >= 70 && state.mood <= 100);
  assert.equal(state.experiences.length, 3);
  assert.equal(state.experiences.every((item) => item.type === 'fitnessTest'), true);
  assert.equal(state.courses.every((course) => course.grade === Math.round(40 + course.preparation * 0.6)), true);
  assert.equal(game.endTerm(state).ok, false);
  assert.equal(game.continueGame(state).ok, false);
  assert.equal(game.executeAction(state, 'rest').ok, false);
});

test('初始五项属性，成绩由记录生成，科研不进入原型', () => {
  const state = game.createGame();
  assert.equal(state.social, 20);
  assert.equal(state.fitness, 50);
  assert.equal(state.mood, 70);
  assert.equal(state.money, 1000);
  assert.equal(state.courses.length, 0);
  assert.equal(state.preparation, 0);
  assert.equal(Object.hasOwn(state, 'research'), false);
  assert.equal(state.pendingEvent, null);
});

test('锻炼消耗精力并提升长期体能，散步恢复心情与精力但不恢复时间', () => {
  const initial = game.createGame();
  const exercise = game.executeAction(initial, 'exercise');
  assert.equal(exercise.state.time, 11);
  assert.equal(exercise.state.energy, 70);
  assert.ok(exercise.state.fitness > initial.fitness);
  assert.ok(exercise.state.mood > initial.mood);
  const walk = game.executeAction(exercise.state, 'walk');
  assert.equal(walk.state.time, 10);
  assert.ok(walk.state.energy > exercise.state.energy);
  assert.equal(walk.state.fitness, exercise.state.fitness);
  assert.ok(walk.state.mood > exercise.state.mood);
  assert.deepEqual(initial, game.createGame());
});

test('体能、社交、心情上限与心情下限都截断为实际变化', () => {
  const exercise = game.executeAction({ ...game.createGame(), fitness: 98, mood: 99 }, 'exercise');
  assert.equal(exercise.state.fitness, 100);
  assert.equal(exercise.state.mood, 100);
  assert.equal(exercise.changes.fitness, 2);
  assert.equal(exercise.changes.mood, 1);
  const chat = game.executeAction({ ...game.createGame(), social: 99, mood: 99 }, 'chat');
  assert.equal(chat.state.social, 100);
  assert.equal(chat.state.mood, 100);
  assert.equal(chat.changes.social, 1);
  assert.equal(chat.changes.mood, 1);
  const exhausted = game.executeAction({ ...game.createGame(), mood: 1 }, 'study');
  assert.equal(exhausted.state.mood, 0);
  assert.equal(exhausted.changes.mood, -1);
  assert.equal(exhausted.state.pendingEvent.id, 'roommateCare');
});

test('心情严格低于 30 才触发，事件阻止其他行动与结算', () => {
  assert.equal(game.executeAction({ ...game.createGame(), mood: 33 }, 'study').state.pendingEvent, null);
  const pending = game.executeAction({ ...game.createGame(), mood: 32 }, 'study').state;
  assert.equal(pending.mood, 29);
  assert.equal(pending.pendingEvent.id, 'roommateCare');
  const before = structuredClone(pending);
  assert.equal(game.executeAction(pending, 'walk').ok, false);
  assert.equal(game.endTerm(pending).ok, false);
  assert.deepEqual(pending, before);
  const result = game.submitEventChoice(pending, 'talk');
  assert.equal(result.ok, true);
  assert.equal(result.state.time, 9);
  assert.equal(result.state.mood, 44);
  assert.equal(result.state.social, 23);
  assert.equal(result.state.pendingEvent, null);
  assert.deepEqual(result.state.eventQueue, []);
  assert.deepEqual(pending, before);
  assert.equal(game.submitEventChoice(result.state, 'talk').ok, false);
});

test('事件选项资源不足不扣费，零时间有免费选项可继续结算', () => {
  const pending = game.executeAction({ ...game.createGame(), time: 2, energy: 15, mood: 32, money: 0 }, 'study').state;
  assert.equal(pending.time, 0);
  assert.equal(pending.energy, 0);
  const before = structuredClone(pending);
  assert.equal(game.submitEventChoice(pending, 'talk').ok, false);
  assert.equal(game.submitEventChoice(pending, 'missing').ok, false);
  assert.deepEqual(pending, before);
  const declined = game.submitEventChoice(pending, 'later');
  assert.equal(declined.ok, true);
  assert.equal(declined.state.mood, 29);
  assert.equal(declined.state.pendingEvent, null);
  let cleared = declined.state;
  while (cleared.pendingEvent) cleared = game.submitEventChoice(cleared, 'later').state;
  const next = game.continueGame(game.endTerm(cleared).state).state;
  assert.equal(next.term, 2);
  assert.equal(next.pendingEvent.id, 'roommateCare');
  assert.equal(next.eventFlags['daily:roommateCare:1'], true);
});

test('同一低心情事件每学期至多一次，变化与历史没有重复奖励', () => {
  const pending = game.executeAction({ ...game.createGame(), mood: 32 }, 'study').state;
  let resolved = game.submitEventChoice(pending, 'later').state;
  while (resolved.pendingEvent) resolved = game.submitEventChoice(resolved, 'later').state;
  const action = game.executeAction(resolved, 'study');
  assert.equal(action.ok, true);
  assert.equal(action.state.mood, 26);
  assert.equal(action.state.pendingEvent.id, 'military1');
  assert.deepEqual(action.state.eventQueue, []);
  assert.equal(action.state.eventHistory.filter((entry) => entry.event === 'roommateCare').length, 1);
  assert.equal(action.state.history.filter((entry) => entry.command.operation === 'executeAction').length, 2);
});

test('体测为秋季学期全员主测：第 3/5/7 学期任意行动触发，春季锻炼不再触发', () => {
  const springExercise = game.executeAction({ ...game.createGame(), term: 2, fitness: 70 }, 'exercise');
  assert.equal(springExercise.state.pendingEvent, null);
  const tooEarly = game.executeAction({ ...game.createGame(), term: 3 }, 'study');
  assert.equal(tooEarly.state.pendingEvent, null);
  const pending = game.executeAction(tooEarly.state, 'study').state;
  assert.equal(pending.pendingEvent.id, 'fitnessTest');
  assert.equal(pending.term, 3);
});

test('体测达标留经历并记成绩；未达标标记春季补测', () => {
  const pass = game.executeAction({ ...game.createGame(), term: 3, fitness: 60 }, 'study').state;
  const passAgain = game.executeAction(pass, 'study').state;
  assert.equal(passAgain.pendingEvent.id, 'fitnessTest');
  const passed = game.submitEventChoice(passAgain, 'participate');
  assert.equal(passed.ok, true);
  assert.deepEqual(passed.state.experiences, [{ term: 3, type: 'fitnessTest', fitness: 60 }]);
  assert.equal(passed.state.eventFlags.fitnessRetest, undefined);
  const fail = game.executeAction({ ...game.createGame(), term: 3, fitness: 59 }, 'study').state;
  const failPending = game.executeAction(fail, 'study').state;
  assert.equal(failPending.pendingEvent.id, 'fitnessTest');
  const failed = game.submitEventChoice(failPending, 'participate');
  assert.equal(failed.ok, true);
  assert.equal(failed.state.experiences.length, 0);
  assert.equal(failed.state.eventFlags.fitnessRetest, true);
});

test('体测请假直接标记补测，心情略受影响', () => {
  const state = game.executeAction({ ...game.createGame(), term: 3 }, 'study').state;
  const pending = game.executeAction(state, 'study').state;
  assert.equal(pending.pendingEvent.id, 'fitnessTest');
  const result = game.submitEventChoice(pending, 'later');
  assert.equal(result.ok, true);
  assert.equal(result.state.eventFlags.fitnessRetest, true);
  assert.equal(result.state.mood, 61);
  assert.equal(result.state.experiences.length, 0);
});

test('春季补测按标记触发：通过清标记留经历，未通过保留标记明年再测', () => {
  const base = { ...game.createGame(), term: 4, eventFlags: { fitnessRetest: true } };
  const pending = game.executeAction(base, 'study').state;
  assert.equal(pending.pendingEvent.id, 'fitnessRetest');
  const passed = game.submitEventChoice({ ...pending, fitness: 60 }, 'participate');
  assert.equal(passed.ok, true);
  assert.deepEqual(passed.state.experiences, [{ term: 4, type: 'fitnessTest', fitness: 60 }]);
  assert.equal(passed.state.eventFlags.fitnessRetest, undefined);
  const failed = game.submitEventChoice({ ...pending, fitness: 59 }, 'participate');
  assert.equal(failed.ok, true);
  assert.equal(failed.state.experiences.length, 0);
  assert.equal(failed.state.eventFlags.fitnessRetest, true);
  assert.equal(game.executeAction(failed.state, 'rest').state.pendingEvent, null);
});

test('低心情与体测条件同时满足时，依次处理，不遗漏或提前结算', () => {
  const pending = game.executeAction({ ...game.createGame(), term: 3, mood: 20 }, 'study').state;
  assert.equal(pending.pendingEvent.id, 'roommateCare');
  const second = game.submitEventChoice(pending, 'later').state;
  const secondPending = game.executeAction(second, 'study').state;
  assert.equal(secondPending.pendingEvent.id, 'fitnessTest');
  assert.equal(game.endTerm(secondPending).ok, false);
  const finished = game.submitEventChoice(secondPending, 'later').state;
  assert.equal(finished.pendingEvent, null);
  assert.equal(finished.eventHistory.length, 2);
  assert.equal(finished.experiences.length, 0);
  assert.equal(finished.eventFlags.fitnessRetest, true);
  assert.equal(game.endTerm(finished).ok, true);
});

test('体测选项精力不足或时间不足时保留事件且提供免费退出', () => {
  for (const [time, energy] of [[0, 0], [1, 0], [0, 10]]) {
    const state = { ...game.createGame(), term: 3, time, energy, phase: 'eventPending', pendingEvent: { id: 'fitnessTest', term: 3, instanceId: 'daily:fitnessTest:3' } };
    const before = structuredClone(state);
    assert.equal(game.submitEventChoice(state, 'participate').ok, false);
    assert.deepEqual(state, before);
    const declined = game.submitEventChoice(state, 'later');
    assert.equal(declined.ok, true);
    assert.equal(declined.state.eventFlags.fitnessRetest, true);
  }
});

test('转专业结果按平均成绩判定：达标换学院背景并留经历，未达标明年可再试', () => {
  // 走真实流程：第 2 学期学习触发转专业通知并递交申请，第 3 学期初公示结果。
  const play = (studiesPerTerm, checkChoice) => {
    let state = game.createGame();
    for (let term = 1; term <= 3; term++) {
      const actions = term === 3 ? ['rest'] : studiesPerTerm === 4 ? ['study', 'study', 'study', 'tutoring'] : Array(studiesPerTerm).fill('study');
      for (const id of actions) {
        const action = game.executeAction(state, id, id === 'tutoring' ? { investment: 240 } : {});
        assert.equal(action.ok, true, action.reason);
        state = action.state;
        while (state.pendingEvent) {
          const eventId = state.pendingEvent.id;
          const choice = eventId === 'transfer' ? 'apply' : eventId === 'transferResult' ? checkChoice : 'later';
          const result = game.submitEventChoice(state, choice);
          assert.equal(result.ok, true, `term ${term}: ${eventId}`);
          state = result.state;
        }
      }
      if (term < 3) state = game.continueGame(game.endTerm(state).state).state;
    }
    return state;
  };
  const original = game.createGame().background;
  const passed = play(4, 'check');
  assert.notEqual(passed.background.id, original.id);
  assert.deepEqual(passed.experiences, [{ term: 3, type: 'transfer' }]);
  assert.equal(game.validateState(passed).ok, true);
  const failed = play(3, 'check');
  assert.equal(failed.background.id, original.id);
  assert.equal(failed.experiences.length, 0);
  const skipped = play(4, 'later');
  assert.equal(skipped.background.id, original.id);
  assert.equal(skipped.experiences.length, 0);
});

test('运动会：短跑按体能出结果，趣味项目保底，观众席免费', () => {
  let state = { ...game.createGame(), term: 2 };
  for (let index = 0; index < 3; index++) state = game.executeAction(state, 'rest').state;
  const pending = game.executeAction(state, 'work').state;
  assert.equal(pending.pendingEvent.id, 'sportsMeet');
  assert.equal(pending.mood, 74);
  const sprintPass = game.submitEventChoice({ ...pending, fitness: 60 }, 'sprint');
  assert.equal(sprintPass.ok, true);
  assert.deepEqual(sprintPass.state.experiences, [{ term: 2, type: 'sportsMeet' }]);
  assert.equal(sprintPass.state.mood, 86);
  const sprintFail = game.submitEventChoice({ ...pending, fitness: 50 }, 'sprint');
  assert.equal(sprintFail.ok, true);
  assert.equal(sprintFail.state.experiences.length, 0);
  assert.equal(sprintFail.state.mood, 76);
  const fun = game.submitEventChoice(pending, 'fun');
  assert.equal(fun.ok, true);
  assert.equal(fun.state.mood, 80);
  assert.deepEqual(fun.state.experiences, [{ term: 2, type: 'sportsMeet' }]);
  const audience = game.submitEventChoice(pending, 'later');
  assert.equal(audience.ok, true);
  assert.equal(audience.state.mood, 77);
  assert.equal(audience.state.experiences.length, 0);
});
