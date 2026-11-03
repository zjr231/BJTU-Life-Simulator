'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('./game.js');

// 二期岗位化实习：岗位库数据、门槛口径（positionAvailability）、多段实习、答辩结算、意向锁定、重放兼容。

function baseState(overrides = {}) {
  // 固定种子：事件调度随种子变化，随机种子会让门槛矩阵与多段流程不稳定。
  return { ...game.createGame({ nickname: '岗位测试', seed: 'positions-test', legacyEconomy: true }), ...overrides };
}
function withChain(state, patch) {
  return { ...state, chains: { ...state.chains, internship: { ...state.chains.internship, ...patch } } };
}
function makeCourse(state, term, preparation, moneyAfter = 900) {
  const grade = Math.round(40 + preparation * 0.6);
  return { term, name: game.TERM_NAMES[term - 1], preparation, grade, passed: grade >= 60, moneyAfter, unusedTime: 12, counts: {}, notices: [], attributes: { social: state.social, fitness: state.fitness, mood: state.mood }, livingCost: game.RULES.livingCost, aid: 0 };
}
function goodCourses(terms) {
  const template = game.createGame({ legacyEconomy: true });
  return terms.map((term) => makeCourse(template, term, 67));
}
// 旧档兼容夹具：旧版存档可能持有 internshipReview 的待处理事件（三期起该事件不再入队）。
function withReviewPending(state) {
  return { ...state, phase: 'eventPending', pendingEvent: { id: 'internshipReview', term: state.term, instanceId: 'internship:internshipReview:' + state.term } };
}
function withMilestonePending(state) {
  return { ...state, phase: 'eventPending', pendingEvent: { id: 'internshipMilestone', term: state.term, instanceId: 'internship:internshipMilestone:' + state.term } };
}
function resolvePending(state, choice) {
  const result = game.submitEventChoice(state, choice);
  assert.equal(result.ok, true, state.pendingEvent.id + ': ' + result.reason);
  return result;
}
// 消化流程中顺路触发的日常事件（如 term 3 必触发的体测）；实习的 Offer/Review 留给流程自身处理。
function clearStray(state) {
  while (state.pendingEvent && !['internshipOffer', 'internshipReview', 'internshipMilestone'].includes(state.pendingEvent.id)) {
    const result = game.submitEventChoice(state, 'later');
    assert.equal(result.ok, true, state.pendingEvent.id + ': ' + result.reason);
    state = result.state;
  }
  return state;
}
// 完整跑一段实习（三期流程）：申请（带岗位）→ 接受 → 投入累计达标 → 十字路口选「马上办证明」。
function runSegment(state, positionId) {
  const applied = game.executeAction(clearStray(state), 'applyInternship', { positionId });
  assert.equal(applied.ok, true, positionId + ': ' + applied.reason);
  assert.equal(applied.state.pendingEvent.id, 'internshipOffer');
  let current = game.submitEventChoice(applied.state, 'accept').state;
  // T1 门槛 {time:4, energy:24}：两次 15 档投入即可达标；T2/T3 按门槛多投几次。
  const requirement = game.POSITIONS[positionId].workRequirement;
  let guard = 0;
  while (!game.internshipRequirementMet(current)) {
    current = clearStray(current);
    const work = game.executeAction(current, 'internshipWork', { investment: 15 });
    assert.equal(work.ok, true, 'work: ' + work.reason);
    current = work.state;
    assert.ok(++guard < 12, '投入次数超限仍未达标');
  }
  current = clearStray(current);
  assert.equal(current.pendingEvent.id, 'internshipMilestone');
  const settle = game.submitEventChoice(current, 'settle');
  assert.equal(settle.ok, true, settle.reason);
  assert.equal(game.validateState(settle.state).ok, true, JSON.stringify(game.validateState(settle.state)));
  assert.equal(settle.state.chains.internship.status, 'completed');
  return settle;
}

