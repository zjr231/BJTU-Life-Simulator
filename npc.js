(function (root) {
  'use strict';
  // 校园偶遇 NPC 纯逻辑：身份权重、行走路线、移动与生命周期、台词库。
  // 渲染与点击对话由 app.js 负责；属于观感层，不进入存档格式。
  // 地图坐标与地标按钮一致，均为地图层的百分比坐标（左/上）。
  //
  // 道路拓扑：节点是地标路口，边是沿地图上真实道路量出的折线。
  // 折线来自地图底图的像素识别——沿路面采样、绕开建筑轮廓，
  // 因此 NPC 只会沿着道路和空地走，不会穿过教学楼。改动坐标时请对照底图核对。
  const ROAD_NODES = {
    activity: { x: 6.75, y: 31.12 },
    ginkgo: { x: 28.32, y: 35.77 },
    think: { x: 44.22, y: 28.8 },
    library: { x: 76.18, y: 43.82 },
    hospital: { x: 87.93, y: 39.34 },
    gate: { x: 30.57, y: 78.17 },
    track: { x: 44.58, y: 5.39 },
    auditorium: { x: 43.46, y: 51.62 },
    yifu: { x: 92.74, y: 73.28 },
    dorm: { x: 77.35, y: 20.66 },
    hotel: { x: 64.67, y: 62.82 }
  };
  // 每条边从 x-y 的 x 端走向 y 端；反向使用只需写 'y-x'，由 edgePoints 自动翻转。
  const ROAD_EDGES = {
    'activity-ginkgo': [
      { x: 6.75, y: 31.12 }, { x: 14.93, y: 22.9 }, { x: 23.93, y: 24.9 },
      { x: 26.79, y: 30.21 }, { x: 28.32, y: 35.77 }
    ],
    'ginkgo-think': [
      { x: 28.32, y: 35.77 }, { x: 36.2, y: 34.85 }, { x: 36.61, y: 33.53 },
      { x: 43.56, y: 31.54 }, { x: 44.22, y: 28.8 }
    ],
    'think-library': [
      { x: 44.22, y: 28.8 }, { x: 44.79, y: 35.52 }, { x: 74.64, y: 45.48 },
      { x: 76.18, y: 43.82 }
    ],
    'library-auditorium': [
      { x: 76.18, y: 43.82 }, { x: 68.92, y: 46.14 }, { x: 65.64, y: 44.15 },
      { x: 60.33, y: 56.1 }, { x: 52.97, y: 53.44 }, { x: 43.46, y: 51.62 }
    ],
    'auditorium-activity': [
      { x: 43.46, y: 51.62 }, { x: 33.33, y: 41.49 }, { x: 33.74, y: 36.18 },
      { x: 26.79, y: 30.21 }, { x: 22.29, y: 23.57 }, { x: 6.75, y: 23.57 },
      { x: 6.75, y: 31.12 }
    ],
    'gate-hotel': [
      { x: 30.57, y: 78.17 }, { x: 32.52, y: 83.32 }, { x: 38.65, y: 76.02 },
      { x: 46.42, y: 78.01 }, { x: 47.65, y: 75.35 }, { x: 54.6, y: 76.68 },
      { x: 59.1, y: 65.39 }, { x: 64.67, y: 62.82 }
    ],
    'hotel-yifu': [
      { x: 64.67, y: 62.82 }, { x: 73.42, y: 59.42 }, { x: 76.28, y: 50.12 },
      { x: 91.0, y: 54.11 }, { x: 93.46, y: 61.41 }, { x: 92.74, y: 73.28 }
    ],
    'library-yifu': [
      { x: 76.18, y: 43.82 }, { x: 76.28, y: 46.14 }, { x: 90.59, y: 54.11 },
      { x: 92.64, y: 57.43 }, { x: 92.74, y: 73.28 }
    ],
    'library-dorm': [
      { x: 76.18, y: 43.82 }, { x: 77.1, y: 36.85 }, { x: 77.35, y: 20.66 }
    ],
    'library-hospital': [
      { x: 76.18, y: 43.82 }, { x: 79.96, y: 48.8 }, { x: 86.5, y: 39.5 },
      { x: 87.93, y: 39.34 }
    ],
    'track-think': [
      { x: 44.58, y: 5.39 }, { x: 52.56, y: 18.26 }, { x: 46.01, y: 35.52 },
      { x: 43.56, y: 34.85 }, { x: 44.22, y: 28.8 }
    ]
  };

  function edgePoints(key) {
    if (ROAD_EDGES[key]) return ROAD_EDGES[key];
    const parts = key.split('-');
    const reversed = ROAD_EDGES[parts[1] + '-' + parts[0]];
    return reversed ? reversed.slice().reverse() : null;
  }

  // 路线 = 若干条边首尾相接；相邻边共用的路口只保留一个点。
  function routeOf(...keys) {
    const points = [];
    for (const key of keys) {
      const edge = edgePoints(key);
      if (!edge) throw new Error('未知道路边：' + key);
      for (const point of edge) {
        const last = points[points.length - 1];
        if (last && last.x === point.x && last.y === point.y) continue;
        points.push({ x: point.x, y: point.y });
      }
    }
    return points;
  }

  const ROUTES = {
    // 中环线：学生活动中心→银杏大道→思源楼→图书馆→天佑会堂，再沿西侧回到活动中心，绕校园一周。
    campus: routeOf('activity-ginkgo', 'ginkgo-think', 'think-library', 'library-auditorium', 'auditorium-activity'),
    // 右侧道路：南门→红果园宾馆→逸夫楼→图书馆→宿舍。
    road: routeOf('gate-hotel', 'hotel-yifu', 'yifu-library', 'library-dorm'),
    // 南门区域：南门↔红果园宾馆，保安与快递在这里巡逻取件。
    south: routeOf('gate-hotel'),
    // 宿舍生活区：宿舍↔图书馆，宿管、食堂工作人员在生活区走动。
    dormRoad: routeOf('dorm-library'),
    // 校医院区域：图书馆↔校医院。
    hospitalLine: routeOf('library-hospital'),
    // 操场区域：操场↔思源楼。
    north: routeOf('track-think')
  };
  const IDENTITIES = [
    { id: 'student', label: '学生', figure: 'student', weight: 18, route: 'campus', mode: 'loop', speed: 1.1, lines: [
      '刚下课从思源楼出来，这老师点名太狠了。你呢，最近忙啥？',
      '食堂三楼的麻辣香锅你试过没？我每周必去两次。',
      '社团那边又在招新了，大一不参加，后面时间更少，真的。',
      '这学期的课表排得我头大，你选到心仪的课了吗？'
    ] },
    { id: 'senior', label: '学长', figure: 'senior', weight: 10, route: 'campus', mode: 'loop', speed: 1.0, lines: [
      '大二开始想方向不算早。保研、考研、出国、就业，先想清楚再发力。',
      '实习别拖到大四才找，大三寒暑假是最好的窗口期。',
      '图书馆靠窗的位置最适合自习，早上八点前基本都有座。',
      '我当年就是社团玩得太疯，绩点拉了。爱好和学习要会平衡。'
    ] },
    { id: 'canteenAunt', label: '食堂阿姨', figure: 'canteen', weight: 7, route: 'dormRoad', mode: 'bounce', speed: 1.0, lines: [
      '同学，怎么才来？给你多打一勺，正长身体呢！',
      '今天的糖醋里脊是新配方，尝一口不好吃你回来找阿姨。',
      '天冷了，早饭一定要吃，热乎的包子馒头都给你留着。',
      '别总点外卖，哪有食堂干净实惠。吃好才有力气学习。'
    ] },
    { id: 'chef', label: '食堂厨师', figure: 'chef', weight: 5, route: 'dormRoad', mode: 'bounce', speed: 1.0, lines: [
      '后厨刚出锅的红烧肉，再晚五分钟就抢没了。',
      '炒菜讲究火候，急火快炒才香。',
      '同学吃辣不？今天的小炒可以加辣。',
      '窗口人多别插队，人人都有份。'
    ] },
    { id: 'dormAunt', label: '宿管阿姨', figure: 'dormAunt', weight: 6, route: 'dormRoad', mode: 'bounce', speed: 0.9, lines: [
      '晚上十一点锁门，回来晚的记得跟阿姨说一声。',
      '宿舍报修在楼下登记，今天报明天就有人来。',
      '天冷了，夜里关好窗，别着凉。',
      '查寝看到违禁电器，阿姨可要没收了啊。'
    ] },
    { id: 'lecturer', label: '任课老师', figure: 'lecturer', weight: 7, route: 'campus', mode: 'loop', speed: 1.15, lines: [
      '作业要自己写，网上抄的那几份我一眼就能看出来。',
      '这门课的难点在第三章，有问题欢迎在答疑时间来找我。',
      '平时分比重不小，认真对待每一次作业，期末会轻松很多。',
      '学习不要只为了考试。现在打下的基础，将来都会用到。'
    ] },
    { id: 'staff', label: '行政老师', figure: 'staff', weight: 5, route: 'campus', mode: 'bounce', speed: 1.05, lines: [
      '转专业、缓考这些手续要提前办，别赶在最后一天。',
      '教务系统密码记好了，查成绩、选课、办证明都靠它。',
      '盖章材料记得先看流程说明，材料齐全一次就过，大家都省时间。',
      '通知都会发在学院群和系统里，养成定期看的习惯。'
    ] },
    { id: 'professor', label: '教授', figure: 'professor', weight: 5, route: 'campus', mode: 'loop', speed: 0.9, lines: [
      '做学问急不得。把基础打牢，方向自然就清晰了。',
      '我在带一个本科生科研小组，感兴趣可以关注学院的招新。',
      '读文献是基本功，每周精读一篇，坚持一年就见分晓。',
      '年轻人要敢于提问，大学里最不缺的就是讨论的机会。'
    ] },
    { id: 'librarian', label: '图书管理员', figure: 'librarian', weight: 6, route: 'campus', mode: 'loop', speed: 1.0, lines: [
      '新到的专业书在二楼东侧，可以借一个月。',
      '自习室保持安静，手机调成震动。',
      '借书超期了？服务台可以续借，别拖着。',
      '闭馆前半小时会清场，记得收好东西。'
    ] },
    { id: 'internationalStudent', label: '留学生', figure: 'international', weight: 4, route: 'campus', mode: 'loop', speed: 1.2, lines: [
      '你好！我在学中文。你是大几的？可以教我一句北京话吗？',
      '我来自非洲，我们那里的鼓点节奏和这里很不一样，有空给你听。',
      '中文好难，但北交的老师和同学都特别耐心。',
      '我最喜欢银杏大道，秋天的时候像画一样。'
    ] },
    { id: 'security', label: '保安大叔', figure: 'security', weight: 5, route: 'south', mode: 'bounce', speed: 0.95, lines: [
      '进出校门刷脸慢一点没事，安全第一。',
      '晚上回宿舍别走太偏的路，有事随时找我们巡逻车。',
      '你们这届学生真有礼貌，见面都喊大叔。',
      '骑车带耳机听歌可不行，路口得多留神。'
    ] },
    { id: 'courier', label: '快递小哥', figure: 'courier', weight: 5, route: 'south', mode: 'bounce', speed: 1.5, lines: [
      '您的包裹到了！报一下取件码，我帮你找。',
      '今天这一片的件堆成山，大家取件都麻利点哈。',
      '易碎件我已经贴了标，拿回去路上慢点。',
      '同学你的件挺多啊，要不要推个车？'
    ] },
    { id: 'rider', label: '外卖骑手', figure: 'rider', weight: 4, route: 'road', mode: 'bounce', speed: 1.6, lines: [
      '同学你的外卖到楼下了，趁热吃。',
      '这一单送完还有三单，风里雨里都在路上。',
      '餐放取餐柜了，取件码短信发你了。',
      '骑车得慢点，汤洒了老板要扣钱的。'
    ] },
    { id: 'coach', label: '体育老师', figure: 'coach', weight: 4, route: 'north', mode: 'bounce', speed: 1.2, lines: [
      '体测八百米别偷懒，平时多来操场跑两圈。',
      '引体向上练的是背，不是胳膊，姿势要对。',
      '运动会报名快截止了，有特长的别藏着。',
      '跑完步记得拉伸，明天腿才不会酸。'
    ] },
    { id: 'doctor', label: '校医', figure: 'doctor', weight: 3, route: 'hospitalLine', mode: 'bounce', speed: 1.0, lines: [
      '最近流感多，口罩戴上，勤洗手。',
      '体温三十七度五，先观察，多喝热水。',
      '你这嗓子是熬夜熬的，少喝冰的。',
      '体检报告出来了，指标都正常，继续保持。'
    ] },
    { id: 'driver', label: '班车司机', figure: 'bus', weight: 6, route: 'road', mode: 'once', speed: 7, lifetime: [26000, 32000], lines: [
      '校车来了！去西直门、家属区的上车，别坐错方向。',
      '这班车人不多，高峰期你可得提前排队。',
      '开了这么多年车，你们一届一届我都能认个脸熟。',
      '雨天路滑，车开得慢一点，大家别催。'
    ] }
  ];
  const DEFAULTS = { lifetime: [40000, 70000], maxActive: 3, gap: [12000, 30000], firstDelay: [2500, 6000], holdAfterRoute: 1500, maxTickGap: 2000 };

  function between(random, range) { return range[0] + random() * (range[1] - range[0]); }

  function createSystem(options = {}) {
    const random = options.random || (() => Math.random());
    const settings = { ...DEFAULTS, ...(options.settings || {}) };
    const active = [];
    let nextId = 1;
    let lastTick = null;
    let nextSpawnAt = between(random, settings.firstDelay);

    function pickIdentity() {
      const total = IDENTITIES.reduce((sum, item) => sum + item.weight, 0);
      let roll = random() * total;
      for (const identity of IDENTITIES) {
        roll -= identity.weight;
        if (roll < 0) return identity;
      }
      return IDENTITIES[0];
    }

    function spawn(now) {
      const identity = pickIdentity();
      const lifetime = between(random, identity.lifetime || settings.lifetime);
      const npc = {
        id: 'npc:' + nextId++, identityId: identity.id, label: identity.label, figure: identity.figure,
        route: ROUTES[identity.route], mode: identity.mode, speed: identity.speed, lifetime,
        segment: 0, segmentElapsed: 0, direction: 1, x: ROUTES[identity.route][0].x, y: ROUTES[identity.route][0].y,
        bornAt: now, expiresAt: now + lifetime, routeDone: false, routeDoneAt: null
      };
      active.push(npc);
      return npc;
    }

    function advance(npc, dt) {
      if (npc.routeDone) return;
      // dt 是毫秒，速度是每秒走地图的百分比，先把帧长换算成秒。
      let remaining = dt / 1000 * npc.speed;
      while (remaining > 0 && !npc.routeDone) {
        const from = npc.route[npc.segment];
        let next = npc.segment + npc.direction;
        if (next < 0 || next >= npc.route.length) {
          if (npc.mode === 'loop') next = 0;
          else if (npc.mode === 'bounce') { npc.direction *= -1; next = npc.segment + npc.direction; }
          else { npc.routeDone = true; npc.x = from.x; npc.y = from.y; return; }
        }
        const target = npc.route[next];
        const length = Math.hypot(target.x - from.x, target.y - from.y);
        if (length === 0) { npc.segment = next; continue; }
        const leftOnSegment = length - npc.segmentElapsed;
        if (remaining < leftOnSegment) {
          npc.segmentElapsed += remaining;
          const ratio = npc.segmentElapsed / length;
          npc.x = from.x + (target.x - from.x) * ratio;
          npc.y = from.y + (target.y - from.y) * ratio;
          return;
        }
        remaining -= leftOnSegment;
        npc.segment = next;
        npc.segmentElapsed = 0;
        npc.x = target.x;
        npc.y = target.y;
      }
    }

    return {
      tick(now) {
        const spawned = [];
        const removed = [];
        if (lastTick === null) lastTick = now;
        const dt = Math.min(Math.max(now - lastTick, 0), settings.maxTickGap);
        lastTick = now;
        if (active.length < settings.maxActive && now >= nextSpawnAt) {
          spawned.push(spawn(now));
          nextSpawnAt = now + between(random, settings.gap);
        }
        for (const npc of active) {
          advance(npc, dt);
          if (npc.routeDone && npc.routeDoneAt === null) npc.routeDoneAt = now;
          // 路线走完并停留片刻后离场；寿命到期直接离场。都交给界面做淡出。
          if (now >= npc.expiresAt || (npc.routeDoneAt !== null && now >= npc.routeDoneAt + settings.holdAfterRoute)) removed.push(npc);
        }
        for (const npc of removed) active.splice(active.indexOf(npc), 1);
        return { spawned, removed };
      },
      active: () => active.map((npc) => ({ ...npc })),
      count: () => active.length
    };
  }

  function linesFor(identityId) {
    const identity = IDENTITIES.find((item) => item.id === identityId);
    return identity ? identity.lines : [];
  }

  const api = { IDENTITIES, ROUTES, ROAD_NODES, ROAD_EDGES, DEFAULTS, createSystem, linesFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CampusNpc = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
