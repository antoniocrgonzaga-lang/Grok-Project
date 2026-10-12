import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLORS } from './Config.js';
import { makeCanvasTexture, mulberry32, neon, disposeObject } from './Utils.js';
import { getGlowTexture } from './ShipModel.js';

// Parque de diversões de fundo (pista "Carnaval Lunar").
// Coordenadas locais: chão em y = 0, +z aponta para a pista, então a frente
// da montanha-russa (o looping) e da roda-gigante fica de frente para os pilotos.

// Montanha-russa: estação, subida, queda, looping vertical, morros e retorno.
const COASTER_POINTS = [
  [-220, 14, 70], [-140, 14, 70], [-80, 60, 70], [-20, 150, 70], [20, 152, 68], [60, 70, 64], [95, 16, 58],
  [150, 16, 54], [182, 29, 52], [196, 62, 49], [182, 95, 46], [150, 108, 44], [118, 95, 41], [104, 62, 39], [118, 29, 36], [150, 16, 34],
  [205, 16, 30], [250, 34, 0], [262, 72, -50], [225, 92, -95], [160, 50, -110], [90, 84, -112], [20, 36, -110],
  [-60, 66, -120], [-130, 30, -95], [-200, 24, -40], [-245, 16, 20],
];
// Trecho da subida com corrente (índices dos pontos acima): o trem sobe devagar.
const LIFT_FROM = 1;
const LIFT_TO = 4;
const COASTER_SAMPLES = 520;
const RAIL_GAUGE = 1.3;
const TRAIN_CARS = 6;
const CAR_SPACING = 5.4;
const GRAVITY = 9.8;
// Escala do parque inteiro no mundo (as medidas abaixo estão em unidades locais).
const PARK_SCALE = 1.3;

const WHEEL = { x: 375, z: -10, hub: 88, radius: 70, gondolas: 16 };
const CAROUSEL = { x: -330, z: 60, radius: 26 };
const TOWER = { x: -330, z: -110, height: 190 };
const TENTS = [{ x: 60, z: -200, r: 30 }, { x: -140, z: -210, r: 26 }];
const SIGN = { x: 40, z: 125, width: 150, height: 30, elevation: 40 };
const STRING_Z = 155;

const _up = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _t = new THREE.Vector3();
const _n = new THREE.Vector3();
const _b = new THREE.Vector3();
const _back = new THREE.Vector3();

// Caixa fina ligando os pontos a e b (pilares, treliças, mastros).
function beam(a, b, thickness) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.BoxGeometry(thickness, len, thickness).translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(_up, dir.normalize()));
  return g.translate(a.x, a.y, a.z);
}

function dashTexture(lit = 0.45, base = '#141019') {
  return makeCanvasTexture(64, 8, (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w * lit, h);
  }, { repeat: true });
}

function stripeTexture(colorA, colorB, stripes) {
  return makeCanvasTexture(256, 64, (ctx, w, h) => {
    const step = w / stripes;
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 ? colorA : colorB;
      ctx.fillRect(i * step, 0, step + 1, h);
    }
  }, { repeat: true });
}

