/* ============================================================
   Musa's Star Adventure — main game engine
   A platformer starring Musa, the Star Hero!
   ============================================================ */
(() => {
'use strict';

const T = 48;                    // tile size
const VIEW_W = 960, VIEW_H = 540;
const GRAVITY = 2300;
const MOVE_SPEED = 270;
const JUMP_V = 780;
const BOUNCE_V = 1200;
const COYOTE = 0.12, JUMP_BUFFER = 0.12;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// ---------- DOM ----------
const $ = id => document.getElementById(id);
const ui = {
  hud: $('hud'), hearts: $('hearts'), coinCount: $('coinCount'), starSlots: $('starSlots'),
  levelName: $('levelName'), btnMusic: $('btnMusic'), btnPause: $('btnPause'),
  title: $('titleScreen'), btnPlay: $('btnPlay'),
  select: $('levelSelect'), worldList: $('worldList'), btnBackTitle: $('btnBackTitle'),
  pause: $('pauseScreen'), btnResume: $('btnResume'), btnQuitLevel: $('btnQuitLevel'),
  ouch: $('ouchScreen'), ouchMsg: $('ouchMsg'),
  complete: $('completeScreen'), completeTitle: $('completeTitle'),
  completeStars: $('completeStars'), completeMsg: $('completeMsg'),
  btnNext: $('btnNext'), btnMap: $('btnMap'),
  win: $('winScreen'), winStats: $('winStats'), btnWinMap: $('btnWinMap'),
  touch: $('touchControls'), tLeft: $('tLeft'), tRight: $('tRight'), tJump: $('tJump'),
};

// ---------- Save data ----------
const SAVE_KEY = 'musaStarAdventure_v1';
let save = { best: {}, totalCoins: 0 };
try {
  const raw = localStorage.getItem(SAVE_KEY);
  if (raw) save = Object.assign(save, JSON.parse(raw));
} catch (e) { /* fresh start */ }
function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {}
}
function isUnlocked(i) { return i === 0 || save.best[i - 1] !== undefined; }

// ---------- Input ----------
const input = { left: false, right: false, jump: false, jumpPressed: false };
const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'jump', KeyW: 'jump', Space: 'jump',
};
addEventListener('keydown', e => {
  const k = KEYMAP[e.code];
  if (k) {
    e.preventDefault();
    if (k === 'jump' && !input.jump) input.jumpPressed = true;
    input[k] = true;
  }
  if (e.code === 'Escape' && state === 'play') pauseGame();
});
addEventListener('keyup', e => {
  const k = KEYMAP[e.code];
  if (k) input[k] = false;
});
// Touch controls
function bindTouch(el, key) {
  const on = e => { e.preventDefault(); if (key === 'jump' && !input.jump) input.jumpPressed = true; input[key] = true; };
  const off = e => { e.preventDefault(); input[key] = false; };
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off);
  el.addEventListener('pointerleave', off);
  el.addEventListener('pointercancel', off);
}
bindTouch(ui.tLeft, 'left');
bindTouch(ui.tRight, 'right');
bindTouch(ui.tJump, 'jump');
const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

// ---------- Game state ----------
let state = 'title';       // title | select | play | pause | complete | win
let levelIndex = 0;
let grid = [], rows = 0, cols = 0, levelW = 0, levelH = 0;
let player, coins, stars, slimes, platforms, pads, checkpoints, flag, spawn;
let cam = { x: 0, y: 0 };
let particles = [];
let runCoins = 0, runStars = 0;
let gameTime = 0;
let ouchTimer = 0;
let decoSeed = 1;

// Deterministic random for per-level decoration
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Level loading ----------
function tileAt(c, r) {
  if (c < 0 || c >= cols) return '#';        // walls at level edges
  if (r < 0) return '.';
  if (r >= rows) return '.';
  return grid[r][c];
}
function isSolid(ch) { return ch === '#' || ch === '='; }

function loadLevel(i) {
  levelIndex = i;
  const data = LEVELS[i];
  const map = data.map;
  rows = map.length;
  cols = Math.max(...map.map(r => r.length));
  grid = [];
  coins = []; stars = []; slimes = []; platforms = []; pads = []; checkpoints = [];
  flag = null; spawn = { x: T, y: T };

  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      const ch = map[r][c] || '.';
      switch (ch) {
        case 'P': spawn = { x: c * T + T / 2, y: r * T + T }; row.push('.'); break;
        case 'o': coins.push({ c, r, got: false }); row.push('.'); break;
        case '*': stars.push({ c, r, got: false }); row.push('.'); break;
        case 'E': slimes.push(makeSlime(c * T + T / 2, (r + 1) * T)); row.push('.'); break;
        case 'M': platforms.push({ bx: c * T, by: r * T, x: c * T, y: r * T, px: c * T, py: r * T, axis: 'x', amp: 120, speed: 1.6, phase: (c * 7 + r) % 6 }); row.push('.'); break;
        case 'N': platforms.push({ bx: c * T, by: r * T, x: c * T, y: r * T, px: c * T, py: r * T, axis: 'y', amp: 96, speed: 1.8, phase: (c * 7 + r) % 6 }); row.push('.'); break;
        case 'C': checkpoints.push({ c, r, active: false }); row.push('.'); break;
        case 'F': flag = { c, r }; row.push('.'); break;
        case 'B': pads.push({ c, r, anim: 0 }); row.push('B'); break;
        default: row.push(ch);
      }
    }
    grid.push(row);
  }
  levelW = cols * T;
  levelH = rows * T;
  decoSeed = i * 1000 + 7;

  player = makePlayer(spawn.x, spawn.y);
  player.respawn = { x: spawn.x, y: spawn.y };
  cam.x = clamp(player.x - VIEW_W / 2, 0, Math.max(0, levelW - VIEW_W));
  cam.y = clamp(player.y - VIEW_H / 2, 0, Math.max(0, levelH - VIEW_H));
  particles = [];
  runCoins = 0; runStars = 0;
  gameTime = 0; ouchTimer = 0;

  ui.levelName.textContent = `${WORLDS[data.world].emoji} ${data.name}`;
  updateHUD();
}

