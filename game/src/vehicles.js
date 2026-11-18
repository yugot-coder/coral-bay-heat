// Cars: arcade physics for the player, lane-following traffic AI, parked
// cars to steal. A car is a position, a heading and a velocity vector; the
// grip model splits velocity into forward and sideways parts and bleeds the
// sideways part off, which is what makes handbrake drifts feel like drifts.
import { CAR_COLORS, CAR_MODELS } from './config.js';
import { H_ROADS, ROAD_W, V_ROADS, collideBuildings } from './city.js';
import { angleDelta, clamp, dist, pick } from './random.js';

let nextCarId = 1;

export function createCar(rng, modelIndex, x, y, angle, role) {
  const model = CAR_MODELS[modelIndex];
  return {
    id: nextCarId++,
    model, modelIndex,
    x, y, angle,
    vx: 0, vy: 0,
    speed: 0,
    steer: 0,
    health: 100,
    color: role === 'police' ? '#f2f4f6' : pick(rng, CAR_COLORS),
    role, // 'traffic' | 'parked' | 'police' | 'mission'
    occupied: role === 'traffic',
    // Traffic navigation: drive to this intersection, then choose again.
    navX: x, navY: y,
    cruise: 130 + rng() * 80,
    wait: 0,
    honkAt: 0,
    smoke: 0,
    dead: false,
  };
}

export function carRadius(car) {
  return car.model.length * 0.42;
}

export function forwardSpeed(car) {
  return car.vx * Math.cos(car.angle) + car.vy * Math.sin(car.angle);
}

/** One arcade-physics step. throttle -1..1, steer -1..1, handbrake boolean. */
export function driveCar(car, dt, throttle, steer, handbrake) {
  const m = car.model;
  const fwd = forwardSpeed(car);
  const maxF = m.topSpeed * (car.health < 25 ? 0.55 : 1);
  const maxR = -150;
  if (throttle > 0 && fwd < maxF) {
    car.vx += Math.cos(car.angle) * m.accel * throttle * dt;
    car.vy += Math.sin(car.angle) * m.accel * throttle * dt;
  } else if (throttle < 0) {
    if (fwd > 12) {
      // Braking first, reverse only once nearly stopped.
      car.vx -= Math.cos(car.angle) * m.accel * 1.5 * dt;
      car.vy -= Math.sin(car.angle) * m.accel * 1.5 * dt;
    } else if (fwd > maxR) {
      car.vx += Math.cos(car.angle) * m.accel * 0.7 * throttle * dt;
      car.vy += Math.sin(car.angle) * m.accel * 0.7 * throttle * dt;
    }
  }
  const steerAuthority = clamp(Math.abs(fwd) / 90, 0, 1.35) * (fwd < 0 ? -1 : 1);
  const turnRate = (handbrake ? 2.6 : 1.85) * steerAuthority;
  car.angle += steer * turnRate * dt * clamp(Math.abs(fwd) / 160, 0.25, 1);
  car.steer = steer;

  // Grip: keep forward velocity, bleed sideways velocity (less on handbrake).
  const fx = Math.cos(car.angle); const fy = Math.sin(car.angle);
  const vf = car.vx * fx + car.vy * fy;
  const vlx = car.vx - vf * fx; const vly = car.vy - vf * fy;
  const bleed = Math.exp(-(handbrake ? 1.6 : m.grip) * dt);
  const drag = Math.exp(-(throttle === 0 ? 0.9 : 0.25) * dt);
  car.vx = (vf * fx * drag) + vlx * bleed;
  car.vy = (vf * fy * drag) + vly * bleed;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  car.speed = Math.hypot(car.vx, car.vy);
  return Math.abs(vf) > 120 && Math.hypot(vlx, vly) > 55; // sliding hard: lay skid marks
}

/** Keep a car out of buildings and inside the world; returns impact speed if it hit something. */
export function collideCarWorld(state, car) {
  let impact = 0;
  const before = car.speed;
  const [nx, ny] = collideBuildings(state.city, car.x, car.y, carRadius(car) * 0.8);
  if (nx !== car.x || ny !== car.y) {
    impact = before;
    car.x = nx; car.y = ny;
    car.vx *= -0.25; car.vy *= -0.25;
  }
  const m = 40;
  car.x = clamp(car.x, m, 4800 - m);
  car.y = clamp(car.y, m, 3600 - m);
  return impact;
}

/** Nearest intersection point to (x, y). */
function nearestNode(x, y) {
  let bx = V_ROADS[0]; let by = H_ROADS[0]; let bd = Infinity;
  for (const vx of V_ROADS) for (const hy of H_ROADS) {
    const d = dist(x, y, vx, hy);
    if (d < bd) { bd = d; bx = vx; by = hy; }
  }
  return [bx, by];
}

