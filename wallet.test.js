'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const game = require('./game.js');
const saves = require('./save.js');

function seedFor(familyId, index = 0) {
  for (let i = index * 100; ; i++) if (game.familyForSeed('wallet-route-' + i).id === familyId) return 'wallet-route-' + i;
}
function roundtrip(state) {
  const data = new Map();
  const store = saves.createSaveService({ getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) });
  const saved = store.save(state);
  assert.equal(saved.ok, true, saved.reason);
  assert.deepEqual(store.load().state, state);
  return state;
}
function resolve(state, military = false) {
  while (state.pendingEvent) {
    const id = state.pendingEvent.id;
    const choice = military && id === 'military1' ? 'join' : id === 'military2' ? 'perform' : 'later';
    const result = game.submitEventChoice(state, choice, choice === 'join' ? { investment: 10 } : {});
    assert.equal(result.ok, true, id + ': ' + result.reason);
    state = result.state;
  }
  return state;
}
function pending(state, id) {
  return { ...state, phase: 'eventPending', pendingEvent: { id, term: state.term, instanceId: 'daily:' + id + ':' + state.term } };
}

test('独立种子分配四类家庭，普通家庭到账6000、预留4800、可用1200', () => {
  for (const family of game.FAMILIES) {
    const seed = seedFor(family.id);
    const state = game.createGame({ seed });
    assert.deepEqual(state, game.createGame({ seed }));
    assert.deepEqual(state.background, game.createGame({ seed, legacyEconomy: true }).background);
    assert.equal(state.rng.calls, 2);
    assert.equal(state.economy.familyId, family.id);
    assert.equal(state.money, family.termAllowance - 4800);
    assert.equal(state.economy.grants[0].allowance, family.termAllowance);
    assert.equal(state.economy.grants[0].livingCost, 4800);
    roundtrip(state);
  }
  assert.equal(game.createGame({ seed: seedFor('ordinary') }).money, 1200);
  assert.equal(game.createGame({ seed: seedFor('tight') }).money, 400);
});

test('预览、存读档和期末不再次扣费；进入新学期只拨款一次并结转余额', () => {
  let state = game.createGame({ seed: seedFor('ordinary') });
  state = resolve(game.executeAction(state, 'show').state);
  const before = structuredClone(state);
  for (let i = 0; i < 3; i++) {
    const summary = game.previewSettlement(state);
    assert.equal(summary.moneyAfter, 1160);
    assert.equal(summary.aid, 0);
    assert.equal(summary.livingCost, 4800);
    roundtrip(state);
  }
  assert.deepEqual(state, before);
  const settled = game.endTerm(state).state;
  assert.equal(settled.money, 1160);
  assert.equal(game.endTerm(settled).ok, false);
  state = resolve(game.continueGame(settled, { commandId: 'next-once' }).state);
  assert.equal(state.money, 2360);
  assert.equal(state.economy.grants.length, 2);
  assert.equal(game.continueGame(state, { commandId: 'next-once' }).ok, false);
  roundtrip(state);
  const replay = game.replay({ seed: state.rng.seed, nickname: state.nickname, commands: state.history.map(entry => ({ ...entry.command, commandId: entry.commandId })) });
  assert.deepEqual(replay.state, state);
});

test('勤工与实习各档报酬固定，不受随机数与体能档位影响', () => {
  for (let seed = 0; seed < 12; seed++) for (const fitness of [25, 50, 70, 90]) {
    for (const [id, amounts, wages] of [['work', [8, 20, 40], [100, 200, 300]], ['internshipWork', [5, 15, 30], [50, 100, 150]]]) {
      const state = { ...game.createGame({ seed }), fitness };
      if (id === 'internshipWork') state.chains.internship = { status: 'active', progress: 0, startedTerm: 1, deadline: 2, nextEligibleTerm: 1, reviewAfter: 1 };
      for (let index = 0; index < amounts.length; index++) {
        const preview = game.previewActionInvestment(state, id, amounts[index]);
        assert.equal(preview.effect.income, wages[index]);
        const result = game.executeAction(state, id, { investment: amounts[index] });
        assert.equal(result.ok, true, result.reason);
        assert.equal(result.state.money - state.money, wages[index]);
      }
    }
  }
});

