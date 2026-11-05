(function (root) {
  'use strict';
  function validate(state, game, random) {
    const { RULES, ACTIONS, EVENTS, EVENT_INVESTMENTS, BASKETBALL, TERM_NAMES, CHAIN_NAMES, COURSES, SUBJECTS, QUESTIONS, LEGACY_QUESTIONS, TERMINAL_ENDINGS, gradeFor, ratingFor, NPC_CHAT } = game;
    const fail = (reason) => ({ ok: false, reason: '存档状态无效：' + reason });
    const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
    const usesSupport = Array.isArray(state?.history) && state.history.some(entry => entry?.command?.npcSupportVersion === 1);
    const attribute = (value, min = 0, max = 100) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max && (usesSupport ? game.npcSupport.round(value) === value : Number.isInteger(value));
    const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
    const own = (value, key) => typeof key === 'string' && Object.hasOwn(value, key);
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const validInvestment = entry => {
      if (entry.investment === undefined) return true; // Earlier saves have fixed event rewards.
      let profiles;
      if (entry.action && ['executeAction', 'resolveZhouNingProposal','resolveNpcProposal'].includes(entry.command?.operation)) {
        // A successful transfer changes the current bonus, but earlier allocations
        // still use the original college's discount and must remain readable.
        const original = game.createGame({ seed: state.rng.seed }).background;
        profiles = [state.background, original].map(background => game.getActionInvestment({ ...state, background }, entry.action) || game.LEGACY_INVESTMENTS.actions[entry.action]);
      } else profiles = [EVENT_INVESTMENTS[entry.event + ':' + entry.choice] || game.LEGACY_INVESTMENTS.events[entry.event + ':' + entry.choice]];
      const value = entry.investment;
      return profiles.some(profile => profile && object(value) && integer(value.amount, profile.min, profile.max) && value.resource === profile.resource
        && ['light', 'steady', 'deep'].includes(value.level) && Object.hasOwn(profile.outcomes, value.outcome)
        && (value.tier === undefined || profile.tiers?.some(tier => tier.id === value.tier && tier.amount === value.amount))
        && typeof value.description === 'string' && value.description.length > 0 && value.description.length <= 1000);
    };
    try {
      if (!object(state)) return fail('缺少状态对象');
      if (state.version !== RULES.version || state.rulesVersion !== RULES.version || state.saveFormatVersion !== RULES.saveFormatVersion) return fail('格式或规则版本不兼容');
      if (typeof state.appVersion !== 'string' || !state.appVersion.length || state.appVersion.length > 64) return fail('程序版本标记');
      // 昵称在创建时严格校验（见 game.validateNickname）；旧档可能含宽松规则的昵称，加载时只做基本检查。
      if (typeof state.nickname !== 'string' || !state.nickname.trim() || state.nickname !== state.nickname.trim() || [...state.nickname].length > 12 || /[\u0000-\u001f\u007f]/.test(state.nickname)) return fail('昵称');
      if (!integer(state.term, 1, 8) || !['playing', 'eventPending', 'examPending', 'summary', 'endingChoice', 'finished', 'ended'].includes(state.phase) || !integer(state.revision, 0, 2000)) return fail('学期、阶段或状态版本');
      for (const [key, max] of [['time', 12], ['energy', 100], ['money', 1000000], ['social', 100], ['fitness', 100], ['mood', 100], ['preparation', 100], ['furtherStudy', 100], ['jobPreparation', 100]]) if (!(['time', 'energy', 'money'].includes(key) ? integer(state[key], 0, max) : attribute(state[key], 0, max))) return fail(key);
      // 旧存档没有选课/考试字段，读取时按“未选课”处理；一旦存在就必须结构完整。
      const selectedCourses = state.selectedCourses === undefined ? [] : state.selectedCourses;
      if (!Array.isArray(selectedCourses) || ![0, 3].includes(selectedCourses.length) || new Set(selectedCourses).size !== selectedCourses.length || !selectedCourses.every((id) => COURSES.some((course) => course.id === id))) return fail('选课记录');
      const exam = state.exam === undefined ? null : state.exam;
      if (exam !== null) {
        if (!object(exam) || !Array.isArray(exam.questions) || exam.questions.length !== 5 || !Array.isArray(exam.answers) || ![0, 5].includes(exam.answers.length) || !Array.from(exam.answers).every((answer) => answer === null || integer(answer, 0, 3)) || exam.score !== null || exam.submitted !== false) return fail('试卷结构');
        if (exam.generator !== undefined && exam.generator !== 'v2') return fail('试卷版本');
        if (!exam.questions.every((question) => object(question) && typeof question.id === 'string' && question.id.length < 80 && typeof question.prompt === 'string' && question.prompt.length < 500 && Array.isArray(question.options) && question.options.length === 4 && question.options.every((option) => typeof option === 'string' && option.length < 200) && integer(question.answer, 0, 3) && question.points === 20 && own(SUBJECTS, question.subject) && COURSES.some((course) => course.id === question.courseId) && typeof question.courseName === 'string' && question.courseName.length < 200)) return fail('试卷题目');
        if (exam.generator !== 'v2') {
          const legacyMatch = (question) => {
            const bank = [...(LEGACY_QUESTIONS[question.subject] || []), ...(QUESTIONS[question.subject] || [])].find((item) => item.id === question.id);
            return !!bank && bank.prompt === question.prompt && bank.answer === question.answer && bank.options.length === question.options.length && bank.options.every((option, index) => option === question.options[index]);
          };
          if (!exam.questions.every(legacyMatch)) return fail('旧试卷内容');
        }
      }
      if ((state.phase === 'examPending') !== (exam !== null)) return fail('阶段与试卷不一致');
      if (!object(state.rng) || state.rng.algorithm !== 'mulberry32-v1' || typeof state.rng.seed !== 'string' || !state.rng.seed.length || state.rng.seed.length > 64 || !integer(state.rng.value, 0, 4294967295) || !integer(state.rng.calls, 2, 2010)) return fail('随机数状态');
      if (state.rng.value !== ((random.create(state.rng.seed).value + Math.imul(0x6D2B79F5, state.rng.calls)) >>> 0)) return fail('随机数调用位置');
      // 入学背景核对：转专业成功才会更换学院方向。新存档按操作历史重放精确核对；
      // 旧版本存档或无法重放的存档退化为结构校验（学院、专业必须与配置一致，未转专业时必须与入学时一致）。
      // 重放需要创建时合法的新昵称，旧档昵称不合新规则时用默认昵称重放（昵称不参与随机数抽取，入学背景不受影响）。
      const replayNickname = game.validateNickname(state.nickname).ok ? state.nickname : '北交同学';
      const initialBackground = game.createGame({ nickname: replayNickname, seed: state.rng.seed }).background;
      const backgroundReplay = game.replay({ nickname: replayNickname, seed: state.rng.seed, commands: state.history.map((entry) => entry.command) });
      if (usesSupport && (!backgroundReplay.ok || !['time', 'energy', 'money', 'social', 'fitness', 'mood', 'preparation', 'furtherStudy', 'jobPreparation', 'rng'].every(key => same(state[key], backgroundReplay.state[key])))) return fail('玩家收获与辅助结算历史不一致');
      const transferred = state.eventHistory.some((entry) => entry.event === 'transferResult' && entry.choice === 'check') && state.experiences.some((item) => item.type === 'transfer');
      const legacyBackground = (background) => game.BACKGROUNDS.some((item) => item.id === background.id && item.college === background.college && (item.legacyMajors || []).includes(background.major));
      const validBackground = (background) => game.BACKGROUNDS.some((item) => item.id === background.id && item.college === background.college && item.majors.includes(background.major));
      const legacy = legacyBackground(state.background);
      const backgroundOk = legacy
        ? (transferred ? state.background.id !== initialBackground.id : state.background.id === initialBackground.id)
        : (backgroundReplay.ok ? same(state.background, backgroundReplay.state.background) : validBackground(state.background) && (transferred ? state.background.id !== initialBackground.id : same(state.background, initialBackground)));
      if (!backgroundOk) return fail('入学背景');
      if (backgroundReplay.ok && !legacy) {
        if (!same(selectedCourses, backgroundReplay.state.selectedCourses)) return fail('选课记录');
        // v2 试卷可精确重放；旧版试卷由上面的题库内容比对保护，避免生成算法升级后无法读取。
        if (exam !== null && exam.generator === 'v2' && !same(exam, backgroundReplay.state.exam)) return fail('试卷内容');
      }
      for (const key of ['courses', 'history', 'eventQueue', 'eventHistory', 'experiences', 'processedCommands']) if (!Array.isArray(state[key]) || state[key].length > 2000) return fail(key);
      if (!object(state.counts) || !object(state.eventFlags) || !object(state.chains)) return fail('次数、事件标记或事件链');
      const validCounts = (counts) => object(counts) && Object.entries(counts).every(([id, count]) => own(ACTIONS, id) && integer(count, 0, ACTIONS[id].limit || 12));
      if (!validCounts(state.counts)) return fail('行动次数');
      // 旧存档没有 NPC 聊天计数字段，读取时按空对象处理；一旦存在就校验结构与交叉约束。
      const npcChats = state.npcChats === undefined ? {} : state.npcChats;
      if (!object(npcChats)) return fail('NPC 聊天计数');
      const academicSet = new Set(NPC_CHAT.academicIdentities);
      let chargedIdentities = 0;
      for (const [id, record] of Object.entries(npcChats)) {
        if (!own(NPC_CHAT.identities, id)) return fail('NPC 聊天身份');
        if (!object(record) || !integer(record.messages, 0, 200) || !integer(record.rewards, 0, NPC_CHAT.rewardMessagesPerIdentity) || !integer(record.preps, 0, NPC_CHAT.academicPrepPerIdentity) || typeof record.timeCharged !== 'boolean') return fail('NPC 聊天计数');
        if (record.rewards > record.messages) return fail('NPC 聊天收益次数');
        if (record.preps > record.rewards) return fail('NPC 聊天指点次数');
        if (!academicSet.has(id) && record.preps !== 0) return fail('NPC 聊天指点身份');
        if (record.timeCharged && record.messages < 1) return fail('NPC 聊天时间标记');
        if (record.timeCharged) chargedIdentities++;
      }
      if (chargedIdentities > NPC_CHAT.timeChargeCapPerTerm) return fail('NPC 聊天时间上限');
      if (state.history.length !== state.revision || state.processedCommands.length !== state.revision || new Set(state.processedCommands).size !== state.revision) return fail('操作序号');
      for (const [index, entry] of state.history.entries()) {
        if (!object(entry) || entry.revision !== index + 1 || typeof entry.commandId !== 'string' || !entry.commandId.length || entry.commandId.length > 128 || entry.commandId !== state.processedCommands[index] || !integer(entry.term, 1, state.term) || !object(entry.command)) return fail('操作历史');
        const command = entry.command;
        if (command.npcCastVersion !== undefined && (command.npcCastVersion !== 1 || !['executeAction','completeBasketball','submitEventChoice','recordNpcDialogue','resolveNpcProposal','runNpcStory','attachNpcToEvent'].includes(command.operation))) return fail('多人物命令版本');
        if (['recordNpcDialogue','resolveNpcProposal','runNpcStory','attachNpcToEvent'].includes(command.operation) && (!backgroundReplay.ok || !same(entry, {...backgroundReplay.state.history[index], commandId: entry.commandId}))) return fail('人物会话与历史不一致');
        if (command.npcSupportVersion !== undefined && (command.npcSupportVersion !== 1 || !['executeAction', 'completeBasketball', 'submitEventChoice', 'resolveZhouNingProposal', 'runNpcStory', 'resolveNpcProposal'].includes(command.operation))) return fail('人物辅助规则版本');
        const replaySupport = backgroundReplay.ok ? backgroundReplay.state.history[index]?.support : undefined;
        if ((entry.support !== undefined || replaySupport !== undefined) && (!backgroundReplay.ok || !same(entry.support, replaySupport) || !same(entry.changes, backgroundReplay.state.history[index].changes))) return fail('人物辅助收益与历史不一致');
        if (!['executeAction', 'completeBasketball', 'submitEventChoice', 'selectCourses', 'beginExam', 'updateExamAnswers', 'submitExam', 'cheatExam', 'endTerm', 'continueGame', 'chooseEnding', 'chatWithNpc', 'interactWithZhouNing', 'recordZhouNingDialogue', 'resolveZhouNingProposal', 'recordNpcDialogue', 'resolveNpcProposal', 'runNpcStory', 'attachNpcToEvent'].includes(command.operation)) return fail('历史操作类型');
        if (command.operation === 'recordZhouNingDialogue' && (!object(command.data) || !backgroundReplay.ok || !same(entry.dialogue, backgroundReplay.state.history[index]?.dialogue) || !same(entry.changes, backgroundReplay.state.history[index]?.changes))) return fail('人物对话与历史不一致');
        if (command.operation === 'resolveZhouNingProposal' && (!['accept', 'decline'].includes(command.id) || !integer(command.proposalRevision, 1, entry.revision - 1) || !backgroundReplay.ok || !same(entry, { ...backgroundReplay.state.history[index], commandId: entry.commandId }))) return fail('人物邀请与历史不一致');
        if (command.agentProposalRevision !== undefined && (command.operation !== 'completeBasketball' || !integer(command.agentProposalRevision, 1, entry.revision - 1))) return fail('球场邀请记录');
        if (command.zhouCameo !== undefined && (command.operation !== 'submitEventChoice' || command.zhouCameo !== true || !own(game.characterAgent.CAMEOS, entry.event))) return fail('偶遇事件记录');
        if (command.operation === 'executeAction' && (!own(ACTIONS, command.id) || command.id !== entry.action)) return fail('历史行动');
        if (command.relationshipVersion !== undefined && (command.operation !== 'executeAction' || command.relationshipVersion !== 1)) return fail('历史人物关系版本');
        if (command.characterVersion !== undefined && (command.characterVersion !== 2 || !['executeAction', 'completeBasketball', 'interactWithZhouNing'].includes(command.operation))) return fail('历史人物同行版本');
        if (command.companionId !== undefined && (command.npcCastVersion === 1 ? !game.npcCast.profile(command.companionId) || !['executeAction', 'completeBasketball', 'submitEventChoice'].includes(command.operation) : command.companionId !== 'zhouNing' || !(command.operation === 'executeAction' && command.relationshipVersion === 1 && (command.id === 'selfStudy' || command.characterVersion === 2 && own(game.relationshipRules.ACTIVITIES, command.id)) || command.operation === 'completeBasketball' && command.characterVersion === 2))) return fail('历史同行人物');
        if (command.operation === 'interactWithZhouNing' && !['talk', 'presentation'].includes(command.id)) return fail('历史人物互动');
        const replayRelation = backgroundReplay.ok ? backgroundReplay.state.history[index]?.relationship : undefined;
        if ((entry.relationship !== undefined || replayRelation !== undefined) && (!backgroundReplay.ok || !same(entry.relationship, replayRelation) || !same(entry.changes, backgroundReplay.state.history[index].changes))) return fail('人物互动结果与历史不一致');
        if (command.operation === 'completeBasketball') {
          if (!integer(command.hits, 0, BASKETBALL.maxHits) || entry.action !== 'basketball') return fail('历史篮球');
          const reward = game.basketballReward(command.hits);
          if (entry.hits !== command.hits || entry.score !== reward.score || entry.tier !== reward.id) return fail('历史篮球结果');
        }
        const syntheticExit = command.id === 'sickLeave' && entry.choice === 'sickLeave';
        if (command.operation === 'submitEventChoice' && (!own(EVENTS, entry.event) || (!syntheticExit && !EVENTS[entry.event].choices.some((choice) => choice.id === command.id)) || command.eventInstanceId !== entry.instanceId)) return fail('历史事件');
        if (command.operation === 'selectCourses' && (!Array.isArray(command.id) || command.id.length !== 3 || new Set(command.id).size !== 3 || !command.id.every((id) => COURSES.some((course) => course.id === id)))) return fail('历史选课');
        if (command.operation === 'updateExamAnswers' && (!Array.isArray(command.id) || command.id.length !== 5 || !Array.from(command.id).every((answer) => answer === null || integer(answer, 0, 3)))) return fail('历史答题草稿');
        if (command.operation === 'submitExam' && (!Array.isArray(command.id) || command.id.length !== 5 || !command.id.every((answer) => integer(answer, 0, 3)))) return fail('历史考试答案');
        if (!validInvestment(entry) || command.investment !== entry.investment?.amount) return fail('历史事件投入');
        if (command.operation === 'chooseEnding' && !['ordinary', 'employment', 'furtherStudy', 'notQualified', 'delayed', 'blankResume'].includes(command.id)) return fail('历史方向');
        if (command.operation === 'chatWithNpc' && (!own(NPC_CHAT.identities, command.identityId) || !integer(command.quality, 0, 2))) return fail('历史对话');
        for (const brief of [entry.before, entry.after]) if (!object(brief) || !integer(brief.term, 1, 8) || !['playing', 'eventPending', 'examPending', 'summary', 'endingChoice', 'finished', 'ended'].includes(brief.phase) || !integer(brief.time, 0, 12) || !integer(brief.energy, 0, 100) || !integer(brief.money, 0, 1000000) || !attribute(brief.preparation, 0, 100) || !integer(brief.rngCalls, 2, 2010)) return fail('历史状态摘要');
      }
      const relation = state.relationships;
      if (relation !== undefined) {
        if (!object(relation) || relation.version !== 1 || typeof relation.introSeen !== 'boolean' || relation.term !== state.term || !integer(relation.talks, 0, 2) || !integer(relation.talkGrowth, 0, 8) || !integer(relation.interactions, 0, relation.zhouNing?.life ? 4 : 2)) return fail('人物关系字段');
        const person = relation.zhouNing;
        if (person?.abilities !== undefined && (!object(person.abilities) || Object.keys(person.abilities).length !== 3 || !['academic', 'social', 'sport'].every(key => integer(person.abilities[key], 0, 100)))) return fail('人物的三项能力');
        if (person !== null && (!object(person) || !integer(person.metTerm, 1, state.term) || !integer(person.familiarity, 0, 100) || !integer(person.studies, 0, 24) || !Array.isArray(person.memories) || new Set(person.memories).size !== person.memories.length || !person.memories.every(id => own(game.relationshipRules.MEMORIES, id)) || ![null, 'limited', 'steady', 'good', 'encouraged'].includes(person.presentation) || !relation.introSeen)) return fail('周宁关系记录');
        if (person?.life !== undefined) {
          const life = person.life;
          if (!object(life) || !integer(life.mood, 0, 100) || !integer(life.energy, 0, 100) || !['presentation', 'explore'].includes(life.goal) || !own(game.PLACES, life.lastPlace) || !(life.lastActivity === null || own(game.relationshipRules.ACTIVITIES, life.lastActivity)) || !object(life.activities) || !Object.entries(life.activities).every(([id, count]) => own(game.relationshipRules.ACTIVITIES, id) && integer(count, 1, 96))) return fail('周宁的生活状态');
        }
        if (person?.agent !== undefined) {
          const agent = person.agent;
          if (!backgroundReplay.ok || !object(agent) || !integer(agent.term, 1, state.term) || !Array.isArray(agent.messages) || agent.messages.length > 12
              || !agent.messages.every(item => object(item) && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string' && item.content.length > 0 && item.content.length <= 240 && integer(item.term, 1, state.term))
              || !Array.isArray(agent.checked) || agent.checked.length > 4 || !integer(agent.invitations, 0, 2) || !integer(agent.lastInviteAction, -3, 2000) || !integer(agent.chats, 0, 120)
              || !Array.isArray(agent.topics) || agent.topics.length > 4 || !agent.topics.every(id => ['care', 'goal', 'likes', 'memory'].includes(id))
              || !Array.isArray(agent.notes) || agent.notes.length > 4 || !agent.notes.every(item => object(item) && ['care', 'goal', 'likes', 'memory'].includes(item.topic) && typeof item.text === 'string' && item.text.length <= 240 && integer(item.term, 1, state.term))
              || agent.proposal !== null && (!object(agent.proposal) || !(own(game.relationshipRules.ACTIVITIES, agent.proposal.id) || agent.proposal.id === 'presentation' || agent.proposal.id === 'joinEvent' && agent.proposal.npcId === 'zhouNing') || !integer(agent.proposal.createdRevision, 1, state.revision) || !integer(agent.proposal.term, 1, state.term))
              || agent.cameo !== null && (!object(agent.cameo) || !own(game.characterAgent.CAMEOS, agent.cameo.eventId) || typeof agent.cameo.say !== 'string' || agent.cameo.say.length > 180)) return fail('周宁的对话与邀请状态');
        }
        if (person === null && (relation.talks || relation.talkGrowth || relation.interactions)) return fail('未相识的人物互动');
        if (backgroundReplay.ok ? !same(relation, backgroundReplay.state.relationships) : relation.introSeen || person !== null) return fail('人物关系与操作历史不一致');
      } else if (backgroundReplay.ok && backgroundReplay.state.relationships.introSeen) return fail('缺少人物关系记录');
      if (relation?.people !== undefined || relation?.director !== undefined || relation?.eventCompanion !== undefined) {
        if (!backgroundReplay.ok || !same(relation, backgroundReplay.state.relationships)) return fail('多人物状态与历史不一致');
        if (relation.people !== undefined && (!object(relation.people) || Object.keys(relation.people).some(id => !['chenTeacher','linXia'].includes(id)))) return fail('人物索引');
        for (const [id, person] of Object.entries(relation.people || {})) {
          if (!object(person) || !integer(person.metTerm,1,state.term) || !integer(person.familiarity,0,100) || !integer(person.studies,0,96) || !object(person.abilities) || Object.keys(person.abilities).length !== 3 || !['academic','social','sport'].every(key=>integer(person.abilities[key],0,100)) || !Array.isArray(person.memories) || !person.memories.every(key=>own(game.npcCast.MEMORIES,key))) return fail('新增人物资料');
          const life=person.life, usage=person.usage;
          if (!object(life) || !integer(life.energy,0,100) || !integer(life.mood,0,100) || ![game.npcCast.profile(id).goalId,'explore'].includes(life.goal) || !own(game.PLACES,life.lastPlace) || !(life.lastActivity===null || own(ACTIONS,life.lastActivity)) || !object(life.activities) || !Object.entries(life.activities).every(([key,count])=>own(ACTIONS,key)&&integer(count,1,96))) return fail('新增人物生活状态');
          if (!object(usage) || !integer(usage.term,1,state.term) || !integer(usage.interactions,0,id==='chenTeacher'?2:4) || !integer(usage.talkGrowth,0,8) || !integer(usage.talks,0,2)) return fail('人物互动次数');
          if (person.agent !== undefined) {
            const a=person.agent;
            if (!object(a)||!integer(a.term,1,state.term)||!Array.isArray(a.messages)||a.messages.length>12||!a.messages.every(m=>object(m)&&['user','assistant'].includes(m.role)&&typeof m.content==='string'&&m.content.length<=240&&integer(m.term,1,state.term))||!integer(a.chats,0,120)||!Array.isArray(a.notes)||a.notes.length>4||!Array.isArray(a.topics)||a.topics.length>4) return fail('独立人物对话');
            if(a.proposal!==null && (!object(a.proposal)||a.proposal.npcId!==id||!integer(a.proposal.createdRevision,1,state.revision)||!integer(a.proposal.term,1,state.term)||!(game.npcCast.profile(id).activities.includes(a.proposal.id)||a.proposal.id===game.npcCast.profile(id).storyId||a.proposal.id==='joinEvent'))) return fail('人物邀请归属');
          }
        }
        const d=relation.director;
        if(d!==undefined && (!object(d)||d.version!==1||!integer(d.term,1,state.term)||!integer(d.intros,0,2)||!integer(d.invitations,0,2)||!integer(d.attempts,0,6)||!integer(d.lastAction,-2,2000)||!Array.isArray(d.checked)||d.checked.length>6||!Array.isArray(d.recent)||d.recent.length>16||!d.recent.every(item=>game.npcCast.profile(item.npcId)&&integer(item.serial,0,2000)&&integer(item.term,1,state.term)&&['meet','proactive','cameo'].includes(item.kind)))) return fail('人物出场调度');
        if(d?.pending && (!object(d.pending)||!game.npcCast.profile(d.pending.npcId)||!['meet','proactive','cameo'].includes(d.pending.kind)||!own(game.PLACES,d.pending.place)||!Array.isArray(d.pending.candidates)||d.pending.candidates.length>6||!Array.isArray(d.pending.scores)||d.pending.scores.length>3)) return fail('待发生人物出场');
        if(relation.eventCompanion!==undefined && relation.eventCompanion!==null && (!object(relation.eventCompanion)||!game.npcCast.get(state,relation.eventCompanion.npcId)||relation.eventCompanion.instanceId!==state.pendingEvent?.instanceId)) return fail('当前事件人物绑定');
      }
      const expectedCourses = ['summary', 'endingChoice', 'finished'].includes(state.phase) ? state.term : state.term - 1;
      if (state.courses.length !== expectedCourses) return fail('课程记录数量与阶段不符');
      const validCourse = (course, index) => {
        if (!object(course) || course.term !== index + 1 || course.name !== TERM_NAMES[index] || !attribute(course.preparation, 0, 100) || course.passed !== (course.grade >= 60) || course.livingCost !== 300 || !integer(course.aid, 0, 300) || !integer(course.moneyAfter, 0, 1000000) || !integer(course.unusedTime, 0, 12) || !validCounts(course.counts) || !Array.isArray(course.notices) || !course.notices.every((note) => typeof note === 'string' && note.length < 200) || !object(course.attributes) || !['social', 'fitness', 'mood'].every((key) => attribute(course.attributes[key], 0, 100))) return false;
        const legacy = course.grade === Math.round(40 + course.preparation * 0.6);
        const examined = attribute(course.usualScore, 0, 100) && course.usualScore === course.preparation && integer(course.examScore, 0, 100) && course.examScore % 20 === 0 && course.grade === gradeFor(course.usualScore, course.examScore) && course.rating === ratingFor(course.grade) && Array.isArray(course.courseIds) && course.courseIds.length === 3 && new Set(course.courseIds).size === 3 && course.courseIds.every((id) => COURSES.some((item) => item.id === id)) && Array.isArray(course.courseNames) && course.courseNames.length === 3 && course.courseNames.every((name) => typeof name === 'string' && name.length < 200);
        return legacy || examined;
      };
      if (!state.courses.every(validCourse)) return fail('成绩记录');
      if (['summary', 'endingChoice', 'finished'].includes(state.phase)) {
        if (!same(state.summary, state.courses.at(-1)) || state.money !== state.summary.moneyAfter || state.preparation !== state.summary.preparation) return fail('学期总结');
      } else if (state.summary !== null) return fail('未结算阶段存在总结');
      const instanceKey = (instance) => (EVENTS[instance.id].chain || 'daily') + ':' + instance.id + ':' + instance.term;
      const validInstance = (instance) => object(instance) && own(EVENTS, instance.id) && instance.term === state.term && instance.instanceId === instanceKey(instance) && !state.eventFlags[instance.instanceId];
      if ((state.phase === 'eventPending') !== (state.pendingEvent !== null)) return fail('阶段与待处理事件不一致');
      if (state.pendingEvent && !validInstance(state.pendingEvent)) return fail('待处理事件');
      if (!state.eventQueue.every(validInstance) || (!state.pendingEvent && state.eventQueue.length)) return fail('事件队列');
      const instances = [...state.eventQueue, ...(state.pendingEvent ? [state.pendingEvent] : [])];
      if (instances.some(item => item.id === 'zhouNingMeet') && (!relation?.introSeen || relation.zhouNing !== null)) return fail('初识事件与人物关系不一致');
      if (instances.some(item => item.id === 'zhouNingPresentation') && (!relation?.zhouNing || relation.zhouNing.familiarity < 30 || relation.zhouNing.studies < 1 && !Object.values(relation.zhouNing.life?.activities || {}).some(count => count > 0) || relation.zhouNing.presentation !== null)) return fail('人物事件尚未解锁');
      if (instances.length > Object.keys(EVENTS).length || new Set(instances.map((item) => item.instanceId)).size !== instances.length) return fail('重复事件实例');
      const seen = new Set();
      for (const entry of state.eventHistory) {
        const syntheticExit = entry.choice === 'sickLeave';
        if (!object(entry) || !own(EVENTS, entry.event) || !integer(entry.term, 1, state.term) || entry.instanceId !== (EVENTS[entry.event].chain || 'daily') + ':' + entry.event + ':' + entry.term || (!syntheticExit && !EVENTS[entry.event].choices.some((choice) => choice.id === entry.choice)) || state.eventFlags[entry.instanceId] !== true || seen.has(entry.instanceId)) return fail('事件历史');
        if (!validInvestment(entry) || (entry.investment && !state.history.some(log => log.instanceId === entry.instanceId && same(log.investment, entry.investment) && same(log.changes, entry.changes)))) return fail('事件投入记录');
        seen.add(entry.instanceId);
      }
      // fitnessRetest 与 cardPocketed 是跨学期的持久标记，不属于事件实例标记。
      for (const [key, value] of Object.entries(state.eventFlags)) if (value !== true || (!/^randomCampusRoll:[1-8]$/.test(key) && !['fitnessRetest', 'cardPocketed'].includes(key) && !seen.has(key))) return fail('事件标记与历史不一致');
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
        if (!object(item) || !integer(item.term, 1, state.term) || !['fitnessTest', 'project', 'club', 'internship', 'military', 'singer', 'trip', 'contest', 'sportsMeet', 'transfer'].includes(item.type)) return fail('经历');
        // 体测与运动会每个学年都可能留下经历，按学期区分；其余经历全局唯一。
        const key = ['fitnessTest', 'sportsMeet'].includes(item.type) ? item.type + ':' + item.term : item.type;
        if (experienceIds.has(key)) return fail('重复经历');
        experienceIds.add(key);
        if (item.type === 'fitnessTest' && !attribute(item.fitness, 60, 100)) return fail('体测经历');
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
        if (!ending || state.result.kind !== 'graduation' || state.result.term !== 8 || state.result.title !== ending.title || !same(state.result.requirements, ending.requirements) || state.result.average !== state.endingOptions.average || state.result.passed !== state.endingOptions.passed || !same(state.result.courses, state.courses) || !same(state.result.experiences, state.experiences)) return fail('最终结果');
      } else if (state.phase === 'ended') {
        const terminal = TERMINAL_ENDINGS[state.result?.direction];
        const expectedPassed = state.courses.filter((item) => item.passed).length;
        const expectedAverage = state.courses.length ? state.courses.reduce((sum, item) => sum + item.grade, 0) / state.courses.length : 0;
        if (!terminal || state.result.kind !== 'terminal' || state.result.title !== terminal.title || state.result.term !== state.term || typeof state.result.reason !== 'string' || !state.result.reason.length || state.result.reason.length > 300 || !Array.isArray(state.result.requirements) || state.result.requirements.length !== 0 || state.result.average !== expectedAverage || state.result.passed !== expectedPassed || !same(state.result.courses, state.courses) || !same(state.result.experiences, state.experiences)) return fail('最终结果');
      } else if (state.result !== null) return fail('提前生成结果');
      return { ok: true };
    } catch (_) { return fail('字段缺失或类型错误'); }
  }
  const api = { validate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CampusStateValidation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