function makePlayer(x, y) {
  return {
    x, y,                  // x = center, y = feet
    w: 34, h: 56,
    vx: 0, vy: 0,
    onGround: false, facing: 1,
    coyote: 0, jumpBuf: 0,
    hearts: 3, invincible: 0,
    anim: 0, squash: 0,
    riding: null,
  };
}
function makeSlime(x, y) {
  return { x, y, w: 38, h: 26, dir: 1, speed: 70, alive: true, squishT: 0, anim: Math.random() * 6 };
}

// ---------- Physics helpers ----------
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function rectVsTiles(x, y, w, h, fn) {
  const c0 = Math.floor((x - w / 2) / T), c1 = Math.floor((x + w / 2 - 0.01) / T);
  const r0 = Math.floor((y - h) / T), r1 = Math.floor((y - 0.01) / T);
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++)
      if (fn(tileAt(c, r), c, r)) return { c, r };
  return null;
}

// ---------- Update ----------
function update(dt) {
  gameTime += dt;
  if (ouchTimer > 0) {
    ouchTimer -= dt;
    if (ouchTimer <= 0) ui.ouch.classList.add('hidden');
    updateParticles(dt);
    return;
  }

  const p = player;
  p.anim += dt;
  if (p.invincible > 0) p.invincible -= dt;
  if (p.squash > 0) p.squash -= dt * 4;

  // --- horizontal movement ---
  let move = 0;
  if (input.left) move -= 1;
  if (input.right) move += 1;
  if (move !== 0) p.facing = move;
  const target = move * MOVE_SPEED;
  const blend = p.onGround ? 14 : 8;
  p.vx += (target - p.vx) * Math.min(1, blend * dt);

  // --- jumping ---
  if (input.jumpPressed) { p.jumpBuf = JUMP_BUFFER; input.jumpPressed = false; }
  else if (p.jumpBuf > 0) p.jumpBuf -= dt;
  if (p.onGround) p.coyote = COYOTE;
  else if (p.coyote > 0) p.coyote -= dt;

  if (p.jumpBuf > 0 && p.coyote > 0) {
    p.vy = -JUMP_V;
    p.jumpBuf = 0; p.coyote = 0;
    p.onGround = false; p.riding = null;
    p.squash = 1;
    AudioSys.sfx.jump();
  }
  // variable jump height
  if (!input.jump && p.vy < -200) p.vy = -200;

  p.vy += GRAVITY * dt;
  p.vy = Math.min(p.vy, 1400);

  // --- moving platforms (update + carry) ---
  for (const pl of platforms) {
    pl.px = pl.x; pl.py = pl.y;
    const o = Math.sin(gameTime * pl.speed + pl.phase) * pl.amp;
    if (pl.axis === 'x') pl.x = pl.bx + o; else pl.y = pl.by + o;
  }
  if (p.riding) {
    p.x += p.riding.x - p.riding.px;
    p.y += p.riding.y - p.riding.py;
  }

  // --- move X ---
  const prevBottom = p.y;
  p.x += p.vx * dt;
  let hit = rectVsTiles(p.x, p.y - 0.1, p.w, p.h - 0.2, ch => isSolid(ch));
  if (hit) {
    if (p.vx > 0) p.x = hit.c * T - p.w / 2;
    else p.x = (hit.c + 1) * T + p.w / 2;
    p.vx = 0;
  }
  p.x = clamp(p.x, p.w / 2, levelW - p.w / 2);

  // --- move Y ---
  p.y += p.vy * dt;
  p.onGround = false;
  p.riding = null;
  if (p.vy >= 0) {
    // falling: solid tiles, one-way platforms, bounce pads
    hit = rectVsTiles(p.x, p.y, p.w, Math.min(p.h, p.vy * dt + 4), (ch, c, r) => {
      if (isSolid(ch)) return true;
      if ((ch === '-' || ch === 'B') && prevBottom <= r * T + 6) return true;
      return false;
    });
    if (hit) {
      const ch = tileAt(hit.c, hit.r);
      p.y = hit.r * T;
      if (ch === 'B') {
        p.vy = -BOUNCE_V;
        const pad = pads.find(b => b.c === hit.c && b.r === hit.r);
        if (pad) pad.anim = 1;
        AudioSys.sfx.bounce();
        burst(p.x, p.y, 8, '#ffd75e');
      } else {
        if (p.vy > 700) { burst(p.x, p.y, 6, '#c8b89a'); p.squash = 1; }
        p.vy = 0;
        p.onGround = true;
      }
    }
    // moving platforms (land on top)
    if (!p.onGround && p.vy >= 0) {
      for (const pl of platforms) {
        const top = pl.y;
        if (p.x + p.w / 2 > pl.x && p.x - p.w / 2 < pl.x + 96 &&
            p.y >= top && prevBottom <= pl.py + 8 && p.y <= top + 30) {
          p.y = top; p.vy = 0; p.onGround = true; p.riding = pl;
          break;
        }
      }
    }
  } else {
    // rising: bump head on solids only
    hit = rectVsTiles(p.x, p.y, p.w, p.h, ch => isSolid(ch));
    if (hit) {
      p.y = (hit.r + 1) * T + p.h;
      p.vy = 0;
    }
  }

  // --- spikes ---
  if (p.invincible <= 0) {
    const sp = rectVsTiles(p.x, p.y - 4, p.w - 10, p.h - 12, (ch, c, r) => {
      if (ch !== '^') return false;
      // spike hurt box: bottom 60% of tile
      return p.y > r * T + T * 0.35 && p.y - p.h < (r + 1) * T;
    });
    if (sp) hurt();
  }

  // --- fell off the world ---
  if (p.y - p.h > levelH + 80) { hurt(true); }

  // --- slimes ---
  for (const s of slimes) {
    if (!s.alive) { s.squishT -= dt; continue; }
    s.anim += dt;
    s.x += s.dir * s.speed * dt;
    // turn at walls
    const aheadC = Math.floor((s.x + s.dir * s.w / 2) / T);
    const footR = Math.floor((s.y - 2) / T);
    if (isSolid(tileAt(aheadC, footR))) s.dir *= -1;
    // turn at edges
    else if (!isSolid(tileAt(aheadC, footR + 1)) && tileAt(aheadC, footR + 1) !== '-') s.dir *= -1;

    // collision with player
    if (Math.abs(s.x - p.x) < (s.w + p.w) / 2 - 6 &&
        p.y > s.y - s.h && p.y - p.h < s.y) {
      if (p.vy > 100 && p.y < s.y - s.h * 0.3) {
        // stomp!
        s.alive = false; s.squishT = 0.6;
        p.vy = -460;
        AudioSys.sfx.stomp();
        burst(s.x, s.y - 10, 10, '#7ed957');
      } else if (p.invincible <= 0) {
        hurt();
      }
    }
  }

  // --- coins & stars ---
  for (const c of coins) {
    if (c.got) continue;
    if (Math.abs(c.c * T + T / 2 - p.x) < 34 && Math.abs(c.r * T + T / 2 - (p.y - p.h / 2)) < 40) {
      c.got = true; runCoins++; save.totalCoins++;
      AudioSys.sfx.coin();
      burst(c.c * T + T / 2, c.r * T + T / 2, 6, '#ffd700');
      updateHUD();
    }
  }
  for (const s of stars) {
    if (s.got) continue;
    if (Math.abs(s.c * T + T / 2 - p.x) < 38 && Math.abs(s.r * T + T / 2 - (p.y - p.h / 2)) < 44) {
      s.got = true; runStars++;
      AudioSys.sfx.star();
      burst(s.c * T + T / 2, s.r * T + T / 2, 14, '#ffdf3c');
      updateHUD();
    }
  }

  // --- checkpoints ---
  for (const c of checkpoints) {
    if (c.active) continue;
    if (Math.abs(c.c * T + T / 2 - p.x) < 40 && Math.abs(c.r * T + T / 2 - (p.y - p.h / 2)) < 60) {
      c.active = true;
      player.respawn = { x: c.c * T + T / 2, y: (c.r + 1) * T };
      AudioSys.sfx.check();
      burst(c.c * T + T / 2, c.r * T, 10, '#6ee06e');
    }
  }

  // --- flag (level complete) ---
  if (flag && Math.abs(flag.c * T + T / 2 - p.x) < 44 &&
      p.y > flag.r * T - T * 1.5 && p.y - p.h < (flag.r + 1) * T) {
    levelComplete();
  }

  // --- pad anim decay ---
  for (const b of pads) if (b.anim > 0) b.anim -= dt * 3;

  // --- camera ---
  const tx = clamp(p.x - VIEW_W / 2, 0, Math.max(0, levelW - VIEW_W));
  const ty = clamp(p.y - VIEW_H * 0.62, 0, Math.max(0, levelH - VIEW_H));
  cam.x += (tx - cam.x) * Math.min(1, 8 * dt);
  cam.y += (ty - cam.y) * Math.min(1, 6 * dt);

  updateParticles(dt);
}

