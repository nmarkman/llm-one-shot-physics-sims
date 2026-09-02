const TAU = Math.PI * 2;
const SUBSTEPS = 5;
const BASE_RADIUS = 6;
const BALL_DAMPING_PER_SECOND = 0.08;
const BALL_PAIR_RESTITUTION = 0.96;
const POSITION_SLOP = 0.01;
const POSITION_PERCENT = 0.85;
const WALL_OMEGA_SCALE = 1.1;
const DEFAULT_TRAIL_ALPHA = 0.16;

const canvas = document.getElementById('sim');
const ctx = canvas.getContext('2d');
const panel = document.getElementById('panel');
const tooltip = document.getElementById('tooltip');

const ui = {
  sides: document.getElementById('sides'),
  sidesValue: document.getElementById('sidesValue'),
  shapeName: document.getElementById('shapeName'),
  spin: document.getElementById('spinSpeed'),
  spinValue: document.getElementById('spinValue'),
  count: document.getElementById('count'),
  countValue: document.getElementById('countValue'),
  sizeVariation: document.getElementById('sizeVariation'),
  sizeValue: document.getElementById('sizeValue'),
  bounciness: document.getElementById('bounciness'),
  bounceValue: document.getElementById('bounceValue'),
  ballCollisions: document.getElementById('ballCollisions'),
  ballCollisionState: document.getElementById('ballCollisionState'),
  gravityAngle: document.getElementById('gravityAngle'),
  angleValue: document.getElementById('angleValue'),
  gravityArrow: document.getElementById('gravityArrow'),
  gravityStrength: document.getElementById('gravityStrength'),
  gravityValue: document.getElementById('gravityValue'),
  timeScale: document.getElementById('timeScale'),
  timeValue: document.getElementById('timeValue'),
  motionTrails: document.getElementById('motionTrails'),
  motionTrailsState: document.getElementById('motionTrailsState'),
  explode: document.getElementById('explode'),
};

const state = {
  sides: 8,
  spinSpeed: 0.85,
  count: 40,
  sizeVariation: 18,
  bounciness: 0.9,
  ballCollisions: true,
  gravityAngle: 90,
  gravityStrength: 500,
  timeScale: 1,
  motionTrails: false,
};

let width = 0;
let height = 0;
let dpr = 1;
let centerX = 0;
let centerY = 0;
let apothem = 0;
let frameAngle = 0;
let lastNow = performance.now();
let balls = [];
let pendingReset = true;
let hardClearNextFrame = true;

const shapeNames = {
  3: 'Triangle',
  4: 'Square',
  5: 'Pentagon',
  6: 'Hexagon',
  7: 'Heptagon',
  8: 'Octagon',
  9: 'Nonagon',
  10: 'Decagon',
  11: 'Hendecagon',
  12: 'Dodecagon',
};

const gravityArrows = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeAngle(deg) {
  return ((deg % 360) + 360) % 360;
}

function shapeNameForSides(sides) {
  return shapeNames[sides] || `${sides}-gon`;
}

function gravityArrowForAngle(deg) {
  const normalized = normalizeAngle(deg);
  return gravityArrows[Math.floor((normalized + 22.5) / 45) % 8];
}

function syncRangeFill(input) {
  const min = Number(input.min);
  const max = Number(input.max);
  const value = Number(input.value);
  const pct = ((value - min) / (max - min)) * 100;
  input.style.setProperty('--pct', `${pct}%`);
}

function updateReadouts() {
  ui.sidesValue.textContent = String(state.sides);
  ui.shapeName.textContent = shapeNameForSides(state.sides);
  ui.spinValue.textContent = `${state.spinSpeed.toFixed(2)} rad/s`;
  ui.countValue.textContent = String(state.count);
  ui.sizeValue.textContent = `+${state.sizeVariation}px`;
  ui.bounceValue.textContent = state.bounciness.toFixed(2);
  ui.ballCollisionState.textContent = state.ballCollisions ? 'On' : 'Off';
  ui.angleValue.textContent = `${gravityArrowForAngle(state.gravityAngle)} ${Math.round(state.gravityAngle)}°`;
  ui.gravityArrow.textContent = gravityArrowForAngle(state.gravityAngle);
  ui.gravityValue.textContent = String(Math.round(state.gravityStrength));
  ui.timeValue.textContent = `${state.timeScale.toFixed(2)}x`;
  ui.motionTrailsState.textContent = state.motionTrails ? 'On' : 'Off';

  for (const input of [
    ui.sides,
    ui.spin,
    ui.count,
    ui.sizeVariation,
    ui.bounciness,
    ui.gravityAngle,
    ui.gravityStrength,
    ui.timeScale,
  ]) {
    syncRangeFill(input);
  }
}

