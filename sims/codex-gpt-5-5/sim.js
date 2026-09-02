"use strict";

const canvas = document.getElementById("simulation");
const ctx = canvas.getContext("2d");
const panel = document.getElementById("controlPanel");
const tooltip = document.getElementById("tooltip");

const controls = {
  sides: document.getElementById("sides"),
  spinSpeed: document.getElementById("spinSpeed"),
  ballCount: document.getElementById("ballCount"),
  sizeVariation: document.getElementById("sizeVariation"),
  bounciness: document.getElementById("bounciness"),
  ballCollisions: document.getElementById("ballCollisions"),
  gravityAngle: document.getElementById("gravityAngle"),
  gravityStrength: document.getElementById("gravityStrength"),
  timeScale: document.getElementById("timeScale"),
  motionTrails: document.getElementById("motionTrails"),
  explodeButton: document.getElementById("explodeButton")
};

const labels = {
  sides: document.getElementById("sidesValue"),
  spinSpeed: document.getElementById("spinSpeedValue"),
  ballCount: document.getElementById("ballCountValue"),
  sizeVariation: document.getElementById("sizeVariationValue"),
  bounciness: document.getElementById("bouncinessValue"),
  gravityAngle: document.getElementById("gravityAngleValue"),
  gravityStrength: document.getElementById("gravityStrengthValue"),
  timeScale: document.getElementById("timeScaleValue"),
  shapeName: document.getElementById("shapeName")
};

const config = {
  sides: 8,
  spinSpeed: 1,
  ballCount: 40,
  sizeVariation: 14,
  bounciness: 0.86,
  ballCollisions: true,
  gravityAngle: 90,
  gravityStrength: 700,
  timeScale: 1,
  motionTrails: true
};

const state = {
  width: window.innerWidth,
  height: window.innerHeight,
  center: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
  polygonAngle: -Math.PI / 2,
  balls: [],
  lastTime: 0,
  firstDraw: true
};

const SUBSTEPS = 5;
const BASE_RADIUS = 6;
const WALL_GRIP = 0.18;
const BALL_RESTITUTION = 0.92;
const LINEAR_DAMPING = 0.055;
const MAX_SPEED = 2600;
const SHAPE_NAMES = [
  "",
  "",
  "",
  "Triangle",
  "Square",
  "Pentagon",
  "Hexagon",
  "Heptagon",
  "Octagon",
  "Nonagon",
  "Decagon",
  "Hendecagon",
  "Dodecagon",
  "Tridecagon",
  "Tetradecagon",
  "Pentadecagon",
  "Hexadecagon",
  "Heptadecagon",
  "Octadecagon",
  "Enneadecagon",
  "Icosagon"
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function frameRadius() {
  const shortest = Math.min(state.width, state.height);
  return Math.min(Math.max(shortest * 0.36, 90), shortest * 0.45);
}

function polygonApothem(radius = frameRadius(), sides = config.sides) {
  return radius * Math.cos(Math.PI / sides);
}

function currentVertices() {
  const radius = frameRadius();
  const step = (Math.PI * 2) / config.sides;
  const vertices = [];

  for (let i = 0; i < config.sides; i += 1) {
    const angle = state.polygonAngle + i * step;
    vertices.push({
      x: state.center.x + Math.cos(angle) * radius,
      y: state.center.y + Math.sin(angle) * radius
    });
  }

  return vertices;
}

function edgeData(vertices) {
  const edges = [];

  for (let i = 0; i < vertices.length; i += 1) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy) || 1;

    edges.push({
      a,
      b,
      nx: -dy / length,
      ny: dx / length,
      tx: dx / length,
      ty: dy / length
    });
  }

  return edges;
}

function colorForBall(index) {
  const hue = (index * 137.508 + randomBetween(-14, 14) + 360) % 360;
  return {
    fill: `hsl(${hue}, 88%, 62%)`,
    core: `hsl(${hue}, 95%, 72%)`,
    dark: `hsl(${hue}, 88%, 34%)`,
    glow: `hsla(${hue}, 96%, 66%, 0.54)`
  };
}

function makeBall(index) {
  const radiusLimit = Math.max(4, polygonApothem() * 0.46);
  const radius = Math.min(BASE_RADIUS + Math.random() * config.sizeVariation, radiusLimit);
  const apothem = polygonApothem();
  const spawnLimit = Math.max(0, apothem - radius - 5);
  const angle = Math.random() * Math.PI * 2;
  const distance = Math.sqrt(Math.random()) * spawnLimit;
  const colors = colorForBall(index);

  return {
    x: state.center.x + Math.cos(angle) * distance,
    y: state.center.y + Math.sin(angle) * distance,
    vx: randomBetween(-95, 95),
    vy: randomBetween(-95, 95),
    radius,
    mass: radius * radius,
    colors
  };
}