function hurt(fell = false) {
  const p = player;
  if (!fell && p.invincible > 0) return;
  p.hearts--;
  AudioSys.sfx.hurt();
  updateHUD();
  if (p.hearts <= 0 || fell) {
    // gentle reset to checkpoint
    const msgs = ['Almost! Try again, Musa! 💪', 'You can do it, Musa! 🌟', 'So close! Go Musa go! 🚀'];
    ui.ouchMsg.textContent = msgs[Math.floor(Math.random() * msgs.length)];
    ui.ouch.classList.remove('hidden');
    ouchTimer = 1.3;
    p.x = p.respawn.x; p.y = p.respawn.y;
    p.vx = 0; p.vy = 0;
    p.hearts = 3;
    p.invincible = 2;
    cam.x = clamp(p.x - VIEW_W / 2, 0, Math.max(0, levelW - VIEW_W));
    updateHUD();
  } else {
    p.invincible = 1.5;
    p.vy = -350;
    p.vx = -p.facing * 200;
  }
}

function levelComplete() {
  state = 'complete';
  AudioSys.sfx.flag();
  // confetti!
  for (let i = 0; i < 60; i++) {
    particles.push({
      x: flag.c * T + T / 2 + (Math.random() - 0.5) * 200,
      y: flag.r * T - Math.random() * 250,
      vx: (Math.random() - 0.5) * 200, vy: -Math.random() * 150,
      life: 2 + Math.random(), grav: 300, size: 5 + Math.random() * 5,
      color: ['#ff5e5e', '#ffd75e', '#6ee06e', '#5eb4ff', '#d75eff'][i % 5],
    });
  }
  const prev = save.best[levelIndex] || 0;
  save.best[levelIndex] = Math.max(prev, runStars);
  persist();

  ui.completeStars.textContent = '⭐'.repeat(runStars) + '☆'.repeat(3 - runStars);
  const msgs = [
    'Amazing, Musa! 🎉', 'Super job, Musa! 🌟', 'You\'re a star, Musa! ✨',
    'Wow! Incredible! 🚀', 'Fantastic, hero! 🦸',
  ];
  ui.completeTitle.textContent = msgs[Math.floor(Math.random() * msgs.length)];
  ui.completeMsg.textContent = runStars === 3
    ? 'You found ALL the stars! 🏆'
    : `You found ${runStars} of 3 stars — play again to find them all!`;
  ui.btnNext.textContent = levelIndex + 1 < LEVELS.length ? 'Next Level ➡' : '🏆 Finish!';
  setTimeout(() => ui.complete.classList.remove('hidden'), 700);
}

