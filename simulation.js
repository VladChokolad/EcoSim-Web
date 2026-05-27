


document.title = 'Симуляция с пещерами (лимит 3)';

if (typeof THREE === 'undefined') {
    alert('Three.js не загружен');
    throw new Error('Three.js не загружен');
}


let scene, camera, renderer, controls, stats, ground;
let plants = [], herbivores = [], predators = [], caves = [];
let worldBounds = { minX: -60, maxX: 60, minZ: -60, maxZ: 60 };
let simulationPaused = false;
let simulationSpeed = 1.0;
let lastTime = 0;
let frameCount = 0;
let simulationTime = 0;


const CAVE_COUNT = 8;
const CAVE_SIZE = 1.8;
const CAVE_RADIUS = CAVE_SIZE / 2;
const MAX_HERBIVORES_PER_CAVE = 3; 


let keysPressed = {};
const CAMERA_MOVE_SPEED = 20.0;
const CAMERA_PITCH_SPEED = 1.0;
const CAMERA_ZOOM_SPEED = 5.0;


let deerCountEl, hareCountEl, wolfCountEl, bearCountEl;
let pauseBtn, resetBtn, addDeerBtn, addHareBtn, addWolfBtn, addBearBtn;
let speedSlider, speedValueEl;
let fpsCounterEl, objectCountEl, timeCounterEl;
let chartModal, fullsizeChartCtx, openChartBtn, closeChartBtn;
let chartUpdateInterval = null;
let placementMode = null;


let creatureInfoPanel, closeCreatureInfoBtn;
let creatureTypeEl, creatureSubtypeEl, creatureEnergyEl, creatureSpeedEl;
let creatureStateEl, creaturePositionEl, creatureTargetEl;
let selectedCreature = null;

let isDraggingCreaturePanel = false;
let dragOffsetX = 0, dragOffsetY = 0;
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();


let populationHistory = {
    plants: [],
    herbivores: [],
    predators: [],
    deer: [],
    hare: [],
    wolf: [],
    bear: []
};
const HISTORY_LENGTH = 100;




class Cave {
    constructor(x, z) {
        this.position = new THREE.Vector3(x, 0, z);
        this.radius = CAVE_RADIUS;
        this.mesh = null;
        this.hiddenHerbivores = 0; 
        this.createMesh();
    }

    createMesh() {
        const geometry = new THREE.BoxGeometry(CAVE_SIZE, CAVE_SIZE, CAVE_SIZE);
        const material = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.6, metalness: 0.2, transparent: true, opacity: 0.7 });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(this.position);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = false;
        scene.add(this.mesh);
    }

    remove() {
        if (this.mesh) {
            scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
        }
    }

    
    canEnter() {
        return this.hiddenHerbivores < MAX_HERBIVORES_PER_CAVE;
    }

    enter() {
        if (this.canEnter()) {
            this.hiddenHerbivores++;
            return true;
        }
        return false;
    }

    exit() {
        if (this.hiddenHerbivores > 0) {
            this.hiddenHerbivores--;
        }
    }
}




function generateCaves() {
    caves.forEach(cave => cave.remove());
    caves = [];
    const minDist = 4.0;
    for (let i = 0; i < CAVE_COUNT; i++) {
        let attempts = 0;
        let placed = false;
        while (!placed && attempts < 50) {
            const x = Math.random() * (worldBounds.maxX - worldBounds.minX - 6) + worldBounds.minX + 3;
            const z = Math.random() * (worldBounds.maxZ - worldBounds.minZ - 6) + worldBounds.minZ + 3;
            let overlap = false;
            for (let c of caves) {
                if (Math.hypot(c.position.x - x, c.position.z - z) < minDist) {
                    overlap = true;
                    break;
                }
            }
            if (!overlap) {
                caves.push(new Cave(x, z));
                placed = true;
            }
            attempts++;
        }
        if (!placed) {
            caves.push(new Cave(0, 0));
        }
    }
}




function activatePlacementMode(mode) {
    if (placementMode === mode) {
        deactivatePlacementMode();
        return;
    }
    deactivatePlacementMode();
    placementMode = mode;
    if (renderer && renderer.domElement) renderer.domElement.style.cursor = 'crosshair';
    let btn = null;
    if (mode === 'deer') btn = addDeerBtn;
    else if (mode === 'hare') btn = addHareBtn;
    else if (mode === 'wolf') btn = addWolfBtn;
    else if (mode === 'bear') btn = addBearBtn;
    if (btn) btn.classList.add('active-placement');
}

function deactivatePlacementMode() {
    if (!placementMode) return;
    if (renderer && renderer.domElement) renderer.domElement.style.cursor = '';
    if (addDeerBtn) addDeerBtn.classList.remove('active-placement');
    if (addHareBtn) addHareBtn.classList.remove('active-placement');
    if (addWolfBtn) addWolfBtn.classList.remove('active-placement');
    if (addBearBtn) addBearBtn.classList.remove('active-placement');
    placementMode = null;
}

function createEntityAtPosition(x, z) {
    if (!placementMode) return;
    
    for (let cave of caves) {
        if (Math.hypot(x - cave.position.x, z - cave.position.z) < CAVE_RADIUS + 0.6) {
            const angle = Math.random() * Math.PI * 2;
            x = cave.position.x + Math.cos(angle) * (CAVE_RADIUS + 0.8);
            z = cave.position.z + Math.sin(angle) * (CAVE_RADIUS + 0.8);
            break;
        }
    }
    if (placementMode === 'deer')
        herbivores.push(new Deer(x, z, 100));
    else if (placementMode === 'hare')
        herbivores.push(new Hare(x, z, 80));
    else if (placementMode === 'wolf')
        predators.push(new Wolf(x, z, 120));
    else if (placementMode === 'bear')
        predators.push(new Bear(x, z, 150));
    deactivatePlacementMode();
}




