// People: pedestrians who stroll the sidewalks, flee from danger and fall
// when hurt, plus the on-foot player (movement, aiming, entering cars).
import { PLAYER, WORLD } from './config.js';
import { H_ROADS, V_ROADS, collideBuildings } from './city.js';
import { angleDelta, clamp, dist, pick, randRange } from './random.js';

const SHIRTS = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#f78c6b', '#c8b6ff', '#ffffff', '#8ac926', '#ff9e6b', '#6a4c93'];
const SKINS = ['#f2c9a0', '#c68642', '#8d5524', '#ffdbac', '#e0ac69'];

export function createPed(rng, x, y) {
  return {
    x, y, angle: rng() * Math.PI * 2,
    vx: 0, vy: 0,
    speed: randRange(rng, 42, 78),
    tx: x, ty: y,
    shirt: pick(rng, SHIRTS),
    skin: pick(rng, SKINS),
    dead: false, downTime: 0,
    flee: 0, panicX: 0, panicY: 0,
    walkPhase: rng() * 6,
    screamAt: 0,
    waitT: randRange(rng, 0, 2),
  };
}

/** A sidewalk-ish stroll target: near a road edge, somewhere new to walk to. */
function newStrollTarget(state, ped) {
  const rng = state.rng;
  if (rng() < 0.5) {
    const vx = pick(rng, V_ROADS);
    ped.tx = vx + (rng() < 0.5 ? -78 : 78);
    ped.ty = clamp(ped.y + randRange(rng, -700, 700), 60, WORLD.height - 60);
  } else {
    const hy = pick(rng, H_ROADS);
    ped.ty = hy + (rng() < 0.5 ? -78 : 78);
    ped.tx = clamp(ped.x + randRange(rng, -700, 700), 60, WORLD.width - 60);
  }
}

export function spawnPeds(state) {
  const rng = state.rng;
  for (let i = 0; i < 64; i += 1) {
    let x = 0; let y = 0;
    if (rng() < 0.5) { x = pick(rng, V_ROADS) + (rng() < 0.5 ? -78 : 78); y = randRange(rng, 80, WORLD.height - 80); }
    else { y = pick(rng, H_ROADS) + (rng() < 0.5 ? -78 : 78); x = randRange(rng, 80, 3900); }
    const [cx, cy] = collideBuildings(state.city, x, y, 16);
    const ped = createPed(rng, cx, cy);
    newStrollTarget(state, ped);
    state.peds.push(ped);
  }
}

/** Make every living pedestrian near a point run away from it, screaming. */
export function panicPeds(state, x, y, radius) {
  for (const p of state.peds) {
    if (p.dead) continue;
    if (dist(p.x, p.y, x, y) < radius) {
      p.flee = randRange(state.rng, 1.6, 3.2);
      p.panicX = x; p.panicY = y;
      if (p.screamAt < state.time - 3 && state.rng() < 0.4) {
        p.screamAt = state.time;
        state.popups.push({ x: p.x, y: p.y - 26, text: pick(state.rng, ['Aaah!', 'Look out!', 'Help!', 'My leg!', 'Call the PD!']), t: 0, life: 1.1, color: '#ffffff' });
      }
    }
  }
}

export function updatePeds(state, dt) {
  for (const p of state.peds) {
    if (p.dead) { p.downTime += dt; continue; }
    let tx = p.tx; let ty = p.ty; let speed = p.speed;
    if (p.flee > 0) {
      p.flee -= dt;
      const a = Math.atan2(p.y - p.panicY, p.x - p.panicX);
      tx = p.x + Math.cos(a) * 220; ty = p.y + Math.sin(a) * 220;
      speed = 215;
    } else if (dist(p.x, p.y, tx, ty) < 18) {
      if (p.waitT > 0) { p.waitT -= dt; continue; }
      p.waitT = randRange(state.rng, 0, 1.6);
      newStrollTarget(state, p);
      continue;
    }
    const want = Math.atan2(ty - p.y, tx - p.x);
    p.angle += clamp(angleDelta(p.angle, want), -6 * dt, 6 * dt) * 3;
    p.x += Math.cos(p.angle) * speed * dt;
    p.y += Math.sin(p.angle) * speed * dt;
    p.walkPhase += dt * (speed / 14);
    const [nx, ny] = collideBuildings(state.city, p.x, p.y, 12);
    if (nx !== p.x || ny !== p.y) { p.x = nx; p.y = ny; if (p.flee <= 0) newStrollTarget(state, p); }
    p.x = clamp(p.x, 24, WORLD.width - 24);
    p.y = clamp(p.y, 24, WORLD.height - 24);
  }
  // Clear the fallen after a while so the streets never clog with bodies.
  state.peds = state.peds.filter((p) => !p.dead || p.downTime < 25);
  while (state.peds.length < 56) {
    const rng = state.rng;
    const x = clamp(state.player.x + randRange(rng, -900, 900), 60, WORLD.width - 60);
    const y = clamp(state.player.y + randRange(rng, -900, 900), 60, WORLD.height - 60);
    const [cx, cy] = collideBuildings(state.city, x, y, 16);
    state.peds.push(createPed(rng, cx, cy));
  }
}

/** On-foot player movement for one step. moveX/moveY are -1..1 inputs. */
export function updatePlayerFoot(state, dt, moveX, moveY, sprint) {
  const p = state.player;
  const mag = Math.hypot(moveX, moveY);
  if (mag > 0.01) {
    const speed = sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    const nx = moveX / (mag || 1); const ny = moveY / (mag || 1);
    p.x += nx * speed * dt;
    p.y += ny * speed * dt;
    p.walkPhase += dt * (sprint ? 13 : 9);
    p.moveAngle = Math.atan2(ny, nx);
  }
  const [cx, cy] = collideBuildings(state.city, p.x, p.y, PLAYER.radius);
  p.x = clamp(cx, 20, WORLD.width - 20);
  p.y = clamp(cy, 20, WORLD.height - 20);
}
