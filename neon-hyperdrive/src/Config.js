// Configurações centralizadas do NEON HYPERDRIVE.
// Unidades: distância em "metros" de mundo, tempo em segundos, ângulos em radianos.

export const CONFIG = {
  version: '0.1.0',

  race: {
    laps: 3,
    checkpointCount: 10,
    countdownSeconds: 3,
    introSeconds: 1.2,
    gridStartOffset: 16,
    gridRowSpacing: 13,
    gridLateral: 5.5,
    gridStagger: 5,
    resultsDelay: 3.2,
  },

  track: {
    halfWidth: 15,
    shoulder: 5,
    sampleSpacing: 4,
    wallHeight: 2.6,
    groundY: -90,
    bankGain: 14,
    maxBank: 0.2,
    rampLength: 16,
    rampHeight: 1.7,
    tunnelHeightScale: 0.62,
  },

  ship: {
    length: 6.6,
    width: 4.0,
    hoverHeight: 1.2,
    visualScale: 1.25,
    // Distância mínima entre o ponto mais baixo da nave (asa inclinada, nariz, motores) e o piso.
    groundClearance: 0.3,
    maxRoll: 0.42,
    maxSlipRoll: 0.18,
  },

  physics: {
    maxStep: 1 / 50,
    gravity: 36,
    coastDrag: 9,
    linearDrag: 0.05,
    brakeDecel: 70,
    reverseSpeed: 16,
    overspeedDecel: 30,
    accelFalloff: 0.55,
    steerRise: 6.5,
    steerReturn: 9,
    yawResponse: 10,
    highSpeedTurnLoss: 0.22,
    lowSpeedTurnRef: 22,
    slideFactor: 0.28,
    driftSlideFactor: 0.5,
    driftGripScale: 0.38,
    driftTurnScale: 1.6,
    driftDecel: 10,
    driftMinSpeed: 30,
    alignAssist: 1.3,
    // Fração da curvatura da pista que a nave acompanha sozinha (0 = nenhuma ajuda).
    curveAssist: 0.25,
    maxHeading: 1.25,
    airControl: 0.3,
    shoulderDecel: 60,
    shoulderMaxFactor: 0.55,
    grindMaxFactor: 0.78,
    fallDepth: 45,
    respawnCooldown: 2,
    respawnInvuln: 1.6,
    respawnSpeed: 25,
  },

  energy: {
    boostDrain: 24,
    boostRegen: 10,
    boostRegenDelay: 0.7,
    boostMinStart: 20,
    boostEnergyCost: 3,
    boostMinEnergy: 8,
    padDuration: 1.5,
    padSpeedMult: 1.4,
    padAccel: 95,
    // Energia recuperada por segundo sobre as faixas azuis.
    rechargeRate: 32.5,
    wallDamageThreshold: 6,
    wallDamageScale: 0.45,
    shipDamageThreshold: 5,
    shipDamageScale: 0.3,
    fallPenalty: 15,
    grindDrain: 3,
    koRecoverTime: 2.2,
    koRestore: 0.4,
    lowThreshold: 0.25,
    strongImpact: 20,
    invulnTime: 0.9,
  },

  ai: {
    lookBase: 12,
    lookTime: 0.2,
    steerGain: 3.6,
    targetSmooth: 3,
    brakeDecel: 52,
    stuckSpeed: 8,
    stuckTime: 2.5,
    padSeekDistance: 90,
    rechargeSeekDistance: 140,
  },

  // Rubber banding discreto: só altera os adversários, nunca os atributos do jogador.
  // A intensidade (catchUp / slowDown) vem do nível de dificuldade.
  rubberBand: {
    enabled: true,
    minGap: 150,
    range: 500,
  },

  camera: {
    fovSpeed: 12,
    fovBoost: 13,
    modes: [
      { id: 'near', label: 'NEAR CAMERA', distance: 9.5, height: 3.3, fov: 68, dirRate: 6, anticipation: 0.3, boostPull: 2.4, speedPull: 1.4, roll: 0.07, cockpit: false },
      { id: 'far', label: 'FAR CAMERA', distance: 15, height: 6, fov: 64, dirRate: 4.5, anticipation: 0.35, boostPull: 3.2, speedPull: 2, roll: 0.05, cockpit: false },
      { id: 'cockpit', label: 'COCKPIT CAMERA', distance: 0, height: 1.15, forward: 1.4, fov: 78, dirRate: 14, anticipation: 0.2, boostPull: 0, speedPull: 0, roll: 0.12, cockpit: true },
    ],
  },

  hud: {
    speedFactor: 9,
  },
};

