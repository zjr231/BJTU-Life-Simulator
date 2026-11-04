'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('./game.js');
const saves = require('./save.js');

function seedFor(familyId, prefix = 'budget-route') {
  for (let i = 0; i < 500; i++) {
    const seed = prefix + '-' + i;
    if (game.familyForSeed(seed).id === familyId) return seed;
  }
  throw new Error('找不到家庭种子：' + familyId);
}
function roundtrip(state) {
  const data = new Map();
  const service = saves.createSaveService({ getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) });
  const saved = service.save(state);
  assert.equal(saved.ok, true, saved.reason);
  const loaded = service.load();
  assert.equal(loaded.ok, true, loaded.reason);
  assert.deepEqual(loaded.state, state);
  return loaded.state;
}
function resolve(state) {
  let steps = 0;
  while (state.pendingEvent) {
    assert.ok(steps++ < 10, '待处理事件没有收敛');
    const result = game.submitEventChoice(state, 'later');
    assert.equal(result.ok, true, result.reason);
    state = result.state;
  }
  return state;
}
function courseIds(state) {
  return game.coursesForTerm(state.term, state.background.id, state.background.major).slice(0, 3).map(course => course.id);
}
function pending(state, id) {
  return { ...state, phase: 'eventPending', pendingEvent: { id, term: state.term, instanceId: 'daily:' + id + ':' + state.term } };
}
const LOW = { clothing: 'minimal', food: 'minimal', housing: 'ordinaryDorm', transport: 'basic' };
const HIGH = { clothing: 'refined', food: 'gourmet', housing: 'offCampus', transport: 'basic' };

test('四维预算配置：四维独立、普通合计4800、最高8400、最低3100，行暂未完善', () => {
  const dimensions = game.BUDGET_DIMENSIONS;
  assert.deepEqual(Object.keys(dimensions), ['clothing', 'food', 'housing', 'transport']);
  assert.deepEqual(dimensions.clothing.tiers.map(tier => tier.id), ['refined', 'excellent', 'ordinary', 'minimal']);
  assert.deepEqual(dimensions.food.tiers.map(tier => tier.id), ['gourmet', 'healthy', 'ordinary', 'minimal']);
  assert.deepEqual(dimensions.housing.tiers.map(tier => tier.id), ['offCampus', 'luxuryDorm', 'ordinaryDorm']);
  assert.deepEqual(dimensions.transport.tiers.map(tier => tier.id), ['basic']);
  assert.equal(dimensions.transport.pending, true);
  assert.deepEqual(dimensions.transport.tiers[0].effects, {});
  assert.deepEqual(dimensions.housing.dormEvents, ['roommateCare', 'night', 'insomnia', 'flu', 'parcel', 'wall', 'ticket3']);
  const ordinary = game.budgetPlan(game.DEFAULT_BUDGET);
  assert.equal(ordinary.costs.total, 4800);
  assert.equal(ordinary.costs.clothing, 1000);
  assert.equal(ordinary.costs.food, 2400);
  assert.equal(ordinary.costs.housing, 1000);
  assert.equal(ordinary.costs.transport, 400);
  assert.equal(game.budgetPlan(HIGH).costs.total, 8400);
  assert.equal(game.budgetPlan(LOW).costs.total, 3100);
  assert.equal(game.budgetPlan({ ...game.DEFAULT_BUDGET, food: 'unknown' }), null);
  assert.equal(game.budgetPlan({ clothing: 'ordinary', food: 'ordinary', housing: 'ordinaryDorm' }), null);
  assert.equal(game.budgetPlan({ ...game.DEFAULT_BUDGET, extra: 'ordinary' }), null);
});