function generateBiomeTexture(width = 1024, height = 1024) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    function getBiomeValue(x, z) {
        let v = Math.sin(x * 0.08) * Math.cos(z * 0.08);
        v += Math.sin(x * 0.25 + 1.2) * 0.5;
        v += Math.cos(z * 0.2) * 0.3;
        v += Math.sin((x * 0.5 + z * 0.3) * 1.5) * 0.2;
        v = (v + 1.7) / 3.4;
        return Math.min(0.99, Math.max(0.01, v));
    }
    const colors = {
        desert:    { r: 232, g: 184, b: 107 },
        dryGrass:  { r: 124, g: 181, b: 24 },
        grass:     { r: 90,  g: 158, b: 78 },
        forest:    { r: 58,  g: 107, b: 47 }
    };
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const worldX = (x / width) * 120 - 60;
            const worldZ = (y / height) * 120 - 60;
            let value = getBiomeValue(worldX, worldZ);
            let r, g, b;
            if (value < 0.25) {
                r = colors.desert.r; g = colors.desert.g; b = colors.desert.b;
                const noise = (Math.sin(worldX * 0.5) * Math.cos(worldZ * 0.5) + 1) / 2 * 20;
                r = Math.min(255, r + noise);
                g = Math.min(255, g + noise * 0.7);
                b = Math.min(255, b + noise * 0.5);
            } else if (value < 0.5) {
                r = colors.dryGrass.r; g = colors.dryGrass.g; b = colors.dryGrass.b;
                const noise = (Math.sin(worldX * 0.7) + Math.cos(worldZ * 0.7)) * 8;
                r = Math.min(255, Math.max(0, r + noise));
                g = Math.min(255, Math.max(0, g + noise));
                b = Math.min(255, Math.max(0, b + noise * 0.5));
            } else if (value < 0.75) {
                r = colors.grass.r; g = colors.grass.g; b = colors.grass.b;
                const noise = (Math.sin(worldX * 0.9) + Math.cos(worldZ * 0.9)) * 5;
                r = Math.min(255, r + noise);
                g = Math.min(255, g + noise);
                b = Math.min(255, b + noise * 0.6);
            } else {
                r = colors.forest.r; g = colors.forest.g; b = colors.forest.b;
                const noise = (Math.sin(worldX * 1.2) * Math.cos(worldZ * 1.2)) * 10;
                r = Math.min(255, Math.max(0, r + noise));
                g = Math.min(255, Math.max(0, g + noise));
                b = Math.min(255, Math.max(0, b + noise * 0.8));
            }
            const idx = (y * width + x) * 4;
            data[idx] = r; data[idx+1] = g; data[idx+2] = b; data[idx+3] = 255;
        }
    }
    ctx.putImageData(imageData, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1);
    texture.needsUpdate = true;
    return texture;
}




