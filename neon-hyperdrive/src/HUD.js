import { CONFIG } from './Config.js';
import { t, ordinalSuffix } from './i18n.js';
import { clamp, formatTime, cssColor } from './Utils.js';

const $ = (id) => document.getElementById(id);

// Interface da corrida. Só toca no DOM quando o valor exibido realmente muda.
export class HUD {
  constructor() {
    this.root = $('hud');
    this.el = {
      pos: $('hud-pos'),
      posSuffix: $('hud-pos-suffix'),
      total: $('hud-total'),
      lap: $('hud-lap'),
      laps: $('hud-laps'),
      time: $('hud-time'),
      lapTime: $('hud-laptime'),
      best: $('hud-best'),
      speed: $('hud-speed'),
      energy: $('hud-energy'),
      energyFill: $('hud-energy').firstElementChild,
      boost: $('hud-boost'),
      boostFill: $('hud-boost').firstElementChild,
      boostInd: $('hud-boost-ind'),
      message: $('hud-message'),
      countdown: $('hud-countdown'),
      warning: $('hud-warning'),
      camera: $('hud-camera'),
      board: $('hud-board'),
    };
    this.minimap = $('minimap');
    this.mapCtx = this.minimap.getContext('2d');
    this.mapBase = document.createElement('canvas');
    this.mapBase.width = this.minimap.width;
    this.mapBase.height = this.minimap.height;
    this.cache = {};
    this.rows = [];
    this.queue = [];
    this.messageTimer = 0;
    this.messagePriority = 0;
    this.cameraTimer = 0;
    this.boardTimer = 0;
    this.mapTimer = 0;
  }

  show() {
    this.root.hidden = false;
  }

  hide() {
    this.root.hidden = true;
  }

