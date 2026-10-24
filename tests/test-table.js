// 盤のゲーム（arcade-table.js: 五目ならべ・ナンプレ）のテスト
"use strict";
var H = require("./harness");
var ok = H.ok;

function patch(src, file) {
  if (file !== "arcade-table.js") { return src; }
  var a = "var lv = sudokuLevel(cfg && cfg.level), data = sudokuMake(lv.id);";
  var b = "var board = gomokuNewBoard(), turn = 1,";
  var c = "var st = solDeal(), undoStack = [],";
  if (src.indexOf(a) < 0 || src.indexOf(b) < 0 || src.indexOf(c) < 0) { throw new Error("table patch target missing"); }
  return src.split(a).join(a + " window.__sd = data;").split(b).join("var board = window.__gb = gomokuNewBoard(), turn = 1,")
    .split(c).join("var st = solDeal(), undoStack = []; window.__solGet = function () { return st; }; window.__solSet = function (s) { st = s; }; var");
}

module.exports = function () {
  H.suite("table");
  var env = H.load({ patch: patch });
  var T = env.window.UGTable, N = T.GN;
  ok(!!T, "UGTable test API exists");
  function put(b, cells, c) { cells.forEach(function (p) { b[p[1] * N + p[0]] = c; }); return b; }

  // --- 五目ならべ: 勝ち判定 ---
  var b = put(T.gomokuNewBoard(), [[3, 7], [4, 7], [5, 7], [6, 7], [7, 7]], 1);
  ok(T.gomokuWinLine(b, 5, 7) && T.gomokuWinLine(b, 5, 7).length === 5, "five in a row (horizontal) wins");
  ok(!!T.gomokuWinLine(put(T.gomokuNewBoard(), [[2, 2], [2, 3], [2, 4], [2, 5], [2, 6]], 2), 2, 4), "vertical five wins");
  ok(!!T.gomokuWinLine(put(T.gomokuNewBoard(), [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5]], 1), 3, 3), "diagonal five wins");
  ok(!!T.gomokuWinLine(put(T.gomokuNewBoard(), [[10, 2], [9, 3], [8, 4], [7, 5], [6, 6]], 1), 8, 4), "anti-diagonal five wins");
  ok(!!T.gomokuWinLine(put(T.gomokuNewBoard(), [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]], 1), 2, 0), "six in a row also wins (free rule)");
  ok(!T.gomokuWinLine(put(T.gomokuNewBoard(), [[0, 0], [1, 0], [2, 0], [3, 0]], 1), 2, 0), "four is not a win");

  // --- CPU ---
  b = put(put(T.gomokuNewBoard(), [[3, 5], [4, 5], [5, 5], [6, 5]], 2), [[3, 9], [4, 9], [5, 9], [6, 9]], 1);
  var mv = T.gomokuBestMove(b, 2);
  ok((mv.x === 2 || mv.x === 7) && mv.y === 5, "CPU takes its own winning move first", mv);
  b = put(put(T.gomokuNewBoard(), [[2, 4], [3, 4], [4, 4], [5, 4]], 1), [[1, 4], [9, 9]], 2);
  mv = T.gomokuBestMove(b, 2);
  ok(mv.x === 6 && mv.y === 4, "CPU blocks your four", mv);
  b = put(put(T.gomokuNewBoard(), [[5, 7], [6, 7], [7, 7]], 1), [[7, 8]], 2);
  mv = T.gomokuBestMove(b, 2);
  ok(mv.y === 7 && (mv.x === 4 || mv.x === 8), "CPU closes your open three", mv);
  var endedAll = true;
  for (var game = 0; game < 5; game++) {
    var bb = T.gomokuNewBoard(), turn = 1, done = false;
    for (var k = 0; k < N * N && !done; k++) {
      var m2 = T.gomokuBestMove(bb, turn);
      bb[m2.y * N + m2.x] = turn;
      if (T.gomokuWinLine(bb, m2.x, m2.y)) { done = true; }
      turn = 3 - turn;
    }
    if (!done && bb.indexOf(0) >= 0) { endedAll = false; }
  }
  ok(endedAll, "CPU vs CPU games always finish");
  // 実際に遊ぶ（あなた＝同じAIでタップ）
  var r = env.run("gomoku", {}, 20000, function (f, e) {
    if (f % 30 !== 0) { return; }
    var g = e.window.__gb, m3 = T.gomokuBestMove(g, 1);
    e.tap((240 - 15 * 15) / 2 + m3.x * 15 + 7, 36 + m3.y * 15 + 7);
  });
  ok(r.ended !== null && ["WIN!", "LOSE", "DRAW"].indexOf(env.lastTitle()) >= 0, "gomoku: a tapped game finishes with a result", { ended: r.ended, title: env.lastTitle() });

  // --- ナンプレ ---
  var fullOk = true;
  for (var i = 0; i < 5; i++) { if (!T.sudokuValid(T.sudokuFull())) { fullOk = false; } }
  ok(fullOk, "generated full grids are valid sudoku solutions");
  T.sudokuLevels.forEach(function (lv) {
    var t0 = Date.now(), p = T.sudokuMake(lv.id), ms = Date.now() - t0;
    var clues = p.puzzle.filter(function (v) { return v; }).length;
    var consistent = p.puzzle.every(function (v, j) { return !v || v === p.solution[j]; });
    ok(clues === p.clues && clues >= lv.clues && clues <= lv.clues + 8, lv.id + ": clue count near target", clues);
    ok(T.sudokuSolve(p.puzzle.slice(), 2, false) === 1 && consistent && T.sudokuValid(p.solution), lv.id + ": exactly one solution, matching givens", ms + "ms");
  });
  // 正解を全部入れると CLEAR!
  r = env.run("sudoku", { config: { level: "easy" } }, 3000, function (f, e) {
    var d = e.window.__sd;
    if (!d || f < 2) { return; }
    for (var j = 0; j < 81; j++) {
      if (d.puzzle[j] === 0 && !d.__done) {
        d.puzzle[j] = -1;
        e.tap((240 - 225) / 2 + (j % 9) * 25 + 12, 26 + Math.floor(j / 9) * 25 + 12);
        e.key("keydown", String(d.solution[j]));
        return;
      }
    }
  });
  ok(r.ended !== null && env.lastTitle() === "CLEAR!" && r.ended >= 1000, "sudoku: entering the solution clears", { ended: r.ended, title: env.lastTitle() });
  // 3回まちがえると GAME OVER
  var wrongs = 0;
  r = env.run("sudoku", { config: { level: "normal" } }, 600, function (f, e) {
    var d = e.window.__sd;
    if (!d || f < 2 || f % 5 !== 0 || wrongs >= 3) { return; }
    for (var j = 0; j < 81; j++) {
      if (d.puzzle[j] === 0) {
        e.tap((240 - 225) / 2 + (j % 9) * 25 + 12, 26 + Math.floor(j / 9) * 25 + 12);
        e.key("keydown", String(d.solution[j] % 9 + 1));
        wrongs++;
        return;
      }
    }
  });
  ok(r.ended !== null && env.lastTitle() === "GAME OVER", "sudoku: three mistakes end the game", { ended: r.ended, title: env.lastTitle() });
  // --- ソリティア ---
  var d0 = T.solDeal(), all = [];
  d0.tab.forEach(function (col, ci) { col.forEach(function (cd, k) { all.push(cd); if (cd.up !== (k === ci)) { all.bad = true; } }); });
  all = all.concat(d0.stock);
  var keys = {}; all.forEach(function (cd) { keys[cd.s + ":" + cd.r] = 1; });
  ok(!all.bad && d0.tab.map(function (col) { return col.length; }).join("") === "1234567" && d0.stock.length === 24 && Object.keys(keys).length === 52, "solitaire deal: 1-7 columns, top face-up, 24 in stock, 52 unique cards");
  ok(T.solCanFound({ s: 1, r: 1 }, []) && !T.solCanFound({ s: 1, r: 2 }, []) && T.solCanFound({ s: 1, r: 2 }, [{ s: 1, r: 1 }]) && !T.solCanFound({ s: 2, r: 2 }, [{ s: 1, r: 1 }]), "foundation rules (A first, same suit up)");
  ok(T.solCanTab({ s: 1, r: 6 }, [{ s: 0, r: 7, up: true }]) && !T.solCanTab({ s: 2, r: 6 }, [{ s: 1, r: 7, up: true }]) && T.solCanTab({ s: 0, r: 13 }, []) && !T.solCanTab({ s: 0, r: 12 }, []), "tableau rules (alternate colors down, K on empty)");
  function invariants(s) {
    var cards = [], k2 = {}, okv = true;
    s.tab.forEach(function (col) {
      col.forEach(function (cd, i) {
        cards.push(cd);
        if (i > 0 && col[i - 1].up && cd.up && !((col[i - 1].s === 1 || col[i - 1].s === 2) !== (cd.s === 1 || cd.s === 2) && cd.r === col[i - 1].r - 1)) { okv = false; }
        if (i > 0 && col[i - 1].up && !cd.up) { okv = false; } // 表の上に裏は来ない
      });
    });
    s.found.forEach(function (p) { p.forEach(function (cd, i) { cards.push(cd); if (cd.r !== i + 1 || cd.s !== p[0].s) { okv = false; } }); });
    cards = cards.concat(s.stock, s.waste);
    cards.forEach(function (cd) { k2[cd.s + ":" + cd.r] = 1; });
    return okv && cards.length === 52 && Object.keys(k2).length === 52;
  }
  var wins = 0, stuck = 0, broken = 0, hung = 0;
  for (var gi = 0; gi < 30; gi++) {
    var s = T.solDeal(), steps = 0, finished = false;
    while (steps++ < 5000) {
      if (!invariants(s)) { broken++; break; }
      if (T.solFoundCount(s) === 52) { wins++; finished = true; break; }
      var hnt = T.solHint(s);
      if (!hnt) { stuck++; finished = true; break; }
      if (hnt === "draw") { T.solDraw(s); } else { T.solApply(s, hnt.src, hnt.dst); }
    }
    if (!finished && !broken) { hung++; }
  }
  ok(broken === 0 && hung === 0 && wins + stuck === 30, "solitaire bot: 30 deals end in clear or stuck, rules always hold", { wins: wins, stuck: stuck, broken: broken, hung: hung });
  ok(wins >= 1, "solitaire is winnable by following hints (at least 1 of 30)", wins);
  // 画面の操作: 山札→戻す、ほぼ完成でCLEAR、タップでヒントどおりに進める
  var CW = 30, GAP = 3, OX = (240 - (7 * CW + 6 * GAP)) / 2, TOPY = 18, TABY = 68;
  function tabYs(col) {
    var down = 5, up = 13, ys = [], y = TABY, i, need = 0;
    for (i = 0; i < col.length - 1; i++) { need += col[i].up ? up : down; }
    if (TABY + need + 42 > 304 && need > 0) { var kk = (304 - 42 - TABY) / need; down *= kk; up *= kk; }
    for (i = 0; i < col.length; i++) { ys.push(y); y += col[i].up ? up : down; }
    return ys;
  }
  function srcPoint(s2, src) {
    if (src.kind === "waste") { return [OX + 1 * (CW + GAP) + 15, TOPY + 20]; }
    if (src.kind === "found") { return [OX + (3 + src.col) * (CW + GAP) + 15, TOPY + 20]; }
    var ys = tabYs(s2.tab[src.col]);
    return [OX + src.col * (CW + GAP) + 15, ys[src.idx] + 4];
  }
  var undoOk = null;
  env.run("solitaire", {}, 40, function (f, e) {
    var g = e.window.__solGet();
    if (f === 2) { undoOk = g.stock.length; e.key("keydown", " "); }
    if (f === 4) { undoOk = (e.window.__solGet().stock.length === undoOk - 1) ? undoOk : -1; e.key("keydown", "u"); }
    if (f === 6) { undoOk = e.window.__solGet().stock.length === undoOk && e.window.__solGet().waste.length === 0; }
  });
  ok(undoOk === true, "solitaire: draw then undo restores the stock", undoOk);
  r = env.run("solitaire", {}, 60, function (f, e) {
    if (f !== 2) { return; }
    var full = { tab: [[{ s: 0, r: 13, up: true }], [], [], [], [], [], []], stock: [], waste: [], found: [[], [], [], []] };
    for (var su = 0; su < 4; su++) { for (var rk = 1; rk <= (su === 0 ? 12 : 13); rk++) { full.found[su].push({ s: su, r: rk, up: true }); } }
    e.window.__solSet(full);
    e.tap(OX + 15, TABY + 10);
  });
  ok(r.ended !== null && env.lastTitle() === "CLEAR!", "solitaire: last king to foundation clears", { ended: r.ended, title: env.lastTitle() });
  var tapEnded = 0;
  for (var tg = 0; tg < 6 && !tapEnded; tg++) {
    r = env.run("solitaire", {}, 8000, function (f, e) {
      if (f % 3 !== 0) { return; }
      var g = e.window.__solGet(), hh = T.solHint(g);
      if (!hh) { return; }
      if (hh === "draw") { e.key("keydown", " "); return; }
      var p = srcPoint(g, hh.src);
      e.tap(p[0], p[1]);
    });
    if (r.ended !== null && (env.lastTitle() === "CLEAR!" || env.lastTitle() === "GAME OVER")) { tapEnded++; }
  }
  ok(tapEnded > 0, "solitaire: playing by taps reaches clear or stuck", env.lastTitle());

  // 設定画面
  var root = H.makeEl("div");
  env.window.UGArcade.start("sudoku", root, { onEnd: function () {}, onExit: function () {} });
  ok(root.innerHTML.indexOf('data-lv="easy"') > 0 && root.innerHTML.indexOf('data-lv="hard"') > 0, "sudoku setup offers three difficulties");
  env.window.UGArcade.stop();
};
