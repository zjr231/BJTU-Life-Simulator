'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { execFileSync } = require('node:child_process');
const game = require('../game.js');
const { createService } = require('./npc-server.js');
const { openPlaythroughs } = require('./playthrough-store.js');

const first = '1'.repeat(32), second = '2'.repeat(32);
function freshman() { return game.createGame({ seed: 'archive', nickname: '测试同学' }); }
function endEarly() {
  const s = freshman();
  const ids = game.coursesForTerm(s.term, s.background.id, s.background.major).slice(0, 3).map(course => course.id);
  return game.cheatExam(game.beginExam(game.selectCourses(s, ids).state).state).state;
}
function graduate() {
  let s = freshman();
  for (let term = 1; term <= 8; term++) {
    while (s.pendingEvent) s = game.submitEventChoice(s, 'later').state;
    s = game.continueGame(game.endTerm(s).state).state;
  }
  return game.chooseEnding(s, 'notQualified').state;
}
const snapshot = (state, kind, slot, savedAt = 1, runId = first) => ({ runId, state, kind, slot, savedAt });

test('游客存档与意见分表，重启后可导出；重复和乱序上报只关联正确的结局', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bjtu-playthrough-test-'));
  const file = path.join(dir, 'playthroughs.sqlite');
  let db = openPlaythroughs(file);
  const server = createService({ playthroughs: db });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    db.close();
    assert.equal(path.dirname(dir), os.tmpdir());
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const url = 'http://127.0.0.1:' + server.address().port + '/api/playthroughs';
  const post = data => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const state = freshman(), terminal = endEarly(), graduation = graduate();
  const ending = snapshot(terminal, 'ending', null, 100);
  const manual = snapshot(state, 'manual', 1, 10);
  const suggestion = '希望增加社团演出。\n也想邀请室友。';
  for (const body of [
    { ...ending, feedback: suggestion }, manual, manual, snapshot(state, 'manual', 2, 20), snapshot(state, 'auto', 2, 30),
    { ...ending, slot: 3, savedAt: 120 }, { ...ending, savedAt: 140, feedback: '重复提交' },
    snapshot(graduation, 'ending', 1, 150, second)
  ]) {
    const res = await post(body);
    assert.deepEqual(await res.json(), { ok: true });
  }
  db.close(); db = openPlaythroughs(file);
  const output = execFileSync(process.execPath, [path.join(__dirname, 'playthrough-store.js'), 'export', file, dir], { encoding: 'utf8' }).trim();
  const rows = table => fs.readFileSync(path.join(output, table + '.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  const saves = rows('game_saves'), feedback = rows('game_feedback');
  assert.equal(saves.length, 5);
  assert.deepEqual(saves.find(s => s.run_id === second).state, graduation);
  assert.deepEqual(saves.filter(s => s.kind === 'manual').map(s => s.slot), [1,2]);
  assert.deepEqual(saves.find(s => s.kind === 'auto').state, state);
  assert.equal(feedback.length, 1);
  assert.equal(feedback[0].suggestion, suggestion);
  const target = saves.find(s => s.run_id === feedback[0].run_id && s.snapshot_id === feedback[0].snapshot_id);
  assert.equal(target.ending, 'cheatNote');
  assert.equal(target.slot, null);
  assert.deepEqual(target.state, terminal);
});

test('只接收同源写入，拒绝超大存档、中途反馈、无效栏位或无效结局', async t => {
  const db = openPlaythroughs(':memory:');
  const server = createService({ playthroughs: db });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); });
  const url = 'http://127.0.0.1:' + server.address().port + '/api/playthroughs';
  const post = (body, origin) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? {origin} : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body) });
  const manual = snapshot(freshman(), 'manual', 2), ending = snapshot(endEarly(), 'ending', 1);
  assert.equal((await fetch(url)).status, 405);
  assert.equal((await post(manual, 'https://another.example')).status, 403);
  assert.equal((await post(' '.repeat(2 * 1024 * 1024 + 1))).status, 413);
  for (const body of [{ ...manual, runId: '' }, { ...manual, feedback: '中途' }, { ...manual, slot: null },
    { ...manual, slot: 4 }, { ...manual, kind: 'ending' }, { ...ending, feedback: ' ' },
    { ...ending, feedback: '字'.repeat(1001) }, { ...ending, state: { ...ending.state, result: { ...ending.state.result, direction: 'unknown' } } }]) {
    assert.equal((await post(body)).status, 400);
  }
  assert.equal((await post(manual)).status, 200);
});
