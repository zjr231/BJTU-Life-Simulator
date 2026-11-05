'use strict';

// Exercise the real app event handlers with a minimal DOM adapter.
// Browser layout and native dialog behaviour still require browser acceptance.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const game = require('./game.js');
const saves = require('./save.js');
const sms = require('./sms.js');

test('家庭预算在入学、开学选课、钱包与成长记录中展示；打开收支不重复拨款', () => {
  const ui = app();
  ui.start();
  let seed = 'budget-ui-0';
  for (let i = 0; game.familyForSeed(seed).id !== 'ordinary'; i++) seed = 'budget-ui-' + (i + 1);
  ui.evaluate('state = CampusGame.createGame({ seed: ' + JSON.stringify(seed) + ' }); renderState(); showEnrollment()');
  const enrollment = ui.element('#dialogBody').innerHTML;
  assert.match(enrollment, /普通家庭/);
  assert.match(enrollment, /你的家庭环境/);
  assert.match(enrollment, /你来自一个收入稳定的普通家庭/);
  assert.doesNotMatch(enrollment, /每月|个月/);
  ui.evaluate("showBackground()");
  assert.match(ui.element("#dialogBody").innerHTML, /你的家庭环境/);
  assert.match(enrollment, /\+6000 元/);
  assert.match(enrollment, /默认预留 <b>4800 元/);
  assert.match(enrollment, /普通 <b>1000 元/);
  assert.match(enrollment, /普通宿舍 <b>1000 元/);
  assert.match(enrollment, /基础通勤 <b>400 元/);
  assert.match(enrollment, /1200 元/);
  ui.evaluate('showCourseSelection()');
  assert.match(ui.element('#dialogBody').innerHTML, /默认预留/);
  ui.evaluate('dialog.close()');
  const before = JSON.stringify(ui.evaluate('state'));
  ui.click('#mapStats', { walletBudget: '1' });
  assert.equal(ui.evaluate('dialogMode'), 'wallet');
  assert.match(ui.element('#dialogBody').innerHTML, /历次学期拨款/);
  assert.match(ui.element('#dialogBody').innerHTML, /当前可用余额/);
  assert.equal(JSON.stringify(ui.evaluate('state')), before);
  ui.evaluate('showDialog("history", "成长记录", growthRecord())');
  assert.match(ui.element('#dialogBody').innerHTML, /家庭生活费到账/);
});

test('学期总结显示预留4800与期末零扣费，旧版总结仍展示300与补助', () => {
  const ui = app();
  ui.start();
  const modern = ui.evaluate('summaryMarkup(CampusGame.previewSettlement(state))');
  assert.match(modern, /预算合计 <b>4800 元/);
  assert.match(modern, /期末额外扣费 <b>0 元/);
  assert.doesNotMatch(modern, /−300 元/);
  const legacy = ui.evaluate('summaryMarkup(CampusGame.previewSettlement({ ...CampusGame.createGame({ legacyEconomy: true }), money: 100 }))');
  assert.match(legacy, /旧版生活费 <b>−300 元/);
  assert.match(legacy, /补助 <b>\+200 元/);
});

test('勤工档位在确认前明确固定100/200/300元报酬', () => {
  const ui = app();
  ui.start();
  ui.evaluate('dialog.close(); activePlace = "gate"; renderActions()');
  const html = ui.element('#actionList').innerHTML;
  for (const amount of [100, 200, 300]) assert.match(html, new RegExp('固定报酬 \\+' + amount + ' 元'));
});

test('校园卡赔偿余额不足时归还入口可用，界面明确说明待还金额', () => {
  const ui = app();
  ui.start();
  ui.evaluate('state = { ...state, money: 10, phase: "eventPending", pendingEvent: { id: "cardTrace", term: 1, instanceId: "daily:cardTrace:1" } }; renderState(); showEvent()');
  assert.match(ui.element('#dialogBody').innerHTML, /钱包 −10 元/);
  ui.click('#dialogBody', { eventChoice: 'return', revision: String(ui.evaluate('state.revision')), instance: 'daily:cardTrace:1' });
  assert.equal(ui.evaluate('state.money'), 0);
  assert.equal(ui.evaluate('state.cardDebt'), 40);
  assert.match(ui.element('#actionFeedback').textContent, /赔偿待还 40 元/);
});

test('学习先询问可选资料；确认前不扣费，购买后仅加2点且不会重复提交', () => {
  const ui = app();
  ui.start();
  ui.evaluate('openPlace("think")');
  const before = ui.evaluate('JSON.stringify(state)');
  const plain = game.executeAction(JSON.parse(before), 'study', { investment: 15 });
  ui.click('#actionList', { action: 'study', revision: String(ui.evaluate('state.revision')) });
  assert.equal(ui.evaluate('dialogMode'), 'actionExtra');
  assert.equal(ui.evaluate('JSON.stringify(state)'), before);
  assert.match(ui.element('#dialogBody').innerHTML, /80 元/);
  assert.match(ui.element('#dialogBody').innerHTML, /合计最多 \+4/);
  ui.click('#dialogButtons', { dialogAction: 'extraBuy' });
  assert.equal(ui.evaluate('dialogMode'), 'eventResult');
  assert.equal(ui.evaluate('state.money'), plain.state.money - 80);
  assert.equal(ui.evaluate('state.preparation'), plain.state.preparation + 2);
  assert.equal(ui.evaluate('state.time'), plain.state.time);
  assert.match(ui.element('#dialogBody').innerHTML, /额外消费：配套学习资料/);
  const after = ui.evaluate('JSON.stringify(state)');
  ui.flush();
  ui.click('#dialogButtons', { dialogAction: 'extraBuy' });
  assert.equal(ui.evaluate('JSON.stringify(state)'), after);
  ui.click('#dialogSave'); ui.click('#dialogBody', { saveSlot: '2' });
  ui.click('#loadButton'); ui.click('#dialogBody', { loadSlot: '2', saveSource: 'primary' });
  assert.equal(ui.evaluate('JSON.stringify(state)'), after);
  assert.match(ui.element('#dialogBody').innerHTML, /额外消费：配套学习资料/);
  assert.match(ui.evaluate('investmentRecord()'), /配套学习资料 −80 元/);
});

test('取消可选消费不执行行动，跳过按原规则执行；余额不足不额外弹窗', () => {
  const ui = app();
  ui.start();
  ui.evaluate('openPlace("library")');
  const before = ui.evaluate('JSON.stringify(state)');
  ui.click('#actionList', { action: 'selfStudy', revision: String(ui.evaluate('state.revision')) });
  assert.equal(ui.evaluate('dialogMode'), 'actionExtra');
  ui.click('#dialogButtons', { dialogAction: 'extraCancel' });
  assert.equal(ui.evaluate('JSON.stringify(state)'), before);
  assert.equal(ui.element('#termDialog').open, false);
  ui.click('#actionList', { action: 'selfStudy', revision: String(ui.evaluate('state.revision')) });
  ui.click('#dialogButtons', { dialogAction: 'extraSkip' });
  assert.equal(ui.evaluate('state.history.at(-1).extra'), undefined);
  assert.equal(ui.evaluate('state.money'), JSON.parse(before).money);
  ui.flush();
  ui.evaluate('dialog.close(); state.money = 0; openPlace("think")');
  const revision = ui.evaluate('state.revision');
  ui.click('#actionList', { action: 'study', revision: String(revision) });
  assert.equal(ui.evaluate('dialogMode'), 'eventResult');
  assert.equal(ui.evaluate('state.money'), 0);
  assert.equal(ui.evaluate('state.revision'), revision + 1);
});

test('仅三项行动有可选消费，付费确认使用原版本号，过期时不扣费', () => {
  const ui = app();
  ui.start();
  ui.evaluate('openPlace("think")');
  assert.equal(ui.evaluate('offerActionExtra("tutoring", state.revision, 100)'), false);
  ui.click('#actionList', { action: 'study', revision: String(ui.evaluate('state.revision')) });
  ui.evaluate('state = CampusGame.chatWithNpc(state, { identityId: "student", quality: 1 }).state');
  const before = ui.evaluate('JSON.stringify(state)');
  ui.click('#dialogButtons', { dialogAction: 'extraBuy' });
  assert.equal(ui.evaluate('JSON.stringify(state)'), before);
  assert.match(ui.element('#toast').textContent, /更新/);
});

function memory() {
  const data = new Map();
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}
function growthUi() {
  const ui = app();
  ui.start();
  let seed = 'growth-ui-0';
  for (let i = 1; game.familyForSeed(seed).id !== 'ordinary'; i++) seed = 'growth-ui-' + i;
  ui.evaluate('state = CampusGame.createGame({seed: ' + JSON.stringify(seed) + '}); state = CampusGame.chooseBudget(state, CampusGame.DEFAULT_BUDGET).state; state = CampusGame.selectCourses(state, CampusGame.coursesForTerm(state.term, state.background.id, state.background.major).slice(0, 3).map(course => course.id)).state; uiLocked = false; dialog.close(); renderState()');
  return ui;
}

test('养成侧栏展示价格、解锁进度与余额，购买后刷新并可在三栏位恢复', () => {
  const ui = growthUi();
  ui.element('#growthToggle').emit('click', { stopPropagation() {} });
  assert.equal(ui.evaluate('openPanelName'), 'growth');
  assert.match(ui.element('#growthOverview').innerHTML, /1200/);
  assert.match(ui.element('#growthNodes').innerHTML, /舒适寝具/);
  // 二期：顶部维度标签切换，默认显示住宿，只有选中维度的卡片出现在下方。
  const tabHtml = ui.element('#growthTabs').innerHTML;
  for (const label of ['衣', '食', '住', '行', '学习', '兴趣', '习惯']) assert.match(tabHtml, new RegExp('>' + label + '<'));
  assert.equal((tabHtml.match(/data-growth-dimension=/g) || []).length, 7);
  assert.equal(ui.evaluate('selectedGrowthDimension'), 'housing');
  assert.match(ui.element('#growthNodes').innerHTML, /住 · 生活与空间/);
  assert.match(ui.element('#growthNodes').innerHTML, /舒适寝具/);
  assert.doesNotMatch(ui.element('#growthNodes').innerHTML, /正装套装|水果篮|自行车/);
  ui.click('#growthTabs', { growthDimension: 'clothing' });
  assert.equal(ui.evaluate('selectedGrowthDimension'), 'clothing');
  assert.match(ui.element('#growthNodes').innerHTML, /衣 · 衣着与形象/);
  assert.match(ui.element('#growthNodes').innerHTML, /正装套装/);
  assert.match(ui.element('#growthNodes').innerHTML, /轻便运动鞋/);
  assert.doesNotMatch(ui.element('#growthNodes').innerHTML, /舒适寝具/);
  ui.click('#growthNodes', { growthSelect: 'formalSuit' });
  assert.match(ui.element('#growthDetails').innerHTML, /第 5 学期开始开放/);
  const selectionState = ui.evaluate('JSON.stringify(state)');
  ui.click('#growthTabs', { growthDimension: 'habit' });
  assert.match(ui.element('#growthNodes').innerHTML, /习惯 · 习惯养成/);
  assert.match(ui.element('#growthNodes').innerHTML, /累计休息/);
  ui.click('#growthNodes', { growthSelect: 'routine' });
  assert.equal(ui.evaluate('selectedGrowthId'), 'routine');
  assert.match(ui.element('#growthDetails').innerHTML, /累计休息 0 \/ 3 次/);
  assert.match(ui.element('#growthPurchase').innerHTML, /disabled/);
  assert.equal(ui.evaluate('JSON.stringify(state)'), selectionState);
  ui.click('#growthNodes', { growthSelect: '__proto__' });
  assert.equal(ui.evaluate('selectedGrowthId'), 'routine');
  ui.click('#growthTabs', { growthDimension: 'housing' });
  ui.click('#growthNodes', { growthSelect: 'bedding' });
  assert.match(ui.element('#growthDetails').innerHTML, /每次休息额外恢复 3 点精力/);
  const before = ui.evaluate('state.revision');
  ui.click('#growthPurchase', { growthBuy: 'bedding', revision: String(before) });
  assert.equal(ui.evaluate('state.money'), 900);
  assert.equal(ui.element('#growthCount').textContent, '1 / 14');
  assert.match(ui.element('#growthNodes').innerHTML, /已拥有 ✓/);
  assert.match(ui.element('#growthNotice').textContent, /支出 300 元/);
  assert.match(ui.evaluate('growthRecord()'), /添置舒适寝具/);
  const purchased = ui.evaluate('JSON.stringify(state)');
  ui.click('#growthPurchase', { growthBuy: 'hobbyCorner', revision: String(before) });
  assert.equal(ui.evaluate('JSON.stringify(state)'), purchased);
  ui.flush();
  ui.click('#growthPurchase', { growthBuy: 'bedding', revision: String(ui.evaluate('state.revision')) });
  assert.equal(ui.evaluate('JSON.stringify(state)'), purchased);
  ui.click('#saveButton');
  ui.click('#dialogBody', { saveSlot: '3' });
  ui.click('#loadButton');
  ui.click('#dialogBody', { loadSlot: '3', saveSource: 'primary' });
  assert.equal(ui.evaluate('JSON.stringify(state)'), purchased);
  assert.equal(ui.element('#growthCount').textContent, '1 / 14');
  ui.click('#growthClose');
  ui.element('#growthToggle').emit('click', { stopPropagation() {} });
  assert.equal(ui.evaluate('openPanelName'), 'growth');
  assert.equal(ui.element('#growthNotice').textContent, '');
  ui.click('#growthClose');
  assert.equal(ui.evaluate('openPanelName'), null);
});

