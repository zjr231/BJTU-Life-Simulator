'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('./game.js');
const coursesApi = require('./courses.js');
const save = require('./save.js');
const rng = require('./rng.js');

function memory() {
  const data = new Map();
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}
function selectFirst(state, count = 3) {
  const ids = game.coursesForTerm(state.term, state.background.id, state.background.major).slice(0, count).map((course) => course.id);
  const result = game.selectCourses(state, ids);
  assert.equal(result.ok, true, result.reason);
  return result.state;
}
function clearEvents(state) {
  while (state.pendingEvent) {
    const event = game.EVENTS[state.pendingEvent.id];
    const choice = event.choices.find((item) => game.eventAvailability(state, item.id).ok);
    assert.ok(choice, '事件至少有一个可用选项');
    const result = game.submitEventChoice(state, choice.id);
    assert.equal(result.ok, true, result.reason);
    state = result.state;
  }
  return state;
}
function submitAll(state, correct) {
  const answers = state.exam.questions.map((question) => correct ? question.answer : (question.answer + 1) % 4);
  const result = game.submitExam(state, answers);
  assert.equal(result.ok, true, result.reason);
  return result;
}

test('课程目录覆盖 8 个学期、3 个背景和 12 个专业，每学期每个专业至少 5 门可选', () => {
  assert.equal(new Set(game.COURSES.map((course) => course.id)).size, game.COURSES.length);
  for (const course of game.COURSES) {
    assert.ok(Object.hasOwn(game.SUBJECTS, course.subject), course.id);
    assert.ok(course.credits > 0, course.id);
    assert.ok(course.description.length > 8, course.id);
    if (course.topic) assert.ok(Object.hasOwn(coursesApi.TOPICS, course.topic), course.id);
  }
  assert.equal(game.courseById('english1').subject, 'english');
  assert.equal(game.courseById('ethics').subject, 'humanities');
  assert.equal(game.courseById('pe1').subject, 'sports');
  assert.equal(game.courseById('law').subject, 'law');
  assert.equal(game.courseById('soilMechanics').subject, 'civil');
  assert.equal(game.courseById('powerSystemAnalysis').subject, 'electrical');
  assert.equal(game.courseById('communicationPrinciples').subject, 'communication');
  assert.ok(game.COURSES.filter((course) => course.subject === 'general').length <= 4);
  assert.equal(game.BACKGROUNDS.reduce((sum, background) => sum + background.majors.length, 0), 12);
  for (let term = 1; term <= 8; term++) {
    for (const background of game.BACKGROUNDS) {
      for (const major of background.majors) {
        const available = game.coursesForTerm(term, background.id, major);
        assert.ok(available.length >= 5, term + ':' + background.id + ':' + major);
        assert.ok(available.every((course) => course.term === term
          && (course.background === 'common' || course.background === background.id)
          && (!course.major || course.major === major)), term + ':' + major);
      }
    }
  }
});

test('二十一个学科题库充足，定量课程绑定算法生成器', () => {
  assert.equal(Object.keys(coursesApi.SUBJECTS).length, 21);
  assert.equal(Object.keys(coursesApi.QUESTIONS).length, 21);
  const ids = new Set();
  for (const [subject, questions] of Object.entries(coursesApi.QUESTIONS)) {
    assert.ok(Object.hasOwn(game.SUBJECTS, subject));
    assert.ok(questions.length >= 6, subject);
    for (const question of questions) {
      assert.equal(ids.has(question.id), false, question.id);
      ids.add(question.id);
      assert.equal(question.options.length, 4, question.id);
      assert.equal(new Set(question.options).size, 4, question.id);
      assert.ok(question.answer >= 0 && question.answer < 4, question.id);
      assert.ok(question.prompt.length > 4, question.id);
    }
  }
  const topics = new Set(game.COURSES.filter((course) => course.topic).map((course) => course.topic));
  for (const [topic, templates] of Object.entries(coursesApi.TOPICS)) {
    assert.ok(templates.length >= 2, topic);
    assert.equal(topics.has(topic), true, topic);
  }
});

