'use strict';
// 四维单品（二期）：正装套装/运动鞋/水果篮/健身餐/自行车/通勤公交卡的规则回归。
// 覆盖前置条件、行动加成、每学期限次、叠加顺序、存读档重放与篡改拒绝。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const game = require('./game.js');
const saves = require('./save.js');

function seedFor(familyId) {
  for (let i = 0; ; i++) {
    const seed = 'growth-items-' + i;
    if (game.familyForSeed(seed).id === familyId) return seed;
  }
}
function ready(familyId = 'ordinary') {
  return game.chooseBudget(game.createGame({ nickname: '单品测试', seed: seedFor(familyId) }), game.DEFAULT_BUDGET).state;
}
function resolve(state) {
  let attempts = 0;
  while (state.pendingEvent) {
    assert.ok(attempts++ < 10);
    const choice = state.pendingEvent.id === 'military2' ? 'perform' : 'later';
    const result = game.submitEventChoice(state, choice);
    assert.equal(result.ok, true, result.reason);
    state = result.state;
  }
  return state;
}
function act(state, id, investment) {
  const result = game.executeAction(resolve(state), id, { investment });
  assert.equal(result.ok, true, id + ': ' + result.reason);
  return resolve(result.state);
}
function buy(state, id) {
  const result = game.purchaseGrowth(state, id);
  assert.equal(result.ok, true, id + ': ' + result.reason);
  return result.state;
}
function nextTerm(state) {
  const settled = game.endTerm(resolve(state));
  assert.equal(settled.ok, true, settled.reason);
  const continued = game.continueGame(settled.state);
  assert.equal(continued.ok, true, continued.reason);
  const next = resolve(continued.state);
  // 新学期 grant 未确认预算，养成购买被门禁拦截，先按默认组合确认。
  const confirmed = game.chooseBudget(next, game.DEFAULT_BUDGET);
  assert.equal(confirmed.ok, true, confirmed.reason);
  return confirmed.state;
}
function replayAndSave(state) {
  const data = new Map();
  const service = saves.createSlotService({ getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) });
  const saved = service.save(state, 3);
  assert.equal(saved.ok, true, saved.reason);
  const loaded = service.load(3);
  assert.equal(loaded.ok, true, loaded.reason);
  assert.deepEqual(loaded.state, state);
  const replay = game.replay({ nickname: state.nickname, seed: state.rng.seed, commands: state.history.map(entry => ({ ...entry.command, commandId: entry.commandId })) });
  assert.equal(replay.ok, true, replay.reason);
  assert.deepEqual(replay.state, state);
  return loaded.state;
}
function bonusesOf(result) { return result.entry.growthBonuses; }

test('九个单品配置：五维分组、旧节点行为字段保留、金额与前置齐全', () => {
  const status = game.growthStatus(ready());
  assert.equal(status.nodes.length, 9);
  assert.equal(status.ownedCount, 0);
  assert.deepEqual(game.GROWTH_DIMENSIONS.map(item => item.id), ['clothing', 'food', 'housing', 'transport', 'habit']);
  for (const node of status.nodes) {
    assert.ok(game.GROWTH_DIMENSIONS.some(item => item.id === node.dimension), node.id);
    assert.ok(Number.isInteger(node.price) && node.price > 0, node.id);
    assert.ok(Array.isArray(node.effects) && node.effects.length, node.id);
  }
  // 旧节点的兼容派生字段与金额不变。
  const byId = Object.fromEntries(status.nodes.map(node => [node.id, node]));
  assert.equal(byId.bedding.price, 300);
  assert.equal(byId.hobbyCorner.restsPerTerm, 2);
  assert.equal(byId.routine.requiredRests, 3);
  assert.equal(byId.routine.openingEnergy, 3);
  // 三个旧节点金额与效果不可变（队友行为的兼容红线）。
  assert.deepEqual(game.GROWTH_NODES.bedding.effects, [{ kind: 'action', actions: ['rest'], bonuses: { recovery: 3 } }]);
  assert.deepEqual(game.GROWTH_NODES.hobbyCorner.effects, [{ kind: 'action', actions: ['rest'], bonuses: { mood: 2 }, perTerm: 2 }]);
  assert.deepEqual(game.GROWTH_NODES.routine.prereq, { actionCounts: { rest: 3 } });
  assert.deepEqual(game.GROWTH_NODES.routine.effects, [{ kind: 'termStart', bonuses: { energy: 3 } }]);
});

test('新单品同样受预算确认、余额与阶段门限制', () => {
  const state = ready();
  assert.equal(game.purchaseGrowth(game.createGame({ seed: seedFor('ordinary') }), 'bicycle').reason, '请先确认本学期生活预算');
  for (const source of [{ ...state, money: 219 }, { ...state, phase: 'eventPending' }]) {
    const result = game.purchaseGrowth(source, 'transitCard');
    assert.equal(result.ok, false);
    assert.strictEqual(result.state, source);
  }
});

