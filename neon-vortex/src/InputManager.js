// Entrada do jogador. Cada fonte (teclado, gamepad) escreve no mesmo estado normalizado,
// de modo que novas fontes possam ser adicionadas sem tocar no restante do jogo.

const HELD_KEYS = {
  KeyW: 'throttle', ArrowUp: 'throttle',
  KeyS: 'brake', ArrowDown: 'brake',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'boost', ShiftRight: 'boost',
  Space: 'drift',
};

const ACTION_KEYS = {
  KeyR: 'respawn',
  KeyP: 'pause',
  Escape: 'pause',
  KeyC: 'camera',
};

// Mapeamento "standard" da Gamepad API.
const GAMEPAD = {
  steerAxis: 0,
  throttle: 7,
  brake: 6,
  boost: 0,
  drift: 2,
  actions: { 9: 'pause', 3: 'camera', 1: 'respawn' },
  deadzone: 0.15,
};

class KeyboardSource {
  constructor() {
    this.held = new Set();
  }

  read(state) {
    const h = this.held;
    if (h.has('throttle')) state.throttle = 1;
    if (h.has('brake')) state.brake = 1;
    state.steer += (h.has('right') ? 1 : 0) - (h.has('left') ? 1 : 0);
    if (h.has('boost')) state.boost = true;
    if (h.has('drift')) state.drift = true;
  }

  clear() {
    this.held.clear();
  }
}

class GamepadSource {
  constructor(onAction) {
    this.onAction = onAction;
    this.previous = new Map();
  }

  read(state) {
    if (typeof navigator.getGamepads !== 'function') return;
    let pad = null;
    for (const p of navigator.getGamepads()) {
      if (p && p.connected && p.mapping === 'standard') {
        pad = p;
        break;
      }
    }
    if (!pad) return;
    const axis = pad.axes[GAMEPAD.steerAxis] ?? 0;
    if (Math.abs(axis) > GAMEPAD.deadzone) state.steer += axis;
    state.throttle = Math.max(state.throttle, pad.buttons[GAMEPAD.throttle]?.value ?? 0);
    state.brake = Math.max(state.brake, pad.buttons[GAMEPAD.brake]?.value ?? 0);
    if (pad.buttons[GAMEPAD.boost]?.pressed) state.boost = true;
    if (pad.buttons[GAMEPAD.drift]?.pressed) state.drift = true;
    for (const [index, action] of Object.entries(GAMEPAD.actions)) {
      const pressed = !!pad.buttons[index]?.pressed;
      if (pressed && !this.previous.get(index)) this.onAction(action);
      this.previous.set(index, pressed);
    }
  }

  clear() {}
}

export class InputManager {
  constructor(events) {
    this.events = events;
    this.state = { throttle: 0, brake: 0, steer: 0, boost: false, drift: false };
    // Quando verdadeiro, as teclas do jogo não chegam ao navegador (evita rolagem e cliques acidentais).
    this.captureGameKeys = false;
    this.keyboard = new KeyboardSource();
    this.sources = [this.keyboard, new GamepadSource((action) => this.events.emit('input:action', action))];

    this._onKeyDown = (e) => {
      const held = HELD_KEYS[e.code];
      const action = ACTION_KEYS[e.code];
      if (held) {
        this.keyboard.held.add(held);
        if (this.captureGameKeys) e.preventDefault();
      }
      if (action && !e.repeat) {
        if (this.captureGameKeys || action === 'pause') e.preventDefault();
        this.events.emit('input:action', action);
      }
    };
    this._onKeyUp = (e) => {
      const held = HELD_KEYS[e.code];
      if (held) this.keyboard.held.delete(held);
    };
    this._onBlur = () => {
      this.clear();
      this.events.emit('input:blur');
    };
    this._onVisibility = () => {
      if (document.hidden) this._onBlur();
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    document.addEventListener('visibilitychange', this._onVisibility);
  }

  update() {
    const s = this.state;
    s.throttle = 0;
    s.brake = 0;
    s.steer = 0;
    s.boost = false;
    s.drift = false;
    for (const source of this.sources) source.read(s);
    s.steer = Math.max(-1, Math.min(1, s.steer));
    return s;
  }

  clear() {
    for (const source of this.sources) source.clear();
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    document.removeEventListener('visibilitychange', this._onVisibility);
  }
}
