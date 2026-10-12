import { Game } from './Game.js';

function boot() {
  const root = document.getElementById('app');
  const params = new URLSearchParams(location.search);
  try {
    // ?autopilot=1 deixa a nave do jogador no piloto automático (modo demonstração / testes).
    const game = new Game(root, { autopilot: params.get('autopilot') === '1' });
    game.start();
    window.neonHyperdrive = game;
    window.__neonBooted = true;
    document.getElementById('loading').hidden = true;
  } catch (err) {
    console.error(err);
    window.__neonFatal?.(`Não foi possível iniciar o jogo: ${err.message}. Verifique se o navegador tem WebGL 2 habilitado.`);
  }
}

boot();
