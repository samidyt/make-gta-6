// hud.js — the on-screen display for Solmar City.
// One clear job: keep every HUD element (health, cash, stars, speed, weapon,
// objective, clock, toasts, big messages, Rico's phone) in sync with the game.
import { GAME } from './config.js';

const $ = (id) => document.getElementById(id);

// Wanted stars as inline SVG: the ★/☆ glyphs are missing from some system
// fonts (they render as tofu boxes), so the stars are drawn, not typed.
const STAR_POINTS = '12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26';
let lastStars = -1;
function renderStars(el, wanted) {
  if (wanted === lastStars) return;
  lastStars = wanted;
  if (wanted <= 0) { el.innerHTML = ''; return; }
  const color = wanted >= 3 ? '#ff5a4d' : '#ffd23f';
  let html = '';
  for (let i = 0; i < GAME.maxWanted; i += 1) {
    const filled = i < wanted;
    html += `<svg width="26" height="26" viewBox="0 0 24 24" style="margin-left:3px;vertical-align:middle;filter:drop-shadow(0 0 5px rgba(0,0,0,.8))"><polygon points="${STAR_POINTS}" fill="${filled ? color : 'rgba(255,255,255,0.10)'}" stroke="${filled ? '#6b4d00' : 'rgba(255,255,255,0.6)'}" stroke-width="1"/></svg>`;
  }
  el.innerHTML = html;
}
let toastTimer = null;
let bigTimer = null;
let phoneTimer = null;
let defaultHud = null; // set by initHud so bare showToast('text') calls work

export function initHud() {
  const h = {
    cash: $('cash'),
    stars: $('stars'),
    clock: $('clock'),
    healthFill: $('health-fill'),
    armorFill: $('armor-fill'),
    objective: $('objective'),
    missionName: $('mission-name'),
    objectiveText: $('objective-text'),
    speed: $('speed'),
    weapon: $('weapon'),
    hint: $('hint'),
    bigMsg: $('big-msg'),
    subMsg: $('sub-msg'),
    toast: $('toast'),
    phone: $('phone'),
    phoneFrom: $('phone-from'),
    phoneMsg: $('phone-msg'),
  };
  defaultHud = h;
  return h;
}

export function updateHud(h, world) {
  h.cash.textContent = `$${world.cash.toLocaleString('en-US')}`;
  renderStars(h.stars, world.wanted);
  const hour = Math.floor(world.hour);
  const min = Math.floor((world.hour - hour) * 60);
  h.clock.textContent = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}  SOLMAR`;
  h.healthFill.style.width = `${Math.max(0, world.health)}%`;
  h.healthFill.style.background = world.health < 30
    ? 'linear-gradient(90deg,#e53935,#ff7043)' : 'linear-gradient(90deg,#2ee06f,#8dff6a)';
  h.armorFill.style.width = `${Math.max(0, world.armor)}%`;
  if (world.inCar) {
    const kmh = Math.round(Math.abs(world.carSpeed) * 3.6);
    h.speed.innerHTML = `${kmh}<small> km/h</small>`;
    h.speed.style.display = 'block';
    h.hint.textContent = 'W/S accelerate & brake · A/D steer · Space handbrake · E exit car';
  } else {
    h.speed.style.display = 'none';
    h.hint.textContent = world.nearCar
      ? `E — steal the ${world.nearCar} · F punch · Click shoot · Shift sprint`
      : 'WASD move · E enter car · F punch · Click shoot · Shift sprint';
  }
  const w = world.weapon;
  if (w === 'pistol') {
    h.weapon.textContent = world.reloading > 0
      ? 'Pistol — RELOADING…'
      : `Pistol  ${world.ammo} / ${world.reserve}`;
  } else {
    h.weapon.textContent = 'Fists';
  }
  const obj = world.objective;
  if (obj) {
    h.objective.classList.remove('hidden');
    h.missionName.textContent = obj.name;
    h.objectiveText.textContent = obj.text;
  } else {
    h.objective.classList.add('hidden');
  }
}

export function showToast(h, text, ms = 2600) {
  if (typeof h === 'string') { ms = text; text = h; h = defaultHud; }
  if (!h) return;
  h.toast.textContent = text;
  h.toast.style.display = 'block';
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { h.toast.style.display = 'none'; }, ms);
}

export function showBig(h, title, sub, ms = 2600) {
  if (typeof h === 'string') { ms = sub; sub = title; title = h; h = defaultHud; }
  if (!h) return;
  h.bigMsg.textContent = title;
  h.subMsg.textContent = sub || '';
  h.bigMsg.style.display = 'block';
  h.subMsg.style.display = sub ? 'block' : 'none';
  if (bigTimer) clearTimeout(bigTimer);
  bigTimer = setTimeout(() => {
    h.bigMsg.style.display = 'none';
    h.subMsg.style.display = 'none';
  }, ms);
}

export function showPhone(h, from, msg, ms = 6000) {
  if (typeof h === 'string') { ms = msg; msg = from; from = h; h = defaultHud; }
  if (!h) return;
  h.phoneFrom.textContent = from;
  h.phoneMsg.textContent = msg;
  h.phone.style.display = 'block';
  if (phoneTimer) clearTimeout(phoneTimer);
  phoneTimer = setTimeout(() => { h.phone.style.display = 'none'; }, ms);
}

// Hide every transient popup at once (phone / toast / big message) and cancel
// their timers. Screenshot staging calls this so no popup can cover the frame
// — otherwise the phone's 6 s timer races the shot-ready signal and the
// dialog appears in some captures and not others.
export function hidePopups(h) {
  if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
  if (bigTimer) { clearTimeout(bigTimer); bigTimer = null; }
  if (phoneTimer) { clearTimeout(phoneTimer); phoneTimer = null; }
  const el = h || defaultHud;
  if (!el) return;
  el.toast.style.display = 'none';
  el.bigMsg.style.display = 'none';
  el.subMsg.style.display = 'none';
  el.phone.style.display = 'none';
}

export function hideOverlays() {
  for (const id of ['start-screen', 'pause-screen', 'mission-screen', 'wasted', 'busted']) {
    $(id).classList.add('hidden');
  }
}

export function showOverlay(id) { $(id).classList.remove('hidden'); }
