const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', resize);

// --- Constants ---
const FRICTION = 0.998;

// --- Tunable parameters ---
let numBalls = 40;
let sizeVariation = 18;
let numSides = 8;
let spinSpeed = 0.4;
let restitution = 0.55;
let ballRestitution = 0.7;
let gravityAngle = 180; // degrees, 180 = down
let gravityStrength = 600;
let timeScale = 1.0;
let ballCollisions = true;
let showTrails = false;

const SHAPE_NAMES = {
  3: 'Triangle', 4: 'Square', 5: 'Pentagon', 6: 'Hexagon',
  7: 'Heptagon', 8: 'Octagon', 9: 'Nonagon', 10: 'Decagon',
  11: 'Hendecagon', 12: 'Dodecagon',
};

const GRAV_ARROWS = {
  0: '→', 45: '↘', 90: '↓', 135: '↙', 180: '←',
  225: '↖', 270: '↑', 315: '↗', 360: '→',
};

function gravArrow(deg) {
  // Map angle to closest arrow (0° = right, 90° = down, 180° = left, 270° = up)
  const norm = ((deg % 360) + 360) % 360;
  let closest = 0, minDiff = 999;
  for (const k of Object.keys(GRAV_ARROWS)) {
    const d = Math.abs(norm - Number(k));
    if (d < minDiff) { minDiff = d; closest = Number(k); }
  }
  return GRAV_ARROWS[closest];
}

// --- Controls ---
function bindSlider(id, valId, parse, onChange) {
  const slider = document.getElementById(id);
  const valEl = document.getElementById(valId);
  slider.addEventListener('input', () => {
    const v = parse(slider.value);
    onChange(v, valEl);
  });
}

bindSlider('sides', 'sidesVal', parseInt, (v, el) => {
  numSides = v;
  el.textContent = v;
  document.getElementById('shapeName').textContent = SHAPE_NAMES[v] || v + '-gon';
  initBalls();
});

bindSlider('speed', 'speedVal', parseFloat, (v, el) => {
  spinSpeed = v;
  el.textContent = v.toFixed(1);
});

bindSlider('ballCount', 'ballCountVal', parseInt, (v, el) => {
  numBalls = v;
  el.textContent = v;
  initBalls();
});

bindSlider('sizeVar', 'sizeVarVal', parseInt, (v, el) => {
  sizeVariation = v;
  el.textContent = v;
  initBalls();
});

bindSlider('bounce', 'bounceVal', parseFloat, (v, el) => {
  restitution = v;
  ballRestitution = Math.min(v + 0.15, 1.0);
  el.textContent = v.toFixed(2);
});

bindSlider('gravAngle', 'gravAngleVal', parseInt, (v, el) => {
  gravityAngle = v;
  el.textContent = gravArrow(v);
});

bindSlider('gravStr', 'gravStrVal', parseInt, (v, el) => {
  gravityStrength = v;
  el.textContent = v;
});

bindSlider('timeScale', 'timeScaleVal', parseFloat, (v, el) => {
  timeScale = v;
  el.textContent = v.toFixed(1) + '×';
});

document.getElementById('collisions').addEventListener('change', (e) => {
  ballCollisions = e.target.checked;
});

document.getElementById('trails').addEventListener('change', (e) => {
  showTrails = e.target.checked;
});

document.getElementById('explodeBtn').addEventListener('click', () => {
  for (const ball of balls) {
    const angle = Math.random() * Math.PI * 2;
    const force = 300 + Math.random() * 500;
    ball.vx += Math.cos(angle) * force;
    ball.vy += Math.sin(angle) * force;
  }
});

// --- Polygon ---
let polyAngle = 0;
function polyRadius() {
  return Math.min(canvas.width, canvas.height) * 0.35;
}

