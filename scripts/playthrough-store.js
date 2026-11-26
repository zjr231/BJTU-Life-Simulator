'use strict';
const { DatabaseSync } = require('node:sqlite');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { RULES, TERMINAL_ENDINGS } = require('../config.js');

const tables = [
  { table: 'game_saves', file: 'game_saves' },
  { table: 'game_feedback_entries', file: 'game_feedback' }
];
const phases = new Set(['playing', 'eventPending', 'examPending', 'summary', 'endingChoice', 'finished', 'ended']);
const kinds = new Set(['manual', 'auto', 'ending', 'exit', 'feedback']);
const feedbackSources = new Set(['term2', 'exit', 'ending', 'settings']);
const runPattern = /^[a-f0-9]{32}$/;
const ended = state => state.phase === 'finished' || state.phase === 'ended';
function validCapture(body) {
  if (!body || typeof body !== 'object' || typeof body.runId !== 'string' || !runPattern.test(body.runId)
      || !kinds.has(body.kind) || !Number.isSafeInteger(body.savedAt) || body.savedAt < 1
      || (body.slot !== null && ![1, 2, 3].includes(body.slot))
      || (['manual', 'auto'].includes(body.kind) && body.slot === null)) return false;
  const s = body.state;
  if (!s || s.rulesVersion !== RULES.version || s.saveFormatVersion !== RULES.saveFormatVersion
      || typeof s.appVersion !== 'string' || s.appVersion.length > 64 || typeof s.nickname !== 'string' || !s.nickname.trim() || s.nickname.length > 24
      || typeof s.rng?.seed !== 'string' || !Array.isArray(s.history) || !Number.isSafeInteger(s.revision) || s.revision > 2000 || s.revision !== s.history.length
      || (s.revision > 0 && typeof s.history.at(-1)?.commandId !== 'string')
      || !phases.has(s.phase) || !Number.isInteger(s.term) || s.term < 1 || s.term > 8) return false;
  if (ended(s)) {
    if (!s.result || s.result.term !== s.term || typeof s.result.direction !== 'string'
        || !(s.phase === 'ended' ? Object.hasOwn(TERMINAL_ENDINGS, s.result.direction) : s.term === 8 && Array.isArray(s.endingOptions?.options) && s.endingOptions.options.some(item => item?.available && item.id === s.result.direction))) return false;
  } else if (body.kind === 'ending' || s.result !== null) return false;
  if (body.feedback === undefined) return body.feedbackSource === undefined;
  return ['feedback', 'exit', 'ending'].includes(body.kind)
    && typeof body.feedback === 'string' && !!body.feedback.trim() && body.feedback.length <= 1000
    && (body.feedbackSource === undefined || feedbackSources.has(body.feedbackSource));
}

function openPlaythroughs(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA busy_timeout=5000;
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS game_saves (
      run_id TEXT NOT NULL, snapshot_id TEXT NOT NULL, kind TEXT NOT NULL, slot INTEGER,
      revision INTEGER NOT NULL, term INTEGER NOT NULL, phase TEXT NOT NULL, ending TEXT,
      saved_at INTEGER NOT NULL, received_at INTEGER NOT NULL, state_json TEXT NOT NULL,
      PRIMARY KEY (run_id, snapshot_id)
    );
  `);
  // 旧表保留给回滚后的旧服务使用；新表允许多条反馈，来源和随访反馈分开记录。
  db.exec(`
    CREATE TABLE IF NOT EXISTS game_feedback (
      run_id TEXT PRIMARY KEY, snapshot_id TEXT NOT NULL, suggestion TEXT NOT NULL, received_at INTEGER NOT NULL,
      FOREIGN KEY (run_id, snapshot_id) REFERENCES game_saves(run_id, snapshot_id)
    );
    CREATE TABLE IF NOT EXISTS game_feedback_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL, snapshot_id TEXT NOT NULL, source TEXT NOT NULL,
      suggestion TEXT NOT NULL, received_at INTEGER NOT NULL,
      FOREIGN KEY (run_id, snapshot_id) REFERENCES game_saves(run_id, snapshot_id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS game_feedback_entries_same
      ON game_feedback_entries(run_id, snapshot_id, source, suggestion);
    CREATE UNIQUE INDEX IF NOT EXISTS game_feedback_entries_auto_once
      ON game_feedback_entries(run_id, source) WHERE source IN ('term2', 'exit', 'ending');
  `);
  const legacyColumns = db.prepare('PRAGMA table_info(game_feedback)').all();
  const sourceExpression = legacyColumns.some(column => column.name === 'source') ? 'source' : "'ending'";
  db.exec(`INSERT OR IGNORE INTO game_feedback_entries(run_id, snapshot_id, source, suggestion, received_at) SELECT run_id, snapshot_id, ${sourceExpression}, suggestion, received_at FROM game_feedback ORDER BY received_at,rowid`);
  const save = db.prepare('INSERT INTO game_saves VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(run_id,snapshot_id) DO NOTHING');
  const feedback = db.prepare('INSERT INTO game_feedback_entries(run_id,snapshot_id,source,suggestion,received_at) VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING');
  function record(body) {
    if (!validCapture(body)) return { status: 400, error: '存档或反馈格式有误' };
    const { runId, state, kind, slot, savedAt } = body;
    const raw = JSON.stringify(state);
    // 同一结局、退出状态或反馈快照只保留一份；反馈条目本身另行去重。
    const identity = kind === 'ending' ? [kind, state.revision, state.result.direction, state.history.at(-1)?.commandId]
      : ['exit', 'feedback'].includes(kind) ? [kind, state.revision]
        : [kind, slot, savedAt, raw];
    const id = createHash('sha256').update(JSON.stringify(identity)).digest('hex');
    const now = Date.now();
    const source = body.feedbackSource || (kind === 'ending' ? 'ending' : kind === 'exit' ? 'exit' : 'settings');
    db.exec('BEGIN IMMEDIATE');
    try {
      save.run(runId, id, kind, slot, state.revision, state.term, state.phase, state.result?.direction || null, savedAt, now, raw);
      if (body.feedback !== undefined) feedback.run(runId, id, source, body.feedback.trim(), now);
      db.exec('COMMIT');
      return { status: 200 };
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  return { record, close: () => db.close() };
}

function exportPlaythroughs(file, parent) {
  const db = new DatabaseSync(file, { readOnly: true });
  let directory;
  try {
    db.exec('BEGIN');
    directory = fs.mkdtempSync(path.join(parent, 'bjtu-analysis-'));
    for (const { table, file: name } of tables) {
      const out = fs.openSync(path.join(directory, name + '.jsonl'), 'wx', 0o600);
      try {
        for (const row of db.prepare('SELECT * FROM ' + table + ' ORDER BY received_at,rowid').iterate()) {
          if (table === 'game_saves') { row.state = JSON.parse(row.state_json); delete row.state_json; }
          fs.writeFileSync(out, JSON.stringify(row) + '\n');
        }
      } finally { fs.closeSync(out); }
    }
    db.exec('COMMIT');
    return directory;
  } catch (error) {
    if (directory) {
      for (const { file: name } of tables) fs.rmSync(path.join(directory, name + '.jsonl'), { force: true });
      fs.rmdirSync(directory);
    }
    throw error;
  } finally { db.close(); }
}
if (require.main === module) {
  const [command, file, parent] = process.argv.slice(2);
  if (command !== 'export' || !file || !parent) throw new Error('用法：node playthrough-store.js export 数据库文件 导出父目录');
  console.log(exportPlaythroughs(file, parent));
}
module.exports = { openPlaythroughs, exportPlaythroughs };
