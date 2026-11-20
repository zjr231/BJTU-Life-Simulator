(function (root) {
  'use strict';
  const game = typeof module !== 'undefined' && module.exports ? require('./game.js') : root.CampusGame;
  const config = typeof module !== 'undefined' && module.exports ? require('./config.js') : root.CampusConfig;
  const FIELDS = { money: ['金钱', 1000000], time: ['时间', 12], energy: ['精力', 100], fitness: ['体能', 100], mood: ['心情', 100], preparation: ['学习进度', 100], social: ['社交', 100], furtherStudy: ['深造准备', 100], jobPreparation: ['求职准备', 100] };
  const ENDINGS = { ordinary: '普通毕业', furtherStudy: '继续深造', employment: '进入就业', blankResume: '三无毕业生', notQualified: '暂未达到毕业条件', delayed: '延毕练习生', cheatNote: '考试作弊', cardThief: '校园卡风波' };
  const PREFIX = 'bjtu-life:developer:v1:';
  const ECONOMY_ACTIONS = ['scholarship', 'contestPrize', 'researchAssistant', 'creativeIncome', 'dinnerTreat', 'jobTrip', 'graduationTrip'].filter(id => Object.hasOwn(game.ACTIONS, id));
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const own = (value, key) => Object.hasOwn(value, key);
  const fail = reason => ({ ok: false, reason });
  const success = state => ({ ok: true, state });
  const validField = (key, value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= FIELDS[key][1] && (!['money','time','energy'].includes(key) || Number.isSafeInteger(value));
  function changed(state) { const next = clone(state); next.revision++; return next; }
  function applyFields(state, values) {
    for (const [key, value] of Object.entries(values)) {
      if (!own(FIELDS, key) || !validField(key, value)) return fail('属性值无效：' + key);
    }
    return success(Object.assign(changed(state), values));
  }
  // Synthetic scenes and overrides stay in developer storage; normal replay validation is unchanged.
  function playing(state) {
    const next = clone(state);
    Object.assign(next, { phase: 'playing', pendingEvent: null, eventQueue: [], exam: null, summary: null, result: null, endingOptions: null });
    if (next.eventHistory.some(e => e.term === next.term && e.event === 'military1' && ['join', 'tug', 'choir'].includes(e.choice)) && !next.eventHistory.some(e => e.term === next.term && e.event === 'military2')) {
      next.eventHistory.push({ event: 'military2', choice: 'developerSkip', term: next.term });
    }
    if (next.relationships) next.relationships.eventCompanion = null;
    return next;
  }
  function ready(state) {
    let next = state;
    if (game.currentGrant(next) && !game.currentGrant(next).budgetChosen) {
      const budget = game.chooseBudget(next, game.DEFAULT_BUDGET);
      if (!budget.ok) throw new Error(budget.reason);
      next = budget.state;
    }
    if (!next.selectedCourses.length) {
      const courses = game.selectCourses(next, game.coursesForTerm(next.term, next.background.id, next.background.major).slice(0, 3).map(c => c.id));
      if (!courses.ok) throw new Error(courses.reason);
      next = courses.state;
    }
    return next;
  }
  function exam(state, summary = false) {
    if (summary && state.phase === 'summary') return success(clone(state));
    let next = state.phase === 'examPending' ? clone(state) : ready(playing(state));
    if (next.phase !== 'examPending') next.courses = next.courses.filter(course => course.term < next.term);
    if (next.phase !== 'examPending') {
      const result = game.beginExam(next);
      if (!result.ok) return result;
      next = result.state;
    }
    return summary ? game.submitExam(next, next.exam.questions.map(q => q.answer)) : success(next);
  }
  function semester(state, term) {
    if (!Number.isInteger(term) || term < 1 || term > 8) return fail('请选择第 1～8 学期');
    let next = game.createGame({ nickname: state?.nickname || '测试同学', seed: state?.rng.seed || 'developer-scene' });
    if (state?.background) next.background = clone(state.background);
    for (let i = 1; i < term; i++) {
      next.preparation = 80;
      const settled = exam(next, true);
      if (!settled.ok) return settled;
      next = game.continueGame(settled.state).state;
    }
    next = ready(playing(next));
    next.revision = Math.max(next.revision, (state?.revision || 0) + 1);
    return success(next);
  }
  function budgetScene(state, selection) {
    if (!game.budgetPlan(selection)) return fail('预算档位无效');
    const scene = semester(state, state.term);
    if (!scene.ok) return scene;
    let next = scene.state;
    const grant = game.currentGrant(next), defaultGrant = game.currentGrant(next);
    const setupBudget = next.history.findLast(entry => entry.term === next.term && entry.command.operation === 'chooseBudget');
    const setupCourses = next.history.findLast(entry => entry.term === next.term && entry.command.operation === 'selectCourses');
    if (setupBudget) {
      for (const [key, amount] of Object.entries(setupBudget.changes || {})) if (key !== 'money') next[key] -= amount;
      next.history = next.history.filter(entry => entry !== setupBudget);
      next.processedCommands = next.processedCommands.filter(id => id !== setupBudget.commandId);
    }
    if (setupCourses) {
      next.history = next.history.filter(entry => entry !== setupCourses);
      next.processedCommands = next.processedCommands.filter(id => id !== setupCourses.commandId);
    }
    next.money = defaultGrant.moneyAfter;
    next.selectedCourses = [];
    grant.budgetChosen = false;
    const chosen = game.chooseBudget(next, selection);
    if (!chosen.ok) return chosen;
    next = ready(chosen.state);
    return success(next);
  }
  function prepareEconomyAction(state, id) {
    if (!ECONOMY_ACTIONS.includes(id)) return fail('请选择收入或消费测试场景');
    const action = game.ACTIONS[id];
    const prerequisiteTerm = action.minAverage || action.requiresExperience ? 2 : 1;
    const scene = semester(state, Math.max(state.term, action.minTerm || 1, prerequisiteTerm));
    if (!scene.ok) return scene;
    const next = scene.state;
    Object.assign(next, { money: Math.max(next.money, action.money || 0), time: game.RULES.time, energy: game.RULES.maxEnergy, fitness: 60, mood: 50, social: 50, jobPreparation: 0, furtherStudy: 0, preparation: Math.max(60, action.minPreparation || 0) });
    if (action.minAverage) for (const course of next.courses) { course.grade = Math.max(course.grade, action.minAverage); course.passed = true; }
    if (action.requiresExperience) next.experiences.push({ type: action.requiresExperience, term: next.term });
    return success(next);
  }
  function animalScene(state, species) {
    if (!own(game.ANIMALS, species)) return fail('未知校园动物');
    const next = changed(ready(playing(state)));
    const allowed = game.animalAvailability(next, species, 'pet');
    return allowed.ok ? success(next) : fail(allowed.reason);
  }
  function animalVisits(state, species, visits) {
    if (!own(game.ANIMALS, species) || !Number.isSafeInteger(visits) || visits < 0 || visits > 2000) return fail('动物熟悉次数应为 0～2000 的整数');
    const next = changed(state);
    next.animalVisits = { cat: 0, goose: 0, ...next.animalVisits, [species]: visits };
    return success(next);
  }
  function animalInteraction(state, species, choice) {
    if (!own(game.ANIMALS, species) || !['calm', 'startled', 'feed'].includes(choice)) return fail('未知动物测试选项');
    const window = game.animalCalmWindow(state, species);
    return game.interactWithAnimal(state, { species, choice: choice === 'feed' ? 'feed' : 'pet', elapsedMs: choice === 'calm' ? window.start : 0 });
  }
  function memoryStatus(state, id, query = '') {
    const agent = game.characterAgent;
    return { summary: state.npcDialogueSummaries?.[id] || null, saved: clone(agent.memoryOf(state, id)), derived: agent.derivedMemories(state, id).length, retrieved: agent.retrieveMemories(state, id, query), summaryReady: !!agent.summaryPlan(state, id), reflectionReady: !!agent.reflectionPlan(state, id) };
  }
  function resetMemory(state, id) {
    if (!game.npcCast.get(state, id)) return fail('请先认识这位人物');
    const next = changed(state);
    if (next.npcDialogueSummaries) delete next.npcDialogueSummaries[id];
    if (next.npcAgentMemory?.byNpc) delete next.npcAgentMemory.byNpc[id];
    return success(next);
  }
  async function refreshMemory(state, id, kind, options = {}) {
    if (!game.npcCast.get(state, id)) return fail('请先认识这位人物');
    if (!['summary', 'reflection'].includes(kind)) return fail('未知记忆操作');
    const agent = game.characterAgent, plan = kind === 'summary' ? agent.summaryPlan(state, id) : agent.reflectionPlan(state, id);
    if (!plan) return fail(kind === 'summary' ? '需要累计六轮尚未归纳的对话' : '本学期已尝试反思，或尚无重要经历；可在学期总结时测试');
    if (!options.relay || !options.fetchFn) return fail('未配置在线对话服务');
    const result = kind === 'summary' ? await agent.requestSummary({ ...options, plan }) : await agent.requestReflection({ ...options, plan });
    if (options.signal?.aborted) return fail('记忆更新已取消');
    if (!result) return fail('在线记忆更新未成功，测试进度保留');
    let next = changed(state);
    if (kind === 'summary') next.npcDialogueSummaries = { ...next.npcDialogueSummaries, [id]: { text: result, throughRevision: plan.throughRevision } };
    else next = agent.applyReflection(next, id, result, plan, 'developer');
    return success(next);
  }
  function eventConditions(state, id) {
    if (!own(game.EVENTS, id)) return [];
    const rows = [], rule = config.CAMPUS_SCHEDULE[id] || config.RANDOM_CONTEXTS[id];
    const add = (label, met) => rows.push({ label, met: !!met });
    const did = (event, choice, ago) => state.eventHistory.some(e => e.event === event && (choice === undefined || e.choice === choice) && (ago === undefined || e.term === state.term - ago));
    add('处于可行动阶段', state.phase === 'playing');
    add('当前没有待处理事件', !state.pendingEvent && !state.eventQueue.length);
    const instance = (game.EVENTS[id].chain || 'daily') + ':' + id + ':' + state.term;
    add('本学期尚未处理此事件', !state.eventFlags[instance] && !did(id, undefined, 0));
    const actions = state.history.filter(e => e.term === state.term && e.command?.operation === 'executeAction');
    if (rule) {
      if (rule.terms) add('开放学期：' + rule.terms.join('、'), rule.terms.includes(state.term));
      if (rule.season) add('季节：' + (rule.season === 'autumn' ? '秋季' : '春季'), rule.season === (state.term % 2 ? 'autumn' : 'spring'));
      if (rule.minElapsed !== undefined) add('已用时间 ≥ ' + rule.minElapsed, 12 - state.time >= rule.minElapsed);
      if (rule.maxElapsed !== undefined) add('已用时间 ≤ ' + rule.maxElapsed, 12 - state.time <= rule.maxElapsed);
      if (rule.minActions) add('本学期行动 ≥ ' + rule.minActions + ' 次（当前 ' + actions.length + '）', actions.length >= rule.minActions);
      if (rule.unless) add('未经历：' + game.EVENTS[rule.unless].title, !did(rule.unless));
      if (rule.flag) add('拥有标记：' + rule.flag, state.eventFlags[rule.flag]);
      if (rule.after) add('前置经历：' + game.EVENTS[rule.after[0]].title + ' / ' + rule.after[1] + (rule.after[2] === undefined ? '' : '，距今 ' + rule.after[2] + ' 学期'), did(...rule.after));
      if (rule.actionGap) {
        const index = state.history.findLastIndex(e => e.term === state.term && e.event === rule.after[0] && e.command?.operation === 'submitEventChoice');
        const count = index < 0 ? 0 : state.history.slice(index + 1).filter(e => e.term === state.term && e.command?.operation === 'executeAction').length;
        add('前置事件后行动 ≥ ' + rule.actionGap + ' 次（当前 ' + count + '）', count >= rule.actionGap);
      }
      if (rule.actions) rows.push({ label: '由以下行动触发：' + rule.actions.map(a => game.ACTIONS[a]?.title || a).join('、'), met: null });
      if (config.RANDOM_CONTEXTS[id]) {
        add('本学期尚未抽取随机校园事件', !state.eventFlags['randomCampusRoll:' + state.term]);
        rows.push({ label: '符合条件后按 35% 概率抽取，且会受其他事件优先级影响', met: null });
      }
    } else if (id.endsWith('Offer')) {
      rows.push({ label: '执行对应的项目 / 社团 / 实习申请行动后出现', met: null });
    } else if (['projectReview', 'clubReview'].includes(id)) {
      const chain = state.chains[id.replace('Review', '')];
      add('经历进行中且进度为 2', chain.status === 'active' && chain.progress === 2);
      add('已到评审学期', state.term >= chain.reviewAfter && (id === 'clubReview' || state.term > chain.startedTerm));
    } else if (id === 'internshipMilestone') {
      add('实习进行中且尚未出现里程碑', state.chains.internship.status === 'active' && !state.chains.internship.milestoneSeen);
      add('达到岗位投入门槛', game.internshipRequirementMet(state));
    } else if (id === 'retake') add('上学期未达标', state.term >= 2 && state.courses.at(-1)?.term === state.term - 1 && !state.courses.at(-1)?.passed);
    else if (id === 'roommateCare') add('心情低于 ' + game.RULES.lowMood, state.mood < game.RULES.lowMood);
    else if (id === 'military2') add('已参加军训且尚未汇演', did('military1') && !did('military2', undefined, 0));
    else if (id === 'zhouNingMeet') add('首次自学并尚未认识周宁', !state.relationships?.introSeen);
    else if (id === 'zhouNingPresentation') { const check = game.npcStoryAvailability(state, 'zhouNing'); add(check.reason || '周宁人物剧情可用', check.ok); }
    else if (id === 'cardTrace') add('存在尚未追查的校园卡拾取记录', state.eventHistory.findLastIndex(e => e.event === 'card' && e.choice === 'pocket') > state.eventHistory.findLastIndex(e => e.event === 'cardTrace'));
    else rows.push({ label: '由专用剧情流程触发；可用下方按钮直接构造场景', met: null });
    return rows;
  }
  function forceEvent(state, id) {
    if (!own(game.EVENTS, id)) return fail('未知事件');
    let next = changed(playing(state));
    const chainId = game.EVENTS[id].chain;
    if (own(next.chains, chainId) && !id.endsWith('Offer')) Object.assign(next.chains[chainId], { status: 'active', progress: 2, startedTerm: Math.max(1, next.term - 1), reviewAfter: next.term, deadline: Math.min(8, next.term + 1) });
    if (id === 'zhouNingPresentation') {
      next = person(next, 'zhouNing', 60).state;
      next.relationships.zhouNing.presentation = null;
      next.relationships.interactions = 0;
    }
    const instanceId = (chainId || 'daily') + ':' + id + ':' + next.term;
    delete next.eventFlags[instanceId];
    Object.assign(next, { phase: 'eventPending', pendingEvent: { id, term: next.term, instanceId } });
    return success(next);
  }
  function person(state, id, familiarity) {
    if (!game.npcCast.profile(id) || !Number.isInteger(familiarity) || familiarity < 0 || familiarity > 100) return fail('人物或相识度无效');
    let next = changed(state);
    if (!game.npcCast.get(next, id)) next = game.npcCast.meet(next, id);
    return success(game.npcCast.set(next, id, { ...game.npcCast.get(next, id), familiarity }));
  }
  function prepareStory(state, id) {
    if (!game.npcCast.profile(id)) return fail('未知人物');
    let next = person(playing(state), id, 60).state;
    const old = game.npcCast.get(next, id);
    next = game.npcCast.set(next, id, { ...old, story: null, presentation: null, studies: Math.max(1, old.studies), life: { ...game.npcCast.life(next, id), energy: 100, activities: { selfStudy: 1 } } });
    for (const known of game.npcCast.known(next)) next = game.npcCast.setUsage(next, known, { term: next.term, talks: 0, talkGrowth: 0, interactions: 0 });
    Object.assign(next, { energy: 100, time: 12, fitness: Math.max(50, next.fitness) });
    return success(next);
  }
  function growth(state, id, mode) {
    if (mode === 'resetAll') { const next = changed(state); next.growth = { version: 1, purchased: {} }; return success(next); }
    if (!own(game.GROWTH_NODES, id)) return fail('未知养成节点');
    if (mode === 'buy') return game.purchaseGrowth(state, id);
    const next = changed(state), purchased = next.growth?.purchased || {};
    if (mode === 'unlock') purchased[id] = { term: next.term, revision: next.revision };
    else if (mode === 'reset') {
      const remove = new Set([id]);
      let size;
      do { size = remove.size; for (const node of Object.values(game.GROWTH_NODES)) if (node.prereq?.nodes?.some(key => remove.has(key))) remove.add(node.id); } while (size !== remove.size);
      for (const key of remove) delete purchased[key];
    } else return fail('未知养成操作');
    next.growth = { version: 1, purchased };
    return success(next);
  }
  function ending(state, id, preview = false) {
    if (!own(ENDINGS, id)) return fail('未知结局');
    if (own(game.TERMINAL_ENDINGS, id)) {
      let next = changed(playing(state));
      if (!preview) {
        if (id === 'cheatNote') { const result = exam(next); return result.ok ? game.cheatExam(result.state) : result; }
        next.eventFlags.cardPocketed = true;
        next.eventHistory.push({ event: 'card', choice: 'pocket', term: next.term });
        return forceEvent(next, 'cardTrace');
      }
      next.phase = 'ended';
      next.result = { kind: 'terminal', direction: id, title: game.TERMINAL_ENDINGS[id].title, term: next.term, reason: '开发者结局预览', average: game.averageGrade(next), passed: next.courses.filter(c => c.passed).length, requirements: [], experiences: clone(next.experiences), courses: clone(next.courses) };
      return success(next);
    }
    let next = semester(state, 8).state;
    const low = ['notQualified', 'delayed'].includes(id);
    const grade = low ? 40 : id === 'furtherStudy' ? 90 : 70;
    next.preparation = low ? 0 : id === 'furtherStudy' ? 90 : 70;
    next = exam(next, true).state;
    next.courses.forEach(c => { c.grade = grade; c.passed = grade >= 60; });
    next.summary = clone(next.courses.at(-1));
    if (id === 'furtherStudy') { next.chains.project.status = 'completed'; next.furtherStudy = game.ENDINGS.furtherStudyPreparation; next.experiences.push({ type:'project', term:8 }); }
    if (id === 'employment') { next.chains.internship.status = 'completed'; next.jobPreparation = game.ENDINGS.jobPreparation; next.experiences.push({ type:'internship', term:8 }); }
    next.endingOptions = game.evaluateEndings(next);
    next.phase = 'endingChoice';
    return preview ? game.chooseEnding(next, id) : success(next);
  }
  function validateSnapshot(state) {
    if (!state || state.version !== game.RULES.version || !Number.isInteger(state.term) || state.term < 1 || state.term > 8 || !['playing','eventPending','examPending','summary','endingChoice','finished','ended'].includes(state.phase)) return false;
    if (!Number.isSafeInteger(state.revision) || state.revision < 0 || typeof state.nickname !== 'string' || !game.BACKGROUNDS.some(b => b.id === state.background?.id) || typeof state.rng?.seed !== 'string') return false;
    if (!Object.keys(FIELDS).every(key => validField(key, state[key]))) return false;
    if (!['history','processedCommands','courses','selectedCourses','eventQueue','eventHistory','experiences'].every(key => Array.isArray(state[key]))) return false;
    if (!state.history.every(entry => entry && typeof entry.command?.operation === 'string') || !state.courses.every(course => course && Number.isFinite(course.grade) && Number.isInteger(course.term)) || !state.selectedCourses.every(id => game.courseById(id))) return false;
    if (!state.chains || !['project','club','internship'].every(id => state.chains[id] && typeof state.chains[id].status === 'string') || !state.counts || !state.eventFlags) return false;
    if (state.animalVisits !== undefined && (!state.animalVisits || Array.isArray(state.animalVisits) || !Object.entries(state.animalVisits).every(([id, visits]) => own(game.ANIMALS, id) && Number.isSafeInteger(visits) && visits >= 0 && visits <= 2000))) return false;
    try {
      if (!game.characterAgent.validSummaries(state) || !game.characterAgent.validAgentMemory(state)) return false;
    } catch (_) { return false; }
    if (state.phase === 'eventPending' && (!state.pendingEvent || !own(game.EVENTS, state.pendingEvent.id))) return false;
    if (state.phase === 'examPending' && (!state.exam || !Array.isArray(state.exam.questions) || !Array.isArray(state.exam.answers))) return false;
    if (state.phase === 'summary' && !state.summary || state.phase === 'endingChoice' && !Array.isArray(state.endingOptions?.options) || ['finished','ended'].includes(state.phase) && !state.result) return false;
    return true;
  }
  function createStore(storage) {
    function keys(id) { if (![1,2,3].includes(id)) throw new Error('无效测试栏位'); return { primary: PREFIX + id + ':main', backup: PREFIX + id + ':backup' }; }
    function read(key) {
      try {
        const raw = storage?.getItem(key);
        if (!raw) return { ok: false, empty: true, reason: '空测试栏位' };
        const value = JSON.parse(raw, (key, value) => { if (['__proto__','prototype','constructor'].includes(key)) throw new Error('非法字段'); return value; });
        if (value.format !== 1 || !validateSnapshot(value.state) || !Number.isFinite(Date.parse(value.savedAt))) return fail('测试存档格式无效');
        return { ...value, ok: true };
      } catch (_) { return fail('测试存档无法读取'); }
    }
    return {
      inspect: () => ({ ok: true, slots: [1,2,3].map(id => ({ id, ok: true, primary: read(keys(id).primary), backup: read(keys(id).backup), temporary: null })) }),
      load(id, source = 'primary') { try { if (!['primary','backup'].includes(source)) return fail('无效存档来源'); return read(keys(id)[source]); } catch (error) { return fail(error.message); } },
      save(state, id) {
        try {
          if (!storage) return fail('浏览器无法保存测试存档，可暂用本页检查点');
          if (!validateSnapshot(state)) return fail('测试状态结构无效');
          const slot = keys(id), previous = read(slot.primary), savedAt = new Date().toISOString();
          if (previous.ok) storage.setItem(slot.backup, JSON.stringify(previous));
          storage.setItem(slot.primary, JSON.stringify({ format: 1, state: clone(state), savedAt }));
          return { ok: true, savedAt };
        } catch (_) { return fail('测试存档保存失败，请检查浏览器存储空间'); }
      }
    };
  }
  function createRecorder() {
    let source = null, checkpoints = [], sequence = 0;
    const entries = [];
    return {
      get active() { return source !== null; },
      begin(snapshot) { if (source === null) source = { snapshot: clone(snapshot) }; },
      exit() { const snapshot = clone(source?.snapshot); source = null; return snapshot; },
      record(label, before, after, reason = '') {
        const changes = Object.fromEntries(Object.keys(FIELDS).filter(key => before?.[key] !== after?.[key]).map(key => [key, { from: before?.[key] ?? null, to: after?.[key] ?? null }]));
        entries.push({ at: new Date().toISOString(), label, ok: !reason, reason, term: after?.term, phase: after?.phase, changes });
        if (entries.length > 200) entries.shift();
      },
      get entries() { return clone(entries); },
      checkpoint(state, label) { const id = ++sequence; checkpoints.push({ id, label: String(label || '检查点 ' + id).slice(0, 60), state: clone(state), at: new Date().toISOString() }); checkpoints = checkpoints.slice(-5); return id; },
      checkpoints: () => checkpoints.map(({ state, ...row }) => ({ ...row, term: state.term, phase: state.phase })),
      restore(id) { const point = checkpoints.find(p => p.id === id); return point ? success(clone(point.state)) : fail('检查点不存在（仅在本页保留最近 5 个）'); }
    };
  }
  const api = { FIELDS, ENDINGS, PREFIX, ECONOMY_ACTIONS, clone, applyFields, semester, exam, budgetScene, prepareEconomyAction, animalScene, animalVisits, animalInteraction, memoryStatus, resetMemory, refreshMemory, eventConditions, forceEvent, person, prepareStory, growth, ending, createStore, createRecorder, validateSnapshot };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CampusDeveloperTools = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
