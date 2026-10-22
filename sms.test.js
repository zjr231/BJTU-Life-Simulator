const test = require('node:test');
const assert = require('node:assert/strict');
const sms = require('./sms.js');

const PHONE = '13800138000';
const T0 = 1700000000000;
const SECOND = 1000;

test('手机号校验：11 位且 1[3-9] 开头才通过', () => {
  assert.equal(sms.validatePhone('13800138000').ok, true);
  assert.equal(sms.validatePhone('19912345678').ok, true);
  for (const bad of ['', '12800138000', '1380013800', '138001380001', 'abc', null]) {
    assert.equal(sms.validatePhone(bad).ok, false, String(bad));
  }
});

test('未获取验证码时验证被拒绝', async () => {
  const result = sms.verify(PHONE, '123456', T0);
  assert.equal(result.ok, false);
  assert.match(result.reason, /先获取验证码/);
});

test('演示模式发送返回 6 位验证码与 60 秒冷却', async () => {
  sms.clear(PHONE);
  const result = await sms.send(PHONE, T0);
  assert.equal(result.ok, true);
  assert.match(result.demoCode, /^\d{6}$/);
  assert.equal(result.resendAfter, 60);
});

test('冷却期内重发被拒，提示剩余秒数', async () => {
  const result = await sms.send(PHONE, T0 + 30 * SECOND);
  assert.equal(result.ok, false);
  assert.equal(result.resendAfter, 30);
});

test('冷却结束后重发成功，旧码作废新码可用', async () => {
  const first = await sms.send(PHONE, T0);
  const second = await sms.send(PHONE, T0 + 61 * SECOND);
  assert.equal(second.ok, true);
  assert.match(second.demoCode, /^\d{6}$/);
  assert.equal(sms.verify(PHONE, first.demoCode, T0 + 62 * SECOND).ok, false);
  assert.equal(sms.verify(PHONE, second.demoCode, T0 + 62 * SECOND).ok, true);
});

test('验证码验证通过后一次性消费', async () => {
  sms.clear(PHONE);
  const sent = await sms.send(PHONE, T0);
  assert.equal(sms.verify(PHONE, sent.demoCode, T0 + 10 * SECOND).ok, true);
  const again = sms.verify(PHONE, sent.demoCode, T0 + 11 * SECOND);
  assert.equal(again.ok, false);
  assert.match(again.reason, /先获取验证码/);
});

test('连续输错三次锁定一分钟，期间发送与验证均拒绝', async () => {
  sms.clear(PHONE);
  await sms.send(PHONE, T0);
  const wrong1 = sms.verify(PHONE, '000000', T0 + 5 * SECOND);
  assert.equal(wrong1.attemptsLeft, 2);
  const wrong2 = sms.verify(PHONE, '000000', T0 + 6 * SECOND);
  assert.equal(wrong2.attemptsLeft, 1);
  const locked = sms.verify(PHONE, '000000', T0 + 7 * SECOND);
  assert.equal(locked.ok, false);
  assert.match(locked.reason, /锁定/);
  const verifyDuringLock = sms.verify(PHONE, '000000', T0 + 8 * SECOND);
  assert.match(verifyDuringLock.reason, /1 分钟/);
  const sendDuringLock = await sms.send(PHONE, T0 + 9 * SECOND);
  assert.equal(sendDuringLock.ok, false);
  assert.equal(sms.status(PHONE, T0 + 9 * SECOND).locked, true);
});

test('锁定到期后恢复，可用原验证码继续验证', async () => {
  sms.clear(PHONE);
  const sent = await sms.send(PHONE, T0);
  sms.verify(PHONE, '000000', T0 + 1 * SECOND);
  sms.verify(PHONE, '000000', T0 + 2 * SECOND);
  sms.verify(PHONE, '000000', T0 + 3 * SECOND);
  assert.equal(sms.status(PHONE, T0 + 4 * SECOND).locked, true);
  const unlockTime = T0 + 64 * SECOND;
  assert.equal(sms.status(PHONE, unlockTime).locked, false);
  const result = sms.verify(PHONE, sent.demoCode, unlockTime);
  assert.equal(result.ok, true);
});

test('验证码超过五分钟过期，需重新获取', async () => {
  sms.clear(PHONE);
  await sms.send(PHONE, T0);
  const result = sms.verify(PHONE, '123456', T0 + 5 * 60 * SECOND + 1);
  assert.equal(result.ok, false);
  assert.match(result.reason, /过期/);
  const after = sms.verify(PHONE, '123456', T0 + 5 * 60 * SECOND + 2);
  assert.match(after.reason, /先获取验证码/);
});

test('配置发送通道后不再返回演示码，通道收到手机号与验证码', async () => {
  const calls = [];
  sms.setTransport(async (phone, code) => { calls.push([phone, code]); });
  sms.clear(PHONE);
  const result = await sms.send(PHONE, T0);
  assert.equal(result.ok, true);
  assert.equal(result.demoCode, undefined);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], PHONE);
  assert.match(calls[0][1], /^\d{6}$/);
  assert.equal(sms.verify(PHONE, calls[0][1], T0 + 1 * SECOND).ok, true);
  sms.setTransport(null);
});

test('通道发送失败时发送报错且不留半成品状态', async () => {
  sms.setTransport(async () => { throw new Error('网络不可用'); });
  sms.clear(PHONE);
  const result = await sms.send(PHONE, T0);
  assert.equal(result.ok, false);
  assert.match(result.reason, /发送失败/);
  const verifyAfter = sms.verify(PHONE, '123456', T0 + 1 * SECOND);
  assert.match(verifyAfter.reason, /先获取验证码/);
  sms.setTransport(null);
});

test('不同手机号的验证码与冷却互不干扰', async () => {
  const other = '13900139000';
  sms.clear(PHONE);
  sms.clear(other);
  const a = await sms.send(PHONE, T0);
  const b = await sms.send(other, T0);
  assert.equal(sms.verify(PHONE, b.demoCode, T0 + 1 * SECOND).ok, false);
  assert.equal(sms.verify(other, a.demoCode, T0 + 1 * SECOND).ok, false);
  assert.equal(sms.verify(PHONE, a.demoCode, T0 + 1 * SECOND).ok, true);
  assert.equal(sms.verify(other, b.demoCode, T0 + 1 * SECOND).ok, true);
});

test('未发送前状态为未发送且可尝试三次', () => {
  sms.clear(PHONE);
  const current = sms.status(PHONE, T0);
  assert.equal(current.sent, false);
  assert.equal(current.locked, false);
  assert.equal(current.attemptsLeft, 3);
});
