import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeCanvasTexture, neon } from './Utils.js';

export const HULL_EMISSIVE = 0.42;

let glowTexture = null;

// Textura radial compartilhada pelo brilho projetado no piso.
export function getGlowTexture() {
  if (!glowTexture) {
    glowTexture = makeCanvasTexture(64, 64, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
  }
  return glowTexture;
}

function merge(list) {
  const prepared = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const merged = mergeGeometries(prepared);
  list.forEach((g) => g.dispose());
  prepared.forEach((g) => g.dispose());
  return merged;
}

function wingGeometry(side, sh) {
  const shape = new THREE.Shape();
  shape.moveTo(side * 0.4, -0.8);
  shape.lineTo(side * sh.span, sh.sweep);
  shape.lineTo(side * sh.span, sh.sweep + 0.8);
  shape.lineTo(side * 0.4, 2.1);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: false });
  g.rotateX(Math.PI / 2);
  g.rotateZ(-side * sh.anhedral);
  g.translate(0, 0.08, 0);
  return g;
}

function finGeometry(side, sh) {
  const shape = new THREE.Shape();
  shape.moveTo(1.3, 0);
  shape.lineTo(2.55, 0);
  shape.lineTo(2.8, sh.finH);
  shape.lineTo(2.25, sh.finH);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false });
  g.translate(0, 0, -0.05);
  g.rotateY(-Math.PI / 2);
  g.rotateZ(-side * 0.38);
  g.translate(side * sh.engineSpread, 0.3, 0);
  return g;
}

const metricsCache = new Map();

// Medidas usadas para a nave não atravessar piso nem muros:
//   probes   vértices que ficam mais baixos em alguma combinação de inclinação lateral e de nariz;
//            testar só esses pontos a cada quadro equivale a testar a malha inteira
//   halfSpan meia envergadura (unidades do modelo)
function measureShip(key, geometries) {
  if (metricsCache.has(key)) return metricsCache.get(key);
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const picked = new Map();
  let halfSpan = 0;
  for (const geo of geometries) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) halfSpan = Math.max(halfSpan, Math.abs(pos.getX(i)));
  }
  for (let roll = -0.9; roll <= 0.901; roll += 0.15) {
    for (let pitch = -0.75; pitch <= 0.751; pitch += 0.15) {
      q.setFromEuler(euler.set(pitch, 0, roll));
      let lowest = Infinity;
      let lowestKey = '';
      let lowestPoint = null;
      geometries.forEach((geo, g) => {
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const y = v.fromBufferAttribute(pos, i).applyQuaternion(q).y;
          if (y < lowest) {
            lowest = y;
            lowestKey = `${g}:${i}`;
            lowestPoint = new THREE.Vector3().fromBufferAttribute(pos, i);
          }
        }
      });
      if (lowestPoint) picked.set(lowestKey, lowestPoint);
    }
  }
  const metrics = { probes: [...picked.values()], halfSpan };
  metricsCache.set(key, metrics);
  return metrics;
}

// Fighter antigravitacional procedural. O nariz aponta para -Z.
export function createShipModel(def, colors) {
  const sh = def.shape;
  const hull = [];
  const accent = [];
  const glow = [];
  const flames = [];

  hull.push(new THREE.ConeGeometry(sh.bodyW, sh.nose, 6).rotateX(-Math.PI / 2).scale(1, 0.5, 1).translate(0, 0, -sh.nose / 2));
  hull.push(new THREE.CylinderGeometry(sh.bodyW, sh.bodyW * 0.72, 2.6, 6).rotateX(-Math.PI / 2).scale(1, 0.5, 1).translate(0, 0, 1.3));

  for (const side of [-1, 1]) {
    hull.push(wingGeometry(side, sh));
    hull.push(finGeometry(side, sh));
    hull.push(new THREE.CylinderGeometry(0.4, 0.5, 1.7, 8).rotateX(-Math.PI / 2).translate(side * sh.engineSpread, 0.05, 1.95));
    accent.push(
      new THREE.BoxGeometry(0.14, 0.22, 1.0)
        .translate(side * sh.span, -0.07, sh.sweep + 0.4)
        .rotateZ(-side * sh.anhedral)
        .translate(0, 0.08, 0),
    );
    accent.push(new THREE.BoxGeometry(0.08, 0.08, sh.nose * 0.6).rotateY(side * 0.22).translate(side * sh.bodyW * 0.42, 0.17, -sh.nose * 0.4));
    glow.push(new THREE.CircleGeometry(0.37, 10).translate(side * sh.engineSpread, 0.05, 2.81));
    flames.push(new THREE.ConeGeometry(0.33, 1, 8, 1, true).rotateX(Math.PI / 2).translate(side * sh.engineSpread, 0.05, 0.5));
  }
  accent.push(new THREE.BoxGeometry(0.12, 0.08, 2.3).translate(0, sh.bodyW * 0.5 + 0.02, 1.35));

  const cockpitGeo = new THREE.SphereGeometry(0.5, 8, 5).scale(sh.bodyW * 0.8, 0.52, 1.75).translate(0, 0.27, -0.45);

  const hullMaterial = new THREE.MeshStandardMaterial({
    color: colors.primary, metalness: 0.4, roughness: 0.4, flatShading: true,
    emissive: colors.primary, emissiveIntensity: HULL_EMISSIVE,
  });
  const accentMaterial = new THREE.MeshBasicMaterial({ color: neon(colors.accent, 1.7), toneMapped: false });
  const cockpitMaterial = new THREE.MeshStandardMaterial({ color: 0x05060c, metalness: 0.9, roughness: 0.12, flatShading: true });
  const glowMaterial = new THREE.MeshBasicMaterial({ color: neon(colors.engine, 1.5), toneMapped: false });
  const flameMaterial = new THREE.MeshBasicMaterial({
    color: neon(colors.engine, 1.1), transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  });

  const group = new THREE.Group();
  const hullGeo = merge(hull);
  const accentGeo = merge(accent);
  const hullMesh = new THREE.Mesh(hullGeo, hullMaterial);
  hullMesh.castShadow = true;
  const flame = new THREE.Mesh(merge(flames), flameMaterial);
  flame.position.z = 2.8;
  group.add(hullMesh, new THREE.Mesh(accentGeo, accentMaterial), new THREE.Mesh(cockpitGeo, cockpitMaterial), new THREE.Mesh(merge(glow), glowMaterial), flame);

  const baseEmissive = new THREE.Color(colors.primary);
  const metrics = measureShip(def.id, [hullGeo, accentGeo]);

  return {
    group,
    hullMaterial,
    flame,
    flameMaterial,
    baseEmissive,
    engineSpread: sh.engineSpread,
    probes: metrics.probes,
    halfSpan: metrics.halfSpan,
    dispose() {
      group.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      });
      if (group.parent) group.parent.remove(group);
    },
  };
}
