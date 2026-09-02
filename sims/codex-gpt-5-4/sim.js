const TAU = Math.PI * 2;
const SUBSTEPS = 5;
const BASE_RADIUS = 6;
const AIR_DAMPING = 0.38;
const WALL_GRIP = 0.18;
const BALL_RESTITUTION = 0.94;
const BALL_FRICTION = 0.018;
const COLLISION_ITERATIONS = 2;

const shapeNames = {
  3: "Triangle",
  4: "Square",
  5: "Pentagon",
  6: "Hexagon",
  7: "Heptagon",
  8: "Octagon",
  9: "Nonagon",
  10: "Decagon",
  11: "Undecagon",
  12: "Dodecagon",
  13: "Triskaidecagon",
  14: "Tetradecagon",
  15: "Pentadecagon",
  16: "Hexadecagon",
  17: "Heptadecagon",
  18: "Octadecagon",
  19: "Enneadecagon",
  20: "Icosagon",
};

const gravityArrows = ["↓", "↙", "←", "↖", "↑", "↗", "→", "↘"];

const state = {
  sides: 8,
  spinSpeed: 0.75,
  ballCount: 40,
  sizeVariation: 18,
  bounciness: 0.92,
  collisions: true,
  gravityAngle: 0,
  gravityStrength: 680,
  timeScale: 1,
  trails: false,
};

const canvas = document.getElementById("simCanvas");
const ctx = canvas.getContext("2d");
const panel = document.getElementById("controlPanel");
const tooltip = document.getElementById("tooltip");

const ui = {
  sides: document.getElementById("sidesRange"),
  sidesValue: document.getElementById("sidesValue"),
  shapeName: document.getElementById("shapeName"),
  spin: document.getElementById("spinRange"),
  spinValue: document.getElementById("spinValue"),
  count: document.getElementById("countRange"),
  countValue: document.getElementById("countValue"),
  size: document.getElementById("sizeRange"),
  sizeValue: document.getElementById("sizeValue"),
  bounce: document.getElementById("bounceRange"),
  bounceValue: document.getElementById("bounceValue"),
  collisions: document.getElementById("collisionsToggle"),
  collisionsState: document.getElementById("collisionsState"),
  gravityAngle: document.getElementById("gravityAngleRange"),
  gravityAngleValue: document.getElementById("gravityAngleValue"),
  gravityStrength: document.getElementById("gravityStrengthRange"),
  gravityStrengthValue: document.getElementById("gravityStrengthValue"),
  timeScale: document.getElementById("timeScaleRange"),
  timeScaleValue: document.getElementById("timeScaleValue"),
  trails: document.getElementById("trailsToggle"),
  trailsState: document.getElementById("trailsState"),
  explode: document.getElementById("explodeButton"),
};

let balls = [];
let polygonAngle = 0;
let lastFrame = performance.now();
let tooltipAnchor = null;
let viewport = {
  width: window.innerWidth,
  height: window.innerHeight,
  dpr: Math.min(window.devicePixelRatio || 1, 2),
  centerX: window.innerWidth * 0.5,
  centerY: window.innerHeight * 0.5,
  polygonRadius: 220,
};

init();

function init() {
  bindSections();
  bindControls();
  bindTooltips();
  resizeCanvas();
  resetBalls();
  requestAnimationFrame(frame);
}

function bindSections() {
  const sections = document.querySelectorAll("[data-section]");
  sections.forEach((section) => {
    const button = section.querySelector(".section-toggle");
    button.addEventListener("click", () => {
      const collapsed = section.classList.toggle("collapsed");
      button.setAttribute("aria-expanded", String(!collapsed));
      positionTooltip();
    });
  });
}

function bindControls() {
  const resetAndSync = () => {
    syncUi();
    resetBalls();
  };

  ui.sides.addEventListener("input", () => {
    state.sides = Number(ui.sides.value);
    syncUi();
    resetBalls();
  });

  ui.spin.addEventListener("input", () => {
    state.spinSpeed = Number(ui.spin.value);
    syncUi();
  });

  ui.count.addEventListener("input", () => {
    state.ballCount = Number(ui.count.value);
    resetAndSync();
  });

  ui.size.addEventListener("input", () => {
    state.sizeVariation = Number(ui.size.value);
    resetAndSync();
  });

  ui.bounce.addEventListener("input", () => {
    state.bounciness = Number(ui.bounce.value);
    syncUi();
  });

  ui.collisions.addEventListener("change", () => {
    state.collisions = ui.collisions.checked;
    syncUi();
  });

  ui.gravityAngle.addEventListener("input", () => {
    state.gravityAngle = Number(ui.gravityAngle.value);
    syncUi();
  });

  ui.gravityStrength.addEventListener("input", () => {
    state.gravityStrength = Number(ui.gravityStrength.value);
    syncUi();
  });

  ui.timeScale.addEventListener("input", () => {
    state.timeScale = Number(ui.timeScale.value);
    syncUi();
  });

  ui.trails.addEventListener("change", () => {
    state.trails = ui.trails.checked;
    syncUi();
  });

  ui.explode.addEventListener("click", explodeBalls);

  window.addEventListener("resize", resizeCanvas);
  syncUi();
}

