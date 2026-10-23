'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('./game.js');
const saves = require('./save.js');

function checked(result) {
  assert.equal(result.ok, true, result.reason);
  const valid = game.validateState(result.state);
  assert.equal(valid.ok, true, valid.reason);
  return result.state;
}
function resolve(state, storyChoices = {}) {
  while (state.pendingEvent) {
    const id = state.pendingEvent.id;
    const choice = storyChoices[id] || (id.endsWith('Offer') ? 'accept' : id.endsWith('Review') ? 'complete' : 'later');
    state = checked(game.submitEventChoice(state, choice));
  }
  return state;
}
function act(state, id, choices) { return resolve(checked(game.executeAction(resolve(state, choices), id)), choices); }
function nextTerm(state, choices) { return resolve(checked(game.continueGame(checked(game.endTerm(resolve(state, choices))))), choices); }
function memory() {
  const data = new Map();
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}
function roundtrip(state) {
  const storage = memory();
  const service = saves.createSlotService(storage);
  assert.equal(service.save(state, 3).ok, true);
  const loaded = service.load(3);
  assert.equal(loaded.ok, true, loaded.reason);
  assert.deepEqual(loaded.state, state);
  return loaded.state;
}
function replay(state) {
  const result = game.replay({ nickname: state.nickname, seed: state.rng.seed, commands: state.history.map(entry => ({ ...entry.command, commandId: entry.commandId })) });
  assert.equal(result.ok, true, result.reason);
  assert.deepEqual(result.state, state);
}

test('目标每学期只能选一次，未知、重复、过期及事件中选择均不修改输入', () => {
  const initial = game.createGame();
  const before = structuredClone(initial);
  for (const id of ['missing', '__proto__', 'constructor']) assert.equal(game.chooseGoal(initial, id).ok, false);
  assert.equal(game.chooseGoal(initial, 'scholar', { expectedRevision: 1 }).ok, false);
  const chosen = checked(game.chooseGoal(initial, 'scholar', { commandId: 'first' }));
  assert.deepEqual(initial, before);
  assert.equal(game.chooseGoal(chosen, 'practice').ok, false);
  assert.equal(game.chooseGoal(chosen, 'scholar', { commandId: 'first' }).ok, false);
  const pending = game.executeAction(initial, 'applyClub').state;
  assert.equal(game.chooseGoal(pending, 'community').ok, false);
  const next = nextTerm(chosen);
  assert.equal(next.semesterGoal, null);
  assert.equal(checked(game.chooseGoal(next, 'practice')).semesterGoal.id, 'practice');
});

const goalSchedules = {
  scholar: ['study', 'study', 'study', 'study'],
  community: ['chat', 'chat'],
  practice: ['work', 'work'],
  wellbeing: ['exercise'],
  explore: ['study', 'chat', 'exercise', 'walk']
};
for (const [id, schedule] of Object.entries(goalSchedules)) {
  test('目标 ' + id + '：真实行动完成、预览一致、结算只奖励一次并能读档重放', () => {
    let state = checked(game.chooseGoal(game.createGame({ seed: 'goals' }), id));
    for (const action of schedule) state = act(state, action);
    assert.equal(game.evaluateGoal(state).completed, true);
    const before = structuredClone(state);
    const preview = game.previewSettlement(state);
    assert.deepEqual(state, before);
    assert.deepEqual(game.previewSettlement(state), preview);
    const expected = game.previewChanges(state, game.GOALS[id].reward);
    const settled = checked(game.endTerm(roundtrip(state)));
    for (const key of Object.keys(game.GOALS[id].reward)) assert.equal(settled[key], state[key] + expected[key]);
    assert.deepEqual(settled.summary, preview);
    assert.deepEqual(settled.goalHistory, [preview.goal]);
    assert.equal(game.endTerm(settled).ok, false);
    replay(roundtrip(settled));
    const continued = nextTerm(state);
    assert.equal(continued.goalHistory.length, 1);
    assert.equal(continued.semesterGoal, null);
  });
  test('目标 ' + id + '：未完成时零奖励，下一学期重新计数', () => {
    const state = checked(game.chooseGoal(game.createGame(), id));
    const goal = game.evaluateGoal(state);
    assert.equal(goal.completed, false);
    assert.deepEqual(goal.reward, {});
    const settled = checked(game.endTerm(state));
    for (const key of Object.keys(game.GOALS[id].reward)) assert.equal(settled[key], state[key]);
    assert.equal(settled.summary.goal.completed, false);
    const next = nextTerm(state);
    assert.deepEqual(next.counts, {});
    assert.equal(next.goalHistory[0].completed, false);
  });
}

