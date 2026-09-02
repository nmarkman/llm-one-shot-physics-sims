"use strict";

const canvas = document.getElementById("simCanvas");
const ctx = canvas.getContext("2d");

const controls = {
  sides: document.getElementById("sides"),
  spin: document.getElementById("spin"),
  count: document.getElementById("count"),
  sizeVariation: document.getElementById("sizeVariation"),
  bounciness: document.getElementById("bounciness"),
  collisions: document.getElementById("collisions"),
  gravityAngle: document.getElementById("gravityAngle"),
  gravityStrength: document.getElementById("gravityStrength"),
  timeScale: document.getElementById("timeScale"),
  trails: document.getElementById("trails"),
  explode: document.getElementById("explode"),
};

const outputs = {
  sides: document.getElementById("sidesValue"),
  shapeName: document.getElementById("shapeName"),
  spin: document.getElementById("spinValue"),
  count: document.getElementById("countValue"),
  sizeVariation: document.getElementById("sizeVariationValue"),
  bounciness: document.getElementById("bouncinessValue"),
  gravityAngle: document.getElementById("gravityAngleValue"),
  gravityStrength: document.getElementById("gravityStrengthValue"),
  timeScale: document.getElementById("timeScaleValue"),
};

const settings = {
  sides: 8,
  spin: 0.65,
  count: 40,
  sizeVariation: 12,
  bounciness: 0.88,
  collisions: true,
  gravityAngle: 90,
  gravityStrength: 650,
  timeScale: 1,
  trails: false,
};

const SHAPE_NAMES = {
  3: "Triangle",
  4: "Square",
  5: "Pentagon",
  6: "Hexagon",
  7: "Heptagon",
  8: "Octagon",
  9: "Nonagon",
  10: "Decagon",
  11: "Hendecagon",
  12: "Dodecagon",
  13: "Tridecagon",
  14: "Tetradecagon",
  15: "Pentadecagon",
  16: "Hexadecagon",
  17: "Heptadecagon",
  18: "Octadecagon",
  19: "Enneadecagon",
  20: "Icosagon",
};

const BALL_RESTITUTION = 0.9;
const WALL_FRICTION = 0.24;
const VELOCITY_DAMPING = 0.12;
const SUBSTEPS = 5;
const TWO_PI = Math.PI * 2;

let width = 0;
let height = 0;
let center = { x: 0, y: 0 };
let polygonRadius = 0;
let rotation = 0;
let balls = [];
let lastTime = performance.now();
let trailsWereEnabled = false;

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function updateFrameGeometry() {
  center.x = width / 2;
  center.y = height / 2;
  polygonRadius = Math.max(72, Math.min(width, height) * 0.4);
}

function getApothem() {
  return polygonRadius * Math.cos(Math.PI / settings.sides);
}

function getPolygonVertices(angle = rotation) {
  const vertices = [];
  const startAngle = -Math.PI / 2 + angle;

  for (let i = 0; i < settings.sides; i += 1) {
    const theta = startAngle + (i / settings.sides) * TWO_PI;
    vertices.push({
      x: center.x + Math.cos(theta) * polygonRadius,
      y: center.y + Math.sin(theta) * polygonRadius,
    });
  }

  return vertices;
}

function makeBall() {
  const apothem = getApothem();
  const requestedRadius = 6 + Math.random() * settings.sizeVariation;
  const radius = Math.min(requestedRadius, Math.max(3, apothem - 8));

  // A circle whose center is within (apothem - ball radius) is guaranteed
  // to lie inside every half-plane of a regular polygon.
  const spawnRadius = Math.max(0, apothem - radius - 5);
  const theta = Math.random() * TWO_PI;
  const distance = Math.sqrt(Math.random()) * spawnRadius * 0.82;

  return {
    x: center.x + Math.cos(theta) * distance,
    y: center.y + Math.sin(theta) * distance,
    vx: randomBetween(-55, 55),
    vy: randomBetween(-55, 55),
    radius,
    mass: radius * radius,
    hue: Math.floor(randomBetween(0, 360)),
  };
}

function initializeBalls() {
  balls = Array.from({ length: settings.count }, makeBall);
  // Settle unavoidable initial overlaps without adding collision energy.
  if (settings.collisions) {
    for (let i = 0; i < 2; i += 1) {
      resolveBallCollisions(false);
    }
  }
}