test('确认默认预算不改变金额，并记录四维档位与即时效果', () => {
  const state = game.createGame({ seed: seedFor('ordinary') });
  assert.equal(state.money, 1200);
  assert.equal(game.currentGrant(state).budgetChosen, false);
  const result = game.chooseBudget(state, game.DEFAULT_BUDGET);
  assert.equal(result.ok, true, result.reason);
  const next = result.state;
  assert.equal(next.money, 1200);
  assert.equal(next.mood, 66);
  assert.equal(next.social, 21);
  assert.equal(next.energy, 84);
  assert.equal(next.fitness, 53);
  const grant = game.currentGrant(next);
  assert.equal(grant.budgetChosen, true);
  assert.deepEqual(grant.budget, game.DEFAULT_BUDGET);
  assert.deepEqual(grant.budgetCosts, { clothing: 1000, food: 2400, housing: 1000, transport: 400, total: 4800 });
  assert.deepEqual(grant.budgetEffects, { mood: -4, social: 1, energy: 4, fitness: 3 });
  assert.deepEqual(grant.budgetModifiers, { restMultiplier: 0.85, dormMood: -1, dormSocial: 0 });
  assert.equal(grant.budgetDelta, 0);
  assert.equal(grant.livingCost, 4800);
  assert.equal(next.history.at(-1).command.operation, 'chooseBudget');
  assert.deepEqual(next.history.at(-1).command.id, game.DEFAULT_BUDGET);
  assert.equal(result.changes.money, 0);
  assert.deepEqual(game.activeBudget(next).selection, game.DEFAULT_BUDGET);
  assert.equal(game.housingFor(next).id, 'ordinaryDorm');
});

test('高预算追加差额并截断属性上限，低预算退回差额且不自动偿还校园卡', () => {
  const rich = game.createGame({ seed: seedFor('affluent') });
  assert.equal(rich.money, 5200);
  const high = game.chooseBudget(rich, HIGH);
  assert.equal(high.ok, true, high.reason);
  assert.equal(high.state.money, 1600);
  assert.equal(high.changes.money, -3600);
  assert.equal(high.state.mood, 100);
  assert.equal(high.state.social, 40);
  assert.equal(high.state.energy, 90);
  assert.equal(high.state.fitness, 42);
  assert.equal(game.currentGrant(high.state).budgetDelta, 3600);

  const capped = { ...rich, mood: 98, social: 99, energy: 99, fitness: 99 };
  const top = game.chooseBudget(capped, HIGH);
  assert.equal(top.ok, true, top.reason);
  assert.equal(top.state.mood, 100);
  assert.equal(top.state.social, 100);
  assert.equal(top.state.energy, 100);
  assert.equal(top.state.fitness, 91);

  const ordinary = game.createGame({ seed: seedFor('ordinary') });
  const debt = { ...ordinary, cardDebt: 200 };
  const low = game.chooseBudget(debt, LOW);
  assert.equal(low.ok, true, low.reason);
  assert.equal(low.state.money, 2900);
  assert.equal(low.state.cardDebt, 200);
  assert.equal(low.state.mood, 46);
  assert.equal(low.state.social, 16);
  assert.equal(game.currentGrant(low.state).budgetDelta, -1700);

  const tight = game.createGame({ seed: seedFor('tight') });
  assert.equal(tight.money, 400);
  const affordable = game.chooseBudget(tight, LOW);
  assert.equal(affordable.ok, true, affordable.reason);
  assert.equal(affordable.state.money, 2100);
});

test('不可负担、重复确认、非法档位与选课后确认均原子拒绝', () => {
  const state = game.createGame({ seed: seedFor('ordinary') });
  const before = JSON.stringify(state);
  const expensive = game.chooseBudget(state, HIGH);
  assert.equal(expensive.ok, false);
  assert.match(expensive.reason, /追加 3600 元/);
  assert.equal(JSON.stringify(state), before);

  const invalid = game.chooseBudget(state, { ...game.DEFAULT_BUDGET, clothing: 'unknown' });
  assert.equal(invalid.ok, false);
  assert.equal(JSON.stringify(state), before);

  const chosen = game.chooseBudget(state, game.DEFAULT_BUDGET).state;
  const once = JSON.stringify(chosen);
  const again = game.chooseBudget(chosen, LOW);
  assert.equal(again.ok, false);
  assert.match(again.reason, /已经确认/);
  assert.equal(JSON.stringify(chosen), once);

  const selected = game.selectCourses(state, courseIds(state)).state;
  const afterCourses = game.chooseBudget(selected, game.DEFAULT_BUDGET);
  assert.equal(afterCourses.ok, false);
  assert.match(afterCourses.reason, /先完成学期预算/);
  assert.deepEqual(afterCourses.state, selected);
});

test('预算即时效果只应用一次，不随体能档位缩放，精力按恢复处理', () => {
  const state = { ...game.createGame({ seed: seedFor('ordinary') }), fitness: 44, energy: 80, mood: 70, social: 20 };
  const result = game.chooseBudget(state, { clothing: 'ordinary', food: 'healthy', housing: 'ordinaryDorm', transport: 'basic' });
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.state.energy, 96);
  assert.equal(result.state.fitness, 54);
  assert.equal(result.state.mood, 60);
  assert.equal(result.state.social, 21);
  assert.equal(result.state.money, 600);
  assert.equal(result.state.history.filter(entry => entry.command.operation === 'chooseBudget').length, 1);
});

