(function () {
  'use strict';

  /* =====================================================================
   *  Constants
   * ===================================================================== */
  const TAU = Math.PI * 2;
  const SUBSTEPS = 5;            // physics substeps per frame
  const BASE_RADIUS = 6;         // base ball radius
  const BALL_RESTITUTION = 0.88; // ball-ball bounciness
  const DAMPING = 0.06;          // global velocity damping (1/s)
  const WALL_DRAG = 2.5;         // tangential wall drag while in contact (1/s)
  const REST_SPEED = 30;         // below this impact speed, bounce is killed (prevents jitter)
  const MAX_SPEED = 3000;        // safety cap
  const MAX_FRAME_DT = 1 / 30;   // clamp huge frame gaps (tab switches etc.)
  const MAX_SIDES = 20;

  const SHAPE_NAMES = {
    3: 'Triangle', 4: 'Square', 5: 'Pentagon', 6: 'Hexagon', 7: 'Heptagon',
    8: 'Octagon', 9: 'Nonagon', 10: 'Decagon', 11: 'Hendecagon', 12: 'Dodecagon',
    13: 'Tridecagon', 14: 'Tetradecagon', 15: 'Pentadecagon', 16: 'Hexadecagon',
    17: 'Heptadecagon', 18: 'Octadecagon', 19: 'Enneadecagon', 20: 'Icosagon'
  };
  // index = round(angle / 45) % 8 ; 0° = down, rotating clockwise on screen
  const GRAVITY_ARROWS = ['↓', '↙', '←', '↖', '↑', '↗', '→', '↘'];

  /* =====================================================================
   *  DOM / settings
   * ===================================================================== */
  const $ = (id) => document.getElementById(id);
  const canvas = $('sim');
  const ctx = canvas.getContext('2d', { alpha: false });

  // Initial values are read from the DOM so HTML stays the single source of truth
  const settings = {
    sides: +$('sides').value,
    spin: +$('spin').value,
    count: +$('count').value,
    sizeVar: +$('sizeVar').value,
    bounce: +$('bounce').value,
    collisions: $('collisions').checked,
    gravAngle: +$('gravAngle').value,
    gravStrength: +$('gravStrength').value,
    timeScale: +$('timeScale').value,
    trails: $('trails').checked
  };

  /* =====================================================================
   *  Simulation state
   * ===================================================================== */
  const balls = [];
  let W = 0, H = 0, dpr = 1;
  let cx = 0, cy = 0;       // polygon centre
  let R = 0;                // circumradius
  let apothem = 0;          // inscribed radius = R * cos(PI / n)
  let angle = 0;            // polygon rotation (radians)
  let forceClear = true;    // hard-clear next frame even when trails are on

  // Preallocated edge / vertex caches (avoid per-frame garbage)
  const verts = Array.from({ length: MAX_SIDES }, () => ({ x: 0, y: 0 }));
  const edges = Array.from({ length: MAX_SIDES }, () => ({ x: 0, y: 0, nx: 0, ny: 0 }));

  /* =====================================================================
   *  Geometry
   * ===================================================================== */
  function updatePolygonSize() {
    R = Math.min(W, H) * 0.42;
    apothem = R * Math.cos(Math.PI / settings.sides);
  }

  // Rebuild vertices and per-edge inward normals for the current rotation.
  function updateEdges() {
    const n = settings.sides;
    const step = TAU / n;

    for (let i = 0; i < n; i++) {
      const a = angle + i * step;
      verts[i].x = cx + R * Math.cos(a);
      verts[i].y = cy + R * Math.sin(a);
    }

    for (let i = 0; i < n; i++) {
      const p1 = verts[i];
      const p2 = verts[(i + 1) % n];
      const ex = p2.x - p1.x;
      const ey = p2.y - p1.y;
      const len = Math.hypot(ex, ey) || 1;

      // perpendicular to the edge, flipped if necessary so it points inward
      let nx = -ey / len;
      let ny = ex / len;
      if ((cx - p1.x) * nx + (cy - p1.y) * ny < 0) { nx = -nx; ny = -ny; }

      const e = edges[i];
      e.x = p1.x; e.y = p1.y; e.nx = nx; e.ny = ny;
    }
  }

  /* =====================================================================
   *  Balls
   * ===================================================================== */
  function overlapsExisting(x, y, r) {
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      const dx = b.x - x, dy = b.y - y;
      const m = b.r + r;
      if (dx * dx + dy * dy < m * m) return true;
    }
    return false;
  }

  function initBalls() {
    balls.length = 0;
    const maxR = Math.max(3, apothem * 0.45); // safety for tiny windows

    for (let i = 0; i < settings.count; i++) {
      const r = Math.min(BASE_RADIUS + Math.random() * settings.sizeVar, maxR);

      // Spawn inside the INSCRIBED circle (apothem) so it is inside any polygon
      const limit = Math.max(0, apothem - r - 2);
      let x = cx, y = cy;
      for (let tries = 0; tries < 30; tries++) {
        const a = Math.random() * TAU;
        const d = Math.sqrt(Math.random()) * limit;
        x = cx + Math.cos(a) * d;
        y = cy + Math.sin(a) * d;
        if (!overlapsExisting(x, y, r)) break;
      }

      const va = Math.random() * TAU;
      const vs = 50 + Math.random() * 200;
      const hue = Math.round((i * 137.508 + Math.random() * 30) % 360);

      balls.push({
        x, y,
        vx: Math.cos(va) * vs,
        vy: Math.sin(va) * vs,
        r,
        m: r * r, // mass ~ area
        fill: `hsl(${hue}, 85%, 60%)`,
        glowA: `hsla(${hue}, 90%, 60%, 0.40)`,
        glowB: `hsla(${hue}, 90%, 60%, 0)`
      });
    }
  }

  /* =====================================================================
   *  Physics
   * ===================================================================== */

  // Edge-based containment. For each edge: signed distance of the ball centre
  // along the inward normal; if it is less than the radius the ball penetrates,
  // so push it inward and resolve velocity relative to the wall's motion at
  // the contact point. `dragK` is the tangential drag factor (0 = none).
  function collideWalls(dragK) {
    const n = settings.sides;
    const omega = settings.spin;
    const wallRestitution = settings.bounce;

    for (let bi = 0; bi < balls.length; bi++) {
      const b = balls[bi];

      for (let i = 0; i < n; i++) {
        const e = edges[i];
        const dist = (b.x - e.x) * e.nx + (b.y - e.y) * e.ny; // signed distance
        if (dist >= b.r) continue;

        // positional correction: push back inside
        const pen = b.r - dist;
        b.x += e.nx * pen;
        b.y += e.ny * pen;

        // wall velocity at the contact point: v = omega x (P - c)
        const px = b.x - e.nx * b.r;
        const py = b.y - e.ny * b.r;
        const wvx = -omega * (py - cy);
        const wvy = omega * (px - cx);

        // ball velocity relative to the moving wall
        let rvx = b.vx - wvx;
        let rvy = b.vy - wvy;
        const vn = rvx * e.nx + rvy * e.ny;

        if (vn < 0) { // moving into the wall
          const rest = -vn < REST_SPEED ? 0 : wallRestitution;
          rvx -= (1 + rest) * vn * e.nx;
          rvy -= (1 + rest) * vn * e.ny;
        }

        // tangential drag so spinning walls carry / fling balls
        if (dragK > 0) {
          const tx = -e.ny, ty = e.nx;
          const vt = rvx * tx + rvy * ty;
          rvx -= vt * dragK * tx;
          rvy -= vt * dragK * ty;
        }

        b.vx = wvx + rvx;
        b.vy = wvy + rvy;
      }
    }
  }

  // Mass-based separation + impulse resolution
  function collideBalls() {
    const n = balls.length;
    for (let i = 0; i < n; i++) {
      const a = balls[i];
      for (let j = i + 1; j < n; j++) {
        const b = balls[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const minDist = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= minDist * minDist) continue;

        let dist = Math.sqrt(d2);
        let nx, ny;
        if (dist < 1e-6) {
          const t = Math.random() * TAU;
          nx = Math.cos(t); ny = Math.sin(t); dist = 0;
        } else {
          nx = dx / dist; ny = dy / dist;
        }

        const invA = 1 / a.m;
        const invB = 1 / b.m;
        const invSum = invA + invB;

        // separate: lighter ball moves more
        const overlap = minDist - dist;
        const sa = overlap * (invA / invSum);
        const sb = overlap * (invB / invSum);
        a.x -= nx * sa; a.y -= ny * sa;
        b.x += nx * sb; b.y += ny * sb;

        // impulse along the collision normal
        const rvx = b.vx - a.vx;
        const rvy = b.vy - a.vy;
        const vn = rvx * nx + rvy * ny;
        if (vn < 0) {
          const imp = -(1 + BALL_RESTITUTION) * vn / invSum;
          a.vx -= imp * invA * nx; a.vy -= imp * invA * ny;
          b.vx += imp * invB * nx; b.vy += imp * invB * ny;
        }
      }
    }
  }

  function step(dt) {
    if (dt <= 0) return;

    const sub = dt / SUBSTEPS;
    const rad = settings.gravAngle * Math.PI / 180;
    // 0° = down, 90° = left, 180° = up, 270° = right
    const gx = -Math.sin(rad) * settings.gravStrength;
    const gy = Math.cos(rad) * settings.gravStrength;
    const damp = Math.exp(-DAMPING * sub);
    const dragK = 1 - Math.exp(-WALL_DRAG * sub);
    const maxSp2 = MAX_SPEED * MAX_SPEED;

    for (let s = 0; s < SUBSTEPS; s++) {
      // rotate the frame, then refresh edge geometry
      angle = (angle + settings.spin * sub) % TAU;
      updateEdges();

      // integrate
      for (let i = 0; i < balls.length; i++) {
        const b = balls[i];
        b.vx = (b.vx + gx * sub) * damp;
        b.vy = (b.vy + gy * sub) * damp;
        const sp2 = b.vx * b.vx + b.vy * b.vy;
        if (sp2 > maxSp2) {
          const k = MAX_SPEED / Math.sqrt(sp2);
          b.vx *= k; b.vy *= k;
        }
        b.x += b.vx * sub;
        b.y += b.vy * sub;
      }

      collideWalls(dragK);

      if (settings.collisions) {
        collideBalls();
        collideWalls(0); // re-constrain after ball-ball pushes (no extra drag)
      }
    }
  }

  /* =====================================================================
   *  Rendering
   * ===================================================================== */
  function render() {
    // --- background (radial glow baked into the fade/clear fill) ---
    const a = (settings.trails && !forceClear) ? 0.22 : 1;
    forceClear = false;

    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.6);
    bg.addColorStop(0, `rgba(22, 38, 54, ${a})`);
    bg.addColorStop(0.6, `rgba(13, 20, 29, ${a})`);
    bg.addColorStop(1, `rgba(10, 10, 15, ${a})`);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // --- polygon frame ---
    const n = settings.sides;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(100, 200, 255, 0.95)';
    ctx.shadowBlur = 22;
    ctx.strokeStyle = 'rgba(100, 200, 255, 0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(verts[0].x, verts[0].y);
    for (let i = 1; i < n; i++) ctx.lineTo(verts[i].x, verts[i].y);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // vertex dots
    ctx.save();
    ctx.shadowColor = 'rgba(100, 200, 255, 1)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = 'rgba(210, 240, 255, 0.95)';
    for (let i = 0; i < n; i++) {
      ctx.beginPath();
      ctx.arc(verts[i].x, verts[i].y, 4, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // --- balls: glows first so they never wash over other balls ---
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      const g = ctx.createRadialGradient(b.x, b.y, b.r * 0.5, b.x, b.y, b.r * 2.4);
      g.addColorStop(0, b.glowA);
      g.addColorStop(1, b.glowB);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 2.4, 0, TAU);
      ctx.fill();
    }

    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      ctx.fillStyle = b.fill;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.fill();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.beginPath();
      ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, Math.max(1.5, b.r * 0.18), 0, TAU);
      ctx.fill();
    }
  }

  /* =====================================================================
   *  Sizing
   * ===================================================================== */
  function resize() {
    const oldCx = cx, oldCy = cy, oldR = R;

    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    cx = W / 2;
    cy = H / 2;
    updatePolygonSize();
    updateEdges();

    // keep balls at the same relative position inside the (resized) frame
    if (oldR > 0 && R > 0) {
      const k = R / oldR;
      for (const b of balls) {
        b.x = cx + (b.x - oldCx) * k;
        b.y = cy + (b.y - oldCy) * k;
      }
    }
    forceClear = true;
  }

  /* =====================================================================
   *  UI wiring
   * ===================================================================== */
  function setFill(input) {
    const min = parseFloat(input.min);
    const max = parseFloat(input.max);
    const pct = ((parseFloat(input.value) - min) / (max - min)) * 100;
    input.style.setProperty('--fill', pct + '%');
  }

  function gravityArrow(deg) {
    return GRAVITY_ARROWS[Math.round(deg / 45) % 8];
  }

  // `apply` runs only on user input; the initial display is refreshed separately
  function bindRange(id, valId, format, apply) {
    const input = $(id);
    const out = $(valId);
    const refresh = () => {
      out.textContent = format(parseFloat(input.value));
      setFill(input);
    };
    input.addEventListener('input', () => {
      refresh();
      apply(parseFloat(input.value));
    });
    refresh();
  }

  // Changing sides re-initializes balls
  bindRange('sides', 'sidesVal', (v) => String(v), (v) => {
    settings.sides = v;
    $('shapeName').textContent = SHAPE_NAMES[v] || (v + '-gon');
    updatePolygonSize();
    updateEdges();
    initBalls();
  });
  $('shapeName').textContent = SHAPE_NAMES[settings.sides] || (settings.sides + '-gon');

  // Live: no reset
  bindRange('spin', 'spinVal', (v) => v.toFixed(1), (v) => { settings.spin = v; });

  // Changing count / size variation re-initializes balls
  bindRange('count', 'countVal', (v) => String(v), (v) => {
    settings.count = v;
    initBalls();
  });
  bindRange('sizeVar', 'sizeVarVal', (v) => String(v), (v) => {
    settings.sizeVar = v;
    initBalls();
  });

  // Live: no reset
  bindRange('bounce', 'bounceVal', (v) => v.toFixed(2), (v) => { settings.bounce = v; });
  bindRange('gravAngle', 'gravAngleVal', (v) => `${v}° ${gravityArrow(v)}`, (v) => { settings.gravAngle = v; });
  bindRange('gravStrength', 'gravStrengthVal', (v) => String(v), (v) => { settings.gravStrength = v; });
  bindRange('timeScale', 'timeScaleVal', (v) => v.toFixed(1) + '×', (v) => { settings.timeScale = v; });

  $('collisions').addEventListener('change', (e) => { settings.collisions = e.target.checked; });
  $('trails').addEventListener('change', (e) => { settings.trails = e.target.checked; });

  $('explode').addEventListener('click', () => {
    for (const b of balls) {
      const a = Math.random() * TAU;
      const s = 300 + Math.random() * 500; // 300–800
      b.vx += Math.cos(a) * s;
      b.vy += Math.sin(a) * s;
    }
  });

  /* ---------- Collapsible sections ---------- */
  document.querySelectorAll('.section-header').forEach((header) => {
    header.addEventListener('click', () => {
      const section = header.parentElement;
      const collapsed = section.classList.toggle('collapsed');
      header.setAttribute('aria-expanded', String(!collapsed));
      hideTip();
    });
  });

  /* ---------- Tooltips (real DOM element, positioned with JS) ---------- */
  const tooltip = $('tooltip');
  const panel = $('panel');

  function showTip(el) {
    tooltip.textContent = el.dataset.tip || '';
    // reset to origin first so shrink-to-fit width/height measure correctly
    tooltip.style.left = '0px';
    tooltip.style.top = '0px';

    const r = el.getBoundingClientRect();
    const pr = panel.getBoundingClientRect();
    const tw = tooltip.offsetWidth;
    const th = tooltip.offsetHeight;

    // to the right of the control, clear of the panel edge
    let left = Math.max(r.right, pr.right) + 10;
    if (left + tw > window.innerWidth - 8) {
      left = Math.max(8, r.left - tw - 10); // fall back to the left side
    }
    let top = r.top + r.height / 2 - th / 2;
    top = Math.min(Math.max(8, top), window.innerHeight - th - 8);

    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
    tooltip.classList.add('visible');
  }

  function hideTip() {
    tooltip.classList.remove('visible');
  }

  document.querySelectorAll('[data-tip]').forEach((el) => {
    el.addEventListener('mouseenter', () => showTip(el));
    el.addEventListener('mouseleave', hideTip);
  });
  panel.addEventListener('scroll', hideTip);

  /* =====================================================================
   *  Main loop
   * ===================================================================== */
  window.addEventListener('resize', resize);

  resize();
  initBalls();

  let last = performance.now();
  function frame(now) {
    const rawDt = Math.min((now - last) / 1000, MAX_FRAME_DT);
    last = now;

    step(rawDt * settings.timeScale);
    render();

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