test('选课必须 3 门、不可重复且只能选本学期课程', () => {
  const initial = game.createGame({ seed: 'course-select' });
  const available = game.coursesForTerm(initial.term, initial.background.id, initial.background.major).map((course) => course.id);
  assert.equal(game.selectCourses(initial, available.slice(0, 2)).ok, false);
  assert.equal(game.selectCourses(initial, [available[0], available[0], available[1]]).ok, false);
  const unavailable = game.COURSES.find((course) => !available.includes(course.id)).id;
  assert.equal(game.selectCourses(initial, [available[0], available[1], unavailable]).ok, false);
  const selected = game.selectCourses(initial, available.slice(0, 3));
  assert.equal(selected.ok, true, selected.reason);
  assert.deepEqual(selected.state.selectedCourses, available.slice(0, 3));
  assert.equal(selected.state.history.at(-1).command.operation, 'selectCourses');
  assert.equal(game.validateState(selected.state).ok, true);
  assert.equal(game.selectCourses(selected.state, available.slice(0, 3)).ok, false);
});

test('专业课按专业隔离，跨专业课程不可选', () => {
  const base = game.createGame({ seed: 'major-filter' });
  const computer = { ...base, term: 5, background: { id: 'information', college: '信息类学院', major: '计算机科学与技术' } };
  const computerCourses = game.coursesForTerm(5, 'information', '计算机科学与技术');
  const communicationCourses = game.coursesForTerm(5, 'information', '通信工程');
  assert.ok(computerCourses.some((course) => course.id === 'computerArchitecture'));
  assert.ok(!computerCourses.some((course) => course.id === 'communicationPrinciples'));
  assert.ok(communicationCourses.some((course) => course.id === 'communicationPrinciples'));
  assert.ok(!communicationCourses.some((course) => course.id === 'computerArchitecture'));
  const ids = [...computerCourses.slice(0, 2).map((course) => course.id), 'communicationPrinciples'];
  assert.equal(game.selectCourses(computer, ids).ok, false);
});

test('开考生成 5 道 20 分题，覆盖所选课程，且阶段锁定', () => {
  const selected = selectFirst(game.createGame({ seed: 'exam-start' }));
  assert.equal(game.beginExam(game.createGame()).ok, false);
  const first = game.beginExam(selected);
  assert.equal(first.ok, true, first.reason);
  assert.equal(first.state.phase, 'examPending');
  assert.equal(first.state.exam.questions.length, 5);
  assert.equal(first.state.exam.generator, 'v2');
  assert.ok(first.state.exam.questions.every((question) => question.points === 20 && question.options.length === 4 && new Set(question.options).size === 4));
  assert.equal(new Set(first.state.exam.questions.map((question) => question.id)).size, 5);
  assert.deepEqual(new Set(first.state.exam.questions.map((question) => question.courseId)), new Set(selected.selectedCourses));
  const second = game.beginExam(selected);
  assert.deepEqual(second.state.exam, first.state.exam);
  assert.equal(game.validateState(first.state).ok, true);
  assert.equal(game.executeAction(first.state, 'rest').ok, false);
  assert.equal(game.endTerm(first.state).ok, false);
  assert.equal(game.selectCourses(first.state, selected.selectedCourses).ok, false);
});

test('定量课程生成计算题，种子相同可复现、种子不同会变化', () => {
  const ids = ['calc2', 'linearAlgebra', 'physics1'];
  const first = game.generateExam(ids, 'calc-a', rng);
  const second = game.generateExam(ids, 'calc-a', rng);
  assert.deepEqual(first, second);
  assert.ok(first.questions.every((question) => question.id.startsWith('gen-')));
  assert.ok(first.questions.every((question) => /\d/.test(question.prompt)));
  assert.ok(first.questions.every((question) => question.options.length === 4 && new Set(question.options).size === 4 && question.answer >= 0 && question.answer < 4));
  assert.deepEqual(new Set(first.questions.map((question) => question.courseId)), new Set(ids));
  const integrals = coursesApi.TOPICS.calculus.map((template) => template(() => 0.42).prompt).filter((prompt) => prompt.includes('定积分'));
  assert.equal(integrals.length, 1);
  assert.ok(integrals.every((prompt) => prompt.includes('∫[') && !prompt.includes('^')));
  const other = game.generateExam(ids, 'calc-b', rng);
  assert.notDeepEqual(other.questions, first.questions);
});

test('同一试卷不重复抽取同一生成题型', () => {
  const assertUniqueTypes = (ids, seed) => {
    const exam = game.generateExam(ids, seed, rng);
    const types = exam.questions.map((question) => question.templateId).filter(Boolean);
    assert.equal(new Set(types).size, types.length, ids.join(',') + ' / ' + seed);
  };
  const calculus = game.generateExam(['calc1', 'calc1', 'calc1'], 'dedupe-calculus-full', rng);
  assert.equal(calculus.questions.filter((question) => question.templateId).length, 5);
  for (const course of game.COURSES.filter((item) => item.topic)) {
    for (let index = 0; index < 5; index++) assertUniqueTypes([course.id, course.id, course.id], 'dedupe-' + course.id + '-' + index);
  }
  for (let index = 0; index < 30; index++) assertUniqueTypes(['calc1', 'calc2', 'linearAlgebra'], 'dedupe-calculus-' + index);
});

