'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('./game.js');
const save = require('./save.js');

function resolve(state, mode = 'accept') {
  while (state.pendingEvent) {
    const id = state.pendingEvent.id;
    const choice = id.endsWith('Offer') ? mode : id.endsWith('Review') ? 'complete' : 'later';
    const result = game.submitEventChoice(state, choice);
    assert.equal(result.ok, true, id + ': ' + result.reason);
    state = result.state;
  }
  return state;
}
function act(state, id, investment) {
  state = resolve(state);
  const result = game.executeAction(state, id, { investment });
  assert.equal(result.ok, true, 'term ' + state.term + ' ' + id + ': ' + result.reason);
  const next = resolve(result.state);
  assert.equal(game.validateState(next).ok, true, JSON.stringify(game.validateState(next)));
  return next;
}
function nextTerm(state) {
  const settled = game.endTerm(resolve(state));
  assert.equal(settled.ok, true);
  assert.equal(game.validateState(settled.state).ok, true);
  const next = resolve(game.continueGame(settled.state).state);
  assert.equal(game.validateState(next).ok, true);
  return next;
}
function route(kind) {
  let state = game.createGame({ nickname: '路线测试', seed: 'routes' });
  const perform = (id, investment) => {
    state = resolve(state);
    const preview = game.previewActionInvestment(state, id, investment);
    const cost = preview?.effect || game.getAction(state, id);
    while (state.energy < cost.energy && state.time > cost.time) state = act(state, 'rest', 1);
    state = act(state, id, investment);
  };
  for (let term = 1; term <= 8; term++) {
    const target = kind === 'failed' ? 0 : ['ordinary', 'employment'].includes(kind) ? 45 : 75;
    while (state.preparation < target && (state.counts.study || 0) < 4) perform('study', 15);
    if (['deep', 'both', 'turn'].includes(kind)) {
      if (term === 2) { perform('applyProject'); perform('projectWork', 15); }
      if (term === 3) perform('projectWork', 15);
    }
    if (['employment', 'both', 'turn'].includes(kind)) {
      if (term === 5) { perform('applyInternship'); perform('internshipWork', 15); }
      if (term === 6) perform('internshipWork', 15);
    }
    if (term >= 5) {
      const goals = kind === 'both' ? ['furtherStudy', 'jobPreparation'] : kind === 'deep' ? ['furtherStudy'] : ['employment', 'turn'].includes(kind) ? ['jobPreparation'] : [];
      for (const id of goals.sort((a, b) => state[a] - state[b])) {
        while (state[id] < 60 && (state.counts[id] || 0) < 2 && state.time >= (state.energy < 8 ? 2 : 1)) perform(id, 8);
      }
    }
    state = nextTerm(state);
  }
  return state;
}
function memoryStorage() {
  const data = new Map();
  return { data, getItem: (key) => data.has(key) ? data.get(key) : null, setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key) };
}
function roundtrip(state) {
  const service = save.createSaveService(memoryStorage());
  const written = service.save(state);
  assert.equal(written.ok, true, written.reason);
  const loaded = service.load();
  assert.equal(loaded.ok, true, loaded.reason);
  assert.deepEqual(loaded.state, state);
  return loaded.state;
}

test('昵称与种子校验；固定种子重复产生同一入学背景和初始状态', () => {
  for (const nickname of ['', '   ', '名字'.repeat(7), 'a\nb']) assert.throws(() => game.createGame({ nickname }));
  assert.throws(() => game.createGame({ seed: '' }));
  assert.throws(() => game.createGame({ seed: 'a'.repeat(65) }));
  const state = game.createGame({ nickname: ' 测试玩家 ', seed: 'same-seed' });
  assert.equal(state.nickname, '测试玩家');
  assert.deepEqual(state, game.createGame({ nickname: '测试玩家', seed: 'same-seed' }));
  assert.equal(game.validateState(state).ok, true);
  assert.equal(Object.hasOwn(state, 'knowledge'), false);
  assert.equal(Object.hasOwn(state, 'professionalAbility'), false);
});

