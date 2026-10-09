(function (root) {
  'use strict';
  const RULES = Object.freeze({ version: 2, terms: 8, time: 12, energy: 80, maxEnergy: 100, maxAttribute: 100, maxPreparation: 100, initialMoney: 1000, initialSocial: 20, initialFitness: 50, initialMood: 70, livingCost: 300, lowMood: 30, fitnessThreshold: 60 });
  const TERM_NAMES = ['大一上', '大一下', '大二上', '大二下', '大三上', '大三下', '大四上', '大四下'];
  const ACTIONS = Object.freeze({
    study: { place: 'think', title: '课程学习', description: '稳步完成课程。学习增加本学期准备，期末才形成成绩。', time: 2, energy: 15, money: 0, preparation: 20, mood: -3, limit: 4 },
    tutoring: { place: 'think', title: '课程补习', description: '通过针对性辅导，更省精力地补足课程准备。', time: 2, energy: 10, money: 100, preparation: 25, limit: 2 },
    work: { place: 'gate', title: '校外兼职', description: '完成一轮家教，赚取生活费，也积累与人沟通的经验。', time: 2, energy: 20, money: 0, income: 200, social: 2, mood: -5, limit: 3 },
    rest: { place: 'dorm', title: '休息调整', description: '休息恢复当前精力和少量心情，长期体能保持不变。', time: 1, energy: 0, money: 0, recovery: 30, mood: 3 },
    chat: { place: 'dorm', title: '室友交流', description: '和室友分享近况，积累社交，也让心情轻松一点。', time: 1, energy: 5, money: 0, social: 5, mood: 8, limit: 2 },
    exercise: { place: 'track', title: '锻炼', description: '投入一次锻炼，提高长期体能。偶数学期体能达标后可触发体测体验。', time: 1, energy: 10, money: 0, fitness: 6, mood: 4, limit: 4 },
    walk: { place: 'ginkgo', title: '散步', description: '在银杏树下放慢脚步，恢复心情和少量精力。', time: 1, energy: 0, money: 0, recovery: 10, mood: 10, limit: 3 }
  });
  const EVENTS = Object.freeze({
    roommateCare: {
      title: '室友的关心',
      description: '室友发现你最近情绪有些低落，问你要不要一起聊聊。给自己留一点调整的空间。',
      trigger: '心情低于 30；每学期至多一次',
      choices: [
        { id: 'talk', title: '和室友聊一会儿', description: '花一点时间，把最近的烦恼说出来。', time: 1, energy: 0, money: 0, mood: 15, social: 3 },
        { id: 'later', title: '先自己调整', description: '暂时婉拒，继续安排本学期。你仍可以通过休息或散步恢复心情。', time: 0, energy: 0, money: 0 }
      ]
    },
    fitnessTest: {
      title: '体测体验报名',
      description: '操场开放了本学期的体测体验。持续锻炼让你具备了参加条件，完成后会留下体测经历。',
      trigger: '第 2、4、6、8 学期锻炼后，体能达到 60；每学期至多一次',
      choices: [
        { id: 'participate', title: '参加体测体验', description: '完成体验，记录本学期体测达标经历。', time: 1, energy: 10, money: 0, mood: 5, minFitness: 60, experience: 'fitnessTest' },
        { id: 'later', title: '这次暂不参加', description: '保留资源，继续本学期安排。下一次符合条件的学期仍有机会。', time: 0, energy: 0, money: 0 }
      ]
    }
  });
  function createGame() {
    return { version: RULES.version, term: 1, phase: 'playing', time: RULES.time, energy: RULES.energy, money: RULES.initialMoney, social: RULES.initialSocial, fitness: RULES.initialFitness, mood: RULES.initialMood, preparation: 0, counts: {}, courses: [], history: [], summary: null, pendingEvent: null, eventFlags: {}, eventHistory: [], experiences: [] };
  }
  function clamp(value, max) { return Math.max(0, Math.min(max, value)); }
  function previewChanges(state, effect) {
    return {
      time: -(effect.time || 0),
      energy: clamp(state.energy - (effect.energy || 0) + (effect.recovery || 0), RULES.maxEnergy) - state.energy,
      money: (effect.income || 0) - (effect.money || 0),
      preparation: clamp(state.preparation + (effect.preparation || 0), RULES.maxPreparation) - state.preparation,
      social: clamp(state.social + (effect.social || 0), RULES.maxAttribute) - state.social,
      fitness: clamp(state.fitness + (effect.fitness || 0), RULES.maxAttribute) - state.fitness,
      mood: clamp(state.mood + (effect.mood || 0), RULES.maxAttribute) - state.mood
    };
  }
  function resourceCheck(state, effect) {
    if (state.time < (effect.time || 0)) return { ok: false, reason: '时间不足：需要 ' + effect.time + ' 点，剩余 ' + state.time + ' 点' };
    if (state.energy < (effect.energy || 0)) return { ok: false, reason: '精力不足：需要 ' + effect.energy + ' 点，剩余 ' + state.energy + ' 点' };
    if (state.money < (effect.money || 0)) return { ok: false, reason: '钱包不足：需要 ' + effect.money + ' 元，剩余 ' + state.money + ' 元' };
    if (effect.minFitness && state.fitness < effect.minFitness) return { ok: false, reason: '体能不足：需要 ' + effect.minFitness + ' 点' };
    return { ok: true, reason: '' };
  }
  function availability(state, id) {
    if (!Object.hasOwn(ACTIONS, id)) return { ok: false, reason: '未知行动' };
    if (state.phase === 'graduated') return { ok: false, reason: '四年流程已经完成' };
    if (state.phase !== 'playing') return { ok: false, reason: '请先完成学期总结' };
    if (state.pendingEvent) return { ok: false, reason: '请先处理当前事件' };
    const action = ACTIONS[id];
    if (action.limit && (state.counts[id] || 0) >= action.limit) return { ok: false, reason: '已达本学期次数上限' };
    if (action.preparation && state.preparation >= RULES.maxPreparation) return { ok: false, reason: '课程准备已满' };
    const check = resourceCheck(state, action);
    if (!check.ok) return check;
    const benefits = previewChanges(state, action);
    if (!Object.values(benefits).some((value) => value > 0)) return { ok: false, reason: '这项行动的收益属性已满' };
    return { ok: true, reason: '' };
  }
  function applyChanges(state, changes) {
    const next = { ...state };
    for (const [key, value] of Object.entries(changes)) next[key] += value;
    return next;
  }
  function attachEvent(state, triggerAction) {
    if (state.phase !== 'playing' || state.pendingEvent) return state;
    let id = null;
    if (state.mood < RULES.lowMood && !state.eventFlags[state.term + ':roommateCare']) id = 'roommateCare';
    else if (triggerAction === 'exercise' && state.term % 2 === 0 && state.fitness >= RULES.fitnessThreshold && !state.eventFlags[state.term + ':fitnessTest']) id = 'fitnessTest';
    return id ? { ...state, pendingEvent: { id, term: state.term, triggerAction } } : state;
  }
  function executeAction(state, id) {
    const check = availability(state, id);
    if (!check.ok) return { ...check, state };
    const action = ACTIONS[id];
    const changes = previewChanges(state, action);
    const entry = { term: state.term, action: id, title: action.title, changes };
    let next = applyChanges(state, changes);
    next = { ...next, counts: { ...state.counts, [id]: (state.counts[id] || 0) + 1 }, history: [...state.history, entry] };
    next = attachEvent(next, id);
    return { ok: true, state: next, changes, entry };
  }
  function eventAvailability(state, choiceId) {
    if (state.phase !== 'playing' || !state.pendingEvent) return { ok: false, reason: '当前没有待处理事件' };
    const event = EVENTS[state.pendingEvent.id];
    const choice = event && event.choices.find((item) => item.id === choiceId);
    if (!choice) return { ok: false, reason: '未知事件选项' };
    return resourceCheck(state, choice);
  }
  function submitEventChoice(state, choiceId) {
    const check = eventAvailability(state, choiceId);
    if (!check.ok) return { ...check, state };
    const pending = state.pendingEvent;
    const event = EVENTS[pending.id];
    const choice = event.choices.find((item) => item.id === choiceId);
    const changes = previewChanges(state, choice);
    const entry = { term: state.term, event: pending.id, choice: choiceId, title: choice.title, changes };
    let next = applyChanges(state, changes);
    next = { ...next, pendingEvent: null, eventFlags: { ...state.eventFlags, [state.term + ':' + pending.id]: true }, eventHistory: [...state.eventHistory, entry], history: [...state.history, entry], experiences: choice.experience ? [...state.experiences, { term: state.term, type: choice.experience, fitness: state.fitness }] : state.experiences };
    next = attachEvent(next, pending.triggerAction);
    return { ok: true, state: next, changes, entry };
  }
  function previewSettlement(state) {
    const grade = Math.round(40 + state.preparation * 0.6);
    const aid = Math.max(0, RULES.livingCost - state.money);
    return { term: state.term, name: TERM_NAMES[state.term - 1], preparation: state.preparation, grade, passed: grade >= 60, livingCost: RULES.livingCost, aid, moneyAfter: state.money + aid - RULES.livingCost, unusedTime: state.time, counts: { ...state.counts }, attributes: { social: state.social, fitness: state.fitness, mood: state.mood } };
  }
  function endTerm(state) {
    if (state.phase !== 'playing') return { ok: false, reason: '本学期已经结算', state };
    if (state.pendingEvent) return { ok: false, reason: '请先处理当前事件', state };
    const summary = previewSettlement(state);
    const next = { ...state, phase: 'summary', money: summary.moneyAfter, courses: [...state.courses, summary], summary, history: [...state.history, { term: state.term, action: 'endTerm', summary }] };
    return { ok: true, state: next, summary };
  }
  function continueGame(state) {
    if (state.phase !== 'summary') return { ok: false, reason: '当前没有待确认的学期总结', state };
    if (state.term === RULES.terms) return { ok: true, state: { ...state, phase: 'graduated' } };
    const next = { ...state, term: state.term + 1, phase: 'playing', time: RULES.time, energy: RULES.energy, preparation: 0, counts: {}, summary: null };
    return { ok: true, state: attachEvent(next, 'newTerm') };
  }
  const api = { RULES, TERM_NAMES, ACTIONS, EVENTS, createGame, availability, previewChanges, executeAction, eventAvailability, submitEventChoice, previewSettlement, endTerm, continueGame };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CampusGame = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

