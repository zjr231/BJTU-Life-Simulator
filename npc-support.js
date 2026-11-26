(function (root) {
  'use strict';
  const rules = typeof module !== 'undefined' && module.exports ? require('./relationships.js') : root.CampusRelationships;
  const cast = typeof module !== 'undefined' && module.exports ? require('./npc-cast.js') : root.CampusNpcCast;
  const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
  const floor = value => Math.floor((value + 1e-9) * 100) / 100;
  const LIMITS = { playerRate: 0.25, resultRate: 0.08, contributionRate: 0.30 };
  const academic = { academic: 1 }, social = { social: 1 }, sport = { sport: 1 };
  const CONTEXTS = {
    study: { weights: academic, metrics: ['preparation'] }, tutoring: { weights: academic, metrics: ['preparation'] }, selfStudy: { weights: academic, metrics: ['preparation'] },
    furtherStudy: { weights: academic, metrics: ['furtherStudy'] }, jobPreparation: { weights: { academic: 0.6, social: 0.4 }, metrics: ['jobPreparation'] },
    exercise: { weights: sport, metrics: ['fitness', 'mood'] }, gym: { weights: sport, metrics: ['fitness', 'mood'] }, teamSport: { weights: sport, metrics: ['fitness', 'social', 'mood'] }, soloSport: { weights: sport, metrics: ['fitness', 'mood'] }, basketball: { weights: sport, metrics: ['fitness', 'social', 'mood'] },
    walk: { weights: social, metrics: ['mood'] }, show: { weights: social, metrics: ['mood'] }, chat: { weights: social, metrics: ['social', 'mood'] }, rest: { weights: social, metrics: ['mood'] },
    checkup: { weights: social, metrics: ['mood'] }, sickVisit: { weights: social, metrics: ['mood'] }, treatment: { weights: social, metrics: ['mood'] },
    work: { weights: social, metrics: ['social', 'mood'] }, projectWork: { weights: { academic: 0.7, social: 0.3 }, metrics: ['preparation'] }, clubWork: { weights: social, metrics: ['social', 'mood'] }, internshipWork: { weights: { academic: 0.5, social: 0.5 }, metrics: ['preparation', 'social', 'jobPreparation', 'mood'] }, alumniVolunteer: { weights: social, metrics: ['social', 'mood'] },
    applyProject: { weights: academic, metrics: [] }, applyClub: { weights: social, metrics: [] }, applyInternship: { weights: { academic: 0.5, social: 0.5 }, metrics: [] },
    seminar:{weights:academic,metrics:['furtherStudy','preparation','social','mood']},lecture:{weights:{academic:0.7,social:0.3},metrics:['preparation','social','mood']},injury:{weights:{sport:0.7,social:0.3},metrics:['mood','social']},
    mentorReview: { weights: { academic: 0.7, social: 0.3 }, metrics: ['preparation', 'social', 'mood'] }, relayPractice: { weights: { sport: 0.8, social: 0.2 }, metrics: ['fitness', 'social', 'mood'] }, projectReview: { weights: { academic: 0.7, social: 0.3 }, metrics: ['preparation', 'social', 'mood'] }, contest1: { weights: { academic: 0.7, social: 0.3 }, metrics: ['preparation', 'social', 'mood'] }, contest2: { weights: { academic: 0.7, social: 0.3 }, metrics: ['preparation', 'social', 'mood'] }, sportsMeet: { weights: { sport: 0.8, social: 0.2 }, metrics: ['fitness', 'social', 'mood'] },
    zhouNingPresentation: { weights: { academic: 0.6, social: 0.4 }, metrics: ['preparation', 'social', 'mood'] },
    campusDiscussion: { weights: academic, metrics: ['preparation', 'social'] }, cat: { weights: social, metrics: ['mood'] }, seat: { weights: social, metrics: ['social', 'mood'] }, snow: { weights: { social: 0.7, sport: 0.3 }, metrics: ['mood'] }, ginkgo: { weights: social, metrics: ['mood'] }, drama: { weights: social, metrics: ['mood'] }
  };
  function resolve(state, effect, neutralEffect, contextId, companion = false) {
    const npcId = companion === true ? 'zhouNing' : typeof companion === 'string' ? companion : null;
    const context = Object.hasOwn(CONTEXTS, contextId) ? CONTEXTS[contextId] : null;
    const output = { ...effect };
    if (!context) return { effect: output, support: { version: 1, context: contextId, companion: npcId, metrics: {} } };
    const player = { academic: rules.academicAbility(state), social: state.social, sport: state.fitness };
    const weighted = values => Object.entries(context.weights).reduce((sum, [key, weight]) => sum + values[key] * weight, 0);
    const playerAbility = weighted(player);
    const playerRate = LIMITS.playerRate * (playerAbility * 0.75 + state.mood * 0.25) / 100;
    const npcAbilities = npcId ? cast.abilities(state, npcId) : null;
    const familiarity = npcId ? cast.get(state, npcId).familiarity : 0;
    const life = npcId ? cast.life(state, npcId) : null;
    const npcRate = npcId ? LIMITS.resultRate * weighted(npcAbilities) / 100 * (0.35 + 0.65 * familiarity / 100) * (0.5 + 0.5 * (life.mood + life.energy) / 200) : 0;
    const metrics = {};
    for (const key of context.metrics) {
      const cost = key === 'fitness' ? effect.fitnessCost || 0 : 0;
      const existing = (effect[key] || 0) - cost;
      if (existing <= 0) continue; // 不把负面结果、费用或医疗恢复转换为辅助收益。
      const room = Math.max(0, 100 - state[key]);
      const base = floor(Math.min(room, Math.max(0, (neutralEffect[key] || 0) - (key === 'fitness' ? neutralEffect.fitnessCost || 0 : 0))));
      const playerInitial = floor(Math.min(room, existing * (1 + playerRate)));
      const playerContribution = round(Math.max(0, playerInitial - base));
      const npcBonus = floor(Math.max(0, Math.min(playerInitial * npcRate, playerInitial * LIMITS.resultRate, playerContribution * LIMITS.contributionRate, room - playerInitial)));
      const final = round(playerInitial + npcBonus);
      output[key] = round(final + cost);
      metrics[key] = { base, playerInitial, playerContribution, npcBonus, final };
    }
    return { effect: output, support: { version: 1, context: contextId, companion: npcId, weights: { ...context.weights }, playerAbility: round(playerAbility), npcAbilities, familiarity, metrics } };
  }
  const api = { LIMITS, CONTEXTS, round, resolve };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CampusNpcSupport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
