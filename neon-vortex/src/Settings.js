import { DEFAULT_SETTINGS, DIFFICULTY, QUALITY } from './Config.js';

const SETTINGS_KEY = 'neon-vortex.settings';
const RECORDS_KEY = 'neon-vortex.records';

function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Armazenamento indisponível (modo privado, por exemplo): o jogo segue sem persistir.
  }
}

export class Settings {
  constructor() {
    this.values = { ...DEFAULT_SETTINGS, ...(readJSON(SETTINGS_KEY) ?? {}) };
    if (!QUALITY[this.values.quality]) this.values.quality = DEFAULT_SETTINGS.quality;
    if (!DIFFICULTY[this.values.difficulty]) this.values.difficulty = DEFAULT_SETTINGS.difficulty;
    this.records = readJSON(RECORDS_KEY) ?? {};
  }

  get(key) {
    return this.values[key];
  }

  set(key, value) {
    this.values[key] = value;
    writeJSON(SETTINGS_KEY, this.values);
  }

  get quality() {
    return QUALITY[this.values.quality];
  }

  get difficulty() {
    return DIFFICULTY[this.values.difficulty];
  }

  bestLap(trackId) {
    const value = this.records[trackId]?.bestLap;
    return Number.isFinite(value) ? value : null;
  }

  saveBestLap(trackId, time) {
    this.records[trackId] = { ...(this.records[trackId] ?? {}), bestLap: time };
    writeJSON(RECORDS_KEY, this.records);
  }
}