test('三个简化背景各有可执行的行动差异', () => {
  const collected = new Map();
  for (let seed = 0; seed < 100; seed++) {
    const state = game.createGame({ seed });
    collected.set(state.background.id, state);
  }
  assert.equal(collected.size, 3);
  assert.equal(game.getAction(collected.get('information'), 'selfStudy').energy, 9);
  assert.equal(game.getAction(collected.get('engineering'), 'projectWork').preparation, 15);
  assert.equal(game.getAction(collected.get('management'), 'clubWork').social, 10);
});

test('统一学习进度：课程、自学和补习都增加 preparation；资源与前置条件失败不变', () => {
  for (const [id, amount] of [['study', 20], ['selfStudy', 20], ['tutoring', 25]]) {
    const state = game.createGame({ seed: 'learning' });
    const before = structuredClone(state);
    const result = game.executeAction(state, id);
    assert.ok(result.state.preparation > 0);
    assert.equal(result.entry.investment.amount, game.getActionInvestment(state, id).default);
    assert.deepEqual(state, before);
  }
  const state = game.createGame();
  for (const id of ['applyProject', 'applyInternship', 'furtherStudy', 'jobPreparation', 'projectWork', 'clubWork', 'internshipWork']) {
    const result = game.executeAction(state, id);
    assert.equal(result.ok, false, id);
    assert.strictEqual(result.state, state);
  }
});

test('commandId、revision 和事件实例共同阻止重复或过期操作', () => {
  const initial = game.createGame();
  const action = game.executeAction(initial, 'study', { commandId: 'once', expectedRevision: 0 });
  assert.equal(action.ok, true);
  const before = structuredClone(action.state);
  for (const options of [{ commandId: 'once', expectedRevision: 1 }, { commandId: 'other', expectedRevision: 0 }]) {
    const denied = game.executeAction(action.state, 'study', options);
    assert.equal(denied.ok, false);
    assert.strictEqual(denied.state, action.state);
  }
  assert.deepEqual(action.state, before);
  const pending = game.executeAction(initial, 'applyClub').state;
  const stale = game.submitEventChoice(pending, 'accept', { eventInstanceId: 'old-event' });
  assert.equal(stale.ok, false);
  assert.strictEqual(stale.state, pending);
  const accepted = game.submitEventChoice(pending, 'accept', { eventInstanceId: pending.pendingEvent.instanceId });
  assert.equal(accepted.ok, true);
  assert.equal(game.submitEventChoice(accepted.state, 'accept').ok, false);
});

test('项目和社团跨学期确认；社团链能完成并记录一次经历', () => {
  let state = game.createGame({ seed: 'club' });
  state = act(state, 'applyClub');
  state = act(state, 'clubWork');
  state = act(state, 'clubWork');
  assert.equal(state.chains.club.status, 'active');
  assert.equal(state.pendingEvent, null);
  state = nextTerm(roundtrip(state));
  assert.equal(state.chains.club.status, 'completed');
  assert.equal(state.experiences.filter((item) => item.type === 'club').length, 1);
  assert.equal(game.executeAction(state, 'clubWork').ok, false);
});

test('申请延期和到期延期都有继续路径；最后学期未完成会留下说明', () => {
  let state = game.createGame();
  state = game.submitEventChoice(game.executeAction(state, 'applyClub').state, 'later').state;
  assert.equal(state.chains.club.status, 'deferred');
  assert.equal(game.executeAction(state, 'applyClub').ok, false);
  state = nextTerm(state);
  assert.equal(game.executeAction(state, 'applyClub').ok, false, '春季招新关闭');
  state = nextTerm(state);
  state = act(state, 'applyClub');
  for (; state.term < 8;) state = nextTerm(state);
  state = resolve(state);
  const before = structuredClone(state);
  const preview = game.previewSettlement(state);
  assert.deepEqual(state, before);
  assert.equal(preview.notices.some((note) => note.includes('社团未完成')), true);
  const settled = game.endTerm(state).state;
  assert.equal(settled.chains.club.status, 'missed');
  assert.equal(game.validateState(settled).ok, true);
});

