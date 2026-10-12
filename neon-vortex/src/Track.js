import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG, COLORS } from './Config.js';
import { clamp, makeCanvasTexture, neon, disposeObject } from './Utils.js';

const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _p = new THREE.Vector3();

function smoothCircular(src, radius, passes = 1) {
  const n = src.length;
  let a = Float32Array.from(src);
  let b = new Float32Array(n);
  const w = 2 * radius + 1;
  for (let pass = 0; pass < passes; pass++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += a[(k + n) % n];
    for (let i = 0; i < n; i++) {
      b[i] = sum / w;
      sum += a[(i + radius + 1) % n] - a[(i - radius + n) % n];
    }
    [a, b] = [b, a];
  }
  return a;
}

// ---------- texturas procedurais ----------

function drawRoadLines(ctx, w, h, alpha) {
  ctx.fillStyle = `rgba(150,90,255,${0.55 * alpha})`;
  for (const u of [0.25, 0.75]) ctx.fillRect(w * u - 1, 0, 2, h);
  ctx.fillStyle = `rgba(0,229,255,${0.9 * alpha})`;
  ctx.fillRect(w * 0.5 - 2, 0, 4, h * 0.5);
  ctx.fillStyle = `rgba(255,43,214,${0.5 * alpha})`;
  ctx.fillRect(0, h - 3, w, 3);
  ctx.fillStyle = `rgba(120,80,255,${0.22 * alpha})`;
  ctx.fillRect(0, h * 0.5 - 1, w, 2);
}

function roadTextures(aniso) {
  const map = makeCanvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#0d0a1c';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = `rgba(255,255,255,${i % 2 ? 0.02 : 0.008})`;
      ctx.fillRect(i * 32, 0, 32, h);
    }
    drawRoadLines(ctx, w, h, 0.6);
  }, { repeat: true, anisotropy: aniso });
  const emissive = makeCanvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    drawRoadLines(ctx, w, h, 1);
  }, { repeat: true, anisotropy: aniso });
  return { map, emissive };
}

function hazardTexture(aniso) {
  return makeCanvasTexture(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#12040a';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#ff2244';
    ctx.lineWidth = 12;
    for (let k = -2; k < 4; k++) {
      ctx.beginPath();
      ctx.moveTo(k * 32, h);
      ctx.lineTo(k * 32 + 64, 0);
      ctx.stroke();
    }
  }, { repeat: true, anisotropy: aniso });
}

function chevronTexture(aniso, background) {
  return makeCanvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 15;
    ctx.lineJoin = 'miter';
    for (let k = 0; k < 2; k++) {
      const y0 = k * 64;
      ctx.beginPath();
      ctx.moveTo(14, y0 + 54);
      ctx.lineTo(64, y0 + 16);
      ctx.lineTo(114, y0 + 54);
      ctx.stroke();
    }
  }, { repeat: true, anisotropy: aniso });
}

function rechargeTexture(aniso) {
  return makeCanvasTexture(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fff';
    ctx.fillRect(26, 12, 12, 40);
    ctx.fillRect(12, 26, 40, 12);
    ctx.fillRect(0, 0, 4, h);
    ctx.fillRect(w - 4, 0, 4, h);
  }, { repeat: true, anisotropy: aniso });
}

function arrowTexture(aniso) {
  return makeCanvasTexture(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#0a0612';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 6;
    ctx.strokeRect(5, 5, w - 10, h - 10);
    ctx.lineWidth = 20;
    for (let k = 0; k < 3; k++) {
      const x0 = 38 + k * 66;
      ctx.beginPath();
      ctx.moveTo(x0, 24);
      ctx.lineTo(x0 + 44, 64);
      ctx.lineTo(x0, 104);
      ctx.stroke();
    }
  }, { anisotropy: aniso });
}

function dashTexture() {
  return makeCanvasTexture(8, 64, (ctx, w, h) => {
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h * 0.62);
  }, { repeat: true });
}

function checkerTexture() {
  const tex = makeCanvasTexture(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#0b0914';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillRect(32, 32, 32, 32);
  }, { repeat: true });
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

function holoTexture(title, subtitle, color) {
  return makeCanvasTexture(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.16;
    for (let y = 24; y < h - 20; y += 8) ctx.fillRect(18, y, w - 36, 3);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.font = 'italic 900 84px Impact, "Arial Black", sans-serif';
    ctx.fillText(title, w / 2, 128);
    ctx.font = 'bold 30px "Courier New", monospace';
    ctx.fillText(subtitle, w / 2, 190);
    ctx.fillRect(40, 208, w - 80, 6);
  });
}

function bannerTexture(aniso) {
  return makeCanvasTexture(1024, 128, (ctx, w, h) => {
    ctx.fillStyle = '#07040f';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        if ((i + j) % 2) continue;
        ctx.fillStyle = '#fff';
        ctx.fillRect(i * 32, j * 32, 32, 32);
        ctx.fillRect(w - 128 + i * 32, j * 32, 32, 32);
      }
    }
    const grad = ctx.createLinearGradient(160, 0, w - 160, 0);
    grad.addColorStop(0, '#00e5ff');
    grad.addColorStop(1, '#ff2bd6');
    ctx.fillStyle = grad;
    ctx.textAlign = 'center';
    ctx.font = 'italic 900 92px Impact, "Arial Black", sans-serif';
    ctx.fillText('NEON HYPERDRIVE', w / 2, 98);
  }, { anisotropy: aniso });
}

