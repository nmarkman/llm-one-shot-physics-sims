const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Physics constants
const SUBSTEPS = 5;
const DAMPING = 0.999;

// State
let polygonSides = 8;
let spinSpeed = 0.5;
let ballCount = 40;
let sizeVariation = 12;
let bounciness = 0.8;
let ballCollisions = true;
let gravityAngle = 90;
let gravityStrength = 500;
let timeScale = 1;
let motionTrails = false;

let balls = [];
let polygonAngle = 0;
let polygonRadius = 0;

// Shape names
const shapeNames = {
    3: 'Triangle', 4: 'Square', 5: 'Pentagon', 6: 'Hexagon',
    7: 'Heptagon', 8: 'Octagon', 9: 'Nonagon', 10: 'Decagon',
    11: 'Hendecagon', 12: 'Dodecagon'
};

// Initialize canvas
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    polygonRadius = Math.min(canvas.width, canvas.height) * 0.35;
}

// Ball class
class Ball {
    constructor() {
        const angle = Math.random() * Math.PI * 2;
        const apothem = polygonRadius * Math.cos(Math.PI / polygonSides);
        const distance = Math.random() * (apothem - 20);
        
        this.x = canvas.width / 2 + Math.cos(angle) * distance;
        this.y = canvas.height / 2 + Math.sin(angle) * distance;
        this.vx = (Math.random() - 0.5) * 200;
        this.vy = (Math.random() - 0.5) * 200;
        this.radius = 6 + Math.random() * sizeVariation;
        this.mass = Math.PI * this.radius * this.radius;
        
        const hue = Math.random() * 360;
        this.color = `hsl(${hue}, 70%, 50%)`;
        this.glowColor = `hsl(${hue}, 70%, 70%)`;
    }

    update(dt) {
        // Apply gravity
        const gravityRad = gravityAngle * Math.PI / 180;
        this.vx += Math.cos(gravityRad) * gravityStrength * dt;
        this.vy += Math.sin(gravityRad) * gravityStrength * dt;
        
        // Apply damping
        this.vx *= DAMPING;
        this.vy *= DAMPING;
        
        // Update position
        this.x += this.vx * dt;
        this.y += this.vy * dt;
    }

    draw() {
        // Glow
        ctx.save();
        ctx.shadowBlur = 20;
        ctx.shadowColor = this.glowColor;
        
        // Ball gradient
        const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius);
        gradient.addColorStop(0, this.glowColor);
        gradient.addColorStop(1, this.color);
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        
        // Highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.beginPath();
        ctx.arc(this.x - this.radius * 0.3, this.y - this.radius * 0.3, this.radius * 0.2, 0, Math.PI * 2);
        ctx.fill();
    }
}

// Get polygon vertices
function getPolygonVertices() {
    const vertices = [];
    const angleStep = (Math.PI * 2) / polygonSides;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    
    for (let i = 0; i < polygonSides; i++) {
        const angle = polygonAngle + i * angleStep;
        vertices.push({
            x: cx + Math.cos(angle) * polygonRadius,
            y: cy + Math.sin(angle) * polygonRadius
        });
    }
    
    return vertices;
}

// Get polygon edges with normals
function getPolygonEdges() {
    const vertices = getPolygonVertices();
    const edges = [];
    
    for (let i = 0; i < vertices.length; i++) {
        const v1 = vertices[i];
        const v2 = vertices[(i + 1) % vertices.length];
        
        // Edge vector
        const dx = v2.x - v1.x;
        const dy = v2.y - v1.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        
        // Inward normal (perpendicular to edge, pointing inward)
        const nx = -dy / length;
        const ny = dx / length;
        
        edges.push({ v1, v2, normal: { x: nx, y: ny } });
    }
    
    return edges;
}

