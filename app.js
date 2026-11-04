'use strict';

const game = CampusGame;
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const h = escapeHtml;
const mathText = (value) => {
  const matrix = (first, second) => '<span class="math-matrix" role="math"><span class="matrix-bracket">[</span><span class="matrix-grid">'
    + first.split(',').concat(second.split(',')).map((cell) => '<span>' + cell.trim() + '</span>').join('')
    + '</span><span class="matrix-bracket">]</span></span>';
  return escapeHtml(value)
    .replace(/\[\[([^\[\]]+)\],\[([^\[\]]+)\]\]/g, (_, first, second) => matrix(first, second))
    .replace(/∫\[([^,\]]+),([^\]]+)\]/g, '∫<span class="math-limits"><sup>$2</sup><sub>$1</sub></span>')
    .replace(/\^(\([^)]*\)|[A-Za-z0-9+\-−]+)/g, '<sup>$1</sup>');
};
const hotspots = [...document.querySelectorAll('.map-hotspot')];
const audio = typeof CampusAudio !== 'undefined' ? CampusAudio : null;
const basketballGame = typeof CampusBasketball !== 'undefined' ? CampusBasketball : null;
const seasonal = typeof CampusSeason !== 'undefined' ? CampusSeason : null;
const PLACE_SOUNDS = { think: 'study', library: 'study', yifu: 'study', dorm: 'relax', ginkgo: 'relax', track: 'sport', activity: 'opportunity', gate: 'opportunity', hospital: 'info', auditorium: 'info', hotel: 'info' };
const ACTION_SOUNDS = { study: 'study', tutoring: 'study', selfStudy: 'study', furtherStudy: 'study', projectWork: 'study', applyProject: 'opportunity', applyClub: 'opportunity', clubWork: 'opportunity', applyInternship: 'opportunity', internshipWork: 'paper', jobPreparation: 'paper', work: 'paper', rest: 'relax', chat: 'relax', walk: 'relax', exercise: 'sport', gym: 'sport', teamSport: 'sport', soloSport: 'sport', basketball: 'sport', treatment: 'success' };
const dialog = $('#termDialog');
const basketballDialog = $('#basketballDialog');
const debug = new URLSearchParams(location.search).get('debug') === '1';
let storage = null;
try { storage = window.localStorage; } catch (_) { /* Play remains available without storage. */ }
const saves = CampusSave.createSlotService(storage);
const sms = typeof CampusSms !== 'undefined' ? CampusSms : null;
const LOGIN_KEY = 'bjtu-life:login';
const LOGIN_SKIP_KEY = 'bjtu-life:login:skipped';
let loginSession = null;
let loginSkipped = false;
let smsCountdown = null;
try { loginSession = JSON.parse(storage?.getItem(LOGIN_KEY)) || null; } catch (_) {}
try { loginSkipped = storage?.getItem(LOGIN_SKIP_KEY) === '1'; } catch (_) {}
let activeSaveSlot = null;
let saveTarget = null;
let state = null;
let activePlace = null;
let lastHotspot = null;
let dialogMode = null;
let terminalChoice = null;
let uiLocked = false;
let unlockTimer;
let toastTimer;
let placeEnterTimer;
// 季节与天气是纯观感层：由学期、剩余时间和存档种子推导，不写入游戏状态，也不消耗随机数。
let lastSeasonClock = null;
let seasonVisualKey = '';
let seasonNoticeTimer = null;
// 校园偶遇 NPC：纯逻辑在 npc.js，渲染与点击对话在这里。
// 聊天记录与走位仍是观感层、不进存档；playing 阶段每条消息会走规则命令 chatWithNpc 结算消耗与收益。
const npc = typeof CampusNpc !== 'undefined' ? CampusNpc : null;
let npcSystem = null;
let npcTimer = null;
let npcTalking = null;
const npcFades = new Map();
const npcNodes = new Map();
const npcTalkIndex = new Map();
const npcChatLogs = new Map();
let npcTyping = false;
let commandSequence = 0;
let savedRevision = -1;
let savedAt = '';
let saveNotice = '';
const eventDrafts = new Map();
const actionDrafts = new Map();
let acknowledgedResultRevision = -1;
let basketballSession = null;
let basketballCompanion = null;
let zhouView = { screen: 'home', group: 'life', activity: 'selfStudy', amount: undefined, profileOpen: false, text: null };
let lastVisualNovel = null;
let zhouRequest = null;
let zhouRequestSequence = 0;
let zhouChatDraft = '';
let zhouChatNotice = '';
let zhouHistoryOpen = false;
const ZHOU_GROUPS = { study: '学习与未来计划', sport: '运动与球场', life: '散步、演出与日常', campus: '社团、项目与工作' };
const failures = [];
const sessionId = Date.now().toString(36);
function showToast(message) {
  audio?.play('toast');
  if (dialog.open) $('#dialogNotice').textContent = message;
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 4000);
}
const ACTION_FLAVOR = {
  study: '你合上书，今天该交的作业都交了。',
  tutoring: '卡住的章节总算翻过去了。',
  selfStudy: '闭馆音乐响起，你才从书里抬头。',
  furtherStudy: '计划表上的下一个节点被划掉了。',
  work: '到账提示响了，今天的班没白站。',
  jobPreparation: '简历又删掉一段废话，顺眼多了。',
  rest: '你醒来时，宿舍的天已经擦黑。',
  chat: '熄灯前的卧谈结束，笑声还没散。',
  exercise: '你在跑道边撑着膝盖喘气，心里却踏实。',
  gym: '器械归位，汗水把衣服贴在背上，整个人轻了一截。',
  teamSport: '球场上的热闹散了，你还站在原地喘气，嘴角没压住。',
  basketball: '球从指尖离手，篮网翻了一下。你捡起球，听见自己还在喘。',
  soloSport: '耳机里的歌放到最后一段，你放慢速度，慢慢走回去。',
  walk: '一圈走下来，步子轻了些。',
  applyProject: '申请递出去了，接下来等回复。',
  projectWork: '改完最后一版方案，会议室的灯熄了。',
  applyClub: '报名表交了出去，招新群里已经热闹起来。',
  clubWork: '海报贴完，签到表也理好了。',
  applyInternship: '材料交了上去，接下来是等。',
  internshipWork: '打卡下班，通勤路上天还没黑透。',
  checkup: '体检单打印出来，各项指标正常。你把单子折好，塞进口袋。',
  sickVisit: '药片就着温水吞下去。校医说，三天内别熬夜。',
  treatment: '校医把药递过来，叮嘱你这两天别再逞强。',
  alumniVolunteer: '散场时，一位老校友塞给你一瓶水：辛苦了，小校友。',
  show: '谢幕的时候，你跟着人群鼓掌，掌心拍得发红。'
};
const EVENT_CHOICE_FLAVOR = {
  'roommateCare:talk': '烤串摊的灯很亮。你把最近的破事倒了一桌子，说到最后，自己先笑了。',
  'roommateCare:later': '你戴上耳机。室友没再说话，只把顶灯调暗了一格。',
  'fitnessTest:later': '假条开好了，医务室老师签了字。你走出校医院，听见操场上隐约的哨声。',
  'fitnessRetest:later': '通知被划进「稍后处理」。它会在消息列表里，一直等到你点开为止。',
  'projectOffer:accept': '你在报名表上签了字。当晚，项目群里多了条欢迎消息。',
  'projectOffer:later': '你婉拒了。老师摆摆手：随时欢迎回来。',
  'projectReview:complete': '答辩结束，台下有人鼓掌。你把 PPT 拖进了「结题」文件夹。',
  'projectReview:later': '演示改到了下学期。文件又改了一版。',
  'projectReview:abandon': '文件夹归档。有些事做过，不一定都要拿出来讲。',
  'clubOffer:accept': '群消息当晚就 99+。你回了一个「到」。',
  'clubOffer:later': '你摆摆手说再看看。摊位还热闹着，来年秋天还在这。',
  'clubReview:complete': '总结发进群，好几个人接龙「辛苦」。你截图存了下来。',
  'clubReview:later': '活动顺延到下学期。筹备群安静了，又没完全安静。',
  'clubReview:abandon': '你把群置顶取消了。任务转给下一届，他们发来一句谢谢。',
  'internshipOffer:accept': '你回了邮件。下周一的闹钟，比平时早了一个半小时。',
  'internshipOffer:later': '谢绝邮件在草稿箱躺了一晚，第二天早上你点了发送。',
  'internshipReview:complete': '证明开好了，章盖得很正。你把它夹进简历的最后一页。',
  'internshipReview:later': '手续下个学期再办。先回学校上课。',
  'internshipReview:abandon': '没办证明。通勤路上的晚霞，你自己记得。',
  'campusDiscussion:discuss': '三个人的草稿纸拼到一张桌上，那道题终于有了第三种解法。',
  'campusDiscussion:later': '你低头继续看书。那桌的声音小了下去。',
  'military1:tug': '麻绳绷直的那一刻，你听见全连在喊号子。手心的茧，是军训留给你的第一枚勋章。',
  'military1:choir': '几百人的合唱把操场都震了震。教官说，唱得比走正步齐。',
  'military1:join': '迷彩服领到手，裤腿长了一截。你把鞋带系得比高考还紧。',
  'military1:later': '假条交上去了。你在树荫下看他们踢正步。',
  'military2:march': '方阵走过主席台，你的正步一个都没错。掌声响起来的时候，你才发现手心全是汗。',
  'military2:choir': '合唱方队上台，你站在第二排。台下跟着打拍子，比排练时齐多了。',
  'military2:later': '你跟在队伍最后。走过主席台时，也把腰挺了挺。',
  'transfer:apply': '材料递进窗口。之后的日子，你路过通知栏都会多看两眼。',
  'transfer:later': '你把通知拍下来，存进相册，再没打开。',
  'transferResult:later': '你把手机扣在桌上。通知栏的红点，等会儿再看。',
  'sportsMeet:fun': '两人三足摔成一团，全班笑到岔气。名次不重要，照片全是表情包。',
  'sportsMeet:later': '你在看台递了一下午的水。加油喊得嗓子哑了，比自己上场还累。',
  'seminar:attend': '散场后你在报告厅门口站了会儿。有个学长加了你微信，说资料发你。',
  'seminar:later': '你从队伍旁绕过去，回头看了一眼海报。',
  'retake:retake': '报名确认短信到了。你把教材重新包了书皮。',
  'retake:later': '网页关掉了。那门课的教材还在书架最上层。',
  'graduation:photos': '快门响的时候，你把学士帽抛得最高。照片洗出来，每个人都笑得很开。',
  'graduation:market': '旧书很快卖完，一个学妹抱着你的笔记说谢谢。你说，好好学。',
  'graduation:later': '材料交了，手续齐了。四年，轻飘飘地就办完了。',
  'singer1:signup': '报名表交上去，工作人员说：下周复赛，加油。',
  'singer1:later': '你站在人堆外听了两首歌，还挺好听。',
  'singer2:advance': '最后一个音落下，礼堂安静了一秒，然后有人鼓掌。你进了决赛。',
  'singer2:later': '话筒还回去的时候，工作人员拍了拍你的肩。',
  'singer3:perform': '台下有人举起手机闪光灯。你唱完最后一首，朝室友录像的方向挥了挥手。',
  'singer3:later': '你在后台把决赛听完了。明年，明年一定上。',
  'ticket1:buy': '出票成功四个字弹出来。你把截图发进家庭群，秒回：几号到家。',
  'ticket1:later': '群消息设了免打扰。票的事，再等等。',
  'ticket2:board': '火车开向北京，家乡的站台慢慢后退。行李箱里的特产，回宿舍就能分给室友。',
  'ticket2:later': '原定车次没有坐成。你改签换乘，重新安排返校行程。',
  'ticket3:share': '特产一抢而空。老家的味道在宿舍转了一圈，有人说：这我妈也做过。',
  'ticket3:later': '你留着自己吃，慢慢吃。味道是家里的。',
  'contest1:join': '队名定了，群聊建好，第一版方案写到凌晨。',
  'contest1:later': '你和老师道谢。他说，明年还有。',
  'contest2:compete': '答辩结束，评委朝你们点头。走出教室，队友把帽子扣在你头上。',
  'contest2:later': '半成品交上去。走出赛场，你跟自己说，下次准备更充分。',
  'cat:feed': '火腿肠掰成小段。橘猫吃完，在你脚边翻了个身。',
  'cat:later': '你绕开它。它连眼睛都没抬。',
  'canteen:queue': '多给的那半勺，让这一下午都值了。',
  'canteen:later': '菜单照片发进宿舍群，室友回：明天一起去。',
  'card:return': '失主连声道谢，说改天请你喝奶茶。你说不用，下次小心。',
  'card:later': '你把它放回原地，走了几步，又回头看了一眼。',
  'card:pocket': '卡在枕头下硌得慌。第二天，你把它塞进抽屉最深处。',
  'wall:reply': '闹到半夜，热度过去。那件灰卫衣，你第二天照穿。',
  'wall:later': '你退出群聊，十分钟后又点进来。消息已经刷到 99+。',
  'seat:argue': '书的主人回来，你们对视几秒。最后他把书拿走，你赢了这一场。',
  'seat:later': '你去了另一张桌子。靠窗，风正好。',
  'snow:play': '鞋湿了，脚趾冰凉。你仰头接雪，北方冬天的味道灌了一嘴。',
  'snow:later': '窗玻璃上哈出一个笑脸。雪还在下，你看了很久。',
  'parcel:find': '最底层的纸箱就是你的。抱回宿舍，拆开，一样没少。',
  'parcel:later': '让它先躺着。你的快递比你有耐心。',
  'night:join': '聊到最后，谁也没看时间。有些话，只有熄了灯才说得出口。',
  'night:later': '你翻了个身。他们还在小声说，你慢慢睡着了。',
  'injury:treat': '冰袋压着脚踝，凉得你倒吸气。校医说，幸好没伤到骨头。',
  'injury:later': '膏药贴上了。你一瘸一拐地往教室走，速度慢了，没缺课。',
  'flu:clinic': '药袋拎回宿舍，室友说，把病毒和作业一起隔离了。',
  'flu:later': '热水灌下去三杯。你缩进被子里，决定和这场感冒谈判。',
  'insomnia:clinic': '药盒放在床头。今晚的事，交给今晚。',
  'insomnia:later': '数到三百又从头数。天快亮的时候，你终于睡着了。',
  'lecture:listen': '散场后你在门口站了会儿。笔记上的关键词，后来真的用上了。',
  'lecture:later': '海报拍糊了。你发给同学，对面回：怎么不进去。',
  'drama:buy': '谢幕的掌声响了很久。回宿舍的路上，你还在想那句台词。',
  'drama:later': '你记下了剧名，也记下了下次开票的时间。',
  'alumniStory:listen': '学长递来名片。你说，先加个微信。',
  'alumniStory:later': '你从人群边上走过。杯盘碰撞声里，混着几句旧日里的校名。',
  'frontDesk:apply': '结账的时候手有点抖。回家的路上，你给自己买了瓶汽水。',
  'frontDesk:later': '你盯着启事看了两秒，最后被床的召唤打败了。',
  'ginkgo:photo': '一阵风过，银杏叶落了你一头。照片发出去，家里人说：北京的秋天真好看。',
  'ginkgo:later': '你在树下站了一会儿，风把叶子吹到你肩膀上。',
  'hawthorn:take': '山楂酸得人眯眼睛。同学说，这就是「小红果」的来历。',
  'hawthorn:later': '你绕开摊位。身后的笑声和山楂味一起飘过来。',
  'alumniFair:browse': '老校友翻出当年的饭票，你翻出手机里的校园地图。差了二十年，聊的还是一座园子。',
  'alumniFair:later': '今天人太多了。你说改天再来，转身走进了大堂。',
  'rollCall:cover': '「到！」你喊得中气十足。老师推了推眼镜，没抬头。',
  'rollCall:later': '你低头翻书。讲台上传来一个名字，不是你的。',
  'jobFair:browse': '展位图拍下来，二维码扫了七八个。有些岗位的名字，你第一次听说。',
  'jobFair:later': '你摆摆手。离毕业还早，海报上的字以后再认。',
  'medicalInsurance:register': '参保回执折好放进钱包。从此看病买药，能报一点是一点。',
  'medicalInsurance:later': '想着身体还行，先把这事放一放。',
  'labNight:join': '凌晨两点的实验室，咖啡和键盘声都很响。师兄说：谢谢你，数据跑完了。',
  'labNight:later': '你拉上外套。逸夫楼的灯在身后，亮成一片。',
  'danceParty:join': '从僵硬到放开，一晚上下来嗓子哑了。回宿舍路上，彩灯还在晃。',
  'danceParty:later': '音乐挺好听。你在门口听了一会儿，转身走了。',
  'memorial129:watch': '谢幕时全场起立。身边有人小声说：这台晚会排了三个月。',
  'memorial129:later': '你拍了张节目单。横幅上的字被风吹得猎猎响。'
};
// NPC 2D 小人：同一套基础身型（头、袖、上衣、下摆、腿）加各职位配件，班车单独绘制。
function npcBody(options) {
  const skin = options.skin || '#f2c9a0';
  const top = options.top;
  return '<circle cx="20" cy="12" r="7" fill="' + skin + '"/>'
    + '<rect x="9" y="21" width="3" height="11" rx="1.5" fill="' + top + '"/>'
    + '<rect x="28" y="21" width="3" height="11" rx="1.5" fill="' + top + '"/>'
    + '<rect x="12" y="20" width="16" height="16" rx="4" fill="' + top + '"/>'
    + '<rect x="13" y="28" width="14" height="6" rx="2" fill="' + (options.bottom || '#3c4450') + '"/>'
    + (options.accessory || '')
    + '<rect x="14" y="36" width="4" height="9" rx="2" fill="' + (options.legs || '#333a45') + '"/>'
    + '<rect x="22" y="36" width="4" height="9" rx="2" fill="' + (options.legs || '#333a45') + '"/>';
}
const NPC_HAIR = '<path d="M13 10 A7 7 0 0 1 27 10 L27 12 A7 7 0 0 0 13 12 Z" fill="#2b2b33"/>';
const NPC_HAIR_GREY = '<path d="M13 10 A7 7 0 0 1 27 10 L27 12 A7 7 0 0 0 13 12 Z" fill="#c9ccd1"/>';
const NPC_GLASSES = '<circle cx="16" cy="12" r="2.2" fill="none" stroke="#22262b" stroke-width="1.1"/><circle cx="24" cy="12" r="2.2" fill="none" stroke="#22262b" stroke-width="1.1"/><path d="M18.2 12h3.6" stroke="#22262b" stroke-width="1.1"/>';
const NPC_FIGURES = {
  student: npcBody({ top: '#2e6fae', bottom: '#f4f4f4', accessory: NPC_HAIR + '<rect x="29" y="21" width="7" height="14" rx="2.5" fill="#7c4a21"/>' }),
  senior: npcBody({ top: '#5b6b7c', bottom: '#8a97a5', accessory: NPC_HAIR + NPC_GLASSES + '<rect x="29" y="21" width="7" height="14" rx="2.5" fill="#6b4a2b"/>' }),
  seniorGirl: npcBody({ top: '#8a5ba6', bottom: '#4c5866', accessory: NPC_HAIR + '<path d="M26 7 q7 4 6 12 l-2.4 1 q1.4-7-4.6-10z" fill="#2b2b33"/>' + '<rect x="4" y="24" width="7" height="10" rx="1.5" fill="#5d4037"/>' }),
  canteen: npcBody({ skin: '#f0c39a', top: '#f7f7f2', bottom: '#f7f7f2', accessory: NPC_HAIR + '<rect x="12" y="2" width="16" height="7" rx="2" fill="#f7f7f2"/><rect x="12" y="2" width="16" height="3" rx="1.5" fill="#d94f4f"/>' }),
  lecturer: npcBody({ top: '#3f5c77', bottom: '#333a45', accessory: NPC_HAIR + '<path d="M19 21l2 6-2 1-2-1z" fill="#b03a2e"/>' }),
  staff: npcBody({ top: '#6f7f8f', bottom: '#4c5866', accessory: NPC_HAIR + '<rect x="17" y="21" width="6" height="2" fill="#c26a2e"/><rect x="18" y="23" width="4" height="5" rx="0.8" fill="#f7f7f2"/>' }),
  security: npcBody({ top: '#2b3440', bottom: '#2b3440', accessory: '<rect x="11" y="3" width="18" height="5" rx="2" fill="#2b3440"/><rect x="9" y="7" width="22" height="2" rx="1" fill="#1c232c"/>' }),
  courier: npcBody({ top: '#f0a020', bottom: '#d9d9d9', accessory: '<rect x="13" y="3" width="14" height="4.5" rx="2" fill="#f0a020"/><rect x="12" y="20" width="16" height="3" rx="1" fill="#b37000"/>' }),
  professor: npcBody({ top: '#4a4a55', bottom: '#333a45', accessory: NPC_HAIR_GREY + NPC_GLASSES + '<rect x="4" y="25" width="5" height="8" rx="1" fill="#8d5524"/>' }),
  international: npcBody({ skin: '#8a5a3b', top: '#e84393', bottom: '#d63384', accessory: '<circle cx="14" cy="7" r="2.6" fill="#1d1d24"/><circle cx="20" cy="5.5" r="3" fill="#1d1d24"/><circle cx="26" cy="7" r="2.6" fill="#1d1d24"/>' }),
  chef: npcBody({ skin: '#f0c39a', top: '#f7f7f2', bottom: '#f7f7f2', accessory: NPC_HAIR + '<rect x="13" y="0" width="14" height="9" rx="2" fill="#f7f7f2"/><rect x="13" y="0" width="14" height="2.6" rx="1.3" fill="#d94f4f"/>' }),
  dormAunt: npcBody({ skin: '#f2c9a0', top: '#b0553f', bottom: '#8f6b52', accessory: NPC_HAIR_GREY + '<circle cx="20" cy="4.5" r="2.6" fill="#c9ccd1"/>' }),
  librarian: npcBody({ top: '#3e7d5c', bottom: '#333a45', accessory: NPC_HAIR + NPC_GLASSES + '<rect x="29" y="24" width="7" height="9" rx="1" fill="#c26a2e"/>' }),
  rider: npcBody({ top: '#2f6fb0', bottom: '#2f6fb0', accessory: '<path d="M12 8 A8 8 0 0 1 28 8 L27.5 10.5 A7.2 7.2 0 0 0 12.5 10.5 Z" fill="#e8a020"/><rect x="12" y="20" width="16" height="3" rx="1" fill="#e8a020"/><rect x="0" y="24" width="6" height="12" rx="2" fill="#d94f4f"/>' }),
  coach: npcBody({ top: '#a33333', bottom: '#333a45', accessory: NPC_HAIR + '<circle cx="20" cy="26" r="2.2" fill="#e8e8e8"/><path d="M20 28.2v3" stroke="#e8e8e8" stroke-width="1"/>' }),
  doctor: npcBody({ top: '#f7f7f2', bottom: '#f7f7f2', accessory: NPC_HAIR + '<rect x="18" y="22" width="4" height="5" fill="#d94f4f"/><rect x="16.5" y="23.2" width="7" height="2.4" fill="#d94f4f"/>' }),
  bus: '<rect x="3" y="9" width="34" height="27" rx="5" fill="#d94f4f"/>'
    + '<rect x="6" y="13" width="11" height="9" rx="1.5" fill="#cfeef7"/><rect x="23" y="13" width="11" height="9" rx="1.5" fill="#cfeef7"/>'
    + '<rect x="6" y="25" width="28" height="3.5" rx="1.5" fill="#a33333"/><rect x="6" y="31" width="28" height="2" rx="1" fill="#7d1f1f"/>'
    + '<circle cx="12" cy="39" r="4.5" fill="#26272b"/><circle cx="12" cy="39" r="1.8" fill="#8f9296"/>'
    + '<circle cx="28" cy="39" r="4.5" fill="#26272b"/><circle cx="28" cy="39" r="1.8" fill="#8f9296"/>'
};
function npcFigureSvg(figure) {
  return '<svg class="npc-svg" viewBox="0 0 40 48" aria-hidden="true">' + (NPC_FIGURES[figure] || NPC_FIGURES.student) + '</svg>';
}
function statsMarkup() {
  const latest = state.courses.at(-1);
  const tier = game.fitnessTier(state.fitness);
  const fitnessNote = tier.ill
    ? '/ 100 · 生病 · 先去校医院'
    : '/ 100 · ' + tier.label + '（收益 ×' + tier.reward.toFixed(2) + ' / 消耗 ×' + tier.cost.toFixed(2) + '）';
  const items = [
    ['成绩', latest ? latest.grade : '待结算', latest ? latest.name + ' · 最近成绩' : '等待首次期末', 'grade'],
    ['社交', state.social, '/ 100 · 慢慢攒', 'social'], ['体能', state.fitness, fitnessNote, tier.ill ? 'fitness is-ill' : 'fitness'],
    ['心情', state.mood, '/ 100 · 会影响事件', state.mood < 30 ? 'mood is-low' : 'mood'],
    ['钱包', state.money, '元 · 可用资金', 'money']
  ];
  return items.map(([name, value, note, style]) => '<div class="attribute ' + style + '"><span class="attribute-name">' + h(name) + '</span><b>' + h(value) + '</b><small>' + h(note) + '</small></div>').join('');
}
function chainLabel(chain) {
  const labels = { idle: '未申请', active: '进行中', deferred: '暂缓申请', completed: '已完成', missed: '未完成' };
  return labels[chain.status] + (['active', 'missed'].includes(chain.status) ? ' · ' + chain.progress + '/2 次投入' : '');
}
// 头像与昵称：点头像弹出资料卡（放大 + 更换/恢复），点昵称弹出修改框，效仿主流 App。
const AVATAR_KEY = 'bjt-life-avatar';
const MOTION_KEY = 'bjt-life-motion';
const HOTSPOT_KEY = 'bjt-life-hotspots';
function setAvatarImage(dataUrl) {
  ['#playerAvatar', '#avatarPopoverImage'].forEach((selector) => {
    const avatar = $(selector);
    if (!avatar || !avatar.style) return;
    if (dataUrl) {
      avatar.style.backgroundImage = 'url("' + dataUrl + '")';
      avatar.classList.add('has-image');
    } else {
      avatar.style.backgroundImage = '';
      avatar.classList.remove('has-image');
    }
  });
}
function loadAvatar() {
  try {
    const saved = window.localStorage && window.localStorage.getItem(AVATAR_KEY);
    if (saved) setAvatarImage(saved);
  } catch (_) {}
}
function resetAvatar() {
  setAvatarImage(null);
  try { window.localStorage.removeItem(AVATAR_KEY); } catch (_) {}
  showToast('已恢复默认头像');
}
function saveAvatarFile(file) {
  try {
    if (!file || !/^image\//.test(file.type)) { showToast('请选择图片文件'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const image = new Image();
        image.onload = () => {
          try {
            const size = 160;
            const canvas = document.createElement('canvas');
            canvas.width = size; canvas.height = size;
            const ctx = canvas.getContext('2d');
            const side = Math.min(image.width, image.height);
            const sx = (image.width - side) / 2;
            const sy = (image.height - side) / 2;
            ctx.drawImage(image, sx, sy, side, side, 0, 0, size, size);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.86);
            setAvatarImage(dataUrl);
            try { window.localStorage.setItem(AVATAR_KEY, dataUrl); } catch (_) {}
            showToast('头像已更新');
          } catch (_) { showToast('图片处理失败，换一张试试'); }
        };
        image.onerror = () => showToast('图片读取失败');
        image.src = String(reader.result);
      } catch (_) {}
    };
    reader.onerror = () => showToast('图片读取失败');
    reader.readAsDataURL(file);
  } catch (_) {}
}
function pickAvatar() {
  const input = $('#avatarInput');
  if (input && typeof input.click === 'function') input.click();
}
// 资料卡 / 昵称框：定位在锚点下方，点空白或 Esc 收起。
let openPopoverName = null;
function positionPopover(popover, anchor) {
  try {
    if (!popover || !popover.style || !anchor || typeof anchor.getBoundingClientRect !== 'function') return;
    const rect = anchor.getBoundingClientRect();
    const viewport = Number.isFinite(window.innerWidth) ? window.innerWidth : 360;
    const width = Math.min(280, viewport - 24);
    const left = Math.max(12, Math.min(rect.left, viewport - width - 12));
    popover.style.width = width + 'px';
    popover.style.left = Math.round(left) + 'px';
    popover.style.top = Math.round(rect.bottom + 10) + 'px';
  } catch (_) {}
}
function showPopover(name) {
  const avatarPopover = $('#avatarPopover');
  const namePopover = $('#namePopover');
  const attrPopover = $('#attrPopover');
  if (attrPopover) attrPopover.hidden = true;
  if (avatarPopover) avatarPopover.hidden = name !== 'avatar';
  if (namePopover) namePopover.hidden = name !== 'name';
  openPopoverName = name;
  const avatarButton = $('#playerAvatar');
  if (avatarButton) avatarButton.classList.toggle('is-open', name === 'avatar');
  if (name === 'avatar' && avatarPopover) {
    const title = $('#popoverName');
    if (title) title.textContent = state ? state.nickname : '等待入学';
    const major = $('#popoverMajor');
    if (major && state) major.textContent = (state.background.college ? state.background.college + ' · ' : '') + state.background.major;
    positionPopover(avatarPopover, avatarButton);
  }
  if (name === 'name' && namePopover) {
    const input = $('#nameInput');
    if (input) {
      input.value = state ? state.nickname : '';
      try { input.focus(); input.select(); } catch (_) {}
    }
    const error = $('#nameError');
    if (error) error.textContent = '';
    positionPopover(namePopover, $('#playerName'));
  }
}
function closePopovers() {
  openPopoverName = null;
  const avatarPopover = $('#avatarPopover');
  if (avatarPopover) avatarPopover.hidden = true;
  const namePopover = $('#namePopover');
  if (namePopover) namePopover.hidden = true;
  const attrPopover = $('#attrPopover');
  if (attrPopover) attrPopover.hidden = true;
  const avatarButton = $('#playerAvatar');
  if (avatarButton) avatarButton.classList.remove('is-open');
}
function submitNickname() {
  if (!state) { showToast('入学后才能修改昵称'); return; }
  const input = $('#nameInput');
  const checked = game.validateNickname(input ? input.value : '');
  const error = $('#nameError');
  if (!checked.ok) {
    if (error) error.textContent = checked.reason;
    return;
  }
  state.nickname = checked.value;
  closePopovers();
  renderState();
  showToast('昵称已更新');
}
// 设置里的高频偏好：动画效果、热点提示，记在本机浏览器。
let motionOn = true;
let hotspotsOn = true;
function applyMotion() {
  if (document.body && document.body.classList) document.body.classList.toggle('reduce-motion', !motionOn);
  const button = $('#motionButton');
  if (button) {
    button.textContent = '动画效果:' + (motionOn ? '开' : '关');
    button.setAttribute('aria-pressed', motionOn ? 'true' : 'false');
  }
}
function applyHotspots() {
  if (document.body && document.body.classList) document.body.classList.toggle('hide-hotspot-rings', !hotspotsOn);
  const button = $('#hotspotButton');
  if (button) {
    button.textContent = '热点提示:' + (hotspotsOn ? '开' : '关');
    button.setAttribute('aria-pressed', hotspotsOn ? 'true' : 'false');
  }
}
function loadPreferences() {
  try {
    const motion = window.localStorage.getItem(MOTION_KEY);
    if (motion === '0') motionOn = false;
    const hotspots = window.localStorage.getItem(HOTSPOT_KEY);
    if (hotspots === '0') hotspotsOn = false;
  } catch (_) {}
  applyMotion();
  applyHotspots();
}
// 属性说明：点顶部状态条 / 时间 / 钱包，查看怎么获得、有什么用。
const ATTR_INFO = {
  time: {
    title: '时间',
    how: '每学期固定 12 点，进入下一学期时重置为 12 点；本学期未用完的时间不结转。',
    why: '地图上的行动与部分事件会消耗时间；时间为 0 时无法继续行动，只能结束学期并参加期末考试。'
  },
  energy: {
    title: '精力',
    how: '每学期开始时为 80 点；休息恢复 30 点，散步恢复 10 点；学期之间不结转。',
    why: '大多数行动需要消耗精力；精力不足时相关行动不可执行，需要先通过休息等方式恢复。'
  },
  mood: {
    title: '心情',
    how: '散步、观看演出、室友交流、喂猫、锻炼、校友接待等行动可以提升心情。',
    why: '心情会计入学期结算与成长记录；低于 30 时会触发室友关心等负面事件。'
  },
  fitness: {
    title: '体能',
    how: '锻炼、健身房、多人运动、单人运动可以提升体能；生病和部分事件会降低体能。',
    why: '体能按档位缩放行动的收益与消耗；低于 25 进入生病状态，只能先去校医院就诊；体测以体能 60 为达标线。'
  },
  social: {
    title: '社交',
    how: '社团投入、室友交流、比赛、志愿活动、观看演出等行动可以积累社交。',
    why: '社交会计入学期结算与成长记录，反映本学期的校园活跃度。'
  },
  learning: {
    title: '学习进度',
    how: '课程学习、自主学习、补习、项目投入可以增加学习进度；与学长学姐、老师聊天每次额外 +2。',
    why: '学习进度是期末总评的平时分，占总评 40%；申请校园项目要求学习进度达到 40；进入下一学期后清零。'
  },
  money: {
    title: '钱包',
    how: '初始 1000 元；校内勤工助学每次 +200，实习投入每次 +100，部分事件也有收入。',
    why: '用于支付每学期生活费 300 元（不足由补助补足），以及补习 100 元、健身房 50 元、体检 50 元、看病 20～60 元、观演 40 元等开销和事件投入预算。'
  }
};
function attrValueText(attr) {
  if (!state) return '';
  const values = { time: state.time + ' / 12', money: state.money + ' 元' };
  if (values[attr]) return values[attr];
  const map = { energy: state.energy, mood: state.mood, fitness: state.fitness, social: state.social, learning: state.preparation };
  return map[attr] === undefined ? '' : map[attr] + ' / 100';
}
function attrStatusText(attr) {
  if (!state) return '';
  if (attr === 'fitness') {
    const tier = game.fitnessTier(state.fitness);
    if (!tier) return '';
    if (tier.ill) return '生病：先去校医院就诊';
    return '当前档位：' + tier.label + '（收益 ×' + tier.reward.toFixed(2) + ' / 消耗 ×' + tier.cost.toFixed(2) + '）';
  }
  if (attr === 'mood' && state.mood < 30) return '心情偏低，可能触发负面事件。';
  if (attr === 'energy' && state.energy < 10) return '精力见底，先休息再安排行动。';
  if (attr === 'time' && state.time === 0) return '时间用完了，去地图上结束这个学期吧。';
  return '';
}
function showAttrPopover(attr, anchorEl) {
  const info = ATTR_INFO[attr];
  const popover = $('#attrPopover');
  if (!info || !popover) return;
  if (openPanelName) closePanel();
  closePopovers();
  openPopoverName = 'attr';
  const title = $('#attrTitle');
  if (title) title.textContent = info.title;
  const value = $('#attrValue');
  if (value) value.textContent = attrValueText(attr);
  const status = $('#attrStatus');
  if (status) { status.textContent = attrStatusText(attr); status.hidden = !status.textContent; }
  const how = $('#attrHow');
  if (how) how.textContent = info.how;
  const why = $('#attrWhy');
  if (why) why.textContent = info.why;
  popover.hidden = false;
  positionPopover(popover, anchorEl);
}
// 顶部菜单：点击展开对应面板，再点或点空白处收起。
let openPanelName = null;
function setPanel(name) {
  openPanelName = name;
  document.querySelectorAll('.app-panel').forEach((panel) => {
    panel.hidden = panel.dataset.panelName !== name;
  });
  document.querySelectorAll('.app-menu-button').forEach((button) => {
    button.setAttribute('aria-expanded', button.dataset.panel === name ? 'true' : 'false');
  });
  if (name === 'records') renderRecordsPanel();
  if (name === 'relationships') renderRelationshipsPanel();
}
function closePanel() { setPanel(null); }
function syncBarHeight() {
  try {
    const bar = $('#appBar');
    if (bar && typeof bar.getBoundingClientRect === 'function' && document.documentElement && document.documentElement.style) {
      const rect = bar.getBoundingClientRect();
      document.documentElement.style.setProperty('--bar-bottom', Math.round(rect.bottom + 8) + 'px');
      document.documentElement.style.setProperty('--bar-h', Math.round(rect.height) + 'px');
    }
  } catch (_) {}
}
// 季节天气：秋→冬 / 春→夏，每季 6 点时间；换季给一次提醒，特殊天气按种子固定分配。
function hideSeasonNotice() {
  clearTimeout(seasonNoticeTimer);
  const notice = $('#seasonNotice');
  if (notice) { notice.hidden = true; notice.classList.remove('is-visible'); }
}
function resetSeasonTracking() {
  lastSeasonClock = null;
  seasonVisualKey = '';
  hideSeasonNotice();
}
function clearSeasonEffects() {
  resetSeasonTracking();
  const overlay = $('#seasonOverlay');
  if (overlay) overlay.hidden = true;
  const particles = $('#weatherParticles');
  if (particles) particles.innerHTML = '';
  const chip = $('#seasonLabel');
  if (chip) { chip.textContent = '—'; chip.setAttribute('data-season', 'none'); chip.setAttribute('title', ''); }
  const mapLayer = $('#mapLayer');
  if (mapLayer) mapLayer.setAttribute('data-season', 'none');
}
function seasonParticleMarkup(info) {
  if (!seasonal) return '';
  const plan = seasonal.particlePlan(info.season, info.weather.id);
  const narrow = typeof window !== 'undefined' && Number.isFinite(window.innerWidth) && window.innerWidth < 720;
  const scale = narrow ? 0.62 : 1;
  return plan.map((item) => {
    const count = Math.max(1, Math.round(item.count * scale));
    let html = '';
    for (let index = 0; index < count; index += 1) {
      const seed = seasonal.hash(info.season + ':' + info.weather.id + ':' + item.type + ':' + index);
      const x = seed % 100;
      const delay = -(((seed >>> 7) % 140) / 10);
      const duration = item.type === 'rain' ? 0.55 + ((seed >>> 13) % 40) / 100
        : item.type === 'wind' ? 1.2 + ((seed >>> 13) % 80) / 100
          : item.type === 'catkin' ? 12 + ((seed >>> 13) % 100) / 10
            : item.type === 'mote' ? 8 + ((seed >>> 13) % 70) / 10
              : item.type === 'cloud' ? 35 + ((seed >>> 13) % 50)
                : item.type === 'fog' ? 22 + ((seed >>> 13) % 100) / 10
                  : 7 + ((seed >>> 13) % 90) / 10;
      const size = item.type === 'dust' ? 3 + ((seed >>> 3) % 10)
        : item.type === 'mote' ? 3 + ((seed >>> 3) % 4)
          : item.type === 'rain' ? 7 + ((seed >>> 3) % 7)
            : item.type === 'snow' ? 5 + ((seed >>> 3) % 9)
              : item.type === 'catkin' ? 10 + ((seed >>> 3) % 12)
                : item.type === 'cloud' ? 60 + ((seed >>> 3) % 90)
                  : item.type === 'fog' ? 120 + ((seed >>> 3) % 140)
                    : 9 + ((seed >>> 3) % 10);
      const drift = ((seed >>> 17) % 140) - 70;
      const style = '--x:' + x + '%;--delay:' + delay + 's;--dur:' + duration + 's;--size:' + size + 'px;--drift:' + drift + 'px;';
      html += '<span class="weather-particle is-' + item.type + '" style="' + style + '"></span>';
    }
    return html;
  }).join('');
}
function showSeasonNotice(info) {
  const node = $('#seasonNotice');
  if (!node || !seasonal) return;
  const pair = info.pair || seasonal.pairForTerm(state.term);
  const from = seasonal.SEASONS[pair[0]];
  const to = seasonal.SEASONS[pair[1]];
  node.innerHTML = '<span class="season-notice-kicker">换季提醒</span><b>' + h(from.short) + ' → ' + h(to.short) + '</b><p>' + h(to.notice) + '</p>';
  node.hidden = false;
  node.classList.add('is-visible');
  clearTimeout(seasonNoticeTimer);
  seasonNoticeTimer = setTimeout(() => {
    node.classList.remove('is-visible');
    seasonNoticeTimer = setTimeout(() => { node.hidden = true; }, 380);
  }, 4200);
}
function renderSeasonEffects() {
  const overlay = $('#seasonOverlay');
  const chip = $('#seasonLabel');
  const mapLayer = $('#mapLayer');
  if (!state || !seasonal) {
    if (overlay) overlay.hidden = true;
    const particles = $('#weatherParticles');
    if (particles) particles.innerHTML = '';
    if (chip) { chip.textContent = '—'; chip.setAttribute('data-season', 'none'); chip.setAttribute('title', ''); }
    if (mapLayer) mapLayer.setAttribute('data-season', 'none');
    resetSeasonTracking();
    return;
  }
  const info = seasonal.weatherFor(state.rng.seed, state.term, state.time);
  if (chip) {
    chip.textContent = info.seasonInfo.short + ' · ' + info.weather.label;
    chip.setAttribute('data-season', info.season);
    chip.setAttribute('title', info.seasonInfo.name + ' · ' + info.weather.label + (info.special ? '（季节专属天气）' : ''));
  }
  if (mapLayer) mapLayer.setAttribute('data-season', info.season);
  if (lastSeasonClock && lastSeasonClock.term !== state.term) hideSeasonNotice();
  // 同一学期里时间从 6 点以上走到 6 点以下，就是换季节点。
  if (lastSeasonClock && lastSeasonClock.term === state.term && lastSeasonClock.time > 6 && state.time <= 6) showSeasonNotice(info);
  lastSeasonClock = { term: state.term, time: state.time };
  if (!overlay) return;
  overlay.hidden = false;
  const key = info.season + ':' + info.weather.id;
  if (key === seasonVisualKey) return;
  seasonVisualKey = key;
  overlay.setAttribute('data-season', info.season);
  overlay.setAttribute('data-weather', info.weather.id);
  overlay.setAttribute('data-tone', info.weather.tone);
  const particles = $('#weatherParticles');
  if (particles) particles.innerHTML = seasonParticleMarkup(info);
}
function renderState() {
  if (!state) return;
  $('#playerLabel').textContent = (state.background.college ? state.background.college + ' · ' : '') + state.background.major;
  const avatarLetter = String(state.nickname || '北').trim().slice(0, 1) || '北';
  ['#playerAvatar', '#avatarPopoverImage'].forEach((selector) => {
    const avatar = $(selector);
    if (avatar) avatar.textContent = avatarLetter;
  });
  const playerName = $('#playerName');
  if (playerName) playerName.textContent = state.nickname;
  const setVital = (barId, valueId, value, max) => {
    const bar = $('#' + barId);
    if (bar && bar.style) bar.style.width = Math.max(0, Math.min(100, Math.round(value / max * 100))) + '%';
    const label = $('#' + valueId);
    if (label) label.textContent = String(value);
  };
  setVital('barEnergy', 'valueEnergy', state.energy, 100);
  setVital('barMood', 'valueMood', state.mood, 100);
  setVital('barFitness', 'valueFitness', state.fitness, 100);
  setVital('barSocial', 'valueSocial', state.social, 100);
  setVital('barPreparation', 'valuePreparation', state.preparation, 100);
  $('#termLabel').textContent = game.TERM_NAMES[state.term - 1] + (['finished', 'ended'].includes(state.phase) ? ' · 已结束' : ' · ' + game.getTermStage(state));
  $('#timeLabel').textContent = '时间 ' + state.time + ' / 12';
  renderSeasonEffects();
  const energyLabel = $('#energyLabel');
  if (energyLabel) energyLabel.textContent = '精力 ' + state.energy + ' / 100';
  const moneyLabel = $('#moneyLabel');
  if (moneyLabel) moneyLabel.textContent = '钱包 ' + state.money + ' 元';
  $('#mapStats').innerHTML = statsMarkup();
  const profileBrief = $('#profileBrief');
  if (profileBrief) {
    const background = game.BACKGROUNDS.find((item) => item.id === state.background.id);
    profileBrief.innerHTML = '<div>当前学期 <b>' + h(game.TERM_NAMES[state.term - 1]) + '</b> · 当前阶段 <b>' + h(game.getTermStage(state)) + '</b></div>' +
      (background ? '<div>背景加成 ' + h(background.bonus) + '</div>' : '') +
      '<div>已通过学期 <b>' + state.courses.filter((item) => item.passed).length + ' / 8</b></div>';
  }
  const profileCardName = $('#profileCardName');
  if (profileCardName) profileCardName.textContent = state.nickname;
  const profileCardMajor = $('#profileCardMajor');
  if (profileCardMajor) profileCardMajor.textContent = state.background.college + ' · ' + state.background.major;
  const profileAvatar = $('#profileAvatar');
  if (profileAvatar) profileAvatar.textContent = String(state.nickname || '北').trim().slice(0, 1) || '北';
  const popoverName = $('#popoverName');
  if (popoverName) popoverName.textContent = state.nickname;
  const popoverMajor = $('#popoverMajor');
  if (popoverMajor) popoverMajor.textContent = (state.background.college ? state.background.college + ' · ' : '') + state.background.major;
  const fitnessWarning = $('#fitnessWarning');
  if (fitnessWarning) {
    fitnessWarning.hidden = !game.isSick(state);
    fitnessWarning.textContent = game.isSick(state) ? '身体已经撑不住：先去校医院就诊，否则无法安排其他行动。' : '';
  }
  const preparationValue = $('#preparationValue');
  if (preparationValue) preparationValue.textContent = state.preparation + ' / 100';
  const preparationMeter = $('#preparationMeter');
  if (preparationMeter) preparationMeter.value = state.preparation;
  $('#placeStats').innerHTML = '<div class="place-resources"><span>时间 <b>' + state.time + ' / 12</b></span><span>精力 <b>' + state.energy + ' / 100</b></span><span>学习进度 <b>' + state.preparation + ' / 100</b></span></div><div class="place-attributes">' + statsMarkup() + '</div>';
  const selectedIds = state.selectedCourses || [];
  const selectedNames = selectedIds.map((id) => game.courseById(id)?.name || id).join('、') || '未选课';
  $('#termBrief').innerHTML = '<div>本学期课程 <b>' + h(selectedNames) + '</b>' + (state.phase === 'examPending' ? ' · 考试待提交' : '') + '</div><div>平均成绩 <b>' + (state.courses.length ? game.averageGrade(state).toFixed(1) : '待结算') + '</b> · 达标 <b>' + state.courses.filter((item) => item.passed).length + '/8 学期</b></div>';
  $('#directionBrief').innerHTML = '<div>深造准备 <b>' + state.furtherStudy + '/100</b> · 求职准备 <b>' + state.jobPreparation + '/100</b></div>' + Object.entries(state.chains).map(([id, chain]) => '<div>' + game.CHAIN_NAMES[id] + ' <b>' + chainLabel(chain) + '</b></div>').join('');
  $('#endTermButton').textContent = ({ eventPending: '处理当前事件', examPending: '继续期末考试', summary: '查看学期总结', endingChoice: '选择毕业方向', finished: '查看毕业结果', ended: '查看本局结局' })[state.phase] || (selectedIds.length ? '结束学期并考试' : '结束学期');
  $('#sessionNote').textContent = savedAt ? '栏位 ' + activeSaveSlot + ' · ' + (savedRevision === state.revision ? '当前进度已保存 · ' : '当前有未保存进度 · ') + displayTime(savedAt) : '尚未保存；点击保存选择栏位，之后自动保存到该栏位。';
  renderRecordsPanel();
  renderRelationshipsPanel();
  renderNpcLayer();
  $('#dialogSave').hidden = ['admission', 'login', 'restart', 'save', 'load', 'confirmSave', 'npc', 'courseSelection', 'confirmCheat', 'confirmEnding'].includes(dialogMode);
  syncBarHeight();
  if (activePlace) renderActions();
  if (debug) $('#debugSummary').textContent = '规则 ' + state.rulesVersion + ' · 阶段 ' + state.phase + ' · revision ' + state.revision + ' · 随机调用 ' + state.rng.calls;
}
function changeText(changes) {
  const names = { time: '时间', energy: '精力', money: '钱包', preparation: '学习进度', social: '社交', fitness: '体能', mood: '心情', furtherStudy: '深造准备', jobPreparation: '求职准备' };
  return Object.entries(changes || {}).filter(([, value]) => value !== 0).map(([key, value]) => names[key] + ' ' + (value > 0 ? '+' : '−') + Math.abs(value) + (key === 'money' ? ' 元' : '')).join(' · ') || '没什么明显变化';
}
function supportText(entry) {
  if (!entry.support?.companion) return '';
  const names = { preparation: '学习', social: '社交', fitness: '体能', mood: '心情', furtherStudy: '深造', jobPreparation: '求职' };
  const metrics = Object.entries(entry.support.metrics);
  const player = metrics.map(([key, value]) => names[key] + ' +' + value.playerInitial).join('、');
  const npc = metrics.filter(([, value]) => value.npcBonus > 0).map(([key, value]) => names[key] + ' +' + value.npcBonus).join('、');
  return (player ? '玩家初始收获：' + player + '。' : '') + (npc ? '周宁辅助：' + npc + '。' : '本次没有额外数值加成。');
}
function costs(effect) {
  return [(effect.time ? '时间 −' + effect.time : ''), (effect.energy ? '精力 −' + effect.energy : ''), (effect.money ? '钱包 −' + effect.money + ' 元' : ''), (effect.mood < 0 ? '心情 −' + Math.min(state.mood, Math.abs(effect.mood)) : ''), (effect.fitnessCost ? '体能 −' + effect.fitnessCost + '（消耗）' : '')].filter(Boolean).join(' · ') || '不消耗资源';
}
function renderActions() {
  const actions = Object.keys(game.ACTIONS).filter((id) => game.ACTIONS[id].place === activePlace);
  $('#actionList').innerHTML = actions.length ? actions.map((id) => {
    const action = game.getAction(state, id);
    const profile = game.getActionInvestment(state, id);
    const amount = actionDraft(id);
    const preview = profile && game.previewActionInvestment(state, id, amount);
    const check = game.availability(state, id, amount);
    return '<article class="action-card"><div class="action-card-top"><h3>' + h(action.title) + '</h3><span class="action-count">' + (action.limit ? '本学期 ' + (state.counts[id] || 0) + ' / ' + action.limit + ' 次' : action.chain ? '事件链行动' : '按剩余时间安排') + '</span></div><p>' + h(profile ? profile.description : action.description) + '</p>' + (action.backgroundBonus ? '<p class="background-bonus">背景特点：' + h(action.backgroundBonus) + '</p>' : '') + (profile ? investmentControls({ id }, profile, { amount }, 'action') : '') + '<div class="action-cost" id="investment-cost-action-' + id + '">' + h(costs(preview?.ok ? preview.effect : game.fitnessAdjustedEffect(state, action, id))) + '</div>' + (action.hint ? '<p class="action-hint">' + h(action.hint) + '</p>' : '') + '<button type="button" id="action-choice-' + id + '" data-action="' + id + '" data-revision="' + state.revision + '" ' + (!check.ok || uiLocked ? 'disabled' : '') + '>' + (action.minigame ? '开始' : '确认') + h(action.title) + '</button><div class="action-reason" id="investment-reason-action-' + id + '">' + (check.ok ? '' : h(check.reason)) + '</div></article>';
  }).join('') : '<div class="unavailable-card"><h3>这里暂时没有可做的事</h3><p>去别的地方逛逛吧。</p></div>';
  if (game.getRelationships(state).zhouNing) $('#actionList').innerHTML += '<article class="action-card relationship-library-card"><h3>约周宁一起</h3><p>在这里也可以联系周宁，一起参加活动，或者先聊聊近况。</p><button type="button" data-zhou-open="1">联系周宁</button></article>';
}
function renderRelationshipsPanel() {
  const list = $('#relationshipList');
  if (!list) return;
  const relation = state && game.getRelationships(state);
  const person = relation?.zhouNing;
  if (!person) {
    list.innerHTML = '<div class="relationship-empty"><b>故事从一次自习开始</b><p>去图书馆完成第一次自主学习，就会认识与你选了同一门课的周宁。</p><p>建立联系后，可以在这里找到对方，共同学习、积累经历。</p></div>';
    return;
  }
  const stage = game.relationshipRules.stage(person.familiarity);
  const available = game.zhouNingAvailability(state, 'presentation', undefined, 2).ok;
  const abilities = game.relationshipRules.abilities(state);
  list.innerHTML = '<article class="relationship-card"><div class="relationship-card-head"><span class="relationship-avatar">' + '<img src="' + game.relationshipRules.ZHOU_NING.portrait + '" alt="周宁">' + '</span><div><b>周宁</b><small>男 · 同年级同学 · 图书馆</small></div><span class="relationship-stage">' + h(stage.label) + '</span></div><label class="relationship-progress-label">相识度 <b>' + person.familiarity + ' / 100</b></label><progress class="relationship-progress" max="100" value="' + person.familiarity + '"></progress><p>' + h(game.relationshipRules.dialogue(state)) + '</p>' + (available ? '<p class="relationship-new">新事件：周宁想请你陪他练习课程展示</p>' : '') + '<p class="relationship-abilities">学业 ' + abilities.academic + ' · 社交 ' + abilities.social + ' · 运动 ' + abilities.sport + '</p><p class="relationship-quota">本学期同行 ' + relation.interactions + ' / 4 · 认真交流 ' + relation.talks + ' / 2</p><button type="button" class="utility-button" data-zhou-open="1">查看人物与互动</button></article>';
}
function vnChoice(label, command, extra = {}, note = '', disabled = false) {
  return { label, note, disabled: disabled || ((uiLocked || zhouRequest) && ['deepTalk', 'presentation', 'confirmActivity', 'acceptProposal', 'declineProposal', 'prompt'].includes(command)), attributes: { 'data-vn-ui': command, 'data-revision': state.revision, ...extra } };
}
function showVisualNovel(mode, title, speech, choices, options = {}) {
  const rules = game.relationshipRules;
  const relation = game.getRelationships(state);
  const person = relation.zhouNing;
  const status = rules.status(state);
  const scenePlace = options.place || (zhouView.screen === 'activity' ? game.ACTIONS[zhouView.activity]?.place : activePlace) || status.lastPlace || 'library';
  const memories = person ? person.memories.map(id => rules.MEMORIES[id]).filter(Boolean) : [];
  const body = CampusCharacterScene.render({ profile: rules.ZHOU_NING, met: !!person, familiarity: person?.familiarity || 0,
    stage: person ? rules.stage(person.familiarity).label : '初次见面', location: (game.PLACES[scenePlace]?.title || '校园里') + ' · 与周宁',
    abilities: rules.abilities(state), status: status.moodLabel + ' · ' + status.energyLabel, profileOpen: zhouView.profileOpen,
    goal: person?.presentation ? '多参加一些校园活动，也想听听你的未来打算。' : rules.ZHOU_NING.goal,
    memories, speech, choices, canClose: options.canClose ?? mode !== 'event', choiceTitle: options.choiceTitle,
    chat: mode === 'relationship', busy: !!zhouRequest || uiLocked, draft: zhouChatDraft, historyOpen: zhouHistoryOpen, messages: game.characterAgent.read(state).messages,
    detail: options.detail || ('时间 ' + state.time + ' · 精力 ' + state.energy + ' · 钱包 ' + state.money + ' 元。同行 ' + relation.interactions + '/4，深入交流 ' + relation.talks + '/2。') });
  lastVisualNovel = { mode, title, speech, choices, options };
  showDialog(mode, title, body, options.footerButtons || []);
  dialog.classList.add('is-vn');
}
function showZhouNing(options = {}) {
  if (!state || !game.getRelationships(state).zhouNing) return;
  closePanel();
  if (!options.preserve) zhouView = { screen: 'home', group: 'life', activity: 'selfStudy', amount: undefined, profileOpen: false, text: null };
  if (options.text) zhouView.text = options.text;
  const rules = game.relationshipRules;
  const person = game.getRelationships(state).zhouNing;
  const agent = game.characterAgent.read(state);
  let speech = zhouView.text || agent.messages.filter(item => item.role === 'assistant').at(-1)?.content || rules.dialogue(state);
  let choiceTitle = '你想怎么回应？';
  let detail = state.phase !== 'playing' ? '请先完成当前事件、考试或学期流程。现在仍可以和周宁闲聊。' : undefined;
  let choices;
  if (zhouView.screen === 'groups') {
    speech = '今天想做点什么？学习、运动、看演出，或者一起去校园里转转，都可以。';
    choices = Object.entries(ZHOU_GROUPS).map(([id, label]) => vnChoice(label, 'group', { 'data-vn-group': id }));
    choices.push(vnChoice('先聊点别的', 'home'));
  } else if (zhouView.screen === 'activities') {
    speech = '你来选吧。我把自己的安排也理一理，能一起去的我们就一起出发。';
    choiceTitle = ZHOU_GROUPS[zhouView.group];
    choices = Object.entries(rules.ACTIVITIES).filter(([, activity]) => activity.group === zhouView.group).map(([id, activity]) => {
      const check = game.companionAvailability(state, id);
      return vnChoice(activity.label, 'activity', { 'data-vn-activity': id }, check.ok ? (game.PLACES[game.ACTIONS[id].place]?.title || '') : check.reason, !check.ok);
    });
    choices.push(vnChoice('换一种安排', 'groups'));
  } else if (zhouView.screen === 'activity') {
    const id = zhouView.activity;
    const activity = rules.ACTIVITIES[id];
    const action = game.getAction(state, id);
    const profile = game.getActionInvestment(state, id);
    const amount = zhouView.amount ?? profile?.default;
    const preview = profile && game.previewActionInvestment(state, id, amount);
    const check = game.companionAvailability(state, id, amount);
    speech = check.ok ? activity.reply : check.reason;
    choiceTitle = activity.label;
    detail = costs(preview?.effect || game.fitnessAdjustedEffect(state, action, id)) + '。只结算一次原活动成本。';
    choices = profile ? profile.tiers.map(tier => ({ ...vnChoice(tier.label, 'tier', { 'data-vn-amount': tier.amount }, costs(game.previewActionInvestment(state, id, tier.amount).effect)), selected: tier.amount === amount })) : [];
    choices.push(vnChoice(action.minigame ? '一起去球场，开始投篮' : '就这样安排，一起出发', 'confirmActivity', {}, check.ok ? '确认后进行活动，再记录这段共同经历。' : check.reason, !check.ok));
    choices.push(vnChoice('再看看别的活动', 'backActivities'));
  } else if (zhouView.screen === 'topics') {
    choices = [vnChoice('你平时喜欢做什么？', 'topic', { 'data-vn-topic': 'likes' }), vnChoice('最近有什么烦恼？', 'topic', { 'data-vn-topic': 'goal' }), vnChoice('你今天状态怎么样？', 'topic', { 'data-vn-topic': 'care' })];
    const check = game.zhouNingAvailability(state, 'talk');
    choices.push(vnChoice('认真交流', 'deepTalk', { 'data-dialog-action': 'zhouTalk' }, check.ok ? '留一点精力认真倾听 · 精力 −2' : check.reason, !check.ok));
    choices.push(vnChoice('一起做点什么吧', 'groups'), vnChoice('回到刚才的话题', 'home'));
  } else {
    if (agent.proposal) {
      const id = agent.proposal.id;
      const check = id === 'presentation' ? game.zhouNingAvailability(state, 'presentation', undefined, 2) : game.companionAvailability(state, id);
      const action = id === 'presentation' ? null : game.getAction(state, id);
      const profile = action && game.getActionInvestment(state, id);
      const preview = profile && game.previewActionInvestment(state, id, profile.default);
      const note = !check.ok ? check.reason : id === 'presentation' ? '先听听他的请求，选择练习方式后才结算。' : costs(preview?.effect || game.fitnessAdjustedEffect(state, action, id));
      choices = [vnChoice(id === 'presentation' ? '好，说说你的展示吧' : '好，' + rules.ACTIVITIES[id].label, 'acceptProposal', { 'data-proposal-revision': agent.proposal.createdRevision }, note, !check.ok), vnChoice('今天先不了，改天吧', 'declineProposal', { 'data-proposal-revision': agent.proposal.createdRevision }), vnChoice('我想再问问', 'prompt', { 'data-vn-prompt': '你为什么想约我做这件事？' })];
      detail = note + '。可以直接回复“好，走吧”或“改天吧”，也可以继续聊。';
    } else {
      choices = [vnChoice('你最近过得怎么样？', 'prompt', { 'data-vn-prompt': '你最近过得怎么样，有没有什么想做的事？' }), vnChoice('我想和你出去走走', 'prompt', { 'data-vn-prompt': '我想和你出去走走，一起散步好吗？' }), vnChoice('一起安排活动', 'groups'), vnChoice('人物与共同经历', 'profile')];
      if (state.phase === 'playing') detail = '可以自由聊天、提出邀请，也可以听听他的想法。聊天不扣时间或精力；同类话题不会反复增加相识度。';
    }
  }
  if (zhouRequest) detail = '周宁正在回复，稍等一下……';
  else if (zhouChatNotice) detail = zhouChatNotice + ' ' + (detail || '');
  showVisualNovel('relationship', '周宁 · 校园日常', speech, choices, { detail, choiceTitle, place: options.place, footerButtons: [{ id: 'resume', text: '继续安排', secondary: true }] });
}
function cancelZhouRequest() {
  zhouRequestSequence++;
  zhouRequest?.controller?.abort();
  zhouRequest = null;
}
function answerZhouProposal(answer, proposalRevision) {
  if (!state || uiLocked || zhouRequest) return;
  const proposal = game.characterAgent.read(state).proposal;
  if (!proposal || proposal.createdRevision !== Number(proposalRevision)) { showToast('邀请已经更新，请重新查看'); return; }
  if (answer === 'accept' && proposal.id === 'basketball') { startBasketball({ companionId: 'zhouNing', agentProposalRevision: proposal.createdRevision }); return; }
  const result = runCommand('resolveZhouNingProposal', answer, state.revision, undefined, undefined, { proposalRevision: proposal.createdRevision });
  if (!result) return;
  acknowledgedResultRevision = state.revision;
  zhouView.text = null;
  if (answer === 'decline') showZhouNing({ preserve: true });
  else if (state.pendingEvent?.id === 'zhouNingPresentation') showEvent();
  else if (result.entry.relationship) showEventResult(result.entry);
  else resumePhase();
}
async function sendZhouChat(message) {
  if (!state || dialogMode !== 'relationship' || zhouRequest || uiLocked) return;
  const text = String(message ?? $('#zhouChatInput')?.value ?? '').trim();
  if (!text || text.length > 240) return;
  if (game.characterAgent.read(state).chats >= 120) { showToast('这学期已经聊了很久，先去经历一些新的校园生活吧'); return; }
  const proposal = game.characterAgent.read(state).proposal;
  const answer = proposal && game.characterAgent.consent(text);
  if (answer) { zhouChatDraft = ''; answerZhouProposal(answer, proposal.createdRevision); return; }
  const snapshot = state;
  const sequence = ++zhouRequestSequence;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  zhouRequest = { controller };
  zhouChatDraft = '';
  zhouChatNotice = '';
  zhouView.screen = 'home';
  zhouView.text = null;
  showZhouNing({ preserve: true });
  const timer = controller ? setTimeout(() => controller.abort(), game.AI_CHAT.timeoutMs || 15000) : null;
  const decision = await game.characterAgent.request({ state: snapshot, text, candidates: game.zhouNingCandidates(snapshot), relay: game.AI_CHAT.relay, fetchFn: typeof fetch === 'function' ? fetch : null, signal: controller?.signal });
  if (timer !== null) clearTimeout(timer);
  if (sequence !== zhouRequestSequence) return;
  zhouRequest = null;
  if (state !== snapshot || dialogMode !== 'relationship' || !dialog.open) { zhouChatDraft = text; return; }
  const result = runCommand('recordZhouNingDialogue', { kind: 'chat', text, ...decision }, snapshot.revision);
  if (!result) { zhouChatDraft = text; showZhouNing({ preserve: true }); return; }
  acknowledgedResultRevision = state.revision;
  zhouChatNotice = decision.source === 'local' ? '在线对话暂时没连上，先继续本地对话。' : result.entry.dialogue.gained ? '你们又多了解了彼此一点 · 相识度 +' + result.entry.dialogue.gained + '。' : '';
  showZhouNing({ preserve: true });
}
async function maybeZhouNingDirector() {
  if (!state || zhouRequest || uiLocked || basketballSession || typeof fetch !== 'function' || needsCourseSelection()) return;
  const occasion = game.zhouNingOpportunity(state);
  if (!occasion || (dialog.open && dialogMode !== 'event')) return;
  const snapshot = state;
  const sequence = ++zhouRequestSequence;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  zhouRequest = { controller };
  const timer = controller ? setTimeout(() => controller.abort(), game.AI_CHAT.timeoutMs || 15000) : null;
  const decision = await game.characterAgent.request({ state: snapshot, candidates: occasion.candidates, occasion, relay: game.AI_CHAT.relay, fetchFn: fetch, signal: controller?.signal });
  if (timer !== null) clearTimeout(timer);
  if (sequence !== zhouRequestSequence) return;
  zhouRequest = null;
  if (state !== snapshot || basketballSession || (dialog.open && dialogMode !== 'event')) {
    if (state && dialog.open && dialogMode === 'relationship') showZhouNing({ preserve: true });
    return;
  }
  const result = runCommand('recordZhouNingDialogue', { kind: occasion.kind, text: '', ...decision, trigger: occasion.key }, snapshot.revision);
  if (!result) return;
  acknowledgedResultRevision = state.revision;
  if (occasion.kind === 'cameo') showEvent();
  else { zhouChatNotice = decision.source === 'local' ? '在线对话暂时没连上，先继续本地对话。' : ''; showZhouNing({ text: decision.say, place: occasion.place }); }
}
function showRelationshipResult(entry) {
  const result = entry.relationship;
  const assessment = result.assessment;
  const title = entry.outcome || (result.kind === 'meet' ? '你认识了周宁' : result.kind === 'activity' ? entry.title : '与周宁的近况');
  const detail = (result.kind === 'meet' ? '你与周宁建立了联系。' : '') + '相识度 +' + result.gained + ' · 当前 ' + result.familiarity + '/100。' + changeText(entry.changes)
    + (assessment?.formula === 'player' ? '。本次表现由你的学业、社交和心情决定。' : assessment ? '。本次配合：相识度 ' + assessment.familiarity + ' × 50% + 社交 ' + assessment.social + ' × 30% + 心情 ' + assessment.mood + ' × 20%，四舍五入后为 ' + assessment.score + '。' : '') + supportText(entry);
  const presentationLines = { good: '刚才有你在旁边接着我的话，我真的没那么紧张了。正式展示那天，我应该也能做到。谢谢你陪我练这一遍。', steady: '重新把顺序理出来以后，好像真的能讲清楚了。我回去再练几遍，这次没那么怕上台了。', limited: '刚才我还是有些地方讲不清，不过至少知道该补什么了。谢谢你陪我开口试这一遍，我再准备准备。', encouraged: '原来讲错一句，也可以接着往下讲。谢谢你没有催我，能把第一段讲完，我已经很开心了。' };
  const text = result.kind === 'meet' ? '认识你很高兴。除了学习，我也喜欢打球、散步和看演出。下次有空，我们一起去做点什么吧？' : result.kind === 'activity' ? game.relationshipRules.afterActivity(result.activityId) : result.kind === 'presentation' ? presentationLines[result.level] : result.description;
  showVisualNovel('relationshipResult', title, text, [vnChoice(state.pendingEvent ? '继续处理事件' : '查看人物关系', 'continue')], { detail, footerButtons: [{ id: 'relationshipContinue', text: state.pendingEvent ? '继续处理事件' : '查看人物关系' }] });
}
function renderBasketballHud(info) {
  const time = Math.max(0, Math.ceil((info.timeLeft || 0) / 1000));
  const timeNode = $('#basketballTime');
  const scoreNode = $('#basketballScore');
  const hitsNode = $('#basketballHits');
  if (timeNode) timeNode.textContent = String(time);
  if (scoreNode) scoreNode.textContent = String(info.score || 0);
  if (hitsNode) hitsNode.textContent = String(info.hits || 0);
}
function closeBasketballDialog() {
  if ($('#basketballCompanionNotice')) $('#basketballCompanionNotice').hidden = true;
  if (basketballDialog && basketballDialog.open) {
    try { basketballDialog.close(); } catch (_) { basketballDialog.removeAttribute('open'); }
  }
}
function cancelBasketball() {
  basketballSession?.destroy();
  basketballSession = null;
  basketballCompanion = null;
  closeBasketballDialog();
}
function startBasketball(options = {}) {
  const companion = options.companionId === 'zhouNing';
  if (!state || state.phase !== 'playing' || basketballSession || (!companion && (activePlace !== 'track' || dialog.open))) return;
  const check = companion ? game.companionAvailability(state, 'basketball') : game.availability(state, 'basketball');
  if (!check.ok) { showToast(check.reason); return; }
  if (!basketballGame) { showToast('当前浏览器不支持投篮小游戏'); return; }
  try {
    basketballSession = basketballGame.createSession({
      canvas: $('#basketballCanvas'),
      durationMs: game.BASKETBALL.durationMs,
      maxHits: game.BASKETBALL.maxHits,
      pointsPerHit: game.BASKETBALL.pointsPerHit,
      onTick: renderBasketballHud,
      onScore: () => audio?.play('success'),
      onFinish: finishBasketball
    });
    basketballCompanion = companion ? { companionId: 'zhouNing', characterVersion: 2, revision: state.revision, ...(options.agentProposalRevision !== undefined ? { agentProposalRevision: options.agentProposalRevision } : {}) } : null;
    if ($('#basketballCompanionNotice')) $('#basketballCompanionNotice').hidden = !companion;
    if (companion) dialog.close();
    if (basketballDialog && !basketballDialog.open) basketballDialog.showModal();
    basketballSession.start();
    renderBasketballHud({ hits: 0, score: 0, timeLeft: game.BASKETBALL.durationMs });
    $('#basketballCanvas')?.focus();
    audio?.play('sport');
  } catch (error) {
    basketballSession?.destroy();
    basketballSession = null;
    basketballCompanion = null;
    closeBasketballDialog();
    showToast(error?.message || '投篮小游戏启动失败');
  }
}
function finishBasketball(result) {
  if (!basketballSession) return;
  const session = basketballSession;
  basketballSession = null;
  session.destroy();
  closeBasketballDialog();
  const companion = basketballCompanion;
  basketballCompanion = null;
  const commandResult = runCommand('completeBasketball', result.hits, companion?.revision ?? state.revision, undefined, undefined, companion || {});
  if (!commandResult) return;
  audio?.play('success');
  $('#actionFeedback').textContent = '本局命中 ' + result.hits + ' 球，得分 ' + result.score + '。' + changeText(commandResult.changes);
  showBasketballResult(commandResult.entry);
}
function showBasketballResult(entry) {
  if (entry.relationship) {
    showVisualNovel('basketballResult', '与周宁的球场日常', entry.hits ? '刚才那个球进得漂亮！我把球捡回来时，你都准备好下一次出手了。下次有空再来？' : '今天的手感还没找到也没关系。我们已经一起跑出一身汗了，下次再慢慢练。', [vnChoice('查看人物关系', 'continue')], { place: 'track', detail: '命中 ' + entry.hits + ' 球 · ' + entry.score + ' 分。相识度 +' + entry.relationship.gained + '。' + changeText(entry.changes) + '。' + supportText(entry), footerButtons: [{ id: 'basketballContinue', text: '继续安排' }] });
    return;
  }
  const tier = entry.tierLabel || game.BASKETBALL.rewards.find((item) => item.id === entry.tier)?.label || '投篮结算';
  showDialog('basketballResult', '球场结算', '<div class="basketball-result"><p class="basketball-result-score"><b>' + entry.score + '</b> 分</p><p>命中 <b>' + entry.hits + '</b> 球 · ' + h(tier) + '</p><div class="basketball-result-change">' + h(changeText(entry.changes)) + '</div><p class="dialog-note">本局结果已记入成长记录，下一球从零开始。</p></div>', [{ id: 'basketballContinue', text: '继续安排' }]);
}
// 地点插画：按建筑名取 assets/places 下对应的矢量图；锚点与地图热点坐标一致。
const PLACE_ART = {
  activity: 'assets/places/activity.svg',
  think: 'assets/places/think.svg',
  library: 'assets/places/library.svg',
  hospital: 'assets/places/hospital.svg',
  gate: 'assets/places/gate.svg',
  track: 'assets/places/track.svg',
  auditorium: 'assets/places/auditorium.svg',
  ginkgo: 'assets/places/ginkgo.svg',
  yifu: 'assets/places/yifu.svg',
  dorm: 'assets/places/dorm.svg',
  hotel: 'assets/places/hotel.svg'
};
// 用点击的建筑位置作为整屏展开的圆心；拿不到位置时退回屏幕中心。
function placeRevealOrigin(hotspot) {
  try {
    if (hotspot && typeof hotspot.getBoundingClientRect === 'function' && typeof window !== 'undefined' &&
        Number.isFinite(window.innerWidth) && window.innerWidth > 0 && Number.isFinite(window.innerHeight) && window.innerHeight > 0) {
      const rect = hotspot.getBoundingClientRect();
      if (rect && Number.isFinite(rect.left) && Number.isFinite(rect.top) && rect.width > 0) {
        return {
          x: (rect.left + rect.width / 2) / window.innerWidth * 100,
          y: (rect.top + rect.height / 2) / window.innerHeight * 100
        };
      }
    }
  } catch (_) {}
  return null;
}
function showPlaceArt(key, hotspot) {
  const src = PLACE_ART[key];
  if (!src) return;
  const placeImage = $('#placeArtImage');
  if (placeImage) placeImage.setAttribute('src', src);
  const placeScreen = $('#placeScreen');
  const origin = placeRevealOrigin(hotspot);
  if (placeScreen && placeScreen.style && typeof placeScreen.style.setProperty === 'function') {
    if (origin) {
      placeScreen.style.setProperty('--ox', origin.x.toFixed(2) + '%');
      placeScreen.style.setProperty('--oy', origin.y.toFixed(2) + '%');
    } else {
      placeScreen.style.removeProperty('--ox');
      placeScreen.style.removeProperty('--oy');
    }
  }
}
// 锁定页面滚动时补偿滚动条宽度，避免布局横向跳动（地图"甩一下"的来源）。
function lockBodyScroll() {
  try {
    if (typeof document !== 'undefined' && document.body && document.body.style) {
      const root = document.documentElement;
      const gap = (root && Number.isFinite(root.clientWidth) && Number.isFinite(window?.innerWidth))
        ? Math.max(0, window.innerWidth - root.clientWidth) : 0;
      if (gap > 0) document.body.style.paddingRight = gap + 'px';
      lockBodyScroll();
    }
  } catch (_) {}
}
function unlockBodyScroll() {
  try {
    if (typeof document !== 'undefined' && document.body && document.body.style) {
      unlockBodyScroll();
      document.body.style.paddingRight = '';
    }
  } catch (_) {}
}
function openPlace(key, hotspot) {
  if (!state || basketballSession) return;
  closePanel();
  closePopovers();
  if (state.phase !== 'playing') { resumePhase(); return; }
  if (!Object.hasOwn(game.PLACES, key)) return;
  audio?.play(PLACE_SOUNDS[key]);
  activePlace = key;
  lastHotspot = hotspot;
  $('#placeTitle').textContent = game.PLACES[key].title;
  $('#placeKicker').textContent = '主校区 · ' + game.PLACES[key].kicker;
  $('#placeDescription').textContent = game.PLACES[key].description;
  $('#actionFeedback').textContent = '先安排投入，再决定行动。完成之后，会记下这次发生的事。';
  hotspots.forEach((item) => item.classList.toggle('is-active', item.dataset.place === key));
  // 以点击的建筑为圆心，把整屏背景展开成该建筑的插画。
  showPlaceArt(key, hotspot);
  // 过场动画：地图聚焦压暗离场，场所屏入场时内容错落升起；入场标记随后清理，避免每次行动重绘都重播动画。
  $('#mapScreen').classList.add('is-leaving');
  const placeScreen = $('#placeScreen');
  placeScreen.classList.add('is-open');
  placeScreen.classList.add('is-entering');
  if (typeof clearTimeout === 'function') clearTimeout(placeEnterTimer);
  if (typeof setTimeout === 'function') placeEnterTimer = setTimeout(() => placeScreen.classList.remove('is-entering'), 1300);
  placeScreen.setAttribute('aria-hidden', 'false');
  placeScreen.inert = false;
  $('#mapScreen').inert = true;
  lockBodyScroll();
  renderState();
  $('#backButton').focus();
}
function closePlace() {
  const placeScreen = $('#placeScreen');
  placeScreen.classList.remove('is-open');
  placeScreen.classList.remove('is-entering');
  if (typeof clearTimeout === 'function') clearTimeout(placeEnterTimer);
  $('#mapScreen').classList.remove('is-leaving');
  placeScreen.setAttribute('aria-hidden', 'true');
  placeScreen.inert = true;
  $('#mapScreen').inert = false;
  hotspots.forEach((item) => item.classList.remove('is-active'));
  unlockBodyScroll();
  activePlace = null;
  if (!dialog.open) lastHotspot?.focus();
}
function resetNpcSystem() {
  if (!npc) return;
  npcSystem = npc.createSystem({ random: () => Math.random() });
  npcFades.clear();
  npcTalkIndex.clear();
  npcChatLogs.clear();
  npcTalking = null;
  for (const node of npcNodes.values()) node.remove();
  npcNodes.clear();
  const layer = $('#npcLayer');
  if (layer) layer.innerHTML = '';
}
function npcDisplayList() {
  const entries = [];
  if (npcSystem && state) for (const npc of npcSystem.active()) entries.push({ npc, fading: false });
  if (state && game.getRelationships(state).zhouNing) entries.push({ npc: { id: 'zhouNing', label: '周宁 · 已认识', figure: 'student', x: 70, y: 47 }, fading: false });
  const now = Date.now();
  for (const [id, entry] of npcFades) {
    if (now - entry.since >= 700) npcFades.delete(id);
    else entries.push({ npc: entry.npc, fading: true });
  }
  return entries;
}
function renderNpcLayer() {
  const layer = $('#npcLayer');
  if (!layer) return;
  if (typeof document.createElement !== 'function') {
    // 没有节点构造能力的环境（自动化测试）：输出等价的文本标记。
    layer.innerHTML = npcDisplayList().map((entry) => '<button class="npc-figure' + (entry.fading ? ' is-fading' : '') + '" data-npc-id="' + entry.npc.id + '">' + npcFigureSvg(entry.npc.figure) + '<span class="npc-label">' + h(entry.npc.label) + '</span></button>').join('');
    return;
  }
  const wanted = new Set();
  for (const entry of npcDisplayList()) {
    wanted.add(entry.npc.id);
    let node = npcNodes.get(entry.npc.id);
    if (!node) {
      node = document.createElement('button');
      node.type = 'button';
      node.className = 'npc-figure';
      node.dataset.npcId = entry.npc.id;
      node.setAttribute('aria-label', '和' + entry.npc.label + '搭话');
      node.innerHTML = npcFigureSvg(entry.npc.figure) + '<span class="npc-label">' + h(entry.npc.label) + '</span>';
      layer.appendChild(node);
      npcNodes.set(entry.npc.id, node);
      // 离场淡出：先按不透明插入，强制一次布局后再加淡出类，让过渡动起来。
      if (entry.fading) {
        try { node.getBoundingClientRect(); } catch (_) {}
        node.classList.add('is-fading');
      }
    }
    node.style.left = entry.npc.x + '%';
    node.style.top = entry.npc.y + '%';
    if (entry.fading) node.classList.add('is-fading');
    else node.classList.remove('is-fading');
  }
  for (const [id, node] of npcNodes) {
    if (wanted.has(id)) continue;
    node.remove();
    npcNodes.delete(id);
  }
}
function npcTick() {
  if (npcSystem && state) {
    const events = npcSystem.tick(Date.now());
    for (const removed of events.removed) {
      npcFades.set(removed.id, { npc: removed, since: Date.now() });
      npcChatLogs.delete(removed.id);
      npcTalkIndex.delete(removed.id);
      if (npcTalking?.id === removed.id) {
        npcTyping = false;
        npcTalking = null;
        if (dialogMode === 'npc') {
          dialog.close();
          dialogMode = null;
          showToast(removed.label + '已经离开了。');
        }
      }
    }
  }
  renderNpcLayer();
  if (typeof setTimeout === 'function') npcTimer = setTimeout(npcTick, 300);
}
function talkToNpc(npcId) {
  if (npcId === 'zhouNing' && state && !dialog.open) { showZhouNing(); return; }
  if (!npcSystem || !state || dialog.open) return;
  const found = npcSystem.active().find((item) => item.id === npcId);
  if (!found) return;
  npcTalking = { id: found.id, identityId: found.identityId, label: found.label, figure: found.figure };
  audio?.play('npc');
  showNpcChat();
}
// 聊天窗口：点击即打开，开场白进历史，气泡式展示；配置了在线中转时输入直接走云函数，失败自动回退本地台词。
// playing 阶段每条消息走规则命令 chatWithNpc：扣精力（学期内每身份首聊再扣时间），按对话质量加社交/心情，
// 学长学姐和老师还能指点学习进度；其他阶段纯闲聊，不消耗资源。
function showNpcChat() {
  npcTyping = false;
  // 清掉已离场人物的聊天记录，控制总量；每条对话保留最近 12 条消息。
  if (npcSystem) {
    const activeIds = new Set(npcSystem.active().map((item) => item.id));
    for (const id of [...npcChatLogs.keys()]) if (!activeIds.has(id)) npcChatLogs.delete(id);
  }
  let history = npcChatLogs.get(npcTalking.id);
  if (!history) {
    const lines = npc.linesFor(npcTalking.identityId);
    history = [{ role: 'assistant', content: lines[0] }];
    npcChatLogs.set(npcTalking.id, history);
    npcTalkIndex.set(npcTalking.id, 1);
  }
  const chatForm = '<form id="npcChatForm" class="npc-chat-form"><div class="npc-chat-row"><input id="npcChatInput" maxlength="200" placeholder="说点什么…" autocomplete="off"><button type="submit" class="utility-button">发送</button></div></form>';
  showDialog('npc', npcTalking.label, '<div class="npc-chat"><div class="npc-chat-history" id="npcChatHistory">' + renderNpcHistory(history) + '</div>' + chatForm + '<p class="dialog-note">校园里的人会随机出现。聊天每句花 1 点精力；学期内第一次和某个人搭话花 1 点时间（整学期最多 2 点）。聊得好能涨社交和心情，学长学姐和老师的指点还能加学习进度。事件、考试和总结期间只能闲聊，不消耗资源；离开后聊天记录会清空。</p></div>', [{ id: 'npcLeave', text: '退出聊天', secondary: true }]);
  scrollNpcChat();
}
function npcBubbleMarkup(message) {
  if (message.role === 'user') return '<div class="npc-msg is-me"><div class="npc-bubble">' + h(message.content) + '</div></div>';
  return '<div class="npc-msg"><span class="npc-avatar">' + npcFigureSvg(npcTalking.figure) + '</span><div class="npc-bubble">' + h(message.content) + '</div></div>';
}
function npcTypingMarkup() {
  return '<div class="npc-msg"><span class="npc-avatar">' + npcFigureSvg(npcTalking.figure) + '</span><div class="npc-bubble is-typing">对方正在输入…</div></div>';
}
function renderNpcHistory(history) {
  return (history || []).map(npcBubbleMarkup).join('');
}
function updateNpcHistory() {
  const node = document.querySelector('#npcChatHistory');
  if (!node) return;
  const history = npcTalking ? (npcChatLogs.get(npcTalking.id) || []) : [];
  node.innerHTML = renderNpcHistory(history) + (npcTyping ? npcTypingMarkup() : '');
  scrollNpcChat();
}
function scrollNpcChat() {
  const node = document.querySelector('#npcChatHistory');
  if (node) { try { node.scrollTop = node.scrollHeight; } catch (_) {} }
}
// 在线对话的玩家背景速写，随学期推进变化，让人物回答更贴合当前处境。
function npcPlayerContext() {
  if (!state) return '一名新生';
  const grades = state.courses.filter((item) => item.passed).length;
  const stage = ({ eventPending: '正在处理校园事件', summary: '正在看学期总结', endingChoice: '正在做毕业方向选择', finished: '已经毕业' })[state.phase] || '正常校园生活';
  return '昵称' + state.nickname + '，' + (state.background ? state.background.major : '') + '专业，' + game.TERM_NAMES[state.courses.length - 1] + '，已通过' + grades + '学期成绩，深造准备' + state.furtherStudy + '，求职准备' + state.jobPreparation + '，' + stage;
}
async function sendNpcChat() {
  if (!npcTalking || dialogMode !== 'npc') return;
  const talking = npcTalking;
  const input = $('#npcChatInput');
  const text = String(input?.value || '').trim();
  if (!text) { input?.focus(); return; }
  if (state && game.isSick(state)) { showToast(game.ILLNESS_REASON); audio?.play('deny'); input?.focus(); return; }
  // playing 阶段聊天要扣资源：先按规则模块预检，不通过就不发这条消息（不写日志、不扣费、输入保留）。
  if (state && state.phase === 'playing') {
    const precheck = game.npcChatAvailability(state, talking.identityId);
    if (!precheck.ok) { showToast(precheck.reason); audio?.play('deny'); input?.focus(); return; }
  }
  const history = npcChatLogs.get(talking.id) || [];
  history.push({ role: 'user', content: text });
  npcChatLogs.set(talking.id, history.slice(-12));
  if (input) input.value = '';
  updateNpcHistory();
  const relay = game.AI_CHAT && game.AI_CHAT.relay;
  const online = !!relay && typeof fetch === 'function';
  const sendButton = $('#npcChatForm button[type="submit"]');
  const buttonText = sendButton ? sendButton.textContent : '';
  if (input) input.disabled = true;
  if (sendButton) { sendButton.disabled = true; sendButton.textContent = '对方正在输入…'; }
  if (online) { npcTyping = true; updateNpcHistory(); }
  let controller = null;
  let timeoutTimer = null;
  if (online && typeof AbortController !== 'undefined') {
    controller = new AbortController();
    timeoutTimer = setTimeout(() => controller.abort(), (game.AI_CHAT && game.AI_CHAT.timeoutMs) || 15000);
  }
  let reply = null;
  let relayQuality = null;
  if (online) {
    try {
      const persona = npc.IDENTITIES.find((item) => item.id === talking.identityId);
      const messages = [
        { role: 'system', content: '你是《北交人生》校园游戏地图上的一位NPC：' + talking.label + '。用中文回答，两三句以内，口语化，符合你的身份。不要用列表和表情包，不要透露你是AI。你常说的话例如：' + persona.lines.join('') + '。另外，每次回复的最后一行单独输出对方这句话的对话质量标记，格式必须是【Q:0】【Q:1】【Q:2】之一：0=敷衍或无关，1=正常礼貌，2=真诚具体、对对方有帮助。' },
        { role: 'system', content: '正在和你说话的是北京交通大学的学生：' + npcPlayerContext() },
        ...history.slice(-12)
      ];
      const response = await fetch(relay, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages }), signal: controller ? controller.signal : undefined });
      const data = await response.json();
      const candidate = typeof data?.reply === 'string' ? data.reply.trim() : '';
      if (!response.ok || !candidate) throw new Error('bad relay response');
      reply = candidate;
      relayQuality = Number.isSafeInteger(data?.quality) && data.quality >= 0 && data.quality <= 2 ? data.quality : null;
      $('#dialogNotice').textContent = '';
    } catch (_) {
      // 中转不可达或服务异常：回退本地台词，聊天不中断。
      reply = null;
      $('#dialogNotice').textContent = '在线对话通道没连上，先用本地台词聊吧。';
    } finally {
      if (timeoutTimer !== null) clearTimeout(timeoutTimer);
    }
  }
  if (npcTalking !== talking) return; // 期间换了聊天对象或已退出，不再写入
  // 对话质量（0/1/2）：优先用中转返回的 quality；旧版中转没剥离标记时在前端剥离尾部【Q:n】；都没有用本地启发式。
  let quality = relayQuality;
  const marker = reply === null ? null : reply.match(/【\s*Q[:：]?\s*([012])\s*】\s*$/);
  if (marker) {
    if (quality === null) quality = Number(marker[1]);
    reply = reply.slice(0, marker.index).trimEnd();
  }
  if (!reply) {
    // 本地台词兜底：按发送次数轮换该身份台词库，离线或回复只剩标记时也能聊起来。
    const lines = npc.linesFor(talking.identityId);
    const index = npcTalkIndex.get(talking.id) || 0;
    npcTalkIndex.set(talking.id, index + 1);
    reply = lines[index % lines.length];
  }
  if (quality === null) quality = npc.heuristicQuality(text);
  npcTyping = false;
  history.push({ role: 'assistant', content: reply });
  npcChatLogs.set(talking.id, history.slice(-12));
  updateNpcHistory();
  // playing 阶段这条消息走规则入口：扣精力（首聊再扣时间），按质量加社交、心情，学业身份另有学习进度。
  if (state && state.phase === 'playing') {
    const result = runCommand('chatWithNpc', { identityId: talking.identityId, quality }, state.revision);
    if (result) {
      const notice = $('#dialogNotice');
      const previous = notice.textContent ? notice.textContent + ' ' : '';
      notice.textContent = previous + '这次聊天：' + changeText(result.changes);
    }
  }
  if (input) { input.disabled = false; input.focus(); }
  if (sendButton) { sendButton.disabled = false; sendButton.textContent = buttonText; }
}
function showDialog(mode, title, body, buttons = []) {
  dialog.classList.remove('is-vn');
  dialogMode = mode;
  stopSmsCountdown();
  dialog.classList.toggle('event-dialog', mode === 'event');
  $('.dialog-kicker').textContent = '北交人生 · ' + ({ relationship: '人物关系网', relationshipResult: '共同经历', event: '校园事件', eventResult: '生活回顾', basketballResult: '球场结算', admission: '入学', enrollment: '入学', login: '登录', courseSelection: '开学选课', exam: '期末考试', confirmCheat: '期末考试', confirmEnding: '校园事件', endingChoice: '毕业方向', finished: '四年手账', ended: '本局结束', npc: '校园偶遇' }[mode] || '校园手账');
  $('#dialogTitle').textContent = title;
  $('#dialogNotice').textContent = '';
  $('#dialogBody').innerHTML = body;
  $('#dialogButtons').innerHTML = buttons.map(({ id, text, secondary }) => '<button type="button" data-dialog-action="' + id + '" data-revision="' + (state?.revision || 0) + '" class="' + (secondary ? 'secondary' : '') + '"' + (uiLocked ? ' disabled' : '') + '>' + h(text) + '</button>').join('');
  $('#dialogSave').hidden = !state || ['admission', 'login', 'restart', 'save', 'load', 'confirmSave', 'npc', 'courseSelection', 'confirmCheat', 'confirmEnding'].includes(mode);
  if (!dialog.open) dialog.showModal();
  (dialog.querySelector('input') || $('#dialogTitle')).focus({ preventScroll: true });
  dialog.scrollTop = 0;
}
function lockUi() {
  uiLocked = true;
  clearTimeout(unlockTimer);
  if (activePlace) renderActions();
  dialog.querySelectorAll('[data-dialog-action], [data-event-choice], [data-ending]').forEach((button) => { button.disabled = true; });
  dialog.querySelectorAll('#examForm input, #examForm > button[type="submit"]').forEach((input) => { input.disabled = true; });
  unlockTimer = setTimeout(() => {
    uiLocked = false;
    if (activePlace) renderActions();
    dialog.querySelectorAll('[data-dialog-action]').forEach((button) => { button.disabled = false; });
    dialog.querySelectorAll('[data-event-choice]').forEach((button) => { button.disabled = !game.eventAvailability(state, button.dataset.eventChoice, button.dataset.instance, eventDraft(button.dataset.eventChoice)).ok; });
    dialog.querySelectorAll('[data-ending]').forEach((button) => { button.disabled = !state.endingOptions.options.find((item) => item.id === button.dataset.ending)?.available; });
    dialog.querySelectorAll('#examForm input, #examForm > button[type="submit"]').forEach((input) => { input.disabled = false; });
    if (dialogMode === 'relationship') showZhouNing({ preserve: true });
    else if (!dialog.open || dialogMode === 'event') maybeZhouNingDirector();
  }, 300);
}
function runCommand(operation, id, expectedRevision, eventInstanceId, investment, extraOptions = {}) {
  if (!state || uiLocked) return null;
  const options = { ...extraOptions, commandId: 'ui:' + sessionId + ':' + (++commandSequence), expectedRevision: Number(expectedRevision), eventInstanceId, investment };
  if (['executeAction', 'completeBasketball', 'submitEventChoice', 'resolveZhouNingProposal'].includes(operation)) options.npcSupportVersion = 1;
  if (operation === 'submitEventChoice' && id !== game.SICK_LEAVE_ID && game.characterAgent.read(state).cameo?.instanceId === state.pendingEvent?.instanceId) options.zhouCameo = true;
  const result = ['executeAction', 'completeBasketball', 'submitEventChoice', 'chooseEnding', 'selectCourses', 'updateExamAnswers', 'submitExam', 'chatWithNpc', 'interactWithZhouNing', 'recordZhouNingDialogue', 'resolveZhouNingProposal'].includes(operation) ? game[operation](state, id, options) : game[operation](state, options);
  if (!result.ok) {
    failures.push({ operation, id: id || null, reason: result.reason, state: game.stateBrief(state), expectedRevision: options.expectedRevision });
    audio?.play('deny');
    showToast(result.reason);
    return null;
  }
  state = result.state;
  if (operation !== 'updateExamAnswers') lockUi();
  renderState();
  return result;
}
function saveCurrent(automatic = false, slotId = activeSaveSlot) {
  if (!state) return;
  if (slotId === null) {
    saveNotice = '尚未选择存档栏位，请点击“保存当前进度”选择栏位；当前进度保留在本页。';
    showToast(saveNotice);
    return { ok: false, reason: saveNotice };
  }
  const result = saves.save(state, slotId);
  if (result.ok) {
    activeSaveSlot = slotId;
    savedRevision = state.revision;
    savedAt = result.savedAt;
    saveNotice = result.warning || '已保存到栏位 ' + slotId + ' · ' + displayTime(savedAt);
    audio?.play('save');
    renderState();
    if (!automatic) showToast(result.warning || '已保存到栏位 ' + slotId);
  } else {
    saveNotice = result.reason;
    $('#sessionNote').textContent = result.reason;
    showToast((automatic ? '自动保存未完成：' : '') + result.reason);
  }
  return result;
}
function hasUnsavedProgress() {
  return !!state && state.revision !== savedRevision;
}
function guardUnsavedProgress(event) {
  if (!hasUnsavedProgress()) return;
  event.preventDefault();
  event.returnValue = '';
}
function displayTime(value) { return new Date(value).toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' }); }
function saveInfo(slot) {
  if (slot.ok) return h(slot.state.nickname) + ' · ' + game.TERM_NAMES[slot.state.term - 1] + ' · ' + h(displayTime(slot.savedAt));
  return h(slot.reason);
}
function slotCards(info, mode) {
  return '<div class="save-slot-list">' + info.slots.map(slot => {
    const current = activeSaveSlot === slot.id;
    const description = !slot.ok ? h(slot.reason) : slot.primary.empty ? '空栏位' : saveInfo(slot.primary);
    const controls = mode === 'save'
      ? '<button type="button" data-save-slot="' + slot.id + '"' + (!slot.ok ? ' disabled' : '') + '>' + (slot.ok && slot.primary.empty && slot.backup.empty ? '保存到这里' : '选择此栏位') + '</button>'
      : (!slot.ok ? '' : (slot.primary.ok ? '<button type="button" data-load-slot="' + slot.id + '" data-save-source="primary">读取此栏位</button>' : '') + (slot.backup.ok ? '<button type="button" class="secondary" data-load-slot="' + slot.id + '" data-save-source="backup">恢复上一备份</button>' : ''));
    return '<article class="save-slot' + (current ? ' is-current' : '') + '"><h3>栏位 ' + slot.id + (current ? '<span>当前使用</span>' : '') + '</h3><p>' + description + '</p>' + (slot.ok && !slot.backup.empty ? '<p class="save-slot-backup">上一备份：' + saveInfo(slot.backup) + '</p>' : '') + (slot.ok && slot.temporary ? '<p class="dialog-note">检测到未完成保存的临时数据，不会自动读取。</p>' : '') + '<div class="save-slot-actions">' + controls + '</div></article>';
  }).join('') + '</div>';
}
function showSave() {
  if (!state) return;
  saveTarget = null;
  const info = saves.inspect();
  showDialog('save', '选择保存栏位', '<p>选择一个栏位保存当前进度，之后的自动保存也会使用这个栏位。</p>' + slotCards(info, 'save'), [{ id: 'resume', text: '返回游戏', secondary: true }]);
}
function selectSaveSlot(slotId) {
  const info = saves.inspect().slots.find(slot => slot.id === slotId);
  if (!info?.ok) { showToast(info?.reason || '未知存档栏位'); return; }
  if (info.primary.empty && info.backup.empty) { finishSave(slotId); return; }
  saveTarget = slotId;
  showDialog('confirmSave', '覆盖栏位 ' + slotId + '？', '<p>该栏位已有内容：' + saveInfo(info.primary) + '</p><p>确认后将保存当前进度，原有效主档会成为该栏位的上一备份。之后自动保存使用栏位 ' + slotId + '。</p>', [{ id: 'confirmSave', text: '确认覆盖' }, { id: 'backToSave', text: '重新选择', secondary: true }]);
}
function finishSave(slotId) {
  const result = saveCurrent(false, slotId);
  if (!result?.ok) return;
  saveTarget = null;
  resumePhase();
  showToast(result.warning || '已保存到栏位 ' + slotId);
}
function showAdmission() {
  if (!loginSession && !loginSkipped) {
    if (!sms) loginSkipped = true;
    else { showLogin(); return; }
  }
  const info = saves.inspect();
  const accountButtons = sms
    ? [{ id: loginSession ? 'switchAccount' : 'loginPrompt', text: loginSession ? '切换账号' : '手机登录', secondary: true }]
    : [];
  showDialog('admission', '你好，北交', '<p>八个学期，从拖着行李箱进校门开始。学习、社团、项目、实习、生活费，每一项都得你自己拿主意。</p>' + (loginSession ? '<p class="dialog-note">已登录：<b>' + h(loginSession.phone) + '</b>' + (loginSession.nickname ? ' · ' + h(loginSession.nickname) : '') + '</p>' : '') + '<form id="admissionForm"><label for="nicknameInput">你的昵称</label><input id="nicknameInput" name="nickname" maxlength="24" placeholder="2～12 个字符，汉字/字母/数字，不能全是数字" autocomplete="off" required>' + (debug ? '<label for="seedInput">测试随机种子</label><input id="seedInput" maxlength="64" value="mvp-test">' : '') + '<p id="admissionError" class="action-reason" role="alert"></p><button type="submit">开始新生活</button></form><h3>或选择存档继续</h3>' + slotCards(info, 'load') + '<p class="dialog-note">共有 3 个存档栏位，新局首次保存时可自主选择。旧版存档位于栏位 1。</p>', accountButtons);
}
function showLogin() {
  stopSmsCountdown();
  showDialog('login', '手机验证码登录', '<p>输入手机号获取验证码，登录后进入入学流程。</p><form id="loginForm"><label for="phoneInput">手机号</label><input id="phoneInput" name="phone" inputmode="numeric" maxlength="11" placeholder="11 位手机号" autocomplete="tel" required><label for="codeInput">验证码</label><div class="login-row"><input id="codeInput" name="code" inputmode="numeric" maxlength="6" placeholder="6 位验证码" autocomplete="one-time-code" required><button type="button" class="utility-button" id="smsSendButton">获取验证码</button></div><p id="loginError" class="action-reason" role="alert"></p><button type="submit">登录</button></form><p class="dialog-note">尚未接入短信通道，当前为演示模式：验证码会直接显示在提示中。</p>', [{ id: 'loginSkip', text: '暂不登录，直接入学', secondary: true }]);
}
async function requestSmsCode() {
  const phone = $('#phoneInput').value.trim();
  const checked = sms.validatePhone(phone);
  if (!checked.ok) { $('#loginError').textContent = checked.reason; audio?.play('deny'); return; }
  const result = await sms.send(phone);
  if (!result.ok) { $('#loginError').textContent = result.reason; audio?.play('deny'); return; }
  $('#loginError').textContent = '';
  showToast(result.demoCode ? '演示模式：验证码 ' + result.demoCode + '（接入短信通道后发送到手机）' : '验证码已发送，请注意查收');
  audio?.play('info');
  startSmsCountdown(result.resendAfter || 60);
}
async function doLogin() {
  const phone = $('#phoneInput').value.trim();
  const code = $('#codeInput').value.trim();
  const checked = sms.validatePhone(phone);
  if (!checked.ok) { $('#loginError').textContent = checked.reason; return; }
  const result = sms.verify(phone, code);
  if (!result.ok) { $('#loginError').textContent = result.reason; audio?.play('deny'); return; }
  loginSession = { phone, nickname: '', at: Date.now() };
  loginSkipped = false;
  try {
    storage?.setItem(LOGIN_KEY, JSON.stringify(loginSession));
    storage?.removeItem(LOGIN_SKIP_KEY);
  } catch (_) {}
  stopSmsCountdown();
  audio?.play('success');
  showToast('登录成功');
  showAdmission();
}
function startSmsCountdown(seconds) {
  stopSmsCountdown();
  const button = $('#smsSendButton');
  if (!button || typeof setInterval !== 'function') return;
  let remaining = seconds;
  button.disabled = true;
  button.textContent = '重新获取(' + remaining + 's)';
  smsCountdown = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) stopSmsCountdown();
    else button.textContent = '重新获取(' + remaining + 's)';
  }, 1000);
}
function stopSmsCountdown() {
  if (smsCountdown !== null) {
    if (typeof clearInterval === 'function') clearInterval(smsCountdown);
    smsCountdown = null;
  }
  const button = $('#smsSendButton');
  if (button) { button.disabled = false; button.textContent = '获取验证码'; }
}
function startGame() {
  const checked = game.validateNickname($('#nicknameInput').value);
  if (!checked.ok) { $('#admissionError').textContent = checked.reason; return; }
  if (loginSession) { loginSession.nickname = checked.value; try { storage?.setItem(LOGIN_KEY, JSON.stringify(loginSession)); } catch (_) {} }
  const seed = debug ? $('#seedInput').value : (window.crypto?.getRandomValues ? String(window.crypto.getRandomValues(new Uint32Array(1))[0]) : String(Date.now()));
  try { state = game.createGame({ nickname: checked.value, seed }); } catch (error) { $('#admissionError').textContent = error.message; return; }
  savedRevision = -1;
  activeSaveSlot = null;
  savedAt = '';
  saveNotice = '';
  failures.length = 0;
  resetSeasonTracking();
  audio?.play('success');
  audio?.startBgm();
  resetNpcSystem();
  renderState();
  showEnrollment();
}
function showEnrollment() {
  const background = game.BACKGROUNDS.find((item) => item.id === state.background.id);
  showDialog('enrollment', '录取通知', '<p>' + h(state.nickname) + '，欢迎你。</p><p>录取信息：<b>' + h(state.background.college) + '</b> · ' + h(state.background.major) + '</p><p>' + h(background.bonus) + '</p><p class="dialog-note">背景只影响一项行动加成，不会锁死你的毕业路线。看完玩法说明后先完成本学期选课。</p>', [{ id: 'resume', text: '看看怎么安排' }]);
}
function showTutorial() {
  showDialog('tutorial', '八学期怎么安排', '<ol><li>每学期开学先选 3 门课程，再去地图上安排行动。选课决定期末考试覆盖的学科；数学、物理、计算机、交通、土木、经管等定量课程会按主题随机生成计算题。</li><li>点击地图上的地点，先看活动安排和成本，再决定做不做。逛逛、返回都不花钱。</li><li>日常行动和部分事件可选固定投入档位；确认前查看时间及资源成本，完成后揭晓实际收益，并写入成长记录。军训成本包含训练和汇演，汇演免费连续完成。</li><li>学习和自学都攒同一个学习进度，它是总评里的平时分（40%）。</li><li>期末参加 5 题考试，覆盖所选课程，每题 20 分；总评 = 平时分 × 40% + 考试 × 60%，60 分达标。</li><li>每学期 12 点时间。消耗精力的行动也会消耗体能；休息能回精力与体能，散步、锻炼也能回体能，但都回不了时间。体能分五档：虚弱、一般、良好、优秀会缩放行动的收益与消耗；低于 25 会生病，只能先去校医院。长期属性和经历会跟着你跨学期。</li><li>项目、社团、实习，各要一次申请加两次投入。项目的成果在之后的学期确认，社团和实习在投入完成后即可收尾。</li><li>普通毕业：平均成绩至少 60，且六学期达标。深造再加：平均 80、完成项目、深造准备 60。就业再加：完成实习、求职准备 60。</li><li>大三起开放深造与求职准备。方向可以兼顾、转换，毕业时挑一个够得着的。</li><li>点击保存从 3 个栏位中选择一个。学期结算与毕业确认后自动保存到当前栏位；首次选栏前仅保留本页进度。关闭页面后从入学页选择存档继续。</li></ol>', [{ id: 'resume', text: '开始安排' }]);
}
function showBackground() {
  const background = game.BACKGROUNDS.find((item) => item.id === state.background.id);
  showDialog('background', '入学背景', '<p><b>' + h(state.nickname) + '</b> · ' + h(state.background.college) + ' · ' + h(state.background.major) + '</p><p>' + h(background.bonus) + '</p><p>专业与课程参考学校公开培养方案，学期顺序、学分和选课限制为玩法简化。背景不会锁死你的毕业路线。</p>', [{ id: 'resume', text: '继续安排' }]);
}
function defaultInvestment(profile, available) {
  if (available(profile.default)) return profile.default;
  return profile.tiers.find(tier => available(tier.amount))?.amount ?? profile.default;
}
function eventDraft(choiceId, resetInvalid = false) {
  const profile = game.getEventInvestment(state, choiceId);
  if (!profile) return undefined;
  const key = state.pendingEvent.instanceId + ':' + choiceId;
  const current = eventDrafts.get(key);
  if (!eventDrafts.has(key) || (resetInvalid && !profile.tiers.some(tier => tier.amount === current))) eventDrafts.set(key, defaultInvestment(profile, amount => game.eventAvailability(state, choiceId, state.pendingEvent.instanceId, amount).ok));
  return eventDrafts.get(key);
}
function investmentTierButtons(choice, profile, amount, kind) {
  const data = kind === 'action' ? 'data-action-investment-preset' : 'data-investment-preset';
  return profile.tiers.map(tier => {
    const preview = kind === 'action' ? game.previewActionInvestment(state, choice.id, tier.amount) : game.previewEventInvestment(state, choice.id, tier.amount);
    return '<button type="button" class="investment-tier' + (tier.amount === amount ? ' is-selected' : '') + '" ' + data + '="' + choice.id + '" data-amount="' + tier.amount + '" aria-pressed="' + (tier.amount === amount) + '"><b>' + h(tier.label) + '</b><span>' + h(costs(preview.effect)) + '</span></button>';
  }).join('');
}
function investmentControls(choice, profile, preview, kind = 'event') {
  const id = (kind === 'action' ? 'action-' : '') + choice.id;
  return '<fieldset class="investment-controls"><legend>' + h(profile.label) + '</legend><div class="investment-options" id="investment-options-' + id + '">' + investmentTierButtons(choice, profile, preview.amount, kind) + '</div><small>确认后完成本档安排，再揭晓实际结果。</small></fieldset>';
}

