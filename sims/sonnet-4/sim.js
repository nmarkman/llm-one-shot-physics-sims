class Vec2 {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    add(v) { return new Vec2(this.x + v.x, this.y + v.y); }
    sub(v) { return new Vec2(this.x - v.x, this.y - v.y); }
    mul(s) { return new Vec2(this.x * s, this.y * s); }
    dot(v) { return this.x * v.x + this.y * v.y; }
    length() { return Math.sqrt(this.x * this.x + this.y * this.y); }
    normalize() {
        const len = this.length();
        return len > 0 ? new Vec2(this.x / len, this.y / len) : new Vec2(0, 0);
    }
    rotate(angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return new Vec2(this.x * cos - this.y * sin, this.x * sin + this.y * cos);
    }
    perpendicular() { return new Vec2(-this.y, this.x); }
}

class Ball {
    constructor(x, y, radius, color) {
        this.pos = new Vec2(x, y);
        this.vel = new Vec2((Math.random() - 0.5) * 200, (Math.random() - 0.5) * 200);
        this.radius = radius;
        this.color = color;
        this.mass = radius * radius * 0.1;
    }

    update(dt, gravity) {
        this.vel = this.vel.add(gravity.mul(dt));
        this.pos = this.pos.add(this.vel.mul(dt));
    }

    draw(ctx) {
        const gradient = ctx.createRadialGradient(
            this.pos.x - this.radius * 0.3, 
            this.pos.y - this.radius * 0.3, 
            0,
            this.pos.x, this.pos.y, this.radius
        );
        gradient.addColorStop(0, this.color);
        gradient.addColorStop(1, 'rgba(0,0,0,0.8)');

        ctx.shadowColor = this.color;
        ctx.shadowBlur = this.radius * 0.5;
        ctx.beginPath();
        ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Highlight
        ctx.beginPath();
        ctx.arc(this.pos.x - this.radius * 0.3, this.pos.y - this.radius * 0.3, this.radius * 0.2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fill();
    }
}

class Polygon {
    constructor(sides, radius, centerX, centerY) {
        this.sides = sides;
        this.radius = radius;
        this.center = new Vec2(centerX, centerY);
        this.angle = 0;
        this.apothem = radius * Math.cos(Math.PI / sides);
        this.updateVertices();
    }

    updateVertices() {
        this.vertices = [];
        this.edges = [];
        this.normals = [];

        for (let i = 0; i < this.sides; i++) {
            const angle = (i / this.sides) * Math.PI * 2 + this.angle;
            const vertex = new Vec2(
                this.center.x + this.radius * Math.cos(angle),
                this.center.y + this.radius * Math.sin(angle)
            );
            this.vertices.push(vertex);
        }

        for (let i = 0; i < this.sides; i++) {
            const next = (i + 1) % this.sides;
            const edge = this.vertices[next].sub(this.vertices[i]);
            const normal = edge.perpendicular().normalize();
            
            // Ensure normal points inward
            const center = this.vertices[i].add(this.vertices[next]).mul(0.5);
            const toCenter = this.center.sub(center);
            if (normal.dot(toCenter) < 0) {
                normal.x = -normal.x;
                normal.y = -normal.y;
            }

            this.edges.push(edge);
            this.normals.push(normal);
        }
    }

    update(dt, spinSpeed) {
        this.angle += spinSpeed * dt;
        this.updateVertices();
    }

    getEdgeVelocity(edgeIndex, spinSpeed) {
        const edgeCenter = this.vertices[edgeIndex].add(this.vertices[(edgeIndex + 1) % this.sides]).mul(0.5);
        const radius = edgeCenter.sub(this.center).length();
        const tangent = this.edges[edgeIndex].normalize().perpendicular();
        return tangent.mul(spinSpeed * radius);
    }