for (const [kind, ending] of [['deep', 'furtherStudy'], ['employment', 'employment'], ['ordinary', 'ordinary'], ['failed', 'notQualified'], ['turn', 'employment']]) {
  test('实际八学期可达路线：' + kind + ' → ' + ending, () => {
    const state = roundtrip(route(kind));
    assert.equal(state.term, 8);
    assert.equal(state.courses.length, 8);
    assert.equal(state.phase, 'endingChoice');
    assert.equal(state.endingOptions.options.find((item) => item.id === ending).available, true);
    const finished = game.chooseEnding(state, ending).state;
    roundtrip(finished);
    assert.equal(finished.phase, 'finished');
    assert.equal(game.chooseEnding(finished, ending).ok, false);
    assert.equal(game.continueGame(finished).ok, false);
    assert.equal(game.endTerm(finished).ok, false);
  });
}

test('同一局深造与就业均可达，毕业时可以自主选择，条件少一点不开放', () => {
  const state = route('both');
  for (const id of ['ordinary', 'furtherStudy', 'employment']) assert.equal(state.endingOptions.options.find((item) => item.id === id).available, true);
  for (const id of ['furtherStudy', 'employment']) assert.equal(game.chooseEnding(state, id).ok, true);
  for (const [field, value, direction] of [['furtherStudy', 59, 'furtherStudy'], ['jobPreparation', 59, 'employment']]) {
    const modified = { ...state, [field]: value };
    assert.equal(game.evaluateEndings(modified).options.find((item) => item.id === direction).available, false);
  }
  const below = { ...state, courses: state.courses.map((course) => ({ ...course, grade: 79 })) };
  assert.equal(game.evaluateEndings(below).options.find((item) => item.id === 'furtherStudy').available, false);
  const missing = { ...state, chains: { ...state.chains, project: { ...state.chains.project, status: 'active' } } };
  assert.equal(game.evaluateEndings(missing).options.find((item) => item.id === 'furtherStudy').available, false);
});

test('保存覆盖行动后、待选事件、总结、方向选择与最终结果阶段', () => {
  const initial = game.createGame();
  roundtrip(game.executeAction(initial, 'study').state);
  const pending = game.executeAction(initial, 'applyClub').state;
  const restored = roundtrip(pending);
  assert.equal(restored.phase, 'eventPending');
  assert.equal(game.executeAction(restored, 'study').ok, false);
  assert.equal(game.endTerm(restored).ok, false);
  const resumed = game.submitEventChoice(restored, 'accept').state;
  assert.equal(game.submitEventChoice(resumed, 'accept').ok, false);
  roundtrip(game.endTerm(resumed).state);
  const choice = route('ordinary');
  roundtrip(choice);
  roundtrip(game.chooseEnding(choice, 'ordinary').state);
});

test('两个同时满足的事件完整入队，读档后顺序和奖励一致', () => {
  let state = game.createGame();
  state = nextTerm(state);
  // Boundary fixture keeps the actual phase and course count valid.
  state = { ...state, mood: 20, fitness: 60 };
  const pending = game.executeAction(state, 'exercise').state;
  assert.equal(pending.pendingEvent.id, 'roommateCare');
  assert.equal(pending.eventQueue[0].id, 'fitnessTest');
  const restored = roundtrip(pending);
  const afterFirst = game.submitEventChoice(restored, 'later').state;
  assert.equal(afterFirst.pendingEvent.id, 'fitnessTest');
  const afterSecond = game.submitEventChoice(roundtrip(afterFirst), 'participate').state;
  assert.equal(afterSecond.eventHistory.filter((entry) => ['roommateCare', 'fitnessTest'].includes(entry.event)).length, 2);
  assert.equal(afterSecond.experiences.length, 1);
  assert.equal(game.submitEventChoice(afterSecond, 'participate').ok, false);
});