/** Pick the next intersection to drive to from the current one, along a road. */
export function nextNavTarget(rng, car) {
  const [cx, cy] = nearestNode(car.x, car.y);
  const options = [];
  for (const vx of V_ROADS) if (vx !== cx) options.push([vx, cy]);
  for (const hy of H_ROADS) if (hy !== cy) options.push([cx, hy]);
  // Prefer continuing in roughly the same direction half the time.
  const straight = options.filter(([tx, ty]) => Math.sign(tx - cx) === Math.sign(Math.cos(car.angle)) && ty === cy || Math.sign(ty - cy) === Math.sign(Math.sin(car.angle)) && tx === cx);
  const pool = straight.length && rng() < 0.55 ? straight : options;
  const [tx, ty] = pool[Math.floor(rng() * pool.length) % pool.length];
  car.navX = tx; car.navY = ty;
}

/** Lane offset for right-hand traffic given a heading toward the target. */
function laneTarget(car) {
  const dx = car.navX - car.x;
  const dy = car.navY - car.y;
  const off = 29;
  if (Math.abs(dx) > Math.abs(dy)) return [car.navX, car.navY + (dx > 0 ? off : -off)];
  return [car.navX + (dy > 0 ? off : -off), car.navY];
}

/** Traffic step: follow lanes, turn at intersections, brake for anything ahead. */
export function updateTrafficCar(state, car, dt) {
  if (car.wait > 0) { car.wait -= dt; driveCar(car, dt, 0, 0, false); return; }
  const [tx, ty] = laneTarget(car);
  if (dist(car.x, car.y, car.navX, car.navY) < 70) nextNavTarget(state.rng, car);
  const want = Math.atan2(ty - car.y, tx - car.x);
  const steer = clamp(angleDelta(car.angle, want) * 2.2, -1, 1);

  // Brake for obstacles in front: other cars, pedestrians, the player.
  let blocked = false;
  const fx = Math.cos(car.angle); const fy = Math.sin(car.angle);
  const ahead = (ox, oy, range) => {
    const dx = ox - car.x; const dy = oy - car.y;
    const f = dx * fx + dy * fy;
    const side = Math.abs(-dx * fy + dy * fx);
    return f > 6 && f < range && side < 30;
  };
  for (const other of state.cars) {
    if (other !== car && !other.dead && ahead(other.x, other.y, 95)) { blocked = true; break; }
  }
  if (!blocked) for (const p of state.peds) {
    if (!p.dead && ahead(p.x, p.y, 80)) { blocked = true; break; }
  }
  if (!blocked && state.player.car !== car && ahead(state.player.x, state.player.y, 85)) blocked = true;

  const throttle = blocked ? (forwardSpeed(car) > 10 ? -1 : 0) : 0.75;
  if (blocked && car.honkAt < state.time - 2.5) { car.honkAt = state.time; state.events.push('horn'); }
  driveCar(car, dt, throttle * (car.cruise / 200), steer, false);
}

/** Spawn traffic and parked cars across the city at world creation. */
export function spawnCars(state) {
  const rng = state.rng;
  // Moving traffic on random intersections.
  for (let i = 0; i < 26; i += 1) {
    const vx = V_ROADS[Math.floor(rng() * V_ROADS.length)];
    const hy = H_ROADS[Math.floor(rng() * H_ROADS.length)];
    const car = createCar(rng, Math.floor(rng() * 5), vx + randOff(rng), hy + randOff(rng), Math.floor(rng() * 4) * Math.PI / 2, 'traffic');
    nextNavTarget(rng, car);
    state.cars.push(car);
  }
  // Parked cars in lots and along road edges: the stealable fleet.
  for (const lot of state.city.lots) {
    const n = 2 + Math.floor(rng() * 4);
    for (let i = 0; i < n; i += 1) {
      const x = lot.x + 30 + (i % 3) * 90;
      const y = lot.y + 40 + Math.floor(i / 3) * 110;
      if (x < lot.x + lot.w - 30 && y < lot.y + lot.h - 20) {
        state.cars.push(createCar(rng, Math.floor(rng() * 5), x, y, rng() < 0.5 ? 0 : Math.PI, 'parked'));
      }
    }
  }
  for (let i = 0; i < 22; i += 1) {
    const vertical = rng() < 0.5;
    const road = vertical ? V_ROADS[Math.floor(rng() * V_ROADS.length)] : H_ROADS[Math.floor(rng() * H_ROADS.length)];
    const along = 120 + rng() * 3200;
    const x = vertical ? road - ROAD_W / 2 + 22 : clamp(along, 80, 3900);
    const y = vertical ? clamp(along, 80, 3500) : road - ROAD_W / 2 + 22;
    if (!state.city.buildings.some((b) => x > b.x - 30 && x < b.x + b.w + 30 && y > b.y - 30 && y < b.y + b.h + 30)) {
      state.cars.push(createCar(rng, Math.floor(rng() * 5), x, y, vertical ? Math.PI / 2 : 0, 'parked'));
    }
  }
}

function randOff(rng) {
  return (rng() - 0.5) * 30;
}