test('岗位库数据完整性：16 岗、引用一致、数值落产出框架', () => {
  const ids = Object.keys(game.POSITIONS);
  assert.equal(ids.length, 16);
  assert.equal(new Set(ids).size, 16);
  assert.equal(Object.keys(game.COMPANIES).length, 11);
  const frame = { 1: [300, 450, 10], 2: [500, 700, 20], 3: [800, 1000, 30] };
  for (const id of ids) {
    const position = game.POSITIONS[id];
    assert.equal(position.id, id);
    assert.ok(Object.hasOwn(game.COMPANIES, position.company), id + ' 公司引用');
    assert.ok([1, 2, 3].includes(position.tier), id);
    const [min, max] = position.window;
    assert.ok(min >= 1 && min <= max && max <= 7, id + ' 窗口');
    assert.ok(position.flavor && position.flavor.length < 200, id + ' 风味');
    if (position.tier === 1) {
      assert.equal(position.requires.grade === undefined, false, id);
      assert.equal(position.requires.resumeAll, undefined, id);
      assert.equal(position.requires.resumeAny, undefined, id);
      assert.equal(position.affinity, undefined, id);
    }
    if (position.tier === 2) {
      assert.equal(position.requires.grade, 60, id);
      assert.deepEqual(position.requires.resumeAny, ['project', 'contest', 'internship'], id);
      assert.equal(position.requires.resumeAll, undefined, id);
      assert.equal(position.affinity.gradeDiscount, 10, id);
    }
    if (position.tier === 3) {
      assert.equal(position.requires.grade, undefined, id);
      assert.ok(position.requires.resumeAll && position.requires.resumeAll.length === 2, id);
      assert.equal(position.requires.resumeAny, undefined, id);
      assert.equal(position.affinity.relaxToAny, true, id);
    }
    const [incomeMin, incomeMax, prep] = frame[position.tier];
    assert.ok(position.rewards.income >= incomeMin && position.rewards.income <= incomeMax, id + ' 收入');
    assert.equal(position.rewards.jobPreparation, prep, id + ' 求职准备');
    for (const key of [...(position.requires.resumeAll || []), ...(position.requires.resumeAny || [])]) assert.ok(game.REQUIREMENT_LABELS[key], id + ' 要件键');
    for (const major of position.affinity?.majors || []) assert.ok(game.BACKGROUNDS.some((item) => item.majors.includes(major)), id + ' 亲和专业');
  }
  assert.deepEqual(game.POSITIONS.yinfu_algo.window, [6, 7]);
});

test('positionAvailability 纯只读', () => {
  const state = baseState({ term: 5 });
  const before = structuredClone(state);
  game.positionAvailability(state, 'yinfu_backend');
  assert.deepEqual(state, before);
  assert.equal(state.rng.calls, before.rng.calls);
  assert.equal(state.revision, before.revision);
});

test('positionAvailability 矩阵：链状态、窗口、成绩线、亲和、简历要件', () => {
  assert.equal(game.positionAvailability(baseState(), 'missing').reason, '未知岗位');
  assert.equal(game.positionAvailability(withChain(baseState({ term: 5 }), { status: 'active' }), 'qiandu_testdev').reason, '当前实习仍在进行中');
  assert.ok(game.positionAvailability(withChain(baseState({ term: 5 }), { status: 'missed' }), 'qiandu_testdev').reason.includes('不能再次申请'));

  // 完成一段后可立即再申（间隔 0）：第 4 学期也能申下一段
  let state = withChain(baseState({ term: 4, experiences: [{ type: 'internship', term: 3 }], courses: goodCourses([1, 2, 3]) }), { status: 'completed', progress: 2 });
  assert.equal(game.positionAvailability(state, 'qiandu_testdev').ok, true);
  // 窗口仍生效：第 4 学期申不了 T2（第 5 学期才开）
  assert.ok(game.positionAvailability(state, 'yinfu_backend').reason.includes('第 5 学期'));
  state = withChain(baseState({ term: 5, experiences: [{ type: 'internship', term: 3 }], courses: goodCourses([1, 2, 3, 4]) }), { status: 'completed', progress: 2 });
  assert.equal(game.positionAvailability(state, 'qiandu_testdev').ok, true);

  assert.equal(game.positionAvailability(baseState({ term: 1 }), 'qiandu_testdev').reason, '第 3 学期开始开放');
  assert.ok(game.positionAvailability(baseState({ term: 8 }), 'qiandu_testdev').reason.includes('窗口已过'));

  const weakCourses = goodCourses([1, 2, 3, 4]).map((course) => makeCourse(baseState(), course.term, 30));
  const weak = game.positionAvailability(baseState({ term: 5, courses: weakCourses }), 'qiandu_testdev');
  assert.equal(weak.ok, false);
  assert.ok(weak.reason.includes('平均成绩需达到 60'), weak.reason);
  assert.ok(weak.gaps[0].includes('还差'), weak.gaps[0]);

  // 对口成绩折扣：T2 通用线 60，信息类降至 50；平均 55 时非对口被成绩拒、对口过成绩线（卡在简历要件）
  const average55 = goodCourses([1, 2, 3, 4]).map((course) => makeCourse(baseState(), course.term, 25));
  const nonMatching = baseState({ term: 5, courses: average55, background: { id: 'engineering', college: '工程类学院', major: '土木工程' } });
  assert.equal(game.positionAvailability(nonMatching, 'sishi_sre').reason, '平均成绩需达到 60');
  const matching = baseState({ term: 5, courses: average55, background: { id: 'information', college: '信息类学院', major: '软件工程' } });
  const discounted = game.positionAvailability(matching, 'sishi_sre');
  assert.equal(discounted.ok, false);
  assert.ok(discounted.reason.includes('简历要件'), '对口专业已过成绩线（50），应卡在简历要件：' + discounted.reason);
  const matchingWithIntern = baseState({ term: 5, courses: average55, experiences: [{ type: 'internship', term: 3 }], background: { id: 'information', college: '信息类学院', major: '软件工程' } });
  assert.equal(game.positionAvailability(matchingWithIntern, 'sishi_sre').ok, true);

  // T3 严格且：非对口只有项目 → 拒（缺竞赛）
  const projectOnly = baseState({ term: 6, courses: goodCourses([1, 2, 3, 4, 5]), experiences: [{ type: 'project', term: 4 }], background: { id: 'engineering', college: '工程类学院', major: '土木工程' } });
  const strictAnd = game.positionAvailability(projectOnly, 'yinfu_algo');
  assert.equal(strictAnd.ok, false);
  assert.ok(strictAnd.reason.includes('竞赛'), strictAnd.reason);
  // T3 对口或化：人工智能专业仅项目即过
  const relaxed = baseState({ term: 6, courses: goodCourses([1, 2, 3, 4, 5]), experiences: [{ type: 'project', term: 4 }], background: { id: 'information', college: '信息类学院', major: '人工智能' } });
  assert.equal(game.positionAvailability(relaxed, 'yinfu_algo').ok, true);
  // T3 非对口但两要件齐 → 过
  const both = baseState({ term: 6, courses: goodCourses([1, 2, 3, 4, 5]), experiences: [{ type: 'project', term: 4 }, { type: 'contest', term: 5 }], background: { id: 'engineering', college: '工程类学院', major: '土木工程' } });
  assert.equal(game.positionAvailability(both, 'yinfu_algo').ok, true);
  // resumeAny：非对口仅有前段实习 → 过
  const internshipOnly = baseState({ term: 5, courses: goodCourses([1, 2, 3, 4]), experiences: [{ type: 'internship', term: 3 }], background: { id: 'engineering', college: '工程类学院', major: '土木工程' } });
  assert.equal(game.positionAvailability(internshipOnly, 'sishi_sre').ok, true);
});

