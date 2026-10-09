'use strict';

const places = {
  activity: { title: '学生活动中心', kicker: '社团与活动', description: '社团招新与校园活动将在后续版本开放。' },
  think: { title: '思源楼', kicker: '课程与学习', description: '为本学期课程投入时间。学习积累课程准备，期末结算为课程表现。' },
  library: { title: '图书馆', kicker: '专业自学', description: '专业自学与深造准备将在后续版本开放。' },
  hospital: { title: '校医院', kicker: '身体状态', description: '身体恢复与相关事件将在后续版本开放。' },
  gate: { title: '南门', kicker: '兼职与机会', description: '走出校门，完成一轮校外家教，为生活和课程补习积攒资金。' },
  track: { title: '操场', kicker: '运动与体测', description: '跑道与球场都在这里。锻炼提高长期体能，消耗当前精力，也让心情舒展一点。' },
  auditorium: { title: '天佑会堂', kicker: '讲座与演出', description: '讲座与演出将在后续版本开放。' },
  ginkgo: { title: '银杏大道', kicker: '散步与心情', description: '风吹过金色的银杏，把脚步放慢一点。散步恢复心情和少量精力，时间仍然有限。' },
  yifu: { title: '逸夫楼', kicker: '课程与项目', description: '项目申请与持续投入将在后续版本开放。' },
  dorm: { title: '宿舍', kicker: '生活与休息', description: '恢复精力，和室友分享近况。休息也需要时间，合理安排本学期的投入。' },
  hotel: { title: '红果园宾馆', kicker: '接待与交流', description: '校友交流与来访事件将在后续版本开放。' }
};

const game = CampusGame;
let state = game.createGame();
let activePlace = null;
let lastHotspot = null;
let toastTimer;
let actionLocked = false;
let actionLockTimer;
let dialogMode = null;
let dialogLocked = false;
const $ = (selector) => document.querySelector(selector);
const hotspots = [...document.querySelectorAll('.map-hotspot')];
const dialog = $('#termDialog');

function showToast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 3000);
}

function statsMarkup() {
  const latest = state.courses[state.courses.length - 1];
  const items = [
    { name: '成绩', value: latest ? latest.grade : '待结算', note: latest ? `${latest.name} · 最近成绩` : '首次期末生成', style: 'grade' },
    { name: '社交', value: state.social, note: '/ 100 · 长期成长', style: 'social' },
    { name: '体能', value: state.fitness, note: '/ 100 · 体测条件', style: 'fitness' },
    { name: '心情', value: state.mood, note: '/ 100 · 影响事件', style: state.mood < game.RULES.lowMood ? 'mood is-low' : 'mood' },
    { name: '钱包', value: state.money, note: '元 · 可用资金', style: 'money' }
  ];
  return items.map((item) => `<div class="attribute ${item.style}"><span class="attribute-name">${item.name}</span><b>${item.value}</b><small>${item.note}</small></div>`).join('');
}

function renderState() {
  $('#termLabel').textContent = `${game.TERM_NAMES[state.term - 1]} · ${state.phase === 'graduated' ? '已完成' : `第 ${state.term} 学期`}`;
  $('#timeLabel').textContent = `时间 ${state.time} / ${game.RULES.time}`;
  $('#energyLabel').textContent = `精力 ${state.energy} / ${game.RULES.maxEnergy}`;
  $('#mapStats').innerHTML = statsMarkup();
  $('#preparationValue').textContent = `${state.preparation} / ${game.RULES.maxPreparation}`;
  $('#preparationMeter').value = state.preparation;
  $('#placeStats').innerHTML = `<div class="place-resources"><span>时间 <b>${state.time} / ${game.RULES.time}</b></span><span>精力 <b>${state.energy} / ${game.RULES.maxEnergy}</b></span><span>课程准备 <b>${state.preparation} / ${game.RULES.maxPreparation}</b></span></div><div class="place-attributes">${statsMarkup()}</div>`;
  $('#endTermButton').textContent = state.pendingEvent ? '处理当前事件' : state.phase === 'graduated' ? '查看完成结果' : state.phase === 'summary' ? '查看学期总结' : '结束学期';
  if (activePlace) renderActions();
}

function gains(action) {
  const changes = game.previewChanges(state, action);
  const parts = [];
  if (action.preparation) parts.push(`课程准备 +${changes.preparation}`);
  if (action.income) parts.push(`钱包 +${changes.money} 元`);
  if (action.recovery) parts.push(`精力 +${changes.energy}`);
  if (action.social > 0) parts.push(`社交 +${changes.social}`);
  if (action.fitness > 0) parts.push(`体能 +${changes.fitness}`);
  if (action.mood > 0) parts.push(`心情 +${changes.mood}`);
  return parts.join(' · ') || '保留当前状态';
}