function investmentUnit(resource) {
  return { money: '元', energy: '点精力', time: '点时间' }[resource];
}
function actionDraft(id) {
  const profile = game.getActionInvestment(state, id);
  if (!profile) return undefined;
  const key = state.term + ':' + id;
  if (!actionDrafts.has(key)) actionDrafts.set(key, defaultInvestment(profile, amount => game.availability(state, id, amount).ok));
  return actionDrafts.get(key);
}
function updateActionInvestment(id, amount, sourceId) {
  const profile = game.getActionInvestment(state, id);
  if (!profile || game.ACTIONS[id].place !== activePlace || dialog.open) return;
  actionDrafts.set(state.term + ':' + id, amount);
  const preview = game.previewActionInvestment(state, id, amount);
  const check = game.availability(state, id, amount);
  $('#action-choice-' + id).disabled = !check.ok || uiLocked;
  $('#investment-reason-action-' + id).textContent = check.ok ? '' : check.reason;
  $('#investment-cost-action-' + id).textContent = preview.ok ? costs(preview.effect) : '请设置有效的投入';
  $('#investment-options-action-' + id).innerHTML = investmentTierButtons({ id }, profile, amount, 'action');

}
function updateInvestment(choiceId, amount, sourceId) {
  const profile = game.getEventInvestment(state, choiceId);
  if (!profile || dialogMode !== 'event') return;
  eventDrafts.set(state.pendingEvent.instanceId + ':' + choiceId, amount);
  const preview = game.previewEventInvestment(state, choiceId, amount);
  const check = game.eventAvailability(state, choiceId, state.pendingEvent.instanceId, amount);
  $('#event-choice-' + choiceId).disabled = !check.ok || uiLocked;
  $('#investment-reason-' + choiceId).textContent = check.ok ? '' : check.reason;
  $('#investment-cost-' + choiceId).textContent = preview.ok ? costs(preview.effect) : '请设置有效的投入';
  $('#investment-options-' + choiceId).innerHTML = investmentTierButtons({ id: choiceId }, profile, amount, 'event');

}
function showEvent() {
  audio?.play('event');
  const pending = state.pendingEvent;
  const event = game.EVENTS[pending.id];
  if (['zhouNingMeet', 'zhouNingPresentation'].includes(pending.id)) {
    const choices = game.isSick(state) && pending.id !== 'zhouNingMeet'
      ? [{ label: '先去校医院', note: '先照顾好身体，之后再安排。', attributes: { 'data-event-choice': game.SICK_LEAVE_ID, 'data-instance': pending.instanceId, 'data-revision': state.revision }, disabled: uiLocked }]
      : event.choices.map(choice => {
        const check = game.eventAvailability(state, choice.id, pending.instanceId);
        return { label: choice.title, note: check.ok ? costs(game.fitnessAdjustedEffect(state, choice, null)) : check.reason, disabled: !check.ok || uiLocked, attributes: { 'data-event-choice': choice.id, 'data-instance': pending.instanceId, 'data-revision': state.revision } };
      });
    const speech = pending.id === 'zhouNingMeet' ? '你也选了这门课？我叫周宁。刚才那个知识点，我整理过一版笔记。你愿意和我聊聊你的解法吗？' : '题目我会做，可一想到站上讲台，脑子就空了。你能陪我练一遍吗？这次，想请你帮我迈出一步。';
    showVisualNovel('event', event.title, speech, choices, { canClose: false, place: 'library', detail: event.trigger + '。相识和免费暂缓不会额外收费。' });
    return;
  }

  const sick = game.isSick(state) && pending.id !== 'zhouNingMeet';
  const choices = sick
    ? '<article class="event-choice"><h3>先去校医院</h3><p>烧还没退，现在不是处理这件事的时候。</p><div class="action-cost">不消耗资源 · 事件先搁置</div><button type="button" id="event-choice-sickLeave" data-event-choice="sickLeave" data-instance="' + pending.instanceId + '" data-revision="' + state.revision + '">选择：先去校医院</button><div class="action-reason"></div></article>'
    : event.choices.filter(choice => !choice.legacyHidden).map((choice) => {
      const profile = game.getEventInvestment(state, choice.id);
      const amount = eventDraft(choice.id, true);
      const preview = profile && game.previewEventInvestment(state, choice.id, amount);
      const check = game.eventAvailability(state, choice.id, pending.instanceId, amount);
      return '<article class="event-choice' + (profile ? ' has-investment' : '') + '"><h3>' + h(choice.title) + '</h3><p>' + h(profile ? profile.description : choice.description) + '</p>' + (profile ? investmentControls(choice, profile, preview) : '') + '<div class="action-cost" id="investment-cost-' + choice.id + '">' + h(costs(preview?.ok ? preview.effect : game.fitnessAdjustedEffect(state, choice, null))) + '</div>' + (choice.ending ? '<div class="action-warning">本局结束 · 这个选择没有回头路</div>' : '') + '<button type="button" id="event-choice-' + choice.id + '" data-event-choice="' + choice.id + '" data-instance="' + pending.instanceId + '" data-revision="' + state.revision + '"' + (!check.ok || uiLocked ? ' disabled' : '') + '>' + (profile ? '确认投入，' : '选择：') + h(choice.title) + '</button><div class="action-reason" id="investment-reason-' + choice.id + '">' + (check.ok ? '' : h(check.reason)) + '</div></article>';
    }).join('');
  const note = sick
    ? '身体不适，先处理身体。待处理事件可以先去校医院，之后再回来处理。'
    : h(event.trigger) + '。剩余时间 ' + state.time + ' · 精力 ' + state.energy + ' · 钱包 ' + state.money + ' 元。确认才扣费，切换档位不会结算。';
  const cameo = game.characterAgent.read(state).cameo;
  const cameoBody = cameo?.instanceId === pending.instanceId ? '<div class="zhou-event-cameo"><img src="' + game.relationshipRules.ZHOU_NING.portrait + '" alt="周宁"><div><b>你在这里遇见了周宁</b><p>' + h(cameo.say) + '</p><small>他会陪你参与这件事。配合效果受相识度、社交和心情影响。</small></div></div>' : '';
  showDialog('event', event.title, '<p>' + h(event.description) + '</p>' + cameoBody + '<p class="dialog-note">' + note + '</p><div class="event-choice-list">' + choices + '</div>');
  maybeZhouNingDirector();
}
const INVESTMENT_OUTCOMES = { setback: '发挥失常', limited: '收获有限', steady: '有所收获', good: '状态出色', surprise: '意外收获' };
function showEventResult(entry) {
  if (entry.relationship) {
    showVisualNovel('eventResult', entry.title, entry.relationship.kind === 'activity' ? game.relationshipRules.afterActivity(entry.action) : entry.relationship.description, [vnChoice(state.pendingEvent ? '处理下一个事件' : '查看人物关系', 'continue')], { place: game.ACTIONS[entry.action]?.place, detail: '相识度 +' + entry.relationship.gained + ' · 当前 ' + entry.relationship.familiarity + '/100。' + changeText(entry.changes) + '。' + supportText(entry), footerButtons: [{ id: 'eventContinue', text: state.pendingEvent ? '处理下一个事件' : '继续安排' }] });
    return;
  }
  const result = { ...entry.investment, description: entry.investment.description + (entry.relationship ? ' ' + entry.relationship.description + ' 相识度 +' + entry.relationship.gained + '，当前 ' + entry.relationship.familiarity + '/100。' : '') };
  const profile = entry.event ? game.EVENT_INVESTMENTS[entry.event + ':' + entry.choice] || game.LEGACY_INVESTMENTS.events[entry.event + ':' + entry.choice] : game.getActionInvestment(state, entry.action) || game.LEGACY_INVESTMENTS.actions[entry.action];
  const rawFitnessCost = entry.event
    ? ((game.EVENTS[entry.event] && game.EVENTS[entry.event].choices.find(item => item.id === entry.choice)) || {}).fitnessCost || 0
    : (game.ACTIONS[entry.action] || {}).fitnessCost || 0;
  const fitnessCost = entry.fitnessCost === undefined ? rawFitnessCost : entry.fitnessCost;
  const spent = Number.isSafeInteger(result.spent) ? result.spent : result.amount;
  const scaled = result.spent !== undefined && result.spent !== result.amount;
  const capped = Object.keys(profile.rewards).some(key => state[key === 'recovery' ? 'energy' : key] === 100);
  const title = entry.relationship ? entry.title : entry.event ? game.EVENTS[entry.event].title : game.ACTIONS[entry.action].title;
  showDialog('eventResult', title + ' · 结果', '<div class="investment-result"><span class="outcome-badge outcome-' + result.outcome + '">' + INVESTMENT_OUTCOMES[result.outcome] + '</span><p class="investment-spent">本次投入 <b>' + spent + ' ' + investmentUnit(result.resource) + '</b>' + (fitnessCost ? '，另消耗 <b>' + fitnessCost + ' 点体能</b>' : '') + '</p>' + (scaled ? '<p class="dialog-note">受体能挡位影响，实际投入以本次结算为准。</p>' : '') + '<p class="investment-story">' + h(result.description) + '</p><div class="investment-actual"><span>实际变化</span><b>' + h(changeText(entry.changes)) + '</b></div>' + (entry.support?.companion ? '<p>' + h(supportText(entry)) + '</p>' : '') + (fitnessCost && entry.changes.fitness > 0 ? '<p class="dialog-note">体能 +' + entry.changes.fitness + ' 是扣除本次 ' + fitnessCost + ' 点消耗后的净变化。</p>' : '') + (capped ? '<p>部分属性已达上限，实际增加量以当前状态为准。</p>' : '') + '<p class="dialog-note">这次结果已经记入成长记录，继续或保存都不会重新结算。</p></div>', [{ id: 'eventContinue', text: state.pendingEvent?.id === 'military2' ? '继续军训汇演' : state.pendingEvent ? '处理下一个事件' : '继续安排' }]);

}
function needsCourseSelection() {
  return !!state && state.phase === 'playing' && !(state.selectedCourses || []).length && !state.history.some((entry) => entry.term === state.term && entry.command.operation === 'executeAction');
}
function showCourseSelection() {
  if (!state || state.phase !== 'playing') { resumePhase(); return; }
  if ((state.selectedCourses || []).length) { resumePhase(); return; }
  const options = game.coursesForTerm(state.term, state.background.id, state.background.major);
  const cards = options.map((course) => '<label class="course-card"><input type="checkbox" name="course" value="' + h(course.id) + '"><span class="course-main"><b>' + h(course.name) + '</b><span class="course-meta">' + h(game.SUBJECTS[course.subject]) + ' · ' + course.credits + ' 学分</span><span class="course-desc">' + h(course.description) + '</span></span></label>').join('');
  showDialog('courseSelection', '开学选课', '<p>这是' + h(game.TERM_NAMES[state.term - 1]) + '。从本学期可选课程中选择 3 门，期末考试会覆盖这些课程。</p><form id="courseForm"><p class="course-count" id="courseCount">已选 0 / 3 门</p><div class="course-list">' + cards + '</div><p id="courseError" class="action-reason" role="alert"></p><button type="submit">确认选课</button></form><p class="dialog-note">每学期 3 门课；期末考试 5 题，每题 20 分。定量课程按主题随机生成计算题，其余课程从对应学科题库抽题。总评 = 平时分 40% + 考试 60%。</p>');
}
function submitCourseSelection(form) {
  const ids = [...form.querySelectorAll('input[name="course"]:checked')].map((input) => input.value);
  if (ids.length !== 3) { $('#courseError').textContent = '请选择 3 门课程'; audio?.play('deny'); return; }
  const result = runCommand('selectCourses', ids, state.revision);
  if (!result) return;
  audio?.play('success');
  const names = ids.map((id) => game.courseById(id).name).join('、');
  if (state.phase === 'eventPending') { showEvent(); $('#dialogNotice').textContent = '选课完成：' + names; }
  else { dialog.close(); showToast('选课完成：' + names); }
}
function showExam() {
  if (!state || state.phase !== 'examPending' || !state.exam) { resumePhase(); return; }

  const questions = state.exam.questions.map((question, index) => '<article class="exam-question" id="examQuestion' + index + '"><div class="exam-question-head"><span class="exam-index">第 ' + (index + 1) + ' 题</span><span class="exam-tag">' + h(question.courseName) + ' · ' + h(game.SUBJECTS[question.subject]) + '</span><span class="exam-points">20 分</span></div><p class="exam-prompt">' + mathText(question.prompt) + '</p><div class="exam-options">' + question.options.map((option, optionIndex) => '<label class="exam-option"><input type="radio" name="q' + index + '" value="' + optionIndex + '" aria-label="第 ' + (index + 1) + ' 题，' + String.fromCharCode(65 + optionIndex) + '：' + h(option) + '"' + (state.exam.answers[index] === optionIndex ? ' checked' : '') + (uiLocked ? ' disabled' : '') + '><span>' + String.fromCharCode(65 + optionIndex) + '</span>' + mathText(option) + '</label>').join('') + '</div></article>').join('');
  showDialog('exam', game.TERM_NAMES[state.term - 1] + ' · 期末考试', '<p>平时分 <b>' + state.preparation + ' / 100</b>，占总评 40%。考试共 5 题，每题 20 分，占总评 60%。</p><div class="exam-progress"><p id="examProgress" role="status" aria-live="polite"></p><nav id="examNavigation" class="exam-navigation" aria-label="答题导航"></nav><button type="button" class="utility-button" id="examMissing" data-exam-missing="true">定位首道未答题</button></div><form id="examForm"><p id="examError" class="action-reason" role="alert"></p>' + questions + '<button type="submit"' + (uiLocked ? ' disabled' : '') + '>提交试卷</button></form><p class="dialog-note">答案保存在当前进度。离开前请保存；读取该存档后可继续作答。提交后立即结算，不能修改答案。</p><button type="button" class="danger-button" data-cheat-exam="1" data-revision="' + state.revision + '">动点歪心思……</button><p class="dialog-note">有些选择没有回头路。</p>');
  updateExamProgress();
}
function confirmCheatExam() {
  if (!state || state.phase !== 'examPending') { resumePhase(); return; }
  showDialog('confirmCheat', '确定要作弊吗？', '<p>你准备把小抄塞进袖口。监考老师还在讲台边，考场很安静。</p><p class="dialog-note">一旦被发现，本局会立即结束，没有补考，也没有重新选择的机会。</p>', [{ id: 'cheatExam', text: '把小抄塞进袖口' }, { id: 'backToExam', text: '再想想', secondary: true }]);
}
function readExamAnswers(form) {
  return state.exam.questions.map((_, index) => {
    const checked = form.querySelector('input[name="q' + index + '"]:checked');
    return checked ? Number(checked.value) : null;
  });
}
function updateExamProgress() {
  const answers = state.exam.questions.map((_, index) => state.exam.answers[index] ?? null);
  const answered = answers.filter((answer) => answer !== null).length;
  $('#examProgress').textContent = '已答 ' + answered + ' / ' + answers.length + ' 题';
  $('#examNavigation').innerHTML = answers.map((answer, index) => {
    const done = answer !== null;
    return '<button type="button" data-exam-question="' + index + '" class="' + (done ? 'is-answered' : 'is-unanswered') + '" aria-label="第 ' + (index + 1) + ' 题，' + (done ? '已作答' : '未作答') + '"><b>' + (index + 1) + '</b><small>' + (done ? '已答' : '未答') + '</small></button>';
  }).join('');
  $('#examMissing').disabled = answered === answers.length;
}
function focusExamQuestion(index) {
  if (state?.phase !== 'examPending' || dialogMode !== 'exam' || !Number.isInteger(index) || index < 0 || index >= state.exam.questions.length) return;
  const question = $('#examQuestion' + index);
  question.scrollIntoView({ block: 'start' });
  (question.querySelector('input:checked') || question.querySelector('input'))?.focus({ preventScroll: true });
}
function submitExamForm(form) {
  if (!state?.exam) return;
  const answers = readExamAnswers(form);
  const missing = answers.map((answer, index) => answer === null ? index : -1).filter((index) => index >= 0);
  if (missing.length) {
    $('#examError').textContent = '还有 ' + missing.length + ' 题未作答（第 ' + missing.map((index) => index + 1).join('、') + ' 题），已定位到第 ' + (missing[0] + 1) + ' 题。';
    audio?.play('deny');
    focusExamQuestion(missing[0]);
    return;
  }
  $('#examError').textContent = '';
  const result = runCommand('submitExam', answers, state.revision);
  if (!result) return;
  audio?.play('success');
  if (activeSaveSlot !== null) saveCurrent(true);
  showSummary();
  showToast('考试得分 ' + state.summary.examScore + ' 分，总评 ' + state.summary.grade + ' 分');
}
function summaryMarkup(summary) {
  if (summary.examScore === undefined) return '<div class="summary-score"><b>' + summary.grade + '</b><span>分 · ' + (summary.passed ? '课程达标' : '课程未达标') + '</span></div><p>学习进度 ' + summary.preparation + ' / 100。期末成绩按 40 + 学习进度 × 0.6 计算。</p><div class="summary-lines"><span>生活费 <b>−300 元</b></span><span>补助 <b>+' + summary.aid + ' 元</b></span><span>结余 <b>' + summary.moneyAfter + ' 元</b></span><span>没用完的时间 <b>' + summary.unusedTime + ' 点，不结转</b></span></div>' + summary.notices.map((notice) => '<p>' + h(notice) + '</p>').join('');
  return '<div class="summary-score"><b>' + summary.grade + '</b><span>分 · ' + h(summary.rating) + ' · ' + (summary.passed ? '课程达标' : '课程未达标') + '</span></div><p>平时分 ' + summary.usualScore + ' / 100（40%）+ 期末考试 ' + summary.examScore + ' / 100（60%）。</p><p class="dialog-note">本学期课程：' + h(summary.courseNames.join('、')) + '</p><div class="summary-lines"><span>生活费 <b>−300 元</b></span><span>补助 <b>+' + summary.aid + ' 元</b></span><span>结余 <b>' + summary.moneyAfter + ' 元</b></span><span>没用完的时间 <b>' + summary.unusedTime + ' 点，不结转</b></span></div>' + summary.notices.map((notice) => '<p>' + h(notice) + '</p>').join('');
}
function requestEndTerm() {
  if (!state) return;
  if (state.phase !== 'playing') { resumePhase(); return; }
  if ((state.selectedCourses || []).length) {
    const remaining = state.time ? '还有 ' + state.time + ' 点时间可用于学习或其他安排，剩余时间不会结转。' : '本学期时间已用完，可以开始考试。';
    showDialog('confirmExam', '开始' + game.TERM_NAMES[state.term - 1] + '期末考试？', '<div class="summary-lines"><span>剩余时间 <b>' + state.time + ' 点</b></span><span>当前平时分 <b>' + state.preparation + ' / 100</b></span></div><p>' + remaining + '</p><p>考试共 5 题，每题 20 分。总评 = 平时分 40% + 考试分 60%。</p><p class="dialog-note">确认开考后，本学期不能再安排学习、休息等行动。提交试卷后立即结算。</p>', [{ id: 'resume', text: '继续安排', secondary: true }, { id: 'beginExam', text: '确认开考' }]);
    return;
  }
  const preview = game.previewSettlement(state);
  showDialog('confirm', '结束' + preview.name + '？', summaryMarkup(preview) + '<p class="dialog-note">这是只读预览。确认后本学期不能继续行动。' + (activeSaveSlot === null ? '当前尚未选择存档栏位，结算后请手动选择栏位保存。' : '将自动保存到栏位 ' + activeSaveSlot + '。') + (preview.unusedTime ? '还有 ' + preview.unusedTime + ' 点时间，可以继续安排。' : '') + '</p>', [{ id: 'resume', text: '继续本学期', secondary: true }, { id: 'settle', text: '确认结算' }]);
}
function showSummary() {
  audio?.play('paper');
  showDialog('summary', state.summary.name + ' · 学期总结', summaryMarkup(state.summary) + '<p>' + h(saveNotice || '可以随时保存当前总结。') + '</p><p>' + (state.term === 8 ? '八个学期的记录齐了。接下来，看看毕业的路往哪走。' : '开学之后先选课，时间和精力重新给足，平时分从头攒；存款、长期状态和之前的投入都还跟着你。') + '</p>', [{ id: 'next', text: state.term === 8 ? '评估毕业方向' : '进入' + game.TERM_NAMES[state.term] }]);
}
function courseTable() {
  if (!state.courses.length) return '<p>还没有结算过的成绩。</p>';
  if (state.courses.some((item) => item.examScore !== undefined)) return '<table class="course-table"><thead><tr><th>学期</th><th>平时</th><th>考试</th><th>总评</th><th>评级</th><th>结果</th></tr></thead><tbody>' + state.courses.map((item) => '<tr><td>' + h(item.name) + '</td><td>' + (item.usualScore ?? item.preparation) + '</td><td>' + (item.examScore ?? '—') + '</td><td>' + item.grade + '</td><td>' + h(item.rating || '—') + '</td><td>' + (item.passed ? '达标' : '未达标') + '</td></tr>').join('') + '</tbody></table>';
  return '<table class="course-table"><thead><tr><th>学期</th><th>学习进度</th><th>成绩</th><th>结果</th></tr></thead><tbody>' + state.courses.map((item) => '<tr><td>' + h(item.name) + '</td><td>' + item.preparation + '</td><td>' + item.grade + '</td><td>' + (item.passed ? '达标' : '未达标') + '</td></tr>').join('') + '</tbody></table>';
}
function requirementsMarkup(requirements) {
  return '<ul class="requirements">' + requirements.map((item) => '<li class="' + (item.met ? 'met' : '') + '">' + (item.met ? '已满足：' : '未满足：') + h(item.label) + '</li>').join('') + '</ul>';
}
function showEndings() {
  audio?.play('fanfare');
  showDialog('endingChoice', '选择毕业方向', '<p>八学期平均成绩 ' + state.endingOptions.average.toFixed(1) + '，达标 ' + state.endingOptions.passed + '/8 学期。</p><div class="ending-list">' + state.endingOptions.options.map((item) => '<article class="ending-card"><h3>' + h(item.title) + '</h3>' + requirementsMarkup(item.requirements) + '<button type="button" data-ending="' + item.id + '" data-revision="' + state.revision + '"' + (!item.available || uiLocked ? ' disabled' : '') + '>' + (item.available ? '选择' + h(item.title) : '条件未满足') + '</button></article>').join('') + '</div>');
}
const EXPERIENCE_LABELS = {
  project: '校园项目完成', club: '社团活动经历', internship: '实习经历完成', fitnessTest: '体测体验达标',
  military: '军训汇演完成', singer: '歌手大赛经历', trip: '返乡分享经历', contest: '学科竞赛经历',
  sportsMeet: '运动会经历', transfer: '转专业经历'
};
// 成长记录：把操作历史按学期与事件类型归档，并单独跟踪事件链进度。
// 分类依据游戏规则：主线事件为军训流程；随机池中的事件记为突发事件；
// 带 chain 的事件与申请/投入行动记为事件链；其余条件事件记为基础事件。
const RECORD_CATEGORY_LABELS = {
  action: '日常行动', basic: '基础事件', random: '突发事件', chain: '事件链', main: '主线事件', academic: '学业节点'
};
const RECORD_MAIN_EVENTS = ['military1', 'military2'];
const RECORD_CHAIN_EFFECTS = { accept: '加入事件链', defer: '暂缓申请', postpone: '成果确认延期', complete: '完成事件链', abandon: '退出事件链' };
let recordFilter = 'all';
let recordEntriesCache = null;
let recordEntriesState = null;
let recordEntriesRevision = -1;
function recordEventCategory(eventId) {
  const event = game.EVENTS[eventId];
  if (!event) return 'basic';
  if (event.chain) return 'chain';
  if (RECORD_MAIN_EVENTS.includes(eventId)) return 'main';
  if ((game.RANDOM_POOL || []).includes(eventId)) return 'random';
  return 'basic';
}
function recordCategoryBadge(category, chainId) {
  return category === 'chain' && chainId ? '事件链 · ' + game.CHAIN_NAMES[chainId] : RECORD_CATEGORY_LABELS[category];
}
function buildRecordEntries() {
  const entries = [];
  for (const log of state.history) {
    const operation = log.command && log.command.operation;
    if (!operation || operation === 'updateExamAnswers') continue;
    if (operation === 'executeAction' || operation === 'completeBasketball' || operation === 'resolveZhouNingProposal' && log.action !== 'zhouDialogue' || operation === 'chatWithNpc' || operation === 'interactWithZhouNing') {
      const action = ['executeAction', 'completeBasketball', 'resolveZhouNingProposal'].includes(operation) ? game.ACTIONS[log.action] : null;
      const chainId = action && action.chain ? action.chain : null;
      const place = action && action.place && game.PLACES[action.place] ? game.PLACES[action.place].title : '';
      const notes = [place, supportText(log)];
      if (log.relationship) notes.push('周宁 · 相识度 +' + log.relationship.gained + '（' + log.relationship.familiarity + '/100）');
      if (log.investment) {
        notes.push('投入 ' + log.investment.amount + ' ' + investmentUnit(log.investment.resource));
        if (INVESTMENT_OUTCOMES[log.investment.outcome]) notes.push(INVESTMENT_OUTCOMES[log.investment.outcome]);
      }
      const category = chainId ? 'chain' : 'action';
      entries.push({
        term: log.term, revision: log.revision, category, chainId, kind: 'action',
        title: log.title || log.identity || (action ? action.title : '') || '行动',
        note: notes.filter(Boolean).join(' · '), changes: log.changes || null,
        badge: recordCategoryBadge(category, chainId)
      });
      continue;
    }
    if (operation === 'submitEventChoice') {
      const event = game.EVENTS[log.event];
      const choice = event ? event.choices.find((item) => item.id === log.choice) : null;
      const chainId = event && event.chain ? event.chain : null;
      const category = recordEventCategory(log.event);
      const notes = ['选择「' + (choice ? choice.title : (log.title || '先去校医院')) + '」', supportText(log)].filter(Boolean);
      if (log.relationship) notes.push('周宁 · 相识度 +' + log.relationship.gained + '（' + log.relationship.familiarity + '/100）');
      if (choice && choice.chainEffect && RECORD_CHAIN_EFFECTS[choice.chainEffect]) notes.push(RECORD_CHAIN_EFFECTS[choice.chainEffect]);
      if (log.outcome) notes.push(log.outcome);
      if (log.investment) {
        notes.push('投入 ' + log.investment.amount + ' ' + investmentUnit(log.investment.resource));
        if (INVESTMENT_OUTCOMES[log.investment.outcome]) notes.push(INVESTMENT_OUTCOMES[log.investment.outcome]);
      }
      entries.push({
        term: log.term, revision: log.revision, category, chainId, kind: 'event',
        title: event ? event.title : (log.title || '事件'),
        note: notes.join(' · '), changes: log.changes || null,
        badge: recordCategoryBadge(category, chainId)
      });
      continue;
    }
    entries.push({
      term: log.term, revision: log.revision, category: 'academic', chainId: null, kind: 'academic',
      title: log.title || operation,
      note: operation === 'submitExam' && Number.isSafeInteger(log.examScore) ? '期末得分 ' + log.examScore : '',
      changes: null, badge: RECORD_CATEGORY_LABELS.academic
    });
  }
  return entries;
}
function recordEntries() {
  if (recordEntriesCache && recordEntriesState === state && recordEntriesRevision === state.revision) return recordEntriesCache;
  const entries = buildRecordEntries();
  recordEntriesCache = entries;
  recordEntriesState = state;
  recordEntriesRevision = state.revision;
  return entries;
}
function recordCounts(entries) {
  const counts = { action: 0, event: 0, academic: 0 };
  for (const entry of entries) {
    if (entry.kind === 'action') counts.action += 1;
    else if (entry.kind === 'academic') counts.academic += 1;
    else counts.event += 1;
  }
  return counts;
}
function recordStatMarkup(value, label) {
  return '<div class="record-stat"><b>' + h(value) + '</b><span>' + h(label) + '</span></div>';
}
function recordSummaryMarkup(entries) {
  const counts = recordCounts(entries);
  const passed = state.courses.filter((item) => item.passed).length;
  return '<div class="record-stats">' + recordStatMarkup(entries.length, '条记录') + recordStatMarkup(counts.action, '次行动') + recordStatMarkup(counts.event, '个事件') + recordStatMarkup(state.experiences.length, '项经历') + '</div>' +
    '<p class="record-summary-note">' + h(state.nickname) + ' · ' + h(game.TERM_NAMES[state.term - 1]) + ' · 已通过 <b>' + passed + ' / 8</b> 个学期 · 学业节点 <b>' + counts.academic + '</b> 条</p>';
}
function recordEntryMarkup(entry) {
  const hasChanges = entry.changes && Object.values(entry.changes).some((value) => value !== 0);
  return '<article class="record-entry is-' + entry.category + '">' +
    '<div class="record-entry-head"><span class="record-badge is-' + entry.category + '">' + h(entry.badge) + '</span><b class="record-entry-title">' + h(entry.title) + '</b></div>' +
    (entry.note ? '<p class="record-note">' + h(entry.note) + '</p>' : '') +
    (hasChanges ? '<p class="record-changes">' + h(changeText(entry.changes)) + '</p>' : '') +
    '</article>';
}
function recordTimelineMarkup(entries, options = {}) {
  if (!entries.length) return '<p class="record-empty">' + h(options.empty || '还没有记录。') + '</p>';
  let list = entries.slice();
  let hidden = 0;
  const limit = options.limit || 0;
  if (limit && list.length > limit) { hidden = list.length - limit; list = list.slice(-limit); }
  if (options.newestFirst) list.reverse();
  const groups = new Map();
  for (const entry of list) {
    if (!groups.has(entry.term)) groups.set(entry.term, []);
    groups.get(entry.term).push(entry);
  }
  const html = [...groups.entries()].map(([term, items]) => '<section class="record-term-group"><div class="record-term"><span>第 ' + term + ' 学期 · ' + h(game.TERM_NAMES[term - 1]) + '</span><small>' + items.length + ' 条</small></div>' + items.map(recordEntryMarkup).join('') + '</section>').join('');
  return html + (hidden ? '<p class="record-more">另有 ' + hidden + ' 条更早记录未在此处展开，存档中仍完整保留。</p>' : '');
}
function recordChainStage(chain) {
  if (chain.status === 'idle') return '未申请';
  if (chain.status === 'deferred') return '暂缓申请';
  if (chain.status === 'active') return chain.progress >= 2 ? '待成果确认 · 2/2 次投入' : '进行中 · 已投入 ' + chain.progress + '/2';
  if (chain.status === 'completed') return '已完成 · 2/2 次投入';
  return '未完成 · ' + chain.progress + '/2 次投入';
}
function recordChainDetail(id, chain, action) {
  if (chain.status === 'idle' || chain.status === 'deferred') {
    const conditions = [];
    if (action && action.minTerm) conditions.push('第 ' + action.minTerm + (action.maxTerm && action.maxTerm !== action.minTerm ? '～' + action.maxTerm : '') + ' 学期');
    if (action && action.autumnOnly) conditions.push('仅秋季学期');
    if (action && action.minPreparation) conditions.push('学习进度 ≥ ' + action.minPreparation);
    if (action && action.minAverage) conditions.push('平均成绩 ≥ ' + action.minAverage);
    const prefix = chain.status === 'deferred' ? '已选择暂缓，第 ' + chain.nextEligibleTerm + ' 学期可以再次申请' : '申请条件';
    return (chain.status === 'deferred' ? prefix : prefix + '：' + (conditions.join(' · ') || '按学期开放'));
  }
  if (chain.status === 'active') {
    if (chain.progress >= 2) return '两次投入已完成 · ' + (id === 'project' ? '下一学期' : '本学期起') + '等待成果确认事件';
    return '第 ' + chain.deadline + ' 学期结算时检查进度，未完成会顺延（第 8 学期仍未完成则失败）';
  }
  if (chain.status === 'completed') return '第 ' + chain.startedTerm + ' 学期加入 · 已完成成果确认';
  return '未完成成果确认 · 保留 ' + chain.progress + '/2 次投入记录';
}
function recordChainCardsMarkup(entries, detailed = false) {
  return '<div class="record-block-title">事件链进度</div><div class="record-chain-list">' + Object.keys(game.CHAIN_NAMES).map((id) => {
    const chain = state.chains[id];
    const action = game.ACTIONS['apply' + id[0].toUpperCase() + id.slice(1)] || null;
    const related = entries.filter((entry) => entry.chainId === id);
    const last = related.at(-1);
    const filled = Math.max(0, Math.min(2, chain.progress));
    const segments = [0, 1].map((index) => '<span class="chain-seg' + (index < filled ? ' is-on' : '') + '"></span>').join('');
    const trace = detailed && related.length ? '<ol class="chain-trace">' + related.slice(-8).map((entry) => '<li><span>第 ' + entry.term + ' 学期</span>' + h(entry.title) + '</li>').join('') + '</ol>' : '';
    return '<article class="chain-card is-' + chain.status + '">' +
      '<div class="chain-card-head"><b>' + h(game.CHAIN_NAMES[id]) + '</b><span class="chain-state">' + h(recordChainStage(chain)) + '</span></div>' +
      '<div class="chain-progress" role="img" aria-label="已投入 ' + filled + ' / 2 次">' + segments + '</div>' +
      '<p class="chain-detail">' + h(recordChainDetail(id, chain, action)) + '</p>' +
      '<p class="chain-last">' + (last ? '最近：第 ' + last.term + ' 学期 · ' + h(last.title) : '暂无相关记录') + '</p>' +
      trace +
      '</article>';
  }).join('') + '</div>';
}
function renderRecordsPanel() {
  const summary = $('#recordSummary');
  const chains = $('#recordChains');
  const timeline = $('#recordTimeline');
  if (!summary && !chains && !timeline) return;
  if (!state) {
    if (summary) summary.innerHTML = '';
    if (chains) chains.innerHTML = '';
    if (timeline) timeline.innerHTML = '<p class="record-empty">入学后，安排的行动和遇到的事件会按学期自动归档。</p>';
    return;
  }
  const entries = recordEntries();
  const filtered = recordFilter === 'all' ? entries : entries.filter((entry) => entry.category === recordFilter);
  if (summary) summary.innerHTML = recordSummaryMarkup(entries);
  if (chains) chains.innerHTML = recordChainCardsMarkup(entries);
  if (timeline) timeline.innerHTML = recordTimelineMarkup(filtered, { newestFirst: true, limit: 80, empty: '这个分类还没有记录。' });
  document.querySelectorAll('[data-record-filter]').forEach((button) => {
    const active = (button.dataset.recordFilter || 'all') === recordFilter;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  });
}
function investmentRecord() {
  const entries = state.history.filter(entry => entry.investment).slice().reverse();
  return '<h3>投入与收获</h3>' + (entries.length ? entries.map(entry => '<article class="investment-record"><h4>' + game.TERM_NAMES[entry.term - 1] + ' · ' + h(entry.event ? game.EVENTS[entry.event].title : game.ACTIONS[entry.action].title) + '</h4><span class="outcome-badge outcome-' + entry.investment.outcome + '">' + INVESTMENT_OUTCOMES[entry.investment.outcome] + '</span><p>投入 ' + entry.investment.amount + ' ' + investmentUnit(entry.investment.resource) + '</p><p>' + h(entry.investment.description) + '</p><div class="action-gain">' + h(changeText(entry.changes)) + '</div></article>').join('') : '<p>完成自主投入的行动后，这里会记下你的选择和结果。</p>');
}
function growthRecord(includeRoutes = true, includeTimeline = false) {
  const entries = recordEntries();
  const counts = recordCounts(entries);
  const passed = state.courses.filter((item) => item.passed).length;
  return '<h3>记录概览</h3><p>角色 <b>' + h(state.nickname) + '</b> · 共 <b>' + entries.length + '</b> 条记录：行动 ' + counts.action + ' 次 · 事件 ' + counts.event + ' 个 · 学业节点 ' + counts.academic + ' 条；校园经历 ' + state.experiences.length + ' 项，已通过 <b>' + passed + ' / 8</b> 个学期。</p>' +
    recordChainCardsMarkup(entries, true) +
    (includeTimeline ? '<h3>行动与事件时间线</h3>' + recordTimelineMarkup(entries, { empty: '还没有行动或事件记录。' }) : '') +
    courseTable() + investmentRecord() +
    '<h3>校园经历</h3>' + (state.experiences.length ? '<ul>' + state.experiences.map((item) => '<li>' + game.TERM_NAMES[item.term - 1] + '：' + h(EXPERIENCE_LABELS[item.type] || '校园经历') + '</li>').join('') + '</ul>' : '<p>还没有拿得出手的经历。</p>') +
    (includeRoutes ? '<h3>毕业条件进度</h3>' + game.evaluateEndings(state).options.filter((item) => !['notQualified', 'delayed'].includes(item.id)).map((item) => '<h4>' + h(item.title) + '</h4>' + requirementsMarkup(item.requirements)).join('') : '');
}
const ENDING_TEXT = {
  ordinary: '毕业典礼的台子搭在操场边上，学士服领到手的时候还带着消毒水味。你想起大一第一次进校门，行李箱的轮子在石板路上响了一路。四年的账算下来不复杂：八张成绩单、几场活动、一次体测、几个没说出口的遗憾。有人去了远方，有人留在北京，你选了最稳的一条路。稳妥不是妥协，是你一个学期一个学期攒出来的底气。银杏大道下个秋天还会金黄，只是看它的人换了一批。行李打包完，你在宿舍门口站了会儿，把钥匙放在了宿管阿姨的窗口。出门的时候，风里有北京秋天常有的那种凉。你回头看了一眼，楼还是那栋楼。',
  furtherStudy: '录取结果出来的那天，你在图书馆的老位置上坐了很久。窗外银杏叶还没黄透，键盘边摊着你四年攒下的成绩单和项目结题报告。你想起实验室改到熄灯的晚上，想起答辩前手心出的汗，想起自习室里陌生人给你留的半张桌子。深造的路，是一次次「再来一遍」铺出来的。秋天你还会回到这间图书馆，只是身份换了：从占座的人，变成写论文的人。导师的邮件躺在邮箱里，回复写了又删，最后发出去一句「收到，谢谢老师」。窗外有鸟落在窗台上。你忽然想，四年前那个拖着行李箱的你，大概想不到今天。',
  employment: '三方协议签完那天，你在食堂吃了最后一顿窗口的饭。熟悉的打菜阿姨问你毕业去哪，你说了个城市名。实习时的通勤路线、改过七版的简历、面试官问倒你的那个问题，都成了档案里薄薄的几页。校门口的行李托运点排着长队，四年生活被打包成两三个纸箱。你最后看了一眼南门，知道下次回来，这里会叫你校友。手机亮了，是入职通知，提醒你下周一报到。你关掉屏幕，把手机塞进口袋，往地铁站走去。进站的风吹起衣角，晚高峰的人流把你卷了进去，和这座城市里的其他人一样。',
  notQualified: '有些学期过得潦草，成绩单上有几行空着。收拾行李的时候你才发现，四年比想象中结束得快。遗憾是真的：欠下的课、没递出的申请、拖到最后的复习。但走过的路也不算白走——认识的人、熬过的夜、银杏大道上散过的步，都还是你的。人生不只有一张毕业证那么窄的路。先把这段日子收好，接下来怎么走，决定权还在你手里。远处操场传来口哨声，和四年前开学那天一样。你拉着箱子走向校门，门口的风把几张旧纸吹得翻起来。天还亮着。',
  delayed: '教务处给你办了延毕。你成了校园里最熟悉银杏大道的人，也终于有时间把那门课重新学一遍。只是下一届新生入学时，你已经能给他们指路了。秋天再来的时候，你站在人群外面，忽然觉得多出来的一年也不算白费。',
  blankResume: '简历上的教育经历写得很满，其他栏目干净得像刚打印出来。HR 问：你大学四年都在干什么？你说：在体验生活。面试间安静了几秒，窗外有人拖着行李箱走过。你忽然想起那些没加入的社团、没报名的项目、没投出去的实习申请，它们都没有消失，只是变成了简历上的空白。',
  cheatNote: '你刚把小抄展开，监考老师已经在你身后站了半分钟。小抄第一行写着：不要紧张。教务处通报：本届最快结束期末考试的同学诞生了。',
  cardThief: '保卫处老师把消费记录打印出来，时间精确到你犹豫的那三秒。家长被请到学校，你签了退学申请。校园卡大盗的职业生涯，只有一次消费。'
};
function showResult() {
  audio?.play('fanfare');
  const terminal = state.result.kind === 'terminal';
  const intro = '<p>' + (ENDING_TEXT[state.result.direction] || '') + '</p>' + (terminal ? '<p class="dialog-note">触发原因：' + h(state.result.reason) + '</p>' : '') + '<p>平均成绩 <b>' + state.result.average.toFixed(1) + '</b>，达标 <b>' + state.result.passed + '/8</b> 学期。</p>' + (terminal ? '<p>本局在第 <b>' + state.result.term + '</b> 学期结束。</p>' : '') + '<p>' + h(saveNotice || '可以把这段结局保存下来。') + '</p>' + (terminal ? '' : requirementsMarkup(state.result.requirements)) + growthRecord(!terminal);
  showDialog(terminal ? 'ended' : 'finished', state.result.title, intro, [{ id: 'resume', text: '返回地图', secondary: true }, { id: 'restart', text: '重新开始' }]);
}
function resumePhase() {
  if (!state) { showAdmission(); return; }
  state = game.resumeRequiredEvents(state);
  const last = state.history.at(-1);
  if (last?.command.operation === 'completeBasketball' && last.relationship && acknowledgedResultRevision !== state.revision) { showBasketballResult(last); return; }
  if (last?.investment && acknowledgedResultRevision !== state.revision) { showEventResult(last); return; }
  if (last?.relationship && acknowledgedResultRevision !== state.revision) { showRelationshipResult(last); return; }
  if (state.phase === 'eventPending') showEvent();
  else if (state.phase === 'examPending') showExam();
  else if (state.phase === 'summary') showSummary();
  else if (state.phase === 'endingChoice') showEndings();
  else if (state.phase === 'finished' || state.phase === 'ended') showResult();
  else if (needsCourseSelection()) showCourseSelection();
  else { dialog.close(); maybeZhouNingDirector(); }
}
function showLoad() {
  const info = saves.inspect();
  showDialog('load', '选择读取栏位', '<p>选择读取后，当前未保存进度将被替换，之后自动保存到所读栏位。</p>' + slotCards(info, 'load'), [{ id: state ? 'resume' : 'admission', text: '取消', secondary: true }]);
}
function loadGame(slotId, source = 'primary') {
  const result = saves.load(slotId, source);
  if (!result.ok) { showToast(result.reason); return; }
  cancelZhouRequest();
  zhouChatDraft = ''; zhouChatNotice = ''; zhouHistoryOpen = false;
  cancelBasketball();
  closePlace();
  state = game.resumeRequiredEvents(result.state);
  activeSaveSlot = slotId;
  actionDrafts.clear();
  eventDrafts.clear();
  acknowledgedResultRevision = -1;
  savedRevision = state.revision;
  savedAt = result.savedAt;
  saveNotice = '已恢复栏位 ' + slotId + ' · ' + displayTime(savedAt);
  clearTimeout(unlockTimer);
  uiLocked = false;
  failures.length = 0;
  resetSeasonTracking();
  resetNpcSystem();
  audio?.play('load');
  audio?.startBgm();
  renderState();
  resumePhase();
  showToast(source === 'backup' ? '已恢复栏位 ' + slotId + ' 的备份；下次保存时更新该栏位主档' : '已读取栏位 ' + slotId);
}
function askRestart() {
  showDialog('restart', '重新开始？', '<p>确认后回到入学页，没保存的进度会被清空。已有存档在新局保存前仍可读取。</p>', [{ id: 'resume', text: '保留本局', secondary: true }, { id: 'confirmRestart', text: '确认重新开始' }]);
}
function exportLog() {
  const report = { appVersion: game.RULES.appVersion, rulesVersion: game.RULES.version, nickname: state.nickname, seed: state.rng.seed, commands: state.history.map((entry) => ({ ...entry.command, commandId: entry.commandId })), operations: state.history, failures, finalState: state };
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'bjtu-life-replay.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('#dialogBody').addEventListener('submit', (event) => {
  if (event.target.id === 'admissionForm') { event.preventDefault(); startGame(); }
  else if (event.target.id === 'loginForm') { event.preventDefault(); doLogin(); }
  else if (event.target.id === 'npcChatForm') { event.preventDefault(); sendNpcChat(); }
  else if (event.target.id === 'zhouChatForm') { event.preventDefault(); sendZhouChat(); }
  else if (event.target.id === 'courseForm') { event.preventDefault(); submitCourseSelection(event.target); }
  else if (event.target.id === 'examForm') { event.preventDefault(); submitExamForm(event.target); }
});
$('#dialogBody').addEventListener('input', event => { if (event.target.id === 'zhouChatInput') zhouChatDraft = event.target.value; });
$('#dialogBody').addEventListener('change', (event) => {
  const examForm = event.target.closest('#examForm');
  if (examForm && dialogMode === 'exam' && state?.phase === 'examPending') {
    if (runCommand('updateExamAnswers', readExamAnswers(examForm), state.revision)) {
      $('#examError').textContent = '';
      updateExamProgress();
    }
    return;
  }
  const form = event.target.closest('#courseForm');
  if (!form) return;
  const count = form.querySelectorAll('input[name="course"]:checked').length;
  const label = form.querySelector('#courseCount');
  if (label) label.textContent = '已选 ' + count + ' / 3 门';
});
$('#actionList').addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (button?.dataset.zhouOpen && !dialog.open) { showZhouNing(); return; }
  if (button?.dataset.actionInvestmentPreset) { updateActionInvestment(button.dataset.actionInvestmentPreset, Number(button.dataset.amount)); return; }
  if (!button || game.ACTIONS[button.dataset.action]?.place !== activePlace || dialog.open) return;
  if (game.ACTIONS[button.dataset.action]?.minigame === 'basketball') { startBasketball(); return; }
  const result = runCommand('executeAction', button.dataset.action, button.dataset.revision, undefined, actionDraft(button.dataset.action));
  if (!result) return;
  audio?.play(ACTION_SOUNDS[button.dataset.action] || 'success');
  $('#actionFeedback').textContent = (result.entry.investment?.description || ACTION_FLAVOR[result.entry.action] || result.entry.title + '完成') + ' ' + changeText(result.changes) + (state.time === 0 ? ' 时间用完了，回地图结束这个学期吧。' : '');
  if (result.entry.investment) showEventResult(result.entry);
  else if (state.phase === 'eventPending') showEvent();
  else maybeZhouNingDirector();
});
$('#dialogBody').addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.vnUi) {
    const command = button.dataset.vnUi;
    if (uiLocked) return;
    if (command === 'profile') {
      zhouHistoryOpen = false;
      zhouView.profileOpen = !zhouView.profileOpen;
      if (lastVisualNovel) { const scene = lastVisualNovel; showVisualNovel(scene.mode, scene.title, scene.speech, scene.choices, scene.options); }
      return;
    }
    if (command === 'history') {
      zhouHistoryOpen = !zhouHistoryOpen; zhouView.profileOpen = false;
      if (lastVisualNovel) { const scene = lastVisualNovel; showVisualNovel(scene.mode, scene.title, scene.speech, scene.choices, scene.options); }
      return;
    }
    if (command === 'prompt') { sendZhouChat(button.dataset.vnPrompt); return; }
    if (command === 'acceptProposal' || command === 'declineProposal') { answerZhouProposal(command === 'acceptProposal' ? 'accept' : 'decline', button.dataset.proposalRevision); return; }
    if (command === 'save') { showSave(); return; }
    if (command === 'close') { cancelZhouRequest(); acknowledgedResultRevision = state.revision; resumePhase(); return; }
    if (command === 'continue') {
      acknowledgedResultRevision = state.revision;
      if (state.phase === 'playing' && !needsCourseSelection()) showZhouNing(); else resumePhase();
      return;
    }
    if (command === 'deepTalk' || command === 'presentation') {
      const type = command === 'deepTalk' ? 'talk' : 'presentation';
      const result = runCommand('interactWithZhouNing', type, button.dataset.revision, undefined, undefined, { characterVersion: 2 });
      if (result) { if (type === 'talk') showRelationshipResult(result.entry); else showEvent(); }
      return;
    }
    if (command === 'confirmActivity') {
      if (zhouView.activity === 'basketball') { startBasketball({ companionId: 'zhouNing' }); return; }
      const profile = game.getActionInvestment(state, zhouView.activity);
      const amount = zhouView.amount ?? profile?.default;
      const result = runCommand('executeAction', zhouView.activity, button.dataset.revision, undefined, amount, { companionId: 'zhouNing', characterVersion: 2 });
      if (result) {
        audio?.play(ACTION_SOUNDS[zhouView.activity] || 'success');
        if (result.entry.investment) showEventResult(result.entry); else showRelationshipResult(result.entry);
      }
      return;
    }
    zhouView.text = null;
    if (command === 'home') zhouView.screen = 'home';
    else if (command === 'groups') zhouView.screen = 'groups';
    else if (command === 'group') { zhouView.group = button.dataset.vnGroup; zhouView.screen = 'activities'; }
    else if (command === 'backActivities') zhouView.screen = 'activities';
    else if (command === 'activity' && Object.hasOwn(game.relationshipRules.ACTIVITIES, button.dataset.vnActivity)) { zhouView.activity = button.dataset.vnActivity; zhouView.amount = undefined; zhouView.screen = 'activity'; }
    else if (command === 'tier') zhouView.amount = Number(button.dataset.vnAmount);
    else if (command === 'topics') zhouView.screen = 'topics';
    else if (command === 'topic') { zhouView.screen = 'topics'; zhouView.text = game.relationshipRules.dialogue(state, button.dataset.vnTopic); }
    showZhouNing({ preserve: true });
    return;
  }
  if (button.dataset.zhouStudy) {
    const result = runCommand('executeAction', 'selfStudy', button.dataset.revision, undefined, Number(button.dataset.zhouStudy), { companionId: 'zhouNing' });
    if (result) { audio?.play('study'); showEventResult(result.entry); }
    return;
  }
  if (button.dataset.dialogAction === 'zhouTalk' || button.dataset.dialogAction === 'zhouPresentation') {
    const type = button.dataset.dialogAction === 'zhouTalk' ? 'talk' : 'presentation';
    const result = runCommand('interactWithZhouNing', type, button.dataset.revision, undefined, undefined, { characterVersion: 2 });
    if (result) { if (type === 'presentation') showEvent(); else showRelationshipResult(result.entry); }
    return;
  }
  if (button.id === 'smsSendButton') { requestSmsCode(); return; }
  if (dialogMode === 'exam' && state?.phase === 'examPending') {
    if (button.dataset.examQuestion !== undefined) { focusExamQuestion(Number(button.dataset.examQuestion)); return; }
    if (button.dataset.examMissing) { focusExamQuestion(state.exam.questions.findIndex((_, index) => state.exam.answers[index] === undefined || state.exam.answers[index] === null)); return; }
  }
  if (button.dataset.cheatExam) { confirmCheatExam(); return; }
  if (button.dataset.saveSlot) {
    if (dialogMode === 'save') selectSaveSlot(Number(button.dataset.saveSlot));
  } else if (button.dataset.loadSlot) {
    if (['load', 'admission'].includes(dialogMode)) loadGame(Number(button.dataset.loadSlot), button.dataset.saveSource);
  } else if (button.dataset.investmentPreset) {
    updateInvestment(button.dataset.investmentPreset, Number(button.dataset.amount));
  } else if (button.dataset.eventChoice) {
    const pending = state.pendingEvent;
    const event = pending && game.EVENTS[pending.id];
    const choice = event?.choices.find((item) => item.id === button.dataset.eventChoice);
    if (choice?.ending) {
      terminalChoice = { choiceId: button.dataset.eventChoice, revision: button.dataset.revision, instanceId: button.dataset.instance };
      showDialog('confirmEnding', choice.title, '<p>' + h(choice.description) + '</p><p class="dialog-note">这个选择会立即结束本局。确认后没有回头路。</p>', [{ id: 'confirmEventEnding', text: '确认选择' }, { id: 'backToEvent', text: '再想想', secondary: true }]);
      return;
    }
    const result = runCommand('submitEventChoice', button.dataset.eventChoice, button.dataset.revision, button.dataset.instance, eventDraft(button.dataset.eventChoice));
    if (!result) return;
    audio?.play('success');
    const feedback = result.entry.investment?.description || EVENT_CHOICE_FLAVOR[result.entry.event + ':' + result.entry.choice] || (result.entry.outcome ? result.entry.outcome + '。' : result.entry.title + '。');
    $('#actionFeedback').textContent = feedback;
    if (state.phase === 'ended') { saveCurrent(true); showResult(); }
    else if (result.entry.investment) showEventResult(result.entry);
    else if (result.entry.relationship) showRelationshipResult(result.entry);
    else if (state.phase === 'eventPending') { showEvent(); $('#dialogNotice').textContent = feedback; }
    else if (pending.id === 'zhouNingPresentation') { showZhouNing({ text: '好，我们改天再安排。今天也可以聊点别的。' }); }
    else if (needsCourseSelection()) { showCourseSelection(); $('#dialogNotice').textContent = feedback; }
    else { dialog.close(); showToast(feedback); }
  } else if (button.dataset.ending) {
    if (runCommand('chooseEnding', button.dataset.ending, button.dataset.revision)) { saveCurrent(true); showResult(); }
  }
});
$('#dialogButtons').addEventListener('click', (event) => {
  const button = event.target.closest('[data-dialog-action]');
  if (!button || uiLocked) return;
  const id = button.dataset.dialogAction;
  if (id === 'resume') { if (['finished', 'ended'].includes(dialogMode)) dialog.close(); else if (dialogMode === 'enrollment') showTutorial(); else resumePhase(); }
  else if (id === 'eventContinue' && dialogMode === 'eventResult') { acknowledgedResultRevision = state.revision; resumePhase(); }
  else if (id === 'relationshipContinue' && dialogMode === 'relationshipResult') {
    acknowledgedResultRevision = state.revision;
    if (state.phase === 'playing' && !needsCourseSelection()) showZhouNing(); else resumePhase();
  }
  else if (id === 'basketballContinue' && dialogMode === 'basketballResult') { acknowledgedResultRevision = state.revision; resumePhase(); }
  else if (id === 'admission') showAdmission();
  else if (id === 'loginPrompt') { loginSkipped = false; try { storage?.removeItem(LOGIN_SKIP_KEY); } catch (_) {} showLogin(); }
  else if (id === 'switchAccount') {
    loginSession = null;
    loginSkipped = false;
    try { storage?.removeItem(LOGIN_KEY); storage?.removeItem(LOGIN_SKIP_KEY); } catch (_) {}
    showLogin();
  }
  else if (id === 'loginSkip') {
    loginSkipped = true;
    try { storage?.setItem(LOGIN_SKIP_KEY, '1'); } catch (_) {}
    showAdmission();
  }
  else if (id === 'npcLeave' && dialogMode === 'npc') dialog.close();
  else if (id === 'confirmSave' && dialogMode === 'confirmSave' && saveTarget !== null) finishSave(saveTarget);
  else if (id === 'backToSave') showSave();
  else if (id === 'beginExam' && dialogMode === 'confirmExam') {
    if (runCommand('beginExam', null, button.dataset.revision)) {
      if (activeSaveSlot !== null) saveCurrent(true);
      showExam();
    }
  }
  else if (id === 'settle' && dialogMode === 'confirm') { if (runCommand('endTerm', null, button.dataset.revision)) { saveCurrent(true); showSummary(); } }
  else if (id === 'next' && dialogMode === 'summary') { if (runCommand('continueGame', null, button.dataset.revision)) resumePhase(); }
  else if (id === 'cheatExam' && dialogMode === 'confirmCheat') { if (runCommand('cheatExam', null, button.dataset.revision)) { saveCurrent(true); showResult(); } }
  else if (id === 'backToExam' && dialogMode === 'confirmCheat') showExam();
  else if (id === 'confirmEventEnding' && dialogMode === 'confirmEnding' && terminalChoice) {
    const selected = terminalChoice;
    terminalChoice = null;
    if (runCommand('submitEventChoice', selected.choiceId, selected.revision, selected.instanceId)) { saveCurrent(true); showResult(); }
  }
  else if (id === 'backToEvent' && dialogMode === 'confirmEnding') { terminalChoice = null; showEvent(); }
  else if (id === 'restart') askRestart();
  else if (id === 'confirmRestart') {
    cancelZhouRequest();
    zhouChatDraft = ''; zhouChatNotice = ''; zhouHistoryOpen = false;
    cancelBasketball();
    closePlace();
    resetNpcSystem();
    clearSeasonEffects();
    audio?.stopBgm();
    state = null;
    eventDrafts.clear();
    actionDrafts.clear();
    acknowledgedResultRevision = -1;
    activeSaveSlot = null;
    saveTarget = null;
    savedRevision = -1;
    savedAt = '';
    clearTimeout(unlockTimer);
    uiLocked = false;
    showAdmission();
  }
});
hotspots.forEach((hotspot) => hotspot.addEventListener('click', () => openPlace(hotspot.dataset.place, hotspot)));
$('#relationshipList')?.addEventListener('click', (event) => { if (event.target.closest('[data-zhou-open]') && !dialog.open) showZhouNing(); });
const npcLayer = $('#npcLayer');
if (npc && npcLayer) {
  npcLayer.addEventListener('click', (event) => {
    const button = event.target.closest('[data-npc-id]');
    if (button) talkToNpc(button.dataset.npcId);
  });
  npcTick();
}
$('#backButton').addEventListener('click', closePlace);
$('#basketballQuit')?.addEventListener('click', () => basketballSession?.finish());
basketballDialog?.addEventListener('cancel', (event) => { if (basketballSession) event.preventDefault(); });
$('#endTermButton').addEventListener('click', requestEndTerm);
$('#saveButton').addEventListener('click', showSave);
$('#dialogSave').addEventListener('click', showSave);
$('#loadButton').addEventListener('click', showLoad);
$('#helpButton').addEventListener('click', () => { if (state) showTutorial(); });
$('#backgroundButton').addEventListener('click', () => { if (state) showBackground(); });
$('#restartButton').addEventListener('click', () => { if (state) askRestart(); });
$('#historyButton').addEventListener('click', () => { if (state) showDialog('history', '成长记录', growthRecord(true, true), [{ id: 'resume', text: '继续安排' }]); });
document.querySelectorAll('[data-record-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    recordFilter = button.dataset.recordFilter || 'all';
    renderRecordsPanel();
  });
});

