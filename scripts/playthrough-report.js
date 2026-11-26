'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const game = require('../game.js');

const metricKeys = ['time', 'energy', 'money', 'social', 'fitness', 'mood', 'preparation', 'furtherStudy', 'jobPreparation', 'cardDebt'];

function number(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : '';
}

function difference(before, after, key) {
  if (typeof before?.[key] !== 'number' || typeof after?.[key] !== 'number') return '';
  return Number((after[key] - before[key]).toFixed(4));
}

function csvCell(value) {
  if (value === undefined || value === null) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
}

function toCsv(rows, columns) {
  return [columns.join(','), ...rows.map(row => columns.map(key => csvCell(row[key])).join(','))].join('\n') + '\n';
}

function actionName(command, entry) {
  const operation = command?.operation || 'unknown';
  if (operation === 'executeAction') return command.id || 'unknown';
  if (operation === 'submitEventChoice') return 'event:' + (entry?.event || command.event || 'unknown') + ':' + (command.id || '');
  if (operation === 'completeBasketball') return 'basketball';
  if (operation === 'purchaseGrowth') return 'growth:' + (command.id || '');
  if (operation === 'interactWithAnimal') return 'animal:' + (command.data?.species || '');
  if (operation === 'interactWithZhouNing') return 'npc:zhouNing:' + (command.id || '');
  if (operation === 'recordZhouNingDialogue') return 'npc:zhouNing:dialogue';
  if (operation === 'resolveZhouNingProposal') return 'npc:zhouNing:proposal';
  if (operation === 'recordNpcDialogue') return 'npc:' + (command.data?.npcId || '') + ':dialogue';
  if (operation === 'resolveNpcProposal') return 'npc:' + (command.data?.npcId || '') + ':proposal';
  if (operation === 'runNpcStory') return 'npc:' + (command.data?.npcId || '') + ':story';
  if (operation === 'attachNpcToEvent') return 'npc:' + (command.npcId || '') + ':event';
  return operation;
}

function stepRow(runId, index, command, entry, before, after, ok = true, error = '') {
  const row = {
    run_id: runId,
    step: index + 1,
    command_id: command?.commandId || '',
    operation: command?.operation || '',
    action: actionName(command, entry),
    term: before?.term ?? '',
    phase_before: before?.phase ?? '',
    phase_after: after?.phase ?? '',
    replay_ok: ok ? 1 : 0,
    replay_error: error,
    investment_amount: number(command?.investment ?? entry?.investment?.amount),
    investment_resource: entry?.investment?.resource ?? '',
    extra_id: entry?.extra?.id ?? command?.extra ?? '',
    event: entry?.event ?? '',
    choice: entry?.choice ?? '',
    outcome: entry?.investment?.outcome ?? entry?.outcome ?? '',
    companion_id: command?.companionId ?? '',
    exam_score: number(entry?.examScore ?? after?.summary?.examScore),
    term_grade: number(after?.summary?.grade),
    budget_total: number(after?.economy?.grants?.at(-1)?.livingCost),
    family_id: after?.economy?.familyId ?? '',
    result_direction: after?.result?.direction ?? ''
  };
  for (const key of metricKeys) {
    row[key + '_before'] = number(before?.[key]);
    row[key + '_after'] = number(after?.[key]);
    row[key + '_delta'] = difference(before, after, key);
  }
  return row;
}

function latestSnapshots(saves) {
  const latest = new Map();
  for (const row of saves) {
    const current = latest.get(row.run_id);
    if (!current || row.revision > current.revision
      || (row.revision === current.revision && (row.phase === 'finished' || row.phase === 'ended'))
      || (row.revision === current.revision && row.received_at > current.received_at)) latest.set(row.run_id, row);
  }
  return latest;
}

function stateFromSave(row) {
  if (row.state && typeof row.state === 'object') return row.state;
  if (typeof row.state_json === 'string') {
    try { return JSON.parse(row.state_json); } catch { return null; }
  }
  return null;
}

