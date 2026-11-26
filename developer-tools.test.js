'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('./game.js');
const saves = require('./save.js');
const dev = require('./developer-tools.js');
function memoryStorage() {
  const values = new Map();
  return { values, getItem: key => values.get(key) ?? null, setItem: (key,value) => values.set(key,value), removeItem: key => values.delete(key) };
}
test('测试资源修改检查边界，失败时不部分写入，不修改传入状态', () => {
  const source = game.createGame(), snapshot = dev.clone(source);
  for (const values of [{ money: -1 },{ time: 13 },{ mood: NaN },{ energy: 1.5 },{ term: 8 },{ money: 9999, fitness: 101 }]) assert.equal(dev.applyFields(source,values).ok,false);
  assert.deepEqual(source,snapshot);
  const result = dev.applyFields(source,{ money: 10000, energy: 100, fitness: 0 });
  assert.equal(result.ok,true); assert.equal(game.isSick(result.state),true); assert.deepEqual(source,snapshot);
});
test('八个学期场景有对应预算、三门课程和连续达标的前置成绩，可直接考试结算', () => {
  const source = game.createGame({ nickname: '测试角色', seed: 'developer-semesters' }), snapshot = dev.clone(source);
  for (let term = 1; term <= 8; term++) {
    const scene = dev.semester(source,term);
    assert.equal(scene.ok,true); assert.equal(scene.state.term,term); assert.equal(scene.state.nickname,source.nickname);
    assert.equal(scene.state.courses.length,term-1); assert.equal(scene.state.selectedCourses.length,3);
    assert.equal(game.currentGrant(scene.state).budgetChosen,true);
    assert.ok(scene.state.courses.every((c,i) => c.term === i+1 && c.passed));
    const exam = dev.exam(scene.state); assert.equal(exam.state.phase,'examPending');
    const summary = dev.exam(exam.state,true); assert.equal(summary.state.phase,'summary'); assert.equal(summary.state.courses.length,term);
    assert.equal(game.continueGame(summary.state).state.phase,term === 8 ? 'endingChoice' : 'playing');
  }
  assert.equal(dev.semester(source,9).ok,false); assert.deepEqual(source,snapshot);
});
test('强制事件场景覆盖旧待办，全部事件的可用选项可执行且不影响源状态', () => {
  const source = dev.semester(null,5).state, snapshot = dev.clone(source);
  for (const id of Object.keys(game.EVENTS)) {
    const forced = dev.forceEvent(source,id); assert.equal(forced.ok,true); assert.equal(forced.state.pendingEvent.id,id);
    for (const choice of game.EVENTS[id].choices) if (game.eventAvailability(forced.state,choice.id).ok) assert.equal(game.submitEventChoice(forced.state,choice.id).ok,true,id + '/' + choice.id);
    assert.ok(dev.eventConditions(source,id).length);
  }
  assert.deepEqual(source,snapshot); assert.equal(dev.forceEvent(source,'missing').ok,false);
});
test('事件检查展示学期和前置差距，检查过程不消耗随机数或更改进度', () => {
  const source = dev.semester(null,1).state, snapshot = dev.clone(source);
  const rows = dev.eventConditions(source,'contest2');
  assert.ok(rows.some(row => row.label.includes('开放学期') && !row.met));
  assert.ok(rows.some(row => row.label.includes('前置经历') && !row.met));
  assert.deepEqual(source,snapshot);
});
test('三位人物构造前置后可触发剧情，陪同行动依然遵守游戏规则', () => {
  const source = dev.semester(null,3).state;
  for (const npcId of Object.keys(game.npcCast.PROFILES)) {
    const prepared = dev.prepareStory(source,npcId).state;
    assert.equal(game.npcStoryAvailability(prepared,npcId).ok,true,npcId);
    const story = game.runNpcStory(prepared,{ npcId, choice: npcId === 'zhouNing' ? 'start' : 'prepare' });
    assert.equal(story.ok,true,npcId + ': ' + story.reason);
    assert.equal(game.executeAction(prepared,'selfStudy',{ companionId:npcId,characterVersion:2,npcCastVersion:1,npcSupportVersion:1 }).ok,true,npcId);
  }
  assert.equal(dev.person(source,'linXia',101).ok,false);
});
test('养成按规则购买会扣款，强制解锁和级联重置不退款、不修改源状态', () => {
  const source = dev.semester(null,3).state; source.money=10000;
  const bought = dev.growth(source,'studyTools','buy'); assert.equal(bought.state.money,source.money-game.GROWTH_NODES.studyTools.price);
  assert.equal(dev.growth(bought.state,'portfolioPlan','buy').ok,false);
  const unlocked = dev.growth(bought.state,'portfolioPlan','unlock').state;
  assert.equal(unlocked.money,bought.state.money); assert.ok(unlocked.growth.purchased.portfolioPlan);
  const reset = dev.growth(unlocked,'studyTools','reset').state;
  assert.deepEqual(reset.growth.purchased,{}); assert.equal(reset.money,unlocked.money); assert.ok(unlocked.growth.purchased.studyTools);
});
test('全部毕业路线条件可满足，八种结局预览使用真实页面所需的结果结构', () => {
  const source = game.createGame(), snapshot = dev.clone(source);
  for (const id of Object.keys(dev.ENDINGS)) {
    const prepared = dev.ending(source,id); assert.equal(prepared.ok,true,id);
    if (!game.TERMINAL_ENDINGS[id]) assert.equal(prepared.state.endingOptions.options.find(o => o.id===id)?.available,true,id);
    const preview = dev.ending(source,id,true); assert.equal(preview.ok,true,id); assert.equal(preview.state.result.direction,id);
    assert.ok(['finished','ended'].includes(preview.state.phase)); assert.ok(Number.isFinite(preview.state.result.average));
  }
  assert.deepEqual(source,snapshot);
});
test('测试存档隔离普通三栏位，任意属性修改可保存且备份独立，读取返回副本', () => {
  const storage = memoryStorage(), normal = saves.createSlotService(storage), testing = dev.createStore(storage);
  const source = game.createGame(); assert.equal(normal.save(source,1).ok,true);
  const originals = [...storage.values];
  let state = dev.applyFields(source,{ money: 12345 }).state;
  assert.equal(testing.save(state,1).ok,true); state = dev.applyFields(state,{ money: 45678 }).state;
  assert.equal(testing.save(state,1).ok,true);
  assert.equal(testing.load(1).state.money,45678); assert.equal(testing.load(1,'backup').state.money,12345);
  for (const [key,value] of originals) assert.equal(storage.getItem(key),value);
  const loaded = testing.load(1); loaded.state.money=0; assert.equal(testing.load(1).state.money,45678);
  assert.equal(normal.load(1).state.money,source.money); assert.equal(testing.load(0).ok,false);
});
test('测试存储损坏、存储不可用和写入失败有明确失败结果', () => {
  const storage = memoryStorage(), store = dev.createStore(storage), source = dev.semester(null,1).state;
  storage.setItem(dev.PREFIX+'1:main','{"format":1,"state":{}}'); assert.equal(store.load(1).ok,false);
  storage.setItem(dev.PREFIX+'1:main','{"__proto__":{}}'); assert.equal(store.load(1).ok,false);
  assert.equal(dev.createStore(null).save(source,1).ok,false);
  const failing = dev.createStore({ getItem: () => null, setItem: () => { throw new Error('full'); } });
  assert.equal(failing.save(source,1).ok,false);
});
test('人物支持产生的小数属性可修改和存读档，重复快速总结不重复计入学期成绩', () => {
  const source = dev.prepareStory(dev.semester(null,3).state,'linXia').state;
  const result = game.runNpcStory(source,{ npcId:'linXia',choice:'prepare' },{ npcSupportVersion:1 });
  assert.equal(result.ok,true);
  const modified = dev.applyFields(result.state,{ fitness:75.78, mood:51.55 }); assert.equal(modified.ok,true);
  const store = dev.createStore(memoryStorage()); assert.equal(store.save(modified.state,1).ok,true); assert.equal(store.load(1).state.fitness,75.78);
  const settled = dev.exam(modified.state,true).state, again = dev.exam(settled,true).state;
  assert.deepEqual(again,settled); assert.equal(again.courses.length,3);
  assert.equal(dev.exam(dev.exam(settled).state,true).state.courses.length,3);
});
test('原始现场、最近五个检查点与操作日志互相隔离，可重复恢复', () => {
  const recorder = dev.createRecorder(), source = game.createGame(), snapshot = dev.clone(source);
  recorder.begin({state:source,activeSaveSlot:2}); source.money=999;
  for(let i=0;i<6;i++) recorder.checkpoint(source,'场景'+i);
  assert.equal(recorder.checkpoints().length,5); assert.equal(recorder.restore(1).ok,false);
  const restored = recorder.restore(6); restored.state.money=0; assert.equal(recorder.restore(6).state.money,999);
  recorder.record('属性修改',snapshot,source); recorder.record('购买失败',source,source,'余额不足');
  assert.equal(recorder.entries.at(-1).reason,'余额不足'); assert.equal(recorder.entries[0].changes.money.to,999);
  assert.deepEqual(recorder.exit(),{state:snapshot,activeSaveSlot:2}); assert.equal(recorder.active,false);
});
