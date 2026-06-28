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
const palmOnSand = {};  // "c,r" → true for palms whose ground should render as sand

const chests = [
  { col: 12, row: 20, open: false, type: 'normal' },
  { col: 38, row: 10, open: false, type: 'normal' },
  { col: 20, row: 37, open: false, type: 'precious' }, // 1 block above pond centre — bridge extended to reach it
];
const chestMap = {};
for (const ch of chests) chestMap[`${ch.col},${ch.row}`] = ch;

const inventory  = {
  // currency & loot
  gold: 0, diamond: 0, redflower: 0, apple: 0, coconut: 0,
  strawberry: 0, blueberry: 0,
  // raw ingredients (shop)
  cabbage: 0, tomato: 0, egg: 0, rice: 0, flour: 0,
  salt: 0, sugar: 0, pepper: 0, meat: 0,
  // cooked dishes (15 total)
  scrambledEgg: 0, candiedApple: 0, steamedRice: 0,
  tomatoNoodles: 0, tomatoEggRice: 0,
  friedEgg: 0, eggFriedRice: 0,
  friedCabbage: 0, pepperCabbage: 0, cabbagePork: 0,
  redBraisedPork: 0, friedPork: 0, mincedMeatRice: 0,
  tomatoSoup: 0, sweetPancake: 0,
  // fish (from fishing)
  grass_carp: 0, red_carp: 0, goldfish: 0, fish_meat: 0,
  // materials (from chopping trees)
  lumber: 0, pinecone: 0,
  // special items
  driftBottle: 0,
};
let   lootMessage = null; // { text, timer }
let   shopOpen    = false;

function saveInventory() {
  try { localStorage.setItem('mapExplorerInventory', JSON.stringify(inventory)); } catch (_) {}
}
// Restore saved inventory on load
try {
  const inv = JSON.parse(localStorage.getItem('mapExplorerInventory') || 'null');
  if (inv) Object.assign(inventory, inv);
} catch (_) {}
let   cookOpen    = false;
let   bagOpen     = false;

// ── Achievement system ────────────────────────────────────────────────────────
// Each chest type has 3 milestones (3 / 6 / 10) with diamond rewards (5 / 10 / 20).
const ACHIEVEMENTS = [
  // ── Common chest
  { id: 'normal_3',    icon: '📦', nameZh: '普通的宝箱·Ⅰ', nameEn: 'Common Chest I',
    descZh: '开启3个普通的宝箱',   descEn: 'Open 3 Common Chests',   target: 3,  track: 'chest_normal',   reward: { diamond: 5  } },
  { id: 'normal_6',    icon: '📦', nameZh: '普通的宝箱·Ⅱ', nameEn: 'Common Chest II',
    descZh: '开启6个普通的宝箱',   descEn: 'Open 6 Common Chests',   target: 6,  track: 'chest_normal',   reward: { diamond: 10 } },
  { id: 'normal_10',   icon: '📦', nameZh: '普通的宝箱·Ⅲ', nameEn: 'Common Chest III',
    descZh: '开启10个普通的宝箱',  descEn: 'Open 10 Common Chests',  target: 10, track: 'chest_normal',   reward: { diamond: 20 } },
  // ── Exquisite chest
  { id: 'fancy_3',     icon: '🎁', nameZh: '精致的宝箱·Ⅰ', nameEn: 'Exquisite Chest I',
    descZh: '开启3个精致的宝箱',   descEn: 'Open 3 Exquisite Chests',   target: 3,  track: 'chest_fancy',   reward: { diamond: 5  } },
  { id: 'fancy_6',     icon: '🎁', nameZh: '精致的宝箱·Ⅱ', nameEn: 'Exquisite Chest II',
    descZh: '开启6个精致的宝箱',   descEn: 'Open 6 Exquisite Chests',   target: 6,  track: 'chest_fancy',   reward: { diamond: 10 } },
  { id: 'fancy_10',    icon: '🎁', nameZh: '精致的宝箱·Ⅲ', nameEn: 'Exquisite Chest III',
    descZh: '开启10个精致的宝箱',  descEn: 'Open 10 Exquisite Chests',  target: 10, track: 'chest_fancy',   reward: { diamond: 20 } },
  // ── Precious chest
  { id: 'precious_3',  icon: '💎', nameZh: '珍贵的宝箱·Ⅰ', nameEn: 'Precious Chest I',
    descZh: '开启3个珍贵的宝箱',   descEn: 'Open 3 Precious Chests',   target: 3,  track: 'chest_precious', reward: { diamond: 5  } },
  { id: 'precious_6',  icon: '💎', nameZh: '珍贵的宝箱·Ⅱ', nameEn: 'Precious Chest II',
    descZh: '开启6个珍贵的宝箱',   descEn: 'Open 6 Precious Chests',   target: 6,  track: 'chest_precious', reward: { diamond: 10 } },
  { id: 'precious_10', icon: '💎', nameZh: '珍贵的宝箱·Ⅲ', nameEn: 'Precious Chest III',
    descZh: '开启10个珍贵的宝箱',  descEn: 'Open 10 Precious Chests',  target: 10, track: 'chest_precious', reward: { diamond: 20 } },
  // ── Luxurious chest
  { id: 'splendid_3',  icon: '👑', nameZh: '华丽的宝箱·Ⅰ', nameEn: 'Luxurious Chest I',
    descZh: '开启3个华丽的宝箱',   descEn: 'Open 3 Luxurious Chests',   target: 3,  track: 'chest_splendid', reward: { diamond: 5  } },
  { id: 'splendid_6',  icon: '👑', nameZh: '华丽的宝箱·Ⅱ', nameEn: 'Luxurious Chest II',
    descZh: '开启6个华丽的宝箱',   descEn: 'Open 6 Luxurious Chests',   target: 6,  track: 'chest_splendid', reward: { diamond: 10 } },
  { id: 'splendid_10', icon: '👑', nameZh: '华丽的宝箱·Ⅲ', nameEn: 'Luxurious Chest III',
    descZh: '开启10个华丽的宝箱',  descEn: 'Open 10 Luxurious Chests',  target: 10, track: 'chest_splendid', reward: { diamond: 20 } },
  // ── Cooking
  { id: 'first_cook',  icon: '🍳', nameZh: '初学厨师',       nameEn: 'Budding Chef',
    descZh: '第一次烹饪一顿餐食',  descEn: 'Cook a dish for the first time', target: 1, track: 'cook' },
];

let achProgress = {};  // track → count
let achUnlocked = {};  // id → true
try {
  const saved = JSON.parse(localStorage.getItem('mapExplorerAch') || '{}');
  achProgress = saved.progress || {};
  achUnlocked = saved.unlocked || {};
} catch (_) {}

function saveAch() {
  try { localStorage.setItem('mapExplorerAch', JSON.stringify({ progress: achProgress, unlocked: achUnlocked })); } catch (_) {}
}

// ── Rich code (v我50 / makemerich) ───────────────────────────────────────────
let richCodeUsed = false;
try { richCodeUsed = !!localStorage.getItem('mapExplorerRichUsed'); } catch (_) {}
function saveRichUsed(v) { try { v ? localStorage.setItem('mapExplorerRichUsed','1') : localStorage.removeItem('mapExplorerRichUsed'); } catch(_){} }

// ── Drift bottle state ────────────────────────────────────────────────────────
let driftBottleOpened = false;
try { driftBottleOpened = !!localStorage.getItem('mapExplorerDriftOpened'); } catch (_) {}

function progressAch(track, amount = 1) {
  achProgress[track] = (achProgress[track] || 0) + amount;
  saveAch();
  for (const a of ACHIEVEMENTS) {
    if (a.track === track && !achUnlocked[a.id] && achProgress[track] >= a.target) {
      achUnlocked[a.id] = true;
      // Grant reward
      if (a.reward) {
        if (a.reward.diamond) { inventory.diamond += a.reward.diamond; saveInventory(); }
      }
      saveAch();
      showAchievementUnlock(a);
    }
  }
}

let _achNotifTimer = null;
function showAchievementUnlock(a) {
  const notif = document.getElementById('achNotif');
  if (!notif) return;
  const zh = settings.language !== 'en';
  document.getElementById('achNotifIcon').textContent  = a.icon;
  document.getElementById('achNotifLabel').textContent = zh ? '成就达成' : 'Achievement Unlocked';
  document.getElementById('achNotifName').textContent  = zh ? a.nameZh : a.nameEn;
  // Show reward in description if present
  let desc = zh ? a.descZh : a.descEn;
  if (a.reward?.diamond) desc += zh ? `  （获得 💎×${a.reward.diamond}）` : `  (+💎${a.reward.diamond})`;
  document.getElementById('achNotifDesc').textContent  = desc;
  notif.classList.add('show');
  if (_achNotifTimer) clearTimeout(_achNotifTimer);
  _achNotifTimer = setTimeout(() => notif.classList.remove('show'), 4500);
}

// ── DOM notification (above all modals) ──────────────────────────────────────
let _notifTimer = null;
function showNotif(text) {
  const box = document.getElementById('notifBox');
  if (!box) { lootMessage = { text, timer: 180 }; return; }
  document.getElementById('notifText').textContent = text;
  box.classList.remove('hidden');
  if (_notifTimer) clearTimeout(_notifTimer);
  _notifTimer = setTimeout(() => box.classList.add('hidden'), 4500);
}

// ── Tree chopping ─────────────────────────────────────────────────────────────
const CHOP_HITS   = 4;
const treeHits    = {};          // "col,row" → hit count
const fallenTrees = [];          // { col, row, lumber, pinecones }
let   shakingTree = null;        // { col, row, type, timer } — active shake animation
const TREE_TILE_TYPES = new Set([T.TREE, T.PINE, T.PALM, T.CHERRY, T.APPLE]);

// ── Shop ──────────────────────────────────────────────────────────────────────
const SHOP_COL = 40, SHOP_ROW = 28;
const SHOP_ITEMS = [
  { key: 'cabbage', icon: '🥬', price: 2 },
  { key: 'tomato',  icon: '🍅', price: 2 },
  { key: 'egg',     icon: '🥚', price: 2 },
  { key: 'rice',    icon: '🍚', price: 2 },
  { key: 'flour',   icon: '🌾', price: 2 },
  { key: 'salt',    icon: '🧂', price: 2 },
  { key: 'sugar',   icon: '🍬', price: 2 },
  { key: 'pepper',     icon: '🌶️', price: 2 },
  { key: 'meat',       icon: '🥩', price: 2 },
  { key: 'coconut',    icon: '🥥', price: 5 },
  { key: 'strawberry', icon: '🍓', price: 5 },
  { key: 'blueberry',  icon: '🫐', price: 5 },
];

// ── Stove ─────────────────────────────────────────────────────────────────────
const STOVE_COL = 44, STOVE_ROW = 30;

// ── Building protection ────────────────────────────────────────────────────────
// Add every building tile here. Admin mode can never paint over these tiles.
// Call protectBuilding() for any new building added in the future.
const BUILDING_TILES = new Set();
function protectBuilding(col, row) { BUILDING_TILES.add(`${col},${row}`); }
protectBuilding(SHOP_COL,  SHOP_ROW);
protectBuilding(STOVE_COL, STOVE_ROW);

// ── Recipes (15 dishes) ───────────────────────────────────────────────────────
const RECIPES = [
  { key: 'scrambledEgg',  icon: '🍳', needs: { tomato:1, egg:1, salt:1, sugar:1 } },
  { key: 'candiedApple',  icon: '🍯', needs: { apple:1, sugar:1 } },
  { key: 'steamedRice',   icon: '🥣', needs: { rice:1 } },
  { key: 'tomatoNoodles', icon: '🍜', needs: { tomato:1, egg:1, salt:1, sugar:1, flour:1 } },
  { key: 'tomatoEggRice', icon: '🥘', needs: { tomato:1, egg:1, salt:1, sugar:1, cabbage:1, rice:1 } },
  { key: 'friedEgg',      icon: '🍳', needs: { egg:1, salt:1 } },
  { key: 'eggFriedRice',  icon: '🍚', needs: { egg:1, rice:1, salt:1 } },
  { key: 'friedCabbage',  icon: '🫑', needs: { cabbage:1, salt:1 } },
  { key: 'pepperCabbage', icon: '🌿', needs: { cabbage:1, salt:1, pepper:1 } },
  { key: 'cabbagePork',   icon: '🥗', needs: { cabbage:1, meat:1, salt:1 } },
  { key: 'redBraisedPork',icon: '🍖', needs: { meat:1, sugar:1, salt:1 } },
  { key: 'friedPork',     icon: '🥓', needs: { meat:1, salt:1, pepper:1 } },
  { key: 'mincedMeatRice',icon: '🍱', needs: { meat:1, rice:1, salt:1 } },
  { key: 'tomatoSoup',    icon: '🍵', needs: { tomato:1, salt:1 } },
  { key: 'sweetPancake',  icon: '🥞', needs: { flour:1, sugar:1 } },
];

// All inventory item metadata (for HUD + admin editor)
const INVENTORY_META = [
  // currency & loot
  { key: 'gold',      icon: '💰' }, { key: 'diamond',  icon: '💎' },
  { key: 'redflower',  icon: '🌸' }, { key: 'apple',      icon: '🍎' },
  { key: 'coconut',    icon: '🥥' }, { key: 'strawberry', icon: '🍓' },
  { key: 'blueberry',  icon: '🫐' },
  // raw ingredients
  { key: 'cabbage', icon: '🥬' }, { key: 'tomato', icon: '🍅' },
  { key: 'egg',     icon: '🥚' }, { key: 'rice',   icon: '🍚' },
  { key: 'flour',   icon: '🌾' }, { key: 'salt',   icon: '🧂' },
  { key: 'sugar',   icon: '🍬' }, { key: 'pepper', icon: '🌶️' },
  { key: 'meat',    icon: '🥩' },
  // cooked dishes (inherit icon from RECIPES)
  ...RECIPES.map(r => ({ key: r.key, icon: r.icon })),
  // fish
  { key: 'grass_carp', icon: '🐟' }, { key: 'red_carp', icon: '🐠' },
  { key: 'goldfish',   icon: '🐡' }, { key: 'fish_meat', icon: '🍣' },
  // materials
  { key: 'lumber',      icon: '🪵' },
  { key: 'pinecone',    icon: '🌰' },
  // special
  { key: 'driftBottle', icon: '🫙' },
];

// ── Backpack categories ───────────────────────────────────────────────────────
// apple goes in Ingredients even though it is also a cooking ingredient for dishes
const BAG_INGREDIENT_KEYS = [
  'strawberry', 'blueberry',
  'redflower', 'apple', 'coconut',
  'cabbage', 'tomato', 'egg', 'rice', 'flour',
  'salt', 'sugar', 'pepper', 'meat', 'fish_meat',
];
const BAG_FISH_KEYS     = ['grass_carp', 'red_carp', 'goldfish'];
const BAG_FOOD_KEYS     = RECIPES.map(r => r.key);
const BAG_MATERIAL_KEYS = ['lumber', 'pinecone', 'driftBottle'];