test('目标奖励遵守属性上限；照顾自己须以结算时状态为准', () => {
  let state = checked(game.chooseGoal(game.createGame(), 'wellbeing'));
  state = act(state, 'exercise');
  assert.equal(game.evaluateGoal(state).completed, true);
  state.mood = 69;
  assert.equal(game.evaluateGoal(state).completed, false);
  const incomplete = checked(game.endTerm(state));
  assert.equal(incomplete.mood, 69);
  assert.equal(incomplete.fitness, state.fitness);
  state.mood = 99; state.fitness = 99;
  const capped = checked(game.endTerm(state));
  assert.equal(capped.mood, 100);
  assert.equal(capped.fitness, 100);
});

test('关系变化上下限、输入不变；一般属性已满仍可与室友增进关系', () => {
  const initial = game.createGame();
  initial.relationships.roommate = 98; initial.social = 100; initial.mood = 100;
  const before = structuredClone(initial);
  assert.equal(game.availability(initial, 'chat').ok, true);
  const after = checked(game.executeAction(initial, 'chat'));
  assert.equal(after.relationships.roommate, 100);
  assert.deepEqual(initial, before);
  after.relationships.roommate = 1; after.mood = 29;
  const pending = checked(game.executeAction(after, 'study'));
  assert.equal(pending.pendingEvent.id, 'roommateCare');
  const declined = checked(game.submitEventChoice(pending, 'later'));
  assert.equal(declined.relationships.roommate, 0);
});

test('室友专属事件：门槛以下不触发，接受后永久留档、拒绝有关系成本', () => {
  let state = game.createGame({ seed: 'relationships' });
  state = nextTerm(state);
  state = act(state, 'study');
  assert.equal(state.eventHistory.some(e => e.event === 'roommateTrip'), false);
  let close = game.createGame({ seed: 'relationships' });
  close = act(act(close, 'chat'), 'chat');
  close = nextTerm(close);
  const pending = checked(game.executeAction(close, 'study'));
  assert.equal(pending.pendingEvent.id, 'roommateTrip');
  const accepted = checked(game.submitEventChoice(roundtrip(pending), 'go'));
  assert.equal(accepted.storyFlags.roommateTrip, true);
  assert.equal(accepted.relationships.roommate, 55);
  assert.equal(accepted.experiences.filter(e => e.type === 'roommateTrip').length, 1);
  const declined = checked(game.submitEventChoice(pending, 'later'));
  assert.equal(declined.relationships.roommate, 41);
  assert.equal(declined.storyFlags.roommateTrip, false);
  assert.equal(declined.experiences.some(e => e.type === 'roommateTrip'), false);
  replay(roundtrip(accepted));
  let later = nextTerm(nextTerm(accepted));
  later = act(later, 'study', { roommateTrip: 'go' });
  assert.equal(later.eventHistory.filter(e => e.event === 'roommateTrip').length, 1);
  assert.equal(later.experiences.filter(e => e.type === 'roommateTrip').length, 1);
  const noTime = structuredClone(pending); noTime.time = 0;
  assert.equal(game.submitEventChoice(noTime, 'go').ok, false);
  assert.equal(game.submitEventChoice(noTime, 'later').ok, true);
});

function route(kind) {
  let state = game.createGame({ nickname: '新玩法路线', seed: 'new-endings' });
  const choices = { mentorReferral: 'accept', clubLeadership: 'lead', roommateTrip: 'go', fitnessTest: 'participate' };
  for (let term = 1; term <= 8; term++) {
    state = checked(game.chooseGoal(resolve(state, choices), kind === 'campusLeader' ? 'community' : kind === 'balanced' ? 'wellbeing' : 'scholar'));
    const schedule = kind === 'innovator' ? ['study', 'study', 'study'] : ['study', 'study'];
    if (kind === 'campusLeader' && term === 1) schedule.push('applyClub', 'clubWork', 'clubWork');
    if (kind === 'campusLeader' && [3, 5].includes(term)) schedule.push('chat', 'chat');
    if (kind === 'balanced' && term <= 3) schedule.push('exercise', 'exercise');
    if (kind === 'innovator' && term === 2) schedule.push('applyProject', 'projectWork', 'projectWork');
    for (const action of schedule) state = act(state, action, choices);
    state = nextTerm(roundtrip(state), choices);
  }
  return state;
}
for (const id of ['campusLeader', 'balanced', 'innovator']) {
  test('新增结局 ' + id + ' 通过八学期真实行动可达，缺少关键条件则不开放', () => {
    const state = route(id);
    const option = state.endingOptions.options.find(item => item.id === id);
    assert.equal(option.available, true, JSON.stringify(option));
    assert.equal(state.endingOptions.options.find(item => item.id === 'ordinary').available, true);
    if (id === 'campusLeader') {
      assert.equal(state.storyFlags.clubLeadership, true);
      const missing = { ...state, storyFlags: { ...state.storyFlags, clubLeadership: false } };
      assert.equal(game.evaluateEndings(missing).options.find(item => item.id === id).available, false);
    } else if (id === 'innovator') {
      assert.equal(state.storyFlags.mentorReferral, true);
      const missing = { ...state, storyFlags: { ...state.storyFlags, mentorReferral: false } };
      assert.equal(game.evaluateEndings(missing).options.find(item => item.id === id).available, false);
    } else {
      assert.equal(game.evaluateEndings({ ...state, fitness: 74 }).options.find(item => item.id === id).available, false);
      assert.equal(game.evaluateEndings({ ...state, experiences: [] }).options.find(item => item.id === id).available, false);
    }
    const finished = checked(game.chooseEnding(roundtrip(state), id));
    assert.equal(finished.result.direction, id);
    assert.equal(game.chooseEnding(finished, id).ok, false);
    replay(roundtrip(finished));
  });
}