// Ball-edge collision
function checkBallPolygonCollision(ball) {
    const edges = getPolygonEdges();
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    
    for (const edge of edges) {
        // Vector from edge start to ball
        const toBallX = ball.x - edge.v1.x;
        const toBallY = ball.y - edge.v1.y;
        
        // Edge vector
        const edgeX = edge.v2.x - edge.v1.x;
        const edgeY = edge.v2.y - edge.v1.y;
        const edgeLength = Math.sqrt(edgeX * edgeX + edgeY * edgeY);
        
        // Project ball onto edge
        const t = Math.max(0, Math.min(1, (toBallX * edgeX + toBallY * edgeY) / (edgeLength * edgeLength)));
        const closestX = edge.v1.x + t * edgeX;
        const closestY = edge.v1.y + t * edgeY;
        
        // Distance from ball to closest point on edge
        const distX = ball.x - closestX;
        const distY = ball.y - closestY;
        const distance = Math.sqrt(distX * distX + distY * distY);
        
        // Check collision
        if (distance < ball.radius) {
            // Push ball away from edge
            const pushX = (distX / distance) * (ball.radius - distance);
            const pushY = (distY / distance) * (ball.radius - distance);
            ball.x += pushX;
            ball.y += pushY;
            
            // Wall velocity at contact point
            const contactRelX = closestX - cx;
            const contactRelY = closestY - cy;
            const wallVelX = -contactRelY * spinSpeed;
            const wallVelY = contactRelX * spinSpeed;
            
            // Relative velocity
            const relVelX = ball.vx - wallVelX;
            const relVelY = ball.vy - wallVelY;
            
            // Velocity along normal
            const normalX = distX / distance;
            const normalY = distY / distance;
            const velAlongNormal = relVelX * normalX + relVelY * normalY;
            
            if (velAlongNormal < 0) {
                // Apply impulse
                const impulse = -(1 + bounciness) * velAlongNormal;
                ball.vx += impulse * normalX;
                ball.vy += impulse * normalY;
                
                // Add some wall velocity to simulate friction/dragging
                ball.vx += wallVelX * 0.1;
                ball.vy += wallVelY * 0.1;
            }
        }
    }
}

// Ball-ball collision
function checkBallBallCollision(ball1, ball2) {
    const dx = ball2.x - ball1.x;
    const dy = ball2.y - ball1.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const minDistance = ball1.radius + ball2.radius;
    
    if (distance < minDistance) {
        // Separation
        const overlap = minDistance - distance;
        const separateX = (dx / distance) * overlap * 0.5;
        const separateY = (dy / distance) * overlap * 0.5;
        
        ball1.x -= separateX;
        ball1.y -= separateY;
        ball2.x += separateX;
        ball2.y += separateY;
        
        // Collision response
        const nx = dx / distance;
        const ny = dy / distance;
        
        const dvx = ball2.vx - ball1.vx;
        const dvy = ball2.vy - ball1.vy;
        const dvn = dvx * nx + dvy * ny;
        
        if (dvn < 0) {
            const impulse = 2 * dvn / (1 / ball1.mass + 1 / ball2.mass);
            
            ball1.vx += (impulse / ball1.mass) * nx;
            ball1.vy += (impulse / ball1.mass) * ny;
            ball2.vx -= (impulse / ball2.mass) * nx;
            ball2.vy -= (impulse / ball2.mass) * ny;
        }
    }
}

// Constrain ball inside polygon
function constrainBallToPolygon(ball) {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const edges = getPolygonEdges();
    let isInside = true;
    
    // Check if ball is on the correct side of all edges
    for (const edge of edges) {
        const toBallX = ball.x - edge.v1.x;
        const toBallY = ball.y - edge.v1.y;
        const dot = toBallX * edge.normal.x + toBallY * edge.normal.y;
        
        if (dot > ball.radius) {
            isInside = false;
            // Push ball back inside
            ball.x -= edge.normal.x * (dot - ball.radius + 1);
            ball.y -= edge.normal.y * (dot - ball.radius + 1);
        }
    }
}

// Physics update
function updatePhysics(dt) {
    dt *= timeScale;
    const substepDt = dt / SUBSTEPS;
    
    for (let substep = 0; substep < SUBSTEPS; substep++) {
        // Update balls
        for (const ball of balls) {
            ball.update(substepDt);
        }
        
        // Ball-ball collisions
        if (ballCollisions) {
            for (let i = 0; i < balls.length; i++) {
                for (let j = i + 1; j < balls.length; j++) {
                    checkBallBallCollision(balls[i], balls[j]);
                }
            }
            
            // Re-constrain after ball collisions
            for (const ball of balls) {
                constrainBallToPolygon(ball);
            }
        }
        
        // Ball-polygon collisions
        for (const ball of balls) {
            checkBallPolygonCollision(ball);
        }
    }
    
    // Update polygon rotation
    polygonAngle += spinSpeed * dt;
}

