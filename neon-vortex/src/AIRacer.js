import { CONFIG } from './Config.js';
import { clamp, damp } from './Utils.js';
import { Ship } from './Ship.js';

// Piloto automático. Preenche ship.input a partir dos pontos de referência da pista,
// do tráfego ao redor e do perfil individual (habilidade, agressividade, erros).
const NEUTRAL_TUNING = { speed: 1, corner: 1, cornerNoise: 0, skill: 0, errors: 1, boost: 1 };

export class AIController {
  // tuning: ajustes do nível de dificuldade (ver DIFFICULTY em Config.js).
  constructor(ship, profile, tuning = NEUTRAL_TUNING) {
    this.ship = ship;
    this.tuning = tuning;
    this.skill = clamp(profile.skill + tuning.skill, 0.3, 1);
    this.aggression = profile.aggression;
    this.lineUse = 0.55 + 0.45 * this.skill;
    this.wobbleAmp = 0.5 + (1 - this.skill) * 3.2;
    this.wobbleFreq = 0.25 + Math.random() * 0.35;
    this.phase = Math.random() * Math.PI * 2;
    this.cornerFactor = (0.84 + 0.3 * this.skill) * tuning.corner;
    this.reset();
  }

  reset() {
    this.time = 0;
    this.targetD = this.ship.d;
    this.laneBias = (Math.random() - 0.5) * 6;
    this.laneTimer = 2 + Math.random() * 4;
    this.cornerJitter = 1;
    this.passSide = 0;
    this.passTimer = 0;
    this.boostHold = 0;
    this.errorTimer = this._nextErrorDelay();
    this.errorType = null;
    this.errorSign = 1;
    this.stuckTimer = 0;
    this.launchDelay = (1 - this.skill) * 0.9 + Math.random() * 0.25;
  }

  _nextErrorDelay() {
    return ((7 + this.skill * 26) * (0.5 + Math.random())) / this.tuning.errors;
  }