function resizeCanvas() {
  const previousCenter = { ...center };
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  updateFrameGeometry();

  if (balls.length) {
    const dx = center.x - previousCenter.x;
    const dy = center.y - previousCenter.y;
    for (const ball of balls) {
      ball.x += dx;
      ball.y += dy;
    }
    const vertices = getPolygonVertices();
    for (const ball of balls) constrainBallToPolygon(ball, vertices, false);
  }
}

function edgeData(a, b) {
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const length = Math.hypot(ex, ey);
  let nx = -ey / length;
  let ny = ex / length;

  // Select the normal that points toward the polygon center. This stays
  // correct regardless of winding order or canvas coordinate orientation.
  if ((center.x - a.x) * nx + (center.y - a.y) * ny < 0) {
    nx = -nx;
    ny = -ny;
  }

  return { ex, ey, length, nx, ny };
}

function resolveWallVelocity(ball, normalX, normalY, contactX, contactY) {
  // In screen coordinates, positive angular speed rotates clockwise.
  const rx = contactX - center.x;
  const ry = contactY - center.y;
  const wallVX = -settings.spin * ry;
  const wallVY = settings.spin * rx;
  const relativeVX = ball.vx - wallVX;
  const relativeVY = ball.vy - wallVY;
  const normalSpeed = relativeVX * normalX + relativeVY * normalY;

  if (normalSpeed >= 0) return;

  const normalDelta = -(1 + settings.bounciness) * normalSpeed;
  ball.vx += normalX * normalDelta;
  ball.vy += normalY * normalDelta;

  // Coulomb-style tangential impulse lets the spinning edge drag the ball.
  const tangentX = -normalY;
  const tangentY = normalX;
  const tangentSpeed = relativeVX * tangentX + relativeVY * tangentY;
  const tangentDelta = clamp(-tangentSpeed, -WALL_FRICTION * normalDelta, WALL_FRICTION * normalDelta);
  ball.vx += tangentX * tangentDelta;
  ball.vy += tangentY * tangentDelta;
}

function constrainBallToPolygon(ball, vertices, respondToImpact = true) {
  // Repeated edge projection converges at corners, where two inset
  // half-planes can be violated at once.
  for (let pass = 0; pass < 10; pass += 1) {
    let moved = false;

    for (let i = 0; i < vertices.length; i += 1) {
      const a = vertices[i];
      const b = vertices[(i + 1) % vertices.length];
      const edge = edgeData(a, b);
      const signedDistance = (ball.x - a.x) * edge.nx + (ball.y - a.y) * edge.ny;

      if (signedDistance >= ball.radius) continue;

      const projection = (ball.x - a.x) * (edge.ex / edge.length)
        + (ball.y - a.y) * (edge.ey / edge.length);
      const alongEdge = clamp(projection, 0, edge.length);
      const contactX = a.x + (edge.ex / edge.length) * alongEdge;
      const contactY = a.y + (edge.ey / edge.length) * alongEdge;
      const penetration = ball.radius - signedDistance;

      ball.x += edge.nx * penetration;
      ball.y += edge.ny * penetration;
      moved = true;

      if (respondToImpact && pass === 0) {
        resolveWallVelocity(ball, edge.nx, edge.ny, contactX, contactY);
      }
    }

    if (!moved) break;
  }
}

function resolveBallCollisions(applyImpulse = true, vertices = getPolygonVertices()) {
  for (let i = 0; i < balls.length - 1; i += 1) {
    const a = balls[i];

    for (let j = i + 1; j < balls.length; j += 1) {
      const b = balls[j];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const minimumDistance = a.radius + b.radius;
      const distanceSquared = dx * dx + dy * dy;

      if (distanceSquared >= minimumDistance * minimumDistance) continue;

      let distance = Math.sqrt(distanceSquared);
      if (distance < 0.0001) {
        const theta = Math.random() * TWO_PI;
        dx = Math.cos(theta);
        dy = Math.sin(theta);
        distance = 1;
      }

      const nx = dx / distance;
      const ny = dy / distance;
      const inverseMassA = 1 / a.mass;
      const inverseMassB = 1 / b.mass;
      const inverseMassSum = inverseMassA + inverseMassB;
      const penetration = minimumDistance - distance;
      const correction = penetration / inverseMassSum;

      a.x -= nx * correction * inverseMassA;
      a.y -= ny * correction * inverseMassA;
      b.x += nx * correction * inverseMassB;
      b.y += ny * correction * inverseMassB;

      if (applyImpulse) {
        const relativeVX = b.vx - a.vx;
        const relativeVY = b.vy - a.vy;
        const closingSpeed = relativeVX * nx + relativeVY * ny;

        if (closingSpeed < 0) {
          const impulseMagnitude = -(1 + BALL_RESTITUTION) * closingSpeed / inverseMassSum;
          const impulseX = nx * impulseMagnitude;
          const impulseY = ny * impulseMagnitude;

          a.vx -= impulseX * inverseMassA;
          a.vy -= impulseY * inverseMassA;
          b.vx += impulseX * inverseMassB;
          b.vy += impulseY * inverseMassB;
        }
      }
    }
  }

  // Positional collision correction can push a ball through an edge, so every
  // ball is explicitly re-constrained before the next integration substep.
  for (const ball of balls) {
    constrainBallToPolygon(ball, vertices, false);
  }
}