function buildReport({ saves = [], feedback = [] } = {}) {
  const latest = latestSnapshots(saves);
  const saveMap = new Map(saves.map(row => [row.run_id + ':' + row.snapshot_id, row]));
  const feedbackByRun = new Map();
  for (const row of feedback) {
    const list = feedbackByRun.get(row.run_id) || [];
    list.push(row);
    feedbackByRun.set(row.run_id, list);
  }
  const steps = [], runs = [], terms = [], termActions = [];
  for (const [runId, save] of latest) {
    const state = stateFromSave(save);
    if (!state) continue;
    const commands = Array.isArray(state.history) ? state.history.map(entry => entry.command).filter(Boolean) : [];
    const replayFlags = {
      nickname: '分析同学',
      seed: state.rng?.seed || '',
      commands,
      legacyEconomy: !state.economy || state.economy.startTerm > 1,
      economyStartTerm: state.economy?.startTerm ?? 9,
      relationshipsInitialized: state.relationships !== undefined
    };
    let replayOk = true, replayError = '';
    const runSteps = [];
    const replay = game.replay({
      ...replayFlags,
      onStep: ({ index, command, before, result, ok, state: after }) => {
        const entry = result?.entry || null;
        const row = stepRow(runId, index, command, entry, before, after || before, ok, ok ? '' : result?.reason || '');
        steps.push(row);
        runSteps.push(row);
        if (!ok) { replayOk = false; replayError = result?.reason || '未知错误'; }
      }
    });
    if (!replay.ok) { replayOk = false; replayError = replay.reason || replayError; }
    const runFeedback = feedbackByRun.get(runId) || [];
    const stepCount = runSteps.length;
    runs.push({
      run_id: runId,
      app_version: state.appVersion || '',
      history_steps: state.history?.length ?? 0,
      latest_snapshot_kind: save.kind || '',
      latest_snapshot_received_at: save.received_at ?? '',
      final_term: state.term ?? '',
      final_phase: state.phase ?? '',
      ending: state.result?.direction ?? '',
      average: number(state.result?.average),
      passed_terms: number(state.result?.passed ?? state.courses?.filter(item => item.passed).length),
      money: number(state.money),
      family_id: state.economy?.familyId ?? '',
      steps: stepCount,
      replay_ok: replayOk ? 1 : 0,
      replay_error: replayError,
      feedback_count: runFeedback.length,
      feedback_sources: runFeedback.map(item => item.source).join('|')
    });
    const courseTerms = Array.isArray(state.courses) ? state.courses : [];
    for (const course of courseTerms) {
      terms.push({
        run_id: runId,
        term: course.term ?? '',
        name: course.name ?? '',
        preparation: number(course.preparation),
        usual_score: number(course.usualScore),
        exam_score: number(course.examScore),
        grade: number(course.grade),
        passed: course.passed ? 1 : 0,
        rating: course.rating ?? '',
        money_after: number(course.moneyAfter),
        unused_time: number(course.unusedTime)
      });
    }
    const grouped = new Map();
    for (const step of runSteps) {
      const key = step.term + ':' + step.action;
      const record = grouped.get(key) || { run_id: runId, term: step.term, action: step.action, count: 0, time_delta: 0, energy_delta: 0, money_delta: 0, preparation_delta: 0, social_delta: 0, fitness_delta: 0, mood_delta: 0 };
      record.count += 1;
      for (const [field, source] of [['time_delta', 'time_delta'], ['energy_delta', 'energy_delta'], ['money_delta', 'money_delta'], ['preparation_delta', 'preparation_delta'], ['social_delta', 'social_delta'], ['fitness_delta', 'fitness_delta'], ['mood_delta', 'mood_delta']]) {
        const value = step[source];
        if (typeof value === 'number') record[field] = Number((record[field] + value).toFixed(4));
      }
      grouped.set(key, record);
    }
    termActions.push(...grouped.values());
  }
  const feedbackRows = feedback.map(row => {
    const target = saveMap.get(row.run_id + ':' + row.snapshot_id);
    return {
      id: row.id ?? '',
      run_id: row.run_id,
      snapshot_id: row.snapshot_id,
      source: row.source ?? 'legacy',
      suggestion: row.suggestion,
      received_at: row.received_at,
      snapshot_term: target?.term ?? '',
      snapshot_phase: target?.phase ?? '',
      snapshot_ending: target?.ending ?? ''
    };
  });
  return {
    runs: runs.sort((a, b) => String(a.run_id).localeCompare(String(b.run_id))),
    steps,
    terms,
    termActions,
    feedback: feedbackRows,
    manifest: {
      generated_at: new Date().toISOString(),
      runs: runs.length,
      steps: steps.length,
      terms: terms.length,
      term_actions: termActions.length,
      feedback: feedbackRows.length,
      replay_failures: runs.filter(run => !run.replay_ok).length
    }
  };
}

