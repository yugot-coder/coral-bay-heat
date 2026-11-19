// Coral Bay itself: a seeded procedural coastal city.
// A grid of avenues and streets leaves blocks between them; each block becomes
// buildings, a park, a parking lot or a plaza. The east edge is sand and sea.
// Landmark buildings (police station, hospital, garage, safehouse, marina,
// warehouse) sit at fixed addresses so missions and respawns have real places.
import { BUILDING_COLORS, DISTRICTS, WORLD } from './config.js';
import { pick, randInt, randRange } from './random.js';

export const ROAD_W = 118;
export const V_ROADS = [360, 1020, 1680, 2340, 3000, 3660, 4080];
export const H_ROADS = [360, 1020, 1680, 2340, 3000];
export const BEACH_X = 4180;
export const WATER_X = 4470;

const ROOF_DETAILS = ['ac', 'tank', 'garden', 'sign', 'plain', 'helipad'];

// Deterministic integer hash of a position. Façade identity and props are
// derived from this — never from the shared world rng — so adding them does
// not shift a single existing rng draw or change the city layout.
export function hash2(x, y) {
  let h = (Math.floor(x) * 374761393 + Math.floor(y) * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

const TRIM_TONES = ['#fff3e0', '#f4e1c1', '#e8e3d9', '#2e6f73', '#b84a39', '#5b7d8a', '#d97b4f', '#8a5a3b'];
const SHOP_NAMES = [
  'CORAL CAFÉ', 'TACO SOL', 'HOTEL PALOMA', 'SURF & SAND', 'FARMACIA BAY',
  'BARBERÍA LUIS', 'MERCADO CORAL', 'PIZZA FARO', 'LIBROS DEL MAR', 'GYM ARENA',
  'HELADERÍA NUBE', 'BAR LA BRISA', 'PANADERÍA SOL', 'FLORISTERÍA LIA',
];

export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x && x <= d.x + d.w && y >= d.y && y <= d.y + d.h) return d.name;
  }
  return x > BEACH_X ? 'The Strand' : 'Coral Bay';
}

function makeBuilding(rng, x, y, w, h, tall, label) {
  const b = {
    x, y, w, h,
    height: tall ? randRange(rng, 55, 120) : randRange(rng, 16, 52),
    color: pick(rng, BUILDING_COLORS),
    roof: pick(rng, ROOF_DETAILS),
    windows: randInt(rng, 2, 5),
    label: label || '',
    signHue: Math.floor(randRange(rng, 0, 360)),
  };
  // Façade identity from a position hash (no rng draws — layout unchanged).
  const fh = hash2(x, y);
  if (tall) b.style = fh % 5 < 3 ? 'glass' : 'deco';
  else b.style = ['stucco', 'brick', 'slab'][fh % 3];
  b.trim = TRIM_TONES[(fh >>> 3) % TRIM_TONES.length];
  b.shop = tall ? (fh >>> 5) % 100 < 10 : (fh >>> 5) % 100 < 45;
  b.balcony = b.style === 'stucco' && ((fh >>> 7) % 100) < 55;
  b.signText = b.shop && ((fh >>> 9) % 100) < 65 ? SHOP_NAMES[(fh >>> 11) % SHOP_NAMES.length] : '';
  return b;
}

