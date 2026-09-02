"use strict";

/* ============================================================
   Canvas setup
   ============================================================ */
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

let W, H, cx, cy, polyRadius;
function resize() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
  cx = W / 2;
  cy = H / 2;
  polyRadius = Math.min(W, H) * 0.4;
}
window.addEventListener("resize", resize);
resize();

/* ============================================================
   Simulation state (driven by the control panel)
   ============================================================ */
const state = {
  sides: 8,
  spinSpeed: 0.5,     // radians / second (sign = direction)
  count: 40,
  sizeVar: 14,        // max random radius added to BASE_SIZE
  bounciness: 0.8,    // wall restitution
  collisions: true,
  gravAngle: 90,      // degrees (90 => downward on the canvas)
  gravStrength: 500,  // px / s^2
  timeScale: 1,
  trails: false,
};

/* Physics tuning constants */
const SUBSTEPS = 5;
const BASE_SIZE = 6;
const DAMPING = 0.999;         // per-substep velocity damping
const WALL_FRICTION = 0.15;    // tangential drag applied at a wall contact
const BALL_RESTITUTION = 0.85; // ball-to-ball bounciness

/* ============================================================
   Polygon geometry
   ============================================================ */
let polyAngle = 0;
let vertices = [];

function computeVertices() {
  vertices = [];
  const step = (Math.PI * 2) / state.sides;
  for (let i = 0; i < state.sides; i++) {
    const a = polyAngle + i * step;
    vertices.push({
      x: cx + Math.cos(a) * polyRadius,
      y: cy + Math.sin(a) * polyRadius,
    });
  }
}

/* Apothem = inscribed radius. Balls spawn inside this so they fit any shape. */
function apothem() {
  return polyRadius * Math.cos(Math.PI / state.sides);
}

/* ============================================================
   Balls
   ============================================================ */
let balls = [];

function initBalls() {
  balls = [];
  const ap = apothem();
  for (let i = 0; i < state.count; i++) {
    const r = BASE_SIZE + Math.random() * state.sizeVar;
    const maxDist = Math.max(0, ap - r - 2);
    const dist = Math.sqrt(Math.random()) * maxDist; // uniform in disk
    const ang = Math.random() * Math.PI * 2;
    balls.push({
      x: cx + Math.cos(ang) * dist,
      y: cy + Math.sin(ang) * dist,
      vx: (Math.random() - 0.5) * 120,
      vy: (Math.random() - 0.5) * 120,
      r: r,
      mass: r * r, // 2D area-based mass
      hue: Math.random() * 360,
    });
  }
}

/* ============================================================
   Edge-based wall collision
   For each polygon edge we compute the INWARD normal, then the
   signed distance from the ball centre to that edge line. If the
   ball penetrates (d < radius) we push it inward and resolve the
   bounce using the wall's velocity at the contact point, so a
   spinning frame drags and flings the balls.
   ============================================================ */
function resolveWalls(b) {
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const A = vertices[i];
    const B = vertices[(i + 1) % n];

    const ex = B.x - A.x;
    const ey = B.y - A.y;

    // Candidate normal (perpendicular to the edge)
    let nx = -ey;
    let ny = ex;
    const len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;

    // Make sure it points inward (toward the polygon centre)
    if (nx * (cx - A.x) + ny * (cy - A.y) < 0) {
      nx = -nx;
      ny = -ny;
    }

    // Signed distance from the wall line, measured along the inward normal
    const d = (b.x - A.x) * nx + (b.y - A.y) * ny;

    if (d < b.r) {
      // Penetration: push the ball back inside
      const pen = b.r - d;
      b.x += nx * pen;
      b.y += ny * pen;

      // Contact point on the wall, and its distance vector from the centre
      const contactX = b.x - nx * b.r;
      const contactY = b.y - ny * b.r;
      const rx = contactX - cx;
      const ry = contactY - cy;

      // Wall velocity from rotation: v = omega x r  (omega = spinSpeed)
      const wvx = -state.spinSpeed * ry;
      const wvy = state.spinSpeed * rx;

      // Ball velocity relative to the moving wall
      let rvx = b.vx - wvx;
      let rvy = b.vy - wvy;

      const vn = rvx * nx + rvy * ny; // normal component
      if (vn < 0) {
        // tangent direction
        const tx = -ny;
        const ty = nx;
        const vt = rvx * tx + rvy * ty;

        const vnNew = -state.bounciness * vn;   // bounce
        const vtNew = vt * (1 - WALL_FRICTION); // friction drag

        rvx = vnNew * nx + vtNew * tx;
        rvy = vnNew * ny + vtNew * ty;

        // Convert back to world velocity (re-add wall velocity => fling)
        b.vx = wvx + rvx;
        b.vy = wvy + rvy;
      }
    }
  }
}

