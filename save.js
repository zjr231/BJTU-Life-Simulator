(function (root) {
  'use strict';
  const game = typeof module !== 'undefined' && module.exports ? require('./game.js') : root.CampusGame;
  const KEYS = { primary: 'bjtu-life:mvp:main', backup: 'bjtu-life:mvp:backup', temporary: 'bjtu-life:mvp:temporary' };
  const MAX_BYTES = 1024 * 1024;
  function parse(raw) {
    if (raw === null) return { ok: false, empty: true, reason: '尚无存档' };
    if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > MAX_BYTES) return { ok: false, reason: '存档超过 1 MB 限制' };
    try {
      const envelope = JSON.parse(raw);
      const bounded = (value, depth = 0) => {
        if (depth > 14) return false;
        if (typeof value === 'string') return value.length <= 1000;
        if (value && typeof value === 'object') return Object.keys(value).length <= 2500 && Object.entries(value).every(([key, item]) => !['__proto__', 'prototype', 'constructor'].includes(key) && bounded(item, depth + 1));
        return value === null || ['number', 'boolean'].includes(typeof value);
      };
      if (!bounded(envelope)) return { ok: false, reason: '存档结构或文本超过限制' };
      if (envelope.saveFormatVersion !== game.RULES.saveFormatVersion || envelope.rulesVersion !== game.RULES.version) return { ok: false, reason: '存档格式或规则版本不兼容；本轮不迁移旧规则档案' };
      if (typeof envelope.appVersion !== 'string' || !envelope.appVersion.length || envelope.appVersion.length > 64) return { ok: false, reason: '程序版本标记无效' };
      if (!Number.isSafeInteger(envelope.saveSequence) || envelope.saveSequence < 1 || typeof envelope.savedAt !== 'string' || !Number.isFinite(Date.parse(envelope.savedAt))) return { ok: false, reason: '存档序号或保存时间无效' };
      const checked = game.validateState(envelope.state);
      return checked.ok ? { ok: true, state: envelope.state, savedAt: envelope.savedAt, saveSequence: envelope.saveSequence } : checked;
    } catch (_) { return { ok: false, reason: '存档 JSON 损坏或字段缺失' }; }
  }
  function createSaveService(storage, options = {}) {
    let observedMain;
    let observedSequence = 0;
    const now = options.now || (() => new Date().toISOString());
    const read = (key) => {
      if (!storage) throw new Error('浏览器未允许本地存储');
      return storage.getItem(key);
    };
    function inspect() {
      try {
        const raw = read(KEYS.primary);
        const primary = parse(raw);
        const backup = parse(read(KEYS.backup));
        if (observedMain === undefined) {
          observedMain = raw;
          observedSequence = Math.max(primary.ok ? primary.saveSequence : 0, backup.ok ? backup.saveSequence : 0);
        }
        return { ok: true, primary, backup, temporary: read(KEYS.temporary) !== null };
      } catch (_) { return { ok: false, reason: '无法访问本地存储，请检查浏览器设置；当前游戏仍可继续' }; }
    }
    function load(slot = 'primary') {
      if (!['primary', 'backup'].includes(slot)) return { ok: false, reason: '未知存档位置' };
      try {
        const result = parse(read(KEYS[slot]));
        if (result.ok) {
          const main = read(KEYS.primary);
          const primary = parse(main);
          observedMain = main;
          observedSequence = Math.max(result.saveSequence, primary.ok ? primary.saveSequence : 0);
          return { ...result, state: JSON.parse(JSON.stringify(result.state)) };
        }
        return result;
      } catch (_) { return { ok: false, reason: '读取存档失败，当前进度保持不变' }; }
    }
    function save(state) {
      const checked = game.validateState(state);
      if (!checked.ok) return checked;
      if (observedMain === undefined) {
        const first = inspect();
        if (!first.ok) return first;
      }
      let stage = '读取当前存档';
      try {
        const previousRaw = read(KEYS.primary);
        if (previousRaw !== observedMain) return { ok: false, conflict: true, reason: '另一个标签页更新了存档，请先读取最新存档再保存' };
        const previous = parse(previousRaw);
        const envelope = { saveFormatVersion: game.RULES.saveFormatVersion, rulesVersion: game.RULES.version, appVersion: game.RULES.appVersion, saveSequence: Math.max(observedSequence, previous.ok ? previous.saveSequence : 0) + 1, savedAt: now(), state };
        const encoded = JSON.stringify(envelope);
        const valid = parse(encoded);
        if (!valid.ok) return valid;
        stage = '写入临时档';
        storage.setItem(KEYS.temporary, encoded);
        const temporary = read(KEYS.temporary);
        if (temporary !== encoded || !parse(temporary).ok) throw new Error('临时档回读校验失败');
        if (previous.ok) {
          stage = '备份有效主档';
          storage.setItem(KEYS.backup, previousRaw);
          if (read(KEYS.backup) !== previousRaw || !parse(read(KEYS.backup)).ok) throw new Error('备份回读校验失败');
        }
        if (read(KEYS.primary) !== previousRaw) return { ok: false, conflict: true, reason: '保存期间发现其他标签页更新，请读取最新存档' };
        stage = '替换主档';
        storage.setItem(KEYS.primary, encoded);
        stage = '确认主档';
        if (read(KEYS.primary) !== encoded || !parse(read(KEYS.primary)).ok) throw new Error('主档回读校验失败');
        observedMain = encoded;
        observedSequence = envelope.saveSequence;
        let warning = '';
        try { storage.removeItem(KEYS.temporary); } catch (_) { warning = '临时档清理失败，已保存的主档有效'; }
        return { ok: true, savedAt: envelope.savedAt, saveSequence: envelope.saveSequence, warning };
      } catch (_) {
        return { ok: false, reason: stage + '失败，当前内存进度保留。请检查存储空间与浏览器设置' };
      }
    }
    return { inspect, load, save };
  }
  const api = { KEYS, MAX_BYTES, parse, createSaveService };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CampusSave = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