function initializeBalls() {
  state.balls = [];
  for (let i = 0; i < config.ballCount; i += 1) {
    state.balls.push(makeBall(i));
  }

  const vertices = currentVertices();
  const edges = edgeData(vertices);
  constrainAllBalls(edges);
}

function updateLabels() {
  labels.sides.textContent = String(config.sides);
  labels.shapeName.textContent = SHAPE_NAMES[config.sides] || `${config.sides}-gon`;
  labels.spinSpeed.textContent = config.spinSpeed.toFixed(2);
  labels.ballCount.textContent = String(config.ballCount);
  labels.sizeVariation.textContent = String(config.sizeVariation);
  labels.bounciness.textContent = config.bounciness.toFixed(2);
  labels.gravityAngle.textContent = `${Math.round(config.gravityAngle)}° ${gravityArrow(config.gravityAngle)}`;
  labels.gravityStrength.textContent = String(config.gravityStrength);
  labels.timeScale.textContent = `${config.timeScale.toFixed(2)}×`;
}

function gravityArrow(degrees) {
  const normalized = ((degrees % 360) + 360) % 360;
  const arrows = ["→", "↘", "↓", "↙", "←", "↖", "↑", "↗"];
  const index = Math.round(normalized / 45) % arrows.length;
  return arrows[index];
}

function gravityVector() {
  const radians = (config.gravityAngle * Math.PI) / 180;
  return {
    x: Math.cos(radians) * config.gravityStrength,
    y: Math.sin(radians) * config.gravityStrength
  };
}

function movingWallVelocity(point) {
  const rx = point.x - state.center.x;
  const ry = point.y - state.center.y;
  return {
    x: config.spinSpeed * -ry,
    y: config.spinSpeed * rx
  };
}

function constrainBallToPolygon(ball, edges) {
  for (const edge of edges) {
    const signedDistance = (ball.x - edge.a.x) * edge.nx + (ball.y - edge.a.y) * edge.ny;
    const penetration = ball.radius - signedDistance;

    if (penetration <= 0) {
      continue;
    }

    ball.x += edge.nx * penetration;
    ball.y += edge.ny * penetration;

    const contactPoint = {
      x: ball.x - edge.nx * ball.radius,
      y: ball.y - edge.ny * ball.radius
    };
    const wallVelocity = movingWallVelocity(contactPoint);
    let relX = ball.vx - wallVelocity.x;
    let relY = ball.vy - wallVelocity.y;
    const normalSpeed = relX * edge.nx + relY * edge.ny;

    if (normalSpeed < 0) {
      relX -= (1 + config.bounciness) * normalSpeed * edge.nx;
      relY -= (1 + config.bounciness) * normalSpeed * edge.ny;

      const tangentSpeed = relX * edge.tx + relY * edge.ty;
      relX -= tangentSpeed * edge.tx * WALL_GRIP;
      relY -= tangentSpeed * edge.ty * WALL_GRIP;

      ball.vx = wallVelocity.x + relX;
      ball.vy = wallVelocity.y + relY;
    }
  }
}

function constrainAllBalls(edges) {
  for (const ball of state.balls) {
    constrainBallToPolygon(ball, edges);
  }
}

function resolveBallCollisions() {
  const balls = state.balls;

  for (let i = 0; i < balls.length - 1; i += 1) {
    const a = balls[i];
    const invMassA = 1 / a.mass;

    for (let j = i + 1; j < balls.length; j += 1) {
      const b = balls[j];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let distanceSquared = dx * dx + dy * dy;
      const minDistance = a.radius + b.radius;

      if (distanceSquared >= minDistance * minDistance) {
        continue;
      }

      if (distanceSquared < 0.0001) {
        const angle = Math.random() * Math.PI * 2;
        dx = Math.cos(angle);
        dy = Math.sin(angle);
        distanceSquared = 1;
      }

      const distance = Math.sqrt(distanceSquared);
      const nx = dx / distance;
      const ny = dy / distance;
      const penetration = minDistance - distance;
      const invMassB = 1 / b.mass;
      const invMassTotal = invMassA + invMassB;
      const correction = penetration / invMassTotal;

      a.x -= nx * correction * invMassA;
      a.y -= ny * correction * invMassA;
      b.x += nx * correction * invMassB;
      b.y += ny * correction * invMassB;

      const relativeVx = b.vx - a.vx;
      const relativeVy = b.vy - a.vy;
      const normalVelocity = relativeVx * nx + relativeVy * ny;

      if (normalVelocity > 0) {
        continue;
      }

      const impulseMagnitude = (-(1 + BALL_RESTITUTION) * normalVelocity) / invMassTotal;
      const impulseX = impulseMagnitude * nx;
      const impulseY = impulseMagnitude * ny;

      a.vx -= impulseX * invMassA;
      a.vy -= impulseY * invMassA;
      b.vx += impulseX * invMassB;
      b.vy += impulseY * invMassB;
    }
  }
}

