/* =========================================================
   Spinning polygon ball physics — vanilla JS
   ========================================================= */
(() => {
  'use strict';

  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');

  /* ---------------- State ---------------- */
  const state = {
    sides: 8,
    spin: 0.6,          // rad / sec
    count: 40,
    sizeVar: 10,
    bounce: 0.8,
    ballCollisions: true,
    gravAngle: 0,       // degrees, 0 = down
    gravStr: 800,       // px / s^2
    timeScale: 1,
    trails: false
  };

  const BASE_RADIUS   = 6;      // base ball size
  const SUBSTEPS      = 5;      // physics substeps per frame
  const WALL_FRICTION = 0.22;   // tangential drag from the spinning wall
  const AIR_DAMPING   = 0.22;   // velocity damping coefficient (per second)
  const MAX_SPEED     = 4200;

  let W = 0, H = 0, cx = 0, cy = 0, R = 0; // R = circumradius of the polygon
  let theta = 0;                           // current polygon rotation
  let balls = [];
  let dpr = Math.min(window.devicePixelRatio || 1, 2);

  /* ---------------- Canvas sizing ---------------- */
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    cx = W / 2;
    cy = H / 2;
    R = Math.min(W, H) * 0.40;

    initBalls();
    paintBackground(true);
  }

  /* ---------------- Polygon geometry ----------------
     Vertices are generated CCW in screen space. For each edge we compute the
     INWARD unit normal (the one pointing toward the polygon centre) so that
     collisions use a signed plane distance, not a distance-from-centre test.
     That is what makes triangles / squares behave correctly.
  --------------------------------------------------- */
  const verts = [];  // {x, y}
  const norms = [];  // {x, y} inward unit normal for edge i (verts[i] -> verts[i+1])

  function buildPolygon(angle) {
    const n = state.sides;
    verts.length = 0;
    norms.length = 0;

    const step = (Math.PI * 2) / n;
    for (let i = 0; i < n; i++) {
      const a = angle + i * step;
      verts.push({ x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R });
    }
    for (let i = 0; i < n; i++) {
      const p = verts[i];
      const q = verts[(i + 1) % n];
      const ex = q.x - p.x, ey = q.y - p.y;
      const len = Math.hypot(ex, ey) || 1;
      // candidate normal
      let nx = -ey / len, ny = ex / len;
      // flip it if it doesn't point toward the centre
      if (nx * (cx - p.x) + ny * (cy - p.y) < 0) { nx = -nx; ny = -ny; }
      norms.push({ x: nx, y: ny });
    }
  }

  function apothem() {
    return R * Math.cos(Math.PI / state.sides);
  }

  /* ---------------- Balls ---------------- */
  function initBalls() {
    balls = [];
    const ap = apothem();
    for (let i = 0; i < state.count; i++) {
      const r = BASE_RADIUS + Math.random() * state.sizeVar;
      const maxD = Math.max(2, ap - r - 6);
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * maxD;      // uniform in area
      const hue = Math.floor(Math.random() * 360);
      balls.push({
        x: cx + Math.cos(a) * d,
        y: cy + Math.sin(a) * d,
        vx: (Math.random() - 0.5) * 160,
        vy: (Math.random() - 0.5) * 160,
        r,
        m: r * r,                                     // mass ∝ area
        color: `hsl(${hue}, 88%, 62%)`,
        glow: `hsla(${hue}, 95%, 65%, 0.55)`
      });
    }
  }

  /* ---------------- Wall constraint ----------------
     Signed distance to every edge plane; if the ball penetrates, push it back
     along the inward normal and (optionally) resolve the impulse against the
     wall's *local velocity*, which for a rotating body is  ω × r.
  --------------------------------------------------- */
  function constrainBall(b, resolveImpulse) {
    for (let i = 0; i < norms.length; i++) {
      const n = norms[i], p = verts[i];
      const dist = (b.x - p.x) * n.x + (b.y - p.y) * n.y; // + = inside
      if (dist >= b.r) continue;

      // positional correction
      const pen = b.r - dist;
      b.x += n.x * pen;
      b.y += n.y * pen;

      if (!resolveImpulse) continue;

      // velocity of the wall at the contact point: v = ω × r
      const rx = b.x - cx, ry = b.y - cy;
      const wx = -state.spin * ry;
      const wy = state.spin * rx;

      // relative velocity, in the wall's frame
      let rvx = b.vx - wx, rvy = b.vy - wy;
      const vn = rvx * n.x + rvy * n.y;
      if (vn >= 0) continue;                          // already separating

      const tvx = rvx - vn * n.x;                     // tangential part
      const tvy = rvy - vn * n.y;
      const f = 1 - WALL_FRICTION;                    // wall drags the ball along

      rvx = tvx * f - state.bounce * vn * n.x;
      rvy = tvy * f - state.bounce * vn * n.y;

      b.vx = wx + rvx;
      b.vy = wy + rvy;
    }
  }

  /* ---------------- Ball ↔ ball ---------------- */
  function resolveBallCollisions() {
    const n = balls.length;
    for (let i = 0; i < n; i++) {
      const a = balls[i];
      for (let j = i + 1; j < n; j++) {
        const b = balls[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        const rsum = a.r + b.r;
        let d2 = dx * dx + dy * dy;
        if (d2 >= rsum * rsum) continue;

        let d = Math.sqrt(d2);
        if (d < 1e-6) { d = 1e-6; dx = 1e-6; dy = 0; }  // perfectly stacked
        const nx = dx / d, ny = dy / d;

        // --- positional separation, weighted by mass ---
        const pen = rsum - d;
        const invA = 1 / a.m, invB = 1 / b.m;
        const invSum = invA + invB;
        a.x -= nx * pen * (invA / invSum);
        a.y -= ny * pen * (invA / invSum);
        b.x += nx * pen * (invB / invSum);
        b.y += ny * pen * (invB / invSum);

        // --- impulse ---
        const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
        const vn = rvx * nx + rvy * ny;
        if (vn > 0) continue;

        const e = Math.min(state.bounce, 0.96);
        const jm = -(1 + e) * vn / invSum;
        a.vx -= jm * nx * invA;
        a.vy -= jm * ny * invA;
        b.vx += jm * nx * invB;
        b.vy += jm * ny * invB;
      }
    }
  }

  /* ---------------- Simulation step ---------------- */
  function step(dt) {
    const h = dt / SUBSTEPS;

    const rad = state.gravAngle * Math.PI / 180;
    const gx = Math.sin(rad) * state.gravStr;   // 0° => straight down
    const gy = Math.cos(rad) * state.gravStr;

    for (let s = 0; s < SUBSTEPS; s++) {
      theta += state.spin * h;
      buildPolygon(theta);

      const damp = Math.exp(-AIR_DAMPING * h);

      for (let i = 0; i < balls.length; i++) {
        const b = balls[i];
        b.vx = (b.vx + gx * h) * damp;
        b.vy = (b.vy + gy * h) * damp;

        const sp = Math.hypot(b.vx, b.vy);
        if (sp > MAX_SPEED) { b.vx = b.vx / sp * MAX_SPEED; b.vy = b.vy / sp * MAX_SPEED; }

        b.x += b.vx * h;
        b.y += b.vy * h;

        constrainBall(b, true);
      }

      if (state.ballCollisions && balls.length > 1) {
        resolveBallCollisions();
        // ball-ball separation can shove balls through a wall -> re-constrain
        for (let i = 0; i < balls.length; i++) constrainBall(balls[i], true);
      }
    }
  }

  /* ---------------- Rendering ---------------- */
  function paintBackground(force) {
    if (state.trails && !force) {
      ctx.fillStyle = 'rgba(10, 10, 15, 0.16)';
    } else {
      ctx.fillStyle = '#0a0a0f';
    }
    ctx.fillRect(0, 0, W, H);
  }

  function drawPolygon() {
    // soft radial glow behind the frame
    const g = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 1.45);
    g.addColorStop(0, 'rgba(70, 140, 210, 0.10)');
    g.addColorStop(0.55, 'rgba(50, 110, 180, 0.045)');
    g.addColorStop(1, 'rgba(10, 10, 15, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.45, 0, Math.PI * 2);
    ctx.fill();

    // frame
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(verts[0].x, verts[0].y);
    for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y);
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.shadowBlur = 22;
    ctx.shadowColor = 'rgba(100, 200, 255, 0.85)';
    ctx.strokeStyle = 'rgba(140, 225, 255, 0.9)';
    ctx.stroke();

    // vertex dots
    ctx.shadowBlur = 14;
    ctx.fillStyle = 'rgba(200, 240, 255, 0.95)';
    for (let i = 0; i < verts.length; i++) {
      ctx.beginPath();
      ctx.arc(verts[i].x, verts[i].y, 3.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBalls() {
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];

      // glow
      const g = ctx.createRadialGradient(b.x, b.y, b.r * 0.25, b.x, b.y, b.r * 2.4);
      g.addColorStop(0, b.glow);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 2.4, 0, Math.PI * 2);
      ctx.fill();

      // body
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();

      // highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.beginPath();
      ctx.arc(b.x - b.r * 0.32, b.y - b.r * 0.34, Math.max(1, b.r * 0.22), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ---------------- Main loop ---------------- */
  let last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 1 / 20) dt = 1 / 20;           // clamp after tab switches
    dt *= state.timeScale;

    if (dt > 0) step(dt);
    else buildPolygon(theta);

    paintBackground(false);
    drawPolygon();
    drawBalls();

    requestAnimationFrame(frame);
  }

  /* =========================================================
     UI
     ========================================================= */
  const SHAPE_NAMES = {
    3: 'Triangle', 4: 'Square', 5: 'Pentagon', 6: 'Hexagon', 7: 'Heptagon',
    8: 'Octagon', 9: 'Nonagon', 10: 'Decagon', 11: 'Hendecagon', 12: 'Dodecagon',
    13: 'Tridecagon', 14: 'Tetradecagon', 15: 'Pentadecagon', 16: 'Hexadecagon',
    17: 'Heptadecagon', 18: 'Octadecagon', 19: 'Enneadecagon', 20: 'Icosagon'
  };
  const ARROWS = ['↓', '↘', '→', '↗', '↑', '↖', '←', '↙'];
  const arrowFor = deg => ARROWS[Math.round((deg % 360) / 45) % 8];

  const $ = id => document.getElementById(id);

  function bindRange(id, key, onChange, format) {
    const input = $(id);
    const label = $(id + 'Val');
    const apply = () => {
      state[key] = parseFloat(input.value);
      if (label) label.textContent = format ? format(state[key]) : input.value;
      if (onChange) onChange();
    };
    input.addEventListener('input', apply);
    apply();
  }

  function bindToggle(id, key, onChange) {
    const input = $(id);
    const apply = () => { state[key] = input.checked; if (onChange) onChange(); };
    input.addEventListener('change', apply);
    apply();
  }

  // Shape
  bindRange('sides', 'sides', () => {
    $('shapeName').textContent = SHAPE_NAMES[state.sides] || (state.sides + '-gon');
    initBalls();                                  // reinit: shape changed
  });
  bindRange('spin', 'spin', null, v => v.toFixed(2));

  // Balls
  bindRange('count', 'count', initBalls);
  bindRange('sizevar', 'sizeVar', initBalls);
  bindRange('bounce', 'bounce', null, v => v.toFixed(2));
  bindToggle('collisions', 'ballCollisions');

  // Physics
  bindRange('gravAngle', 'gravAngle', null, v => `${Math.round(v)}° ${arrowFor(v)}`);
  bindRange('gravStr', 'gravStr', null, v => (v === 0 ? '0-G' : String(Math.round(v))));
  bindRange('timeScale', 'timeScale', null, v => v.toFixed(2) + '×');

  // Effects
  bindToggle('trails', 'trails', () => { if (!state.trails) paintBackground(true); });

  $('explode').addEventListener('click', () => {
    for (const b of balls) {
      const a = Math.random() * Math.PI * 2;
      const p = 300 + Math.random() * 500;         // 300–800
      b.vx += Math.cos(a) * p;
      b.vy += Math.sin(a) * p;
    }
  });

  // Collapsible sections
  document.querySelectorAll('[data-section]').forEach(sec => {
    sec.querySelector('.sec-head').addEventListener('click', () => {
      sec.classList.toggle('collapsed');
    });
  });

  /* ---------------- Tooltip ----------------
     A real DOM node living outside #panel, because the panel uses
     overflow-y: auto which would clip a ::after pseudo-element tooltip.
  ------------------------------------------ */
  const tip = $('tooltip');
  const panel = $('panel');
  let tipTimer = null;

  function showTip(el) {
    const text = el.getAttribute('data-tip');
    if (!text) return;
    tip.textContent = text;
    tip.classList.add('show');

    // measure after content is set
    const r = el.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    const t = tip.getBoundingClientRect();

    let x = Math.max(r.right + 14, p.right + 12);
    if (x + t.width > window.innerWidth - 10) {
      x = Math.max(10, window.innerWidth - t.width - 10);
    }
    let y = r.top + r.height / 2 - t.height / 2;
    y = Math.max(10, Math.min(y, window.innerHeight - t.height - 10));

    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }

  function hideTip() { tip.classList.remove('show'); }

  document.querySelectorAll('[data-tip]').forEach(el => {
    el.addEventListener('mouseenter', () => {
      clearTimeout(tipTimer);
      tipTimer = setTimeout(() => showTip(el), 90);
    });
    el.addEventListener('mouseleave', () => { clearTimeout(tipTimer); hideTip(); });
  });
  panel.addEventListener('scroll', hideTip);

  /* ---------------- Boot ---------------- */
  window.addEventListener('resize', resize);
  resize();
  buildPolygon(theta);
  requestAnimationFrame(frame);
})();