test('旧版题库试卷仍可校验，篡改答案后拒绝', () => {
  const selected = selectFirst(game.createGame({ seed: 'legacy-exam' }));
  const course = game.courseById(selected.selectedCourses[0]);
  const exam = {
    questions: coursesApi.LEGACY_QUESTIONS.general.slice(0, 5).map((question) => ({ ...question, subject: 'general', courseId: course.id, courseName: course.name, points: 20 })),
    answers: [], score: null, submitted: false
  };
  const state = { ...selected, phase: 'examPending', exam };
  assert.equal(game.validateState(state).ok, true, game.validateState(state).reason);
  const tampered = structuredClone(state);
  tampered.exam.questions[0].answer = (tampered.exam.questions[0].answer + 1) % 4;
  assert.equal(game.validateState(tampered).ok, false);
});

test('总评按平时分 40% + 考试 60% 计算，并正确记录评级', () => {
  const base = { ...selectFirst(game.createGame({ seed: 'exam-grade' })), preparation: 80 };
  const started = game.beginExam(base).state;
  const allCorrect = submitAll(started, true);
  assert.equal(allCorrect.summary.examScore, 100);
  assert.equal(allCorrect.summary.grade, 92);
  assert.equal(allCorrect.summary.rating, '优秀');
  assert.equal(allCorrect.summary.preparation, 80);
  assert.equal(allCorrect.summary.usualScore, 80);
  assert.equal(allCorrect.state.exam, null);
  assert.equal(allCorrect.state.courses.at(-1).examScore, 100);
  assert.equal(game.validateState(allCorrect.state).ok, true);
  const continued = game.continueGame(allCorrect.state);
  assert.equal(continued.state.selectedCourses.length, 0);
  assert.equal(continued.state.exam, null);

  const partial = submitAll(started, false);
  assert.equal(partial.summary.examScore, 0);
  assert.equal(partial.summary.grade, 32);
  assert.equal(partial.summary.rating, '不及格');
  assert.equal(game.ratingFor(90), '优秀');
  assert.equal(game.ratingFor(80), '良好');
  assert.equal(game.ratingFor(70), '中等');
  assert.equal(game.ratingFor(60), '及格');
  assert.equal(game.gradeFor(80, 60), 68);
});

test('考试答案必须完整且每学年都能选课、开考、结算', () => {
  let state = game.createGame({ seed: 'full-exam-run' });
  for (let term = 1; term <= 8; term++) {
    state = clearEvents(state);
    assert.equal(state.term, term);
    state = selectFirst(state);
    const started = game.beginExam(state);
    assert.equal(started.ok, true, started.reason);
    assert.equal(game.submitExam(started.state, []).ok, false);
    const submitted = submitAll(started.state, true);
    assert.equal(submitted.summary.grade, 60);
    assert.equal(submitted.summary.passed, true);
    assert.equal(game.validateState(submitted.state).ok, true);
    state = game.continueGame(submitted.state).state;
  }
  assert.equal(state.phase, 'endingChoice');
  assert.equal(state.courses.length, 8);
  assert.equal(game.chooseEnding(state, 'ordinary').ok, true);
});

test('选课、试卷和总结可保存恢复，重放结果完全一致', () => {
  const selected = selectFirst(game.createGame({ seed: 'exam-save' }));
  const examState = game.beginExam(selected).state;
  const storage = memory();
  const service = save.createSaveService(storage);
  assert.equal(service.save(examState).ok, true);
  assert.deepEqual(service.load().state, examState);
  const summaryState = submitAll(examState, true).state;
  assert.equal(service.save(summaryState).ok, true);
  assert.deepEqual(service.load().state, summaryState);
  const replay = game.replay({ nickname: summaryState.nickname, seed: summaryState.rng.seed, commands: summaryState.history.map((entry) => ({ ...entry.command, commandId: entry.commandId })) });
  assert.equal(replay.ok, true, replay.reason);
  assert.deepEqual(replay.state, summaryState);
  const continued = game.continueGame(summaryState).state;
  const replayContinued = game.replay({ nickname: continued.nickname, seed: continued.rng.seed, commands: continued.history.map((entry) => ({ ...entry.command, commandId: entry.commandId })) });
  assert.equal(replayContinued.ok, true, replayContinued.reason);
  assert.deepEqual(replayContinued.state, continued);
});

