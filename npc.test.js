'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const npc = require('./npc.js');
const { create, draw } = require('./rng.js');

function makeRandom(seed) {
  let rng = create(seed);
  return () => { const result = draw(rng); rng = result.rng; return result.number; };
}

test('十六种身份权重合计 100，台词库完整且风格贴合职位', () => {
  const total = npc.IDENTITIES.reduce((sum, item) => sum + item.weight, 0);
  assert.equal(total, 100);
  assert.equal(npc.IDENTITIES.length, 16);
  assert.equal(new Set(npc.IDENTITIES.map((item) => item.id)).size, 16);
  assert.equal(new Set(npc.IDENTITIES.map((item) => item.label)).size, 16);
  assert.equal(new Set(npc.IDENTITIES.map((item) => item.figure)).size, 16);
  for (const identity of npc.IDENTITIES) {
    assert.ok(identity.label && identity.figure && identity.route && identity.mode && identity.speed > 0, identity.id);
    assert.ok(identity.lines.length >= 4, identity.id + ' 台词至少 4 句');
    assert.equal(new Set(identity.lines).size, identity.lines.length, identity.id + ' 台词不重复');
    assert.ok(identity.lines.every((line) => line && line.length >= 8), identity.id + ' 台词长度');
    assert.ok(npc.ROUTES[identity.route], identity.id + ' 路线存在');
  }
  // 职位性格抽查：阿姨热情、司机谈车、快递谈件、教授谈学问、保安谈安全，新增职位各有各的口吻。
  const spot = (id, pattern) => assert.match(npc.linesFor(id).join(''), pattern, id);
  spot('canteenAunt', /吃|勺/);
  spot('driver', /车/);
  spot('courier', /快递|件/);
  spot('professor', /学问|科研|文献/);
  spot('security', /安全|校门/);
  spot('internationalStudent', /中文|北交/);
  spot('chef', /炒|火候/);
  spot('dormAunt', /宿舍|锁门/);
  spot('librarian', /书|借|馆/);
  spot('rider', /外卖|餐/);
  spot('coach', /体测|操场/);
  spot('doctor', /医|体温|药/);
  assert.deepEqual(npc.linesFor('unknown'), []);
});

test('路线坐标都在地图范围内，右侧道路经过南门、宾馆、逸夫楼、图书馆、宿舍', () => {
  for (const [key, route] of Object.entries(npc.ROUTES)) {
    assert.ok(route.length >= 2, key);
    for (const point of route) assert.ok(point.x >= 0 && point.x <= 100 && point.y >= 0 && point.y <= 100, key + ' 坐标');
  }
  assert.deepEqual(npc.ROUTES.road, [
    { x: 30.57, y: 78.17 }, { x: 64.67, y: 62.82 }, { x: 92.74, y: 73.28 },
    { x: 76.18, y: 43.82 }, { x: 77.35, y: 20.66 }
  ]);
  // 各区域路线与对应地标按钮坐标一致：南门区域、宿舍生活区、校医院、操场。
  assert.deepEqual(npc.ROUTES.south, [{ x: 30.57, y: 78.17 }, { x: 64.67, y: 62.82 }]);
  assert.deepEqual(npc.ROUTES.dormRoad, [{ x: 77.35, y: 20.66 }, { x: 76.18, y: 43.82 }]);
  assert.deepEqual(npc.ROUTES.hospitalLine, [{ x: 76.18, y: 43.82 }, { x: 87.93, y: 39.34 }]);
  assert.deepEqual(npc.ROUTES.north, [{ x: 44.58, y: 5.39 }, { x: 44.22, y: 28.8 }]);
});

test('首次出现 2.5～6 秒内，生成间隔 12～30 秒，场上最多三人，寿命 40～70 秒', () => {
  const system = npc.createSystem({ random: makeRandom('spawn-gap') });
  assert.equal(system.tick(0).spawned.length, 0);
  const first = system.tick(7000);
  assert.equal(first.spawned.length, 1);
  const spawns = [{ time: 7000, npc: first.spawned[0] }];
  let lastRemovalAt = 0;
  for (let t = 7000; t < 7000 + 300 * 1000; t += 1000) {
    const events = system.tick(t);
    for (const spawned of events.spawned) spawns.push({ time: t, npc: spawned });
    if (events.removed.length) lastRemovalAt = t;
    assert.ok(system.count() <= 3, '场上不超过三人');
    for (const npc of system.active()) {
      if (npc.identityId === 'driver') continue;
      assert.ok(npc.lifetime >= 40000 && npc.lifetime <= 70000, '普通 NPC 寿命 40～70 秒');
    }
  }
  assert.ok(spawns.length >= 5, '长跑期间至少出现 5 次');
  for (let i = 1; i < spawns.length; i++) {
    const interval = spawns[i].time - spawns[i - 1].time;
    assert.ok(interval >= 12000, '生成间隔不少于 12 秒');
    // 两次生成之间没有 NPC 离场时，间隔由重排期决定：不超过 30 秒加一次滴答。
    if (lastRemovalAt < spawns[i - 1].time) assert.ok(interval <= 31000, '无离场时生成间隔不超过 30 秒');
  }
});

