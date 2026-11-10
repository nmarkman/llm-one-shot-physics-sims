"use strict";

const canvas = document.getElementById("simulation");
const ctx = canvas.getContext("2d");
const panel = document.getElementById("panel");
const tooltip = document.getElementById("tooltip");

const inputs = {
  sides: document.getElementById("sides"),
  spin: document.getElementById("spin"),
  count: document.getElementById("count"),
  size: document.getElementById("size"),
  bounce: document.getElementById("bounce"),
  collisions: document.getElementById("collisions"),
  gravityAngle: document.getElementById("gravity-angle"),
  gravity: document.getElementById("gravity"),
  timeScale: document.getElementById("time-scale"),
  trails: document.getElementById("trails")
};

const settings = {
  sides: 8,
  spin: 0.7,
  count: 40,
  size: 12,
  bounce: 0.85,
  collisions: true,
  gravityAngle: 90,
  gravity: 650,
  timeScale: 1,
  trails: false
};

const shapeNames = [
  "", "", "", "Triangle", "Square", "Pentagon", "Hexagon", "Heptagon", "Octagon",
  "Nonagon", "Decagon", "Hendecagon", "Dodecagon", "Tridecagon", "Tetradecagon",
  "Pentadecagon", "Hexadecagon", "Heptadecagon", "Octadecagon", "Enneadecagon", "Icosagon"
];
const arrows = ["→", "↘", "↓", "↙", "←", "↖", "↑", "↗"];
const hues = [195, 215, 263, 326, 12, 38, 155, 178];
const TAU = Math.PI * 2;
const BALL_RESTITUTION = 0.88;
const WALL_FRICTION = 0.14;
const DAMPING = 0.16;
const SUBSTEPS = 5;

let width = 0;
let height = 0;
let centerX = 0;
let centerY = 0;
let frameRadius = 0;
let apothem = 0;
let rotation = 0;
let balls = [];
let previousTime = 0;
let firstDraw = true;

function random(min, max) { return min + Math.random() * (max - min); }

function updateGeometry() {
  const panelRect = panel.getBoundingClientRect();
  const mobile = width <= 760;

  if (mobile) {
    const verticalRoom = Math.max(70, (height - panelRect.bottom - 44) / 2);
    frameRadius = Math.max(60, Math.min(width * 0.42, height * 0.27, verticalRoom, 290));
    centerX = width / 2;
    centerY = Math.max(height * 0.67, panelRect.bottom + frameRadius + 22);
    centerY = Math.min(centerY, height - frameRadius - 22);
  } else {
    frameRadius = Math.max(75, Math.min(350, height * 0.38, width * 0.36, (width - panelRect.right - 56) / 2));
    centerX = Math.max(width / 2, panelRect.right + 28 + frameRadius);
    centerX = Math.min(centerX, width - frameRadius - 28);
    centerY = height / 2;
  }

  apothem = frameRadius * Math.cos(Math.PI / settings.sides);
}

function resizeCanvas() {
  width = window.innerWidth;
  height = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  updateGeometry();
  createBalls();
  firstDraw = true;
}

function polygonEdges() {
  const vertices = [];
  const edges = [];
  const step = TAU / settings.sides;

  for (let i = 0; i < settings.sides; i++) {
    const angle = rotation - Math.PI / 2 + i * step;
    vertices.push({
      x: centerX + Math.cos(angle) * frameRadius,
      y: centerY + Math.sin(angle) * frameRadius
    });
  }

  for (let i = 0; i < vertices.length; i++) {
    const start = vertices[i];
    const end = vertices[(i + 1) % vertices.length];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    // Vertices run clockwise on the canvas, so the left normal points inward.
    edges.push({ x: start.x, y: start.y, nx: -dy / length, ny: dx / length });
  }

  return { vertices, edges };
}