function initThreeJS() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a1a);
    scene.fog = new THREE.Fog(0x0a0a1a, 80, 150);
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(30, 25, 30);
    camera.lookAt(0, 0, 0);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    const canvasContainer = document.getElementById('canvas-container');
    if (!canvasContainer) throw new Error('canvas-container отсутствует');
    renderer.setSize(window.innerWidth - document.getElementById('ui-panel').offsetWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    canvasContainer.appendChild(renderer.domElement);
    if (typeof THREE.OrbitControls !== 'undefined') {
        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.minDistance = 10;
        controls.maxDistance = 80;
        controls.maxPolarAngle = Math.PI / 2 - 0.1;
    }
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(20, 30, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 100;
    directionalLight.shadow.camera.left = -30;
    directionalLight.shadow.camera.right = 30;
    directionalLight.shadow.camera.top = 30;
    directionalLight.shadow.camera.bottom = -30;
    scene.add(directionalLight);
    const groundGeometry = new THREE.PlaneGeometry(120, 120);
    const biomeTexture = generateBiomeTexture(1024, 1024);
    const groundMaterial = new THREE.MeshStandardMaterial({ map: biomeTexture, roughness: 0.8, metalness: 0.1 });
    ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    ground.receiveShadow = true;
    scene.add(ground);
    if (typeof Stats !== 'undefined') {
        stats = new Stats();
        stats.showPanel(0);
        document.getElementById('stats-container').appendChild(stats.dom);
    }
    window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
    const uiPanel = document.getElementById('ui-panel');
    const width = window.innerWidth - (uiPanel ? uiPanel.offsetWidth : 400);
    const height = window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
}




class Plant {
    constructor(x, z, energy = 50) {
        this.energy = energy;
        this.position = new THREE.Vector3(x, 0, z);
        this.isAlive = true;
        this.mesh = null;
        this.createMesh();
    }
    createMesh() {
        const geometry = new THREE.CylinderGeometry(0.5, 0.7, 1.2, 8);
        const material = new THREE.MeshStandardMaterial({ color: 0x66BB6A, roughness: 0.7, metalness: 0.1 });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(this.position);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        scene.add(this.mesh);
    }
    remove() {
        if (this.mesh) {
            scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
        }
        this.isAlive = false;
    }
}

class Creature {
    constructor(type, x, z, energy = 100, subtype = 'generic') {
        this.type = type;
        this.subtype = subtype;
        this.energy = energy;
        this.maxEnergy = 200;
        this.speed = type === 'herbivore' ? 5.0 : 6.0;
        this.originalSpeed = this.speed;
        this.reproductionChance = type === 'herbivore' ? 0.02 : 0.005;
        this.position = new THREE.Vector3(x, 0.5, z);
        this.velocity = new THREE.Vector3((Math.random() - 0.5) * 0.1, 0, (Math.random() - 0.5) * 0.1);
        this.target = null;
        this.isAlive = true;
        this.mesh = null;
        
    }
    createMesh() {
        if (this.mesh) {
            scene.remove(this.mesh);
            if (this.mesh.geometry) this.mesh.geometry.dispose();
            if (this.mesh.material) this.mesh.material.dispose();
        }
        const radius = this.type === 'herbivore' ? 0.5 : 0.6;
        const geometry = new THREE.SphereGeometry(radius, 16, 16);
        const color = this.type === 'herbivore' ? 0x66ff66 : 0xff6666;
        const material = new THREE.MeshStandardMaterial({ color: color, roughness: 0.4, metalness: 0.3 });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(this.position);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        scene.add(this.mesh);
        this.updateColor();
    }
    updateColor() {
        if (!this.mesh) return;
        const ratio = this.energy / this.maxEnergy;
        let color;
        if (this.type === 'herbivore') {
            color = new THREE.Color().lerpColors(new THREE.Color(0x66ff66), new THREE.Color(0xff9900), 1 - ratio);
        } else {
            color = new THREE.Color().lerpColors(new THREE.Color(0xff6666), new THREE.Color(0x990000), 1 - ratio);
        }
        this.mesh.material.color.copy(color);
    }
    move(deltaTime) {
        if (!this.isAlive) return;
        const wanderStrength = 8.0;
        const turnSpeed = 4.0;
        if (this.velocity.length() < 0.01) {
            const randomAngle = Math.random() * Math.PI * 2;
            this.velocity.set(Math.cos(randomAngle), 0, Math.sin(randomAngle));
        }
        const currentDir = this.velocity.clone().normalize();
        let desiredDir;
        if (this.target && this.target.isAlive) {
            desiredDir = new THREE.Vector3().subVectors(this.target.position, this.position).normalize();
        } else {
            const randomAngle = (Math.random() - 0.5) * wanderStrength * deltaTime;
            const cos = Math.cos(randomAngle);
            const sin = Math.sin(randomAngle);
            desiredDir = new THREE.Vector3(
                currentDir.x * cos - currentDir.z * sin,
                0,
                currentDir.x * sin + currentDir.z * cos
            ).normalize();
        }
        const newDir = currentDir.clone().lerp(desiredDir, turnSpeed * deltaTime).normalize();
        this.velocity.copy(newDir.multiplyScalar(this.speed * deltaTime));
        this.position.add(this.velocity);
        if (this.position.x < worldBounds.minX) { this.velocity.x = Math.abs(this.velocity.x) * 0.8; this.position.x = worldBounds.minX + 0.1; }
        if (this.position.x > worldBounds.maxX) { this.velocity.x = -Math.abs(this.velocity.x) * 0.8; this.position.x = worldBounds.maxX - 0.1; }
        if (this.position.z < worldBounds.minZ) { this.velocity.z = Math.abs(this.velocity.z) * 0.8; this.position.z = worldBounds.minZ + 0.1; }
        if (this.position.z > worldBounds.maxZ) { this.velocity.z = -Math.abs(this.velocity.z) * 0.8; this.position.z = worldBounds.maxZ - 0.1; }
        if (this.mesh) this.mesh.position.copy(this.position);
    }
    findTarget() {}
    eat(target) {}
    reproduce() {
        const threshold = this.maxEnergy / 2;
        if (this.energy > threshold) {
            this.energy *= 0.6;
            const offspringEnergy = this.energy * 0.67;
            let x = this.position.x + (Math.random() - 0.5) * 3;
            let z = this.position.z + (Math.random() - 0.5) * 3;
            
            for (let cave of caves) {
                if (Math.hypot(x - cave.position.x, z - cave.position.z) < CAVE_RADIUS + 0.6) {
                    const angle = Math.random() * Math.PI * 2;
                    x = cave.position.x + Math.cos(angle) * (CAVE_RADIUS + 0.8);
                    z = cave.position.z + Math.sin(angle) * (CAVE_RADIUS + 0.8);
                    break;
                }
            }
            if (this.type === 'herbivore') {
                const offspring = new Herbivore(x, z, offspringEnergy);
                herbivores.push(offspring);
                offspring.speed *= 0.85 + Math.random() * 0.3;
                return offspring;
            } else {
                const offspring = new Predator(x, z, offspringEnergy);
                predators.push(offspring);
                offspring.speed *= 0.85 + Math.random() * 0.3;
                return offspring;
            }
        }
        return null;
    }
    die() {
        this.isAlive = false;
        if (this.mesh) {
            
            scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
            this.mesh = null;
        }
        
        this.isAlive = null;
    }
    update(deltaTime) {
        if (this.isAlive === null) return; 
        if (!this.isAlive) {
            
            return;
        }
        this.energy -= 0.3 * deltaTime;
        if (this.energy <= 0) { this.die(); return; }
        this.move(deltaTime);
        this.findTarget();
        if (this.target && this.position.distanceTo(this.target.position) < 1.2) this.eat(this.target);
        if (Math.random() < this.reproductionChance * deltaTime) this.reproduce();
    }

}

class Herbivore extends Creature {
    constructor(x, z, energy = 100) {
        super('herbivore', x, z, energy);
        this.isHidden = false;
        this.fleeing = false;
        this.targetCave = null;
        this.createMesh();
    }

    checkForPredator() {
        if (this.isHidden || this.fleeing) return false;
        const DANGER_RADIUS = 12;
        for (let pred of predators) {
            if (!pred.isAlive) continue;
            const dist = this.position.distanceTo(pred.position);
            if (dist < DANGER_RADIUS) {
                
                let closestCave = null;
                let minDist = Infinity;
                for (let cave of caves) {
                    if (!cave.canEnter()) continue; 
                    const d = Math.hypot(this.position.x - cave.position.x, this.position.z - cave.position.z);
                    if (d < minDist) {
                        minDist = d;
                        closestCave = cave;
                    }
                }
                if (closestCave) {
                    this.fleeing = true;
                    this.targetCave = closestCave;
                    this.target = null;
                } else {
                    
                    this.fleeing = false;
                    this.targetCave = null;
                }
                return true;
            }
        }
        return false;
    }

    enterCave(cave) {
        if (this.isHidden) return false;
        if (!cave.canEnter()) return false;
        
        this.isHidden = true;
        this.fleeing = false;
        this.targetCave = null;
        this.target = null;
        this.velocity.set(0, 0, 0);
        this.position.copy(cave.position);
        if (this.mesh) this.mesh.visible = false;
        cave.enter(); 
        return true;
    }

    exitCave() {
        if (!this.isHidden) return;
        
        let currentCave = null;
        for (let cave of caves) {
            if (this.position.distanceTo(cave.position) < CAVE_RADIUS + 0.5) {
                currentCave = cave;
                break;
            }
        }
        if (currentCave) {
            currentCave.exit(); 
        }
        this.isHidden = false;
        
        let angle = Math.random() * Math.PI * 2;
        let offset = CAVE_RADIUS + 0.8;
        let newX = this.position.x + Math.cos(angle) * offset;
        let newZ = this.position.z + Math.sin(angle) * offset;
        newX = Math.min(worldBounds.maxX - 0.5, Math.max(worldBounds.minX + 0.5, newX));
        newZ = Math.min(worldBounds.maxZ - 0.5, Math.max(worldBounds.minZ + 0.5, newZ));
        this.position.set(newX, 0.5, newZ);
        if (this.mesh) this.mesh.visible = true;
        this.velocity.set((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5);
    }

    shouldExitCave() {
        if (!this.isHidden) return false;
        
        if (this.energy < 20) return true;
        for (let pred of predators) {
            if (pred.isAlive && this.position.distanceTo(pred.position) < 15) return false;
        }
        return true;
    }

    update(deltaTime) {
        if (!this.isAlive) return;
        this.energy -= 0.3 * deltaTime;
        if (this.energy <= 0) { this.die(); return; }

        if (this.isHidden) {
            
            if (this.shouldExitCave()) this.exitCave();
            return;
        }

        if (this.fleeing) {
            
            if (this.targetCave && this.targetCave.mesh && this.targetCave.canEnter()) {
                const targetPos = this.targetCave.position;
                const direction = new THREE.Vector3().subVectors(targetPos, this.position).normalize();
                this.velocity.copy(direction.multiplyScalar(this.speed * deltaTime));
                this.position.add(this.velocity);
                if (this.mesh) this.mesh.position.copy(this.position);
                
                this.position.x = Math.min(worldBounds.maxX, Math.max(worldBounds.minX, this.position.x));
                this.position.z = Math.min(worldBounds.maxZ, Math.max(worldBounds.minZ, this.position.z));
                
                if (this.position.distanceTo(targetPos) < CAVE_RADIUS + 0.5) {
                    if (this.enterCave(this.targetCave)) {
                        
                        return;
                    } else {
                        
                        
                        this.fleeing = false;
                        this.targetCave = null;
                    }
                }
            } else {
                
                this.fleeing = false;
                this.targetCave = null;
            }
            return;
        }

        
        this.findTarget();
        this.move(deltaTime);
        if (this.target && this.position.distanceTo(this.target.position) < 1.2) this.eat(this.target);
        if (Math.random() < this.reproductionChance * deltaTime) this.reproduce();

        
        this.checkForPredator();

        
        for (let cave of caves) {
            if (this.position.distanceTo(cave.position) < CAVE_RADIUS + 0.5 && cave.canEnter()) {
                this.enterCave(cave);
                break;
            }
        }
    }

    findTarget() {
        let closest = null, closestDist = Infinity;
        for (const plant of plants) {
            if (!plant.isAlive) continue;
            const dist = this.position.distanceTo(plant.position);
            if (dist < closestDist && dist < 10) { closestDist = dist; closest = plant; }
        }
        this.target = closest;
    }

    eat(plant) {
        if (!plant.isAlive) return;
        this.energy = Math.min(this.maxEnergy, this.energy + plant.energy);
        plant.remove();
        const idx = plants.indexOf(plant);
        if (idx > -1) plants.splice(idx, 1);
        this.target = null;
    }
}

class Predator extends Creature {
    constructor(x, z, energy = 120) { 
        super('predator', x, z, energy); 
        this.createMesh();
    }

    findTarget() {
        let closest = null, closestDist = Infinity;
        for (const herb of herbivores) {
            if (!herb.isAlive || herb.isHidden) continue; 
            const dist = this.position.distanceTo(herb.position);
            if (dist < closestDist && dist < 15) { closestDist = dist; closest = herb; }
        }
        this.target = closest;
    }

    eat(herbivore) {
        if (!herbivore.isAlive || herbivore.isHidden) return;
        this.energy = Math.min(this.maxEnergy, this.energy + herbivore.energy);
        herbivore.die();
        this.target = null;
    }

    reproduce() {
        const threshold = this.maxEnergy / 2;
        if (this.energy > threshold) {
            this.energy *= 0.6;
            const offspringEnergy = this.energy * 0.67;
            let x = this.position.x + (Math.random() - 0.5) * 3;
            let z = this.position.z + (Math.random() - 0.5) * 3;
            for (let cave of caves) {
                if (Math.hypot(x - cave.position.x, z - cave.position.z) < CAVE_RADIUS + 0.6) {
                    const angle = Math.random() * Math.PI * 2;
                    x = cave.position.x + Math.cos(angle) * (CAVE_RADIUS + 0.8);
                    z = cave.position.z + Math.sin(angle) * (CAVE_RADIUS + 0.8);
                    break;
                }
            }
            const offspring = new Bear(x, z, offspringEnergy);
            predators.push(offspring);
            offspring.speed *= 0.85 + Math.random() * 0.3;
            return offspring;
        }
        return null;
    }
}





class Deer extends Herbivore {
    constructor(x, z, energy = 100) {
        super(x, z, energy);
        this.subtype = 'deer';
        this.speed = 6.0;
        this.maxEnergy = 180;
        this.reproductionChance = 0.015;
        this.stompCooldown = 0;
        this.createMesh();
    }

    createMesh() {
        if (this.mesh) {
            scene.remove(this.mesh);
            if (this.mesh.geometry) this.mesh.geometry.dispose();
            if (this.mesh.material) this.mesh.material.dispose();
        }
        
        const bodyGeometry = new THREE.SphereGeometry(0.6, 16, 16);
        const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.5, metalness: 0.2 });
        this.mesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
        this.mesh.position.copy(this.position);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        scene.add(this.mesh);

        
        const hornGeometry = new THREE.ConeGeometry(0.1, 0.4, 8);
        const hornMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.7 });
        const leftHorn = new THREE.Mesh(hornGeometry, hornMaterial);
        leftHorn.position.set(-0.2, 0.3, 0);
        leftHorn.rotation.z = Math.PI / 6;
        this.mesh.add(leftHorn);
        const rightHorn = new THREE.Mesh(hornGeometry, hornMaterial);
        rightHorn.position.set(0.2, 0.3, 0);
        rightHorn.rotation.z = -Math.PI / 6;
        this.mesh.add(rightHorn);
    }

    update(deltaTime) {
        super.update(deltaTime);
        if (this.stompCooldown > 0) this.stompCooldown -= deltaTime;
        
        if (this.stompCooldown <= 0 && Math.random() < 0.1 * deltaTime) {
            for (let pred of predators) {
                if (pred.isAlive && this.position.distanceTo(pred.position) < 8) {
                    this.stomp();
                    break;
                }
            }
        }
    }

    stomp() {
        this.stompCooldown = 5.0; 
        this.speed *= 1.5; 
        setTimeout(() => {
            this.speed = 6.0; 
        }, 2000);
        
        for (let pred of predators) {
            if (pred.isAlive && this.position.distanceTo(pred.position) < 10) {
                
                pred.target = null;
                pred.velocity.set(-pred.velocity.x, 0, -pred.velocity.y).normalize().multiplyScalar(pred.speed * 0.1);
            }
        }
    }

    reproduce() {
        const threshold = this.maxEnergy / 2;
        if (this.energy > threshold) {
            this.energy *= 0.6;
            const offspringEnergy = this.energy * 0.67;
            let x = this.position.x + (Math.random() - 0.5) * 3;
            let z = this.position.z + (Math.random() - 0.5) * 3;
            for (let cave of caves) {
                if (Math.hypot(x - cave.position.x, z - cave.position.z) < CAVE_RADIUS + 0.6) {
                    const angle = Math.random() * Math.PI * 2;
                    x = cave.position.x + Math.cos(angle) * (CAVE_RADIUS + 0.8);
                    z = cave.position.z + Math.sin(angle) * (CAVE_RADIUS + 0.8);
                    break;
                }
            }
            const offspring = new Deer(x, z, offspringEnergy);
            herbivores.push(offspring);
            offspring.speed *= 0.85 + Math.random() * 0.3;
            return offspring;
        }
        return null;
    }
}

