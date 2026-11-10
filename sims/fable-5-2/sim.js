'use strict';

/*
 * Spinning-polygon physics sim.
 *
 * Simulation coordinates are relative to the polygon's centre (the origin).
 * That keeps the rotation maths simple: the wall's velocity at a point p is
 * omega × p = omega * (-p.y, p.x). The renderer translates to mid-canvas.
 */
(() => {
  // ── Tunables ────────────────────────────────────────────────────────────
  const TAU = Math.PI * 2;
  const SUBSTEPS = 5;            // physics substeps per rendered frame
  const MAX_FRAME_DT = 1 / 30;   // clamp long frames (tab switches, hitches)
  const BASE_RADIUS = 6;         // every ball is at least this big
  const BALL_RESTITUTION = 0.9;  // ball-vs-ball bounce (the slider drives walls only)
  const WALL_FRICTION = 0.5;     // how strongly the spinning walls drag balls sideways
  const AIR_DRAG = 0.12;         // velocity damping, per second
  const MAX_SPEED = 3000;        // safety cap in px/s (bounciness > 1 adds energy)
  const POLY_SCALE = 0.38;       // circumradius as a fraction of the short viewport side
  const WALL_WIDTH = 3;
  const MAX_SIDES = 20;
  const MAX_DPR = 2;

  const BG = '#0a0a0f';
  const TRAIL_FADE = 'rgba(10, 10, 15, 0.2)'; // the scene's near-black, mostly transparent
  const ACCENT = '100, 200, 255';

  const SHAPE_NAMES = {
    3: 'Triangle', 4: 'Square', 5: 'Pentagon', 6: 'Hexagon', 7: 'Heptagon',
    8: 'Octagon', 9: 'Nonagon', 10: 'Decagon', 11: 'Hendecagon', 12: 'Dodecagon',
    13: 'Tridecagon', 14: 'Tetradecagon', 15: 'Pentadecagon', 16: 'Hexadecagon',
    17: 'Heptadecagon', 18: 'Octadecagon', 19: 'Enneadecagon', 20: 'Icosagon',
  };

  // Indexed by gravity angle in 45° steps: 0° = down, 90° = left, 180° = up, 270° = right.
  const ARROWS = ['↓', '↙', '←', '↖', '↑', '↗', '→', '↘'];

  // ── State ───────────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');

  // Overwritten from the DOM controls at startup; the HTML holds the defaults.
  const state = {
    sides: 8,
    spin: 0.8,          // rad/s, positive = clockwise on screen
    count: 40,
    sizeVar: 14,
    bounce: 0.85,       // wall restitution
    collisions: true,
    gravityAngle: 0,    // degrees
    gravity: 800,       // px/s²
    timeScale: 1,
    trails: false,
  };

  const view = { w: 0, h: 0, cx: 0, cy: 0, dpr: 1 };
  const poly = { radius: 0, rotation: -Math.PI / 2 };

  // Preallocated so the physics loop never allocates.
  const verts = Array.from({ length: MAX_SIDES }, () => ({ x: 0, y: 0 }));
  const edges = Array.from({ length: MAX_SIDES }, () => ({ ax: 0, ay: 0, nx: 0, ny: 0 }));

  const balls = [];
  let flash = 0; // 1 → 0 after an explosion, brightens the backdrop

  // ── Geometry ────────────────────────────────────────────────────────────

  function resize() {
    view.dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    view.w = window.innerWidth;
    view.h = window.innerHeight;
    view.cx = view.w / 2;
    view.cy = view.h / 2;

    canvas.width = Math.round(view.w * view.dpr);
    canvas.height = Math.round(view.h * view.dpr);
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, view.w, view.h);

    // Scale ball positions with the polygon so they stay inside it.
    const newRadius = Math.max(60, Math.min(view.w, view.h) * POLY_SCALE);
    if (poly.radius > 0) {
      const k = newRadius / poly.radius;
      for (const b of balls) {
        b.x *= k;
        b.y *= k;
      }
    }
    poly.radius = newRadius;
  }

  // Recompute the vertices and, for each edge, a point on it plus its inward unit normal.
  function updatePolygon() {
    const n = state.sides;
    const R = poly.radius;

    for (let i = 0; i < n; i++) {
      const a = poly.rotation + (i / n) * TAU;
      verts[i].x = Math.cos(a) * R;
      verts[i].y = Math.sin(a) * R;
    }

    for (let i = 0; i < n; i++) {
      const a = verts[i];
      const b = verts[(i + 1) % n];
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const len = Math.hypot(ex, ey) || 1;

      let nx = -ey / len;
      let ny = ex / len;
      // The centre is the origin, so the vector from a to the centre is -a.
      // Flip the normal if it points away from the centre.
      if (nx * -a.x + ny * -a.y < 0) {
        nx = -nx;
        ny = -ny;
      }

      const e = edges[i];
      e.ax = a.x;
      e.ay = a.y;
      e.nx = nx;
      e.ny = ny;
    }
  }

  // ── Balls ───────────────────────────────────────────────────────────────

  function initBalls() {
    balls.length = 0;

    // Spawn inside the inscribed circle (apothem), which fits inside every
    // regular polygon. The circumradius would put balls outside a triangle.
    const apothem = poly.radius * Math.cos(Math.PI / state.sides);
    const maxRadius = Math.max(2, apothem * 0.45); // only matters in tiny windows
    const hueOffset = Math.random() * 360;

    for (let i = 0; i < state.count; i++) {
      const r = Math.min(BASE_RADIUS + Math.random() * state.sizeVar, maxRadius);
      const spawnRadius = Math.max(0, apothem - r - 1);
      const angle = Math.random() * TAU;
      const dist = Math.sqrt(Math.random()) * spawnRadius; // sqrt → uniform over the disc
      const hue = Math.round((hueOffset + i * 137.508) % 360); // golden-angle spread
      const mass = r * r; // proportional to area

      balls.push({
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        vx: (Math.random() - 0.5) * 300,
        vy: (Math.random() - 0.5) * 300,
        r,
        invMass: 1 / mass,
        color: `hsl(${hue}, 85%, 60%)`,
        glowInner: `hsla(${hue}, 100%, 62%, 0.42)`,
        glowOuter: `hsla(${hue}, 100%, 62%, 0)`,
      });
    }
  }

  function explode() {
    for (const b of balls) {
      const angle = Math.random() * TAU;
      const speed = 300 + Math.random() * 500;
      b.vx += Math.cos(angle) * speed;
      b.vy += Math.sin(angle) * speed;
    }
    flash = 1;
  }

  // ── Physics ─────────────────────────────────────────────────────────────

  /*
   * Keep one ball inside the polygon. For each edge, the signed distance from
   * the ball's centre to the edge line (positive = inside) must be at least
   * the ball's radius. A convex polygon is the intersection of its edges'
   * half-planes, so this is exact for any side count, and a ball that somehow
   * ends up outside is still pushed back in.
   */
  function constrainToPolygon(b, restSpeed) {
    const n = state.sides;
    const omega = state.spin;

    for (let i = 0; i < n; i++) {
      const e = edges[i];
      const dist = (b.x - e.ax) * e.nx + (b.y - e.ay) * e.ny;
      if (dist >= b.r) continue;

      // Push the ball inward along the edge normal.
      const penetration = b.r - dist;
      b.x += e.nx * penetration;
      b.y += e.ny * penetration;

      // Velocity of the spinning wall at the contact point: omega × p.
      const px = b.x - e.nx * b.r;
      const py = b.y - e.ny * b.r;
      const wallVx = -omega * py;
      const wallVy = omega * px;

      // Resolve the bounce in the wall's frame of reference.
      const relVx = b.vx - wallVx;
      const relVy = b.vy - wallVy;
      const vn = relVx * e.nx + relVy * e.ny;
      if (vn >= 0) continue; // already separating from the wall

      const tx = -e.ny;
      const ty = e.nx;
      const vt = relVx * tx + relVy * ty;

      // Approach speeds no bigger than what gravity adds in a step are
      // resting contact, not a bounce. Don't bounce those.
      const restitution = -vn < restSpeed ? 0 : state.bounce;
      const normalKick = -(1 + restitution) * vn;

      // Friction pulls the ball's tangential velocity toward the wall's,
      // limited by how hard the ball pressed into the wall. This is what
      // lets the frame drag and fling balls.
      const maxDrag = WALL_FRICTION * normalKick;
      const tangentKick = Math.max(-maxDrag, Math.min(maxDrag, -vt));

      b.vx += e.nx * normalKick + tx * tangentKick;
      b.vy += e.ny * normalKick + ty * tangentKick;
    }
  }

  function collideBalls(restSpeed) {
    const count = balls.length;

    for (let i = 0; i < count; i++) {
      const a = balls[i];

      for (let j = i + 1; j < count; j++) {
        const b = balls[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const minDist = a.r + b.r;
        const distSq = dx * dx + dy * dy;
        if (distSq >= minDist * minDist) continue;

        let dist = Math.sqrt(distSq);
        let nx;
        let ny;
        if (dist > 1e-6) {
          nx = dx / dist;
          ny = dy / dist;
        } else {
          // Exactly coincident: pick an arbitrary separation axis.
          const angle = Math.random() * TAU;
          nx = Math.cos(angle);
          ny = Math.sin(angle);
          dist = 0;
        }

        const invSum = a.invMass + b.invMass;

        // Separate: the lighter ball moves further.
        const overlap = minDist - dist;
        const moveA = overlap * (a.invMass / invSum);
        const moveB = overlap * (b.invMass / invSum);
        a.x -= nx * moveA;
        a.y -= ny * moveA;
        b.x += nx * moveB;
        b.y += ny * moveB;

        // Impulse along the contact normal, only if the pair is approaching.
        const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (vn >= 0) continue;

        const restitution = -vn < restSpeed ? 0 : BALL_RESTITUTION;
        const impulse = (-(1 + restitution) * vn) / invSum;
        a.vx -= impulse * a.invMass * nx;
        a.vy -= impulse * a.invMass * ny;
        b.vx += impulse * b.invMass * nx;
        b.vy += impulse * b.invMass * ny;
      }
    }
  }

  function step(dt) {
    poly.rotation = (poly.rotation + state.spin * dt) % TAU;
    updatePolygon();

    // 0° pulls down the screen, 90° left, 180° up, 270° right.
    const angle = (state.gravityAngle * Math.PI) / 180;
    const gx = -Math.sin(angle) * state.gravity;
    const gy = Math.cos(angle) * state.gravity;

    const damping = Math.exp(-AIR_DRAG * dt);
    const restSpeed = 2.5 * state.gravity * dt;
    const maxSpeedSq = MAX_SPEED * MAX_SPEED;

    for (const b of balls) {
      b.vx = (b.vx + gx * dt) * damping;
      b.vy = (b.vy + gy * dt) * damping;

      const speedSq = b.vx * b.vx + b.vy * b.vy;
      if (speedSq > maxSpeedSq) {
        const k = MAX_SPEED / Math.sqrt(speedSq);
        b.vx *= k;
        b.vy *= k;
      }

      b.x += b.vx * dt;
      b.y += b.vy * dt;
      constrainToPolygon(b, restSpeed);
    }

    if (state.collisions) {
      collideBalls(restSpeed);
      // Separation can shove a ball through a wall, so constrain again.
      for (const b of balls) constrainToPolygon(b, restSpeed);
    }
  }

  // ── Rendering ───────────────────────────────────────────────────────────

  function drawBackdrop() {
    const { cx, cy } = view;
    const radius = poly.radius * 1.7;
    // With trails on, this glow is layered every frame and builds up, so draw it fainter.
    const alpha = (0.09 + flash * 0.22) * (state.trails ? 0.3 : 1);

    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    glow.addColorStop(0, `rgba(${ACCENT}, ${alpha.toFixed(4)})`);
    glow.addColorStop(0.55, `rgba(${ACCENT}, ${(alpha * 0.35).toFixed(4)})`);
    glow.addColorStop(1, `rgba(${ACCENT}, 0)`);

    ctx.fillStyle = glow;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  }

  function drawPolygon() {
    const n = state.sides;
    // Move the stroke's centreline outward by half its width, so the inner
    // edge of the drawn frame is exactly the collision boundary.
    const outset = WALL_WIDTH / 2 / Math.cos(Math.PI / n);
    const k = (poly.radius + outset) / poly.radius;

    ctx.save();
    ctx.translate(view.cx, view.cy);

    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = verts[i].x * k;
      const y = verts[i].y * k;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();

    // shadowBlur ignores the canvas transform, so scale it for HiDPI by hand.
    ctx.shadowColor = `rgba(${ACCENT}, 0.9)`;
    ctx.shadowBlur = 22 * view.dpr;
    ctx.lineJoin = 'round';
    ctx.lineWidth = WALL_WIDTH;
    ctx.strokeStyle = `rgba(${ACCENT}, 0.95)`;
    ctx.stroke();

    ctx.shadowBlur = 14 * view.dpr;
    ctx.fillStyle = '#e8f7ff';
    for (let i = 0; i < n; i++) {
      ctx.beginPath();
      ctx.arc(verts[i].x * k, verts[i].y * k, 4.5, 0, TAU);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawBalls() {
    const { cx, cy } = view;

    // Glows first, so no ball's glow is painted over another ball's body.
    for (const b of balls) {
      const x = cx + b.x;
      const y = cy + b.y;
      const glowRadius = b.r * 2.3;

      const glow = ctx.createRadialGradient(x, y, b.r * 0.5, x, y, glowRadius);
      glow.addColorStop(0, b.glowInner);
      glow.addColorStop(1, b.glowOuter);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, glowRadius, 0, TAU);
      ctx.fill();
    }

    for (const b of balls) {
      const x = cx + b.x;
      const y = cy + b.y;

      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(x, y, b.r, 0, TAU);
      ctx.fill();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.beginPath();
      ctx.arc(x - b.r * 0.32, y - b.r * 0.32, Math.max(1, b.r * 0.2), 0, TAU);
      ctx.fill();
    }
  }

  function render() {
    // Trails: instead of clearing, lay a mostly transparent dark rect over
    // the previous frame so old positions fade out over several frames.
    ctx.fillStyle = state.trails ? TRAIL_FADE : BG;
    ctx.fillRect(0, 0, view.w, view.h);

    updatePolygon(); // keeps vertices fresh while paused, or after a resize / sides change
    drawBackdrop();
    drawPolygon();
    drawBalls();
  }

  // ── Main loop ───────────────────────────────────────────────────────────

  let lastTime = 0;

  function frame(now) {
    const frameDt = lastTime ? Math.min((now - lastTime) / 1000, MAX_FRAME_DT) : 0;
    lastTime = now;

    const dt = (frameDt * state.timeScale) / SUBSTEPS;
    if (dt > 0) {
      for (let i = 0; i < SUBSTEPS; i++) step(dt);
    }

    flash = Math.max(0, flash - frameDt * 3);
    render();
    requestAnimationFrame(frame);
  }

  // ── Controls ────────────────────────────────────────────────────────────

  const signed = (v) => (v === 0 ? '0.00' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`);

  // `reinit` sliders respawn every ball; the rest take effect on the next physics step.
  const SLIDERS = [
    {
      id: 'sides',
      reinit: true,
      format: (v) => String(v),
      onChange: (v) => { $('shapeName').textContent = SHAPE_NAMES[v] || `${v}-gon`; },
    },
    { id: 'spin', format: signed },
    { id: 'count', reinit: true, format: (v) => String(v) },
    { id: 'sizeVar', reinit: true, format: (v) => String(v) },
    { id: 'bounce', format: (v) => v.toFixed(2) },
    {
      id: 'gravityAngle',
      format: (v) => `${v}°`,
      onChange: (v) => { $('gravityArrow').textContent = ARROWS[Math.round(v / 45) % 8]; },
    },
    { id: 'gravity', format: (v) => (v === 0 ? 'Zero-G' : String(v)) },
    { id: 'timeScale', format: (v) => `${v.toFixed(2)}×` },
  ];

  function bindSliders() {
    for (const slider of SLIDERS) {
      const input = $(slider.id);
      const output = $(`${slider.id}Value`);
      const min = Number(input.min);
      const max = Number(input.max);

      const apply = (fromUser) => {
        const value = parseFloat(input.value);
        state[slider.id] = value;
        output.textContent = slider.format(value);
        input.style.setProperty('--fill', `${((value - min) / (max - min)) * 100}%`);
        if (slider.onChange) slider.onChange(value);
        if (fromUser && slider.reinit) initBalls();
      };

      input.addEventListener('input', () => apply(true));
      apply(false);
    }
  }

  function bindToggle(id) {
    const input = $(id);
    const apply = () => { state[id] = input.checked; };
    input.addEventListener('change', apply);
    apply();
  }

  function bindSections() {
    document.querySelectorAll('.card-header').forEach((header) => {
      header.addEventListener('click', () => {
        const collapsed = header.closest('.card').classList.toggle('collapsed');
        header.setAttribute('aria-expanded', String(!collapsed));
      });
    });
  }

  // ── Tooltips ────────────────────────────────────────────────────────────
  // The tooltip is one real element that lives outside the panel, placed with
  // getBoundingClientRect, so the panel's overflow can't clip it.

  const panel = $('panel');
  const tooltip = $('tooltip');
  let tipTarget = null;

  function positionTip() {
    if (!tipTarget) return;
    const GAP = 14;
    const MARGIN = 8;

    const target = tipTarget.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const tipW = tooltip.offsetWidth;
    const tipH = tooltip.offsetHeight;
    const midY = target.top + target.height / 2;

    // To the right of the control, and clear of the panel's edge.
    let left = Math.max(target.right, panelRect.right) + GAP;
    let top = midY - tipH / 2;
    let beside = true;

    if (left + tipW > window.innerWidth - MARGIN) {
      // No room beside it (narrow viewport): go below, or above if needed.
      beside = false;
      left = Math.max(MARGIN, Math.min(target.left, window.innerWidth - tipW - MARGIN));
      top = target.bottom + 6;
      if (top + tipH > window.innerHeight - MARGIN) top = target.top - tipH - 6;
    }

    top = Math.max(MARGIN, Math.min(top, window.innerHeight - tipH - MARGIN));

    tooltip.classList.toggle('no-arrow', !beside);
    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;
    // Keep the arrow level with the control even when the tooltip was clamped.
    tooltip.style.setProperty('--arrow-y', `${Math.max(12, Math.min(tipH - 12, midY - top))}px`);
  }

  function showTip(el) {
    tipTarget = el;
    tooltip.textContent = el.dataset.tip;
    positionTip();
    tooltip.classList.add('visible');
  }

  function hideTip() {
    tipTarget = null;
    tooltip.classList.remove('visible');
  }

  function bindTooltips() {
    document.querySelectorAll('[data-tip]').forEach((el) => {
      el.addEventListener('mouseenter', () => showTip(el));
      el.addEventListener('mouseleave', () => { if (tipTarget === el) hideTip(); });
      // Keyboard users get the tooltip on focus.
      el.addEventListener('focusin', (event) => {
        if (event.target.matches(':focus-visible')) showTip(el);
      });
      el.addEventListener('focusout', () => { if (tipTarget === el) hideTip(); });
    });

    // Follow the control while the panel scrolls; hide once it scrolls out of view.
    panel.addEventListener('scroll', () => {
      if (!tipTarget) return;
      const target = tipTarget.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      if (target.bottom < panelRect.top || target.top > panelRect.bottom) hideTip();
      else positionTip();
    }, { passive: true });

    window.addEventListener('resize', hideTip);
  }

  // ── Boot ────────────────────────────────────────────────────────────────

  resize();
  window.addEventListener('resize', resize);

  bindSliders();
  bindToggle('collisions');
  bindToggle('trails');
  bindSections();
  bindTooltips();
  $('explode').addEventListener('click', explode);

  initBalls();
  requestAnimationFrame(frame);
})();
