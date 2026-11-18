// The HUD, the minimap, and every screen drawn over the world: title,
// pause, busted and wasted. All canvas, all from live state.
import { FONT, PALETTE, WORLD } from './config.js';
import { BEACH_X, H_ROADS, V_ROADS, WATER_X } from './city.js';
import { currentMissionDef, currentObjective, objectiveDistance } from './missions.js';
import { clamp } from './random.js';

export function createHud(canvas) {
  const ctx = canvas.getContext('2d');

  function text(value, x, y, size, color, align, bold) {
    ctx.font = `${bold ? 'bold ' : ''}${size}px ${FONT}`;
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }

  function panel(x, y, w, h, alpha) {
    ctx.fillStyle = `rgba(16,24,32,${alpha || 0.72})`;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,248,234,0.25)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  function bar(x, y, w, h, frac, color) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * clamp(frac, 0, 1), h);
  }

  function drawMinimap(state, vw, vh) {
    const mw = 228; const mh = 171;
    const x = vw - mw - 16; const y = vh - mh - 16;
    const sx = mw / WORLD.width; const sy = mh / WORLD.height;
    panel(x - 4, y - 4, mw + 8, mh + 8, 0.8);
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, mw, mh); ctx.clip();
    ctx.fillStyle = '#5d8a52'; ctx.fillRect(x, y, mw, mh);
    ctx.fillStyle = PALETTE.sand; ctx.fillRect(x + BEACH_X * sx, y, (WATER_X - BEACH_X) * sx, mh);
    ctx.fillStyle = PALETTE.water; ctx.fillRect(x + WATER_X * sx, y, (WORLD.width - WATER_X) * sx, mh);
    ctx.fillStyle = 'rgba(60,50,40,0.55)';
    for (const b of state.city.buildings) ctx.fillRect(x + b.x * sx, y + b.y * sy, Math.max(1.6, b.w * sx), Math.max(1.6, b.h * sy));
    ctx.strokeStyle = '#3c4148'; ctx.lineWidth = 3;
    for (const vx of V_ROADS) { ctx.beginPath(); ctx.moveTo(x + vx * sx, y); ctx.lineTo(x + vx * sx, y + mh); ctx.stroke(); }
    for (const hy of H_ROADS) { ctx.beginPath(); ctx.moveTo(x, y + hy * sy); ctx.lineTo(x + mw, y + hy * sy); ctx.stroke(); }
    // Collectibles.
    ctx.fillStyle = '#19c2b8';
    for (const c of state.collectibles) if (!c.taken) ctx.fillRect(x + c.x * sx - 1.5, y + c.y * sy - 1.5, 3, 3);
    // Police blips flash red/blue.
    const flash = Math.floor(state.time * 4) % 2 === 0;
    for (const car of state.cars) {
      if (car.role !== 'police' || car.dead) continue;
      ctx.fillStyle = flash ? '#ff3b30' : '#3a7bff';
      ctx.beginPath(); ctx.arc(x + car.x * sx, y + car.y * sy, 3.4, 0, Math.PI * 2); ctx.fill();
    }
    // Objective marker.
    const obj = currentObjective(state);
    if (obj && obj.x !== undefined && state.mission.active) {
      ctx.fillStyle = '#ffd94d';
      ctx.beginPath(); ctx.arc(x + obj.x * sx, y + obj.y * sy, 4.6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.4; ctx.stroke();
    }
    // Player arrow.
    const p = state.player;
    ctx.save();
    ctx.translate(x + p.x * sx, y + p.y * sy);
    ctx.rotate(p.car ? p.car.angle : p.aimAngle);
    ctx.fillStyle = '#ffb347';
    ctx.beginPath();
    ctx.moveTo(7, 0); ctx.lineTo(-5, -4.6); ctx.lineTo(-5, 4.6);
    ctx.fill();
    ctx.strokeStyle = '#17222b'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
    ctx.restore();
    text(state.district.toUpperCase(), x + mw / 2, y - 10, 12.5, '#fff8ea', 'center', true);
  }

  function drawHud(state, vw, vh) {
    const p = state.player;
    // Cash, health, district, packages — top left.
    panel(14, 14, 252, 86, 0.66);
    text('$' + p.cash.toLocaleString('en-US'), 28, 48, 27, '#ffd94d', 'left', true);
    bar(28, 60, 150, 11, p.health / 100, p.health > 30 ? '#3ddc74' : '#ff4757');
    text('HP', 186, 71, 12, '#fff8ea', 'left', true);
    text('Packages ' + state.packagesFound + '/12', 28, 92, 13.5, '#9fe8e2');
    text('WASD move · E car · Mouse aim · Click shoot', vw / 2, vh - 10, 12.5, 'rgba(255,248,234,0.75)', 'center');

    // Wanted stars — top right.
    const stars = state.wanted.stars;
    if (stars > 0 || state.wanted.bustTimer > 0) {
      panel(vw - 232, 14, 218, 52, 0.66);
      for (let i = 0; i < 5; i += 1) {
        text('★', vw - 214 + i * 40, 54, 32, i < stars ? '#ffd94d' : 'rgba(255,255,255,0.22)', 'left', true);
      }
      if (state.wanted.bustTimer > 0) {
        bar(vw - 214, 72, 182, 8, state.wanted.bustTimer / 1.6, '#ff4757');
        text('BUSTED…', vw - 123, 94, 13, '#ff6b81', 'center', true);
      } else if (!state.wanted.seen && stars > 0) {
        text('LOSING THEM…', vw - 123, 84, 12.5, '#9fe8e2', 'center', true);
      }
    }

    // Mission panel.
    const def = currentMissionDef(state);
    const obj = currentObjective(state);
    if (state.mission.active && def && obj) {
      panel(14, 112, 330, 74, 0.66);
      text(def.title.toUpperCase(), 28, 136, 15, '#ffb347', 'left', true);
      const label = obj.label.length > 44 ? obj.label.slice(0, 44) + '…' : obj.label;
      text(label, 28, 158, 13.5, '#fff8ea');
      const d = objectiveDistance(state);
      let right = d >= 0 ? d + ' m' : '';
      if (def.timer) right = Math.max(0, Math.ceil(state.mission.timer)) + 's  ' + right;
      if (obj.type === 'earnStars') right = 'Stars: ' + state.wanted.stars + '/' + obj.stars;
      if (obj.type === 'loseHeat') right = state.wanted.stars > 0 ? 'Lose the heat first' : d + ' m';
      text(right, 28, 178, 13, '#ffd94d', 'left', true);
    } else if (!state.mission.done) {
      panel(14, 112, 330, 46, 0.55);
      text('Next job incoming…', 28, 141, 14, '#ffb347', 'left', true);
    } else {
      panel(14, 112, 330, 46, 0.55);
      text('FREE ROAM — Coral Bay is yours', 28, 141, 14, '#9fe8e2', 'left', true);
    }

    // Vehicle panel — bottom left.
    if (p.car) {
      panel(14, vh - 92, 240, 78, 0.66);
      text(p.car.model.name.toUpperCase(), 28, vh - 62, 17, '#fff8ea', 'left', true);
      const kmh = Math.round(Math.abs(p.car.speed) * 0.42);
      text(kmh + ' km/h', 240, vh - 62, 17, '#ffd94d', 'right', true);
      bar(28, vh - 50, 212, 8, p.car.health / 100, p.car.health > 35 ? '#3ddc74' : '#ff4757');
      text(p.car.health < 35 ? 'DAMAGE — find a quiet street' : 'Space: handbrake · E: exit', 28, vh - 28, 11.5, 'rgba(255,248,234,0.8)');
    }

    // Dialogue — bottom centre.
    if (state.dialogue) {
      const d = state.dialogue;
      const w = Math.min(760, vw - 560);
      const x = (vw - w) / 2;
      panel(x, vh - 122, w, 76, 0.78);
      text(d.speaker, x + 16, vh - 96, 13, '#ffb347', 'left', true);
      wrapText(d.text, x + 16, vh - 76, w - 32, 15, '#fff8ea');
    }

    // Mission banner — upper centre.
    if (state.banner) {
      const bn = state.banner;
      const alpha = clamp(Math.min(bn.t * 3, (bn.life - bn.t) * 1.4, 1), 0, 1);
      ctx.globalAlpha = alpha;
      text(bn.title, vw / 2, 118, 34, '#ffd94d', 'center', true);
      text(bn.sub, vw / 2, 146, 16.5, '#fff8ea', 'center');
      ctx.globalAlpha = 1;
    }

    // Damage vignette.
    const hurt = clamp((100 - p.health) / 160, 0, 0.5);
    const flash = state.time - p.lastHurtAt < 0.25 ? 0.25 : 0;
    if (hurt + flash > 0.01) {
      const grad = ctx.createRadialGradient(vw / 2, vh / 2, vh * 0.36, vw / 2, vh / 2, vh * 0.78);
      grad.addColorStop(0, 'rgba(200,20,30,0)');
      grad.addColorStop(1, `rgba(200,20,30,${hurt + flash})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, vw, vh);
    }

    drawMinimap(state, vw, vh);
  }

  function wrapText(value, x, y, maxW, size, color) {
    ctx.font = `${size}px ${FONT}`;
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    const words = value.split(' ');
    let line = '';
    let ly = y;
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, ly);
        line = word;
        ly += size + 3;
      } else line = test;
    }
    if (line) ctx.fillText(line, x, ly);
  }

  function drawTitle(state, vw, vh, hasSave) {
    const grad = ctx.createLinearGradient(0, 0, 0, vh);
    grad.addColorStop(0, 'rgba(16,14,40,0.42)');
    grad.addColorStop(0.55, 'rgba(30,16,44,0.55)');
    grad.addColorStop(1, 'rgba(10,10,26,0.78)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, vw, vh);
    text('CORAL BAY', vw / 2, 168, 76, '#fff8ea', 'center', true);
    text('H E A T', vw / 2, 238, 64, '#ff6b4a', 'center', true);
    text('An original open-world crime caper on the Coral Coast', vw / 2, 276, 17, '#ffd9a0', 'center');
    panel(vw / 2 - 265, 306, 530, 196, 0.78);
    text('▶  NEW GAME — press Enter', vw / 2, 344, 20, '#ffd94d', 'center', true);
    text(hasSave ? 'CONTINUE — press C  (save found)' : 'CONTINUE — no save yet', vw / 2, 376, 16.5, hasSave ? '#fff8ea' : 'rgba(255,248,234,0.45)', 'center');
    text('HOW TO PLAY', vw / 2, 410, 14, '#ffb347', 'center', true);
    text('WASD / arrows move · Shift sprint · E enter & exit cars', vw / 2, 434, 14.5, '#fff8ea', 'center');
    text('Mouse aims · Click or F shoots · Space handbrake · Esc / P pause', vw / 2, 458, 14.5, '#fff8ea', 'center');
    text('Do jobs for Mara Voss. Five stars means run. Your progress saves itself.', vw / 2, 482, 14.5, '#fff8ea', 'center');
    text('A game of Coral Bay — its city, people, cars and story are all original.', vw / 2, vh - 42, 13, 'rgba(255,248,234,0.8)', 'center');
    text('Built for the make.fun gta6-01 bounty', vw / 2, vh - 20, 12, 'rgba(255,248,234,0.6)', 'center');
  }

  function drawCenterPanel(title, lines, vw, vh, color) {
    ctx.fillStyle = 'rgba(8,10,20,0.55)';
    ctx.fillRect(0, 0, vw, vh);
    text(title, vw / 2, vh / 2 - 30, 54, color || '#ffd94d', 'center', true);
    lines.forEach((line, i) => text(line, vw / 2, vh / 2 + 16 + i * 26, 17, '#fff8ea', 'center'));
  }

  function draw(state, screen, vw, vh, hasSave) {
    if (screen === 'play') drawHud(state, vw, vh);
    else if (screen === 'title') drawTitle(state, vw, vh, hasSave);
    else if (screen === 'paused') {
      drawHud(state, vw, vh);
      drawCenterPanel('PAUSED', ['Coral Bay waits for no one — except now.', 'Press Esc or P to keep driving.'], vw, vh);
    } else if (screen === 'busted') {
      drawHud(state, vw, vh);
      drawCenterPanel('BUSTED', ['The Coral Bay PD got you.', 'Press Enter — pay the fine and walk out of the station.'], vw, vh, '#ff6b81');
    } else if (screen === 'wasted') {
      drawHud(state, vw, vh);
      drawCenterPanel('WASTED', ['St. Coral Hospital is very good at this by now.', 'Press Enter — pay the bill and walk out.'], vw, vh, '#ff4757');
    }
  }

  return { draw };
}
