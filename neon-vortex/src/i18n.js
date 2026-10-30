// Internacionalização: dicionários (inglês padrão, português, alemão), t() e re-renderização ao vivo.
// Elementos com data-i18n recebem textContent; data-i18n-html recebe innerHTML (dicas com <b>).

const STORAGE_KEY = 'neon-vortex.lang';

export const LANGUAGES = [
  { id: 'en', label: 'ENGLISH', html: 'en' },
  { id: 'pt', label: 'PORTUGUÊS', html: 'pt-BR' },
  { id: 'de', label: 'DEUTSCH', html: 'de' },
];

const en = {
  'title.kicker': 'ANTIGRAVITY LEAGUE // SEASON 2187',
  'title.play': 'START RACE', 'title.help': 'HOW TO PLAY', 'title.options': 'OPTIONS',
  'title.hint': 'ARROWS / ENTER TO NAVIGATE',
  'lang.label': 'LANGUAGE',
  'ship.heading': 'CHOOSE YOUR SHIP', 'track.heading': 'CHOOSE THE TRACK',
  'common.back': 'BACK', 'common.confirm': 'CONFIRM', 'track.start': 'LAUNCH',
  'difficulty.label': 'DIFFICULTY',
  'difficulty.easy': 'EASY', 'difficulty.normal': 'NORMAL', 'difficulty.hard': 'HARD',
  'difficulty.note.easy': 'Slower opponents, cautious in corners and making frequent mistakes.',
  'difficulty.note.normal': 'Competitive opponents who ease off in corners and slip up now and then.',
  'difficulty.note.hard': 'Opponents at the limit: optimized lines, aggressive boost and few mistakes.',
  'help.heading': 'HOW TO PLAY',
  'help.accel': 'Accelerate', 'help.brake': 'Brake / reverse', 'help.steer': 'Steer', 'help.boost': 'Boost',
  'key.space': 'Space', 'help.drift': 'Drift (side brake)', 'help.reset': 'Reset onto the track',
  'help.camera': 'Switch camera', 'help.pause': 'Pause',
  'help.tip1': '<b class="c-orange">Orange strips</b> give a free speed boost.',
  'help.tip2': '<b class="c-blue">Blue strips</b> recharge your ship\'s energy.',
  'help.tip3': '<b>Energy</b> is your health and also fuels the boost: hard crashes and long boosts drain it.',
  'help.tip4': 'In tight corners, hold <b>Space</b> to drift and turn faster, at the cost of speed.',
  'help.tip5': 'Sections with <b class="c-red">red edges</b> have no barrier: leaving the shoulder means falling.',
  'help.tip6': 'Races are 3 laps. Pass every checkpoint for the lap to count.',
  'options.heading': 'OPTIONS', 'options.quality': 'GRAPHICS QUALITY',
  'quality.low': 'LOW', 'quality.medium': 'MEDIUM', 'quality.high': 'HIGH',
  'options.crt': 'CRT EFFECT', 'options.shadows': 'SHADOWS', 'options.on': 'ON', 'options.off': 'OFF',
  'options.master': 'MASTER VOLUME', 'options.sfx': 'EFFECTS', 'options.music': 'MUSIC',
  'options.note': '{q}: bloom {bloom}, {particles} particles, {city} buildings. Scenery density applies when the next race starts.',
  'options.bloomOn': 'on', 'options.bloomOff': 'off',
  'pause.heading': 'PAUSED', 'pause.resume': 'RESUME', 'pause.restart': 'RESTART RACE', 'pause.quit': 'QUIT TO MENU',
  'results.heading': 'RESULTS', 'results.pos': 'POS', 'results.pilot': 'PILOT', 'results.ship': 'SHIP',
  'results.time': 'TIME', 'results.best': 'BEST LAP', 'results.again': 'RACE AGAIN',
  'results.change': 'CHANGE SHIP / TRACK', 'results.menu': 'MAIN MENU',
  'results.victory': 'VICTORY!', 'results.podium': 'PODIUM — {place} PLACE', 'results.place': '{place} PLACE',
  'results.trackLine': '{track}  ·  DIFFICULTY {difficulty}',
  'loading': 'INITIALIZING HYPERDRIVE…', 'fatal.heading': 'SYSTEM FAILURE',
  'fatal.boot': 'The game could not start: {msg}. Check that your browser has WebGL 2 enabled.',
  'fatal.runtime': 'Runtime error: {msg}',
  'hud.lap': 'LAP', 'hud.best': 'BEST', 'hud.energy': 'ENERGY', 'hud.lowEnergy': 'LOW ENERGY',
  'hud.boostReady': 'BOOST READY', 'hud.boostActive': 'BOOST ACTIVE', 'hud.recharging': 'RECHARGING',
  'stat.speed': 'SPEED', 'stat.accel': 'ACCELERATION', 'stat.handling': 'HANDLING', 'stat.energy': 'ENERGY', 'stat.boost': 'BOOST',
  'track.layout': 'LAYOUT', 'track.meta': 'LENGTH {length}  ·  RECORD {best}',
  'camera.near': 'NEAR CAMERA', 'camera.far': 'FAR CAMERA', 'camera.cockpit': 'COCKPIT CAMERA',
  'race.you': 'YOU', 'race.intro': '{laps} LAPS  ·  {difficulty}', 'race.newBest': 'NEW BEST LAP',
  'race.finalLap': 'FINAL LAP', 'race.lap': 'LAP {lap}/{laps}', 'race.finish': 'FINISH!',
  'race.finishSub': '{place} PLACE  ·  {time}', 'race.offTrack': 'OFF TRACK',
  'race.energyDepleted': 'ENERGY DEPLETED', 'race.rebooting': 'REBOOTING SYSTEMS', 'race.go': 'GO!',
  'ship.falcon.tagline': 'Balanced. Handles well on any circuit.',
  'ship.spear.tagline': 'Brutal top speed, but demands steady hands.',
  'ship.warden.tagline': 'Heavy armor and long boost. Slow off the line.',
  'track.aurora.name': 'Aurora Skyway',
  'track.aurora.desc': 'Suspended circuit above the metropolis. Wide corners, a long tunnel and a treacherous hairpin.',
  'track.crimson.name': 'Crimson Abyss',
  'track.crimson.desc': 'Technical layout over the void. Fewer barriers, more exposed sections and corner sequences.',
  'track.carnival.name': 'Lunar Carnival',
  'track.carnival.desc': 'A night race beside an amusement park. Rolling hills, jumps on the crests and a tunnel under the crescent moon.',
  'track.glacial.name': 'Glacial Rift',
  'track.glacial.desc': 'A frozen sea under the northern lights and a ringed planet. Jump the rift, cross the ice cave and watch out for unbarriered corners.',
};

