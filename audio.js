(function (root) {
  'use strict';
  // 音效与背景音乐由 Web Audio 在浏览器内实时合成，不依赖任何外部素材或网络。
  // 偏好只保存在独立键中，不进入游戏存档格式。
  const PREF_KEY = 'bjtu-life:audio:enabled';
  let ctx = null;
  let master = null;
  let sfxBus = null;
  let bgmBus = null;
  let enabled = true;
  let bgmRequested = false;
  let bgmActive = false;
  let bgmTimer = null;
  let nextCycleAt = 0;
  let bgmSources = [];

  try { enabled = localStorage.getItem(PREF_KEY) !== 'off'; } catch (_) { /* 存储不可用时保持默认开启 */ }

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    }
    const AudioContextClass = root.AudioContext || root.webkitAudioContext;
    if (!AudioContextClass) return false;
    try {
      ctx = new AudioContextClass();
      master = ctx.createGain();
      master.gain.value = enabled ? 1 : 0;
      master.connect(ctx.destination);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = 0.5;
      sfxBus.connect(master);
      bgmBus = ctx.createGain();
      bgmBus.gain.value = 0.16;
      bgmBus.connect(master);
      return true;
    } catch (_) { return false; }
  }

  // 把声音接到总线上：支持 pan 立体声像与 echo 空间回声（干声直达 + 一拍回响落在对侧声像）。
  // 不支持 StereoPanner / Delay 的环境直接输出，不影响发声。
  function route(gainNode, bus, options) {
    const hasPanner = typeof ctx.createStereoPanner === 'function';
    const hasDelay = typeof ctx.createDelay === 'function';
    if (options.echo && hasPanner && hasDelay) {
      const delay = ctx.createDelay(1);
      delay.delayTime.value = options.echo;
      const echoGain = ctx.createGain();
      echoGain.gain.value = 0.3;
      const echoPan = ctx.createStereoPanner();
      echoPan.pan.value = options.echoPan || -0.5;
      gainNode.connect(delay);
      delay.connect(echoGain);
      echoGain.connect(echoPan);
      echoPan.connect(bus);
    }
    if (options.pan && hasPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = options.pan;
      gainNode.connect(panner);
      panner.connect(bus);
      return;
    }
    gainNode.connect(bus);
  }

  function tone(options) {
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = options.type || 'sine';
    osc.frequency.setValueAtTime(options.freq, options.time);
    if (options.detune) osc.detune.value = options.detune;
    if (options.slideTo) osc.frequency.exponentialRampToValueAtTime(options.slideTo, options.time + options.duration);
    const peak = options.gain || 0.2;
    gainNode.gain.setValueAtTime(0.0001, options.time);
    gainNode.gain.exponentialRampToValueAtTime(peak, options.time + (options.attack || 0.005));
    gainNode.gain.exponentialRampToValueAtTime(0.0001, options.time + options.duration);
    osc.connect(gainNode);
    route(gainNode, options.bus || sfxBus, options);
    osc.start(options.time);
    osc.stop(options.time + options.duration + 0.05);
    return osc;
  }

  // 铃铛音色：基频加 2.76 倍泛音更快衰减，像校园钟声而不是哔哔声。
  function bell(now, freq, duration, gain, options = {}) {
    tone({ time: now, freq, duration, gain, type: 'sine', ...options });
    tone({ time: now, freq: freq * 2.76, duration: duration * 0.55, gain: gain * 0.4, type: 'sine', ...options });
  }

  function noiseHit(options) {
    const bufferSize = Math.ceil(ctx.sampleRate * (options.duration + 0.05));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(options.freq || 2000, options.time);
    if (options.slideTo) filter.frequency.exponentialRampToValueAtTime(options.slideTo, options.time + options.duration);
    filter.Q.value = options.q || 1;
    const gainNode = ctx.createGain();
    const peak = options.gain || 0.2;
    gainNode.gain.setValueAtTime(0.0001, options.time);
    gainNode.gain.exponentialRampToValueAtTime(peak, options.time + 0.004);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, options.time + options.duration);
    source.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(options.bus || sfxBus);
    source.start(options.time);
    source.stop(options.time + options.duration + 0.05);
    return source;
  }

  const SOUNDS = {
    click(now) { noiseHit({ time: now, duration: 0.045, freq: 2400, q: 0.9, gain: 0.11 }); tone({ time: now, freq: 1200, duration: 0.04, gain: 0.035, type: 'triangle' }); },
    success(now) { tone({ time: now, freq: 659.25, duration: 0.24, gain: 0.15, type: 'triangle' }); tone({ time: now + 0.1, freq: 783.99, duration: 0.32, gain: 0.13, type: 'triangle', pan: 0.3 }); tone({ time: now + 0.1, freq: 987.77, duration: 0.26, gain: 0.05, echo: 0.18, echoPan: -0.4 }); },
    deny(now) { tone({ time: now, freq: 155, duration: 0.2, gain: 0.12, type: 'sawtooth' }); tone({ time: now + 0.02, freq: 138, duration: 0.22, gain: 0.11, type: 'sawtooth' }); tone({ time: now + 0.09, freq: 116, duration: 0.3, gain: 0.11, type: 'sawtooth' }); },
    event(now) { bell(now, 880, 1.0, 0.11); tone({ time: now + 0.05, freq: 1760, duration: 0.7, gain: 0.04, echo: 0.3 }); tone({ time: now, freq: 659.25, duration: 1.4, gain: 0.06, type: 'triangle', attack: 0.05 }); },
    study(now) { noiseHit({ time: now, duration: 0.18, freq: 900, slideTo: 500, q: 0.6, gain: 0.09 }); tone({ time: now, freq: 523.25, duration: 0.14, gain: 0.1, type: 'triangle', detune: -3 }); tone({ time: now + 0.09, freq: 659.25, duration: 0.2, gain: 0.1, type: 'triangle', detune: 3, pan: 0.25 }); },
    relax(now) { for (const [freq, detune, pan] of [[220, -4, -0.3], [220, 4, 0.3]]) tone({ time: now, freq, duration: 0.6, type: 'triangle', attack: 0.06, gain: 0.08, detune, pan }); for (const [freq, detune, pan] of [[261.63, -4, -0.25], [261.63, 4, 0.25]]) tone({ time: now + 0.14, freq, duration: 0.65, type: 'triangle', attack: 0.06, gain: 0.08, detune, pan }); },
    sport(now) { noiseHit({ time: now, duration: 0.09, freq: 3000, q: 0.5, gain: 0.09 }); tone({ time: now, freq: 392, duration: 0.09, gain: 0.13, type: 'square' }); tone({ time: now + 0.08, freq: 523.25, duration: 0.13, gain: 0.12, type: 'square', pan: 0.35 }); },
    opportunity(now) { [523.25, 659.25, 783.99].forEach((freq, index) => tone({ time: now + index * 0.07, freq, duration: 0.16, gain: 0.13, type: 'triangle', pan: (index - 1) * 0.35, echo: index === 2 ? 0.22 : 0 })); },
    info(now) { bell(now, 261.63, 0.4, 0.09); tone({ time: now + 0.03, freq: 523.25, duration: 0.3, gain: 0.035, pan: -0.3 }); },
    paper(now) { noiseHit({ time: now, duration: 0.22, freq: 1200, slideTo: 380, q: 0.7, gain: 0.14 }); tone({ time: now + 0.08, freq: 659.25, duration: 0.45, gain: 0.09, type: 'triangle' }); tone({ time: now + 0.08, freq: 783.99, duration: 0.4, gain: 0.04, pan: -0.4 }); },
    transition(now) { tone({ time: now, freq: 392, duration: 0.3, slideTo: 783.99, gain: 0.09, type: 'triangle' }); tone({ time: now + 0.06, freq: 587.33, duration: 0.26, slideTo: 880, gain: 0.05, pan: 0.4, echo: 0.2 }); },
    fanfare(now) { [523.25, 659.25, 783.99, 880].forEach((freq, index) => { tone({ time: now + index * 0.09, freq, duration: 0.5, gain: 0.13, type: 'triangle' }); tone({ time: now + index * 0.09, freq: freq * 2, duration: 0.35, gain: 0.03, pan: 0.35 }); }); tone({ time: now + 0.3, freq: 1046.5, duration: 0.7, gain: 0.07, echo: 0.25 }); },
    save(now) { tone({ time: now, freq: 1046.5, duration: 0.08, gain: 0.09 }); tone({ time: now + 0.02, freq: 1567.98, duration: 0.06, gain: 0.04, pan: 0.3 }); },
    load(now) { tone({ time: now, freq: 587.33, duration: 0.12, gain: 0.11 }); tone({ time: now + 0.08, freq: 880, duration: 0.18, gain: 0.11, type: 'triangle' }); tone({ time: now + 0.08, freq: 1174.66, duration: 0.16, gain: 0.04, pan: -0.3 }); },
    toast(now) { tone({ time: now, freq: 600, duration: 0.05, gain: 0.07, type: 'triangle' }); },
    npc(now) { tone({ time: now, freq: 587.33, duration: 0.09, gain: 0.1, type: 'triangle', detune: -4, pan: -0.25 }); tone({ time: now + 0.07, freq: 783.99, duration: 0.12, gain: 0.1, type: 'triangle', detune: 4, pan: 0.25 }); tone({ time: now + 0.07, freq: 783.99, duration: 0.16, gain: 0.04, echo: 0.18 }); }
  };

  // 背景音乐：24 秒循环。四个和弦各 6 秒：三角波和弦铺底、低八度贝斯、
  // 高八度气声三层面板，五声音阶拨弦带空间回声，后半段有长音副旋律。
  const BGM_CHORDS = [
    [130.81, 164.81, 196.0],   // C
    [110.0, 130.81, 164.81],   // Am
    [87.31, 110.0, 130.81],    // F
    [98.0, 123.47, 146.83]     // G
  ];
  const BGM_MELODY = [
    [523.25, 659.25, 783.99, 659.25],
    [440.0, 523.25, 659.25, 523.25],
    [523.25, 587.33, 659.25, 783.99],
    [587.33, 659.25, 783.99, 880.0]
  ];

  function pad(base, freq) {
    const sources = [];
    for (const detune of [-4, 4]) {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      osc.detune.value = detune;
      gainNode.gain.setValueAtTime(0.0001, base);
      gainNode.gain.exponentialRampToValueAtTime(0.035, base + 1.2);
      gainNode.gain.setValueAtTime(0.035, base + 4.4);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, base + 6.4);
      osc.connect(gainNode);
      gainNode.connect(bgmBus);
      osc.start(base);
      osc.stop(base + 6.5);
      sources.push(osc);
    }
    // 低八度贝斯与高八度气声让和弦更有厚度；慢起慢收，不抢主旋律。
    for (const [ratio, gain, attack] of [[0.5, 0.05, 2], [2, 0.016, 1.2]]) {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq * ratio;
      gainNode.gain.setValueAtTime(0.0001, base);
      gainNode.gain.exponentialRampToValueAtTime(gain, base + attack);
      gainNode.gain.setValueAtTime(gain, base + 4.4);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, base + 6.4);
      osc.connect(gainNode);
      gainNode.connect(bgmBus);
      osc.start(base);
      osc.stop(base + 6.5);
      sources.push(osc);
    }
    return sources;
  }

  function scheduleCycle(startTime) {
    if (ctx.state !== 'running') {
      // 上下文未运行时暂停排程，等待恢复后从头开始新循环。
      bgmTimer = setTimeout(() => scheduleCycle(ctx.currentTime + 0.15), 500);
      return;
    }
    bgmSources = [];
    for (let segment = 0; segment < 4; segment++) {
      const base = startTime + segment * 6;
      for (const freq of BGM_CHORDS[segment]) bgmSources.push(...pad(base, freq));
      BGM_MELODY[segment].forEach((freq, index) => bgmSources.push(tone({ time: base + 0.2 + index * 1.5, freq, duration: 0.9, gain: 0.075, bus: bgmBus, pan: index % 2 ? 0.35 : -0.35, echo: 0.4 })));
      bgmSources.push(tone({ time: base + 3.2, freq: BGM_CHORDS[segment][0] * 1.5, duration: 2.5, gain: 0.035, type: 'sine', attack: 0.6, bus: bgmBus, pan: 0.25 }));
      if (segment === 1 || segment === 3) bgmSources.push(tone({ time: base + 5.3, freq: 1760, duration: 1.6, gain: 0.02, bus: bgmBus, pan: -0.3, echo: 0.5 }));
    }
    nextCycleAt = startTime + 24;
    if (bgmActive) {
      const wait = Math.max(500, (nextCycleAt - 0.7 - ctx.currentTime) * 1000);
      bgmTimer = setTimeout(() => scheduleCycle(nextCycleAt), wait);
    }
  }

  function startBgm() {
    bgmRequested = true;
    if (!enabled || bgmActive || !ensure()) return;
    bgmActive = true;
    scheduleCycle(ctx.currentTime + 0.15);
  }

  function clearScheduled() {
    clearTimeout(bgmTimer);
    for (const source of bgmSources) { try { source.stop(); } catch (_) {} }
    bgmSources = [];
  }

  function stopBgm() {
    bgmRequested = false;
    bgmActive = false;
    clearScheduled();
  }

  function setEnabled(value) {
    enabled = !!value;
    try { localStorage.setItem(PREF_KEY, enabled ? 'on' : 'off'); } catch (_) {}
    if (enabled) {
      if (ensure() && master) master.gain.value = 1;
      if (bgmRequested) startBgm();
    } else {
      if (master) master.gain.value = 0;
      // Muting pauses playback; only leaving the game cancels its music request.
      bgmActive = false;
      clearScheduled();
    }
  }

  ['pointerdown', 'keydown', 'touchstart'].forEach((type) => root.addEventListener(type, () => { if (enabled) ensure(); }, { capture: true, once: true, passive: true }));
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (!ctx) return;
      if (document.hidden) {
        if (bgmActive) clearScheduled();
        ctx.suspend().catch(() => {});
      } else {
        ctx.resume().catch(() => {});
        if (bgmActive) scheduleCycle(ctx.currentTime + 0.15);
      }
    });
  }

  const api = { isEnabled: () => enabled, setEnabled, play: (name) => { if (!enabled || !SOUNDS[name] || !ensure()) return; SOUNDS[name](ctx.currentTime); }, startBgm, stopBgm };
  root.CampusAudio = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
