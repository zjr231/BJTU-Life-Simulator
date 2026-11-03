(function (root) {
  'use strict';
  const config = typeof module !== 'undefined' && module.exports ? require('./config.js') : root.CampusConfig;
  const random = typeof module !== 'undefined' && module.exports ? require('./rng.js') : root.CampusRandom;
  const courses = typeof module !== 'undefined' && module.exports ? require('./courses.js') : root.CampusCourses;
  const { RULES, FAMILIES, ACTION_EXTRAS, BUDGET_DIMENSIONS, DEFAULT_BUDGET, FITNESS_TIERS, TERM_NAMES, BACKGROUNDS, PLACES, ACTIONS, ACTION_INVESTMENTS, EVENTS, EVENT_INVESTMENTS, LEGACY_INVESTMENTS, ENDINGS, TERMINAL_ENDINGS, RANDOM_POOL, CAMPUS_SCHEDULE, RANDOM_CONTEXTS, AI_CHAT, NPC_CHAT, ADVISORIES, RESUME, COMPANIES, POSITIONS } = config;
  const { COURSES, SUBJECTS, QUESTIONS, LEGACY_QUESTIONS, courseById, coursesForTerm, generateExam, ratingFor, gradeFor } = courses;
  const CHAIN_NAMES = { project: '项目', club: '社团', internship: '实习' };
  const REQUIREMENT_LABELS = { project: '项目', contest: '竞赛', internship: '前段实习', club: '社团' };
  // 多段实习的间隔：上一段结束后再等几个学期才能申下一段。
  // 取 1（下一学期即可再申）：事件按学期去重，同一学期无法再弹一次实习邀请；
  // 且一学期做完两段实习在时间上也不现实。
  const REAPPLY_GAP = 1;
  const TIER_LABELS = { 1: 'T1 起步', 2: 'T2 进阶', 3: 'T3 顶配' };
  const own = (object, key) => typeof key === 'string' && Object.hasOwn(object, key);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const clamp = (value, max) => Math.max(0, Math.min(max, value));
  const selectedCoursesOf = (state) => Array.isArray(state.selectedCourses) ? state.selectedCourses : [];
  // Health actions are exempt from fitness-tier scaling; sickness is derived from fitness.
  const HEALTH_ACTIONS = new Set(['exercise', 'gym', 'teamSport', 'soloSport', 'walk', 'rest', 'checkup', 'sickVisit', 'treatment']);
  const ILLNESS_REASON = '身体不适，先去校医院就诊';
  const SICK_LEAVE_ID = 'sickLeave';
  const REWARD_KEYS = ['preparation', 'social', 'mood', 'fitness', 'furtherStudy', 'jobPreparation'];
  const COST_KEYS = ['energy', 'fitnessCost'];
  function familyForSeed(seed) {
    // A separate stream keeps college, courses and existing event RNG unchanged.
    const roll = random.draw(random.create(String(seed) + ':family-budget-v1')).number * FAMILIES.reduce((sum, item) => sum + item.weight, 0);
    let total = 0;
    return FAMILIES.find(item => (total += item.weight) > roll) || FAMILIES.at(-1);
  }
  function startEconomyTerm(state) {
    let economy = state.economy || { version: 2, familyId: familyForSeed(state.rng.seed).id, startTerm: state.term, grants: [] };
    if (economy.grants.some(item => item.term === state.term)) return state;
    if (economy.version === 1) economy = { ...economy, version: 2 };
    const family = FAMILIES.find(item => item.id === economy.familyId);
    const allowance = family.termAllowance;
    const defaultPlan = budgetPlan(DEFAULT_BUDGET);
    const livingCost = defaultPlan.costs.total;
    const debtPaid = Math.min(state.cardDebt || 0, allowance - livingCost);
    const grant = {
      term: state.term, openingMoney: state.money, allowance, livingCost, debtPaid,
      moneyAfter: state.money + allowance - livingCost - debtPaid,
      budget: { ...DEFAULT_BUDGET }, budgetCosts: { ...defaultPlan.costs },
      budgetEffects: { mood: 0, social: 0, energy: 0, fitness: 0 },
      budgetModifiers: { restMultiplier: 1, dormMood: 0, dormSocial: 0 },
      budgetDelta: 0, budgetChosen: false
    };
    return { ...state, money: grant.moneyAfter, cardDebt: (state.cardDebt || 0) - debtPaid, economy: { ...economy, grants: [...economy.grants, grant] } };
  }
  function budgetFor(state) {
    if (!state.economy) return null;
    return { family: FAMILIES.find(item => item.id === state.economy.familyId), grant: state.economy.grants.find(item => item.term === state.term) };
  }
  function budgetPlan(selection) {
    if (!selection || typeof selection !== 'object' || Array.isArray(selection)) return null;
    const keys = Object.keys(BUDGET_DIMENSIONS);
    if (Object.keys(selection).length !== keys.length) return null;
    const items = {};
    const costs = {};
    const effects = { mood: 0, social: 0, energy: 0, fitness: 0 };
    let total = 0;
    for (const key of keys) {
      const dimension = BUDGET_DIMENSIONS[key];
      const tierId = selection[key];
      if (typeof tierId !== 'string') return null;
      const tier = dimension.tiers.find(item => item.id === tierId);
      if (!tier) return null;
      items[key] = tier;
      costs[key] = tier.cost;
      total += tier.cost;
      for (const [attribute, amount] of Object.entries(tier.effects || {})) {
        if (!own(effects, attribute)) return null;
        effects[attribute] += amount;
      }
    }
    costs.total = total;
    const housing = items.housing;
    return {
      selection: { ...selection }, items, costs, effects,
      modifiers: { restMultiplier: housing.restMultiplier || 1, dormMood: housing.dormMood || 0, dormSocial: housing.dormSocial || 0 },
      housing
    };
  }
  function currentGrant(state) {
    return state.economy?.grants.find(grant => grant.term === state.term) || null;
  }
  function activeBudget(state) {
    const grant = currentGrant(state);
    return grant && grant.budget && grant.budgetChosen === true ? budgetPlan(grant.budget) : null;
  }
  function housingFor(state) {
    const plan = activeBudget(state);
    return plan ? plan.housing : null;
  }
  function applyDormEventBonus(state, eventId, effect) {
    const plan = activeBudget(state);
    if (!plan || !BUDGET_DIMENSIONS.housing.dormEvents.includes(eventId)) return effect;
    const adjusted = { ...effect };
    if ((adjusted.mood || 0) > 0) adjusted.mood += plan.modifiers.dormMood;
    if ((adjusted.social || 0) > 0) adjusted.social += plan.modifiers.dormSocial;
    return adjusted;
  }
  function applyHousingActionEffect(state, id, effect) {
    const plan = activeBudget(state);
    if (!plan || id !== 'chat') return effect;
    const adjusted = { ...effect };
    if ((adjusted.social || 0) > 0) adjusted.social += plan.modifiers.dormSocial;
    if ((adjusted.mood || 0) > 0) adjusted.mood += plan.modifiers.dormMood;
    return adjusted;
  }
  function placeFor(state, key) {
    if (!own(PLACES, key)) return null;
    const place = { ...PLACES[key] };
    if (key === 'dorm') {
      const housing = housingFor(state);
      if (housing && housing.placeDescription) place.description = housing.placeDescription;
    }
    return place;
  }
  function placeDescription(state, key) {
    const place = placeFor(state, key);
    return place ? place.description : '';
  }
  function fitnessTier(stateOrValue) {
    const value = typeof stateOrValue === 'number' ? stateOrValue : stateOrValue.fitness;
    return FITNESS_TIERS.find(tier => value >= tier.min && value <= tier.max) || FITNESS_TIERS[0];
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
    const state = {
      version: RULES.version, rulesVersion: RULES.version, saveFormatVersion: RULES.saveFormatVersion, appVersion: RULES.appVersion,
      nickname: nickname.value, background: { id: background.id, college: background.college, major: background.majors[Math.floor(second.number * background.majors.length)] }, rng: second.rng,
      term: 1, phase: 'playing', revision: 0, processedCommands: [], time: RULES.time, energy: RULES.energy, money: RULES.initialMoney,
      social: RULES.initialSocial, fitness: RULES.initialFitness, mood: RULES.initialMood, preparation: 0, furtherStudy: 0, jobPreparation: 0,
      counts: {}, courses: [], selectedCourses: [], exam: null, history: [], summary: null, pendingEvent: null, eventQueue: [], eventFlags: {}, eventHistory: [], experiences: [], chains, endingOptions: null, result: null, npcChats: {}
    };
    return options.legacyEconomy ? state : startEconomyTerm({ ...state, money: 0 });
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
    // 岗位体能偏移：仅实习投入且当前链挂了带 costs 的岗位时生效（如运维 +2/次）。
    if (id === 'internshipWork' && own(POSITIONS, state.chains?.internship?.positionId || '')) {
      const positionCosts = POSITIONS[state.chains.internship.positionId].costs;
      if (positionCosts && positionCosts.fitness) action.fitnessCost = (action.fitnessCost || 0) + positionCosts.fitness;
    }
    return action;
  }
  function averageGrade(state) { return state.courses.length ? state.courses.reduce((sum, item) => sum + item.grade, 0) / state.courses.length : 0; }
  function previewChanges(state, effect) {
    const fitnessBase = state.fitness + (effect.fitness || 0) - (effect.fitnessCost || 0);
    const fitnessTarget = effect.fitnessFloor === undefined ? fitnessBase : Math.max(fitnessBase, effect.fitnessFloor);
    return {
      time: effect.time ? -effect.time : 0, energy: clamp(state.energy - (effect.energy || 0) + (effect.recovery || 0), 100) - state.energy,
      money: (effect.income || 0) - (effect.money || 0) - Math.min(state.cardDebt || 0, effect.income || 0), preparation: clamp(state.preparation + (effect.preparation || 0), 100) - state.preparation,
      social: clamp(state.social + (effect.social || 0), 100) - state.social, fitness: clamp(fitnessTarget, 100) - state.fitness,
      mood: clamp(state.mood + (effect.mood || 0), 100) - state.mood,
      furtherStudy: clamp(state.furtherStudy + (effect.furtherStudy || 0), 100) - state.furtherStudy,
      jobPreparation: clamp(state.jobPreparation + (effect.jobPreparation || 0), 100) - state.jobPreparation
    };
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
    const original = !state.economy && ['work', 'internshipWork'].includes(id) ? LEGACY_INVESTMENTS.actions[id] : ACTION_INVESTMENTS[id];
    const profile = { ...original, rewards: { ...original.rewards }, tiers: original.tiers.map(tier => ({ ...tier })) };
    if (!state.economy) delete profile.fixedIncome;
    // 岗位化实习内容：三档按钮名与日薪按岗位显示（三期）；无岗位的旧链保持通用文案与默认日薪。
    const position = id === 'internshipWork' && own(POSITIONS, state.chains?.internship?.positionId || '') ? POSITIONS[state.chains.internship.positionId] : null;
    if (position) profile.tiers = profile.tiers.map((tier, index) => ({ ...tier, label: position.workPlans[index], income: position.wages[index] }));
    const action = getAction(state, id);
    const discount = original.resource === 'energy' ? ACTIONS[id].energy - action.energy : 0;
    if (discount) {
      for (const key of ['min', 'max', 'default', 'h']) profile[key] = Math.max(1, profile[key] - discount);
      profile.timeEffortOffset = discount;
      for (const tier of profile.tiers) tier.amount = Math.max(1, tier.amount - discount);
    }
    for (const key of Object.keys(profile.rewards)) profile.rewards[key] += 3 * ((action[key] || 0) - (ACTIONS[id][key] || 0));
    const plan = activeBudget(state);
    if (plan && id === 'rest') {
      profile.rewards.recovery *= plan.modifiers.restMultiplier;
      profile.rewards.fitness *= plan.modifiers.restMultiplier;
    }
    return profile;
  }
  function previewActionInvestment(state, id, requestedAmount) {
    const profile = getActionInvestment(state, id);
    if (!profile) return null;
    const amount = requestedAmount === undefined ? profile.default : requestedAmount;
    const check = investmentCheck(profile, amount);
    if (!check.ok) return check;
    const curve = investmentCurve(profile, amount);
    const adjusted = fitnessAdjustedEffect(state, investmentEffect(getAction(state, id), profile, amount, curve.mean, curve.q), id);
    const effect = id === 'chat' ? applyHousingActionEffect(state, id, adjusted) : adjusted;
    return { ok: true, amount, effect, level: investmentLevel(profile, amount) };
  }
  function availability(state, id, requestedAmount, positionId) {
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
      if (action.kind === 'apply') {
        // 多段实习：completed 后隔一学年可再申（nextEligibleTerm 只服务 idle/deferred 路径）。
        const reapply = action.chain === 'internship' && chain.status === 'completed'
          && state.term >= lastExperienceTerm(state, 'internship') + REAPPLY_GAP;
        if (!['idle', 'deferred'].includes(chain.status) && !reapply) {
          // 实习完成后的重复申请给出台阶提示（精确到可再申的学期），而不是笼统的"这条事件链已完成"。
          if (action.chain === 'internship' && chain.status === 'completed') {
            if (positionId !== undefined) return positionAvailability(state, positionId);
            return { ok: false, reason: '第 ' + (lastExperienceTerm(state, 'internship') + REAPPLY_GAP) + ' 学期可再次申请下一段实习' };
          }
          return { ok: false, reason: chain.status === 'completed' ? '这条事件链已完成' : '当前不能再次申请' };
        }
        if (reapply && state.term > action.maxTerm) return { ok: false, reason: '这一轮的申请时间已经过了' };
        if (!reapply && state.term < chain.nextEligibleTerm) return { ok: false, reason: '第 ' + chain.nextEligibleTerm + ' 学期可再次申请' };
      }
      if (action.kind === 'work' && chain.status !== 'active') return { ok: false, reason: '请先申请并接受邀请' };
      // 实习按累计投入判定，达标后仍可继续投入（拿日薪，每学期 limit 2 管阀门）；项目/社团仍是两次投入。
      if (action.kind === 'work' && action.chain !== 'internship' && chain.progress >= 2) return { ok: false, reason: '两次投入都完成了，等成果确认' };
    }
    if (action.kind === 'apply' && id === 'applyInternship' && positionId !== undefined) {
      const position = positionAvailability(state, positionId);
      if (!position.ok) return position;
    }
    if (action.preparation && !action.chain && state.preparation >= 100) return { ok: false, reason: '本学期学习进度已满' };
    const check = resourceCheck(state, action);
    if (!check.ok) return check;
    if (!action.chain && !Object.values(previewChanges(state, action)).some((value) => value > 0)) return { ok: false, reason: '这项行动的收益已经到头了' };
    return { ok: true, reason: '' };
  }
  function getActionExtra(id) {
    return Object.values(ACTION_EXTRAS).find(extra => extra.actions.includes(id)) || null;
  }
  function extraBonuses(state, changes, extra) {
    return Object.fromEntries(Object.entries(extra.bonuses).map(([key, amount]) => [key, Math.max(0, Math.min(amount, 100 - state[key] - changes[key]))]));
  }
  function actionExtraAvailability(state, id, investment, extraId) {
    const baseCheck = availability(state, id, investment);
    if (!baseCheck.ok) return baseCheck;
    const extra = getActionExtra(id);
    if (!extra || extraId !== extra.id) return { ok: false, reason: '这个行动没有这项可选消费' };
    const used = state.history.filter(entry => entry.term === state.term && entry.extra?.id === extra.id && entry.extra.price > 0).length;
    if (used >= extra.limit) return { ok: false, reason: extra.title + '本学期已购买 ' + extra.limit + ' 次' };
    const effect = previewActionInvestment(state, id, investment)?.effect || fitnessAdjustedEffect(state, getAction(state, id), id);
    const check = resourceCheck(state, { ...effect, money: (effect.money || 0) + extra.price });
    if (!check.ok) return check;
    const bonuses = extraBonuses(state, previewChanges(state, effect), extra);
    if (!Object.values(bonuses).some(amount => amount > 0)) return { ok: false, reason: '本次预计已达到属性上限，无需额外购买' };
    return { ok: true, reason: '', extra, used };
  }
  function applyChanges(state, changes, effect = {}) {
    const next = { ...state };
    for (const [key, value] of Object.entries(changes)) next[key] += value;
    const debtPaid = Math.min(state.cardDebt || 0, effect.income || 0);
    if (debtPaid) next.cardDebt = state.cardDebt - debtPaid;
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
  function attachEvents(state, triggerAction) {
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
    if (next.mood < RULES.lowMood) enqueue('roommateCare');
    for (const [id, chain] of Object.entries(next.chains)) {
      if (triggerAction === 'apply' + id[0].toUpperCase() + id.slice(1)) enqueue(id + 'Offer');
      // 实习：累计投入达到岗位门槛时弹「十字路口」（只弹一次，continue 后 milestoneSeen 挡住）。
      if (id === 'internship') {
        if (next.chains.internship.status === 'active' && !chain.milestoneSeen && internshipRequirementMet(next)) enqueue('internshipMilestone');
      } else if (chain.status === 'active' && chain.progress === 2 && next.term >= chain.reviewAfter && (id === 'club' || next.term > chain.startedTerm)) {
        enqueue(id + 'Review');
      }
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
    const check = availability(state, id, options.investment, options.positionId);
    if (!check.ok) return { ...check, state };
    if (id === 'applyInternship' && !own(POSITIONS, options.positionId || '')) return { ok: false, reason: '请先在岗位库中选择一个岗位', state };
    let extra;
    if (options.extra !== undefined) {
      const extraCheck = actionExtraAvailability(state, id, options.investment, options.extra);
      if (!extraCheck.ok) return { ...extraCheck, state };
      extra = extraCheck.extra;
    }
    const profile = getActionInvestment(state, id);
    let action = getAction(state, id);
    let rng = state.rng;
    let investment;
    if (profile) {
      const preview = previewActionInvestment(state, id, options.investment);
      const curve = investmentCurve(profile, preview.amount);
      const drawn = random.draw(state.rng);
      rng = drawn.rng;
      const factor = curve.factor(drawn.number);
      action = fitnessAdjustedEffect(state, investmentEffect(action, profile, preview.amount, factor, curve.q), id);
      investment = describeInvestment(profile, preview, factor, curve.mean, action);
    } else {
      action = fitnessAdjustedEffect(state, action, id);
    }
    if (id === 'chat') action = applyHousingActionEffect(state, id, action);
    const changes = previewChanges(state, action);
    let extraRecord;
    if (extra) {
      // Apply a small absolute bonus after fitness scaling; never amplify it again.
      const bonuses = extraBonuses(state, changes, extra);
      const purchased = Object.values(bonuses).some(amount => amount > 0);
      const price = purchased ? extra.price : 0;
      changes.money -= price;
      for (const [key, amount] of Object.entries(bonuses)) changes[key] += amount;
      extraRecord = { id: extra.id, title: extra.title, price, bonuses, skipped: !purchased };
    }
    let next = { ...applyChanges(state, changes, action), rng, counts: { ...state.counts, [id]: (state.counts[id] || 0) + 1 } };
    if (action.kind === 'work') {
      const previous = state.chains[action.chain];
      // 实习累计「档位名义投入」（时间取档位固定耗时、精力取玩家选择的档位量）。
      // 不用缩放后的实际扣减：体能越好扣得越少，会导致投入越多反而越难达标，语义反了。
      const spentEnergy = investment ? investment.amount : (action.energy || 0);
      next.chains = action.chain === 'internship'
        ? { ...state.chains, internship: { ...previous, workTime: (previous.workTime || 0) + (action.time || 0), workEnergy: (previous.workEnergy || 0) + spentEnergy } }
        : { ...state.chains, [action.chain]: { ...previous, progress: previous.progress + 1 } };
    }
    if (action.kind === 'apply' && id === 'applyInternship') next.chains = { ...next.chains, internship: { ...next.chains.internship, positionId: options.positionId } };
    next = attachEvents(next, id);
    const cardDebtPaid = Math.min(state.cardDebt || 0, action.income || 0);
    return commit(state, next, { operation: 'executeAction', id, ...(investment ? { investment: investment.amount } : {}), ...(extra ? { extra: extra.id } : {}), ...(id === 'applyInternship' && options.positionId ? { positionId: options.positionId } : {}) }, { action: id, title: action.title, changes, ...(extraRecord ? { extra: extraRecord } : {}), ...(cardDebtPaid ? { cardDebtPaid } : {}), fitnessCost: action.fitnessCost || 0, ...(investment ? { investment } : {}), ...(id === 'applyInternship' && options.positionId ? { position: { id: options.positionId, title: POSITIONS[options.positionId].title } } : {}) }, command.commandId);
  }
  function getEventInvestment(state, choiceId) {
    if (!state.pendingEvent) return null;
    const key = state.pendingEvent.id + ':' + choiceId;
    return (!state.economy && key === 'graduation:photos' ? LEGACY_INVESTMENTS.events[key] : EVENT_INVESTMENTS[key]) || null;
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
    if (profile.fixedIncome) effect.income = profile.tiers.find(tier => tier.amount === amount).income;
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
    const eventId = state.pendingEvent.id;
    const effect = applyDormEventBonus(state, eventId, fitnessAdjustedEffect(state, investmentEffect(choice, profile, amount, curve.mean, curve.q), null));
    return { ok: true, amount, effect, average: previewChanges(state, effect),
      low: previewChanges(state, applyDormEventBonus(state, eventId, fitnessAdjustedEffect(state, investmentEffect(choice, profile, amount, curve.factor(0.1), curve.q), null))),
      high: previewChanges(state, applyDormEventBonus(state, eventId, fitnessAdjustedEffect(state, investmentEffect(choice, profile, amount, curve.factor(0.9), curve.q), null))),
      level: investmentLevel(profile, amount) };
  }
  function describeInvestment(profile, preview, factor, mean, adjustedEffect) {
    const ratio = factor / mean;
    const outcome = ratio < 0.55 ? 'setback' : preview.level === 'light'
      ? (ratio >= 1.2 ? 'surprise' : 'limited') : ratio >= 1.2 ? 'good' : 'steady';
    const spent = adjustedEffect && adjustedEffect[profile.resource] !== undefined ? adjustedEffect[profile.resource] : preview.amount;
    return { amount: preview.amount, spent, resource: profile.resource, fitnessCost: adjustedEffect ? (adjustedEffect.fitnessCost || 0) : 0, tier: preview.level, level: preview.level, outcome,
      description: profile.plans[{ light: 0, steady: 1, deep: 2 }[preview.level]] + profile.outcomes[outcome] + (profile.fixedIncome ? '固定报酬 ' + adjustedEffect.income + ' 元。' : '') };
  }
  function eventAvailability(state, choiceId, instanceId, requestedAmount) {
    if (state.phase !== 'eventPending' || !state.pendingEvent) return { ok: false, reason: '当前没有待处理事件' };
    if (activeMilitary(state) && state.pendingEvent.id !== 'military2') return { ok: false, reason: '请先完成军训汇演' };
    if (instanceId !== undefined && instanceId !== state.pendingEvent.instanceId) return { ok: false, reason: '事件已更新，请重新选择' };
    if (choiceId === SICK_LEAVE_ID) return isSick(state) ? { ok: true, reason: '' } : { ok: false, reason: '现在不需要去校医院' };
    const event = EVENTS[state.pendingEvent.id];
    const choice = event && event.choices.find((item) => item.id === choiceId);
    if (!choice) return { ok: false, reason: '未知事件选项' };
    if (isSick(state)) return { ok: false, reason: ILLNESS_REASON };
    if (choice.chainEffect === 'postpone' && state.term === 8) return { ok: false, reason: '最后一个学期了，把经历确认了吧' };
    const profile = getEventInvestment(state, choiceId);
    if (!profile && requestedAmount !== undefined) return { ok: false, reason: '这个选项不需要设置投入' };
    const preview = profile && previewEventInvestment(state, choiceId, requestedAmount);
    if (preview && !preview.ok) return preview;
    const fixed = preview ? null : applyDormEventBonus(state, state.pendingEvent.id, fitnessAdjustedEffect(state, choice, null));
    return resourceCheck(state, preview ? preview.effect : fixed);
  }
  function resolveOutcome(state, choice) {
    if (!choice.outcomeBy) return null;
    const metric = choice.outcomeBy.metric === 'average' ? averageGrade(state) : state[choice.outcomeBy.metric];
    return metric >= choice.outcomeBy.threshold ? choice.outcomeBy.pass : choice.outcomeBy.fail;
  }
  function submitEventChoice(state, choiceId, options = {}) {
    const command = commandCheck(state, options, 'event:' + choiceId);
    if (!command.ok) return command;
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
    const outcome = resolveOutcome(state, choice) || {};
    const baseEffect = effect;
    effect = { ...baseEffect, ...outcome };
    for (const key of ['time', 'energy', 'recovery', 'money', 'income', 'preparation', 'social', 'fitness', 'mood', 'furtherStudy', 'jobPreparation']) {
      effect[key] = (baseEffect[key] || 0) + (outcome[key] || 0);
    }
    effect = applyDormEventBonus(state, pending.id, fitnessAdjustedEffect(state, effect, null));
    // 岗位段收入在办证明时一次性结算（不受体能挡位缩放）；无岗位的旧链照旧，仅 mood + 经历。
    // 达标前置：里程碑/旧答辩事件都必须累计投入达标才能结算（旧档 progress≥2 的 grandfather 恒过）。
    let positionReward = null;
    if (event.chain === 'internship' && choice.chainEffect === 'complete') {
      if (!internshipRequirementMet(state)) return { ok: false, reason: '实习投入还没达到证明门槛', state };
      positionReward = internshipCompletionReward(state);
      if (positionReward) {
        effect.income = (effect.income || 0) + positionReward.income;
        effect.jobPreparation = (effect.jobPreparation || 0) + positionReward.jobPreparation;
      }
    }
    if (profile) investment = describeInvestment(profile, investmentPreview, investmentFactor, investmentCurveData.mean, effect);
    const changes = previewChanges(state, effect);
    const cardDebtAdded = choice.restitution ? Math.max(0, choice.money - (effect.money || 0)) : 0;
    const cardDebtPaid = Math.min(state.cardDebt || 0, effect.income || 0);
    const entry = { term: state.term, event: pending.id, instanceId: pending.instanceId, choice: choiceId, title: choice.title, outcome: outcome.title || null, changes, ...(cardDebtAdded ? { cardDebtAdded } : {}), ...(cardDebtPaid ? { cardDebtPaid } : {}), fitnessCost: effect.fitnessCost || 0, ...(investment ? { investment } : {}), ...(positionReward ? { positionReward } : {}) };
    let next = { ...applyChanges(state, changes, effect), rng, pendingEvent: null, phase: 'playing', eventFlags: { ...state.eventFlags, [pending.instanceId]: true }, eventHistory: [...state.eventHistory, entry] };
    if (cardDebtAdded) next.cardDebt = (next.cardDebt || 0) + cardDebtAdded;
    if (event.chain) {
      const chain = { ...state.chains[event.chain] };
      // 里程碑事件选「继续实习」：记下已处理，之后不再重复弹；随时可在实习投入卡手动办证明。
      if (pending.id === 'internshipMilestone') chain.milestoneSeen = true;
      // 新一段实习从零累计：workTime/workEnergy/milestoneSeen 必须重置，否则会继承上一段的进度。
      // 这三个字段只属于实习链（project/club 仍走 progress）。
      if (choice.chainEffect === 'accept') Object.assign(chain, { status: 'active', startedTerm: state.term, deadline: Math.min(8, state.term + 1), progress: 0, reviewAfter: state.term, ...(event.chain === 'internship' ? { workTime: 0, workEnergy: 0, milestoneSeen: false } : {}) });
      if (choice.chainEffect === 'defer') Object.assign(chain, { status: 'deferred', nextEligibleTerm: state.term + 1 });
      if (choice.chainEffect === 'postpone') Object.assign(chain, { reviewAfter: state.term + 1, deadline: Math.min(8, state.term + 1) });
      if (choice.chainEffect === 'complete') chain.status = 'completed';
      if (choice.chainEffect === 'abandon') chain.status = 'missed';
      next.chains = { ...state.chains, [event.chain]: chain };
    }
    const experience = outcome.experience || choice.experience;
    if (experience) next.experiences = [...state.experiences, {
      term: state.term,
      type: experience,
      ...(experience === 'fitnessTest' ? { fitness: state.fitness } : {}),
      // 实习经历记下岗位，简历与后续判定才有"在哪家公司、做什么岗位"可言（旧档无此字段，可选）。
      ...(experience === 'internship' && own(POSITIONS, state.chains.internship.positionId || '') ? { positionId: state.chains.internship.positionId } : {})
    }];
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
    return commit(state, next, { operation: 'submitEventChoice', id: choiceId, eventInstanceId: pending.instanceId, ...(investment ? { investment: investment.amount } : {}) }, entry, command.commandId);
  }
  function eventChoiceEffect(state, choiceId) {
    const pending = state.pendingEvent;
    const event = pending && EVENTS[pending.id];
    const choice = event && event.choices.find(item => item.id === choiceId);
    if (!choice) return null;
    return applyDormEventBonus(state, pending.id, fitnessAdjustedEffect(state, choice, null));
  }
  function settlementChains(state) {
    const chains = clone(state.chains);
    const notices = [];
    // 毕业保底：第 8 学期结算时，已达标的实习不判未完成，而是自动收尾并结算段收入。
    let payout = null;
    for (const [id, chain] of Object.entries(chains)) {
      if (chain.status === 'active' && state.term >= chain.deadline) {
        // 实习按累计投入描述进度，项目/社团仍按 x/2 次投入。
        const progressNote = id === 'internship'
          ? '已累计投入 时间 ' + (chain.workTime || 0) + ' · 精力 ' + (chain.workEnergy || 0)
          : '已有的 ' + chain.progress + '/2 次投入';
        if (state.term === 8 && id === 'internship' && internshipRequirementMet(state)) {
          const reward = internshipCompletionReward(state);
          chain.status = 'completed';
          chain.milestoneSeen = true;
          if (reward) {
            payout = reward;
            notices.push(CHAIN_NAMES[id] + '已在毕业前自动收尾：' + reward.title + ' 段收入 ' + reward.income + ' 元、求职准备 +' + reward.jobPreparation + ' 已结算。');
          } else {
            notices.push(CHAIN_NAMES[id] + '已在毕业前自动收尾，经历写入档案。');
          }
        } else if (state.term === 8) {
          chain.status = 'missed';
          notices.push(CHAIN_NAMES[id] + '未完成，' + progressNote + '保留在档案里。');
        } else {
          chain.deadline = state.term + 1;
          notices.push(CHAIN_NAMES[id] + '延期到第 ' + chain.deadline + ' 学期，' + progressNote + '保留。');
        }
      }
    }
    return { chains, notices, payout };
  }
  function previewSettlement(state, examScore = null) {
    const usualScore = state.preparation;
    const graded = selectedCoursesOf(state).length > 0;
    const score = graded ? (examScore === null ? (state.exam?.score ?? 0) : examScore) : null;
    const grade = graded ? gradeFor(usualScore, score) : Math.round(40 + state.preparation * 0.6);
    const budget = budgetFor(state);
    const aid = budget ? 0 : Math.max(0, RULES.livingCost - state.money);
    const settled = settlementChains(state);
    // 毕业前自动收尾的实习段收入计入本学期结余。
    const settledMoney = (budget ? state.money : state.money + aid - RULES.livingCost) + (settled.payout ? settled.payout.income : 0);
    const summary = { term: state.term, name: TERM_NAMES[state.term - 1], preparation: state.preparation, grade, passed: grade >= 60, livingCost: budget ? budget.grant.livingCost : RULES.livingCost, aid, moneyAfter: settledMoney, unusedTime: state.time, counts: { ...state.counts }, attributes: { social: state.social, fitness: state.fitness, mood: state.mood }, notices: settled.notices, ...(budget ? { economyVersion: budget.grant.budget ? 2 : 1, budget: clone(budget.grant), familyId: budget.family.id } : {}) };
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
    const settled = settlementChains(state);
    let next = { ...state, phase: 'summary', money: summary.moneyAfter, chains: settled.chains, courses: [...state.courses, summary], summary };
    // 毕业前自动收尾的实习：补写经历、求职准备与校园卡还款，与手动办证明同一口径。
    if (settled.payout) {
      next = {
        ...next,
        jobPreparation: clamp(next.jobPreparation + settled.payout.jobPreparation, 100),
        experiences: [...next.experiences, { term: state.term, type: 'internship', positionId: settled.payout.positionId }],
        ...(state.cardDebt ? { cardDebt: Math.max(0, state.cardDebt - settled.payout.income) } : {})
      };
    }
    return commit(state, next, { operation: 'endTerm' }, { action: 'endTerm', title: '学期结算' }, command.commandId);
  }
  function chooseBudget(state, selection, options = {}) {
    const command = commandCheck(state, options, 'chooseBudget');
    if (!command.ok) return command;
    if (state.phase !== 'playing') return { ok: false, reason: '现在不能调整学期预算', state };
    if (selectedCoursesOf(state).length) return { ok: false, reason: '请先完成学期预算，再选课', state };
    const grant = currentGrant(state);
    if (!grant || !state.economy || state.economy.version !== 2 || !grant.budget) return { ok: false, reason: '本学期沿用旧版预算，下一学期开始可选择', state };
    if (grant.budgetChosen) return { ok: false, reason: '本学期预算已经确认', state };
    const plan = budgetPlan(selection);
    if (!plan) return { ok: false, reason: '预算档位无效', state };
    const delta = plan.costs.total - grant.livingCost;
    if (delta > state.money) return { ok: false, reason: '预算需要追加 ' + delta + ' 元，当前可用 ' + state.money + ' 元', state };
    const changes = previewChanges(state, { recovery: plan.effects.energy, mood: plan.effects.mood, social: plan.effects.social, fitness: plan.effects.fitness });
    changes.money = delta === 0 ? 0 : -delta;
    const updatedGrant = {
      ...grant, livingCost: plan.costs.total,
      moneyAfter: grant.openingMoney + grant.allowance - plan.costs.total - grant.debtPaid,
      budget: { ...plan.selection }, budgetCosts: { ...plan.costs }, budgetEffects: { ...plan.effects },
      budgetModifiers: { ...plan.modifiers }, budgetDelta: delta, budgetChosen: true
    };
    let next = applyChanges(state, changes);
    next = { ...next, economy: { ...state.economy, version: 2, grants: state.economy.grants.map(item => item === grant ? updatedGrant : item) } };
    const entry = { action: 'chooseBudget', title: '确认学期预算', budget: { ...plan.selection }, changes };
    return commit(state, next, { operation: 'chooseBudget', id: plan.selection }, entry, command.commandId);
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
  // 实习段结算的唯一取数源：事件路径（里程碑/旧答辩）与 settleInternship 命令共用。
  function internshipCompletionReward(state) {
    const chain = state.chains.internship;
    if (chain.status !== 'active' || !own(POSITIONS, chain.positionId || '')) return null;
    const rewards = POSITIONS[chain.positionId].rewards;
    return { positionId: chain.positionId, title: POSITIONS[chain.positionId].title, income: rewards.income, jobPreparation: rewards.jobPreparation };
  }
  // 手动办实习证明：与里程碑事件的「马上办证明」共用同一结算，达标后才能调用。
  function settleInternship(state, options = {}) {
    const command = commandCheck(state, options, 'settleInternship');
    if (!command.ok) return command;
    if (state.phase !== 'playing') return { ok: false, reason: '现在不能办理实习证明', state };
    const chain = state.chains.internship;
    if (chain.status !== 'active') return { ok: false, reason: '当前没有进行中的实习', state };
    if (!own(POSITIONS, chain.positionId || '')) return { ok: false, reason: '这段实习没有关联岗位', state };
    if (!internshipRequirementMet(state)) return { ok: false, reason: '实习投入还没达到证明门槛', state };
    const reward = internshipCompletionReward(state);
    const effect = { mood: 5, income: reward.income, jobPreparation: reward.jobPreparation };
    const changes = previewChanges(state, effect);
    const cardDebtPaid = Math.min(state.cardDebt || 0, effect.income);
    let next = { ...applyChanges(state, changes, effect), chains: { ...state.chains, internship: { ...chain, status: 'completed', milestoneSeen: true } } };
    next.experiences = [...state.experiences, { term: state.term, type: 'internship', positionId: chain.positionId }];
    next = attachEvents(next, 'settleInternship');
    const entry = { term: state.term, action: 'settleInternship', title: '办理实习证明', changes, ...(cardDebtPaid ? { cardDebtPaid } : {}), fitnessCost: 0, positionReward: reward };
    return commit(state, next, { operation: 'settleInternship', id: null }, entry, command.commandId);
  }
  // 意向锁定：玩家的主观选择，走命令通道（幂等/revision/history/replay 全继承）；null 为取消。
  function setTargetPosition(state, positionId, options = {}) {
    const command = commandCheck(state, options, 'setTargetPosition:' + (positionId === null ? 'null' : positionId));
    if (!command.ok) return command;
    if (!(positionId === null || own(POSITIONS, positionId))) return { ok: false, reason: '未知岗位', state };
    if (state.phase !== 'playing') return { ok: false, reason: '现在不能调整求职意向', state };
    if (state.targetPosition === positionId || (state.targetPosition === undefined && positionId === null)) return { ok: false, reason: '求职意向没有变化', state };
    const next = { ...state, targetPosition: positionId };
    return commit(state, next, { operation: 'setTargetPosition', id: positionId }, { action: 'setTargetPosition', title: positionId ? '锁定求职意向：' + POSITIONS[positionId].title : '取消求职意向', changes: {} }, command.commandId);
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
  // 「手头的事」：只读推导，供界面渲染进行中事件链、待办义务、开放窗口与毕业方向差距。
  // 不消耗随机数、不写状态；门槛数值一律取自 ACTIONS 字段，与行动按钮同一口径。
  function fill(text, values) {
    return text.replace(/\{(\w+)\}/g, (token, key) => (own(values, key) ? String(values[key]) : token));
  }
  function advisories(state) {
    if (['ended', 'finished'].includes(state.phase)) return { groups: [], total: 0, urgentCount: 0 };
    const formatValue = (value) => typeof value === 'number'
      ? (Number.isInteger(value) ? String(value) : value.toFixed(1))
      : (own(ADVISORIES.statusLabels, value) ? ADVISORIES.statusLabels[value] : String(value));
    // 统一条目形状：{ id, title, detail, tag, tagTone, urgent, detailList }
    const entry = (id, template, values, urgent) => ({
      id,
      title: fill(template.title, values),
      detail: fill(template.detail, values),
      tag: fill(template.tag, values),
      tagTone: template.tagTone,
      urgent,
      detailList: []
    });
    const makeGroup = (id) => ({ id, title: ADVISORIES.groupTitles[id], items: [] });
    const chains = makeGroup('chains');
    const duties = makeGroup('duties');
    const windows = makeGroup('windows');
    const directions = makeGroup('directions');
    const settled = makeGroup('settled');
    for (const id of ['project', 'club', 'internship']) {
      const chain = state.chains[id];
      const action = ACTIONS['apply' + id[0].toUpperCase() + id.slice(1)];
      if (chain.status === 'active') {
        const urgent = chain.deadline === 8;
        // 实习链挂岗位时，标题用「公司 · 岗位」，让进行中的实习有身份。
        const position = own(POSITIONS, chain.positionId || '') ? POSITIONS[chain.positionId] : null;
        const name = position ? COMPANIES[position.company].name + ' · ' + position.title : CHAIN_NAMES[id];
        if (id === 'internship') {
          // 实习按累计投入与岗位门槛展示（三期）：达标后提示可办证明。
          const progress = internshipProgress(state);
          const template = progress.met ? ADVISORIES.chains.internshipSettleReady : ADVISORIES.chains.internshipActive;
          chains.items.push(entry('chain:' + id, template, { name, workTime: progress.workTime, workEnergy: progress.workEnergy, reqTime: progress.reqTime, reqEnergy: progress.reqEnergy, deadline: chain.deadline }, urgent));
        } else {
          const template = chain.progress >= 2 ? ADVISORIES.chains.reviewReady : ADVISORIES.chains.active;
          chains.items.push(entry('chain:' + id, template, { name, progress: chain.progress, deadline: chain.deadline }, urgent));
        }
      } else if (chain.status === 'idle' && state.term <= action.maxTerm) {
        const nextAutumn = state.term % 2 === 1 ? state.term : state.term + 1;
        if (action.autumnOnly && nextAutumn > action.maxTerm) continue;
        chains.items.push(entry('chain:' + id, ADVISORIES.chains.idle[id], action, false));
      } else if (chain.status === 'deferred') {
        const stale = chain.nextEligibleTerm > action.maxTerm;
        chains.items.push(entry('chain:' + id, stale ? ADVISORIES.chains.deferredStale : ADVISORIES.chains.deferred, { nextTerm: chain.nextEligibleTerm, maxTerm: action.maxTerm }, false));
      }
      if (chain.status === 'completed' || chain.status === 'missed') {
        // 了结的实习同样保留公司岗位身份（从最后一段经历读，链上的 positionId 可能已被下一段覆盖）。
        const lastRecord = state.experiences.filter((item) => item.type === 'internship' && own(POSITIONS, item.positionId || '')).at(-1);
        const settledPosition = id === 'internship' && lastRecord ? POSITIONS[lastRecord.positionId] : null;
        const settledName = settledPosition ? COMPANIES[settledPosition.company].name + ' · ' + settledPosition.title : CHAIN_NAMES[id];
        settled.items.push(entry('settled:' + id, chain.status === 'completed' ? ADVISORIES.chains.completed : ADVISORIES.chains.missed, { name: settledName }, false));
      }
      // 关闭预警：只对仍来得及申请的链提示（active/已完成的不提示）。
      const lastAutumn = action.autumnOnly ? (action.maxTerm % 2 === 1 ? action.maxTerm : action.maxTerm - 1) : action.maxTerm;
      const applicable = (chain.status === 'idle' && state.term <= action.maxTerm && (!action.autumnOnly || state.term % 2 === 1 || state.term + 1 <= action.maxTerm))
        || (chain.status === 'deferred' && chain.nextEligibleTerm <= action.maxTerm);
      if (applicable && state.term === lastAutumn) windows.items.push(entry('window:' + id + ':closing', ADVISORIES.windows.closingNow, { name: CHAIN_NAMES[id] }, true));
      else if (applicable && !action.autumnOnly && state.term === lastAutumn - 1) windows.items.push(entry('window:' + id + ':closing', ADVISORIES.windows.closingNext, { name: CHAIN_NAMES[id] }, false));
    }
    if (isSick(state)) duties.items.push({ id: 'duty:sick', title: ILLNESS_REASON, detail: '', tag: '紧急', tagTone: 'hot', urgent: true, detailList: [] });
    if (state.eventFlags.fitnessRetest) duties.items.push(entry('duty:fitnessRetest', ADVISORIES.duties.fitnessRetest, {}, false));
    const lastCourse = state.courses.at(-1);
    if (state.term >= 2 && lastCourse && lastCourse.term === state.term - 1 && !lastCourse.passed) duties.items.push(entry('duty:retake', ADVISORIES.duties.retake, {}, false));
    if ((state.cardDebt || 0) > 0) duties.items.push(entry('duty:cardDebt', ADVISORIES.duties.cardDebt, { debt: state.cardDebt }, false));
    if (state.term === ACTIONS.jobPreparation.minTerm - 1) windows.items.push(entry('window:opening', ADVISORIES.windows.opening, { minTerm: ACTIONS.jobPreparation.minTerm }, false));
    for (const option of evaluateEndings(state).options) {
      if (['notQualified', 'delayed'].includes(option.id)) continue;
      const unmet = option.requirements.filter((item) => !item.met);
      directions.items.push({
        id: 'direction:' + option.id,
        title: option.title,
        detail: unmet.length ? '' : ADVISORIES.directions.allMet,
        tag: fill(unmet.length ? ADVISORIES.directions.tagUnmet : ADVISORIES.directions.tagMet, { count: unmet.length }),
        tagTone: unmet.length ? ADVISORIES.directions.tagToneUnmet : ADVISORIES.directions.tagToneMet,
        urgent: false,
        detailList: unmet.map((requirement) => fill(ADVISORIES.directions.unmet, { label: requirement.label, value: formatValue(requirement.value) }))
      });
    }
    // 意向锁定后的目标差距卡：插在四方向之前；gaps 由 positionAvailability 填充。
    if (own(POSITIONS, state.targetPosition || '')) {
      const position = POSITIONS[state.targetPosition];
      const check = positionAvailability(state, state.targetPosition);
      directions.items.unshift({
        id: 'direction:target',
        title: fill(ADVISORIES.targetPosition.title, { title: position.title }),
        detail: check.ok ? ADVISORIES.targetPosition.readyDetail : '',
        tag: check.ok ? ADVISORIES.targetPosition.tagReady : fill(ADVISORIES.targetPosition.tagGap, { count: check.gaps.length }),
        tagTone: check.ok ? ADVISORIES.targetPosition.tagToneReady : ADVISORIES.targetPosition.tagToneGap,
        urgent: false,
        detailList: check.gaps
      });
    }
    const groups = [chains, duties, windows, directions, settled].filter((group) => group.items.length);
    for (const group of groups) group.items.sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0));
    // 角标语义 = 待办 + 方向差距；settled（有了下落的）不计入 total 与 urgentCount。
    const countable = groups.filter((group) => group.id !== 'settled');
    return { groups, total: countable.reduce((sum, group) => sum + group.items.length, 0), urgentCount: countable.reduce((sum, group) => sum + group.items.filter((item) => item.urgent).length, 0) };
  }
  // 我的简历：experiences 的结构化档案视图（只认档案、不认链状态），供「记录」渲染与后续岗位门槛判定。
  // 纯只读；多段就绪——两条同类型经历就是两项，未来多段实习零存档成本。
  function resume(state) {
    const sectionDefs = RESUME.sections;
    const sections = sectionDefs.map((section) => ({ id: section.id, title: section.title, items: [] }));
    const others = [];
    for (const item of state.experiences) {
      const position = own(POSITIONS, item.positionId || '') ? POSITIONS[item.positionId] : null;
      const entry = {
        term: item.term,
        type: item.type,
        ...(position ? { positionId: item.positionId, company: COMPANIES[position.company].name, title: position.title, tier: position.tier } : {})
      };
      const section = sections.find((candidate) => candidate.id === item.type);
      if (section) section.items.push(entry);
      else others.push(entry);
    }
    const count = (id) => sections.find((section) => section.id === id).items.length;
    const requirements = { hasInternship: count('internship') > 0, hasProject: count('project') > 0, hasContest: count('contest') > 0, hasClub: count('club') > 0 };
    return { sections, others, requirements };
  }
  const lastExperienceTerm = (state, type) => state.experiences
    .filter((item) => item.type === type).reduce((max, item) => Math.max(max, item.term), 0);
  // 实习完成门槛（三期）：累计实际投入达到岗位的 workRequirement 才算完成。
  // 旧档兼容：progress ≥ 2 的旧链一律视为已达标（grandfather），之后继续投入也不改变结论。
  function internshipRequirementMet(state) {
    const chain = state.chains.internship;
    if (chain.status !== 'active') return false;
    if (chain.progress >= 2) return true;
    const position = own(POSITIONS, chain.positionId || '') ? POSITIONS[chain.positionId] : null;
    if (!position || chain.workTime === undefined || chain.workEnergy === undefined) return false;
    return chain.workTime >= position.workRequirement.time && chain.workEnergy >= position.workRequirement.energy;
  }
  // 累计投入进度：供投入卡与「手头的事」共用；非进行中的实习返回 null。
  function internshipProgress(state) {
    if (state.chains.internship.status !== 'active') return null;
    const chain = state.chains.internship;
    const position = own(POSITIONS, chain.positionId || '') ? POSITIONS[chain.positionId] : null;
    const requirement = position ? position.workRequirement : null;
    return {
      workTime: chain.workTime || 0,
      workEnergy: chain.workEnergy || 0,
      reqTime: requirement ? requirement.time : 0,
      reqEnergy: requirement ? requirement.energy : 0,
      met: internshipRequirementMet(state)
    };
  }
  // 岗位门槛唯一口径：南门岗位对话框与 executeAction 共用同一判定。纯只读，零随机数。
  // gaps 是填充后的未达标行（供「往哪走」目标差距卡的 detailList），reason 是单句摘要（供 toast/禁用提示）。
  function positionAvailability(state, positionId) {
    if (!own(POSITIONS, positionId)) return { ok: false, reason: '未知岗位', gaps: [] };
    const position = POSITIONS[positionId];
    const rows = ADVISORIES.targetPosition.rows;
    const chain = state.chains.internship;
    if (chain.status === 'active') return { ok: false, reason: rows.chainActive, gaps: [rows.chainActive] };
    if (chain.status === 'missed') return { ok: false, reason: rows.chainMissed, gaps: [rows.chainMissed] };
    if (chain.status === 'completed') {
      const nextTerm = lastExperienceTerm(state, 'internship') + REAPPLY_GAP;
      if (state.term < nextTerm) {
        const gap = fill(rows.reapply, { term: nextTerm });
        return { ok: false, reason: gap, gaps: [gap] };
      }
    }
    if (state.term < position.window[0]) return { ok: false, reason: '第 ' + position.window[0] + ' 学期开始开放', gaps: [fill(rows.windowEarly, { min: position.window[0], term: state.term })] };
    if (state.term > position.window[1]) return { ok: false, reason: '这个岗位的招聘窗口已过', gaps: [fill(rows.windowLate, { max: position.window[1] })] };
    const gaps = [];
    const matched = position.affinity && position.affinity.majors.includes(state.background.major);
    const discounted = matched && position.affinity.gradeDiscount ? position.affinity.gradeDiscount : 0;
    if (position.requires.grade !== undefined) {
      const effectiveGrade = position.requires.grade - discounted;
      const average = averageGrade(state);
      if (average < effectiveGrade) {
        gaps.push(fill(rows.grade, { grade: effectiveGrade, delta: Math.ceil(effectiveGrade - average) }));
        if (discounted) gaps.push(fill(rows.gradeDiscount, { discounted: effectiveGrade }));
        return { ok: false, reason: '平均成绩需达到 ' + effectiveGrade + (discounted ? '（你的专业对口，已降至 ' + effectiveGrade + '）' : ''), gaps };
      }
    }
    const requirementKeys = position.requires.resumeAll || position.requires.resumeAny || [];
    if (requirementKeys.length) {
      const requirements = resume(state).requirements;
      const met = (key) => requirements['has' + key[0].toUpperCase() + key.slice(1)];
      const satisfied = position.requires.resumeAll
        ? (matched && position.affinity.relaxToAny ? requirementKeys.some(met) : requirementKeys.every(met))
        : requirementKeys.some(met);
      if (!satisfied) {
        const labels = requirementKeys.map((key) => REQUIREMENT_LABELS[key]);
        if (position.requires.resumeAny || (matched && position.affinity.relaxToAny)) {
          gaps.push(fill(rows.resumeAny, { labels: labels.join(' / ') }));
          return { ok: false, reason: (position.requires.resumeAll ? '对口专业放宽为：' : '还缺简历要件：') + labels.join(position.requires.resumeAll ? ' 或 ' : ' / ') + '，至少其一', gaps };
        }
        const missing = requirementKeys.filter((key) => !met(key));
        for (const key of missing) gaps.push(fill(rows.resumeMissing, { label: REQUIREMENT_LABELS[key] }));
        return { ok: false, reason: '需要简历要件：' + missing.map((key) => REQUIREMENT_LABELS[key]).join(' 且 '), gaps };
      }
    }
    return { ok: true, reason: '', gaps: [] };
  }
  function continueGame(state, options = {}) {
    const command = commandCheck(state, options, 'continueGame');
    if (!command.ok) return command;
    if (state.phase !== 'summary') return { ok: false, reason: '当前没有待确认的学期总结', state };
    const followingTerm = { ...state, term: state.term + 1, phase: 'playing', time: 12, energy: 80, preparation: 0, counts: {}, summary: null, selectedCourses: [], exam: null, npcChats: {} };
    const next = state.term === 8
      ? { ...state, phase: 'endingChoice', endingOptions: evaluateEndings(state), selectedCourses: [], exam: null }
      : attachEvents(!state.economy && followingTerm.term < (options.economyStartTerm || 1) ? followingTerm : startEconomyTerm(followingTerm), 'newTerm');
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
  function validateState(state) {
    const validator = typeof module !== 'undefined' && module.exports ? require('./state-validation.js') : root.CampusStateValidation;
    return validator.validate(state, api, random);
  }
  function replay({ nickname, seed, commands, legacyEconomy = false, economyStartTerm = legacyEconomy ? 2 : 1 }) {
    let state = createGame({ nickname, seed, legacyEconomy: legacyEconomy || economyStartTerm > 1 });
    for (const [index, command] of commands.entries()) {
      const args = { commandId: command.commandId || 'replay:' + index, expectedRevision: state.revision, eventInstanceId: command.eventInstanceId, investment: command.investment, extra: command.extra, positionId: command.positionId, economyStartTerm };
      const handlers = { executeAction: () => executeAction(state, command.id, args), submitEventChoice: () => submitEventChoice(state, command.id, args), selectCourses: () => selectCourses(state, command.id, args), chooseBudget: () => chooseBudget(state, command.id, args), beginExam: () => beginExam(state, args), updateExamAnswers: () => updateExamAnswers(state, command.id, args), submitExam: () => submitExam(state, command.id, args), cheatExam: () => cheatExam(state, args), endTerm: () => endTerm(state, args), continueGame: () => continueGame(state, args), chooseEnding: () => chooseEnding(state, command.id, args), chatWithNpc: () => chatWithNpc(state, { identityId: command.identityId, quality: command.quality }, args), setTargetPosition: () => setTargetPosition(state, command.id, args), settleInternship: () => settleInternship(state, args) };
      if (!own(handlers, command.operation)) return { ok: false, reason: '第 ' + (index + 1) + ' 步操作未知', state };
      const result = handlers[command.operation]();
      if (!result.ok) return { ...result, reason: '第 ' + (index + 1) + ' 步：' + result.reason };
      state = result.state;
    }
    return { ok: true, state };
  }
  const api = { RULES, FAMILIES, ACTION_EXTRAS, BUDGET_DIMENSIONS, DEFAULT_BUDGET, budgetPlan, currentGrant, activeBudget, housingFor, placeFor, placeDescription, applyDormEventBonus, eventChoiceEffect, familyForSeed, budgetFor, getActionExtra, actionExtraAvailability, FITNESS_TIERS, fitnessTier, isSick, fitnessAdjustedEffect, ILLNESS_REASON, SICK_LEAVE_ID, TERM_NAMES, BACKGROUNDS, PLACES, ACTIONS, ACTION_INVESTMENTS, EVENTS, EVENT_INVESTMENTS, LEGACY_INVESTMENTS, ENDINGS, TERMINAL_ENDINGS, CHAIN_NAMES, AI_CHAT, NPC_CHAT, COURSES, SUBJECTS, QUESTIONS, LEGACY_QUESTIONS, courseById, coursesForTerm, generateExam, ratingFor, gradeFor, createGame, validateNickname, getAction, getActionInvestment, previewActionInvestment, getEventInvestment, previewEventInvestment, averageGrade, availability, previewChanges, executeAction, eventAvailability, submitEventChoice, previewSettlement, selectCourses, chooseBudget, beginExam, updateExamAnswers, submitExam, cheatExam, endTerm, continueGame, evaluateEndings, advisories, ADVISORIES, resume, RESUME, COMPANIES, POSITIONS, positionAvailability, REAPPLY_GAP, internshipRequirementMet, internshipProgress, settleInternship, setTargetPosition, REQUIREMENT_LABELS, TIER_LABELS, chooseEnding, npcChatAvailability, chatWithNpc, validateState, stateBrief, replay, getTermStage, resumeRequiredEvents };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CampusGame = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
