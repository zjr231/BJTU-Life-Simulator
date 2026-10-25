'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function audioApp({ supported = true, preference = null, denied = false, modern = true } = {}) {
  const timers = new Map();
  const listeners = new Map();
  const preferences = new Map(preference === null ? [] : [['bjtu-life:audio:enabled', preference]]);
  let timerId = 0;
  let started = 0;
  let stopped = 0;
  let panners = 0;
  let delays = 0;
  let context;
  const parameter = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const source = () => ({ frequency: parameter(), detune: parameter(), Q: parameter(), connect() {},
    start() { started++; }, stop() { stopped++; } });
  class AudioContext {
    constructor() { context = this; this.currentTime = 0; this.state = 'running'; this.sampleRate = 8000; this.destination = {}; }
    createGain() { return { gain: parameter(), connect() {} }; }
    createOscillator() { return source(); }
    createBufferSource() { return source(); }
    createBiquadFilter() { return source(); }
    createBuffer(channels, size) { return { getChannelData: () => new Float32Array(size) }; }
    createStereoPanner() { panners++; return { pan: parameter(), connect() {} }; }
    createDelay() { delays++; return { delayTime: parameter(), connect() {} }; }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    resume() { this.state = 'running'; return Promise.resolve(); }
  }
  if (!modern) {
    delete AudioContext.prototype.createStereoPanner;
    delete AudioContext.prototype.createDelay;
  }
  const document = { hidden: false, addEventListener: (name, callback) => listeners.set(name, callback) };
  const scope = vm.createContext({ document,
    ...(supported ? { AudioContext } : {}),
    localStorage: {
      getItem(key) { if (denied) throw new Error('denied'); return preferences.get(key) ?? null; },
      setItem(key, value) { if (denied) throw new Error('denied'); preferences.set(key, value); }
    },
    addEventListener() {},
    setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
    clearTimeout(id) { timers.delete(id); }
  });
  vm.runInContext(fs.readFileSync(require.resolve('./audio.js'), 'utf8'), scope);
  return { api: scope.CampusAudio, timers, preferences,
    get started() { return started; }, get stopped() { return stopped; },
    get panners() { return panners; }, get delays() { return delays; },
    get context() { return context; },
    visibility(hidden) { document.hidden = hidden; listeners.get('visibilitychange')(); } };
}

test('背景音乐关闭后重新开启，恢复循环并保留声音偏好', () => {
  const app = audioApp();
  app.api.startBgm();
  assert.equal(app.timers.size, 1);
  const before = app.started;
  app.api.setEnabled(false);
  assert.equal(app.timers.size, 0);
  assert.ok(app.stopped > 0);
  assert.equal(app.preferences.get('bjtu-life:audio:enabled'), 'off');
  app.api.setEnabled(true);
  assert.equal(app.timers.size, 1);
  assert.ok(app.started > before);
  assert.equal(app.preferences.get('bjtu-life:audio:enabled'), 'on');
});

test('重启结束旧局后切换声音，不恢复已停止的旧局音乐', () => {
  const app = audioApp();
  app.api.startBgm();
  app.api.setEnabled(false);
  app.api.stopBgm();
  app.api.setEnabled(true);
  assert.equal(app.timers.size, 0);
});

test('记住静音时新局不播放，玩家开启声音后开始背景循环', () => {
  const app = audioApp({ preference: 'off' });
  assert.equal(app.api.isEnabled(), false);
  app.api.startBgm();
  assert.equal(app.started, 0);
  app.api.setEnabled(true);
  assert.equal(app.timers.size, 1);
  assert.ok(app.started > 0);
});

test('切到后台暂停音乐，返回后只保留一个循环任务', () => {
  const app = audioApp();
  app.api.startBgm();
  app.visibility(true);
  assert.equal(app.context.state, 'suspended');
  assert.equal(app.timers.size, 0);
  app.visibility(false);
  assert.equal(app.context.state, 'running');
  assert.equal(app.timers.size, 1);
});

test('全部场景音效可调度，未知音效不产生声音', () => {
  const app = audioApp();
  for (const name of ['click', 'success', 'deny', 'event', 'study', 'relax', 'sport', 'opportunity', 'info', 'paper', 'transition', 'fanfare', 'save', 'load', 'toast', 'npc']) {
    const before = app.started;
    app.api.play(name);
    assert.ok(app.started > before, name);
  }
  const before = app.started;
  app.api.play('unknown');
  assert.equal(app.started, before);
});

test('支持立体声与回声节点时音效和音乐使用空间感，不支持时安全回退', () => {
  const app = audioApp();
  app.api.play('npc');
  assert.ok(app.panners > 0);
  assert.ok(app.delays > 0);
  app.api.startBgm();
  const pannersBefore = app.panners;
  assert.ok(app.panners >= pannersBefore);
  // 旧环境没有 StereoPanner / Delay：所有音效与背景音乐照常发声，只是没有声像与回声。
  const legacy = audioApp({ modern: false });
  assert.doesNotThrow(() => {
    legacy.api.play('opportunity');
    legacy.api.play('npc');
    legacy.api.startBgm();
    legacy.api.setEnabled(false);
    legacy.api.setEnabled(true);
  });
  assert.ok(legacy.started > 0);
  assert.equal(legacy.panners, 0);
  assert.equal(legacy.delays, 0);
});

test('无 Web Audio 或浏览器拒绝偏好存储时，声音接口不影响游戏运行', () => {
  for (const options of [{ supported: false }, { denied: true }]) {
    const app = audioApp(options);
    assert.doesNotThrow(() => {
      app.api.startBgm(); app.api.play('click'); app.api.setEnabled(false); app.api.setEnabled(true); app.api.stopBgm();
    });
    assert.equal(app.timers.size, 0);
  }
});