function bindTooltips() {
  const tooltipTargets = document.querySelectorAll("[data-tooltip]");
  tooltipTargets.forEach((target) => {
    target.addEventListener("mouseenter", () => showTooltip(target));
    target.addEventListener("mouseleave", hideTooltip);
  });

  panel.addEventListener("scroll", positionTooltip, { passive: true });
  window.addEventListener("resize", positionTooltip);
}

function syncUi() {
  ui.sidesValue.textContent = String(state.sides);
  ui.shapeName.textContent = shapeNames[state.sides] || `${state.sides}-gon`;
  ui.spinValue.textContent = `${state.spinSpeed >= 0 ? "+" : ""}${state.spinSpeed.toFixed(2)} rad/s`;
  ui.countValue.textContent = String(state.ballCount);
  ui.sizeValue.textContent = `+${state.sizeVariation.toFixed(0)} px`;
  ui.bounceValue.textContent = state.bounciness.toFixed(2);
  ui.collisionsState.textContent = state.collisions ? "Enabled" : "Disabled";
  ui.gravityAngleValue.textContent = `${arrowForAngle(state.gravityAngle)} ${Math.round(state.gravityAngle)}°`;
  ui.gravityStrengthValue.textContent = String(Math.round(state.gravityStrength));
  ui.timeScaleValue.textContent = `${state.timeScale.toFixed(2)}×`;
  ui.trailsState.textContent = state.trails ? "Enabled" : "Disabled";

  Object.values(ui)
    .filter((node) => node instanceof HTMLInputElement && node.type === "range")
    .forEach(paintSlider);
}

function paintSlider(input) {
  const min = Number(input.min) || 0;
  const max = Number(input.max) || 1;
  const value = Number(input.value);
  const percent = ((value - min) / (max - min || 1)) * 100;
  input.style.setProperty("--fill", `${percent}%`);
}

function resizeCanvas() {
  viewport.width = window.innerWidth;
  viewport.height = window.innerHeight;
  viewport.dpr = Math.min(window.devicePixelRatio || 1, 2);
  viewport.centerX = viewport.width * 0.5;
  viewport.centerY = viewport.height * 0.5;
  viewport.polygonRadius = Math.max(
    110,
    Math.min(viewport.width, viewport.height) * (viewport.width < 760 ? 0.28 : 0.34)
  );

  canvas.width = Math.round(viewport.width * viewport.dpr);
  canvas.height = Math.round(viewport.height * viewport.dpr);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);

  if (balls.length) {
    const geometry = getPolygonGeometry();
    constrainAllBalls(geometry, false);
  }
}

function frame(now) {
  const dt = Math.min(0.033, (now - lastFrame) / 1000 || 1 / 60);
  lastFrame = now;
  const scaledDt = dt * state.timeScale;

  if (scaledDt > 0) {
    stepPhysics(scaledDt);
  }

  render();
  requestAnimationFrame(frame);
}

function stepPhysics(dt) {
  const gravity = getGravityVector();
  const subDt = dt / SUBSTEPS;

  for (let substep = 0; substep < SUBSTEPS; substep += 1) {
    polygonAngle += state.spinSpeed * subDt;
    const geometry = getPolygonGeometry();
    const damping = Math.exp(-AIR_DAMPING * subDt);

    for (const ball of balls) {
      ball.vx += gravity.x * subDt;
      ball.vy += gravity.y * subDt;
      ball.vx *= damping;
      ball.vy *= damping;
      ball.x += ball.vx * subDt;
      ball.y += ball.vy * subDt;
      constrainBall(ball, geometry, true);
    }

    if (state.collisions) {
      for (let iteration = 0; iteration < COLLISION_ITERATIONS; iteration += 1) {
        resolveBallCollisions();
        constrainAllBalls(geometry, true);
      }
    }
  }
}