test('住宿三档改变休息恢复与体能上限，未确认预算保持中性', () => {
  const base = game.createGame({ seed: seedFor('affluent') });
  const unconfirmed = game.previewActionInvestment(base, 'rest', 1);
  assert.equal(unconfirmed.effect.recovery, 30);
  assert.equal(unconfirmed.effect.fitness, 5);
  const expected = {
    ordinaryDorm: { recovery: 26, fitness: 4 },
    luxuryDorm: { recovery: 34, fitness: 6 },
    offCampus: { recovery: 45, fitness: 8 }
  };
  const applied = {};
  for (const housing of Object.keys(expected)) {
    const result = game.chooseBudget(base, { ...game.DEFAULT_BUDGET, housing });
    assert.equal(result.ok, true, result.reason);
    const preview = game.previewActionInvestment(result.state, 'rest', 1);
    assert.equal(preview.effect.recovery, expected[housing].recovery, housing);
    assert.equal(preview.effect.fitness, expected[housing].fitness, housing);
    applied[housing] = result.state;
  }
  const ordinary = game.executeAction({ ...applied.ordinaryDorm, energy: 30 }, 'rest');
  const shared = game.executeAction({ ...applied.offCampus, energy: 30 }, 'rest');
  assert.equal(ordinary.ok, true, ordinary.reason);
  assert.equal(shared.ok, true, shared.reason);
  assert.ok(shared.changes.energy > ordinary.changes.energy);
  assert.ok(shared.changes.fitness >= ordinary.changes.fitness);
});

test('宿舍事件按住宿档位修正正向心情/社交，负向结果与白名单外事件不变', () => {
  const base = game.createGame({ seed: seedFor('affluent') });
  const ordinary = pending(game.chooseBudget(base, game.DEFAULT_BUDGET).state, 'roommateCare');
  const luxury = pending(game.chooseBudget(base, { ...game.DEFAULT_BUDGET, housing: 'luxuryDorm' }).state, 'roommateCare');
  const shared = pending(game.chooseBudget(base, { ...game.DEFAULT_BUDGET, housing: 'offCampus' }).state, 'roommateCare');
  const plain = pending(base, 'roommateCare');
  assert.deepEqual(
    [plain, ordinary, luxury, shared].map(state => game.eventChoiceEffect(state, 'talk')),
    [
      { id: 'talk', fitnessCost: 0, title: '和室友聊一会儿', description: '下楼，边吃边把最近的破事倒一倒。', time: 1, mood: 15, social: 3 },
      { id: 'talk', fitnessCost: 0, title: '和室友聊一会儿', description: '下楼，边吃边把最近的破事倒一倒。', time: 1, mood: 14, social: 3 },
      { id: 'talk', fitnessCost: 0, title: '和室友聊一会儿', description: '下楼，边吃边把最近的破事倒一倒。', time: 1, mood: 18, social: 6 },
      { id: 'talk', fitnessCost: 0, title: '和室友聊一会儿', description: '下楼，边吃边把最近的破事倒一倒。', time: 1, mood: 15, social: 3 }
    ]
  );
  const talked = game.submitEventChoice(shared, 'talk');
  assert.equal(talked.ok, true, talked.reason);
  // 合租即时心情已到 88，事件 +15 被 100 上限截断为 +12。
  assert.equal(talked.changes.mood, 12);
  assert.equal(talked.changes.social, 3);

  const dormNegative = pending(game.chooseBudget(base, { ...game.DEFAULT_BUDGET, housing: 'offCampus' }).state, 'insomnia');
  assert.equal(game.eventChoiceEffect(dormNegative, 'later').mood, -4);
  const outside = pending(game.chooseBudget(base, { ...game.DEFAULT_BUDGET, housing: 'offCampus' }).state, 'canteen');
  assert.equal(game.eventChoiceEffect(outside, 'queue').mood, 6);
  assert.equal(game.eventChoiceEffect(outside, 'queue').social, undefined);
});