export const COLORS = {
  cyan: 0x00e5ff,
  magenta: 0xff2bd6,
  purple: 0x8a3cff,
  blue: 0x2a6cff,
  red: 0xff2244,
  orange: 0xff7a00,
  yellow: 0xffd23f,
  white: 0xffffff,
  mint: 0x3dffb0,
  ice: 0x9ff6ff,
};

export const SHIPS = [
  {
    id: 'falcon',
    name: 'Vortex Falcon',
    tagline: 'Balanced. Handles well on any circuit.',
    stats: { maxSpeed: 128, accel: 48, turnRate: 1.25, grip: 6.5, energy: 100, boostMult: 1.3, boostAccel: 72 },
    ratings: { speed: 4, accel: 4, handling: 4, energy: 3, boost: 3 },
    colors: { primary: 0xff2bd6, accent: 0x00e5ff, engine: 0x00e5ff },
    shape: { nose: 3.2, bodyW: 0.78, span: 2.5, sweep: 1.3, finH: 0.85, engineSpread: 0.85, anhedral: 0.22 },
  },
  {
    id: 'spear',
    name: 'Crimson Spear',
    tagline: 'Brutal top speed, but demands steady hands.',
    stats: { maxSpeed: 137, accel: 46, turnRate: 1.08, grip: 5.4, energy: 90, boostMult: 1.28, boostAccel: 70 },
    ratings: { speed: 5, accel: 4, handling: 2, energy: 2, boost: 3 },
    colors: { primary: 0xff2244, accent: 0xff9a1f, engine: 0xff7a00 },
    shape: { nose: 4.1, bodyW: 0.66, span: 2.1, sweep: 1.7, finH: 1.05, engineSpread: 0.72, anhedral: 0.3 },
  },
  {
    id: 'warden',
    name: 'Ion Warden',
    tagline: 'Heavy armor and long boost. Slow off the line.',
    stats: { maxSpeed: 125, accel: 40, turnRate: 1.22, grip: 7.2, energy: 140, boostMult: 1.36, boostAccel: 66 },
    ratings: { speed: 3, accel: 2, handling: 4, energy: 5, boost: 5 },
    colors: { primary: 0x2a6cff, accent: 0xb46bff, engine: 0x00e5ff },
    shape: { nose: 2.7, bodyW: 0.95, span: 2.9, sweep: 1.0, finH: 0.7, engineSpread: 1.0, anhedral: 0.14 },
  },
];

// Níveis de dificuldade: ajustes aplicados por cima do perfil de cada piloto da IA.
//   speed       multiplica a velocidade máxima e a aceleração dos adversários
//   corner      multiplica a velocidade com que eles entram nas curvas
//   cornerNoise quanto essa velocidade varia de uma curva para outra (0 = sempre no limite)
//   skill       somado à habilidade (trajetória, oscilação lateral, tempo de reação na largada)
//   errors      multiplica a frequência de erros (abrir a curva, frear tarde, aliviar)
//   boost       multiplica a disposição para usar boost
//   catchUp / slowDown  rubber banding: ajuda a quem está muito atrás / freio em quem disparou na frente
export const DIFFICULTY = {
  easy: { label: 'EASY', speed: 0.9, corner: 0.76, cornerNoise: 0.16, skill: -0.22, errors: 2.4, boost: 0.35, catchUp: 0.015, slowDown: 0.08 },
  normal: { label: 'NORMAL', speed: 0.95, corner: 0.87, cornerNoise: 0.1, skill: -0.1, errors: 1.6, boost: 0.65, catchUp: 0.03, slowDown: 0.06 },
  hard: { label: 'HARD', speed: 1, corner: 1, cornerNoise: 0.02, skill: 0, errors: 1, boost: 1, catchUp: 0.04, slowDown: 0.04 },
};

