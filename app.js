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
const PLACE_SOUNDS = { think: 'study', library: 'study', yifu: 'study', dorm: 'relax', ginkgo: 'relax', track: 'sport', activity: 'opportunity', gate: 'opportunity', hospital: 'info', auditorium: 'info', hotel: 'info' };
const ACTION_SOUNDS = { study: 'study', tutoring: 'study', selfStudy: 'study', furtherStudy: 'study', projectWork: 'study', applyProject: 'opportunity', applyClub: 'opportunity', clubWork: 'opportunity', applyInternship: 'opportunity', internshipWork: 'paper', jobPreparation: 'paper', work: 'paper', rest: 'relax', chat: 'relax', walk: 'relax', exercise: 'sport', gym: 'sport', teamSport: 'sport', soloSport: 'sport', treatment: 'success' };
const dialog = $('#termDialog');
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
let budgetDraft = null;
let budgetDraftTerm = null;
let lastHotspot = null;
let dialogMode = null;
let terminalChoice = null;
let uiLocked = false;
let unlockTimer;
let toastTimer;
let placeEnterTimer;
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
let pendingActionExtra = null;
let acknowledgedResultRevision = -1;
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
  'internshipMilestone:settle': '证明开好了，章盖得很正。你把它夹进简历的最后一页。',
  'internshipMilestone:continue': '你把证明的事往后放了放。工位还是那张，活儿照干，日薪照拿。',
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
  'medicalInsurance:register': '参保资料核对完成，基础参保费用由家里另行承担。',
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
const BUDGET_EFFECT_NAMES = { mood: '心情', social: '社交', energy: '精力', fitness: '体能' };
function budgetEffectText(effects) {
  return Object.entries(effects || {}).filter(([, value]) => value).map(([key, value]) => (BUDGET_EFFECT_NAMES[key] || key) + ' ' + (value > 0 ? '+' : '−') + Math.abs(value)).join('、') || '无属性变化';
}
function budgetTierExtras(dimension, tier) {
  if (dimension.id !== 'housing') return '';
  const parts = [];
  if (tier.restMultiplier) parts.push('休息恢复 ×' + Number(tier.restMultiplier).toFixed(2));
  if (tier.dormMood || tier.dormSocial) parts.push('宿舍事件/交流 心情' + (tier.dormMood >= 0 ? '+' : '−') + Math.abs(tier.dormMood) + '/社交' + (tier.dormSocial >= 0 ? '+' : '−') + Math.abs(tier.dormSocial));
  else parts.push('宿舍事件/交流 无额外加成');
  return parts.join('；');
}
function budgetPickerMarkup() {
  return '<div class="budget-picker">' + Object.values(game.BUDGET_DIMENSIONS).map(dimension => {
    const tiers = dimension.tiers.map(tier => {
      const selected = budgetDraft[dimension.id] === tier.id;
      return '<button type="button" class="budget-tier' + (selected ? ' is-selected' : '') + '" data-budget-dimension="' + dimension.id + '" data-budget-tier="' + tier.id + '" aria-pressed="' + selected + '"><span class="budget-tier-head"><b>' + h(tier.label) + '</b><em>' + tier.cost + ' 元</em></span><small>' + h(budgetEffectText(tier.effects)) + '</small>' + (dimension.pending ? '<span class="budget-badge-pending">影响待完善</span>' : '') + (dimension.id === 'housing' ? '<small>' + h(budgetTierExtras(dimension, tier)) + '</small>' : '') + '</button>';
    }).join('');
    return '<fieldset class="budget-dimension"><legend>' + h(dimension.label) + ' · ' + h(dimension.title) + '</legend><p>' + h(dimension.description) + '</p><div class="budget-tier-list">' + tiers + '</div></fieldset>';
  }).join('') + '</div>';
}
function budgetSummaryMarkup() {
  const grant = game.currentGrant(state);
  if (!grant) return '';
  const plan = game.budgetPlan(budgetDraft);
  if (!plan) return '<p class="action-reason">预算档位无效</p>';
  const delta = plan.costs.total - grant.livingCost;
  const affordable = delta <= state.money;
  const preview = game.previewChanges(state, { recovery: plan.effects.energy, mood: plan.effects.mood, social: plan.effects.social, fitness: plan.effects.fitness });
  const projectedFitness = state.fitness + preview.fitness;
  return '<div class="budget-summary"><h3>本学期预算合计 ' + plan.costs.total + ' 元</h3><p>家庭本学期到账 ' + grant.allowance + ' 元 · 默认预留 ' + grant.livingCost + ' 元 · 当前可用 ' + state.money + ' 元</p><p>' + (delta > 0 ? '需追加 ' + delta + ' 元' : delta < 0 ? '退回 ' + (-delta) + ' 元' : '与默认预留持平') + '</p><p>即时变化：' + h(changeText(preview)) + '</p>' + (projectedFitness < 25 ? '<p class="action-warning">预计体能 ' + projectedFitness + '，低于 25 会生病。</p>' : '') + (!affordable ? '<p class="action-reason">余额不足，还差 ' + (delta - state.money) + ' 元</p>' : '') + '</div>';
}
function showBudget() {
  if (!state || state.phase !== 'playing') { resumePhase(); return; }
  const grant = game.currentGrant(state);
  if (!grant || !grant.budget || grant.budgetChosen) { resumePhase(); return; }
  if (budgetDraftTerm !== state.term) {
    budgetDraft = { ...grant.budget };
    budgetDraftTerm = state.term;
  }
  const plan = game.budgetPlan(budgetDraft);
  const affordable = !!plan && plan.costs.total - grant.livingCost <= state.money;
  const body = '<p>这是' + h(game.TERM_NAMES[state.term - 1]) + '。先安排本学期的衣、食、住、行，确认后再进入选课。</p>' + budgetPickerMarkup() + budgetSummaryMarkup() + '<p id="budgetError" class="action-reason" role="alert"></p>';
  showDialog('budget', '学期生活预算', body, [{ id: 'budgetConfirm', text: '确认预算', disabled: !affordable }]);
}
function selectBudgetTier(dimension, tierId) {
  const config = game.BUDGET_DIMENSIONS[dimension];
  if (!config || !config.tiers.some(tier => tier.id === tierId)) return;
  budgetDraft = { ...(budgetDraft || {}), [dimension]: tierId };
  showBudget();
}
function submitBudget() {
  if (!state || !budgetDraft) return;
  const plan = game.budgetPlan(budgetDraft);
  if (!plan) { showToast('预算档位无效'); return; }
  const result = runCommand('chooseBudget', { ...budgetDraft }, state.revision);
  if (!result) {
    const error = $('#budgetError');
    if (error) error.textContent = '预算未能确认，请检查余额或档位。';
    return;
  }
  budgetDraft = null;
  budgetDraftTerm = null;
  audio?.play('success');
  showToast('学期预算已确认');
  resumePhase();
}
function budgetMarkup() {
  const budget = game.budgetFor(state);
  if (!budget) return '<p>本学期沿用旧版生活费结算，下一学期开始按家庭情况一次性发放学期生活费并预留日常开支。</p>';
  const { family, grant } = budget;
  const plan = grant.budget ? game.budgetPlan(grant.budget) : null;
  const dimensionLines = plan ? ['clothing', 'food', 'housing', 'transport'].map(key => '<span>' + h(plan.items[key].label) + ' <b>' + plan.items[key].cost + ' 元</b></span>').join('') : '';
  const status = grant.budget && grant.budgetChosen
    ? '<span>预算合计 <b>' + grant.livingCost + ' 元</b></span><span>' + (grant.budgetDelta > 0 ? '追加' : grant.budgetDelta < 0 ? '退回' : '与默认预留持平') + '<b>' + (grant.budgetDelta > 0 ? '−' : grant.budgetDelta < 0 ? '+' : '') + Math.abs(grant.budgetDelta) + ' 元</b></span>'
    : '<span>默认预留 <b>' + grant.livingCost + ' 元</b></span><span>开学选课时先确认衣/食/住/行，确认后多退少补</span>';
  return '<section class="wallet-budget"><h3>本学期生活预算 · ' + h(family.label) + '</h3><p>家里已一次性转入本学期生活费 <b>' + family.termAllowance + ' 元</b>。</p><div class="summary-lines"><span>上学期结余 <b>' + grant.openingMoney + ' 元</b></span><span>家庭生活费到账 <b>+' + grant.allowance + ' 元</b></span>' + (plan ? dimensionLines : '') + status + (grant.debtPaid ? '<span>校园卡赔偿 <b>−' + grant.debtPaid + ' 元</b></span>' : '') + '<span>开学可支配资金 <b>' + grant.moneyAfter + ' 元</b></span><span>当前可用余额 <b>' + state.money + ' 元</b></span></div><p class="dialog-note">衣、食、住、行各自独立选档，学期预算为四项之和；确认后才进入选课。高预算从结余支付，低预算退回；学费、基础参保与返乡车票由家庭另行承担，结余跨学期保留。</p>' + ((state.cardDebt || 0) ? '<p class="action-warning">校园卡赔偿待还 ' + state.cardDebt + ' 元，后续收入优先偿还。</p>' : '') + '</section>';
}
function walletHistory() {
  return budgetMarkup() + (state.economy ? '<h3>历次学期拨款</h3><ul>' + state.economy.grants.map(grant => {
    const plan = grant.budget ? game.budgetPlan(grant.budget) : null;
    const detail = plan ? '（' + ['clothing', 'food', 'housing', 'transport'].map(key => plan.items[key].label + ' ' + plan.items[key].cost + ' 元').join('、') + '）' : '';
    return '<li>' + h(game.TERM_NAMES[grant.term - 1]) + '：家庭转入 ' + grant.allowance + ' 元，预算 ' + grant.livingCost + ' 元' + detail + '，结转 ' + grant.openingMoney + ' 元' + (grant.debtPaid ? '，偿还 ' + grant.debtPaid + ' 元' : '') + '，开学可用 ' + grant.moneyAfter + ' 元。</li>';
  }).join('') + '</ul>' : '');
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
    ['钱包', state.money, '元 · 可支配余额' + ((state.cardDebt || 0) ? ' · 待还 ' + state.cardDebt + ' 元' : ''), 'money']
  ];
  return items.map(([name, value, note, style]) => '<div class="attribute ' + style + '"><span class="attribute-name">' + h(name) + '</span><b>' + h(value) + '</b><small>' + h(note) + '</small>' + (style === 'money' ? '<button type="button" class="wallet-details" data-wallet-budget="1">查看收支</button>' : '') + '</div>').join('');
}
// 「手头的事」抽屉：只渲染 game.advisories(state) 的推导结果，界面层不做状态判断。
function renderAdvisories() {
  const list = $('#advisoryList');
  const badge = $('#advisoryBadge');
  if (!state || !list) return;
  const board = game.advisories(state);
  if (board.groups.length === 0) {
    list.innerHTML = '<p class="app-panel-note">' + h(game.ADVISORIES.emptyNote) + '</p>';
  } else {
    list.innerHTML = board.groups.map((group) => '<section class="advisory-group" data-group="' + h(group.id) + '">'
      + '<h4 class="advisory-group-title"><i class="advisory-dot"></i>' + h(group.title) + '<span class="advisory-count">' + group.items.length + '</span></h4>'
      + group.items.map((item) => '<article class="advisory-item' + (item.urgent ? ' is-urgent' : '') + '">'
        + '<div class="advisory-head"><span class="advisory-name">' + h(item.title) + '</span>'
        + (item.tag ? '<span class="advisory-tag tone-' + h(item.tagTone) + '">' + h(item.tag) + '</span>' : '')
        + '</div>'
        + (item.detail ? '<p class="advisory-detail">' + h(item.detail) + '</p>' : '')
        + (item.detailList.length ? '<ul class="advisory-sublist">' + item.detailList.map((row) => '<li>' + h(row) + '</li>').join('') + '</ul>' : '')
        + '</article>').join('')
      + '</section>').join('');
  }
  if (badge) {
    badge.hidden = board.total === 0;
    badge.textContent = String(board.total);
    badge.classList.toggle('is-urgent', board.urgentCount > 0);
  }
}
// 「简历」抽屉：只渲染 game.resume(state) 的推导结果；要件 chips 是二期岗位门槛的判定预览。
function renderResume() {
  const body = $('#resumeBody');
  if (!state || !body) return;
  const resume = game.resume(state);
  const reqLabels = { hasInternship: '实习', hasProject: '项目', hasContest: '竞赛', hasClub: '社团' };
  const reqs = '<div class="resume-reqs">' + Object.entries(resume.requirements).map(([key, met]) => '<span class="resume-req' + (met ? ' is-met' : '') + '">' + h(reqLabels[key]) + (met ? ' ✓' : ' ✗') + '</span>').join('') + '</div>';
  const sections = resume.sections.map((section) => '<h4 class="resume-group-title">' + h(section.title) + '</h4>'
    + (section.items.length ? '<ul>' + section.items.map((item) => '<li>' + h(game.TERM_NAMES[item.term - 1]) + '：' + h(EXPERIENCE_LABELS[item.type] || '校园经历')
      + (item.company ? '<span class="resume-position">' + h(item.company) + ' · ' + h(item.title) + ' <em>T' + item.tier + '</em></span>' : '') + '</li>').join('') + '</ul>' : '<p class="resume-none">暂无</p>')).join('');
  const others = resume.others.length
    ? '<p class="resume-others">' + h(game.RESUME.othersNote.replace('{list}', resume.others.map((item) => EXPERIENCE_LABELS[item.type] || '校园经历').join('、')).replace('{count}', resume.others.length)) + '</p>'
    : '';
  body.innerHTML = reqs + sections + others;
}
const GROWTH_ICONS = {
  bed: '<path fill="#b99164" d="M5 19h4v21H5zm34 5h4v16h-4zM9 32h30v5H9z"/><path fill="#ead9b4" d="M9 19h11v8H9z"/><path fill="#728f87" d="M21 22h18v10H9v-5h12z"/><path fill="#aec4ab" d="M24 22h15v4H24z"/><path fill="#d4b17c" d="M5 17h4v4H5zm34 5h4v4h-4z"/>',
  books: '<path fill="#c49061" d="M6 36h36v4H6z"/><path fill="#ab646a" d="M8 14h7v22H8z"/><path fill="#e4cc9d" d="M9 17h5v2H9zm0 12h5v2H9z"/><path fill="#7898a1" d="M17 10h7v26h-7z"/><path fill="#cad8c6" d="M18 14h5v2h-5zm0 16h5v2h-5z"/><path fill="#c7a160" d="m26 17 6-2 6 19-6 2z"/><path fill="#89a781" d="M35 8h4v13h-4zM31 9h4v6h-4zm8-4h4v8h-4z"/><path fill="#b67c63" d="M32 21h10v7H32z"/>',
  alarm: '<path fill="#c29a64" d="M13 8h22v4H13zM9 12h30v24H9zM13 36h22v4H13zM6 15h3v18H6zm33 0h3v18h-3zM11 39h5v4h-5zm21 0h5v4h-5z"/><path fill="#dfcda9" d="M13 16h22v16H13zM17 12h14v24H17z"/><path fill="#4d5263" d="M23 16h3v11h-3zm3 8h6v3h-6zM23 30h3v3h-3z"/><path fill="#819aa2" d="M6 7h10v4H6zm26 0h10v4H32zM20 4h8v4h-8z"/>'
};
let selectedGrowthId = 'bedding';
function growthIcon(node) {
  return '<svg viewBox="0 0 48 48" aria-hidden="true" shape-rendering="crispEdges">' + (GROWTH_ICONS[node.icon] || GROWTH_ICONS.bed) + '</svg>';
}
function growthNodeState(node) {
  if (node.purchased) return { type: 'owned', label: '已拥有 ✓' };
  if (node.available) return { type: 'ready', label: '可添置' };
  return node.reason.startsWith('余额不足') ? { type: 'short', label: '余额不足' } : { type: 'locked', label: '条件未满足' };
}
function growthNodeMarkup(node) {
  const status = growthNodeState(node);
  return '<button type="button" class="growth-node is-' + status.type + (selectedGrowthId === node.id ? ' is-selected' : '')
    + '" data-growth-select="' + node.id + '" aria-pressed="' + (selectedGrowthId === node.id) + '" title="' + h(node.benefit + '；' + (node.purchased ? status.label : node.reason || status.label)) + '">'
    + '<span class="growth-node-frame">' + growthIcon(node) + '<span class="growth-node-price">' + (node.purchased ? '已拥有 ✓' : node.price + ' 元') + '</span></span>'
    + '<span class="growth-node-name">' + h(node.title) + '</span><span class="growth-node-status">' + status.label + '</span></button>';
}
function renderGrowth() {
  const toggle = $('#growthToggle');
  if (toggle) toggle.hidden = !state;
  if (!state) return;
  const board = game.growthStatus(state);
  $('#growthCount').textContent = board.ownedCount + ' / ' + board.nodes.length;
  const selected = board.nodes.find(node => node.id === selectedGrowthId) || board.nodes[0];
  selectedGrowthId = selected.id;
  const status = growthNodeState(selected);
  const routine = board.nodes.find(node => node.id === 'routine');
  const restProgress = Math.min(board.restCount, routine.requiredRests);
  $('#growthOverview').innerHTML = '<div><span>可支配余额</span><b>' + state.money + '<small> 元</small></b></div><div><span>本局已拥有</span><b>' + board.ownedCount + '<small> / ' + board.nodes.length + ' 项</small></b></div>';
  let detail = selected.requiredRests ? '累计休息 ' + Math.min(board.restCount, selected.requiredRests) + ' / ' + selected.requiredRests + ' 次' : '无需额外前置';
  if (selected.purchased) {
    detail = game.TERM_NAMES[selected.purchased.term - 1] + '已购入 · ' + (selected.openingEnergy
      ? (state.term > selected.purchased.term ? '开学精力加成已生效' : '下学期开始生效')
      : selected.restsPerTerm ? '本学期心情加成剩余 ' + selected.remainingRests + ' 次' : '休息加成持续生效');
  }
  $('#growthDetails').innerHTML = '<div class="growth-selected-icon is-' + status.type + '">' + growthIcon(selected) + '</div>'
    + '<p class="growth-category">' + h(selected.category) + ' / 本局持续</p><h4>' + h(selected.title) + '</h4>'
    + '<p class="growth-selection-state is-' + status.type + '">' + status.label + '</p>'
    + '<p class="growth-description">' + h(selected.description) + '</p>'
    + '<div class="growth-detail-block"><span>长期收益</span><p class="growth-benefit">' + h(selected.benefit) + '</p></div>'
    + '<div class="growth-detail-block"><span>' + (selected.purchased ? '持有状态' : '解锁条件') + '</span><p class="growth-detail">' + h(detail) + '</p></div>'
    + (!selected.purchased && !selected.available ? '<p class="growth-reason">' + h(selected.reason) + '</p>' : '');
  $('#growthPurchase').innerHTML = '<button type="button" class="growth-buy-button" data-growth-buy="' + selected.id + '" data-revision="' + state.revision + '"'
    + (selected.purchased || !selected.available || uiLocked || dialog.open ? ' disabled' : '') + '>'
    + (selected.purchased ? '已拥有 · 无需重复添置' : '确认添置 <span>' + selected.price + ' 元</span>') + '</button>';
  const lifeNodes = board.nodes.filter(node => !node.requiredRests).map(growthNodeMarkup).join('');
  $('#growthNodes').innerHTML = '<section class="growth-branch"><h5><span>01</span>生活与空间</h5><p>生活小物 · 两项可独立添置</p><div class="growth-branch-row">' + lifeNodes + '</div></section>'
    + '<section class="growth-branch"><h5><span>02</span>习惯养成</h5><p>完成行动 · 解锁下一步计划</p><div class="growth-branch-row">'
    + '<div class="growth-milestone' + (restProgress >= routine.requiredRests ? ' is-complete' : '') + '"><span class="growth-milestone-frame">'
    + '<svg viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 32h28M13 32V18h22v14M13 22h8v-4M9 32v6m30-6v6M26 10h10l-10 7h10"/></svg>'
    + '<b>' + restProgress + ' / ' + routine.requiredRests + '</b></span><span class="growth-node-name">累计休息</span><span class="growth-node-status">' + (restProgress >= routine.requiredRests ? '条件已达成 ✓' : '完成 3 次休息') + '</span></div>'
    + '<span class="growth-link' + (restProgress >= routine.requiredRests ? ' is-complete' : '') + '" aria-hidden="true"></span>' + growthNodeMarkup(routine) + '</div></section>';
}
// 头像：点击可上传本地图片，压缩后存本地（只影响界面，不进存档格式）。
const AVATAR_KEY = 'bjt-life-avatar';
function setAvatarImage(dataUrl) {
  const avatar = $('#playerAvatar');
  if (!avatar || !avatar.style) return;
  if (dataUrl) {
    avatar.style.backgroundImage = 'url("' + dataUrl + '")';
    avatar.classList.add('has-image');
  } else {
    avatar.style.backgroundImage = '';
    avatar.classList.remove('has-image');
  }
}
function loadAvatar() {
  try {
    const saved = window.localStorage && window.localStorage.getItem(AVATAR_KEY);
    if (saved) setAvatarImage(saved);
  } catch (_) {}
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
  $('#growthToggle')?.setAttribute('aria-expanded', name === 'growth' ? 'true' : 'false');
  if (name === 'growth') {
    $('#growthNotice').textContent = '';
    renderGrowth();
  }
}
function closePanel() {
  const wasGrowth = openPanelName === 'growth';
  setPanel(null);
  if (wasGrowth) $('#growthToggle')?.focus({ preventScroll: true });
}
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
function renderState() {
  if (!state) return;
  $('#playerLabel').textContent = (state.background.college ? state.background.college + ' · ' : '') + state.background.major;
  const avatar = $('#playerAvatar');
  if (avatar) avatar.textContent = String(state.nickname || '北').trim().slice(0, 1) || '北';
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
  $('#energyLabel').textContent = '精力 ' + state.energy + ' / 100';
  $('#mapStats').innerHTML = statsMarkup();
  const fitnessWarning = $('#fitnessWarning');
  if (fitnessWarning) {
    fitnessWarning.hidden = !game.isSick(state);
    fitnessWarning.textContent = game.isSick(state) ? '身体已经撑不住：先去校医院就诊，否则无法安排其他行动。' : '';
  }
  $('#preparationValue').textContent = state.preparation + ' / 100';
  $('#preparationMeter').value = state.preparation;
  $('#placeStats').innerHTML = '<div class="place-resources"><span>时间 <b>' + state.time + ' / 12</b></span><span>精力 <b>' + state.energy + ' / 100</b></span><span>学习进度 <b>' + state.preparation + ' / 100</b></span></div><div class="place-attributes">' + statsMarkup() + '</div>';
  const selectedIds = state.selectedCourses || [];
  const selectedNames = selectedIds.map((id) => game.courseById(id)?.name || id).join('、') || '未选课';
  $('#termBrief').innerHTML = '<div>本学期课程 <b>' + h(selectedNames) + '</b>' + (state.phase === 'examPending' ? ' · 考试待提交' : '') + '</div><div>平均成绩 <b>' + (state.courses.length ? game.averageGrade(state).toFixed(1) : '待结算') + '</b> · 达标 <b>' + state.courses.filter((item) => item.passed).length + '/8 学期</b></div>';
  renderAdvisories();
  renderResume();
  renderGrowth();
  $('#endTermButton').textContent = ({ eventPending: '处理当前事件', examPending: '继续期末考试', summary: '查看学期总结', endingChoice: '选择毕业方向', finished: '查看毕业结果', ended: '查看本局结局' })[state.phase] || (selectedIds.length ? '结束学期并考试' : '结束学期');
  $('#sessionNote').textContent = savedAt ? '栏位 ' + activeSaveSlot + ' · ' + (savedRevision === state.revision ? '当前进度已保存 · ' : '当前有未保存进度 · ') + displayTime(savedAt) : '尚未保存；点击保存选择栏位，之后自动保存到该栏位。';
  $('#dialogSave').hidden = ['admission', 'login', 'restart', 'save', 'load', 'confirmSave', 'npc', 'courseSelection', 'budget', 'confirmCheat', 'confirmEnding', 'positionPicker'].includes(dialogMode);
  if (activePlace) renderActions();
  if (debug) $('#debugSummary').textContent = '规则 ' + state.rulesVersion + ' · 阶段 ' + state.phase + ' · revision ' + state.revision + ' · 随机调用 ' + state.rng.calls;
}
function changeText(changes) {
  const names = { time: '时间', energy: '精力', money: '钱包', preparation: '学习进度', social: '社交', fitness: '体能', mood: '心情', furtherStudy: '深造准备', jobPreparation: '求职准备' };
  return Object.entries(changes || {}).filter(([, value]) => value !== 0).map(([key, value]) => names[key] + ' ' + (value > 0 ? '+' : '−') + Math.abs(value) + (key === 'money' ? ' 元' : '')).join(' · ') || '没什么明显变化';
}
function debtFeedback(entry) {
  return (entry.cardDebtPaid ? ' 已偿还校园卡赔偿 ' + entry.cardDebtPaid + ' 元。' : '') + (entry.cardDebtAdded ? ' 校园卡赔偿待还 ' + entry.cardDebtAdded + ' 元，后续收入优先偿还。' : '');
}
// 实习段结算反馈：让玩家明确知道这笔段收入来自哪家公司哪个岗位。
function positionFeedback(entry) {
  if (!entry.positionReward) return '';
  return ' ' + entry.positionReward.title + ' 段收入 +' + entry.positionReward.income + ' 元，求职准备 +' + entry.positionReward.jobPreparation + '。';
}
function extraFeedback(entry) {
  const extra = entry.extra ? (entry.extra.skipped ? ' 本次基础收获已达到上限，未购买额外项目，也未扣费。' : ' 额外消费：' + entry.extra.title + ' −' + entry.extra.price + ' 元，额外收获 ' + changeText(entry.extra.bonuses) + '。') : '';
  return extra + (entry.growthBonuses ? ' 校园养成额外恢复：' + changeText(entry.growthBonuses) + '（已计入本次收获）。' : '');
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
    // 实习投入卡显示当前岗位，让岗位库的选择在实习期间持续可见。
    const currentPosition = id === 'internshipWork' && game.POSITIONS[state.chains.internship.positionId] ? game.POSITIONS[state.chains.internship.positionId] : null;
    const positionLine = currentPosition ? '<p class="action-position">当前岗位：' + h(game.COMPANIES[currentPosition.company].name) + ' · ' + h(currentPosition.title) + ' <em>T' + currentPosition.tier + '</em> · 办证明时结算段收入 ' + currentPosition.rewards.income + ' 元 + 求职准备 ' + currentPosition.rewards.jobPreparation + '</p>' : '';
    // 三期：累计投入进度 + 达标后的「办理实习证明」（达标后仍可继续投入赚日薪）。
    const internship = id === 'internshipWork' ? game.internshipProgress(state) : null;
    const progressLine = internship
      ? '<p class="action-position' + (internship.met ? ' is-met' : '') + '">累计投入：时间 ' + internship.workTime + ' / ' + internship.reqTime + ' · 精力 ' + internship.workEnergy + ' / ' + internship.reqEnergy + (internship.met ? ' · 门槛已达标，可办证明' : '') + '</p>'
        + (internship.met ? '<button type="button" class="settle-internship" data-settle-internship="1" data-revision="' + state.revision + '"' + (uiLocked ? ' disabled' : '') + '>办理实习证明</button>' : '')
      : '';
    return '<article class="action-card"><div class="action-card-top"><h3>' + h(action.title) + '</h3><span class="action-count">' + (action.limit ? '本学期 ' + (state.counts[id] || 0) + ' / ' + action.limit + ' 次' : action.chain ? '事件链行动' : '按剩余时间安排') + '</span></div>' + positionLine + progressLine + '<p>' + h(profile ? profile.description : action.description) + '</p>' + (action.backgroundBonus ? '<p class="background-bonus">背景特点：' + h(action.backgroundBonus) + '</p>' : '') + (profile ? investmentControls({ id }, profile, { amount }, 'action') : '') + '<div class="action-cost" id="investment-cost-action-' + id + '">' + h(costs(preview?.ok ? preview.effect : game.fitnessAdjustedEffect(state, action, id))) + '</div>' + (action.hint ? '<p class="action-hint">' + h(action.hint) + '</p>' : '') + '<button type="button" id="action-choice-' + id + '" data-action="' + id + '" data-revision="' + state.revision + '" ' + (!check.ok || uiLocked ? 'disabled' : '') + '>确认' + h(action.title) + '</button><div class="action-reason" id="investment-reason-action-' + id + '">' + (check.ok ? '' : h(check.reason)) + '</div></article>';
  }).join('') : '<div class="unavailable-card"><h3>这里暂时没有可做的事</h3><p>去别的地方逛逛吧。</p></div>';
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
  if (!state) return;
  closePanel();
  if (state.phase !== 'playing') { resumePhase(); return; }
  if (!Object.hasOwn(game.PLACES, key)) return;
  audio?.play(PLACE_SOUNDS[key]);
  activePlace = key;
  lastHotspot = hotspot;
  const place = game.placeFor(state, key);
  $('#placeTitle').textContent = place.title;
  $('#placeKicker').textContent = '主校区 · ' + place.kicker;
  $('#placeDescription').textContent = place.description;
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
  dialogMode = mode;
  stopSmsCountdown();
  dialog.classList.toggle('event-dialog', mode === 'event');
  $('.dialog-kicker').textContent = '北交人生 · ' + ({ event: '校园事件', eventResult: '生活回顾', admission: '入学', enrollment: '入学', login: '登录', courseSelection: '开学选课', budget: '学期预算', exam: '期末考试', confirmCheat: '期末考试', confirmEnding: '校园事件', endingChoice: '毕业方向', finished: '四年手账', ended: '本局结束', npc: '校园偶遇', positionPicker: '南门岗位库' }[mode] || '校园手账');
  $('#dialogTitle').textContent = title;
  $('#dialogNotice').textContent = '';
  $('#dialogBody').innerHTML = body;
  $('#dialogButtons').innerHTML = buttons.map(({ id, text, secondary, disabled }) => '<button type="button" data-dialog-action="' + id + '" data-revision="' + (state?.revision || 0) + '" class="' + (secondary ? 'secondary' : '') + '"' + (uiLocked || disabled ? ' disabled' : '') + '>' + h(text) + '</button>').join('');
  $('#dialogSave').hidden = !state || ['admission', 'login', 'restart', 'save', 'load', 'confirmSave', 'npc', 'courseSelection', 'budget', 'confirmCheat', 'confirmEnding', 'positionPicker'].includes(mode);
  if (!dialog.open) dialog.showModal();
  (dialog.querySelector('input') || $('#dialogTitle')).focus({ preventScroll: true });
  dialog.scrollTop = 0;
}
function lockUi() {
  uiLocked = true;
  clearTimeout(unlockTimer);
  if (activePlace) renderActions();
  dialog.querySelectorAll('[data-dialog-action], [data-event-choice], [data-ending], [data-position-apply], [data-position-lock]').forEach((button) => { button.disabled = true; });
  dialog.querySelectorAll('#examForm input, #examForm > button[type="submit"]').forEach((input) => { input.disabled = true; });
  unlockTimer = setTimeout(() => {
    uiLocked = false;
    renderGrowth();
    if (activePlace) renderActions();
    dialog.querySelectorAll('[data-dialog-action]').forEach((button) => { button.disabled = false; });
    dialog.querySelectorAll('[data-position-apply]').forEach((button) => { button.disabled = !game.availability(state, 'applyInternship', undefined, button.dataset.positionApply).ok; });
    dialog.querySelectorAll('[data-event-choice]').forEach((button) => { button.disabled = !game.eventAvailability(state, button.dataset.eventChoice, button.dataset.instance, eventDraft(button.dataset.eventChoice)).ok; });
    dialog.querySelectorAll('[data-ending]').forEach((button) => { button.disabled = !state.endingOptions.options.find((item) => item.id === button.dataset.ending)?.available; });
    dialog.querySelectorAll('#examForm input, #examForm > button[type="submit"]').forEach((input) => { input.disabled = false; });
  }, 300);
}
function runCommand(operation, id, expectedRevision, eventInstanceId, investment, extra, positionId) {
  if (!state || uiLocked) return null;
  const options = { commandId: 'ui:' + sessionId + ':' + (++commandSequence), expectedRevision: Number(expectedRevision), eventInstanceId, investment, extra, positionId };
  const result = ['executeAction', 'purchaseGrowth', 'submitEventChoice', 'chooseEnding', 'selectCourses', 'chooseBudget', 'updateExamAnswers', 'submitExam', 'chatWithNpc', 'setTargetPosition'].includes(operation) ? game[operation](state, id, options) : game[operation](state, options);
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
  audio?.play('success');
  audio?.startBgm();
  resetNpcSystem();
  renderState();
  showEnrollment();
}
function familyIntroMarkup() {
  const family = game.budgetFor(state)?.family;
  return family ? '<section class="wallet-budget"><h3>你的家庭环境 · ' + h(family.label) + '</h3><p>' + h(family.description) + '</p><p class="dialog-note">家庭情况会影响每学期生活费；开学先选衣、食、住、行预算，再进入选课。它不改变你的学院、专业与毕业条件。</p></section>' : '';
}
function showEnrollment() {
  const background = game.BACKGROUNDS.find((item) => item.id === state.background.id);
  showDialog('enrollment', '录取通知', '<p>' + h(state.nickname) + '，欢迎你。</p><p>录取信息：<b>' + h(state.background.college) + '</b> · ' + h(state.background.major) + '</p><p>' + h(background.bonus) + '</p>' + familyIntroMarkup() + budgetMarkup() + '<p class="dialog-note">背景只影响一项行动加成，不会锁死你的毕业路线。看完玩法说明后先确认本学期的衣/食/住/行预算，再完成选课。</p>', [{ id: 'resume', text: '看看怎么安排' }]);
}
function showTutorial() {
  showDialog('tutorial', '八学期怎么安排', '<ol><li>每学期开学先选衣、食、住、行四个生活预算档位，确认后再从本学期可选课程中选择 3 门，然后去地图上安排行动。四个维度各自选档、按费用求和；普通档合计 4800 元，高预算从结余补，低预算退回。住宿会影响休息恢复、宿舍事件和宿舍描述；「行」目前只有 400 元基础通勤，属性影响待完善。</li><li>选课决定期末考试覆盖的学科；数学、物理、计算机、交通、土木、经管等定量课程会按主题随机生成计算题。</li><li>点击地图上的地点，先看活动安排和成本，再决定做不做。逛逛、返回都不花钱。</li><li>日常行动和部分事件可选固定投入档位；确认前查看时间及资源成本。勤工与实习按工作量支付固定报酬，其余投入完成后揭晓实际收益，并写入成长记录。课程学习与自习可选配套资料，每学期合计最多增加 4 点学习进度；室友交流可选零食分享。额外消费可以跳过，原有时间与精力成本照常支付。军训成本包含训练和汇演，汇演免费连续完成。</li><li>学习和自学都攒同一个学习进度，它是总评里的平时分（40%）。</li><li>期末参加 5 题考试，覆盖所选课程，每题 20 分；总评 = 平时分 × 40% + 考试 × 60%，60 分达标。</li><li>每学期 12 点时间。消耗精力的行动也会消耗体能；休息能回精力与体能，散步、锻炼也能回体能，但都回不了时间。体能分五档：虚弱、一般、良好、优秀会缩放行动的收益与消耗；低于 25 会生病，只能先去校医院。长期属性和经历会跟着你跨学期。</li><li>项目、社团、实习，各要一次申请加两次投入。项目的成果在之后的学期确认，社团和实习在投入完成后即可收尾。</li><li>普通毕业：平均成绩至少 60，且六学期达标。深造再加：平均 80、完成项目、深造准备 60。就业再加：完成实习、求职准备 60。</li><li>大三起开放深造与求职准备。方向可以兼顾、转换，毕业时挑一个够得着的。</li><li>点击保存从 3 个栏位中选择一个。学期结算与毕业确认后自动保存到当前栏位；首次选栏前仅保留本页进度。关闭页面后从入学页选择存档继续。</li></ol>', [{ id: 'resume', text: '开始安排' }]);
}
function showBackground() {
  const background = game.BACKGROUNDS.find((item) => item.id === state.background.id);
  showDialog('background', '入学背景', '<p><b>' + h(state.nickname) + '</b> · ' + h(state.background.college) + ' · ' + h(state.background.major) + '</p><p>' + h(background.bonus) + '</p>' + familyIntroMarkup() + '<p>专业与课程参考学校公开培养方案，学期顺序、学分和选课限制为玩法简化。背景不会锁死你的毕业路线。</p>', [{ id: 'resume', text: '继续安排' }]);
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
    return '<button type="button" class="investment-tier' + (tier.amount === amount ? ' is-selected' : '') + '" ' + data + '="' + choice.id + '" data-amount="' + tier.amount + '" aria-pressed="' + (tier.amount === amount) + '"><b>' + h(tier.label) + '</b><span>' + h(costs(preview.effect)) + '</span>' + (profile.fixedIncome ? '<span>固定报酬 +' + tier.income + ' 元' + ((state.cardDebt || 0) ? ' · 优先偿还校园卡赔偿' : '') + '</span>' : '') + '</button>';
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

  const sick = game.isSick(state);
  const choices = sick
    ? '<article class="event-choice"><h3>先去校医院</h3><p>烧还没退，现在不是处理这件事的时候。</p><div class="action-cost">不消耗资源 · 事件先搁置</div><button type="button" id="event-choice-sickLeave" data-event-choice="sickLeave" data-instance="' + pending.instanceId + '" data-revision="' + state.revision + '">选择：先去校医院</button><div class="action-reason"></div></article>'
    : event.choices.filter(choice => !choice.legacyHidden).map((choice) => {
      const profile = game.getEventInvestment(state, choice.id);
      const amount = eventDraft(choice.id, true);
      const preview = profile && game.previewEventInvestment(state, choice.id, amount);
      const check = game.eventAvailability(state, choice.id, pending.instanceId, amount);
      return '<article class="event-choice' + (profile ? ' has-investment' : '') + '"><h3>' + h(choice.title) + '</h3><p>' + h(profile ? profile.description : choice.description) + '</p>' + (profile ? investmentControls(choice, profile, preview) : '') + '<div class="action-cost" id="investment-cost-' + choice.id + '">' + h(costs(preview?.ok ? preview.effect : game.eventChoiceEffect(state, choice.id))) + '</div>' + (choice.ending ? '<div class="action-warning">本局结束 · 这个选择没有回头路</div>' : '') + '<button type="button" id="event-choice-' + choice.id + '" data-event-choice="' + choice.id + '" data-instance="' + pending.instanceId + '" data-revision="' + state.revision + '"' + (!check.ok || uiLocked ? ' disabled' : '') + '>' + (profile ? '确认投入，' : '选择：') + h(choice.title) + '</button><div class="action-reason" id="investment-reason-' + choice.id + '">' + (check.ok ? '' : h(check.reason)) + '</div></article>';
    }).join('');
  const note = sick
    ? '身体不适，先处理身体。待处理事件可以先去校医院，之后再回来处理。'
    : h(event.trigger) + '。剩余时间 ' + state.time + ' · 精力 ' + state.energy + ' · 钱包 ' + state.money + ' 元。确认才扣费，切换档位不会结算。';
  showDialog('event', event.title, '<p>' + h(event.description) + '</p><p class="dialog-note">' + note + '</p><div class="event-choice-list">' + choices + '</div>');
}
const INVESTMENT_OUTCOMES = { setback: '发挥失常', limited: '收获有限', steady: '有所收获', good: '状态出色', surprise: '意外收获' };
function showEventResult(entry) {
  const result = entry.investment;
  const profile = entry.event ? game.EVENT_INVESTMENTS[entry.event + ':' + entry.choice] || game.LEGACY_INVESTMENTS.events[entry.event + ':' + entry.choice] : game.getActionInvestment(state, entry.action) || game.LEGACY_INVESTMENTS.actions[entry.action];
  const rawFitnessCost = entry.event
    ? ((game.EVENTS[entry.event] && game.EVENTS[entry.event].choices.find(item => item.id === entry.choice)) || {}).fitnessCost || 0
    : (game.ACTIONS[entry.action] || {}).fitnessCost || 0;
  const fitnessCost = entry.fitnessCost === undefined ? rawFitnessCost : entry.fitnessCost;
  const spent = Number.isSafeInteger(result.spent) ? result.spent : result.amount;
  const scaled = result.spent !== undefined && result.spent !== result.amount;
  const capped = Object.keys(profile.rewards).some(key => state[key === 'recovery' ? 'energy' : key] === 100);
  const title = entry.event ? game.EVENTS[entry.event].title : game.ACTIONS[entry.action].title;
  showDialog('eventResult', title + ' · 结果', '<div class="investment-result"><span class="outcome-badge outcome-' + result.outcome + '">' + (profile.fixedIncome ? '工作完成' : INVESTMENT_OUTCOMES[result.outcome]) + '</span><p class="investment-spent">本次投入 <b>' + spent + ' ' + investmentUnit(result.resource) + '</b>' + (fitnessCost ? '，另消耗 <b>' + fitnessCost + ' 点体能</b>' : '') + '</p>' + (scaled ? '<p class="dialog-note">受体能挡位影响，实际投入以本次结算为准。</p>' : '') + '<p class="investment-story">' + h(result.description + extraFeedback(entry) + debtFeedback(entry)) + '</p><div class="investment-actual"><span>实际变化</span><b>' + h(changeText(entry.changes)) + '</b></div>' + (fitnessCost && entry.changes.fitness > 0 ? '<p class="dialog-note">体能 +' + entry.changes.fitness + ' 是扣除本次 ' + fitnessCost + ' 点消耗后的净变化。</p>' : '') + (capped ? '<p>部分属性已达上限，实际增加量以当前状态为准。</p>' : '') + '<p class="dialog-note">这次结果已经记入成长记录，继续或保存都不会重新结算。</p></div>', [{ id: 'eventContinue', text: state.pendingEvent?.id === 'military2' ? '继续军训汇演' : state.pendingEvent ? '处理下一个事件' : '继续安排' }]);

}
function needsBudget() {
  if (!state || state.phase !== 'playing' || (state.selectedCourses || []).length) return false;
  const grant = game.currentGrant(state);
  return !!(grant && grant.budget && grant.budgetChosen === false);
}
function needsCourseSelection() {
  return !!state && state.phase === 'playing' && !(state.selectedCourses || []).length && !state.history.some((entry) => entry.term === state.term && entry.command.operation === 'executeAction');
}
function showCourseSelection() {
  if (!state || state.phase !== 'playing') { resumePhase(); return; }
  if ((state.selectedCourses || []).length) { resumePhase(); return; }
  const options = game.coursesForTerm(state.term, state.background.id, state.background.major);
  const cards = options.map((course) => '<label class="course-card"><input type="checkbox" name="course" value="' + h(course.id) + '"><span class="course-main"><b>' + h(course.name) + '</b><span class="course-meta">' + h(game.SUBJECTS[course.subject]) + ' · ' + course.credits + ' 学分</span><span class="course-desc">' + h(course.description) + '</span></span></label>').join('');
  showDialog('courseSelection', '开学选课', '<p>这是' + h(game.TERM_NAMES[state.term - 1]) + '。从本学期可选课程中选择 3 门，期末考试会覆盖这些课程。</p>' + budgetMarkup() + '<form id="courseForm"><p class="course-count" id="courseCount">已选 0 / 3 门</p><div class="course-list">' + cards + '</div><p id="courseError" class="action-reason" role="alert"></p><button type="submit">确认选课</button></form><p class="dialog-note">每学期 3 门课；期末考试 5 题，每题 20 分。定量课程按主题随机生成计算题，其余课程从对应学科题库抽题。总评 = 平时分 40% + 考试 60%。</p>');
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
function summaryBudgetLines(summary) {
  if (summary.economyVersion === 2 && summary.budget?.budget) {
    const plan = game.budgetPlan(summary.budget.budget);
    if (plan) {
      return ['clothing', 'food', 'housing', 'transport'].map(key => '<span>' + h(plan.items[key].label) + ' <b>' + plan.items[key].cost + ' 元</b></span>').join('')
        + '<span>预算合计 <b>' + summary.livingCost + ' 元</b></span>'
        + (summary.budget.budgetDelta ? '<span>预算调整 <b>' + (summary.budget.budgetDelta > 0 ? '−' : '+') + Math.abs(summary.budget.budgetDelta) + ' 元</b></span>' : '')
        + '<span>期末额外扣费 <b>0 元</b></span>';
    }
  }
  if (summary.economyVersion === 1) return '<span>生活费已到账 <b>+' + summary.budget.allowance + ' 元</b></span><span>日常开支已预留 <b>−' + summary.livingCost + ' 元</b></span><span>期末额外扣费 <b>0 元</b></span>';
  return '<span>旧版生活费 <b>−' + summary.livingCost + ' 元</b></span><span>补助 <b>+' + summary.aid + ' 元</b></span>';
}
function summaryMarkup(summary) {
  if (summary.examScore === undefined) return '<div class="summary-score"><b>' + summary.grade + '</b><span>分 · ' + (summary.passed ? '课程达标' : '课程未达标') + '</span></div><p>学习进度 ' + summary.preparation + ' / 100。期末成绩按 40 + 学习进度 × 0.6 计算。</p><div class="summary-lines">' + summaryBudgetLines(summary) + '<span>结余 <b>' + summary.moneyAfter + ' 元</b></span><span>没用完的时间 <b>' + summary.unusedTime + ' 点，不结转</b></span></div>' + summary.notices.map((notice) => '<p>' + h(notice) + '</p>').join('');
  return '<div class="summary-score"><b>' + summary.grade + '</b><span>分 · ' + h(summary.rating) + ' · ' + (summary.passed ? '课程达标' : '课程未达标') + '</span></div><p>平时分 ' + summary.usualScore + ' / 100（40%）+ 期末考试 ' + summary.examScore + ' / 100（60%）。</p><p class="dialog-note">本学期课程：' + h(summary.courseNames.join('、')) + '</p><div class="summary-lines">' + summaryBudgetLines(summary) + '<span>结余 <b>' + summary.moneyAfter + ' 元</b></span><span>没用完的时间 <b>' + summary.unusedTime + ' 点，不结转</b></span></div>' + summary.notices.map((notice) => '<p>' + h(notice) + '</p>').join('');
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
  if (!state.courses.length) return '<h3>八学期成绩</h3><p>还没有结算过的成绩。</p>';
  if (state.courses.some((item) => item.examScore !== undefined)) return '<h3>八学期成绩</h3><table class="course-table"><thead><tr><th>学期</th><th>平时</th><th>考试</th><th>总评</th><th>评级</th><th>结果</th></tr></thead><tbody>' + state.courses.map((item) => '<tr><td>' + h(item.name) + '</td><td>' + (item.usualScore ?? item.preparation) + '</td><td>' + (item.examScore ?? '—') + '</td><td>' + item.grade + '</td><td>' + h(item.rating || '—') + '</td><td>' + (item.passed ? '达标' : '未达标') + '</td></tr>').join('') + '</tbody></table>';
  return '<h3>八学期成绩</h3><table class="course-table"><thead><tr><th>学期</th><th>学习进度</th><th>成绩</th><th>结果</th></tr></thead><tbody>' + state.courses.map((item) => '<tr><td>' + h(item.name) + '</td><td>' + item.preparation + '</td><td>' + item.grade + '</td><td>' + (item.passed ? '达标' : '未达标') + '</td></tr>').join('') + '</tbody></table>';
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
function investmentRecord() {
  const entries = state.history.filter(entry => entry.investment).slice().reverse();
  return '<h3>投入与收获</h3>' + (entries.length ? entries.map(entry => '<article class="investment-record"><h4>' + game.TERM_NAMES[entry.term - 1] + ' · ' + h(entry.event ? game.EVENTS[entry.event].title : game.ACTIONS[entry.action].title) + '</h4><span class="outcome-badge outcome-' + entry.investment.outcome + '">' + INVESTMENT_OUTCOMES[entry.investment.outcome] + '</span><p>投入 ' + entry.investment.amount + ' ' + investmentUnit(entry.investment.resource) + '</p><p>' + h(entry.investment.description + extraFeedback(entry)) + '</p><div class="action-gain">' + h(changeText(entry.changes)) + '</div></article>').join('') : '<p>完成自主投入的行动后，这里会记下你的选择和结果。</p>');
}
// 事件链进度与毕业条件进度已迁入「手头的事」抽屉，「我的简历」升格为独立抽屉（renderResume），这里只留档案类内容。
// 钱包节不包总标题：walletHistory 由钱包抽屉共用，节内 h3 由 budgetMarkup 与「历次学期拨款」充当。
function growthRecord() {
  const purchases = state.history.filter(entry => entry.command.operation === 'purchaseGrowth');
  const upgrades = purchases.length ? '<h3>校园养成</h3><ul>' + purchases.map(entry => '<li>' + h(game.TERM_NAMES[entry.term - 1]) + '：' + h(entry.title) + '，支出 ' + (-entry.changes.money) + ' 元。' + h(game.GROWTH_NODES[entry.command.id].benefit) + '。</li>').join('') + '</ul>' : '';
  return upgrades + investmentRecord() + courseTable() + walletHistory();
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
  const intro = '<p>' + (ENDING_TEXT[state.result.direction] || '') + '</p>' + (terminal ? '<p class="dialog-note">触发原因：' + h(state.result.reason) + '</p>' : '') + '<p>平均成绩 <b>' + state.result.average.toFixed(1) + '</b>，达标 <b>' + state.result.passed + '/8</b> 学期。</p>' + (terminal ? '<p>本局在第 <b>' + state.result.term + '</b> 学期结束。</p>' : '') + '<p>' + h(saveNotice || '可以把这段结局保存下来。') + '</p>' + (terminal ? '' : requirementsMarkup(state.result.requirements)) + growthRecord();
  showDialog(terminal ? 'ended' : 'finished', state.result.title, intro, [{ id: 'resume', text: '返回地图', secondary: true }, { id: 'restart', text: '重新开始' }]);
}
function resumePhase() {
  if (!state) { showAdmission(); return; }
  state = game.resumeRequiredEvents(state);
  const last = state.history.at(-1);
  if (last?.investment && acknowledgedResultRevision !== state.revision) { showEventResult(last); return; }
  if (state.phase === 'eventPending') showEvent();
  else if (state.phase === 'examPending') showExam();
  else if (state.phase === 'summary') showSummary();
  else if (state.phase === 'endingChoice') showEndings();
  else if (state.phase === 'finished' || state.phase === 'ended') showResult();
  else if (needsBudget()) showBudget();
  else if (needsCourseSelection()) showCourseSelection();
  else dialog.close();
}
function showLoad() {
  const info = saves.inspect();
  showDialog('load', '选择读取栏位', '<p>选择读取后，当前未保存进度将被替换，之后自动保存到所读栏位。</p>' + slotCards(info, 'load'), [{ id: state ? 'resume' : 'admission', text: '取消', secondary: true }]);
}
function loadGame(slotId, source = 'primary') {
  const result = saves.load(slotId, source);
  if (!result.ok) { showToast(result.reason); return; }
  closePlace();
  state = game.resumeRequiredEvents(result.state);
  activeSaveSlot = slotId;
  actionDrafts.clear();
  pendingActionExtra = null;
  eventDrafts.clear();
  acknowledgedResultRevision = -1;
  savedRevision = state.revision;
  savedAt = result.savedAt;
  saveNotice = '已恢复栏位 ' + slotId + ' · ' + displayTime(savedAt);
  clearTimeout(unlockTimer);
  uiLocked = false;
  failures.length = 0;
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
  const report = { appVersion: game.RULES.appVersion, rulesVersion: game.RULES.version, nickname: state.nickname, seed: state.rng.seed, legacyEconomy: !state.economy || state.economy.startTerm > 1, economyStartTerm: state.economy?.startTerm ?? 9, commands: state.history.map((entry) => ({ ...entry.command, commandId: entry.commandId })), operations: state.history, failures, finalState: state };
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
  else if (event.target.id === 'courseForm') { event.preventDefault(); submitCourseSelection(event.target); }
  else if (event.target.id === 'examForm') { event.preventDefault(); submitExamForm(event.target); }
});
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
function completeAction(id, revision, investment, extra, positionId) {
  const result = runCommand('executeAction', id, revision, undefined, investment, extra, positionId);
  if (!result) { if (dialogMode === 'actionExtra' || dialogMode === 'positionPicker') resumePhase(); return; }
  audio?.play(ACTION_SOUNDS[id] || 'success');
  const positionNote = result.entry.position ? '已投递「' + result.entry.position.title + '」。' : '';
  $('#actionFeedback').textContent = positionNote + (result.entry.investment?.description || ACTION_FLAVOR[result.entry.action] || result.entry.title + '完成') + extraFeedback(result.entry) + ' ' + changeText(result.changes) + (state.time === 0 ? ' 时间用完了，回地图结束这个学期吧。' : '');
  if (result.entry.investment) showEventResult(result.entry);
  else if (state.phase === 'eventPending') showEvent();
}
function offerActionExtra(id, revision, investment) {
  const extra = game.getActionExtra(id);
  if (!extra) return false;
  const check = game.actionExtraAvailability(state, id, investment, extra.id);
  if (!check.ok) return false;
  pendingActionExtra = { id, revision, investment, extraId: extra.id };
  const effect = game.previewActionInvestment(state, id, investment)?.effect || game.getAction(state, id);
  const limitNote = extra.id === 'materials' ? '课程学习与自习共享每学期 2 次购买机会，每次额外学习进度最多 +2，合计最多 +4。' : '每学期最多购买 1 次，额外社交最多 +1、心情最多 +2。';
  showDialog('actionExtra', game.ACTIONS[id].title + ' · 可选消费', '<p>' + h(extra.description) + '</p><div class="summary-lines"><span>本次原有成本 <b>' + h(costs(effect)) + '</b></span><span>额外费用 <b>' + extra.price + ' 元</b></span><span>本学期已购买 <b>' + check.used + ' / ' + extra.limit + ' 次</b></span></div><p>' + limitNote + '</p><p class="dialog-note">不额外消耗时间或精力，原有行动成本照常支付。可以不买，按原计划完成行动。确认后才结算；实际收获封顶时不会为无效加成扣费。</p>', [{ id: 'extraSkip', text: '不购买，按原计划', secondary: true }, { id: 'extraBuy', text: '购买并完成行动' }, { id: 'extraCancel', text: '返回调整', secondary: true }]);
  return true;
}
// 南门岗位库：按档位分组列出岗位，门槛达标态与锁定/申请都由规则命令驱动。
function showPositionPicker() {
  const tierClassLabels = { major: '大厂', mid: '中厂', startup: '初创', soe: '央企' };
  const cards = [1, 2, 3].map((tier) => Object.values(game.POSITIONS).filter((position) => position.tier === tier).map((position) => {
    const check = game.positionAvailability(state, position.id);
    const applyOk = game.availability(state, 'applyInternship', undefined, position.id).ok && !uiLocked;
    const company = game.COMPANIES[position.company];
    const discount = position.requires.grade !== undefined && position.affinity?.majors.includes(state.background.major) ? position.affinity.gradeDiscount || 0 : 0;
    const gradeText = position.requires.grade === undefined ? '无成绩线' : '平均成绩 ≥ ' + position.requires.grade + (discount ? '（对口 ' + (position.requires.grade - discount) + '）' : '');
    const requirementText = position.requires.resumeAll
      ? (position.affinity.majors.includes(state.background.major) && position.affinity.relaxToAny
        ? '简历要件（对口放宽）：' + position.requires.resumeAll.map((key) => game.REQUIREMENT_LABELS[key]).join(' 或 ')
        : '简历要件：' + position.requires.resumeAll.map((key) => game.REQUIREMENT_LABELS[key]).join(' 且 '))
      : position.requires.resumeAny
        ? '简历要件至少其一：' + position.requires.resumeAny.map((key) => game.REQUIREMENT_LABELS[key]).join(' / ')
        : '无简历门槛';
    return '<article class="position-card' + (state.targetPosition === position.id ? ' is-target' : '') + '">'
      + '<header class="position-head"><span class="position-company">' + h(company.name) + '</span><span class="position-class">' + h(tierClassLabels[company.tierClass] || '') + '</span><span class="position-tier">T' + position.tier + '</span></header>'
      + '<h4 class="position-title">' + h(position.title) + '</h4>'
      + '<p class="position-flavor">' + h(position.flavor) + '</p>'
      + '<p class="position-reqs">' + h('第 ' + position.window[0] + '–' + position.window[1] + ' 学期 · ' + gradeText + ' · ' + requirementText + ' · 段收入 ' + position.rewards.income + ' 元 · 求职准备 +' + position.rewards.jobPreparation + (position.costs && position.costs.fitness ? ' · 体能消耗 +' + position.costs.fitness + '/次' : '')) + '</p>'
      + '<p class="position-status' + (check.ok ? ' is-ok' : '') + '">' + (check.ok ? '● 达标，可以投递' : h(check.reason)) + '</p>'
      + '<div class="position-actions"><button type="button" class="secondary" data-position-lock="' + h(position.id) + '"' + (uiLocked ? ' disabled' : '') + '>' + (state.targetPosition === position.id ? '取消意向' : '锁定意向') + '</button>'
      + '<button type="button" data-position-apply="' + h(position.id) + '" data-revision="' + state.revision + '"' + (applyOk ? '' : ' disabled') + '>申请这个岗位</button></div>'
      + '</article>';
  }).join('')).join('');
  showDialog('positionPicker', '南门 · 岗位库', '<div class="position-list">' + cards + '</div>', [{ id: 'positionClose', text: '返回南门', secondary: true }]);
}
$('#actionList').addEventListener('click', (event) => {
  const button = event.target.closest('button');
  // 达标后的「办理实习证明」按钮也在行动卡内，必须先于地点/行动校验处理。
  if (button?.dataset.settleInternship) {
    const result = runCommand('settleInternship', null, button.dataset.revision);
    if (result) { saveCurrent(true); showToast(positionFeedback(result.entry) || '实习证明办好了。'); }
    return;
  }
  if (button?.dataset.actionInvestmentPreset) { updateActionInvestment(button.dataset.actionInvestmentPreset, Number(button.dataset.amount)); return; }
  if (!button || game.ACTIONS[button.dataset.action]?.place !== activePlace || dialog.open) return;
  const id = button.dataset.action;
  if (id === 'applyInternship') { showPositionPicker(); return; }
  const investment = actionDraft(id);
  if (!offerActionExtra(id, button.dataset.revision, investment)) completeAction(id, button.dataset.revision, investment);
});
$('#dialogBody').addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.id === 'smsSendButton') { requestSmsCode(); return; }
  if (dialogMode === 'exam' && state?.phase === 'examPending') {
    if (button.dataset.examQuestion !== undefined) { focusExamQuestion(Number(button.dataset.examQuestion)); return; }
    if (button.dataset.examMissing) { focusExamQuestion(state.exam.questions.findIndex((_, index) => state.exam.answers[index] === undefined || state.exam.answers[index] === null)); return; }
  }
  if (button.dataset.cheatExam) { confirmCheatExam(); return; }
  if (button.dataset.budgetDimension) { selectBudgetTier(button.dataset.budgetDimension, button.dataset.budgetTier); return; }
  if (button.dataset.positionLock) {
    const next = state.targetPosition === button.dataset.positionLock ? null : button.dataset.positionLock;
    if (runCommand('setTargetPosition', next, button.dataset.revision) && dialogMode === 'positionPicker') showPositionPicker();
    return;
  }
  if (button.dataset.positionApply) { completeAction('applyInternship', button.dataset.revision, undefined, undefined, button.dataset.positionApply); return; }
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
    const narrative = result.entry.investment?.description || EVENT_CHOICE_FLAVOR[result.entry.event + ':' + result.entry.choice] || (result.entry.outcome ? result.entry.outcome + '。' : result.entry.title + '。');
    const feedback = narrative + (result.changes?.money ? ' ' + changeText({ money: result.changes.money }) + '。' : '') + positionFeedback(result.entry) + debtFeedback(result.entry);
    $('#actionFeedback').textContent = feedback;
    if (state.phase === 'ended') { saveCurrent(true); showResult(); }
    else if (result.entry.investment) showEventResult(result.entry);
    else if (state.phase === 'eventPending') { showEvent(); $('#dialogNotice').textContent = feedback; }
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
  if (['extraBuy', 'extraSkip', 'extraCancel'].includes(id)) {
    if (dialogMode !== 'actionExtra' || !pendingActionExtra) return;
    const draft = pendingActionExtra;
    pendingActionExtra = null;
    if (id === 'extraCancel') { dialog.close(); return; }
    completeAction(draft.id, draft.revision, draft.investment, id === 'extraBuy' ? draft.extraId : undefined);
    return;
  }
  if (id === 'resume') { if (['finished', 'ended'].includes(dialogMode)) dialog.close(); else if (dialogMode === 'enrollment') showTutorial(); else resumePhase(); }
  else if (id === 'positionClose' && dialogMode === 'positionPicker') { dialog.close(); }
  else if (id === 'eventContinue' && dialogMode === 'eventResult') { acknowledgedResultRevision = state.revision; resumePhase(); }
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
  else if (id === 'budgetConfirm' && dialogMode === 'budget') submitBudget();
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
    closePlace();
    resetNpcSystem();
    audio?.stopBgm();
    state = null;
    renderGrowth();
    eventDrafts.clear();
    actionDrafts.clear();
  pendingActionExtra = null;
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
const npcLayer = $('#npcLayer');
if (npc && npcLayer) {
  npcLayer.addEventListener('click', (event) => {
    const button = event.target.closest('[data-npc-id]');
    if (button) talkToNpc(button.dataset.npcId);
  });
  npcTick();
}
$('#backButton').addEventListener('click', closePlace);
$('#endTermButton').addEventListener('click', requestEndTerm);
$('#saveButton').addEventListener('click', showSave);
$('#dialogSave').addEventListener('click', showSave);
$('#loadButton').addEventListener('click', showLoad);
$('#helpButton').addEventListener('click', () => { if (state) showTutorial(); });
$('#backgroundButton').addEventListener('click', () => { if (state) showBackground(); });
$('#restartButton').addEventListener('click', () => { if (state) askRestart(); });
$('#historyButton').addEventListener('click', () => { if (state) showDialog('history', '四年成长记录', growthRecord(), [{ id: 'resume', text: '继续安排' }]); });
for (const selector of ['#mapStats', '#placeStats']) $(selector).addEventListener('click', event => {
  if (state && !uiLocked && event.target.closest('[data-wallet-budget]')) showDialog('wallet', '钱包收支', walletHistory(), [{ id: 'resume', text: '继续安排' }]);
});