function scheduleBallReset() {
  pendingReset = true;
  hardClearNextFrame = true;
}

function bindRange(input, key, parser, onChange) {
  const handle = () => {
    state[key] = parser(input.value);
    updateReadouts();
    if (onChange) onChange();
  };
  input.addEventListener('input', handle);
}

function bindToggle(input, key, onChange) {
  const handle = () => {
    state[key] = input.checked;
    updateReadouts();
    if (onChange) onChange();
  };
  input.addEventListener('change', handle);
}

function buildGradient(radius, hue) {
  const highlight = `hsla(${hue}, 96%, 88%, 0.98)`;
  const mid = `hsla(${hue}, 92%, 60%, 0.98)`;
  const edge = `hsla(${hue}, 85%, 42%, 0.98)`;
  const gradient = ctx.createRadialGradient(-radius * 0.32, -radius * 0.32, radius * 0.08, 0, 0, radius);
  gradient.addColorStop(0, highlight);
  gradient.addColorStop(0.45, mid);
  gradient.addColorStop(1, edge);
  return {
    gradient,
    glow: `hsla(${hue}, 100%, 66%, 0.5)`,
  };
}

function createBall(index, existingBalls) {
  const radius = BASE_RADIUS + Math.random() * state.sizeVariation;
  const hue = (index * 360 / Math.max(1, state.count) + Math.random() * 36) % 360;
  const { gradient, glow } = buildGradient(radius, hue);
  const mass = radius * radius;
  const invMass = 1 / mass;
  const spawnRadius = Math.max(0, apothem - radius - 12);
  let x = centerX;
  let y = centerY;
  let placed = false;

  for (let attempt = 0; attempt < 50; attempt++) {
    const angle = Math.random() * TAU;
    const dist = Math.sqrt(Math.random()) * spawnRadius;
    const px = centerX + Math.cos(angle) * dist;
    const py = centerY + Math.sin(angle) * dist;

    let overlaps = false;
    for (let i = 0; i < existingBalls.length; i++) {
      const other = existingBalls[i];
      const dx = px - other.x;
      const dy = py - other.y;
      const minDist = radius + other.radius + 4;
      if (dx * dx + dy * dy < minDist * minDist) {
        overlaps = true;
        break;
      }
    }

    if (!overlaps) {
      x = px;
      y = py;
      placed = true;
      break;
    }
  }

  if (!placed) {
    x = centerX;
    y = centerY;
  }

  return {
    x,
    y,
    vx: Math.random() * 80 - 40,
    vy: Math.random() * 80 - 40,
    radius,
    mass,
    invMass,
    gradient,
    glow,
    // Fix applied after generation: the original listed a `body` shorthand property here, but
    // no `body` variable exists and nothing reads ball.body, so the sim threw on load.
  };
}

function resetBalls() {
  const next = [];
  for (let i = 0; i < state.count; i++) {
    next.push(createBall(i, next));
  }
  balls = next;
}

function resizeCanvas() {
  const oldCenterX = centerX;
  const oldCenterY = centerY;

  width = window.innerWidth;
  height = window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;

  centerX = width / 2;
  centerY = height / 2;
  apothem = Math.min(width, height) * 0.34;

  if (balls.length) {
    const dx = centerX - oldCenterX;
    const dy = centerY - oldCenterY;
    for (const ball of balls) {
      ball.x += dx;
      ball.y += dy;
    }

    const polygon = computePolygonGeometry();
    for (const ball of balls) {
      nudgeBallInsidePolygon(ball, polygon);
    }
    hardClearNextFrame = true;
  }
}

