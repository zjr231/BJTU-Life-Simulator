'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('./game.js');
const { relay } = require('./scripts/deepseek-relay.js');
const scenarios = require('./qa/npc-prompt-scenarios.json');
const agent = game.characterAgent;
const cast = game.npcCast;

function linXiaHistoryReply(say, emotion = null) {
  return { role: 'assistant', content: JSON.stringify({ emotion, say, intent: 'none' }) };
}

test('真实请求区分四种现场，当前话题和活动契约不会示范固定邀约', async () => {
  const state = cast.meet(game.createGame({ seed: 'scene-prompts' }), 'chenTeacher');
  for (const [kind, expected] of [['chat', '自由交谈'], ['meet', '初次见面'], ['proactive', '主动问候'], ['cameo', '事件偶遇']]) {
    const occasion = kind === 'chat' ? null : { kind, context: '此刻在图书馆' };
    const candidates = kind === 'chat' ? game.npcCandidates(state, 'chenTeacher') : [];
    const decision = await agent.request({
      state, text: kind === 'chat' ? '最近看电影吗？' : '', npcId: 'chenTeacher', candidates, occasion, relay: '/test',
      fetchFn: async (_, options) => {
        const messages = JSON.parse(options.body).messages;
        const rules = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
        assert.ok(rules.includes(expected));
        assert.doesNotMatch(rules, /"intent":"walk"|thought|mentorReview/);
        assert.ok(messages.length <= 14 && messages.every(row => row.content.length <= 600));
        if (!occasion) assert.equal(messages.at(-1).content, '最近看电影吗？');
        return { ok: true, json: async () => ({ reply: '{"say":"最近哪部让你感兴趣？","intent":"none"}' }) };
      }
    });
    assert.equal(decision.source, 'online', kind);
  }
});

test('实际邀请与拒绝按时间进入续聊、摘要和反思，偏好只出现一次', async () => {
  const npcId = 'linXia';
  let state = cast.meet(game.createGame({ seed: 'refusal-evidence' }), npcId);
  function chat(text, say, intent = 'none') {
    const result = game.recordNpcDialogue(state, { npcId, kind: 'chat', text, say, intent, source: 'online' });
    assert.ok(result.ok, result.reason);
    state = result.state;
  }
  const preference = '我喜欢傍晚跑步';
  chat(preference, '现在一起散步吗？', 'walk');
  const decline = game.resolveNpcProposal(state, { npcId, answer: 'decline' }, { proposalRevision: agent.read(state, npcId).proposal.createdRevision });
  assert.ok(decline.ok, decline.reason);
  state = decline.state;
  chat('还是聊电影吧', '你想看哪部？');
  const payload = agent.messages(state, '聊聊喜剧吧', game.npcCandidates(state, npcId), null, npcId);
  const joined = payload.map(row => row.content).join('\n');
  assert.equal(joined.split(preference).length - 1, 1);
  assert.match(joined, /现在一起散步吗？[\s\S]*玩家拒绝了.*散步[\s\S]*还是聊电影吧/);
  assert.doesNotMatch(joined, /今天先不了，改天吧。/);
  for (let i = 0; i < 4; i++) chat('电影话题' + i, '继续聊。');
  const plan = agent.summaryPlan(state, npcId);
  let rows;
  await agent.requestSummary({ plan, relay: '/test', fetchFn: async (_, options) => {
    rows = JSON.parse(options.body).messages;
    return { ok: true, json: async () => ({ reply: '玩家这次拒绝了散步。' }) };
  } });
  assert.match(rows.map(row => row.content).join('\n'), /现在一起散步吗？[\s\S]*玩家拒绝了.*散步[\s\S]*还是聊电影吧/);
  assert.ok(agent.reflectionPlan(state, npcId).events.some(item => /玩家拒绝了.*散步/.test(item.text)));
});

test('初识后的记忆从人物视角叙述', () => {
  const state = cast.meet(game.createGame({ seed: 'perspective' }), 'linXia');
  state.history.push({ revision: 1, term: 1, dialogue: { npcId: 'linXia', kind: 'meet', say: '我叫林夏。' } });
  const memories = agent.derivedMemories(state, 'linXia');
  assert.match(memories[0].text, /操场.*玩家/);
  assert.doesNotMatch(agent.messages(state, '我们在哪认识的？', [], null, 'linXia').map(m => m.content).join('\n'), /认识了林夏/);
});

test('林夏按当前话题回想自己的经历，追问沿用上一轮，转题与其他人物隔离', () => {
  const npcId = 'linXia';
  let state = cast.meet(game.createGame({ seed: 'lin-xia-memory' }), npcId);
  const excerpts = text => agent.messages(state, text, [], null, npcId).find(row => row.content.startsWith('林夏自己的往事'))?.content;
  assert.match(excerpts('你一千五最好跑过多少？'), /高二校运会 1500 米最好 5:39/);
  assert.match(excerpts('你的1500m跑多少？'), /5:39/);
  assert.match(excerpts('你跑得挺不错的，以前有练过吗'), /高一冬训[\s\S]*高二校运会/);
  assert.match(excerpts('你在哪儿长大？'), /惠安县城[\s\S]*文印店/);
  assert.match(excerpts('你最喜欢跟谁一起跑步？'), /阿遥/);
  assert.match(excerpts('你记得你的初恋吗？'), /连有没有喜欢过人都可以不确认/);
  assert.match(excerpts('你听什么音乐？'), /十七秒宿舍合唱/);
  assert.match(excerpts('你跟室友熟吗？'), /方宁[\s\S]*课堂展示/);
  assert.match(excerpts('你平时喜欢做什么？'), /听歌[\s\S]*中长跑[\s\S]*公交/);
  const topic = game.recordNpcDialogue(state, {
    npcId, kind: 'chat', text: '你怎么开始喜欢跑步的？', say: '初一跟同桌在操场绕圈。', intent: 'none', source: 'online'
  });
  assert.ok(topic.ok, topic.reason);
  state = topic.state;
  assert.match(excerpts('后来呢？'), /初二阿遥请假/);
  for (const text of ['算了。不过我们可以一起去吃饭呀', '或者今晚去看电影？', '那你想看什么电影？', '你对电影感兴趣吗？']) {
    assert.equal(excerpts(text), undefined);
  }
  const combined = excerpts('你一千五的成绩、老家和初恋呢？');
  assert.match(combined, /连有没有喜欢过人都可以不确认[\s\S]*5:39/);
  assert.doesNotMatch(combined, /惠安县城/);
  assert.ok(combined.length <= 600);
  for (const otherId of ['zhouNing', 'chenTeacher']) {
    const rows = agent.messages(state, '你初恋是谁？', [], null, otherId);
    assert.doesNotMatch(rows.map(row => row.content).join('\n'), /许嘉树|惠安县城|林夏自己的往事/);
  }
  const cameo = agent.messages(state, '', [], { kind: 'cameo', place: 'track', context: '你和玩家在操场碰到下雨。' }, npcId);
  assert.deepEqual(cameo.slice(0, 2).map(row => row.content), cast.profile(npcId).persona.personality);
  assert.match(cameo[2].content, /事件偶遇[\s\S]*intent 用 none/);
  assert.match(cameo[3].content, /你和玩家在操场碰到下雨/);
});

