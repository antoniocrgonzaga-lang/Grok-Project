import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { clamp, damp } from './Utils.js';

// ---------- pós-processamento: CRT, vinheta, distorção de velocidade ----------

const ScreenShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAberration: { value: 0 },
    uScanlines: { value: 0 },
    uScanPeriod: { value: 3 },
    uVignette: { value: 0.4 },
    uWarp: { value: 0 },
    uBlur: { value: 0 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 1, 1) },
    uLowEnergy: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uAberration;
    uniform float uScanlines;
    uniform float uScanPeriod;
    uniform float uVignette;
    uniform float uWarp;
    uniform float uBlur;
    uniform float uFlash;
    uniform vec3 uFlashColor;
    uniform float uLowEnergy;
    varying vec2 vUv;

    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      // Em velocidades extremas as bordas da imagem são esticadas para fora.
      vec2 uv = 0.5 + c * (1.0 - uWarp * r2 * 0.22);
      vec2 shift = c * (uAberration * (0.5 + r2 * 3.0) + uWarp * r2 * 0.012);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + shift).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - shift).b;

      if (uBlur > 0.001) {
        vec3 acc = col;
        for (int i = 1; i <= 3; i++) {
          float k = 1.0 - uBlur * r2 * 0.09 * float(i);
          acc += texture2D(tDiffuse, 0.5 + (uv - 0.5) * k).rgb;
        }
        col = acc * 0.25;
      }

      float scan = 0.5 + 0.5 * sin(gl_FragCoord.y * 6.28318 / uScanPeriod);
      col *= 1.0 - uScanlines * scan * 0.16;
      col *= 1.0 - uVignette * smoothstep(0.12, 0.62, r2);
      col += vec3(0.55, 0.0, 0.06) * uLowEnergy * smoothstep(0.1, 0.5, r2);
      col += uFlashColor * uFlash;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

// Substitui o filtro de luminância do UnrealBloomPass: usa o canal mais intenso em vez do
// brilho percebido, para que magenta, azul e vermelho brilhem tanto quanto o ciano.
const HDR_HIGH_PASS_FRAG = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec3 defaultColor;
  uniform float defaultOpacity;
  uniform float luminosityThreshold;
  uniform float smoothWidth;
  varying vec2 vUv;
  void main() {
    vec4 texel = texture2D(tDiffuse, vUv);
    float peak = max(texel.r, max(texel.g, texel.b));
    float alpha = smoothstep(luminosityThreshold, luminosityThreshold + smoothWidth, peak);
    gl_FragColor = mix(vec4(defaultColor, defaultOpacity), texel, alpha);
  }
