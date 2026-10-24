// =========================================================
// 究極ゴリラ ゲームセンター: 盤・カードのゲーム（§163〜）
//   ⚪ ゴリラ五目ならべ / 🔢 ゴリラナンプレ
// arcade.js の後に読み込む。土台の機能は window.UGArcade.internal から使う。
// =========================================================
(function () {
  "use strict";

  var I = window.UGArcade && window.UGArcade.internal;
  if (!I) { return; }
  var W = I.W, H = I.H, randInt = I.randInt, hudText = I.hudText;

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = randInt(0, i), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  // ---------------------------------------------------------
  // ⚪ ゴリラ五目ならべ
  // ---------------------------------------------------------
  var GN = 15, GOMOKU_DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

  function gomokuNewBoard() {
    var b = [];
    for (var i = 0; i < GN * GN; i++) { b.push(0); }
    return b;
  }
  function gomokuAt(b, x, y) { return (x >= 0 && x < GN && y >= 0 && y < GN) ? b[y * GN + x] : -1; }
  // (x,y) の石を通る5つ以上の並びがあればそのマス一覧、なければ null
  function gomokuWinLine(b, x, y) {
    var c = gomokuAt(b, x, y);
    if (c !== 1 && c !== 2) { return null; }
    for (var d = 0; d < 4; d++) {
      var dx = GOMOKU_DIRS[d][0], dy = GOMOKU_DIRS[d][1], cells = [[x, y]], k;
      for (k = 1; gomokuAt(b, x + dx * k, y + dy * k) === c; k++) { cells.push([x + dx * k, y + dy * k]); }
      for (k = 1; gomokuAt(b, x - dx * k, y - dy * k) === c; k++) { cells.push([x - dx * k, y - dy * k]); }
      if (cells.length >= 5) { return cells; }
    }
    return null;
  }
  function gomokuPattern(n, open) {
    if (n >= 5) { return 100000; }
    if (open === 0) { return 0; }
    if (n === 4) { return open === 2 ? 10000 : 1000; }
    if (n === 3) { return open === 2 ? 1000 : 100; }
    if (n === 2) { return open === 2 ? 100 : 10; }
    return open === 2 ? 10 : 1;
  }
  // 空きマス (x,y) に色 c を置いたときの強さ
  function gomokuEval(b, x, y, c) {
    var total = 0;
    for (var d = 0; d < 4; d++) {
      var dx = GOMOKU_DIRS[d][0], dy = GOMOKU_DIRS[d][1], n = 1, open = 0, k;
      for (k = 1; gomokuAt(b, x + dx * k, y + dy * k) === c; k++) { n++; }
      if (gomokuAt(b, x + dx * k, y + dy * k) === 0) { open++; }
      for (k = 1; gomokuAt(b, x - dx * k, y - dy * k) === c; k++) { n++; }
      if (gomokuAt(b, x - dx * k, y - dy * k) === 0) { open++; }
      total += gomokuPattern(n, open);
    }
    return total;
  }
  // me の番の一手 { x, y }（勝てる手 → 相手の五を止める → 攻め×1.1＋守り）
  function gomokuBestMove(b, me) {
    var opp = 3 - me, best = null, bestScore = -1, any = false, x, y;
    for (y = 0; y < GN; y++) {
      for (x = 0; x < GN; x++) {
        if (b[y * GN + x] !== 0) { any = true; continue; }
        var near = false;
        for (var yy = y - 2; yy <= y + 2 && !near; yy++) { for (var xx = x - 2; xx <= x + 2; xx++) { var v = gomokuAt(b, xx, yy); if (v === 1 || v === 2) { near = true; break; } } }
        if (!near) { continue; }
        var s = gomokuEval(b, x, y, me) * 1.1 + gomokuEval(b, x, y, opp) + Math.random() * 0.5;
        if (s > bestScore) { bestScore = s; best = { x: x, y: y }; }
      }
    }
    if (!best && !any) { return { x: 7, y: 7 }; }
    if (!best) {
      for (y = 0; y < GN; y++) { for (x = 0; x < GN; x++) { if (b[y * GN + x] === 0) { return { x: x, y: y }; } } }
    }
    return best;
  }

  I.register({
    id: "gomoku",
    after: "reversi",
    cat: "puzzle",
    name: "ゴリラ五目ならべ",
    icon: "&#x26AA;",
    desc: "CPUゴリラと五目ならべ。たて・よこ・ななめに5つ並べたら勝ち",
    help: "置きたいマスをタップ / 矢印でカーソル移動・Space/Enterで置く / P一時停止",
    controls: [],
    keys: { "ArrowLeft": "left", "ArrowRight": "right", "ArrowUp": "up", "ArrowDown": "down", " ": "place", "Enter": "place" },
    create: function (api) {
      var CELL = 15, OX = (W - GN * CELL) / 2, OY = 36;
      var board = gomokuNewBoard(), turn = 1, cur = { x: 7, y: 7 }, last = null, winLine = null, ended = false, cpuT = 0, myMoves = 0, total = 0;

      function finish(winner) {
        ended = true;
        if (winner === 1) { api.addScore(1000 + Math.max(0, 120 - myMoves)); api.gameOver("WIN!"); }
        else if (winner === 2) { api.addScore(50 + myMoves * 2); api.gameOver("LOSE"); }
        else { api.addScore(300); api.gameOver("DRAW"); }
      }
      function place(x, y, c) {
        if (ended || gomokuAt(board, x, y) !== 0) { return false; }
        board[y * GN + x] = c;
        last = { x: x, y: y };
        total++;
        if (c === 1) { myMoves++; }
        winLine = gomokuWinLine(board, x, y);
        if (winLine) { finish(c); return true; }
        if (total >= GN * GN) { finish(0); return true; }
        turn = 3 - c;
        if (turn === 2) { cpuT = 24; }
        return true;
      }
      function playerPlace(x, y) { if (turn === 1) { place(x, y, 1); } }

      return {
        input: function (action, down) {
          if (!down || ended) { return; }
          if (action === "left") { cur.x = Math.max(0, cur.x - 1); }
          else if (action === "right") { cur.x = Math.min(GN - 1, cur.x + 1); }
          else if (action === "up") { cur.y = Math.max(0, cur.y - 1); }
          else if (action === "down") { cur.y = Math.min(GN - 1, cur.y + 1); }
          else if (action === "place") { playerPlace(cur.x, cur.y); }
        },
        pointer: function (type, px, py) {
          if (type !== "down" || ended) { return; }
          var x = Math.floor((px - OX) / CELL), y = Math.floor((py - OY) / CELL);
          if (x < 0 || x >= GN || y < 0 || y >= GN) { return; }
          cur = { x: x, y: y };
          playerPlace(x, y);
        },
        step: function () {
          if (ended || turn !== 2) { return; }
          if (cpuT > 0) { cpuT--; return; }
          var mv = gomokuBestMove(board, 2);
          place(mv.x, mv.y, 2);
        },
        draw: function (ctx) {
          var i, x, y;
          ctx.fillStyle = "#d9a55b";
          ctx.fillRect(OX, OY, GN * CELL, GN * CELL);
          ctx.strokeStyle = "#7a5230";
          ctx.lineWidth = 1;
          for (i = 0; i < GN; i++) {
            ctx.beginPath(); ctx.moveTo(OX + CELL / 2, OY + i * CELL + CELL / 2 + 0.5); ctx.lineTo(OX + GN * CELL - CELL / 2, OY + i * CELL + CELL / 2 + 0.5); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(OX + i * CELL + CELL / 2 + 0.5, OY + CELL / 2); ctx.lineTo(OX + i * CELL + CELL / 2 + 0.5, OY + GN * CELL - CELL / 2); ctx.stroke();
          }
          for (y = 0; y < GN; y++) {
            for (x = 0; x < GN; x++) {
              var v = board[y * GN + x];
              if (!v) { continue; }
              ctx.fillStyle = v === 1 ? "#111111" : "#f5f6fa";
              ctx.beginPath(); ctx.arc(OX + x * CELL + CELL / 2, OY + y * CELL + CELL / 2, 6.2, 0, Math.PI * 2); ctx.fill();
            }
          }
          if (winLine) {
            ctx.strokeStyle = "#ff7675";
            ctx.lineWidth = 2;
            for (i = 0; i < winLine.length; i++) {
              ctx.beginPath(); ctx.arc(OX + winLine[i][0] * CELL + CELL / 2, OY + winLine[i][1] * CELL + CELL / 2, 7, 0, Math.PI * 2); ctx.stroke();
            }
          } else if (last) {
            ctx.fillStyle = "#ff7675";
            ctx.beginPath(); ctx.arc(OX + last.x * CELL + CELL / 2, OY + last.y * CELL + CELL / 2, 2, 0, Math.PI * 2); ctx.fill();
          }
          if (!ended) {
            ctx.strokeStyle = "rgba(9,132,227,0.8)";
            ctx.lineWidth = 1.5;
            ctx.strokeRect(OX + cur.x * CELL + 1, OY + cur.y * CELL + 1, CELL - 2, CELL - 2);
          }
          hudText(ctx, "⚫ あなた  vs  ⚪ CPU🦍", W / 2, 22, "center");
          hudText(ctx, ended ? "おしまい" : (turn === 1 ? "あなたの番です（" + myMoves + "手）" : "CPU考え中…"), W / 2, 285, "center");
        }
      };
    }
  });

  // ---------------------------------------------------------
  // 🔢 ゴリラナンプレ
  // ---------------------------------------------------------
  var SUDOKU_LEVELS = [
    { id: "easy", name: "やさしい", clues: 40, base: 1000 },
    { id: "normal", name: "ふつう", clues: 32, base: 2000 },
    { id: "hard", name: "むずかしい", clues: 26, base: 3000 }
  ];
  function sudokuLevel(id) {
    for (var i = 0; i < SUDOKU_LEVELS.length; i++) { if (SUDOKU_LEVELS[i].id === id) { return SUDOKU_LEVELS[i]; } }
    return SUDOKU_LEVELS[0];
  }
  function sudokuCand(g, i) {
    var r = Math.floor(i / 9), c = i % 9, used = 0, br = r - r % 3, bc = c - c % 3, k;
    for (k = 0; k < 9; k++) { used |= (1 << g[r * 9 + k]) | (1 << g[k * 9 + c]) | (1 << g[(br + Math.floor(k / 3)) * 9 + bc + k % 3]); }
    return ~used & 0x3FE;
  }
  function sudokuBits(m) { var n = 0; while (m) { n += m & 1; m >>= 1; } return n; }
  // 解の数を limit まで数える。randomFill なら最初の解で g を埋めて止める
  function sudokuSolve(g, limit, randomFill) {
    var count = 0;
    function rec() {
      var best = -1, bm = 0, bc = 10;
      for (var i = 0; i < 81; i++) {
        if (g[i] !== 0) { continue; }
        var m = sudokuCand(g, i), n = sudokuBits(m);
        if (n === 0) { return false; }
        if (n < bc) { bc = n; best = i; bm = m; if (n === 1) { break; } }
      }
      if (best < 0) { count++; return count >= limit; }
      var ds = [];
      for (var d = 1; d <= 9; d++) { if (bm & (1 << d)) { ds.push(d); } }
      if (randomFill) { shuffle(ds); }
      for (var j = 0; j < ds.length; j++) {
        g[best] = ds[j];
        if (rec()) { if (!randomFill) { g[best] = 0; } return true; }
        g[best] = 0;
      }
      return false;
    }
    rec();
    return count;
  }
  function sudokuFull() {
    var g = [];
    for (var i = 0; i < 81; i++) { g.push(0); }
    sudokuSolve(g, 1, true);
    return g;
  }
  // { puzzle, solution, clues }（答えが1つだけ）
  function sudokuMake(levelId) {
    var lv = sudokuLevel(levelId), sol = sudokuFull(), puz = sol.slice(), clues = 81, order = [];
    for (var i = 0; i < 81; i++) { order.push(i); }
    shuffle(order);
    for (var k = 0; k < 81 && clues > lv.clues; k++) {
      var p = order[k], v = puz[p];
      puz[p] = 0;
      if (sudokuSolve(puz.slice(), 2, false) !== 1) { puz[p] = v; } else { clues--; }
    }
    return { puzzle: puz, solution: sol, clues: clues };
  }
  function sudokuValid(g) {
    for (var u = 0; u < 9; u++) {
      var row = {}, col = {}, box = {};
      for (var k = 0; k < 9; k++) {
        var a = g[u * 9 + k], b = g[k * 9 + u], c = g[(Math.floor(u / 3) * 3 + Math.floor(k / 3)) * 9 + (u % 3) * 3 + k % 3];
        if (!a || !b || !c || row[a] || col[b] || box[c]) { return false; }
        row[a] = col[b] = box[c] = true;
      }
    }
    return true;
  }

  function sudokuSetup(root, ctl) {
    var html = '<div class="melody-setup"><h3 style="margin:0 0 4px;">&#x1F522; ゴリラナンプレ</h3>' +
      '<p class="small" style="color:#adb5bd;margin:0 0 8px;">たて・よこ・3×3のブロックに1〜9が1つずつ入るように埋めよう。問題は毎回自動で作られ、答えは必ず1つだけ。ミスは3回まで。</p>';
    for (var i = 0; i < SUDOKU_LEVELS.length; i++) {
      html += '<button class="modal-btn" data-lv="' + SUDOKU_LEVELS[i].id + '" style="width:100%;">' + SUDOKU_LEVELS[i].name + '（ヒント約' + SUDOKU_LEVELS[i].clues + '）</button>';
    }
    html += '<button class="modal-btn" data-lv="back" style="width:100%;margin-top:14px;">&#x1F579;&#xFE0F; メニューへ</button></div>';
    root.innerHTML = html;
    var btns = root.querySelectorAll("button[data-lv]");
    for (i = 0; i < btns.length; i++) {
      btns[i].onclick = function (ev) {
        var v = ev.currentTarget.getAttribute("data-lv");
        if (v === "back") { ctl.back(); } else { ctl.done({ level: v }); }
      };
    }
  }

  I.register({
    id: "sudoku",
    after: "gomoku",
    cat: "puzzle",
    name: "ゴリラナンプレ",
    icon: "&#x1F522;",
    desc: "数独。たて・よこ・ブロックに1〜9を入れよう（3つの難しさ）",
    help: "マスをタップ→下の数字で入力 / 矢印で移動・1〜9で入力・0/Backspaceで消す / P一時停止",
    controls: [],
    keys: { "ArrowLeft": "left", "ArrowRight": "right", "ArrowUp": "up", "ArrowDown": "down",
      "1": "n1", "2": "n2", "3": "n3", "4": "n4", "5": "n5", "6": "n6", "7": "n7", "8": "n8", "9": "n9", "0": "erase", "Backspace": "erase", "Delete": "erase" },
    setup: sudokuSetup,
    setupLabel: "難しさを変える",
    create: function (api, cfg) {
      var lv = sudokuLevel(cfg && cfg.level), data = sudokuMake(lv.id);
      var CELL = 25, OX = (W - 9 * CELL) / 2, OY = 26, PY = 258, PBW = 44, PBH = 22;
      var grid = data.puzzle.slice(), given = [], wrong = {}, sel = -1, mistakes = 0, frames = 0, ended = false, i;
      for (i = 0; i < 81; i++) { given.push(grid[i] !== 0); }

      function countOf(d) { var n = 0; for (var k = 0; k < 81; k++) { if (grid[k] === d) { n++; } } return n; }
      function enter(d) {
        if (ended || sel < 0 || grid[sel] !== 0) { return; }
        if (d === data.solution[sel]) {
          grid[sel] = d;
          delete wrong[sel];
          for (var k = 0; k < 81; k++) { if (grid[k] === 0) { return; } }
          ended = true;
          api.addScore(Math.max(100, lv.base + Math.max(0, 1500 - Math.floor(frames / 60) * 2) - mistakes * 200));
          api.gameOver("CLEAR!");
        } else {
          wrong[sel] = d;
          mistakes++;
          if (mistakes >= 3) { ended = true; api.gameOver(); }
        }
      }
      function move(dx, dy) {
        if (sel < 0) { sel = 40; return; }
        var r = Math.floor(sel / 9), c = sel % 9;
        r = (r + dy + 9) % 9; c = (c + dx + 9) % 9;
        sel = r * 9 + c;
      }
      function padAt(px, py) {
        if (py < PY || py > PY + PBH * 2 + 4) { return null; }
        var row = py < PY + PBH + 2 ? 0 : 1, col = Math.floor((px - (W - 5 * PBW - 8) / 2) / (PBW + 2));
        if (col < 0 || col > 4) { return null; }
        var idx = row * 5 + col;
        return idx < 9 ? idx + 1 : "erase";
      }

      return {
        input: function (action, down) {
          if (!down || ended) { return; }
          if (action === "left") { move(-1, 0); } else if (action === "right") { move(1, 0); }
          else if (action === "up") { move(0, -1); } else if (action === "down") { move(0, 1); }
          else if (action === "erase") { if (sel >= 0) { delete wrong[sel]; } }
          else if (action.charAt(0) === "n") { enter(parseInt(action.substring(1), 10)); }
        },
        pointer: function (type, px, py) {
          if (type !== "down" || ended) { return; }
          var cx = Math.floor((px - OX) / CELL), cy = Math.floor((py - OY) / CELL);
          if (cx >= 0 && cx < 9 && cy >= 0 && cy < 9) { sel = cy * 9 + cx; return; }
          var p = padAt(px, py);
          if (p === "erase") { if (sel >= 0) { delete wrong[sel]; } }
          else if (p) { enter(p); }
        },
        step: function () { if (!ended) { frames++; } },
        draw: function (ctx) {
          var k, r, c;
          var selV = sel >= 0 ? (grid[sel] || wrong[sel] || 0) : 0;
          for (k = 0; k < 81; k++) {
            r = Math.floor(k / 9); c = k % 9;
            var x = OX + c * CELL, y = OY + r * CELL, inLine = false;
            if (sel >= 0) {
              var sr = Math.floor(sel / 9), sc = sel % 9;
              inLine = r === sr || c === sc || (Math.floor(r / 3) === Math.floor(sr / 3) && Math.floor(c / 3) === Math.floor(sc / 3));
            }
            ctx.fillStyle = k === sel ? "#74b9ff" : (selV && grid[k] === selV ? "#c8e6ff" : (inLine ? "#e8f1fb" : "#ffffff"));
            ctx.fillRect(x, y, CELL, CELL);
            var v = grid[k] || wrong[k];
            if (v) {
              ctx.fillStyle = wrong[k] && !grid[k] ? "#d63031" : (given[k] ? "#2d3436" : "#0984e3");
              ctx.font = (given[k] ? "bold " : "") + "15px sans-serif";
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText(String(v), x + CELL / 2, y + CELL / 2 + 1);
            }
          }
          for (k = 0; k <= 9; k++) {
            ctx.strokeStyle = k % 3 === 0 ? "#2d3436" : "#b2bec3";
            ctx.lineWidth = k % 3 === 0 ? 2 : 1;
            ctx.beginPath(); ctx.moveTo(OX + k * CELL, OY); ctx.lineTo(OX + k * CELL, OY + 9 * CELL); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(OX, OY + k * CELL); ctx.lineTo(OX + 9 * CELL, OY + k * CELL); ctx.stroke();
          }
          // 数字パッド
          var px0 = (W - 5 * PBW - 8) / 2;
          for (k = 0; k < 10; k++) {
            var bx = px0 + (k % 5) * (PBW + 2), by = PY + Math.floor(k / 5) * (PBH + 2), full = k < 9 && countOf(k + 1) >= 9;
            ctx.fillStyle = full ? "#3d3d5c" : "#1b263b";
            ctx.fillRect(bx, by, PBW, PBH);
            ctx.strokeStyle = "#74b9ff";
            ctx.lineWidth = 1;
            ctx.strokeRect(bx + 0.5, by + 0.5, PBW - 1, PBH - 1);
            ctx.fillStyle = full ? "#636e72" : "#ffffff";
            ctx.font = "bold 14px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(k < 9 ? String(k + 1) : "✕", bx + PBW / 2, by + PBH / 2 + 1);
          }
          hudText(ctx, lv.name + "   ミス " + mistakes + "/3   ⏱ " + Math.floor(frames / 60) + "秒", W / 2, 13, "center");
          hudText(ctx, "ヒント " + data.clues, W / 2, 312, "center");
        }
      };
    }
  });

  // テスト用（ゲームの動作には使わない）
  window.UGTable = {
    gomokuNewBoard: gomokuNewBoard, gomokuWinLine: gomokuWinLine, gomokuBestMove: gomokuBestMove, gomokuEval: gomokuEval, GN: GN,
    sudokuMake: sudokuMake, sudokuSolve: sudokuSolve, sudokuValid: sudokuValid, sudokuFull: sudokuFull, sudokuLevels: SUDOKU_LEVELS
  };
})();