const avatarButton = $('#playerAvatar');
if (avatarButton && typeof avatarButton.addEventListener === 'function') avatarButton.addEventListener('click', pickAvatar);
const changeAvatarButton = $('#changeAvatarButton');
if (changeAvatarButton && typeof changeAvatarButton.addEventListener === 'function') changeAvatarButton.addEventListener('click', pickAvatar);
const avatarInput = $('#avatarInput');
if (avatarInput && typeof avatarInput.addEventListener === 'function') {
  avatarInput.addEventListener('change', () => {
    const file = avatarInput.files && avatarInput.files[0];
    if (file) saveAvatarFile(file);
    try { avatarInput.value = ''; } catch (_) {}
  });
}
loadAvatar();

document.querySelectorAll('.app-menu-button').forEach((button) => {
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    setPanel(openPanelName === button.dataset.panel ? null : button.dataset.panel);
  });
});
document.querySelectorAll('.advisory-close').forEach((button) => button.addEventListener('click', closePanel));
$('#growthToggle')?.addEventListener('click', (event) => {
  event.stopPropagation();
  if (!state || dialog.open) return;
  setPanel(openPanelName === 'growth' ? null : 'growth');
  if (openPanelName === 'growth') $('#growthTitle').focus({ preventScroll: true });
});
$('#growthClose')?.addEventListener('click', closePanel);
$('#growthNodes')?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-growth-select]');
  if (!button || dialog.open || !Object.hasOwn(game.GROWTH_NODES, button.dataset.growthSelect)) return;
  event.stopPropagation();
  selectedGrowthId = button.dataset.growthSelect;
  $('#growthNotice').textContent = '';
  renderGrowth();
  $('#growthNodes').querySelector('[data-growth-select="' + selectedGrowthId + '"]')?.focus({ preventScroll: true });
  if (window.matchMedia?.('(max-width: 640px)').matches) {
    $('#growthDetails').scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
});
$('#growthPurchase')?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-growth-buy]');
  if (!button || dialog.open || uiLocked) return;
  event.stopPropagation();
  const result = runCommand('purchaseGrowth', button.dataset.growthBuy, button.dataset.revision);
  if (!result) return;
  const node = game.GROWTH_NODES[button.dataset.growthBuy];
  $('#growthNotice').textContent = '已添置' + node.title + '，支出 ' + node.price + ' 元。' + node.benefit + '。记得保存进度。';
  $('#growthDetails').focus({ preventScroll: true });
  audio?.play('success');
});
document.addEventListener('click', (event) => {
  if (!openPanelName) return;
  const target = event.target;
  if (target && typeof target.closest === 'function' && (target.closest('.app-bar') || target.closest('.app-panels'))) return;
  closePanel();
});
window.addEventListener('resize', syncBarHeight);
syncBarHeight();
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
  if (!state || ['eventPending', 'examPending', 'summary', 'endingChoice'].includes(state.phase) || ['admission', 'login', 'restart', 'enrollment', 'courseSelection', 'budget', 'exam', 'confirmCheat', 'confirmEnding'].includes(dialogMode)) event.preventDefault();
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (openPanelName) { closePanel(); return; }
  if (activePlace && !dialog.open) closePlace();
});
window.addEventListener('beforeunload', guardUnsavedProgress);
if (typeof HTMLDialogElement === 'undefined' || typeof HTMLDialogElement.prototype.showModal !== 'function') {
  $('.game-shell').innerHTML = '<div class="browser-notice"><h2>请使用较新的浏览器打开</h2><p>本游戏需要支持弹窗等现代网页特性的浏览器。请升级微信或浏览器，或用系统浏览器打开本地址。</p><p class="browser-notice-url">https://zjr231.github.io/BJTU-Life-Simulator/</p></div>';
} else {
  showAdmission();
}
