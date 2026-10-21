'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('./game.js');
const save = require('./save.js');
const { EVENTS, RANDOM_POOL } = require('./config.js');

function roundtrip(state) {
  assert.equal(game.validateState(state).ok, true);
  const data = new Map();
  const service = save.createSlotService({ getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) });
  assert.equal(service.save(state, 2).ok, true);
  const loaded = service.load(2);
  assert.equal(loaded.ok, true);
  assert.deepEqual(loaded.state, state);
  return loaded.state;
}
function resolve(state, choices = {}) {
  while (state.pendingEvent) {
    state = roundtrip(state);
    const event = state.pendingEvent.id;
    const result = game.submitEventChoice(state, choices[event] || 'later');
    assert.equal(result.ok, true, event + ': ' + result.reason);
    state = result.state;
  }
  return state;
}
function study(state, choices = {}) {
  const result = game.executeAction(resolve(state, choices), 'study');
  assert.equal(result.ok, true, result.reason);
  return resolve(result.state, choices);
}
function nextTerm(state, choices = {}) {
  const settled = game.endTerm(resolve(state, choices));
  assert.equal(settled.ok, true, settled.reason);
  const continued = game.continueGame(roundtrip(settled.state));
  assert.equal(continued.ok, true, continued.reason);
  return resolve(continued.state, choices);
}

test('军训和歌手多阶段链可经存档连续完成，经历与奖励不重复', () => {
  const choices = { military1: 'join', military2: 'perform', singer1: 'signup', singer2: 'advance', singer3: 'perform' };
  let state = game.createGame({ seed: 'new-events' });
  state = study(study(state, choices), choices);
  assert.deepEqual(state.experiences.map(item => item.type), ['military', 'singer']);
  for (const id of Object.keys(choices)) assert.equal(state.eventHistory.filter(item => item.event === id).length, 1, id);
  const rested = game.executeAction(roundtrip(state), 'rest');
  assert.equal(rested.ok, true);
  state = resolve(rested.state, choices);
  assert.equal(state.experiences.length, 2);
  for (const id of Object.keys(choices)) assert.equal(state.eventHistory.filter(item => item.event === id).length, 1, id);
});

test('返乡链跨三个学期推进，存档恢复后顺序与一次性经历保持正确', () => {
  const choices = { ticket1: 'buy', ticket2: 'board', ticket3: 'share' };
  let state = game.createGame({ seed: 'trip-events' });
  state = study(study(state, choices), choices);
  state = nextTerm(state, choices);
  state = study(study(state, choices), choices);
  state = nextTerm(state, choices);
  assert.deepEqual(state.eventHistory.filter(item => /^ticket/.test(item.event)).map(item => [item.event, item.term]),
    [['ticket1', 1], ['ticket2', 2], ['ticket3', 3]]);
  state = study(study(state, choices), choices);
  state = nextTerm(state, choices);
  assert.equal(roundtrip(state).experiences.filter(item => item.type === 'trip').length, 1);
  assert.equal(state.eventHistory.filter(item => /^ticket/.test(item.event)).length, 3);
});

test('固定通知与竞赛在规定学期出现，八学期后可正常毕业', () => {
  const choices = { contest1: 'join', contest2: 'compete' };
  let state = game.createGame({ seed: 'fixed-events' });
  for (let term = 1; term <= 8; term++) {
    assert.equal(state.term, term);
    state = study(study(state, choices), choices);
    state = nextTerm(state, choices);
  }
  assert.equal(state.phase, 'endingChoice');
  for (const [event, term] of [['transfer', 3], ['contest1', 5], ['contest2', 5], ['seminar', 6], ['graduation', 8]]) {
    assert.deepEqual(state.eventHistory.filter(item => item.event === event).map(item => item.term), [term]);
  }
  assert.equal(state.experiences.filter(item => item.type === 'contest').length, 1);
  const finished = game.chooseEnding(roundtrip(state), 'ordinary');
  assert.equal(finished.ok, true, finished.reason);
  assert.equal(roundtrip(finished.state).phase, 'finished');
});

test('随机日常池的季节筛选和每学期单次抽取在各事件上均可用', () => {
  const observed = { autumn: new Set(), spring: new Set() };
  for (let seed = 0; seed < 512; seed++) {
    for (const season of ['autumn', 'spring']) {
      let state = game.createGame({ seed: 'pool-' + seed });
      if (season === 'spring') state = nextTerm(state);
      const calls = state.rng.calls;
      const first = game.executeAction(state, 'selfStudy');
      assert.equal(first.ok, true);
      assert.equal(first.state.rng.calls, calls + 1);
      if (first.state.pendingEvent) {
        const id = first.state.pendingEvent.id;
        assert.ok(RANDOM_POOL.includes(id), id);
        assert.ok(!EVENTS[id].season || EVENTS[id].season === season);
        observed[season].add(id);
      }
      state = resolve(first.state);
      const second = game.executeAction(state, 'selfStudy');
      assert.equal(second.ok, true);
      assert.equal(second.state.rng.calls, calls + 1);
    }
  }
  for (const season of ['autumn', 'spring']) {
    assert.deepEqual([...observed[season]].sort(), RANDOM_POOL.filter(id => !EVENTS[id].season || EVENTS[id].season === season).sort());
  }
});