  update(dt, ships) {
    const ship = this.ship;
    const track = ship.track;
    const P = CONFIG.physics;
    const A = CONFIG.ai;
    const inp = ship.input;

    if (ship.ko || ship.falling) {
      inp.throttle = 0;
      inp.brake = 0;
      inp.steer = 0;
      inp.boost = false;
      inp.drift = false;
      return;
    }
    if (this.launchDelay > 0) {
      this.launchDelay -= dt;
      inp.throttle = 0;
      return;
    }
    this.time += dt;

    // --- erros ocasionais ---
    this.errorTimer -= dt;
    if (this.errorTimer <= 0) {
      if (this.errorType) {
        this.errorType = null;
        this.errorTimer = this._nextErrorDelay();
      } else {
        const r = Math.random();
        this.errorType = r < 0.4 ? 'wide' : r < 0.75 ? 'lateBrake' : 'lift';
        this.errorSign = Math.random() < 0.5 ? -1 : 1;
        this.errorTimer = 0.7 + Math.random() * 0.8;
      }
    }

    // --- variação de faixa para os pilotos não formarem fila ---
    this.laneTimer -= dt;
    if (this.laneTimer <= 0) {
      this.laneBias = (Math.random() - 0.5) * (4 + (1 - this.skill) * 8);
      this.laneTimer = 3 + Math.random() * 5;
      // Nem toda curva é feita no limite: a margem de segurança muda de trecho para trecho.
      this.cornerJitter = 1 - Math.random() * this.tuning.cornerNoise;
    }

    const v = Math.max(ship.v, 1);
    const hw = track.halfWidth;
    const look = A.lookBase + v * A.lookTime;
    const sAhead = ship.s + look;
    let target = track.waypointOffsetAt(sAhead) * this.lineUse + this.laneBias + Math.sin(this.time * this.wobbleFreq + this.phase) * this.wobbleAmp;
    if (this.errorType === 'wide') target += this.errorSign * 6;

    // --- zonas: recarga quando a energia está baixa, boost pads quando estão no caminho ---
    if (ship.energyRatio < 0.55) {
      const zone = track.nextZone(ship.s, A.rechargeSeekDistance, 'recharge');
      if (zone) target = zone.center;
    } else {
      const pad = track.nextZone(ship.s, A.padSeekDistance, 'boost');
      if (pad && Math.abs(pad.center - ship.d) < 9) target = pad.center;
    }

    // --- tráfego: ultrapassagem e desvio ---
    let blocked = false;
    for (let i = 0; i < ships.length; i++) {
      const other = ships[i];
      if (other === ship || other.ko || other.falling) continue;
      const ahead = track.delta(other.s, ship.s);
      const closing = ship.v - other.v;
      if (ahead > 0 && ahead < 16 + Math.max(0, closing) * 0.9 && Math.abs(other.d - target) < 5) {
        blocked = true;
        if (this.passSide === 0) {
          const roomRight = hw - 3 - other.d;
          const roomLeft = other.d + hw - 3;
          this.passSide = roomRight > roomLeft ? 1 : -1;
          if (Math.min(roomRight, roomLeft) > 7 && Math.random() < 0.3) this.passSide *= -1;
        }
        this.passTimer = 1.2;
        target = other.d + this.passSide * 6.2;
      } else if (Math.abs(ahead) < 8 && Math.abs(other.d - ship.d) < 5.6) {
        target += other.d > ship.d ? -3 : 3;
      }
    }
    this.passTimer -= dt;
    if (!blocked && this.passTimer <= 0) this.passSide = 0;

    if (track.gapAhead(ship.s, 160)) target = clamp(target, -5, 5);
    const walled = track.hasWall(ship.s) && track.hasWall(sAhead);
    const margin = walled ? hw - ship.wallLimit + 0.9 : 6;
    target = clamp(target, -(hw - margin), hw - margin);
    this.targetD = damp(this.targetD, target, A.targetSmooth, dt);

    // --- direção: rumo desejado + compensação antecipada da curvatura ---
    const thetaDesired = Math.atan2(this.targetD - ship.d, look);
    const kappa = track.curvatureAt(ship.s + v * 0.08);
    const omegaDesired = (thetaDesired - ship.theta) * A.steerGain + kappa * v * (1 - P.curveAssist);
    const omegaMax = Math.max(ship.maxYawRate(), 0.05);
    inp.steer = clamp(omegaDesired / omegaMax, -1, 1);
    inp.drift = Math.abs(omegaDesired) > omegaMax * 1.08 && v > 55;

    // --- velocidade alvo: a curva mais limitante dentro da distância de frenagem ---
    const cornerK = (ship.stats.turnRate * 0.82 * this.cornerFactor * this.cornerJitter) / (1 - P.curveAssist);
    const maxDist = 40 + (v * v) / (2 * A.brakeDecel);
    const step = track.segLen * 2;
    let vTarget = 1e6;
    for (let x = 0; x < maxDist; x += step) {
      const k = Math.abs(track.curvatureAt(ship.s + x));
      if (k < 1e-4) continue;
      const vAllowed = cornerK / k;
      const vNow = Math.sqrt(vAllowed * vAllowed + 2 * A.brakeDecel * x);
      if (vNow < vTarget) vTarget = vNow;
    }
    const straight = vTarget > ship.stats.maxSpeed * 1.35;
    if (this.errorType === 'lateBrake') vTarget *= 1.22;
    // Fenda à frente: velocidade suficiente para o salto, sem frear na rampa.
    const gap = track.gapAhead(ship.s, 160);
    if (gap) vTarget = Math.max(vTarget, 105);

    if (v > vTarget + 4) {
      inp.throttle = 0;
      inp.brake = clamp((v - vTarget) / 14, 0.3, 1);
    } else if (v > vTarget) {
      inp.throttle = 0.3;
      inp.brake = 0;
    } else {
      inp.throttle = this.errorType === 'lift' ? 0.35 : 1;
      inp.brake = 0;
    }

    // --- boost: só em retas, com energia de sobra, de preferência para ultrapassar ---
    this.boostHold -= dt;
    const energyOk = ship.energyRatio > 0.45;
    if (this.boostHold > 0 && straight && energyOk) {
      inp.boost = true;
    } else {
      inp.boost = false;
      this.boostHold = Math.min(this.boostHold, 0);
      if (straight && energyOk && ship.boostCharge > 60 && !ship.finished) {
        const chance = dt * (0.12 + this.aggression * 0.35 + (blocked ? 1.5 : 0)) * this.tuning.boost;
        if (Math.random() < chance) this.boostHold = 0.8 + Math.random() * 1.6;
      }
    }

    // --- recuperação automática ---
    if (Math.abs(ship.v) < A.stuckSpeed) {
      this.stuckTimer += dt;
      if (this.stuckTimer > A.stuckTime && ship.canRespawn()) {
        this.stuckTimer = 0;
        ship.respawn(false);
      }
    } else {
      this.stuckTimer = 0;
    }
  }
}

export class AIRacer extends Ship {
  constructor(options) {
    super(options);
    const tuning = options.tuning ?? NEUTRAL_TUNING;
    this.profile = options.profile;
    this.speedBias = options.profile.speedBias * tuning.speed;
    this.speedScale = this.speedBias;
    this.ai = new AIController(this, options.profile, tuning);
  }

  reset(s, d) {
    super.reset(s, d);
    this.ai?.reset();
  }

  control(dt, ctx) {
    this.ai.update(dt, ctx.ships);
  }
}