const pt = {
  'title.kicker': 'LIGA ANTIGRAVIDADE // TEMPORADA 2187',
  'title.play': 'INICIAR CORRIDA', 'title.help': 'INSTRUÇÕES', 'title.options': 'OPÇÕES',
  'title.hint': 'SETAS / ENTER PARA NAVEGAR',
  'lang.label': 'IDIOMA',
  'ship.heading': 'ESCOLHA SUA NAVE', 'track.heading': 'ESCOLHA A PISTA',
  'common.back': 'VOLTAR', 'common.confirm': 'CONFIRMAR', 'track.start': 'LARGAR',
  'difficulty.label': 'DIFICULDADE',
  'difficulty.easy': 'FÁCIL', 'difficulty.normal': 'NORMAL', 'difficulty.hard': 'DIFÍCIL',
  'difficulty.note.easy': 'Adversários mais lentos, cautelosos nas curvas e com erros frequentes.',
  'difficulty.note.normal': 'Adversários competitivos, mas que aliviam nas curvas e erram de vez em quando.',
  'difficulty.note.hard': 'Adversários no limite: curvas otimizadas, boost agressivo e poucos erros.',
  'help.heading': 'INSTRUÇÕES',
  'help.accel': 'Acelerar', 'help.brake': 'Frear / ré', 'help.steer': 'Virar', 'help.boost': 'Boost',
  'key.space': 'Espaço', 'help.drift': 'Drift (freio lateral)', 'help.reset': 'Reposicionar na pista',
  'help.camera': 'Trocar câmera', 'help.pause': 'Pausar',
  'help.tip1': '<b class="c-orange">Faixas laranja</b> dão um impulso gratuito.',
  'help.tip2': '<b class="c-blue">Faixas azuis</b> recarregam a energia da nave.',
  'help.tip3': 'A <b>energia</b> é sua vida e também alimenta o boost: colisões fortes e boost prolongado a consomem.',
  'help.tip4': 'Em curvas fechadas, segure <b>Espaço</b> para derrapar e virar mais rápido, ao custo de velocidade.',
  'help.tip5': 'Nos trechos com <b class="c-red">bordas vermelhas</b> não há barreira: sair do acostamento significa cair.',
  'help.tip6': 'São 3 voltas. Passe por todos os checkpoints para a volta contar.',
  'options.heading': 'OPÇÕES', 'options.quality': 'QUALIDADE GRÁFICA',
  'quality.low': 'BAIXO', 'quality.medium': 'MÉDIO', 'quality.high': 'ALTO',
  'options.crt': 'EFEITO CRT', 'options.shadows': 'SOMBRAS', 'options.on': 'LIGADO', 'options.off': 'DESLIGADO',
  'options.master': 'VOLUME GERAL', 'options.sfx': 'EFEITOS', 'options.music': 'MÚSICA',
  'options.note': '{q}: bloom {bloom}, {particles} partículas, {city} prédios. A densidade do cenário é aplicada ao iniciar a próxima corrida.',
  'options.bloomOn': 'ligado', 'options.bloomOff': 'desligado',
  'pause.heading': 'PAUSA', 'pause.resume': 'CONTINUAR', 'pause.restart': 'REINICIAR CORRIDA', 'pause.quit': 'SAIR PARA O MENU',
  'results.heading': 'RESULTADO', 'results.pos': 'POS', 'results.pilot': 'PILOTO', 'results.ship': 'NAVE',
  'results.time': 'TEMPO', 'results.best': 'MELHOR VOLTA', 'results.again': 'CORRER NOVAMENTE',
  'results.change': 'TROCAR NAVE / PISTA', 'results.menu': 'MENU PRINCIPAL',
  'results.victory': 'VITÓRIA!', 'results.podium': 'PÓDIO — {place} LUGAR', 'results.place': '{place} LUGAR',
  'results.trackLine': '{track}  ·  DIFICULDADE {difficulty}',
  'loading': 'INICIALIZANDO HYPERDRIVE…', 'fatal.heading': 'FALHA NO SISTEMA',
  'fatal.boot': 'Não foi possível iniciar o jogo: {msg}. Verifique se o navegador tem WebGL 2 habilitado.',
  'fatal.runtime': 'Erro durante a execução: {msg}',
  'hud.lap': 'VOLTA', 'hud.best': 'MELHOR', 'hud.energy': 'ENERGIA', 'hud.lowEnergy': 'ENERGIA BAIXA',
  'hud.boostReady': 'BOOST PRONTO', 'hud.boostActive': 'BOOST ATIVO', 'hud.recharging': 'RECARREGANDO',
  'stat.speed': 'VELOCIDADE', 'stat.accel': 'ACELERAÇÃO', 'stat.handling': 'CONTROLE', 'stat.energy': 'ENERGIA', 'stat.boost': 'BOOST',
  'track.layout': 'TRAÇADO', 'track.meta': 'EXTENSÃO {length}  ·  RECORDE {best}',
  'camera.near': 'CÂMERA PRÓXIMA', 'camera.far': 'CÂMERA DISTANTE', 'camera.cockpit': 'CÂMERA COCKPIT',
  'race.you': 'VOCÊ', 'race.intro': '{laps} VOLTAS  ·  {difficulty}', 'race.newBest': 'NOVA MELHOR VOLTA',
  'race.finalLap': 'VOLTA FINAL', 'race.lap': 'VOLTA {lap}/{laps}', 'race.finish': 'CHEGADA!',
  'race.finishSub': '{place} LUGAR  ·  {time}', 'race.offTrack': 'FORA DA PISTA',
  'race.energyDepleted': 'ENERGIA ESGOTADA', 'race.rebooting': 'REINICIANDO SISTEMAS', 'race.go': 'JÁ!',
  'ship.falcon.tagline': 'Equilibrada. Responde bem em qualquer circuito.',
  'ship.spear.tagline': 'Velocidade máxima brutal, mas exige mãos firmes.',
  'ship.warden.tagline': 'Blindagem pesada e boost longo. Arranca devagar.',
  'track.aurora.name': 'Aurora Skyway',
  'track.aurora.desc': 'Circuito suspenso sobre a metrópole. Curvas largas, um túnel longo e um grampo traiçoeiro.',
  'track.crimson.name': 'Abismo Carmesim',
  'track.crimson.desc': 'Traçado técnico sobre o vazio. Menos barreiras, mais trechos expostos e curvas em sequência.',
  'track.carnival.name': 'Carnaval Lunar',
  'track.carnival.desc': 'Corrida noturna à beira de um parque de diversões. Morros em sequência, saltos nas cristas e um túnel sob a lua crescente.',
  'track.glacial.name': 'Fenda Glacial',
  'track.glacial.desc': 'Mar congelado sob a aurora boreal e um planeta anelado. Salte sobre a fenda, cruze a caverna de gelo e cuidado com as curvas sem barreira.',
};