test('养成侧栏余额不足不能扣款，弹窗期间忽略购买，休息结果显示额外恢复', () => {
  const ui = growthUi();
  ui.evaluate('state.money = 100; renderState()');
  assert.match(ui.element('#growthDetails').innerHTML, /余额不足，还差 200 元/);
  const before = ui.evaluate('JSON.stringify(state)');
  ui.click('#growthPurchase', { growthBuy: 'bedding', revision: String(ui.evaluate('state.revision')) });
  assert.equal(ui.evaluate('JSON.stringify(state)'), before);
  ui.evaluate('state.money = 1200; dialog.showModal()');
  ui.click('#growthPurchase', { growthBuy: 'bedding', revision: String(ui.evaluate('state.revision')) });
  assert.equal(ui.evaluate('state.growth'), undefined);
  ui.evaluate('dialog.close(); state.energy = 20; state.mood = 40');
  ui.click('#growthPurchase', { growthBuy: 'bedding', revision: String(ui.evaluate('state.revision')) });
  ui.flush();
  ui.evaluate('openPlace("dorm")');
  ui.click('#actionList', { action: 'rest', revision: String(ui.evaluate('state.revision')) });
  assert.equal(ui.evaluate('dialogMode'), 'eventResult');
  assert.match(ui.element('#dialogBody').innerHTML, /校园养成额外恢复：精力 \+3/);
});

function app(storage = memory(), withSms = false, withNpc = false) {
  const elements = new Map();
  function element(selector) {
    if (!elements.has(selector)) {
      const listeners = new Map();
      const classes = new Set();
      elements.set(selector, {
        innerHTML: '', textContent: '', value: '', open: false, hidden: false, style: {},
        classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name),
          toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); } },
        addEventListener: (type, callback) => listeners.set(type, callback),
        emit(type, event = {}) { listeners.get(type)?.(event); },
        focus() { this.focused = true; }, scrollIntoView() { this.scrolled = true; }, setAttribute() {}, querySelector: () => null, querySelectorAll: () => [],
        showModal() { this.open = true; }, close() { this.open = false; }
      });
    }
    return elements.get(selector);
  }
  const timers = new Map();
  let sequence = 0;
  const window = element('window');
  window.localStorage = storage;
  window.crypto = { getRandomValues(values) { values[0] = 1; return values; } };
  const globals = { CampusGame: game, CampusSave: saves, window,
    HTMLDialogElement: class { showModal() {} },
    document: { querySelector: element, querySelectorAll: () => [], body: { style: {} }, addEventListener() {} },
    location: { search: '' }, URLSearchParams, Uint32Array,
    setTimeout(callback) { timers.set(++sequence, callback); return sequence; },
    clearTimeout(id) { timers.delete(id); } };
  if (withSms) globals.CampusSms = sms;
  if (withNpc) globals.CampusNpc = require('./npc.js');
  const context = vm.createContext(globals);
  vm.runInContext(fs.readFileSync(require.resolve('./app.js'), 'utf8'), context);
  const evaluate = expression => vm.runInContext(expression, context);
  function click(selector, dataset = {}) {
    element(selector).emit('click', { target: { closest: () => ({ dataset }) }, stopPropagation() {} });
  }
  return { storage, element, evaluate, click, window,
    start(selectCourses = true) {
      element('#nicknameInput').value = '界面测试';
      evaluate('startGame()');
      assert.equal(evaluate('dialogMode'), 'enrollment');
      click('#dialogButtons', { dialogAction: 'resume' });
      assert.equal(evaluate('dialogMode'), 'tutorial');
      click('#dialogButtons', { dialogAction: 'resume' });
      if (selectCourses && ['courseSelection', 'budget'].includes(evaluate('dialogMode'))) {
        const ids = evaluate('CampusGame.coursesForTerm(state.term, state.background.id, state.background.major).slice(0, 3).map((course) => course.id)');
        evaluate('state = CampusGame.selectCourses(state, ' + JSON.stringify(ids) + ', { expectedRevision: state.revision }).state; renderState(); resumePhase()');
        assert.equal(evaluate('state.selectedCourses.length'), 3);
        assert.equal(evaluate('state.phase'), 'playing');
      }
    },
    flush() { const jobs = [...timers.values()]; timers.clear(); jobs.forEach(callback => callback()); } };
}

test('数学题干规范渲染矩阵、积分上下限和上标，并保持转义', () => {
  const ui = app();
  const matrix = ui.evaluate('mathText(' + JSON.stringify('矩阵 [[1,2],[3,4]] 的行列式是？') + ')');
  assert.match(matrix, /class="math-matrix"/);
  assert.match(matrix, /<span>1<\/span><span>2<\/span><span>3<\/span><span>4<\/span>/);
  const integral = ui.evaluate('mathText(' + JSON.stringify('定积分 ∫[0,5] 4x dx 的值是？') + ')');
  assert.match(integral, /∫<span class="math-limits"><sup>5<\/sup><sub>0<\/sub><\/span>/);
  const power = ui.evaluate('mathText(' + JSON.stringify('函数 f(x)=x^2 的导数是？') + ')');
  assert.match(power, /x<sup>2<\/sup>/);
  assert.equal(ui.evaluate('mathText(' + JSON.stringify('<script>') + ')'), '&lt;script&gt;');
});

test('暂不登录偏好刷新后保留，可返回登录，登录和切换账号清除跳过偏好', async () => {
  const storage = memory();
  const first = app(storage, true);
  assert.equal(first.evaluate('dialogMode'), 'login');
  first.click('#dialogButtons', { dialogAction: 'loginSkip' });
  assert.equal(first.evaluate('dialogMode'), 'admission');
  assert.equal(storage.getItem('bjtu-life:login:skipped'), '1');

  const reloaded = app(storage, true);
  assert.equal(reloaded.evaluate('loginSkipped'), true);
  assert.equal(reloaded.evaluate('dialogMode'), 'admission');
  assert.match(reloaded.element('#dialogButtons').innerHTML, /data-dialog-action="loginPrompt"/);
  reloaded.click('#dialogButtons', { dialogAction: 'loginPrompt' });
  assert.equal(reloaded.evaluate('dialogMode'), 'login');
  assert.equal(storage.getItem('bjtu-life:login:skipped'), null);
  assert.equal(app(storage, true).evaluate('dialogMode'), 'login');

  reloaded.click('#dialogButtons', { dialogAction: 'loginSkip' });
  const sent = await sms.send('13800138000');
  assert.equal(sent.ok, true);
  reloaded.element('#phoneInput').value = '13800138000';
  reloaded.element('#codeInput').value = sent.demoCode;
  await reloaded.evaluate('doLogin()');
  assert.equal(reloaded.evaluate('dialogMode'), 'admission');
  assert.equal(reloaded.evaluate('loginSkipped'), false);
  assert.equal(storage.getItem('bjtu-life:login:skipped'), null);

  const account = app(storage, true);
  storage.setItem('bjtu-life:login:skipped', '1');
  account.click('#dialogButtons', { dialogAction: 'switchAccount' });
  assert.equal(account.evaluate('dialogMode'), 'login');
  assert.equal(storage.getItem('bjtu-life:login:skipped'), null);
  assert.equal(storage.getItem('bjtu-life:login'), null);
  assert.equal(app(storage, true).evaluate('dialogMode'), 'login');
});

test('保存按钮打开三个栏位，选择空栏位后保存并标记为当前栏位', () => {
  const ui = app();
  ui.start();
  ui.click('#saveButton');
  assert.equal(ui.evaluate('dialogMode'), 'save');
  assert.equal((ui.element('#dialogBody').innerHTML.match(/data-save-slot=/g) || []).length, 3);
  ui.click('#dialogBody', { saveSlot: '2' });
  assert.equal(ui.evaluate('activeSaveSlot'), 2);
  assert.equal(ui.element('#termDialog').open, false);
  assert.equal(saves.createSlotService(ui.storage).load(2).state.nickname, '界面测试');
  assert.equal(ui.storage.getItem(saves.getSlotKeys(1).primary), null);
  assert.equal(ui.storage.getItem(saves.getSlotKeys(3).primary), null);
});

test('覆盖已有栏位先确认，可返回重选，确认后保留该栏原主档备份', () => {
  const storage = memory();
  saves.createSlotService(storage).save(game.createGame({ nickname: '原玩家' }), 3);
  const original = storage.getItem(saves.getSlotKeys(3).primary);
  const ui = app(storage);
  ui.start(); ui.click('#saveButton');
  ui.click('#dialogBody', { saveSlot: '3' });
  assert.equal(ui.evaluate('dialogMode'), 'confirmSave');
  assert.equal(storage.getItem(saves.getSlotKeys(3).primary), original);
  ui.click('#dialogButtons', { dialogAction: 'backToSave' });
  assert.equal(ui.evaluate('dialogMode'), 'save');
  assert.equal(storage.getItem(saves.getSlotKeys(3).primary), original);
  ui.click('#dialogBody', { saveSlot: '3' });
  ui.click('#dialogButtons', { dialogAction: 'confirmSave' });
  assert.equal(ui.evaluate('activeSaveSlot'), 3);
  assert.equal(saves.createSlotService(storage).load(3).state.nickname, '界面测试');
  assert.equal(storage.getItem(saves.getSlotKeys(3).backup), original);
});

