'use strict';

const assert = require('node:assert/strict');
const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');
const game = require('../game.js');
const cases = require('../qa/lin-xia-emotion-cases.json');

const npcId = 'linXia';
const statuses = { emotion: '有情绪波动', steady: '无明显波动', uncertain: '依据不足' };
const versions = {
  A: '先直接判断林夏此刻的情绪，再说明依据和这件事对她的意义。输出字段顺序为 state、main、secondary、evidence、appraisal。',
  B: '先找与林夏有关的证据，判断事件对她的期待、边界、在意的人或安排意味着什么，再据此判断她此刻的情绪。输出字段顺序为 evidence、appraisal、state、main、secondary。'
};
const output = [
  '只判断林夏本人在最新一句之后的即时反应。玩家的感受、林夏回忆中当时的感受，都可能是线索。',
  '只输出紧凑 JSON。state 只能是 emotion（有波动）、steady（情境平常）、uncertain（缺关键前情）。',
  'main 和 secondary 只有在 emotion 下可以填 [中文情绪词,强度]，强度 1 轻微、2 明显、3 强烈。steady 和 uncertain 下两项必须都是 null。次情绪有独立依据才填。',
  'evidence 填 0 至 2 个「编号资料」里的整数。可先引用最新一句，再补一条能解释反应的先前线索。appraisal 用一句不超过 48 字的中文说明这件事对她的意义。'
].join('\n');

function sourceRows(scenario) {
  return [
    ...scenario.facts.map((fact, index) => ['F' + (index + 1), fact]),
    ...scenario.turns.map((turn, index) => ['T' + (index + 1), turn.speaker + '说「' + turn.text + '」']),
    ['U', '玩家刚说「' + scenario.latest + '」']
  ];
}

function messages(scenario, version) {
  const cast = game.npcCast;
  const profile = cast.profile(npcId);
  const snapshot = cast.meet(game.createGame({ seed: 'emotion-prototype' }), npcId);
  const { moodLabel, energyLabel } = cast.status(snapshot, npcId);
  const { label } = game.relationshipRules.stage(scenario.familiarity);
  const context = [
    '观察对象是林夏。她和玩家是大学同学。',
    // 第一段描述身份、背景和性格。其余段落含写台词或特定话题的指导。
    profile.persona.personality[0],
    '相识度 ' + scenario.familiarity + '，关系阶段为' + label + '。这一场开始时她' + moodLabel + '、' + energyLabel + '。',
    '编号资料\n' + sourceRows(scenario).map(([, text], index) => (index + 1) + ' | ' + text).join('\n')
  ];
  return [
    { role: 'system', content: versions[version] + '\n' + output },
    ...context.map(content => ({ role: 'user', content }))
  ];
}

function emotionPair(value) {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === 'string'
    && /^[\p{Script=Han}]{1,8}$/u.test(value[0]) && Number.isInteger(value[1]) && value[1] >= 1 && value[1] <= 3;
}

function parseJudgment(raw, scenario) {
  const value = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
  if (!value || Array.isArray(value) || !Object.hasOwn(statuses, value.state)) throw new Error('判断状态无效');
  if (Object.keys(value).length !== 5 || !['evidence', 'appraisal', 'state', 'main', 'secondary'].every(key => Object.hasOwn(value, key))) {
    throw new Error('判断字段不完整或存在多余字段');
  }
  if (typeof value.appraisal !== 'string' || !value.appraisal.trim() || value.appraisal.length > 48) throw new Error('情境理解超过限长或缺失');
  const sources = sourceRows(scenario);
  if (!Array.isArray(value.evidence) || value.evidence.length > 2) throw new Error('证据编号无效');
  const evidence = value.evidence.map(index => {
    const match = typeof index === 'string' && index.trim().match(/^(?:\[(\d+)\]|(\d+))$/);
    const number = match ? Number(match[1] || match[2]) : index;
    return Number.isInteger(number) ? sources[number - 1]?.[0] : undefined;
  });
  if (evidence.includes(undefined) || new Set(evidence).size !== evidence.length) throw new Error('证据编号无效');
  if (value.state === 'emotion') {
    if (!emotionPair(value.main) || value.secondary !== null && (!emotionPair(value.secondary) || value.secondary[0] === value.main[0])) {
      throw new Error('主次情绪或强度无效');
    }
  } else if (value.main !== null || value.secondary !== null) {
    throw new Error('无明显波动和依据不足时不应填情绪');
  }
  return { ...value, evidence };
}

