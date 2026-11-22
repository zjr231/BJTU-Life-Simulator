(function (root) {
  'use strict';

  const CAT_SPOTS = [[23, 66], [29, 48], [37, 24], [49, 40], [47, 78], [71, 31], [73, 74], [83, 57]];
  const CAT_HOME_SPOTS = {
    wumei: [18, 18],
    dunbu: [64, 16],
    tuoba: [49, 82],
    jupi: CAT_SPOTS[0],
    maolv: [82, 80],
    tangyuan: [79, 59]
  };
  const MINGHU = [61.2, 48.7];

  // Each row tracks one feature across the goose's four atlas poses.
  const GOOSE_LANDMARKS = [
    [[343, 14], [212, 116], [305, 35], [329, 77]],    // 头顶
    [[345, 54], [196, 168], [294, 61], [330, 115]],   // 眼睛之间
    [[343, 87], [193, 223], [321, 157], [329, 200]],  // 喙尖
    [[325, 64], [181, 200], [285, 111], [304, 153]],  // 喙的两侧
    [[365, 66], [224, 196], [344, 115], [356, 154]],
    [[304, 98], [242, 164], [237, 94], [277, 147]],   // 脖子上段两侧
    [[380, 98], [245, 90], [332, 115], [382, 145]],
    [[302, 153], [291, 157], [221, 148], [268, 198]], // 脖子中段两侧
    [[380, 161], [332, 78], [304, 178], [367, 201]],
    [[296, 237], [329, 208], [222, 230], [256, 254]], // 脖子接入胸口
    [[391, 236], [425, 179], [320, 201], [378, 246]],
    [[231, 247], [179, 222], [218, 228], [213, 150]], // 翼背和肩线
    [[411, 268], [460, 244], [397, 194], [418, 219]],
    [[465, 320], [504, 300], [467, 272], [448, 284]],
    [[167, 348], [69, 334], [162, 345], [130, 325]],  // 翅膀外侧
    [[488, 389], [526, 389], [512, 393], [478, 390]], // 胸腹外侧
    [[428, 478], [473, 481], [456, 481], [426, 455]],
    [[300, 484], [314, 480], [299, 472], [299, 454]], // 腹部
    [[248, 602], [248, 602], [243, 602], [226, 598]], // 双脚
    [[370, 602], [379, 602], [377, 602], [387, 599]]
  ];
  const CATS = Object.freeze({
    wumei: {
      name: '五妹', atlas: 'assets/animals/cat-wumei-v4.webp',
      special: 'assets/animals/cat-wumei-curl-sleep-v1.webp', specialCue: '呼呼呼......（睡大觉）', speechAnchor: [30, 40]
    },
    dunbu: {
      name: '墩布', atlas: 'assets/animals/cat-dunbu-v3.webp',
      special: 'assets/animals/cat-dunbu-cautious-peek-v8.webp', specialCue: '别欺负我~', speechAnchor: [24, 59]
    },
    tuoba: {
      name: '拖把', atlas: 'assets/animals/cat-tuoba-v3.webp',
      special: 'assets/animals/cat-tuoba-long-stretch-v1.webp', specialCue: '和我玩！', speechAnchor: [34, 54]
    },
    jupi: {
      name: '橘皮', atlas: 'assets/animals/cat-jupi-v10.webp',
      special: 'assets/animals/cat-jupi-paw-swipe-v1.webp', specialCue: '吃我喵喵拳！', speechAnchor: [42, 14]
    },
    maolv: {
      name: '毛驴', atlas: 'assets/animals/cat-maolv-v3.webp',
      special: 'assets/animals/cat-maolv-listening-tilt-v1.webp', specialCue: '嗯哼？（疑惑）', speechAnchor: [60, 5]
    },
    tangyuan: {
      name: '汤圆', atlas: 'assets/animals/cat-tangyuan-v3.webp',
      special: 'assets/animals/cat-tangyuan-tree-leap-v1.webp', specialCue: '看我上树~~', speechAnchor: [36, 12]
    }
  });
  const CAT_IDS = Object.keys(CATS);
  // 文字录自 assets/bjtu_cat 中物理科学与工程学院的校园介绍牌。
  const CAT_PROFILES = {
    wumei: {
      color: '#e4c6e9', sex: '女', birthYear: '2018', residence: '物理工程学院草坪、梅园',
      notes: ['头小屁股大', '随地大小睡', '汤圆的好朋猫', '五猪猪胖妹妹', '情绪稳定囧囧猫'],
      story: '五妹之所以叫五妹是因为来交大时就怀孕了，一下子生了五只猫仔，因此得名五妹。2019年，五妹的孩子们都找到了领养它们的新家庭。'
    },
    dunbu: {
      color: '#c3d8c8', sex: '男', birthYear: '2024', residence: '物理工程学院草坪',
      notes: ['委屈巴巴的囧囧猫', '橘皮小跟班', '纯种i猫', '胆小怕事又爱吃', '白天不见踪影', '夜晚出没'],
      story: '墩布因为体型敦厚，看起来非常老实巴交，被同学称为墩布。和拖把一起被称为打扫卫生组合。它是橘皮的小跟班，天天躲在橘皮身后鬼鬼祟祟。性格胆小谨慎，必须和人保持一定的安全距离。'
    },
    tuoba: {
      color: '#bde4d6', sex: '男', birthYear: '2023', residence: '物理工程学院草坪',
      notes: ['喜欢拖地的小脏包', '物理工程学院霸总', '讨厌同类', '见谁打谁', '喜欢人类', '爱车一族'],
      story: '据说是家属区老太太的宝贝儿，由于老太太年龄太大没法下楼，拖把只好流浪到交大。因为长长的毛脏兮兮的所以被同学称为拖把。一开始在七教东蹭人，后征战四方占据了物理工程学院草坪这块宝地，被大家称为老大。'
    },
    jupi: {
      color: '#f0dcc4', sex: '女', birthYear: '2019', residence: '物理工程学院草坪',
      notes: ['物理工程学院女王', '性格傲娇', '爱吃鸡胸肉', '饿了才找人贴贴', '讨厌拖把、墩布', '喜欢打猫猫拳'],
      story: '橘皮之所以叫橘皮是因为她的背部有大面积橘色斑纹，像橘皮一样。喜欢每天在竹林晒太阳，是物理工程学院的常驻居民。'
    },
    maolv: {
      color: '#c7ddf7', sex: '男', birthYear: '2016', residence: '物理工程学院草坪、梅园、嘉园打印店',
      notes: ['憨厚老实', '打印店保安', '鸡胸肉杀手', '战斗力-99', '又菜又爱玩', '谁都打不过'],
      story: '毛驴最早是校职工方阿姨在垃圾桶捡的，当时还是小奶猫，现在已经是驴叔了。小时候的毛驴非常好学调皮，喜欢到教学楼和大家一起上课，所以叫做毛驴。'
    },
    tangyuan: {
      color: '#a4e0f5', sex: '男', birthYear: '2021', residence: '物理工程学院草坪、梅园',
      notes: ['梅园霸总', '喜欢和五妹打闹', '芝麻馅（会变脏）', '喜欢跑酷会上树'],
      story: '疫情前一年，梅园突然出现了一个猫包，里面就装着汤圆（强烈谴责丢猫行为）。因为它全身雪白，异瞳非常漂亮，被大家取名为汤圆。他性格霸道，不允许其他猫来他的领地。之前被狗咬伤非常严重，在大家的救助下最后重返校园。'
    }
  };
  const GOOSE = { atlas: 'assets/animals/goose-atlas.webp', landmarks: GOOSE_LANDMARKS };
  const ATLAS_TILE = 627;
  const GRID = 9;
  const PORTRAIT_SIZE = 512;

  function appearance(species, catId) {
    if (species === 'goose') return GOOSE;
    return Object.hasOwn(CATS, catId) ? CATS[catId] : CATS.wumei;
  }

  function catArchive(catId) {
    if (!Object.hasOwn(CAT_PROFILES, catId)) return null;
    const { name, atlas } = CATS[catId];
    return {
      ...CAT_PROFILES[catId],
      name,
      atlas,
      photos: [1, 2, 3].map(number => 'assets/bjtu_cat/' + name + '/' + name + '_' + number + '.jpg')
    };
  }

  function catPosePreview(catId, pose) {
    if (!Object.hasOwn(CATS, catId)) return null;
    if (pose === 'sitting') return { asset: CATS[catId].atlas, atlas: true };
    if (pose === 'special' && CATS[catId].special) return { asset: CATS[catId].special, atlas: false };
    if (pose === 'lying' || pose === 'standing') {
      return { asset: 'assets/animals/cat-' + catId + '-' + pose + '-v1.webp', atlas: false };
    }
    return null;
  }

  function createPortrait(canvas) {
    const ctx = canvas?.getContext?.('2d');
    if (!ctx) return null;
    const createLayer = () => Object.assign(canvas.ownerDocument.createElement('canvas'),
      { width: PORTRAIT_SIZE, height: PORTRAIT_SIZE });
    const layer = createLayer();
    const painter = layer.getContext('2d');
    if (!painter) return null;
    const tiles = new Map();
    const step = PORTRAIT_SIZE / GRID;
    const grid = new Float32Array((GRID + 1) ** 2 * 2);
    canvas.width = canvas.height = PORTRAIT_SIZE;
    let current;

    function load(art) {
      tiles.set(art, null);
      const atlas = canvas.ownerDocument.createElement('img');
      atlas.onload = () => {
        const tileSize = atlas.naturalWidth / 2;
        tiles.set(art, Array.from({ length: 4 }, (_, index) => {
          const tile = createLayer();
          const tileCtx = tile.getContext('2d');
          tileCtx.drawImage(atlas, index % 2 * tileSize, Math.floor(index / 2) * tileSize,
            tileSize, tileSize, 0, 0, PORTRAIT_SIZE, PORTRAIT_SIZE);
          return tile;
        }));
        if (current?.art === art) draw();
      };
      atlas.onerror = () => tiles.delete(art);
      atlas.src = art.atlas;
    }

    function warpTriangle(tile, grid, origin, horizontal, vertical, x, y, sign) {
      const sx = grid[origin];
      const sy = grid[origin + 1];
      const sx1 = grid[horizontal] - sx;
      const sy1 = grid[horizontal + 1] - sy;
      const sx2 = grid[vertical] - sx;
      const sy2 = grid[vertical + 1] - sy;
      const det = sx1 * sy2 - sx2 * sy1;
      if (Math.abs(det) < .01) return;
      const side = step * sign;
      const a = side * sy2 / det;
      const b = -side * sy1 / det;
      const c = -side * sx2 / det;
      const d = side * sx1 / det;
      // 少量重叠盖住相邻三角形的抗锯齿缝隙。
      const edge = .6 * sign;
      painter.save();
      painter.beginPath();
      painter.moveTo(x - edge, y - edge);
      painter.lineTo(x + side + edge * 2, y - edge);
      painter.lineTo(x - edge, y + side + edge * 2);
      painter.closePath();
      painter.clip();
      painter.setTransform(a, b, c, d, x - a * sx - c * sy, y - b * sx - d * sy);
      painter.drawImage(tile, 0, 0);
      painter.restore();
    }

    function warp(tile, points, from, to) {
      const rows = GRID + 1;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < rows; col++) {
          const x = col * ATLAS_TILE / GRID;
          const y = row * ATLAS_TILE / GRID;
          let dx = 0, dy = 0, total = 0;
          for (let k = 0; k < to.length; k++) {
            const [tx, ty] = to[k];
            const distance = 560 + (x - tx) ** 2 + (y - ty) ** 2;
            const falloff = 560 / distance;
            const influence = falloff * falloff;
            dx += (points[k][from][0] - tx) * influence;
            dy += (points[k][from][1] - ty) * influence;
            total += influence;
          }
          const i = (row * rows + col) * 2;
          grid[i] = (x + dx / (total + .0008)) * PORTRAIT_SIZE / ATLAS_TILE;
          grid[i + 1] = (y + dy / (total + .0008)) * PORTRAIT_SIZE / ATLAS_TILE;
        }
      }
      painter.clearRect(0, 0, PORTRAIT_SIZE, PORTRAIT_SIZE);
      for (let row = 0; row < GRID; row++) {
        for (let col = 0; col < GRID; col++) {
          const tl = (row * rows + col) * 2;
          const tr = tl + 2;
          const bl = tl + rows * 2;
          const br = bl + 2;
          warpTriangle(tile, grid, tl, tr, bl, col * step, row * step, 1);
          warpTriangle(tile, grid, br, bl, tr, (col + 1) * step, (row + 1) * step, -1);
        }
      }
    }

    function draw() {
      const { art, weights } = current;
      const sprites = tiles.get(art);
      if (!sprites) return;
      ctx.clearRect(0, 0, PORTRAIT_SIZE, PORTRAIT_SIZE);
      const fixed = weights.indexOf(1);
      if (fixed !== -1) {
        ctx.drawImage(sprites[fixed], 0, 0);
      } else {
        const marks = art.landmarks;
        const target = marks.map(poses => [0, 1].map(axis =>
          poses.reduce((sum, point, index) => sum + point[axis] * weights[index], 0)));
        // 两张纹理在对齐后的轮廓上逐步过渡，避免在中点突然换图。
        ctx.globalCompositeOperation = 'lighter';
        weights.forEach((weight, index) => {
          if (weight < .001) return;
          warp(sprites[index], marks, index, target);
          ctx.globalAlpha = weight;
          ctx.drawImage(layer, 0, 0);
        });
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      canvas.hidden = false;
    }

    function set(species, catId, weights) {
      const art = appearance(species, catId);
      if (current?.art === art && weights.every((value, i) => value === current.weights[i])) return;
      if (current?.art !== art) canvas.hidden = true;
      current = { art, weights };
      if (!tiles.has(art)) load(art);
      draw();
    }

    return { set };
  }

  function createSystem(now, random = Math.random, { keepCatsOnMap = false } = {}) {
    const residentCats = keepCatsOnMap
      ? CAT_IDS.map(catId => {
        const [x, y] = CAT_HOME_SPOTS[catId];
        return { id: 'resident-' + catId, species: 'cat', catId, x, y };
      })
      : [];
    let current = null;
    let sequence = 0;
    let nextAt = now + 2500;

    function finish(now, encounterId) {
      if (residentCats.some(cat => cat.id === encounterId)) return;
      current = null;
      nextAt = now + 18000 + Math.floor(random() * 14000);
    }

    function tick(now, canSpawn, engaged) {
      if (engaged) return current;
      if (current && now >= current.expiresAt) finish(now);
      if (!current && canSpawn && now >= nextAt) {
        const species = !keepCatsOnMap && random() < 0.64 ? 'cat' : 'goose';
        const [x, y] = species === 'cat' ? CAT_SPOTS[Math.floor(random() * CAT_SPOTS.length)] : MINGHU;
        current = { id: ++sequence, species, x, y, expiresAt: now + 22000 };
        if (species === 'cat') current.catId = CAT_IDS[Math.floor(random() * CAT_IDS.length)];
      }
      return current;
    }

    return { residentCats, tick, finish };
  }

  const api = { CATS, appearance, catArchive, catPosePreview, createSystem, createPortrait };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CampusAnimals = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
