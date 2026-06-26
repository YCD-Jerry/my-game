const TILE = 32;
const COLS = 64;
const ROWS = 64;

const canvas = document.getElementById('game');
const ctx    = canvas.getContext('2d');

function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// ── Tile types ───────────────────────────────────────────────────────────────
const T = { GRASS: 0, TREE: 1, WATER: 2, SAND: 3, PINE: 4, PALM: 5 };

// ── Colour palettes ──────────────────────────────────────────────────────────
const GRASS_COLORS = ['#4a7c3f', '#4f8444', '#558b48', '#4a7c3f', '#527f42'];
const WATER_COLORS = ['#2a6fa8', '#2e78b5', '#2563a0', '#2a6fa8'];
const SAND_COLORS  = ['#c8a84b', '#d2b45c', '#bf9c40', '#cdac50', '#d8bd6a'];

// ── UI ───────────────────────────────────────────────────────────────────────
const UI_FONT = '-apple-system,"SF Pro Display","SF Pro Text",system-ui,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif';

function roundRectPath(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y,     x + w, y + h, r);
  g.arcTo(x + w, y + h, x,     y + h, r);
  g.arcTo(x,     y + h, x,     y,     r);
  g.arcTo(x,     y,     x + w, y,     r);
  g.closePath();
}

// ── Map / decoration / chest data ────────────────────────────────────────────
const map        = [];
const seed       = [];
const decorations = [];

const chests = [
  { col: 12, row: 20, open: false },
  { col: 38, row: 10, open: false },
  { col: 22, row: 42, open: false },
];
const chestMap = {};
for (const ch of chests) chestMap[`${ch.col},${ch.row}`] = ch;

const inventory  = { gold: 0, diamond: 0, redflower: 0 };
let   lootMessage = null; // { text, timer }

const digSpot = { col: Math.floor(64 / 2), row: 35, dug: false, chestOpen: false };

// ── Ponds ────────────────────────────────────────────────────────────────────
const ponds = [
  { cx: 10, cy: 8,  rx: 4, ry: 3 },
  { cx: 35, cy: 15, rx: 5, ry: 4 },
  { cx: 20, cy: 38, rx: 3, ry: 3 },
];

// ── Washington Monument ───────────────────────────────────────────────────────
const MON_CX         = Math.floor(COLS / 2);
const MON_CENTER_X   = MON_CX * TILE + TILE / 2;
const MON_BASE_BOTTOM = 34 * TILE;
const MON_TOP        = MON_BASE_BOTTOM - 470;

const monumentBlocked = {};
for (let c = MON_CX - 1; c <= MON_CX + 1; c++) {
  for (let r = 32; r <= 33; r++) monumentBlocked[`${c},${r}`] = true;
}

function monumentXBoundsAt(worldY) {
  const cx         = MON_CENTER_X;
  const bot        = MON_BASE_BOTTOM;
  const shaftBotY  = bot - 38;
  const shaftTopY  = MON_TOP + 42;
  const BW = 30, TW = 22;
  if (worldY > bot || worldY < MON_TOP) return null;
  if (worldY >= bot - 40) {
    return worldY >= bot - 22
      ? { left: cx - 54, right: cx + 54 }
      : { left: cx - 44, right: cx + 44 };
  }
  if (worldY > shaftTopY) {
    const t  = (worldY - shaftBotY) / (shaftTopY - shaftBotY);
    const hw = BW + (TW - BW) * t;
    return { left: cx - hw, right: cx + hw };
  }
  const t = (worldY - shaftTopY) / (MON_TOP - shaftTopY);
  return { left: cx - TW * (1 - t), right: cx + TW * (1 - t) };
}

// ── Shanghai Enchanted Storybook Castle ───────────────────────────────────────
const CASTLE_CX   = 16 * TILE + TILE / 2;  // world x = 528
const CASTLE_BASE = MON_BASE_BOTTOM;

const castleBlocked = {};
for (let c = 10; c <= 22; c++) {
  for (let r = 31; r <= 33; r++) castleBlocked[`${c},${r}`] = true;
}

const castleImg = new Image();
castleImg.src   = 'castle_clean.png';

// ── RNG helper ────────────────────────────────────────────────────────────────
function rng(x, y, s) {
  const n = Math.sin(x * 127.1 + y * 311.7 + s * 74.3) * 43758.5453;
  return n - Math.floor(n);
}

// ── Bridge tile index (populated in buildMap) ─────────────────────────────────
const bridgeTileIndex = {};

