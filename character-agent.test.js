'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('./game.js');
const agent = game.characterAgent;
const cast = game.npcCast;

test('固定人物长上下文优先保留本人的最近六轮完整问答', () => {
  const npcId = 'linXia';
  let state = cast.meet(cast.meet(game.createGame({ seed: 'dialogue-context' }), npcId), 'zhouNing');
  function chat(id, text, say) {
    const result = game.recordNpcDialogue(state, { npcId: id, kind: 'chat', text, say, intent: 'none', source: 'online' });
    assert.equal(result.ok, true, result.reason);
    state = result.state;
  }
  const texts = ['开头一轮', '最近好累', '以后想准备展示', '我喜欢晚跑', '记得我提过榆树吗', '接力练习一', '接力练习二'].map(text => text.padEnd(240, '甲'));
  const replies = texts.map((_, i) => ('林夏回复' + i).padEnd(180, '乙'));
  texts.forEach((text, i) => chat(npcId, text, replies[i]));
  chat('zhouNing', '周宁话题记号', '周宁回复记号');
  const lin = cast.get(state, npcId);
  state = cast.set(state, npcId, {
    ...lin,
    memories: Object.keys(cast.MEMORIES),
    agent: { ...lin.agent, messages: Array.from({ length: 12 }, (_, i) => ({ role: 'assistant', content: '偶遇台词' + i })) }
  });
  const candidates = cast.profile(npcId).activities.map(id => ({ id, label: cast.activityLabel(npcId, id) }));
  const current = { role: 'user', content: '我上次说过什么？' };
  const payload = agent.messages(state, current.content, candidates, null, npcId);
  assert.ok(payload.length <= 14);
  assert.ok(payload.every(row => row.content.length <= 600));
  assert.ok(payload.filter(row => row.role === 'system').some(row => row.content.includes(candidates.at(-1).id)));
  assert.deepEqual(payload.at(-1), current);
  assert.doesNotMatch(JSON.stringify(payload), /周宁话题记号|周宁回复记号/);
  const exchanged = payload.slice(0, -1).filter(row => row.role !== 'system');
  const earlier = exchanged.slice(0, 4);
  earlier.forEach((row, i) => {
    assert.equal(row.role, 'user');
    assert.match(row.content, /^历史问答/);
    assert.ok(row.content.includes('玩家原话：' + texts[i + 1] + '\n人物原话：' + replies[i + 1]));
  });
  assert.deepEqual(exchanged.slice(4), texts.slice(-2).flatMap((text, i) => [
    { role: 'user', content: text },
    { role: 'assistant', content: replies.at(i - 2) }
  ]));
});

test('固定人物续聊能读取旧版周宁历史和旧档的近期消息', () => {
  const npcId = 'zhouNing';
  let state = cast.meet(game.createGame({ seed: 'older-dialogue-context' }), npcId);
  state = cast.set(state, npcId, { ...cast.get(state, npcId), agent: {
    ...agent.read(state, npcId),
    messages: [{ role: 'user', content: '旧档保留的原话' }, { role: 'assistant', content: '旧档保留的回应' }]
  } });
  const recent = input => agent.messages(input, '继续聊', [], null, npcId).filter(row => row.role !== 'system');
  assert.deepEqual(recent(state).slice(0, 2).map(row => row.content), ['旧档保留的原话', '旧档保留的回应']);
  const entry = {
    command: { operation: 'recordZhouNingDialogue' },
    dialogue: { kind: 'chat', text: '旧版周宁完整历史', say: '周宁的原始回复' }
  };
  assert.deepEqual(recent({ ...state, history: [entry] }).slice(0, 2).map(row => row.content), ['旧版周宁完整历史', '周宁的原始回复']);
});

