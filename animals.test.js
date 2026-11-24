'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('./game.js');
const animals = require('./animals.js');
const saves = require('./save.js');

test('地图一次只生成一只动物，猫分布在不同位置，鹅固定在明湖', () => {
  const samples = [0.2, 0.01, 0, 0, 0.2, 0.9, 0.99, 0, 0.9];
  const encounters = animals.createSystem(0, () => samples.shift());
  assert.equal(encounters.tick(2499, true, false), null);
  const cat = encounters.tick(2500, true, false);
  assert.equal(cat.species, 'cat');
  assert.equal(cat.catId, 'wumei');
  assert.equal(encounters.tick(25000, false, true), cat, '互动打开时不会过期');
  encounters.finish(25000);
  assert.equal(encounters.tick(42999, true, false), null);
  const next = encounters.tick(43000, true, false);
  assert.equal(next.species, 'cat');
  assert.equal(next.catId, 'tangyuan');
  assert.notDeepEqual([next.x, next.y], [cat.x, cat.y]);
  encounters.finish(43000);
  assert.equal(encounters.tick(61000, false, false), null);
  const goose = encounters.tick(61000, true, false);
  assert.equal(goose.species, 'goose');
  assert.equal(goose.catId, undefined);
  assert.deepEqual([goose.x, goose.y], [61.2, 48.7]);
});

test('每个猫偶遇可取得对应个体的图集，过期后才重选', () => {
  const ids = ['wumei', 'dunbu', 'tuoba', 'jupi', 'maolv', 'tangyuan'];
  const atlasVersions = { wumei: 'v4-20261124', dunbu: 'v3-20261124', tuoba: 'v3-20261124', jupi: 'v10-20261124', maolv: 'v3-20261124', tangyuan: 'v3-20261124' };
  for (const [index, catId] of ids.entries()) {
    const samples = [0.63, 0.5, (index + 0.5) / ids.length, 0, 0.64];
    const encounters = animals.createSystem(0, () => samples.shift());
    const cat = encounters.tick(2500, true, false);
    assert.equal(cat.catId, catId);
    const atlasVersion = atlasVersions[catId] ?? 'v3';
    assert.equal(animals.appearance(cat.species, cat.catId).atlas, 'assets/animals/cat-' + catId + '-' + atlasVersion + '.webp');
    assert.equal(encounters.tick(cat.expiresAt - 1, true, false), cat);
    assert.equal(encounters.tick(cat.expiresAt, true, false), null);
    assert.equal(encounters.tick(cat.expiresAt + 18000, true, false).species, 'goose');
  }
});

test('六只猫各有常驻位置，互动后继续留在地图，鹅仍会出现和离开', () => {
  const encounters = animals.createSystem(0, () => 0, { keepCatsOnMap: true });
  const cats = encounters.residentCats;
  assert.deepEqual(cats.map(cat => cat.catId), Object.keys(animals.CATS));
  assert.equal(new Set(cats.map(cat => cat.id)).size, cats.length);
  assert.equal(new Set(cats.map(cat => [cat.x, cat.y].join(','))).size, cats.length);
  const jupi = cats.find(cat => cat.catId === 'jupi');
  assert.deepEqual([jupi.x, jupi.y], [23, 66]);
  assert.equal(encounters.tick(0, true, false), null);
  const goose = encounters.tick(2500, true, false);
  assert.equal(goose.species, 'goose');
  for (const cat of cats) {
    assert.equal(cat.expiresAt, undefined);
    encounters.finish(3000, cat.id);
    assert.equal(encounters.tick(3000, true, false), goose);
  }
  assert.equal(encounters.tick(goose.expiresAt, true, false), null);
  assert.deepEqual(encounters.residentCats, cats);
});

