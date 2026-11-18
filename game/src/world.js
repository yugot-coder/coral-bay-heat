// World state and the fixed-step simulation. Everything the game knows
// lives in one state object; each system module reads and mutates it.
// step() runs the systems in a fixed order — player, traffic, police,
// people, combat, missions — so a seeded run is perfectly repeatable.
import { PHASE_GOLDEN, PLAYER, WORLD } from './config.js';
import { createRandom, clamp, dist } from './random.js';
import { generateCity, districtAt } from './city.js';
import { ACT_ENTER, ACT_SHOOT } from './input.js';
import { createCar, driveCar, collideCarWorld, spawnCars, updateTrafficCar, carRadius, forwardSpeed } from './vehicles.js';
import { spawnPeds, updatePeds, updatePlayerFoot, panicPeds, createPed } from './people.js';
import { addCrime, updatePolice } from './police.js';
import { shoot, updateCombat, spawnParticles, spawnSmoke, popup } from './combat.js';
import { createMissionState, updateMissions } from './missions.js';

const PACKAGE_SPOTS = [
  [1250, 500], [2600, 1250], [500, 2600], [3350, 2900], [1950, 2050], [4150, 1600],
  [850, 1450], [2900, 350], [1500, 3250], [3600, 1900], [2300, 850], [600, 3300],
];

export function createWorld(seed) {
  const rng = createRandom(seed);
  const city = generateCity(rng);
  const state = {
    rng, seed, city,
    time: 0,
    phase: PHASE_GOLDEN,
    district: 'Coral Flats',
    player: {
      x: PLAYER.startX, y: PLAYER.startY, angle: 0, moveAngle: 0, aimAngle: 0,
      walkPhase: 0, health: PLAYER.maxHealth, cash: PLAYER.startCash,
      car: null, cooldown: 0, lastHurtAt: -99,
    },
    cars: [], peds: [], bullets: [], particles: [], popups: [], skids: [],
    collectibles: PACKAGE_SPOTS.map(([x, y], i) => ({ id: i, x, y, taken: false, bob: i * 0.7 })),
    packagesFound: 0,
    wanted: { heat: 0, stars: 0, unseenFor: 0, lastCrimeAt: -99, lastSeenX: 0, lastSeenY: 0, bustTimer: 0, spawnTimer: 0, seen: false },
    heli: { x: 2400, y: 200, angle: 0, active: false },
    mission: createMissionState(),
    camera: { x: PLAYER.startX, y: PLAYER.startY },
    view: { w: 1280, h: 720 },
    banner: null,
    dialogue: null,
    muzzle: null,
    over: null,
    overTimer: 0,
    events: [],
    lastCrashAt: -9,
    stats: { shots: 0, carsStolen: 0, pedsDown: 0 },
  };
  spawnCars(state);
  spawnPeds(state);
  // A starter car near spawn and the guaranteed coral Kestrel S by the marina.
  state.cars.push(createCar(rng, 0, 1048, 815, Math.PI / 2, 'parked'));
  const kestrel = createCar(rng, 2, 3760, 700, 0, 'parked');
  kestrel.color = '#ff7a59';
  state.cars.push(kestrel);
  return state;
}

export function applySave(state, save) {
  if (!save) return;
  state.player.cash = save.cash;
  state.player.x = clamp(save.x || PLAYER.startX, 40, WORLD.width - 40);
  state.player.y = clamp(save.y || PLAYER.startY, 40, WORLD.height - 40);
  state.mission.index = clamp(save.missionIndex || 0, 0, 5);
  state.mission.done = !!save.missionDone;
  state.mission.between = 2.5;
  state.packagesFound = save.packages || 0;
  for (const c of state.collectibles) if ((save.taken || []).includes(c.id)) c.taken = true;
  state.camera.x = state.player.x;
  state.camera.y = state.player.y;
}

function exitCar(state) {
  const p = state.player;
  const car = p.car;
  if (!car) return;
  const side = car.angle + Math.PI / 2;
  p.x = car.x + Math.cos(side) * (car.model.width + 16);
  p.y = car.y + Math.sin(side) * (car.model.width + 16);
  p.car = null;
  car.occupied = false;
  if (car.role === 'player') car.role = 'parked';
  state.events.push('door');
}

function enterNearestCar(state) {
  const p = state.player;
  let best = null; let bd = 74;
  for (const car of state.cars) {
    if (car.dead) continue;
    const d = dist(p.x, p.y, car.x, car.y);
    if (d < bd) { bd = d; best = car; }
  }
  if (!best) return;
  if (best.occupied && best.role === 'traffic') {
    // The driver climbs out and runs for it.
    const driver = createPed(state.rng, best.x + 26, best.y + 10);
    driver.flee = 3; driver.panicX = p.x; driver.panicY = p.y;
    state.peds.push(driver);
    best.occupied = false;
    popup(state, best.x, best.y - 34, 'Hey! My car!', '#ffffff');
  }
  if (best.role === 'traffic' || best.role === 'parked' || best.role === 'mission') {
    addCrime(state, 'theft', best.x, best.y);
    panicPeds(state, best.x, best.y, 200);
  }
  if (best.role === 'traffic') best.role = 'parked';
  best.occupied = true;
  p.car = best;
  state.stats.carsStolen += 1;
  state.events.push('door');
  state.events.push('save');
}

