(function (root) {
  'use strict';
  const RULES = { version: 3, appVersion: '0.4.0', saveFormatVersion: 1, terms: 8, time: 12, energy: 80, maxEnergy: 100, maxAttribute: 100, maxPreparation: 100, initialMoney: 1000, initialSocial: 20, initialFitness: 50, initialMood: 70, livingCost: 300, lowMood: 30, fitnessThreshold: 60 };
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
  const RELATIONSHIPS = {
    roommate: { title: '室友', description: '一起生活的人，最先看见你的状态。' },
    mentor: { title: '指导老师', description: '会把机会递到你面前，也会记得你有没有接住。' },
    clubmate: { title: '社团伙伴', description: '一起搬桌子、熬活动和收拾残局的人。' }
  };
  const GOALS = {
    scholar: { title: '学业冲刺', description: '把本学期学习进度做到 67 以上。', target: 67, reward: { furtherStudy: 10 }, rewardText: '深造准备 +10' },
    community: { title: '连接校园', description: '完成 2 次交流、社团或校友活动。', target: 2, reward: { social: 6 }, rewardText: '社交 +6' },
    practice: { title: '积累实践', description: '完成 2 次兼职、项目、社团或实习投入。', target: 2, reward: { jobPreparation: 10 }, rewardText: '求职准备 +10' },
    wellbeing: { title: '照顾自己', description: '学期结束时保持心情 70、体能 55。', target: 2, reward: { mood: 5, fitness: 3 }, rewardText: '心情 +5、体能 +3' },
    explore: { title: '走出熟悉区', description: '本学期尝试 4 种不同的行动。', target: 4, reward: { mood: 5, social: 5 }, rewardText: '心情 +5、社交 +5' }
  };
  const STORY_FLAG_IDS = ['mentorReferral', 'clubLeadership', 'roommateTrip'];
  const ACTIONS = {
    study: { place: 'think', title: '课程学习', description: '踩着铃声进教室，摊开今天要讲的那一章。一学期下来，笔记越写越厚。', time: 2, energy: 15, money: 0, preparation: 20, mood: -3, relationships: { mentor: 1 }, limit: 4 },
    tutoring: { place: 'think', title: '课程补习', description: '约了学长把卡住的章节讲透。两个小时，白板擦了又写。', time: 2, energy: 10, money: 100, preparation: 25, relationships: { mentor: 2 }, limit: 2 },
    selfStudy: { place: 'library', title: '自主学习', description: '图书馆靠窗的位子，耳机一戴，按自己的节奏过一遍。', time: 2, energy: 12, money: 0, preparation: 20, relationships: { mentor: 1 }, limit: 3 },
    furtherStudy: { place: 'library', title: '深造准备', description: '目标院校的招生简章打印出来，一张张贴进计划本，用荧光笔标好时间线。', time: 1, energy: 8, money: 0, furtherStudy: 20, minTerm: 5, limit: 2 },
    work: { place: 'gate', title: '校内勤工助学', description: '在值班室坐一个下午。来人办事就登记，没人就翻书。月底有一笔工资到账。', time: 2, energy: 20, money: 0, income: 200, social: 2, mood: -5, limit: 3 },
    jobPreparation: { place: 'gate', title: '求职准备', description: '简历逐行改过，面试常见题抄了半本。对着镜子练自我介绍，练到不再卡壳。', time: 1, energy: 8, money: 0, jobPreparation: 20, minTerm: 5, limit: 2 },
    rest: { place: 'dorm', title: '休息调整', description: '拉上帘子睡一觉。再睁眼，天都擦黑了。', time: 1, energy: 0, money: 0, recovery: 30, mood: 3 },
    chat: { place: 'dorm', title: '室友交流', description: '熄灯前的卧谈，从选课聊到食堂的菜，越聊越精神。', time: 1, energy: 5, money: 0, social: 5, mood: 8, relationships: { roommate: 5 }, limit: 2 },
    exercise: { place: 'track', title: '锻炼', description: '去操场跑几圈，出一身汗。晚风吹在脸上，很凉快。', time: 1, energy: 10, money: 0, fitness: 6, mood: 4, limit: 4 },
    walk: { place: 'ginkgo', title: '散步', description: '沿着银杏大道慢慢走，脑子里什么都不装。', time: 1, energy: 0, money: 0, recovery: 10, mood: 10, limit: 3 },
    applyProject: { place: 'yifu', title: '申请校园项目', description: '把简历和想法递到老师桌上。老师说：回去等消息。', time: 1, energy: 5, money: 0, minTerm: 2, maxTerm: 6, minPreparation: 40, chain: 'project', kind: 'apply' },
    projectWork: { place: 'yifu', title: '项目投入', description: '例会开到晚上，方案改到第七版，白板上的箭头越画越多。', time: 2, energy: 15, money: 0, preparation: 10, chain: 'project', kind: 'work', limit: 2 },
    applyClub: { place: 'activity', title: '参与社团招新', description: '百团大战的摊位一眼望不到头。报名表递出去，扫码进群。', time: 1, energy: 5, money: 0, relationships: { clubmate: 4 }, minTerm: 1, maxTerm: 6, autumnOnly: true, chain: 'club', kind: 'apply' },
    clubWork: { place: 'activity', title: '社团投入', description: '搬桌子、贴海报、盯签到，忙到嗓子发干。', time: 1, energy: 8, money: 0, social: 8, relationships: { clubmate: 7 }, chain: 'club', kind: 'work', limit: 2 },
    applyInternship: { place: 'gate', title: '申请实习经历', description: '成绩单和简历装进同一个文件袋，交上去。对方说，两周内回复。', time: 1, energy: 5, money: 0, minTerm: 5, maxTerm: 7, minAverage: 60, chain: 'internship', kind: 'apply' },
    internshipWork: { place: 'gate', title: '实习投入', description: '打卡，整理材料，跑腿送文件。下班走出大楼，天刚擦黑。', time: 2, energy: 15, money: 0, income: 100, chain: 'internship', kind: 'work', limit: 2 },
    checkup: { place: 'hospital', title: '体检', description: '挂号、量血压、抽血。医生看着单子说：各项指标正常。', time: 1, energy: 5, money: 50, fitness: 3, mood: 2, limit: 1 },
    sickVisit: { place: 'hospital', title: '看病开药', description: '在候诊区等了半小时。校医开了药，叮嘱按时吃、别熬夜。', time: 1, energy: 3, money: 60, mood: 8, limit: 2 },
    alumniVolunteer: { place: 'hotel', title: '校友接待志愿', description: '给返校校友签到、指路、搬资料。听他们聊起当年的北交，好像比现在还要热闹。', time: 2, energy: 10, money: 0, social: 5, mood: 3, relationships: { mentor: 3 }, limit: 2 },
    show: { place: 'auditorium', title: '看演出', description: '会堂今晚有演出。灯暗下来的时候，你才想起上次看戏还是高中。', time: 1, energy: 2, money: 40, mood: 8, social: 2, limit: 3 }
  };
  const EVENTS = {
    roommateCare: { priority: 10, title: '室友的关心', description: '晚上十一点，室友从对面上铺探下头，说你今天回来得挺早。沉默几秒，他问，要不要一起下楼吃点东西。', trigger: '你最近回宿舍越来越晚，话也越来越少', choices: [
      { id: 'talk', title: '和室友聊一会儿', description: '下楼，边吃边把最近的破事倒一倒。', time: 1, mood: 15, social: 3, relationships: { roommate: 10 } },
      { id: 'later', title: '先自己调整', description: '说声不用了，戴上耳机。今晚想一个人待着。', relationships: { roommate: -2 } }
    ] },
    fitnessTest: { priority: 20, title: '体测报名', description: '体育老师翻着点名册看了你一眼：这学期底子不错，体测的名额给你留一个。', trigger: '点名册上，你的锻炼出勤画得挺满', choices: [
      { id: 'participate', title: '参加体测', description: '报上名，上跑道。跑完这次，体测这一关就算过了。', time: 1, energy: 10, mood: 5, minFitness: 60, experience: 'fitnessTest' },
      { id: 'later', title: '这次暂不参加', description: '这次先不跑。跑道一直都在，下次再说。' }
    ] },
    projectOffer: { priority: 30, chain: 'project', node: 'application', title: '项目组的邀请', description: '课间，老师把你叫到走廊，说有个项目缺人手，问你要不要来。跟着做下去，下个学期把成果摆出来，简历上能多一行。', trigger: '你之前递出去的那份申请，有回音了', choices: [
      { id: 'accept', title: '加入项目', description: '答应下来。这学期开工，下个学期见成果。', chainEffect: 'accept', relationships: { mentor: 8 } },
      { id: 'later', title: '下一学期再考虑', description: '说手头太满，婉拒。以后想清楚了还可以再申请。', chainEffect: 'defer', relationships: { mentor: -3 } }
    ] },
    projectReview: { priority: 31, chain: 'project', node: 'review', title: '答辩日', description: '项目到了收尾的时候。老师把演示时间定在周五下午，PPT 在电脑里改了七版。', trigger: '结题的材料，你准备得差不多了', choices: [
      { id: 'complete', title: '展示成果', description: '上台，讲完，等答辩结束。这段经历会留在你的简历上。', mood: 5, chainEffect: 'complete', experience: 'project', relationships: { mentor: 6 } },
      { id: 'later', title: '延到下一学期', description: '再打磨一学期。前提是，这不是最后一个学期。', chainEffect: 'postpone' },
      { id: 'abandon', title: '放弃展示', description: '把文件归档，不展示了。做过的事还在，只是简历上没有这一行。', chainEffect: 'abandon' }
    ] },
    clubOffer: { priority: 40, chain: 'club', node: 'recruitment', title: '百团大战', description: '摊位之间挤满了人，一个社团的学姐拉住你：我们下个活动正缺人，进群聊聊？', trigger: '你报名的社团，来消息了', choices: [
      { id: 'accept', title: '加入社团', description: '扫码进群，把报名表发过去。筹办组的任务从此开始。', chainEffect: 'accept', relationships: { clubmate: 8 } },
      { id: 'later', title: '先专注其他安排', description: '摆摆手说再看看。来年秋天的招新还在这里。', chainEffect: 'defer', relationships: { clubmate: -2 } }
    ] },
    clubReview: { priority: 41, chain: 'club', node: 'activity', title: '活动结束的那个晚上', description: '散场后，你和其他人把最后一把椅子叠起来。灯一盏盏灭掉，群里已经开始有人发「辛苦大家」。', trigger: '活动散了场，收尾的事轮到你了', choices: [
      { id: 'complete', title: '发总结收尾', description: '把签到表、照片和总结发进群。大家排队回「收到」。', social: 5, mood: 5, chainEffect: 'complete', experience: 'club', relationships: { clubmate: 8 } },
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
    ] },
    military1: { priority: 11, title: '军训开训', description: '开学第二周，公告栏贴出军训安排。辅导员在群里说，这是大学的第一课。', trigger: '公告栏前围满了人', choices: [
      { id: 'join', title: '换上迷彩服', description: '站进队列，太阳很晒，口号很响。', time: 1, energy: 10, fitness: 5, mood: -5 },
      { id: 'later', title: '先请假', description: '跟辅导员磨了半天，批了半天的假。' }
    ] },
    military2: { priority: 12, title: '军训汇演', description: '两周过去，方阵走得有模有样。明天就是汇演，教官最后一遍喊了「稍息」。', trigger: '迷彩服洗了又洗，汇演要到了', choices: [
      { id: 'perform', title: '认真走完汇演', description: '正步踩在跑道上，胳膊甩得生疼。', time: 1, energy: 8, mood: 6, social: 3, experience: 'military' },
      { id: 'later', title: '混在队伍后面', description: '跟着走完，不抢镜，也不掉队。' }
    ] },
    transfer: { priority: 70, title: '转专业通知', description: '学院通知栏贴出转专业办法。室友路过时多看了你一眼：你不是一直嘀咕想换方向？', trigger: '通知栏又贴了新东西', choices: [
      { id: 'apply', title: '递交转专业申请', description: '打印成绩单，填表，交到教务处。心里七上八下。', time: 2, energy: 10, mood: 4, social: 1 },
      { id: 'later', title: '留在原专业', description: '想想又算了。现在这个方向，其实也没那么差。' }
    ] },
    seminar: { priority: 71, title: '深造宣讲会', description: '报告厅门口排起长队，海报写着：深造经验分享会。台上坐着几个去年上岸的学长学姐。', trigger: '报告厅门口排起了长队', choices: [
      { id: 'attend', title: '进去听一听', description: '记了半页笔记，也记下了几个名字。', time: 1, energy: 3, furtherStudy: 8, relationships: { mentor: 4 } },
      { id: 'later', title: '路过，不进去', description: '人太多了。以后找同学要份笔记。' }
    ] },
    retake: { priority: 72, title: '补考通知', description: '新学期第一周，教务系统弹出一条提醒：你有一门课未通过，补考安排在下周。', trigger: '教务系统弹出一条提醒', choices: [
      { id: 'retake', title: '报名补考', description: '报名费划走，教材重新翻开。这一次，不能再挂。', time: 2, energy: 10, money: 50, mood: -5 },
      { id: 'later', title: '这次不考了', description: '关掉网页。以后的事，以后再说。' }
    ] },
    graduation: { priority: 73, title: '毕业季', description: '毕业季说来就来。学士服租借点排起长队，跳蚤市场在银杏大道边支起了摊。', trigger: '毕业季说来就来', choices: [
      { id: 'photos', title: '拍一组毕业照', description: '学士帽抛起来的那一刻，快门声连成一片。', time: 1, money: 80, mood: 8, social: 3 },
      { id: 'market', title: '摆摊卖旧书', description: '教材三块一本，学弟学妹边挑边问有没有笔记。', time: 1, energy: 5, income: 80, social: 3 },
      { id: 'later', title: '这些都不弄了', description: '把该交的材料交齐，比什么都强。' }
    ] },
    singer1: { priority: 25, title: '歌手大赛报名', description: '学生活动中心门口拉起横幅：校园歌手大赛报名最后一天。门口的音箱放着一首谁都听过的歌。', trigger: '门口的音箱放着一首谁都听过的歌', choices: [
      { id: 'signup', title: '报名试试', description: '填了报名表。上台这种事，总得试一次。', time: 1, energy: 3 },
      { id: 'later', title: '在旁边看热闹', description: '看别人报名也挺好。' }
    ] },
    singer2: { priority: 26, title: '复赛', description: '复赛在活动中心小礼堂。灯光有点晃眼，主持人念到了你的名字。', trigger: '主持人念到了你的名字', choices: [
      { id: 'advance', title: '认真唱完', description: '第一句有点抖，后来越唱越稳。', time: 1, energy: 8, mood: 3 },
      { id: 'later', title: '弃赛', description: '想了想，把话筒还了回去。' }
    ] },
    singer3: { priority: 27, title: '决赛之夜', description: '决赛在操场搭了舞台。台下黑压压一片，室友举着手机在给你录像。', trigger: '台下黑压压一片', choices: [
      { id: 'perform', title: '上台唱完', description: '唱到最后，台下有人跟着哼。这个晚上够记很久。', time: 2, energy: 10, social: 8, mood: 10, experience: 'singer' },
      { id: 'later', title: '临时退出', description: '在后台站到散场，把演出看完了。' }
    ] },
    ticket1: { priority: 45, title: '春运抢票', description: '秋季学期进入尾声，寒假将近，宿舍群里开始流传抢票攻略。室友说，你回家的票还没买吧。', trigger: '秋季学期末，宿舍群里开始流传抢票攻略', choices: [
      { id: 'buy', title: '定好闹钟抢票', description: '准点开抢，页面转了三圈。回家和开学返校的车次都安排好了。', time: 1, energy: 3, mood: 2 },
      { id: 'later', title: '寒假再说', description: '把群消息设成免打扰。' }
    ] },
    ticket2: { priority: 46, title: '返校的车', description: '寒假结束，该回北京上课了。你在家乡的车站等候返校列车，行李里装着家人准备的特产。', trigger: '春季开学，确认上一学期约好的返校行程', choices: [
      { id: 'board', title: '上车返校', description: '火车开动，家乡慢慢退后，北京和新的学期就在前面。', time: 1, energy: 5, mood: 6 },
      { id: 'later', title: '另作返校安排', description: '原定车次不合适，你改签换乘，返校行程另外安排。' }
    ] },
    ticket3: { priority: 47, title: '家乡特产', description: '假期结束返校，行李箱里塞满了家里塞给你的东西。你拎了一袋特产，分给宿舍。', trigger: '行李箱里塞满了家里塞给你的东西', choices: [
      { id: 'share', title: '分给室友', description: '特产摆了一桌，大家边吃边聊起各自的家乡。', time: 1, energy: 3, social: 6, mood: 6, experience: 'trip' },
      { id: 'later', title: '留着自己吃', description: '味道是家的味道，谁也分不走。' }
    ] },
    contest1: { priority: 55, title: '竞赛招募', description: '实验楼公告栏贴出全国竞赛校内选拔通知。上次的项目老师路过，朝你扬了扬下巴：组个队？', trigger: '公告栏贴出竞赛选拔通知', choices: [
      { id: 'join', title: '组队报名', description: '队伍拉起来了，队名想了一晚上。', time: 2, energy: 8 },
      { id: 'later', title: '这学期太忙', description: '和老师道了谢，摆摆手。' }
    ] },
    contest2: { priority: 56, title: '决赛答辩', description: '决赛在周末，四个小时闭卷设计加现场答辩。开赛前，队友把笔分到你手里。', trigger: '队友把笔分到你手里', choices: [
      { id: 'compete', title: '全力以赴', description: '答辩结束，评委多问了一句：你们是哪个学校的。', time: 2, energy: 12, preparation: 8, social: 5, mood: 6, experience: 'contest' },
      { id: 'later', title: '弃权', description: '交了半成品。下次再来。' }
    ] },
    cat: { priority: 61, title: '台阶上的猫', description: '图书馆门口的台阶上卧着一只橘猫，尾巴慢慢扫。它抬头看了你一眼，又趴下了。', trigger: '一只橘猫卧在台阶上', choices: [
      { id: 'feed', title: '买根火腿肠喂它', description: '它凑过来，吃完蹭了蹭你的裤脚。', time: 1, money: 10, mood: 5 },
      { id: 'later', title: '赶时间，先走了', description: '你绕开它。它也不恼，继续晒太阳。' }
    ] },
    canteen: { priority: 62, title: '食堂新窗口', description: '食堂三楼开了新窗口，队伍拐了两个弯。前面的同学说，招牌菜每天都卖断货。', trigger: '新窗口的队伍拐了两个弯', choices: [
      { id: 'queue', title: '排队尝一尝', description: '排到窗口，阿姨手一抖，多给了半勺。', time: 1, money: 20, mood: 6, energy: 3 },
      { id: 'later', title: '人太多，改天', description: '拍了张菜单照片，发给室友。' }
    ] },
    card: { priority: 63, title: '地上的校园卡', description: '路上躺着一张校园卡，照片上的面孔有点眼熟，可能是隔壁班的。卡里余额还不少。', trigger: '地上躺着一张校园卡', choices: [
      { id: 'return', title: '交到失物招领', description: '登记的时候，失主在群里正好喊了一嗓子：卡丢了，急。', time: 1, social: 3, mood: 5 },
      { id: 'later', title: '放回原处', description: '你把它放回原地。' },
      { id: 'pocket', title: '装进口袋', description: '揣进兜里。晚上睡觉前，你把卡塞到了枕头下面。', income: 50, mood: -8 }
    ] },
    wall: { priority: 64, title: '表白墙点名', description: '表白墙上有人发了你：今天在图书馆遇到的穿灰卫衣的同学。室友把截图甩进群里，连发三个问号。', trigger: '室友把截图甩进了群里', choices: [
      { id: 'reply', title: '在群里否认', description: '群里闹了一晚上，最后也没人猜出是谁发的。', time: 1, social: 4, mood: 4 },
      { id: 'later', title: '装没看见', description: '你退出群聊，过了一会儿又点进来。' }
    ] },
    seat: { priority: 65, title: '占座之争', description: '你常坐的位子上放着一本书，主人不在。旁边的人说，书从早上就摆着了。', trigger: '你常坐的位子上放着一本书', choices: [
      { id: 'argue', title: '把书挪开坐下', description: '书的主人回来，瞪了你一眼。你没有让。', time: 1, energy: 3, mood: -4, social: 2 },
      { id: 'later', title: '换个位子', description: '多走两步的事。' }
    ] },
    snow: { priority: 66, season: 'autumn', title: '北京初雪', description: '北京初雪，落在银杏叶还没扫尽的路上。宿舍楼下一片惊呼声。', trigger: '北京初雪', choices: [
      { id: 'play', title: '下楼踩雪', description: '你在雪地里走了两圈，鞋湿了，心里很痛快。', time: 1, recovery: 2, mood: 8 },
      { id: 'later', title: '隔窗看看', description: '窗户上哈了口气，画了个笑脸。' }
    ] },
    parcel: { priority: 67, season: 'autumn', title: '快递爆仓', description: '双十一的快递堆成了山。快递点的货架根本不够用，纸箱一路码到门口。', trigger: '快递点的纸箱码到了门口', choices: [
      { id: 'find', title: '在纸箱堆里找快递', description: '翻了二十分钟，你的包裹在最底层。', time: 1, energy: 3, mood: -4, social: 2 },
      { id: 'later', title: '过两天再说', description: '让它先躺着。' }
    ] },
    night: { priority: 68, title: '深夜卧谈', description: '熄灯后没人睡觉。不知道谁起了个头，宿舍开始聊起高考、志愿和那些差一点的选择。', trigger: '熄灯后没人睡觉', choices: [
      { id: 'join', title: '加入话题', description: '聊到凌晨两点，谁也没看时间。', time: 1, social: 5, mood: 6 },
      { id: 'later', title: '闭眼装睡', description: '你翻了个身，慢慢真的睡着了。' }
    ] },
    injury: { priority: 74, title: '球场上的崴脚', description: '打球抢篮板，落地的时候脚踝咔地响了一声。现在肿起来了，走路一瘸一拐。', trigger: '脚踝肿起来了', choices: [
      { id: 'treat', title: '去校医院处理', description: '冰袋敷上，校医说没伤到骨头，静养一周。', time: 1, energy: 3, money: 50, mood: 5 },
      { id: 'later', title: '贴个膏药忍着', description: '膏药味冲鼻子。疼是疼，课还是得去上。' }
    ] },
    flu: { priority: 75, title: '换季流感', description: '换季降温，宿舍楼下一片咳嗽声。早上起来，你的嗓子也哑了，额头有点烫。', trigger: '宿舍楼下一片咳嗽声', choices: [
      { id: 'clinic', title: '去校医院开药', description: '排队的工夫，前面已经有人戴着口罩在咳嗽。', time: 1, energy: 3, money: 60, mood: 7 },
      { id: 'later', title: '多喝热水硬扛', description: '热水一杯接一杯。扛不扛得住，看运气。' }
    ] },
    insomnia: { priority: 76, title: '失眠的夜', description: '连续几天熬到凌晨，今晚躺下反而清醒。窗帘外透进路灯，脑子里全是没交的作业。', trigger: '窗帘外透进路灯', choices: [
      { id: 'clinic', title: '去校医院看看', description: '校医说先调作息，开了两片药。', time: 1, money: 60, mood: 6 },
      { id: 'later', title: '翻个身硬睡', description: '你翻了个身，数到三百，又数了一遍。' }
    ] },
    lecture: { priority: 77, title: '会堂的讲座', description: '天佑会堂门口排起长队。海报上写着今晚的嘉宾，是行业里叫得出名字的人。', trigger: '会堂门口排起长队', choices: [
      { id: 'listen', title: '进场听一场', description: '两个小时的讲座，你记了半页关键词。', time: 1, energy: 2, social: 3, mood: 3 },
      { id: 'later', title: '门口转转就走', description: '人太多了。你拍了张海报，发给同学。' }
    ] },
    drama: { priority: 78, title: '毕业大戏', description: '会堂今晚是话剧社的毕业大戏。票卖得只剩最后几张，门口有人举着手机找票。', trigger: '门口有人举着手机找票', choices: [
      { id: 'buy', title: '买票进去看', description: '谢幕时全场起立。你在掌声里坐了很久。', time: 1, money: 30, mood: 8 },
      { id: 'later', title: '看个海报就好', description: '你拍下剧名，想着下次早点买票。' }
    ] },
    alumniStory: { priority: 79, title: '校友分享会', description: '红果园宾馆的宴会厅在办校友返校会。一个学长端着杯子，讲他毕业后的第一份工作。', trigger: '宴会厅里传来掌声', choices: [
      { id: 'listen', title: '坐下来听', description: '散场前，学长留了联系方式，说欢迎去他那实习。', time: 1, energy: 2, social: 4, mood: 3, relationships: { mentor: 6 } },
      { id: 'later', title: '不打扰他们', description: '你穿过大堂，去办自己的事。' }
    ] },
    frontDesk: { priority: 80, title: '周末帮工', description: '宾馆前台贴着招周末帮工的启事。时薪还行，就是得早起。', trigger: '前台贴着招工启事', choices: [
      { id: 'apply', title: '去应聘', description: '换床单、摆毛巾，干了一整天。结钱的时候，手有点抖。', time: 1, income: 150, mood: -3 },
      { id: 'later', title: '看看就好', description: '时薪是还行。但周末，你想睡懒觉。' }
    ] },
    roommateTrip: { priority: 16, title: '室友的周末计划', description: '室友把两张车票拍在桌上：周末去趟郊外？你最近一直在忙，出去透口气也好。', trigger: '室友把周末计划摊到你面前', choices: [
      { id: 'go', title: '一起出发', description: '赶上清早的车。风从车窗灌进来，你们一路聊到目的地。', time: 1, mood: 10, social: 6, relationships: { roommate: 10 }, storyFlag: 'roommateTrip', experience: 'roommateTrip' },
      { id: 'later', title: '下次一定', description: '你把车票推回去。室友点点头，说那就下次。', relationships: { roommate: -4 } }
    ] },
    mentorReferral: { priority: 35, title: '老师递来的机会', description: '老师在课后叫住你，说有位校友正在找学生做研究助理。你的名字，他已经提过了。', trigger: '老师把一位校友的联系方式发给你', choices: [
      { id: 'accept', title: '认真准备', description: '你把项目经历整理成一页纸，约好下周去聊。', preparation: 8, furtherStudy: 12, relationships: { mentor: 8 }, storyFlag: 'mentorReferral', experience: 'mentorReferral' },
      { id: 'later', title: '先顾好眼前', description: '你谢过老师，暂时不接这个机会。', relationships: { mentor: -3 } }
    ] },
    clubLeadership: { priority: 45, title: '活动主理人', description: '社团伙伴把活动策划案递给你：这次你来牵头？大家都愿意配合。', trigger: '社团伙伴把策划案和名单一起交给你', choices: [
      { id: 'lead', title: '接下主理', description: '场地、流程、人员一项项排好。活动结束时，大家都在喊你的名字。', time: 1, social: 10, jobPreparation: 8, relationships: { clubmate: 10 }, storyFlag: 'clubLeadership', experience: 'clubLeadership' },
      { id: 'later', title: '让别人负责', description: '你帮忙提了几个建议，把主位让给更有空的人。', relationships: { clubmate: 2 } }
    ] }
  };
  const ENDINGS = { graduationAverage: 60, passedTerms: 6, furtherStudyAverage: 80, furtherStudyPreparation: 60, jobPreparation: 60, campusLeaderSocial: 55, innovatorAverage: 70 };
  const RANDOM_POOL = ['campusDiscussion', 'cat', 'canteen', 'card', 'wall', 'seat', 'snow', 'parcel', 'night', 'injury', 'flu', 'insomnia', 'lecture', 'drama', 'alumniStory', 'frontDesk'];
  // Elapsed time is an estimate of semester progress, not a week/day calendar.
  const CAMPUS_SCHEDULE = {
    military1: { terms: [1], minActions: 2, maxElapsed: 4 },
    military2: { terms: [1], maxElapsed: 7, after: ['military1', 'join', 0], actionGap: 1 },
    singer1: { season: 'autumn', minElapsed: 4, maxElapsed: 7, unless: 'singer3' },
    singer2: { season: 'autumn', after: ['singer1', 'signup', 0], actionGap: 1 },
    singer3: { season: 'autumn', after: ['singer2', 'advance', 0], actionGap: 1 },
    ticket1: { season: 'autumn', minElapsed: 9, unless: 'ticket3' },
    ticket2: { season: 'spring', maxElapsed: 4, after: ['ticket1', 'buy', 1] },
    ticket3: { season: 'spring', maxElapsed: 6, after: ['ticket2', 'board', 0], actionGap: 1 },
    contest1: { terms: [5], minElapsed: 4, maxElapsed: 7, unless: 'contest2' },
    contest2: { terms: [5], after: ['contest1', 'join', 0], actionGap: 1 },
    transfer: { terms: [3], minElapsed: 4, maxElapsed: 7 },
    seminar: { terms: [6], minElapsed: 4, maxElapsed: 7 },
    graduation: { terms: [8], minElapsed: 9 },
    roommateTrip: { terms: [2, 4, 6], minElapsed: 2, maxElapsed: 10, relationship: ['roommate', 45], unlessFlag: 'roommateTrip' },
    mentorReferral: { terms: [3, 4, 5, 6], minElapsed: 3, maxElapsed: 10, relationship: ['mentor', 35], unlessFlag: 'mentorReferral' },
    clubLeadership: { terms: [3, 5], minElapsed: 3, maxElapsed: 10, relationship: ['clubmate', 30], chainStatus: ['club', ['active', 'completed']], unlessFlag: 'clubLeadership' }
  };
  const RANDOM_CONTEXTS = {
    campusDiscussion: { actions: ['selfStudy'] },
    cat: { actions: ['selfStudy', 'walk'] },
    canteen: { actions: ['selfStudy', 'walk', 'chat', 'exercise'] },
    card: { actions: ['selfStudy', 'walk', 'exercise'] },
    wall: { actions: ['selfStudy', 'chat'] },
    seat: { actions: ['selfStudy'] },
    snow: { actions: ['walk'], season: 'autumn', minElapsed: 9 },
    parcel: { actions: ['chat'], season: 'autumn', minElapsed: 6 },
    night: { actions: ['chat'] },
    injury: { actions: ['exercise'] },
    flu: { actions: ['chat'], season: 'autumn', minElapsed: 4 },
    insomnia: { actions: ['chat'] },
    lecture: { actions: ['show'] },
    drama: { actions: ['show'], season: 'spring', minElapsed: 9 },
    alumniStory: { actions: ['alumniVolunteer'] },
    frontDesk: { actions: ['alumniVolunteer'] }
  };
  const api = { RULES, TERM_NAMES, BACKGROUNDS, PLACES, ACTIONS, EVENTS, ENDINGS, GOALS, RELATIONSHIPS, STORY_FLAG_IDS, RANDOM_POOL, CAMPUS_SCHEDULE, RANDOM_CONTEXTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CampusConfig = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
