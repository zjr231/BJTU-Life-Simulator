'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('./game.js');

// 「我的简历」resume(state)：experiences 的结构化档案视图。夹具沿用仓库风格——createGame 浅覆写。
function baseState(overrides = {}) {
  return { ...game.createGame({ legacyEconomy: true }), ...overrides };
}
function exp(type, term = 1) {
  return { type, term };
}
function sectionOf(resume, id) {
  return resume.sections.find((section) => section.id === id);
}

test('resume 纯只读：调用前后状态、随机计数、revision 均不变', () => {
  const state = baseState({ experiences: [exp('project', 3), exp('military', 1)] });
  const before = structuredClone(state);
  game.resume(state);
  assert.deepEqual(state, before);
  assert.equal(state.rng.calls, before.rng.calls);
  assert.equal(state.revision, before.revision);
});

test('新档空简历：七栏全空、其他经历为空、四要件全 false', () => {
  const resume = game.resume(baseState());
  assert.deepEqual(resume.sections.map((section) => section.id), ['internship', 'project', 'contest', 'club', 'portfolio', 'showcase', 'dormMemory']);
  for (const section of resume.sections) assert.deepEqual(section.items, []);
  assert.deepEqual(resume.others, []);
  assert.deepEqual(resume.requirements, { hasInternship: false, hasProject: false, hasContest: false, hasClub: false });
});

test('分栏与要件：核心四类进栏，细枝末节进其他经历', () => {
  const resume = game.resume(baseState({ experiences: [exp('project', 3), exp('internship', 4), exp('contest', 5), exp('club', 2), exp('military', 1), exp('fitnessTest', 2)] }));
  assert.equal(sectionOf(resume, 'internship').items.length, 1);
  assert.equal(sectionOf(resume, 'project').items.length, 1);
  assert.equal(sectionOf(resume, 'contest').items.length, 1);
  assert.equal(sectionOf(resume, 'club').items.length, 1);
  assert.deepEqual(resume.others.map((item) => item.type), ['military', 'fitnessTest']);
  assert.deepEqual(resume.requirements, { hasInternship: true, hasProject: true, hasContest: true, hasClub: true });
  assert.deepEqual(sectionOf(resume, 'project').items[0], { term: 3, type: 'project' });
});

test('多段就绪：两条实习经历就是两项，要件照常成立', () => {
  const resume = game.resume(baseState({ experiences: [exp('internship', 4), exp('internship', 6)] }));
  assert.equal(sectionOf(resume, 'internship').items.length, 2);
  assert.deepEqual(sectionOf(resume, 'internship').items.map((item) => item.term), [4, 6]);
  assert.equal(resume.requirements.hasInternship, true);
});

test('档案视图语义：链 completed 但档案无经历时要件为 false', () => {
  const state = baseState({ term: 5 });
  state.chains.project.status = 'completed';
  const resume = game.resume(state);
  assert.equal(resume.requirements.hasProject, false);
  assert.equal(sectionOf(resume, 'project').items.length, 0);
});

test('其他经历全型：六类细枝末节全部进 others 且不占四栏', () => {
  const types = ['military', 'singer', 'trip', 'sportsMeet', 'fitnessTest', 'transfer'];
  const resume = game.resume(baseState({ experiences: types.map((type, index) => exp(type, index + 1)) }));
  assert.deepEqual(resume.others.map((item) => item.type), types);
  for (const section of resume.sections) assert.deepEqual(section.items, []);
  assert.deepEqual(resume.requirements, { hasInternship: false, hasProject: false, hasContest: false, hasClub: false });
});
