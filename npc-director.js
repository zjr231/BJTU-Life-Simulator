(function (root) {
  'use strict';
  const cast = typeof module !== 'undefined' && module.exports ? require('./npc-cast.js') : root.CampusNpcCast;
  const rules = typeof module !== 'undefined' && module.exports ? require('./relationships.js') : root.CampusRelationships;
  const config = typeof module !== 'undefined' && module.exports ? require('./config.js') : root.CampusConfig;
  const WEIGHTS = { recent: 0.30, place: 0.20, goal: 0.20, ability: 0.10, relationship: 0.10, novelty: 0.10 };
  function hash(text) { let value = 2166136261; for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619); return (value >>> 0) / 4294967296; }
  function actions(state) { return state.history.filter(entry => Object.hasOwn(config.ACTIONS, entry.action)); }
  function group(actionId) { return rules.ACTIVITIES[actionId]?.group || 'life'; }
  function select(state, candidatesByNpc) {
    if (!['playing', 'eventPending'].includes(state.phase)) return null;
    const saved = cast.director(state), history = actions(state), serial = history.length, last = history.at(-1);
    if (!last || last.term !== state.term || saved.pending || saved.attempts >= 6 || serial - saved.lastAction < 1) return null;
    const event = state.pendingEvent;
    if (event && ['zhouNingMeet', 'zhouNingPresentation', 'military1', 'military2', 'fitnessTest', 'fitnessRetest', 'retake', 'cardTrace'].includes(event.id)) return null;
    const key = 'cast:' + state.term + ':' + serial + ':' + (event?.instanceId || 'map');
    if (saved.checked.includes(key)) return null;
    const place = event ? ({ projectOffer: 'yifu', projectReview: 'yifu', contest1: 'yifu', contest2: 'yifu', sportsMeet: 'track', injury: 'track', campusDiscussion: 'library', seat: 'library', drama: 'auditorium', lecture: 'auditorium', seminar: 'auditorium' })[event.id] || config.ACTIONS[last.action].place : config.ACTIONS[last.action].place;
    const recent = history.slice(-5).reverse();
    const scored = [];
    for (const [id, p] of Object.entries(cast.PROFILES)) {
      const person = cast.get(state, id), choices = candidatesByNpc[id] || [];
      let kind = person ? event ? 'cameo' : 'proactive' : 'meet';
      if (!person) {
        if (id === 'zhouNing' || saved.intros >= 2) continue;
        if (id === 'chenTeacher' && !(last.action === 'applyProject' || last.action === 'projectWork' || event && ['projectOffer', 'projectReview', 'contest1', 'contest2'].includes(event.id))) continue;
        if (id === 'linXia' && !(group(last.action) === 'sport' || event?.id === 'sportsMeet')) continue;
        if (event && !p.events.includes(event.id)) continue;
      } else {
        if (saved.invitations >= 2 || serial - saved.lastAction < 2 || Object.values(rules.read(state).people || {}).some(value => value.agent?.proposal) || rules.read(state).zhouNing?.agent?.proposal) continue;
        if(event && (!p.events.includes(event.id)||!choices.some(item=>item.id==='joinEvent')) || !event && !choices.length)continue;
        if (id === 'chenTeacher' && !['yifu', 'think', 'library', 'auditorium'].includes(place)) continue;
        if (cast.life(state, id).energy < 10 && id === 'chenTeacher') continue;
      }
      const total = recent.reduce((sum, _, index) => sum + 0.65 ** index, 0);
      const preference = recent.reduce((sum, entry, index) => sum + (p.interests.includes(group(entry.action)) ? 1 : 0.15) * 0.65 ** index, 0) / total;
      const dominant = group(last.action), ability = dominant === 'study' ? p.abilities.academic : dominant === 'sport' ? p.abilities.sport : dominant === 'campus' ? p.abilities.academic * 0.7 + p.abilities.social * 0.3 : p.abilities.social;
      const appearances = saved.recent.slice(-5).filter(item => item.npcId === id).length;
      const factors = { recent: preference, place: p.places.includes(place) ? 1 : 0.2, goal: choices.some(item => item.id === p.storyId) ? 1 : person?.story ? 0.2 : 0.5, ability: ability / 100, relationship: (person?.familiarity || 0) / 100, novelty: Math.max(0, 1 - appearances * 0.3) };
      let score = Object.entries(WEIGHTS).reduce((sum, [factor, weight]) => sum + factors[factor] * weight, 0) + (!person ? 0.3 : 0);
      if (saved.recent.at(-1)?.npcId === id) score *= 0.55;
      if (saved.recent.slice(-2).length === 2 && saved.recent.slice(-2).every(item => item.npcId === id)) score *= 0.4;
      scored.push({ npcId: id, kind, score: Math.round(score * 10000) / 10000, factors, choices });
    }
    if (!scored.length) return null;
    const intros = scored.filter(item => item.kind === 'meet');
    const pool = (intros.length ? intros : scored).sort((a, b) => b.score - a.score || a.npcId.localeCompare(b.npcId)).slice(0, 3);
    if (!intros.length && hash(state.rng.seed + key + ':frequency') >= (event ? 0.7 : 0.6)) return null;
    const total = pool.reduce((sum, item) => sum + item.score ** 2 + 0.02, 0);
    let draw = hash(state.rng.seed + key + ':person') * total;
    const chosen = pool.find(item => (draw -= item.score ** 2 + 0.02) < 0) || pool.at(-1);
    const p = cast.profile(chosen.npcId);
    let choices = chosen.choices;
    if (event || chosen.kind === 'meet') choices = [];
    else {
      const preferred = choices.filter(item => item.id === p.storyId || (state.mood <= 45 || state.energy < 30) && ['walk', 'rest', 'treatment'].includes(item.id) || p.interests.includes(group(item.id)));
      choices = (preferred.length ? preferred : choices).slice(0, 6);
    }
    return { key, npcId: chosen.npcId, kind: chosen.kind, serial, place, eventInstanceId: event?.instanceId || null, candidates: choices,
      context: chosen.kind === 'meet' ? '玩家刚完成' + config.ACTIONS[last.action].title + '，这是你们第一次相识。介绍身份即可，不要假装已有交情或活动已经完成。' : event ? '你在' + config.PLACES[place].title + '遇见玩家，正在发生：' + config.EVENTS[event.id].description : '玩家刚在' + config.PLACES[place].title + '完成' + config.ACTIONS[last.action].title + '。结合自己的目标自然问候，可以邀请但不要强行开始活动。',
      scores: pool.map(({ npcId, score, factors }) => ({ npcId, score, factors })) };
  }
  function plan(state, candidatesByNpc) {
    const relation = rules.read(state), saved = cast.director(state);
    let next = state;
    if(saved.pending && (saved.pending.serial!==actions(state).length || (saved.pending.eventInstanceId||null)!==(state.pendingEvent?.instanceId||null))) next = { ...state, relationships: { ...relation, director: { ...saved, pending: null } } };
    if (cast.director(next).pending) return next;
    const pending = select(next, candidatesByNpc);
    if (!pending) return next;
    return { ...next, relationships: { ...rules.read(next), director: { ...cast.director(next), attempts: cast.director(next).attempts + 1, checked: [...cast.director(next).checked, pending.key], pending } } };
  }
  function consume(state, occasion) {
    const saved = cast.director(state);
    return { ...state, relationships: { ...rules.read(state), director: { ...saved, pending: null, lastAction: occasion.serial,
      intros: saved.intros + (occasion.kind === 'meet' ? 1 : 0), invitations: saved.invitations + (occasion.kind === 'meet' ? 0 : 1), recent: [...saved.recent, { npcId: occasion.npcId, serial: occasion.serial, term: state.term, kind: occasion.kind }].slice(-16) } } };
  }
  const api = { WEIGHTS, hash, actions, select, plan, consume };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CampusNpcDirector = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
