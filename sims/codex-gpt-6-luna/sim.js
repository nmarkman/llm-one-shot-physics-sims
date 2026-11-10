(() => {
  'use strict';

  const canvas = document.getElementById('scene');
  const ctx = canvas.getContext('2d', { alpha: false });
  const tooltip = document.getElementById('tooltip');
  const controls = {
    sides: document.getElementById('sides'),
    spin: document.getElementById('spin'),
    count: document.getElementById('count'),
    variation: document.getElementById('variation'),
    bounce: document.getElementById('bounce'),
    collisions: document.getElementById('collisions'),
    gravityAngle: document.getElementById('gravity-angle'),
    gravityStrength: document.getElementById('gravity-strength'),
    timeScale: document.getElementById('time-scale'),
    trails: document.getElementById('trails')
  };

  const names = {
    3: 'Triangle', 4: 'Square', 5: 'Pentagon', 6: 'Hexagon', 7: 'Heptagon',
    8: 'Octagon', 9: 'Nonagon', 10: 'Decagon', 11: 'Hendecagon', 12: 'Dodecagon',
    13: 'Tridecagon', 14: 'Tetradecagon', 15: 'Pentadecagon', 16: 'Hexadecagon',
    17: 'Heptadecagon', 18: 'Octadecagon', 19: 'Enneadecagon', 20: 'Icosagon'
  };

  const state = {
    width: 0,
    height: 0,
    dpr: 1,
    centerX: 0,
    centerY: 0,
    frameRadius: 0,
    angle: -Math.PI / 2,
    balls: [],
    lastTime: 0,
    gravityX: 0,
    gravityY: 1
  };

  const TAU = Math.PI * 2;
  const SUBSTEPS = 5;
  const BALL_RESTITUTION = 0.88;
  const WALL_FRICTION = 0.13;
  const AIR_DRAG = 0.12;
  const ballPalette = [
    [188, 88, 62], [208, 90, 65], [260, 84, 70], [326, 85, 68],
    [34, 94, 63], [148, 76, 61], [2, 88, 65], [228, 90, 68]
  ];

  function polygonApothem() {
    return state.frameRadius * Math.cos(Math.PI / Number(controls.sides.value));
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    state.width = rect.width;
    state.height = rect.height;
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(state.width * state.dpr);
    canvas.height = Math.round(state.height * state.dpr);
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    state.centerX = state.width / 2;
    state.centerY = state.height / 2;
    state.frameRadius = Math.min(state.width, state.height) * 0.365;
    spawnBalls();
  }

  function spawnBalls() {
    const amount = Number(controls.count.value);
    const variation = Number(controls.variation.value);
    const apothem = polygonApothem();
    state.balls = [];

    for (let i = 0; i < amount; i++) {
      const radius = 6 + Math.random() * variation;
      const spawnLimit = Math.max(0, apothem - radius - 3);
      const distance = Math.sqrt(Math.random()) * spawnLimit;
      const direction = Math.random() * TAU;
      const palette = ballPalette[i % ballPalette.length];
      state.balls.push({
        x: state.centerX + Math.cos(direction) * distance,
        y: state.centerY + Math.sin(direction) * distance,
        vx: (Math.random() - 0.5) * 190,
        vy: (Math.random() - 0.5) * 190,
        radius,
        mass: radius * radius,
        hue: palette[0] + (Math.random() - 0.5) * 16,
        saturation: palette[1],
        lightness: palette[2]
      });
    }
  }

  function getVertices() {
    const sides = Number(controls.sides.value);
    const vertices = [];
    for (let i = 0; i < sides; i++) {
      const a = state.angle + i * TAU / sides;
      vertices.push({
        x: state.centerX + Math.cos(a) * state.frameRadius,
        y: state.centerY + Math.sin(a) * state.frameRadius
      });
    }
    return vertices;
  }

  function constrainBall(ball, vertices, omega) {
    for (let i = 0; i < vertices.length; i++) {
      const a = vertices[i];
      const b = vertices[(i + 1) % vertices.length];
      const edgeX = b.x - a.x;
      const edgeY = b.y - a.y;
      const edgeLength = Math.hypot(edgeX, edgeY) || 1;
      let nx = -edgeY / edgeLength;
      let ny = edgeX / edgeLength;
      if ((state.centerX - a.x) * nx + (state.centerY - a.y) * ny < 0) {
        nx = -nx;
        ny = -ny;
      }

      // Positive signed distance is inside. A ball's center must stay at least
      // one radius from each edge's line, including on low-sided polygons.
      const signedDistance = (ball.x - a.x) * nx + (ball.y - a.y) * ny;
      if (signedDistance < ball.radius) {
        const penetration = ball.radius - signedDistance;
        ball.x += nx * penetration;
        ball.y += ny * penetration;

        // The wall velocity is omega cross r at the actual contact point.
        const contactX = ball.x - nx * ball.radius;
        const contactY = ball.y - ny * ball.radius;
        const armX = contactX - state.centerX;
        const armY = contactY - state.centerY;
        const wallVX = -omega * armY;
        const wallVY = omega * armX;
        let relativeX = ball.vx - wallVX;
        let relativeY = ball.vy - wallVY;
        const normalSpeed = relativeX * nx + relativeY * ny;

        if (normalSpeed < 0) {
          const restitution = Number(controls.bounce.value);
          relativeX -= (1 + restitution) * normalSpeed * nx;
          relativeY -= (1 + restitution) * normalSpeed * ny;
        }

        // A little tangential grip lets the rotating frame carry balls along
        // its edges as well as transfer velocity through normal impacts.
        const tx = -ny;
        const ty = nx;
        const tangentSpeed = relativeX * tx + relativeY * ty;
        relativeX -= tangentSpeed * WALL_FRICTION * tx;
        relativeY -= tangentSpeed * WALL_FRICTION * ty;
        ball.vx = relativeX + wallVX;
        ball.vy = relativeY + wallVY;
      }
    }
  }

  function resolveBallPair(a, b) {
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    let distance = Math.hypot(dx, dy);
    const minDistance = a.radius + b.radius;
    if (distance >= minDistance) return;

    if (distance < 0.0001) {
      const angle = Math.random() * TAU;
      dx = Math.cos(angle);
      dy = Math.sin(angle);
      distance = 1;
    }
    const nx = dx / distance;
    const ny = dy / distance;
    const invA = 1 / a.mass;
    const invB = 1 / b.mass;
    const invTotal = invA + invB;
    const overlap = minDistance - distance;

    // Separate by inverse mass, so lighter balls move farther.
    a.x -= nx * overlap * (invA / invTotal);
    a.y -= ny * overlap * (invA / invTotal);
    b.x += nx * overlap * (invB / invTotal);
    b.y += ny * overlap * (invB / invTotal);

    const relativeVX = b.vx - a.vx;
    const relativeVY = b.vy - a.vy;
    const closingSpeed = relativeVX * nx + relativeVY * ny;
    if (closingSpeed < 0) {
      const impulse = -(1 + BALL_RESTITUTION) * closingSpeed / invTotal;
      a.vx -= impulse * invA * nx;
      a.vy -= impulse * invA * ny;
      b.vx += impulse * invB * nx;
      b.vy += impulse * invB * ny;
    }
  }

  function step(dt) {
    const sides = Number(controls.sides.value);
    const omega = Number(controls.spin.value);
    const subDt = dt / SUBSTEPS;
    for (let sub = 0; sub < SUBSTEPS; sub++) {
      state.angle += omega * subDt;
      const vertices = getVertices();

      for (const ball of state.balls) {
        ball.vx += state.gravityX * subDt;
        ball.vy += state.gravityY * subDt;
        const drag = Math.exp(-AIR_DRAG * subDt);
        ball.vx *= drag;
        ball.vy *= drag;
        ball.x += ball.vx * subDt;
        ball.y += ball.vy * subDt;
        constrainBall(ball, vertices, omega);
      }

      if (controls.collisions.checked) {
        for (let i = 0; i < state.balls.length; i++) {
          for (let j = i + 1; j < state.balls.length; j++) {
            resolveBallPair(state.balls[i], state.balls[j]);
          }
        }
        // Ball-pair separation can press a ball through an edge. Put every
        // ball back inside the polygon after the pair pass.
        for (const ball of state.balls) constrainBall(ball, vertices, omega);
      }
    }
  }

  function drawBackground() {
    if (controls.trails.checked) {
      ctx.fillStyle = 'rgba(10, 10, 15, 0.16)';
      ctx.fillRect(0, 0, state.width, state.height);
    } else {
      ctx.fillStyle = '#0a0a0f';
      ctx.fillRect(0, 0, state.width, state.height);
    }

    const glowRadius = state.frameRadius * 1.65;
    const glow = ctx.createRadialGradient(state.centerX, state.centerY, 0, state.centerX, state.centerY, glowRadius);
    glow.addColorStop(0, 'rgba(22, 101, 142, 0.15)');
    glow.addColorStop(0.48, 'rgba(15, 63, 94, 0.075)');
    glow.addColorStop(1, 'rgba(10, 10, 15, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(state.centerX - glowRadius, state.centerY - glowRadius, glowRadius * 2, glowRadius * 2);
  }

  function drawBall(ball) {
    const { x, y, radius, hue, saturation, lightness } = ball;
    const glow = ctx.createRadialGradient(x, y, radius * 0.15, x, y, radius * 2.55);
    glow.addColorStop(0, `hsla(${hue}, ${saturation}%, ${lightness}%, 0.23)`);
    glow.addColorStop(0.42, `hsla(${hue}, ${saturation}%, ${lightness}%, 0.085)`);
    glow.addColorStop(1, `hsla(${hue}, ${saturation}%, ${lightness}%, 0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, radius * 2.55, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.shadowColor = `hsla(${hue}, ${saturation}%, ${lightness}%, .62)`;
    ctx.shadowBlur = Math.min(18, radius * 0.8);
    const body = ctx.createRadialGradient(
      x - radius * 0.35, y - radius * 0.4, radius * 0.08,
      x + radius * 0.12, y + radius * 0.12, radius * 1.15
    );
    body.addColorStop(0, `hsl(${hue}, ${saturation}%, ${Math.min(90, lightness + 24)}%)`);
    body.addColorStop(0.42, `hsl(${hue}, ${saturation}%, ${lightness}%)`);
    body.addColorStop(1, `hsl(${hue}, ${Math.min(100, saturation + 4)}%, ${Math.max(28, lightness - 20)}%)`);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = 'rgba(255, 255, 255, .82)';
    ctx.beginPath();
    ctx.arc(x - radius * 0.34, y - radius * 0.36, Math.max(1.1, radius * 0.14), 0, TAU);
    ctx.fill();
  }

  function drawFrame() {
    const vertices = getVertices();
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(vertices[0].x, vertices[0].y);
    for (let i = 1; i < vertices.length; i++) ctx.lineTo(vertices[i].x, vertices[i].y);
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = 'rgba(127, 216, 255, .94)';
    ctx.shadowColor = 'rgba(75, 188, 255, .9)';
    ctx.shadowBlur = 22;
    ctx.stroke();
    ctx.shadowBlur = 0;

    for (const vertex of vertices) {
      ctx.beginPath();
      ctx.arc(vertex.x, vertex.y, 3.1, 0, TAU);
      ctx.fillStyle = '#c5eeff';
      ctx.shadowColor = 'rgba(100, 200, 255, .95)';
      ctx.shadowBlur = 13;
      ctx.fill();
    }
    ctx.restore();
  }

  function render() {
    drawBackground();
    for (const ball of state.balls) drawBall(ball);
    drawFrame();
  }

  function frame(time) {
    if (!state.lastTime) state.lastTime = time;
    const elapsed = Math.min((time - state.lastTime) / 1000, 0.05);
    state.lastTime = time;
    const scaledDt = elapsed * Number(controls.timeScale.value);
    if (scaledDt > 0) step(scaledDt);
    render();
    requestAnimationFrame(frame);
  }

  function updateGravity() {
    const angleDegrees = Number(controls.gravityAngle.value);
    const angle = angleDegrees * Math.PI / 180;
    const strength = Number(controls.gravityStrength.value);
    state.gravityX = Math.sin(angle) * strength;
    state.gravityY = Math.cos(angle) * strength;
    const normalized = ((angleDegrees % 360) + 360) % 360;
    const arrow = ['↓', '→', '↑', '←'][Math.round(normalized / 90) % 4];
    document.getElementById('gravity-direction').value = arrow;
    document.getElementById('gravity-direction').textContent = arrow;
  }

  function setReadout(id, value) {
    const output = document.getElementById(id);
    output.value = value;
    output.textContent = value;
  }

  function bindRange(input, outputId, format, onInput) {
    const update = () => {
      const value = Number(input.value);
      if (outputId) setReadout(outputId, format(value));
      if (onInput) onInput(value);
    };
    input.addEventListener('input', update);
    update();
  }

  bindRange(controls.sides, 'sides-value', value => String(value), () => {
    const value = Number(controls.sides.value);
    document.getElementById('shape-name').textContent = names[value] || `${value}-sided polygon`;
    spawnBalls();
  });
  bindRange(controls.spin, 'spin-value', value => value.toFixed(2).replace(/0+$/, '').replace(/\.$/, ''));
  bindRange(controls.count, 'count-value', value => String(value), spawnBalls);
  bindRange(controls.variation, 'variation-value', value => `${value} px`, spawnBalls);
  bindRange(controls.bounce, 'bounce-value', value => value.toFixed(2));
  bindRange(controls.gravityAngle, null, null, updateGravity);
  bindRange(controls.gravityStrength, 'gravity-value', value => String(value), updateGravity);
  bindRange(controls.timeScale, 'time-value', value => `${value.toFixed(1)}×`);

  document.getElementById('explode').addEventListener('click', () => {
    for (const ball of state.balls) {
      const angle = Math.random() * TAU;
      const speed = 300 + Math.random() * 500;
      ball.vx += Math.cos(angle) * speed;
      ball.vy += Math.sin(angle) * speed;
    }
  });

  document.querySelectorAll('.section-heading').forEach(button => {
    button.addEventListener('click', () => {
      const expanded = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', String(!expanded));
      document.getElementById(button.getAttribute('aria-controls')).hidden = expanded;
    });
  });

  function showTooltip(control) {
    tooltip.textContent = control.dataset.tip;
    tooltip.style.display = 'block';
    tooltip.style.visibility = 'hidden';
    const controlRect = control.getBoundingClientRect();
    const tipRect = tooltip.getBoundingClientRect();
    let left = controlRect.right + 12;
    if (left + tipRect.width > window.innerWidth - 10) left = controlRect.left - tipRect.width - 12;
    left = Math.max(10, Math.min(left, window.innerWidth - tipRect.width - 10));
    const top = Math.max(10, Math.min(controlRect.top + controlRect.height / 2 - tipRect.height / 2, window.innerHeight - tipRect.height - 10));
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.style.visibility = 'visible';
  }

  function hideTooltip() { tooltip.style.display = 'none'; }
  document.querySelectorAll('.control[data-tip]').forEach(control => {
    control.addEventListener('mouseenter', () => showTooltip(control));
    control.addEventListener('mouseleave', hideTooltip);
    control.addEventListener('focusin', () => showTooltip(control));
    control.addEventListener('focusout', hideTooltip);
  });
  window.addEventListener('resize', () => {
    resize();
    state.lastTime = 0;
    hideTooltip();
  });

  updateGravity();
  resize();
  requestAnimationFrame(frame);
})();