function signTexture() {
  return makeCanvasTexture(1024, 200, (ctx, w, h) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    // Moldura de lâmpadas.
    for (let x = 16; x < w; x += 32) {
      for (const y of [12, h - 12]) {
        ctx.fillStyle = (x / 32) % 2 < 1 ? '#ffd23f' : '#ff2bd6';
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const grad = ctx.createLinearGradient(0, 40, 0, 160);
    grad.addColorStop(0, '#fff3b0');
    grad.addColorStop(0.5, '#ffb020');
    grad.addColorStop(1, '#ff2bd6');
    ctx.fillStyle = grad;
    ctx.textAlign = 'center';
    ctx.font = 'italic 900 112px Impact, "Arial Black", sans-serif';
    ctx.fillText('CARNAVAL LUNAR', w / 2, 142);
  });
}

// Referenciais com transporte paralelo: a "normal" acompanha o trilho por dentro do looping
// sem girar sozinha, como num trilho de verdade. A torção que sobra ao fechar o circuito é
// distribuída ao longo do percurso.
function coasterFrames(points) {
  const n = points.length;
  const T = [];
  const N = [];
  for (let i = 0; i < n; i++) T.push(new THREE.Vector3().subVectors(points[(i + 1) % n], points[(i - 1 + n) % n]).normalize());
  N.push(_up.clone().addScaledVector(T[0], -_up.dot(T[0])).normalize());
  const axis = new THREE.Vector3();
  for (let i = 1; i < n; i++) {
    const next = N[i - 1].clone();
    axis.crossVectors(T[i - 1], T[i]);
    const sin = axis.length();
    if (sin > 1e-6) next.applyAxisAngle(axis.normalize(), Math.atan2(sin, T[i - 1].dot(T[i])));
    next.addScaledVector(T[i], -next.dot(T[i])).normalize();
    N.push(next);
  }
  const closing = N[n - 1].clone();
  axis.crossVectors(T[n - 1], T[0]);
  const sin = axis.length();
  if (sin > 1e-6) closing.applyAxisAngle(axis.normalize(), Math.atan2(sin, T[n - 1].dot(T[0])));
  const twist = Math.atan2(new THREE.Vector3().crossVectors(closing, N[0]).dot(T[0]), closing.dot(N[0]));
  for (let i = 0; i < n; i++) N[i].applyAxisAngle(T[i], (twist * i) / n);
  const B = T.map((t, i) => new THREE.Vector3().crossVectors(t, N[i]).normalize());
  return { T, N, B };
}

export class AmusementPark {
  constructor(quality) {
    this.quality = quality;
    this.group = new THREE.Group();
    this.group.name = 'amusement-park';
    this.group.scale.setScalar(PARK_SCALE);
    // Áreas ocupadas (x, z, raio) em coordenadas locais, usadas para posicionar o parque longe da pista.
    this.anchors = [];
    this.animated = {};
    this._rand = mulberry32(2024);

    this._buildGround();
    this._buildCoaster();
    this._buildFerrisWheel();
    this._buildCarousel();
    this._buildDropTower();
    this._buildTents();
    this._buildSign();
    this._buildBulbStrings();
  }

  // Posiciona o parque e o vira para que a frente (+z local) aponte para `lookAt`.
  place(x, y, z, lookAtX, lookAtZ) {
    this.group.position.set(x, y, z);
    this.group.rotation.y = Math.atan2(lookAtX - x, lookAtZ - z);
    this.group.updateMatrixWorld(true);
  }

  // Âncoras em coordenadas de mundo para uma posição/rotação candidata.
  worldAnchors(x, z, rotationY) {
    const c = Math.cos(rotationY);
    const s = Math.sin(rotationY);
    const k = PARK_SCALE;
    return this.anchors.map((a) => ({ x: x + (a.x * c + a.z * s) * k, z: z + (-a.x * s + a.z * c) * k, r: a.r * k }));
  }

  update(dt, time) {
    const a = this.animated;
    a.railTex.offset.x -= dt * 0.9;
    a.rimTex.offset.x -= dt * 0.35;
    a.carouselRimTex.offset.x += dt * 0.5;
    this._updateTrain(dt);
    this._updateWheel(time);
    this._updateCarousel(dt, time);
    this._updateTower(time);
    a.towerBeacon.visible = Math.sin(time * 4) > 0;
  }

  dispose() {
    disposeObject(this.group);
  }

  _anchor(x, z, r) {
    this.anchors.push({ x, z, r });
  }

  _glowPool(x, z, size, color, opacity) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        map: getGlowTexture(), color: neon(color, 1), transparent: true, opacity,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      }),
    );
    mesh.position.set(x, 0.6, z);
    this.group.add(mesh);
  }

  _buildGround() {
    // Praça escura sob o parque, para a grade neon do chão não atravessar as atrações.
    const plaza = new THREE.Mesh(
      new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2).scale(470, 1, 260).translate(40, 0.3, -40),
      new THREE.MeshStandardMaterial({ color: 0x0b0a1c, roughness: 0.9, metalness: 0.1 }),
    );
    this.group.add(plaza);
    this._glowPool(150, 60, 220, COLORS.magenta, 0.35);
    this._glowPool(WHEEL.x, WHEEL.z + 20, 240, COLORS.yellow, 0.3);
    this._glowPool(CAROUSEL.x, CAROUSEL.z, 150, COLORS.orange, 0.4);
    this._glowPool(-180, 70, 140, COLORS.cyan, 0.3);
  }

  _buildCoaster() {
    const quality = this.quality;
    const curve = new THREE.CatmullRomCurve3(COASTER_POINTS.map((p) => new THREE.Vector3(...p)), true, 'centripetal');
    curve.arcLengthDivisions = 3000;
    const length = curve.getLength();
    const pts = curve.getSpacedPoints(COASTER_SAMPLES).slice(0, COASTER_SAMPLES);
    const { T, N, B } = coasterFrames(pts);
    this.coaster = { length, pts, T, N, B, s: 0, v: 9 };

    // Faixa da subida com corrente, em fração do comprimento.
    const lengths = curve.getLengths();
    const fraction = (index) => lengths[Math.round((index / COASTER_POINTS.length) * (lengths.length - 1))] / length;
    this.coaster.liftFrom = fraction(LIFT_FROM);
    this.coaster.liftTo = fraction(LIFT_TO);
    this.coaster.top = Math.max(...pts.map((p) => p.y));

    const railCurve = (side) => new THREE.CatmullRomCurve3(pts.map((p, i) => p.clone().addScaledVector(B[i], side * RAIL_GAUGE)), true);
    const spineCurve = new THREE.CatmullRomCurve3(pts.map((p, i) => p.clone().addScaledVector(N[i], -1.1)), true);

    // Trilho sempre aceso em tom mais baixo, com pulsos de luz correndo por cima.
    const railTex = dashTexture(0.3, '#5a5470');
    railTex.repeat.set(Math.round(length / 5), 1);
    this.animated.railTex = railTex;
    const segments = COASTER_SAMPLES + 80;
    const railL = new THREE.Mesh(new THREE.TubeGeometry(railCurve(-1), segments, 0.6, 5, true), new THREE.MeshBasicMaterial({ map: railTex, color: neon(COLORS.magenta, 2.0), toneMapped: false }));
    const railR = new THREE.Mesh(new THREE.TubeGeometry(railCurve(1), segments, 0.6, 5, true), new THREE.MeshBasicMaterial({ map: railTex, color: neon(COLORS.cyan, 1.8), toneMapped: false }));
    const structure = new THREE.MeshStandardMaterial({ color: 0x241a44, roughness: 0.6, metalness: 0.5 });
    const spine = new THREE.Mesh(new THREE.TubeGeometry(spineCurve, segments, 0.7, 6, true), structure);
    this.group.add(railL, railR, spine);

    // Dormentes e pilares (instanciados).
    const ties = [];
    for (let i = 0; i < pts.length; i += 2) {
      _back.copy(T[i]).negate();
      _m.makeBasis(B[i], N[i], _back).setPosition(_p.copy(pts[i]).addScaledVector(N[i], -0.5));
      ties.push(_m.clone());
    }
    const tieMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(RAIL_GAUGE * 2 + 1, 0.3, 0.6), structure, ties.length);
    ties.forEach((m, i) => tieMesh.setMatrixAt(i, m));
    tieMesh.instanceMatrix.needsUpdate = true;
    this.group.add(tieMesh);

    const supportStep = quality.cityCount < 200 ? 12 : 7;
    const supports = [];
    const identity = new THREE.Quaternion();
    for (let i = 0; i < pts.length; i += supportStep) {
      const p = pts[i];
      if (N[i].y < 0.6 || p.y < 8) continue;
      const top = p.y - 1.6;
      supports.push(new THREE.Matrix4().compose(_p.set(p.x, top / 2, p.z), identity, _s.set(1.3, top, 1.3)));
      this._anchor(p.x, p.z, 12);
    }
    // Colunas laterais do looping.
    for (const [x, z] of [[104, 48], [196, 38]]) supports.push(new THREE.Matrix4().compose(_p.set(x, 31, z), identity, _s.set(2, 62, 2)));
    const supportMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), structure, supports.length);
    supports.forEach((m, i) => supportMesh.setMatrixAt(i, m));
    supportMesh.instanceMatrix.needsUpdate = true;
    this.group.add(supportMesh);
    for (let i = 0; i < pts.length; i += 20) this._anchor(pts[i].x, pts[i].z, 14);

    // Estação.
    const station = new THREE.Group();
    const roof = new THREE.Mesh(new THREE.BoxGeometry(70, 2, 16), structure);
    roof.position.set(-180, 26, 70);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(72, 0.6, 16.5), new THREE.MeshBasicMaterial({ color: neon(COLORS.yellow, 1.8), toneMapped: false }));
    trim.position.set(-180, 25, 70);
    station.add(roof, trim);
    for (const x of [-212, -180, -148]) station.add(new THREE.Mesh(beam(new THREE.Vector3(x, 0, 78), new THREE.Vector3(x, 25, 78), 1.2), structure));
    this.group.add(station);

    // Trem: carrinhos e faróis instanciados, atualizados a cada quadro.
    const carParts = [
      new THREE.BoxGeometry(3.4, 1.4, 4.4).translate(0, 1.2, 0),
      new THREE.BoxGeometry(3.4, 1.6, 0.5).translate(0, 2.4, 1.6),
    ];
    const carGeo = mergeGeometries(carParts);
    carParts.forEach((g) => g.dispose());
    this.trainCars = new THREE.InstancedMesh(carGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.5, emissive: 0x220a30 }), TRAIN_CARS);
    this.trainLights = new THREE.InstancedMesh(new THREE.BoxGeometry(3.6, 0.35, 0.35).translate(0, 0.6, -2.3), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), TRAIN_CARS);
    const carColors = [COLORS.yellow, COLORS.magenta, COLORS.cyan];
    for (let i = 0; i < TRAIN_CARS; i++) {
      this.trainCars.setColorAt(i, new THREE.Color(carColors[i % carColors.length]));
      this.trainLights.setColorAt(i, neon(i === 0 ? 0xffffff : carColors[i % carColors.length], 2.2));
    }
    this.trainCars.frustumCulled = false;
    this.trainLights.frustumCulled = false;
    this.group.add(this.trainCars, this.trainLights);
  }

  _updateTrain(dt) {
    const c = this.coaster;
    const u = c.s / c.length;
    const onLift = u >= c.liftFrom && u <= c.liftTo;
    const lead = this._samplePose(c.s);
    // Fora da subida, a velocidade segue a conservação de energia (desce rápido, sobe devagar).
    const target = onLift ? 9 : Math.sqrt(Math.max(36, 2 * GRAVITY * (c.top + 3 - lead.y)));
    c.v += (target - c.v) * Math.min(1, dt * 3);
    c.s = (c.s + c.v * dt) % c.length;
    for (let k = 0; k < TRAIN_CARS; k++) {
      const s = (c.s - k * CAR_SPACING + c.length) % c.length;
      this._samplePose(s, _m);
      this.trainCars.setMatrixAt(k, _m);
      this.trainLights.setMatrixAt(k, _m);
    }
    this.trainCars.instanceMatrix.needsUpdate = true;
    this.trainLights.instanceMatrix.needsUpdate = true;
  }

  // Posição (e, se pedido, matriz) a uma distância s ao longo da montanha-russa.
  _samplePose(s, out = null) {
    const c = this.coaster;
    const n = c.pts.length;
    const f = (s / c.length) * n;
    const i = Math.floor(f) % n;
    const j = (i + 1) % n;
    const t = f - Math.floor(f);
    _p.lerpVectors(c.pts[i], c.pts[j], t);
    if (!out) return _p;
    _t.lerpVectors(c.T[i], c.T[j], t).normalize();
    _n.lerpVectors(c.N[i], c.N[j], t).normalize();
    _b.crossVectors(_t, _n).normalize();
    _back.copy(_t).negate();
    out.makeBasis(_b, _n, _back).setPosition(_p);
    return _p;
  }

  _buildFerrisWheel() {
    const { x, z, hub, radius, gondolas } = WHEEL;
    const frame = new THREE.MeshStandardMaterial({ color: 0x2a1d50, roughness: 0.6, metalness: 0.5 });
    const rimTex = dashTexture(0.5);
    rimTex.repeat.set(48, 1);
    this.animated.rimTex = rimTex;
    const rimMat = new THREE.MeshBasicMaterial({ map: rimTex, color: neon(COLORS.yellow, 2.0), toneMapped: false });

    const wheel = new THREE.Group();
    wheel.position.set(x, hub, z);
    for (const dz of [-3.5, 3.5]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.7, 6, 96), rimMat);
      rim.position.z = dz;
      const inner = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.42, 0.45, 6, 48), new THREE.MeshBasicMaterial({ color: neon(COLORS.cyan, 1.6), toneMapped: false }));
      inner.position.z = dz;
      wheel.add(rim, inner);
    }
    const spokes = [];
    for (let i = 0; i < gondolas; i++) {
      const a = (i / gondolas) * Math.PI * 2;
      for (const dz of [-3.5, 3.5]) {
        spokes.push(beam(new THREE.Vector3(0, 0, dz), new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, dz), 0.6));
      }
    }
    wheel.add(new THREE.Mesh(mergeGeometries(spokes), new THREE.MeshBasicMaterial({ color: neon(COLORS.purple, 0.9), toneMapped: false })));
    spokes.forEach((g) => g.dispose());
    wheel.add(new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 10, 12).rotateX(Math.PI / 2), frame));
    this.group.add(wheel);
    this.wheel = wheel;

    const legs = [];
    const top = new THREE.Vector3(x, hub, z);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) legs.push(beam(new THREE.Vector3(x + sx * 34, 0, z + sz * 9), top.clone().setZ(z + sz * 5), 2.2));
    }
    this.group.add(new THREE.Mesh(mergeGeometries(legs), frame));
    legs.forEach((g) => g.dispose());

    const gondolaParts = [
      new THREE.BoxGeometry(5.5, 4.5, 5).translate(0, -4.2, 0),
      new THREE.BoxGeometry(6.2, 0.6, 5.6).translate(0, -1.8, 0),
      new THREE.BoxGeometry(0.4, 2, 0.4).translate(0, -0.9, 0),
    ];
    const gondolaGeo = mergeGeometries(gondolaParts);
    gondolaParts.forEach((g) => g.dispose());
    this.gondolas = new THREE.InstancedMesh(gondolaGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), gondolas);
    const palette = [COLORS.magenta, COLORS.yellow, COLORS.cyan, COLORS.orange, COLORS.purple, COLORS.blue];
    for (let i = 0; i < gondolas; i++) this.gondolas.setColorAt(i, neon(palette[i % palette.length], 1.25));
    this.gondolas.frustumCulled = false;
    this.group.add(this.gondolas);

    for (let i = -2; i <= 2; i++) this._anchor(x + i * 30, z, 22);
  }

  _updateWheel(time) {
    const { x, z, hub, radius, gondolas } = WHEEL;
    const angle = time * 0.07;
    this.wheel.rotation.z = angle;
    _q.identity();
    _s.set(1, 1, 1);
    for (let i = 0; i < gondolas; i++) {
      const a = angle + (i / gondolas) * Math.PI * 2;
      // As cabines ficam sempre na vertical, penduradas no aro.
      _m.compose(_p.set(x + Math.cos(a) * radius, hub + Math.sin(a) * radius, z), _q, _s);
      this.gondolas.setMatrixAt(i, _m);
    }
    this.gondolas.instanceMatrix.needsUpdate = true;
  }

  _buildCarousel() {
    const { x, z, radius } = CAROUSEL;
    const carousel = new THREE.Group();
    carousel.position.set(x, 0, z);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius + 1, 3, 32).translate(0, 1.5, 0), new THREE.MeshStandardMaterial({ color: 0x2a1240, roughness: 0.5, metalness: 0.4 }));
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 18, 12).translate(0, 10, 0), new THREE.MeshBasicMaterial({ color: neon(COLORS.yellow, 1.3), toneMapped: false }));
    const roofTex = stripeTexture('#ff2bd6', '#ffd23f', 16);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(radius + 4, 14, 32, 1, true).translate(0, 25, 0), new THREE.MeshBasicMaterial({ map: roofTex, color: new THREE.Color(0.75, 0.75, 0.75), side: THREE.DoubleSide }));
    const rimTex = dashTexture(0.5);
    rimTex.repeat.set(24, 1);
    this.animated.carouselRimTex = rimTex;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(radius + 4, 0.6, 6, 64).rotateX(Math.PI / 2).translate(0, 18, 0), new THREE.MeshBasicMaterial({ map: rimTex, color: neon(COLORS.orange, 2.0), toneMapped: false }));
    const baseRim = new THREE.Mesh(new THREE.TorusGeometry(radius + 0.6, 0.4, 6, 64).rotateX(Math.PI / 2).translate(0, 3, 0), new THREE.MeshBasicMaterial({ color: neon(COLORS.cyan, 1.6), toneMapped: false }));
    carousel.add(base, pole, roof, rim, baseRim);

    const horseParts = [
      new THREE.BoxGeometry(1.6, 1.8, 4.2),
      new THREE.BoxGeometry(1.2, 2.4, 1.2).translate(0, 1.4, -1.8),
      new THREE.CylinderGeometry(0.15, 0.15, 14, 6).translate(0, 4, 0),
    ];
    const horseGeo = mergeGeometries(horseParts);
    horseParts.forEach((g) => g.dispose());
    this.horses = new THREE.InstancedMesh(horseGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.3, emissive: 0x1a0820 }), 12);
    this.horses.frustumCulled = false;
    const palette = [0xf2e6ff, 0xffd23f, 0xff8fe0, 0x7fe9ff];
    for (let i = 0; i < 12; i++) this.horses.setColorAt(i, new THREE.Color(palette[i % palette.length]));
    carousel.add(this.horses);
    this.carousel = carousel;
    this.group.add(carousel);
    this._anchor(x, z, radius + 8);
  }

  _updateCarousel(dt, time) {
    this.carousel.rotation.y += dt * 0.35;
    _q.identity();
    _s.set(1, 1, 1);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r = CAROUSEL.radius * (i % 2 ? 0.55 : 0.8);
      _q.setFromAxisAngle(_up, -a);
      _m.compose(_p.set(Math.cos(a) * r, 7 + Math.sin(time * 2 + i * 1.3) * 1.2, Math.sin(a) * r), _q, _s);
      this.horses.setMatrixAt(i, _m);
    }
    this.horses.instanceMatrix.needsUpdate = true;
  }

  _buildDropTower() {
    const { x, z, height } = TOWER;
    const frame = new THREE.MeshStandardMaterial({ color: 0x1d1838, roughness: 0.6, metalness: 0.5 });
    this.group.add(new THREE.Mesh(new THREE.BoxGeometry(6, height, 6).translate(x, height / 2, z), frame));
    const edges = [];
    for (const [dx, dz] of [[-3.2, -3.2], [3.2, -3.2], [-3.2, 3.2], [3.2, 3.2]]) edges.push(new THREE.BoxGeometry(0.5, height, 0.5).translate(x + dx, height / 2, z + dz));
    this.group.add(new THREE.Mesh(mergeGeometries(edges), new THREE.MeshBasicMaterial({ color: neon(COLORS.cyan, 1.5), toneMapped: false })));
    edges.forEach((g) => g.dispose());
    this.group.add(new THREE.Mesh(new THREE.BoxGeometry(12, 6, 12).translate(x, height + 3, z), frame));
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.8, 8, 6).translate(x, height + 8, z), new THREE.MeshBasicMaterial({ color: neon(COLORS.red, 2.6), toneMapped: false }));
    this.group.add(beacon);
    this.animated.towerBeacon = beacon;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(8, 1.3, 8, 32).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: neon(COLORS.magenta, 2.0), toneMapped: false }));
    ring.position.set(x, 10, z);
    this.towerRing = ring;
    this.group.add(ring);
    this._anchor(x, z, 14);
  }

  _updateTower(time) {
    // Sobe devagar, espera lá em cima e despenca.
    const t = (time % 14) / 14;
    const top = TOWER.height - 12;
    let y;
    if (t < 0.55) y = 10 + (top - 10) * (t / 0.55);
    else if (t < 0.75) y = top;
    else if (t < 0.83) y = top - (top - 10) * ((t - 0.75) / 0.08) ** 2;
    else y = 10;
    this.towerRing.position.y = y;
  }

  _buildTents() {
    const tex = stripeTexture('#5a1fa8', '#ffb020', 14);
    const mat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(0.55, 0.55, 0.55), side: THREE.DoubleSide });
    const flagMat = new THREE.MeshBasicMaterial({ color: neon(COLORS.magenta, 1.8), toneMapped: false });
    for (const { x, z, r } of TENTS) {
      this.group.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, 12, 20, 1, true).translate(x, 6, z), mat));
      this.group.add(new THREE.Mesh(new THREE.ConeGeometry(r * 1.08, r * 1.1, 20, 1, true).translate(x, 12 + r * 0.55, z), mat));
      this.group.add(new THREE.Mesh(new THREE.ConeGeometry(1.5, 5, 4).rotateZ(-Math.PI / 2).translate(x + 2.5, 14 + r * 1.1, z), flagMat));
      this._anchor(x, z, r + 6);
    }
  }

  _buildSign() {
    const { x, z, width, height, elevation } = SIGN;
    const frame = new THREE.MeshStandardMaterial({ color: 0x1d1838, roughness: 0.6, metalness: 0.5 });
    for (const dx of [-width * 0.4, width * 0.4]) {
      this.group.add(new THREE.Mesh(new THREE.BoxGeometry(2, elevation, 2).translate(x + dx, elevation / 2, z - 1), frame));
    }
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ map: signTexture(), color: neon(0xffffff, 1.35), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
    );
    panel.position.set(x, elevation + height / 2, z);
    this.group.add(panel);
    for (let i = -2; i <= 2; i++) this._anchor(x + i * (width / 5), z, 14);
  }

  // Cordões de lâmpadas pendurados entre mastros na frente do parque.
  _buildBulbStrings() {
    const step = this.quality.cityCount < 200 ? 6 : 3.5;
    const positions = [];
    const colors = [];
    const palette = [COLORS.yellow, COLORS.magenta, COLORS.cyan, 0xffffff].map((c) => neon(c, 2.2));
    const poles = [];
    let bulb = 0;
    for (let px = -400; px < 470; px += 75) {
      const x0 = px;
      const x1 = px + 75;
      poles.push(beam(new THREE.Vector3(x0, 0, STRING_Z), new THREE.Vector3(x0, 20, STRING_Z), 0.8));
      for (let x = x0; x < x1; x += step) {
        const t = (x - x0) / (x1 - x0);
        positions.push(x, 20 - 7 * (1 - (2 * t - 1) ** 2), STRING_Z);
        const c = palette[bulb++ % palette.length];
        colors.push(c.r, c.g, c.b);
      }
      this._anchor(x0 + 37, STRING_Z, 40);
    }
    poles.push(beam(new THREE.Vector3(470, 0, STRING_Z), new THREE.Vector3(470, 20, STRING_Z), 0.8));
    this.group.add(new THREE.Mesh(mergeGeometries(poles), new THREE.MeshStandardMaterial({ color: 0x1d1838 })));
    poles.forEach((g) => g.dispose());

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const bulbs = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 3.4, map: getGlowTexture(), vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    this.group.add(bulbs);
  }
}