test('地图上的猫共用轻量图集，互动场景仍使用高清原图', () => {
  for (const [index, catId] of Object.keys(animals.CATS).entries()) {
    assert.deepEqual(animals.mapMarker('cat', catId), {
      atlas: animals.CAT_MAP_ATLAS,
      position: (index % 3 * 50) + '% ' + (Math.floor(index / 3) * 100) + '%',
      size: '300% 200%'
    });
    assert.notEqual(animals.mapMarker('cat', catId).atlas, animals.appearance('cat', catId).atlas);
  }
  assert.deepEqual(animals.mapMarker('goose'), { atlas: animals.appearance('goose').atlas, position: '0% 0%', size: '200% 200%' });
});

test('抚摸按相同的提示窗口结算，猫和鹅的心情收益与损失不同', () => {
  const state = game.createGame({ legacyEconomy: true });
  for (const [species, moodUp, moodDown] of [['cat', 4, -2], ['goose', 7, -4]]) {
    const calm = game.interactWithAnimal(state, { species, choice: 'pet', elapsedMs: 850 });
    assert.equal(calm.entry.animal.outcome, 'petted');
    assert.equal(calm.changes.mood, moodUp);
    const alert = game.interactWithAnimal(state, { species, choice: 'pet', elapsedMs: 849 });
    assert.equal(alert.entry.animal.outcome, 'startled');
    assert.equal(alert.changes.mood, moodDown);
    assert.equal(alert.changes.money, 0);
    const invalid = game.interactWithAnimal(state, { species, choice: 'pet', elapsedMs: game.ANIMAL_CYCLE_MS });
    assert.equal(invalid.ok, false);
    assert.strictEqual(invalid.state, state);
  }
});

test('喂食费用和收益、余额不足与心情上限', () => {
  const state = game.createGame({ legacyEconomy: true });
  for (const [species, price, mood] of [['cat', 30, 5], ['goose', 40, 8]]) {
    const short = { ...state, money: price - 1 };
    const denied = game.interactWithAnimal(short, { species, choice: 'feed' });
    assert.equal(denied.ok, false);
    assert.strictEqual(denied.state, short);
    const fed = game.interactWithAnimal({ ...state, money: price }, { species, choice: 'feed' });
    assert.equal(fed.changes.mood, mood);
    assert.equal(fed.state.money, 0);
    const nearlyFull = game.interactWithAnimal({ ...state, mood: 99 }, { species, choice: 'feed' });
    assert.equal(nearlyFull.changes.mood, 1);
    assert.equal(nearlyFull.state.mood, 100);
    const full = game.interactWithAnimal(nearlyFull.state, { species, choice: 'feed' });
    assert.equal(full.ok, false);
    assert.strictEqual(full.state, nearlyFull.state);
  }
});

test('熟悉度按种类累计，跨学期且可重放和存读档', () => {
  const start = game.createGame({ legacyEconomy: true });
  assert.equal(game.validateState(start).ok, true, '旧档无互动计数时可读');
  const goose = game.interactWithAnimal(start, { species: 'goose', choice: 'feed' }, { commandId: 'meet-goose' }).state;
  assert.equal(game.animalCalm(start, 'goose', 1800), false);
  assert.equal(game.animalCalm(goose, 'goose', 1800), true);
  assert.equal(game.animalCalm(goose, 'cat', 2150), false);
  const duplicate = game.interactWithAnimal(goose, { species: 'goose', choice: 'feed' }, { commandId: 'meet-goose' });
  assert.equal(duplicate.ok, false);
  const cat = game.interactWithAnimal(goose, { species: 'cat', choice: 'pet', elapsedMs: 0 }).state;
  assert.equal(game.animalCalm(cat, 'cat', 2150), true, '受惊的偶遇也计入熟悉度');
  const next = game.continueGame(game.endTerm(cat).state).state;
  assert.deepEqual(next.animalVisits, { cat: 1, goose: 1 });
  const data = new Map();
  const slots = saves.createSlotService({ getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) });
  const saved = slots.save(next, 1);
  assert.equal(saved.ok, true, saved.reason);
  const loaded = slots.load(1);
  assert.equal(loaded.ok, true, loaded.reason);
  assert.deepEqual(loaded.state.animalVisits, next.animalVisits);
  assert.equal(game.validateState({ ...next, animalVisits: { cat: 2, goose: 1 } }).ok, false);
});