// Pilotos controlados por IA. skill e speedBias definem a força relativa de cada um.
export const AI_ROSTER = [
  { name: 'NYX ORION', ship: 'spear', colors: { primary: 0x00e5ff, accent: 0xffffff, engine: 0x00e5ff }, skill: 0.97, speedBias: 0.985, aggression: 0.8 },
  { name: 'KAEL VANTA', ship: 'falcon', colors: { primary: 0xff7a00, accent: 0xffd23f, engine: 0xff7a00 }, skill: 0.93, speedBias: 0.985, aggression: 0.6 },
  { name: 'ZARA QUILL', ship: 'warden', colors: { primary: 0x8a3cff, accent: 0x00e5ff, engine: 0xb46bff }, skill: 0.9, speedBias: 0.99, aggression: 0.5 },
  { name: 'DREX MORROW', ship: 'spear', colors: { primary: 0xff2244, accent: 0xff7a00, engine: 0xff2244 }, skill: 0.86, speedBias: 0.96, aggression: 0.9 },
  { name: 'IONA VEX', ship: 'falcon', colors: { primary: 0x2a6cff, accent: 0x00e5ff, engine: 0x2a6cff }, skill: 0.83, speedBias: 0.965, aggression: 0.4 },
  { name: 'RHO TALOS', ship: 'warden', colors: { primary: 0xffd23f, accent: 0xff2244, engine: 0xff7a00 }, skill: 0.79, speedBias: 0.965, aggression: 0.7 },
  { name: 'MIRA SOLENNE', ship: 'falcon', colors: { primary: 0xd8d8ff, accent: 0xff2bd6, engine: 0xff2bd6 }, skill: 0.75, speedBias: 0.95, aggression: 0.3 },
];