// ---------- pista ----------

export class Track {
  constructor(def, quality, maxAnisotropy = 1) {
    this.def = def;
    this.id = def.id;
    this.halfWidth = CONFIG.track.halfWidth;
    this.shoulder = CONFIG.track.shoulder;
    this.group = new THREE.Group();
    this.group.name = `track-${def.id}`;
    this.zones = [];
    this.ramps = [];
    this._animated = {};
    this._buildFrames();
    this._buildSections();
    this._buildMeshes(quality, Math.min(8, maxAnisotropy));
  }

  // ---------- consultas usadas pela simulação ----------

  wrap(s) {
    const L = this.length;
    s %= L;
    return s < 0 ? s + L : s;
  }

  // Diferença assinada mais curta (a - b) ao longo do circuito.
  delta(a, b) {
    const L = this.length;
    let d = (a - b) % L;
    if (d > L / 2) d -= L;
    else if (d < -L / 2) d += L;
    return d;
  }

  indexAt(s) {
    const i = Math.floor(this.wrap(s) / this.segLen);
    return i >= this.count ? this.count - 1 : i;
  }

  curvatureAt(s) {
    return this.curv[this.indexAt(s)];
  }

  // Deslocamento lateral sugerido, interpolado entre os pontos de referência da IA.
  waypointOffsetAt(s) {
    const wp = this.waypoints;
    const f = this.wrap(s) / this.waypointSpacing;
    const base = Math.floor(f);
    const a = wp[base % wp.length].d;
    const b = wp[(base + 1) % wp.length].d;
    return a + (b - a) * (f - base);
  }

  hasWall(s) {
    return this.wall[this.indexAt(s)] === 1;
  }

  inTunnel(s) {
    return this.tunnel[this.indexAt(s)] === 1;
  }

  // Há piso sob a nave? Fendas não têm piso; trechos sem muro só até o fim do acostamento.
  hasGround(s, d) {
    const i = this.indexAt(s);
    if (this.gap[i]) return false;
    return this.wall[i] === 1 || Math.abs(d) <= this.halfWidth + this.shoulder + 0.6;
  }

  // Fenda cujo início está até maxDist à frente (ou que já está sob a nave).
  gapAhead(s, maxDist) {
    for (const g of this.gaps) {
      let ahead = g.s0 - s;
      if (ahead < -g.len) ahead += this.length;
      if (ahead <= maxDist && ahead > -g.len) return g;
    }
    return null;
  }

  // Ponto seguro para reposicionar: quem está numa fenda (ou na aproximação dela, devagar demais
  // para saltar) volta à pista logo depois da borda de pouso.
  safeRespawnS(s) {
    for (const g of this.gaps) {
      let rel = s - (g.s0 - g.approach);
      rel = ((rel % this.length) + this.length) % this.length;
      if (rel <= g.approach + g.len) return this.wrap(g.s0 + g.len + 14);
    }
    return s;
  }

  groundLift(s) {
    const ramps = this.ramps;
    for (let i = 0; i < ramps.length; i++) {
      const r = ramps[i];
      let rel = s - r.s0;
      if (rel < 0) rel += this.length;
      if (rel < r.len) return (r.height * rel) / r.len;
    }
    return 0;
  }