function getPolygonGeometry() {
  const vertices = [];
  const edges = [];
  const angleStep = TAU / state.sides;
  const radius = viewport.polygonRadius;

  for (let i = 0; i < state.sides; i += 1) {
    const theta = polygonAngle - Math.PI / 2 + i * angleStep;
    vertices.push({
      x: viewport.centerX + Math.cos(theta) * radius,
      y: viewport.centerY + Math.sin(theta) * radius,
    });
  }

  for (let i = 0; i < vertices.length; i += 1) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    const edgeX = b.x - a.x;
    const edgeY = b.y - a.y;
    const length = Math.hypot(edgeX, edgeY) || 1;

    edges.push({
      a,
      b,
      normal: {
        x: -edgeY / length,
        y: edgeX / length,
      },
    });
  }

  return {
    vertices,
    edges,
    apothem: radius * Math.cos(Math.PI / state.sides),
    angularVelocity: state.spinSpeed,
  };
}

function resetBalls() {
  const geometry = getPolygonGeometry();
  const fresh = [];

  for (let i = 0; i < state.ballCount; i += 1) {
    const radius = BASE_RADIUS + Math.random() * state.sizeVariation;
    const ball = createBall(radius);
    placeBall(ball, fresh, geometry.apothem);
    fresh.push(ball);
  }

  balls = fresh;
  settleInitialOverlaps(geometry);
}

function createBall(radius) {
  const hue = Math.random() * 360;
  const sat = 88;
  const light = 58 + Math.random() * 8;

  return {
    x: viewport.centerX,
    y: viewport.centerY,
    vx: randomBetween(-90, 90),
    vy: randomBetween(-90, 90),
    r: radius,
    mass: Math.max(1, radius * radius * 0.12),
    hue,
    fill: `hsl(${hue.toFixed(1)} ${sat}% ${light.toFixed(1)}%)`,
    edge: `hsl(${hue.toFixed(1)} ${Math.max(70, sat - 8)}% ${Math.max(28, light - 18).toFixed(1)}%)`,
    glow: `hsla(${hue.toFixed(1)} ${sat}% 70% / 0.62)`,
    aura: `hsla(${hue.toFixed(1)} ${sat}% 65% / 0.22)`,
  };
}

function placeBall(ball, existing, apothem) {
  const padding = 10;
  const spawnLimit = Math.max(6, apothem - ball.r - padding);

  for (let attempt = 0; attempt < 320; attempt += 1) {
    const angle = Math.random() * TAU;
    const distance = Math.sqrt(Math.random()) * spawnLimit;
    ball.x = viewport.centerX + Math.cos(angle) * distance;
    ball.y = viewport.centerY + Math.sin(angle) * distance;

    let overlaps = false;
    for (const other of existing) {
      const minDist = ball.r + other.r + 2;
      const dx = ball.x - other.x;
      const dy = ball.y - other.y;
      if (dx * dx + dy * dy < minDist * minDist) {
        overlaps = true;
        break;
      }
    }

    if (!overlaps) {
      return;
    }
  }

  const fallbackAngle = Math.random() * TAU;
  const fallbackDistance = Math.sqrt(Math.random()) * spawnLimit * 0.45;
  ball.x = viewport.centerX + Math.cos(fallbackAngle) * fallbackDistance;
  ball.y = viewport.centerY + Math.sin(fallbackAngle) * fallbackDistance;
}

