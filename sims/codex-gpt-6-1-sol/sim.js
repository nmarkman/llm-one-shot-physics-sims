(() => {
  'use strict';

  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const stage = document.querySelector('.stage');
  const $ = (id) => document.getElementById(id);
  const TAU = Math.PI * 2;
  const SUBSTEPS = 5;
  const BASE_RADIUS = 6;
  const MAX_SPEED = 2600; // Bounds energy growth at restitution > 1 and extreme packing.
  const defaults = Object.freeze({
    sides: 8, spin: 0.5, count: 40, variation: 18, bounce: 0.8,
    angle: 90, gravity: 700, time: 1, collisions: true, trails: false
  });
  const settings = { ...defaults };
  const shapeNames = {
    3: 'Triangle', 4: 'Square', 5: 'Pentagon', 6: 'Hexagon',
    7: 'Heptagon', 8: 'Octagon', 9: 'Nonagon', 10: 'Decagon',
    11: 'Hendecagon', 12: 'Dodecagon', 13: 'Tridecagon',
    14: 'Tetradecagon', 15: 'Pentadecagon', 16: 'Hexadecagon',
    17: 'Heptadecagon', 18: 'Octadecagon', 19: 'Enneadecagon', 20: 'Icosagon'
  };
  const palette = ['#68d8d0', '#93dfb5', '#b7dd84', '#eed07e', '#efa377',
    '#ec879c', '#cf8bd7', '#a89be5', '#81aee4', '#77cddf'];
  let width = 0, height = 0, centerX = 0, centerY = 0, radius = 0, dpr = 1, sceneScale = 1;
  let rotation = -Math.PI / 2 + Math.PI / defaults.sides;
  let balls = [], vertices = [], edges = [], paused = false;
  let lastTime = null, fpsElapsed = 0, fpsFrames = 0, freshFrame = true;
  let backgroundGlow, gridPath;

  function updateGeometry() {
    vertices = Array.from({ length: settings.sides }, (_, i) => {
      const angle = rotation + i * TAU / settings.sides;
      return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
    });
    edges = vertices.map((a, i) => {
      const b = vertices[(i + 1) % vertices.length];
      const dx = b.x - a.x, dy = b.y - a.y;
      const length = Math.hypot(dx, dy);
      // The vertices wind clockwise on the screen; (-dy, dx) points inward.
      return { ax: a.x, ay: a.y, nx: -dy / length, ny: dx / length };
    });
  }

  function makeSprite(r, color) {
    const sprite = document.createElement('canvas');
    const extent = r * 2.3;
    const scale = 2;
    sprite.width = sprite.height = Math.ceil(extent * 2 * scale);
    const c = sprite.getContext('2d');
    c.scale(scale, scale);
    c.translate(sprite.width / (2 * scale), sprite.height / (2 * scale));
    const glow = c.createRadialGradient(0, 0, r * 0.6, 0, 0, extent);
    glow.addColorStop(0, color + '28');
    glow.addColorStop(0.45, color + '12');
    glow.addColorStop(1, color + '00');
    c.fillStyle = glow;
    c.fillRect(-extent, -extent, extent * 2, extent * 2);
    c.beginPath();
    c.arc(0, 0, r, 0, TAU);
    c.fillStyle = color;
    c.fill();
    const shade = c.createRadialGradient(-r * 0.35, -r * 0.4, 0, 0, 0, r * 1.1);
    shade.addColorStop(0, '#ffffff19');
    shade.addColorStop(0.55, '#ffffff00');
    shade.addColorStop(1, '#00000024');
    c.fillStyle = shade;
    c.fill();
    c.beginPath();
    c.arc(-r * 0.3, -r * 0.35, Math.max(1, r * 0.115), 0, TAU);
    c.fillStyle = '#ffffffb5';
    c.fill();
    return { image: sprite, size: sprite.width / scale };
  }

  function initializeBalls() {
    // A disk inside the apothem fits every edge, including a triangle's sides.
    const apothem = radius * Math.cos(Math.PI / settings.sides);
    balls = [];
    for (let i = 0; i < settings.count; i++) {
      const r = BASE_RADIUS + Math.random() * settings.variation;
      const spawnRadius = Math.max(0, apothem - r - 3);
      let bestX = 0, bestY = 0, bestOverlap = Infinity;
      // Prefer separated spawns; an overfilled frame still starts fully inside.
      for (let attempt = 0; attempt < 90; attempt++) {
        const angle = Math.random() * TAU;
        const distance = Math.sqrt(Math.random()) * spawnRadius;
        const x = Math.cos(angle) * distance, y = Math.sin(angle) * distance;
        let overlap = 0;
        for (const other of balls) {
          overlap += Math.max(0, r + other.r + 2 - Math.hypot(x - other.x, y - other.y));
        }
        if (overlap < bestOverlap) {
          bestX = x; bestY = y; bestOverlap = overlap;
        }
        if (overlap === 0) break;
      }
      const color = palette[i % palette.length];
      balls.push({ x: bestX, y: bestY, vx: (Math.random() - 0.5) * 160,
        vy: (Math.random() - 0.5) * 160, r, invMass: 1 / (r * r),
        sprite: makeSprite(r, color) });
    }
    freshFrame = true;
  }

  function resize() {
    const rect = stage.getBoundingClientRect();
    const oldRadius = radius;
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    centerX = width / 2;
    const mobile = window.matchMedia('(max-width: 700px)').matches;
    const top = mobile ? 94 : Math.min(158, height * 0.3);
    const bottom = mobile ? 82 : Math.min(151, height * 0.25);
    centerY = top + Math.max(0, height - top - bottom) / 2;
    const availableRadius = Math.max(1, Math.min((width - (mobile ? 62 : 80)) / 2,
      (height - top - bottom) / 2, 360));
    // Scale the whole world on small screens so even a 46 px ball fits a triangle.
    radius = Math.max(100, availableRadius);
    sceneScale = availableRadius / radius;
    updateGeometry();
    backgroundGlow = ctx.createRadialGradient(centerX, centerY, 1, centerX, centerY, availableRadius * 1.6);
    backgroundGlow.addColorStop(0, '#18303a36');
    backgroundGlow.addColorStop(0.65, '#12232e18');
    backgroundGlow.addColorStop(1, '#0a0a0f00');
    gridPath = new Path2D();
    for (let x = 20; x < width; x += 28) {
      for (let y = 20; y < height; y += 28) {
        gridPath.moveTo(x + 0.65, y);
        gridPath.arc(x, y, 0.65, 0, TAU);
      }
    }
    if (!balls.length) initializeBalls();
    else {
      const scale = radius / oldRadius;
      for (const ball of balls) {
        ball.x *= scale; ball.y *= scale;
        constrainBall(ball, false);
      }
    }
    freshFrame = true;
    hideTooltip();
  }

  function limitVelocity(ball) {
    const speedSquared = ball.vx * ball.vx + ball.vy * ball.vy;
    if (speedSquared > MAX_SPEED * MAX_SPEED) {
      const scale = MAX_SPEED / Math.sqrt(speedSquared);
      ball.vx *= scale; ball.vy *= scale;
    }
  }

  function constrainBall(ball, respond = true) {
    // Repeated half-plane projections also resolve contact with acute corners.
    // Stop early when all signed distances are at least the ball's radius.
    for (let pass = 0; pass < 18; pass++) {
      let corrected = false;
      for (const edge of edges) {
        const distance = (ball.x - edge.ax) * edge.nx + (ball.y - edge.ay) * edge.ny;
        if (distance >= ball.r - 0.00001) continue;
        const contactX = ball.x - edge.nx * distance;
        const contactY = ball.y - edge.ny * distance;
        const penetration = ball.r - distance + 0.00001;
        ball.x += edge.nx * penetration;
        ball.y += edge.ny * penetration;
        corrected = true;
        if (!respond) continue;

        // v_wall = omega × r at the contact point, relative to polygon center.
        const wallVX = -settings.spin * contactY;
        const wallVY = settings.spin * contactX;
        const relativeVX = ball.vx - wallVX, relativeVY = ball.vy - wallVY;
        const normalSpeed = relativeVX * edge.nx + relativeVY * edge.ny;
        if (normalSpeed >= 0) continue;
        const normalImpulse = -(1 + settings.bounce) * normalSpeed;
        ball.vx += normalImpulse * edge.nx;
        ball.vy += normalImpulse * edge.ny;

        // Tangential friction lets the spinning frame carry and fling balls.
        const tx = -edge.ny, ty = edge.nx;
        const tangentSpeed = relativeVX * tx + relativeVY * ty;
        const frictionLimit = normalImpulse * 0.3;
        const friction = Math.max(-frictionLimit, Math.min(frictionLimit, -tangentSpeed * 0.2));
        ball.vx += friction * tx;
        ball.vy += friction * ty;
      }
      if (!corrected) break;
    }
  }

  function resolveBallCollisions() {
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const minDistance = a.r + b.r;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared >= minDistance * minDistance) continue;
        const distance = Math.sqrt(distanceSquared);
        // A deterministic fallback separates even exactly coincident centers.
        const nx = distance > 1e-8 ? dx / distance : Math.cos(i * 2.4 + j);
        const ny = distance > 1e-8 ? dy / distance : Math.sin(i * 2.4 + j);
        const inverseMassSum = a.invMass + b.invMass;
        const correction = (minDistance - distance + 0.001) / inverseMassSum;
        a.x -= nx * correction * a.invMass;
        a.y -= ny * correction * a.invMass;
        b.x += nx * correction * b.invMass;
        b.y += ny * correction * b.invMass;

        const normalSpeed = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (normalSpeed >= 0) continue;
        const impulse = -(1 + 0.9) * normalSpeed / inverseMassSum;
        a.vx -= impulse * nx * a.invMass;
        a.vy -= impulse * ny * a.invMass;
        b.vx += impulse * nx * b.invMass;
        b.vy += impulse * ny * b.invMass;
      }
    }
  }

  function step(frameDt) {
    const dt = frameDt * settings.time / SUBSTEPS;
    if (dt <= 0 || paused) return;
    const gravityAngle = settings.angle * Math.PI / 180;
    const gx = Math.cos(gravityAngle) * settings.gravity;
    const gy = Math.sin(gravityAngle) * settings.gravity;
    const damping = Math.exp(-0.12 * dt);
    for (let substep = 0; substep < SUBSTEPS; substep++) {
      rotation = (rotation + settings.spin * dt) % TAU;
      updateGeometry();
      for (const ball of balls) {
        ball.vx = (ball.vx + gx * dt) * damping;
        ball.vy = (ball.vy + gy * dt) * damping;
        limitVelocity(ball);
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;
        constrainBall(ball);
      }
      if (settings.collisions) {
        for (let iteration = 0; iteration < 2; iteration++) {
          resolveBallCollisions();
          // Pair separation can push another ball through a wall: always re-constrain.
          for (const ball of balls) constrainBall(ball);
        }
      }
      for (const ball of balls) limitVelocity(ball);
    }
  }

  function polygonPath() {
    ctx.beginPath();
    ctx.moveTo(vertices[0].x, vertices[0].y);
    for (let i = 1; i < vertices.length; i++) ctx.lineTo(vertices[i].x, vertices[i].y);
    ctx.closePath();
  }

  function render() {
    const trailing = settings.trails && !freshFrame && !paused && settings.time > 0;
    // Fading the old frame, rather than clearing, produces actual motion trails.
    ctx.fillStyle = trailing ? 'rgba(0, 0, 0, 0.18)' : '#0a0a0f';
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.globalAlpha = trailing ? 0.18 : 1;
    ctx.fillStyle = backgroundGlow;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#90a6c011';
    ctx.fill(gridPath);
    ctx.restore();

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.scale(sceneScale, sceneScale);
    // A quiet center marker gives the rotating frame a visual anchor.
    ctx.strokeStyle = '#64c8ff13';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-5, 0); ctx.lineTo(5, 0);
    ctx.moveTo(0, -5); ctx.lineTo(0, 5);
    ctx.stroke();
    polygonPath();
    ctx.fillStyle = '#64c8ff02';
    ctx.fill();
    for (const ball of balls) {
      const { image, size } = ball.sprite;
      ctx.drawImage(image, ball.x - size / 2, ball.y - size / 2, size, size);
    }
    polygonPath();
    ctx.strokeStyle = 'rgba(100, 200, 255, 0.75)';
    ctx.lineWidth = 1.6;
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(100, 200, 255, 0.65)';
    ctx.shadowBlur = 16;
    ctx.stroke();
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#b9e7ff';
    for (const vertex of vertices) {
      ctx.beginPath(); ctx.arc(vertex.x, vertex.y, 2.4, 0, TAU); ctx.fill();
    }
    ctx.restore();
    freshFrame = false;
  }

  function syncControl(key) {
    const input = $(key);
    if (input.type === 'checkbox') { input.checked = settings[key]; return; }
    input.value = settings[key];
    const value = settings[key];
    const fill = (value - Number(input.min)) / (Number(input.max) - Number(input.min)) * 100;
    input.style.setProperty('--fill', fill + '%');
    const output = $(key + '-value');
    switch (key) {
      case 'spin': output.innerHTML = `${value.toFixed(2)} <span class="unit">rad/s</span>`; break;
      case 'variation': output.innerHTML = `${value} <span class="unit">px</span>`; break;
      case 'bounce': output.textContent = value.toFixed(2); break;
      case 'angle': {
        const arrows = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];
        output.innerHTML = `${arrows[Math.round(value / 45) % 8]} <span class="unit">${value}°</span>`;
        input.setAttribute('aria-valuetext', `${value} degrees`);
        break;
      }
      case 'gravity': output.innerHTML = `${value} <span class="unit">px/s²</span>`; break;
      case 'time': output.innerHTML = `${value.toFixed(2)}<span class="unit">×</span>`; break;
      default: output.textContent = value;
    }
    if (key === 'sides') {
      $('shape-name').textContent = shapeNames[value];
      $('scene-shape').textContent = shapeNames[value].toUpperCase();
      $('side-stat').textContent = String(value).padStart(2, '0');
      input.setAttribute('aria-valuetext', `${value} sides, ${shapeNames[value]}`);
    }
    if (key === 'count') $('body-stat').textContent = value;
  }

  function syncPlayback() {
    const stopped = paused || settings.time === 0;
    $('status').textContent = stopped ? 'PAUSED' : 'LIVE';
    $('live-indicator').classList.toggle('paused', stopped);
    $('pause').setAttribute('aria-label', stopped ? 'Resume simulation' : 'Pause simulation');
    $('pause').innerHTML = stopped
      ? '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m5 3 8 5-8 5Z"/></svg>'
      : '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3v10M11 3v10"/></svg>';
  }

  for (const key of Object.keys(defaults)) {
    syncControl(key);
    $(key).addEventListener('input', (event) => {
      settings[key] = event.target.type === 'checkbox' ? event.target.checked : Number(event.target.value);
      syncControl(key);
      if (key === 'sides') updateGeometry();
      if (['sides', 'count', 'variation'].includes(key)) initializeBalls();
      if (key === 'trails') freshFrame = true;
      if (key === 'time') syncPlayback();
    });
  }

  $('explode').addEventListener('click', () => {
    for (const ball of balls) {
      const angle = Math.random() * TAU;
      const impulse = 300 + Math.random() * 500;
      ball.vx += Math.cos(angle) * impulse;
      ball.vy += Math.sin(angle) * impulse;
    }
  });

  $('reset').addEventListener('click', () => {
    Object.assign(settings, defaults);
    paused = false;
    rotation = -Math.PI / 2 + Math.PI / defaults.sides;
    for (const key of Object.keys(defaults)) syncControl(key);
    syncPlayback();
    updateGeometry();
    initializeBalls();
    hideTooltip();
  });

  function togglePause() {
    if (settings.time === 0) {
      settings.time = 1;
      syncControl('time');
      paused = false;
    } else paused = !paused;
    syncPlayback();
  }
  $('pause').addEventListener('click', togglePause);
  document.addEventListener('keydown', (event) => {
    if (event.code !== 'Space' || event.repeat || event.altKey || event.ctrlKey || event.metaKey ||
      event.target.closest('input, button, summary, textarea, select, [contenteditable="true"]')) return;
    event.preventDefault();
    togglePause();
  });

  const tooltip = $('tooltip');
  let tooltipOwner = null;
  function hideTooltip() {
    tooltip.classList.remove('visible');
    if (tooltipOwner) {
      const target = tooltipOwner.querySelector('input') || tooltipOwner;
      const descriptions = (target.getAttribute('aria-describedby') || '').split(' ').filter((id) => id && id !== 'tooltip');
      if (descriptions.length) target.setAttribute('aria-describedby', descriptions.join(' '));
      else target.removeAttribute('aria-describedby');
    }
    tooltipOwner = null;
  }
  function showTooltip(owner) {
    hideTooltip();
    tooltipOwner = owner;
    tooltip.textContent = owner.dataset.tooltip;
    const target = owner.querySelector('input') || owner;
    const descriptions = target.getAttribute('aria-describedby');
    target.setAttribute('aria-describedby', [descriptions, 'tooltip'].filter(Boolean).join(' '));
    const rect = owner.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const ownerPanel = owner.closest('.panel');
    const anchorRight = ownerPanel ? ownerPanel.getBoundingClientRect().right : rect.right;
    let left = Math.max(rect.right, anchorRight) + 14;
    let top = rect.top + rect.height / 2 - tooltipRect.height / 2;
    if (left + tooltipRect.width > window.innerWidth - 12) {
      // Narrow screens have no room at the right; place it above the control.
      left = Math.max(12, Math.min(rect.left, window.innerWidth - tooltipRect.width - 12));
      top = rect.top - tooltipRect.height - 10;
    }
    tooltip.style.left = left + 'px';
    tooltip.style.top = Math.max(10, Math.min(top, window.innerHeight - tooltipRect.height - 10)) + 'px';
    tooltip.classList.add('visible');
  }
  for (const owner of document.querySelectorAll('[data-tooltip]')) {
    owner.addEventListener('mouseenter', () => showTooltip(owner));
    owner.addEventListener('mouseleave', hideTooltip);
    owner.addEventListener('focusin', () => showTooltip(owner));
    owner.addEventListener('focusout', hideTooltip);
    owner.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'touch') hideTooltip();
    });
  }
  document.querySelector('.panel').addEventListener('scroll', hideTooltip, { passive: true });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') hideTooltip(); });
  document.addEventListener('visibilitychange', () => { lastTime = null; });

  function animate(now) {
    const rawDt = lastTime === null ? 1 / 60 : Math.max(0, (now - lastTime) / 1000);
    lastTime = now;
    // Avoid a large jump when a background tab returns or a frame stalls.
    step(Math.min(rawDt, 1 / 30));
    render();
    fpsElapsed += rawDt;
    fpsFrames++;
    if (fpsElapsed >= 0.5) {
      $('fps').textContent = Math.round(fpsFrames / fpsElapsed) + ' FPS';
      fpsElapsed = 0; fpsFrames = 0;
    }
    requestAnimationFrame(animate);
  }

  new ResizeObserver(resize).observe(stage);
  resize();
  syncPlayback();
  requestAnimationFrame(animate);
})();