test('事件收费符合新预算，免费看校园汇演与医保；普通消费不足保持原状态', () => {
  const state = game.createGame({ seed: seedFor('ordinary') });
  for (const [id, choice, cost] of [['canteen', 'queue', 10], ['memorial129', 'watch', 0], ['medicalInsurance', 'register', 0], ['drama', 'buy', 30], ['retake', 'retake', 50]]) {
    const source = pending(state, id);
    const result = game.submitEventChoice(source, choice);
    assert.equal(result.ok, true, result.reason);
    assert.equal(result.state.money, state.money - cost);
    if (cost) {
      const poor = { ...source, money: cost - 1 };
      const denied = game.submitEventChoice(poor, choice);
      assert.equal(denied.ok, false);
      assert.strictEqual(denied.state, poor);
    }
  }
  const photos = game.submitEventChoice(pending(state, 'graduation'), 'photos', { investment: 160 });
  assert.equal(photos.changes.money, -160);
  assert.equal(game.submitEventChoice(pending(state, 'graduation'), 'photos', { investment: 240 }).ok, false);
  roundtrip(photos.state);
});

test('校园卡归还扣除赔偿；余额不足仍可归还，后续工资优先偿还且可存读档', () => {
  const initial = game.createGame({ seed: seedFor('tight') });
  const full = game.submitEventChoice(pending(initial, 'cardTrace'), 'return');
  assert.equal(full.state.money, initial.money - 50);
  assert.equal(full.state.cardDebt, 0);
  const source = pending({ ...initial, money: 10 }, 'cardTrace');
  let state = game.submitEventChoice(source, 'return').state;
  assert.equal(state.phase, 'playing');
  assert.equal(state.money, 0);
  assert.equal(state.cardDebt, 40);
  roundtrip(state);
  const result = game.executeAction(state, 'work', { investment: 8 });
  assert.equal(result.entry.cardDebtPaid, 40);
  assert.equal(result.state.money, 60);
  assert.equal(result.state.cardDebt, 0);
  roundtrip(result.state);
  state = game.continueGame(game.endTerm(state).state).state;
  assert.equal(state.money, 360);
  assert.equal(state.cardDebt, 0);
  assert.equal(state.economy.grants.at(-1).debtPaid, 40);
  roundtrip(state);
});

test('真实0.5.5存档保持当学期旧规则，下学期切换，历史记录与余额不重算', () => {
  const raw = fs.readFileSync(require.resolve('./qa/legacy-wallet-v055.json'), 'utf8');
  const loaded = saves.parse(raw);
  assert.equal(loaded.ok, true, loaded.reason);
  const original = loaded.state;
  const before = structuredClone(original);
  assert.equal(original.term, 3);
  assert.equal(original.economy, undefined);
  roundtrip(original);
  const settled = game.endTerm(original).state;
  assert.equal(settled.money, original.money - 300);
  let next = resolve(game.continueGame(settled).state);
  assert.equal(next.economy.startTerm, 4);
  assert.equal(next.economy.grants.length, 1);
  assert.equal(next.money, settled.money + game.familyForSeed(next.rng.seed).termAllowance - 4800);
  assert.deepEqual(next.courses.slice(0, 2), original.courses);
  roundtrip(next);
  next = resolve(game.continueGame(game.endTerm(next).state).state);
  roundtrip(next);
  const replay = game.replay({ nickname: next.nickname, seed: next.rng.seed, legacyEconomy: true, economyStartTerm: next.economy.startTerm, commands: next.history.map(entry => ({ ...entry.command, commandId: entry.commandId })) });
  assert.deepEqual(replay.state, next);
  assert.deepEqual(original, before);
});