test('executeAction 岗位化：参数校验顺序与链岗位写入', () => {
  const state = baseState({ term: 3, courses: goodCourses([1, 2]) });
  const noPosition = game.executeAction(state, 'applyInternship');
  assert.equal(noPosition.ok, false);
  assert.equal(noPosition.reason, '请先在岗位库中选择一个岗位');
  const unknown = game.executeAction(state, 'applyInternship', { positionId: 'missing' });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.reason, '未知岗位');
  // 生病拦截先于岗位校验：带不带 positionId 都是 ILLNESS_REASON
  assert.equal(game.executeAction(baseState({ term: 3, fitness: 10 }), 'applyInternship', { positionId: 'qiandu_testdev' }).reason, game.ILLNESS_REASON);
  assert.equal(game.executeAction(baseState({ term: 3, fitness: 10 }), 'applyInternship').reason, game.ILLNESS_REASON);
  // 成功申请：链挂岗位、command 记录、entry 展示、Offer 入队
  const applied = game.executeAction(state, 'applyInternship', { positionId: 'qiandu_testdev' });
  assert.equal(applied.ok, true, applied.reason);
  assert.equal(applied.state.chains.internship.positionId, 'qiandu_testdev');
  assert.equal(applied.entry.command.positionId, 'qiandu_testdev');
  assert.equal(applied.entry.position.title, '测试开发实习生');
  assert.equal(applied.state.pendingEvent.id, 'internshipOffer');
  assert.equal(game.validateState(applied.state).ok, true);
  // T2 简历要件：无要件拒，注入后过
  const t2Failed = game.executeAction(baseState({ term: 5, courses: goodCourses([1, 2, 3, 4]) }), 'applyInternship', { positionId: 'yinfu_backend' });
  assert.equal(t2Failed.ok, false);
  assert.ok(t2Failed.reason.includes('简历要件'), t2Failed.reason);
  const t2Ok = game.executeAction(baseState({ term: 5, courses: goodCourses([1, 2, 3, 4]), experiences: [{ type: 'project', term: 4 }] }), 'applyInternship', { positionId: 'yinfu_backend' });
  assert.equal(t2Ok.ok, true, t2Ok.reason);
});

test('多段实习：完成一段后下一学期即可再申', () => {
  let state = baseState({ term: 3, courses: goodCourses([1, 2]) });
  state = runSegment(state, 'qiandu_testdev').state;
  assert.deepEqual(state.experiences.map((item) => [item.type, item.term]), [['internship', 3]]);
  assert.equal(state.chains.internship.status, 'completed');
  // 同学期不可再申（事件按学期去重），提示精确学期
  const sameTerm = game.executeAction(state, 'applyInternship', { positionId: 'qiushuo_fullstack' });
  assert.equal(sameTerm.ok, false);
  assert.ok(sameTerm.reason.includes('第 4 学期'), sameTerm.reason);
  // 下一学期即可再申
  state = game.continueGame(game.endTerm(clearStray(state)).state).state;
  state = clearStray(state);
  assert.equal(state.term, 4);
  const nextApply = game.executeAction(clearStray(state), 'applyInternship', { positionId: 'qiushuo_fullstack' });
  assert.equal(nextApply.ok, true, nextApply.reason);
  assert.equal(nextApply.state.pendingEvent.id, 'internshipOffer');
  // 接受新一段邀请后投入到达标并办证明（不重新申请）
  let current = game.submitEventChoice(nextApply.state, 'accept').state;
  let guard = 0;
  while (!game.internshipRequirementMet(current)) {
    current = clearStray(current);
    current = game.executeAction(current, 'internshipWork', { investment: 15 }).state;
    assert.ok(++guard < 12, '第二段投入超限');
  }
  current = clearStray(current);
  assert.equal(current.pendingEvent.id, 'internshipMilestone');
  state = game.submitEventChoice(current, 'settle').state;
  assert.deepEqual(state.experiences.map((item) => item.term), [3, 4], '相邻学期两段不同岗位');
  assert.deepEqual(state.experiences.map((item) => item.positionId), ['qiandu_testdev', 'qiushuo_fullstack']);
  assert.equal(game.validateState(state).ok, true, JSON.stringify(game.validateState(state)));
});

