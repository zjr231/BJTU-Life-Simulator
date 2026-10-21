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

  function tone(options) {
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = options.type || 'sine';
    osc.frequency.setValueAtTime(options.freq, options.time);
    if (options.slideTo) osc.frequency.exponentialRampToValueAtTime(options.slideTo, options.time + options.duration);
    const peak = options.gain || 0.2;
    gainNode.gain.setValueAtTime(0.0001, options.time);
    gainNode.gain.exponentialRampToValueAtTime(peak, options.time + (options.attack || 0.005));
    gainNode.gain.exponentialRampToValueAtTime(0.0001, options.time + options.duration);
    osc.connect(gainNode);
    gainNode.connect(options.bus || sfxBus);
    osc.start(options.time);
    osc.stop(options.time + options.duration + 0.05);
    return osc;
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
    click(now) { noiseHit({ time: now, duration: 0.05, freq: 2200, q: 0.8, gain: 0.12 }); tone({ time: now, freq: 880, duration: 0.05, gain: 0.05 }); },
    success(now) { tone({ time: now, freq: 659.25, duration: 0.22, gain: 0.16 }); tone({ time: now + 0.09, freq: 783.99, duration: 0.3, gain: 0.16 }); },
    deny(now) { tone({ time: now, freq: 130.81, duration: 0.18, gain: 0.14 }); },
    event(now) { tone({ time: now, freq: 880, duration: 1.1, gain: 0.14 }); tone({ time: now, freq: 1318.5, duration: 1.4, gain: 0.05 }); },
    study(now) { tone({ time: now, freq: 523.25, duration: 0.16, gain: 0.16 }); tone({ time: now + 0.08, freq: 659.25, duration: 0.22, gain: 0.16 }); },
    relax(now) { tone({ time: now, freq: 220, duration: 0.5, type: 'triangle', attack: 0.03, gain: 0.14 }); tone({ time: now + 0.12, freq: 261.63, duration: 0.6, type: 'triangle', attack: 0.03, gain: 0.14 }); },
    sport(now) { tone({ time: now, freq: 329.63, duration: 0.1, gain: 0.16 }); tone({ time: now + 0.07, freq: 392, duration: 0.14, gain: 0.16 }); },
    opportunity(now) { tone({ time: now, freq: 523.25, duration: 0.12, gain: 0.15 }); tone({ time: now + 0.06, freq: 659.25, duration: 0.12, gain: 0.15 }); tone({ time: now + 0.12, freq: 783.99, duration: 0.2, gain: 0.15 }); },
    info(now) { tone({ time: now, freq: 261.63, duration: 0.3, gain: 0.1 }); },
    paper(now) { noiseHit({ time: now, duration: 0.22, freq: 1200, slideTo: 380, q: 0.7, gain: 0.16 }); tone({ time: now + 0.1, freq: 659.25, duration: 0.5, gain: 0.12 }); },
    transition(now) { tone({ time: now, freq: 440, duration: 0.28, slideTo: 660, gain: 0.1 }); },
    fanfare(now) { [523.25, 659.25, 783.99, 880].forEach((freq, index) => tone({ time: now + index * 0.09, freq, duration: 0.5, gain: 0.14 })); },
    save(now) { tone({ time: now, freq: 1046.5, duration: 0.08, gain: 0.1 }); },
    load(now) { tone({ time: now, freq: 587.33, duration: 0.12, gain: 0.12 }); tone({ time: now + 0.08, freq: 880, duration: 0.2, gain: 0.12 }); },
    toast(now) { tone({ time: now, freq: 600, duration: 0.05, gain: 0.08 }); }
  };

  // 背景音乐：24 秒循环。四个和弦各 6 秒，三角波铺底加五声音阶拨弦，
  // 慢速、安静，贴合校园漫步的节奏。
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
      BGM_MELODY[segment].forEach((freq, index) => bgmSources.push(tone({ time: base + 0.2 + index * 1.5, freq, duration: 0.9, gain: 0.075, bus: bgmBus })));
      if (segment === 1 || segment === 3) bgmSources.push(tone({ time: base + 5.3, freq: 1760, duration: 1.6, gain: 0.02, bus: bgmBus }));
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