function createBalls() {
  balls = [];
  const margin = 3;

  for (let i = 0; i < settings.count; i++) {
    const radius = Math.min(6 + Math.random() * settings.size, Math.max(3, apothem - margin));
    const spawnRadius = Math.max(0, apothem - radius - margin);
    let best = null;
    let bestOverlap = Infinity;

    // The apothem defines a circle wholly inside every regular polygon.
    for (let attempt = 0; attempt < 36; attempt++) {
      const angle = random(0, TAU);
      const distance = Math.sqrt(Math.random()) * spawnRadius;
      const x = centerX + Math.cos(angle) * distance;
      const y = centerY + Math.sin(angle) * distance;
      let overlap = 0;

      for (const other of balls) {
        const gap = radius + other.r - Math.hypot(x - other.x, y - other.y);
        if (gap > 0) overlap += gap;
      }

      if (overlap < bestOverlap) {
        bestOverlap = overlap;
        best = { x, y };
        if (overlap === 0) break;
      }
    }

    const direction = random(0, TAU);
    const speed = random(15, 95);
    balls.push({
      x: best.x,
      y: best.y,
      vx: Math.cos(direction) * speed,
      vy: Math.sin(direction) * speed,
      r: radius,
      mass: radius * radius,
      hue: hues[Math.floor(Math.random() * hues.length)] + random(-9, 9)
    });
  }

  document.getElementById("stage-shape").textContent = `${shapeNames[settings.sides]} · ${settings.count} ${settings.count === 1 ? "body" : "bodies"}`;
}

function constrainBall(ball, edges) {
  // Repeated projections handle corners, including crowded acute triangles.
  for (let pass = 0; pass < 16; pass++) {
    let corrected = false;

    for (const edge of edges) {
      const signedDistance = (ball.x - edge.x) * edge.nx + (ball.y - edge.y) * edge.ny;
      const penetration = ball.r - signedDistance;
      if (penetration <= 0.000001) continue;

      ball.x += edge.nx * penetration;
      ball.y += edge.ny * penetration;
      corrected = true;

      // The wall velocity is omega cross the contact point's radius vector.
      const contactX = ball.x - edge.nx * ball.r;
      const contactY = ball.y - edge.ny * ball.r;
      const wallVx = -settings.spin * (contactY - centerY);
      const wallVy = settings.spin * (contactX - centerX);
      const relativeVx = ball.vx - wallVx;
      const relativeVy = ball.vy - wallVy;
      const normalSpeed = relativeVx * edge.nx + relativeVy * edge.ny;

      if (normalSpeed < 0) {
        ball.vx -= (1 + settings.bounce) * normalSpeed * edge.nx;
        ball.vy -= (1 + settings.bounce) * normalSpeed * edge.ny;
        const tangentX = -edge.ny;
        const tangentY = edge.nx;
        const tangentSpeed = relativeVx * tangentX + relativeVy * tangentY;
        ball.vx -= tangentSpeed * WALL_FRICTION * tangentX;
        ball.vy -= tangentSpeed * WALL_FRICTION * tangentY;
      }
    }

    if (!corrected) break;
  }
}

function resolveBallCollisions() {
  for (let i = 0; i < balls.length; i++) {
    const a = balls[i];
    for (let j = i + 1; j < balls.length; j++) {
      const b = balls[j];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const minDistance = a.r + b.r;
      let distanceSquared = dx * dx + dy * dy;
      if (distanceSquared >= minDistance * minDistance) continue;

      if (distanceSquared < 0.000001) {
        const angle = random(0, TAU);
        dx = Math.cos(angle) * 0.001;
        dy = Math.sin(angle) * 0.001;
        distanceSquared = dx * dx + dy * dy;
      }

      const distance = Math.sqrt(distanceSquared);
      const nx = dx / distance;
      const ny = dy / distance;
      const invMassA = 1 / a.mass;
      const invMassB = 1 / b.mass;
      const invMassSum = invMassA + invMassB;
      const overlap = minDistance - distance;

      // Separate by inverse mass, then apply a mass-based collision impulse.
      const correction = overlap / invMassSum;
      a.x -= nx * correction * invMassA;
      a.y -= ny * correction * invMassA;
      b.x += nx * correction * invMassB;
      b.y += ny * correction * invMassB;

      const relativeNormalSpeed = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (relativeNormalSpeed >= 0) continue;
      const impulse = -(1 + BALL_RESTITUTION) * relativeNormalSpeed / invMassSum;
      a.vx -= impulse * invMassA * nx;
      a.vy -= impulse * invMassA * ny;
      b.vx += impulse * invMassB * nx;
      b.vy += impulse * invMassB * ny;
    }
  }
}

