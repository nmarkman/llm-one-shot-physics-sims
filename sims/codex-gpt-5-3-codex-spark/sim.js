const canvas = document.getElementById('simCanvas');
const ctx = canvas.getContext('2d');

const state = {
  sides: 8,
  spinSpeed: 1,
  ballCount: 40,
  sizeVariation: 20,
  bounciness: 0.88,
  collisionEnabled: true,
  gravityAngle: 0,
  gravityStrength: 700,
  timeScale: 1,
  trails: true,
  damping: 0.995,
  rotation: -Math.PI / 2,
};

const ui = {
  sidesRange: document.getElementById('sidesRange'),
  sidesValue: document.getElementById('sidesValue'),
  shapeName: document.getElementById('shapeName'),
  spinRange: document.getElementById('spinRange'),
  spinValue: document.getElementById('spinValue'),
  countRange: document.getElementById('countRange'),
  countValue: document.getElementById('countValue'),
  sizeRange: document.getElementById('sizeRange'),
  sizeValue: document.getElementById('sizeValue'),
  bouncyRange: document.getElementById('bouncyRange'),
  bouncyValue: document.getElementById('bouncyValue'),
  collisionToggle: document.getElementById('collisionToggle'),
  angleRange: document.getElementById('angleRange'),
  angleValue: document.getElementById('angleValue'),
  gravityRange: document.getElementById('gravityRange'),
  gravityValue: document.getElementById('gravityValue'),
  timeScaleRange: document.getElementById('timeScaleRange'),
  timeScaleValue: document.getElementById('timeScaleValue'),
  trailToggle: document.getElementById('trailToggle'),
  explodeBtn: document.getElementById('explodeBtn'),
  panel: document.getElementById('controlPanel'),
  tooltip: document.getElementById('tooltip'),
};

const ac = {
  x: 0,
  y: 0,
};

const polygon = {
  centerX: 0,
  centerY: 0,
  radius: 0,
  apothem: 0,
  vertices: [],
  normals: [],
};

const balls = [];
let lastTime = performance.now();

class Ball {
  constructor(x, y, r, hue) {
    this.x = x;
    this.y = y;
    this.vx = (Math.random() - 0.5) * 40;
    this.vy = (Math.random() - 0.5) * 40;
    this.radius = r;
    this.mass = r * r + 2;
    this.hue = hue;
  }
}

function shapeName(sides) {
  const names = {
    3: 'Triangle',
    4: 'Square',
    5: 'Pentagon',
    6: 'Hexagon',
    7: 'Heptagon',
    8: 'Octagon',
    9: 'Nonagon',
    10: 'Decagon',
  };
  return names[sides] || `${sides}-gon`;
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  polygon.centerX = rect.width / 2;
  polygon.centerY = rect.height / 2;
  buildPolygon();
}

function buildPolygon() {
  const r = Math.min(polygon.centerX, polygon.centerY) * 0.45;
  polygon.radius = r;
  polygon.apothem = r * Math.cos(Math.PI / state.sides);
  polygon.vertices = [];
  polygon.normals = [];

  const angleStep = (Math.PI * 2) / state.sides;
  for (let i = 0; i < state.sides; i++) {
    const a = state.rotation + i * angleStep;
    polygon.vertices.push({
      x: polygon.centerX + r * Math.cos(a),
      y: polygon.centerY + r * Math.sin(a),
    });
  }

  for (let i = 0; i < state.sides; i++) {
    const a = polygon.vertices[i];
    const b = polygon.vertices[(i + 1) % state.sides];
    const ex = b.x - a.x;
    const ey = b.y - a.y;

    let nx = -ey;
    let ny = ex;
    const len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;

    // Inward normal: must point toward center.
    const cx = polygon.centerX - a.x;
    const cy = polygon.centerY - a.y;
    if (cx * nx + cy * ny < 0) {
      nx = -nx;
      ny = -ny;
    }

    polygon.normals.push({ x: nx, y: ny });
  }
}

function updateGravityVector() {
  const rad = (state.gravityAngle * Math.PI) / 180;
  ac.x = -Math.sin(rad) * state.gravityStrength;
  ac.y = Math.cos(rad) * state.gravityStrength;
}

function randomInPolygonSpawn(maxRadius) {
  const maxR = Math.max(3, maxRadius - 1.5);
  const rr = Math.sqrt(Math.random()) * maxR;
  const a = Math.random() * Math.PI * 2;
  return {
    x: polygon.centerX + rr * Math.cos(a),
    y: polygon.centerY + rr * Math.sin(a),
  };
}

