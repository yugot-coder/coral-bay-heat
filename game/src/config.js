// Coral Bay Heat — every tuning number, colour and name in one place.
// The world is a fixed 4800x3600 coastal city; the renderer scales the canvas
// to the window, so no rule below depends on the screen size.

export const WORLD = { width: 4800, height: 3600 };
export const STEP = 1 / 60;
export const SAVE_KEY = 'coral-bay-heat.save.v1';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';

export const PHASE_GOLDEN = 'golden';
export const PHASE_NIGHT = 'night';

export const PLAYER = {
  radius: 14,
  walkSpeed: 178,
  sprintSpeed: 292,
  maxHealth: 100,
  startCash: 120,
  startX: 1000,
  startY: 860,
};

export const CAR_MODELS = [
  { name: 'Brisa', kind: 'hatchback', length: 62, width: 30, topSpeed: 430, accel: 250, grip: 7.5, price: 0 },
  { name: 'Vantara', kind: 'sedan', length: 72, width: 32, topSpeed: 480, accel: 265, grip: 7.0, price: 0 },
  { name: 'Kestrel S', kind: 'sports', length: 74, width: 33, topSpeed: 640, accel: 360, grip: 8.5, price: 0 },
  { name: 'Mako', kind: 'pickup', length: 80, width: 36, topSpeed: 450, accel: 240, grip: 6.2, price: 0 },
  { name: 'Hauler', kind: 'van', length: 86, width: 38, topSpeed: 400, accel: 210, grip: 5.6, price: 0 },
  { name: 'Interceptor', kind: 'police', length: 76, width: 34, topSpeed: 610, accel: 340, grip: 8.0, price: 0 },
];

export const CAR_COLORS = ['#e4572e', '#f2a03d', '#f6d743', '#41b883', '#2e86ab', '#7d5ba6', '#e8e3d9', '#c0c6ce', '#8d99ae', '#ef476f', '#118ab2', '#06d6a0'];

export const PALETTE = {
  water: '#12808a',
  waterDeep: '#0b5e6e',
  sand: '#ecd29a',
  grass: '#69a85f',
  park: '#5da653',
  asphalt: '#3c4148',
  asphaltDark: '#33373e',
  sidewalk: '#cbbfa5',
  lane: '#f4e9c8',
  crosswalk: '#e8e4da',
  lot: '#4a4e55',
  plaza: '#d9c9a3',
  text: '#fff8ea',
  dark: '#17222b',
  accent: '#ffb347',
  coral: '#ff6b4a',
  teal: '#19c2b8',
  danger: '#ff4757',
  gold: '#ffd94d',
};

export const BUILDING_COLORS = ['#e8b08a', '#d98e6a', '#f0d0a0', '#c97b5a', '#a8c8bc', '#88a8b8', '#e5e0d0', '#d4a0a0', '#b8c4a0', '#f2c094', '#9fb6c9', '#cbb8d8'];

export const DISTRICTS = [
  { name: 'Marina Mile', x: 3300, y: 200, w: 1500, h: 900 },
  { name: 'Old Cannery', x: 120, y: 1900, w: 1300, h: 900 },
  { name: 'Palm Heights', x: 1300, y: 120, w: 1900, h: 1300 },
  { name: 'Portside Docks', x: 2300, y: 2500, w: 1900, h: 1000 },
  { name: 'Coral Flats', x: 120, y: 200, w: 1100, h: 1600 },
  { name: 'The Strand', x: 4050, y: 900, w: 500, h: 2400 },
];

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