test('林夏的中长跑目标由当前话题触发，普通问候与随口约定不带入目标', () => {
  const npcId = 'linXia';
  const startingState = cast.meet(game.createGame({ seed: 'lin-xia-goal-context' }), npcId);
  const result = game.recordNpcDialogue(startingState, {
    npcId, kind: 'chat', text: '对呀，哈哈', say: '以后操场碰见能打个招呼。你平时常来这边？',
    intent: 'none', source: 'online'
  });
  assert.ok(result.ok, result.reason);
  const state = result.state;
  const prompt = (text, occasion) => agent.messages(state, text, game.npcCandidates(state, npcId), occasion, npcId)
    .map(row => row.content).join('\n');
  assert.doesNotMatch(prompt('嗯嗯，有空一起'), /近期目标：|接力/);
  assert.doesNotMatch(prompt('', { kind: 'meet', context: '玩家刚做完单人运动。' }), /近期目标：|接力/);
  assert.doesNotMatch(prompt('你最近在练接力吗？'), /近期目标：|练好接力/);
  assert.match(prompt('你最近在练一千五吗？'), /近期目标：把一千五的前两圈跑稳/);
  assert.doesNotMatch(prompt('你这学期有什么目标？'), /近期目标：把一千五的前两圈跑稳/);
});

test('林夏按相识阶段调整聊天与决定，关系指引保留原有话题和往事预算', () => {
  const npcId = 'linXia';
  let state = cast.meet(game.createGame({ seed: 'lin-xia-relationship-guidance' }), npcId);
  for (let i = 0; i < 5; i++) {
    const result = game.recordNpcDialogue(state, {
      npcId, kind: 'chat', text: '玩家的前文' + i, say: '林夏的回应' + i, source: 'local', intent: 'none'
    });
    assert.ok(result.ok, result.reason);
    state = result.state;
  }
  const prompt = (familiarity, text, occasion) => {
    const snapshot = cast.set(state, npcId, { ...cast.get(state, npcId), familiarity });
    return agent.messages(snapshot, text, game.npcCandidates(snapshot, npcId), occasion, npcId, 'track');
  };
  const withGuidance = rows => rows.find(row => row.role === 'system' && row.content.includes('\n本阶段的相处分寸：'));
  const cases = [
    [29, '初识', /寒暄完可以让话停下来.*多数情况下直接婉拒/],
    [30, '熟悉', /多讲一个具体细节.*自己还想去才提改天/],
    [59, '熟悉', /多讲一个具体细节.*自己还想去才提改天/],
    [60, '熟络', /你确实记得的一件事.*说出自己也想做的计划/],
    [79, '熟络', /你确实记得的一件事.*说出自己也想做的计划/],
    [80, '深入了解', /关系很好的朋友.*想讲时再分享私事.*有安排冲突就实话实说/],
    [100, '相知', /关系很好的朋友.*想讲时再分享私事.*有安排冲突就实话实说/]
  ];
  const baseline = text => prompt(29, text).filter(row => row.role !== 'system');
  for (const [value, label, behavior] of cases) {
    for (const text of ['是呀，哈哈。', '周末要不要一起去北海逛逛？', '你初恋是谁？']) {
      const rows = prompt(value, text);
      const block = withGuidance(rows);
      assert.ok(block.content.includes('关系：' + label + '。'), value);
      assert.match(block.content, behavior);
      assert.ok(rows.length <= 14 && rows.every(row => row.content.length <= 600));
      assert.deepEqual(rows.filter(row => row.role !== 'system'), baseline(text));
      assert.deepEqual(rows.at(-1), { role: 'user', content: text });
      if (text.includes('初恋')) assert.ok(rows.some(row => row.content.startsWith('林夏自己的往事') && row.content.includes('喜欢')), value);
    }
  }
  const guidance = value => withGuidance(prompt(value, '你好啊。')).content.split('\n本阶段的相处分寸：')[1];
  assert.equal(guidance(30), guidance(59));
  assert.equal(guidance(60), guidance(79));
  assert.equal(guidance(80), guidance(100));
  assert.equal(new Set([29, 30, 60, 80].map(guidance)).size, 4);
  const proactive = prompt(60, '', { kind: 'proactive', place: 'track', context: '你在操场碰见了这位同学。' });
  assert.match(withGuidance(proactive).content, /关系：熟络.*\n本阶段的相处分寸：和聊得来的同学相处/);
  assert.match(proactive.map(row => row.content).join('\n'), /主动问候[^\n]*以两人确实经历或聊过的事为依据[^\n]*intent 用 none/);
  assert.equal(withGuidance(prompt(60, '', { kind: 'cameo', place: 'track' })), undefined);

  const fresh = game.createGame({ seed: 'before-meeting' });
  assert.match(withGuidance(agent.messages(fresh, '你好啊。', [], null, npcId)).content,
    /关系：初次见面.*\n本阶段的相处分寸：你把对方当刚认识的同学/);
  for (const id of ['zhouNing', 'chenTeacher']) {
    const known = cast.set(fresh, id, { familiarity: 80 });
    const rows = agent.messages(known, '你好啊。', [], null, id);
    assert.ok(rows.some(row => row.content.includes('关系：深入了解。')));
    assert.equal(withGuidance(rows), undefined);
  }
});