function stepPhysics(dt) {
  if (dt <= 0) return;
  const subDt = dt / SUBSTEPS;
  const gravityRadians = settings.gravityAngle * Math.PI / 180;
  const gravityX = Math.cos(gravityRadians) * settings.gravity;
  const gravityY = Math.sin(gravityRadians) * settings.gravity;

  for (let step = 0; step < SUBSTEPS; step++) {
    rotation = (rotation + settings.spin * subDt) % TAU;
    const { edges } = polygonEdges();
    const damping = Math.exp(-DAMPING * subDt);

    for (const ball of balls) {
      ball.vx = (ball.vx + gravityX * subDt) * damping;
      ball.vy = (ball.vy + gravityY * subDt) * damping;
      ball.x += ball.vx * subDt;
      ball.y += ball.vy * subDt;
      constrainBall(ball, edges);
    }

    if (settings.collisions) {
      resolveBallCollisions();
      // Separating two balls can push one through a nearby polygon edge.
      for (const ball of balls) constrainBall(ball, edges);
    }
  }
}

function drawBackground() {
  if (settings.trails && !firstDraw) {
    ctx.fillStyle = "rgba(10, 10, 15, 0.19)";
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, width, height);
  }
  firstDraw = false;

  const glow = ctx.createRadialGradient(centerX, centerY, frameRadius * 0.08, centerX, centerY, frameRadius * 1.8);
  glow.addColorStop(0, "rgba(25, 67, 98, 0.17)");
  glow.addColorStop(0.55, "rgba(18, 46, 72, 0.10)");
  glow.addColorStop(1, "rgba(10, 10, 15, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(centerX - frameRadius * 1.8, centerY - frameRadius * 1.8, frameRadius * 3.6, frameRadius * 3.6);
}

function drawFrame(vertices) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(vertices[0].x, vertices[0].y);
  for (let i = 1; i < vertices.length; i++) ctx.lineTo(vertices[i].x, vertices[i].y);
  ctx.closePath();
  ctx.fillStyle = "rgba(21, 49, 67, 0.07)";
  ctx.fill();
  ctx.strokeStyle = "rgba(104, 207, 255, 0.88)";
  ctx.lineWidth = 2;
  ctx.shadowColor = "rgba(80, 191, 255, 0.86)";
  ctx.shadowBlur = 22;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(172, 230, 255, 0.22)";
  ctx.lineWidth = 0.65;
  ctx.stroke();

  for (const vertex of vertices) {
    ctx.beginPath();
    ctx.arc(vertex.x, vertex.y, 3.2, 0, TAU);
    ctx.fillStyle = "#bceaff";
    ctx.shadowColor = "#79d6ff";
    ctx.shadowBlur = 13;
    ctx.fill();
  }
  ctx.restore();
}

