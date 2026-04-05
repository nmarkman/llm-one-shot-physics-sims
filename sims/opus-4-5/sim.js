const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const tooltip = document.getElementById('tooltip');

let width, height, centerX, centerY, polygonRadius;

function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
    centerX = width / 2;
    centerY = height / 2;
    polygonRadius = Math.min(width, height) * 0.35;
}
resize();
window.addEventListener('resize', resize);

// Simulation state
let balls = [];
let polygonAngle = 0;

// Controls
let sides = 8;
let spinSpeed = 1;
let ballCount = 40;
let sizeVariation = 15;
let bounciness = 0.8;
let ballCollisions = true;
let gravityAngle = 90;
let gravityStrength = 800;
let timeScale = 1;
let motionTrails = false;

const shapeNames = {
    3: 'Triangle', 4: 'Square', 5: 'Pentagon', 6: 'Hexagon',
    7: 'Heptagon', 8: 'Octagon', 9: 'Nonagon', 10: 'Decagon',
    11: 'Hendecagon', 12: 'Dodecagon'
};

function getShapeName(n) {
    return shapeNames[n] || `${n}-gon`;
}

function getGravityArrow(angle) {
    const normalized = ((angle % 360) + 360) % 360;
    if (normalized >= 337.5 || normalized < 22.5) return '→';
    if (normalized >= 22.5 && normalized < 67.5) return '↘';
    if (normalized >= 67.5 && normalized < 112.5) return '↓';
    if (normalized >= 112.5 && normalized < 157.5) return '↙';
    if (normalized >= 157.5 && normalized < 202.5) return '←';
    if (normalized >= 202.5 && normalized < 247.5) return '↖';
    if (normalized >= 247.5 && normalized < 292.5) return '↑';
    return '↗';
}

// Get polygon vertices
function getPolygonVertices(numSides, radius, angle) {
    const vertices = [];
    for (let i = 0; i < numSides; i++) {
        const a = angle + (i * 2 * Math.PI / numSides) - Math.PI / 2;
        vertices.push({
            x: centerX + Math.cos(a) * radius,
            y: centerY + Math.sin(a) * radius
        });
    }
    return vertices;
}

// Get apothem (inscribed radius)
function getApothem(numSides, circumradius) {
    return circumradius * Math.cos(Math.PI / numSides);
}

// Ball class
class Ball {
    constructor(x, y, radius) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.mass = radius * radius;
        this.vx = (Math.random() - 0.5) * 100;
        this.vy = (Math.random() - 0.5) * 100;
        this.hue = Math.random() * 360;
    }
}

// Initialize balls
function initBalls() {
    balls = [];
    const apothem = getApothem(sides, polygonRadius);
    const spawnRadius = apothem * 0.7;
    
    for (let i = 0; i < ballCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * spawnRadius;
        const x = centerX + Math.cos(angle) * dist;
        const y = centerY + Math.sin(angle) * dist;
        const radius = 6 + Math.random() * sizeVariation;
        balls.push(new Ball(x, y, radius));
    }
}

// Point to line segment distance with signed distance
function pointToEdge(px, py, x1, y1, x2, y2) {
    const edgeX = x2 - x1;
    const edgeY = y2 - y1;
    const edgeLen = Math.sqrt(edgeX * edgeX + edgeY * edgeY);
    
    // Edge unit vector
    const edgeUnitX = edgeX / edgeLen;
    const edgeUnitY = edgeY / edgeLen;
    
    // Inward normal (for clockwise winding, rotate edge vector -90 degrees)
    const normalX = edgeUnitY;
    const normalY = -edgeUnitX;
    
    // Vector from edge start to point
    const toPointX = px - x1;
    const toPointY = py - y1;
    
    // Signed distance (positive = inside, negative = outside)
    const signedDist = toPointX * normalX + toPointY * normalY;
    
    // Project point onto edge line
    const t = (toPointX * edgeUnitX + toPointY * edgeUnitY) / edgeLen;
    
    return {
        signedDist,
        normalX,
        normalY,
        t: Math.max(0, Math.min(1, t)),
        edgeLen
    };
}

