/* Player game state: queens, undo/redo history, timer, best times. No DOM. */
(function (root) {
  'use strict';

  const Board = (typeof require !== 'undefined' && typeof module !== 'undefined')
    ? require('./board.js') : root.NQ.Board;

  function Game(options) {
    this.now = options.now || (() => Date.now());
    this.storage = options.storage || null;
    this.setSize(options.n || 8);
  }

  Game.prototype.setSize = function (n) {
    this.n = n;
    this.reset();
  };

  Game.prototype.reset = function () {
    this.queens = [];
    this.undoStack = [];
    this.redoStack = [];
    this.won = false;
    this.lastResult = null;
    this.accumulated = 0;
    this.startedAt = null; // non-null while the clock is running
    this.started = false;
    this.paused = false;
  };

  // ---- timer -------------------------------------------------------------
  Game.prototype.elapsed = function () {
    return this.accumulated + (this.startedAt === null ? 0 : this.now() - this.startedAt);
  };
  Game.prototype._startClock = function () {
    if (this.startedAt === null && !this.won && !this.paused) this.startedAt = this.now();
  };
  Game.prototype._stopClock = function () {
    if (this.startedAt !== null) {
      this.accumulated += this.now() - this.startedAt;
      this.startedAt = null;
    }
  };
  Game.prototype.pause = function () { this.paused = true; this._stopClock(); };
  Game.prototype.resume = function () {
    this.paused = false;
    if (this.started) this._startClock();
  };

  // ---- moves -------------------------------------------------------------
  Game.prototype.moves = function () { return this.undoStack.length; };
  Game.prototype.canUndo = function () { return this.undoStack.length > 0; };
  Game.prototype.canRedo = function () { return this.redoStack.length > 0; };
  Game.prototype.hasQueen = function (row, col) {
    return this.queens.some(q => q.row === row && q.col === col);
  };

  Game.prototype._apply = function (action) {
    if (action.type === 'place') this.queens.push({ row: action.row, col: action.col });
    else this.queens = this.queens.filter(q => !(q.row === action.row && q.col === action.col));
    this._checkWin();
  };
  Game.prototype._revert = function (action) {
    this._apply({ type: action.type === 'place' ? 'remove' : 'place', row: action.row, col: action.col });
  };

  Game.prototype._checkWin = function () {
    const wasWon = this.won;
    this.won = this.queens.length === this.n;
    if (this.won && !wasWon) {
      this._stopClock();
      this.lastResult = this._recordBest();
    } else if (!this.won && wasWon) {
      this.lastResult = null;
      this._startClock();
    }
  };

  // Click on a square: removes the queen if present, otherwise places one if safe.
  Game.prototype.toggle = function (row, col) {
    if (this.hasQueen(row, col)) {
      const action = { type: 'remove', row, col };
      this._apply(action);
      this._push(action);
      return { ok: true, action: 'remove' };
    }
    const found = Board.conflicts(this.queens, row, col);
    if (found.length) return { ok: false, conflicts: found };
    const action = { type: 'place', row, col };
    this.started = true;
    this._startClock();
    this._apply(action);
    this._push(action);
    return { ok: true, action: 'place', won: this.won };
  };

  Game.prototype._push = function (action) {
    this.undoStack.push(action);
    this.redoStack = [];
  };

  Game.prototype.undo = function () {
    const action = this.undoStack.pop();
    if (!action) return null;
    this._revert(action);
    this.redoStack.push(action);
    return action;
  };

  Game.prototype.redo = function () {
    const action = this.redoStack.pop();
    if (!action) return null;
    this._apply(action);
    this.undoStack.push(action);
    return action;
  };

  // ---- best times (per board size) ----------------------------------------
  Game.prototype.best = function (n) {
    try {
      const raw = this.storage && this.storage.getItem('nqueen.best.' + (n || this.n));
      const value = raw === null || raw === undefined ? NaN : Number(raw);
      return Number.isFinite(value) ? value : null;
    } catch (e) { return null; }
  };
  Game.prototype._recordBest = function () {
    const time = this.elapsed();
    const previous = this.best();
    const isNewBest = previous === null || time < previous;
    if (isNewBest) {
      try { if (this.storage) this.storage.setItem('nqueen.best.' + this.n, String(Math.round(time))); } catch (e) { /* storage unavailable */ }
    }
    return { time, best: isNewBest ? Math.round(time) : previous, isNewBest };
  };

  const api = { Game };
  root.NQ = root.NQ || {};
  root.NQ.Game = Game;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