// ── Map generation ────────────────────────────────────────────────────────────
function buildMap() {
  // Start with grass
  for (let r = 0; r < ROWS; r++) {
    map[r]  = [];
    seed[r] = [];
    for (let c = 0; c < COLS; c++) {
      map[r][c]  = T.GRASS;
      seed[r][c] = Math.floor(rng(c, r, 1) * 5);
    }
  }

  // Carve ponds
  for (const p of ponds) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const dx = (c - p.cx) / p.rx;
        const dy = (r - p.cy) / p.ry;
        if (dx * dx + dy * dy <= 1) {
          map[r][c]  = T.WATER;
          seed[r][c] = Math.floor(rng(c, r, 9) * 4);
        }
      }
    }
  }

  // Sand shore (one tile wide around each pond)
  const toSand = [];
  const ortho  = [[-1,0],[1,0],[0,-1],[0,1]];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (map[r][c] !== T.GRASS) continue;
      for (const [dr, dc] of ortho) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && map[nr][nc] === T.WATER) {
          toSand.push([r, c]);
          break;
        }
      }
    }
  }
  for (const [r, c] of toSand) {
    map[r][c]  = T.SAND;
    seed[r][c] = Math.floor(rng(c, r, 3) * 5);
  }

  // Tree clusters (deciduous)
  const treeClusters = [
    { cx: 5,  cy: 5,  n: 14 },
    { cx: 55, cy: 5,  n: 14 },
    { cx: 5,  cy: 55, n: 12 },
    { cx: 58, cy: 55, n: 12 },
    { cx: 18, cy: 12, n: 10 },
    { cx: 48, cy: 12, n: 10 },
    { cx: 8,  cy: 45, n: 10 },
    { cx: 55, cy: 40, n: 10 },
    { cx: 40, cy: 50, n: 12 },
    { cx: 28, cy: 55, n: 8  },
  ];
  for (const cl of treeClusters) {
    for (let i = 0; i < cl.n; i++) {
      const angle = rng(i, cl.cx, cl.cy) * Math.PI * 2;
      const dist  = rng(i, cl.cy, cl.cx) * 5;
      const c = Math.round(cl.cx + Math.cos(angle) * dist);
      const r = Math.round(cl.cy + Math.sin(angle) * dist);
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS && map[r][c] === T.GRASS)
        map[r][c] = T.TREE;
    }
  }

  // Pine clusters (northern)
  const pineClusters = [
    { cx: 12, cy: 25, n: 8 },
    { cx: 50, cy: 25, n: 8 },
    { cx: 6,  cy: 18, n: 6 },
    { cx: 58, cy: 18, n: 6 },
  ];
  for (const cl of pineClusters) {
    for (let i = 0; i < cl.n; i++) {
      const angle = rng(i + 100, cl.cx, cl.cy) * Math.PI * 2;
      const dist  = rng(i + 100, cl.cy, cl.cx) * 4;
      const c = Math.round(cl.cx + Math.cos(angle) * dist);
      const r = Math.round(cl.cy + Math.sin(angle) * dist);
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS && map[r][c] === T.GRASS)
        map[r][c] = T.PINE;
    }
  }

  // Palm trees near sandy shores
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (map[r][c] !== T.GRASS) continue;
      // Check if near sand
      let nearSand = false;
      for (const [dr, dc] of ortho) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && map[nr][nc] === T.SAND) {
          nearSand = true; break;
        }
      }
      if (nearSand && rng(c, r, 77) < 0.18) map[r][c] = T.PALM;
    }
  }

  // Keep chest tiles clear
  for (const ch of chests) {
    if (map[ch.row][ch.col] !== T.GRASS) map[ch.row][ch.col] = T.GRASS;
  }

  // Keep monument plinth clear
  for (const key in monumentBlocked) {
    const [c, r] = key.split(',').map(Number);
    map[r][c] = T.GRASS;
  }

  // Keep castle area clear (cols 8-25, rows 27-34)
  for (let c = 8; c <= 25; c++) {
    for (let r = 27; r <= 34; r++) {
      if (map[r][c] !== T.GRASS) map[r][c] = T.GRASS;
    }
  }

  // Scatter flowers and sunflowers on grass
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (map[r][c] !== T.GRASS) continue;
      if (chestMap[`${c},${r}`])       continue;
      if (monumentBlocked[`${c},${r}`]) continue;
      if (castleBlocked[`${c},${r}`])   continue;
      const v = rng(c, r, 42);
      if      (v < 0.03) decorations.push({ col: c, row: r, type: 'sunflower' });
      else if (v < 0.09) decorations.push({ col: c, row: r, type: 'flower' });
    }
  }

  // Initialise bridge tiles for each pond
  for (const p of ponds) {
    const tiles = [];
    // North-south bridge through pond centre column
    const southRow = p.cy + Math.ceil(p.ry);
    const northRow = p.cy - Math.ceil(p.ry);
    for (let r = southRow; r >= northRow; r--) {
      tiles.push({ col: p.cx, row: r });
    }
    p.bridge      = tiles;
    p.grow        = 0;
    p.rainbow     = false;
    p.rainbowAnim = 0;
    p.center      = { col: p.cx, row: p.cy };
    tiles.forEach((t, i) => { bridgeTileIndex[`${t.col},${t.row}`] = { pond: p, index: i }; });
  }
}
buildMap();

// ── Player ────────────────────────────────────────────────────────────────────
const SPEED = 3;
const player = {
  col: 32, row: 40,
  px:  32 * TILE, py: 40 * TILE,
  targetCol: 32, targetRow: 40,
  moving: false, facing: 'up',
  frame: 0, frameTimer: 0,
};
let tick = 0;
let camX = 0, camY = 0;

// ── Input ─────────────────────────────────────────────────────────────────────
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.key] = true;
  if ((e.key === 'f' || e.key === 'F') && !e.repeat) {
    tryOpenChest();
    tryDigOrOpenFancy();
  }
});
window.addEventListener('keyup', e => { keys[e.key] = false; });

// ── Walkability ───────────────────────────────────────────────────────────────
function isWalkable(r, c) {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
  const _mapCh = chestMap[`${c},${r}`];
  if (_mapCh && !_mapCh.open)        return false;
  if (monumentBlocked[`${c},${r}`])  return false;
  if (castleBlocked[`${c},${r}`])    return false;
  const t = map[r][c];
  if (t === T.WATER) {
    const b = bridgeTileIndex[`${c},${r}`];
    return !!(b && b.pond.grow >= b.index + 1);
  }
  return t !== T.TREE && t !== T.PINE && t !== T.PALM;
}

// ── Chest interactions ────────────────────────────────────────────────────────
function tryOpenChest() {
  for (const ch of chests) {
    if (ch.open) continue;
    const d = Math.max(Math.abs(ch.col - player.col), Math.abs(ch.row - player.row));
    if (d <= 1) {
      ch.open = true;
      ch.disappearTimer = 240;
      const gold    = Math.floor(Math.random() * 10) + 1;
      const diamond = Math.floor(Math.random() * 10) + 1;
      inventory.gold      += gold;
      inventory.diamond   += diamond;
      inventory.redflower += 1;
      lootMessage = { text: `宝箱！金币 x${gold}  钻石 x${diamond}  小红花 x1`, timer: 200 };
      return;
    }
  }
}