// Check if point is inside polygon
function isInsidePolygon(px, py, vertices) {
    for (let i = 0; i < vertices.length; i++) {
        const v1 = vertices[i];
        const v2 = vertices[(i + 1) % vertices.length];
        const edge = pointToEdge(px, py, v1.x, v1.y, v2.x, v2.y);
        if (edge.signedDist < 0) return false;
    }
    return true;
}

// Constrain ball inside polygon
function constrainBall(ball, vertices, angularVel) {
    let minDist = Infinity;
    let constraintEdge = null;
    let constraintIdx = -1;
    
    for (let i = 0; i < vertices.length; i++) {
        const v1 = vertices[i];
        const v2 = vertices[(i + 1) % vertices.length];
        const edge = pointToEdge(ball.x, ball.y, v1.x, v1.y, v2.x, v2.y);
        
        // Distance from ball surface to wall
        const distToWall = edge.signedDist - ball.radius;
        
        if (distToWall < minDist) {
            minDist = distToWall;
            constraintEdge = edge;
            constraintIdx = i;
        }
    }
    
    if (minDist < 0 && constraintEdge) {
        const v1 = vertices[constraintIdx];
        const v2 = vertices[(constraintIdx + 1) % vertices.length];
        
        // Push ball inward
        ball.x += constraintEdge.normalX * (-minDist + 0.1);
        ball.y += constraintEdge.normalY * (-minDist + 0.1);
        
        // Contact point on edge
        const contactX = v1.x + (v2.x - v1.x) * constraintEdge.t;
        const contactY = v1.y + (v2.y - v1.y) * constraintEdge.t;
        
        // Wall velocity at contact point due to rotation
        const rx = contactX - centerX;
        const ry = contactY - centerY;
        const wallVx = -angularVel * ry;
        const wallVy = angularVel * rx;
        
        // Relative velocity
        const relVx = ball.vx - wallVx;
        const relVy = ball.vy - wallVy;
        
        // Normal component of relative velocity
        const normalVel = relVx * constraintEdge.normalX + relVy * constraintEdge.normalY;
        
        if (normalVel < 0) {
            // Reflect with bounciness
            ball.vx -= (1 + bounciness) * normalVel * constraintEdge.normalX;
            ball.vy -= (1 + bounciness) * normalVel * constraintEdge.normalY;
            
            // Add some of the wall velocity (friction effect)
            ball.vx += wallVx * 0.1;
            ball.vy += wallVy * 0.1;
        }
        
        return true;
    }
    return false;
}

// Ball-ball collision
function ballCollision(b1, b2) {
    const dx = b2.x - b1.x;
    const dy = b2.y - b1.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const minDist = b1.radius + b2.radius;
    
    if (dist < minDist && dist > 0) {
        // Normalize
        const nx = dx / dist;
        const ny = dy / dist;
        
        // Separate balls
        const overlap = minDist - dist;
        const totalMass = b1.mass + b2.mass;
        b1.x -= nx * overlap * (b2.mass / totalMass);
        b1.y -= ny * overlap * (b2.mass / totalMass);
        b2.x += nx * overlap * (b1.mass / totalMass);
        b2.y += ny * overlap * (b1.mass / totalMass);
        
        // Relative velocity
        const dvx = b1.vx - b2.vx;
        const dvy = b1.vy - b2.vy;
        const dvn = dvx * nx + dvy * ny;
        
        if (dvn > 0) {
            // Impulse
            const impulse = (2 * dvn) / totalMass;
            b1.vx -= impulse * b2.mass * nx;
            b1.vy -= impulse * b2.mass * ny;
            b2.vx += impulse * b1.mass * nx;
            b2.vy += impulse * b1.mass * ny;
        }
    }
}