test('散步后聊暗恋依亲疏逐步展开，打趣和认真追问能接续，转题后停止', () => {
  const npcId = 'linXia';
  for (const score of [20, 50, 90]) {
    let state = cast.meet(game.createGame({ seed: 'first-love-talk' }), npcId);
    state = cast.set(state, npcId, { ...cast.get(state, npcId), familiarity: score });
    const memory = text => {
      const rows = agent.messages(state, text, game.npcCandidates(state, npcId), null, npcId, 'ginkgo');
      assert.ok(rows.length <= 14 && rows.every(row => row.content.length <= 600));
      return rows.find(row => row.content.startsWith('林夏自己的往事'))?.content || '';
    };
    function turn(text, say) {
      const result = game.recordNpcDialogue(state, { npcId, kind: 'chat', text, say, intent: 'none', source: 'online' });
      assert.ok(result.ok, result.reason);
      state = result.state;
    }
    assert.doesNotMatch(memory('你有过暗恋对象吗？'), /许嘉树|拍了站牌/);
    turn('你有过暗恋对象吗？', '有过啊。');
    for (const [text, say] of [['那后来呢？', '想起那时候了。'], ['你还挺傲娇，哈哈。', '就知道你会笑。'], ['你当时……难过吗？', '嗯。']]) {
      const recalled = memory(text);
      assert.match(recalled, score === 20 ? /刚认识/ : score === 90 ? /真心替他高兴/ : /有点害臊/);
      assert.doesNotMatch(recalled, /许嘉树|拍了站牌|高二转学/);
      turn(text, say);
    }
    state = { ...state, npcDialogueSummaries: { [npcId]: { text: '两人沿着校园散步。', throughRevision: state.revision } } };
    if (score === 90) assert.match(memory('他叫什么名字呀？'), /许嘉树/);
    else assert.doesNotMatch(memory('他叫什么名字呀？'), /许嘉树/);
    assert.equal(memory('换个话题，晚饭吃什么？'), '');
    turn('换个话题，晚饭吃什么？', '想吃面。');
    assert.equal(memory('那后来呢？'), '');
  }
});

test('相识度90的口语追问接续同一个人，换到眼前的男生后不再引用旧事', () => {
  const id = 'linXia';
  let state = cast.meet(game.createGame({ seed: 'close-friend-voice' }), id);
  state = cast.set(state, id, { ...cast.get(state, id), familiarity: 90 });
  function rows(text) { return agent.messages(state, text, [], null, id); }
  function memory(text) { return rows(text).find(row => row.content.startsWith('林夏自己的往事'))?.content || ''; }
  function turn(text, say) {
    const result = game.recordNpcDialogue(state, { npcId: id, kind: 'chat', text, say, intent: 'none', source: 'online' });
    assert.ok(result.ok, result.reason);
    state = result.state;
  }
  assert.ok(rows('我这次考过啦！').some(row => row.content.includes('听到好消息会替对方乐')));
  assert.equal(memory('我真好奇了'), '');
  for (const [text, expected] of [
    ['那你喜欢那个男生吗', /真的很喜欢他/], ['嗯嗯？没有吗？', /听岔了/], ['我真好奇了', /听岔了/],
    ['他.......帅吗', /门牙/], ['怎么可能！我看你这么害羞，他一定是你的白月光', /被逮着/]
  ]) {
    assert.match(memory(text), expected);
    turn(text, '嗯。');
  }
  turn('换个话题。刚刚路过的男生是我们班长。', '哦。');
  assert.equal(memory('那你喜欢那个男生吗'), '');
  assert.equal(memory('他.......帅吗'), '');
});

test('相识度50，只承认心事，连着追问或猜经过也不提供私事细节', () => {
  const npcId = 'linXia';
  let state = cast.meet(game.createGame({ seed: 'walk-crush-story' }), npcId);
  state = cast.set(state, npcId, { ...cast.get(state, npcId), familiarity: 50 });
  const recall = text => agent.messages(state, text, [], null, npcId, 'ginkgo')
    .find(row => row.content.startsWith('林夏自己的往事'))?.content;
  function record(text, say) {
    const result = game.recordNpcDialogue(state, { npcId, kind: 'chat', text, say, intent: 'none', source: 'online' });
    assert.ok(result.ok, result.reason);
    state = result.state;
  }
  const walk = '你以前中学的时候也和男生这样散过步吗';
  const crush = '真的嘛.....你没有喜欢过的男生？';
  const story = '哦？我想听你和他的故事';
  assert.match(recall('你以前也有和男生一起散过步吗'), /只问散步就答散步/);
  assert.match(recall('真的吗.......你中学的时候没有喜欢的男生？'), /有点害臊/);
  assert.equal(recall('你中学的时候喜欢的运动是什么？'), undefined);
  assert.match(recall(walk), /女同桌/);
  record(walk, '专门跟男生这么散步的……我还真想不起来。');
  assert.equal(recall(story), undefined);
  assert.match(recall(crush), /有点害臊/);
  record('真的吗.......你中学的时候没有喜欢的男生？', '有啊，不过那会儿就是偷偷看着，连话都没怎么说过。');
  assert.match(recall('是吗，可以说说你们的故事吗'), /含糊一句/);
  assert.match(recall(story), /有点害臊/);
  assert.doesNotMatch(recall(story), /许嘉树|文印店|转学/);
  record(story, '你一问，我还真讲不出口。');
  for (const question of ['就讲一点点呗，我不笑你。', '不用从头讲，说一件你还记得的小事就好。']) {
    assert.match(recall(question), /含糊一句/);
    record(question, '那会儿盼着的感觉到现在都记得。');
  }
  assert.match(recall('你们俩是怎么认识的？'), /含糊一句/);
  const guessed = agent.messages(state, '该不会是运动会那天借你笔才认识的吧？', [], null, npcId);
  assert.match(guessed.at(-2).content, /不用证实或否认/);
  assert.doesNotMatch(guessed.at(-2).content, /跑步成绩|5:39/);
  for (const question of ['他转学的时候你是什么感受？', '他是什么时候转学的？', '他叫什么名字呀？', '名字呢？']) {
    assert.match(recall(question), /含糊一句/);
    assert.doesNotMatch(recall(question), /高二|许嘉树|文印店|电话/);
  }
  assert.match(recall('那后来呢？'), /有点害臊/);
  record('换个话题，晚上吃什么？', '去食堂吧。');
  assert.equal(recall(story), undefined);
});