function physicsStep(dt) {
  if (dt <= 0) return;

  rotation = (rotation + settings.spin * dt) % TWO_PI;
  const vertices = getPolygonVertices();
  const gravityRadians = settings.gravityAngle * Math.PI / 180;
  const gravityX = Math.cos(gravityRadians) * settings.gravityStrength;
  const gravityY = Math.sin(gravityRadians) * settings.gravityStrength;
  const damping = Math.exp(-VELOCITY_DAMPING * dt);

  for (const ball of balls) {
    ball.vx = (ball.vx + gravityX * dt) * damping;
    ball.vy = (ball.vy + gravityY * dt) * damping;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    constrainBallToPolygon(ball, vertices, true);
  }

  if (settings.collisions) {
    resolveBallCollisions(true, vertices);
  }
}

function drawBackground() {
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = settings.trails ? "rgba(10, 10, 15, 0.19)" : "#0a0a0f";
  ctx.fillRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(
    center.x,
    center.y,
    polygonRadius * 0.08,
    center.x,
    center.y,
    polygonRadius * 1.3,
  );
  glow.addColorStop(0, "rgba(37, 151, 211, 0.08)");
  glow.addColorStop(0.55, "rgba(19, 87, 126, 0.025)");
  glow.addColorStop(1, "rgba(10, 10, 15, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function drawPolygon(vertices) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(vertices[0].x, vertices[0].y);
  for (let i = 1; i < vertices.length; i += 1) {
    ctx.lineTo(vertices[i].x, vertices[i].y);
  }
  ctx.closePath();
  ctx.strokeStyle = "rgba(100, 200, 255, 0.87)";
  ctx.lineWidth = 2;
  ctx.shadowColor = "rgba(80, 190, 255, 0.72)";
  ctx.shadowBlur = 15;
  ctx.stroke();

  ctx.shadowBlur = 9;
  ctx.fillStyle = "rgba(185, 235, 255, 0.98)";
  for (const vertex of vertices) {
    ctx.beginPath();
    ctx.arc(vertex.x, vertex.y, 3.1, 0, TWO_PI);
    ctx.fill();
  }
  ctx.restore();
}

function drawBall(ball) {
  ctx.save();
  ctx.shadowColor = `hsla(${ball.hue}, 95%, 65%, 0.65)`;
  ctx.shadowBlur = Math.min(16, 7 + ball.radius * 0.42);

  const gradient = ctx.createRadialGradient(
    ball.x - ball.radius * 0.32,
    ball.y - ball.radius * 0.35,
    ball.radius * 0.04,
    ball.x,
    ball.y,
    ball.radius,
  );
  gradient.addColorStop(0, `hsl(${ball.hue}, 100%, 88%)`);
  gradient.addColorStop(0.2, `hsl(${ball.hue}, 92%, 69%)`);
  gradient.addColorStop(0.72, `hsl(${ball.hue}, 82%, 53%)`);
  gradient.addColorStop(1, `hsl(${ball.hue}, 88%, 37%)`);

  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.radius, 0, TWO_PI);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = `hsla(${ball.hue}, 100%, 87%, 0.42)`;
  ctx.lineWidth = 0.8;
  ctx.stroke();

  ctx.shadowBlur = 3;
  ctx.beginPath();
  ctx.arc(
    ball.x - ball.radius * 0.31,
    ball.y - ball.radius * 0.34,
    Math.max(1.2, ball.radius * 0.115),
    0,
    TWO_PI,
  );
  ctx.fillStyle = "rgba(255, 255, 255, 0.88)";
  ctx.fill();
  ctx.restore();
}

function render() {
  if (settings.trails && !trailsWereEnabled) {
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, width, height);
  }
  trailsWereEnabled = settings.trails;

  drawBackground();
  const vertices = getPolygonVertices();
  drawPolygon(vertices);
  for (const ball of balls) drawBall(ball);
}

