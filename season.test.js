'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const season = require('./season.js');

test('学期与季节映射：秋季学期秋→冬，春季学期春→夏', () => {
  for (const term of [1, 3, 5, 7]) {
    assert.equal(season.seasonIdFor(term, 12), 'autumn');
    assert.equal(season.seasonIdFor(term, 7), 'autumn');
    assert.equal(season.seasonIdFor(term, 6), 'winter');
    assert.equal(season.seasonIdFor(term, 1), 'winter');
  }
  for (const term of [2, 4, 6, 8]) {
    assert.equal(season.seasonIdFor(term, 12), 'spring');
    assert.equal(season.seasonIdFor(term, 7), 'spring');
    assert.equal(season.seasonIdFor(term, 6), 'summer');
    assert.equal(season.seasonIdFor(term, 1), 'summer');
  }
});

test('每个季节占 6 点时间，普通天气每 1～2 点切换，专属天气持续 3～4 点或整季', () => {
  assert.deepEqual([12, 11, 10, 9, 8, 7].map((time) => season.pointFor(1, time)), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual([6, 5, 4, 3, 2, 1].map((time) => season.pointFor(1, time)), [0, 1, 2, 3, 4, 5]);
  const schedule = season.scheduleFor('schedule-seed', 1);
  assert.equal(schedule.length, 12);
  for (const seasonId of ['autumn', 'winter']) {
    const points = schedule.filter((entry) => entry.season === seasonId);
    assert.equal(points.length, 6);
    let run = 0;
    for (const entry of points) {
      if (entry.special) { run = 0; continue; }
      run += 1;
      assert.ok(run <= 2, seasonId + ' 普通天气应每 1～2 点切换，实际连续 ' + run);
    }
  }
  let sawSpecial = false;
  for (let seedIndex = 0; seedIndex < 40; seedIndex += 1) {
    const entries = season.scheduleFor('special-seed-' + seedIndex, 1);
    for (const seasonId of ['autumn', 'winter']) {
      const points = entries.filter((entry) => entry.season === seasonId);
      let run = 0;
      for (let index = 0; index < points.length; index += 1) {
        if (!points[index].special) { run = 0; continue; }
        run += 1;
        sawSpecial = true;
        if (!points[index + 1] || !points[index + 1].special) {
          assert.ok([3, 4, 6].includes(run), '专属天气时长应为 3～4 或整季，实际 ' + run);
        }
      }
    }
  }
  assert.ok(sawSpecial, '应能抽到季节专属天气');
});

test('天气由种子与学期稳定决定，且不是每个季节都有专属天气', () => {
  assert.equal(JSON.stringify(season.weatherFor('seed-a', 1, 12)), JSON.stringify(season.weatherFor('seed-a', 1, 12)));
  let withSpecial = 0;
  let withoutSpecial = 0;
  for (let index = 0; index < 60; index += 1) {
    const info = season.weatherFor('weather-seed-' + index, 1, 6);
    if (info.special) withSpecial += 1;
    else withoutSpecial += 1;
    if (info.special) assert.ok(info.seasonInfo.specials.some((item) => item.weather === info.weather.id));
    else assert.ok(info.seasonInfo.normal.includes(info.weather.id));
  }
  assert.ok(withSpecial > 0, '应有季节抽到专属天气');
  assert.ok(withoutSpecial > 0, '不是每个季节都应有专属天气');
  for (const id of ['autumn', 'winter', 'spring', 'summer']) {
    assert.ok(season.SEASONS[id].normal.length >= 5, id + ' 普通天气类型应足够多');
    assert.ok(season.SEASONS[id].specials.length >= 3, id + ' 专属天气类型应足够多');
  }
  assert.ok(Object.keys(season.WEATHER).length >= 20, '天气类型总数应足够多');
});

test('四季粒子计划覆盖落叶、飘雪、杨柳絮、降雨、沙尘和雾', () => {
  const plans = [
    ['autumn', 'ginkgoWind', 'leaf'],
    ['autumn', 'cloudy', 'cloud'],
    ['winter', 'heavySnow', 'snow'],
    ['winter', 'winterFog', 'fog'],
    ['spring', 'catkinStorm', 'catkin'],
    ['spring', 'dustStorm', 'dust'],
    ['summer', 'storm', 'rain'],
    ['summer', 'rainbow', 'rain']
  ];
  for (const [seasonId, weatherId, type] of plans) {
    assert.ok(season.particlePlan(seasonId, weatherId).some((item) => item.type === type), seasonId + '/' + weatherId + ' 缺少 ' + type);
  }
  assert.ok(season.particlePlan('summer', 'storm').find((item) => item.type === 'rain').count > 90);
});