document.querySelectorAll('[data-attr]').forEach((node) => {
  const open = (event) => {
    if (event) event.stopPropagation();
    showAttrPopover(node.dataset.attr, node);
  };
  node.addEventListener('click', open);
  node.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(event); }
  });
});

const avatarButton = $('#playerAvatar');
if (avatarButton && typeof avatarButton.addEventListener === 'function') {
  avatarButton.addEventListener('click', (event) => {
    event.stopPropagation();
    showPopover(openPopoverName === 'avatar' ? null : 'avatar');
  });
}
const playerNameButton = $('#playerName');
if (playerNameButton && typeof playerNameButton.addEventListener === 'function') {
  playerNameButton.addEventListener('click', (event) => {
    event.stopPropagation();
    showPopover(openPopoverName === 'name' ? null : 'name');
  });
}
const popoverChangeAvatar = $('#popoverChangeAvatar');
if (popoverChangeAvatar && typeof popoverChangeAvatar.addEventListener === 'function') popoverChangeAvatar.addEventListener('click', pickAvatar);
const popoverResetAvatar = $('#popoverResetAvatar');
if (popoverResetAvatar && typeof popoverResetAvatar.addEventListener === 'function') popoverResetAvatar.addEventListener('click', resetAvatar);
const nameSaveButton = $('#nameSaveButton');
if (nameSaveButton && typeof nameSaveButton.addEventListener === 'function') nameSaveButton.addEventListener('click', submitNickname);
const nameCancelButton = $('#nameCancelButton');
if (nameCancelButton && typeof nameCancelButton.addEventListener === 'function') nameCancelButton.addEventListener('click', closePopovers);
const nameInput = $('#nameInput');
if (nameInput && typeof nameInput.addEventListener === 'function') {
  nameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); submitNickname(); }
  });
}
const avatarInput = $('#avatarInput');
if (avatarInput && typeof avatarInput.addEventListener === 'function') {
  avatarInput.addEventListener('change', () => {
    const file = avatarInput.files && avatarInput.files[0];
    if (file) saveAvatarFile(file);
    try { avatarInput.value = ''; } catch (_) {}
  });
}
const motionButton = $('#motionButton');
if (motionButton && typeof motionButton.addEventListener === 'function') {
  motionButton.addEventListener('click', () => {
    motionOn = !motionOn;
    applyMotion();
    try { window.localStorage.setItem(MOTION_KEY, motionOn ? '1' : '0'); } catch (_) {}
  });
}
const hotspotButton = $('#hotspotButton');
if (hotspotButton && typeof hotspotButton.addEventListener === 'function') {
  hotspotButton.addEventListener('click', () => {
    hotspotsOn = !hotspotsOn;
    applyHotspots();
    try { window.localStorage.setItem(HOTSPOT_KEY, hotspotsOn ? '1' : '0'); } catch (_) {}
  });
}
const resetAvatarButton = $('#resetAvatarButton');
if (resetAvatarButton && typeof resetAvatarButton.addEventListener === 'function') resetAvatarButton.addEventListener('click', resetAvatar);
loadAvatar();
loadPreferences();

