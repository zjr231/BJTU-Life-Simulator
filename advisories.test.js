'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('./game.js');

// 「手头的事」advisories(state)：只读推导。夹具沿用仓库风格——createGame 浅覆写，链覆写保留全部键。
const TAG_TONES = ['go', 'todo', 'hot', 'gap', 'done', 'calm'];

function baseState(overrides = {}) {
  return { ...game.createGame({ legacyEconomy: true }), ...overrides };
}
function withChain(state, id, patch) {
  return { ...state, chains: { ...state.chains, [id]: { ...state.chains[id], ...patch } } };
}
function chainEntry(id, patch) {
  return { status: 'idle', progress: 0, startedTerm: 0, deadline: 0, nextEligibleTerm: 1, reviewAfter: 0, ...patch };
}
function itemOf(board, itemId) {
  for (const group of board.groups) {
    const found = group.items.find((item) => item.id === itemId);
    if (found) return found;
  }
  return null;
}
function hasItem(board, itemId) {
  return board.groups.some((group) => group.items.some((item) => item.id === itemId));
}
function groupItems(board, groupId) {
  const group = board.groups.find((item) => item.id === groupId);
  return group ? group.items : [];
}

test('advisories 纯只读：新档调用前后状态、随机计数、revision 均不变；条目形状统一', () => {
  const state = game.createGame();
  const before = structuredClone(state);
  const board = game.advisories(state);
  assert.deepEqual(state, before);
  assert.equal(state.rng.calls, before.rng.calls);
  assert.equal(state.revision, before.revision);
  for (const group of board.groups) {
    for (const item of group.items) {
      assert.equal(typeof item.id, 'string');
      assert.equal(typeof item.title, 'string');
      assert.equal(typeof item.detail, 'string');
      assert.equal(typeof item.tag, 'string');
      assert.equal(typeof item.tagTone, 'string');
      assert.ok(TAG_TONES.includes(item.tagTone), 'tagTone 枚举外：' + item.tagTone);
      assert.equal(typeof item.urgent, 'boolean');
      assert.ok(Array.isArray(item.detailList));
      for (const row of item.detailList) assert.equal(typeof row, 'string');
    }
  }
});

test('advisories 纯只读：繁忙状态（生病+欠款+紧急链）同样不写状态', () => {
  const state = withChain(baseState({ fitness: 10, cardDebt: 120 }), 'project', chainEntry('project', { status: 'active', startedTerm: 7, deadline: 8, reviewAfter: 7 }));
  const before = structuredClone(state);
  game.advisories(state);
  assert.deepEqual(state, before);
  assert.equal(state.rng.calls, before.rng.calls);
});

test('active 链显示标题、进度与答辩学期', () => {
  const board = game.advisories(withChain(baseState({ term: 4 }), 'project', chainEntry('project', { status: 'active', progress: 1, startedTerm: 3, deadline: 4, reviewAfter: 3 })));
  const item = itemOf(board, 'chain:project');
  assert.ok(item.title.includes('项目'), item.title);
  assert.ok(item.detail.includes('进度 1/2'), item.detail);
  assert.ok(item.detail.includes('第 4 学期'), item.detail);
  assert.equal(item.urgent, false);
});

test('active 链投满两次提示等答辩', () => {
  const item = itemOf(game.advisories(withChain(baseState({ term: 4 }), 'project', chainEntry('project', { status: 'active', progress: 2, startedTerm: 3, deadline: 4, reviewAfter: 3 }))), 'chain:project');
  assert.ok(item.title.includes('投入已满'), item.title);
  assert.ok(item.detail.includes('第 4 学期开学答辩'), item.detail);
});

test('deadline 为 8 的 active 链标记紧急并计入 urgentCount', () => {
  for (const progress of [0, 2]) {
    const board = game.advisories(withChain(baseState({ term: 8 }), 'internship', chainEntry('internship', { status: 'active', progress, startedTerm: 7, deadline: 8, reviewAfter: 7 })));
    const item = itemOf(board, 'chain:internship');
    assert.equal(item.urgent, true);
    assert.equal(board.urgentCount, 1);
  }
});

