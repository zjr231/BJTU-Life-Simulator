'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('./game.js');
const saves = require('./save.js');

function roundtrip(state) {
  const data = new Map();
  const store = saves.createSlotService({ getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) });
  const stored = store.save(state, 1);
  assert.equal(stored.ok, true, stored.reason);
  const loaded = store.load(1);
  assert.equal(loaded.ok, true, loaded.reason);
  assert.deepEqual(loaded.state, state);
  return loaded.state;
}
function step(result) {
  assert.equal(result.ok, true, result.reason);
  return roundtrip(result.state);
}

test('选课、投入、连续军训、考试与次学期选课共同运行，保存和整局重放一致', () => {
  let state = game.createGame({ nickname: '整合验收', seed: 1 });
  const select = current => game.coursesForTerm(current.term, current.background.id, current.background.major).slice(0, 3).map(course => course.id);
  state = step(game.selectCourses(state, select(state)));
  state = step(game.executeAction(state, 'study', { investment: 15 }));
  state = step(game.executeAction(state, 'study', { investment: 15 }));
  assert.equal(state.pendingEvent.id, 'military1');
  state = step(game.submitEventChoice(state, 'join', { investment: 18 }));
  assert.equal(state.pendingEvent.id, 'military2');
  assert.equal(game.beginExam(state).ok, false);
  state = step(game.submitEventChoice(state, 'perform'));
  assert.equal(state.experiences.filter(item => item.type === 'military').length, 1);
  state = step(game.beginExam(state));
  assert.equal(state.phase, 'examPending');
  assert.equal(game.executeAction(state, 'study').ok, false);
  state = step(game.submitExam(state, state.exam.questions.map(question => question.answer)));
  assert.equal(state.summary.grade, Math.round(state.preparation * 0.4 + 60));
  state = step(game.continueGame(state));
  while (state.pendingEvent) state = step(game.submitEventChoice(state, 'later'));
  state = step(game.selectCourses(state, select(state)));
  const replayed = game.replay({ nickname: state.nickname, seed: state.rng.seed, commands: state.history.map(entry => ({ ...entry.command, commandId: entry.commandId })) });
  assert.equal(replayed.ok, true, replayed.reason);
  assert.deepEqual(replayed.state, state);
});

test('保留主分支的三种毕业方向与全部专业、NPC、登录及在线对话模块', () => {
  const state = game.createGame();
  assert.deepEqual(game.evaluateEndings(state).options.filter(option => option.id !== 'notQualified').map(option => option.id), ['ordinary', 'furtherStudy', 'employment']);
  assert.equal(game.BACKGROUNDS.reduce((sum, background) => sum + background.majors.length, 0), 12);
  assert.equal(Object.keys(game.SUBJECTS).length, 21);
  assert.ok(require('./sms.js'));
  assert.ok(require('./npc.js'));
  assert.ok(require('./scripts/deepseek-relay.js'));
  assert.ok(game.AI_CHAT.relay);
  assert.equal(Object.hasOwn(state, 'relationships'), false);
  assert.equal(Object.hasOwn(state, 'semesterGoal'), false);
});

test('旧主分支军训选项 ID 保留校验，已接受训练的旧档会免费续接汇演', () => {
  for (const choice of ['tug', 'choir']) {
    let state = game.createGame({ seed: 1 });
    state = step(game.executeAction(state, 'study'));
    state = step(game.executeAction(state, 'study'));
    state = step(game.submitEventChoice(state, choice));
    assert.equal(state.pendingEvent.id, 'military2');
    const before = { time: state.time, energy: state.energy, money: state.money };
    state = step(game.submitEventChoice(state, 'perform'));
    assert.deepEqual({ time: state.time, energy: state.energy, money: state.money }, before);
    assert.equal(state.experiences.filter(item => item.type === 'military').length, 1);
  }
});

test('转专业后仍可读取原学院自习优惠的历史投入记录', () => {
  let state = game.createGame({ nickname: '转专业验收', seed: 5 });
  assert.equal(state.background.id, 'information');
  for (let term = 1; term <= 3; term++) {
    const plan = term === 1 ? [['selfStudy'], ['study'], ['study'], ['tutoring', 240]]
      : term === 2 ? [['study'], ['study'], ['study'], ['tutoring', 240]] : [['rest']];
    for (const [id, investment] of plan) {
      state = step(game.executeAction(state, id, { investment }));
      while (state.pendingEvent) {
        const event = state.pendingEvent.id;
        state = step(game.submitEventChoice(state, event === 'transfer' ? 'apply' : event === 'transferResult' ? 'check' : 'later'));
      }
    }
    if (term < 3) state = step(game.continueGame(step(game.endTerm(state))));
  }
  assert.notEqual(state.background.id, 'information');
  assert.equal(state.history.find(entry => entry.action === 'selfStudy').investment.amount, 9);
  roundtrip(state);
});
