const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const tooltip = document.getElementById('tooltip');

let width, height, centerX, centerY;

function resize() {
  width = canvas.width = window.innerWidth;
  height = canvas.height = window.innerHeight;
  centerX = width / 2;
  centerY = height / 2;
}
resize();
window.addEventListener('resize', resize);

const shapeNames = {
  3: 'Triangle', 4: 'Square', 5: 'Pentagon', 6: 'Hexagon',
  7: 'Heptagon', 8: 'Octagon', 9: 'Nonagon', 10: 'Decagon',
  11: 'Hendecagon', 12: 'Dodecagon', 13: 'Tridecagon', 14: 'Tetradecagon',
  15: 'Pentadecagon', 16: 'Hexadecagon', 17: 'Heptadecagon', 18: 'Octadecagon',
  19: 'Enneadecagon', 20: 'Icosagon'
};

const config = {
  sides: 8,
  spinSpeed: 0.5,
  ballCount: 40,
  sizeVariation: 10,
  bounciness: 0.8,
  ballCollisions: true,
  gravityAngle: 90,
  gravityStrength: 800,
  timeScale: 1,
  trails: false
};

let polygonAngle = 0;
let balls = [];
const polygonRadius = Math.min(width, height) * 0.35;
const baseRadius = 6;
const damping = 0.999;
const substeps = 5;

const ballColors = [
  [255, 100, 100], [100, 255, 150], [100, 200, 255],
  [255, 200, 100], [200, 100, 255], [255, 150, 200],
  [150, 255, 200], [255, 255, 150], [150, 200, 255],
  [255, 180, 120]
];

function getApothem(circumradius, sides) {
  return circumradius * Math.cos(Math.PI / sides);
}

function getPolygonVertices(cx, cy, radius, sides, angle) {
  const vertices = [];
  for (let i = 0; i < sides; i++) {
    const a = angle + (i * 2 * Math.PI / sides) - Math.PI / 2;
    vertices.push({
      x: cx + radius * Math.cos(a),
      y: cy + radius * Math.sin(a)
    });
  }
  return vertices;
}

function createBall() {
  const apothem = getApothem(polygonRadius, config.sides);
  const spawnRadius = apothem * 0.7;
  const angle = Math.random() * Math.PI * 2;
  const dist = Math.random() * spawnRadius;
  const colorIdx = Math.floor(Math.random() * ballColors.length);
  const radius = baseRadius + Math.random() * config.sizeVariation;
  
  return {
    x: centerX + Math.cos(angle) * dist,
    y: centerY + Math.sin(angle) * dist,
    vx: (Math.random() - 0.5) * 100,
    vy: (Math.random() - 0.5) * 100,
    radius: radius,
    mass: radius * radius,
    color: ballColors[colorIdx]
  };
}

function initBalls() {
  balls = [];
  for (let i = 0; i < config.ballCount; i++) {
    balls.push(createBall());
  }
}

function getGravity() {
  const angleRad = config.gravityAngle * Math.PI / 180;
  return {
    x: Math.cos(angleRad) * config.gravityStrength,
    y: Math.sin(angleRad) * config.gravityStrength
  };
}

function constrainToPolygon(ball, vertices, angularVel) {
  const sides = vertices.length;
  
  for (let i = 0; i < sides; i++) {
    const v1 = vertices[i];
    const v2 = vertices[(i + 1) % sides];
    
    const edgeX = v2.x - v1.x;
    const edgeY = v2.y - v1.y;
    const edgeLen = Math.sqrt(edgeX * edgeX + edgeY * edgeY);
    
    const nx = -edgeY / edgeLen;
    const ny = edgeX / edgeLen;
    
    const midX = (v1.x + v2.x) / 2;
    const midY = (v1.y + v2.y) / 2;
    const toCenterX = centerX - midX;
    const toCenterY = centerY - midY;
    
    let inwardNx = nx;
    let inwardNy = ny;
    if (nx * toCenterX + ny * toCenterY < 0) {
      inwardNx = -nx;
      inwardNy = -ny;
    }
    
    const dx = ball.x - v1.x;
    const dy = ball.y - v1.y;
    const signedDist = dx * inwardNx + dy * inwardNy;
    
    if (signedDist < ball.radius) {
      const penetration = ball.radius - signedDist;
      ball.x += inwardNx * penetration;
      ball.y += inwardNy * penetration;
      
      const contactX = ball.x - inwardNx * ball.radius;
      const contactY = ball.y - inwardNy * ball.radius;
      const rx = contactX - centerX;
      const ry = contactY - centerY;
      const wallVx = -angularVel * ry;
      const wallVy = angularVel * rx;
      
      const relVx = ball.vx - wallVx;
      const relVy = ball.vy - wallVy;
      
      const velNormal = relVx * inwardNx + relVy * inwardNy;
      
      if (velNormal < 0) {
        const tangentX = -inwardNy;
        const tangentY = inwardNx;
        const velTangent = relVx * tangentX + relVy * tangentY;
        
        const newNormalVel = -velNormal * config.bounciness;
        const friction = 0.98;
        const newTangentVel = velTangent * friction;
        
        ball.vx = wallVx + inwardNx * newNormalVel + tangentX * newTangentVel;
        ball.vy = wallVy + inwardNy * newNormalVel + tangentY * newTangentVel;
      }
    }
  }
}

