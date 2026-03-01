// Physics Simulation Engine

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Resize canvas to fit window
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// Configuration
let config = {
    sides: 8,
    spinSpeed: 1.0,
    ballCount: 40,
    sizeVar: 15,
    bouncy: 0.8,
    collisions: true,
    gravAngle: 90,
    gravStrength: 400,
    timeScale: 1.0,
    trails: true,
};

// Physics state
let polygon = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    angle: 0,
    angularVelocity: 0,
    radius: 150,
};

let balls = [];
let trailCanvas = null;
let trailCtx = null;

// Initialize trail canvas
function initTrails() {
    trailCanvas = document.createElement('canvas');
    trailCanvas.width = canvas.width;
    trailCanvas.height = canvas.height;
    trailCtx = trailCanvas.getContext('2d');
}
initTrails();

// Polygon utilities
function getPolygonVertices(sides, x, y, radius, angle) {
    const vertices = [];
    for (let i = 0; i < sides; i++) {
        const a = (angle + (i / sides) * Math.PI * 2);
        vertices.push({
            x: x + Math.cos(a) * radius,
            y: y + Math.sin(a) * radius,
        });
    }
    return vertices;
}

function getPolygonEdges(vertices) {
    const edges = [];
    for (let i = 0; i < vertices.length; i++) {
        const v1 = vertices[i];
        const v2 = vertices[(i + 1) % vertices.length];
        edges.push({ v1, v2 });
    }
    return edges;
}

function getEdgeNormal(edge) {
    const dx = edge.v2.x - edge.v1.x;
    const dy = edge.v2.y - edge.v1.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    return { x: -dy / len, y: dx / len };
}

function getSignedDistance(point, edge) {
    const dx = edge.v2.x - edge.v1.x;
    const dy = edge.v2.y - edge.v1.y;
    const px = point.x - edge.v1.x;
    const py = point.y - edge.v1.y;
    const cross = px * dy - py * dx;
    const len = Math.sqrt(dx * dx + dy * dy);
    return cross / len;
}

function dotProduct(a, b) {
    return a.x * b.x + a.y * b.y;
}

// Ball utilities
function createBall() {
    const sizeVariation = (Math.random() - 0.5) * config.sizeVar;
    const radius = 6 + sizeVariation;

    return {
        x: polygon.x + (Math.random() - 0.5) * 100,
        y: polygon.y + (Math.random() - 0.5) * 100,
        vx: (Math.random() - 0.5) * 50,
        vy: (Math.random() - 0.5) * 50,
        radius: Math.max(2, radius),
        color: `hsl(${Math.random() * 360}, 70%, 50%)`,
        trail: [],
    };
}

function spawnBalls(count) {
    balls = [];
    for (let i = 0; i < count; i++) {
        balls.push(createBall());
    }
}