function grade(value, scenario) {
  const expected = scenario.expected;
  const emotion = value.state === expected.state && (expected.state !== 'emotion' || expected.main.includes(value.main[0]));
  const level = value.main ? value.main[1] : 0;
  const strength = level >= expected.level[0] && level <= expected.level[1];
  const secondary = value.secondary ? expected.secondary.includes(value.secondary[0]) : !expected.mixed;
  const mixed = !expected.mixed || (value.main && value.secondary && expected.mixed.every(group =>
    group.includes(value.main[0]) || group.includes(value.secondary[0])));
  const evidence = expected.evidence.every(id => value.evidence.includes(id));
  return { emotion, strength, secondary: Boolean(secondary && mixed), evidence };
}

function plan(fixtures) {
  const groups = new Map();
  const pairs = new Map();
  const jobs = [];
  assert.equal(fixtures.length, 32);
  assert.equal(new Set(fixtures.map(scenario => scenario.id)).size, fixtures.length);
  for (const [index, scenario] of fixtures.entries()) {
    groups.set(scenario.domain, (groups.get(scenario.domain) || 0) + 1);
    const ids = sourceRows(scenario).map(([id]) => id);
    assert.ok(scenario.expected.evidence.length <= 2 && scenario.expected.evidence.every(id => ids.includes(id)), scenario.id);
    for (const version of Object.keys(versions)) {
      const rows = messages(scenario, version);
      assert.ok(rows.length <= 14 && rows.every(row => row.content.length <= 600), scenario.id);
    }
    const order = index % 2 === 0 ? ['A', 'B'] : ['B', 'A'];
    for (const version of order) jobs.push({ scenario, version, trial: 1 });
    if (scenario.pair) {
      const pair = pairs.get(scenario.pair.id) || [];
      pair.push(scenario);
      pairs.set(scenario.pair.id, pair);
    }
  }
  assert.equal(groups.size, 8);
  assert.ok([...groups.values()].every(size => size === 4));
  assert.equal(pairs.size, 8);
  for (const pair of pairs.values()) {
    assert.equal(pair.length, 2);
    assert.deepEqual(pair[0].pair, pair[1].pair);
    if (pair[0].pair.repeat) {
      for (const scenario of pair) for (const version of ['B', 'A']) jobs.push({ scenario, version, trial: 2 });
    }
  }
  assert.equal(jobs.length, 80);
  return jobs;
}

async function run(job, fetchFn = fetch) {
  const { scenario, version, trial } = job;
  const result = { id: scenario.id, version, trial, raw: null, judgment: null, checks: null, error: null };
  try {
    const response = await fetchFn(game.AI_CHAT.relay, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: messages(scenario, version) }),
      signal: AbortSignal.timeout(game.AI_CHAT.timeoutMs)
    });
    const data = await response.json();
    if (!response.ok) throw new Error('中转 HTTP ' + response.status + ' ' + (data.error || ''));
    if (typeof data.reply !== 'string') throw new Error('中转返回缺少 reply');
    result.raw = data.reply;
    result.judgment = parseJudgment(result.raw, scenario);
    result.checks = grade(result.judgment, scenario);
  } catch (error) {
    result.error = error.message;
  }
  return result;
}

function assessment(rows, field) {
  return rows.filter(row => row.checks?.[field]).length + '/' + rows.length;
}

function pairChecks(fixtures, results) {
  const report = [];
  for (const scenario of fixtures.filter(item => item.pair)) {
    const pair = fixtures.filter(item => item.pair?.id === scenario.pair.id);
    if (pair[0] !== scenario) continue;
    for (const version of Object.keys(versions)) {
      const records = results.filter(row => row.version === version && pair.some(item => item.id === row.id));
      for (const trial of new Set(records.map(row => row.trial))) {
        const selected = records.filter(row => row.trial === trial);
        // 同义情绪按事先给出的可接受集合评估。
        report.push({ pair: scenario.pair.id, domain: scenario.domain, relation: scenario.pair.relation, version, trial,
          accepted: selected.length === 2 && selected.every(row => row.checks?.emotion && row.checks.strength && row.checks.evidence) });
      }
    }
  }
  return report;
}