test('追问许嘉树才取相应的侧写或往事，熟朋友能多记起一个场景', () => {
  const npcId = 'linXia';
  const base = cast.meet(game.createGame({ seed: 'jiashu-history' }), npcId);
  const next = game.recordNpcDialogue(base, { npcId, kind: 'chat', text: '你中学有过暗恋对象吗？', say: '嗯，有过。', intent: 'none', source: 'online' });
  assert.ok(next.ok, next.reason);
  const tease = '你顿了半天欸。该不会现在提起来还会脸红吧？';
  const teased = game.recordNpcDialogue(next.state, { npcId, kind: 'chat', text: tease, say: '哪有。', intent: 'none', source: 'online' });
  assert.ok(teased.ok, teased.reason);
  for (const familiarity of [20, 50, 79, 80, 90, 100]) {
    const state = cast.set(teased.state, npcId, { ...cast.get(teased.state, npcId), familiarity });
    const recall = text => {
      const rows = agent.messages(state, text, [], null, npcId);
      assert.ok(rows.length <= 14 && rows.every(row => row.content.length <= 600));
      return rows.find(row => row.content.startsWith('林夏自己的往事'))?.content || '';
    };
    const boundary = familiarity < 30 ? /连有没有喜欢过人都可以不确认/
      : familiarity < 60 ? /含糊一句自己现在的感觉/
        : familiarity < 80 ? /当时有多紧张、现在想起来又是什么滋味/
          : /卡一下，嘴硬半句就被自己逗破功/;
    assert.match(recall(tease), boundary);
    const walk = recall('那你们放学会一起回家吗？方便说的话，就讲这一件。');
    if (familiarity >= 80) {
      assert.match(walk, /细节只从下面的记忆挑[\s\S]*文印店那条街的路口。你去店里，许嘉树再往前去坐车/);
    } else {
      assert.match(walk, boundary);
      assert.match(walk, /删掉有无发生的回答、对那件事的描述/);
    }
    for (const [question, ordinary, close] of [
      ['他长什么样，性格怎么样？', /眉梢.*[\s\S]*话不多/, /门牙/],
      ['你们放学一起回家吗？', /文印店那条街的路口/, /旧粮店/],
      ['你和许嘉树一起跑过步吗？', /高一冬天.*阿遥/, /倒着跑/],
      ['具体哪件事让你动心了？', /卷子订反了/, /分跟谁/]
    ]) {
      const content = recall(question);
      if (familiarity >= 80) {
        assert.match(content, ordinary);
        assert.match(content, close);
      } else {
        assert.doesNotMatch(content, ordinary);
        assert.doesNotMatch(content, close);
      }
    }
    const why = recall('为什么喜欢许嘉树？');
    if (familiarity >= 80) assert.match(why, /一本正经的幽默/);
    else assert.doesNotMatch(why, /一本正经的幽默/);
    assert.doesNotMatch(why, /订书钉|旧粮店/);
    for (const question of ['能说说你们的故事吗？', '我们一起跑步吧。', '你当时是什么感受？']) {
      assert.doesNotMatch(recall(question), /高一冬天|旧粮店|花砖|门牙|卷子订反了/);
    }
  }
});

test('追问超过近期六轮仍能找到原来的暗恋话题，换话题后不再引用', () => {
  const npcId = 'linXia';
  let state = cast.meet(game.createGame({ seed: 'long-crush-chat' }), npcId);
  state = cast.set(state, npcId, { ...cast.get(state, npcId), familiarity: 90 });
  function record(text) {
    const result = game.recordNpcDialogue(state, { npcId, kind: 'chat', text, say: '嗯。', intent: 'none', source: 'online' });
    assert.ok(result.ok, result.reason);
    state = result.state;
  }
  for (const line of ['你中学有过暗恋对象吗？', '说说你们的故事？', '那他长什么样？', '他性格怎么样？', '你们放学一起回家吗？', '你和他一起跑过步吗？', '你为什么喜欢他？']) record(line);
  const scene = () => agent.messages(state, '具体哪件事让你动心了？', [], null, npcId).some(row => row.content.includes('卷子订反了'));
  assert.equal(scene(), true);
  record('换个话题。你周末想去哪玩？');
  assert.equal(scene(), false);
});

test('林夏初识时明确回应高负担邀约，补充票和改期沿用同一边界', async () => {
  const npcId = 'linXia';
  let state = cast.meet(game.createGame({ seed: 'lin-xia-first-invite' }), npcId);
  const previousReplies = [
    '啊，演唱会？今晚啊……我还没想好，票是已经有啦？',
    '那是什么场子，在哪儿演？我看看时间赶不赶得上。'
  ];
  const playerLines = ['今晚一起去看演唱会吧！', '对的', '周六晚上'];
  const requests = [];
  for (const [index, text] of playerLines.entries()) {
    const decision = await agent.request({
      state, npcId, text, candidates: game.npcCandidates(state, npcId), relay: '/test',
      fetchFn: async (_, options) => {
        requests.push(JSON.parse(options.body).messages);
        return { ok: true, json: async () => ({ reply: '{"say":"谢谢，你们去吧。这次我先不去了。","intent":"none"}' }) };
      }
    });
    assert.equal(decision.source, 'online');
    assert.equal(decision.intent, 'none');
    if (index < previousReplies.length) {
      const old = game.recordNpcDialogue(state, {
        npcId, kind: 'chat', text, say: previousReplies[index], intent: 'none', source: 'online'
      });
      assert.ok(old.ok, old.reason);
      state = old.state;
    }
  }

  assert.equal(requests.length, 3);
  for (const [index, rows] of requests.entries()) {
    const block = rows.find(row => row.role === 'system' && row.content.includes('本阶段的相处分寸：'));
    assert.match(block.content, /关系：初识.*\n本阶段的相处分寸：.*和气、客气.*多数情况下直接婉拒/);
    assert.match(block.content, /校外看演出.*不用追问票、场地和时间.*已经有票、换了日期或再问一遍，还是同一次邀约/);
    assert.match(block.content, /已明确答应的事照原约履行.*确实顺路.*你本来就愿意时也可以同行/);
    assert.deepEqual(rows.at(-1), { role: 'user', content: playerLines[index] });
    assert.ok(rows.length <= 14 && rows.every(row => row.content.length <= 600));
  }
  assert.deepEqual(requests[2].slice(-5), [
    { role: 'user', content: playerLines[0] },
    linXiaHistoryReply(previousReplies[0]),
    { role: 'user', content: playerLines[1] },
    linXiaHistoryReply(previousReplies[1]),
    { role: 'user', content: playerLines[2] }
  ]);
  const familiar = cast.set(state, npcId, { ...cast.get(state, npcId), familiarity: 30 });
  assert.doesNotMatch(agent.messages(familiar, playerLines[2], [], null, npcId).map(row => row.content).join('\n'),
    /多数情况下直接婉拒/);
});

