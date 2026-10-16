'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('./game.js');
const save = require('./save.js');

const initial = () => game.createGame({ nickname: '存档专项', seed: 'm4-regression' });
const advanced = () => game.executeAction(initial(), 'study').state;
function encode(state = initial(), saveSequence = 1) {
  return JSON.stringify({ saveFormatVersion: game.RULES.saveFormatVersion, rulesVersion: game.RULES.version,
    appVersion: game.RULES.appVersion, saveSequence, savedAt: '2026-10-16T08:00:00.000Z', state });
}
function memory(primary = encode(), backup = null) {
  const data = new Map();
  if (primary !== null) data.set(save.KEYS.primary, primary);
  if (backup !== null) data.set(save.KEYS.backup, backup);
  return { data, getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key) };
}

test('主档读取期间另一标签更新，旧候选不能覆盖新档', () => {
  const storage = memory();
  const newer = encode(advanced(), 2);
  const read = storage.getItem;
  let updated = false;
  storage.getItem = key => {
    const raw = read(key);
    if (key === save.KEYS.primary && !updated) { updated = true; storage.data.set(key, newer); }
    return raw;
  };
  const service = save.createSaveService(storage);
  const loaded = service.load();
  assert.equal(loaded.ok, true);
  assert.deepEqual(loaded.state, initial());
  assert.equal(service.save(loaded.state).conflict, true);
  assert.equal(storage.data.get(save.KEYS.primary), newer);
  assert.equal(service.load().state.preparation, 20);
  assert.equal(service.save(advanced()).ok, true);
});

test('读取备份期间主档更新，也必须先重新读取才能保存', () => {
  const storage = memory(encode(advanced(), 2), encode());
  const newer = encode(advanced(), 3);
  const read = storage.getItem;
  storage.getItem = key => {
    const raw = read(key);
    if (key === save.KEYS.backup) storage.data.set(save.KEYS.primary, newer);
    return raw;
  };
  const service = save.createSaveService(storage);
  const loaded = service.load('backup');
  assert.equal(loaded.ok, true);
  assert.equal(loaded.state.preparation, 0);
  assert.equal(service.save(loaded.state).conflict, true);
  assert.equal(storage.data.get(save.KEYS.primary), newer);
});

test('检查或恢复过较高序号备份后，读取较旧主档不会使保存序号回退', () => {
  for (const observe of ['inspect', 'loadBackup']) {
    const storage = memory(encode(initial(), 2), encode(advanced(), 10));
    const service = save.createSaveService(storage);
    if (observe === 'inspect') assert.equal(service.inspect().backup.saveSequence, 10);
    else assert.equal(service.load('backup').saveSequence, 10);
    assert.equal(service.load().saveSequence, 2);
    assert.equal(service.save(initial()).saveSequence, 11);
  }
});

test('读取失败或仅查看存档列表，都不能解除已存在的标签冲突', () => {
  for (const operation of ['load', 'inspect']) {
    const storage = memory();
    const service = save.createSaveService(storage);
    service.inspect();
    const external = operation === 'load' ? '{broken' : encode(advanced(), 2);
    storage.data.set(save.KEYS.primary, external);
    const result = service[operation]();
    assert.equal(result.ok, operation === 'inspect');
    assert.equal(service.save(initial()).conflict, true);
    assert.equal(storage.data.get(save.KEYS.primary), external);
  }
});

test('临时档写入期间出现新主档，保留另一标签的新主档和新备份', () => {
  const storage = memory(encode(initial(), 2), encode(initial(), 1));
  const service = save.createSaveService(storage);
  service.inspect();
  const newer = encode(advanced(), 4);
  const newerBackup = encode(advanced(), 3);
  const write = storage.setItem;
  storage.setItem = (key, value) => {
    write(key, value);
    if (key === save.KEYS.temporary) {
      storage.data.set(save.KEYS.primary, newer);
      storage.data.set(save.KEYS.backup, newerBackup);
    }
  };
  assert.equal(service.save(initial()).conflict, true);
  assert.equal(storage.data.get(save.KEYS.primary), newer);
  assert.equal(storage.data.get(save.KEYS.backup), newerBackup);
});

test('备份写入期间主档更新，替换前的第二次检查阻止覆盖', () => {
  const storage = memory();
  const newer = encode(advanced(), 3);
  const write = storage.setItem;
  storage.setItem = (key, value) => {
    write(key, value);
    if (key === save.KEYS.backup) storage.data.set(save.KEYS.primary, newer);
  };
  const service = save.createSaveService(storage);
  assert.equal(service.save(initial()).conflict, true);
  assert.equal(storage.data.get(save.KEYS.primary), newer);
});