function markdown(fixtures, results, pairs) {
  const lines = ['# 林夏情绪判断对照实测', '',
    'A 版先写情绪，再写依据与情境理解。B 版先写证据和情境理解，再写情绪。每个用例独立提交，报告按测试批次保留两版原始返回。所有场景和对话均为虚构。',
    '自动核对按预先列出的可接受词、强度范围和证据编号计算。证据编号存在且命中参考项，仍需阅读原句和情境理解，核对判断是否成立。',
    '', '## 首轮分主题统计', '', '| 场景 | 版本 | 有效格式 | 状态及主情绪 | 强度范围 | 次情绪 | 证据命中 |',
    '|---|---|---:|---:|---:|---:|---:|'];
  for (const domain of ['全部', ...new Set(fixtures.map(item => item.domain))]) {
    for (const version of Object.keys(versions)) {
      const rows = results.filter(row => row.trial === 1 && row.version === version && (domain === '全部' || fixtures.find(item => item.id === row.id).domain === domain));
      lines.push('| ' + [domain, version, rows.filter(row => !row.error).length + '/' + rows.length,
        ...['emotion', 'strength', 'secondary', 'evidence'].map(field => assessment(rows, field))].join(' | ') + ' |');
    }
  }
  lines.push('', '## 配对检查', '', '每组两例须同时命中主判断、强度和证据。不同情境允许各自预先列出的主情绪。', '',
    '| 配对 | 场景 | 对照目的 | 版本 | 次数 | 通过 |', '|---|---|---|---|---:|---|');
  for (const pair of pairs) lines.push('| ' + [pair.pair, pair.domain, pair.relation === 'same' ? '同义改写' : '情境变化', pair.version, pair.trial, pair.accepted ? '是' : '否'].join(' | ') + ' |');
  lines.push('', '## 全部用例与原始输出');
  for (const scenario of fixtures) {
    lines.push('', '### ' + scenario.id + ' · ' + scenario.title, '', scenario.domain + ' · 相识度 ' + scenario.familiarity, '');
    for (const [index, [id, text]] of sourceRows(scenario).entries()) lines.push('- **' + (index + 1) + '（' + id + '）** ' + text);
    const expected = scenario.expected;
    lines.push('', '**参考判断** ' + statuses[expected.state] + '。' + expected.reason, '',
      '主情绪 ' + (expected.main.join('、') || '无') + ' · 强度 ' + expected.level.join('–') + ' · 次情绪 ' + (expected.secondary.join('、') || '无') + ' · 证据 ' + expected.evidence.join('、'));
    for (const row of results.filter(item => item.id === scenario.id)) {
      const fields = { emotion: '状态或主情绪', strength: '强度', secondary: '次情绪', evidence: '证据' };
      const differences = row.checks ? Object.keys(fields).filter(key => !row.checks[key]).map(key => fields[key]).join('、') : row.error || '无返回';
      lines.push('', '**' + row.version + ' 版第 ' + row.trial + ' 次** ' + (differences ? '待核对 ' + differences : '自动核对通过'), '');
      if (row.raw !== null) lines.push('~~~~text', row.raw, '~~~~');
    }
  }
  return lines.join('\n') + '\n';
}

async function main() {
  const jobs = plan(cases);
  const args = process.argv.slice(2);
  if (!args.length) {
    console.log('离线检查通过。32 个用例、8 组配对、80 个已编排请求。使用 --live 运行在线对照。');
    return;
  }
  if (args.length !== 1 || args[0] !== '--live') throw new Error('用法：node scripts/npc-emotion-prototype.js [--live]');
  const results = [];
  for (let index = 0; index < jobs.length; index += 2) {
    results.push(...await Promise.all(jobs.slice(index, index + 2).map(job => run(job))));
    if (results.length % 10 === 0) console.log('已记录 ' + results.length + '/' + jobs.length + ' 次请求');
  }
  const pairs = pairChecks(cases, results);
  const outputDir = path.resolve(__dirname, '../../tmp/lin-xia-emotion-prototype', new Date().toISOString().replace(/[:.]/g, '-'));
  await mkdir(outputDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(outputDir, 'emotion-results.json'), JSON.stringify({ versions, cases, results, pairs }, null, 2) + '\n'),
    writeFile(path.join(outputDir, '林夏情绪判断实测.md'), markdown(cases, results, pairs))
  ]);
  console.log(outputDir);
  const failed = results.filter(row => row.error).length;
  if (failed) console.log(failed + ' 次调用或解析失败，已记录在报告。');
}

if (require.main === module) main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

module.exports = { messages, parseJudgment, grade, plan, run, pairChecks, markdown };