test('人物摘要按六轮累计且不删除原话或串用其他人物的记忆', async () => {
  const npcId = 'linXia';
  let state = cast.meet(cast.meet(game.createGame({ seed: 'rolling-dialogue-summary' }), npcId), 'zhouNing');
  const playerLine = round => '纸飞机实验发言 ' + round;
  const npcLine = round => '林夏回应 ' + round;
  function chat(id, round) {
    const result = game.recordNpcDialogue(state, {
      npcId: id, kind: 'chat', text: playerLine(round), say: npcLine(round), intent: 'none', source: 'online'
    });
    assert.equal(result.ok, true, result.reason);
    state = result.state;
  }
  for (let round = 1; round <= 5; round++) chat(npcId, round);
  chat('zhouNing', '周宁专属');
  assert.equal(agent.summaryPlan(state, npcId), null);
  assert.equal(agent.summaryPlan(state, 'zhouNing'), null);
  chat(npcId, 6);
  const first = agent.summaryPlan(state, npcId);
  assert.equal(first.throughRevision, state.revision);
  assert.equal(first.previous, '');
  assert.deepEqual(first.turns.map(turn => [turn.text, turn.reply]), Array.from({ length: 6 }, (_, index) => [
    playerLine(index + 1), npcLine(index + 1)
  ]));

  const summary = '玩家在做纸飞机实验，和林夏说定了观察飞行时间。';
  const relay = 'https://example.invalid/deepseek';
  let request;
  const response = await agent.requestSummary({
    plan: first,
    relay,
    fetchFn: async (url, options) => {
      assert.equal(url, relay);
      request = JSON.parse(options.body).messages;
      return { ok: true, json: async () => ({ reply: summary }) };
    }
  });
  assert.equal(response, summary);
  assert.ok(request.length <= 14 && request.every(row => row.content.length <= 600));
  assert.ok(request.some(row => row.content.includes(playerLine(1)) && row.content.includes(npcLine(1))));
  assert.ok(request.every(row => !row.content.includes('周宁专属')));
  assert.equal(await agent.requestSummary({
    plan: first,
    relay,
    fetchFn: async () => { throw new Error('连接中断'); }
  }), null);

  state = { ...state, npcDialogueSummaries: { [npcId]: { text: response, throughRevision: first.throughRevision } } };
  assert.equal(agent.validSummaries(state), true);
  assert.equal(agent.validSummaries({
    ...state, npcDialogueSummaries: { [npcId]: { text: response, throughRevision: first.throughRevision - 1 } }
  }), false);
  assert.equal(agent.validSummaries({
    ...state, npcDialogueSummaries: { zhouNing: { text: response, throughRevision: first.throughRevision } }
  }), false);
  assert.equal(agent.summaryPlan(state, npcId), null);
  assert.ok(agent.conversation(state, npcId).some(row => row.content === playerLine(1)));
  const current = { role: 'user', content: '继续测试' };
  const seventhRequest = agent.messages(state, current.content, [], null, npcId).filter(row => row.role !== 'system');
  assert.ok(seventhRequest[0].content.startsWith('此前对话摘要'));
  assert.ok(seventhRequest[0].content.includes(summary));
  assert.deepEqual(seventhRequest.slice(1), [
    { role: 'user', content: playerLine(5) }, { role: 'assistant', content: npcLine(5) },
    { role: 'user', content: playerLine(6) }, { role: 'assistant', content: npcLine(6) }, current
  ]);
  assert.ok(agent.messages(state, current.content, [], null, 'zhouNing').every(row => !row.content.includes(summary)));

  for (let round = 7; round <= 11; round++) chat(npcId, round);
  assert.equal(agent.summaryPlan(state, npcId), null);
  chat(npcId, 12);
  const second = agent.summaryPlan(state, npcId);
  assert.equal(second.previous, summary);
  assert.equal(second.throughRevision, state.revision);
  assert.deepEqual(second.turns.map(turn => turn.text), Array.from({ length: 6 }, (_, index) => playerLine(index + 7)));
  assert.ok(agent.conversation(state, npcId).some(row => row.content === playerLine(1)));
});

test('人物记忆按重要性、相关性和时间检索，并隔离其他人物', () => {
  const npcId = 'linXia';
  const base = cast.meet(cast.meet(game.createGame({ seed: 'agent-memory' }), npcId), 'zhouNing');
  const state = {
    ...base,
    revision: 100,
    history: [
      { revision: 1, term: 1, command: { operation: 'recordNpcDialogue' }, dialogue: { npcId, kind: 'chat', text: '我答应陪你练习展示，下次一起', say: '好，我会记住' } },
      { revision: 40, term: 1, command: { operation: 'executeAction' }, relationship: { characterId: npcId, kind: 'story', description: '陪林夏完成接力配合练习' } },
      { revision: 99, term: 1, command: { operation: 'recordNpcDialogue' }, dialogue: { npcId, kind: 'chat', text: '今天天气不错', say: '嗯' } },
      { revision: 98, term: 1, command: { operation: 'recordNpcDialogue' }, dialogue: { npcId: 'zhouNing', kind: 'chat', text: '周宁专属记忆', say: '好' } }
    ]
  };
  const relevant = agent.retrieveMemories(state, npcId, '展示', 4);
  assert.ok(relevant.length >= 2);
  assert.match(relevant[0].text, /练习展示|接力/);
  assert.ok(relevant.every(item => !item.text.includes('周宁专属')));
  assert.equal(agent.memoryPrompt({ ...state, npcAgentMemory: { version: 1, byNpc: { [npcId]: { core: { text: '你现在愿意向信任的人求助。', term: 1, revision: 100, trigger: 'term-end' } } } } }, npcId, '展示').includes('核心档案'), true);
});