test('答辩结算：段收入与求职准备一次到账，不受体能挡位影响', () => {
  for (const fitness of [50, 90]) {
    let state = withChain(baseState({ term: 5, fitness, courses: goodCourses([1, 2, 3, 4]) }), { status: 'active', progress: 2, startedTerm: 5, deadline: 6, reviewAfter: 5, positionId: 'qiushuo_fullstack' });
    const moneyBefore = state.money;
    const prepBefore = state.jobPreparation;
    const review = resolvePending(withReviewPending(state), 'complete');
    assert.equal(review.state.money, moneyBefore + 300);
    assert.equal(review.state.jobPreparation, prepBefore + 10);
    assert.deepEqual(review.entry.positionReward, { positionId: 'qiushuo_fullstack', title: '全栈实习生', income: 300, jobPreparation: 10 });
    assert.equal(game.validateState(review.state).ok, true);
  }
  // cardDebt 优先抵偿：欠 40 时净入账 260，欠款清零
  let state = withChain(baseState({ term: 5, cardDebt: 40, courses: goodCourses([1, 2, 3, 4]) }), { status: 'active', progress: 2, startedTerm: 5, deadline: 6, reviewAfter: 5, positionId: 'qiushuo_fullstack' });
  const moneyBefore = state.money;
  const review = resolvePending(withReviewPending(state), 'complete');
  assert.equal(review.entry.cardDebtPaid, 40);
  assert.equal(review.state.money, moneyBefore + 260);
  assert.equal(review.state.cardDebt, 0);
  // 旧链无岗位：答辩照旧只给 mood + 经历，钱包与求职准备不变
  state = withChain(baseState({ term: 5, courses: goodCourses([1, 2, 3, 4]) }), { status: 'active', progress: 2, startedTerm: 5, deadline: 6, reviewAfter: 5 });
  const legacyMoney = state.money;
  const legacyPrep = state.jobPreparation;
  const legacy = resolvePending(withReviewPending(state), 'complete');
  assert.equal(legacy.state.money, legacyMoney);
  assert.equal(legacy.state.jobPreparation, legacyPrep);
  assert.equal(legacy.entry.positionReward, undefined);
});

test('意向锁定：命令语义与抽屉目标差距卡', () => {
  let state = baseState({ term: 1 });
  const locked = game.setTargetPosition(state, 'yinfu_backend', { commandId: 't1' });
  assert.equal(locked.ok, true);
  assert.equal(locked.state.targetPosition, 'yinfu_backend');
  assert.equal(locked.entry.command.id, 'yinfu_backend');
  assert.equal(game.setTargetPosition(locked.state, 'yinfu_backend', { commandId: 't2' }).reason, '求职意向没有变化');
  assert.equal(game.setTargetPosition(locked.state, 'missing', { commandId: 't3' }).reason, '未知岗位');
  assert.equal(game.setTargetPosition({ ...locked.state, phase: 'summary' }, null, { commandId: 't4' }).reason, '现在不能调整求职意向');
  const canceled = game.setTargetPosition(locked.state, null, { commandId: 't5' });
  assert.equal(canceled.state.targetPosition, null);
  assert.equal(game.setTargetPosition(canceled.state, null, { commandId: 't6' }).reason, '求职意向没有变化');

  // 目标差距卡：term 1 窗口未到，插在四方向之前
  const board = game.advisories(locked.state);
  const directions = board.groups.find((group) => group.id === 'directions');
  assert.deepEqual(directions.items.map((item) => item.id), ['direction:target', 'direction:ordinary', 'direction:furtherStudy', 'direction:employment', 'direction:blankResume']);
  const target = directions.items[0];
  assert.equal(target.title, '目标：后端开发实习生');
  assert.equal(target.tag, '还差 1 项');
  assert.ok(target.detailList[0].includes('第 5 学期起开放'), target.detailList[0]);
  // 取消后目标卡消失
  assert.equal(game.advisories(canceled.state).groups.some((group) => group.items.some((item) => item.id === 'direction:target')), false);
  // 达标态：要件齐 + 成绩够 + 窗口内
  const readyState = { ...baseState({ term: 5, experiences: [{ type: 'project', term: 3 }], courses: goodCourses([1, 2, 3, 4]) }), targetPosition: 'yinfu_backend' };
  const ready = game.advisories(readyState).groups.find((group) => group.id === 'directions').items[0];
  assert.equal(ready.tag, '可申请');
  assert.equal(ready.detail, game.ADVISORIES.targetPosition.readyDetail);
  assert.deepEqual(ready.detailList, []);
});