function drawBalls() {
  for (const ball of balls) {
    const glowRadius = ball.r * 2.8;
    const glow = ctx.createRadialGradient(ball.x, ball.y, ball.r * 0.25, ball.x, ball.y, glowRadius);
    glow.addColorStop(0, `hsla(${ball.hue}, 100%, 68%, 0.23)`);
    glow.addColorStop(0.48, `hsla(${ball.hue}, 100%, 60%, 0.12)`);
    glow.addColorStop(1, `hsla(${ball.hue}, 100%, 55%, 0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, glowRadius, 0, TAU);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, TAU);
    ctx.fillStyle = `hsl(${ball.hue}, 88%, 63%)`;
    ctx.shadowColor = `hsla(${ball.hue}, 100%, 63%, 0.65)`;
    ctx.shadowBlur = Math.min(15, ball.r * 0.9);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.26)";
    ctx.lineWidth = 0.8;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(ball.x - ball.r * 0.28, ball.y - ball.r * 0.3, Math.max(1.2, ball.r * 0.14), 0, TAU);
    ctx.fillStyle = "rgba(255, 255, 255, 0.82)";
    ctx.fill();
  }
}

function animate(now) {
  if (!previousTime) previousTime = now;
  const elapsed = Math.min((now - previousTime) / 1000, 1 / 30);
  previousTime = now;
  stepPhysics(elapsed * settings.timeScale);
  drawBackground();
  drawFrame(polygonEdges().vertices);
  drawBalls();
  requestAnimationFrame(animate);
}

function updateControlDisplay(key) {
  const input = inputs[key];
  if (input.type === "checkbox") return;
  const value = Number(input.value);
  const fraction = (value - Number(input.min)) / (Number(input.max) - Number(input.min));
  input.style.setProperty("--fill", `${fraction * 100}%`);
  const output = document.getElementById(`${input.id}-value`);

  if (key === "gravityAngle") output.textContent = `${arrows[Math.round((value % 360) / 45) % 8]} ${value}°`;
  else if (key === "timeScale") output.textContent = `${value.toFixed(2)}×`;
  else if (key === "spin") output.textContent = value.toFixed(2);
  else if (key === "bounce") output.textContent = value.toFixed(2);
  else output.textContent = String(value);

  if (key === "sides") document.getElementById("shape-name").textContent = shapeNames[value];
}

for (const [key, input] of Object.entries(inputs)) {
  updateControlDisplay(key);
  input.addEventListener(input.type === "checkbox" ? "change" : "input", () => {
    settings[key] = input.type === "checkbox" ? input.checked : Number(input.value);
    updateControlDisplay(key);
    if (key === "sides") updateGeometry();
    if (key === "sides" || key === "count" || key === "size") createBalls();
    if (key === "trails") firstDraw = true;
  });
}

for (const trigger of document.querySelectorAll(".section-trigger")) {
  trigger.addEventListener("click", () => {
    const expanded = trigger.getAttribute("aria-expanded") === "true";
    trigger.setAttribute("aria-expanded", String(!expanded));
    document.getElementById(trigger.getAttribute("aria-controls")).hidden = expanded;
    hideTooltip();
  });
}

function showTooltip(control) {
  tooltip.textContent = control.dataset.tooltip;
  tooltip.classList.add("visible");
  tooltip.setAttribute("aria-hidden", "false");
  const rect = control.getBoundingClientRect();
  const tooltipWidth = tooltip.offsetWidth;
  const tooltipHeight = tooltip.offsetHeight;
  const rightSide = rect.right + 12;
  tooltip.style.left = `${rightSide + tooltipWidth + 12 <= window.innerWidth ? rightSide : Math.max(12, rect.left - tooltipWidth - 12)}px`;
  tooltip.style.top = `${Math.max(12, Math.min(window.innerHeight - tooltipHeight - 12, rect.top + rect.height / 2 - tooltipHeight / 2))}px`;
}

function hideTooltip() {
  tooltip.classList.remove("visible");
  tooltip.setAttribute("aria-hidden", "true");
}

for (const control of document.querySelectorAll(".control[data-tooltip]")) {
  control.addEventListener("mouseenter", () => showTooltip(control));
  control.addEventListener("mouseleave", hideTooltip);
  control.addEventListener("focusin", () => showTooltip(control));
  control.addEventListener("focusout", hideTooltip);
}
panel.addEventListener("scroll", hideTooltip);
window.addEventListener("resize", () => { hideTooltip(); resizeCanvas(); });

document.getElementById("explode").addEventListener("click", () => {
  for (const ball of balls) {
    const angle = random(0, TAU);
    const impulse = random(300, 800);
    ball.vx += Math.cos(angle) * impulse;
    ball.vy += Math.sin(angle) * impulse;
  }
});

resizeCanvas();
requestAnimationFrame(animate);
