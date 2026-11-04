(function (root) {
  'use strict';
  // 固定人物资料和纯关系规则；游戏状态只由 game.js 的命令提交。
  const ZHOU_NING = {
    id: 'zhouNing', name: '周宁', gender: '男', identity: '同年级同学', figure: 'student', place: 'library',
    description: '在图书馆认识的同年级同学。慢热、认真，也喜欢打球、看演出和沿着校园闲逛。学习只是你们故事的开始。',
    strength: '擅长整理笔记，把零散的知识点串成清楚的思路。',
    weakness: '题目会做，上台讲解却容易紧张。',
    goal: '准备好课程展示，也练习把自己的想法讲给别人听。',
    preference: '喜欢安静的散步、轻松的球局和有趣的演出；重视约定，愿意听朋友认真说话。',
    abilities: { academic: 80, social: 45, sport: 60 },
    portrait: 'assets/characters/zhou-ning-casual-v1.png', background: 'assets/scenes/campus-afternoon-v1.png'
  };
  const MEMORIES = {
    met: '在图书馆因同一门课的作业相识', discussed: '第一次见面就一起解开了一处难点',
    studied: '第一次约好一起自习', notes: '周宁把整理好的笔记分享给你',
    explanation: '开始轮流讲题，检查彼此的理解',
    presentationLimited: '陪周宁完成第一次模拟讲解，发现了需要补足的地方',
    presentationSteady: '一起理清了课程展示的重点',
    presentationGood: '默契地完成模拟展示，周宁终于敢抬头讲述自己的思路',
    presentationEncouraged: '认真听周宁试讲，鼓励他先迈出第一步'
  };
  function create(term = 1) { return { version: 1, introSeen: false, zhouNing: null, term, talks: 0, talkGrowth: 0, interactions: 0 }; }
  function read(state) {
    const value = state.relationships || create(state.term);
    return value.term === state.term ? value : { ...value, term: state.term, talks: 0, talkGrowth: 0, interactions: 0 };
  }
  function stage(value) {
    if (value >= 100) return { label: '相知', next: null, hint: '四年的故事还在继续，共同经历会一直保留。' };
    if (value >= 80) return { label: '深入了解', next: 100, hint: '共同学习提供完整的默契加成。' };
    if (value >= 60) return { label: '熟络', next: 80, hint: '可以轮流讲题，也更愿意说出自己的顾虑。' };
    if (value >= 30) return { label: '熟悉', next: 60, hint: '已解锁分享笔记和课程展示事件。' };
    return { label: '初识', next: 30, hint: '现在就可以邀请一起学习；达到 30 解锁分享笔记和人物事件。' };
  }
  function socialBonus(state) { return state.social >= 70 ? 2 : state.social >= 40 ? 1 : 0; }
  function studyBonus(value) { return value >= 80 ? 6 : value >= 60 ? 4 : value >= 30 ? 2 : 0; }
  function studyGrowth(state) {
    const value = read(state).zhouNing?.familiarity || 0;
    return (value >= 80 ? 4 : value >= 60 ? 8 : 12) + socialBonus(state);
  }
  function remember(person, id) { return person.memories.includes(id) ? person : { ...person, memories: [...person.memories, id] }; }
  function grow(person, amount) { return { ...person, familiarity: Math.min(100, person.familiarity + amount) }; }
  function meet(state, discussed) {
    const relation = read(state);
    if (relation.zhouNing) return relation;
    return { ...relation, introSeen: true, zhouNing: {
      metTerm: state.term, familiarity: discussed ? 14 : 10, studies: 0,
      memories: discussed ? ['met', 'discussed'] : ['met'], presentation: null
    } };
  }
  function studied(state) {
    const relation = read(state);
    let person = remember(grow(relation.zhouNing, studyGrowth(state)), 'studied');
    person = { ...person, studies: person.studies + 1 };
    if (person.familiarity >= 30) person = remember(person, 'notes');
    if (person.familiarity >= 60) person = remember(person, 'explanation');
    return { ...relation, interactions: relation.interactions + 1, zhouNing: person };
  }
  function performance(state) {
    const familiarity = read(state).zhouNing?.familiarity || 0;
    const score = Math.round(familiarity * 0.5 + state.social * 0.3 + state.mood * 0.2);
    return { score, familiarity, social: state.social, mood: state.mood, level: score >= 55 ? 'good' : score >= 35 ? 'steady' : 'limited' };
  }
  function abilities(state) { return { ...(read(state).zhouNing?.abilities || ZHOU_NING.abilities) }; }
  function academicAbility(state) {
    const grades = (state.courses || []).map(course => course.grade).filter(Number.isFinite);
    return grades.length ? (state.preparation + grades.reduce((sum, grade) => sum + grade, 0) / grades.length) / 2 : state.preparation;
  }
  function playerPerformance(state) {
    const academic = academicAbility(state);
    const score = Math.round(academic * 0.5 + state.social * 0.3 + state.mood * 0.2);
    return { formula: 'player', score, academic, social: state.social, mood: state.mood, level: score >= 55 ? 'good' : score >= 35 ? 'steady' : 'limited' };
  }
  function presentationOutcome(state, choice, supportVersion = 0) {
    const assessment = supportVersion === 1 ? playerPerformance(state) : performance(state);
    if (choice === 'encourage') return { ...assessment, level: 'encouraged', title: '先迈出第一步',
      description: '你没有催促，认真听他把第一段讲完。周宁松开攥紧的笔：原来讲错一句，也可以接着往下讲。',
      mood: 5, social: 1, familiarity: 6, memory: 'presentationEncouraged' };
    const level = choice === 'outline' && assessment.level === 'limited' ? 'steady' : assessment.level;
    return { ...assessment, level, ...{
      limited: { title: '发现了需要补足的地方', description: '你们几次没接上彼此的思路。周宁记下卡住的地方，决定回去再准备；至少，他已经试着开口了。', preparation: 2, mood: -2, social: 1, familiarity: 4, memory: 'presentationLimited' },
      steady: { title: '把展示的重点讲清了', description: '你们把散乱的知识点排成顺序。周宁重新讲了一遍，这回声音虽然不大，却能连贯地讲到结尾。', preparation: 7, mood: 4, social: 3, familiarity: 10, memory: 'presentationSteady' },
      good: { title: '一次默契的模拟展示', description: '你提出的问题正好帮他补上遗漏，熟悉的回应也让他放松下来。讲到最后，周宁终于抬起头：正式展示那天，我应该也能做到。', preparation: 12, mood: 8, social: 5, familiarity: 15, memory: 'presentationGood' }
    }[level] };
  }
  function greeting(state) {
    const person = read(state).zhouNing;
    if (!person) return '旁边的同学抬起头：你也在做这门课的作业吗？';
    if (person.presentation === 'good') return '上次陪我练习展示的事，我一直记着。今天换我帮你把难点讲清楚。';
    if (person.presentation) return '谢谢你上次听我讲完。最近我又练了几遍，已经比那天放松一些了。';
    if (person.familiarity >= 60) return '位置给你留着呢。今天轮流讲题吧，不懂的地方咱们一起拆。';
    if (person.familiarity >= 30) return '我刚把这几章的笔记整理好，发你一份？有个知识点也想听听你的理解。';
    return '又见面了。我一般在图书馆自习，你有空的话，我们可以一起学。';
  }
  // v2 日常同行独立于旧版学习记录，旧命令继续按原规则重放。
  const ACTIVITIES = {
    study: { group: 'study', label: '一起上课', effort: 8, mood: -1, bonus: 'preparation', memory: '一起踩着铃声走进教室，课后对照笔记', reply: '我把笔带上。下课后互相看看有没有漏记的地方？' },
    tutoring: { group: 'study', label: '一起补习', effort: 8, mood: 0, bonus: 'preparation', memory: '一起补习，把卡住的章节重新梳理了一遍', reply: '正好，我也有几个问题没想明白，一起去问清楚。' },
    selfStudy: { group: 'study', label: '一起自习', effort: 8, mood: 1, bonus: 'preparation', memory: '一起自习，分享各自的解题思路', reply: '好，我去占靠窗的位置。学累了我们就歇一会儿。' },
    furtherStudy: { group: 'study', label: '一起准备深造', effort: 10, mood: -1, bonus: 'furtherStudy', memory: '一起查资料，讨论毕业之后的选择', reply: '先把想了解的方向列出来吧。我也想听听你以后打算去哪里。' },
    jobPreparation: { group: 'study', label: '一起准备求职', effort: 8, mood: 0, bonus: 'jobPreparation', memory: '一起修改简历，轮流模拟面试', reply: '你先讲讲做过的事，我当一回面试官，之后我们交换。' },
    exercise: { group: 'sport', label: '一起锻炼', effort: 12, mood: 6, bonus: 'mood', memory: '一起绕操场跑步，边喘气边给彼此打气', reply: '走，先慢跑两圈。今天不比速度，能一起坚持下来就行。' },
    gym: { group: 'sport', label: '一起去健身房', effort: 14, mood: 5, bonus: 'mood', memory: '一起在健身房练习，轮流帮对方数次数', reply: '先热身，重量慢慢加。我帮你数次数，你可别偷偷少做。' },
    teamSport: { group: 'sport', label: '一起参加多人运动', effort: 14, mood: 7, bonus: 'mood', memory: '一起凑进球局，记住了默契接应的一刻', reply: '我去问问还缺不缺人。输了也没事，跑起来就痛快。' },
    soloSport: { group: 'sport', label: '各练各的，也一起出发', effort: 8, mood: 4, bonus: 'mood', memory: '各自完成运动计划，结束后在操场碰头', reply: '那我们按各自的节奏练，结束后在看台下面碰头。' },
    basketball: { group: 'sport', label: '一起打篮球', effort: 14, mood: 7, bonus: 'mood', memory: '一起打篮球，他帮忙捡球，也为每次命中喝彩', reply: '好啊！你来投，我帮你捡球。手感不好的时候也别急。' },
    walk: { group: 'life', label: '一起散步', effort: 0, recovery: 12, mood: 6, bonus: 'mood', memory: '一起沿银杏大道散步，把近况慢慢说开', reply: '我也想出去透透气。沿银杏大道走吧，路上慢慢聊。' },
    show: { group: 'life', label: '一起看演出', effort: 4, mood: 7, bonus: 'mood', memory: '一起看演出，散场后还聊了很久', reply: '听说今晚有演出。散场后我们再交换一下最喜欢的片段？' },
    chat: { group: 'life', label: '一起聊聊宿舍生活', effort: 3, mood: 4, bonus: 'mood', memory: '一起聊起宿舍里那些好笑又琐碎的小事', reply: '我带点零食过去。最近有件特别好笑的事，一直想跟你讲。' },
    rest: { group: 'life', label: '约好各自休息', effort: 0, recovery: 25, mood: 5, bonus: 'mood', memory: '互相提醒放下安排，好好休息了一次', reply: '今天就别硬撑了。我们各自歇一会儿，醒了再报个平安。' },
    checkup: { group: 'life', label: '一起去体检', effort: 4, mood: 0, bonus: 'mood', memory: '一起去校医院体检，在候诊区互相等候', reply: '我陪你去，顺便把该问的注意事项记下来。' },
    sickVisit: { group: 'life', label: '陪你去校医院', effort: 3, mood: -1, bonus: 'mood', memory: '身体不舒服时，他陪你去校医院拿药', reply: '先把身体照顾好。我陪你排队，药怎么吃也一起听清楚。' },
    treatment: { group: 'life', label: '请周宁陪你就诊', effort: 0, mood: 2, bonus: 'mood', memory: '生病时，周宁陪你完成就诊', reply: '先别安排别的了，我陪你去校医院。有什么事等好一点再说。' },
    work: { group: 'campus', label: '一起勤工助学', effort: 12, mood: -2, bonus: 'mood', memory: '一起完成值班，收工后分享当天的小插曲', reply: '我跟你一起去。先把分工弄清楚，忙完以后再坐下来歇歇。' },
    applyProject: { group: 'campus', label: '陪你申请项目', effort: 5, mood: 1, memory: '陪你准备项目申请，一起讨论想法', reply: '把你想做的事讲给我听吧，我帮你看看有没有没说明白的地方。' },
    projectWork: { group: 'campus', label: '一起推进项目', effort: 12, mood: -1, bonus: 'preparation', memory: '一起讨论项目方案，改掉了几个遗漏', reply: '我们先把眼前这一步做好。不同意见可以慢慢聊，别都憋着。' },
    applyClub: { group: 'campus', label: '一起逛社团招新', effort: 5, mood: 5, memory: '一起逛过招新摊位，分享彼此感兴趣的社团', reply: '一起去看看？你想去哪个摊位，我陪你问问。' },
    clubWork: { group: 'campus', label: '一起参加社团活动', effort: 10, mood: 4, bonus: 'social', memory: '一起布置社团活动，散场后把最后的东西收好', reply: '我来搭把手。忙完以后，记得也给自己留一点玩活动的时间。' },
    applyInternship: { group: 'campus', label: '陪你申请实习', effort: 5, mood: 1, memory: '陪你准备实习申请，一起核对材料', reply: '材料我们再核对一遍。递出去以后，就安心等消息。' },
    internshipWork: { group: 'campus', label: '互相支持实习安排', effort: 12, mood: -1, bonus: 'mood', memory: '实习忙碌时互相支持，收工后交流见闻', reply: '那我们各自把今天的任务做好，下班再碰头。我想听你讲讲那边的事。' },
    alumniVolunteer: { group: 'campus', label: '一起做志愿服务', effort: 10, mood: 4, bonus: 'social', memory: '一起接待返校校友，听到许多校园旧事', reply: '我负责引路，你来签到怎么样？遇到有趣的故事，记得讲给我听。' }
  };
  for (const [id, activity] of Object.entries(ACTIVITIES)) MEMORIES['activity_' + id] = activity.memory;
  Object.assign(MEMORIES, { event_campusDiscussion: '和周宁偶遇后一起加入课程讨论', event_cat: '和周宁在台阶旁一起喂猫', event_seat: '周宁陪你处理了一次占座的小插曲', event_snow: '和周宁一起看过北京初雪', event_ginkgo: '在银杏大道偶遇，一起拍下金黄的校园', event_drama: '和周宁偶遇后一起看了毕业大戏' });
  function life(state) {
    return read(state).zhouNing?.life || { mood: 65, energy: 80, goal: read(state).zhouNing?.presentation ? 'explore' : 'presentation', lastPlace: 'library', lastActivity: null, activities: {} };
  }
  function status(state) {
    const current = life(state);
    return { ...current, moodLabel: current.mood >= 75 ? '心情不错' : current.mood < 40 ? '有点低落' : '心情平静', energyLabel: current.energy < 20 ? '想歇一会儿' : current.energy < 45 ? '有些疲惫' : '还有精神' };
  }
  function activityBonus(state, id) {
    const metric = ACTIVITIES[id]?.bonus;
    const familiarity = read(state).zhouNing?.familiarity || 0;
    const amount = id === 'selfStudy' ? studyBonus(familiarity) : familiarity >= 80 ? 3 : familiarity >= 60 ? 2 : familiarity >= 30 ? 1 : 0;
    return metric && amount ? { [metric]: amount } : {};
  }
  function accompanied(state, id, place) {
    const relation = read(state);
    const current = life(state);
    const activity = ACTIVITIES[id];
    const growth = relation.interactions >= 2 ? 2 : studyGrowth(state);
    let person = grow(relation.zhouNing, growth);
    person = remember(person, 'activity_' + id);
    if (id === 'selfStudy') {
      person = remember(person, 'studied');
      person = { ...person, studies: person.studies + 1 };
      if (person.familiarity >= 30) person = remember(person, 'notes');
      if (person.familiarity >= 60) person = remember(person, 'explanation');
    }
    person.life = { ...current, energy: Math.min(100, Math.max(0, current.energy - activity.effort + (activity.recovery || 0))), mood: Math.min(100, Math.max(0, current.mood + activity.mood)), lastPlace: place, lastActivity: id, activities: { ...current.activities, [id]: (current.activities[id] || 0) + 1 } };
    return { ...relation, interactions: Math.min(4, relation.interactions + 1), zhouNing: person };
  }
  function activityRecord(state, next, id) {
    const before = read(state).zhouNing;
    const after = read(next).zhouNing;
    return { characterId: 'zhouNing', kind: 'activity', activityId: id, gained: after.familiarity - before.familiarity, familiarity: after.familiarity,
      description: ACTIVITIES[id].memory + '。' + (id === 'rest' ? '你们各自休息，醒来以后互相报了平安。' : '这一段共同度过的时间，周宁也记住了。'), npcMood: after.life.mood, npcEnergy: after.life.energy };
  }
  function dialogue(state, topic = 'greeting') {
    const person = read(state).zhouNing;
    const current = status(state);
    if (topic === 'likes') return '我喜欢沿着校园慢慢走，也喜欢打球、听现场演出。笔记只是我比较顺手的事，生活当然还有很多别的。你喜欢什么？';
    if (topic === 'goal') return person?.presentation ? '那次练习之后，我发现很多事可以慢慢试。接下来想多参加些活动，也想知道你对未来有什么打算。' : '最近在准备课程展示。我能把题做出来，却总担心站上去会讲乱。有时候也想先出去走走，换换脑子。';
    if (topic === 'care') return current.energy < 45 ? '被你看出来了，最近确实有点累。如果不急，我们找个地方坐坐，或者今天都早点休息？' : '谢谢你惦记。我现在还挺有精神的。你呢，最近有没有什么事想找人聊聊？';
    if (person?.presentation === 'good') return '上次陪我练展示的事，我一直记着。今天听你的，去打球、散步，或者做点别的都行。';
    if (current.energy < 20) return '见到你挺开心的，不过我现在有点累。一起走走、歇歇，或者坐下来聊一会儿吧？';
    if (current.lastActivity === 'walk') return '上次沿银杏大道聊的那些事，我还记着。今天想继续走走，还是换个地方？';
    if (current.lastActivity === 'show') return '上次演出里那个片段，我后来又想起好几次。今天有什么新安排？';
    if (current.lastActivity === 'rest') return '上次约好停下来休息，确实舒服多了。今天也记得给自己留一点空闲。';
    if (current.lastActivity && ACTIVITIES[current.lastActivity].group === 'sport') return '上次一起运动以后，我还挺想再去操场的。今天听你的，也可以试试别的安排。';
    if (current.lastActivity) return '上次和你一起做事时聊到的想法，我后来又琢磨了一会儿。今天有什么安排？';
    if (person?.familiarity >= 30) return '你来啦。今天别光想着作业，也可以去操场转转，或者一起看看校园里有什么活动。';
    return '又见面了！那天聊完还挺开心的。我平时也会去操场、看演出，你有空的话，我们可以一起去。';
  }
  function afterActivity(id) {
    if (id === 'rest') return '睡醒以后舒服多了。谢谢你提醒我停一停，今天不用把每件事都塞得满满的。';
    if (['treatment', 'sickVisit', 'checkup'].includes(id)) return '医生的话我们都记下了。接下来先把身体照顾好，别的事情可以慢慢来。';
    if (id === 'walk') return '像这样沿着校园走一走，整个人都松快了。刚才聊到的事，我会记着的。';
    if (id === 'show') return '刚才那一段我特别喜欢！散场以后和你再聊一遍，好像又多记住了几个细节。';
    if (ACTIVITIES[id]?.group === 'sport') return '出了一身汗，反而觉得心里轻松了。下次有空再一起活动吧，我还想试试别的项目。';
    if (ACTIVITIES[id]?.group === 'study') return '刚才互相讲了一遍，我也发现了几个原来没想清楚的地方。今天一起做这件事，挺好的。';
    return '今天有你一起，忙完以后也多了些能回头聊的小事。你刚才说的那些想法，我会认真想想。';
  }
  const api = { ZHOU_NING, MEMORIES, ACTIVITIES, create, read, stage, socialBonus, studyBonus, studyGrowth, remember, grow, meet, studied, performance, presentationOutcome, greeting, life, status, activityBonus, accompanied, activityRecord, dialogue, afterActivity, abilities, academicAbility, playerPerformance };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CampusRelationships = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