/* ============================================================
   Ball-to-ball collisions: mass-based separation + impulse
   ============================================================ */
function resolveBallCollisions() {
  const N = balls.length;
  for (let i = 0; i < N; i++) {
    const a = balls[i];
    for (let j = i + 1; j < N; j++) {
      const b = balls[j];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let dist = Math.hypot(dx, dy);
      const minDist = a.r + b.r;

      if (dist === 0) {
        // Perfectly overlapping: nudge apart randomly
        b.x += (Math.random() - 0.5) * 0.5;
        b.y += (Math.random() - 0.5) * 0.5;
        continue;
      }

      if (dist < minDist) {
        const nx = dx / dist;
        const ny = dy / dist;
        const invA = 1 / a.mass;
        const invB = 1 / b.mass;
        const invSum = invA + invB;

        // Positional separation (weighted by inverse mass)
        const pen = minDist - dist;
        const corr = pen / invSum;
        a.x -= nx * corr * invA;
        a.y -= ny * corr * invA;
        b.x += nx * corr * invB;
        b.y += ny * corr * invB;

        // Impulse resolution
        const rvx = b.vx - a.vx;
        const rvy = b.vy - a.vy;
        const velAlong = rvx * nx + rvy * ny;
        if (velAlong < 0) {
          const jImp = (-(1 + BALL_RESTITUTION) * velAlong) / invSum;
          const ix = jImp * nx;
          const iy = jImp * ny;
          a.vx -= ix * invA;
          a.vy -= iy * invA;
          b.vx += ix * invB;
          b.vy += iy * invB;
        }
      }
    }
  }
}

/* ============================================================
   Physics substep
   ============================================================ */
function substep(dt) {
  // advance rotation and rebuild the polygon for this substep
  polyAngle += state.spinSpeed * dt;
  computeVertices();

  // gravity vector
  const ga = (state.gravAngle * Math.PI) / 180;
  const gx = Math.cos(ga) * state.gravStrength;
  const gy = Math.sin(ga) * state.gravStrength;

  for (const b of balls) {
    b.vx += gx * dt;
    b.vy += gy * dt;

    b.vx *= DAMPING;
    b.vy *= DAMPING;

    b.x += b.vx * dt;
    b.y += b.vy * dt;

    resolveWalls(b);
  }

  if (state.collisions) {
    resolveBallCollisions();
    // Re-constrain inside the polygon so nothing escapes after being shoved
    for (const b of balls) resolveWalls(b);
  }
}

/* ============================================================
   Rendering
   ============================================================ */
