(function (root) {
  'use strict';
  const RULES = { version: 3, appVersion: '0.5.5', saveFormatVersion: 1, terms: 8, time: 12, energy: 80, maxEnergy: 100, maxAttribute: 100, maxPreparation: 100, initialMoney: 1000, initialSocial: 20, initialFitness: 50, initialMood: 70, livingCost: 300, lowMood: 30, fitnessThreshold: 60 };
  // Fitness tiers scale the costs/rewards of non-health actions and events.
  const FITNESS_TIERS = [
    { id: 'sick', label: '生病', min: 0, max: 24, reward: 0, cost: 0, ill: true },
    { id: 'weak', label: '虚弱', min: 25, max: 44, reward: 0.75, cost: 1.25 },
    { id: 'normal', label: '一般', min: 45, max: 64, reward: 1, cost: 1 },
    { id: 'good', label: '良好', min: 65, max: 84, reward: 1.15, cost: 0.85 },
    { id: 'excellent', label: '优秀', min: 85, max: 100, reward: 1.3, cost: 0.75 }
  ];
  const TERM_NAMES = ['大一上', '大一下', '大二上', '大二下', '大三上', '大三下', '大四上', '大四下'];
  // Majors follow BJTU's public programme names; term order and course load stay game-simplified.
  const BACKGROUNDS = [
    { id: 'information', college: '信息类学院', majors: ['计算机科学与技术', '通信工程', '软件工程', '人工智能'], legacyMajors: ['软件方向', '通信方向'], bonus: '对着屏幕自学更顺手：自主学习少消耗 3 点精力。', action: 'selfStudy', energyDiscount: 3 },
    { id: 'engineering', college: '工程类学院', majors: ['土木工程', '交通运输', '机械工程', '电气工程及其自动化'], legacyMajors: ['交通工程方向', '土木工程方向'], bonus: '图纸和方案上手快：项目投入额外增加 5 点学习进度。', action: 'projectWork', preparationBonus: 5 },
    { id: 'management', college: '经管类学院', majors: ['经济学', '金融学', '会计学', '工商管理'], legacyMajors: ['经营管理方向', '经济分析方向'], bonus: '组局张罗是日常：社团投入额外增加 2 点社交。', action: 'clubWork', socialBonus: 2 }
  ];
  const PLACES = {
    activity: { title: '学生活动中心', kicker: '社团与活动', description: '大厅里永远有人。招新季的海报从门口贴到宿舍楼下，吉他社在角落试音，辩论队的学长拉着新生对练。想认识谁，从这里开始。' },
    think: { title: '思源楼', kicker: '课程与学习', description: '上课铃响前五分钟，走廊里的脚步最急。有人抱着水杯去占座，有人在后排补作业，讲台边总围着问问题的同学。' },
    library: { title: '图书馆', kicker: '自学与深造', description: '刷卡进闸，挑一个靠窗的位子。翻书声很轻，笔尖划过纸页沙沙响。期末前一个月，这里一座难求。' },
    hospital: { title: '校医院', kicker: '身体状态', description: '挂号窗口半开，空气里有消毒水味。校医把听诊器夹在耳朵上，头也不抬地问：哪儿不舒服。身体亮红灯时，先来这里。' },
    gate: { title: '南门', kicker: '校内机会', description: '布告栏总贴着新的单子：招聘、兼职、讲座。风一吹哗哗响，总有人停下来抄上面的电话。' },
    track: { title: '操场', kicker: '运动与体测', description: '塑胶跑道在傍晚最热闹，跑步的、压腿的、散步的各占一条道。跑道边还有一间小健身房，球场上总有人在等人凑局。体测前一个月，人会翻倍。' },
    auditorium: { title: '天佑会堂', kicker: '讲座与演出', description: '门口的海报架空着大半。有演出的时候，散场的人会从这扇门涌出来，一路聊回宿舍。' },
    ginkgo: { title: '银杏大道', kicker: '林荫与散步', description: '秋天整条路都是金色的，拍照的人比落叶还多。平常的傍晚也有人慢慢走，什么都不赶。' },
    yifu: { title: '逸夫楼', kicker: '项目与实践', description: '实验楼的灯常亮到很晚。走廊尽头有人压着声音讨论方案，白板上的箭头画了擦、擦了画。' },
    dorm: { title: '宿舍', kicker: '生活与休息', description: '上铺的帘子拉着，桌上摊着半袋零食。熄灯前半小时，是这里一天中最像家的时间。' },
    hotel: { title: '红果园宾馆', kicker: '接待与交流', description: '前台偶尔有人办入住，多是返校的校友。行李箱的轮子在地砖上轻轻响。' }
  };
  const ACTIONS = {
    study: { place: 'think', title: '课程学习', description: '踩着铃声进教室，摊开今天要讲的那一章。一学期下来，笔记越写越厚。', time: 2, energy: 15, fitnessCost: 3, money: 0, preparation: 20, mood: -3, limit: 4 },
    tutoring: { place: 'think', title: '课程补习', description: '约了学长把卡住的章节讲透。两个小时，白板擦了又写。', time: 2, energy: 10, fitnessCost: 2, money: 100, preparation: 25, limit: 2 },
    selfStudy: { place: 'library', title: '自主学习', description: '图书馆靠窗的位子，耳机一戴，按自己的节奏过一遍。', time: 2, energy: 12, fitnessCost: 3, money: 0, preparation: 20, limit: 3 },
    furtherStudy: { place: 'library', title: '深造准备', description: '目标院校的招生简章打印出来，一张张贴进计划本，用荧光笔标好时间线。', time: 1, energy: 8, fitnessCost: 2, money: 0, furtherStudy: 20, minTerm: 5, limit: 2 },
    work: { place: 'gate', title: '校内勤工助学', description: '在值班室坐一个下午。来人办事就登记，没人就翻书。月底有一笔工资到账。', time: 2, energy: 20, fitnessCost: 4, money: 0, income: 200, social: 2, mood: -5, limit: 3 },
    jobPreparation: { place: 'gate', title: '求职准备', description: '简历逐行改过，面试常见题抄了半本。对着镜子练自我介绍，练到不再卡壳。', time: 1, energy: 8, fitnessCost: 2, money: 0, jobPreparation: 20, minTerm: 5, limit: 2 },
    rest: { place: 'dorm', title: '休息调整', description: '拉上帘子睡一觉。再睁眼，天都擦黑了。', time: 1, energy: 0, fitnessCost: 0, money: 0, recovery: 30, mood: 3 },
    chat: { place: 'dorm', title: '室友交流', description: '熄灯前的卧谈，从选课聊到食堂的菜，越聊越精神。', time: 1, energy: 5, fitnessCost: 1, money: 0, social: 5, mood: 8, limit: 2 },
    exercise: { place: 'track', title: '锻炼', description: '去操场跑几圈，出一身汗。晚风吹在脸上，很凉快。', time: 1, energy: 10, fitnessCost: 2, money: 0, fitness: 6, mood: 4, limit: 4, hint: '运动会消耗体能，但锻炼结束后能恢复更多体能。' },
    gym: { place: 'track', title: '健身房锻炼', description: '刷开健身房的门，器械区还空着。热身之后，按计划一组一组做完。', time: 1, energy: 12, fitnessCost: 3, money: 50, limit: 2, hint: '需要额外预算，但体能提升更明显。' },
    teamSport: { place: 'track', title: '多人运动', description: '群里喊一声，球场很快就凑齐人。足球、篮球、橄榄球，规则不重要，跑起来就行。', time: 1, energy: 15, fitnessCost: 3, money: 0, limit: 2, hint: '更耗费精力，但心情和社交提升更多。' },
    soloSport: { place: 'track', title: '单人运动', description: '戴上耳机，沿着跑道或骑行道出发。骑行、游泳、跑步，一个人也能把节奏找回来。', time: 1, energy: 3, fitnessCost: 1, money: 0, limit: 3, hint: '精力消耗最少，适合日常保持体能。' },
    walk: { place: 'ginkgo', title: '散步', description: '沿着银杏大道慢慢走，脑子里什么都不装。', time: 1, energy: 0, fitnessCost: 0, money: 0, recovery: 10, mood: 10, limit: 3 },
    applyProject: { place: 'yifu', title: '申请校园项目', description: '把简历和想法递到老师桌上。老师说：回去等消息。', time: 1, energy: 5, fitnessCost: 1, money: 0, minTerm: 2, maxTerm: 6, minPreparation: 40, chain: 'project', kind: 'apply' },
    projectWork: { place: 'yifu', title: '项目投入', description: '例会开到晚上，方案改到第七版，白板上的箭头越画越多。', time: 2, energy: 15, fitnessCost: 3, money: 0, preparation: 10, chain: 'project', kind: 'work', limit: 2 },
    applyClub: { place: 'activity', title: '参与社团招新', description: '百团大战的摊位一眼望不到头。报名表递出去，扫码进群。', time: 1, energy: 5, fitnessCost: 1, money: 0, minTerm: 1, maxTerm: 6, autumnOnly: true, chain: 'club', kind: 'apply' },
    clubWork: { place: 'activity', title: '社团投入', description: '搬桌子、贴海报、盯签到，忙到嗓子发干。', time: 1, energy: 8, fitnessCost: 2, money: 0, social: 8, chain: 'club', kind: 'work', limit: 2 },
    applyInternship: { place: 'gate', title: '申请实习经历', description: '成绩单和简历装进同一个文件袋，交上去。对方说，两周内回复。', time: 1, energy: 5, fitnessCost: 1, money: 0, minTerm: 5, maxTerm: 7, minAverage: 60, chain: 'internship', kind: 'apply' },
    internshipWork: { place: 'gate', title: '实习投入', description: '打卡，整理材料，跑腿送文件。下班走出大楼，天刚擦黑。', time: 2, energy: 15, fitnessCost: 3, money: 0, income: 100, chain: 'internship', kind: 'work', limit: 2 },
    checkup: { place: 'hospital', title: '体检', description: '挂号、量血压、抽血。医生看着单子说：各项指标正常。', time: 1, energy: 5, fitnessCost: 1, money: 50, fitness: 3, mood: 2, limit: 1 },
    sickVisit: { place: 'hospital', title: '看病开药', description: '在候诊区等了半小时。校医开了药，叮嘱按时吃、别熬夜。', time: 1, energy: 3, fitnessCost: 1, money: 60, mood: 8, limit: 2 },
    treatment: { place: 'hospital', title: '校医院就诊', description: '身体已经亮红灯。先挂个号，把状态稳下来。', time: 1, energy: 0, fitnessCost: 0, money: 20, fitnessFloor: 25, sickOnly: true, emergencyMoney: true, hint: '生病时只能先来校医院；诊费 20 元，钱包不够时按现有余额支付。' },
    alumniVolunteer: { place: 'hotel', title: '校友接待志愿', description: '给返校校友签到、指路、搬资料。听他们聊起当年的北交，好像比现在还要热闹。', time: 2, energy: 10, fitnessCost: 2, money: 0, social: 5, mood: 3, limit: 2 },
    show: { place: 'auditorium', title: '看演出', description: '会堂今晚有演出。灯暗下来的时候，你才想起上次看戏还是高中。', time: 1, energy: 2, fitnessCost: 1, money: 40, mood: 8, social: 2, limit: 3 }
  };
  const ACTION_INVESTMENTS = {
    study: {
      resource: 'energy', min: 5, max: 30, default: 15, h: 15, s: 0.65, rewards: { preparation: 60 }, label: '课堂投入',
      description: '决定这次上课留多少精力给听讲、随堂练习和课后梳理。',
      plans: ['你先跟上课堂的主线，只记下最关键的几个步骤。', '你认真听完讲解，把例题和随堂练习重新过了一遍。', '你提前翻过教材，课上逐步推演，课后又追着老师问了几个问题。'],
      outcomes: { setback: '这一章的前置知识没接上，听着明白，合上笔记却又卡住。投入了精力，消化的内容比想象中少。', limited: '几个基本概念记住了，复杂题型还没来得及展开。你在页边留了记号，等以后再补。', steady: '例题中的关键转折终于理顺，你把容易混淆的地方重新写进笔记。', good: '老师换了个讲法，正好接上你一直没想通的一环。几道相关题也顺着做通了。', surprise: '老师随口举的生活例子，恰好让你抓住了整个章节的主线。有限的投入碰上了适合自己的理解方式。' }
    },
    tutoring: {
      resource: 'money', min: 40, max: 240, default: 100, h: 100, s: 0.4, rewards: { preparation: 75 }, label: '补习预算',
      description: '安排这次补习的资料和辅导预算，时间与精力仍需另外留出。',
      plans: ['你挑了一处最紧迫的难点，约学长作针对讲解。', '你带着错题本，把近期卡住的章节逐一问过。', '你准备了系统的练习资料，请学长从基础到综合题一起梳理。'],
      outcomes: { setback: '辅导的例题与你真正卡住的题型有些错位，讲解听完，自己动手时仍不够顺畅。', limited: '最着急的一道题讲清了，其他问题还留在错题本里。', steady: '白板擦了又写，原本跳过的一步步推导终于补齐。', good: '学长找到了你反复出错的思维习惯，后面的题做起来顺畅许多。', surprise: '你拿来的那道题恰好是学长熟悉的典型题，几句话就点透了背后的解法。' }
    },
    selfStudy: {
      resource: 'energy', min: 4, max: 24, default: 12, h: 12, s: 0.65, rewards: { preparation: 60 }, label: '自习投入',
      description: '决定花多少精力读书、刷题或回头检查之前没懂的地方。',
      plans: ['你只翻开最需要补的一节，做了几道基础题。', '你按计划读完内容，做题后把错因单独记下来。', '你关掉消息提醒，从概念一路推到综合题，又回头整理了知识之间的联系。'],
      outcomes: { setback: '题目比预想中绕，几条思路试到一半都走不通。闭馆音乐响起时，进度仍停在同一页附近。', limited: '基础题做完了，书签向后挪了几页。更难的部分留在下一次安排里。', steady: '几处一直含糊的定义理清了，你终于能独立写出解题步骤。', good: '草稿纸上的线索接到了一起，之前反复做错的一类题突然有了统一的解法。', surprise: '你随手翻到的例题恰好回应了课堂上的疑问。没有久坐，却找到了那块缺失的拼图。' }
    },
    furtherStudy: {
      resource: 'energy', min: 3, max: 20, default: 8, h: 8, s: 0.55, rewards: { furtherStudy: 60 }, label: '深造准备投入',
      description: '为查资料、梳理考试安排和练习留出精力。',
      plans: ['你先核对一项近期节点，把最急的资料收进文件夹。', '你按目标整理资料，完成一轮练习并核对下一步安排。', '你对照目标要求反复查漏补缺，把资料、练习和时间线逐项重新排好。'],
      outcomes: { setback: '几份资料的口径不一致，练习又暴露出没补好的基础。忙了一轮，真正落实的部分仍然有限。', limited: '最紧迫的事项处理好了，完整的准备计划还有不少空白。', steady: '原本散落的任务有了顺序，计划本上终于能划掉几个节点。', good: '一份合适的资料和今天的练习恰好互相印证，后面的准备方向清楚了许多。', surprise: '一次简短的查找碰到了整理完整的资料索引，你少绕了好几条弯路。' }
    },
    jobPreparation: {
      resource: 'energy', min: 3, max: 20, default: 8, h: 8, s: 0.55, rewards: { jobPreparation: 60 }, label: '求职准备投入',
      description: '把精力分配给修改简历、研究岗位和模拟面试。',
      plans: ['你先修掉简历里几处最明显的问题。', '你按岗位要求改好简历，对着镜子练了一轮自我介绍。', '你逐项分析岗位要求，重写经历，并录下模拟面试反复回听。'],
      outcomes: { setback: '练习的问题与目标岗位不太贴合，自我介绍越改越长。忙了不少，真正能用的部分还需要重新整理。', limited: '几处表述变清楚了，但讲经历时仍有些磕绊。', steady: '你删掉了空泛的句子，终于能把做过什么、遇到什么问题讲得具体一些。', good: '回听录音时，你找到了最适合说明自己能力的那段经历，整份材料也跟着有了重点。', surprise: '同学随口提的一条反馈，正好点出了简历最不清楚的地方。改动不多，思路却打开了。' }
    },
    work: {
      resource: 'energy', min: 8, max: 40, default: 20, h: 20, s: 0.55, rewards: { income: 600, social: 6 }, label: '勤工投入',
      description: '决定接下多少登记、整理和协助任务，补助按本次实际完成的工作结算。',
      plans: ['你接了几项熟悉的小任务，把剩余精力留给其他安排。', '你把值班和整理任务接好，按流程逐一处理。', '你主动多接了一批任务，从登记到核对都跟到收尾。'],
      outcomes: { setback: '几份材料反复缺项，核对花了很多工夫，最终能计入完成量的任务却不多。', limited: '熟悉的几项事务处理完了，补助不多，也没把自己耗得太累。', steady: '记录和材料都对上了，负责人按完成的工作量确认了这次补助。', good: '今天的任务衔接得很顺，积压的材料也一并处理好了。负责人结算时特意肯定了你的配合。', surprise: '你恰好熟悉今天用到的表格，几项任务很快就理顺了，有限的投入完成了比预计更多的工作。' }
    },
    rest: {
      resource: 'time', min: 1, max: 3, default: 1, h: 1, s: 0.3, rewards: { recovery: 90, mood: 9, fitness: 15 }, label: '休息时间',
      description: '把一部分学期时间留给睡眠、放空和调整，时间用掉后无法补回。',
      plans: ['你拉上帘子，给自己留了一小段不用回应消息的时间。', '你暂时放下手头的事，在宿舍安静休息。', '你推开其他安排，关掉提醒，给自己留了一段完整的休息。'],
      outcomes: { setback: '走廊的动静和没放下的心事轮流把你叫醒，躺了很久，恢复却没有想象中充分。', limited: '你醒来后不再那么困，脑子里却还有些没散的倦意。', steady: '醒来时呼吸和心跳都慢了下来，身体终于跟上了自己的节奏。', good: '这一觉睡得很沉，睁眼时连紧绷的肩膀都松开了。', surprise: '只是短暂闭眼，你却恰好睡了个安稳的小觉，醒来比预想中清爽。' }
    },
    chat: {
      resource: 'energy', min: 2, max: 15, default: 5, h: 5, s: 0.8, rewards: { social: 15, mood: 24 }, label: '交流投入',
      description: '决定花多少精力认真倾听、分享近况和回应室友。',
      plans: ['你接了几句近况，把最想说的一件小事讲给室友听。', '你放下手机，和室友完整聊了聊最近各自的生活。', '你耐心听完室友的困惑，也把自己一直没说开的事情讲了出来。'],
      outcomes: { setback: '几句话没接上彼此的心情，话题绕了很久也没展开。你有些疲惫，距离并没有拉近多少。', limited: '你们互相知道了几件近况，随口笑了两声，各自继续手头的事。', steady: '聊到最后，许多以为只有自己遇到的问题，原来室友也经历过。', good: '一句认真回应让对方放下了顾虑，你们聊开了许久没提的心事。', surprise: '你随口提的爱好恰好也是室友最近在研究的事，几句话就有了新的共同话题。' }
    },
    exercise: {
      resource: 'energy', min: 4, max: 25, default: 10, h: 10, s: 0.55, rewards: { fitness: 26, mood: 12 }, label: '锻炼投入',
      description: '在热身后，决定为跑步和基础训练投入多少精力。',
      plans: ['你沿跑道慢跑几圈，活动开身体便收住节奏。', '你按熟悉的节奏完成跑步和拉伸，认真调整呼吸。', '你留出更多精力完成整套训练，逐段检查动作，最后充分拉伸。'],
      outcomes: { setback: '今天的节奏一直找不准，几次停下来调整呼吸。训练完成了，身体吸收得却不如平时。', limited: '身体暖起来了，心里的紧绷也松了一点。你留着余力离开跑道。', steady: '呼吸慢慢跟上步子，拉伸结束时，身体比来时舒展开了。', good: '动作和呼吸配合得格外顺，原本吃力的一段今天也稳稳完成了。', surprise: '同学提醒你调整了一个小动作，短短一轮练习便找到了更顺畅的发力方式。' }
    },
    gym: {
      resource: 'money', min: 20, max: 100, default: 50, h: 40, s: 0.4, rewards: { fitness: 60, mood: 9 }, label: '健身房预算',
      description: '决定这次健身房训练投入多少预算：器械、私教课和恢复补给都要花钱。',
      plans: ['你挑了基础器械，按自己的节奏练完一轮。', '你认真完成计划里的组数，练完又做了充分拉伸。', '你预留了私教课和恢复补给，把整套训练扎扎实实做完。'],
      outcomes: { setback: '今天的器械一直有人排队，训练断断续续，身体还没热开就到了闭馆时间。', limited: '几组动作做完了，出汗不多，离计划里的训练量还差一截。', steady: '器械、组数和拉伸都按计划完成，走出健身房时身体是沉的，心里却轻。', good: '状态比预想中好，平时吃力的一组今天稳稳做完，镜子里的人也有点陌生。', surprise: '你随口问了一句动作细节，旁边练了多年的同学顺手纠正了发力方式，整轮训练顺畅许多。' }
    },
    teamSport: {
      resource: 'energy', min: 15, max: 30, default: 15, h: 15, s: 0.5, rewards: { fitness: 22, mood: 30, social: 24 }, label: '比赛投入',
      description: '决定这场比赛投入多少体力：上场时间越长，跑动和配合越多。',
      plans: ['你上半场跑了几轮，下半场坐在场边给队友递水。', '你打满大半场，和队友配合着把比分咬住。', '你从热身一直打到散场，最后还留下来加练了几轮。'],
      outcomes: { setback: '今天的手感和跑位都不在状态，几次配合没接上，散场时有点闷。', limited: '跑动不少，进球和好配合却没几个，回去路上还在复盘。', steady: '一场球打下来，汗水把衣服浸透，和队友击掌的时候，心情松快了不少。', good: '你送出几次漂亮的配合，队友围着你要再来一场，笑声一路飘到操场外。', surprise: '临时补位的你恰好和几个人打出默契，散场后大家拉你进了固定局。' }
    },
    soloSport: {
      resource: 'time', min: 1, max: 3, default: 1, h: 1, s: 0.45, rewards: { fitness: 18, mood: 30 }, label: '单人运动时间',
      description: '决定这次单人运动留多少时间：跑步、骑行或游泳，按自己的节奏来。',
      plans: ['你沿跑道慢跑一圈，出汗前就收了步子。', '你戴上耳机骑了一段，或者去泳池慢慢游了几个来回。', '你留出完整的一段时间，跑到呼吸和步子都顺了才停下。'],
      outcomes: { setback: '今天身体有点沉，跑了几步就喘，最后提前收了。', limited: '出了一点汗，心里的杂事还在，回去的路上仍然想着它们。', steady: '脚步和呼吸慢慢合上拍子，回到宿舍时，脑子里安静了不少。', good: '风从耳边过去，你越跑越顺，最后一段甚至有点舍不得停。', surprise: '路上遇到一段特别舒服的光线，你临时多绕了一圈，回去时整个人都轻了。' }
    },
    walk: {
      resource: 'time', min: 1, max: 3, default: 1, h: 1, s: 0.45, rewards: { recovery: 30, mood: 30, fitness: 15 }, label: '散步时间',
      description: '决定把多少时间留给银杏大道，暂时放慢自己的步子。',
      plans: ['你沿树荫走了一小段，在下一个路口折返。', '你收起手机，沿银杏大道慢慢走了一圈。', '你暂时放下其他安排，在树下走走停停，给自己留出一段空白。'],
      outcomes: { setback: '路上有些吵，心里又一直惦记未完成的事。走了很久，杂乱的思绪仍没完全放下。', limited: '风吹散了一点倦意，剩下的心事还得之后慢慢处理。', steady: '树影在脚边晃动，走回宿舍时，脑子里终于安静了一些。', good: '一路的风和光线恰好舒服，你在长椅边坐了一会儿，紧绷的情绪渐渐舒展开。', surprise: '刚转过路口，就遇见一小片落叶在风里打旋。几分钟的出神，意外让你轻松了许多。' }
    },
    projectWork: {
      resource: 'energy', min: 5, max: 30, default: 15, h: 15, s: 0.7, rewards: { preparation: 30 }, label: '项目投入',
      description: '决定为这一轮方案推演、实现和组内讨论分配多少精力。',
      plans: ['你领下一个范围明确的小任务，先把自己负责的部分做完。', '你按分工推进方案，和组员核对实现中的问题。', '你深入追查方案里的薄弱环节，补充验证，再把过程整理给组员。'],
      outcomes: { setback: '方案卡在一处反复出现的错误上，几次尝试都没完全解决。任务推进留下了记录，理解上的突破却很有限。', limited: '负责的小任务交上去了，大部分复杂问题仍由之后的安排接着处理。', steady: '你把一个模糊的想法落成了可讨论的实现，例会上也终于能讲清自己的判断。', good: '验证结果把一直争论的问题讲清了，组员顺着你的记录又补上了几处关键细节。', surprise: '你处理的小问题恰好牵出了整个方案的关键假设，有限的工作打开了新的理解。' }
    },
    clubWork: {
      resource: 'energy', min: 3, max: 20, default: 8, h: 8, s: 0.8, rewards: { social: 24 }, label: '社团投入',
      description: '决定为活动筹办、协调和与成员交流投入多少精力。',
      plans: ['你接下签到等一项具体工作，完成后就准备回去。', '你按分工处理筹备事务，和其他成员一起盯好现场。', '你主动协调几组任务，补上临时缺口，忙完又留下来帮助收尾。'],
      outcomes: { setback: '安排几次临时变动，你忙于来回确认消息，和成员真正交流的机会反而很少。', limited: '任务交接清楚了，也记住了几张新面孔，彼此还需要以后多熟悉。', steady: '一起搬桌子和核对名单之后，群里的几个头像终于对上了真实的人。', good: '临时的难题被你和同伴一起理顺，忙完后大家围在一张桌边又聊了很久。', surprise: '你负责的签到台恰好成了大家来回碰面的地方，简单的工作反而让你认识了不少成员。' }
    },
    internshipWork: {
      resource: 'energy', min: 5, max: 30, default: 15, h: 15, s: 0.45, rewards: { income: 300 }, label: '实习投入',
      description: '在已接受的实习安排中，决定本轮能接下多少整理和协助任务。',
      plans: ['你接了几项熟悉的基础事务，先保证自己能交接清楚。', '你按带教的安排推进任务，逐项核对材料。', '你多接了一轮工作，遇到问题及时确认，并把交接资料整理完整。'],
      outcomes: { setback: '上游资料迟迟没到，几项工作只能反复等待确认。实习投入留下了记录，但本次能结算的完成量不多。', limited: '几项基础事务顺利交接，补助按实际完成的部分核算。', steady: '材料和记录都核对完成，带教确认了这轮任务与补助。', good: '你整理的清单让协作顺畅许多，几项待办也一并完成，结算时留下了不错的反馈。', surprise: '任务正好用到你熟悉的方法，有限的精力完成了比原先安排更多的内容。' }
    },
    checkup: {
      resource: 'energy', min: 2, max: 12, default: 5, h: 5, s: 0.35, rewards: { fitness: 9, mood: 6 }, label: '健康整理投入',
      description: '体检费用固定，决定花多少精力整理作息记录、理解报告和安排后续生活。',
      plans: ['你带着报告确认了最关心的一项内容。', '你认真看完报告，把作息和运动中需要调整的地方记下来。', '你整理了近期的生活记录，对照报告逐项规划后续的作息和锻炼。'],
      outcomes: { setback: '近期的记录有些零散，你一时没能把需要改变的习惯理清。检查做完了，落实到生活中还需要继续摸索。', limited: '你记住了一项需要留意的习惯，先从这件小事开始调整。', steady: '报告与最近的作息对上了，你知道接下来该从哪里开始照顾自己。', good: '记录帮你看清了自己的生活节奏，一些原本模糊的担心也终于放下。', surprise: '问到的一处细节恰好解释了最近的疲惫，你很快理清了该调整的安排。' }
    },
    sickVisit: {
      resource: 'time', min: 1, max: 3, default: 1, h: 1, s: 0.25, rewards: { mood: 24 }, label: '就诊与调整时间',
      description: '费用按原安排支付，为就诊和之后的休息调整留出时间。',
      plans: ['你看完门诊便回去休息，先把眼前的安排放缓。', '你按门诊安排处理完，再留出一段安静调整的时间。', '你把后续事情往后挪，让就诊和休息不再挤在匆忙的空隙里。'],
      outcomes: { setback: '候诊比预想中久，回去时又惦记着手头的任务，情绪没能很快松下来。', limited: '就诊安排办妥了，心里安定一点，仍需要慢慢调整。', steady: '该办的事情处理好了，你终于能暂时放下担心，好好休息。', good: '你把要问的问题说清楚，也给后面的休息留出了空间，心里踏实许多。', surprise: '流程比预想中顺畅，你没有赶来赶去，回去时意外轻松了一些。' }
    },
    alumniVolunteer: {
      resource: 'energy', min: 3, max: 25, default: 10, h: 10, s: 0.75, rewards: { social: 15, mood: 9 }, label: '志愿投入',
      description: '决定为签到、指路、资料整理和现场协助分配多少精力。',
      plans: ['你守好一个具体的岗位，把来往信息交接清楚。', '你和其他志愿者分工配合，把接待任务逐项做好。', '你主动补上几个忙不过来的岗位，收尾时又帮着核对遗漏。'],
      outcomes: { setback: '现场安排反复调整，你忙着跑动，和校友、同伴都没能好好交流。任务做过了，留下的联系却不多。', limited: '岗位上的事情处理妥当，几次简短的道谢让你记住了这一天。', steady: '来回协助之间，你和同伴熟悉起来，也听到了几段校友的旧事。', good: '你处理的一次临时情况让现场顺了下来，散场时几位校友和同伴特意留下来向你道谢。', surprise: '一个简单的指路问题意外引出了校友的校园回忆，你也和旁边的志愿者聊熟了。' }
    },
    show: {
      resource: 'money', min: 15, max: 120, default: 40, h: 40, s: 0.65, rewards: { mood: 24, social: 6 }, label: '观演预算',
      description: '为今晚的观演和与同行同学的安排留出预算，现场体验等散场再说。',
      plans: ['你挑了简单的观演安排，带着一点好奇走进会堂。', '你和同学约好时间，把今晚的演出完整留在行程里。', '你仔细安排今晚的观演，还约了同学在散场后一起聊聊。'],
      outcomes: { setback: '今晚的风格和你想象中不同，散场又匆忙。预算花了，情绪却没能完全融进演出。', limited: '有几个片段记住了，其他部分没留下太深印象。你随人群慢慢走出会堂。', steady: '灯光暗下再亮起，一段旋律跟着你走了很远，同行的人也聊起各自喜欢的片段。', good: '台上的一段表演恰好打动了你，散场后的讨论还让你和同学发现了新的共同爱好。', surprise: '没有特别安排的一晚，却碰上了正合心意的作品。回去路上，你还在反复哼那段旋律。' }
    }
  };
  const EVENTS = {
    roommateCare: { priority: 10, title: '室友的关心', description: '晚上十一点，室友发来消息，说看你最近状态不太对，问要不要一起下楼吃点东西。消息后面跟了一个拍一拍。', trigger: '你最近回宿舍越来越晚，话也越来越少', choices: [
      { id: 'talk', fitnessCost: 0, title: '和室友聊一会儿', description: '下楼，边吃边把最近的破事倒一倒。', time: 1, mood: 15, social: 3 },
      { id: 'later', fitnessCost: 0, title: '先自己调整', description: '说声不用了，戴上耳机。今晚想一个人待着。' }
    ] },
    fitnessTest: { priority: 20, title: '体测周', description: '体育老师在班群里发了通知：体测周到了。八百米和引体向上躲不掉，校医院这两天排的都是开免测证明的人。', trigger: '体育老师在班群里发了通知', choices: [
      { id: 'participate', title: '认真参加体测', description: '做完热身，一项一项来。跑完最后一圈，嗓子眼里都是铁锈味。', time: 1, energy: 10, fitnessCost: 2, mood: 5, outcomeBy: { metric: 'fitness', threshold: 60, pass: { title: '体测达标', description: '每一项都过了线。体育老师拍了拍你：不错，别松。', mood: 5, social: 2, experience: 'fitnessTest' }, fail: { title: '体测未达标', description: '成绩单下来，有一项差一点。辅导员通知你：春季有一次补测，好好准备。', flag: 'fitnessRetest' } } },
      { id: 'later', fitnessCost: 0, title: '开假条请假', description: '去校医院开了张假条。体测免了，但辅导员记了你一笔：春季补测，不得缺席。', flag: 'fitnessRetest', mood: -3 }
    ] },
    fitnessRetest: { priority: 22, title: '春季补测', description: '体育组发来补测通知：秋季体测未达标或缺考的同学，统一安排本学期补测。再不过，可就要记入档案了。', trigger: '体育组发来补测通知', choices: [
      { id: 'participate', title: '报名参加补测', description: '提前两周开始练。补测当天，状态比上学期好得多。', time: 1, energy: 10, fitnessCost: 2, mood: 4, clearFlag: 'fitnessRetest', outcomeBy: { metric: 'fitness', threshold: 60, pass: { title: '补测达标', description: '这一回过了。体育老师签了字，体测这一关总算翻篇。', mood: 6, experience: 'fitnessTest' }, fail: { title: '补测仍未达标', description: '还差一点。体育老师说：明年秋天，跟下一届一起测。', flag: 'fitnessRetest', mood: -4 } } },
      { id: 'later', fitnessCost: 0, title: '再拖一次', description: '关掉通知。辅导员说过，补测旷考是要写检查的。', mood: -5 }
    ] },
    projectOffer: { priority: 30, chain: 'project', node: 'application', title: '项目组的邀请', description: '课间，老师把你叫到走廊，说有个项目缺人手，问你要不要来。跟着做下去，下个学期把成果摆出来，简历上能多一行。', trigger: '你之前递出去的那份申请，有回音了', choices: [
      { id: 'accept', fitnessCost: 0, title: '加入项目', description: '答应下来。这学期开工，下个学期见成果。', chainEffect: 'accept' },
      { id: 'later', fitnessCost: 0, title: '下一学期再考虑', description: '说手头太满，婉拒。以后想清楚了还可以再申请。', chainEffect: 'defer' }
    ] },
    projectReview: { priority: 31, chain: 'project', node: 'review', title: '答辩日', description: '项目到了收尾的时候。老师把演示时间定在周五下午，PPT 在电脑里改了七版。', trigger: '结题的材料，你准备得差不多了', choices: [
      { id: 'complete', fitnessCost: 0, title: '展示成果', description: '上台，讲完，等答辩结束。这段经历会留在你的简历上。', mood: 5, chainEffect: 'complete', experience: 'project' },
      { id: 'later', fitnessCost: 0, title: '延到下一学期', description: '再打磨一学期。前提是，这不是最后一个学期。', chainEffect: 'postpone' },
      { id: 'abandon', fitnessCost: 0, title: '放弃展示', description: '把文件归档，不展示了。做过的事还在，只是简历上没有这一行。', chainEffect: 'abandon' }
    ] },
    clubOffer: { priority: 40, chain: 'club', node: 'recruitment', title: '百团大战', description: '摊位之间挤满了人，一个社团的学姐拉住你：我们下个活动正缺人，进群聊聊？', trigger: '你报名的社团，来消息了', choices: [
      { id: 'accept', fitnessCost: 0, title: '加入社团', description: '扫码进群，把报名表发过去。筹办组的任务从此开始。', chainEffect: 'accept' },
      { id: 'later', fitnessCost: 0, title: '先专注其他安排', description: '摆摆手说再看看。来年秋天的招新还在这里。', chainEffect: 'defer' }
    ] },
    clubReview: { priority: 41, chain: 'club', node: 'activity', title: '活动结束的那个晚上', description: '散场后，你和其他人把最后一把椅子叠起来。灯一盏盏灭掉，群里已经开始有人发「辛苦大家」。', trigger: '活动散了场，收尾的事轮到你了', choices: [
      { id: 'complete', fitnessCost: 0, title: '发总结收尾', description: '把签到表、照片和总结发进群。大家排队回「收到」。', social: 5, mood: 5, chainEffect: 'complete', experience: 'club' },
      { id: 'later', fitnessCost: 0, title: '推到下学期', description: '再准备一学期，办得更像样些。只要这学期不是最后一个。', chainEffect: 'postpone' },
      { id: 'abandon', fitnessCost: 0, title: '退出活动', description: '不再跟了，把任务交给下一届。忙过的事自己知道。', chainEffect: 'abandon' }
    ] },
    internshipOffer: { priority: 50, chain: 'internship', node: 'application', title: '实习的回复', description: '简历投出去两周，邮箱里多了一封回复：岗位有空缺，下周报到。通勤路线你已经查好了。', trigger: '你投出去的那份简历，有回音了', choices: [
      { id: 'accept', fitnessCost: 0, title: '接下实习', description: '回复邮件，接受。实习从下周一开始。', chainEffect: 'accept' },
      { id: 'later', fitnessCost: 0, title: '下一学期再考虑', description: '先谢过，这学期抽不开身。名额以后还会再放出来。', chainEffect: 'defer' }
    ] },
    internshipReview: { priority: 51, chain: 'internship', node: 'completion', title: '实习的最后一天', description: '最后一次打卡，工位上贴的便利贴都清空了。带教老师问，证明和评语要现在开吗？', trigger: '实习期满了，工位上的东西已经收空', choices: [
      { id: 'complete', fitnessCost: 0, title: '办实习证明', description: '开好实习证明，盖上章。这段经历能写进简历了。', mood: 5, chainEffect: 'complete', experience: 'internship' },
      { id: 'later', fitnessCost: 0, title: '下学期再办', description: '先不急着办手续。除非这已经是最后一个学期。', chainEffect: 'postpone' },
      { id: 'abandon', fitnessCost: 0, title: '不开证明', description: '不办手续了。干过的活不会白干，只是简历上少了一行。', chainEffect: 'abandon' }
    ] },
    campusDiscussion: { priority: 60, title: '图书馆里的偶遇', description: '旁边一桌压着声音讨论作业，你发现是同一门课。其中一个人抬头看见你，招了招手。', trigger: '你抬头，正好对上那桌人的目光', choices: [
      { id: 'discuss', title: '加入讨论', description: '拉开椅子坐过去。聊着聊着，卡住的点通了几处。', time: 1, energy: 5, fitnessCost: 1, preparation: 5, social: 3 },
      { id: 'later', fitnessCost: 0, title: '继续自己的计划', description: '点头笑笑，低头继续看自己的书。' }
    ] },
    military1: { priority: 11, title: '军训开训', description: '开学第二周，公告栏贴出军训安排。辅导员在群里说，这是大学的第一课。训练之余，连队还要出人参加拔河和红歌合唱。', trigger: '公告栏前围满了人', choices: [
      { id: 'tug', title: '报名拔河', description: '麻绳磨得手心发烫，赢了的那一刻，全连的人都在喊。', time: 1, energy: 10, fitnessCost: 2, fitness: 6, mood: -4, social: 4 },
      { id: 'choir', title: '加入红歌合唱', description: '嗓子唱哑了，但几百人一起吼出来的时候，鸡皮疙瘩都起来了。', time: 1, energy: 6, fitnessCost: 2, mood: 2, social: 5 },
      { id: 'join', title: '正常参加训练', description: '站进队列，太阳很晒，口号很响。', time: 1, energy: 10, fitnessCost: 4, fitness: 5, mood: -5 },
      { id: 'later', fitnessCost: 0, title: '先请假', description: '跟辅导员磨了半天，批了半天的假。' }
    ] },
    military2: { priority: 12, title: '军训汇演', description: '两周过去，方阵走得有模有样。明天就是汇演，教官最后一遍喊了「稍息」。', trigger: '迷彩服洗了又洗，汇演要到了', choices: [
      { id: 'march', title: '走分列式', description: '正步踩在跑道上，胳膊甩得生疼。走过主席台的时候，你没敢眨眼睛。', time: 1, energy: 8, fitnessCost: 2, mood: 6, social: 3, experience: 'military' },
      { id: 'choir', title: '参加合唱方队', description: '和合唱队的同学一起上台。台下跟着打拍子，唱得比排练时都响。', time: 1, energy: 5, fitnessCost: 1, mood: 7, social: 4, experience: 'military' },
      { id: 'later', fitnessCost: 0, title: '混在队伍后面', description: '跟着走完，不抢镜，也不掉队。' }
    ] },
    transfer: { priority: 69, title: '转专业通知', description: '学院通知栏贴出转专业办法：平均成绩是硬门槛，笔试面试一个不少。室友路过时多看了你一眼：你不是一直嘀咕想换方向？', trigger: '通知栏又贴了新东西', choices: [
      { id: 'apply', title: '递交转专业申请', description: '打印成绩单，填表，交到教务处。心里七上八下。', time: 2, energy: 10, fitnessCost: 2, mood: 4, social: 1 },
      { id: 'later', fitnessCost: 0, title: '留在原专业', description: '想想又算了。现在这个方向，其实也没那么差。' }
    ] },
    transferResult: { priority: 70, title: '转专业结果公示', description: '教务系统更新了转专业结果。公示名单前围了一圈人，你的心提到了嗓子眼。', trigger: '教务系统更新了转专业结果', choices: [
      { id: 'check', fitnessCost: 0, title: '查看结果', description: '名单一行行扫过去。', outcomeBy: { metric: 'average', threshold: 85, pass: { title: '申请通过', description: '你的名字出现在转入名单上。搬到新的学院，课表和同学都要重新认识一遍。', mood: 10, social: 3, changeBackground: true, experience: 'transfer' }, fail: { title: '结果未通过', description: '名单里没有你。教务处说，明年这个时候还能再报一次。', mood: -6 } } },
      { id: 'later', fitnessCost: 0, title: '先不看结果', description: '把手机扣在桌上。该来的总会来。' }
    ] },
    sportsMeet: { priority: 57, title: '春季运动会', description: '一年一度的春季运动会开始报名。班长在群里喊：各项目还差人，短跑接力缺一棒，趣味项目纯属图一乐。', trigger: '班长在群里喊报名', choices: [
      { id: 'sprint', title: '报名短跑接力', description: '最后一棒交到你手里。发令枪响，跑道两边的加油声连成一片。', time: 1, energy: 10, fitnessCost: 2, mood: 4, outcomeBy: { metric: 'fitness', threshold: 60, pass: { title: '接力拿到名次', description: '冲线的时候，班里的同学把你围住。奖状挂在教室后墙。', mood: 8, social: 5, experience: 'sportsMeet' }, fail: { title: '成绩不算理想', description: '名次差一点。班长说没关系，明年再来。', mood: -2, social: 2 } } },
      { id: 'fun', title: '报名趣味项目', description: '两人三足、袋鼠跳。规则是什么不重要，笑到肚子疼是真的。', time: 1, energy: 5, fitnessCost: 1, mood: 6, social: 5, experience: 'sportsMeet' },
      { id: 'later', fitnessCost: 0, title: '坐在观众席', description: '当个观众。递水、喊加油、拍照片，一样不落。', time: 1, mood: 3, social: 2 }
    ] },
    seminar: { priority: 71, title: '深造宣讲会', description: '教学楼下贴出深造经验分享会的海报：去年上岸的学长学姐来分享，群里已经开始接龙报名。', trigger: '报告厅门口排起了长队', choices: [
      { id: 'attend', title: '进去听一听', description: '记了半页笔记，也记下了几个名字。', time: 1, energy: 3, fitnessCost: 1, furtherStudy: 8 },
      { id: 'later', fitnessCost: 0, title: '路过，不进去', description: '人太多了。以后找同学要份笔记。' }
    ] },
    retake: { priority: 72, title: '补考通知', description: '新学期第一周，教务系统弹出一条提醒：你有一门课未通过，补考安排在下周。', trigger: '教务系统弹出一条提醒', choices: [
      { id: 'retake', title: '报名补考', description: '报名费划走，教材重新翻开。这一次，不能再挂。', time: 2, energy: 10, fitnessCost: 2, money: 50, mood: -5 },
      { id: 'later', fitnessCost: 0, title: '这次不考了', description: '关掉网页。以后的事，以后再说。' }
    ] },
    graduation: { priority: 73, title: '毕业季', description: '毕业季说来就来。学士服租借点排起长队，跳蚤市场在银杏大道边支起了摊。', trigger: '毕业季说来就来', choices: [
      { id: 'photos', fitnessCost: 0, title: '拍一组毕业照', description: '学士帽抛起来的那一刻，快门声连成一片。', time: 1, money: 80, mood: 8, social: 3 },
      { id: 'market', title: '摆摊卖旧书', description: '教材三块一本，学弟学妹边挑边问有没有笔记。', time: 1, energy: 5, fitnessCost: 1, income: 80, social: 3 },
      { id: 'later', fitnessCost: 0, title: '这些都不弄了', description: '把该交的材料交齐，比什么都强。' }
    ] },
    singer1: { priority: 25, title: '校园歌星大赛报名', description: '学生活动中心门口拉起横幅：校园歌星大赛报名最后一天。门口的音箱放着一首谁都听过的歌。', trigger: '门口的音箱放着一首谁都听过的歌', choices: [
      { id: 'signup', fitnessCost: 1, title: '报名试试', description: '填了报名表。上台这种事，总得试一次。', time: 1, energy: 3 },
      { id: 'later', fitnessCost: 0, title: '在旁边看热闹', description: '看别人报名也挺好。' }
    ] },
    singer2: { priority: 26, title: '复赛', description: '复赛在活动中心小礼堂。灯光有点晃眼，主持人念到了你的名字。', trigger: '主持人念到了你的名字', choices: [
      { id: 'advance', title: '认真唱完', description: '第一句有点抖，后来越唱越稳。', time: 1, energy: 8, fitnessCost: 2, mood: 3 },
      { id: 'later', fitnessCost: 0, title: '弃赛', description: '想了想，把话筒还了回去。' }
    ] },
    singer3: { priority: 27, title: '决赛之夜', description: '决赛在操场搭了舞台。台下黑压压一片，室友举着手机在给你录像。', trigger: '台下黑压压一片', choices: [
      { id: 'perform', title: '上台唱完', description: '唱到最后，台下有人跟着哼。这个晚上够记很久。', time: 2, energy: 10, fitnessCost: 2, social: 8, mood: 10, experience: 'singer' },
      { id: 'later', fitnessCost: 0, title: '临时退出', description: '在后台站到散场，把演出看完了。' }
    ] },
    ticket1: { priority: 45, title: '春运抢票', description: '秋季学期进入尾声，寒假将近，宿舍群里开始流传抢票攻略。室友说，你回家的票还没买吧。', trigger: '秋季学期末，宿舍群里开始流传抢票攻略', choices: [
      { id: 'buy', title: '定好闹钟抢票', description: '准点开抢，页面转了三圈。回家和开学返校的车次都安排好了。', time: 1, energy: 3, fitnessCost: 1, mood: 2 },
      { id: 'later', fitnessCost: 0, title: '寒假再说', description: '把群消息设成免打扰。' }
    ] },
    ticket2: { priority: 46, title: '返校的车', description: '寒假结束，该回北京上课了。你在家乡的车站等候返校列车，行李里装着家人准备的特产。', trigger: '春季开学，确认上一学期约好的返校行程', choices: [
      { id: 'board', title: '上车返校', description: '火车开动，家乡慢慢退后，北京和新的学期就在前面。', time: 1, energy: 5, fitnessCost: 1, mood: 6 },
      { id: 'later', fitnessCost: 0, title: '另作返校安排', description: '原定车次不合适，你改签换乘，返校行程另外安排。' }
    ] },
    ticket3: { priority: 47, title: '家乡特产', description: '假期结束返校，行李箱里塞满了家里塞给你的东西。你拎了一袋特产，分给宿舍。', trigger: '行李箱里塞满了家里塞给你的东西', choices: [
      { id: 'share', title: '分给室友', description: '特产摆了一桌，大家边吃边聊起各自的家乡。', time: 1, energy: 3, fitnessCost: 1, social: 6, mood: 6, experience: 'trip' },
      { id: 'later', fitnessCost: 0, title: '留着自己吃', description: '味道是家的味道，谁也分不走。' }
    ] },
    contest1: { priority: 55, title: '竞赛招募', description: '教学楼下公告栏贴出全国竞赛校内选拔通知。上次的项目老师路过，朝你扬了扬下巴：组个队？', trigger: '公告栏贴出竞赛选拔通知', choices: [
      { id: 'join', fitnessCost: 2, title: '组队报名', description: '队伍拉起来了，队名想了一晚上。', time: 2, energy: 8 },
      { id: 'later', fitnessCost: 0, title: '这学期太忙', description: '和老师道了谢，摆摆手。' }
    ] },
    contest2: { priority: 56, title: '决赛答辩', description: '决赛在周末，四个小时闭卷设计加现场答辩。开赛前，队友把笔分到你手里。', trigger: '队友把笔分到你手里', choices: [
      { id: 'compete', title: '参加决赛答辩', description: '答辩结束，评委多问了一句：你们是哪个学校的。', time: 2, energy: 12, fitnessCost: 3, preparation: 8, social: 5, mood: 6, experience: 'contest' },
      { id: 'later', fitnessCost: 0, title: '弃权', description: '交了半成品。下次再来。' }
    ] },
    cat: { priority: 61, title: '台阶上的猫', description: '路边的台阶上卧着一只橘猫，尾巴慢慢扫。它抬头看了你一眼，又趴下了。', trigger: '一只橘猫卧在台阶上', choices: [
      { id: 'feed', fitnessCost: 0, title: '买点猫粮喂它', description: '准备一份猫粮，在台阶旁等它靠近。', time: 1, money: 10, mood: 5 },
      { id: 'later', fitnessCost: 0, title: '赶时间，先走了', description: '你绕开它。它也不恼，继续晒太阳。' }
    ] },
    canteen: { priority: 62, title: '益民餐厅新窗口', description: '群里有人发来消息：益民餐厅开了新窗口，队伍拐了两个弯，招牌菜每天都卖断货。', trigger: '新窗口的队伍拐了两个弯', choices: [
      { id: 'queue', fitnessCost: 1, title: '排队尝一尝', description: '排到窗口，阿姨手一抖，多给了半勺。', time: 1, money: 20, mood: 6, energy: 3 },
      { id: 'later', fitnessCost: 0, title: '人太多，改天', description: '拍了张菜单照片，发给室友。' }
    ] },
    card: { priority: 63, title: '地上的校园卡', description: '路上躺着一张校园卡，照片上的面孔有点眼熟，可能是隔壁班的。卡里余额还不少。', trigger: '地上躺着一张校园卡', choices: [
      { id: 'return', fitnessCost: 0, title: '交到失物招领', description: '登记的时候，失主在群里正好喊了一嗓子：卡丢了，急。', time: 1, social: 3, mood: 5 },
      { id: 'later', fitnessCost: 0, title: '放回原处', description: '你把它放回原地。' },
      { id: 'pocket', fitnessCost: 0, title: '装进口袋', description: '揣进兜里。晚上睡觉前，你把卡塞到了枕头下面。', income: 50, mood: -8, flag: 'cardPocketed' }
    ] },
    cardTrace: { priority: 15, title: '校园卡消费记录', description: '保卫处贴出一张消费记录：丢卡当天，有人在超市刷了五十元。时间、地点和监控都对得上，失主正在等一个解释。', trigger: '保卫处贴出了消费记录', choices: [
      { id: 'return', fitnessCost: 0, title: '主动归还并说明', description: '你把卡交回保卫处，补上了那五十元，也把这件事写进了检讨。', mood: -4, social: 2, clearFlag: 'cardPocketed' },
      { id: 'deny', fitnessCost: 0, title: '死不承认', description: '你说卡是捡的，钱不是你花的。保卫处把监控截图推到你面前。', ending: 'cardThief', reason: '你选择死不承认，保卫处调出了完整的消费记录。' },
      { id: 'run', fitnessCost: 0, title: '拔腿就跑', description: '你转身就跑，跑过银杏大道、南门和三个路口。监控拍得很清楚。', ending: 'cardThief', reason: '你选择拔腿就跑，监控把你跑过的每一个路口都拍了下来。' }
    ] },
    wall: { priority: 64, title: '表白墙点名', description: '表白墙上有人发了你：今天在校园里遇到的穿灰卫衣的同学。室友把截图甩进群里，连发三个问号。', trigger: '室友把截图甩进了群里', choices: [
      { id: 'reply', fitnessCost: 0, title: '在群里否认', description: '群里闹了一晚上，最后也没人猜出是谁发的。', time: 1, social: 4, mood: 4 },
      { id: 'later', fitnessCost: 0, title: '装没看见', description: '你退出群聊，过了一会儿又点进来。' }
    ] },
    seat: { priority: 65, title: '占座之争', description: '你常坐的位子上放着一本书，主人不在。旁边的人说，书从早上就摆着了。', trigger: '你常坐的位子上放着一本书', choices: [
      { id: 'argue', title: '把书挪开坐下', description: '书的主人回来，瞪了你一眼。你没有让。', time: 1, energy: 3, fitnessCost: 1, mood: -4, social: 2 },
      { id: 'later', fitnessCost: 0, title: '换个位子', description: '多走两步的事。' }
    ] },
    snow: { priority: 66, season: 'autumn', title: '北京初雪', description: '北京初雪，落在银杏叶还没扫尽的路上。校园里一片惊呼声。', trigger: '北京初雪', choices: [
      { id: 'play', fitnessCost: 0, title: '下楼踩雪', description: '你在雪地里走了两圈，鞋湿了，心里很痛快。', time: 1, recovery: 2, mood: 8 },
      { id: 'later', fitnessCost: 0, title: '隔窗看看', description: '窗户上哈了口气，画了个笑脸。' }
    ] },
    parcel: { priority: 67, season: 'autumn', title: '快递爆仓', description: '双十一的快递堆成了山。室友发来消息：快递点的货架不够用，纸箱一路码到门口，你的包裹也到了。', trigger: '快递点的纸箱码到了门口', choices: [
      { id: 'find', title: '在纸箱堆里找快递', description: '翻了二十分钟，你的包裹在最底层。', time: 1, energy: 3, fitnessCost: 1, mood: -4, social: 2 },
      { id: 'later', fitnessCost: 0, title: '过两天再说', description: '让它先躺着。' }
    ] },
    night: { priority: 68, title: '深夜卧谈', description: '熄灯后没人睡觉。不知道谁起了个头，宿舍开始聊起高考、志愿和那些差一点的选择。', trigger: '熄灯后没人睡觉', choices: [
      { id: 'join', fitnessCost: 1, title: '加入话题', description: '聊到凌晨两点，谁也没看时间。', time: 1, social: 5, mood: 6 },
      { id: 'later', fitnessCost: 0, title: '闭眼装睡', description: '你翻了个身，慢慢真的睡着了。' }
    ] },
    injury: { priority: 74, title: '操场上的崴脚', description: '跑圈冲刺的时候，脚踝咔地响了一声。现在肿起来了，走路一瘸一拐。', trigger: '脚踝肿起来了', choices: [
      { id: 'treat', title: '去校医院处理', description: '冰袋敷上，校医说没伤到骨头，静养一周。', time: 1, energy: 3, fitnessCost: 1, money: 50, mood: 5 },
      { id: 'later', fitnessCost: 0, title: '贴个膏药忍着', description: '膏药味冲鼻子。疼是疼，课还是得去上。', fitness: -6, mood: -3 }
    ] },
    flu: { priority: 75, title: '换季流感', description: '换季降温，宿舍楼下一片咳嗽声。早上起来，你的嗓子也哑了，额头有点烫。', trigger: '宿舍楼下一片咳嗽声', choices: [
      { id: 'clinic', title: '去校医院开药', description: '排队的工夫，前面已经有人戴着口罩在咳嗽。', time: 1, energy: 3, fitnessCost: 1, money: 60, mood: 7 },
      { id: 'later', fitnessCost: 0, title: '多喝热水硬扛', description: '热水一杯接一杯。扛不扛得住，看运气。', mood: -5 }
    ] },
    insomnia: { priority: 76, title: '失眠的夜', description: '连续几天熬到凌晨，今晚躺下反而清醒。窗帘外透进路灯，脑子里全是没交的作业。', trigger: '窗帘外透进路灯', choices: [
      { id: 'clinic', fitnessCost: 0, title: '去校医院看看', description: '校医说先调作息，开了两片药。', time: 1, money: 60, mood: 6 },
      { id: 'later', fitnessCost: 0, title: '翻个身硬睡', description: '你翻了个身，数到三百，又数了一遍。', mood: -4 }
    ] },
    lecture: { priority: 77, title: '会堂的讲座', description: '天佑会堂门口排起长队。海报上写着今晚的嘉宾，是行业里叫得出名字的人。', trigger: '会堂门口排起长队', choices: [
      { id: 'listen', title: '进场听一场', description: '两个小时的讲座，你记了半页关键词。', time: 1, energy: 2, fitnessCost: 1, social: 3, mood: 3 },
      { id: 'later', fitnessCost: 0, title: '门口转转就走', description: '人太多了。你拍了张海报，发给同学。' }
    ] },
    drama: { priority: 78, title: '毕业大戏', description: '会堂今晚是话剧社的毕业大戏。票卖得只剩最后几张，门口有人举着手机找票。', trigger: '门口有人举着手机找票', choices: [
      { id: 'buy', fitnessCost: 0, title: '买票进去看', description: '谢幕时全场起立。你在掌声里坐了很久。', time: 1, money: 30, mood: 8 },
      { id: 'later', fitnessCost: 0, title: '看个海报就好', description: '你拍下剧名，想着下次早点买票。' }
    ] },
    alumniStory: { priority: 79, title: '校友分享会', description: '红果园宾馆的宴会厅在办校友返校会。一个学长端着杯子，讲他毕业后的第一份工作。', trigger: '宴会厅里传来掌声', choices: [
      { id: 'listen', title: '坐下来听', description: '散场前，学长留了联系方式，说欢迎去他那实习。', time: 1, energy: 2, fitnessCost: 1, social: 4, mood: 3 },
      { id: 'later', fitnessCost: 0, title: '不打扰他们', description: '你穿过大堂，去办自己的事。' }
    ] },
    frontDesk: { priority: 80, title: '周末帮工', description: '宾馆前台贴着招周末帮工的启事。时薪还行，就是得早起。', trigger: '前台贴着招工启事', choices: [
      { id: 'apply', fitnessCost: 0, title: '去应聘', description: '换床单、摆毛巾，干了一整天。结钱的时候，手有点抖。', time: 1, income: 150, mood: -3 },
      { id: 'later', fitnessCost: 0, title: '看看就好', description: '时薪是还行。但周末，你想睡懒觉。' }
    ] },
    ginkgo: { priority: 81, season: 'autumn', title: '银杏大道金黄', description: '一场秋雨过后，银杏大道整条路都黄透了。举着相机的人比落叶还多，连门卫大叔都换上了精神的白手套。', trigger: '整条银杏大道都黄透了', choices: [
      { id: 'photo', fitnessCost: 0, title: '拍几张照片', description: '手机举了半小时，终于等到一阵风。照片发到家族群，家里人说真好看。', time: 1, mood: 6 },
      { id: 'later', fitnessCost: 0, title: '路过看看', description: '在树下站了一会儿，慢慢走开。' }
    ] },
    hawthorn: { priority: 82, season: 'autumn', title: '山楂分发', description: '秋天的山楂熟了。后勤师傅在逸夫操场旁支起小摊，给师生分发刚摘的山楂——红果园的小红果，一年就这一回。', trigger: '山楂摊前围了一群人', choices: [
      { id: 'take', fitnessCost: 0, title: '领一袋山楂', description: '山楂洗干净塞进包里，酸得人眯眼睛。同学说，这就是「小红果」的来历。', time: 1, mood: 5, social: 2 },
      { id: 'later', fitnessCost: 0, title: '不凑热闹', description: '人太多了。你绕开摊位，去忙自己的。' }
    ] },
    alumniFair: { priority: 83, title: '校友返校集市', description: '值年返校的校友把红果园宾馆大堂变成了集市：老照片、校徽徽章、手绘校园地图，还有当年食堂的菜谱复刻。', trigger: '宾馆大堂摆满了摊位', choices: [
      { id: 'browse', title: '逛逛摊位', description: '和摊主聊起来，他讲起二十年前的思源楼，你讲现在的。', time: 1, energy: 3, fitnessCost: 1, social: 4, mood: 4 },
      { id: 'later', fitnessCost: 0, title: '绕道走', description: '今天人太多了，改天再来。' }
    ] },
    rollCall: { priority: 84, title: '课堂点名', description: '上课铃响，老师翻开点名册。后排几个空位的主人托你喊到，你手心有点冒汗。', trigger: '老师翻开了点名册', choices: [
      { id: 'cover', fitnessCost: 0, title: '帮忙喊到', description: '一声「到」喊得底气不足，好在老师没抬头。', social: 3, mood: -3 },
      { id: 'later', fitnessCost: 0, title: '不掺和', description: '你低头翻书。反正被点到的又不是你。' }
    ] },
    jobFair: { priority: 85, title: '招聘会海报', description: '南门布告栏贴出大型招聘会海报：上百家企业进校，时间就定在下周。路过的大四学长正对着海报拍照。', trigger: '布告栏前围了不少人', choices: [
      { id: 'browse', title: '凑近看岗位', description: '扫了几个二维码，把感兴趣的展位记下来。', time: 1, energy: 2, fitnessCost: 1, social: 2, mood: 2 },
      { id: 'later', fitnessCost: 0, title: '离毕业还早', description: '你摆摆手。海报上的字，以后再看。' }
    ] },
    medicalInsurance: { priority: 86, title: '医保办理', description: '校医院的宣传栏贴出通知：大学生医保参保登记开始，门诊报销比例又调高了。', trigger: '宣传栏贴出医保通知', choices: [
      { id: 'register', fitnessCost: 0, title: '登记参保', description: '排队交材料。从此看病买药，能报一点是一点。', time: 1, money: 100, mood: 3 },
      { id: 'later', fitnessCost: 0, title: '下次再说', description: '想着自己身体还行，先把这事放一放。' }
    ] },
    labNight: { priority: 87, title: '实验室通宵', description: '逸夫楼的实验室今晚灯火通明。师兄师姐们赶着跑最后一批数据，白板上写着倒计时。', trigger: '逸夫楼的灯亮到很晚', choices: [
      { id: 'join', title: '留下来一起赶', description: '帮师兄配试剂、看仪器。凌晨两点的实验室，咖啡和键盘声都很响。', time: 1, energy: 6, fitnessCost: 2, preparation: 5, mood: -4, social: 2 },
      { id: 'later', fitnessCost: 0, title: '回去休息', description: '看了一眼倒计时，你拉上外套回宿舍。' }
    ] },
    danceParty: { priority: 88, title: '周末舞会', description: '学生活动中心周末办舞会，彩灯挂起来，音箱轰着鼓点。门口有人分发荧光棒。', trigger: '活动中心的彩灯亮了起来', choices: [
      { id: 'join', title: '进去跳一会儿', description: '从僵硬到放开，一晚上下来嗓子哑了，笑是真的。', time: 1, energy: 8, fitnessCost: 2, social: 6, mood: 8 },
      { id: 'later', fitnessCost: 0, title: '在门口看看', description: '音乐挺好听。你听了一会儿，转身走了。' }
    ] },
    memorial129: { priority: 89, season: 'autumn', title: '12·9 文艺汇演', description: '纪念「一二·九」运动的文艺汇演在天佑会堂拉开帷幕。整场演出从合唱到话剧，节目单厚厚一沓。', trigger: '天佑会堂挂出了横幅', choices: [
      { id: 'watch', title: '进场看演出', description: '谢幕的时候全场起立。有人小声说：这台晚会排了三个月。', time: 1, energy: 2, fitnessCost: 1, money: 20, mood: 8, social: 3 },
      { id: 'later', fitnessCost: 0, title: '路过不进去', description: '门口转了一圈，拍了张节目单。' }
    ] }
  };
  // rewards are theoretical ceilings R, h is the half-saturation investment,
  // and s controls volatility without changing the unrounded expected reward.
  // Default investments have q = 1/2 and an expected reward of R / 3.
  const EVENT_INVESTMENTS = {
    'campusDiscussion:discuss': {
      resource: 'energy', min: 2, max: 20, default: 5, h: 5, s: 0.9, rewards: { preparation: 15, social: 9 },
      label: '讨论投入', description: '决定花多少精力推题、整理思路和与同学交流。',
      plans: ['你只挑了一个卡住的步骤，拉过草稿纸问了几句。', '你把整道题拆开，和同学轮流讲解各自的思路。', '你连同相关章节一起梳理，还尝试了几种不同的解法。'],
      outcomes: {
        setback: '大家恰好卡在同一个前提上，几张草稿越写越乱。讨论花了力气，真正弄懂的部分却不多。',
        limited: '你弄清了一处细节，也和同桌混了个脸熟。剩下的章节，还得按自己的计划补。',
        steady: '互相对照之后，错用的公式终于找到了。你记下解题步骤，约好下次再一起讨论。',
        good: '一位同学的画图方法打通了整道题，你又把它推广到另一类题目。离开时，大家交换了笔记。',
        surprise: '你随口问的一句，刚好点中了大家漏看的条件。没聊多久，整道题就通了，对方还主动发来了整理好的笔记。'
      }
    },
    'military1:join': {
      resource: 'energy', min: 4, max: 24, default: 10, h: 10, s: 0.85, rewards: { fitness: 15 },
      label: '训练投入', description: '在完成集体训练之外，决定练习动作和体能的投入。',
      plans: ['你跟着队列完成基础动作，休息时留在树荫下调整。', '你认真练习站姿和步伐，把教官指出的问题逐一改过。', '你把休息间隙也用来校正动作，额外练了几轮体能。'],
      outcomes: {
        setback: '天气闷热，步伐的节奏始终对不上。汗出了不少，身体却没能适应这次训练，进步比预想的小。',
        limited: '基础动作跟上了，身体也活动开来。你保留了余力，体能上的变化还不明显。',
        steady: '队列渐渐走齐，站到最后一轮时，你已经比刚开始稳了些。',
        good: '动作和呼吸终于合上节奏，教官让你站到前排示范。今天的训练格外扎实。',
        surprise: '教官恰好来纠正你的发力方式。只是几轮练习，你就找到了省力又稳定的节奏。'
      }
    },
    'military2:perform': {
      resource: 'energy', min: 3, max: 24, default: 8, h: 8, s: 0.9, rewards: { mood: 18, social: 9 },
      label: '汇演准备', description: '投入精力磨合方阵、练习动作，决定汇演当天的准备程度。',
      plans: ['你跟队友核对了一遍路线，按熟悉的节奏上场。', '你和前后排反复对齐步幅，把容易抢拍的地方又练了一遍。', '你主动组织加练，从转向到口号都和队友磨合到很晚。'],
      outcomes: {
        setback: '经过主席台时口令被风吹散，你和旁边的人慢了半拍。汇演照常完成，只是准备没有完全发挥出来。',
        limited: '方阵顺利走完，你和旁边的同学击了个掌。没有特别抢眼，也留下了一段共同经历。',
        steady: '转向和落脚都跟上了口令。散场时，队友笑着提起刚才一起绷紧的肩膀。',
        good: '正步落地整齐得像一个人。掌声响起，前后排的同学都回头朝你笑。',
        surprise: '上场前队友轻声提醒了关键一拍，你恰好接住。整段走得比预想顺利，还被室友拍进了合照。'
      }
    },
    'singer2:advance': {
      resource: 'energy', min: 3, max: 24, default: 8, h: 8, s: 1, rewards: { mood: 9 },
      label: '复赛排练', description: '在上台前投入精力练习气息、选曲和走台。',
      plans: ['你过了一遍熟悉的段落，把剩下的状态留给现场。', '你练了几遍换气和高音，和伴奏核对好起拍。', '你反复录音回听，连走台和拿话筒的姿势也排练了一遍。'],
      outcomes: {
        setback: '返听里的伴奏忽远忽近，你一紧张抢了起拍。最终压线进入决赛，心里却知道这次没唱出准备的水平。',
        limited: '你稳稳唱完熟悉的段落，凭基本功进入决赛。这次主要是熟悉了舞台，惊喜不多。',
        steady: '第一句有点抖，后面渐渐找到气息。晋级名单贴出来时，你终于松了口气。',
        good: '高音和换气都落在练习的位置，评委抬头认真听完了副歌。进入决赛的消息让你踏实又兴奋。',
        surprise: '临场换的一种轻声唱法恰好适合这首歌。排练不多，却唱出了自己的味道，顺利拿到决赛名额。'
      }
    },
    'singer3:perform': {
      resource: 'energy', min: 4, max: 30, default: 10, h: 10, s: 1, rewards: { social: 24, mood: 30 },
      label: '决赛准备', description: '精力可以用在声乐练习、舞台编排和与伴奏的磨合上。',
      plans: ['你选了最熟悉的一首歌，只做了简单的开嗓。', '你认真排练了整首歌，和伴奏确认好每一次停顿。', '你把灯光走位、气息和互动都排进练习，准备了一场完整演出。'],
      outcomes: {
        setback: '开场时话筒突然啸叫，你的气息也被打乱。歌还是唱到了最后，室友一直举着手机，但这次收获比准备时期待的少。',
        limited: '你顺利唱完了歌，室友在台下挥手。这段舞台经历留住了，认识的新朋友不算多。',
        steady: '最后一句唱完，台下有人跟着鼓掌。散场时，几个同学过来问了歌名。',
        good: '副歌响起，台下有人一起哼唱。谢幕后，社团同学把你拉进了下一次演出的群。',
        surprise: '熟悉的旋律刚好勾起全场的回忆，台下意外变成了大合唱。一次轻装上阵，收到了远超预期的回应。'
      }
    },
    'contest2:compete': {
      resource: 'energy', min: 4, max: 36, default: 12, h: 12, s: 1, rewards: { preparation: 24, social: 15, mood: 18 },
      label: '答辩准备', description: '决定把多少精力用于方案推演、材料检查和模拟问答。',
      plans: ['你检查了核心功能，把有限的准备放在最有把握的部分。', '你和队友完整演练了一次，补齐了材料里几个明显的漏洞。', '你反复压测演示，和队友轮流扮演评委，把追问也练进了答辩。'],
      outcomes: {
        setback: '现场的设备环境与排练不同，演示卡在了关键一步。你们完成了答辩，但评委没能看到方案最好的一面。',
        limited: '核心方案讲清楚了，追问时还有几处答得仓促。你记下了问题，和队友约好回去复盘。',
        steady: '演示顺利跑完，评委指出的不足也很具体。你们带着一页反馈离开了教室。',
        good: '评委的追问正好落在你们演练过的地方，分工也接得顺畅。走出教室，队友击掌庆祝。',
        surprise: '评委恰好关注你负责的核心模块。准备虽然有限，你却把关键思路讲得透彻，得到了意外深入的指导。'
      }
    },
    'seminar:attend': {
      resource: 'energy', min: 1, max: 12, default: 3, h: 3, s: 0.85, rewards: { furtherStudy: 24 },
      label: '听讲投入', description: '投入精力预看资料、记录信息，并在散场前提问。',
      plans: ['你挑了几条关心的信息记下来，没有把行程排得太满。', '你带着自己的问题听讲，把时间线和资料来源一一整理。', '你提前查过院校资料，听完又排队找学长学姐核对准备计划。'],
      outcomes: {
        setback: '分享内容偏向另一个专业，你的问题又没来得及问到。笔记记了不少，能直接用进计划的却不多。',
        limited: '你记下了报名节点，其他细节还需要以后查证。深造计划向前挪了一小步。',
        steady: '几条原本混乱的时间线终于对齐，你回去把下一阶段的任务写进计划本。',
        good: '学长针对你的情况指出了准备顺序，还补发了一份资料清单。后面的安排清楚了许多。',
        surprise: '你随手记下的问题恰好也是主讲人当年的难题。散场前的几句建议，正好解开了你的困惑。'
      }
    },
    'graduation:photos': {
      resource: 'money', min: 20, max: 240, default: 80, h: 80, s: 0.9, rewards: { mood: 24, social: 9 },
      label: '拍照预算', description: '预算用来安排服装、拍摄和冲印；天气与当天的配合也会影响体验。',
      plans: ['你约朋友互相拍照，只留出简单冲印的预算。', '你和同学商量好地点，安排了一组正式的毕业合影。', '你仔细安排服装、拍摄和相册，想把熟悉的校园多留几页。'],
      outcomes: {
        setback: '拍摄时突然下雨，几位同学又临时赶去办手续。预算花出去了，最想拍齐的一张却没能留下。',
        limited: '几张合照洗出来，镜头里都是熟悉的脸。安排简单，也留下了一点毕业的实感。',
        steady: '学士帽抛起时，快门接连响了几声。你们挑出合照，约好以后再回校园。',
        good: '傍晚的光正好，想见的人也都到齐了。照片发进群，大家又聊起许多快忘掉的小事。',
        surprise: '路过的同学主动帮忙按下快门，恰好拍到了所有人一起笑的瞬间。简单的安排留下了最喜欢的一张。'
      }
    },
    'cat:feed': {
      resource: 'money', min: 3, max: 30, default: 10, h: 10, s: 1, rewards: { mood: 15 },
      label: '喂猫预算', description: '决定给猫准备多少合适的食物。它愿不愿意亲近，还得看当天的脾气。',
      plans: ['你买了一小份猫粮，轻轻放在台阶旁边。', '你准备好猫粮和清水，蹲在不远处等它靠近。', '你挑好食物，又给附近的水碗补满，耐心陪它待了一会儿。'],
      outcomes: {
        setback: '橘猫今天刚吃饱，闻了闻就钻进灌木。东西留下了，你期待的亲近却没有发生。',
        limited: '它低头吃了几口，尾巴慢慢扫过台阶。你看了一会儿，继续自己的安排。',
        steady: '橘猫吃完伸了个懒腰，安心趴回了阳光里。你也跟着松快了一点。',
        good: '它吃完没有走，反而在你脚边翻了个身。你陪它晒了一会儿太阳，烦心事暂时远了。',
        surprise: '只是放下一小份猫粮，橘猫却主动蹭了蹭你的裤脚。几分钟的相遇，让整段路都轻快起来。'
      }
    },
    'night:join': {
      resource: 'energy', min: 1, max: 15, default: 5, h: 5, s: 0.9, rewards: { social: 15, mood: 18 },
      label: '聊天投入', description: '决定今晚留多少精力倾听、分享和回应室友。',
      plans: ['你从被子里接了几句话，把睡意留在声音里。', '你认真听完室友的故事，也讲了讲自己当年的选择。', '你放下手机，陪室友把憋了很久的心事一点点说开。'],
      outcomes: {
        setback: '话题绕到彼此都敏感的地方，几句话没接好，宿舍忽然安静下来。聊得很累，却没能像预想那样拉近距离。',
        limited: '你跟着笑了几次，也知道了一件室友的小事。困意上来，就先道了晚安。',
        steady: '大家第一次把那些差一点的选择讲完整，熄灯后的宿舍比平时亲近了一些。',
        good: '一句认真回应让室友终于说出憋着的心事。聊到最后，几个人都觉得轻松了许多。',
        surprise: '你随口提到的旧事，竟和室友的经历一模一样。没聊多久，就有了意外的默契。'
      }
    },
    'lecture:listen': {
      resource: 'energy', min: 1, max: 12, default: 2, h: 2, s: 0.9, rewards: { social: 9, mood: 9 },
      label: '讲座投入', description: '决定花多少精力理解内容、整理问题和参与现场交流。',
      plans: ['你挑了靠后的座位，听几段感兴趣的内容。', '你跟着主讲人的思路记笔记，散场前和邻座交换了看法。', '你提前整理问题，认真听完，又留下来参加了现场交流。'],
      outcomes: {
        setback: '今晚的内容比海报上写的更偏门，你的问题又排在最后没被叫到。认真听完，收获仍然有限。',
        limited: '你记住了几个关键词，出门时和邻座点头道别。更多内容还要以后自己了解。',
        steady: '一个例子让抽象的行业方向具体起来，散场后你和同学又聊了一路。',
        good: '你的问题引出了主讲人的亲身经历，旁边几位同学也加入讨论。你带着新想法和联系方式离开。',
        surprise: '随手坐下的位置旁，恰好是一位做过相关项目的学长。短短几句交流，比预想中更有启发。'
      }
    },
    'alumniStory:listen': {
      resource: 'energy', min: 1, max: 12, default: 2, h: 2, s: 0.9, rewards: { social: 12, mood: 9 },
      label: '交流投入', description: '决定用多少精力倾听校友经历、准备问题和主动交流。',
      plans: ['你在旁边听了一小段，记下感兴趣的经历。', '你认真听完校友的故事，找机会问了自己的困惑。', '你提前想好问题，主动参与交流，还帮忙把讨论内容整理给大家。'],
      outcomes: {
        setback: '几位校友忙着叙旧，谈的经历又离你的方向很远。你努力接了几次话，交流还是没能展开。',
        limited: '你听到几件有趣的旧事，和身边的人互相介绍了名字。联系还需要以后慢慢建立。',
        steady: '学长讲起第一份工作的弯路，你把建议记下来，也留下了联系方式。',
        good: '你问的问题让学长认真聊起了具体选择，他又介绍了同方向的校友。离开时，手机里多了几个新联系人。',
        surprise: '你提起的一门课恰好是学长当年最喜欢的课。几句话打开了话匣子，还意外聊到了你关心的方向。'
      }
    }
  };
  // Each option is a complete allocation. No continuous amount or rounded time.
  const tier = (id, label, amount, time) => ({ id, label, amount, time });
  const ACTION_TIERS = {
    study: [tier('light', '跟进课堂要点', 5, 1), tier('steady', '认真听讲练习', 15, 2), tier('deep', '集中梳理难点', 30, 3)],
    tutoring: [tier('light', '针对一道难题', 40, 1), tier('steady', '辅导一节内容', 100, 2), tier('deep', '系统梳理章节', 240, 3)],
    selfStudy: [tier('light', '简单温习', 6, 1), tier('steady', '按计划自习', 12, 2), tier('deep', '集中攻克难点', 20, 3)],
    furtherStudy: [tier('steady', '按计划准备', 8, 1), tier('deep', '系统练习整理', 20, 2)],
    jobPreparation: [tier('steady', '修改材料与练习', 8, 1), tier('deep', '集中模拟面试', 20, 2)],
    work: [tier('light', '接几项熟悉的工作', 8, 1), tier('steady', '完成一轮值班任务', 20, 2), tier('deep', '承接整批事务', 40, 3)],
    rest: [tier('light', '短暂休息', 1, 1), tier('steady', '留出半段空闲', 2, 2), tier('deep', '完整休息调整', 3, 3)],
    chat: [tier('steady', '聊聊最近的生活', 5, 1), tier('deep', '认真聊一场心事', 15, 2)],
    exercise: [tier('steady', '完成日常锻炼', 10, 1), tier('deep', '加练并充分拉伸', 25, 2)],
    gym: [tier('light', '基础器械训练', 20, 1), tier('steady', '完整训练与拉伸', 50, 1), tier('deep', '私教课与系统训练', 100, 2)],
    teamSport: [tier('steady', '打一场友谊赛', 15, 1), tier('deep', '完整比赛与加练', 30, 2)],
    soloSport: [tier('light', '跑一小段', 1, 1), tier('steady', '骑行或游泳一小时', 2, 2), tier('deep', '完整拉练', 3, 3)],
    walk: [tier('light', '沿路走一小圈', 1, 1), tier('steady', '慢慢逛一段校园', 2, 2), tier('deep', '留一段完整的空白', 3, 3)],
    projectWork: [tier('light', '完成一个小任务', 5, 1), tier('steady', '推进本轮方案', 15, 2), tier('deep', '深入验证与复盘', 30, 3)],
    clubWork: [tier('steady', '完成分工任务', 8, 1), tier('deep', '统筹活动并收尾', 20, 2)],
    internshipWork: [tier('light', '处理基础事务', 5, 1), tier('steady', '完成本轮工作', 15, 2), tier('deep', '承接额外协作', 30, 3)],
    checkup: [tier('steady', '理解体检报告', 5, 1), tier('deep', '整理记录与后续计划', 12, 2)],
    sickVisit: [tier('light', '就诊后回去休息', 1, 1), tier('steady', '留出时间安静调整', 2, 2), tier('deep', '推开安排充分休息', 3, 3)],
    alumniVolunteer: [tier('light', '协助一个岗位', 3, 1), tier('steady', '参与接待与交接', 10, 2), tier('deep', '协调现场并收尾', 25, 3)]
  };
  const EVENT_TIERS = {
    'campusDiscussion:discuss': [tier('steady', '一起推一道题', 5, 1), tier('deep', '梳理相关章节', 20, 2)],
    'military1:join': [tier('light', '按基本要求完成军训', 10, 2), tier('steady', '认真训练并参加汇演', 18, 3), tier('deep', '加练动作与体能', 26, 4)],
    'singer2:advance': [tier('steady', '练习熟悉的段落', 8, 1), tier('deep', '反复排练与走台', 24, 2)],
    'singer3:perform': [tier('light', '熟悉曲目上场', 4, 1), tier('steady', '认真准备整首歌', 10, 2), tier('deep', '编排完整舞台', 30, 3)],
    'contest2:compete': [tier('light', '检查核心部分', 4, 1), tier('steady', '完整模拟答辩', 12, 2), tier('deep', '深入验证与问答', 36, 3)],
    'seminar:attend': [tier('steady', '带着问题听讲', 3, 1), tier('deep', '整理资料并留下交流', 12, 2)],
    'graduation:photos': [tier('light', '朋友互拍与简单冲印', 20, 1), tier('steady', '安排正式合影', 80, 2), tier('deep', '拍摄与制作相册', 240, 3)],
    'cat:feed': [tier('light', '放下一小份猫粮', 3, 1), tier('steady', '准备食物并陪它一会儿', 10, 2)],
    'night:join': [tier('steady', '分享最近的事情', 5, 1), tier('deep', '放下手机认真倾听', 15, 2)],
    'lecture:listen': [tier('steady', '认真听完讲座', 2, 1), tier('deep', '准备问题与现场交流', 12, 2)],
    'alumniStory:listen': [tier('steady', '听完并简短交流', 2, 1), tier('deep', '准备问题深入交流', 12, 2)]
  };
  // Kept only to validate already-settled records from 0.4.x saves.
  const LEGACY_INVESTMENTS = { actions: { show: ACTION_INVESTMENTS.show }, events: { 'military2:perform': EVENT_INVESTMENTS['military2:perform'] } };
  delete ACTION_INVESTMENTS.show;
  delete EVENT_INVESTMENTS['military2:perform'];
  for (const [id, tiers] of Object.entries(ACTION_TIERS)) ACTION_INVESTMENTS[id].tiers = tiers;
  for (const [id, tiers] of Object.entries(EVENT_TIERS)) EVENT_INVESTMENTS[id].tiers = tiers;
  Object.assign(EVENT_INVESTMENTS['military1:join'], { default: 18, h: 18, max: 26, label: '整个军训的安排', description: '选择训练与汇演的整体安排。以下成本包含整个流程，汇演不再额外扣费。' });
  // Retain historical choice IDs for old saves, but offer one continuous training flow.
  for (const choice of EVENTS.military1.choices) if (['tug', 'choir'].includes(choice.id)) choice.legacyHidden = true;
  for (const choice of EVENTS.military2.choices) Object.assign(choice, { time: 0, energy: 0, fitnessCost: 0, legacyHidden: true });
  Object.assign(EVENTS.military2.choices.find(choice => choice.id === 'later'), { mood: 6, social: 3, experience: 'military' });
  EVENTS.military2.choices.unshift({ id: 'perform', title: '完成军训汇演', description: '跟随方阵完成汇演，为这段共同训练留下记录。', time: 0, energy: 0, fitnessCost: 0, mood: 6, social: 3, experience: 'military' });
  const ENDINGS = { graduationAverage: 60, passedTerms: 6, furtherStudyAverage: 80, furtherStudyPreparation: 60, jobPreparation: 60 };
  const TERMINAL_ENDINGS = {
    cheatNote: { title: '小抄的第一行' },
    cardThief: { title: '校园卡大盗' }
  };
  const RANDOM_POOL = ['campusDiscussion', 'cat', 'canteen', 'card', 'wall', 'seat', 'snow', 'parcel', 'night', 'injury', 'flu', 'insomnia', 'lecture', 'drama', 'alumniStory', 'frontDesk', 'ginkgo', 'hawthorn', 'alumniFair', 'rollCall', 'jobFair', 'medicalInsurance', 'labNight', 'danceParty', 'memorial129'];
  // Elapsed time is an estimate of semester progress, not a week/day calendar.
  const CAMPUS_SCHEDULE = {
    military1: { terms: [1], minActions: 2, maxElapsed: 4 },
    // actions 限定事件只在与文案相符的行动后触发；结果类事件（复赛、汇演、答辩等）不限，因为玩家已报名参加。
    singer1: { season: 'autumn', minElapsed: 4, maxElapsed: 7, unless: 'singer3', actions: ['clubWork', 'walk', 'chat'] },
    singer2: { season: 'autumn', after: ['singer1', 'signup', 0], actionGap: 1 },
    singer3: { season: 'autumn', after: ['singer2', 'advance', 0], actionGap: 1 },
    ticket1: { season: 'autumn', minElapsed: 9, unless: 'ticket3' },
    ticket2: { season: 'spring', maxElapsed: 4, after: ['ticket1', 'buy', 1] },
    ticket3: { season: 'spring', maxElapsed: 6, after: ['ticket2', 'board', 0], actionGap: 1, actions: ['chat'] },
    // 体测为秋季学年主测，全年级统一参加；未达标或缺考者春季补测。
    fitnessTest: { terms: [3, 5, 7], minElapsed: 3, maxElapsed: 9 },
    fitnessRetest: { season: 'spring', minElapsed: 2, maxElapsed: 8, flag: 'fitnessRetest' },
    // 转专业共三次机会（大一下/大二上/大二下），结果在下学期初公示。
    transfer: { terms: [2, 3, 4], minElapsed: 4, maxElapsed: 7, actions: ['study'], unless: 'transferResult' },
    transferResult: { after: ['transfer', 'apply', 1], maxElapsed: 4 },
    sportsMeet: { terms: [2, 4, 6], minElapsed: 5, maxElapsed: 8 },
    contest1: { terms: [5], minElapsed: 4, maxElapsed: 7, unless: 'contest2', actions: ['study', 'applyProject', 'projectWork'] },
    // 校内选拔秋季启动，决赛次年春季。
    contest2: { terms: [6], after: ['contest1', 'join', 1] },
    seminar: { terms: [6], minElapsed: 4, maxElapsed: 7, actions: ['study', 'show'] },
    graduation: { terms: [8], minElapsed: 9 }
  };
  const RANDOM_CONTEXTS = {
    campusDiscussion: { actions: ['selfStudy'] },
    cat: { actions: ['selfStudy', 'walk'] },
    canteen: { actions: ['selfStudy', 'walk', 'chat', 'exercise', 'gym', 'teamSport', 'soloSport'] },
    card: { actions: ['selfStudy', 'walk', 'exercise', 'gym', 'teamSport', 'soloSport'] },
    wall: { actions: ['selfStudy', 'chat'] },
    seat: { actions: ['selfStudy'] },
    snow: { actions: ['walk'], season: 'autumn', minElapsed: 9 },
    parcel: { actions: ['chat'], season: 'autumn', minElapsed: 6 },
    night: { actions: ['chat'] },
    injury: { actions: ['exercise', 'gym', 'teamSport', 'soloSport'] },
    flu: { actions: ['chat'], season: 'autumn', minElapsed: 4 },
    insomnia: { actions: ['chat'] },
    lecture: { actions: ['show'] },
    drama: { actions: ['show'], season: 'spring', minElapsed: 9 },
    alumniStory: { actions: ['alumniVolunteer'] },
    frontDesk: { actions: ['alumniVolunteer'] },
    ginkgo: { actions: ['walk'], season: 'autumn', minElapsed: 5 },
    hawthorn: { actions: ['exercise', 'gym', 'teamSport', 'soloSport'], season: 'autumn', minElapsed: 4 },
    alumniFair: { actions: ['alumniVolunteer'] },
    rollCall: { actions: ['study', 'tutoring'] },
    jobFair: { actions: ['work'] },
    medicalInsurance: { actions: ['checkup', 'sickVisit'] },
    labNight: { actions: ['projectWork'] },
    danceParty: { actions: ['clubWork'] },
    memorial129: { actions: ['show'], season: 'autumn', minElapsed: 8 }
  };
  // 可选在线对话：relay 为云函数中转地址，空字符串表示关闭（NPC 只回本地台词）。
  // 密钥只放在云函数的环境变量里，前端永远接触不到；未连接或超时自动回退本地台词。
  const AI_CHAT = { relay: 'https://deepseek-relay-bsxioiwmxt.cn-hangzhou.fcapp.run', timeoutMs: 15000 };
  // NPC 聊天规则：聊天不再纯观感，走统一规则入口 chatWithNpc（见 game.js）。
  // 每条消息扣精力；学期内每个身份第一次搭话扣时间（整学期有上限）；
  // 社交/心情按对话质量分档，学长学姐和老师（academicIdentities）还能指点学习进度（平时分）。
  // identities 是校验白名单与历史标题用的完整身份表，需与 npc.js 的 IDENTITIES 保持一致（有测试守护）。
  const NPC_CHAT = {
    energyPerMessage: 1,
    timeFirstChatPerIdentity: 1,
    timeChargeCapPerTerm: 2,
    rewardMessagesPerIdentity: 3,
    academicPrepPerIdentity: 2,
    identities: { student: '学生', senior: '学长', seniorGirl: '学姐', canteenAunt: '食堂阿姨', chef: '食堂厨师', dormAunt: '宿管阿姨', lecturer: '任课老师', staff: '行政老师', professor: '教授', librarian: '图书管理员', internationalStudent: '留学生', security: '保安大叔', courier: '快递小哥', rider: '外卖骑手', coach: '体育老师', doctor: '校医', driver: '班车司机' },
    academicIdentities: ['senior', 'seniorGirl', 'lecturer', 'professor'],
    qualityEffects: { 0: {}, 1: { social: 1, mood: 2 }, 2: { social: 2, mood: 4 } },
    academicPrep: { 1: 3, 2: 5 }
  };
  const api = { RULES, FITNESS_TIERS, TERM_NAMES, BACKGROUNDS, PLACES, ACTIONS, ACTION_INVESTMENTS, EVENTS, EVENT_INVESTMENTS, LEGACY_INVESTMENTS, ENDINGS, TERMINAL_ENDINGS, RANDOM_POOL, CAMPUS_SCHEDULE, RANDOM_CONTEXTS, AI_CHAT, NPC_CHAT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CampusConfig = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