function tryDigOrOpenFancy() {
  const d = Math.max(Math.abs(digSpot.col - player.col), Math.abs(digSpot.row - player.row));
  if (d > 1) return;
  if (!digSpot.dug) { digSpot.dug = true; return; }
  if (!digSpot.chestOpen) {
    digSpot.chestOpen     = true;
    digSpot.disappearTimer = 240;
    const gold    = Math.floor(Math.random() * 13) + 3;
    const diamond = Math.floor(Math.random() * 13) + 3;
    inventory.gold      += gold;
    inventory.diamond   += diamond;
    inventory.redflower += 2;
    lootMessage = { text: `精致宝箱！金币 x${gold}  钻石 x${diamond}  小红花 x2`, timer: 240 };
  }
}

// ── Tile drawing ──────────────────────────────────────────────────────────────
function drawGrass(g, x, y, s) {
  g.fillStyle = GRASS_COLORS[s % GRASS_COLORS.length];
  g.fillRect(x, y, TILE, TILE);
  if (s === 1 || s === 3) {
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.fillRect(x + 3, y + 3, 12, 8);
  }
  // sparse dark blades
  g.fillStyle = 'rgba(0,0,0,0.07)';
  const bx = (s * 7) % 20, by2 = (s * 11) % 18;
  g.fillRect(x + bx,      y + by2,      1, 4);
  g.fillRect(x + bx + 10, y + by2 + 6,  1, 4);
}

function drawWaterBase(g, x, y, s) {
  g.fillStyle = WATER_COLORS[s % WATER_COLORS.length];
  g.fillRect(x, y, TILE, TILE);
  // animated ripple using global tick
  g.strokeStyle = 'rgba(255,255,255,0.18)';
  g.lineWidth = 1;
  const phase = ((tick >> 2) + s * 3) % 16;
  for (let i = 0; i < 2; i++) {
    const ry = y + 6 + i * 12 + (phase % 8);
    g.beginPath();
    g.moveTo(x + 2, ry);
    g.quadraticCurveTo(x + 9,  ry - 2, x + 16, ry);
    g.quadraticCurveTo(x + 23, ry + 2, x + 30, ry);
    g.stroke();
  }
}

function drawSand(g, x, y, s) {
  g.fillStyle = SAND_COLORS[s % SAND_COLORS.length];
  g.fillRect(x, y, TILE, TILE);
  g.fillStyle = 'rgba(0,0,0,0.06)';
  const ox = (s * 5) % 14, oy = (s * 7) % 12;
  g.fillRect(x + ox,      y + oy,      2, 2);
  g.fillRect(x + ox + 10, y + oy + 8,  2, 2);
  g.fillRect(x + ox + 5,  y + oy + 16, 2, 2);
}

// ── Tree drawing ──────────────────────────────────────────────────────────────
function drawTree(g, x, y) {
  // trunk
  g.fillStyle = '#5a3a1a';
  g.fillRect(x + 13, y + 20, 6, 14);
  // shadow canopy
  g.fillStyle = '#264820';
  g.beginPath();
  g.arc(x + 16, y + 16, 14, 0, Math.PI * 2);
  g.fill();
  // mid canopy
  g.fillStyle = '#3a6e2c';
  g.beginPath();
  g.arc(x + 14, y + 14, 12, 0, Math.PI * 2);
  g.fill();
  // highlight
  g.fillStyle = '#4e8838';
  g.beginPath();
  g.arc(x + 12, y + 11, 7, 0, Math.PI * 2);
  g.fill();
}

function drawPineTree(g, x, y) {
  // trunk
  g.fillStyle = '#5a3a1a';
  g.fillRect(x + 14, y + 24, 4, 10);
  // bottom tier
  g.fillStyle = '#1e4a1a';
  g.beginPath();
  g.moveTo(x + 16, y + 6);
  g.lineTo(x + 2,  y + 28);
  g.lineTo(x + 30, y + 28);
  g.closePath();
  g.fill();
  // upper tier
  g.fillStyle = '#286028';
  g.beginPath();
  g.moveTo(x + 16, y + 2);
  g.lineTo(x + 6,  y + 20);
  g.lineTo(x + 26, y + 20);
  g.closePath();
  g.fill();
  // highlight
  g.fillStyle = '#38803a';
  g.beginPath();
  g.moveTo(x + 16, y + 2);
  g.lineTo(x + 11, y + 15);
  g.lineTo(x + 16, y + 15);
  g.closePath();
  g.fill();
}

function drawPalmTree(g, x, y) {
  // trunk (slight curve)
  g.strokeStyle = '#7a5530';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(x + 16, y + 32);
  g.quadraticCurveTo(x + 20, y + 16, x + 18, y + 8);
  g.stroke();
  // fronds
  const fronds = [[-14,-4],[4,-12],[16,-2],[-2,10],[-16,4]];
  g.lineWidth = 3;
  for (const [fx, fy] of fronds) {
    g.strokeStyle = '#2a7820';
    g.beginPath();
    g.moveTo(x + 18, y + 8);
    g.quadraticCurveTo(x + 18 + fx * 0.5, y + 8 + fy * 0.5, x + 18 + fx, y + 8 + fy);
    g.stroke();
  }
  g.fillStyle = '#7a5020';
  g.beginPath();
  g.arc(x + 17, y + 10, 2.5, 0, Math.PI * 2);
  g.fill();
}