test('人物反思每学期最多一次，成功写档并校验结构', () => {
  const npcId = 'linXia';
  const base = cast.meet(cast.meet(game.createGame({ seed: 'agent-reflection' }), npcId), 'zhouNing');
  const state = {
    ...base,
    phase: 'summary',
    revision: 100,
    history: [{ revision: 90, term: 1, command: { operation: 'recordNpcDialogue' }, dialogue: { npcId, kind: 'chat', text: '我有点害怕上台展示', say: '我陪你练' } }]
  };
  const plan = agent.reflectionPlan(state, npcId);
  assert.ok(plan);
  assert.match(plan.memories[0].text, /害怕|展示/);
  const marked = agent.markAttempt(state, npcId, plan);
  assert.equal(agent.reflectionPlan(marked, npcId), null);
  assert.equal(agent.validAgentMemory(marked), true);
  const result = {
    reflection: '玩家愿意陪我练习展示，我开始敢承认自己害怕。',
    core: '我想把课程展示准备好，也愿意在紧张时向信任的人求助。',
    focus: '准备展示',
    memories: [{ kind: 'promise', text: '玩家答应陪我练习展示', importance: 5, tags: ['约定', '展示'] }]
  };
  const updated = agent.applyReflection(marked, npcId, result, plan, 'term-end');
  assert.equal(agent.validAgentMemory(updated), true);
  assert.equal(updated.npcAgentMemory.byNpc[npcId].lastReflection.term, 1);
  assert.equal(updated.npcAgentMemory.byNpc[npcId].memories.length, 1);
  assert.match(agent.memoryPrompt(updated, npcId, '展示'), /核心档案|相关记忆/);
  assert.equal(agent.parseReflection(JSON.stringify({ ...result, coreMemory: result.core })).core, result.core);
  assert.equal(agent.parseReflection(JSON.stringify({ ...result, coreMemory: 'x'.repeat(181) })), null);
});

test('长期记忆作为存档侧车通过完整状态校验', () => {
  let state = game.chooseBudget(game.createGame({ seed: 'agent-memory-validation' }), game.DEFAULT_BUDGET).state;
  state = { ...state, npcAgentMemory: { version: 1, byNpc: { linXia: {
    core: { text: '我想准备好展示，也愿意向信任的人求助。', term: 1, revision: state.revision, trigger: 'term-end' },
    memories: [{ id: 'r:1:linXia:0', revision: state.revision, term: 1, kind: 'promise', text: '玩家答应陪我练习展示', importance: 5, tags: ['约定', '展示'] }],
    lastReflection: { term: 1, revision: state.revision, text: '我开始愿意承认自己害怕。', focus: '准备展示' },
    lastAttempt: { term: 1, revision: state.revision, kind: 'reflection' }
  } } } };
  assert.equal(agent.validAgentMemory(state), true);
  const check = game.validateState(state);
  assert.equal(check.ok, true, check.reason);
});

test('人物对话可接受但不持久化 thought，非法 thought 被拒绝', () => {
  const parsed = agent.parse(JSON.stringify({ say: '可以，你陪我练一次吗？', intent: 'none', thought: '其实我很怕上台' }), [], 'linXia');
  assert.equal(parsed.say, '可以，你陪我练一次吗？');
  assert.equal(parsed.thought, '其实我很怕上台');
  assert.equal(agent.parse(JSON.stringify({ say: '好', intent: 'none', thought: 'x'.repeat(61) }), [], 'linXia'), null);
});

test('人物反思请求受消息预算限制，并能解析结构化结果', async () => {
  const npcId = 'linXia';
  const base = cast.meet(cast.meet(game.createGame({ seed: 'agent-reflection-request' }), npcId), 'zhouNing');
  const state = {
    ...base,
    phase: 'summary',
    revision: 100,
    history: [{ revision: 90, term: 1, command: { operation: 'recordNpcDialogue' }, dialogue: { npcId, kind: 'chat', text: '我有点害怕上台展示', say: '我陪你练' } }],
    npcAgentMemory: { version: 1, byNpc: { [npcId]: { core: { text: '我想准备好课程展示。', term: 1, revision: 90, trigger: 'term-end' } } } }
  };
  const plan = agent.reflectionPlan(state, npcId);
  assert.ok(plan);
  let request;
  const relay = 'https://example.invalid/reflect';
  const result = await agent.requestReflection({
    plan, relay,
    fetchFn: async (url, options) => {
      request = JSON.parse(options.body).messages;
      return { ok: true, json: async () => ({ reply: JSON.stringify({ reflection: '我开始愿意承认自己害怕。', coreMemory: '我想准备好展示，也愿意向信任的人求助。', focus: '准备展示', memories: [{ kind: 'promise', text: '玩家答应陪我练习展示', importance: 5 }] }) }) };
    }
  });
  assert.equal(result.core, '我想准备好展示，也愿意向信任的人求助。');
  assert.ok(request.length <= 14 && request.every(row => row.content.length <= 600));
  assert.ok(request.some(row => row.content.includes('害怕上台')) || request.some(row => row.content.includes('展示')));
});