test('正装套装：第5学期解锁，求职准备每次额外加4并可预览', () => {
  let state = ready('affluent');
  for (let i = 0; i < 3; i++) state = nextTerm(state);
  assert.equal(state.term, 4);
  assert.equal(game.growthAvailability(state, 'formalSuit').reason, '第 5 学期开始开放');
  state = nextTerm(state);
  assert.equal(state.term, 5);
  assert.equal(game.growthAvailability(state, 'formalSuit').ok, true);
  state = buy(state, 'formalSuit');
  assert.equal(state.growth.purchased.formalSuit.term, 5);
  const source = resolve(state);
  const preview = game.previewActionInvestment(source, 'jobPreparation');
  assert.equal(preview.ok, true, preview.reason);
  const baseline = game.previewActionInvestment({ ...source, growth: undefined }, 'jobPreparation');
  assert.equal(preview.effect.jobPreparation, baseline.effect.jobPreparation + 4);
  const acted = act(source, 'jobPreparation');
  // 找到带 growthBonuses 的那次求职行动记录。
  const entry = acted.history.slice().reverse().find(item => item.action === 'jobPreparation' && item.growthBonuses);
  assert.deepEqual(entry.growthBonuses, { energy: 0, mood: 0, jobPreparation: 4 });
});

test('运动鞋：锻炼与单人运动固定加2点体能，与体能档位无关', () => {
  let state = buy(ready(), 'runningShoes');
  for (const fitness of [50, 65]) {
    const source = { ...resolve(state), fitness, energy: 60 };
    const result = game.executeAction(source, 'exercise');
    assert.equal(result.ok, true, result.reason);
    const baseline = game.executeAction({ ...source, growth: undefined }, 'exercise');
    assert.equal(result.changes.fitness, baseline.changes.fitness + 2, 'fitness ' + fitness);
    assert.deepEqual(bonusesOf(result), { energy: 0, mood: 0, fitness: 2 });
  }
  const capped = game.executeAction({ ...resolve(state), fitness: 99, energy: 60 }, 'exercise');
  assert.equal(capped.ok, true, capped.reason);
  assert.equal(capped.entry.growthBonuses, undefined, '撞上限时不记加成');
  const solo = game.executeAction({ ...resolve(state), mood: 40, energy: 60 }, 'soloSport', 1);
  assert.equal(solo.ok, true, solo.reason);
  assert.deepEqual(bonusesOf(solo), { energy: 0, mood: 0, fitness: 2 });
});

test('水果篮：休息额外1点精力每学期三次，跨学期重置，与寝具叠加恰好加4', () => {
  let state = buy(ready(), 'fruitBasket');
  assert.equal(game.growthStatus(state).nodes.find(node => node.id === 'fruitBasket').remainingUses, 3);
  for (let index = 0; index < 4; index++) {
    const source = { ...resolve(state), energy: 20 };
    const result = game.executeAction(source, 'rest');
    assert.equal(result.ok, true, result.reason);
    assert.equal(bonusesOf(result)?.energy || 0, index < 3 ? 1 : 0);
    state = resolve(result.state);
  }
  assert.equal(game.growthStatus(state).nodes.find(node => node.id === 'fruitBasket').remainingUses, 0);
  state = nextTerm(state);
  assert.equal(game.growthStatus(state).nodes.find(node => node.id === 'fruitBasket').remainingUses, 3);
  // 与寝具叠加：无论住宿倍率如何，均为恰好 +4。
  for (const housing of ['ordinaryDorm', 'luxuryDorm', 'offCampus']) {
    const original = game.createGame({ seed: seedFor('ordinary') });
    let stacked = game.chooseBudget({ ...original, money: 5000 }, { ...game.DEFAULT_BUDGET, housing }).state;
    stacked = buy(buy(stacked, 'bedding'), 'fruitBasket');
    stacked = { ...stacked, energy: 20, mood: 40 };
    const baseline = { ...stacked, growth: undefined };
    const grown = game.executeAction(stacked, 'rest');
    const normal = game.executeAction(baseline, 'rest');
    assert.equal(grown.changes.energy, normal.changes.energy + 4, housing);
    assert.deepEqual(bonusesOf(grown), { energy: 4, mood: 0 });
  }
});

test('健身餐：健身房锻炼额外加3点体能', () => {
  let state = buy(ready(), 'fitnessMeal');
  const source = { ...resolve(state), fitness: 50, money: 500 };
  const result = game.executeAction(source, 'gym', 1);
  assert.equal(result.ok, true, result.reason);
  const baseline = game.executeAction({ ...source, growth: undefined }, 'gym', 1);
  assert.equal(result.changes.fitness, baseline.changes.fitness + 3);
  assert.deepEqual(bonusesOf(result), { energy: 0, mood: 0, fitness: 3 });
});

