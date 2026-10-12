import * as THREE from 'three';
import { CONFIG, COLORS } from './Config.js';
import { mulberry32, makeCanvasTexture, neon, disposeObject } from './Utils.js';
import { AmusementPark } from './AmusementPark.js';

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uMid;
  uniform vec3 uHorizon;
  uniform vec3 uFog;
  uniform vec2 uSunDir;
  uniform float uTime;
  uniform float uStars;
  uniform float uStarCut;
  uniform float uAurora;
  uniform vec3 uAuroraLow;
  uniform vec3 uAuroraHigh;
  varying vec3 vDir;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  // Aurora boreal: cortinas que ondulam ao redor do horizonte, com raios verticais finos.
  // O ruído usa a direção (cos, sen) do azimute para não haver costura em 180 graus.
  vec3 aurora(vec3 d) {
    vec2 ring = normalize(d.xz + 1e-5);
    float t = uTime;
    float base = 0.1 + 0.05 * vnoise(ring * 2.5 + t * 0.02) + 0.04 * sin(ring.x * 3.0 + ring.y * 2.0 + t * 0.07);
    float above = d.y - base;
    if (above < -0.02) return vec3(0.0);
    float shape = smoothstep(-0.02, 0.015, above) * exp(-max(above, 0.0) * 5.5);
    float folds = smoothstep(0.35, 0.85, vnoise(ring * 5.0 + vec2(t * 0.03, -t * 0.02)));
    float rays = 0.55 + 0.45 * vnoise(ring * 70.0 + vec2(0.0, t * 0.4));
    vec3 color = mix(uAuroraLow, uAuroraHigh, smoothstep(0.0, 0.28, above));
    return color * shape * folds * rays;
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    float toSun = max(dot(normalize(d.xz + 1e-5), uSunDir), 0.0);
    vec3 horizon = uHorizon * (0.28 + 0.72 * pow(toSun, 3.0));
    vec3 col = mix(uFog, horizon, smoothstep(-0.01, 0.05, h));
    col = mix(col, uMid, smoothstep(0.03, 0.3, h));
    col = mix(col, uTop, smoothstep(0.22, 0.8, h));

    vec2 uv = vec2(atan(d.z, d.x) * 60.0, asin(clamp(d.y, -1.0, 1.0)) * 95.0);
    vec2 id = floor(uv);
    vec2 f = fract(uv) - 0.5;
    float rnd = hash(id);
    vec2 jitter = vec2(hash(id + 3.1), hash(id + 7.7)) - 0.5;
    float star = step(uStarCut, rnd) * smoothstep(0.16, 0.0, length(f - jitter * 0.6));
    star *= smoothstep(0.1, 0.45, h) * (0.55 + 0.45 * sin(uTime * (1.0 + rnd * 3.0) + rnd * 40.0));
    col += vec3(0.75, 0.8, 1.0) * star * uStars;
    if (uAurora > 0.0) col += aurora(d) * uAurora;

    gl_FragColor = vec4(col, 1.0);
  }
`;

const SUN_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SUN_FRAG = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uBottom;
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    float y = vUv.y;
    float cut = 0.56;
    if (y < cut) {
      float depth = (cut - y) / cut;
      float band = fract(depth * 7.0 - uTime * 0.05);
      if (band < mix(0.14, 0.62, depth)) discard;
    }
    vec3 col = mix(uBottom, uTop, smoothstep(0.15, 0.95, y));
    gl_FragColor = vec4(col * 1.2, 1.0);
  }
`;

// Lua crescente: disco com um segundo disco deslocado fazendo a sombra. A parte escura
// continua levemente visível (luz cinérea), e um ruído suave sugere crateras.
const MOON_FRAG = /* glsl */ `
  uniform vec3 uLight;
  uniform vec3 uShade;
  uniform vec2 uCut;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    float lit = smoothstep(0.9, 1.0, length(p - uCut));
    float craters = 0.65 * noise(p * 4.0 + 3.0) + 0.35 * noise(p * 11.0);
    vec3 surface = uLight * (0.78 + 0.3 * craters) * (1.0 - 0.25 * smoothstep(0.7, 1.0, r));
    gl_FragColor = vec4(mix(uShade, surface * 1.35, lit), 1.0);
  }
`;

