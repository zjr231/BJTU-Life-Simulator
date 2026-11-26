'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('./game.js');
const save = require('./save.js');

function memoryStorage() {
  const data = new Map();
  return { data, getItem: (key) => data.has(key) ? data.get(key) : null, setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key) };
}
function roundtrip(state) {
  const service = save.createSaveService(memoryStorage());
  const written = service.save(state);
  assert.equal(written.ok, true, written.reason);
  const loaded = service.load();
  assert.equal(loaded.ok, true, loaded.reason);
  assert.deepEqual(loaded.state, state);
  return loaded.state;
}
function cardPending() {
  const base = game.createGame({ nickname: 'card-test', seed: 'card-terminal' });
  return { ...base, phase: 'eventPending', pendingEvent: { id: 'card', term: 1, instanceId: 'daily:card:1' } };
}

test('期末考试作弊立即进入终局，保留记录并可重放', () => {
  const initial = game.createGame({ nickname: 'cheat-test', seed: 'cheat-terminal' });
  const ids = game.coursesForTerm(initial.term, initial.background.id, initial.background.major).slice(0, 3).map((course) => course.id);
  let state = game.selectCourses(initial, ids).state;
  state = game.beginExam(state).state;
  assert.equal(state.phase, 'examPending');
  assert.equal(game.cheatExam(initial).ok, false);

  const result = game.cheatExam(state);
  assert.equal(result.ok, true, result.reason);
  state = result.state;
  assert.equal(state.phase, 'ended');
  assert.equal(state.exam, null);
  assert.equal(state.selectedCourses.length, 0);
  assert.equal(state.courses.length, 0);
  assert.equal(state.result.kind, 'terminal');
  assert.equal(state.result.direction, 'cheatNote');
  assert.match(state.result.reason, /作弊/);
  assert.equal(game.validateState(state).ok, true, JSON.stringify(game.validateState(state)));
  roundtrip(state);

  const replay = game.replay({ nickname: initial.nickname, seed: initial.rng.seed, commands: state.history.map((entry) => ({ ...entry.command, commandId: entry.commandId })) });
  assert.equal(replay.ok, true, replay.reason);
  assert.equal(replay.state.phase, 'ended');
  assert.equal(replay.state.result.direction, 'cheatNote');
  assert.deepEqual(replay.state, state);
  assert.equal(game.cheatExam(state).ok, false);
});

test('捡卡后下一学期追查，归还清除标记，硬刚进入终局', () => {
  let state = game.submitEventChoice(cardPending(), 'pocket').state;
  assert.equal(state.phase, 'playing');
  assert.equal(state.eventFlags.cardPocketed, true);
  state = game.endTerm(state).state;
  state = game.continueGame(state).state;
  assert.equal(state.term, 2);
  assert.equal(state.phase, 'eventPending');
  assert.equal(state.pendingEvent.id, 'cardTrace');
  assert.equal(game.validateState(state).ok, true, JSON.stringify(game.validateState(state)));

  const safe = game.submitEventChoice(state, 'return');
  assert.equal(safe.ok, true, safe.reason);
  assert.notEqual(safe.state.phase, 'ended');
  assert.equal(safe.state.eventFlags.cardPocketed, undefined);
  assert.equal(game.validateState(safe.state).ok, true, JSON.stringify(game.validateState(safe.state)));

  const terminal = game.submitEventChoice(state, 'deny');
  assert.equal(terminal.ok, true, terminal.reason);
  assert.equal(terminal.state.phase, 'ended');
  assert.equal(terminal.state.result.direction, 'cardThief');
  assert.match(terminal.state.result.reason, /消费记录/);
  assert.equal(terminal.state.eventFlags.cardPocketed, undefined);
  assert.equal(game.validateState(terminal.state).ok, true, JSON.stringify(game.validateState(terminal.state)));
  roundtrip(terminal.state);
});

test('第 8 学期捡卡不会卡在最后一年，追查立即进入队列', () => {
  const base = game.createGame({ nickname: 'card-last', seed: 'card-last-term' });
  const state = { ...base, term: 8, phase: 'eventPending', pendingEvent: { id: 'card', term: 8, instanceId: 'daily:card:8' } };
  const pocketed = game.submitEventChoice(state, 'pocket');
  assert.equal(pocketed.ok, true, pocketed.reason);
  assert.equal(pocketed.state.phase, 'eventPending');
  assert.equal(pocketed.state.pendingEvent.id, 'cardTrace');
  const terminal = game.submitEventChoice(pocketed.state, 'run');
  assert.equal(terminal.ok, true, terminal.reason);
  assert.equal(terminal.state.phase, 'ended');
  assert.equal(terminal.state.result.direction, 'cardThief');
});

test('终局结果字段篡改会被拒绝', () => {
  const initial = game.createGame({ nickname: 'tamper-test', seed: 'tamper' });
  const ids = game.coursesForTerm(initial.term, initial.background.id, initial.background.major).slice(0, 3).map((course) => course.id);
  let state = game.selectCourses(initial, ids).state;
  state = game.beginExam(state).state;
  state = game.cheatExam(state).state;
  const broken = structuredClone(state);
  broken.result.direction = 'cardThief';
  assert.equal(game.validateState(broken).ok, false);
  const missingReason = structuredClone(state);
  missingReason.result.reason = '';
  assert.equal(game.validateState(missingReason).ok, false);
});
