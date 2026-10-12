import { SHIPS, TRACKS, QUALITY, DIFFICULTY } from './Config.js';
import { formatTime, cssColor } from './Utils.js';

const STAT_LABELS = [
  ['speed', 'VELOCIDADE'],
  ['accel', 'ACELERAÇÃO'],
  ['handling', 'CONTROLE'],
  ['energy', 'ENERGIA'],
  ['boost', 'BOOST'],
];

const DIFFICULTY_NOTES = {
  easy: 'Adversários mais lentos, cautelosos nas curvas e com erros frequentes.',
  normal: 'Adversários competitivos, mas que aliviam nas curvas e erram de vez em quando.',
  hard: 'Adversários no limite: curvas otimizadas, boost agressivo e poucos erros.',
};

const ROW_GROUPS = '.segmented, .cards';

const SCREEN_IDS = ['title', 'ship', 'track', 'help', 'options', 'pause', 'results'];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function pips(value) {
  const wrap = el('div', 'pips');
  for (let i = 0; i < 5; i++) wrap.append(el('i', i < value ? 'on' : ''));
  return wrap;
}

// Telas do jogo (título, seleções, instruções, opções, pausa, resultado).
// Só conversa com o restante do jogo por eventos "ui:*".
export class Menus {
  constructor(events, settings) {
    this.events = events;
    this.settings = settings;
    this.screens = {};
    for (const id of SCREEN_IDS) this.screens[id] = document.getElementById(`screen-${id}`);
    this.current = null;
    this.history = [];
    this.shipIndex = 0;
    this.trackIndex = 0;
    this.trackMeta = new Map();

    this._buildShipCards();
    this._buildTrackCards();
    this._bindButtons();
    this._bindOptions();
    this._bindDifficulty();
    this.refreshOptions();

    this._onKeyDown = (e) => this._handleKey(e);
    window.addEventListener('keydown', this._onKeyDown);
  }

  get ship() {
    return SHIPS[this.shipIndex];
  }

  get track() {
    return TRACKS[this.trackIndex];
  }

  get isOpen() {
    return this.current !== null;
  }

  show(name, { remember = true } = {}) {
    if (this.current === name) return;
    if (this.current) {
      if (remember) this.history.push(this.current);
      this.screens[this.current].hidden = true;
    }
    this.current = name;
    const screen = this.screens[name];
    screen.hidden = false;
    if (name === 'track') this._refreshTrackMeta();
    screen.querySelector('[data-default]')?.focus({ preventScroll: true });
    this.events.emit('ui:screen', name);
  }

  // Abre uma tela substituindo o histórico de navegação (parents = telas para as quais "voltar" leva).
  open(name, parents = []) {
    if (this.current && this.current !== name) this.screens[this.current].hidden = true;
    if (this.current !== name) this.current = null;
    this.history = [...parents];
    this.show(name, { remember: false });
  }

  hide() {
    if (this.current) this.screens[this.current].hidden = true;
    this.current = null;
    this.history.length = 0;
    document.activeElement?.blur?.();
    this.events.emit('ui:screen', null);
  }

  back() {
    if (!this.current) return;
    const previous = this.history.pop();
    if (previous) {
      this.events.emit('ui:sound', 'back');
      this.show(previous, { remember: false });
    } else if (this.current === 'pause') {
      this.events.emit('ui:resume');
    }
  }

  // ---------- construção ----------

  _buildShipCards() {
    const wrap = document.getElementById('ship-cards');
    this.shipCards = SHIPS.map((ship, index) => {
      const card = el('button', 'card');
      card.style.setProperty('--card-color', cssColor(ship.colors.primary));
      card.append(el('h3', '', ship.name), el('p', '', ship.tagline));
      for (const [key, label] of STAT_LABELS) {
        const row = el('div', 'stat');
        row.append(el('span', '', label), pips(ship.ratings[key]));
        card.append(row);
      }
      card.addEventListener('click', () => {
        if (this.shipIndex === index) this._action('confirm-ship');
        else this.selectShip(index);
      });
      wrap.append(card);
      return card;
    });
    this._markSelected(this.shipCards, this.shipIndex);
  }

  _buildTrackCards() {
    const wrap = document.getElementById('track-cards');
    this.trackCards = TRACKS.map((track, index) => {
      const card = el('button', 'card');
      card.style.setProperty('--card-color', cssColor(track.theme.edgeRight));
      const row = el('div', 'stat');
      row.append(el('span', '', 'TRAÇADO'), pips(track.difficulty));
      const meta = el('div', 'meta', '');
      card.append(el('h3', '', track.name), el('p', '', track.description), row, meta);
      card.addEventListener('click', () => {
        if (this.trackIndex === index) this._action('start');
        else this.selectTrack(index);
      });
      wrap.append(card);
      this.trackMeta.set(track.id, { node: meta, length: null });
      return card;
    });
    this._markSelected(this.trackCards, this.trackIndex);
  }

