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
  function register(def) {
    GAMES[def.id] = def;
    var at = def.after ? ORDER.indexOf(def.after) : -1;
    if (at >= 0) { ORDER.splice(at + 1, 0, def.id); } else { ORDER.push(def.id); }
  }

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
  var setupState = null; // 設定画面表示中（§150）

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
    if (host.game && typeof host.game.finish === "function") { host.game.finish(host.score); }
    if (host.opts && typeof host.opts.onEnd === "function") {
      var earned = host.opts.onEnd(host.gameId, host.score);
      host.earned = typeof earned === "number" ? earned : null; // §153 v0.72: 獲得メダル数
    }
  }

  function renderSysButtons() {
    if (!host) { return; }
    var sys = host.sysEl;
    if (host.over) {
      sys.innerHTML =
        '<button class="modal-btn" data-sys="retry">&#x1F501; もう一度</button>' +
        (host.def.setup ? '<button class="modal-btn" data-sys="setup">&#x2699;&#xFE0F; 設定・録音</button>' : '') +
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
    } else if (kind === "setup") {
      var g2 = host.gameId, root2 = host.root, opts2 = host.opts;
      if (host.score > host.hi) { opts2.hiScore = host.score; }
      opts2.config = null;
      start(g2, root2, opts2);
    } else if (kind === "menu") {
      exitToMenu();
    }
  }

  function exitToMenu() {
    var opts = host ? host.opts : (setupState ? setupState.opts : null);
    if (!opts) { return; }
    stop();
    if (typeof opts.onExit === "function") { opts.onExit(); }
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

  // ゲーム中のキーはフィールド側（移動・BGM切替）へ届けない（capture で受けて止める）
  function onKeyDown(ev) {
    if (!host) { return; }
    ev.stopPropagation();
    if (ev.key === "p" || ev.key === "P") { togglePause(); return; }
    var act = host.def.keys[ev.key];
    if (!act) { return; }
    if (ev.cancelable) { ev.preventDefault(); }
    if (ev.repeat) { return; }
    send(act, true);
  }
  function onKeyUp(ev) {
    if (!host) { return; }
    ev.stopPropagation();
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
      if (host.over && host.earned !== null && host.earned !== undefined) {
        ctx.fillStyle = "#ffd166";
        ctx.fillText("🪙 メダル +" + host.earned + "枚", W / 2, H / 2 + 56);
      }
    }
  }

  function start(gameId, rootEl, opts) {
    var def = GAMES[gameId];
    if (!def || !rootEl) { return false; }
    stop();
    opts = opts || {};
    // 設定画面つきのゲーム（§150）: 設定が決まるまで本編を始めない
    if (def.setup && !opts.config) {
      setupState = { root: rootEl, opts: opts, gameId: gameId };
      def.setup(rootEl, {
        soundEnabled: !!opts.soundEnabled,
        hiScore: opts.hiScore || 0,
        done: function (cfg) {
          opts.config = cfg;
          start(gameId, rootEl, opts);
        },
        back: exitToMenu
      });
      return true;
    }
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
    host.game = def.create(api, opts.config || null);
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
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    document.addEventListener("visibilitychange", onVisibility);
    host.rafId = raf(frame);
    return true;
  }

  function stop() {
    melodyStopPlayback();
    if (setupState) {
      var sr = setupState.root;
      setupState = null;
      if (sr) { sr.innerHTML = ""; }
    }
    if (!host) { return; }
    if (host.rafId !== null) { caf(host.rafId); }
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("keyup", onKeyUp, true);
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
  // 🔢 ゴリラ2048
  // ---------------------------------------------------------
  var TILE_COLORS = {
    2: "#eee4da", 4: "#ede0c8", 8: "#f2b179", 16: "#f59563", 32: "#f67c5f", 64: "#f65e3b",
    128: "#edcf72", 256: "#edcc61", 512: "#edc850", 1024: "#edc53f", 2048: "#edc22e"
  };

  register({
    id: "g2048",
    name: "ゴリラ2048",
    icon: "&#x1F522;",
    desc: "同じ数字をくっつけて2048をめざそう",
    help: "スワイプ / 矢印・WASD でタイルを寄せる / P一時停止",
    controls: DIR_CONTROLS,
    keys: DIR_KEYS,
    create: function (api) {
      var N = 4, CELL = 52, GAP = 4, OX = 6, OY = 50;
      var board = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
      var sx = 0, sy = 0, reached = false, msg = 0;

      function addTile() {
        var e = [], x, y;
        for (y = 0; y < N; y++) { for (x = 0; x < N; x++) { if (!board[y][x]) { e.push([x, y]); } } }
        if (!e.length) { return; }
        var p = e[randInt(0, e.length - 1)];
        board[p[1]][p[0]] = Math.random() < 0.1 ? 4 : 2;
      }
      function slideLine(line) {
        var vals = [], out = [], gained = 0, i;
        for (i = 0; i < N; i++) { if (line[i]) { vals.push(line[i]); } }
        for (i = 0; i < vals.length; i++) {
          if (i + 1 < vals.length && vals[i] === vals[i + 1]) { out.push(vals[i] * 2); gained += vals[i] * 2; i++; }
          else { out.push(vals[i]); }
        }
        while (out.length < N) { out.push(0); }
        return { line: out, gained: gained };
      }
      function canMove() {
        for (var y = 0; y < N; y++) {
          for (var x = 0; x < N; x++) {
            if (!board[y][x]) { return true; }
            if (x + 1 < N && board[y][x] === board[y][x + 1]) { return true; }
            if (y + 1 < N && board[y][x] === board[y + 1][x]) { return true; }
          }
        }
        return false;
      }
      function move(dir) {
        var moved = false, total = 0, k, i;
        for (k = 0; k < N; k++) {
          var coords = [];
          for (i = 0; i < N; i++) {
            if (dir === "left") { coords.push([i, k]); }
            else if (dir === "right") { coords.push([N - 1 - i, k]); }
            else if (dir === "up") { coords.push([k, i]); }
            else { coords.push([k, N - 1 - i]); }
          }
          var line = [];
          for (i = 0; i < N; i++) { line.push(board[coords[i][1]][coords[i][0]]); }
          var res = slideLine(line);
          for (i = 0; i < N; i++) {
            var c = coords[i];
            if (board[c[1]][c[0]] !== res.line[i]) { moved = true; }
            board[c[1]][c[0]] = res.line[i];
          }
          total += res.gained;
        }
        if (!moved) { return; }
        api.addScore(total);
        addTile();
        if (!reached) {
          for (var y = 0; y < N; y++) { for (var x = 0; x < N; x++) { if (board[y][x] >= 2048) { reached = true; msg = 150; } } }
        }
        if (!canMove()) { api.gameOver(); }
      }
      function maxTile() {
        var m = 0;
        for (var y = 0; y < N; y++) { for (var x = 0; x < N; x++) { if (board[y][x] > m) { m = board[y][x]; } } }
        return m;
      }

      addTile();
      addTile();

      return {
        input: function (action, down) { if (down) { move(action); } },
        pointer: function (type, x, y) {
          if (type === "down") { sx = x; sy = y; }
          else if (type === "up") {
            var d = swipeDir(sx, sy, x, y);
            if (d !== "tap") { move(d); }
          }
        },
        step: function () { if (msg > 0) { msg--; } },
        draw: function (ctx) {
          ctx.fillStyle = "#bbada0";
          ctx.fillRect(OX - GAP, OY - GAP, N * (CELL + GAP) + GAP, N * (CELL + GAP) + GAP);
          for (var y = 0; y < N; y++) {
            for (var x = 0; x < N; x++) {
              var v = board[y][x], cx = OX + x * (CELL + GAP), cy = OY + y * (CELL + GAP);
              ctx.fillStyle = v ? (TILE_COLORS[v] || "#3c3a32") : "#cdc1b4";
              ctx.fillRect(cx, cy, CELL, CELL);
              if (v) {
                var digits = String(v).length;
                ctx.fillStyle = v <= 4 ? "#776e65" : "#ffffff";
                ctx.font = "bold " + (digits <= 2 ? 24 : (digits === 3 ? 20 : (digits === 4 ? 16 : 13))) + "px sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(String(v), cx + CELL / 2, cy + CELL / 2 + 1);
              }
            }
          }
          hudText(ctx, "最大タイル " + maxTile(), 6, 300);
          if (msg > 0) { hudText(ctx, "🎉 2048 達成！ まだ続けられるよ", W / 2, 30, "center"); }
          else { hudText(ctx, "スワイプで寄せて、同じ数字を合体！", W / 2, 30, "center"); }
        }
      };
    }
  });

  // ---------------------------------------------------------
  // ⚫ ゴリラリバーシ（CPU対戦）
  // ---------------------------------------------------------
  var REVERSI_WEIGHTS = [
    [100, -20, 10, 5, 5, 10, -20, 100],
    [-20, -50, -2, -2, -2, -2, -50, -20],
    [10, -2, 1, 1, 1, 1, -2, 10],
    [5, -2, 1, 0, 0, 1, -2, 5],
    [5, -2, 1, 0, 0, 1, -2, 5],
    [10, -2, 1, 1, 1, 1, -2, 10],
    [-20, -50, -2, -2, -2, -2, -50, -20],
    [100, -20, 10, 5, 5, 10, -20, 100]
  ];
  var DIRS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  register({
    id: "reversi",
    name: "ゴリラリバーシ",
    icon: "&#x26AB;",
    desc: "CPUゴリラとリバーシ対決。石を多く取ろう",
    help: "置きたいマスをタップ（点のあるマスに置ける） / P一時停止",
    controls: [],
    keys: {},
    create: function (api) {
      var N = 8, CELL = 28, OX = 8, OY = 44, BK = 1, WH = 2;
      var board = [], y, x;
      for (y = 0; y < N; y++) { board.push([0, 0, 0, 0, 0, 0, 0, 0]); }
      board[3][3] = WH; board[4][4] = WH; board[3][4] = BK; board[4][3] = BK;
      var turn = BK, cpuT = 0, ended = false, lastMove = null, msg = "", msgT = 0;

      function inside(cx, cy) { return cx >= 0 && cx < N && cy >= 0 && cy < N; }
      function flips(cx, cy, who) {
        if (board[cy][cx]) { return []; }
        var opp = 3 - who, all = [];
        for (var d = 0; d < DIRS8.length; d++) {
          var tx = cx + DIRS8[d][0], ty = cy + DIRS8[d][1], line = [];
          while (inside(tx, ty) && board[ty][tx] === opp) { line.push([tx, ty]); tx += DIRS8[d][0]; ty += DIRS8[d][1]; }
          if (line.length && inside(tx, ty) && board[ty][tx] === who) { all = all.concat(line); }
        }
        return all;
      }
      function moves(who) {
        var out = [];
        for (var yy = 0; yy < N; yy++) {
          for (var xx = 0; xx < N; xx++) {
            var f = flips(xx, yy, who);
            if (f.length) { out.push({ x: xx, y: yy, f: f }); }
          }
        }
        return out;
      }
      function play(m, who) {
        board[m.y][m.x] = who;
        for (var i = 0; i < m.f.length; i++) { board[m.f[i][1]][m.f[i][0]] = who; }
        lastMove = [m.x, m.y];
      }
      function count(who) {
        var n = 0;
        for (var yy = 0; yy < N; yy++) { for (var xx = 0; xx < N; xx++) { if (board[yy][xx] === who) { n++; } } }
        return n;
      }
      function finish() {
        ended = true;
        var me = count(BK), cp = count(WH);
        api.addScore(me * 10 + (me > cp ? 500 : 0));
        api.gameOver(me > cp ? "WIN!" : (me < cp ? "LOSE" : "DRAW"));
      }
      function nextTurn() {
        var other = 3 - turn;
        if (moves(other).length) { turn = other; }
        else if (moves(turn).length) { msg = other === BK ? "あなたはパス" : "CPUはパス"; msgT = 90; }
        else { finish(); return; }
        if (turn === WH) { cpuT = 30; }
      }
      function cpuMove() {
        var ms = moves(WH);
        if (!ms.length) { nextTurn(); return; }
        var best = null, bestScore = -9999;
        for (var i = 0; i < ms.length; i++) {
          var sc = REVERSI_WEIGHTS[ms[i].y][ms[i].x] + ms[i].f.length * 2 + Math.random() * 3;
          if (sc > bestScore) { bestScore = sc; best = ms[i]; }
        }
        play(best, WH);
        nextTurn();
      }

      return {
        input: function () {},
        pointer: function (type, px, py) {
          if (type !== "down" || ended || turn !== BK) { return; }
          var cx = Math.floor((px - OX) / CELL), cy = Math.floor((py - OY) / CELL);
          if (!inside(cx, cy)) { return; }
          var f = flips(cx, cy, BK);
          if (!f.length) { return; }
          play({ x: cx, y: cy, f: f }, BK);
          nextTurn();
        },
        step: function () {
          if (msgT > 0) { msgT--; }
          if (!ended && turn === WH) {
            if (cpuT > 0) { cpuT--; } else { cpuMove(); }
          }
        },
        draw: function (ctx) {
          var i;
          ctx.fillStyle = "#1e7a46";
          ctx.fillRect(OX, OY, N * CELL, N * CELL);
          ctx.strokeStyle = "#0b3d20";
          ctx.lineWidth = 1;
          for (i = 0; i <= N; i++) {
            ctx.beginPath(); ctx.moveTo(OX + i * CELL + 0.5, OY); ctx.lineTo(OX + i * CELL + 0.5, OY + N * CELL); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(OX, OY + i * CELL + 0.5); ctx.lineTo(OX + N * CELL, OY + i * CELL + 0.5); ctx.stroke();
          }
          var hints = (!ended && turn === BK) ? moves(BK) : [];
          ctx.fillStyle = "rgba(255,255,255,0.25)";
          for (i = 0; i < hints.length; i++) {
            ctx.beginPath(); ctx.arc(OX + hints[i].x * CELL + CELL / 2, OY + hints[i].y * CELL + CELL / 2, 4, 0, Math.PI * 2); ctx.fill();
          }
          for (var yy = 0; yy < N; yy++) {
            for (var xx = 0; xx < N; xx++) {
              if (!board[yy][xx]) { continue; }
              ctx.fillStyle = board[yy][xx] === BK ? "#111111" : "#f5f6fa";
              ctx.beginPath(); ctx.arc(OX + xx * CELL + CELL / 2, OY + yy * CELL + CELL / 2, 11, 0, Math.PI * 2); ctx.fill();
            }
          }
          if (lastMove) {
            ctx.fillStyle = "#ff7675";
            ctx.beginPath(); ctx.arc(OX + lastMove[0] * CELL + CELL / 2, OY + lastMove[1] * CELL + CELL / 2, 3, 0, Math.PI * 2); ctx.fill();
          }
          hudText(ctx, "⚫ あなた " + count(BK) + "    ⚪ CPU🦍 " + count(WH), W / 2, 24, "center");
          hudText(ctx, ended ? "おしまい" : (turn === BK ? "あなたの番です" : "CPU考え中…"), W / 2, 290, "center");
          if (msgT > 0) { hudText(ctx, msg, W / 2, 306, "center"); }
        }
      };
    }
  });

  // ---------------------------------------------------------
  // 🧩 スライドパズル（15パズル）
  // ---------------------------------------------------------
  register({
    id: "slide",
    name: "スライドパズル",
    icon: "&#x1F9E9;",
    desc: "1〜15のタイルを順番どおりに並べよう",
    help: "空きマスと同じ列・行のタイルをタップ / 矢印・WASDでも動かせる / P一時停止",
    controls: DIR_CONTROLS,
    keys: DIR_KEYS,
    create: function (api) {
      var N = 4, CELL = 54, GAP = 4, OX = 4, OY = 52;
      var tiles = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 0];
      var movesN = 0, frames = 0, started = false, done = false;

      function blank() { return tiles.indexOf(0); }
      function solved() {
        for (var i = 0; i < 15; i++) { if (tiles[i] !== i + 1) { return false; } }
        return true;
      }
      function slideAt(x, y) {
        var b = blank(), bx = b % N, by = Math.floor(b / N), c;
        if (x < 0 || x >= N || y < 0 || y >= N || (x === bx && y === by)) { return false; }
        if (y === by) {
          var st = x < bx ? -1 : 1;
          for (c = bx; c !== x; c += st) { tiles[by * N + c] = tiles[by * N + c + st]; }
        } else if (x === bx) {
          var sv = y < by ? -1 : 1;
          for (c = by; c !== y; c += sv) { tiles[c * N + bx] = tiles[(c + sv) * N + bx]; }
        } else {
          return false;
        }
        tiles[y * N + x] = 0;
        return true;
      }
      function dirTarget(dir) {
        var b = blank(), bx = b % N, by = Math.floor(b / N);
        if (dir === "left") { return [bx + 1, by]; }
        if (dir === "right") { return [bx - 1, by]; }
        if (dir === "up") { return [bx, by + 1]; }
        return [bx, by - 1];
      }
      function userMove(x, y) {
        if (done || !slideAt(x, y)) { return; }
        started = true;
        movesN++;
        if (solved()) {
          done = true;
          api.addScore(Math.max(100, 5000 - movesN * 10 - Math.floor(frames / 60) * 5));
          api.gameOver("CLEAR!");
        }
      }

      var dirs = ["left", "right", "up", "down"];
      do {
        for (var s = 0; s < 200; s++) {
          var t = dirTarget(dirs[randInt(0, 3)]);
          slideAt(t[0], t[1]);
        }
      } while (solved());

      return {
        input: function (action, down) {
          if (!down) { return; }
          var t2 = dirTarget(action);
          userMove(t2[0], t2[1]);
        },
        pointer: function (type, px, py) {
          if (type !== "down") { return; }
          userMove(Math.floor((px - OX) / (CELL + GAP)), Math.floor((py - OY) / (CELL + GAP)));
        },
        step: function () { if (started && !done) { frames++; } },
        draw: function (ctx) {
          ctx.fillStyle = "#2d3436";
          ctx.fillRect(OX - GAP, OY - GAP, N * (CELL + GAP) + GAP, N * (CELL + GAP) + GAP);
          for (var i = 0; i < tiles.length; i++) {
            var v = tiles[i];
            if (!v) { continue; }
            var cx = OX + (i % N) * (CELL + GAP), cy = OY + Math.floor(i / N) * (CELL + GAP);
            ctx.fillStyle = v === i + 1 ? "#00b894" : "#0984e3";
            ctx.fillRect(cx, cy, CELL, CELL);
            ctx.fillStyle = "rgba(255,255,255,0.2)";
            ctx.fillRect(cx, cy, CELL, 4);
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 22px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(String(v), cx + CELL / 2, cy + CELL / 2 + 1);
          }
          hudText(ctx, "手数 " + movesN + "   ⏱ " + Math.floor(frames / 60) + "秒", W / 2, 30, "center");
          hudText(ctx, "緑＝正しい位置のタイル", W / 2, 300, "center");
        }
      };
    }
  });

  // ---------------------------------------------------------
  // 🃏 UMAしんけいすいじゃく
  // ---------------------------------------------------------
  var MEMORY_EMOJIS = ["🦍", "🐒", "🦕", "👽", "🐙", "🦄", "🐉", "🦖", "🐸", "🦉"];

  register({
    id: "memory",
    name: "UMAしんけいすいじゃく",
    icon: "&#x1F0CF;",
    desc: "同じUMAのカードを2枚そろえて全部とろう",
    help: "カードをタップしてめくる / P一時停止",
    controls: [],
    keys: {},
    create: function (api) {
      var COLS = 4, ROWS = 5, CW = 54, CH = 50, GAP = 4, OX = 7, OY = 30;
      var cards = [], i;
      for (i = 0; i < MEMORY_EMOJIS.length; i++) {
        cards.push({ e: MEMORY_EMOJIS[i], open: false, taken: false });
        cards.push({ e: MEMORY_EMOJIS[i], open: false, taken: false });
      }
      for (i = cards.length - 1; i > 0; i--) { var j = randInt(0, i), tmp = cards[i]; cards[i] = cards[j]; cards[j] = tmp; }
      var first = -1, second = -1, waitT = 0, misses = 0, combo = 0, frames = 0, started = false, pairs = 0;

      return {
        input: function () {},
        pointer: function (type, px, py) {
          if (type !== "down" || waitT > 0) { return; }
          var cx = Math.floor((px - OX) / (CW + GAP)), cy = Math.floor((py - OY) / (CH + GAP));
          if (cx < 0 || cx >= COLS || cy < 0 || cy >= ROWS) { return; }
          var idx = cy * COLS + cx, c = cards[idx];
          if (c.open || c.taken) { return; }
          c.open = true;
          started = true;
          if (first < 0) { first = idx; return; }
          second = idx;
          if (cards[first].e === c.e) {
            cards[first].taken = true;
            c.taken = true;
            combo++;
            api.addScore(100 + (combo - 1) * 50);
            pairs++;
            first = -1; second = -1;
            if (pairs === MEMORY_EMOJIS.length) {
              api.addScore(Math.max(0, 1000 - misses * 30 - Math.floor(frames / 60) * 5));
              api.gameOver("CLEAR!");
            }
          } else {
            misses++;
            combo = 0;
            waitT = 42;
          }
        },
        step: function () {
          if (started && pairs < MEMORY_EMOJIS.length) { frames++; }
          if (waitT > 0) {
            waitT--;
            if (waitT === 0) {
              cards[first].open = false;
              cards[second].open = false;
              first = -1; second = -1;
            }
          }
        },
        draw: function (ctx) {
          for (var k = 0; k < cards.length; k++) {
            var c = cards[k], cx = OX + (k % COLS) * (CW + GAP), cy = OY + Math.floor(k / COLS) * (CH + GAP);
            ctx.globalAlpha = c.taken ? 0.35 : 1;
            if (c.open || c.taken) {
              ctx.fillStyle = "#dfe6e9";
              ctx.fillRect(cx, cy, CW, CH);
              emojiAt(ctx, c.e, cx + CW / 2, cy + CH / 2 + 1, 28);
            } else {
              ctx.fillStyle = "#6c5ce7";
              ctx.fillRect(cx, cy, CW, CH);
              ctx.strokeStyle = "#a29bfe";
              ctx.lineWidth = 2;
              ctx.strokeRect(cx + 4, cy + 4, CW - 8, CH - 8);
              ctx.fillStyle = "#ffffff";
              ctx.font = "bold 20px sans-serif";
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText("?", cx + CW / 2, cy + CH / 2 + 1);
            }
            ctx.globalAlpha = 1;
          }
          hudText(ctx, "ミス " + misses + "   ⏱ " + Math.floor(frames / 60) + "秒" + (combo > 1 ? "   🔥コンボ×" + combo : ""), W / 2, 14, "center");
          hudText(ctx, "のこり " + (MEMORY_EMOJIS.length - pairs) + "ペア", W / 2, 306, "center");
        }
      };
    }
  });

  // ---------------------------------------------------------
  // ☄️ メテオシューター（アステロイド風）
  // ---------------------------------------------------------
  var METEOR_SIZES = { 3: { r: 20, pts: 20 }, 2: { r: 12, pts: 50 }, 1: { r: 6, pts: 100 } };

  register({
    id: "meteor",
    name: "メテオシューター",
    icon: "&#x2604;&#xFE0F;",
    desc: "宇宙船をあやつって隕石をこなごなにしよう",
    help: "←→回転 / ↑加速 / Space発射 / P一時停止",
    controls: [
      { action: "rotL", label: "&#x21BA;" },
      { action: "rotR", label: "&#x21BB;" },
      { action: "thrust", label: "&#x1F525;" },
      { action: "fire", label: "&#x1F52B;" }
    ],
    keys: {
      "ArrowLeft": "rotL", "a": "rotL", "A": "rotL",
      "ArrowRight": "rotR", "d": "rotR", "D": "rotR",
      "ArrowUp": "thrust", "w": "thrust", "W": "thrust",
      " ": "fire", "z": "fire", "Z": "fire"
    },
    create: function (api) {
      var ship = { x: W / 2, y: H / 2, a: -Math.PI / 2, vx: 0, vy: 0, inv: 120 };
      var held = { rotL: false, rotR: false, thrust: false, fire: false };
      var bullets = [], rocks = [], parts = [];
      var lives = 3, wave = 0, fireCD = 0, dead = 0;

      function makeRock(x, y, s) {
        var a = Math.random() * Math.PI * 2;
        var sp = (0.4 + Math.random() * 0.6) * (1 + (3 - s) * 0.4) * (1 + wave * 0.05);
        var shape = [];
        for (var i = 0; i < 10; i++) { shape.push(0.75 + Math.random() * 0.4); }
        return { x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, s: s, r: METEOR_SIZES[s].r, rot: 0, vr: (Math.random() - 0.5) * 0.05, shape: shape };
      }
      function spawnWave() {
        wave++;
        for (var i = 0; i < 3 + wave; i++) {
          var x, y, tries = 0;
          do { x = Math.random() * W; y = Math.random() * H; tries++; }
          while (tries < 50 && Math.sqrt((x - ship.x) * (x - ship.x) + (y - ship.y) * (y - ship.y)) < 80);
          rocks.push(makeRock(x, y, 3));
        }
      }
      function wrap(o) {
        if (o.x < 0) { o.x += W; } else if (o.x > W) { o.x -= W; }
        if (o.y < 0) { o.y += H; } else if (o.y > H) { o.y -= H; }
      }
      function burst(x, y, n, col) {
        for (var i = 0; i < n; i++) {
          var a = Math.random() * Math.PI * 2, sp = 0.5 + Math.random() * 2;
          parts.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 30, col: col });
        }
      }
      function dist(ax, ay, bx, by) { return Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by)); }

      spawnWave();

      return {
        input: function (action, down) { held[action] = down; },
        step: function () {
          var i, k;
          for (i = parts.length - 1; i >= 0; i--) {
            parts[i].x += parts[i].vx; parts[i].y += parts[i].vy; parts[i].t--;
            if (parts[i].t <= 0) { parts.splice(i, 1); }
          }
          if (dead > 0) {
            dead--;
            if (dead === 0) {
              if (lives <= 0) { api.gameOver(); return; }
              ship.x = W / 2; ship.y = H / 2; ship.vx = 0; ship.vy = 0; ship.a = -Math.PI / 2; ship.inv = 120;
            }
          } else {
            if (held.rotL) { ship.a -= 0.07; }
            if (held.rotR) { ship.a += 0.07; }
            if (held.thrust) { ship.vx += Math.cos(ship.a) * 0.08; ship.vy += Math.sin(ship.a) * 0.08; }
            ship.vx *= 0.992; ship.vy *= 0.992;
            var sp = Math.sqrt(ship.vx * ship.vx + ship.vy * ship.vy);
            if (sp > 4) { ship.vx = ship.vx / sp * 4; ship.vy = ship.vy / sp * 4; }
            ship.x += ship.vx; ship.y += ship.vy;
            wrap(ship);
            if (fireCD > 0) { fireCD--; }
            if (held.fire && fireCD === 0 && bullets.length < 4) {
              bullets.push({ x: ship.x + Math.cos(ship.a) * 10, y: ship.y + Math.sin(ship.a) * 10, vx: Math.cos(ship.a) * 5 + ship.vx, vy: Math.sin(ship.a) * 5 + ship.vy, life: 55 });
              fireCD = 10;
            }
            if (ship.inv > 0) { ship.inv--; }
          }
          for (i = bullets.length - 1; i >= 0; i--) {
            var b = bullets[i];
            b.x += b.vx; b.y += b.vy; b.life--;
            wrap(b);
            if (b.life <= 0) { bullets.splice(i, 1); }
          }
          for (k = 0; k < rocks.length; k++) {
            rocks[k].x += rocks[k].vx; rocks[k].y += rocks[k].vy; rocks[k].rot += rocks[k].vr;
            wrap(rocks[k]);
          }
          for (i = bullets.length - 1; i >= 0; i--) {
            for (k = rocks.length - 1; k >= 0; k--) {
              var r = rocks[k];
              if (dist(bullets[i].x, bullets[i].y, r.x, r.y) < r.r) {
                api.addScore(METEOR_SIZES[r.s].pts);
                burst(r.x, r.y, 6 + r.s * 3, "#b2bec3");
                rocks.splice(k, 1);
                if (r.s > 1) { rocks.push(makeRock(r.x, r.y, r.s - 1)); rocks.push(makeRock(r.x, r.y, r.s - 1)); }
                bullets.splice(i, 1);
                break;
              }
            }
          }
          if (dead === 0 && ship.inv === 0) {
            for (k = 0; k < rocks.length; k++) {
              if (dist(ship.x, ship.y, rocks[k].x, rocks[k].y) < rocks[k].r + 6) {
                lives--;
                dead = 60;
                burst(ship.x, ship.y, 24, "#74b9ff");
                break;
              }
            }
          }
          if (rocks.length === 0) { spawnWave(); ship.inv = Math.max(ship.inv, 90); }
        },
        draw: function (ctx) {
          var i, k;
          ctx.strokeStyle = "#b2bec3";
          ctx.lineWidth = 1.5;
          for (k = 0; k < rocks.length; k++) {
            var r = rocks[k];
            ctx.beginPath();
            for (i = 0; i < r.shape.length; i++) {
              var ang = r.rot + i / r.shape.length * Math.PI * 2, rr = r.r * r.shape[i];
              var px = r.x + Math.cos(ang) * rr, py = r.y + Math.sin(ang) * rr;
              if (i === 0) { ctx.moveTo(px, py); } else { ctx.lineTo(px, py); }
            }
            ctx.closePath();
            ctx.stroke();
          }
          for (i = 0; i < parts.length; i++) {
            ctx.fillStyle = parts[i].col;
            ctx.globalAlpha = parts[i].t / 30;
            ctx.fillRect(parts[i].x, parts[i].y, 2, 2);
          }
          ctx.globalAlpha = 1;
          ctx.fillStyle = "#ffffff";
          for (i = 0; i < bullets.length; i++) { ctx.fillRect(bullets[i].x - 1, bullets[i].y - 1, 2, 2); }
          if (dead === 0 && (ship.inv === 0 || Math.floor(ship.inv / 6) % 2 === 0)) {
            var c = Math.cos(ship.a), s = Math.sin(ship.a);
            ctx.strokeStyle = "#74b9ff";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(ship.x + c * 10, ship.y + s * 10);
            ctx.lineTo(ship.x - c * 7 - s * 6, ship.y - s * 7 + c * 6);
            ctx.lineTo(ship.x - c * 4, ship.y - s * 4);
            ctx.lineTo(ship.x - c * 7 + s * 6, ship.y - s * 7 - c * 6);
            ctx.closePath();
            ctx.stroke();
            if (held.thrust) {
              ctx.strokeStyle = "#fdcb6e";
              ctx.beginPath();
              ctx.moveTo(ship.x - c * 5, ship.y - s * 5);
              ctx.lineTo(ship.x - c * (11 + Math.random() * 4), ship.y - s * (11 + Math.random() * 4));
              ctx.stroke();
            }
          }
          hudText(ctx, "LIFE " + Math.max(0, lives) + "   WAVE " + wave, 6, 312);
        }
      };
    }
  });

  // ---------------------------------------------------------
  // 🍌 バナナディフェンス（ミサイルコマンド風）
  // ---------------------------------------------------------
  register({
    id: "defense",
    name: "バナナディフェンス",
    icon: "&#x1F34C;",
    desc: "落ちてくるミサイルを迎撃してバナナ倉庫を守ろう",
    help: "迎撃したい場所をタップ（そこで爆発する） / P一時停止",
    controls: [],
    keys: {},
    create: function (api) {
      var BASE = { x: 120, y: 292 }, GROUND = 302;
      var stores = [{ x: 30, alive: true }, { x: 75, alive: true }, { x: 165, alive: true }, { x: 210, alive: true }];
      var enemies = [], shots = [], booms = [];
      var wave = 0, toSpawn = 0, spawnT = 0, ammo = 0, betweenT = 0, msg = "", msgT = 0;

      function aliveStores() {
        var out = [];
        for (var i = 0; i < stores.length; i++) { if (stores[i].alive) { out.push(stores[i]); } }
        return out;
      }
      function startWave() {
        wave++;
        toSpawn = 6 + wave * 2;
        ammo = 20 + wave;
        spawnT = 60;
        msg = "WAVE " + wave;
        msgT = 90;
      }
      function spawnEnemy() {
        var ts = aliveStores();
        if (!ts.length) { return; }
        var t = ts[randInt(0, ts.length - 1)], sx = randInt(10, W - 10);
        enemies.push({ sx: sx, sy: 0, x: sx, y: 0, tx: t.x, ty: GROUND - 4, sp: 0.35 + wave * 0.07 });
      }

      startWave();

      return {
        input: function () {},
        pointer: function (type, px, py) {
          if (type !== "down" || ammo <= 0 || betweenT > 0 || py > 270) { return; }
          shots.push({ x: BASE.x, y: BASE.y - 6, tx: px, ty: py, sp: 4.5 });
          ammo--;
        },
        step: function () {
          var i, k, dx, dy, d;
          if (msgT > 0) { msgT--; }
          if (betweenT > 0) {
            betweenT--;
            if (betweenT === 0) { startWave(); }
            return;
          }
          if (toSpawn > 0) {
            spawnT--;
            if (spawnT <= 0) {
              spawnEnemy();
              toSpawn--;
              spawnT = Math.max(20, 90 - wave * 8) + randInt(0, 30);
            }
          }
          for (i = shots.length - 1; i >= 0; i--) {
            var s = shots[i];
            dx = s.tx - s.x; dy = s.ty - s.y; d = Math.sqrt(dx * dx + dy * dy);
            if (d <= s.sp) {
              booms.push({ x: s.tx, y: s.ty, t: 0, max: 40, r: 0, enemy: false });
              shots.splice(i, 1);
            } else {
              s.x += dx / d * s.sp; s.y += dy / d * s.sp;
            }
          }
          for (i = booms.length - 1; i >= 0; i--) {
            var bm = booms[i];
            bm.t++;
            bm.r = (bm.enemy ? 16 : 26) * Math.sin(Math.PI * bm.t / bm.max);
            if (bm.t >= bm.max) { booms.splice(i, 1); }
          }
          for (i = enemies.length - 1; i >= 0; i--) {
            var e = enemies[i];
            var hit = false;
            for (k = 0; k < booms.length; k++) {
              if (booms[k].enemy) { continue; }
              dx = e.x - booms[k].x; dy = e.y - booms[k].y;
              if (dx * dx + dy * dy < booms[k].r * booms[k].r) { hit = true; break; }
            }
            if (hit) { enemies.splice(i, 1); api.addScore(25); continue; }
            dx = e.tx - e.x; dy = e.ty - e.y; d = Math.sqrt(dx * dx + dy * dy);
            if (d <= e.sp) {
              for (k = 0; k < stores.length; k++) { if (stores[k].x === e.tx) { stores[k].alive = false; } }
              booms.push({ x: e.tx, y: GROUND - 6, t: 0, max: 30, r: 0, enemy: true });
              enemies.splice(i, 1);
              if (!aliveStores().length) { api.gameOver(); return; }
            } else {
              e.x += dx / d * e.sp; e.y += dy / d * e.sp;
            }
          }
          if (toSpawn === 0 && enemies.length === 0 && shots.length === 0) {
            var bonus = aliveStores().length * 100 + ammo * 5;
            api.addScore(bonus);
            msg = "WAVE CLEAR! +" + bonus;
            msgT = 120;
            betweenT = 120;
          }
        },
        draw: function (ctx) {
          var i;
          ctx.fillStyle = "#2d3436";
          ctx.fillRect(0, GROUND, W, H - GROUND);
          for (i = 0; i < stores.length; i++) {
            if (stores[i].alive) { emojiAt(ctx, "🍌", stores[i].x, GROUND - 8, 18); }
            else { ctx.fillStyle = "#636e72"; ctx.fillRect(stores[i].x - 9, GROUND - 4, 18, 4); }
          }
          ctx.fillStyle = "#74b9ff";
          ctx.beginPath();
          ctx.moveTo(BASE.x, BASE.y - 10); ctx.lineTo(BASE.x + 10, GROUND); ctx.lineTo(BASE.x - 10, GROUND);
          ctx.closePath();
          ctx.fill();
          ctx.lineWidth = 1.5;
          for (i = 0; i < enemies.length; i++) {
            var e = enemies[i];
            ctx.strokeStyle = "rgba(255,118,117,0.7)";
            ctx.beginPath(); ctx.moveTo(e.sx, e.sy); ctx.lineTo(e.x, e.y); ctx.stroke();
            ctx.fillStyle = "#ff7675";
            ctx.fillRect(e.x - 1.5, e.y - 1.5, 3, 3);
          }
          for (i = 0; i < shots.length; i++) {
            var s = shots[i];
            ctx.strokeStyle = "rgba(116,185,255,0.8)";
            ctx.beginPath(); ctx.moveTo(BASE.x, BASE.y - 6); ctx.lineTo(s.x, s.y); ctx.stroke();
            ctx.strokeStyle = "#ffffff";
            ctx.beginPath();
            ctx.moveTo(s.tx - 3, s.ty - 3); ctx.lineTo(s.tx + 3, s.ty + 3);
            ctx.moveTo(s.tx + 3, s.ty - 3); ctx.lineTo(s.tx - 3, s.ty + 3);
            ctx.stroke();
          }
          for (i = 0; i < booms.length; i++) {
            ctx.fillStyle = booms[i].enemy ? "rgba(255,118,117,0.7)" : "rgba(253,203,110,0.75)";
            ctx.beginPath(); ctx.arc(booms[i].x, booms[i].y, Math.max(0, booms[i].r), 0, Math.PI * 2); ctx.fill();
          }
          hudText(ctx, "WAVE " + wave + "   弾 " + ammo, 6, 12);
          if (msgT > 0) { hudText(ctx, msg, W / 2, 140, "center"); }
        }
      };
    }
  });

  // ---------------------------------------------------------
  // 🎹 メロディくずし（§150）: サウンドエンジン・スケール・録音
  // arcade.js 専用の AudioContext。ゲーム本編のBGM/SEとは無関係
  // ---------------------------------------------------------
  var NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  var MELODY_PREFS_KEY = "ultimateGorillaMelodyPrefsV1";
  var MELODY_REC_KEY = "ultimateGorillaMelodyRecV1";
  var MELODY_REC_MAX = 5, MELODY_REC_NOTES_MAX = 4000; // §152 v0.71: 和音で音数が増えるため 2000→4000
  var MELODY_CHORDS = [{ n: 1, name: "単音" }, { n: 3, name: "3和音（トライアド）" }, { n: 4, name: "4和音（セブンス）" }, { n: 5, name: "5和音（ナインス）" }];
  var MELODY_CHORD_AT = [{ id: "bw", name: "ブロックと壁（パドルは単音ベース）" }, { id: "all", name: "すべて（パドルも）" }, { id: "b", name: "ブロックだけ" }];
  var MELODY_MODES = [{ id: "pos", name: "📍 位置で決まる（近い場所＝近い音）" }, { id: "rand", name: "🎲 ランダム（スケール内）" }];
  var MELODY_SCALES = [
    { id: "chromatic", group: "基本", name: "クロマチック（制限なし）", iv: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
    { id: "major", group: "基本", name: "メジャー（ダイアトニック）", iv: [0, 2, 4, 5, 7, 9, 11] },
    { id: "minor", group: "基本", name: "ナチュラルマイナー", iv: [0, 2, 3, 5, 7, 8, 10] },
    { id: "harmonic", group: "基本", name: "ハーモニックマイナー", iv: [0, 2, 3, 5, 7, 8, 11] },
    { id: "melodic", group: "基本", name: "メロディックマイナー", iv: [0, 2, 3, 5, 7, 9, 11] },
    { id: "majpenta", group: "ペンタ・ブルース", name: "メジャーペンタトニック", iv: [0, 2, 4, 7, 9] },
    { id: "minpenta", group: "ペンタ・ブルース", name: "マイナーペンタトニック", iv: [0, 3, 5, 7, 10] },
    { id: "blues", group: "ペンタ・ブルース", name: "ブルース", iv: [0, 3, 5, 6, 7, 10] },
    { id: "ionian", group: "教会旋法", name: "イオニアン", iv: [0, 2, 4, 5, 7, 9, 11] },
    { id: "dorian", group: "教会旋法", name: "ドリアン", iv: [0, 2, 3, 5, 7, 9, 10] },
    { id: "phrygian", group: "教会旋法", name: "フリジアン", iv: [0, 1, 3, 5, 7, 8, 10] },
    { id: "lydian", group: "教会旋法", name: "リディアン", iv: [0, 2, 4, 6, 7, 9, 11] },
    { id: "mixolydian", group: "教会旋法", name: "ミクソリディアン", iv: [0, 2, 4, 5, 7, 9, 10] },
    { id: "aeolian", group: "教会旋法", name: "エオリアン", iv: [0, 2, 3, 5, 7, 8, 10] },
    { id: "locrian", group: "教会旋法", name: "ロクリアン", iv: [0, 1, 3, 5, 6, 8, 10] },
    { id: "miyako", group: "和風・民族", name: "都節（みやこぶし）", iv: [0, 1, 5, 7, 8] },
    { id: "ryukyu", group: "和風・民族", name: "琉球音階", iv: [0, 4, 5, 7, 11] },
    { id: "ritsu", group: "和風・民族", name: "律音階", iv: [0, 2, 5, 7, 9] },
    { id: "hungarian", group: "和風・民族", name: "ハンガリアンマイナー", iv: [0, 2, 3, 6, 7, 8, 11] },
    { id: "spanish", group: "和風・民族", name: "スパニッシュ（フリジアンドミナント）", iv: [0, 1, 4, 5, 7, 8, 10] },
    { id: "dblharm", group: "和風・民族", name: "ダブルハーモニック", iv: [0, 1, 4, 5, 7, 8, 11] },
    { id: "wholetone", group: "その他", name: "全音音階", iv: [0, 2, 4, 6, 8, 10] },
    { id: "diminished", group: "その他", name: "ディミニッシュ", iv: [0, 2, 3, 5, 6, 8, 9, 11] }
  ];
  // GM 音色（§151 v0.70）
  var GM_FAMILIES = ["ピアノ", "クロマチック・パーカッション", "オルガン", "ギター", "ベース", "ストリングス", "アンサンブル", "ブラス",
    "リード", "パイプ", "シンセリード", "シンセパッド", "シンセエフェクト", "民族楽器", "パーカッシブ", "効果音"];
  var GM_NAMES = [
    "Acoustic Grand Piano", "Bright Acoustic Piano", "Electric Grand Piano", "Honky-tonk Piano", "Electric Piano 1", "Electric Piano 2", "Harpsichord", "Clavinet",
    "Celesta", "Glockenspiel", "Music Box", "Vibraphone", "Marimba", "Xylophone", "Tubular Bells", "Dulcimer",
    "Drawbar Organ", "Percussive Organ", "Rock Organ", "Church Organ", "Reed Organ", "Accordion", "Harmonica", "Tango Accordion",
    "Acoustic Guitar (nylon)", "Acoustic Guitar (steel)", "Electric Guitar (jazz)", "Electric Guitar (clean)", "Electric Guitar (muted)", "Overdriven Guitar", "Distortion Guitar", "Guitar Harmonics",
    "Acoustic Bass", "Electric Bass (finger)", "Electric Bass (pick)", "Fretless Bass", "Slap Bass 1", "Slap Bass 2", "Synth Bass 1", "Synth Bass 2",
    "Violin", "Viola", "Cello", "Contrabass", "Tremolo Strings", "Pizzicato Strings", "Orchestral Harp", "Timpani",
    "String Ensemble 1", "String Ensemble 2", "Synth Strings 1", "Synth Strings 2", "Choir Aahs", "Voice Oohs", "Synth Voice", "Orchestra Hit",
    "Trumpet", "Trombone", "Tuba", "Muted Trumpet", "French Horn", "Brass Section", "Synth Brass 1", "Synth Brass 2",
    "Soprano Sax", "Alto Sax", "Tenor Sax", "Baritone Sax", "Oboe", "English Horn", "Bassoon", "Clarinet",
    "Piccolo", "Flute", "Recorder", "Pan Flute", "Blown Bottle", "Shakuhachi", "Whistle", "Ocarina",
    "Lead 1 (square)", "Lead 2 (sawtooth)", "Lead 3 (calliope)", "Lead 4 (chiff)", "Lead 5 (charang)", "Lead 6 (voice)", "Lead 7 (fifths)", "Lead 8 (bass + lead)",
    "Pad 1 (new age)", "Pad 2 (warm)", "Pad 3 (polysynth)", "Pad 4 (choir)", "Pad 5 (bowed)", "Pad 6 (metallic)", "Pad 7 (halo)", "Pad 8 (sweep)",
    "FX 1 (rain)", "FX 2 (soundtrack)", "FX 3 (crystal)", "FX 4 (atmosphere)", "FX 5 (brightness)", "FX 6 (goblins)", "FX 7 (echoes)", "FX 8 (sci-fi)",
    "Sitar", "Banjo", "Shamisen", "Koto", "Kalimba", "Bagpipe", "Fiddle", "Shanai",
    "Tinkle Bell", "Agogo", "Steel Drums", "Woodblock", "Taiko Drum", "Melodic Tom", "Synth Drum", "Reverse Cymbal",
    "Guitar Fret Noise", "Breath Noise", "Seashore", "Bird Tweet", "Telephone Ring", "Helicopter", "Applause", "Gunshot"
  ];
  var MELODY_DRUM = 128;
  // 鳴り所: b=ブロック / p=硬いブロック1回目 / w=壁 / s=パドル
  var MELODY_VOICES = [
    { id: "b", name: "ブロック", ch: 0, def: 12, dur: 300 },
    { id: "p", name: "硬いブロック1回目", ch: 1, def: 24, dur: 150 },
    { id: "w", name: "壁", ch: 2, def: 8, dur: 600 },
    { id: "s", name: "パドル", ch: 3, def: 32, dur: 350 },
    // §158 v0.77: 伴奏（設定画面の音色欄には出さない）
    { id: "d", name: "伴奏ドラム", ch: 9, def: 128, dur: 120, hidden: true },
    { id: "c", name: "伴奏コード", ch: 4, def: 48, dur: 1500, hidden: true }
  ];

  var melodyAudio = { ctx: null, master: null, noise: null, bus: null, revSend: null, dlySend: null, fxRev: 1, fxDly: 0 };
  var melodyPlayback = null;
  var melodyMidi = { access: null, out: null, status: "" };

  function lsGet(k) {
    try { var s = window.localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  }
  function lsSet(k, v) {
    try { window.localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; }
  }
  function escHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function perfNow() {
    return (window.performance && window.performance.now) ? window.performance.now() : Date.now();
  }

  function melodyScale(id) {
    for (var i = 0; i < MELODY_SCALES.length; i++) { if (MELODY_SCALES[i].id === id) { return MELODY_SCALES[i]; } }
    return MELODY_SCALES[1];
  }
  function melodyDegreeToMidi(scale, key, deg) {
    var n = scale.iv.length;
    return 48 + key + 12 * Math.floor(deg / n) + scale.iv[deg % n];
  }
  // 位置→度数: 左→右で2オクターブ、下→上で1オクターブ。近い点は近い度数になる
  function melodyPosDegree(scale, x, y) {
    var n = scale.iv.length;
    var u = (clamp(x, 0, W) / W) * 2 * n + (1 - clamp(y, 0, H) / H) * n;
    return clamp(Math.round(u), 0, 3 * n - 1);
  }
  function midiName(m) { return NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1); }
  function midiColor(m) {
    var oct = Math.floor(m / 12) - 1;
    return "hsl(" + ((m % 12) * 30) + ",75%," + clamp(38 + (oct - 3) * 9, 30, 75) + "%)";
  }

  function melodyVoice(id) {
    for (var i = 0; i < MELODY_VOICES.length; i++) { if (MELODY_VOICES[i].id === id) { return MELODY_VOICES[i]; } }
    return MELODY_VOICES[0];
  }
  function melodyDefaultProg() {
    var out = {};
    for (var i = 0; i < MELODY_VOICES.length; i++) { out[MELODY_VOICES[i].id] = MELODY_VOICES[i].def; }
    return out;
  }
  function melodyProgOf(map, v) {
    var p = map ? parseInt(map[v], 10) : NaN;
    return (p >= 0 && p <= MELODY_DRUM) ? p : melodyVoice(v).def;
  }
  function melodyCleanProg(map) {
    var out = {};
    for (var i = 0; i < MELODY_VOICES.length; i++) { out[MELODY_VOICES[i].id] = melodyProgOf(map, MELODY_VOICES[i].id); }
    return out;
  }
  function gmLabel(p) {
    if (p === MELODY_DRUM) { return "🥁 ドラムキット（ch10）"; }
    var n = p + 1;
    return (n < 10 ? "00" : (n < 100 ? "0" : "")) + n + " " + GM_NAMES[p] + (MELODY_SAMPLE_FILES[p] ? " 🎙" : "");
  }

  function melodyAudioInit() {
    if (!melodyAudio.ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { return null; }
      try { melodyAudio.ctx = new AC(); } catch (e) { return null; }
      melodyAudio.master = melodyAudio.ctx.createGain();
      melodyAudio.master.gain.value = 0.25;
      melodyAudio.master.connect(melodyAudio.ctx.destination);
      var fx = melodyBuildFx(melodyAudio.ctx, melodyAudio.master); // §154 v0.73
      melodyAudio.bus = fx.bus;
      melodyAudio.revSend = fx.revSend;
      melodyAudio.dlySend = fx.dlySend;
      var fp = lsGet(MELODY_PREFS_KEY) || {};
      melodySetFx(typeof fp.fxRev === "number" ? fp.fxRev : 1, fp.fxDly || 0);
      try {
        var len = melodyAudio.ctx.sampleRate || 44100;
        var buf = melodyAudio.ctx.createBuffer(1, len, len), data = buf.getChannelData(0);
        for (var i = 0; i < len; i++) { data[i] = Math.random() * 2 - 1; }
        melodyAudio.noise = buf;
      } catch (e3) { melodyAudio.noise = null; }
    }
    if (melodyAudio.ctx.state === "suspended" && melodyAudio.ctx.resume) {
      try { melodyAudio.ctx.resume(); } catch (e2) {}
    }
    return melodyAudio.ctx;
  }

  // 内蔵シンセ v2（§154 v0.73）: 128音色それぞれのパッチ＝基本レシピ＋上書き
  // osc: [波形, 周波数比, 音量, デチューン(cent)]
  // a/dur/peak/sus/rel: エンベロープ  lp/lpEnd/q: ローパス（開閉）  bp: [[中心Hz, Q, 音量]] フォルマント
  // vib/vibRate: ビブラート(cent/Hz)  trem/tremRate: トレモロ(深さ0-1/Hz)  glide: 終わりの音程比
  // noise/noiseType/noiseFreq/band: ノイズ  drive: 歪み(0-1)  click: 打鍵ノイズ  perc: [比, 音量, 減衰秒] 減衰する倍音
  var MELODY_RECIPES = {
    piano: { osc: [["triangle", 1, 1, 0], ["sine", 2, 0.3, 0], ["sine", 3, 0.1, 0]], lp: 5000, lpEnd: 1500, a: 0.004, dur: 1.3, peak: 0.6, click: 0.03 },
    honky: { osc: [["triangle", 1, 0.7, -12], ["triangle", 1, 0.7, 12], ["sine", 2, 0.2, 0]], lp: 5000, lpEnd: 1800, a: 0.004, dur: 1.2, peak: 0.5, click: 0.03 },
    rhodes: { osc: [["sine", 1, 1, 0], ["sine", 2, 0.15, 0]], perc: [7, 0.25, 0.25], a: 0.003, dur: 1.6, peak: 0.55, trem: 0.15, tremRate: 4 },
    dxep: { osc: [["sine", 1, 1, 0]], perc: [14, 0.35, 0.15], a: 0.002, dur: 1.4, peak: 0.5 },
    harpsi: { osc: [["sawtooth", 1, 0.6, 0], ["square", 2, 0.25, 0]], lp: 7000, lpEnd: 2500, a: 0.002, dur: 0.8, peak: 0.35, click: 0.05 },
    clav: { osc: [["square", 1, 0.7, 0]], lp: 2600, lpEnd: 900, q: 4, a: 0.002, dur: 0.4, peak: 0.4 },
    bell: { osc: [["sine", 1, 1, 0], ["sine", 2.76, 0.25, 0], ["sine", 5.4, 0.08, 0]], a: 0.003, dur: 1.1, peak: 0.45 },
    musicbox: { osc: [["sine", 1, 1, 0], ["sine", 3, 0.25, 0], ["sine", 6.2, 0.05, 0]], a: 0.002, dur: 1.0, peak: 0.5 },
    vibes: { osc: [["sine", 1, 1, 0], ["sine", 4, 0.08, 0]], a: 0.003, dur: 1.8, peak: 0.5, trem: 0.5, tremRate: 5 },
    marimba: { osc: [["triangle", 1, 1, 0], ["sine", 4, 0.15, 0]], a: 0.003, dur: 0.5, peak: 0.7 },
    tubular: { osc: [["sine", 1, 1, 0], ["sine", 2, 0.4, 0], ["sine", 3.01, 0.2, 0]], a: 0.003, dur: 1.8, peak: 0.4 },
    pluck: { osc: [["sawtooth", 1, 1, 0], ["square", 2, 0.2, 0]], lp: 4000, lpEnd: 800, a: 0.002, dur: 0.35, peak: 0.4 },
    organ: { osc: [["sine", 1, 1, 0], ["sine", 2, 0.5, 0], ["sine", 3, 0.3, 0], ["sine", 4, 0.15, 0]], a: 0.01, dur: 0.6, sus: 0.8, rel: 0.08, peak: 0.35 },
    percorgan: { osc: [["sine", 1, 1, 0], ["sine", 2, 0.5, 0], ["sine", 4, 0.15, 0]], perc: [3, 0.4, 0.12], a: 0.005, dur: 0.6, sus: 0.7, rel: 0.08, peak: 0.35 },
    rockorgan: { osc: [["sine", 1, 1, 0], ["square", 2, 0.25, 0], ["sine", 3, 0.3, 0]], lp: 3000, drive: 0.15, a: 0.008, dur: 0.6, sus: 0.85, rel: 0.06, peak: 0.3, vib: 6, vibRate: 6.5 },
    church: { osc: [["sine", 0.5, 0.6, 0], ["sine", 1, 1, 0], ["sine", 2, 0.6, 0], ["sine", 4, 0.3, 0], ["sine", 8, 0.12, 0]], a: 0.06, dur: 1.2, sus: 0.9, rel: 0.3, peak: 0.25 },
    reed: { osc: [["square", 1, 0.8, 0]], lp: 1800, a: 0.02, dur: 0.5, sus: 0.8, rel: 0.08, peak: 0.3, vib: 5 },
    accordion: { osc: [["sawtooth", 1, 0.5, -8], ["sawtooth", 1, 0.5, 8]], lp: 2200, a: 0.02, dur: 0.6, sus: 0.85, rel: 0.08, peak: 0.25, vib: 3, trem: 0.1, tremRate: 6 },
    harmonica: { osc: [["square", 1, 0.6, 0], ["sawtooth", 1, 0.3, 0]], lp: 2400, q: 2, a: 0.03, dur: 0.55, sus: 0.8, rel: 0.08, peak: 0.3, vib: 9 },
    nylon: { osc: [["triangle", 1, 1, 0], ["sine", 2, 0.25, 0], ["sine", 3, 0.08, 0]], lp: 2600, lpEnd: 700, a: 0.003, dur: 1.0, peak: 0.55, click: 0.05 },
    guitar: { osc: [["sawtooth", 1, 1, 0]], lp: 5000, lpEnd: 1100, a: 0.002, dur: 1.2, peak: 0.45, click: 0.05 },
    drive: { osc: [["sawtooth", 1, 0.7, -6], ["sawtooth", 1, 0.7, 6]], drive: 0.6, lp: 3200, a: 0.005, dur: 0.9, sus: 0.8, rel: 0.1, peak: 0.22 },
    harmonics: { osc: [["sine", 2, 1, 0], ["sine", 4, 0.3, 0], ["sine", 6, 0.1, 0]], a: 0.002, dur: 1.3, peak: 0.4 },
    bass: { osc: [["sawtooth", 1, 0.8, 0], ["sine", 1, 0.4, 0]], lp: 900, a: 0.005, dur: 0.5, peak: 0.6 },
    fretless: { osc: [["sine", 1, 1, 0], ["triangle", 1, 0.5, 0]], lp: 900, a: 0.02, dur: 0.9, sus: 0.7, rel: 0.15, peak: 0.55, vib: 4 },
    slap: { osc: [["sawtooth", 1, 0.8, 0], ["sine", 1, 0.4, 0]], lp: 3200, lpEnd: 700, a: 0.002, dur: 0.35, peak: 0.65, click: 0.25 },
    synbass: { osc: [["square", 1, 0.6, 0], ["sawtooth", 1, 0.5, 0]], lp: 2200, lpEnd: 300, q: 8, a: 0.003, dur: 0.45, peak: 0.5 },
    violin: { osc: [["sawtooth", 1, 0.8, -3], ["sawtooth", 1, 0.3, 4]], lp: 3500, q: 1.5, a: 0.06, dur: 0.9, sus: 0.85, rel: 0.2, peak: 0.3, vib: 8, vibRate: 5.8 },
    strings: { osc: [["sawtooth", 1, 0.6, -7], ["sawtooth", 1, 0.6, 7]], lp: 2600, a: 0.09, dur: 0.9, sus: 0.8, rel: 0.25, peak: 0.3, vib: 6 },
    harp: { osc: [["triangle", 1, 1, 0], ["sine", 2, 0.2, 0]], lp: 4000, lpEnd: 1500, a: 0.002, dur: 1.6, peak: 0.5 },
    timpani: { osc: [["sine", 1, 1, 0], ["sine", 1.5, 0.3, 0]], glide: 0.85, a: 0.003, dur: 0.9, peak: 0.7, noise: 0.08 },
    synstr: { osc: [["sawtooth", 1, 0.5, -12], ["sawtooth", 1, 0.5, 12]], lp: 3000, a: 0.15, dur: 1.1, sus: 0.85, rel: 0.35, peak: 0.25 },
    choir: { osc: [["sawtooth", 1, 0.6, -5], ["sawtooth", 1, 0.6, 5]], bp: [[700, 6, 1], [1150, 7, 0.6], [2800, 8, 0.25]], a: 0.15, dur: 1.2, sus: 0.85, rel: 0.35, peak: 0.9, vib: 5 },
    oohs: { osc: [["sawtooth", 1, 0.6, -5], ["sawtooth", 1, 0.6, 5]], bp: [[400, 6, 1], [800, 7, 0.5], [2600, 8, 0.15]], a: 0.15, dur: 1.2, sus: 0.85, rel: 0.35, peak: 0.9, vib: 5 },
    orchhit: { osc: [["sawtooth", 0.5, 0.6, 0], ["sawtooth", 1, 0.8, -10], ["sawtooth", 2, 0.5, 10]], lp: 4000, lpEnd: 800, noise: 0.3, a: 0.003, dur: 0.5, peak: 0.4 },
    brass: { osc: [["sawtooth", 1, 1, 0]], lp: 700, lpEnd: 2800, a: 0.03, dur: 0.55, sus: 0.8, rel: 0.1, peak: 0.35 },
    mutetp: { osc: [["sawtooth", 1, 1, 0]], bp: [[1500, 3, 1], [3000, 4, 0.4]], a: 0.02, dur: 0.5, sus: 0.8, rel: 0.08, peak: 0.7 },
    synbrass: { osc: [["sawtooth", 1, 0.6, -8], ["sawtooth", 1, 0.6, 8]], lp: 400, lpEnd: 4500, q: 3, a: 0.01, dur: 0.6, sus: 0.8, rel: 0.1, peak: 0.3 },
    sax: { osc: [["sawtooth", 1, 0.8, 0], ["square", 1, 0.25, 0]], lp: 2600, q: 2, a: 0.03, dur: 0.55, sus: 0.85, rel: 0.08, peak: 0.3, vib: 5, noise: 0.03 },
    oboe: { osc: [["square", 1, 0.6, 0], ["sawtooth", 2, 0.2, 0]], lp: 3000, q: 4, a: 0.03, dur: 0.5, sus: 0.85, rel: 0.08, peak: 0.28, vib: 5 },
    clarinet: { osc: [["square", 1, 0.8, 0], ["square", 3, 0.1, 0]], lp: 2000, a: 0.03, dur: 0.55, sus: 0.85, rel: 0.08, peak: 0.3, vib: 3 },
    pipe: { osc: [["sine", 1, 1, 0], ["triangle", 2, 0.1, 0]], a: 0.04, dur: 0.55, sus: 0.85, rel: 0.1, peak: 0.45, vib: 8, noise: 0.04 },
    bottle: { osc: [["sine", 1, 1, 0]], noise: 0.18, band: true, a: 0.05, dur: 0.6, sus: 0.8, rel: 0.15, peak: 0.45 },
    shakuhachi: { osc: [["sine", 1, 1, 0], ["triangle", 2, 0.08, 0]], noise: 0.1, vib: 12, vibRate: 4.5, a: 0.07, dur: 0.7, sus: 0.8, rel: 0.15, peak: 0.45 },
    whistle: { osc: [["sine", 1, 1, 0]], a: 0.03, dur: 0.5, sus: 0.9, rel: 0.1, peak: 0.45, vib: 6 },
    ocarina: { osc: [["sine", 1, 1, 0], ["triangle", 3, 0.08, 0]], a: 0.03, dur: 0.5, sus: 0.9, rel: 0.1, peak: 0.45 },
    sqlead: { osc: [["square", 1, 0.8, 0]], lp: 6000, a: 0.005, dur: 0.4, sus: 0.9, rel: 0.06, peak: 0.25 },
    sawlead: { osc: [["sawtooth", 1, 0.8, 0]], lp: 6000, a: 0.005, dur: 0.4, sus: 0.9, rel: 0.06, peak: 0.25 },
    fifths: { osc: [["sawtooth", 1, 0.6, 0], ["sawtooth", 1.5, 0.45, 0]], lp: 5000, a: 0.005, dur: 0.45, sus: 0.9, rel: 0.06, peak: 0.22 },
    basslead: { osc: [["sawtooth", 1, 0.6, 0], ["square", 0.5, 0.5, 0]], lp: 4000, a: 0.005, dur: 0.45, sus: 0.9, rel: 0.06, peak: 0.25 },
    pad: { osc: [["sawtooth", 1, 0.5, -10], ["sawtooth", 1, 0.5, 10], ["sine", 0.5, 0.3, 0]], lp: 1400, a: 0.25, dur: 1.4, sus: 0.9, rel: 0.4, peak: 0.25 },
    polypad: { osc: [["sawtooth", 1, 0.5, -8], ["sawtooth", 1, 0.5, 8]], lp: 2500, lpEnd: 1200, a: 0.02, dur: 0.9, sus: 0.7, rel: 0.25, peak: 0.25 },
    metalpad: { osc: [["sine", 1, 1, 0], ["sine", 2.76, 0.3, 0], ["sine", 5.4, 0.12, 0]], a: 0.25, dur: 1.6, sus: 0.8, rel: 0.5, peak: 0.3 },
    halopad: { osc: [["sine", 1, 0.6, -8], ["sine", 1, 0.6, 8], ["sine", 2, 0.2, 0]], a: 0.3, dur: 1.6, sus: 0.9, rel: 0.5, peak: 0.35, vib: 4 },
    sweeppad: { osc: [["sawtooth", 1, 0.5, -10], ["sawtooth", 1, 0.5, 10]], lp: 300, lpEnd: 3500, a: 0.2, dur: 1.6, sus: 0.9, rel: 0.4, peak: 0.25 },
    rain: { osc: [["sine", 1, 0.6, 0]], noise: 0.4, noiseType: "highpass", noiseFreq: 5000, a: 0.01, dur: 1.0, peak: 0.35 },
    goblin: { osc: [["sine", 1, 1, 0], ["triangle", 1.5, 0.3, 0]], glide: 0.5, vib: 35, a: 0.01, dur: 0.9, peak: 0.35 },
    scifi: { osc: [["sine", 1, 1, 0], ["triangle", 1.5, 0.3, 0]], glide: 2.2, vib: 45, a: 0.01, dur: 0.9, peak: 0.35 },
    sitar: { osc: [["sawtooth", 1, 0.6, 0], ["sawtooth", 1, 0.4, 9], ["sawtooth", 2, 0.2, 0]], lp: 4500, lpEnd: 1400, q: 3, a: 0.002, dur: 1.5, peak: 0.35 },
    banjo: { osc: [["sawtooth", 1, 1, 0], ["square", 2, 0.2, 0]], lp: 6000, lpEnd: 2000, a: 0.002, dur: 0.45, peak: 0.4, click: 0.1 },
    shamisen: { osc: [["sawtooth", 1, 0.8, 0], ["square", 2, 0.2, 0]], lp: 4000, lpEnd: 700, a: 0.001, dur: 0.45, peak: 0.4, click: 0.3 },
    koto: { osc: [["triangle", 1, 1, 0], ["sawtooth", 2, 0.15, 0]], lp: 3500, lpEnd: 900, a: 0.002, dur: 0.9, peak: 0.5, click: 0.08 },
    kalimba: { osc: [["sine", 1, 1, 0], ["sine", 5.4, 0.15, 0]], a: 0.002, dur: 0.7, peak: 0.6, click: 0.05 },
    bagpipe: { osc: [["sawtooth", 1, 0.6, 0], ["square", 1, 0.3, 5]], lp: 3200, q: 2, a: 0.02, dur: 0.7, sus: 0.95, rel: 0.08, peak: 0.25 },
    steeldrum: { osc: [["sine", 1, 1, 0], ["sine", 2, 0.4, 0], ["sine", 3, 0.2, 0]], glide: 0.98, a: 0.002, dur: 0.8, peak: 0.55 },
    woodblock: { osc: [["sine", 1, 1, 0]], a: 0.001, dur: 0.09, peak: 0.8, click: 0.3 },
    taiko: { osc: [["sine", 1, 1, 0], ["sine", 1.5, 0.2, 0]], glide: 0.7, noise: 0.2, noiseType: "lowpass", noiseFreq: 800, a: 0.002, dur: 0.7, peak: 0.8 },
    percussive: { osc: [["sine", 1, 1, 0], ["triangle", 1.6, 0.3, 0]], glide: 0.6, a: 0.002, dur: 0.4, peak: 0.7 },
    revcym: { osc: [], noise: 0.8, noiseType: "highpass", noiseFreq: 6000, a: 0.8, dur: 0.9, peak: 0.4 },
    fret: { osc: [], noise: 0.6, band: true, a: 0.002, dur: 0.1, peak: 0.5 },
    breath: { osc: [], noise: 0.5, noiseType: "lowpass", noiseFreq: 1500, a: 0.05, dur: 0.5, sus: 0.8, rel: 0.1, peak: 0.5 },
    seashore: { osc: [], noise: 0.6, noiseType: "lowpass", noiseFreq: 800, a: 0.4, dur: 1.5, peak: 0.5, trem: 0.6, tremRate: 0.4 },
    bird: { osc: [["sine", 2, 1, 0]], glide: 1.6, vib: 80, vibRate: 18, a: 0.01, dur: 0.3, peak: 0.35 },
    phone: { osc: [["square", 2, 0.5, 0]], trem: 1, tremRate: 16, a: 0.005, dur: 0.8, sus: 0.9, rel: 0.05, peak: 0.2 },
    heli: { osc: [], noise: 0.6, noiseType: "lowpass", noiseFreq: 600, trem: 1, tremRate: 12, a: 0.01, dur: 1.0, sus: 0.9, rel: 0.1, peak: 0.6 },
    applause: { osc: [], noise: 0.6, noiseType: "bandpass", noiseFreq: 2500, trem: 0.8, tremRate: 20, a: 0.05, dur: 1.0, peak: 0.6 },
    gunshot: { osc: [], noise: 0.9, noiseType: "lowpass", noiseFreq: 2500, a: 0.001, dur: 0.3, peak: 0.8, click: 0.4 }
  };

  // GM 128音色 → [基本レシピ, 上書き]
  var MELODY_PATCHES = [
    ["piano"], ["piano", { lp: 8000, lpEnd: 3000, peak: 0.55 }], ["piano", { osc: [["triangle", 1, 0.8, -6], ["triangle", 1, 0.5, 6], ["sine", 2, 0.3, 0]] }], ["honky"],
    ["rhodes"], ["dxep"], ["harpsi"], ["clav"],
    ["bell", { dur: 1.2 }], ["bell", { osc: [["sine", 1, 1, 0], ["sine", 2.76, 0.4, 0], ["sine", 5.4, 0.2, 0]], dur: 1.5, peak: 0.4 }], ["musicbox"], ["vibes"],
    ["marimba"], ["marimba", { dur: 0.25, osc: [["triangle", 1, 1, 0], ["sine", 3, 0.3, 0]] }], ["tubular"], ["pluck", { osc: [["sawtooth", 1, 0.6, -5], ["sawtooth", 1, 0.6, 5]], lp: 5000, lpEnd: 1500, dur: 0.9 }],
    ["organ"], ["percorgan"], ["rockorgan"], ["church"],
    ["reed", { lp: 1400, vib: 0, peak: 0.25 }], ["accordion"], ["harmonica"], ["accordion", { osc: [["sawtooth", 1, 0.5, -14], ["sawtooth", 1, 0.5, 14]] }],
    ["nylon"], ["guitar"], ["guitar", { lp: 1800, lpEnd: 500, dur: 0.9, peak: 0.55 }], ["guitar", { lp: 4000, lpEnd: 1600, osc: [["sawtooth", 1, 0.7, -7], ["sawtooth", 1, 0.7, 7]], peak: 0.35 }],
    ["guitar", { dur: 0.18, lp: 1500, lpEnd: 400 }], ["drive", { drive: 0.4 }], ["drive"], ["harmonics"],
    ["bass"], ["bass", { lp: 1300 }], ["bass", { lp: 2400, lpEnd: 800, osc: [["sawtooth", 1, 1, 0]] }], ["fretless"],
    ["slap"], ["slap", { lp: 4500, lpEnd: 1100 }], ["synbass"], ["synbass", { osc: [["sawtooth", 1, 0.6, -10], ["sawtooth", 1, 0.6, 10]], q: 4, lp: 1600, lpEnd: 400 }],
    ["violin"], ["violin", { lp: 2800 }], ["violin", { lp: 2000, vib: 6 }], ["violin", { lp: 1200, vib: 4 }],
    ["strings", { trem: 0.6, tremRate: 8 }], ["pluck", { lp: 2500, lpEnd: 600, dur: 0.3, peak: 0.45 }], ["harp"], ["timpani"],
    ["strings"], ["strings", { a: 0.2, lp: 2000 }], ["synstr"], ["synstr", { lp: 1800 }],
    ["choir"], ["oohs"], ["choir", { osc: [["square", 1, 0.5, -5], ["sawtooth", 1, 0.5, 5]] }], ["orchhit"],
    ["brass", { lp: 900, lpEnd: 3200 }], ["brass", { lp: 600, lpEnd: 2000 }], ["brass", { lp: 400, lpEnd: 1200, osc: [["sawtooth", 1, 1, 0], ["sine", 0.5, 0.3, 0]] }], ["mutetp"],
    ["brass", { lp: 450, lpEnd: 1300, a: 0.06, vib: 3 }], ["brass", { osc: [["sawtooth", 1, 0.6, -6], ["sawtooth", 1, 0.6, 6]] }], ["synbrass"], ["synbrass", { a: 0.06, lpEnd: 3000 }],
    ["sax"], ["sax", { lp: 2200 }], ["sax", { lp: 1800 }], ["sax", { lp: 1300 }],
    ["oboe"], ["oboe", { lp: 2200 }], ["oboe", { lp: 1200, vib: 3 }], ["clarinet"],
    ["pipe", { vib: 6, noise: 0.03 }], ["pipe"], ["pipe", { vib: 0, osc: [["triangle", 1, 1, 0]] }], ["pipe", { noise: 0.12 }],
    ["bottle"], ["shakuhachi"], ["whistle"], ["ocarina"],
    ["sqlead"], ["sawlead"], ["pipe", { osc: [["sine", 1, 0.8, 0], ["square", 1, 0.25, 0]], vib: 7 }], ["sqlead", { click: 0.2 }],
    ["drive", { drive: 0.3, lp: 4000 }], ["choir", { osc: [["sawtooth", 1, 0.7, 0]], a: 0.05 }], ["fifths"], ["basslead"],
    ["pad", { osc: [["sawtooth", 1, 0.4, -10], ["sawtooth", 1, 0.4, 10], ["sine", 3, 0.25, 0]] }], ["pad", { lp: 900 }], ["polypad"], ["choir", { a: 0.4, dur: 1.8, rel: 0.6 }],
    ["strings", { a: 0.4, dur: 1.6, rel: 0.5 }], ["metalpad"], ["halopad"], ["sweeppad"],
    ["rain"], ["pad", { lp: 2000, vib: 3 }], ["bell", { osc: [["sine", 1, 1, 0], ["sine", 4.2, 0.3, 0], ["sine", 8.5, 0.15, 0]], dur: 1.8 }], ["halopad", { osc: [["triangle", 1, 0.6, -6], ["triangle", 1, 0.6, 6]] }],
    ["pad", { lp: 5000 }], ["goblin"], ["bell", { dur: 2.2, peak: 0.35 }], ["scifi"],
    ["sitar"], ["banjo"], ["shamisen"], ["koto"],
    ["kalimba"], ["bagpipe"], ["violin", { vib: 10, lp: 3800 }], ["oboe", { lp: 3800, vib: 8 }],
    ["bell", { osc: [["sine", 2, 1, 0], ["sine", 5.5, 0.3, 0]], dur: 0.9 }], ["bell", { osc: [["sine", 1, 1, 0], ["sine", 2.2, 0.5, 0]], dur: 0.3 }], ["steeldrum"], ["woodblock"],
    ["taiko"], ["percussive"], ["percussive", { glide: 0.3, osc: [["sine", 1, 1, 0]] }], ["revcym"],
    ["fret"], ["breath"], ["seashore"], ["bird"],
    ["phone"], ["heli"], ["applause"], ["gunshot"]
  ];
  var _melodyRecipeCache = {};
  function melodyRecipe(prog) {
    if (_melodyRecipeCache[prog]) { return _melodyRecipeCache[prog]; }
    var pt = MELODY_PATCHES[prog] || ["piano"], base = MELODY_RECIPES[pt[0]] || MELODY_RECIPES.piano, r = {}, k;
    for (k in base) { if (base.hasOwnProperty(k)) { r[k] = base[k]; } }
    if (pt[1]) { for (k in pt[1]) { if (pt[1].hasOwnProperty(k)) { r[k] = pt[1][k]; } } }
    _melodyRecipeCache[prog] = r;
    return r;
  }

  var _melodyDriveCurves = {};
  function melodyDriveCurve(amount) {
    var key = Math.round(amount * 100);
    if (_melodyDriveCurves[key]) { return _melodyDriveCurves[key]; }
    var n = 1024, curve = new Float32Array(n), k = amount * 50;
    for (var i = 0; i < n; i++) { var x = i * 2 / n - 1; curve[i] = (1 + k) * x / (1 + k * Math.abs(x)); }
    _melodyDriveCurves[key] = curve;
    return curve;
  }

  function melodyNoise(ac, t, dur, level, target, filterType, freq) {
    if (!melodyAudio.noise) { return; }
    var src = ac.createBufferSource(), g = ac.createGain(), f = ac.createBiquadFilter();
    src.buffer = melodyAudio.noise;
    src.loop = true;
    f.type = filterType;
    f.frequency.value = freq;
    g.gain.value = level;
    src.connect(f);
    f.connect(g);
    g.connect(target);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  // 和音のときなど音量を下げる出口（level 1 = そのまま）。エフェクトバスへつなぐ
  function melodyLevelOut(ac, level) {
    var bus = melodyAudio.bus || melodyAudio.master;
    if (!(level > 0) || level >= 1) { return bus; }
    var g = ac.createGain();
    g.gain.value = level;
    g.connect(bus);
    return g;
  }

  function melodySynth(midi, prog, when, level) {
    var ac = melodyAudio.ctx;
    if (!ac) { return; }
    var t = (when && when > ac.currentTime) ? when : ac.currentTime;
    if (prog === MELODY_DRUM) { melodyDrum(ac, midi, t, level); return; }
    if (melodySampleNote(ac, midi, prog, t, level)) { return; }
    var r = melodyRecipe(prog);
    var f = 440 * Math.pow(2, (midi - 69) / 12);
    var end = t + r.dur, i;
    // エンベロープ
    var env = ac.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(r.peak, t + r.a);
    if (r.sus) {
      env.gain.exponentialRampToValueAtTime(r.peak * r.sus, t + r.a + 0.06);
      env.gain.setValueAtTime(r.peak * r.sus, t + Math.max(r.a + 0.07, r.dur - (r.rel || 0.1)));
    }
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    var out = env;
    if (r.trem) {
      var tg = ac.createGain(), tl = ac.createOscillator(), tlg = ac.createGain();
      tg.gain.value = 1 - r.trem / 2;
      tl.frequency.value = r.tremRate || 5;
      tlg.gain.value = r.trem / 2;
      tl.connect(tlg);
      tlg.connect(tg.gain);
      tl.start(t);
      tl.stop(end + 0.05);
      env.connect(tg);
      out = tg;
    }
    out.connect(melodyLevelOut(ac, level));
    // 音源 → 歪み → ローパス → フォルマント → エンベロープ
    var mix = ac.createGain(), node = mix;
    if (r.drive) {
      var ws = ac.createWaveShaper();
      ws.curve = melodyDriveCurve(r.drive);
      node.connect(ws);
      node = ws;
    }
    if (r.lp) {
      var lp = ac.createBiquadFilter();
      lp.type = "lowpass";
      if (r.q) { lp.Q.value = r.q; }
      lp.frequency.setValueAtTime(Math.max(r.lp, f * 1.5), t);
      if (r.lpEnd) { lp.frequency.exponentialRampToValueAtTime(Math.max(r.lpEnd, f * 1.2), t + r.dur * 0.8); }
      node.connect(lp);
      node = lp;
    }
    if (r.bp) {
      var sum = ac.createGain();
      for (i = 0; i < r.bp.length; i++) {
        var bf = ac.createBiquadFilter(), bg = ac.createGain();
        bf.type = "bandpass";
        bf.frequency.value = r.bp[i][0];
        bf.Q.value = r.bp[i][1];
        bg.gain.value = r.bp[i][2];
        node.connect(bf);
        bf.connect(bg);
        bg.connect(sum);
      }
      node = sum;
    }
    node.connect(env);
    var lfoGain = null;
    if (r.vib) {
      var lfo = ac.createOscillator();
      lfoGain = ac.createGain();
      lfo.frequency.value = r.vibRate || 5.5;
      lfoGain.gain.value = f * r.vib * 0.000578;
      lfo.connect(lfoGain);
      lfo.start(t);
      lfo.stop(end + 0.05);
    }
    for (i = 0; i < r.osc.length; i++) {
      var spec = r.osc[i], o = ac.createOscillator(), g = ac.createGain();
      o.type = spec[0];
      o.frequency.setValueAtTime(f * spec[1], t);
      if (r.glide) { o.frequency.exponentialRampToValueAtTime(f * spec[1] * r.glide, end); }
      if (spec[3] && o.detune) { o.detune.value = spec[3]; }
      if (lfoGain) { lfoGain.connect(o.frequency); }
      g.gain.value = spec[2];
      o.connect(g);
      g.connect(mix);
      o.start(t);
      o.stop(end + 0.05);
    }
    if (r.perc) {
      var po = ac.createOscillator(), pg = ac.createGain();
      po.type = "sine";
      po.frequency.value = f * r.perc[0];
      pg.gain.setValueAtTime(r.perc[1], t);
      pg.gain.exponentialRampToValueAtTime(0.0001, t + r.perc[2]);
      po.connect(pg);
      pg.connect(mix);
      po.start(t);
      po.stop(t + r.perc[2] + 0.05);
    }
    if (r.noise) {
      melodyNoise(ac, t, r.dur, r.noise, mix, r.noiseType || (r.band ? "bandpass" : "highpass"), r.noiseFreq || (r.band ? f : 3000));
    }
    if (r.click) {
      var cg = ac.createGain();
      cg.gain.setValueAtTime(r.click, t);
      cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.015);
      cg.connect(env);
      melodyNoise(ac, t, 0.02, 1, cg, "highpass", 2000);
    }
  }

  // §154 v0.73: エフェクト（リバーブ・ディレイ）の量。0=なし 1=少し 2=ふつう 3=たっぷり
  var MELODY_FX_NAMES = ["なし", "少し", "ふつう", "たっぷり"];
  var MELODY_REV_SEND = [0, 0.18, 0.35, 0.6], MELODY_DLY_SEND = [0, 0.12, 0.25, 0.4], MELODY_REV_CC = [0, 30, 60, 100];
  function melodySetFx(rev, dly) {
    rev = clamp(parseInt(rev, 10) || 0, 0, 3);
    dly = clamp(parseInt(dly, 10) || 0, 0, 3);
    melodyAudio.fxRev = rev;
    melodyAudio.fxDly = dly;
    if (melodyAudio.revSend) { melodyAudio.revSend.gain.value = MELODY_REV_SEND[rev]; }
    if (melodyAudio.dlySend) { melodyAudio.dlySend.gain.value = MELODY_DLY_SEND[dly]; }
    if (melodyMidi && melodyMidi.out) {
      for (var i = 0; i < MELODY_VOICES.length; i++) { melodyMidiSend([0xB0 | MELODY_VOICES[i].ch, 91, MELODY_REV_CC[rev]]); }
    }
  }
  function melodyMakeImpulse(ac, seconds) {
    var rate = ac.sampleRate || 44100, len = Math.floor(rate * seconds);
    var buf = ac.createBuffer(2, len, rate);
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch);
      for (var i = 0; i < len; i++) { d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    }
    return buf;
  }
  // エフェクトバス: bus → master（ドライ）／ bus → リバーブ ／ bus → ディレイ
  function melodyBuildFx(ac, master) {
    var bus = ac.createGain();
    bus.connect(master);
    try {
      var rev = ac.createConvolver(), revSend = ac.createGain(), revOut = ac.createGain();
      rev.buffer = melodyMakeImpulse(ac, 2.2);
      revSend.gain.value = 0;
      revOut.gain.value = 0.7;
      bus.connect(revSend);
      revSend.connect(rev);
      rev.connect(revOut);
      revOut.connect(master);
      var dly = ac.createDelay(1.0), dlySend = ac.createGain(), fb = ac.createGain(), dlp = ac.createBiquadFilter();
      dly.delayTime.value = 0.28;
      dlySend.gain.value = 0;
      fb.gain.value = 0.32;
      dlp.type = "lowpass";
      dlp.frequency.value = 3000;
      bus.connect(dlySend);
      dlySend.connect(dly);
      dly.connect(dlp);
      dlp.connect(fb);
      fb.connect(dly);
      dlp.connect(master);
      return { bus: bus, revSend: revSend, dlySend: dlySend };
    } catch (e) {
      return { bus: bus, revSend: null, dlySend: null };
    }
  }

  // §155 v0.74: 本物の楽器サンプル（FluidR3_GM, CC BY 3.0）。samples/*.js を必要なときだけ読み込む
  var MELODY_SAMPLE_FILES = {
    0: "acoustic_grand_piano", 4: "electric_piano_1", 8: "celesta", 11: "vibraphone", 12: "marimba",
    24: "acoustic_guitar_nylon", 25: "acoustic_guitar_steel", 32: "acoustic_bass", 40: "violin", 46: "orchestral_harp",
    48: "string_ensemble_1", 52: "choir_aahs", 56: "trumpet", 65: "alto_sax", 73: "flute", 107: "koto"
  };
  // 鳴らす長さ（秒）: 減衰する楽器は長め、持続する楽器は短く切ってフェード
  var MELODY_SAMPLE_HOLD = { 0: 1.6, 4: 1.4, 8: 1.2, 11: 1.6, 12: 0.8, 24: 1.2, 25: 1.2, 32: 0.7, 40: 0.8, 46: 1.6, 48: 0.9, 52: 0.9, 56: 0.6, 65: 0.6, 73: 0.7, 107: 1.2 };
  var MELODY_SAMPLE_FADE = 0.25, MELODY_SAMPLE_VOL = 0.6, MELODY_SAMPLE_KEEP = 6;
  // state[name]: undefined | "loading" | "decoding" | "ready" | "error"
  var melodySamples = { enabled: true, state: {}, buffers: {}, keys: {}, waiting: {}, used: {} };

  window.UGMelodySamples = window.UGMelodySamples || { banks: {}, onload: null };
  window.UGMelodySamples.onload = function (name) {
    if (melodySamples.state[name] === "loading") { melodyDecodeBank(name); }
  };

  function melodySampleReady(prog) {
    var n = MELODY_SAMPLE_FILES[prog];
    return !!(n && melodySamples.state[n] === "ready");
  }
  function melodySampleFinish(name, ok) {
    melodySamples.state[name] = ok ? "ready" : "error";
    var w = melodySamples.waiting[name] || [];
    melodySamples.waiting[name] = [];
    for (var i = 0; i < w.length; i++) { w[i](); }
  }
  function melodyB64ToBuf(b64) {
    var bin = window.atob(b64), len = bin.length, bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) { bytes[i] = bin.charCodeAt(i); }
    return bytes.buffer;
  }
  // 展開後はモノラル・必要な長さだけに詰めてメモリを節約する
  function melodyTrimBuffer(ac, buf, seconds) {
    var len = Math.min(buf.length, Math.ceil(seconds * buf.sampleRate));
    var out = ac.createBuffer(1, len, buf.sampleRate), d = out.getChannelData(0), chs = buf.numberOfChannels;
    for (var c = 0; c < chs; c++) {
      var src = buf.getChannelData(c);
      for (var i = 0; i < len; i++) { d[i] += src[i] / chs; }
    }
    return out;
  }
  function melodyDecodeBank(name) {
    var ac = melodyAudio.ctx, bank = window.UGMelodySamples.banks[name];
    if (!ac || !bank) { melodySampleFinish(name, false); return; }
    melodySamples.state[name] = "decoding";
    var keys = Object.keys(bank.notes), left = keys.length, bufs = {}, hold = (MELODY_SAMPLE_HOLD[bank.prog] || 1) + MELODY_SAMPLE_FADE + 0.05;
    function one(k, ab) {
      function ok(buf) { try { bufs[k] = melodyTrimBuffer(ac, buf, hold); } catch (e) {} done(); }
      function ng() { done(); }
      try {
        var pr = ac.decodeAudioData(ab, ok, ng);
        if (pr && pr.catch) { pr.catch(function () {}); }
      } catch (e2) { done(); }
    }
    function done() {
      left--;
      if (left > 0) { return; }
      var ks = Object.keys(bufs).map(function (x) { return parseInt(x, 10); }).sort(function (a, b) { return a - b; });
      melodySamples.buffers[name] = bufs;
      melodySamples.keys[name] = ks;
      delete window.UGMelodySamples.banks[name]; // base64 の元データは捨てる
      melodyEvictSamples(melodySamples.wanted || [name]);
      melodySampleFinish(name, ks.length > 0);
    }
    for (var i = 0; i < keys.length; i++) {
      try { one(keys[i], melodyB64ToBuf(bank.notes[keys[i]])); } catch (e3) { done(); }
    }
  }
  // 使わなくなった音色を捨てる（最大 MELODY_SAMPLE_KEEP 音色まで保持）
  function melodyEvictSamples(keepNames) {
    var names = Object.keys(melodySamples.buffers);
    if (names.length <= MELODY_SAMPLE_KEEP) { return; }
    names.sort(function (a, b) { return (melodySamples.used[a] || 0) - (melodySamples.used[b] || 0); });
    for (var i = 0; i < names.length && Object.keys(melodySamples.buffers).length > MELODY_SAMPLE_KEEP; i++) {
      if (keepNames.indexOf(names[i]) >= 0) { continue; }
      delete melodySamples.buffers[names[i]];
      delete melodySamples.keys[names[i]];
      delete melodySamples.state[names[i]];
    }
  }
  // progs の中でサンプルがある音色を読み込む。全部そろったら cb（すでにそろっていれば即 cb）
  function melodyLoadSamples(progs, cb) {
    var ac = melodyAudioInit(), pending = 0, names = [], i;
    if (!ac || !melodySamples.enabled) { if (cb) { cb(); } return; }
    function doneOne() { pending--; if (pending === 0 && cb) { cb(); } }
    for (i = 0; i < progs.length; i++) {
      var name = MELODY_SAMPLE_FILES[progs[i]];
      if (!name || names.indexOf(name) >= 0) { continue; }
      names.push(name);
      melodySamples.used[name] = Date.now();
      var st = melodySamples.state[name];
      if (st === "ready" || st === "error") { continue; }
      pending++;
      (melodySamples.waiting[name] = melodySamples.waiting[name] || []).push(doneOne);
      if (st) { continue; }
      melodySamples.state[name] = "loading";
      if (window.UGMelodySamples.banks[name]) { melodyDecodeBank(name); continue; }
      try {
        var sc = document.createElement("script");
        sc.src = "samples/" + name + ".js";
        sc.onerror = (function (n) { return function () { melodySampleFinish(n, false); }; })(name);
        (document.head || document.body).appendChild(sc);
      } catch (e) { melodySampleFinish(name, false); }
    }
    melodySamples.wanted = names;
    melodyEvictSamples(names);
    if (pending === 0 && cb) { cb(); }
  }
  function melodyProgList(map) {
    var out = [];
    for (var i = 0; i < MELODY_VOICES.length; i++) { out.push(melodyProgOf(map, MELODY_VOICES[i].id)); }
    return out;
  }

  // サンプルで鳴らせたら true（無い・読み込み中なら false → 合成音で鳴らす）
  function melodySampleNote(ac, midi, prog, t, level) {
    if (!melodySamples.enabled || !melodySampleReady(prog)) { return false; }
    var name = MELODY_SAMPLE_FILES[prog], ks = melodySamples.keys[name], best = ks[0];
    for (var i = 1; i < ks.length; i++) { if (Math.abs(ks[i] - midi) < Math.abs(best - midi)) { best = ks[i]; } }
    var buf = melodySamples.buffers[name][best];
    if (!buf) { return false; }
    var hold = MELODY_SAMPLE_HOLD[prog] || 1, vol = MELODY_SAMPLE_VOL;
    var src = ac.createBufferSource(), g = ac.createGain();
    src.buffer = buf;
    src.playbackRate.value = Math.pow(2, (midi - best) / 12);
    g.gain.setValueAtTime(vol, t);
    g.gain.setValueAtTime(vol, t + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + hold + MELODY_SAMPLE_FADE);
    src.connect(g);
    g.connect(melodyLevelOut(ac, level));
    src.start(t);
    src.stop(t + hold + MELODY_SAMPLE_FADE + 0.05);
    melodySamples.used[name] = Date.now();
    return true;
  }

  // Web MIDI 出力
  function melodyMidiSend(bytes, ts) {
    var out = melodyMidi.out;
    if (!out) { return; }
    try { out.send(bytes, ts); } catch (e) { try { out.send(bytes); } catch (e2) {} }
  }
  function melodyMidiPrograms(map) {
    if (!melodyMidi.out) { return; }
    for (var i = 0; i < MELODY_VOICES.length; i++) {
      var p = melodyProgOf(map, MELODY_VOICES[i].id);
      if (p < MELODY_DRUM) { melodyMidiSend([0xC0 | MELODY_VOICES[i].ch, p]); }
      melodyMidiSend([0xB0 | MELODY_VOICES[i].ch, 91, MELODY_REV_CC[melodyAudio.fxRev || 0]]); // §154: リバーブ量
    }
  }
  function melodyMidiAllOff() {
    if (!melodyMidi.out) { return; }
    var chs = [0, 1, 2, 3, 4, 9];
    for (var i = 0; i < chs.length; i++) { melodyMidiSend([0xB0 | chs[i], 123, 0]); }
  }
  function melodyMidiOutputs() {
    var out = [];
    if (!melodyMidi.access || !melodyMidi.access.outputs) { return out; }
    melodyMidi.access.outputs.forEach(function (port) { out.push({ id: port.id, name: port.name || port.id, port: port }); });
    return out;
  }
  function melodySelectOutput(id) {
    melodyMidiAllOff();
    melodyMidi.out = null;
    if (!id || id === "synth") { return; }
    var outs = melodyMidiOutputs();
    for (var i = 0; i < outs.length; i++) { if (outs[i].id === id) { melodyMidi.out = outs[i].port; } }
  }
  function melodyRequestMidi(cb) {
    if (typeof navigator === "undefined" || !navigator.requestMIDIAccess) {
      melodyMidi.status = "unsupported";
      cb();
      return;
    }
    melodyMidi.status = "asking";
    try {
      navigator.requestMIDIAccess({ sysex: false }).then(function (acc) {
        melodyMidi.access = acc;
        melodyMidi.status = "ok";
        cb();
      }, function () {
        melodyMidi.status = "denied";
        cb();
      });
    } catch (e) {
      melodyMidi.status = "denied";
      cb();
    }
  }

  // 1音を鳴らす（出力先に応じて内蔵シンセ or MIDI機器）。whenPerf は performance.now 基準
  // level: 音量の比率（和音のとき 1/√音数）。MIDIではベロシティに反映（最低40）
  function melodyNote(midi, voice, progMap, whenPerf, level) {
    var prog = melodyProgOf(progMap, voice), v = melodyVoice(voice);
    var lv = (level > 0 && level < 1) ? level : 1;
    if (melodyMidi.out) {
      var drum = prog === MELODY_DRUM;
      var ch = drum ? 9 : v.ch, note = drum ? clamp(midi, 35, 81) : clamp(midi, 0, 127);
      var ts = whenPerf || perfNow();
      melodyMidiSend([0x90 | ch, note, Math.max(40, Math.round(100 * lv))], ts);
      melodyMidiSend([0x80 | ch, note, 0], ts + v.dur);
      return;
    }
    var ac = melodyAudio.ctx;
    if (!ac) { return; }
    melodySynth(midi, prog, whenPerf ? ac.currentTime + Math.max(0, whenPerf - perfNow()) / 1000 : 0, lv);
  }

  // 和音: 根音の度数 deg からスケール内で1つおきに積む（クロマチックは 0/4/7/11/14 半音）
  function melodyChordMidis(scale, key, deg, size, shift) {
    var out = [], i, n = Math.max(1, size || 1);
    if (scale.id === "chromatic") {
      var root = melodyDegreeToMidi(scale, key, deg), iv = [0, 4, 7, 11, 14];
      for (i = 0; i < n; i++) { out.push(root + iv[i]); }
    } else {
      for (i = 0; i < n; i++) { out.push(melodyDegreeToMidi(scale, key, deg + 2 * i)); }
    }
    for (i = 0; i < out.length; i++) { out[i] += shift || 0; }
    if (out[out.length - 1] > 100) { for (i = 0; i < out.length; i++) { out[i] -= 12; } }
    return out;
  }

  var CHORD_TRIADS = { "4,7": "", "3,7": "m", "3,6": "dim", "4,8": "aug", "2,7": "sus2", "5,7": "sus4", "4,6": "(b5)" };
  var CHORD_SEVENTHS = {
    "": { 11: "M7", 10: "7", 9: "6" }, "m": { 11: "mM7", 10: "m7", 9: "m6" }, "dim": { 10: "m7(b5)", 9: "dim7" },
    "aug": { 10: "aug7", 11: "augM7" }, "sus4": { 10: "7sus4", 11: "M7sus4" }, "sus2": { 10: "7sus2", 11: "M7sus2" },
    "(b5)": { 10: "7(b5)", 11: "M7(b5)" }
  };
  var CHORD_TENSIONS = { 2: "(9)", 1: "(b9)", 3: "(#9)" };
  // コード名（3度積みでなければ構成音名を並べる）
  function melodyChordName(midis) {
    var names = [], rel = [], i;
    for (i = 0; i < midis.length; i++) {
      names.push(NOTE_NAMES[midis[i] % 12]);
      rel.push(((midis[i] - midis[0]) % 12 + 12) % 12);
    }
    if (midis.length < 3) { return midiName(midis[0]); }
    var plain = names.join(" ");
    var q = CHORD_TRIADS[rel[1] + "," + rel[2]];
    if (q === undefined) { return plain; }
    var out = names[0] + q;
    if (midis.length === 3) { return out; }
    var s7 = CHORD_SEVENTHS[q] ? CHORD_SEVENTHS[q][rel[3]] : undefined;
    if (!s7) { return plain; }
    out = names[0] + s7;
    if (midis.length === 4) { return out; }
    var ten = CHORD_TENSIONS[rel[4]];
    if (!ten) { return plain; }
    // m7(b5) + (b9) → m7(b5,b9)
    return out.charAt(out.length - 1) === ")" ? out.slice(0, -1) + "," + ten.slice(1) : out + ten;
  }

  function melodyStopPlayback(silent) {
    if (!melodyPlayback) { return; }
    clearInterval(melodyPlayback.timer);
    melodyMidiAllOff();
    var cb = melodyPlayback.onEnd;
    melodyPlayback = null;
    if (!silent && cb) { cb(); }
  }
  // 先読みスケジューラ: 40msごとに250ms先までの音を予約（performance.now 基準）
  function melodyStartPlayback(rec, onEnd) {
    melodyStopPlayback(true);
    if (!melodyMidi.out && !melodyAudioInit()) { if (onEnd) { onEnd(); } return; }
    if (!rec.notes.length) { if (onEnd) { onEnd(); } return; }
    melodyMidiPrograms(rec.prog);
    melodyLoadSamples(melodyProgList(rec.prog)); // §155 v0.74: 読み込み前の音は合成音で鳴る
    var st = { id: rec.id, idx: 0, t0: perfNow() + 150, onEnd: onEnd, timer: null };
    var last = 0;
    for (var li = 0; li < rec.notes.length; li++) { if (rec.notes[li][0] > last) { last = rec.notes[li][0]; } }
    st.timer = setInterval(function () {
      var now = perfNow();
      while (st.idx < rec.notes.length && st.t0 + rec.notes[st.idx][0] < now + 250) {
        var nt = rec.notes[st.idx];
        melodyNote(nt[1], nt[2], rec.prog, st.t0 + nt[0], nt[3] || 1);
        st.idx++;
      }
      if (st.idx >= rec.notes.length && now > st.t0 + last + 1000) { melodyStopPlayback(); }
    }, 40);
    melodyPlayback = st;
  }

  function melodyLoadPrefs(soundDefault) {
    var p = lsGet(MELODY_PREFS_KEY) || {};
    var key = parseInt(p.key, 10);
    return {
      mode: p.mode === "rand" ? "rand" : "pos",
      scale: melodyScale(p.scale).id,
      key: (key >= 0 && key < 12) ? key : 0,
      sound: typeof p.sound === "boolean" ? p.sound : !!soundDefault,
      rec: typeof p.rec === "boolean" ? p.rec : true,
      relax: p.relax === true,
      layout: (function () { for (var li = 0; li < MELODY_LAYOUTS.length; li++) { if (MELODY_LAYOUTS[li].id === p.layout) { return p.layout; } } return "pos"; })(),
      oct: (p.oct >= 1 && p.oct <= 6) ? p.oct : 2,
      rows: MELODY_ROW_CHOICES.indexOf(p.rows) >= 0 ? p.rows : 3,
      scroll: (p.scroll >= 0 && p.scroll <= 3) ? p.scroll : 0,
      autoTone: p.autoTone !== false,
      bpm: MELODY_BPMS.indexOf(p.bpm) >= 0 ? p.bpm : 0, // §158 v0.77
      quant: p.quant === 16 ? 16 : 8,
      groove: melodyFindById(MELODY_GROOVES, p.groove).id,
      progId: melodyFindById(MELODY_PROGRESSIONS, p.progId).id,
      pad: p.pad !== false,
      samples: p.samples !== false, // §155 v0.74: 本物の楽器サンプルを使う（既定ON）
      fxRev: (p.fxRev >= 0 && p.fxRev <= 3) ? p.fxRev : 1,
      fxDly: (p.fxDly >= 0 && p.fxDly <= 3) ? p.fxDly : 0,
      chord: (p.chord === 3 || p.chord === 4 || p.chord === 5) ? p.chord : 1,
      arp: p.arp === true,
      chordAt: (p.chordAt === "all" || p.chordAt === "b") ? p.chordAt : "bw",
      prog: melodyCleanProg(p.prog),
      output: typeof p.output === "string" ? p.output : "synth"
    };
  }
  function melodyLoadRecs() {
    var arr = lsGet(MELODY_REC_KEY);
    if (!arr || !arr.length) { return []; }
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var r = arr[i];
      if (r && r.notes && r.notes.length && typeof r.id === "number") { out.push(r); }
    }
    return out;
  }
  function melodySaveRec(rec) {
    var recs = melodyLoadRecs();
    recs.unshift(rec);
    if (recs.length > MELODY_REC_MAX) { recs.length = MELODY_REC_MAX; }
    // 容量不足なら古い録音から削って再挑戦
    while (recs.length > 0 && !lsSet(MELODY_REC_KEY, recs)) { recs.pop(); }
  }
  function melodyDeleteRec(id) {
    var recs = melodyLoadRecs(), out = [];
    for (var i = 0; i < recs.length; i++) { if (recs[i].id !== id) { out.push(recs[i]); } }
    lsSet(MELODY_REC_KEY, out);
  }
  function melodyRecLabel(r) {
    var d = new Date(r.date);
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    return (d.getMonth() + 1) + "/" + d.getDate() + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  // Standard MIDI File（フォーマット0・120BPM・480tick/四分音符）
  // 鳴り所ごとにチャンネル1〜4（ドラムは10）。先頭に録音時のGM音色をプログラムチェンジで書く
  function melodyMidiBytes(rec) {
    var TPQ = 480, MS_PER_TICK = 500 / TPQ;
    var ev = [], i;
    for (i = 0; i < rec.notes.length; i++) {
      var nt = rec.notes[i], v = melodyVoice(nt[2]), prog = melodyProgOf(rec.prog, nt[2]);
      var drum = prog === MELODY_DRUM, c = drum ? 9 : v.ch, m = drum ? clamp(nt[1], 35, 81) : clamp(nt[1], 0, 127);
      ev.push([Math.round(nt[0] / MS_PER_TICK), 1, [0x90 | c, m, Math.max(40, Math.round(96 * (nt[3] || 1)))]]);
      ev.push([Math.round((nt[0] + v.dur) / MS_PER_TICK), 0, [0x80 | c, m, 0]]);
    }
    ev.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    var name = "Ultimate Gorilla Melody";
    var trk = [0x00, 0xFF, 0x03, name.length];
    for (i = 0; i < name.length; i++) { trk.push(name.charCodeAt(i)); }
    trk.push(0x00, 0xFF, 0x51, 0x03, 0x07, 0xA1, 0x20);
    var revCC = MELODY_REV_CC[(rec.fxRev >= 0 && rec.fxRev <= 3) ? rec.fxRev : 1];
    for (i = 0; i < MELODY_VOICES.length; i++) {
      var pg = melodyProgOf(rec.prog, MELODY_VOICES[i].id);
      if (pg < MELODY_DRUM) { trk.push(0x00, 0xC0 | MELODY_VOICES[i].ch, pg); }
      trk.push(0x00, 0xB0 | MELODY_VOICES[i].ch, 91, revCC);
    }
    var lastTick = 0;
    function vlq(n) {
      var buf = [n & 0x7F];
      n = Math.floor(n / 128);
      while (n > 0) { buf.unshift((n & 0x7F) | 0x80); n = Math.floor(n / 128); }
      for (var k = 0; k < buf.length; k++) { trk.push(buf[k]); }
    }
    for (i = 0; i < ev.length; i++) {
      vlq(ev[i][0] - lastTick);
      lastTick = ev[i][0];
      trk.push(ev[i][2][0], ev[i][2][1], ev[i][2][2]);
    }
    trk.push(0x00, 0xFF, 0x2F, 0x00);
    var len = trk.length;
    var head = [0x4D, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (TPQ >> 8) & 255, TPQ & 255,
      0x4D, 0x54, 0x72, 0x6B, (len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255];
    return head.concat(trk);
  }
  function melodyDownloadMidi(rec) {
    try {
      var blob = new Blob([new Uint8Array(melodyMidiBytes(rec))], { type: "audio/midi" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      var d = new Date(rec.date);
      var pad = function (n) { return (n < 10 ? "0" : "") + n; };
      a.href = url;
      a.download = "melody-" + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + "-" + pad(d.getHours()) + pad(d.getMinutes()) + ".mid";
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1500);
    } catch (e) {}
  }

  // ---------------------------------------------------------
  // §157 v0.76: 録音を WAV に書き出す（内蔵の鳴らし方そのままでオフライン描画）
  // ---------------------------------------------------------
  var MELODY_WAV_RATE = 32000, MELODY_WAV_MAX_SEC = 180, MELODY_WAV_TAIL = 2.5;
  var melodyWavBusy = null; // 書き出し中の録音 id
  var melodyWavMsg = "";

  function melodyFileStamp(rec) {
    var d = new Date(rec.date), pad = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + "-" + pad(d.getHours()) + pad(d.getMinutes());
  }
  // AudioBuffer（2ch）→ 16bit PCM WAV
  function melodyEncodeWav(buf) {
    var ch = Math.min(2, buf.numberOfChannels), len = buf.length, rate = buf.sampleRate;
    var dataBytes = len * ch * 2, ab = new ArrayBuffer(44 + dataBytes), v = new DataView(ab), i, c, pos = 44;
    function str(o, s) { for (var k = 0; k < s.length; k++) { v.setUint8(o + k, s.charCodeAt(k)); } }
    str(0, "RIFF"); v.setUint32(4, 36 + dataBytes, true); str(8, "WAVE");
    str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
    str(36, "data"); v.setUint32(40, dataBytes, true);
    var chans = [];
    for (c = 0; c < ch; c++) { chans.push(buf.getChannelData(c)); }
    for (i = 0; i < len; i++) {
      for (c = 0; c < ch; c++) {
        var s = Math.max(-1, Math.min(1, chans[c][i]));
        v.setInt16(pos, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        pos += 2;
      }
    }
    return new Blob([ab], { type: "audio/wav" });
  }
  // 録音をオフラインで描画して WAV Blob を返す。cb(blob, 秒数, 途中で切ったか) / cb(null) は失敗
  function melodyRenderWav(rec, cb) {
    var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC || !rec.notes.length) { cb(null); return; }
    if (!melodyAudioInit()) { cb(null); return; }
    var last = 0, i;
    for (i = 0; i < rec.notes.length; i++) { if (rec.notes[i][0] > last) { last = rec.notes[i][0]; } }
    var sec = Math.min(MELODY_WAV_MAX_SEC, last / 1000 + MELODY_WAV_TAIL), cut = last / 1000 + MELODY_WAV_TAIL > MELODY_WAV_MAX_SEC;
    var off;
    try { off = new OAC(2, Math.ceil(sec * MELODY_WAV_RATE), MELODY_WAV_RATE); } catch (e) { cb(null); return; }
    // 本番の音源をそのまま使うため、描画のあいだだけ出力先をオフライン側に差し替える
    var saved = { ctx: melodyAudio.ctx, master: melodyAudio.master, bus: melodyAudio.bus, revSend: melodyAudio.revSend, dlySend: melodyAudio.dlySend };
    try {
      var master = off.createGain();
      master.gain.value = 0.25;
      master.connect(off.destination);
      var fx = melodyBuildFx(off, master);
      if (fx.revSend) { fx.revSend.gain.value = MELODY_REV_SEND[(rec.fxRev >= 0 && rec.fxRev <= 3) ? rec.fxRev : 1]; }
      if (fx.dlySend) { fx.dlySend.gain.value = MELODY_DLY_SEND[melodyAudio.fxDly || 0]; }
      melodyAudio.ctx = off; melodyAudio.master = master; melodyAudio.bus = fx.bus; melodyAudio.revSend = fx.revSend; melodyAudio.dlySend = fx.dlySend;
      for (i = 0; i < rec.notes.length; i++) {
        var nt = rec.notes[i], t = nt[0] / 1000;
        if (t > sec - 0.05) { continue; }
        melodySynth(nt[1], melodyProgOf(rec.prog, nt[2]), Math.max(0.0001, t), nt[3] || 1);
      }
    } catch (e2) {
      off = null;
    }
    melodyAudio.ctx = saved.ctx; melodyAudio.master = saved.master; melodyAudio.bus = saved.bus; melodyAudio.revSend = saved.revSend; melodyAudio.dlySend = saved.dlySend;
    if (!off) { cb(null); return; }
    var done = false;
    function finish(buf) {
      if (done) { return; }
      done = true;
      try { cb(melodyEncodeWav(buf), sec, cut); } catch (e3) { cb(null); }
    }
    off.oncomplete = function (ev) { finish(ev.renderedBuffer); };
    try {
      var pr = off.startRendering();
      if (pr && pr.then) { pr.then(finish, function () { if (!done) { done = true; cb(null); } }); }
    } catch (e4) { cb(null); }
  }
  // スマホは共有メニュー（保存・送信）、できなければダウンロード
  function melodySaveBlob(blob, filename) {
    try {
      if (window.File && navigator.share && navigator.canShare) {
        var file = new File([blob], filename, { type: blob.type });
        if (navigator.canShare({ files: [file] })) {
          var sp = navigator.share({ files: [file], title: filename });
          if (sp && sp.catch) { sp.catch(function () {}); }
          return "share";
        }
      }
    } catch (e) {}
    try {
      var url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 3000);
      return "download";
    } catch (e2) { return "fail"; }
  }
  function melodyExportWav(rec, onState) {
    if (melodyWavBusy) { return; }
    melodyWavBusy = rec.id;
    onState("busy");
    var started = false;
    function go() {
      if (started) { return; }
      started = true;
      melodyRenderWav(rec, function (blob, sec, cut) {
        melodyWavBusy = null;
        if (!blob) { onState("fail"); return; }
        var how = melodySaveBlob(blob, "melody-" + melodyFileStamp(rec) + ".wav");
        onState(how === "fail" ? "fail" : (cut ? "cut" : "ok"), sec);
      });
    }
    // サンプルの読み込みを待つ（8秒で来なければ合成音のまま書き出す）
    melodyLoadSamples(melodyProgList(rec.prog), go);
    setTimeout(go, 8000);
  }

  // 設定画面（HTML）
  var melodyToneOpen = false;

  function melodySetup(root, ctl) {
    var prefs = melodyLoadPrefs(ctl.soundEnabled);

    function savePrefs() { lsSet(MELODY_PREFS_KEY, prefs); }
    function scaleOptions() {
      var html = "", group = null;
      for (var i = 0; i < MELODY_SCALES.length; i++) {
        var s = MELODY_SCALES[i];
        if (s.group !== group) {
          if (group !== null) { html += "</optgroup>"; }
          group = s.group;
          html += '<optgroup label="' + escHtml(group) + '">';
        }
        html += '<option value="' + s.id + '"' + (s.id === prefs.scale ? " selected" : "") + ">" + escHtml(s.name) + "</option>";
      }
      return html + "</optgroup>";
    }
    function gmOptions(sel) {
      var html = "";
      for (var fam = 0; fam < 16; fam++) {
        html += '<optgroup label="' + escHtml(GM_FAMILIES[fam]) + '">';
        for (var p = fam * 8; p < fam * 8 + 8; p++) {
          html += '<option value="' + p + '"' + (p === sel ? " selected" : "") + ">" + escHtml(gmLabel(p)) + "</option>";
        }
        html += "</optgroup>";
      }
      return html + '<optgroup label="ドラム"><option value="' + MELODY_DRUM + '"' + (sel === MELODY_DRUM ? " selected" : "") + ">" + gmLabel(MELODY_DRUM) + "</option></optgroup>";
    }
    function outputOptions() {
      var outs = melodyMidiOutputs(), html = '<option value="synth"' + (prefs.output === "synth" ? " selected" : "") + '>🎛️ 内蔵シンセ（GM風の近似音）</option>';
      for (var i = 0; i < outs.length; i++) {
        html += '<option value="' + escHtml(outs[i].id) + '"' + (outs[i].id === prefs.output ? " selected" : "") + ">🔌 " + escHtml(outs[i].name) + "</option>";
      }
      return html;
    }
    // §156 v0.75: ブロック配置モードの設定行
    function optList(key, items, valueOf, nameOf) {
      var html = "";
      for (var i = 0; i < items.length; i++) {
        var v = valueOf(items[i], i);
        html += '<option value="' + v + '"' + (String(v) === String(prefs[key]) ? " selected" : "") + ">" + nameOf(items[i], i) + "</option>";
      }
      return html;
    }
    function layoutRows() {
      var lay = prefs.layout, html =
        '<label class="melody-row"><span>ブロック</span><select data-p="layout">' +
        optList("layout", MELODY_LAYOUTS, function (x) { return x.id; }, function (x) { return x.name; }) + '</select></label>';
      if (lay === "piano") {
        html += '<label class="melody-row"><span>鍵盤のオクターブ</span><select data-p="oct">' +
          optList("oct", [1, 2, 3, 4, 5, 6], function (x) { return x; }, function (x) { return x + "オクターブ"; }) + '</select></label>';
        if (prefs.oct >= 4 && !prefs.scroll) {
          html += '<p class="small" style="color:#fdcb6e;margin:0 0 4px;">4オクターブ以上は画面に収めると鍵がとても細くなります。「横スクロール」をONにすると鍵の幅を保ったまま流れます。</p>';
        }
      }
      if (lay !== "pos") {
        html += '<label class="melody-row"><span>' + (lay === "piano" ? "ブロックの段数" : "1マスをたたける回数") + '</span><select data-p="rows">' +
          optList("rows", MELODY_ROW_CHOICES, function (x) { return x; }, function (x) {
            return lay === "piano" ? x + "段（同じ音が" + (x * 2) + "回）" : (lay === "drums" || lay === "perc" ? (x * 2) + "回" : x + "回");
          }) + '</select></label>';
      }
      html += '<label class="melody-row"><span>ブロックの横スクロール</span><select data-p="scroll">' +
        optList("scroll", MELODY_SCROLL_NAMES, function (x, i) { return i; }, function (x) { return x; }) + '</select></label>';
      if (lay !== "pos") {
        html += '<div class="melody-checks"><label><input type="checkbox" data-p="autoTone"' + (prefs.autoTone ? " checked" : "") + '> ブロックの音色を楽器に合わせる（' +
          escHtml(gmLabel(MELODY_LAYOUT_PROG[lay])) + '）</label>' +
          '<span class="small" style="color:#adb5bd;">' + (lay === "piano" ? "本物の鍵盤と同じ音程。スケール内の鍵に色の点が付きます" :
            (lay === "drums" || lay === "perc" ? "GMドラム（ch10）の音。和音にはなりません" : "標準チューニング・開放弦〜12フレット")) + '</span></div>';
      }
      return html;
    }
    // §158 v0.77: テンポ・伴奏・コード進行の設定行
    function tempoRows() {
      var html = '<div class="melody-section-title">&#x1F941; テンポ・伴奏</div>' +
        '<label class="melody-row"><span>テンポ（拍に合わせる）</span><select data-p="bpm">' +
        optList("bpm", MELODY_BPMS, function (x) { return x; }, function (x) { return x ? x + " BPM" : "なし（すぐ鳴る）"; }) + '</select></label>';
      if (prefs.bpm) {
        html += '<label class="melody-row"><span>合わせる細かさ</span><select data-p="quant">' +
          optList("quant", [8, 16], function (x) { return x; }, function (x) { return x + "分音符"; }) + '</select></label>' +
          '<label class="melody-row"><span>伴奏ドラム</span><select data-p="groove">' +
          optList("groove", MELODY_GROOVES, function (x) { return x.id; }, function (x) { return x.name; }) + '</select></label>';
      } else {
        html += '<p class="small" style="color:#adb5bd;margin:0 0 4px;">テンポを選ぶと、当たった音が拍に合わせて鳴り、伴奏ドラムも使えます。</p>';
      }
      html += '<label class="melody-row"><span>コード進行</span><select data-p="progId">' +
        optList("progId", MELODY_PROGRESSIONS, function (x) { return x.id; }, function (x) { return x.name; }) + '</select></label>';
      if (prefs.progId !== "none") {
        html += '<div class="melody-checks"><label><input type="checkbox" data-p="pad"' + (prefs.pad ? " checked" : "") + '> コードを伴奏で鳴らす（ストリングス）</label>' +
          '<span class="small" style="color:#adb5bd;">1小節ごとにコードが変わり、ブロック（いつもの配置）と壁の音がいまのコードの音に寄ります。パドルはコードの根音。' +
          (prefs.bpm ? "" : "テンポなしのときは 120BPM の速さで進みます。") + '</span></div>';
      }
      return html;
    }
    function sampleStatusText() {
      if (!prefs.samples) { return "合成音だけで鳴らします"; }
      var progs = melodyProgList(prefs.prog), names = [], loading = 0, ready = 0, err = 0, i;
      for (i = 0; i < progs.length; i++) {
        var n = MELODY_SAMPLE_FILES[progs[i]];
        if (!n || names.indexOf(n) >= 0) { continue; }
        names.push(n);
        var st = melodySamples.state[n];
        if (st === "ready") { ready++; } else if (st === "error") { err++; } else { loading++; }
      }
      if (!names.length) { return "選んだ音色に🎙はありません（合成音で鳴ります）"; }
      if (loading) { return "🎙 本物の音を読み込み中…（" + ready + "/" + names.length + "）"; }
      if (err) { return "🎙 一部の音を読み込めませんでした（合成音で鳴ります）"; }
      return "🎙 本物の音 準備OK（" + ready + "音色） ／ FluidR3 GM・CC BY 3.0";
    }
    // 選んだ音色のサンプルを読み込み、終わったら（まだこの画面なら）表示を更新
    function loadSamplesForPrefs() {
      melodySamples.enabled = !!prefs.samples;
      if (!prefs.samples) { return; }
      var progs = melodyProgList(prefs.prog), need = false;
      for (var i = 0; i < progs.length; i++) {
        var n = MELODY_SAMPLE_FILES[progs[i]], st = n ? melodySamples.state[n] : "ready";
        if (st !== "ready" && st !== "error") { need = true; }
      }
      if (!need) { return; }
      melodyLoadSamples(progs, function () { if (setupState && setupState.root === root) { render(); } });
    }
    function fxSelect(key, label) {
      var html = '<label class="melody-row"><span>' + label + '</span><select data-p="' + key + '">';
      for (var i = 0; i < MELODY_FX_NAMES.length; i++) {
        html += '<option value="' + i + '"' + (i === prefs[key] ? " selected" : "") + ">" + MELODY_FX_NAMES[i] + "</option>";
      }
      return html + "</select></label>";
    }
    function midiStatusText() {
      if (melodyMidi.status === "unsupported") { return "このブラウザはWeb MIDIに対応していません（パソコンのChrome/Edgeなら使えます）"; }
      if (melodyMidi.status === "denied") { return "MIDI機器へのアクセスが許可されませんでした"; }
      if (melodyMidi.status === "asking") { return "MIDI機器を探しています…"; }
      if (melodyMidi.status === "ok") {
        return melodyMidiOutputs().length ? "出力先にMIDI機器を選ぶと、本物のGM音源で鳴ります" : "MIDI出力が見つかりませんでした";
      }
      return "Windows の Chrome/Edge なら「Microsoft GS Wavetable Synth」で本物のGM音色が鳴らせます";
    }
    function applyOutput() {
      melodySelectOutput(prefs.output);
      if (prefs.output !== "synth" && !melodyMidi.out && melodyMidi.access) { prefs.output = "synth"; }
    }
    function startTones() {
      if (melodyMidi.out) { melodyMidiPrograms(prefs.prog); } else { melodyAudioInit(); }
      melodySetFx(prefs.fxRev, prefs.fxDly);
    }
    function preview() {
      startTones();
      var sc = melodyScale(prefs.scale), n = sc.iv.length, t = perfNow() + 60, i, j;
      if (prefs.chord > 1) {
        // 和音モード: I → IV → V → I（スケールの1・4・5・1番目の音を根音に）
        var roots = [0, Math.min(3, n - 1), Math.min(4, n - 1), 0];
        for (i = 0; i < roots.length; i++) {
          var ms = melodyChordMidis(sc, prefs.key, n + roots[i], prefs.chord, 0), lv = 1 / Math.sqrt(ms.length);
          for (j = 0; j < ms.length; j++) { melodyNote(ms[j], "b", prefs.prog, t + i * 600 + (prefs.arp ? j * 45 : 0), lv); }
        }
        return;
      }
      for (i = 0; i <= n; i++) { melodyNote(melodyDegreeToMidi(sc, prefs.key, n + i), "b", prefs.prog, t + i * 160); }
    }
    function previewTone(v) {
      startTones();
      var sc = melodyScale(prefs.scale), n = sc.iv.length, base = v === "s" ? 0 : n, t = perfNow() + 60;
      var degs = [0, 2, 4, 7];
      for (var i = 0; i < degs.length; i++) {
        var d = Math.min(3 * n - 1, base + Math.round(degs[i] * n / 7));
        melodyNote(melodyDegreeToMidi(sc, prefs.key, d) - (v === "s" ? 12 : 0), v, prefs.prog, t + i * 220);
      }
    }
    function render() {
      var recs = melodyLoadRecs(), i;
      var html = '<div class="melody-setup">' +
        '<h3 style="margin:0 0 4px;">&#x1F3B9; メロディくずし</h3>' +
        '<p class="small" style="color:#adb5bd;margin:0 0 8px;">ボールが当たった場所で音が鳴るブロックくずし。左ほど低く、右と上ほど高い音になるよ。</p>' +
        '<label class="melody-row"><span>音の決め方</span><select data-p="mode">';
      for (i = 0; i < MELODY_MODES.length; i++) {
        html += '<option value="' + MELODY_MODES[i].id + '"' + (MELODY_MODES[i].id === prefs.mode ? " selected" : "") + ">" + MELODY_MODES[i].name + "</option>";
      }
      html += '</select></label>' +
        layoutRows() +
        '<label class="melody-row"><span>スケール</span><select data-p="scale">' + scaleOptions() + '</select></label>' +
        '<label class="melody-row"><span>キー（主音）</span><select data-p="key">';
      for (i = 0; i < 12; i++) { html += '<option value="' + i + '"' + (i === prefs.key ? " selected" : "") + ">" + NOTE_NAMES[i] + "</option>"; }
      html += '</select></label>' +
        '<label class="melody-row"><span>和音</span><select data-p="chord">';
      for (i = 0; i < MELODY_CHORDS.length; i++) {
        html += '<option value="' + MELODY_CHORDS[i].n + '"' + (MELODY_CHORDS[i].n === prefs.chord ? " selected" : "") + ">" + MELODY_CHORDS[i].name + "</option>";
      }
      html += '</select></label>' +
        '<label class="melody-row"><span>和音の鳴らし方</span><select data-p="arp">' +
        '<option value="0"' + (prefs.arp ? "" : " selected") + '>同時に鳴らす</option>' +
        '<option value="1"' + (prefs.arp ? " selected" : "") + '>アルペジオ（下から順に）</option></select></label>' +
        '<label class="melody-row"><span>和音を鳴らす所</span><select data-p="chordAt">';
      for (i = 0; i < MELODY_CHORD_AT.length; i++) {
        html += '<option value="' + MELODY_CHORD_AT[i].id + '"' + (MELODY_CHORD_AT[i].id === prefs.chordAt ? " selected" : "") + ">" + MELODY_CHORD_AT[i].name + "</option>";
      }
      html += '</select></label>' + tempoRows() +
        '<details class="melody-tones"' + (melodyToneOpen ? " open" : "") + '><summary>&#x1F3BB; 音色（GM）</summary>';
      for (i = 0; i < MELODY_VOICES.length; i++) {
        var mv = MELODY_VOICES[i];
        if (mv.hidden) { continue; }
        html += '<div class="melody-row"><span>' + mv.name + '</span>' +
          '<select data-prog="' + mv.id + '">' + gmOptions(prefs.prog[mv.id]) + '</select>' +
          '<button class="arcade-mini-btn" data-m="tone" data-v="' + mv.id + '" title="試し聴き">&#x1F508;</button></div>';
      }
      html += '<button class="modal-btn melody-small-btn" data-m="tone-reset">↺ 音色を最初に戻す</button></details>' +
        '<div class="melody-checks"><label><input type="checkbox" data-p="samples"' + (prefs.samples ? " checked" : "") + '> &#x1F399;&#xFE0F; 本物の楽器サンプルを使う（🎙の付いた音色）</label>' +
        '<span class="small" style="color:#adb5bd;">' + escHtml(sampleStatusText()) + '</span></div>' +
        fxSelect("fxRev", "リバーブ（残響）") + fxSelect("fxDly", "ディレイ（やまびこ）") +
        '<label class="melody-row"><span>出力先</span><select data-p="output">' + outputOptions() + '</select></label>' +
        '<div class="melody-midi-line"><button class="modal-btn melody-small-btn" data-m="midi-scan">&#x1F50C; MIDI機器を探す</button>' +
        '<span class="small">' + escHtml(midiStatusText()) + '</span></div>' +
        '<div class="melody-checks">' +
        '<label><input type="checkbox" data-p="sound"' + (prefs.sound ? " checked" : "") + '> &#x1F50A; 音を鳴らす</label>' +
        '<label><input type="checkbox" data-p="rec"' + (prefs.rec ? " checked" : "") + '> &#x1F399;&#xFE0F; 録音する</label>' +
        '<label><input type="checkbox" data-p="relax"' + (prefs.relax ? " checked" : "") + '> &#x1F33F; のんびり（ボールを落としても減らない）</label>' +
        '</div>' +
        '<div class="melody-actions">' +
        '<button class="modal-btn" data-m="preview">&#x1F508; スケール試し聴き</button>' +
        '<button class="modal-btn" data-m="start">&#x25B6;&#xFE0F; スタート</button>' +
        '</div>' +
        '<h4 style="margin:12px 0 4px;">&#x1F399;&#xFE0F; 録音リスト（最大' + MELODY_REC_MAX + '件）</h4>' +
        (melodyWavMsg ? '<p class="small" style="color:#ffd166;margin:0 0 6px;">' + escHtml(melodyWavMsg) + '</p>' : '');
      if (!recs.length) {
        html += '<p class="small" style="color:#6c757d;">まだ録音はありません。「録音する」をONにして遊ぶと、ゲーム終了時に保存されます。</p>';
      }
      for (i = 0; i < recs.length; i++) {
        var r = recs[i], playing = melodyPlayback && melodyPlayback.id === r.id;
        html += '<div class="melody-rec">' +
          '<div class="melody-rec-info"><b>' + melodyRecLabel(r) + '</b>' +
          '<span class="small">' + NOTE_NAMES[r.key || 0] + ' ' + escHtml(melodyScale(r.scale).name) + (r.mode === "rand" ? " 🎲" : " 📍") +
          (r.chord > 1 ? " / " + r.chord + "和音" + (r.arp ? "・アルペジオ" : "") : "") +
          (r.layout && r.layout !== "pos" ? " / " + melodyLayoutName(r.layout) : "") + '</span>' +
          '<span class="small" style="color:#adb5bd;">' + r.notes.length + '音 / SCORE ' + (r.score || 0) + ' / ' + escHtml(gmLabel(melodyProgOf(r.prog, "b"))) + '</span></div>' +
          '<button class="arcade-mini-btn" data-m="' + (playing ? "stop" : "play") + '" data-id="' + r.id + '" title="再生">' + (playing ? "&#x23F9;" : "&#x25B6;&#xFE0F;") + '</button>' +
          '<button class="arcade-mini-btn melody-midi-btn" data-m="midi" data-id="' + r.id + '" title="MIDIファイルで保存">&#x1F4BE; MIDI</button>' +
          '<button class="arcade-mini-btn melody-midi-btn" data-m="wav" data-id="' + r.id + '" title="音声ファイル(WAV)で保存・共有"' + (melodyWavBusy ? " disabled" : "") + '>' +
          (melodyWavBusy === r.id ? "作成中…" : "&#x1F3A7; WAV") + '</button>' +
          '<button class="arcade-mini-btn" data-m="del" data-id="' + r.id + '" title="削除">&#x1F5D1;&#xFE0F;</button>' +
          '</div>';
      }
      html += '<button class="modal-btn" data-m="back" style="width:100%;margin-top:10px;">&#x1F579;&#xFE0F; メニューへ</button></div>';
      root.innerHTML = html;

      var sels = root.querySelectorAll("select[data-p]");
      for (i = 0; i < sels.length; i++) {
        sels[i].onchange = function (ev) {
          var k = ev.currentTarget.getAttribute("data-p"), v = ev.currentTarget.value;
          if (k === "fxRev" || k === "fxDly") { prefs[k] = parseInt(v, 10); melodySetFx(prefs.fxRev, prefs.fxDly); }
          else if (k === "oct" || k === "rows" || k === "scroll") { prefs[k] = parseInt(v, 10); if (prefs.layout === "piano") { savePrefs(); render(); return; } }
          else if (k === "bpm" || k === "quant") { prefs[k] = parseInt(v, 10); savePrefs(); render(); return; }
          else if (k === "progId") { prefs[k] = v; savePrefs(); render(); return; }
          else if (k === "layout") { prefs[k] = v; savePrefs(); render(); return; }
          else if (k === "key" || k === "chord") { prefs[k] = parseInt(v, 10); }
          else if (k === "arp") { prefs[k] = v === "1"; }
          else { prefs[k] = v; }
          if (k === "output") { applyOutput(); }
          savePrefs();
        };
      }
      var progSels = root.querySelectorAll("select[data-prog]");
      for (i = 0; i < progSels.length; i++) {
        progSels[i].onchange = function (ev) {
          prefs.prog[ev.currentTarget.getAttribute("data-prog")] = parseInt(ev.currentTarget.value, 10);
          prefs.prog = melodyCleanProg(prefs.prog);
          savePrefs();
          render();
        };
      }
      var chks = root.querySelectorAll("input[data-p]");
      for (i = 0; i < chks.length; i++) {
        chks[i].onchange = function (ev) {
          prefs[ev.currentTarget.getAttribute("data-p")] = !!ev.currentTarget.checked;
          savePrefs();
          if (ev.currentTarget.getAttribute("data-p") === "samples") { render(); }
        };
      }
      var det = root.querySelector ? root.querySelector("details.melody-tones") : null;
      if (det) { det.addEventListener("toggle", function () { melodyToneOpen = !!det.open; }); }
      var btns = root.querySelectorAll("button[data-m]");
      for (i = 0; i < btns.length; i++) { btns[i].onclick = onButton; }
      loadSamplesForPrefs();
    }
    function findRec(id) {
      var recs = melodyLoadRecs();
      for (var i = 0; i < recs.length; i++) { if (recs[i].id === id) { return recs[i]; } }
      return null;
    }
    function scanMidi() {
      melodyRequestMidi(function () {
        applyOutput();
        render();
      });
      render();
    }
    function onButton(ev) {
      var m = ev.currentTarget.getAttribute("data-m"), id = parseInt(ev.currentTarget.getAttribute("data-id"), 10);
      if (m === "start") {
        if (prefs.sound) { startTones(); }
        melodyStopPlayback(true);
        ctl.done({ mode: prefs.mode, scale: prefs.scale, key: prefs.key, sound: prefs.sound, rec: prefs.rec, relax: prefs.relax, prog: melodyCleanProg(prefs.prog),
          chord: prefs.chord, arp: prefs.arp, chordAt: prefs.chordAt, samples: prefs.samples,
          layout: prefs.layout, oct: prefs.oct, rows: prefs.rows, scroll: prefs.scroll, autoTone: prefs.autoTone,
          bpm: prefs.bpm, quant: prefs.quant, groove: prefs.groove, progId: prefs.progId, pad: prefs.pad });
      } else if (m === "preview") {
        preview();
      } else if (m === "tone") {
        previewTone(ev.currentTarget.getAttribute("data-v"));
      } else if (m === "tone-reset") {
        prefs.prog = melodyDefaultProg();
        savePrefs();
        render();
      } else if (m === "midi-scan") {
        scanMidi();
      } else if (m === "back") {
        ctl.back();
      } else if (m === "play") {
        var r = findRec(id);
        if (r) { melodyStartPlayback(r, render); render(); }
      } else if (m === "stop") {
        melodyStopPlayback();
      } else if (m === "midi") {
        var r2 = findRec(id);
        if (r2) { melodyDownloadMidi(r2); }
      } else if (m === "wav") {
        var r3 = findRec(id);
        if (r3) {
          melodyExportWav(r3, function (st, sec) {
            melodyWavMsg = st === "busy" ? "🎧 WAVを作っています…（長い録音は少し時間がかかります）" :
              (st === "fail" ? "WAVを作れませんでした（このブラウザでは未対応の可能性があります）" :
                "🎧 WAVを作りました（" + Math.round(sec) + "秒）" + (st === "cut" ? "。長いので最初の" + MELODY_WAV_MAX_SEC / 60 + "分だけ書き出しました" : ""));
            if (setupState && setupState.root === root) { render(); }
          });
        }
      } else if (m === "del") {
        if (window.confirm && !window.confirm("この録音を削除しますか？")) { return; }
        if (melodyPlayback && melodyPlayback.id === id) { melodyStopPlayback(true); }
        melodyDeleteRec(id);
        render();
      }
    }

    // 前回MIDI機器を選んでいたら、許可済みのはずなので自動で探し直す
    if (prefs.output !== "synth" && !melodyMidi.access && melodyMidi.status !== "unsupported") {
      melodyRequestMidi(function () { applyOutput(); if (setupState && setupState.root === root) { render(); } });
    } else {
      applyOutput();
    }
    render();
  }

  // ---------------------------------------------------------
  // §156 v0.75: ブロック配置モード（鍵盤・ギター・ウクレレ・ベース・ドラム・パーカッション）
  // ---------------------------------------------------------
  var MELODY_LAYOUTS = [
    { id: "pos", name: "🎵 いつもの（位置で音程が決まる）" },
    { id: "piano", name: "🎹 鍵盤（白鍵・黒鍵）" },
    { id: "guitar", name: "🎸 ギター（6弦×12フレット）" },
    { id: "ukulele", name: "🪕 ウクレレ（4弦×12フレット）" },
    { id: "bass", name: "🎸 ベース（4弦×12フレット）" },
    { id: "drums", name: "🥁 ドラムセット" },
    { id: "perc", name: "🪘 パーカッション" }
  ];
  // 楽器に合わせた音色（ブロックの音）。drums/perc はドラムキット（ch10）
  var MELODY_LAYOUT_PROG = { piano: 0, guitar: 25, ukulele: 24, bass: 32, drums: 128, perc: 128 };
  // §158 v0.77: テンポ・伴奏ドラム・コード進行
  var MELODY_BPMS = [0, 70, 90, 110, 130, 150];
  var MELODY_GROOVES = [
    { id: "none", name: "なし" },
    { id: "8beat", name: "8ビート", hits: [[36, [0, 8, 10], 0.7], [38, [4, 12], 0.6], [42, [0, 2, 4, 6, 8, 10, 12, 14], 0.3]] },
    { id: "four", name: "4つ打ち", hits: [[36, [0, 4, 8, 12], 0.75], [39, [4, 12], 0.45], [46, [2, 6, 10, 14], 0.3]] },
    { id: "shuffle", name: "シャッフル", hits: [[36, [0, 8], 0.7], [38, [4, 12], 0.55], [42, [0, 3, 4, 7, 8, 11, 12, 15], 0.3]] },
    { id: "ballad", name: "バラード", hits: [[36, [0, 10], 0.6], [37, [8], 0.45], [42, [0, 4, 8, 12], 0.25], [51, [0], 0.2]] },
    { id: "bossa", name: "ボサノバ", hits: [[36, [0, 3, 8, 11], 0.55], [37, [0, 3, 6, 10, 13], 0.4], [42, [0, 2, 4, 6, 8, 10, 12, 14], 0.2]] },
    { id: "latin", name: "ラテン（クラーベ）", hits: [[75, [0, 3, 6, 10, 12], 0.45], [63, [2, 7, 10, 15], 0.45], [64, [4, 12], 0.5], [56, [0, 4, 8, 12], 0.3], [36, [0, 8], 0.5]] }
  ];
  // コード進行: [根音（キーからの半音）, 種類]
  var MELODY_CHORD_TYPES = { "": [0, 4, 7], m: [0, 3, 7], "7": [0, 4, 7, 10], M7: [0, 4, 7, 11], m7: [0, 3, 7, 10] };
  var MELODY_PROGRESSIONS = [
    { id: "none", name: "なし" },
    { id: "ohdo", name: "王道 I–V–vi–IV", seq: [[0, ""], [7, ""], [9, "m"], [5, ""]] },
    { id: "fifties", name: "50s I–vi–IV–V", seq: [[0, ""], [9, "m"], [5, ""], [7, ""]] },
    { id: "canon", name: "カノン I–V–vi–iii–IV–I–IV–V", seq: [[0, ""], [7, ""], [9, "m"], [4, "m"], [5, ""], [0, ""], [5, ""], [7, ""]] },
    { id: "jpop", name: "J-POP王道 IV–V–iii–vi", seq: [[5, "M7"], [7, "7"], [4, "m7"], [9, "m"]] },
    { id: "komuro", name: "小室進行 vi–IV–V–I", seq: [[9, "m"], [5, ""], [7, ""], [0, ""]] },
    { id: "twofive", name: "ii–V–I", seq: [[2, "m7"], [7, "7"], [0, "M7"], [0, "M7"]] },
    { id: "blues", name: "12小節ブルース", seq: [[0, "7"], [0, "7"], [0, "7"], [0, "7"], [5, "7"], [5, "7"], [0, "7"], [0, "7"], [7, "7"], [5, "7"], [0, "7"], [7, "7"]] },
    { id: "minor", name: "マイナー i–VI–III–VII", seq: [[0, "m"], [8, ""], [3, ""], [10, ""]] }
  ];
  function melodyFindById(list, id) {
    for (var i = 0; i < list.length; i++) { if (list[i].id === id) { return list[i]; } }
    return list[0];
  }
  // 音を「いまのコードの音」のうち一番近い高さへ寄せる
  function melodySnapToChord(midi, pcs) {
    for (var d = 0; d <= 6; d++) {
      if (pcs.indexOf(((midi - d) % 12 + 12) % 12) >= 0) { return midi - d; }
      if (pcs.indexOf(((midi + d) % 12 + 12) % 12) >= 0) { return midi + d; }
    }
    return midi;
  }
  // root から上へコードの音を size 個積む
  function melodyVoiceChord(root, pcs, size) {
    var out = [root], m = root;
    while (out.length < size && m < root + 36) {
      m++;
      if (pcs.indexOf(((m % 12) + 12) % 12) >= 0) { out.push(m); }
    }
    return out;
  }
  var MELODY_SCROLL_SPEED = [0, 0.25, 0.5, 1.0];
  var MELODY_SCROLL_NAMES = ["なし", "ゆっくり", "ふつう", "はやい"];
  var MELODY_ROW_CHOICES = [2, 3, 4, 6];
  // 弦は上から1弦（タブ譜と同じ並び）
  var MELODY_STRINGS = { guitar: [64, 59, 55, 50, 45, 40], ukulele: [69, 64, 60, 67], bass: [43, 38, 33, 28] };
  var MELODY_WHITE_PC = [0, 2, 4, 5, 7, 9, 11];
  // ドラムセット（上から見た配置）: [名前, GMドラム番号, x, y, 幅, 高さ, 種類]
  var MELODY_DRUM_PADS = [
    ["Crash", 49, 4, 32, 56, 14, "cym"], ["Splash", 55, 64, 32, 34, 14, "cym"], ["China", 52, 102, 32, 36, 14, "cym"],
    ["Ride", 51, 142, 32, 58, 14, "cym"], ["Bell", 53, 204, 32, 32, 14, "cym"],
    ["Open HH", 46, 4, 52, 44, 12, "hat"], ["Hi Tom", 50, 54, 52, 40, 16, "tom"], ["Mid Tom", 48, 100, 52, 40, 16, "tom"],
    ["Low Tom", 47, 146, 52, 40, 16, "tom"], ["Crash 2", 57, 192, 52, 44, 12, "cym"],
    ["Closed HH", 42, 4, 70, 44, 12, "hat"], ["Snare", 38, 54, 74, 50, 18, "snare"], ["Side Stick", 37, 108, 74, 34, 12, "snare"],
    ["Floor Tom", 43, 146, 74, 44, 18, "tom"], ["Low Floor", 41, 194, 74, 42, 18, "tom"],
    ["Pedal HH", 44, 4, 88, 44, 12, "hat"], ["Clap", 39, 108, 92, 34, 12, "snare"], ["Kick", 36, 54, 98, 50, 18, "kick"],
    ["Kick 2", 35, 146, 98, 44, 18, "kick"], ["Tamb", 54, 194, 98, 42, 12, "perc"]
  ];
  var MELODY_PERC_PADS = [
    ["Hi Bongo", 60], ["Lo Bongo", 61], ["Mute Conga", 62], ["Open Conga", 63], ["Low Conga", 64],
    ["Hi Timbale", 65], ["Lo Timbale", 66], ["Hi Agogo", 67], ["Lo Agogo", 68], ["Cabasa", 69],
    ["Maracas", 70], ["S.Whistle", 71], ["L.Whistle", 72], ["S.Guiro", 73], ["L.Guiro", 74],
    ["Claves", 75], ["Hi Wood", 76], ["Lo Wood", 77], ["Mute Cuica", 78], ["Open Cuica", 79],
    ["Mute Tri", 80], ["Open Tri", 81], ["Tambourine", 54], ["Cowbell", 56], ["Vibraslap", 58]
  ];
  var MELODY_DRUM_NAMES = {};
  (function () {
    var i;
    for (i = 0; i < MELODY_DRUM_PADS.length; i++) { MELODY_DRUM_NAMES[MELODY_DRUM_PADS[i][1]] = MELODY_DRUM_PADS[i][0]; }
    for (i = 0; i < MELODY_PERC_PADS.length; i++) { MELODY_DRUM_NAMES[MELODY_PERC_PADS[i][1]] = MELODY_PERC_PADS[i][0]; }
  })();

  // 配置を作る。戻り値 { bricks: [...], span: 横スクロールで1周する幅, frets: フレット線の位置 }
  // brick: { x0, y, w, h, hp, maxHp, midi, kind, label, deg?, row? }
  function melodyBuildLayout(lay, o) {
    var bricks = [], i, r, top = 32;
    var rows = o.rows || 3, scrolling = (o.scroll || 0) > 0, x0 = 4, avail = W - 8;
    if (lay === "piano") {
      var oct = clamp(o.oct || 2, 1, 6), nWhite = 7 * oct + 1, startC = 60 - 12 * Math.floor(oct / 2);
      var ww = scrolling ? Math.max(avail / nWhite, 14) : avail / nWhite, bw = ww * 0.62, h = 9;
      var hasBlackAfter = function (wi) { var pc = MELODY_WHITE_PC[wi % 7]; return wi < nWhite - 1 && pc !== 4 && pc !== 11; };
      for (i = 0; i < nWhite; i++) {
        var wm = startC + 12 * Math.floor(i / 7) + MELODY_WHITE_PC[i % 7], wx = x0 + i * ww;
        var cutL = (i > 0 && hasBlackAfter(i - 1)) ? bw / 2 : 0, cutR = hasBlackAfter(i) ? bw / 2 : 0;
        for (r = 0; r < rows; r++) {
          // 奥（黒鍵ゾーン）の白鍵は黒鍵のぶん細い
          bricks.push({ x0: wx + cutL + 0.5, y: top + r * h, w: Math.max(1, ww - cutL - cutR - 1), h: h - 1, hp: 1, maxHp: 1, midi: wm, kind: "white" });
          // 手前の白鍵は全幅
          bricks.push({ x0: wx + 0.5, y: top + (rows + r) * h, w: ww - 1, h: h - 1, hp: 1, maxHp: 1, midi: wm, kind: "white", front: r === rows - 1 });
        }
        if (hasBlackAfter(i)) {
          for (r = 0; r < rows; r++) {
            bricks.push({ x0: wx + ww - bw / 2, y: top + r * h, w: bw, h: h - 1, hp: 1, maxHp: 1, midi: wm + 1, kind: "black" });
          }
        }
      }
      return { bricks: bricks, span: Math.max(W, nWhite * ww + (scrolling ? 16 : 0)), frets: [] };
    }
    if (lay === "guitar" || lay === "ukulele" || lay === "bass") {
      var strs = MELODY_STRINGS[lay], nCol = 13, cw = scrolling ? Math.max(avail / nCol, 18) : avail / nCol, sh = lay === "guitar" ? 12 : 15;
      var frets = [];
      for (i = 0; i < nCol; i++) { frets.push(x0 + i * cw); }
      for (var s = 0; s < strs.length; s++) {
        for (i = 0; i < nCol; i++) {
          bricks.push({ x0: x0 + i * cw + 0.5, y: top + s * (sh + 3), w: cw - 1, h: sh, hp: rows, maxHp: rows, midi: strs[s] + i, kind: "fret", fret: i, str: s });
        }
      }
      return { bricks: bricks, span: Math.max(W, nCol * cw + (scrolling ? 16 : 0)), frets: frets };
    }
    if (lay === "drums") {
      for (i = 0; i < MELODY_DRUM_PADS.length; i++) {
        var d = MELODY_DRUM_PADS[i];
        bricks.push({ x0: d[2], y: d[3], w: d[4], h: d[5], hp: rows * 2, maxHp: rows * 2, midi: d[1], kind: "pad", pad: d[6], label: d[0] });
      }
      return { bricks: bricks, span: W + (scrolling ? 16 : 0), frets: [] };
    }
    if (lay === "perc") {
      var pw = avail / 5;
      for (i = 0; i < MELODY_PERC_PADS.length; i++) {
        var pp = MELODY_PERC_PADS[i];
        bricks.push({ x0: x0 + (i % 5) * pw + 1, y: top + Math.floor(i / 5) * 17, w: pw - 2, h: 15, hp: rows * 2, maxHp: rows * 2, midi: pp[1], kind: "pad", pad: "perc" + (Math.floor(i / 5) % 5), label: pp[0] });
      }
      return { bricks: bricks, span: W + (scrolling ? 16 : 0), frets: [] };
    }
    // いつもの（位置で音程）
    var scale = o.scale, key = o.key || 0, level = o.level || 1;
    for (r = 0; r < 6; r++) {
      for (i = 0; i < 8; i++) {
        var bx = 9 + i * 28, by = 36 + r * 14, deg = melodyPosDegree(scale, bx + 13, by + 5);
        bricks.push({ x0: bx, y: by, w: 26, h: 10, hp: (level >= 2 && r === 0) ? 2 : 1, maxHp: (level >= 2 && r === 0) ? 2 : 1,
          deg: deg, midi: melodyDegreeToMidi(scale, key, deg), kind: "pos", row: r });
      }
    }
    return { bricks: bricks, span: W + (scrolling ? 16 : 0), frets: [] };
  }

  // GMドラム（ch10）の内蔵音: 番号ごとの鳴らし方
  // type: kick / snare / clap / hat / tom / cym / bell / tamb / cowbell / skin / wood / shaker / whistle / guiro / cuica / tri / vibra
  var GM_DRUM_SYNTH = {
    35: ["kick", 120], 36: ["kick", 150], 37: ["stick", 0], 38: ["snare", 190], 39: ["clap", 0], 40: ["snare", 220],
    41: ["tom", 70], 42: ["hat", 0.05], 43: ["tom", 85], 44: ["hat", 0.09], 45: ["tom", 100], 46: ["hat", 0.45],
    47: ["tom", 120], 48: ["tom", 140], 49: ["cym", 1.6], 50: ["tom", 165], 51: ["cym", 1.2], 52: ["cym", 1.3],
    53: ["bell", 620], 54: ["tamb", 0], 55: ["cym", 0.7], 56: ["cowbell", 560], 57: ["cym", 1.6], 58: ["vibra", 0], 59: ["cym", 1.2],
    60: ["skin", 420], 61: ["skin", 300], 62: ["skin", 260, 0.08], 63: ["skin", 240], 64: ["skin", 180],
    65: ["skin", 520, 0.4], 66: ["skin", 380, 0.4], 67: ["bell", 920], 68: ["bell", 680], 69: ["shaker", 0.08], 70: ["shaker", 0.05],
    71: ["whistle", 0.12], 72: ["whistle", 0.45], 73: ["guiro", 0.12], 74: ["guiro", 0.4], 75: ["wood", 2500],
    76: ["wood", 1000], 77: ["wood", 760], 78: ["cuica", 0.15], 79: ["cuica", 0.35], 80: ["tri", 0.15], 81: ["tri", 1.2]
  };
  function melodyDrum(ac, m, t, level) {
    var env = ac.createGain(), out = melodyLevelOut(ac, level);
    env.connect(out);
    var spec = GM_DRUM_SYNTH[m] || (m < 45 ? ["kick", 150] : (m < 58 ? ["tom", 70 + (m - 45) * 14] : (m < 67 ? ["snare", 190] : ["hat", m > 74 ? 0.5 : 0.07])));
    var type = spec[0], p = spec[1], dur = 0.3, o;
    function tone(wave, f0, f1, d, lv) {
      var oo = ac.createOscillator(), g = ac.createGain();
      oo.type = wave;
      oo.frequency.setValueAtTime(f0, t);
      if (f1 && f1 !== f0) { oo.frequency.exponentialRampToValueAtTime(f1, t + d); }
      g.gain.setValueAtTime(lv, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      oo.connect(g);
      g.connect(env);
      oo.start(t);
      oo.stop(t + d + 0.05);
    }
    env.gain.setValueAtTime(1, t);
    if (type === "kick") { dur = 0.35; tone("sine", p, 42, 0.3, 0.95); melodyNoise(ac, t, 0.01, 0.3, env, "lowpass", 3000); }
    else if (type === "snare") { dur = 0.22; melodyNoise(ac, t, 0.2, 0.7, env, "highpass", 1500); tone("triangle", p, p * 0.8, 0.1, 0.5); }
    else if (type === "stick") { dur = 0.06; tone("square", 1700, 1500, 0.04, 0.35); melodyNoise(ac, t, 0.03, 0.4, env, "bandpass", 3000); }
    else if (type === "clap") {
      dur = 0.25;
      for (var ci = 0; ci < 3; ci++) { melodyNoise(ac, t + ci * 0.012, 0.03, 0.5, env, "bandpass", 1200); }
      melodyNoise(ac, t + 0.036, 0.18, 0.4, env, "bandpass", 1100);
    }
    else if (type === "hat") { dur = p; melodyNoise(ac, t, p, 0.5, env, "highpass", 7500); }
    else if (type === "tom") { dur = 0.4; tone("sine", p * 1.6, p, 0.35, 0.8); melodyNoise(ac, t, 0.02, 0.2, env, "lowpass", 2000); }
    else if (type === "cym") { dur = p; melodyNoise(ac, t, p, 0.45, env, "highpass", 5000); tone("square", 4200, 4000, Math.min(0.5, p), 0.03); }
    else if (type === "bell") { dur = 0.6; tone("square", p, p, 0.5, 0.12); tone("sine", p * 1.5, p * 1.5, 0.4, 0.15); }
    else if (type === "tamb") { dur = 0.3; for (var ti = 0; ti < 4; ti++) { melodyNoise(ac, t + ti * 0.02, 0.06, 0.35, env, "highpass", 8000); } }
    else if (type === "cowbell") { dur = 0.4; tone("square", p, p, 0.35, 0.18); tone("square", p * 1.48, p * 1.48, 0.3, 0.12); }
    else if (type === "skin") { dur = spec[2] || 0.3; tone("sine", p * 1.25, p, dur, 0.75); melodyNoise(ac, t, 0.015, 0.2, env, "bandpass", p * 4); }
    else if (type === "wood") { dur = 0.08; tone("sine", p, p * 0.95, 0.06, 0.7); }
    else if (type === "shaker") { dur = p; melodyNoise(ac, t, p, 0.45, env, "highpass", 6000); }
    else if (type === "whistle") { dur = p; tone("sine", 2400, 2300, p, 0.35); }
    else if (type === "guiro") { dur = p; for (var gi = 0; gi < Math.round(p / 0.025); gi++) { melodyNoise(ac, t + gi * 0.025, 0.012, 0.35, env, "bandpass", 3500); } }
    else if (type === "cuica") { dur = p; tone("sine", 320, 640, p, 0.6); }
    else if (type === "tri") { dur = p; tone("sine", 4100, 4100, p, 0.25); tone("sine", 5300, 5300, p * 0.8, 0.12); }
    else if (type === "vibra") { dur = 0.6; for (var vi = 0; vi < 12; vi++) { melodyNoise(ac, t + vi * 0.04, 0.02, 0.3 * (1 - vi / 12), env, "bandpass", 2500); } }
    env.gain.setValueAtTime(1, t + dur);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
  }

  function melodyLayoutName(id) {
    for (var i = 0; i < MELODY_LAYOUTS.length; i++) { if (MELODY_LAYOUTS[i].id === id) { return MELODY_LAYOUTS[i].name.split("（")[0]; } }
    return "";
  }

  register({
    id: "melody",
    after: "breakout",
    music: true,
    name: "メロディくずし",
    icon: "&#x1F3B9;",
    desc: "当たった場所で音が鳴る！スケールやキーを選べて録音もできる",
    help: "←→移動 / Space発射 / 画面ドラッグで移動・タップで発射 / P一時停止",
    controls: [
      { action: "left", label: "&#x25C0;" },
      { action: "launch", label: "&#x1F680; 発射" },
      { action: "right", label: "&#x25B6;" }
    ],
    keys: { "ArrowLeft": "left", "ArrowRight": "right", " ": "launch", "ArrowUp": "launch" },
    setup: melodySetup,
    create: function (api, cfg) {
      cfg = cfg || melodyLoadPrefs(false);
      var scale = melodyScale(cfg.scale), key = cfg.key || 0, nDeg = scale.iv.length * 3;
      var layout = cfg.layout || "pos", isPerc = layout === "drums" || layout === "perc";
      var rowsSet = cfg.rows || 3, scrollSpd = MELODY_SCROLL_SPEED[cfg.scroll || 0] || 0;
      var PW = 44, PH = 6, PY = 292, BR = 4;
      var pad = { x: W / 2 };
      var held = { left: false, right: false };
      var ball = { x: W / 2, y: PY - BR - 1, vx: 0, vy: 0 };
      var stuck = true, lives = 3, level = 1, bricks = [], span = W, frets = [], msg = 0, frame = 0, offset = 0;
      var notes = [], pops = [], recFull = false;
      var prog = melodyCleanProg(cfg.prog);
      // §156: 楽器ブロックに合わせてブロックの音色を切り替える
      if (cfg.autoTone !== false && MELODY_LAYOUT_PROG[layout] !== undefined) {
        prog.b = MELODY_LAYOUT_PROG[layout];
        prog.p = MELODY_LAYOUT_PROG[layout];
      }
      melodySamples.enabled = cfg.samples !== false; // §155 v0.74
      melodyLoadSamples(melodyProgList(prog));
      if (cfg.sound) {
        if (melodyMidi.out) { melodyMidiPrograms(prog); } else { melodyAudioInit(); }
      }

      var chordSize = (cfg.chord === 3 || cfg.chord === 4 || cfg.chord === 5) ? cfg.chord : 1;
      var chordAt = cfg.chordAt || "bw";
      // §158 v0.77: テンポ・伴奏・コード進行（時間はゲーム内フレーム基準＝一時停止で止まる）
      var bpm = MELODY_BPMS.indexOf(cfg.bpm) > 0 ? cfg.bpm : 0, quant = cfg.quant === 16 ? 16 : 8;
      var groove = melodyFindById(MELODY_GROOVES, cfg.groove), progn = melodyFindById(MELODY_PROGRESSIONS, cfg.progId);
      var useGroove = groove.id !== "none" && bpm > 0, useProg = progn.id !== "none", usePad = useProg && cfg.pad !== false;
      var stepMs = 60000 / (bpm || 120) / 4, nextStep = 0;
      function songMs() { return frame * 1000 / 60; }
      function chordInfo(bar) {
        var c = progn.seq[((bar % progn.seq.length) + progn.seq.length) % progn.seq.length], root = (key + c[0]) % 12, iv = MELODY_CHORD_TYPES[c[1]], pcs = [];
        for (var i = 0; i < iv.length; i++) { pcs.push((root + iv[i]) % 12); }
        return { root: root, pcs: pcs, name: NOTE_NAMES[root] + c[1] };
      }
      function curChord() { return chordInfo(Math.floor(songMs() / (stepMs * 16))); }
      // 次の拍（8分 or 16分）までの待ち時間（ms）
      function quantDelay() {
        if (!bpm) { return 0; }
        var grid = 60000 / bpm * 4 / quant, t = songMs();
        return Math.ceil(t / grid - 1e-6) * grid - t;
      }

      function degAt(x, y) {
        return cfg.mode === "rand" ? randInt(0, nDeg - 1) : melodyPosDegree(scale, x, y);
      }
      function noteAt(x, y) { return melodyDegreeToMidi(scale, key, degAt(x, y)); }
      // 鳴り所ごとに和音にするか（§152）。ドラム・パーカッションのブロックは単音
      function sizeFor(voice) {
        if (chordSize <= 1) { return 1; }
        if (isPerc && (voice === "b" || voice === "p")) { return 1; }
        if (chordAt === "all") { return chordSize; }
        if (chordAt === "b") { return (voice === "b" || voice === "p") ? chordSize : 1; }
        return voice === "s" ? 1 : chordSize;
      }
      // 根音の MIDI 番号から和音を作る（スケール内の音ならスケールで3度積み、外ならメジャー系）
      function chordFromMidi(root, size) {
        var n = scale.iv.length, pc = ((root - key) % 12 + 12) % 12, idx = scale.iv.indexOf(pc), out = [], i;
        if (size <= 1) { return [root]; }
        if (scale.id === "chromatic" || idx < 0) {
          var iv = [0, 4, 7, 11, 14];
          for (i = 0; i < size; i++) { out.push(root + iv[i]); }
        } else {
          for (i = 0; i < size; i++) {
            var d = idx + 2 * i;
            out.push(root - scale.iv[idx] + 12 * Math.floor(d / n) + scale.iv[d % n]);
          }
        }
        if (out[out.length - 1] > 100) { for (i = 0; i < out.length; i++) { out[i] -= 12; } }
        return out;
      }
      // 鳴らす・録音する・音名/コード名/楽器名を浮かべる
      function playMidis(midis, voice, x, y, label) {
        var lv = midis.length > 1 ? 1 / Math.sqrt(midis.length) : 1;
        var now = perfNow(), tms = Math.round(frame * 1000 / 60), qd = Math.round(quantDelay());
        for (var i = 0; i < midis.length; i++) {
          var off = qd + ((cfg.arp && i > 0) ? i * 45 : 0);
          if (cfg.sound) { melodyNote(midis[i], voice, prog, off ? now + off : 0, lv); }
          if (cfg.rec) {
            if (notes.length < MELODY_REC_NOTES_MAX) {
              var ev = [tms + off, midis[i], voice];
              if (lv < 1) { ev.push(Math.round(lv * 100) / 100); }
              notes.push(ev);
            } else { recFull = true; }
          }
        }
        if (!label) { label = midis.length > 1 ? melodyChordName(midis) : midiName(midis[0]); }
        pops.push({ x: clamp(x, 18, W - 18), y: clamp(y, 12, H - 30), text: label, t: 36, col: midiColor(midis[0]) });
        if (pops.length > 12) { pops.shift(); }
      }
      // 度数を根音に（いつもの配置・壁・パドル）
      function sound(deg, voice, x, y, shift) {
        if (useProg) {
          // §158: コード進行中は、いまのコードの音へ寄せる。パドルはコードの根音のベース
          var ci = curChord(), size = sizeFor(voice), root;
          if (voice === "s") { root = 36 + ci.root; }
          else { root = melodySnapToChord(melodyDegreeToMidi(scale, key, deg) + (shift || 0), ci.pcs); }
          playMidis(size > 1 ? melodyVoiceChord(root, ci.pcs, size) : [root], voice, x, y);
          return;
        }
        playMidis(melodyChordMidis(scale, key, deg, sizeFor(voice), shift || 0), voice, x, y);
      }
      // 伴奏の1音（予約して鳴らし、拍ちょうどの時刻で録音）
      function emitAcc(midi, voice, atMs, delay, lv) {
        if (cfg.sound) { melodyNote(midi, voice, prog, delay > 0 ? perfNow() + delay : 0, lv); }
        if (cfg.rec) {
          if (notes.length < MELODY_REC_NOTES_MAX) { notes.push([Math.round(atMs), midi, voice, lv]); }
          else { recFull = true; }
        }
      }
      // 先読みして、これから60ms以内の拍の伴奏を予約する
      function scheduleAcc() {
        if (!useGroove && !usePad) { return; }
        var t = songMs(), i, j;
        while (nextStep * stepMs <= t + 60) {
          var st = nextStep % 16, at = nextStep * stepMs, delay = Math.max(0, at - t);
          if (useGroove) {
            for (i = 0; i < groove.hits.length; i++) {
              if (groove.hits[i][1].indexOf(st) >= 0) { emitAcc(groove.hits[i][0], "d", at, delay, groove.hits[i][2]); }
            }
          }
          if (usePad && st === 0) {
            var ci = chordInfo(Math.floor(nextStep / 16)), pm = melodyVoiceChord(48 + ci.root, ci.pcs, Math.min(4, ci.pcs.length));
            for (j = 0; j < pm.length; j++) { emitAcc(pm[j], "c", at, delay, 0.3); }
          }
          nextStep++;
        }
      }
      function speed() { return Math.min(6, 3.2 + (level - 1) * 0.4); }
      function build() {
        var lo = melodyBuildLayout(layout, { rows: rowsSet, oct: cfg.oct || 2, scroll: cfg.scroll || 0, scale: scale, key: key, level: level });
        bricks = lo.bricks;
        span = lo.span;
        frets = lo.frets;
      }
      // スクロール後の表示位置（右端をはみ出した分は左側にも出す）
      function xsOf(x0, w) {
        if (!scrollSpd) { return [x0]; }
        var x = ((x0 + offset) % span + span) % span;
        return x + w > span ? [x, x - span] : [x];
      }
      function launch() {
        if (!stuck) { return; }
        stuck = false;
        var a = (Math.random() - 0.5) * 0.8;
        ball.vx = speed() * Math.sin(a);
        ball.vy = -speed() * Math.cos(a);
      }
      function resetBall() { stuck = true; ball.vx = 0; ball.vy = 0; }
      function inScale(m) { return scale.iv.indexOf(((m - key) % 12 + 12) % 12) >= 0; }

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
        finish: function (score) {
          melodyMidiAllOff();
          if (!cfg.rec || !notes.length) { return; }
          // アルペジオの時差で前後するので時刻順に並べ直す
          notes.sort(function (a, b) { return a[0] - b[0]; });
          melodySaveRec({ id: Date.now(), date: Date.now(), scale: scale.id, key: key, mode: cfg.mode, score: score, prog: prog,
            chord: chordSize, arp: !!cfg.arp, chordAt: chordAt, fxRev: melodyAudio.fxRev || 0, layout: layout,
            bpm: bpm, groove: groove.id, progId: progn.id, notes: notes });
        },
        step: function () {
          var k, s, j;
          frame++;
          scheduleAcc();
          if (msg > 0) { msg--; }
          if (scrollSpd) { offset -= scrollSpd; }
          for (k = pops.length - 1; k >= 0; k--) { pops[k].t--; if (pops[k].t <= 0) { pops.splice(k, 1); } }
          if (held.left) { pad.x -= 3.6; }
          if (held.right) { pad.x += 3.6; }
          pad.x = clamp(pad.x, PW / 2, W - PW / 2);
          if (stuck) { ball.x = pad.x; ball.y = PY - BR - 1; return; }
          for (s = 0; s < 3; s++) {
            var px = ball.x, py = ball.y;
            ball.x += ball.vx / 3;
            ball.y += ball.vy / 3;
            if (ball.x < BR) { ball.x = BR; ball.vx = Math.abs(ball.vx); sound(degAt(0, ball.y), "w", 0, ball.y); }
            if (ball.x > W - BR) { ball.x = W - BR; ball.vx = -Math.abs(ball.vx); sound(degAt(W, ball.y), "w", W, ball.y); }
            if (ball.y < BR) { ball.y = BR; ball.vy = Math.abs(ball.vy); sound(degAt(ball.x, 0), "w", ball.x, 0); }
            if (ball.vy > 0 && ball.y + BR >= PY && py + BR <= PY + PH && Math.abs(ball.x - pad.x) <= PW / 2 + BR) {
              var rel = clamp((ball.x - pad.x) / (PW / 2), -1, 1);
              var a = rel * 1.05, sp = speed();
              ball.vx = sp * Math.sin(a);
              ball.vy = -sp * Math.cos(a);
              ball.y = PY - BR;
              sound(degAt(ball.x, PY), "s", ball.x, PY - 8, -12);
            }
            var hitDone = false;
            for (k = 0; k < bricks.length && !hitDone; k++) {
              var b = bricks[k];
              if (b.hp <= 0) { continue; }
              var xs = xsOf(b.x0, b.w);
              for (j = 0; j < xs.length; j++) {
                var bx = xs[j];
                var cx = clamp(ball.x, bx, bx + b.w), cy = clamp(ball.y, b.y, b.y + b.h);
                var dx = ball.x - cx, dy = ball.y - cy;
                if (dx * dx + dy * dy > BR * BR) { continue; }
                if (px >= bx && px <= bx + b.w) { ball.vy = -ball.vy; ball.y = py; }
                else { ball.vx = -ball.vx; ball.x = px; }
                b.hp--;
                b.flash = 8;
                if (layout === "pos") {
                  sound(cfg.mode === "rand" ? degAt(0, 0) : b.deg, b.hp > 0 ? "p" : "b", bx + b.w / 2, b.y + b.h / 2);
                  if (b.hp === 0) { api.addScore((6 - b.row) * 10); }
                } else {
                  var v = "b";
                  playMidis(chordFromMidi(b.midi, sizeFor(v)), v, bx + b.w / 2, b.y + b.h / 2, isPerc ? b.label : null);
                  api.addScore(b.hp === 0 ? 10 : 2);
                }
                hitDone = true;
                break;
              }
            }
          }
          for (k = 0; k < bricks.length; k++) { if (bricks[k].flash > 0) { bricks[k].flash--; } }
          if (ball.y > H + 10) {
            if (!cfg.relax) { lives--; }
            if (lives <= 0) { api.gameOver(); return; }
            resetBall();
          }
          var left = 0;
          for (k = 0; k < bricks.length; k++) { if (bricks[k].hp > 0) { left++; } }
          if (left === 0) { level++; build(); resetBall(); msg = 90; }
        },
        draw: function (ctx) {
          var k, y, x, j, xs;
          if (cfg.mode === "pos") {
            for (y = 0; y < H; y += 8) {
              ctx.fillStyle = midiColor(noteAt(0, y + 4));
              ctx.fillRect(0, y, 3, 8);
              ctx.fillStyle = midiColor(noteAt(W, y + 4));
              ctx.fillRect(W - 3, y, 3, 8);
            }
            for (x = 0; x < W; x += 8) {
              ctx.fillStyle = midiColor(noteAt(x + 4, 0));
              ctx.fillRect(x, 0, 8, 3);
            }
          }
          // 指板の背景（ポジションマーク）
          if (frets.length) {
            ctx.fillStyle = "#3b2414";
            var strCount = MELODY_STRINGS[layout].length, sh = layout === "guitar" ? 12 : 15;
            var boardH = strCount * (sh + 3) - 3, cw = frets.length > 1 ? frets[1] - frets[0] : 18;
            xs = xsOf(frets[0], frets.length * cw);
            for (j = 0; j < xs.length; j++) { ctx.fillRect(xs[j], 32, frets.length * cw, boardH); }
            ctx.fillStyle = "rgba(255,255,255,0.35)";
            var marks = [3, 5, 7, 9, 12];
            for (k = 0; k < marks.length; k++) {
              xs = xsOf(frets[marks[k]], cw);
              for (j = 0; j < xs.length; j++) {
                ctx.beginPath(); ctx.arc(xs[j] + cw / 2, 32 + boardH + 5, 2, 0, Math.PI * 2); ctx.fill();
                if (marks[k] === 12) { ctx.beginPath(); ctx.arc(xs[j] + cw / 2 + 5, 32 + boardH + 5, 2, 0, Math.PI * 2); ctx.fill(); }
              }
            }
          }
          for (k = 0; k < bricks.length; k++) {
            var b = bricks[k];
            if (b.hp <= 0) { continue; }
            xs = xsOf(b.x0, b.w);
            for (j = 0; j < xs.length; j++) {
              var bx = xs[j];
              if (bx > W || bx + b.w < 0) { continue; }
              var lit = b.flash > 0;
              if (b.kind === "white") {
                ctx.fillStyle = lit ? "#ffe08a" : "#f5f1e6";
                ctx.fillRect(bx, b.y, b.w, b.h);
                if (b.front) {
                  if (inScale(b.midi)) { ctx.fillStyle = midiColor(b.midi); ctx.fillRect(bx + b.w / 2 - 1.5, b.y + b.h - 4, 3, 3); }
                  if (b.midi % 12 === 0 && b.w >= 9) {
                    ctx.fillStyle = "#555";
                    ctx.font = "bold 6px sans-serif";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "top";
                    ctx.fillText(midiName(b.midi), bx + b.w / 2, b.y + b.h + 1);
                  }
                }
              } else if (b.kind === "black") {
                ctx.fillStyle = lit ? "#a29bfe" : "#1e1e24";
                ctx.fillRect(bx, b.y, b.w, b.h);
                ctx.fillStyle = "rgba(255,255,255,0.18)";
                ctx.fillRect(bx, b.y, b.w, 1.5);
                if (inScale(b.midi)) { ctx.fillStyle = midiColor(b.midi); ctx.fillRect(bx + b.w / 2 - 1, b.y + b.h - 3, 2, 2); }
              } else if (b.kind === "fret") {
                ctx.globalAlpha = 0.45 + 0.55 * b.hp / b.maxHp;
                ctx.fillStyle = lit ? "#ffe08a" : midiColor(b.midi);
                ctx.fillRect(bx, b.y, b.w, b.h);
                ctx.globalAlpha = 1;
                ctx.fillStyle = "rgba(230,230,230,0.8)";
                ctx.fillRect(bx, b.y + b.h / 2 - 0.5, b.w + 1, layout === "bass" ? 2 : 1);
                if (b.fret === 0) { ctx.fillStyle = "#f5f1e6"; ctx.fillRect(bx + b.w - 1, b.y, 2, b.h); }
              } else if (b.kind === "pad") {
                var col = { cym: "#d4a017", hat: "#b8860b", tom: "#c0392b", snare: "#ecf0f1", kick: "#34495e", perc: "#16a085",
                  perc0: "#e67e22", perc1: "#9b59b6", perc2: "#2980b9", perc3: "#27ae60", perc4: "#c0392b" }[b.pad] || "#7f8c8d";
                ctx.globalAlpha = 0.45 + 0.55 * b.hp / b.maxHp;
                ctx.fillStyle = lit ? "#ffffff" : col;
                ctx.fillRect(bx, b.y, b.w, b.h);
                ctx.globalAlpha = 1;
                ctx.fillStyle = b.pad === "snare" ? "#2d3436" : "#ffffff";
                ctx.font = "bold 7px sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(b.label, bx + b.w / 2, b.y + b.h / 2);
              } else {
                ctx.fillStyle = cfg.mode === "pos" ? midiColor(b.midi) : BREAK_COLORS[b.row];
                ctx.fillRect(bx, b.y, b.w, b.h);
                ctx.fillStyle = b.hp >= 2 ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.25)";
                ctx.fillRect(bx, b.y, b.w, b.hp >= 2 ? 4 : 2);
              }
            }
          }
          ctx.fillStyle = "#74b9ff";
          ctx.fillRect(pad.x - PW / 2, PY, PW, PH);
          ctx.fillStyle = "#ffffff";
          ctx.beginPath(); ctx.arc(ball.x, ball.y, BR, 0, Math.PI * 2); ctx.fill();
          ctx.font = "bold 10px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          for (k = 0; k < pops.length; k++) {
            ctx.globalAlpha = pops[k].t / 36;
            ctx.fillStyle = pops[k].col;
            ctx.fillText(pops[k].text, pops[k].x, pops[k].y - (36 - pops[k].t) * 0.4);
          }
          ctx.globalAlpha = 1;
          var head = layout === "pos" ? NOTE_NAMES[key] + " " + scale.name + (cfg.mode === "rand" ? " 🎲" : "") : melodyLayoutName(layout);
          hudText(ctx, head + (chordSize > 1 && !isPerc ? "  " + chordSize + "和音" + (cfg.arp ? "↗" : "") : ""), 6, 14);
          if (cfg.rec) {
            ctx.fillStyle = recFull ? "#fdcb6e" : "#ff7675";
            ctx.font = "bold 10px sans-serif";
            ctx.textAlign = "right";
            ctx.fillText((recFull ? "REC満杯 " : "● REC ") + notes.length, W - 6, 26);
          }
          hudText(ctx, "LIFE " + (cfg.relax ? "∞" : lives) + "   LEVEL " + level + (cfg.sound ? "" : "   🔇"), 6, 312);
          // §158: テンポ・いまのコード・拍の点
          if (bpm || useProg) {
            var tm = songMs(), beatMs = stepMs * 4, beatPhase = (tm % beatMs) / beatMs, beatNo = Math.floor(tm / beatMs) % 4;
            hudText(ctx, (bpm ? "♩" + bpm + " " : "") + (useProg ? curChord().name : ""), W - 40, 312, "right");
            for (k = 0; k < 4; k++) {
              ctx.fillStyle = k === beatNo ? (beatPhase < 0.25 ? "#ffd166" : "#b38f3a") : "#3d3d5c";
              ctx.beginPath(); ctx.arc(W - 32 + k * 8, 312, 2.5, 0, Math.PI * 2); ctx.fill();
            }
          }
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
  // 公開API
  // ---------------------------------------------------------
  window.UGArcade = {
    list: function () {
      var out = [];
      for (var i = 0; i < ORDER.length; i++) {
        var d = GAMES[ORDER[i]];
        out.push({ id: d.id, name: d.name, icon: d.icon, desc: d.desc, music: !!d.music });
      }
      return out;
    },
    start: start,
    stop: stop,
    isRunning: function () { return !!host || !!setupState; }
  };
})();
