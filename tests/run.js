// Run with: node tests/run.js
const assert = require('node:assert');
const Board = require('../js/board.js');
const Solver = require('../js/solver.js');
const { Game } = require('../js/game.js');

let passed = 0;
function test(name, fn) { fn(); passed++; console.log('ok  -', name); }

function validSolution(n, queens) {
  if (queens.length !== n) return false;
  return queens.every((q, i) => Board.isSafe(queens.filter((_, j) => j !== i), q.row, q.col));
}

test('solver finds a valid solution for N = 4..12, with consistent stats', () => {
  for (let n = 4; n <= 12; n++) {
    const s = Solver.create(n);
    let tries = 0, conflicts = 0, places = 0, backs = 0;
    for (let ev = s.step(); ev; ev = s.step()) {
      if (ev.type === 'try') tries++;
      if (ev.type === 'conflict') conflicts++;
      if (ev.type === 'place') places++;
      if (ev.type === 'backtrack') backs++;
    }
    assert.ok(s.found, 'N=' + n);
    assert.ok(validSolution(n, s.queens()), 'N=' + n);
    assert.strictEqual(s.stats.nodes, tries);
    assert.strictEqual(s.stats.placements, places);
    assert.strictEqual(s.stats.backtracks, backs);
    assert.strictEqual(tries, conflicts + places, 'every try is a conflict or a placement');
    assert.strictEqual(places - backs, n, 'queens left on board = n');
  }
});

test('8-queens first solution is the classic [0,4,7,5,2,6,1,3]', () => {
  const sol = Solver.complete(8, []).sort((a, b) => a.row - b.row).map(q => q.col);
  assert.deepStrictEqual(sol, [0, 4, 7, 5, 2, 6, 1, 3]);
});

test('2 and 3 have no solution', () => {
  assert.strictEqual(Solver.complete(2, []), null);
  assert.strictEqual(Solver.complete(3, []), null);
});

test('hint returns a cell that really extends to a full solution', () => {
  const placed = [{ row: 0, col: 1 }];
  const h = Solver.hint(4, placed);
  assert.strictEqual(h.status, 'ok');
  assert.ok(Board.isSafe(placed, h.row, h.col));
  assert.ok(Solver.complete(4, placed.concat({ row: h.row, col: h.col })));
});

test('hint detects dead ends', () => {
  assert.strictEqual(Solver.hint(4, [{ row: 0, col: 0 }, { row: 1, col: 2 }]).status, 'deadend');
});

test('following hints from an empty board completes every size', () => {
  for (let n = 4; n <= 12; n++) {
    const placed = [];
    while (placed.length < n) {
      const h = Solver.hint(n, placed);
      assert.strictEqual(h.status, 'ok', 'N=' + n);
      assert.ok(Board.isSafe(placed, h.row, h.col));
      placed.push({ row: h.row, col: h.col });
    }
    assert.ok(validSolution(n, placed), 'N=' + n);
  }
});

test('conflict descriptions', () => {
  const q = [{ row: 1, col: 3 }];
  assert.match(Board.describeConflict(Board.conflicts(q, 3, 5)), /Row 2, Column 4.*diagonal/);
  assert.match(Board.describeConflict(Board.conflicts(q, 5, 3)), /column/);
  assert.match(Board.describeConflict(Board.conflicts(q, 1, 0)), /row/);
});

function fakeStorage() {
  const data = {};
  return { getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = v; } };
}

test('game: place, remove, invalid move, move counter', () => {
  const g = new Game({ n: 4, storage: fakeStorage() });
  assert.deepStrictEqual(g.toggle(0, 0), { ok: true, action: 'place', won: false });
  assert.strictEqual(g.toggle(1, 1).ok, false);
  assert.strictEqual(g.moves(), 1, 'invalid move is not counted');
  assert.strictEqual(g.toggle(0, 0).action, 'remove');
  assert.strictEqual(g.moves(), 2);
});

test('game: undo / redo restore board and moves; a new move clears redo', () => {
  const g = new Game({ n: 4, storage: fakeStorage() });
  g.toggle(0, 1); g.toggle(1, 3);
  g.undo();
  assert.strictEqual(g.queens.length, 1);
  assert.strictEqual(g.moves(), 1);
  g.redo();
  assert.strictEqual(g.queens.length, 2);
  assert.strictEqual(g.moves(), 2);
  g.undo(); g.toggle(2, 0);
  assert.strictEqual(g.canRedo(), false);
});

test('game: win, timer stop, per-size best times, undo of a win', () => {
  let t = 0;
  const storage = fakeStorage();
  const g = new Game({ n: 4, now: () => t, storage });
  g.toggle(0, 1); t = 1000; g.toggle(1, 3); t = 2000; g.toggle(2, 0); t = 5000;
  assert.strictEqual(g.toggle(3, 2).won, true);
  assert.strictEqual(g.lastResult.time, 5000);
  assert.strictEqual(g.best(4), 5000);
  assert.strictEqual(g.best(5), null, 'best times are per size');
  t = 9000;
  assert.strictEqual(g.elapsed(), 5000, 'clock stopped on win');
  g.undo();
  assert.strictEqual(g.won, false);
  t = 10000;
  assert.strictEqual(g.elapsed(), 6000, 'clock resumes after undoing a win');
  g.redo();
  assert.strictEqual(g.won, true);
  assert.strictEqual(g.lastResult.isNewBest, false, 'a slower re-win must not replace the best');
  assert.strictEqual(g.best(4), 5000);
});

test('game: pause/resume stops the clock; reset and resize clear state', () => {
  let t = 0;
  const g = new Game({ n: 5, now: () => t, storage: fakeStorage() });
  g.toggle(0, 0); t = 1000; g.pause(); t = 4000; g.resume(); t = 4500;
  assert.strictEqual(g.elapsed(), 1500);
  g.reset();
  assert.strictEqual(g.elapsed(), 0);
  assert.strictEqual(g.moves(), 0);
  g.toggle(0, 0); g.setSize(6);
  assert.strictEqual(g.queens.length, 0);
});

console.log('\n' + passed + ' tests passed');