  _markSelected(cards, index) {
    // Se o foco do teclado estava em um cartão, ele acompanha a seleção.
    const focusFollows = cards.includes(document.activeElement);
    cards.forEach((card, i) => card.classList.toggle('selected', i === index));
    if (focusFollows) cards[index].focus({ preventScroll: true });
  }

  selectShip(index) {
    this.shipIndex = (index + SHIPS.length) % SHIPS.length;
    this._markSelected(this.shipCards, this.shipIndex);
    this.events.emit('ui:sound', 'select');
    this.events.emit('ui:previewShip', this.ship);
  }

  selectTrack(index) {
    this.trackIndex = (index + TRACKS.length) % TRACKS.length;
    this._markSelected(this.trackCards, this.trackIndex);
    this.events.emit('ui:sound', 'select');
    this.events.emit('ui:previewTrack', this.track);
    this._refreshTrackMeta();
  }

  setTrackLength(trackId, length) {
    const meta = this.trackMeta.get(trackId);
    if (!meta) return;
    meta.length = length;
    this._refreshTrackMeta();
  }

  _refreshTrackMeta() {
    for (const track of TRACKS) {
      const meta = this.trackMeta.get(track.id);
      const length = meta.length ? `${(meta.length / 1000).toFixed(2)} KM` : '—';
      const best = this.settings.bestLap(track.id);
      meta.node.textContent = `EXTENSÃO ${length}  ·  RECORDE ${best ? formatTime(best) : '—'}`;
    }
  }

  _bindButtons() {
    for (const screen of Object.values(this.screens)) {
      screen.querySelectorAll('button[data-action]').forEach((button) => {
        button.addEventListener('click', () => this._action(button.dataset.action));
        button.addEventListener('focus', () => this.events.emit('ui:sound', 'select'));
      });
    }
  }

  _action(action) {
    const sound = (name) => this.events.emit('ui:sound', name);
    switch (action) {
      case 'play':
        sound('confirm');
        this.show('ship');
        this.events.emit('ui:previewShip', this.ship);
        break;
      case 'help':
      case 'options':
        sound('confirm');
        this.show(action);
        break;
      case 'confirm-ship':
        sound('confirm');
        this.show('track');
        this.events.emit('ui:previewTrack', this.track);
        break;
      case 'start':
        sound('confirm');
        this.events.emit('ui:start', { ship: this.ship, track: this.track });
        break;
      case 'back':
        this.back();
        break;
      case 'resume':
        sound('confirm');
        this.events.emit('ui:resume');
        break;
      case 'restart':
        sound('confirm');
        this.events.emit('ui:restart');
        break;
      case 'change':
        sound('confirm');
        this.events.emit('ui:quit', 'ship');
        break;
      case 'quit':
        sound('back');
        this.events.emit('ui:quit', 'title');
        break;
      default:
        break;
    }
  }

  // ---------- dificuldade ----------

  _bindDifficulty() {
    this.difficultyButtons = [...document.querySelectorAll('#difficulty-select button')];
    this.difficultyNote = document.getElementById('difficulty-note');
    for (const button of this.difficultyButtons) {
      button.addEventListener('click', () => this._setOption('difficulty', button.dataset.difficulty));
    }
  }

  // ---------- opções ----------

  _bindOptions() {
    this.qualityButtons = [...document.querySelectorAll('#opt-quality button')];
    for (const button of this.qualityButtons) {
      button.addEventListener('click', () => this._setOption('quality', button.dataset.quality));
    }
    this.crtButton = document.getElementById('opt-crt');
    this.shadowButton = document.getElementById('opt-shadows');
    this.crtButton.addEventListener('click', () => this._setOption('crt', !this.settings.get('crt')));
    this.shadowButton.addEventListener('click', () => this._setOption('shadows', !this.settings.get('shadows')));
    this.sliders = {};
    for (const key of ['master', 'sfx', 'music']) {
      const input = document.getElementById(`opt-${key}`);
      this.sliders[key] = input;
      input.addEventListener('input', () => this._setOption(key, Number(input.value), false));
      input.addEventListener('change', () => this.events.emit('ui:sound', 'confirm'));
    }
    this.note = document.getElementById('opt-note');
  }