test('切换栏位保存失败时，继续保留原当前栏位及内存进度', () => {
  const ui = app();
  ui.start(); ui.click('#saveButton'); ui.click('#dialogBody', { saveSlot: '1' });
  const before = ui.evaluate('JSON.stringify(state)');
  const write = ui.storage.setItem;
  ui.storage.setItem = (key, value) => { if (key === saves.getSlotKeys(2).temporary) throw new Error('quota'); write(key, value); };
  ui.click('#saveButton'); ui.click('#dialogBody', { saveSlot: '2' });
  assert.equal(ui.evaluate('activeSaveSlot'), 1);
  assert.equal(ui.evaluate('JSON.stringify(state)'), before);
  assert.equal(ui.evaluate('dialogMode'), 'save');
  assert.match(ui.element('#dialogNotice').textContent, /失败/);
});

test('离开页面时仅对未保存进度发出提醒', () => {
  const ui = app();
  let prevented = false;
  const leave = { preventDefault() { prevented = true; }, returnValue: undefined };
  ui.window.emit('beforeunload', leave);
  assert.equal(prevented, false);
  assert.equal(leave.returnValue, undefined);

  ui.start();
  prevented = false;
  leave.returnValue = undefined;
  ui.window.emit('beforeunload', leave);
  assert.equal(prevented, true);
  assert.equal(leave.returnValue, '');

  ui.click('#saveButton');
  ui.click('#dialogBody', { saveSlot: '1' });
  prevented = false;
  leave.returnValue = undefined;
  ui.window.emit('beforeunload', leave);
  assert.equal(prevented, false);
  assert.equal(leave.returnValue, undefined);

  ui.evaluate('state = CampusGame.executeAction(state, "study", { commandId: "unsaved-leave", expectedRevision: state.revision }).state; renderState()');
  prevented = false;
  leave.returnValue = undefined;
  ui.window.emit('beforeunload', leave);
  assert.equal(prevented, true);
  assert.equal(leave.returnValue, '');
});

test('新局未选栏位时结算保留内存，首次选栏后后续结算只自动保存到该栏', () => {
  const ui = app();
  ui.start(false);
  ui.click('#endTermButton');
  ui.click('#dialogButtons', { dialogAction: 'settle', revision: '0' });
  assert.equal(ui.evaluate('state.phase'), 'summary');
  assert.equal(ui.storage.data.size, 0);
  assert.match(ui.element('#dialogBody').innerHTML, /尚未选择存档栏位/);
  ui.flush();
  ui.click('#dialogSave'); ui.click('#dialogBody', { saveSlot: '3' });
  assert.equal(ui.evaluate('dialogMode'), 'summary');
  ui.click('#dialogButtons', { dialogAction: 'next', revision: String(ui.evaluate('state.revision')) });
  ui.flush();
  while (ui.evaluate('state.phase') === 'eventPending') {
    const revision = ui.evaluate('state.revision');
    ui.click('#dialogBody', { eventChoice: 'later', revision: String(revision), instance: ui.evaluate('state.pendingEvent.instanceId') });
    assert.ok(ui.evaluate('state.revision') > revision);
    ui.flush();
  }
  ui.click('#endTermButton');
  ui.click('#dialogButtons', { dialogAction: 'settle', revision: String(ui.evaluate('state.revision')) });
  const loaded = saves.createSlotService(ui.storage).load(3);
  assert.equal(loaded.state.term, 2);
  assert.equal(loaded.state.phase, 'summary');
  assert.equal(loaded.saveSequence, 2);
  assert.equal(ui.storage.getItem(saves.getSlotKeys(1).primary), null);
  assert.equal(ui.storage.getItem(saves.getSlotKeys(2).primary), null);
});

function phaseStates() {
  const playing = game.createGame({ nickname: '阶段恢复', seed: 'ui-phase' });
  const pending = game.executeAction(playing, 'applyClub').state;
  const summary = game.endTerm(playing).state;
  let ending = playing;
  for (let i = 0; i < 8; i++) {
    while (ending.pendingEvent) {
      const resolved = game.submitEventChoice(ending, 'later');
      assert.equal(resolved.ok, true, resolved.reason);
      ending = resolved.state;
    }
    const settled = game.endTerm(ending);
    assert.equal(settled.ok, true, settled.reason);
    const continued = game.continueGame(settled.state);
    assert.equal(continued.ok, true, continued.reason);
    ending = continued.state;
  }
  const states = [playing, pending, summary, ending, game.chooseEnding(ending, 'notQualified').state];
  assert.deepEqual(states.map(state => state.phase), ['playing', 'eventPending', 'summary', 'endingChoice', 'finished']);
  return states;
}
for (const state of phaseStates()) {
  test('从栏位 2 恢复 ' + state.phase + ' 并另存到栏位 3，重新加载后仍可恢复', () => {
    const storage = memory();
    assert.equal(saves.createSlotService(storage).save(state, 2).ok, true);
    for (let i = 0; i < 2; i++) {
      const ui = app(storage);
      ui.click('#dialogBody', { loadSlot: '2', saveSource: 'primary' });
      assert.equal(ui.evaluate('activeSaveSlot'), 2);
      assert.deepEqual(JSON.parse(ui.evaluate('JSON.stringify(state)')), state);
      const mode = { playing: 'budget', eventPending: 'event', summary: 'summary', endingChoice: 'endingChoice', finished: 'finished' }[state.phase];
      if (mode) assert.equal(ui.evaluate('dialogMode'), mode);
      else assert.equal(ui.element('#termDialog').open, false);
      ui.click('#saveButton');
      ui.click('#dialogBody', { saveSlot: '3' });
      if (i === 1) ui.click('#dialogButtons', { dialogAction: 'confirmSave' });
      assert.equal(ui.evaluate('activeSaveSlot'), 3);
      assert.deepEqual(saves.createSlotService(storage).load(3).state, state);
      if (mode) assert.equal(ui.evaluate('dialogMode'), mode);
      else assert.equal(ui.element('#termDialog').open, false);
    }
  });
}

test('事件中选择保存或取消选择，保留待选实例、随机位置和队列', () => {
  const storage = memory();
  const pending = phaseStates()[1];
  saves.createSlotService(storage).save(pending, 2);
  const ui = app(storage);
  ui.click('#dialogBody', { loadSlot: '2', saveSource: 'primary' });
  const before = ui.evaluate('JSON.stringify(state)');
  ui.click('#dialogSave');
  ui.click('#dialogButtons', { dialogAction: 'resume' });
  assert.equal(ui.evaluate('dialogMode'), 'event');
  ui.click('#dialogSave'); ui.click('#dialogBody', { saveSlot: '3' });
  assert.equal(ui.evaluate('dialogMode'), 'event');
  assert.equal(ui.evaluate('JSON.stringify(state)'), before);
  assert.deepEqual(saves.createSlotService(storage).load(3).state, pending);
});

test('读取备份使用所选栏位；重新开始后清除自动保存目标', () => {
  const storage = memory();
  const service = saves.createSlotService(storage);
  const original = game.createGame({ nickname: '备份玩家' });
  service.save(original, 3);
  service.save(game.executeAction(original, 'study').state, 3);
  storage.data.set(saves.getSlotKeys(3).primary, '{broken');
  const ui = app(storage);
  assert.match(ui.element('#dialogBody').innerHTML, /data-save-source="backup"/);
  ui.click('#dialogBody', { loadSlot: '3', saveSource: 'backup' });
  assert.equal(ui.evaluate('activeSaveSlot'), 3);
  assert.equal(ui.evaluate('state.preparation'), 0);
  ui.click('#restartButton');
  ui.click('#dialogButtons', { dialogAction: 'confirmRestart' });
  ui.start();
  assert.equal(ui.evaluate('activeSaveSlot'), null);
  const before = new Map(storage.data);
  ui.evaluate('saveCurrent(true)');
  assert.deepEqual(storage.data, before);
});

test('其他栏位的 storage 变化不提示当前栏位冲突，当前栏位和清空存储会提示', () => {
  const ui = app();
  ui.start(); ui.click('#saveButton'); ui.click('#dialogBody', { saveSlot: '2' });
  const note = ui.element('#sessionNote').textContent;
  ui.window.emit('storage', { key: saves.getSlotKeys(3).primary });
  assert.equal(ui.element('#sessionNote').textContent, note);
  ui.window.emit('storage', { key: saves.getSlotKeys(2).primary });
  assert.match(ui.element('#sessionNote').textContent, /另一个标签页更新了栏位 2/);
  ui.window.emit('storage', { key: null });
  assert.match(ui.element('#sessionNote').textContent, /另一个标签页/);
});

test('旧档显示为栏位 1，昵称转义，存储不可用时仍可开始游戏', () => {
  const storage = memory();
  // 旧版昵称规则宽松，旧档可能带 HTML 特殊字符；新规则只约束创建，加载时保持宽松并转义显示。
  saves.createSaveService(storage).save({ ...game.createGame({ nickname: '旧档玩家' }), nickname: '<x>' });
  const ui = app(storage);
  const html = ui.element('#dialogBody').innerHTML;
  assert.match(html, /&lt;x&gt;/);
  assert.doesNotMatch(html, /<x>/);
  ui.click('#dialogBody', { loadSlot: '1', saveSource: 'primary' });
  assert.equal(ui.evaluate('state.nickname'), '<x>');
  const denied = app(null);
  denied.start(); denied.click('#saveButton');
  assert.equal((denied.element('#dialogBody').innerHTML.match(/disabled/g) || []).length, 3);
  assert.equal(denied.evaluate('state.phase'), 'playing');
});

test('进入场所时地图离场、入场动画标记按定时清理，返回时恢复', () => {
  const ui = app(memory());
  ui.start();
  ui.evaluate('openPlace("think")');
  const mapScreen = ui.element('#mapScreen');
  const placeScreen = ui.element('#placeScreen');
  assert.equal(mapScreen.classList.contains('is-leaving'), true);
  assert.equal(placeScreen.classList.contains('is-open'), true);
  assert.equal(placeScreen.classList.contains('is-entering'), true);
  // 入场动画播完后清除标记，之后执行行动重绘列表不会重播整屏动画。
  ui.flush();
  assert.equal(placeScreen.classList.contains('is-entering'), false);
  ui.evaluate('closePlace()');
  assert.equal(mapScreen.classList.contains('is-leaving'), false);
  assert.equal(placeScreen.classList.contains('is-open'), false);
  assert.equal(placeScreen.classList.contains('is-entering'), false);
  // 未到定时结束就返回时，入场标记立即清理，重新进入会重播动画。
  ui.evaluate('openPlace("dorm")');
  assert.equal(placeScreen.classList.contains('is-entering'), true);
  ui.evaluate('closePlace()');
  assert.equal(placeScreen.classList.contains('is-entering'), false);
  ui.evaluate('openPlace("dorm")');
  assert.equal(placeScreen.classList.contains('is-entering'), true);
});

