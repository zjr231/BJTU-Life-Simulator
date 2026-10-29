'use strict';
// Run explicitly: node --test qa/event-trigger-audit.cjs
// Synthetic fixtures isolate rule boundaries; existing integration tests cover
// legal full-game histories, save validation, and browser coordination.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const game = require('../game.js');
const config = require('../config.js');
const random = require('../rng.js');
const reached = new Set();

function controlledGame(number) {
  const sandbox = { module: { exports: {} }, require(id) {
    if (id === './config.js') return config;
    if (id === './rng.js') return { ...random, draw(rng) {
      return { number, rng: random.draw(rng).rng };
    } };
    throw new Error('Unexpected dependency: ' + id);
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../game.js'), 'utf8'), sandbox);
  return sandbox.module.exports;
}
const miss = controlledGame(0.9);
function instance(id, term) {
  return { id, term, instanceId: (config.EVENTS[id].chain || 'daily') + ':' + id + ':' + term };
}
function historyChoice(event, choice, term) {
  return { event, choice, term, command: { operation: 'submitEventChoice' } };
}
function isolated(target, term, elapsed) {
  const rule = config.CAMPUS_SCHEDULE[target] || {};
  const blocked = Object.keys(config.CAMPUS_SCHEDULE).filter(id => id !== target && id !== rule.unless);
  const state = { ...game.createGame({ seed: 'event-audit' }), term,
    // The rest action below consumes one time unit before trigger evaluation.
    time: 13 - elapsed, energy: 70, mood: 70, fitness: 70,
    eventHistory: blocked.map(event => ({ event, choice: 'later', term })),
    history: [{ term, command: { operation: 'executeAction' } }],
    eventFlags: { ['randomCampusRoll:' + term]: true } };
  if (rule.after) {
    const [event, choice, ago] = rule.after;
    state.eventHistory.push({ event, choice, term: term - ago });
    if (!ago) state.history.push(historyChoice(event, choice, term));
  }
  return state;
}
function triggered(state, id, engine = miss, action = 'rest') {
  const before = structuredClone(state);
  const result = engine.executeAction(state, action);
  assert.equal(result.ok, true, result.reason);
  assert.deepEqual(state, before, 'trigger evaluation must not mutate its input');
  const actual = result.state.pendingEvent?.id;
  if (actual === id) reached.add(id);
  return { match: actual === id, state: result.state };
}

// Explicit expected windows, independently listed rather than inferred from config.
const windows = [
  ['military1', 1, 2, 4], ['military2', 1, 2, 7],
  ['singer1', 3, 4, 7], ['singer2', 3, 2, 12], ['singer3', 3, 2, 12],
  ['ticket1', 3, 9, 12], ['ticket2', 4, 1, 4], ['ticket3', 4, 2, 6],
  ['contest1', 5, 4, 7], ['contest2', 5, 2, 12],
  ['transfer', 3, 4, 7], ['seminar', 6, 4, 7], ['graduation', 8, 9, 12]
];
for (const [id, term, min, max] of windows) {
  test('时间窗口、学期及前置选择：' + id, () => {
    for (const elapsed of new Set([min, max])) {
      assert.equal(triggered(isolated(id, term, elapsed), id).match, true, 'inclusive boundary ' + elapsed);
    }
    const rule = config.CAMPUS_SCHEDULE[id];
    if (rule.minElapsed) assert.equal(triggered(isolated(id, term, min - 1), id).match, false);
    if (max < 12) assert.equal(triggered(isolated(id, term, max + 1), id).match, false);
    const wrongTerm = rule.terms ? (term === 1 ? 2 : 1) : (term % 2 ? term + 1 : term - 1);
    assert.equal(triggered(isolated(id, wrongTerm, min), id).match, false, 'wrong semester/season');
    if (rule.after) {
      const missing = isolated(id, term, min);
      missing.eventHistory = missing.eventHistory.filter(e => e.event !== rule.after[0]);
      missing.history = missing.history.filter(e => e.event !== rule.after[0]);
      assert.equal(triggered(missing, id).match, false, 'missing prerequisite');
      const declined = isolated(id, term, min);
      declined.eventHistory = declined.eventHistory.map(e => e.event === rule.after[0] ? { ...e, choice: 'later' } : e);
      assert.equal(triggered(declined, id).match, false, 'declined prerequisite');
    }
    const repeated = isolated(id, term, min);
    repeated.eventHistory.push({ event: id, choice: 'later', term });
    repeated.eventFlags[instance(id, term).instanceId] = true;
    assert.equal(triggered(repeated, id).match, false, 'must not repeat in same semester');
  });
}

test('军训至少两次普通行动；后续校园节点不能由处理选项连弹', () => {
  const early = isolated('military1', 1, 2);
  early.history = [];
  assert.equal(triggered(early, 'military1').match, false);
  for (const [first, choice, next, term, elapsed] of [
    ['military1', 'join', 'military2', 1, 2],
    ['singer1', 'signup', 'singer2', 3, 4],
    ['singer2', 'advance', 'singer3', 3, 4],
    ['ticket2', 'board', 'ticket3', 4, 1],
    ['contest1', 'join', 'contest2', 5, 4]
  ]) {
    const pending = isolated(next, term, elapsed);
    pending.history = [];
    pending.eventHistory = pending.eventHistory.filter(e => e.event !== first);
    pending.pendingEvent = instance(first, term);
    pending.phase = 'eventPending';
    const resolved = miss.submitEventChoice(pending, choice);
    assert.equal(resolved.ok, true, resolved.reason);
    assert.equal(resolved.state.pendingEvent, null, next + ' must wait for an action');
  }
});

test('条件事件：心情29/30、体能59/60、偶数学期与行动场景', () => {
  for (const [mood, expected] of [[32, true], [33, false]]) {
    const state = isolated('roommateCare', 2, 2);
    state.time = 12;
    state.mood = mood;
    assert.equal(triggered(state, 'roommateCare', miss, 'study').match, expected);
  }
  for (const [term, fitness, expected] of [[2, 53, false], [2, 54, true], [1, 70, false]]) {
    const state = isolated('fitnessTest', term, 1);
    state.fitness = fitness;
    assert.equal(triggered(state, 'fitnessTest', miss, 'exercise').match, expected);
  }
  assert.equal(triggered(isolated('fitnessTest', 2, 1), 'fitnessTest', miss, 'walk').match, false);
});

test('补考只检查紧邻的上一学期，59/60及非相邻记录边界', () => {
  for (const [courseTerm, grade, expected] of [[1, 59, true], [1, 60, false], [0, 59, false]]) {
    const state = isolated('retake', 2, 1);
    state.courses = [{ term: courseTerm, grade, passed: grade >= 60 }];
    assert.equal(triggered(state, 'retake').match, expected);
  }
});

for (const [chain, term, preparation, average] of [
  ['project', 2, 40, 60], ['club', 1, 0, 60], ['internship', 5, 0, 60]
]) {
  test('主动申请和两次投入后的确认：' + chain, () => {
    const action = 'apply' + chain[0].toUpperCase() + chain.slice(1);
    const state = isolated(chain + 'Offer', term, 1);
    state.preparation = preparation;
    state.courses = [{ term: term - 1, grade: average, passed: true }];
    assert.equal(triggered(state, chain + 'Offer', miss, action).match, true);
    const review = isolated(chain + 'Review', term, 2);
    review.chains[chain] = { ...review.chains[chain], status: 'active', progress: 1,
      startedTerm: Math.max(1, term - 1), reviewAfter: term, deadline: term + 1 };
    assert.equal(triggered(review, chain + 'Review').match, false);
    review.chains[chain].progress = 2;
    if (chain === 'club') review.term = 2;
    assert.equal(triggered(review, chain + 'Review').match, true);
    if (chain !== 'internship') {
      review.chains[chain].startedTerm = review.term;
      assert.equal(triggered(review, chain + 'Review').match, false, 'project/club require a later term');
    }
    review.chains[chain].status = 'completed';
    assert.equal(triggered(review, chain + 'Review').match, false);
    assert.equal(miss.executeAction(review, action).ok, false);
    if (chain === 'project') {
      state.preparation = 39;
      assert.equal(miss.executeAction(state, action).ok, false);
      state.preparation = 40;
      for (const wrong of [1, 7]) assert.equal(miss.executeAction({ ...state, term: wrong }, action).ok, false);
    } else if (chain === 'club') {
      for (const wrong of [2, 7]) assert.equal(miss.executeAction({ ...state, term: wrong }, action).ok, false);
    } else {
      state.courses[0].grade = 59;
      assert.equal(miss.executeAction(state, action).ok, false);
      state.courses[0].grade = 60;
      for (const wrong of [4, 8]) assert.equal(miss.executeAction({ ...state, term: wrong }, action).ok, false);
    }
  });
}

// Lists below encode the expected scene pools explicitly.
const pools = [
  [2, 2, 'selfStudy', ['campusDiscussion', 'cat', 'canteen', 'card', 'wall', 'seat']],
  [3, 9, 'walk', ['cat', 'canteen', 'card', 'snow']],
  [3, 6, 'chat', ['canteen', 'wall', 'parcel', 'night', 'flu', 'insomnia']],
  [2, 2, 'exercise', ['canteen', 'card', 'injury']],
  [2, 9, 'show', ['lecture', 'drama']],
  [2, 2, 'alumniVolunteer', ['alumniStory', 'frontDesk']]
];
for (const [term, elapsed, action, pool] of pools) {
  for (const [index, id] of pool.entries()) {
    test('随机事件可达且仅消耗一次随机数：' + id + '/' + action, () => {
      const state = isolated('', term, elapsed);
      state.time = 12 - elapsed + config.ACTIONS[action].time;
      state.fitness = 0;
      state.eventFlags = {};
      const engine = controlledGame(0.35 * (index + 0.5) / pool.length);
      const result = triggered(state, id, engine, action);
      assert.equal(result.match, true);
      assert.equal(result.state.rng.calls, state.rng.calls + 1);
      assert.equal(result.state.eventFlags['randomCampusRoll:' + term], true);
    });
  }
}

test('35%概率的精确边界：0命中，0.35不命中，失败后当学期不再抽取', () => {
  for (const [number, hit] of [[0, true], [0.3499999999, true], [0.35, false], [0.9999999999, false]]) {
    const engine = controlledGame(number);
    const state = isolated('', 2, 2);
    state.time = 12;
    state.eventFlags = {};
    const first = engine.executeAction(state, 'selfStudy');
    assert.equal(first.ok, true);
    assert.equal(Boolean(first.state.pendingEvent), hit);
    assert.equal(first.state.rng.calls, state.rng.calls + 1);
    const clear = first.state.pendingEvent ? engine.submitEventChoice(first.state, 'later').state : first.state;
    const second = engine.executeAction(clear, 'walk');
    assert.equal(second.ok, true);
    assert.equal(second.state.rng.calls, state.rng.calls + 1);
    assert.equal(second.state.pendingEvent, null);
  }
});

test('随机机会：不匹配场景及固定事件占用时不抽取；预览不消耗随机数', () => {
  const state = game.createGame({ seed: 'audit-pool' });
  const one = game.executeAction(state, 'study').state;
  assert.equal(one.rng.calls, state.rng.calls);
  const two = game.executeAction(one, 'study').state;
  assert.equal(two.pendingEvent.id, 'military1');
  assert.equal(two.rng.calls, state.rng.calls);
  const before = structuredClone(two.rng);
  game.previewSettlement(two);
  game.availability(two, 'walk');
  game.eventAvailability(two, 'later');
  assert.deepEqual(two.rng, before);
});

test('特殊日常窗口前后：初雪8/9、快递5/6、流感3/4、毕业大戏8/9', () => {
  for (const [id, term, action, min] of [
    ['snow', 3, 'walk', 9], ['parcel', 3, 'chat', 6],
    ['flu', 3, 'chat', 4], ['drama', 2, 'show', 9]
  ]) {
    function possible(atTerm, elapsed) {
      const found = new Set();
      for (let i = 0; i < 120; i++) {
        const state = isolated('', atTerm, elapsed);
        state.time = 12 - elapsed + config.ACTIONS[action].time;
        state.eventFlags = {};
        const result = controlledGame((i + 0.5) / 120 * 0.35).executeAction(state, action);
        assert.equal(result.ok, true);
        if (result.state.pendingEvent) found.add(result.state.pendingEvent.id);
      }
      return found.has(id);
    }
    assert.equal(possible(term, min - 1), false, id + ' before boundary');
    assert.equal(possible(term, min), true, id + ' at boundary');
    assert.equal(possible(term + 1, min), false, id + ' wrong season');
  }
});

test('全部38个事件均有零资源退出路径；付费选项资源不足不改变状态', () => {
  for (const [id, event] of Object.entries(config.EVENTS)) {
    const state = isolated('', 2, 1);
    Object.assign(state, { time: 0, energy: 0, money: 0, phase: 'eventPending', pendingEvent: instance(id, 2) });
    assert.ok(event.choices.some(choice => game.eventAvailability(state, choice.id).ok), id + ' needs an exit');
    for (const choice of event.choices.filter(choice => choice.time || choice.energy || choice.money)) {
      const before = structuredClone(state);
      assert.equal(game.submitEventChoice(state, choice.id).ok, false, id + ':' + choice.id);
      assert.deepEqual(state, before);
    }
  }
});

test('所有事件选项的时间、精力、钱包恰好足够及各差1边界；大四下禁止延期', () => {
  for (const [id, event] of Object.entries(config.EVENTS)) {
    for (const choice of event.choices) {
      const state = isolated('', 2, 1);
      Object.assign(state, { time: choice.time || 0, energy: choice.energy || 0,
        money: choice.money || 0, phase: 'eventPending', pendingEvent: instance(id, 2) });
      const exact = game.submitEventChoice(state, choice.id);
      assert.equal(exact.ok, true, id + ':' + choice.id + ' exactly sufficient');
      for (const key of ['time', 'energy', 'money'].filter(key => choice[key] > 0)) {
        const short = { ...state, [key]: choice[key] - 1 };
        const before = structuredClone(short);
        assert.equal(game.submitEventChoice(short, choice.id).ok, false, id + ':' + choice.id + '/' + key);
        assert.deepEqual(short, before);
      }
      if (choice.chainEffect === 'postpone') {
        const lastTerm = { ...state, term: 8, pendingEvent: instance(id, 8) };
        assert.equal(game.submitEventChoice(lastTerm, choice.id).ok, false);
        assert.equal(game.submitEventChoice(lastTerm, 'abandon').ok, true);
      }
    }
  }
});

test('触发覆盖核对：全部38个节点至少各有一个正例', () => {
  assert.deepEqual([...reached].sort(), Object.keys(config.EVENTS).sort());
});
