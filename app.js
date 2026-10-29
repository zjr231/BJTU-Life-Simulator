'use strict';

const game = CampusGame;
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const h = escapeHtml;
const hotspots = [...document.querySelectorAll('.map-hotspot')];
const audio = typeof CampusAudio !== 'undefined' ? CampusAudio : null;
const PLACE_SOUNDS = { think: 'study', library: 'study', yifu: 'study', dorm: 'relax', ginkgo: 'relax', track: 'sport', activity: 'opportunity', gate: 'opportunity', hospital: 'info', auditorium: 'info', hotel: 'info' };
const ACTION_SOUNDS = { study: 'study', tutoring: 'study', selfStudy: 'study', furtherStudy: 'study', projectWork: 'study', applyProject: 'opportunity', applyClub: 'opportunity', clubWork: 'opportunity', applyInternship: 'opportunity', internshipWork: 'paper', jobPreparation: 'paper', work: 'paper', rest: 'relax', chat: 'relax', walk: 'relax', exercise: 'sport' };
const dialog = $('#termDialog');
const debug = new URLSearchParams(location.search).get('debug') === '1';
let storage = null;
try { storage = window.localStorage; } catch (_) { /* Play remains available without storage. */ }
const saves = CampusSave.createSlotService(storage);
let activeSaveSlot = null;
let saveTarget = null;
let state = null;
let activePlace = null;
let lastHotspot = null;
let dialogMode = null;
let uiLocked = false;
let unlockTimer;
let toastTimer;
let commandSequence = 0;
let savedRevision = -1;
let savedAt = '';
let saveNotice = '';
const eventDrafts = new Map();
const actionDrafts = new Map();
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
  walk: '一圈走下来，步子轻了些。',
  applyProject: '申请递出去了，接下来等回复。',
  projectWork: '改完最后一版方案，会议室的灯熄了。',
  applyClub: '报名表交了出去，招新群里已经热闹起来。',
  clubWork: '海报贴完，签到表也理好了。',
  applyInternship: '材料交了上去，接下来是等。',
  internshipWork: '打卡下班，通勤路上天还没黑透。',
  checkup: '体检单打印出来，各项指标正常。你把单子折好，塞进口袋。',
  sickVisit: '药片就着温水吞下去。校医说，三天内别熬夜。',
  alumniVolunteer: '散场时，一位老校友塞给你一瓶水：辛苦了，小校友。',
  show: '谢幕的时候，你跟着人群鼓掌，掌心拍得发红。'
};
const EVENT_CHOICE_FLAVOR = {
  'roommateCare:talk': '烤串摊的灯很亮。你把最近的破事倒了一桌子，说到最后，自己先笑了。',
  'roommateCare:later': '你戴上耳机。室友没再说话，只把顶灯调暗了一格。',
  'fitnessTest:participate': '冲线的时候腿有点软。体育老师低头在名单上画了个勾。',
  'fitnessTest:later': '这次没报名。跑道一直都在，下次再说。',
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
  'military1:join': '迷彩服领到手，裤腿长了一截。你把鞋带系得比高考还紧。',
  'military1:later': '假条交上去了。你在树荫下看他们踢正步。',
  'military2:perform': '方阵走过主席台，你的正步一个都没错。掌声响起来的时候，你才发现手心全是汗。',
  'military2:later': '你跟在队伍最后。走过主席台时，也把腰挺了挺。',
  'transfer:apply': '材料递进窗口。之后的日子，你路过通知栏都会多看两眼。',
  'transfer:later': '你把通知拍下来，存进相册，再没打开。',
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
  'frontDesk:later': '你盯着启事看了两秒，最后被床的召唤打败了。'
};
function statsMarkup() {
  const latest = state.courses.at(-1);
  const items = [
    ['成绩', latest ? latest.grade : '待结算', latest ? latest.name + ' · 最近成绩' : '等待首次期末', 'grade'],
    ['社交', state.social, '/ 100 · 慢慢攒', 'social'], ['体能', state.fitness, '/ 100 · 体测条件', 'fitness'],
    ['心情', state.mood, '/ 100 · 会影响事件', state.mood < 30 ? 'mood is-low' : 'mood'],
    ['钱包', state.money, '元 · 可用资金', 'money']
  ];
  return items.map(([name, value, note, style]) => '<div class="attribute ' + style + '"><span class="attribute-name">' + h(name) + '</span><b>' + h(value) + '</b><small>' + h(note) + '</small></div>').join('');
}
function chainLabel(chain) {
  const labels = { idle: '未申请', active: '进行中', deferred: '暂缓申请', completed: '已完成', missed: '未完成' };
  return labels[chain.status] + (['active', 'missed'].includes(chain.status) ? ' · ' + chain.progress + '/2 次投入' : '');
}
function renderState() {
  if (!state) return;
  $('#playerLabel').textContent = state.nickname + ' · ' + state.background.major;
  $('#termLabel').textContent = game.TERM_NAMES[state.term - 1] + (state.phase === 'finished' ? ' · 已结束' : ' · ' + game.getTermStage(state));
  $('#timeLabel').textContent = '时间 ' + state.time + ' / 12';
  $('#energyLabel').textContent = '精力 ' + state.energy + ' / 100';
  $('#mapStats').innerHTML = statsMarkup();
  $('#preparationValue').textContent = state.preparation + ' / 100';
  $('#preparationMeter').value = state.preparation;
  $('#placeStats').innerHTML = '<div class="place-resources"><span>时间 <b>' + state.time + ' / 12</b></span><span>精力 <b>' + state.energy + ' / 100</b></span><span>学习进度 <b>' + state.preparation + ' / 100</b></span></div><div class="place-attributes">' + statsMarkup() + '</div>';
  $('#directionBrief').innerHTML = '<div>平均成绩 <b>' + (state.courses.length ? game.averageGrade(state).toFixed(1) : '待结算') + '</b> · 达标 <b>' + state.courses.filter((item) => item.passed).length + '/8 学期</b></div><div>深造准备 <b>' + state.furtherStudy + '/100</b> · 求职准备 <b>' + state.jobPreparation + '/100</b></div>' + Object.entries(state.chains).map(([id, chain]) => '<div>' + game.CHAIN_NAMES[id] + ' <b>' + chainLabel(chain) + '</b></div>').join('');
  $('#endTermButton').textContent = ({ eventPending: '处理当前事件', summary: '查看学期总结', endingChoice: '选择毕业方向', finished: '查看毕业结果' })[state.phase] || '结束学期';
  $('#sessionNote').textContent = savedAt ? '栏位 ' + activeSaveSlot + ' · ' + (savedRevision === state.revision ? '当前进度已保存 · ' : '当前有未保存进度 · ') + displayTime(savedAt) : '尚未保存；点击保存选择栏位，之后自动保存到该栏位。';
  $('#dialogSave').hidden = ['admission', 'restart', 'save', 'load', 'confirmSave'].includes(dialogMode);
  if (activePlace) renderActions();
  if (debug) $('#debugSummary').textContent = '规则 ' + state.rulesVersion + ' · 阶段 ' + state.phase + ' · revision ' + state.revision + ' · 随机调用 ' + state.rng.calls;
}
function changeText(changes) {
  const names = { time: '时间', energy: '精力', money: '钱包', preparation: '学习进度', social: '社交', fitness: '体能', mood: '心情', furtherStudy: '深造准备', jobPreparation: '求职准备' };
  return Object.entries(changes || {}).filter(([, value]) => value !== 0).map(([key, value]) => names[key] + ' ' + (value > 0 ? '+' : '−') + Math.abs(value) + (key === 'money' ? ' 元' : '')).join(' · ') || '没什么明显变化';
}
function costs(effect) {
  return [(effect.time ? '时间 −' + effect.time : ''), (effect.energy ? '精力 −' + effect.energy : ''), (effect.money ? '钱包 −' + effect.money + ' 元' : ''), (effect.mood < 0 ? '心情 −' + Math.min(state.mood, Math.abs(effect.mood)) : '')].filter(Boolean).join(' · ') || '不消耗资源';
}
function renderActions() {
  const actions = Object.keys(game.ACTIONS).filter((id) => game.ACTIONS[id].place === activePlace);
  $('#actionList').innerHTML = actions.length ? actions.map((id) => {
    const action = game.getAction(state, id);
    const profile = game.getActionInvestment(state, id);
    const amount = actionDraft(id);
    const preview = profile && game.previewActionInvestment(state, id, amount);
    const check = game.availability(state, id, amount);
    return '<article class="action-card"><div class="action-card-top"><h3>' + h(action.title) + '</h3><span class="action-count">' + (action.limit ? '本学期 ' + (state.counts[id] || 0) + ' / ' + action.limit + ' 次' : action.chain ? '事件链行动' : '按剩余时间安排') + '</span></div><p>' + h(profile ? profile.description : action.description) + '</p>' + (action.backgroundBonus ? '<p class="background-bonus">背景特点：' + h(action.backgroundBonus) + '</p>' : '') + (profile ? investmentControls({ id }, profile, { amount }, 'action') : '') + '<div class="action-cost" id="investment-cost-action-' + id + '">' + h(costs(preview?.ok ? preview.effect : action)) + '</div><button type="button" id="action-choice-' + id + '" data-action="' + id + '" data-revision="' + state.revision + '" ' + (!check.ok || uiLocked ? 'disabled' : '') + '>确认' + h(action.title) + '</button><div class="action-reason" id="investment-reason-action-' + id + '">' + (check.ok ? '' : h(check.reason)) + '</div></article>';
  }).join('') : '<div class="unavailable-card"><h3>这里暂时没有可做的事</h3><p>去别的地方逛逛吧。</p></div>';
}
function openPlace(key, hotspot) {
  if (!state) return;
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
  $('#placeScreen').classList.add('is-open');
  $('#placeScreen').setAttribute('aria-hidden', 'false');
  $('#placeScreen').inert = false;
  $('#mapScreen').inert = true;
  document.body.style.overflow = 'hidden';
  renderState();
  $('#backButton').focus();
}
function closePlace() {
  $('#placeScreen').classList.remove('is-open');
  $('#placeScreen').setAttribute('aria-hidden', 'true');
  $('#placeScreen').inert = true;
  $('#mapScreen').inert = false;
  hotspots.forEach((item) => item.classList.remove('is-active'));
  document.body.style.overflow = '';
  activePlace = null;
  if (!dialog.open) lastHotspot?.focus();
}
function showDialog(mode, title, body, buttons = []) {
  dialogMode = mode;
  dialog.classList.toggle('event-dialog', mode === 'event');
  $('.dialog-kicker').textContent = '北交人生 · ' + ({ event: '校园事件', eventResult: '生活回顾', admission: '入学', enrollment: '入学', endingChoice: '毕业方向', finished: '四年手账' }[mode] || '校园手账');
  $('#dialogTitle').textContent = title;
  $('#dialogNotice').textContent = '';
  $('#dialogBody').innerHTML = body;
  $('#dialogButtons').innerHTML = buttons.map(({ id, text, secondary }) => '<button type="button" data-dialog-action="' + id + '" data-revision="' + (state?.revision || 0) + '" class="' + (secondary ? 'secondary' : '') + '"' + (uiLocked ? ' disabled' : '') + '>' + h(text) + '</button>').join('');
  $('#dialogSave').hidden = !state || ['admission', 'restart', 'save', 'load', 'confirmSave'].includes(mode);
  if (!dialog.open) dialog.showModal();
  (dialog.querySelector('input') || $('#dialogTitle')).focus({ preventScroll: true });
  dialog.scrollTop = 0;
}
function lockUi() {
  uiLocked = true;
  clearTimeout(unlockTimer);
  if (activePlace) renderActions();
  dialog.querySelectorAll('[data-dialog-action], [data-event-choice], [data-ending]').forEach((button) => { button.disabled = true; });
  unlockTimer = setTimeout(() => {
    uiLocked = false;
    if (activePlace) renderActions();
    dialog.querySelectorAll('[data-dialog-action]').forEach((button) => { button.disabled = false; });
    dialog.querySelectorAll('[data-event-choice]').forEach((button) => { button.disabled = !game.eventAvailability(state, button.dataset.eventChoice, button.dataset.instance, eventDraft(button.dataset.eventChoice)).ok; });
    dialog.querySelectorAll('[data-ending]').forEach((button) => { button.disabled = !state.endingOptions.options.find((item) => item.id === button.dataset.ending)?.available; });
  }, 300);
}
function runCommand(operation, id, expectedRevision, eventInstanceId, investment) {
  if (!state || uiLocked) return null;
  const options = { commandId: 'ui:' + sessionId + ':' + (++commandSequence), expectedRevision: Number(expectedRevision), eventInstanceId, investment };
  const result = ['executeAction', 'submitEventChoice', 'chooseEnding'].includes(operation) ? game[operation](state, id, options) : game[operation](state, options);
  if (!result.ok) {
    failures.push({ operation, id: id || null, reason: result.reason, state: game.stateBrief(state), expectedRevision: options.expectedRevision });
    audio?.play('deny');
    showToast(result.reason);
    return null;
  }
  state = result.state;
  lockUi();
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
  const info = saves.inspect();
  showDialog('admission', '你好，北交', '<p>八个学期，从拖着行李箱进校门开始。学习、社团、项目、实习、生活费，每一项都得你自己拿主意。</p><form id="admissionForm"><label for="nicknameInput">你的昵称</label><input id="nicknameInput" name="nickname" maxlength="24" placeholder="最多 12 个字符" autocomplete="off" required>' + (debug ? '<label for="seedInput">测试随机种子</label><input id="seedInput" maxlength="64" value="mvp-test">' : '') + '<p id="admissionError" class="action-reason" role="alert"></p><button type="submit">开始新生活</button></form><h3>或选择存档继续</h3>' + slotCards(info, 'load') + '<p class="dialog-note">共有 3 个存档栏位，新局首次保存时可自主选择。旧版存档位于栏位 1。</p>');
}
function startGame() {
  const checked = game.validateNickname($('#nicknameInput').value);
  if (!checked.ok) { $('#admissionError').textContent = checked.reason; return; }
  const seed = debug ? $('#seedInput').value : (window.crypto?.getRandomValues ? String(window.crypto.getRandomValues(new Uint32Array(1))[0]) : String(Date.now()));
  try { state = game.createGame({ nickname: checked.value, seed }); } catch (error) { $('#admissionError').textContent = error.message; return; }
  savedRevision = -1;
  activeSaveSlot = null;
  savedAt = '';
  saveNotice = '';
  failures.length = 0;
  audio?.play('success');
  audio?.startBgm();
  renderState();
  showEnrollment();
}
function showEnrollment() {
  const background = game.BACKGROUNDS.find((item) => item.id === state.background.id);
  showDialog('enrollment', '录取通知', '<p>' + h(state.nickname) + '，欢迎你。</p><p>录取信息：<b>' + h(state.background.college) + '</b> · ' + h(state.background.major) + '</p><p>' + h(background.bonus) + '</p><p class="dialog-note">背景只影响一项行动加成，不会锁死你的毕业路线。入学后可在「入学背景」里随时查看。</p>', [{ id: 'resume', text: '看看怎么安排' }]);
}
function showTutorial() {
  showDialog('tutorial', '八学期怎么安排', '<ol><li>点击地图上的地点，先看活动安排和成本，再决定做不做。逛逛、返回都不花钱。</li><li>日常行动与部分校园事件可以选择不同的投入档位，每档的时间和资源成本固定。确认前查看成本，完成后才揭晓实际变化和原因；每次经历都会记入成长记录。</li><li>学习和自学都攒同一个学习进度；期末成绩 = round(40 + 学习进度 × 0.6)，60 分达标。</li><li>每学期 12 点时间。休息能回精力，回不了时间；长期属性和经历会跟着你跨学期。</li><li>项目、社团、实习，各要一次申请加两次投入。项目和社团的成果在之后的学期确认。</li><li>普通毕业：平均成绩至少 60，且六学期达标。深造再加：平均 80、完成项目、深造准备 60。就业再加：完成实习、求职准备 60。</li><li>大三起开放深造与求职准备。方向可以兼顾、转换，毕业时挑一个够得着的。</li><li>点击保存从 3 个栏位中选择一个。学期结算与毕业确认后自动保存到当前栏位；首次选栏前仅保留本页进度。关闭页面后从入学页选择存档继续。</li></ol>', [{ id: 'resume', text: '开始安排' }]);
}
function showBackground() {
  const background = game.BACKGROUNDS.find((item) => item.id === state.background.id);
  showDialog('background', '入学背景', '<p><b>' + h(state.nickname) + '</b> · ' + h(state.background.college) + ' · ' + h(state.background.major) + '</p><p>' + h(background.bonus) + '</p><p>学院类别与专业方向是玩法用的简化设定，不代表学校实际培养方案。背景不会锁死你的毕业路线。</p>', [{ id: 'resume', text: '继续安排' }]);
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
  const choices = event.choices.filter(choice => !choice.legacyHidden).map((choice) => {
    const profile = game.getEventInvestment(state, choice.id);
    const amount = eventDraft(choice.id, true);
    const preview = profile && game.previewEventInvestment(state, choice.id, amount);
    const check = game.eventAvailability(state, choice.id, pending.instanceId, amount);
    return '<article class="event-choice' + (profile ? ' has-investment' : '') + '"><h3>' + h(choice.title) + '</h3><p>' + h(profile ? profile.description : choice.description) + '</p>' + (profile ? investmentControls(choice, profile, preview) : '') + '<div class="action-cost" id="investment-cost-' + choice.id + '">' + h(costs(preview?.ok ? preview.effect : choice)) + '</div>' + '<button type="button" id="event-choice-' + choice.id + '" data-event-choice="' + choice.id + '" data-instance="' + pending.instanceId + '" data-revision="' + state.revision + '"' + (!check.ok || uiLocked ? ' disabled' : '') + '>' + (profile ? '确认投入，' : '选择：') + h(choice.title) + '</button><div class="action-reason" id="investment-reason-' + choice.id + '">' + (check.ok ? '' : h(check.reason)) + '</div></article>';
  }).join('');
  showDialog('event', event.title, '<p>' + h(event.description) + '</p><p class="dialog-note">' + h(event.trigger) + '。剩余时间 ' + state.time + ' · 精力 ' + state.energy + ' · 钱包 ' + state.money + ' 元。确认才扣费，切换档位不会结算。</p><div class="event-choice-list">' + choices + '</div>');
}
const INVESTMENT_OUTCOMES = { setback: '发挥失常', limited: '收获有限', steady: '有所收获', good: '状态出色', surprise: '意外收获' };
function showEventResult(entry) {
  const result = entry.investment;
  const profile = entry.event ? game.EVENT_INVESTMENTS[entry.event + ':' + entry.choice] || game.LEGACY_INVESTMENTS.events[entry.event + ':' + entry.choice] : game.getActionInvestment(state, entry.action) || game.LEGACY_INVESTMENTS.actions[entry.action];
  const capped = Object.keys(profile.rewards).some(key => state[key === 'recovery' ? 'energy' : key] === 100);
  const title = entry.event ? game.EVENTS[entry.event].title : game.ACTIONS[entry.action].title;
  showDialog('eventResult', title + ' · 结果', '<div class="investment-result"><span class="outcome-badge outcome-' + result.outcome + '">' + INVESTMENT_OUTCOMES[result.outcome] + '</span><p class="investment-spent">本次投入 <b>' + result.amount + ' ' + investmentUnit(result.resource) + '</b></p><p class="investment-story">' + h(result.description) + '</p><div class="investment-actual"><span>实际变化</span><b>' + h(changeText(entry.changes)) + '</b></div>' + (capped ? '<p>部分属性已达上限，实际增加量以当前状态为准。</p>' : '') + '<p class="dialog-note">这次结果已经记入成长记录，继续或保存都不会重新结算。</p></div>', [{ id: 'eventContinue', text: state.pendingEvent?.id === 'military2' ? '继续军训汇演' : state.pendingEvent ? '处理下一个事件' : '继续安排' }]);
}
function summaryMarkup(summary) {
  return '<div class="summary-score"><b>' + summary.grade + '</b><span>分 · ' + (summary.passed ? '课程达标' : '课程未达标') + '</span></div><p>学习进度 ' + summary.preparation + ' / 100。期末成绩按 40 + 学习进度 × 0.6 计算。</p><div class="summary-lines"><span>生活费 <b>−300 元</b></span><span>补助 <b>+' + summary.aid + ' 元</b></span><span>结余 <b>' + summary.moneyAfter + ' 元</b></span><span>没用完的时间 <b>' + summary.unusedTime + ' 点，不结转</b></span></div>' + summary.notices.map((notice) => '<p>' + h(notice) + '</p>').join('');
}
function requestEndTerm() {
  if (!state) return;
  if (state.phase !== 'playing') { resumePhase(); return; }
  const preview = game.previewSettlement(state);
  showDialog('confirm', '结束' + preview.name + '？', summaryMarkup(preview) + '<p class="dialog-note">这是只读预览。确认后本学期不能继续行动。' + (activeSaveSlot === null ? '当前尚未选择存档栏位，结算后请手动选择栏位保存。' : '将自动保存到栏位 ' + activeSaveSlot + '。') + (preview.unusedTime ? '还有 ' + preview.unusedTime + ' 点时间，可以继续安排。' : '') + '</p>', [{ id: 'resume', text: '继续本学期', secondary: true }, { id: 'settle', text: '确认结算' }]);
}
function showSummary() {
  audio?.play('paper');
  showDialog('summary', state.summary.name + ' · 学期总结', summaryMarkup(state.summary) + '<p>' + h(saveNotice || '可以随时保存当前总结。') + '</p><p>' + (state.term === 8 ? '八个学期的记录齐了。接下来，看看毕业的路往哪走。' : '开学之后，时间和精力重新给足，学习进度从头攒；存款、长期状态和之前的投入都还跟着你。') + '</p>', [{ id: 'next', text: state.term === 8 ? '评估毕业方向' : '进入' + game.TERM_NAMES[state.term] }]);
}
function courseTable() {
  if (!state.courses.length) return '<p>还没有结算过的成绩。</p>';
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
  military: '军训汇演完成', singer: '歌手大赛经历', trip: '返乡分享经历', contest: '学科竞赛经历'
};
function investmentRecord() {
  const entries = state.history.filter(entry => entry.investment).slice().reverse();
  return '<h3>投入与收获</h3>' + (entries.length ? entries.map(entry => '<article class="investment-record"><h4>' + game.TERM_NAMES[entry.term - 1] + ' · ' + h(entry.event ? game.EVENTS[entry.event].title : game.ACTIONS[entry.action].title) + '</h4><span class="outcome-badge outcome-' + entry.investment.outcome + '">' + INVESTMENT_OUTCOMES[entry.investment.outcome] + '</span><p>投入 ' + entry.investment.amount + ' ' + investmentUnit(entry.investment.resource) + '</p><p>' + h(entry.investment.description) + '</p><div class="action-gain">' + h(changeText(entry.changes)) + '</div></article>').join('') : '<p>完成自主投入的行动后，这里会记下你的选择和结果。</p>');
}
function growthRecord() {
  return courseTable() + investmentRecord() + '<h3>校园经历</h3>' + (state.experiences.length ? '<ul>' + state.experiences.map((item) => '<li>' + game.TERM_NAMES[item.term - 1] + '：' + h(EXPERIENCE_LABELS[item.type] || '校园经历') + '</li>').join('') + '</ul>' : '<p>还没有拿得出手的经历。</p>') + '<h3>事件链进度</h3><ul>' + Object.entries(state.chains).map(([id, chain]) => '<li>' + game.CHAIN_NAMES[id] + '：' + chainLabel(chain) + (chain.status === 'active' ? '，预计第 ' + chain.deadline + ' 学期出结果' : '') + '</li>').join('') + '</ul><h3>毕业条件进度</h3>' + game.evaluateEndings(state).options.filter((item) => item.id !== 'notQualified').map((item) => '<h4>' + h(item.title) + '</h4>' + requirementsMarkup(item.requirements)).join('');
}
const ENDING_TEXT = {
  ordinary: '毕业典礼的台子搭在操场边上，学士服领到手的时候还带着消毒水味。你想起大一第一次进校门，行李箱的轮子在石板路上响了一路。四年的账算下来不复杂：八张成绩单、几场活动、一次体测、几个没说出口的遗憾。有人去了远方，有人留在北京，你选了最稳的一条路。稳妥不是妥协，是你一个学期一个学期攒出来的底气。银杏大道下个秋天还会金黄，只是看它的人换了一批。行李打包完，你在宿舍门口站了会儿，把钥匙放在了宿管阿姨的窗口。出门的时候，风里有北京秋天常有的那种凉。你回头看了一眼，楼还是那栋楼。',
  furtherStudy: '录取结果出来的那天，你在图书馆的老位置上坐了很久。窗外银杏叶还没黄透，键盘边摊着你四年攒下的成绩单和项目结题报告。你想起实验室改到熄灯的晚上，想起答辩前手心出的汗，想起自习室里陌生人给你留的半张桌子。深造的路，是一次次「再来一遍」铺出来的。秋天你还会回到这间图书馆，只是身份换了：从占座的人，变成写论文的人。导师的邮件躺在邮箱里，回复写了又删，最后发出去一句「收到，谢谢老师」。窗外有鸟落在窗台上。你忽然想，四年前那个拖着行李箱的你，大概想不到今天。',
  employment: '三方协议签完那天，你在食堂吃了最后一顿窗口的饭。熟悉的打菜阿姨问你毕业去哪，你说了个城市名。实习时的通勤路线、改过七版的简历、面试官问倒你的那个问题，都成了档案里薄薄的几页。校门口的行李托运点排着长队，四年生活被打包成两三个纸箱。你最后看了一眼南门，知道下次回来，这里会叫你校友。手机亮了，是入职通知，提醒你下周一报到。你关掉屏幕，把手机塞进口袋，往地铁站走去。进站的风吹起衣角，晚高峰的人流把你卷了进去，和这座城市里的其他人一样。',
  notQualified: '有些学期过得潦草，成绩单上有几行空着。收拾行李的时候你才发现，四年比想象中结束得快。遗憾是真的：欠下的课、没递出的申请、拖到最后的复习。但走过的路也不算白走——认识的人、熬过的夜、银杏大道上散过的步，都还是你的。人生不只有一张毕业证那么窄的路。先把这段日子收好，接下来怎么走，决定权还在你手里。远处操场传来口哨声，和四年前开学那天一样。你拉着箱子走向校门，门口的风把几张旧纸吹得翻起来。天还亮着。'
};
function showResult() {
  audio?.play('fanfare');
  showDialog('finished', state.result.title, '<p>' + (ENDING_TEXT[state.result.direction] || '') + '</p><p>平均成绩 <b>' + state.result.average.toFixed(1) + '</b>，达标 <b>' + state.result.passed + '/8</b> 学期。</p><p>' + h(saveNotice || '可以把这段结局保存下来。') + '</p>' + requirementsMarkup(state.result.requirements) + growthRecord(), [{ id: 'resume', text: '返回地图', secondary: true }, { id: 'restart', text: '重新开始' }]);
}
function resumePhase() {
  if (!state) { showAdmission(); return; }
  state = game.resumeRequiredEvents(state);
  const last = state.history.at(-1);
  if (last?.investment && acknowledgedResultRevision !== state.revision) { showEventResult(last); return; }
  if (state.phase === 'eventPending') showEvent();
  else if (state.phase === 'summary') showSummary();
  else if (state.phase === 'endingChoice') showEndings();
  else if (state.phase === 'finished') showResult();
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
  eventDrafts.clear();
  acknowledgedResultRevision = -1;
  savedRevision = state.revision;
  savedAt = result.savedAt;
  saveNotice = '已恢复栏位 ' + slotId + ' · ' + displayTime(savedAt);
  clearTimeout(unlockTimer);
  uiLocked = false;
  failures.length = 0;
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
});
$('#actionList').addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (button?.dataset.actionInvestmentPreset) { updateActionInvestment(button.dataset.actionInvestmentPreset, Number(button.dataset.amount)); return; }
  if (!button || game.ACTIONS[button.dataset.action]?.place !== activePlace || dialog.open) return;
  const result = runCommand('executeAction', button.dataset.action, button.dataset.revision, undefined, actionDraft(button.dataset.action));
  if (!result) return;
  audio?.play(ACTION_SOUNDS[button.dataset.action] || 'success');
  $('#actionFeedback').textContent = (result.entry.investment?.description || ACTION_FLAVOR[result.entry.action] || result.entry.title + '完成') + ' ' + changeText(result.changes) + (state.time === 0 ? ' 时间用完了，回地图结束这个学期吧。' : '');
  if (result.entry.investment) showEventResult(result.entry);
  else if (state.phase === 'eventPending') showEvent();
});
$('#dialogBody').addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.saveSlot) {
    if (dialogMode === 'save') selectSaveSlot(Number(button.dataset.saveSlot));
  } else if (button.dataset.loadSlot) {
    if (['load', 'admission'].includes(dialogMode)) loadGame(Number(button.dataset.loadSlot), button.dataset.saveSource);
  } else if (button.dataset.investmentPreset) {
    updateInvestment(button.dataset.investmentPreset, Number(button.dataset.amount));
  } else if (button.dataset.eventChoice) {
    const result = runCommand('submitEventChoice', button.dataset.eventChoice, button.dataset.revision, button.dataset.instance, eventDraft(button.dataset.eventChoice));
    if (!result) return;
    audio?.play('success');
    const feedback = result.entry.investment?.description || EVENT_CHOICE_FLAVOR[result.entry.event + ':' + result.entry.choice] || result.entry.title + '。';
    $('#actionFeedback').textContent = feedback;
    if (result.entry.investment) showEventResult(result.entry);
    else if (state.phase === 'eventPending') { showEvent(); $('#dialogNotice').textContent = feedback; } else { dialog.close(); showToast(feedback); }
  } else if (button.dataset.ending) {
    if (runCommand('chooseEnding', button.dataset.ending, button.dataset.revision)) { saveCurrent(true); showResult(); }
  }
});
$('#dialogButtons').addEventListener('click', (event) => {
  const button = event.target.closest('[data-dialog-action]');
  if (!button || uiLocked) return;
  const id = button.dataset.dialogAction;
  if (id === 'resume') { if (dialogMode === 'finished') dialog.close(); else if (dialogMode === 'enrollment') showTutorial(); else resumePhase(); }
  else if (id === 'eventContinue' && dialogMode === 'eventResult') { acknowledgedResultRevision = state.revision; resumePhase(); }
  else if (id === 'admission') showAdmission();
  else if (id === 'confirmSave' && dialogMode === 'confirmSave' && saveTarget !== null) finishSave(saveTarget);
  else if (id === 'backToSave') showSave();
  else if (id === 'settle' && dialogMode === 'confirm') { if (runCommand('endTerm', null, button.dataset.revision)) { saveCurrent(true); showSummary(); } }
  else if (id === 'next' && dialogMode === 'summary') { if (runCommand('continueGame', null, button.dataset.revision)) resumePhase(); }
  else if (id === 'restart') askRestart();
  else if (id === 'confirmRestart') {
    closePlace();
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
$('#backButton').addEventListener('click', closePlace);
$('#endTermButton').addEventListener('click', requestEndTerm);
$('#saveButton').addEventListener('click', showSave);
$('#dialogSave').addEventListener('click', showSave);
$('#loadButton').addEventListener('click', showLoad);
$('#helpButton').addEventListener('click', () => { if (state) showTutorial(); });
$('#backgroundButton').addEventListener('click', () => { if (state) showBackground(); });
$('#restartButton').addEventListener('click', () => { if (state) askRestart(); });
$('#historyButton').addEventListener('click', () => { if (state) showDialog('history', '四年成长记录', growthRecord(), [{ id: 'resume', text: '继续安排' }]); });
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
  if (!state || ['eventPending', 'summary', 'endingChoice'].includes(state.phase) || ['admission', 'restart', 'enrollment'].includes(dialogMode)) event.preventDefault();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && activePlace && !dialog.open) closePlace();
});
if (typeof HTMLDialogElement === 'undefined' || typeof HTMLDialogElement.prototype.showModal !== 'function') {
  $('.game-shell').innerHTML = '<div class="browser-notice"><h2>请使用较新的浏览器打开</h2><p>本游戏需要支持弹窗等现代网页特性的浏览器。请升级微信或浏览器，或用系统浏览器打开本地址。</p><p class="browser-notice-url">https://zjr231.github.io/BJTU-Life-Simulator/</p></div>';
} else {
  showAdmission();
}
