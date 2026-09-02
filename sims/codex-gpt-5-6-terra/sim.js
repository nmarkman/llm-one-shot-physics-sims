(() => {
  'use strict';

  const canvas = document.querySelector('#sim');
  const ctx = canvas.getContext('2d');
  const tooltip = document.querySelector('#tooltip');
  const $ = (id) => document.getElementById(id);
  const controls = {
    sides: $('sides'), spin: $('spin'), count: $('count'), sizeVariation: $('sizeVariation'),
    bounciness: $('bounciness'), collisions: $('collisions'), gravityAngle: $('gravityAngle'),
    gravityStrength: $('gravityStrength'), timeScale: $('timeScale'), trails: $('trails')
  };
  const outputs = {
    sides: $('sidesOut'), spin: $('spinOut'), count: $('countOut'), sizeVariation: $('sizeVariationOut'),
    bounciness: $('bouncinessOut'), gravityAngle: $('gravityAngleOut'), gravityStrength: $('gravityStrengthOut'), timeScale: $('timeScaleOut')
  };
  const names = ['Triangle', 'Quadrilateral', 'Pentagon', 'Hexagon', 'Heptagon', 'Octagon', 'Nonagon', 'Decagon', 'Hendecagon', 'Dodecagon', 'Tridecagon', 'Tetradecagon', 'Pentadecagon', 'Hexadecagon', 'Heptadecagon', 'Octadecagon', 'Enneadecagon', 'Icosagon'];
  const cfg = { sides: 8, spin: .85, count: 40, sizeVariation: 17, bounciness: .86, collisions: true, gravityAngle: 0, gravityStrength: 780, timeScale: 1, trails: false };
  let width = 0, height = 0, dpr = 1, cx = 0, cy = 0, radius = 100;
  let rotation = -Math.PI / 2, lastTime = performance.now(), balls = [];

  function setSliderFill(input) {
    const pct = ((Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min))) * 100;
    input.style.setProperty('--fill', `${pct}%`);
  }

  function gravityArrow(degrees) {
    return ['↓', '←', '↑', '→'][Math.round((degrees % 360) / 90) % 4];
  }

  function updateReadouts() {
    outputs.sides.textContent = cfg.sides;
    $('shapeName').textContent = `${names[cfg.sides - 3]} · ${cfg.sides} sides`;
    outputs.spin.textContent = `${cfg.spin.toFixed(2)} rad/s`;
    outputs.count.textContent = cfg.count;
    outputs.sizeVariation.textContent = `${cfg.sizeVariation}px`;
    outputs.bounciness.textContent = cfg.bounciness.toFixed(2);
    outputs.gravityAngle.textContent = `${cfg.gravityAngle}° ${gravityArrow(cfg.gravityAngle)}`;
    outputs.gravityStrength.textContent = cfg.gravityStrength === 0 ? 'zero-G' : `${cfg.gravityStrength} px/s²`;
    outputs.timeScale.textContent = `${cfg.timeScale.toFixed(2)}×`;
    Object.values(controls).forEach((input) => { if (input.type === 'range') setSliderFill(input); });
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx = width / 2;
    cy = height / 2;
    radius = Math.max(80, Math.min(width, height) * .295);
    initBalls();
  }

  function randomColor() {
    return `hsl(${Math.floor(Math.random() * 360)} 88% 62%)`;
  }

  function makeBall() {
    const r = 6 + Math.random() * cfg.sizeVariation;
    // A disk with this radius is entirely inside the polygon: apothem, not circumradius.
    const apothem = radius * Math.cos(Math.PI / cfg.sides);
    const spawnRadius = Math.max(0, apothem - r - 4) * Math.sqrt(Math.random());
    const angle = Math.random() * Math.PI * 2;
    return {
      x: cx + Math.cos(angle) * spawnRadius,
      y: cy + Math.sin(angle) * spawnRadius,
      vx: (Math.random() - .5) * 110,
      vy: (Math.random() - .5) * 110,
      r,
      mass: r * r,
      color: randomColor()
    };
  }

  function initBalls() {
    balls = [];
    for (let i = 0; i < cfg.count; i++) balls.push(makeBall());
    // Settle any unusually dense initial distribution before it becomes visible.
    if (cfg.collisions) {
      const vertices = polygonVertices();
      for (let i = 0; i < 4; i++) {
        resolveBallCollisions(vertices);
        constrainAll(vertices);
      }
    }
  }

  function polygonVertices() {
    const vertices = [];
    const step = Math.PI * 2 / cfg.sides;
    for (let i = 0; i < cfg.sides; i++) {
      const a = rotation + i * step;
      vertices.push({ x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius });
    }
    return vertices;
  }

  function edgeNormal(a, b) {
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    let nx = -ey;
    let ny = ex;
    const length = Math.hypot(nx, ny) || 1;
    nx /= length;
    ny /= length;
    // Choose the perpendicular that points toward the polygon center, regardless of winding.
    if ((cx - (a.x + b.x) / 2) * nx + (cy - (a.y + b.y) / 2) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    return { x: nx, y: ny };
  }

  function constrainBall(ball, vertices, applyResponse = true) {
    // A signed distance to every edge is the actual containment test for a convex polygon.
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < vertices.length; i++) {
        const a = vertices[i];
        const b = vertices[(i + 1) % vertices.length];
        const n = edgeNormal(a, b);
        const distance = (ball.x - a.x) * n.x + (ball.y - a.y) * n.y;
        const penetration = ball.r - distance;
        if (penetration <= 0) continue;

        ball.x += n.x * penetration;
        ball.y += n.y * penetration;
        if (!applyResponse) continue;

        // Contact point wall velocity: v = omega × r. Relative velocity makes moving walls physical.
        const contactX = ball.x - n.x * ball.r - cx;
        const contactY = ball.y - n.y * ball.r - cy;
        const wallVX = -cfg.spin * contactY;
        const wallVY = cfg.spin * contactX;
        const relVX = ball.vx - wallVX;
        const relVY = ball.vy - wallVY;
        const normalSpeed = relVX * n.x + relVY * n.y;
        if (normalSpeed < 0) {
          const kick = -(1 + cfg.bounciness) * normalSpeed;
          ball.vx += n.x * kick;
          ball.vy += n.y * kick;

          // Small tangential friction transfers the spinning frame's surface motion to the ball.
          const tx = -n.y, ty = n.x;
          const tangentSpeed = relVX * tx + relVY * ty;
          const drag = Math.min(Math.abs(tangentSpeed) * .16, Math.abs(kick) * .32);
          ball.vx += tx * -Math.sign(tangentSpeed) * drag;
          ball.vy += ty * -Math.sign(tangentSpeed) * drag;
        }
      }
    }
  }

  function constrainAll(vertices) {
    for (const ball of balls) constrainBall(ball, vertices);
  }

  function resolveBallCollisions() {
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);
        const minDist = a.r + b.r;
        if (dist >= minDist) continue;
        if (dist < .0001) {
          const angle = Math.random() * Math.PI * 2;
          dx = Math.cos(angle); dy = Math.sin(angle); dist = 1;
        }
        const nx = dx / dist, ny = dy / dist;
        const invA = 1 / a.mass, invB = 1 / b.mass;
        const overlap = minDist - dist;
        // Mass-weighted positional separation prevents balls from remaining interpenetrating.
        const correction = overlap / (invA + invB) * .92;
        a.x -= nx * correction * invA;
        a.y -= ny * correction * invA;
        b.x += nx * correction * invB;
        b.y += ny * correction * invB;

        const relativeVX = b.vx - a.vx;
        const relativeVY = b.vy - a.vy;
        const approachSpeed = relativeVX * nx + relativeVY * ny;
        if (approachSpeed >= 0) continue;
        const impulse = -(1 + .82) * approachSpeed / (invA + invB);
        a.vx -= nx * impulse * invA;
        a.vy -= ny * impulse * invA;
        b.vx += nx * impulse * invB;
        b.vy += ny * impulse * invB;
      }
    }
  }

  function simulate(frameDt) {
    const substeps = 5;
    const physicsDt = frameDt * cfg.timeScale / substeps;
    const angle = cfg.gravityAngle * Math.PI / 180;
    const gravityX = -Math.sin(angle) * cfg.gravityStrength;
    const gravityY = Math.cos(angle) * cfg.gravityStrength;

    for (let step = 0; step < substeps; step++) {
      rotation += cfg.spin * frameDt / substeps;
      const vertices = polygonVertices();
      if (physicsDt <= 0) continue;
      const damping = Math.pow(.9975, physicsDt * 60);
      for (const ball of balls) {
        ball.vx = (ball.vx + gravityX * physicsDt) * damping;
        ball.vy = (ball.vy + gravityY * physicsDt) * damping;
        ball.x += ball.vx * physicsDt;
        ball.y += ball.vy * physicsDt;
        constrainBall(ball, vertices);
      }
      if (cfg.collisions) {
        resolveBallCollisions();
        // Separation can push a ball across an edge, so constrain again after all pair responses.
        constrainAll(vertices);
      }
    }
  }

  function drawPolygon(vertices) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(vertices[0].x, vertices[0].y);
    for (let i = 1; i < vertices.length; i++) ctx.lineTo(vertices[i].x, vertices[i].y);
    ctx.closePath();
    ctx.strokeStyle = 'rgba(120, 215, 255, .92)';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = 'rgba(75, 190, 255, .92)';
    ctx.shadowBlur = 19;
    ctx.stroke();
    ctx.shadowBlur = 12;
    for (const v of vertices) {
      ctx.beginPath();
      ctx.arc(v.x, v.y, 3.4, 0, Math.PI * 2);
      ctx.fillStyle = '#e0f8ff';
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBall(ball) {
    ctx.save();
    const glow = ctx.createRadialGradient(ball.x, ball.y, ball.r * .15, ball.x, ball.y, ball.r * 2.05);
    glow.addColorStop(0, ball.color);
    glow.addColorStop(.42, ball.color);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.globalAlpha = .37;
    ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r * 2.05, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fillStyle = ball.color; ctx.fill();
    const inner = ctx.createRadialGradient(ball.x - ball.r * .3, ball.y - ball.r * .35, 0, ball.x, ball.y, ball.r);
    inner.addColorStop(0, 'rgba(255,255,255,.42)');
    inner.addColorStop(.6, 'rgba(255,255,255,0)');
    ctx.fillStyle = inner; ctx.fill();
    ctx.beginPath();
    ctx.arc(ball.x - ball.r * .28, ball.y - ball.r * .3, Math.max(1.3, ball.r * .16), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fill();
    ctx.restore();
  }

  function render() {
    ctx.fillStyle = cfg.trails ? 'rgba(10, 10, 15, .14)' : '#0a0a0f';
    ctx.fillRect(0, 0, width, height);
    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 1.55);
    bg.addColorStop(0, 'rgba(30, 130, 190, .14)');
    bg.addColorStop(.55, 'rgba(17, 61, 96, .06)');
    bg.addColorStop(1, 'rgba(10, 10, 15, 0)');
    ctx.fillStyle = bg;
    ctx.fillRect(cx - radius * 1.55, cy - radius * 1.55, radius * 3.1, radius * 3.1);
    const vertices = polygonVertices();
    drawPolygon(vertices);
    for (const ball of balls) drawBall(ball);
  }

  function loop(now) {
    const dt = Math.min(.04, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;
    simulate(dt);
    render();
    requestAnimationFrame(loop);
  }

  function bindRange(key, reinitialize = false) {
    const input = controls[key];
    input.addEventListener('input', () => {
      cfg[key] = Number(input.value);
      updateReadouts();
      if (reinitialize) initBalls();
    });
  }
  bindRange('sides', true);
  bindRange('spin');
  bindRange('count', true);
  bindRange('sizeVariation', true);
  bindRange('bounciness');
  bindRange('gravityAngle');
  bindRange('gravityStrength');
  bindRange('timeScale');
  controls.collisions.addEventListener('change', () => { cfg.collisions = controls.collisions.checked; });
  controls.trails.addEventListener('change', () => { cfg.trails = controls.trails.checked; });
  $('explode').addEventListener('click', () => {
    for (const ball of balls) {
      const direction = Math.random() * Math.PI * 2;
      const impulse = 300 + Math.random() * 500;
      ball.vx += Math.cos(direction) * impulse;
      ball.vy += Math.sin(direction) * impulse;
    }
  });

  document.querySelectorAll('.section-header').forEach((button) => {
    button.addEventListener('click', () => {
      const section = button.closest('.section');
      const closed = section.classList.toggle('collapsed');
      button.setAttribute('aria-expanded', String(!closed));
    });
  });
  document.querySelectorAll('[data-tooltip]').forEach((control) => {
    control.addEventListener('mouseenter', () => {
      tooltip.textContent = control.dataset.tooltip;
      tooltip.style.display = 'block';
      const rect = control.getBoundingClientRect();
      const tip = tooltip.getBoundingClientRect();
      tooltip.style.left = `${Math.min(rect.right + 12, window.innerWidth - tip.width - 9)}px`;
      tooltip.style.top = `${Math.max(8, Math.min(rect.top + rect.height / 2 - tip.height / 2, window.innerHeight - tip.height - 8))}px`;
    });
    control.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
  });
  document.querySelector('.panel').addEventListener('scroll', () => { tooltip.style.display = 'none'; });
  window.addEventListener('resize', resize);

  updateReadouts();
  resize();
  requestAnimationFrame(loop);
})();