test('重放含 positionId 与意向锁定的整局命令', () => {
  // 自包含真实流：注入课程无法走命令重放（重放从 createGame 起局是唯一真相），前两学期真实学习攒成绩线。
  let state = baseState();
  const run = (fn) => {
    const result = fn();
    assert.equal(result.ok, true, result.reason);
    state = result.state;
    state = clearStray(state);
  };
  const recover = () => {
    // 45 是「一般」体能挡的下缘：低于它学习会被虚弱挡放大消耗，连学三次会坠入生病。
    while (state.time >= 1 && (state.fitness < 45 || state.energy < 20)) run(() => game.executeAction(state, 'rest', { investment: 1 }));
  };
  const studyTerm = () => {
    for (let i = 0; i < 3; i++) {
      recover();
      run(() => game.executeAction(state, 'study'));
    }
    recover();
    run(() => game.endTerm(state));
    run(() => game.continueGame(state));
  };
  studyTerm();
  studyTerm();
  assert.equal(state.term, 3);
  while (state.time >= 1 && (state.fitness < 45 || state.energy < 45)) run(() => game.executeAction(state, 'rest', { investment: 1 }));
  run(() => game.executeAction(state, 'applyInternship', { positionId: 'qiushuo_fullstack' }));
  run(() => game.submitEventChoice(state, 'accept'));
  run(() => game.executeAction(state, 'internshipWork', { investment: 15 }));
  run(() => game.executeAction(state, 'internshipWork', { investment: 15 }));
  // 三期：累计投入达标后弹「实习的十字路口」，选马上办证明。
  assert.equal(state.pendingEvent && state.pendingEvent.id, 'internshipMilestone');
  run(() => game.submitEventChoice(state, 'settle'));
  run(() => game.setTargetPosition(state, 'yinfu_backend'));
  const commands = state.history.map((entry) => ({ ...entry.command, commandId: entry.commandId }));
  const replayed = game.replay({ nickname: state.nickname, seed: state.rng.seed, legacyEconomy: true, commands });
  assert.equal(replayed.ok, true, replayed.reason);
  assert.deepEqual(replayed.state, state);
  assert.equal(replayed.state.chains.internship.positionId, 'qiushuo_fullstack');
  assert.equal(replayed.state.targetPosition, 'yinfu_backend');
});

test('氛围事件接求职效果', () => {
  const jobFair = { ...baseState({ fitness: 50 }), phase: 'eventPending', pendingEvent: { id: 'jobFair', term: 1, instanceId: 'daily:jobFair:1' } };
  const browse = game.submitEventChoice(jobFair, 'browse');
  assert.equal(browse.ok, true, browse.reason);
  assert.equal(browse.changes.jobPreparation, 4);
  const alumniStory = { ...baseState({ fitness: 50 }), phase: 'eventPending', pendingEvent: { id: 'alumniStory', term: 1, instanceId: 'daily:alumniStory:1' } };
  const listen = game.submitEventChoice(alumniStory, 'listen');
  assert.equal(listen.ok, true, listen.reason);
  assert.equal(listen.changes.jobPreparation, 3);
});

test('运维岗位的实习投入体能偏移', () => {
  const withPosition = withChain(baseState({ term: 5 }), { status: 'active', progress: 0, startedTerm: 5, deadline: 6, reviewAfter: 5, positionId: 'jingxi_ops' });
  assert.equal(game.getAction(withPosition, 'internshipWork').fitnessCost, 5);
  const withoutPosition = withChain(baseState({ term: 5 }), { status: 'active', progress: 0, startedTerm: 5, deadline: 6, reviewAfter: 5 });
  assert.equal(game.getAction(withoutPosition, 'internshipWork').fitnessCost, 3);
});