function costs(action) {
  const changes = game.previewChanges(state, action);
  return [...(action.time ? [`时间 −${action.time}`] : []), ...(action.energy ? [`精力 −${action.energy}`] : []), ...(action.money ? [`钱包 −${action.money} 元`] : []), ...(changes.mood < 0 ? [`心情 −${Math.abs(changes.mood)}`] : [])].join(' · ') || '不消耗资源';
}

function renderActions() {
  const actions = Object.entries(game.ACTIONS).filter(([, action]) => action.place === activePlace);
  $('#actionList').innerHTML = actions.length ? actions.map(([id, action]) => {
    const check = game.availability(state, id);
    return `<article class="action-card"><div class="action-card-top"><h3>${action.title}</h3><span class="action-count">${action.limit ? `本学期 ${state.counts[id] || 0} / ${action.limit} 次` : '按剩余时间安排'}</span></div><p>${action.description}</p><div class="action-cost">${costs(action)}</div><div class="action-gain">${gains(action)}</div><button type="button" data-action="${id}" ${!check.ok || actionLocked ? 'disabled' : ''}>执行${action.title}</button>${!check.ok ? `<div class="action-reason">${check.reason}</div>` : ''}</article>`;
  }).join('') : '<div class="unavailable-card"><h3>地点尚未开放</h3><p>当前可行动地点：思源楼、南门、宿舍、操场和银杏大道。</p></div>';
  if (activePlace === 'gate') $('#actionList').insertAdjacentHTML('beforeend', '<article class="action-card opportunity-card"><h3>实习机会</h3><p>实习申请与经历系统将在后续版本开放，当前暂不设置岗位条件。</p><button type="button" id="internshipButton">查看实习接入说明 · 免费</button></article>');
}

function openPlace(key, hotspot) {
  if (state.pendingEvent) { showEvent(); return; }
  if (!places[key] || state.phase !== 'playing') return;
  activePlace = key;
  lastHotspot = hotspot;
  $('#placeTitle').textContent = places[key].title;
  $('#placeKicker').textContent = `主校区 · ${places[key].kicker}`;
  $('#placeDescription').textContent = places[key].description;
  $('#actionFeedback').textContent = '查看地点不消耗资源。行动收益固定，达到上限时按实际增加量计算。';
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
  lastHotspot?.focus();
}

function changeText(changes) {
  const names = { time: '时间', energy: '精力', money: '钱包', preparation: '课程准备', social: '社交', fitness: '体能', mood: '心情' };
  return Object.entries(changes).filter(([, value]) => value !== 0).map(([key, value]) => `${names[key]} ${value > 0 ? '+' : '−'}${Math.abs(value)}${key === 'money' ? ' 元' : ''}`).join(' · ') || '状态保持不变';
}

function performAction(id) {
  if (actionLocked || dialog.open || game.ACTIONS[id]?.place !== activePlace) return;
  const result = game.executeAction(state, id);
  if (!result.ok) { showToast(result.reason); return; }
  state = result.state;
  lockActionInput(id);
  renderState();
  $('#actionFeedback').textContent = `${result.entry.title}完成：${changeText(result.changes)}。${state.time === 0 ? '本学期时间已用完，返回地图即可结束学期。' : ''}`;
  if (state.pendingEvent) showEvent();
}

function lockActionInput(focusAction) {
  actionLocked = true;
  clearTimeout(actionLockTimer);
  const performedPlace = activePlace;
  actionLockTimer = setTimeout(() => {
    actionLocked = false;
    if (!activePlace) return;
    $('#actionList').querySelectorAll('button[data-action]').forEach((button) => {
      button.disabled = !game.availability(state, button.dataset.action).ok;
    });
    if (focusAction && activePlace === performedPlace && document.activeElement === document.body && !dialog.open) {
      const button = $(`button[data-action="${focusAction}"]`);
      if (button && !button.disabled) button.focus();
    }
  }, 650);
}

function showDialog(mode, title, body, buttons) {
  dialogMode = mode;
  dialog.classList.toggle('event-dialog', mode === 'event');
  $('.dialog-kicker').textContent = mode === 'event' ? '北交人生 · 校园事件' : '北交人生 · 学期回顾';
  $('#dialogTitle').textContent = title;
  $('#dialogBody').innerHTML = body;
  $('#dialogButtons').innerHTML = buttons.map(({ id, text, secondary }) => `<button type="button" data-dialog-action="${id}" class="${secondary ? 'secondary' : ''}">${text}</button>`).join('');
  if (!dialog.open) dialog.showModal();
  const focusTarget = $('#dialogButtons button') || $('#dialogBody button:not(:disabled)');
  focusTarget?.focus();
}

