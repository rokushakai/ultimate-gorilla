// 盤のゲーム（arcade-table.js: 五目ならべ・ナンプレ）のテスト
"use strict";
var H = require("./harness");
var ok = H.ok;

function patch(src, file) {
  if (file !== "arcade-table.js") { return src; }
  var a = "var lv = sudokuLevel(cfg && cfg.level), data = sudokuMake(lv.id);";
  var b = "var board = gomokuNewBoard(), turn = 1,";
  if (src.indexOf(a) < 0 || src.indexOf(b) < 0) { throw new Error("table patch target missing"); }
  return src.split(a).join(a + " window.__sd = data;").split(b).join("var board = window.__gb = gomokuNewBoard(), turn = 1,");
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
  // 設定画面
  var root = H.makeEl("div");
  env.window.UGArcade.start("sudoku", root, { onEnd: function () {}, onExit: function () {} });
  ok(root.innerHTML.indexOf('data-lv="easy"') > 0 && root.innerHTML.indexOf('data-lv="hard"') > 0, "sudoku setup offers three difficulties");
  env.window.UGArcade.stop();
};