test('地图上的偶遇 NPC 渲染，点击直接打开聊天窗口，退出聊天关闭，离场保留淡出', () => {
  const ui = app(memory(), false, true);
  ui.start();
  // 换成立即生成、间隔为 0 的引擎，避免依赖真实时钟；场上限三人由引擎保证。
  ui.evaluate('npcSystem = CampusNpc.createSystem({ random: () => Math.random(), settings: { firstDelay: [0, 0], gap: [0, 0] } })');
  ui.flush(); ui.flush(); ui.flush();
  const html = ui.element('#npcLayer').innerHTML;
  assert.match(html, /npc-figure/);
  assert.match(html, /npc-svg/);
  assert.match(html, /npc-label/);
  assert.equal((html.match(/data-npc-id=/g) || []).length, 3);
  const id = ui.evaluate('npcSystem.active()[0].id');
  const label = ui.evaluate('npcSystem.active()[0].label');
  ui.element('#npcLayer').emit('click', { target: { closest: () => ({ dataset: { npcId: id } }) } });
  assert.equal(ui.evaluate('dialogMode'), 'npc');
  assert.equal(ui.element('#dialogTitle').textContent, label);
  // 点击即聊天窗口：气泡历史（含开场白）+ 输入框，没有"再聊一句"按钮。
  assert.match(ui.element('#dialogBody').innerHTML, /npc-chat-history/);
  assert.match(ui.element('#dialogBody').innerHTML, /npc-chat-form/);
  assert.match(ui.element('#dialogBody').innerHTML, /npc-bubble/);
  assert.doesNotMatch(ui.element('#dialogButtons').innerHTML, /npcTalk/);
  assert.match(ui.element('#dialogButtons').innerHTML, /data-dialog-action="npcLeave"/);
  ui.click('#dialogButtons', { dialogAction: 'npcLeave' });
  assert.equal(ui.element('#termDialog').open, false);
  // 引擎判定离场后，NPC 保留淡出标记并渲染出 is-fading（模拟 npcTick 对离场事件的记录）。
  const removed = ui.evaluate('(() => { const events = npcSystem.tick(Date.now() + 80000); for (const npc of events.removed) npcFades.set(npc.id, { npc, since: Date.now() }); return events.removed.length; })()');
  assert.ok(removed > 0);
  ui.flush();
  assert.match(ui.element('#npcLayer').innerHTML, /is-fading/);
});

test('NPC 离场时关闭当前聊天并清理会话记录', async () => {
  const ui = app(memory(), false, true);
  ui.start();
  ui.evaluate('Date.now = () => 0; npcSystem = CampusNpc.createSystem({ random: () => 0, settings: { firstDelay: [0, 0], gap: [600000, 600000], lifetime: [100, 100] } }); npcTick()');
  const id = ui.evaluate('npcSystem.active()[0].id');
  ui.element('#npcLayer').emit('click', { target: { closest: () => ({ dataset: { npcId: id } }) } });
  ui.evaluate('CampusGame.AI_CHAT.relay = "https://relay.test/chat"; window.resolveNpcReply = null; fetch = () => new Promise(resolve => { window.resolveNpcReply = resolve; })');
  ui.element('#npcChatInput').value = '你好';
  const pendingReply = ui.evaluate('sendNpcChat()');
  assert.equal(ui.evaluate('dialogMode'), 'npc');
  ui.evaluate('Date.now = () => 1000; npcTick()');
  ui.evaluate('window.resolveNpcReply({ ok: true, json: async () => ({ reply: "迟到回复" }) })');
  await pendingReply;
  assert.equal(ui.evaluate('dialogMode'), null);
  assert.equal(ui.evaluate('npcTalking'), null);
  assert.equal(ui.evaluate('npcChatLogs.has(' + JSON.stringify(id) + ')'), false);
  assert.equal(ui.element('#dialogBody').innerHTML.includes('迟到回复'), false);
  assert.match(ui.element('#toast').textContent, /已经离开/);
});

test('NPC 在线对话：发送消息走云端回复，气泡就地追加且历史保留，输入复位', async () => {
  const ui = app(memory(), false, true);
  ui.start();
  ui.evaluate('npcSystem = CampusNpc.createSystem({ random: () => Math.random(), settings: { firstDelay: [0, 0], gap: [0, 0] } })');
  ui.flush(); ui.flush();
  const id = ui.evaluate('npcSystem.active()[0].id');
  ui.element('#npcLayer').emit('click', { target: { closest: () => ({ dataset: { npcId: id } }) } });
  assert.equal(ui.evaluate('dialogMode'), 'npc');
  // 输入框打开即在；配置中转地址后发送走云端回复，不重建弹窗。
  ui.evaluate('CampusGame.AI_CHAT.relay = "https://relay.test/chat"');
  ui.evaluate('fetch = async (url, options) => ({ ok: true, json: async () => ({ reply: "AI 测试回复：同学好！" }) })');
  ui.element('#npcChatInput').value = '你好呀';
  await ui.evaluate('sendNpcChat()');
  const history = ui.element('#npcChatHistory').innerHTML;
  assert.match(history, /你好呀/, '玩家消息进入历史气泡');
  assert.match(history, /AI 测试回复：同学好！/, '云端回复就地追加为气泡');
  assert.equal(ui.element('#npcChatInput').value, '', '发送后输入框清空');
  assert.equal(ui.element('#npcChatInput').disabled, false, '发送完成后输入框恢复可用');
  assert.equal(ui.evaluate('npcChatLogs.get(' + JSON.stringify(id) + ').length'), 3, '开场白加一问一答共三条');
  // 在线回复不带质量标记时用本地启发式评分结算：'你好呀'是零档，只扣精力与该身份本学期首聊时间。
  assert.match(ui.element('#dialogNotice').textContent, /这次聊天：时间 −1 · 精力 −1/);
  assert.equal(ui.evaluate('state.history.at(-1).command.operation'), 'chatWithNpc');
});

test('NPC 在线对话：中转不可达时回退本地台词并提示，聊天不中断', async () => {
  const ui = app(memory(), false, true);
  ui.start();
  ui.evaluate('npcSystem = CampusNpc.createSystem({ random: () => Math.random(), settings: { firstDelay: [0, 0], gap: [0, 0] } })');
  ui.flush(); ui.flush();
  const id = ui.evaluate('npcSystem.active()[0].id');
  const identityId = ui.evaluate('npcSystem.active()[0].identityId');
  ui.element('#npcLayer').emit('click', { target: { closest: () => ({ dataset: { npcId: id } }) } });
  ui.evaluate('CampusGame.AI_CHAT.relay = "https://relay.test/chat"');
  ui.evaluate('fetch = async () => { throw new Error("offline"); }');
  ui.element('#npcChatInput').value = '在吗';
  const before = ui.evaluate('({ revision: state.revision, energy: state.energy, time: state.time })');
  await ui.evaluate('sendNpcChat()');
  // 中转失败的提示随后被结算摘要覆盖；离线兜底照常评分扣费（'在吗'是零档，只有消耗）。
  assert.match(ui.element('#dialogNotice').textContent, /这次聊天：时间 −1 · 精力 −1/);
  const after = ui.evaluate('({ revision: state.revision, energy: state.energy, time: state.time })');
  assert.equal(after.revision, before.revision + 1, '聊天消息提交为一条规则命令');
  assert.equal(after.energy, before.energy - 1, '每条消息扣 1 精力');
  assert.equal(after.time, before.time - 1, '学期内首次搭话扣 1 时间');
  const history = ui.element('#npcChatHistory').innerHTML;
  assert.match(history, /在吗/, '玩家消息留在历史里，聊天不中断');
  const lines = ui.evaluate('CampusNpc.linesFor(' + JSON.stringify(identityId) + ')');
  assert.ok(lines.some((line) => history.includes(line)), '回退台词来自该身份台词库');
});

test('NPC 聊天规则结算：中转返回质量分按档位加属性，旧版中转的尾部标记被前端剥离', async () => {
  const ui = app(memory(), false, true);
  ui.start();
  ui.evaluate('npcSystem = CampusNpc.createSystem({ random: () => Math.random(), settings: { firstDelay: [0, 0], gap: [0, 0] } })');
  ui.flush(); ui.flush();
  const id = ui.evaluate('npcSystem.active()[0].id');
  const identityId = ui.evaluate('npcSystem.active()[0].identityId');
  ui.element('#npcLayer').emit('click', { target: { closest: () => ({ dataset: { npcId: id } }) } });
  ui.evaluate('CampusGame.AI_CHAT.relay = "https://relay.test/chat"');
  // 新版中转：{ reply, quality } 结构，质量 2 档。
  ui.evaluate('fetch = async () => ({ ok: true, json: async () => ({ reply: "谢谢你的建议，加油！", quality: 2 }) })');
  ui.element('#npcChatInput').value = '老师您好，请问期末复习的重点是什么？';
  const before = ui.evaluate('({ social: state.social, mood: state.mood, preparation: state.preparation })');
  await ui.evaluate('sendNpcChat()');
  assert.equal(ui.evaluate('state.history.at(-1).command.quality'), 2, '采用中转返回的质量分');
  assert.equal(ui.evaluate('state.social'), before.social + 2, '二档社交 +2');
  assert.equal(ui.evaluate('state.mood'), before.mood + 4, '二档心情 +4');
  if (['senior', 'seniorGirl', 'lecturer', 'professor'].includes(identityId)) {
    assert.equal(ui.evaluate('state.preparation'), before.preparation + 5, '学业身份另加学习进度 +5');
  }
  // 旧版中转：回复末尾带标记、不返回 quality，前端负责剥离并取分。
  ui.evaluate('fetch = async () => ({ ok: true, json: async () => ({ reply: "不客气，去忙吧。【Q:2】" }) })');
  ui.element('#npcChatInput').value = '谢谢老师，我明白了！';
  await ui.evaluate('sendNpcChat()');
  assert.doesNotMatch(ui.element('#npcChatHistory').innerHTML, /【Q:2】/, '质量标记不进聊天气泡');
  assert.equal(ui.evaluate('state.history.at(-1).command.quality'), 2, '尾部标记里的质量分被采用');
  assert.equal(ui.evaluate('state.history.at(-1).changes.social'), 2, '第二条照常按二档结算');
});

test('NPC 聊天规则结算：非 playing 阶段纯闲聊零消耗，精力不足时预检拦下不发消息', async () => {
  const ui = app(memory(), false, true);
  ui.start();
  ui.evaluate('npcSystem = CampusNpc.createSystem({ random: () => Math.random(), settings: { firstDelay: [0, 0], gap: [0, 0] } })');
  ui.flush(); ui.flush();
  const id = ui.evaluate('npcSystem.active()[0].id');
  ui.element('#npcLayer').emit('click', { target: { closest: () => ({ dataset: { npcId: id } }) } });
  ui.evaluate('CampusGame.AI_CHAT.relay = "https://relay.test/chat"');
  ui.evaluate('fetch = async () => ({ ok: true, json: async () => ({ reply: "考试加油。", quality: 2 }) })');
  // 总结阶段：消息照发（观感层），但不走规则命令，零消耗零收益。
  ui.evaluate('state = { ...state, phase: "summary", summary: { term: 1 } }; renderState()');
  const idle = ui.evaluate('({ revision: state.revision, energy: state.energy, time: state.time })');
  ui.element('#npcChatInput').value = '在吗';
  await ui.evaluate('sendNpcChat()');
  assert.deepEqual(ui.evaluate('({ revision: state.revision, energy: state.energy, time: state.time })'), idle, '非 playing 阶段不提交规则命令');
  assert.doesNotMatch(ui.element('#dialogNotice').textContent, /这次聊天/);
  // 回到 playing 但精力耗尽：预检拦截，消息不发送、输入保留。
  ui.evaluate('state = { ...state, phase: "playing", energy: 0 }; renderState()');
  ui.element('#npcChatInput').value = '还想聊聊';
  await ui.evaluate('sendNpcChat()');
  assert.match(ui.element('#dialogNotice').textContent, /精力不够/);
  assert.ok(!ui.element('#npcChatHistory').innerHTML.includes('还想聊聊'), '预检失败时玩家消息不进历史');
  assert.equal(ui.element('#npcChatInput').value, '还想聊聊', '输入内容保留可修改');
  assert.equal(ui.element('#npcChatInput').disabled, false, '输入框未被禁用');
});

