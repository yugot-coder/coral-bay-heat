// Deterministic screenshot scenes behind ?shot=chase|mission|downtown|title.
// Each scene builds a fresh seeded world, stages a real situation (a chase,
// a mission drive, a busy street, the title at night), then plays the real
// simulation forward a fixed number of fixed steps with scripted inputs.
// No wall clock, no unseeded randomness: the same seed gives the same frame.
import { CAR_MODELS, PHASE_GOLDEN, PHASE_NIGHT, SCREEN_PLAY, SCREEN_TITLE, STEP } from './config.js';
import { createWorld, stepWorld } from './world.js';
import { createCar } from './vehicles.js';
import { angleDelta } from './random.js';

/** A scripted stand-in for the real input object, driven by the scene. */
function scriptInput() {
  const keys = new Set();
  return {
    keys,
    mouseX: 840, mouseY: 360, mouseDown: false,
    axisX() { return (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0); },
    axisY() { return (keys.has('KeyS') ? 1 : 0) - (keys.has('KeyW') ? 1 : 0); },
    sprint() { return keys.has('ShiftLeft'); },
    handbrake() { return false; },
    takeActions() { return 0; },
    set(...codes) { keys.clear(); for (const c of codes) keys.add(c); },
  };
}

function runSteps(state, input, steps, drive) {
  for (let i = 0; i < steps; i += 1) {
    if (drive) drive(state, input, i);
    stepWorld(state, STEP, input);
  }
}

/** Drive east along the current road, steering gently back to the lane. */
function driveEast(state, input) {
  const car = state.player.car;
  if (!car) { input.set('KeyW'); return; }
  const delta = angleDelta(car.angle, 0);
  const codes = ['KeyW'];
  if (delta > 0.06) codes.push('KeyD');
  else if (delta < -0.06) codes.push('KeyA');
  // Hold the lane line.
  if (car.y > 1722) codes.push('KeyA');
  if (car.y < 1698) codes.push('KeyD');
  input.set(...codes);
}

function putPlayerInCar(state, modelIndex, x, y, angle) {
  const car = createCar(state.rng, modelIndex, x, y, angle, 'parked');
  car.occupied = true;
  state.cars.push(car);
  state.player.car = car;
  state.player.x = x;
  state.player.y = y;
  state.camera.x = x;
  state.camera.y = y;
  return car;
}

function addCop(state, x, y, angle) {
  const cop = createCar(state.rng, 5, x, y, angle, 'police');
  cop.occupied = true;
  cop.vx = Math.cos(angle) * 300;
  cop.vy = Math.sin(angle) * 300;
  state.cars.push(cop);
  return cop;
}

function startFirstMission(state, input) {
  state.mission.between = 0.01;
  runSteps(state, input, 3, null);
}

function sceneChase(seed) {
  const state = createWorld(seed);
  state.phase = PHASE_GOLDEN;
  const input = scriptInput();
  const car = putPlayerInCar(state, 2, 980, 1710, 0); // Kestrel S, eastbound
  car.color = '#e4572e';
  addCop(state, 760, 1668, 0);
  addCop(state, 690, 1752, 0);
  addCop(state, 830, 1790, 0.2);
  state.wanted.heat = 80;
  state.wanted.stars = 3;
  state.wanted.lastSeenX = state.player.x;
  state.wanted.lastSeenY = state.player.y;
  startFirstMission(state, input);
  runSteps(state, input, 132, driveEast);
  // Final framing: the law stays close behind for the cover shot.
  const p = state.player;
  const cops = state.cars.filter((c) => c.role === 'police');
  const spots = [[-205, -42], [-315, 30], [-400, -14]];
  cops.forEach((cop, i) => {
    const [dx, dy] = spots[i % spots.length];
    cop.x = p.x + dx; cop.y = p.y + dy;
    cop.angle = p.car ? p.car.angle : 0;
    cop.vx = Math.cos(cop.angle) * 320; cop.vy = Math.sin(cop.angle) * 320;
  });
  state.wanted.heat = 80;
  state.wanted.stars = 3;
  state.heli.active = false;
  state.camera.x = p.x + 60;
  state.camera.y = p.y;
  state.banner = state.banner || { title: 'MISSION 1: FIRST RUN', sub: 'Mara Voss — reward $350', t: 0, life: 99 };
  return { state, screen: SCREEN_PLAY };
}

function sceneMission(seed) {
  const state = createWorld(seed);
  state.phase = PHASE_GOLDEN;
  const input = scriptInput();
  putPlayerInCar(state, 1, 1170, 1710, 0); // Vantara sedan, eastbound
  startFirstMission(state, input);
  runSteps(state, input, 64, driveEast);
  state.camera.x = state.player.x + 40;
  state.camera.y = state.player.y;
  return { state, screen: SCREEN_PLAY };
}

function sceneDowntown(seed) {
  const state = createWorld(seed);
  state.phase = PHASE_GOLDEN;
  const input = scriptInput();
  const p = state.player;
  p.x = 2050; p.y = 1598; // the sidewalk along the avenue, Palm Heights
  p.aimAngle = -0.5;
  state.camera.x = p.x; state.camera.y = p.y;
  runSteps(state, input, 170, null);
  // Final framing: a busy pavement around the player, traffic on the avenue.
  p.x = 2050; p.y = 1598; p.aimAngle = -0.5;
  state.peds.slice(0, 14).forEach((ped, i) => {
    ped.dead = false;
    if (i < 8) { // along the horizontal sidewalk
      ped.x = p.x - 330 + i * 92;
      ped.y = 1596 + (i % 2) * 16;
    } else { // along the vertical sidewalk by the avenue crossing
      ped.x = 2260 + (i % 2) * 18;
      ped.y = p.y - 330 + (i - 8) * 96;
    }
    ped.tx = ped.x + 200; ped.ty = ped.y;
    ped.angle = 0;
  });
  const trafficSpots = [[1620, 1652], [1930, 1712], [2380, 1652], [2680, 1712]];
  trafficSpots.forEach(([x, y], i) => {
    const car = createCar(state.rng, (i + 1) % 5, x, y, y < 1680 ? 0 : Math.PI, 'traffic');
    car.occupied = true;
    car.vx = Math.cos(car.angle) * 150;
    car.vy = 0;
    state.cars.push(car);
  });
  state.camera.x = p.x; state.camera.y = p.y;
  return { state, screen: SCREEN_PLAY };
}

function sceneTitle(seed) {
  const state = createWorld(seed);
  state.phase = PHASE_NIGHT;
  const input = scriptInput();
  const p = state.player;
  p.x = 4120; p.y = 1240;
  state.camera.x = 3980; state.camera.y = 1080;
  runSteps(state, input, 360, null);
  state.phase = PHASE_NIGHT;
  state.camera.x = 3980; state.camera.y = 1080;
  return { state, screen: SCREEN_TITLE };
}

export function stageShot(name, seed) {
  if (name === 'mission') return sceneMission(seed);
  if (name === 'downtown') return sceneDowntown(seed);
  if (name === 'title') return sceneTitle(seed);
  return sceneChase(seed);
}

export { CAR_MODELS };