test('deferred 链按下次可申学期提示；过期则提示窗口已过且无关闭预警', () => {
  const fresh = itemOf(game.advisories(withChain(baseState({ term: 5 }), 'project', chainEntry('project', { status: 'deferred', nextEligibleTerm: 6 }))), 'chain:project');
  assert.ok(fresh.detail.includes('第 6 学期可再次申请'), fresh.detail);
  const stale = itemOf(game.advisories(withChain(baseState({ term: 7 }), 'project', chainEntry('project', { status: 'deferred', nextEligibleTerm: 7 }))), 'chain:project');
  assert.ok(stale.detail.includes('申请窗口已过'), stale.detail);
  assert.equal(hasItem(game.advisories(withChain(baseState({ term: 7 }), 'project', chainEntry('project', { status: 'deferred', nextEligibleTerm: 7 }))), 'window:project:closing'), false);
});

test('completed 与 missed 链转入「有了下落的」组', () => {
  const completed = game.advisories(withChain(baseState({ term: 5 }), 'club', chainEntry('club', { status: 'completed' })));
  assert.equal(hasItem(completed, 'chain:club'), false);
  const done = itemOf(completed, 'settled:club');
  assert.equal(done.tag, '已完成');
  assert.equal(done.tagTone, 'done');
  assert.equal(done.urgent, false);
  assert.deepEqual(done.detailList, []);
  const missed = itemOf(game.advisories(withChain(baseState({ term: 5 }), 'club', chainEntry('club', { status: 'missed' }))), 'settled:club');
  assert.equal(missed.tag, '未完成');
  assert.equal(missed.tagTone, 'calm');
  assert.equal(missed.urgent, false);
});

test('第 1 学期：三条链窗口提示齐全，无窗口条目，无紧急', () => {
  const board = game.advisories(baseState({ term: 1 }));
  for (const id of ['project', 'club', 'internship']) assert.equal(hasItem(board, 'chain:' + id), true);
  assert.equal(groupItems(board, 'windows').length, 0);
  assert.equal(board.urgentCount, 0);
  assert.ok(itemOf(board, 'chain:project').detail.includes(String(game.ACTIONS.applyProject.minTerm)));
});

test('第 2 学期社团文案含秋季；第 4 学期出现开放预告', () => {
  const term2 = game.advisories(baseState({ term: 2 }));
  assert.ok(itemOf(term2, 'chain:club').detail.includes('秋季'), itemOf(term2, 'chain:club').detail);
  assert.equal(groupItems(term2, 'windows').length, 0);
  const term4 = game.advisories(baseState({ term: 4 }));
  assert.ok(itemOf(term4, 'window:opening').detail.includes('第 5 学期起开放'), itemOf(term4, 'window:opening').detail);
});

test('第 5 学期：项目下学期截止（非紧急）、社团本学期截止（紧急）', () => {
  const board = game.advisories(baseState({ term: 5 }));
  const project = groupItems(board, 'windows').find((item) => item.id === 'window:project:closing');
  assert.ok(project.detail.includes('下学期'), project.detail);
  assert.equal(project.urgent, false);
  const club = groupItems(board, 'windows').find((item) => item.id === 'window:club:closing');
  assert.ok(club.detail.includes('本学期'), club.detail);
  assert.equal(club.urgent, true);
  assert.equal(hasItem(board, 'window:internship:closing'), false);
  assert.equal(board.urgentCount, 1);
});

test('第 6/7 学期：项目、实习依次进入截止预警，过期链不再显示', () => {
  const term6 = game.advisories(baseState({ term: 6 }));
  assert.equal(groupItems(term6, 'windows').find((item) => item.id === 'window:project:closing').urgent, true);
  assert.ok(itemOf(term6, 'window:internship:closing').detail.includes('下学期'), itemOf(term6, 'window:internship:closing').detail);
  assert.equal(hasItem(term6, 'chain:club'), false);
  assert.equal(hasItem(term6, 'window:club:closing'), false);
  const term7 = game.advisories(baseState({ term: 7 }));
  assert.equal(groupItems(term7, 'windows').find((item) => item.id === 'window:internship:closing').urgent, true);
  assert.equal(hasItem(term7, 'chain:project'), false);
});

