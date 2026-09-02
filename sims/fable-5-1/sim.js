/* ============================================================================
   Spinning Polygon Physics — sim.js
   Vanilla JS. A regular polygon spins while balls bounce inside it.
   ========================================================================== */
(() => {
  'use strict';

  // --------------------------------------------------------------------------
  // Constants
  // --------------------------------------------------------------------------
  const TAU = Math.PI * 2;
  const DEG = Math.PI / 180;
  const SUBSTEPS = 5;               // physics substeps per rendered frame
  const BASE_RADIUS = 6;            // minimum ball radius (px)
  const DAMPING = 0.12;             // linear velocity damping per second
  const WALL_FRICTION = 0.15;       // fraction of tangential relative velocity absorbed per wall contact
  const BALL_RESTITUTION = 0.85;    // ball-to-ball restitution
  const MAX_SPEED = 3000;           // px/s safety clamp
  const MAX_FRAME_DT = 0.05;        // clamp for tab-switch stalls
  const TRAIL_FADE = 0.18;          // alpha of the fade rect when trails are on
  const ACCENT = '100, 200, 255';

  const SHAPE_NAMES = {
    3: 'Triangle', 4: 'Square', 5: 'Pentagon', 6: 'Hexagon', 7: 'Heptagon',
    8: 'Octagon', 9: 'Nonagon', 10: 'Decagon', 11: 'Hendecagon', 12: 'Dodecagon',
    13: 'Tridecagon', 14: 'Tetradecagon', 15: 'Pentadecagon', 16: 'Hexadecagon',
    17: 'Heptadecagon', 18: 'Octadecagon', 19: 'Enneadecagon', 20: 'Icosagon'
  };
  const ARROWS = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];

  // --------------------------------------------------------------------------
  // State
  // --------------------------------------------------------------------------
  const state = {
    sides: 8,
    spin: 0.8,             // rad/s, negative = reverse
    count: 40,
    sizeVar: 12,           // max random radius added to BASE_RADIUS
    bounciness: 0.8,       // wall restitution
    collisions: true,
    gravAngle: 90,         // degrees, 90 = straight down (screen space)
    gravStrength: 600,     // px/s²
    timeScale: 1,
    trails: false
  };

  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');

  let W = 0, H = 0;           // logical canvas size
  let cx = 0, cy = 0;         // polygon centre
  let R = 100;                // polygon circumradius
  let angle = 0;              // current polygon rotation
  let balls = [];
  let verts = [];             // polygon vertices (rebuilt every substep)
  let edges = [];             // { ax, ay, nx, ny } — edge start point + inward unit normal
  let bgGlow = null;          // cached radial gradient behind the polygon

  // --------------------------------------------------------------------------
  // Geometry helpers
  // --------------------------------------------------------------------------
  const apothem = () => R * Math.cos(Math.PI / state.sides);

  /** Rebuild vertices and inward edge normals for the current angle. */
  function computeEdges() {
    const n = state.sides;
    verts = new Array(n);
    edges = new Array(n);

    for (let i = 0; i < n; i++) {
      const t = angle + (i / n) * TAU;
      verts[i] = { x: cx + Math.cos(t) * R, y: cy + Math.sin(t) * R };
    }

    for (let i = 0; i < n; i++) {
      const a = verts[i];
      const b = verts[(i + 1) % n];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      let nx = -dy / len, ny = dx / len;
      // Make sure the normal points toward the polygon centre (inward).
      if ((cx - a.x) * nx + (cy - a.y) * ny < 0) { nx = -nx; ny = -ny; }
      edges[i] = { ax: a.x, ay: a.y, nx, ny };
    }
  }

  // --------------------------------------------------------------------------
  // Balls
  // --------------------------------------------------------------------------
  function makeBall(i) {
    const r = BASE_RADIUS + Math.random() * state.sizeVar;
    // Spawn inside the inscribed circle (apothem), so it fits in any shape.
    const maxDist = Math.max(0, apothem() - r - 2);
    const dist = Math.sqrt(Math.random()) * maxDist;   // uniform over the disk
    const t = Math.random() * TAU;
    const hue = Math.round((i * 137.508 + Math.random() * 24) % 360);
    const mass = r * r;

    return {
      x: cx + Math.cos(t) * dist,
      y: cy + Math.sin(t) * dist,
      vx: (Math.random() - 0.5) * 240,
      vy: (Math.random() - 0.5) * 240,
      r,
      mass,
      invMass: 1 / mass,
      color: `hsl(${hue}, 85%, 62%)`,
      glow: `hsla(${hue}, 85%, 62%, 0.45)`,
      glowEnd: `hsla(${hue}, 85%, 62%, 0)`
    };
  }

  function initBalls() {
    balls = [];
    for (let i = 0; i < state.count; i++) balls.push(makeBall(i));
  }

  function explode() {
    for (const b of balls) {
      const t = Math.random() * TAU;
      const m = 300 + Math.random() * 500;
      b.vx += Math.cos(t) * m;
      b.vy += Math.sin(t) * m;
    }
  }

  // --------------------------------------------------------------------------
  // Collision: ball vs. polygon walls
  // --------------------------------------------------------------------------
  /**
   * Edge-based constraint. For a convex polygon the set of valid centre positions
   * for a ball of radius r is the intersection of the edge half-planes offset
   * inward by r, so signed-distance-per-edge is exact (no circular approximation).
   * The wall's velocity at the contact point (from the spin) is used so moving
   * walls fling and drag the ball.
   */
  function collideWalls(b) {
    const omega = state.spin;
    const e = state.bounciness;

    // Two sweeps so corner pushes (edge A -> into edge B) settle.
    for (let pass = 0; pass < 2; pass++) {
      let touched = false;

      for (let i = 0; i < edges.length; i++) {
        const ed = edges[i];
        const dist = (b.x - ed.ax) * ed.nx + (b.y - ed.ay) * ed.ny;   // signed distance to edge line
        if (dist >= b.r) continue;

        touched = true;
        const pen = b.r - dist;

        // Contact point on the edge line and the wall's velocity there (ω × r).
        const cpx = b.x - ed.nx * dist;
        const cpy = b.y - ed.ny * dist;
        const wvx = -omega * (cpy - cy);
        const wvy =  omega * (cpx - cx);

        // Work in the wall's frame of reference.
        const rvx = b.vx - wvx, rvy = b.vy - wvy;
        const vn = rvx * ed.nx + rvy * ed.ny;

        if (vn < 0) {   // moving into the wall (relative to the wall)
          const tx = -ed.ny, ty = ed.nx;
          const vt = (rvx * tx + rvy * ty) * (1 - WALL_FRICTION);   // tangential drag
          const vnNew = -vn * e;                                    // restitution
          b.vx = ed.nx * vnNew + tx * vt + wvx;
          b.vy = ed.ny * vnNew + ty * vt + wvy;
        }

        // Push the ball back inside along the inward normal.
        b.x += ed.nx * pen;
        b.y += ed.ny * pen;
      }

      if (!touched) break;
    }
  }

  // --------------------------------------------------------------------------
  // Collision: ball vs. ball (mass-based separation + impulse)
  // --------------------------------------------------------------------------
  function collideBalls() {
    const n = balls.length;
    for (let i = 0; i < n; i++) {
      const a = balls[i];
      for (let j = i + 1; j < n; j++) {
        const b = balls[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        const minD = a.r + b.r;
        let d2 = dx * dx + dy * dy;
        if (d2 >= minD * minD) continue;

        if (d2 < 1e-8) {   // perfectly overlapping: nudge apart in a random direction
          dx = (Math.random() - 0.5) * 0.02;
          dy = (Math.random() - 0.5) * 0.02;
          d2 = dx * dx + dy * dy;
        }

        const d = Math.sqrt(d2);
        const nx = dx / d, ny = dy / d;
        const overlap = minD - d;
        const invSum = a.invMass + b.invMass;

        // Positional separation weighted by inverse mass (heavier moves less).
        const sa = overlap * (a.invMass / invSum);
        const sb = overlap * (b.invMass / invSum);
        a.x -= nx * sa; a.y -= ny * sa;
        b.x += nx * sb; b.y += ny * sb;

        // Impulse along the contact normal.
        const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
        const vn = rvx * nx + rvy * ny;
        if (vn < 0) {
          const jImp = -(1 + BALL_RESTITUTION) * vn / invSum;
          const ix = jImp * nx, iy = jImp * ny;
          a.vx -= ix * a.invMass; a.vy -= iy * a.invMass;
          b.vx += ix * b.invMass; b.vy += iy * b.invMass;
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // Physics step
  // --------------------------------------------------------------------------
  function step(frameDt) {
    const dt = (frameDt * state.timeScale) / SUBSTEPS;
    if (dt <= 0) { computeEdges(); return; }   // paused: keep geometry fresh for drawing

    const gx = Math.cos(state.gravAngle * DEG) * state.gravStrength;
    const gy = Math.sin(state.gravAngle * DEG) * state.gravStrength;
    const damp = Math.max(0, 1 - DAMPING * dt);
    const maxSq = MAX_SPEED * MAX_SPEED;

    for (let s = 0; s < SUBSTEPS; s++) {
      // Rotate the frame, then rebuild edges for this substep.
      angle = (angle + state.spin * dt) % TAU;
      computeEdges();

      // Integrate + wall collisions.
      for (let i = 0; i < balls.length; i++) {
        const b = balls[i];
        b.vx = (b.vx + gx * dt) * damp;
        b.vy = (b.vy + gy * dt) * damp;

        const sp2 = b.vx * b.vx + b.vy * b.vy;
        if (sp2 > maxSq) {
          const k = MAX_SPEED / Math.sqrt(sp2);
          b.vx *= k; b.vy *= k;
        }

        b.x += b.vx * dt;
        b.y += b.vy * dt;
        collideWalls(b);
      }

      // Ball-ball, then re-constrain so separation pushes can't eject anything.
      if (state.collisions) {
        collideBalls();
        for (let i = 0; i < balls.length; i++) collideWalls(balls[i]);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Rendering
  // --------------------------------------------------------------------------
  function drawBackground() {
    ctx.globalAlpha = 1;
    if (state.trails) {
      // Partially cover the previous frame so movement leaves fading streaks.
      ctx.fillStyle = `rgba(10, 10, 15, ${TRAIL_FADE})`;
    } else {
      ctx.fillStyle = '#0a0a0f';
    }
    ctx.fillRect(0, 0, W, H);

    // Subtle radial glow behind the polygon. When trails are on it's drawn at the
    // fade alpha so repeated frames converge to the same brightness instead of piling up.
    ctx.globalAlpha = state.trails ? TRAIL_FADE : 1;
    ctx.fillStyle = bgGlow;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  function drawPolygon() {
    const n = verts.length;
    if (!n) return;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(verts[0].x, verts[0].y);
    for (let i = 1; i < n; i++) ctx.lineTo(verts[i].x, verts[i].y);
    ctx.closePath();

    // Glowing outer stroke
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = `rgba(${ACCENT}, 0.85)`;
    ctx.shadowColor = `rgba(${ACCENT}, 0.9)`;
    ctx.shadowBlur = 22;
    ctx.stroke();

    // Crisp bright core
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(220, 245, 255, 0.6)';
    ctx.stroke();

    // Vertex dots
    ctx.shadowBlur = 12;
    ctx.shadowColor = `rgba(${ACCENT}, 1)`;
    ctx.fillStyle = 'rgba(200, 240, 255, 1)';
    for (let i = 0; i < n; i++) {
      ctx.beginPath();
      ctx.arc(verts[i].x, verts[i].y, 3.5, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBalls() {
    const glowAlpha = state.trails ? 0.3 : 1;

    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      const gr = b.r * 2.2;

      // Radial glow
      ctx.globalAlpha = glowAlpha;
      const g = ctx.createRadialGradient(b.x, b.y, b.r * 0.6, b.x, b.y, gr);
      g.addColorStop(0, b.glow);
      g.addColorStop(1, b.glowEnd);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, gr, 0, TAU);
      ctx.fill();

      // Solid body
      ctx.globalAlpha = 1;
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.fill();

      // Specular highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.beginPath();
      ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, Math.max(1, b.r * 0.24), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function draw() {
    drawBackground();
    drawPolygon();
    drawBalls();
  }

  // --------------------------------------------------------------------------
  // Resize / main loop
  // --------------------------------------------------------------------------
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    cx = W / 2;
    cy = H / 2;
    R = Math.min(W, H) * 0.42;

    bgGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.6);
    bgGlow.addColorStop(0, `rgba(${ACCENT}, 0.12)`);
    bgGlow.addColorStop(0.45, `rgba(${ACCENT}, 0.05)`);
    bgGlow.addColorStop(1, `rgba(${ACCENT}, 0)`);

    computeEdges();
  }

  let last = performance.now();
  function loop(now) {
    let frameDt = (now - last) / 1000;
    last = now;
    if (frameDt > MAX_FRAME_DT) frameDt = MAX_FRAME_DT;
    if (frameDt < 0) frameDt = 0;

    step(frameDt);
    draw();
    requestAnimationFrame(loop);
  }

  // --------------------------------------------------------------------------
  // UI: sliders, toggles, button
  // --------------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);

  function setFill(input) {
    const min = +input.min, max = +input.max, v = +input.value;
    input.style.setProperty('--p', `${((v - min) / (max - min)) * 100}%`);
  }

  /**
   * bindRange(id, key, format, onChange)
   * onChange(value, fromUser) is called on init (fromUser=false) and on input (true).
   */
  function bindRange(id, key, format, onChange) {
    const input = $(id);
    const out = $(`${id}Val`);
    const apply = (fromUser) => {
      const v = parseFloat(input.value);
      state[key] = v;
      if (out) out.textContent = format(v);
      setFill(input);
      if (onChange) onChange(v, fromUser);
    };
    input.addEventListener('input', () => apply(true));
    apply(false);
  }

  function bindToggle(id, key) {
    const input = $(id);
    const apply = () => { state[key] = input.checked; };
    input.addEventListener('change', apply);
    apply();
  }

  const gravityArrow = (deg) => ARROWS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

  function bindControls() {
    // Shape
    bindRange('sides', 'sides', (v) => String(v), (v, fromUser) => {
      $('shapeName').textContent = SHAPE_NAMES[v] || `${v}-gon`;
      if (fromUser) initBalls();
    });
    bindRange('spin', 'spin', (v) => `${v.toFixed(1)} rad/s`);

    // Balls
    bindRange('count', 'count', (v) => String(v), (v, fromUser) => { if (fromUser) initBalls(); });
    bindRange('sizeVar', 'sizeVar', (v) => `+${v}`, (v, fromUser) => { if (fromUser) initBalls(); });
    bindRange('bounce', 'bounciness', (v) => v.toFixed(2));
    bindToggle('collisions', 'collisions');

    // Physics
    bindRange('gravAngle', 'gravAngle', (v) => `${v}° ${gravityArrow(v)}`);
    bindRange('gravity', 'gravStrength', (v) => (v === 0 ? '0 (zero-G)' : String(v)));
    bindRange('timeScale', 'timeScale', (v) => `${v.toFixed(2).replace(/0$/, '')}×`);

    // Effects
    bindToggle('trails', 'trails');
    $('explode').addEventListener('click', explode);
  }

  // --------------------------------------------------------------------------
  // UI: collapsible sections
  // --------------------------------------------------------------------------
  function bindSections() {
    document.querySelectorAll('.card-header').forEach((btn) => {
      btn.addEventListener('click', () => {
        const card = btn.closest('.card');
        const collapsed = card.classList.toggle('collapsed');
        btn.setAttribute('aria-expanded', String(!collapsed));
        hideTooltip();
      });
    });
  }

  // --------------------------------------------------------------------------
  // UI: tooltips (a real DOM node positioned via getBoundingClientRect)
  // --------------------------------------------------------------------------
  const tooltip = $('tooltip');
  const panel = $('panel');
  let tipTarget = null;

  function positionTooltip(el) {
    const rect = el.getBoundingClientRect();
    const prect = panel.getBoundingClientRect();

    // Control scrolled out of the panel's visible area? Hide instead.
    if (rect.bottom < prect.top + 4 || rect.top > prect.bottom - 4) {
      tooltip.classList.remove('visible');
      return;
    }

    const tw = tooltip.offsetWidth;
    const th = tooltip.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const GAP = 14;

    // Prefer the right of the control; flip to the left if there's no room.
    let left = rect.right + GAP;
    let flip = false;
    if (left + tw > vw - 8) {
      left = Math.max(8, rect.left - tw - GAP);
      flip = true;
    }

    let top = rect.top + rect.height / 2 - th / 2;
    top = Math.max(8, Math.min(vh - th - 8, top));

    // Keep the little arrow pointing at the control even when clamped.
    const arrowY = Math.max(12, Math.min(th - 12, rect.top + rect.height / 2 - top));

    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;
    tooltip.style.setProperty('--arrow-y', `${arrowY}px`);
    tooltip.classList.toggle('left', flip);
    tooltip.classList.add('visible');
  }

  function showTooltip(el) {
    tipTarget = el;
    tooltip.textContent = el.dataset.tip;
    positionTooltip(el);
  }

  function hideTooltip() {
    tipTarget = null;
    tooltip.classList.remove('visible');
  }

  function bindTooltips() {
    document.querySelectorAll('.control[data-tip]').forEach((el) => {
      el.addEventListener('mouseenter', () => showTooltip(el));
      el.addEventListener('mouseleave', hideTooltip);
    });
    panel.addEventListener('scroll', () => { if (tipTarget) positionTooltip(tipTarget); }, { passive: true });
    window.addEventListener('resize', hideTooltip);
  }

  // --------------------------------------------------------------------------
  // Boot
  // --------------------------------------------------------------------------
  resize();
  bindControls();
  bindSections();
  bindTooltips();
  initBalls();
  window.addEventListener('resize', resize);
  requestAnimationFrame((t) => { last = t; loop(t); });
})();
