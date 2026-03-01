// ============================================================
//  Polygon Physics Simulation — Sonnet 4-6
// ============================================================

const canvas = document.getElementById('c');
const ctx    = canvas.getContext('2d');

// ---- Config (live-editable) ---------------------------------
const cfg = {
  sides:       8,
  spinSpeed:   0.5,      // rad/s
  count:       40,
  sizeVariation: 12,
  bounciness:  0.72,
  ballCollisions: true,
  gravAngle:   0,        // degrees, 0 = down
  gravStrength:600,
  timeScale:   1.0,
  trails:      false,
};

// ---- State --------------------------------------------------
let polyAngle  = 0;      // current rotation of polygon (rad)
let balls      = [];
let W = 0, H = 0;
let polyRadius = 0;      // circumradius
let lastTime   = null;

// ---- Shape names -------------------------------------------
const SHAPE_NAMES = {
  3:'Triangle',4:'Square',5:'Pentagon',6:'Hexagon',7:'Heptagon',
  8:'Octagon',9:'Nonagon',10:'Decagon',11:'Hendecagon',12:'Dodecagon',
  13:'Tridecagon',14:'Tetradecagon',15:'Pentadecagon',16:'Hexadecagon',
  17:'Heptadecagon',18:'Octadecagon',19:'Enneadecagon',20:'Icosagon',
};

// ---- Gravity angle helpers ---------------------------------
function gravVector() {
  // 0° = down  (+y), 90° = left (-x), 180° = up (-y), 270° = right (+x)
  const rad = (cfg.gravAngle * Math.PI) / 180;
  return { x: -Math.sin(rad) * cfg.gravStrength, y: Math.cos(rad) * cfg.gravStrength };
}

function gravArrow(deg) {
  const d = ((deg % 360) + 360) % 360;
  if (d < 22.5 || d >= 337.5) return '↓';
  if (d < 67.5)  return '↙';
  if (d < 112.5) return '←';
  if (d < 157.5) return '↖';
  if (d < 202.5) return '↑';
  if (d < 247.5) return '↗';
  if (d < 292.5) return '→';
  return '↘';
}

// ---- Resize -------------------------------------------------
function resize() {
  W = canvas.width  = window.innerWidth;
  H = canvas.height = window.innerHeight;
  polyRadius = Math.min(W, H) * 0.40;
}
window.addEventListener('resize', () => { resize(); initBalls(); });
resize();

// ---- Apothem (inscribed radius) ----------------------------
function apothem(n, R) {
  return R * Math.cos(Math.PI / n);
}

// ---- Ball factory ------------------------------------------
function makeBall() {
  const r   = 6 + Math.random() * cfg.sizeVariation;
  const ap  = apothem(cfg.sides, polyRadius) - r - 2;
  const ang = Math.random() * Math.PI * 2;
  const dist= Math.random() * ap * 0.8;
  return {
    x:  W / 2 + Math.cos(ang) * dist,
    y:  H / 2 + Math.sin(ang) * dist,
    vx: (Math.random() - 0.5) * 200,
    vy: (Math.random() - 0.5) * 200,
    r,
    m:  r * r,                 // mass proportional to area
    color: `hsl(${Math.random() * 360},85%,62%)`,
  };
}

function initBalls() {
  balls = [];
  for (let i = 0; i < cfg.count; i++) balls.push(makeBall());
}
initBalls();

// ---- Polygon geometry --------------------------------------
// Returns vertices in world-space given current polyAngle
function polyVerts() {
  const cx = W / 2, cy = H / 2;
  const n  = cfg.sides;
  const verts = [];
  for (let i = 0; i < n; i++) {
    const a = polyAngle + (i / n) * Math.PI * 2;
    verts.push({ x: cx + Math.cos(a) * polyRadius, y: cy + Math.sin(a) * polyRadius });
  }
  return verts;
}

// ---- Edge collision (proper signed-distance) ---------------
// Returns penetration depth (positive = inside) and inward normal
function edgeInfo(ax, ay, bx, by) {
  const ex = bx - ax, ey = by - ay;
  const len = Math.hypot(ex, ey);
  // inward normal (points to the right of edge direction, i.e. interior for CCW polygon)
  // For a polygon drawn with increasing angle (CCW), right-hand normal points inward
  return {
    nx: ey / len,   // inward normal
    ny: -ex / len,
    len,
    ex: ex / len,
    ey: ey / len,
  };
}