test('第 8 学期新档：无链条目与窗口条目，无紧急', () => {
  const board = game.advisories(baseState({ term: 8 }));
  for (const id of ['project', 'club', 'internship']) assert.equal(hasItem(board, 'chain:' + id), false);
  assert.equal(groupItems(board, 'windows').length, 0);
  assert.equal(board.urgentCount, 0);
});

test('口径不漂移：链窗口提示的数值全部来自 ACTIONS 字段', () => {
  const board = game.advisories(baseState({ term: 1 }));
  const expectations = {
    project: ['minTerm', 'maxTerm', 'minPreparation'],
    club: ['minTerm', 'maxTerm'],
    internship: ['minTerm', 'maxTerm']
  };
  for (const [id, fields] of Object.entries(expectations)) {
    const detail = itemOf(board, 'chain:' + id).detail;
    for (const field of fields) assert.ok(detail.includes(String(game.ACTIONS['apply' + id[0].toUpperCase() + id.slice(1)][field])), field + ' → ' + detail);
  }
});

test('义务四条：生病、补测、补考、欠款各自成条', () => {
  const sick = itemOf(game.advisories(baseState({ fitness: 10 })), 'duty:sick');
  assert.equal(sick.urgent, true);
  assert.equal(sick.title, game.ILLNESS_REASON);
  assert.equal(sick.tagTone, 'hot');

  assert.equal(hasItem(game.advisories(baseState({ term: 4, eventFlags: { fitnessRetest: true } })), 'duty:fitnessRetest'), true);

  const retake = baseState({ term: 3, courses: [{ term: 2, grade: 45, passed: false }] });
  assert.equal(hasItem(game.advisories(retake), 'duty:retake'), true);
  const passed = baseState({ term: 3, courses: [{ term: 2, grade: 71, passed: true }] });
  assert.equal(hasItem(game.advisories(passed), 'duty:retake'), false);

  const debt = itemOf(game.advisories(baseState({ cardDebt: 120 })), 'duty:cardDebt');
  assert.ok(debt.title.includes('120'), debt.title);
});

test('方向差距：方向名来自 evaluateEndings，未满足项逐条子行，基础达标项不重复出现', () => {
  const courses = Array.from({ length: 6 }, (_, index) => ({ term: index + 1, grade: 70, passed: true }));
  const state = baseState({ term: 5, courses, furtherStudy: 10, jobPreparation: 10 });
  const board = game.advisories(state);
  const option = game.evaluateEndings(state).options.find((item) => item.id === 'furtherStudy');
  const further = itemOf(board, 'direction:furtherStudy');
  assert.equal(further.title, option.title);
  assert.equal(further.tag, '还差 3 项');
  assert.ok(further.detailList.some((row) => row.includes('平均成绩至少 80')), further.detailList.join('；'));
  assert.ok(further.detailList.some((row) => row.includes('完成校园项目')), further.detailList.join('；'));
  assert.ok(further.detailList.some((row) => row.includes('深造准备至少 60')), further.detailList.join('；'));
  assert.equal(further.detailList.some((row) => row.includes('平均成绩至少 60')), false);
  const employment = itemOf(board, 'direction:employment');
  assert.ok(employment.detailList.some((row) => row.includes('完成实习经历')), employment.detailList.join('；'));
  assert.ok(employment.detailList.some((row) => row.includes('求职准备至少 60')), employment.detailList.join('；'));
  assert.equal(employment.tag, '还差 2 项');
  assert.equal(hasItem(board, 'direction:ordinary'), true);
  assert.equal(hasItem(board, 'direction:blankResume'), true);
  assert.equal(hasItem(board, 'direction:notQualified'), false);
  assert.equal(hasItem(board, 'direction:delayed'), false);
});

test('方向条件全满足时显示统一文案与条件已齐徽章', () => {
  const courses = Array.from({ length: 8 }, (_, index) => ({ term: index + 1, grade: 85, passed: true }));
  const state = withChain(baseState({ term: 8, courses, furtherStudy: 80, jobPreparation: 60 }), 'project', chainEntry('project', { status: 'completed' }));
  const board = game.advisories(withChain(state, 'internship', chainEntry('internship', { status: 'completed' })));
  const further = itemOf(board, 'direction:furtherStudy');
  assert.equal(further.detail, game.ADVISORIES.directions.allMet);
  assert.equal(further.detailList.length, 0);
  assert.equal(further.tag, '条件已齐');
  const employment = itemOf(board, 'direction:employment');
  assert.equal(employment.detail, game.ADVISORIES.directions.allMet);
  assert.equal(employment.tag, '条件已齐');
  assert.equal(groupItems(board, 'settled').length, 2);
  assert.equal(itemOf(board, 'direction:ordinary').tag, '条件已齐');
});

