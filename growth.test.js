'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const game = require('./game.js');
const saves = require('./save.js');

function ready() {
  let seed = 'growth-0';
  for (let i = 1; game.familyForSeed(seed).id !== 'ordinary'; i++) seed = 'growth-' + i;
  return game.chooseBudget(game.createGame({ nickname: '养成测试', seed }), game.DEFAULT_BUDGET).state;
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
  assert.equal(result.ok, true, result.reason);
  return resolve(result.state);
}
function buy(state, id) {
  const result = game.purchaseGrowth(state, id);
  assert.equal(result.ok, true, result.reason);
  return result.state;
}
function nextTerm(state) {
  const settled = game.endTerm(resolve(state));
  assert.equal(settled.ok, true, settled.reason);
  const continued = game.continueGame(settled.state);
  assert.equal(continued.ok, true, continued.reason);
  return resolve(continued.state);
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

test('养成购买只扣一次费用，不即时发奖、不消耗时间或随机数，并拒绝旧面板和重复命令', () => {
  const source = ready();
  const snapshot = structuredClone(source);
  const result = game.purchaseGrowth(source, 'bedding', { commandId: 'purchase-once', expectedRevision: source.revision });
  assert.equal(result.ok, true, result.reason);
  const state = result.state;
  assert.deepEqual(source, snapshot);
  assert.equal(state.money, source.money - 300);
  for (const key of ['time', 'energy', 'mood', 'fitness']) assert.equal(state[key], source[key]);
  assert.deepEqual(state.rng, source.rng);
  assert.equal(state.revision, source.revision + 1);
  assert.deepEqual(state.growth.purchased.bedding, { term: 1, revision: state.revision });
  for (const rejected of [game.purchaseGrowth(state, 'bedding'),
    game.purchaseGrowth(state, 'hobbyCorner', { expectedRevision: source.revision }),
    game.purchaseGrowth(state, 'hobbyCorner', { commandId: 'purchase-once' })]) {
    assert.equal(rejected.ok, false);
    assert.strictEqual(rejected.state, state);
  }
  replayAndSave(state);
});

test('养成受预算、余额、身体与流程限制；作息计划要求三次成功休息，最后学期不再售卖', () => {
  const state = ready();
  for (const source of [{ ...state, money: 199 }, { ...state, fitness: 24 },
    ...['eventPending', 'examPending', 'summary', 'finished', 'ended', 'endingChoice'].map(phase => ({ ...state, phase }))]) {
    const before = structuredClone(source);
    const result = game.purchaseGrowth(source, 'hobbyCorner');
    assert.equal(result.ok, false);
    assert.strictEqual(result.state, source);
    assert.deepEqual(source, before);
  }
  assert.equal(game.purchaseGrowth(game.createGame(), 'bedding').ok, false);
  for (const id of ['invalid', '__proto__', 'toString']) assert.equal(game.purchaseGrowth(state, id).ok, false);
  assert.match(game.growthAvailability(state, 'routine').reason, /3 次休息/);
  let rested = state;
  for (let i = 0; i < 3; i++) rested = act(rested, 'rest');
  assert.equal(game.growthAvailability(rested, 'routine').ok, true);
  assert.match(game.growthAvailability({ ...rested, term: 8 }, 'routine').reason, /最后一学期/);
});

test('寝具在住宿倍率及随机恢复后固定加三点精力，预览不领奖，满值会截断', () => {
  for (const housing of ['ordinaryDorm', 'luxuryDorm', 'offCampus']) {
    let state = ready();
    // Isolate the recovery formula across all housing plans, with enough room below the caps.
    const original = game.createGame({ seed: state.rng.seed });
    state = game.chooseBudget({ ...original, money: 5000 }, { ...game.DEFAULT_BUDGET, housing }).state;
    state = { ...buy(state, 'bedding'), energy: 20, mood: 40 };
    const baseline = { ...state };
    delete baseline.growth;
    const before = structuredClone(state);
    for (let i = 0; i < 3; i++) game.previewActionInvestment(state, 'rest', 1);
    assert.deepEqual(state, before);
    assert.equal(game.previewActionInvestment(state, 'rest', 1).effect.recovery,
      game.previewActionInvestment(baseline, 'rest', 1).effect.recovery + 3);
    const normal = game.executeAction(baseline, 'rest');
    const grown = game.executeAction(state, 'rest');
    assert.equal(grown.ok, true, grown.reason);
    assert.equal(grown.changes.energy, normal.changes.energy + 3, housing);
    assert.deepEqual(grown.entry.growthBonuses, { energy: 3, mood: 0 });
    const capped = game.executeAction({ ...state, energy: 99 }, 'rest');
    assert.equal(capped.state.energy, 100);
    assert.equal(capped.entry.growthBonuses, undefined);
  }
});

test('兴趣角只奖励购买后的两次休息，每学期重置，存读档不恢复用掉的次数', () => {
  let state = act(ready(), 'rest');
  state = buy(state, 'hobbyCorner');
  assert.equal(game.growthStatus(state).nodes.find(node => node.id === 'hobbyCorner').remainingRests, 2);
  for (let index = 0; index < 3; index++) {
    // Use a low mood here to test the full +2 without interference from the 100 cap.
    const source = { ...resolve(state), mood: 40 };
    const result = game.executeAction(source, 'rest');
    assert.equal(result.ok, true, result.reason);
    assert.equal(result.entry.growthBonuses?.mood || 0, index < 2 ? 2 : 0);
    state = resolve(result.state);
  }
  assert.equal(game.growthStatus(state).nodes.find(node => node.id === 'hobbyCorner').remainingRests, 0);
  // A real, unmodified route verifies persistence and replay independently of the formula setup.
  let route = buy(ready(), 'hobbyCorner');
  route = act(route, 'rest');
  route = replayAndSave(route);
  assert.equal(game.growthStatus(route).nodes.find(node => node.id === 'hobbyCorner').remainingRests, 1);
  route = act(route, 'rest');
  route = act(route, 'rest');
  route = replayAndSave(nextTerm(route));
  assert.equal(game.growthStatus(route).nodes.find(node => node.id === 'hobbyCorner').remainingRests, 2);
});

test('心情已满也占用兴趣角本学期的一次休息机会，额外恢复不超过上限', () => {
  const source = { ...buy(ready(), 'hobbyCorner'), mood: 100, energy: 20 };
  const result = game.executeAction(source, 'rest');
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.state.mood, 100);
  assert.equal(game.growthStatus(result.state).nodes.find(node => node.id === 'hobbyCorner').remainingRests, 1);
  const almostFull = game.executeAction({ ...source, mood: 99 }, 'rest');
  assert.equal(almostFull.state.mood, 100);
});