function computePolygonGeometry() {
  const sides = Math.max(3, Math.round(state.sides));
  const radius = apothem / Math.cos(Math.PI / sides);
  const start = frameAngle - Math.PI / 2;
  const vertices = new Array(sides);

  for (let i = 0; i < sides; i++) {
    const angle = start + (i * TAU) / sides;
    vertices[i] = {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    };
  }

  const edges = new Array(sides);
  for (let i = 0; i < sides; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % sides];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    let nx = -ey;
    let ny = ex;
    const len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;

    if ((centerX - a.x) * nx + (centerY - a.y) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }

    edges[i] = {
      ax: a.x,
      ay: a.y,
      bx: b.x,
      by: b.y,
      nx,
      ny,
    };
  }

  return { vertices, edges };
}

function closestPointOnSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const abLenSq = abx * abx + aby * aby || 1;
  const t = clamp(((px - ax) * abx + (py - ay) * aby) / abLenSq, 0, 1);
  return {
    x: ax + abx * t,
    y: ay + aby * t,
  };
}

function nudgeBallInsidePolygon(ball, polygon) {
  for (let pass = 0; pass < 3; pass++) {
    let deepestDepth = 0;
    let bestEdge = null;

    for (let i = 0; i < polygon.edges.length; i++) {
      const edge = polygon.edges[i];
      const signedDistance = (ball.x - edge.ax) * edge.nx + (ball.y - edge.ay) * edge.ny;
      const depth = ball.radius - signedDistance;
      if (depth > deepestDepth) {
        deepestDepth = depth;
        bestEdge = edge;
      }
    }

    if (!bestEdge || deepestDepth <= 0) {
      break;
    }

    ball.x += bestEdge.nx * deepestDepth;
    ball.y += bestEdge.ny * deepestDepth;
  }
}

function resolveWallCollision(ball, polygon, omega, applyImpulse) {
  for (let pass = 0; pass < 2; pass++) {
    let deepestDepth = 0;
    let bestEdge = null;

    for (let i = 0; i < polygon.edges.length; i++) {
      const edge = polygon.edges[i];
      const signedDistance = (ball.x - edge.ax) * edge.nx + (ball.y - edge.ay) * edge.ny;
      const depth = ball.radius - signedDistance;
      if (depth > deepestDepth) {
        deepestDepth = depth;
        bestEdge = edge;
      }
    }

    if (!bestEdge || deepestDepth <= 0) {
      break;
    }

    const contact = closestPointOnSegment(
      ball.x,
      ball.y,
      bestEdge.ax,
      bestEdge.ay,
      bestEdge.bx,
      bestEdge.by,
    );

    ball.x += bestEdge.nx * deepestDepth;
    ball.y += bestEdge.ny * deepestDepth;

    if (applyImpulse) {
      const rx = contact.x - centerX;
      const ry = contact.y - centerY;
      const wallVx = -omega * ry;
      const wallVy = omega * rx;
      const relNormalVelocity =
        (ball.vx - wallVx) * bestEdge.nx +
        (ball.vy - wallVy) * bestEdge.ny;

      if (relNormalVelocity < 0) {
        const impulse = -(1 + state.bounciness) * relNormalVelocity;
        ball.vx += impulse * bestEdge.nx;
        ball.vy += impulse * bestEdge.ny;
      }
    }
  }
}

