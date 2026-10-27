(function (root) {
  'use strict';
  const config = typeof module !== 'undefined' && module.exports ? require('./config.js') : root.CampusConfig;
  const random = typeof module !== 'undefined' && module.exports ? require('./rng.js') : root.CampusRandom;
  const courses = typeof module !== 'undefined' && module.exports ? require('./courses.js') : root.CampusCourses;
  const { RULES, TERM_NAMES, BACKGROUNDS, PLACES, ACTIONS, EVENTS, ENDINGS, RANDOM_POOL, CAMPUS_SCHEDULE, RANDOM_CONTEXTS, AI_CHAT } = config;
  const { COURSES, SUBJECTS, courseById, coursesForTerm, generateExam, ratingFor, gradeFor } = courses;
  const CHAIN_NAMES = { project: '项目', club: '社团', internship: '实习' };
  const own = (object, key) => typeof key === 'string' && Object.hasOwn(object, key);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const clamp = (value, max) => Math.max(0, Math.min(max, value));
  const selectedCoursesOf = (state) => Array.isArray(state.selectedCourses) ? state.selectedCourses : [];
  function validateNickname(value) {
    // 按主流游戏昵称规则：2～12 个字符，只能使用汉字、字母、数字与 · - _，不能全是数字或符号。
    if (typeof value !== 'string' || !value.trim()) return { ok: false, reason: '先填一个昵称吧' };
    const name = value.trim();
    if ([...name].length < 2 || [...name].length > 12) return { ok: false, reason: '昵称需要 2～12 个字符' };
    if (/[\u0000-\u001f\u007f]/.test(name)) return { ok: false, reason: '昵称不能包含控制字符' };
    if (!/^[\p{L}\p{M}\p{Nd}·\-_ ]+$/u.test(name)) return { ok: false, reason: '昵称只能使用汉字、字母、数字和 · - _' };
    if (/^[\p{Nd}]+$/u.test(name)) return { ok: false, reason: '昵称不能全是数字' };
    if (/^[\p{P}\p{S} ]+$/u.test(name)) return { ok: false, reason: '昵称不能全是符号' };
    return { ok: true, value: name };
  }
  function createGame(options = {}) {
    const nickname = validateNickname(options.nickname === undefined ? '北交同学' : options.nickname);
    if (!nickname.ok) throw new Error(nickname.reason);
    const seed = String(options.seed === undefined ? 'campus-default' : options.seed);
    if (!seed.length || seed.length > 64) throw new Error('测试种子长度应为 1～64 个字符');
    const first = random.draw(random.create(seed));
    const background = BACKGROUNDS[Math.floor(first.number * BACKGROUNDS.length)];
    const second = random.draw(first.rng);
    const chains = {};
    for (const id of Object.keys(CHAIN_NAMES)) chains[id] = { status: 'idle', progress: 0, startedTerm: 0, deadline: 0, nextEligibleTerm: 1, reviewAfter: 0 };
    return {
      version: RULES.version, rulesVersion: RULES.version, saveFormatVersion: RULES.saveFormatVersion, appVersion: RULES.appVersion,
      nickname: nickname.value, background: { id: background.id, college: background.college, major: background.majors[Math.floor(second.number * background.majors.length)] }, rng: second.rng,
      term: 1, phase: 'playing', revision: 0, processedCommands: [], time: RULES.time, energy: RULES.energy, money: RULES.initialMoney,
      social: RULES.initialSocial, fitness: RULES.initialFitness, mood: RULES.initialMood, preparation: 0, furtherStudy: 0, jobPreparation: 0,
      counts: {}, courses: [], selectedCourses: [], exam: null, history: [], summary: null, pendingEvent: null, eventQueue: [], eventFlags: {}, eventHistory: [], experiences: [], chains, endingOptions: null, result: null
    };
  }
  function getAction(state, id) {
    if (!own(ACTIONS, id)) return null;
    const action = { ...ACTIONS[id] };
    const background = BACKGROUNDS.find((item) => item.id === state.background.id);
    if (background && background.action === id) {
      action.energy = Math.max(0, action.energy - (background.energyDiscount || 0));
      action.preparation = (action.preparation || 0) + (background.preparationBonus || 0);
      action.social = (action.social || 0) + (background.socialBonus || 0);
      action.backgroundBonus = background.bonus;
    }
    return action;
  }
  function averageGrade(state) { return state.courses.length ? state.courses.reduce((sum, item) => sum + item.grade, 0) / state.courses.length : 0; }
  function previewChanges(state, effect) {
    return {
      time: effect.time ? -effect.time : 0, energy: clamp(state.energy - (effect.energy || 0) + (effect.recovery || 0), 100) - state.energy,
      money: (effect.income || 0) - (effect.money || 0), preparation: clamp(state.preparation + (effect.preparation || 0), 100) - state.preparation,
      social: clamp(state.social + (effect.social || 0), 100) - state.social, fitness: clamp(state.fitness + (effect.fitness || 0), 100) - state.fitness,
      mood: clamp(state.mood + (effect.mood || 0), 100) - state.mood,
      furtherStudy: clamp(state.furtherStudy + (effect.furtherStudy || 0), 100) - state.furtherStudy,
      jobPreparation: clamp(state.jobPreparation + (effect.jobPreparation || 0), 100) - state.jobPreparation
    };
  }
  function resourceCheck(state, effect) {
    for (const [key, label] of [['time', '时间'], ['energy', '精力'], ['money', '钱包']]) {
      if (state[key] < (effect[key] || 0)) return { ok: false, reason: label + '不够：需要 ' + effect[key] + '，现在剩 ' + state[key] };
    }
    if (effect.minFitness && state.fitness < effect.minFitness) return { ok: false, reason: '体能需要达到 ' + effect.minFitness };
    return { ok: true, reason: '' };
  }
  function availability(state, id) {
    if (!own(ACTIONS, id)) return { ok: false, reason: '未知行动' };
    if (state.phase === 'eventPending') return { ok: false, reason: '请先处理当前事件' };
    if (state.phase !== 'playing') return { ok: false, reason: '现在这个阶段还不能行动' };
    const action = getAction(state, id);
    if (action.minTerm && state.term < action.minTerm) return { ok: false, reason: '第 ' + action.minTerm + ' 学期开始开放' };
    if (action.maxTerm && state.term > action.maxTerm) return { ok: false, reason: '这一轮的申请时间已经过了' };
    if (action.autumnOnly && state.term % 2 === 0) return { ok: false, reason: '社团招新在秋季学期开放' };
    if (action.limit && (state.counts[id] || 0) >= action.limit) return { ok: false, reason: '这学期已经安排满这么多次了' };
    if (action.minPreparation && state.preparation < action.minPreparation) return { ok: false, reason: '本学期学习进度需要达到 ' + action.minPreparation };
    if (action.minAverage && averageGrade(state) < action.minAverage) return { ok: false, reason: '已结算平均成绩需要达到 ' + action.minAverage };
    if (action.chain) {
      const chain = state.chains[action.chain];
      if (action.kind === 'apply' && !['idle', 'deferred'].includes(chain.status)) return { ok: false, reason: chain.status === 'completed' ? '这条事件链已完成' : '当前不能再次申请' };
      if (action.kind === 'apply' && state.term < chain.nextEligibleTerm) return { ok: false, reason: '第 ' + chain.nextEligibleTerm + ' 学期可再次申请' };
      if (action.kind === 'work' && chain.status !== 'active') return { ok: false, reason: '请先申请并接受邀请' };
      if (action.kind === 'work' && chain.progress >= 2) return { ok: false, reason: '两次投入都完成了，等成果确认' };
    }
    if (action.preparation && !action.chain && state.preparation >= 100) return { ok: false, reason: '本学期学习进度已满' };
    const check = resourceCheck(state, action);
    if (!check.ok) return check;
    if (!action.chain && !Object.values(previewChanges(state, action)).some((value) => value > 0)) return { ok: false, reason: '这项行动的收益已经到头了' };
    return { ok: true, reason: '' };
  }
  function applyChanges(state, changes) {
    const next = { ...state };
    for (const [key, value] of Object.entries(changes)) next[key] += value;
    return next;
  }
  function instanceFor(state, id) { return { id, term: state.term, instanceId: (EVENTS[id].chain || 'daily') + ':' + id + ':' + state.term }; }
  function getTermStage(state) {
    const elapsed = RULES.time - state.time;
    return elapsed <= 4 ? '学期初' : elapsed < 9 ? '学期中' : '学期末';
  }
  function attachEvents(state, triggerAction) {
    if (!['playing', 'eventPending'].includes(state.phase)) return state;
    // Old saves can contain several optional campus events queued by one action.
    // Keep the visible event and required chain/condition events; reschedule the
    // not-yet-shown optional events on a later action in their valid time window.
    let next = { ...state, eventQueue: state.eventQueue.filter(item => !own(CAMPUS_SCHEDULE, item.id) && !RANDOM_POOL.includes(item.id)) };
    const enqueue = (id) => {
      const instance = instanceFor(next, id);
      if (!next.eventFlags[instance.instanceId] && next.pendingEvent?.instanceId !== instance.instanceId && !next.eventQueue.some((item) => item.instanceId === instance.instanceId)) next.eventQueue.push(instance);
    };
    const did = (event, choice, termsAgo) => next.eventHistory.some((entry) => entry.event === event && (choice === undefined || entry.choice === choice) && (termsAgo === undefined || entry.term === next.term - termsAgo));
    const isAction = own(ACTIONS, triggerAction);
    const termActions = next.history.filter((entry) => entry.command.operation === 'executeAction' && entry.term === next.term).length + (isAction ? 1 : 0);
    const elapsed = RULES.time - next.time;
    const season = next.term % 2 === 1 ? 'autumn' : 'spring';
    const inWindow = rule => (!rule.terms || rule.terms.includes(next.term)) && (!rule.season || rule.season === season)
      && elapsed >= (rule.minElapsed || 0) && elapsed <= (rule.maxElapsed ?? RULES.time);
    const actionsAfter = eventId => {
      let count = isAction ? 1 : 0;
      for (let index = next.history.length - 1; index >= 0; index--) {
        const entry = next.history[index];
        if (entry.term !== next.term) continue;
        if (entry.command.operation === 'submitEventChoice' && entry.event === eventId) return count;
        if (entry.command.operation === 'executeAction') count++;
      }
      return 0;
    };
    if (next.mood < RULES.lowMood) enqueue('roommateCare');
    for (const [id, chain] of Object.entries(next.chains)) {
      if (triggerAction === 'apply' + id[0].toUpperCase() + id.slice(1)) enqueue(id + 'Offer');
      if (chain.status === 'active' && chain.progress === 2 && next.term >= chain.reviewAfter && (id === 'internship' || id === 'club' || next.term > chain.startedTerm)) enqueue(id + 'Review');
    }
    if (next.term >= 2 && next.courses.length && next.courses.at(-1).term === next.term - 1 && !next.courses.at(-1).passed) enqueue('retake');
    // Choosing an event option never starts another optional campus event.
    // Required low-mood/fitness and player-requested project/club/internship
    // events retain their existing queue and priority behaviour.
    if ((isAction || triggerAction === 'newTerm') && !next.pendingEvent && !next.eventQueue.length) {
      const eligible = Object.keys(CAMPUS_SCHEDULE).filter(id => {
        const rule = CAMPUS_SCHEDULE[id];
        return inWindow(rule) && (isAction || id === 'ticket2') && (!rule.actions || rule.actions.includes(triggerAction)) && termActions >= (rule.minActions || 0)
          && !did(id, undefined, 0) && (!rule.unless || !did(rule.unless)) && (!rule.flag || next.eventFlags[rule.flag])
          && (!rule.after || did(...rule.after)) && (!rule.actionGap || actionsAfter(rule.after[0]) >= rule.actionGap);
      }).sort((a, b) => EVENTS[a].priority - EVENTS[b].priority);
      if (eligible.length) enqueue(eligible[0]);
    }
    const rollKey = 'randomCampusRoll:' + next.term;
    const pool = isAction ? RANDOM_POOL.filter(id => RANDOM_CONTEXTS[id].actions.includes(triggerAction) && inWindow(RANDOM_CONTEXTS[id])) : [];
    if (pool.length && !next.pendingEvent && !next.eventQueue.length && !next.eventFlags[rollKey]) {
      const rolled = random.draw(next.rng);
      next = { ...next, rng: rolled.rng, eventFlags: { ...next.eventFlags, [rollKey]: true } };
      if (rolled.number < 0.35) {
        enqueue(pool[Math.min(pool.length - 1, Math.floor((rolled.number / 0.35) * pool.length))]);
      }
    }
    next.eventQueue.sort((a, b) => EVENTS[a.id].priority - EVENTS[b.id].priority || a.instanceId.localeCompare(b.instanceId));
    if (!next.pendingEvent && next.eventQueue.length) next = { ...next, pendingEvent: next.eventQueue[0], eventQueue: next.eventQueue.slice(1) };
    next.phase = next.pendingEvent ? 'eventPending' : 'playing';
    return next;
  }
  function commandCheck(state, options, operation) {
    const commandId = options.commandId === undefined ? 'rule:' + (state.revision + 1) + ':' + operation : options.commandId;
    if (typeof commandId !== 'string' || !commandId.length || commandId.length > 128) return { ok: false, reason: '无效的操作编号', state };
    if (state.processedCommands.includes(commandId)) return { ok: false, reason: '这次操作已经提交', state };
    if (options.expectedRevision !== undefined && options.expectedRevision !== state.revision) return { ok: false, reason: '状态已更新，请刷新当前操作面板', state };
    return { ok: true, commandId };
  }
  function stateBrief(state) { return { term: state.term, phase: state.phase, time: state.time, energy: state.energy, money: state.money, preparation: state.preparation, pendingEvent: state.pendingEvent?.instanceId || null, rngCalls: state.rng.calls }; }
  function commit(state, next, command, entry, commandId) {
    const revision = state.revision + 1;
    const log = { ...entry, term: state.term, revision, commandId, command, before: stateBrief(state), after: stateBrief(next) };
    return { ok: true, state: { ...next, revision, processedCommands: [...state.processedCommands, commandId], history: [...state.history, log] }, changes: entry.changes, summary: next.summary, entry: log };
  }
  function executeAction(state, id, options = {}) {
    const command = commandCheck(state, options, 'action:' + id);
    if (!command.ok) return command;
    const check = availability(state, id);
    if (!check.ok) return { ...check, state };
    const action = getAction(state, id);
    const changes = previewChanges(state, action);
    let next = { ...applyChanges(state, changes), counts: { ...state.counts, [id]: (state.counts[id] || 0) + 1 } };
    if (action.kind === 'work') next.chains = { ...state.chains, [action.chain]: { ...state.chains[action.chain], progress: state.chains[action.chain].progress + 1 } };
    next = attachEvents(next, id);
    return commit(state, next, { operation: 'executeAction', id }, { action: id, title: action.title, changes }, command.commandId);
  }
  function eventAvailability(state, choiceId, instanceId) {
    if (state.phase !== 'eventPending' || !state.pendingEvent) return { ok: false, reason: '当前没有待处理事件' };
    if (instanceId !== undefined && instanceId !== state.pendingEvent.instanceId) return { ok: false, reason: '事件已更新，请重新选择' };
    const event = EVENTS[state.pendingEvent.id];
    const choice = event && event.choices.find((item) => item.id === choiceId);
    if (!choice) return { ok: false, reason: '未知事件选项' };
    if (choice.chainEffect === 'postpone' && state.term === 8) return { ok: false, reason: '最后一个学期了，把经历确认了吧' };
    return resourceCheck(state, choice);
  }
  function resolveOutcome(state, choice) {
    if (!choice.outcomeBy) return null;
    const metric = choice.outcomeBy.metric === 'average' ? averageGrade(state) : state[choice.outcomeBy.metric];
    return metric >= choice.outcomeBy.threshold ? choice.outcomeBy.pass : choice.outcomeBy.fail;
  }
  function submitEventChoice(state, choiceId, options = {}) {
    const command = commandCheck(state, options, 'event:' + choiceId);
    if (!command.ok) return command;
    const check = eventAvailability(state, choiceId, options.eventInstanceId);
    if (!check.ok) return { ...check, state };
    const pending = state.pendingEvent;
    const event = EVENTS[pending.id];
    const choice = event.choices.find((item) => item.id === choiceId);
    // 条件结果（outcomeBy）在提交时按当前数值判定，效果叠加在选项效果之上。
    const outcome = resolveOutcome(state, choice) || {};
    // 结果效果与选项效果叠加：数值类相加，标题、经历、标记等以结果为准。
    const effect = { ...choice, ...outcome };
    for (const key of ['time', 'energy', 'recovery', 'money', 'income', 'preparation', 'social', 'fitness', 'mood', 'furtherStudy', 'jobPreparation']) {
      effect[key] = (choice[key] || 0) + (outcome[key] || 0);
    }
    const changes = previewChanges(state, effect);
    const entry = { term: state.term, event: pending.id, instanceId: pending.instanceId, choice: choiceId, title: choice.title, outcome: outcome.title || null, changes };
    let next = { ...applyChanges(state, changes), pendingEvent: null, phase: 'playing', eventFlags: { ...state.eventFlags, [pending.instanceId]: true }, eventHistory: [...state.eventHistory, entry] };
    if (event.chain) {
      const chain = { ...state.chains[event.chain] };
      if (choice.chainEffect === 'accept') Object.assign(chain, { status: 'active', startedTerm: state.term, deadline: Math.min(8, state.term + 1), progress: 0, reviewAfter: state.term });
      if (choice.chainEffect === 'defer') Object.assign(chain, { status: 'deferred', nextEligibleTerm: state.term + 1 });
      if (choice.chainEffect === 'postpone') Object.assign(chain, { reviewAfter: state.term + 1, deadline: Math.min(8, state.term + 1) });
      if (choice.chainEffect === 'complete') chain.status = 'completed';
      if (choice.chainEffect === 'abandon') chain.status = 'missed';
      next.chains = { ...state.chains, [event.chain]: chain };
    }
    const experience = outcome.experience || choice.experience;
    if (experience) next.experiences = [...state.experiences, { term: state.term, type: experience, ...(experience === 'fitnessTest' ? { fitness: state.fitness } : {}) }];
    const flag = outcome.flag || choice.flag;
    const clearFlag = outcome.clearFlag || choice.clearFlag;
    if (flag || clearFlag) {
      const flags = { ...next.eventFlags };
      if (clearFlag) delete flags[clearFlag];
      if (flag) flags[flag] = true;
      next = { ...next, eventFlags: flags };
    }
    if (outcome.changeBackground) {
      // 转专业成功：换到另一个学院方向，随机抽取专业；学院加成随新背景生效。
      const candidates = BACKGROUNDS.filter((item) => item.id !== state.background.id);
      const pickRoll = random.draw(next.rng);
      const picked = candidates[Math.min(candidates.length - 1, Math.floor(pickRoll.number * candidates.length))];
      const majorRoll = random.draw(pickRoll.rng);
      next = { ...next, rng: majorRoll.rng, background: { id: picked.id, college: picked.college, major: picked.majors[Math.min(picked.majors.length - 1, Math.floor(majorRoll.number * picked.majors.length))] } };
    }
    next = attachEvents(next, 'eventChoice');
    return commit(state, next, { operation: 'submitEventChoice', id: choiceId, eventInstanceId: pending.instanceId }, entry, command.commandId);
  }
  function settlementChains(state) {
    const chains = clone(state.chains);
    const notices = [];
    for (const [id, chain] of Object.entries(chains)) {
      if (chain.status === 'active' && state.term >= chain.deadline) {
        if (state.term === 8) { chain.status = 'missed'; notices.push(CHAIN_NAMES[id] + '未完成，已有的 ' + chain.progress + '/2 次投入保留在档案里。'); }
        else { chain.deadline = state.term + 1; notices.push(CHAIN_NAMES[id] + '延期到第 ' + chain.deadline + ' 学期，已有的 ' + chain.progress + '/2 次投入保留。'); }
      }
    }
    return { chains, notices };
  }
  function previewSettlement(state, examScore = null) {
    const usualScore = state.preparation;
    const graded = selectedCoursesOf(state).length > 0;
    const score = graded ? (examScore === null ? (state.exam?.score ?? 0) : examScore) : null;
    const grade = graded ? gradeFor(usualScore, score) : Math.round(40 + state.preparation * 0.6);
    const aid = Math.max(0, RULES.livingCost - state.money);
    const summary = { term: state.term, name: TERM_NAMES[state.term - 1], preparation: state.preparation, grade, passed: grade >= 60, livingCost: RULES.livingCost, aid, moneyAfter: state.money + aid - 300, unusedTime: state.time, counts: { ...state.counts }, attributes: { social: state.social, fitness: state.fitness, mood: state.mood }, notices: settlementChains(state).notices };
    if (graded) Object.assign(summary, { usualScore, examScore: score, rating: ratingFor(grade), courseIds: [...selectedCoursesOf(state)], courseNames: selectedCoursesOf(state).map((id) => courseById(id)?.name || id) });
    return summary;
  }
  function endTerm(state, options = {}) {
    const command = commandCheck(state, options, 'endTerm');
    if (!command.ok) return command;
    if (state.phase === 'eventPending') return { ok: false, reason: '请先处理当前事件', state };
    if (state.phase !== 'playing') return { ok: false, reason: '本学期已经结算或流程已经结束', state };
    if (selectedCoursesOf(state).length) return { ok: false, reason: '请先参加本学期期末考试', state };
    const summary = previewSettlement(state);
    const next = { ...state, phase: 'summary', money: summary.moneyAfter, chains: settlementChains(state).chains, courses: [...state.courses, summary], summary };
    return commit(state, next, { operation: 'endTerm' }, { action: 'endTerm', title: '学期结算' }, command.commandId);
  }
  function selectCourses(state, ids, options = {}) {
    const command = commandCheck(state, options, 'selectCourses');
    if (!command.ok) return command;
    if (state.phase !== 'playing') return { ok: false, reason: '现在不能选课', state };
    if (selectedCoursesOf(state).length) return { ok: false, reason: '本学期已经完成选课', state };
    if (!Array.isArray(ids) || ids.length !== 3) return { ok: false, reason: '每学期需要选择 3 门课程', state };
    if (new Set(ids).size !== ids.length) return { ok: false, reason: '不能重复选择同一门课程', state };
    const available = new Set(coursesForTerm(state.term, state.background.id).map((course) => course.id));
    if (!ids.every((id) => available.has(id))) return { ok: false, reason: '课程不在本学期可选范围', state };
    const next = { ...state, selectedCourses: [...ids] };
    return commit(state, next, { operation: 'selectCourses', id: [...ids] }, { action: 'selectCourses', title: '完成选课' }, command.commandId);
  }
  function beginExam(state, options = {}) {
    const command = commandCheck(state, options, 'beginExam');
    if (!command.ok) return command;
    if (state.phase !== 'playing') return { ok: false, reason: '现在不能开始考试', state };
    if (state.pendingEvent) return { ok: false, reason: '请先处理当前事件', state };
    if (!selectedCoursesOf(state).length) return { ok: false, reason: '请先完成本学期选课', state };
    let exam;
    try { exam = generateExam(selectedCoursesOf(state), state.rng.seed + ':exam:' + state.term + ':' + selectedCoursesOf(state).join(','), random); }
    catch (error) { return { ok: false, reason: error.message, state }; }
    return commit(state, { ...state, phase: 'examPending', exam }, { operation: 'beginExam' }, { action: 'beginExam', title: '开始期末考试' }, command.commandId);
  }
  function submitExam(state, answers, options = {}) {
    const command = commandCheck(state, options, 'submitExam');
    if (!command.ok) return command;
    if (state.phase !== 'examPending' || !state.exam) return { ok: false, reason: '当前没有待提交的试卷', state };
    if (!Array.isArray(answers) || answers.length !== state.exam.questions.length || !answers.every((answer) => Number.isSafeInteger(answer) && answer >= 0 && answer < 4)) return { ok: false, reason: '请为每道题选择答案', state };
    const correct = state.exam.questions.reduce((count, question, index) => count + (answers[index] === question.answer ? 1 : 0), 0);
    const examScore = correct * 20;
    const summary = previewSettlement(state, examScore);
    const next = { ...state, phase: 'summary', money: summary.moneyAfter, chains: settlementChains(state).chains, courses: [...state.courses, summary], summary, exam: null };
    return commit(state, next, { operation: 'submitExam', id: [...answers] }, { action: 'submitExam', title: '提交期末试卷', examScore, correct }, command.commandId);
  }
  function evaluateEndings(state) {
    const average = averageGrade(state);
    const passed = state.courses.filter((item) => item.passed).length;
    const base = [
      { label: '平均成绩至少 ' + ENDINGS.graduationAverage, met: average >= ENDINGS.graduationAverage, value: average },
      { label: '至少 ' + ENDINGS.passedTerms + ' 个学期达标', met: passed >= ENDINGS.passedTerms, value: passed }
    ];
    const graduated = state.courses.length === 8 && base.every((item) => item.met);
    const make = (id, title, requirements) => ({ id, title, available: graduated && requirements.every((item) => item.met), requirements: [...base, ...requirements] });
    const options = [
      make('ordinary', '普通毕业', []),
      make('furtherStudy', '继续深造', [
        { label: '平均成绩至少 ' + ENDINGS.furtherStudyAverage, met: average >= ENDINGS.furtherStudyAverage, value: average },
        { label: '完成校园项目', met: state.chains.project.status === 'completed', value: state.chains.project.status },
        { label: '深造准备至少 ' + ENDINGS.furtherStudyPreparation, met: state.furtherStudy >= ENDINGS.furtherStudyPreparation, value: state.furtherStudy }
      ]),
      make('employment', '进入就业', [
        { label: '完成实习经历', met: state.chains.internship.status === 'completed', value: state.chains.internship.status },
        { label: '求职准备至少 ' + ENDINGS.jobPreparation, met: state.jobPreparation >= ENDINGS.jobPreparation, value: state.jobPreparation }
      ])
    ];
    if (!graduated) options.push({ id: 'notQualified', title: '暂未达到毕业条件', available: state.courses.length === 8, requirements: base });
    return { average, passed, graduated, options };
  }
  function continueGame(state, options = {}) {
    const command = commandCheck(state, options, 'continueGame');
    if (!command.ok) return command;
    if (state.phase !== 'summary') return { ok: false, reason: '当前没有待确认的学期总结', state };
    const next = state.term === 8
      ? { ...state, phase: 'endingChoice', endingOptions: evaluateEndings(state), selectedCourses: [], exam: null }
      : attachEvents({ ...state, term: state.term + 1, phase: 'playing', time: 12, energy: 80, preparation: 0, counts: {}, summary: null, selectedCourses: [], exam: null }, 'newTerm');
    return commit(state, next, { operation: 'continueGame' }, { action: 'continueGame', title: state.term === 8 ? '评估毕业方向' : '进入下一学期' }, command.commandId);
  }
  function chooseEnding(state, id, options = {}) {
    const command = commandCheck(state, options, 'chooseEnding:' + id);
    if (!command.ok) return command;
    if (state.phase !== 'endingChoice') return { ok: false, reason: '当前不能选择毕业方向', state };
    const ending = state.endingOptions.options.find((item) => item.id === id && item.available);
    if (!ending) return { ok: false, reason: '这个方向的条件还差一点', state };
    const result = { direction: ending.id, title: ending.title, requirements: clone(ending.requirements), average: state.endingOptions.average, passed: state.endingOptions.passed, experiences: clone(state.experiences), courses: clone(state.courses) };
    return commit(state, { ...state, phase: 'finished', result }, { operation: 'chooseEnding', id }, { action: 'chooseEnding', title: ending.title }, command.commandId);
  }
  function validateState(state) {
    const validator = typeof module !== 'undefined' && module.exports ? require('./state-validation.js') : root.CampusStateValidation;
    return validator.validate(state, api, random);
  }
  function replay({ nickname, seed, commands }) {
    let state = createGame({ nickname, seed });
    for (const [index, command] of commands.entries()) {
      const args = { commandId: command.commandId || 'replay:' + index, expectedRevision: state.revision, eventInstanceId: command.eventInstanceId };
      const handlers = { executeAction: () => executeAction(state, command.id, args), submitEventChoice: () => submitEventChoice(state, command.id, args), selectCourses: () => selectCourses(state, command.id, args), beginExam: () => beginExam(state, args), submitExam: () => submitExam(state, command.id, args), endTerm: () => endTerm(state, args), continueGame: () => continueGame(state, args), chooseEnding: () => chooseEnding(state, command.id, args) };
      if (!own(handlers, command.operation)) return { ok: false, reason: '第 ' + (index + 1) + ' 步操作未知', state };
      const result = handlers[command.operation]();
      if (!result.ok) return { ...result, reason: '第 ' + (index + 1) + ' 步：' + result.reason };
      state = result.state;
    }
    return { ok: true, state };
  }
  const api = { RULES, TERM_NAMES, BACKGROUNDS, PLACES, ACTIONS, EVENTS, ENDINGS, CHAIN_NAMES, AI_CHAT, COURSES, SUBJECTS, courseById, coursesForTerm, generateExam, ratingFor, gradeFor, createGame, validateNickname, getAction, averageGrade, availability, previewChanges, executeAction, eventAvailability, submitEventChoice, previewSettlement, selectCourses, beginExam, submitExam, endTerm, continueGame, evaluateEndings, chooseEnding, validateState, stateBrief, replay, getTermStage };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CampusGame = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