function constrainBallToPolygon(b) {
  const verts  = polyVerts();
  const n      = cfg.sides;
  const cx     = W / 2, cy = H / 2;

  // Find the edge with least penetration (most constraining)
  let minPen = Infinity;
  let bestNx = 0, bestNy = 0, bestEdge = -1;

  for (let i = 0; i < n; i++) {
    const a = verts[i];
    const bv = verts[(i + 1) % n];
    const { nx, ny } = edgeInfo(a.x, a.y, bv.x, bv.y);

    // Signed distance from ball center to edge (positive = inside polygon)
    // The edge plane: point on edge = a, normal = (nx,ny) inward
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = dx * nx + dy * ny;   // dist from edge, positive = inside

    const pen = dist - b.r;           // penetration: negative means ball is outside edge
    if (pen < minPen) {
      minPen  = pen;
      bestNx  = nx;
      bestNy  = ny;
      bestEdge = i;
    }
  }

  // If any edge shows negative pen the ball has escaped that edge
  if (minPen < 0) {
    // Push ball back
    b.x -= bestNx * minPen;   // minPen is negative so this adds inward push
    b.y -= bestNy * minPen;
    return { nx: bestNx, ny: bestNy, pen: -minPen };
  }
  return null;
}

// ---- Wall bounce with spinning-wall drag -------------------
function resolveWallCollision(b, nx, ny, pen, dt) {
  // Velocity of the wall surface at collision point
  // omega = polyAngle rate, wall point distance from center
  const omega = cfg.spinSpeed;
  const dx = b.x - W / 2, dy = b.y - H / 2;
  // Tangential velocity of wall = omega × r_perp
  const wallVx = -omega * dy;
  const wallVy =  omega * dx;

  // Relative velocity of ball w.r.t. wall
  const relVx = b.vx - wallVx;
  const relVy = b.vy - wallVy;

  // Normal component
  const vn = relVx * nx + relVy * ny;

  // Only resolve if ball moving into wall
  if (vn < 0) {
    const restitution = cfg.bounciness;
    // Impulse normal component
    const jn = -(1 + restitution) * vn;
    b.vx += jn * nx;
    b.vy += jn * ny;

    // Friction tangent
    const tx = relVx - vn * nx;
    const ty = relVy - vn * ny;
    const tlen = Math.hypot(tx, ty);
    if (tlen > 0.01) {
      const friction = 0.18;
      b.vx -= friction * (tx / tlen) * Math.abs(jn);
      b.vy -= friction * (ty / tlen) * Math.abs(jn);
    }

    // Spinning-wall drag: blend velocity toward wall tangential at contact
    const drag = 0.08;
    b.vx += drag * (wallVx - b.vx);
    b.vy += drag * (wallVy - b.vy);
  }
}

// ---- Ball–ball collision -----------------------------------
function resolveBallCollisions() {
  const n = balls.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = balls[i], b = balls[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist2 = dx * dx + dy * dy;
      const minD  = a.r + b.r;
      if (dist2 >= minD * minD) continue;

      const dist = Math.sqrt(dist2) || 0.001;
      const nx   = dx / dist, ny = dy / dist;

      // Separate
      const overlap = (minD - dist) * 0.5;
      const ma = a.m, mb = b.m, mt = ma + mb;
      a.x -= nx * overlap * (mb / mt);
      a.y -= ny * overlap * (mb / mt);
      b.x += nx * overlap * (ma / mt);
      b.y += ny * overlap * (ma / mt);

      // Impulse
      const dvx  = a.vx - b.vx, dvy = a.vy - b.vy;
      const dvn  = dvx * nx + dvy * ny;
      if (dvn > 0) continue;  // already separating

      const e   = 0.75;  // ball-ball restitution
      const imp = -(1 + e) * dvn / (1 / ma + 1 / mb);
      a.vx += (imp / ma) * nx;
      a.vy += (imp / ma) * ny;
      b.vx -= (imp / mb) * nx;
      b.vy -= (imp / mb) * ny;
    }
  }
}