function initBalls() {
  balls.length = 0;
  const maxRadius = 6 + state.sizeVariation;
  const spawnR = polygon.apothem - maxRadius - 2;

  for (let i = 0; i < state.ballCount; i++) {
    const r = 6 + Math.random() * state.sizeVariation;
    const p = randomInPolygonSpawn(spawnR);
    const hue = Math.floor(Math.random() * 360);
    balls.push(new Ball(p.x, p.y, r, hue));
  }
}

function drawBackground() {
  const radius = Math.max(canvas.width, canvas.height);
  const g = ctx.createRadialGradient(polygon.centerX, polygon.centerY, polygon.apothem * 0.2, polygon.centerX, polygon.centerY, radius);
  g.addColorStop(0, 'rgba(100, 200, 255, 0.16)');
  g.addColorStop(0.4, 'rgba(100, 200, 255, 0.05)');
  g.addColorStop(1, 'rgba(10, 10, 15, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width / window.devicePixelRatio, canvas.height / window.devicePixelRatio);
}

function drawPolygon() {
  if (!polygon.vertices.length) {
    return;
  }

  ctx.save();
  ctx.beginPath();
  polygon.vertices.forEach((v, i) => {
    if (i === 0) {
      ctx.moveTo(v.x, v.y);
    } else {
      ctx.lineTo(v.x, v.y);
    }
  });
  ctx.closePath();

  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(100, 200, 255, 0.95)';
  ctx.shadowColor = 'rgba(120, 220, 255, 0.95)';
  ctx.shadowBlur = 24;
  ctx.stroke();
  ctx.restore();

  polygon.vertices.forEach((v) => {
    ctx.beginPath();
    ctx.fillStyle = '#d7eeff';
    ctx.arc(v.x, v.y, 3.4, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawBalls() {
  for (const b of balls) {
    const gx = Math.min(255, 230 + 25 * Math.cos((b.hue * Math.PI) / 180));
    const gy = Math.min(255, 230 + 25 * Math.sin((b.hue * Math.PI) / 180));
    const gz = Math.min(255, 220 + 35 * Math.cos((b.hue * 2 * Math.PI) / 360));
    const grad = ctx.createRadialGradient(
      b.x - b.radius * 0.35,
      b.y - b.radius * 0.35,
      Math.max(0.2, b.radius * 0.2),
      b.x,
      b.y,
      b.radius,
    );

    grad.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
    grad.addColorStop(0.2, 'rgba(255, 255, 255, 0.45)');
    grad.addColorStop(0.35, `rgba(${gx}, ${gy}, ${gz}, 0.95)`);
    grad.addColorStop(1, `rgba(${gx - 20}, ${gy - 30}, ${gz}, 1)`);

    ctx.save();
    ctx.shadowColor = 'rgba(100, 200, 255, 0.55)';
    ctx.shadowBlur = Math.max(4, b.radius * 1.4);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.arc(b.x - b.radius * 0.35, b.y - b.radius * 0.35, Math.max(1, b.radius * 0.19), 0, Math.PI * 2);
    ctx.fill();
  }
}

function clampInsidePolygon(ball, edgeIndex, dist, normal, vertex, contact) {
  if (dist >= ball.radius) {
    return;
  }

  const push = ball.radius - dist;
  const nx = normal.x;
  const ny = normal.y;

  ball.x += nx * push;
  ball.y += ny * push;

  // Spinning wall velocity at the contact point.
  const wallX = -(state.spinSpeed * (contact.y - polygon.centerY));
  const wallY = state.spinSpeed * (contact.x - polygon.centerX);

  const relX = ball.vx - wallX;
  const relY = ball.vy - wallY;
  const vn = relX * nx + relY * ny;

  const tx = -ny;
  const ty = nx;
  const vt = relX * tx + relY * ty;

  const vnPost = vn < 0 ? -state.bounciness * vn : vn;
  const vtPost = vt * 0.93;

  ball.vx = wallX + nx * vnPost + tx * vtPost;
  ball.vy = wallY + ny * vnPost + ty * vtPost;
}

function keepBallInside(ball) {
  for (let i = 0; i < state.sides; i++) {
    const a = polygon.vertices[i];
    const n = polygon.normals[i];

    const dx = ball.x - a.x;
    const dy = ball.y - a.y;
    const dist = dx * n.x + dy * n.y;

    if (dist >= ball.radius) {
      continue;
    }

    const px = ball.x - n.x * dist;
    const py = ball.y - n.y * dist;
    clampInsidePolygon(ball, i, dist, n, a, { x: px, y: py });
  }
}

function resolveBallCollisions() {
  const e = Math.max(0, Math.min(1.2, state.bounciness));
  for (let i = 0; i < balls.length; i++) {
    const b1 = balls[i];
    for (let j = i + 1; j < balls.length; j++) {
      const b2 = balls[j];

      const dx = b2.x - b1.x;
      const dy = b2.y - b1.y;
      const distSq = dx * dx + dy * dy;
      const minDist = b1.radius + b2.radius;

      if (distSq >= minDist * minDist) {
        continue;
      }

      const dist = Math.sqrt(distSq) || 1e-6;
      const nx = dx / dist;
      const ny = dy / dist;

      const rvx = b1.vx - b2.vx;
      const rvy = b1.vy - b2.vy;
      const velAlong = rvx * nx + rvy * ny;
      if (velAlong < 0) {
        const inv1 = 1 / b1.mass;
        const inv2 = 1 / b2.mass;

        const j = -(1 + e) * velAlong / (inv1 + inv2);
        const ix = nx * j;
        const iy = ny * j;

        b1.vx += ix * inv1;
        b1.vy += iy * inv1;
        b2.vx -= ix * inv2;
        b2.vy -= iy * inv2;
      }

      const overlap = minDist - dist;
      if (overlap > 0) {
        const inv1 = 1 / b1.mass;
        const inv2 = 1 / b2.mass;
        const invSum = inv1 + inv2;
        const penetration = overlap * 0.85;
        const move1 = (penetration * inv1) / invSum;
        const move2 = (penetration * inv2) / invSum;

        b1.x -= nx * move1;
        b1.y -= ny * move1;
        b2.x += nx * move2;
        b2.y += ny * move2;
      }
    }
  }
}

function stepSimulation(dt) {
  if (dt <= 0) {
    return;
  }

  const substeps = 5;
  const h = (dt * state.timeScale) / substeps;

  for (let s = 0; s < substeps; s++) {
    state.rotation += state.spinSpeed * h;
    buildPolygon();

    for (const b of balls) {
      b.vx += ac.x * h;
      b.vy += ac.y * h;

      b.x += b.vx * h;
      b.y += b.vy * h;

      b.vx *= state.damping;
      b.vy *= state.damping;

      keepBallInside(b);
    }

    if (state.collisionEnabled) {
      resolveBallCollisions();
      for (const b of balls) {
        keepBallInside(b);
      }
    }
  }
}

function renderFrame() {
  const width = canvas.width / window.devicePixelRatio;
  const height = canvas.height / window.devicePixelRatio;

  if (state.trails) {
    ctx.fillStyle = 'rgba(10, 10, 15, 0.19)';
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, width, height);
  }

  drawBackground();
  drawPolygon();
  drawBalls();
}

function tick(time) {
  const dt = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;

  stepSimulation(dt);
  renderFrame();

  requestAnimationFrame(tick);
}

function showTooltip(event) {
  const row = event.currentTarget;
  const text = row.dataset.tooltip;
  if (!text) {
    return;
  }

  ui.tooltip.textContent = text;
  ui.tooltip.classList.add('show');
  const rect = row.getBoundingClientRect();
  const left = Math.min(window.innerWidth - 16 - ui.tooltip.offsetWidth, rect.right + 10);
  const top = Math.min(window.innerHeight - 16 - ui.tooltip.offsetHeight, rect.top + 6);

  ui.tooltip.style.left = `${Math.max(16, left)}px`;
  ui.tooltip.style.top = `${Math.max(16, top)}px`;
}

function hideTooltip() {
  ui.tooltip.classList.remove('show');
}

function bindTooltips() {
  const rows = document.querySelectorAll('[data-tooltip]');
  rows.forEach((row) => {
    row.addEventListener('mouseenter', showTooltip);
    row.addEventListener('mouseleave', hideTooltip);
    row.addEventListener('mousemove', showTooltip);
  });
}

function setAngleBadge(angle) {
  const a = ((angle % 360) + 360) % 360;
  let arrow = '→';
  if (a < 45 || a >= 315) {
    arrow = '↓';
  } else if (a < 135) {
    arrow = '←';
  } else if (a < 225) {
    arrow = '↑';
  } else {
    arrow = '→';
  }
  ui.angleValue.textContent = arrow;
}

function bindControls() {
  ui.sidesRange.addEventListener('input', () => {
    state.sides = parseInt(ui.sidesRange.value, 10);
    ui.sidesValue.textContent = state.sides;
    ui.shapeName.textContent = shapeName(state.sides);
    buildPolygon();
    initBalls();
  });

  ui.spinRange.addEventListener('input', () => {
    state.spinSpeed = parseFloat(ui.spinRange.value);
    ui.spinValue.textContent = state.spinSpeed.toFixed(2);
  });

  ui.countRange.addEventListener('input', () => {
    state.ballCount = parseInt(ui.countRange.value, 10);
    ui.countValue.textContent = state.ballCount;
    initBalls();
  });

  ui.sizeRange.addEventListener('input', () => {
    state.sizeVariation = parseFloat(ui.sizeRange.value);
    ui.sizeValue.textContent = state.sizeVariation.toFixed(0);
    initBalls();
  });

  ui.bouncyRange.addEventListener('input', () => {
    state.bounciness = parseFloat(ui.bouncyRange.value);
    ui.bouncyValue.textContent = state.bounciness.toFixed(2);
  });

  ui.collisionToggle.addEventListener('change', () => {
    state.collisionEnabled = ui.collisionToggle.checked;
  });

  ui.angleRange.addEventListener('input', () => {
    state.gravityAngle = parseFloat(ui.angleRange.value);
    setAngleBadge(state.gravityAngle);
    updateGravityVector();
  });

  ui.gravityRange.addEventListener('input', () => {
    state.gravityStrength = parseFloat(ui.gravityRange.value);
    ui.gravityValue.textContent = state.gravityStrength.toFixed(0);
    updateGravityVector();
  });

  ui.timeScaleRange.addEventListener('input', () => {
    state.timeScale = parseFloat(ui.timeScaleRange.value);
    ui.timeScaleValue.textContent = `${state.timeScale.toFixed(2)}x`;
  });

  ui.trailToggle.addEventListener('change', () => {
    state.trails = ui.trailToggle.checked;
  });

  ui.explodeBtn.addEventListener('click', () => {
    for (const b of balls) {
      const mag = 300 + Math.random() * 500;
      const ang = Math.random() * Math.PI * 2;
      b.vx += Math.cos(ang) * mag;
      b.vy += Math.sin(ang) * mag;
    }
  });

  document.querySelectorAll('.section-header').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.section-card');
      const open = card.classList.contains('closed');
      card.classList.toggle('closed');
      const next = !open;
      btn.setAttribute('aria-expanded', String(next));
    });
  });
}