// ── Dig spots: a buried chest. Stand nearby, press F to dig, press F again to open.
const digSpots   = [];
const digSpotMap = {};
function makeDigSpot(c, r, chestType, flower) {
  const ds = { col: c, row: r, dug: false, chestOpen: false, chestType, flower: flower || null };
  digSpots.push(ds);
  digSpotMap[`${c},${r}`] = ds;
  return ds;
}
function isDigSpotTile(c, r) { return !!digSpotMap[`${c},${r}`]; }
makeDigSpot(Math.floor(64 / 2), 35, 'fancy', null);     // centre
makeDigSpot(3, 3, 'splendid', 'emerald');               // top-left, marked by an emerald flower

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

  // Trees: random scatter of all kinds across the whole map.
  // One object per tile is guaranteed — we only place on empty grass and skip
  // any tile already claimed by a chest, the monument, or the dig spot.
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (map[r][c] !== T.GRASS) continue;
      if (chestMap[`${c},${r}`])             continue;
      if (monumentBlocked[`${c},${r}`])      continue;
      if (isDigSpotTile(c, r)) continue;
      if (c === SHOP_COL  && r === SHOP_ROW)  continue;
      if (c === STOVE_COL && r === STOVE_ROW) continue;
      if (rng(c, r, 31) >= 0.04) continue; // ~4% of grass tiles become a tree (⅔ of original)
      const tv = rng(c, r, 53);
      const half = rng(c, r, 71) < 0.5; // used to thin round & pine trees by half
      if      (tv < 0.45) { if (half) continue; map[r][c] = T.TREE; } // round (halved)
      else if (tv < 0.65) { if (half) continue; map[r][c] = T.PINE; } // pine  (halved)
      else if (tv < 0.80) {
        // palms only grow next to a sandy bay
        let nearSand = false;
        for (const [dr, dc] of ortho) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && map[nr][nc] === T.SAND) {
            nearSand = true; break;
          }
        }
        if (nearSand) map[r][c] = T.PALM;
      }
      else if (tv < 0.90) map[r][c] = T.APPLE;
      else                map[r][c] = T.CHERRY;
    }
  }

  // A few palms growing right on the sandy bay (ground stays sand under them)
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (map[r][c] !== T.SAND) continue;
      if (isDigSpotTile(c, r)) continue;
      if (rng(c, r, 83) < 0.08) {
        map[r][c] = T.PALM;
        palmOnSand[`${c},${r}`] = true;
      }
    }
  }

  // Keep chest tiles clear
  // Clear only trees from under chests (a chest may deliberately sit on water,
  // e.g. one placed in the centre of a pond, so don't wipe water/sand).
  for (const ch of chests) {
    const ct = map[ch.row][ch.col];
    if (ct === T.TREE || ct === T.PINE || ct === T.PALM || ct === T.CHERRY || ct === T.APPLE)
      map[ch.row][ch.col] = T.GRASS;
  }

  // Keep monument plinth clear
  for (const key in monumentBlocked) {
    const [c, r] = key.split(',').map(Number);
    map[r][c] = T.GRASS;
  }

  // Scatter flowers and sunflowers on empty grass only (one object per tile)
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (map[r][c] !== T.GRASS) continue;
      if (chestMap[`${c},${r}`])        continue;
      if (monumentBlocked[`${c},${r}`]) continue;
      if (isDigSpotTile(c, r))          continue;
      if (c === SHOP_COL  && r === SHOP_ROW)  continue;
      if (c === STOVE_COL && r === STOVE_ROW) continue;
      const v = rng(c, r, 42);
      if      (v < 0.006) decorations.push({ col: c, row: r, type: 'sunflower' });
      else if (v < 0.036) decorations.push({ col: c, row: r, type: 'flower' });
    }
  }

  // Emerald flower markers over flower-marked dig spots (e.g. the top-left one)
  for (const ds of digSpots) {
    if (ds.flower) decorations.push({ col: ds.col, row: ds.row, type: ds.flower });
  }

  // ── Canonical admin snapshot ──────────────────────────────────────────────
  // If the admin has ever saved the map, restore the exact tile state they set.
  // This makes admin changes completely independent of procedural generation —
  // code updates never reset the map the admin configured.
  try {
    // Server-published canonical takes priority over local admin snapshot
    const serverCanon = (typeof window !== 'undefined' && window.PUBLISHED_CANONICAL) || null;
    const localCanon  = JSON.parse(localStorage.getItem('mapExplorerCanonical') || 'null');
    const canon = serverCanon || localCanon;
    if (canon && Array.isArray(canon.map) && canon.map.length === ROWS * COLS) {
      canon.map.forEach((v, i) => { map[Math.floor(i / COLS)][i % COLS] = v; });
      // Restore decorations — keep only 2/5 of flowers/sunflowers (deterministic thinning)
      decorations.length = 0;
      for (const d of (canon.decos || [])) {
        if ((d.type === 'flower' || d.type === 'sunflower') && rng(d.col, d.row, 919) >= 0.6) continue;
        decorations.push(d);
      }
      for (const ds of digSpots) {
        if (ds.flower && !decorations.some(d => d.col === ds.col && d.row === ds.row))
          decorations.push({ col: ds.col, row: ds.row, type: ds.flower });
      }
      // Restore palmOnSand for palms that are on sand tiles
      for (const k in palmOnSand) delete palmOnSand[k];
      for (const [ks, v] of Object.entries(canon.palmOnSand || {})) palmOnSand[ks] = v;
    }
  } catch (_) {}

  // Initialise bridge tiles for each pond
  for (const p of ponds) {
    const tiles = [];
    const southRow = p.cy + Math.ceil(p.ry);
    // Extend 1 extra tile for the pond that has a chest above its centre
    const northEnd = (p.cx === 20 && p.cy === 38) ? p.cy - 1 : p.cy;
    for (let r = southRow; r >= northEnd; r--) {
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

// ── Palm tree data (some carry pickable coconuts) ─────────────────────────────
const palmTrees = [];
const palmTreeMap = {};
function makePalmTree(c, r) {
  // ~40% of palms bear 1–3 coconuts
  const coconuts = rng(c, r, 44) < 0.4 ? Math.floor(rng(c, r, 45) * 3) + 1 : 0;
  const pt = { col: c, row: r, coconuts };
  palmTrees.push(pt);
  palmTreeMap[`${c},${r}`] = pt;
  return pt;
}
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    if (map[r][c] === T.PALM) makePalmTree(c, r);
  }
}

// ── Berry bushes ──────────────────────────────────────────────────────────────
const berryBushes   = [];
const berryBushMap  = {};
const BERRY_REGEN_MS = 60000; // 60 s real time (timestamp-based, frame-rate independent)
let   berryPickAnim = null;   // { timer, maxTimer, particles, color }

// Offscreen canvas — static berry art baked here; only one drawImage per frame in draw()
const berryCanvas  = document.createElement('canvas');
berryCanvas.width  = COLS * TILE;
berryCanvas.height = ROWS * TILE;
const bctx         = berryCanvas.getContext('2d');

// Fixed particle pool — objects are reset on each pick, never allocated mid-game
const PARTICLE_POOL = Array.from({ length: 10 }, () =>
  ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, size: 0 }));

// ── Fishing system ────────────────────────────────────────────────────────────
const FISH_TYPES = [
  { key: 'grass_carp', nameZh: '草鱼',  nameEn: 'Grass Carp', prob: 0.50, decay: 8,  boost: 15, hold: 3 },
  { key: 'red_carp',   nameZh: '红鲤鱼', nameEn: 'Red Carp',   prob: 0.85, decay: 12, boost: 12, hold: 4 },
  { key: 'goldfish',   nameZh: '金鱼',   nameEn: 'Goldfish',   prob: 1.00, decay: 20, boost: 8,  hold: 6 },
];
const fishingSpots = [];
let fishingOpen = false;
let fishing = null; // { phase, hookAngle, lineLen, lineLenTarget, waitTimer, biteAnim, fish, tension, holdTimer, result, resultTimer, swimFish, bubbles }
let cookingMinigame = null; // { recipe, qty, pointer, dir, speed, phase, zone, resultTimer, particles }

// ── Map editor: persistent layered tile edits (admin mode) ────────────────────
// Each edited tile is stored as { t: terrainBrush, o?: objectBrush } so an object
// (chest / flower) can sit on top of any terrain (e.g. a chest on dirt) and both
// survive across sessions. Edits are re-applied over the procedural map on load.
const TERRAIN_BRUSHES = ['grass', 'dirt', 'sand', 'water', 'tree', 'pine', 'palm', 'cherry', 'apple'];
const OBJECT_BRUSHES  = ['flower', 'sunflower',
  'chest', 'chestFancy', 'chestPrecious', 'chestSplendid',
  'digChest', 'digFancy', 'digPrecious', 'digSplendid'];
const TREE_BRUSHES    = ['tree', 'pine', 'palm', 'cherry', 'apple'];
const CHEST_BRUSH_TYPE = {
  chest: 'normal', chestFancy: 'fancy', chestPrecious: 'precious', chestSplendid: 'splendid',
};
// Buried-chest (dig spot) brushes → chest type
const DIG_BRUSH_TYPE = {
  digChest: 'normal', digFancy: 'fancy', digPrecious: 'precious', digSplendid: 'splendid',
};

let mapEdits = {};
try { mapEdits = JSON.parse(localStorage.getItem('mapExplorerEdits') || '{}'); } catch (_) {}
function saveMapEdits() {
  try { localStorage.setItem('mapExplorerEdits', JSON.stringify(mapEdits)); } catch (_) {}
}

// Save the COMPLETE current map state so code updates never reset admin changes.
function saveCanonical() {
  const flat = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      flat.push(map[r][c]);
  const decos = decorations.map(d => ({ col: d.col, row: d.row, type: d.type }));
  const ps = {};
  for (const k in palmOnSand) ps[k] = true;
  const data = { map: flat, decos, palmOnSand: ps };

  // 1) 本地备份
  try { localStorage.setItem('mapExplorerCanonical', JSON.stringify(data)); } catch (_) {}

  // 2) 同步到 Firebase（所有玩家实时更新）
  if (window.__firebase) {
    window.__firebase.saveCanonical(data).then(ok => {
      if (ok) {
        const btn = document.getElementById('adminSaveBtn');
        if (btn) { btn.textContent = '☁️ 已同步'; setTimeout(() => { btn.textContent = '💾 存档'; }, 2000); }
      }
    });
  }
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
  const pi = palmTrees.findIndex(a => a.col === c && a.row === r);
  if (pi >= 0) palmTrees.splice(pi, 1);
  if (palmTreeMap[k]) delete palmTreeMap[k];
  delete palmOnSand[k];
  for (let i = decorations.length - 1; i >= 0; i--) {
    if (decorations[i].col === c && decorations[i].row === r) decorations.splice(i, 1);
  }
  if (digSpotMap[k]) {
    const di = digSpots.indexOf(digSpotMap[k]);
    if (di >= 0) digSpots.splice(di, 1);
    delete digSpotMap[k];
  }
}

