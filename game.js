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
const T = { GRASS: 0, TREE: 1, WATER: 2, SAND: 3, PINE: 4, PALM: 5, CHERRY: 6, APPLE: 7, DIRT: 8 };

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
  { col: 12, row: 20, open: false, type: 'normal' },
  { col: 38, row: 10, open: false, type: 'normal' },
  { col: 22, row: 42, open: false, type: 'normal' },
];
const chestMap = {};
for (const ch of chests) chestMap[`${ch.col},${ch.row}`] = ch;

const inventory  = { gold: 0, diamond: 0, redflower: 0, apple: 0 };
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
      if (rng(i, cl.cx + 7, cl.cy + 13) < 0.5) continue; // thin out ~half the round trees
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

  // Cherry blossom trees (random scatter across map)
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (map[r][c] !== T.GRASS) continue;
      if (rng(c, r, 88) < 0.005) map[r][c] = T.CHERRY;
    }
  }

  // Convert 20% of deciduous trees to apple trees
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (map[r][c] === T.TREE && rng(c, r, 66) < 0.2) map[r][c] = T.APPLE;
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

  // Scatter flowers and sunflowers on grass
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (map[r][c] !== T.GRASS) continue;
      if (chestMap[`${c},${r}`])       continue;
      if (monumentBlocked[`${c},${r}`]) continue;
      const v = rng(c, r, 42);
      if      (v < 0.015) decorations.push({ col: c, row: r, type: 'sunflower' });
      else if (v < 0.09)  decorations.push({ col: c, row: r, type: 'flower' });
    }
  }

  // Initialise bridge tiles for each pond
  for (const p of ponds) {
    const tiles = [];
    const southRow = p.cy + Math.ceil(p.ry);
    for (let r = southRow; r >= p.cy; r--) {
      tiles.push({ col: p.cx, row: r });
    }
    p.bridge      = tiles;
    p.southRow    = southRow;
    p.grow        = 0;
    p.rainbow     = false;
    p.rainbowAnim = 0;
    p.center      = { col: p.cx, row: p.cy };
    tiles.forEach((t, i) => { bridgeTileIndex[`${t.col},${t.row}`] = { pond: p, index: i }; });
  }
}
buildMap();

// ── Apple tree data ───────────────────────────────────────────────────────────
const appleTrees = [];
const appleTreeMap = {};
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    if (map[r][c] === T.APPLE) {
      const count = Math.floor(rng(c, r, 99) * 3) + 1; // 1, 2, or 3 apples
      const at = { col: c, row: r, picked: false, count };
      appleTrees.push(at);
      appleTreeMap[`${c},${r}`] = at;
    }
  }
}

// ── Cherry tree data ──────────────────────────────────────────────────────────
const cherryTrees = [];
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    if (map[r][c] === T.CHERRY) {
      cherryTrees.push({ col: c, row: r, flowers: 3 }); // 3 pickable blossoms each
    }
  }
}

// ── Map editor: persistent layered tile edits (admin mode) ────────────────────
// Each edited tile is stored as { t: terrainBrush, o?: objectBrush } so an object
// (chest / flower) can sit on top of any terrain (e.g. a chest on dirt) and both
// survive across sessions. Edits are re-applied over the procedural map on load.
const TERRAIN_BRUSHES = ['grass', 'dirt', 'sand', 'water', 'tree', 'pine', 'palm', 'cherry', 'apple'];
const OBJECT_BRUSHES  = ['flower', 'sunflower', 'chest', 'chestFancy', 'chestPrecious', 'chestSplendid'];
const TREE_BRUSHES    = ['tree', 'pine', 'palm', 'cherry', 'apple'];
const CHEST_BRUSH_TYPE = {
  chest: 'normal', chestFancy: 'fancy', chestPrecious: 'precious', chestSplendid: 'splendid',
};

let mapEdits = {};
try { mapEdits = JSON.parse(localStorage.getItem('mapExplorerEdits') || '{}'); } catch (_) {}
function saveMapEdits() {
  try { localStorage.setItem('mapExplorerEdits', JSON.stringify(mapEdits)); } catch (_) {}
}

// What terrain brush best describes the current map tile?
function currentTerrainBrush(c, r) {
  switch (map[r][c]) {
    case T.DIRT:  return 'dirt';
    case T.SAND:  return 'sand';
    case T.WATER: return 'water';
    case T.TREE:  return 'tree';
    case T.PINE:  return 'pine';
    case T.PALM:  return 'palm';
    case T.CHERRY:return 'cherry';
    case T.APPLE: return 'apple';
    default:      return 'grass';
  }
}

// Remove any object (chest / apple / cherry / decoration / dig spot) on a tile.
function removeTileObjects(c, r) {
  const k = `${c},${r}`;
  if (chestMap[k]) {
    const i = chests.indexOf(chestMap[k]);
    if (i >= 0) chests.splice(i, 1);
    delete chestMap[k];
  }
  const ai = appleTrees.findIndex(a => a.col === c && a.row === r);
  if (ai >= 0) appleTrees.splice(ai, 1);
  if (appleTreeMap[k]) delete appleTreeMap[k];
  const ci = cherryTrees.findIndex(a => a.col === c && a.row === r);
  if (ci >= 0) cherryTrees.splice(ci, 1);
  for (let i = decorations.length - 1; i >= 0; i--) {
    if (decorations[i].col === c && decorations[i].row === r) decorations.splice(i, 1);
  }
  if (digSpot.col === c && digSpot.row === r) digSpot.removed = true;
}

function setTerrain(c, r, terr) {
  switch (terr) {
    case 'dirt':  map[r][c] = T.DIRT;  break;
    case 'sand':  map[r][c] = T.SAND;  break;
    case 'water': map[r][c] = T.WATER; break;
    case 'tree':  map[r][c] = T.TREE;  break;
    case 'pine':  map[r][c] = T.PINE;  break;
    case 'palm':  map[r][c] = T.PALM;  break;
    case 'cherry':
      map[r][c] = T.CHERRY;
      cherryTrees.push({ col: c, row: r, flowers: 3 });
      break;
    case 'apple': {
      map[r][c] = T.APPLE;
      const at = { col: c, row: r, picked: false, count: Math.floor(rng(c, r, 99) * 3) + 1 };
      appleTrees.push(at);
      appleTreeMap[`${c},${r}`] = at;
      break;
    }
    default: map[r][c] = T.GRASS;
  }
}