`;

class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.composer = null;
    this.warp = 0;
    this.flash = 0;
  }

  build(quality, crtEnabled) {
    this.dispose();
    const renderer = this.renderer;
    const size = renderer.getSize(new THREE.Vector2());
    const pr = renderer.getPixelRatio();
    const target = new THREE.WebGLRenderTarget(Math.max(1, size.x * pr), Math.max(1, size.y * pr), {
      type: THREE.HalfFloatType,
      samples: quality.msaa,
    });
    const composer = new EffectComposer(renderer, target);
    composer.setPixelRatio(pr);
    composer.setSize(size.x, size.y);
    composer.addPass(new RenderPass(this.scene, this.camera));
    // Bloom seletivo: só passa pelo filtro o que foi desenhado em HDR (algum canal acima de 1),
    // ou seja, os materiais neon. O restante da cena fica fora do brilho, qualquer que seja a cor.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), quality.bloomStrength, 0.5, 0.98);
    this.bloom.highPassUniforms.smoothWidth.value = 0.4;
    this.bloom.materialHighPassFilter.fragmentShader = HDR_HIGH_PASS_FRAG;
    this.bloom.materialHighPassFilter.needsUpdate = true;
    this.bloom.enabled = quality.bloom;
    composer.addPass(this.bloom);
    this.screen = new ShaderPass(ScreenShader);
    composer.addPass(this.screen);
    composer.addPass(new OutputPass());
    this.composer = composer;
    this.quality = quality;
    this.setCRT(crtEnabled);
    this.screen.uniforms.uScanPeriod.value = Math.max(3, Math.round(pr * 2.5));
  }

  setCRT(enabled) {
    if (!this.screen) return;
    this.crt = enabled;
    const u = this.screen.uniforms;
    u.uScanlines.value = enabled ? 1 : 0;
    u.uAberration.value = enabled ? this.quality.aberration : 0;
    u.uVignette.value = enabled ? 0.55 : 0.32;
  }

  setSize(width, height, pixelRatio) {
    if (!this.composer) return;
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    this.screen.uniforms.uScanPeriod.value = Math.max(3, Math.round(pixelRatio * 2.5));
  }

  triggerFlash(amount, color) {
    this.flash = Math.max(this.flash, amount);
    this.screen.uniforms.uFlashColor.value.set(color);
  }

  update(dt, time, warpTarget, lowEnergy) {
    const u = this.screen.uniforms;
    this.warp = damp(this.warp, warpTarget, 5, dt);
    this.flash = Math.max(0, this.flash - dt * 2.2);
    u.uTime.value = time;
    u.uWarp.value = this.warp;
    u.uBlur.value = this.quality.radialBlur ? this.warp : 0;
    u.uFlash.value = this.flash * this.flash;
    u.uLowEnergy.value = lowEnergy ? 0.22 + 0.2 * Math.sin(time * 7) : 0;
  }

  render(dt) {
    this.composer.render(dt);
  }

  dispose() {
    if (!this.composer) return;
    for (const pass of this.composer.passes) pass.dispose?.();
    this.composer.renderTarget1.dispose();
    this.composer.renderTarget2.dispose();
    this.composer = null;
  }
}

// ---------- partículas com pool fixo ----------

const PARTICLE_VERT = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aAlpha;
  uniform float uScale;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  }
`;

const PARTICLE_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float r = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.08, r) * vAlpha;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;

export class ParticleSystem {
  constructor(capacity) {
    this.capacity = capacity;
    this.cursor = 0;
    this.position = new Float32Array(capacity * 3);
    this.velocity = new Float32Array(capacity * 3);
    this.color = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.gravity = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.position, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.color, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } },
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this._dirty = false;
  }

  emit(px, py, pz, vx, vy, vz, life, size, r, g, b, gravity = 0, drag = 0) {
    const i = this.cursor;
    this.cursor = (i + 1) % this.capacity;
    const k = i * 3;
    this.position[k] = px;
    this.position[k + 1] = py;
    this.position[k + 2] = pz;
    this.velocity[k] = vx;
    this.velocity[k + 1] = vy;
    this.velocity[k + 2] = vz;
    this.color[k] = r;
    this.color[k + 1] = g;
    this.color[k + 2] = b;
    this.size[i] = size;
    this.alpha[i] = 1;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.gravity[i] = gravity;
    this.drag[i] = drag;
    this._dirty = true;
  }

  update(dt) {
    const { position, velocity, alpha, life, maxLife, gravity, drag, capacity } = this;
    for (let i = 0; i < capacity; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) {
        alpha[i] = 0;
        continue;
      }
      const k = i * 3;
      const damping = Math.max(0, 1 - drag[i] * dt);
      velocity[k] *= damping;
      velocity[k + 1] = velocity[k + 1] * damping - gravity[i] * dt;
      velocity[k + 2] *= damping;
      position[k] += velocity[k] * dt;
      position[k + 1] += velocity[k + 1] * dt;
      position[k + 2] += velocity[k + 2] * dt;
      alpha[i] = life[i] / maxLife[i];
    }
    const attrs = this.points.geometry.attributes;
    attrs.position.needsUpdate = true;
    attrs.aAlpha.needsUpdate = true;
    if (this._dirty) {
      attrs.aColor.needsUpdate = true;
      attrs.aSize.needsUpdate = true;
      this._dirty = false;
    }
  }

  clear() {
    this.life.fill(0);
    this.alpha.fill(0);
  }

  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
    if (this.points.parent) this.points.parent.remove(this.points);
  }
}