test('新字段、目标记录、剧情标记和结局快照的损坏不会被兼容处理掩盖', () => {
  const initial = game.createGame();
  const corruptions = [
    s => { s.relationships = null; }, s => { delete s.relationships.roommate; },
    s => { s.relationships.mentor = 101; }, s => { s.storyFlags = false; },
    s => { s.goalHistory = 'broken'; }, s => { delete s.semesterGoal; }, s => { s.semesterGoal = NaN; },
    s => { s.storyFlags.mentorReferral = true; },
    s => { s.experiences.push({ type: 'clubLeadership', term: 1 }); }
  ];
  for (const change of corruptions) {
    const state = structuredClone(initial); change(state);
    assert.equal(game.validateState(state).ok, false);
  }
  const settled = game.endTerm(game.chooseGoal(initial, 'practice').state).state;
  for (const change of [
    s => { s.goalHistory = []; }, s => { s.goalHistory[0].term = 2; },
    s => { s.goalHistory[0].completed = true; }, s => { s.goalHistory[0].reward = { money: 999 }; },
    s => { s.courses[0].goal.id = 'scholar'; }
  ]) {
    const state = structuredClone(settled); change(state);
    assert.equal(game.validateState(state).ok, false);
  }
});

test('0.3.1 的五种阶段存档补齐默认字段，保留毕业结果并可继续保存', () => {
  const initial = game.createGame({ seed: 'legacy' });
  const samples = [initial, game.executeAction(initial, 'applyClub').state, game.endTerm(initial).state];
  let ending = initial;
  for (let term = 1; term <= 8; term++) ending = nextTerm(ending);
  samples.push(ending, checked(game.chooseEnding(ending, 'notQualified')));
  for (const sample of samples) {
    const legacy = structuredClone(sample);
    for (const key of ['relationships', 'storyFlags', 'semesterGoal', 'goalHistory']) delete legacy[key];
    legacy.appVersion = '0.3.1';
    for (const course of legacy.courses) delete course.goal;
    if (legacy.summary) delete legacy.summary.goal;
    if (legacy.result) for (const course of legacy.result.courses) delete course.goal;
    if (legacy.endingOptions) legacy.endingOptions.options = legacy.endingOptions.options.filter(item => !['campusLeader', 'balanced', 'innovator'].includes(item.id));
    const raw = JSON.stringify({ saveFormatVersion: 1, rulesVersion: 3, appVersion: '0.3.1', saveSequence: 1, savedAt: '2026-10-20T00:00:00.000Z', state: legacy });
    const loaded = saves.parse(raw);
    assert.equal(loaded.ok, true, loaded.reason);
    assert.deepEqual(loaded.state.relationships, initial.relationships);
    assert.equal(loaded.state.goalHistory.length, loaded.state.courses.length);
    assert.equal(loaded.state.phase, legacy.phase);
    if (legacy.result) assert.deepEqual(loaded.state.result, legacy.result);
    roundtrip(loaded.state);
    assert.equal(Object.hasOwn(legacy, 'relationships'), false);
    if (legacy.phase === 'playing') checked(game.chooseGoal(loaded.state, 'explore'));
    if (legacy.endingOptions) {
      legacy.endingOptions.average++;
      assert.equal(game.validateState(legacy).ok, false);
    }
  }
});
