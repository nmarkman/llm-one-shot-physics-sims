(() => {
  'use strict';

  // ---------------------------------------------------------------
  // Canvas setup
  // ---------------------------------------------------------------
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, DPR = 1;
  let cx = 0, cy = 0;       // polygon center
  let polyRadius = 300;      // circumradius

  function resize() {
    DPR = window.devicePixelRatio || 1;
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    cx = W / 2;
    cy = H / 2;
    polyRadius = Math.min(W, H) * 0.38;
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------------------------------------------------------------
  // Parameters
  // ---------------------------------------------------------------
  const params = {
    sides: 8,
    spin: 0.8,          // rad/s (negative = reverse)
    count: 40,
    sizeVar: 14,        // max random radius added to base size 6
    restitution: 0.85,  // wall bounciness
    ballCollisions: true,
    gravAngle: 90,      // degrees; 90 = down (canvas y+)
    gravStrength: 600,
    timeScale: 1,
    trails: false,
  };

  const SUBSTEPS = 5;
  const BASE_SIZE = 6;
  const WALL_FRICTION = 0.18;   // tangential drag from walls (lets spin fling balls)
  const AIR_DAMPING = 0.12;     // per-second linear velocity damping

  let rotation = 0;             // polygon rotation angle
  let balls = [];

  // ---------------------------------------------------------------
  // Polygon geometry
  // ---------------------------------------------------------------
  function apothem() {
    return polyRadius * Math.cos(Math.PI / params.sides);
  }

  // Returns array of edges: { x1,y1, x2,y2, nx,ny } with inward-pointing unit normal
  function computeEdges() {
    const n = params.sides;
    const verts = [];
    for (let i = 0; i < n; i++) {
      const a = rotation + (i / n) * Math.PI * 2 - Math.PI / 2;
      verts.push({ x: cx + Math.cos(a) * polyRadius, y: cy + Math.sin(a) * polyRadius });
    }
    const edges = [];
    for (let i = 0; i < n; i++) {
      const v1 = verts[i];
      const v2 = verts[(i + 1) % n];
      const ex = v2.x - v1.x;
      const ey = v2.y - v1.y;
      const len = Math.hypot(ex, ey) || 1;
      // Two candidate normals; pick the one pointing toward the center (inward)
      let nx = ey / len, ny = -ex / len;
      if ((cx - v1.x) * nx + (cy - v1.y) * ny < 0) { nx = -nx; ny = -ny; }
      edges.push({ x1: v1.x, y1: v1.y, x2: v2.x, y2: v2.y, nx, ny });
    }
    return { verts, edges };
  }

  // ---------------------------------------------------------------
  // Balls
  // ---------------------------------------------------------------
  function makeBall() {
    const r = BASE_SIZE + Math.random() * params.sizeVar;
    // Spawn using the apothem (inscribed radius) so balls start inside ANY shape
    const maxDist = Math.max(0, apothem() - r - 6);
    const ang = Math.random() * Math.PI * 2;
    const dist = Math.sqrt(Math.random()) * maxDist;
    const hue = Math.floor(Math.random() * 360);
    return {
      x: cx + Math.cos(ang) * dist,
      y: cy + Math.sin(ang) * dist,
      vx: (Math.random() - 0.5) * 200,
      vy: (Math.random() - 0.5) * 200,
      r,
      mass: r * r,
      hue,
    };
  }

  function initBalls() {
    balls = [];
    for (let i = 0; i < params.count; i++) balls.push(makeBall());
  }
  initBalls();

  // ---------------------------------------------------------------
  // Physics
  // ---------------------------------------------------------------

  // Push a ball inside the polygon (positional correction only)
  function constrainBall(b, edges) {
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      const d = (b.x - e.x1) * e.nx + (b.y - e.y1) * e.ny; // signed distance from edge line
      if (d < b.r) {
        const push = b.r - d;
        b.x += e.nx * push;
        b.y += e.ny * push;
      }
    }
  }

  // Wall collision with velocity response; accounts for the wall's
  // rotational velocity at the contact point (spinning walls drag/fling)
  function collideWalls(b, edges) {
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      const d = (b.x - e.x1) * e.nx + (b.y - e.y1) * e.ny;
      if (d < b.r) {
        // Positional correction: push inward along the edge normal
        const push = b.r - d;
        b.x += e.nx * push;
        b.y += e.ny * push;

        // Velocity of the wall at the contact point: v = omega x r
        const rx = b.x - cx;
        const ry = b.y - cy;
        const wallVx = -params.spin * ry;
        const wallVy =  params.spin * rx;

        // Relative velocity (ball relative to moving wall)
        let rvx = b.vx - wallVx;
        let rvy = b.vy - wallVy;
        const vn = rvx * e.nx + rvy * e.ny;

        if (vn < 0) {
          // Reflect normal component with restitution
          rvx -= (1 + params.restitution) * vn * e.nx;
          rvy -= (1 + params.restitution) * vn * e.ny;

          // Tangential friction so the moving wall drags the ball
          const newVn = rvx * e.nx + rvy * e.ny;
          let tx = rvx - newVn * e.nx;
          let ty = rvy - newVn * e.ny;
          tx *= (1 - WALL_FRICTION);
          ty *= (1 - WALL_FRICTION);
          rvx = newVn * e.nx + tx;
          rvy = newVn * e.ny + ty;

          // Back to world space
          b.vx = rvx + wallVx;
          b.vy = rvy + wallVy;
        }
      }
    }
  }

  // Mass-based ball-to-ball collisions: separation + impulse resolution
  function collideBalls() {
    const n = balls.length;
    for (let i = 0; i < n; i++) {
      const a = balls[i];
      for (let j = i + 1; j < n; j++) {
        const b = balls[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const minDist = a.r + b.r;
        const distSq = dx * dx + dy * dy;
        if (distSq >= minDist * minDist || distSq === 0) continue;

        const dist = Math.sqrt(distSq);
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = minDist - dist;
        const total = a.mass + b.mass;

        // Separate proportionally to inverse mass
        a.x -= nx * overlap * (b.mass / total);
        a.y -= ny * overlap * (b.mass / total);
        b.x += nx * overlap * (a.mass / total);
        b.y += ny * overlap * (a.mass / total);

        // Impulse resolution
        const rvx = b.vx - a.vx;
        const rvy = b.vy - a.vy;
        const velAlongNormal = rvx * nx + rvy * ny;
        if (velAlongNormal < 0) {
          const e = Math.min(1, params.restitution);
          const jImp = -(1 + e) * velAlongNormal / (1 / a.mass + 1 / b.mass);
          a.vx -= (jImp / a.mass) * nx;
          a.vy -= (jImp / a.mass) * ny;
          b.vx += (jImp / b.mass) * nx;
          b.vy += (jImp / b.mass) * ny;
        }
      }
    }
  }

  function physicsStep(dt) {
    rotation += params.spin * dt;
    const { edges } = computeEdges();

    const gRad = params.gravAngle * Math.PI / 180;
    const gx = Math.cos(gRad) * params.gravStrength;
    const gy = Math.sin(gRad) * params.gravStrength;
    const damp = Math.max(0, 1 - AIR_DAMPING * dt);

    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      b.vx += gx * dt;
      b.vy += gy * dt;
      b.vx *= damp;
      b.vy *= damp;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      collideWalls(b, edges);
    }

    if (params.ballCollisions) {
      collideBalls();
      // Re-constrain inside the polygon after separation to prevent escape
      for (let i = 0; i < balls.length; i++) constrainBall(balls[i], edges);
    }
  }

  // ---------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------
  function draw() {
    if (params.trails) {
      // Semi-transparent black rect over previous frame => motion trails
      ctx.fillStyle = 'rgba(10, 10, 15, 0.22)';
      ctx.fillRect(0, 0, W, H);
    } else {
      ctx.fillStyle = '#0a0a0f';
      ctx.fillRect(0, 0, W, H);
    }

    // Subtle radial background glow behind the polygon
    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, polyRadius * 1.4);
    bg.addColorStop(0, 'rgba(100, 200, 255, 0.06)');
    bg.addColorStop(0.7, 'rgba(100, 200, 255, 0.02)');
    bg.addColorStop(1, 'rgba(100, 200, 255, 0)');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(cx, cy, polyRadius * 1.4, 0, Math.PI * 2);
    ctx.fill();

    const { verts } = computeEdges();

    // Glowing polygon frame
    ctx.save();
    ctx.strokeStyle = 'rgba(100, 200, 255, 0.9)';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(100, 200, 255, 0.8)';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.moveTo(verts[0].x, verts[0].y);
    for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // Vertex dots
    ctx.fillStyle = 'rgba(160, 225, 255, 0.95)';
    for (let i = 0; i < verts.length; i++) {
      ctx.beginPath();
      ctx.arc(verts[i].x, verts[i].y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Balls: radial gradient glow + solid fill + white highlight dot
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];

      const glowR = b.r * 2.2;
      const grad = ctx.createRadialGradient(b.x, b.y, b.r * 0.3, b.x, b.y, glowR);
      grad.addColorStop(0, `hsla(${b.hue}, 90%, 60%, 0.4)`);
      grad.addColorStop(1, `hsla(${b.hue}, 90%, 60%, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(b.x, b.y, glowR, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `hsl(${b.hue}, 85%, 60%)`;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.beginPath();
      ctx.arc(b.x - b.r * 0.32, b.y - b.r * 0.32, b.r * 0.26, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---------------------------------------------------------------
  // Main loop — physics runs in SUBSTEPS per frame for stability
  // ---------------------------------------------------------------
  let lastTime = performance.now();
  function loop(now) {
    let frameDt = Math.min((now - lastTime) / 1000, 1 / 30); // clamp big jumps
    lastTime = now;
    frameDt *= params.timeScale;

    if (frameDt > 0) {
      const subDt = frameDt / SUBSTEPS;
      for (let s = 0; s < SUBSTEPS; s++) physicsStep(subDt);
    }

    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // ---------------------------------------------------------------
  // UI wiring
  // ---------------------------------------------------------------
  const $ = (id) => document.getElementById(id);

  const SHAPE_NAMES = {
    3: 'Triangle', 4: 'Square', 5: 'Pentagon', 6: 'Hexagon', 7: 'Heptagon',
    8: 'Octagon', 9: 'Nonagon', 10: 'Decagon', 11: 'Hendecagon', 12: 'Dodecagon',
    13: 'Tridecagon', 14: 'Tetradecagon', 15: 'Pentadecagon', 16: 'Hexadecagon',
    17: 'Heptadecagon', 18: 'Octadecagon', 19: 'Enneadecagon', 20: 'Icosagon',
  };

  const GRAV_ARROWS = ['\u2192', '\u2198', '\u2193', '\u2199', '\u2190', '\u2196', '\u2191', '\u2197'];
  function gravArrow(deg) {
    return GRAV_ARROWS[Math.round(deg / 45) % 8];
  }

  // Shape (sides & size changes reinitialize balls; others take effect live)
  $('sides').addEventListener('input', (e) => {
    params.sides = parseInt(e.target.value, 10);
    $('sidesVal').textContent = params.sides;
    $('shapeName').textContent = SHAPE_NAMES[params.sides] || params.sides + '-gon';
    initBalls();
  });

  $('spin').addEventListener('input', (e) => {
    params.spin = parseFloat(e.target.value);
    $('spinVal').textContent = params.spin.toFixed(1);
  });

  // Balls
  $('count').addEventListener('input', (e) => {
    params.count = parseInt(e.target.value, 10);
    $('countVal').textContent = params.count;
    initBalls();
  });

  $('sizeVar').addEventListener('input', (e) => {
    params.sizeVar = parseInt(e.target.value, 10);
    $('sizeVarVal').textContent = params.sizeVar;
    initBalls();
  });

  $('rest').addEventListener('input', (e) => {
    params.restitution = parseFloat(e.target.value);
    $('restVal').textContent = params.restitution.toFixed(2);
  });

  $('collide').addEventListener('change', (e) => {
    params.ballCollisions = e.target.checked;
  });

  // Physics
  $('gravAngle').addEventListener('input', (e) => {
    params.gravAngle = parseInt(e.target.value, 10);
    $('gravAngleVal').textContent = params.gravAngle + '\u00b0 ' + gravArrow(params.gravAngle);
  });

  $('grav').addEventListener('input', (e) => {
    params.gravStrength = parseInt(e.target.value, 10);
    $('gravVal').textContent = params.gravStrength === 0 ? '0 (zero-G)' : params.gravStrength;
  });

  $('time').addEventListener('input', (e) => {
    params.timeScale = parseFloat(e.target.value);
    $('timeVal').textContent = params.timeScale.toFixed(1) + '\u00d7';
  });

  // Effects
  $('trails').addEventListener('change', (e) => {
    params.trails = e.target.checked;
  });

  $('explode').addEventListener('click', () => {
    for (let i = 0; i < balls.length; i++) {
      const ang = Math.random() * Math.PI * 2;
      const mag = 300 + Math.random() * 500; // 300 - 800
      balls[i].vx += Math.cos(ang) * mag;
      balls[i].vy += Math.sin(ang) * mag;
    }
  });

  // Collapsible sections
  document.querySelectorAll('.section-header').forEach((header) => {
    header.addEventListener('click', () => {
      header.parentElement.classList.toggle('collapsed');
    });
  });

  // ---------------------------------------------------------------
  // Tooltips — a single real DOM element positioned with JS so it
  // is never clipped by the panel's overflow-y: auto
  // ---------------------------------------------------------------
  const tooltip = document.getElementById('tooltip');
  const panel = document.getElementById('panel');

  document.querySelectorAll('[data-tip]').forEach((el) => {
    el.addEventListener('mouseenter', () => {
      tooltip.textContent = el.getAttribute('data-tip');
      const rect = el.getBoundingClientRect();
      let left = rect.right + 14;
      let top = rect.top + rect.height / 2;
      // Keep tooltip on screen vertically
      top = Math.max(40, Math.min(top, window.innerHeight - 40));
      tooltip.style.left = left + 'px';
      tooltip.style.top = top + 'px';
      tooltip.classList.add('visible');
    });
    el.addEventListener('mouseleave', () => {
      tooltip.classList.remove('visible');
    });
  });

  // Hide tooltip while the panel scrolls (position would go stale)
  panel.addEventListener('scroll', () => tooltip.classList.remove('visible'));
})();