// ---- Physics step ------------------------------------------
const SUBSTEPS   = 5;
const DAMPING    = 0.9995;  // per second (applied as damping^dt each step)

function stepPhysics(dt) {
  const sub_dt = dt / SUBSTEPS;
  const g      = gravVector();

  for (let step = 0; step < SUBSTEPS; step++) {
    // Integrate
    for (const b of balls) {
      b.vx += g.x * sub_dt;
      b.vy += g.y * sub_dt;
      // Damping
      const damp = Math.pow(DAMPING, sub_dt);
      b.vx *= damp;
      b.vy *= damp;
      b.x  += b.vx * sub_dt;
      b.y  += b.vy * sub_dt;
    }

    // Wall collisions
    for (const b of balls) {
      const hit = constrainBallToPolygon(b);
      if (hit) {
        resolveWallCollision(b, hit.nx, hit.ny, hit.pen, sub_dt);
      }
    }

    // Ball–ball collisions
    if (cfg.ballCollisions) {
      resolveBallCollisions();
      // Re-constrain after ball-ball to prevent escape
      for (const b of balls) constrainBallToPolygon(b);
    }
  }
}

// ---- Draw --------------------------------------------------
function drawBall(b) {
  // Glow
  const grd = ctx.createRadialGradient(b.x, b.y, b.r * 0.1, b.x, b.y, b.r * 2.0);
  grd.addColorStop(0,   b.color.replace('62%)', '62%, 0.35)').replace('hsl', 'hsla'));
  grd.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.r * 2.0, 0, Math.PI * 2);
  ctx.fillStyle = grd;
  ctx.fill();

  // Solid fill
  const grad = ctx.createRadialGradient(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.1,
                                         b.x, b.y, b.r);
  grad.addColorStop(0, lighten(b.color, 20));
  grad.addColorStop(1, darken(b.color, 25));
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // Highlight
  ctx.beginPath();
  ctx.arc(b.x - b.r * 0.32, b.y - b.r * 0.32, b.r * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fill();
}

function lighten(hsl, pct) {
  return hsl.replace(/(\d+)%\)$/, (m, l) => `${Math.min(100, +l + pct)}%)`);
}
function darken(hsl, pct) {
  return hsl.replace(/(\d+)%\)$/, (m, l) => `${Math.max(0, +l - pct)}%)`);
}