function animate(now) {
  const frameDt = Math.min((now - lastTime) / 1000, 1 / 30);
  lastTime = now;
  const substepDt = frameDt * settings.timeScale / SUBSTEPS;

  for (let step = 0; step < SUBSTEPS; step += 1) {
    physicsStep(substepDt);
  }

  render();
  requestAnimationFrame(animate);
}

function gravityArrow(degrees) {
  const arrows = ["→", "↘", "↓", "↙", "←", "↖", "↑", "↗"];
  return arrows[Math.round((((degrees % 360) + 360) % 360) / 45) % arrows.length];
}

function setRangeFill(input) {
  const min = Number(input.min);
  const max = Number(input.max);
  const percentage = ((Number(input.value) - min) / (max - min)) * 100;
  input.style.setProperty("--fill", `${percentage}%`);
}

function syncControlDisplay() {
  outputs.sides.value = settings.sides;
  outputs.shapeName.textContent = SHAPE_NAMES[settings.sides] || `${settings.sides}-gon`;
  outputs.spin.value = settings.spin.toFixed(2);
  outputs.count.value = settings.count;
  outputs.sizeVariation.value = `${settings.sizeVariation} px`;
  outputs.bounciness.value = settings.bounciness.toFixed(2);
  outputs.gravityAngle.value = `${settings.gravityAngle}° ${gravityArrow(settings.gravityAngle)}`;
  outputs.gravityStrength.value = settings.gravityStrength;
  outputs.timeScale.value = `${settings.timeScale.toFixed(2)}×`;

  document.querySelectorAll('input[type="range"]').forEach(setRangeFill);
}

function bindRange(key, options = {}) {
  controls[key].addEventListener("input", () => {
    settings[key] = options.integer
      ? Number.parseInt(controls[key].value, 10)
      : Number.parseFloat(controls[key].value);
    syncControlDisplay();
    if (options.reinitialize) initializeBalls();
  });
}

bindRange("sides", { integer: true, reinitialize: true });
bindRange("spin");
bindRange("count", { integer: true, reinitialize: true });
bindRange("sizeVariation", { integer: true, reinitialize: true });
bindRange("bounciness");
bindRange("gravityAngle", { integer: true });
bindRange("gravityStrength", { integer: true });
bindRange("timeScale");

controls.collisions.addEventListener("change", () => {
  settings.collisions = controls.collisions.checked;
});

controls.trails.addEventListener("change", () => {
  settings.trails = controls.trails.checked;
});

controls.explode.addEventListener("click", () => {
  for (const ball of balls) {
    const theta = Math.random() * TWO_PI;
    const impulse = randomBetween(300, 800);
    ball.vx += Math.cos(theta) * impulse;
    ball.vy += Math.sin(theta) * impulse;
  }
});

const tooltip = document.getElementById("tooltip");
let activeTooltipTarget = null;

function positionTooltip(target) {
  const rect = target.getBoundingClientRect();
  const gap = 12;
  const tooltipWidth = tooltip.offsetWidth;
  const tooltipHeight = tooltip.offsetHeight;
  let left = rect.right + gap;
  let top = rect.top + (rect.height - tooltipHeight) / 2;

  // Prefer the requested right-hand position; only flip when it would be
  // completely inaccessible on a narrow viewport.
  if (left + tooltipWidth > window.innerWidth - 8) {
    left = Math.max(8, rect.left - tooltipWidth - gap);
  }
  top = clamp(top, 8, window.innerHeight - tooltipHeight - 8);

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function showTooltip(target) {
  activeTooltipTarget = target;
  tooltip.textContent = target.dataset.tooltip;
  tooltip.setAttribute("aria-hidden", "false");
  tooltip.classList.add("visible");
  positionTooltip(target);
}

function hideTooltip() {
  activeTooltipTarget = null;
  tooltip.classList.remove("visible");
  tooltip.setAttribute("aria-hidden", "true");
}

document.querySelectorAll(".control[data-tooltip]").forEach((control) => {
  control.addEventListener("mouseenter", () => showTooltip(control));
  control.addEventListener("mouseleave", hideTooltip);
  control.addEventListener("focusin", () => showTooltip(control));
  control.addEventListener("focusout", hideTooltip);
});

window.addEventListener("resize", () => {
  resizeCanvas();
  if (activeTooltipTarget) positionTooltip(activeTooltipTarget);
});

syncControlDisplay();
resizeCanvas();
initializeBalls();
requestAnimationFrame(animate);