class Hare extends Herbivore {
    constructor(x, z, energy = 80) {
        super(x, z, energy);
        this.subtype = 'hare';
        this.speed = 8.0;
        this.maxEnergy = 80;
        this.reproductionChance = 0.03;
        this.createMesh();
    }

    createMesh() {
        if (this.mesh) {
            scene.remove(this.mesh);
            if (this.mesh.geometry) this.mesh.geometry.dispose();
            if (this.mesh.material) this.mesh.material.dispose();
        }
        
        const bodyGeometry = new THREE.BoxGeometry(0.6, 0.6, 0.6);
        const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.6 });
        this.mesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
        this.mesh.position.copy(this.position);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        scene.add(this.mesh);

        
        const earGeometry = new THREE.BoxGeometry(0.1, 0.3, 0.1);
        const earMaterial = new THREE.MeshStandardMaterial({ color: 0x606060 });
        const leftEar = new THREE.Mesh(earGeometry, earMaterial);
        leftEar.position.set(-0.15, 0.4, 0);
        this.mesh.add(leftEar);
        const rightEar = new THREE.Mesh(earGeometry, earMaterial);
        rightEar.position.set(0.15, 0.4, 0);
        this.mesh.add(rightEar);
    }

    reproduce() {
        
        const threshold = this.maxEnergy / 2;
        if (this.energy > threshold) {
            this.energy *= 0.6;
            const offspringEnergy = this.energy * 0.67;
            let x = this.position.x + (Math.random() - 0.5) * 3;
            let z = this.position.z + (Math.random() - 0.5) * 3;
            for (let cave of caves) {
                if (Math.hypot(x - cave.position.x, z - cave.position.z) < CAVE_RADIUS + 0.6) {
                    const angle = Math.random() * Math.PI * 2;
                    x = cave.position.x + Math.cos(angle) * (CAVE_RADIUS + 0.8);
                    z = cave.position.z + Math.sin(angle) * (CAVE_RADIUS + 0.8);
                    break;
                }
            }
            const offspring = new Hare(x, z, offspringEnergy);
            herbivores.push(offspring);
            offspring.speed *= 0.85 + Math.random() * 0.3;
            return offspring;
        }
        return null;
    }

    
    checkForPredator() {
        
        const DANGER_RADIUS = 12;
        for (let pred of predators) {
            if (!pred.isAlive || pred.subtype === 'bear') continue;
            const dist = this.position.distanceTo(pred.position);
            if (dist < DANGER_RADIUS) {
                
                let closestCave = null;
                let minDist = Infinity;
                for (let cave of caves) {
                    if (!cave.canEnter()) continue;
                    const d = Math.hypot(this.position.x - cave.position.x, this.position.z - cave.position.z);
                    if (d < minDist) {
                        minDist = d;
                        closestCave = cave;
                    }
                }
                if (closestCave) {
                    this.fleeing = true;
                    this.targetCave = closestCave;
                    this.target = null;
                } else {
                    this.fleeing = false;
                    this.targetCave = null;
                }
                return true;
            }
        }
        return false;
    }
}

