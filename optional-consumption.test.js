'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('./game.js');
const saves = require('./save.js');

function resolve(state) {
  while (state.pendingEvent) {
    const result = game.submitEventChoice(state, 'later');
    assert.equal(result.ok, true, result.reason);
    state = result.state;
  }
  return state;
}
function roundtrip(state) {
  const data = new Map();
  const store = saves.createSaveService({ getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) });
  assert.equal(store.save(state).ok, true, JSON.stringify(game.validateState(state)));
  assert.deepEqual(store.load().state, state);
}

test('资料只增加最多2点绝对进度，不降低原有时间精力成本，不增加随机数调用', () => {
  for (let seed = 0; seed < 60; seed++) for (const fitness of [25, 50, 70, 90]) for (const id of ['study', 'selfStudy']) {
    const state = { ...game.createGame({ seed: 'materials-' + seed }), fitness };
    const original = structuredClone(state);
    const plain = game.executeAction(state, id);
    const paid = game.executeAction(state, id, { extra: 'materials' });
    assert.equal(paid.ok, true, paid.reason);
    assert.equal(paid.changes.preparation - plain.changes.preparation, 2);
    assert.equal(paid.changes.money - plain.changes.money, -80);
    assert.equal(paid.changes.time, plain.changes.time);
    assert.equal(paid.changes.energy, plain.changes.energy);
    assert.equal(paid.changes.fitness, plain.changes.fitness);
    assert.deepEqual(paid.state.rng, plain.state.rng);
    assert.deepEqual(state, original);
  }
});

test('学习与自习共享两次上限，学期总额外进度最多4点，下学期重新开放', () => {
  let state = game.createGame({ seed: 'shared-materials' });
  for (const id of ['study', 'selfStudy']) {
    const result = game.executeAction(state, id, { extra: 'materials' });
    assert.equal(result.ok, true, result.reason);
    state = resolve(result.state);
  }
  assert.equal(state.history.reduce((sum, entry) => sum + (entry.extra?.bonuses.preparation || 0), 0), 4);
  for (const id of ['study', 'selfStudy']) {
    const result = game.executeAction(state, id, { extra: 'materials' });
    assert.equal(result.ok, false);
    assert.strictEqual(result.state, state);
    assert.match(result.reason, /已购买 2 次/);
  }
  roundtrip(state);
  state = resolve(game.continueGame(game.endTerm(state).state).state);
  assert.equal(game.executeAction(state, 'study', { extra: 'materials' }).ok, true);
});

test('只有学习、自习与室友交流提供额外消费；未知项目及余额不足原子拒绝', () => {
  assert.deepEqual(Object.keys(game.ACTIONS).filter(id => game.getActionExtra(id)), ['study', 'selfStudy', 'chat']);
  const state = game.createGame({ seed: 'extra-rejection' });
  for (const [id, extra] of [['study', null], ['study', 'snacks'], ['show', 'materials'], ['study', '__proto__'], ['study', 80]]) {
    const result = game.executeAction(state, id, { extra });
    assert.equal(result.ok, false);
    assert.strictEqual(result.state, state);
  }
  const poor = { ...state, money: 79 };
  assert.equal(game.executeAction(poor, 'study', { extra: 'materials' }).ok, false);
  assert.equal(game.executeAction(poor, 'study').ok, true);
  const exact = game.executeAction({ ...state, money: 80 }, 'study', { extra: 'materials' });
  assert.equal(exact.state.money, 0);
});

test('随机基础收获已封顶时免收资料费，不占购买次数；部分封顶只记实际额外收益', () => {
  let skipped = false;
  let partial = false;
  for (let seed = 0; seed < 1000 && !(skipped && partial); seed++) {
    const source = { ...game.createGame({ seed: 'capped-extra-' + seed }), preparation: 77 };
    const plain = game.executeAction(source, 'study');
    const result = game.executeAction(source, 'study', { extra: 'materials' });
    assert.equal(result.ok, true, result.reason);
    if (plain.state.preparation === 100) {
      assert.equal(result.entry.extra.price, 0);
      assert.equal(result.entry.extra.skipped, true);
      assert.equal(result.changes.money, 0);
      assert.equal(result.entry.extra.bonuses.preparation, 0);
      skipped = true;
    }
    if (plain.state.preparation === 99) {
      assert.equal(result.entry.extra.bonuses.preparation, 1);
      assert.equal(result.state.preparation, 100);
      partial = true;
    }
  }
  assert.ok(skipped);
  assert.ok(partial);
  const capped = { ...game.createGame(), preparation: 99 };
  assert.equal(game.actionExtraAvailability(capped, 'study', undefined, 'materials').ok, false);
});

test('零食分享小幅增加社交与心情，每学期一次，其他事件不受影响', () => {
  const state = game.createGame({ seed: 'snack-extra' });
  const plain = game.executeAction(state, 'chat');
  const paid = game.executeAction(state, 'chat', { extra: 'snacks' });
  assert.equal(paid.changes.social - plain.changes.social, 1);
  assert.equal(paid.changes.mood - plain.changes.mood, 2);
  assert.equal(paid.changes.money, -40);
  assert.equal(paid.changes.time, plain.changes.time);
  const next = resolve(paid.state);
  assert.equal(game.executeAction(next, 'chat', { extra: 'snacks' }).ok, false);
  assert.equal(game.executeAction(next, 'chat').ok, true);
  roundtrip(next);
});

test('可选消费精确重放、存读档、重复命令防护与消费记录校验', () => {
  let state = game.createGame({ seed: 'extra-replay' });
  const result = game.executeAction(state, 'study', { commandId: 'materials-once', extra: 'materials' });
  state = resolve(result.state);
  const duplicate = game.executeAction(state, 'study', { commandId: 'materials-once', extra: 'materials' });
  assert.equal(duplicate.ok, false);
  roundtrip(state);
  const replay = game.replay({ nickname: state.nickname, seed: state.rng.seed, commands: state.history.map(entry => ({ ...entry.command, commandId: entry.commandId })) });
  assert.deepEqual(replay.state, state);
  for (const mutate of [entry => entry.extra.price = 0, entry => entry.extra.bonuses.preparation = 20, entry => entry.command.extra = 'snacks', entry => delete entry.extra, entry => entry.extra.bonuses.time = 1]) {
    const bad = structuredClone(state);
    mutate(bad.history[0]);
    assert.equal(game.validateState(bad).ok, false);
  }
});
