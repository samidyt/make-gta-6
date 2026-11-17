// minimap.js — the circular top-down minimap for Solmar City.
// One clear job: draw the streets, the player arrow, the mission marker,
// police blips and the north indicator on the HUD canvas every frame.
import { CITY } from './config.js';

export function createMinimap(canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const C = W / 2;

  function draw(world) {
    const half = CITY.half;
    const scale = W / (half * 2.4); // show the whole city, slightly zoomed out
    const px = (x) => C + x * scale;
    const pz = (z) => C + z * scale;
    ctx.clearRect(0, 0, W, H);
    // Ground.
    ctx.fillStyle = '#122e1e';
    ctx.fillRect(0, 0, W, H);
    // Beach + water (south edge).
    ctx.fillStyle = '#d8c88f';
    ctx.fillRect(0, pz(CITY.beachZ), W, pz(CITY.beachZ + 46) - pz(CITY.beachZ));
    ctx.fillStyle = '#2e9fd8';
    ctx.fillRect(0, pz(CITY.beachZ + 46), W, H - pz(CITY.beachZ + 46));
    // Roads.
    ctx.strokeStyle = '#4a4a52';
    ctx.lineWidth = Math.max(2, CITY.road * scale);
    for (const s of CITY.streets) {
      ctx.beginPath(); ctx.moveTo(px(-half), pz(s)); ctx.lineTo(px(half), pz(s)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px(s), pz(-half)); ctx.lineTo(px(s), pz(half)); ctx.stroke();
    }
    // Blocks.
    ctx.fillStyle = '#3a4a3a';
    const pitch = CITY.pitch;
    for (let i = 0; i < CITY.blocks; i += 1) {
      for (let j = 0; j < CITY.blocks; j += 1) {
        const x = CITY.streets[i] + pitch / 2;
        const z = CITY.streets[j] + pitch / 2;
        ctx.fillRect(px(x - CITY.block / 2), pz(z - CITY.block / 2), CITY.block * scale, CITY.block * scale);
      }
    }
    // Mission marker (pulsing yellow diamond with a white halo so it reads
    // against dark streets even at a glance).
    const target = world.missionTarget;
    if (target) {
      const pulse = 1 + Math.sin(performance.now() / 220) * 0.25;
      ctx.save();
      ctx.translate(px(target.x), pz(target.z));
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      const h = 9 * pulse;
      ctx.fillRect(-h / 2, -h / 2, h, h);
      ctx.fillStyle = '#ffd23f';
      const s = 6.5 * pulse;
      ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.restore();
    }
    // Police blips (flashing red/blue).
    const flashRed = Math.floor(performance.now() / 300) % 2 === 0;
    ctx.fillStyle = flashRed ? '#ff4444' : '#4488ff';
    for (const c of world.policeCars) {
      ctx.beginPath(); ctx.arc(px(c.pos.x), pz(c.pos.z), 3, 0, Math.PI * 2); ctx.fill();
    }
    for (const c of world.policeCops) {
      ctx.beginPath(); ctx.arc(px(c.pos.x), pz(c.pos.z), 2, 0, Math.PI * 2); ctx.fill();
    }
    // Traffic (small grey dots) — only near the player, to keep the map readable.
    ctx.fillStyle = 'rgba(200,200,200,0.7)';
    for (const c of world.trafficCars) {
      if (Math.hypot(c.pos.x - world.player.x, c.pos.z - world.player.z) > 90) continue;
      ctx.fillRect(px(c.pos.x) - 1.5, pz(c.pos.z) - 1.5, 3, 3);
    }
    // Player arrow (white, points along the heading).
    ctx.save();
    ctx.translate(px(world.player.x), pz(world.player.z));
    ctx.rotate(Math.PI - Math.atan2(world.playerHeadingX, world.playerHeadingZ));
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  return { draw };
}
