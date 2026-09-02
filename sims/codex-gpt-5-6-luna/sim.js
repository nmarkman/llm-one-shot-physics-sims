(() => {
  "use strict";

  const canvas = document.getElementById("simulation");
  const ctx = canvas.getContext("2d");
  const tooltip = document.getElementById("tooltip");

  const TAU = Math.PI * 2;
  const SUBSTEPS = 5;
  const BASE_RADIUS = 6;
  const AIR_DAMPING = 0.12;
  const BALL_RESTITUTION = 0.9;
  const WALL_FRICTION = 0.055;
  const EPSILON = 0.015;

  const shapeNames = {
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

  const colors = [
    "#ff6b91",
    "#ffb86b",
    "#ffe36e",
    "#a7ed75",
    "#6ce5ce",
    "#6fd8ff",
    "#8d9bff",
    "#d69aff",
  ];

  const state = {
    sides: 8,
    spinSpeed: 0.65,
    count: 40,
    sizeVariation: 20,
    bounciness: 0.82,
    ballCollisions: true,
    gravityAngle: 180,
    gravityStrength: 550,
    timeScale: 1,
    trails: true,
  };

  const view = {
    width: 0,
    height: 0,
    dpr: 1,
    center: { x: 0, y: 0 },
    circumradius: 0,
    apothem: 0,
    vertices: [],
    edges: [],
    polygonAngle: 0,
  };

  let balls = [];
  let lastTimestamp = performance.now();
  let hasInitialized = false;
  let tooltipTarget = null;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function lengthOf(x, y) {
    return Math.sqrt(x * x + y * y);
  }

  function dot(a, b) {
    return a.x * b.x + a.y * b.y;
  }

  function updateCanvasSize() {
    const previousWidth = view.width;
    const previousHeight = view.height;
    view.width = Math.max(1, window.innerWidth);
    view.height = Math.max(1, window.innerHeight);
    view.dpr = Math.min(2, window.devicePixelRatio || 1);

    canvas.width = Math.floor(view.width * view.dpr);
    canvas.height = Math.floor(view.height * view.dpr);
    canvas.style.width = `${view.width}px`;
    canvas.style.height = `${view.height}px`;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);

    view.center.x = view.width * 0.5;
    view.center.y = view.height * 0.5;
    view.circumradius = Math.min(view.width, view.height) * 0.38;
    view.apothem = view.circumradius * Math.cos(Math.PI / state.sides);
    updatePolygon();

    if (hasInitialized && (previousWidth !== view.width || previousHeight !== view.height)) {
      initializeBalls();
    }
  }

  function updatePolygon() {
    const startAngle = -Math.PI / 2 + view.polygonAngle;
    view.vertices = [];

    for (let i = 0; i < state.sides; i += 1) {
      const angle = startAngle + (i * TAU) / state.sides;
      view.vertices.push({
        x: view.center.x + Math.cos(angle) * view.circumradius,
        y: view.center.y + Math.sin(angle) * view.circumradius,
      });
    }

    view.edges = view.vertices.map((a, index) => {
      const b = view.vertices[(index + 1) % view.vertices.length];
      const edgeX = b.x - a.x;
      const edgeY = b.y - a.y;
      const edgeLength = lengthOf(edgeX, edgeY);
      return {
        a,
        b,
        length: edgeLength,
        tangent: { x: edgeX / edgeLength, y: edgeY / edgeLength },
        // Vertices are clockwise in canvas coordinates; this is the inward normal.
        normal: { x: -edgeY / edgeLength, y: edgeX / edgeLength },
      };
    });
  }

  function createBall(index) {
    const safeRadius = Math.max(4, view.apothem - 3);
    const radius = Math.min(BASE_RADIUS + Math.random() * state.sizeVariation, safeRadius);
    const spawnRadius = Math.max(0, view.apothem - radius - 8);
    let position = { x: view.center.x, y: view.center.y };

    // The apothem bounds a circle entirely inside every regular polygon.
    // Rejection sampling keeps the opening layout from starting as one clump.
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const angle = Math.random() * TAU;
      const distance = Math.sqrt(Math.random()) * spawnRadius;
      const candidate = {
        x: view.center.x + Math.cos(angle) * distance,
        y: view.center.y + Math.sin(angle) * distance,
      };
      const clear = balls.every((other) => {
        const dx = candidate.x - other.position.x;
        const dy = candidate.y - other.position.y;
        return dx * dx + dy * dy >= (radius + other.radius + 1) ** 2;
      });
      if (clear || attempt === 79) {
        position = candidate;
        break;
      }
    }

    const hueJitter = randomBetween(-10, 10);
    const color = colors[index % colors.length];
    return {
      position,
      velocity: {
        x: randomBetween(-45, 45),
        y: randomBetween(-45, 45),
      },
      radius,
      mass: radius * radius,
      color,
      glowColor: color,
      hueJitter,
    };
  }

  function initializeBalls() {
    balls = [];
    for (let i = 0; i < state.count; i += 1) {
      balls.push(createBall(i));
    }
  }

  function gravityVector() {
    // The angle is measured clockwise from up, matching a screen-space compass.
    const angle = (state.gravityAngle * Math.PI) / 180;
    return {
      x: Math.sin(angle) * state.gravityStrength,
      y: -Math.cos(angle) * state.gravityStrength,
    };
  }

  function closestPointOnEdge(point, edge) {
    const relativeX = point.x - edge.a.x;
    const relativeY = point.y - edge.a.y;
    const projection = clamp(relativeX * edge.tangent.x + relativeY * edge.tangent.y, 0, edge.length);
    return {
      x: edge.a.x + edge.tangent.x * projection,
      y: edge.a.y + edge.tangent.y * projection,
    };
  }

  function wallVelocityAt(point) {
    const relativeX = point.x - view.center.x;
    const relativeY = point.y - view.center.y;
    return {
      x: -state.spinSpeed * relativeY,
      y: state.spinSpeed * relativeX,
    };
  }

  function constrainBall(ball) {
    // Every edge contributes a half-plane. A positive signed distance means the
    // ball center is inside that edge's line; the radius is the allowed margin.
    for (const edge of view.edges) {
      const offsetX = ball.position.x - edge.a.x;
      const offsetY = ball.position.y - edge.a.y;
      const signedDistance = offsetX * edge.normal.x + offsetY * edge.normal.y;

      if (signedDistance < ball.radius) {
        const penetration = ball.radius - signedDistance;
        ball.position.x += edge.normal.x * (penetration + EPSILON);
        ball.position.y += edge.normal.y * (penetration + EPSILON);

        const contactPoint = closestPointOnEdge(ball.position, edge);
        const movingWallVelocity = wallVelocityAt(contactPoint);
        const relativeVelocity = {
          x: ball.velocity.x - movingWallVelocity.x,
          y: ball.velocity.y - movingWallVelocity.y,
        };
        const normalSpeed = dot(relativeVelocity, edge.normal);

        if (normalSpeed < 0) {
          relativeVelocity.x -= edge.normal.x * normalSpeed * (1 + state.bounciness);
          relativeVelocity.y -= edge.normal.y * normalSpeed * (1 + state.bounciness);

          const tangentSpeed = dot(relativeVelocity, edge.tangent);
          relativeVelocity.x -= edge.tangent.x * tangentSpeed * WALL_FRICTION;
          relativeVelocity.y -= edge.tangent.y * tangentSpeed * WALL_FRICTION;

          ball.velocity.x = movingWallVelocity.x + relativeVelocity.x;
          ball.velocity.y = movingWallVelocity.y + relativeVelocity.y;
        }
      }
    }
  }

  function resolveBallCollisions() {
    for (let i = 0; i < balls.length; i += 1) {
      const first = balls[i];

      for (let j = i + 1; j < balls.length; j += 1) {
        const second = balls[j];
        let dx = second.position.x - first.position.x;
        let dy = second.position.y - first.position.y;
        let distance = lengthOf(dx, dy);
        const minimumDistance = first.radius + second.radius;

        if (distance >= minimumDistance) {
          continue;
        }

        if (distance < 0.0001) {
          const randomAngle = Math.random() * TAU;
          dx = Math.cos(randomAngle);
          dy = Math.sin(randomAngle);
          distance = 1;
        }

        const normal = { x: dx / distance, y: dy / distance };
        const overlap = minimumDistance - distance;
        const inverseMassFirst = 1 / first.mass;
        const inverseMassSecond = 1 / second.mass;
        const inverseMassTotal = inverseMassFirst + inverseMassSecond;

        // Positional correction prevents resting pairs from sinking into one another.
        first.position.x -= normal.x * overlap * (inverseMassFirst / inverseMassTotal);
        first.position.y -= normal.y * overlap * (inverseMassFirst / inverseMassTotal);
        second.position.x += normal.x * overlap * (inverseMassSecond / inverseMassTotal);
        second.position.y += normal.y * overlap * (inverseMassSecond / inverseMassTotal);

        const relativeVelocity = {
          x: second.velocity.x - first.velocity.x,
          y: second.velocity.y - first.velocity.y,
        };
        const velocityAlongNormal = dot(relativeVelocity, normal);

        if (velocityAlongNormal >= 0) {
          continue;
        }

        const impulseMagnitude =
          (-(1 + BALL_RESTITUTION) * velocityAlongNormal) / inverseMassTotal;
        const impulse = {
          x: normal.x * impulseMagnitude,
          y: normal.y * impulseMagnitude,
        };

        first.velocity.x -= impulse.x * inverseMassFirst;
        first.velocity.y -= impulse.y * inverseMassFirst;
        second.velocity.x += impulse.x * inverseMassSecond;
        second.velocity.y += impulse.y * inverseMassSecond;
      }
    }
  }

  function physicsStep(dt) {
    view.polygonAngle += state.spinSpeed * dt;
    updatePolygon();

    const gravity = gravityVector();
    const damping = Math.exp(-AIR_DAMPING * dt);

    for (const ball of balls) {
      ball.velocity.x += gravity.x * dt;
      ball.velocity.y += gravity.y * dt;
      ball.velocity.x *= damping;
      ball.velocity.y *= damping;
      ball.position.x += ball.velocity.x * dt;
      ball.position.y += ball.velocity.y * dt;
      constrainBall(ball);
    }

    if (state.ballCollisions) {
      resolveBallCollisions();
      // Ball separation can push a neighbor through an edge, so constrain again.
      for (const ball of balls) {
        constrainBall(ball);
      }
    }
  }

  function drawBackground() {
    if (state.trails) {
      ctx.fillStyle = "rgba(10, 10, 15, 0.18)";
      ctx.fillRect(0, 0, view.width, view.height);
    } else {
      ctx.fillStyle = "#0a0a0f";
      ctx.fillRect(0, 0, view.width, view.height);
    }

    const glowRadius = view.circumradius * 1.38;
    const glow = ctx.createRadialGradient(
      view.center.x,
      view.center.y,
      glowRadius * 0.04,
      view.center.x,
      view.center.y,
      glowRadius,
    );
    glow.addColorStop(0, "rgba(34, 119, 159, 0.12)");
    glow.addColorStop(0.48, "rgba(20, 77, 112, 0.055)");
    glow.addColorStop(1, "rgba(10, 10, 15, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, view.width, view.height);
  }

  function drawPolygon() {
    if (!view.vertices.length) {
      return;
    }

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(view.vertices[0].x, view.vertices[0].y);
    for (let i = 1; i < view.vertices.length; i += 1) {
      ctx.lineTo(view.vertices[i].x, view.vertices[i].y);
    }
    ctx.closePath();
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = "rgba(133, 222, 255, 0.92)";
    ctx.shadowColor = "rgba(67, 190, 255, 0.9)";
    ctx.shadowBlur = 22;
    ctx.stroke();

    ctx.shadowBlur = 7;
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(204, 245, 255, 0.76)";
    ctx.stroke();

    ctx.fillStyle = "#9beaff";
    ctx.shadowColor = "rgba(100, 220, 255, 0.95)";
    ctx.shadowBlur = 13;
    for (const vertex of view.vertices) {
      ctx.beginPath();
      ctx.arc(vertex.x, vertex.y, 2.5, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBall(ball) {
    const { x, y } = ball.position;
    const radius = ball.radius;

    ctx.save();
    ctx.shadowColor = ball.glowColor;
    ctx.shadowBlur = Math.max(8, radius * 1.6);
    ctx.fillStyle = ball.glowColor;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.fill();
    ctx.restore();

    const gradient = ctx.createRadialGradient(
      x - radius * 0.36,
      y - radius * 0.42,
      Math.max(0.5, radius * 0.04),
      x,
      y,
      radius * 1.05,
    );
    gradient.addColorStop(0, "rgba(255, 255, 255, 0.95)");
    gradient.addColorStop(0.12, ball.color);
    gradient.addColorStop(0.73, ball.color);
    gradient.addColorStop(1, "rgba(16, 22, 31, 0.82)");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.fill();

    ctx.fillStyle = "rgba(255, 255, 255, 0.88)";
    ctx.beginPath();
    ctx.arc(x - radius * 0.34, y - radius * 0.38, Math.max(0.8, radius * 0.13), 0, TAU);
    ctx.fill();
  }

  function render() {
    drawBackground();
    drawPolygon();
    for (const ball of balls) {
      drawBall(ball);
    }
  }

  function animate(timestamp) {
    const elapsed = Math.min(0.035, Math.max(0, (timestamp - lastTimestamp) / 1000));
    lastTimestamp = timestamp;
    const scaledDt = elapsed * state.timeScale;
    const substepDt = scaledDt / SUBSTEPS;

    if (substepDt > 0) {
      for (let substep = 0; substep < SUBSTEPS; substep += 1) {
        physicsStep(substepDt);
      }
    }

    render();
    requestAnimationFrame(animate);
  }

  function setText(id, value) {
    document.getElementById(id).textContent = value;
  }

  function updateShapeReadout() {
    setText("sides-value", String(state.sides));
    setText("shape-name", shapeNames[state.sides] || `${state.sides}-gon`);
  }

  function updateSpinReadout() {
    setText("spin-speed-value", `${state.spinSpeed.toFixed(2)} rad/s`);
  }

  function updateGravityReadout() {
    const arrows = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];
    const arrowIndex = Math.round((state.gravityAngle % 360) / 45) % arrows.length;
    setText("gravity-angle-value", `${arrows[arrowIndex]} ${Math.round(state.gravityAngle)}°`);
  }

  function bindRange(id, onInput) {
    const element = document.getElementById(id);
    element.addEventListener("input", () => onInput(Number(element.value)));
  }

  function bindControls() {
    bindRange("sides", (value) => {
      state.sides = value;
      view.apothem = view.circumradius * Math.cos(Math.PI / state.sides);
      updatePolygon();
      updateShapeReadout();
      initializeBalls();
    });

    bindRange("spin-speed", (value) => {
      state.spinSpeed = value;
      updateSpinReadout();
    });

    bindRange("count", (value) => {
      state.count = value;
      setText("count-value", String(value));
      initializeBalls();
    });

    bindRange("size-variation", (value) => {
      state.sizeVariation = value;
      setText("size-variation-value", `+${value} px`);
      initializeBalls();
    });

    bindRange("bounciness", (value) => {
      state.bounciness = value;
      setText("bounciness-value", value.toFixed(2));
    });

    bindRange("gravity-angle", (value) => {
      state.gravityAngle = value;
      updateGravityReadout();
    });

    bindRange("gravity-strength", (value) => {
      state.gravityStrength = value;
      setText("gravity-strength-value", `${value} px/s²`);
    });

    bindRange("time-scale", (value) => {
      state.timeScale = value;
      setText("time-scale-value", `${value.toFixed(2)}×`);
    });

    document.getElementById("ball-collisions").addEventListener("change", (event) => {
      state.ballCollisions = event.target.checked;
    });

    document.getElementById("motion-trails").addEventListener("change", (event) => {
      state.trails = event.target.checked;
      if (!state.trails) {
        ctx.fillStyle = "#0a0a0f";
        ctx.fillRect(0, 0, view.width, view.height);
      }
    });

    document.getElementById("explode").addEventListener("click", () => {
      for (const ball of balls) {
        const angle = Math.random() * TAU;
        const speed = randomBetween(300, 800);
        ball.velocity.x += Math.cos(angle) * speed;
        ball.velocity.y += Math.sin(angle) * speed;
      }
    });

    document.querySelectorAll(".section-toggle").forEach((toggle) => {
      toggle.addEventListener("click", () => {
        const expanded = toggle.getAttribute("aria-expanded") === "true";
        toggle.setAttribute("aria-expanded", String(!expanded));
        document.getElementById(toggle.getAttribute("aria-controls")).hidden = expanded;
      });
    });
  }

  window.addEventListener("resize", updateCanvasSize);

  function hideTooltip() {
    tooltipTarget = null;
    tooltip.classList.remove("is-visible");
    tooltip.setAttribute("aria-hidden", "true");
  }

  function showTooltip(target) {
    tooltipTarget = target;
    tooltip.textContent = target.dataset.tooltip;
    tooltip.classList.add("is-visible");
    tooltip.setAttribute("aria-hidden", "false");

    const targetRect = target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const gap = 12;
    const left = Math.min(targetRect.right + gap, window.innerWidth - tooltipRect.width - 12);
    const top = clamp(targetRect.top + targetRect.height / 2, tooltipRect.height / 2 + 10, window.innerHeight - tooltipRect.height / 2 - 10);
    tooltip.style.left = `${Math.max(10, left)}px`;
    tooltip.style.top = `${top}px`;
  }

  function bindTooltips() {
    document.querySelectorAll("[data-tooltip]").forEach((target) => {
      target.addEventListener("mouseenter", () => showTooltip(target));
      target.addEventListener("mouseleave", hideTooltip);
      target.addEventListener("focusin", () => showTooltip(target));
      target.addEventListener("focusout", hideTooltip);
    });
    window.addEventListener("resize", () => {
      if (tooltipTarget) {
        showTooltip(tooltipTarget);
      }
    });
  }

  updateCanvasSize();
  bindControls();
  bindTooltips();
  updateShapeReadout();
  updateSpinReadout();
  updateGravityReadout();
  setText("count-value", String(state.count));
  setText("size-variation-value", `+${state.sizeVariation} px`);
  setText("bounciness-value", state.bounciness.toFixed(2));
  setText("gravity-strength-value", `${state.gravityStrength} px/s²`);
  setText("time-scale-value", `${state.timeScale.toFixed(2)}×`);
  initializeBalls();
  hasInitialized = true;
  requestAnimationFrame(animate);
})();
