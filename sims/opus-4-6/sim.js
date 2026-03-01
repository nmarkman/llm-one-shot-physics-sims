(() => {
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const tooltip = document.getElementById('tooltip');

  // --- Resize ---
  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  // --- Controls ---
  const el = id => document.getElementById(id);
  const controls = {
    sides:      () => +el('r-sides').value,
    spin:       () => +el('r-spin').value,
    count:      () => +el('r-count').value,
    sizeVar:    () => +el('r-size').value,
    bounce:     () => +el('r-bounce').value,
    collisions: () => el('t-collisions').checked,
    gAngle:     () => +el('r-gangle').value,
    gStrength:  () => +el('r-gstr').value,
    timeScale:  () => +el('r-time').value,
    trails:     () => el('t-trails').checked,
  };

  const shapeNames = {
    3:'Triangle',4:'Square',5:'Pentagon',6:'Hexagon',7:'Heptagon',
    8:'Octagon',9:'Nonagon',10:'Decagon',11:'Hendecagon',12:'Dodecagon',
  };
  function shapeName(n) { return shapeNames[n] || n + '-gon'; }

  const gravArrows = ['→','↘','↓','↙','←','↖','↑','↗'];
  function gravArrow(deg) {
    const i = Math.round(((deg % 360 + 360) % 360) / 45) % 8;
    return gravArrows[i];
  }

  // Value displays
  function updateDisplays() {
    el('v-sides').textContent = controls.sides();
    el('shape-name').textContent = shapeName(controls.sides());
    el('v-spin').textContent = controls.spin().toFixed(2);
    el('v-count').textContent = controls.count();
    el('v-size').textContent = controls.sizeVar();
    el('v-bounce').textContent = controls.bounce().toFixed(2);
    const ga = controls.gAngle();
    el('v-gangle').textContent = ga + '° ' + gravArrow(ga);
    el('v-gstr').textContent = controls.gStrength();
    el('v-time').textContent = controls.timeScale().toFixed(1) + '×';
  }

  // Controls that reinitialize balls
  ['r-sides', 'r-count', 'r-size'].forEach(id => {
    el(id).addEventListener('input', () => { updateDisplays(); initBalls(); });
  });
  // Controls that just update displays
  ['r-spin', 'r-bounce', 'r-gangle', 'r-gstr', 'r-time'].forEach(id => {
    el(id).addEventListener('input', updateDisplays);
  });

  // Section collapse
  document.querySelectorAll('.section-header').forEach(h => {
    h.addEventListener('click', () => {
      const body = h.nextElementSibling;
      const collapsed = !body.classList.contains('hidden');
      body.classList.toggle('hidden', collapsed);
      h.classList.toggle('collapsed', collapsed);
    });
  });

  // Tooltips (real DOM, positioned outside panel)
  document.querySelectorAll('[data-tip]').forEach(ctrl => {
    ctrl.addEventListener('mouseenter', e => {
      const rect = ctrl.getBoundingClientRect();
      tooltip.textContent = ctrl.dataset.tip;
      tooltip.style.left = (rect.right + 10) + 'px';
      tooltip.style.top = rect.top + 'px';
      tooltip.classList.add('visible');
    });
    ctrl.addEventListener('mouseleave', () => {
      tooltip.classList.remove('visible');
    });
  });

  // Explode
  el('btn-explode').addEventListener('click', () => {
    for (const b of balls) {
      const angle = Math.random() * Math.PI * 2;
      const mag = 300 + Math.random() * 500;
      b.vx += Math.cos(angle) * mag;
      b.vy += Math.sin(angle) * mag;
    }
  });

  // --- Ball colors ---
  const palette = [
    '#ff6b6b','#ffa94d','#ffd43b','#69db7c','#38d9a9',
    '#4dabf7','#748ffc','#da77f2','#f783ac','#66d9e8',
    '#a9e34b','#ff8787','#74c0fc','#b197fc','#ffa8a8',
  ];

  // --- Balls ---
  let balls = [];
  const BASE_R = 6;
  const DAMPING = 0.999;
  const SUBSTEPS = 5;

  function polyRadius() {
    return Math.min(canvas.width, canvas.height) * 0.34;
  }

  // Apothem = R * cos(pi/n)
  function apothem(R, n) {
    return R * Math.cos(Math.PI / n);
  }

  function initBalls() {
    const count = controls.count();
    const sizeVar = controls.sizeVar();
    const n = controls.sides();
    const R = polyRadius();
    const ap = apothem(R, n);
    balls = [];
    for (let i = 0; i < count; i++) {
      const r = BASE_R + Math.random() * sizeVar;
      const spawnR = (ap - r - 2) * Math.sqrt(Math.random());
      const angle = Math.random() * Math.PI * 2;
      balls.push({
        x: Math.cos(angle) * spawnR,
        y: Math.sin(angle) * spawnR,
        vx: (Math.random() - 0.5) * 60,
        vy: (Math.random() - 0.5) * 60,
        r,
        mass: r * r,
        color: palette[i % palette.length],
      });
    }
  }

  // --- Polygon geometry ---
  let polyAngle = 0;

  function getPolyVerts(n, R, angle) {
    const verts = [];
    for (let i = 0; i < n; i++) {
      const a = angle + (Math.PI * 2 * i) / n - Math.PI / 2;
      verts.push({ x: Math.cos(a) * R, y: Math.sin(a) * R });
    }
    return verts;
  }

  // --- Physics ---
  function stepPhysics(dt) {
    const n = controls.sides();
    const R = polyRadius();
    const spin = controls.spin();
    const bounciness = controls.bounce();
    const gAngle = (controls.gAngle() * Math.PI) / 180;
    const gStr = controls.gStrength();
    const doCollisions = controls.collisions();
    const omega = spin; // rad/s
    const subDt = dt / SUBSTEPS;

    for (let s = 0; s < SUBSTEPS; s++) {
      // Advance rotation
      polyAngle += omega * subDt;

      const verts = getPolyVerts(n, R, polyAngle);
      const edges = [];
      for (let i = 0; i < n; i++) {
        const a = verts[i], b = verts[(i + 1) % n];
        const dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        // Inward normal
        const nx = -dy / len, ny = dx / len;
        edges.push({ a, b, nx, ny, len });
      }

      for (const ball of balls) {
        // Gravity
        ball.vx += Math.cos(gAngle) * gStr * subDt;
        ball.vy += Math.sin(gAngle) * gStr * subDt;

        // Move
        ball.x += ball.vx * subDt;
        ball.y += ball.vy * subDt;

        // Damping
        ball.vx *= DAMPING;
        ball.vy *= DAMPING;

        // Wall collisions (edge-based)
        for (const edge of edges) {
          const dist = (ball.x - edge.a.x) * edge.nx + (ball.y - edge.a.y) * edge.ny;
          if (dist < ball.r) {
            const pen = ball.r - dist;
            // Push inward
            ball.x += edge.nx * pen;
            ball.y += edge.ny * pen;

            // Contact point on wall
            const cx = ball.x - edge.nx * ball.r;
            const cy = ball.y - edge.ny * ball.r;

            // Wall velocity at contact point due to rotation
            const wallVx = -omega * cy;
            const wallVy = omega * cx;

            // Relative velocity
            let relVx = ball.vx - wallVx;
            let relVy = ball.vy - wallVy;

            const relVn = relVx * edge.nx + relVy * edge.ny;
            if (relVn < 0) {
              // Normal impulse
              relVx -= (1 + bounciness) * relVn * edge.nx;
              relVy -= (1 + bounciness) * relVn * edge.ny;

              // Tangent friction
              const tx = -edge.ny, ty = edge.nx;
              const relVt = relVx * tx + relVy * ty;
              const friction = 0.3;
              relVx -= friction * relVt * tx;
              relVy -= friction * relVt * ty;

              ball.vx = relVx + wallVx;
              ball.vy = relVy + wallVy;
            }
          }
        }
      }

      // Ball-ball collisions
      if (doCollisions) {
        for (let i = 0; i < balls.length; i++) {
          for (let j = i + 1; j < balls.length; j++) {
            const a = balls[i], b = balls[j];
            const dx = b.x - a.x, dy = b.y - a.y;
            const distSq = dx * dx + dy * dy;
            const minDist = a.r + b.r;
            if (distSq < minDist * minDist && distSq > 0.0001) {
              const dist = Math.sqrt(distSq);
              const nx = dx / dist, ny = dy / dist;
              const overlap = minDist - dist;

              // Separate
              const totalMass = a.mass + b.mass;
              a.x -= nx * overlap * (b.mass / totalMass);
              a.y -= ny * overlap * (b.mass / totalMass);
              b.x += nx * overlap * (a.mass / totalMass);
              b.y += ny * overlap * (a.mass / totalMass);

              // Impulse
              const dvx = a.vx - b.vx, dvy = a.vy - b.vy;
              const dvn = dvx * nx + dvy * ny;
              if (dvn > 0) {
                const imp = (2 * dvn) / totalMass;
                a.vx -= imp * b.mass * nx;
                a.vy -= imp * b.mass * ny;
                b.vx += imp * a.mass * nx;
                b.vy += imp * a.mass * ny;
              }
            }
          }
        }

        // Re-constrain balls inside polygon after ball-ball resolution
        const verts2 = getPolyVerts(n, R, polyAngle);
        const edges2 = [];
        for (let i = 0; i < n; i++) {
          const a = verts2[i], b2 = verts2[(i + 1) % n];
          const dx = b2.x - a.x, dy = b2.y - a.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          edges2.push({ a, nx: -dy / len, ny: dx / len });
        }
        for (const ball of balls) {
          for (const edge of edges2) {
            const dist = (ball.x - edge.a.x) * edge.nx + (ball.y - edge.a.y) * edge.ny;
            if (dist < ball.r) {
              ball.x += edge.nx * (ball.r - dist);
              ball.y += edge.ny * (ball.r - dist);
            }
          }
        }
      }
    }
  }

  // --- Rendering ---
  function draw() {
    const cx = canvas.width / 2, cy = canvas.height / 2;
    const n = controls.sides();
    const R = polyRadius();
    const trails = controls.trails();

    if (trails) {
      ctx.fillStyle = 'rgba(10, 10, 15, 0.15)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    ctx.save();
    ctx.translate(cx, cy);

    // Background glow
    if (!trails) {
      const bgGrad = ctx.createRadialGradient(0, 0, R * 0.1, 0, 0, R * 1.2);
      bgGrad.addColorStop(0, 'rgba(100, 200, 255, 0.04)');
      bgGrad.addColorStop(1, 'rgba(10, 10, 15, 0)');
      ctx.fillStyle = bgGrad;
      ctx.beginPath();
      ctx.arc(0, 0, R * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Polygon
    const verts = getPolyVerts(n, R, polyAngle);

    ctx.save();
    ctx.shadowColor = 'rgba(100, 200, 255, 0.5)';
    ctx.shadowBlur = 20;
    ctx.strokeStyle = 'rgba(100, 200, 255, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(verts[0].x, verts[0].y);
    for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // Vertex dots
    for (const v of verts) {
      ctx.fillStyle = 'rgba(100, 200, 255, 0.9)';
      ctx.beginPath();
      ctx.arc(v.x, v.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Balls
    for (const b of balls) {
      // Glow
      const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 2);
      grad.addColorStop(0, b.color + '40');
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 2, 0, Math.PI * 2);
      ctx.fill();

      // Fill
      const fillGrad = ctx.createRadialGradient(b.x - b.r * 0.3, b.y - b.r * 0.3, 0, b.x, b.y, b.r);
      fillGrad.addColorStop(0, lighten(b.color, 30));
      fillGrad.addColorStop(1, b.color);
      ctx.fillStyle = fillGrad;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();

      // Highlight dot
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function lighten(hex, amt) {
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);
    r = Math.min(255, r + amt);
    g = Math.min(255, g + amt);
    b = Math.min(255, b + amt);
    return `rgb(${r},${g},${b})`;
  }

  // --- Loop ---
  let lastTime = 0;
  function loop(t) {
    const rawDt = Math.min((t - lastTime) / 1000, 0.05);
    lastTime = t;
    const dt = rawDt * controls.timeScale();
    if (dt > 0) stepPhysics(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // --- Init ---
  updateDisplays();
  initBalls();
  requestAnimationFrame(t => { lastTime = t; loop(t); });
})();