class Wolf extends Predator {
    constructor(x, z, energy = 120) {
        super(x, z, energy);
        this.subtype = 'wolf';
        this.speed = 7.0;
        this.maxEnergy = 150;
        this.reproductionChance = 0.008;
        this.howlCooldown = 0;
        this.createMesh();
    }

    createMesh() {
        if (this.mesh) {
            scene.remove(this.mesh);
            if (this.mesh.geometry) this.mesh.geometry.dispose();
            if (this.mesh.material) this.mesh.material.dispose();
        }
        
        const bodyGeometry = new THREE.ConeGeometry(0.65, 1.2, 8);
        const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.5 });
        this.mesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
        this.mesh.position.copy(this.position);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        scene.add(this.mesh);

        
        const tailGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.3, 6);
        const tailMaterial = new THREE.MeshStandardMaterial({ color: 0x555555 });
        const tail = new THREE.Mesh(tailGeometry, tailMaterial);
        tail.position.set(0, 0, -0.5);
        tail.rotation.x = Math.PI / 2;
        this.mesh.add(tail);
    }

    update(deltaTime) {
        super.update(deltaTime);
        if (this.howlCooldown > 0) this.howlCooldown -= deltaTime;
        
        if (this.howlCooldown <= 0 && Math.random() < 0.05 * deltaTime) {
            let alone = true;
            for (let other of predators) {
                if (other !== this && other.isAlive && other.subtype === 'wolf' && this.position.distanceTo(other.position) < 10) {
                    alone = false;
                    break;
                }
            }
            if (alone) this.howl();
        }
    }

    howl() {
        this.howlCooldown = 10.0; 
        
        for (let other of predators) {
            if (other !== this && other.isAlive && other.subtype === 'wolf' && this.position.distanceTo(other.position) < 20) {
                
                other.target = this;
                other.speed *= 1.2;
                setTimeout(() => {
                    other.speed = other.subtype === 'wolf' ? 7.0 : other.speed;
                }, 3000);
            }
        }
    }
}

class Bear extends Predator {
    constructor(x, z, energy = 150) {
        super(x, z, energy);
        this.subtype = 'bear';
        this.speed = 4.0;
        this.maxEnergy = 250;
        this.reproductionChance = 0.002;
        this.createMesh();
    }

    createMesh() {
        if (this.mesh) {
            scene.remove(this.mesh);
            if (this.mesh.geometry) this.mesh.geometry.dispose();
            if (this.mesh.material) this.mesh.material.dispose();
        }
        
        const bodyGeometry = new THREE.SphereGeometry(1.0, 16, 16);
        const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x654321, roughness: 0.7 });
        this.mesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
        this.mesh.position.copy(this.position);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        scene.add(this.mesh);

        
        const earGeometry = new THREE.SphereGeometry(0.15, 8, 8);
        const earMaterial = new THREE.MeshStandardMaterial({ color: 0x543210 });
        const leftEar = new THREE.Mesh(earGeometry, earMaterial);
        leftEar.position.set(-0.3, 0.5, 0.3);
        this.mesh.add(leftEar);
        const rightEar = new THREE.Mesh(earGeometry, earMaterial);
        rightEar.position.set(0.3, 0.5, 0.3);
        this.mesh.add(rightEar);

        
        const snoutGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.3, 8);
        const snoutMaterial = new THREE.MeshStandardMaterial({ color: 0x543210 });
        const snout = new THREE.Mesh(snoutGeometry, snoutMaterial);
        snout.position.set(0, 0, 0.5);
        snout.rotation.x = Math.PI / 2;
        this.mesh.add(snout);
    }

    findTarget() {
        
        let closest = null, closestDist = Infinity;
        
        for (const herb of herbivores) {
            if (!herb.isAlive || herb.isHidden || herb.subtype === 'hare') continue;
            const dist = this.position.distanceTo(herb.position);
            if (dist < closestDist && dist < 15) {
                closestDist = dist;
                closest = herb;
            }
        }
        
        if (!closest) {
            for (const plant of plants) {
                if (!plant.isAlive) continue;
                const dist = this.position.distanceTo(plant.position);
                if (dist < closestDist && dist < 10) {
                    closestDist = dist;
                    closest = plant;
                }
            }
        }
        this.target = closest;
    }

    eat(target) {
        if (!target.isAlive) return;
        if (target instanceof Plant) {
            this.energy = Math.min(this.maxEnergy, this.energy + target.energy);
            target.remove();
            const idx = plants.indexOf(target);
            if (idx > -1) plants.splice(idx, 1);
        } else {
            
            this.energy = Math.min(this.maxEnergy, this.energy + target.energy);
            target.die();
        }
        this.target = null;
    }
}




