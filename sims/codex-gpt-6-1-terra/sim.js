(() => {
  'use strict';
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const $ = id => document.getElementById(id);
  const controls = {
    sides: $('sides'), spin: $('spin'), count: $('count'), size: $('size'),
    bounce: $('bounce'), collisions: $('collisions'), angle: $('gravity-angle'),
    gravity: $('gravity'), time: $('time'), trails: $('trails')
  };
  const names = ['Triangle','Square','Pentagon','Hexagon','Heptagon','Octagon','Nonagon','Decagon','Hendecagon','Dodecagon','Tridecagon','Tetradecagon','Pentadecagon','Hexadecagon','Heptadecagon','Octadecagon','Enneadecagon','Icosagon'];
  const colors = ['#6fd9ff','#ff7898','#f7bd69','#aa8bff','#71e8bd','#f48bdd','#f8e17f','#82aaff'];
  let width = 0, height = 0, centerX = 0, centerY = 0, radius = 0;
  let rotation = -Math.PI / 2, balls = [], lastTime = 0, clearNextFrame = true;
  const value = key => Number(controls[key].value);

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth; height = window.innerHeight;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    centerX = width / 2; centerY = height / 2;
    radius = Math.max(30, Math.min(width * 0.31, height * 0.39, 390));
    clearNextFrame = true;
    if (balls.length) initBalls();
  }

  function initBalls() {
    const apothem = radius * Math.cos(Math.PI / value('sides'));
    const count = value('count');
    balls = [];
    for (let i = 0; i < count; i++) {
      // Clamp only for unusually small viewports, where the requested ball could not fit.
      const r = Math.min(6 + Math.random() * value('size'), Math.max(1, apothem * 0.75));
      let x = 0, y = 0;
      for (let attempt = 0; attempt < 100; attempt++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.sqrt(Math.random()) * Math.max(0, apothem - r - 1);
        x = centerX + Math.cos(angle) * distance;
        y = centerY + Math.sin(angle) * distance;
        if (!balls.some(other => Math.hypot(x - other.x, y - other.y) < r + other.r + 1)) break;
      }
      balls.push({x, y, r, mass: r * r, vx: (Math.random() - 0.5) * 100, vy: (Math.random() - 0.5) * 100, color: colors[i % colors.length]});
    }
    clearNextFrame = true;
  }

  function edges() {
    const result = [];
    const sides = value('sides');
    for (let i = 0; i < sides; i++) {
      const a = rotation + i * Math.PI * 2 / sides;
      const b = rotation + (i + 1) * Math.PI * 2 / sides;
      const x = centerX + Math.cos(a) * radius, y = centerY + Math.sin(a) * radius;
      const dx = Math.cos(b) * radius + centerX - x, dy = Math.sin(b) * radius + centerY - y;
      const length = Math.hypot(dx, dy);
      result.push({x, y, nx: -dy / length, ny: dx / length});
    }
    return result;
  }

  function constrain(ball, polygonEdges, applyImpulse) {
    // A convex polygon is the intersection of its inward-facing edge half-planes.
    // Multiple passes handle corrections near corners.
    for (let pass = 0; pass < 12; pass++) {
      let corrected = false;
      for (const edge of polygonEdges) {
        const distance = (ball.x - edge.x) * edge.nx + (ball.y - edge.y) * edge.ny;
        if (distance >= ball.r) continue;
        const penetration = ball.r - distance;
        corrected = true;
        ball.x += edge.nx * penetration;
        ball.y += edge.ny * penetration;
        if (!applyImpulse) continue;
        const contactX = ball.x - edge.nx * ball.r;
        const contactY = ball.y - edge.ny * ball.r;
        const omega = value('spin');
        const wallVx = -omega * (contactY - centerY);
        const wallVy = omega * (contactX - centerX);
        const relX = ball.vx - wallVx, relY = ball.vy - wallVy;
        const normalSpeed = relX * edge.nx + relY * edge.ny;
        if (normalSpeed < 0) {
          const impulse = -(1 + value('bounce')) * normalSpeed;
          ball.vx += impulse * edge.nx;
          ball.vy += impulse * edge.ny;
          // Friction transfers some tangential motion from the spinning wall.
          const tx = -edge.ny, ty = edge.nx;
          const tangentSpeed = relX * tx + relY * ty;
          const friction = Math.max(-impulse * 0.18, Math.min(impulse * 0.18, -tangentSpeed));
          ball.vx += friction * tx; ball.vy += friction * ty;
        }
      }
      if (!corrected) break;
    }
  }

  function collideBalls() {
    for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {
      const a = balls[i], b = balls[j];
      let dx = b.x - a.x, dy = b.y - a.y;
      const minimum = a.r + b.r, distanceSquared = dx * dx + dy * dy;
      if (distanceSquared >= minimum * minimum) continue;
      let distance = Math.sqrt(distanceSquared);
      if (distance < 0.0001) { const angle = Math.random() * Math.PI * 2; dx = Math.cos(angle); dy = Math.sin(angle); distance = 1; }
      const nx = dx / distance, ny = dy / distance;
      const inverseA = 1 / a.mass, inverseB = 1 / b.mass, inverseSum = inverseA + inverseB;
      const overlap = minimum - distance;
      a.x -= nx * overlap * inverseA / inverseSum; a.y -= ny * overlap * inverseA / inverseSum;
      b.x += nx * overlap * inverseB / inverseSum; b.y += ny * overlap * inverseB / inverseSum;
      const relativeSpeed = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (relativeSpeed < 0) {
        const impulse = -(1 + 0.9) * relativeSpeed / inverseSum;
        a.vx -= impulse * inverseA * nx; a.vy -= impulse * inverseA * ny;
        b.vx += impulse * inverseB * nx; b.vy += impulse * inverseB * ny;
      }
    }
  }

  function update(dt) {
    const step = dt * value('time') / 5;
    if (!step) return;
    const angle = value('angle') * Math.PI / 180;
    const gx = -Math.sin(angle) * value('gravity'), gy = Math.cos(angle) * value('gravity');
    for (let substep = 0; substep < 5; substep++) {
      rotation += value('spin') * step;
      const polygonEdges = edges();
      const damping = Math.pow(0.999, step * 60);
      for (const ball of balls) {
        ball.vx = (ball.vx + gx * step) * damping; ball.vy = (ball.vy + gy * step) * damping;
        ball.x += ball.vx * step; ball.y += ball.vy * step;
        constrain(ball, polygonEdges, true);
      }
      if (controls.collisions.checked) {
        collideBalls();
        for (const ball of balls) constrain(ball, polygonEdges, true);
      }
    }
  }

  function draw() {
    ctx.fillStyle = controls.trails.checked && !clearNextFrame ? 'rgba(0, 0, 0, 0.22)' : '#0a0a0f';
    ctx.fillRect(0, 0, width, height); clearNextFrame = false;
    const glow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius * 1.55);
    glow.addColorStop(0, 'rgba(26, 76, 97, 0.13)'); glow.addColorStop(0.65, 'rgba(18, 45, 65, 0.05)'); glow.addColorStop(1, 'rgba(10, 10, 15, 0)');
    ctx.fillStyle = glow; ctx.fillRect(centerX - radius * 1.55, centerY - radius * 1.55, radius * 3.1, radius * 3.1);
    const sides = value('sides');
    ctx.save(); ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = rotation + i * Math.PI * 2 / sides;
      const x = centerX + Math.cos(a) * radius, y = centerY + Math.sin(a) * radius;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.strokeStyle = 'rgba(112, 211, 255, 0.8)'; ctx.lineWidth = 1.5; ctx.shadowColor = '#64c8ff'; ctx.shadowBlur = 15; ctx.stroke();
    for (let i = 0; i < sides; i++) {
      const a = rotation + i * Math.PI * 2 / sides;
      ctx.beginPath(); ctx.arc(centerX + Math.cos(a) * radius, centerY + Math.sin(a) * radius, 2.5, 0, Math.PI * 2); ctx.fillStyle = '#c2efff'; ctx.fill();
    }
    ctx.restore();
    for (const ball of balls) {
      const halo = ctx.createRadialGradient(ball.x, ball.y, ball.r * 0.3, ball.x, ball.y, ball.r * 2.1);
      halo.addColorStop(0, ball.color + '66'); halo.addColorStop(1, ball.color + '00');
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r * 2.1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2); ctx.fillStyle = ball.color; ctx.fill();
      const shine = ctx.createRadialGradient(ball.x - ball.r * .35, ball.y - ball.r * .4, 0, ball.x, ball.y, ball.r * 1.2);
      shine.addColorStop(0, 'rgba(255,255,255,.38)'); shine.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = shine; ctx.fill();
      ctx.beginPath(); ctx.arc(ball.x - ball.r * .32, ball.y - ball.r * .38, Math.max(1, ball.r * .13), 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fill();
    }
  }
  function frame(now) {
    const dt = lastTime ? Math.min((now - lastTime) / 1000, 1 / 30) : 0;
    lastTime = now; update(dt); draw(); requestAnimationFrame(frame);
  }

  function refreshControl(input) {
    const min = Number(input.min), max = Number(input.max);
    input.style.setProperty('--progress', `${(Number(input.value) - min) / (max - min) * 100}%`);
  }
  document.querySelectorAll('input[type="range"]').forEach(input => {
    refreshControl(input);
    input.addEventListener('input', () => {
      refreshControl(input);
      const output = $(`${input.id}-value`);
      if (input === controls.angle) {
        const arrows = ['↓','↙','←','↖','↑','↗','→','↘'];
        output.textContent = `${arrows[Math.round(Number(input.value) / 45) % 8]} ${input.value}°`;
      } else if (input === controls.time) output.textContent = `${Number(input.value).toFixed(1)}×`;
      else if (input === controls.spin) output.textContent = Number(input.value).toFixed(1);
      else if (input === controls.bounce) output.textContent = Number(input.value).toFixed(2);
      else output.textContent = input.value;
      if (input === controls.sides) $('shape-name').textContent = names[value('sides') - 3];
      if (input === controls.sides || input === controls.count || input === controls.size) initBalls();
    });
  });
  controls.trails.addEventListener('change', () => { clearNextFrame = true; });
  $('explode').addEventListener('click', () => {
    for (const ball of balls) {
      const angle = Math.random() * Math.PI * 2, speed = 300 + Math.random() * 500;
      ball.vx += Math.cos(angle) * speed; ball.vy += Math.sin(angle) * speed;
    }
  });
  document.querySelectorAll('.section-header').forEach(button => button.addEventListener('click', () => {
    const expanded = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!expanded));
    $(button.getAttribute('aria-controls')).hidden = expanded;
  }));
  const tooltip = $('tooltip');
  function showTooltip(control) {
    tooltip.textContent = control.dataset.tooltip;
    tooltip.classList.add('visible');
    const rect = control.getBoundingClientRect(), tip = tooltip.getBoundingClientRect();
    // Prefer the right of the panel; fall back to the left on narrow screens.
    let left = document.querySelector('.panel').getBoundingClientRect().right + 10;
    if (left + tip.width > width - 8) left = Math.max(8, rect.left - tip.width - 10);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${Math.max(8, Math.min(height - tip.height - 8, rect.top + (rect.height - tip.height) / 2))}px`;
  }
  document.querySelectorAll('[data-tooltip]').forEach(control => {
    control.addEventListener('mouseenter', () => showTooltip(control));
    control.addEventListener('mouseleave', () => tooltip.classList.remove('visible'));
    control.addEventListener('focusin', () => showTooltip(control));
    control.addEventListener('focusout', () => tooltip.classList.remove('visible'));
  });
  document.querySelector('.panel').addEventListener('scroll', () => tooltip.classList.remove('visible'));
  window.addEventListener('resize', resize);
  resize(); initBalls(); requestAnimationFrame(frame);
})();