test('开学选课、结束学期开考与期末总结界面可依次渲染', () => {
  const ui = app();
  ui.start(false);
  assert.equal(ui.evaluate('dialogMode'), 'budget');
  ui.evaluate('showCourseSelection()');
  assert.equal(ui.evaluate('dialogMode'), 'budget', '预算未确认时不能从其他入口绕过到选课');
  ui.click('#dialogButtons', { dialogAction: 'budgetConfirm' });
  ui.flush();
  assert.equal(ui.evaluate('dialogMode'), 'courseSelection');
  assert.match(ui.element('#dialogBody').innerHTML, /id="courseForm"/);
  assert.match(ui.element('#dialogBody').innerHTML, /course-card/);
  assert.match(ui.element('#dialogBody').innerHTML, /学分/);
  const ids = ui.evaluate('CampusGame.coursesForTerm(state.term, state.background.id, state.background.major).slice(0, 3).map((course) => course.id)');
  ui.evaluate('state = CampusGame.selectCourses(state, ' + JSON.stringify(ids) + ', { expectedRevision: state.revision }).state; renderState(); dialog.close()');
  ui.click('#endTermButton');
  assert.equal(ui.evaluate('dialogMode'), 'confirmExam');
  ui.click('#dialogButtons', { dialogAction: 'beginExam', revision: String(ui.evaluate('state.revision')) });
  assert.equal(ui.evaluate('dialogMode'), 'exam');
  assert.match(ui.element('#dialogBody').innerHTML, /id="examForm"/);
  assert.equal((ui.element('#dialogBody').innerHTML.match(/class="exam-question"/g) || []).length, 5);
  const answers = ui.evaluate('state.exam.questions.map((question) => question.answer)');
  ui.evaluate('state = CampusGame.submitExam(state, ' + JSON.stringify(answers) + ', { expectedRevision: state.revision }).state; renderState(); showSummary()');
  assert.equal(ui.evaluate('dialogMode'), 'summary');
  assert.match(ui.element('#dialogBody').innerHTML, /平时分/);
  assert.match(ui.element('#dialogBody').innerHTML, /期末考试/);
});

test('开学确认基础费用与住宿档位：固定底座不可选、住宿三档、低体能警告与不可负担禁用', () => {
  const ui = app();
  ui.start(false);
  let seed = 'budget-picker-0';
  for (let i = 0; game.familyForSeed(seed).id !== 'ordinary'; i++) seed = 'budget-picker-' + (i + 1);
  ui.evaluate('state = CampusGame.createGame({ seed: ' + JSON.stringify(seed) + ' }); budgetDraft = null; budgetDraftTerm = null; renderState(); showBudget()');
  assert.equal(ui.evaluate('dialogMode'), 'budget');
  let body = ui.element('#dialogBody').innerHTML;
  // 只有住宿渲染档位按钮；衣/食/行为固定底座行，legacy 档位不再提供。
  assert.equal((body.match(/data-budget-dimension/g) || []).length, 3);
  for (const dimension of ['clothing', 'food', 'transport']) assert.doesNotMatch(body, new RegExp('data-budget-dimension="' + dimension));
  assert.equal((body.match(/data-budget-tier=/g) || []).length, 3);
  assert.equal((body.match(/data-budget-dimension="housing"/g) || []).length, 3);
  assert.equal((body.match(/本学期固定安排/g) || []).length, 3);
  assert.doesNotMatch(body, /精致|出色|品鉴家|健康|极简/);
  assert.match(body, /影响待完善/);
  assert.match(body, /本学期预算合计 4800 元/);
  assert.match(body, /与默认预留持平/);
  assert.equal((body.match(/aria-pressed="true"/g) || []).length, 1);
  assert.doesNotMatch(ui.element('#dialogButtons').innerHTML, /disabled/);
  assert.equal(ui.evaluate('state.money'), 1200);

  ui.evaluate('state = { ...state, fitness: 21 }; showBudget()');
  assert.match(ui.element('#dialogBody').innerHTML, /预计体能 24，低于 25 会生病/);

  ui.click('#dialogBody', { budgetDimension: 'clothing', budgetTier: 'refined' });
  assert.equal(ui.evaluate('budgetDraft.clothing'), 'ordinary', '固定维度不响应档位点击');
  ui.click('#dialogBody', { budgetDimension: 'housing', budgetTier: 'offCampus' });
  body = ui.element('#dialogBody').innerHTML;
  assert.match(body, /本学期预算合计 6800 元/);
  assert.match(body, /需追加 2000 元/);
  assert.match(body, /余额不足，还差 800 元/);
  assert.match(ui.element('#dialogButtons').innerHTML, /disabled/);
  const revision = ui.evaluate('state.revision');
  ui.click('#dialogButtons', { dialogAction: 'budgetConfirm' });
  assert.equal(ui.evaluate('state.revision'), revision);
  assert.equal(ui.evaluate('dialogMode'), 'budget');
  assert.match(ui.element('#budgetError').textContent, /预算未能确认/);

  ui.click('#dialogBody', { budgetDimension: 'housing', budgetTier: 'ordinaryDorm' });
  ui.click('#dialogButtons', { dialogAction: 'budgetConfirm' });
  ui.flush();
  assert.equal(ui.evaluate('dialogMode'), 'courseSelection');
  assert.equal(ui.evaluate('state.economy.grants[0].budgetChosen'), true);
  assert.equal(ui.evaluate('state.economy.grants[0].budget.food'), 'ordinary');
  assert.equal(ui.evaluate('state.economy.grants[0].budget.housing'), 'ordinaryDorm');
  assert.equal(ui.evaluate('state.money'), 1200);
});

test('开考确认显示剩余时间和平时分，打开与取消均不生成试卷或修改进度', () => {
  const ui = app();
  ui.start();
  ui.evaluate('state = CampusGame.executeAction(state, "study").state; while (state.pendingEvent) state = CampusGame.submitEventChoice(state, "later").state; acknowledgedResultRevision = state.revision; renderState()');
  const before = ui.evaluate('JSON.stringify(state)');
  ui.click('#endTermButton');
  assert.equal(ui.evaluate('dialogMode'), 'confirmExam');
  assert.match(ui.element('#dialogBody').innerHTML, /剩余时间 <b>10 点/);
  assert.match(ui.element('#dialogBody').innerHTML, new RegExp('当前平时分 <b>' + ui.evaluate('state.preparation') + ' / 100'));
  assert.match(ui.element('#dialogBody').innerHTML, /不能再安排学习、休息等行动/);
  assert.match(ui.element('#dialogButtons').innerHTML, /继续安排/);
  assert.match(ui.element('#dialogButtons').innerHTML, /确认开考/);
  assert.equal(ui.evaluate('JSON.stringify(state)'), before);
  assert.equal(ui.storage.data.size, 0);
  ui.click('#dialogButtons', { dialogAction: 'resume' });
  assert.equal(ui.element('#termDialog').open, false);
  assert.equal(ui.evaluate('JSON.stringify(state)'), before);
  assert.equal(ui.evaluate('CampusGame.availability(state, "study").ok'), true);
});

test('确认后才开考，重复点击及重新打开试卷不重复生成或写入操作', () => {
  const ui = app();
  ui.start();
  const revision = ui.evaluate('state.revision');
  ui.click('#endTermButton');
  const confirm = { dialogAction: 'beginExam', revision: String(revision) };
  ui.click('#dialogButtons', confirm);
  assert.equal(ui.evaluate('state.phase'), 'examPending');
  assert.equal(ui.evaluate('dialogMode'), 'exam');
  assert.equal(ui.evaluate('state.revision'), revision + 1);
  assert.equal(ui.evaluate('state.history.filter(entry => entry.command.operation === "beginExam").length'), 1);
  assert.equal(ui.storage.data.size, 0);
  const before = ui.evaluate('JSON.stringify(state)');
  ui.click('#dialogButtons', confirm);
  ui.flush();
  ui.click('#dialogButtons', confirm);
  ui.click('#endTermButton');
  assert.equal(ui.evaluate('dialogMode'), 'exam');
  assert.equal(ui.evaluate('JSON.stringify(state)'), before);
});

test('已有存档栏位只在确认开考后自动保存，刷新读档直接恢复原试卷', () => {
  const ui = app();
  ui.start();
  ui.click('#saveButton'); ui.click('#dialogBody', { saveSlot: '2' });
  const previous = new Map(ui.storage.data);
  ui.click('#endTermButton');
  assert.deepEqual(ui.storage.data, previous);
  ui.click('#dialogButtons', { dialogAction: 'beginExam', revision: String(ui.evaluate('state.revision')) });
  const loaded = saves.createSlotService(ui.storage).load(2);
  assert.equal(loaded.ok, true, loaded.reason);
  assert.equal(loaded.state.phase, 'examPending');
  assert.equal(loaded.saveSequence, 2);
  assert.equal(ui.storage.getItem(saves.getSlotKeys(1).primary), null);
  assert.equal(ui.storage.getItem(saves.getSlotKeys(3).primary), null);
  const restored = app(ui.storage);
  restored.click('#dialogBody', { loadSlot: '2', saveSource: 'primary' });
  assert.equal(restored.evaluate('dialogMode'), 'exam');
  assert.deepEqual(JSON.parse(restored.evaluate('JSON.stringify(state)')), loaded.state);
});

test('时间为零时仍需确认开考，确认前不改变状态', () => {
  const ui = app();
  ui.start();
  ui.evaluate('state.time = 0; renderState()');
  const before = ui.evaluate('JSON.stringify(state)');
  ui.click('#endTermButton');
  assert.equal(ui.evaluate('dialogMode'), 'confirmExam');
  assert.match(ui.element('#dialogBody').innerHTML, /剩余时间 <b>0 点/);
  assert.match(ui.element('#dialogBody').innerHTML, /时间已用完/);
  assert.equal(ui.evaluate('JSON.stringify(state)'), before);
  ui.click('#dialogButtons', { dialogAction: 'beginExam', revision: String(ui.evaluate('state.revision')) });
  assert.equal(ui.evaluate('state.phase'), 'examPending');
});

test('过期的开考确认不会锁定更新后的学期，重新确认后可以开考', () => {
  const ui = app();
  ui.start();
  ui.click('#endTermButton');
  const revision = ui.evaluate('state.revision');
  ui.evaluate('state = CampusGame.executeAction(state, "study").state; while (state.pendingEvent) state = CampusGame.submitEventChoice(state, "later").state');
  const before = ui.evaluate('JSON.stringify(state)');
  ui.click('#dialogButtons', { dialogAction: 'beginExam', revision: String(revision) });
  assert.equal(ui.evaluate('JSON.stringify(state)'), before);
  assert.match(ui.element('#dialogNotice').textContent, /状态已更新/);
  ui.click('#dialogButtons', { dialogAction: 'resume' });
  ui.click('#endTermButton');
  ui.click('#dialogButtons', { dialogAction: 'beginExam', revision: String(ui.evaluate('state.revision')) });
  assert.equal(ui.evaluate('state.phase'), 'examPending');
});

test('待处理校园事件优先展示，不弹出开考确认或生成试卷', () => {
  const ui = app();
  ui.start();
  ui.evaluate('state = CampusGame.executeAction(state, "applyClub").state');
  const before = ui.evaluate('JSON.stringify(state)');
  ui.click('#endTermButton');
  assert.equal(ui.evaluate('dialogMode'), 'event');
  assert.equal(ui.evaluate('JSON.stringify(state)'), before);
  assert.equal(ui.evaluate('state.exam'), null);
});

