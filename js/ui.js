/* UI: renders the board, wires up the player game and the solver visualizer. */
(function () {
  'use strict';

  const { Board, Solver, Game } = window.NQ;
  const $ = id => document.getElementById(id);

  const els = {
    board: $('board'), message: $('boardMessage'), size: $('sizeSelect'), attackToggle: $('attackToggle'),
    time: $('timeStat'), moves: $('movesStat'), queensStat: $('queensStat'), best: $('bestStat'), bestLabel: $('bestLabel'),
    undo: $('undoBtn'), redo: $('redoBtn'), hint: $('hintBtn'), reset: $('resetBtn'),
    win: $('winCard'), winSize: $('winSize'), winMoves: $('winMoves'), winTime: $('winTime'), winBest: $('winBest'), winNote: $('winNote'),
    play: $('playBtn'), pause: $('pauseBtn'), step: $('stepBtn'), solverReset: $('solverResetBtn'),
    speed: $('speed'), speedOut: $('speedOut'), status: $('solverStatus'),
    nodes: $('statNodes'), placements: $('statPlacements'), backtracks: $('statBacktracks'), row: $('statRow'),
    result: $('resultCard'), resTitle: $('resultTitle'), resSize: $('resSize'), resNodes: $('resNodes'),
    resPlacements: $('resPlacements'), resBacktracks: $('resBacktracks'), resTime: $('resTime'),
    themeBtn: $('themeBtn'), themeIcon: $('themeIcon'), themeLabel: $('themeLabel')
  };

  function safeStorage() {
    try { const s = window.localStorage; s.getItem('nqueen.probe'); return s; } catch (e) { return null; }
  }
  const storage = safeStorage();

  const game = new Game({ n: 8, now: () => performance.now(), storage });

  // What the board is currently showing, besides the queens themselves.
  const view = {
    mode: 'play',          // 'play' | 'solve'
    solver: null,
    playing: false,
    timeout: null,
    hint: null, trying: null, safe: null, conflict: null, attackers: [], removed: null,
    hover: null, focus: { row: 0, col: 0 }
  };
  let cells = [];

  // ---------- helpers ----------
  const key = (r, c) => r + ',' + c;
  const fmtTime = ms => {
    const s = Math.floor(ms / 1000);
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  };
  const pos = (r, c) => 'Row ' + (r + 1) + ', Column ' + (c + 1);
  const currentQueens = () => (view.mode === 'solve' && view.solver ? view.solver.queens() : game.queens);
  const clearFeedback = () => {
    view.hint = view.trying = view.safe = view.conflict = view.removed = null;
    view.attackers = [];
  };
  const setMessage = text => { els.message.textContent = text; };

  // ---------- board construction ----------
  function buildBoard() {
    const n = game.n;
    els.board.innerHTML = '';
    els.board.style.setProperty('--n', n);
    els.board.setAttribute('aria-label', n + ' by ' + n + ' chess board');
    cells = [];
    const NS = 'http://www.w3.org/2000/svg';
    const icon = (cls, href) => {
      const svg = document.createElementNS(NS, 'svg');
      if (cls) svg.setAttribute('class', cls);
      svg.setAttribute('aria-hidden', 'true');
      const use = document.createElementNS(NS, 'use');
      use.setAttribute('href', href);
      svg.appendChild(use);
      return { svg, use };
    };
    for (let r = 0; r < n; r++) {
      const rowEl = document.createElement('div');
      rowEl.setAttribute('role', 'row');
      cells[r] = [];
      for (let c = 0; c < n; c++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cell ' + ((r + c) % 2 ? 'dark' : 'light');
        btn.setAttribute('role', 'gridcell');
        btn.tabIndex = -1;
        btn.dataset.row = r;
        btn.dataset.col = c;
        btn.appendChild(icon('q', '#queen').svg);
        const mark = document.createElement('span');
        mark.className = 'mark';
        const m = icon('', '#i-x');
        mark.appendChild(m.svg);
        btn.appendChild(mark);
        rowEl.appendChild(btn);
        cells[r][c] = { el: btn, markUse: m.use, label: '', cls: '', markKind: '' };
      }
      els.board.appendChild(rowEl);
    }
    view.focus = { row: 0, col: 0 };
  }

  // ---------- rendering ----------
  const MARK_ICON = { x: '#i-x', dot: '#i-dot', safe: '#i-check', trying: '#i-q', conflict: '#i-warn', hint: '#i-star' };

  function renderBoard() {
    const n = game.n;
    const queens = currentQueens();
    const qset = new Set(queens.map(q => key(q.row, q.col)));
    const showAttacks = els.attackToggle.checked;
    const attacked = showAttacks && queens.length ? Board.attackedCells(queens, n) : new Set();

    // hover preview: a queen shows its own attack lines; an attacked square shows who attacks it
    let rays = new Set();
    let hoverAttackers = new Set();
    if (view.hover && view.mode === 'play') {
      const { row, col } = view.hover;
      if (qset.has(key(row, col))) rays = Board.raysOf({ row, col }, n);
      else Board.conflicts(queens, row, col).forEach(x => hoverAttackers.add(key(x.queen.row, x.queen.col)));
    }
    const attackerSet = new Set(view.attackers.map(q => key(q.row, q.col)));
    hoverAttackers.forEach(k => attackerSet.add(k));

    let qi = 0;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const cell = cells[r][c];
        const k = key(r, c);
        const hasQueen = qset.has(k);
        const isAttacked = attacked.has(k);
        const isConflict = view.conflict && view.conflict.row === r && view.conflict.col === c;
        const isTrying = view.trying && view.trying.row === r && view.trying.col === c;
        const isSafe = view.safe && view.safe.row === r && view.safe.col === c;
        const isHint = view.hint && view.hint.row === r && view.hint.col === c;
        const isRemoving = view.removed && view.removed.row === r && view.removed.col === c;

        let mark = '';
        if (isConflict) mark = 'conflict';
        else if (isHint) mark = 'hint';
        else if (isSafe) mark = 'safe';
        else if (isTrying) mark = 'trying';
        else if (isAttacked) mark = 'x';
        else if (showAttacks && queens.length && !hasQueen) mark = 'dot';

        const classes = ['cell', (r + c) % 2 ? 'dark' : 'light'];
        if (hasQueen) classes.push('has-queen');
        if (isRemoving) classes.push('removing');
        if (isAttacked) classes.push('attacked');
        if (rays.has(k)) classes.push('ray');
        if (isConflict) classes.push('conflict');
        if (isTrying || isSafe) classes.push('trying');
        if (isHint) classes.push('hint');
        if (attackerSet.has(k)) classes.push('attacker');
        const cls = classes.join(' ');
        if (cls !== cell.cls) { cell.el.className = cls; cell.cls = cls; }

        if (mark !== cell.markKind) {
          if (mark) { cell.el.dataset.mark = mark; cell.markUse.setAttribute('href', MARK_ICON[mark]); }
          else delete cell.el.dataset.mark;
          cell.markKind = mark;
        }

        let label = pos(r, c) + ', ' + (hasQueen ? 'queen' : 'empty');
        if (!hasQueen && isAttacked) label += ', attacked';
        if (isHint) label += ', suggested hint';
        if (isConflict) label += ', conflict';
        if (label !== cell.label) { cell.el.setAttribute('aria-label', label); cell.label = label; }

        cell.el.setAttribute('aria-disabled', view.mode === 'solve' ? 'true' : 'false');
        cell.el.tabIndex = (view.focus.row === r && view.focus.col === c) ? 0 : -1;
        if (hasQueen) cell.el.style.setProperty('--i', qi++);
      }
    }
    els.board.classList.toggle('locked', view.mode === 'solve');
  }

  function renderStats() {
    els.time.textContent = fmtTime(game.elapsed());
    els.moves.textContent = game.moves();
    els.queensStat.textContent = game.queens.length + ' / ' + game.n;
    const best = game.best();
    els.bestLabel.textContent = 'Best ' + game.n + '×' + game.n;
    els.best.textContent = best === null ? '—' : fmtTime(best);
  }

  function renderSolverStats() {
    const st = view.solver ? view.solver.stats : null;
    els.nodes.textContent = st ? st.nodes.toLocaleString() : '0';
    els.placements.textContent = st ? st.placements.toLocaleString() : '0';
    els.backtracks.textContent = st ? st.backtracks.toLocaleString() : '0';
    els.row.textContent = st && st.nodes > 0 ? String(st.row + 1) : '–';
  }

  function syncControls() {
    const solving = view.mode === 'solve';
    const done = !!(view.solver && view.solver.done);
    els.undo.disabled = solving || !game.canUndo();
    els.redo.disabled = solving || !game.canRedo();
    els.hint.disabled = solving;
    els.reset.disabled = solving;
    els.play.disabled = view.playing || done;
    els.pause.disabled = !view.playing;
    els.step.disabled = view.playing || done;
    els.solverReset.disabled = !solving;
  }

  function renderWin() {
    const won = view.mode === 'play' && game.won && game.lastResult;
    els.win.hidden = !won;
    els.board.classList.toggle('solved', !!won);
    if (!won) return;
    const res = game.lastResult;
    els.winSize.textContent = game.n + ' × ' + game.n;
    els.winMoves.textContent = game.moves();
    els.winTime.textContent = fmtTime(res.time);
    els.winBest.textContent = fmtTime(res.best);
    els.winNote.textContent = res.isNewBest ? '🏆 New best time for this board size!' : 'Your best for this size is ' + fmtTime(res.best) + '.';
  }

  function renderAll() {
    renderBoard();
    renderStats();
    renderSolverStats();
    renderWin();
    syncControls();
  }

  // ---------- player actions ----------
  function onCellClick(r, c) {
    view.focus = { row: r, col: c };
    if (view.mode === 'solve') {
      setMessage('The solver is running. Press Reset in the visualizer to get your board back.');
      return;
    }
    clearFeedback();
    const res = game.toggle(r, c);
    if (!res.ok) {
      view.conflict = { row: r, col: c };
      view.attackers = res.conflicts.map(x => x.queen);
      setMessage('❌ ' + Board.describeConflict(res.conflicts));
      renderAll();
      const el = cells[r][c].el;
      el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
      setTimeout(() => {
        if (view.conflict && view.conflict.row === r && view.conflict.col === c) {
          view.conflict = null; view.attackers = []; renderBoard();
        }
      }, 1100);
      return;
    }
    if (res.action === 'remove') setMessage('Queen removed from ' + pos(r, c) + '.');
    else if (game.won) setMessage('🎉 Solution Complete!');
    else setMessage('✅ Queen placed at ' + pos(r, c) + '. ' + (game.n - game.queens.length) + ' to go.');
    renderAll();
  }

  function onUndo() {
    const a = view.mode === 'play' && game.undo();
    if (!a) return;
    clearFeedback();
    setMessage('Undid: ' + (a.type === 'place' ? 'placing' : 'removing') + ' the queen at ' + pos(a.row, a.col) + '.');
    renderAll();
  }
  function onRedo() {
    const a = view.mode === 'play' && game.redo();
    if (!a) return;
    clearFeedback();
    setMessage('Redid: ' + (a.type === 'place' ? 'placing' : 'removing') + ' the queen at ' + pos(a.row, a.col) + '.');
    renderAll();
  }
  function onHint() {
    if (view.mode !== 'play') return;
    clearFeedback();
    const h = Solver.hint(game.n, game.queens);
    if (h.status === 'ok') {
      view.hint = { row: h.row, col: h.col };
      view.focus = { row: h.row, col: h.col };
      setMessage('💡 Hint: Try Row ' + (h.row + 1) + ', Column ' + (h.col + 1) + '.');
    } else if (h.status === 'deadend') {
      setMessage('⚠️ This position cannot lead to a solution. Consider undoing your last move.');
    } else {
      setMessage('The board is already complete.');
    }
    renderAll();
  }
  function onReset() {
    if (view.mode !== 'play') return;
    game.reset();
    clearFeedback();
    setMessage('Board cleared. Place a queen on any square.');
    renderAll();
  }
  function onSize() {
    stopSolver();
    game.setSize(Number(els.size.value));
    clearFeedback();
    view.mode = 'play';
    view.solver = null;
    buildBoard();
    resetSolverPanel();
    setMessage('New ' + game.n + '×' + game.n + ' board. Place ' + game.n + ' queens so none attack each other.');
    renderAll();
  }

  // ---------- solver visualizer ----------
  const SPEEDS = [ // [delay ms, events per tick]
    [1000, 1], [700, 1], [500, 1], [350, 1], [220, 1], [120, 1], [60, 1], [30, 1], [16, 4], [16, 24]
  ];
  const setStatus = text => { els.status.textContent = text; };

  function resetSolverPanel() {
    els.result.hidden = true;
    setStatus('Press Play or Step to start.');
  }

  function enterSolveMode() {
    if (view.mode === 'solve') return;
    view.mode = 'solve';
    game.pause();
    clearFeedback();
    view.hover = null;
    view.solver = Solver.create(game.n);
    els.result.hidden = true;
    setMessage('Watching the solver on its own board. Your game is saved; press the visualizer\'s Reset to return to it.');
  }

  function applyEvent(ev) {
    const sv = view.solver;
    view.trying = view.safe = view.conflict = view.removed = null;
    view.attackers = [];
    switch (ev.type) {
      case 'try':
        view.trying = { row: ev.row, col: ev.col };
        setStatus('Trying Row ' + (ev.row + 1) + ', Column ' + (ev.col + 1));
        break;
      case 'conflict':
        view.conflict = { row: ev.row, col: ev.col };
        view.attackers = ev.conflicts.map(x => x.queen);
        setStatus('Conflict detected at ' + pos(ev.row, ev.col) + '. ' + Board.describeConflict(ev.conflicts));
        break;
      case 'safe':
        view.safe = { row: ev.row, col: ev.col };
        setStatus('Position is safe at ' + pos(ev.row, ev.col) + '.');
        break;
      case 'place':
        setStatus('Queen placed at ' + pos(ev.row, ev.col) + '. ' + (ev.row + 1 < sv.n ? 'Moving to the next row.' : 'All rows filled.'));
        break;
      case 'exhausted':
        setStatus('Row ' + (ev.row + 1) + ' has no safe column. Backtracking...');
        break;
      case 'backtrack':
        view.removed = { row: ev.row, col: ev.col };
        setStatus('Backtracking... removing the queen at ' + pos(ev.row, ev.col) + ' and trying its next column.');
        break;
      case 'solution':
        setStatus('Solution found!');
        break;
      case 'nosolution':
        setStatus('No solution exists for this board size.');
        break;
    }
  }

  function showResult() {
    const sv = view.solver;
    const t = sv.elapsedMs;
    els.resTitle.textContent = sv.found ? 'Solution Found!' : 'No Solution';
    els.resSize.textContent = sv.n + ' × ' + sv.n;
    els.resNodes.textContent = sv.stats.nodes.toLocaleString();
    els.resPlacements.textContent = sv.stats.placements.toLocaleString();
    els.resBacktracks.textContent = sv.stats.backtracks.toLocaleString();
    els.resTime.textContent = t < 1 ? '< 1 ms' : (t < 10 ? t.toFixed(1) : Math.round(t).toLocaleString()) + ' ms';
    els.result.hidden = false;
    els.board.classList.add('solved');
  }

  function advance(count) {
    for (let i = 0; i < count && !view.solver.done; i++) applyEvent(view.solver.step());
    renderBoard();
    renderSolverStats();
    if (view.solver.done) {
      view.playing = false;
      showResult();
    }
    syncControls();
  }

  function tick() {
    view.timeout = null;
    if (!view.playing) return;
    const [delay, batch] = SPEEDS[Number(els.speed.value) - 1];
    advance(batch);
    if (view.playing) view.timeout = setTimeout(tick, delay);
  }

  function onPlay() {
    enterSolveMode();
    if (view.solver.done) return;
    view.playing = true;
    syncControls();
    tick();
  }
  function onPause() {
    stopSolver();
    setStatus('Paused. ' + els.status.textContent);
    syncControls();
  }
  function onStep() {
    enterSolveMode();
    advance(1);
  }
  function stopSolver() {
    view.playing = false;
    if (view.timeout) { clearTimeout(view.timeout); view.timeout = null; }
  }
  function onSolverReset() {
    stopSolver();
    view.mode = 'play';
    view.solver = null;
    clearFeedback();
    game.resume();
    resetSolverPanel();
    setMessage(game.queens.length ? 'Welcome back. Your board is just as you left it.' : 'Place a queen on any square.');
    renderAll();
  }

  // ---------- theme ----------
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const dark = theme === 'dark';
    els.themeIcon.textContent = dark ? '☀️' : '🌙';
    els.themeLabel.textContent = dark ? 'Light' : 'Dark';
    els.themeBtn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
  }

  // ---------- events ----------
  els.board.addEventListener('click', e => {
    const btn = e.target.closest('.cell');
    if (btn) onCellClick(Number(btn.dataset.row), Number(btn.dataset.col));
  });
  const hover = e => {
    const btn = e.target.closest && e.target.closest('.cell');
    view.hover = btn ? { row: Number(btn.dataset.row), col: Number(btn.dataset.col) } : null;
    if (view.mode === 'play') renderBoard();
  };
  els.board.addEventListener('mouseover', hover);
  els.board.addEventListener('focusin', hover);
  els.board.addEventListener('mouseleave', () => { view.hover = null; if (view.mode === 'play') renderBoard(); });

  els.board.addEventListener('keydown', e => {
    const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
    const btn = e.target.closest('.cell');
    if (!btn) return;
    let r = Number(btn.dataset.row), c = Number(btn.dataset.col);
    if (d) { r += d[0]; c += d[1]; }
    else if (e.key === 'Home') c = 0;
    else if (e.key === 'End') c = game.n - 1;
    else return;
    e.preventDefault();
    r = Math.max(0, Math.min(game.n - 1, r));
    c = Math.max(0, Math.min(game.n - 1, c));
    view.focus = { row: r, col: c };
    renderBoard();
    cells[r][c].el.focus();
  });

  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); onUndo(); }
    else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); onRedo(); }
  });

  els.undo.addEventListener('click', onUndo);
  els.redo.addEventListener('click', onRedo);
  els.hint.addEventListener('click', onHint);
  els.reset.addEventListener('click', onReset);
  els.size.addEventListener('change', onSize);
  els.attackToggle.addEventListener('change', renderBoard);
  els.play.addEventListener('click', onPlay);
  els.pause.addEventListener('click', onPause);
  els.step.addEventListener('click', onStep);
  els.solverReset.addEventListener('click', onSolverReset);
  els.speed.addEventListener('input', () => {
    els.speedOut.textContent = els.speed.value;
    els.speed.setAttribute('aria-valuetext', 'Speed ' + els.speed.value + ' of 10');
  });
  els.themeBtn.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { storage && storage.setItem('nqueen.theme', next); } catch (e) { /* ignore */ }
  });

  // ---------- init ----------
  for (let n = Board.MIN_N; n <= Board.MAX_N; n++) {
    const opt = document.createElement('option');
    opt.value = n;
    opt.textContent = n + ' × ' + n;
    if (n === game.n) opt.selected = true;
    els.size.appendChild(opt);
  }
  applyTheme(document.documentElement.getAttribute('data-theme') || 'light');
  buildBoard();
  renderAll();
  setInterval(() => { if (view.mode === 'play') els.time.textContent = fmtTime(game.elapsed()); }, 250);
})();