function resolveBallCollisions() {
  if (!state.ballCollisions) {
    return;
  }

  for (let i = 0; i < balls.length; i++) {
    const a = balls[i];

    for (let j = i + 1; j < balls.length; j++) {
      const b = balls[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const minDist = a.radius + b.radius;
      const distSq = dx * dx + dy * dy;

      if (distSq >= minDist * minDist) {
        continue;
      }

      const dist = Math.sqrt(distSq) || 0.0001;
      const nx = dist > 0 ? dx / dist : 1;
      const ny = dist > 0 ? dy / dist : 0;
      const penetration = minDist - dist;
      const invMassSum = a.invMass + b.invMass;

      if (invMassSum > 0) {
        const correction = Math.max(penetration - POSITION_SLOP, 0) / invMassSum * POSITION_PERCENT;
        const corrX = correction * nx;
        const corrY = correction * ny;
        a.x -= corrX * a.invMass;
        a.y -= corrY * a.invMass;
        b.x += corrX * b.invMass;
        b.y += corrY * b.invMass;
      }

      const relVx = b.vx - a.vx;
      const relVy = b.vy - a.vy;
      const velAlongNormal = relVx * nx + relVy * ny;

      if (velAlongNormal > 0) {
        continue;
      }

      const impulse = -(1 + BALL_PAIR_RESTITUTION) * velAlongNormal / (a.invMass + b.invMass);
      const impulseX = impulse * nx;
      const impulseY = impulse * ny;

      a.vx -= impulseX * a.invMass;
      a.vy -= impulseY * a.invMass;
      b.vx += impulseX * b.invMass;
      b.vy += impulseY * b.invMass;
    }
  }
}

function explodeBalls() {
  for (const ball of balls) {
    const magnitude = 300 + Math.random() * 500;
    const angle = Math.random() * TAU;
    ball.vx += Math.cos(angle) * magnitude;
    ball.vy += Math.sin(angle) * magnitude;
  }
}

function integrateBall(ball, dt, gx, gy) {
  ball.vx += gx * dt;
  ball.vy += gy * dt;

  const damping = Math.exp(-BALL_DAMPING_PER_SECOND * dt);
  ball.vx *= damping;
  ball.vy *= damping;

  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
}

function stepSimulation(frameDt) {
  if (pendingReset) {
    resetBalls();
    pendingReset = false;
    hardClearNextFrame = true;
  }

  const omega = state.spinSpeed * WALL_OMEGA_SCALE;
  const gravityRad = (state.gravityAngle * Math.PI) / 180;
  const gx = Math.cos(gravityRad) * state.gravityStrength;
  const gy = Math.sin(gravityRad) * state.gravityStrength;
  const scaledDt = state.timeScale > 0 ? Math.min(frameDt, 0.05) * state.timeScale : 0;
  const subDt = scaledDt / SUBSTEPS;
  let polygon = computePolygonGeometry();

  if (subDt > 0) {
    for (let step = 0; step < SUBSTEPS; step++) {
      frameAngle += omega * subDt;
      if (frameAngle > TAU || frameAngle < -TAU) {
        frameAngle %= TAU;
      }

      polygon = computePolygonGeometry();

      for (const ball of balls) {
        integrateBall(ball, subDt, gx, gy);
        resolveWallCollision(ball, polygon, omega, true);
      }

      resolveBallCollisions();

      for (const ball of balls) {
        resolveWallCollision(ball, polygon, omega, true);
      }
    }
  }

  return polygon;
}

function drawBackgroundGlow() {
  const glow = ctx.createRadialGradient(
    centerX,
    centerY - apothem * 0.1,
    0,
    centerX,
    centerY,
    apothem * 1.35,
  );
  glow.addColorStop(0, 'rgba(100, 200, 255, 0.16)');
  glow.addColorStop(0.28, 'rgba(80, 166, 240, 0.09)');
  glow.addColorStop(0.72, 'rgba(35, 90, 138, 0.04)');
  glow.addColorStop(1, 'rgba(10, 10, 15, 0)');

  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
}

function drawBalls() {
  for (const ball of balls) {
    ctx.save();
    ctx.translate(ball.x, ball.y);
    ctx.shadowBlur = Math.max(6, ball.radius * 0.45);
    ctx.shadowColor = ball.glow;
    ctx.fillStyle = ball.gradient;
    ctx.beginPath();
    ctx.arc(0, 0, ball.radius, 0, TAU);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.beginPath();
    ctx.arc(-ball.radius * 0.3, -ball.radius * 0.34, Math.max(1.2, ball.radius * 0.12), 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

function drawPolygon(polygon) {
  if (!polygon.vertices.length) {
    return;
  }

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(100, 200, 255, 0.78)';
  ctx.lineWidth = 4.5;
  ctx.shadowBlur = 26;
  ctx.shadowColor = 'rgba(100, 200, 255, 0.34)';
  ctx.beginPath();
  ctx.moveTo(polygon.vertices[0].x, polygon.vertices[0].y);
  for (let i = 1; i < polygon.vertices.length; i++) {
    ctx.lineTo(polygon.vertices[i].x, polygon.vertices[i].y);
  }
  ctx.closePath();
  ctx.stroke();

  ctx.shadowBlur = 10;
  ctx.fillStyle = 'rgba(120, 220, 255, 0.95)';
  for (const vertex of polygon.vertices) {
    ctx.beginPath();
    ctx.arc(vertex.x, vertex.y, 2.6, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function render(polygon) {
  if (hardClearNextFrame || !state.motionTrails) {
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, width, height);
    hardClearNextFrame = false;
  } else {
    ctx.fillStyle = `rgba(10, 10, 15, ${DEFAULT_TRAIL_ALPHA})`;
    ctx.fillRect(0, 0, width, height);
  }

  drawBackgroundGlow();
  drawBalls();
  drawPolygon(polygon);
}

function animate(now) {
  const frameDt = Math.min((now - lastNow) / 1000, 0.05);
  lastNow = now;

  const polygon = stepSimulation(frameDt);
  render(polygon);

  requestAnimationFrame(animate);
}

function showTooltip(target, text) {
  tooltip.textContent = text;
  tooltip.classList.add('visible');
  tooltip.setAttribute('aria-hidden', 'false');
  const rect = target.getBoundingClientRect();
  const pad = 12;
  const gap = 14;
  const w = tooltip.offsetWidth;
  const h = tooltip.offsetHeight;
  let left = rect.right + gap;
  let top = rect.top + rect.height / 2 - h / 2;

  left = clamp(left, pad, Math.max(pad, window.innerWidth - w - pad));
  top = clamp(top, pad, Math.max(pad, window.innerHeight - h - pad));

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function hideTooltip() {
  tooltip.classList.remove('visible');
  tooltip.setAttribute('aria-hidden', 'true');
}

for (const card of document.querySelectorAll('.section-card')) {
  const header = card.querySelector('.section-header');
  const body = card.querySelector('.section-body');

  header.addEventListener('click', () => {
    const collapsed = card.classList.toggle('collapsed');
    header.setAttribute('aria-expanded', String(!collapsed));
    body.setAttribute('aria-hidden', String(collapsed));
  });
}

for (const control of document.querySelectorAll('.control')) {
  const tip = control.getAttribute('data-tip');
  if (!tip) {
    continue;
  }

  control.addEventListener('mouseenter', () => showTooltip(control, tip));
  control.addEventListener('mouseleave', hideTooltip);
}

panel.addEventListener('scroll', hideTooltip);
window.addEventListener('resize', () => {
  resizeCanvas();
  updateReadouts();
});
window.addEventListener('blur', hideTooltip);

bindRange(ui.sides, 'sides', (value) => clamp(Math.round(Number(value)), 3, 20), scheduleBallReset);
bindRange(ui.spin, 'spinSpeed', Number);
bindRange(ui.count, 'count', (value) => clamp(Math.round(Number(value)), 1, 200), scheduleBallReset);
bindRange(ui.sizeVariation, 'sizeVariation', (value) => clamp(Math.round(Number(value)), 0, 40), scheduleBallReset);
bindRange(ui.bounciness, 'bounciness', (value) => clamp(Number(value), 0, 1.2));
bindToggle(ui.ballCollisions, 'ballCollisions');
bindRange(ui.gravityAngle, 'gravityAngle', (value) => clamp(Math.round(Number(value)), 0, 360));
bindRange(ui.gravityStrength, 'gravityStrength', (value) => clamp(Math.round(Number(value)), 0, 1500));
bindRange(ui.timeScale, 'timeScale', (value) => clamp(Number(value), 0, 3));
bindToggle(ui.motionTrails, 'motionTrails');

ui.explode.addEventListener('click', () => {
  explodeBalls();
});

updateReadouts();
resizeCanvas();
resetBalls();
requestAnimationFrame(animate);
