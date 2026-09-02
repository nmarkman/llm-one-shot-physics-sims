// Fix applied after generation: the original appended a hex alpha suffix to an hsl() string
// (e.g. "hsl(152, 70%, 60%)40"), which is not a valid color and threw on every frame.
function withAlpha(hsl, alpha) {
    return hsl.replace('hsl(', 'hsla(').replace(')', `, ${alpha})`);
}

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const tooltip = document.getElementById('tooltip');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

// Shape names
const shapeNames = {
    3: 'Triangle', 4: 'Square', 5: 'Pentagon', 6: 'Hexagon',
    7: 'Heptagon', 8: 'Octagon', 9: 'Nonagon', 10: 'Decagon',
    11: 'Hendecagon', 12: 'Dodecagon', 13: 'Tridecagon', 14: 'Tetradecagon',
    15: 'Pentadecagon', 16: 'Hexadecagon', 17: 'Heptadecagon', 18: 'Octadecagon',
    19: 'Enneadecagon', 20: 'Icosagon'
};

// Gravity arrows
const gravityArrows = {
    0: '→', 45: '↘', 90: '↓', 135: '↙',
    180: '←', 225: '↖', 270: '↑', 315: '↗', 360: '→'
};

function getGravityArrow(angle) {
    const normalized = angle % 360;
    let closest = 0;
    let minDiff = 360;
    for (const [a, arrow] of Object.entries(gravityArrows)) {
        const diff = Math.abs(normalized - parseFloat(a));
        if (diff < minDiff) {
            minDiff = diff;
            closest = arrow;
        }
    }
    return closest;
}

// Physics state
let balls = [];
let polygonRotation = 0;
let polygonSides = 8;
let spinSpeed = 1;
let ballCount = 40;
let sizeVariation = 10;
let bounciness = 0.7;
let ballCollisionsEnabled = true;
let gravityAngle = 90;
let gravityStrength = 500;
let timeScale = 1;
let motionTrails = false;

class Ball {
    constructor(x, y, radius, color) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 200;
        this.vy = (Math.random() - 0.5) * 200;
        this.radius = radius;
        this.mass = radius * radius;
        this.color = color;
    }

    update(dt) {
        // Apply gravity
        const gravRad = (gravityAngle * Math.PI) / 180;
        this.vx += Math.cos(gravRad) * gravityStrength * dt;
        this.vy += Math.sin(gravRad) * gravityStrength * dt;
        
        // Apply damping
        const damping = 0.999;
        this.vx *= damping;
        this.vy *= damping;
        
        // Update position
        this.x += this.vx * dt;
        this.y += this.vy * dt;
    }

    draw() {
        // Glow
        const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius * 2);
        gradient.addColorStop(0, withAlpha(this.color, 0.25));
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 2, 0, Math.PI * 2);
        ctx.fill();
        
        // Main ball
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.beginPath();
        ctx.arc(this.x - this.radius * 0.3, this.y - this.radius * 0.3, this.radius * 0.2, 0, Math.PI * 2);
        ctx.fill();
    }
}

function getPolygonVertices(cx, cy, radius, sides, rotation) {
    const vertices = [];
    for (let i = 0; i < sides; i++) {
        const angle = rotation + (i * 2 * Math.PI) / sides;
        vertices.push({
            x: cx + radius * Math.cos(angle),
            y: cy + radius * Math.sin(angle)
        });
    }
    return vertices;
}

function getPolygonEdges(vertices) {
    const edges = [];
    for (let i = 0; i < vertices.length; i++) {
        const v1 = vertices[i];
        const v2 = vertices[(i + 1) % vertices.length];
        const dx = v2.x - v1.x;
        const dy = v2.y - v1.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        edges.push({
            v1, v2,
            normal: { x: -dy / len, y: dx / len }
        });
    }
    return edges;
}

