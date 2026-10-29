(function (root) {
  'use strict';
  const config = typeof module !== 'undefined' && module.exports ? require('./config.js') : root.CampusConfig;
  const random = typeof module !== 'undefined' && module.exports ? require('./rng.js') : root.CampusRandom;
  const { RULES, TERM_NAMES, BACKGROUNDS, PLACES, ACTIONS, ACTION_INVESTMENTS, EVENTS, EVENT_INVESTMENTS, LEGACY_INVESTMENTS, ENDINGS, RANDOM_POOL, CAMPUS_SCHEDULE, RANDOM_CONTEXTS } = config;
  const CHAIN_NAMES = { project: '项目', club: '社团', internship: '实习' };
  const own = (object, key) => typeof key === 'string' && Object.hasOwn(object, key);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const clamp = (value, max) => Math.max(0, Math.min(max, value));
  function validateNickname(value) {
    if (typeof value !== 'string' || !value.trim()) return { ok: false, reason: '先填一个昵称吧' };
    if ([...value.trim()].length > 12 || /[\u0000-\u001f\u007f]/.test(value)) return { ok: false, reason: '昵称最多 12 个字符，不能包含控制字符' };
    return { ok: true, value: value.trim() };
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
      counts: {}, courses: [], history: [], summary: null, pendingEvent: null, eventQueue: [], eventFlags: {}, eventHistory: [], experiences: [], chains, endingOptions: null, result: null
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
    const effect = investmentEffect(getAction(state, id), profile, amount, curve.mean, curve.q);
    return { ok: true, amount, effect, level: investmentLevel(profile, amount) };
  }
  function availability(state, id, requestedAmount) {
    if (!own(ACTIONS, id)) return { ok: false, reason: '未知行动' };
    if (activeMilitary(state)) return { ok: false, reason: '请先完成军训汇演，再安排其他行动' };
    if (state.phase === 'eventPending') return { ok: false, reason: '请先处理当前事件' };
    if (state.phase !== 'playing') return { ok: false, reason: '现在这个阶段还不能行动' };
    const profile = getActionInvestment(state, id);
    if (!profile && requestedAmount !== undefined) return { ok: false, reason: '这个行动不需要设置投入' };
    const preview = profile && previewActionInvestment(state, id, requestedAmount);
    if (preview && !preview.ok) return preview;
    const action = preview ? preview.effect : getAction(state, id);
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
  function activeMilitary(state) {
    return ['playing', 'eventPending'].includes(state.phase)
      && state.eventHistory.some(entry => entry.term === state.term && entry.event === 'military1' && entry.choice === 'join')
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
    if (triggerAction === 'exercise' && next.term % 2 === 0 && next.fitness >= RULES.fitnessThreshold) enqueue('fitnessTest');
    for (const [id, chain] of Object.entries(next.chains)) {
      if (triggerAction === 'apply' + id[0].toUpperCase() + id.slice(1)) enqueue(id + 'Offer');
      if (chain.status === 'active' && chain.progress === 2 && next.term >= chain.reviewAfter && (id === 'internship' || next.term > chain.startedTerm)) enqueue(id + 'Review');
    }
    if (next.term >= 2 && next.courses.length && next.courses.at(-1).term === next.term - 1 && !next.courses.at(-1).passed) enqueue('retake');
    // Choosing an event option never starts another optional campus event.
    // Required low-mood/fitness and player-requested project/club/internship
    // events retain their existing queue and priority behaviour.
    if ((isAction || triggerAction === 'newTerm') && !next.pendingEvent && !next.eventQueue.length) {
      const eligible = Object.keys(CAMPUS_SCHEDULE).filter(id => {
        const rule = CAMPUS_SCHEDULE[id];
        return inWindow(rule) && (isAction || id === 'ticket2') && termActions >= (rule.minActions || 0)
          && !did(id, undefined, 0) && (!rule.unless || !did(rule.unless))
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
    const check = availability(state, id, options.investment);
    if (!check.ok) return { ...check, state };
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
      action = investmentEffect(action, profile, preview.amount, factor, curve.q);
      investment = describeInvestment(profile, preview, factor, curve.mean);
    }
    const changes = previewChanges(state, action);
    let next = { ...applyChanges(state, changes), rng, counts: { ...state.counts, [id]: (state.counts[id] || 0) + 1 } };
    if (action.kind === 'work') next.chains = { ...state.chains, [action.chain]: { ...state.chains[action.chain], progress: state.chains[action.chain].progress + 1 } };
    next = attachEvents(next, id);
    return commit(state, next, { operation: 'executeAction', id, ...(investment ? { investment: investment.amount } : {}) }, { action: id, title: action.title, changes, ...(investment ? { investment } : {}) }, command.commandId);
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
    const effect = investmentEffect(choice, profile, amount, curve.mean, curve.q);
    return { ok: true, amount, effect, average: previewChanges(state, effect),
      low: previewChanges(state, investmentEffect(choice, profile, amount, curve.factor(0.1), curve.q)),
      high: previewChanges(state, investmentEffect(choice, profile, amount, curve.factor(0.9), curve.q)),
      level: investmentLevel(profile, amount) };
  }
  function describeInvestment(profile, preview, factor, mean) {
    const ratio = factor / mean;
    const outcome = ratio < 0.55 ? 'setback' : preview.level === 'light'
      ? (ratio >= 1.2 ? 'surprise' : 'limited') : ratio >= 1.2 ? 'good' : 'steady';
    return { amount: preview.amount, resource: profile.resource, tier: preview.level, level: preview.level, outcome,
      description: profile.plans[{ light: 0, steady: 1, deep: 2 }[preview.level]] + profile.outcomes[outcome] };
  }
  function eventAvailability(state, choiceId, instanceId, requestedAmount) {
    if (state.phase !== 'eventPending' || !state.pendingEvent) return { ok: false, reason: '当前没有待处理事件' };
    if (activeMilitary(state) && state.pendingEvent.id !== 'military2') return { ok: false, reason: '请先完成军训汇演' };
    if (instanceId !== undefined && instanceId !== state.pendingEvent.instanceId) return { ok: false, reason: '事件已更新，请重新选择' };
    const event = EVENTS[state.pendingEvent.id];
    const choice = event && event.choices.find((item) => item.id === choiceId);
    if (!choice) return { ok: false, reason: '未知事件选项' };
    if (choice.chainEffect === 'postpone' && state.term === 8) return { ok: false, reason: '最后一个学期了，把经历确认了吧' };
    const profile = getEventInvestment(state, choiceId);
    if (!profile && requestedAmount !== undefined) return { ok: false, reason: '这个选项不需要设置投入' };
    const preview = profile && previewEventInvestment(state, choiceId, requestedAmount);
    if (preview && !preview.ok) return preview;
    return resourceCheck(state, preview ? preview.effect : choice);
  }
  function submitEventChoice(state, choiceId, options = {}) {
    const command = commandCheck(state, options, 'event:' + choiceId);
    if (!command.ok) return command;
    const check = eventAvailability(state, choiceId, options.eventInstanceId, options.investment);
    if (!check.ok) return { ...check, state };
    const pending = state.pendingEvent;
    const event = EVENTS[pending.id];
    const choice = event.choices.find((item) => item.id === choiceId);
    const profile = getEventInvestment(state, choiceId);
    let effect = choice;
    let rng = state.rng;
    let investment;
    if (profile) {
      const preview = previewEventInvestment(state, choiceId, options.investment);
      const curve = investmentCurve(profile, preview.amount);
      const drawn = random.draw(state.rng);
      rng = drawn.rng;
      const factor = curve.factor(drawn.number);
      effect = investmentEffect(choice, profile, preview.amount, factor, curve.q);
      investment = describeInvestment(profile, preview, factor, curve.mean);
    }
    const changes = previewChanges(state, effect);
    const entry = { term: state.term, event: pending.id, instanceId: pending.instanceId, choice: choiceId, title: choice.title, changes, ...(investment ? { investment } : {}) };
    let next = { ...applyChanges(state, changes), rng, pendingEvent: null, phase: 'playing', eventFlags: { ...state.eventFlags, [pending.instanceId]: true }, eventHistory: [...state.eventHistory, entry] };
    if (event.chain) {
      const chain = { ...state.chains[event.chain] };
      if (choice.chainEffect === 'accept') Object.assign(chain, { status: 'active', startedTerm: state.term, deadline: Math.min(8, state.term + 1), progress: 0, reviewAfter: state.term });
      if (choice.chainEffect === 'defer') Object.assign(chain, { status: 'deferred', nextEligibleTerm: state.term + 1 });
      if (choice.chainEffect === 'postpone') Object.assign(chain, { reviewAfter: state.term + 1, deadline: Math.min(8, state.term + 1) });
      if (choice.chainEffect === 'complete') chain.status = 'completed';
      if (choice.chainEffect === 'abandon') chain.status = 'missed';
      next.chains = { ...state.chains, [event.chain]: chain };
    }
    if (choice.experience) next.experiences = [...state.experiences, { term: state.term, type: choice.experience, ...(choice.experience === 'fitnessTest' ? { fitness: state.fitness } : {}) }];
    next = attachEvents(next, 'eventChoice');
    return commit(state, next, { operation: 'submitEventChoice', id: choiceId, eventInstanceId: pending.instanceId, ...(investment ? { investment: investment.amount } : {}) }, entry, command.commandId);
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
  function previewSettlement(state) {
    const grade = Math.round(40 + state.preparation * 0.6);
    const aid = Math.max(0, RULES.livingCost - state.money);
    return { term: state.term, name: TERM_NAMES[state.term - 1], preparation: state.preparation, grade, passed: grade >= 60, livingCost: RULES.livingCost, aid, moneyAfter: state.money + aid - 300, unusedTime: state.time, counts: { ...state.counts }, attributes: { social: state.social, fitness: state.fitness, mood: state.mood }, notices: settlementChains(state).notices };
  }
  function endTerm(state, options = {}) {
    const command = commandCheck(state, options, 'endTerm');
    if (!command.ok) return command;
    if (activeMilitary(state)) return { ok: false, reason: '请先完成整个军训流程', state };
    if (state.phase === 'eventPending') return { ok: false, reason: '请先处理当前事件', state };
    if (state.phase !== 'playing') return { ok: false, reason: '本学期已经结算或流程已经结束', state };
    const summary = previewSettlement(state);
    const next = { ...state, phase: 'summary', money: summary.moneyAfter, chains: settlementChains(state).chains, courses: [...state.courses, summary], summary };
    return commit(state, next, { operation: 'endTerm' }, { action: 'endTerm', title: '学期结算' }, command.commandId);
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
      ? { ...state, phase: 'endingChoice', endingOptions: evaluateEndings(state) }
      : attachEvents({ ...state, term: state.term + 1, phase: 'playing', time: 12, energy: 80, preparation: 0, counts: {}, summary: null }, 'newTerm');
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
      const args = { commandId: command.commandId || 'replay:' + index, expectedRevision: state.revision, eventInstanceId: command.eventInstanceId, investment: command.investment };
      const handlers = { executeAction: () => executeAction(state, command.id, args), submitEventChoice: () => submitEventChoice(state, command.id, args), endTerm: () => endTerm(state, args), continueGame: () => continueGame(state, args), chooseEnding: () => chooseEnding(state, command.id, args) };
      if (!own(handlers, command.operation)) return { ok: false, reason: '第 ' + (index + 1) + ' 步操作未知', state };
      const result = handlers[command.operation]();
      if (!result.ok) return { ...result, reason: '第 ' + (index + 1) + ' 步：' + result.reason };
      state = result.state;
    }
    return { ok: true, state };
  }
  const api = { RULES, TERM_NAMES, BACKGROUNDS, PLACES, ACTIONS, ACTION_INVESTMENTS, EVENTS, EVENT_INVESTMENTS, LEGACY_INVESTMENTS, ENDINGS, CHAIN_NAMES, createGame, validateNickname, getAction, getActionInvestment, previewActionInvestment, averageGrade, availability, previewChanges, executeAction, getEventInvestment, previewEventInvestment, eventAvailability, submitEventChoice, previewSettlement, endTerm, continueGame, evaluateEndings, chooseEnding, validateState, stateBrief, replay, getTermStage, resumeRequiredEvents };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CampusGame = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
