(function (root) {
  'use strict';
  const WIDTH = 960;
  const HEIGHT = 600;
  const FLOOR = 520;
  const COURT = { width: WIDTH, height: HEIGHT, floor: FLOOR };
  const BALL_START = { x: 210, y: 470, radius: 18 };
  const RIM = { y: 250, width: 96, minX: 720, maxX: 800, speed: 0.85 };
  const RIM_EDGE_RADIUS = 3;
  const RIM_RESTITUTION = 0.55;
  const RIM_FRICTION = 0.2;
  const BACKBOARD = { offsetX: RIM.width / 2 + 22, width: 18, top: 160, height: 180, restitution: 0.55 };
  const BOARD_FRICTION = 0.3;
  const BALL_RESTITUTION = 0.55;
  const BALL_FRICTION = 0.2;
  const GRAVITY = 1100;
  const PHYSICS_SCALE = 100;
  const PHYSICS_STEP = 1 / 120;
  const VELOCITY_ITERATIONS = 8;
  const POSITION_ITERATIONS = 3;
  const DRAG_LIMIT = 250;
  const LAUNCH_SCALE = 4;
  const RESET_DELAY = 0.55;
  const DEFAULT_AIM = { angle: -Math.PI * 64 / 180, power: 1000 };
  const SHOT_INTERVAL = 0.5;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const planck = root.planck || (typeof require === 'function' ? require('./vendor/planck.min.js') : null);
  if (!planck) throw new Error('篮球物理引擎 Planck.js 未加载');
  const { World, Circle, Box } = planck;

  function rimPosition(elapsed) {
    const center = (RIM.minX + RIM.maxX) / 2;
    return center + Math.sin(elapsed * RIM.speed) * ((RIM.maxX - RIM.minX) / 2);
  }

  function crossesRim(previous, next, rimX) {
    if (!previous || !next || next.vy <= 0) return false;
    if (previous.y > RIM.y || next.y < RIM.y) return false;
    const half = RIM.width / 2;
    return next.x >= rimX - half && next.x <= rimX + half;
  }

  function launchVelocity(drag) {
    const length = Math.hypot(drag.x, drag.y);
    const scale = length > DRAG_LIMIT ? DRAG_LIMIT / length : 1;
    return { vx: drag.x * scale * LAUNCH_SCALE, vy: drag.y * scale * LAUNCH_SCALE };
  }

  function spinForVelocity(velocity) {
    const power = Math.hypot(velocity.vx, velocity.vy);
    const direction = velocity.vx < 0 ? 1 : -1;
    return direction * clamp(power / 1000, 0, 1) * 12;
  }

  function createBallBody(world) {
    return world.createBody({
      type: 'dynamic',
      position: { x: BALL_START.x / PHYSICS_SCALE, y: BALL_START.y / PHYSICS_SCALE },
      bullet: true
    });
  }

  function createPhysicsWorld(options = {}) {
    const onContact = typeof options.onContact === 'function' ? options.onContact : () => {};
    const initialRimX = Number.isFinite(options.rimX) ? options.rimX : rimPosition(0);
    const world = new World({ gravity: { x: 0, y: GRAVITY / PHYSICS_SCALE } });
    const hoop = world.createBody({
      type: 'kinematic',
      position: { x: initialRimX / PHYSICS_SCALE, y: RIM.y / PHYSICS_SCALE }
    });
    for (const side of [-1, 1]) {
      const fixture = hoop.createFixture({
        shape: new Circle({ x: side * RIM.width / 2 / PHYSICS_SCALE, y: 0 }, RIM_EDGE_RADIUS / PHYSICS_SCALE),
        friction: RIM_FRICTION,
        restitution: RIM_RESTITUTION
      });
      fixture.setUserData('rim');
    }
    const board = hoop.createFixture({
      shape: new Box(
        BACKBOARD.width / 2 / PHYSICS_SCALE,
        BACKBOARD.height / 2 / PHYSICS_SCALE,
        {
          x: (BACKBOARD.offsetX + BACKBOARD.width / 2) / PHYSICS_SCALE,
          y: (BACKBOARD.top + BACKBOARD.height / 2 - RIM.y) / PHYSICS_SCALE
        }
      ),
      friction: BOARD_FRICTION,
      restitution: BACKBOARD.restitution
    });
    board.setUserData('board');
    const connectorLength = BACKBOARD.offsetX - RIM.width / 2;
    const connector = hoop.createFixture({
      shape: new Box(
        connectorLength / 2 / PHYSICS_SCALE,
        3 / PHYSICS_SCALE,
        {
          x: (RIM.width / 2 + connectorLength / 2) / PHYSICS_SCALE,
          y: 0
        }
      ),
      friction: RIM_FRICTION,
      restitution: RIM_RESTITUTION
    });
    connector.setUserData('connector');
    const ball = createBallBody(world);
    const ballFixture = ball.createFixture({
      shape: new Circle(BALL_START.radius / PHYSICS_SCALE),
      density: 1,
      friction: BALL_FRICTION,
      restitution: BALL_RESTITUTION,
      filterGroupIndex: -1
    });
    ballFixture.setUserData('ball');
    ball.setActive(false);
    world.on('begin-contact', (contact) => {
      const first = contact.getFixtureA();
      const second = contact.getFixtureB();
      if (first.getBody() === hoop && second.getBody() === hoop) return;
      const other = first.getBody() === hoop ? second : first;
      if (other.getBody() === hoop) return;
      const label = other.getUserData();
      if (label) onContact(label, other.getBody());
    });
    const createBall = () => {
      const extra = createBallBody(world);
      const fixture = extra.createFixture({
        shape: new Circle(BALL_START.radius / PHYSICS_SCALE),
        density: 1,
        friction: BALL_FRICTION,
        restitution: BALL_RESTITUTION,
        filterGroupIndex: -1
      });
      fixture.setUserData('ball');
      extra.setActive(false);
      return { body: extra, fixture };
    };
    return { world, hoop, board, ball, ballFixture, createBall };
  }

  function setRimPosition(physics, elapsed) {
    const x = rimPosition(elapsed) / PHYSICS_SCALE;
    physics.hoop.setTransform({ x, y: RIM.y / PHYSICS_SCALE }, 0);
    physics.hoop.setLinearVelocity({ x: 0, y: 0 });
  }

  function resetBallBody(body, fixture) {
    body.setActive(false);
    body.setTransform({ x: BALL_START.x / PHYSICS_SCALE, y: BALL_START.y / PHYSICS_SCALE }, 0);
    body.setLinearVelocity({ x: 0, y: 0 });
    body.setAngularVelocity(0);
    body.setAngle(0);
    fixture.setSensor(false);
  }

  function resetPhysicsBall(physics) {
    resetBallBody(physics.ball, physics.ballFixture);
  }

  function activateBallBody(body, fixture, velocity) {
    body.setActive(true);
    body.setTransform({ x: BALL_START.x / PHYSICS_SCALE, y: BALL_START.y / PHYSICS_SCALE }, 0);
    body.setLinearVelocity({ x: velocity.vx / PHYSICS_SCALE, y: velocity.vy / PHYSICS_SCALE });
    body.setAngle(0);
    body.setAngularVelocity(spinForVelocity(velocity));
    body.setAwake(true);
    fixture.setSensor(false);
  }

  function activatePhysicsBall(physics, velocity) {
    activateBallBody(physics.ball, physics.ballFixture, velocity);
  }

  function syncBallState(body, ball) {
    const position = body.getPosition();
    const velocity = body.getLinearVelocity();
    ball.x = position.x * PHYSICS_SCALE;
    ball.y = position.y * PHYSICS_SCALE;
    ball.vx = velocity.x * PHYSICS_SCALE;
    ball.vy = velocity.y * PHYSICS_SCALE;
    ball.angle = body.getAngle();
  }

  function simulateShot(options = {}) {
    const angle = Number.isFinite(options.angle) ? options.angle : DEFAULT_AIM.angle;
    const power = Number.isFinite(options.power) ? options.power : DEFAULT_AIM.power;
    const rimMotion = options.rimMotion !== false;
    const startDelay = Number.isFinite(options.startDelay) ? options.startDelay : 0.1;
    const contacts = [];
    const physics = createPhysicsWorld({ onContact: (label) => contacts.push(label) });
    let time = 0;
    let launched = false;
    let scored = false;
    let done = false;
    let previous = { x: BALL_START.x, y: BALL_START.y };
    for (let step = 0; step < 600 && !done; step += 1) {
      time += PHYSICS_STEP;
      if (!launched && time >= startDelay) {
        activatePhysicsBall(physics, { vx: Math.cos(angle) * power, vy: Math.sin(angle) * power });
        launched = true;
      }
      if (rimMotion) setRimPosition(physics, time);
      physics.world.step(PHYSICS_STEP, VELOCITY_ITERATIONS, POSITION_ITERATIONS);
      if (!launched) continue;
      const position = physics.ball.getPosition();
      const x = position.x * PHYSICS_SCALE;
      const y = position.y * PHYSICS_SCALE;
      const rimX = rimPosition(time);
      if (!scored && previous.y <= RIM.y && y > RIM.y && x >= rimX - RIM.width / 2 && x <= rimX + RIM.width / 2) {
        scored = true;
      }
      if (y > FLOOR + 80 || x > WIDTH + 80 || x < -80 || time - startDelay > 4) done = true;
      previous = { x, y };
    }
    const end = physics.ball.getPosition();
    return {
      scored,
      done,
      contacts,
      time,
      end: { x: end.x * PHYSICS_SCALE, y: end.y * PHYSICS_SCALE }
    };
  }
  function createSession(options) {
    const canvas = options.canvas;
    const context = canvas && canvas.getContext && canvas.getContext('2d');
    if (!context) throw new Error('当前浏览器不支持 Canvas');
    const durationMs = Number(options.durationMs) || 60000;
    const maxHits = Number(options.maxHits) || 60;
    const pointsPerHit = Number(options.pointsPerHit) || 3;
    const onFinish = typeof options.onFinish === 'function' ? options.onFinish : () => {};
    const onTick = typeof options.onTick === 'function' ? options.onTick : () => {};
    const onScore = typeof options.onScore === 'function' ? options.onScore : () => {};
    const reducedMotion = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
    let view = { scale: 1, offsetX: 0, offsetY: 0, dpr: 1 };
    let frame = null;
    let last = 0;
    let elapsed = 0;
    let paused = false;
    let finished = false;
    let dragging = false;
    let drag = { x: 0, y: 0 };
    let lastShotAt = -Infinity;
    let hudKey = '';
    let keyboard = { ...DEFAULT_AIM };
    let netPhase = 0;
    let netKick = 0;
    let boardFlash = 0;
    let rimFlash = 0;
    let physicsTime = 0;
    let physicsAccumulator = 0;
    const popups = [];
    const state = {
      hits: 0,
      score: 0,
      shots: 0,
      balls: []
    };
    const physics = createPhysicsWorld({
      onContact: (label, body) => {
        const record = state.balls.find((item) => item.body === body);
        if (!record) return;
        if (label === 'rim' || label === 'connector') {
          record.rimHit = 0.18;
          rimFlash = 0.18;
          netKick = Math.max(netKick, 0.45);
        } else if (label === 'board') {
          record.boardHit = 0.18;
          boardFlash = 0.18;
        }
      }
    });
    state.balls.push(makeBallRecord(physics.ball, physics.ballFixture));
    resetBall();

    function setTransform() {
      const rect = canvas.getBoundingClientRect();
      const width = rect.width || WIDTH;
      const height = rect.height || HEIGHT;
      const dpr = Math.min(2, root.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      const scale = Math.min(width / WIDTH, height / HEIGHT);
      view = { scale, offsetX: (width - WIDTH * scale) / 2, offsetY: (height - HEIGHT * scale) / 2, dpr };
      context.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * view.offsetX, dpr * view.offsetY);
    }

    function eventPoint(event) {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      return { x: (x - view.offsetX) / view.scale, y: (y - view.offsetY) / view.scale };
    }

    function makeBallRecord(body, fixture) {
      return {
        body,
        fixture,
        x: BALL_START.x,
        y: BALL_START.y,
        vx: 0,
        vy: 0,
        angle: 0,
        life: 0,
        launchTime: 0,
        scored: false,
        counted: false,
        done: true,
        rimHit: 0,
        boardHit: 0
      };
    }

    function resetBall() {
      for (const record of state.balls) {
        resetBallBody(record.body, record.fixture);
        record.x = BALL_START.x;
        record.y = BALL_START.y;
        record.angle = 0;
        record.scored = false;
        record.counted = false;
        record.done = true;
        record.rimHit = 0;
        record.boardHit = 0;
      }
      physicsAccumulator = 0;
      dragging = false;
      drag = { x: 0, y: 0 };
    }

    function launch(velocity) {
      if (finished) return;
      if (!state.balls.some((item) => !item.done)) physicsTime = elapsed / 1000;
      setRimPosition(physics, physicsTime);
      let record = state.balls.find((item) => item.done);
      if (!record) {
        const { body, fixture } = physics.createBall();
        record = makeBallRecord(body, fixture);
        state.balls.push(record);
      }
      record.x = BALL_START.x;
      record.y = BALL_START.y;
      record.vx = velocity.vx;
      record.vy = velocity.vy;
      record.angle = 0;
      record.life = 0;
      record.launchTime = physicsTime;
      record.scored = false;
      record.counted = false;
      record.done = false;
      record.rimHit = 0;
      record.boardHit = 0;
      activateBallBody(record.body, record.fixture, velocity);
      physicsAccumulator = 0;
      lastShotAt = elapsed / 1000;
      state.shots++;
      dragging = false;
    }

    function canShoot() {
      return !finished && !paused && elapsed / 1000 - lastShotAt >= SHOT_INTERVAL;
    }

    function canShowAim() {
      return !finished && !paused;
    }

    function startShot(velocity) {
      if (!canShoot()) return false;
      launch(velocity);
      return true;
    }

    function finish() {
      if (finished) return;
      finished = true;
      dragging = false;
      if (frame !== null) root.cancelAnimationFrame(frame);
      frame = null;
      removeListeners();
      onFinish({ hits: state.hits, score: state.score, shots: state.shots, timeLeft: Math.max(0, durationMs - elapsed) });
    }

    function pause() {
      paused = true;
    }

    function resume() {
      if (finished) return;
      paused = false;
      last = 0;
      if (frame === null) frame = root.requestAnimationFrame(tick);
    }

    function onPointerDown(event) {
      if (finished || paused) return;
      event.preventDefault();
      const point = eventPoint(event);
      drag = { x: point.x - BALL_START.x, y: point.y - BALL_START.y };
      const length = Math.hypot(drag.x, drag.y);
      if (length > DRAG_LIMIT) drag = { x: drag.x / length * DRAG_LIMIT, y: drag.y / length * DRAG_LIMIT };
      if (length >= 16 && canShoot()) startShot(launchVelocity(drag));
    }

    function onPointerMove(event) {
      if (finished || paused) return;
      event.preventDefault();
      const point = eventPoint(event);
      drag = { x: point.x - BALL_START.x, y: point.y - BALL_START.y };
      const length = Math.hypot(drag.x, drag.y);
      if (length > DRAG_LIMIT) drag = { x: drag.x / length * DRAG_LIMIT, y: drag.y / length * DRAG_LIMIT };
    }

    function onPointerUp() {
      dragging = false;
    }

    function onPointerCancel() {
      dragging = false;
    }

    function keyboardAimDrag() {
      const length = Math.min(DRAG_LIMIT, keyboard.power / LAUNCH_SCALE);
      return { x: Math.cos(keyboard.angle) * length, y: Math.sin(keyboard.angle) * length };
    }

    function onKeyDown(event) {
      if (finished) return;
      if (event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault();
        if (canShoot()) {
          const length = Math.hypot(drag.x, drag.y);
          const velocity = length >= 16
            ? launchVelocity(drag)
            : { vx: Math.cos(keyboard.angle) * keyboard.power, vy: Math.sin(keyboard.angle) * keyboard.power };
          startShot(velocity);
        }
      } else if (event.key === 'ArrowLeft') {
        keyboard.angle -= 0.0175;
        drag = keyboardAimDrag();
        event.preventDefault();
      } else if (event.key === 'ArrowRight') {
        keyboard.angle += 0.0175;
        drag = keyboardAimDrag();
        event.preventDefault();
      } else if (event.key === 'ArrowUp') {
        keyboard.power = clamp(keyboard.power + 20, 620, 1100);
        drag = keyboardAimDrag();
        event.preventDefault();
      } else if (event.key === 'ArrowDown') {
        keyboard.power = clamp(keyboard.power - 20, 620, 1100);
        drag = keyboardAimDrag();
        event.preventDefault();
      }
    }

    function onVisibility() {
      if (root.document && root.document.hidden) pause();
      else resume();
    }

    function update(dt) {
      if (finished || paused) return;
      elapsed += dt * 1000;
      if (elapsed >= durationMs) {
        draw();
        finish();
        return;
      }
      boardFlash = Math.max(0, boardFlash - dt);
      rimFlash = Math.max(0, rimFlash - dt);
      netPhase = (netPhase + dt * 13) % (Math.PI * 2);
      netKick = Math.max(0, netKick - dt * 1.6);
      const hasActiveBall = state.balls.some((record) => !record.done);
      if (hasActiveBall) {
        physicsAccumulator += dt;
        let steps = 0;
        while (physicsAccumulator >= PHYSICS_STEP && steps < 8 && !finished) {
          physicsTime += PHYSICS_STEP;
          setRimPosition(physics, physicsTime);
          physics.world.step(PHYSICS_STEP, VELOCITY_ITERATIONS, POSITION_ITERATIONS);
          const rimX = rimPosition(physicsTime);
          const half = RIM.width / 2;
          for (const record of state.balls) {
            if (record.done) continue;
            const previousX = record.x;
            const previousY = record.y;
            syncBallState(record.body, record);
            record.life = physicsTime - record.launchTime;
            if (!record.scored && previousY <= RIM.y && record.y > RIM.y
              && record.x >= rimX - half && record.x <= rimX + half) {
              record.scored = true;
              record.fixture.setSensor(true);
              netKick = 1;
              netPhase = 0;
            }
            if (record.scored && !record.counted) {
              record.counted = true;
              state.hits++;
              state.score += pointsPerHit;
              popups.push({ text: '+' + pointsPerHit, x: rimX, y: RIM.y - 40, life: 0.9 });
              onScore(state);
              if (state.hits >= maxHits) {
                draw();
                finish();
                return;
              }
            }
            if (record.y > FLOOR + 80 || record.x > WIDTH + 80 || record.x < -80 || record.life > 4) {
              record.done = true;
              resetBallBody(record.body, record.fixture);
            }
          }
          physicsAccumulator -= PHYSICS_STEP;
          steps += 1;
          if (finished) break;
        }
      }
      for (let index = popups.length - 1; index >= 0; index--) {
        popups[index].life -= dt;
        popups[index].y -= dt * 40;
        if (popups[index].life <= 0) popups.splice(index, 1);
      }
      const seconds = Math.ceil((durationMs - elapsed) / 1000);
      const key = seconds + ':' + state.hits + ':' + state.score;
      if (key !== hudKey) {
        hudKey = key;
        onTick({ hits: state.hits, score: state.score, shots: state.shots, timeLeft: Math.max(0, durationMs - elapsed) });
      }
    }

    function tick(now) {
      if (finished) return;
      if (!last) last = now;
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      update(dt);
      if (!finished) {
        draw();
        frame = root.requestAnimationFrame(tick);
      }
    }

    function drawBackground() {
      const sky = context.createLinearGradient(0, 0, 0, FLOOR);
      sky.addColorStop(0, '#102f2a');
      sky.addColorStop(0.65, '#1f5144');
      sky.addColorStop(1, '#2c6a53');
      context.fillStyle = sky;
      context.fillRect(0, 0, WIDTH, FLOOR);
      context.fillStyle = 'rgba(255,255,255,.05)';
      for (let x = 40; x < WIDTH; x += 92) context.fillRect(x, 70, 38, 120);
      const floor = context.createLinearGradient(0, FLOOR, 0, HEIGHT);
      floor.addColorStop(0, '#b9793d');
      floor.addColorStop(1, '#6c3f21');
      context.fillStyle = floor;
      context.fillRect(0, FLOOR, WIDTH, HEIGHT - FLOOR);
      context.strokeStyle = 'rgba(255,240,200,.18)';
      context.lineWidth = 2;
      for (let y = FLOOR + 14; y < HEIGHT; y += 18) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(WIDTH, y);
        context.stroke();
      }
      context.strokeStyle = 'rgba(255,245,220,.45)';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(0, FLOOR);
      context.lineTo(WIDTH, FLOOR);
      context.stroke();
      context.setLineDash([10, 10]);
      context.strokeStyle = 'rgba(255,245,220,.6)';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(260, FLOOR);
      context.lineTo(260, FLOOR - 145);
      context.stroke();
      context.setLineDash([]);
      context.fillStyle = 'rgba(255,245,220,.75)';
      context.font = '700 16px sans-serif';
      context.fillText('三分线', 228, FLOOR + 34);
    }

    function drawHoop(rimX, boardHit, rimHit) {
      context.fillStyle = '#aab8b1';
      context.fillRect(rimX + BACKBOARD.offsetX + BACKBOARD.width + 2, BACKBOARD.top, 8, FLOOR - BACKBOARD.top);
      context.fillStyle = boardHit > 0 ? '#ffe28c' : '#f5f0df';
      context.fillRect(rimX + BACKBOARD.offsetX, BACKBOARD.top, BACKBOARD.width, BACKBOARD.height);
      context.strokeStyle = 'rgba(24,58,49,.45)';
      context.lineWidth = 2;
      context.strokeRect(rimX + BACKBOARD.offsetX + 1, BACKBOARD.top + 1, BACKBOARD.width - 2, BACKBOARD.height - 2);
      context.fillStyle = '#aab8b1';
      context.fillRect(rimX + RIM.width / 2, RIM.y - 3, BACKBOARD.offsetX - RIM.width / 2, 6);
      const rimColor = rimHit > 0 ? '#ffe28c' : '#df542f';
      context.strokeStyle = rimColor;
      context.lineWidth = 7;
      context.beginPath();
      context.moveTo(rimX - RIM.width / 2, RIM.y);
      context.lineTo(rimX + RIM.width / 2, RIM.y);
      context.stroke();
      context.fillStyle = rimColor;
      for (const edgeX of [rimX - RIM.width / 2, rimX + RIM.width / 2]) {
        context.beginPath();
        context.arc(edgeX, RIM.y, 3.5, 0, Math.PI * 2);
        context.fill();
      }
      context.strokeStyle = 'rgba(255,255,255,.72)';
      context.lineWidth = 1.5;
      const netTop = RIM.y + 3;
      const netBottom = RIM.y + 48;
      const sway = netKick * 10;
      for (let offset = -30; offset <= 30; offset += 10) {
        const topX = rimX + offset;
        const bottomX = rimX + offset * 0.55;
        context.beginPath();
        for (let step = 0; step <= 6; step++) {
          const t = step / 6;
          const wave = Math.sin(netPhase + t * 2.2) * sway * Math.sin(t * Math.PI / 2);
          const x = topX + (bottomX - topX) * t + wave;
          const y = netTop + (netBottom - netTop) * t + netKick * 2.5 * Math.sin(t * Math.PI);
          if (step === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.stroke();
      }
      const bottomShift = Math.sin(netPhase) * netKick * 8;
      const bottomY = netBottom + netKick * 2;
      context.beginPath();
      context.moveTo(rimX - 31 + bottomShift, bottomY);
      context.lineTo(rimX + 31 + bottomShift, bottomY);
      context.stroke();
    }

    function drawTrajectory(velocity) {
      context.save();
      context.fillStyle = 'rgba(255,226,132,.62)';
      let x = BALL_START.x;
      let y = BALL_START.y;
      let vx = velocity.vx;
      let vy = velocity.vy;
      for (let step = 0; step < 42; step++) {
        x += vx * 0.035;
        y += vy * 0.035;
        vy += GRAVITY * 0.035;
        if (y > FLOOR) break;
        context.beginPath();
        context.arc(x, y, Math.max(1.5, 4 - step * 0.07), 0, Math.PI * 2);
        context.fill();
      }
      context.restore();
    }

    function drawBall(ball) {
      context.save();
      context.globalAlpha = 0.25;
      context.fillStyle = '#071a16';
      context.beginPath();
      context.ellipse(ball.x, FLOOR + 8, 24, 7, 0, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
      context.fillStyle = '#df722f';
      context.beginPath();
      context.arc(ball.x, ball.y, BALL_START.radius, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = '#492317';
      context.lineWidth = 2.5;
      context.save();
      context.translate(ball.x, ball.y);
      context.rotate(ball.angle || 0);
      context.beginPath();
      context.arc(0, 0, BALL_START.radius, 0, Math.PI * 2);
      context.moveTo(-17, 0);
      context.lineTo(17, 0);
      context.moveTo(0, -17);
      context.lineTo(0, 17);
      context.stroke();
      context.restore();
      context.restore();
    }

    function drawPopups() {
      context.save();
      context.textAlign = 'center';
      context.font = '800 28px sans-serif';
      for (const popup of popups) {
        context.globalAlpha = Math.max(0, popup.life / 0.9);
        context.fillStyle = '#ffe28c';
        context.fillText(popup.text, popup.x, popup.y);
      }
      context.restore();
    }

    function draw() {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.fillStyle = '#071b18';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.setTransform(view.dpr * view.scale, 0, 0, view.dpr * view.scale, view.dpr * view.offsetX, view.dpr * view.offsetY);
      drawBackground();
      const rimX = rimPosition(elapsed / 1000);
      drawHoop(rimX, boardFlash, rimFlash);
      if (Math.hypot(drag.x, drag.y) >= 16) drawTrajectory(launchVelocity(drag));
      else if (canShowAim() && !reducedMotion) {
        drawTrajectory({ vx: Math.cos(keyboard.angle) * keyboard.power, vy: Math.sin(keyboard.angle) * keyboard.power });
      }
      const activeBalls = state.balls.filter((record) => !record.done);
      if (activeBalls.length) for (const record of activeBalls) drawBall(record);
      else drawBall({ x: BALL_START.x, y: BALL_START.y, angle: 0 });
      drawPopups();
      context.fillStyle = 'rgba(7,27,24,.55)';
      context.fillRect(0, HEIGHT - 34, WIDTH, 34);
      context.fillStyle = 'rgba(255,248,223,.8)';
      context.font = '600 15px sans-serif';
      context.textAlign = 'left';
      context.fillText('移动鼠标调整瞄准 · 点击直接出手 · 距离越远力度越大 · 键盘方向键调整，空格出手', 24, HEIGHT - 12);
    }

    function removeListeners() {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      canvas.removeEventListener('keydown', onKeyDown);
      root.removeEventListener('resize', setTransform);
      if (root.document) root.document.removeEventListener('visibilitychange', onVisibility);
    }

    function start() {
      setTransform();
      resetBall();
      canvas.addEventListener('pointerdown', onPointerDown);
      canvas.addEventListener('pointermove', onPointerMove);
      canvas.addEventListener('pointerup', onPointerUp);
      canvas.addEventListener('pointercancel', onPointerCancel);
      canvas.addEventListener('keydown', onKeyDown);
      root.addEventListener('resize', setTransform);
      if (root.document) root.document.addEventListener('visibilitychange', onVisibility);
      onTick({ hits: 0, score: 0, shots: 0, timeLeft: durationMs });
      frame = root.requestAnimationFrame(tick);
      return session;
    }

    function destroy() {
      if (frame !== null) root.cancelAnimationFrame(frame);
      frame = null;
      finished = true;
      removeListeners();
    }

    function getState() {
      return { hits: state.hits, score: state.score, shots: state.shots, timeLeft: Math.max(0, durationMs - elapsed), finished };
    }

    const session = { start, finish, destroy, pause, resume, getState, canvas };
    return session;
  }

  const api = { createSession, createPhysicsWorld, simulateShot, crossesRim, launchVelocity, spinForVelocity, rimPosition, COURT, BALL_START, RIM, BACKBOARD, RIM_EDGE_RADIUS, DEFAULT_AIM, GRAVITY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CampusBasketball = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