test('作息计划从下一学期开学增加三点精力，预算和读档不重复发奖，后续学期仍有效', () => {
  let state = ready();
  for (let i = 0; i < 3; i++) state = act(state, 'rest');
  const energy = state.energy;
  state = buy(state, 'routine');
  assert.equal(state.energy, energy);
  state = replayAndSave(state);
  state = replayAndSave(nextTerm(state));
  assert.equal(state.energy, 83);
  for (let i = 0; i < 3; i++) {
    game.growthStatus(state);
    assert.equal(replayAndSave(state).energy, 83);
  }
  state = game.chooseBudget(state, game.DEFAULT_BUDGET).state;
  assert.equal(state.energy, 87);
  state = replayAndSave(nextTerm(state));
  assert.equal(state.energy, 83);
});

test('没有养成字段的旧存档仍可读取并购买；新开一局没有已购节点', () => {
  const legacy = JSON.parse(fs.readFileSync(require.resolve('./qa/legacy-wallet-v055.json'), 'utf8'));
  const loaded = saves.parse(JSON.stringify(legacy));
  assert.equal(loaded.ok, true, loaded.reason);
  const source = resolve(loaded.state);
  assert.equal(source.growth, undefined);
  const purchased = buy(source, 'bedding');
  assert.equal(game.validateState(purchased).ok, true, game.validateState(purchased).reason);
  assert.equal(game.growthStatus(game.createGame({ seed: purchased.rng.seed })).ownedCount, 0);
});

test('养成存档拒绝伪造节点、移除购买记录、更改扣款及伪造恢复奖励', () => {
  const route = act(buy(buy(ready(), 'bedding'), 'hobbyCorner'), 'rest');
  replayAndSave(route);
  const mutations = [
    state => { state.growth.purchased.free = { term: 1, revision: 1 }; },
    state => { state.growth.version = 2; },
    state => { delete state.growth; },
    state => { state.growth.purchased.bedding.revision++; },
    state => { state.history.find(entry => entry.command.operation === 'purchaseGrowth').changes.money = 0; },
    state => { state.history.find(entry => entry.growthBonuses).growthBonuses.mood = 50; }
  ];
  for (const mutate of mutations) {
    const state = structuredClone(route);
    mutate(state);
    assert.equal(game.validateState(state).ok, false);
  }
});