function addObject(c, r, o) {
  if (o === 'flower' || o === 'sunflower') {
    decorations.push({ col: c, row: r, type: o });
  } else if (CHEST_BRUSH_TYPE[o]) {
    const ch = { col: c, row: r, open: false, type: CHEST_BRUSH_TYPE[o] };
    chests.push(ch);
    chestMap[`${c},${r}`] = ch;
  }
}

// Fully (re)build a tile from a stored {t, o} state.
function applyTileState(c, r, st) {
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return;
  if (monumentBlocked[`${c},${r}`]) return; // keep the monument plinth protected
  removeTileObjects(c, r);
  setTerrain(c, r, st.t || 'grass');
  if (st.o) addObject(c, r, st.o);
}

// Normalise any stored value to a {t, o} state (tolerates the old string format).
function normalizeState(v) {
  if (typeof v === 'string') {
    if (OBJECT_BRUSHES.includes(v)) return { t: 'grass', o: v };
    return { t: v };
  }
  return v || { t: 'grass' };
}

function applyEdits(editObj) {
  for (const k in editObj) {
    const [c, r] = k.split(',').map(Number);
    applyTileState(c, r, normalizeState(editObj[k]));
  }
}

// Official published map (from mapdata.js, if deployed) is the shared baseline;
// personal localStorage edits are layered on top.
const publishedMap = (typeof window !== 'undefined' && window.PUBLISHED_MAP) || {};
applyEdits(publishedMap);
applyEdits(mapEdits);

// ── Player ────────────────────────────────────────────────────────────────────
const SPEED = 3;
const player = {
  col: 32, row: 40,
  px:  32 * TILE, py: 40 * TILE,
  targetCol: 32, targetRow: 40,
  moving: false, facing: 'down',
  frame: 0, frameTimer: 0,
};
let tick = 0;
let camX = 0, camY = 0;

// ── Settings & clothes presets ────────────────────────────────────────────────
const CLOTHES = [
  { body: '#2a5abf', legs: '#1a3880' }, // blue
  { body: '#c0392b', legs: '#7b241c' }, // red
  { body: '#27ae60', legs: '#196f3d' }, // green
  { body: '#8e44ad', legs: '#5b2c6f' }, // purple
  { body: '#e67e22', legs: '#a04000' }, // orange
];

const settings = {
  gender: 'male',     // 'male' | 'female'
  clothes: 0,         // index into CLOTHES
  name: '',
  language: 'zh',     // 'zh' | 'en'
};

// Restore saved settings if present
try {
  const saved = JSON.parse(localStorage.getItem('mapExplorerSettings') || '{}');
  Object.assign(settings, saved);
} catch (_) { /* ignore */ }

function saveSettings() {
  try { localStorage.setItem('mapExplorerSettings', JSON.stringify(settings)); } catch (_) {}
}

// ── i18n ──────────────────────────────────────────────────────────────────────
const I18N = {
  zh: {
    settings: '设置', gender: '性别', male: '男', female: '女',
    clothes: '衣服', name: '名字', language: '语言', close: '关闭',
    namePlaceholder: '输入名字',
    pressOpen: '按 F 开启', pressDig: '按 F 挖掘',
    pressOpenFancy: '按 F 开启精致宝箱', pressPickApple: '按 F 摘苹果',
    pressPickCherry: '按 F 摘樱花', selectHint: '滚轮/方向键选择 · F 或点击确认',
    chest:      (g, d) => `宝箱！金币 x${g}  钻石 x${d}  小红花 x1`,
    fancyChest: (g, d) => `精致宝箱！金币 x${g}  钻石 x${d}  小红花 x2`,
    apple:      (n)    => `苹果 x${n}`,
    flower:     (n)    => `小红花 x${n}`,
    redeem: '兑换码', redeemPlaceholder: '输入兑换码',
    adminTitle: '地图编辑器', adminHint: '点击或拖动来编辑地图（自动保存）。草地=橡皮擦',
    resetMap: '重置地图', exitAdmin: '退出', adminOn: '已进入管理员模式', publish: '发布到官网',
    chestLoot: (name, g, d, f) => `${name}！金币 x${g}  钻石 x${d}  小红花 x${f}`,
    cNormal: '普通的宝箱', cFancy: '精致的宝箱', cPrecious: '珍贵的宝箱', cSplendid: '华丽的宝箱',
    bGrass: '草地(擦除)', bDirt: '泥土', bSand: '沙地', bWater: '水',
    bTree: '圆树', bPine: '松树', bPalm: '棕榈', bCherry: '樱花树', bApple: '苹果树',
    bFlower: '小花', bSunflower: '太阳花',
    bChest: '普通的宝箱', bChestFancy: '精致的宝箱', bChestPrecious: '珍贵的宝箱', bChestSplendid: '华丽的宝箱',
  },
  en: {
    settings: 'Settings', gender: 'Gender', male: 'Male', female: 'Female',
    clothes: 'Clothes', name: 'Name', language: 'Language', close: 'Close',
    namePlaceholder: 'Enter name',
    pressOpen: 'Press F to open', pressDig: 'Press F to dig',
    pressOpenFancy: 'Press F to open chest', pressPickApple: 'Press F to pick apple',
    pressPickCherry: 'Press F to pick blossom', selectHint: 'Wheel/Arrows to choose · F or click',
    chest:      (g, d) => `Chest! Gold x${g}  Diamond x${d}  Flower x1`,
    fancyChest: (g, d) => `Fancy chest! Gold x${g}  Diamond x${d}  Flower x2`,
    apple:      (n)    => `Apple x${n}`,
    flower:     (n)    => `Flower x${n}`,
    redeem: 'Redeem', redeemPlaceholder: 'Enter code',
    adminTitle: 'Map Editor', adminHint: 'Click or drag to edit the map (auto-saved). Grass = eraser',
    resetMap: 'Reset', exitAdmin: 'Exit', adminOn: 'Admin mode enabled', publish: 'Publish',
    chestLoot: (name, g, d, f) => `${name}! Gold x${g}  Diamond x${d}  Flower x${f}`,
    cNormal: 'Common Chest', cFancy: 'Exquisite Chest', cPrecious: 'Precious Chest', cSplendid: 'Luxurious Chest',
    bGrass: 'Grass (erase)', bDirt: 'Dirt', bSand: 'Sand', bWater: 'Water',
    bTree: 'Tree', bPine: 'Pine', bPalm: 'Palm', bCherry: 'Cherry', bApple: 'Apple',
    bFlower: 'Flower', bSunflower: 'Sunflower',
    bChest: 'Common Chest', bChestFancy: 'Exquisite Chest', bChestPrecious: 'Precious Chest', bChestSplendid: 'Luxurious Chest',
  },
};
function t(key, ...args) {
  const v = I18N[settings.language][key];
  return typeof v === 'function' ? v(...args) : v;
}