document.querySelectorAll('.app-menu-button').forEach((button) => {
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    closePopovers();
    setPanel(openPanelName === button.dataset.panel ? null : button.dataset.panel);
  });
});
document.addEventListener('click', (event) => {
  if (!openPanelName) return;
  const target = event.target;
  if (target && typeof target.closest === 'function' && (target.closest('.app-bar') || target.closest('.app-panels'))) return;
  closePanel();
});
window.addEventListener('resize', syncBarHeight);
syncBarHeight();
document.addEventListener('click', (event) => {
  if (!openPopoverName) return;
  const target = event.target;
  if (target && typeof target.closest === 'function' && (target.closest('.profile-popover') || target.closest('#playerAvatar') || target.closest('#playerName'))) return;
  closePopovers();
});
const versionNote = $('#versionNote');
if (versionNote) versionNote.textContent = '版本 ' + (game.RULES.appVersion || '未知') + ' · 规则 v' + (game.RULES.version || '—') + ' · 存档格式 v' + (game.RULES.saveFormatVersion || '—');
$('#exportLogButton').addEventListener('click', () => { if (state) exportLog(); });
const soundButton = $('#soundButton');
if (audio) {
  soundButton.textContent = '声音:' + (audio.isEnabled() ? '开' : '关');
  soundButton.addEventListener('click', () => {
    audio.setEnabled(!audio.isEnabled());
    soundButton.textContent = '声音:' + (audio.isEnabled() ? '开' : '关');
  });
} else {
  soundButton.hidden = true;
}
document.addEventListener('click', (event) => {
  if (event.target.closest('button')) audio?.play('click');
}, { capture: true });
$('#debugPanel').hidden = !debug;
window.addEventListener('storage', (event) => {
  if (activeSaveSlot !== null && (event.key === null || event.key === CampusSave.getSlotKeys(activeSaveSlot).primary)) {
    $('#sessionNote').textContent = '另一个标签页更新了栏位 ' + activeSaveSlot + '。当前游戏仍可继续，保存前请读取最新存档。';
    showToast('当前存档栏位发生变化，请先读取最新存档');
  }
});
dialog.addEventListener('cancel', (event) => {
  if (!state || ['eventPending', 'examPending', 'summary', 'endingChoice'].includes(state.phase) || ['admission', 'login', 'restart', 'enrollment', 'courseSelection', 'exam', 'confirmCheat', 'confirmEnding'].includes(dialogMode)) event.preventDefault();
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (openPopoverName) { closePopovers(); return; }
  if (openPanelName) { closePanel(); return; }
  if (activePlace && !dialog.open) closePlace();
});
window.addEventListener('beforeunload', guardUnsavedProgress);
if (typeof HTMLDialogElement === 'undefined' || typeof HTMLDialogElement.prototype.showModal !== 'function') {
  $('.game-shell').innerHTML = '<div class="browser-notice"><h2>请使用较新的浏览器打开</h2><p>本游戏需要支持弹窗等现代网页特性的浏览器。请升级微信或浏览器，或用系统浏览器打开本地址。</p><p class="browser-notice-url">https://zjr231.github.io/BJTU-Life-Simulator/</p></div>';
} else {
  showAdmission();
}
