import * as THREE from 'three';
import { CONFIG, SHIPS, TRACKS, AI_ROSTER } from './Config.js';
import { clamp, formatTime } from './Utils.js';
import { EventBus } from './EventBus.js';
import { Settings } from './Settings.js';
import { Track } from './Track.js';
import { Environment } from './Environment.js';
import { PlayerShip } from './PlayerShip.js';
import { AIRacer } from './AIRacer.js';
import { createShipModel } from './ShipModel.js';
import { CollisionSystem } from './CollisionSystem.js';
import { CameraController } from './CameraController.js';
import { Effects } from './Effects.js';
import { AudioManager } from './AudioManager.js';
import { InputManager } from './InputManager.js';
import { HUD } from './HUD.js';
import { t, ordinal } from './i18n.js';
import { Menus } from './Menus.js';

export const GameState = Object.freeze({
  MENU: 'menu',
  COUNTDOWN: 'countdown',
  RACING: 'racing',
  PAUSED: 'paused',
  FINISHED: 'finished',
});

const _frame = { pos: new THREE.Vector3(), tan: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3() };
const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _center = new THREE.Vector3();

function compareRacers(a, b) {
  if (a.finished && b.finished) return a.finishTime - b.finishTime;
  if (a.finished) return -1;
  if (b.finished) return 1;
  return b.progress - a.progress;
}

export class Game {
  constructor(root, { autopilot = false } = {}) {
    this.root = root;
    this.canvas = root.querySelector('#game-canvas');
    this.events = new EventBus();
    this.settings = new Settings();
    this.state = GameState.MENU;
    this.pausedFrom = null;
    this.time = 0;
    this.timeScale = 1;
    this.demoAutopilot = autopilot;

    this.ships = [];
    this.order = [];
    this.player = null;
    this.track = null;
    this.env = null;
    this.collisions = null;
    this.preview = null;
    this.menuView = 'title';
    this.attractS = 0;
    this.raceTime = 0;
    this.selectedShip = SHIPS[0];
    this.selectedTrack = TRACKS[0];

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.enabled = this.settings.get('shadows');

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(68, 1, 0.3, 3000);
    this.scene.add(this.camera);

    this.effects = new Effects(this.renderer, this.scene, this.camera);
    this.audio = new AudioManager(this.settings);
    this.input = new InputManager(this.events);
    this.hud = new HUD();
    this.menus = new Menus(this.events, this.settings);
    this.cameraCtl = new CameraController(this.camera);

    this._controlCtx = { ships: this.ships, input: this.input.state };
    this._hudData = { player: null, order: this.order, raceTime: 0, totalLaps: CONFIG.race.laps };
    this._fxState = { speed: 0, lines: 0, warp: 0, lowEnergy: false };
    this._rubberTimer = 0;
    this._raf = 0;
    this._last = 0;
    this._loop = this._loop.bind(this);
    this._onResize = this._onResize.bind(this);
    this._onShipEvent = this._onShipEvent.bind(this);

    this._resizeRenderer();
    this.effects.applyQuality(this.settings.quality, this.settings.get('crt'));
    this._bindEvents();
    this._buildWorld(this.selectedTrack);
    this.showMenu('title');
  }

  start() {
    this._last = performance.now();
    this._raf = requestAnimationFrame(this._loop);
  }

  // ---------- eventos (registrados uma única vez) ----------

