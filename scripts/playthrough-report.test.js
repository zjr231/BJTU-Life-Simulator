'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const game = require('../game.js');
const { buildReport, writeReport } = require('./playthrough-report.js');

test('按最新快照重放步级行动并导出回归输入文件', () => {
  const runId = '4'.repeat(32);
  const initial = game.createGame({ seed: 'report-seed', nickname: '测试同学' });
  const rest = game.executeAction(initial, 'rest');
  const study = game.executeAction(rest.state, 'study');
  const state = study.state;
  assert.equal(state.history.length, 2);
  const report = buildReport({
    saves: [{
      run_id: runId, snapshot_id: 'snapshot', kind: 'manual', slot: 1,
      revision: state.revision, term: state.term, phase: state.phase, ending: null,
      saved_at: 10, received_at: 10, state
    }],
    feedback: [{
      id: 1, run_id: runId, snapshot_id: 'snapshot', source: 'settings',
      suggestion: '想多看到一些课程反馈。', received_at: 11
    }]
  });
  assert.equal(report.manifest.runs, 1);
  assert.equal(report.steps.length, 2);
  assert.deepEqual(report.steps.map(step => step.action), ['rest', 'study']);
  assert.equal(report.steps[0].replay_ok, 1);
  assert.equal(typeof report.steps[1].preparation_delta, 'number');
  assert.equal(report.feedback[0].source, 'settings');
  assert.equal(report.feedback[0].snapshot_term, state.term);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bjtu-report-test-'));
  try {
    const output = writeReport(report, directory);
    for (const name of ['runs.csv', 'steps.csv', 'terms.csv', 'term_actions.csv', 'feedback.csv', 'manifest.json']) {
      assert.equal(fs.existsSync(path.join(output, name)), true, name);
    }
    const steps = fs.readFileSync(path.join(output, 'steps.csv'), 'utf8').trim().split('\n');
    assert.equal(steps.length, 3);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