test('考试中每次选择都保存在状态，进度导航标出已答与未答题', () => {
  const ui = app();
  ui.start();
  ui.evaluate('state = CampusGame.beginExam(state).state; showExam()');
  const revision = ui.evaluate('state.revision');
  assert.equal(ui.element('#dialogSave').hidden, false);
  assert.match(ui.element('#examProgress').textContent, /已答 0 \/ 5 题/);
  assert.equal((ui.element('#examNavigation').innerHTML.match(/is-unanswered/g) || []).length, 5);
  let selected = [1, null, null, null, null];
  const form = {
    querySelector(selector) {
      const index = Number(selector.match(/q(\d+)/)?.[1]);
      const answer = selected[index];
      return answer === null || !selector.endsWith(':checked') ? null : { value: String(answer) };
    }
  };
  ui.element('#dialogBody').emit('change', { target: { closest: selector => selector === '#examForm' ? form : null } });
  assert.deepEqual(JSON.parse(ui.evaluate('JSON.stringify(state.exam.answers)')), selected);
  assert.equal(ui.evaluate('state.revision'), revision + 1);
  assert.match(ui.element('#examProgress').textContent, /已答 1 \/ 5 题/);
  assert.equal((ui.element('#examNavigation').innerHTML.match(/is-answered/g) || []).length, 1);
  assert.equal((ui.element('#examNavigation').innerHTML.match(/is-unanswered/g) || []).length, 4);
  selected = [1, null, 3, null, 2];
  ui.element('#dialogBody').emit('change', { target: { closest: selector => selector === '#examForm' ? form : null } });
  assert.deepEqual(JSON.parse(ui.evaluate('JSON.stringify(state.exam.answers)')), selected);
  assert.match(ui.element('#examProgress').textContent, /已答 3 \/ 5 题/);
  assert.equal((ui.element('#examNavigation').innerHTML.match(/is-answered/g) || []).length, 3);
});

test('考试中打开存档栏位后返回，部分答案不丢；刷新后答案仍勾选', () => {
  const storage = memory();
  const ui = app(storage);
  ui.start();
  ui.evaluate('state = CampusGame.beginExam(state).state; showExam()');
  const answers = [null, 2, null, 1, null];
  ui.evaluate('state = CampusGame.updateExamAnswers(state, ' + JSON.stringify(answers) + ').state; showExam()');
  ui.click('#dialogSave');
  assert.equal(ui.evaluate('dialogMode'), 'save');
  ui.click('#dialogButtons', { dialogAction: 'resume' });
  assert.equal(ui.evaluate('dialogMode'), 'exam');
  assert.deepEqual(JSON.parse(ui.evaluate('JSON.stringify(state.exam.answers)')), answers);
  assert.match(ui.element('#dialogBody').innerHTML, /value="2"[^>]* checked/);
  ui.click('#dialogSave');
  ui.click('#dialogBody', { saveSlot: '2' });
  assert.equal(ui.evaluate('dialogMode'), 'exam');
  assert.deepEqual(JSON.parse(ui.evaluate('JSON.stringify(state.exam.answers)')), answers);
  assert.equal(ui.evaluate('activeSaveSlot'), 2);
  assert.match(ui.element('#dialogBody').innerHTML, /value="2"[^>]* checked/);
  assert.match(ui.element('#dialogBody').innerHTML, /value="1"[^>]* checked/);
  const restored = app(storage);
  restored.click('#dialogBody', { loadSlot: '2', saveSource: 'primary' });
  assert.equal(restored.evaluate('dialogMode'), 'exam');
  assert.deepEqual(JSON.parse(restored.evaluate('JSON.stringify(state.exam.answers)')), answers);
  assert.match(restored.element('#examProgress').textContent, /已答 2 \/ 5 题/);
  assert.match(restored.element('#dialogBody').innerHTML, /value="2"[^>]* checked/);
  assert.match(restored.element('#dialogBody').innerHTML, /value="1"[^>]* checked/);
});

test('提交不完整试卷报告漏题并定位，全部答完后才能结算', () => {
  const ui = app();
  ui.start();
  ui.evaluate('state = CampusGame.beginExam(state).state; state = CampusGame.updateExamAnswers(state, [0, null, null, 1, null]).state; showExam()');
  const answers = [0, null, null, 1, null];
  const form = {
    id: 'examForm',
    querySelector(selector) {
      const index = Number(selector.match(/q(\d+)/)?.[1]);
      const answer = answers[index];
      return answer === null || !selector.endsWith(':checked') ? null : { value: String(answer) };
    }
  };
  ui.element('#dialogBody').emit('submit', { target: form, preventDefault() {} });
  assert.match(ui.element('#examError').textContent, /第 2、3、5 题/);
  assert.equal(ui.element('#examQuestion1').scrolled, true);
  assert.equal(ui.evaluate('state.phase'), 'examPending');
  answers[1] = 2; answers[2] = 1; answers[4] = 0;
  ui.element('#dialogBody').emit('change', { target: { closest: selector => selector === '#examForm' ? form : null } });
  assert.match(ui.element('#examProgress').textContent, /已答 5 \/ 5 题/);
  assert.equal(ui.element('#examMissing').disabled, true);
  assert.deepEqual(JSON.parse(ui.evaluate('JSON.stringify(state.exam.answers)')), answers);
  ui.element('#dialogBody').emit('submit', { target: form, preventDefault() {} });
  assert.equal(ui.evaluate('state.phase'), 'summary');
  assert.equal(ui.evaluate('dialogMode'), 'summary');
});

test('题号导航定位指定题和首个漏题，不会修改答题状态', () => {
  const ui = app();
  ui.start();
  ui.click('#endTermButton');
  ui.click('#dialogButtons', { dialogAction: 'beginExam', revision: String(ui.evaluate('state.revision')) });
  assert.equal(ui.evaluate('uiLocked'), true);
  assert.doesNotMatch(ui.element('#examNavigation').innerHTML, / disabled/);
  ui.click('#dialogBody', { examQuestion: '4' });
  assert.equal(ui.element('#examQuestion4').scrolled, true);
  ui.flush();
  assert.equal(ui.evaluate('uiLocked'), false);
  ui.evaluate('state = CampusGame.updateExamAnswers(state, [0, null, null, 2, null]).state; showExam()');
  const before = ui.evaluate('JSON.stringify(state)');
  ui.click('#dialogBody', { examQuestion: '3' });
  assert.equal(ui.element('#examQuestion3').scrolled, true);
  ui.click('#dialogBody', { examMissing: 'true' });
  assert.equal(ui.element('#examQuestion1').scrolled, true);
  ui.click('#dialogBody', { examQuestion: '0' });
  assert.match(ui.element('#examProgress').textContent, /已答 2 \/ 5 题/);
  assert.equal(ui.evaluate('JSON.stringify(state)'), before);
});

test('确认覆盖前其他标签更新目标栏位，覆盖失败且保留当前进度和目标新档', () => {
  const storage = memory();
  const external = saves.createSlotService(storage);
  external.save(game.createGame({ nickname: '目标玩家' }), 2);
  const ui = app(storage);
  ui.start(); ui.click('#saveButton'); ui.click('#dialogBody', { saveSlot: '2' });
  external.save(game.createGame({ nickname: '更新玩家' }), 2);
  const latest = storage.getItem(saves.getSlotKeys(2).primary);
  ui.click('#dialogButtons', { dialogAction: 'confirmSave' });
  assert.equal(storage.getItem(saves.getSlotKeys(2).primary), latest);
  assert.equal(ui.evaluate('activeSaveSlot'), null);
  assert.equal(ui.evaluate('state.nickname'), '界面测试');
  assert.match(ui.element('#dialogNotice').textContent, /标签页/);
});

test('新增校园经历从存档恢复后显示中文名称，简历面板不出现 undefined', () => {
  const state = game.createGame({ nickname: '经历显示' });
  state.experiences = ['military', 'singer', 'trip', 'contest'].map(type => ({ type, term: 1 }));
  const storage = memory();
  assert.equal(saves.createSlotService(storage).save(state, 2).ok, true);
  const ui = app(storage);
  ui.click('#dialogBody', { loadSlot: '2', saveSource: 'primary' });
  ui.click('.app-menu-button[data-panel="resume"]');
  const html = ui.element('#resumeBody').innerHTML;
  for (const name of ['军训', '歌手大赛', '返乡', '竞赛']) assert.ok(html.includes(name), name);
  for (const title of ['实习经历', '项目经历', '竞赛经历', '社团经历']) assert.ok(html.includes(title), title);
  assert.ok(html.includes('resume-req'), '简历要件 chips 应渲染');
  assert.doesNotMatch(html, /undefined/);
});


test('事件只预览成本，确认后显示具体结果；保存、读档和成长记录保留叙述且不重抽', () => {
  const ui = app();
  ui.start();
  ui.evaluate("state = { ...game.executeAction(game.executeAction(state, 'study').state, 'study').state, fitness: 50 }; showEvent()");
  assert.match(ui.element('#dialogBody').innerHTML, /整个军训的安排/);
  const before = ui.evaluate('JSON.stringify(state)');
  ui.click('#dialogBody', { investmentPreset: 'join', amount: '26' });
  assert.match(ui.element('#investment-options-join').innerHTML, /data-amount="26" aria-pressed="true"/);
  assert.match(ui.element('#investment-cost-join').textContent, /精力 −26.*体能 −4/);
  assert.doesNotMatch(ui.element('#dialogBody').innerHTML, /常见|预计|平均|约八成|体能 约/);
  assert.equal(ui.evaluate('JSON.stringify(state)'), before);
  ui.click('#dialogBody', { eventChoice: 'join', revision: String(ui.evaluate('state.revision')), instance: ui.evaluate('state.pendingEvent.instanceId') });
  assert.equal(ui.evaluate('dialogMode'), 'eventResult');
  assert.match(ui.element('#dialogBody').innerHTML, /本次投入.*26 点精力/);
  assert.match(ui.element('#dialogBody').innerHTML, /实际变化/);
  assert.equal(ui.evaluate('state.energy'), 24);
  const settled = ui.evaluate('JSON.stringify(state)');
  const story = ui.evaluate('state.history.at(-1).investment.description');
  assert.ok(ui.element('#dialogBody').innerHTML.includes(story));
  ui.flush();
  ui.click('#dialogSave');
  ui.click('#dialogBody', { saveSlot: '2' });
  assert.equal(ui.evaluate('dialogMode'), 'eventResult');
  ui.click('#dialogButtons', { dialogAction: 'eventContinue' });
  assert.equal(ui.evaluate('state.pendingEvent.id'), 'military2');
  ui.click('#dialogBody', { eventChoice: 'perform', revision: String(ui.evaluate('state.revision')), instance: ui.evaluate('state.pendingEvent.instanceId') });
  ui.flush();
  ui.click('#loadButton');
  ui.click('#dialogBody', { loadSlot: '2', saveSource: 'primary' });
  assert.equal(ui.evaluate('dialogMode'), 'eventResult');
  assert.equal(ui.evaluate('JSON.stringify(state)'), settled);
  ui.click('#dialogButtons', { dialogAction: 'eventContinue' });
  ui.click('#historyButton');
  assert.ok(ui.element('#dialogBody').innerHTML.includes(story));
  assert.match(ui.element('#dialogBody').innerHTML, /投入与收获/);
});