// Physics update
function updatePhysics(dt) {
    const substeps = 5;
    const subDt = dt / substeps;
    const angularVel = spinSpeed * 0.5;
    
    const gravRad = gravityAngle * Math.PI / 180;
    const gx = Math.cos(gravRad) * gravityStrength;
    const gy = Math.sin(gravRad) * gravityStrength;
    
    for (let step = 0; step < substeps; step++) {
        const vertices = getPolygonVertices(sides, polygonRadius, polygonAngle);
        
        // Update balls
        for (const ball of balls) {
            // Apply gravity
            ball.vx += gx * subDt;
            ball.vy += gy * subDt;
            
            // Apply damping
            ball.vx *= 0.999;
            ball.vy *= 0.999;
            
            // Update position
            ball.x += ball.vx * subDt;
            ball.y += ball.vy * subDt;
        }
        
        // Ball-ball collisions
        if (ballCollisions) {
            for (let i = 0; i < balls.length; i++) {
                for (let j = i + 1; j < balls.length; j++) {
                    ballCollision(balls[i], balls[j]);
                }
            }
        }
        
        // Constrain all balls inside polygon (after ball-ball to prevent escape)
        for (const ball of balls) {
            constrainBall(ball, vertices, angularVel);
        }
    }
    
    // Update polygon angle
    polygonAngle += angularVel * dt;
}