function checkBallPolygonCollision(ball, edges, cx, cy, angularVel) {
    for (const edge of edges) {
        const dx = ball.x - edge.v1.x;
        const dy = ball.y - edge.v1.y;
        const edgeDx = edge.v2.x - edge.v1.x;
        const edgeDy = edge.v2.y - edge.v1.y;
        const edgeLen2 = edgeDx * edgeDx + edgeDy * edgeDy;
        const t = Math.max(0, Math.min(1, (dx * edgeDx + dy * edgeDy) / edgeLen2));
        const closestX = edge.v1.x + t * edgeDx;
        const closestY = edge.v1.y + t * edgeDy;
        const distX = ball.x - closestX;
        const distY = ball.y - closestY;
        const dist = Math.sqrt(distX * distX + distY * distY);
        
        if (dist < ball.radius) {
            // Push ball inside
            const pushDist = ball.radius - dist;
            ball.x += edge.normal.x * pushDist;
            ball.y += edge.normal.y * pushDist;
            
            // Calculate wall velocity at contact point
            const contactX = closestX - cx;
            const contactY = closestY - cy;
            const wallVx = -contactY * angularVel;
            const wallVy = contactX * angularVel;
            
            // Relative velocity
            const relVx = ball.vx - wallVx;
            const relVy = ball.vy - wallVy;
            const dotProduct = relVx * edge.normal.x + relVy * edge.normal.y;
            
            if (dotProduct > 0) {
                // Apply impulse
                const impulse = -(1 + bounciness) * dotProduct;
                ball.vx += impulse * edge.normal.x;
                ball.vy += impulse * edge.normal.y;
                
                // Add wall velocity influence
                ball.vx += wallVx * 0.1;
                ball.vy += wallVy * 0.1;
            }
        }
    }
}

function checkBallBallCollision(b1, b2) {
    const dx = b2.x - b1.x;
    const dy = b2.y - b1.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const minDist = b1.radius + b2.radius;
    
    if (dist < minDist) {
        // Separate balls
        const overlap = minDist - dist;
        const separateX = (dx / dist) * overlap * 0.5;
        const separateY = (dy / dist) * overlap * 0.5;
        b1.x -= separateX;
        b1.y -= separateY;
        b2.x += separateX;
        b2.y += separateY;
        
        // Calculate collision response
        const nx = dx / dist;
        const ny = dy / dist;
        const dvx = b2.vx - b1.vx;
        const dvy = b2.vy - b1.vy;
        const dotProduct = dvx * nx + dvy * ny;
        
        if (dotProduct > 0) return;
        
        const totalMass = b1.mass + b2.mass;
        const impulse = (2 * dotProduct) / totalMass;
        
        b1.vx += impulse * b2.mass * nx;
        b1.vy += impulse * b2.mass * ny;
        b2.vx -= impulse * b1.mass * nx;
        b2.vy -= impulse * b1.mass * ny;
    }
}

function constrainBallsInPolygon() {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const radius = Math.min(canvas.width, canvas.height) * 0.35;
    const vertices = getPolygonVertices(cx, cy, radius, polygonSides, polygonRotation);
    const edges = getPolygonEdges(vertices);
    
    for (const ball of balls) {
        checkBallPolygonCollision(ball, edges, cx, cy, spinSpeed);
    }
}

function initBalls() {
    balls = [];
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const apothem = Math.min(canvas.width, canvas.height) * 0.35 * Math.cos(Math.PI / polygonSides);
    
    for (let i = 0; i < ballCount; i++) {
        const radius = 6 + Math.random() * sizeVariation;
        const angle = Math.random() * Math.PI * 2;
        const maxR = apothem - radius - 10;
        const r = Math.random() * maxR;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        const hue = Math.random() * 360;
        const color = `hsl(${hue}, 70%, 60%)`;
        balls.push(new Ball(x, y, radius, color));
    }
}

function update(dt) {
    polygonRotation += spinSpeed * dt;
    
    const substeps = 5;
    const subDt = dt / substeps;
    
    for (let step = 0; step < substeps; step++) {
        // Update balls
        for (const ball of balls) {
            ball.update(subDt);
        }
        
        // Ball-to-ball collisions
        if (ballCollisionsEnabled) {
            for (let i = 0; i < balls.length; i++) {
                for (let j = i + 1; j < balls.length; j++) {
                    checkBallBallCollision(balls[i], balls[j]);
                }
            }
        }
        
        // Constrain balls in polygon
        constrainBallsInPolygon();
    }
}

