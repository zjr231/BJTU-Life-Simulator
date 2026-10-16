(function (root) {
  'use strict';
  const RULES = { version: 3, appVersion: '0.3.0', saveFormatVersion: 1, terms: 8, time: 12, energy: 80, maxEnergy: 100, maxAttribute: 100, maxPreparation: 100, initialMoney: 1000, initialSocial: 20, initialFitness: 50, initialMood: 70, livingCost: 300, lowMood: 30, fitnessThreshold: 60 };
  const TERM_NAMES = ['大一上', '大一下', '大二上', '大二下', '大三上', '大三下', '大四上', '大四下'];
  // These are deliberately simplified game backgrounds, not real degree programmes.
  const BACKGROUNDS = [
    { id: 'information', college: '信息类学院', majors: ['软件方向', '通信方向'], bonus: '对着屏幕自学更顺手：自主学习少消耗 3 点精力。', action: 'selfStudy', energyDiscount: 3 },
    { id: 'engineering', college: '工程类学院', majors: ['交通工程方向', '土木工程方向'], bonus: '图纸和方案上手快：项目投入额外增加 5 点学习进度。', action: 'projectWork', preparationBonus: 5 },
    { id: 'management', college: '经管类学院', majors: ['经营管理方向', '经济分析方向'], bonus: '组局张罗是日常：社团投入额外增加 2 点社交。', action: 'clubWork', socialBonus: 2 }
  ];
  const PLACES = {
    activity: { title: '学生活动中心', kicker: '社团与活动', description: '大厅里永远有人。招新季的海报从门口贴到宿舍楼下，吉他社在角落试音，辩论队的学长拉着新生对练。想认识谁，从这里开始。' },
    think: { title: '思源楼', kicker: '课程与学习', description: '上课铃响前五分钟，走廊里的脚步最急。有人抱着水杯去占座，有人在后排补作业，讲台边总围着问问题的同学。' },
    library: { title: '图书馆', kicker: '自学与深造', description: '刷卡进闸，挑一个靠窗的位子。翻书声很轻，笔尖划过纸页沙沙响。期末前一个月，这里一座难求。' },
    hospital: { title: '校医院', kicker: '身体状态', description: '挂号窗口半开，空气里有消毒水味。校医把听诊器夹在耳朵上，头也不抬地问：哪儿不舒服。' },
    gate: { title: '南门', kicker: '校内机会', description: '布告栏总贴着新的单子：招聘、兼职、讲座。风一吹哗哗响，总有人停下来抄上面的电话。' },
    track: { title: '操场', kicker: '运动与体测', description: '塑胶跑道在傍晚最热闹，跑步的、压腿的、散步的各占一条道。体测前一个月，人会翻倍。' },
    auditorium: { title: '天佑会堂', kicker: '讲座与演出', description: '门口的海报架空着大半。有演出的时候，散场的人会从这扇门涌出来，一路聊回宿舍。' },
    ginkgo: { title: '银杏大道', kicker: '林荫与散步', description: '秋天整条路都是金色的，拍照的人比落叶还多。平常的傍晚也有人慢慢走，什么都不赶。' },
    yifu: { title: '逸夫楼', kicker: '项目与实践', description: '实验楼的灯常亮到很晚。走廊尽头有人压着声音讨论方案，白板上的箭头画了擦、擦了画。' },
    dorm: { title: '宿舍', kicker: '生活与休息', description: '上铺的帘子拉着，桌上摊着半袋零食。熄灯前半小时，是这里一天中最像家的时间。' },
    hotel: { title: '红果园宾馆', kicker: '接待与交流', description: '前台偶尔有人办入住，多是返校的校友。行李箱的轮子在地砖上轻轻响。' }
  };
  const ACTIONS = {
    study: { place: 'think', title: '课程学习', description: '踩着铃声进教室，摊开今天要讲的那一章。一学期下来，笔记越写越厚。', time: 2, energy: 15, money: 0, preparation: 20, mood: -3, limit: 4 },
    tutoring: { place: 'think', title: '课程补习', description: '约了学长把卡住的章节讲透。两个小时，白板擦了又写。', time: 2, energy: 10, money: 100, preparation: 25, limit: 2 },
    selfStudy: { place: 'library', title: '自主学习', description: '图书馆靠窗的位子，耳机一戴，按自己的节奏过一遍。', time: 2, energy: 12, money: 0, preparation: 20, limit: 3 },
    furtherStudy: { place: 'library', title: '深造准备', description: '目标院校的招生简章打印出来，一张张贴进计划本，用荧光笔标好时间线。', time: 1, energy: 8, money: 0, furtherStudy: 20, minTerm: 5, limit: 2 },
    work: { place: 'gate', title: '校内勤工助学', description: '在值班室坐一个下午。来人办事就登记，没人就翻书。月底有一笔工资到账。', time: 2, energy: 20, money: 0, income: 200, social: 2, mood: -5, limit: 3 },
    jobPreparation: { place: 'gate', title: '求职准备', description: '简历逐行改过，面试常见题抄了半本。对着镜子练自我介绍，练到不再卡壳。', time: 1, energy: 8, money: 0, jobPreparation: 20, minTerm: 5, limit: 2 },
    rest: { place: 'dorm', title: '休息调整', description: '拉上帘子睡一觉。再睁眼，天都擦黑了。', time: 1, energy: 0, money: 0, recovery: 30, mood: 3 },
    chat: { place: 'dorm', title: '室友交流', description: '熄灯前的卧谈，从选课聊到食堂的菜，越聊越精神。', time: 1, energy: 5, money: 0, social: 5, mood: 8, limit: 2 },
    exercise: { place: 'track', title: '锻炼', description: '去操场跑几圈，出一身汗。晚风吹在脸上，很凉快。', time: 1, energy: 10, money: 0, fitness: 6, mood: 4, limit: 4 },
    walk: { place: 'ginkgo', title: '散步', description: '沿着银杏大道慢慢走，脑子里什么都不装。', time: 1, energy: 0, money: 0, recovery: 10, mood: 10, limit: 3 },
    applyProject: { place: 'yifu', title: '申请校园项目', description: '把简历和想法递到老师桌上。老师说：回去等消息。', time: 1, energy: 5, money: 0, minTerm: 2, maxTerm: 6, minPreparation: 40, chain: 'project', kind: 'apply' },
    projectWork: { place: 'yifu', title: '项目投入', description: '例会开到晚上，方案改到第七版，白板上的箭头越画越多。', time: 2, energy: 15, money: 0, preparation: 10, chain: 'project', kind: 'work', limit: 2 },
    applyClub: { place: 'activity', title: '参与社团招新', description: '百团大战的摊位一眼望不到头。报名表递出去，扫码进群。', time: 1, energy: 5, money: 0, minTerm: 1, maxTerm: 6, autumnOnly: true, chain: 'club', kind: 'apply' },
    clubWork: { place: 'activity', title: '社团投入', description: '搬桌子、贴海报、盯签到，忙到嗓子发干。', time: 1, energy: 8, money: 0, social: 8, chain: 'club', kind: 'work', limit: 2 },
    applyInternship: { place: 'gate', title: '申请实习经历', description: '成绩单和简历装进同一个文件袋，交上去。对方说，两周内回复。', time: 1, energy: 5, money: 0, minTerm: 5, maxTerm: 7, minAverage: 60, chain: 'internship', kind: 'apply' },
    internshipWork: { place: 'gate', title: '实习投入', description: '打卡，整理材料，跑腿送文件。下班走出大楼，天刚擦黑。', time: 2, energy: 15, money: 0, income: 100, chain: 'internship', kind: 'work', limit: 2 }
  };
  const EVENTS = {
    roommateCare: { priority: 10, title: '室友的关心', description: '晚上十一点，室友从对面上铺探下头，说你今天回来得挺早。沉默几秒，他问，要不要一起下楼吃点东西。', trigger: '你最近回宿舍越来越晚，话也越来越少', choices: [
      { id: 'talk', title: '和室友聊一会儿', description: '下楼，边吃边把最近的破事倒一倒。', time: 1, mood: 15, social: 3 },
      { id: 'later', title: '先自己调整', description: '说声不用了，戴上耳机。今晚想一个人待着。' }
    ] },
    fitnessTest: { priority: 20, title: '体测报名', description: '体育老师翻着点名册看了你一眼：这学期底子不错，体测的名额给你留一个。', trigger: '点名册上，你的锻炼出勤画得挺满', choices: [
      { id: 'participate', title: '参加体测', description: '报上名，上跑道。跑完这次，体测这一关就算过了。', time: 1, energy: 10, mood: 5, minFitness: 60, experience: 'fitnessTest' },
      { id: 'later', title: '这次暂不参加', description: '这次先不跑。跑道一直都在，下次再说。' }
    ] },
    projectOffer: { priority: 30, chain: 'project', node: 'application', title: '项目组的邀请', description: '课间，老师把你叫到走廊，说有个项目缺人手，问你要不要来。跟着做下去，下个学期把成果摆出来，简历上能多一行。', trigger: '你之前递出去的那份申请，有回音了', choices: [
      { id: 'accept', title: '加入项目', description: '答应下来。这学期开工，下个学期见成果。', chainEffect: 'accept' },
      { id: 'later', title: '下一学期再考虑', description: '说手头太满，婉拒。以后想清楚了还可以再申请。', chainEffect: 'defer' }
    ] },
    projectReview: { priority: 31, chain: 'project', node: 'review', title: '答辩日', description: '项目到了收尾的时候。老师把演示时间定在周五下午，PPT 在电脑里改了七版。', trigger: '结题的材料，你准备得差不多了', choices: [
      { id: 'complete', title: '展示成果', description: '上台，讲完，等答辩结束。这段经历会留在你的简历上。', mood: 5, chainEffect: 'complete', experience: 'project' },
      { id: 'later', title: '延到下一学期', description: '再打磨一学期。前提是，这不是最后一个学期。', chainEffect: 'postpone' },
      { id: 'abandon', title: '放弃展示', description: '把文件归档，不展示了。做过的事还在，只是简历上没有这一行。', chainEffect: 'abandon' }
    ] },
    clubOffer: { priority: 40, chain: 'club', node: 'recruitment', title: '百团大战', description: '摊位之间挤满了人，一个社团的学姐拉住你：我们下个活动正缺人，进群聊聊？', trigger: '你报名的社团，来消息了', choices: [
      { id: 'accept', title: '加入社团', description: '扫码进群，把报名表发过去。筹办组的任务从此开始。', chainEffect: 'accept' },
      { id: 'later', title: '先专注其他安排', description: '摆摆手说再看看。来年秋天的招新还在这里。', chainEffect: 'defer' }
    ] },
    clubReview: { priority: 41, chain: 'club', node: 'activity', title: '活动结束的那个晚上', description: '散场后，你和其他人把最后一把椅子叠起来。灯一盏盏灭掉，群里已经开始有人发「辛苦大家」。', trigger: '活动散了场，收尾的事轮到你了', choices: [
      { id: 'complete', title: '发总结收尾', description: '把签到表、照片和总结发进群。大家排队回「收到」。', social: 5, mood: 5, chainEffect: 'complete', experience: 'club' },
      { id: 'later', title: '推到下学期', description: '再准备一学期，办得更像样些。只要这学期不是最后一个。', chainEffect: 'postpone' },
      { id: 'abandon', title: '退出活动', description: '不再跟了，把任务交给下一届。忙过的事自己知道。', chainEffect: 'abandon' }
    ] },
    internshipOffer: { priority: 50, chain: 'internship', node: 'application', title: '实习的回复', description: '简历投出去两周，邮箱里多了一封回复：岗位有空缺，下周报到。通勤路线你已经查好了。', trigger: '你投出去的那份简历，有回音了', choices: [
      { id: 'accept', title: '接下实习', description: '回复邮件，接受。实习从下周一开始。', chainEffect: 'accept' },
      { id: 'later', title: '下一学期再考虑', description: '先谢过，这学期抽不开身。名额以后还会再放出来。', chainEffect: 'defer' }
    ] },
    internshipReview: { priority: 51, chain: 'internship', node: 'completion', title: '实习的最后一天', description: '最后一次打卡，工位上贴的便利贴都清空了。带教老师问，证明和评语要现在开吗？', trigger: '实习期满了，工位上的东西已经收空', choices: [
      { id: 'complete', title: '办实习证明', description: '开好实习证明，盖上章。这段经历能写进简历了。', mood: 5, chainEffect: 'complete', experience: 'internship' },
      { id: 'later', title: '下学期再办', description: '先不急着办手续。除非这已经是最后一个学期。', chainEffect: 'postpone' },
      { id: 'abandon', title: '不开证明', description: '不办手续了。干过的活不会白干，只是简历上少了一行。', chainEffect: 'abandon' }
    ] },
    campusDiscussion: { priority: 60, title: '图书馆里的偶遇', description: '旁边一桌压着声音讨论作业，你发现是同一门课。其中一个人抬头看见你，招了招手。', trigger: '你抬头，正好对上那桌人的目光', choices: [
      { id: 'discuss', title: '加入讨论', description: '拉开椅子坐过去。聊着聊着，卡住的点通了几处。', time: 1, energy: 5, preparation: 5, social: 3 },
      { id: 'later', title: '继续自己的计划', description: '点头笑笑，低头继续看自己的书。' }
    ] }
  };
  const ENDINGS = { graduationAverage: 60, passedTerms: 6, furtherStudyAverage: 80, furtherStudyPreparation: 60, jobPreparation: 60 };
  const api = { RULES, TERM_NAMES, BACKGROUNDS, PLACES, ACTIONS, EVENTS, ENDINGS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CampusConfig = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
