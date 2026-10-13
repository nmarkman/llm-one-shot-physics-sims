"use strict";

(() => {
  const canvas = document.getElementById("simulation");
  const ctx = canvas.getContext("2d");
  const panel = document.querySelector(".panel");
  const tooltip = document.getElementById("tooltip");
  const TAU = Math.PI * 2;
  const FRAME_RADIUS = 300;
  const SUBSTEPS = 5;
  const BASE_RADIUS = 6;
  const DAMPING = 0.12;
  const WALL_FRICTION = 0.2;
  const BALL_RESTITUTION = 0.88;
  const MAX_SPEED = 3000;
  const settings = {
    sides: 8, spin: 0.45, count: 40, variation: 12, bounce: 0.8,
    collisions: true, angle: 90, gravity: 600, time: 1, trails: false,
  };
  const shapeNames = {
    3: "Triangle", 4: "Square", 5: "Pentagon", 6: "Hexagon",
    7: "Heptagon", 8: "Octagon", 9: "Nonagon", 10: "Decagon",
    11: "Hendecagon", 12: "Dodecagon", 13: "Tridecagon", 14: "Tetradecagon",
    15: "Pentadecagon", 16: "Hexadecagon", 17: "Heptadecagon",
    18: "Octadecagon", 19: "Enneadecagon", 20: "Icosagon",
  };
  const palette = [185, 205, 225, 258, 280, 320, 345, 20, 38, 155];
  let balls = [];
  let vertices = [];
  let edges = [];
  let rotation = -Math.PI / 2 - Math.PI / 8;
  let width = 0;
  let height = 0;
  let pixelRatio = 1;
  let scene = { x: 0, y: 0, scale: 1 };
  let lastTime = null;
  let clearNextFrame = true;
  let activeTooltip = null;

  function updateEdges() {
    vertices = Array.from({ length: settings.sides }, (_, i) => {
      const a = rotation + i * TAU / settings.sides;
      return { x: Math.cos(a) * FRAME_RADIUS, y: Math.sin(a) * FRAME_RADIUS };
    });
    edges = vertices.map((a, i) => {
      const b = vertices[(i + 1) % vertices.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.hypot(dx, dy);
      // With this vertex winding, the left-hand edge normal points inward.
      return { x: a.x, y: a.y, nx: -dy / length, ny: dx / length };
    });
  }

  function createBallSprite(radius, hue) {
    // Cache the radial glow, shaded solid ball, and white glint once per ball.
    const sprite = document.createElement("canvas");
    const extent = radius * 2.2;
    sprite.width = sprite.height = Math.ceil(extent * 2 * 2);
    const brush = sprite.getContext("2d");
    brush.scale(2, 2);
    brush.translate(extent, extent);
    const glow = brush.createRadialGradient(0, 0, radius * 0.45, 0, 0, extent);
    glow.addColorStop(0, `hsla(${hue}, 95%, 65%, .28)`);
    glow.addColorStop(0.45, `hsla(${hue}, 95%, 60%, .1)`);
    glow.addColorStop(1, `hsla(${hue}, 95%, 60%, 0)`);
    brush.fillStyle = glow;
    brush.fillRect(-extent, -extent, extent * 2, extent * 2);
    const fill = brush.createRadialGradient(-radius * 0.35, -radius * 0.4, 0, 0, 0, radius * 1.2);
    fill.addColorStop(0, `hsl(${hue}, 88%, 77%)`);
    fill.addColorStop(0.4, `hsl(${hue}, 80%, 63%)`);
    fill.addColorStop(1, `hsl(${hue}, 67%, 43%)`);
    brush.fillStyle = fill;
    brush.beginPath();
    brush.arc(0, 0, radius, 0, TAU);
    brush.fill();
    brush.fillStyle = "rgba(255, 255, 255, .8)";
    brush.beginPath();
    brush.arc(-radius * 0.3, -radius * 0.35, Math.max(1, radius * 0.14), 0, TAU);
    brush.fill();
    return { image: sprite, extent };
  }

  function initializeBalls() {
    updateEdges();
    balls = [];
    // The inscribed circle fits every orientation and every supported polygon.
    const apothem = FRAME_RADIUS * Math.cos(Math.PI / settings.sides);
    const radii = Array.from({ length: settings.count }, () => BASE_RADIUS + Math.random() * settings.variation).sort((a, b) => b - a);
    for (const radius of radii) {
      const spawnRadius = Math.max(0, apothem - radius - 2);
      let best = { x: 0, y: 0, overlap: Infinity };
      for (let attempt = 0; attempt < 120; attempt++) {
        const angle = Math.random() * TAU;
        const distance = Math.sqrt(Math.random()) * spawnRadius;
        const x = Math.cos(angle) * distance;
        const y = Math.sin(angle) * distance;
        let overlap = 0;
        for (const other of balls) {
          const penetration = Math.max(0, radius + other.radius + 2 - Math.hypot(x - other.x, y - other.y));
          overlap += penetration * penetration;
        }
        if (overlap < best.overlap) best = { x, y, overlap };
        if (overlap === 0) break;
      }
      // Extremely crowded settings cannot be packed without overlap; keep every
      // center safely inside and let the positional solver resolve what it can.
      const hue = palette[Math.floor(Math.random() * palette.length)] + Math.random() * 12 - 6;
      balls.push({
        x: best.x, y: best.y, vx: (Math.random() - 0.5) * 150,
        vy: (Math.random() - 0.5) * 150, radius,
        mass: radius * radius, invMass: 1 / (radius * radius),
        sprite: createBallSprite(radius, hue),
      });
    }
    clearNextFrame = true;
  }

  function constrainBall(ball, applyImpulse = true) {
    // Sequential half-plane projections handle real edges, including corners.
    for (let pass = 0; pass < 3; pass++) {
      let corrected = false;
      for (const edge of edges) {
        const distance = (ball.x - edge.x) * edge.nx + (ball.y - edge.y) * edge.ny;
        const penetration = ball.radius + 0.02 - distance;
        if (penetration <= 0) continue;
        corrected = true;
        ball.x += edge.nx * penetration;
        ball.y += edge.ny * penetration;
        if (!applyImpulse) continue;

        const contactX = ball.x - edge.nx * ball.radius;
        const contactY = ball.y - edge.ny * ball.radius;
        // v_wall = omega cross r; all physics positions are relative to (0, 0).
        const wallVx = -settings.spin * contactY;
        const wallVy = settings.spin * contactX;
        const relativeX = ball.vx - wallVx;
        const relativeY = ball.vy - wallVy;
        const normalSpeed = relativeX * edge.nx + relativeY * edge.ny;
        if (normalSpeed >= 0) continue;

        const normalImpulse = -(1 + settings.bounce) * normalSpeed;
        ball.vx += normalImpulse * edge.nx;
        ball.vy += normalImpulse * edge.ny;
        // Coulomb friction transfers the wall's tangential motion to the ball.
        const tx = -edge.ny;
        const ty = edge.nx;
        const tangentSpeed = relativeX * tx + relativeY * ty;
        const frictionImpulse = Math.min(Math.abs(tangentSpeed), WALL_FRICTION * normalImpulse);
        ball.vx -= Math.sign(tangentSpeed) * frictionImpulse * tx;
        ball.vy -= Math.sign(tangentSpeed) * frictionImpulse * ty;
      }
      if (!corrected) break;
    }

    // Guarantee containment even after a very deep/corner overlap. This scale
    // is calculated from EVERY EDGE'S signed half-plane distance, never from a
    // circular radius check (which would let balls escape through triangle edges).
    let inwardScale = 1;
    for (const edge of edges) {
      const centerDistance = -edge.x * edge.nx - edge.y * edge.ny;
      const projection = ball.x * edge.nx + ball.y * edge.ny;
      if (projection < 0) {
        inwardScale = Math.min(inwardScale, (centerDistance - ball.radius - 0.02) / -projection);
      }
    }
    if (inwardScale < 1) {
      ball.x *= Math.max(0, inwardScale);
      ball.y *= Math.max(0, inwardScale);
    }
  }

  function resolveBallCollisions() {
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const minDistance = a.radius + b.radius;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared >= minDistance * minDistance) continue;
        const distance = Math.sqrt(distanceSquared);
        const nx = distance > 1e-8 ? dx / distance : 1;
        const ny = distance > 1e-8 ? dy / distance : 0;
        const inverseMassSum = a.invMass + b.invMass;
        const separation = (minDistance - distance) / inverseMassSum;
        a.x -= nx * separation * a.invMass;
        a.y -= ny * separation * a.invMass;
        b.x += nx * separation * b.invMass;
        b.y += ny * separation * b.invMass;

        const normalSpeed = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (normalSpeed >= 0) continue;
        const impulse = -(1 + BALL_RESTITUTION) * normalSpeed / inverseMassSum;
        a.vx -= impulse * nx * a.invMass;
        a.vy -= impulse * ny * a.invMass;
        b.vx += impulse * nx * b.invMass;
        b.vy += impulse * ny * b.invMass;
      }
    }
  }

  function stepPhysics(frameDt) {
    const dt = frameDt * settings.time / SUBSTEPS;
    if (dt <= 0) return;
    const gravityAngle = settings.angle * Math.PI / 180;
    const gx = Math.cos(gravityAngle) * settings.gravity;
    const gy = Math.sin(gravityAngle) * settings.gravity;
    const damping = Math.exp(-DAMPING * dt);

    for (let step = 0; step < SUBSTEPS; step++) {
      rotation = (rotation + settings.spin * dt) % TAU;
      updateEdges();
      for (const ball of balls) {
        ball.vx = (ball.vx + gx * dt) * damping;
        ball.vy = (ball.vy + gy * dt) * damping;
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;
        constrainBall(ball);
      }
      if (settings.collisions) {
        // Two solver sweeps improve stacks. Re-constrain after EACH sweep so
        // ball-ball positional separation can never leave a ball outside.
        for (let iteration = 0; iteration < 2; iteration++) {
          resolveBallCollisions();
          for (const ball of balls) constrainBall(ball);
        }
      }
      // Superelastic walls (>1 restitution) can add energy without limit.
      // Bound pathological speeds to keep five-substep integration useful.
      for (const ball of balls) {
        const speed = Math.hypot(ball.vx, ball.vy);
        if (speed > MAX_SPEED) {
          ball.vx *= MAX_SPEED / speed;
          ball.vy *= MAX_SPEED / speed;
        }
      }
    }
  }

  function layoutScene() {
    const panelBounds = panel.getBoundingClientRect();
    if (width <= 760) {
      const top = panelBounds.bottom + 20;
      const bottom = height - 66;
      scene = { x: width / 2, y: (top + bottom) / 2, scale: Math.max(0.12, Math.min((width - 56) / 2, (bottom - top) / 2) / FRAME_RADIUS) };
    } else {
      const left = panelBounds.right + 36;
      const right = width - 36;
      scene = { x: (left + right) / 2, y: height / 2 + 6, scale: Math.max(0.12, Math.min((right - left) / 2 - 24, height / 2 - 108, 380) / FRAME_RADIUS) };
    }
    clearNextFrame = true;
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    layoutScene();
    hideTooltip();
  }

  function draw() {
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    if (settings.trails && !clearNextFrame) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
    } else {
      ctx.fillStyle = "#0a0a0f";
    }
    ctx.fillRect(0, 0, width, height);
    clearNextFrame = false;
    ctx.save();
    ctx.translate(scene.x, scene.y);
    ctx.scale(scene.scale, scene.scale);

    const background = ctx.createRadialGradient(0, 0, 10, 0, 0, FRAME_RADIUS * 1.6);
    background.addColorStop(0, settings.trails ? "rgba(45, 103, 137, .025)" : "rgba(45, 103, 137, .13)");
    background.addColorStop(0.7, settings.trails ? "rgba(33, 63, 91, .01)" : "rgba(33, 63, 91, .06)");
    background.addColorStop(1, "rgba(10, 10, 15, 0)");
    ctx.fillStyle = background;
    ctx.fillRect(-480, -480, 960, 960);

    // Quiet measurement marks give the frame a little room to breathe.
    ctx.strokeStyle = "rgba(115, 169, 198, .12)";
    ctx.lineWidth = 0.7;
    for (let i = 0; i < 48; i++) {
      const a = i * TAU / 48;
      const inner = FRAME_RADIUS + 25;
      const outer = inner + (i % 4 === 0 ? 6 : 2);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
      ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(100, 200, 255, .1)";
    ctx.beginPath();
    ctx.moveTo(-5, 0); ctx.lineTo(5, 0);
    ctx.moveTo(0, -5); ctx.lineTo(0, 5);
    ctx.stroke();

    for (const ball of balls) {
      const { image, extent } = ball.sprite;
      ctx.drawImage(image, ball.x - extent, ball.y - extent, extent * 2, extent * 2);
    }

    ctx.beginPath();
    vertices.forEach((point, i) => i === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y));
    ctx.closePath();
    ctx.strokeStyle = "rgba(100, 200, 255, .75)";
    ctx.lineWidth = 1.7;
    ctx.lineJoin = "round";
    ctx.shadowColor = "rgba(100, 200, 255, .7)";
    ctx.shadowBlur = 13;
    ctx.stroke();
    ctx.shadowBlur = 0;
    for (const vertex of vertices) {
      ctx.beginPath();
      ctx.arc(vertex.x, vertex.y, 2.8, 0, TAU);
      ctx.fillStyle = "#b9e7fc";
      ctx.fill();
    }
    ctx.restore();
  }

  function updateControl(id) {
    const input = document.getElementById(id);
    const value = settings[id];
    input.style.setProperty("--fill", `${(value - Number(input.min)) / (Number(input.max) - Number(input.min)) * 100}%`);
    let formatted = String(value);
    if (id === "spin" || id === "bounce") formatted = value.toFixed(2);
    if (id === "time") formatted = `${value.toFixed(1)}×`;
    if (id === "angle") {
      const arrows = ["→", "↘", "↓", "↙", "←", "↖", "↑", "↗"];
      formatted = `${arrows[Math.round(value / 45) % 8]} ${value}°`;
    }
    document.getElementById(`${id}-value`).textContent = formatted;
    input.setAttribute("aria-valuetext", id === "sides" ? `${value}, ${shapeNames[value]}` : formatted);
    if (id === "sides") {
      document.getElementById("shape-name").textContent = shapeNames[value];
      document.getElementById("shape-metric").textContent = shapeNames[value].toUpperCase();
    }
    if (id === "count") document.getElementById("ball-metric").textContent = `${value} ${value === 1 ? "PARTICLE" : "PARTICLES"}`;
    if (id === "time") {
      document.getElementById("play-state").textContent = value === 0 ? "Simulation paused" : "Simulation running";
      document.getElementById("status-dot").style.background = value === 0 ? "#84929f" : "#81d7c0";
    }
  }

  function hideTooltip() {
    if (activeTooltip) {
      const input = activeTooltip.querySelector("input") || activeTooltip;
      input.removeAttribute("aria-describedby");
    }
    activeTooltip = null;
    tooltip.hidden = true;
  }

  function showTooltip(control) {
    hideTooltip();
    activeTooltip = control;
    tooltip.textContent = control.dataset.tooltip;
    tooltip.hidden = false;
    const bounds = control.getBoundingClientRect();
    const panelBounds = panel.getBoundingClientRect();
    const preferredLeft = Math.max(bounds.right, panelBounds.right) + 12;
    const availableRight = width - preferredLeft - 12;
    // Use the right side whenever readable; on a phone use a viewport-clamped
    // position below the control. The tooltip is always a separate DOM element.
    const fitsRight = availableRight >= 150;
    tooltip.style.maxWidth = `${fitsRight ? Math.min(230, availableRight) : Math.min(230, width - 24)}px`;
    const tipBounds = tooltip.getBoundingClientRect();
    const left = fitsRight ? preferredLeft : Math.max(12, Math.min(bounds.right + 12, width - tipBounds.width - 12));
    const top = fitsRight ? bounds.top + (bounds.height - tipBounds.height) / 2 : bounds.bottom + 9;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${Math.max(12, Math.min(top, height - tipBounds.height - 12))}px`;
    (control.querySelector("input") || control).setAttribute("aria-describedby", "tooltip");
  }

  for (const id of ["sides", "spin", "count", "variation", "bounce", "angle", "gravity", "time"]) {
    updateControl(id);
    document.getElementById(id).addEventListener("input", (event) => {
      settings[id] = Number(event.target.value);
      updateControl(id);
      if (["sides", "count", "variation"].includes(id)) initializeBalls();
    });
  }
  for (const id of ["collisions", "trails"]) {
    document.getElementById(id).addEventListener("change", (event) => {
      settings[id] = event.target.checked;
      if (id === "trails") clearNextFrame = true;
    });
  }
  document.getElementById("explode").addEventListener("click", () => {
    for (const ball of balls) {
      const direction = Math.random() * TAU;
      const impulse = 300 + Math.random() * 500;
      ball.vx += Math.cos(direction) * impulse;
      ball.vy += Math.sin(direction) * impulse;
    }
  });
  for (const heading of document.querySelectorAll(".section-heading")) {
    heading.addEventListener("click", () => {
      const expanded = heading.getAttribute("aria-expanded") === "true";
      heading.setAttribute("aria-expanded", String(!expanded));
      document.getElementById(heading.getAttribute("aria-controls")).hidden = expanded;
      hideTooltip();
      layoutScene();
    });
  }
  for (const control of document.querySelectorAll("[data-tooltip]")) {
    control.addEventListener("mouseenter", () => showTooltip(control));
    control.addEventListener("mouseleave", hideTooltip);
    control.addEventListener("focusin", () => showTooltip(control));
    control.addEventListener("focusout", hideTooltip);
  }
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") hideTooltip(); });
  panel.addEventListener("scroll", hideTooltip, { passive: true });
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", () => { lastTime = null; });

  function animate(timestamp) {
    // Drop long hidden-tab/overload gaps instead of integrating an unstable jump.
    const frameDt = lastTime === null ? 0 : Math.min((timestamp - lastTime) / 1000, 1 / 30);
    lastTime = timestamp;
    stepPhysics(frameDt);
    draw();
    requestAnimationFrame(animate);
  }

  resize();
  initializeBalls();
  requestAnimationFrame(animate);
})();