    draw(ctx) {
        // Background glow
        const gradient = ctx.createRadialGradient(
            this.center.x, this.center.y, 0,
            this.center.x, this.center.y, this.radius * 1.5
        );
        gradient.addColorStop(0, 'rgba(100, 200, 255, 0.1)');
        gradient.addColorStop(1, 'rgba(100, 200, 255, 0)');
        ctx.beginPath();
        ctx.arc(this.center.x, this.center.y, this.radius * 1.5, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Polygon outline
        ctx.strokeStyle = 'rgba(100, 200, 255, 0.8)';
        ctx.lineWidth = 3;
        ctx.shadowColor = 'rgba(100, 200, 255, 0.8)';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(this.vertices[0].x, this.vertices[0].y);
        for (let i = 1; i < this.vertices.length; i++) {
            ctx.lineTo(this.vertices[i].x, this.vertices[i].y);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Vertex dots
        ctx.fillStyle = 'rgba(100, 200, 255, 1)';
        for (const vertex of this.vertices) {
            ctx.beginPath();
            ctx.arc(vertex.x, vertex.y, 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

class Simulation {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.balls = [];
        this.polygon = null;
        
        this.settings = {
            sides: 8,
            spinSpeed: 1,
            ballCount: 40,
            sizeVariation: 10,
            bounciness: 0.8,
            ballCollisions: true,
            gravityAngle: 90,
            gravityStrength: 800,
            timeScale: 1,
            motionTrails: false
        };

        this.resize();
        this.initPolygon();
        this.initBalls();
        
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.center = new Vec2(this.canvas.width / 2, this.canvas.height / 2);
        this.polygonRadius = Math.min(this.canvas.width, this.canvas.height) * 0.35;
        if (this.polygon) {
            this.polygon.center = this.center;
            this.polygon.radius = this.polygonRadius;
            this.polygon.apothem = this.polygonRadius * Math.cos(Math.PI / this.polygon.sides);
            this.polygon.updateVertices();
        }
    }

    initPolygon() {
        this.polygon = new Polygon(this.settings.sides, this.polygonRadius, this.center.x, this.center.y);
    }

    initBalls() {
        this.balls = [];
        const colors = [
            'rgb(255, 100, 100)', 'rgb(100, 255, 100)', 'rgb(100, 100, 255)',
            'rgb(255, 255, 100)', 'rgb(255, 100, 255)', 'rgb(100, 255, 255)',
            'rgb(255, 150, 100)', 'rgb(150, 255, 100)', 'rgb(100, 255, 150)'
        ];

        for (let i = 0; i < this.settings.ballCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * this.polygon.apothem * 0.7;
            const x = this.center.x + distance * Math.cos(angle);
            const y = this.center.y + distance * Math.sin(angle);
            const radius = 6 + Math.random() * this.settings.sizeVariation;
            const color = colors[Math.floor(Math.random() * colors.length)];
            
            this.balls.push(new Ball(x, y, radius, color));
        }
    }

    getGravity() {
        const angle = (this.settings.gravityAngle - 90) * Math.PI / 180;
        return new Vec2(
            Math.cos(angle) * this.settings.gravityStrength,
            Math.sin(angle) * this.settings.gravityStrength
        );
    }

    constrainBallToPolygon(ball) {
        for (let i = 0; i < this.polygon.sides; i++) {
            const vertex = this.polygon.vertices[i];
            const normal = this.polygon.normals[i];
            const toBall = ball.pos.sub(vertex);
            const distance = toBall.dot(normal);
            
            if (distance < ball.radius) {
                const penetration = ball.radius - distance;
                ball.pos = ball.pos.add(normal.mul(penetration));
                
                const edgeVel = this.polygon.getEdgeVelocity(i, this.settings.spinSpeed);
                const relativeVel = ball.vel.sub(edgeVel);
                const normalVel = relativeVel.dot(normal);
                
                if (normalVel < 0) {
                    const impulse = normal.mul(-normalVel * (1 + this.settings.bounciness));
                    ball.vel = ball.vel.add(impulse);
                    
                    const tangent = normal.perpendicular();
                    const tangentialVel = relativeVel.dot(tangent);
                    const friction = tangent.mul(-tangentialVel * 0.1);
                    ball.vel = ball.vel.add(friction);
                    ball.vel = ball.vel.add(edgeVel.mul(0.5));
                }
            }
        }
    }

    resolveBallCollision(ball1, ball2) {
        const delta = ball1.pos.sub(ball2.pos);
        const distance = delta.length();
        const minDistance = ball1.radius + ball2.radius;

        if (distance < minDistance) {
            // Separate balls
            const overlap = minDistance - distance;
            const separation = delta.normalize().mul(overlap * 0.5);
            ball1.pos = ball1.pos.add(separation);
            ball2.pos = ball2.pos.sub(separation);

            // Collision response
            const normal = delta.normalize();
            const relativeVel = ball1.vel.sub(ball2.vel);
            const velAlongNormal = relativeVel.dot(normal);

            if (velAlongNormal > 0) return;

            const restitution = 0.8;
            const impulseScalar = -(1 + restitution) * velAlongNormal / (1/ball1.mass + 1/ball2.mass);
            const impulse = normal.mul(impulseScalar);

            ball1.vel = ball1.vel.add(impulse.mul(1/ball1.mass));
            ball2.vel = ball2.vel.sub(impulse.mul(1/ball2.mass));
        }
    }

    update(dt) {
        const scaledDt = dt * this.settings.timeScale;
        const substeps = 5;
        const subDt = scaledDt / substeps;

        for (let step = 0; step < substeps; step++) {
            this.polygon.update(subDt, this.settings.spinSpeed);
            const gravity = this.getGravity();

            for (const ball of this.balls) {
                ball.update(subDt, gravity);
                ball.vel = ball.vel.mul(0.999); // Damping
            }

            if (this.settings.ballCollisions) {
                for (let i = 0; i < this.balls.length; i++) {
                    for (let j = i + 1; j < this.balls.length; j++) {
                        this.resolveBallCollision(this.balls[i], this.balls[j]);
                    }
                }
            }

            for (const ball of this.balls) {
                this.constrainBallToPolygon(ball);
            }
        }
    }

    draw() {
        if (this.settings.motionTrails) {
            this.ctx.fillStyle = 'rgba(10, 10, 15, 0.1)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        } else {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }

        this.polygon.draw(this.ctx);
        for (const ball of this.balls) {
            ball.draw(this.ctx);
        }
    }

    explode() {
        for (const ball of this.balls) {
            const angle = Math.random() * Math.PI * 2;
            const force = 300 + Math.random() * 500;
            ball.vel = ball.vel.add(new Vec2(Math.cos(angle) * force, Math.sin(angle) * force));
        }
    }
}

// UI Controller
class UIController {
    constructor(sim) {
        this.sim = sim;
        this.tooltip = document.getElementById('tooltip');
        this.setupControls();
        this.setupTooltips();
    }

    setupControls() {
        // Section collapsing
        document.querySelectorAll('.section-header').forEach(header => {
            header.addEventListener('click', () => {
                header.parentElement.classList.toggle('collapsed');
            });
        });

        // Shape controls
        const sidesSlider = document.getElementById('sides');
        const shapeName = document.getElementById('shapeName');
        const spinSpeedSlider = document.getElementById('spinSpeed');

        sidesSlider.addEventListener('input', (e) => {
            this.sim.settings.sides = parseInt(e.target.value);
            shapeName.textContent = this.getShapeName(this.sim.settings.sides);
            this.sim.initPolygon();
            this.sim.initBalls();
        });

        spinSpeedSlider.addEventListener('input', (e) => {
            this.sim.settings.spinSpeed = parseFloat(e.target.value);
        });

        // Ball controls
        const ballCountSlider = document.getElementById('ballCount');
        const sizeVariationSlider = document.getElementById('sizeVariation');
        const bouncinessSlider = document.getElementById('bounciness');
        const ballCollisionsToggle = document.getElementById('ballCollisions');

        ballCountSlider.addEventListener('input', (e) => {
            this.sim.settings.ballCount = parseInt(e.target.value);
            this.sim.initBalls();
        });

        sizeVariationSlider.addEventListener('input', (e) => {
            this.sim.settings.sizeVariation = parseInt(e.target.value);
            this.sim.initBalls();
        });

        bouncinessSlider.addEventListener('input', (e) => {
            this.sim.settings.bounciness = parseFloat(e.target.value);
        });

        ballCollisionsToggle.addEventListener('click', () => {
            this.sim.settings.ballCollisions = !this.sim.settings.ballCollisions;
            ballCollisionsToggle.classList.toggle('active');
        });

        // Physics controls
        const gravityAngleSlider = document.getElementById('gravityAngle');
        const gravityIndicator = document.getElementById('gravityIndicator');
        const gravityStrengthSlider = document.getElementById('gravityStrength');
        const timeScaleSlider = document.getElementById('timeScale');

        gravityAngleSlider.addEventListener('input', (e) => {
            this.sim.settings.gravityAngle = parseInt(e.target.value);
            gravityIndicator.textContent = this.getGravityArrow(this.sim.settings.gravityAngle);
        });

        gravityStrengthSlider.addEventListener('input', (e) => {
            this.sim.settings.gravityStrength = parseInt(e.target.value);
        });

        timeScaleSlider.addEventListener('input', (e) => {
            this.sim.settings.timeScale = parseFloat(e.target.value);
        });

        // Effects controls
        const motionTrailsToggle = document.getElementById('motionTrails');
        const explodeBtn = document.getElementById('explodeBtn');

        motionTrailsToggle.addEventListener('click', () => {
            this.sim.settings.motionTrails = !this.sim.settings.motionTrails;
            motionTrailsToggle.classList.toggle('active');
        });

        explodeBtn.addEventListener('click', () => {
            this.sim.explode();
        });
    }

    setupTooltips() {
        const tooltips = {
            'sides': 'Number of sides for the polygon frame',
            'spinSpeed': 'How fast the polygon rotates (negative = reverse)',
            'ballCount': 'Number of balls in the simulation',
            'sizeVariation': 'Random size variation added to base ball size',
            'bounciness': 'How much energy balls retain when hitting walls',
            'ballCollisions': 'Enable/disable ball-to-ball collisions',
            'gravityAngle': 'Direction of gravitational force',
            'gravityStrength': 'Strength of gravity (0 = weightless)',
            'timeScale': 'Speed multiplier for physics simulation',
            'motionTrails': 'Leave trails behind moving balls',
            'explodeBtn': 'Apply random explosive force to all balls'
        };

        Object.keys(tooltips).forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('mouseenter', (e) => {
                    this.showTooltip(e.target, tooltips[id]);
                });
                element.addEventListener('mouseleave', () => {
                    this.hideTooltip();
                });
            }
        });
    }

    showTooltip(element, text) {
        const rect = element.getBoundingClientRect();
        this.tooltip.textContent = text;
        this.tooltip.style.left = (rect.right + 10) + 'px';
        this.tooltip.style.top = rect.top + 'px';
        this.tooltip.classList.add('visible');
    }

    hideTooltip() {
        this.tooltip.classList.remove('visible');
    }

    getShapeName(sides) {
        const names = {
            3: 'Triangle', 4: 'Square', 5: 'Pentagon', 6: 'Hexagon',
            7: 'Heptagon', 8: 'Octagon', 9: 'Nonagon', 10: 'Decagon',
            11: 'Hendecagon', 12: 'Dodecagon'
        };
        return names[sides] || `${sides}-gon`;
    }

    getGravityArrow(angle) {
        if (angle >= 315 || angle < 45) return '→';
        if (angle >= 45 && angle < 135) return '↓';
        if (angle >= 135 && angle < 225) return '←';
        if (angle >= 225 && angle < 315) return '↑';
    }
}

// Initialize
const canvas = document.getElementById('canvas');
const sim = new Simulation(canvas);
const ui = new UIController(sim);

let lastTime = 0;
function animate(currentTime) {
    const deltaTime = (currentTime - lastTime) / 1000;
    lastTime = currentTime;

    if (deltaTime < 0.1) { // Cap delta time
        sim.update(deltaTime);
        sim.draw();
    }

    requestAnimationFrame(animate);
}

requestAnimationFrame(animate);