test('固定随机机会、预览不消耗随机数，中途读档后随机序列连续', () => {
  const opportunities = new Set();
  for (let seed = 0; seed < 20; seed++) {
    const initial = game.createGame({ seed });
    const first = game.executeAction(initial, 'selfStudy').state;
    opportunities.add(Boolean(first.pendingEvent));
    const previewBefore = structuredClone(first.rng);
    game.previewSettlement(first);
    assert.deepEqual(first.rng, previewBefore);
    const resumed = roundtrip(resolve(first));
    const continuous = nextTerm(resolve(first));
    const loaded = nextTerm(resumed);
    assert.deepEqual(game.executeAction(continuous, 'selfStudy'), game.executeAction(loaded, 'selfStudy'));
    assert.equal(first.rng.calls, 4);
  }
  assert.equal(opportunities.size, 2);
});

test('导出的成功操作序列能精确复现整局状态', () => {
  const state = game.chooseEnding(route('both'), 'employment').state;
  const replay = game.replay({ nickname: state.nickname, seed: state.rng.seed, commands: state.history.map((entry) => ({ ...entry.command, commandId: entry.commandId })) });
  assert.equal(replay.ok, true, replay.reason);
  assert.deepEqual(replay.state, state);
});

test('正常保存保留上一份有效主档作为备份；损坏主档可显式恢复', () => {
  const storage = memoryStorage();
  const service = save.createSaveService(storage);
  const initial = game.createGame();
  assert.equal(service.save(initial).ok, true);
  const previous = storage.getItem(save.KEYS.primary);
  const advanced = game.executeAction(initial, 'study').state;
  assert.equal(service.save(advanced).ok, true);
  assert.equal(storage.getItem(save.KEYS.backup), previous);
  assert.equal(storage.getItem(save.KEYS.temporary), null);
  storage.setItem(save.KEYS.primary, '{broken');
  const newService = save.createSaveService(storage);
  const info = newService.inspect();
  assert.equal(info.primary.ok, false);
  assert.equal(info.backup.ok, true);
  assert.equal(newService.load().ok, false);
  assert.deepEqual(newService.load('backup').state, initial);
  assert.equal(storage.getItem(save.KEYS.primary), '{broken', '读取备份不静默覆盖主档');
});

test('损坏、未知版本、越界、阶段引用错误和结果篡改均被拒绝', () => {
  const storage = memoryStorage();
  const service = save.createSaveService(storage);
  service.save(game.createGame());
  const valid = JSON.parse(storage.getItem(save.KEYS.primary));
  const mutations = [
    (e) => { e.rulesVersion = 99; }, (e) => { e.saveFormatVersion = 99; },
    (e) => { e.state.energy = -1; }, (e) => { e.state.time = 13; }, (e) => { e.state.term = 9; },
    (e) => { e.state.phase = 'eventPending'; }, (e) => { e.state.counts.unknown = 1; },
    (e) => { e.state.rng.value = 0; }, (e) => { e.state.courses.push({}); },
    (e) => { e.state.chains.project.status = 'completed'; }, (e) => { e.state.history.push({}); }
  ];
  for (const change of mutations) {
    const broken = structuredClone(valid);
    change(broken);
    assert.equal(save.parse(JSON.stringify(broken)).ok, false);
  }
  assert.equal(save.parse('a'.repeat(save.MAX_BYTES + 1)).ok, false);
  assert.equal(save.parse('{"__proto__":{}}').ok, false);
  const result = game.chooseEnding(route('ordinary'), 'ordinary').state;
  result.result.average = 100;
  assert.equal(game.validateState(result).ok, false);
});

test('临时写、备份写和主档写失败均不清空当前状态或原有效主档', () => {
  for (const failKey of [save.KEYS.temporary, save.KEYS.backup, save.KEYS.primary]) {
    const storage = memoryStorage();
    const service = save.createSaveService(storage);
    const initial = game.createGame();
    assert.equal(service.save(initial).ok, true);
    const previous = storage.getItem(save.KEYS.primary);
    const write = storage.setItem;
    storage.setItem = (key, value) => { if (key === failKey) throw new Error('quota'); write(key, value); };
    const advanced = game.executeAction(initial, 'study').state;
    const before = structuredClone(advanced);
    assert.equal(service.save(advanced).ok, false);
    assert.deepEqual(advanced, before);
    assert.equal(storage.getItem(save.KEYS.primary), previous);
    assert.equal(save.parse(previous).ok, true);
  }
  assert.equal(save.createSaveService(null).save(game.createGame()).ok, false);
});