const de = {
  'title.kicker': 'ANTIGRAVITATIONSLIGA // SAISON 2187',
  'title.play': 'RENNEN STARTEN', 'title.help': 'ANLEITUNG', 'title.options': 'OPTIONEN',
  'title.hint': 'PFEILTASTEN / ENTER ZUM NAVIGIEREN',
  'lang.label': 'SPRACHE',
  'ship.heading': 'WÄHLE DEIN SCHIFF', 'track.heading': 'WÄHLE DIE STRECKE',
  'common.back': 'ZURÜCK', 'common.confirm': 'BESTÄTIGEN', 'track.start': 'STARTEN',
  'difficulty.label': 'SCHWIERIGKEIT',
  'difficulty.easy': 'LEICHT', 'difficulty.normal': 'NORMAL', 'difficulty.hard': 'SCHWER',
  'difficulty.note.easy': 'Langsamere Gegner, vorsichtig in Kurven und mit häufigen Fehlern.',
  'difficulty.note.normal': 'Starke Gegner, die in Kurven etwas nachlassen und ab und zu Fehler machen.',
  'difficulty.note.hard': 'Gegner am Limit: optimierte Linien, aggressiver Boost und kaum Fehler.',
  'help.heading': 'ANLEITUNG',
  'help.accel': 'Beschleunigen', 'help.brake': 'Bremsen / rückwärts', 'help.steer': 'Lenken', 'help.boost': 'Boost',
  'key.space': 'Leertaste', 'help.drift': 'Drift (Seitenbremse)', 'help.reset': 'Auf die Strecke zurücksetzen',
  'help.camera': 'Kamera wechseln', 'help.pause': 'Pause',
  'help.tip1': '<b class="c-orange">Orange Streifen</b> geben einen kostenlosen Schub.',
  'help.tip2': '<b class="c-blue">Blaue Streifen</b> laden die Energie deines Schiffs auf.',
  'help.tip3': '<b>Energie</b> ist dein Leben und speist auch den Boost: harte Kollisionen und langer Boost verbrauchen sie.',
  'help.tip4': 'Halte in engen Kurven die <b>Leertaste</b>, um zu driften und schneller einzulenken – auf Kosten der Geschwindigkeit.',
  'help.tip5': 'Abschnitte mit <b class="c-red">roten Rändern</b> haben keine Barriere: Wer den Seitenstreifen verlässt, stürzt ab.',
  'help.tip6': 'Ein Rennen hat 3 Runden. Fahre durch alle Checkpoints, damit die Runde zählt.',
  'options.heading': 'OPTIONEN', 'options.quality': 'GRAFIKQUALITÄT',
  'quality.low': 'NIEDRIG', 'quality.medium': 'MITTEL', 'quality.high': 'HOCH',
  'options.crt': 'CRT-EFFEKT', 'options.shadows': 'SCHATTEN', 'options.on': 'AN', 'options.off': 'AUS',
  'options.master': 'GESAMTLAUTSTÄRKE', 'options.sfx': 'EFFEKTE', 'options.music': 'MUSIK',
  'options.note': '{q}: Bloom {bloom}, {particles} Partikel, {city} Gebäude. Die Szenendichte gilt ab dem nächsten Rennen.',
  'options.bloomOn': 'an', 'options.bloomOff': 'aus',
  'pause.heading': 'PAUSE', 'pause.resume': 'WEITER', 'pause.restart': 'RENNEN NEU STARTEN', 'pause.quit': 'ZUM HAUPTMENÜ',
  'results.heading': 'ERGEBNIS', 'results.pos': 'POS', 'results.pilot': 'PILOT', 'results.ship': 'SCHIFF',
  'results.time': 'ZEIT', 'results.best': 'BESTE RUNDE', 'results.again': 'NOCHMAL FAHREN',
  'results.change': 'SCHIFF / STRECKE WECHSELN', 'results.menu': 'HAUPTMENÜ',
  'results.victory': 'SIEG!', 'results.podium': 'PODIUM — {place} PLATZ', 'results.place': '{place} PLATZ',
  'results.trackLine': '{track}  ·  SCHWIERIGKEIT {difficulty}',
  'loading': 'HYPERDRIVE WIRD INITIALISIERT…', 'fatal.heading': 'SYSTEMFEHLER',
  'fatal.boot': 'Das Spiel konnte nicht starten: {msg}. Prüfe, ob WebGL 2 im Browser aktiviert ist.',
  'fatal.runtime': 'Laufzeitfehler: {msg}',
  'hud.lap': 'RUNDE', 'hud.best': 'BESTE', 'hud.energy': 'ENERGIE', 'hud.lowEnergy': 'WENIG ENERGIE',
  'hud.boostReady': 'BOOST BEREIT', 'hud.boostActive': 'BOOST AKTIV', 'hud.recharging': 'LÄDT AUF',
  'stat.speed': 'TEMPO', 'stat.accel': 'BESCHLEUNIGUNG', 'stat.handling': 'HANDLING', 'stat.energy': 'ENERGIE', 'stat.boost': 'BOOST',
  'track.layout': 'STRECKENFÜHRUNG', 'track.meta': 'LÄNGE {length}  ·  REKORD {best}',
  'camera.near': 'NAHE KAMERA', 'camera.far': 'FERNE KAMERA', 'camera.cockpit': 'COCKPIT-KAMERA',
  'race.you': 'DU', 'race.intro': '{laps} RUNDEN  ·  {difficulty}', 'race.newBest': 'NEUE BESTE RUNDE',
  'race.finalLap': 'LETZTE RUNDE', 'race.lap': 'RUNDE {lap}/{laps}', 'race.finish': 'ZIEL!',
  'race.finishSub': '{place} PLATZ  ·  {time}', 'race.offTrack': 'VON DER STRECKE',
  'race.energyDepleted': 'ENERGIE ERSCHÖPFT', 'race.rebooting': 'SYSTEME STARTEN NEU', 'race.go': 'LOS!',
  'ship.falcon.tagline': 'Ausgewogen. Fährt sich gut auf jeder Strecke.',
  'ship.spear.tagline': 'Brutale Höchstgeschwindigkeit, verlangt aber ruhige Hände.',
  'ship.warden.tagline': 'Schwere Panzerung und langer Boost. Langsam beim Start.',
  'track.aurora.name': 'Aurora Skyway',
  'track.aurora.desc': 'Schwebende Strecke über der Metropole. Weite Kurven, ein langer Tunnel und eine tückische Haarnadel.',
  'track.crimson.name': 'Karminabgrund',
  'track.crimson.desc': 'Technische Strecke über dem Nichts. Weniger Barrieren, mehr offene Abschnitte und Kurvenkombinationen.',
  'track.carnival.name': 'Mondkarneval',
  'track.carnival.desc': 'Nachtrennen neben einem Freizeitpark. Hügel in Folge, Sprünge über die Kuppen und ein Tunnel unter der Mondsichel.',
  'track.glacial.name': 'Gletscherspalte',
  'track.glacial.desc': 'Ein gefrorenes Meer unter Polarlichtern und einem Ringplaneten. Spring über die Spalte, durchquere die Eishöhle und achte auf Kurven ohne Barriere.',
};

