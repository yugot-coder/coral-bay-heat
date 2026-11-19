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
    // Mower stripes: a 300px checker of slightly lighter grass.
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    {
      const gs = 300;
      const x0 = Math.floor(l / gs) * gs;
      const y0 = Math.floor(t / gs) * gs;
      for (let gx = x0; gx < r; gx += gs) {
        for (let gy = y0; gy < b; gy += gs) {
          const cx = Math.floor(gx / gs);
          const cy = Math.floor(gy / gs);
          if ((cx + cy) % 2 === 0) ctx.fillRect(gx, gy, gs, gs);
        }
      }
    }
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
      ctx.beginPath();
      ctx.moveTo(park.x + park.w / 2, park.y + 20);
      ctx.lineTo(park.x + park.w / 2, park.y + park.h - 20);
      ctx.stroke();
      // Two benches at hash-derived spots inside the park.
      for (let bi = 0; bi < 2; bi += 1) {
        const bh = winHash(park.x + bi * 137, park.y + bi * 89);
        const bx = park.x + 28 + (bh % Math.max(1, park.w - 90));
        const by = park.y + 28 + ((bh >>> 5) % Math.max(1, park.h - 70));
        rect(bx, by, 28, 10, '#8a6b42');
        rect(bx, by + 3, 28, 1.6, 'rgba(0,0,0,0.35)');
        rect(bx, by + 6.5, 28, 1.6, 'rgba(0,0,0,0.35)');
      }
      // A pond in one corner of every other park.
      if (winHash(park.x, park.y) % 2 === 0) {
        const px2 = park.x + park.w - 64;
        const py2 = park.y + 54;
        ctx.fillStyle = '#e8e4da';
        ctx.beginPath(); ctx.ellipse(px2, py2, 42, 25, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3f8fae';
        ctx.beginPath(); ctx.ellipse(px2, py2, 37, 20, 0, 0, Math.PI * 2); ctx.fill();
      }
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
    // Edge lines along every road.
    ctx.fillStyle = 'rgba(244,233,200,0.45)';
    for (const vx of V_ROADS) {
      if (vx + ROAD_W / 2 < l || vx - ROAD_W / 2 > r) continue;
      ctx.fillRect(vx - ROAD_W / 2 + 5, t, 3, b - t);
      ctx.fillRect(vx + ROAD_W / 2 - 8, t, 3, b - t);
    }
    for (const hy of H_ROADS) {
      if (hy + ROAD_W / 2 < t || hy - ROAD_W / 2 > b) continue;
      ctx.fillRect(l, hy - ROAD_W / 2 + 5, r - l, 3);
      ctx.fillRect(l, hy + ROAD_W / 2 - 8, r - l, 3);
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

  // Per-window / per-pane variety from a position hash — deterministic,
  // no rng, no wall clock.
  function winHash(x, y) {
    let h = (Math.floor(x) * 374761393 + Math.floor(y) * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  }

  function drawProps(state, l, t, r, b) {
    for (const prop of state.city.props || []) {
      if (prop.x < l - 60 || prop.x > r + 60 || prop.y < t - 60 || prop.y > b + 60) continue;
      if (prop.kind === 'umbrella') {
        // Towel beside the umbrella.
        ctx.save();
        ctx.translate(prop.x + prop.towelSide * 17, prop.y + 13);
        ctx.rotate(prop.towelAngle);
        rect(-13, -6, 26, 12, `hsl(${prop.towelHue} 65% 62%)`);
        rect(-13, -2, 26, 4, 'rgba(255,255,255,0.55)');
        ctx.restore();
        circle(prop.x + 3, prop.y + 4, 13, 'rgba(60,35,20,0.22)');
        circle(prop.x, prop.y, 13, `hsl(${prop.hue} 78% 58%)`);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.moveTo(prop.x, prop.y - 13);
        ctx.lineTo(prop.x + 11, prop.y + 7);
        ctx.lineTo(prop.x - 11, prop.y + 7);
        ctx.fill();
        circle(prop.x, prop.y, 3.4, '#ffffff');
      } else if (prop.kind === 'boat') {
        ctx.save();
        ctx.translate(prop.x, prop.y);
        ctx.rotate(prop.angle);
        ctx.fillStyle = 'rgba(10,50,60,0.3)';
        ctx.beginPath(); ctx.ellipse(3, 4, prop.len / 2, 10, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `hsl(${prop.hue} 55% 88%)`;
        ctx.beginPath(); ctx.ellipse(0, 0, prop.len / 2, 9.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `hsl(${prop.hue} 70% 52%)`;
        ctx.fillRect(-prop.len / 2 + 3, -2.2, prop.len - 6, 4.4);
        rect(-6, -5, 15, 10, '#f4f1e8');
        rect(-3, -3.4, 6, 6.8, 'rgba(40,80,110,0.8)');
        ctx.restore();
      }
    }
  }

  function drawBuildings(state, l, t, r, b) {
    const night = state.phase === PHASE_NIGHT;
    for (const bd of state.city.buildings) {
      if (bd.x + bd.w < l - 60 || bd.x > r + 60 || bd.y + bd.h < t - 60 || bd.y > b + 60) continue;
      const sh = 6 + bd.height * 0.16;
      rect(bd.x + sh, bd.y + sh, bd.w, bd.h, 'rgba(60,35,20,0.35)');
      rect(bd.x - 9, bd.y - 9, bd.w + 18, bd.h + 18, PALETTE.plaza);
      rect(bd.x - 5, bd.y - 5, bd.w + 10, bd.h + 10, PALETTE.sidewalk);
      // Two-tone body: deeper base, lighter upper field.
      rect(bd.x, bd.y, bd.w, bd.h, shade(bd.color, -16));
      rect(bd.x, bd.y, bd.w, bd.h - 12, shade(bd.color, 16));
      // Cornice along the top edge, plinth along the bottom.
      rect(bd.x, bd.y, bd.w, 5, bd.trim);
      rect(bd.x, bd.y + 5, bd.w, 2, 'rgba(0,0,0,0.18)');
      rect(bd.x, bd.y + bd.h - 6, bd.w, 6, shade(bd.color, -34));

      const shopH = bd.shop ? 30 : 0;
      const fx = bd.x + 10; const fy = bd.y + 10;
      const fw = bd.w - 20; const fh = bd.h - 20 - shopH;
      const style = bd.style || 'slab';

      if (style === 'glass') {
        // Near-full glazing: glass field, mullions, diagonal shine.
        rect(fx, fy, fw, fh, night ? '#274b63' : '#4d7d9c');
        const px = 21; const py = 17;
        for (let gx = fx; gx < fx + fw; gx += px) {
          for (let gy = fy; gy < fy + fh; gy += py) {
            const pw = Math.min(px - 2.5, fx + fw - gx - 1);
            const ph = Math.min(py - 2.5, fy + fh - gy - 1);
            if (pw < 4 || ph < 4) continue;
            const wh = winHash(gx, gy);
            const group = Math.floor((gx - fx) / 63);
            const gh = winHash(fx + group * 63, gy);
            const lit = night ? (gh % 100 < 30 && wh % 100 < 80) : wh % 100 < 7;
            ctx.fillStyle = lit ? (night ? '#ffd873' : '#ffca7a') : (night ? (wh % 2 === 0 ? 'rgba(120,170,200,0.28)' : 'rgba(90,140,175,0.22)') : (wh % 2 === 0 ? 'rgba(190,228,248,0.5)' : 'rgba(150,200,230,0.38)'));
            ctx.fillRect(gx + 1.2, gy + 1.2, pw, ph);
          }
        }
        ctx.strokeStyle = 'rgba(225,242,252,0.5)';
        ctx.lineWidth = 1.4;
        for (let gx = fx; gx <= fx + fw; gx += px) { ctx.beginPath(); ctx.moveTo(gx, fy); ctx.lineTo(gx, fy + fh); ctx.stroke(); }
        for (let gy = fy; gy <= fy + fh; gy += py) { ctx.beginPath(); ctx.moveTo(fx, gy); ctx.lineTo(fx + fw, gy); ctx.stroke(); }
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        ctx.beginPath();
        ctx.moveTo(fx + fw * 0.12, fy + fh);
        ctx.lineTo(fx + fw * 0.42, fy);
        ctx.lineTo(fx + fw * 0.62, fy);
        ctx.lineTo(fx + fw * 0.32, fy + fh);
        ctx.fill();
      } else {
        if (style === 'brick') {
          // Horizontal floor bands.
          ctx.fillStyle = 'rgba(120,52,32,0.20)';
          for (let gy = fy + 24; gy < fy + fh; gy += 25) ctx.fillRect(fx, gy, fw, 3);
          rect(fx, fy, fw, fh, 'rgba(150,70,45,0.10)');
        } else if (style === 'deco') {
          // Vertical fin stripes + stepped crown.
          ctx.fillStyle = 'rgba(255,255,255,0.20)';
          for (let gx = fx + 14; gx < fx + fw - 6; gx += 30) ctx.fillRect(gx, fy, 4, fh);
          const cw = Math.min(fw * 0.44, 92);
          rect(bd.x + bd.w / 2 - cw / 2, bd.y + 6, cw, 7, bd.trim);
          rect(bd.x + bd.w / 2 - cw * 0.32, bd.y + 1.5, cw * 0.64, 6, bd.trim);
        } else if (style === 'slab') {
          // Panel seams + a whisper of per-panel tint.
          for (let gx = fx; gx < fx + fw; gx += 34) {
            for (let gy = fy; gy < fy + fh; gy += 34) {
              if (winHash(gx, gy) % 3 === 0) rect(gx, gy, Math.min(34, fx + fw - gx), Math.min(34, fy + fh - gy), 'rgba(255,255,255,0.07)');
            }
          }
          ctx.strokeStyle = 'rgba(60,55,50,0.28)';
          ctx.lineWidth = 1.4;
          for (let gx = fx + 34; gx < fx + fw; gx += 34) { ctx.beginPath(); ctx.moveTo(gx, fy); ctx.lineTo(gx, fy + fh); ctx.stroke(); }
          for (let gy = fy + 34; gy < fy + fh; gy += 34) { ctx.beginPath(); ctx.moveTo(fx, gy); ctx.lineTo(fx + fw, gy); ctx.stroke(); }
        }
        // Framed windows with per-window variety.
        const cols = Math.max(2, Math.floor(bd.w / 34));
        const rows = Math.max(2, Math.floor((bd.h - shopH) / 34));
        for (let cx = 0; cx < cols; cx += 1) {
          for (let cy = 0; cy < rows; cy += 1) {
            const wx = bd.x + 16 + cx * ((bd.w - 26) / cols);
            const wy = bd.y + 15 + cy * ((bd.h - shopH - 24) / rows);
            const wh = winHash(wx, wy);
            const lit = night ? wh % 100 < 33 : wh % 100 < 8;
            if (style === 'stucco' && bd.balcony && cy > 0 && wh % 3 === 0) {
              // Balcony slab with little rails under this window.
              rect(wx - 3.5, wy + 11, 18, 3.4, shade(bd.color, -30));
              ctx.fillStyle = 'rgba(50,45,40,0.65)';
              for (let rx = 0; rx < 5; rx += 1) ctx.fillRect(wx - 3 + rx * 4.2, wy + 7.5, 1.4, 4);
              rect(wx - 3.5, wy + 6.8, 18, 1.6, 'rgba(50,45,40,0.65)');
            }
            if (style === 'stucco') { // shutters in the trim colour
              rect(wx - 3.4, wy - 0.6, 2.8, 9.4, bd.trim);
              rect(wx + 11.4, wy - 0.6, 2.8, 9.4, bd.trim);
            }
            if (style === 'brick') rect(wx - 1.6, wy - 3, 14.2, 2.6, 'rgba(255,244,225,0.75)'); // lintel
            rect(wx - 1.4, wy - 1.4, 13.8, 10.8, 'rgba(255,250,238,0.85)'); // frame
            ctx.fillStyle = lit ? (night ? '#ffd873' : '#ffd9a0') : (wh % 4 === 0 ? 'rgba(96,140,168,0.85)' : 'rgba(40,60,80,0.5)');
            ctx.fillRect(wx, wy, 11, 8);
          }
        }
      }

      // Shopfront along the bottom edge: dark band, wide panes, striped
      // awning projecting onto the sidewalk, sign board when named.
      if (bd.shop) {
        const sy = bd.y + bd.h - shopH;
        rect(bd.x + 3, sy, bd.w - 6, shopH - 5, '#26313a');
        ctx.fillStyle = night ? 'rgba(255,205,110,0.85)' : 'rgba(165,215,235,0.75)';
        const panes = Math.max(2, Math.floor(bd.w / 46));
        for (let pi = 0; pi < panes; pi += 1) {
          ctx.fillRect(bd.x + 9 + pi * ((bd.w - 18) / panes), sy + 12, (bd.w - 18) / panes - 7, shopH - 19);
        }
        for (let ax = 0; ax < bd.w - 4; ax += 11) { // awning stripes
          ctx.fillStyle = (ax / 11) % 2 === 0 ? bd.trim : '#fff6e8';
          ctx.fillRect(bd.x + 2 + ax, bd.y + bd.h - 1, Math.min(11, bd.w - 4 - ax), 9);
        }
        rect(bd.x + 2, bd.y + bd.h + 8, bd.w - 4, 2, 'rgba(0,0,0,0.2)');
        if (bd.signText) {
          const sw = Math.min(bd.w - 14, bd.signText.length * 7.6 + 14);
          rect(bd.x + (bd.w - sw) / 2, sy + 1.5, sw, 10.5, `hsl(${bd.signHue} 68% 40%)`);
          ctx.fillStyle = '#ffffff';
          ctx.font = `bold 8.5px ${FONT}`;
          ctx.textAlign = 'center';
          ctx.fillText(bd.signText, bd.x + bd.w / 2, sy + 9.6);
        }
      }
      // Rooftop details.
      ctx.fillStyle = 'rgba(90,80,70,0.55)';
      if (bd.roof === 'ac') ctx.fillRect(bd.x + bd.w * 0.6, bd.y + bd.h * 0.55, 26, 18);
      else if (bd.roof === 'tank') circle(bd.x + bd.w * 0.68, bd.y + bd.h * 0.4, 12, 'rgba(90,80,70,0.6)');
      else if (bd.roof === 'garden') rect(bd.x + bd.w * 0.15, bd.y + bd.h * 0.6, bd.w * 0.3, bd.h * 0.22, '#5da653');
      else if (bd.roof === 'sign') {
        // Rooftop billboard: posts, board, name or a bold colour block.
        const bw2 = Math.min(bd.w * 0.62, 150);
        const bx2 = bd.x + (bd.w - bw2) / 2;
        const by2 = bd.y + bd.h * 0.3;
        ctx.fillStyle = 'rgba(70,60,52,0.8)';
        ctx.fillRect(bx2 + 8, by2 + 20, 4, 10);
        ctx.fillRect(bx2 + bw2 - 12, by2 + 20, 4, 10);
        rect(bx2 - 2, by2 - 2, bw2 + 4, 24, '#fff6e8');
        rect(bx2, by2, bw2, 20, `hsl(${bd.signHue} 72% 46%)`);
        if (bd.signText) {
          ctx.fillStyle = '#ffffff';
          ctx.font = `bold ${Math.min(12, bw2 / Math.max(6, bd.signText.length) * 1.7)}px ${FONT}`;
          ctx.textAlign = 'center';
          ctx.fillText(bd.signText, bx2 + bw2 / 2, by2 + 14.5);
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.fillRect(bx2 + 10, by2 + 6, bw2 - 20, 3.4);
          ctx.fillRect(bx2 + 10, by2 + 12, bw2 - 34, 3.4);
        }
      }
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
      ctx.fillRect(m.length / 2 - 15, -m.width / 2 + 2, 13, m.width - 4);
      ctx.fillRect(-m.length / 2 + 2, -m.width / 2 + 2, 13, m.width - 4);
      // Light bar: red and blue alternate with world time.
      const phase = Math.floor(state.time * 6) % 2 === 0;
      circle(2, 0, 17, phase ? 'rgba(255,59,48,0.30)' : 'rgba(58,123,255,0.30)');
      ctx.fillStyle = phase ? '#ff3b30' : '#3a7bff';
      ctx.fillRect(-4, -8, 9, 16);
      ctx.fillStyle = phase ? '#3a7bff' : '#ff3b30';
      ctx.fillRect(6, -8, 9, 16);
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold 10px ${FONT}`; ctx.textAlign = 'center';
      ctx.fillText('PD', 2, 3.5);
    }
    // Cabin and glass.
    ctx.fillStyle = 'rgba(24,38,54,0.88)';
    ctx.beginPath();
    ctx.roundRect(-m.length * 0.18, -m.width * 0.36, m.length * 0.38, m.width * 0.72, 5);
    ctx.fill();
    ctx.fillStyle = 'rgba(150,210,240,0.5)';
    ctx.fillRect(m.length * 0.13, -m.width * 0.32, 5, m.width * 0.64);
    if (car.role === 'police') {
      // Re-draw the light bar on top of the cabin so it stays readable.
      const phase2 = Math.floor(state.time * 6) % 2 === 0;
      circle(2, 0, 17, phase2 ? 'rgba(255,59,48,0.30)' : 'rgba(58,123,255,0.30)');
      ctx.fillStyle = phase2 ? '#ff3b30' : '#3a7bff';
      ctx.fillRect(-4, -8, 9, 16);
      ctx.fillStyle = phase2 ? '#3a7bff' : '#ff3b30';
      ctx.fillRect(6, -8, 9, 16);
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold 10px ${FONT}`; ctx.textAlign = 'center';
      ctx.fillText('PD', 5, 3.5);
    }
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
    drawProps(state, l, t, r, b);

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