function initSimulation() {
    plants = [];
    herbivores = [];
    predators = [];
    for (let i = 0; i < 15; i++) plants.push(new Plant(Math.random() * 100 - 50, Math.random() * 100 - 50));
    
    for (let i = 0; i < 2; i++) herbivores.push(new Deer(Math.random() * 100 - 50, Math.random() * 100 - 50, 90 + Math.random() * 30));
    
    for (let i = 0; i < 2; i++) herbivores.push(new Hare(Math.random() * 100 - 50, Math.random() * 100 - 50, 60 + Math.random() * 20));
    
    for (let i = 0; i < 2; i++) predators.push(new Wolf(Math.random() * 100 - 50, Math.random() * 100 - 50, 110 + Math.random() * 40));
    
    for (let i = 0; i < 2; i++) predators.push(new Bear(Math.random() * 100 - 50, Math.random() * 100 - 50, 150 + Math.random() * 50));
    generateCaves();
}

function updateSimulation(deltaTime) {
    if (simulationPaused) return;
    for (let i = herbivores.length-1; i >= 0; i--) {
        herbivores[i].update(deltaTime);
        
        if (herbivores[i].isAlive === null) herbivores.splice(i,1);
    }
    for (let i = predators.length-1; i >= 0; i--) {
        predators[i].update(deltaTime);
        if (predators[i].isAlive === null) predators.splice(i,1);
    }
    if (plants.length < 100) {
        let free = true;
        const x = Math.random() * 100 - 50, z = Math.random() * 100 - 50;
        for (const p of plants) if (p.position.distanceTo(new THREE.Vector3(x,0,z)) < 2) { free = false; break; }
        if (free) plants.push(new Plant(x, z));
    }
    simulationTime += deltaTime;
}




function initUI() {
    deerCountEl = document.getElementById('deer-count');
    hareCountEl = document.getElementById('hare-count');
    wolfCountEl = document.getElementById('wolf-count');
    bearCountEl = document.getElementById('bear-count');
    pauseBtn = document.getElementById('pause-btn');
    resetBtn = document.getElementById('reset-btn');
    addDeerBtn = document.getElementById('add-deer-btn');
    addHareBtn = document.getElementById('add-hare-btn');
    addWolfBtn = document.getElementById('add-wolf-btn');
    addBearBtn = document.getElementById('add-bear-btn');
    speedSlider = document.getElementById('speed-slider');
    speedValueEl = document.getElementById('speed-value');
    fpsCounterEl = document.getElementById('fps-counter');
    objectCountEl = document.getElementById('object-count');
    timeCounterEl = document.getElementById('time-counter');
    chartModal = document.getElementById('chart-modal');
    const fullsizeCanvas = document.getElementById('fullsize-chart');
    if (fullsizeCanvas) {
        fullsizeChartCtx = fullsizeCanvas.getContext('2d');
    }
    openChartBtn = document.getElementById('open-chart-btn');
    closeChartBtn = document.getElementById('close-chart-btn');
    if (openChartBtn && closeChartBtn) {
        openChartBtn.addEventListener('click', openChartModal);
        closeChartBtn.addEventListener('click', closeChartModal);
    }

    
    creatureInfoPanel = document.getElementById('creature-info-panel');
    closeCreatureInfoBtn = document.getElementById('close-creature-info');
    creatureTypeEl = document.getElementById('creature-type');
    creatureSubtypeEl = document.getElementById('creature-subtype');
    creatureEnergyEl = document.getElementById('creature-energy');
    creatureSpeedEl = document.getElementById('creature-speed');
    creatureStateEl = document.getElementById('creature-state');
    creaturePositionEl = document.getElementById('creature-position');
    creatureTargetEl = document.getElementById('creature-target');
    if (closeCreatureInfoBtn) {
        closeCreatureInfoBtn.addEventListener('click', () => {
            creatureInfoPanel.style.display = 'none';
        });
    }

    
    const dragHandle = creatureInfoPanel.querySelector('.drag-handle');
    const header = creatureInfoPanel.querySelector('h3');
    const draggableElements = [dragHandle, header];
    
    draggableElements.forEach(el => {
        if (!el) return;
        el.addEventListener('mousedown', startDrag);
        el.addEventListener('touchstart', startDragTouch);
    });

    function startDrag(e) {
        e.preventDefault();
        isDraggingCreaturePanel = true;
        const rect = creatureInfoPanel.getBoundingClientRect();
        dragOffsetX = e.clientX - rect.left;
        dragOffsetY = e.clientY - rect.top;
        document.addEventListener('mousemove', onDrag);
        document.addEventListener('mouseup', stopDrag);
        creatureInfoPanel.style.cursor = 'grabbing';
    }

    function startDragTouch(e) {
        if (e.touches.length !== 1) return;
        e.preventDefault();
        isDraggingCreaturePanel = true;
        const touch = e.touches[0];
        const rect = creatureInfoPanel.getBoundingClientRect();
        dragOffsetX = touch.clientX - rect.left;
        dragOffsetY = touch.clientY - rect.top;
        document.addEventListener('touchmove', onDragTouch);
        document.addEventListener('touchend', stopDragTouch);
        creatureInfoPanel.style.cursor = 'grabbing';
    }

    function onDrag(e) {
        if (!isDraggingCreaturePanel) return;
        e.preventDefault();
        let x = e.clientX - dragOffsetX;
        let y = e.clientY - dragOffsetY;
        
        const maxX = window.innerWidth - creatureInfoPanel.offsetWidth;
        const maxY = window.innerHeight - creatureInfoPanel.offsetHeight;
        x = Math.max(0, Math.min(x, maxX));
        y = Math.max(0, Math.min(y, maxY));
        creatureInfoPanel.style.left = x + 'px';
        creatureInfoPanel.style.top = y + 'px';
        creatureInfoPanel.style.right = 'auto';
    }

    function onDragTouch(e) {
        if (!isDraggingCreaturePanel || e.touches.length !== 1) return;
        e.preventDefault();
        const touch = e.touches[0];
        let x = touch.clientX - dragOffsetX;
        let y = touch.clientY - dragOffsetY;
        const maxX = window.innerWidth - creatureInfoPanel.offsetWidth;
        const maxY = window.innerHeight - creatureInfoPanel.offsetHeight;
        x = Math.max(0, Math.min(x, maxX));
        y = Math.max(0, Math.min(y, maxY));
        creatureInfoPanel.style.left = x + 'px';
        creatureInfoPanel.style.top = y + 'px';
        creatureInfoPanel.style.right = 'auto';
    }

    function stopDrag() {
        isDraggingCreaturePanel = false;
        document.removeEventListener('mousemove', onDrag);
        document.removeEventListener('mouseup', stopDrag);
        creatureInfoPanel.style.cursor = '';
    }

    function stopDragTouch() {
        isDraggingCreaturePanel = false;
        document.removeEventListener('touchmove', onDragTouch);
        document.removeEventListener('touchend', stopDragTouch);
        creatureInfoPanel.style.cursor = '';
    }

    pauseBtn.addEventListener('click', togglePause);
    resetBtn.addEventListener('click', resetSimulation);
    addDeerBtn.addEventListener('click', () => activatePlacementMode('deer'));
    addHareBtn.addEventListener('click', () => activatePlacementMode('hare'));
    addWolfBtn.addEventListener('click', () => activatePlacementMode('wolf'));
    addBearBtn.addEventListener('click', () => activatePlacementMode('bear'));
    speedSlider.addEventListener('input', updateSimulationSpeed);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    renderer.domElement.addEventListener('click', handleCanvasClick);
    
    renderer.domElement.addEventListener('wheel', handleWheel);
    setInterval(updateUI, 100);
    
}