function ballCollision(b1, b2) {
  const dx = b2.x - b1.x;
  const dy = b2.y - b1.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const minDist = b1.radius + b2.radius;
  
  if (dist < minDist && dist > 0.001) {
    const nx = dx / dist;
    const ny = dy / dist;
    
    const overlap = minDist - dist;
    const totalMass = b1.mass + b2.mass;
    b1.x -= nx * overlap * (b2.mass / totalMass);
    b1.y -= ny * overlap * (b2.mass / totalMass);
    b2.x += nx * overlap * (b1.mass / totalMass);
    b2.y += ny * overlap * (b1.mass / totalMass);
    
    const dvx = b1.vx - b2.vx;
    const dvy = b1.vy - b2.vy;
    const dvn = dvx * nx + dvy * ny;
    
    if (dvn > 0) {
      const restitution = 0.9;
      const impulse = (2 * dvn) / totalMass * restitution;
      
      b1.vx -= impulse * b2.mass * nx;
      b1.vy -= impulse * b2.mass * ny;
      b2.vx += impulse * b1.mass * nx;
      b2.vy += impulse * b1.mass * ny;
    }
  }
}

function update(dt) {
  const scaledDt = dt * config.timeScale;
  const subDt = scaledDt / substeps;
  const gravity = getGravity();
  const angularVel = config.spinSpeed;
  
  polygonAngle += angularVel * scaledDt;
  
  for (let step = 0; step < substeps; step++) {
    const vertices = getPolygonVertices(centerX, centerY, polygonRadius, config.sides, polygonAngle);
    
    for (const ball of balls) {
      ball.vx += gravity.x * subDt;
      ball.vy += gravity.y * subDt;
      
      ball.vx *= damping;
      ball.vy *= damping;
      
      ball.x += ball.vx * subDt;
      ball.y += ball.vy * subDt;
      
      constrainToPolygon(ball, vertices, angularVel);
    }
    
    if (config.ballCollisions) {
      for (let i = 0; i < balls.length; i++) {
        for (let j = i + 1; j < balls.length; j++) {
          ballCollision(balls[i], balls[j]);
        }
      }
      
      for (const ball of balls) {
        constrainToPolygon(ball, vertices, angularVel);
      }
    }
  }
}

