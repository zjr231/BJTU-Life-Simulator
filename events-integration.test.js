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
function act(state, id, choices = {}, investment) {
  const result = game.executeAction(resolve(state, choices), id, { investment });
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

test('军训连续完成且歌手链在不同行动间推进，存档不重复经历或奖励', () => {
  const choices = { military1: 'join', military2: 'perform', singer1: 'signup', singer2: 'advance', singer3: 'perform' };
  let state = game.createGame({ seed: 'new-events' });
  for (const id of ['walk', 'walk', 'walk', 'chat', 'chat']) state = act(state, id, choices);
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
  state = act(state, 'chat', choices);
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
    if (term === 4) {
      // 新投入按实际成本安排：辅导保证本学期达标，勤工攒观演预算，散步维持下一学期心情。
      for (let i = 0; i < 3; i++) state = act(state, 'work', choices);
      state = act(state, 'tutoring', choices, 240);
      for (let i = 0; i < 2; i++) state = act(state, 'walk', choices);
    } else if (term === 5) {
      // 体测优先于竞赛招募；再打一次工让结余撑过学期结算。
      state = study(study(study(state, choices), choices), choices);
      state = act(state, 'work', choices);
    } else if (term === 6) {
      // 决赛占用两点时间：先休息处理答辩与补测，再轻量勤工补足票钱，看演出赶上宣讲会窗口。
      state = act(state, 'rest', choices);
      state = act(state, 'rest', choices);
      state = act(state, 'work', choices, 8);
      state = act(state, 'show', choices);
    } else {
      state = study(study(state, choices), choices);
    }
    if (term === 3) for (let i = 0; i < 2; i++) state = act(state, 'rest', choices);
    if (term === 8) for (let i = 0; i < 5; i++) state = act(state, 'rest', choices);
    while (state.preparation < 33 && game.availability(state, 'study').ok) state = study(state, choices);
    state = nextTerm(state, choices);
  }
  assert.equal(state.phase, 'endingChoice');
  for (const [event, term] of [['transfer', 2], ['contest1', 5], ['contest2', 6], ['seminar', 6], ['graduation', 8]]) {
    assert.deepEqual(state.eventHistory.filter(item => item.event === event).map(item => item.term), [term]);
  }
  assert.equal(state.experiences.filter(item => item.type === 'contest').length, 1);
  const finished = game.chooseEnding(roundtrip(state), 'ordinary');
  assert.equal(finished.ok, true, finished.reason);
  assert.equal(roundtrip(finished.state).phase, 'finished');
});

test('25 种随机事件匹配场景和季节，每学期只抽取一次', () => {
  const observed = new Set();
  const scenes = {
    selfStudy: ['campusDiscussion', 'cat', 'canteen', 'card', 'wall', 'seat'],
    walk: ['cat', 'canteen', 'card', 'snow', 'ginkgo'],
    chat: ['canteen', 'wall', 'night', 'flu', 'insomnia', 'parcel'],
    exercise: ['canteen', 'card', 'injury', 'hawthorn'],
    show: ['lecture', 'drama', 'memorial129'],
    alumniVolunteer: ['alumniStory', 'frontDesk', 'alumniFair'],
    study: ['rollCall'],
    tutoring: ['rollCall'],
    checkup: ['medicalInsurance'],
    sickVisit: ['medicalInsurance'],
    work: ['jobFair']
  };
  for (let seed = 0; seed < 256; seed++) {
    for (const season of ['autumn', 'spring']) {
      for (const late of [false, true]) {
        for (const [action, allowed] of Object.entries(scenes)) {
          let state = game.createGame({ seed: 'pool-' + seed });
          if (season === 'spring') state = nextTerm(state);
          // 春季运动会“观众席”会把心情顶满，散步等行动会被拒；改报短跑，并降低起始心情，
          // 避免休息同时恢复体能后短跑达标、心情直接顶满导致后续行动被判“收益已经到头”。
          if (late) state = { ...state, mood: 30 };
          if (late) for (let i = 0; i < 9; i++) state = act(state, 'rest', { sportsMeet: 'sprint' });
          const calls = state.rng.calls;
          const first = game.executeAction(state, action);
          assert.equal(first.ok, true, action + ': ' + first.reason);
          assert.equal(first.state.rng.calls, calls + (action === "show" ? 1 : 2));
          assert.deepEqual(first.state.eventQueue, []);
          if (first.state.pendingEvent) {
            const id = first.state.pendingEvent.id;
            assert.ok(allowed.includes(id), action + ': ' + id);
            if (['snow', 'parcel', 'flu', 'ginkgo', 'hawthorn', 'memorial129'].includes(id)) assert.equal(season, 'autumn');
            if (id === 'drama') assert.equal(season, 'spring');
            if (['snow', 'parcel', 'flu', 'drama', 'ginkgo', 'hawthorn', 'memorial129'].includes(id)) assert.equal(late, true);
            observed.add(id);
          }
          state = resolve(first.state);
          const followup = [action, 'walk', 'chat'].find(id => game.availability(state, id).ok);
          if (followup) assert.equal(game.executeAction(state, followup).state.rng.calls, first.state.rng.calls + (followup === "show" ? 0 : 1));
        }
      }
    }
  }
  // 项目投入与社团投入需要先激活事件链才能抽取，单独准备状态后补充验证。
  const preparedScenes = { clubWork: ['danceParty'], projectWork: ['labNight'] };
  for (let seed = 0; seed < 128; seed++) {
    for (const [action, allowed] of Object.entries(preparedScenes)) {
      let state = game.createGame({ seed: 'pool-chain-' + seed });
      if (action === 'clubWork') {
        // 社团招新后直接投入会撞上军训（本学年第 2 个行动），改到春季学期投入。
        state = nextTerm(act(state, 'applyClub', { clubOffer: 'accept' }));
      } else {
        // 项目申请要求本学期准备度 40，准备度学期末清零：第 2 学期先学习再申请，第 3 学期开学投入。
        state = nextTerm(study(study(state)));
        while (state.preparation < 40) state = study(state);
        state = act(state, 'applyProject', { projectOffer: 'accept' });
        state = nextTerm(state);
      }
      const calls = state.rng.calls;
      const first = game.executeAction(state, action);
      assert.equal(first.ok, true, action);
      assert.equal(first.state.rng.calls, calls + 2);
      if (first.state.pendingEvent) {
        assert.ok(allowed.includes(first.state.pendingEvent.id), action + ': ' + first.state.pendingEvent.id);
        observed.add(first.state.pendingEvent.id);
      }
      resolve(first.state);
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
  assert.equal(joined.pendingEvent.id, 'military2');
  assert.deepEqual(joined.eventQueue, []);
  assert.equal(game.executeAction(joined, 'rest').ok, false);
  const completed = game.submitEventChoice(joined, 'perform').state;
  assert.equal(completed.pendingEvent, null);
  assert.deepEqual(completed.eventQueue, []);
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
  const continued = act(act(declined, 'chat'), 'chat');
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