test('存档校验：意向与岗位的篡改矩阵', () => {
  // 构造合法完成态并推进到第 5 学期
  let state = baseState({ term: 3, courses: goodCourses([1, 2]) });
  state = runSegment(state, 'qiandu_testdev').state;
  state = game.continueGame(game.endTerm(clearStray(state)).state).state;
  state = clearStray(state);
  state = game.continueGame(game.endTerm(clearStray(state)).state).state;
  state = clearStray(state);
  assert.equal(state.term, 5);
  assert.equal(game.validateState(state).ok, true);

  const expectFail = (mutated, keyword) => {
    const verdict = game.validateState(mutated);
    assert.equal(verdict.ok, false, '应被拒绝：' + keyword);
    assert.ok(verdict.reason.includes(keyword), keyword + ' → ' + verdict.reason);
  };
  expectFail({ ...state, targetPosition: 'bad' }, '求职意向');
  expectFail({ ...state, chains: { ...state.chains, internship: { ...state.chains.internship, positionId: 'bad' } } }, '实习链岗位');
  expectFail({ ...state, chains: { ...state.chains, project: { ...state.chains.project, positionId: 'qiandu_testdev' } } }, '实习链岗位');
  expectFail({ ...state, history: state.history.map((entry) => entry.command.operation === 'executeAction' && entry.command.id === 'applyInternship' ? { ...entry, command: { ...entry.command, positionId: 'bad' } } : entry) }, '历史岗位');
  // 同学期同岗位的重复经历仍拒（实习经历按 学期+岗位 区分）
  expectFail({ ...state, experiences: [...state.experiences, { type: 'internship', term: 3, positionId: 'qiandu_testdev' }] }, '重复经历');
  // 间隔为 0：completed 链上的新一段 Offer 合法（已满窗口内的学期）
  const legalReapplyOffer = { ...state, phase: 'eventPending', pendingEvent: { id: 'internshipOffer', term: 5, instanceId: 'internship:internshipOffer:5' } };
  assert.equal(game.validateState(legalReapplyOffer).ok, true, JSON.stringify(game.validateState(legalReapplyOffer)));
  // 同学期、已完成链上的伪造 Offer 属合法形态（间隔 0），篡改矩阵不再覆盖此项——
  // 窗口上限（第 7 学期后不可申请）由 positionAvailability 矩阵用例守护。
  // 合法形态：隔学年后的新一段 Offer（第 7 学期）应通过
  let lateState = baseState({ term: 3, courses: goodCourses([1, 2]) });
  lateState = runSegment(lateState, 'qiandu_testdev').state;
  for (let term = 3; term < 6; term++) lateState = game.continueGame(game.endTerm(clearStray(lateState)).state).state;
  assert.equal(lateState.term, 6);
  const legalOffer = { ...lateState, phase: 'eventPending', pendingEvent: { id: 'internshipOffer', term: 6, instanceId: 'internship:internshipOffer:6' } };
  assert.equal(game.validateState(legalOffer).ok, true, JSON.stringify(game.validateState(legalOffer)));
});

test('实习经历记录公司与岗位，简历可见', () => {
  let state = baseState({ term: 3, courses: goodCourses([1, 2]) });
  state = runSegment(state, 'qiandu_testdev').state;
  const record = state.experiences.find((item) => item.type === 'internship');
  assert.equal(record.positionId, 'qiandu_testdev');
  const resume = game.resume(state);
  const internship = resume.sections.find((section) => section.id === 'internship');
  assert.equal(internship.items.length, 1);
  assert.equal(internship.items[0].company, '千度');
  assert.equal(internship.items[0].title, '测试开发实习生');
  assert.equal(internship.items[0].tier, 1);
  assert.equal(game.validateState(state).ok, true, JSON.stringify(game.validateState(state)));
});

test('旧档实习经历没有岗位时简历照常渲染', () => {
  const state = baseState({ experiences: [{ type: 'internship', term: 3 }] });
  const item = game.resume(state).sections.find((section) => section.id === 'internship').items[0];
  assert.deepEqual(item, { term: 3, type: 'internship' });
  assert.equal(item.company, undefined);
  // 旧档（无岗位字段）仍可通过校验
  const legacy = { ...state, term: 4, courses: goodCourses([1, 2, 3]), chains: { ...state.chains, internship: { status: 'completed', progress: 2, startedTerm: 3, deadline: 4, nextEligibleTerm: 1, reviewAfter: 3 } } };
  assert.equal(game.validateState(legacy).ok, true, JSON.stringify(game.validateState(legacy)));
});

test('经历上的岗位必须是岗位库中的岗位', () => {
  const base = baseState({ term: 5, courses: goodCourses([1, 2, 3, 4]) });
  const withBadPosition = { ...base, experiences: [{ type: 'internship', term: 3, positionId: 'bad' }] };
  const verdict = game.validateState(withBadPosition);
  assert.equal(verdict.ok, false);
  assert.ok(verdict.reason.includes('经历岗位'), verdict.reason);
});

test('进行中与已了结的实习都报出公司岗位', () => {
  // 进行中：链挂岗位
  const active = withChain(baseState({ term: 5 }), { status: 'active', progress: 1, startedTerm: 5, deadline: 6, reviewAfter: 5, positionId: 'yinfu_backend' });
  const activeItem = itemOfBoard(game.advisories(active), 'chain:internship');
  assert.ok(activeItem.title.includes('音符跳动'), activeItem.title);
  assert.ok(activeItem.title.includes('后端开发实习生'), activeItem.title);
  assert.ok(activeItem.title.includes('进行中'), activeItem.title);
  // 已了结：从最后一段经历读岗位
  const done = baseState({ term: 6, courses: goodCourses([1, 2, 3, 4, 5]), experiences: [{ type: 'internship', term: 3, positionId: 'qiandu_testdev' }] });
  done.chains.internship = { status: 'completed', progress: 2, startedTerm: 3, deadline: 4, nextEligibleTerm: 1, reviewAfter: 3, positionId: 'qiandu_testdev' };
  const settledItem = itemOfBoard(game.advisories(done), 'settled:internship');
  assert.ok(settledItem.title.includes('千度'), settledItem.title);
  assert.ok(settledItem.title.includes('已完成'), settledItem.title);
});

function itemOfBoard(board, id) {
  for (const group of board.groups) {
    const found = group.items.find((item) => item.id === id);
    if (found) return found;
  }
  return null;
}