// ---------- trilha de energia (fita com histórico circular) ----------

const TRAIL_VERT = /* glsl */ `
  attribute float aFade;
  varying float vFade;
  void main() {
    vFade = aFade;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const TRAIL_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vFade;
  void main() {
    gl_FragColor = vec4(uColor, vFade * vFade * uOpacity);
  }
`;

export class Trail {
  constructor(maxPoints, color, width = 0.34, spacing = 1.2) {
    this.max = maxPoints;
    this.width = width;
    this.spacingSq = spacing * spacing;
    this.history = new Float32Array(maxPoints * 6);
    this.positions = new Float32Array(maxPoints * 2 * 3);
    this.fade = new Float32Array(maxPoints * 2);
    this.length = 14;
    const index = [];
    for (let k = 0; k < maxPoints - 1; k++) {
      const a = k * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aFade', new THREE.BufferAttribute(this.fade, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(index);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: color.clone() }, uOpacity: { value: 0 } },
      vertexShader: TRAIL_VERT,
      fragmentShader: TRAIL_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
  }

  reset(pos, right) {
    const h = this.history;
    for (let k = 0; k < this.max; k++) {
      const o = k * 6;
      h[o] = pos.x;
      h[o + 1] = pos.y;
      h[o + 2] = pos.z;
      h[o + 3] = right.x;
      h[o + 4] = right.y;
      h[o + 5] = right.z;
    }
    this._write();
  }

  // length: comprimento visível da trilha em unidades de mundo, independente da taxa de quadros.
  update(pos, right, intensity, length) {
    this.length = length;
    const h = this.history;
    const dx = pos.x - h[6];
    const dy = pos.y - h[7];
    const dz = pos.z - h[8];
    if (dx * dx + dy * dy + dz * dz > this.spacingSq) h.copyWithin(6, 0, (this.max - 1) * 6);
    h[0] = pos.x;
    h[1] = pos.y;
    h[2] = pos.z;
    h[3] = right.x;
    h[4] = right.y;
    h[5] = right.z;
    this.material.uniforms.uOpacity.value = intensity;
    this._write();
  }

  _write() {
    const h = this.history;
    const p = this.positions;
    const f = this.fade;
    const n = this.max;
    let dist = 0;
    for (let k = 0; k < n; k++) {
      const o = k * 6;
      if (k > 0) {
        const dx = h[o] - h[o - 6];
        const dy = h[o + 1] - h[o - 5];
        const dz = h[o + 2] - h[o - 4];
        dist += Math.sqrt(dx * dx + dy * dy + dz * dz);
      }
      const t = Math.max(0, 1 - dist / this.length);
      f[k * 2] = f[k * 2 + 1] = t;
      const w = this.width * (0.25 + 0.75 * t);
      const v = k * 6;
      p[v] = h[o] - h[o + 3] * w;
      p[v + 1] = h[o + 1] - h[o + 4] * w;
      p[v + 2] = h[o + 2] - h[o + 5] * w;
      p[v + 3] = h[o] + h[o + 3] * w;
      p[v + 4] = h[o + 1] + h[o + 4] * w;
      p[v + 5] = h[o + 2] + h[o + 5] * w;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.aFade.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
  }
}

// ---------- linhas de velocidade presas à câmera ----------

class SpeedLines {
  constructor(count) {
    this.count = count;
    this.angle = new Float32Array(count);
    this.radius = new Float32Array(count);
    this.z = new Float32Array(count);
    this.positions = new Float32Array(count * 6);
    for (let i = 0; i < count; i++) this._respawn(i, true);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.LineBasicMaterial({
      color: new THREE.Color(0.5, 0.9, 1.0), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false, toneMapped: false,
    });
    this.lines = new THREE.LineSegments(geo, this.material);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 6;
    this.lines.visible = false;
    this.intensity = 0;
  }

  _respawn(i, anywhere) {
    this.angle[i] = Math.random() * Math.PI * 2;
    this.radius[i] = 5 + Math.random() * 9;
    this.z[i] = anywhere ? -Math.random() * 90 : -70 - Math.random() * 30;
  }

  update(dt, speed, target) {
    this.intensity = damp(this.intensity, target, 6, dt);
    const visible = this.intensity > 0.02;
    this.lines.visible = visible;
    if (!visible) return;
    this.material.opacity = this.intensity * 0.2;
    const len = 3 + this.intensity * 6;
    const p = this.positions;
    const advance = (speed * 1.1 + 40) * dt;
    for (let i = 0; i < this.count; i++) {
      this.z[i] += advance;
      if (this.z[i] > 4) this._respawn(i, false);
      const x = Math.cos(this.angle[i]) * this.radius[i];
      const y = Math.sin(this.angle[i]) * this.radius[i];
      const k = i * 6;
      p[k] = x;
      p[k + 1] = y;
      p[k + 2] = this.z[i];
      p[k + 3] = x;
      p[k + 4] = y;
      p[k + 5] = this.z[i] - len;
    }
    this.lines.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.lines.geometry.dispose();
    this.material.dispose();
    if (this.lines.parent) this.lines.parent.remove(this.lines);
  }
}

// ---------- fachada usada pelo jogo ----------

export class Effects {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.post = new PostFX(renderer, scene, camera);
    this.particles = null;
    this.speedLines = null;
    this.density = 1;
  }

  // Recria tudo o que depende do nível de qualidade.
  applyQuality(quality, crtEnabled) {
    this.quality = quality;
    this.post.build(quality, crtEnabled);
    this.particles?.dispose();
    this.particles = new ParticleSystem(quality.particles);
    this.scene.add(this.particles.points);
    this.speedLines?.dispose();
    this.speedLines = new SpeedLines(quality.speedLines);
    this.camera.add(this.speedLines.lines);
    this.density = clamp(quality.particles / 900, 0.35, 1.6);
    this._updateParticleScale();
  }

  setCRT(enabled) {
    this.post.setCRT(enabled);
  }

  setSize(width, height, pixelRatio) {
    this.post.setSize(width, height, pixelRatio);
    this._updateParticleScale();
  }

  _updateParticleScale() {
    if (!this.particles) return;
    const height = this.renderer.domElement.height;
    this.particles.material.uniforms.uScale.value = height * 0.8;
  }

  flash(amount, color) {
    this.post.triggerFlash(amount, color);
  }

  // Faíscas espalhadas em torno de uma direção (nx, ny, nz).
  sparks(x, y, z, nx, ny, nz, count, r, g, b, speed = 26) {
    const n = Math.max(2, Math.round(count * this.density));
    for (let i = 0; i < n; i++) {
      const vx = nx * 0.7 + (Math.random() - 0.5) * 1.5;
      const vy = ny * 0.7 + Math.random() * 0.9;
      const vz = nz * 0.7 + (Math.random() - 0.5) * 1.5;
      const s = speed * (0.35 + Math.random() * 0.9);
      this.particles.emit(x, y, z, vx * s, vy * s, vz * s, 0.25 + Math.random() * 0.45, 0.35 + Math.random() * 0.45, r, g, b, 32, 1.4);
    }
  }

  explosion(x, y, z, r, g, b) {
    const n = Math.round(46 * this.density);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * 1.2 - 0.2;
      const s = 10 + Math.random() * 34;
      const white = Math.random() < 0.3;
      this.particles.emit(
        x, y, z, Math.cos(a) * s, up * s, Math.sin(a) * s,
        0.5 + Math.random() * 0.8, 0.8 + Math.random() * 1.4,
        white ? 2 : r, white ? 2 : g, white ? 2 : b, 14, 1.2,
      );
    }
  }

  update(dt, time, state) {
    this.particles.update(dt);
    this.speedLines.update(dt, state.speed, state.lines);
    this.post.update(dt, time, state.warp, state.lowEnergy);
  }

  clear() {
    this.particles?.clear();
    this.post.warp = 0;
    this.post.flash = 0;
    if (this.speedLines) {
      this.speedLines.intensity = 0;
      this.speedLines.lines.visible = false;
    }
  }

  render(dt) {
    this.post.render(dt);
  }
}