function readJsonLines(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line));
}

function readInput(input) {
  const resolved = path.resolve(input);
  const stats = fs.statSync(resolved);
  if (stats.isDirectory()) {
    return {
      saves: readJsonLines(path.join(resolved, 'game_saves.jsonl')),
      feedback: readJsonLines(path.join(resolved, 'game_feedback.jsonl'))
    };
  }
  const db = new DatabaseSync(resolved, { readOnly: true });
  try {
    const saves = db.prepare('SELECT * FROM game_saves ORDER BY received_at,rowid').all().map(row => ({ ...row, state: JSON.parse(row.state_json) }));
    const table = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='game_feedback_entries'").get() ? 'game_feedback_entries'
      : db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='game_feedback'").get() ? 'game_feedback' : null;
    const feedback = table ? db.prepare('SELECT * FROM ' + table + ' ORDER BY received_at,rowid').all() : [];
    return { saves, feedback };
  } finally { db.close(); }
}

function writeReport(report, directory) {
  const out = path.resolve(directory);
  fs.mkdirSync(out, { recursive: true });
  const files = {
    'runs.csv': toCsv(report.runs, ['run_id', 'app_version', 'history_steps', 'latest_snapshot_kind', 'latest_snapshot_received_at', 'final_term', 'final_phase', 'ending', 'average', 'passed_terms', 'money', 'family_id', 'steps', 'replay_ok', 'replay_error', 'feedback_count', 'feedback_sources']),
    'steps.csv': toCsv(report.steps, ['run_id', 'step', 'command_id', 'operation', 'action', 'term', 'phase_before', 'phase_after', 'replay_ok', 'replay_error', 'investment_amount', 'investment_resource', 'extra_id', 'event', 'choice', 'outcome', 'companion_id', 'exam_score', 'term_grade', 'budget_total', 'family_id', 'result_direction', ...metricKeys.flatMap(key => [key + '_before', key + '_after', key + '_delta'])]),
    'terms.csv': toCsv(report.terms, ['run_id', 'term', 'name', 'preparation', 'usual_score', 'exam_score', 'grade', 'passed', 'rating', 'money_after', 'unused_time']),
    'term_actions.csv': toCsv(report.termActions, ['run_id', 'term', 'action', 'count', 'time_delta', 'energy_delta', 'money_delta', 'preparation_delta', 'social_delta', 'fitness_delta', 'mood_delta']),
    'feedback.csv': toCsv(report.feedback, ['id', 'run_id', 'snapshot_id', 'source', 'suggestion', 'received_at', 'snapshot_term', 'snapshot_phase', 'snapshot_ending']),
    'manifest.json': JSON.stringify(report.manifest, null, 2) + '\n'
  };
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(out, name), content, 'utf8');
  return out;
}

if (require.main === module) {
  const [input, output = 'analysis-output'] = process.argv.slice(2);
  if (!input) throw new Error('用法：node scripts/playthrough-report.js <playthroughs.sqlite|导出目录> [输出目录]');
  const data = readInput(input);
  const report = buildReport(data);
  console.log(writeReport(report, output));
}
module.exports = { buildReport, readInput, writeReport };