test('投入型宿舍事件的均值预览与提交都叠加住宿修正', () => {
  const base = game.createGame({ seed: seedFor('affluent') });
  const ordinary = pending(game.chooseBudget(base, { ...game.DEFAULT_BUDGET, housing: 'ordinaryDorm' }).state, 'night');
  const luxury = pending(game.chooseBudget(base, { ...game.DEFAULT_BUDGET, housing: 'luxuryDorm' }).state, 'night');
  const plain = pending(base, 'night');
  const normal = game.previewEventInvestment(ordinary, 'join', 5);
  const better = game.previewEventInvestment(luxury, 'join', 5);
  const neutral = game.previewEventInvestment(plain, 'join', 5);
  assert.equal(normal.ok, true, normal.reason);
  assert.equal(better.ok, true, better.reason);
  assert.equal(better.effect.mood - normal.effect.mood, 4);
  assert.equal(better.effect.social - normal.effect.social, 3);
  assert.equal(better.effect.mood - neutral.effect.mood, 3);
  assert.equal(better.effect.social - neutral.effect.social, 3);
  const submitted = game.submitEventChoice(luxury, 'join', { investment: 5 });
  assert.equal(submitted.ok, true, submitted.reason);
  assert.ok(submitted.entry.changes.mood >= better.effect.mood - 1);
});

test('宿舍内室友交流叠加住宿加成，其他地点行动不受影响', () => {
  const base = game.createGame({ seed: seedFor('affluent') });
  const ordinary = game.chooseBudget(base, game.DEFAULT_BUDGET).state;
  const luxury = game.chooseBudget(base, { ...game.DEFAULT_BUDGET, housing: 'luxuryDorm' }).state;
  const shared = game.chooseBudget(base, { ...game.DEFAULT_BUDGET, housing: 'offCampus' }).state;
  const plain = game.previewActionInvestment(base, 'chat', 5);
  const dorm = game.previewActionInvestment(ordinary, 'chat', 5);
  const better = game.previewActionInvestment(luxury, 'chat', 5);
  const offCampus = game.previewActionInvestment(shared, 'chat', 5);
  assert.equal(dorm.effect.mood - plain.effect.mood, -1);
  assert.equal(dorm.effect.social - plain.effect.social, 0);
  assert.equal(better.effect.mood - plain.effect.mood, 3);
  assert.equal(better.effect.social - plain.effect.social, 3);
  assert.equal(offCampus.effect.mood - plain.effect.mood, 0);
  assert.equal(offCampus.effect.social - plain.effect.social, 0);
  assert.equal(game.previewActionInvestment(shared, 'study', 5).effect.social, game.previewActionInvestment(base, 'study', 5).effect.social);
});

test('宿舍地点描述随住宿档位变化，未确认预算回退默认描述且不修改配置', () => {
  const base = game.createGame({ seed: seedFor('affluent') });
  const defaultDescription = game.PLACES.dorm.description;
  assert.equal(game.placeDescription(base, 'dorm'), defaultDescription);
  const seen = new Set();
  for (const housing of ['ordinaryDorm', 'luxuryDorm', 'offCampus']) {
    const state = game.chooseBudget(base, { ...game.DEFAULT_BUDGET, housing }).state;
    const tier = game.BUDGET_DIMENSIONS.housing.tiers.find(item => item.id === housing);
    assert.equal(game.placeDescription(state, 'dorm'), tier.placeDescription);
    seen.add(game.placeDescription(state, 'dorm'));
    assert.equal(game.placeDescription(state, 'library'), game.PLACES.library.description);
  }
  assert.equal(seen.size, 3);
  const place = game.placeFor(game.chooseBudget(base, { ...game.DEFAULT_BUDGET, housing: 'offCampus' }).state, 'dorm');
  place.description = '被篡改';
  assert.equal(game.PLACES.dorm.description, defaultDescription);
});

test('两学期不同预算可存读档、校验并精确重放', () => {
  let state = game.createGame({ seed: seedFor('ordinary') });
  state = game.chooseBudget(state, game.DEFAULT_BUDGET).state;
  state = game.endTerm(state).state;
  state = game.continueGame(state, { commandId: 'budget-next-term' }).state;
  state = resolve(state);
  const second = game.chooseBudget(state, LOW);
  assert.equal(second.ok, true, second.reason);
  state = second.state;
  assert.deepEqual(state.history.map(entry => entry.command.operation), ['chooseBudget', 'endTerm', 'continueGame', 'submitEventChoice', 'chooseBudget']);
  assert.equal(state.economy.grants.length, 2);
  assert.equal(state.economy.grants[0].budgetChosen, true);
  assert.equal(state.economy.grants[1].budgetChosen, true);
  assert.equal(game.validateState(state).ok, true, JSON.stringify(game.validateState(state)));
  roundtrip(state);
  const replay = game.replay({ seed: state.rng.seed, nickname: state.nickname, commands: state.history.map(entry => ({ ...entry.command, commandId: entry.commandId })) });
  assert.equal(replay.ok, true, replay.reason);
  assert.deepEqual(replay.state, state);
});