function drawBackground() {
  if (config.trails) {
    ctx.fillStyle = 'rgba(10, 10, 15, 0.15)';
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, width, height);
  }
  
  const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, polygonRadius * 1.5);
  gradient.addColorStop(0, 'rgba(100, 200, 255, 0.05)');
  gradient.addColorStop(1, 'rgba(100, 200, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function drawPolygon() {
  const vertices = getPolygonVertices(centerX, centerY, polygonRadius, config.sides, polygonAngle);
  
  ctx.save();
  ctx.strokeStyle = 'rgba(100, 200, 255, 0.8)';
  ctx.lineWidth = 3;
  ctx.shadowColor = 'rgba(100, 200, 255, 0.8)';
  ctx.shadowBlur = 20;
  
  ctx.beginPath();
  ctx.moveTo(vertices[0].x, vertices[0].y);
  for (let i = 1; i < vertices.length; i++) {
    ctx.lineTo(vertices[i].x, vertices[i].y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
  
  ctx.fillStyle = 'rgba(100, 200, 255, 0.9)';
  for (const v of vertices) {
    ctx.beginPath();
    ctx.arc(v.x, v.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBall(ball) {
  const [r, g, b] = ball.color;
  
  const glowGrad = ctx.createRadialGradient(
    ball.x, ball.y, 0,
    ball.x, ball.y, ball.radius * 2
  );
  glowGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.3)`);
  glowGrad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  ctx.fillStyle = glowGrad;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.radius * 2, 0, Math.PI * 2);
  ctx.fill();
  
  const ballGrad = ctx.createRadialGradient(
    ball.x - ball.radius * 0.3, ball.y - ball.radius * 0.3, 0,
    ball.x, ball.y, ball.radius
  );
  ballGrad.addColorStop(0, `rgba(${Math.min(255, r + 50)}, ${Math.min(255, g + 50)}, ${Math.min(255, b + 50)}, 1)`);
  ballGrad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 1)`);
  ctx.fillStyle = ballGrad;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.beginPath();
  ctx.arc(ball.x - ball.radius * 0.3, ball.y - ball.radius * 0.3, ball.radius * 0.2, 0, Math.PI * 2);
  ctx.fill();
}

function draw() {
  drawBackground();
  drawPolygon();
  for (const ball of balls) {
    drawBall(ball);
  }
}

let lastTime = performance.now();
function loop(time) {
  const dt = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;
  
  update(dt);
  draw();
  
  requestAnimationFrame(loop);
}

function setupControls() {
  const sidesSlider = document.getElementById('sides');
  const sidesValue = document.getElementById('sidesValue');
  const shapeName = document.getElementById('shapeName');
  const spinSlider = document.getElementById('spin');
  const spinValue = document.getElementById('spinValue');
  const countSlider = document.getElementById('count');
  const countValue = document.getElementById('countValue');
  const sizeVarSlider = document.getElementById('sizeVar');
  const sizeVarValue = document.getElementById('sizeVarValue');
  const bounceSlider = document.getElementById('bounce');
  const bounceValue = document.getElementById('bounceValue');
  const collisionsToggle = document.getElementById('collisionsToggle');
  const gravAngleSlider = document.getElementById('gravAngle');
  const gravAngleValue = document.getElementById('gravAngleValue');
  const gravArrow = document.getElementById('gravArrow');
  const gravStrengthSlider = document.getElementById('gravStrength');
  const gravStrengthValue = document.getElementById('gravStrengthValue');
  const timeScaleSlider = document.getElementById('timeScale');
  const timeScaleValue = document.getElementById('timeScaleValue');
  const trailsToggle = document.getElementById('trailsToggle');
  const explodeBtn = document.getElementById('explodeBtn');
  
  function getGravityArrow(angle) {
    const arrows = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];
    const idx = Math.round(angle / 45) % 8;
    return arrows[idx];
  }
  
  sidesSlider.addEventListener('input', () => {
    config.sides = parseInt(sidesSlider.value);
    sidesValue.textContent = config.sides;
    shapeName.textContent = shapeNames[config.sides] || `${config.sides}-gon`;
    initBalls();
  });
  
  spinSlider.addEventListener('input', () => {
    config.spinSpeed = parseFloat(spinSlider.value);
    spinValue.textContent = config.spinSpeed.toFixed(1);
  });
  
  countSlider.addEventListener('input', () => {
    config.ballCount = parseInt(countSlider.value);
    countValue.textContent = config.ballCount;
    initBalls();
  });
  
  sizeVarSlider.addEventListener('input', () => {
    config.sizeVariation = parseInt(sizeVarSlider.value);
    sizeVarValue.textContent = config.sizeVariation;
    initBalls();
  });
  
  bounceSlider.addEventListener('input', () => {
    config.bounciness = parseFloat(bounceSlider.value);
    bounceValue.textContent = config.bounciness.toFixed(2);
  });
  
  collisionsToggle.addEventListener('click', () => {
    config.ballCollisions = !config.ballCollisions;
    collisionsToggle.classList.toggle('active', config.ballCollisions);
  });
  
  gravAngleSlider.addEventListener('input', () => {
    config.gravityAngle = parseInt(gravAngleSlider.value);
    gravAngleValue.textContent = config.gravityAngle;
    gravArrow.textContent = getGravityArrow(config.gravityAngle);
  });
  
  gravStrengthSlider.addEventListener('input', () => {
    config.gravityStrength = parseInt(gravStrengthSlider.value);
    gravStrengthValue.textContent = config.gravityStrength;
  });
  
  timeScaleSlider.addEventListener('input', () => {
    config.timeScale = parseFloat(timeScaleSlider.value);
    timeScaleValue.textContent = config.timeScale.toFixed(1);
  });
  
  trailsToggle.addEventListener('click', () => {
    config.trails = !config.trails;
    trailsToggle.classList.toggle('active', config.trails);
  });
  
  explodeBtn.addEventListener('click', () => {
    for (const ball of balls) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 300 + Math.random() * 500;
      ball.vx += Math.cos(angle) * speed;
      ball.vy += Math.sin(angle) * speed;
    }
  });
  
  document.querySelectorAll('.section-header').forEach(header => {
    header.addEventListener('click', () => {
      header.parentElement.classList.toggle('collapsed');
    });
  });
}

function setupTooltips() {
  const tooltipEl = document.getElementById('tooltip');
  
  document.querySelectorAll('[data-tooltip]').forEach(el => {
    el.addEventListener('mouseenter', (e) => {
      const text = el.getAttribute('data-tooltip');
      tooltipEl.textContent = text;
      
      const rect = el.getBoundingClientRect();
      const panelRect = document.getElementById('controlPanel').getBoundingClientRect();
      
      let left = panelRect.right + 10;
      let top = rect.top;
      
      if (left + 200 > window.innerWidth) {
        left = panelRect.left - 210;
      }
      
      tooltipEl.style.left = left + 'px';
      tooltipEl.style.top = top + 'px';
      tooltipEl.classList.add('visible');
    });
    
    el.addEventListener('mouseleave', () => {
      tooltipEl.classList.remove('visible');
    });
  });
}

initBalls();
setupControls();
setupTooltips();
requestAnimationFrame(loop);
