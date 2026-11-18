// The story chain: five jobs for fixer Mara Voss, with mechanic Eddie Lark
// and the rival crew The Gulls meddling along the way. Each mission is a list
// of objectives; reaching markers, stealing the right car, earning and then
// losing heat are all objective types the chain is built from. Dialogue and
// banners are how Coral Bay talks to the player.
import { dist } from './random.js';
import { addCrime } from './police.js';

export const MISSIONS = [
  {
    title: 'First Run',
    from: 'Mara Voss',
    intro: 'Mara: Simple first job, kid. Take my package car across town to Warehouse 9 in Portside. Follow the gold beams, do not scratch the paint.',
    reward: 350,
    objectives: [
      { type: 'reach', x: 1680, y: 1710, label: 'Drive to the Cannery checkpoint' },
      { type: 'reach', x: 3000, y: 1710, label: 'Drive through Palm Heights' },
      { type: 'reach', x: 3280, y: 3190, label: 'Deliver the package to Warehouse 9', needCar: true },
    ],
    outro: 'Mara: Clean run. The Gulls watched you the whole way — remember that.',
  },
  {
    title: 'Borrowed Wheels',
    from: 'Eddie Lark',
    intro: 'Eddie: A coral Kestrel S is parked up by the marina, and my customer wants it more than its owner does. Bring it to my garage. Gently-ish.',
    reward: 500,
    objectives: [
      { type: 'stealModel', model: 'Kestrel S', x: 3760, y: 700, label: 'Steal the Kestrel S near Coral Marina' },
      { type: 'reach', x: 1240, y: 1960, label: "Deliver the Kestrel S to Eddie's Garage", needCar: true },
    ],
    outro: 'Eddie: Oh, she purrs. The Gulls are furious — that was their show car.',
  },
  {
    title: 'Heat Check',
    from: 'Mara Voss',
    intro: 'Mara: The Gulls think you are soft. Prove otherwise: get the PD properly angry — three stars — then lose them and come home to the safehouse.',
    reward: 650,
    objectives: [
      { type: 'earnStars', stars: 3, label: 'Cause enough trouble to reach 3 wanted stars' },
      { type: 'loseHeat', x: 560, y: 640, label: 'Lose the heat, then reach the safehouse in Coral Flats' },
    ],
    outro: 'Mara: Three stars and you walked home. The Gulls just went quiet.',
  },
  {
    title: 'Three Drops',
    from: 'Mara Voss',
    intro: 'Mara: Three packages, three drops, one clock. The Gulls tipped off the PD, so expect company. Move, kid.',
    reward: 900,
    timer: 210,
    objectives: [
      { type: 'reach', x: 1020, y: 1050, label: 'Drop 1: Old Cannery corner', needCar: true },
      { type: 'reach', x: 3000, y: 690, label: 'Drop 2: Marina Mile', needCar: true },
      { type: 'reach', x: 2340, y: 3030, label: 'Drop 3: Portside Docks', needCar: true },
    ],
    outro: 'Mara: All three, on the clock. One last tide to catch, kid.',
  },
  {
    title: 'Low Tide',
    from: 'Mara Voss',
    intro: 'Mara: It ends tonight. The PD will throw everything at you — four stars of everything. Reach my boat at Coral Marina and we are gone before low tide.',
    reward: 1500,
    setStars: 4,
    objectives: [
      { type: 'reach', x: 4080, y: 620, label: 'Reach the boat at Coral Marina — do not stop', needCar: false },
    ],
    outro: 'Mara: Engines on, lights off. Coral Bay is yours now, kid. Free roam — the city keeps its secrets (12 hidden packages).',
  },
];

export function createMissionState() {
  return {
    index: 0,
    step: 0,
    active: false,
    done: false,
    timer: 0,
    startedAt: 0,
    between: 2.5, // breathing room before the first/next mission banner
    targetCarId: 0,
  };
}

export function currentObjective(state) {
  const m = state.mission;
  if (m.done || !m.active) return null;
  const def = MISSIONS[m.index];
  return def ? def.objectives[m.step] || null : null;
}

export function currentMissionDef(state) {
  return MISSIONS[state.mission.index] || null;
}