// Gigante gasoso: faixas de nuvem, iluminação lateral e borda de atmosfera.
const PLANET_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uBand;
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    vec3 n = vec3(p, sqrt(1.0 - r * r));
    float lat = p.y / max(n.z, 0.2);
    float bands = 0.5 + 0.5 * sin(lat * 9.0 + sin(lat * 3.7 + p.x * 1.3 + uTime * 0.02) * 1.6);
    vec3 col = mix(uColor, uBand, bands * 0.75);
    float light = clamp(dot(n, normalize(vec3(-0.65, 0.3, 0.7))), 0.0, 1.0);
    col *= 0.1 + 1.05 * light;
    col += uBand * pow(1.0 - n.z, 3.0) * 0.7;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const RING_VERT = /* glsl */ `
  varying float vR;
  void main() {
    vR = length(position.xy);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const RING_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uInner;
  uniform float uOuter;
  varying float vR;
  void main() {
    float t = (vR - uInner) / (uOuter - uInner);
    float bands = 0.45 + 0.35 * sin(t * 46.0) + 0.2 * sin(t * 13.0);
    float edge = smoothstep(0.0, 0.06, t) * smoothstep(1.0, 0.88, t);
    float division = 1.0 - 0.85 * smoothstep(0.56, 0.59, t) * smoothstep(0.67, 0.64, t);
    float a = clamp(bands, 0.0, 1.0) * edge * division * 0.8;
    gl_FragColor = vec4(uColor * 1.15, a);
  }
`;

const SNOW_VERT = /* glsl */ `
  attribute float aSeed;
  uniform vec3 uCam;
  uniform float uTime;
  uniform float uBox;
  uniform float uScale;
  varying float vAlpha;
  void main() {
    vec3 drift = vec3(uTime * 4.0 + sin(uTime * 0.4 + aSeed * 6.28) * 3.0, -uTime * 5.0, cos(uTime * 0.3 + aSeed * 4.0) * 3.0);
    vec3 p = mod(position + drift - uCam + uBox * 0.5, uBox) - uBox * 0.5 + uCam;
    vec4 mv = viewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uScale * (0.5 + aSeed) / max(-mv.z, 1.0);
    vAlpha = smoothstep(uBox * 0.5, uBox * 0.15, length(p - uCam));
  }
`;

const SNOW_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    float r = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.1, r) * vAlpha * 0.75;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

const GLOW_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    float a = pow(clamp(1.0 - r, 0.0, 1.0), 2.2);
    gl_FragColor = vec4(uColor * a, a);
  }
`;

const GROUND_VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const GROUND_FRAG = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uLine;
  uniform vec3 uFog;
  uniform float uDensity;
  uniform float uCell;
  varying vec3 vWorld;
  void main() {
    vec2 g = vWorld.xz / uCell;
    vec2 fw = fwidth(g);
    vec2 a = abs(fract(g - 0.5) - 0.5) / max(fw, vec2(1e-4));
    float line = 1.0 - min(min(a.x, a.y), 1.0);
    line *= clamp(1.0 - max(fw.x, fw.y) * 1.6, 0.0, 1.0);
    vec3 col = uBase + uLine * line;
    float dist = length(vWorld - cameraPosition);
    float fog = 1.0 - exp(-uDensity * uDensity * dist * dist);
    gl_FragColor = vec4(mix(col, uFog, fog), 1.0);
  }
`;