function render() {
  // Background / motion trails
  if (state.trails) {
    ctx.fillStyle = "rgba(10, 10, 15, 0.18)"; // fade previous frame
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, W, H);
  }

  computeVertices(); // ensure geometry is fresh (e.g. when paused/resized)

  // Subtle radial glow behind the polygon
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, polyRadius * 1.35);
  glow.addColorStop(0, "rgba(100, 200, 255, 0.12)");
  glow.addColorStop(1, "rgba(100, 200, 255, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Polygon frame with glowing stroke + vertex dots
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < vertices.length; i++) {
    const v = vertices[i];
    if (i === 0) ctx.moveTo(v.x, v.y);
    else ctx.lineTo(v.x, v.y);
  }
  ctx.closePath();
  ctx.strokeStyle = "rgba(100, 200, 255, 0.9)";
  ctx.lineWidth = 3;
  ctx.shadowColor = "rgba(100, 200, 255, 0.9)";
  ctx.shadowBlur = 22;
  ctx.stroke();

  ctx.shadowBlur = 12;
  ctx.fillStyle = "rgba(190, 235, 255, 1)";
  for (const v of vertices) {
    ctx.beginPath();
    ctx.arc(v.x, v.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Balls: glow + solid fill + highlight
  for (const b of balls) {
    const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 2);
    g.addColorStop(0, `hsla(${b.hue}, 90%, 65%, 0.5)`);
    g.addColorStop(1, `hsla(${b.hue}, 90%, 65%, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r * 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `hsl(${b.hue}, 80%, 55%)`;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.beginPath();
    ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.25, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ============================================================
   Main loop
   ============================================================ */
function step() {
  const frameDt = (1 / 60) * state.timeScale;
  if (frameDt > 0) {
    const subDt = frameDt / SUBSTEPS;
    for (let s = 0; s < SUBSTEPS; s++) substep(subDt);
  }
  render();
  requestAnimationFrame(step);
}

/* ============================================================
   UI helpers
   ============================================================ */
const SHAPE_NAMES = {
  3: "Triangle", 4: "Square", 5: "Pentagon", 6: "Hexagon",
  7: "Heptagon", 8: "Octagon", 9: "Nonagon", 10: "Decagon",
  11: "Hendecagon", 12: "Dodecagon",
};
function shapeName(n) {
  return SHAPE_NAMES[n] || `${n}-gon`;
}

const ARROWS = ["→", "↘", "↓", "↙", "←", "↖", "↑", "↗"];
function gravArrow(deg) {
  return ARROWS[Math.round(deg / 45) % 8];
}

/* Bind a range slider to a state key */
function bindRange(id, valId, key, opts = {}) {
  const el = document.getElementById(id);
  const valEl = valId ? document.getElementById(valId) : null;
  const update = () => {
    const v = parseFloat(el.value);
    state[key] = v;
    if (valEl) valEl.textContent = opts.format ? opts.format(v) : v;
    if (opts.extra) opts.extra(v);
    if (opts.reinit) initBalls();
  };
  el.addEventListener("input", update);
  update();
}

/* Shape */
bindRange("sides", "sidesVal", "sides", {
  reinit: true,
  extra: (v) => {
    document.getElementById("shapeName").textContent = shapeName(v);
  },
});
bindRange("spin", "spinVal", "spinSpeed", { format: (v) => v.toFixed(1) });

/* Balls */
bindRange("count", "countVal", "count", { reinit: true });
bindRange("sizeVar", "sizeVarVal", "sizeVar", { reinit: true });
bindRange("bounciness", "bounceVal", "bounciness", { format: (v) => v.toFixed(2) });

/* Physics */
bindRange("gravAngle", "gravAngleVal", "gravAngle", {
  format: (v) => `${v}° ${gravArrow(v)}`,
});
bindRange("gravStrength", "gravStrengthVal", "gravStrength");
bindRange("timeScale", "timeScaleVal", "timeScale", {
  format: (v) => v.toFixed(1) + "×",
});

/* Toggles (take effect immediately, no reset) */
document.getElementById("collisions").addEventListener("change", (e) => {
  state.collisions = e.target.checked;
});
document.getElementById("trails").addEventListener("change", (e) => {
  state.trails = e.target.checked;
});

/* Explode */
document.getElementById("explode").addEventListener("click", () => {
  for (const b of balls) {
    const a = Math.random() * Math.PI * 2;
    const mag = 300 + Math.random() * 500;
    b.vx += Math.cos(a) * mag;
    b.vy += Math.sin(a) * mag;
  }
});

/* Collapsible sections */
document.querySelectorAll(".section-header").forEach((h) => {
  h.addEventListener("click", () => {
    h.parentElement.classList.toggle("collapsed");
  });
});

/* ============================================================
   Tooltips: a real DOM element on <body>, positioned with JS so
   it is never clipped by the panel's overflow-y: auto.
   ============================================================ */
const tooltip = document.getElementById("tooltip");
document.querySelectorAll("[data-tip]").forEach((el) => {
  el.addEventListener("mouseenter", () => {
    const rect = el.getBoundingClientRect();
    tooltip.textContent = el.getAttribute("data-tip");
    tooltip.style.left = rect.right + 12 + "px";
    tooltip.classList.add("show");

    // Clamp vertically so it stays on screen
    let top = rect.top;
    const th = tooltip.offsetHeight;
    if (top + th > window.innerHeight - 8) {
      top = window.innerHeight - th - 8;
    }
    tooltip.style.top = Math.max(8, top) + "px";
  });
  el.addEventListener("mouseleave", () => {
    tooltip.classList.remove("show");
  });
});

/* ============================================================
   Start
   ============================================================ */
computeVertices();
initBalls();
requestAnimationFrame(step);