test('缺少选课与考试字段的旧存档仍按旧成绩公式结算', () => {
  const old = game.createGame({ seed: 'legacy-course' });
  delete old.selectedCourses;
  delete old.exam;
  assert.equal(game.validateState(old).ok, true);
  const legacyMajor = game.BACKGROUNDS.find((item) => item.id === old.background.id).legacyMajors[0];
  const legacyBackground = { ...old, background: { ...old.background, major: legacyMajor } };
  assert.equal(game.validateState(legacyBackground).ok, true, game.validateState(legacyBackground).reason);
  const storage = memory();
  const service = save.createSaveService(storage);
  assert.equal(service.save(old).ok, true);
  const loaded = service.load().state;
  assert.equal(loaded.selectedCourses, undefined);
  const settled = game.endTerm({ ...loaded, preparation: 50 });
  assert.equal(settled.ok, true, settled.reason);
  assert.equal(settled.summary.grade, 70);
  assert.equal(settled.summary.examScore, undefined);
  assert.equal(game.continueGame(settled.state).ok, true);
});

test('篡改选课或试卷答案会被存档校验拒绝', () => {
  const selected = selectFirst(game.createGame({ seed: 'exam-tamper' }));
  const examState = game.beginExam(selected).state;
  const changedExam = structuredClone(examState);
  changedExam.exam.questions[0].answer = (changedExam.exam.questions[0].answer + 1) % 4;
  assert.equal(game.validateState(changedExam).ok, false);
  const changedCourses = structuredClone(examState);
  const other = game.COURSES.find((course) => !changedCourses.selectedCourses.includes(course.id)).id;
  changedCourses.selectedCourses[0] = other;
  assert.equal(game.validateState(changedCourses).ok, false);
  const summary = submitAll(examState, true).state;
  const changedSummary = structuredClone(summary);
  changedSummary.courses.at(-1).examScore = 80;
  assert.equal(game.validateState(changedSummary).ok, false);
});

test('答题草稿允许跳题与改选，只更新答案及操作历史，不消耗资源或随机数', () => {
  const started = game.beginExam(selectFirst(game.createGame({ seed: 'draft-edit' }))).state;
  const before = structuredClone(started);
  const answers = [0, null, 3, null, null];
  const first = game.updateExamAnswers(started, answers);
  assert.equal(first.ok, true, first.reason);
  assert.deepEqual(started, before);
  answers[0] = 2;
  assert.deepEqual(first.state.exam.answers, [0, null, 3, null, null]);
  const edited = game.updateExamAnswers(first.state, answers);
  assert.equal(edited.ok, true, edited.reason);
  assert.deepEqual(edited.state.exam.answers, [2, null, 3, null, null]);
  assert.deepEqual(edited.state.exam.questions, started.exam.questions);
  assert.deepEqual(edited.state.rng, started.rng);
  for (const key of ['term', 'phase', 'time', 'energy', 'money', 'preparation', 'social', 'fitness', 'mood', 'courses', 'summary']) assert.deepEqual(edited.state[key], started[key], key);
  assert.equal(edited.state.revision, started.revision + 2);
  assert.equal(game.validateState(edited.state).ok, true);
});

test('答题草稿拒绝非法答案、错误阶段、重复命令、无变化和过期操作', () => {
  const initial = game.createGame();
  assert.equal(game.updateExamAnswers(initial, [0, null, null, null, null]).ok, false);
  const started = game.beginExam(selectFirst(initial)).state;
  const before = structuredClone(started);
  for (const answers of [null, [], [0], [0, null, null, null, null, null], [4, null, null, null, null], [-1, null, null, null, null], ['0', null, null, null, null], [0.5, null, null, null, null], Array(5), [NaN, null, null, null, null]]) assert.equal(game.updateExamAnswers(started, answers).ok, false);
  assert.equal(game.updateExamAnswers(started, Array(5).fill(null)).ok, false);
  assert.deepEqual(started, before);
  const first = game.updateExamAnswers(started, [0, null, null, null, null], { commandId: 'draft:1' }).state;
  assert.equal(game.updateExamAnswers(first, [0, null, null, null, null]).ok, false);
  assert.equal(game.updateExamAnswers(first, [1, null, null, null, null], { commandId: 'draft:1' }).ok, false);
  assert.equal(game.updateExamAnswers(first, [1, null, null, null, null], { expectedRevision: started.revision }).ok, false);
  const summary = submitAll(first, true).state;
  assert.equal(game.updateExamAnswers(summary, [0, null, null, null, null]).ok, false);
});

