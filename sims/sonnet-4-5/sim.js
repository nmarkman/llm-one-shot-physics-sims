const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const tooltip = document.getElementById('tooltip');

// Canvas setup
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// State
const state = {
    sides: 8,
    spinSpeed: 1,
    count: 40,
    sizeVar: 20,
    bounciness: 0.8,
    ballCollisions: true,
    gravityAngle: 0,
    gravityStrength: 800,
    timeScale: 1,
    motionTrails: false,
    rotation: 0,
    balls: []
};

// Shape names
const shapeNames = {
    3: 'Triangle', 4: 'Square', 5: 'Pentagon', 6: 'Hexagon',
    7: 'Heptagon', 8: 'Octagon', 9: 'Nonagon', 10: 'Decagon',
    11: 'Hendecagon', 12: 'Dodecagon', 13: 'Tridecagon', 14: 'Tetradecagon',
    15: 'Pentadecagon', 16: 'Hexadecagon', 17: 'Heptadecagon', 18: 'Octadecagon',
    19: 'Enneadecagon', 20: 'Icosagon'
};

// Ball class
class Ball {
    constructor(x, y, radius, color) {
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.radius = radius;
        this.mass = radius * radius;
        this.color = color;
    }

    draw() {
        const gradient = ctx.createRadialGradient(
            this.x - this.radius * 0.3,
            this.y - this.radius * 0.3,
            0,
            this.x,
            this.y,
            this.radius
        );
        gradient.addColorStop(0, this.color);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.8)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();

        // Glow
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.color;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.beginPath();
        ctx.arc(
            this.x - this.radius * 0.4,
            this.y - this.radius * 0.4,
            this.radius * 0.2,
            0,
            Math.PI * 2
        );
        ctx.fill();
    }
}

// Initialize balls
function initBalls() {
    state.balls = [];
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const apothem = Math.min(canvas.width, canvas.height) * 0.35;
    const spawnRadius = apothem * 0.8;

    for (let i = 0; i < state.count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * spawnRadius;
        const x = cx + Math.cos(angle) * dist;
        const y = cy + Math.sin(angle) * dist;
        const radius = 6 + Math.random() * state.sizeVar;
        const hue = Math.random() * 360;
        const color = `hsl(${hue}, 70%, 60%)`;
        state.balls.push(new Ball(x, y, radius, color));
    }
}

