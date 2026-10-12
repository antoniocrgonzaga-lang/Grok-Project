import * as THREE from 'three';

export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);
export const lerp = (a, b, t) => a + (b - a) * t;

// Aproximação exponencial independente da taxa de quadros.
export const damp = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function formatTime(t) {
  if (t == null || !Number.isFinite(t)) return '-:--.---';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}

export function cssColor(hex) {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

// Cor emissiva em HDR (valores acima de 1 alimentam o bloom).
export function neon(hex, intensity = 1) {
  return new THREE.Color(hex).multiplyScalar(intensity);
}

export function makeCanvasTexture(width, height, draw, { repeat = false, anisotropy = 1, srgb = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = anisotropy;
  return tex;
}

const TEXTURE_SLOTS = ['map', 'emissiveMap', 'alphaMap'];

export function disposeObject(root) {
  root.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (!obj.material) return;
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of materials) {
      for (const slot of TEXTURE_SLOTS) if (mat[slot]) mat[slot].dispose();
      mat.dispose();
    }
  });
  if (root.parent) root.parent.remove(root);
}