function drawPolygon() {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const radius = Math.min(canvas.width, canvas.height) * 0.35;
    
    // Background glow
    const bgGradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 1.5);
    bgGradient.addColorStop(0, 'rgba(100, 200, 255, 0.05)');
    bgGradient.addColorStop(1, 'transparent');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    const vertices = getPolygonVertices(cx, cy, radius, polygonSides, polygonRotation);
    
    // Draw polygon
    ctx.strokeStyle = 'rgba(100, 200, 255, 0.8)';
    ctx.lineWidth = 2;
    ctx.shadowBlur = 20;
    ctx.shadowColor = 'rgba(100, 200, 255, 0.6)';
    ctx.beginPath();
    ctx.moveTo(vertices[0].x, vertices[0].y);
    for (let i = 1; i < vertices.length; i++) {
        ctx.lineTo(vertices[i].x, vertices[i].y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.shadowBlur = 0;
    
    // Draw vertex dots
    ctx.fillStyle = 'rgba(100, 200, 255, 0.9)';
    for (const v of vertices) {
        ctx.beginPath();
        ctx.arc(v.x, v.y, 4, 0, Math.PI * 2);
        ctx.fill();
    }
}

function draw() {
    if (motionTrails) {
        ctx.fillStyle = 'rgba(10, 10, 15, 0.1)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
        ctx.fillStyle = '#0a0a0f';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    drawPolygon();
    
    for (const ball of balls) {
        ball.draw();
    }
}

let lastTime = 0;
function animate(currentTime) {
    const dt = Math.min((currentTime - lastTime) / 1000, 0.1) * timeScale;
    lastTime = currentTime;
    
    if (dt > 0) {
        update(dt);
    }
    draw();
    requestAnimationFrame(animate);
}

// Controls
document.getElementById('sides').addEventListener('input', (e) => {
    polygonSides = parseInt(e.target.value);
    document.getElementById('sidesValue').textContent = shapeNames[polygonSides];
    initBalls();
});

document.getElementById('spinSpeed').addEventListener('input', (e) => {
    spinSpeed = parseFloat(e.target.value);
    document.getElementById('spinSpeedValue').textContent = spinSpeed.toFixed(1);
});

document.getElementById('ballCount').addEventListener('input', (e) => {
    ballCount = parseInt(e.target.value);
    document.getElementById('ballCountValue').textContent = ballCount;
    initBalls();
});

document.getElementById('sizeVariation').addEventListener('input', (e) => {
    sizeVariation = parseInt(e.target.value);
    document.getElementById('sizeVariationValue').textContent = sizeVariation;
    initBalls();
});

document.getElementById('bounciness').addEventListener('input', (e) => {
    bounciness = parseFloat(e.target.value);
    document.getElementById('bouncinessValue').textContent = bounciness.toFixed(2);
});

document.getElementById('ballCollisions').addEventListener('change', (e) => {
    ballCollisionsEnabled = e.target.checked;
});

document.getElementById('gravityAngle').addEventListener('input', (e) => {
    gravityAngle = parseInt(e.target.value);
    document.getElementById('gravityAngleValue').textContent = `${gravityAngle}° ${getGravityArrow(gravityAngle)}`;
});

document.getElementById('gravityStrength').addEventListener('input', (e) => {
    gravityStrength = parseInt(e.target.value);
    document.getElementById('gravityStrengthValue').textContent = gravityStrength;
});

document.getElementById('timeScale').addEventListener('input', (e) => {
    timeScale = parseFloat(e.target.value);
    document.getElementById('timeScaleValue').textContent = `${timeScale.toFixed(1)}×`;
});

document.getElementById('motionTrails').addEventListener('change', (e) => {
    motionTrails = e.target.checked;
});

document.getElementById('explodeBtn').addEventListener('click', () => {
    for (const ball of balls) {
        const angle = Math.random() * Math.PI * 2;
        const force = 300 + Math.random() * 500;
        ball.vx += Math.cos(angle) * force;
        ball.vy += Math.sin(angle) * force;
    }
});

// Section collapse
document.querySelectorAll('.section-header').forEach(header => {
    header.addEventListener('click', () => {
        const content = header.nextElementSibling;
        const chevron = header.querySelector('.chevron');
        content.classList.toggle('collapsed');
        chevron.classList.toggle('collapsed');
    });
});

// Tooltips
document.querySelectorAll('[data-tooltip]').forEach(element => {
    element.addEventListener('mouseenter', (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const text = e.currentTarget.getAttribute('data-tooltip');
        tooltip.textContent = text;
        tooltip.style.left = `${rect.right + 10}px`;
        tooltip.style.top = `${rect.top + rect.height / 2 - 15}px`;
        tooltip.classList.add('visible');
    });
    
    element.addEventListener('mouseleave', () => {
        tooltip.classList.remove('visible');
    });
});

// Initialize
initBalls();
requestAnimationFrame(animate);