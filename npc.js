(function (root) {
  'use strict';
  // 校园偶遇 NPC 纯逻辑：身份权重、行走路线、移动与生命周期、台词库。
  // 渲染与点击对话由 app.js 负责；属于观感层，不进入存档格式。
  // 地图坐标与地标按钮一致，均为地图层的百分比坐标（左/上）。
  //
  // 道路拓扑：节点是紧贴地标的道路路口，边是沿插画底图上真实道路描出的折线。
  // 坐标对着底图逐段核对过：折线走沥青路和铺装步道，绕开建筑与水面；
  // 节点放在建筑旁的道路上，而不是地标气泡本身，人物不会走到楼里或图外。
  // 改动坐标时请打开页面里的「路线图」开关，对照底图核对。
  const ROAD_NODES = {
    activity: { x: 17.57, y: 54.64 },
    ginkgo: { x: 23.5, y: 37.94 },
    think: { x: 45.5, y: 36.31 },
    library: { x: 64.93, y: 43.74 },
    hospital: { x: 83.93, y: 52.44 },
    gate: { x: 36.43, y: 74.71 },
    track: { x: 50.29, y: 23.32 },
    auditorium: { x: 46.36, y: 56.5 },
    yifu: { x: 84.21, y: 71.23 },
    dorm: { x: 74.79, y: 30.16 },
    hotel: { x: 54.0, y: 68.1 },
  };
  const ROAD_EDGES = {
    'activity-ginkgo': [{ x: 17.57, y: 54.64 }, { x: 23.5, y: 37.94 }],
    'ginkgo-think': [{ x: 23.5, y: 37.94 }, { x: 27.57, y: 26.68 }, { x: 45.5, y: 34.8 }, { x: 45.86, y: 35.15 }, { x: 45.5, y: 36.31 }],
    'think-library': [{ x: 45.5, y: 36.31 }, { x: 46.0, y: 35.03 }, { x: 64.93, y: 43.74 }],
    'library-auditorium': [{ x: 64.93, y: 43.74 }, { x: 53.14, y: 38.4 }, { x: 46.36, y: 56.5 }],
    'auditorium-activity': [{ x: 46.36, y: 56.5 }, { x: 47.86, y: 52.67 }, { x: 47.93, y: 51.86 }, { x: 32.36, y: 44.43 }, { x: 28.07, y: 55.1 }, { x: 17.57, y: 54.64 }],
    'gate-hotel': [{ x: 36.43, y: 74.71 }, { x: 40.29, y: 63.92 }, { x: 43.07, y: 65.31 }, { x: 44.14, y: 62.76 }, { x: 54.0, y: 68.1 }],
    'hotel-yifu': [{ x: 54.0, y: 68.1 }, { x: 56.71, y: 69.37 }, { x: 61.14, y: 58.0 }, { x: 71.43, y: 63.23 }, { x: 72.29, y: 60.79 }, { x: 75, y: 60.2 }, { x: 78, y: 61.0 }, { x: 81, y: 62.8 }, { x: 84, y: 65.2 }, { x: 85.43, y: 67.4 }, { x: 85.5, y: 67.98 }, { x: 84.21, y: 71.23 }],
    'library-yifu': [{ x: 64.93, y: 43.74 }, { x: 76.14, y: 48.84 }, { x: 76.0, y: 50.0 }, { x: 72.29, y: 60.79 }, { x: 75, y: 60.2 }, { x: 78, y: 61.0 }, { x: 81, y: 62.8 }, { x: 84, y: 65.2 }, { x: 85.43, y: 67.4 }, { x: 85.5, y: 67.98 }, { x: 84.21, y: 71.23 }],
    'library-dorm': [{ x: 64.93, y: 43.74 }, { x: 66.43, y: 44.2 }, { x: 72.14, y: 28.89 }, { x: 74.79, y: 30.16 }],
    'library-hospital': [{ x: 64.93, y: 43.74 }, { x: 83.93, y: 52.44 }],
    'track-think': [{ x: 50.29, y: 23.32 }, { x: 45.5, y: 36.31 }],
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
    { id: 'student', label: '学生', figure: 'student', weight: 14, route: 'campus', mode: 'loop', speed: 1.1, lines: [
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
    { id: 'seniorGirl', label: '学姐', figure: 'seniorGirl', weight: 4, route: 'campus', mode: 'loop', speed: 1.05, lines: [
      '选课别光看给分，先想想这门课和你想走的方向有没有关系。',
      '考研英语要早点开始背单词，临到考前再抱佛脚来不及的。',
      '我保研那年最庆幸的是大二就把六级过了，后面轻松不少。',
      '找实习前先把简历改两遍，写清楚你做了什么、结果怎么样。'
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
    { id: 'driver', label: '班车司机', figure: 'bus', weight: 6, route: 'road', mode: 'once', speed: 7, lifetime: [24000, 30000], lines: [
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

  // 本地启发式对话质量评分（0/1/2）：在线中转不可用或未返回质量标记时的兜底。
  // 问候、提问、礼貌称呼、消息长度各计分，综合分决定档位；只是粗略分层，防刷靠次数上限。
  function heuristicQuality(text) {
    const value = String(text || '').trim();
    if (!value) return 0;
    let score = 0;
    if (/(你好|您好|嗨|哈喽|hi|hello|早上好|下午好|晚上好)/i.test(value)) score++;
    if (/[？?]|吗|怎么|如何|为什么|什么|哪|几|推荐|建议|请教|请问|能不能|可不|帮我/i.test(value)) score++;
    if (/请|谢谢|您|麻烦|辛苦|同学|老师|学长|学姐|阿姨|大叔|师傅/.test(value)) score++;
    const length = [...value].length;
    if (length >= 10) score++;
    if (length >= 25) score++;
    return score >= 4 ? 2 : score >= 2 ? 1 : 0;
  }

  const api = { IDENTITIES, ROUTES, ROAD_NODES, ROAD_EDGES, DEFAULTS, createSystem, linesFor, heuristicQuality };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CampusNpc = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
