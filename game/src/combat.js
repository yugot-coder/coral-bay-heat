// Combat and effects: the pistol, its tracers, hit reactions, particles,
// skid marks and floating text popups. Bullets are short-lived line steps;
// anything they cross takes damage and reacts — and the law notices.
import { dist } from './random.js';
import { addCrime } from './police.js';
import { panicPeds } from './people.js';

export function spawnParticles(state, x, y, n, color, speed, life, size) {
  for (let i = 0; i < n; i += 1) {
    if (state.particles.length > 420) return;
    const a = state.rng() * Math.PI * 2;
    const s = (0.3 + state.rng() * 0.7) * (speed || 120);
    state.particles.push({
      x, y,
      vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      t: 0, life: (life || 0.5) * (0.6 + state.rng() * 0.7),
      color, size: (size || 3) * (0.6 + state.rng() * 0.8),
      gravity: 0,
    });
  }
}

export function spawnSmoke(state, x, y) {
  if (state.particles.length > 420) return;
  state.particles.push({
    x: x + (state.rng() - 0.5) * 14, y: y + (state.rng() - 0.5) * 14,
    vx: (state.rng() - 0.5) * 22, vy: -34 - state.rng() * 26,
    t: 0, life: 1.15, color: 'smoke', size: 9 + state.rng() * 9, gravity: -12,
  });
}

export function popup(state, x, y, text, color) {
  state.popups.push({ x, y, text, t: 0, life: 1.3, color: color || '#ffd94d' });
}

/** Fire the pistol from the player toward the aim point. */
export function shoot(state) {
  const p = state.player;
  if (p.car || p.cooldown > 0 || state.over) return;
  p.cooldown = 0.21;
  const a = p.aimAngle;
  const mx = p.x + Math.cos(a) * 20;
  const my = p.y + Math.sin(a) * 20;
  state.bullets.push({ x: mx, y: my, vx: Math.cos(a) * 1500, vy: Math.sin(a) * 1500, t: 0, life: 0.42, fromPlayer: true });
  state.muzzle = { x: mx, y: my, angle: a, t: 0 };
  state.events.push('shot');
  panicPeds(state, p.x, p.y, 320);
  addCrime(state, 'gunshot', p.x, p.y);
}

export function updateCombat(state, dt) {
  const p = state.player;
  if (p.cooldown > 0) p.cooldown -= dt;
  if (state.muzzle) { state.muzzle.t += dt; if (state.muzzle.t > 0.06) state.muzzle = null; }

  for (const b of state.bullets) {
    b.t += dt;
    const steps = 3;
    for (let s = 0; s < steps; s += 1) {
      b.x += (b.vx * dt) / steps;
      b.y += (b.vy * dt) / steps;
      // Buildings stop bullets.
      let stopped = false;
      for (const bd of state.city.buildings) {
        if (b.x > bd.x && b.x < bd.x + bd.w && b.y > bd.y && b.y < bd.y + bd.h) { stopped = true; break; }
      }
      if (stopped) { b.t = b.life + 1; spawnParticles(state, b.x, b.y, 4, '#ffe9a8', 90, 0.3, 2); break; }
      // Pedestrians.
      for (const ped of state.peds) {
        if (!ped.dead && dist(b.x, b.y, ped.x, ped.y) < 14) {
          ped.dead = true; ped.downTime = 0;
          b.t = b.life + 1;
          spawnParticles(state, ped.x, ped.y, 10, '#c0392b', 130, 0.55, 3);
          state.events.push('thud');
          addCrime(state, 'shotPed', ped.x, ped.y);
          panicPeds(state, ped.x, ped.y, 380);
          break;
        }
      }
      if (b.t > b.life) break;
      // Cars (including police Interceptors).
      for (const car of state.cars) {
        if (car.dead || car === p.car) continue;
        if (dist(b.x, b.y, car.x, car.y) < car.model.width) {
          car.health -= 14;
          b.t = b.life + 1;
          spawnParticles(state, b.x, b.y, 6, '#ffd94d', 150, 0.3, 2.5);
          state.events.push('thud');
          if (car.role === 'police') addCrime(state, 'hitCop', car.x, car.y);
          if (car.health <= 0 && !car.dead) {
            car.dead = true;
            spawnParticles(state, car.x, car.y, 26, '#ff8c42', 220, 0.8, 5);
            spawnSmoke(state, car.x, car.y);
          }
          break;
        }
      }
      if (b.t > b.life) break;
    }
  }
  state.bullets = state.bullets.filter((b) => b.t <= b.life);

  for (const pt of state.particles) {
    pt.t += dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vy += (pt.gravity || 0) * dt;
    pt.vx *= 0.96; pt.vy *= 0.96;
  }
  state.particles = state.particles.filter((pt) => pt.t < pt.life);

  for (const pop of state.popups) { pop.t += dt; pop.y -= 34 * dt; }
  state.popups = state.popups.filter((pop) => pop.t < pop.life);

  for (const sk of state.skids) sk.t += dt;
  state.skids = state.skids.filter((sk) => sk.t < 14);
  if (state.skids.length > 900) state.skids.splice(0, state.skids.length - 900);
}