test('urgentCount 计数正确、紧急条目组内置顶、total 与条目数一致', () => {
  const state = withChain(baseState({ term: 8, fitness: 10, cardDebt: 120 }), 'project', chainEntry('project', { status: 'active', startedTerm: 7, deadline: 8, reviewAfter: 7 }));
  const board = game.advisories(state);
  assert.equal(board.urgentCount, 2);
  assert.equal(groupItems(board, 'duties')[0].id, 'duty:sick');
  assert.equal(groupItems(board, 'chains')[0].id, 'chain:project');
  const countable = board.groups.filter((group) => group.id !== 'settled');
  assert.equal(board.total, countable.reduce((sum, group) => sum + group.items.length, 0));
  assert.equal(board.urgentCount, countable.reduce((sum, group) => sum + group.items.filter((item) => item.urgent).length, 0));
});

test('settled 组形态：completed/missed/active 三链恰收两条', () => {
  const state = withChain(withChain(withChain(baseState({ term: 5 }), 'project', chainEntry('project', { status: 'completed' })), 'club', chainEntry('club', { status: 'missed' })), 'internship', chainEntry('internship', { status: 'active', startedTerm: 4, deadline: 6, reviewAfter: 4 }));
  const board = game.advisories(state);
  const settled = groupItems(board, 'settled');
  assert.deepEqual(settled.map((item) => item.id), ['settled:project', 'settled:club']);
  assert.ok(settled[0].title.includes('项目') && settled[0].title.includes('已完成'), settled[0].title);
  assert.ok(settled[1].title.includes('未完成'), settled[1].title);
});

test('settled 不计入 total 与 urgentCount', () => {
  const board = game.advisories(withChain(baseState({ term: 5 }), 'project', chainEntry('project', { status: 'completed' })));
  assert.equal(groupItems(board, 'settled').length, 1);
  // 第 5 学期：idle 链 2（社团/实习）+ 窗口 1（社团本学期截止）+ 方向 4 = 7 条待办；settled 1 条不计入
  assert.equal(board.total, 7);
  assert.equal(board.urgentCount, 1); // 唯一紧急 = 社团本学期截止；settled 条目未计入
});

test('directions 中途态与 8 学期未毕业态均恰四方向', () => {
  for (const term of [3, 8]) {
    const board = game.advisories(baseState({ term }));
    assert.deepEqual(groupItems(board, 'directions').map((item) => item.id), ['direction:ordinary', 'direction:furtherStudy', 'direction:employment', 'direction:blankResume']);
  }
});

test('blankResume 条件已齐：成绩达标但三链全未申请且求职准备不足（真三无毕业轨迹）', () => {
  const courses = Array.from({ length: 8 }, (_, index) => ({ term: index + 1, grade: 70, passed: true }));
  const board = game.advisories(baseState({ term: 8, courses }));
  const blank = itemOf(board, 'direction:blankResume');
  assert.equal(blank.tag, '条件已齐');
  assert.equal(blank.detail, game.ADVISORIES.directions.allMet);
  assert.deepEqual(blank.detailList, []);
});

test('blankResume 条件未满足时 value 哨兵映射为中文', () => {
  const state = withChain(baseState({ term: 5 }), 'project', chainEntry('project', { status: 'completed' }));
  const row = itemOf(game.advisories(state), 'direction:blankResume').detailList.find((line) => line.includes('未完成校园项目'));
  assert.ok(row, '应存在未完成三链条件行');
  assert.ok(row.includes('（当前 已核查）'), row);
  assert.equal(row.includes('checked'), false);
});

test('终局阶段短路返回空面板', () => {
  for (const phase of ['ended', 'finished']) {
    assert.deepEqual(game.advisories(baseState({ phase })), { groups: [], total: 0, urgentCount: 0 });
  }
});