test('预算快照、命令选择、扣款与总结快照被篡改时校验拒绝', () => {
  const state = game.chooseBudget(game.createGame({ seed: seedFor('ordinary') }), game.DEFAULT_BUDGET).state;
  assert.equal(game.validateState(state).ok, true);
  const tampered = [
    next => { game.currentGrant(next).budget.housing = 'offCampus'; },
    next => { game.currentGrant(next).budgetCosts.total = 8400; },
    next => { game.currentGrant(next).budgetEffects.mood = 10; },
    next => { game.currentGrant(next).budgetModifiers.restMultiplier = 1.3; },
    next => { game.currentGrant(next).budgetDelta = 3600; },
    next => { game.currentGrant(next).budgetChosen = false; },
    next => { next.history.at(-1).command.id.food = 'gourmet'; },
    next => { next.history.at(-1).changes.money = -3600; }
  ];
  for (const tamper of tampered) {
    const copy = structuredClone(state);
    tamper(copy);
    assert.equal(game.validateState(copy).ok, false);
  }

  const settled = game.endTerm(state).state;
  assert.equal(game.validateState(settled).ok, true);
  const summary = structuredClone(settled);
  summary.summary.budget.budgetDelta = 3600;
  assert.equal(game.validateState(summary).ok, false);
});

test('旧预算表的确认快照仍可读取，新存档带配置版本并严格校验', () => {
  const state = game.chooseBudget(game.createGame({ seed: seedFor('ordinary') }), game.DEFAULT_BUDGET).state;
  assert.equal(game.currentGrant(state).budgetConfig, game.BUDGET_CONFIG_VERSION);

  // 0.7.0 初版数值表（无 budgetConfig 标记）生成的确认快照：调表后必须仍能读取。
  const legacyValues = [
    next => { const grant = game.currentGrant(next); grant.budgetEffects = { mood: -2, social: 1, energy: 4, fitness: 3 }; grant.budgetModifiers = { restMultiplier: 0.9, dormMood: -1, dormSocial: 0 }; },
    next => { const grant = game.currentGrant(next); grant.budgetEffects = { mood: 8, social: 13, energy: 8, fitness: -4 }; grant.budgetModifiers = { restMultiplier: 1.4, dormMood: 0, dormSocial: 0 }; }
  ];
  for (const applyLegacy of legacyValues) {
    const copy = structuredClone(state);
    applyLegacy(copy);
    game.currentGrant(copy).budgetConfig = undefined;
    delete game.currentGrant(copy).budgetConfig;
    assert.equal(game.validateState(copy).ok, true, JSON.stringify(game.validateState(copy)));
  }

  // 结构损坏的旧快照仍然拒绝。
  const broken = [
    next => { game.currentGrant(next).budgetEffects = { mood: '高', social: 1, energy: 4, fitness: 3 }; },
    next => { game.currentGrant(next).budgetModifiers = { restMultiplier: -1, dormMood: 0, dormSocial: 0 }; },
    next => { game.currentGrant(next).budgetModifiers = { restMultiplier: 5, dormMood: 0, dormSocial: 0 }; }
  ];
  for (const breakIt of broken) {
    const copy = structuredClone(state);
    breakIt(copy);
    game.currentGrant(copy).budgetConfig = undefined;
    delete game.currentGrant(copy).budgetConfig;
    assert.equal(game.validateState(copy).ok, false);
  }

  // 当前配置版本的存档篡改 budgetConfig 也逃不过结构校验的下限（效果超界仍拒绝）。
  const dodge = structuredClone(state);
  game.currentGrant(dodge).budgetConfig = 0;
  game.currentGrant(dodge).budgetEffects = { mood: 999, social: 1, energy: 4, fitness: 3 };
  assert.equal(game.validateState(dodge).ok, false);

  // 两学期重放保持 deep 一致（含 budgetConfig 标记）。
  const replay = game.replay({ seed: state.rng.seed, nickname: state.nickname, commands: state.history.map(entry => ({ ...entry.command, commandId: entry.commandId })) });
  assert.equal(replay.ok, true, replay.reason);
  assert.deepEqual(replay.state, state);
});
