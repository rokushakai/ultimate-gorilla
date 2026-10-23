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

  function gameOver(title) {
    if (!host || host.over) { return; }
    host.over = true;
    host.overTitle = title || "GAME OVER";
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
  // キャンバス直接入力（タップ・ドラッグ・スワイプ）。座標は論理解像度 240×320
  function bindCanvas(canvas) {
    var pressed = false;
    function pos(ev) {
      var r = canvas.getBoundingClientRect();
      var src = (ev.changedTouches && ev.changedTouches[0]) ? ev.changedTouches[0] : ev;
      var rw = r.width || W, rh = r.height || H;
      return [(src.clientX - r.left) * W / rw, (src.clientY - r.top) * H / rh];
    }
    function deliver(type, ev) {
      if (!host || !host.game || !host.game.pointer) { return; }
      if (type !== "up" && (host.paused || host.over)) { return; }
      var p = pos(ev);
      host.game.pointer(type, p[0], p[1]);
    }
    function down(ev) {
      if (ev.cancelable) { ev.preventDefault(); }
      pressed = true;
      if (ev.pointerId !== undefined && canvas.setPointerCapture) {
        try { canvas.setPointerCapture(ev.pointerId); } catch (e) {}
      }
      deliver("down", ev);
    }
    function move(ev) {
      if (!pressed) { return; }
      if (ev.cancelable) { ev.preventDefault(); }
      deliver("move", ev);
    }
    function up(ev) {
      if (!pressed) { return; }
      pressed = false;
      deliver("up", ev);
    }
    if (window.PointerEvent) {
      canvas.addEventListener("pointerdown", down);
      canvas.addEventListener("pointermove", move);
      canvas.addEventListener("pointerup", up);
      canvas.addEventListener("pointercancel", up);
    } else {
      canvas.addEventListener("touchstart", down, { passive: false });
      canvas.addEventListener("touchmove", move, { passive: false });
      canvas.addEventListener("touchend", up);
      canvas.addEventListener("touchcancel", up);
      canvas.addEventListener("mousedown", down);
      canvas.addEventListener("mousemove", move);
      canvas.addEventListener("mouseup", up);
    }
  }

  // スワイプ判定ヘルパー（down→up の移動量から方向を返す。短ければ "tap"）
  function swipeDir(sx, sy, ex, ey) {
    var dx = ex - sx, dy = ey - sy;
    if (Math.abs(dx) < 14 && Math.abs(dy) < 14) { return "tap"; }
    if (Math.abs(dx) > Math.abs(dy)) { return dx > 0 ? "right" : "left"; }
    return dy > 0 ? "down" : "up";
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
      ctx.fillText(host.over ? host.overTitle : "PAUSE", W / 2, H / 2 - 24);
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
    bindCanvas(canvas);
    // タッチボタン
    var ctrl = rootEl.querySelector(".arcade-controls");
    var controls = def.controls;
    if (controls.length === 0) { ctrl.style.display = "none"; }
    ctrl.style.gridTemplateColumns = "repeat(" + Math.max(1, controls.length) + ", 1fr)";
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
  // 共通: 方向入力
  // ---------------------------------------------------------
  var DIR_CONTROLS = [
    { action: "left", label: "&#x25C0;" },
    { action: "up", label: "&#x25B2;" },
    { action: "down", label: "&#x25BC;" },
    { action: "right", label: "&#x25B6;" }
  ];
  var DIR_KEYS = {
    "ArrowLeft": "left", "a": "left", "A": "left",
    "ArrowRight": "right", "d": "right", "D": "right",
    "ArrowUp": "up", "w": "up", "W": "up",
    "ArrowDown": "down", "s": "down", "S": "down"
  };

  function emojiAt(ctx, ch, x, y, size) {
    ctx.font = size + "px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(ch, x, y);
  }
  function hudText(ctx, text, x, y, align) {
    ctx.fillStyle = "#ffd166";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
  }

  // ---------------------------------------------------------
  // 💥 ジャングルくずし（ブロックくずし）
  // ---------------------------------------------------------
  var BREAK_COLORS = ["#e84393", "#e17055", "#fdcb6e", "#00b894", "#0984e3", "#6c5ce7"];

  register({
    id: "breakout",
    name: "ジャングルくずし",
    icon: "&#x1F4A5;",
    desc: "ボールを打ち返してブロックを全部こわそう",
    help: "←→移動 / Space発射 / 画面ドラッグで移動・タップで発射 / P一時停止",
    controls: [
      { action: "left", label: "&#x25C0;" },
      { action: "launch", label: "&#x1F680; 発射" },
      { action: "right", label: "&#x25B6;" }
    ],
    keys: { "ArrowLeft": "left", "ArrowRight": "right", " ": "launch", "ArrowUp": "launch" },
    create: function (api) {
      var COLS = 8, ROWS = 6, BW = 26, BH = 10, BX0 = 9, BY0 = 36;
      var PW = 44, PH = 6, PY = 292, BR = 4;
      var pad = { x: W / 2 };
      var held = { left: false, right: false };
      var ball = { x: W / 2, y: PY - BR - 1, vx: 0, vy: 0 };
      var stuck = true, lives = 3, level = 1, bricks = [], msg = 0;

      function speed() { return Math.min(6, 3.2 + (level - 1) * 0.4); }
      function build() {
        bricks = [];
        for (var r = 0; r < ROWS; r++) {
          for (var c = 0; c < COLS; c++) {
            bricks.push({ x: BX0 + c * 28, y: BY0 + r * 14, row: r, hp: (level >= 2 && r === 0) ? 2 : 1 });
          }
        }
      }
      function launch() {
        if (!stuck) { return; }
        stuck = false;
        var a = (Math.random() - 0.5) * 0.8;
        ball.vx = speed() * Math.sin(a);
        ball.vy = -speed() * Math.cos(a);
      }
      function resetBall() { stuck = true; ball.vx = 0; ball.vy = 0; }

      build();

      return {
        input: function (action, down) {
          if (action === "left" || action === "right") { held[action] = down; }
          if (down && action === "launch") { launch(); }
        },
        pointer: function (type, x) {
          if (type === "down" || type === "move") { pad.x = clamp(x, PW / 2, W - PW / 2); }
          if (type === "down") { launch(); }
        },
        step: function () {
          var k, s;
          if (msg > 0) { msg--; }
          if (held.left) { pad.x -= 3.6; }
          if (held.right) { pad.x += 3.6; }
          pad.x = clamp(pad.x, PW / 2, W - PW / 2);
          if (stuck) { ball.x = pad.x; ball.y = PY - BR - 1; return; }
          for (s = 0; s < 3; s++) {
            var px = ball.x, py = ball.y;
            ball.x += ball.vx / 3;
            ball.y += ball.vy / 3;
            if (ball.x < BR) { ball.x = BR; ball.vx = Math.abs(ball.vx); }
            if (ball.x > W - BR) { ball.x = W - BR; ball.vx = -Math.abs(ball.vx); }
            if (ball.y < BR) { ball.y = BR; ball.vy = Math.abs(ball.vy); }
            if (ball.vy > 0 && ball.y + BR >= PY && py + BR <= PY + PH && Math.abs(ball.x - pad.x) <= PW / 2 + BR) {
              var rel = clamp((ball.x - pad.x) / (PW / 2), -1, 1);
              var a = rel * 1.05, sp = speed();
              ball.vx = sp * Math.sin(a);
              ball.vy = -sp * Math.cos(a);
              ball.y = PY - BR;
            }
            for (k = 0; k < bricks.length; k++) {
              var b = bricks[k];
              if (b.hp <= 0) { continue; }
              var cx = clamp(ball.x, b.x, b.x + BW), cy = clamp(ball.y, b.y, b.y + BH);
              var dx = ball.x - cx, dy = ball.y - cy;
              if (dx * dx + dy * dy > BR * BR) { continue; }
              if (px >= b.x && px <= b.x + BW) { ball.vy = -ball.vy; ball.y = py; }
              else { ball.vx = -ball.vx; ball.x = px; }
              b.hp--;
              if (b.hp === 0) { api.addScore((ROWS - b.row) * 10); }
              break;
            }
          }
          if (ball.y > H + 10) {
            lives--;
            if (lives <= 0) { api.gameOver(); return; }
            resetBall();
          }
          var left = 0;
          for (k = 0; k < bricks.length; k++) { if (bricks[k].hp > 0) { left++; } }
          if (left === 0) { level++; build(); resetBall(); msg = 90; }
        },
        draw: function (ctx) {
          var k;
          for (k = 0; k < bricks.length; k++) {
            var b = bricks[k];
            if (b.hp <= 0) { continue; }
            ctx.fillStyle = b.hp >= 2 ? "#b2bec3" : BREAK_COLORS[b.row];
            ctx.fillRect(b.x, b.y, BW, BH);
            ctx.fillStyle = "rgba(255,255,255,0.3)";
            ctx.fillRect(b.x, b.y, BW, 2);
          }
          ctx.fillStyle = "#74b9ff";
          ctx.fillRect(pad.x - PW / 2, PY, PW, PH);
          ctx.fillStyle = "#ffffff";
          ctx.beginPath(); ctx.arc(ball.x, ball.y, BR, 0, Math.PI * 2); ctx.fill();
          hudText(ctx, "LIFE " + lives + "   LEVEL " + level, 6, 312);
          if (stuck) { hudText(ctx, "タップ or 発射でスタート", W / 2, 220, "center"); }
          if (msg > 0) {
            ctx.fillStyle = "#55efc4";
            ctx.font = "bold 18px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("LEVEL " + level, W / 2, 180);
          }
        }
      };
    }
  });

  // ---------------------------------------------------------
  // 🐍 バナナスネーク
  // ---------------------------------------------------------
  register({
    id: "snake",
    name: "バナナスネーク",
    icon: "&#x1F40D;",
    desc: "バナナを食べてどんどん長くなろう",
    help: "矢印/WASDで方向転換 / 画面スワイプでもOK / P一時停止",
    controls: DIR_CONTROLS,
    keys: DIR_KEYS,
    create: function (api) {
      var COLS = 20, ROWS = 24, CELL = 12, OY = 8;
      var DIRS = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, up: { x: 0, y: -1 }, down: { x: 0, y: 1 } };
      var body = [{ x: 9, y: 12 }, { x: 8, y: 12 }, { x: 7, y: 12 }, { x: 6, y: 12 }];
      var dir = DIRS.right, queue = [];
      var food = null, star = null, eaten = 0, timer = 0, sx = 0, sy = 0;

      function occupied(x, y) {
        for (var i = 0; i < body.length; i++) { if (body[i].x === x && body[i].y === y) { return true; } }
        return false;
      }
      function emptyCell() {
        for (var tries = 0; tries < 500; tries++) {
          var x = randInt(0, COLS - 1), y = randInt(0, ROWS - 1);
          if (occupied(x, y)) { continue; }
          if (food && food.x === x && food.y === y) { continue; }
          if (star && star.x === x && star.y === y) { continue; }
          return { x: x, y: y };
        }
        return null;
      }
      function turn(name) {
        var d = DIRS[name];
        if (!d) { return; }
        var last = queue.length ? queue[queue.length - 1] : dir;
        if ((d.x === -last.x && d.y === -last.y) || (d.x === last.x && d.y === last.y)) { return; }
        if (queue.length < 2) { queue.push(d); }
      }
      function interval() { return Math.max(4, 10 - Math.floor(body.length / 6)); }

      food = emptyCell();

      return {
        input: function (action, down) { if (down) { turn(action); } },
        pointer: function (type, x, y) {
          if (type === "down") { sx = x; sy = y; }
          else if (type === "up") {
            var d = swipeDir(sx, sy, x, y);
            if (d !== "tap") { turn(d); }
          }
        },
        step: function () {
          if (star) { star.t--; if (star.t <= 0) { star = null; } }
          timer++;
          if (timer < interval()) { return; }
          timer = 0;
          if (queue.length) { dir = queue.shift(); }
          var nx = body[0].x + dir.x, ny = body[0].y + dir.y;
          if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) { api.gameOver(); return; }
          for (var i = 0; i < body.length - 1; i++) {
            if (body[i].x === nx && body[i].y === ny) { api.gameOver(); return; }
          }
          body.unshift({ x: nx, y: ny });
          var grew = false;
          if (food && food.x === nx && food.y === ny) {
            grew = true;
            api.addScore(10);
            eaten++;
            food = emptyCell();
            if (eaten % 5 === 0 && !star) {
              var c = emptyCell();
              if (c) { star = { x: c.x, y: c.y, t: 300 }; }
            }
          }
          if (star && star.x === nx && star.y === ny) { grew = true; api.addScore(50); star = null; }
          if (!grew) { body.pop(); }
        },
        draw: function (ctx) {
          ctx.fillStyle = "#0b3d20";
          ctx.fillRect(0, OY, COLS * CELL, ROWS * CELL);
          ctx.strokeStyle = "#55efc4";
          ctx.lineWidth = 1;
          ctx.strokeRect(0.5, OY + 0.5, COLS * CELL - 1, ROWS * CELL - 1);
          if (food) { emojiAt(ctx, "🍌", food.x * CELL + 6, OY + food.y * CELL + 7, 11); }
          if (star && (star.t > 90 || Math.floor(star.t / 6) % 2 === 0)) {
            emojiAt(ctx, "⭐", star.x * CELL + 6, OY + star.y * CELL + 7, 11);
          }
          for (var i = body.length - 1; i >= 0; i--) {
            ctx.fillStyle = i === 0 ? "#ffd166" : (i % 2 === 0 ? "#55efc4" : "#00b894");
            ctx.fillRect(body[i].x * CELL + 1, OY + body[i].y * CELL + 1, CELL - 2, CELL - 2);
          }
          hudText(ctx, "LENGTH " + body.length, 6, 312);
        }
      };
    }
  });

  // ---------------------------------------------------------
  // 🏓 ゴリラテニス（CPU対戦）
  // ---------------------------------------------------------
  register({
    id: "tennis",
    name: "ゴリラテニス",
    icon: "&#x1F3D3;",
    desc: "CPUゴリラとラリー対決。先に5点とろう",
    help: "←→移動 / 画面ドラッグでも移動 / P一時停止",
    controls: [
      { action: "left", label: "&#x25C0;" },
      { action: "right", label: "&#x25B6;" }
    ],
    keys: { "ArrowLeft": "left", "ArrowRight": "right", "a": "left", "A": "left", "d": "right", "D": "right" },
    create: function (api) {
      var PW = 44, PH = 6, PY = 294, CY = 20, BR = 4, WIN = 5;
      var me = { x: W / 2 }, cpu = { x: W / 2 };
      var held = { left: false, right: false };
      var ball = { x: W / 2, y: H / 2, vx: 0, vy: 0 };
      var sp = 3, serveT = 60, serveDir = 1, cpuErr = 0;
      var myPts = 0, cpuPts = 0, level = 1, msg = 0;

      function serve() {
        sp = 3 + (level - 1) * 0.25;
        var a = (Math.random() - 0.5) * 0.9;
        ball.x = W / 2; ball.y = H / 2;
        ball.vx = sp * Math.sin(a);
        ball.vy = sp * Math.cos(a) * serveDir;
      }
      function bounce(px, dirY) {
        var rel = clamp((ball.x - px) / (PW / 2), -1, 1);
        sp = Math.min(7.5, sp * 1.04);
        ball.vx = sp * Math.sin(rel);
        ball.vy = sp * Math.cos(rel) * dirY;
      }
      function point() {
        serveT = 60;
        if (myPts >= WIN) {
          level++;
          myPts = 0; cpuPts = 0;
          msg = 90;
        } else if (cpuPts >= WIN) {
          api.gameOver();
        }
      }

      return {
        input: function (action, down) { held[action] = down; },
        pointer: function (type, x) {
          if (type === "down" || type === "move") { me.x = clamp(x, PW / 2, W - PW / 2); }
        },
        step: function () {
          if (msg > 0) { msg--; }
          if (held.left) { me.x -= 3.4; }
          if (held.right) { me.x += 3.4; }
          me.x = clamp(me.x, PW / 2, W - PW / 2);
          var cpuSpd = 1.8 + level * 0.35;
          var target = ball.vy < 0 && serveT === 0 ? ball.x + cpuErr : W / 2;
          cpu.x = clamp(cpu.x + clamp(target - cpu.x, -cpuSpd, cpuSpd), PW / 2, W - PW / 2);
          if (serveT > 0) {
            serveT--;
            ball.x = W / 2; ball.y = H / 2;
            if (serveT === 0) { serve(); }
            return;
          }
          for (var s = 0; s < 2; s++) {
            ball.x += ball.vx / 2;
            ball.y += ball.vy / 2;
            if (ball.x < BR) { ball.x = BR; ball.vx = Math.abs(ball.vx); }
            if (ball.x > W - BR) { ball.x = W - BR; ball.vx = -Math.abs(ball.vx); }
            if (ball.vy > 0 && ball.y + BR >= PY && ball.y + BR <= PY + PH + 6 && Math.abs(ball.x - me.x) <= PW / 2 + BR) {
              ball.y = PY - BR;
              bounce(me.x, -1);
              api.addScore(10);
              cpuErr = (Math.random() - 0.5) * Math.max(10, 44 - level * 4);
            }
            if (ball.vy < 0 && ball.y - BR <= CY + PH && ball.y - BR >= CY - 6 && Math.abs(ball.x - cpu.x) <= PW / 2 + BR) {
              ball.y = CY + PH + BR;
              bounce(cpu.x, 1);
            }
          }
          if (ball.y < -10) { myPts++; api.addScore(100); serveDir = -1; point(); }
          else if (ball.y > H + 10) { cpuPts++; serveDir = 1; point(); }
        },
        draw: function (ctx) {
          ctx.strokeStyle = "rgba(255,255,255,0.25)";
          ctx.lineWidth = 2;
          for (var x = 4; x < W; x += 16) {
            ctx.beginPath(); ctx.moveTo(x, H / 2); ctx.lineTo(x + 8, H / 2); ctx.stroke();
          }
          ctx.fillStyle = "rgba(255,255,255,0.15)";
          ctx.font = "bold 48px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(cpuPts), W / 2, H / 2 - 50);
          ctx.fillText(String(myPts), W / 2, H / 2 + 50);
          ctx.fillStyle = "#ff7675";
          ctx.fillRect(cpu.x - PW / 2, CY, PW, PH);
          emojiAt(ctx, "🦍", cpu.x, CY - 9, 12);
          ctx.fillStyle = "#74b9ff";
          ctx.fillRect(me.x - PW / 2, PY, PW, PH);
          ctx.fillStyle = "#ffffff";
          ctx.beginPath(); ctx.arc(ball.x, ball.y, BR, 0, Math.PI * 2); ctx.fill();
          hudText(ctx, "LEVEL " + level + "   先に" + WIN + "点", 6, 312);
          if (msg > 0) { hudText(ctx, "セット獲得！ LEVEL " + level, W / 2, H / 2 - 16, "center"); }
          else if (serveT > 0) { hudText(ctx, "READY", W / 2, H / 2 - 16, "center"); }
        }
      };
    }
  });

  // ---------------------------------------------------------
  // 🚗 UMAクロッシング（道路・川わたり）
  // ---------------------------------------------------------
  var CROSS_LANES = [
    null,
    { type: "log", speed: 0.6, w: 80, gap: 60 },
    { type: "log", speed: -0.9, w: 60, gap: 70 },
    { type: "log", speed: 0.5, w: 100, gap: 60 },
    { type: "log", speed: -0.7, w: 60, gap: 50 },
    { type: "log", speed: 1.0, w: 80, gap: 70 },
    null,
    { type: "car", speed: -1.0, w: 20, gap: 70, emoji: "🚗" },
    { type: "car", speed: 0.8, w: 40, gap: 90, emoji: "🚚" },
    { type: "car", speed: -1.5, w: 20, gap: 90, emoji: "🏎️" },
    { type: "car", speed: 0.7, w: 20, gap: 60, emoji: "🚙" },
    { type: "car", speed: -0.9, w: 40, gap: 80, emoji: "🚌" },
    { type: "car", speed: 1.2, w: 20, gap: 80, emoji: "🚓" },
    null,
    null
  ];

  register({
    id: "crossing",
    name: "UMAクロッシング",
    icon: "&#x1F697;",
    desc: "車をよけて丸太に乗り、向こう岸のゴールをめざそう",
    help: "矢印/WASDで1マス移動 / スワイプ・タップ(前進)でもOK / P一時停止",
    controls: DIR_CONTROLS,
    keys: DIR_KEYS,
    create: function (api) {
      var CELL = 20, ROWS = 15, START_X = 5 * CELL;
      var lanes = [], level = 1, lives = 3;
      var px = START_X, row = ROWS - 1, maxRow = ROWS - 1, dead = 0, msg = 0, sx = 0, sy = 0;

      function buildLanes() {
        var mult = 1 + (level - 1) * 0.15;
        lanes = [];
        for (var r = 0; r < ROWS; r++) {
          var d = CROSS_LANES[r];
          if (!d) { lanes.push(null); continue; }
          var span = d.w + d.gap, n = Math.ceil((W + d.w) / span) + 1, off = randInt(0, span), xs = [];
          for (var i = 0; i < n; i++) { xs.push(i * span - off); }
          lanes.push({ type: d.type, speed: d.speed * mult, w: d.w, emoji: d.emoji, span: n * span, xs: xs });
        }
      }
      function resetPlayer() { px = START_X; row = ROWS - 1; maxRow = ROWS - 1; }
      function die() { lives--; dead = 40; }
      function move(dx, dy) {
        if (dead > 0) { return; }
        var nr = row + dy;
        if (nr < 0 || nr >= ROWS) { return; }
        row = nr;
        px = clamp(px + dx * CELL, 0, W - CELL);
        if (!lanes[row] || lanes[row].type !== "log") { px = clamp(Math.round(px / CELL) * CELL, 0, W - CELL); }
        if (row < maxRow) { maxRow = row; api.addScore(10); }
        if (row === 0) {
          api.addScore(100 + level * 50);
          level++;
          msg = 90;
          buildLanes();
          resetPlayer();
        }
      }
      function dirMove(name) {
        if (name === "left") { move(-1, 0); }
        else if (name === "right") { move(1, 0); }
        else if (name === "up") { move(0, -1); }
        else if (name === "down") { move(0, 1); }
      }

      buildLanes();

      return {
        input: function (action, down) { if (down) { dirMove(action); } },
        pointer: function (type, x, y) {
          if (type === "down") { sx = x; sy = y; }
          else if (type === "up") {
            var d = swipeDir(sx, sy, x, y);
            dirMove(d === "tap" ? "up" : d);
          }
        },
        step: function () {
          var r, i, ln;
          if (msg > 0) { msg--; }
          for (r = 0; r < ROWS; r++) {
            ln = lanes[r];
            if (!ln) { continue; }
            for (i = 0; i < ln.xs.length; i++) {
              ln.xs[i] += ln.speed;
              if (ln.speed > 0 && ln.xs[i] > W) { ln.xs[i] -= ln.span; }
              if (ln.speed < 0 && ln.xs[i] + ln.w < 0) { ln.xs[i] += ln.span; }
            }
          }
          if (dead > 0) {
            dead--;
            if (dead === 0) {
              if (lives <= 0) { api.gameOver(); return; }
              resetPlayer();
            }
            return;
          }
          ln = lanes[row];
          if (!ln) { return; }
          if (ln.type === "log") {
            var on = false, cx = px + CELL / 2;
            for (i = 0; i < ln.xs.length; i++) {
              if (cx >= ln.xs[i] && cx <= ln.xs[i] + ln.w) { on = true; break; }
            }
            if (!on) { die(); return; }
            px += ln.speed;
            if (px < -6 || px > W - CELL + 6) { die(); }
          } else {
            for (i = 0; i < ln.xs.length; i++) {
              if (px + 4 < ln.xs[i] + ln.w && px + CELL - 4 > ln.xs[i]) { die(); return; }
            }
          }
        },
        draw: function (ctx) {
          var r, i, ln, y;
          for (r = 0; r < ROWS; r++) {
            y = r * CELL;
            ln = lanes[r];
            ctx.fillStyle = r === 0 ? "#2d6a4f" : (!ln ? "#40916c" : (ln.type === "log" ? "#1e3a8a" : "#2d3436"));
            ctx.fillRect(0, y, W, CELL);
          }
          for (i = 0; i < 6; i++) { emojiAt(ctx, "🏁", 20 + i * 40, 10, 12); }
          ctx.strokeStyle = "rgba(255,255,255,0.25)";
          ctx.lineWidth = 1;
          for (r = 8; r <= 12; r++) {
            for (i = 0; i < W; i += 20) { ctx.beginPath(); ctx.moveTo(i, r * CELL + 0.5); ctx.lineTo(i + 10, r * CELL + 0.5); ctx.stroke(); }
          }
          for (r = 0; r < ROWS; r++) {
            ln = lanes[r];
            if (!ln) { continue; }
            y = r * CELL;
            for (i = 0; i < ln.xs.length; i++) {
              var x = ln.xs[i];
              if (x > W || x + ln.w < 0) { continue; }
              if (ln.type === "log") {
                ctx.fillStyle = "#8d5524";
                ctx.fillRect(x, y + 3, ln.w, CELL - 6);
                ctx.fillStyle = "#6f4518";
                ctx.fillRect(x, y + 9, ln.w, 2);
              } else {
                ctx.save();
                ctx.translate(x + ln.w / 2, y + CELL / 2);
                if (ln.speed > 0) { ctx.scale(-1, 1); }
                emojiAt(ctx, ln.emoji, 0, 0, ln.w > 20 ? 20 : 16);
                ctx.restore();
              }
            }
          }
          emojiAt(ctx, dead > 0 ? "💥" : "🦍", px + CELL / 2, row * CELL + CELL / 2, 15);
          hudText(ctx, "LIFE " + Math.max(0, lives) + "   LEVEL " + level, 6, 310);
          if (msg > 0) {
            ctx.fillStyle = "#ffd166";
            ctx.font = "bold 16px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("ゴール！ LEVEL " + level, W / 2, 6.5 * CELL);
          }
        }
      };
    }
  });

  // ---------------------------------------------------------
  // 🔨 ゴリラたたき（もぐらたたき）
  // ---------------------------------------------------------
  register({
    id: "mole",
    name: "ゴリラたたき",
    icon: "&#x1F528;",
    desc: "30秒で顔を出すゴリラをたたきまくろう（💣はダメ）",
    help: "画面の穴をタップ / キーボードはテンキー配置 7 8 9・4 5 6・1 2 3 / P一時停止",
    controls: [],
    keys: { "7": "h0", "8": "h1", "9": "h2", "4": "h3", "5": "h4", "6": "h5", "1": "h6", "2": "h7", "3": "h8" },
    create: function (api) {
      var TIME = 1800, t = 0, spawnT = 0;
      var KIND = {
        gorilla: { emoji: "🦍", pts: 10 },
        monkey: { emoji: "🐒", pts: 30 },
        bomb: { emoji: "💣", pts: -30 }
      };
      var holes = [];
      for (var r = 0; r < 3; r++) {
        for (var c = 0; c < 3; c++) {
          holes.push({ x: 50 + c * 70, y: 100 + r * 78, kind: null, life: 0, max: 0, hit: 0, fx: 0, fxText: "", fxBad: false });
        }
      }
      function spawn() {
        var empty = [], i;
        for (i = 0; i < holes.length; i++) { if (!holes[i].kind && holes[i].hit === 0) { empty.push(i); } }
        if (!empty.length) { return; }
        var h = holes[empty[randInt(0, empty.length - 1)]];
        var roll = Math.random();
        if (roll < 0.15) { h.kind = "bomb"; h.life = 80; }
        else if (roll < 0.32) { h.kind = "monkey"; h.life = 36; }
        else { h.kind = "gorilla"; h.life = Math.round(70 - 30 * (t / TIME)); }
        h.max = h.life;
      }
      function whack(i) {
        var h = holes[i];
        if (!h || !h.kind) { return; }
        var pts = KIND[h.kind].pts;
        api.addScore(pts);
        h.fx = 24;
        h.fxText = (pts > 0 ? "+" : "") + pts;
        h.fxBad = pts < 0;
        h.kind = null;
        h.hit = 10;
      }

      return {
        input: function (action, down) {
          if (down) { whack(parseInt(action.substring(1), 10)); }
        },
        pointer: function (type, x, y) {
          if (type !== "down") { return; }
          for (var i = 0; i < holes.length; i++) {
            var dx = x - holes[i].x, dy = y - holes[i].y;
            if (dx * dx + dy * dy < 34 * 34) { whack(i); return; }
          }
        },
        step: function () {
          t++;
          if (t >= TIME) { api.gameOver("TIME UP"); return; }
          spawnT++;
          var iv = Math.max(16, Math.round(40 - 24 * (t / TIME)));
          if (spawnT >= iv) {
            spawnT = 0;
            spawn();
            if (t > TIME / 2 && Math.random() < 0.3) { spawn(); }
          }
          for (var i = 0; i < holes.length; i++) {
            var h = holes[i];
            if (h.kind) { h.life--; if (h.life <= 0) { h.kind = null; } }
            if (h.hit > 0) { h.hit--; }
            if (h.fx > 0) { h.fx--; }
          }
        },
        draw: function (ctx) {
          var i;
          ctx.fillStyle = "#2d6a4f";
          ctx.fillRect(0, 0, W, H);
          var remain = Math.max(0, Math.ceil((TIME - t) / 60));
          ctx.fillStyle = "#1b4332";
          ctx.fillRect(10, 14, W - 20, 8);
          ctx.fillStyle = remain <= 5 ? "#ff7675" : "#ffd166";
          ctx.fillRect(10, 14, (W - 20) * (1 - t / TIME), 8);
          hudText(ctx, "のこり " + remain + "秒", W / 2, 34, "center");
          for (i = 0; i < holes.length; i++) {
            var h = holes[i];
            ctx.save();
            ctx.translate(h.x, h.y + 18);
            ctx.scale(1, 0.35);
            ctx.fillStyle = "#1b1b1b";
            ctx.beginPath(); ctx.arc(0, 0, 28, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
            if (h.kind) {
              var rise = Math.min(1, (h.max - h.life) / 6, h.life / 6);
              emojiAt(ctx, KIND[h.kind].emoji, h.x, h.y + 14 - 16 * rise, 32);
            }
            if (h.hit > 0) { emojiAt(ctx, "💥", h.x, h.y, 26); }
            if (h.fx > 0) {
              ctx.fillStyle = h.fxBad ? "#ff7675" : "#55efc4";
              ctx.font = "bold 14px sans-serif";
              ctx.textAlign = "center";
              ctx.fillText(h.fxText, h.x, h.y - 26 - (24 - h.fx));
            }
          }
          hudText(ctx, "🦍+10  🐒+30  💣-30", W / 2, 312, "center");
        }
      };
    }
  });

  // ---------------------------------------------------------
  // 💣 UMAスイーパー（マインスイーパー風）
  // ---------------------------------------------------------
  var SWEEP_NUM_COLORS = ["", "#74b9ff", "#55efc4", "#ff7675", "#a29bfe", "#fdcb6e", "#81ecec", "#ffffff", "#b2bec3"];

  register({
    id: "sweeper",
    name: "UMAスイーパー",
    icon: "&#x1F4A3;",
    desc: "数字をヒントに、地雷をふまずに全マスを開けよう",
    help: "タップで開く / 長押し or 旗モードで🚩 / 数字タップで周りを一括オープン / Fで旗モード",
    controls: [{ action: "flag", label: "&#x1F6A9; 旗モード切替" }],
    keys: { "f": "flag", "F": "flag" },
    create: function (api) {
      var COLS = 9, ROWS = 11, CELL = 26, OX = 3, OY = 22, MINES = 14;
      var grid = [], placed = false, flagMode = false, frames = 0, opened = 0, ended = false, press = null;
      var y, x;
      for (y = 0; y < ROWS; y++) {
        var line = [];
        for (x = 0; x < COLS; x++) { line.push({ mine: false, open: false, flag: false, boom: false, n: 0 }); }
        grid.push(line);
      }
      function at(cx, cy) { return (cx >= 0 && cx < COLS && cy >= 0 && cy < ROWS) ? grid[cy][cx] : null; }
      function neighbors(cx, cy, fn) {
        for (var dy = -1; dy <= 1; dy++) {
          for (var dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) { continue; }
            var c = at(cx + dx, cy + dy);
            if (c) { fn(c, cx + dx, cy + dy); }
          }
        }
      }
      function place(sx, sy) {
        var n = 0;
        while (n < MINES) {
          var mx = randInt(0, COLS - 1), my = randInt(0, ROWS - 1);
          if (Math.abs(mx - sx) <= 1 && Math.abs(my - sy) <= 1) { continue; }
          if (grid[my][mx].mine) { continue; }
          grid[my][mx].mine = true;
          n++;
        }
        for (var yy = 0; yy < ROWS; yy++) {
          for (var xx = 0; xx < COLS; xx++) {
            var cnt = 0;
            neighbors(xx, yy, function (c) { if (c.mine) { cnt++; } });
            grid[yy][xx].n = cnt;
          }
        }
        placed = true;
      }
      function lose() { ended = true; api.gameOver(); }
      function win() {
        ended = true;
        api.addScore(Math.max(100, 2000 - Math.floor(frames / 60) * 10));
        api.gameOver("CLEAR!");
      }
      function open(cx, cy) {
        var c = at(cx, cy);
        if (ended || !c || c.open || c.flag) { return; }
        if (!placed) { place(cx, cy); }
        if (c.mine) { c.open = true; c.boom = true; lose(); return; }
        var stack = [[cx, cy]];
        while (stack.length) {
          var p = stack.pop(), cc = at(p[0], p[1]);
          if (!cc || cc.open || cc.flag || cc.mine) { continue; }
          cc.open = true;
          opened++;
          api.addScore(5);
          if (cc.n === 0) {
            neighbors(p[0], p[1], function (nc, nx, ny) { if (!nc.open) { stack.push([nx, ny]); } });
          }
        }
        if (opened === COLS * ROWS - MINES) { win(); }
      }
      function chord(cx, cy) {
        var c = at(cx, cy);
        if (!c.open || c.n === 0) { return; }
        var f = 0;
        neighbors(cx, cy, function (nc) { if (nc.flag) { f++; } });
        if (f !== c.n) { return; }
        neighbors(cx, cy, function (nc, nx, ny) { open(nx, ny); });
      }
      function toggleFlag(cx, cy) {
        var c = at(cx, cy);
        if (c && !c.open) { c.flag = !c.flag; }
      }
      function cellAt(px, py) {
        var cx = Math.floor((px - OX) / CELL), cy = Math.floor((py - OY) / CELL);
        return at(cx, cy) ? [cx, cy] : null;
      }
      function tapCell(cx, cy) {
        if (grid[cy][cx].open) { chord(cx, cy); return; }
        if (flagMode) { toggleFlag(cx, cy); } else { open(cx, cy); }
      }

      return {
        input: function (action, down) { if (down && action === "flag") { flagMode = !flagMode; } },
        pointer: function (type, px, py) {
          if (ended) { return; }
          var cell = cellAt(px, py);
          if (type === "down") { press = cell ? { x: cell[0], y: cell[1], t: 0, done: false } : null; }
          else if (type === "move") {
            if (press && (!cell || cell[0] !== press.x || cell[1] !== press.y)) { press = null; }
          } else if (type === "up") {
            if (press && !press.done) { tapCell(press.x, press.y); }
            press = null;
          }
        },
        step: function () {
          if (placed && !ended) { frames++; }
          if (press && !press.done) {
            press.t++;
            if (press.t >= 24) { press.done = true; toggleFlag(press.x, press.y); }
          }
        },
        draw: function (ctx) {
          var flags = 0, yy, xx;
          for (yy = 0; yy < ROWS; yy++) {
            for (xx = 0; xx < COLS; xx++) {
              var c = grid[yy][xx], cx = OX + xx * CELL, cy = OY + yy * CELL;
              if (c.flag) { flags++; }
              if (c.open) {
                ctx.fillStyle = c.boom ? "#d63031" : "#1a202c";
                ctx.fillRect(cx, cy, CELL - 1, CELL - 1);
                if (c.mine) { emojiAt(ctx, "💣", cx + CELL / 2, cy + CELL / 2 + 1, 15); }
                else if (c.n > 0) {
                  ctx.fillStyle = SWEEP_NUM_COLORS[c.n];
                  ctx.font = "bold 15px sans-serif";
                  ctx.textAlign = "center";
                  ctx.textBaseline = "middle";
                  ctx.fillText(String(c.n), cx + CELL / 2, cy + CELL / 2 + 1);
                }
              } else {
                ctx.fillStyle = "#4a5568";
                ctx.fillRect(cx, cy, CELL - 1, CELL - 1);
                ctx.fillStyle = "rgba(255,255,255,0.18)";
                ctx.fillRect(cx, cy, CELL - 1, 3);
                if (ended && c.mine && !c.flag) { emojiAt(ctx, "💣", cx + CELL / 2, cy + CELL / 2 + 1, 15); }
                else if (c.flag) { emojiAt(ctx, "🚩", cx + CELL / 2, cy + CELL / 2 + 1, 14); }
              }
            }
          }
          if (press && !press.done) {
            ctx.strokeStyle = "#ffd166";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(OX + press.x * CELL + CELL / 2, OY + press.y * CELL + CELL / 2, 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (press.t / 24));
            ctx.stroke();
          }
          hudText(ctx, "💣 " + (MINES - flags) + "   ⏱ " + Math.floor(frames / 60) + "秒", 6, 11);
          hudText(ctx, flagMode ? "🚩 旗モード" : "⛏ 開くモード", W - 6, 11, "right");
          hudText(ctx, "長押しでも🚩", W / 2, 314, "center");
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