function hurtPlayer(state, amount) {
  const p = state.player;
  p.health -= amount;
  p.lastHurtAt = state.time;
  if (p.health <= 0 && !state.over) {
    p.health = 0;
    state.over = 'wasted';
    state.events.push('wasted');
  }
}

function carVsCar(state) {
  const cars = state.cars;
  for (let i = 0; i < cars.length; i += 1) {
    const a = cars[i];
    if (a.dead) continue;
    for (let j = i + 1; j < cars.length; j += 1) {
      const b = cars[j];
      if (b.dead) continue;
      const rr = (carRadius(a) + carRadius(b)) * 0.82;
      const d = dist(a.x, a.y, b.x, b.y);
      if (d > 0.01 && d < rr) {
        const nx = (b.x - a.x) / d; const ny = (b.y - a.y) / d;
        const push = (rr - d) / 2;
        const aParked = a.role === 'parked' && a !== state.player.car;
        const bParked = b.role === 'parked' && b !== state.player.car;
        if (!aParked) { a.x -= nx * push; a.y -= ny * push; }
        if (!bParked) { b.x += nx * push; b.y += ny * push; }
        const rel = Math.abs((a.vx - b.vx) * nx + (a.vy - b.vy) * ny);
        if (rel > 55) {
          a.vx -= nx * rel * 0.4; a.vy -= ny * rel * 0.4;
          b.vx += nx * rel * 0.4; b.vy += ny * rel * 0.4;
          const involvesPlayer = a === state.player.car || b === state.player.car;
          if (involvesPlayer && state.time - state.lastCrashAt > 0.5) {
            state.lastCrashAt = state.time;
            const other = a === state.player.car ? b : a;
            const dmg = Math.min(22, rel / 16);
            other.health -= dmg;
            if (state.player.car) state.player.car.health -= dmg * 0.7;
            if (rel > 190) hurtPlayer(state, rel / 38);
            addCrime(state, other.role === 'police' ? 'hitCop' : 'hitCar', other.x, other.y);
            spawnParticles(state, (a.x + b.x) / 2, (a.y + b.y) / 2, 10, '#ffd94d', 170, 0.4, 3);
            state.events.push('crash');
          }
        }
      }
    }
  }
}

function carVsPeds(state, car) {
  if (car.speed < 55) return;
  for (const ped of state.peds) {
    if (ped.dead) continue;
    if (dist(car.x, car.y, ped.x, ped.y) < carRadius(car) * 0.8 + 11) {
      ped.dead = true; ped.downTime = 0;
      state.stats.pedsDown += 1;
      spawnParticles(state, ped.x, ped.y, 12, '#c0392b', 150, 0.6, 3);
      state.events.push('thud');
      if (car === state.player.car) {
        addCrime(state, 'runOver', ped.x, ped.y);
        car.vx *= 0.82; car.vy *= 0.82;
      }
      panicPeds(state, ped.x, ped.y, 360);
    }
  }
}

function stepDriving(state, dt, input) {
  const p = state.player;
  const car = p.car;
  const throttle = -input.axisY();
  const steer = input.axisX();
  const sliding = driveCar(car, dt, throttle, steer, input.handbrake());
  p.x = car.x; p.y = car.y;
  p.angle = car.angle;
  if (sliding && state.rng() < 0.85) {
    const back = car.model.length * 0.36;
    for (const s of [-1, 1]) {
      state.skids.push({
        x: car.x - Math.cos(car.angle) * back - Math.sin(car.angle) * s * car.model.width * 0.36,
        y: car.y - Math.sin(car.angle) * back + Math.cos(car.angle) * s * car.model.width * 0.36,
        t: 0,
      });
    }
    if (state.rng() < 0.3) spawnParticles(state, car.x, car.y, 1, '#d8cfb8', 40, 0.5, 5);
  }
  if (car.health < 38 && state.rng() < dt * 9) spawnSmoke(state, car.x + Math.cos(car.angle) * 24, car.y + Math.sin(car.angle) * 24);
  const impact = collideCarWorld(state, car);
  if (impact > 230 && state.time - state.lastCrashAt > 0.5) {
    state.lastCrashAt = state.time;
    car.health -= Math.min(20, impact / 22);
    hurtPlayer(state, impact / 42);
    addCrime(state, 'hitBuilding', car.x, car.y);
    spawnParticles(state, car.x, car.y, 12, '#ffe9a8', 180, 0.45, 3);
    state.events.push('crash');
  }
  p.x = car.x; p.y = car.y;
}

