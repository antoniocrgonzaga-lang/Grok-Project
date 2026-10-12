import { Ship } from './Ship.js';
import { AIController } from './AIRacer.js';

export class PlayerShip extends Ship {
  constructor(options) {
    super({ ...options, isPlayer: true });
    // Piloto automático usado após a bandeirada (e em testes automatizados).
    this.autopilot = new AIController(this, { skill: 0.9, aggression: 0.4 });
    this.autopilotEnabled = false;
  }

  reset(s, d) {
    super.reset(s, d);
    this.autopilot?.reset();
    if (this.autopilot) this.autopilot.launchDelay = 0;
  }

  control(dt, ctx) {
    if (this.autopilotEnabled) {
      this.autopilot.update(dt, ctx.ships);
      return;
    }
    const src = ctx.input;
    const inp = this.input;
    inp.throttle = src.throttle;
    inp.brake = src.brake;
    inp.steer = src.steer;
    inp.boost = src.boost;
    inp.drift = src.drift;
  }
}