// ===== 三期：岗位化实习内容 + 完成机制 =====

test('三期数据完整性：16 岗 workPlans/wages/workRequirement 按档位框架', () => {
  const frame = { 1: { wages: [50, 100, 150], req: { time: 4, energy: 24 } }, 2: { wages: [80, 160, 240], req: { time: 6, energy: 40 } }, 3: { wages: [120, 240, 360], req: { time: 9, energy: 70 } } };
  for (const [id, position] of Object.entries(game.POSITIONS)) {
    assert.equal(position.workPlans.length, 3, id + ' workPlans 长度');
    for (const plan of position.workPlans) assert.ok(typeof plan === 'string' && plan.length >= 4 && plan.length < 40, id + ' 文案: ' + plan);
    assert.equal(new Set(position.workPlans).size, 3, id + ' 文案重复');
    assert.deepEqual(position.wages, frame[position.tier].wages, id + ' 薪资框架');
    assert.deepEqual(position.workRequirement, frame[position.tier].req, id + ' 门槛框架');
  }
});

test('实习投入档位按岗位显示内容与日薪', () => {
  // T2 岗位：按钮名来自 workPlans、日薪来自岗位 wages
  const sre = withChain(baseState({ term: 5 }), { status: 'active', progress: 0, startedTerm: 5, deadline: 6, reviewAfter: 5, positionId: 'sishi_sre' });
  const sreProfile = game.getActionInvestment(sre, 'internshipWork');
  assert.deepEqual(sreProfile.tiers.map((tier) => tier.label), game.POSITIONS.sishi_sre.workPlans);
  assert.deepEqual(sreProfile.tiers.map((tier) => tier.income), [80, 160, 240]);
  // T1 岗位
  const t1 = withChain(baseState({ term: 5 }), { status: 'active', progress: 0, startedTerm: 5, deadline: 6, reviewAfter: 5, positionId: 'qiandu_testdev' });
  assert.deepEqual(game.getActionInvestment(t1, 'internshipWork').tiers.map((tier) => tier.label), game.POSITIONS.qiandu_testdev.workPlans);
  // 无岗位链（经济档）：保持通用文案与默认日薪
  const ecoBase = { ...game.createGame({ nickname: '岗位测试', seed: 'positions-test' }), term: 5 };
  const orphan = { ...ecoBase, chains: { ...ecoBase.chains, internship: { ...ecoBase.chains.internship, status: 'active', progress: 0, startedTerm: 5, deadline: 6, reviewAfter: 5 } } };
  const orphanProfile = game.getActionInvestment(orphan, 'internshipWork');
  assert.deepEqual(orphanProfile.tiers.map((tier) => tier.income), [50, 100, 150]);
  assert.equal(orphanProfile.tiers[0].label, '处理基础事务');
});

test('实习按档位名义投入累计，progress 退役；项目社团仍按次数', () => {
  let state = withChain(baseState({ term: 5, courses: goodCourses([1, 2, 3, 4]) }), { status: 'active', progress: 0, startedTerm: 5, deadline: 6, reviewAfter: 5, positionId: 'qiandu_testdev', workTime: 0, workEnergy: 0, milestoneSeen: false });
  const work = game.executeAction(state, 'internshipWork', { investment: 15 });
  assert.equal(work.ok, true, work.reason);
  assert.equal(work.state.chains.internship.workTime, 2);
  assert.equal(work.state.chains.internship.workEnergy, 15);
  assert.equal(work.state.chains.internship.progress, 0, 'progress 退役恒 0');
  // 项目链仍按次数
  const projectBase = baseState({ term: 5 });
  const project = { ...projectBase, chains: { ...projectBase.chains, project: { ...projectBase.chains.project, status: 'active', progress: 0, startedTerm: 4, deadline: 6, reviewAfter: 4 } } };
  const projectWork = game.executeAction(project, 'projectWork', { investment: 15 });
  assert.equal(projectWork.state.chains.project.progress, 1);
});

test('十字路口：达标弹窗、继续后不再重弹、随时可手动办证明', () => {
  const active = { status: 'active', progress: 0, startedTerm: 5, deadline: 6, reviewAfter: 5, positionId: 'qiandu_testdev', workTime: 2, workEnergy: 15, milestoneSeen: false };
  // 未达标：settleInternship 拒绝
  const notYet = withChain(baseState({ term: 5, courses: goodCourses([1, 2, 3, 4]) }), active);
  assert.equal(game.settleInternship(notYet, {}).reason, '实习投入还没达到证明门槛');
  // 达标：手动办证明成功
  const ready = withChain(baseState({ term: 5, courses: goodCourses([1, 2, 3, 4]) }), { ...active, workTime: 4, workEnergy: 30 });
  const settled = game.settleInternship(ready, { commandId: 'settle-1' });
  assert.equal(settled.ok, true, settled.reason);
  assert.equal(settled.state.chains.internship.status, 'completed');
  assert.equal(settled.state.experiences.filter((item) => item.type === 'internship').length, 1);
  assert.equal(settled.entry.positionReward.income, 400);
  // 非进行中：拒绝
  assert.equal(game.settleInternship(settled.state, { commandId: 'settle-2' }).reason, '当前没有进行中的实习');
  // 无岗位：拒绝
  const noPosition = withChain(baseState({ term: 5, courses: goodCourses([1, 2, 3, 4]) }), { status: 'active', progress: 2, startedTerm: 5, deadline: 6, reviewAfter: 5 });
  assert.equal(game.settleInternship(noPosition, { commandId: 'settle-3' }).reason, '这段实习没有关联岗位');
});