function startMission(state, index) {
  const m = state.mission;
  const def = MISSIONS[index];
  if (!def) { m.done = true; m.active = false; return; }
  m.index = index;
  m.step = 0;
  m.active = true;
  m.timer = def.timer || 0;
  m.startedAt = state.time;
  state.banner = { title: 'MISSION ' + (index + 1) + ': ' + def.title.toUpperCase(), sub: def.from + ' — reward $' + def.reward, t: 0, life: 3.4 };
  state.dialogue = { speaker: def.from, text: def.intro, t: 0, life: 8.5 };
  state.events.push('mission');
  if (def.setStars) {
    state.wanted.heat = Math.max(state.wanted.heat, def.setStars * 26 - 6);
    state.wanted.stars = def.setStars;
  }
  // Mission 2 marks its target car so the HUD can point at a real vehicle.
  if (index === 1) {
    let best = null; let bd = Infinity;
    for (const car of state.cars) {
      if (car.model.name === 'Kestrel S' && car.role !== 'police') {
        const d = dist(car.x, car.y, 3760, 700);
        if (d < bd) { bd = d; best = car; }
      }
    }
    if (best) { best.role = 'mission'; best.color = '#ff7a59'; m.targetCarId = best.id; best.x = 3760; best.y = 700; best.angle = 0; }
  }
}

function completeObjective(state) {
  const m = state.mission;
  const def = MISSIONS[m.index];
  m.step += 1;
  state.events.push('pickup');
  if (m.step >= def.objectives.length) {
    state.player.cash += def.reward;
    state.banner = { title: 'MISSION COMPLETE', sub: def.title + ' — $' + def.reward + ' earned', t: 0, life: 3.4 };
    state.dialogue = { speaker: def.from, text: def.outro, t: 0, life: 8 };
    state.events.push('jingle');
    m.active = false;
    m.index += 1;
    m.between = 5;
    if (m.index >= MISSIONS.length) { m.done = true; }
    state.events.push('save');
  } else {
    const next = def.objectives[m.step];
    state.banner = { title: 'OBJECTIVE UPDATED', sub: next.label, t: 0, life: 2.4 };
  }
}

export function updateMissions(state, dt) {
  const m = state.mission;
  if (state.over) return;
  if (!m.active) {
    if (!m.done) {
      m.between -= dt;
      if (m.between <= 0) startMission(state, m.index);
    }
    return;
  }
  const def = MISSIONS[m.index];
  if (def.timer) {
    m.timer -= dt;
    if (m.timer <= 0) {
      state.banner = { title: 'OUT OF TIME', sub: def.title + ' restarts — the drops still need doing.', t: 0, life: 3 };
      state.dialogue = { speaker: def.from, text: 'Mara: Clock beat you, kid. Again — and this time, faster.', t: 0, life: 6 };
      m.step = 0;
      m.timer = def.timer;
      state.events.push('fail');
      return;
    }
  }
  // Three Drops keeps the pressure on: heat trickles up while it runs.
  if (m.index === 3 && state.time - m.startedAt > 20 && state.wanted.stars < 2) {
    state.wanted.heat = Math.min(state.wanted.heat + dt * 1.1, 52);
    state.wanted.stars = Math.max(state.wanted.stars, Math.ceil(state.wanted.heat / 26));
  }
  const obj = currentObjective(state);
  if (!obj) return;
  const p = state.player;

  if (obj.type === 'reach') {
    if (dist(p.x, p.y, obj.x, obj.y) < 95 && (!obj.needCar || p.car)) completeObjective(state);
  } else if (obj.type === 'stealModel') {
    if (p.car && p.car.model.name === obj.model) completeObjective(state);
    else if (p.car && p.car.id === m.targetCarId) completeObjective(state);
  } else if (obj.type === 'earnStars') {
    if (state.wanted.stars >= obj.stars) completeObjective(state);
  } else if (obj.type === 'loseHeat') {
    if (state.wanted.stars === 0 && dist(p.x, p.y, obj.x, obj.y) < 110) completeObjective(state);
  }
}

/** Distance in metres (10 px = 1 m) to the current objective marker, or -1. */
export function objectiveDistance(state) {
  const obj = currentObjective(state);
  if (!obj) return -1;
  if (obj.type === 'earnStars') return -1;
  return Math.round(dist(state.player.x, state.player.y, obj.x, obj.y) / 10);
}
