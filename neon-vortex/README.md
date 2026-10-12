# NEON HYPERDRIVE

**▶ [Jogar online](https://antoniocrgonzaga-lang.github.io/Grok-Project/neon-vortex/)** (Chrome, Edge ou Firefox no computador, precisa de internet)

Corrida antigravitacional retrofuturista em Three.js. Oito fighters, três voltas, pista procedural suspensa sobre uma metrópole neon.

## Como executar

O jogo usa módulos ES, então precisa ser servido por HTTP (abrir o `index.html` direto do disco não funciona).

No Windows, dê dois cliques em **`start.bat`**: ele sobe o servidor local e abre o jogo no navegador. Mantenha a janela do terminal aberta enquanto joga; fechá-la encerra o servidor. O script usa o Node se estiver instalado e, na falta dele, o Python.

Manualmente, com Node (servidor incluído, sem dependências):

```bash
node server.mjs --open
```

Sem `--open`, abra <http://localhost:5173> você mesmo. Para outra porta: `node server.mjs 8080`. Se a porta estiver ocupada, o servidor tenta as seguintes e mostra o endereço final no terminal.

Alternativas equivalentes:

```bash
python -m http.server 5173
```

```bash
npx serve .
```

O Three.js (r165) é carregado via CDN pelo `importmap` do `index.html`, portanto a primeira carga exige internet. Para jogar offline, baixe o pacote `three@0.165.0`, coloque `build/` e `examples/jsm/` em uma pasta `vendor/three/` e aponte as duas entradas do `importmap` para ela.

## Controles

| Tecla | Ação |
| --- | --- |
| `W` / `↑` | Acelerar |
| `S` / `↓` | Frear / ré |
| `A` `D` / `←` `→` | Virar |
| `Shift` | Boost |
| `Espaço` | Drift (freio lateral) |
| `R` | Reposicionar a nave na pista |
| `C` | Alternar câmera (próxima, distante, cockpit) |
| `P` / `Esc` | Pausar |

Nos menus: setas e `Enter` navegam, `Esc` volta. Gamepad com mapeamento padrão também funciona na corrida (analógico esquerdo, gatilhos, `A` boost, `X` drift, `Start` pausa).

## Pistas

- **Aurora Skyway**: circuito suspenso sobre a metrópole ao pôr do sol, com túnel longo e um grampo.
- **Abismo Carmesim**: traçado técnico, com mais trechos sem barreira.
- **Carnaval Lunar**: corrida noturna sob uma lua crescente, ao lado de um parque de diversões animado (montanha-russa com looping, roda-gigante, carrossel e torre de queda). Tem uma sequência de morros com saltos nas cristas.
- **Fenda Glacial**: mar congelado sob a aurora boreal, com um planeta anelado no horizonte, formações de cristal de gelo e poeira de gelo no ar. Tem uma fenda de verdade no traçado: a rampa antes dela lança a nave por cima, mas quem chega devagar demais (abaixo de uns 500 km/h na borda) cai e volta logo depois da fenda.

## Regras rápidas

- **Dificuldade** (Fácil, Normal, Difícil) é escolhida na tela de seleção de pista e fica salva. Ela muda a velocidade dos adversários, o quanto eles aliviam nas curvas, a frequência de erros e o uso de boost.
- **Energia** é a vida da nave e o combustível do boost. Batidas fortes, raspar no muro e boost prolongado a consomem. Ao zerar, a nave apaga por alguns segundos e volta com 40%.
- **Faixas laranja** dão impulso gratuito. **Faixas azuis** recarregam energia.
- Trechos com **bordas vermelhas** não têm barreira: o acostamento freia a nave e, além dele, ela cai (penalidade de energia e reposicionamento).
- A volta só conta se todos os checkpoints forem cruzados em ordem.

## Estrutura

```
index.html          telas, HUD e importmap
style.css           interface
server.mjs          servidor estático local
src/
  main.js           inicialização e tratamento de erro fatal
  Game.js           estados, laço principal, voltas, classificação, eventos
  Config.js         TODAS as constantes: física, energia, IA, naves, pistas, qualidade
  Track.js          spline, referenciais, zonas e malhas procedurais da pista
  Environment.js    céu, sol ou lua, montanhas, grade, cidade, luzes
  AmusementPark.js  parque de diversões animado da pista Carnaval Lunar
  Ship.js           física e visual comuns às naves (coordenadas locais da pista)
  PlayerShip.js     nave do jogador
  AIRacer.js        AIController (pilotagem) e AIRacer
  ShipModel.js      geometria procedural dos fighters
  CollisionSystem.js muros, acostamento e nave contra nave
  CameraController.js três modos de câmera, sobrevoo e vitrine
  Effects.js        bloom, CRT, partículas (pool), trilhas, linhas de velocidade
  AudioManager.js   sons e trilha procedurais (Web Audio)
  HUD.js            interface da corrida e minimapa
  Menus.js          telas de menu, opções e resultado
  InputManager.js   teclado e gamepad
  Settings.js       opções e recordes em localStorage
  EventBus.js, Utils.js
```

### Como a física funciona

Cada nave vive em coordenadas da pista: `s` (distância ao longo da spline), `d` (deslocamento lateral) e `h` (altura). O rumo é relativo à tangente da pista e a curvatura "gira" a pista sob a nave, então é preciso esterçar para fazer a curva, mas o jogador fica livre para usar toda a largura. Tudo é integrado com delta time (com subpassos quando o quadro demora), e o comportamento foi conferido a 30, 60 e 144 passos por segundo.

### Ajustes comuns (`src/Config.js`)

- `CONFIG.physics`: aceleração, aderência, drift, `curveAssist` (quanto a nave acompanha a curva sozinha) e `alignAssist`.
- `DIFFICULTY`: os três níveis. Cada um define multiplicadores de velocidade (`speed`), de velocidade em curva (`corner`, `cornerNoise`), de habilidade, erros e boost da IA, além da intensidade do rubber banding (`catchUp`, `slowDown`).
- `CONFIG.rubberBand`: ajuda discreta aos adversários distantes. `enabled: false` desliga. Os atributos do jogador nunca são alterados.
- `CONFIG.ship`: altura de flutuação, inclinação máxima nas curvas e `groundClearance`, a folga mínima entre a nave inclinada e o piso.
- `AI_ROSTER`: habilidade, viés de velocidade e agressividade de cada piloto.
- `SHIPS` e `TRACKS`: novas naves e pistas são só dados. Em uma pista, zonas (`open`, `tunnels`, `ramps`, `gaps`, `boostPads`, `recharge`) são posicionadas pelo índice fracionário dos pontos de controle.
- `QUALITY`: o que cada nível gráfico liga ou reduz.

### Trocar sons por arquivos

Qualquer efeito pode ser substituído sem mexer no sintetizador:

```js
neonHyperdrive.audio.loadSample('boost', 'sons/boost.ogg');
```

Nomes disponíveis: `confirm`, `select`, `back`, `countdown`, `go`, `boost`, `boostPad`, `collision`, `explosion`, `checkpoint`, `recharge`, `lowEnergy`, `lap`, `finalLap`, `bestLap`, `finish`, `respawn`, `land`.

### Modo demonstração

`http://localhost:5173/?autopilot=1` coloca a nave do jogador no piloto automático. Útil para ver uma corrida inteira ou testar mudanças. O objeto do jogo fica em `window.neonHyperdrive`.

## Estado desta versão

Verificado por simulação automatizada no navegador: corrida completa nas duas pistas (largada, 3 voltas, chegada, resultado), bloqueio de volta falsa ao dar ré sobre a linha, classificação, quedas, KO por energia, pausa, reinícios repetidos sem acúmulo de objetos ou listeners, redimensionamento, troca de qualidade/sombras/CRT e console sem erros.

Ainda não avaliado por alguém jogando: a sensação dos controles no teclado, o equilíbrio de dificuldade contra a IA e a mixagem do áudio. Os valores estão concentrados em `Config.js` para facilitar esse ajuste fino. O gamepad segue o mapeamento padrão, mas não foi testado com um controle físico.
