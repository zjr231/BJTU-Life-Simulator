'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('./game.js');

function ready(overrides = {}) {
  const state = game.chooseBudget(game.createGame({ seed: 'economy-route' }), game.DEFAULT_BUDGET).state;
  return { ...state, ...overrides };
}
function withGrades(grades) {
  return grades.map((grade, index) => ({ term: index + 1, grade }));
}

test('奖学金按平均成绩发放，每学期一次且低于门槛不可领取', () => {
  const low = ready({ term: 2, courses: withGrades([79]) });
  assert.equal(game.availability(low, 'scholarship').ok, false);
  assert.equal(game.getAction(low, 'scholarship').income, 0);

  const normal = ready({ term: 2, courses: withGrades([85]) });
  assert.equal(game.getAction(normal, 'scholarship').income, 400);
  const first = game.executeAction(normal, 'scholarship');
  assert.equal(first.ok, true, first.reason);
  assert.equal(first.entry.changes.money, 400);
  assert.equal(game.availability(first.state, 'scholarship').ok, false);

  const top = ready({ term: 2, courses: withGrades([95]) });
  assert.equal(game.getAction(top, 'scholarship').income, 800);
});

test('竞赛奖金需要竞赛经历且本局只能领取一次', () => {
  const missing = ready({ term: 6 });
  assert.equal(game.availability(missing, 'contestPrize').ok, false);

  const state = ready({ term: 6, experiences: [{ type: 'contest', term: 5 }] });
  const first = game.executeAction(state, 'contestPrize');
  assert.equal(first.ok, true, first.reason);
  assert.equal(first.entry.changes.money, 600);
  assert.equal(game.availability(first.state, 'contestPrize').ok, false);
});

test('助研需要成绩与学习进度，按次支付并累加深造准备', () => {
  const locked = ready({ term: 5, preparation: 59, courses: withGrades([80]) });
  assert.equal(game.availability(locked, 'researchAssistant').ok, false);

  const state = ready({ term: 5, preparation: 70, courses: withGrades([80]) });
  const result = game.executeAction(state, 'researchAssistant');
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.entry.changes.money, 300);
  assert.equal(result.entry.changes.furtherStudy, 5);
  assert.equal(game.availability(result.state, 'researchAssistant').ok, true);
});

test('兴趣收入需要展演经历，社交、求职与毕业支出按成本结算', () => {
  const noShow = ready({ term: 3 });
  assert.equal(game.availability(noShow, 'creativeIncome').ok, false);
  const showcase = ready({ term: 3, experiences: [{ type: 'showcase', term: 2 }] });
  const income = game.executeAction(showcase, 'creativeIncome');
  assert.equal(income.ok, true, income.reason);
  assert.equal(income.entry.changes.money, 200);

  const dinner = game.executeAction(ready({ money: 1000 }), 'dinnerTreat');
  assert.equal(dinner.ok, true, dinner.reason);
  assert.equal(dinner.entry.changes.money, -100);

  const trip = game.executeAction(ready({ term: 6, money: 1000, jobPreparation: 0 }), 'jobTrip');
  assert.equal(trip.ok, true, trip.reason);
  assert.equal(trip.entry.changes.money, -300);
  assert.ok(trip.entry.changes.jobPreparation > 0);

  const graduation = game.executeAction(ready({ term: 8, money: 2000 }), 'graduationTrip');
  assert.equal(graduation.ok, true, graduation.reason);
  assert.equal(graduation.entry.changes.money, -1200);
  assert.ok(graduation.state.experiences.some(item => item.type === 'graduationTrip'));
  assert.equal(game.availability(graduation.state, 'graduationTrip').ok, false);
});

test('现金流只统计本学期收入与支出，预算差额和校园卡还款不重复计入', () => {
  const state = ready({ courses: withGrades([85]), cardDebt: 50 });
  const result = game.executeAction(state, 'scholarship');
  assert.equal(result.ok, true, result.reason);
  const flow = game.economySummary(result.state);
  const grant = game.currentGrant(result.state);
  assert.equal(flow.allowance, grant.allowance);
  assert.equal(flow.budget, grant.livingCost);
  assert.equal(flow.earned, 400);
  assert.equal(flow.spent, 0);
  assert.equal(flow.debt, 0);
  assert.equal(flow.net, flow.allowance - flow.budget + 400);
  assert.equal(flow.balance, result.state.money);
});

test('经济状态标签区分待还清、经济独立、月光与平稳', () => {
  const base = ready({ term: 6, money: 100 });
  assert.equal(game.economyTag({ ...base, cardDebt: 20 }).label, '待还清');
  assert.equal(game.economyTag({ ...base, history: [{ command: { operation: 'executeAction' }, changes: { money: 8000 } }] }).label, '经济独立');
  assert.equal(game.economyTag(base).label, '月光');
  assert.equal(game.economyTag({ ...base, money: 2000 }).label, '收支平稳');
});