function initDefaults() {
  const defaults = {
    sides: 8,
    spinSpeed: 1,
    ballCount: 40,
    sizeVariation: 20,
    bounciness: 0.88,
    gravityAngle: 0,
    gravityStrength: 700,
    timeScale: 1,
  };

  state.sides = defaults.sides;
  state.spinSpeed = defaults.spinSpeed;
  state.ballCount = defaults.ballCount;
  state.sizeVariation = defaults.sizeVariation;
  state.bounciness = defaults.bounciness;
  state.gravityAngle = defaults.gravityAngle;
  state.gravityStrength = defaults.gravityStrength;
  state.timeScale = defaults.timeScale;

  ui.sidesRange.value = state.sides;
  ui.sidesValue.textContent = state.sides;
  ui.shapeName.textContent = shapeName(state.sides);
  ui.spinRange.value = state.spinSpeed;
  ui.spinValue.textContent = state.spinSpeed.toFixed(2);
  ui.countRange.value = state.ballCount;
  ui.countValue.textContent = state.ballCount;
  ui.sizeRange.value = state.sizeVariation;
  ui.sizeValue.textContent = state.sizeVariation;
  ui.bouncyRange.value = state.bounciness;
  ui.bouncyValue.textContent = state.bounciness.toFixed(2);
  ui.collisionToggle.checked = true;
  ui.angleRange.value = state.gravityAngle;
  setAngleBadge(state.gravityAngle);
  ui.gravityRange.value = state.gravityStrength;
  ui.gravityValue.textContent = state.gravityStrength;
  ui.timeScaleRange.value = state.timeScale;
  ui.timeScaleValue.textContent = `${state.timeScale.toFixed(2)}x`;
  ui.trailToggle.checked = true;

  updateGravityVector();
}

window.addEventListener('resize', () => {
  resize();
  buildPolygon();
  initBalls();
});

initDefaults();
resize();
buildPolygon();
initBalls();
bindTooltips();
bindControls();
requestAnimationFrame((time) => {
  lastTime = time;
  tick(time);
});
