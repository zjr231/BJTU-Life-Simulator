'use strict';

const game = CampusGame;
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const h = escapeHtml;
const hotspots = [...document.querySelectorAll('.map-hotspot')];
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
const failures = [];
const sessionId = Date.now().toString(36);
function showToast(message) {
  if (dialog.open) $('#dialogNotice').textContent = message;
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 4000);
}
function statsMarkup() {
  const latest = state.courses.at(-1);
  const items = [
    ['成绩', latest ? latest.grade : '待结算', latest ? latest.name + ' · 最近成绩' : '首次期末生成', 'grade'],
    ['社交', state.social, '/ 100 · 长期成长', 'social'], ['体能', state.fitness, '/ 100 · 体测条件', 'fitness'],
    ['心情', state.mood, '/ 100 · 影响事件', state.mood < 30 ? 'mood is-low' : 'mood'],
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
  $('#termLabel').textContent = game.TERM_NAMES[state.term - 1] + (state.phase === 'finished' ? ' · 已结束' : ' · 第 ' + state.term + ' 学期');
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
  return Object.entries(changes || {}).filter(([, value]) => value !== 0).map(([key, value]) => names[key] + ' ' + (value > 0 ? '+' : '−') + Math.abs(value) + (key === 'money' ? ' 元' : '')).join(' · ') || '资源属性无变化';
}
function gains(effect) {
  const changes = game.previewChanges(state, effect);
  const positives = Object.fromEntries(Object.entries(changes).filter(([, value]) => value > 0));
  if (effect.kind === 'apply') return '申请后选择是否加入';
  const chainEffect = { accept: '开启事件链', defer: '暂缓申请', postpone: '保留投入，延后一学期', complete: '完成经历', abandon: '保留投入记录，放弃完成经历' }[effect.chainEffect];
  return [Object.keys(positives).length ? changeText(positives) : '', effect.kind === 'work' ? '事件链投入 +1' : '', chainEffect || ''].filter(Boolean).join(' · ') || '保留资源，继续安排';
}
function costs(effect) {
  return [(effect.time ? '时间 −' + effect.time : ''), (effect.energy ? '精力 −' + effect.energy : ''), (effect.money ? '钱包 −' + effect.money + ' 元' : ''), (effect.mood < 0 ? '心情 −' + Math.min(state.mood, Math.abs(effect.mood)) : '')].filter(Boolean).join(' · ') || '不消耗资源';
}
function renderActions() {
  const actions = Object.keys(game.ACTIONS).filter((id) => game.ACTIONS[id].place === activePlace);
  $('#actionList').innerHTML = actions.length ? actions.map((id) => {
    const action = game.getAction(state, id);
    const check = game.availability(state, id);
    return '<article class="action-card"><div class="action-card-top"><h3>' + h(action.title) + '</h3><span class="action-count">' + (action.limit ? '本学期 ' + (state.counts[id] || 0) + ' / ' + action.limit + ' 次' : action.chain ? '事件链行动' : '按剩余时间安排') + '</span></div><p>' + h(action.description) + '</p>' + (action.backgroundBonus ? '<p class="background-bonus">背景加成：' + h(action.backgroundBonus) + '</p>' : '') + '<div class="action-cost">' + h(costs(action)) + '</div><div class="action-gain">' + h(gains(action)) + '</div><button type="button" data-action="' + id + '" data-revision="' + state.revision + '" ' + (!check.ok || uiLocked ? 'disabled' : '') + '>执行' + h(action.title) + '</button>' + (!check.ok ? '<div class="action-reason">' + h(check.reason) + '</div>' : '') + '</article>';
  }).join('') : '<div class="unavailable-card"><h3>地点尚未开放</h3><p>八处可行动地点：思源楼、图书馆、逸夫楼、学生活动中心、宿舍、南门、操场、银杏大道。</p></div>';
}
function openPlace(key, hotspot) {
  if (!state) return;
  if (state.phase !== 'playing') { resumePhase(); return; }
  if (!Object.hasOwn(game.PLACES, key)) return;
  activePlace = key;
  lastHotspot = hotspot;
  $('#placeTitle').textContent = game.PLACES[key].title;
  $('#placeKicker').textContent = '主校区 · ' + game.PLACES[key].kicker;
  $('#placeDescription').textContent = game.PLACES[key].description;
  $('#actionFeedback').textContent = '查看地点不消耗资源。行动收益固定，接近上限时显示实际增量。';
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
  $('.dialog-kicker').textContent = '北交人生 · ' + ({ event: '校园事件', admission: '入学', endingChoice: '毕业方向', finished: '四年手账' }[mode] || '校园手账');
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
    dialog.querySelectorAll('[data-event-choice]').forEach((button) => { button.disabled = !game.eventAvailability(state, button.dataset.eventChoice, button.dataset.instance).ok; });
    dialog.querySelectorAll('[data-ending]').forEach((button) => { button.disabled = !state.endingOptions.options.find((item) => item.id === button.dataset.ending)?.available; });
  }, 300);
}
function runCommand(operation, id, expectedRevision, eventInstanceId) {
  if (!state || uiLocked) return null;
  const options = { commandId: 'ui:' + sessionId + ':' + (++commandSequence), expectedRevision: Number(expectedRevision), eventInstanceId };
  const result = ['executeAction', 'submitEventChoice', 'chooseEnding'].includes(operation) ? game[operation](state, id, options) : game[operation](state, options);
  if (!result.ok) {
    failures.push({ operation, id: id || null, reason: result.reason, state: game.stateBrief(state), expectedRevision: options.expectedRevision });
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
  showDialog('admission', '开启你的北交生活', '<p>用八个学期经营学习、社交与校园经历。学院与专业采用游戏中的简化背景，每个背景有一项行动加成。</p><form id="admissionForm"><label for="nicknameInput">游戏昵称</label><input id="nicknameInput" name="nickname" maxlength="24" placeholder="最多 12 个字符" autocomplete="off" required>' + (debug ? '<label for="seedInput">测试随机种子</label><input id="seedInput" maxlength="64" value="mvp-test">' : '') + '<p id="admissionError" class="action-reason" role="alert"></p><button type="submit">开始新生活</button></form><h3>或选择存档继续</h3>' + slotCards(info, 'load') + '<p class="dialog-note">共有 3 个存档栏位，新局首次保存时可自主选择。旧版存档位于栏位 1。</p>');
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
  renderState();
  showTutorial();
}
function showTutorial() {
  showDialog('tutorial', '八学期怎么安排', '<ol><li>点击地图地点，查看成本与收益，再执行活动。查看与返回都免费。</li><li>学习和自学增加同一项学习进度；期末成绩 = round(40 + 学习进度 × 0.6)，60 分达标。</li><li>每学期有 12 点时间。休息恢复精力，不能恢复时间；长期属性与经历跨学期保留。</li><li>项目、社团与实习分别需要申请和两次投入。项目和社团在后续学期确认成果。</li><li>普通毕业需平均成绩至少 60，且六学期达标；深造还需平均 80、项目经历与深造准备 60；就业还需实习与求职准备 60。</li><li>大三起开放深造与求职准备。路线可以兼顾、转换，毕业时选择已满足的方向。</li><li>点击保存从 3 个栏位中选择一个。学期结算与毕业确认后自动保存到当前栏位；首次选栏前仅保留本页进度。关闭页面后从入学页选择存档继续。</li></ol>', [{ id: 'resume', text: '开始安排' }]);
}
function showBackground() {
  const background = game.BACKGROUNDS.find((item) => item.id === state.background.id);
  showDialog('background', '入学背景', '<p><b>' + h(state.nickname) + '</b> · ' + h(state.background.college) + ' · ' + h(state.background.major) + '</p><p>' + h(background.bonus) + '</p><p>这些学院类别与专业方向是用于玩法的简化配置，不代表学校实际培养方案。背景不会锁定毕业路线。</p>', [{ id: 'resume', text: '继续安排' }]);
}
function showEvent() {
  const pending = state.pendingEvent;
  const event = game.EVENTS[pending.id];
  const choices = event.choices.map((choice) => {
    const check = game.eventAvailability(state, choice.id);
    return '<article class="event-choice"><h3>' + h(choice.title) + '</h3><p>' + h(choice.description) + '</p><div class="action-cost">' + h(costs(choice)) + '</div><div class="action-gain">' + h(gains(choice)) + '</div><button type="button" data-event-choice="' + choice.id + '" data-instance="' + pending.instanceId + '" data-revision="' + state.revision + '"' + (!check.ok || uiLocked ? ' disabled' : '') + '>选择：' + h(choice.title) + '</button>' + (check.ok ? '' : '<div class="action-reason">' + h(check.reason) + '</div>') + '</article>';
  }).join('');
  showDialog('event', event.title, '<p>' + h(event.description) + '</p><p class="dialog-note">' + h(event.trigger) + '。先完成选择，再行动或结算。当前事件可以保存。</p><div class="event-choice-list">' + choices + '</div>');
}
function summaryMarkup(summary) {
  return '<div class="summary-score"><b>' + summary.grade + '</b><span>分 · ' + (summary.passed ? '课程达标' : '课程未达标') + '</span></div><p>学习进度 ' + summary.preparation + ' / 100；固定公式：round(40 + 学习进度 × 0.6)。</p><div class="summary-lines"><span>生活支出 <b>−300 元</b></span><span>困难援助 <b>+' + summary.aid + ' 元</b></span><span>结算后资金 <b>' + summary.moneyAfter + ' 元</b></span><span>未使用时间 <b>' + summary.unusedTime + ' 点，不结转</b></span></div>' + summary.notices.map((notice) => '<p>' + h(notice) + '</p>').join('');
}
function requestEndTerm() {
  if (!state) return;
  if (state.phase !== 'playing') { resumePhase(); return; }
  const preview = game.previewSettlement(state);
  showDialog('confirm', '结束' + preview.name + '？', summaryMarkup(preview) + '<p class="dialog-note">这是只读预览。确认后本学期不能继续行动。' + (activeSaveSlot === null ? '当前尚未选择存档栏位，结算后请手动选择栏位保存。' : '将自动保存到栏位 ' + activeSaveSlot + '。') + (preview.unusedTime ? '还有 ' + preview.unusedTime + ' 点时间，可以继续安排。' : '') + '</p>', [{ id: 'resume', text: '继续本学期', secondary: true }, { id: 'settle', text: '确认结算' }]);
}
function showSummary() {
  showDialog('summary', state.summary.name + ' · 学期总结', summaryMarkup(state.summary) + '<p>' + h(saveNotice || '可以随时保存当前总结。') + '</p><p>' + (state.term === 8 ? '八学期记录已经完成，接下来评估并选择毕业方向。' : '下一学期重置时间、精力、学习进度与行动次数；资金、长期属性、方向准备与事件链投入保留。') + '</p>', [{ id: 'next', text: state.term === 8 ? '评估毕业方向' : '进入' + game.TERM_NAMES[state.term] }]);
}
function courseTable() {
  if (!state.courses.length) return '<p>尚无已结算成绩。</p>';
  return '<table class="course-table"><thead><tr><th>学期</th><th>学习进度</th><th>成绩</th><th>结果</th></tr></thead><tbody>' + state.courses.map((item) => '<tr><td>' + h(item.name) + '</td><td>' + item.preparation + '</td><td>' + item.grade + '</td><td>' + (item.passed ? '达标' : '未达标') + '</td></tr>').join('') + '</tbody></table>';
}
function requirementsMarkup(requirements) {
  return '<ul class="requirements">' + requirements.map((item) => '<li class="' + (item.met ? 'met' : '') + '">' + (item.met ? '已满足：' : '未满足：') + h(item.label) + '</li>').join('') + '</ul>';
}
function showEndings() {
  showDialog('endingChoice', '选择毕业方向', '<p>八学期平均成绩 ' + state.endingOptions.average.toFixed(1) + '，达标 ' + state.endingOptions.passed + '/8 学期。显示取舍不改变实际判定值。</p><div class="ending-list">' + state.endingOptions.options.map((item) => '<article class="ending-card"><h3>' + h(item.title) + '</h3>' + requirementsMarkup(item.requirements) + '<button type="button" data-ending="' + item.id + '" data-revision="' + state.revision + '"' + (!item.available || uiLocked ? ' disabled' : '') + '>' + (item.available ? '选择' + h(item.title) : '条件未满足') + '</button></article>').join('') + '</div>');
}
function growthRecord() {
  return courseTable() + '<h3>校园经历</h3>' + (state.experiences.length ? '<ul>' + state.experiences.map((item) => '<li>' + game.TERM_NAMES[item.term - 1] + '：' + h(({ project: '校园项目完成', club: '社团组织经历', internship: '实习经历完成', fitnessTest: '体测体验达标' })[item.type]) + '</li>').join('') + '</ul>' : '<p>尚无已完成经历。</p>') + '<h3>事件链进度</h3><ul>' + Object.entries(state.chains).map(([id, chain]) => '<li>' + game.CHAIN_NAMES[id] + '：' + chainLabel(chain) + (chain.status === 'active' ? '，预计第 ' + chain.deadline + ' 学期完成' : '') + '</li>').join('') + '</ul><h3>毕业条件进度</h3>' + game.evaluateEndings(state).options.filter((item) => item.id !== 'notQualified').map((item) => '<h4>' + h(item.title) + '</h4>' + requirementsMarkup(item.requirements)).join('');
}
function showResult() {
  showDialog('finished', state.result.title, '<p>' + h(state.nickname) + '的四年校园生活结束了。平均成绩 <b>' + state.result.average.toFixed(1) + '</b>，达标 <b>' + state.result.passed + '/8</b> 学期。</p><p>' + h(saveNotice || '可以保存最终结果。') + '</p>' + requirementsMarkup(state.result.requirements) + growthRecord(), [{ id: 'resume', text: '返回地图', secondary: true }, { id: 'restart', text: '重新开始' }]);
}
function resumePhase() {
  if (!state) { showAdmission(); return; }
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
  state = result.state;
  activeSaveSlot = slotId;
  savedRevision = state.revision;
  savedAt = result.savedAt;
  saveNotice = '已恢复栏位 ' + slotId + ' · ' + displayTime(savedAt);
  clearTimeout(unlockTimer);
  uiLocked = false;
  failures.length = 0;
  renderState();
  resumePhase();
  showToast(source === 'backup' ? '已恢复栏位 ' + slotId + ' 的备份；下次保存时更新该栏位主档' : '已读取栏位 ' + slotId);
}
function askRestart() {
  showDialog('restart', '重新开始？', '<p>确认后返回入学页，当前未保存进度会被清空。现有存档在新局保存前仍可读取。</p>', [{ id: 'resume', text: '保留本局', secondary: true }, { id: 'confirmRestart', text: '确认重新开始' }]);
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
  const button = event.target.closest('[data-action]');
  if (!button || game.ACTIONS[button.dataset.action]?.place !== activePlace || dialog.open) return;
  const result = runCommand('executeAction', button.dataset.action, button.dataset.revision);
  if (!result) return;
  $('#actionFeedback').textContent = result.entry.title + '完成：' + changeText(result.changes) + '。' + (state.time === 0 ? '时间已用完，可返回地图结束学期。' : '');
  if (state.phase === 'eventPending') showEvent();
});
$('#dialogBody').addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.saveSlot) {
    if (dialogMode === 'save') selectSaveSlot(Number(button.dataset.saveSlot));
  } else if (button.dataset.loadSlot) {
    if (['load', 'admission'].includes(dialogMode)) loadGame(Number(button.dataset.loadSlot), button.dataset.saveSource);
  } else if (button.dataset.eventChoice) {
    const result = runCommand('submitEventChoice', button.dataset.eventChoice, button.dataset.revision, button.dataset.instance);
    if (!result) return;
    $('#actionFeedback').textContent = result.entry.title + '：' + changeText(result.changes);
    const chain = game.EVENTS[result.entry.event].chain;
    const feedback = result.entry.title + '：' + changeText(result.changes) + (chain ? '；' + game.CHAIN_NAMES[chain] + ' ' + chainLabel(state.chains[chain]) : '');
    if (state.phase === 'eventPending') { showEvent(); $('#dialogNotice').textContent = feedback; } else { dialog.close(); showToast(feedback); }
  } else if (button.dataset.ending) {
    if (runCommand('chooseEnding', button.dataset.ending, button.dataset.revision)) { saveCurrent(true); showResult(); }
  }
});
$('#dialogButtons').addEventListener('click', (event) => {
  const button = event.target.closest('[data-dialog-action]');
  if (!button || uiLocked) return;
  const id = button.dataset.dialogAction;
  if (id === 'resume') { if (dialogMode === 'finished') dialog.close(); else resumePhase(); }
  else if (id === 'admission') showAdmission();
  else if (id === 'confirmSave' && dialogMode === 'confirmSave' && saveTarget !== null) finishSave(saveTarget);
  else if (id === 'backToSave') showSave();
  else if (id === 'settle' && dialogMode === 'confirm') { if (runCommand('endTerm', null, button.dataset.revision)) { saveCurrent(true); showSummary(); } }
  else if (id === 'next' && dialogMode === 'summary') { if (runCommand('continueGame', null, button.dataset.revision)) resumePhase(); }
  else if (id === 'restart') askRestart();
  else if (id === 'confirmRestart') {
    closePlace();
    state = null;
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
$('#debugPanel').hidden = !debug;
window.addEventListener('storage', (event) => {
  if (activeSaveSlot !== null && (event.key === null || event.key === CampusSave.getSlotKeys(activeSaveSlot).primary)) {
    $('#sessionNote').textContent = '另一个标签页更新了栏位 ' + activeSaveSlot + '。当前游戏仍可继续，保存前请读取最新存档。';
    showToast('当前存档栏位发生变化，请先读取最新存档');
  }
});
dialog.addEventListener('cancel', (event) => {
  if (!state || ['eventPending', 'summary', 'endingChoice'].includes(state.phase) || ['admission', 'restart'].includes(dialogMode)) event.preventDefault();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && activePlace && !dialog.open) closePlace();
});
showAdmission();