// Draw polygon
function drawPolygon() {
    const vertices = getPolygonVertices();
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    
    // Background glow
    ctx.save();
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, polygonRadius * 1.2);
    gradient.addColorStop(0, 'rgba(100, 200, 255, 0.05)');
    gradient.addColorStop(1, 'rgba(100, 200, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    
    // Polygon outline
    ctx.save();
    ctx.strokeStyle = 'rgba(100, 200, 255, 0.8)';
    ctx.lineWidth = 3;
    ctx.shadowBlur = 20;
    ctx.shadowColor = 'rgb(100, 200, 255)';
    
    ctx.beginPath();
    ctx.moveTo(vertices[0].x, vertices[0].y);
    for (let i = 1; i < vertices.length; i++) {
        ctx.lineTo(vertices[i].x, vertices[i].y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
    
    // Vertex dots
    ctx.fillStyle = 'rgba(100, 200, 255, 0.9)';
    for (const vertex of vertices) {
        ctx.beginPath();
        ctx.arc(vertex.x, vertex.y, 4, 0, Math.PI * 2);
        ctx.fill();
    }
}

// Animation loop
let lastTime = 0;
function animate(currentTime) {
    const dt = Math.min((currentTime - lastTime) / 1000, 0.05);
    lastTime = currentTime;
    
    // Clear or trail effect
    if (motionTrails) {
        ctx.fillStyle = 'rgba(10, 10, 15, 0.1)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
        ctx.fillStyle = '#0a0a0f';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    updatePhysics(dt);
    drawPolygon();
    
    for (const ball of balls) {
        ball.draw();
    }
    
    requestAnimationFrame(animate);
}

// Initialize balls
function initBalls() {
    balls = [];
    for (let i = 0; i < ballCount; i++) {
        balls.push(new Ball());
    }
}

// Controls
function getAngleArrow(angle) {
    if (angle >= 315 || angle < 45) return '→';
    if (angle >= 45 && angle < 135) return '↓';
    if (angle >= 135 && angle < 225) return '←';
    return '↑';
}

// Setup controls
document.getElementById('sides').addEventListener('input', (e) => {
    polygonSides = parseInt(e.target.value);
    document.getElementById('sides-value').textContent = shapeNames[polygonSides] || `${polygonSides}-gon`;
    initBalls();
});

document.getElementById('spinSpeed').addEventListener('input', (e) => {
    spinSpeed = parseFloat(e.target.value);
    document.getElementById('spinSpeed-value').textContent = spinSpeed.toFixed(1);
});

document.getElementById('ballCount').addEventListener('input', (e) => {
    ballCount = parseInt(e.target.value);
    document.getElementById('ballCount-value').textContent = ballCount;
    initBalls();
});

document.getElementById('sizeVariation').addEventListener('input', (e) => {
    sizeVariation = parseInt(e.target.value);
    document.getElementById('sizeVariation-value').textContent = sizeVariation;
    initBalls();
});

document.getElementById('bounciness').addEventListener('input', (e) => {
    bounciness = parseFloat(e.target.value);
    document.getElementById('bounciness-value').textContent = bounciness.toFixed(2);
});

document.getElementById('ballCollisions').addEventListener('click', (e) => {
    ballCollisions = !ballCollisions;
    e.target.classList.toggle('active');
});

document.getElementById('gravityAngle').addEventListener('input', (e) => {
    gravityAngle = parseInt(e.target.value);
    document.getElementById('gravityAngle-value').textContent = getAngleArrow(gravityAngle);
});

document.getElementById('gravityStrength').addEventListener('input', (e) => {
    gravityStrength = parseInt(e.target.value);
    document.getElementById('gravityStrength-value').textContent = gravityStrength;
});

document.getElementById('timeScale').addEventListener('input', (e) => {
    timeScale = parseFloat(e.target.value);
    document.getElementById('timeScale-value').textContent = `${timeScale.toFixed(1)}×`;
});

document.getElementById('motionTrails').addEventListener('click', (e) => {
    motionTrails = !motionTrails;
    e.target.classList.toggle('active');
});

document.getElementById('explodeButton').addEventListener('click', () => {
    for (const ball of balls) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 300 + Math.random() * 500;
        ball.vx += Math.cos(angle) * speed;
        ball.vy += Math.sin(angle) * speed;
    }
});

// Section collapse/expand
document.querySelectorAll('.section-header').forEach(header => {
    header.addEventListener('click', () => {
        header.parentElement.classList.toggle('collapsed');
    });
});

// Tooltips
const tooltip = document.getElementById('tooltip');
let currentTooltipTarget = null;

document.querySelectorAll('[data-tooltip]').forEach(element => {
    element.addEventListener('mouseenter', (e) => {
        currentTooltipTarget = e.currentTarget;
        const rect = e.currentTarget.getBoundingClientRect();
        tooltip.textContent = e.currentTarget.getAttribute('data-tooltip');
        tooltip.style.left = `${rect.right + 10}px`;
        tooltip.style.top = `${rect.top + rect.height / 2}px`;
        tooltip.style.transform = 'translateY(-50%)';
        tooltip.classList.add('visible');
    });
    
    element.addEventListener('mouseleave', () => {
        currentTooltipTarget = null;
        tooltip.classList.remove('visible');
    });
});

// Initialize
window.addEventListener('resize', resizeCanvas);
resizeCanvas();
initBalls();
requestAnimationFrame(animate);