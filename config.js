(function (root) {
  'use strict';
  const RULES = { version: 3, appVersion: '0.3.0', saveFormatVersion: 1, terms: 8, time: 12, energy: 80, maxEnergy: 100, maxAttribute: 100, maxPreparation: 100, initialMoney: 1000, initialSocial: 20, initialFitness: 50, initialMood: 70, livingCost: 300, lowMood: 30, fitnessThreshold: 60 };
  const TERM_NAMES = ['大一上', '大一下', '大二上', '大二下', '大三上', '大三下', '大四上', '大四下'];
  // These are deliberately simplified game backgrounds, not real degree programmes.
  const BACKGROUNDS = [
    { id: 'information', college: '信息类学院', majors: ['软件方向', '通信方向'], bonus: '自主学习少消耗 3 点精力。', action: 'selfStudy', energyDiscount: 3 },
    { id: 'engineering', college: '工程类学院', majors: ['交通工程方向', '土木工程方向'], bonus: '项目投入额外增加 5 点学习进度。', action: 'projectWork', preparationBonus: 5 },
    { id: 'management', college: '经管类学院', majors: ['经营管理方向', '经济分析方向'], bonus: '社团投入额外增加 2 点社交。', action: 'clubWork', socialBonus: 2 }
  ];
  const PLACES = {
    activity: { title: '学生活动中心', kicker: '社团与活动', description: '参加社团招新，跨学期投入活动，留下组织经历。' },
    think: { title: '思源楼', kicker: '课程与学习', description: '课程学习和补习增加本学期学习进度，期末统一形成成绩。' },
    library: { title: '图书馆', kicker: '自学与深造', description: '自主学习补足学习进度，大三起可以为深造积累准备。' },
    hospital: { title: '校医院', kicker: '身体状态', description: '身体恢复相关活动暂未开放，可以前往宿舍休息。' },
    gate: { title: '南门', kicker: '校内机会', description: '查看虚构的校内勤工助学和实习申请，积累求职准备。实习以经历进度模拟。' },
    track: { title: '操场', kicker: '运动与体测', description: '锻炼提高长期体能，消耗当前精力，达到条件后可参加体测体验。' },
    auditorium: { title: '天佑会堂', kicker: '讲座与演出', description: '讲座与演出暂未开放，查看地点不消耗资源。' },
    ginkgo: { title: '银杏大道', kicker: '散步与心情', description: '散步恢复心情和少量精力，时间仍然有限。' },
    yifu: { title: '逸夫楼', kicker: '项目与实践', description: '申请校园项目，持续投入并在后续学期展示成果。' },
    dorm: { title: '宿舍', kicker: '生活与休息', description: '休息恢复精力，室友交流增加社交与心情。' },
    hotel: { title: '红果园宾馆', kicker: '接待与交流', description: '校友交流暂未开放，查看地点不消耗资源。' }
  };
  const ACTIONS = {
    study: { place: 'think', title: '课程学习', description: '稳步完成课程，积累本学期学习进度。', time: 2, energy: 15, money: 0, preparation: 20, mood: -3, limit: 4 },
    tutoring: { place: 'think', title: '课程补习', description: '通过针对性辅导补足学习进度。', time: 2, energy: 10, money: 100, preparation: 25, limit: 2 },
    selfStudy: { place: 'library', title: '自主学习', description: '阅读与自习增加同一项学习进度，不另设学识或专业能力。', time: 2, energy: 12, money: 0, preparation: 20, limit: 3 },
    furtherStudy: { place: 'library', title: '深造准备', description: '大三起整理学习计划与申请材料，准备进度跨学期保留。', time: 1, energy: 8, money: 0, furtherStudy: 20, minTerm: 5, limit: 2 },
    work: { place: 'gate', title: '校内勤工助学', description: '参与虚构的校园助学工作，赚取生活费并练习沟通。', time: 2, energy: 20, money: 0, income: 200, social: 2, mood: -5, limit: 3 },
    jobPreparation: { place: 'gate', title: '求职准备', description: '大三起整理简历与面试材料，准备进度跨学期保留。', time: 1, energy: 8, money: 0, jobPreparation: 20, minTerm: 5, limit: 2 },
    rest: { place: 'dorm', title: '休息调整', description: '恢复精力和少量心情；精力已满时仍可改善未满的心情。', time: 1, energy: 0, money: 0, recovery: 30, mood: 3 },
    chat: { place: 'dorm', title: '室友交流', description: '分享近况，积累社交并改善心情。', time: 1, energy: 5, money: 0, social: 5, mood: 8, limit: 2 },
    exercise: { place: 'track', title: '锻炼', description: '提高长期体能。偶数学期达标后可参加体测体验。', time: 1, energy: 10, money: 0, fitness: 6, mood: 4, limit: 4 },
    walk: { place: 'ginkgo', title: '散步', description: '恢复心情和少量精力，不能恢复学期时间。', time: 1, energy: 0, money: 0, recovery: 10, mood: 10, limit: 3 },
    applyProject: { place: 'yifu', title: '申请校园项目', description: '第 2～6 学期开放，学习进度达到 40。申请后由你选择是否加入。', time: 1, energy: 5, money: 0, minTerm: 2, maxTerm: 6, minPreparation: 40, chain: 'project', kind: 'apply' },
    projectWork: { place: 'yifu', title: '项目投入', description: '投入两次，并在申请学期之后展示成果，完成一份项目经历。', time: 2, energy: 15, money: 0, preparation: 10, chain: 'project', kind: 'work', limit: 2 },
    applyClub: { place: 'activity', title: '参与社团招新', description: '第 1～6 学期的秋季开放。加入后投入两次，后续学期完成活动。', time: 1, energy: 5, money: 0, minTerm: 1, maxTerm: 6, autumnOnly: true, chain: 'club', kind: 'apply' },
    clubWork: { place: 'activity', title: '社团投入', description: '协助筹办校园活动，增加社交和活动进度。', time: 1, energy: 8, money: 0, social: 8, chain: 'club', kind: 'work', limit: 2 },
    applyInternship: { place: 'gate', title: '申请实习经历', description: '第 5～7 学期开放，已结算平均成绩至少 60。仅在校内模拟申请及投入。', time: 1, energy: 5, money: 0, minTerm: 5, maxTerm: 7, minAverage: 60, chain: 'internship', kind: 'apply' },
    internshipWork: { place: 'gate', title: '实习投入', description: '完成两次实践投入，获得实习经历。每次增加 100 元补贴。', time: 2, energy: 15, money: 0, income: 100, chain: 'internship', kind: 'work', limit: 2 }
  };
  const EVENTS = {
    roommateCare: { priority: 10, title: '室友的关心', description: '室友发现你最近情绪低落，问你要不要聊聊。', trigger: '心情低于 30，每学期至多一次', choices: [
      { id: 'talk', title: '和室友聊一会儿', description: '留一点时间说说最近的烦恼。', time: 1, mood: 15, social: 3 },
      { id: 'later', title: '先自己调整', description: '暂时婉拒，继续安排本学期。' }
    ] },
    fitnessTest: { priority: 20, title: '体测体验报名', description: '持续锻炼让你具备了参加本学期体测体验的条件。', trigger: '偶数学期锻炼后，体能至少 60，每学期至多一次', choices: [
      { id: 'participate', title: '参加体测体验', description: '记录一次体测达标经历。', time: 1, energy: 10, mood: 5, minFitness: 60, experience: 'fitnessTest' },
      { id: 'later', title: '这次暂不参加', description: '保留资源，下一次符合条件的学期仍有机会。' }
    ] },
    projectOffer: { priority: 30, chain: 'project', node: 'application', title: '项目组的邀请', description: '老师介绍了一项校园实践项目。完成两次投入，并在后续学期展示成果，就能留下项目经历。', trigger: '申请校园项目后', choices: [
      { id: 'accept', title: '加入项目', description: '开启项目，计划在下一学期完成。', chainEffect: 'accept' },
      { id: 'later', title: '下一学期再考虑', description: '本次不加入，后续开放学期可以重新申请。', chainEffect: 'defer' }
    ] },
    projectReview: { priority: 31, chain: 'project', node: 'review', title: '项目成果展示', description: '两次项目投入已经完成，现在可以展示成果。', trigger: '两次投入完成，且已进入申请之后的学期', choices: [
      { id: 'complete', title: '展示成果', description: '完成项目，留下可用于深造申请的经历。', mood: 5, chainEffect: 'complete', experience: 'project' },
      { id: 'later', title: '延到下一学期', description: '保留投入，延后一学期展示。最后一学期无法再延期。', chainEffect: 'postpone' },
      { id: 'abandon', title: '放弃成果确认', description: '保留投入记录，但不获得项目完成经历。', chainEffect: 'abandon' }
    ] },
    clubOffer: { priority: 40, chain: 'club', node: 'recruitment', title: '百团大战', description: '社团邀请你参与校园活动筹办。两次投入后，可以在后续学期完成活动。', trigger: '秋季参加社团招新后', choices: [
      { id: 'accept', title: '加入社团', description: '开始筹办活动，积累组织经历。', chainEffect: 'accept' },
      { id: 'later', title: '先专注其他安排', description: '暂不加入，后续秋季仍可申请。', chainEffect: 'defer' }
    ] },
    clubReview: { priority: 41, chain: 'club', node: 'activity', title: '校园活动顺利收尾', description: '前期的筹办投入已经完成，活动来到收尾阶段。', trigger: '两次投入完成，且已进入加入之后的学期', choices: [
      { id: 'complete', title: '完成参与记录', description: '完成社团链，记录组织经历。', social: 5, mood: 5, chainEffect: 'complete', experience: 'club' },
      { id: 'later', title: '延后活动', description: '保留投入，延后一学期完成。最后一学期无法再延期。', chainEffect: 'postpone' },
      { id: 'abandon', title: '放弃活动收尾', description: '保留投入记录，但不获得组织经历。', chainEffect: 'abandon' }
    ] },
    internshipOffer: { priority: 50, chain: 'internship', node: 'application', title: '校内生涯实践申请', description: '这是一段虚构的实习经历模拟。完成两次实践投入后，可用于毕业求职判定。', trigger: '符合成绩与学期条件并申请后', choices: [
      { id: 'accept', title: '接受实践安排', description: '开启实习经历，计划在下一学期前完成。', chainEffect: 'accept' },
      { id: 'later', title: '下一学期再考虑', description: '保留当前资源，后续开放学期可以重新申请。', chainEffect: 'defer' }
    ] },
    internshipReview: { priority: 51, chain: 'internship', node: 'completion', title: '实习经历确认', description: '两次实践投入已经完成，可以整理并确认经历。', trigger: '完成两次实习投入后', choices: [
      { id: 'complete', title: '完成实习记录', description: '留下可用于求职的实习经历。', mood: 5, chainEffect: 'complete', experience: 'internship' },
      { id: 'later', title: '延后确认', description: '保留投入，延后一学期确认。最后一学期无法再延期。', chainEffect: 'postpone' },
      { id: 'abandon', title: '放弃实习确认', description: '保留投入记录，但不获得实习完成经历。', chainEffect: 'abandon' }
    ] },
    campusDiscussion: { priority: 60, title: '图书馆里的偶遇', description: '自习时遇到了正在讨论课程的同学。这次机会由随机事件产生，普通学习收益保持固定。', trigger: '每学期首次自学后有 35% 概率遇到', choices: [
      { id: 'discuss', title: '加入讨论', description: '交流学习方法，补足学习进度。', time: 1, energy: 5, preparation: 5, social: 3 },
      { id: 'later', title: '继续自己的计划', description: '不消耗资源，继续安排。' }
    ] }
  };
  const ENDINGS = { graduationAverage: 60, passedTerms: 6, furtherStudyAverage: 80, furtherStudyPreparation: 60, jobPreparation: 60 };
  const api = { RULES, TERM_NAMES, BACKGROUNDS, PLACES, ACTIONS, EVENTS, ENDINGS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CampusConfig = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
