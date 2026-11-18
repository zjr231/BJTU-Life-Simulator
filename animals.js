(function (root) {
  'use strict';

  const CAT_SPOTS = [[23, 66], [29, 48], [37, 24], [49, 40], [47, 78], [71, 31], [73, 74], [83, 57]];
  const MINGHU = [61.2, 48.7];

  // 每行是同一个部位在警觉、放松、受抚摸、受惊四张素材中的位置。
  // 坐标以 627 像素的单张图为基准，已经包含图片在画布内的对齐量。
  const ATLAS_TILE = 627;
  const FEATURES = {
    cat: [
      [[95, 106], [157, 53], [152, 73], [145, 101]],    // 耳尖
      [[451, 130], [421, 36], [440, 21], [431, 100]],
      [[174, 147], [182, 124], [217, 140], [173, 110]], // 耳根
      [[396, 156], [384, 111], [396, 114], [402, 108]],
      [[320, 66], [291, 67], [309, 45], [308, 42]],     // 背部最高处
      [[196, 247], [252, 200], [267, 163], [241, 118]], // 眼睛
      [[309, 249], [370, 194], [398, 146], [364, 114]],
      [[244, 322], [321, 251], [361, 188], [306, 163]], // 鼻尖
      [[250, 413], [322, 397], [330, 345], [309, 338]], // 胸口
      [[95, 278], [84, 275], [103, 327], [85, 316]],    // 身体轮廓
      [[475, 298], [481, 281], [505, 322], [497, 309]],
      [[192, 531], [208, 528], [234, 535], [218, 551]], // 左前爪
      [[361, 528], [367, 522], [389, 526], [413, 417]], // 右前爪
      [[465, 423], [493, 412], [481, 448], [463, 462]], // 尾根
      [[572, 438], [554, 487], [500, 466], [456, 476]],
      [[616, 383], [465, 484], [489, 484], [440, 494]]  // 尾尖
    ],
    goose: [
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
    ]
  };
  const CAT_OFFSETS = [[17, 0], [0, 0], [-19, -6], [0, -12]];
  const GRID = 14;
  const PORTRAIT_SIZE = 512;

  function createPortrait(canvas) {
    const ctx = canvas?.getContext?.('2d');
    if (!ctx) return null;
    const createLayer = () => Object.assign(canvas.ownerDocument.createElement('canvas'),
      { width: PORTRAIT_SIZE, height: PORTRAIT_SIZE });
    const layer = createLayer();
    const painter = layer.getContext('2d');
    if (!painter) return null;
    const tiles = {};
    const step = PORTRAIT_SIZE / GRID;
    const grid = new Float32Array((GRID + 1) ** 2 * 2);
    canvas.width = canvas.height = PORTRAIT_SIZE;
    let current;

    function load(species) {
      tiles[species] = null;
      const atlas = canvas.ownerDocument.createElement('img');
      atlas.onload = () => {
        const tileSize = atlas.naturalWidth / 2;
        tiles[species] = Array.from({ length: 4 }, (_, index) => {
          const tile = createLayer();
          const tileCtx = tile.getContext('2d');
          const [x, y] = species === 'cat' ? CAT_OFFSETS[index] : [0, 0];
          const mirror = species === 'cat' && index === 0;
          const scale = PORTRAIT_SIZE / ATLAS_TILE;
          tileCtx.translate(x * scale + (mirror ? PORTRAIT_SIZE : 0), y * scale);
          if (mirror) tileCtx.scale(-1, 1);
          tileCtx.drawImage(atlas, index % 2 * tileSize, Math.floor(index / 2) * tileSize,
            tileSize, tileSize, 0, 0, PORTRAIT_SIZE, PORTRAIT_SIZE);
          return tile;
        });
        if (current?.species === species) draw();
      };
      atlas.src = species === 'cat' ? 'assets/animals/cat-atlas-hiss.webp' : 'assets/animals/goose-atlas.webp';
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
      const { species, weights } = current;
      const sprites = tiles[species];
      if (!sprites) return;
      ctx.clearRect(0, 0, PORTRAIT_SIZE, PORTRAIT_SIZE);
      const fixed = weights.indexOf(1);
      if (fixed !== -1) {
        ctx.drawImage(sprites[fixed], 0, 0);
      } else {
        const marks = FEATURES[species];
        const target = marks.map(poses => [0, 1].map(axis =>
          poses.reduce((sum, point, index) => sum + point[axis] * weights[index], 0)));
        // 两张纹理在对齐后的轮廓上逐步过渡，避免在中点突然换图。
        const opacity = weights.map(weight => weight ** 1.8);
        const total = opacity.reduce((sum, value) => sum + value, 0);
        ctx.globalCompositeOperation = 'lighter';
        opacity.forEach((value, index) => {
          if (value / total < .001) return;
          warp(sprites[index], marks, index, target);
          ctx.globalAlpha = value / total;
          ctx.drawImage(layer, 0, 0);
        });
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      canvas.hidden = false;
    }

    function set(species, weights) {
      if (current?.species === species && weights.every((value, i) => value === current.weights[i])) return;
      if (current?.species !== species) canvas.hidden = true;
      current = { species, weights };
      if (!(species in tiles)) load(species);
      draw();
    }

    return { set };
  }

  function createSystem(now, random = Math.random) {
    let current = null;
    let sequence = 0;
    let nextAt = now + 2500;

    function finish(now) {
      current = null;
      nextAt = now + 18000 + Math.floor(random() * 14000);
    }

    function tick(now, canSpawn, engaged) {
      if (engaged) return current;
      if (current && now >= current.expiresAt) finish(now);
      if (!current && canSpawn && now >= nextAt) {
        const species = random() < 0.64 ? 'cat' : 'goose';
        const [x, y] = species === 'cat' ? CAT_SPOTS[Math.floor(random() * CAT_SPOTS.length)] : MINGHU;
        current = { id: ++sequence, species, x, y, expiresAt: now + 22000 };
      }
      return current;
    }

    return { tick, finish };
  }

  const api = { createSystem, createPortrait };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CampusAnimals = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