test('两标签页冲突拒绝覆盖，主动读取后可保存；临时档不自动提升', () => {
  const storage = memoryStorage();
  const a = save.createSaveService(storage);
  const b = save.createSaveService(storage);
  a.inspect(); b.inspect();
  const initial = game.createGame();
  assert.equal(a.save(initial).ok, true);
  const raw = storage.getItem(save.KEYS.primary);
  assert.equal(b.save(initial).conflict, true);
  assert.equal(storage.getItem(save.KEYS.primary), raw);
  const loaded = b.load();
  assert.equal(loaded.ok, true);
  assert.equal(b.save(game.executeAction(loaded.state, 'study').state).ok, true);
  storage.setItem(save.KEYS.temporary, raw);
  const fresh = save.createSaveService(storage);
  assert.equal(fresh.inspect().temporary, true);
  assert.deepEqual(fresh.load().state, game.executeAction(loaded.state, 'study').state);
});

test('成果确认可以免费延期或放弃；最后学期仍有免费放弃路径', () => {
  let state = game.createGame();
  for (const id of ['applyClub', 'clubWork', 'clubWork']) state = act(state, id);
  state = game.continueGame(game.endTerm(state).state).state;
  for (let term = 2; term < 8; term++) {
    assert.equal(state.pendingEvent.id, 'clubReview');
    state = game.submitEventChoice(state, 'later').state;
    assert.equal(state.chains.club.progress, 2);
    assert.equal(state.chains.club.reviewAfter, term + 1);
    while (state.pendingEvent) state = game.submitEventChoice(state, 'later').state;
    state = game.continueGame(game.endTerm(state).state).state;
  }
  assert.equal(state.term, 8);
  assert.equal(game.eventAvailability(state, 'later').ok, false);
  assert.equal(game.eventAvailability(state, 'abandon').ok, true);
  const before = { time: state.time, energy: state.energy, money: state.money };
  state = game.submitEventChoice(state, 'abandon').state;
  assert.equal(state.chains.club.status, 'missed');
  assert.equal(state.experiences.length, 0);
  assert.deepEqual({ time: state.time, energy: state.energy, money: state.money }, before);
  while (state.pendingEvent) state = game.submitEventChoice(state, 'later').state;
  assert.equal(game.endTerm(state).ok, true);
  roundtrip(state);
});

test('相同格式与规则允许程序版本标记变化；程序版本仅用于定位发布', () => {
  const state = game.createGame();
  state.appVersion = '0.3.1';
  assert.equal(game.validateState(state).ok, true);
  const service = save.createSaveService(memoryStorage());
  assert.equal(service.save(state).ok, true);
  assert.equal(service.load().state.appVersion, '0.3.1');
});

test('临时档回读失败停止保存，清理临时键失败不否认有效主档', () => {
  const storage = memoryStorage();
  const service = save.createSaveService(storage);
  const initial = game.createGame();
  assert.equal(service.save(initial).ok, true);
  const previous = storage.getItem(save.KEYS.primary);
  const read = storage.getItem;
  storage.getItem = (key) => key === save.KEYS.temporary ? '{broken' : read(key);
  assert.equal(service.save(game.executeAction(initial, 'study').state).ok, false);
  assert.equal(read(save.KEYS.primary), previous);
  storage.getItem = read;
  storage.removeItem = () => { throw new Error('cleanup'); };
  const saved = service.save(initial);
  assert.equal(saved.ok, true);
  assert.equal(saved.warning.length > 0, true);
  assert.equal(save.parse(read(save.KEYS.primary)).ok, true);
});
