/* sim.js — spinning-polygon physics sandbox (vanilla JS, Canvas 2D, no dependencies) */
(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------
  const TAU = Math.PI * 2;
  const BG = '#0a0a0f';

  const SUBSTEPS = 5;               // physics substeps per frame
  const BASE_RADIUS = 6;            // base ball radius (px)
  const BALL_RESTITUTION = 0.85;    // ball-ball bounce (fixed)
  const WALL_FRICTION = 0.5;        // tangential friction coefficient vs. walls
  const AIR_DRAG = 0.08;            // velocity decay rate (1/s)
  const REST_SPEED = 8;             // px/s — below this, contacts don't bounce (kills jitter)
  const MAX_SPEED = 1600;           // px/s safety clamp
  const MAX_FRAME_DT = 1 / 30;      // s — clamp after tab switches / hitches
  const CONSTRAINT_PASSES = 2;      // wall projection passes per constraint call
  const TRAIL_ALPHA = 0.2;          // overlay strength when trails are on
  const FRAME_RADIUS_FRAC = 0.36;   // circumradius as a fraction of min(viewport)

  const SHAPE_NAMES = {
    3: 'Triangle', 4: 'Square', 5: 'Pentagon', 6: 'Hexagon', 7: 'Heptagon',
    8: 'Octagon', 9: 'Nonagon', 10: 'Decagon', 11: 'Hendecagon', 12: 'Dodecagon',
    13: 'Tridecagon', 14: 'Tetradecagon', 15: 'Pentadecagon', 16: 'Hexadecagon',
    17: 'Heptadecagon', 18: 'Octadecagon', 19: 'Enneadecagon', 20: 'Icosagon',
  };

  // 8 arrows at 45° steps. Screen coords (y down): 0° → right, 90° → down.
  const ARROWS = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];

  // ---------------------------------------------------------------------------
  // DOM
  // ---------------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');
  const panel = $('panel');
  const tooltip = $('tooltip');

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  const settings = {
    sides: 8,
    spin: 0.5,          // rad/s
    count: 40,
    sizeVar: 14,        // max extra radius (px)
    bounce: 0.8,        // wall restitution
    collisions: true,
    gravAngle: 90,      // degrees
    gravity: 600,       // px/s²
    timeScale: 1,
    trails: false,
  };

  let W = 0, H = 0, dpr = 1;

  // Regular polygon frame. `angle` is the rotation of vertex 0 (radians).
  const poly = { n: 8, cx: 0, cy: 0, R: 0, A: 0, angle: 0 };

  // Per-substep edge data: outward unit normal (nx, ny) and tangent (tx, ty).
  const walls = [];
  let balls = [];

  // ---------------------------------------------------------------------------
  // Geometry
  // ---------------------------------------------------------------------------
  function updateGeometry() {
    poly.cx = W / 2;
    poly.cy = H / 2;
    poly.R = Math.min(W, H) * FRAME_RADIUS_FRAC;   // circumradius
    poly.A = poly.R * Math.cos(Math.PI / poly.n);  // apothem (inscribed radius)
  }

  function setSides(n) {
    poly.n = n;
    // Orient so an edge lies flat on the bottom at spawn time.
    poly.angle = Math.PI / 2 - Math.PI / n;
    updateGeometry();
    spawnBalls();
  }

  // Edge i sits between vertices i and i+1. Its outward normal points at the
  // midpoint angle. Signed distance from center to edge line is dot(p - c, n) - A.
  function computeWalls() {
    walls.length = 0;
    const step = TAU / poly.n;
    for (let i = 0; i < poly.n; i++) {
      const phi = poly.angle + (i + 0.5) * step;
      const nx = Math.cos(phi);
      const ny = Math.sin(phi);
      walls.push({ nx, ny, tx: -ny, ty: nx });
    }
  }

  // ---------------------------------------------------------------------------
  // Spawning / explosion
  // ---------------------------------------------------------------------------
  function overlapsAny(x, y, r) {
    for (const b of balls) {
      const dx = b.x - x, dy = b.y - y, rr = b.r + r + 1;
      if (dx * dx + dy * dy < rr * rr) return true;
    }
    return false;
  }

  function spawnBalls() {
    balls = [];
    for (let i = 0; i < settings.count; i++) {
      // Keep radius below half the apothem so there is always room to spawn.
      const r = Math.min(BASE_RADIUS + Math.random() * settings.sizeVar, poly.A * 0.5);

      // Any center within (A - r) of the polygon center is inside every edge,
      // because the apothem is the inscribed radius.
      const reach = poly.A - r;

      let x = poly.cx, y = poly.cy;
      for (let attempt = 0; attempt < 30; attempt++) {
        const a = Math.random() * TAU;
        const d = Math.sqrt(Math.random()) * reach; // uniform in disk
        x = poly.cx + Math.cos(a) * d;
        y = poly.cy + Math.sin(a) * d;
        if (!overlapsAny(x, y, r)) break;
      }

      balls.push({
        x, y, r,
        vx: (Math.random() - 0.5) * 120,
        vy: (Math.random() - 0.5) * 120,
        hue: Math.random() * 360,
      });
    }
  }

  function explode() {
    for (const b of balls) {
      const a = Math.random() * TAU;
      const s = 300 + Math.random() * 500;
      b.vx += Math.cos(a) * s;
      b.vy += Math.sin(a) * s;
    }
  }

  // ---------------------------------------------------------------------------
  // Physics
  // ---------------------------------------------------------------------------

  // Applies restitution + friction against one edge, treating the wall as a
  // rigidly rotating body. The wall's surface velocity at the contact point is
  // v_w = ω × r, where r is the contact point relative to the center.
  function wallImpulse(b, w, omega) {
    const { cx, cy, A } = poly;

    // Tangential coordinate of the ball along this edge.
    const s = (b.x - cx) * w.tx + (b.y - cy) * w.ty;

    // Contact point on the wall, relative to the polygon center.
    const rx = w.nx * A + w.tx * s;
    const ry = w.ny * A + w.ty * s;

    // Wall surface velocity at that point (2D cross product: ω × r).
    const wvx = -omega * ry;
    const wvy = omega * rx;

    // Ball velocity relative to the moving wall.
    const rvx = b.vx - wvx;
    const rvy = b.vy - wvy;

    // Positive normal component = moving outward, into the wall.
    const vn = rvx * w.nx + rvy * w.ny;
    if (vn <= 0) return;

    // Restitution (suppressed at very low speed to prevent jitter).
    const e = vn < REST_SPEED ? 0 : settings.bounce;
    const jn = (1 + e) * vn;
    b.vx -= jn * w.nx;
    b.vy -= jn * w.ny;

    // Coulomb-style friction: pull tangential slip toward the wall's surface
    // velocity, capped by μ × normal impulse. This is what makes spinning
    // walls drag and fling balls.
    const vt = rvx * w.tx + rvy * w.ty;
    const maxF = WALL_FRICTION * jn;
    const f = Math.max(-maxF, Math.min(maxF, -vt));
    b.vx += f * w.tx;
    b.vy += f * w.ty;
  }

  // Edge-based containment. For each edge, compute the signed distance
  // d = dot(p - c, n_out) - A (negative inside). Penetration is pen = d + r.
  // Push the ball inward by pen along the normal.
  // withVelocity = true applies the bounce/friction response on the first pass.
  // withVelocity = false is a position-only re-constraint.
  function solveWalls(b, withVelocity) {
    const { cx, cy, A } = poly;
    const omega = settings.spin;

    for (let pass = 0; pass < CONSTRAINT_PASSES; pass++) {
      let touched = false;
      for (const w of walls) {
        const d = (b.x - cx) * w.nx + (b.y - cy) * w.ny - A;
        const pen = d + b.r;
        if (pen <= 0) continue;

        touched = true;
        b.x -= w.nx * pen;
        b.y -= w.ny * pen;

        if (withVelocity && pass === 0) wallImpulse(b, w, omega);
      }
      if (!touched) break;
    }
  }

  // Mass-based ball-ball collision. Mass m = r² (2D area proxy).
  // Separation is split by inverse mass, and the impulse follows the standard
  // normal impulse formula.
  function solveBallPairs() {
    const n = balls.length;
    for (let i = 0; i < n; i++) {
      const a = balls[i];
      for (let j = i + 1; j < n; j++) {
        const b = balls[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const rr = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;

        let nx, ny, d;
        if (d2 < 1e-12) { nx = 1; ny = 0; d = 0; }
        else { d = Math.sqrt(d2); nx = dx / d; ny = dy / d; }

        const ia = 1 / (a.r * a.r);
        const ib = 1 / (b.r * b.r);
        const isum = ia + ib;

        // Positional separation (mass-weighted).
        const overlap = rr - d;
        a.x -= nx * overlap * (ia / isum);
        a.y -= ny * overlap * (ia / isum);
        b.x += nx * overlap * (ib / isum);
        b.y += ny * overlap * (ib / isum);

        // Velocity impulse along the contact normal.
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rv < 0) {
          const e = -rv < REST_SPEED ? 0 : BALL_RESTITUTION;
          const j = -((1 + e) * rv) / isum;
          a.vx -= j * ia * nx;
          a.vy -= j * ia * ny;
          b.vx += j * ib * nx;
          b.vy += j * ib * ny;
        }
      }
    }
  }

  // One physics substep of duration h (seconds).
  function step(h) {
    // 1. Rotate the frame and rebuild edge normals for this substep.
    poly.angle += settings.spin * h;
    if (poly.angle > TAU || poly.angle < -TAU) poly.angle %= TAU;
    computeWalls();

    // 2. Gravity, air damping, and position integration.
    const ga = (settings.gravAngle * Math.PI) / 180;
    const gx = Math.cos(ga) * settings.gravity;
    const gy = Math.sin(ga) * settings.gravity;
    const damp = Math.exp(-AIR_DRAG * h);

    for (const b of balls) {
      b.vx = (b.vx + gx * h) * damp;
      b.vy = (b.vy + gy * h) * damp;

      const sp2 = b.vx * b.vx + b.vy * b.vy;
      if (sp2 > MAX_SPEED * MAX_SPEED) {
        const k = MAX_SPEED / Math.sqrt(sp2);
        b.vx *= k;
        b.vy *= k;
      }

      b.x += b.vx * h;
      b.y += b.vy * h;
    }

    // 3. Wall contacts: position correction plus spin-aware velocity response.
    for (const b of balls) solveWalls(b, true);

    // 4. Ball-ball contacts.
    if (settings.collisions) solveBallPairs();

    // 5. Re-constrain inside the polygon, since ball-ball separation can push
    //    balls through walls.
    for (const b of balls) solveWalls(b, false);
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  function render() {
    // Background: solid clear, or translucent black overlay for trails.
    ctx.fillStyle = settings.trails ? `rgba(0, 0, 0, ${TRAIL_ALPHA})` : BG;
    ctx.fillRect(0, 0, W, H);

    const { cx, cy, R, n, angle } = poly;
    const stepAng = TAU / n;

    // Subtle radial glow behind the frame.
    if (!settings.trails) {
      const glowR = R * 1.9;
      const glow = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, glowR);
      glow.addColorStop(0, 'rgba(100, 200, 255, 0.10)');
      glow.addColorStop(0.5, 'rgba(100, 200, 255, 0.035)');
      glow.addColorStop(1, 'rgba(100, 200, 255, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, glowR, 0, TAU);
      ctx.fill();
    }

    // Frame: faint fill, glowing stroke, and vertex dots.
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = angle + i * stepAng;
      const x = cx + Math.cos(a) * R;
      const y = cy + Math.sin(a) * R;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(100, 200, 255, 0.025)';
    ctx.fill();

    ctx.shadowColor = 'rgba(100, 200, 255, 0.9)';
    ctx.shadowBlur = 22;
    ctx.strokeStyle = 'rgba(100, 200, 255, 0.9)';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.stroke();

    ctx.shadowBlur = 12;
    ctx.fillStyle = '#d6f4ff';
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = angle + i * stepAng;
      const x = cx + Math.cos(a) * R;
      const y = cy + Math.sin(a) * R;
      ctx.moveTo(x + 3.5, y);
      ctx.arc(x, y, 3.5, 0, TAU);
    }
    ctx.fill();
    ctx.restore();

    // Balls: radial glow, solid fill, and a white highlight dot.
    for (const b of balls) {
      const { x, y, r, hue } = b;

      const gr = r * 2.8;
      const glow = ctx.createRadialGradient(x, y, r * 0.5, x, y, gr);
      glow.addColorStop(0, `hsla(${hue}, 100%, 65%, 0.5)`);
      glow.addColorStop(0.45, `hsla(${hue}, 100%, 60%, 0.18)`);
      glow.addColorStop(1, `hsla(${hue}, 100%, 60%, 0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, gr, 0, TAU);
      ctx.fill();

      ctx.fillStyle = `hsl(${hue}, 90%, 60%)`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.beginPath();
      ctx.arc(x - r * 0.35, y - r * 0.35, Math.max(1, r * 0.2), 0, TAU);
      ctx.fill();
    }
  }

  // ---------------------------------------------------------------------------
  // Loop / resize
  // ---------------------------------------------------------------------------
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    updateGeometry();
  }

  let lastTime = 0;
  function frame(now) {
    const realDt = lastTime ? Math.min((now - lastTime) / 1000, MAX_FRAME_DT) : 0;
    lastTime = now;

    const h = (realDt * settings.timeScale) / SUBSTEPS;
    if (h > 0) {
      for (let i = 0; i < SUBSTEPS; i++) step(h);
    }

    render();
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------------------
  // UI helpers
  // ---------------------------------------------------------------------------
  function gravArrow(deg) {
    const a = ((deg % 360) + 360) % 360;
    return ARROWS[Math.round(a / 45) % 8];
  }

  // Binds a range input: paints the value and track fill, then calls onChange.
  function bindRange(id, format, onChange) {
    const input = $(id);
    const out = $(id + 'Out');
    const min = parseFloat(input.min);
    const max = parseFloat(input.max);

    const paint = () => {
      const v = parseFloat(input.value);
      input.style.setProperty('--p', `${((v - min) / (max - min)) * 100}%`);
      if (out) out.textContent = format(v);
      onChange(v);
    };

    input.addEventListener('input', paint);
    paint(); // sync initial state from the HTML value
  }

  function bindToggle(id, onChange) {
    const input = $(id);
    const apply = () => onChange(input.checked);
    input.addEventListener('change', apply);
    apply();
  }

  // Tooltip: a real DOM element outside the panel, positioned with
  // getBoundingClientRect() to the right of the hovered control.
  function showTip(el) {
    const text = el.dataset.tip;
    if (!text) return;

    tooltip.textContent = text;
    tooltip.classList.add('show');

    const r = el.getBoundingClientRect();
    const tw = tooltip.offsetWidth;
    const th = tooltip.offsetHeight;
    const margin = 8;

    let left = r.right + 12;
    let top = r.top + r.height / 2 - th / 2;

    left = Math.min(left, window.innerWidth - tw - margin);
    top = Math.min(Math.max(top, margin), window.innerHeight - th - margin);

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  function hideTip() {
    tooltip.classList.remove('show');
  }

  function bindUI() {
    // ----- Shape -----
    bindRange('sides', (v) => String(v), (v) => {
      settings.sides = v;
      $('shapeName').textContent = SHAPE_NAMES[v] || 'Polygon';
      setSides(v); // reinitializes balls
    });

    bindRange('spin', (v) => (v > 0 ? '+' : '') + v.toFixed(2) + ' rad/s', (v) => {
      settings.spin = v;
    });

    // ----- Balls -----
    bindRange('count', (v) => String(v), (v) => {
      settings.count = v;
      spawnBalls();
    });

    bindRange('sizeVar', (v) => `${v} px`, (v) => {
      settings.sizeVar = v;
      spawnBalls();
    });

    bindRange('bounce', (v) => v.toFixed(2), (v) => {
      settings.bounce = v;
    });

    bindToggle('collisions', (on) => {
      settings.collisions = on;
    });

    // ----- Physics -----
    bindRange('gravAngle', (v) => `${gravArrow(v)} ${Math.round(v)}°`, (v) => {
      settings.gravAngle = v;
    });

    bindRange('gravity', (v) => String(Math.round(v)), (v) => {
      settings.gravity = v;
    });

    bindRange('timeScale', (v) => `${v.toFixed(2)}×`, (v) => {
      settings.timeScale = v;
    });

    // ----- Effects -----
    bindToggle('trails', (on) => {
      settings.trails = on;
    });

    $('explodeBtn').addEventListener('click', explode);

    // ----- Collapsible sections -----
    document.querySelectorAll('.card').forEach((card) => {
      const header = card.querySelector('.card-header');
      header.addEventListener('click', () => {
        const collapsed = card.classList.toggle('collapsed');
        header.setAttribute('aria-expanded', String(!collapsed));
        hideTip();
      });
    });

    // ----- Tooltips -----
    document.querySelectorAll('[data-tip]').forEach((el) => {
      el.addEventListener('mouseenter', () => showTip(el));
      el.addEventListener('mouseleave', hideTip);
    });
    panel.addEventListener('scroll', hideTip, { passive: true });
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  resize();
  bindUI();
  window.addEventListener('resize', resize);
  requestAnimationFrame(frame);
})();