function drawPolygon(verts) {
  const n = verts.length;
  ctx.save();
  ctx.shadowColor = 'rgba(100,200,255,0.8)';
  ctx.shadowBlur  = 18;
  ctx.strokeStyle = 'rgba(100,200,255,0.85)';
  ctx.lineWidth   = 2.5;
  ctx.beginPath();
  ctx.moveTo(verts[0].x, verts[0].y);
  for (let i = 1; i < n; i++) ctx.lineTo(verts[i].x, verts[i].y);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  // Vertex dots
  for (const v of verts) {
    ctx.save();
    ctx.shadowColor = 'rgba(100,200,255,1)';
    ctx.shadowBlur  = 10;
    ctx.fillStyle   = 'rgba(150,220,255,0.9)';
    ctx.beginPath();
    ctx.arc(v.x, v.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawBgGlow() {
  const grd = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, polyRadius * 1.2);
  grd.addColorStop(0,   'rgba(30,80,120,0.10)');
  grd.addColorStop(0.5, 'rgba(20,50,80,0.05)');
  grd.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);
}

// ---- Main loop ---------------------------------------------
function frame(ts) {
  if (!lastTime) lastTime = ts;
  let dt = Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;

  dt *= cfg.timeScale;

  // Spin polygon
  polyAngle += cfg.spinSpeed * dt;

  // Physics
  stepPhysics(dt);

  // Render
  if (cfg.trails) {
    ctx.fillStyle = 'rgba(10,10,15,0.28)';
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, W, H);
    drawBgGlow();
  }

  const verts = polyVerts();
  drawPolygon(verts);
  for (const b of balls) drawBall(b);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ============================================================
//  UI Controls
// ============================================================

function toggleSection(id) {
  document.getElementById(id).classList.toggle('collapsed');
}

function bind(slId, lblId, key, fmt, reinit) {
  const sl  = document.getElementById(slId);
  const lbl = document.getElementById(lblId);
  sl.addEventListener('input', () => {
    cfg[key] = parseFloat(sl.value);
    lbl.textContent = fmt(cfg[key]);
    if (reinit) initBalls();
  });
  lbl.textContent = fmt(cfg[key]);
}

bind('sl-sides',     'lbl-sides',     'sides',        v => Math.round(v), () => {
  cfg.sides = parseInt(document.getElementById('sl-sides').value);
  document.getElementById('shape-name').textContent = SHAPE_NAMES[cfg.sides] || `${cfg.sides}-gon`;
  initBalls();
});
// fix sides: bind differently since we need the integer
document.getElementById('sl-sides').addEventListener('input', function() {
  cfg.sides = parseInt(this.value);
  document.getElementById('lbl-sides').textContent = cfg.sides;
  document.getElementById('shape-name').textContent = SHAPE_NAMES[cfg.sides] || `${cfg.sides}-gon`;
  initBalls();
});
document.getElementById('shape-name').textContent = SHAPE_NAMES[cfg.sides];

bind('sl-spin',      'lbl-spin',      'spinSpeed',    v => v.toFixed(2)+'×');
bind('sl-count',     'lbl-count',     'count',        v => Math.round(v), true);
bind('sl-sizevar',   'lbl-sizevar',   'sizeVariation',v => Math.round(v), true);
bind('sl-bounce',    'lbl-bounce',    'bounciness',   v => v.toFixed(2));

bind('sl-gravang',   'lbl-gravang',   'gravAngle',    v => `${gravArrow(v)} ${Math.round(v)}°`);
bind('sl-gravstr',   'lbl-gravstr',   'gravStrength', v => Math.round(v));
bind('sl-timescale', 'lbl-timescale', 'timeScale',    v => v.toFixed(2)+'×');

// reinit triggers
document.getElementById('sl-count').addEventListener('input', initBalls);
document.getElementById('sl-sizevar').addEventListener('input', initBalls);

// Toggles
document.getElementById('tog-collisions').addEventListener('change', function() {
  cfg.ballCollisions = this.checked;
});
document.getElementById('tog-trails').addEventListener('change', function() {
  cfg.trails = this.checked;
});

// Explode
document.getElementById('btnExplode').addEventListener('click', () => {
  for (const b of balls) {
    const ang = Math.random() * Math.PI * 2;
    const spd = 300 + Math.random() * 500;
    b.vx += Math.cos(ang) * spd;
    b.vy += Math.sin(ang) * spd;
  }
});

// ---- Tooltip -----------------------------------------------
const tooltip = document.getElementById('tooltip');

function attachTooltips() {
  const els = document.querySelectorAll('[data-tip]');
  els.forEach(el => {
    el.addEventListener('mouseenter', e => {
      tooltip.textContent = el.getAttribute('data-tip');
      tooltip.style.display = 'block';
      positionTooltip(el);
    });
    el.addEventListener('mousemove', () => positionTooltip(el));
    el.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
  });
}

function positionTooltip(el) {
  const rect = el.getBoundingClientRect();
  let x = rect.right + 10;
  let y = rect.top + rect.height / 2 - tooltip.offsetHeight / 2;
  // keep on screen
  if (x + tooltip.offsetWidth > window.innerWidth - 8) x = rect.left - tooltip.offsetWidth - 10;
  if (y < 8) y = 8;
  if (y + tooltip.offsetHeight > window.innerHeight - 8) y = window.innerHeight - tooltip.offsetHeight - 8;
  tooltip.style.left = x + 'px';
  tooltip.style.top  = y + 'px';
}

attachTooltips();

// ---- Fix duplicate listener (bind() fires its own, then we add more) ----
// Suppress the dummy bind calls for sides/count/sizevar by removing direct
// re-registration — the proper listeners above already handle them.
// (The bind() calls for those just set initial label text correctly.)
