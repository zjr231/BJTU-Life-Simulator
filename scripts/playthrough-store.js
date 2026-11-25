'use strict';
const { DatabaseSync } = require('node:sqlite');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { RULES, TERMINAL_ENDINGS } = require('../config.js');

const tables = ['game_saves', 'game_feedback'];
const phases = new Set(['playing', 'eventPending', 'examPending', 'summary', 'endingChoice', 'finished', 'ended']);
const runPattern = /^[a-f0-9]{32}$/;
const ended = state => state.phase === 'finished' || state.phase === 'ended';
function validCapture(body) {
  if (!body || typeof body !== 'object' || typeof body.runId !== 'string' || !runPattern.test(body.runId)
      || !['manual', 'auto', 'ending'].includes(body.kind) || !Number.isSafeInteger(body.savedAt) || body.savedAt < 1
      || (body.slot !== null && ![1, 2, 3].includes(body.slot)) || (body.kind !== 'ending' && body.slot === null)) return false;
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
  return body.feedback === undefined || (body.kind === 'ending' && typeof body.feedback === 'string'
    && !!body.feedback.trim() && body.feedback.length <= 1000);
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
    CREATE TABLE IF NOT EXISTS game_feedback (
      run_id TEXT PRIMARY KEY, snapshot_id TEXT NOT NULL, suggestion TEXT NOT NULL, received_at INTEGER NOT NULL,
      FOREIGN KEY (run_id, snapshot_id) REFERENCES game_saves(run_id, snapshot_id)
    );
  `);
  const save = db.prepare('INSERT INTO game_saves VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(run_id,snapshot_id) DO NOTHING');
  const feedback = db.prepare('INSERT INTO game_feedback VALUES(?,?,?,?) ON CONFLICT(run_id) DO NOTHING');
  function record(body) {
    if (!validCapture(body)) return { status: 400, error: '存档或反馈格式有误' };
    const { runId, state, kind, slot, savedAt } = body;
    const raw = JSON.stringify(state);
    // 重开同一个结局页或补发意见，始终关联第一次到达的结局快照。
    const identity = kind === 'ending' ? [kind, state.revision, state.result.direction, state.history.at(-1)?.commandId]
      : [kind, slot, savedAt, raw];
    const id = createHash('sha256').update(JSON.stringify(identity)).digest('hex');
    const now = Date.now();
    db.exec('BEGIN IMMEDIATE');
    try {
      save.run(runId, id, kind, slot, state.revision, state.term, state.phase, state.result?.direction || null, savedAt, now, raw);
      if (body.feedback !== undefined) feedback.run(runId, id, body.feedback.trim(), now);
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
    for (const table of tables) {
      const out = fs.openSync(path.join(directory, table + '.jsonl'), 'wx', 0o600);
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
      for (const table of tables) fs.rmSync(path.join(directory, table + '.jsonl'), { force: true });
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