// As posições das zonas usam o índice (fracionário) dos pontos de controle:
// 3.5 = metade do caminho entre o ponto 3 e o ponto 4.
export const TRACKS = [
  {
    id: 'aurora',
    name: 'Aurora Skyway',
    description: 'Suspended circuit above the metropolis. Wide corners, a long tunnel and a treacherous hairpin.',
    difficulty: 2,
    scale: 1.25,
    points: [
      [0, 0, 300], [300, 0, 300], [480, 6, 240], [545, 18, 60], [460, 34, -120],
      [280, 44, -200], [120, 34, -120], [-20, 22, -200], [-120, 10, -340], [-300, 2, -400],
      [-460, 0, -320], [-480, 4, -160], [-400, 12, -40], [-250, 14, -5], [-214.6, 13, 9.6],
      [-200, 12, 45], [-214.6, 11, 80.4], [-250, 10, 95], [-420, 4, 125], [-530, 0, 190],
      [-530, 0, 275], [-400, 0, 300],
    ],
    open: [[3.3, 5.4], [18.15, 18.85]],
    tunnels: [[8.1, 10.6]],
    ramps: [0.5, 7.25],
    boostPads: [{ at: 0.2, d: 0 }, { at: 2.5, d: 0 }, { at: 5.8, d: 0 }, { at: 10.9, d: 0 }, { at: 17.6, d: 0 }, { at: 21.35, d: -3 }],
    recharge: [{ from: 11.1, to: 11.9, side: 1 }, { from: 21.2, to: 21.95, side: 1 }],
    theme: {
      fog: 0x1a0633, fogDensity: 0.00082,
      skyTop: 0x04010d, skyMid: 0x2b0a55, skyHorizon: 0xff3d9a,
      sunTop: 0xffe14d, sunBottom: 0xff2a7a, sunAngle: -0.35,
      grid: 0xff2bd6, gridBase: 0x07020f,
      mountain: 0x0a0318, mountainLine: 0x00e5ff,
      edgeLeft: 0x00e5ff, edgeRight: 0xff2bd6,
      city: [0x00e5ff, 0xff2bd6, 0x8a3cff, 0xff7a00],
      light: 0xff7ac8, ambientSky: 0x6a4cff, ambientGround: 0xff2bd6,
    },
  },
  {
    id: 'crimson',
    name: 'Crimson Abyss',
    description: 'Technical layout over the void. Fewer barriers, more exposed sections and corner sequences.',
    difficulty: 3,
    scale: 1.2,
    points: [
      [0, 0, 350], [320, 0, 350], [520, 10, 250], [560, 30, 60], [420, 45, -40],
      [260, 50, 60], [120, 40, -20], [140, 25, -220], [320, 15, -330], [300, 5, -470],
      [80, 0, -520], [-160, 0, -440], [-260, 10, -260], [-180, 25, -80], [-300, 35, 80],
      [-500, 25, 60], [-580, 10, 220], [-440, 0, 340], [-200, 0, 350],
    ],
    open: [[2.3, 3.4], [6.3, 7.6], [13.3, 14.4]],
    tunnels: [[9.6, 11.8]],
    ramps: [0.45, 11.95],
    boostPads: [{ at: 0.15, d: 0 }, { at: 5.5, d: 0 }, { at: 8.4, d: 0 }, { at: 12.4, d: 0 }, { at: 15.5, d: 0 }, { at: 17.6, d: 3 }],
    recharge: [{ from: 7.9, to: 8.6, side: -1 }, { from: 17.9, to: 18.8, side: -1 }],
    theme: {
      fog: 0x14051f, fogDensity: 0.00082,
      skyTop: 0x020108, skyMid: 0x1a0a4a, skyHorizon: 0xff4a2a,
      sunTop: 0xffb347, sunBottom: 0xff1744, sunAngle: 2.4,
      grid: 0x2a6cff, gridBase: 0x04030f,
      mountain: 0x080314, mountainLine: 0xff2bd6,
      edgeLeft: 0xff7a00, edgeRight: 0x2a6cff,
      city: [0xff2244, 0xff7a00, 0x2a6cff, 0x8a3cff],
      light: 0xff8a5c, ambientSky: 0x3a5cff, ambientGround: 0xff2244,
    },
  },
  {
    id: 'carnival',
    name: 'Lunar Carnival',
    description: 'A night race beside an amusement park. Rolling hills, jumps on the crests and a tunnel under the crescent moon.',
    difficulty: 2,
    scale: 1.5,
    points: [
      [0, 0, 320], [280, 0, 320], [470, 8, 250], [560, 22, 80], [510, 38, -90],
      [340, 30, -190], [170, 60, -210], [10, 18, -220], [-150, 64, -235], [-310, 22, -240],
      [-460, 12, -170], [-540, 6, -20], [-500, 4, 130], [-390, 10, 195], [-260, 16, 160],
      [-150, 10, 245], [-70, 2, 305],
    ],
    open: [[6.3, 7.6], [13.3, 14.5]],
    tunnels: [[10.4, 11.7]],
    ramps: [5.75, 7.75],
    boostPads: [{ at: 0.25, d: 0 }, { at: 2.6, d: 0 }, { at: 5.2, d: 0 }, { at: 9.5, d: 0 }, { at: 12.2, d: 0 }, { at: 15.6, d: -3 }],
    recharge: [{ from: 0.45, to: 0.95, side: 1 }, { from: 11.9, to: 12.7, side: -1 }],
    // Noite de lua crescente: céu azul-marinho e estrelado, luar frio,
    // e as luzes quentes do parque (dourado, laranja, magenta) como contraponto.
    theme: {
      fog: 0x0a0c24, fogDensity: 0.00062,
      skyTop: 0x010209, skyMid: 0x0a1240, skyHorizon: 0x4a5fd0,
      stars: 1.0, starCut: 0.93,
      moon: { color: 0xe6eeff, shade: 0x0b1030, glow: 0x7aa2ff, cut: [-0.42, 0.2], elevation: 0.2 },
      sunAngle: 1.75,
      sunTop: 0xe6eeff, sunBottom: 0x7aa2ff,
      grid: 0x5a3cff, gridBase: 0x03030c,
      mountain: 0x04051a, mountainLine: 0x5a78ff,
      edgeLeft: 0xb46bff, edgeRight: 0xffb020,
      city: [0x8a3cff, 0x2a6cff, 0xffb020, 0x00e5ff],
      light: 0x9db8ff, ambientSky: 0x3c4cff, ambientGround: 0x8a3cff,
      rings: false,
      park: { angle: 1.3 },
    },
  },
  {
    id: 'glacial',
    name: 'Glacial Rift',
    description: 'A frozen sea under the northern lights and a ringed planet. Jump the rift, cross the ice cave and watch out for unbarriered corners.',
    difficulty: 3,
    scale: 1.3,
    points: [
      [0, 0, 300], [300, 0, 300], [520, 15, 230], [600, 35, 60], [560, 45, -120],
      [420, 45, -200], [250, 45, -210], [80, 40, -200], [-40, 30, -120], [-180, 20, -60],
      [-320, 15, -120], [-460, 10, -220], [-600, 8, -160], [-640, 5, 0], [-560, 2, 160],
      [-380, 0, 260], [-180, 0, 300],
    ],
    open: [[8.2, 9.6], [14.3, 15.2]],
    tunnels: [[10.3, 12.2]],
    // Fenda: trecho sem piso, com rampa automática antes da borda. Só passa quem salta.
    gaps: [{ at: 5.6, length: 40 }],
    ramps: [0.5],
    boostPads: [{ at: 0.2, d: 0 }, { at: 2.6, d: 0 }, { at: 6.35, d: 0 }, { at: 9.8, d: 0 }, { at: 13.5, d: 0 }, { at: 16.4, d: -3 }],
    recharge: [{ from: 7.1, to: 7.8, side: -1 }, { from: 16.1, to: 16.85, side: 1 }],
    // Noite polar: azul-petróleo profundo, aurora verde-menta e violeta, gelo ciano-claro
    // e um gigante gasoso anelado no lugar do sol.
    theme: {
      fog: 0x061a28, fogDensity: 0.0007,
      skyTop: 0x01040c, skyMid: 0x05263c, skyHorizon: 0x1f9aa6,
      stars: 0.8, starCut: 0.94,
      aurora: { strength: 1.0, low: 0x3dffb0, high: 0x9a5cff },
      planet: { color: 0x5a3cc8, band: 0x3fd8e0, ring: 0xc8f6ff, elevation: 0.13, size: 0.1, roll: 0.35 },
      sunAngle: -0.6,
      sunTop: 0xc8f6ff, sunBottom: 0x3fd8e0,
      grid: 0x2fd0d8, gridBase: 0x020b12,
      mountain: 0x08182a, mountainLine: 0xbff6ff,
      edgeLeft: 0x9a5cff, edgeRight: 0x3dffb0,
      scenery: 'crystals',
      crystal: [0x5f9fc8, 0x4a78b8, 0x7a68c0, 0x4aa8a8],
      crystalGlow: [0x3dffb0, 0x9a5cff, 0x2fd0d8],
      city: [0x3dffb0, 0x9a5cff, 0x2fd0d8, 0xc8f6ff],
      light: 0xaef4ff, ambientSky: 0x2a8fa0, ambientGround: 0x5a3cff,
      rings: false,
      beams: false,
      snow: true,
    },
  },
];