test('部分答案在三个栏位独立保存与恢复，草稿和结算均可精确重放', () => {
  const started = game.beginExam(selectFirst(game.createGame({ seed: 'draft-slots' }))).state;
  const first = game.updateExamAnswers(started, [0, null, 2, null, null]).state;
  const second = game.updateExamAnswers(first, [3, null, 2, 1, null]).state;
  const service = save.createSlotService(memory());
  for (const [slot, state] of [[1, started], [2, first], [3, second]]) {
    assert.equal(service.save(state, slot).ok, true);
    const loaded = service.load(slot);
    assert.equal(loaded.ok, true, loaded.reason);
    assert.deepEqual(loaded.state, state);
    const commands = state.history.map(entry => ({ ...entry.command, commandId: entry.commandId }));
    const replayed = game.replay({ nickname: state.nickname, seed: state.rng.seed, commands });
    assert.equal(replayed.ok, true, replayed.reason);
    assert.deepEqual(replayed.state, state);
  }
  assert.equal(service.save(second, 2).ok, true);
  assert.deepEqual(service.load(2, 'backup').state, first);
  const completed = game.updateExamAnswers(second, second.exam.questions.map(question => question.answer)).state;
  const submitted = game.submitExam(completed, completed.exam.answers);
  assert.equal(submitted.ok, true, submitted.reason);
  assert.equal(submitted.summary.examScore, 100);
  assert.equal(submitted.state.exam, null);
  assert.equal(game.submitExam(submitted.state, completed.exam.answers).ok, false);
  const commands = submitted.state.history.map(entry => ({ ...entry.command, commandId: entry.commandId }));
  assert.deepEqual(game.replay({ nickname: started.nickname, seed: started.rng.seed, commands }).state, submitted.state);
});

test('草稿未答不能交卷，进入下一学期的试卷不会沿用旧答案', () => {
  const started = game.beginExam(selectFirst(game.createGame({ seed: 'draft-next' }))).state;
  const partial = game.updateExamAnswers(started, [0, null, null, null, null]).state;
  const rejected = game.submitExam(partial, partial.exam.answers);
  assert.equal(rejected.ok, false);
  assert.deepEqual(rejected.state, partial);
  const settled = submitAll(partial, true).state;
  const next = game.beginExam(selectFirst(clearEvents(game.continueGame(settled).state))).state;
  assert.deepEqual(next.exam.answers, []);
  assert.equal(game.validateState(next).ok, true);
});

test('旧版空草稿及题库试卷仍可读取、记录答案和保存', () => {
  const selected = selectFirst(game.createGame({ seed: 'legacy-exam-draft' }));
  const course = game.courseById(selected.selectedCourses[0]);
  const legacy = { ...selected, phase: 'examPending', exam: {
    questions: coursesApi.LEGACY_QUESTIONS.general.slice(0, 5).map(question => ({ ...question, subject: 'general', courseId: course.id, courseName: course.name, points: 20 })),
    answers: [], score: null, submitted: false
  } };
  const service = save.createSaveService(memory());
  for (const initial of [game.beginExam(selected).state, legacy]) {
    assert.equal(service.save(initial).ok, true);
    const loaded = service.load().state;
    assert.deepEqual(loaded.exam.answers, []);
    const updated = game.updateExamAnswers(loaded, [null, 0, null, null, 3]);
    assert.equal(updated.ok, true, updated.reason);
    assert.equal(game.validateState(updated.state).ok, true);
    assert.equal(service.save(updated.state).ok, true);
    assert.deepEqual(service.load().state.exam.answers, [null, 0, null, null, 3]);
  }
});

test('损坏的草稿结构、草稿历史和与重放不符的答案都被拒绝', () => {
  const started = game.beginExam(selectFirst(game.createGame({ seed: 'draft-invalid' }))).state;
  const valid = game.updateExamAnswers(started, [0, null, 2, null, null]).state;
  for (const change of [
    state => { state.exam.answers = [0]; },
    state => { state.exam.answers[0] = 4; },
    state => { state.exam.answers[0] = false; },
    state => { state.exam.answers[0] = undefined; },
    state => { state.exam.answers[0] = 1; },
    state => { state.history.at(-1).command.id[1] = 9; }
  ]) {
    const state = structuredClone(valid); change(state);
    assert.equal(game.validateState(state).ok, false);
    assert.equal(save.createSaveService(memory()).save(state).ok, false);
  }
});
