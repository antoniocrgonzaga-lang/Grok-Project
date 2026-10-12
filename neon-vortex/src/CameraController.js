import * as THREE from 'three';
import { CONFIG } from './Config.js';
import { clamp, damp } from './Utils.js';

const _frame = { pos: new THREE.Vector3(), tan: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3() };
const _pos = new THREE.Vector3();
const _look = new THREE.Vector3();
const _ahead = new THREE.Vector3();

export class CameraController {
  constructor(camera) {
    this.camera = camera;
    this.modeIndex = 0;
    this.dir = new THREE.Vector3(0, 0, -1);
    this.up = new THREE.Vector3(0, 1, 0);
    this.distance = CONFIG.camera.modes[0].distance;
    this.roll = 0;
    this.fov = camera.fov;
    this.shakeAmount = 0;
    this.orbit = 0;
  }

  get mode() {
    return CONFIG.camera.modes[this.modeIndex];
  }

  cycleMode() {
    this.modeIndex = (this.modeIndex + 1) % CONFIG.camera.modes.length;
    return this.mode;
  }

  shake(amount) {
    this.shakeAmount = Math.min(1, Math.max(this.shakeAmount, amount));
  }

  snap(ship) {
    this.dir.copy(ship.forward);
    this.up.copy(ship.up);
    this.distance = this.mode.distance;
    this.roll = 0;
    this.shakeAmount = 0;
  }

  update(dt, ship, track) {
    const mode = this.mode;
    const camera = this.camera;
    const speedK = clamp(ship.v / ship.stats.maxSpeed, 0, 1.4);
    const boostK = ship.boostLevel;

    this.dir.lerp(ship.forward, 1 - Math.exp(-mode.dirRate * dt)).normalize();
    this.up.lerp(ship.up, 1 - Math.exp(-6 * dt)).normalize();

    // Ponto de fuga um pouco à frente na pista: antecipa as curvas.
    track.frameAt(ship.s + 22 + Math.max(0, ship.v) * 0.25, _frame);
    _ahead.copy(_frame.pos).addScaledVector(_frame.right, ship.d * 0.6).addScaledVector(_frame.up, 1.4);

    if (mode.cockpit) {
      _pos.copy(ship.position).addScaledVector(ship.up, mode.height).addScaledVector(ship.forward, mode.forward);
      _look.copy(_pos).addScaledVector(this.dir, 40);
      if (!ship.falling) _look.lerp(_ahead, mode.anticipation);
    } else {
      const targetDistance = mode.distance + boostK * mode.boostPull + clamp(speedK, 0, 1) * mode.speedPull;
      this.distance = damp(this.distance, targetDistance, 4, dt);
      _pos
        .copy(ship.position)
        .addScaledVector(this.dir, -this.distance)
        .addScaledVector(this.up, mode.height)
        .addScaledVector(ship.right, -ship.steer * 0.9);
      _look.copy(ship.position).addScaledVector(this.dir, 14).addScaledVector(this.up, 1.6);
      if (!ship.falling) _look.lerp(_ahead, mode.anticipation);
    }

    if (this.shakeAmount > 0.001) {
      const a = this.shakeAmount * this.shakeAmount * 0.9;
      _pos.x += (Math.random() - 0.5) * a;
      _pos.y += (Math.random() - 0.5) * a;
      _pos.z += (Math.random() - 0.5) * a;
      this.shakeAmount = Math.max(0, this.shakeAmount - dt * 2.6);
    }
    // Vibração contínua e sutil em velocidade extrema.
    const rumble = Math.max(0, speedK - 0.95) * 0.12 + boostK * 0.035;
    if (rumble > 0) {
      _pos.x += (Math.random() - 0.5) * rumble;
      _pos.y += (Math.random() - 0.5) * rumble;
    }

    camera.position.copy(_pos);
    camera.up.copy(this.up);
    camera.lookAt(_look);
    this.roll = damp(this.roll, -ship.steer * mode.roll, 5, dt);
    camera.rotateZ(this.roll);

    const fovTarget = mode.fov + clamp(speedK, 0, 1) * CONFIG.camera.fovSpeed + boostK * CONFIG.camera.fovBoost;
    this.fov = damp(this.fov, fovTarget, 5, dt);
    if (Math.abs(camera.fov - this.fov) > 0.01) {
      camera.fov = this.fov;
      camera.updateProjectionMatrix();
    }
  }

  // Câmera de vitrine: orbita um ponto fixo (seleção de nave, contagem regressiva, resultado).
  // lookOffset desloca o ponto de mira na vertical (negativo = o alvo aparece mais alto na tela).
  updateOrbit(dt, center, up, radius, height, speed, lookOffset = 0.6) {
    this.orbit += dt * speed;
    const camera = this.camera;
    camera.position.set(center.x + Math.cos(this.orbit) * radius, center.y + height, center.z + Math.sin(this.orbit) * radius);
    camera.up.copy(up);
    _look.copy(center).addScaledVector(up, lookOffset);
    camera.lookAt(_look);
    this._relaxFov(dt, 55);
  }

  // Sobrevoo da pista usado como fundo dos menus.
  updateFlyover(dt, track, s, time) {
    const camera = this.camera;
    track.frameAt(s, _frame);
    _pos.copy(_frame.pos).addScaledVector(_frame.up, 13 + Math.sin(time * 0.3) * 3).addScaledVector(_frame.right, Math.sin(time * 0.17) * 9);
    track.frameAt(s + 70, _frame);
    _look.copy(_frame.pos).addScaledVector(_frame.up, 3);
    camera.position.copy(_pos);
    camera.up.set(0, 1, 0);
    camera.lookAt(_look);
    this._relaxFov(dt, 72);
  }

  _relaxFov(dt, target) {
    const camera = this.camera;
    this.fov = damp(this.fov, target, 3, dt);
    if (Math.abs(camera.fov - this.fov) > 0.01) {
      camera.fov = this.fov;
      camera.updateProjectionMatrix();
    }
  }
}