  _bindEvents() {
    const ev = this.events;
    window.addEventListener('resize', this._onResize);

    const unlock = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    ev.on('ui:sound', (name) => this.audio.play(name));
    ev.on('ui:screen', (name) => {
      if (name) this.menuView = name;
      if (this.preview) this.preview.group.visible = this.state === GameState.MENU && name === 'ship';
    });
    ev.on('ui:previewShip', (ship) => {
      this.selectedShip = ship;
      this._setPreview(ship);
    });
    ev.on('ui:previewTrack', (track) => {
      this.selectedTrack = track;
      if (this.state === GameState.MENU) this._buildWorld(track);
    });
    ev.on('ui:start', ({ ship, track }) => {
      this.selectedShip = ship;
      this.selectedTrack = track;
      this.startRace();
    });
    ev.on('ui:resume', () => this.resume());
    ev.on('ui:restart', () => this.startRace());
    ev.on('ui:quit', (screen) => this.showMenu(screen));
    ev.on('ui:setting', (key) => this._onSettingChanged(key));
    ev.on('input:action', (action) => this._onAction(action));
    ev.on('input:blur', () => {
      if (this.state === GameState.RACING || this.state === GameState.COUNTDOWN) this.pause();
    });
  }

  _onSettingChanged(key) {
    switch (key) {
      case 'quality':
        this._resizeRenderer();
        this.effects.applyQuality(this.settings.quality, this.settings.get('crt'));
        if (this.state === GameState.MENU) this._buildWorld(this.selectedTrack);
        break;
      case 'crt':
        this.effects.setCRT(this.settings.get('crt'));
        break;
      case 'shadows':
        this._applyShadows();
        break;
      case 'difficulty':
        // Lida ao montar o grid da próxima corrida.
        break;
      default:
        this.audio.applyVolumes();
    }
  }

  _onAction(action) {
    if (action === 'pause') {
      if (this.state === GameState.RACING || this.state === GameState.COUNTDOWN) this.pause();
      else if (this.menus.isOpen) this.menus.back();
      return;
    }
    if (this.state !== GameState.RACING && this.state !== GameState.COUNTDOWN) return;
    if (action === 'camera') {
      const mode = this.cameraCtl.cycleMode();
      this.player.hidden = mode.cockpit;
      this.cameraCtl.snap(this.player);
      this.hud.cameraLabel(t(`camera.${mode.id}`));
      this.audio.play('select');
    } else if (action === 'respawn' && this.state === GameState.RACING) {
      if (this.player.canRespawn() && !this.player.finished) this.player.respawn(false);
    }
  }

  // ---------- renderer / qualidade ----------