// ── Input ─────────────────────────────────────────────────────────────────────
let settingsOpen = false;
const keys = {};
function isTyping(e) {
  return settingsOpen || (e.target && e.target.tagName === 'INPUT');
}
window.addEventListener('keydown', e => {
  if (isTyping(e)) return;
  keys[e.key] = true;

  // F confirms the currently selected interaction
  if ((e.key === 'f' || e.key === 'F') && !e.repeat) {
    activateSelected();
    return;
  }

  // When 2+ interactions are reachable, arrow keys cycle the selection
  // (instead of moving), so the player can pick which one they want.
  if (interactions.length >= 2 && !e.repeat) {
    const n = interactions.length;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      selIndex = (selIndex - 1 + n) % n; e.preventDefault(); return;
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      selIndex = (selIndex + 1) % n; e.preventDefault(); return;
    }
  }
});
window.addEventListener('keyup', e => { keys[e.key] = false; });

// Mouse wheel cycles the interaction selection
canvas.addEventListener('wheel', e => {
  if (settingsOpen || interactions.length < 2) return;
  e.preventDefault();
  const n = interactions.length;
  selIndex = (selIndex + (e.deltaY > 0 ? 1 : -1) + n) % n;
}, { passive: false });

// ── Admin map-editor runtime state ────────────────────────────────────────────
let adminMode = false;     // editor active
let adminBrush = 'tree';   // currently selected brush
let hoverTile = null;      // {c, r} tile under the cursor (for the editor highlight)
let painting  = false;     // mouse held down while editing
let lastPaint = null;      // "c,r" of the last painted tile (drag de-dupe)

// Convert a mouse event to a map tile.
function eventToTile(e) {
  const rect = canvas.getBoundingClientRect();
  const wx = (e.clientX - rect.left) + Math.round(camX);
  const wy = (e.clientY - rect.top)  + Math.round(camY);
  return { c: Math.floor(wx / TILE), r: Math.floor(wy / TILE) };
}

// Click directly on an interaction icon to select + activate it,
// or click anywhere on the map to walk there.
let interactionRects = []; // {x, y, w, h, index} in screen space, set during draw
let movePath   = [];       // queue of {col, row} tiles for click-to-move
let moveTarget = null;     // {col, row, t} destination marker for drawing
canvas.addEventListener('click', e => {
  if (settingsOpen || adminMode) return; // in admin mode clicks paint instead

  // 1) interaction icon?
  for (const r of interactionRects) {
    if (e.clientX >= r.x && e.clientX <= r.x + r.w &&
        e.clientY >= r.y && e.clientY <= r.y + r.h) {
      selIndex = r.index;
      activateSelected();
      return;
    }
  }

  // 2) otherwise, walk to the clicked tile
  const rect = canvas.getBoundingClientRect();
  const wx = (e.clientX - rect.left) + Math.round(camX);
  const wy = (e.clientY - rect.top)  + Math.round(camY);
  const tc = Math.floor(wx / TILE), tr = Math.floor(wy / TILE);
  const sc = player.moving ? player.targetCol : player.col;
  const sr = player.moving ? player.targetRow : player.row;
  const path = findPath(sc, sr, tc, tr);
  if (path.length) {
    movePath   = path;
    moveTarget = { col: tc, row: tr, t: 40 };
  }
});

// Paint one tile with the active brush, persist it, and refresh the visuals.
// 'grass' acts as a full eraser; terrain brushes keep any object already there
// (so you can lay dirt under a chest); object brushes keep the terrain.
function paintTile(c, r) {
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return;
  if (monumentBlocked[`${c},${r}`]) return;
  const k = `${c},${r}`;
  const prev = mapEdits[k] ? normalizeState(mapEdits[k]) : null;
  let st;

  if (adminBrush === 'grass') {
    st = { t: 'grass' }; // eraser → bare grass
  } else if (TERRAIN_BRUSHES.includes(adminBrush)) {
    st = { t: adminBrush };
    if (prev && prev.o && !TREE_BRUSHES.includes(adminBrush)) st.o = prev.o; // keep object
  } else { // object brush
    let baseT = prev ? (prev.t || 'grass') : currentTerrainBrush(c, r);
    if (TREE_BRUSHES.includes(baseT)) baseT = 'grass'; // objects can't sit on a tree
    st = { t: baseT, o: adminBrush };
  }

  const sig = k + '|' + JSON.stringify(st);
  if (lastPaint === sig) return; // no-op during a drag over the same tile
  lastPaint = sig;

  mapEdits[k] = st;
  applyTileState(c, r, st);
  saveMapEdits();
  renderStaticMap();
  interactions = buildInteractions(); // collections changed
}

// Cursor tracking + drag-painting for the editor
canvas.addEventListener('mousemove', e => {
  const { c, r } = eventToTile(e);
  hoverTile = (c >= 0 && c < COLS && r >= 0 && r < ROWS) ? { c, r } : null;
  if (adminMode && painting && hoverTile) paintTile(hoverTile.c, hoverTile.r);
});
canvas.addEventListener('mousedown', e => {
  if (!adminMode || settingsOpen || e.button !== 0) return;
  const { c, r } = eventToTile(e);
  painting = true;
  lastPaint = null;
  paintTile(c, r);
});
window.addEventListener('mouseup', () => { painting = false; });

