'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('./game.js');
const basketball = require('./basketball.js');

test('投篮物理：Planck.js 碰撞、默认命中与无卡死', () => {
  const rimX = 700;
  assert.equal(basketball.crossesRim({ x: rimX, y: 240 }, { x: rimX, y: 260, vy: 120 }, rimX), true);
  assert.equal(basketball.crossesRim({ x: rimX, y: 240 }, { x: rimX, y: 260, vy: -120 }, rimX), false);
  assert.equal(basketball.crossesRim({ x: rimX, y: 260 }, { x: rimX, y: 280, vy: 120 }, rimX), false);
  assert.equal(basketball.crossesRim({ x: rimX + 60, y: 240 }, { x: rimX + 60, y: 260, vy: 120 }, rimX), false);
  const velocity = basketball.launchVelocity({ x: 1000, y: 0 });
  assert.equal(velocity.vx, 1000);
  assert.equal(velocity.vy, 0);
  const diagonal = basketball.launchVelocity({ x: 1000, y: -1000 });
  assert.ok(Math.abs(Math.hypot(diagonal.vx, diagonal.vy) - 1000) < 1e-9);
  const strongSpin = basketball.spinForVelocity({ vx: 1000, vy: -500 });
  const weakSpin = basketball.spinForVelocity({ vx: 400, vy: -200 });
  assert.ok(Math.abs(strongSpin) > Math.abs(weakSpin) && weakSpin !== 0, '力量越大篮球旋转越快');
  assert.ok(basketball.spinForVelocity({ vx: 1000, vy: -500 }) < 0, '向右投篮应带后旋');
  for (const elapsed of [0, 1, 2, 5, 10]) {
    const x = basketball.rimPosition(elapsed);
    assert.ok(x >= basketball.RIM.minX && x <= basketball.RIM.maxX);
  }

  const defaultShot = basketball.simulateShot();
  assert.equal(defaultShot.scored, true, '默认高弧线投篮应能命中移动中的初始篮筐');
  assert.equal(defaultShot.done, true);

  for (const degrees of [35, 40, 45, 50, 55, 60, 64, 68, 72]) {
    const result = basketball.simulateShot({ angle: -degrees * Math.PI / 180, power: 1000 });
    assert.equal(result.done, true);
    assert.ok(result.time < 3.5, `角度 ${degrees} 不应卡住直到超时`);
  }

  const physics = basketball.createPhysicsWorld({ rimX: 720 });
  const ball = physics.ball;
  ball.setActive(true);
  ball.setTransform({ x: (720 - 48 - 21) / 100, y: basketball.RIM.y / 100 }, 0);
  ball.setLinearVelocity({ x: 2, y: 1 });
  ball.setAwake(true);
  let reversed = false;
  for (let step = 0; step < 80 && !reversed; step += 1) {
    physics.world.step(1 / 120, 8, 3);
    reversed = ball.getLinearVelocity().x < 0;
  }
  assert.equal(reversed, true, '正面撞前筐应反弹');

  const boardPhysics = basketball.createPhysicsWorld({ rimX: 720 });
  const boardBall = boardPhysics.ball;
  const boardFront = (720 + basketball.BACKBOARD.offsetX) / 100;
  boardBall.setActive(true);
  boardBall.setTransform({ x: boardFront - basketball.BALL_START.radius / 100 - 0.1, y: basketball.RIM.y / 100 }, 0);
  boardBall.setLinearVelocity({ x: 3, y: 0 });
  boardBall.setAwake(true);
  let boardReversed = false;
  for (let step = 0; step < 60 && !boardReversed; step += 1) {
    boardPhysics.world.step(1 / 120, 8, 3);
    boardReversed = boardBall.getLinearVelocity().x < 0;
  }
  assert.equal(boardReversed, true, '篮板碰撞位置应与视觉篮板前沿一致');

  const rim = 720;
  const connectorLabels = [];
  const connectorPhysics = basketball.createPhysicsWorld({ rimX: rim });
  for (let fixture = connectorPhysics.hoop.getFixtureList(); fixture; fixture = fixture.getNext()) {
    connectorLabels.push(fixture.getUserData());
  }
  assert.ok(connectorLabels.includes('connector'), '篮筐与篮板之间应有可碰撞连接');
  assert.ok(basketball.BACKBOARD.offsetX > basketball.RIM.width / 2, '篮板应位于篮筐后方');

  const extraBall = connectorPhysics.createBall();
  assert.equal(connectorPhysics.ballFixture.getFilterGroupIndex(), -1);
  assert.equal(extraBall.fixture.getFilterGroupIndex(), -1, '多颗篮球之间不应发生碰撞');
});

