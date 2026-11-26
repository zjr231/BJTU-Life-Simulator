(function (root) {
  'use strict';
  // 学期与北京校园季节的对应关系：秋季学期（第 1、3、5、7 学期）秋→冬，
  // 春季学期（第 2、4、6、8 学期）春→夏。每个季节各占 6 点时间，时间走到 6 点时换季。
  const WEATHER = {
    clear: { id: 'clear', label: '晴', tone: 'clear' },
    cloudy: { id: 'cloudy', label: '多云', tone: 'cloud' },
    overcast: { id: 'overcast', label: '阴', tone: 'overcast' },
    lightRain: { id: 'lightRain', label: '小雨', tone: 'rain' },
    rain: { id: 'rain', label: '中雨', tone: 'rain' },
    shower: { id: 'shower', label: '阵雨', tone: 'rain' },
    thunder: { id: 'thunder', label: '雷阵雨', tone: 'storm' },
    storm: { id: 'storm', label: '暴雨', tone: 'storm' },
    lightSnow: { id: 'lightSnow', label: '小雪', tone: 'snow' },
    snow: { id: 'snow', label: '中雪', tone: 'snow' },
    heavySnow: { id: 'heavySnow', label: '大雪', tone: 'snow' },
    clearCold: { id: 'clearCold', label: '晴冷', tone: 'cold' },
    wind: { id: 'wind', label: '大风', tone: 'wind' },
    northWind: { id: 'northWind', label: '北风', tone: 'wind' },
    ginkgoWind: { id: 'ginkgoWind', label: '银杏大风', tone: 'wind' },
    dust: { id: 'dust', label: '沙尘', tone: 'dust' },
    dustStorm: { id: 'dustStorm', label: '沙尘暴', tone: 'dust' },
    fog: { id: 'fog', label: '雾', tone: 'fog' },
    autumnFog: { id: 'autumnFog', label: '秋雾', tone: 'fog' },
    winterFog: { id: 'winterFog', label: '冬雾', tone: 'fog' },
    catkin: { id: 'catkin', label: '杨柳絮', tone: 'catkin' },
    catkinStorm: { id: 'catkinStorm', label: '漫天飞絮', tone: 'catkin' },
    hot: { id: 'hot', label: '晴热', tone: 'heat' },
    heatWave: { id: 'heatWave', label: '桑拿天', tone: 'heat' },
    muggy: { id: 'muggy', label: '闷热', tone: 'heat' },
    autumnRain: { id: 'autumnRain', label: '连阴秋雨', tone: 'rain' },
    springRain: { id: 'springRain', label: '连阴春雨', tone: 'rain' },
    coldWave: { id: 'coldWave', label: '寒潮', tone: 'snow' },
    thunderstorm: { id: 'thunderstorm', label: '雷暴', tone: 'storm' },
    rainbow: { id: 'rainbow', label: '雨后彩虹', tone: 'rainbow' }
  };
  const SEASONS = {
    autumn: {
      id: 'autumn', name: '秋季', short: '秋', ambient: '落叶',
      normal: ['clear', 'cloudy', 'overcast', 'lightRain', 'rain', 'wind', 'fog'],
      specials: [
        { weather: 'ginkgoWind', duration: [3, 4, 6] },
        { weather: 'autumnRain', duration: [3, 4] },
        { weather: 'autumnFog', duration: [3, 4] }
      ],
      notice: '银杏大道的叶子黄透了，风一吹就落满一地。北京进入秋天，早晚开始转凉。'
    },
    winter: {
      id: 'winter', name: '冬季', short: '冬', ambient: '飘雪',
      normal: ['clearCold', 'cloudy', 'overcast', 'lightSnow', 'snow', 'northWind'],
      specials: [
        { weather: 'heavySnow', duration: [3, 4, 6] },
        { weather: 'coldWave', duration: [3, 4] },
        { weather: 'winterFog', duration: [3, 4] }
      ],
      notice: '气温降到零下，校园里开始飘雪。路面容易结冰，出门记得添衣。'
    },
    spring: {
      id: 'spring', name: '春季', short: '春', ambient: '杨絮',
      normal: ['clear', 'cloudy', 'overcast', 'lightRain', 'wind', 'fog', 'catkin', 'dust'],
      specials: [
        { weather: 'catkinStorm', duration: [3, 4, 6] },
        { weather: 'dustStorm', duration: [3, 4] },
        { weather: 'springRain', duration: [3, 4] }
      ],
      notice: '玉兰和海棠开了，北京又到了杨柳絮飘飞的季节，出门记得戴口罩。'
    },
    summer: {
      id: 'summer', name: '夏季', short: '夏', ambient: '暑气',
      normal: ['hot', 'cloudy', 'overcast', 'shower', 'thunder', 'muggy', 'rainbow'],
      specials: [
        { weather: 'storm', duration: [3, 4, 6] },
        { weather: 'heatWave', duration: [3, 4, 6] },
        { weather: 'thunderstorm', duration: [3, 4] }
      ],
      notice: '北京进入雷雨季，午后常有阵雨。出门带伞，别在树下躲雨。'
    }
  };
  // 每个季节的天气分 1～2 点一段的普通天气，以及 3～4 点或整季的季节专属天气。
  const NORMAL_PATTERNS = [
    [2, 2, 2], [2, 1, 1, 2], [1, 2, 1, 2], [1, 1, 2, 2],
    [2, 1, 2, 1], [1, 2, 2, 1], [2, 2, 1, 1], [1, 1, 1, 1, 1, 1]
  ];
  const PLANS = {
    autumn: {
      clear: [{ type: 'leaf', count: 24 }, { type: 'mote', count: 6 }],
      cloudy: [{ type: 'leaf', count: 16 }, { type: 'cloud', count: 4 }],
      overcast: [{ type: 'leaf', count: 10 }, { type: 'cloud', count: 6 }],
      lightRain: [{ type: 'leaf', count: 8 }, { type: 'rain', count: 34 }],
      rain: [{ type: 'leaf', count: 6 }, { type: 'rain', count: 56 }],
      wind: [{ type: 'leaf', count: 54 }, { type: 'wind', count: 10 }],
      fog: [{ type: 'leaf', count: 6 }, { type: 'fog', count: 10 }],
      ginkgoWind: [{ type: 'leaf', count: 76 }, { type: 'wind', count: 14 }],
      autumnRain: [{ type: 'leaf', count: 10 }, { type: 'rain', count: 72 }],
      autumnFog: [{ type: 'leaf', count: 6 }, { type: 'fog', count: 14 }]
    },
    winter: {
      clearCold: [{ type: 'snow', count: 8 }],
      cloudy: [{ type: 'snow', count: 10 }, { type: 'cloud', count: 4 }],
      overcast: [{ type: 'snow', count: 12 }, { type: 'cloud', count: 6 }],
      lightSnow: [{ type: 'snow', count: 28 }],
      snow: [{ type: 'snow', count: 48 }],
      northWind: [{ type: 'snow', count: 34 }, { type: 'wind', count: 16 }],
      heavySnow: [{ type: 'snow', count: 92 }, { type: 'wind', count: 8 }],
      coldWave: [{ type: 'snow', count: 56 }, { type: 'wind', count: 22 }],
      winterFog: [{ type: 'snow', count: 8 }, { type: 'fog', count: 14 }]
    },
    spring: {
      clear: [{ type: 'catkin', count: 20 }, { type: 'petal', count: 8 }],
      cloudy: [{ type: 'catkin', count: 14 }, { type: 'petal', count: 6 }, { type: 'cloud', count: 4 }],
      overcast: [{ type: 'catkin', count: 10 }, { type: 'petal', count: 4 }, { type: 'cloud', count: 6 }],
      lightRain: [{ type: 'rain', count: 32 }, { type: 'petal', count: 8 }],
      rain: [{ type: 'rain', count: 52 }, { type: 'petal', count: 6 }],
      wind: [{ type: 'petal', count: 26 }, { type: 'wind', count: 12 }],
      fog: [{ type: 'catkin', count: 8 }, { type: 'fog', count: 10 }],
      catkin: [{ type: 'catkin', count: 34 }, { type: 'petal', count: 10 }],
      dust: [{ type: 'dust', count: 56 }, { type: 'wind', count: 6 }],
      catkinStorm: [{ type: 'catkin', count: 78 }, { type: 'petal', count: 12 }],
      dustStorm: [{ type: 'dust', count: 100 }, { type: 'wind', count: 10 }],
      springRain: [{ type: 'rain', count: 66 }, { type: 'petal', count: 8 }]
    },
    summer: {
      hot: [{ type: 'mote', count: 14 }],
      cloudy: [{ type: 'cloud', count: 5 }, { type: 'mote', count: 4 }],
      overcast: [{ type: 'cloud', count: 7 }],
      shower: [{ type: 'rain', count: 34 }],
      thunder: [{ type: 'rain', count: 58 }],
      muggy: [{ type: 'mote', count: 16 }, { type: 'cloud', count: 3 }],
      storm: [{ type: 'rain', count: 104 }],
      heatWave: [{ type: 'mote', count: 20 }],
      thunderstorm: [{ type: 'rain', count: 82 }, { type: 'wind', count: 8 }],
      rainbow: [{ type: 'rain', count: 24 }]
    }
  };
  function pairForTerm(term) {
    return Number(term) % 2 === 1 ? ['autumn', 'winter'] : ['spring', 'summer'];
  }
  function seasonIdFor(term, time) {
    const pair = pairForTerm(term);
    return time > 6 ? pair[0] : pair[1];
  }
  function pointFor(term, time) {
    const first = time > 6;
    const elapsed = first ? 12 - time : 6 - time;
    return Math.max(0, Math.min(5, Math.floor(elapsed)));
  }
  function windowFor(term, time) {
    return { season: seasonIdFor(term, time), index: pointFor(term, time) };
  }
  // 纯函数散列：天气只由种子、学期、季节决定，不消耗游戏随机数，也不写存档。
  function hash(value) {
    let result = 2166136261;
    const text = String(value);
    for (let index = 0; index < text.length; index += 1) {
      result ^= text.charCodeAt(index);
      result = Math.imul(result, 16777619);
    }
    return result >>> 0;
  }
  function scheduleFor(seed, term) {
    const pair = pairForTerm(term);
    const schedule = [];
    for (const seasonId of pair) {
      const season = SEASONS[seasonId];
      const pattern = NORMAL_PATTERNS[hash(seed + ':pattern:' + term + ':' + seasonId) % NORMAL_PATTERNS.length];
      const pool = season.normal;
      let point = 0;
      let previous = -1;
      for (const length of pattern) {
        let index = hash(seed + ':normal:' + term + ':' + seasonId + ':' + point) % pool.length;
        if (previous >= 0 && pool.length > 1 && index === previous) index = (index + 1) % pool.length;
        previous = index;
        const weather = WEATHER[pool[index]];
        for (let step = 0; step < length; step += 1) {
          schedule.push({ weather, special: false, season: seasonId, point: point + step });
        }
        point += length;
      }
      // 约六成季节安排一次季节专属天气，持续 3～4 点，少数持续整季 6 点。
      if (hash(seed + ':special:' + term + ':' + seasonId) % 100 < 60) {
        const choice = season.specials[hash(seed + ':special-kind:' + term + ':' + seasonId) % season.specials.length];
        const duration = choice.duration[hash(seed + ':special-duration:' + term + ':' + seasonId) % choice.duration.length];
        const start = duration >= 6 ? 0 : hash(seed + ':special-start:' + term + ':' + seasonId) % (6 - duration + 1);
        const weather = WEATHER[choice.weather];
        for (let offset = start; offset < start + duration; offset += 1) {
          schedule[seasonId === pair[0] ? offset : 6 + offset] = { weather, special: true, season: seasonId, point: offset };
        }
      }
    }
    return schedule;
  }
  function weatherFor(seed, term, time) {
    const pair = pairForTerm(term);
    const season = seasonIdFor(term, time);
    const point = pointFor(term, time);
    const schedule = scheduleFor(seed, term);
    const offset = season === pair[0] ? 0 : 6;
    const entry = schedule[offset + point];
    return {
      season,
      seasonInfo: SEASONS[season],
      point,
      weather: entry.weather,
      special: entry.special,
      pair,
      schedule: schedule.slice(offset, offset + 6)
    };
  }
  function particlePlan(seasonId, weatherId) {
    const plans = PLANS[seasonId] || {};
    return (plans[weatherId] || []).map((item) => ({ ...item }));
  }
  const api = { WEATHER, SEASONS, NORMAL_PATTERNS, pairForTerm, seasonIdFor, pointFor, windowFor, hash, scheduleFor, weatherFor, particlePlan };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CampusSeason = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