// ── Walkability ───────────────────────────────────────────────────────────────
function isWalkable(r, c) {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
  const _mapCh = chestMap[`${c},${r}`];
  if (_mapCh && !_mapCh.open)        return false;
  if (monumentBlocked[`${c},${r}`])  return false;
  const t = map[r][c];
  if (t === T.WATER) {
    const b = bridgeTileIndex[`${c},${r}`];
    return !!(b && b.pond.grow >= b.index + 1);
  }
  return t !== T.TREE && t !== T.PINE && t !== T.PALM && t !== T.CHERRY && t !== T.APPLE;
}

// ── Pathfinding (BFS over walkable tiles) ──────────────────────────────────────
function findPath(sc, sr, tc, tr) {
  if (tc < 0 || tc >= COLS || tr < 0 || tr >= ROWS) return [];
  if (sc === tc && sr === tr) return [];
  if (!isWalkable(tr, tc)) return [];

  const key   = (c, r) => r * COLS + c;
  const seen  = new Uint8Array(COLS * ROWS);
  const prev  = new Int32Array(COLS * ROWS).fill(-1);
  const dirs  = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const q     = [[sc, sr]];
  let head    = 0;
  seen[key(sc, sr)] = 1;
  let found = false;

  while (head < q.length) {
    const [c, r] = q[head++];
    if (c === tc && r === tr) { found = true; break; }
    for (const [dc, dr] of dirs) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
      const k = key(nc, nr);
      if (seen[k] || !isWalkable(nr, nc)) continue;
      seen[k] = 1;
      prev[k] = key(c, r);
      q.push([nc, nr]);
    }
  }
  if (!found) return [];

  const path    = [];
  const startK  = key(sc, sr);
  let cur       = key(tc, tr);
  while (cur !== startK) {
    path.push({ col: cur % COLS, row: Math.floor(cur / COLS) });
    cur = prev[cur];
  }
  path.reverse();
  return path;
}

// ── Interaction actions ───────────────────────────────────────────────────────
const near = (o) => Math.max(Math.abs(o.col - player.col), Math.abs(o.row - player.row)) <= 1;

// Loot tiers per chest type: gold/diamond ranges [min,max], flowers, and name key.
const CHEST_LOOT = {
  normal:   { g: [1, 10],  d: [1, 10],  f: 1, name: 'cNormal' },
  fancy:    { g: [5, 18],  d: [5, 18],  f: 2, name: 'cFancy' },
  precious: { g: [10, 25], d: [10, 25], f: 3, name: 'cPrecious' },
  splendid: { g: [20, 40], d: [20, 40], f: 5, name: 'cSplendid' },
};
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function doOpenChest(ch) {
  ch.open = true;
  ch.disappearTimer = 240;
  const spec    = CHEST_LOOT[ch.type] || CHEST_LOOT.normal;
  const gold    = randInt(spec.g[0], spec.g[1]);
  const diamond = randInt(spec.d[0], spec.d[1]);
  inventory.gold      += gold;
  inventory.diamond   += diamond;
  inventory.redflower += spec.f;
  lootMessage = { text: t('chestLoot', t(spec.name), gold, diamond, spec.f), timer: 220 };
}

function doDig() { digSpot.dug = true; }

function doOpenFancy() {
  digSpot.chestOpen     = true;
  digSpot.disappearTimer = 240;
  const gold    = Math.floor(Math.random() * 13) + 3;
  const diamond = Math.floor(Math.random() * 13) + 3;
  inventory.gold      += gold;
  inventory.diamond   += diamond;
  inventory.redflower += 2;
  lootMessage = { text: t('fancyChest', gold, diamond), timer: 240 };
}

function doPickApple(at) {
  at.picked = true;
  inventory.apple += at.count;
  lootMessage = { text: t('apple', at.count), timer: 180 };
  renderTreeCanvas();
}

function doPickCherry(ct) {
  ct.flowers--;
  inventory.redflower += 1;
  lootMessage = { text: t('flower', 1), timer: 180 };
}

// Build the list of interactions the player can currently reach.
// Each entry: { icon, label, act }
function buildInteractions() {
  const list = [];
  for (const ch of chests) {
    if (!ch.open && near(ch)) list.push({ icon: '💰', label: t('pressOpen'), act: () => doOpenChest(ch) });
  }
  if (!digSpot.removed && near(digSpot)) {
    if (!digSpot.dug)            list.push({ icon: '⛏️', label: t('pressDig'),       act: doDig });
    else if (!digSpot.chestOpen) list.push({ icon: '🎁', label: t('pressOpenFancy'), act: doOpenFancy });
  }
  for (const at of appleTrees) {
    if (!at.picked && near(at)) list.push({ icon: '🍎', label: t('pressPickApple'), act: () => doPickApple(at) });
  }
  for (const ct of cherryTrees) {
    if (ct.flowers > 0 && near(ct)) list.push({ icon: '🌸', label: t('pressPickCherry'), act: () => doPickCherry(ct) });
  }
  return list;
}

// Live interaction state (rebuilt every frame in update())
let interactions = [];
let selIndex = 0;

