'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#64b5f6', // J - pale blue
  '#ffb74d', // L - orange
  '#f06292', // U - pink
  '#ff5252', // Bomb - red
  '#40c4ff', // Laser - electric blue
  '#e040fb', // Dye - magenta
  '#78909c', // Gravity - steel gray
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,0,8],[8,8,8],[0,0,0]],                  // U (5 blocks, rare)
  [[9]],                                       // Bomb (power-up, 1 block)
  [[10]],                                      // Laser (power-up, 1 block)
  [[11]],                                      // Dye (power-up, 1 block)
  [[12]],                                      // Gravity (power-up, 1 block)
];

const U_TYPE = 8;
const U_CHANCE = 0.05;

const BOMB_TYPE = 9;
const LASER_TYPE = 10;
const DYE_TYPE = 11;
const GRAVITY_TYPE = 12;
const POWER_TYPES = [BOMB_TYPE, LASER_TYPE, DYE_TYPE, GRAVITY_TYPE];
const POWERUP_LINE_INTERVAL = 5; // spawn a guaranteed power-up piece every N lines cleared
const POWER_SYMBOLS = { [BOMB_TYPE]: 'B', [LASER_TYPE]: 'R', [DYE_TYPE]: 'T', [GRAVITY_TYPE]: 'G' };
const POWER_NAMES = { [BOMB_TYPE]: 'BOMBA', [LASER_TYPE]: 'RAYO', [DYE_TYPE]: 'TINTE', [GRAVITY_TYPE]: 'GRAVEDAD' };

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');

const THEME_STORAGE_KEY = 'tetris-theme';

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let gridColor;
let nextPowerUpAt, pendingPowerUp, effectMessage, effectMessageUntil;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function isPowerType(type) {
  return POWER_TYPES.includes(type);
}

function randomPiece() {
  let type;
  if (pendingPowerUp) {
    pendingPowerUp = false;
    type = POWER_TYPES[Math.floor(Math.random() * POWER_TYPES.length)];
  } else {
    type = Math.random() < U_CHANCE ? U_TYPE : Math.floor(Math.random() * 7) + 1;
  }
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    if (lines >= nextPowerUpAt) {
      pendingPowerUp = true;
      nextPowerUpAt += POWERUP_LINE_INTERVAL;
    }
    updateHUD();
  }
}

function applyBomb(px, py) {
  for (let r = py - 1; r <= py + 1; r++) {
    if (r < 0 || r >= ROWS) continue;
    for (let c = px - 1; c <= px + 1; c++) {
      if (c < 0 || c >= COLS) continue;
      board[r][c] = 0;
    }
  }
}

function applyLaser(px, py) {
  board[py].fill(0);
  for (let r = 0; r < ROWS; r++) board[r][px] = 0;
}

function applyDye() {
  const counts = new Array(COLORS.length).fill(0);
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (board[r][c]) counts[board[r][c]]++;
  let target = 0;
  for (let i = 1; i < counts.length; i++)
    if (counts[i] > counts[target]) target = i;
  if (!target) return;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (board[r][c] === target) board[r][c] = 0;
}

function applyGravityCompact() {
  for (let c = 0; c < COLS; c++) {
    const values = [];
    for (let r = 0; r < ROWS; r++)
      if (board[r][c]) values.push(board[r][c]);
    for (let r = 0; r < ROWS; r++) board[r][c] = 0;
    for (let i = 0; i < values.length; i++)
      board[ROWS - values.length + i][c] = values[i];
  }
}

function applyPowerEffect(piece) {
  const px = piece.x, py = piece.y;
  board[py][px] = 0;
  switch (piece.type) {
    case BOMB_TYPE: applyBomb(px, py); break;
    case LASER_TYPE: applyLaser(px, py); break;
    case DYE_TYPE: applyDye(); break;
    case GRAVITY_TYPE: applyGravityCompact(); break;
  }
  effectMessage = POWER_NAMES[piece.type];
  effectMessageUntil = performance.now() + 800;
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  if (isPowerType(current.type)) applyPowerEffect(current);
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  const symbol = POWER_SYMBOLS[colorIndex];
  if (symbol) {
    context.fillStyle = '#0a0a0a';
    context.font = `bold ${Math.floor(size * 0.55)}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(symbol, x * size + size / 2, y * size + size / 2 + 1);
  }
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);

  // power-up activation banner
  if (effectMessage && performance.now() < effectMessageUntil) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, canvas.height / 2 - 24, canvas.width, 48);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(effectMessage, canvas.width / 2, canvas.height / 2);
  } else {
    effectMessage = '';
  }
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggle.checked = theme === 'light';
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  gridColor = getComputedStyle(document.documentElement).getPropertyValue('--grid-color').trim();
}

function initTheme() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  applyTheme(saved === 'light' ? 'light' : 'dark');
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  nextPowerUpAt = POWERUP_LINE_INTERVAL;
  pendingPowerUp = false;
  effectMessage = '';
  effectMessageUntil = 0;
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);
themeToggle.addEventListener('change', () => {
  applyTheme(themeToggle.checked ? 'light' : 'dark');
  draw();
});

initTheme();
init();