// ── Flower drawing ────────────────────────────────────────────────────────────
function drawFlower(g, x, y, type) {
  if (type === 'sunflower') {
    g.fillStyle = '#3a8020';
    g.fillRect(x + 15, y + 16, 2, 14);
    g.fillStyle = '#e8b818';
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      g.beginPath();
      g.ellipse(x + 16 + Math.cos(a) * 6, y + 12 + Math.sin(a) * 6, 3, 2, a, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#5a3010';
    g.beginPath();
    g.arc(x + 16, y + 12, 4, 0, Math.PI * 2);
    g.fill();
  } else {
    const colors = ['#e05080', '#d040c8', '#4080e0', '#e06020'];
    g.fillStyle = colors[Math.floor(rng(x, y, 5) * colors.length)];
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5;
      g.beginPath();
      g.arc(x + 16 + Math.cos(a) * 4, y + 20 + Math.sin(a) * 4, 2.5, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#ffe040';
    g.beginPath();
    g.arc(x + 16, y + 20, 2, 0, Math.PI * 2);
    g.fill();
  }
}

// ── Player drawing ────────────────────────────────────────────────────────────
function drawPlayer(g, x, y, frame, facing) {
  const bob = frame === 1 ? 1 : 0;

  // shadow
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.beginPath();
  g.ellipse(x + 16, y + 33, 8, 3, 0, 0, Math.PI * 2);
  g.fill();

  // legs
  g.fillStyle = '#1a3880';
  if (facing === 'left' || facing === 'right') {
    g.fillRect(x + (frame ? 9 : 12), y + 26 + bob, 5, 7);
    g.fillRect(x + (frame ? 18 : 15), y + 24 + bob, 5, 7);
  } else {
    g.fillRect(x + 9,  y + 26 + bob, 5, 7);
    g.fillRect(x + 18, y + 26 + bob, 5, 7);
  }

  // body
  g.fillStyle = '#2a5abf';
  g.fillRect(x + 8, y + 15 + bob, 16, 14);

  // arms
  g.fillStyle = '#2a5abf';
  if (facing === 'left') {
    g.fillRect(x + 2,  y + 16 + bob, 6, 10);
    g.fillRect(x + 24, y + 18 + bob, 6, 8);
  } else if (facing === 'right') {
    g.fillRect(x + 24, y + 16 + bob, 6, 10);
    g.fillRect(x + 2,  y + 18 + bob, 6, 8);
  } else {
    g.fillRect(x + 2,  y + 17 + bob, 6, 9);
    g.fillRect(x + 24, y + 17 + bob, 6, 9);
  }

  // head
  g.fillStyle = '#f0c890';
  g.fillRect(x + 9, y + 4 + bob, 14, 13);

  // hair / hat
  g.fillStyle = '#5828a0';
  g.fillRect(x + 9,  y + 1 + bob, 14, 5);
  g.fillRect(x + 7,  y + 3 + bob, 2,  7);
  g.fillRect(x + 23, y + 3 + bob, 2,  7);
  g.fillRect(x + 7,  y + 1 + bob, 18, 3);

  // eyes
  if (facing !== 'up') {
    g.fillStyle = '#1a1a28';
    g.fillRect(x + 11, y + 9 + bob, 3, 3);
    g.fillRect(x + 18, y + 9 + bob, 3, 3);
  }
}

// ── Dig-spot tile ─────────────────────────────────────────────────────────────
function drawDugTile(x, y) {
  ctx.fillStyle = '#6b3d1e';
  ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = '#4a2810';
  ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
  ctx.fillStyle = '#5a3018';
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(x + 3 + (i * 7) % 20, y + 4 + (i * 5) % 20, 3, 2);
  }
}

// ── Shared chest lid helper ───────────────────────────────────────────────────
function _chestLid(x, hinge, lidH, outerColor, innerColor, trimColor) {
  ctx.fillStyle = outerColor;
  ctx.beginPath();
  ctx.moveTo(x + 4,        hinge);
  ctx.lineTo(x + TILE - 4, hinge);
  ctx.lineTo(x + TILE - 2, hinge - lidH);
  ctx.lineTo(x + 2,        hinge - lidH);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = innerColor;
  ctx.beginPath();
  ctx.moveTo(x + 4,        hinge);
  ctx.lineTo(x + TILE - 4, hinge);
  ctx.lineTo(x + TILE - 2, hinge - lidH + 3);
  ctx.lineTo(x + 2,        hinge - lidH + 3);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = trimColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 2,        hinge - lidH);
  ctx.lineTo(x + TILE - 2, hinge - lidH);
  ctx.stroke();
}