function activateSelected() {
  if (interactions[selIndex]) {
    interactions[selIndex].act();
    interactions = buildInteractions();
    if (selIndex >= interactions.length) selIndex = Math.max(0, interactions.length - 1);
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
  g.fillRect(x + 13, y + 16, 6, 16);
  // shadow canopy
  g.fillStyle = '#264820';
  g.beginPath();
  g.arc(x + 16, y + 4, 22, 0, Math.PI * 2);
  g.fill();
  // mid canopy
  g.fillStyle = '#3a6e2c';
  g.beginPath();
  g.arc(x + 13, y + 1, 19, 0, Math.PI * 2);
  g.fill();
  // highlight
  g.fillStyle = '#4e8838';
  g.beginPath();
  g.arc(x + 9, y - 5, 12, 0, Math.PI * 2);
  g.fill();
}

function drawPineTree(g, x, y) {
  // trunk
  g.fillStyle = '#5a3a1a';
  g.fillRect(x + 14, y + 18, 4, 14);
  // bottom tier
  g.fillStyle = '#1e4a1a';
  g.beginPath();
  g.moveTo(x + 16, y - 16);
  g.lineTo(x + 2,  y + 20);
  g.lineTo(x + 30, y + 20);
  g.closePath();
  g.fill();
  // upper tier
  g.fillStyle = '#286028';
  g.beginPath();
  g.moveTo(x + 16, y - 22);
  g.lineTo(x + 6,  y);
  g.lineTo(x + 26, y);
  g.closePath();
  g.fill();
  // highlight
  g.fillStyle = '#38803a';
  g.beginPath();
  g.moveTo(x + 16, y - 22);
  g.lineTo(x + 11, y - 8);
  g.lineTo(x + 16, y - 8);
  g.closePath();
  g.fill();
}

function drawPalmTree(g, x, y) {
  // trunk (slight curve)
  g.strokeStyle = '#7a5530';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(x + 16, y + 32);
  g.quadraticCurveTo(x + 20, y + 14, x + 18, y + 4);
  g.stroke();
  // fronds
  const fronds = [[-16,-5],[6,-14],[20,-3],[-3,12],[-18,5]];
  g.lineWidth = 3;
  for (const [fx, fy] of fronds) {
    g.strokeStyle = '#2a7820';
    g.beginPath();
    g.moveTo(x + 18, y + 4);
    g.quadraticCurveTo(x + 18 + fx * 0.5, y + 4 + fy * 0.5, x + 18 + fx, y + 4 + fy);
    g.stroke();
  }
  g.fillStyle = '#7a5020';
  g.beginPath();
  g.arc(x + 17, y + 6, 3, 0, Math.PI * 2);
  g.fill();
}

function drawCherryTree(g, x, y) {
  const variant = Math.floor(rng(x, y, 55) * 2);
  g.fillStyle = '#6b3a2a';
  g.fillRect(x + 13, y + 16, 6, 16);

  if (variant === 0) {
    // Round canopy
    g.fillStyle = '#e8789a';
    g.beginPath(); g.arc(x + 16, y + 4, 22, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffb7c5';
    g.beginPath(); g.arc(x + 13, y + 1, 19, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffe0ea';
    g.beginPath(); g.arc(x + 9, y - 5, 12, 0, Math.PI * 2); g.fill();
  } else {
    // Airy multi-cluster
    for (const [cx2, cy2, r2] of [[16,4,14],[5,10,11],[27,8,10],[14,-3,10]]) {
      g.fillStyle = '#e8789a';
      g.beginPath(); g.arc(x + cx2, y + cy2, r2, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffb7c5';
      g.beginPath(); g.arc(x + cx2 - 2, y + cy2 - 2, r2 - 3, 0, Math.PI * 2); g.fill();
    }
  }

  // Scattered petal dots (all variants)
  g.fillStyle = '#fff0f5';
  for (const [dx, dy] of [[5,8],[22,10],[8,0],[18,3],[12,14],[25,6]]) {
    g.beginPath(); g.arc(x + dx, y + dy, 2, 0, Math.PI * 2); g.fill();
  }
}

// Apple positions per kind: index 0 → 1 apple, 1 → 2 apples, 2 → 3 apples
const APPLE_POS = [
  [[14, 8]],
  [[8, 6], [20, 10]],
  [[8, 6], [20, 8], [14, 14]],
];

function drawAppleTree(g, x, y, count) {
  // trunk
  g.fillStyle = '#5a3a1a';
  g.fillRect(x + 13, y + 16, 6, 16);
  // canopy (darker, richer green than regular tree)
  g.fillStyle = '#1e5018';
  g.beginPath(); g.arc(x + 16, y + 4, 22, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2e7228';
  g.beginPath(); g.arc(x + 13, y + 1, 19, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#3e8a38';
  g.beginPath(); g.arc(x + 9, y - 5, 12, 0, Math.PI * 2); g.fill();
  if (count > 0) {
    const positions = APPLE_POS[count - 1];
    g.fillStyle = '#d42020';
    for (const [dx, dy] of positions) {
      g.beginPath(); g.arc(x + dx, y + dy, 3.5, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#ff7070';
    for (const [dx, dy] of positions) {
      g.beginPath(); g.arc(x + dx - 1, y + dy - 1, 1.5, 0, Math.PI * 2); g.fill();
    }
  }
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
  const outfit = CLOTHES[settings.clothes] || CLOTHES[0];
  const female = settings.gender === 'female';

  // shadow
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.beginPath();
  g.ellipse(x + 16, y + 33, 8, 3, 0, 0, Math.PI * 2);
  g.fill();

  // legs
  g.fillStyle = outfit.legs;
  if (facing === 'left' || facing === 'right') {
    g.fillRect(x + (frame ? 9 : 12), y + 26 + bob, 5, 7);
    g.fillRect(x + (frame ? 18 : 15), y + 24 + bob, 5, 7);
  } else {
    // walking up/down: alternate which leg steps forward
    g.fillRect(x + 9,  y + 26 + bob + (frame ? -2 : 0), 5, 7);
    g.fillRect(x + 18, y + 26 + bob + (frame ? 0 : -2), 5, 7);
  }

  // body (dress flares out for female)
  g.fillStyle = outfit.body;
  if (female) {
    g.beginPath();
    g.moveTo(x + 8,  y + 15 + bob);
    g.lineTo(x + 24, y + 15 + bob);
    g.lineTo(x + 27, y + 29 + bob);
    g.lineTo(x + 5,  y + 29 + bob);
    g.closePath();
    g.fill();
  } else {
    g.fillRect(x + 8, y + 15 + bob, 16, 14);
  }

  // arms
  g.fillStyle = outfit.body;
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

  // ── Head, hair & face (facing-aware) ──────────────────────────────────────
  const hairColor = female ? '#7a4a18' : '#5828a0';

  if (facing === 'up') {
    // Back of the head — we see hair, not the face
    g.fillStyle = hairColor;
    if (female) {
      g.fillRect(x + 6, y + 2 + bob, 20, 9);    // back of head
      g.fillRect(x + 7, y + 9 + bob, 18, 18);   // long hair cascading down the back
      g.fillStyle = 'rgba(0,0,0,0.12)';         // strand seams for depth
      g.fillRect(x + 16, y + 11 + bob, 1, 15);
      g.fillRect(x + 11, y + 12 + bob, 1, 12);
      g.fillRect(x + 21, y + 12 + bob, 1, 12);
    } else {
      g.fillRect(x + 8, y + 2 + bob, 16, 15);   // back of head
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(x + 8, y + 14 + bob, 16, 2);   // nape shadow
    }
  } else {
    // Face visible (front or side)
    g.fillStyle = '#f0c890';
    g.fillRect(x + 9, y + 4 + bob, 14, 13);

    g.fillStyle = hairColor;
    if (female) {
      g.fillRect(x + 6,  y + 1 + bob, 20, 4);   // crown
      g.fillRect(x + 6,  y + 3 + bob, 3,  19);  // left length down past shoulder
      g.fillRect(x + 23, y + 3 + bob, 3,  19);  // right length down past shoulder
      g.fillRect(x + 9,  y + 4 + bob, 14, 2);   // fringe
    } else {
      g.fillRect(x + 9,  y + 1 + bob, 14, 5);
      g.fillRect(x + 7,  y + 3 + bob, 2,  7);
      g.fillRect(x + 23, y + 3 + bob, 2,  7);
      g.fillRect(x + 7,  y + 1 + bob, 18, 3);
    }

    // eyes
    g.fillStyle = '#1a1a28';
    g.fillRect(x + 11, y + 9 + bob, 3, 3);
    g.fillRect(x + 18, y + 9 + bob, 3, 3);
  }
}

// ── Dirt ground tile ──────────────────────────────────────────────────────────
function drawDirt(g, x, y) {
  g.fillStyle = '#6b3d1e';
  g.fillRect(x, y, TILE, TILE);
  g.fillStyle = '#5a3018';
  g.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
  g.fillStyle = '#7a4a26';
  for (let i = 0; i < 5; i++) {
    g.fillRect(x + 3 + (i * 11) % 24, y + 4 + (i * 7) % 24, 3, 2);
  }
  g.fillStyle = '#4a2810';
  for (let i = 0; i < 4; i++) {
    g.fillRect(x + 6 + (i * 9) % 20, y + 8 + (i * 5) % 18, 2, 2);
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

// Dispatch to the correct chest art by type.
function drawChestByType(type, x, y, open) {
  if      (type === 'fancy')    drawFancyChest(x, y, open);
  else if (type === 'precious') drawPreciousChest(x, y, open);
  else if (type === 'splendid') drawSplendidChest(x, y, open);
  else                          drawChest(x, y, open);
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
      else if (t === T.DIRT)  drawDirt(mctx, x, y);
      else                    drawGrass(mctx, x, y, seed[r][c]);
    }
  }
  // Decorations
  for (const d of decorations) {
    drawFlower(mctx, d.col * TILE, d.row * TILE, d.type);
  }
  // Tree + monument overlay
  renderTreeCanvas();
}

function renderTreeCanvas() {
  tctx.clearRect(0, 0, treeCanvas.width, treeCanvas.height);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = map[r][c];
      if      (t === T.TREE)   drawTree(tctx, c * TILE, r * TILE);
      else if (t === T.PINE)   drawPineTree(tctx, c * TILE, r * TILE);
      else if (t === T.PALM)   drawPalmTree(tctx, c * TILE, r * TILE);
      else if (t === T.CHERRY) drawCherryTree(tctx, c * TILE, r * TILE);
      else if (t === T.APPLE)  {
        const at = appleTreeMap[`${c},${r}`];
        drawAppleTree(tctx, c * TILE, r * TILE, at && !at.picked ? at.count : 0);
      }
    }
  }
  drawMonument(tctx);
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
    const atEntrance = (Math.abs(player.col - p.cx) <= 1 && Math.abs(player.row - p.southRow) <= 1);
    const onBridge   = !!(bridgeTileIndex[`${player.col},${player.row}`]?.pond === p);
    if (atEntrance || onBridge) {
      p.grow = Math.min(p.grow + BRIDGE_RATE, p.bridge.length);
    } else {
      p.grow = Math.max(p.grow - BRIDGE_RATE, 0);
    }
    const onPondWater = (
      map[player.row][player.col] === T.WATER &&
      Math.abs(player.col - p.cx) <= p.rx &&
      Math.abs(player.row - p.cy) <= p.ry
    );
    if (player.col === p.cx && player.row === p.cy) p.rainbow = true;
    if (!onPondWater) p.rainbow = false;
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

  // Refresh reachable interactions and keep the selection cursor in range
  interactions = buildInteractions();
  if (selIndex >= interactions.length) selIndex = Math.max(0, interactions.length - 1);

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
    // When 2+ interactions are reachable, arrow keys steer the selector,
    // so only WASD moves the player in that case.
    const arrowsMove = interactions.length < 2;
    const up    = keys['w'] || keys['W'] || (arrowsMove && keys['ArrowUp']);
    const down  = keys['s'] || keys['S'] || (arrowsMove && keys['ArrowDown']);
    const left  = keys['a'] || keys['A'] || (arrowsMove && keys['ArrowLeft']);
    const right = keys['d'] || keys['D'] || (arrowsMove && keys['ArrowRight']);

    let dr = 0, dc = 0;
    if (up)        dr = -1;
    else if (down) dr =  1;
    if (left)       dc = -1;
    else if (right) dc =  1;

    if (dr !== 0 || dc !== 0) {
      // Keyboard input cancels any active click-to-move path
      movePath = [];
      moveTarget = null;
    } else if (movePath.length) {
      // Follow the click-to-move path one tile at a time
      const next = movePath.shift();
      dc = Math.sign(next.col - player.col);
      dr = Math.sign(next.row - player.row);
    }

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
      if (dr !== 0 || dc !== 0) { movePath = []; moveTarget = null; } // blocked: abandon path
    }
  }

  if (moveTarget && moveTarget.t > 0) moveTarget.t--;
  if (movePath.length === 0 && moveTarget && moveTarget.t <= 0) moveTarget = null;

  updateCamera();
}

// ── HUD ───────────────────────────────────────────────────────────────────────
function drawHUD() {
  ctx.save();

  // Inventory bar
  const barW = 310, barH = 34, barX = Math.round(canvas.width / 2 - barW / 2), barY = 10;
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
  ctx.fillText(`💰 ${inventory.gold}   💎 ${inventory.diamond}   🌸 ${inventory.redflower}   🍎 ${inventory.apple}`,
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

  // Click-to-move destination marker
  if (moveTarget && (movePath.length || moveTarget.t > 0)) {
    const mx = moveTarget.col * TILE + 16, my = moveTarget.row * TILE + 16;
    const pulse = 0.5 + 0.5 * Math.sin(tick * 0.2);
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.4 * pulse;
    ctx.strokeStyle = '#ffd84d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(mx, my, 6 + 3 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,216,77,0.85)';
    ctx.beginPath();
    ctx.arc(mx, my, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ── Regular chests ────────────────────────────────────────────────────────
  for (const ch of chests) {
    if (ch.open && ch.disappearTimer <= 0) continue;
    if (ch.col < startC || ch.col >= endC || ch.row < startR || ch.row >= endR) continue;
    const x = ch.col * TILE, y = ch.row * TILE;
    const chAlpha = (ch.open && ch.disappearTimer <= 60) ? ch.disappearTimer / 60 : 1;
    ctx.save();
    ctx.globalAlpha = chAlpha;
    drawChestByType(ch.type, x, y, ch.open);
    ctx.restore();
  }

  // ── Dig spot ──────────────────────────────────────────────────────────────
  if (digSpot.dug && !digSpot.removed) {
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

  // ── Editor hover highlight ────────────────────────────────────────────────
  if (adminMode && hoverTile) {
    const hx = hoverTile.c * TILE, hy = hoverTile.r * TILE;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(hx + 1, hy + 1, TILE - 2, TILE - 2);
    ctx.fillStyle = 'rgba(255,216,77,0.18)';
    ctx.fillRect(hx + 1, hy + 1, TILE - 2, TILE - 2);
    ctx.restore();
  }

  // ── Player name tag ───────────────────────────────────────────────────────
  if (settings.name) {
    ctx.save();
    ctx.font         = '600 11px ' + UI_FONT;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(settings.name).width + 14, th = 16;
    const lx = px + 16, ly = py - 14;
    roundRectPath(ctx, lx - tw / 2, ly, tw, th, th / 2);
    ctx.fillStyle   = 'rgba(28,28,30,0.82)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle   = '#ffffff';
    ctx.fillText(settings.name, lx, ly + th / 2 + 1);
    ctx.restore();
  }

  ctx.restore();

  drawHUD();
  drawInteractionBar();
}

// ── Interaction selection bar (screen space, above the player) ────────────────
function drawInteractionBar() {
  interactionRects = [];
  const n = interactions.length;
  if (n === 0) return;

  const sel = interactions[selIndex];
  const psx = Math.round(player.px) - Math.round(camX) + 16; // player centre x (screen)
  const psy = Math.round(player.py) - Math.round(camY);      // player top y (screen)

  const chip = 30, gap = 6;
  const totalW = n * chip + (n - 1) * gap;
  const labelY = psy - 28;
  const iconsY = labelY - 6 - chip;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Icon chips
  let cx = Math.round(psx - totalW / 2);
  for (let i = 0; i < n; i++) {
    const on = i === selIndex;
    roundRectPath(ctx, cx, iconsY, chip, chip, 8);
    ctx.fillStyle   = on ? 'rgba(255,216,77,0.95)' : 'rgba(28,28,30,0.9)';
    ctx.fill();
    ctx.lineWidth   = on ? 2 : 1;
    ctx.strokeStyle = on ? '#ffffff' : 'rgba(255,255,255,0.18)';
    ctx.stroke();
    ctx.font      = '18px ' + UI_FONT;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(interactions[i].icon, cx + chip / 2, iconsY + chip / 2 + 1);
    interactionRects.push({ x: cx, y: iconsY, w: chip, h: chip, index: i });
    cx += chip + gap;
  }

  // Selected label
  ctx.font = '600 12px ' + UI_FONT;
  const lw = ctx.measureText(sel.label).width + 16, lh = 18;
  roundRectPath(ctx, psx - lw / 2, labelY, lw, lh, lh / 2);
  ctx.fillStyle   = 'rgba(28,28,30,0.92)'; ctx.fill();
  ctx.lineWidth   = 1; ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.stroke();
  ctx.fillStyle   = '#ffd84d';
  ctx.fillText(sel.label, psx, labelY + lh / 2 + 1);

  // Hint when there is a choice to make
  if (n >= 2) {
    const hint = t('selectHint');
    ctx.font = '500 10px ' + UI_FONT;
    const hw = ctx.measureText(hint).width + 14, hh = 15;
    const hy = iconsY - 4 - hh;
    roundRectPath(ctx, psx - hw / 2, hy, hw, hh, hh / 2);
    ctx.fillStyle = 'rgba(28,28,30,0.78)'; ctx.fill();
    ctx.fillStyle = '#c8c8cc';
    ctx.fillText(hint, psx, hy + hh / 2 + 1);
  }

  ctx.restore();
}

// ── Game loop ─────────────────────────────────────────────────────────────────
function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

// ── Settings UI wiring ────────────────────────────────────────────────────────
const settingsBtn   = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const genderSeg     = document.getElementById('genderSeg');
const langSeg       = document.getElementById('langSeg');
const clothesWrap   = document.getElementById('clothesSwatches');
const nameInput     = document.getElementById('nameInput');
const redeemInput   = document.getElementById('redeemInput');
const closeBtn      = document.getElementById('closeBtn');
const adminPanel    = document.getElementById('adminPanel');
const brushList     = document.getElementById('brushList');
const resetMapBtn   = document.getElementById('resetMapBtn');
const exitAdminBtn  = document.getElementById('exitAdminBtn');
const publishBtn    = document.getElementById('publishBtn');

// Build clothes swatches
CLOTHES.forEach((c, i) => {
  const b = document.createElement('button');
  b.style.background = c.body;
  b.dataset.clothes = i;
  b.addEventListener('click', () => { settings.clothes = i; refreshSettingsUI(); saveSettings(); });
  clothesWrap.appendChild(b);
});

genderSeg.querySelectorAll('button').forEach(b => {
  b.addEventListener('click', () => { settings.gender = b.dataset.gender; refreshSettingsUI(); saveSettings(); });
});
langSeg.querySelectorAll('button').forEach(b => {
  b.addEventListener('click', () => { settings.language = b.dataset.lang; refreshSettingsUI(); saveSettings(); });
});
nameInput.addEventListener('input', () => { settings.name = nameInput.value; saveSettings(); });

// Redeem code → unlock admin map editor
redeemInput.addEventListener('input', () => {
  if (redeemInput.value.trim() === '142857') {
    redeemInput.value = '';
    enableAdmin();
    lootMessage = { text: t('adminOn'), timer: 180 };
  }
});

// ── Admin editor: brush palette ───────────────────────────────────────────────
const BRUSHES = [
  { id: 'grass',         key: 'bGrass',         color: '#4a7c3f' },
  { id: 'dirt',          key: 'bDirt',          color: '#6b3d1e' },
  { id: 'sand',          key: 'bSand',          color: '#cdac50' },
  { id: 'water',         key: 'bWater',         color: '#2a6fa8' },
  { id: 'tree',          key: 'bTree',          color: '#3a6e2c' },
  { id: 'pine',          key: 'bPine',          color: '#1e4a1a' },
  { id: 'palm',          key: 'bPalm',          color: '#2a7820' },
  { id: 'cherry',        key: 'bCherry',        color: '#ffb7c5' },
  { id: 'apple',         key: 'bApple',         color: '#d42020' },
  { id: 'flower',        key: 'bFlower',        color: '#e05080' },
  { id: 'sunflower',     key: 'bSunflower',     color: '#e8b818' },
  { id: 'chest',         key: 'bChest',         color: '#c8900a' },
  { id: 'chestFancy',    key: 'bChestFancy',    color: '#c8920a' },
  { id: 'chestPrecious', key: 'bChestPrecious', color: '#78a8c0' },
  { id: 'chestSplendid', key: 'bChestSplendid', color: '#ffe060' },
];
BRUSHES.forEach(br => {
  const b = document.createElement('button');
  b.dataset.brush = br.id;
  const dot = document.createElement('span');
  dot.className = 'dot';
  dot.style.background = br.color;
  const label = document.createElement('span');
  label.className = 'blabel';
  b.appendChild(dot);
  b.appendChild(label);
  b.addEventListener('click', () => { adminBrush = br.id; refreshBrushUI(); });
  brushList.appendChild(b);
});

function refreshBrushUI() {
  brushList.querySelectorAll('button').forEach(b =>
    b.classList.toggle('active', b.dataset.brush === adminBrush));
}

function applyLanguageLabels() {
  document.getElementById('stTitle').textContent        = t('settings');
  document.getElementById('stGenderLabel').textContent  = t('gender');
  document.getElementById('stClothesLabel').textContent = t('clothes');
  document.getElementById('stNameLabel').textContent    = t('name');
  document.getElementById('stLangLabel').textContent    = t('language');
  document.getElementById('stRedeemLabel').textContent  = t('redeem');
  closeBtn.textContent          = t('close');
  nameInput.placeholder         = t('namePlaceholder');
  redeemInput.placeholder       = t('redeemPlaceholder');
  genderSeg.querySelector('[data-gender="male"]').textContent   = t('male');
  genderSeg.querySelector('[data-gender="female"]').textContent = t('female');
  settingsBtn.title = t('settings');

  // Admin panel labels
  document.getElementById('adminTitle').textContent = t('adminTitle');
  document.getElementById('adminHint').textContent  = t('adminHint');
  publishBtn.textContent   = t('publish');
  resetMapBtn.textContent  = t('resetMap');
  exitAdminBtn.textContent = t('exitAdmin');
  BRUSHES.forEach(br => {
    const b = brushList.querySelector(`[data-brush="${br.id}"] .blabel`);
    if (b) b.textContent = t(br.key);
  });
}

function refreshSettingsUI() {
  genderSeg.querySelectorAll('button').forEach(b =>
    b.classList.toggle('active', b.dataset.gender === settings.gender));
  langSeg.querySelectorAll('button').forEach(b =>
    b.classList.toggle('active', b.dataset.lang === settings.language));
  clothesWrap.querySelectorAll('button').forEach(b =>
    b.classList.toggle('active', Number(b.dataset.clothes) === settings.clothes));
  if (nameInput.value !== settings.name) nameInput.value = settings.name;
  applyLanguageLabels();
}

function openSettings() {
  settingsOpen = true;
  for (const k in keys) keys[k] = false; // release held movement keys
  refreshSettingsUI();
  settingsModal.classList.remove('hidden');
}
function closeSettings() {
  settingsOpen = false;
  settingsModal.classList.add('hidden');
}

settingsBtn.addEventListener('click', openSettings);
closeBtn.addEventListener('click', closeSettings);
settingsModal.addEventListener('click', e => { if (e.target === settingsModal) closeSettings(); });

// ── Admin enable / disable / reset ────────────────────────────────────────────
// Admin mode is session-only: it never auto-logs-in. The redeem code must be
// entered again after every reload.
function enableAdmin() {
  adminMode = true;
  adminPanel.classList.remove('hidden');
  refreshBrushUI();
  applyLanguageLabels();
  movePath = []; moveTarget = null; // stop any pending click-to-move
}
function disableAdmin() {
  adminMode = false;
  painting = false;
  adminPanel.classList.add('hidden');
}
exitAdminBtn.addEventListener('click', disableAdmin);
resetMapBtn.addEventListener('click', () => {
  mapEdits = {};
  saveMapEdits();
  location.reload(); // rebuild the pristine procedural map
});

// Publish: download an updated mapdata.js containing the full effective edit set.
// Replace mapdata.js on the website to make these edits the shared baseline.
publishBtn.addEventListener('click', () => {
  const merged = Object.assign({}, publishedMap, mapEdits);
  const content =
    '// Official published map for Map Explorer (generated by the in-game editor).\n' +
    'window.PUBLISHED_MAP = ' + JSON.stringify(merged) + ';\n';
  const blob = new Blob([content], { type: 'text/javascript' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'mapdata.js';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

refreshSettingsUI();

renderStaticMap();
loop();