function togglePause() {
    simulationPaused = !simulationPaused;
    pauseBtn.innerHTML = simulationPaused ? '▶️ Продолжить' : '⏸️ Пауза';
    if (controls) controls.enabled = !simulationPaused;
}

function resetSimulation() {
    plants.forEach(p => p.remove());
    herbivores.forEach(h => h.die());
    predators.forEach(p => p.die());
    caves.forEach(c => c.remove());
    plants = []; herbivores = []; predators = []; caves = [];
    populationHistory = {
        plants: [],
        herbivores: [],
        predators: [],
        deer: [],
        hare: [],
        wolf: [],
        bear: []
    };
    simulationTime = 0;
    initSimulation();
    simulationPaused = false;
    pauseBtn.innerHTML = '⏸️ Пауза';
}

function updateSimulationSpeed() {
    simulationSpeed = parseFloat(speedSlider.value);
    speedValueEl.textContent = simulationSpeed.toFixed(1) + 'x';
}

function handleKeyDown(event) {
    if (event.code === 'Space' || event.code === 'KeyP') {
        event.preventDefault();
        togglePause();
    } else if (event.code === 'KeyR' && event.ctrlKey) {
        resetSimulation();
    } else if (event.code === 'Escape' && placementMode) {
        deactivatePlacementMode();
    }
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE'].includes(event.code)) {
        keysPressed[event.code] = true;
        event.preventDefault();
    }
}

function handleKeyUp(event) {
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE'].includes(event.code)) {
        keysPressed[event.code] = false;
        event.preventDefault();
    }
}

function handleWheel(event) {
    event.preventDefault();
    const delta = event.deltaY > 0 ? 1 : -1;
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.normalize();
    
    const minDistance = 10;
    const maxDistance = 80;
    const currentDistance = camera.position.length();
    let newDistance = currentDistance + delta * CAMERA_ZOOM_SPEED;
    newDistance = Math.max(minDistance, Math.min(maxDistance, newDistance));
    
    
    const direction = camera.getWorldDirection(new THREE.Vector3()).negate(); 
    const target = controls ? controls.target : new THREE.Vector3(0, 0, 0);
    const currentOffset = camera.position.clone().sub(target);
    const currentDist = currentOffset.length();
    const newOffset = currentOffset.normalize().multiplyScalar(newDistance);
    camera.position.copy(target).add(newOffset);
    
    if (controls) {
        controls.target.copy(target);
        controls.update();
    }
}

function handleCanvasClick(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    const mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);
    
    
    if (placementMode) {
        const intersects = raycaster.intersectObject(ground);
        if (intersects.length === 0) return;
        const point = intersects[0].point;
        createEntityAtPosition(point.x, point.z);
        return;
    }
    
    
    const allMeshes = [];
    herbivores.forEach(h => { if (h.mesh) allMeshes.push(h.mesh); });
    predators.forEach(p => { if (p.mesh) allMeshes.push(p.mesh); });
    plants.forEach(p => { if (p.mesh) allMeshes.push(p.mesh); });
    
    const intersects = raycaster.intersectObjects(allMeshes);
    if (intersects.length > 0) {
        
        const clickedMesh = intersects[0].object;
        
        let creature = null;
        for (let h of herbivores) {
            if (h.mesh === clickedMesh) { creature = h; break; }
        }
        if (!creature) {
            for (let p of predators) {
                if (p.mesh === clickedMesh) { creature = p; break; }
            }
        }
        if (!creature) {
            for (let p of plants) {
                if (p.mesh === clickedMesh) { creature = p; break; }
            }
        }
        if (creature) {
            showCreatureInfo(creature);
            return;
        }
    }
    
    
    const intersectsGround = raycaster.intersectObject(ground);
    if (intersectsGround.length === 0) return;
    const point = intersectsGround[0].point;
    if (event.shiftKey) {
        predators.push(new Predator(point.x, point.z, 120));
    } else if (event.ctrlKey || event.metaKey) {
        plants.push(new Plant(point.x, point.z));
    } else {
        
        
    }
}

function showCreatureInfo(creature) {
    if (!creatureInfoPanel) {
        return;
    }
    
    creatureTypeEl.textContent = creature.type === 'herbivore' ? 'Травоядное' : 'Хищник';
    creatureSubtypeEl.textContent = creature.subtype || 'обычный';
    creatureEnergyEl.textContent = Math.round(creature.energy) + ' / ' + creature.maxEnergy;
    creatureSpeedEl.textContent = creature.speed.toFixed(2);
    creatureStateEl.textContent = creature.isAlive ? (creature.isAlive === true ? 'Живое' : 'Мёртвое') : 'Мёртвое';
    creaturePositionEl.textContent = `(${creature.position.x.toFixed(1)}, ${creature.position.y.toFixed(1)}, ${creature.position.z.toFixed(1)})`;
    creatureTargetEl.textContent = creature.target ? 'Есть' : 'Нет';
    
    creatureInfoPanel.style.display = 'block';
    selectedCreature = creature;
}

