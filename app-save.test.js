'use strict';

// Exercise the real app event handlers with a minimal DOM adapter.
// Browser layout and native dialog behaviour still require browser acceptance.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const game = require('./game.js');
const saves = require('./save.js');

function memory() {
  const data = new Map();
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}
function app(storage = memory()) {
  const elements = new Map();
  function element(selector) {
    if (!elements.has(selector)) {
      const listeners = new Map();
      const classes = new Set();
      elements.set(selector, {
        innerHTML: '', textContent: '', value: '', open: false, hidden: false, style: {},
        classList: { add: name => classes.add(name), remove: name => classes.delete(name),
          toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); } },
        addEventListener: (type, callback) => listeners.set(type, callback),
        emit(type, event = {}) { listeners.get(type)?.(event); },
        focus() {}, setAttribute() {}, querySelector: () => null, querySelectorAll: () => [],
        showModal() { this.open = true; }, close() { this.open = false; }
      });
    }
    return elements.get(selector);
  }
  const timers = new Map();
  let sequence = 0;
  const window = element('window');
  window.localStorage = storage;
  const context = vm.createContext({ CampusGame: game, CampusSave: saves, window,
    HTMLDialogElement: class { showModal() {} },
    document: { querySelector: element, querySelectorAll: () => [], body: { style: {} }, addEventListener() {} },
    location: { search: '' }, URLSearchParams, Uint32Array,
    setTimeout(callback) { timers.set(++sequence, callback); return sequence; },
    clearTimeout(id) { timers.delete(id); } });
  vm.runInContext(fs.readFileSync(require.resolve('./app.js'), 'utf8'), context);
  const evaluate = expression => vm.runInContext(expression, context);
  function click(selector, dataset = {}) {
    element(selector).emit('click', { target: { closest: () => ({ dataset }) } });
  }
  return { storage, element, evaluate, click, window,
    start() {
      element('#nicknameInput').value = '界面测试';
      evaluate('startGame()');
      assert.equal(evaluate('dialogMode'), 'enrollment');
      click('#dialogButtons', { dialogAction: 'resume' });
      assert.equal(evaluate('dialogMode'), 'tutorial');
      click('#dialogButtons', { dialogAction: 'resume' });
    },
    flush() { const jobs = [...timers.values()]; timers.clear(); jobs.forEach(callback => callback()); } };
}

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