test('林夏初识时答全双问题，只在被具体问到时展开自己的情况', () => {
  const npcId = 'linXia';
  const initial = cast.meet(game.createGame({ seed: 'lin-xia-brief-first-chat' }), npcId);
  const recent = game.recordNpcDialogue(initial, {
    npcId, kind: 'chat', text: '你叫我小禾就行。', say: '小禾，你好。', intent: 'none', source: 'local'
  });
  assert.ok(recent.ok, recent.reason);
  const state = recent.state;
  const prompt = (snapshot, text) => agent.messages(snapshot, text, game.npcCandidates(snapshot, npcId), null, npcId, 'track');
  const text = '你经常在这跑步吗？你也是咱们这的学生？';
  const rows = prompt(state, text);
  const block = rows.find(row => row.role === 'system' && row.content.includes('本阶段的相处分寸：'));
  assert.match(block.content, /关系：初识.*\n本阶段的相处分寸：[\s\S]*两件都简短答到/);
  assert.match(block.content, /专业、年级、项目和成绩，等对方问到再说/);
  assert.match(block.content, /别顺口问对方的情况或反问同一个问题.*私事一句带过.*也不确认名字、关系或具体经过/);
  assert.match(rows[2].content, /对方只报名字，称呼对方、打个招呼就行.*答得出来时，结尾用陈述句，不另起一个问题/);
  assert.deepEqual(rows.slice(-3), [
    { role: 'user', content: '你叫我小禾就行。' },
    linXiaHistoryReply('小禾，你好。'),
    { role: 'user', content: text }
  ]);
  assert.ok(rows.length <= 14 && rows.every(row => row.content.length <= 600));

  const systemText = result => result.filter(row => row.role === 'system').map(row => row.content).join('\n');
  assert.doesNotMatch(systemText(rows), /交通运输|同一年入学|大一上/);
  assert.match(systemText(prompt(state, '你是学什么专业的？')), /你读交通运输专业/);
  assert.doesNotMatch(systemText(prompt(state, '你是学什么专业的？')), /同一年入学/);
  assert.match(systemText(prompt(state, '你大几呀？')), /当前学期：大一上.*你和玩家是同一年入学的/);
  assert.doesNotMatch(systemText(prompt(state, '你大几呀？')), /交通运输/);
  const excerpt = result => result.find(row => row.role === 'system' && row.content.startsWith('林夏自己的往事'));
  for (const question of [text, '你是咱们学校的吧？你常上这儿跑吗？']) {
    const memory = excerpt(prompt(state, question));
    assert.match(memory.content, /来这个操场的次数没准，有空就来/);
    assert.doesNotMatch(memory.content, /中长跑|一千五|阿遥/);
  }
  assert.equal(excerpt(prompt(state, '你平时跑哪儿吃饭？')), undefined);
  const result = prompt(state, '你一千五最好跑过多少？');
  assert.match(result.map(row => row.content).join('\n'), /高二校运会 1500 米最好 5:39/);
  assert.match(excerpt(prompt(state, '你常来跑步吗？一千五最好成绩多少？')).content, /5:39/);
  const friend = cast.set(state, npcId, { ...cast.get(state, npcId), familiarity: 60 });
  assert.doesNotMatch(prompt(friend, text).map(row => row.content).join('\n'), /不顺口问对方的年级、爱好或近况/);
  assert.match(systemText(prompt(friend, text)), /你读交通运输专业。你和玩家是同一年入学的/);
  assert.match(excerpt(prompt(friend, text)).content, /林夏平时练中长跑/);
});

test('林夏结合上轮的第三方报名情境想起处事习惯，更新授权后沿用，转题时退出', () => {
  const npcId = 'linXia';
  const habit = cast.profile(npcId).persona.delegationHabit;
  let state = cast.meet(game.createGame({ seed: 'lin-xia-delegation' }), npcId);
  const prompt = (text, id = npcId, occasion) => agent.messages(state, text, [], occasion, id, 'track');
  const recalled = rows => rows.some(row => row.role === 'system' && row.content === habit);
  function record(text, say) {
    const result = game.recordNpcDialogue(state, { npcId, kind: 'chat', text, say, intent: 'none', source: 'online' });
    assert.ok(result.ok, result.reason);
    state = result.state;
  }

  assert.equal(recalled(prompt('你就替小陈做主吧。')), true);
  assert.equal(recalled(prompt('那先算她一份吧。')), false);
  assert.equal(recalled(prompt('你帮他报名过吗？')), false);
  assert.equal(recalled(prompt('你能帮我报名吗？')), false);
  assert.equal(recalled(prompt('你能帮同学们查报名要求吗？')), false);
  record('今晚要把看展人数报给负责人，小陈一直没回复。', '她平时也回得这么慢？');

  for (const line of ['那先算小陈一份吧。', '先把她也写上吧。', '那给她留个名额吧。']) {
    const rows = prompt(line);
    assert.ok(recalled(rows), line);
    assert.deepEqual(rows.at(-1), { role: 'user', content: line });
    assert.match(rows.map(row => row.content).join('\n'), /小陈一直没回复/);
  }
  assert.equal(recalled(prompt('先替她报吧。', 'chenTeacher')), false);
  assert.equal(recalled(prompt('先替她报吧。', npcId, { kind: 'proactive' })), false);
  record('先把她也写上吧。', '先问问她自己吧。');

  const updated = prompt('她刚回我了，说肯定去。');
  assert.ok(recalled(updated));
  assert.deepEqual(updated.at(-1), { role: 'user', content: '她刚回我了，说肯定去。' });
  assert.ok(recalled(prompt('她叫我代她报，那我按她说的回吧。')));
  assert.equal(recalled(prompt('她刚回我了，说不去。对了，你今晚吃什么？')), false);
  record('她刚回我了，说肯定去，还托我替她报。', '那就按她的意思回吧。');
  assert.equal(recalled(prompt('对了，你晚上吃什么？')), false);
  assert.equal(recalled(prompt('这一题怎么算出一个结果？')), false);
  assert.equal(recalled(prompt('你跟室友熟吗？')), false);
  assert.match(prompt('你跟室友熟吗？').map(row => row.content).join('\n'), /大学室友方宁/);
  record('对了，你晚上吃什么？', '想去买碗面。');
  assert.equal(recalled(prompt('那先算她一份吧。')), false);
});

