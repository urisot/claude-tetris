# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Classic Tetris in vanilla JavaScript, HTML5 Canvas, CSS. No dependencies, no bundler, no build step, no framework — intentional per README. Do not introduce package.json/bundler/framework unless explicitly asked.

## Running / testing

No build, lint, or test commands exist.

- Open `index.html` directly in a browser, or serve locally:
  - `python3 -m http.server 8000`
  - `npx serve .`
  - `php -S localhost:8000`
- Verify changes by playing the game in a browser — there is no automated test suite.

## Architecture

Everything lives in one flat file, `game.js` (~305 lines), loaded by `index.html`. No classes/modules — module-level global mutable state and plain functions. Follow this style for new code rather than introducing classes or splitting into modules.

Key pieces:
- **Constants**: `COLS=10`, `ROWS=20`, `BLOCK=30` (px/cell), `COLORS[]` (7 piece colors), `PIECES[]` (shape matrices), `LINE_SCORES=[0,100,300,500,800]`.
- **Board**: `ROWS x COLS` matrix, `0` = empty, `1-7` = locked color index.
- **Piece lifecycle**: `randomPiece()` → `spawn()` promotes `next` to `current` and generates a new `next` (ends game on immediate collision) → movement/`tryRotate()` (transpose+reverse rotation with wall-kick offsets `[0,-1,1,-2,2]`) → `lockPiece()` (`merge()` → `clearLines()` → `spawn()`).
- **Scoring/leveling**: `clearLines()` updates score via `LINE_SCORES[cleared] * level`, recomputes `level = floor(lines/10)+1` and `dropInterval = max(100, 1000-(level-1)*90)`.
- **Game loop**: `loop(ts)` via `requestAnimationFrame`, accumulates delta time against `dropInterval` to drop/lock the piece, then calls `draw()` and reschedules.
- **Rendering**: `draw()` on `#board` canvas draws grid, locked board, ghost piece (`ghostY()`, alpha 0.2), then current piece, via shared `drawBlock()`. `drawNext()` renders the preview on the separate `#next-canvas`.
- **Input**: single `keydown` listener — arrows move/soft-drop, Up/X rotate, Space hard-drop, P toggles pause (works even while paused/game-over; other keys ignored in that state).
- **Pause/Game Over**: share the `#overlay` div, differentiated by title/score text; `restartBtn` re-runs `init()`.

## Conventions

- If you change `COLS`, `ROWS`, or `BLOCK`, also update the `width`/`height` attributes on `<canvas id="board">` in `index.html` (documented in README's "Personalización" table — keep that table in sync with any tunable-constant changes).
- README.md is written in Spanish; code identifiers/comments in `game.js` are in English.
