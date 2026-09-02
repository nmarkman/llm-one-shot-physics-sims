(() => {
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');

  let W = 0, H = 0;
  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- State ----------
  const state = {
    sides: 8,
    spin: 0.5,          // rad/s
    count: 40,
    sizeVar: 14,
    bounce: 0.85,
    collisions: true,
    gAngle: 90,         // degrees, 90 = down
    gStrength: 600,
    timeScale: 1.0,
    trails: false,
    rotation: 0,
    balls: []
  };

  const BASE_SIZE = 6;

  function polygonRadius() {
    // Circumradius: fit inside viewport with margin
    return Math.min(W, H) * 0.42;
  }
  function apothem(R, sides) {
    return R * Math.cos(Math.PI / sides);
  }
  function center() { return { x: W / 2, y: H / 2 }; }

  function polygonVertices(sides, R, rot) {
    const c = center();
    const verts = [];
    // Start at -PI/2 so top vertex points up-ish
    for (let i = 0; i < sides; i++) {
      const a = rot - Math.PI / 2 + (i * 2 * Math.PI) / sides;
      verts.push({ x: c.x + R * Math.cos(a), y: c.y + R * Math.sin(a) });
    }
    return verts;
  }

  // ---------- Balls ----------
  function randomColor() {
    const h = Math.floor(Math.random() * 360);
    return `hsl(${h}, 85%, 60%)`;
  }

  function initBalls() {
    state.balls = [];
    const R = polygonRadius();
    const ap = apothem(R, state.sides);
    const c = center();
    for (let i = 0; i < state.count; i++) {
      const r = BASE_SIZE + Math.random() * state.sizeVar;
      // spawn within apothem circle to be safely inside any polygon
      const maxR = Math.max(0, ap - r - 2);
      const a = Math.random() * Math.PI * 2;
      const dist = Math.sqrt(Math.random()) * maxR;
      state.balls.push({
        x: c.x + Math.cos(a) * dist,
        y: c.y + Math.sin(a) * dist,
        vx: (Math.random() - 0.5) * 200,
        vy: (Math.random() - 0.5) * 200,
        r,
        m: r * r,
        color: randomColor()
      });
    }
  }

  // ---------- Physics ----------
  function gravityVec() {
    const a = (state.gAngle * Math.PI) / 180;
    return { x: Math.cos(a) * state.gStrength, y: Math.sin(a) * state.gStrength };
  }

  // Constrain a ball to be inside a polygon (uses edge normals)
  function constrainBall(b, verts, applyBounce) {
    const c = center();
    const omega = state.spin;
    const n = verts.length;
    // Loop multiple times because pushing off one edge can push into another
    for (let pass = 0; pass < 2; pass++) {
      let pushed = false;
      for (let i = 0; i < n; i++) {
        const p1 = verts[i];
        const p2 = verts[(i + 1) % n];
        const ex = p2.x - p1.x;
        const ey = p2.y - p1.y;
        const elen = Math.hypot(ex, ey);
        // Inward normal: for CCW-ordered verts, inward normal is (ey, -ex)/len.
        // Our verts go clockwise on screen (y-down), so use (-ey, ex)/len to point inward.
        // Determine by testing against center once.
        let nx = -ey / elen;
        let ny = ex / elen;
        // dot with vector from edge midpoint to center; must be positive (inward)
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;
        if (nx * (c.x - mx) + ny * (c.y - my) < 0) {
          nx = -nx;
          ny = -ny;
        }
        // signed distance from ball center to edge line, positive = inward side
        const dx = b.x - p1.x;
        const dy = b.y - p1.y;
        const dist = dx * nx + dy * ny;
        const penetration = b.r - dist;
        if (penetration > 0) {
          // Push ball inward
          b.x += nx * penetration;
          b.y += ny * penetration;
          if (applyBounce) {
            // Wall velocity at contact point due to rotation
            const rx = b.x - c.x;
            const ry = b.y - c.y;
            const wvx = -omega * ry;
            const wvy = omega * rx;
            // Ball velocity relative to wall
            const rvx = b.vx - wvx;
            const rvy = b.vy - wvy;
            const vn = rvx * nx + rvy * ny;
            if (vn < 0) {
              // Reflect the normal component
              const j = -(1 + state.bounce) * vn;
              b.vx += j * nx;
              b.vy += j * ny;
              // Tangential drag from spinning wall (fling effect)
              const tx = -ny, ty = nx;
              const vt = rvx * tx + rvy * ty;
              const friction = 0.15;
              b.vx -= friction * vt * tx;
              b.vy -= friction * vt * ty;
            }
          }
          pushed = true;
        }
      }
      if (!pushed) break;
    }
  }

  function handleBallCollisions() {
    const balls = state.balls;
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        const rsum = a.r + b.r;
        if (d2 < rsum * rsum && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const nx = dx / d;
          const ny = dy / d;
          const overlap = rsum - d;
          // Separate proportional to inverse mass
          const totalM = a.m + b.m;
          const push = overlap;
          a.x -= nx * push * (b.m / totalM);
          a.y -= ny * push * (b.m / totalM);
          b.x += nx * push * (a.m / totalM);
          b.y += ny * push * (a.m / totalM);
          // Relative velocity
          const rvx = b.vx - a.vx;
          const rvy = b.vy - a.vy;
          const vn = rvx * nx + rvy * ny;
          if (vn < 0) {
            const e = 0.9;
            const jimp = -(1 + e) * vn / (1 / a.m + 1 / b.m);
            const ix = jimp * nx;
            const iy = jimp * ny;
            a.vx -= ix / a.m;
            a.vy -= iy / a.m;
            b.vx += ix / b.m;
            b.vy += iy / b.m;
          }
        }
      }
    }
  }

  function step(dt) {
    const g = gravityVec();
    const damping = Math.pow(0.995, dt * 60);
    state.rotation += state.spin * dt;
    const verts = polygonVertices(state.sides, polygonRadius(), state.rotation);

    for (const b of state.balls) {
      b.vx += g.x * dt;
      b.vy += g.y * dt;
      b.vx *= damping;
      b.vy *= damping;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      constrainBall(b, verts, true);
    }

    if (state.collisions) {
      handleBallCollisions();
      // Re-constrain after ball-ball resolution to avoid escapes
      for (const b of state.balls) {
        constrainBall(b, verts, false);
      }
    }
  }

  // ---------- Rendering ----------
  function drawBackground() {
    if (state.trails) {
      ctx.fillStyle = 'rgba(10, 10, 15, 0.18)';
      ctx.fillRect(0, 0, W, H);
    } else {
      ctx.fillStyle = '#0a0a0f';
      ctx.fillRect(0, 0, W, H);
    }
    const c = center();
    const grad = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, polygonRadius() * 1.2);
    grad.addColorStop(0, 'rgba(100, 200, 255, 0.09)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  function drawPolygon() {
    const verts = polygonVertices(state.sides, polygonRadius(), state.rotation);
    ctx.save();
    ctx.strokeStyle = 'rgba(100, 200, 255, 0.85)';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = 'rgba(100, 200, 255, 0.9)';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    for (let i = 0; i < verts.length; i++) {
      const v = verts[i];
      if (i === 0) ctx.moveTo(v.x, v.y);
      else ctx.lineTo(v.x, v.y);
    }
    ctx.closePath();
    ctx.stroke();
    // vertex dots
    ctx.shadowBlur = 12;
    ctx.fillStyle = 'rgba(160, 220, 255, 1)';
    for (const v of verts) {
      ctx.beginPath();
      ctx.arc(v.x, v.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBalls() {
    for (const b of state.balls) {
      // glow
      const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 2);
      grad.addColorStop(0, b.color);
      grad.addColorStop(0.4, b.color);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      // solid fill
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      // highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.beginPath();
      ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, Math.max(1, b.r * 0.22), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---------- Main loop ----------
  let last = performance.now();
  function frame(now) {
    const rawDt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const dt = rawDt * state.timeScale;
    const SUBSTEPS = 5;
    const sdt = dt / SUBSTEPS;
    for (let i = 0; i < SUBSTEPS; i++) step(sdt);
    drawBackground();
    drawPolygon();
    drawBalls();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---------- Controls ----------
  const SHAPE_NAMES = {
    3: 'Triangle', 4: 'Square', 5: 'Pentagon', 6: 'Hexagon',
    7: 'Heptagon', 8: 'Octagon', 9: 'Nonagon', 10: 'Decagon',
    11: 'Hendecagon', 12: 'Dodecagon', 13: 'Tridecagon',
    14: 'Tetradecagon', 15: 'Pentadecagon', 16: 'Hexadecagon',
    17: 'Heptadecagon', 18: 'Octadecagon', 19: 'Enneadecagon',
    20: 'Icosagon'
  };

  function gravityArrow(deg) {
    // 0=right, 90=down, 180=left, 270=up
    const d = ((deg % 360) + 360) % 360;
    if (d < 22.5 || d >= 337.5) return '→';
    if (d < 67.5) return '↘';
    if (d < 112.5) return '↓';
    if (d < 157.5) return '↙';
    if (d < 202.5) return '←';
    if (d < 247.5) return '↖';
    if (d < 292.5) return '↑';
    return '↗';
  }

  const $ = (id) => document.getElementById(id);

  $('sides').addEventListener('input', e => {
    state.sides = parseInt(e.target.value);
    $('sidesVal').textContent = state.sides;
    $('sidesName').textContent = SHAPE_NAMES[state.sides] || `${state.sides}-gon`;
    initBalls();
  });
  $('spin').addEventListener('input', e => {
    state.spin = parseFloat(e.target.value);
    $('spinVal').textContent = state.spin.toFixed(2);
  });
  $('count').addEventListener('input', e => {
    state.count = parseInt(e.target.value);
    $('countVal').textContent = state.count;
    initBalls();
  });
  $('size').addEventListener('input', e => {
    state.sizeVar = parseInt(e.target.value);
    $('sizeVal').textContent = state.sizeVar;
    initBalls();
  });
  $('bounce').addEventListener('input', e => {
    state.bounce = parseFloat(e.target.value);
    $('bounceVal').textContent = state.bounce.toFixed(2);
  });
  $('collisions').addEventListener('click', e => {
    state.collisions = !state.collisions;
    e.currentTarget.classList.toggle('on', state.collisions);
  });
  $('gAngle').addEventListener('input', e => {
    state.gAngle = parseInt(e.target.value);
    $('gAngleVal').textContent = gravityArrow(state.gAngle);
  });
  $('gStrength').addEventListener('input', e => {
    state.gStrength = parseInt(e.target.value);
    $('gStrengthVal').textContent = state.gStrength;
  });
  $('time').addEventListener('input', e => {
    state.timeScale = parseFloat(e.target.value);
    $('timeVal').textContent = state.timeScale.toFixed(2) + '×';
  });
  $('trails').addEventListener('click', e => {
    state.trails = !state.trails;
    e.currentTarget.classList.toggle('on', state.trails);
  });
  $('explode').addEventListener('click', () => {
    for (const b of state.balls) {
      const a = Math.random() * Math.PI * 2;
      const speed = 300 + Math.random() * 500;
      b.vx += Math.cos(a) * speed;
      b.vy += Math.sin(a) * speed;
    }
  });

  // Collapsible sections
  document.querySelectorAll('.section-header').forEach(h => {
    h.addEventListener('click', () => {
      h.parentElement.classList.toggle('collapsed');
    });
  });

  // Tooltips - real DOM element, positioned outside the panel
  const tooltip = document.getElementById('tooltip');
  document.querySelectorAll('.control[data-tip]').forEach(el => {
    el.addEventListener('mouseenter', () => {
      const tip = el.getAttribute('data-tip');
      if (!tip) return;
      tooltip.textContent = tip;
      const rect = el.getBoundingClientRect();
      const panelRect = document.getElementById('panel').getBoundingClientRect();
      // Position to the right of the panel, aligned with control's vertical center
      tooltip.style.left = (panelRect.right + 12) + 'px';
      tooltip.style.top = (rect.top + rect.height / 2 - 14) + 'px';
      tooltip.classList.add('show');
    });
    el.addEventListener('mouseleave', () => {
      tooltip.classList.remove('show');
    });
  });

  // Init
  $('sidesName').textContent = SHAPE_NAMES[state.sides];
  $('gAngleVal').textContent = gravityArrow(state.gAngle);
  initBalls();
})();