function updateDialogChoices() {
  dialog.querySelectorAll('button').forEach((button) => {
    button.disabled = dialogLocked || (button.dataset.eventChoice ? !game.eventAvailability(state, button.dataset.eventChoice).ok : false);
  });
}

function showEvent() {
  if (!state.pendingEvent) return;
  const event = game.EVENTS[state.pendingEvent.id];
  const choices = event.choices.map((choice) => {
    const check = game.eventAvailability(state, choice.id);
    return `<article class="event-choice"><h3>${choice.title}</h3><p>${choice.description}</p><div class="action-cost">${costs(choice)}</div><div class="action-gain">${gains(choice)}${choice.experience ? ' · 体测达标经历 +1' : ''}</div><button type="button" data-event-choice="${choice.id}" ${!check.ok || dialogLocked ? 'disabled' : ''}>选择：${choice.title}</button>${check.ok ? '' : `<div class="action-reason">${check.reason}</div>`}</article>`;
  }).join('');
  showDialog('event', event.title, `<p>${event.description}</p><p class="dialog-note">${event.trigger}。先完成选择，再继续行动或结束学期。</p><div class="event-choice-list">${choices}</div>`, []);
}

function lockDialogTransition() {
  dialogLocked = true;
  updateDialogChoices();
  setTimeout(() => {
    dialogLocked = false;
    updateDialogChoices();
    if (dialog.open) (dialog.querySelector('button:not(:disabled)'))?.focus();
  }, 650);
}

function summaryMarkup(summary) {
  return `<div class="summary-score"><b>${summary.grade}</b><span>分 · ${summary.passed ? '课程达标' : '课程未达标'}</span></div><p>课程准备 ${summary.preparation} / 100。课程表现 = 40 + 课程准备 × 0.6，四舍五入；60 分及以上达标。</p><div class="summary-lines"><span>生活支出 <b>−${summary.livingCost} 元</b></span><span>困难援助 <b>+${summary.aid} 元</b></span><span>结算后资金 <b>${summary.moneyAfter} 元</b></span><span>未使用时间 <b>${summary.unusedTime} 点，不结转</b></span></div>${summary.aid ? '<p>资金不足的部分由困难援助补足，仍可继续下一学期。</p>' : ''}`;
}

function requestEndTerm() {
  if (state.pendingEvent) { showEvent(); return; }
  if (state.phase === 'summary') { showSummary(); return; }
  if (state.phase === 'graduated') { showGraduation(); return; }
  const preview = game.previewSettlement(state);
  showDialog('confirm', `结束${preview.name}？`, `${summaryMarkup(preview)}<p class="dialog-note">以上为结算预览。确认后本学期不能继续行动。${preview.unusedTime ? `你还有 ${preview.unusedTime} 点时间，可以返回地图继续安排。` : ''}</p>`, [{ id: 'cancel', text: '继续本学期', secondary: true }, { id: 'settle', text: '确认结算' }]);
}

function showSummary() {
  const final = state.term === game.RULES.terms;
  showDialog('summary', `${state.summary.name} · 学期总结`, `${summaryMarkup(state.summary)}<p>社交 ${state.social} · 体能 ${state.fitness} · 心情 ${state.mood}。本学期完成 ${state.experiences.filter((item) => item.term === state.term).length} 次体测体验。</p><p>${final ? '八个学期的课程记录已经完成，接下来查看基础原型的完成结果。' : `下一学期恢复 ${game.RULES.time} 点时间、${game.RULES.energy} 点精力，课程准备和行动次数归零；钱包、社交、体能、心情及成长记录保留。`}</p>`, [{ id: 'next', text: final ? '查看完成结果' : `进入${game.TERM_NAMES[state.term]}` }]);
}

function courseTable() {
  if (!state.courses.length) return '<p>尚无已结算学期。学习积累课程准备，结束学期后会在这里留下课程表现。</p>';
  return `<table class="course-table"><thead><tr><th>学期</th><th>课程准备</th><th>课程表现</th><th>结果</th></tr></thead><tbody>${state.courses.map((course) => `<tr><td>${course.name}</td><td>${course.preparation}</td><td>${course.grade} 分</td><td>${course.passed ? '达标' : '未达标'}</td></tr>`).join('')}</tbody></table>`;
}