test('林夏从普通相处中增加熟悉度，闲聊和主动问候不推送训练', async () => {
  const npcId = 'linXia';
  const state = cast.meet(game.createGame({ seed: 'lin-xia-classmate' }), npcId);
  const candidates = game.npcCandidates(state, npcId);
  assert.ok(candidates.some(item => item.id === 'exercise'));
  const outdoors = { kind: 'proactive', context: '你在操场碰见了这位认识的同学。' };
  assert.equal(agent.fallback(state, '', candidates, outdoors, npcId).intent, 'none');
  for (const line of ['嗯嗯，有空一起', '你喜欢跑步吗？', '我不想跑步，不过我们可以一起吃饭呀', '今晚一起吃个饭吧']) {
    let rows;
    const decision = await agent.request({
      state, npcId, text: line, candidates, relay: '/test',
      fetchFn: async (_, request) => {
        rows = JSON.parse(request.body).messages;
        return { ok: true, json: async () => ({ reply: '{"say":"一起跑吧。","intent":"exercise"}' }) };
      }
    });
    assert.ok(rows.some(row => row.content.includes('你们是同学')));
    assert.doesNotMatch(rows.find(row => row.content.startsWith('正式邀请候选')).content, /exercise|relayPractice/);
    assert.equal(decision.intent, 'none');
  }
  const voluntary = await agent.request({
    state, npcId, text: '我们现在一起跑两圈吧', candidates, relay: '/test',
    fetchFn: async () => ({ ok: true, json: async () => ({ reply: '{"say":"可以，先慢点。","intent":"exercise"}' }) })
  });
  assert.equal(voluntary.intent, 'exercise');
  const chat = game.recordNpcDialogue(state, { npcId, kind: 'chat', text: '我喜欢听歌', say: '我也会先听前奏。', intent: 'none', source: 'local' });
  assert.ok(chat.ok, chat.reason);
  assert.ok(cast.get(chat.state, npcId).familiarity > cast.get(state, npcId).familiarity);
  assert.equal(agent.read(chat.state, npcId).proposal, null);
});

test('林夏既有配速剧情和接力存档可重放，当前会话不会推送专属训练', () => {
  const npcId = 'linXia';
  const profile = cast.profile(npcId);
  let state = game.createGame({ seed: 'linx-distance' });
  function advance(result) {
    assert.ok(result.ok, result.reason);
    state = result.state;
    while (state.pendingEvent) {
      const event = state.pendingEvent;
      const choice = game.EVENTS[event.id].choices.find(item => game.eventAvailability(state, item.id, event.instanceId).ok);
      const resolved = game.submitEventChoice(state, choice.id, { eventInstanceId: event.instanceId, npcCastVersion: 1 });
      assert.ok(resolved.ok, resolved.reason);
      state = resolved.state;
    }
  }
  advance(game.selectCourses(state, game.coursesForTerm(state.term, state.background.id, state.background.major).slice(0, 3).map(course => course.id)));
  advance(game.executeAction(state, 'soloSport', { npcCastVersion: 1 }));
  const occasion = game.npcOpportunity(state);
  assert.equal(occasion.npcId, npcId);
  advance(game.recordNpcDialogue(state, { npcId, kind: 'meet', text: '', say: '你好。', intent: 'none', source: 'local', trigger: occasion.key }));
  for (const action of ['walk', 'chat']) {
    advance(game.executeAction(state, action, { npcCastVersion: 1, npcSupportVersion: 1, companionId: npcId, characterVersion: 2 }));
  }
  assert.ok(game.npcStoryAvailability(state, npcId).ok);
  const active = game.npcOpportunity(state);
  assert.equal(active.kind, 'proactive');
  assert.deepEqual(active.candidates, []);
  assert.match(active.context, /认识的同学/);
  const candidates = game.npcCandidates(state, npcId);
  assert.ok(candidates.every(item => item.id !== profile.storyId));
  assert.equal(agent.fallback(state, '要我帮你记一千五的配速吗？', candidates, null, npcId).intent, 'none');
  const rows = agent.messages(state, '一千五怎么练？', candidates, null, npcId);
  assert.doesNotMatch(rows.map(row => row.content).join('\n'), /接力|交棒/);
  const invitation = { npcId, kind: 'chat', text: '要我帮你计时吗？', say: '你能帮我看一下表吗？', intent: profile.storyId, source: 'local' };
  assert.equal(game.recordNpcDialogue(state, invitation).ok, false);
  const invited = game.recordNpcDialogue(state, invitation, { replayHistoricalCandidates: true });
  assert.ok(invited.ok, invited.reason);
  const proposal = agent.read(invited.state, npcId).proposal;
  for (const legacy of [false, true]) {
    const options = { replayLegacyStory: legacy };
    const results = [
      game.runNpcStory(state, { npcId, choice: 'prepare' }, options),
      game.runNpcStory(state, { npcId, choice: 'encourage' }, options),
      game.resolveNpcProposal(invited.state, { npcId, answer: 'accept' }, { ...options, proposalRevision: proposal.createdRevision })
    ];
    for (const result of results) {
      assert.ok(result.ok, result.reason);
      assert.match(result.entry.title, legacy ? /接力前的配合/ : /一千五之前/);
      assert.equal(result.entry.command.data.storyVersion, legacy ? undefined : 1);
      assert.ok(game.validateState(result.state).ok);
      const replay = game.replay({
        nickname: result.state.nickname, seed: result.state.rng.seed,
        commands: result.state.history.map(entry => ({ ...entry.command, commandId: entry.commandId }))
      });
      assert.ok(replay.ok, replay.reason);
      assert.deepEqual(replay.state, result.state);
    }
    if (!legacy) {
      assert.match(results[0].entry.relationship.description, /每圈用时/);
      assert.doesNotMatch(results[1].entry.relationship.description, /每圈用时/);
    }
  }
});

