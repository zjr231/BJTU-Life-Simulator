(function (root) {
  'use strict';
  // 手机验证码登录的纯逻辑层：手机号校验、发送、验证、重发冷却、过期与错误锁定。
  // 发送通道可插拔：未配置真实通道时走演示模式，验证码随发送结果返回用于页面展示。
  // 不操作 DOM 与存储，状态仅存内存，不进入游戏存档格式。
  const PHONE_PATTERN = /^1[3-9]\d{9}$/;
  const RESEND_COOLDOWN = 60 * 1000;   // 重发间隔 60 秒
  const CODE_TTL = 5 * 60 * 1000;      // 验证码有效期 5 分钟
  const MAX_FAILURES = 3;              // 连续输错上限
  const LOCK_DURATION = 60 * 1000;     // 触发上限后锁定 1 分钟
  const CODE_LENGTH = 6;
  const pending = new Map();           // phone -> { code, sentAt, expiresAt, failures, lockedUntil }
  let transport = null;                // async (phone, code) => {}；未配置时为演示模式

  function generateCode() {
    const cryptoObj = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
    if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
      const values = new Uint32Array(CODE_LENGTH);
      cryptoObj.getRandomValues(values);
      return [...values].map((value) => value % 10).join('');
    }
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) code += Math.floor(Math.random() * 10);
    return code;
  }

  function validatePhone(phone) {
    if (typeof phone !== 'string' || !PHONE_PATTERN.test(phone)) return { ok: false, reason: '请输入 11 位大陆手机号' };
    return { ok: true };
  }

  function status(phone, now = Date.now()) {
    const entry = pending.get(phone);
    if (!entry) return { sent: false, locked: false, attemptsLeft: MAX_FAILURES };
    const locked = entry.lockedUntil > now;
    return {
      sent: true,
      locked,
      resendAfter: Math.max(0, Math.ceil((entry.sentAt + RESEND_COOLDOWN - now) / 1000)),
      attemptsLeft: locked ? 0 : MAX_FAILURES - entry.failures
    };
  }

  async function send(phone, now = Date.now()) {
    const checked = validatePhone(phone);
    if (!checked.ok) return checked;
    const entry = pending.get(phone);
    if (entry) {
      if (entry.lockedUntil > now) return { ok: false, reason: '错误次数过多，请 1 分钟后再试' };
      if (entry.sentAt + RESEND_COOLDOWN > now) {
        return { ok: false, resendAfter: Math.ceil((entry.sentAt + RESEND_COOLDOWN - now) / 1000), reason: '发送太频繁，请稍后再试' };
      }
    }
    const code = generateCode();
    pending.set(phone, { code, sentAt: now, expiresAt: now + CODE_TTL, failures: 0, lockedUntil: 0 });
    if (transport) {
      try {
        await transport(phone, code);
      } catch (_) {
        pending.delete(phone);
        return { ok: false, reason: '验证码发送失败，请稍后再试' };
      }
    }
    const result = { ok: true, resendAfter: RESEND_COOLDOWN / 1000 };
    if (!transport) result.demoCode = code; // 演示模式：验证码直接随结果返回展示
    return result;
  }

  function verify(phone, code, now = Date.now()) {
    const checked = validatePhone(phone);
    if (!checked.ok) return checked;
    const entry = pending.get(phone);
    if (!entry) return { ok: false, reason: '请先获取验证码' };
    if (entry.lockedUntil > now) return { ok: false, reason: '错误次数过多，请 1 分钟后再试' };
    if (entry.expiresAt <= now) {
      pending.delete(phone);
      return { ok: false, reason: '验证码已过期，请重新获取' };
    }
    if (String(code) !== entry.code) {
      entry.failures += 1;
      if (entry.failures >= MAX_FAILURES) {
        entry.lockedUntil = now + LOCK_DURATION;
        entry.failures = 0;
        return { ok: false, reason: '连续输错 3 次，已锁定 1 分钟' };
      }
      return { ok: false, attemptsLeft: MAX_FAILURES - entry.failures, reason: '验证码错误，还可尝试 ' + (MAX_FAILURES - entry.failures) + ' 次' };
    }
    pending.delete(phone);
    return { ok: true };
  }

  function setTransport(fn) {
    transport = typeof fn === 'function' ? fn : null;
  }

  function clear(phone) {
    pending.delete(phone);
  }

  const api = { validatePhone, send, verify, status, setTransport, clear };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CampusSms = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