function showGraduation() {
  const average = (state.courses.reduce((sum, course) => sum + course.grade, 0) / state.courses.length).toFixed(1);
  const passed = state.courses.filter((course) => course.passed).length;
  showDialog('graduated', '四年校园生活 · 已完成', `<p>你已完成八个学期。课程平均表现 <b>${average} 分</b>，达标 <b>${passed} / 8</b> 学期，社交 <b>${state.social}</b>，体能 <b>${state.fitness}</b>，心情 <b>${state.mood}</b>，钱包 <b>${state.money} 元</b>，完成 <b>${state.experiences.length}</b> 次体测体验。</p>${courseTable()}<p class="dialog-note">基础原型已完成，实习与正式毕业方向将在后续开放。</p>`, [{ id: 'close', text: '返回地图', secondary: true }, { id: 'restart', text: '重新开始' }]);
}

function growthRecord() {
  const experiences = state.experiences.length ? `<ul>${state.experiences.map((item) => `<li>${game.TERM_NAMES[item.term - 1]}：体测体验达标，体能 ${item.fitness}</li>`).join('')}</ul>` : '<p>尚无体测经历。偶数学期锻炼后体能达到 60，可选择参加体测体验。</p>';
  return `${courseTable()}<h3>体测经历</h3>${experiences}<h3>当前成长</h3><p>社交 ${state.social} / 100 · 体能 ${state.fitness} / 100 · 心情 ${state.mood} / 100。</p>`;
}

$('#actionList').addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.action) performAction(button.dataset.action);
  if (button.id === 'internshipButton') showToast('实习申请与经历系统尚未开放，查看未消耗资源');
});
hotspots.forEach((hotspot) => hotspot.addEventListener('click', () => {
  if (state.phase !== 'playing') { requestEndTerm(); return; }
  openPlace(hotspot.dataset.place, hotspot);
}));
$('#backButton').addEventListener('click', closePlace);
$('#endTermButton').addEventListener('click', requestEndTerm);
$('#historyButton').addEventListener('click', () => {
  if (state.pendingEvent) { showEvent(); return; }
  showDialog('history', '成长记录', growthRecord(), [{ id: 'close', text: '返回地图' }]);
});
$('#dialogBody').addEventListener('click', (event) => {
  const choiceId = event.target.closest('button')?.dataset.eventChoice;
  if (!choiceId || dialogLocked || dialogMode !== 'event') return;
  const result = game.submitEventChoice(state, choiceId);
  if (!result.ok) { showToast(result.reason); return; }
  state = result.state;
  lockActionInput();
  renderState();
  const message = `${result.entry.title}：${changeText(result.changes)}。`;
  $('#actionFeedback').textContent = message;
  if (state.pendingEvent) { showEvent(); lockDialogTransition(); }
  else { dialog.close(); showToast(message); }
});
$('#dialogButtons').addEventListener('click', (event) => {
  if (dialogLocked) return;
  const id = event.target.closest('button')?.dataset.dialogAction;
  if (!id) return;
  if (id === 'cancel' || id === 'close') { dialog.close(); return; }
  if (id === 'settle' && dialogMode === 'confirm') {
    const result = game.endTerm(state);
    if (!result.ok) { showToast(result.reason); return; }
    state = result.state;
    renderState();
    showSummary();
    lockDialogTransition();
  } else if (id === 'next' && dialogMode === 'summary') {
    const result = game.continueGame(state);
    if (!result.ok) return;
    state = result.state;
    renderState();
    if (state.phase === 'graduated') { showGraduation(); lockDialogTransition(); }
    else if (state.pendingEvent) { showEvent(); lockDialogTransition(); }
    else { dialog.close(); showToast(`已进入${game.TERM_NAMES[state.term - 1]}`); }
  } else if (id === 'restart' && dialogMode === 'graduated') {
    showDialog('restart', '重新开始？', '<p>当前课程记录和行动进度将清空，重新进入大一上。</p>', [{ id: 'close', text: '保留进度', secondary: true }, { id: 'confirmRestart', text: '确认重新开始' }]);
  } else if (id === 'confirmRestart' && dialogMode === 'restart') {
    state = game.createGame();
    clearTimeout(actionLockTimer);
    actionLocked = false;
    clearTimeout(toastTimer);
    $('#toast').classList.remove('show');
    renderState();
    dialog.close();
  }
});
dialog.addEventListener('cancel', (event) => {
  if (dialogMode === 'summary' || state.pendingEvent) event.preventDefault();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && activePlace && !dialog.open) closePlace();
});
renderState();

