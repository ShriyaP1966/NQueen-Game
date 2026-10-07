/* Backtracking N-Queens solver that exposes every step as an event.
 *
 * The search is a real recursive backtracking generator: the UI pulls one event
 * at a time (try, conflict, safe, place, exhausted, backtrack, solution), so what
 * you see on screen is exactly what the algorithm does. Nothing is precomputed.
 */
(function (root) {
  'use strict';

  const Board = (typeof require !== 'undefined' && typeof module !== 'undefined')
    ? require('./board.js') : root.NQ.Board;
  const clock = (typeof performance !== 'undefined') ? performance : Date;

  // `fixed` = queens that are already on the board (rows the search must skip).
  function* search(n, fixed, stats, queens) {
    const fixedRows = new Set(fixed.map(q => q.row));

    function* placeRow(startRow) {
      let row = startRow;
      while (row < n && fixedRows.has(row)) row++;
      if (row >= n) return true;
      stats.row = row;

      for (let col = 0; col < n; col++) {
        stats.nodes++;
        yield { type: 'try', row, col };

        const found = Board.conflicts(queens, row, col);
        if (found.length) {
          yield { type: 'conflict', row, col, conflicts: found };
          continue;
        }
        yield { type: 'safe', row, col };

        queens.push({ row, col });
        stats.placements++;
        yield { type: 'place', row, col };

        if (yield* placeRow(row + 1)) return true;

        queens.pop();
        stats.backtracks++;
        stats.row = row;
        yield { type: 'backtrack', row, col };
      }

      yield { type: 'exhausted', row };
      return false;
    }

    const ok = yield* placeRow(0);
    yield ok ? { type: 'solution' } : { type: 'nosolution' };
  }

  function create(n, fixed) {
    fixed = (fixed || []).map(q => ({ row: q.row, col: q.col }));
    const stats = { nodes: 0, placements: 0, backtracks: 0, row: 0 };
    const queens = fixed.map(q => ({ row: q.row, col: q.col }));
    const gen = search(n, fixed, stats, queens);
    const solver = {
      n,
      stats,
      done: false,
      found: false,
      elapsedMs: 0, // time spent inside the algorithm itself (not animation delays)
      queens: () => queens.map(q => ({ row: q.row, col: q.col })),
      step() {
        if (solver.done) return null;
        const t0 = clock.now();
        const { value } = gen.next();
        solver.elapsedMs += clock.now() - t0;
        if (value.type === 'solution' || value.type === 'nosolution') {
          solver.done = true;
          solver.found = value.type === 'solution';
        }
        return value;
      }
    };
    return solver;
  }

  // Run the same solver to completion from a partial board.
  // Returns the full list of queens, or null if this position is a dead end.
  function complete(n, fixed) {
    const solver = create(n, fixed);
    while (!solver.done) solver.step();
    return solver.found ? solver.queens() : null;
  }

  // Suggest the next queen for the player, taken from a real solution that
  // contains every queen they have placed.
  function hint(n, placed) {
    if (placed.length >= n) return { status: 'complete' };
    const solution = complete(n, placed);
    if (!solution) return { status: 'deadend' };
    const missing = solution
      .filter(q => !placed.some(p => p.row === q.row && p.col === q.col))
      .sort((a, b) => a.row - b.row);
    return { status: 'ok', row: missing[0].row, col: missing[0].col };
  }

  const api = { create, complete, hint };
  root.NQ = root.NQ || {};
  root.NQ.Solver = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
