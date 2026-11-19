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