function applyDamping(ball, dt) {
  const damping = Math.exp(-LINEAR_DAMPING * dt);
  ball.vx *= damping;
  ball.vy *= damping;

  const speed = Math.hypot(ball.vx, ball.vy);
  if (speed > MAX_SPEED) {
    const scale = MAX_SPEED / speed;
    ball.vx *= scale;
    ball.vy *= scale;
  }
}

function physicsStep(dt) {
  if (dt <= 0) {
    return;
  }

  const gravity = gravityVector();
  const subDt = dt / SUBSTEPS;

  for (let step = 0; step < SUBSTEPS; step += 1) {
    state.polygonAngle += config.spinSpeed * subDt;
    const vertices = currentVertices();
    const edges = edgeData(vertices);

    for (const ball of state.balls) {
      ball.vx += gravity.x * subDt;
      ball.vy += gravity.y * subDt;
      ball.x += ball.vx * subDt;
      ball.y += ball.vy * subDt;
      applyDamping(ball, subDt);
      constrainBallToPolygon(ball, edges);
    }

    if (config.ballCollisions) {
      resolveBallCollisions();
      constrainAllBalls(edges);
    }
  }
}

function drawBackground() {
  if (config.motionTrails && !state.firstDraw) {
    ctx.fillStyle = "rgba(10, 10, 15, 0.22)";
    ctx.fillRect(0, 0, state.width, state.height);
  } else {
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, state.width, state.height);
    state.firstDraw = false;
  }

  const radius = frameRadius();
  const glow = ctx.createRadialGradient(
    state.center.x,
    state.center.y,
    0,
    state.center.x,
    state.center.y,
    radius * 1.6
  );
  glow.addColorStop(0, "rgba(100, 200, 255, 0.12)");
  glow.addColorStop(0.42, "rgba(100, 200, 255, 0.055)");
  glow.addColorStop(1, "rgba(10, 10, 15, 0)");

  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, state.width, state.height);
}