function windowTexture() {
  const tex = makeCanvasTexture(64, 128, (ctx, w, h) => {
    const rand = mulberry32(77);
    ctx.fillStyle = '#06030d';
    ctx.fillRect(0, 0, w, h);
    for (let y = 6; y < h - 8; y += 6) {
      for (let x = 4; x < w - 4; x += 6) {
        const r = rand();
        if (r < 0.62) continue;
        ctx.fillStyle = r > 0.93 ? '#ffffff' : r > 0.8 ? '#c8c8d8' : '#6a6a80';
        ctx.fillRect(x, y, 3, 3);
      }
    }
    // Canto escuro usado pelo topo dos prédios.
    ctx.fillStyle = '#06030d';
    ctx.fillRect(0, h - 6, 8, 6);
  });
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

export class Environment {
  constructor(scene, track, quality) {
    this.scene = scene;
    this.track = track;
    this.theme = track.def.theme;
    this.quality = quality;
    this.far = quality.far;
    this.group = new THREE.Group();
    this.sky = new THREE.Group();
    this.group.name = 'environment';
    this.sky.name = 'sky';
    this.timeUniform = { value: 0 };

    const theme = this.theme;
    this.sunDir = new THREE.Vector2(Math.cos(theme.sunAngle), Math.sin(theme.sunAngle));
    scene.fog = new THREE.FogExp2(theme.fog, theme.fogDensity);
    scene.background = new THREE.Color(theme.fog);

    // Círculos (x, z, raio) onde a cidade e os feixes de luz não podem ser colocados.
    this.exclusions = [];
    this.park = null;
    this._lastTime = null;

    this._buildLights();
    this._buildSky();
    if (theme.moon) this._buildMoon();
    else if (theme.planet) this._buildPlanet();
    else this._buildSun();
    this._buildMountains();
    this._buildGround();
    if (theme.park) this._buildPark();
    if (theme.scenery === 'crystals') this._buildCrystals();
    else this._buildCity();
    this._buildStructures();
    if (theme.snow) this._buildSnow();

    scene.add(this.group);
    scene.add(this.sky);
  }

  update(camera, time, focus) {
    this.sky.position.set(camera.position.x, 0, camera.position.z);
    this.timeUniform.value = time;
    const dt = this._lastTime === null ? 0 : Math.min(0.1, Math.max(0, time - this._lastTime));
    this._lastTime = time;
    this.park?.update(dt, time);
    if (this.snow) this.snow.material.uniforms.uCam.value.copy(camera.position);
    if (focus && this.keyLight.castShadow) {
      this.keyLight.position.copy(focus).add(this._shadowOffset);
      this.keyLight.target.position.copy(focus);
    }
  }

  setShadows(enabled, mapSize) {
    this.keyLight.castShadow = enabled;
    if (enabled && this.keyLight.shadow.mapSize.x !== mapSize) {
      this.keyLight.shadow.mapSize.set(mapSize, mapSize);
      this.keyLight.shadow.map?.dispose();
      this.keyLight.shadow.map = null;
    }
  }

  dispose() {
    this.keyLight.shadow.map?.dispose();
    disposeObject(this.group);
    disposeObject(this.sky);
    this.scene.fog = null;
  }

  _buildLights() {
    const theme = this.theme;
    this.group.add(new THREE.HemisphereLight(theme.ambientSky, theme.ambientGround, 0.8));

    // Luz rasante vinda do sol: cria o falso reflexo especular no piso.
    const sun = new THREE.DirectionalLight(theme.light, 1.5);
    sun.position.set(this.sunDir.x * 100, 14, this.sunDir.y * 100);
    this.group.add(sun);

    const key = new THREE.DirectionalLight(0xbfd0ff, 0.55);
    this._shadowOffset = new THREE.Vector3(30, 120, 20);
    key.position.copy(this._shadowOffset);
    key.shadow.camera.left = -70;
    key.shadow.camera.right = 70;
    key.shadow.camera.top = 70;
    key.shadow.camera.bottom = -70;
    key.shadow.camera.near = 20;
    key.shadow.camera.far = 260;
    key.shadow.bias = -0.0006;
    this.group.add(key);
    this.group.add(key.target);
    this.keyLight = key;
  }

  _buildSky() {
    const theme = this.theme;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: new THREE.Color(theme.skyTop) },
        uMid: { value: new THREE.Color(theme.skyMid) },
        uHorizon: { value: new THREE.Color(theme.skyHorizon) },
        uFog: { value: new THREE.Color(theme.fog) },
        uSunDir: { value: this.sunDir },
        uTime: this.timeUniform,
        uStars: { value: theme.stars ?? 0.55 },
        uStarCut: { value: theme.starCut ?? 0.955 },
        uAurora: { value: theme.aurora?.strength ?? 0 },
        uAuroraLow: { value: new THREE.Color(theme.aurora?.low ?? 0) },
        uAuroraHigh: { value: new THREE.Color(theme.aurora?.high ?? 0) },
      },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(this.far * 0.95, 32, 16), mat);
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    this.sky.add(dome);
  }

  _buildSun() {
    const theme = this.theme;
    const dist = this.far * 0.86;
    const radius = this.far * 0.15;
    const center = new THREE.Vector3(this.sunDir.x * dist, radius * 0.42, this.sunDir.y * dist);

    const sun = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 48),
      new THREE.ShaderMaterial({
        uniforms: {
          uTop: { value: new THREE.Color(theme.sunTop) },
          uBottom: { value: new THREE.Color(theme.sunBottom) },
          uTime: this.timeUniform,
        },
        vertexShader: SUN_VERT,
        fragmentShader: SUN_FRAG,
        fog: false,
      }),
    );
    sun.position.copy(center);
    sun.lookAt(0, center.y, 0);
    sun.frustumCulled = false;
    this.sky.add(sun);

    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(radius * 5, radius * 5),
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(theme.sunBottom).multiplyScalar(0.55) } },
        vertexShader: SUN_VERT,
        fragmentShader: GLOW_FRAG,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    );
    glow.position.copy(center).multiplyScalar(1.02);
    glow.lookAt(0, center.y, 0);
    glow.renderOrder = -5;
    glow.frustumCulled = false;
    this.sky.add(glow);
  }

  // Cordilheira low-poly em anel, com contorno neon em wireframe.
  _buildMountains() {
    const theme = this.theme;
    const rand = mulberry32(1234 + this.track.def.points.length);
    const segments = 110;
    const rows = 5;
    const rInner = this.far * 0.6;
    const rOuter = this.far * 0.82;
    const groundY = CONFIG.track.groundY;
    const profile = [0, 0.55, 1, 0.6, 0];
    const sunAngle = Math.atan2(this.sunDir.y, this.sunDir.x);
    const positions = new Float32Array(segments * rows * 3);
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      let diff = Math.abs(angle - sunAngle) % (Math.PI * 2);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      // Vale na direção do sol, para emoldurar o disco.
      const valley = 0.3 + 0.7 * Math.min(1, diff / 0.55);
      const peak = this.far * (0.035 + rand() * 0.075) * valley;
      for (let r = 0; r < rows; r++) {
        const edge = r === 0 || r === rows - 1;
        const radius = rInner + ((rOuter - rInner) * r) / (rows - 1) + (edge ? 0 : (rand() - 0.5) * 60);
        const a = angle + (edge ? 0 : (rand() - 0.5) * 0.025);
        const k = (i * rows + r) * 3;
        positions[k] = Math.cos(a) * radius;
        positions[k + 1] = groundY + profile[r] * peak * (0.7 + rand() * 0.5);
        positions[k + 2] = Math.sin(a) * radius;
      }
    }
    const index = [];
    for (let i = 0; i < segments; i++) {
      const j = (i + 1) % segments;
      for (let r = 0; r < rows - 1; r++) {
        const a = i * rows + r;
        const b = j * rows + r;
        index.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setIndex(index);
    const body = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: theme.mountain, fog: false, side: THREE.DoubleSide }));
    body.frustumCulled = false;
    this.sky.add(body);
    const lines = new THREE.LineSegments(
      new THREE.WireframeGeometry(geo),
      new THREE.LineBasicMaterial({ color: neon(theme.mountainLine, 1.0), fog: false, transparent: true, opacity: 0.6, toneMapped: false }),
    );
    lines.frustumCulled = false;
    this.sky.add(lines);
  }

  _buildGround() {
    const theme = this.theme;
    const geo = new THREE.PlaneGeometry(this.far * 2, this.far * 2);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uBase: { value: new THREE.Color(theme.gridBase) },
        uLine: { value: neon(theme.grid, 0.9) },
        uFog: { value: new THREE.Color(theme.fog) },
        uDensity: { value: theme.fogDensity },
        uCell: { value: 70 },
      },
      vertexShader: GROUND_VERT,
      fragmentShader: GROUND_FRAG,
      fog: false,
    });
    const ground = new THREE.Mesh(geo, mat);
    ground.position.y = CONFIG.track.groundY;
    ground.frustumCulled = false;
    this.sky.add(ground);
  }

  _buildMoon() {
    const moon = this.theme.moon;
    const dist = this.far * 0.86;
    const radius = this.far * 0.055;
    const center = new THREE.Vector3(this.sunDir.x * dist, dist * moon.elevation, this.sunDir.y * dist);

    const disc = new THREE.Mesh(
      new THREE.PlaneGeometry(radius * 2, radius * 2),
      new THREE.ShaderMaterial({
        uniforms: {
          uLight: { value: new THREE.Color(moon.color) },
          uShade: { value: new THREE.Color(moon.shade) },
          uCut: { value: new THREE.Vector2(moon.cut[0], moon.cut[1]) },
        },
        vertexShader: SUN_VERT,
        fragmentShader: MOON_FRAG,
        fog: false,
      }),
    );
    disc.position.copy(center);
    disc.lookAt(0, center.y * 0.6, 0);
    disc.frustumCulled = false;
    this.sky.add(disc);

    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(radius * 9, radius * 9),
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(moon.glow).multiplyScalar(0.5) } },
        vertexShader: SUN_VERT,
        fragmentShader: GLOW_FRAG,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    );
    glow.position.copy(center).multiplyScalar(1.02);
    glow.lookAt(0, center.y * 0.6, 0);
    glow.renderOrder = -5;
    glow.frustumCulled = false;
    this.sky.add(glow);
  }

  _buildPlanet() {
    const planet = this.theme.planet;
    const dist = this.far * 0.86;
    const radius = this.far * planet.size;
    const center = new THREE.Vector3(this.sunDir.x * dist, dist * planet.elevation, this.sunDir.y * dist);

    const pivot = new THREE.Group();
    pivot.position.copy(center);
    pivot.lookAt(0, center.y * 0.5, 0);
    pivot.rotateZ(planet.roll ?? 0.3);
    this.sky.add(pivot);

    const disc = new THREE.Mesh(
      new THREE.PlaneGeometry(radius * 2, radius * 2),
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(planet.color) }, uBand: { value: new THREE.Color(planet.band) }, uTime: this.timeUniform },
        vertexShader: SUN_VERT,
        fragmentShader: PLANET_FRAG,
        fog: false,
      }),
    );
    disc.frustumCulled = false;
    pivot.add(disc);

    // O anel é um disco plano inclinado que atravessa o plano do planeta: a metade de trás
    // fica escondida pelo próprio planeta pelo teste de profundidade.
    const inner = radius * 1.35;
    const outer = radius * 2.35;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(inner, outer, 128, 1),
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(planet.ring) }, uInner: { value: inner }, uOuter: { value: outer } },
        vertexShader: RING_VERT,
        fragmentShader: RING_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      }),
    );
    ring.rotation.x = -1.25;
    ring.frustumCulled = false;
    pivot.add(ring);

    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(radius * 4.5, radius * 4.5),
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(planet.band).multiplyScalar(0.35) } },
        vertexShader: SUN_VERT,
        fragmentShader: GLOW_FRAG,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    );
    glow.position.z = -radius * 0.3;
    glow.renderOrder = -5;
    glow.frustumCulled = false;
    pivot.add(glow);
  }

  // Formações de cristal de gelo no lugar dos prédios: a maioria translúcida e facetada,
  // uma parte com brilho próprio, e as mais altas formando um "cânion" perto da pista.
  _buildCrystals() {
    const theme = this.theme;
    const track = this.track;
    const rand = mulberry32(5151 + track.def.points.length * 13);
    const count = this.quality.cityCount;
    const groundY = CONFIG.track.groundY;
    const geo = new THREE.OctahedronGeometry(1, 0);
    const ice = new THREE.InstancedMesh(
      geo,
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x06202e, roughness: 0.16, metalness: 0.55, flatShading: true }),
      count,
    );
    const glowCount = Math.round(count * 0.18);
    const glow = new THREE.InstancedMesh(geo.clone(), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), glowCount);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const icePalette = theme.crystal.map((c) => new THREE.Color(c));
    const glowPalette = theme.crystalGlow.map((c) => neon(c, 1.5));
    const spread = track.radius + 650;

    let placedIce = 0;
    let placedGlow = 0;
    let attempts = 0;
    while ((placedIce < count || placedGlow < glowCount) && attempts < count * 30) {
      attempts++;
      const near = rand() < 0.35;
      const angle = rand() * Math.PI * 2;
      const dist = Math.sqrt(rand()) * spread;
      const x = track.center.x + Math.cos(angle) * dist;
      const z = track.center.z + Math.sin(angle) * dist;
      const width = 14 + rand() * 30;
      const gap = this._distanceToTrack(x, z);
      if (gap < 55 + width) continue;
      if (near && gap > 200) continue;
      const height = (near ? 80 : 60) + rand() * rand() * 240;
      pos.set(x, groundY + height * 0.32, z);
      e.set((rand() - 0.5) * 0.45, rand() * Math.PI, (rand() - 0.5) * 0.45);
      q.setFromEuler(e);
      scale.set(width, height, width * (0.6 + rand() * 0.5));
      m.compose(pos, q, scale);
      const glowing = rand() < 0.18;
      if (glowing && placedGlow < glowCount) {
        glow.setMatrixAt(placedGlow, m);
        glow.setColorAt(placedGlow, glowPalette[placedGlow % glowPalette.length]);
        placedGlow++;
      } else if (placedIce < count) {
        ice.setMatrixAt(placedIce, m);
        ice.setColorAt(placedIce, icePalette[Math.floor(rand() * icePalette.length)]);
        placedIce++;
      }
    }
    for (const [mesh, placed] of [[ice, placedIce], [glow, placedGlow]]) {
      mesh.count = placed;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.group.add(mesh);
    }
  }

  // Poeira de gelo flutuando ao redor da câmera. Toda a animação é feita no shader.
  _buildSnow() {
    const count = Math.round(this.quality.particles * 0.8);
    const box = 160;
    const rand = mulberry32(31);
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = rand() * box;
      positions[i * 3 + 1] = rand() * box;
      positions[i * 3 + 2] = rand() * box;
      seeds[i] = rand();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    const snow = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: {
        uCam: { value: new THREE.Vector3() },
        uTime: this.timeUniform,
        uBox: { value: box },
        uScale: { value: 260 },
        uColor: { value: neon(this.theme.snowColor ?? 0xdffaff, 1.1) },
      },
      vertexShader: SNOW_VERT,
      fragmentShader: SNOW_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    snow.frustumCulled = false;
    this.group.add(snow);
    this.snow = snow;
  }

  // Coloca o parque na direção definida pelo tema, afastando-o até nenhuma atração encostar na pista.
  _buildPark() {
    const track = this.track;
    const park = new AmusementPark(this.quality);
    const angle = this.theme.park.angle;
    const dirX = Math.cos(angle);
    const dirZ = Math.sin(angle);
    const groundY = CONFIG.track.groundY;
    let px = 0;
    let pz = 0;
    for (let dist = 150; dist < track.radius + 900; dist += 15) {
      px = track.center.x + dirX * dist;
      pz = track.center.z + dirZ * dist;
      const rotation = Math.atan2(track.center.x - px, track.center.z - pz);
      const clear = park.worldAnchors(px, pz, rotation).every((a) => this._distanceToTrack(a.x, a.z) > a.r + 45);
      if (clear) break;
    }
    park.place(px, groundY, pz, track.center.x, track.center.z);
    for (const a of park.worldAnchors(px, pz, park.group.rotation.y)) this.exclusions.push(a);
    this.exclusions.push({ x: px, z: pz, r: 120 });
    // Setor entre a pista e o parque fica sem prédios, para a vista do parque ficar livre.
    this.parkView = { angle, minDist: Math.hypot(px - track.center.x, pz - track.center.z) * 0.45, halfAngle: 0.7 };
    this.group.add(park.group);
    this.park = park;
  }

  _inParkView(x, z) {
    const view = this.parkView;
    if (!view) return false;
    const dx = x - this.track.center.x;
    const dz = z - this.track.center.z;
    if (Math.hypot(dx, dz) < view.minDist) return false;
    let diff = Math.abs(Math.atan2(dz, dx) - view.angle) % (Math.PI * 2);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    return diff < view.halfAngle;
  }

  _excluded(x, z, r) {
    for (const e of this.exclusions) {
      const dx = e.x - x;
      const dz = e.z - z;
      const min = e.r + r;
      if (dx * dx + dz * dz < min * min) return true;
    }
    return false;
  }

  _distanceToTrack(x, z) {
    const pts = this.track.minimap.points;
    let best = Infinity;
    for (let i = 0; i < pts.length; i += 8) {
      const dx = pts[i] - x;
      const dz = pts[i + 1] - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < best) best = d2;
    }
    return Math.sqrt(best);
  }

  _buildCity() {
    const theme = this.theme;
    const track = this.track;
    const rand = mulberry32(4242 + track.def.points.length * 31);
    const count = this.quality.cityCount;
    const groundY = CONFIG.track.groundY;

    const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    // O topo de cada prédio amostra o canto escuro da textura de janelas.
    const uv = geo.attributes.uv;
    const normal = geo.attributes.normal;
    for (let i = 0; i < uv.count; i++) {
      if (normal.getY(i) > 0.5) uv.setXY(i, 0.02, 0.98);
    }
    const mat = new THREE.MeshBasicMaterial({ map: windowTexture(), toneMapped: false });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const yAxis = new THREE.Vector3(0, 1, 0);
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const palette = theme.city.map((c) => neon(c, 1.3));
    const spread = track.radius + 650;

    let placed = 0;
    let attempts = 0;
    while (placed < count && attempts < count * 30) {
      attempts++;
      const near = rand() < 0.45;
      const angle = rand() * Math.PI * 2;
      const dist = Math.sqrt(rand()) * spread;
      const x = track.center.x + Math.cos(angle) * dist;
      const z = track.center.z + Math.sin(angle) * dist;
      const width = 22 + rand() * 46;
      const depth = 22 + rand() * 46;
      const gap = this._distanceToTrack(x, z);
      const clearance = 34 + Math.max(width, depth) * 0.75;
      if (gap < clearance) continue;
      if (near && gap > 220) continue;
      if (this._excluded(x, z, Math.max(width, depth) * 0.75) || this._inParkView(x, z)) continue;
      const height = (near ? 90 : 60) + rand() * rand() * 300;
      pos.set(x, groundY, z);
      q.setFromAxisAngle(yAxis, rand() * Math.PI);
      scale.set(width, height, depth);
      m.compose(pos, q, scale);
      mesh.setMatrixAt(placed, m);
      mesh.setColorAt(placed, palette[Math.floor(rand() * palette.length)]);
      placed++;
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.group.add(mesh);
  }

  // Megaestruturas distantes: anéis orbitais e feixes de luz.
  _buildStructures() {
    const track = this.track;
    const theme = this.theme;
    const rand = mulberry32(999 + track.def.points.length * 7);
    const groundY = CONFIG.track.groundY;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const colors = [neon(COLORS.cyan, 1.5), neon(COLORS.magenta, 1.5), neon(COLORS.purple, 1.5), neon(COLORS.orange, 1.5)];

    const ringCount = theme.rings === false ? 0 : 5;
    const rings = new THREE.InstancedMesh(
      new THREE.TorusGeometry(1, 0.022, 5, 40),
      new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
      ringCount,
    );
    for (let i = 0; i < ringCount; i++) {
      const angle = (i / ringCount) * Math.PI * 2 + rand();
      const dist = track.radius + 260 + rand() * 500;
      const size = 110 + rand() * 130;
      pos.set(track.center.x + Math.cos(angle) * dist, groundY + size * (0.8 + rand() * 0.5), track.center.z + Math.sin(angle) * dist);
      e.set((rand() - 0.5) * 0.5, rand() * Math.PI, (rand() - 0.5) * 0.5);
      q.setFromEuler(e);
      scale.setScalar(size);
      m.compose(pos, q, scale);
      rings.setMatrixAt(i, m);
      rings.setColorAt(i, colors[i % colors.length]);
    }
    rings.instanceMatrix.needsUpdate = true;
    if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
    if (ringCount) this.group.add(rings);
    else {
      rings.geometry.dispose();
      rings.material.dispose();
    }

    const beamCount = theme.beams === false ? 0 : this.quality.beams;
    const beams = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(1, 2.2, 1, 5, 1, true).translate(0, 0.5, 0),
      new THREE.MeshBasicMaterial({
        color: 0xffffff, toneMapped: false, transparent: true, opacity: 0.09,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }),
      beamCount,
    );
    q.identity();
    let placed = 0;
    let attempts = 0;
    while (placed < beamCount && attempts < beamCount * 20) {
      attempts++;
      const angle = rand() * Math.PI * 2;
      const dist = 200 + rand() * (track.radius + 450);
      const x = track.center.x + Math.cos(angle) * dist;
      const z = track.center.z + Math.sin(angle) * dist;
      if (this._distanceToTrack(x, z) < 170 || this._excluded(x, z, 10)) continue;
      pos.set(x, groundY, z);
      scale.set(2.5 + rand() * 3, 500 + rand() * 500, 2.5 + rand() * 3);
      m.compose(pos, q, scale);
      beams.setMatrixAt(placed, m);
      beams.setColorAt(placed, colors[placed % colors.length]);
      placed++;
    }
    beams.count = placed;
    beams.instanceMatrix.needsUpdate = true;
    if (beams.instanceColor) beams.instanceColor.needsUpdate = true;
    if (placed) this.group.add(beams);
    else {
      beams.geometry.dispose();
      beams.material.dispose();
    }
  }
}