function getPolygonVertices(cx, cy, r, angle, sides) {
  const verts = [];
  for (let i = 0; i < sides; i++) {
    const a = angle + (Math.PI * 2 * i) / sides;
    verts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return verts;
}

function getEdges(verts) {
  const edges = [];
  for (let i = 0; i < verts.length; i++) {
    edges.push({ a: verts[i], b: verts[(i + 1) % verts.length] });
  }
  return edges;
}

// --- Balls ---
const COLORS = [
  '#ff4060', '#ff8030', '#ffcc00', '#40ff80',
  '#40c0ff', '#8060ff', '#ff60c0', '#ffffff',
  '#00ffcc', '#ff6060', '#60ff60', '#6090ff',
];

class Ball {
  constructor(cx, cy, maxR) {
    this.r = 6 + Math.random() * sizeVariation;
    const apothem = maxR * Math.cos(Math.PI / numSides);
    const spawnR = Math.random() * Math.max(0, apothem - this.r - 10);
    const spawnA = Math.random() * Math.PI * 2;
    this.x = cx + spawnR * Math.cos(spawnA);
    this.y = cy + spawnR * Math.sin(spawnA);
    this.vx = (Math.random() - 0.5) * 100;
    this.vy = (Math.random() - 0.5) * 100;
    this.color = COLORS[Math.floor(Math.random() * COLORS.length)];
    this.mass = this.r * this.r;
  }
}

let balls = [];
function initBalls() {
  balls = [];
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const r = polyRadius();
  for (let i = 0; i < numBalls; i++) {
    balls.push(new Ball(cx, cy, r));
  }
}
initBalls();
window.addEventListener('resize', initBalls);

// --- Physics ---

function edgeInwardNormal(edge, cx, cy) {
  const ex = edge.b.x - edge.a.x;
  const ey = edge.b.y - edge.a.y;
  const len = Math.sqrt(ex * ex + ey * ey);
  let nx = -ey / len;
  let ny = ex / len;
  const midX = (edge.a.x + edge.b.x) / 2;
  const midY = (edge.a.y + edge.b.y) / 2;
  if (nx * (cx - midX) + ny * (cy - midY) < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { nx, ny };
}

function signedEdgeDist(px, py, edge, inward) {
  return (px - edge.a.x) * inward.nx + (py - edge.a.y) * inward.ny;
}

function closestPointOnEdge(px, py, edge) {
  const ex = edge.b.x - edge.a.x;
  const ey = edge.b.y - edge.a.y;
  const len = Math.sqrt(ex * ex + ey * ey);
  const dx = ex / len;
  const dy = ey / len;
  let t = (px - edge.a.x) * dx + (py - edge.a.y) * dy;
  t = Math.max(0, Math.min(len, t));
  return { x: edge.a.x + dx * t, y: edge.a.y + dy * t };
}

function resolveWallCollision(ball, edges, cx, cy, angularVel) {
  for (const edge of edges) {
    const inward = edgeInwardNormal(edge, cx, cy);
    const sd = signedEdgeDist(ball.x, ball.y, edge, inward);

    if (sd < ball.r) {
      const cp = closestPointOnEdge(ball.x, ball.y, edge);
      const cpDx = ball.x - cp.x;
      const cpDy = ball.y - cp.y;
      const cpDist = Math.sqrt(cpDx * cpDx + cpDy * cpDy);

      if (cpDist < ball.r + 1) {
        const overlap = ball.r - sd;
        ball.x += inward.nx * overlap;
        ball.y += inward.ny * overlap;

        const rx = cp.x - cx;
        const ry = cp.y - cy;
        const wallVx = -angularVel * ry;
        const wallVy = angularVel * rx;

        const relVx = ball.vx - wallVx;
        const relVy = ball.vy - wallVy;
        const relVn = relVx * inward.nx + relVy * inward.ny;

        if (relVn < 0) {
          ball.vx -= (1 + restitution) * relVn * inward.nx;
          ball.vy -= (1 + restitution) * relVn * inward.ny;

          const tx = -inward.ny;
          const ty = inward.nx;
          const relVt = relVx * tx + relVy * ty;
          ball.vx -= 0.3 * relVt * tx;
          ball.vy -= 0.3 * relVt * ty;
        }
      }
    }
  }
}

function constrainInside(ball, edges, cx, cy) {
  for (const edge of edges) {
    const inward = edgeInwardNormal(edge, cx, cy);
    const sd = signedEdgeDist(ball.x, ball.y, edge, inward);
    if (sd < ball.r) {
      ball.x += inward.nx * (ball.r - sd);
      ball.y += inward.ny * (ball.r - sd);
    }
  }
}

function resolveBallCollision(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const minDist = a.r + b.r;

  if (dist < minDist && dist > 0.001) {
    const nx = dx / dist;
    const ny = dy / dist;

    const overlap = minDist - dist;
    const totalMass = a.mass + b.mass;
    a.x -= nx * overlap * (b.mass / totalMass);
    a.y -= ny * overlap * (b.mass / totalMass);
    b.x += nx * overlap * (a.mass / totalMass);
    b.y += ny * overlap * (a.mass / totalMass);

    const dvx = a.vx - b.vx;
    const dvy = a.vy - b.vy;
    const dvn = dvx * nx + dvy * ny;

    if (dvn > 0) {
      const impulse = (2 * dvn) / totalMass;
      a.vx -= impulse * b.mass * nx * ballRestitution;
      a.vy -= impulse * b.mass * ny * ballRestitution;
      b.vx += impulse * a.mass * nx * ballRestitution;
      b.vy += impulse * a.mass * ny * ballRestitution;
    }
  }
}

// --- Rendering ---

function drawPolygon(verts) {
  ctx.beginPath();
  ctx.moveTo(verts[0].x, verts[0].y);
  for (let i = 1; i < verts.length; i++) {
    ctx.lineTo(verts[i].x, verts[i].y);
  }
  ctx.closePath();
  ctx.strokeStyle = 'rgba(100, 200, 255, 0.8)';
  ctx.lineWidth = 3;
  ctx.shadowColor = 'rgba(100, 200, 255, 0.5)';
  ctx.shadowBlur = 15;
  ctx.stroke();
  ctx.shadowBlur = 0;

  for (const v of verts) {
    ctx.beginPath();
    ctx.arc(v.x, v.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(100, 200, 255, 0.9)';
    ctx.fill();
  }
}

function drawBall(ball) {
  const grad = ctx.createRadialGradient(ball.x, ball.y, 0, ball.x, ball.y, ball.r * 1.5);
  grad.addColorStop(0, ball.color);
  grad.addColorStop(0.6, ball.color + 'aa');
  grad.addColorStop(1, 'transparent');
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.r * 1.5, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
  ctx.fillStyle = ball.color;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(ball.x - ball.r * 0.3, ball.y - ball.r * 0.3, ball.r * 0.35, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fill();
}

// --- Main Loop ---
let lastTime = performance.now();

function update(now) {
  const rawDt = Math.min((now - lastTime) / 1000, 0.033);
  lastTime = now;
  const dt = rawDt * timeScale;

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const r = polyRadius();

  polyAngle += spinSpeed * dt;
  const verts = getPolygonVertices(cx, cy, r, polyAngle, numSides);
  const edges = getEdges(verts);

  // Gravity vector from angle
  const gravRad = (gravityAngle - 90) * (Math.PI / 180); // 180° = down
  const gx = Math.cos(gravRad) * gravityStrength;
  const gy = Math.sin(gravRad) * gravityStrength;

  const substeps = 5;
  const subDt = dt / substeps;

  for (let s = 0; s < substeps; s++) {
    for (const ball of balls) {
      ball.vx += gx * subDt;
      ball.vy += gy * subDt;

      ball.vx *= FRICTION;
      ball.vy *= FRICTION;

      ball.x += ball.vx * subDt;
      ball.y += ball.vy * subDt;

      resolveWallCollision(ball, edges, cx, cy, spinSpeed);
      constrainInside(ball, edges, cx, cy);
    }

    if (ballCollisions) {
      for (let i = 0; i < balls.length; i++) {
        for (let j = i + 1; j < balls.length; j++) {
          resolveBallCollision(balls[i], balls[j]);
        }
      }
    }

    for (const ball of balls) {
      constrainInside(ball, edges, cx, cy);
    }
  }

  // --- Draw ---
  if (showTrails) {
    // Fade previous frame instead of clearing
    ctx.fillStyle = 'rgba(10, 10, 15, 0.15)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  // Background glow
  const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.2);
  bgGrad.addColorStop(0, 'rgba(20, 30, 50, 0.3)');
  bgGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawPolygon(verts);

  for (const ball of balls) {
    drawBall(ball);
  }

  requestAnimationFrame(update);
}

requestAnimationFrame(update);