test('林夏留出往事位置时仍保留摘要、正式拒绝和最近两轮完整原话', () => {
  const npcId = 'linXia';
  let state = cast.meet(game.createGame({ seed: 'lin-xia-context-budget' }), npcId);
  function chat(text, say, intent = 'none') {
    const result = game.recordNpcDialogue(state, { npcId, kind: 'chat', text, say, intent, source: 'online' });
    assert.ok(result.ok, result.reason);
    state = result.state;
  }
  for (let i = 0; i < 6; i++) chat('早期聊天' + i, '早期回复' + i);
  state.npcDialogueSummaries = { [npcId]: { throughRevision: state.revision, text: '之前聊过几次。' } };
  chat('去走走？', '要不要一起散步？', 'walk');
  const decline = game.resolveNpcProposal(state, { npcId, answer: 'decline' }, {
    proposalRevision: agent.read(state, npcId).proposal.createdRevision
  });
  assert.ok(decline.ok, decline.reason);
  state = decline.state;
  for (let i = 0; i < 5; i++) chat(('近期原话' + i).padEnd(240, '甲'), ('近期回应' + i).padEnd(180, '乙'));
  const current = { role: 'user', content: '你高中一千五跑过多少？' };
  const rows = agent.messages(state, current.content, game.npcCandidates(state, npcId), null, npcId);
  assert.ok(rows.length <= 14 && rows.every(row => row.content.length <= 600));
  assert.match(rows.map(row => row.content).join('\n'), /5:39[\s\S]*此前对话摘要[\s\S]*玩家拒绝了.*散步/);
  assert.deepEqual(rows.slice(-5), [3, 4].flatMap(i => [
    { role: 'user', content: ('近期原话' + i).padEnd(240, '甲') },
    linXiaHistoryReply(('近期回应' + i).padEnd(180, '乙'))
  ]).concat(current));
});

test('十二个对照场景通过真实中转的请求组装与意图解析', async () => {
  for (const scenario of scenarios) {
    const { npcId, kind, inputs, intents, context } = scenario;
    let state = game.createGame({ seed: 'npc-prompt-evaluation' });
    if (kind !== 'meet') state = cast.meet(state, npcId);
    const available = game.npcCandidates(state, npcId);
    const candidates = kind === 'chat' ? available : [];
    for (const [index, text] of inputs.entries()) {
      const accepted = [intents[index]].flat();
      assert.ok(accepted.every(id => id === 'none' || candidates.some(item => item.id === id)), scenario.name);
      const intent = accepted.at(-1);
      const say = '测试台词 ' + (index + 1);
      let upstream;
      let submitted;
      const decision = await agent.request({
        state, text, candidates, npcId, occasion: kind === 'chat' ? null : { kind, context, place: 'track' }, relay: '/test',
        fetchFn: async (_, request) => {
          submitted = JSON.parse(request.body);
          const result = await relay(submitted, {
            apiKey: 'test',
            fetchFn: async (_, options) => {
              upstream = JSON.parse(options.body);
              return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ say, intent }) } }] }) };
            }
          });
          return { ok: result.statusCode === 200, json: async () => result.body };
        }
      });
      assert.deepEqual(upstream.messages, submitted.messages, scenario.name);
      if (npcId === 'linXia') {
        const [identity, voice, task] = upstream.messages;
        assert.match(identity.content, /北京交通大学学生[\s\S]*ISFP[\s\S]*多次失约/, scenario.name);
        assert.equal(voice.role, 'system', scenario.name);
        assert.equal(voice.content, cast.profile(npcId).persona.personality[1], scenario.name);
        assert.match(voice.content, /像课间和同学当面说话.*随口回一句/, scenario.name);
        assert.match(voice.content, /你肯认自己做得好[\s\S]*我自己回[\s\S]*只是来问你去不去/, scenario.name);
        assert.match(voice.content, /按游戏记录和已知对话判断刚刚发生了什么[\s\S]*把扫码和添加留在口头提议阶段/, scenario.name);
        if (kind === 'chat') {
          assert.match(task.content, /地点只说明你们现在在哪儿。具体事实只用游戏记录、已有记忆或明确对话/, scenario.name);
          assert.match(task.content, /营业、课表、行踪或往事没给答案，就说不清楚.*玩家的安排只算玩家的，往事不能证明今天.*追问也要把假设当假设，传闻和提议按原意接.*喜好、感受和打算照常说/, scenario.name);
          assert.ok(upstream.messages.some(row => row.role === 'system' && row.content.includes('台词里的事实先核对依据')), scenario.name);
          assert.match(identity.content, /让你的回答更有情绪.*明显的转折在第一句就说出来/, scenario.name);
        }
        assert.match(task.content, /say 和 intent/, scenario.name);
        assert.match(upstream.messages[3].content, kind === 'chat' ? /当前学期：第1学期/ : /当前学期：大一上/, scenario.name);
        if (kind === 'chat' || kind === 'proactive') {
          assert.match(upstream.messages[3].content, /本阶段的相处分寸：你把对方当刚认识的同学.*多数情况下直接婉拒/, scenario.name);
        }
        if (kind !== 'chat') assert.ok(upstream.messages[3].content.includes(context), scenario.name);
        assert.doesNotMatch(upstream.messages.map(row => row.content).join('\n'), /八点半|已经练完了/, scenario.name);
      }
      if (text) assert.deepEqual(upstream.messages.at(-1), { role: 'user', content: text }, scenario.name);
      assert.deepEqual(decision, { say, intent, source: 'online' }, scenario.name);
      if (kind === 'chat') {
        const result = game.recordNpcDialogue(state, { npcId, kind, text, ...decision });
        assert.ok(result.ok, result.reason);
        state = result.state;
        if (intent !== 'none') assert.equal(agent.read(state, npcId).proposal.id, intent);
      }
    }
  }
});

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
    linXiaHistoryReply(replies.at(i - 2))
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
    { role: 'user', content: playerLine(5) }, linXiaHistoryReply(npcLine(5)),
    { role: 'user', content: playerLine(6) }, linXiaHistoryReply(npcLine(6)), current
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
  assert.match(plan.events[0].text, /害怕|展示/);
  assert.ok(plan.memories.every(item => item.id !== plan.events[0].id));
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