  _set(key, value) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    this.el[key].textContent = value;
  }

  _toggle(el, name, on) {
    const key = `${el.id}.${name}`;
    if (this.cache[key] === on) return;
    this.cache[key] = on;
    el.classList.toggle(name, on);
  }

  // Desenha o traçado uma única vez; os pontos dos pilotos são sobrepostos a cada atualização.
  setTrack(track) {
    const mm = track.minimap;
    const size = this.mapBase.width;
    const pad = 16;
    const scale = (size - pad * 2) / Math.max(mm.maxX - mm.minX, mm.maxZ - mm.minZ);
    const ox = (size - (mm.maxX - mm.minX) * scale) / 2 - mm.minX * scale;
    const oz = (size - (mm.maxZ - mm.minZ) * scale) / 2 - mm.minZ * scale;
    this.mapTransform = { scale, ox, oz };

    const ctx = this.mapBase.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    const path = () => {
      ctx.beginPath();
      for (let i = 0; i < mm.points.length; i += 2) {
        const x = mm.points[i] * scale + ox;
        const y = mm.points[i + 1] * scale + oz;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    };
    ctx.lineJoin = 'round';
    path();
    ctx.strokeStyle = 'rgba(138,60,255,0.55)';
    ctx.lineWidth = 9;
    ctx.stroke();
    path();
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fillRect(mm.points[0] * scale + ox - 2, mm.points[1] * scale + oz - 6, 4, 12);
  }

  reset(totalLaps, ships) {
    this.cache = {};
    this._set('laps', String(totalLaps));
    this._set('total', String(ships.length));
    this.el.board.textContent = '';
    this.rows = ships.map(() => {
      const li = document.createElement('li');
      const pos = document.createElement('span');
      const chip = document.createElement('i');
      const name = document.createElement('span');
      li.append(pos, chip, name);
      this.el.board.append(li);
      return { li, pos, chip, name, ship: null };
    });
    this.clearMessage();
    this.countdown(null);
    this.el.warning.hidden = true;
    this.boardTimer = 0;
    this.mapTimer = 0;
  }

  // queue: espera a mensagem atual terminar em vez de substituí-la.
  message(text, options = {}) {
    const { kind = '', sub = '', duration = 1.7, priority = 1, queue = false } = options;
    if (this.messageTimer > 0) {
      if (queue) {
        this.queue.push([text, { ...options, queue: false }]);
        return;
      }
      if (priority < this.messagePriority) return;
    }
    const el = this.el.message;
    el.className = `hud-message ${kind}`;
    el.textContent = text;
    if (sub) {
      const small = document.createElement('small');
      small.textContent = sub;
      el.append(small);
    }
    // Reinicia a animação de entrada.
    void el.offsetWidth;
    el.classList.add('show');
    this.messageTimer = duration;
    this.messagePriority = priority;
  }

  clearMessage(dropQueue = true) {
    this.el.message.classList.remove('show');
    this.messageTimer = 0;
    this.messagePriority = 0;
    if (dropQueue) this.queue.length = 0;
  }

  countdown(text) {
    const el = this.el.countdown;
    el.classList.remove('pop');
    if (text == null) {
      el.textContent = '';
      return;
    }
    el.textContent = text;
    void el.offsetWidth;
    el.classList.add('pop');
  }

  cameraLabel(text) {
    this.el.camera.textContent = text;
    this.el.camera.classList.add('show');
    this.cameraTimer = 1.6;
  }

  update(dt, { player, order, raceTime, totalLaps }) {
    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer <= 0) {
        const next = this.queue.shift();
        this.clearMessage(false);
        if (next) this.message(next[0], next[1]);
      }
    }
    if (this.cameraTimer > 0) {
      this.cameraTimer -= dt;
      if (this.cameraTimer <= 0) this.el.camera.classList.remove('show');
    }

    this._set('speed', String(Math.round(Math.abs(player.v) * CONFIG.hud.speedFactor)));
    this._set('pos', String(player.rank));
    this._set('posSuffix', ordinalSuffix(player.rank));
    this._set('lap', String(clamp(player.lap, 1, totalLaps)));
    const shownTime = player.finished ? player.finishTime : raceTime;
    this._set('time', formatTime(shownTime));
    this._set('lapTime', formatTime(player.finished ? player.lastLap : player.lap >= 1 ? raceTime - player.lapStart : 0));
    this._set('best', formatTime(player.bestLap));

    const energy = clamp(player.energyRatio, 0, 1);
    const energyKey = Math.round(energy * 200);
    if (this.cache.energyKey !== energyKey) {
      this.cache.energyKey = energyKey;
      this.el.energyFill.style.transform = `scaleX(${energy.toFixed(3)})`;
    }
    const low = energy < CONFIG.energy.lowThreshold;
    this._toggle(this.el.energy, 'low', low);
    if (this.cache.warning !== low) {
      this.cache.warning = low;
      this.el.warning.hidden = !low;
    }

    const boost = clamp(player.boostCharge / 100, 0, 1);
    const boostKey = Math.round(boost * 200);
    if (this.cache.boostKey !== boostKey) {
      this.cache.boostKey = boostKey;
      this.el.boostFill.style.transform = `scaleX(${boost.toFixed(3)})`;
    }
    const active = player.boosting || player.padBoost > 0;
    const ready = !active && player.boostCharge >= CONFIG.energy.boostMinStart && player.energy >= CONFIG.energy.boostMinEnergy;
    this._toggle(this.el.boost, 'active', active);
    this._toggle(this.el.boostInd, 'active', active);
    this._toggle(this.el.boostInd, 'ready', ready);
    this._set('boostInd', t(active ? 'hud.boostActive' : ready ? 'hud.boostReady' : 'hud.recharging'));

    this.boardTimer -= dt;
    if (this.boardTimer <= 0) {
      this.boardTimer = 0.25;
      this._updateBoard(order);
    }
    this.mapTimer -= dt;
    if (this.mapTimer <= 0) {
      this.mapTimer = 1 / 30;
      this._drawMinimap(order, player);
    }
  }

  _updateBoard(order) {
    for (let i = 0; i < this.rows.length; i++) {
      const row = this.rows[i];
      const ship = order[i];
      if (!ship || row.ship === ship) continue;
      row.ship = ship;
      row.pos.textContent = String(i + 1);
      row.name.textContent = ship.name;
      row.chip.style.background = cssColor(ship.colors.primary);
      row.li.classList.toggle('player', ship.isPlayer);
    }
  }

  _drawMinimap(order, player) {
    const ctx = this.mapCtx;
    const t = this.mapTransform;
    if (!t) return;
    ctx.clearRect(0, 0, this.minimap.width, this.minimap.height);
    ctx.drawImage(this.mapBase, 0, 0);
    for (let i = order.length - 1; i >= 0; i--) {
      const ship = order[i];
      if (ship === player) continue;
      ctx.fillStyle = cssColor(ship.colors.primary);
      ctx.beginPath();
      ctx.arc(ship.position.x * t.scale + t.ox, ship.position.z * t.scale + t.oz, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    const x = player.position.x * t.scale + t.ox;
    const y = player.position.z * t.scale + t.oz;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = cssColor(player.colors.primary);
    ctx.beginPath();
    ctx.arc(x, y, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
}