  _resizeRenderer() {
    const width = Math.max(1, this.root.clientWidth || window.innerWidth);
    const height = Math.max(1, this.root.clientHeight || window.innerHeight);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, this.settings.quality.pixelRatio);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    return { width, height, pixelRatio };
  }

  _onResize() {
    const { width, height, pixelRatio } = this._resizeRenderer();
    this.effects.setSize(width, height, pixelRatio);
  }

  _applyShadows() {
    const enabled = this.settings.get('shadows');
    if (this.renderer.shadowMap.enabled !== enabled) {
      this.renderer.shadowMap.enabled = enabled;
      // Os shaders precisam ser recompilados para incluir (ou remover) o código de sombras.
      this.scene.traverse((obj) => {
        if (!obj.material) return;
        const list = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of list) mat.needsUpdate = true;
      });
    }
    this.env?.setShadows(enabled, this.settings.quality.shadowMapSize);
  }

  // ---------- mundo ----------

  _buildWorld(trackDef) {
    const qualityKey = this.settings.get('quality');
    if (this.track && this.track.id === trackDef.id && this.worldQuality === qualityKey) return;
    this._clearRace();
    this.env?.dispose();
    this.track?.dispose();

    const quality = this.settings.quality;
    this.track = new Track(trackDef, quality, this.renderer.capabilities.getMaxAnisotropy());
    this.scene.add(this.track.group);
    this.env = new Environment(this.scene, this.track, quality);
    this.collisions = new CollisionSystem(this.track);
    this.worldQuality = qualityKey;
    this.camera.far = quality.far;
    this.camera.updateProjectionMatrix();
    this.hud.setTrack(this.track);
    this.menus.setTrackLength(trackDef.id, this.track.length);
    this.env.setShadows(this.settings.get('shadows'), quality.shadowMapSize);
    this.attractS = 0;
  }

  _setPreview(shipDef) {
    if (this.preview && this.preview.def === shipDef) {
      this.preview.group.visible = true;
      return;
    }
    this._removePreview();
    const model = createShipModel(shipDef, shipDef.colors);
    model.def = shipDef;
    model.group.scale.setScalar(CONFIG.ship.visualScale);
    model.flame.scale.z = 0.8;
    this.scene.add(model.group);
    this.preview = model;
  }

  _removePreview() {
    this.preview?.dispose();
    this.preview = null;
  }

  _clearRace() {
    for (const ship of this.ships) ship.dispose();
    this.ships.length = 0;
    this.order.length = 0;
    this.player = null;
    this._hudData.player = null;
  }

  // ---------- fluxo de telas ----------

  showMenu(screen = 'title') {
    this._clearRace();
    this.state = GameState.MENU;
    this.pausedFrom = null;
    this.input.captureGameKeys = false;
    this.hud.hide();
    this.effects.clear();
    this.audio.stopEngine();
    this.audio.setPaused(false);
    this.audio.startMusic('menu');
    this.menus.open(screen, screen === 'title' ? [] : ['title']);
    if (screen === 'ship') this._setPreview(this.selectedShip);
  }

  startRace() {
    const R = CONFIG.race;
    this.audio.unlock();
    this._clearRace();
    this._removePreview();
    this._buildWorld(this.selectedTrack);

    const track = this.track;
    const quality = this.settings.quality;
    const common = { track, scene: this.scene, effects: this.effects, trailPoints: quality.trailPoints };
    this.difficultyKey = this.settings.get('difficulty');
    this.difficulty = this.settings.difficulty;
    const tuning = this.difficulty;

    const rivals = AI_ROSTER.map((profile) => {
      const def = SHIPS.find((s) => s.id === profile.ship) ?? SHIPS[0];
      return new AIRacer({ ...common, def, colors: profile.colors, name: profile.name, profile, tuning });
    });
    // Grid embaralhado: a ordem de largada dos adversários muda a cada corrida.
    for (let i = rivals.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rivals[i], rivals[j]] = [rivals[j], rivals[i]];
    }
    const player = new PlayerShip({ ...common, def: this.selectedShip, colors: this.selectedShip.colors, name: t('race.you') });
    player.autopilotEnabled = this.demoAutopilot;
    player.hidden = this.cameraCtl.mode.cockpit;

    const grid = [...rivals, player];
    grid.forEach((ship, slot) => {
      const row = Math.floor(slot / 2);
      const col = slot % 2;
      const s = track.length - R.gridStartOffset - row * R.gridRowSpacing - col * R.gridStagger;
      ship.reset(s, col ? R.gridLateral : -R.gridLateral);
      ship.onEvent = this._onShipEvent;
      this.ships.push(ship);
      this.order.push(ship);
    });
    this.player = player;
    this._hudData.player = player;
    for (const ship of this.ships) this._updateProgressValue(ship);
    this._rank();

    this.raceTime = 0;
    this.countdownTimer = R.introSeconds + R.countdownSeconds;
    this.lastCount = null;
    this.finishCount = 0;
    this.resultsTimer = 0;
    this.resultsShown = false;
    this._rubberTimer = 0;
    this.bestLapRecord = this.settings.bestLap(track.id);
    this.state = GameState.COUNTDOWN;
    this.pausedFrom = null;

    this.menus.hide();
    this.hud.reset(R.laps, this.ships);
    this.hud.show();
    this.hud.message(t(`track.${track.def.id}.name`).toUpperCase(), { sub: t('race.intro', { laps: R.laps, difficulty: t(`difficulty.${this.difficultyKey}`) }), duration: R.introSeconds, priority: 1 });
    this.input.clear();
    this.input.captureGameKeys = true;
    this.cameraCtl.snap(player);
    this.cameraCtl.orbit = Math.atan2(-player.forward.z, -player.forward.x) - 0.9;
    this.effects.clear();
    this.audio.setPaused(false);
    this.audio.startEngine();
    this.audio.startMusic('race');
  }

  pause() {
    if (this.state !== GameState.RACING && this.state !== GameState.COUNTDOWN) return;
    this.pausedFrom = this.state;
    this.state = GameState.PAUSED;
    this.input.clear();
    this.input.captureGameKeys = false;
    this.audio.setPaused(true);
    this.menus.open('pause');
  }

  resume() {
    if (this.state !== GameState.PAUSED) return;
    this.state = this.pausedFrom ?? GameState.RACING;
    this.pausedFrom = null;
    this.menus.hide();
    this.input.clear();
    this.input.captureGameKeys = true;
    this.audio.setPaused(false);
    this._last = performance.now();
  }

  // ---------- laço principal ----------

  _loop(now) {
    this._raf = requestAnimationFrame(this._loop);
    const dt = Math.min((now - this._last) / 1000, 0.1);
    this._last = now;
    try {
      this.update(dt);
      this.effects.render(dt);
    } catch (err) {
      cancelAnimationFrame(this._raf);
      console.error(err);
      window.__neonFatal?.(t('fatal.runtime', { msg: err.message }));
    }
  }

  update(dt) {
    this.input.update();
    this.audio.update(dt);
    if (this.state === GameState.PAUSED) return;

    this.time += dt;
    const fx = this._fxState;
    fx.speed = 0;
    fx.lines = 0;
    fx.warp = 0;
    fx.lowEnergy = false;

    switch (this.state) {
      case GameState.MENU:
        this._updateMenu(dt);
        break;
      case GameState.COUNTDOWN:
        this._updateCountdown(dt);
        break;
      default:
        this._updateRace(dt);
    }

    this.track.update(dt, this.time);
    this.env.update(this.camera, this.time, this.player ? this.player.position : null);
    this.effects.update(dt, this.time, fx);
  }

  _updateMenu(dt) {
    const track = this.track;
    if (this.menuView === 'ship' && this.preview) {
      track.frameAt(track.length - 30, _frame);
      _center.copy(_frame.pos).addScaledVector(_frame.up, 1.5);
      _v.copy(_frame.tan).negate();
      _m.makeBasis(_frame.right, _frame.up, _v);
      this.preview.group.quaternion.setFromRotationMatrix(_m);
      this.preview.group.position.copy(_center).addScaledVector(_frame.up, Math.sin(this.time * 2) * 0.08);
      this.preview.flame.scale.z = 0.8 + Math.sin(this.time * 30) * 0.08;
      this.cameraCtl.updateOrbit(dt, _center, _frame.up, 10.5, 2.2, 0.5, -2.4);
    } else {
      this.attractS += dt * 42;
      this.cameraCtl.updateFlyover(dt, track, this.attractS, this.time);
    }
  }

  _updateCountdown(dt) {
    const R = CONFIG.race;
    this.countdownTimer -= dt;
    const remaining = this.countdownTimer;
    if (remaining <= R.countdownSeconds) {
      const n = Math.ceil(remaining);
      if (n !== this.lastCount && n > 0) {
        this.lastCount = n;
        this.hud.countdown(String(n));
        this.audio.play('countdown');
      }
    }
    for (const ship of this.ships) ship.syncVisual(dt, this.time, this.camera.position, this.settings.quality.engineParticleRange);
    if (remaining > R.countdownSeconds) {
      this.cameraCtl.updateOrbit(dt, this.player.position, this.player.up, 17, 5, 0.75);
    } else {
      this.cameraCtl.update(dt, this.player, this.track);
    }
    this.audio.updateEngine(0, this.input.state.throttle * 0.5, 0);
    this.hud.update(dt, this._hudData);

    if (remaining <= 0) {
      this.state = GameState.RACING;
      this.hud.countdown(t('race.go'));
      this.audio.play('go');
    }
  }

  _updateRace(dt) {
    const player = this.player;
    const total = dt * this.timeScale;
    const steps = Math.min(12, Math.max(1, Math.ceil(total / CONFIG.physics.maxStep)));
    const h = total / steps;
    for (let i = 0; i < steps; i++) this._step(h);

    const quality = this.settings.quality;
    for (const ship of this.ships) ship.syncVisual(dt, this.time, this.camera.position, quality.engineParticleRange);
    this.cameraCtl.update(dt, player, this.track);

    const ratio = Math.abs(player.v) / player.stats.maxSpeed;
    const fx = this._fxState;
    fx.speed = Math.abs(player.v);
    fx.lines = clamp(player.boostLevel + Math.max(0, ratio - 1.02) * 2, 0, 1);
    fx.warp = clamp(player.boostLevel * 0.8 + Math.max(0, ratio - 0.97) * 1.5, 0, 1);
    const low = player.energyRatio < CONFIG.energy.lowThreshold && !player.finished;
    fx.lowEnergy = low;

    this.audio.updateEngine(clamp(ratio, 0, 1.4), player.input.throttle, player.boostLevel);
    this.audio.tickLowEnergy(dt, low && this.state === GameState.RACING);
    this.audio.tickRecharge(dt, player.recharging);

    this._hudData.raceTime = this.raceTime;
    if (!this.resultsShown) this.hud.update(dt, this._hudData);

    if (this.state === GameState.FINISHED && !this.resultsShown) {
      this.resultsTimer -= dt;
      if (this.resultsTimer <= 0) this._showResults();
    }
  }

  // Um passo de simulação com delta fixo o bastante para a física permanecer estável.
  _step(h) {
    this.raceTime += h;
    const ships = this.ships;
    const ctx = this._controlCtx;
    for (let i = 0; i < ships.length; i++) ships[i].control(h, ctx);
    for (let i = 0; i < ships.length; i++) ships[i].integrate(h);
    for (let i = 0; i < ships.length; i++) this.collisions.resolveBounds(ships[i]);
    this.collisions.resolvePairs(ships);
    for (let i = 0; i < ships.length; i++) this._updateProgress(ships[i], h);
    this._rank();

    this._rubberTimer -= h;
    if (this._rubberTimer <= 0) {
      this._rubberTimer = 0.5;
      this._updateRubberBand();
    }
  }

  // ---------- checkpoints, voltas e classificação ----------

  _updateProgress(ship, h) {
    const track = this.track;
    // Reposicionamento que pulou para a frente (fenda): checkpoints no caminho também contam.
    if (ship.skipDs > 0) {
      const L = track.length;
      const s0 = ship.skipFrom;
      const s1 = s0 + ship.skipDs;
      const c = track.checkpoints[ship.nextCheckpoint];
      ship.skipDs = 0;
      if ((c > s0 && c <= s1) || (c + L > s0 && c + L <= s1)) this._onCheckpoint(ship, ship.nextCheckpoint, this.raceTime);
    }
    const ds = ship.frameDs;
    if (ds > 0) {
      const L = track.length;
      const s0 = ship.sPrev;
      const s1 = s0 + ds;
      // Só o próximo checkpoint esperado conta: atalhos e marcha a ré não geram voltas falsas.
      const c = track.checkpoints[ship.nextCheckpoint];
      let crossed = -1;
      if (c > s0 && c <= s1) crossed = c;
      else if (c + L > s0 && c + L <= s1) crossed = c + L;
      if (crossed >= 0) this._onCheckpoint(ship, ship.nextCheckpoint, this.raceTime - (h * (s1 - crossed)) / ds);
    }
    this._updateProgressValue(ship);
  }

  _updateProgressValue(ship) {
    const track = this.track;
    const gap = track.checkpointGap;
    if (ship.checkpointsPassed === 0) {
      ship.progress = track.delta(ship.s, 0);
      return;
    }
    const n = track.checkpoints.length;
    const last = (ship.nextCheckpoint - 1 + n) % n;
    const since = Math.min(track.delta(ship.s, track.checkpoints[last]), gap * 1.5);
    ship.progress = (ship.checkpointsPassed - 1) * gap + since;
  }

  _onCheckpoint(ship, index, time) {
    const track = this.track;
    const laps = CONFIG.race.laps;
    const n = track.checkpoints.length;
    ship.checkpointsPassed++;
    ship.nextCheckpoint = (index + 1) % n;
    const isPlayer = ship === this.player;

    if (index !== 0) {
      if (isPlayer && !ship.finished) {
        this.audio.play('checkpoint');
        this.hud.message(`CHECKPOINT ${index}/${n - 1}`, { sub: formatTime(time - ship.lapStart), duration: 1.1, priority: 1 });
      }
      return;
    }
    if (ship.finished) return;

    let newRecord = false;
    if (ship.lap >= 1) {
      const lapTime = time - ship.lapStart;
      ship.lastLap = lapTime;
      if (ship.bestLap == null || lapTime < ship.bestLap) ship.bestLap = lapTime;
      if (isPlayer && (this.bestLapRecord == null || lapTime < this.bestLapRecord)) {
        this.bestLapRecord = lapTime;
        this.settings.saveBestLap(track.id, lapTime);
        newRecord = true;
      }
    }
    ship.lapStart = time;

    if (ship.lap >= laps) {
      ship.finished = true;
      ship.finishTime = time;
      ship.finishRank = ++this.finishCount;
      if (isPlayer) this._onPlayerFinished(newRecord);
      return;
    }
    ship.lap++;
    if (!isPlayer || ship.lap === 1) return;

    if (newRecord) {
      this.audio.play('bestLap');
      this.hud.message(t('race.newBest'), { kind: 'good', sub: formatTime(ship.lastLap), duration: 1.8, priority: 3 });
    } else {
      this.audio.play(ship.lap === laps ? 'finalLap' : 'lap');
    }
    // Com recorde, o aviso de volta entra na fila e aparece logo depois.
    if (ship.lap === laps) {
      this.hud.message(t('race.finalLap'), { kind: 'big', duration: 2.2, priority: 3, queue: newRecord });
    } else {
      this.hud.message(t('race.lap', { lap: ship.lap, laps }), { sub: formatTime(ship.lastLap), duration: 1.6, priority: 2, queue: newRecord });
    }
  }

  _onPlayerFinished(newRecord) {
    const player = this.player;
    this.state = GameState.FINISHED;
    this.resultsTimer = CONFIG.race.resultsDelay;
    player.autopilotEnabled = true;
    player.autopilot.reset();
    player.autopilot.launchDelay = 0;
    this.audio.play('finish');
    this.hud.message(t('race.finish'), { kind: 'big', sub: t('race.finishSub', { place: ordinal(player.finishRank), time: formatTime(player.finishTime) }), duration: 3, priority: 5 });
    if (newRecord) this.hud.message(t('race.newBest'), { kind: 'good', sub: formatTime(player.lastLap), duration: 1.8, priority: 5, queue: true });
  }

  _rank() {
    const order = this.order;
    order.sort(compareRacers);
    for (let i = 0; i < order.length; i++) order[i].rank = i + 1;
  }

  _updateRubberBand() {
    const RB = CONFIG.rubberBand;
    const level = this.difficulty;
    const player = this.player;
    for (const ship of this.ships) {
      if (ship === player) continue;
      let factor = 0;
      if (RB.enabled && !player.finished && !ship.finished) {
        const gap = player.progress - ship.progress;
        if (gap > RB.minGap) factor = Math.min(1, (gap - RB.minGap) / RB.range) * level.catchUp;
        else if (gap < -RB.minGap) factor = -Math.min(1, (-gap - RB.minGap) / RB.range) * level.slowDown;
      }
      ship.speedScale = ship.speedBias * (1 + factor);
    }
  }

  _showResults() {
    this.resultsShown = true;
    const track = this.track;
    const total = CONFIG.race.laps * track.length;
    let previous = 0;
    const rows = this.order.map((ship, i) => {
      let time = ship.finishTime;
      if (!ship.finished) {
        // Quem ainda não cruzou a linha recebe um tempo projetado pelo ritmo atual.
        const pace = Math.max(45, ship.stats.maxSpeed * ship.speedScale * 0.82);
        time = Math.max(this.raceTime + Math.max(0, total - ship.progress) / pace, previous + 0.05);
      }
      previous = time;
      return { rank: i + 1, name: ship.name, ship: ship.def.name, color: ship.colors.primary, time, bestLap: ship.bestLap, isPlayer: ship.isPlayer };
    });
    this.hud.hide();
    this.input.captureGameKeys = false;
    this.menus.showResults({
      trackName: t('results.trackLine', { track: t(`track.${track.def.id}.name`).toUpperCase(), difficulty: t(`difficulty.${this.difficultyKey}`) }),
      playerRank: this.player.rank,
      rows,
    });
  }

  // ---------- eventos das naves ----------

  _onShipEvent(ship, type, value, side) {
    const fx = this.effects;
    const isPlayer = ship === this.player;
    const p = ship.position;
    const audible = isPlayer || p.distanceToSquared(this.camera.position) < 70 * 70;

    switch (type) {
      case 'boostStart':
        if (isPlayer) {
          this.audio.play('boost');
          fx.flash(0.4, 0x4fd8ff);
        }
        break;
      case 'boostPad':
        fx.sparks(p.x, p.y - 0.4, p.z, -ship.forward.x, 0.4, -ship.forward.z, 10, 2.2, 1.0, 0.15, 18);
        if (isPlayer) {
          this.audio.play('boostPad');
          fx.flash(0.6, 0xff9a3c);
        }
        break;
      case 'wallHit': {
        const r = ship.right;
        fx.sparks(p.x + r.x * side * ship.halfSpan, p.y, p.z + r.z * side * ship.halfSpan, -r.x * side, 0.3, -r.z * side, 6 + value * 20, 2.2, 1.1, 0.25);
        if (isPlayer) this.cameraCtl.shake(0.25 + value * 0.75);
        if (audible) this.audio.play('collision', { intensity: isPlayer ? value : value * 0.4 });
        break;
      }
      case 'wallGrind': {
        const r = ship.right;
        fx.sparks(p.x + r.x * side * ship.halfSpan, p.y - 0.2, p.z + r.z * side * ship.halfSpan, -r.x * side, 0.2, -r.z * side, 4, 2.2, 1.1, 0.25, 16);
        break;
      }
      case 'shipHit': {
        const r = ship.right;
        fx.sparks(p.x + r.x * side * 1.4, p.y, p.z + r.z * side * 1.4, r.x * side, 0.4, r.z * side, 4 + value * 10, 0.9, 1.7, 2.2);
        if (isPlayer) {
          this.cameraCtl.shake(0.2 + value * 0.6);
          this.audio.play('collision', { intensity: value });
        }
        break;
      }
      case 'land':
        if (value > 5) fx.sparks(p.x, p.y - 0.6, p.z, 0, 0.2, 0, 8, 1.0, 0.6, 2.0, 14);
        if (isPlayer && value > 5) {
          this.audio.play('land');
          this.cameraCtl.shake(0.25);
        }
        break;
      case 'fall':
        if (isPlayer) this.hud.message(t('race.offTrack'), { kind: 'warn', duration: 1.4, priority: 2 });
        break;
      case 'ko':
        fx.explosion(p.x, p.y, p.z, 2.2, 0.9, 0.2);
        if (audible) this.audio.play('explosion');
        if (isPlayer) {
          this.cameraCtl.shake(1);
          fx.flash(0.7, 0xff4422);
          this.hud.message(t('race.energyDepleted'), { kind: 'warn', sub: t('race.rebooting'), duration: 2, priority: 4 });
        }
        break;
      case 'respawn':
        if (isPlayer) {
          this.audio.play('respawn');
          this.cameraCtl.snap(ship);
        }
        break;
      default:
        break;
    }
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
    this.input.dispose();
    this.menus.dispose();
    this.events.clear();
  }
}
