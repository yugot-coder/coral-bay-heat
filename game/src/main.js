// Coral Bay Heat — boot, screens and the one game loop.
// The world advances in fixed 1/60 s steps; the renderer and HUD paint what
// is there. Screens: title, play, paused, busted, wasted.
// ?seed=N fixes the world. ?shot=chase|mission|downtown|title (with &seed=N)
// stages a deterministic scene, paints it, and flags the document ready.
import { SCREEN_BUSTED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED, STEP } from './config.js';
import { createWorld, applySave, stepWorld, respawnBusted, respawnWasted } from './world.js';
import { ACT_CONFIRM, ACT_PAUSE, createInput } from './input.js';
import { createRenderer } from './render.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { loadSave, writeSave, clearSave } from './save.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);
const hud = createHud(canvas);
const audio = createAudio();

function announce(message) {
  if (status) status.textContent = message;
}

function runShot(name) {
  const scene = stageShot(name, seed);
  scene.state.view.w = renderer.view.w;
  scene.state.view.h = renderer.view.h;
  let painted = 0;
  function paint() {
    renderer.draw(scene.state);
    hud.draw(scene.state, scene.screen, renderer.view.w, renderer.view.h, false);
    painted += 1;
    if (painted < 3) requestAnimationFrame(paint);
    else {
      document.documentElement.dataset.shotReady = '1';
      window.__shotReady = true;
    }
  }
  requestAnimationFrame(paint);
}

/** An idle input for ambient title-screen stepping: nobody drives, nobody shoots. */
const IDLE_INPUT = {
  mouseX: 0, mouseY: 0, mouseDown: false,
  axisX() { return 0; }, axisY() { return 0; },
  sprint() { return false; }, handbrake() { return false; },
  takeActions() { return 0; },
};

function runGame() {
  const input = createInput(canvas);
  let state = createWorld(seed);
  let screen = SCREEN_TITLE;
  let hasSave = !!loadSave();
  let accumulator = 0;
  let last = performance.now();
  let pending = 0;
  let audioUnlocked = false;
  let saveClock = 0;

  // The world reads one-shot actions through this wrapper: the loop takes
  // them first (for pause / confirm), then hands the rest to the world.
  const worldInput = {
    get mouseX() { return input.mouseX; },
    get mouseY() { return input.mouseY; },
    get mouseDown() { return input.mouseDown; },
    axisX() { return input.axisX(); },
    axisY() { return input.axisY(); },
    sprint() { return input.sprint(); },
    handbrake() { return input.handbrake(); },
    takeActions() { const a = pending; pending = 0; return a; },
  };

  function handleEvents() {
    for (const ev of state.events) {
      if (ev === 'shot') audio.shot();
      else if (ev === 'thud') audio.thud();
      else if (ev === 'crash') audio.crash();
      else if (ev === 'pickup') audio.pickup();
      else if (ev === 'jingle' || ev === 'mission') audio.jingle();
      else if (ev === 'fail' || ev === 'busted' || ev === 'wasted') audio.fail();
      else if (ev === 'door') audio.door();
      else if (ev === 'horn') audio.horn();
      else if (ev === 'save') writeSave(state);
    }
    state.events.length = 0;
  }

  function newGame() {
    clearSave();
    hasSave = false;
    state = createWorld(Math.floor(Math.random() * 4294967296));
    screen = SCREEN_PLAY;
    announce('New game. First job incoming from Mara Voss.');
  }

  function continueGame() {
    const save = loadSave();
    if (!save) { newGame(); return; }
    state = createWorld(Math.floor(Math.random() * 4294967296));
    applySave(state, save);
    screen = SCREEN_PLAY;
    announce('Welcome back to Coral Bay.');
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    accumulator += dt;
    state.view.w = renderer.view.w;
    state.view.h = renderer.view.h;

    if (input.gesture && !audioUnlocked) { audioUnlocked = true; audio.unlock(); }
    pending |= input.takeActions();
    const clicked = input.clicked;

    if (screen === SCREEN_TITLE) {
      if ((pending & ACT_CONFIRM) || clicked) { pending = 0; newGame(); }
      else if (input.keys.has('KeyC') && hasSave) continueGame();
    } else if (screen === SCREEN_PLAY) {
      if (pending & ACT_PAUSE) { pending &= ~ACT_PAUSE; screen = SCREEN_PAUSED; announce('Paused.'); }
    } else if (screen === SCREEN_PAUSED) {
      if (pending & (ACT_PAUSE | ACT_CONFIRM)) { pending = 0; screen = SCREEN_PLAY; announce('Playing.'); }
    } else if (screen === SCREEN_BUSTED || screen === SCREEN_WASTED) {
      if (pending & ACT_CONFIRM) {
        pending = 0;
        if (screen === SCREEN_BUSTED) respawnBusted(state); else respawnWasted(state);
        handleEvents();
        screen = SCREEN_PLAY;
        announce('Back on the street.');
      }
    }

    if (screen === SCREEN_PLAY) {
      let guard = 0;
      while (accumulator >= STEP && guard < 8) {
        stepWorld(state, STEP, worldInput);
        handleEvents();
        accumulator -= STEP;
        guard += 1;
        if (state.over) {
          screen = state.over === 'busted' ? SCREEN_BUSTED : SCREEN_WASTED;
          announce(state.over === 'busted' ? 'Busted.' : 'Wasted.');
          break;
        }
      }
      saveClock += dt;
      if (saveClock > 10) { saveClock = 0; writeSave(state); }
    } else if (screen === SCREEN_TITLE) {
      // The living city behind the logo: traffic and people carry on.
      let guard = 0;
      while (accumulator >= STEP && guard < 4) {
        stepWorld(state, STEP, IDLE_INPUT);
        state.events.length = 0;
        accumulator -= STEP;
        guard += 1;
      }
    } else {
      accumulator = 0;
      pending = 0;
    }

    const p = state.player;
    const sirenNear = state.cars.some((c) => c.role === 'police' && Math.hypot(c.x - p.x, c.y - p.y) < 760);
    audio.update(dt, !!p.car, p.car ? Math.abs(p.car.speed) / p.car.model.topSpeed : 0, sirenNear, state.time);

    renderer.draw(state);
    hud.draw(state, screen, renderer.view.w, renderer.view.h, hasSave);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      writeSave(state);
      announce('Paused.');
    }
  });

  announce('Coral Bay Heat. Press Enter for a new game.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