test('达标后继续投入拿岗位日薪，次数上限已移除（由时间/精力约束）', () => {
  // 固定日薪只在经济档生效（legacy 档走可变收入，见二期口径）
  const ecoBase = { ...game.createGame({ nickname: '岗位测试', seed: 'positions-test' }), term: 5, courses: goodCourses([1, 2, 3, 4]), fitness: 80, energy: 100 };
  let state = { ...ecoBase, chains: { ...ecoBase.chains, internship: { ...ecoBase.chains.internship, status: 'active', progress: 0, startedTerm: 5, deadline: 6, reviewAfter: 5, positionId: 'sishi_sre', workTime: 6, workEnergy: 40, milestoneSeen: true } } };
  const moneyBefore = state.money;
  const first = game.executeAction(clearStray(state), 'internshipWork', { investment: 15 });
  assert.equal(first.ok, true, first.reason);
  assert.equal(first.state.money - moneyBefore, 160, 'T2 中档日薪');
  // 第三次投入仍可执行：不再有每学期次数上限，只有时间/精力在管
  const second = game.executeAction(clearStray(first.state), 'internshipWork', { investment: 15 });
  assert.equal(second.ok, true, second.reason);
  const third = game.executeAction(clearStray(second.state), 'internshipWork', { investment: 15 });
  assert.equal(third.ok === true || /精力|时间|体能/.test(third.reason), true, '第三次应被资源而非次数拦下：' + third.reason);
  if (third.ok) assert.equal(third.state.chains.internship.workTime, 12, '继续投入仍累计');
});

test('毕业保底：第 8 学期达标未办证明的实习自动收尾并结算', () => {
  const base = baseState({ term: 8, courses: goodCourses([1, 2, 3, 4, 5, 6, 7]), fitness: 80, energy: 100 });
  const ready = { ...base, chains: { ...base.chains, internship: { ...base.chains.internship, status: 'active', progress: 0, startedTerm: 7, deadline: 8, reviewAfter: 7, positionId: 'qiandu_testdev', workTime: 4, workEnergy: 30, milestoneSeen: true } } };
  const moneyBefore = ready.money;
  const prepBefore = ready.jobPreparation;
  const settled = game.endTerm(ready);
  assert.equal(settled.ok, true, settled.reason);
  assert.equal(settled.state.chains.internship.status, 'completed', '达标后不判未完成');
  // legacy 档学期结算会扣固定生活支出；段收入 400 单独计入
  assert.equal(settled.state.money, moneyBefore + 400 - game.RULES.livingCost, '段收入到账（扣除本学期生活支出）');
  assert.equal(settled.state.jobPreparation, prepBefore + 10);
  assert.equal(settled.state.experiences.filter((item) => item.type === 'internship').length, 1);
  assert.equal(settled.state.experiences.find((item) => item.type === 'internship').positionId, 'qiandu_testdev');
  assert.ok(settled.state.summary.notices.some((note) => note.includes('自动收尾')), JSON.stringify(settled.state.summary.notices));
  // 未达标的实习第 8 学期仍判未完成
  const partial = { ...base, chains: { ...base.chains, internship: { ...base.chains.internship, status: 'active', progress: 0, startedTerm: 7, deadline: 8, reviewAfter: 7, positionId: 'qiandu_testdev', workTime: 2, workEnergy: 15, milestoneSeen: false } } };
  const missed = game.endTerm(partial);
  assert.equal(missed.state.chains.internship.status, 'missed');
  assert.equal(missed.state.experiences.filter((item) => item.type === 'internship').length, 0);
});

test('旧档 grandfather：progress≥2 视为已达标并可结算', () => {
  const legacyReady = withChain(baseState({ term: 5, courses: goodCourses([1, 2, 3, 4]) }), { status: 'active', progress: 2, startedTerm: 5, deadline: 6, reviewAfter: 5, positionId: 'qiandu_testdev' });
  assert.equal(game.internshipRequirementMet(legacyReady), true);
  assert.equal(game.internshipProgress(legacyReady).met, true);
  const settled = game.settleInternship(legacyReady, { commandId: 'legacy-settle' });
  assert.equal(settled.ok, true, settled.reason);
  assert.equal(settled.state.chains.internship.status, 'completed');
  // progress=1 的旧链不达标
  const legacyPartial = withChain(baseState({ term: 5 }), { status: 'active', progress: 1, startedTerm: 5, deadline: 6, reviewAfter: 5, positionId: 'qiandu_testdev' });
  assert.equal(game.internshipRequirementMet(legacyPartial), false);
});