// Physics
function updatePhysics(dt) {
    const substeps = 5;
    const substepDt = dt / substeps;

    for (let step = 0; step < substeps; step++) {
        // Update polygon rotation
        polygon.angle += polygon.angularVelocity * substepDt;
        polygon.angularVelocity = config.spinSpeed;

        // Gravity direction
        const gravRad = (config.gravAngle * Math.PI) / 180;
        const gravX = Math.cos(gravRad) * config.gravStrength;
        const gravY = Math.sin(gravRad) * config.gravStrength;

        // Update ball velocities and positions
        for (let ball of balls) {
            ball.vx += gravX * substepDt;
            ball.vy += gravY * substepDt;

            // Damping
            ball.vx *= 0.98;
            ball.vy *= 0.98;

            ball.x += ball.vx * substepDt;
            ball.y += ball.vy * substepDt;
        }

        // Wall collisions
        const vertices = getPolygonVertices(
            config.sides,
            polygon.x,
            polygon.y,
            polygon.radius,
            polygon.angle
        );
        const edges = getPolygonEdges(vertices);

        for (let ball of balls) {
            for (let edge of edges) {
                const dist = getSignedDistance(ball, edge);

                if (dist < ball.radius) {
                    const normal = getEdgeNormal(edge);
                    const edgeMidX = (edge.v1.x + edge.v2.x) / 2;
                    const edgeMidY = (edge.v1.y + edge.v2.y) / 2;

                    // Point on edge closest to ball
                    const dx = edge.v2.x - edge.v1.x;
                    const dy = edge.v2.y - edge.v1.y;
                    const px = ball.x - edge.v1.x;
                    const py = ball.y - edge.v1.y;
                    let t = (px * dx + py * dy) / (dx * dx + dy * dy);
                    t = Math.max(0, Math.min(1, t));

                    const closestX = edge.v1.x + t * dx;
                    const closestY = edge.v1.y + t * dy;

                    // Rotational velocity of edge point
                    const edgeDx = closestX - polygon.x;
                    const edgeDy = closestY - polygon.y;
                    const edgeVx = -edgeDy * polygon.angularVelocity;
                    const edgeVy = edgeDx * polygon.angularVelocity;

                    // Relative velocity
                    const relVx = ball.vx - edgeVx;
                    const relVy = ball.vy - edgeVy;
                    const relVelNormal = relVx * normal.x + relVy * normal.y;

                    if (relVelNormal < 0) {
                        // Push ball out
                        const overlap = ball.radius - dist;
                        ball.x += normal.x * overlap;
                        ball.y += normal.y * overlap;

                        // Bounce
                        const bounce = config.bouncy;
                        ball.vx = (ball.vx - normal.x * relVelNormal * (1 + bounce));
                        ball.vy = (ball.vy - normal.y * relVelNormal * (1 + bounce));
                    }
                }
            }
        }

        // Ball-to-ball collisions
        if (config.collisions) {
            for (let i = 0; i < balls.length; i++) {
                for (let j = i + 1; j < balls.length; j++) {
                    const b1 = balls[i];
                    const b2 = balls[j];
                    const dx = b2.x - b1.x;
                    const dy = b2.y - b1.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const minDist = b1.radius + b2.radius;

                    if (dist < minDist && dist > 0) {
                        const nx = dx / dist;
                        const ny = dy / dist;

                        // Relative velocity
                        const dvx = b2.vx - b1.vx;
                        const dvy = b2.vy - b1.vy;
                        const dvn = dvx * nx + dvy * ny;

                        if (dvn < 0) {
                            // Impulse
                            const impulse = dvn * 0.5;
                            b1.vx += impulse * nx;
                            b1.vy += impulse * ny;
                            b2.vx -= impulse * nx;
                            b2.vy -= impulse * ny;

                            // Separate
                            const overlap = (minDist - dist) / 2;
                            b1.x -= overlap * nx;
                            b1.y -= overlap * ny;
                            b2.x += overlap * nx;
                            b2.y += overlap * ny;
                        }
                    }
                }
            }
        }
    }
}

// Rendering
function render() {
    // Clear canvas
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Update trails
    if (config.trails) {
        trailCtx.fillStyle = 'rgba(10, 10, 15, 0.05)';
        trailCtx.fillRect(0, 0, trailCanvas.width, trailCanvas.height);
        ctx.drawImage(trailCanvas, 0, 0);
    }

    // Draw polygon
    const vertices = getPolygonVertices(
        config.sides,
        polygon.x,
        polygon.y,
        polygon.radius,
        polygon.angle
    );

    ctx.strokeStyle = 'rgba(100, 200, 255, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(vertices[0].x, vertices[0].y);
    for (let i = 1; i < vertices.length; i++) {
        ctx.lineTo(vertices[i].x, vertices[i].y);
    }
    ctx.closePath();
    ctx.stroke();

    // Draw balls
    for (let ball of balls) {
        // Trail
        if (config.trails) {
            ball.trail.push({ x: ball.x, y: ball.y });
            if (ball.trail.length > 30) ball.trail.shift();

            if (ball.trail.length > 1) {
                trailCtx.strokeStyle = ball.color + '33';
                trailCtx.lineWidth = ball.radius * 1.5;
                trailCtx.lineCap = 'round';
                trailCtx.lineJoin = 'round';
                trailCtx.beginPath();
                trailCtx.moveTo(ball.trail[0].x, ball.trail[0].y);
                for (let i = 1; i < ball.trail.length; i++) {
                    trailCtx.lineTo(ball.trail[i].x, ball.trail[i].y);
                }
                trailCtx.stroke();
            }
        }

        // Ball
        const gradient = ctx.createRadialGradient(
            ball.x - 2, ball.y - 2, 0,
            ball.x, ball.y, ball.radius
        );
        gradient.addColorStop(0, ball.color + '88');
        gradient.addColorStop(1, ball.color);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
        ctx.fill();

        // Highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.beginPath();
        ctx.arc(ball.x - ball.radius * 0.3, ball.y - ball.radius * 0.3, ball.radius * 0.4, 0, Math.PI * 2);
        ctx.fill();
    }
}

