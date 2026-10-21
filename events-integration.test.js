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
function act(state, id, choices = {}) {
  const result = game.executeAction(resolve(state, choices), id);
  assert.equal(result.ok, true, result.reason);
  return resolve(result.state, choices);
}
const study = (state, choices) => act(state, 'study', choices);
function nextTerm(state, choices = {}) {
  const settled = game.endTerm(resolve(state, choices));
  assert.equal(settled.ok, true, settled.reason);
  const continued = game.continueGame(roundtrip(settled.state));
  assert.equal(continued.ok, true, continued.reason);
  return resolve(continued.state, choices);
}

test('军训和歌手链在不同行动间推进，存档不重复经历或奖励', () => {
  const choices = { military1: 'join', military2: 'perform', singer1: 'signup', singer2: 'advance', singer3: 'perform' };
  let state = game.createGame({ seed: 'new-events' });
  for (let i = 0; i < 6; i++) state = act(state, 'rest', choices);
  assert.deepEqual(state.experiences.map(item => item.type), ['military', 'singer']);
  for (const id of Object.keys(choices)) assert.equal(state.eventHistory.filter(item => item.event === id).length, 1, id);
  assert.equal(game.submitEventChoice(roundtrip(state), 'perform').ok, false);
  state = nextTerm(state, choices);
  assert.equal(state.experiences.length, 2);
  for (const id of Object.keys(choices)) assert.equal(state.eventHistory.filter(item => item.event === id).length, 1, id);
});

function bookedAutumn() {
  const choices = { ticket1: 'buy', ticket2: 'board', ticket3: 'share' };
  let state = game.createGame({ seed: 'trip-events' });
  state = study(study(state, choices), choices);
  for (let i = 0; i < 5; i++) state = act(state, 'rest', choices);
  assert.equal(state.eventHistory.at(-1).event, 'ticket1');
  assert.equal(state.time, 2);
  return state;
}

test('订票在秋季末，返校与分享在下一春季初，存档后顺序仍正确', () => {
  const choices = { ticket1: 'buy', ticket2: 'board', ticket3: 'share' };
  let state = bookedAutumn();
  state = nextTerm(state, choices);
  assert.equal(state.eventHistory.at(-1).event, 'ticket2');
  assert.equal(state.eventHistory.some(item => item.event === 'ticket3'), false);
  state = study(study(state, choices), choices);
  assert.deepEqual(state.eventHistory.filter(item => /^ticket/.test(item.event)).map(item => [item.event, item.term]),
    [['ticket1', 1], ['ticket2', 2], ['ticket3', 2]]);
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
    if ([3, 5].includes(term)) for (let i = 0; i < 2; i++) state = act(state, 'rest', choices);
    if (term === 8) for (let i = 0; i < 5; i++) state = act(state, 'rest', choices);
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

test('16 种随机事件匹配场景和季节，每学期只抽取一次', () => {
  const observed = new Set();
  const scenes = {
    selfStudy: ['campusDiscussion', 'cat', 'canteen', 'card', 'wall', 'seat'],
    walk: ['cat', 'canteen', 'card', 'snow'],
    chat: ['canteen', 'wall', 'night', 'flu', 'insomnia', 'parcel'],
    exercise: ['canteen', 'card', 'injury'],
    show: ['lecture', 'drama'],
    alumniVolunteer: ['alumniStory', 'frontDesk']
  };
  for (let seed = 0; seed < 256; seed++) {
    for (const season of ['autumn', 'spring']) {
      for (const late of [false, true]) {
        for (const [action, allowed] of Object.entries(scenes)) {
          let state = game.createGame({ seed: 'pool-' + seed });
          if (season === 'spring') state = nextTerm(state);
          if (late) for (let i = 0; i < 9; i++) state = act(state, 'rest');
          const calls = state.rng.calls;
          const first = game.executeAction(state, action);
          assert.equal(first.ok, true, action);
          assert.equal(first.state.rng.calls, calls + 1);
          assert.deepEqual(first.state.eventQueue, []);
          if (first.state.pendingEvent) {
            const id = first.state.pendingEvent.id;
            assert.ok(allowed.includes(id), action + ': ' + id);
            if (['snow', 'parcel', 'flu'].includes(id)) assert.equal(season, 'autumn');
            if (id === 'drama') assert.equal(season, 'spring');
            if (['snow', 'parcel', 'flu', 'drama'].includes(id)) assert.equal(late, true);
            observed.add(id);
          }
          state = resolve(first.state);
          const followup = [action, 'walk', 'chat'].find(id => game.availability(state, id).ok);
          if (followup) assert.equal(game.executeAction(state, followup).state.rng.calls, calls + 1);
        }
      }
    }
  }
  assert.deepEqual([...observed].sort(), [...RANDOM_POOL].sort());
});

test('开局课程学习不会一次排入军训、歌手和订票四连弹', () => {
  const first = game.executeAction(game.createGame(), 'study').state;
  assert.equal(first.pendingEvent, null);
  const second = game.executeAction(first, 'study').state;
  assert.equal(second.pendingEvent.id, 'military1');
  assert.deepEqual(second.eventQueue, []);
  const joined = game.submitEventChoice(roundtrip(second), 'join').state;
  assert.equal(joined.pendingEvent, null);
  assert.deepEqual(joined.eventQueue, []);
  const nextAction = game.executeAction(joined, 'rest').state;
  assert.equal(nextAction.pendingEvent.id, 'military2');
  assert.deepEqual(nextAction.eventQueue, []);
});

test('秋季学期进入末段之前不出现订票，春季不出现寒假订票', () => {
  let state = game.createGame();
  for (let i = 0; i < 8; i++) {
    state = act(state, 'rest');
    assert.equal(state.eventHistory.some(item => item.event === 'ticket1'), false);
  }
  const late = game.executeAction(state, 'rest').state;
  assert.equal(game.getTermStage(late), '学期末');
  assert.equal(late.pendingEvent.id, 'ticket1');
  let spring = nextTerm(game.createGame());
  for (let i = 0; i < 9; i++) spring = act(spring, 'rest');
  assert.equal(spring.eventHistory.some(item => item.event === 'ticket1' && item.term === 2), false);
});

test('没有订票或未确认返校，不会凭空进入特产分享节点', () => {
  let noTicket = nextTerm(game.createGame());
  noTicket = study(study(noTicket));
  assert.equal(noTicket.eventHistory.some(item => /^ticket/.test(item.event)), false);
  const declined = nextTerm(bookedAutumn(), { ticket2: 'later' });
  assert.equal(declined.eventHistory.at(-1).choice, 'later');
  const continued = study(study(declined));
  assert.equal(continued.eventHistory.some(item => item.event === 'ticket3'), false);
  assert.equal(continued.experiences.some(item => item.type === 'trip'), false);
});

test('旧档已展示的事件可处理，尚未展示的错误校园队列按新时间线重排', () => {
  let state = game.executeAction(game.executeAction(game.createGame(), 'study').state, 'study').state;
  state = { ...state, appVersion: '0.3.0', eventQueue: ['singer1', 'ticket1'].map(id => ({ id, term: 1, instanceId: 'daily:' + id + ':1' })) };
  const before = structuredClone(state);
  const restored = roundtrip(state);
  const cleared = game.submitEventChoice(restored, 'later').state;
  assert.equal(cleared.pendingEvent, null);
  assert.deepEqual(cleared.eventQueue, []);
  assert.equal(cleared.eventHistory.length, 1);
  assert.equal(cleared.eventFlags['daily:ticket1:1'], undefined);
  assert.deepEqual(state, before);
  roundtrip(cleared);
});
