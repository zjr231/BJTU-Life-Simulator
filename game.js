(function (root) {
  'use strict';
  const config = typeof module !== 'undefined' && module.exports ? require('./config.js') : root.CampusConfig;
  const random = typeof module !== 'undefined' && module.exports ? require('./rng.js') : root.CampusRandom;
  const courses = typeof module !== 'undefined' && module.exports ? require('./courses.js') : root.CampusCourses;
  const relationships = typeof module !== 'undefined' && module.exports ? require('./relationships.js') : root.CampusRelationships;
  const characterAgent = typeof module !== 'undefined' && module.exports ? require('./character-agent.js') : root.CampusCharacterAgent;
  const npcSupport = typeof module !== 'undefined' && module.exports ? require('./npc-support.js') : root.CampusNpcSupport;
  const { RULES, FITNESS_TIERS, BASKETBALL, TERM_NAMES, BACKGROUNDS, PLACES, ACTIONS, ACTION_INVESTMENTS, EVENTS, EVENT_INVESTMENTS, LEGACY_INVESTMENTS, ENDINGS, TERMINAL_ENDINGS, RANDOM_POOL, CAMPUS_SCHEDULE, RANDOM_CONTEXTS, AI_CHAT, NPC_CHAT } = config;
  const { COURSES, SUBJECTS, QUESTIONS, LEGACY_QUESTIONS, courseById, coursesForTerm, generateExam, ratingFor, gradeFor } = courses;
  const CHAIN_NAMES = { project: '项目', club: '社团', internship: '实习' };
  const own = (object, key) => typeof key === 'string' && Object.hasOwn(object, key);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const clamp = (value, max) => Math.max(0, Math.min(max, value));
  const selectedCoursesOf = (state) => Array.isArray(state.selectedCourses) ? state.selectedCourses : [];
  // Health actions are exempt from fitness-tier scaling; sickness is derived from fitness.
  const HEALTH_ACTIONS = new Set(['exercise', 'gym', 'teamSport', 'soloSport', 'basketball', 'walk', 'rest', 'checkup', 'sickVisit', 'treatment']);
  const ILLNESS_REASON = '身体不适，先去校医院就诊';
  const SICK_LEAVE_ID = 'sickLeave';
  const REWARD_KEYS = ['preparation', 'social', 'mood', 'fitness', 'furtherStudy', 'jobPreparation'];
  const COST_KEYS = ['energy', 'fitnessCost'];
  function fitnessTier(stateOrValue) {
    const value = typeof stateOrValue === 'number' ? stateOrValue : stateOrValue.fitness;
    return FITNESS_TIERS.find((tier, index) => value >= tier.min && (!FITNESS_TIERS[index + 1] || value < FITNESS_TIERS[index + 1].min)) || FITNESS_TIERS[0];
  }
  function isSick(state) { return fitnessTier(state).id === 'sick'; }
  function fitnessAdjustedEffect(state, effect, actionId = null) {
    const adjusted = { ...effect };
    if (adjusted.emergencyMoney) adjusted.money = Math.min(adjusted.money || 0, state.money);
    const tier = fitnessTier(state);
    if (tier.id === 'sick' || (actionId && HEALTH_ACTIONS.has(actionId))) return adjusted;
    for (const key of REWARD_KEYS) if ((adjusted[key] || 0) > 0) adjusted[key] = Math.round(adjusted[key] * tier.reward);
    for (const key of COST_KEYS) if ((adjusted[key] || 0) > 0) adjusted[key] = Math.round(adjusted[key] * tier.cost);
    return adjusted;
  }
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
      counts: {}, courses: [], selectedCourses: [], exam: null, history: [], summary: null, pendingEvent: null, eventQueue: [], eventFlags: {}, eventHistory: [], experiences: [], chains, endingOptions: null, result: null, npcChats: {}, relationships: relationships.create()
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
  function basketballReward(hits) {
    let tier = BASKETBALL.rewards[0];
    for (const item of BASKETBALL.rewards) if (hits >= item.minHits) tier = item;
    return { ...tier, hits, score: hits * BASKETBALL.pointsPerHit };
  }
  function previewChanges(state, effect) {
    const fitnessBase = state.fitness + (effect.fitness || 0) - (effect.fitnessCost || 0);
    const fitnessTarget = effect.fitnessFloor === undefined ? fitnessBase : Math.max(fitnessBase, effect.fitnessFloor);
    const changes = {
      time: effect.time ? -effect.time : 0, energy: clamp(state.energy - (effect.energy || 0) + (effect.recovery || 0), 100) - state.energy,
      money: (effect.income || 0) - (effect.money || 0), preparation: clamp(state.preparation + (effect.preparation || 0), 100) - state.preparation,
      social: clamp(state.social + (effect.social || 0), 100) - state.social, fitness: clamp(fitnessTarget, 100) - state.fitness,
      mood: clamp(state.mood + (effect.mood || 0), 100) - state.mood,
      furtherStudy: clamp(state.furtherStudy + (effect.furtherStudy || 0), 100) - state.furtherStudy,
      jobPreparation: clamp(state.jobPreparation + (effect.jobPreparation || 0), 100) - state.jobPreparation
    };
    for (const key of REWARD_KEYS) changes[key] = npcSupport.round(changes[key]);
    return changes;
  }
  function resourceCheck(state, effect) {
    for (const [key, label] of [['time', '时间'], ['energy', '精力'], ['money', '钱包']]) {
      if (state[key] < (effect[key] || 0)) return { ok: false, reason: label + '不够：需要 ' + effect[key] + '，现在剩 ' + state[key] };
    }
    if ((effect.fitnessCost || 0) > state.fitness) return { ok: false, reason: '体能不够：需要 ' + effect.fitnessCost + '，现在剩 ' + state.fitness };
    if (effect.minFitness && state.fitness < effect.minFitness) return { ok: false, reason: '体能需要达到 ' + effect.minFitness };
    return { ok: true, reason: '' };
  }
  function getActionInvestment(state, id) {
    if (!own(ACTION_INVESTMENTS, id)) return null;
    const original = ACTION_INVESTMENTS[id];
    const profile = { ...original, rewards: { ...original.rewards }, tiers: original.tiers.map(tier => ({ ...tier })) };
    const action = getAction(state, id);
    const discount = original.resource === 'energy' ? ACTIONS[id].energy - action.energy : 0;
    if (discount) {
      for (const key of ['min', 'max', 'default', 'h']) profile[key] = Math.max(1, profile[key] - discount);
      profile.timeEffortOffset = discount;
      for (const tier of profile.tiers) tier.amount = Math.max(1, tier.amount - discount);
    }
    for (const key of Object.keys(profile.rewards)) profile.rewards[key] += 3 * ((action[key] || 0) - (ACTIONS[id][key] || 0));
    return profile;
  }
  function previewActionInvestment(state, id, requestedAmount) {
    const profile = getActionInvestment(state, id);
    if (!profile) return null;
    const amount = requestedAmount === undefined ? profile.default : requestedAmount;
    const check = investmentCheck(profile, amount);
    if (!check.ok) return check;
    const curve = investmentCurve(profile, amount);
    const effect = fitnessAdjustedEffect(state, investmentEffect(getAction(state, id), profile, amount, curve.mean, curve.q), id);
    return { ok: true, amount, effect, level: investmentLevel(profile, amount) };
  }
  function availability(state, id, requestedAmount) {
    if (!own(ACTIONS, id)) return { ok: false, reason: '未知行动' };
    if (activeMilitary(state)) return { ok: false, reason: '请先完成军训汇演，再安排其他行动' };
    if (state.phase === 'eventPending') return { ok: false, reason: '请先处理当前事件' };
    if (state.phase !== 'playing') return { ok: false, reason: '现在这个阶段还不能行动' };
    const baseAction = getAction(state, id);
    if (isSick(state) && id !== 'treatment') return { ok: false, reason: ILLNESS_REASON };
    if (baseAction.sickOnly && !isSick(state)) return { ok: false, reason: '现在身体没有不适，不需要就诊' };
    const profile = getActionInvestment(state, id);
    if (!profile && requestedAmount !== undefined) return { ok: false, reason: '这个行动不需要设置投入' };
    const preview = profile && previewActionInvestment(state, id, requestedAmount);
    if (preview && !preview.ok) return preview;
    const action = preview ? preview.effect : fitnessAdjustedEffect(state, baseAction, id);
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
    if (!action.chain && !action.minigame && !Object.values(previewChanges(state, action)).some((value) => value > 0)) return { ok: false, reason: '这项行动的收益已经到头了' };
    return { ok: true, reason: '' };
  }
  function applyChanges(state, changes) {
    const next = { ...state };
    for (const [key, value] of Object.entries(changes)) next[key] = REWARD_KEYS.includes(key) ? npcSupport.round(next[key] + value) : next[key] + value;
    return next;
  }
  function instanceFor(state, id) { return { id, term: state.term, instanceId: (EVENTS[id].chain || 'daily') + ':' + id + ':' + state.term }; }
  function activeMilitary(state) {
    return ['playing', 'eventPending'].includes(state.phase)
      && state.eventHistory.some(entry => entry.term === state.term && entry.event === 'military1' && ['join', 'tug', 'choir'].includes(entry.choice))
      && !state.eventHistory.some(entry => entry.term === state.term && entry.event === 'military2');
  }
  function resumeRequiredEvents(state) {
    return activeMilitary(state) ? attachEvents(state, 'restore') : state;
  }
  function getTermStage(state) {
    const elapsed = RULES.time - state.time;
    return elapsed <= 4 ? '学期初' : elapsed < 9 ? '学期中' : '学期末';
  }
  function attachEvents(state, triggerAction, relationshipTrigger = false) {
    if (!['playing', 'eventPending'].includes(state.phase)) return state;
    if (activeMilitary(state)) {
      const followup = instanceFor(state, 'military2');
      const waiting = [...(state.pendingEvent ? [state.pendingEvent] : []), ...state.eventQueue]
        .filter(item => !['military1', 'military2'].includes(item.id) && !state.eventFlags[item.instanceId]);
      return { ...state, phase: 'eventPending', pendingEvent: followup,
        eventQueue: waiting.filter((item, index) => waiting.findIndex(other => other.instanceId === item.instanceId) === index) };
    }
    // Old saves can contain several optional campus events queued by one action.
    // Keep the visible event and required chain/condition events; reschedule the
    // not-yet-shown optional events on a later action in their valid time window.
    let next = { ...state, eventQueue: state.eventQueue.filter(item => !own(CAMPUS_SCHEDULE, item.id) && !RANDOM_POOL.includes(item.id)) };
    const enqueue = (id) => {
      const instance = instanceFor(next, id);
      if (!next.eventFlags[instance.instanceId] && next.pendingEvent?.instanceId !== instance.instanceId && !next.eventQueue.some((item) => item.instanceId === instance.instanceId)) next.eventQueue.push(instance);
    };
    const did = (event, choice, termsAgo) => next.eventHistory.some((entry) => entry.event === event && (choice === undefined || entry.choice === choice) && (termsAgo === undefined || entry.term === next.term - termsAgo));
    const lastEventIndex = (event, choice) => {
      for (let index = next.eventHistory.length - 1; index >= 0; index--) {
        const entry = next.eventHistory[index];
        if (entry.event === event && (choice === undefined || entry.choice === choice)) return index;
      }
      return -1;
    };
    const lastPocket = lastEventIndex('card', 'pocket');
    const lastTrace = lastEventIndex('cardTrace');
    const tracePending = next.pendingEvent?.id === 'cardTrace' || next.eventQueue.some((item) => item.id === 'cardTrace');
    if (lastPocket > lastTrace && !tracePending && (triggerAction === 'newTerm' || next.term === 8)) enqueue('cardTrace');
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
    // Only new commands opt into the first-self-study encounter; historical
    // commands must retain their original event order and RNG consumption.
    if (relationshipTrigger && triggerAction === 'selfStudy' && !relationships.read(next).introSeen) {
      next = { ...next, relationships: { ...relationships.read(next), introSeen: true } };
      enqueue('zhouNingMeet');
    }
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
    return { ok: true, state: { ...next, appVersion: RULES.appVersion, revision, processedCommands: [...state.processedCommands, commandId], history: [...state.history, log] }, changes: entry.changes, summary: next.summary, entry: log };
  }
  function executeAction(state, id, options = {}) {
    const command = commandCheck(state, options, 'action:' + id);
    if (!command.ok) return command;
    const characterVersion = options.characterVersion || 0;
    const supportVersion = options.npcSupportVersion ?? 0;
    if (![0, 1].includes(supportVersion)) return { ok: false, reason: '人物辅助规则版本无效', state };
    if (![0, 2].includes(characterVersion)) return { ok: false, reason: '人物同行规则版本无效', state };
    const check = options.companionId === 'zhouNing' && characterVersion === 2 ? companionAvailability(state, id, options.investment) : availability(state, id, options.investment);
    if (!check.ok) return { ...check, state };
    const relationshipVersion = options.relationshipVersion === undefined ? 1 : options.relationshipVersion;
    if (![0, 1].includes(relationshipVersion)) return { ok: false, reason: '人物关系规则版本无效', state };
    const companion = options.companionId;
    if (companion !== undefined) {
      if (companion !== 'zhouNing' || relationshipVersion !== 1 || (characterVersion !== 2 && id !== 'selfStudy')) return { ok: false, reason: '这个同行安排不可用', state };
      const together = characterVersion === 2 ? companionAvailability(state, id, options.investment) : zhouNingAvailability(state, 'study', options.investment);
      if (!together.ok) return { ...together, state };
    }
    if (getAction(state, id).minigame) return { ok: false, reason: '这项行动需要先完成小游戏', state };
    const profile = getActionInvestment(state, id);
    let action = getAction(state, id);
    let rng = state.rng;
    let investment;
    let support;
    if (profile) {
      const preview = previewActionInvestment(state, id, options.investment);
      const curve = investmentCurve(profile, preview.amount);
      const drawn = random.draw(state.rng);
      rng = drawn.rng;
      const factor = curve.factor(drawn.number);
      action = investmentEffect(action, profile, preview.amount, factor, curve.q);
      if (!supportVersion && companion && characterVersion === 2) for (const [key, value] of Object.entries(relationships.activityBonus(state, id))) action[key] = (action[key] || 0) + value;
      else if (!supportVersion && companion) action.preparation = (action.preparation || 0) + relationships.studyBonus(relationships.read(state).zhouNing.familiarity);
      const rawAction = action;
      action = fitnessAdjustedEffect(state, action, id);
      if (supportVersion) ({ effect: action, support } = npcSupport.resolve(state, action, fitnessAdjustedEffect({ ...state, fitness: 50 }, rawAction, id), id, !!companion));
      investment = describeInvestment(profile, preview, factor, curve.mean, action);
    } else {
      if (!supportVersion && companion && characterVersion === 2) for (const [key, value] of Object.entries(relationships.activityBonus(state, id))) action[key] = (action[key] || 0) + value;
      const rawAction = action;
      action = fitnessAdjustedEffect(state, action, id);
      if (supportVersion) ({ effect: action, support } = npcSupport.resolve(state, action, fitnessAdjustedEffect({ ...state, fitness: 50 }, rawAction, id), id, !!companion));
    }
    const changes = previewChanges(state, action);
    let next = { ...applyChanges(state, changes), rng, counts: { ...state.counts, [id]: (state.counts[id] || 0) + 1 } };
    let relationship;
    if (companion) {
      next.relationships = characterVersion === 2 ? relationships.accompanied(state, id, action.place) : relationships.studied(state);
      if (characterVersion === 2) next = rememberAgentActivity(state, next, id);
      const before = relationships.read(state).zhouNing;
      const after = next.relationships.zhouNing;
      relationship = { characterId: 'zhouNing', kind: 'study', gained: after.familiarity - before.familiarity, familiarity: after.familiarity,
        bonus: relationships.studyBonus(before.familiarity), description: before.familiarity >= 60 ? '你们轮流讲题，周宁把遗漏的步骤补在笔记旁。' : before.familiarity >= 30 ? '周宁把整理好的笔记摊开，与你核对彼此的理解。' : '你们在同一张桌子旁坐下，遇到不懂的地方就轻声讨论。' };
      if (characterVersion === 2) relationship = relationships.activityRecord(state, next, id);
      if (supportVersion) next = withAbilities(next);
    }
    if (action.kind === 'work') next.chains = { ...state.chains, [action.chain]: { ...state.chains[action.chain], progress: state.chains[action.chain].progress + 1 } };
    next = attachEvents(next, id, relationshipVersion === 1);
    return commit(state, next, { operation: 'executeAction', id, ...(supportVersion ? { npcSupportVersion: supportVersion } : {}), ...(relationshipVersion ? { relationshipVersion } : {}), ...(companion ? { companionId: companion, ...(characterVersion ? { characterVersion } : {}) } : {}), ...(investment ? { investment: investment.amount } : {}) }, { action: id, title: companion ? characterVersion === 2 ? '与周宁' + action.title : '与周宁共同自习' : action.title, changes, fitnessCost: action.fitnessCost || 0, ...(relationship ? { relationship } : {}), ...(investment ? { investment } : {}), ...(support ? { support } : {}) }, command.commandId);
  }
  function completeBasketball(state, hits, options = {}) {
    const command = commandCheck(state, options, 'basketball');
    if (!command.ok) return command;
    const supportVersion = options.npcSupportVersion ?? 0;
    if (![0, 1].includes(supportVersion)) return { ok: false, reason: '人物辅助规则版本无效', state };
    if (!Number.isSafeInteger(hits) || hits < 0 || hits > BASKETBALL.maxHits) return { ok: false, reason: '投篮结果无效', state };
    if (options.companionId !== undefined && (options.companionId !== 'zhouNing' || options.characterVersion !== 2)) return { ok: false, reason: '这个同行安排不可用', state };
    const companion = options.companionId === 'zhouNing';
    if (options.agentProposalRevision !== undefined && (!companion || characterAgent.read(state).proposal?.id !== 'basketball' || characterAgent.read(state).proposal.createdRevision !== options.agentProposalRevision)) return { ok: false, reason: '这个球场邀请已更新', state };
    const check = companion ? companionAvailability(state, 'basketball') : availability(state, 'basketball');
    if (!check.ok) return { ...check, state };
    const base = getAction(state, 'basketball');
    const reward = basketballReward(hits);
    let effect = { ...base, ...reward };
    if (companion && !supportVersion) for (const [key, value] of Object.entries(relationships.activityBonus(state, 'basketball'))) effect[key] = (effect[key] || 0) + value;
    let support;
    const rawEffect = effect;
    effect = fitnessAdjustedEffect(state, effect, 'basketball');
    if (supportVersion) ({ effect, support } = npcSupport.resolve(state, effect, fitnessAdjustedEffect({ ...state, fitness: 50 }, rawEffect, 'basketball'), 'basketball', companion));
    const changes = previewChanges(state, effect);
    let next = { ...applyChanges(state, changes), counts: { ...state.counts, basketball: (state.counts.basketball || 0) + 1 } };
    let relationship;
    if (companion) {
      next.relationships = relationships.accompanied(state, 'basketball', 'track');
      next = rememberAgentActivity(state, next, 'basketball');
      relationship = relationships.activityRecord(state, next, 'basketball');
      if (supportVersion) next = withAbilities(next);
    }
    next = attachEvents(next, 'basketball');
    return commit(state, next, { operation: 'completeBasketball', hits, ...(supportVersion ? { npcSupportVersion: supportVersion } : {}), ...(companion ? { companionId: 'zhouNing', characterVersion: 2 } : {}), ...(options.agentProposalRevision !== undefined ? { agentProposalRevision: options.agentProposalRevision } : {}) }, { action: 'basketball', title: companion ? '与周宁一起打篮球' : base.title, hits, score: reward.score, tier: reward.id, tierLabel: reward.label, changes, fitnessCost: base.fitnessCost || 0, ...(relationship ? { relationship } : {}), ...(support ? { support } : {}) }, command.commandId);
  }
  function getEventInvestment(state, choiceId) {
    return state.pendingEvent ? EVENT_INVESTMENTS[state.pendingEvent.id + ':' + choiceId] || null : null;
  }
  function investmentCheck(profile, amount) {
    return Number.isSafeInteger(amount) && profile.tiers.some(tier => tier.amount === amount)
      ? { ok: true } : { ok: false, reason: '请选择一个完整的投入档位' };
  }
  function investmentCurve(profile, amount) {
    const q = amount / (amount + profile.h);
    const a = 1 + 2 * q;
    const mean = a / (a + 1);
    return { q, mean, factor: probability => (1 - profile.s) * mean + profile.s * probability ** (1 / a) };
  }
  function investmentLevel(profile, amount) {
    return profile.tiers.find(tier => tier.amount === amount).id;
  }
  function investmentEffect(choice, profile, amount, factor, q) {
    const effect = { ...choice, [profile.resource]: amount };
    effect.time = profile.tiers.find(tier => tier.amount === amount).time;
    for (const [key, ceiling] of Object.entries(profile.rewards)) effect[key] = Math.round(ceiling * q * factor);
    return effect;
  }
  // Read-only preview: slider movement and reopening a saved event never draw RNG.
  function previewEventInvestment(state, choiceId, requestedAmount) {
    const profile = getEventInvestment(state, choiceId);
    if (!profile) return null;
    const amount = requestedAmount === undefined ? profile.default : requestedAmount;
    const check = investmentCheck(profile, amount);
    if (!check.ok) return check;
    const choice = EVENTS[state.pendingEvent.id].choices.find(item => item.id === choiceId);
    const curve = investmentCurve(profile, amount);
    const effect = fitnessAdjustedEffect(state, investmentEffect(choice, profile, amount, curve.mean, curve.q), null);
    return { ok: true, amount, effect, average: previewChanges(state, effect),
      low: previewChanges(state, fitnessAdjustedEffect(state, investmentEffect(choice, profile, amount, curve.factor(0.1), curve.q), null)),
      high: previewChanges(state, fitnessAdjustedEffect(state, investmentEffect(choice, profile, amount, curve.factor(0.9), curve.q), null)),
      level: investmentLevel(profile, amount) };
  }
  function describeInvestment(profile, preview, factor, mean, adjustedEffect) {
    const ratio = factor / mean;
    const outcome = ratio < 0.55 ? 'setback' : preview.level === 'light'
      ? (ratio >= 1.2 ? 'surprise' : 'limited') : ratio >= 1.2 ? 'good' : 'steady';
    const spent = adjustedEffect && adjustedEffect[profile.resource] !== undefined ? adjustedEffect[profile.resource] : preview.amount;
    return { amount: preview.amount, spent, resource: profile.resource, fitnessCost: adjustedEffect ? (adjustedEffect.fitnessCost || 0) : 0, tier: preview.level, level: preview.level, outcome,
      description: profile.plans[{ light: 0, steady: 1, deep: 2 }[preview.level]] + profile.outcomes[outcome] };
  }
  function eventAvailability(state, choiceId, instanceId, requestedAmount) {
    if (state.phase !== 'eventPending' || !state.pendingEvent) return { ok: false, reason: '当前没有待处理事件' };
    if (activeMilitary(state) && state.pendingEvent.id !== 'military2') return { ok: false, reason: '请先完成军训汇演' };
    if (instanceId !== undefined && instanceId !== state.pendingEvent.instanceId) return { ok: false, reason: '事件已更新，请重新选择' };
    if (choiceId === SICK_LEAVE_ID) return isSick(state) ? { ok: true, reason: '' } : { ok: false, reason: '现在不需要去校医院' };
    const event = EVENTS[state.pendingEvent.id];
    const choice = event && event.choices.find((item) => item.id === choiceId);
    if (!choice) return { ok: false, reason: '未知事件选项' };
    if (isSick(state) && state.pendingEvent.id !== 'zhouNingMeet') return { ok: false, reason: ILLNESS_REASON };
    if (state.pendingEvent.id === 'zhouNingPresentation' && choiceId !== 'later') {
      const relation = relationships.read(state);
      if (!relation.zhouNing || relation.zhouNing.presentation || relation.interactions >= (relation.zhouNing.life ? 4 : 2)) return { ok: false, reason: '本次人物互动已不可用' };
    }
    if (choice.chainEffect === 'postpone' && state.term === 8) return { ok: false, reason: '最后一个学期了，把经历确认了吧' };
    const profile = getEventInvestment(state, choiceId);
    if (!profile && requestedAmount !== undefined) return { ok: false, reason: '这个选项不需要设置投入' };
    const preview = profile && previewEventInvestment(state, choiceId, requestedAmount);
    if (preview && !preview.ok) return preview;
    return resourceCheck(state, preview ? preview.effect : fitnessAdjustedEffect(state, choice, null));
  }
  function resolveOutcome(state, choice, supportVersion = 0) {
    if (state.pendingEvent?.id === 'zhouNingPresentation' && choice.id !== 'later') return relationships.presentationOutcome(state, choice.id, supportVersion);
    if (!choice.outcomeBy) return null;
    const metric = choice.outcomeBy.metric === 'average' ? averageGrade(state) : state[choice.outcomeBy.metric];
    return metric >= choice.outcomeBy.threshold ? choice.outcomeBy.pass : choice.outcomeBy.fail;
  }
  function submitEventChoice(state, choiceId, options = {}) {
    const command = commandCheck(state, options, 'event:' + choiceId);
    if (!command.ok) return command;
    const supportVersion = options.npcSupportVersion ?? 0;
    if (![0, 1].includes(supportVersion)) return { ok: false, reason: '人物辅助规则版本无效', state };
    const check = eventAvailability(state, choiceId, options.eventInstanceId, options.investment);
    if (!check.ok) return { ...check, state };
    const pending = state.pendingEvent;
    if (choiceId === SICK_LEAVE_ID) {
      const changes = previewChanges(state, {});
      const entry = { term: state.term, event: pending.id, instanceId: pending.instanceId, choice: SICK_LEAVE_ID, title: '先去校医院', outcome: null, changes };
      let next = { ...applyChanges(state, changes), pendingEvent: null, phase: 'playing', eventFlags: { ...state.eventFlags, [pending.instanceId]: true }, eventHistory: [...state.eventHistory, entry] };
      next = attachEvents(next, 'eventChoice');
      return commit(state, next, { operation: 'submitEventChoice', id: SICK_LEAVE_ID, eventInstanceId: pending.instanceId }, entry, command.commandId);
    }
    const event = EVENTS[pending.id];
    const choice = event.choices.find((item) => item.id === choiceId);
    const profile = getEventInvestment(state, choiceId);
    let effect = choice;
    let rng = state.rng;
    let investment;
    let investmentPreview, investmentFactor, investmentCurveData;
    if (profile) {
      const preview = previewEventInvestment(state, choiceId, options.investment);
      const curve = investmentCurve(profile, preview.amount);
      const drawn = random.draw(state.rng);
      rng = drawn.rng;
      const factor = curve.factor(drawn.number);
      effect = investmentEffect(choice, profile, preview.amount, factor, curve.q);
      investmentPreview = preview;
      investmentFactor = factor;
      investmentCurveData = curve;
    }
    const outcome = resolveOutcome(state, choice, supportVersion) || {};
    const baseEffect = effect;
    effect = { ...baseEffect, ...outcome };
    for (const key of ['time', 'energy', 'recovery', 'money', 'income', 'preparation', 'social', 'fitness', 'mood', 'furtherStudy', 'jobPreparation']) {
      effect[key] = (baseEffect[key] || 0) + (outcome[key] || 0);
    }
    const cameo = options.zhouCameo === true;
    if (cameo && (!characterAgent.CAMEOS[pending.id] || characterAgent.read(state).cameo?.instanceId !== pending.instanceId)) return { ok: false, reason: '当前事件没有周宁同行', state };
    const sharedCameo = cameo && choiceId !== 'later';
    const cameoAssessment = sharedCameo ? supportVersion ? relationships.playerPerformance(state) : relationships.performance(state) : null;
    if (sharedCameo && !supportVersion) { effect.mood += cameoAssessment.level === 'good' ? 4 : cameoAssessment.level === 'steady' ? 2 : 1; effect.social += cameoAssessment.level === 'good' ? 2 : 1; }
    let neutralEffect = { ...effect };
    if (supportVersion && pending.id === 'zhouNingPresentation' && choiceId !== 'later') {
      const neutralOutcome = relationships.presentationOutcome({ ...state, preparation: 0, courses: [], social: 0, mood: 0 }, choiceId, 1);
      neutralEffect = { ...baseEffect, ...neutralOutcome };
      for (const key of ['time', 'energy', 'recovery', 'money', 'income', 'preparation', 'social', 'fitness', 'mood', 'furtherStudy', 'jobPreparation']) neutralEffect[key] = (baseEffect[key] || 0) + (neutralOutcome[key] || 0);
    }
    neutralEffect = fitnessAdjustedEffect({ ...state, fitness: 50 }, neutralEffect, null);
    effect = fitnessAdjustedEffect(state, effect, null);
    let support;
    if (supportVersion && choiceId !== 'later' && (sharedCameo || pending.id === 'zhouNingPresentation')) ({ effect, support } = npcSupport.resolve(state, effect, neutralEffect, pending.id, true));
    if (profile) investment = describeInvestment(profile, investmentPreview, investmentFactor, investmentCurveData.mean, effect);
    const changes = previewChanges(state, effect);
    const entry = { term: state.term, event: pending.id, instanceId: pending.instanceId, choice: choiceId, title: choice.title, outcome: outcome.title || null, changes, fitnessCost: effect.fitnessCost || 0, ...(investment ? { investment } : {}), ...(support ? { support } : {}) };
    let next = { ...applyChanges(state, changes), rng, pendingEvent: null, phase: 'playing', eventFlags: { ...state.eventFlags, [pending.instanceId]: true }, eventHistory: [...state.eventHistory, entry] };
    if (pending.id === 'zhouNingMeet') {
      next.relationships = relationships.meet(state, choiceId === 'discuss');
      entry.relationship = { characterId: 'zhouNing', kind: 'meet', gained: next.relationships.zhouNing.familiarity, familiarity: next.relationships.zhouNing.familiarity, description: '你与周宁建立了联系。以后可以从人物关系网找他一起学习。' };
    } else if (pending.id === 'zhouNingPresentation' && choiceId !== 'later') {
      const relation = relationships.read(state);
      const before = relation.zhouNing;
      const person = { ...relationships.remember(relationships.grow(before, outcome.familiarity), outcome.memory), presentation: outcome.level };
      if (person.life) person.life = { ...person.life, goal: 'explore', mood: Math.min(100, person.life.mood + 6), energy: Math.max(0, person.life.energy - 5) };
      next.relationships = { ...relation, interactions: relation.interactions + 1, zhouNing: person };
      entry.relationship = { characterId: 'zhouNing', kind: 'presentation', gained: person.familiarity - before.familiarity, familiarity: person.familiarity,
        description: outcome.description, assessment: supportVersion ? { formula: 'player', score: outcome.score, academic: outcome.academic, social: state.social, mood: state.mood } : { score: outcome.score, familiarity: before.familiarity, social: state.social, mood: state.mood }, level: outcome.level };
    }
    if (cameo) {
      const relation = relationships.read(state);
      let person = sharedCameo ? relationships.remember(relationships.grow(relation.zhouNing, 2), 'event_' + pending.id) : { ...relation.zhouNing };
      person.agent = { ...characterAgent.read(state), cameo: null };
      next.relationships = { ...relation, zhouNing: person };
      if (sharedCameo) entry.relationship = { characterId: 'zhouNing', kind: 'cameo', gained: person.familiarity - relation.zhouNing.familiarity, familiarity: person.familiarity, description: '刚才一起经历了这件事，我也记住了。能在校园里这样碰见你，还挺开心的。', assessment: cameoAssessment };
    }
    if (supportVersion && next.relationships?.zhouNing) next = withAbilities(next);
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
    if (effect.ending) {
      const terminal = finishTerminal(next, effect.ending, effect.reason || choice.title);
      return commit(state, terminal, { operation: 'submitEventChoice', id: choiceId, eventInstanceId: pending.instanceId }, entry, command.commandId);
    }
    next = attachEvents(next, 'eventChoice');
    return commit(state, next, { operation: 'submitEventChoice', id: choiceId, eventInstanceId: pending.instanceId, ...(investment ? { investment: investment.amount } : {}), ...(cameo ? { zhouCameo: true } : {}), ...(supportVersion ? { npcSupportVersion: supportVersion } : {}) }, entry, command.commandId);
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
    if (activeMilitary(state)) return { ok: false, reason: '请先完成整个军训流程', state };
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
    const available = new Set(coursesForTerm(state.term, state.background.id, state.background.major).map((course) => course.id));
    if (!ids.every((id) => available.has(id))) return { ok: false, reason: '课程不在本学期可选范围', state };
    const next = { ...state, selectedCourses: [...ids] };
    return commit(state, next, { operation: 'selectCourses', id: [...ids] }, { action: 'selectCourses', title: '完成选课' }, command.commandId);
  }
  function beginExam(state, options = {}) {
    const command = commandCheck(state, options, 'beginExam');
    if (!command.ok) return command;
    if (activeMilitary(state)) return { ok: false, reason: '请先完成整个军训流程', state };
    if (state.phase !== 'playing') return { ok: false, reason: '现在不能开始考试', state };
    if (state.pendingEvent) return { ok: false, reason: '请先处理当前事件', state };
    if (!selectedCoursesOf(state).length) return { ok: false, reason: '请先完成本学期选课', state };
    let exam;
    try { exam = generateExam(selectedCoursesOf(state), state.rng.seed + ':exam:' + state.term + ':' + selectedCoursesOf(state).join(','), random); }
    catch (error) { return { ok: false, reason: error.message, state }; }
    return commit(state, { ...state, phase: 'examPending', exam }, { operation: 'beginExam' }, { action: 'beginExam', title: '开始期末考试' }, command.commandId);
  }
  function updateExamAnswers(state, answers, options = {}) {
    const command = commandCheck(state, options, 'updateExamAnswers');
    if (!command.ok) return command;
    if (state.phase !== 'examPending' || !state.exam) return { ok: false, reason: '当前没有正在作答的试卷', state };
    if (!Array.isArray(answers) || answers.length !== state.exam.questions.length || !Array.from(answers).every((answer) => answer === null || Number.isSafeInteger(answer) && answer >= 0 && answer < 4)) return { ok: false, reason: '答题草稿无效', state };
    const previous = state.exam.questions.map((_, index) => state.exam.answers[index] ?? null);
    if (answers.every((answer, index) => answer === previous[index])) return { ok: false, reason: '答案没有变化', state };
    return commit(state, { ...state, exam: { ...state.exam, answers: [...answers] } }, { operation: 'updateExamAnswers', id: [...answers] }, { action: 'updateExamAnswers', title: '更新答题草稿' }, command.commandId);
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
  function finishTerminal(state, id, reason) {
    const ending = TERMINAL_ENDINGS[id];
    if (!ending) throw new Error('未知终局');
    const flags = { ...state.eventFlags };
    delete flags.cardPocketed;
    const result = {
      kind: 'terminal', direction: id, title: ending.title, term: state.term, reason,
      requirements: [], average: averageGrade(state), passed: state.courses.filter((item) => item.passed).length,
      experiences: clone(state.experiences), courses: clone(state.courses)
    };
    return { ...state, phase: 'ended', result, exam: null, pendingEvent: null, eventQueue: [], summary: null, endingOptions: null, selectedCourses: [], eventFlags: flags };
  }
  function cheatExam(state, options = {}) {
    const command = commandCheck(state, options, 'cheatExam');
    if (!command.ok) return command;
    if (state.phase !== 'examPending' || !state.exam) return { ok: false, reason: '当前没有可作弊的试卷', state };
    const reason = '第 ' + state.term + ' 学期期末考试作弊，被监考老师当场发现。';
    const next = finishTerminal(state, 'cheatNote', reason);
    return commit(state, next, { operation: 'cheatExam' }, { action: 'cheatExam', title: '小抄的第一行' }, command.commandId);
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
      ]),
      make('blankResume', '三无毕业生', [
        { label: '未完成校园项目、社团或实习', met: !['project', 'club', 'internship'].some((id) => state.chains[id].status === 'completed'), value: 'checked' },
        { label: '求职准备低于 20', met: state.jobPreparation < 20, value: state.jobPreparation }
      ])
    ];
    if (!graduated) {
      options.push({ id: 'notQualified', title: '暂未达到毕业条件', available: state.courses.length === 8, requirements: base });
      options.push({ id: 'delayed', title: '延毕练习生', available: state.courses.length === 8, requirements: base });
    }
    return { average, passed, graduated, options };
  }
  function continueGame(state, options = {}) {
    const command = commandCheck(state, options, 'continueGame');
    if (!command.ok) return command;
    if (state.phase !== 'summary') return { ok: false, reason: '当前没有待确认的学期总结', state };
    const next = state.term === 8
      ? { ...state, phase: 'endingChoice', endingOptions: evaluateEndings(state), selectedCourses: [], exam: null }
      : attachEvents({ ...state, term: state.term + 1, phase: 'playing', time: 12, energy: 80, preparation: 0, counts: {}, summary: null, selectedCourses: [], exam: null, npcChats: {}, ...(state.relationships ? { relationships: { ...state.relationships, term: state.term + 1, talks: 0, talkGrowth: 0, interactions: 0, ...(state.relationships.zhouNing?.life ? { zhouNing: { ...state.relationships.zhouNing, life: { ...state.relationships.zhouNing.life, energy: 80 } } } : {}) } } : {}) }, 'newTerm');
    return commit(state, next, { operation: 'continueGame' }, { action: 'continueGame', title: state.term === 8 ? '评估毕业方向' : '进入下一学期' }, command.commandId);
  }
  function chooseEnding(state, id, options = {}) {
    const command = commandCheck(state, options, 'chooseEnding:' + id);
    if (!command.ok) return command;
    if (state.phase !== 'endingChoice') return { ok: false, reason: '当前不能选择毕业方向', state };
    const ending = state.endingOptions.options.find((item) => item.id === id && item.available);
    if (!ending) return { ok: false, reason: '这个方向的条件还差一点', state };
    const result = { kind: 'graduation', direction: ending.id, title: ending.title, term: 8, reason: '', requirements: clone(ending.requirements), average: state.endingOptions.average, passed: state.endingOptions.passed, experiences: clone(state.experiences), courses: clone(state.courses) };
    return commit(state, { ...state, phase: 'finished', result }, { operation: 'chooseEnding', id }, { action: 'chooseEnding', title: ending.title }, command.commandId);
  }
  // NPC 聊天预检（只读）：界面发消息前 fail-fast 用，与命令内的检查同一套规则。
  // 返回本次将消耗的精力/时间，以及该身份本学期是否还有收益与学业指点名额。
  function npcChatAvailability(state, identityId) {
    if (!own(NPC_CHAT.identities, identityId)) return { ok: false, reason: '这位路人不认识，聊不上', state };
    if (isSick(state)) return { ok: false, reason: ILLNESS_REASON, state };
    if (state.phase !== 'playing') return { ok: false, reason: '现在这个阶段只能闲聊，不消耗资源', state };
    const energy = NPC_CHAT.energyPerMessage;
    if (state.energy < energy) return { ok: false, reason: '精力不够：需要 ' + energy + '，现在剩 ' + state.energy, state };
    const record = (state.npcChats || {})[identityId] || { messages: 0, rewards: 0, preps: 0, timeCharged: false };
    const charged = Object.values(state.npcChats || {}).filter((item) => item && item.timeCharged).length;
    const time = record.messages === 0 && charged < NPC_CHAT.timeChargeCapPerTerm ? NPC_CHAT.timeFirstChatPerIdentity : 0;
    if (state.time < time) return { ok: false, reason: '时间不够：需要 ' + time + '，现在剩 ' + state.time, state };
    return {
      ok: true, reason: '', state, energy, time,
      rewardAvailable: record.rewards < NPC_CHAT.rewardMessagesPerIdentity,
      prepAvailable: NPC_CHAT.academicIdentities.includes(identityId) && record.preps < NPC_CHAT.academicPrepPerIdentity
    };
  }
  // NPC 聊天：效果完全由命令参数（身份 + 对话质量 0/1/2）决定，不消耗随机数，可精确重放。
  // 每条消息扣精力；学期内每身份首条消息扣时间（整学期有上限）；质量>0 且未超收益次数时加社交/心情；
  // 学业身份（学长/学姐/任课老师/教授）另有学习进度加成，计入平时分（期末按 40% 结算）。
  // 收益名额用尽后仍可闲聊（照扣精力、写历史）；不触发校园事件调度。
  function chatWithNpc(state, payload, options = {}) {
    const identityId = payload && typeof payload === 'object' ? payload.identityId : undefined;
    const command = commandCheck(state, options, 'chatWithNpc:' + identityId);
    if (!command.ok) return command;
    const quality = payload && typeof payload === 'object' ? payload.quality : undefined;
    if (!own(NPC_CHAT.identities, identityId) || !Number.isSafeInteger(quality) || quality < 0 || quality > 2) return { ok: false, reason: '无效的聊天参数', state };
    const check = npcChatAvailability(state, identityId);
    if (!check.ok) return check;
    const record = (state.npcChats || {})[identityId] || { messages: 0, rewards: 0, preps: 0, timeCharged: false };
    const effect = { energy: check.energy, time: check.time };
    const reward = check.rewardAvailable && quality > 0;
    if (reward) Object.assign(effect, NPC_CHAT.qualityEffects[quality]);
    if (reward && check.prepAvailable) effect.preparation = NPC_CHAT.academicPrep[quality];
    const changes = previewChanges(state, effect);
    // 只有真正到账的收益才占用名额：属性已满时不会白白消耗次数。
    const prepGained = changes.preparation > 0;
    const gained = prepGained || changes.social > 0 || changes.mood > 0;
    const nextRecord = { messages: record.messages + 1, rewards: record.rewards + (gained ? 1 : 0), preps: record.preps + (prepGained ? 1 : 0), timeCharged: record.timeCharged || check.time > 0 };
    const next = { ...applyChanges(state, changes), npcChats: { ...(state.npcChats || {}), [identityId]: nextRecord } };
    return commit(state, next, { operation: 'chatWithNpc', identityId, quality }, { action: 'chatWithNpc', identity: '和' + NPC_CHAT.identities[identityId] + '聊天', changes, quality }, command.commandId);
  }
  function getRelationships(state) { return relationships.read(state); }
  function companionAvailability(state, actionId, investment) {
    if (!state || state.phase !== 'playing') return { ok: false, reason: '请先完成当前事件、考试或学期流程' };
    if (activeMilitary(state)) return { ok: false, reason: '请先完成军训汇演' };
    if (!relationships.ACTIVITIES[actionId]) return { ok: false, reason: '这个活动暂时不能安排同行' };
    const relation = relationships.read(state);
    if (!relation.zhouNing) return { ok: false, reason: '先在图书馆认识周宁，再约他一起出发' };
    if (relation.interactions >= 4 && actionId !== 'treatment') return { ok: false, reason: '这学期的四次同行已经安排完，仍可以坐下来聊聊天' };
    const current = relationships.life(state);
    if (current.energy < relationships.ACTIVITIES[actionId].effort) return { ok: false, reason: '周宁有点累，想先散步或休息一会儿' };
    const check = availability(state, actionId, investment);
    if (!check.ok && check.reason === '这项行动的收益已经到头了' && relationships.ACTIVITIES[actionId].recovery && current.energy < 100) {
      const profile = getActionInvestment(state, actionId);
      const preview = profile && previewActionInvestment(state, actionId, investment);
      return resourceCheck(state, preview?.effect || fitnessAdjustedEffect(state, getAction(state, actionId), actionId));
    }
    return check;
  }
  function zhouNingAvailability(state, type, investment, characterVersion = 0) {
    if (!state || state.phase !== 'playing') return { ok: false, reason: '请先完成当前事件、考试或学期流程' };
    if (activeMilitary(state)) return { ok: false, reason: '请先完成军训汇演' };
    if (isSick(state)) return { ok: false, reason: ILLNESS_REASON };
    const relation = relationships.read(state);
    const person = relation.zhouNing;
    if (!person) return { ok: false, reason: '先去图书馆自习，认识周宁' };
    if (type === 'talk') {
      if (relation.talks >= 2 || relation.talkGrowth >= 8) return { ok: false, reason: '这学期已经认真聊过两次，下学期再分享新近况吧' };
      return resourceCheck(state, { energy: 2 });
    }
    if (!['study', 'presentation'].includes(type)) return { ok: false, reason: '未知人物互动' };
    if (type === 'presentation' && person.presentation) return { ok: false, reason: '你们已经完成这次课程展示练习，经历已保留' };
    if (relation.interactions >= (characterVersion === 2 || person.life ? 4 : 2)) return { ok: false, reason: characterVersion === 2 || person.life ? '这学期的四次同行已经安排完，下学期再约吧' : '这学期与周宁的两次正式互动已经安排完了' };
    if (type === 'study') return availability(state, 'selfStudy', investment);
    const shared = person.studies > 0 || Object.values(person.life?.activities || {}).some(count => count > 0);
    if (person.familiarity < 30 || !shared) return { ok: false, reason: characterVersion === 2 || person.life ? '相识度达到 30，并共同参加过活动后，周宁会向你说起这件事' : '相识度达到 30，并且至少一起学习过一次后开放' };
    if (state.eventFlags[instanceFor(state, 'zhouNingPresentation').instanceId]) return { ok: false, reason: '这学期已暂缓这次练习，下学期可重新安排' };
    return { ok: true, reason: '' };
  }
  function interactWithZhouNing(state, type, options = {}) {
    const command = commandCheck(state, options, 'zhouNing:' + type);
    if (!command.ok) return command;
    if (!['talk', 'presentation'].includes(type)) return { ok: false, reason: '请选择聊天或人物事件，共同学习从自习行动结算', state };
    const characterVersion = options.characterVersion || 0;
    if (![0, 2].includes(characterVersion)) return { ok: false, reason: '人物规则版本无效', state };
    const check = zhouNingAvailability(state, type, undefined, characterVersion);
    if (!check.ok) return { ...check, state };
    if (type === 'presentation') {
      const relation = relationships.read(state);
      const next = { ...state, phase: 'eventPending', pendingEvent: instanceFor(state, 'zhouNingPresentation'), ...(characterVersion === 2 ? { relationships: { ...relation, zhouNing: { ...relation.zhouNing, life: relationships.life(state) } } } : {}) };
      return commit(state, next, { operation: 'interactWithZhouNing', id: type, ...(characterVersion ? { characterVersion } : {}) }, { action: 'zhouNing', title: '周宁邀请你陪他练习课程展示', changes: previewChanges(state, {}) }, command.commandId);
    }
    const relation = relationships.read(state);
    const growth = Math.min(8 - relation.talkGrowth, 4 + relationships.socialBonus(state));
    const person = relationships.grow(relation.zhouNing, growth);
    if (characterVersion === 2) {
      const current = relationships.life(state);
      person.life = { ...current, mood: Math.min(100, current.mood + 3), energy: Math.max(0, current.energy - 2) };
    }
    const changes = previewChanges(state, { energy: 2, social: 1, mood: 2 });
    const next = { ...applyChanges(state, changes), relationships: { ...relation, talks: relation.talks + 1, talkGrowth: relation.talkGrowth + growth, zhouNing: person } };
    const relationship = { characterId: 'zhouNing', kind: 'talk', gained: person.familiarity - relation.zhouNing.familiarity, familiarity: person.familiarity, description: characterVersion === 2 ? relationships.dialogue(next, relation.talks ? 'goal' : 'care') : relationships.greeting(next) };
    return commit(state, next, { operation: 'interactWithZhouNing', id: type, ...(characterVersion ? { characterVersion } : {}) }, { action: 'zhouNing', title: characterVersion === 2 ? '与周宁聊聊近况' : '与周宁交流学习近况', changes, relationship }, command.commandId);
  }
  function withAgent(state, agent) {
    const relation = relationships.read(state);
    return { ...state, relationships: { ...relation, zhouNing: { ...relation.zhouNing, life: relationships.life(state), agent } } };
  }
  function withAbilities(state) {
    const relation = relationships.read(state);
    return { ...state, relationships: { ...relation, zhouNing: { ...relation.zhouNing, abilities: relationships.abilities(state) } } };
  }
  function rememberAgentActivity(state, next, id) {
    if (!relationships.read(state).zhouNing?.agent) return next;
    const saved = characterAgent.read(state);
    return withAgent(next, { ...saved, proposal: saved.proposal?.id === id ? null : saved.proposal,
      lastInviteAction: saved.proposal?.id === id ? characterAgent.actionCount(state) + 1 : saved.lastInviteAction,
      messages: [...saved.messages, { role: 'assistant', content: relationships.afterActivity(id), term: state.term }].slice(-12) });
  }
  function zhouNingCandidates(state) {
    if (!state || !relationships.read(state).zhouNing) return [];
    const result = Object.entries(relationships.ACTIVITIES).filter(([id]) => companionAvailability(state, id).ok).map(([id, item]) => ({ id, label: item.label }));
    if (zhouNingAvailability(state, 'presentation', undefined, 2).ok) result.push({ id: 'presentation', label: '陪周宁练习课程展示' });
    return result;
  }
  function zhouNingOpportunity(state) {
    if (!state || isSick(state) || activeMilitary(state) || !selectedCoursesOf(state).length) return null;
    return characterAgent.opportunity(state, zhouNingCandidates(state));
  }
  function recordZhouNingDialogue(state, payload, options = {}) {
    const check = commandCheck(state, options, 'zhouDialogue');
    if (!check.ok) return check;
    const bad = reason => ({ ok: false, reason, state });
    if (!relationships.read(state).zhouNing || !payload || !['chat', 'proactive', 'cameo'].includes(payload.kind) || !['online', 'local'].includes(payload.source)
        || typeof payload.say !== 'string' || !payload.say.trim() || payload.say.length > 180 || typeof payload.text !== 'string' || payload.text.length > 240 || typeof payload.intent !== 'string') return bad('人物对话格式无效');
    const saved = characterAgent.read(state);
    if (payload.kind === 'chat' && (!payload.text.trim() || !['playing', 'eventPending', 'examPending', 'summary', 'endingChoice'].includes(state.phase))) return bad('现在不能继续这段对话');
    if (payload.kind === 'chat' && saved.chats >= 120) return bad('这学期已经聊了很久，先去经历一些新的校园生活吧');
    const opportunity = payload.kind === 'chat' ? null : zhouNingOpportunity(state);
    if (payload.kind !== 'chat' && (!opportunity || opportunity.kind !== payload.kind || opportunity.key !== payload.trigger || payload.text !== '')) return bad('这次相遇的时机已经过去');
    const candidates = opportunity ? opportunity.candidates : zhouNingCandidates(state);
    if (payload.intent !== 'none' && !candidates.some(item => item.id === payload.intent)) return bad('周宁提出的安排现在不可用');
    let agent = { ...saved, messages: [...saved.messages, ...(payload.text ? [{ role: 'user', content: payload.text, term: state.term }] : []), { role: 'assistant', content: payload.say, term: state.term }].slice(-12) };
    if (payload.kind === 'chat') agent.chats++;
    else agent = { ...agent, checked: [...agent.checked, payload.trigger], invitations: agent.invitations + (payload.kind === 'cameo' || payload.intent !== 'none' ? 1 : 0), lastInviteAction: characterAgent.actionCount(state) };
    if (payload.intent !== 'none') agent.proposal = { id: payload.intent, createdRevision: state.revision + 1, term: state.term };
    if (payload.kind === 'cameo') agent.cameo = { instanceId: state.pendingEvent.instanceId, eventId: state.pendingEvent.id, say: payload.say };
    let next = withAgent(state, agent);
    const relation = relationships.read(next);
    const subject = payload.kind === 'chat' ? characterAgent.topic(payload.text) : null;
    if (subject) {
      agent = { ...agent, notes: [...(agent.notes || []).filter(item => item.topic !== subject), { topic: subject, text: payload.text, term: state.term }].slice(-4) };
      next = withAgent(next, agent);
    }
    const gained = state.phase === 'playing' && subject && !agent.topics.includes(subject) ? Math.min(2, 8 - relation.talkGrowth) : 0;
    if (gained > 0) {
      agent = { ...agent, topics: [...agent.topics, subject] };
      next.relationships = { ...next.relationships, talkGrowth: relation.talkGrowth + gained, zhouNing: { ...relationships.grow(next.relationships.zhouNing, gained), agent } };
    }
    const data = { kind: payload.kind, text: payload.text, say: payload.say, intent: payload.intent, source: payload.source, ...(payload.trigger ? { trigger: payload.trigger } : {}) };
    return commit(state, next, { operation: 'recordZhouNingDialogue', data }, { action: 'zhouDialogue', title: payload.kind === 'chat' ? '与周宁交谈' : payload.kind === 'cameo' ? '在校园事件中遇见周宁' : '周宁主动联系了你', changes: previewChanges(state, {}), dialogue: { ...data, gained } }, check.commandId);
  }
  function resolveZhouNingProposal(state, answer, options = {}) {
    const check = commandCheck(state, options, 'zhouProposal');
    if (!check.ok) return check;
    const saved = characterAgent.read(state);
    const proposal = saved.proposal;
    if (!proposal || proposal.term !== state.term || !['accept', 'decline'].includes(answer) || options.proposalRevision !== proposal.createdRevision) return { ok: false, reason: '这个邀请已更新，请重新查看', state };
    if (options.npcSupportVersion !== undefined && options.npcSupportVersion !== 1 && options.npcSupportVersion !== 0) return { ok: false, reason: '人物辅助规则版本无效', state };
    const command = { operation: 'resolveZhouNingProposal', id: answer, proposalRevision: proposal.createdRevision, ...(options.npcSupportVersion ? { npcSupportVersion: 1 } : {}) };
    if (answer === 'decline') {
      const say = '好，今天就按你的安排来。等我们都有空了再约，别有压力。';
      const next = withAgent(state, { ...saved, proposal: null, lastInviteAction: characterAgent.actionCount(state), messages: [...saved.messages, { role: 'user', content: '今天先不了，改天吧。', term: state.term }, { role: 'assistant', content: say, term: state.term }].slice(-12) });
      return commit(state, next, command, { action: 'zhouDialogue', title: '暂缓周宁的邀请', changes: previewChanges(state, {}), dialogue: { kind: 'decline', say, gained: 0 } }, check.commandId);
    }
    if (proposal.id === 'basketball') return { ok: false, reason: '请先进入球场，完成真实投篮后再结算', state };
    const result = proposal.id === 'presentation'
      ? interactWithZhouNing(state, 'presentation', { ...options, characterVersion: 2 })
      : executeAction(state, proposal.id, { ...options, companionId: 'zhouNing', relationshipVersion: 1, characterVersion: 2 });
    if (!result.ok) return result;
    const next = withAgent(result.state, { ...saved, proposal: null, messages: [...saved.messages, { role: 'user', content: '好，就这样安排。', term: state.term }, { role: 'assistant', content: proposal.id === 'presentation' ? '谢谢你愿意听我讲，我把准备的内容拿出来。' : relationships.afterActivity(proposal.id), term: state.term }].slice(-12) });
    if (result.entry.investment) command.investment = result.entry.investment.amount;
    return commit(state, next, command, result.entry, check.commandId);
  }
  function validateState(state) {
    const validator = typeof module !== 'undefined' && module.exports ? require('./state-validation.js') : root.CampusStateValidation;
    return validator.validate(state, api, random);
  }
  function replay({ nickname, seed, commands }) {
    let state = createGame({ nickname, seed });
    for (const [index, command] of commands.entries()) {
      const args = { commandId: command.commandId || 'replay:' + index, expectedRevision: state.revision, eventInstanceId: command.eventInstanceId, investment: command.investment, relationshipVersion: command.relationshipVersion || 0, companionId: command.companionId, characterVersion: command.characterVersion || 0, proposalRevision: command.proposalRevision, agentProposalRevision: command.agentProposalRevision, zhouCameo: command.zhouCameo, npcSupportVersion: command.npcSupportVersion || 0 };
      const handlers = { executeAction: () => executeAction(state, command.id, args), completeBasketball: () => completeBasketball(state, command.hits, args), submitEventChoice: () => submitEventChoice(state, command.id, args), selectCourses: () => selectCourses(state, command.id, args), beginExam: () => beginExam(state, args), updateExamAnswers: () => updateExamAnswers(state, command.id, args), submitExam: () => submitExam(state, command.id, args), cheatExam: () => cheatExam(state, args), endTerm: () => endTerm(state, args), continueGame: () => continueGame(state, args), chooseEnding: () => chooseEnding(state, command.id, args), chatWithNpc: () => chatWithNpc(state, { identityId: command.identityId, quality: command.quality }, args) };
      handlers.interactWithZhouNing = () => interactWithZhouNing(state, command.id, args);
      handlers.recordZhouNingDialogue = () => recordZhouNingDialogue(state, command.data, args);
      handlers.resolveZhouNingProposal = () => resolveZhouNingProposal(state, command.id, args);
      if (!own(handlers, command.operation)) return { ok: false, reason: '第 ' + (index + 1) + ' 步操作未知', state };
      const result = handlers[command.operation]();
      if (!result.ok) return { ...result, reason: '第 ' + (index + 1) + ' 步：' + result.reason };
      state = result.state;
    }
    return { ok: true, state };
  }
  const api = { RULES, FITNESS_TIERS, BASKETBALL, fitnessTier, isSick, fitnessAdjustedEffect, ILLNESS_REASON, SICK_LEAVE_ID, TERM_NAMES, BACKGROUNDS, PLACES, ACTIONS, ACTION_INVESTMENTS, EVENTS, EVENT_INVESTMENTS, LEGACY_INVESTMENTS, ENDINGS, TERMINAL_ENDINGS, CHAIN_NAMES, RANDOM_POOL, CAMPUS_SCHEDULE, AI_CHAT, NPC_CHAT, COURSES, SUBJECTS, QUESTIONS, LEGACY_QUESTIONS, courseById, coursesForTerm, generateExam, ratingFor, gradeFor, createGame, validateNickname, getAction, getActionInvestment, previewActionInvestment, getEventInvestment, previewEventInvestment, averageGrade, basketballReward, availability, previewChanges, executeAction, completeBasketball, eventAvailability, submitEventChoice, previewSettlement, selectCourses, beginExam, updateExamAnswers, submitExam, cheatExam, endTerm, continueGame, evaluateEndings, chooseEnding, npcChatAvailability, chatWithNpc, validateState, stateBrief, replay, getTermStage, resumeRequiredEvents };
  Object.assign(api, { getRelationships, companionAvailability, zhouNingAvailability, interactWithZhouNing, relationshipRules: relationships, characterAgent, zhouNingCandidates, zhouNingOpportunity, recordZhouNingDialogue, resolveZhouNingProposal, npcSupport });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CampusGame = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
