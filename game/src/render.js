// Drawing the world: camera, city, cars, people, effects and light.
// Everything is canvas-drawn from the generated city — no image assets.
// The renderer culls to the camera view, so a 4800x3600 city stays cheap.
import { FONT, PALETTE, PHASE_NIGHT, WORLD } from './config.js';
import { BEACH_X, H_ROADS, ROAD_W, V_ROADS, WATER_X } from './city.js';
import { currentObjective } from './missions.js';
import { clamp } from './random.js';

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { w: 1280, h: 720 };

  function resize() {
    view.w = window.innerWidth;
    view.h = window.innerHeight;
    canvas.width = view.w;
    canvas.height = view.h;
  }
  window.addEventListener('resize', resize);
  resize();

  function rect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }

  function circle(x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawGround(state, l, t, r, b) {
    rect(l, t, r - l, b - t, PALETTE.grass);
    // Beach sand and the animated sea along the east edge.
    if (r > BEACH_X) {
      rect(Math.max(l, BEACH_X), t, r - Math.max(l, BEACH_X), b - t, PALETTE.sand);
      rect(Math.max(l, WATER_X), t, r - Math.max(l, WATER_X), b - t, PALETTE.water);
      ctx.fillStyle = PALETTE.waterDeep;
      const wt = Math.max(l, WATER_X);
      ctx.fillRect(wt, t, 26, b - t);
      // Sparkle: deterministic from world time, never from the wall clock.
      ctx.fillStyle = 'rgba(255,255,220,0.5)';
      for (let i = 0; i < 46; i += 1) {
        const sx = WATER_X + 40 + ((i * 173) % 300);
        const sy = ((i * 389 + Math.floor(state.time * 22) * (i % 3 + 1)) % WORLD.height);
        if (sx > l && sx < r && sy > t && sy < b) ctx.fillRect(sx, sy, 16, 2.4);
      }
      // Foam line where the water meets the sand.
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      const foamX = WATER_X + Math.sin(state.time * 1.4) * 5;
      ctx.fillRect(foamX, t, 4, b - t);
    }
    for (const park of state.city.parks) {
      if (park.x + park.w < l || park.x > r || park.y + park.h < t || park.y > b) continue;
      rect(park.x, park.y, park.w, park.h, PALETTE.park);
      rect(park.x + 14, park.y + 14, park.w - 28, 10, '#7cbf6e');
      ctx.strokeStyle = '#cbbfa5';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(park.x + 20, park.y + park.h / 2);
      ctx.lineTo(park.x + park.w - 20, park.y + park.h / 2);
      ctx.stroke();
    }
    for (const lot of state.city.lots) {
      if (lot.x + lot.w < l || lot.x > r || lot.y + lot.h < t || lot.y > b) continue;
      rect(lot.x, lot.y, lot.w, lot.h, PALETTE.lot);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      for (let x = lot.x + 26; x < lot.x + lot.w - 30; x += 90) {
        ctx.strokeRect(x, lot.y + 18, 62, lot.h - 36);
      }
    }
  }

  function drawRoads(state, l, t, r, b) {
    for (const vx of V_ROADS) {
      if (vx + ROAD_W / 2 < l || vx - ROAD_W / 2 > r) continue;
      rect(vx - ROAD_W / 2 - 13, t, ROAD_W + 26, b - t, PALETTE.sidewalk);
      rect(vx - ROAD_W / 2, t, ROAD_W, b - t, PALETTE.asphalt);
    }
    for (const hy of H_ROADS) {
      if (hy + ROAD_W / 2 < t || hy - ROAD_W / 2 > b) continue;
      rect(l, hy - ROAD_W / 2 - 13, r - l, ROAD_W + 26, PALETTE.sidewalk);
      rect(l, hy - ROAD_W / 2, r - l, ROAD_W, PALETTE.asphalt);
    }
    // Lane dashes.
    ctx.fillStyle = PALETTE.lane;
    for (const vx of V_ROADS) {
      for (let y = Math.floor(t / 84) * 84; y < b; y += 84) ctx.fillRect(vx - 2, y, 4, 40);
    }
    for (const hy of H_ROADS) {
      for (let x = Math.floor(l / 84) * 84; x < r; x += 84) ctx.fillRect(x, hy - 2, 40, 4);
    }
    // Crosswalks at intersections.
    ctx.fillStyle = PALETTE.crosswalk;
    for (const vx of V_ROADS) for (const hy of H_ROADS) {
      if (vx + 90 < l || vx - 90 > r || hy + 90 < t || hy - 90 > b) continue;
      for (let i = -2; i <= 2; i += 1) {
        ctx.fillRect(vx - ROAD_W / 2 - 12, hy + i * 18 - 5, 22, 10);
        ctx.fillRect(vx + ROAD_W / 2 - 10, hy + i * 18 - 5, 22, 10);
        ctx.fillRect(vx + i * 18 - 5, hy - ROAD_W / 2 - 12, 10, 22);
        ctx.fillRect(vx + i * 18 - 5, hy + ROAD_W / 2 - 10, 10, 22);
      }
    }
    // Streetlights.
    for (const s of state.city.lights) {
      if (s.x < l || s.x > r || s.y < t || s.y > b) continue;
      circle(s.x, s.y, 4, '#5a5148');
      if (state.phase === PHASE_NIGHT) circle(s.x, s.y, 13, 'rgba(255,205,110,0.35)');
    }
  }

  function drawBuildings(state, l, t, r, b) {
    for (const bd of state.city.buildings) {
      if (bd.x + bd.w < l - 60 || bd.x > r + 60 || bd.y + bd.h < t - 60 || bd.y > b + 60) continue;
      const sh = 6 + bd.height * 0.16;
      rect(bd.x + sh, bd.y + sh, bd.w, bd.h, 'rgba(60,35,20,0.35)');
      rect(bd.x - 5, bd.y - 5, bd.w + 10, bd.h + 10, PALETTE.sidewalk);
      rect(bd.x, bd.y, bd.w, bd.h, bd.color);
      const inset = 9;
      rect(bd.x + inset, bd.y + inset, bd.w - inset * 2, bd.h - inset * 2, shade(bd.color, 18));
      // Window grid; lit gold at night.
      const cols = Math.max(2, Math.floor(bd.w / 34));
      const rows = Math.max(2, Math.floor(bd.h / 34));
      for (let cx = 0; cx < cols; cx += 1) {
        for (let cy = 0; cy < rows; cy += 1) {
          const lit = ((cx * 7 + cy * 13 + bd.windows) % 5) === 0;
          ctx.fillStyle = state.phase === PHASE_NIGHT && lit ? '#ffd873' : 'rgba(40,60,80,0.35)';
          ctx.fillRect(bd.x + 16 + cx * ((bd.w - 26) / cols), bd.y + 16 + cy * ((bd.h - 26) / rows), 11, 8);
        }
      }
      // Rooftop details.
      ctx.fillStyle = 'rgba(90,80,70,0.55)';
      if (bd.roof === 'ac') ctx.fillRect(bd.x + bd.w * 0.6, bd.y + bd.h * 0.55, 26, 18);
      else if (bd.roof === 'tank') circle(bd.x + bd.w * 0.68, bd.y + bd.h * 0.4, 12, 'rgba(90,80,70,0.6)');
      else if (bd.roof === 'garden') rect(bd.x + bd.w * 0.15, bd.y + bd.h * 0.6, bd.w * 0.3, bd.h * 0.22, '#5da653');
      else if (bd.roof === 'helipad') {
        ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(bd.x + bd.w / 2, bd.y + bd.h / 2, 20, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = `bold 22px ${FONT}`; ctx.textAlign = 'center';
        ctx.fillText('H', bd.x + bd.w / 2, bd.y + bd.h / 2 + 8);
      }
      if (bd.label) {
        ctx.fillStyle = `hsl(${bd.signHue} 70% 42%)`;
        const labelW = Math.min(bd.w - 12, bd.label.length * 8.4 + 14);
        ctx.fillRect(bd.x + (bd.w - labelW) / 2, bd.y + 3, labelW, 17);
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold 10.5px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(bd.label, bd.x + bd.w / 2, bd.y + 16);
      }
    }
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const rr = clamp(((n >> 16) & 255) + amt, 0, 255);
    const gg = clamp(((n >> 8) & 255) + amt, 0, 255);
    const bb = clamp((n & 255) + amt, 0, 255);
    return `rgb(${rr},${gg},${bb})`;
  }

  function drawTrees(state, l, t, r, b) {
    for (const tree of state.city.trees) {
      if (tree.x < l - 30 || tree.x > r + 30 || tree.y < t - 30 || tree.y > b + 30) continue;
      ctx.fillStyle = 'rgba(60,35,20,0.25)';
      ctx.beginPath(); ctx.ellipse(tree.x + 7, tree.y + 8, tree.r, tree.r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
      if (tree.palm) {
        ctx.strokeStyle = '#8a6b42'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(tree.x - 5, tree.y + 9); ctx.quadraticCurveTo(tree.x, tree.y, tree.x + 2, tree.y - 8); ctx.stroke();
        ctx.strokeStyle = '#3f9e4d'; ctx.lineWidth = 3;
        for (let i = 0; i < 6; i += 1) {
          const a = (i / 6) * Math.PI * 2 + 0.4;
          ctx.beginPath();
          ctx.moveTo(tree.x + 2, tree.y - 8);
          ctx.quadraticCurveTo(tree.x + 2 + Math.cos(a) * 14, tree.y - 13 + Math.sin(a) * 5, tree.x + 2 + Math.cos(a) * 21, tree.y - 4 + Math.sin(a) * 11);
          ctx.stroke();
        }
      } else {
        circle(tree.x, tree.y, tree.r, '#3f8f46');
        circle(tree.x - tree.r * 0.3, tree.y - tree.r * 0.3, tree.r * 0.62, '#55ab5a');
      }
    }
  }

  function drawCar(state, car) {
    const m = car.model;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    // Headlight cones first (under the body) at night.
    if (state.phase === PHASE_NIGHT) {
      const grad = ctx.createLinearGradient(m.length / 2, 0, m.length / 2 + 130, 0);
      grad.addColorStop(0, 'rgba(255,240,180,0.34)');
      grad.addColorStop(1, 'rgba(255,240,180,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(m.length / 2, -9);
      ctx.lineTo(m.length / 2 + 130, -34);
      ctx.lineTo(m.length / 2 + 130, 34);
      ctx.lineTo(m.length / 2, 9);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(40,25,15,0.35)';
    ctx.fillRect(-m.length / 2 + 4, -m.width / 2 + 5, m.length, m.width);
    // Wheels.
    ctx.fillStyle = '#181818';
    const ww = 11; const wh = 6;
    ctx.fillRect(-m.length / 2 + 6, -m.width / 2 - 3, ww, wh);
    ctx.fillRect(-m.length / 2 + 6, m.width / 2 - 3, ww, wh);
    ctx.fillRect(m.length / 2 - 17, -m.width / 2 - 3, ww, wh);
    ctx.fillRect(m.length / 2 - 17, m.width / 2 - 3, ww, wh);
    // Body.
    ctx.fillStyle = car.dead ? '#3a3a3a' : car.color;
    ctx.beginPath();
    ctx.roundRect(-m.length / 2, -m.width / 2, m.length, m.width, 8);
    ctx.fill();
    if (car.role === 'police') {
      ctx.fillStyle = '#1d2733';
      ctx.fillRect(-6, -m.width / 2, 20, m.width);
      // Light bar: red and blue alternate with world time.
      const phase = Math.floor(state.time * 6) % 2 === 0;
      ctx.fillStyle = phase ? '#ff3b30' : '#3a7bff';
      ctx.fillRect(-4, -8, 9, 16);
      ctx.fillStyle = phase ? '#3a7bff' : '#ff3b30';
      ctx.fillRect(6, -8, 9, 16);
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold 8px ${FONT}`; ctx.textAlign = 'center';
      ctx.fillText('PD', 2, 3);
    }
    // Cabin and glass.
    ctx.fillStyle = 'rgba(24,38,54,0.88)';
    ctx.beginPath();
    ctx.roundRect(-m.length * 0.18, -m.width * 0.36, m.length * 0.38, m.width * 0.72, 5);
    ctx.fill();
    ctx.fillStyle = 'rgba(150,210,240,0.5)';
    ctx.fillRect(m.length * 0.13, -m.width * 0.32, 5, m.width * 0.64);
    if (m.kind === 'pickup') { ctx.fillStyle = shade(car.color === '#3a3a3a' ? '#666666' : car.color, -24); ctx.fillRect(-m.length / 2 + 4, -m.width / 2 + 4, m.length * 0.34, m.width - 8); }
    if (m.kind === 'van') { ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(-m.length * 0.05, -m.width / 2 + 4, m.length * 0.4, m.width - 8); }
    if (m.kind === 'sports') { ctx.fillStyle = '#20242a'; ctx.fillRect(-m.length / 2 + 2, -m.width / 2 + 2, 8, m.width - 4); }
    // Headlights and tail lights.
    ctx.fillStyle = '#fff6bf';
    ctx.fillRect(m.length / 2 - 3, -m.width / 2 + 4, 3, 6);
    ctx.fillRect(m.length / 2 - 3, m.width / 2 - 10, 3, 6);
    ctx.fillStyle = '#ff5040';
    ctx.fillRect(-m.length / 2, -m.width / 2 + 4, 3, 6);
    ctx.fillRect(-m.length / 2, m.width / 2 - 10, 3, 6);
    if (car.health < 55 && !car.dead) {
      ctx.fillStyle = 'rgba(30,30,30,0.5)';
      ctx.fillRect(m.length * 0.2, -6, 10, 12);
    }
    ctx.restore();
  }

  function drawPerson(x, y, angle, shirt, skin, phase, dead) {
    if (dead) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      circle(4, 10, 9, 'rgba(140,20,20,0.5)');
      ctx.fillStyle = shirt;
      ctx.fillRect(-11, -5, 22, 10);
      circle(14, 0, 6, skin);
      ctx.restore();
      return;
    }
    const bob = Math.sin(phase) * 1.6;
    ctx.fillStyle = 'rgba(40,25,15,0.3)';
    ctx.beginPath(); ctx.ellipse(x + 3, y + 4, 11, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = '#2e3440';
    ctx.fillRect(-3, -8 + bob * 0.4, 9, 5);
    ctx.fillRect(-3, 3 - bob * 0.4, 9, 5);
    circle(0, 0, 9.5, shirt);
    circle(3, 0, 5.6, skin);
    ctx.restore();
  }

  function draw(state) {
    const camX = state.camera.x; const camY = state.camera.y;
    const l = camX - view.w / 2; const t = camY - view.h / 2;
    const r = camX + view.w / 2; const b = camY + view.h / 2;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    rect(0, 0, view.w, view.h, '#79a86b');
    ctx.translate(-l, -t);

    drawGround(state, l, t, r, b);
    drawRoads(state, l, t, r, b);

    // District names painted on the ground.
    ctx.fillStyle = 'rgba(255,248,230,0.20)';
    ctx.font = `bold 44px ${FONT}`;
    ctx.textAlign = 'center';
    const names = [['MARINA MILE', 3750, 620], ['PALM HEIGHTS', 2150, 760], ['OLD CANNERY', 760, 2650], ['PORTSIDE DOCKS', 3150, 2750], ['CORAL FLATS', 700, 1500]];
    for (const [name, x, y] of names) if (x > l - 300 && x < r + 300 && y > t && y < b) ctx.fillText(name, x, y);

    // Skid marks under everything that moves.
    ctx.fillStyle = 'rgba(22,22,22,0.5)';
    for (const sk of state.skids) {
      if (sk.x < l || sk.x > r || sk.y < t || sk.y > b) continue;
      ctx.globalAlpha = clamp(1 - sk.t / 14, 0, 1) * 0.55;
      ctx.fillRect(sk.x - 3, sk.y - 3, 6, 6);
    }
    ctx.globalAlpha = 1;

    // Objective beam of light.
    const obj = currentObjective(state);
    if (obj && obj.x !== undefined && state.mission.active) {
      const pulse = 26 + Math.sin(state.time * 4) * 6;
      const grad = ctx.createLinearGradient(obj.x, obj.y - 460, obj.x, obj.y);
      grad.addColorStop(0, 'rgba(255,217,77,0)');
      grad.addColorStop(1, 'rgba(255,217,77,0.55)');
      ctx.fillStyle = grad;
      ctx.fillRect(obj.x - 17, obj.y - 460, 34, 460);
      ctx.strokeStyle = '#ffd94d'; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.arc(obj.x, obj.y, pulse, 0, Math.PI * 2); ctx.stroke();
      circle(obj.x, obj.y, 6, '#ffd94d');
    }
    // Mission target car marker.
    if (state.mission.active && state.mission.targetCarId) {
      const target = state.cars.find((c) => c.id === state.mission.targetCarId);
      if (target && !target.dead && state.player.car !== target) {
        const bobY = Math.sin(state.time * 4) * 6;
        ctx.fillStyle = '#ff7a59';
        ctx.beginPath();
        ctx.moveTo(target.x, target.y - 44 + bobY);
        ctx.lineTo(target.x - 11, target.y - 62 + bobY);
        ctx.lineTo(target.x + 11, target.y - 62 + bobY);
        ctx.fill();
      }
    }
    // Hidden packages.
    for (const c of state.collectibles) {
      if (c.taken || c.x < l - 30 || c.x > r + 30 || c.y < t - 30 || c.y > b + 30) continue;
      const bobY = Math.sin(state.time * 2.4 + c.bob) * 4;
      circle(c.x, c.y + bobY, 15, 'rgba(25,194,184,0.25)');
      ctx.save();
      ctx.translate(c.x, c.y + bobY);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#19c2b8';
      ctx.fillRect(-8, -8, 16, 16);
      ctx.fillStyle = '#d9fffa';
      ctx.fillRect(-4, -4, 8, 8);
      ctx.restore();
    }

    drawBuildings(state, l, t, r, b);
    drawTrees(state, l, t, r, b);

    for (const car of state.cars) {
      if (car.x < l - 90 || car.x > r + 90 || car.y < t - 90 || car.y > b + 90) continue;
      drawCar(state, car);
    }
    for (const ped of state.peds) {
      if (ped.x < l - 30 || ped.x > r + 30 || ped.y < t - 30 || ped.y > b + 30) continue;
      drawPerson(ped.x, ped.y, ped.angle, ped.shirt, ped.skin, ped.walkPhase, ped.dead);
    }
    // The player (when not inside a car).
    const p = state.player;
    if (!p.car) {
      circle(p.x, p.y, 17, 'rgba(255,179,71,0.35)');
      drawPerson(p.x, p.y, p.aimAngle, '#ff8c42', '#f2c9a0', p.walkPhase, false);
      // Pistol in hand, pointed at the aim.
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.aimAngle);
      ctx.fillStyle = '#22262c';
      ctx.fillRect(8, -2, 13, 4.5);
      ctx.restore();
    }
    if (state.muzzle) {
      ctx.save();
      ctx.translate(state.muzzle.x, state.muzzle.y);
      ctx.rotate(state.muzzle.angle);
      ctx.fillStyle = '#ffe27a';
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(20, -5); ctx.lineTo(15, 0); ctx.lineTo(20, 5);
      ctx.fill();
      ctx.restore();
    }
    // Tracers.
    ctx.strokeStyle = 'rgba(255,240,180,0.9)';
    ctx.lineWidth = 2.2;
    for (const bl of state.bullets) {
      ctx.beginPath();
      ctx.moveTo(bl.x - bl.vx * 0.012, bl.y - bl.vy * 0.012);
      ctx.lineTo(bl.x, bl.y);
      ctx.stroke();
    }
    // Particles.
    for (const pt of state.particles) {
      const k = 1 - pt.t / pt.life;
      if (pt.color === 'smoke') {
        ctx.fillStyle = `rgba(70,70,70,${0.32 * k})`;
        circle(pt.x, pt.y, pt.size * (1.6 - k * 0.6), ctx.fillStyle);
      } else {
        ctx.globalAlpha = k;
        circle(pt.x, pt.y, pt.size, pt.color);
        ctx.globalAlpha = 1;
      }
    }
    // Helicopter and its searchlight.
    if (state.heli.active) {
      const h = state.heli;
      const grad = ctx.createRadialGradient(h.x, h.y, 20, h.x, h.y, 195);
      grad.addColorStop(0, 'rgba(255,246,190,0.5)');
      grad.addColorStop(1, 'rgba(255,246,190,0)');
      ctx.fillStyle = grad;
      circle(h.x, h.y, 195, grad);
      const hx = h.x - 150; const hy = h.y - 170;
      ctx.fillStyle = 'rgba(30,34,40,0.9)';
      ctx.beginPath(); ctx.ellipse(hx, hy, 30, 13, 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(20,20,20,0.85)'; ctx.lineWidth = 3.4;
      const rot = state.time * 31;
      ctx.beginPath();
      ctx.moveTo(hx - Math.cos(rot) * 44, hy - 8 - Math.sin(rot) * 5);
      ctx.lineTo(hx + Math.cos(rot) * 44, hy - 8 + Math.sin(rot) * 5);
      ctx.stroke();
      ctx.fillStyle = '#ffd94d';
      circle(hx + 20, hy + 4, 3.4, '#ffd94d');
    }
    // Floating popups.
    ctx.font = `bold 15px ${FONT}`;
    ctx.textAlign = 'center';
    for (const pop of state.popups) {
      ctx.globalAlpha = clamp(1 - pop.t / pop.life, 0, 1);
      ctx.fillStyle = pop.color;
      ctx.fillText(pop.text, pop.x, pop.y);
    }
    ctx.globalAlpha = 1;

    // Time-of-day grade over the world (screen space again).
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (state.phase === PHASE_NIGHT) {
      rect(0, 0, view.w, view.h, 'rgba(12,18,52,0.38)');
      rect(0, 0, view.w, view.h, 'rgba(255,140,60,0.05)');
    } else {
      rect(0, 0, view.w, view.h, 'rgba(255,156,64,0.08)');
      const grad = ctx.createLinearGradient(0, 0, 0, view.h);
      grad.addColorStop(0, 'rgba(255,190,90,0.10)');
      grad.addColorStop(1, 'rgba(255,110,60,0.05)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, view.w, view.h);
    }
  }

  return { draw, view };
}
