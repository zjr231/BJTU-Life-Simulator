(function (root) {
  'use strict';
  const rules = typeof module !== 'undefined' && module.exports ? require('./relationships.js') : root.CampusRelationships;
  const config = typeof module !== 'undefined' && module.exports ? require('./config.js') : root.CampusConfig;
  const PROFILES = {
    zhouNing: { ...rules.ZHOU_NING, role: 'student', places: ['library', 'think', 'ginkgo', 'track'], interests: ['study', 'life'], goalId: 'presentation', storyId: 'presentation', greeting: '又见面了，今天有什么想聊的？', intro: '我是周宁，那天在图书馆聊完还挺开心的。', activities: Object.keys(rules.ACTIVITIES), events: ['campusDiscussion', 'cat', 'seat', 'snow', 'ginkgo', 'drama'] },
    chenTeacher: { id: 'chenTeacher', name: '陈老师', role: 'teacher', gender: '男', identity: '项目与竞赛指导教师', place: 'yifu', places: ['yifu', 'think', 'library', 'auditorium'], interests: ['study', 'campus'], figure: 'teacher', abilities: { academic: 90, social: 70, sport: 50 },
      description: '负责学生项目与竞赛指导的青年教师。说话直接，但会认真听完学生的想法，习惯通过提问帮助学生自己发现问题。', strength: '梳理项目思路、检查论证漏洞、模拟答辩。', weakness: '时间安排较紧，指导前希望学生先准备具体问题。', preference: '喜欢有依据的讨论，也愿意听学生谈研究方向；重视学生自己的投入。', goal: '陪学生把一个真实问题讲清楚，完成有准备的项目展示。', goalId: 'mentorReview', storyId: 'mentorReview',
      portrait: 'assets/characters/chen-teacher-casual-v1.png', background: rules.ZHOU_NING.background,
      intro: '你好，我是陈老师，负责一些学生项目和竞赛的指导。先说说你想解决什么问题，我们再一起看看思路。', greeting: '最近项目或竞赛准备得怎么样？可以先说一个最具体的问题。',
      activities: ['selfStudy', 'projectWork', 'furtherStudy', 'jobPreparation'], events: ['projectOffer', 'projectReview', 'contest1', 'contest2', 'seminar', 'lecture'] },
    linXia: { id: 'linXia', name: '林夏', role: 'student', gender: '女', identity: '同年级运动爱好者', place: 'track', places: ['track', 'ginkgo', 'activity', 'dorm'], interests: ['sport', 'life'], figure: 'student', abilities: { academic: 50, social: 55, sport: 80 },
      description: '在操场认识的同年级同学。跑步时很有冲劲，也喜欢散步和听歌；会为团队比赛认真准备，偶尔担心自己拖累别人。', strength: '安排运动节奏，陪人坚持训练，也乐于尝试校园里的新鲜事。', weakness: '失利后容易自责，训练忙起来时会把复习计划往后推。', preference: '喜欢傍晚跑步、轻松球局和运动后的闲聊；也想把学习与训练安排得更从容。', goal: '练好接力配合，学会在比赛前和队友说出自己的担心。', goalId: 'relayPractice', storyId: 'relayPractice',
      portrait: 'assets/characters/lin-xia-sports-v1.png', background: rules.ZHOU_NING.background,
      intro: '刚才看你也在这边活动，我叫林夏，平时喜欢傍晚来操场。下次有空可以一起练，按自己的节奏就好。', greeting: '你来啦！今天想活动一下，还是坐下来聊聊？', activities: Object.keys(rules.ACTIVITIES), events: ['sportsMeet', 'injury', 'cat', 'snow', 'ginkgo'] }
  };
  const MEMORIES = { ...rules.MEMORIES, metTeacher: '在准备项目或竞赛时认识了陈老师', metAthlete: '运动后在操场认识了林夏', story_mentorReview: '和陈老师完成一次方案复盘，学会把依据讲清楚', story_relayPractice: '陪林夏练习接力配合，也听她说出了赛前的担心' };
  for (const id of Object.keys(config.EVENTS)) MEMORIES['event_' + id] ||= '共同经历：' + config.EVENTS[id].title;
  Object.assign(rules.MEMORIES, MEMORIES);
  function profile(id = 'zhouNing') { return Object.hasOwn(PROFILES, id) ? PROFILES[id] : null; }
  function get(state, id = 'zhouNing') { return !profile(id) ? null : id === 'zhouNing' ? rules.read(state).zhouNing : rules.read(state).people?.[id] || null; }
  function known(state) { return Object.keys(PROFILES).filter(id => get(state, id)); }
  function set(state, id, person) { const relation = rules.read(state); return { ...state, relationships: id === 'zhouNing' ? { ...relation, zhouNing: person } : { ...relation, people: { ...(relation.people || {}), [id]: person } } }; }
  function abilities(state, id = 'zhouNing') { return { ...(get(state, id)?.abilities || profile(id).abilities) }; }
  function life(state, id = 'zhouNing') { return get(state, id)?.life || (id === 'zhouNing' ? rules.life(state) : { mood: 65, energy: 80, goal: profile(id).goalId, lastPlace: profile(id).place, lastActivity: null, activities: {} }); }
  function usage(state, id) { const relation = rules.read(state); const value = id === 'zhouNing' ? { term: relation.term, interactions: relation.interactions, talks: relation.talks, talkGrowth: relation.talkGrowth } : get(state, id)?.usage; return value?.term === state.term ? { ...value } : { term: state.term, interactions: 0, talks: 0, talkGrowth: 0 }; }
  function setUsage(state, id, value) { return id === 'zhouNing' ? { ...state, relationships: { ...rules.read(state), ...value } } : set(state, id, { ...get(state, id), usage: value }); }
  function totalInteractions(state) { return known(state).reduce((sum, id) => sum + usage(state, id).interactions, 0); }
  function meet(state, id) { return set(state, id, { metTerm: state.term, familiarity: 10, studies: 0, presentation: null, memories: [id === 'chenTeacher' ? 'metTeacher' : 'metAthlete'], abilities: abilities(state, id), life: life(state, id), usage: usage(state, id), story: null }); }
  function status(state, id) { const value = life(state, id); return { ...value, moodLabel: value.mood >= 75 ? '心情不错' : value.mood < 40 ? '有点低落' : '心情平静', energyLabel: value.energy < 20 ? '想歇一会儿' : value.energy < 45 ? '有些疲惫' : '还有精神' }; }
  function dialogue(state, id, topic = 'greeting') {
    if (id === 'zhouNing') return rules.dialogue(state, topic);
    const p = profile(id), person = get(state, id), current = life(state, id);
    if (topic === 'likes') return id === 'chenTeacher' ? '我喜欢听到学生自己的想法。有疑问没关系，带着具体的问题讨论，往往比直接要答案有收获。' : '我喜欢傍晚跑步、打球，也喜欢听歌和沿校园慢慢走。运动之外的事也可以找我聊。';
    if (topic === 'goal') return person?.story ? '上次那件事我一直记着。接下来也想看看，你会怎样安排自己的校园生活。' : p.goal;
    if (topic === 'care') return id === 'chenTeacher' ? '最近指导安排有些满。你可以先把最想讨论的问题列出来，我们一次解决一小步。' : current.energy < 45 ? '今天有点累，想先缓一缓。可以散步或坐下来聊聊，别急着加练。' : '我还有精神。你最近过得怎么样，有没有想找人说说的事？';
    return current.lastActivity ? id === 'chenTeacher' ? '上次讨论之后，你有没有找到新的依据？先从自己做过的部分讲起。' : '上次一起活动的事，我还记着。今天听你的，也可以换个安排。' : p.greeting;
  }
  function activityLabel(id, actionId) { if (id === 'chenTeacher') return ({ selfStudy: '请教项目资料与思路', projectWork: '请老师指导当前项目', furtherStudy: '请教深造方向', jobPreparation: '请教项目经历与求职表达' })[actionId] || rules.ACTIVITIES[actionId]?.label; return rules.ACTIVITIES[actionId]?.label; }
  function activityReply(id, actionId) { return id === 'chenTeacher' ? '先把你已经准备的部分和卡住的问题说清楚，我帮你看看依据和表达。结果还需要你自己继续投入。' : id === 'linXia' && rules.ACTIVITIES[actionId]?.group === 'sport' ? '一起去吧！先热身，再按各自的节奏来，今天不着急和别人比。' : rules.ACTIVITIES[actionId]?.reply; }
  function afterActivity(id, actionId) { return id === 'chenTeacher' ? '今天把问题说得具体一些了。回去先验证你选的那条思路，下次讨论时带上自己的结果。' : rules.afterActivity(actionId); }
  function accompanied(state, id, actionId, place, agent) {
    const person = get(state, id), current = life(state, id), activity = rules.ACTIVITIES[actionId], count = totalInteractions(state);
    const growth = count >= 2 ? 2 : (person.familiarity >= 80 ? 4 : person.familiarity >= 60 ? 8 : 12) + rules.socialBonus(state);
    let nextPerson = { ...person, familiarity: Math.min(100, person.familiarity + growth), abilities: abilities(state, id), memories: [...new Set([...person.memories, 'activity_' + actionId])], life: { ...current, energy: Math.min(100, Math.max(0, current.energy - activity.effort + (activity.recovery || 0))), mood: Math.min(100, Math.max(0, current.mood + activity.mood)), lastPlace: place, lastActivity: actionId, activities: { ...current.activities, [actionId]: (current.activities[actionId] || 0) + 1 } } };
    if (actionId === 'selfStudy') { nextPerson.studies++; if (id === 'zhouNing') { nextPerson.memories = [...new Set([...nextPerson.memories, 'studied', ...(nextPerson.familiarity >= 30 ? ['notes'] : []), ...(nextPerson.familiarity >= 60 ? ['explanation'] : [])])]; } }
    if (agent) nextPerson.agent = { ...agent, proposal: agent.proposal?.id === actionId ? null : agent.proposal, messages: [...agent.messages, { role: 'assistant', content: afterActivity(id, actionId), term: state.term }].slice(-12) };
    return setUsage(set(state, id, nextPerson), id, { ...usage(state, id), interactions: usage(state, id).interactions + 1 });
  }
  function record(before, next, id, actionId) { const person = get(next, id); return { characterId: id, kind: 'activity', activityId: actionId, gained: person.familiarity - get(before, id).familiarity, familiarity: person.familiarity, description: profile(id).name + '与你' + rules.ACTIVITIES[actionId].memory + '。', npcMood: person.life.mood, npcEnergy: person.life.energy }; }
  function director(state) { const old = rules.read(state).director, legacy=rules.read(state).zhouNing?.agent; const value = old || { version: 1, term: state.term, invitations:legacy?.term===state.term?Math.min(2,legacy.invitations||0):0,intros:0,attempts:0,lastAction:legacy?.term===state.term?Math.max(-2,legacy.lastInviteAction??-2):-2,checked:[],recent:[],pending:null }; return value.term === state.term ? value : { ...value, term: state.term, invitations: 0, intros: 0, attempts: 0, checked: [], pending: null }; }
  const api = { PROFILES, MEMORIES, profile, get, known, set, abilities, life, usage, setUsage, totalInteractions, meet, status, dialogue, activityLabel, activityReply, afterActivity, accompanied, record, director };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CampusNpcCast = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
