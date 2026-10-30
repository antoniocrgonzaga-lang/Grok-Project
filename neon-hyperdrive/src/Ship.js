import * as THREE from 'three';
import { CONFIG } from './Config.js';
import { clamp, damp, neon } from './Utils.js';
import { createShipModel, getGlowTexture, HULL_EMISSIVE } from './ShipModel.js';
import { Trail } from './Effects.js';

const _frame = { pos: new THREE.Vector3(), tan: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3() };
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _v = new THREE.Vector3();
const _back = new THREE.Vector3();
const _red = new THREE.Color(1, 0.05, 0.1);

let underglowGeometry = null;

function getUnderglowGeometry() {
  if (!underglowGeometry) underglowGeometry = new THREE.PlaneGeometry(8, 11).rotateX(-Math.PI / 2);
  return underglowGeometry;
}

// Base comum ao jogador e à IA. A nave vive em coordenadas locais da pista:
// s = distância ao longo da spline, d = deslocamento lateral, h = altura sobre o piso.
export class Ship {
  constructor({ track, def, colors, name, isPlayer = false, scene, effects, trailPoints = 20 }) {
    this.track = track;
    this.def = def;
    this.stats = def.stats;
    this.colors = colors;
    this.name = name;
    this.isPlayer = isPlayer;
    this.effects = effects;
    this.maxEnergy = def.stats.energy;
    this.onEvent = null;
    this.speedScale = 1;

    this.input = { throttle: 0, brake: 0, steer: 0, boost: false, drift: false };

    this.model = createShipModel(def, colors);
    this.group = this.model.group;
    this.scale = CONFIG.ship.visualScale;
    this.group.scale.setScalar(this.scale);
    scene.add(this.group);
    // Limite lateral por nave: a ponta da asa encosta na face interna do muro, sem atravessá-la.
    this.halfSpan = this.model.halfSpan * this.scale;
    this.wallLimit = Math.min(track.halfWidth - CONFIG.ship.width / 2, track.halfWidth + 0.3 - this.halfSpan - 0.15);
    this.lift = 0;

    const trailColor = neon(colors.engine, 1.15);
    this.trails = [new Trail(trailPoints, trailColor), new Trail(trailPoints, trailColor)];
    for (const t of this.trails) scene.add(t.mesh);

    this.underglowMaterial = new THREE.MeshBasicMaterial({
      map: getGlowTexture(), color: neon(colors.engine, 1.2), transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    this.underglow = new THREE.Mesh(getUnderglowGeometry(), this.underglowMaterial);
    this.underglow.renderOrder = 3;
    scene.add(this.underglow);

    this.position = new THREE.Vector3();
    this.forward = new THREE.Vector3(0, 0, -1);
    this.right = new THREE.Vector3(1, 0, 0);
    this.up = new THREE.Vector3(0, 1, 0);
    this.engineColor = neon(colors.engine, 1.0);
    this.accentColor = neon(colors.accent, 2.0);
    this.phase = Math.random() * 10;
    this._exhaust = 0;
    this._smoke = 0;

    this.reset(0, 0);
  }

  reset(s, d) {
    this.s = this.track.wrap(s);
    this.d = d;
    this.h = 0;
    this.vh = 0;
    this.theta = 0;
    this.v = 0;
    this.slip = 0;
    this.yawRate = 0;
    this.steer = 0;
    this.sPrev = this.s;
    this.frameDs = 0;
    this.skipFrom = this.s;
    this.skipDs = 0;

    this.energy = this.maxEnergy;
    this.boostCharge = 100;
    this.boosting = false;
    this.boostRegenDelay = 0;
    this.padBoost = 0;
    this.boostLevel = 0;
    this.drifting = false;
    this.airborne = false;
    this.falling = false;
    this.onShoulder = false;
    this.recharging = false;
    this.grinding = false;
    this.invuln = 0;
    this.respawnCooldown = 0;
    this.hitCooldown = 0;
    this.ko = false;
    this.koTimer = 0;
    this.damageFlash = 0;

    this.lap = 0;
    this.nextCheckpoint = 0;
    this.checkpointsPassed = 0;
    this.lapStart = 0;
    this.lastLap = null;
    this.bestLap = null;
    this.finished = false;
    this.finishTime = null;
    this.progress = 0;
    this.rank = 1;

    this.roll = 0;
    this.pitch = 0;
    this.yawVisual = 0;
    this.input.throttle = 0;
    this.input.brake = 0;
    this.input.steer = 0;
    this.input.boost = false;
    this.input.drift = false;

    this._updateVectors();
    this._resetTrails();
  }

  get grounded() {
    return !this.airborne && !this.falling;
  }

  get energyRatio() {
    return this.energy / this.maxEnergy;
  }

  // Taxa de giro máxima disponível na velocidade atual (sem drift).
  maxYawRate() {
    const P = CONFIG.physics;
    const speed = Math.abs(this.v);
    const low = clamp(speed / P.lowSpeedTurnRef, 0, 1);
    const ratio = clamp(speed / this.stats.maxSpeed, 0, 1);
    return this.stats.turnRate * low * (1 - P.highSpeedTurnLoss * ratio * ratio);
  }

  // Subclasses preenchem this.input a cada passo.
  control() {}

  integrate(dt) {
    const P = CONFIG.physics;
    const E = CONFIG.energy;
    const st = this.stats;
    const track = this.track;
    const inp = this.input;

    this.sPrev = this.s;
    this.frameDs = 0;
    this.invuln = Math.max(0, this.invuln - dt);
    this.respawnCooldown = Math.max(0, this.respawnCooldown - dt);
    this.hitCooldown = Math.max(0, this.hitCooldown - dt);
    this.damageFlash = Math.max(0, this.damageFlash - dt * 3);
    this.recharging = false;

    if (this.ko) {
      inp.throttle = 0;
      inp.brake = 0;
      inp.steer = 0;
      inp.boost = false;
      inp.drift = false;
      this.v *= Math.exp(-2.5 * dt);
      this.koTimer -= dt;
    }

    const grounded = this.grounded;

    // --- direção ---
    const steerRate = Math.abs(inp.steer) > Math.abs(this.steer) || inp.steer * this.steer < 0 ? P.steerRise : P.steerReturn;
    this.steer = damp(this.steer, inp.steer, steerRate, dt);
    const speedAbs = Math.abs(this.v);
    this.drifting = inp.drift && grounded && speedAbs > P.driftMinSpeed;
    let turn = this.maxYawRate();
    if (this.drifting) turn *= P.driftTurnScale;
    if (!grounded) turn *= P.airControl;
    const yawTarget = this.steer * turn * (this.v < 0 ? -1 : 1);
    this.yawRate = damp(this.yawRate, yawTarget, P.yawResponse, dt);
    this.theta += this.yawRate * dt;

    // --- boost ---
    let wantBoost = inp.boost;
    if (wantBoost && !this.boosting && (this.boostCharge < E.boostMinStart || this.energy < E.boostMinEnergy)) wantBoost = false;
    if (wantBoost && (this.boostCharge <= 0 || this.energy <= E.boostMinEnergy * 0.5)) wantBoost = false;
    if (wantBoost && !this.boosting) this._emit('boostStart');
    this.boosting = wantBoost;
    if (this.boosting) {
      this.boostCharge = Math.max(0, this.boostCharge - E.boostDrain * dt);
      this.energy -= E.boostEnergyCost * dt;
      this.boostRegenDelay = E.boostRegenDelay;
    } else {
      this.boostRegenDelay -= dt;
      if (this.boostRegenDelay <= 0) this.boostCharge = Math.min(100, this.boostCharge + E.boostRegen * dt);
    }
    this.padBoost = Math.max(0, this.padBoost - dt);
    const boostActive = this.boosting || this.padBoost > 0;
    this.boostLevel = damp(this.boostLevel, boostActive ? 1 : 0, boostActive ? 8 : 3, dt);

    // --- velocidade ---
    let vmax = st.maxSpeed * this.speedScale;
    let accel = st.accel * this.speedScale;
    if (this.boosting) {
      vmax *= st.boostMult;
      accel = st.boostAccel;
    }
    if (this.padBoost > 0) {
      vmax = Math.max(vmax, st.maxSpeed * this.speedScale * E.padSpeedMult);
      accel = Math.max(accel, E.padAccel);
    }
    if (this.onShoulder) vmax *= P.shoulderMaxFactor;
    // Raspar no muro não pode ser um atalho: limita a velocidade e desgasta a nave.
    if (this.grinding) {
      vmax *= P.grindMaxFactor;
      if (!this.ko && this.invuln <= 0) this.energy -= E.grindDrain * dt;
    }

    if (inp.throttle > 0 && this.v < vmax) {
      const falloff = 1 - P.accelFalloff * clamp(this.v / vmax, 0, 1);
      this.v = Math.min(vmax, this.v + accel * falloff * inp.throttle * dt);
    }
    if (this.v > vmax) {
      const decel = P.overspeedDecel + (this.onShoulder ? P.shoulderDecel : 0);
      this.v = Math.max(vmax, this.v - decel * dt);
    }
    if (inp.throttle <= 0 && this.v !== 0) {
      const drag = (P.coastDrag + P.linearDrag * speedAbs) * dt;
      this.v = Math.abs(this.v) <= drag ? 0 : this.v - Math.sign(this.v) * drag;
    }
    if (inp.brake > 0) {
      if (this.v > 0) this.v = Math.max(0, this.v - P.brakeDecel * inp.brake * dt);
      else if (inp.throttle <= 0) this.v = Math.max(-P.reverseSpeed, this.v - 22 * inp.brake * dt);
    }
    if (this.drifting) this.v = Math.max(0, this.v - P.driftDecel * dt);
    this.v = Math.max(-P.reverseSpeed, this.v - Math.abs(this.slip) * 0.06 * dt);

    // --- derrapagem lateral (inércia / força centrífuga simulada) ---
    const slide = this.drifting ? P.driftSlideFactor : P.slideFactor;
    const grip = st.grip * (this.drifting ? P.driftGripScale : 1) * (grounded ? 1 : 0.15);
    if (grounded) this.slip -= this.yawRate * this.v * slide * dt;
    this.slip *= Math.exp(-grip * dt);

    // --- deslocamento em coordenadas da pista ---
    const cosT = Math.cos(this.theta);
    const sinT = Math.sin(this.theta);
    const kappa = track.curvatureAt(this.s);
    const metric = 1 / Math.max(0.5, 1 - kappa * this.d);
    const ds = (this.v * cosT - this.slip * sinT) * metric * dt;
    this.d += (this.v * sinT + this.slip * cosT) * dt;
    // A pista gira sob a nave: sem esterçar, o rumo relativo abre para fora da curva.
    this.theta -= kappa * ds * (1 - P.curveAssist);
    if (grounded && !this.drifting) {
      const assist = P.alignAssist * (1 - Math.min(1, Math.abs(this.steer) * 1.5));
      this.theta -= this.theta * Math.min(1, assist * dt);
    }
    this.theta = clamp(this.theta, -P.maxHeading, P.maxHeading);
    this.s = track.wrap(this.s + ds);
    this.frameDs = ds;

    this._integrateVertical(dt);

    // --- zonas ---
    if (this.grounded && !this.ko) {
      const zone = track.zoneAt(this.s, this.d);
      if (zone === 'boost') {
        if (this.padBoost < E.padDuration * 0.5) this._emit('boostPad');
        this.padBoost = E.padDuration;
      } else if (zone === 'recharge' && this.energy < this.maxEnergy) {
        this.energy = Math.min(this.maxEnergy, this.energy + E.rechargeRate * dt);
        this.recharging = true;
      }
    }

    // --- energia esgotada ---
    if (this.energy <= 0 && !this.ko) {
      this.energy = 0;
      this.ko = true;
      this.koTimer = E.koRecoverTime;
      this.boosting = false;
      this.padBoost = 0;
      this._emit('ko');
    }
    if (this.ko && this.koTimer <= 0) {
      this.ko = false;
      this.energy = this.maxEnergy * E.koRestore;
      this.respawn(false);
    }
  }

  _integrateVertical(dt) {
    const P = CONFIG.physics;
    const track = this.track;
    const ground = track.groundLift(this.s);
    const hasGround = track.hasGround(this.s, this.d);

    if (this.falling) {
      this.vh -= P.gravity * dt;
      this.h += this.vh * dt;
      this.v *= Math.exp(-0.9 * dt);
      if (this.h < -P.fallDepth) this.respawn(true);
    } else if (!hasGround) {
      this.airborne = true;
      this.vh -= P.gravity * dt;
      this.h += this.vh * dt;
      if (this.h < -1) {
        this.falling = true;
        this._emit('fall');
      }
    } else if (this.airborne) {
      this.vh -= P.gravity * dt;
      this.h += this.vh * dt;
      if (this.h <= ground) {
        this._emit('land', -this.vh);
        this.h = ground;
        this.vh = 0;
        this.airborne = false;
      }
    } else {
      const rise = ground - this.h;
      if (rise < -0.25) {
        // O piso sumiu sob a nave (fim da rampa): ela segue em voo com a velocidade vertical acumulada.
        this.airborne = true;
      } else {
        this.vh = dt > 0 ? clamp(rise / dt, 0, 17) : 0;
        this.h = ground;
      }
    }
  }

  applyDamage(amount, strong = false) {
    if (this.invuln > 0 || this.ko || amount <= 0) return;
    this.energy -= amount;
    this.damageFlash = 1;
    if (strong) this.invuln = CONFIG.energy.invulnTime;
  }

  // Recoloca a nave no centro da pista. Com penalidade quando cai no vazio.
  respawn(penalty) {
    const P = CONFIG.physics;
    const track = this.track;
    this.s = track.wrap(this.s - (penalty ? 12 : 0));
    // Se o ponto cair numa fenda, a nave avança até depois dela. O salto para a frente fica
    // registrado para que o jogo conte um checkpoint que esteja no caminho.
    const safe = track.safeRespawnS(this.s);
    this.skipFrom = this.s;
    this.skipDs = Math.max(0, track.delta(safe, this.s));
    this.s = safe;
    this.sPrev = this.s;
    this.frameDs = 0;
    this.d = track.hasWall(this.s) ? clamp(this.d, -track.halfWidth * 0.5, track.halfWidth * 0.5) : 0;
    this.h = track.groundLift(this.s);
    this.vh = 0;
    this.theta = 0;
    this.slip = 0;
    this.yawRate = 0;
    this.v = P.respawnSpeed;
    this.falling = false;
    this.airborne = false;
    this.onShoulder = false;
    this.padBoost = 0;
    this.invuln = P.respawnInvuln;
    this.respawnCooldown = P.respawnCooldown;
    if (penalty) this.energy = Math.max(this.maxEnergy * 0.1, this.energy - CONFIG.energy.fallPenalty);
    this._updateVectors();
    this._resetTrails();
    this._emit('respawn');
  }

  canRespawn() {
    return this.respawnCooldown <= 0 && !this.ko && !this.falling;
  }

  _emit(type, value = 0, side = 0) {
    if (this.onEvent) this.onEvent(this, type, value, side);
  }

  _updateVectors() {
    const track = this.track;
    track.frameAt(this.s, _frame);
    const cosT = Math.cos(this.theta);
    const sinT = Math.sin(this.theta);
    this.up.copy(_frame.up);
    this.forward.copy(_frame.tan).multiplyScalar(cosT).addScaledVector(_frame.right, sinT).normalize();
    this.right.crossVectors(this.forward, this.up).normalize();
    this.position
      .copy(_frame.pos)
      .addScaledVector(_frame.right, this.d)
      .addScaledVector(_frame.up, CONFIG.ship.hoverHeight + this.h);
  }

  _resetTrails() {
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      _v.copy(this.position).addScaledVector(this.right, side * this.model.engineSpread * this.scale).addScaledVector(this.forward, -2.8 * this.scale);
      this.trails[i].reset(_v, this.right);
    }
  }

  // Atualiza a representação visual (malha, trilhas, partículas). Chamado uma vez por quadro.
  syncVisual(dt, time, cameraPosition, particleRange) {
    this._updateVectors();
    const track = this.track;
    const speedRatio = clamp(Math.abs(this.v) / this.stats.maxSpeed, 0, 1.5);
    const grounded = this.grounded;

    // --- orientação ---
    const S = CONFIG.ship;
    const rollTarget = this.falling ? 0.9 : -this.steer * S.maxRoll + clamp(this.slip * 0.012, -S.maxSlipRoll, S.maxSlipRoll);
    const pitchTarget = this.falling ? -0.7 : clamp(this.vh * 0.035, -0.35, 0.35) + (this.boosting ? 0.03 : 0);
    const yawTarget = -this.steer * (this.drifting ? 0.32 : 0.08);
    this.roll = damp(this.roll, rollTarget, 8, dt);
    this.pitch = damp(this.pitch, pitchTarget, 8, dt);
    this.yawVisual = damp(this.yawVisual, yawTarget, 7, dt);

    _back.copy(this.forward).negate();
    _m.makeBasis(this.right, this.up, _back);
    this.group.quaternion.setFromRotationMatrix(_m);
    _e.set(this.pitch, this.yawVisual, this.roll);
    this.group.quaternion.multiply(_q.setFromEuler(_e));

    // --- folga do solo: ao inclinar, a nave sobe o suficiente para a asa (ou o nariz) não atravessar o piso ---
    let lift = 0;
    if (!this.falling) {
      const probes = this.model.probes;
      let lowest = 0;
      for (let i = 0; i < probes.length; i++) {
        const y = _v.copy(probes[i]).applyQuaternion(_q).y;
        if (y < lowest) lowest = y;
      }
      const clearance = S.hoverHeight + this.h - track.groundLift(this.s) + lowest * this.scale;
      lift = Math.max(0, S.groundClearance - clearance);
    }
    this.lift = lift;

    const bob = grounded ? Math.sin(time * 2.3 + this.phase) * 0.07 : 0;
    this.group.position.copy(this.position).addScaledVector(this.up, bob + lift);

    // --- visibilidade (LOD simples e piscar durante a invulnerabilidade) ---
    const distSq = cameraPosition ? this.position.distanceToSquared(cameraPosition) : 0;
    const near = distSq < 1500 * 1500;
    const blink = this.invuln > 0 && Math.floor(time * 14) % 2 === 0;
    // Adversários colados na câmera somem por um instante para não tapar a visão.
    const hidden = this.hidden === true || (!this.isPlayer && distSq < 36);
    this.group.visible = near && !blink && !hidden;

    // --- motores ---
    const thrust = this.ko ? 0 : clamp(this.input.throttle * 0.7 + speedRatio * 0.3, 0, 1);
    this.model.flame.scale.z = 0.35 + thrust * 1.1 + this.boostLevel * 1.5 + Math.sin(time * 40 + this.phase) * 0.1;
    this.model.flameMaterial.opacity = 0.16 + thrust * 0.16 + this.boostLevel * 0.14;

    // --- alerta de energia baixa / dano ---
    const low = this.energyRatio < CONFIG.energy.lowThreshold;
    const hull = this.model.hullMaterial;
    if (this.damageFlash > 0 || low) {
      const pulse = Math.max(this.damageFlash, low ? 0.5 + 0.5 * Math.sin(time * 12) : 0);
      hull.emissive.copy(this.model.baseEmissive).lerp(_red, pulse);
      hull.emissiveIntensity = HULL_EMISSIVE + pulse * 1.2;
    } else {
      hull.emissive.copy(this.model.baseEmissive);
      hull.emissiveIntensity = HULL_EMISSIVE;
    }

    // --- brilho projetado no piso ---
    const glowVisible = near && !this.falling && !hidden && this.h < 6;
    this.underglow.visible = glowVisible;
    if (glowVisible) {
      track.frameAt(this.s, _frame);
      _back.copy(_frame.tan).negate();
      _m.makeBasis(_frame.right, _frame.up, _back);
      this.underglow.quaternion.setFromRotationMatrix(_m);
      this.underglow.position
        .copy(_frame.pos)
        .addScaledVector(_frame.right, this.d)
        .addScaledVector(_frame.up, track.groundLift(this.s) + 0.09);
      this.underglowMaterial.opacity = (0.26 + this.boostLevel * 0.24) * clamp(1 - this.h / 6, 0, 1);
    }

    // --- trilhas ---
    const trailVisible = distSq < 900 * 900 && !hidden;
    const trailIntensity = this.falling || this.ko ? 0 : clamp(speedRatio * 0.55 - 0.06, 0, 0.5) + this.boostLevel * 0.25;
    for (let i = 0; i < 2; i++) {
      const trail = this.trails[i];
      trail.mesh.visible = trailVisible;
      if (!trailVisible) continue;
      _v.set((i === 0 ? -1 : 1) * this.model.engineSpread, 0.05, 2.85).multiplyScalar(this.scale).applyQuaternion(this.group.quaternion).add(this.group.position);
      trail.update(_v, this.right, trailIntensity, 9 + speedRatio * 5 + this.boostLevel * 9);
    }

    // --- partículas ---
    const fx = this.effects;
    if (!fx || !fx.particles || hidden) return;
    if (distSq < particleRange * particleRange) {
      const c = this.engineColor;
      this._exhaust += dt * (6 + thrust * 16 + this.boostLevel * 22) * fx.density;
      while (this._exhaust >= 1) {
        this._exhaust -= 1;
        const side = Math.random() < 0.5 ? -1 : 1;
        _v.set(side * this.model.engineSpread + (Math.random() - 0.5) * 0.2, 0.05, 2.9).multiplyScalar(this.scale).applyQuaternion(this.group.quaternion).add(this.group.position);
        const back = -(6 + Math.random() * 10) + this.v * 0.6;
        fx.particles.emit(
          _v.x, _v.y, _v.z,
          this.forward.x * back + (Math.random() - 0.5) * 2, this.forward.y * back + (Math.random() - 0.5) * 2, this.forward.z * back + (Math.random() - 0.5) * 2,
          0.14 + Math.random() * 0.18, 0.28 + this.boostLevel * 0.12, c.r * 0.8, c.g * 0.8, c.b * 0.8, 0, 2,
        );
      }
      if (this.recharging) {
        _v.copy(this.position).addScaledVector(this.right, (Math.random() - 0.5) * 3).addScaledVector(this.forward, (Math.random() - 0.5) * 4);
        fx.particles.emit(
          _v.x, _v.y - 0.5, _v.z,
          this.forward.x * this.v * 0.9, 6 + Math.random() * 6, this.forward.z * this.v * 0.9,
          0.4, 0.4, 0.25, 0.8, 2.0, 0, 0.5,
        );
      }
      if (low || this.ko) {
        this._smoke += dt * 14 * fx.density;
        while (this._smoke >= 1) {
          this._smoke -= 1;
          fx.particles.emit(
            this.position.x, this.position.y + 0.4, this.position.z,
            this.forward.x * this.v * 0.5 + (Math.random() - 0.5) * 4, 3 + Math.random() * 4, this.forward.z * this.v * 0.5 + (Math.random() - 0.5) * 4,
            0.35 + Math.random() * 0.3, 0.5, 1.8, 0.4 + Math.random() * 0.5, 0.1, -6, 1,
          );
        }
      }
    }
  }

  dispose() {
    this.onEvent = null;
    this.model.dispose();
    for (const t of this.trails) t.dispose();
    this.underglowMaterial.dispose();
    if (this.underglow.parent) this.underglow.parent.remove(this.underglow);
  }
}