test('篮球奖励按命中数映射到四档，分数为每球三分', () => {
  const cases = [
    [0, 'warmup', 0],
    [24, 'warmup', 72],
    [25, 'steady', 75],
    [49, 'steady', 147],
    [50, 'sharp', 150],
    [79, 'sharp', 237],
    [80, 'unreal', 240],
    [100, 'unreal', 300]
  ];
  for (const [hits, tier, score] of cases) {
    const reward = game.basketballReward(hits);
    assert.equal(reward.id, tier, `hits ${hits}`);
    assert.equal(reward.score, score, `hits ${hits}`);
    assert.equal(reward.hits, hits);
  }
  assert.equal(game.BASKETBALL.durationMs, 60000);
  assert.equal(game.BASKETBALL.pointsPerHit, 3);
  assert.equal(game.BASKETBALL.maxHits, Infinity);
});

test('完成篮球结算固定消耗并记录命中、得分和档位', () => {
  const state = game.createGame();
  const before = structuredClone(state);
  const result = game.completeBasketball(state, 80);
  assert.equal(result.ok, true, result.reason);
  assert.deepEqual(state, before, '结算不修改输入状态');
  assert.equal(result.entry.action, 'basketball');
  assert.equal(result.entry.hits, 80);
  assert.equal(result.entry.score, 240);
  assert.equal(result.entry.tier, 'unreal');
  assert.equal(result.entry.tierLabel, '神射手');
  assert.equal(result.entry.fitnessCost, 3);
  assert.equal(result.entry.changes.energy, -12);
  assert.equal(result.entry.changes.fitness, 12);
  assert.equal(result.entry.changes.mood, 12);
  assert.equal(result.entry.changes.social, 4);
  assert.equal(result.state.counts.basketball, 1);
  assert.equal(result.state.history[0].command.operation, 'completeBasketball');
  assert.equal(result.state.history[0].command.hits, 80);
});

test('非法命中、资源不足、次数用尽和生病都拒绝结算且不改状态', () => {
  const base = game.createGame();
  for (const hits of [-1, 1.5, '8', null, NaN, Infinity]) {
    const state = structuredClone(base);
    const before = structuredClone(state);
    const result = game.completeBasketball(state, hits);
    assert.equal(result.ok, false, String(hits));
    assert.strictEqual(result.state, state);
    assert.deepEqual(state, before);
  }

  const costs = [
    { time: 0 },
    { energy: 11 },
    { fitness: 2 }
  ];
  for (const patch of costs) {
    const state = { ...structuredClone(base), ...patch };
    const before = structuredClone(state);
    const result = game.completeBasketball(state, 8);
    assert.equal(result.ok, false, JSON.stringify(patch));
    assert.deepEqual(state, before);
  }

  const capped = { ...structuredClone(base), counts: { basketball: 2 } };
  const cappedBefore = structuredClone(capped);
  assert.equal(game.completeBasketball(capped, 8).ok, false);
  assert.deepEqual(capped, cappedBefore);

  const sick = { ...structuredClone(base), fitness: 24 };
  const sickBefore = structuredClone(sick);
  const sickResult = game.completeBasketball(sick, 8);
  assert.equal(sickResult.ok, false);
  assert.equal(sickResult.reason, game.ILLNESS_REASON);
  assert.deepEqual(sick, sickBefore);
});

test('直接执行篮球行动被拒绝，必须走小游戏结算', () => {
  const state = game.createGame();
  const before = structuredClone(state);
  const result = game.executeAction(state, 'basketball');
  assert.equal(result.ok, false);
  assert.equal(result.reason, '这项行动需要先完成小游戏');
  assert.strictEqual(result.state, state);
  assert.deepEqual(state, before);
});

test('篮球结算可校验并随整局命令精确重放', () => {
  let state = game.createGame();
  state = game.completeBasketball(state, 16).state;
  while (state.pendingEvent) state = game.submitEventChoice(state, 'later').state;
  assert.equal(game.validateState(state).ok, true);

  const replay = game.replay({
    nickname: state.nickname,
    seed: state.rng.seed,
    commands: state.history.map((entry) => entry.command)
  });
  assert.equal(replay.ok, true, replay.reason);
  assert.equal(replay.state.energy, state.energy);
  assert.equal(replay.state.fitness, state.fitness);
  assert.equal(replay.state.mood, state.mood);
  assert.equal(replay.state.social, state.social);
  assert.deepEqual(replay.state.counts, state.counts);
  assert.deepEqual(replay.state.history[0].command, state.history[0].command);
});