function settleInitialOverlaps(geometry) {
  for (let iteration = 0; iteration < 18; iteration += 1) {
    let hadOverlap = false;

    for (let i = 0; i < balls.length; i += 1) {
      for (let j = i + 1; j < balls.length; j += 1) {
        const a = balls[i];
        const b = balls[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const minDist = a.r + b.r;
        const distSq = dx * dx + dy * dy;

        if (distSq >= minDist * minDist) {
          continue;
        }

        hadOverlap = true;
        let dist = Math.sqrt(distSq);
        let nx = 1;
        let ny = 0;

        if (dist > 0.0001) {
          nx = dx / dist;
          ny = dy / dist;
        } else {
          const randomAngle = Math.random() * TAU;
          nx = Math.cos(randomAngle);
          ny = Math.sin(randomAngle);
          dist = 0;
        }

        const overlap = minDist - dist;
        const totalInvMass = 1 / a.mass + 1 / b.mass;
        const moveA = (1 / a.mass / totalInvMass) * overlap;
        const moveB = (1 / b.mass / totalInvMass) * overlap;

        a.x -= nx * moveA;
        a.y -= ny * moveA;
        b.x += nx * moveB;
        b.y += ny * moveB;
      }
    }

    constrainAllBalls(geometry, false);
    if (!hadOverlap) {
      break;
    }
  }
}

function resolveBallCollisions() {
  for (let i = 0; i < balls.length; i += 1) {
    for (let j = i + 1; j < balls.length; j += 1) {
      const a = balls[i];
      const b = balls[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const minDist = a.r + b.r;
      const distSq = dx * dx + dy * dy;

      if (distSq >= minDist * minDist) {
        continue;
      }

      let dist = Math.sqrt(distSq);
      let nx = 1;
      let ny = 0;

      if (dist > 0.0001) {
        nx = dx / dist;
        ny = dy / dist;
      } else {
        const angle = Math.random() * TAU;
        nx = Math.cos(angle);
        ny = Math.sin(angle);
        dist = 0;
      }

      const overlap = minDist - dist;
      const invMassA = 1 / a.mass;
      const invMassB = 1 / b.mass;
      const totalInvMass = invMassA + invMassB;

      a.x -= nx * overlap * (invMassA / totalInvMass);
      a.y -= ny * overlap * (invMassA / totalInvMass);
      b.x += nx * overlap * (invMassB / totalInvMass);
      b.y += ny * overlap * (invMassB / totalInvMass);

      const rvx = b.vx - a.vx;
      const rvy = b.vy - a.vy;
      const normalSpeed = rvx * nx + rvy * ny;

      if (normalSpeed >= 0) {
        continue;
      }

      const impulse = (-(1 + BALL_RESTITUTION) * normalSpeed) / totalInvMass;
      const impulseX = nx * impulse;
      const impulseY = ny * impulse;

      a.vx -= impulseX * invMassA;
      a.vy -= impulseY * invMassA;
      b.vx += impulseX * invMassB;
      b.vy += impulseY * invMassB;

      const tx = -ny;
      const ty = nx;
      const tangentSpeed = rvx * tx + rvy * ty;
      const frictionLimit = impulse * BALL_FRICTION;
      const tangentImpulse =
        clamp(-tangentSpeed / totalInvMass, -frictionLimit, frictionLimit);

      a.vx -= tx * tangentImpulse * invMassA;
      a.vy -= ty * tangentImpulse * invMassA;
      b.vx += tx * tangentImpulse * invMassB;
      b.vy += ty * tangentImpulse * invMassB;
    }
  }
}

function constrainAllBalls(geometry, respond) {
  for (const ball of balls) {
    constrainBall(ball, geometry, respond);
  }
}

function constrainBall(ball, geometry, respond) {
  // Edge half-space tests keep circles correctly inside low-sided polygons.
  for (let iteration = 0; iteration < 3; iteration += 1) {
    let nearestEdge = null;
    let minSignedDistance = Infinity;

    for (const edge of geometry.edges) {
      const dx = ball.x - edge.a.x;
      const dy = ball.y - edge.a.y;
      const signedDistance = dx * edge.normal.x + dy * edge.normal.y;

      if (signedDistance < minSignedDistance) {
        minSignedDistance = signedDistance;
        nearestEdge = edge;
      }
    }

    if (!nearestEdge || minSignedDistance >= ball.r) {
      break;
    }

    const penetration = ball.r - minSignedDistance;
    ball.x += nearestEdge.normal.x * penetration;
    ball.y += nearestEdge.normal.y * penetration;

    if (!respond) {
      continue;
    }

    const contactX = ball.x - nearestEdge.normal.x * ball.r;
    const contactY = ball.y - nearestEdge.normal.y * ball.r;
    const relX = contactX - viewport.centerX;
    const relY = contactY - viewport.centerY;
    const wallVx = -geometry.angularVelocity * relY;
    const wallVy = geometry.angularVelocity * relX;
    const rvx = ball.vx - wallVx;
    const rvy = ball.vy - wallVy;
    const normalSpeed = rvx * nearestEdge.normal.x + rvy * nearestEdge.normal.y;

    if (normalSpeed < 0) {
      const bounce = -(1 + state.bounciness) * normalSpeed;
      ball.vx += nearestEdge.normal.x * bounce;
      ball.vy += nearestEdge.normal.y * bounce;
    }

    const tx = -nearestEdge.normal.y;
    const ty = nearestEdge.normal.x;
    const tangentSpeed = rvx * tx + rvy * ty;
    ball.vx += tx * (-tangentSpeed * WALL_GRIP);
    ball.vy += ty * (-tangentSpeed * WALL_GRIP);
  }
}

function explodeBalls() {
  for (const ball of balls) {
    const angle = Math.random() * TAU;
    const speed = randomBetween(300, 800);
    ball.vx += Math.cos(angle) * speed;
    ball.vy += Math.sin(angle) * speed;
  }
}

function render() {
  if (state.trails) {
    ctx.fillStyle = "rgba(10, 10, 15, 0.16)";
    ctx.fillRect(0, 0, viewport.width, viewport.height);
  } else {
    ctx.clearRect(0, 0, viewport.width, viewport.height);
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, viewport.width, viewport.height);
  }

  drawBackgroundGlow();
  drawBalls();
  drawPolygon();
}

function drawBackgroundGlow() {
  const glow = ctx.createRadialGradient(
    viewport.centerX,
    viewport.centerY,
    viewport.polygonRadius * 0.16,
    viewport.centerX,
    viewport.centerY,
    viewport.polygonRadius * 1.55
  );

  glow.addColorStop(0, "rgba(24, 56, 82, 0.28)");
  glow.addColorStop(0.45, "rgba(14, 32, 50, 0.16)");
  glow.addColorStop(1, "rgba(10, 10, 15, 0)");

  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, viewport.width, viewport.height);
}