function updateUI() {
    
    let deerCount = 0, hareCount = 0, wolfCount = 0, bearCount = 0;
    for (let herb of herbivores) {
        if (herb.subtype === 'deer') deerCount++;
        else if (herb.subtype === 'hare') hareCount++;
    }
    for (let pred of predators) {
        if (pred.subtype === 'wolf') wolfCount++;
        else if (pred.subtype === 'bear') bearCount++;
    }
    deerCountEl.textContent = deerCount;
    hareCountEl.textContent = hareCount;
    wolfCountEl.textContent = wolfCount;
    bearCountEl.textContent = bearCount;
    fpsCounterEl.textContent = stats ? Math.round(stats.fps) : 60;
    objectCountEl.textContent = plants.length + herbivores.length + predators.length;
    timeCounterEl.textContent = Math.round(simulationTime);
    if (frameCount % 30 === 0) updatePopulationHistory();
}




function updatePopulationHistory() {
    if (!populationHistory.deer) {
        populationHistory.deer = [];
        populationHistory.hare = [];
        populationHistory.wolf = [];
        populationHistory.bear = [];
    }
    populationHistory.plants.push(plants.length);
    populationHistory.herbivores.push(herbivores.length);
    populationHistory.predators.push(predators.length);
    
    let deerCount = 0, hareCount = 0, wolfCount = 0, bearCount = 0;
    for (let herb of herbivores) {
        if (herb.subtype === 'deer') deerCount++;
        else if (herb.subtype === 'hare') hareCount++;
    }
    for (let pred of predators) {
        if (pred.subtype === 'wolf') wolfCount++;
        else if (pred.subtype === 'bear') bearCount++;
    }
    populationHistory.deer.push(deerCount);
    populationHistory.hare.push(hareCount);
    populationHistory.wolf.push(wolfCount);
    populationHistory.bear.push(bearCount);
    
    if (populationHistory.plants.length > HISTORY_LENGTH) {
        populationHistory.plants.shift();
        populationHistory.herbivores.shift();
        populationHistory.predators.shift();
        populationHistory.deer.shift();
        populationHistory.hare.shift();
        populationHistory.wolf.shift();
        populationHistory.bear.shift();
    }
}

function openChartModal() {
    if (!chartModal) {
        return;
    }
    chartModal.style.display = 'flex';
    drawFullSizeChart();
    
    if (chartUpdateInterval) clearInterval(chartUpdateInterval);
    chartUpdateInterval = setInterval(drawFullSizeChart, 500);
}

function closeChartModal() {
    if (chartModal) chartModal.style.display = 'none';
    
    if (chartUpdateInterval) {
        clearInterval(chartUpdateInterval);
        chartUpdateInterval = null;
    }
}

function drawFullSizeChart() {
    if (!fullsizeChartCtx) {
        console.warn('fullsizeChartCtx отсутствует');
        return;
    }
    const canvas = document.getElementById('fullsize-chart');
    if (!canvas) {
        console.warn('canvas fullsize-chart не найден');
        return;
    }
    // Используем offsetWidth/offsetHeight, которые включают padding и border
    const width = canvas.offsetWidth || 900;
    const height = canvas.offsetHeight || 500;
    if (width <= 0 || height <= 0) {
        console.warn('canvas имеет нулевые размеры:', width, height);
        return;
    }
    canvas.width = width;
    canvas.height = height;
    const ctx = fullsizeChartCtx;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(20,20,30,0.95)';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(100,100,120,0.3)';
    for (let i = 0; i <= 10; i++) {
        const y = i * height / 10;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }
    const drawLine = (data, color, maxVal) => {
        if (data.length < 2) {
            console.log('Недостаточно данных для рисования линии:', color, data.length);
            return;
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i < data.length; i++) {
            const x = i * width / (data.length - 1);
            const y = height - (data[i] / maxVal) * height * 0.9;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    };
    
    const allData = [
        ...populationHistory.deer,
        ...populationHistory.hare,
        ...populationHistory.wolf,
        ...populationHistory.bear
    ];
    const maxVal = allData.length > 0 ? Math.max(...allData, 1) : 1;
    
    console.log('Данные для графика:', {
        deer: populationHistory.deer.length,
        hare: populationHistory.hare.length,
        wolf: populationHistory.wolf.length,
        bear: populationHistory.bear.length,
        maxVal,
        canvasSize: { width, height }
    });
    
    drawLine(populationHistory.deer, '#8B4513', maxVal);
    drawLine(populationHistory.hare, '#808080', maxVal);
    drawLine(populationHistory.wolf, '#666666', maxVal);
    drawLine(populationHistory.bear, '#654321', maxVal);
    
    ctx.font = '14px Arial';
    ctx.fillStyle = '#8B4513';
    ctx.fillText('Олени', 20, 25);
    ctx.fillStyle = '#808080';
    ctx.fillText('Зайцы', 100, 25);
    ctx.fillStyle = '#666666';
    ctx.fillText('Волки', 180, 25);
    ctx.fillStyle = '#654321';
    ctx.fillText('Медведи', 260, 25);
}




function updateCamera(deltaTime) {
    if (!camera) return;
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3();
    right.crossVectors(camera.up, forward).normalize();
    const moveSpeed = CAMERA_MOVE_SPEED * deltaTime;
    const pitchSpeed = CAMERA_PITCH_SPEED * deltaTime;
    if (keysPressed['KeyA']) camera.position.addScaledVector(right, moveSpeed);
    if (keysPressed['KeyD']) camera.position.addScaledVector(right, -moveSpeed);
    if (keysPressed['KeyW']) camera.position.addScaledVector(forward, moveSpeed);
    if (keysPressed['KeyS']) camera.position.addScaledVector(forward, -moveSpeed);
    if (keysPressed['KeyQ'] || keysPressed['KeyE']) {
        const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
        if (keysPressed['KeyQ']) euler.x += pitchSpeed;
        if (keysPressed['KeyE']) euler.x -= pitchSpeed;
        euler.x = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, euler.x));
        camera.quaternion.setFromEuler(euler);
    }
    if (controls) {
        const forwardWithY = new THREE.Vector3();
        camera.getWorldDirection(forwardWithY);
        controls.target.copy(camera.position).add(forwardWithY.multiplyScalar(10));
    }
}




function animate(currentTime) {
    requestAnimationFrame(animate);
    if (stats) stats.begin();
    const deltaTime = lastTime ? Math.min(0.033, (currentTime - lastTime) / 1000) : 0.016;
    lastTime = currentTime;
    updateCamera(deltaTime);
    updateSimulation(deltaTime * simulationSpeed);
    if (controls) controls.update();
    renderer.render(scene, camera);
    frameCount++;
    if (stats) stats.end();
}

function init() {
    try {
        initThreeJS();
        initSimulation();
        initUI();
        
        setTimeout(() => {
            if (herbivores.length > 0 && creatureInfoPanel) {
                showCreatureInfo(herbivores[0]);
            }
        }, 1000);
        animate(0);
    } catch (error) {
        alert('Ошибка: ' + error.message);
    }
}

if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', init);
else setTimeout(init, 0);