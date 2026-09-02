// ==========================================================================
// Polygon Physics Playground — vanilla JS 2D physics simulation
// ==========================================================================

(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // Canvas setup
  // ---------------------------------------------------------------------
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');

  let width = 0, height = 0;
  const center = { x: 0, y: 0 };
  let circumradius = 0;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    center.x = width / 2;
    center.y = height / 2;
    circumradius = Math.min(width, height) * 0.38;
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------------------------------------------------------------------
  // Simulation state (driven by the control panel)
  // ---------------------------------------------------------------------
  const state = {
    sides: 8,
    spin: 0.6,          // rad/s
    count: 40,
    sizeVar: 15,
    bounce: 0.75,        // wall restitution
    collisions: true,
    gravityAngle: 0,     // degrees, 0 = down
    gravityStrength: 500,
    timeScale: 1,
    trails: false,
  };

  const SUBSTEPS = 5;
  const DAMPING = 0.999;       // per-substep velocity damping
  const BALL_RESTITUTION = 0.9; // ball-to-ball restitution (fixed)
  const BASE_RADIUS = 6;

  let rotation = 0; // polygon rotation angle, radians
  let balls = [];

  // ---------------------------------------------------------------------
  // Polygon geometry helpers
  // ---------------------------------------------------------------------
  function getApothem() {
    return circumradius * Math.cos(Math.PI / state.sides);
  }

  function computePolygonVertices() {
    const verts = [];
    const n = state.sides;
    for (let i = 0; i < n; i++) {
      const ang = rotation + (i * 2 * Math.PI) / n - Math.PI / 2;
      verts.push({
        x: center.x + circumradius * Math.cos(ang),
        y: center.y + circumradius * Math.sin(ang),
      });
    }
    return verts;
  }

  // ---------------------------------------------------------------------
  // Ball creation
  // ---------------------------------------------------------------------
  function randomBallColor() {
    const hue = Math.random() * 360;
    return {
      hue,
      color: `hsl(${hue}, 85%, 58%)`,
      colorLight: `hsla(${hue}, 90%, 72%, 0.55)`,
    };
  }

  function initBalls() {
    balls = [];
    const apothem = getApothem();

    for (let i = 0; i < state.count; i++) {
      const radius = BASE_RADIUS + Math.random() * state.sizeVar;
      const maxR = Math.max(apothem - radius - 2, 2);

      let x, y, attempt = 0, ok = false;
      do {
        const ang = Math.random() * Math.PI * 2;
        const r = Math.random() * maxR;
        x = center.x + Math.cos(ang) * r;
        y = center.y + Math.sin(ang) * r;
        ok = true;
        for (let j = 0; j < balls.length; j++) {
          const b = balls[j];
          const dx = x - b.x, dy = y - b.y;
          if (Math.hypot(dx, dy) < radius + b.radius) { ok = false; break; }
        }
        attempt++;
      } while (!ok && attempt < 60);

      const c = randomBallColor();
      balls.push({
        x, y,
        vx: (Math.random() - 0.5) * 120,
        vy: (Math.random() - 0.5) * 120,
        radius,
        mass: radius * radius,
        ...c,
      });
    }
  }

  // ---------------------------------------------------------------------
  // Gravity
  // ---------------------------------------------------------------------
  function gravityVector() {
    const rad = (state.gravityAngle * Math.PI) / 180;
    return {
      gx: -Math.sin(rad) * state.gravityStrength,
      gy: Math.cos(rad) * state.gravityStrength,
    };
  }

  function arrowForAngle(deg) {
    const arrows = ['↓', '↙', '←', '↖', '↑', '↗', '→', '↘'];
    const idx = (Math.round(deg / 45) % 8 + 8) % 8;
    return arrows[idx];
  }

  // ---------------------------------------------------------------------
  // Wall (edge-based) collision resolution
  // ---------------------------------------------------------------------
  function resolveWalls() {
    const verts = computePolygonVertices();
    const n = verts.length;
    const spin = state.spin;

    for (let bi = 0; bi < balls.length; bi++) {
      const b = balls[bi];

      for (let i = 0; i < n; i++) {
        const v1 = verts[i];
        const v2 = verts[(i + 1) % n];

        const ex = v2.x - v1.x, ey = v2.y - v1.y;
        const len = Math.hypot(ex, ey) || 1;
        const tx = ex / len, ty = ey / len;

        // perpendicular candidate normal
        let nx = -ty, ny = tx;
        // ensure it points toward the polygon interior
        const toCx = center.x - v1.x, toCy = center.y - v1.y;
        if (nx * toCx + ny * toCy < 0) { nx = -nx; ny = -ny; }

        const dx = b.x - v1.x, dy = b.y - v1.y;
        const signedDist = dx * nx + dy * ny; // distance along inward normal

        if (signedDist < b.radius) {
          const penetration = b.radius - signedDist;
          b.x += nx * penetration;
          b.y += ny * penetration;

          // velocity of the wall at the contact point due to rotation
          const rx = b.x - center.x, ry = b.y - center.y;
          const wallVx = -spin * ry;
          const wallVy = spin * rx;

          let relVx = b.vx - wallVx;
          let relVy = b.vy - wallVy;
          const vn = relVx * nx + relVy * ny;

          if (vn < 0) {
            const restitution = state.bounce;
            relVx -= (1 + restitution) * vn * nx;
            relVy -= (1 + restitution) * vn * ny;
            b.vx = relVx + wallVx;
            b.vy = relVy + wallVy;
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------
  // Ball-ball collision resolution (mass-based impulse + separation)
  // ---------------------------------------------------------------------
  function resolveBallCollisions() {
    const n = balls.length;
    for (let i = 0; i < n; i++) {
      const a = balls[i];
      for (let j = i + 1; j < n; j++) {
        const b = balls[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const minDist = a.radius + b.radius;
        if (dist >= minDist) continue;

        let nx, ny, d = dist;
        if (d === 0) { nx = 1; ny = 0; d = 0.01; }
        else { nx = dx / d; ny = dy / d; }

        const overlap = minDist - d;
        const totalMass = a.mass + b.mass;
        const moveA = overlap * (b.mass / totalMass);
        const moveB = overlap * (a.mass / totalMass);
        a.x -= nx * moveA; a.y -= ny * moveA;
        b.x += nx * moveB; b.y += ny * moveB;

        const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
        const velAlongNormal = rvx * nx + rvy * ny;
        if (velAlongNormal >= 0) continue;

        const e = BALL_RESTITUTION;
        const jImpulse = -(1 + e) * velAlongNormal / (1 / a.mass + 1 / b.mass);
        const ix = jImpulse * nx, iy = jImpulse * ny;

        a.vx -= ix / a.mass; a.vy -= iy / a.mass;
        b.vx += ix / b.mass; b.vy += iy / b.mass;
      }
    }
  }

  // ---------------------------------------------------------------------
  // Physics substep
  // ---------------------------------------------------------------------
  function substep(dt) {
    if (dt <= 0) return;

    rotation += state.spin * dt;
    const { gx, gy } = gravityVector();

    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      b.vx += gx * dt;
      b.vy += gy * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vx *= DAMPING;
      b.vy *= DAMPING;
    }

    resolveWalls();
    if (state.collisions) resolveBallCollisions();
    // re-constrain after ball-ball resolution so nothing escapes the frame
    resolveWalls();
  }

  // ---------------------------------------------------------------------
  // Explode effect
  // ---------------------------------------------------------------------
  function explode() {
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      const ang = Math.random() * Math.PI * 2;
      const mag = 300 + Math.random() * 500;
      b.vx += Math.cos(ang) * mag;
      b.vy += Math.sin(ang) * mag;
    }
  }

  // ---------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------
  function drawBackgroundGlow() {
    const grad = ctx.createRadialGradient(
      center.x, center.y, 0,
      center.x, center.y, circumradius * 1.4
    );
    grad.addColorStop(0, 'rgba(100, 200, 255, 0.10)');
    grad.addColorStop(1, 'rgba(100, 200, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }

  function drawPolygon() {
    const verts = computePolygonVertices();

    ctx.save();
    ctx.beginPath();
    verts.forEach((v, i) => (i === 0 ? ctx.moveTo(v.x, v.y) : ctx.lineTo(v.x, v.y)));
    ctx.closePath();
    ctx.strokeStyle = 'rgba(100, 200, 255, 0.9)';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = 'rgba(100, 200, 255, 0.85)';
    ctx.shadowBlur = 22;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    for (let i = 0; i < verts.length; i++) {
      const v = verts[i];
      ctx.beginPath();
      ctx.arc(v.x, v.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(160, 225, 255, 0.95)';
      ctx.shadowColor = 'rgba(100, 200, 255, 0.9)';
      ctx.shadowBlur = 12;
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBalls() {
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];

      // glow
      const glowR = b.radius * 1.8;
      const grad = ctx.createRadialGradient(
        b.x - b.radius * 0.25, b.y - b.radius * 0.25, b.radius * 0.1,
        b.x, b.y, glowR
      );
      grad.addColorStop(0, b.colorLight);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.beginPath();
      ctx.arc(b.x, b.y, glowR, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // solid ball
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fillStyle = b.color;
      ctx.fill();

      // highlight dot
      ctx.beginPath();
      ctx.arc(b.x - b.radius * 0.32, b.y - b.radius * 0.32, Math.max(b.radius * 0.22, 1), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fill();
    }
  }

  function render() {
    if (state.trails) {
      ctx.fillStyle = 'rgba(10, 10, 15, 0.15)';
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#0a0a0f';
      ctx.fillRect(0, 0, width, height);
    }

    drawBackgroundGlow();
    drawPolygon();
    drawBalls();
  }

  // ---------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------
  let lastTime = performance.now();
  function animate(now) {
    requestAnimationFrame(animate);
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    dt = Math.min(dt, 0.033); // clamp for stability on tab-switch etc.

    const scaledDt = dt * state.timeScale;
    const subDt = scaledDt / SUBSTEPS;

    for (let s = 0; s < SUBSTEPS; s++) substep(subDt);

    render();
  }

  // ---------------------------------------------------------------------
  // Control panel wiring
  // ---------------------------------------------------------------------
  const SHAPE_NAMES = {
    3: 'Triangle', 4: 'Square', 5: 'Pentagon', 6: 'Hexagon',
    7: 'Heptagon', 8: 'Octagon', 9: 'Nonagon', 10: 'Decagon',
    11: 'Hendecagon', 12: 'Dodecagon',
  };
  function shapeName(n) {
    return SHAPE_NAMES[n] || `${n}-gon`;
  }

  const el = (id) => document.getElementById(id);

  const sidesRange = el('sidesRange');
  const sidesValue = el('sidesValue');
  const sidesName = el('sidesName');
  const spinRange = el('spinRange');
  const spinValue = el('spinValue');

  const countRange = el('countRange');
  const countValue = el('countValue');
  const sizeVarRange = el('sizeVarRange');
  const sizeVarValue = el('sizeVarValue');
  const bounceRange = el('bounceRange');
  const bounceValue = el('bounceValue');
  const collisionsToggle = el('collisionsToggle');

  const gravityAngleRange = el('gravityAngleRange');
  const gravityAngleValue = el('gravityAngleValue');
  const gravityStrengthRange = el('gravityStrengthRange');
  const gravityStrengthValue = el('gravityStrengthValue');
  const timeScaleRange = el('timeScaleRange');
  const timeScaleValue = el('timeScaleValue');

  const trailsToggle = el('trailsToggle');
  const explodeBtn = el('explodeBtn');

  sidesRange.addEventListener('input', (e) => {
    state.sides = parseInt(e.target.value, 10);
    sidesValue.textContent = state.sides;
    sidesName.textContent = shapeName(state.sides);
    initBalls();
  });

  spinRange.addEventListener('input', (e) => {
    state.spin = parseFloat(e.target.value);
    spinValue.textContent = state.spin.toFixed(2);
  });

  countRange.addEventListener('input', (e) => {
    state.count = parseInt(e.target.value, 10);
    countValue.textContent = state.count;
    initBalls();
  });

  sizeVarRange.addEventListener('input', (e) => {
    state.sizeVar = parseInt(e.target.value, 10);
    sizeVarValue.textContent = state.sizeVar;
    initBalls();
  });

  bounceRange.addEventListener('input', (e) => {
    state.bounce = parseFloat(e.target.value);
    bounceValue.textContent = state.bounce.toFixed(2);
  });

  collisionsToggle.addEventListener('change', (e) => {
    state.collisions = e.target.checked;
  });

  gravityAngleRange.addEventListener('input', (e) => {
    state.gravityAngle = parseInt(e.target.value, 10);
    gravityAngleValue.textContent = `${arrowForAngle(state.gravityAngle)} ${state.gravityAngle}°`;
  });

  gravityStrengthRange.addEventListener('input', (e) => {
    state.gravityStrength = parseInt(e.target.value, 10);
    gravityStrengthValue.textContent = state.gravityStrength;
  });

  timeScaleRange.addEventListener('input', (e) => {
    state.timeScale = parseFloat(e.target.value);
    timeScaleValue.textContent = `${state.timeScale.toFixed(1)}×`;
  });

  trailsToggle.addEventListener('change', (e) => {
    state.trails = e.target.checked;
  });

  explodeBtn.addEventListener('click', explode);

  // ---- Collapsible sections ----
  document.querySelectorAll('.section-header').forEach((header) => {
    header.addEventListener('click', () => {
      header.parentElement.classList.toggle('collapsed');
    });
  });

  // ---- Tooltips: real DOM element positioned via JS (not CSS pseudo-el) ----
  const tooltip = el('tooltip');
  const panel = el('panel');

  document.querySelectorAll('[data-tooltip]').forEach((node) => {
    node.addEventListener('mouseenter', () => {
      tooltip.textContent = node.getAttribute('data-tooltip');
      tooltip.classList.add('visible');

      const rect = node.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();

      let left = panelRect.right + 12;
      let top = rect.top;

      tooltip.style.left = left + 'px';
      tooltip.style.top = top + 'px';

      // clamp within viewport after layout
      requestAnimationFrame(() => {
        const tRect = tooltip.getBoundingClientRect();
        let adjTop = top;
        let adjLeft = left;
        if (tRect.bottom > window.innerHeight - 8) {
          adjTop = Math.max(8, window.innerHeight - tRect.height - 8);
        }
        if (tRect.right > window.innerWidth - 8) {
          adjLeft = Math.max(8, rect.left - tRect.width - 12);
        }
        tooltip.style.top = adjTop + 'px';
        tooltip.style.left = adjLeft + 'px';
      });
    });

    node.addEventListener('mouseleave', () => {
      tooltip.classList.remove('visible');
    });
  });

  // ---------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------
  sidesName.textContent = shapeName(state.sides);
  initBalls();
  lastTime = performance.now();
  requestAnimationFrame(animate);
})();