test('档位按钮拒绝任意数字，资源不足可改选有效档位', () => {
  const ui = app(); ui.start();
  ui.evaluate("state = { ...game.executeAction(game.executeAction(state, 'study').state, 'study').state, fitness: 50 }; showEvent()");
  assert.doesNotMatch(ui.element('#dialogBody').innerHTML, /type="range"|type="number"/);
  const original = ui.evaluate('JSON.stringify(state)');
  for (const amount of ['4', '11', '24', '3.5']) {
    ui.click('#dialogBody', { investmentPreset: 'join', amount });
    assert.equal(ui.element('#event-choice-join').disabled, true);
    ui.click('#dialogBody', { eventChoice: 'join', revision: String(ui.evaluate('state.revision')), instance: ui.evaluate('state.pendingEvent.instanceId') });
    assert.equal(ui.evaluate('JSON.stringify(state)'), original);
  }
  ui.evaluate('state.energy = 9');
  ui.click('#dialogBody', { investmentPreset: 'join', amount: '10' });
  assert.equal(ui.element('#event-choice-join').disabled, true);
  assert.match(ui.element('#investment-reason-join').textContent, /精力不够/);
  ui.evaluate('state.energy = 10');
  ui.click('#dialogBody', { investmentPreset: 'join', amount: '10' });
  assert.equal(ui.element('#event-choice-join').disabled, false);
});

test('军训回顾后直接进入汇演，室友关心等待军训完成', () => {
  const ui = app(); ui.start();
  ui.evaluate("state = game.executeAction(game.executeAction(state, 'study').state, 'study').state; state.mood = 20; showEvent()");
  ui.click('#dialogBody', { eventChoice: 'join', revision: String(ui.evaluate('state.revision')), instance: ui.evaluate('state.pendingEvent.instanceId') });
  assert.equal(ui.evaluate('state.pendingEvent.id'), 'military2');
  assert.equal(ui.evaluate('dialogMode'), 'eventResult');
  const settled = ui.evaluate('JSON.stringify(state)');
  ui.flush(); ui.click('#dialogButtons', { dialogAction: 'eventContinue' });
  assert.equal(ui.evaluate('dialogMode'), 'event');
  assert.match(ui.element('#dialogTitle').textContent, /军训汇演/);
  assert.doesNotMatch(ui.element('#dialogBody').innerHTML, /investment-tier/);
  assert.equal(ui.evaluate('JSON.stringify(state)'), settled);
  ui.click('#dialogBody', { eventChoice: 'perform', revision: String(ui.evaluate('state.revision')), instance: ui.evaluate('state.pendingEvent.instanceId') });
  assert.equal(ui.evaluate('state.pendingEvent.id'), 'roommateCare');
});

test('所有地点的日常行动及固定、可调事件都不展示收益预测，仅显示投入成本', () => {
  const ui = app();
  ui.start();
  const original = ui.evaluate('JSON.stringify(state)');
  for (const place of Object.keys(game.PLACES)) {
    ui.evaluate('openPlace(' + JSON.stringify(place) + ')');
    const html = ui.element('#actionList').innerHTML;
    assert.doesNotMatch(html, /预计|预期|平均收益|常见|八成|action-gain|investment-preview|学习进度 \+|社交 \+|心情 \+|体能 \+/);
    assert.doesNotMatch(html, /type="range"|type="number"/);
    assert.ok(html.includes('action-cost'));
  }
  assert.equal(ui.evaluate('JSON.stringify(state)'), original);
  for (const id of ['roommateCare', 'military1', 'projectOffer']) {
    ui.evaluate('state = { ...state, phase: "eventPending", pendingEvent: { id: ' + JSON.stringify(id) + ', term: 1, instanceId: "daily:' + id + ':1" } }; showEvent()');
    assert.doesNotMatch(ui.element('#dialogBody').innerHTML, /预计|预期|平均收益|常见|八成|action-gain|investment-preview|学习进度 \+|社交 \+|心情 \+|体能 \+/);
  }
});

test('天佑会堂只有固定观演成本，不提供预算档位或收益预测', () => {
  const ui = app(); ui.start();
  ui.evaluate('openPlace("auditorium")');
  const html = ui.element('#actionList').innerHTML;
  assert.match(html, /时间 −1.*精力 −2.*钱包 −40 元.*体能 −1/);
  assert.doesNotMatch(html, /investment-tier|investment-controls|type="range"|type="number"|心情 \+|社交 \+/);
});

test('行动卡展示体能成本，体能不足时禁用并提示', () => {
  const ui = app(); ui.start();
  ui.evaluate('openPlace("think")');
  ui.evaluate('state = { ...state, fitness: 1 }');
  ui.click('#actionList', { actionInvestmentPreset: 'study', amount: '15' });
  assert.equal(ui.element('#action-choice-study').disabled, true);
  assert.match(ui.element('#investment-reason-action-study').textContent, /身体不适，先去校医院就诊/);
});

test('锻炼结果区分体能消耗与扣除消耗后的净变化', () => {
  const ui = app(); ui.start();
  ui.evaluate('openPlace("think")');
  assert.doesNotMatch(ui.element('#actionList').innerHTML, /运动会消耗体能/);
  ui.evaluate('openPlace("track")');
  const trackHtml = ui.element('#actionList').innerHTML;
  assert.match(trackHtml, /运动会消耗体能，但锻炼结束后能恢复更多体能/);
  for (const [title, hint] of [['健身房锻炼', '需要额外预算，但体能提升更明显'], ['多人运动', '更耗费精力，但心情和社交提升更多'], ['单人运动', '精力消耗最少，适合日常保持体能']]) {
    assert.ok(trackHtml.includes(title), title);
    assert.ok(trackHtml.includes(hint), hint);
  }
  assert.match(trackHtml, /钱包 −50 元/);
  assert.match(trackHtml, /精力 −15/);
  assert.match(trackHtml, /精力 −3/);
  assert.match(trackHtml, /体能 −3（消耗）/);
  assert.match(trackHtml, /体能 −1（消耗）/);
  ui.click('#actionList', { actionInvestmentPreset: 'gym', amount: '100' });
  assert.match(ui.element('#investment-cost-action-gym').textContent, /钱包 −100 元/);
  ui.click('#actionList', { actionInvestmentPreset: 'exercise', amount: '10' });
  assert.match(ui.element('#investment-cost-action-exercise').textContent, /体能 −2（消耗）/);
  ui.click('#actionList', { action: 'exercise', revision: String(ui.evaluate('state.revision')) });
  assert.equal(ui.evaluate('dialogMode'), 'eventResult');
  assert.match(ui.element('#dialogBody').innerHTML, /另消耗 <b>2 点体能<\/b>/);
  assert.match(ui.element('#dialogBody').innerHTML, /体能 \+\d+ 是扣除本次 2 点消耗后的净变化/);
});

test('状态卡显示体能挡位与生病警告', () => {
  const ui = app(); ui.start();
  assert.match(ui.element('#mapStats').innerHTML, /一般（收益 ×1.00 \/ 消耗 ×1.00）/);
  assert.equal(ui.element('#fitnessWarning').hidden, true);
  ui.evaluate('state = { ...state, fitness: 24 }; renderState()');
  assert.match(ui.element('#mapStats').innerHTML, /生病 · 先去校医院/);
  assert.match(ui.element('#fitnessWarning').textContent, /先去校医院就诊/);
});

test('生病时医院只开放就诊，其他医院行动锁定', () => {
  const ui = app(); ui.start();
  ui.evaluate('openPlace("hospital")');
  assert.match(ui.element('#actionList').innerHTML, /id="action-choice-treatment"[^>]*disabled/);
  ui.evaluate('state = { ...state, fitness: 24 }; openPlace("hospital")');
  const html = ui.element('#actionList').innerHTML;
  assert.doesNotMatch(html, /id="action-choice-treatment"[^>]*disabled/);
  assert.match(html, /id="action-choice-checkup"[^>]*disabled/);
  assert.match(html, /身体不适，先去校医院就诊/);
});

test('生病时事件对话框只保留先去校医院', () => {
  const ui = app(); ui.start();
  ui.evaluate('state = { ...state, fitness: 10, phase: "eventPending", pendingEvent: { id: "fitnessTest", term: 1, instanceId: "daily:fitnessTest:1" } }; showEvent()');
  const body = ui.element('#dialogBody').innerHTML;
  assert.match(body, /data-event-choice="sickLeave"/);
  assert.doesNotMatch(body, /data-event-choice="participate"|data-event-choice="later"/);
  ui.click('#dialogBody', { eventChoice: 'sickLeave', revision: String(ui.evaluate('state.revision')), instance: 'daily:fitnessTest:1' });
  assert.equal(ui.evaluate('state.pendingEvent'), null);
});

test('虚弱挡位的投入结果页显示实际消耗', () => {
  const ui = app(); ui.start();
  ui.evaluate('state = { ...state, fitness: 44 }; openPlace("think")');
  ui.click('#actionList', { actionInvestmentPreset: 'study', amount: '15' });
  assert.match(ui.element('#investment-cost-action-study').textContent, /精力 −19/);
  ui.click('#actionList', { action: 'study', revision: String(ui.evaluate('state.revision')) });
  if (ui.evaluate('dialogMode') === 'actionExtra') ui.click('#dialogButtons', { dialogAction: 'extraSkip' });
  assert.equal(ui.evaluate('dialogMode'), 'eventResult');
  assert.match(ui.element('#dialogBody').innerHTML, /本次投入 <b>19 点精力<\/b>/);
  assert.equal(ui.evaluate('state.history.at(-1).investment.amount'), 15);
});

test('常规课程可调成本，提交后揭晓并保存结果；下一行动的校园事件在回顾之后展示', () => {
  const ui = app();
  ui.start();
  ui.evaluate('openPlace("think")');
  const before = ui.evaluate('JSON.stringify(state)');
  ui.click('#actionList', { actionInvestmentPreset: 'study', amount: '15' });
  assert.match(ui.element('#investment-options-action-study').innerHTML, /data-amount="15" aria-pressed="true"/);
  assert.match(ui.element('#investment-cost-action-study').textContent, /精力 −15.*体能 −3/);
  assert.equal(ui.evaluate('JSON.stringify(state)'), before);
  ui.click('#actionList', { action: 'study', revision: String(ui.evaluate('state.revision')) });
  if (ui.evaluate('dialogMode') === 'actionExtra') ui.click('#dialogButtons', { dialogAction: 'extraSkip' });
  assert.equal(ui.evaluate('dialogMode'), 'eventResult');
  assert.equal(ui.evaluate('state.energy'), 65);
  assert.equal(ui.evaluate('state.history.find(entry => entry.investment).investment.amount'), 15);
  assert.match(ui.element('#dialogBody').innerHTML, /课程学习|实际变化/);
  const settled = ui.evaluate('JSON.stringify(state)');
  ui.flush(); ui.click('#dialogSave'); ui.click('#dialogBody', { saveSlot: '3' });
  ui.click('#dialogButtons', { dialogAction: 'eventContinue' });
  ui.click('#loadButton'); ui.click('#dialogBody', { loadSlot: '3', saveSource: 'primary' });
  assert.equal(ui.evaluate('dialogMode'), 'eventResult');
  assert.equal(ui.evaluate('JSON.stringify(state)'), settled);
  ui.click('#dialogButtons', { dialogAction: 'eventContinue' });
  ui.evaluate('openPlace("think")');
  ui.click('#actionList', { actionInvestmentPreset: 'study', amount: '5' });
  ui.click('#actionList', { action: 'study', revision: String(ui.evaluate('state.revision')) });
  if (ui.evaluate('dialogMode') === 'actionExtra') ui.click('#dialogButtons', { dialogAction: 'extraSkip' });
  assert.equal(ui.evaluate('state.pendingEvent.id'), 'military1');
  assert.equal(ui.evaluate('dialogMode'), 'eventResult');
  ui.flush(); ui.click('#dialogButtons', { dialogAction: 'eventContinue' });
  assert.equal(ui.evaluate('dialogMode'), 'event');
  assert.match(ui.element('#dialogTitle').textContent, /军训开训/);
});

