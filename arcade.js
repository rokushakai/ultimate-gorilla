// =========================================================
// 究極ゴリラ ゲームセンター (§146 v0.65)
// レトロミニゲーム集。ES5・外部ライブラリなし。
// window.UGArcade だけを公開し、script.js から呼び出す。
// BGM/SE には一切触れない（ミニゲームは無音）。
// =========================================================
(function () {
  "use strict";

  var W = 240, H = 320;
  var SCALE = 2;              // canvas 実解像度倍率（にじみ防止）
  var STEP_MS = 1000 / 60;    // 固定ステップ

  var GAMES = {};
  var ORDER = [];
  function register(def) { GAMES[def.id] = def; ORDER.push(def.id); }

  function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  var raf = window.requestAnimationFrame
    ? function (f) { return window.requestAnimationFrame(f); }
    : function (f) { return setTimeout(function () { f(Date.now()); }, STEP_MS); };
  var caf = window.cancelAnimationFrame
    ? function (id) { window.cancelAnimationFrame(id); }
    : function (id) { clearTimeout(id); };

  // ---------------------------------------------------------
  // ホスト（ループ・入力・UI）
  // ---------------------------------------------------------
  var host = null;

  function send(action, down) {
    if (!host || !host.game) { return; }
    // 離す入力は常に届ける（押しっぱなしフラグ残り防止）
    if (down && (host.paused || host.over)) { return; }
    host.game.input(action, down);
  }

  function bindHold(btn, action) {
    var pressed = false;
    function down(ev) {
      if (ev && ev.cancelable) { ev.preventDefault(); }
      if (pressed) { return; }
      pressed = true;
      btn.classList.add("pressed");
      send(action, true);
    }
    function up() {
      if (!pressed) { return; }
      pressed = false;
      btn.classList.remove("pressed");
      send(action, false);
    }
    if (window.PointerEvent) {
      btn.addEventListener("pointerdown", down);
      btn.addEventListener("pointerup", up);
      btn.addEventListener("pointercancel", up);
      btn.addEventListener("pointerleave", up);
    } else {
      btn.addEventListener("touchstart", down, { passive: false });
      btn.addEventListener("touchend", up);
      btn.addEventListener("touchcancel", up);
      btn.addEventListener("mousedown", down);
      btn.addEventListener("mouseup", up);
      btn.addEventListener("mouseleave", up);
    }
    btn.addEventListener("contextmenu", function (ev) { ev.preventDefault(); });
  }

  function setScore(n) {
    if (!host) { return; }
    host.score = Math.max(0, Math.floor(n));
    if (host.score !== host.shownScore) {
      host.shownScore = host.score;
      if (host.scoreEl) { host.scoreEl.textContent = String(host.score); }
      if (host.hiEl && host.score > host.hi) { host.hiEl.textContent = String(host.score); }
    }
  }

  function report() {
    if (!host || host.reported) { return; }
    host.reported = true;
    if (host.opts && typeof host.opts.onEnd === "function") {
      host.opts.onEnd(host.gameId, host.score);
    }
  }

  function renderSysButtons() {
    if (!host) { return; }
    var sys = host.sysEl;
    if (host.over) {
      sys.innerHTML =
        '<button class="modal-btn" data-sys="retry">&#x1F501; もう一度</button>' +
        '<button class="modal-btn" data-sys="menu">&#x1F579;&#xFE0F; メニューへ</button>';
    } else {
      sys.innerHTML =
        '<button class="modal-btn" data-sys="pause">' + (host.paused ? "&#x25B6;&#xFE0F; 再開" : "&#x23F8;&#xFE0F; 一時停止") + '</button>' +
        '<button class="modal-btn" data-sys="quit">&#x2716;&#xFE0F; やめる</button>';
    }
    var btns = sys.querySelectorAll("button");
    for (var i = 0; i < btns.length; i++) {
      btns[i].onclick = onSysClick;
    }
  }

  function onSysClick(ev) {
    if (!host) { return; }
    if (ev.currentTarget.blur) { ev.currentTarget.blur(); }
    var kind = ev.currentTarget.getAttribute("data-sys");
    if (kind === "pause") {
      togglePause();
    } else if (kind === "quit") {
      report();
      exitToMenu();
    } else if (kind === "retry") {
      var g = host.gameId, root = host.root, opts = host.opts;
      if (host.score > host.hi) { opts.hiScore = host.score; }
      start(g, root, opts);
    } else if (kind === "menu") {
      exitToMenu();
    }
  }

  function exitToMenu() {
    if (!host) { return; }
    var opts = host.opts;
    stop();
    if (opts && typeof opts.onExit === "function") { opts.onExit(); }
  }

  function togglePause() {
    if (!host || host.over) { return; }
    host.paused = !host.paused;
    host.acc = 0;
    renderSysButtons();
  }

  function gameOver() {
    if (!host || host.over) { return; }
    host.over = true;
    report();
    renderSysButtons();
  }

  function onKeyDown(ev) {
    if (!host) { return; }
    if (ev.key === "p" || ev.key === "P") { togglePause(); return; }
    var act = host.def.keys[ev.key];
    if (!act) { return; }
    if (ev.cancelable) { ev.preventDefault(); }
    if (ev.repeat) { return; }
    send(act, true);
  }
  function onKeyUp(ev) {
    if (!host) { return; }
    var act = host.def.keys[ev.key];
    if (!act) { return; }
    // フォーカス中のボタンが Space で押されないようにする
    if (ev.cancelable) { ev.preventDefault(); }
    send(act, false);
  }
  function onVisibility() {
    if (host && document.hidden && !host.paused && !host.over) { togglePause(); }
  }

  function frame(t) {
    if (!host) { return; }
    host.rafId = raf(frame);
    if (host.last === null) { host.last = t; }
    var dt = t - host.last;
    host.last = t;
    if (dt > 100) { dt = 100; }
    if (!host.paused && !host.over) {
      host.acc += dt;
      var n = 0;
      while (host.acc >= STEP_MS && n < 5) {
        host.game.step();
        host.acc -= STEP_MS;
        n++;
        if (!host || host.over) { break; }
      }
      if (host && n >= 5) { host.acc = 0; }
    }
    if (host) { draw(); }
  }

  function draw() {
    var ctx = host.ctx;
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.fillStyle = "#05060f";
    ctx.fillRect(0, 0, W, H);
    host.game.draw(ctx);
    if (host.paused || host.over) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#ffd166";
      ctx.font = "bold 24px sans-serif";
      ctx.fillText(host.over ? "GAME OVER" : "PAUSE", W / 2, H / 2 - 24);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 15px sans-serif";
      ctx.fillText("SCORE " + host.score, W / 2, H / 2 + 8);
      if (host.over && host.score > host.hi) {
        ctx.fillStyle = "#55efc4";
        ctx.fillText("ハイスコア更新！", W / 2, H / 2 + 32);
      }
    }
  }

  function start(gameId, rootEl, opts) {
    var def = GAMES[gameId];
    if (!def || !rootEl) { return false; }
    stop();
    opts = opts || {};
    var hi = Math.max(0, Math.floor(opts.hiScore || 0));
    rootEl.innerHTML =
      '<div class="arcade-hud">' +
        '<span class="arcade-hud-title">' + def.icon + ' ' + def.name + '</span>' +
        '<span>SCORE <b class="arcade-score">0</b></span>' +
        '<span>HI <b class="arcade-hi">' + hi + '</b></span>' +
      '</div>' +
      '<canvas class="arcade-canvas" width="' + (W * SCALE) + '" height="' + (H * SCALE) + '"></canvas>' +
      '<div class="arcade-controls"></div>' +
      '<div class="arcade-sys"></div>' +
      '<p class="arcade-help">' + def.help + '</p>';
    var canvas = rootEl.querySelector(".arcade-canvas");
    host = {
      gameId: gameId,
      def: def,
      root: rootEl,
      opts: opts,
      canvas: canvas,
      ctx: canvas.getContext("2d"),
      scoreEl: rootEl.querySelector(".arcade-score"),
      hiEl: rootEl.querySelector(".arcade-hi"),
      sysEl: rootEl.querySelector(".arcade-sys"),
      hi: hi,
      score: 0,
      shownScore: 0,
      paused: false,
      over: false,
      reported: false,
      acc: 0,
      last: null,
      rafId: null,
      game: null
    };
    canvas.addEventListener("contextmenu", function (ev) { ev.preventDefault(); });
    var api = {
      W: W,
      H: H,
      addScore: function (n) { if (host) { setScore(host.score + n); } },
      getScore: function () { return host ? host.score : 0; },
      gameOver: gameOver
    };
    host.game = def.create(api);
    // タッチボタン
    var ctrl = rootEl.querySelector(".arcade-controls");
    var controls = def.controls;
    ctrl.style.gridTemplateColumns = "repeat(" + controls.length + ", 1fr)";
    for (var i = 0; i < controls.length; i++) {
      var b = document.createElement("button");
      b.className = "arcade-btn";
      b.type = "button";
      b.tabIndex = -1;
      b.innerHTML = controls[i].label;
      ctrl.appendChild(b);
      bindHold(b, controls[i].action);
    }
    renderSysButtons();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    document.addEventListener("visibilitychange", onVisibility);
    host.rafId = raf(frame);
    return true;
  }

  function stop() {
    if (!host) { return; }
    if (host.rafId !== null) { caf(host.rafId); }
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    document.removeEventListener("visibilitychange", onVisibility);
    var root = host.root;
    host = null;
    if (root) { root.innerHTML = ""; }
  }

  // ---------------------------------------------------------
  // 🧱 ゴリラブロック（落ちものパズル）
  // ---------------------------------------------------------
  var BLOCK_SHAPES = {
    I: { n: 4, c: [[0, 1], [1, 1], [2, 1], [3, 1]], col: "#4dd0e1" },
    O: { n: 2, c: [[0, 0], [1, 0], [0, 1], [1, 1]], col: "#ffd54f" },
    T: { n: 3, c: [[1, 0], [0, 1], [1, 1], [2, 1]], col: "#ba68c8" },
    S: { n: 3, c: [[1, 0], [2, 0], [0, 1], [1, 1]], col: "#81c784" },
    Z: { n: 3, c: [[0, 0], [1, 0], [1, 1], [2, 1]], col: "#e57373" },
    J: { n: 3, c: [[0, 0], [0, 1], [1, 1], [2, 1]], col: "#64b5f6" },
    L: { n: 3, c: [[2, 0], [0, 1], [1, 1], [2, 1]], col: "#ffb74d" }
  };
  var BLOCK_TYPES = ["I", "O", "T", "S", "Z", "J", "L"];

  register({
    id: "blocks",
    name: "ゴリラブロック",
    icon: "&#x1F9F1;",
    desc: "落ちてくるブロックを並べて横一列を消そう",
    help: "←→移動 / ↑回転 / ↓ソフトドロップ / Spaceハードドロップ / P一時停止",
    controls: [
      { action: "left", label: "&#x25C0;" },
      { action: "right", label: "&#x25B6;" },
      { action: "rot", label: "&#x21BB;" },
      { action: "down", label: "&#x25BC;" },
      { action: "drop", label: "&#x2913;" }
    ],
    keys: { "ArrowLeft": "left", "ArrowRight": "right", "ArrowUp": "rot", "x": "rot", "X": "rot", "ArrowDown": "down", " ": "drop" },
    create: function (api) {
      var COLS = 10, ROWS = 20, CELL = 14, OX = 8, OY = 18;
      var board = [], y, x;
      for (y = 0; y < ROWS; y++) { board.push([null, null, null, null, null, null, null, null, null, null]); }
      var bag = [];
      var cur = null, nextType = null;
      var level = 1, lines = 0, dropTimer = 0;
      var held = { left: false, right: false, down: false };
      var das = { dir: 0, t: 0 };
      var flash = 0;

      function drawFromBag() {
        if (bag.length === 0) {
          bag = BLOCK_TYPES.slice();
          for (var i = bag.length - 1; i > 0; i--) {
            var j = randInt(0, i), t = bag[i]; bag[i] = bag[j]; bag[j] = t;
          }
        }
        return bag.pop();
      }
      function cellsOf(p) {
        var s = BLOCK_SHAPES[p.t], out = [];
        for (var i = 0; i < 4; i++) {
          var cx = s.c[i][0], cy = s.c[i][1];
          for (var k = 0; k < p.r; k++) { var tmp = cx; cx = s.n - 1 - cy; cy = tmp; }
          out.push([p.x + cx, p.y + cy]);
        }
        return out;
      }
      function fits(p) {
        var cs = cellsOf(p);
        for (var i = 0; i < 4; i++) {
          var cx = cs[i][0], cy = cs[i][1];
          if (cx < 0 || cx >= COLS || cy >= ROWS) { return false; }
          if (cy >= 0 && board[cy][cx]) { return false; }
        }
        return true;
      }
      function spawn() {
        var t = nextType || drawFromBag();
        nextType = drawFromBag();
        cur = { t: t, r: 0, x: (t === "O") ? 4 : 3, y: (t === "I") ? -1 : 0 };
        dropTimer = 0;
        if (!fits(cur)) { api.gameOver(); }
      }
      function tryMove(dx, dy) {
        var p = { t: cur.t, r: cur.r, x: cur.x + dx, y: cur.y + dy };
        if (fits(p)) { cur = p; return true; }
        return false;
      }
      function rotate() {
        var r = (cur.r + 1) % 4;
        var kicks = [0, -1, 1, -2, 2];
        for (var i = 0; i < kicks.length; i++) {
          var p = { t: cur.t, r: r, x: cur.x + kicks[i], y: cur.y };
          if (fits(p)) { cur = p; return; }
        }
      }
      function interval() { return Math.max(4, 48 - (level - 1) * 4); }
      function lock() {
        var cs = cellsOf(cur), col = BLOCK_SHAPES[cur.t].col, top = false;
        for (var i = 0; i < 4; i++) {
          if (cs[i][1] < 0) { top = true; continue; }
          board[cs[i][1]][cs[i][0]] = col;
        }
        if (top) { api.gameOver(); return; }
        var cleared = 0;
        for (var yy = ROWS - 1; yy >= 0; yy--) {
          var full = true;
          for (var xx = 0; xx < COLS; xx++) { if (!board[yy][xx]) { full = false; break; } }
          if (full) {
            board.splice(yy, 1);
            board.unshift([null, null, null, null, null, null, null, null, null, null]);
            cleared++;
            yy++;
          }
        }
        if (cleared > 0) {
          var pts = [0, 100, 300, 500, 800][cleared];
          api.addScore(pts * level);
          lines += cleared;
          level = 1 + Math.floor(lines / 10);
          flash = 8;
        }
        spawn();
      }
      function hardDrop() {
        var n = 0;
        while (tryMove(0, 1)) { n++; }
        api.addScore(n * 2);
        lock();
      }

      spawn();

      return {
        input: function (action, down) {
          if (action === "left" || action === "right" || action === "down") { held[action] = down; }
          if (!down || !cur) { return; }
          if (action === "left") { tryMove(-1, 0); das.dir = -1; das.t = 0; }
          else if (action === "right") { tryMove(1, 0); das.dir = 1; das.t = 0; }
          else if (action === "rot") { rotate(); }
          else if (action === "drop") { hardDrop(); }
        },
        step: function () {
          if (!cur) { return; }
          if (flash > 0) { flash--; }
          // 横移動の長押しリピート
          var dir = held.left && !held.right ? -1 : (held.right && !held.left ? 1 : 0);
          if (dir === 0) { das.dir = 0; das.t = 0; }
          else {
            if (das.dir !== dir) { das.dir = dir; das.t = 0; }
            das.t++;
            if (das.t > 10 && (das.t - 10) % 3 === 0) { tryMove(dir, 0); }
          }
          dropTimer++;
          var iv = held.down ? Math.min(2, interval()) : interval();
          if (dropTimer >= iv) {
            dropTimer = 0;
            if (tryMove(0, 1)) {
              if (held.down) { api.addScore(1); }
            } else {
              lock();
            }
          }
        },
        draw: function (ctx) {
          var i;
          ctx.fillStyle = flash > 0 ? "#2a2f55" : "#11142a";
          ctx.fillRect(OX, OY, COLS * CELL, ROWS * CELL);
          ctx.strokeStyle = "rgba(255,255,255,0.05)";
          ctx.lineWidth = 1;
          for (i = 1; i < COLS; i++) { ctx.beginPath(); ctx.moveTo(OX + i * CELL + 0.5, OY); ctx.lineTo(OX + i * CELL + 0.5, OY + ROWS * CELL); ctx.stroke(); }
          for (i = 1; i < ROWS; i++) { ctx.beginPath(); ctx.moveTo(OX, OY + i * CELL + 0.5); ctx.lineTo(OX + COLS * CELL, OY + i * CELL + 0.5); ctx.stroke(); }
          for (var yy = 0; yy < ROWS; yy++) {
            for (var xx = 0; xx < COLS; xx++) {
              if (board[yy][xx]) { cell(ctx, OX + xx * CELL, OY + yy * CELL, CELL, board[yy][xx]); }
            }
          }
          if (cur) {
            // ゴースト
            var g = { t: cur.t, r: cur.r, x: cur.x, y: cur.y };
            while (fits({ t: g.t, r: g.r, x: g.x, y: g.y + 1 })) { g.y++; }
            var gc = cellsOf(g);
            ctx.strokeStyle = "rgba(255,255,255,0.35)";
            for (i = 0; i < 4; i++) {
              if (gc[i][1] >= 0) { ctx.strokeRect(OX + gc[i][0] * CELL + 1.5, OY + gc[i][1] * CELL + 1.5, CELL - 3, CELL - 3); }
            }
            var cc = cellsOf(cur), col = BLOCK_SHAPES[cur.t].col;
            for (i = 0; i < 4; i++) {
              if (cc[i][1] >= 0) { cell(ctx, OX + cc[i][0] * CELL, OY + cc[i][1] * CELL, CELL, col); }
            }
          }
          ctx.strokeStyle = "#8888aa";
          ctx.lineWidth = 2;
          ctx.strokeRect(OX - 1, OY - 1, COLS * CELL + 2, ROWS * CELL + 2);
          // サイドパネル
          var px = 160;
          ctx.fillStyle = "#ffd166";
          ctx.font = "bold 12px sans-serif";
          ctx.textAlign = "left";
          ctx.textBaseline = "top";
          ctx.fillText("NEXT", px, OY);
          if (nextType) {
            var s = BLOCK_SHAPES[nextType];
            for (i = 0; i < 4; i++) { cell(ctx, px + s.c[i][0] * 12, OY + 20 + s.c[i][1] * 12, 12, s.col); }
          }
          ctx.fillStyle = "#ffd166";
          ctx.fillText("LEVEL", px, OY + 80);
          ctx.fillText("LINES", px, OY + 124);
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 18px sans-serif";
          ctx.fillText(String(level), px, OY + 96);
          ctx.fillText(String(lines), px, OY + 140);
          ctx.font = "28px sans-serif";
          ctx.fillText("🦍", px + 6, OY + 200);
        }
      };
    }
  });

  function cell(ctx, x, y, s, col) {
    ctx.fillStyle = col;
    ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.fillRect(x + 1, y + 1, s - 2, 3);
  }

  // ---------------------------------------------------------
  // 👾 UMAシューター（固定画面シューティング）
  // ---------------------------------------------------------
  var SHOOTER_ROWS = [
    { emoji: "👽", pts: 50 },  // 👽
    { emoji: "🐙", pts: 40 },  // 🐙
    { emoji: "🦕", pts: 30 },  // 🦕
    { emoji: "🐒", pts: 20 },  // 🐒
    { emoji: "🦍", pts: 10 }   // 🦍
  ];

  register({
    id: "shooter",
    name: "UMAシューター",
    icon: "&#x1F47E;",
    desc: "せまりくるUMAの大群を撃ち落とそう",
    help: "←→移動 / Space発射 / P一時停止",
    controls: [
      { action: "left", label: "&#x25C0;" },
      { action: "fire", label: "&#x1F52B; 発射" },
      { action: "right", label: "&#x25B6;" }
    ],
    keys: { "ArrowLeft": "left", "ArrowRight": "right", " ": "fire", "ArrowUp": "fire", "z": "fire", "Z": "fire" },
    create: function (api) {
      var COLS = 8, ROWS = 5, DX = 22, DY = 20, EW = 16, EH = 14;
      var PY = 296, PW = 18;
      var player = { x: W / 2, inv: 0 };
      var lives = 3, wave = 0;
      var held = { left: false, right: false, fire: false };
      var bullet = null, eBullets = [];
      var grid, gx, gy, gdir, marchT, anim;
      var shields = [];
      var ufo = null, ufoT = 0;
      var stars = [];
      var i;
      for (i = 0; i < 30; i++) { stars.push([randInt(0, W), randInt(0, H)]); }

      function makeShields() {
        shields = [];
        var centers = [44, 120, 196];
        for (var s = 0; s < centers.length; s++) {
          for (var by = 0; by < 3; by++) {
            for (var bx = 0; bx < 6; bx++) {
              if (by === 2 && (bx === 2 || bx === 3)) { continue; }
              shields.push({ x: centers[s] - 12 + bx * 4, y: 262 + by * 4, alive: true });
            }
          }
        }
      }
      function newWave() {
        grid = [];
        for (var r = 0; r < ROWS; r++) {
          var row = [];
          for (var c = 0; c < COLS; c++) { row.push(true); }
          grid.push(row);
        }
        gx = 28;
        gy = 40 + Math.min(wave, 5) * 8;
        gdir = 1;
        marchT = 0;
        anim = 0;
        eBullets = [];
        bullet = null;
      }
      function aliveCount() {
        var n = 0;
        for (var r = 0; r < ROWS; r++) { for (var c = 0; c < COLS; c++) { if (grid[r][c]) { n++; } } }
        return n;
      }
      function enemyPos(r, c) { return { x: gx + c * DX, y: gy + r * DY }; }
      function bounds() {
        var minX = 999, maxX = -999, maxY = -999;
        for (var r = 0; r < ROWS; r++) {
          for (var c = 0; c < COLS; c++) {
            if (!grid[r][c]) { continue; }
            var p = enemyPos(r, c);
            if (p.x < minX) { minX = p.x; }
            if (p.x > maxX) { maxX = p.x; }
            if (p.y > maxY) { maxY = p.y; }
          }
        }
        return { minX: minX, maxX: maxX, maxY: maxY };
      }
      function hitShield(bx, by) {
        for (var k = 0; k < shields.length; k++) {
          var s = shields[k];
          if (s.alive && bx >= s.x - 1 && bx <= s.x + 4 && by >= s.y && by <= s.y + 4) { s.alive = false; return true; }
        }
        return false;
      }
      function playerHit() {
        lives--;
        eBullets = [];
        player.inv = 90;
        if (lives <= 0) { api.gameOver(); }
      }

      makeShields();
      newWave();

      return {
        input: function (action, down) {
          held[action] = down;
          if (down && action === "fire" && !bullet) { bullet = { x: player.x, y: PY - 10 }; }
        },
        step: function () {
          var r, c, p, k;
          if (held.left) { player.x -= 2.2; }
          if (held.right) { player.x += 2.2; }
          player.x = clamp(player.x, 12, W - 12);
          if (player.inv > 0) { player.inv--; }
          if (held.fire && !bullet) { bullet = { x: player.x, y: PY - 10 }; }

          // 自機の弾
          if (bullet) {
            bullet.y -= 5;
            if (bullet.y < 0) { bullet = null; }
            else if (hitShield(bullet.x, bullet.y)) { bullet = null; }
            else {
              if (ufo && Math.abs(bullet.x - ufo.x) < 10 && Math.abs(bullet.y - 22) < 8) {
                api.addScore(ufo.pts);
                ufo = null;
                bullet = null;
              }
            }
            if (bullet) {
              for (r = 0; r < ROWS && bullet; r++) {
                for (c = 0; c < COLS; c++) {
                  if (!grid[r][c]) { continue; }
                  p = enemyPos(r, c);
                  if (Math.abs(bullet.x - p.x) < EW / 2 && Math.abs(bullet.y - p.y) < EH / 2) {
                    grid[r][c] = false;
                    api.addScore(SHOOTER_ROWS[r].pts);
                    bullet = null;
                    break;
                  }
                }
              }
            }
          }

          // 行進
          var alive = aliveCount();
          if (alive === 0) { wave++; newWave(); return; }
          var iv = Math.max(2, Math.round(alive * 0.9) - wave * 2);
          marchT++;
          if (marchT >= iv) {
            marchT = 0;
            anim = 1 - anim;
            var b = bounds();
            if ((gdir > 0 && b.maxX + 4 > W - 10) || (gdir < 0 && b.minX - 4 < 10)) {
              gy += 8;
              gdir = -gdir;
            } else {
              gx += 4 * gdir;
            }
            b = bounds();
            if (b.maxY + EH / 2 >= 258) {
              for (k = 0; k < shields.length; k++) { if (shields[k].y <= b.maxY + EH / 2) { shields[k].alive = false; } }
            }
            if (b.maxY + EH / 2 >= PY - 6) { lives = 0; api.gameOver(); return; }
          }

          // 敵の弾
          if (eBullets.length < 3 && Math.random() < 0.012 + wave * 0.004) {
            c = randInt(0, COLS - 1);
            for (r = ROWS - 1; r >= 0; r--) {
              if (grid[r][c]) { p = enemyPos(r, c); eBullets.push({ x: p.x, y: p.y + 8 }); break; }
            }
          }
          var spd = 2.2 + Math.min(wave, 6) * 0.2;
          for (k = eBullets.length - 1; k >= 0; k--) {
            var eb = eBullets[k];
            eb.y += spd;
            if (eb.y > H) { eBullets.splice(k, 1); continue; }
            if (hitShield(eb.x, eb.y)) { eBullets.splice(k, 1); continue; }
            if (player.inv === 0 && Math.abs(eb.x - player.x) < PW / 2 && eb.y > PY - 6 && eb.y < PY + 8) {
              eBullets.splice(k, 1);
              playerHit();
              return;
            }
          }

          // UFO
          if (ufo) {
            ufo.x += ufo.dx;
            if (ufo.x < -20 || ufo.x > W + 20) { ufo = null; }
          } else {
            ufoT++;
            if (ufoT > 900 && Math.random() < 0.01) {
              ufoT = 0;
              var fromLeft = Math.random() < 0.5;
              ufo = { x: fromLeft ? -16 : W + 16, dx: fromLeft ? 1.2 : -1.2, pts: [100, 150, 200, 300][randInt(0, 3)] };
            }
          }
        },
        draw: function (ctx) {
          var r, c, p, k;
          ctx.fillStyle = "#666688";
          for (k = 0; k < stars.length; k++) { ctx.fillRect(stars[k][0], stars[k][1], 1, 1); }
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.font = "14px sans-serif";
          for (r = 0; r < ROWS; r++) {
            for (c = 0; c < COLS; c++) {
              if (!grid[r][c]) { continue; }
              p = enemyPos(r, c);
              ctx.fillText(SHOOTER_ROWS[r].emoji, p.x, p.y + (anim ? -1 : 1));
            }
          }
          if (ufo) { ctx.fillText("🛸", ufo.x, 22); }
          ctx.fillStyle = "#55efc4";
          for (k = 0; k < shields.length; k++) { if (shields[k].alive) { ctx.fillRect(shields[k].x, shields[k].y, 4, 4); } }
          // 自機
          if (player.inv === 0 || Math.floor(player.inv / 6) % 2 === 0) {
            ctx.fillStyle = "#7bed9f";
            ctx.beginPath();
            ctx.moveTo(player.x, PY - 8);
            ctx.lineTo(player.x + PW / 2, PY + 6);
            ctx.lineTo(player.x - PW / 2, PY + 6);
            ctx.closePath();
            ctx.fill();
          }
          ctx.fillStyle = "#ffffff";
          if (bullet) { ctx.fillRect(bullet.x - 1, bullet.y - 4, 2, 8); }
          ctx.fillStyle = "#ff7675";
          for (k = 0; k < eBullets.length; k++) { ctx.fillRect(eBullets[k].x - 1.5, eBullets[k].y - 3, 3, 6); }
          ctx.fillStyle = "#ffd166";
          ctx.font = "bold 11px sans-serif";
          ctx.textAlign = "left";
          ctx.fillText("LIFE " + Math.max(0, lives) + "   WAVE " + (wave + 1), 6, 312);
        }
      };
    }
  });

  // ---------------------------------------------------------
  // 🎯 ゴリラピンボール
  // ---------------------------------------------------------
  register({
    id: "pinball",
    name: "ゴリラピンボール",
    icon: "&#x1F3AF;",
    desc: "フリッパーでボールを打ち返してバンパーを狙おう",
    help: "Z/←左フリッパー / M/→右フリッパー / Space/↓発射（長押しでため） / P一時停止",
    controls: [
      { action: "left", label: "&#x2196;&#xFE0F; 左" },
      { action: "launch", label: "&#x1F680; 発射" },
      { action: "right", label: "右 &#x2197;&#xFE0F;" }
    ],
    keys: { "z": "left", "Z": "left", "ArrowLeft": "left", "m": "right", "M": "right", "/": "right", "ArrowRight": "right", " ": "launch", "ArrowDown": "launch" },
    create: function (api) {
      var R = 5, G = 0.12, SUB = 6, VMAX = 13;
      var WALLS = [
        [10, 60, 10, 232],
        [10, 60, 50, 14],
        [50, 14, 185, 14],
        [185, 14, 230, 50],
        [230, 50, 230, 320],
        [210, 100, 210, 320],
        [10, 232, 72, 272],
        [210, 232, 148, 272],
        [210, 306, 230, 306]
      ];
      var BUMPERS = [
        { x: 70, y: 92, r: 13, flash: 0 },
        { x: 150, y: 92, r: 13, flash: 0 },
        { x: 110, y: 142, r: 13, flash: 0 }
      ];
      var ROLLOVERS = [
        { x: 80, y: 52, lit: false, cd: 0 },
        { x: 110, y: 52, lit: false, cd: 0 },
        { x: 140, y: 52, lit: false, cd: 0 }
      ];
      var FL_LEN = 30, FL_RAD = 3;
      var flippers = [
        { px: 72, py: 272, rest: 0.5, up: -0.5, a: 0.5, held: false, w: 0 },
        { px: 148, py: 272, rest: Math.PI - 0.5, up: Math.PI + 0.5, a: Math.PI - 0.5, held: false, w: 0 }
      ];
      var ball = { x: 220, y: 300, vx: 0, vy: 0 };
      var mode = "ready";
      var balls = 3, charge = 0, launchHeld = false, bonusMsg = 0;

      function readyBall() {
        ball.x = 220; ball.y = 300; ball.vx = 0; ball.vy = 0;
        mode = "ready";
        charge = 0;
      }
      function closest(px, py, ax, ay, bx, by) {
        var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
        var t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
        t = clamp(t, 0, 1);
        return [ax + dx * t, ay + dy * t];
      }
      function resolve(qx, qy, rad, e, svx, svy) {
        var nx = ball.x - qx, ny = ball.y - qy;
        var d = Math.sqrt(nx * nx + ny * ny);
        if (d >= rad || d === 0) { return false; }
        nx /= d; ny /= d;
        ball.x = qx + nx * rad;
        ball.y = qy + ny * rad;
        var rvx = ball.vx - svx, rvy = ball.vy - svy;
        var vn = rvx * nx + rvy * ny;
        if (vn < 0) {
          ball.vx -= (1 + e) * vn * nx;
          ball.vy -= (1 + e) * vn * ny;
        }
        return true;
      }
      function flipperTip(f) { return [f.px + Math.cos(f.a) * FL_LEN, f.py + Math.sin(f.a) * FL_LEN]; }

      function substep() {
        var k, q;
        // フリッパー角度
        for (k = 0; k < flippers.length; k++) {
          var f = flippers[k];
          var target = f.held ? f.up : f.rest;
          var speed = (f.held ? 0.3 : 0.15) / SUB;
          var prev = f.a;
          if (f.a < target) { f.a = Math.min(target, f.a + speed); }
          else if (f.a > target) { f.a = Math.max(target, f.a - speed); }
          f.w = (f.a - prev) * SUB; // rad/frame
        }
        ball.vy += G / SUB;
        ball.x += ball.vx / SUB;
        ball.y += ball.vy / SUB;
        for (k = 0; k < WALLS.length; k++) {
          var wl = WALLS[k];
          q = closest(ball.x, ball.y, wl[0], wl[1], wl[2], wl[3]);
          resolve(q[0], q[1], R, 0.45, 0, 0);
        }
        for (k = 0; k < flippers.length; k++) {
          var fl = flippers[k], tip = flipperTip(fl);
          q = closest(ball.x, ball.y, fl.px, fl.py, tip[0], tip[1]);
          var svx = -fl.w * (q[1] - fl.py), svy = fl.w * (q[0] - fl.px);
          resolve(q[0], q[1], R + FL_RAD, 0.3, svx, svy);
        }
        for (k = 0; k < BUMPERS.length; k++) {
          var bm = BUMPERS[k];
          var dx = ball.x - bm.x, dy = ball.y - bm.y, d = Math.sqrt(dx * dx + dy * dy);
          if (d < bm.r + R && d > 0) {
            var nx = dx / d, ny = dy / d;
            ball.x = bm.x + nx * (bm.r + R);
            ball.y = bm.y + ny * (bm.r + R);
            var vn = ball.vx * nx + ball.vy * ny;
            if (vn < 0) { ball.vx -= 2 * vn * nx; ball.vy -= 2 * vn * ny; }
            var sp = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
            var want = Math.max(sp, 6.5);
            if (sp > 0) { ball.vx = ball.vx / sp * want; ball.vy = ball.vy / sp * want; }
            if (bm.flash === 0) { api.addScore(100); }
            bm.flash = 10;
          }
        }
        var s2 = ball.vx * ball.vx + ball.vy * ball.vy;
        if (s2 > VMAX * VMAX) { var s = Math.sqrt(s2); ball.vx = ball.vx / s * VMAX; ball.vy = ball.vy / s * VMAX; }
      }

      return {
        input: function (action, down) {
          if (action === "left") { flippers[0].held = down; }
          else if (action === "right") { flippers[1].held = down; }
          else if (action === "launch") {
            if (down) { launchHeld = true; }
            else {
              if (launchHeld && mode === "ready") {
                ball.vy = -(9 + 5 * charge);
                ball.vx = 0;
                mode = "play";
              }
              launchHeld = false;
              charge = 0;
            }
          }
        },
        step: function () {
          var k;
          for (k = 0; k < BUMPERS.length; k++) { if (BUMPERS[k].flash > 0) { BUMPERS[k].flash--; } }
          if (bonusMsg > 0) { bonusMsg--; }
          if (mode === "ready") {
            if (launchHeld) { charge = Math.min(1, charge + 0.02); }
            // フリッパーは待機中も動かせる
            for (k = 0; k < flippers.length; k++) {
              var f = flippers[k];
              f.a = f.held ? f.up : f.rest;
              f.w = 0;
            }
            return;
          }
          for (k = 0; k < SUB; k++) { substep(); }
          // ロールオーバー
          for (k = 0; k < ROLLOVERS.length; k++) {
            var ro = ROLLOVERS[k];
            if (ro.cd > 0) { ro.cd--; continue; }
            if (Math.abs(ball.x - ro.x) < 8 && Math.abs(ball.y - ro.y) < 8) {
              ro.cd = 30;
              if (!ro.lit) { ro.lit = true; api.addScore(50); }
            }
          }
          if (ROLLOVERS[0].lit && ROLLOVERS[1].lit && ROLLOVERS[2].lit) {
            api.addScore(500);
            bonusMsg = 90;
            for (k = 0; k < ROLLOVERS.length; k++) { ROLLOVERS[k].lit = false; }
          }
          // 発射レーンに戻って止まった
          if (ball.x > 210 && ball.y > 290 && Math.abs(ball.vx) + Math.abs(ball.vy) < 0.6) { readyBall(); }
          // 落ちた
          if (ball.y > H + 10) {
            balls--;
            if (balls <= 0) { api.gameOver(); return; }
            readyBall();
          }
        },
        draw: function (ctx) {
          var k;
          ctx.strokeStyle = "#c8d6e5";
          ctx.lineWidth = 2;
          ctx.lineCap = "round";
          for (k = 0; k < WALLS.length; k++) {
            var wl = WALLS[k];
            ctx.beginPath(); ctx.moveTo(wl[0], wl[1]); ctx.lineTo(wl[2], wl[3]); ctx.stroke();
          }
          for (k = 0; k < ROLLOVERS.length; k++) {
            var ro = ROLLOVERS[k];
            ctx.fillStyle = ro.lit ? "#ffd166" : "#3d3d5c";
            ctx.beginPath(); ctx.arc(ro.x, ro.y, 5, 0, Math.PI * 2); ctx.fill();
          }
          for (k = 0; k < BUMPERS.length; k++) {
            var bm = BUMPERS[k];
            ctx.fillStyle = bm.flash > 0 ? "#fff3b0" : "#e17055";
            ctx.beginPath(); ctx.arc(bm.x, bm.y, bm.r, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = "#ffeaa7";
            ctx.lineWidth = 2;
            ctx.stroke();
          }
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.font = "13px sans-serif";
          ctx.fillText("🦍", 110, 142);
          ctx.strokeStyle = "#74b9ff";
          ctx.lineWidth = FL_RAD * 2;
          for (k = 0; k < flippers.length; k++) {
            var f = flippers[k], tip = flipperTip(f);
            ctx.beginPath(); ctx.moveTo(f.px, f.py); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
          }
          ctx.fillStyle = "#ffffff";
          ctx.beginPath(); ctx.arc(ball.x, ball.y, R, 0, Math.PI * 2); ctx.fill();
          if (mode === "ready") {
            ctx.fillStyle = "#333";
            ctx.fillRect(213, 230, 14, 60);
            ctx.fillStyle = "#55efc4";
            ctx.fillRect(213, 290 - 60 * charge, 14, 60 * charge);
          }
          ctx.fillStyle = "#ffd166";
          ctx.font = "bold 11px sans-serif";
          ctx.textAlign = "left";
          ctx.fillText("BALL " + balls, 14, 312);
          if (mode === "ready") {
            ctx.textAlign = "center";
            ctx.fillText("発射ボタン長押し→離す", 110, 200);
          }
          if (bonusMsg > 0) {
            ctx.textAlign = "center";
            ctx.fillStyle = "#55efc4";
            ctx.font = "bold 14px sans-serif";
            ctx.fillText("ROLLOVER BONUS +500", 110, 72);
          }
        }
      };
    }
  });

  // ---------------------------------------------------------
  // 公開API
  // ---------------------------------------------------------
  window.UGArcade = {
    list: function () {
      var out = [];
      for (var i = 0; i < ORDER.length; i++) {
        var d = GAMES[ORDER[i]];
        out.push({ id: d.id, name: d.name, icon: d.icon, desc: d.desc });
      }
      return out;
    },
    start: start,
    stop: stop,
    isRunning: function () { return !!host; }
  };
})();