// Animation loop
let lastTime = Date.now();
function animate() {
    const now = Date.now();
    const dt = Math.min((now - lastTime) / 1000, 0.016) * config.timeScale;
    lastTime = now;

    updatePhysics(dt);
    render();
    requestAnimationFrame(animate);
}

// Initialize and start
spawnBalls(config.ballCount);
animate();

// Control panel event handlers
document.getElementById('sidesSlider').addEventListener('input', (e) => {
    config.sides = parseInt(e.target.value);
    document.getElementById('sidesValue').textContent = config.sides;
});

document.getElementById('spinSpeedSlider').addEventListener('input', (e) => {
    config.spinSpeed = parseFloat(e.target.value);
    document.getElementById('spinSpeedValue').textContent = config.spinSpeed.toFixed(1);
});

document.getElementById('ballCountSlider').addEventListener('input', (e) => {
    config.ballCount = parseInt(e.target.value);
    document.getElementById('ballCountValue').textContent = config.ballCount;
    spawnBalls(config.ballCount);
});

document.getElementById('sizeVarSlider').addEventListener('input', (e) => {
    config.sizeVar = parseInt(e.target.value);
    document.getElementById('sizeVarValue').textContent = config.sizeVar;
    spawnBalls(config.ballCount);
});

document.getElementById('bouncySlider').addEventListener('input', (e) => {
    config.bouncy = parseFloat(e.target.value);
    document.getElementById('bouncyValue').textContent = config.bouncy.toFixed(2);
});

document.getElementById('collisionsToggle').addEventListener('click', function() {
    config.collisions = !config.collisions;
    this.classList.toggle('active');
});
document.getElementById('collisionsToggle').classList.toggle('active', config.collisions);

document.getElementById('gravAngleSlider').addEventListener('input', (e) => {
    config.gravAngle = parseInt(e.target.value);
    document.getElementById('gravAngleValue').textContent = config.gravAngle;
});

document.getElementById('gravStrengthSlider').addEventListener('input', (e) => {
    config.gravStrength = parseInt(e.target.value);
    document.getElementById('gravStrengthValue').textContent = config.gravStrength;
});

document.getElementById('timeScaleSlider').addEventListener('input', (e) => {
    config.timeScale = parseFloat(e.target.value);
    document.getElementById('timeScaleValue').textContent = config.timeScale.toFixed(1);
});

document.getElementById('trailsToggle').addEventListener('click', function() {
    config.trails = !config.trails;
    this.classList.toggle('active');
    if (!config.trails) {
        trailCtx.fillStyle = 'rgba(10, 10, 15, 1)';
        trailCtx.fillRect(0, 0, trailCanvas.width, trailCanvas.height);
    }
});

document.getElementById('explodeBtn').addEventListener('click', () => {
    const cx = polygon.x;
    const cy = polygon.y;
    for (let ball of balls) {
        const dx = ball.x - cx;
        const dy = ball.y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = 500;
        ball.vx += (dx / dist) * force;
        ball.vy += (dy / dist) * force;
    }
});

// Section collapsing
document.querySelectorAll('.section-header').forEach(header => {
    header.addEventListener('click', () => {
        const content = header.nextElementSibling;
        const toggle = header.querySelector('.section-toggle');

        content.classList.toggle('collapsed');
        toggle.classList.toggle('collapsed');
    });
});

// Tooltips
const tooltip = document.getElementById('tooltip');
document.querySelectorAll('.has-tooltip').forEach(el => {
    el.addEventListener('mouseenter', (e) => {
        tooltip.textContent = el.dataset.tooltip;
        tooltip.classList.add('visible');
    });
    el.addEventListener('mousemove', (e) => {
        const rect = el.getBoundingClientRect();
        tooltip.style.left = (rect.right + 10) + 'px';
        tooltip.style.top = (rect.top) + 'px';
    });
    el.addEventListener('mouseleave', () => {
        tooltip.classList.remove('visible');
    });
});

// Resize trail canvas on window resize
window.addEventListener('resize', () => {
    trailCanvas.width = canvas.width;
    trailCanvas.height = canvas.height;
});