function updateParticles(dt) {
  for (const pt of particles) {
    pt.life -= dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vy += (pt.grav || 0) * dt;
  }
  particles = particles.filter(pt => pt.life > 0);
}
function burst(x, y, n, color) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 140;
    particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: 0.5 + Math.random() * 0.4, grav: 400, size: 3 + Math.random() * 4, color });
  }
}

// ---------- Drawing ----------
function draw() {
  const world = WORLDS[LEVELS[levelIndex].world];
  drawSky(world);
  ctx.save();
  ctx.translate(-Math.round(cam.x), -Math.round(cam.y));
  drawDecor(world);
  drawTiles(world);
  drawItems();
  drawCheckpoints();
  drawFlag();
  drawPlatforms(world);
  drawSlimes();
  drawMusa();
  drawParticles();
  ctx.restore();
}

function drawSky(world) {
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, world.sky[0]);
  g.addColorStop(0.6, world.sky[1]);
  g.addColorStop(1, world.sky[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

function drawDecor(world) {
  const rnd = mulberry32(decoSeed);
  const par = 0.4; // parallax
  ctx.save();
  ctx.translate(cam.x * par, cam.y * par * 0.5);
  if (world.deco === 'meadow') {
    // sun
    ctx.fillStyle = '#ffe96b';
    ctx.beginPath(); ctx.arc(120, 80, 42, 0, 7); ctx.fill();
    for (let i = 0; i < 10; i++) drawCloud(rnd() * levelW * (1 - par) + i * 90, 40 + rnd() * 120, 0.7 + rnd() * 0.6, 'rgba(255,255,255,.9)');
    // hills
    ctx.fillStyle = 'rgba(110, 190, 110, .5)';
    for (let i = 0; i < 8; i++) {
      const hx = i * 260 + rnd() * 80, hr = 90 + rnd() * 70;
      ctx.beginPath(); ctx.arc(hx, levelH * (1 - par * 0.5) - 20, hr, Math.PI, 0); ctx.fill();
    }
  } else if (world.deco === 'cave') {
    // crystals + stalactites
    for (let i = 0; i < 14; i++) {
      const cx = rnd() * (levelW * (1 - par) + VIEW_W);
      ctx.fillStyle = ['#7a5fd0', '#5fd0c8', '#d05fb8'][i % 3] + '88';
      const s = 14 + rnd() * 22, cy = 30 + rnd() * 300;
      ctx.beginPath();
      ctx.moveTo(cx, cy); ctx.lineTo(cx + s * 0.5, cy + s * 1.6); ctx.lineTo(cx - s * 0.5, cy + s * 1.6);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    for (let i = 0; i < 30; i++) { ctx.fillRect(rnd() * (levelW + VIEW_W), rnd() * 500, 3, 3); }
  } else if (world.deco === 'sky') {
    for (let i = 0; i < 14; i++) drawCloud(rnd() * (levelW * (1 - par) + VIEW_W), 30 + rnd() * 400, 0.8 + rnd() * 0.9, 'rgba(255,255,255,.85)');
    // rainbow arc
    const colors = ['#ff5e5e', '#ffb35e', '#ffe95e', '#6ee06e', '#5eb4ff', '#b45eff'];
    colors.forEach((c, i) => {
      ctx.strokeStyle = c + '66';
      ctx.lineWidth = 10;
      ctx.beginPath(); ctx.arc(500, 560, 380 - i * 11, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    });
  } else { // castle
    // moon + stars
    ctx.fillStyle = '#fff7d6';
    ctx.beginPath(); ctx.arc(820, 70, 34, 0, 7); ctx.fill();
    ctx.fillStyle = WORLDS[3].sky[0];
    ctx.beginPath(); ctx.arc(834, 60, 30, 0, 7); ctx.fill();
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(255,255,220,${0.4 + rnd() * 0.6})`;
      const sx = rnd() * (levelW + VIEW_W), sy = rnd() * 380, ss = 1.5 + rnd() * 2.5;
      ctx.fillRect(sx, sy, ss, ss);
    }
    // distant towers
    ctx.fillStyle = 'rgba(30, 18, 60, .55)';
    for (let i = 0; i < 6; i++) {
      const tx = i * 320 + rnd() * 100, tw = 60 + rnd() * 50, th = 160 + rnd() * 140;
      ctx.fillRect(tx, levelH - th * 1.4, tw, th * 1.4);
      ctx.beginPath();
      ctx.moveTo(tx - 6, levelH - th * 1.4);
      ctx.lineTo(tx + tw / 2, levelH - th * 1.4 - 50);
      ctx.lineTo(tx + tw + 6, levelH - th * 1.4);
      ctx.fill();
    }
  }
  ctx.restore();
}
function drawCloud(x, y, s, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 22 * s, 0, 7);
  ctx.arc(x + 24 * s, y - 8 * s, 18 * s, 0, 7);
  ctx.arc(x + 46 * s, y, 20 * s, 0, 7);
  ctx.fill();
}

const PALETTES = {
  meadow: { top: '#5fc24e', body: '#9a6b3f', body2: '#8a5d35', brick: '#d98e4a', brickLine: '#b3713a', plank: '#e0b070' },
  cave:   { top: '#5fd0c8', body: '#3a3a5e', body2: '#32324f', brick: '#5a4a8a', brickLine: '#463a6e', plank: '#7a6aa0' },
  sky:    { top: '#7ed957', body: '#c4936a', body2: '#b3835c', brick: '#e8e8f5', brickLine: '#c5c5dd', plank: '#ffffff' },
  castle: { top: '#9a8ab8', body: '#56487a', body2: '#4a3d6a', brick: '#8a7aa8', brickLine: '#6e5f90', plank: '#a890c8' },
};

function drawTiles(world) {
  const pal = PALETTES[world.deco];
  const c0 = Math.floor(cam.x / T), c1 = Math.ceil((cam.x + VIEW_W) / T);
  const r0 = Math.floor(cam.y / T), r1 = Math.ceil((cam.y + VIEW_H) / T);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const ch = tileAt(c, r);
      const x = c * T, y = r * T;
      if (ch === '#') {
        ctx.fillStyle = pal.body;
        ctx.fillRect(x, y, T, T);
        ctx.fillStyle = pal.body2;
        if ((c + r) % 2) ctx.fillRect(x + 6, y + 14, 12, 8);
        else ctx.fillRect(x + 26, y + 24, 14, 9);
        if (!isSolid(tileAt(c, r - 1))) {
          ctx.fillStyle = pal.top;
          ctx.fillRect(x, y, T, 12);
          ctx.fillStyle = pal.top;
          ctx.beginPath();
          ctx.arc(x + 8, y + 12, 5, 0, 7); ctx.arc(x + 24, y + 13, 6, 0, 7); ctx.arc(x + 40, y + 12, 5, 0, 7);
          ctx.fill();
        }
      } else if (ch === '=') {
        ctx.fillStyle = pal.brick;
        ctx.fillRect(x, y, T, T);
        ctx.strokeStyle = pal.brickLine;
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 1.5, y + 1.5, T - 3, T - 3);
        ctx.beginPath();
        ctx.moveTo(x, y + T / 2); ctx.lineTo(x + T, y + T / 2);
        ctx.moveTo(x + T / 2, y); ctx.lineTo(x + T / 2, y + T / 2);
        ctx.stroke();
      } else if (ch === '-') {
        if (world.deco === 'sky' || world.deco === 'cloud') {
          ctx.fillStyle = 'rgba(255,255,255,.95)';
          ctx.beginPath();
          ctx.arc(x + 10, y + 10, 10, 0, 7); ctx.arc(x + 26, y + 7, 12, 0, 7); ctx.arc(x + 40, y + 10, 9, 0, 7);
          ctx.fill();
        } else {
          ctx.fillStyle = pal.plank;
          ctx.fillRect(x, y, T, 12);
          ctx.fillStyle = 'rgba(0,0,0,.15)';
          ctx.fillRect(x, y + 8, T, 4);
        }
      } else if (ch === '^') {
        ctx.fillStyle = '#c5ccd6';
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          const sx = x + i * 16;
          ctx.moveTo(sx, y + T);
          ctx.lineTo(sx + 8, y + T * 0.35);
          ctx.lineTo(sx + 16, y + T);
        }
        ctx.fill();
        ctx.fillStyle = '#9aa3af';
        ctx.fillRect(x, y + T - 6, T, 6);
      } else if (ch === 'B') {
        const pad = pads.find(b => b.c === c && b.r === r);
        const squish = pad && pad.anim > 0 ? pad.anim : 0;
        const topY = y + 14 + squish * 14;
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 4;
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          const ly = topY + 8 + i * ((y + T - 8 - topY - 8) / 2.2);
          ctx.moveTo(x + 12, ly); ctx.lineTo(x + 36, ly);
        }
        ctx.stroke();
        ctx.fillStyle = '#ff5e5e';
        ctx.fillRect(x + 4, topY, T - 8, 10);
        ctx.fillStyle = '#d63b3b';
        ctx.fillRect(x + 4, topY + 10, T - 8, 4);
      }
    }
  }
}

function drawItems() {
  // coins
  for (const c of coins) {
    if (c.got) continue;
    const x = c.c * T + T / 2, y = c.r * T + T / 2 + Math.sin(gameTime * 3 + c.c) * 4;
    const sq = Math.abs(Math.sin(gameTime * 2.5 + c.c * 0.7));
    ctx.fillStyle = '#e8a800';
    ctx.beginPath(); ctx.ellipse(x, y, 11 * Math.max(0.25, sq), 12, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffd700';
    ctx.beginPath(); ctx.ellipse(x, y, 8 * Math.max(0.2, sq), 9, 0, 0, 7); ctx.fill();
  }
  // stars
  for (const s of stars) {
    if (s.got) continue;
    const x = s.c * T + T / 2, y = s.r * T + T / 2 + Math.sin(gameTime * 2 + s.c) * 6;
    drawStar(x, y, 16, gameTime + s.c, '#ffdf3c', '#e0a818');
    // sparkle
    const sa = (gameTime * 3 + s.c) % 2;
    if (sa < 0.3) {
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.fillRect(x + 12, y - 14, 4, 4);
    }
  }
}
function drawStar(x, y, size, rot, fill, stroke) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin(rot) * 0.25);
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? size : size * 0.45;
    const a = -Math.PI / 2 + i * Math.PI / 5;
    ctx[i === 0 ? 'moveTo' : 'lineTo'](Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawCheckpoints() {
  for (const c of checkpoints) {
    const x = c.c * T + T / 2, base = (c.r + 1) * T;
    ctx.fillStyle = '#8a6a4a';
    ctx.fillRect(x - 3, base - 64, 6, 64);
    ctx.fillStyle = c.active ? '#6ee06e' : '#b9c2cc';
    ctx.beginPath();
    ctx.moveTo(x + 3, base - 62);
    ctx.lineTo(x + 30, base - 52);
    ctx.lineTo(x + 3, base - 42);
    ctx.fill();
  }
}

function drawFlag() {
  if (!flag) return;
  const x = flag.c * T + T / 2, base = (flag.r + 1) * T;
  ctx.fillStyle = '#d4af37';
  ctx.fillRect(x - 4, base - 110, 8, 110);
  ctx.beginPath(); ctx.arc(x, base - 112, 8, 0, 7); ctx.fill();
  const wave = Math.sin(gameTime * 4) * 4;
  ctx.fillStyle = '#ff5e5e';
  ctx.beginPath();
  ctx.moveTo(x + 4, base - 106);
  ctx.lineTo(x + 46 + wave, base - 96);
  ctx.lineTo(x + 4, base - 76);
  ctx.fill();
  drawStar(x + 22, base - 94, 8, 0, '#ffdf3c', '#e0a818');
}

function drawPlatforms(world) {
  for (const pl of platforms) {
    ctx.fillStyle = world.deco === 'sky' ? '#fff' : '#c8a26a';
    if (world.deco === 'sky') {
      ctx.beginPath();
      ctx.arc(pl.x + 16, pl.y + 8, 12, 0, 7);
      ctx.arc(pl.x + 48, pl.y + 5, 14, 0, 7);
      ctx.arc(pl.x + 80, pl.y + 8, 12, 0, 7);
      ctx.fill();
    } else {
      ctx.fillRect(pl.x, pl.y, 96, 14);
      ctx.fillStyle = 'rgba(0,0,0,.2)';
      ctx.fillRect(pl.x, pl.y + 10, 96, 4);
      ctx.fillStyle = '#9af';
      ctx.fillRect(pl.x + 8, pl.y + 3, 6, 6);
      ctx.fillRect(pl.x + 82, pl.y + 3, 6, 6);
    }
  }
}

function drawSlimes() {
  for (const s of slimes) {
    if (!s.alive) {
      if (s.squishT > 0) {
        ctx.fillStyle = '#7ed957';
        ctx.beginPath(); ctx.ellipse(s.x, s.y - 4, 24, 6, 0, 0, 7); ctx.fill();
      }
      continue;
    }
    const wob = Math.sin(s.anim * 6) * 3;
    ctx.fillStyle = '#7ed957';
    ctx.beginPath();
    ctx.ellipse(s.x, s.y - s.h / 2, s.w / 2 + wob * 0.5, s.h / 2 - wob * 0.4, 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#5cb83a';
    ctx.beginPath();
    ctx.ellipse(s.x, s.y - 5, s.w / 2 - 4, 6, 0, 0, 7);
    ctx.fill();
    // eyes
    const ex = s.dir * 7;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(s.x - 7 + ex, s.y - s.h + 9, 6, 0, 7); ctx.arc(s.x + 7 + ex, s.y - s.h + 9, 6, 0, 7); ctx.fill();
    ctx.fillStyle = '#223';
    ctx.beginPath(); ctx.arc(s.x - 7 + ex + s.dir * 2, s.y - s.h + 9, 3, 0, 7); ctx.arc(s.x + 7 + ex + s.dir * 2, s.y - s.h + 9, 3, 0, 7); ctx.fill();
  }
}

// ---------- Musa! ----------
function drawMusa() {
  const p = player;
  if (p.invincible > 0 && Math.floor(p.invincible * 12) % 2 === 0 && ouchTimer <= 0) return;

  const running = Math.abs(p.vx) > 30 && p.onGround;
  const phase = p.anim * 11;
  const bob = p.onGround && !running ? Math.sin(p.anim * 3) * 1.5 : 0;
  let sqx = 1, sqy = 1;
  if (p.squash > 0) { sqy = 1 - p.squash * 0.15; sqx = 1 + p.squash * 0.15; }
  if (!p.onGround) { sqy = 1.06; sqx = 0.96; }

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(p.facing * sqx, sqy);
  ctx.translate(0, bob);

  const skin = '#f0bd8c', skinDark = '#dba673';
  const hair = '#241c14';
  const shirt = '#8d9299', shirtDark = '#767b82';
  const pants = '#3b4a63';

  // legs
  const legSwing = running ? Math.sin(phase) * 7 : 0;
  const tuck = !p.onGround ? 6 : 0;
  ctx.fillStyle = pants;
  ctx.fillRect(-11 + legSwing * 0.5, -18 - tuck, 9, 18 + tuck * 0.5);
  ctx.fillRect(2 - legSwing * 0.5, -18 - tuck, 9, 18 + tuck * 0.5);
  // shoes
  ctx.fillStyle = '#2a2f3a';
  ctx.fillRect(-13 + legSwing, -5 - tuck, 13, 6);
  ctx.fillRect(1 - legSwing, -5 - tuck, 13, 6);

  // body (gray t-shirt)
  ctx.fillStyle = shirt;
  ctx.beginPath();
  ctx.roundRect(-13, -40 - tuck * 0.5, 26, 24, 7);
  ctx.fill();
  ctx.fillStyle = shirtDark;
  ctx.fillRect(-13, -22 - tuck * 0.5, 26, 4);
  // "MUSA" on the shirt (un-mirror so it reads correctly facing left)
  ctx.save();
  ctx.scale(p.facing, 1);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 9px "Chalkboard SE", "Comic Sans MS", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('MUSA', 0, -29 - tuck * 0.5);
  ctx.restore();

  // arms
  const armSwing = running ? Math.sin(phase + Math.PI) * 6 : (!p.onGround ? -8 : 0);
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.roundRect(-17, -38 - armSwing * 0.4, 6, 16, 3);
  ctx.roundRect(11, -38 + armSwing * 0.4, 6, 16, 3);
  ctx.fill();

  // head
  const hy = -52 - tuck * 0.5;
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(0, hy, 14.5, 0, 7);
  ctx.fill();
  // ear
  ctx.fillStyle = skinDark;
  ctx.beginPath(); ctx.arc(-12, hy + 2, 3.5, 0, 7); ctx.fill();

  // hair — dark wavy quiff with faded sides
  ctx.fillStyle = hair;
  ctx.beginPath();
  ctx.arc(0, hy - 2, 14.5, Math.PI * 0.95, Math.PI * 2.02);
  ctx.fill();
  // wavy quiff on top
  ctx.beginPath();
  ctx.arc(-5, hy - 13, 6.5, 0, 7);
  ctx.arc(2, hy - 15, 7, 0, 7);
  ctx.arc(9, hy - 12, 6, 0, 7);
  ctx.arc(12, hy - 8, 4.5, 0, 7);
  ctx.fill();

  // face
  const blink = Math.sin(p.anim * 1.3) > 0.985;
  ctx.fillStyle = '#3a2a1a';
  if (blink) {
    ctx.fillRect(1, hy - 2, 5, 2);
    ctx.fillRect(9, hy - 2, 5, 2);
  } else {
    ctx.beginPath(); ctx.arc(4, hy - 1, 2.4, 0, 7); ctx.arc(11, hy - 1, 2.4, 0, 7); ctx.fill();
  }
  // eyebrows
  ctx.strokeStyle = hair;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(1, hy - 6); ctx.lineTo(7, hy - 7);
  ctx.moveTo(8.5, hy - 7); ctx.lineTo(13.5, hy - 6);
  ctx.stroke();
  // smile
  ctx.strokeStyle = '#9a5a3a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(7, hy + 5, 4.5, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();

  ctx.restore();
}

function drawParticles() {
  for (const pt of particles) {
    ctx.globalAlpha = Math.min(1, pt.life * 2);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;
}

// ---------- HUD ----------
function updateHUD() {
  ui.hearts.textContent = '❤️'.repeat(player.hearts) + '🤍'.repeat(Math.max(0, 3 - player.hearts));
  ui.coinCount.textContent = runCoins;
  ui.starSlots.textContent = '⭐'.repeat(runStars) + '☆'.repeat(3 - runStars);
}

// ---------- Screens / flow ----------
function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }
function hideAllScreens() {
  [ui.title, ui.select, ui.pause, ui.complete, ui.win, ui.ouch].forEach(hide);
}

function buildLevelSelect() {
  ui.worldList.innerHTML = '';
  WORLDS.forEach((w, wi) => {
    const row = document.createElement('div');
    row.className = 'world-row';
    const name = document.createElement('div');
    name.className = 'world-name';
    name.textContent = `${w.emoji} World ${wi + 1}: ${w.name}`;
    row.appendChild(name);
    const btns = document.createElement('div');
    btns.className = 'level-btns';
    LEVELS.forEach((lv, li) => {
      if (lv.world !== wi) return;
      const b = document.createElement('button');
      b.className = 'level-btn';
      const unlocked = isUnlocked(li);
      const best = save.best[li];
      if (!unlocked) {
        b.classList.add('locked');
        b.innerHTML = `🔒`;
      } else {
        b.innerHTML = `${li + 1}<span class="stars">${best !== undefined ? '⭐'.repeat(best) + '☆'.repeat(3 - best) : 'NEW!'}</span>`;
        b.addEventListener('click', () => { AudioSys.sfx.click(); startLevel(li); });
      }
      btns.appendChild(b);
    });
    row.appendChild(btns);
    ui.worldList.appendChild(row);
  });
}

function startLevel(i) {
  hideAllScreens();
  loadLevel(i);
  state = 'play';
  show(ui.hud);
  if (isTouch) show(ui.touch);
  AudioSys.ensure();
  AudioSys.startMusic();
}

function goLevelSelect() {
  hideAllScreens();
  hide(ui.hud); hide(ui.touch);
  buildLevelSelect();
  show(ui.select);
  state = 'select';
}

function pauseGame() {
  if (state !== 'play') return;
  state = 'pause';
  show(ui.pause);
}

function showWin() {
  hideAllScreens();
  hide(ui.hud); hide(ui.touch);
  const totalStars = Object.values(save.best).reduce((a, b) => a + b, 0);
  ui.winStats.textContent = `⭐ ${totalStars} / ${LEVELS.length * 3} stars  •  🪙 ${save.totalCoins} coins collected!`;
  show(ui.win);
  state = 'win';
  AudioSys.sfx.win();
}

// Buttons
ui.btnPlay.addEventListener('click', () => {
  AudioSys.ensure(); AudioSys.sfx.click();
  goLevelSelect();
});
ui.btnBackTitle.addEventListener('click', () => {
  AudioSys.sfx.click();
  hideAllScreens(); show(ui.title); state = 'title';
});
ui.btnPause.addEventListener('click', () => { AudioSys.sfx.click(); pauseGame(); });
ui.btnResume.addEventListener('click', () => {
  AudioSys.sfx.click();
  hide(ui.pause); state = 'play';
});
ui.btnQuitLevel.addEventListener('click', () => { AudioSys.sfx.click(); goLevelSelect(); });
ui.btnMusic.addEventListener('click', () => {
  const on = AudioSys.toggleMusic();
  ui.btnMusic.classList.toggle('off', !on);
});
ui.btnNext.addEventListener('click', () => {
  AudioSys.sfx.click();
  if (levelIndex + 1 < LEVELS.length) startLevel(levelIndex + 1);
  else showWin();
});
ui.btnMap.addEventListener('click', () => { AudioSys.sfx.click(); goLevelSelect(); });
ui.btnWinMap.addEventListener('click', () => { AudioSys.sfx.click(); goLevelSelect(); });

// Pause when window loses focus
addEventListener('blur', () => { if (state === 'play') pauseGame(); });

// ---------- Resize ----------
function resize() {
  const scale = Math.min(innerWidth / VIEW_W, innerHeight / VIEW_H) * 0.98;
  canvas.style.width = VIEW_W * scale + 'px';
  canvas.style.height = VIEW_H * scale + 'px';
}
addEventListener('resize', resize);
resize();

// ---------- Main loop ----------
let lastT = performance.now();
function frame(now) {
  const dt = Math.min(1 / 30, (now - lastT) / 1000);
  lastT = now;
  if (state === 'play') {
    update(dt);
    draw();
  } else if (state === 'complete') {
    gameTime += dt;
    updateParticles(dt);
    draw();
  }
  requestAnimationFrame(frame);
}

// Debug hook (used for automated testing; harmless in play)
window.MUSA_DEBUG = {
  teleport(x, y) { player.x = x; player.y = y; player.vx = 0; player.vy = 0; },
  info() { return { state, levelIndex, x: player.x, y: player.y, runStars, runCoins, flag, best: save.best }; },
  start(i) { startLevel(i); },
};

// Boot: draw a pretty backdrop behind the title
loadLevel(0);
draw();
requestAnimationFrame(frame);
})();