test('新局未选栏位时结算保留内存，首次选栏后后续结算只自动保存到该栏', () => {
  const ui = app();
  ui.start();
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
      const mode = { eventPending: 'event', summary: 'summary', endingChoice: 'endingChoice', finished: 'finished' }[state.phase];
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
  saves.createSaveService(storage).save(game.createGame({ nickname: '<x>' }));
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

test('新增校园经历从存档恢复后显示中文名称，成长记录不出现 undefined', () => {
  const state = game.createGame({ nickname: '经历显示' });
  state.experiences = ['military', 'singer', 'trip', 'contest'].map(type => ({ type, term: 1 }));
  const storage = memory();
  assert.equal(saves.createSlotService(storage).save(state, 2).ok, true);
  const ui = app(storage);
  ui.click('#dialogBody', { loadSlot: '2', saveSource: 'primary' });
  ui.click('#historyButton');
  const html = ui.element('#dialogBody').innerHTML;
  for (const name of ['军训', '歌手大赛', '返乡', '竞赛']) assert.ok(html.includes(name), name);
  assert.doesNotMatch(html, /undefined/);
});

test('事件只预览成本，确认后显示具体结果；保存、读档和成长记录保留叙述且不重抽', () => {
  const ui = app();
  ui.start();
  ui.evaluate("state = game.executeAction(game.executeAction(state, 'study').state, 'study').state; showEvent()");
  assert.match(ui.element('#dialogBody').innerHTML, /整个军训的安排/);
  const before = ui.evaluate('JSON.stringify(state)');
  ui.click('#dialogBody', { investmentPreset: 'join', amount: '26' });
  assert.match(ui.element('#investment-options-join').innerHTML, /data-amount="26" aria-pressed="true"/);
  assert.match(ui.element('#investment-cost-join').textContent, /精力 −26/);
  assert.doesNotMatch(ui.element('#dialogBody').innerHTML, /常见|预计|平均|约八成|体能 约/);
  assert.equal(ui.evaluate('JSON.stringify(state)'), before);
  ui.click('#dialogBody', { eventChoice: 'join', revision: '2', instance: ui.evaluate('state.pendingEvent.instanceId') });
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
  ui.click('#dialogBody', { eventChoice: 'perform', revision: '3', instance: ui.evaluate('state.pendingEvent.instanceId') });
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
  ui.evaluate("state = game.executeAction(game.executeAction(state, 'study').state, 'study').state; showEvent()");
  assert.doesNotMatch(ui.element('#dialogBody').innerHTML, /type="range"|type="number"/);
  const original = ui.evaluate('JSON.stringify(state)');
  for (const amount of ['4', '11', '24', '3.5']) {
    ui.click('#dialogBody', { investmentPreset: 'join', amount });
    assert.equal(ui.element('#event-choice-join').disabled, true);
    ui.click('#dialogBody', { eventChoice: 'join', revision: '2', instance: ui.evaluate('state.pendingEvent.instanceId') });
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
  ui.click('#dialogBody', { eventChoice: 'join', revision: '2', instance: ui.evaluate('state.pendingEvent.instanceId') });
  assert.equal(ui.evaluate('state.pendingEvent.id'), 'military2');
  assert.equal(ui.evaluate('dialogMode'), 'eventResult');
  const settled = ui.evaluate('JSON.stringify(state)');
  ui.flush(); ui.click('#dialogButtons', { dialogAction: 'eventContinue' });
  assert.equal(ui.evaluate('dialogMode'), 'event');
  assert.match(ui.element('#dialogTitle').textContent, /军训汇演/);
  assert.doesNotMatch(ui.element('#dialogBody').innerHTML, /investment-tier/);
  assert.equal(ui.evaluate('JSON.stringify(state)'), settled);
  ui.click('#dialogBody', { eventChoice: 'perform', revision: '3', instance: ui.evaluate('state.pendingEvent.instanceId') });
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
  assert.match(html, /时间 −1.*精力 −2.*钱包 −40 元/);
  assert.doesNotMatch(html, /investment-tier|investment-controls|type="range"|type="number"|心情 \+|社交 \+/);
});

test('常规课程可调成本，提交后揭晓并保存结果；下一行动的校园事件在回顾之后展示', () => {
  const ui = app();
  ui.start();
  ui.evaluate('openPlace("think")');
  const before = ui.evaluate('JSON.stringify(state)');
  ui.click('#actionList', { actionInvestmentPreset: 'study', amount: '15' });
  assert.match(ui.element('#investment-options-action-study').innerHTML, /data-amount="15" aria-pressed="true"/);
  assert.match(ui.element('#investment-cost-action-study').textContent, /精力 −15/);
  assert.equal(ui.evaluate('JSON.stringify(state)'), before);
  ui.click('#actionList', { action: 'study', revision: '0' });
  assert.equal(ui.evaluate('dialogMode'), 'eventResult');
  assert.equal(ui.evaluate('state.energy'), 65);
  assert.equal(ui.evaluate('state.history[0].investment.amount'), 15);
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
  ui.click('#actionList', { action: 'study', revision: '1' });
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
  ui.click('#actionList', { action: 'study', revision: '0' });
  assert.equal(ui.evaluate('JSON.stringify(state)'), original);
  ui.click('#actionList', { actionInvestmentPreset: 'study', amount: '5' });
  assert.match(ui.element('#investment-cost-action-study').textContent, /时间 −1.*精力 −5/);
  assert.equal(ui.element('#action-choice-study').disabled, false);
  assert.doesNotMatch(ui.element('#actionList').innerHTML, /预计|预期|平均收益|常见|investment-preview/);
  ui.click('#actionList', { action: 'study', revision: '0' });
  assert.equal(ui.evaluate('state.time'), 1);
  assert.equal(ui.evaluate('state.energy'), 75);
  assert.match(ui.element('#dialogBody').innerHTML, /时间 −1.*精力 −5/);
});
