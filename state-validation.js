(function (root) {
  'use strict';
  function validate(state, game, random) {
    const { RULES, ACTIONS, EVENTS, TERM_NAMES, CHAIN_NAMES } = game;
    const fail = (reason) => ({ ok: false, reason: '存档状态无效：' + reason });
    const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
    const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
    const own = (value, key) => typeof key === 'string' && Object.hasOwn(value, key);
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    try {
      if (!object(state)) return fail('缺少状态对象');
      if (state.version !== RULES.version || state.rulesVersion !== RULES.version || state.saveFormatVersion !== RULES.saveFormatVersion) return fail('格式或规则版本不兼容');
      if (typeof state.appVersion !== 'string' || !state.appVersion.length || state.appVersion.length > 64) return fail('程序版本标记');
      if (!game.validateNickname(state.nickname).ok || state.nickname !== state.nickname.trim()) return fail('昵称');
      if (!integer(state.term, 1, 8) || !['playing', 'eventPending', 'summary', 'endingChoice', 'finished'].includes(state.phase) || !integer(state.revision, 0, 2000)) return fail('学期、阶段或状态版本');
      for (const [key, max] of [['time', 12], ['energy', 100], ['money', 1000000], ['social', 100], ['fitness', 100], ['mood', 100], ['preparation', 100], ['furtherStudy', 100], ['jobPreparation', 100]]) if (!integer(state[key], 0, max)) return fail(key);
      if (!object(state.rng) || state.rng.algorithm !== 'mulberry32-v1' || typeof state.rng.seed !== 'string' || !state.rng.seed.length || state.rng.seed.length > 64 || !integer(state.rng.value, 0, 4294967295) || !integer(state.rng.calls, 2, 100)) return fail('随机数状态');
      if (state.rng.value !== ((random.create(state.rng.seed).value + Math.imul(0x6D2B79F5, state.rng.calls)) >>> 0)) return fail('随机数调用位置');
      if (!same(state.background, game.createGame({ nickname: state.nickname, seed: state.rng.seed }).background)) return fail('入学背景');
      for (const key of ['courses', 'history', 'eventQueue', 'eventHistory', 'experiences', 'processedCommands']) if (!Array.isArray(state[key]) || state[key].length > 2000) return fail(key);
      if (!object(state.counts) || !object(state.eventFlags) || !object(state.chains)) return fail('次数、事件标记或事件链');
      const validCounts = (counts) => object(counts) && Object.entries(counts).every(([id, count]) => own(ACTIONS, id) && integer(count, 0, ACTIONS[id].limit || 12));
      if (!validCounts(state.counts)) return fail('行动次数');
      if (state.history.length !== state.revision || state.processedCommands.length !== state.revision || new Set(state.processedCommands).size !== state.revision) return fail('操作序号');
      for (const [index, entry] of state.history.entries()) {
        if (!object(entry) || entry.revision !== index + 1 || typeof entry.commandId !== 'string' || !entry.commandId.length || entry.commandId.length > 128 || entry.commandId !== state.processedCommands[index] || !integer(entry.term, 1, state.term) || !object(entry.command)) return fail('操作历史');
        const command = entry.command;
        if (!['executeAction', 'submitEventChoice', 'endTerm', 'continueGame', 'chooseEnding'].includes(command.operation)) return fail('历史操作类型');
        if (command.operation === 'executeAction' && !own(ACTIONS, command.id)) return fail('历史行动');
        if (command.operation === 'submitEventChoice' && (!own(EVENTS, entry.event) || !EVENTS[entry.event].choices.some((choice) => choice.id === command.id) || command.eventInstanceId !== entry.instanceId)) return fail('历史事件');
        if (command.operation === 'chooseEnding' && !['ordinary', 'employment', 'furtherStudy', 'notQualified'].includes(command.id)) return fail('历史方向');
        for (const brief of [entry.before, entry.after]) if (!object(brief) || !integer(brief.term, 1, 8) || !['playing', 'eventPending', 'summary', 'endingChoice', 'finished'].includes(brief.phase) || !integer(brief.time, 0, 12) || !integer(brief.energy, 0, 100) || !integer(brief.money, 0, 1000000) || !integer(brief.preparation, 0, 100) || !integer(brief.rngCalls, 2, 100)) return fail('历史状态摘要');
      }
      const expectedCourses = ['summary', 'endingChoice', 'finished'].includes(state.phase) ? state.term : state.term - 1;
      if (state.courses.length !== expectedCourses) return fail('课程记录数量与阶段不符');
      if (!state.courses.every((course, index) => object(course) && course.term === index + 1 && course.name === TERM_NAMES[index] && integer(course.preparation, 0, 100) && course.grade === Math.round(40 + course.preparation * 0.6) && course.passed === (course.grade >= 60) && course.livingCost === 300 && integer(course.aid, 0, 300) && integer(course.moneyAfter, 0, 1000000) && integer(course.unusedTime, 0, 12) && validCounts(course.counts) && Array.isArray(course.notices) && course.notices.every((note) => typeof note === 'string' && note.length < 200) && object(course.attributes) && ['social', 'fitness', 'mood'].every((key) => integer(course.attributes[key], 0, 100)))) return fail('成绩记录');
      if (['summary', 'endingChoice', 'finished'].includes(state.phase)) {
        if (!same(state.summary, state.courses.at(-1)) || state.money !== state.summary.moneyAfter || state.preparation !== state.summary.preparation) return fail('学期总结');
      } else if (state.summary !== null) return fail('未结算阶段存在总结');
      const instanceKey = (instance) => (EVENTS[instance.id].chain || 'daily') + ':' + instance.id + ':' + instance.term;
      const validInstance = (instance) => object(instance) && own(EVENTS, instance.id) && instance.term === state.term && instance.instanceId === instanceKey(instance) && !state.eventFlags[instance.instanceId];
      if ((state.phase === 'eventPending') !== (state.pendingEvent !== null)) return fail('阶段与待处理事件不一致');
      if (state.pendingEvent && !validInstance(state.pendingEvent)) return fail('待处理事件');
      if (!state.eventQueue.every(validInstance) || (!state.pendingEvent && state.eventQueue.length)) return fail('事件队列');
      const instances = [...state.eventQueue, ...(state.pendingEvent ? [state.pendingEvent] : [])];
      if (instances.length > Object.keys(EVENTS).length || new Set(instances.map((item) => item.instanceId)).size !== instances.length) return fail('重复事件实例');
      const seen = new Set();
      for (const entry of state.eventHistory) {
        if (!object(entry) || !own(EVENTS, entry.event) || !integer(entry.term, 1, state.term) || entry.instanceId !== (EVENTS[entry.event].chain || 'daily') + ':' + entry.event + ':' + entry.term || !EVENTS[entry.event].choices.some((choice) => choice.id === entry.choice) || state.eventFlags[entry.instanceId] !== true || seen.has(entry.instanceId)) return fail('事件历史');
        seen.add(entry.instanceId);
      }
      for (const [key, value] of Object.entries(state.eventFlags)) if (value !== true || (!/^randomCampusRoll:[1-8]$/.test(key) && !seen.has(key))) return fail('事件标记与历史不一致');
      for (const id of Object.keys(CHAIN_NAMES)) {
        const chain = state.chains[id];
        if (!object(chain) || !['idle', 'active', 'deferred', 'completed', 'missed'].includes(chain.status) || !integer(chain.progress, 0, 2) || !integer(chain.startedTerm, 0, state.term) || !integer(chain.deadline, 0, 8) || !integer(chain.nextEligibleTerm, 1, 9) || !integer(chain.reviewAfter, 0, 8)) return fail('事件链字段');
        if (['active', 'completed', 'missed'].includes(chain.status) && (!chain.startedTerm || chain.deadline < chain.startedTerm)) return fail('事件链时序');
        if (['idle', 'deferred'].includes(chain.status) && (chain.progress || chain.startedTerm || chain.deadline)) return fail('未加入事件链有投入');
        if (chain.status === 'completed' && chain.progress !== 2) return fail('完成事件链缺少投入');
      }
      if (Object.keys(state.chains).length !== 3) return fail('未知事件链');
      const experienceIds = new Set();
      for (const item of state.experiences) {
        if (!object(item) || !integer(item.term, 1, state.term) || !['fitnessTest', 'project', 'club', 'internship'].includes(item.type)) return fail('经历');
        const key = item.type === 'fitnessTest' ? item.type + ':' + item.term : item.type;
        if (experienceIds.has(key)) return fail('重复经历');
        experienceIds.add(key);
        if (item.type === 'fitnessTest' && (item.term % 2 !== 0 || !integer(item.fitness, 60, 100))) return fail('体测经历');
      }
      for (const id of Object.keys(CHAIN_NAMES)) if ((state.chains[id].status === 'completed') !== experienceIds.has(id)) return fail('事件链与经历不一致');
      for (const instance of instances) {
        const event = EVENTS[instance.id];
        if (event.chain && (instance.id.endsWith('Offer') ? !['idle', 'deferred'].includes(state.chains[event.chain].status) : state.chains[event.chain].status !== 'active' || state.chains[event.chain].progress !== 2)) return fail('事件与事件链不一致');
      }
      if (['endingChoice', 'finished'].includes(state.phase)) {
        if (state.term !== 8 || !same(state.endingOptions, game.evaluateEndings(state))) return fail('毕业条件快照');
      } else if (state.endingOptions !== null) return fail('提前评估毕业方向');
      if (state.phase === 'finished') {
        const ending = state.endingOptions.options.find((item) => item.id === state.result?.direction && item.available);
        if (!ending || state.result.title !== ending.title || !same(state.result.requirements, ending.requirements) || state.result.average !== state.endingOptions.average || state.result.passed !== state.endingOptions.passed || !same(state.result.courses, state.courses) || !same(state.result.experiences, state.experiences)) return fail('最终结果');
      } else if (state.result !== null) return fail('提前生成结果');
      return { ok: true };
    } catch (_) { return fail('字段缺失或类型错误'); }
  }
  const api = { validate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CampusStateValidation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