export function generateCity(rng) {
  const buildings = [];
  const parks = [];
  const lots = [];
  const trees = [];
  const lights = [];

  // Blocks live in the rectangles between neighbouring roads.
  const xs = [60, ...V_ROADS, BEACH_X];
  const ys = [60, ...H_ROADS, WORLD.height - 60];
  for (let xi = 0; xi < xs.length - 1; xi += 1) {
    for (let yi = 0; yi < ys.length - 1; yi += 1) {
      const bx = xs[xi] + (xi === 0 ? 0 : ROAD_W / 2 + 16);
      const by = ys[yi] + (yi === 0 ? 0 : ROAD_W / 2 + 16);
      const bw = xs[xi + 1] - (xi === 0 ? 0 : ROAD_W / 2 + 16) - bx - 14;
      const bh = ys[yi + 1] - (yi === 0 ? 0 : ROAD_W / 2 + 16) - by - 14;
      if (bw < 120 || bh < 120) continue;
      const roll = rng();
      const downtown = bx > 900 && bx < 3100 && by > 200 && by < 2100;
      if (roll < 0.14) {
        parks.push({ x: bx, y: by, w: bw, h: bh });
        const n = randInt(rng, 6, 12);
        for (let i = 0; i < n; i += 1) trees.push({ x: bx + randRange(rng, 24, bw - 24), y: by + randRange(rng, 24, bh - 24), r: randRange(rng, 13, 22), palm: false });
      } else if (roll < 0.26) {
        lots.push({ x: bx, y: by, w: bw, h: bh });
      } else {
        // Subdivide the block into 2-4 buildings with alleys between them.
        const cols = bw > 380 ? 2 : 1;
        const rows = bh > 380 ? 2 : 1;
        for (let c = 0; c < cols; c += 1) {
          for (let r = 0; r < rows; r += 1) {
            const w = (bw / cols) - 22;
            const h = (bh / rows) - 22;
            buildings.push(makeBuilding(rng, bx + c * (bw / cols) + 10, by + r * (bh / rows) + 10, w, h, downtown && rng() < 0.55, ''));
          }
        }
      }
    }
  }

  // Palm trees line The Strand and the beach edge.
  for (let y = 120; y < WORLD.height - 80; y += randRange(rng, 120, 210)) {
    trees.push({ x: BEACH_X + randRange(rng, 8, 60), y, r: randRange(rng, 14, 20), palm: true });
    if (rng() < 0.6) trees.push({ x: 4020 + randRange(rng, 0, 30), y: y + 50, r: randRange(rng, 12, 18), palm: true });
  }
  // Streetlights at every intersection corner.
  for (const vx of V_ROADS) for (const hy of H_ROADS) {
    lights.push({ x: vx - ROAD_W / 2 - 8, y: hy - ROAD_W / 2 - 8 });
    lights.push({ x: vx + ROAD_W / 2 + 8, y: hy + ROAD_W / 2 + 8 });
  }

  // Landmarks: fixed addresses, drawn with signs, used by missions/respawns.
  const landmarks = {
    police: makeBuilding(rng, 1085, 1090, 300, 190, false, 'CORAL BAY PD'),
    hospital: makeBuilding(rng, 1745, 430, 300, 200, false, 'ST. CORAL HOSPITAL'),
    garage: makeBuilding(rng, 1100, 1750, 280, 180, false, "EDDIE'S GARAGE"),
    safehouse: makeBuilding(rng, 430, 430, 260, 180, false, 'SAFEHOUSE'),
    warehouse: makeBuilding(rng, 3070, 3070, 420, 240, false, 'PORTSIDE WAREHOUSE 9'),
    marina: makeBuilding(rng, 3720, 430, 300, 170, false, 'CORAL MARINA'),
    fixer: makeBuilding(rng, 2405, 1090, 280, 180, false, 'VOSS IMPORTS'),
  };
  landmarks.police.kind = 'police';
  landmarks.hospital.kind = 'hospital';
  landmarks.garage.kind = 'garage';
  buildings.push(...Object.values(landmarks));

  // Beach props, built last from coordinate hashes only (no rng draws):
  // umbrellas with towels along the sand, boats anchored in the water.
  const props = [];
  for (let y = 240; y < WORLD.height - 160; y += 175) {
    const ph = hash2(BEACH_X + 90, y);
    if (ph % 100 < 22) continue; // leave some stretches of sand empty
    const ux = BEACH_X + 46 + (ph % 170);
    props.push({
      kind: 'umbrella', x: ux, y,
      hue: (ph >>> 3) % 360,
      towelHue: (ph >>> 7) % 360,
      towelAngle: ((ph >>> 11) % 8) * (Math.PI / 4),
      towelSide: (ph >>> 13) % 2 === 0 ? 1 : -1,
    });
  }
  for (let i = 0; i < 8; i += 1) {
    const by = 260 + i * ((WORLD.height - 520) / 7);
    const bh = hash2(WATER_X + 120, Math.floor(by));
    props.push({
      kind: 'boat',
      x: WATER_X + 70 + (bh % 190),
      y: by + ((bh >>> 5) % 90) - 45,
      angle: ((bh >>> 9) % 628) / 100,
      hue: (bh >>> 15) % 360,
      len: 44 + (bh >>> 21) % 26,
    });
  }

  // Street trees along every road, from position hashes only (no rng draws,
  // appended last so the existing layout never shifts).
  for (const vx of V_ROADS) {
    for (const side of [-1, 1]) {
      const x = vx + side * (ROAD_W / 2 + 17);
      for (let y = 140; y <= WORLD.height - 140; y += 235) {
        if (H_ROADS.some((hy) => Math.abs(y - hy) < 170)) continue;
        const h = hash2(x, y);
        if (h % 100 < 30) continue;
        trees.push({ x, y: y + ((h % 41) - 20), r: 12 + ((h >>> 5) % 6), palm: x > 3350 });
      }
    }
  }
  for (const hy of H_ROADS) {
    for (const side of [-1, 1]) {
      const y = hy + side * (ROAD_W / 2 + 17);
      for (let x = 140; x <= WORLD.width - 140; x += 235) {
        if (x > BEACH_X - 40) continue;
        if (V_ROADS.some((vx) => Math.abs(x - vx) < 170)) continue;
        const h = hash2(x, y);
        if (h % 100 < 30) continue;
        trees.push({ x: x + ((h % 41) - 20), y, r: 12 + ((h >>> 5) % 6), palm: x > 3350 });
      }
    }
  }

  return { buildings, parks, lots, trees, lights, landmarks, props };
}

/** Is this point on any road (either direction of travel)? */
export function onRoad(x, y) {
  for (const vx of V_ROADS) if (Math.abs(x - vx) <= ROAD_W / 2) return true;
  for (const hy of H_ROADS) if (Math.abs(y - hy) <= ROAD_W / 2) return true;
  return false;
}

/** Building the point is inside (expanded by pad), or null. */
export function buildingAt(city, x, y, pad) {
  const p = pad || 0;
  for (const b of city.buildings) {
    if (x >= b.x - p && x <= b.x + b.w + p && y >= b.y - p && y <= b.y + b.h + p) return b;
  }
  return null;
}

/** Push a circle at (x,y) out of every building it overlaps; returns corrected [x, y]. */
export function collideBuildings(city, x, y, radius) {
  for (const b of city.buildings) {
    const nx = Math.max(b.x, Math.min(x, b.x + b.w));
    const ny = Math.max(b.y, Math.min(y, b.y + b.h));
    const dx = x - nx;
    const dy = y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 < radius * radius) {
      if (d2 < 0.01) {
        // Centre inside the building: push out along the smallest exit.
        const left = x - b.x; const right = b.x + b.w - x;
        const top = y - b.y; const bottom = b.y + b.h - y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) x = b.x - radius;
        else if (m === right) x = b.x + b.w + radius;
        else if (m === top) y = b.y - radius;
        else y = b.y + b.h + radius;
      } else {
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * radius;
        y = ny + (dy / d) * radius;
      }
    }
  }
  return [x, y];
}