function setTerrain(c, r, terr) {
  switch (terr) {
    case 'dirt':  map[r][c] = T.DIRT;  break;
    case 'sand':  map[r][c] = T.SAND;  break;
    case 'water': map[r][c] = T.WATER; break;
    case 'tree':  map[r][c] = T.TREE;  break;
    case 'pine':  map[r][c] = T.PINE;  break;
    case 'palm':  map[r][c] = T.PALM;  makePalmTree(c, r); break;
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
  } else if (DIG_BRUSH_TYPE[o]) {
    makeDigSpot(c, r, DIG_BRUSH_TYPE[o], null); // buried chest, dig to reveal
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
generateBerryBushes();
loadBerryState();
renderBerryCanvas();
generateFishingSpots();

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
    pressPickCherry: '按 F 摘樱花', pressPickCoconut: '按 F 摘椰子', pressOpenBuried: '按 F 开启宝箱',
    coconut: (n) => `椰子 x${n}`, selectHint: '滚轮/方向键选择 · F 或点击确认',
    chest:      (g, d) => `宝箱！金币 x${g}  钻石 x${d}  小红花 x1`,
    fancyChest: (g, d) => `精致宝箱！金币 x${g}  钻石 x${d}  小红花 x2`,
    apple:      (n)    => `苹果 x${n}`,
    flower:     (n)    => `小红花 x${n}`,
    redeem: '兑换码', redeemPlaceholder: '输入兑换码',
    adminTitle: '地图编辑器', adminBrushLabel: '画笔', adminHint: '点击或拖动编辑，自动保存。草地=擦除',
    resetMap: '重置地图', exitAdmin: '退出', adminOn: '已进入管理员模式', publish: '发布到官网', published: '已发布！请将 mapdata.js 上传到服务器',
    chestLoot: (name, g, d, f) => `${name}！金币 x${g}  钻石 x${d}  小红花 x${f}`,
    cNormal: '普通的宝箱', cFancy: '精致的宝箱', cPrecious: '珍贵的宝箱', cSplendid: '华丽的宝箱',
    bGrass: '草地(擦除)', bDirt: '泥土', bSand: '沙地', bWater: '水',
    bTree: '圆树', bPine: '松树', bPalm: '棕榈', bCherry: '樱花树', bApple: '苹果树',
    bFlower: '小花', bSunflower: '太阳花',
    bChest: '普通的宝箱', bChestFancy: '精致的宝箱', bChestPrecious: '珍贵的宝箱', bChestSplendid: '华丽的宝箱',
    bDigChest: '地埋·普通', bDigFancy: '地埋·精致', bDigPrecious: '地埋·珍贵', bDigSplendid: '地埋·华丽',
    pressShop: '按 F 进入商店',
    shopTitle: '🏪 小商店', shopClose: '关闭', shopGold: (n) => `当前金币：${n} 💰`,
    shopBuy: '购买', shopPrice: (n) => `${n} 金币`,
    shopNotEnough: '金币不足！', shopBought: (icon, n) => `购买了 ${icon} x${n}`,
    cabbage: '卷心菜', tomato: '番茄', egg: '鸡蛋', rice: '大米', flour: '面粉',
    salt: '盐', sugar: '糖', pepper: '胡椒', meat: '肉',
    pressCook: '按 F 烹饪',
    cookTitle: '🍳 灶台', cookClose: '关闭', cookNeed: '需要',
    cook: '烹饪', cookDone: (icon, name) => `烹饪了 ${icon} ${name}`,
    cookMissing: '食材不足',
    scrambledEgg:  '番茄炒蛋',  candiedApple:  '拔丝苹果',
    steamedRice:   '香喷喷的大米饭', tomatoNoodles: '番茄鸡蛋面',
    tomatoEggRice: '番茄炒蛋盖浇饭',
    friedEgg:       '煎鸡蛋',      eggFriedRice:   '蛋炒饭',
    friedCabbage:   '炒卷心菜',    pepperCabbage:  '椒盐卷心菜',
    cabbagePork:    '卷心菜炒肉',  redBraisedPork: '红烧肉',
    friedPork:      '煎肉排',      mincedMeatRice: '肉末饭',
    tomatoSoup:     '番茄汤',      sweetPancake:   '糖饼',
    adminInvTitle: '背包编辑',
    gold: '金币', diamond: '钻石', redflower: '小红花', apple: '苹果', coconut: '椰子',
    bagTitle: '🎒 背包', bagIngredients: '食材', bagFood: '餐食', bagMaterials: '材料', bagEmpty: '空空如也',
    lumber: '木材', pinecone: '松子', driftBottle: '漂流瓶',
    foundDriftBottle: '🫙 宝箱里藏着一个漂流瓶，快去背包里看看！',
    driftMsgTitle: '漂流瓶里的纸条', driftMsgClose: '收起',
    driftMsgBody: '请在兑换码内输入 Makemerich',
    richCodeOk: '💰 恭喜发财！获得 50,000 金币！', richCodeUsedAlready: '该兑换码已使用过了',
    choppedLumber: '木材 x1', choppedPine: (n) => `木材 x1  松子 x${n}`,
    strawberry: '草莓', blueberry: '蓝莓',
    pressPickStrawberry: '按 F 采摘草莓', pressPickBlueberry: '按 F 采摘蓝莓',
    grass_carp: '草鱼', red_carp: '红鲤鱼', goldfish: '金鱼', fish_meat: '鱼肉',
    bagFish: '鱼类', pressGFish: '[G] 钓鱼',
    slaughterHint: '右键宰杀 → 鱼肉', slaughterDone: '鱼肉 x1',
  },
  en: {
    settings: 'Settings', gender: 'Gender', male: 'Male', female: 'Female',
    clothes: 'Clothes', name: 'Name', language: 'Language', close: 'Close',
    namePlaceholder: 'Enter name',
    pressOpen: 'Press F to open', pressDig: 'Press F to dig',
    pressOpenFancy: 'Press F to open chest', pressPickApple: 'Press F to pick apple',
    pressPickCherry: 'Press F to pick blossom', pressPickCoconut: 'Press F to pick coconut', pressOpenBuried: 'Press F to open chest',
    coconut: (n) => `Coconut x${n}`, selectHint: 'Wheel/Arrows to choose · F or click',
    chest:      (g, d) => `Chest! Gold x${g}  Diamond x${d}  Flower x1`,
    fancyChest: (g, d) => `Fancy chest! Gold x${g}  Diamond x${d}  Flower x2`,
    apple:      (n)    => `Apple x${n}`,
    flower:     (n)    => `Flower x${n}`,
    redeem: 'Redeem', redeemPlaceholder: 'Enter code',
    adminTitle: 'Map Editor', adminBrushLabel: 'Brushes', adminHint: 'Click or drag to edit. Grass = erase',
    resetMap: 'Reset', exitAdmin: 'Exit', adminOn: 'Admin mode enabled', publish: 'Publish', published: 'Published! Upload mapdata.js to your server',
    chestLoot: (name, g, d, f) => `${name}! Gold x${g}  Diamond x${d}  Flower x${f}`,
    cNormal: 'Common Chest', cFancy: 'Exquisite Chest', cPrecious: 'Precious Chest', cSplendid: 'Luxurious Chest',
    bGrass: 'Grass (erase)', bDirt: 'Dirt', bSand: 'Sand', bWater: 'Water',
    bTree: 'Tree', bPine: 'Pine', bPalm: 'Palm', bCherry: 'Cherry', bApple: 'Apple',
    bFlower: 'Flower', bSunflower: 'Sunflower',
    bChest: 'Common Chest', bChestFancy: 'Exquisite Chest', bChestPrecious: 'Precious Chest', bChestSplendid: 'Luxurious Chest',
    bDigChest: 'Buried Common', bDigFancy: 'Buried Exquisite', bDigPrecious: 'Buried Precious', bDigSplendid: 'Buried Luxurious',
    pressShop: 'Press F to enter shop',
    shopTitle: '🏪 Shop', shopClose: 'Close', shopGold: (n) => `Gold: ${n} 💰`,
    shopBuy: 'Buy', shopPrice: (n) => `${n} Gold`,
    shopNotEnough: 'Not enough gold!', shopBought: (icon, n) => `Bought ${icon} x${n}`,
    cabbage: 'Cabbage', tomato: 'Tomato', egg: 'Egg', rice: 'Rice', flour: 'Flour',
    salt: 'Salt', sugar: 'Sugar', pepper: 'Pepper', meat: 'Meat',
    pressCook: 'Press F to cook',
    cookTitle: '🍳 Stove', cookClose: 'Close', cookNeed: 'Needs',
    cook: 'Cook', cookDone: (icon, name) => `Cooked ${icon} ${name}`,
    cookMissing: 'Not enough ingredients',
    scrambledEgg:  'Tomato & Egg Stir-fry', candiedApple:  'Candied Apple',
    steamedRice:   'Fragrant Rice',          tomatoNoodles: 'Tomato Egg Noodles',
    tomatoEggRice: 'Tomato Egg Rice Bowl',
    friedEgg:       'Fried Egg',      eggFriedRice:   'Egg Fried Rice',
    friedCabbage:   'Stir-fried Cabbage', pepperCabbage: 'Pepper Cabbage',
    cabbagePork:    'Cabbage with Pork', redBraisedPork: 'Red-Braised Pork',
    friedPork:      'Pan-fried Pork',    mincedMeatRice: 'Minced Meat Rice',
    tomatoSoup:     'Tomato Soup',       sweetPancake:   'Sweet Pancake',
    adminInvTitle: 'Inventory Editor',
    gold: 'Gold', diamond: 'Diamond', redflower: 'Flower', apple: 'Apple', coconut: 'Coconut',
    bagTitle: '🎒 Backpack', bagIngredients: 'Ingredients', bagFood: 'Food', bagMaterials: 'Materials', bagEmpty: 'Empty',
    lumber: 'Lumber', pinecone: 'Pine Cone', driftBottle: 'Drift Bottle',
    foundDriftBottle: '🫙 The chest hid a drift bottle — check your backpack!',
    driftMsgTitle: 'Message in a Bottle', driftMsgClose: 'Close',
    driftMsgBody: 'Enter Makemerich in the redeem code box',
    richCodeOk: '💰 You\'re rich! +50,000 Gold!', richCodeUsedAlready: 'This code has already been used',
    choppedLumber: 'Lumber x1', choppedPine: (n) => `Lumber x1  Pine Cone x${n}`,
    strawberry: 'Strawberry', blueberry: 'Blueberry',
    pressPickStrawberry: 'Press F to pick Strawberry', pressPickBlueberry: 'Press F to pick Blueberry',
    grass_carp: 'Grass Carp', red_carp: 'Red Carp', goldfish: 'Goldfish', fish_meat: 'Fish Meat',
    bagFish: 'Fish', pressGFish: '[G] Fish',
    slaughterHint: 'Right-click to slaughter → Fish Meat', slaughterDone: 'Fish Meat x1',
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
  return settingsOpen || shopOpen || cookOpen || bagOpen || achOpen || fishingOpen || (e.target && e.target.tagName === 'INPUT');
}
window.addEventListener('keydown', e => {
  // Fishing overlay captures its own keys before isTyping
  if (fishingOpen) {
    if (!e.repeat) {
      if (e.key === ' ' || e.key === 'Spacebar') { handleFishingSpace(); e.preventDefault(); return; }
      if (e.key === 'Escape') { closeFishing(); return; }
    }
    return; // eat all other keys while fishing
  }

  // Cooking mini-game intercepts Space
  if (cookingMinigame) {
    if (!e.repeat && (e.key === ' ' || e.key === 'Spacebar')) { handleCookingSpace(); e.preventDefault(); }
    return;
  }

  if (isTyping(e)) return;
  keys[e.key] = true;

  // G key: open fishing when near a spot
  if ((e.key === 'g' || e.key === 'G') && !e.repeat) { tryOpenFishing(); return; }

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
let interactionRects  = []; // {x, y, w, h, index} in screen space, set during draw
let fishingExitRect   = null; // {x, y, w, h} of the fishing Exit button
let movePath   = [];       // queue of {col, row} tiles for click-to-move
let moveTarget = null;     // {col, row, t} destination marker for drawing
canvas.addEventListener('click', e => {
  // Fishing overlay intercepts all clicks
  if (fishingOpen) {
    // Exit button
    if (fishingExitRect) {
      const r = fishingExitRect;
      if (e.clientX >= r.x && e.clientX <= r.x + r.w &&
          e.clientY >= r.y && e.clientY <= r.y + r.h) {
        closeFishing(); return;
      }
    }
    // Click anywhere else = Space (cast / reel / restart after result)
    if (fishing) { handleFishingSpace(); return; }
    return;
  }

  // Cooking mini-game click = same as Space
  if (cookingMinigame) {
    if (cookingMinigame.phase === 'aim') handleCookingSpace();
    return;
  }

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

  const rect = canvas.getBoundingClientRect();
  const wx = (e.clientX - rect.left) + Math.round(camX);
  const wy = (e.clientY - rect.top)  + Math.round(camY);
  const tc = Math.floor(wx / TILE), tr = Math.floor(wy / TILE);
  if (tc < 0 || tc >= COLS || tr < 0 || tr >= ROWS) return;

  const sc = player.moving ? player.targetCol : player.col;
  const sr = player.moving ? player.targetRow : player.row;
  const adj = Math.max(Math.abs(tc - player.col), Math.abs(tr - player.row)) <= 1;

  // 2) tree: chop if adjacent, else walk to nearest adjacent tile
  if (TREE_TILE_TYPES.has(map[tr][tc])) {
    if (adj) { chopTree(tc, tr); return; }
    walkAdjacentTo(sc, sr, tc, tr);
    return;
  }

  // 3) unwalkable (building, chest, water…) → walk to nearest adjacent tile
  if (!isWalkable(tr, tc)) {
    walkAdjacentTo(sc, sr, tc, tr);
    return;
  }

  // 4) walkable → move directly there
  const path = findPath(sc, sr, tc, tr);
  if (path.length) { movePath = path; moveTarget = { col: tc, row: tr, t: 40 }; }
});

// Walk to the nearest walkable tile adjacent to (tc, tr).
function walkAdjacentTo(sc, sr, tc, tr) {
  let best = null, bestDist = Infinity;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = tr + dr, nc = tc + dc;
      if (!isWalkable(nr, nc)) continue;
      const d = Math.abs(nc - sc) + Math.abs(nr - sr);
      if (d < bestDist) { bestDist = d; best = [nc, nr]; }
    }
  }
  if (!best) return;
  const [bc, br] = best;
  const path = findPath(sc, sr, bc, br);
  if (path.length) { movePath = path; moveTarget = { col: bc, row: br, t: 40 }; }
}

// Paint one tile with the active brush, persist it, and refresh the visuals.
// 'grass' acts as a full eraser; terrain brushes keep any object already there
// (so you can lay dirt under a chest); object brushes keep the terrain.
function paintTile(c, r) {
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return;
  if (monumentBlocked[`${c},${r}`]) return; // monument plinth
  if (BUILDING_TILES.has(`${c},${r}`)) return; // all registered buildings
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
  saveCanonical(); // full snapshot so code updates never reset the map
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
  if (c === SHOP_COL  && r === SHOP_ROW)  return false;
  if (c === STOVE_COL && r === STOVE_ROW) return false;
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
  // 8-directional: orthogonal + diagonal (45°) moves
  const dirs  = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
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
      // Don't cut diagonally through a blocked corner
      if (dc !== 0 && dr !== 0 &&
          !isWalkable(r, c + dc) && !isWalkable(r + dr, c)) continue;
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
  normal:   { g: [1, 10],  d: 2,  f: 1, name: 'cNormal' },
  fancy:    { g: [5, 18],  d: 5,  f: 2, name: 'cFancy' },
  precious: { g: [10, 25], d: 10, f: 3, name: 'cPrecious' },
  splendid: { g: [20, 40], d: 20, f: 5, name: 'cSplendid' },
};
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function doOpenChest(ch) {
  ch.open = true;
  ch.disappearTimer = 240;
  const spec    = CHEST_LOOT[ch.type] || CHEST_LOOT.normal;
  const gold    = randInt(spec.g[0], spec.g[1]);
  const diamond = spec.d; // fixed per chest tier
  inventory.gold      += gold;
  inventory.diamond   += diamond;
  inventory.redflower += spec.f;
  lootMessage = { text: t('chestLoot', t(spec.name), gold, diamond, spec.f), timer: 220 };
  // Pond-centre chest hides a drift bottle
  if (ch.col === 20 && ch.row === 37) {
    inventory.driftBottle = 1;
    saveInventory();
    // Show drift bottle message in the same golden canvas box after chest loot fades (~3.7 s)
    setTimeout(() => {
      lootMessage = { text: t('foundDriftBottle'), timer: 300 };
    }, 3800);
  }
  saveInventory();
  progressAch('chest_' + ch.type);

}

function doDig(ds) { ds.dug = true; }

function doOpenDigChest(ds) {
  ds.chestOpen      = true;
  ds.disappearTimer = 240;
  const spec    = CHEST_LOOT[ds.chestType] || CHEST_LOOT.fancy;
  const gold    = randInt(spec.g[0], spec.g[1]);
  const diamond = spec.d; // fixed per chest tier
  inventory.gold      += gold;
  inventory.diamond   += diamond;
  inventory.redflower += spec.f;
  lootMessage = { text: t('chestLoot', t(spec.name), gold, diamond, spec.f), timer: 240 };
  saveInventory();
  progressAch('chest_' + ds.chestType);

}

function doPickApple(at) {
  at.picked = true;
  inventory.apple += at.count;
  lootMessage = { text: t('apple') + ' x' + at.count, timer: 180 };
  renderTreeCanvas();
  saveInventory();
}

function doPickCherry(ct) {
  ct.flowers--;
  inventory.redflower += 1;
  lootMessage = { text: t('flower', 1), timer: 180 };
  saveInventory();
}

function doPickCoconut(pt) {
  const n = pt.coconuts;
  pt.coconuts = 0;
  inventory.coconut += n;
  lootMessage = { text: t('coconut') + ' x' + n, timer: 180 };
  renderTreeCanvas();
  saveInventory();
}

function doPickBerry(bush) {
  if (bush.picked) return;
  bush.picked  = true;
  bush.regenAt = Date.now() + BERRY_REGEN_MS;
  const count = 1 + Math.floor(Math.random() * 2);
  inventory[bush.type] = (inventory[bush.type] || 0) + count;
  saveInventory();
  saveBerryState();
  renderBerryCanvas();
  // Pooled particle burst
  const wx = bush.col * TILE + 16, wy = bush.row * TILE + 22;
  const n = PARTICLE_POOL.length;
  for (let i = 0; i < n; i++) {
    const p = PARTICLE_POOL[i];
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.6;
    p.x = wx; p.y = wy;
    p.vx = Math.cos(a) * (1.5 + Math.random() * 2);
    p.vy = Math.sin(a) * (1.5 + Math.random() * 2) - 1.5;
    p.life = 1; p.size = 2.5 + Math.random() * 2;
  }
  berryPickAnim = { timer: 48, maxTimer: 48,
    color: bush.type === 'strawberry' ? '#ff4444' : '#5050ee',
    particles: PARTICLE_POOL };
  const zh = settings.language !== 'en';
  const name = zh
    ? (bush.type === 'strawberry' ? '草莓' : '蓝莓')
    : (bush.type === 'strawberry' ? 'Strawberry' : 'Blueberry');
  lootMessage = { text: `${name} x${count}`, timer: 150 };
}

function chopTree(c, r) {
  if (!TREE_TILE_TYPES.has(map[r][c])) return;
  const k = `${c},${r}`;
  treeHits[k] = (treeHits[k] || 0) + 1;
  const treeType = map[r][c];
  shakingTree = { col: c, row: r, type: treeType, timer: 18 };

  if (treeHits[k] >= CHOP_HITS) {
    delete treeHits[k];
    shakingTree = null;
    // Remove tree from map and all live data structures
    removeTileObjects(c, r);
    map[r][c] = T.GRASS;
    const pinecones = (treeType === T.PINE) ? Math.floor(Math.random() * 3) + 1 : 0;
    fallenTrees.push({ col: c, row: r, lumber: 1, pinecones });
    renderTreeCanvas();
    // Auto-walk player to the lumber
    const sc = player.moving ? player.targetCol : player.col;
    const sr = player.moving ? player.targetRow : player.row;
    const path = findPath(sc, sr, c, r);
    if (path.length) { movePath = path; moveTarget = { col: c, row: r, t: 40 }; }
  }
}

function drawTreeByType(g, x, y, type) {
  if      (type === T.TREE)   drawTree(g, x, y);
  else if (type === T.PINE)   drawPineTree(g, x, y);
  else if (type === T.PALM)   drawPalmTree(g, x, y, 0);
  else if (type === T.CHERRY) drawCherryTree(g, x, y);
  else if (type === T.APPLE)  drawAppleTree(g, x, y, 0);
}

function doOpenShop() {
  shopOpen = true;
  for (const k in keys) keys[k] = false;
  openShopUI();
}

function doOpenCooking() {
  cookOpen = true;
  for (const k in keys) keys[k] = false;
  openCookUI();
}

// Build the list of interactions the player can currently reach.
// Each entry: { icon, label, act }
function buildInteractions() {
  const list = [];
  for (const ch of chests) {
    if (!ch.open && near(ch)) list.push({ icon: '💰', label: t('pressOpen'), act: () => doOpenChest(ch) });
  }
  for (const ds of digSpots) {
    if (!near(ds)) continue;
    if (!ds.dug)            list.push({ icon: '⛏️', label: t('pressDig'),        act: () => doDig(ds) });
    else if (!ds.chestOpen) list.push({ icon: '🎁', label: t('pressOpenBuried'), act: () => doOpenDigChest(ds) });
  }
  for (const at of appleTrees) {
    if (!at.picked && near(at)) list.push({ icon: '🍎', label: t('pressPickApple'), act: () => doPickApple(at) });
  }
  for (const ct of cherryTrees) {
    if (ct.flowers > 0 && near(ct)) list.push({ icon: '🌸', label: t('pressPickCherry'), act: () => doPickCherry(ct) });
  }
  for (const pt of palmTrees) {
    if (pt.coconuts > 0 && near(pt)) list.push({ icon: '🥥', label: t('pressPickCoconut'), act: () => doPickCoconut(pt) });
  }
  for (const b of berryBushes) {
    if (!b.picked && near(b))
      list.push({ icon: b.type === 'strawberry' ? '🍓' : '🫐',
                  label: t(b.type === 'strawberry' ? 'pressPickStrawberry' : 'pressPickBlueberry'),
                  act: () => doPickBerry(b) });
  }
  if (Math.abs(player.col - SHOP_COL)  <= 1 && Math.abs(player.row - SHOP_ROW)  <= 1)
    list.push({ icon: '🏪', label: t('pressShop'), act: doOpenShop });
  if (Math.abs(player.col - STOVE_COL) <= 1 && Math.abs(player.row - STOVE_ROW) <= 1)
    list.push({ icon: '🍳', label: t('pressCook'), act: doOpenCooking });
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

function drawPalmTree(g, x, y, coconuts) {
  // trunk (slight curve)
  g.strokeStyle = '#7a5530';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(x + 16, y + 32);
  g.quadraticCurveTo(x + 20, y + 14, x + 18, y + 4);
  g.stroke();
  // coconuts clustered under the crown (drawn before fronds so fronds overlap)
  if (coconuts > 0) {
    const cocoPos = [[12, 8], [22, 9], [17, 12]];
    for (let i = 0; i < coconuts && i < cocoPos.length; i++) {
      g.fillStyle = '#5a3318';
      g.beginPath();
      g.arc(x + cocoPos[i][0], y + cocoPos[i][1], 3, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#7a4a26';
      g.beginPath();
      g.arc(x + cocoPos[i][0] - 1, y + cocoPos[i][1] - 1, 1, 0, Math.PI * 2);
      g.fill();
    }
  }
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
  if (type === 'emerald') {
    // jade/emerald-green flower marking a buried treasure
    g.fillStyle = '#1f7a52';
    g.fillRect(x + 15, y + 18, 2, 12);
    const petals = ['#1fd190', '#19b87a', '#2fe6a6'];
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI * 2 / 6;
      g.fillStyle = petals[i % petals.length];
      g.beginPath();
      g.ellipse(x + 16 + Math.cos(a) * 5, y + 16 + Math.sin(a) * 5, 3.2, 2.2, a, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#0c5c3a';
    g.beginPath();
    g.arc(x + 16, y + 16, 2.6, 0, Math.PI * 2);
    g.fill();
    return;
  }
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

// ── Tier-2 exquisite chest (blue-grey body, silver trim) ──────────────────────
function drawFancyChest(x, y, open) {
  const BOT = y + 31, bodyH = 15, lidH = 10;
  const bodyTop = BOT - bodyH;
  // feet
  ctx.fillStyle = '#38404a';
  ctx.fillRect(x + 4, BOT - 4, 5, 4);
  ctx.fillRect(x + TILE - 9, BOT - 4, 5, 4);
  if (!open) {
    ctx.fillStyle = '#3a4a5e';           // blue-grey body
    ctx.fillRect(x + 4, bodyTop, TILE - 8, bodyH);
    ctx.fillStyle = '#a0c0d8';           // silver-blue trim
    ctx.fillRect(x + 4, bodyTop + 3, TILE - 8, 2);
    ctx.fillRect(x + 4, bodyTop + bodyH - 3, TILE - 8, 2);
    ctx.fillStyle = '#28384c';           // darker lid
    ctx.fillRect(x + 4, bodyTop - lidH, TILE - 8, lidH);
    ctx.fillStyle = '#a0c0d8';
    ctx.fillRect(x + 4,        bodyTop, 3, bodyH);
    ctx.fillRect(x + TILE - 7, bodyTop, 3, bodyH);
    ctx.fillStyle = '#60e0ff';           // cyan gem
    ctx.beginPath();
    ctx.arc(x + 16, bodyTop + bodyH / 2, 4, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = '#3a4a5e';
    ctx.fillRect(x + 4, bodyTop, TILE - 8, bodyH);
    ctx.fillStyle = '#181e28';
    ctx.fillRect(x + 5, bodyTop, TILE - 10, 6);
    ctx.fillStyle = '#20283a';
    ctx.fillRect(x + 5, bodyTop + 5, TILE - 10, 2);
    _chestLid(x - 1, bodyTop, lidH + 5, '#28384c', '#3a4a5e', '#a0c0d8');
    ctx.fillStyle = '#3a4a5e';
    ctx.beginPath();
    ctx.ellipse(x + 15, bodyTop - lidH - 1, 9, 4, 0, Math.PI, 0);
    ctx.fill();
  }
}

// ── Tier-3 precious chest (purple) ───────────────────────────────────────────
function drawPreciousChest(x, y, open) {
  const BOT = y + 31, bodyH = 16, lidH = 12;
  const bodyTop = BOT - bodyH;
  ctx.fillStyle = '#4a2860';            // dark purple feet
  ctx.fillRect(x + 3, BOT - 5, 6, 5);
  ctx.fillRect(x + TILE - 9, BOT - 5, 6, 5);
  if (!open) {
    ctx.fillStyle = '#5a2878';          // purple body
    ctx.fillRect(x + 3, bodyTop, TILE - 6, bodyH);
    ctx.fillStyle = '#c080f0';          // lavender trim
    ctx.fillRect(x + 3, bodyTop + 3, TILE - 6, 2);
    ctx.fillRect(x + 3, bodyTop + bodyH - 3, TILE - 6, 2);
    ctx.fillStyle = '#3a1858';          // darker purple lid
    ctx.fillRect(x + 3, bodyTop - lidH, TILE - 6, lidH);
    ctx.fillStyle = '#c080f0';
    ctx.fillRect(x + 3,        bodyTop, 3, bodyH);
    ctx.fillRect(x + TILE - 6, bodyTop, 3, bodyH);
    ctx.fillStyle = '#e040ff';          // bright purple gem
    ctx.beginPath();
    ctx.arc(x + 16, bodyTop + bodyH / 2, 4, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = '#5a2878';
    ctx.fillRect(x + 3, bodyTop, TILE - 6, bodyH);
    ctx.fillStyle = '#200c30';
    ctx.fillRect(x + 4, bodyTop, TILE - 8, 6);
    ctx.fillStyle = '#301048';
    ctx.fillRect(x + 4, bodyTop + 5, TILE - 8, 2);
    _chestLid(x - 1, bodyTop, lidH + 6, '#3a1858', '#5a2878', '#c080f0');
    ctx.fillStyle = '#e040ff';
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
      else if (t === T.PALM && palmOnSand[`${c},${r}`]) drawSand(mctx, x, y, seed[r][c]);
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
      else if (t === T.PALM)   {
        const pt = palmTreeMap[`${c},${r}`];
        drawPalmTree(tctx, c * TILE, r * TILE, pt ? pt.coconuts : 0);
      }
      else if (t === T.CHERRY) drawCherryTree(tctx, c * TILE, r * TILE);
      else if (t === T.APPLE)  {
        const at = appleTreeMap[`${c},${r}`];
        drawAppleTree(tctx, c * TILE, r * TILE, at && !at.picked ? at.count : 0);
      }
    }
  }
  drawMonument(tctx);
  drawShopBuilding(tctx);
  drawStoveBuilding(tctx);
}

function drawShopBuilding(g) {
  const x = SHOP_COL * TILE, y = SHOP_ROW * TILE;
  // Shadow
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(x - 4, y + 44, 44, 6);
  // Wall
  g.fillStyle = '#d4a85a';
  g.fillRect(x - 2, y + 8, 38, 38);
  // Door
  g.fillStyle = '#7a4a18';
  g.fillRect(x + 11, y + 26, 12, 20);
  // Door knob
  g.fillStyle = '#ffd84d';
  g.beginPath(); g.arc(x + 21, y + 36, 2, 0, Math.PI * 2); g.fill();
  // Window left
  g.fillStyle = '#b0d8f0';
  g.fillRect(x, y + 16, 9, 8);
  g.strokeStyle = '#7a4a18'; g.lineWidth = 1;
  g.strokeRect(x, y + 16, 9, 8);
  g.beginPath(); g.moveTo(x + 4, y + 16); g.lineTo(x + 4, y + 24); g.stroke();
  // Window right
  g.fillStyle = '#b0d8f0';
  g.fillRect(x + 25, y + 16, 9, 8);
  g.strokeRect(x + 25, y + 16, 9, 8);
  g.beginPath(); g.moveTo(x + 29, y + 16); g.lineTo(x + 29, y + 24); g.stroke();
  // Roof (triangle)
  g.fillStyle = '#c0392b';
  g.beginPath();
  g.moveTo(x - 6, y + 10);
  g.lineTo(x + 18, y - 14);
  g.lineTo(x + 42, y + 10);
  g.closePath();
  g.fill();
  // Roof ridge
  g.fillStyle = '#96241c';
  g.beginPath();
  g.moveTo(x + 18, y - 14);
  g.lineTo(x + 42, y + 10);
  g.lineTo(x + 18, y - 12);
  g.closePath();
  g.fill();
  // Sign above door
  g.fillStyle = '#ffd84d';
  g.fillRect(x + 6, y + 1, 22, 10);
  g.fillStyle = '#7a4a18';
  g.font = 'bold 7px sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('SHOP', x + 17, y + 6);
}

function drawStoveBuilding(g) {
  const x = STOVE_COL * TILE, y = STOVE_ROW * TILE;
  // Body
  g.fillStyle = '#555560';
  g.fillRect(x + 2, y + 10, 28, 28);
  // Top surface (burner plate)
  g.fillStyle = '#404050';
  g.fillRect(x + 2, y + 6, 28, 8);
  // Four burner rings (static)
  for (const [bx, by] of [[9,10],[23,10],[9,22],[23,22]]) {
    g.fillStyle = '#282838';
    g.beginPath(); g.arc(x + bx, y + by, 4, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#555'; g.lineWidth = 1;
    g.beginPath(); g.arc(x + bx, y + by, 5, 0, Math.PI * 2); g.stroke();
  }
  // Front panel
  g.fillStyle = '#4a4a58';
  g.fillRect(x + 4, y + 26, 24, 10);
  g.fillStyle = '#333340';
  g.fillRect(x + 6, y + 28, 20, 6);
  // Sign
  g.fillStyle = '#ff8800';
  g.fillRect(x + 5, y + 1, 22, 7);
  g.fillStyle = '#fff';
  g.font = 'bold 6px sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('STOVE', x + 16, y + 4);
}

// Draw animated stove flames — called every frame in draw() (world-space, before tree overlay)
function drawStoveFlames() {
  const x = STOVE_COL * TILE, y = STOVE_ROW * TILE;
  const burners = [[9,10],[23,10],[9,22],[23,22]];
  const phase = (tick >> 3) % 4;
  const flameColors = ['#ff6020','#ff8800','#ffaa00'];
  for (let i = 0; i < burners.length; i++) {
    if ((i + phase) % 2 !== 0) continue; // alternate flicker
    const [bx, by] = burners[i];
    ctx.fillStyle = flameColors[(tick >> 2) % flameColors.length];
    ctx.beginPath();
    ctx.moveTo(x + bx,     y + by - 6);
    ctx.lineTo(x + bx - 3, y + by - 1);
    ctx.lineTo(x + bx + 3, y + by - 1);
    ctx.closePath();
    ctx.fill();
  }
}

// ── Berry bush system ─────────────────────────────────────────────────────────
function generateBerryBushes() {
  berryBushes.length = 0;
  for (const k in berryBushMap) delete berryBushMap[k];
  const decoSet = new Set(decorations.map(d => `${d.col},${d.row}`));
  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      if (map[r][c] !== T.GRASS) continue;
      if (chestMap[`${c},${r}`])        continue;
      if (monumentBlocked[`${c},${r}`]) continue;
      if (isDigSpotTile(c, r))          continue;
      if (c === SHOP_COL && r === SHOP_ROW)   continue;
      if (c === STOVE_COL && r === STOVE_ROW) continue;
      if (decoSet.has(`${c},${r}`))     continue;
      const rv = rng(c, r, 157);
      let type = null;
      if      (rv < 0.006) type = 'strawberry';
      else if (rv < 0.012) type = 'blueberry';
      if (!type) continue;
      const b = { col: c, row: r, type, picked: false, regenAt: 0 };
      berryBushes.push(b);
      berryBushMap[`${c},${r}`] = b;
    }
  }
}

function saveBerryState() {
  const state = {};
  for (const b of berryBushes) {
    if (b.picked && b.regenAt) state[`${b.col},${b.row}`] = b.regenAt;
  }
  try { localStorage.setItem('mygame_berryState', JSON.stringify(state)); } catch (_) {}
}

function loadBerryState() {
  try {
    const state = JSON.parse(localStorage.getItem('mygame_berryState') || '{}');
    const now = Date.now();
    for (const b of berryBushes) {
      const exp = state[`${b.col},${b.row}`];
      if (exp && exp > now) { b.picked = true; b.regenAt = exp; }
    }
  } catch (_) {}
}

function renderBerryCanvas() {
  bctx.clearRect(0, 0, berryCanvas.width, berryCanvas.height);
  for (const b of berryBushes) {
    if (b.type === 'strawberry') drawStrawberryBush(bctx, b.col * TILE, b.row * TILE, b.picked);
    else                         drawBlueberryBush(bctx, b.col * TILE, b.row * TILE, b.picked);
  }
}

// Berry world-space hints removed — interaction bar above player already shows the prompt.
function drawBerryHints() {}

function drawStrawberryBush(g, x, y, picked) {
  if (picked) {
    g.fillStyle = '#888880';
    g.beginPath(); g.ellipse(x + 16, y + 23, 6, 3, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#606058';
    g.fillRect(x + 14, y + 26, 4, 3);
    return;
  }
  // leaves
  g.fillStyle = '#2a9a22';
  g.beginPath(); g.ellipse(x + 10, y + 21, 6,   3.5, -0.4, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(x + 22, y + 21, 6,   3.5,  0.4, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(x + 16, y + 19, 7.5, 3.5,    0, 0, Math.PI * 2); g.fill();
  // berries
  for (const [bx2, by2] of [[12,24],[20,23],[16,28]]) {
    g.fillStyle = '#cc1818';
    g.beginPath(); g.arc(x + bx2, y + by2, 3.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ff5050';
    g.beginPath(); g.arc(x + bx2 - 1, y + by2 - 1, 1.2, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1a8818';
    g.fillRect(x + bx2 - 1, y + by2 - 5, 2, 3);
  }
}

function drawBlueberryBush(g, x, y, picked) {
  if (picked) {
    g.fillStyle = '#888880';
    g.beginPath(); g.ellipse(x + 16, y + 23, 6, 3, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#606058';
    g.fillRect(x + 14, y + 26, 4, 3);
    return;
  }
  // leaves
  g.fillStyle = '#1a7a28';
  g.beginPath(); g.ellipse(x + 10, y + 21, 5.5, 3.5, -0.3, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(x + 22, y + 21, 5.5, 3.5,  0.3, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(x + 16, y + 19, 7.5, 3.5,    0, 0, Math.PI * 2); g.fill();
  // berries
  for (const [bx2, by2] of [[11,25],[18,23],[15,28],[21,26]]) {
    g.fillStyle = '#2828c8';
    g.beginPath(); g.arc(x + bx2, y + by2, 3, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#7070ff';
    g.beginPath(); g.arc(x + bx2 - 1, y + by2 - 1, 1, 0, Math.PI * 2); g.fill();
    // tiny crown
    g.fillStyle = '#1010a0';
    for (let di = -1; di <= 1; di++) {
      g.fillRect(x + bx2 + di - 0.5, y + by2 - 4, 1, 2);
    }
  }
}

// ── Fishing functions ─────────────────────────────────────────────────────────
function generateFishingSpots() {
  fishingSpots.length = 0;
  for (let i = 0; i < ponds.length; i++) {
    const p = ponds[i];
    const rxCeil = Math.ceil(p.rx);
    // Alternate right / left — never place on the south (bottom) edge
    let waterCol, waterRow, col, row;
    if (i % 2 === 0) {
      waterCol = p.cx + rxCeil;  waterRow = p.cy;
      col      = waterCol + 1;   row      = p.cy;
    } else {
      waterCol = p.cx - rxCeil;  waterRow = p.cy;
      col      = waterCol - 1;   row      = p.cy;
    }
    col = Math.max(1, Math.min(COLS - 2, col));
    fishingSpots.push({ col, row, waterCol, waterRow });
  }
}

function tryOpenFishing() {
  for (const spot of fishingSpots) {
    if (Math.max(Math.abs(spot.col - player.col), Math.abs(spot.row - player.row)) <= 2) {
      openFishing(); return;
    }
  }
}

function openFishing() {
  fishingOpen = true;
  for (const k in keys) keys[k] = false;
  movePath = []; moveTarget = null;
  const W = canvas.width, H = canvas.height;
  fishing = {
    phase: 'cast',
    lineLen: 0, lineLenTarget: H * 0.42,
    waitTimer: 0, biteAnim: 0, fish: null,
    tension: 70, holdTimer: 0,
    result: null, resultTimer: 0,
    swimFish: Array.from({ length: 4 }, () => ({
      x: Math.random() * W, y: H * 0.35 + Math.random() * H * 0.42,
      vx: (Math.random() > 0.5 ? 1 : -1) * (0.6 + Math.random() * 0.8),
      ti: Math.floor(Math.random() * 3),
    })),
    bubbles: Array.from({ length: 12 }, () => ({
      x: Math.random() * W, y: H * 0.3 + Math.random() * H * 0.65,
      vy: -(0.3 + Math.random() * 0.5), r: 2 + Math.random() * 3, a: 0.2 + Math.random() * 0.35,
    })),
  };
}

function closeFishing() { fishingOpen = false; fishing = null; }

function handleFishingSpace() {
  if (!fishing) return;
  if (fishing.phase === 'cast') {
    fishing.phase = 'wait'; fishing.lineLen = 0;
    fishing.waitTimer = 120 + Math.floor(Math.random() * 180);
  } else if (fishing.phase === 'pull') {
    fishing.tension = Math.min(100, fishing.tension + fishing.fish.boost);
  } else if (fishing.phase === 'result') {
    if (Date.now() - (fishing.resultAt || 0) < 2000) return; // 2-second cooldown
    fishing.phase = 'cast';
    fishing.lineLen = 0; fishing.fish = null;
    fishing.tension = 70; fishing.holdTimer = 0;
    fishing.result = null; fishing.resultTimer = 0; fishing.resultAt = 0;
  }
}

function updateFishing() {
  if (!fishing) return;
  const f = fishing, W = canvas.width, H = canvas.height;
  for (const sf of f.swimFish) {
    sf.x += sf.vx;
    if (sf.x > W + 32) sf.x = -32;
    if (sf.x < -32)    sf.x = W + 32;
  }
  for (const b of f.bubbles) {
    b.y += b.vy;
    if (b.y < H * 0.22) { b.y = H * 0.95; b.x = Math.random() * W; }
  }
  if (f.phase === 'wait') {
    if (f.lineLen < f.lineLenTarget) f.lineLen = Math.min(f.lineLenTarget, f.lineLen + 6);
    if (--f.waitTimer <= 0) {
      const r = Math.random();
      f.fish = FISH_TYPES.find(ft => r < ft.prob) || FISH_TYPES[2];
      f.phase = 'bite'; f.biteAnim = 65;
    }
  } else if (f.phase === 'bite') {
    if (f.lineLen < f.lineLenTarget) f.lineLen = Math.min(f.lineLenTarget, f.lineLen + 6);
    if (--f.biteAnim <= 0) { f.phase = 'pull'; f.tension = 70; f.holdTimer = 0; }
  } else if (f.phase === 'pull') {
    f.tension -= f.fish.decay / 60;
    if (f.tension <= 0) { f.tension = 0; f.phase = 'result'; f.result = 'fail'; f.resultTimer = 180; f.resultAt = Date.now(); }
    if (f.tension >= 60) {
      f.holdTimer += 1 / 60;
      if (f.holdTimer >= f.fish.hold) {
        f.phase = 'result'; f.result = 'success'; f.resultTimer = 0; f.resultAt = Date.now();
        inventory[f.fish.key] = (inventory[f.fish.key] || 0) + 1;
        saveInventory();
        lootMessage = { text: (settings.language !== 'en' ? f.fish.nameZh : f.fish.nameEn) + ' x1', timer: 200 };
      }
    }
  } // result phase: only closed by key press, never auto-closed
}

function drawFishingUI() {
  if (!fishing) return;
  const f = fishing, W = canvas.width, H = canvas.height;
  const waterY = H * 0.22, zh = settings.language !== 'en';
  const rodTipX = W * 0.5, rodTipY = waterY - 65;

  // Background: black + deep water
  ctx.fillStyle = 'rgba(0,0,0,0.92)'; ctx.fillRect(0, 0, W, H);
  const wg = ctx.createLinearGradient(0, waterY, 0, H);
  wg.addColorStop(0, '#0d3a6e'); wg.addColorStop(1, '#020c24');
  ctx.fillStyle = wg; ctx.fillRect(0, waterY, W, H - waterY);

  // Water surface
  ctx.save();
  ctx.strokeStyle = 'rgba(80,180,255,0.5)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, waterY); ctx.lineTo(W, waterY); ctx.stroke();
  ctx.restore();

  // Bubbles
  ctx.save();
  for (const b of f.bubbles) {
    if (b.y < waterY) continue;
    ctx.globalAlpha = b.a; ctx.strokeStyle = 'rgba(150,220,255,0.8)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();

  // Decorative fish — sprites face LEFT by default; flip when vx > 0 (moving right)
  ctx.save(); ctx.globalAlpha = 0.4;
  for (const sf of f.swimFish) {
    if (sf.y < waterY + 6) continue;
    ctx.save();
    if (sf.vx > 0) { ctx.translate(sf.x * 2, 0); ctx.scale(-1, 1); } // face right when going right
    drawFishSprite(ctx, sf.ti, sf.x, sf.y, 10);
    ctx.restore();
  }
  ctx.restore();

  // Fishing rod
  ctx.save();
  ctx.strokeStyle = '#7a5030'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(W * 0.14, H * 0.06); ctx.lineTo(rodTipX, rodTipY); ctx.stroke();
  ctx.restore();

  // Phase-specific drawing
  if (f.phase === 'cast') {
    const angle = Math.sin(tick * 0.052) * Math.PI / 4, lineLen = 54;
    const hookX = rodTipX + Math.sin(angle) * lineLen, hookY = rodTipY + Math.cos(angle) * lineLen;
    ctx.strokeStyle = '#c8d0dc'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(rodTipX, rodTipY); ctx.lineTo(hookX, hookY); ctx.stroke();
    drawHookShape(ctx, hookX, hookY, 8);
    ctx.fillStyle = '#ffd84d'; ctx.font = '700 16px ' + UI_FONT; ctx.textAlign = 'center';
    ctx.fillText(zh ? '按 [空格] 抛竿' : 'Press [Space] to cast', W / 2, H - 48);

  } else if (f.phase === 'wait' || f.phase === 'bite') {
    const hookY = waterY + f.lineLen;
    ctx.strokeStyle = '#c8d0dc'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(rodTipX, rodTipY); ctx.lineTo(rodTipX, waterY); ctx.stroke();
    ctx.save(); ctx.setLineDash([4, 4]); ctx.globalAlpha = 0.65;
    ctx.beginPath(); ctx.moveTo(rodTipX, waterY); ctx.lineTo(rodTipX, hookY); ctx.stroke();
    ctx.restore();
    drawHookShape(ctx, rodTipX, hookY, 8);
    if (f.phase === 'bite' && f.fish) {
      const prog = 1 - f.biteAnim / 65;
      const fishX = rodTipX + (1 - prog) * W * 0.22;
      ctx.save(); ctx.globalAlpha = 0.9; drawFishSprite(ctx, FISH_TYPES.indexOf(f.fish), fishX, hookY, 15); ctx.restore();
      ctx.fillStyle = '#ffff40'; ctx.font = 'bold 24px ' + UI_FONT; ctx.textAlign = 'center';
      ctx.fillText('!', fishX, hookY - 26);
    } else {
      ctx.fillStyle = 'rgba(200,200,200,0.5)'; ctx.font = '14px ' + UI_FONT; ctx.textAlign = 'center';
      ctx.fillText(zh ? '等待咬钩...' : 'Waiting for bite...', W / 2, H - 48);
    }

  } else if (f.phase === 'pull') {
    const barW = Math.min(370, W * 0.62), barH = 28, barX = (W - barW) / 2, barY = 38;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; roundRectPath(ctx, barX - 8, barY - 8, barW + 16, barH + 16, 8); ctx.fill();
    ctx.fillStyle = '#2050b8'; ctx.fillRect(barX, barY, barW * 0.6, barH);
    ctx.fillStyle = '#18883a'; ctx.fillRect(barX + barW * 0.6, barY, barW * 0.4, barH);
    const ptrX = barX + (f.tension / 100) * barW;
    ctx.fillStyle = '#fff'; ctx.fillRect(ptrX - 3, barY - 5, 6, barH + 10);
    ctx.fillStyle = '#ffd84d'; ctx.font = '600 12px ' + UI_FONT; ctx.textAlign = 'center';
    ctx.fillText(zh ? '拉力' : 'Tension', W / 2, barY - 12);
    if (f.tension >= 60) {
      ctx.fillStyle = '#50ff80';
      ctx.fillText(`${f.holdTimer.toFixed(1)}s / ${f.fish.hold}s`, W / 2, barY + barH + 16);
    }
    const shakeX = Math.sin(tick * 0.4) * 6;
    ctx.save(); ctx.globalAlpha = 0.95; drawFishSprite(ctx, FISH_TYPES.indexOf(f.fish), W / 2 + shakeX, H * 0.54, 28); ctx.restore();
    ctx.strokeStyle = 'rgba(200,210,220,0.6)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(rodTipX, rodTipY); ctx.lineTo(W / 2 + shakeX, H * 0.54 - 24); ctx.stroke();
    ctx.fillStyle = '#ffd84d'; ctx.font = '700 16px ' + UI_FONT; ctx.textAlign = 'center';
    ctx.fillText(zh ? '按 [空格] 拉鱼！' : 'Press [Space] to reel in!', W / 2, H - 48);

  } else if (f.phase === 'result') {
    ctx.textAlign = 'center';
    if (f.result === 'success') {
      ctx.fillStyle = '#ffd84d'; ctx.font = 'bold 28px ' + UI_FONT;
      ctx.fillText(zh ? '钓鱼成功！' : 'Fish Caught!', W / 2, H * 0.24);
      ctx.save(); ctx.globalAlpha = 0.95; drawFishSprite(ctx, FISH_TYPES.indexOf(f.fish), W / 2, H * 0.46, 42); ctx.restore();
      ctx.fillStyle = '#fff'; ctx.font = '600 20px ' + UI_FONT;
      ctx.fillText(zh ? f.fish.nameZh : f.fish.nameEn, W / 2, H * 0.63);
    } else {
      ctx.fillStyle = '#ff6060'; ctx.font = 'bold 28px ' + UI_FONT;
      ctx.fillText(zh ? '鱼跑了！' : 'Fish Got Away!', W / 2, H * 0.44);
    }
    ctx.fillStyle = '#ffd84d'; ctx.font = '600 14px ' + UI_FONT;
    ctx.fillText(zh ? '[空格] 或点击 继续钓鱼' : '[Space] or click to fish again', W / 2, H * 0.79);
  }

  // Exit button (top-right, mouse-clickable)
  const btnW = 80, btnH = 28, btnX = W - btnW - 12, btnY = 64;
  roundRectPath(ctx, btnX, btnY, btnW, btnH, 8);
  ctx.fillStyle = 'rgba(160,40,40,0.92)'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,120,120,0.5)'; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = '600 13px ' + UI_FONT;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(zh ? '退出钓鱼' : 'Exit Fishing', btnX + btnW / 2, btnY + btnH / 2);
  fishingExitRect = { x: btnX, y: btnY, w: btnW, h: btnH };
}

function drawHookShape(g, x, y, s) {
  g.save();
  g.strokeStyle = '#c0ccd8'; g.lineWidth = Math.max(1.5, s * 0.18);
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x, y - s * 0.9);
  g.lineTo(x, y + s * 0.45);
  g.arc(x + s * 0.5, y + s * 0.45, s * 0.5, Math.PI, 0);
  g.lineTo(x + s, y + s * 0.2);
  g.stroke();
  g.restore();
}

function drawFishSprite(g, typeIdx, x, y, s) {
  if (typeIdx === 0) _drawGrassCarp(g, x, y, s);
  else if (typeIdx === 1) _drawRedCarp(g, x, y, s);
  else _drawGoldfish(g, x, y, s);
}

// Sprites face LEFT: head/eye on LEFT, tail fin on RIGHT.
// When fish moves right (vx>0) the caller flips so it faces right.
function _drawGrassCarp(g, x, y, s) {
  g.fillStyle = '#4e601e';
  g.beginPath(); g.ellipse(x, y, s * 1.6, s * 0.55, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#728830';
  g.beginPath(); g.ellipse(x - s * 0.28, y - s * 0.08, s * 0.95, s * 0.36, 0, 0, Math.PI * 2); g.fill();
  // Tail fin on RIGHT
  g.fillStyle = '#3e501a';
  g.beginPath(); g.moveTo(x + s * 1.38, y); g.lineTo(x + s * 2.08, y - s * 0.52); g.lineTo(x + s * 2.08, y + s * 0.52); g.closePath(); g.fill();
  // Dorsal fin (flows toward right/tail)
  g.beginPath(); g.moveTo(x, y - s * 0.52); g.lineTo(x + s * 0.35, y - s * 0.92); g.lineTo(x + s * 0.55, y - s * 0.52); g.closePath(); g.fill();
  // Eye on LEFT (head)
  g.fillStyle = '#100e04'; g.beginPath(); g.arc(x - s * 1.22, y - s * 0.07, s * 0.14, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff';    g.beginPath(); g.arc(x - s * 1.20, y - s * 0.10, s * 0.055, 0, Math.PI * 2); g.fill();
}

function _drawRedCarp(g, x, y, s) {
  g.fillStyle = '#b82e18';
  g.beginPath(); g.ellipse(x, y, s * 1.3, s * 0.72, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#d84028';
  g.beginPath(); g.ellipse(x - s * 0.18, y - s * 0.1, s * 0.85, s * 0.48, 0, 0, Math.PI * 2); g.fill();
  // Scale arcs on right half (toward tail)
  g.save(); g.strokeStyle = '#f06040'; g.lineWidth = s * 0.1;
  for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(x + s * 0.22 + i * s * 0.38, y + s * 0.08, s * 0.38, 0.28, Math.PI - 0.28); g.stroke(); }
  g.restore();
  // Tail on RIGHT
  g.fillStyle = '#b82e18';
  g.beginPath(); g.moveTo(x + s * 1.1, y); g.lineTo(x + s * 1.92, y - s * 0.58); g.lineTo(x + s * 1.92, y + s * 0.58); g.closePath(); g.fill();
  // Eye on LEFT
  g.fillStyle = '#180408'; g.beginPath(); g.arc(x - s * 0.96, y - s * 0.12, s * 0.15, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff';    g.beginPath(); g.arc(x - s * 0.94, y - s * 0.14, s * 0.058, 0, Math.PI * 2); g.fill();
}

function _drawGoldfish(g, x, y, s) {
  // Body shifted left (head on left)
  g.fillStyle = '#c07808';
  g.beginPath(); g.ellipse(x - s * 0.18, y, s * 1.05, s * 0.62, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#e09828';
  g.beginPath(); g.ellipse(x - s * 0.32, y - s * 0.09, s * 0.65, s * 0.4, 0, 0, Math.PI * 2); g.fill();
  // Fan tail on RIGHT
  g.fillStyle = '#d08818'; g.strokeStyle = '#f0a830'; g.lineWidth = s * 0.09;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3 - 0.33) * Math.PI;
    g.beginPath();
    g.moveTo(x + s * 0.78, y);
    g.lineTo(x + s * 1.9 + Math.cos(a) * s * 1.05, y + Math.sin(a) * s * 0.92);
    g.lineTo(x + s * 1.9 + Math.cos(a + 0.58) * s * 1.05, y + Math.sin(a + 0.58) * s * 0.92);
    g.closePath(); g.fill();
    g.beginPath(); g.moveTo(x + s * 0.78, y);
    g.lineTo(x + s * 1.9 + Math.cos(a + 0.29) * s * 1.08, y + Math.sin(a + 0.29) * s * 0.95); g.stroke();
  }
  // Eye on LEFT
  g.fillStyle = '#160800'; g.beginPath(); g.arc(x - s * 0.98, y - s * 0.06, s * 0.16, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff';    g.beginPath(); g.arc(x - s * 0.96, y - s * 0.09, s * 0.06, 0, Math.PI * 2); g.fill();
}

function drawFishingRipple(wx, wy) {
  ctx.save();
  const period = 90;
  for (let i = 0; i < 3; i++) {
    const p = ((tick + i * 30) % period) / period;
    const r = p * TILE * 1.15;
    const alpha = (1 - p) * 0.5;
    if (alpha <= 0) continue;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = 'rgba(100,190,255,0.9)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(wx, wy, r, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

function drawFishingHints() {
  if (settingsOpen || shopOpen || cookOpen || bagOpen || achOpen || fishingOpen) return;
  const zh = settings.language !== 'en';
  ctx.save();
  ctx.font = '600 11px ' + UI_FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const spot of fishingSpots) {
    if (Math.max(Math.abs(spot.col - player.col), Math.abs(spot.row - player.row)) > 2) continue;
    const sx = Math.round(spot.col * TILE + TILE / 2 - camX);
    const sy = Math.round(spot.row * TILE - camY);
    const label = t('pressGFish');
    const tw = ctx.measureText(label).width + 14, th = 20;
    roundRectPath(ctx, sx - tw / 2, sy - th, tw, th, 6);
    ctx.fillStyle = 'rgba(18,18,20,0.92)'; ctx.fill();
    ctx.strokeStyle = 'rgba(80,180,255,0.7)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = '#ffd84d';
    ctx.fillText(label, sx, sy - th / 2 + 1);
  }
  ctx.restore();
}

// ── Cooking mini-game ─────────────────────────────────────────────────────────
function startCookingMinigame(recipe, qty) {
  closeCookUI();
  cookingMinigame = {
    recipe, qty,
    pointer: 0.05, dir: 1,
    speed: 0.0055 + Math.random() * 0.003, // slight per-dish randomness
    phase: 'aim',
    zone: null, resultTimer: 0, particles: [],
  };
}

function handleCookingSpace() {
  if (!cookingMinigame || cookingMinigame.phase !== 'aim') return;
  const mg = cookingMinigame;
  mg.zone = mg.pointer < 0.40 ? 'cold' : mg.pointer < 0.75 ? 'perfect' : 'burnt';
  mg.phase = 'result';
  mg.resultTimer = 90; // 1.5 s at 60 fps

  // Spawn particles at the pointer position on the bar
  const W = canvas.width, H = canvas.height;
  const barW = Math.min(500, W * 0.68), barX = (W - barW) / 2;
  const barY = H * 0.52, px = barX + mg.pointer * barW;
  if (mg.zone === 'perfect') {
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2;
      mg.particles.push({
        x: px, y: barY + 18,
        vx: Math.cos(a) * (1.5 + Math.random() * 3.5),
        vy: -(2.5 + Math.random() * 4),
        color: Math.random() > 0.45 ? '#ffd84d' : '#ffaa20',
        size: 3 + Math.random() * 3, life: 1,
      });
    }
  } else if (mg.zone === 'burnt') {
    for (let i = 0; i < 18; i++) {
      const gray = 30 + Math.floor(Math.random() * 40);
      mg.particles.push({
        x: px + (Math.random() - 0.5) * 24, y: barY + 10,
        vx: (Math.random() - 0.5) * 1.8,
        vy: -(0.8 + Math.random() * 2),
        color: `rgb(${gray},${gray},${gray})`,
        size: 5 + Math.random() * 6, life: 1,
      });
    }
  }
}

function updateCookingMinigame() {
  const mg = cookingMinigame;
  if (mg.phase === 'aim') {
    mg.pointer += mg.dir * mg.speed;
    if (mg.pointer >= 1) { mg.pointer = 1; mg.dir = -1; }
    if (mg.pointer <= 0) { mg.pointer = 0; mg.dir =  1; }
  } else if (mg.phase === 'result') {
    mg.resultTimer--;
    for (const p of mg.particles) {
      if (p.life <= 0) continue;
      p.x += p.vx; p.y += p.vy;
      if (mg.zone === 'perfect') { p.vy += 0.14; }        // gravity
      else                       { p.vy -= 0.04; p.size += 0.12; } // smoke rises & expands
      p.life -= 0.013;
    }
    if (mg.resultTimer <= 0) finishCookingMinigame();
  }
}

function finishCookingMinigame() {
  const mg = cookingMinigame;
  const qty = mg.zone === 'perfect'
    ? Math.ceil(mg.qty * 1.5)
    : mg.zone === 'burnt'
    ? Math.max(1, Math.floor(mg.qty * 0.5))
    : mg.qty;
  Object.entries(mg.recipe.needs).forEach(([k, n]) => { inventory[k] -= n * mg.qty; });
  inventory[mg.recipe.key] = (inventory[mg.recipe.key] || 0) + qty;
  saveInventory();
  progressAch('cook');
  const zh = settings.language !== 'en';
  const prefix = mg.zone === 'perfect'
    ? (zh ? '✨ 完美烹饪！ ' : '✨ Perfect! ')
    : mg.zone === 'burnt'
    ? (zh ? '💨 焦糊了... ' : '💨 Burnt... ')
    : '';
  showNotif(prefix + t('cookDone', mg.recipe.icon, t(mg.recipe.key)) + (qty > 1 ? ` ×${qty}` : ''));
  cookingMinigame = null;
  doOpenCooking(); // reopen recipe list
}

function drawCookingMinigame() {
  const mg = cookingMinigame;
  const W = canvas.width, H = canvas.height;
  const zh = settings.language !== 'en';

  // Dim backdrop
  ctx.fillStyle = 'rgba(0,0,0,0.88)';
  ctx.fillRect(0, 0, W, H);

  // Recipe title
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 24px ' + UI_FONT;
  ctx.fillStyle = '#ffd84d';
  ctx.fillText(`${mg.recipe.icon}  ${t(mg.recipe.key)}`, W / 2, H * 0.28);
  ctx.font = '14px ' + UI_FONT; ctx.fillStyle = '#aaa';
  ctx.fillText(zh ? `×${mg.qty} 份` : `×${mg.qty} serving${mg.qty > 1 ? 's' : ''}`, W / 2, H * 0.28 + 34);

  const barW = Math.min(500, W * 0.68), barH = 40;
  const barX = (W - barW) / 2, barY = H * 0.52;

  if (mg.phase === 'aim') {
    // Heat bar background
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRectPath(ctx, barX - 8, barY - 8, barW + 16, barH + 16, 10); ctx.fill();

    // Zone fills
    ctx.fillStyle = '#2050c0'; ctx.fillRect(barX, barY, barW * 0.40, barH);            // cold
    ctx.fillStyle = '#18883a'; ctx.fillRect(barX + barW * 0.40, barY, barW * 0.35, barH); // perfect
    ctx.fillStyle = '#b82020'; ctx.fillRect(barX + barW * 0.75, barY, barW * 0.25, barH); // burnt

    // Zone border lines
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(barX + barW * 0.40, barY); ctx.lineTo(barX + barW * 0.40, barY + barH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(barX + barW * 0.75, barY); ctx.lineTo(barX + barW * 0.75, barY + barH); ctx.stroke();

    // Zone labels
    ctx.font = '600 12px ' + UI_FONT; ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(zh ? '生冷' : 'Raw',     barX + barW * 0.20, barY + barH / 2);
    ctx.fillText(zh ? '完美' : 'Perfect', barX + barW * 0.575, barY + barH / 2);
    ctx.fillText(zh ? '焦糊' : 'Burnt',   barX + barW * 0.875, barY + barH / 2);

    // Moving pointer
    const ptrX = barX + mg.pointer * barW;
    ctx.fillStyle = '#fff'; ctx.fillRect(ptrX - 4, barY - 10, 8, barH + 20);
    ctx.fillStyle = '#111'; ctx.fillRect(ptrX - 1, barY - 8, 2, barH + 16);

    // Instruction
    ctx.font = '700 15px ' + UI_FONT; ctx.fillStyle = '#ffd84d';
    ctx.fillText(zh ? '按 [空格] 或点击 停止判定！' : 'Press [Space] or click to judge!', W / 2, barY + barH + 40);

  } else if (mg.phase === 'result') {
    const pct = Math.max(0, mg.resultTimer / 90);

    // Frozen bar (dim)
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#2050c0'; ctx.fillRect(barX, barY, barW * 0.40, barH);
    ctx.fillStyle = '#18883a'; ctx.fillRect(barX + barW * 0.40, barY, barW * 0.35, barH);
    ctx.fillStyle = '#b82020'; ctx.fillRect(barX + barW * 0.75, barY, barW * 0.25, barH);
    // Pointer frozen
    const ptrX = barX + mg.pointer * barW;
    ctx.fillStyle = '#fff'; ctx.fillRect(ptrX - 4, barY - 10, 8, barH + 20);
    ctx.globalAlpha = 1;

    // Particles
    ctx.save();
    for (const p of mg.particles) {
      if (p.life <= 0) continue;
      ctx.globalAlpha = Math.max(0, p.life * 0.9);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.5, p.size * (mg.zone === 'perfect' ? p.life : 1)), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // Result headline
    const headline = mg.zone === 'perfect'
      ? (zh ? '🎉 完美烹饪！' : '🎉 Perfect!')
      : mg.zone === 'burnt'
      ? (zh ? '💨 焦糊了...' : '💨 Burnt...')
      : (zh ? '✓ 普通烹饪' : '✓ Cooked');
    const hColor = mg.zone === 'perfect' ? '#ffd84d' : mg.zone === 'burnt' ? '#888' : '#90e090';
    ctx.font = 'bold 30px ' + UI_FONT; ctx.fillStyle = hColor;
    ctx.fillText(headline, W / 2, H * 0.36);

    // Output quantity
    const outQty = mg.zone === 'perfect' ? Math.ceil(mg.qty * 1.5) : mg.zone === 'burnt' ? Math.max(1, Math.floor(mg.qty * 0.5)) : mg.qty;
    ctx.font = '600 20px ' + UI_FONT; ctx.fillStyle = '#fff';
    ctx.fillText(`${mg.recipe.icon} ×${outQty}`, W / 2, H * 0.44);

    // Countdown dots
    const dots = Math.ceil(pct * 3);
    ctx.font = '13px ' + UI_FONT; ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillText('●'.repeat(dots) + '○'.repeat(3 - dots), W / 2, H * 0.62);
  }
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

  // Fishing overlay — update its own state then skip normal player logic
  if (fishingOpen) { updateFishing(); updateCamera(); return; }
  if (cookingMinigame) updateCookingMinigame();

  // Refresh reachable interactions and keep the selection cursor in range
  interactions = buildInteractions();
  if (selIndex >= interactions.length) selIndex = Math.max(0, interactions.length - 1);

  // Chest fade-out timers
  for (const ch of chests) {
    if (ch.open && ch.disappearTimer > 0) ch.disappearTimer--;
  }
  for (const ds of digSpots) {
    if (ds.chestOpen && ds.disappearTimer > 0) ds.disappearTimer--;
  }

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

  // Tick shake animation
  if (shakingTree && shakingTree.timer > 0) shakingTree.timer--;

  // Berry regen (timestamp-based — no per-frame counter) + pick animation
  const _berryNow = Date.now();
  for (const b of berryBushes) {
    if (b.picked && b.regenAt && _berryNow >= b.regenAt) {
      b.picked  = false;
      b.regenAt = 0;
      saveBerryState();
      renderBerryCanvas();
    }
  }
  if (berryPickAnim) {
    berryPickAnim.timer--;
    for (const p of berryPickAnim.particles) {
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.12;
      p.life = berryPickAnim.timer / berryPickAnim.maxTimer;
    }
    if (berryPickAnim.timer <= 0) berryPickAnim = null;
  }

  // Auto-collect fallen trees when player arrives
  if (!player.moving) {
    for (let i = fallenTrees.length - 1; i >= 0; i--) {
      const ft = fallenTrees[i];
      if (player.col === ft.col && player.row === ft.row) {
        inventory.lumber += ft.lumber;
        inventory.pinecone += ft.pinecones;
        lootMessage = {
          text: ft.pinecones > 0 ? t('choppedPine', ft.pinecones) : t('choppedLumber'),
          timer: 150,
        };
        fallenTrees.splice(i, 1);
        saveInventory();
        break;
      }
    }
  }

  updateCamera();
}

// ── HUD ───────────────────────────────────────────────────────────────────────
function drawHUD() {
  ctx.save();

  // Top bar — gold and diamond only
  const hudText = `💰 ${inventory.gold}   💎 ${inventory.diamond}`;
  ctx.font = '600 13px ' + UI_FONT;
  const barH = 34, barW = Math.ceil(ctx.measureText(hudText).width) + 32;
  const barX = Math.round(canvas.width / 2 - barW / 2), barY = 10;
  roundRectPath(ctx, barX, barY, barW, barH, 10);
  ctx.fillStyle = 'rgba(18,18,20,0.88)'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffd84d';
  ctx.fillText(hudText, canvas.width / 2, barY + barH / 2 + 1);

  // Loot popup
  if (lootMessage) {
    lootMessage.timer--;
    const alpha = Math.min(1, lootMessage.timer / 30);
    if (lootMessage.timer <= 0) { lootMessage = null; }
    else {
      ctx.font = '600 15px ' + UI_FONT;
      ctx.globalAlpha = alpha;
      const h  = 44;
      const tw = ctx.measureText(lootMessage.text).width;
      const w  = Math.min(tw + 40, canvas.width - 24);
      const px = Math.round(canvas.width / 2 - w / 2);
      const py = Math.round(canvas.height - h - 20); // bottom of screen, below interaction bar
      roundRectPath(ctx, px, py, w, h, 12);
      ctx.fillStyle = 'rgba(18,18,20,0.96)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,215,50,0.55)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
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

  // Berry bushes — single viewport blit from offscreen canvas (no per-bush draw calls)
  ctx.drawImage(berryCanvas, sx, sy, sw, sh, sx, sy, sw, sh);

  // Fishing spot ripples (on water surface, world space)
  for (const spot of fishingSpots) {
    drawFishingRipple(spot.waterCol * TILE + TILE / 2, spot.waterRow * TILE + TILE / 2);
  }

  // Bridges (under player)
  for (const p of ponds) if (p.grow > 0) drawBridge(p);

  // Stove flames (animated, drawn before tree overlay)
  drawStoveFlames();

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

  // ── Dig spots ─────────────────────────────────────────────────────────────
  for (const ds of digSpots) {
    if (ds.col < startC || ds.col >= endC || ds.row < startR || ds.row >= endR) continue;
    if (!ds.dug) {
      // In the editor, show buried chests so the admin can see/erase them
      if (adminMode) {
        const mx = ds.col * TILE + 16, my = ds.row * TILE + 16;
        ctx.save();
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = 'rgba(255,216,77,0.85)';
        ctx.lineWidth = 2;
        ctx.strokeRect(ds.col * TILE + 4, ds.row * TILE + 4, TILE - 8, TILE - 8);
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255,216,77,0.9)';
        ctx.font = '12px ' + UI_FONT;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('⛏', mx, my + 1);
        ctx.restore();
      }
      continue;
    }
    const digAlpha = (ds.chestOpen && ds.disappearTimer <= 60) ? ds.disappearTimer / 60 : 1;
    const digGone  = ds.chestOpen && ds.disappearTimer <= 0;
    drawDugTile(ds.col * TILE, ds.row * TILE);
    if (!digGone) {
      ctx.save();
      ctx.globalAlpha = digAlpha;
      drawChestByType(ds.chestType, ds.col * TILE, ds.row * TILE - 4, ds.chestOpen);
      ctx.restore();
    }
  }

  // ── Fallen trees (lumber piles on the ground) ─────────────────────────────
  for (const ft of fallenTrees) {
    if (ft.col < startC || ft.col >= endC || ft.row < startR || ft.row >= endR) continue;
    const fx = ft.col * TILE, fy = ft.row * TILE;
    ctx.fillStyle = '#7a4a1a';
    ctx.fillRect(fx + 4, fy + 18, 24, 8);
    ctx.fillStyle = '#5a3210';
    ctx.fillRect(fx + 4, fy + 20, 24, 4);
    ctx.strokeStyle = '#4a2810'; ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.moveTo(fx + 4, fy + 19 + i * 3); ctx.lineTo(fx + 28, fy + 19 + i * 3); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,216,77,0.9)';
    ctx.font = '10px ' + UI_FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🪵', fx + 16, fy + 10);
  }

  // ── Player (drawn before tree overlay so trees appear on top) ───────────────
  const px = Math.round(player.px), py = Math.round(player.py);
  drawPlayer(ctx, px, py, player.frame, player.facing);

  // ── Tree + monument overlay (on top of player) ────────────────────────────
  ctx.drawImage(treeCanvas, sx, sy, sw, sh, sx, sy, sw, sh);

  // ── Occlusion ghost (gray silhouette shown through trees) ────────────────
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

  // ── Shaking tree animation ────────────────────────────────────────────────
  if (shakingTree && shakingTree.timer > 0) {
    const { col: sc2, row: sr2, type: st2, timer: stm } = shakingTree;
    const tx = sc2 * TILE, ty = sr2 * TILE;
    const offsetX = Math.round(Math.sin((18 - stm) * 1.1) * 4);
    // Cover the static version with the ground underneath
    const gs = seed[sr2] ? seed[sr2][sc2] : 0;
    if (palmOnSand[`${sc2},${sr2}`]) drawSand(ctx, tx, ty, gs);
    else drawGrass(ctx, tx, ty, gs);
    // Redraw the tree displaced
    drawTreeByType(ctx, tx + offsetX, ty, st2);
    // Hit-count indicator
    const hits = treeHits[`${sc2},${sr2}`] || 0;
    ctx.save();
    ctx.font = 'bold 11px ' + UI_FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#ffd84d';
    ctx.fillText('⚔'.repeat(hits) + '○'.repeat(CHOP_HITS - hits), tx + 16, ty - 2);
    ctx.restore();
  }

  // ── Berry pick particles (world space, on top of trees) ─────────────────
  if (berryPickAnim) {
    ctx.save();
    for (const p of berryPickAnim.particles) {
      if (p.life <= 0) continue;
      ctx.globalAlpha = p.life * 0.9;
      ctx.fillStyle = berryPickAnim.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.5, p.size * p.life), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ── Rainbows ──────────────────────────────────────────────────────────────
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
  drawBerryHints();
  drawFishingHints();
  if (fishingOpen) drawFishingUI();
  if (cookingMinigame) drawCookingMinigame();
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
const adminDragBar  = document.getElementById('adminDragBar');
const brushList     = document.getElementById('brushList');
const resetMapBtn   = document.getElementById('resetMapBtn');
const exitAdminBtn  = document.getElementById('exitAdminBtn');
const publishBtn    = document.getElementById('publishBtn');

// ── Admin panel drag ──────────────────────────────────────────────────────────
(function () {
  let ox = 0, oy = 0, dragging = false;
  adminDragBar.addEventListener('mousedown', e => {
    dragging = true;
    const r = adminPanel.getBoundingClientRect();
    // Convert from right-anchor to left-anchor for dragging
    if (!adminPanel.style.left) {
      adminPanel.style.left  = r.left + 'px';
      adminPanel.style.right = 'auto';
      adminPanel.style.top   = r.top  + 'px';
    }
    ox = e.clientX - r.left;
    oy = e.clientY - r.top;
    e.preventDefault();
  });
  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    adminPanel.style.left = Math.max(0, Math.min(window.innerWidth  - adminPanel.offsetWidth,  e.clientX - ox)) + 'px';
    adminPanel.style.top  = Math.max(0, Math.min(window.innerHeight - adminPanel.offsetHeight, e.clientY - oy)) + 'px';
  });
  window.addEventListener('mouseup', () => { dragging = false; });
})();

// ── Admin section collapse ────────────────────────────────────────────────────
document.querySelectorAll('.admin-section-hdr').forEach(hdr => {
  const sectionId = hdr.dataset.section;
  const body = hdr.nextElementSibling;
  body.style.maxHeight = body.scrollHeight + 'px';
  hdr.addEventListener('click', () => {
    const collapsed = hdr.classList.toggle('collapsed');
    body.classList.toggle('collapsed', collapsed);
    if (!collapsed) body.style.maxHeight = body.scrollHeight + 'px';
  });
});

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
  const raw = redeemInput.value.trim();
  if (!raw) return;
  const lower = raw.toLowerCase();

  // ── Rich code (case-insensitive, one-time) ────────────────────────────────
  if (lower === 'v我50' || lower === 'makemerich') {
    redeemInput.value = '';
    if (richCodeUsed) {
      showNotif(t('richCodeUsedAlready'));
    } else {
      richCodeUsed = true;
      saveRichUsed(true);
      inventory.gold += 50000;
      saveInventory();
      showNotif(t('richCodeOk'));
    }
    return;
  }

  // ── Admin code (SHA-256) ──────────────────────────────────────────────────
  if (raw.length < 4) return;
  const enc = new TextEncoder();
  crypto.subtle.digest('SHA-256', enc.encode(raw)).then(buf => {
    const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
    if (hex === 'ebd72b510911af3e254a030cd891cb804e1902189eee7a0f6199472eb5e4dba2') {
      redeemInput.value = '';
      closeSettings();
      enableAdmin();
      showNotif(t('adminOn'));
    }
  });
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
  { id: 'digChest',      key: 'bDigChest',      color: '#6b3d1e' },
  { id: 'digFancy',      key: 'bDigFancy',      color: '#6b3d1e' },
  { id: 'digPrecious',   key: 'bDigPrecious',   color: '#6b3d1e' },
  { id: 'digSplendid',   key: 'bDigSplendid',   color: '#6b3d1e' },
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
  document.getElementById('adminTitle').textContent      = t('adminTitle');
  document.getElementById('adminBrushLabel').textContent = t('adminBrushLabel');
  document.getElementById('adminHint').textContent       = t('adminHint');
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
  refreshAdminInv();
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
  location.reload();
});

document.getElementById('resetAchBtn').addEventListener('click', () => {
  achProgress = {};
  achUnlocked = {};
  saveAch();
  showNotif(settings.language === 'en' ? 'Achievements reset' : '成就已重置');
});

document.getElementById('resetRichBtn').addEventListener('click', () => {
  richCodeUsed = false;
  saveRichUsed(false);
  showNotif(settings.language === 'en' ? 'Rich code quota reset' : '富豪码额度已重置');
});

// Publish: download an updated mapdata.js containing the full effective edit set.
// Replace mapdata.js on the website to make these edits the shared baseline.
publishBtn.addEventListener('click', () => {
  const merged = Object.assign({}, publishedMap, mapEdits);

  // Build the full canonical snapshot for the published file
  const flat = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      flat.push(map[r][c]);
  const decos = decorations.map(d => ({ col: d.col, row: d.row, type: d.type }));
  const ps = {};
  for (const k in palmOnSand) ps[k] = true;

  const content =
    '// Official published map for Map Explorer (generated by the in-game editor).\n' +
    'window.PUBLISHED_MAP = ' + JSON.stringify(merged) + ';\n' +
    '// Full canonical map snapshot — loaded on startup to bypass procedural generation.\n' +
    'window.PUBLISHED_CANONICAL = ' + JSON.stringify({ map: flat, decos, palmOnSand: ps }) + ';\n';
  const blob = new Blob([content], { type: 'text/javascript' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'mapdata.js';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);

  Object.assign(publishedMap, merged);
  mapEdits = {};
  saveMapEdits();
  lootMessage = { text: t('published'), timer: 240 };
});

refreshSettingsUI();

// ── Admin inventory editor ────────────────────────────────────────────────────
const adminInvList = document.getElementById('adminInvList');
function buildAdminInvEditor() {
  adminInvList.innerHTML = '';
  INVENTORY_META.forEach(({ key, icon }) => {
    const row = document.createElement('div');
    row.className = 'inv-row';
    const ic = document.createElement('span'); ic.className = 'inv-icon'; ic.textContent = icon;
    const nm = document.createElement('span'); nm.className = 'inv-name'; nm.textContent = t(key) || key;
    const inp = document.createElement('input');
    inp.type = 'number'; inp.min = '0'; inp.step = '1';
    inp.value = inventory[key];
    inp.addEventListener('input', () => {
      const v = Math.max(0, parseInt(inp.value) || 0);
      inventory[key] = v;
      inp.value = v;
      saveInventory();
    });
    row.appendChild(ic); row.appendChild(nm); row.appendChild(inp);
    adminInvList.appendChild(row);
  });
}

// ── Shop UI ───────────────────────────────────────────────────────────────────
const shopModal   = document.getElementById('shopModal');
const shopCloseEl = document.getElementById('shopCloseBtn');
const shopItemEl  = document.getElementById('shopItemList');
const shopGoldEl  = document.getElementById('shopGold');
const shopTitleEl = document.getElementById('shopTitle');

function openShopUI() {
  shopTitleEl.textContent = t('shopTitle');
  shopCloseEl.textContent = t('shopClose');
  shopGoldEl.textContent  = t('shopGold', inventory.gold);
  shopItemEl.innerHTML    = '';
  SHOP_ITEMS.forEach(item => {
    const maxBuy = Math.floor(inventory.gold / item.price);
    let qty = Math.min(1, maxBuy);

    const div = document.createElement('div');
    div.className = 'shop-item';

    const iconEl  = document.createElement('span'); iconEl.className = 'si-icon'; iconEl.textContent = item.icon;
    const info    = document.createElement('div');  info.className = 'si-info';
    const nameEl  = document.createElement('div');  nameEl.className = 'si-name'; nameEl.textContent = t(item.key);
    const priceEl = document.createElement('div');  priceEl.className = 'si-price';
    info.append(nameEl, priceEl);

    // Quantity stepper
    const qRow  = document.createElement('div');  qRow.className = 'qty-row';
    const qMinus= document.createElement('button'); qMinus.textContent = '−';
    const qNum  = document.createElement('span');  qNum.className = 'qty-num';
    const qPlus = document.createElement('button'); qPlus.textContent = '+';
    qRow.append(qMinus, qNum, qPlus);

    const buyBtn = document.createElement('button'); buyBtn.className = 'si-buy';
    buyBtn.textContent = t('shopBuy');

    div.append(iconEl, info, qRow, buyBtn);
    shopItemEl.appendChild(div);

    const refresh = () => {
      const max = Math.floor(inventory.gold / item.price);
      qty = Math.max(1, Math.min(qty, max || 1));
      qNum.textContent  = qty;
      priceEl.textContent = t('shopPrice', item.price * qty);
      buyBtn.disabled   = inventory.gold < item.price * qty;
      qMinus.disabled   = qty <= 1;
      qPlus.disabled    = qty >= Math.max(1, max);
    };
    refresh();

    qMinus.addEventListener('click', () => { qty = Math.max(1, qty - 1); refresh(); });
    qPlus.addEventListener('click',  () => { qty = Math.min(Math.floor(inventory.gold / item.price) || 1, qty + 1); refresh(); });

    buyBtn.addEventListener('click', () => {
      const total = item.price * qty;
      if (inventory.gold < total) { showNotif(t('shopNotEnough')); return; }
      inventory.gold -= total;
      inventory[item.key] += qty;
      saveInventory();
      showNotif(t('shopBought', item.icon, qty));
      openShopUI();
    });
  });
  shopModal.classList.remove('hidden');
}

function closeShopUI() {
  shopOpen = false;
  shopModal.classList.add('hidden');
}

shopCloseEl.addEventListener('click', closeShopUI);
shopModal.addEventListener('click', e => { if (e.target === shopModal) closeShopUI(); });

// ── Cooking UI ────────────────────────────────────────────────────────────────
const cookModal     = document.getElementById('cookModal');
const cookCloseBtn  = document.getElementById('cookCloseBtn');
const cookRecipeEl  = document.getElementById('cookRecipeList');
const cookTitleEl   = document.getElementById('cookTitle');

function canCook(recipe) {
  return Object.entries(recipe.needs).every(([k, n]) => (inventory[k] || 0) >= n);
}

function openCookUI() {
  cookTitleEl.textContent  = t('cookTitle');
  cookCloseBtn.textContent = t('cookClose');
  cookRecipeEl.innerHTML   = '';

  // Sort: cookable first
  const sorted = [...RECIPES].sort((a, b) => (canCook(b) ? 1 : 0) - (canCook(a) ? 1 : 0));
  sorted.forEach(recipe => {
    const maxQ = maxCookable(recipe);
    let qty = Math.min(1, maxQ);

    const row = document.createElement('div');
    row.className = 'recipe-row';

    const iconEl = document.createElement('span'); iconEl.className = 'rr-icon'; iconEl.textContent = recipe.icon;
    const info   = document.createElement('div');  info.className = 'rr-info';
    const nameEl = document.createElement('div');  nameEl.className = 'rr-name'; nameEl.textContent = t(recipe.key);
    const chips  = document.createElement('div');  chips.className = 'rr-needs';
    info.append(nameEl, chips);

    const qRow   = document.createElement('div');  qRow.className = 'qty-row';
    const qMinus = document.createElement('button'); qMinus.textContent = '−';
    const qNum   = document.createElement('span');  qNum.className = 'qty-num';
    const qPlus  = document.createElement('button'); qPlus.textContent = '+';
    qRow.append(qMinus, qNum, qPlus);
    if (!maxQ) qRow.style.display = 'none';

    const cookBtn = document.createElement('button');
    row.append(iconEl, info, qRow, cookBtn);
    cookRecipeEl.appendChild(row);

    const refresh = () => {
      chips.innerHTML = '';
      Object.entries(recipe.needs).forEach(([k, n]) => {
        const have = inventory[k] || 0, need = n * qty;
        const meta = INVENTORY_META.find(m => m.key === k);
        const chip = document.createElement('span');
        chip.className = `rr-chip ${have >= need ? 'ok' : 'bad'}`;
        chip.textContent = `${meta ? meta.icon : ''} ${t(k) || k} ${have}/${need}`;
        chips.appendChild(chip);
      });
      const cur = maxCookable(recipe);
      qty = Math.max(1, Math.min(qty, cur || 1));
      qNum.textContent = qty;
      qMinus.disabled  = qty <= 1;
      qPlus.disabled   = qty >= Math.max(1, cur);
      cookBtn.textContent = t('cook');
      cookBtn.disabled    = cur < 1;
    };
    refresh();

    qMinus.addEventListener('click', () => { qty = Math.max(1, qty - 1); refresh(); });
    qPlus.addEventListener('click',  () => { qty = Math.min(maxCookable(recipe) || 1, qty + 1); refresh(); });

    cookBtn.addEventListener('click', () => {
      if (maxCookable(recipe) < qty) { showNotif(t('cookMissing')); return; }
      startCookingMinigame(recipe, qty);
    });
  });
  cookModal.classList.remove('hidden');
}

// How many times can this recipe be cooked with current inventory?
function maxCookable(recipe) {
  return Math.min(...Object.entries(recipe.needs).map(([k, n]) => Math.floor((inventory[k] || 0) / n)));
}

function closeCookUI() {
  cookOpen = false;
  cookModal.classList.add('hidden');
}

cookCloseBtn.addEventListener('click', closeCookUI);
cookModal.addEventListener('click', e => { if (e.target === cookModal) closeCookUI(); });

// ── Achievement modal UI ──────────────────────────────────────────────────────
const achBtn      = document.getElementById('achBtn');
const achModal    = document.getElementById('achModal');
const achCloseBtn = document.getElementById('achCloseBtn');
let   achOpen     = false;

function openAchUI() {
  achOpen = true;
  for (const k in keys) keys[k] = false;
  const zh = settings.language !== 'en';
  document.getElementById('achTitle').textContent   = zh ? '🏆 成就' : '🏆 Achievements';
  achCloseBtn.textContent = zh ? '关闭' : 'Close';

  const unlocked = ACHIEVEMENTS.filter(a => achUnlocked[a.id]).length;
  document.getElementById('achSubtitle').textContent =
    zh ? `已完成 ${unlocked} / ${ACHIEVEMENTS.length}` : `${unlocked} / ${ACHIEVEMENTS.length} completed`;

  const list = document.getElementById('achList');
  list.innerHTML = '';

  // Sort: unlocked first
  const sorted = [...ACHIEVEMENTS].sort((a, b) => (achUnlocked[b.id] ? 1 : 0) - (achUnlocked[a.id] ? 1 : 0));
  sorted.forEach(a => {
    const done  = !!achUnlocked[a.id];
    const prog  = Math.min(achProgress[a.track] || 0, a.target);
    const pct   = Math.round(prog / a.target * 100);

    const row = document.createElement('div');
    row.className = 'ach-row';

    const icon = document.createElement('div');
    icon.className = `ach-icon${done ? ' done' : ''}`;
    icon.textContent = done ? a.icon : '🔒';

    const info = document.createElement('div');
    info.className = 'ach-info';
    info.innerHTML = `
      <div class="ach-name ${done ? 'done' : 'locked'}">${zh ? a.nameZh : a.nameEn}</div>
      <div class="ach-desc">${zh ? a.descZh : a.descEn}</div>
      ${!done ? `
        <div class="ach-bar-wrap"><div class="ach-bar" style="width:${pct}%"></div></div>
        <div class="ach-progress">${prog} / ${a.target}</div>
      ` : ''}`;

    const stamp = document.createElement('div');
    stamp.className = 'ach-done-stamp';
    if (done) {
      stamp.textContent = zh ? '✓ 完成' : '✓ Done';
    } else if (a.reward?.diamond) {
      stamp.textContent = `💎×${a.reward.diamond}`;
      stamp.style.color = '#88aaff';
      stamp.style.fontSize = '12px';
    }

    row.append(icon, info, stamp);
    list.appendChild(row);
  });

  achModal.classList.remove('hidden');
}

function closeAchUI() { achOpen = false; achModal.classList.add('hidden'); }
achBtn.addEventListener('click', openAchUI);
achCloseBtn.addEventListener('click', closeAchUI);
achModal.addEventListener('click', e => { if (e.target === achModal) closeAchUI(); });

// ── Backpack UI ───────────────────────────────────────────────────────────────
const bagBtn      = document.getElementById('bagBtn');
const bagModal    = document.getElementById('bagModal');
const bagCloseBtn = document.getElementById('bagCloseBtn');

function buildBagSection(gridEl, keys) {
  gridEl.innerHTML = '';
  let shown = 0;
  keys.forEach(key => {
    const n = inventory[key] || 0;
    if (n === 0) return;
    const meta = INVENTORY_META.find(m => m.key === key);
    if (!meta) return;
    const chip = document.createElement('div');
    chip.className = 'bag-chip';
    chip.innerHTML =
      `<span class="bc-icon">${meta.icon}</span>` +
      `<span class="bc-count">${n}</span>` +
      `<span class="bc-name">${t(key) || key}</span>`;
    // Tag fish chips so the right-click slaughter handler can find them
    if (BAG_FISH_KEYS.includes(key)) {
      chip.dataset.fish = key;
      chip.title = t('slaughterHint');
      chip.style.cursor = 'context-menu';
    }
    // Drift bottle: clickable to open and reveal message
    if (key === 'driftBottle') {
      chip.style.cursor = 'pointer';
      chip.style.border = '1px solid rgba(255,216,77,0.5)';
      chip.title = driftBottleOpened ? t('driftMsgTitle') : '点击打开 / Click to open';
      chip.addEventListener('click', () => openDriftBottle());
    }
    gridEl.appendChild(chip);
    shown++;
  });
  if (shown === 0) {
    const empty = document.createElement('span');
    empty.className = 'bag-empty';
    empty.textContent = t('bagEmpty');
    gridEl.appendChild(empty);
  }
}

function openBagUI() {
  bagOpen = true;
  for (const k in keys) keys[k] = false;
  document.getElementById('bagTitle').textContent    = t('bagTitle');
  document.getElementById('bagFishTitle').textContent= t('bagFish');
  document.getElementById('bagIngTitle').textContent = t('bagIngredients');
  document.getElementById('bagFoodTitle').textContent= t('bagFood');
  document.getElementById('bagMatTitle').textContent = t('bagMaterials');
  bagCloseBtn.textContent = t('close');
  buildBagSection(document.getElementById('bagFishGrid'), BAG_FISH_KEYS);
  buildBagSection(document.getElementById('bagIngGrid'),  BAG_INGREDIENT_KEYS);
  buildBagSection(document.getElementById('bagFoodGrid'), BAG_FOOD_KEYS);
  buildBagSection(document.getElementById('bagMatGrid'),  BAG_MATERIAL_KEYS);
  // Right-click fish chips → slaughter
  document.getElementById('bagFishGrid').querySelectorAll('.bag-chip[data-fish]').forEach(chip => {
    chip.addEventListener('contextmenu', e => {
      e.preventDefault();
      const k = chip.dataset.fish;
      if (!inventory[k] || inventory[k] <= 0) return;
      inventory[k]--; inventory.fish_meat = (inventory.fish_meat || 0) + 1;
      saveInventory(); openBagUI();
      showNotif(t('slaughterDone'));
    });
  });
  bagModal.classList.remove('hidden');
}
function closeBagUI() { bagOpen = false; bagModal.classList.add('hidden'); }

bagBtn.addEventListener('click', openBagUI);
bagCloseBtn.addEventListener('click', closeBagUI);
bagModal.addEventListener('click', e => { if (e.target === bagModal) closeBagUI(); });

// Rebuild inventory editor whenever admin panel opens (called from enableAdmin patch below)
function refreshAdminInv() {
  document.getElementById('adminInvTitle').textContent = t('adminInvTitle');
  buildAdminInvEditor();
  // Re-measure section height after content is built
  const invSection = document.getElementById('invSection');
  if (invSection && !invSection.classList.contains('collapsed'))
    invSection.style.maxHeight = invSection.scrollHeight + 'px';
}

// ── Drift bottle modal ────────────────────────────────────────────────────────
const driftModal    = document.getElementById('driftModal');
const driftCloseBtn = document.getElementById('driftCloseBtn');

function openDriftBottle() {
  driftBottleOpened = true;
  try { localStorage.setItem('mapExplorerDriftOpened', '1'); } catch(_) {}
  document.getElementById('driftMsgTitle').textContent = t('driftMsgTitle');
  document.getElementById('driftMsgBody').textContent  = t('driftMsgBody');
  driftCloseBtn.textContent = t('driftMsgClose');
  driftModal.classList.remove('hidden');
}
driftCloseBtn.addEventListener('click', () => driftModal.classList.add('hidden'));
driftModal.addEventListener('click', e => { if (e.target === driftModal) driftModal.classList.add('hidden'); });

// ── Firebase 启动加载 ──────────────────────────────────────────────────────────
// 尝试从 Firebase 加载最新地图；Firebase 未就绪时降级用 localStorage
function applyCanonical(canon) {
  if (!canon || !Array.isArray(canon.map) || canon.map.length !== ROWS * COLS) return;
  canon.map.forEach((v, i) => { map[Math.floor(i / COLS)][i % COLS] = v; });
  decorations.length = 0;
  for (const d of (canon.decos || [])) {
    if ((d.type === 'flower' || d.type === 'sunflower') && rng(d.col, d.row, 919) >= 0.6) continue;
    decorations.push(d);
  }
  for (const ds of digSpots) {
    if (ds.flower && !decorations.some(d => d.col === ds.col && d.row === ds.row))
      decorations.push({ col: ds.col, row: ds.row, type: ds.flower });
  }
  for (const k in palmOnSand) delete palmOnSand[k];
  for (const [ks, v] of Object.entries(canon.palmOnSand || {})) palmOnSand[ks] = v;
  renderStaticMap();
  generateBerryBushes();
  loadBerryState();
  renderBerryCanvas();
}

function startGame() {
  renderStaticMap();
  loop();

  if (window.__firebase) {
    // 从 Firebase 加载最新地图
    window.__firebase.loadCanonical().then(canon => {
      if (canon) {
        window.PUBLISHED_CANONICAL = canon;
        applyCanonical(canon);
      }
      // 实时监听：管理员改动后所有玩家自动更新
      window.__firebase.listen(newCanon => {
        window.PUBLISHED_CANONICAL = newCanon;
        applyCanonical(newCanon);
      });
    });
  }
}

// 等 Firebase 就绪再启动（最多等 2 秒，超时直接启动）
if (window.__firebase) {
  startGame();
} else {
  let started = false;
  window.addEventListener('firebaseReady', () => {
    if (!started) { started = true; startGame(); }
  });
  setTimeout(() => {
    if (!started) { started = true; startGame(); }
  }, 2000);
}