// Draw
function draw() {
    if (motionTrails) {
        ctx.fillStyle = 'rgba(10, 10, 15, 0.15)';
        ctx.fillRect(0, 0, width, height);
    } else {
        ctx.fillStyle = '#0a0a0f';
        ctx.fillRect(0, 0, width, height);
    }
    
    // Background glow
    const bgGrad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, polygonRadius * 1.5);
    bgGrad.addColorStop(0, 'rgba(100, 200, 255, 0.05)');
    bgGrad.addColorStop(1, 'rgba(10, 10, 15, 0)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);
    
    const vertices = getPolygonVertices(sides, polygonRadius, polygonAngle);
    
    // Draw polygon
    ctx.save();
    ctx.shadowColor = 'rgba(100, 200, 255, 0.8)';
    ctx.shadowBlur = 20;
    ctx.strokeStyle = 'rgba(100, 200, 255, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(vertices[0].x, vertices[0].y);
    for (let i = 1; i < vertices.length; i++) {
        ctx.lineTo(vertices[i].x, vertices[i].y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
    
    // Draw vertex dots
    for (const v of vertices) {
        ctx.beginPath();
        ctx.arc(v.x, v.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(100, 200, 255, 0.9)';
        ctx.fill();
    }
    
    // Draw balls
    for (const ball of balls) {
        // Glow
        const glowGrad = ctx.createRadialGradient(ball.x, ball.y, 0, ball.x, ball.y, ball.radius * 2);
        glowGrad.addColorStop(0, `hsla(${ball.hue}, 80%, 60%, 0.3)`);
        glowGrad.addColorStop(1, `hsla(${ball.hue}, 80%, 60%, 0)`);
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.radius * 2, 0, Math.PI * 2);
        ctx.fill();
        
        // Ball body
        const bodyGrad = ctx.createRadialGradient(
            ball.x - ball.radius * 0.3, ball.y - ball.radius * 0.3, 0,
            ball.x, ball.y, ball.radius
        );
        bodyGrad.addColorStop(0, `hsla(${ball.hue}, 80%, 70%, 1)`);
        bodyGrad.addColorStop(1, `hsla(${ball.hue}, 80%, 40%, 1)`);
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.beginPath();
        ctx.arc(ball.x - ball.radius * 0.3, ball.y - ball.radius * 0.3, ball.radius * 0.2, 0, Math.PI * 2);
        ctx.fill();
    }
}

// Animation loop
let lastTime = 0;
function animate(time) {
    const dt = Math.min((time - lastTime) / 1000, 0.05) * timeScale;
    lastTime = time;
    
    updatePhysics(dt);
    draw();
    
    requestAnimationFrame(animate);
}

// Control panel setup
function setupControls() {
    // Section collapsing
    document.querySelectorAll('.section-header').forEach(header => {
        header.addEventListener('click', () => {
            header.parentElement.classList.toggle('collapsed');
        });
    });
    
    // Sides
    const sidesInput = document.getElementById('sides');
    const sidesValue = document.getElementById('sides-value');
    const shapeName = document.getElementById('shape-name');
    sidesInput.addEventListener('input', () => {
        sides = parseInt(sidesInput.value);
        sidesValue.textContent = sides;
        shapeName.textContent = getShapeName(sides);
        initBalls();
    });
    
    // Spin
    const spinInput = document.getElementById('spin');
    const spinValue = document.getElementById('spin-value');
    spinInput.addEventListener('input', () => {
        spinSpeed = parseFloat(spinInput.value);
        spinValue.textContent = spinSpeed.toFixed(1);
    });
    
    // Ball count
    const countInput = document.getElementById('count');
    const countValue = document.getElementById('count-value');
    countInput.addEventListener('input', () => {
        ballCount = parseInt(countInput.value);
        countValue.textContent = ballCount;
        initBalls();
    });
    
    // Size variation
    const sizeInput = document.getElementById('size-variation');
    const sizeValue = document.getElementById('size-value');
    sizeInput.addEventListener('input', () => {
        sizeVariation = parseInt(sizeInput.value);
        sizeValue.textContent = sizeVariation;
        initBalls();
    });
    
    // Bounciness
    const bounceInput = document.getElementById('bounciness');
    const bounceValue = document.getElementById('bounce-value');
    bounceInput.addEventListener('input', () => {
        bounciness = parseFloat(bounceInput.value);
        bounceValue.textContent = bounciness.toFixed(2);
    });
    
    // Ball collisions toggle
    const ballCollisionsToggle = document.getElementById('ball-collisions');
    ballCollisionsToggle.addEventListener('click', () => {
        ballCollisions = !ballCollisions;
        ballCollisionsToggle.classList.toggle('active', ballCollisions);
    });
    
    // Gravity angle
    const gravAngleInput = document.getElementById('gravity-angle');
    const gravAngleValue = document.getElementById('gravity-angle-value');
    gravAngleInput.addEventListener('input', () => {
        gravityAngle = parseInt(gravAngleInput.value);
        gravAngleValue.textContent = `${getGravityArrow(gravityAngle)} ${gravityAngle}°`;
    });
    
    // Gravity strength
    const gravStrengthInput = document.getElementById('gravity-strength');
    const gravStrengthValue = document.getElementById('gravity-strength-value');
    gravStrengthInput.addEventListener('input', () => {
        gravityStrength = parseInt(gravStrengthInput.value);
        gravStrengthValue.textContent = gravityStrength;
    });
    
    // Time scale
    const timeScaleInput = document.getElementById('time-scale');
    const timeScaleValue = document.getElementById('time-scale-value');
    timeScaleInput.addEventListener('input', () => {
        timeScale = parseFloat(timeScaleInput.value);
        timeScaleValue.textContent = `${timeScale.toFixed(1)}×`;
    });
    
    // Motion trails toggle
    const motionTrailsToggle = document.getElementById('motion-trails');
    motionTrailsToggle.addEventListener('click', () => {
        motionTrails = !motionTrails;
        motionTrailsToggle.classList.toggle('active', motionTrails);
    });
    
    // Explode button
    const explodeBtn = document.getElementById('explode-btn');
    explodeBtn.addEventListener('click', () => {
        for (const ball of balls) {
            const impulse = 300 + Math.random() * 500;
            const angle = Math.random() * Math.PI * 2;
            ball.vx += Math.cos(angle) * impulse;
            ball.vy += Math.sin(angle) * impulse;
        }
    });
    
    // Tooltips
    document.querySelectorAll('[data-tooltip]').forEach(el => {
        el.addEventListener('mouseenter', (e) => {
            const rect = el.getBoundingClientRect();
            tooltip.textContent = el.dataset.tooltip;
            tooltip.classList.add('visible');
            
            let left = rect.right + 10;
            let top = rect.top;
            
            // Keep tooltip on screen
            if (left + 200 > window.innerWidth) {
                left = rect.left - 210;
            }
            if (top + 60 > window.innerHeight) {
                top = window.innerHeight - 70;
            }
            
            tooltip.style.left = left + 'px';
            tooltip.style.top = top + 'px';
        });
        
        el.addEventListener('mouseleave', () => {
            tooltip.classList.remove('visible');
        });
    });
}

// Initialize
initBalls();
setupControls();
requestAnimationFrame(animate);