export const QUALITY = {
  low: {
    label: 'LOW', pixelRatio: 1, msaa: 0, bloom: false, bloomStrength: 0, aberration: 0,
    particles: 350, trailPoints: 14, speedLines: 30, cityCount: 140, beams: 6,
    far: 2200, shadowMapSize: 1024, engineParticleRange: 120, radialBlur: false,
  },
  medium: {
    label: 'MEDIUM', pixelRatio: 1.5, msaa: 2, bloom: true, bloomStrength: 0.595, aberration: 0.0016,
    particles: 900, trailPoints: 22, speedLines: 60, cityCount: 300, beams: 12,
    far: 2800, shadowMapSize: 1024, engineParticleRange: 220, radialBlur: true,
  },
  high: {
    label: 'HIGH', pixelRatio: 2, msaa: 4, bloom: true, bloomStrength: 0.85, aberration: 0.002,
    particles: 1800, trailPoints: 30, speedLines: 100, cityCount: 480, beams: 18,
    far: 3400, shadowMapSize: 2048, engineParticleRange: 320, radialBlur: true,
  },
};

export const DEFAULT_SETTINGS = {
  difficulty: 'normal',
  quality: 'medium',
  crt: true,
  shadows: false,
  master: 0.8,
  sfx: 0.9,
  music: 0.5,
};