test('界面同步展示联动时间，时间不够禁用高投入，少量投入仍能执行且不泄露收益', () => {
  const ui = app();
  ui.start();
  ui.evaluate('state.time = 2; openPlace("think")');
  const original = ui.evaluate('JSON.stringify(state)');
  ui.click('#actionList', { actionInvestmentPreset: 'study', amount: '30' });
  assert.match(ui.element('#investment-cost-action-study').textContent, /时间 −3.*精力 −30/);
  assert.equal(ui.element('#action-choice-study').disabled, true);
  assert.match(ui.element('#investment-reason-action-study').textContent, /时间不够/);
  ui.click('#actionList', { action: 'study', revision: String(ui.evaluate('state.revision')) });
  if (ui.evaluate('dialogMode') === 'actionExtra') ui.click('#dialogButtons', { dialogAction: 'extraSkip' });
  assert.equal(ui.evaluate('JSON.stringify(state)'), original);
  ui.click('#actionList', { actionInvestmentPreset: 'study', amount: '5' });
  assert.match(ui.element('#investment-cost-action-study').textContent, /时间 −1.*精力 −5/);
  assert.equal(ui.element('#action-choice-study').disabled, false);
  assert.doesNotMatch(ui.element('#actionList').innerHTML, /预计|预期|平均收益|常见|investment-preview/);
  ui.click('#actionList', { action: 'study', revision: String(ui.evaluate('state.revision')) });
  if (ui.evaluate('dialogMode') === 'actionExtra') ui.click('#dialogButtons', { dialogAction: 'extraSkip' });
  assert.equal(ui.evaluate('state.time'), 1);
  assert.equal(ui.evaluate('state.energy'), 75);
  assert.match(ui.element('#dialogBody').innerHTML, /时间 −1.*精力 −5/);
});

test('期末考试可取消或确认作弊，确认后直接显示道中终局', () => {
  const ui = app();
  ui.start();
  ui.click('#endTermButton');
  ui.flush();
  assert.equal(ui.evaluate('dialogMode'), 'confirmExam');
  ui.click('#dialogButtons', { dialogAction: 'beginExam', revision: String(ui.evaluate('state.revision')) });
  ui.flush();
  assert.equal(ui.evaluate('dialogMode'), 'exam');
  assert.match(ui.element('#dialogBody').innerHTML, /data-cheat-exam/);
  ui.click('#dialogBody', { cheatExam: '1', revision: String(ui.evaluate('state.revision')) });
  assert.equal(ui.evaluate('dialogMode'), 'confirmCheat');
  ui.click('#dialogButtons', { dialogAction: 'backToExam' });
  assert.equal(ui.evaluate('dialogMode'), 'exam');
  ui.click('#dialogBody', { cheatExam: '1', revision: String(ui.evaluate('state.revision')) });
  ui.click('#dialogButtons', { dialogAction: 'cheatExam', revision: String(ui.evaluate('state.revision')) });
  assert.equal(ui.evaluate('state.phase'), 'ended');
  assert.equal(ui.evaluate('state.result.direction'), 'cheatNote');
  assert.equal(ui.evaluate('dialogMode'), 'ended');
  assert.match(ui.element('#dialogBody').innerHTML, /小抄第一行/);
});

test('校园卡追查事件先确认再进入终局，安全归还可继续游戏', () => {
  const ui = app();
  ui.start();
  const card = ui.evaluate('(() => { const base = CampusGame.createGame({ nickname: "card-ui", seed: "card-ui" }); return { ...base, phase: "eventPending", pendingEvent: { id: "card", term: 1, instanceId: "daily:card:1" } }; })()');
  ui.evaluate('state = ' + JSON.stringify(card) + '; renderState(); resumePhase()');
  assert.equal(ui.evaluate('dialogMode'), 'event');
  ui.click('#dialogBody', { eventChoice: 'pocket', revision: String(ui.evaluate('state.revision')), instance: 'daily:card:1' });
  ui.flush();
  assert.equal(ui.evaluate('state.phase'), 'playing');
  assert.equal(ui.evaluate('state.eventFlags.cardPocketed'), true);
  ui.evaluate('state = CampusGame.continueGame(CampusGame.endTerm(state).state).state; renderState(); resumePhase()');
  assert.equal(ui.evaluate('state.pendingEvent.id'), 'cardTrace');
  assert.match(ui.element('#dialogBody').innerHTML, /本局结束/);
  ui.click('#dialogBody', { eventChoice: 'deny', revision: String(ui.evaluate('state.revision')), instance: ui.evaluate('state.pendingEvent.instanceId') });
  ui.flush();
  assert.equal(ui.evaluate('dialogMode'), 'confirmEnding');
  ui.click('#dialogButtons', { dialogAction: 'confirmEventEnding', revision: String(ui.evaluate('state.revision')) });
  assert.equal(ui.evaluate('state.phase'), 'ended');
  assert.equal(ui.evaluate('state.result.direction'), 'cardThief');
  assert.equal(ui.evaluate('dialogMode'), 'ended');

  const safe = app();
  safe.start();
  const safeCard = safe.evaluate('(() => { const base = CampusGame.createGame({ nickname: "card-safe", seed: "card-safe" }); return { ...base, phase: "eventPending", pendingEvent: { id: "card", term: 1, instanceId: "daily:card:1" } }; })()');
  safe.evaluate('state = ' + JSON.stringify(safeCard) + '; renderState(); resumePhase()');
  safe.click('#dialogBody', { eventChoice: 'pocket', revision: String(safe.evaluate('state.revision')), instance: 'daily:card:1' });
  safe.flush();
  safe.evaluate('state = CampusGame.continueGame(CampusGame.endTerm(state).state).state; renderState(); resumePhase()');
  safe.click('#dialogBody', { eventChoice: 'return', revision: String(safe.evaluate('state.revision')), instance: safe.evaluate('state.pendingEvent.instanceId') });
  assert.notEqual(safe.evaluate('state.phase'), 'ended');
  assert.equal(safe.evaluate('state.eventFlags.cardPocketed'), undefined);
});


test('南门岗位库：浏览、锁定意向、带岗位申请与存档往返', () => {
  const state = game.createGame({ nickname: '岗位测试', seed: 'positions-test', legacyEconomy: true });
  state.term = 3;
  const makeCourse = (term, preparation) => {
    const grade = Math.round(40 + preparation * 0.6);
    return { term, name: game.TERM_NAMES[term - 1], preparation, grade, passed: grade >= 60, moneyAfter: 900, unusedTime: 12, counts: {}, notices: [], attributes: { social: state.social, fitness: state.fitness, mood: state.mood }, livingCost: game.RULES.livingCost, aid: 0 };
  };
  state.courses = [makeCourse(1, 67), makeCourse(2, 67)];
  const storage = memory();
  assert.equal(saves.createSlotService(storage).save(state, 2).ok, true);
  const ui = app(storage);
  ui.click('#dialogBody', { loadSlot: '2', saveSource: 'primary' });
  ui.evaluate('dialog.close(); activePlace = "gate"; renderActions()');
  ui.click('#actionList', { action: 'applyInternship', revision: String(ui.evaluate('state.revision')) });
  assert.equal(ui.evaluate('dialogMode'), 'positionPicker');
  const html = ui.element('#dialogBody').innerHTML;
  assert.equal((html.match(/position-card/g) || []).length, 16, '十六张岗位卡');
  assert.match(html, /音符跳动/);
  assert.match(html, /后端开发实习生/);
  // 锁定意向：写入存档字段，对话框出现「取消意向」
  const revision = String(ui.evaluate('state.revision'));
  ui.click('#dialogBody', { positionLock: 'qiandu_testdev', revision });
  ui.flush();
  assert.equal(ui.evaluate('state.targetPosition'), 'qiandu_testdev');
  assert.match(ui.element('#dialogBody').innerHTML, /取消意向/);
  // 返回南门：关闭岗位库
  ui.click('#dialogButtons', { dialogAction: 'positionClose' });
  assert.equal(ui.evaluate('dialog.open'), false);
  // 再次进入岗位库继续申请
  ui.click('#actionList', { action: 'applyInternship', revision: String(ui.evaluate('state.revision')) });
  assert.equal(ui.evaluate('dialogMode'), 'positionPicker');
  // 带岗位申请：链挂岗位、邀请入队、命令记录 positionId
  const revision2 = String(ui.evaluate('state.revision'));
  ui.click('#dialogBody', { positionApply: 'qiandu_testdev', revision: revision2 });
  assert.equal(ui.evaluate('state.chains.internship.positionId'), 'qiandu_testdev');
  assert.equal(ui.evaluate('state.pendingEvent && state.pendingEvent.id'), 'internshipOffer');
  assert.equal(ui.evaluate('state.history.at(-1).command.positionId'), 'qiandu_testdev');
  // 存档往返：意向与链岗位字段保留
  ui.evaluate('saveCurrent(true)');
  const loaded = saves.createSlotService(storage).load(2);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.state.targetPosition, 'qiandu_testdev');
  assert.equal(loaded.state.chains.internship.positionId, 'qiandu_testdev');
});

test('岗位门槛不达标时申请按钮禁用并显示原因', () => {
  const ui = app();
  ui.start();
  ui.evaluate('dialog.close(); activePlace = "gate"; renderActions()');
  ui.click('#actionList', { action: 'applyInternship', revision: String(ui.evaluate('state.revision')) });
  assert.equal(ui.evaluate('dialogMode'), 'positionPicker');
  const html = ui.element('#dialogBody').innerHTML;
  // 第 1 学期：全部岗位未达标（窗口未开），申请按钮全部禁用且原因可见
  assert.equal((html.match(/disabled>申请这个岗位/g) || []).length, 16);
  assert.match(html, /第 3 学期开始开放/);
});

test('实习投入卡显示累计进度，达标后出现「办理实习证明」', () => {
  const ui = app();
  ui.start();
  // 进行中未达标：有进度行、无办证明按钮
  ui.evaluate('state = CampusGame.createGame({ nickname: "岗位测试", seed: "positions-test", legacyEconomy: true }); state.term = 5; state.chains.internship = { status: "active", progress: 0, startedTerm: 5, deadline: 6, nextEligibleTerm: 1, reviewAfter: 5, positionId: "qiandu_testdev", workTime: 2, workEnergy: 15, milestoneSeen: false }; dialog.close(); activePlace = "gate"; renderActions()');
  const incomplete = ui.element('#actionList').innerHTML;
  assert.match(incomplete, /累计投入：时间 2 \/ 4/);
  assert.match(incomplete, /维护回归用例集/, '三档按钮来自岗位 workPlans');
  assert.doesNotMatch(incomplete, /办理实习证明/);
  // 达标：出现按钮
  ui.evaluate('state = { ...state, chains: { ...state.chains, internship: { ...state.chains.internship, workTime: 4, workEnergy: 30 } } }; renderActions()');
  const ready = ui.element('#actionList').innerHTML;
  assert.match(ready, /门槛已达标/);
  assert.match(ready, /办理实习证明/);
  // 点击结算：链转 completed、经历入档、反馈含岗位段收入
  ui.click('#actionList', { settleInternship: '1', revision: String(ui.evaluate('state.revision')) });
  assert.equal(ui.evaluate('state.chains.internship.status'), 'completed');
  assert.equal(ui.evaluate('state.experiences.filter((e) => e.type === "internship").length'), 1);
  assert.equal(ui.evaluate('state.experiences.find((e) => e.type === "internship").positionId'), 'qiandu_testdev');
});
