'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const cases = require('../qa/lin-xia-emotion-cases.json');
const { messages, plan, parseJudgment, grade, run } = require('./npc-emotion-prototype.js');

const scenario = cases.find(item => item.id === 'exam-pass');
const valid = {
  evidence: [1, 3],
  appraisal: '原本担心挂科，现在确认过线了。',
  state: 'emotion',
  main: ['释然', 2],
  secondary: null
};
const normalized = { ...valid, evidence: ['F1', 'U'] };

test('两版使用相同场景且不向模型提供参考答案，首测与复测共 80 次', () => {
  const baseline = messages(scenario, 'A');
  const experimental = messages(scenario, 'B');
  assert.notEqual(baseline[0].content, experimental[0].content);
  assert.deepEqual(baseline.slice(1), experimental.slice(1));
  assert.ok(baseline.at(-1).content.includes(scenario.latest));
  assert.ok(baseline.some(row => row.content.includes('相识度 90')));
  assert.ok(!baseline.some(row => row.content.includes(scenario.expected.reason)));
  assert.deepEqual(Object.fromEntries(Object.entries(Object.groupBy(plan(cases), job => job.trial)).map(([key, jobs]) =>
    [key, [jobs.filter(job => job.version === 'A').length, jobs.filter(job => job.version === 'B').length]])),
  { 1: [32, 32], 2: [8, 8] });
});

test('区分有效结构、强度、证据编号以及暂无判断', () => {
  assert.deepEqual(parseJudgment(JSON.stringify(valid), scenario), normalized);
  assert.deepEqual(parseJudgment(JSON.stringify({ ...valid, evidence: ['[1]', '3'] }), scenario), normalized);
  assert.deepEqual(grade(normalized, scenario), { emotion: true, strength: true, secondary: true, evidence: true });
  for (const patch of [{ main: ['释然', 4] }, { evidence: [3, 7] }, { evidence: [3, '3'] },
    { state: 'uncertain' }, { secondary: ['释然', 1] }, { say: '不应有台词' }]) {
    assert.throws(() => parseJudgment(JSON.stringify({ ...valid, ...patch }), scenario));
  }
  for (const state of ['steady', 'uncertain']) {
    assert.equal(parseJudgment(JSON.stringify({ ...valid, state, main: null }), scenario).state, state);
  }
});

test('两种相反感受应同时出现，同向感受不能凑成复合情绪', () => {
  const mixedCase = cases.find(item => item.id === 'intern-mixed');
  assert.equal(grade({ ...valid, main: ['开心', 2], secondary: ['为难', 1] }, mixedCase).secondary, true);
  assert.equal(grade({ ...valid, main: ['为难', 2], secondary: ['开心', 1] }, mixedCase).secondary, true);
  assert.equal(grade({ ...valid, main: ['开心', 2], secondary: ['欣喜', 1] }, mixedCase).secondary, false);
  assert.equal(grade({ ...valid, main: ['开心', 2] }, mixedCase).secondary, false);
});

test('中转的原始回复和解析失败都进入同一份测试记录', async () => {
  const job = { scenario, version: 'B', trial: 1 };
  const raw = JSON.stringify(valid);
  const reply = text => async () => ({ ok: true, json: async () => ({ reply: text }) });
  const ok = await run(job, reply(raw));
  assert.equal(ok.raw, raw);
  assert.deepEqual(ok.judgment, normalized);
  const invalid = await run(job, reply(raw.slice(0, -4)));
  assert.equal(invalid.raw, raw.slice(0, -4));
  assert.equal(invalid.checks, null);
  assert.ok(invalid.error);
  const unavailable = await run(job, async () => ({ ok: false, status: 503, json: async () => ({ error: '离线' }) }));
  assert.match(unavailable.error, /503/);
});