  _setOption(key, value, withSound = true) {
    this.settings.set(key, value);
    this.refreshOptions();
    if (withSound) this.events.emit('ui:sound', 'confirm');
    this.events.emit('ui:setting', key);
  }

  refreshOptions() {
    const s = this.settings;
    for (const button of this.qualityButtons) button.classList.toggle('active', button.dataset.quality === s.get('quality'));
    for (const button of this.difficultyButtons) button.classList.toggle('active', button.dataset.difficulty === s.get('difficulty'));
    this.difficultyNote.textContent = `${DIFFICULTY[s.get('difficulty')].label}: ${DIFFICULTY_NOTES[s.get('difficulty')]}`;
    const toggle = (button, on) => {
      button.setAttribute('aria-pressed', String(on));
      button.textContent = on ? 'LIGADO' : 'DESLIGADO';
    };
    toggle(this.crtButton, s.get('crt'));
    toggle(this.shadowButton, s.get('shadows'));
    for (const key of Object.keys(this.sliders)) this.sliders[key].value = String(s.get(key));
    const q = QUALITY[s.get('quality')];
    this.note.textContent = `${q.label}: bloom ${q.bloom ? 'ligado' : 'desligado'}, ${q.particles} partículas, ${q.cityCount} prédios. A densidade do cenário é aplicada ao iniciar a próxima corrida.`;
  }

  // ---------- resultado ----------

  showResults({ trackName, playerRank, rows }) {
    document.getElementById('results-track').textContent = trackName;
    document.getElementById('results-title').textContent =
      playerRank === 1 ? 'VITÓRIA!' : playerRank <= 3 ? `PÓDIO — ${playerRank}º LUGAR` : `${playerRank}º LUGAR`;
    const body = document.getElementById('results-body');
    body.textContent = '';
    for (const row of rows) {
      const tr = el('tr', row.isPlayer ? 'player' : '');
      const pilot = el('td');
      const chip = el('span', 'chip');
      chip.style.background = cssColor(row.color);
      pilot.append(chip, document.createTextNode(row.name));
      tr.append(el('td', '', `${row.rank}º`), pilot, el('td', '', row.ship), el('td', '', formatTime(row.time)), el('td', '', formatTime(row.bestLap)));
      body.append(tr);
    }
    this.open('results');
  }

  // ---------- teclado ----------

  _handleKey(e) {
    if (!this.current) return;
    const screen = this.screens[this.current];
    const active = document.activeElement;
    const onSlider = active?.tagName === 'INPUT';

    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      // Cartões e seletores segmentados contam como uma linha só: cima/baixo entra na opção
      // marcada e esquerda/direita escolhe dentro da linha.
      const rows = [];
      const groups = new Set();
      for (const node of screen.querySelectorAll('button, input')) {
        if (node.disabled) continue;
        const group = node.closest(ROW_GROUPS);
        if (!group) rows.push(node);
        else if (!groups.has(group)) {
          groups.add(group);
          rows.push(group.querySelector('.active, .selected') ?? node);
        }
      }
      if (!rows.length) return;
      e.preventDefault();
      const activeGroup = active?.closest?.(ROW_GROUPS);
      const index = rows.findIndex((n) => n === active || (activeGroup && n.closest(ROW_GROUPS) === activeGroup));
      const step = e.code === 'ArrowDown' ? 1 : -1;
      const next = index < 0 ? 0 : (index + step + rows.length) % rows.length;
      rows[next].focus({ preventScroll: true });
      return;
    }
    if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight') && !onSlider) {
      const step = e.code === 'ArrowRight' ? 1 : -1;
      const segment = active?.closest?.('.segmented');
      if (segment && screen.contains(segment)) {
        // Dentro de um seletor segmentado, as setas trocam a opção em vez de mudar de tela ou de cartão.
        e.preventDefault();
        const options = [...segment.querySelectorAll('button')];
        const next = options[(options.indexOf(active) + step + options.length) % options.length];
        next.focus({ preventScroll: true });
        if (segment.id === 'difficulty-select') next.click();
      } else if (this.current === 'ship') {
        e.preventDefault();
        this.selectShip(this.shipIndex + step);
      } else if (this.current === 'track') {
        e.preventDefault();
        this.selectTrack(this.trackIndex + step);
      } else {
        const items = [...screen.querySelectorAll('button, input')].filter((n) => !n.disabled);
        const index = items.indexOf(active);
        if (index >= 0) {
          e.preventDefault();
          items[(index + step + items.length) % items.length].focus({ preventScroll: true });
        }
      }
      return;
    }
    if (e.code === 'Enter' && (!active || active === document.body)) {
      e.preventDefault();
      screen.querySelector('[data-default]')?.click();
    }
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
  }
}