function drawPolygon(vertices) {
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.shadowColor = "rgba(100, 200, 255, 0.82)";
  ctx.shadowBlur = 18;
  ctx.strokeStyle = "rgba(125, 214, 255, 0.92)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  vertices.forEach((vertex, index) => {
    if (index === 0) {
      ctx.moveTo(vertex.x, vertex.y);
    } else {
      ctx.lineTo(vertex.x, vertex.y);
    }
  });
  ctx.closePath();
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(230, 250, 255, 0.26)";
  ctx.lineWidth = 1;
  ctx.stroke();

  for (const vertex of vertices) {
    ctx.beginPath();
    ctx.shadowColor = "rgba(100, 200, 255, 0.95)";
    ctx.shadowBlur = 10;
    ctx.fillStyle = "rgba(210, 246, 255, 0.96)";
    ctx.arc(vertex.x, vertex.y, 3.4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawBall(ball) {
  const gradient = ctx.createRadialGradient(
    ball.x - ball.radius * 0.35,
    ball.y - ball.radius * 0.42,
    ball.radius * 0.08,
    ball.x,
    ball.y,
    ball.radius
  );
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.95)");
  gradient.addColorStop(0.16, ball.colors.core);
  gradient.addColorStop(0.58, ball.colors.fill);
  gradient.addColorStop(1, ball.colors.dark);

  ctx.save();
  ctx.shadowColor = ball.colors.glow;
  ctx.shadowBlur = Math.max(9, ball.radius * 1.3);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(255, 255, 255, 0.86)";
  ctx.beginPath();
  ctx.arc(
    ball.x - ball.radius * 0.34,
    ball.y - ball.radius * 0.38,
    Math.max(1.5, ball.radius * 0.16),
    0,
    Math.PI * 2
  );
  ctx.fill();
  ctx.restore();
}

function render() {
  drawBackground();
  const vertices = currentVertices();

  for (const ball of state.balls) {
    drawBall(ball);
  }

  drawPolygon(vertices);
}

function tick(time) {
  if (!state.lastTime) {
    state.lastTime = time;
  }

  const frameDt = clamp((time - state.lastTime) / 1000, 0, 1 / 30);
  state.lastTime = time;
  physicsStep(frameDt * config.timeScale);
  render();
  requestAnimationFrame(tick);
}

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  state.width = window.innerWidth;
  state.height = window.innerHeight;
  state.center.x = state.width / 2;
  state.center.y = state.height / 2;

  canvas.width = Math.floor(state.width * dpr);
  canvas.height = Math.floor(state.height * dpr);
  canvas.style.width = `${state.width}px`;
  canvas.style.height = `${state.height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  state.firstDraw = true;
  initializeBalls();
}

function explode() {
  for (const ball of state.balls) {
    const angle = Math.random() * Math.PI * 2;
    const impulse = randomBetween(300, 800);
    ball.vx += Math.cos(angle) * impulse;
    ball.vy += Math.sin(angle) * impulse;
  }
}

function setNumericConfig(controlName, parser = Number, reset = false) {
  const value = parser(controls[controlName].value);
  config[controlName] = value;
  updateLabels();
  if (reset) {
    initializeBalls();
  }
}

function bindControls() {
  controls.sides.addEventListener("input", () => setNumericConfig("sides", Number.parseInt, true));
  controls.ballCount.addEventListener("input", () => setNumericConfig("ballCount", Number.parseInt, true));
  controls.sizeVariation.addEventListener("input", () => setNumericConfig("sizeVariation", Number.parseInt, true));
  controls.spinSpeed.addEventListener("input", () => setNumericConfig("spinSpeed"));
  controls.bounciness.addEventListener("input", () => setNumericConfig("bounciness"));
  controls.gravityAngle.addEventListener("input", () => setNumericConfig("gravityAngle", Number.parseInt));
  controls.gravityStrength.addEventListener("input", () => setNumericConfig("gravityStrength", Number.parseInt));
  controls.timeScale.addEventListener("input", () => setNumericConfig("timeScale"));

  controls.ballCollisions.addEventListener("change", () => {
    config.ballCollisions = controls.ballCollisions.checked;
  });

  controls.motionTrails.addEventListener("change", () => {
    config.motionTrails = controls.motionTrails.checked;
    state.firstDraw = true;
  });

  controls.explodeButton.addEventListener("click", explode);
}

function bindCollapsibleSections() {
  document.querySelectorAll(".section-header").forEach((button) => {
    button.addEventListener("click", () => {
      const section = button.closest(".section-card");
      const collapsed = section.classList.toggle("collapsed");
      button.setAttribute("aria-expanded", String(!collapsed));
      hideTooltip();
    });
  });
}

function positionTooltip(target) {
  tooltip.style.left = "0px";
  tooltip.style.top = "0px";
  const rect = target.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const gap = 12;
  let left = rect.right + gap;
  let top = rect.top + rect.height / 2 - tooltipRect.height / 2;

  if (left + tooltipRect.width > window.innerWidth - 8) {
    left = Math.max(8, rect.left - tooltipRect.width - gap);
  }

  top = clamp(top, 8, window.innerHeight - tooltipRect.height - 8);
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function showTooltip(target) {
  const text = target.dataset.tooltip;
  if (!text) {
    return;
  }

  tooltip.textContent = text;
  tooltip.classList.add("visible");
  positionTooltip(target);
}

function hideTooltip() {
  tooltip.classList.remove("visible");
}

function bindTooltips() {
  document.querySelectorAll("[data-tooltip]").forEach((target) => {
    target.addEventListener("mouseenter", () => showTooltip(target));
    target.addEventListener("mouseleave", hideTooltip);
    target.addEventListener("focusin", () => showTooltip(target));
    target.addEventListener("focusout", hideTooltip);
  });

  panel.addEventListener("scroll", hideTooltip, { passive: true });
  window.addEventListener("resize", hideTooltip);
}

function syncInitialConfigFromControls() {
  config.sides = Number.parseInt(controls.sides.value, 10);
  config.spinSpeed = Number(controls.spinSpeed.value);
  config.ballCount = Number.parseInt(controls.ballCount.value, 10);
  config.sizeVariation = Number.parseInt(controls.sizeVariation.value, 10);
  config.bounciness = Number(controls.bounciness.value);
  config.ballCollisions = controls.ballCollisions.checked;
  config.gravityAngle = Number.parseInt(controls.gravityAngle.value, 10);
  config.gravityStrength = Number.parseInt(controls.gravityStrength.value, 10);
  config.timeScale = Number(controls.timeScale.value);
  config.motionTrails = controls.motionTrails.checked;
  updateLabels();
}

syncInitialConfigFromControls();
bindControls();
bindCollapsibleSections();
bindTooltips();
resizeCanvas();
window.addEventListener("resize", resizeCanvas);
requestAnimationFrame(tick);