test('家庭、拨款、重复学期、结转、预算快照及待还款篡改被拒绝', () => {
  const original = game.continueGame(game.endTerm(game.createGame({ seed: seedFor('ordinary') })).state).state;
  const mutations = [state => state.economy.familyId = 'affluent', state => state.economy.grants.push(state.economy.grants[0]), state => state.economy.grants[0].allowance++, state => state.economy.grants[1].openingMoney++, state => state.economy.grants[1].term = 1, state => state.courses[0].budget.livingCost = 0, state => state.cardDebt = 50];
  for (const mutate of mutations) {
    const state = structuredClone(original);
    mutate(state);
    assert.equal(game.validateState(state).ok, false);
  }
});

test('转专业只改变学院，家庭与已发放预算保持不变', () => {
  const initial = game.createGame({ seed: seedFor('ordinary') });
  const source = { ...pending(initial, 'transferResult'), courses: [{ grade: 90 }] };
  const result = game.submitEventChoice(source, 'check');
  assert.equal(result.ok, true, result.reason);
  assert.notEqual(result.state.background.id, initial.background.id);
  assert.deepEqual(result.state.economy, initial.economy);
  assert.equal(result.state.money, initial.money);
});

for (const familyId of ['ordinary', 'tight']) test('八学期正常校园生活与毕业：' + familyId + (familyId === 'ordinary' ? '无需打工' : '每学期一次勤工'), () => {
  const reports = [];
  for (let index = 0; index < 5; index++) {
    let state = game.createGame({ nickname: '预算路线', seed: seedFor(familyId, index) });
    const semesters = [];
    const act = (id, investment) => {
      const result = game.executeAction(state, id, { investment });
      assert.equal(result.ok, true, familyId + ' ' + state.rng.seed + ' T' + state.term + ' ' + id + ': ' + result.reason);
      state = resolve(result.state, true);
      assert.ok(state.money >= 0);
    };
    for (let term = 1; term <= 8; term++) {
      state = resolve(state, true);
      state = game.selectCourses(state, game.coursesForTerm(term, state.background.id, state.background.major).slice(0, 3).map(item => item.id)).state;
      if (familyId === 'tight') act('work', 8);
      act('tutoring', 240);
      if (game.availability(state, 'gym', 100).ok) act('gym', 100);
      act('show');
      if (game.availability(state, 'checkup', 5).ok) act('checkup', 5);
      if (state.preparation < 30) act('study', 15);
      assert.ok(state.fitness >= 25, '维持健康');
      const exam = game.beginExam(state);
      assert.equal(exam.ok, true, exam.reason);
      const answers = exam.state.exam.questions.map((item, i) => i === 0 ? (item.answer + 1) % 4 : item.answer);
      state = game.submitExam(exam.state, answers).state;
      assert.equal(state.summary.passed, true);
      assert.equal(state.summary.aid, 0);
      semesters.push({ term, money: state.money, grade: state.summary.grade, work: state.counts.work || 0 });
      roundtrip(state);
      state = resolve(game.continueGame(state).state, true);
    }
    assert.equal(state.economy.grants.length, 8);
    assert.equal(state.endingOptions.options.find(item => item.id === 'ordinary').available, true);
    assert.equal(state.history.filter(item => item.action === 'work').length, familyId === 'ordinary' ? 0 : 8);
    state = game.chooseEnding(state, 'ordinary').state;
    roundtrip(state);
    const replay = game.replay({ nickname: state.nickname, seed: state.rng.seed, commands: state.history.map(entry => ({ ...entry.command, commandId: entry.commandId })) });
    assert.deepEqual(replay.state, state);
    reports.push({ seed: state.rng.seed, semesters, finalMoney: state.money });
  }
  if (process.env.WALLET_ROUTE_REPORT === '1') fs.writeFileSync(require('node:path').join(__dirname, 'qa', 'wallet-routes-' + familyId + '.json'), JSON.stringify(reports, null, 2));
});