// Get polygon vertices
function getPolygonVertices() {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const radius = Math.min(canvas.width, canvas.height) * 0.35;
    const vertices = [];

    for (let i = 0; i < state.sides; i++) {
        const angle = state.rotation + (i / state.sides) * Math.PI * 2;
        vertices.push({
            x: cx + Math.cos(angle) * radius,
            y: cy + Math.sin(angle) * radius
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
        const dx = v2.x - v1.x;
        const dy = v2.y - v1.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        
        // Inward normal
        const nx = dy / len;
        const ny = -dx / len;

        edges.push({ v1, v2, nx, ny, dx, dy, len });
    }

    return edges;
}

// Draw polygon
function drawPolygon() {
    const vertices = getPolygonVertices();
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    // Background glow
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(canvas.width, canvas.height) * 0.4);
    gradient.addColorStop(0, 'rgba(100, 200, 255, 0.05)');
    gradient.addColorStop(1, 'rgba(100, 200, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Polygon stroke
    ctx.strokeStyle = 'rgba(100, 200, 255, 0.8)';
    ctx.lineWidth = 3;
    ctx.shadowBlur = 20;
    ctx.shadowColor = 'rgba(100, 200, 255, 0.6)';
    ctx.beginPath();
    vertices.forEach((v, i) => {
        if (i === 0) ctx.moveTo(v.x, v.y);
        else ctx.lineTo(v.x, v.y);
    });
    ctx.closePath();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Vertex dots
    ctx.fillStyle = 'rgba(100, 200, 255, 1)';
    vertices.forEach(v => {
        ctx.beginPath();
        ctx.arc(v.x, v.y, 4, 0, Math.PI * 2);
        ctx.fill();
    });
}

// Constrain ball inside polygon
function constrainBallInsidePolygon(ball) {
    const edges = getPolygonEdges();
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    for (const edge of edges) {
        // Vector from v1 to ball
        const dx = ball.x - edge.v1.x;
        const dy = ball.y - edge.v1.y;

        // Signed distance from edge (positive = inside)
        const dist = dx * edge.nx + dy * edge.ny;

        if (dist < ball.radius) {
            // Ball is penetrating or outside
            const penetration = ball.radius - dist;
            ball.x += edge.nx * penetration;
            ball.y += edge.ny * penetration;

            // Velocity relative to edge
            const vn = ball.vx * edge.nx + ball.vy * edge.ny;

            if (vn < 0) {
                // Ball moving outward, apply collision response
                
                // Rotational velocity of the edge at contact point
                const edgeCenterX = (edge.v1.x + edge.v2.x) / 2;
                const edgeCenterY = (edge.v1.y + edge.v2.y) / 2;
                const contactX = ball.x - edge.nx * ball.radius;
                const contactY = ball.y - edge.ny * ball.radius;
                const r = Math.sqrt((contactX - cx) * (contactX - cx) + (contactY - cy) * (contactY - cy));
                const angularVel = state.spinSpeed * 0.02;
                const tangentVelX = -(contactY - cy) * angularVel;
                const tangentVelY = (contactX - cx) * angularVel;

                // Reflect velocity with bounciness
                ball.vx -= edge.nx * vn * (1 + state.bounciness);
                ball.vy -= edge.ny * vn * (1 + state.bounciness);

                // Add tangential velocity from spinning wall
                const friction = 0.3;
                ball.vx += tangentVelX * friction;
                ball.vy += tangentVelY * friction;
            }
        }
    }
}

// Ball-to-ball collision
function resolveBallCollisions() {
    for (let i = 0; i < state.balls.length; i++) {
        for (let j = i + 1; j < state.balls.length; j++) {
            const b1 = state.balls[i];
            const b2 = state.balls[j];

            const dx = b2.x - b1.x;
            const dy = b2.y - b1.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const minDist = b1.radius + b2.radius;

            if (dist < minDist && dist > 0) {
                // Separate balls
                const overlap = minDist - dist;
                const nx = dx / dist;
                const ny = dy / dist;

                const totalMass = b1.mass + b2.mass;
                b1.x -= nx * overlap * (b2.mass / totalMass);
                b1.y -= ny * overlap * (b2.mass / totalMass);
                b2.x += nx * overlap * (b1.mass / totalMass);
                b2.y += ny * overlap * (b1.mass / totalMass);

                // Impulse resolution
                const dvx = b2.vx - b1.vx;
                const dvy = b2.vy - b1.vy;
                const dvn = dvx * nx + dvy * ny;

                if (dvn < 0) {
                    const restitution = 0.9;
                    const impulse = -(1 + restitution) * dvn / (1 / b1.mass + 1 / b2.mass);

                    b1.vx -= impulse * nx / b1.mass;
                    b1.vy -= impulse * ny / b1.mass;
                    b2.vx += impulse * nx / b2.mass;
                    b2.vy += impulse * ny / b2.mass;
                }
            }
        }
    }
}

// Physics update
function updatePhysics(dt) {
    const gravityRad = (state.gravityAngle * Math.PI) / 180;
    const gx = Math.sin(gravityRad) * state.gravityStrength;
    const gy = Math.cos(gravityRad) * state.gravityStrength;

    state.balls.forEach(ball => {
        ball.vx += gx * dt;
        ball.vy += gy * dt;

        // Damping
        ball.vx *= 0.9995;
        ball.vy *= 0.9995;

        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;
    });

    // Ball-to-ball collisions
    if (state.ballCollisions) {
        resolveBallCollisions();
    }

    // Constrain inside polygon
    state.balls.forEach(ball => {
        constrainBallInsidePolygon(ball);
    });
}

// Animation loop
let lastTime = performance.now();
function animate() {
    requestAnimationFrame(animate);

    const now = performance.now();
    const elapsed = (now - lastTime) / 1000;
    lastTime = now;

    const dt = elapsed * state.timeScale;
    const substeps = 5;
    const subDt = dt / substeps;

    // Update rotation
    state.rotation += state.spinSpeed * 0.02;

    // Physics substeps
    for (let i = 0; i < substeps; i++) {
        updatePhysics(subDt);
    }

    // Draw
    if (state.motionTrails) {
        ctx.fillStyle = 'rgba(10, 10, 15, 0.15)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
        ctx.fillStyle = '#0a0a0f';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    drawPolygon();
    state.balls.forEach(ball => ball.draw());
}

// Controls
const controls = {
    sides: document.getElementById('sides'),
    spinSpeed: document.getElementById('spinSpeed'),
    count: document.getElementById('count'),
    sizeVar: document.getElementById('sizeVar'),
    bounciness: document.getElementById('bounciness'),
    ballCollisions: document.getElementById('ballCollisions'),
    gravityAngle: document.getElementById('gravityAngle'),
    gravityStrength: document.getElementById('gravityStrength'),
    timeScale: document.getElementById('timeScale'),
    motionTrails: document.getElementById('motionTrails'),
    explode: document.getElementById('explode')
};

const displays = {
    sides: document.getElementById('sidesValue'),
    spinSpeed: document.getElementById('spinSpeedValue'),
    count: document.getElementById('countValue'),
    sizeVar: document.getElementById('sizeVarValue'),
    bounciness: document.getElementById('bouncinessValue'),
    gravityAngle: document.getElementById('gravityAngleValue'),
    gravityStrength: document.getElementById('gravityStrengthValue'),
    timeScale: document.getElementById('timeScaleValue')
};

const shapeName = document.getElementById('shapeName');

function getGravityArrow(angle) {
    if (angle >= 337.5 || angle < 22.5) return '↓';
    if (angle >= 22.5 && angle < 67.5) return '↙';
    if (angle >= 67.5 && angle < 112.5) return '←';
    if (angle >= 112.5 && angle < 157.5) return '↖';
    if (angle >= 157.5 && angle < 202.5) return '↑';
    if (angle >= 202.5 && angle < 247.5) return '↗';
    if (angle >= 247.5 && angle < 292.5) return '→';
    if (angle >= 292.5 && angle < 337.5) return '↘';
}

// Event listeners
controls.sides.addEventListener('input', (e) => {
    state.sides = parseInt(e.target.value);
    displays.sides.textContent = state.sides;
    shapeName.textContent = shapeNames[state.sides] || 'Polygon';
    initBalls();
});

controls.spinSpeed.addEventListener('input', (e) => {
    state.spinSpeed = parseFloat(e.target.value);
    displays.spinSpeed.textContent = state.spinSpeed.toFixed(1);
});

controls.count.addEventListener('input', (e) => {
    state.count = parseInt(e.target.value);
    displays.count.textContent = state.count;
    initBalls();
});

controls.sizeVar.addEventListener('input', (e) => {
    state.sizeVar = parseInt(e.target.value);
    displays.sizeVar.textContent = state.sizeVar;
    initBalls();
});

controls.bounciness.addEventListener('input', (e) => {
    state.bounciness = parseFloat(e.target.value);
    displays.bounciness.textContent = state.bounciness.toFixed(2);
});

controls.ballCollisions.addEventListener('change', (e) => {
    state.ballCollisions = e.target.checked;
});

controls.gravityAngle.addEventListener('input', (e) => {
    state.gravityAngle = parseInt(e.target.value);
    const arrow = getGravityArrow(state.gravityAngle);
    displays.gravityAngle.textContent = `${arrow} ${state.gravityAngle}°`;
});

controls.gravityStrength.addEventListener('input', (e) => {
    state.gravityStrength = parseInt(e.target.value);
    displays.gravityStrength.textContent = state.gravityStrength;
});

controls.timeScale.addEventListener('input', (e) => {
    state.timeScale = parseFloat(e.target.value);
    displays.timeScale.textContent = state.timeScale.toFixed(1) + '×';
});

controls.motionTrails.addEventListener('change', (e) => {
    state.motionTrails = e.target.checked;
});

controls.explode.addEventListener('click', () => {
    state.balls.forEach(ball => {
        const angle = Math.random() * Math.PI * 2;
        const speed = 300 + Math.random() * 500;
        ball.vx += Math.cos(angle) * speed;
        ball.vy += Math.sin(angle) * speed;
    });
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
const tooltipControls = document.querySelectorAll('[data-tooltip]');
tooltipControls.forEach(control => {
    control.addEventListener('mouseenter', (e) => {
        const text = control.getAttribute('data-tooltip');
        tooltip.textContent = text;
        
        const rect = control.getBoundingClientRect();
        tooltip.style.left = (rect.right + 10) + 'px';
        tooltip.style.top = rect.top + 'px';
        tooltip.classList.add('visible');
    });

    control.addEventListener('mouseleave', () => {
        tooltip.classList.remove('visible');
    });
});

// Initialize and start
initBalls();
animate();