test('确认主档时发现他人写入，明确报告冲突且不回滚他人主档', () => {
  const storage = memory();
  const newer = encode(advanced(), 3);
  const write = storage.setItem;
  storage.setItem = (key, value) => {
    write(key, value);
    if (key === save.KEYS.primary) storage.data.set(key, newer);
  };
  const service = save.createSaveService(storage);
  const state = initial();
  const before = structuredClone(state);
  const result = service.save(state);
  assert.equal(result.ok, false);
  assert.equal(result.conflict, true);
  assert.equal(storage.data.get(save.KEYS.primary), newer);
  assert.deepEqual(state, before);
});

test('备份回读损坏时停止发布主档，原主档和内存不变', () => {
  const storage = memory();
  const service = save.createSaveService(storage);
  service.inspect();
  const beforeRaw = storage.getItem(save.KEYS.primary);
  const read = storage.getItem;
  storage.getItem = key => key === save.KEYS.backup ? '{corrupted' : read(key);
  const state = advanced();
  const before = structuredClone(state);
  const result = service.save(state);
  assert.equal(result.ok, false);
  assert.match(result.reason, /备份/);
  assert.equal(storage.data.get(save.KEYS.primary), beforeRaw);
  assert.deepEqual(state, before);
});

test('浏览器拒绝读取时返回可展示失败；恢复访问后仍能继续保存', () => {
  const storage = memory();
  const service = save.createSaveService(storage);
  const read = storage.getItem;
  storage.getItem = () => { throw new Error('SecurityError'); };
  for (const result of [service.inspect(), service.load(), service.save(initial())]) {
    assert.equal(result.ok, false);
    assert.equal(typeof result.reason, 'string');
  }
  storage.getItem = read;
  assert.equal(service.save(advanced()).ok, true);
});

test('保存与读档不改变规则状态；读档候选互相独立；时钟可以注入', () => {
  const storage = memory(null);
  const service = save.createSaveService(storage, { now: () => '2026-10-16T01:02:03.000Z' });
  const state = advanced();
  const before = structuredClone(state);
  const written = service.save(state);
  assert.equal(written.savedAt, '2026-10-16T01:02:03.000Z');
  assert.deepEqual(state, before);
  const first = service.load();
  first.state.rng.calls = 99;
  first.state.history[0].command.id = 'rest';
  assert.deepEqual(service.load().state, before);
});

test('损坏主档恢复备份后保存，保留有效备份并沿用更高序号', () => {
  const backup = encode(advanced(), 7);
  const storage = memory('{broken', backup);
  const service = save.createSaveService(storage);
  const loaded = service.load('backup');
  assert.equal(loaded.ok, true);
  assert.equal(service.save(loaded.state).saveSequence, 8);
  assert.equal(storage.getItem(save.KEYS.backup), backup);
  assert.deepEqual(service.load().state, advanced());
});

test('存档序号达到安全整数上限时拒绝新写入，保留三个槽位', () => {
  const storage = memory(encode(initial(), Number.MAX_SAFE_INTEGER), encode());
  const service = save.createSaveService(storage);
  const before = new Map(storage.data);
  assert.equal(service.save(advanced()).ok, false);
  assert.deepEqual(storage.data, before);
});

test('清理临时键失败后重试，保存序号继续递增且备份仍正确', () => {
  const storage = memory();
  const service = save.createSaveService(storage);
  storage.removeItem = () => { throw new Error('cleanup'); };
  const first = service.save(advanced());
  assert.equal(first.ok, true);
  assert.ok(first.warning);
  const firstRaw = storage.getItem(save.KEYS.primary);
  storage.removeItem = key => storage.data.delete(key);
  assert.equal(service.save(advanced()).saveSequence, first.saveSequence + 1);
  assert.equal(storage.getItem(save.KEYS.backup), firstRaw);
  assert.equal(storage.getItem(save.KEYS.temporary), null);
});

test('解析按 UTF-8 字节限制大小，并拒绝过深结构和危险键', () => {
  const oversized = JSON.parse(encode());
  oversized.extra = Array.from({ length: 400 }, () => '中'.repeat(1000));
  const raw = JSON.stringify(oversized);
  assert.ok(raw.length < save.MAX_BYTES);
  assert.ok(Buffer.byteLength(raw, 'utf8') > save.MAX_BYTES);
  assert.equal(save.parse(raw).ok, false);
  const deep = JSON.parse(encode());
  let value = deep;
  for (let i = 0; i < 16; i++) { value.extra = {}; value = value.extra; }
  assert.equal(save.parse(JSON.stringify(deep)).ok, false);
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    const dangerous = JSON.parse(encode());
    dangerous.extra = JSON.parse('{"' + key + '":true}');
    assert.equal(save.parse(JSON.stringify(dangerous)).ok, false);
  }
});
