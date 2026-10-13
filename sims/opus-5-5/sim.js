/**
 * sim.js — Spinning polygon physics sandbox
 *
 * Physics overview (per frame, split into SUBSTEPS substeps):
 *   1. Advance the polygon's rotation and rebuild its vertices + inward edge normals.
 *   2. Integrate each ball (gravity → damping → position, semi-implicit Euler).
 *   3. Constrain each ball against every edge using signed distance to the edge line.
 *      Velocity response uses the wall's own velocity at the contact point (ω × r),
 *      so spinning walls drag and fling balls.
 *   4. Resolve ball–ball overlaps (mass-weighted separation + impulse).
 *   5. Re-constrain balls inside the polygon so collisions can't push them out.
 */
(() => {
  'use strict';

  // ───────────────────────── Constants ─────────────────────────
  const TAU = Math.PI * 2;
  const SUBSTEPS = 5;
  const BASE_RADIUS = 6;
  const BALL_RESTITUTION = 0.85;  // ball–ball bounciness
  const WALL_FRICTION = 0.25;     // Coulomb friction coefficient against the walls
  const LINEAR_DAMPING = 0.12;    // exponential velocity damping (per second)
  const MAX_SPEED = 4000;         // px/s safety clamp (bounciness > 1 can pump energy)
  const MAX_FRAME_DT = 1 / 30;    // clamp large frame gaps (tab switches etc.)
  const TRAIL_FADE = 0.18;        // alpha of the fade rect when trails are on
  const POLY_SCALE = 0.42;        // polygon circumradius as a fraction of min(w, h)
  const BG_COLOR = '#0a0a0f';
  const ACCENT = '100, 200, 255';

  const SHAPE_NAMES = {
    3: 'Triangle', 4: 'Square', 5: 'Pentagon', 6: 'Hexagon', 7: 'Heptagon',
    8: 'Octagon', 9: 'Nonagon', 10: 'Decagon', 11: 'Hendecagon', 12: 'Dodecagon',
    13: 'Tridecagon', 14: 'Tetradecagon', 15: 'Pentadecagon', 16: 'Hexadecagon',
    17: 'Heptadecagon', 18: 'Octadecagon', 19: 'Enneadecagon', 20: 'Icosagon',
  };
  // 0° = down, rotating clockwise on screen: down → left → up → right
  const GRAVITY_ARROWS = ['↓', '↙', '←', '↖', '↑', '↗', '→', '↘'];

  // ───────────────────────── State ─────────────────────────
  // Defaults; overwritten by the DOM control values in setupUI().
  const params = {
    sides: 8,
    spin: 0.8,
    count: 40,
    sizeVar: 14,
    bounciness: 0.8,
    collisions: true,
    gravityAngle: 0,
    gravityStrength: 600,
    timeScale: 1,
    trails: false,
  };

  const poly = {
    cx: 0, cy: 0,
    R: 0,               // circumradius
    apothem: 0,         // inscribed radius
    angle: -Math.PI / 2,
    sides: 8,
    vx: [], vy: [],     // vertex positions
    nx: [], ny: [],     // inward unit normal of edge i (vertex i → i+1)
  };

  const view = { w: 0, h: 0, dpr: 1 };
  let balls = [];
  let bgGlow = null;
  let flash = 0;

  const canvas = document.getElementById('sim');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);

  // ───────────────────────── Geometry ─────────────────────────
  function updatePolygonGeometry() {
    const n = params.sides;
    const { vx, vy, nx, ny } = poly;
    poly.sides = n;
    poly.apothem = poly.R * Math.cos(Math.PI / n);
    vx.length = n; vy.length = n; nx.length = n; ny.length = n;

    for (let i = 0; i < n; i++) {
      const a = poly.angle + (i / n) * TAU;
      vx[i] = poly.cx + Math.cos(a) * poly.R;
      vy[i] = poly.cy + Math.sin(a) * poly.R;
    }

    // Inward normal per edge: perpendicular to the edge, oriented toward the centre.
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ex = vx[j] - vx[i];
      const ey = vy[j] - vy[i];
      const len = Math.hypot(ex, ey) || 1;
      let inx = -ey / len;
      let iny = ex / len;
      if ((poly.cx - vx[i]) * inx + (poly.cy - vy[i]) * iny < 0) {
        inx = -inx;
        iny = -iny;
      }
      nx[i] = inx;
      ny[i] = iny;
    }
  }

  // ───────────────────────── Balls ─────────────────────────
  function makeBall(x, y, r) {
    const hue = (Math.random() * 360).toFixed(1);
    const sat = (70 + Math.random() * 25).toFixed(1);
    const light = (55 + Math.random() * 12).toFixed(1);
    const speed = 60 + Math.random() * 120;
    const dir = Math.random() * TAU;
    const mass = r * r; // proportional to area
    return {
      x, y, r,
      vx: Math.cos(dir) * speed,
      vy: Math.sin(dir) * speed,
      mass,
      invMass: 1 / mass,
      color: `hsl(${hue}, ${sat}%, ${light}%)`,
      glow: `hsla(${hue}, ${sat}%, ${light}%, 0.38)`,
      glowEdge: `hsla(${hue}, ${sat}%, ${light}%, 0)`,
    };
  }

  function initBalls() {
    updatePolygonGeometry();
    const list = [];
    for (let i = 0; i < params.count; i++) {
      const r = BASE_RADIUS + Math.random() * params.sizeVar;
      // Spawn inside the inscribed circle (apothem), so the ball is inside ANY regular polygon.
      const spawnR = Math.max(0, poly.apothem - r - 4);
      let x = poly.cx;
      let y = poly.cy;
      // Rejection-sample a few times to avoid starting overlaps.
      for (let attempt = 0; attempt < 30; attempt++) {
        const a = Math.random() * TAU;
        const d = Math.sqrt(Math.random()) * spawnR;
        x = poly.cx + Math.cos(a) * d;
        y = poly.cy + Math.sin(a) * d;
        let free = true;
        for (let k = 0; k < list.length; k++) {
          const o = list[k];
          const dx = o.x - x, dy = o.y - y, m = o.r + r;
          if (dx * dx + dy * dy < m * m) { free = false; break; }
        }
        if (free) break;
      }
      list.push(makeBall(x, y, r));
    }
    balls = list;
  }

  // ───────────────────────── Physics ─────────────────────────
  /**
   * Edge-based containment. For each edge, signed distance d = (p − v_i) · n_i
   * (positive = inside). If d < r the ball penetrates that edge: push it back
   * along n_i, then resolve velocity relative to the moving wall.
   */
  function constrainToPolygon(b, omega, restitution, restSpeed) {
    const n = poly.sides;
    const { vx, vy, nx, ny } = poly;

    for (let i = 0; i < n; i++) {
      const enx = nx[i];
      const eny = ny[i];
      const d = (b.x - vx[i]) * enx + (b.y - vy[i]) * eny;
      if (d >= b.r) continue;

      // 1) Positional correction
      const pen = b.r - d;
      b.x += enx * pen;
      b.y += eny * pen;

      // 2) Wall velocity at the contact point: v = ω × (q − c)
      const qx = b.x - enx * b.r;
      const qy = b.y - eny * b.r;
      const wvx = -omega * (qy - poly.cy);
      const wvy = omega * (qx - poly.cx);

      // 3) Relative velocity; only respond if approaching the wall
      const rvx = b.vx - wvx;
      const rvy = b.vy - wvy;
      const vn = rvx * enx + rvy * eny;
      if (vn >= 0) continue;

      // Resting contacts get no bounce (keeps piles stable, even with bounciness > 1)
      const e = -vn < restSpeed ? 0 : restitution;
      const jn = -(1 + e) * vn; // normal velocity change

      // Coulomb friction on the tangential relative velocity → spinning walls drag balls
      let tvx = rvx - vn * enx;
      let tvy = rvy - vn * eny;
      const vt = Math.hypot(tvx, tvy);
      if (vt > 1e-9) {
        const k = Math.max(0, 1 - (WALL_FRICTION * jn) / vt);
        tvx *= k;
        tvy *= k;
      }

      // New absolute velocity = wall velocity + (friction-reduced tangent + reflected normal)
      b.vx = wvx + tvx - e * vn * enx;
      b.vy = wvy + tvy - e * vn * eny;
    }
  }

  function resolveBallCollisions(restSpeed) {
    const n = balls.length;
    for (let i = 0; i < n; i++) {
      const a = balls[i];
      for (let j = i + 1; j < n; j++) {
        const b = balls[j];
        const minDist = a.r + b.r;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        if (dx > minDist || dx < -minDist || dy > minDist || dy < -minDist) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 >= minDist * minDist) continue;

        let dist = Math.sqrt(d2);
        let nx, ny;
        if (dist > 1e-6) {
          nx = dx / dist;
          ny = dy / dist;
        } else {
          const ang = Math.random() * TAU;
          nx = Math.cos(ang);
          ny = Math.sin(ang);
          dist = 0;
        }

        // Mass-weighted separation: lighter ball moves more
        const invA = a.invMass;
        const invB = b.invMass;
        const invSum = invA + invB;
        const corr = (minDist - dist) / invSum;
        a.x -= nx * corr * invA;
        a.y -= ny * corr * invA;
        b.x += nx * corr * invB;
        b.y += ny * corr * invB;

        // Impulse along the collision normal
        const rvn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rvn < 0) {
          const e = -rvn < restSpeed ? 0 : BALL_RESTITUTION;
          const jImp = (-(1 + e) * rvn) / invSum;
          a.vx -= jImp * invA * nx;
          a.vy -= jImp * invA * ny;
          b.vx += jImp * invB * nx;
          b.vy += jImp * invB * ny;
        }
      }
    }
  }

  function step(dt) {
    if (dt <= 0) return;
    const sdt = dt / SUBSTEPS;
    const ga = (params.gravityAngle * Math.PI) / 180;
    const gx = -Math.sin(ga) * params.gravityStrength;
    const gy = Math.cos(ga) * params.gravityStrength;
    const damp = Math.exp(-LINEAR_DAMPING * sdt);
    const omega = params.spin;
    const e = params.bounciness;
    const restSpeed = Math.max(8, params.gravityStrength * sdt * 2.5);
    const maxSpeed2 = MAX_SPEED * MAX_SPEED;

    for (let s = 0; s < SUBSTEPS; s++) {
      poly.angle = (poly.angle + omega * sdt) % TAU;
      updatePolygonGeometry();

      for (let i = 0; i < balls.length; i++) {
        const b = balls[i];
        b.vx = (b.vx + gx * sdt) * damp;
        b.vy = (b.vy + gy * sdt) * damp;
        const sp2 = b.vx * b.vx + b.vy * b.vy;
        if (sp2 > maxSpeed2) {
          const k = MAX_SPEED / Math.sqrt(sp2);
          b.vx *= k;
          b.vy *= k;
        }
        b.x += b.vx * sdt;
        b.y += b.vy * sdt;
        constrainToPolygon(b, omega, e, restSpeed);
      }

      if (params.collisions) {
        resolveBallCollisions(restSpeed);
        // Ball–ball separation can push balls through walls; re-constrain.
        for (let i = 0; i < balls.length; i++) {
          constrainToPolygon(balls[i], omega, e, restSpeed);
        }
      }
    }
  }

  function explode() {
    for (const b of balls) {
      const dx = b.x - poly.cx;
      const dy = b.y - poly.cy;
      let ang = Math.hypot(dx, dy) > 1 ? Math.atan2(dy, dx) : Math.random() * TAU;
      ang += (Math.random() - 0.5) * 1.2; // random spread around "outward"
      const mag = 300 + Math.random() * 500;
      b.vx += Math.cos(ang) * mag;
      b.vy += Math.sin(ang) * mag;
    }
    flash = 1;
  }

  // ───────────────────────── Rendering ─────────────────────────
  function tracePolygon() {
    const n = poly.sides;
    ctx.beginPath();
    ctx.moveTo(poly.vx[0], poly.vy[0]);
    for (let i = 1; i < n; i++) ctx.lineTo(poly.vx[i], poly.vy[i]);
    ctx.closePath();
  }

  function drawBalls(glowAlpha) {
    // Pass 1: glows (drawn first so they never cover other balls' bodies)
    ctx.globalAlpha = glowAlpha;
    for (const b of balls) {
      const gr = b.r * 2.1;
      const g = ctx.createRadialGradient(b.x, b.y, b.r * 0.6, b.x, b.y, gr);
      g.addColorStop(0, b.glow);
      g.addColorStop(1, b.glowEdge);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, gr, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Pass 2: solid bodies
    for (const b of balls) {
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.fill();
    }

    // Pass 3: highlight dots
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    for (const b of balls) {
      ctx.beginPath();
      ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, Math.max(1.2, b.r * 0.22), 0, TAU);
      ctx.fill();
    }
  }

  function drawFrame() {
    ctx.save();
    tracePolygon();
    ctx.lineJoin = 'round';

    // Glowing stroke (shadowBlur ignores the transform, so scale by DPR manually)
    ctx.shadowColor = `rgba(${ACCENT}, 0.9)`;
    ctx.shadowBlur = 22 * view.dpr;
    ctx.strokeStyle = `rgba(${ACCENT}, 0.95)`;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Bright inner core line
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(225, 245, 255, 0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Vertex dots
    ctx.shadowBlur = 12 * view.dpr;
    ctx.fillStyle = 'rgb(205, 240, 255)';
    for (let i = 0; i < poly.sides; i++) {
      ctx.beginPath();
      ctx.arc(poly.vx[i], poly.vy[i], 3.5, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawFlash(realDt) {
    if (flash <= 0) return;
    const g = ctx.createRadialGradient(poly.cx, poly.cy, 0, poly.cx, poly.cy, poly.R * 1.2);
    g.addColorStop(0, `rgba(210, 240, 255, ${0.35 * flash})`);
    g.addColorStop(1, `rgba(${ACCENT}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, view.h);
    flash = Math.max(0, flash - realDt * 3);
  }

  function render(realDt) {
    const { w, h } = view;
    const trails = params.trails;

    // Trails: semi-transparent dark rect over the previous frame instead of clearing
    ctx.globalAlpha = 1;
    ctx.fillStyle = trails ? `rgba(10, 10, 15, ${TRAIL_FADE})` : BG_COLOR;
    ctx.fillRect(0, 0, w, h);

    // Ambient glow. With trails the frames accumulate, so draw it at the fade
    // alpha to keep the steady-state brightness about the same as without trails.
    ctx.globalAlpha = trails ? TRAIL_FADE : 1;
    ctx.fillStyle = bgGlow;
    ctx.fillRect(0, 0, w, h);
    tracePolygon();
    ctx.fillStyle = `rgba(${ACCENT}, 0.03)`;
    ctx.fill();
    ctx.globalAlpha = 1;

    drawBalls(trails ? 0.5 : 1);
    drawFrame();
    drawFlash(realDt);
  }

  // ───────────────────────── Resize ─────────────────────────
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    const prevCx = poly.cx;
    const prevCy = poly.cy;
    const prevR = poly.R;

    view.w = w;
    view.h = h;
    view.dpr = dpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    poly.cx = w / 2;
    poly.cy = h / 2;
    poly.R = Math.max(60, Math.min(w, h) * POLY_SCALE);

    // Keep existing balls in the same relative positions
    if (prevR > 0) {
      const s = poly.R / prevR;
      for (const b of balls) {
        b.x = poly.cx + (b.x - prevCx) * s;
        b.y = poly.cy + (b.y - prevCy) * s;
      }
    }

    bgGlow = ctx.createRadialGradient(poly.cx, poly.cy, 0, poly.cx, poly.cy, poly.R * 1.5);
    bgGlow.addColorStop(0, `rgba(${ACCENT}, 0.10)`);
    bgGlow.addColorStop(0.55, `rgba(${ACCENT}, 0.04)`);
    bgGlow.addColorStop(1, `rgba(${ACCENT}, 0)`);

    updatePolygonGeometry();
  }

  // ───────────────────────── UI ─────────────────────────
  function updateFill(input) {
    const min = Number(input.min);
    const max = Number(input.max);
    const p = ((Number(input.value) - min) / (max - min)) * 100;
    if (input.hasAttribute('data-bipolar')) {
      // Fill from the zero point outward (for signed ranges like spin)
      const z = ((0 - min) / (max - min)) * 100;
      input.style.setProperty('--s', Math.min(z, p) + '%');
      input.style.setProperty('--e', Math.max(z, p) + '%');
    } else {
      input.style.setProperty('--s', '0%');
      input.style.setProperty('--e', p + '%');
    }
  }

  function bindRange(id, key, format, { reset = false, after = null } = {}) {
    const input = $(id);
    const out = $(id + '-value');
    const sync = () => {
      params[key] = Number(input.value);
      out.textContent = format(params[key]);
      updateFill(input);
      if (after) after(params[key]);
    };
    sync();
    input.addEventListener('input', () => {
      sync();
      if (reset) initBalls();
    });
  }

  function bindToggle(id, key) {
    const input = $(id);
    const sync = () => { params[key] = input.checked; };
    sync();
    input.addEventListener('change', sync);
  }

  // Tooltip: a real DOM node outside the scrolling panel, positioned with JS.
  const tip = $('tooltip');
  const panel = $('panel');

  function positionTip(el) {
    tip.style.left = '0px'; // reset so shrink-to-fit width isn't limited by the old position
    tip.style.top = '0px';
    const r = el.getBoundingClientRect();
    const pr = panel.getBoundingClientRect();
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    const margin = 8;

    let left = Math.max(r.right, pr.right) + 12; // to the right of the control, clear of the panel
    let clamped = false;
    if (left + tw > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - tw - margin);
      clamped = true;
    }

    const anchorY = r.top + r.height / 2;
    const top = Math.min(Math.max(margin, anchorY - th / 2), window.innerHeight - th - margin);

    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
    tip.style.setProperty('--arrow-y', Math.min(Math.max(anchorY - top, 12), th - 12) + 'px');
    tip.classList.toggle('no-arrow', clamped);
  }

  function showTip(el) {
    tip.textContent = el.dataset.tip;
    positionTip(el);
    tip.classList.add('visible');
  }

  function hideTip() {
    tip.classList.remove('visible');
  }

  function setupUI() {
    bindRange('sides', 'sides', (v) => String(v), {
      reset: true,
      after: (v) => { $('shape-name').textContent = SHAPE_NAMES[v] || `${v}-gon`; },
    });
    bindRange('spin', 'spin', (v) =>
      Math.abs(v) < 1e-6
        ? 'Still'
        : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(2)} ${v > 0 ? '↻' : '↺'}`
    );
    bindRange('count', 'count', (v) => String(v), { reset: true });
    bindRange('size-var', 'sizeVar', (v) => `${v} px`, { reset: true });
    bindRange('bounciness', 'bounciness', (v) => v.toFixed(2));
    bindToggle('collisions', 'collisions');

    bindRange('grav-angle', 'gravityAngle', (v) => `${GRAVITY_ARROWS[Math.round(v / 45) % 8]} ${v}°`);
    bindRange('grav-strength', 'gravityStrength', (v) => (v === 0 ? 'Zero-G' : String(v)));
    bindRange('time-scale', 'timeScale', (v) => (v === 0 ? 'Paused' : `${v.toFixed(2)}×`));

    bindToggle('trails', 'trails');
    $('explode').addEventListener('click', explode);

    // Collapsible sections
    document.querySelectorAll('.section').forEach((section) => {
      const header = section.querySelector('.section-header');
      const body = section.querySelector('.section-body');
      header.addEventListener('click', () => {
        const collapsed = section.classList.toggle('collapsed');
        header.setAttribute('aria-expanded', String(!collapsed));
        body.inert = collapsed;
        hideTip();
      });
    });

    // Tooltips
    document.querySelectorAll('[data-tip]').forEach((el) => {
      el.addEventListener('mouseenter', () => showTip(el));
      el.addEventListener('mouseleave', hideTip);
      el.addEventListener('focusin', (e) => {
        let keyboard = false;
        try { keyboard = e.target.matches(':focus-visible'); } catch (_) { /* old browsers */ }
        if (keyboard) showTip(el);
      });
      el.addEventListener('focusout', hideTip);
    });
    panel.addEventListener('scroll', hideTip, { passive: true });
  }

  // ───────────────────────── FPS ─────────────────────────
  const fpsEl = $('fps');
  let fpsFrames = 0;
  let fpsTime = performance.now();
  function updateFps(now) {
    fpsFrames++;
    if (now - fpsTime >= 500) {
      fpsEl.textContent = Math.round((fpsFrames * 1000) / (now - fpsTime));
      fpsFrames = 0;
      fpsTime = now;
    }
  }

  // ───────────────────────── Main loop ─────────────────────────
  let lastTime = performance.now();
  function frame(now) {
    const realDt = Math.min(Math.max((now - lastTime) / 1000, 0), MAX_FRAME_DT);
    lastTime = now;
    step(realDt * params.timeScale);
    render(realDt);
    updateFps(now);
    requestAnimationFrame(frame);
  }

  // ───────────────────────── Boot ─────────────────────────
  setupUI();
  resize();
  initBalls();
  window.addEventListener('resize', () => {
    hideTip();
    resize();
  });
  requestAnimationFrame((t) => {
    lastTime = t;
    requestAnimationFrame(frame);
  });
})();
