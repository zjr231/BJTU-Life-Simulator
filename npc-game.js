(function (root) {
  'use strict';
  const cast = typeof module !== 'undefined' && module.exports ? require('./npc-cast.js') : root.CampusNpcCast;
  const director = typeof module !== 'undefined' && module.exports ? require('./npc-director.js') : root.CampusNpcDirector;
  const agent = typeof module !== 'undefined' && module.exports ? require('./character-agent.js') : root.CampusCharacterAgent;
  function install(game, h) {
    const bad = (state, reason) => ({ ok: false, reason, state });
    const get = cast.get;
    function npcAvailability(state, npcId, actionId, investment) {
      const p = cast.profile(npcId), person = get(state, npcId);
      if (!p || !person) return { ok: false, reason: '先在校园里认识这位人物' };
      if (!p.activities.includes(actionId)) return { ok: false, reason: p.role === 'teacher' ? '老师只提供项目、竞赛与学业方向的指导' : '这项活动暂时不能安排同行' };
      if (cast.totalInteractions(state) >= 4) return { ok: false, reason: '这学期四次共同活动已安排完，仍可继续聊天' };
      if (npcId === 'chenTeacher' && cast.usage(state, npcId).interactions >= 2) return { ok: false, reason: '老师这学期的两次指导已安排完，先消化已有建议吧' };
      if (state.phase !== 'playing' || h.activeMilitary(state)) return { ok: false, reason: '请先完成当前事件、考试或军训流程' };
      if (cast.life(state, npcId).energy < game.relationshipRules.ACTIVITIES[actionId].effort) return { ok: false, reason: p.name + '有些累，想先休息一下' };
      const result = game.availability(state, actionId, investment);
      if (!result.ok && result.reason === '这项行动的收益已经到头了' && game.relationshipRules.ACTIVITIES[actionId].recovery && cast.life(state, npcId).energy < 100) {
        const preview = game.previewActionInvestment(state, actionId, investment);
        return h.resourceCheck(state, preview?.effect || game.fitnessAdjustedEffect(state, game.getAction(state, actionId), actionId));
      }
      return result;
    }
    function npcStoryCost(state,npcId){return game.fitnessAdjustedEffect(state,{time:1,energy:npcId==='chenTeacher'?6:8,fitnessCost:1},npcId==='linXia'?'exercise':null);}
    function npcStoryAvailability(state, npcId) {
      const person = get(state, npcId), p = cast.profile(npcId);
      if (!person || !p) return { ok: false, reason: '先认识这位人物' };
      if (cast.totalInteractions(state) >= 4) return { ok: false, reason: '这学期共同活动已经安排满了' };
      if (npcId === 'zhouNing') return game.zhouNingAvailability(state, 'presentation', undefined, 2);
      if (state.phase !== 'playing' || h.activeMilitary(state) || game.isSick(state)) return { ok: false, reason: '先处理当前流程并照顾好身体' };
      if (person.story) return { ok: false, reason: '这次人物事件已经成为你们的共同经历' };
      if (person.familiarity < 30 || !cast.usage(state, npcId).interactions && !Object.keys(person.eventCounts || {}).length && !Object.keys(cast.life(state, npcId).activities).length) return { ok: false, reason: '相识度达到 30，并有过共同活动后，他会向你提起这件事' };
      if (npcId === 'chenTeacher' && cast.usage(state, npcId).interactions >= 2) return { ok: false, reason: '本学期的指导次数已经安排完' };
      if(cast.life(state,npcId).energy<6)return {ok:false,reason:'对方现在有些疲惫，先休息再安排吧'};
      return h.resourceCheck(state,npcStoryCost(state,npcId));
    }
    function eventAvailability(state, npcId) {
      const p = cast.profile(npcId);
      if (!p || !get(state, npcId) || state.phase !== 'eventPending' || !p.events.includes(state.pendingEvent.id)) return { ok: false, reason: '这位人物不适合参与当前事件' };
      if (game.isSick(state) || h.activeMilitary(state) || cast.totalInteractions(state) >= 4) return { ok: false, reason: '目前不能再安排共同事件' };
      if (cast.life(state, npcId).energy < 4 || npcId === 'chenTeacher' && cast.usage(state, npcId).interactions >= 2) return { ok: false, reason: p.name + '目前需要先休息、消化已有安排' };
      return { ok: true, reason: '' };
    }
    function npcCandidates(state, npcId) {
      if (!get(state, npcId)) return [];
      const result = Object.keys(game.relationshipRules.ACTIVITIES).filter(id => npcAvailability(state, npcId, id).ok).map(id => ({ id, label: cast.activityLabel(npcId, id) }));
      if (npcStoryAvailability(state, npcId).ok) result.unshift({ id: cast.profile(npcId).storyId, label: npcId === 'zhouNing' ? '陪周宁练习课程展示' : npcId === 'chenTeacher' ? '请老师一起复盘方案' : '陪林夏练习接力配合' });
      if(eventAvailability(state,npcId).ok && !(state.relationships?.eventCompanion?.npcId===npcId && state.relationships.eventCompanion.instanceId===state.pendingEvent?.instanceId))result.push({ id: 'joinEvent', label: '共同参与眼前的事件' });
      return result;
    }
    function planNpcDirector(state) {
      if (game.isSick(state) || h.activeMilitary(state) || !state.selectedCourses?.length) return state;
      return director.plan(state, Object.fromEntries(Object.keys(cast.PROFILES).map(id => [id, npcCandidates(state, id)])));
    }
    function npcOpportunity(state) {
      const pending = cast.director(state).pending;
      if (pending && (!pending.eventInstanceId || pending.eventInstanceId === state.pendingEvent?.instanceId)) return pending;
      // 旧存档第一次进入多人物模块时仍可继续原有周宁请求。
      if (!state.relationships?.director) { const old = game.zhouNingOpportunity(state); if (old) return { ...old, npcId: 'zhouNing', serial: director.actions(state).length, eventInstanceId: state.pendingEvent?.instanceId || null, scores: [] }; }
      return null;
    }
    function recordNpcDialogue(state, payload, options = {}) {
      const check = h.commandCheck(state, options, 'npcDialogue'); if (!check.ok) return check;
      const npcId = payload?.npcId, p = cast.profile(npcId);
      if (!p || options.npcId !== undefined && options.npcId !== npcId || !['chat', 'meet', 'proactive', 'cameo'].includes(payload.kind) || !['online', 'local'].includes(payload.source)
          || typeof payload.say !== 'string' || !payload.say.trim() || payload.say.length > 180 || typeof payload.text !== 'string' || payload.text.length > 240 || typeof payload.intent !== 'string') return bad(state, '人物、会话或对话格式无效');
      const occasion = payload.kind === 'chat' ? null : npcOpportunity(state);
      if (payload.kind !== 'chat' && (!occasion || occasion.npcId !== npcId || occasion.kind !== payload.kind || occasion.key !== payload.trigger || payload.text !== '')) return bad(state, '这次出场已经更新，不能切换为其他人物');
      if (payload.kind === 'chat' && (!get(state, npcId) || !payload.text.trim() || !['playing', 'eventPending', 'examPending', 'summary', 'endingChoice'].includes(state.phase))) return bad(state, '现在不能继续这段人物对话');
      const chats = state.history.filter(entry => entry.term === state.term && ['recordNpcDialogue', 'recordZhouNingDialogue'].includes(entry.command.operation) && entry.dialogue?.kind === 'chat').length;
      if (payload.kind === 'chat' && chats >= 120) return bad(state, '本学期已经聊了很久，先去经历新的校园生活吧');
      let next = payload.kind === 'meet' ? cast.meet(state, npcId) : state;
      if (!get(next, npcId)) return bad(state, '尚未认识这位人物');
      const candidates = occasion ? occasion.candidates : npcCandidates(state, npcId);
      if (payload.intent !== 'none' && !candidates.some(item => item.id === payload.intent)) return bad(state, '这位人物提出的安排目前不可用');
      const old = agent.read(next, npcId), usage = cast.usage(next, npcId), subject = payload.kind === 'chat' ? agent.topic(payload.text) : null;
      const gained = state.phase === 'playing' && subject && !old.topics.includes(subject) ? Math.min(2, 8 - usage.talkGrowth) : 0;
      const memory = { ...old, chats: old.chats + (payload.kind === 'chat' ? 1 : 0), messages: [...old.messages, ...(payload.text ? [{ role: 'user', content: payload.text, term: state.term }] : []), { role: 'assistant', content: payload.say, term: state.term }].slice(-12),
        ...(subject ? { notes: [...old.notes.filter(item => item.topic !== subject), { topic: subject, text: payload.text, term: state.term }].slice(-4) } : {}), ...(gained ? { topics: [...old.topics, subject] } : {}),
        ...(payload.intent !== 'none' ? { proposal: { id: payload.intent, createdRevision: state.revision + 1, term: state.term, npcId } } : {}) };
      next = cast.set(next, npcId, { ...get(next, npcId), familiarity: Math.min(100, get(next, npcId).familiarity + gained), abilities: cast.abilities(next, npcId), life: cast.life(next, npcId), agent: memory });
      next = cast.setUsage(next, npcId, { ...usage, talkGrowth: usage.talkGrowth + gained });
      if (occasion) {
        next = director.consume(next, occasion);
        if (state.pendingEvent && eventAvailability(next, npcId).ok) next = { ...next, relationships: { ...next.relationships, eventCompanion: { npcId, instanceId: state.pendingEvent.instanceId, say: payload.say } } };
      }
      const data = { npcId, kind: payload.kind, text: payload.text, say: payload.say, intent: payload.intent, source: payload.source, ...(payload.trigger ? { trigger: payload.trigger } : {}) };
      return h.commit(state, next, { operation: 'recordNpcDialogue', data, npcCastVersion: 1 }, { action: 'npcDialogue', title: payload.kind === 'meet' ? '你认识了' + p.name : '与' + p.name + '交谈', changes: game.previewChanges(state, {}), dialogue: { ...data, gained } }, check.commandId);
    }
    function attachNpcToEvent(state, npcId, options = {}) {
      const check = h.commandCheck(state, options, 'npcEvent'); if (!check.ok) return check;
      if (options.eventInstanceId !== undefined && options.eventInstanceId !== state.pendingEvent?.instanceId) return bad(state, '事件已经更新');
      const allowed = eventAvailability(state, npcId); if (!allowed.ok) return bad(state, allowed.reason);
      if (state.relationships.eventCompanion?.npcId === npcId && state.relationships.eventCompanion.instanceId === state.pendingEvent.instanceId) return bad(state, '这位人物已经在旁边了');
      const next = { ...state, relationships: { ...state.relationships, eventCompanion: { npcId, instanceId: state.pendingEvent.instanceId, say: cast.activityReply(npcId, 'projectWork') || cast.profile(npcId).greeting } } };
      return h.commit(state, next, { operation: 'attachNpcToEvent', npcId, eventInstanceId: state.pendingEvent.instanceId, npcCastVersion: 1 }, { action: 'npcEvent', title: '邀请' + cast.profile(npcId).name + '共同参与', changes: game.previewChanges(state, {}) }, check.commandId);
    }
    function boundEventNpc(state, options) {
      const bound = state.relationships?.eventCompanion;
      if (!bound || bound.instanceId !== state.pendingEvent?.instanceId) return null;
      return options.companionId === bound.npcId && eventAvailability(state, bound.npcId).ok ? bound.npcId : null;
    }
    function finishNpcEvent(state, next, entry, npcId, choiceId) {
      if (state.relationships?.eventCompanion?.instanceId === state.pendingEvent?.instanceId) next = { ...next, relationships: { ...next.relationships, eventCompanion: null } };
      if (!npcId || ['later', 'sickLeave'].includes(choiceId) || !Object.keys(entry.support?.metrics || {}).length) return next;
      const person = get(next, npcId), current = cast.life(next, npcId), usage = cast.usage(next, npcId);
      const memories = [...new Set([...person.memories, 'event_' + entry.event])];
      next = cast.set(next, npcId, { ...person, familiarity: Math.min(100, person.familiarity + 2), abilities: cast.abilities(next, npcId), memories, eventCounts: { ...(person.eventCounts || {}), [entry.event]: (person.eventCounts?.[entry.event] || 0) + 1 }, life: { ...current, energy: Math.max(0, current.energy - 4), mood: Math.min(100, current.mood + 2) } });
      next = cast.setUsage(next, npcId, { ...usage, interactions: usage.interactions + 1 });
      entry.relationship = { characterId: npcId, kind: 'cameo', gained: get(next, npcId).familiarity - person.familiarity, familiarity: get(next, npcId).familiarity, description: cast.profile(npcId).name + '与你共同经历了' + game.EVENTS[entry.event].title + '。' };
      return next;
    }
    function runNpcStory(state, data, options = {}) {
      const check = h.commandCheck(state, options, 'npcStory'); if (!check.ok) return check;
      const npcId = data?.npcId, choice = data?.choice;
      const allowed = npcStoryAvailability(state, npcId); if (!allowed.ok) return bad(state, allowed.reason);
      if (npcId === 'zhouNing') {
        if(choice!=='start')return bad(state,'请选择开始这段人物事件');
        const result = game.interactWithZhouNing(state, 'presentation', { ...options, characterVersion: 2 }); if (!result.ok) return result;
        const saved=agent.read(result.state,npcId);
        const next=saved.proposal?.id==='presentation'?cast.set(result.state,npcId,{...get(result.state,npcId),agent:{...saved,proposal:null}}):result.state;
        return h.commit(state, next, { operation: 'runNpcStory', data: { npcId, choice: 'start' }, npcCastVersion: 1 }, result.entry, check.commandId);
      }
      if (!['prepare', 'encourage'].includes(choice)) return bad(state, '请选择一种人物事件参与方式');
      const person = get(state, npcId), p = cast.profile(npcId), sporty = npcId === 'linXia';
      const score = sporty ? state.fitness * 0.5 + state.social * 0.3 + state.mood * 0.2 : game.relationshipRules.academicAbility(state) * 0.5 + state.social * 0.3 + state.mood * 0.2;
      const level = score >= 55 ? 'good' : score >= 35 ? 'steady' : 'limited';
      const reward = choice === 'encourage' ? { mood: 4, social: 2 } : sporty ? { fitness: level === 'good' ? 7 : level === 'steady' ? 5 : 3, mood: 3, social: 2 } : { preparation: level === 'good' ? 9 : level === 'steady' ? 6 : 3, social: 2, mood: 2 };
      const raw = { time: 1, energy: sporty ? 8 : 6, fitnessCost: 1, ...reward };
      const resources = h.resourceCheck(state, npcStoryCost(state,npcId)); if (!resources.ok) return bad(state, resources.reason);
      const adjusted = game.fitnessAdjustedEffect(state, raw, sporty ? 'exercise' : null);
      const resolved = game.npcSupport.resolve(state, adjusted, game.fitnessAdjustedEffect({ ...state, fitness: 50 }, raw, sporty ? 'exercise' : null), p.storyId, npcId);
      const changes = game.previewChanges(state, resolved.effect), usage = cast.usage(state, npcId), current = cast.life(state, npcId);
      let next = cast.set(h.applyChanges(state, changes), npcId, { ...person, familiarity: Math.min(100, person.familiarity + (choice === 'prepare' ? 8 : 6)), story: { id: p.storyId, choice, level, term: state.term }, memories: [...new Set([...person.memories, 'story_' + p.storyId])], ...(person.agent?{agent:{...agent.read(state,npcId),proposal:agent.read(state,npcId).proposal?.id===p.storyId?null:agent.read(state,npcId).proposal}}:{}), life: { ...current, goal: 'explore', energy: Math.max(0, current.energy - 6), mood: Math.min(100, current.mood + 5) } });
      next = cast.setUsage(next, npcId, { ...usage, interactions: usage.interactions + 1 });
      next = h.attachEvents(next, 'eventChoice');
      const description = sporty ? '谢谢你陪我把节奏重新练了一遍。原来赛前紧张也可以直接和队友说，我没必要一个人扛着。' : '把问题、依据和验证办法放在一起，方案就清楚多了。接下来带着自己的验证结果继续推进，我会记得今天的讨论。';
      return h.commit(state, next, { operation: 'runNpcStory', data: { npcId, choice }, npcCastVersion: 1, npcSupportVersion: 1 }, { action: 'npcStory', title: p.name + ' · ' + (sporty ? '接力前的配合' : '方案复盘'), changes, fitnessCost: 1, npcStory: { id: p.storyId, choice, level }, support: resolved.support, relationship: { characterId: npcId, kind: 'story', gained: get(next, npcId).familiarity - person.familiarity, familiarity: get(next, npcId).familiarity, description } }, check.commandId);
    }
    function resolveNpcProposal(state, data, options = {}) {
      const check = h.commandCheck(state, options, 'npcProposal'); if (!check.ok) return check;
      const npcId = data?.npcId, answer = data?.answer;
      if (!cast.profile(npcId) || !get(state, npcId)) return bad(state, '人物身份无效');
      const saved = agent.read(state, npcId), proposal = saved.proposal;
      if (!proposal || proposal.term !== state.term || proposal.npcId && proposal.npcId !== npcId || options.proposalRevision !== proposal.createdRevision || !['accept', 'decline'].includes(answer)) return bad(state, '人物或邀请已经更新');
      const command = { operation: 'resolveNpcProposal', data: { npcId, answer }, proposalRevision: proposal.createdRevision, npcCastVersion: 1, npcSupportVersion: 1 };
      if (answer === 'decline') {
        const say = npcId === 'chenTeacher' ? '可以，先按你的计划来。准备好具体问题后再讨论。' : '好，今天按你的安排来，等有空了再约。';
        const next = cast.set(state, npcId, { ...get(state, npcId), agent: { ...saved, proposal: null, messages: [...saved.messages, { role: 'user', content: '今天先不了，改天吧。', term: state.term }, { role: 'assistant', content: say, term: state.term }].slice(-12) } });
        return h.commit(state, next, command, { action: 'npcDialogue', title: '暂缓' + cast.profile(npcId).name + '的邀请', changes: game.previewChanges(state, {}), dialogue: { npcId, kind: 'decline', say, gained: 0 } }, check.commandId);
      }
      if (proposal.id === 'basketball') return bad(state, '请先进入球场，完成真实投篮后再结算');
      const result = proposal.id === 'joinEvent' ? attachNpcToEvent(state, npcId, options) : proposal.id === cast.profile(npcId).storyId ? runNpcStory(state, { npcId, choice: npcId === 'zhouNing' ? 'start' : 'prepare' }, options) : game.executeAction(state, proposal.id, { ...options, companionId: npcId, characterVersion: 2, relationshipVersion: 1, npcCastVersion: 1, npcSupportVersion: 1 });
      if (!result.ok) return result;
      const next = cast.set(result.state, npcId, { ...get(result.state, npcId), agent: { ...agent.read(result.state, npcId), proposal: null } });
      if (result.entry.investment) command.investment = result.entry.investment.amount;
      return h.commit(state, next, command, result.entry, check.commandId);
    }
    return { npcCast: cast, npcDirector: director, npcAvailability, npcStoryAvailability, npcStoryCost, npcEventAvailability: eventAvailability, npcCandidates, planNpcDirector, npcOpportunity, recordNpcDialogue, resolveNpcProposal, runNpcStory, attachNpcToEvent, boundEventNpc, finishNpcEvent };
  }
  const api = { install }; if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CampusNpcGame = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
