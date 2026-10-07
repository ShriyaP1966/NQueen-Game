/* Board geometry: which cells attack which. Pure functions, no DOM. */
(function (root) {
  'use strict';

  const MIN_N = 4;
  const MAX_N = 12;

  // How does queen `a` attack square `b`? Returns 'row' | 'column' | 'diagonal' | null.
  function relation(a, b) {
    if (a.row === b.row) return 'row';
    if (a.col === b.col) return 'column';
    if (Math.abs(a.row - b.row) === Math.abs(a.col - b.col)) return 'diagonal';
    return null;
  }

  // Every queen that attacks (row, col), with the kind of attack.
  function conflicts(queens, row, col) {
    const out = [];
    for (const queen of queens) {
      if (queen.row === row && queen.col === col) continue;
      const kind = relation(queen, { row, col });
      if (kind) out.push({ queen, kind });
    }
    return out;
  }

  function isSafe(queens, row, col) {
    return conflicts(queens, row, col).length === 0;
  }

  // Set of "row,col" keys attacked by at least one queen (queen squares excluded).
  function attackedCells(queens, n) {
    const set = new Set();
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (queens.some(q => q.row === r && q.col === c)) continue;
        if (!isSafe(queens, r, c)) set.add(r + ',' + c);
      }
    }
    return set;
  }

  // Squares attacked by one queen.
  function raysOf(queen, n) {
    const set = new Set();
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (r === queen.row && c === queen.col) continue;
        if (relation(queen, { row: r, col: c })) set.add(r + ',' + c);
      }
    }
    return set;
  }

  const PHRASES = {
    row: 'another queen is already in this row',
    column: 'another queen is already in this column',
    diagonal: 'diagonal attack'
  };

  // Human-readable explanation of why a square is unsafe.
  function describeConflict(list) {
    const first = list[0];
    const where = 'Queen at Row ' + (first.queen.row + 1) + ', Column ' + (first.queen.col + 1);
    const more = list.length > 1 ? ' (+' + (list.length - 1) + ' more)' : '';
    return 'Conflict with ' + where + ' — ' + PHRASES[first.kind] + more + '.';
  }

  const api = { MIN_N, MAX_N, relation, conflicts, isSafe, attackedCells, raysOf, describeConflict };
  root.NQ = root.NQ || {};
  root.NQ.Board = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