function drawBalls() {
  for (const ball of balls) {
    const aura = ctx.createRadialGradient(
      ball.x,
      ball.y,
      ball.r * 0.1,
      ball.x,
      ball.y,
      ball.r * 1.45
    );
    aura.addColorStop(0, ball.aura);
    aura.addColorStop(1, "rgba(0, 0, 0, 0)");

    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r * 1.45, 0, TAU);
    ctx.fill();

    const gradient = ctx.createRadialGradient(
      ball.x - ball.r * 0.34,
      ball.y - ball.r * 0.42,
      ball.r * 0.14,
      ball.x,
      ball.y,
      ball.r * 1.06
    );
    gradient.addColorStop(0, "rgba(255, 255, 255, 0.98)");
    gradient.addColorStop(0.18, ball.fill);
    gradient.addColorStop(0.7, ball.fill);
    gradient.addColorStop(1, ball.edge);

    ctx.save();
    ctx.fillStyle = gradient;
    ctx.shadowColor = ball.glow;
    ctx.shadowBlur = ball.r * 0.95;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.beginPath();
    ctx.arc(
      ball.x - ball.r * 0.28,
      ball.y - ball.r * 0.3,
      Math.max(1.5, ball.r * 0.15),
      0,
      TAU
    );
    ctx.fill();
  }
}

function drawPolygon() {
  const geometry = getPolygonGeometry();
  const vertices = geometry.vertices;

  ctx.save();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(135, 222, 255, 0.88)";
  ctx.shadowColor = "rgba(100, 200, 255, 0.68)";
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.moveTo(vertices[0].x, vertices[0].y);

  for (let i = 1; i < vertices.length; i += 1) {
    ctx.lineTo(vertices[i].x, vertices[i].y);
  }

  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(vertices[0].x, vertices[0].y);
  for (let i = 1; i < vertices.length; i += 1) {
    ctx.lineTo(vertices[i].x, vertices[i].y);
  }
  ctx.closePath();
  ctx.stroke();

  for (const vertex of vertices) {
    ctx.save();
    ctx.fillStyle = "rgba(220, 244, 255, 0.96)";
    ctx.shadowColor = "rgba(100, 200, 255, 0.85)";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(vertex.x, vertex.y, 3.5, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

function showTooltip(target) {
  tooltipAnchor = target;
  tooltip.textContent = target.dataset.tooltip || "";
  tooltip.classList.add("visible");
  tooltip.setAttribute("aria-hidden", "false");
  positionTooltip();
}

function hideTooltip() {
  tooltipAnchor = null;
  tooltip.classList.remove("visible");
  tooltip.setAttribute("aria-hidden", "true");
}

function positionTooltip() {
  if (!tooltipAnchor) {
    return;
  }

  const rect = tooltipAnchor.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  let left = rect.right + 14;
  let top = rect.top + rect.height / 2;

  if (left + tooltipRect.width > window.innerWidth - 12) {
    left = Math.max(12, window.innerWidth - tooltipRect.width - 12);
  }

  const minTop = 12 + tooltipRect.height / 2;
  const maxTop = window.innerHeight - 12 - tooltipRect.height / 2;
  top = clamp(top, minTop, maxTop);

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function getGravityVector() {
  const radians = (state.gravityAngle * Math.PI) / 180;
  return {
    x: -Math.sin(radians) * state.gravityStrength,
    y: Math.cos(radians) * state.gravityStrength,
  };
}

function arrowForAngle(angle) {
  const normalized = normalizeDegrees(angle);
  return gravityArrows[Math.round(normalized / 45) % gravityArrows.length];
}

function normalizeDegrees(angle) {
  return ((angle % 360) + 360) % 360;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}
