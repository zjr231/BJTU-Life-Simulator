'use strict';
const { DatabaseSync } = require('node:sqlite');
const { createHash, randomBytes } = require('node:crypto');
const { mkdirSync } = require('node:fs');
const path = require('node:path');

const minute = 60000, day = 1440 * minute;
const sessionAge = 30 * day;
const hash = value => createHash('sha256').update(value).digest('hex');
const denied = (status, error) => ({ status, error });
const unsigned = () => denied(401, '请使用游戏登录码登录');
const blocked = () => denied(403, '这个账号的在线对话已暂停');
const limited = () => denied(429, '在线对话额度已用完，请稍后再试');

function openAccounts(file, clock = Date.now) {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA busy_timeout=5000;
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS accounts(id INTEGER PRIMARY KEY, code_hash TEXT NOT NULL UNIQUE, banned_until INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, account INTEGER NOT NULL REFERENCES accounts(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS usage(account INTEGER NOT NULL REFERENCES accounts(id), at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS usage_time ON usage(at);
    CREATE INDEX IF NOT EXISTS usage_account ON usage(account, at);
    CREATE TABLE IF NOT EXISTS audit(account INTEGER NOT NULL REFERENCES accounts(id), at INTEGER NOT NULL, reason TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS audit_account ON audit(account, at);
    CREATE TABLE IF NOT EXISTS auth_attempts(client TEXT NOT NULL, action TEXT NOT NULL, at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS auth_time ON auth_attempts(at);
  `);
  const query = sql => db.prepare(sql);
  function transaction(action) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = action(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function log(id, reason) { query('INSERT INTO audit VALUES(?,?,?)').run(id, clock(), reason); }
  function identify(token) {
    if (!token) return unsigned();
    const row = query('SELECT a.id,a.banned_until FROM sessions s JOIN accounts a ON s.account=a.id WHERE token=? AND expires>?').get(hash(token), clock());
    if (!row) return unsigned();
    return row.banned_until > clock() ? blocked() : { id: row.id };
  }
  function authenticate(action, code, client) {
    return transaction(() => {
      const now = clock(), key = hash(client);
      query('DELETE FROM auth_attempts WHERE at <= ?').run(now - day);
      query('DELETE FROM sessions WHERE expires <= ?').run(now);
      const signup = action === 'register';
      const hits = query('SELECT count(*) AS n FROM auth_attempts WHERE client=? AND action=? AND at>?').get(key, action, now - 10 * minute).n;
      if (hits >= 30) return denied(429, '账号操作次数过多，请稍后再试');
      const countAttempt = () => query('INSERT INTO auth_attempts VALUES(?,?,?)').run(key, action, now);
      let id;
      if (signup) {
        countAttempt();
        code = randomBytes(12).toString('hex').toUpperCase().match(/.{6}/g).join('-');
        id = Number(query('INSERT INTO accounts(code_hash) VALUES(?)').run(hash(code)).lastInsertRowid);
      } else {
        const account = query('SELECT id,banned_until FROM accounts WHERE code_hash=?').get(hash(code));
        if (!account) { countAttempt(); return denied(401, '游戏登录码不正确'); }
        if (account.banned_until > now) return blocked();
        id = account.id;
      }
      const token = randomBytes(32).toString('hex');
      query('INSERT INTO sessions VALUES(?,?,?)').run(hash(token), id, now + sessionAge);
      return { id, token, ...(signup ? { code } : {}) };
    });
  }
  function moderate(id, ban) {
    const changed = query('UPDATE accounts SET banned_until=? WHERE id=?').run(ban ? Number.MAX_SAFE_INTEGER : 0, id).changes;
    if (!changed) throw new Error('没有这个账号');
    log(id, ban ? '管理员封禁' : '管理员解封');
  }
  function invalid(token, reason) {
    return transaction(() => {
      const account = identify(token);
      if (account.error) return account;
      log(account.id, '格式错误/' + reason);
      const strikes = query("SELECT count(*) AS n FROM audit WHERE account=? AND at>? AND reason LIKE '格式错误/%' AND rowid>coalesce((SELECT max(rowid) FROM audit WHERE account=? AND reason='管理员解封'),0)").get(account.id, clock() - 10 * minute, account.id).n;
      if (strikes < 3) return denied(400, 'NPC 请求格式有误');
      query('UPDATE accounts SET banned_until=? WHERE id=?').run(clock() + 15 * minute, account.id);
      log(account.id, '连续格式错误，暂停15分钟');
      return blocked();
    });
  }
  function reserve(token) {
    return transaction(() => {
      const account = identify(token);
      if (account.error) return account;
      const now = clock();
      // 按北京时间自然日计数；滚动分钟在跨午夜时仍然连续。
      const today = Math.floor((now + 8 * 3600000) / day) * day - 8 * 3600000;
      query('DELETE FROM usage WHERE at < ?').run(Math.min(today, now - minute));
      const count = query('SELECT count(*) AS n FROM usage WHERE account=? AND at>?').get(account.id, now - minute).n;
      const daily = query('SELECT count(*) AS n FROM usage WHERE account=? AND at>=?').get(account.id, today).n;
      const project = query('SELECT count(*) AS n FROM usage WHERE at>=?').get(today).n;
      if (count >= 5 || daily >= 20 || project >= 500) return limited();
      query('INSERT INTO usage VALUES(?,?)').run(account.id, now);
      return account;
    });
  }
  return { authenticate, identify, invalid, reserve,
    logout: token => query('DELETE FROM sessions WHERE token=?').run(hash(token || '')),
    moderate: (id, ban) => transaction(() => moderate(id, ban)),
    accounts: () => query('SELECT id,banned_until FROM accounts ORDER BY id').all(),
    records: id => query('SELECT account,at,reason FROM audit WHERE account=? ORDER BY rowid DESC LIMIT 100').all(id),
    close: () => db.close()
  };
}
module.exports = { openAccounts, sessionAge };