test('林夏自由聊天判断主次情绪，保存重放后只把上一轮反应带到模型', async () => {
  const npcId = 'linXia';
  let state = game.createGame({ seed: 'linx-distance' });
  function advance(result) {
    assert.ok(result.ok, result.reason);
    state = result.state;
    while (state.pendingEvent) {
      const event = state.pendingEvent;
      const choice = game.EVENTS[event.id].choices.find(item => game.eventAvailability(state, item.id, event.instanceId).ok);
      const resolved = game.submitEventChoice(state, choice.id, { eventInstanceId: event.instanceId, npcCastVersion: 1 });
      assert.ok(resolved.ok, resolved.reason);
      state = resolved.state;
    }
  }
  advance(game.selectCourses(state, game.coursesForTerm(state.term, state.background.id, state.background.major).slice(0, 3).map(course => course.id)));
  advance(game.executeAction(state, 'soloSport', { npcCastVersion: 1 }));
  const occasion = game.npcOpportunity(state);
  assert.equal(occasion.npcId, npcId);
  advance(game.recordNpcDialogue(state, { npcId, kind: 'meet', text: '', say: '你好。', intent: 'none', source: 'local', trigger: occasion.key }));

  const text = '我把刚提到的音频发到群里了。';
  const emotion = [['恼火', 2], ['不自在', 1]];
  const say = '下回你先问我一声。';
  const decision = await agent.request({ state, text, npcId, candidates: [], relay: '/test',
    fetchFn: async (_, request) => {
      const rows = JSON.parse(request.body).messages;
      assert.ok(rows.length <= 14 && rows.every(row => row.content.length <= 600));
      assert.ok(rows.some(row => row.content.includes('词表外') && row.content.includes('委屈')));
      assert.ok(!rows.some(row => row.content.includes('你上一轮的反应')));
      return { ok: true, json: async () => ({ reply: JSON.stringify({ emotion, say, intent: 'none' }) }) };
    } });
  assert.deepEqual(decision, { emotion, say, intent: 'none', source: 'online' });
  advance(game.recordNpcDialogue(state, { ...decision, npcId, kind: 'chat', text }));
  assert.deepEqual(state.history.at(-1).dialogue.emotion, emotion);
  assert.equal(agent.conversation(state, npcId).at(-1).content, say);
  assert.doesNotMatch(JSON.stringify(agent.conversation(state, npcId)), /emotion|恼火|不自在/);
  const loaded = JSON.parse(JSON.stringify(state));
  const check = game.validateState(loaded);
  assert.equal(check.ok, true, check.reason);
  const reply = '对不起，我这就把它撤掉。';
  const followUp = agent.messages(loaded, reply, [], null, npcId);
  assert.match(followUp.map(row => row.content).join('\n'), /上一轮的反应是恼火2级、不自在1级/);
  assert.deepEqual(followUp.slice(-3), [{ role: 'user', content: text }, linXiaHistoryReply(say, emotion), { role: 'user', content: reply }]);
  for (const rows of [agent.messages(loaded, '你好', [], null, 'zhouNing'), agent.messages(loaded, '', [], { kind: 'proactive' }, npcId)]) {
    assert.doesNotMatch(rows.map(row => row.content).join('\n'), /上一轮的反应|先写 emotion/);
  }
  advance(game.recordNpcDialogue(state, { npcId, kind: 'chat', text: reply, say: '好，知道了。', intent: 'none', source: 'local', emotion }));
  assert.equal(state.history.at(-1).dialogue.emotion, undefined);
  assert.doesNotMatch(agent.messages(state, '现在呢？', [], null, npcId).map(row => row.content).join('\n'), /上一轮的反应/);
});

test('情绪省略或不合词表时保留有效台词，内部字段不会作为纯文本显示', async () => {
  const npcId = 'linXia';
  const state = cast.meet(game.createGame({ seed: 'lin-xia-emotion-fallback' }), npcId);
  const say = '嗯，那就这么定吧。';
  const request = reply => agent.request({ state, npcId, text: '行。', candidates: [], relay: '/test',
    fetchFn: async () => ({ ok: true, json: async () => ({ reply }) }) });
  for (const emotion of [undefined, [['嘴硬', 1]], [['开心', 4]]]) {
    assert.deepEqual(await request(JSON.stringify({ emotion, say, intent: 'none' })), { say, intent: 'none', source: 'online' });
  }
  for (const emotion of ['无明显波动', '依据不足', [['词表外', 1]]]) {
    assert.deepEqual(await request(JSON.stringify({ emotion, say, intent: 'none' })), { emotion, say, intent: 'none', source: 'online' });
  }
  for (const [raw, emotion] of [
    [[['无明显波动', 1]], '无明显波动'],
    [[['开心', 1], ['开心', 2]], [['开心', 1]]],
    [[['烦躁', 1], ['无奈', 1]], [['烦躁', 1]]]
  ]) {
    assert.deepEqual(await request(JSON.stringify({ emotion: raw, say, intent: 'none' })), { emotion, say, intent: 'none', source: 'online' });
  }
  const leaked = await request('emotion: 害羞\nsay: ' + say + '\nintent: none');
  assert.equal(leaked.source, 'local');
  assert.doesNotMatch(leaked.say, /emotion|害羞/);
});

test('文字字段只用于提取台词，只有通过校验的 JSON 才能提出活动', async () => {
  const npcId = 'linXia';
  const state = cast.meet(game.createGame({ seed: 'dialogue-fields' }), npcId);
  const candidates = [{ id: 'walk', label: '一起散步' }];
  const say = '今晚先不了。';
  const request = reply => agent.request({ state, npcId, text: '今天怎么样？', candidates, relay: '/test',
    fetchFn: async () => ({ ok: true, json: async () => ({ reply }) }) });
  for (const reply of [say, 'say: ' + say, `say: ${say}\r\nintent: walk`, `say：${say} intent：none`]) {
    assert.deepEqual(await request(reply), { say, intent: 'none', source: 'online' });
  }
  const proposal = { say: '要不要去走走？', intent: 'walk' };
  assert.deepEqual(await request('```json\n' + JSON.stringify(proposal) + '\n```'), { ...proposal, source: 'online' });
  assert.deepEqual(await request(JSON.stringify({ say: `say: ${say}\nintent: walk`, intent: 'none' })), { say, intent: 'none', source: 'online' });
  for (const reply of ['say:\nintent: none', JSON.stringify({ say, intent: 'unknown' })]) {
    assert.equal((await request(reply)).source, 'local');
  }
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