export function stepWorld(state, dt, input) {
  state.events.length = 0;
  state.time += dt;
  const p = state.player;

  if (state.over) {
    state.overTimer += dt;
    updateCombat(state, dt);
    return;
  }

  const actions = input.takeActions ? input.takeActions() : 0;
  if (actions & ACT_ENTER) {
    if (p.car) exitCar(state); else enterNearestCar(state);
  }

  // Aim from the mouse (screen space -> world space through the camera).
  const aimWX = state.camera.x - state.view.w / 2 + (input.mouseX || 0);
  const aimWY = state.camera.y - state.view.h / 2 + (input.mouseY || 0);
  p.aimAngle = Math.atan2(aimWY - p.y, aimWX - p.x);

  if (p.car) stepDriving(state, dt, input);
  else {
    updatePlayerFoot(state, dt, input.axisX(), input.axisY(), input.sprint());
    p.angle = p.aimAngle;
    if ((actions & ACT_SHOOT) || (input.mouseDown && p.cooldown <= 0)) {
      shoot(state);
      state.stats.shots += 1;
    }
  }

  for (const car of state.cars) {
    if (car.dead || car === p.car || car.role === 'police') continue;
    if (car.role === 'traffic') {
      if (dist(car.x, car.y, p.x, p.y) < 1900) {
        updateTrafficCar(state, car, dt);
        collideCarWorld(state, car);
      }
    }
  }
  updatePolice(state, dt);
  for (const car of state.cars) {
    if (car.role === 'police' && !car.dead) collideCarWorld(state, car);
    if (!car.dead && car.speed > 40) carVsPeds(state, car);
  }
  carVsCar(state);
  updatePeds(state, dt);
  updateCombat(state, dt);
  updateMissions(state, dt);

  // Hidden packages: a little cash and a counter, anywhere in the city.
  for (const c of state.collectibles) {
    if (!c.taken && dist(p.x, p.y, c.x, c.y) < 44) {
      c.taken = true;
      state.packagesFound += 1;
      p.cash += 25;
      popup(state, c.x, c.y - 30, 'Hidden package ' + state.packagesFound + '/12  +$25', '#19c2b8');
      spawnParticles(state, c.x, c.y, 12, '#19c2b8', 130, 0.6, 3);
      state.events.push('pickup');
      state.events.push('save');
    }
  }

  // Slow recovery when the heat of the moment has passed.
  if (p.health > 0 && p.health < 100 && state.time - p.lastHurtAt > 9) p.health = Math.min(100, p.health + dt * 3.2);

  if (state.banner) { state.banner.t += dt; if (state.banner.t > state.banner.life) state.banner = null; }
  if (state.dialogue) { state.dialogue.t += dt; if (state.dialogue.t > state.dialogue.life) state.dialogue = null; }
  state.district = districtAt(p.x, p.y);

  // Camera: follow smoothly, clamped so the world fills the screen at edges.
  const tx = p.car ? p.x + p.car.vx * 0.35 : p.x;
  const ty = p.car ? p.y + p.car.vy * 0.35 : p.y;
  state.camera.x += (tx - state.camera.x) * Math.min(1, dt * 5);
  state.camera.y += (ty - state.camera.y) * Math.min(1, dt * 5);
  const hw = state.view.w / 2; const hh = state.view.h / 2;
  state.camera.x = state.view.w >= WORLD.width ? WORLD.width / 2 : clamp(state.camera.x, hw, WORLD.width - hw);
  state.camera.y = state.view.h >= WORLD.height ? WORLD.height / 2 : clamp(state.camera.y, hh, WORLD.height - hh);
}

/** BUSTED resolution: pay the fine, wake up outside Coral Bay PD. */
export function respawnBusted(state) {
  const p = state.player;
  const fine = Math.min(p.cash, 60 + state.wanted.stars * 40);
  p.cash -= fine;
  p.car = null;
  p.x = 1020; p.y = 1230;
  p.health = Math.max(55, p.health);
  state.wanted.heat = 0; state.wanted.stars = 0; state.wanted.bustTimer = 0;
  for (const c of state.cars) if (c.role === 'police') c.dead = true;
  state.cars = state.cars.filter((c) => !c.dead);
  state.over = null; state.overTimer = 0;
  state.camera.x = p.x; state.camera.y = p.y;
  state.banner = { title: 'BUSTED', sub: 'Fine paid: $' + fine + '. The PD kept your ride.', t: 0, life: 3 };
  state.events.push('save');
  return fine;
}

/** WASTED resolution: wake up at St. Coral Hospital, lighter of pocket. */
export function respawnWasted(state) {
  const p = state.player;
  const bill = Math.min(p.cash, 150);
  p.cash -= bill;
  p.car = null;
  p.x = 1680; p.y = 760;
  p.health = 100;
  state.wanted.heat = 0; state.wanted.stars = 0; state.wanted.bustTimer = 0;
  for (const c of state.cars) if (c.role === 'police') c.dead = true;
  state.cars = state.cars.filter((c) => !c.dead);
  state.over = null; state.overTimer = 0;
  state.camera.x = p.x; state.camera.y = p.y;
  state.banner = { title: 'WASTED', sub: 'St. Coral patched you up. Hospital bill: $' + bill + '.', t: 0, life: 3 };
  state.events.push('save');
  return bill;
}
