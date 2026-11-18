// The law: a heat-based wanted system and the Interceptors that enforce it.
// Crimes add heat; heat maps to 1-5 stars. Police spawn at the map edge and
// steer after the player. Heat only decays while no officer can see the
// player — buildings block line of sight, distance and darkness help too.
// At four stars a helicopter joins, and its searchlight counts as sight.
import { clamp, dist, segmentHitsRect } from './random.js';
import { angleDelta } from './random.js';
import { createCar, driveCar, forwardSpeed } from './vehicles.js';

export const CRIME = {
  theft: 26,
  gunshot: 16,
  shotPed: 42,
  runOver: 46,
  hitCar: 10,
  hitCop: 30,
  hitBuilding: 5,
  missionHeat: 78,
};

export function starsForHeat(heat) {
  if (heat <= 0) return 0;
  return clamp(Math.ceil(heat / 26), 1, 5);
}

/** Report a crime. Witnessed crimes count double-ish: they add a bonus. */
export function addCrime(state, kind, x, y) {
  const base = CRIME[kind] || 8;
  let witnessed = false;
  for (const p of state.peds) if (!p.dead && dist(p.x, p.y, x, y) < 260) { witnessed = true; break; }
  if (!witnessed) for (const c of state.cars) if (c.role === 'police' && dist(c.x, c.y, x, y) < 520) { witnessed = true; break; }
  const before = state.wanted.stars;
  state.wanted.heat = clamp(state.wanted.heat + base * (witnessed ? 1.25 : 0.55), 0, 130);
  state.wanted.stars = starsForHeat(state.wanted.heat);
  state.wanted.lastCrimeAt = state.time;
  if (state.wanted.stars > before && state.wanted.stars > 0) {
    state.events.push('wanted');
    state.banner = { title: 'WANTED LEVEL ' + state.wanted.stars, sub: state.wanted.stars >= 4 ? 'Air support inbound. Break line of sight!' : 'Coral Bay PD is on you. Break line of sight to cool off.', t: 0, life: 2.6 };
  }
}

/** Can an officer at (x,y) see the player right now? */
export function canSeePlayer(state, x, y) {
  const p = state.player;
  const d = dist(x, y, p.x, p.y);
  if (d > 760) return false;
  for (const b of state.city.buildings) {
    if (segmentHitsRect(x, y, p.x, p.y, b)) return false;
  }
  return true;
}

function spawnCop(state) {
  // Enter from the nearest map-edge road point to the player.
  const p = state.player;
  const spots = [[360, clamp(p.y, 200, 3400)], [3660, clamp(p.y, 200, 3400)], [clamp(p.x, 200, 3900), 360], [clamp(p.x, 200, 3900), 3000]];
  let best = spots[0]; let bd = Infinity;
  for (const s of spots) { const d = dist(s[0], s[1], p.x, p.y); if (d < bd) { bd = d; best = s; } }
  const cop = createCar(state.rng, 5, best[0], best[1], Math.atan2(p.y - best[1], p.x - best[0]), 'police');
  cop.occupied = true;
  cop.cruise = 999;
  state.cars.push(cop);
  state.events.push('siren');
}

export function updatePolice(state, dt) {
  const w = state.wanted;
  const p = state.player;
  const cops = state.cars.filter((c) => c.role === 'police' && !c.dead);

  // Sight tracking drives heat decay and the busted meter.
  let seen = false;
  for (const c of cops) if (canSeePlayer(state, c.x, c.y)) { seen = true; break; }
  if (!seen && w.stars >= 4) {
    // The helicopter's searchlight is a moving circle of sight.
    const h = state.heli;
    if (dist(h.x, h.y, p.x, p.y) < 190) seen = true;
  }
  w.seen = seen;
  if (seen) { w.unseenFor = 0; w.lastSeenX = p.x; w.lastSeenY = p.y; }
  else w.unseenFor += dt;
  if (!seen && w.unseenFor > 3.5 && w.heat > 0) {
    w.heat = Math.max(0, w.heat - dt * 4.2);
    w.stars = starsForHeat(w.heat);
    if (w.stars === 0 && cops.length) {
      for (const c of cops) { c.role = 'traffic'; c.occupied = true; c.color = '#f2f4f6'; }
      state.banner = { title: 'HEAT LOST', sub: 'The PD called it off. Stay clean out there.', t: 0, life: 2.2 };
    }
  }

  // Spawn pressure scales with stars; despawn far, calm officers.
  const wantedCount = w.stars === 0 ? 0 : Math.min(2 + w.stars, 6);
  if (cops.length < wantedCount) {
    w.spawnTimer -= dt;
    if (w.spawnTimer <= 0) { spawnCop(state); w.spawnTimer = 1.4; }
  }
  for (const c of cops) {
    if (w.stars === 0 && dist(c.x, c.y, p.x, p.y) > 1500) c.dead = true;
  }

  // Pursuit steering: aim at the player (or last seen point), ram on contact.
  for (const c of state.cars) {
    if (c.role !== 'police' || c.dead) continue;
    const tx = seen || dist(c.x, c.y, p.x, p.y) < 500 ? p.x : w.lastSeenX;
    const ty = seen || dist(c.x, c.y, p.x, p.y) < 500 ? p.y : w.lastSeenY;
    const want = Math.atan2(ty - c.y, tx - c.x);
    const steer = clamp(angleDelta(c.angle, want) * 2.4, -1, 1);
    const d = dist(c.x, c.y, tx, ty);
    const throttle = d > 60 ? 1 : 0.2;
    const aggression = 0.82 + w.stars * 0.07;
    driveCar(c, dt, throttle * aggression, steer, false);
  }

  // BUSTED: an officer alongside a player who is on foot or barely moving.
  const playerSpeed = p.car ? Math.abs(forwardSpeed(p.car)) : 0;
  let busting = false;
  if (w.stars > 0 && (!p.car || playerSpeed < 26)) {
    for (const c of cops) if (dist(c.x, c.y, p.x, p.y) < 64) { busting = true; break; }
  }
  if (busting) {
    w.bustTimer += dt;
    if (w.bustTimer > 1.6 && !state.over) {
      state.over = 'busted';
      state.events.push('busted');
    }
  } else w.bustTimer = Math.max(0, w.bustTimer - dt * 2);

  // Helicopter: circles the player at four stars and up, light swinging.
  const h = state.heli;
  if (w.stars >= 4) {
    h.active = true;
    h.angle += dt * 0.55;
    const tx = p.x + Math.cos(h.angle) * 130;
    const ty = p.y + Math.sin(h.angle) * 130;
    h.x += (tx - h.x) * Math.min(1, dt * 1.6);
    h.y += (ty - h.y) * Math.min(1, dt * 1.6);
  } else {
    h.active = false;
    h.x += (2400 - h.x) * dt * 0.2;
    h.y += (200 - h.y) * dt * 0.2;
  }
}