  zoneAt(s, d) {
    const zones = this.zones;
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      if (d < z.d0 || d > z.d1) continue;
      let rel = s - z.s0;
      if (rel < 0) rel += this.length;
      if (rel <= z.len) return z.type;
    }
    return null;
  }

  // Próxima zona do tipo pedido que comece dentro de maxDist (ou que já esteja sob a nave).
  nextZone(s, maxDist, type) {
    let best = null;
    let bestDist = maxDist;
    const zones = this.zones;
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      if (z.type !== type) continue;
      let ahead = z.s0 - s;
      if (ahead < 0) ahead += this.length;
      if (ahead > this.length - z.len) ahead = 0;
      if (ahead < bestDist) {
        bestDist = ahead;
        best = z;
      }
    }
    return best;
  }

  frameAt(s, out) {
    const N = this.count;
    const f = this.wrap(s) / this.segLen;
    let i = Math.floor(f);
    if (i >= N) i = N - 1;
    const t = f - i;
    const a = i * 3;
    const b = ((i + 1) % N) * 3;
    const P = this.pos, T = this.tan, R = this.right, U = this.up;
    out.pos.set(P[a] + (P[b] - P[a]) * t, P[a + 1] + (P[b + 1] - P[a + 1]) * t, P[a + 2] + (P[b + 2] - P[a + 2]) * t);
    out.tan.set(T[a] + (T[b] - T[a]) * t, T[a + 1] + (T[b + 1] - T[a + 1]) * t, T[a + 2] + (T[b + 2] - T[a + 2]) * t).normalize();
    out.up.set(U[a] + (U[b] - U[a]) * t, U[a + 1] + (U[b + 1] - U[a + 1]) * t, U[a + 2] + (U[b + 2] - U[a + 2]) * t).normalize();
    out.right.set(R[a] + (R[b] - R[a]) * t, R[a + 1] + (R[b + 1] - R[a + 1]) * t, R[a + 2] + (R[b + 2] - R[a + 2]) * t).normalize();
    return out;
  }

  stats() {
    let maxK = 0;
    let at = 0;
    for (let i = 0; i < this.count; i++) {
      const k = Math.abs(this.curv[i]);
      if (k > maxK) {
        maxK = k;
        at = i;
      }
    }
    return { length: this.length, samples: this.count, minRadius: 1 / maxK, minRadiusAt: at / this.count };
  }

  update(dt, time) {
    const a = this._animated;
    a.boostTex.offset.y -= dt * 2.2;
    a.rampTex.offset.y -= dt * 1.4;
    a.rechargeTex.offset.y -= dt * 0.8;
    a.rechargeMat.opacity = 0.6 + 0.25 * Math.sin(time * 5);
    for (let i = 0; i < a.holoMats.length; i++) {
      const flicker = Math.sin(time * 31 + i * 7) > 0.96 ? 0.35 : 1;
      a.holoMats[i].opacity = (0.7 + 0.15 * Math.sin(time * 2 + i)) * flicker;
    }
  }

  dispose() {
    disposeObject(this.group);
  }

  // ---------- construção ----------

  _buildFrames() {
    const def = this.def;
    const sc = def.scale ?? 1;
    const pts = def.points.map((p) => new THREE.Vector3(p[0] * sc, p[1], p[2] * sc));
    const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    curve.arcLengthDivisions = pts.length * 200;
    curve.updateArcLengths();
    this.curve = curve;

    const L = curve.getLength();
    const N = Math.round(L / CONFIG.track.sampleSpacing);
    const sp = curve.getSpacedPoints(N);
    this.length = L;
    this.count = N;
    this.segLen = L / N;

    const P = (this.pos = new Float32Array(N * 3));
    const T = (this.tan = new Float32Array(N * 3));
    const R = (this.right = new Float32Array(N * 3));
    const U = (this.up = new Float32Array(N * 3));
    const worldUp = new THREE.Vector3(0, 1, 0);
    const t = new THREE.Vector3();
    const r = new THREE.Vector3();
    const u = new THREE.Vector3();

    for (let i = 0; i < N; i++) {
      const p = sp[i];
      P[i * 3] = p.x;
      P[i * 3 + 1] = p.y;
      P[i * 3 + 2] = p.z;
      t.subVectors(sp[(i + 1) % N], sp[(i - 1 + N) % N]).normalize();
      r.crossVectors(t, worldUp).normalize();
      u.crossVectors(r, t).normalize();
      t.toArray(T, i * 3);
      r.toArray(R, i * 3);
      u.toArray(U, i * 3);
    }

    // Curvatura assinada: positiva quando a pista vira para a direita.
    const raw = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = ((i + 1) % N) * 3;
      const b = ((i - 1 + N) % N) * 3;
      const k = i * 3;
      raw[i] = ((T[a] - T[b]) * R[k] + (T[a + 1] - T[b + 1]) * R[k + 1] + (T[a + 2] - T[b + 2]) * R[k + 2]) / (2 * this.segLen);
    }
    this.curv = smoothCircular(raw, 2, 1);
    this.curvBroad = smoothCircular(raw, 10, 2);

    // Inclinação lateral (banking) proporcional à curvatura suavizada.
    const { bankGain, maxBank } = CONFIG.track;
    for (let i = 0; i < N; i++) {
      const bank = clamp(this.curvBroad[i] * bankGain, -maxBank, maxBank);
      const c = Math.cos(bank);
      const s = Math.sin(bank);
      const k = i * 3;
      for (let j = 0; j < 3; j++) {
        const rv = R[k + j];
        const uv = U[k + j];
        R[k + j] = rv * c - uv * s;
        U[k + j] = uv * c + rv * s;
      }
    }

    // Trajetória ideal aproximada: deslocamento para o lado interno das curvas.
    const lineRaw = smoothCircular(raw, 16, 2);
    for (let i = 0; i < N; i++) lineRaw[i] = clamp(lineRaw[i] * 70, -0.6, 0.6) * this.halfWidth;
    this.line = smoothCircular(lineRaw, 6, 1);

    // Pontos de referência para a IA: trechos regulares com deslocamento lateral.
    this.waypoints = [];
    const stride = Math.max(1, Math.round(24 / this.segLen));
    this.waypointSpacing = stride * this.segLen;
    for (let i = 0; i < N; i += stride) this.waypoints.push({ s: i * this.segLen, d: this.line[i] });

    const mm = new Float32Array(N * 2);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < N; i++) {
      const x = P[i * 3];
      const z = P[i * 3 + 2];
      mm[i * 2] = x;
      mm[i * 2 + 1] = z;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    this.minimap = { points: mm, minX, maxX, minZ, maxZ };
    this.center = new THREE.Vector3((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
    this.radius = Math.hypot(maxX - minX, maxZ - minZ) / 2;
  }

  _cpToIndex(cp) {
    const n = this.def.points.length;
    let t = (cp / n) % 1;
    if (t < 0) t += 1;
    const lengths = this.curve.getLengths();
    const f = t * (lengths.length - 1);
    const i = Math.floor(f);
    const next = Math.min(i + 1, lengths.length - 1);
    const len = lengths[i] + (lengths[next] - lengths[i]) * (f - i);
    return Math.round((len / lengths[lengths.length - 1]) * this.count) % this.count;
  }

  _fill(flags, fromCp, toCp, value) {
    const a = this._cpToIndex(fromCp);
    const b = this._cpToIndex(toCp);
    for (let i = a; i !== b; i = (i + 1) % this.count) flags[i] = value;
  }

  _buildSections() {
    const def = this.def;
    const N = this.count;
    const hw = this.halfWidth;
    this.wall = new Uint8Array(N).fill(1);
    this.tunnel = new Uint8Array(N);
    for (const [a, b] of def.open ?? []) this._fill(this.wall, a, b, 0);
    for (const [a, b] of def.tunnels ?? []) {
      this._fill(this.tunnel, a, b, 1);
      this._fill(this.wall, a, b, 1);
    }

    // Fendas: trechos sem piso, precedidos por uma rampa que termina exatamente na borda.
    const rampSamples = Math.max(2, Math.round(CONFIG.track.rampLength / this.segLen));
    this.gap = new Uint8Array(N);
    this.gaps = [];
    for (const g of def.gaps ?? []) {
      const i0 = this._cpToIndex(g.at);
      const count = Math.max(2, Math.round(g.length / this.segLen));
      for (let k = 0; k < count; k++) {
        const i = (i0 + k) % N;
        this.gap[i] = 1;
        this.wall[i] = 0;
        this.tunnel[i] = 0;
      }
      const r0 = (i0 - rampSamples + N) % N;
      this.ramps.push({ i0: r0, i1: r0 + rampSamples, s0: r0 * this.segLen, len: rampSamples * this.segLen, height: CONFIG.track.rampHeight * 1.15 });
      this.gaps.push({ i0, i1: i0 + count, s0: i0 * this.segLen, len: count * this.segLen, approach: rampSamples * this.segLen + 110 });
    }

    const n = CONFIG.race.checkpointCount;
    this.checkpoints = [];
    for (let k = 0; k < n; k++) this.checkpoints.push((k * this.length) / n);
    this.checkpointGap = this.length / n;

    for (const pad of def.boostPads ?? []) {
      const i0 = this._cpToIndex(pad.at);
      this.zones.push({ type: 'boost', i0, i1: i0 + 5, s0: i0 * this.segLen, len: 5 * this.segLen, d0: pad.d - 5, d1: pad.d + 5, center: pad.d });
    }
    for (const rc of def.recharge ?? []) {
      const i0 = this._cpToIndex(rc.from);
      let i1 = this._cpToIndex(rc.to);
      if (i1 <= i0) i1 += N;
      const d0 = rc.side > 0 ? hw - 9.5 : -hw + 1.5;
      this.zones.push({ type: 'recharge', i0, i1, s0: i0 * this.segLen, len: (i1 - i0) * this.segLen, d0, d1: d0 + 8, center: d0 + 4 });
    }
    for (const at of def.ramps ?? []) {
      const i0 = this._cpToIndex(at);
      this.ramps.push({ i0, i1: i0 + rampSamples, s0: i0 * this.segLen, len: rampSamples * this.segLen, height: CONFIG.track.rampHeight });
    }
  }

  // Trechos contíguos (circulares) em que flags[i] é verdadeiro: [início, fim] inclusivos.
  _runs(flags) {
    const N = flags.length;
    let anchor = -1;
    for (let i = 0; i < N; i++) {
      if (!flags[i]) {
        anchor = i;
        break;
      }
    }
    if (anchor < 0) return [[0, N - 1]];
    const runs = [];
    let start = -1;
    for (let k = 1; k <= N; k++) {
      const on = flags[(anchor + k) % N];
      if (on && start < 0) start = anchor + k;
      if (!on && start >= 0) {
        runs.push([start, anchor + k - 1]);
        start = -1;
      }
    }
    return runs;
  }

  // Varre um perfil transversal [d, y, u] ao longo das amostras i0..i1.
  _sweep(i0, i1, profile, { vScale = 24, lift = null } = {}) {
    const N = this.count;
    const rows = i1 - i0 + 1;
    const cols = profile.length;
    const pos = new Float32Array(rows * cols * 3);
    const uv = new Float32Array(rows * cols * 2);
    const P = this.pos, R = this.right, U = this.up;
    let p = 0;
    let q = 0;
    for (let r = 0; r < rows; r++) {
      const k = ((((i0 + r) % N) + N) % N) * 3;
      const extra = lift ? lift(r, rows) : 0;
      const v = ((i0 + r) * this.segLen) / vScale;
      for (let c = 0; c < cols; c++) {
        const d = profile[c][0];
        const y = profile[c][1] + extra;
        pos[p++] = P[k] + R[k] * d + U[k] * y;
        pos[p++] = P[k + 1] + R[k + 1] * d + U[k + 1] * y;
        pos[p++] = P[k + 2] + R[k + 2] * d + U[k + 2] * y;
        uv[q++] = profile[c][2] ?? c / (cols - 1);
        uv[q++] = v;
      }
    }
    const index = [];
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const a = r * cols + c;
        const b = a + 1;
        const e = a + cols;
        const f = e + 1;
        index.push(a, b, e, b, f, e);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(index);
    geo.computeVertexNormals();
    return geo;
  }

  _frameMatrix(i, d = 0, y = 0, sx = 1, sy = 1, sz = 1) {
    const N = this.count;
    const k = (((i % N) + N) % N) * 3;
    const P = this.pos, T = this.tan, R = this.right, U = this.up;
    _p.set(P[k] + R[k] * d + U[k] * y, P[k + 1] + R[k + 1] * d + U[k + 1] * y, P[k + 2] + R[k + 2] * d + U[k + 2] * y);
    _x.set(R[k], R[k + 1], R[k + 2]).multiplyScalar(sx);
    _y.set(U[k], U[k + 1], U[k + 2]).multiplyScalar(sy);
    _z.set(-T[k], -T[k + 1], -T[k + 2]).multiplyScalar(sz);
    return new THREE.Matrix4().makeBasis(_x, _y, _z).setPosition(_p);
  }

  _addMesh(geometries, material, { shadow = false } = {}) {
    const list = Array.isArray(geometries) ? geometries : [geometries];
    if (!list.length) return null;
    const geo = list.length === 1 ? list[0] : mergeGeometries(list);
    if (list.length > 1) list.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(geo, material);
    mesh.receiveShadow = shadow;
    this.group.add(mesh);
    return mesh;
  }

  _addInstances(geometry, material, matrices, colors = null) {
    if (!matrices.length) {
      geometry.dispose();
      material.dispose();
      return null;
    }
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    for (let i = 0; i < matrices.length; i++) {
      mesh.setMatrixAt(i, matrices[i]);
      if (colors) mesh.setColorAt(i, colors[i]);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.group.add(mesh);
    return mesh;
  }

  _buildMeshes(quality, aniso) {
    const C = CONFIG.track;
    const N = this.count;
    const hw = this.halfWidth;
    const W = hw + this.shoulder;
    const wh = C.wallHeight;
    const theme = this.def.theme;
    const basic = (color, extra = {}) => new THREE.MeshBasicMaterial({ color, toneMapped: false, ...extra });
    const additive = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };

    // --- piso ---
    const roadTex = roadTextures(aniso);
    const vTiles = Math.max(1, Math.round(this.length / 24));
    const vScale = this.length / vTiles;
    const roadMat = new THREE.MeshStandardMaterial({
      map: roadTex.map, emissiveMap: roadTex.emissive, emissive: 0xffffff, emissiveIntensity: 1.3,
      roughness: 0.4, metalness: 0.45,
    });
    const solidRuns = this._runs(this.gap.map((v) => (v ? 0 : 1)));
    this._addMesh(solidRuns.map(([a, b]) => this._sweep(a, b + 1, [[-hw, 0, 0], [hw, 0, 1]], { vScale })), roadMat, { shadow: true });

    const hullMat = new THREE.MeshStandardMaterial({ color: 0x0b0718, roughness: 0.7, metalness: 0.3, side: THREE.DoubleSide, flatShading: true });
    const hullProfile = [[-hw, 0], [-W, 0], [-W, -1], [-W * 0.55, -2.6], [W * 0.55, -2.6], [W, -1], [W, 0], [hw, 0]];
    this._addMesh(solidRuns.map(([a, b]) => this._sweep(a, b + 1, hullProfile)), hullMat, { shadow: true });

    // --- bordas, muros e acostamentos ---
    const edgeLMat = basic(neon(theme.edgeLeft, 1.8));
    const edgeRMat = basic(neon(theme.edgeRight, 1.8));
    const dangerMat = basic(neon(COLORS.red, 1.9));
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x140b28, roughness: 0.55, metalness: 0.5, side: THREE.DoubleSide, flatShading: true });
    const dashTex = dashTexture();
    const wallLightL = basic(neon(theme.edgeLeft, 1.5), { map: dashTex, side: THREE.DoubleSide });
    const wallLightR = basic(neon(theme.edgeRight, 1.5), { map: dashTex, side: THREE.DoubleSide });
    const hazardTex = hazardTexture(aniso);
    const hazardMat = basic(neon(0xffffff, 1.15), { map: hazardTex });

    const edgeL = [], edgeR = [], walls = [], lightsL = [], lightsR = [], danger = [], hazard = [];
    for (const [a, b] of this._runs(this.wall)) {
      const e = b + 1;
      edgeL.push(this._sweep(a, e, [[-hw, 0.06, 0], [-hw + 0.7, 0.06, 1]]));
      edgeR.push(this._sweep(a, e, [[hw - 0.7, 0.06, 0], [hw, 0.06, 1]]));
      edgeL.push(this._sweep(a, e, [[-hw - 1.1, wh + 0.03, 0], [-hw - 0.3, wh + 0.03, 1]]));
      edgeR.push(this._sweep(a, e, [[hw + 0.3, wh + 0.03, 0], [hw + 1.1, wh + 0.03, 1]]));
      walls.push(this._sweep(a, e, [[hw + 0.3, 0], [hw + 0.3, wh], [hw + 1.1, wh], [hw + 1.1, -0.2]]));
      walls.push(this._sweep(a, e, [[-hw - 1.1, -0.2], [-hw - 1.1, wh], [-hw - 0.3, wh], [-hw - 0.3, 0]]));
      lightsL.push(this._sweep(a, e, [[-hw - 0.27, wh * 0.4, 0], [-hw - 0.27, wh * 0.8, 1]], { vScale: 8 }));
      lightsR.push(this._sweep(a, e, [[hw + 0.27, wh * 0.4, 0], [hw + 0.27, wh * 0.8, 1]], { vScale: 8 }));
    }
    const openFlags = this.wall.map((v, i) => (v || this.gap[i] ? 0 : 1));
    const openRuns = openFlags.some((v) => v) ? this._runs(openFlags) : [];
    for (const [a, b] of openRuns) {
      const e = b + 1;
      danger.push(this._sweep(a, e, [[-hw, 0.06, 0], [-hw + 0.7, 0.06, 1]]));
      danger.push(this._sweep(a, e, [[hw - 0.7, 0.06, 0], [hw, 0.06, 1]]));
      danger.push(this._sweep(a, e, [[-W, 0.07, 0], [-W + 0.5, 0.07, 1]]));
      danger.push(this._sweep(a, e, [[W - 0.5, 0.07, 0], [W, 0.07, 1]]));
      hazard.push(this._sweep(a, e, [[hw, 0.04, 0], [W - 0.5, 0.04, 1]], { vScale: 5 }));
      hazard.push(this._sweep(a, e, [[-W + 0.5, 0.04, 0], [-hw, 0.04, 1]], { vScale: 5 }));
    }
    this._addMesh(edgeL, edgeLMat);
    this._addMesh(edgeR, edgeRMat);
    this._addMesh(walls, wallMat);
    this._addMesh(lightsL, wallLightL);
    this._addMesh(lightsR, wallLightR);
    for (const g of this.gaps) {
      danger.push(this._sweep(g.i1, g.i1 + 1, [[-W, 0.08, 0], [W, 0.08, 1]]));
    }
    if (danger.length) this._addMesh(danger, dangerMat);
    else dangerMat.dispose();
    if (hazard.length) {
      this._addMesh(hazard, hazardMat);
    } else {
      hazardTex.dispose();
      hazardMat.dispose();
    }

    // --- túneis ---
    const hs = C.tunnelHeightScale;
    const rT = hw + 2.4;
    const tunnelFlags = this.tunnel;
    const tunnelRuns = tunnelFlags.some((v) => v) ? this._runs(tunnelFlags) : [];
    const shells = [];
    const ringMatrices = [];
    const ringColors = [];
    const ringPalette = [neon(theme.edgeLeft, 1.7), neon(theme.edgeRight, 1.7), neon(COLORS.purple, 1.7)];
    const arc = [];
    for (let k = 0; k <= 10; k++) {
      const a = (Math.PI * k) / 10;
      arc.push([Math.cos(a) * rT, Math.sin(a) * rT * hs, k / 10]);
    }
    const strip = (a, r) => [
      [Math.cos(a - 0.035) * r, Math.sin(a - 0.035) * r * hs, 0],
      [Math.cos(a + 0.035) * r, Math.sin(a + 0.035) * r * hs, 1],
    ];
    for (const [a, b] of tunnelRuns) {
      shells.push(this._sweep(a, b + 1, arc));
      const sl = this._sweep(a, b + 1, strip(Math.PI * 0.62, rT - 0.2), { vScale: 8 });
      const sr = this._sweep(a, b + 1, strip(Math.PI * 0.38, rT - 0.2), { vScale: 8 });
      this._addMesh(sl, wallLightL);
      this._addMesh(sr, wallLightR);
      let n = 0;
      for (let i = a; i <= b + 1; i += 3, n++) {
        const edge = i === a || i + 3 > b + 1;
        const scale = edge ? 1.07 : 1;
        ringMatrices.push(this._frameMatrix(i, 0, 0, scale, hs * scale, edge ? 2.5 : 1));
        ringColors.push(edge ? neon(COLORS.orange, 2.0) : ringPalette[n % ringPalette.length]);
      }
    }
    if (shells.length) {
      const tunnelMat = new THREE.MeshStandardMaterial({ color: 0x0b0619, roughness: 0.5, metalness: 0.5, side: THREE.DoubleSide, flatShading: true });
      this._addMesh(shells, tunnelMat);
    }
    this._addInstances(new THREE.TorusGeometry(hw + 2.0, 0.42, 5, 18, Math.PI), basic(0xffffff), ringMatrices, ringColors);

    // --- boost, recarga e rampas ---
    const boostTex = chevronTexture(aniso, '#000');
    const boostMat = basic(neon(COLORS.orange, 1.9), { map: boostTex, ...additive });
    const rechargeTex = rechargeTexture(aniso);
    const rechargeMat = basic(neon(COLORS.blue, 1.9), { map: rechargeTex, ...additive, opacity: 0.8 });
    const rampTex = chevronTexture(aniso, '#1a0830');
    const rampMat = basic(neon(COLORS.magenta, 1.6), { map: rampTex });
    const boostGeos = [], rechargeGeos = [], rampGeos = [];
    for (const z of this.zones) {
      if (z.type === 'boost') boostGeos.push(this._sweep(z.i0, z.i1, [[z.d0 + 0.5, 0.05, 0], [z.d1 - 0.5, 0.05, 1]], { vScale: 10 }));
      else rechargeGeos.push(this._sweep(z.i0, z.i1, [[z.d0, 0.05, 0], [z.d1, 0.05, 2]], { vScale: 4 }));
    }
    for (const r of this.ramps) {
      rampGeos.push(this._sweep(r.i0, r.i1, [[-hw + 1.2, 0.05, 0], [hw - 1.2, 0.05, 3]], { vScale: 8, lift: (row, rows) => (r.height * row) / (rows - 1) }));
    }
    this._addMesh(boostGeos, boostMat);
    this._addMesh(rechargeGeos, rechargeMat);
    this._addMesh(rampGeos, rampMat);
    this._animated.boostTex = boostTex;
    this._animated.rechargeTex = rechargeTex;
    this._animated.rechargeMat = rechargeMat;
    this._animated.rampTex = rampTex;

    // --- largada ---
    this._addMesh(this._sweep(0, 1, [[-hw, 0.05, 0], [hw, 0.05, 7.5]], { vScale: this.segLen }), basic(neon(0xffffff, 1.05), { map: checkerTexture() }));
    this._buildStartGantry(aniso);

    // --- checkpoints e portais ---
    const gateSpan = hw + 2.1;
    const gateParts = [
      new THREE.BoxGeometry(0.6, 12, 0.6).translate(-gateSpan, 6, 0),
      new THREE.BoxGeometry(0.6, 12, 0.6).translate(gateSpan, 6, 0),
      new THREE.BoxGeometry(gateSpan * 2 + 0.6, 0.6, 0.6).translate(0, 12, 0),
      new THREE.BoxGeometry(gateSpan * 2 - 6, 0.3, 0.3).translate(0, 10.8, 0),
    ];
    const gateGeo = mergeGeometries(gateParts);
    gateParts.forEach((g) => g.dispose());
    const gateMatrices = [];
    const gateColors = [];
    const cpLines = [];
    const cpColor = neon(COLORS.blue, 2.2);
    const decoColor = neon(COLORS.purple, 1.8);
    for (let k = 1; k < this.checkpoints.length; k++) {
      const i = Math.round(this.checkpoints[k] / this.segLen) % N;
      if (!this.gap[i]) cpLines.push(this._sweep(i, i + 1, [[-hw + 0.8, 0.05, 0], [hw - 0.8, 0.05, 1]]));
      if (!this.tunnel[i] && !this.gap[i]) {
        gateMatrices.push(this._frameMatrix(i));
        gateColors.push(cpColor);
      }
      const mid = Math.round((this.checkpoints[k] + this.checkpointGap / 2) / this.segLen) % N;
      if (!this.tunnel[mid] && !this.gap[mid]) {
        gateMatrices.push(this._frameMatrix(mid, 0, 0, 1, 0.85, 1));
        gateColors.push(decoColor);
      }
    }
    // Pórtico vermelho avisando a fenda logo antes da rampa.
    for (const g of this.gaps) {
      gateMatrices.push(this._frameMatrix(g.i0 - Math.round(CONFIG.track.rampLength / this.segLen) - 3, 0, 0, 1, 0.9, 2.5));
      gateColors.push(neon(COLORS.red, 2.4));
    }
    this._addInstances(gateGeo, basic(0xffffff), gateMatrices, gateColors);
    this._addMesh(cpLines, basic(neon(COLORS.blue, 1.8), { ...additive, opacity: 0.45 }));

    // --- postes luminosos (reforçam a sensação de velocidade) ---
    const postMatrices = [];
    const postColors = [];
    const postL = neon(theme.edgeLeft, 1.7);
    const postR = neon(theme.edgeRight, 1.7);
    for (let i = 0; i < N; i += 6) {
      if (this.tunnel[i] || !this.wall[i]) continue;
      postMatrices.push(this._frameMatrix(i, -hw - 3, 0));
      postColors.push(postL);
      postMatrices.push(this._frameMatrix(i, hw + 3, 0));
      postColors.push(postR);
    }
    this._addInstances(new THREE.BoxGeometry(0.32, 5.5, 0.32).translate(0, 2.75, 0), basic(0xffffff), postMatrices, postColors);

    // --- setas de curva no lado externo ---
    const arrowMatrices = [];
    const arrowColors = [];
    const mild = neon(COLORS.orange, 1.8);
    const sharp = neon(COLORS.red, 2.0);
    for (let i = 0; i < N; i += 5) {
      const k = this.curvBroad[i];
      if (Math.abs(k) < 0.0045 || this.tunnel[i] || this.gap[i]) continue;
      const dir = k > 0 ? 1 : -1;
      // Escala X negativa espelha a seta nas curvas à esquerda (material DoubleSide).
      arrowMatrices.push(this._frameMatrix(i, -dir * (hw + 0.7), wh + 1.9, dir, 1, 1));
      arrowColors.push(Math.abs(k) > 0.0105 ? sharp : mild);
    }
    this._addInstances(new THREE.PlaneGeometry(6.4, 2.8), basic(0xffffff, { map: arrowTexture(aniso), side: THREE.DoubleSide }), arrowMatrices, arrowColors);

    // --- pilares de sustentação ---
    const pillarMatrices = [];
    const pillarScale = new THREE.Vector3();
    const noRot = new THREE.Quaternion();
    for (let i = 0; i < N; i += 20) {
      const top = this.pos[i * 3 + 1] - 2.4;
      const height = top - C.groundY;
      if (height < 4 || this.gap[i]) continue;
      _p.set(this.pos[i * 3], top - height / 2, this.pos[i * 3 + 2]);
      pillarScale.set(1, height, 1);
      pillarMatrices.push(new THREE.Matrix4().compose(_p, noRot, pillarScale));
    }
    this._addInstances(new THREE.BoxGeometry(5, 1, 5), new THREE.MeshStandardMaterial({ color: 0x0f0920, roughness: 0.6, metalness: 0.4 }), pillarMatrices);

    // --- painéis holográficos ---
    const holoDefs = [
      ['HYPERDRIVE', 'LIGA ANTIGRAVIDADE // NX-88', '#00e5ff'],
      ['VORTEX', 'ENERGIA IÔNICA 9000 GW', '#ff2bd6'],
      ['NEON GRID', 'SETOR ORBITAL 7 // ABERTO', '#ff9a1f'],
    ];
    const holoGeo = new THREE.PlaneGeometry(30, 15);
    const holoBuckets = holoDefs.map(() => []);
    const panelStride = Math.round(N / 14);
    let panelIndex = 0;
    for (let i = Math.round(panelStride / 2); i < N; i += panelStride, panelIndex++) {
      if (this.tunnel[i]) continue;
      const side = panelIndex % 2 ? 1 : -1;
      const m = this._frameMatrix(i, side * (hw + 26), 15);
      m.multiply(new THREE.Matrix4().makeRotationY(-side * 0.55));
      holoBuckets[panelIndex % holoDefs.length].push(m);
    }
    this._animated.holoMats = [];
    holoDefs.forEach(([title, sub, color], idx) => {
      const mat = basic(neon(0xffffff, 1.2), { map: holoTexture(title, sub, color), ...additive, side: THREE.DoubleSide, opacity: 0.8 });
      const mesh = this._addInstances(idx === 0 ? holoGeo : holoGeo.clone(), mat, holoBuckets[idx]);
      if (mesh) this._animated.holoMats.push(mat);
    });
  }

  _buildStartGantry(aniso) {
    const hw = this.halfWidth;
    const span = hw + 2.4;
    const gantry = new THREE.Group();
    gantry.matrixAutoUpdate = false;
    gantry.matrix.copy(this._frameMatrix(0));
    const dark = new THREE.MeshStandardMaterial({ color: 0x150c2b, roughness: 0.5, metalness: 0.6, flatShading: true });
    const parts = [
      new THREE.BoxGeometry(1.4, 15, 1.4).translate(-span, 7.5, 0),
      new THREE.BoxGeometry(1.4, 15, 1.4).translate(span, 7.5, 0),
      new THREE.BoxGeometry(span * 2 + 1.4, 3.6, 1.0).translate(0, 13.6, 0),
    ];
    const frame = new THREE.Mesh(mergeGeometries(parts), dark);
    parts.forEach((g) => g.dispose());
    gantry.add(frame);
    const bannerMat = new THREE.MeshBasicMaterial({ map: bannerTexture(aniso), color: neon(0xffffff, 1.25), toneMapped: false, side: THREE.DoubleSide });
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(span * 2 - 1, 3), bannerMat);
    banner.position.set(0, 13.6, 0.56);
    gantry.add(banner);
    const trimMat = new THREE.MeshBasicMaterial({ color: neon(COLORS.cyan, 1.7), toneMapped: false });
    const trimParts = [
      new THREE.BoxGeometry(span * 2 + 1.6, 0.25, 1.2).translate(0, 15.5, 0),
      new THREE.BoxGeometry(span * 2 + 1.6, 0.25, 1.2).translate(0, 11.7, 0),
    ];
    gantry.add(new THREE.Mesh(mergeGeometries(trimParts), trimMat));
    trimParts.forEach((g) => g.dispose());
    this.group.add(gantry);
  }
}