test('自行车：散步与单人运动额外加2点心情，心情满时截断', () => {
  let state = buy(ready(), 'bicycle');
  const walked = game.executeAction({ ...resolve(state), mood: 40 }, 'walk');
  assert.equal(walked.ok, true, walked.reason);
  const baseline = game.executeAction({ ...resolve(state), mood: 40, growth: undefined }, 'walk');
  assert.equal(walked.changes.mood, baseline.changes.mood + 2);
  assert.deepEqual(bonusesOf(walked), { energy: 0, mood: 2 });
  const capped = game.executeAction({ ...resolve(state), mood: 100 }, 'walk');
  assert.equal(capped.ok, true, capped.reason);
  assert.equal(capped.entry.growthBonuses, undefined);
});

test('通勤公交卡：第3学期解锁，实习工作心情加2每学期四次并跨学期重置', () => {
  let state = ready('affluent');
  state = nextTerm(state);
  assert.equal(state.term, 2);
  assert.equal(game.growthAvailability(state, 'transitCard').reason, '第 3 学期开始开放');
  state = nextTerm(state);
  assert.equal(state.term, 3);
  state = buy(state, 'transitCard');
  const activeChain = { status: 'active', progress: 0, startedTerm: 3, deadline: 8, nextEligibleTerm: 1, reviewAfter: 8 };
  for (let index = 0; index < 5; index++) {
    const source = { ...resolve(state), mood: 40, energy: 80, chains: { ...state.chains, internship: { ...activeChain, progress: 0 } } };
    const result = game.executeAction(source, 'internshipWork', 1);
    assert.equal(result.ok, true, index + ': ' + result.reason);
    assert.equal(bonusesOf(result)?.mood || 0, index < 4 ? 2 : 0, '第 ' + (index + 1) + ' 次');
    state = resolve(result.state);
  }
  state = nextTerm(state);
  const fresh = { ...resolve(state), mood: 40, energy: 80, chains: { ...state.chains, internship: { ...activeChain, progress: 0 } } };
  const again = game.executeAction(fresh, 'internshipWork', 1);
  assert.equal(again.ok, true, again.reason);
  assert.equal(bonusesOf(again)?.mood || 0, 2, '新学期次数重置');
});

test('九品全购路线可存读档并精确重放，growth 版本保持 1', () => {
  let state = ready('affluent');
  state = buy(buy(buy(buy(buy(buy(state, 'bedding'), 'hobbyCorner'), 'runningShoes'), 'fruitBasket'), 'fitnessMeal'), 'bicycle');
  for (let i = 0; i < 3; i++) state = act(state, 'rest');
  state = buy(state, 'routine');
  while (state.term < 3) state = nextTerm(state);
  state = buy(state, 'transitCard');
  while (state.term < 5) state = nextTerm(state);
  state = buy(state, 'formalSuit');
  assert.equal(game.growthStatus(state).ownedCount, 9);
  assert.equal(state.growth.version, 1);
  state = nextTerm(state);
  // 开学精力 = 80 基础 + 3（作息计划）+ 4（默认预算食·普通的即时恢复）。
  assert.equal(state.energy, 87, '作息计划开学加成');
  const loaded = replayAndSave(state);
  assert.equal(game.growthStatus(loaded).ownedCount, 9);
});

test('养成记录篡改：未知节点、伪造超上限加成、未购节点伪造键、错误扣款均被拒绝', () => {
  const state = buy(buy(ready(), 'bedding'), 'runningShoes');
  const exercised = act(state, 'exercise');
  assert.equal(game.validateState(exercised).ok, true, JSON.stringify(game.validateState(exercised)));
  const mutations = [
    next => { next.growth.purchased.mystery = { term: 1, revision: 1 }; },
    next => { const entry = next.history.find(item => item.growthBonuses); entry.growthBonuses.fitness = 5; },
    next => { const entry = next.history.find(item => item.growthBonuses); entry.growthBonuses.energy = 4; },
    next => { delete next.growth.purchased.runningShoes; },
    next => { const entry = next.history.find(item => item.action === 'purchaseGrowth'); entry.changes.money = -100; }
  ];
  for (const mutate of mutations) {
    const copy = structuredClone(exercised);
    mutate(copy);
    assert.equal(game.validateState(copy).ok, false, JSON.stringify(game.validateState(copy)));
  }
});

test('旧0.5.5存档切换经济后仍可购买新单品', () => {
  const raw = fs.readFileSync(require.resolve('./qa/legacy-wallet-v055.json'), 'utf8');
  const loaded = saves.parse(raw);
  assert.equal(loaded.ok, true, loaded.reason);
  let state = loaded.state;
  assert.equal(state.term, 3);
  // 该档位无经济字段，本学期无预算确认门，可直接购买第3学期解锁的公交卡。
  state = buy(resolve(state), 'transitCard');
  assert.equal(state.growth.version, 1);
  assert.equal(state.money, loaded.state.money - 220);
});