test('移动沿路线推进、坐标始终在地图内，寿命到期离场', () => {
  const system = npc.createSystem({ random: makeRandom('walk'), settings: { firstDelay: [0, 0] } });
  // 班车是 16～22 秒的短命特殊身份，这里找一位普通身份观察行走与 40 秒寿命。
  let picked = null;
  for (let t = 0; t < 120000 && !picked; t += 1000) {
    const { spawned } = system.tick(t);
    const ordinary = spawned.find((item) => item.identityId !== 'driver');
    if (ordinary) picked = { npc: ordinary, at: t };
  }
  assert.ok(picked, '能找到非班车的偶遇对象');
  const id = picked.npc.id;
  const start = { x: picked.npc.x, y: picked.npc.y };
  let removedAt = null;
  for (let t = picked.at + 1000; t < picked.at + 80000; t += 1000) {
    system.tick(t);
    const current = system.active().find((item) => item.id === id);
    if (!current) { removedAt = t; break; }
    assert.ok(current.x >= 0 && current.x <= 100 && current.y >= 0 && current.y <= 100, '坐标在地图内');
  }
  assert.ok(removedAt !== null && removedAt >= picked.at + 40000, '寿命到期后离场且不早于 40 秒');
  assert.ok(start.x >= 0 && start.y >= 0);
});

test('班车沿右侧道路单程行驶，到站停留片刻后离场，寿命内不会重复出现', () => {
  // 用确定性种子找到一个很快刷出班车的开局，断言司机行为。
  let found = null;
  for (let seed = 0; seed < 60 && !found; seed++) {
    const system = npc.createSystem({ random: makeRandom('driver-scan-' + seed), settings: { firstDelay: [0, 0], gap: [0, 0] } });
    for (let t = 0; t < 60000 && !found; t += 200) {
      const events = system.tick(t);
      for (const spawned of events.spawned) {
        if (spawned.identityId !== 'driver') continue;
        found = { system, spawnedAt: t, npc: spawned };
        break;
      }
    }
  }
  assert.ok(found, '60 个种子内能找到班车开局');
  const { system, spawnedAt, npc: driver } = found;
  assert.equal(driver.mode, 'once');
  assert.deepEqual(driver.route, npc.ROUTES.road);
  assert.ok(driver.lifetime >= 16000 && driver.lifetime <= 22000, '班车寿命 16～22 秒');
  let removedAt = null;
  for (let t = spawnedAt + 500; t <= spawnedAt + 23000; t += 500) {
    const events = system.tick(t);
    if (events.removed.some((item) => item.id === driver.id)) { removedAt = t; break; }
  }
  assert.ok(removedAt !== null, '班车在 23 秒内离场');
  assert.ok(removedAt - spawnedAt <= 22000 + 1500 + 500, '离场不晚于寿命加停留');
});

test('速度单位回归：学生每秒移动 1.1 个地图百分比，而不是毫秒当秒', () => {
  // 曾经的 bug：把毫秒当秒用，每秒走 1100 个单位，人物瞬移绕圈。此测试防止复发。
  const system = npc.createSystem({ random: () => 0, settings: { firstDelay: [0, 0], gap: [600000, 600000] } });
  const { spawned } = system.tick(0);
  assert.equal(spawned.length, 1);
  assert.equal(spawned[0].identityId, 'student');
  const start = { x: spawned[0].x, y: spawned[0].y };
  system.tick(1000);
  let current = system.active()[0];
  assert.ok(Math.abs(Math.hypot(current.x - start.x, current.y - start.y) - 1.1) < 1e-6, '一秒位移应为 1.1');
  system.tick(2000);
  current = system.active()[0];
  assert.ok(Math.abs(Math.hypot(current.x - start.x, current.y - start.y) - 2.2) < 1e-6, '两秒位移应为 2.2');
});

test('速度单位回归：班车每秒走 7 个百分比，约 18 秒驶完全程而非一帧消失', () => {
  const system = npc.createSystem({ random: () => 0.95, settings: { firstDelay: [0, 0], gap: [600000, 600000] } });
  const { spawned } = system.tick(0);
  assert.equal(spawned.length, 1);
  assert.equal(spawned[0].identityId, 'driver');
  const id = spawned[0].id;
  for (let t = 1000; t <= 17000; t += 1000) system.tick(t);
  const onRoad = system.active().find((item) => item.id === id);
  assert.ok(onRoad && onRoad.routeDone === false, '17 秒后班车仍在右侧道路上');
  let removedAt = null;
  for (let t = 18000; t <= 31000; t += 1000) {
    const events = system.tick(t);
    if (events.removed.some((item) => item.id === id)) { removedAt = t; break; }
  }
  assert.ok(removedAt !== null && removedAt >= 18000 + 1500, '驶完全程并停留片刻后离场');
});

test('maxActive 可配置且严格生效', () => {
  const system = npc.createSystem({ random: makeRandom('cap'), settings: { firstDelay: [0, 0], gap: [0, 0], maxActive: 2 } });
  for (let t = 0; t < 5000; t += 100) system.tick(t);
  assert.equal(system.count(), 2);
});

test('lifetime 可通过 settings 配置，快速离场便于验收', () => {
  const system = npc.createSystem({ random: makeRandom('lifetime-cfg'), settings: { firstDelay: [0, 0], gap: [0, 0], lifetime: [3000, 5000] } });
  // 班车自带寿命，跳过班车观察普通身份的配置寿命。
  let picked = null;
  for (let t = 0; t < 30000 && !picked; t += 500) {
    const { spawned } = system.tick(t);
    const ordinary = spawned.find((item) => item.identityId !== 'driver');
    if (ordinary) picked = { npc: ordinary, at: t };
  }
  assert.ok(picked, '能找到非班车身份');
  assert.ok(picked.npc.lifetime >= 3000 && picked.npc.lifetime <= 5000, '配置的寿命生效');
  let removedAt = null;
  for (let t = picked.at + 500; t <= picked.at + 8000; t += 500) {
    const events = system.tick(t);
    if (events.removed.some((item) => item.id === picked.npc.id)) { removedAt = t; break; }
  }
  assert.ok(removedAt !== null && removedAt - picked.at <= 5000 + 500, '配置寿命内离场');
});