// ── Tier-1 chest ─────────────────────────────────────────────────────────────
function drawChest(x, y, open) {
  const BOT = y + 30, bodyH = 14, lidH = 8;
  const bodyTop = BOT - bodyH;
  if (!open) {
    ctx.fillStyle = '#7a4820';
    ctx.fillRect(x + 4, bodyTop, TILE - 8, bodyH);
    ctx.fillStyle = '#4a2808';
    ctx.fillRect(x + 4, bodyTop + 2,          TILE - 8, 2);
    ctx.fillRect(x + 4, bodyTop + bodyH - 2,  TILE - 8, 2);
    ctx.fillStyle = '#8a5228';
    ctx.fillRect(x + 4, bodyTop - lidH, TILE - 8, lidH);
    ctx.fillStyle = '#5a3818';
    ctx.fillRect(x + 4, bodyTop - lidH, TILE - 8, 2);
    ctx.fillStyle = '#c8900a';
    ctx.fillRect(x + 4,        bodyTop, 3, bodyH);
    ctx.fillRect(x + TILE - 7, bodyTop, 3, bodyH);
    ctx.beginPath();
    ctx.arc(x + 16, bodyTop + bodyH / 2, 3, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = '#7a4820';
    ctx.fillRect(x + 4, bodyTop, TILE - 8, bodyH);
    ctx.fillStyle = '#2e1a0a';
    ctx.fillRect(x + 6, bodyTop, TILE - 12, 5);
    ctx.fillRect(x + 6, bodyTop + 4, TILE - 12, 2);
    _chestLid(x, bodyTop, lidH + 4, '#9a5828', '#b06830', '#c8900a');
    ctx.fillStyle = '#c8900a';
    ctx.fillRect(x + 15, bodyTop + 6, 2, 6);
  }
}

// ── Tier-2 fancy chest ────────────────────────────────────────────────────────
function drawFancyChest(x, y, open) {
  const BOT = y + 31, bodyH = 15, lidH = 10;
  const bodyTop = BOT - bodyH;
  // feet
  ctx.fillStyle = '#4a3010';
  ctx.fillRect(x + 4, BOT - 4, 5, 4);
  ctx.fillRect(x + TILE - 9, BOT - 4, 5, 4);
  if (!open) {
    ctx.fillStyle = '#6a3e14';
    ctx.fillRect(x + 4, bodyTop, TILE - 8, bodyH);
    ctx.fillStyle = '#c8920a';
    ctx.fillRect(x + 4, bodyTop + 3, TILE - 8, 2);
    ctx.fillRect(x + 4, bodyTop + bodyH - 3, TILE - 8, 2);
    ctx.fillStyle = '#7a4818';
    ctx.fillRect(x + 4, bodyTop - lidH, TILE - 8, lidH);
    ctx.fillStyle = '#c8920a';
    ctx.fillRect(x + 4,        bodyTop, 3, bodyH);
    ctx.fillRect(x + TILE - 7, bodyTop, 3, bodyH);
    ctx.beginPath();
    ctx.arc(x + 16, bodyTop + bodyH / 2, 4, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = '#6a3e14';
    ctx.fillRect(x + 4, bodyTop, TILE - 8, bodyH);
    ctx.fillStyle = '#160a02';
    ctx.fillRect(x + 5, bodyTop, TILE - 10, 6);
    ctx.fillStyle = '#2a1208';
    ctx.fillRect(x + 5, bodyTop + 5, TILE - 10, 2);
    _chestLid(x - 1, bodyTop, lidH + 5, '#7a4216', '#9a5820', '#d4980e');
    ctx.fillStyle = '#8a4a1a';
    ctx.beginPath();
    ctx.ellipse(x + 15, bodyTop - lidH - 1, 9, 4, 0, Math.PI, 0);
    ctx.fill();
  }
}

// ── Tier-3 precious chest ─────────────────────────────────────────────────────
function drawPreciousChest(x, y, open) {
  const BOT = y + 31, bodyH = 16, lidH = 12;
  const bodyTop = BOT - bodyH;
  ctx.fillStyle = '#304050';
  ctx.fillRect(x + 3, BOT - 5, 6, 5);
  ctx.fillRect(x + TILE - 9, BOT - 5, 6, 5);
  if (!open) {
    ctx.fillStyle = '#283848';
    ctx.fillRect(x + 3, bodyTop, TILE - 6, bodyH);
    ctx.fillStyle = '#78a8c0';
    ctx.fillRect(x + 3, bodyTop + 3, TILE - 6, 2);
    ctx.fillRect(x + 3, bodyTop + bodyH - 3, TILE - 6, 2);
    ctx.fillStyle = '#1c2c3c';
    ctx.fillRect(x + 3, bodyTop - lidH, TILE - 6, lidH);
    ctx.fillStyle = '#78a8c0';
    ctx.fillRect(x + 3,        bodyTop, 3, bodyH);
    ctx.fillRect(x + TILE - 6, bodyTop, 3, bodyH);
    ctx.fillStyle = '#40e8c8';
    ctx.beginPath();
    ctx.arc(x + 16, bodyTop + bodyH / 2, 4, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = '#283848';
    ctx.fillRect(x + 3, bodyTop, TILE - 6, bodyH);
    ctx.fillStyle = '#0e1418';
    ctx.fillRect(x + 4, bodyTop, TILE - 8, 6);
    ctx.fillStyle = '#182028';
    ctx.fillRect(x + 4, bodyTop + 5, TILE - 8, 2);
    _chestLid(x - 1, bodyTop, lidH + 6, '#243040', '#304050', '#78a8c0');
    ctx.fillStyle = '#78a8c0';
    ctx.beginPath();
    ctx.arc(x + 16, bodyTop - 3, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Tier-4 splendid chest ─────────────────────────────────────────────────────
function drawSplendidChest(x, y, open) {
  const BOT = y + 31, bodyH = 17, lidH = 13;
  const bodyTop = BOT - bodyH;
  ctx.fillStyle = '#806010';
  ctx.fillRect(x + 2, BOT - 5, 7, 5);
  ctx.fillRect(x + TILE - 9, BOT - 5, 7, 5);
  if (!open) {
    ctx.fillStyle = '#5c1a1a';
    ctx.fillRect(x + 2, bodyTop, TILE - 4, bodyH);
    ctx.fillStyle = '#ffe060';
    ctx.fillRect(x + 2, bodyTop + 3, TILE - 4, 2);
    ctx.fillRect(x + 2, bodyTop + bodyH - 3, TILE - 4, 2);
    ctx.fillRect(x + 2, bodyTop, 3, bodyH);
    ctx.fillRect(x + TILE - 5, bodyTop, 3, bodyH);
    ctx.fillStyle = '#7a1818';
    ctx.fillRect(x + 2, bodyTop - lidH, TILE - 4, lidH);
    ctx.fillStyle = '#ffe060';
    ctx.beginPath();
    ctx.arc(x + 16, bodyTop + bodyH / 2, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff2020';
    ctx.beginPath();
    ctx.arc(x + 16, bodyTop + bodyH / 2, 3, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = '#5c1a1a';
    ctx.fillRect(x + 2, bodyTop, TILE - 4, bodyH);
    ctx.fillStyle = '#3a0808';
    ctx.fillRect(x + 3, bodyTop + 6, TILE - 6, 2);
    ctx.fillStyle = 'rgba(180,20,20,0.3)';
    ctx.fillRect(x + 3, bodyTop, TILE - 6, 7);
    _chestLid(x - 2, bodyTop, lidH + 7, '#6e0a0a', '#8e1414', '#ffe060');
    ctx.fillStyle = '#7a1010';
    ctx.beginPath();
    ctx.ellipse(x + 15, bodyTop - lidH - 2, 11, 5, 0, Math.PI, 0);
    ctx.fill();
  }
}

// ── Washington Monument ───────────────────────────────────────────────────────
const occCanvas  = document.createElement('canvas');
occCanvas.width  = 32 + 12 * 2;
occCanvas.height = 36 + 12 * 2 + 6;
const occCtx = occCanvas.getContext('2d');

function drawMonument(g) {
  const cx     = MON_CENTER_X;
  const bottom = MON_BASE_BOTTOM;

  // Plinth steps
  g.fillStyle = '#cfccc2';
  g.fillRect(cx - 54, bottom - 22, 108, 22);
  g.fillStyle = '#d8d5cb';
  g.fillRect(cx - 44, bottom - 40, 88, 20);

  const shaftBottomY = bottom - 38;
  const shaftTopY    = MON_TOP + 42;
  const bw = 30, tw = 22;

  // Shaft lit (left) half
  g.fillStyle = '#dedad0';
  g.beginPath();
  g.moveTo(cx - bw, shaftBottomY);
  g.lineTo(cx - tw, shaftTopY);
  g.lineTo(cx,      shaftTopY);
  g.lineTo(cx,      shaftBottomY);
  g.closePath();
  g.fill();

  // Shaft shadow (right) half
  g.fillStyle = '#c4c0b5';
  g.beginPath();
  g.moveTo(cx,      shaftBottomY);
  g.lineTo(cx,      shaftTopY);
  g.lineTo(cx + tw, shaftTopY);
  g.lineTo(cx + bw, shaftBottomY);
  g.closePath();
  g.fill();

  // Centre highlight stripe
  g.fillStyle = '#eae7dc';
  g.beginPath();
  g.moveTo(cx - bw * 0.08, shaftBottomY);
  g.lineTo(cx - tw * 0.08, shaftTopY);
  g.lineTo(cx + tw * 0.08, shaftTopY);
  g.lineTo(cx + bw * 0.08, shaftBottomY);
  g.closePath();
  g.fill();

  // Pyramidion lit half
  g.fillStyle = '#e0ddd2';
  g.beginPath();
  g.moveTo(cx - tw, shaftTopY);
  g.lineTo(cx + tw, shaftTopY);
  g.lineTo(cx,      MON_TOP);
  g.closePath();
  g.fill();

  // Pyramidion shadow half
  g.fillStyle = '#c7c3b8';
  g.beginPath();
  g.moveTo(cx,      shaftTopY);
  g.lineTo(cx + tw, shaftTopY);
  g.lineTo(cx,      MON_TOP);
  g.closePath();
  g.fill();

  // Observation windows
  g.fillStyle = '#566571';
  g.fillRect(cx - 6, shaftTopY + 12, 3, 5);
  g.fillRect(cx + 3, shaftTopY + 12, 3, 5);
}

// ── Castle (image sprite) ─────────────────────────────────────────────────────
function drawDisneyCastle(g) {
  if (!castleImg.complete || castleImg.naturalWidth === 0) return;
  const drawH = 340;
  const drawW = castleImg.naturalWidth * drawH / castleImg.naturalHeight;
  g.drawImage(castleImg,
    Math.round(CASTLE_CX - drawW / 2),
    CASTLE_BASE - drawH,
    Math.round(drawW),
    drawH);
}

// ── Offscreen static layers ───────────────────────────────────────────────────
const mapCanvas    = document.createElement('canvas');
mapCanvas.width    = COLS * TILE;
mapCanvas.height   = ROWS * TILE;
const mctx = mapCanvas.getContext('2d');

const treeCanvas   = document.createElement('canvas');
treeCanvas.width   = COLS * TILE;
treeCanvas.height  = ROWS * TILE;
const tctx = treeCanvas.getContext('2d');

function renderStaticMap() {
  // Ground layer
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = c * TILE, y = r * TILE;
      const t = map[r][c];
      if      (t === T.WATER) drawWaterBase(mctx, x, y, seed[r][c]);
      else if (t === T.SAND)  drawSand(mctx, x, y, seed[r][c]);
      else                    drawGrass(mctx, x, y, seed[r][c]);
    }
  }
  // Decorations
  for (const d of decorations) {
    drawFlower(mctx, d.col * TILE, d.row * TILE, d.type);
  }
  // Tree overlay
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = map[r][c];
      if      (t === T.TREE) drawTree(tctx, c * TILE, r * TILE);
      else if (t === T.PINE) drawPineTree(tctx, c * TILE, r * TILE);
      else if (t === T.PALM) drawPalmTree(tctx, c * TILE, r * TILE);
    }
  }
  // Monument + castle on overlay
  drawMonument(tctx);
  drawDisneyCastle(tctx);
}

// ── Bridge & rainbow drawing ──────────────────────────────────────────────────
const BRIDGE_RATE  = 0.15;
const RAINBOW_RATE = 0.03;

function drawBridge(p) {
  for (let i = 0; i < p.bridge.length; i++) {
    const a = Math.max(0, Math.min(1, p.grow - i));
    if (a <= 0) continue;
    const t = p.bridge[i];
    const x = t.col * TILE, y = t.row * TILE;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = '#9a6a35';
    ctx.fillRect(x + 4, y, TILE - 8, TILE);
    ctx.strokeStyle = '#6e4a22';
    ctx.lineWidth = 1;
    for (let py = 4; py < TILE; py += 6) {
      ctx.beginPath();
      ctx.moveTo(x + 4, y + py);
      ctx.lineTo(x + TILE - 4, y + py);
      ctx.stroke();
    }
    ctx.fillStyle = '#7a4f26';
    ctx.fillRect(x + 3, y, 2, TILE);
    ctx.fillRect(x + TILE - 5, y, 2, TILE);
    ctx.restore();
  }
}

function drawRainbow(p) {
  const cx   = p.center.col * TILE + 16;
  const cy   = p.center.row * TILE + 16;
  const R    = Math.max(p.rx, p.ry) * TILE + 24;
  const colors = ['#ff0000','#ff8000','#ffff00','#00c000','#0080ff','#8000ff'];
  ctx.save();
  ctx.globalAlpha = p.rainbowAnim * 0.6;
  for (let i = 0; i < colors.length; i++) {
    ctx.strokeStyle = colors[i];
    ctx.lineWidth   = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, R - i * 5, Math.PI, 0);
    ctx.stroke();
  }
  ctx.restore();
}

// ── Camera ────────────────────────────────────────────────────────────────────
function updateCamera() {
  const targetX = player.px + TILE / 2 - canvas.width  / 2;
  const targetY = player.py + TILE / 2 - canvas.height / 2;
  camX += (targetX - camX) * 0.12;
  camY += (targetY - camY) * 0.12;
  camX = Math.max(0, Math.min(COLS * TILE - canvas.width,  camX));
  camY = Math.max(0, Math.min(ROWS * TILE - canvas.height, camY));
}

// ── Pond update ───────────────────────────────────────────────────────────────
function updatePonds() {
  for (const p of ponds) {
    const nearPond = (Math.abs(player.col - p.cx) <= p.rx + 2 &&
                      Math.abs(player.row - p.cy) <= p.ry + 2);
    const onBridge = !!(bridgeTileIndex[`${player.col},${player.row}`]?.pond === p);
    if (nearPond || onBridge) {
      p.grow = Math.min(p.grow + BRIDGE_RATE, p.bridge.length);
    } else {
      p.grow = Math.max(p.grow - BRIDGE_RATE, 0);
    }
    if (p.grow >= p.bridge.length - 0.1) p.rainbow = true;
    if (p.grow < 0.1)                    p.rainbow = false;
    if (p.rainbow) {
      p.rainbowAnim = Math.min(p.rainbowAnim + RAINBOW_RATE, 1);
    } else {
      p.rainbowAnim = Math.max(p.rainbowAnim - RAINBOW_RATE, 0);
    }
  }
}

// ── Update ────────────────────────────────────────────────────────────────────
function update() {
  tick++;
  updatePonds();

  // Chest fade-out timers
  for (const ch of chests) {
    if (ch.open && ch.disappearTimer > 0) ch.disappearTimer--;
  }
  if (digSpot.chestOpen && digSpot.disappearTimer > 0) digSpot.disappearTimer--;

  if (player.moving) {
    const tx   = player.targetCol * TILE;
    const ty   = player.targetRow * TILE;
    const dx   = tx - player.px;
    const dy   = ty - player.py;
    const dist = Math.hypot(dx, dy);
    if (dist <= SPEED) {
      player.px  = tx; player.py  = ty;
      player.col = player.targetCol; player.row = player.targetRow;
      player.moving = false;
    } else {
      player.px += (dx / dist) * SPEED;
      player.py += (dy / dist) * SPEED;
    }
    if (++player.frameTimer >= 8) { player.frame = (player.frame + 1) % 2; player.frameTimer = 0; }
  } else {
    const up    = keys['w'] || keys['W'] || keys['ArrowUp'];
    const down  = keys['s'] || keys['S'] || keys['ArrowDown'];
    const left  = keys['a'] || keys['A'] || keys['ArrowLeft'];
    const right = keys['d'] || keys['D'] || keys['ArrowRight'];

    let dr = 0, dc = 0;
    if (up)        dr = -1;
    else if (down) dr =  1;
    if (left)       dc = -1;
    else if (right) dc =  1;

    if      (dc < 0) player.facing = 'left';
    else if (dc > 0) player.facing = 'right';
    else if (dr < 0) player.facing = 'up';
    else if (dr > 0) player.facing = 'down';

    let canMove = (dr !== 0 || dc !== 0) && isWalkable(player.row + dr, player.col + dc);
    if (canMove && dr !== 0 && dc !== 0 &&
        !isWalkable(player.row + dr, player.col) && !isWalkable(player.row, player.col + dc)) {
      canMove = false;
    }
    if (canMove) {
      player.targetCol = player.col + dc;
      player.targetRow = player.row + dr;
      player.moving    = true;
    } else {
      player.frame = 0;
    }
  }

  updateCamera();
}

// ── HUD ───────────────────────────────────────────────────────────────────────
function drawHUD() {
  ctx.save();

  // Inventory bar
  const barW = 230, barH = 34, barX = Math.round(canvas.width / 2 - barW / 2), barY = 10;
  roundRectPath(ctx, barX, barY, barW, barH, 10);
  ctx.fillStyle = 'rgba(18,18,20,0.88)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.font = '600 13px ' + UI_FONT;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle    = '#ffd84d';
  ctx.fillText(`💰 ${inventory.gold}   💎 ${inventory.diamond}   🌸 ${inventory.redflower}`,
    canvas.width / 2, barY + barH / 2 + 1);

  // Loot popup
  if (lootMessage) {
    lootMessage.timer--;
    const alpha = Math.min(1, lootMessage.timer / 30);
    if (lootMessage.timer <= 0) { lootMessage = null; }
    else {
      ctx.globalAlpha = alpha;
      const w = 360, h = 60;
      const px = Math.round(canvas.width  / 2 - w / 2);
      const py = Math.round(canvas.height / 2 - 90);
      roundRectPath(ctx, px, py, w, h, 14);
      ctx.fillStyle = 'rgba(18,18,20,0.96)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,215,50,0.55)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.font      = '600 15px ' + UI_FONT;
      ctx.fillStyle = '#ffd84d';
      ctx.fillText(lootMessage.text, canvas.width / 2, py + h / 2 + 1);
    }
  }

  ctx.textAlign    = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}

// ── Draw ──────────────────────────────────────────────────────────────────────
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(-Math.round(camX), -Math.round(camY));

  const sx = Math.round(camX), sy = Math.round(camY);
  const sw = canvas.width,     sh = canvas.height;

  // Ground layer
  ctx.drawImage(mapCanvas, sx, sy, sw, sh, sx, sy, sw, sh);

  const startC = Math.floor(camX / TILE), endC = Math.ceil((camX + canvas.width)  / TILE);
  const startR = Math.floor(camY / TILE), endR = Math.ceil((camY + canvas.height) / TILE);

  // Bridges (under player)
  for (const p of ponds) if (p.grow > 0) drawBridge(p);

  // ── Regular chests ────────────────────────────────────────────────────────
  for (const ch of chests) {
    if (ch.open && ch.disappearTimer <= 0) continue;
    if (ch.col < startC || ch.col >= endC || ch.row < startR || ch.row >= endR) continue;
    const x = ch.col * TILE, y = ch.row * TILE;
    const chAlpha = (ch.open && ch.disappearTimer <= 60) ? ch.disappearTimer / 60 : 1;
    ctx.save();
    ctx.globalAlpha = chAlpha;
    drawChest(x, y, ch.open);
    ctx.restore();
    if (!ch.open) {
      const d = Math.max(Math.abs(ch.col - player.col), Math.abs(ch.row - player.row));
      if (d <= 1) {
        ctx.save();
        ctx.font         = '600 11px ' + UI_FONT;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        const label = '按 F 开启';
        const pw = ctx.measureText(label).width + 18, ph = 18;
        roundRectPath(ctx, x + 16 - pw / 2, y - 22, pw, ph, ph / 2);
        ctx.fillStyle   = 'rgba(28,28,30,0.9)'; ctx.fill();
        ctx.lineWidth   = 1;
        ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.stroke();
        ctx.fillStyle   = '#ffd84d';
        ctx.fillText(label, x + 16, y - 22 + ph / 2 + 1);
        ctx.restore();
      }
    }
  }

  // ── Dig spot ──────────────────────────────────────────────────────────────
  if (digSpot.dug) {
    const digAlpha = (digSpot.chestOpen && digSpot.disappearTimer <= 60)
      ? digSpot.disappearTimer / 60 : 1;
    const digGone  = digSpot.chestOpen && digSpot.disappearTimer <= 0;
    drawDugTile(digSpot.col * TILE, digSpot.row * TILE);
    if (!digGone) {
      ctx.save();
      ctx.globalAlpha = digAlpha;
      drawFancyChest(digSpot.col * TILE, digSpot.row * TILE - 4, digSpot.chestOpen);
      ctx.restore();
    }
  } else {
    const dd = Math.max(Math.abs(digSpot.col - player.col), Math.abs(digSpot.row - player.row));
    if (dd <= 1) {
      ctx.save();
      const label = '按 F 挖掘';
      ctx.font = '600 11px ' + UI_FONT;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const pw = ctx.measureText(label).width + 18, ph = 18;
      const lx = digSpot.col * TILE + 16, ly = digSpot.row * TILE - 22;
      roundRectPath(ctx, lx - pw / 2, ly, pw, ph, ph / 2);
      ctx.fillStyle = 'rgba(28,28,30,0.9)'; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.stroke();
      ctx.fillStyle = '#ffd84d';
      ctx.fillText(label, lx, ly + ph / 2 + 1);
      ctx.restore();
    }
  }
  if (digSpot.dug && !digSpot.chestOpen) {
    const dd = Math.max(Math.abs(digSpot.col - player.col), Math.abs(digSpot.row - player.row));
    if (dd <= 1) {
      ctx.save();
      const label = '按 F 开启精致宝箱';
      ctx.font = '600 11px ' + UI_FONT;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const pw = ctx.measureText(label).width + 18, ph = 18;
      const lx = digSpot.col * TILE + 16, ly = digSpot.row * TILE - 22;
      roundRectPath(ctx, lx - pw / 2, ly, pw, ph, ph / 2);
      ctx.fillStyle = 'rgba(28,28,30,0.9)'; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.stroke();
      ctx.fillStyle = '#ffd84d';
      ctx.fillText(label, lx, ly + ph / 2 + 1);
      ctx.restore();
    }
  }

  // ── Player ────────────────────────────────────────────────────────────────
  const px = Math.round(player.px), py = Math.round(player.py);
  drawPlayer(ctx, px, py, player.frame, player.facing);

  // ── Tree + monument + castle overlay ─────────────────────────────────────
  ctx.drawImage(treeCanvas, sx, sy, sw, sh, sx, sy, sw, sh);

  // ── Occlusion ghost (player shown through overlay objects) ────────────────
  const PAD = 12;
  const bx  = px - PAD, by = py - PAD - 6;
  const bw  = 32 + PAD * 2, bh = 36 + PAD * 2 + 6;
  occCtx.clearRect(0, 0, bw, bh);
  drawPlayer(occCtx, PAD, PAD + 6, player.frame, player.facing);
  occCtx.globalCompositeOperation = 'source-in';
  occCtx.fillStyle = '#d7d7dc';
  occCtx.fillRect(0, 0, bw, bh);
  occCtx.globalCompositeOperation = 'source-over';
  occCtx.globalCompositeOperation = 'destination-in';
  occCtx.drawImage(treeCanvas, bx, by, bw, bh, 0, 0, bw, bh);
  occCtx.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.drawImage(occCanvas, bx, by);
  ctx.restore();

  // ── Rainbows (topmost world layer) ────────────────────────────────────────
  for (const p of ponds) if (p.rainbowAnim > 0) drawRainbow(p);

  ctx.restore();

  drawHUD();
}

// ── Game loop ─────────────────────────────────────────────────────────────────
function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

// Start after castle image loads (so treeCanvas has the castle sprite)
castleImg.onload  = () => { renderStaticMap(); loop(); };
castleImg.onerror = () => { renderStaticMap(); loop(); }; // fallback if image missing