const DICTS = { en, pt, de };
const listeners = new Set();

function readLang() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return DICTS[v] ? v : 'en';
  } catch {
    return 'en';
  }
}

let current = readLang();

export function getLang() {
  return current;
}

// t('race.lap', { lap: 2, laps: 3 }) -> "LAP 2/3". Fallback: inglês, depois a própria chave.
export function t(key, params) {
  let s = DICTS[current][key] ?? en[key] ?? key;
  if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? String(params[k]) : m));
  return s;
}

// Número ordinal: 1st/2nd (en), 1º (pt), 1. (de).
export function ordinal(n) {
  if (current === 'pt') return `${n}º`;
  if (current === 'de') return `${n}.`;
  const mod100 = n % 100;
  const suf = mod100 >= 11 && mod100 <= 13 ? 'TH' : ({ 1: 'ST', 2: 'ND', 3: 'RD' }[n % 10] ?? 'TH');
  return `${n}${suf}`;
}

export function ordinalSuffix(n) {
  return ordinal(n).slice(String(n).length);
}

export function applyTranslations(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((node) => { node.textContent = t(node.dataset.i18n); });
  root.querySelectorAll('[data-i18n-html]').forEach((node) => { node.innerHTML = t(node.dataset.i18nHtml); });
  document.documentElement.lang = LANGUAGES.find((l) => l.id === current).html;
  document.querySelectorAll('[data-lang]').forEach((b) => b.classList.toggle('active', b.dataset.lang === current));
}

export function setLang(lang) {
  if (!DICTS[lang]) return;
  current = lang;
  try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* sem persistência */ }
  applyTranslations();
  for (const fn of listeners) fn(lang);
}

export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
