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
  var stopHooks = []; // stop() のたびに呼ぶ（§159: 別ファイルのゲームが登録）

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
      var earned = host.opts.onEnd(host.gameId, host.score, host.bonusMedals);
      host.earned = typeof earned === "number" ? earned : null; // §153 v0.72: 獲得メダル数
    }
  }

  function renderSysButtons() {
    if (!host) { return; }
    var sys = host.sysEl;
    if (host.over) {
      sys.innerHTML =
        '<button class="modal-btn" data-sys="retry">&#x1F501; もう一度</button>' +
        (host.def.setup ? '<button class="modal-btn" data-sys="setup">&#x2699;&#xFE0F; ' + (host.def.setupLabel || "設定・録音") + '</button>' : '') +
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
  // §223: 入力欄（パターンの名前など）に文字を打っているときは、ゲームのキーにしない
  function typing(ev) { var t = ev && ev.target; return !!(t && t.tagName && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); }
  function onKeyDown(ev) {
    if (!host) { return; }
    if (typing(ev)) { return; }
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
    if (typing(ev)) { return; }
    ev.stopPropagation();
    var act = host.def.keys[ev.key];
    if (!act) { return; }
    // フォーカス中のボタンが Space で押されないようにする
    if (ev.cancelable) { ev.preventDefault(); }
    send(act, false);
  }
  // キャンバス直接入力（タップ・ドラッグ・スワイプ）。座標は論理解像度 240×320
  // §167 v0.86: 指ごとに追いかける（pointer(type, x, y, 指の番号, 種類)）
  function bindCanvas(canvas) {
    var active = {};
    function pos(src) {
      var r = canvas.getBoundingClientRect();
      var hh = (host && host.h) || H, rw = r.width || W, rh = r.height || hh;
      // §213 v1.21: 横向き表示で 90° 回っているとき（見えている形の縦横がゲーム画面と逆）は座標も回す
      if (W !== hh && (rw > rh) !== (W > hh)) { return [(src.clientY - r.top) * W / rh, ((r.right || r.left + rw) - src.clientX) * hh / rw]; }
      return [(src.clientX - r.left) * W / rw, (src.clientY - r.top) * hh / rh];
    }
    function deliver(type, src, id, kind) {
      if (!host || !host.game || !host.game.pointer) { return; }
      if (type !== "up" && (host.paused || host.over)) { return; }
      var p = pos(src);
      host.game.pointer(type, p[0], p[1], id, kind);
    }
    // ev から [ {src, id, kind} ] を作る（タッチは変化した指ぜんぶ）
    function points(ev) {
      if (ev.changedTouches && ev.changedTouches.length) {
        var out = [];
        for (var i = 0; i < ev.changedTouches.length; i++) {
          out.push({ src: ev.changedTouches[i], id: "t" + ev.changedTouches[i].identifier, kind: "touch" });
        }
        return out;
      }
      if (ev.pointerId !== undefined) { return [{ src: ev, id: ev.pointerId, kind: ev.pointerType || "touch" }]; }
      return [{ src: ev, id: "m", kind: "mouse" }];
    }
    function down(ev) {
      if (ev.cancelable) { ev.preventDefault(); }
      if (ev.pointerId !== undefined && canvas.setPointerCapture) {
        try { canvas.setPointerCapture(ev.pointerId); } catch (e) {}
      }
      var ps = points(ev);
      for (var i = 0; i < ps.length; i++) {
        active[ps[i].id] = true;
        deliver("down", ps[i].src, ps[i].id, ps[i].kind);
      }
    }
    function move(ev) {
      var ps = points(ev), any = false;
      for (var i = 0; i < ps.length; i++) {
        if (!active[ps[i].id]) { continue; }
        any = true;
        deliver("move", ps[i].src, ps[i].id, ps[i].kind);
      }
      if (any && ev.cancelable) { ev.preventDefault(); }
    }
    function up(ev) {
      var ps = points(ev);
      for (var i = 0; i < ps.length; i++) {
        if (!active[ps[i].id]) { continue; }
        delete active[ps[i].id];
        deliver("up", ps[i].src, ps[i].id, ps[i].kind);
      }
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
    var ctx = host.ctx, H = host.h || 320; // §181: ゲームが縦に伸ばしたときはその高さ
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.fillStyle = "#05060f";
    ctx.fillRect(0, 0, W, H);
    host.game.draw(ctx);
    if (host.paused || host.over) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(0, 0, W, H);
      // §165 v0.84: 文字の後ろに枠を敷いて、ゲーム画面と重なっても読めるようにする
      var boxBottom = host.over && host.earned !== null && host.earned !== undefined ? H / 2 + 72 : (host.over && host.score > host.hi ? H / 2 + 48 : H / 2 + 24);
      ctx.fillStyle = "rgba(11,18,32,0.94)";
      ctx.fillRect(24, H / 2 - 48, W - 48, boxBottom - (H / 2 - 48));
      ctx.strokeStyle = "#ffd166";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(24, H / 2 - 48, W - 48, boxBottom - (H / 2 - 48));
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
      (def.panel ? '<div class="arcade-panel"></div>' : '') + // §160: ゲームが使う表示欄（歌詞くずし）
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
      bonusMedals: 0, // §211 v1.19: ゲームがくれる特別なメダル（称号アップなど）
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
      // §211 v1.19: スコアとは別にメダルを足す（gameOver の前に呼ぶ）
      addMedals: function (n) { if (host && !host.reported && n > 0) { host.bonusMedals += Math.floor(n); } },
      gameOver: gameOver,
      panel: def.panel ? rootEl.querySelector(".arcade-panel") : null,
      // §181 v0.99: ゲーム画面の高さ（論理）を変える（幅は 240 のまま。引きのビューなどで縦に長く）
      setCanvasHeight: function (h) {
        if (!host || !(h >= 80 && h <= 640)) { return; }
        host.h = h;
        canvas.height = h * SCALE;
        canvas.style.aspectRatio = W + " / " + h;
        canvas.style.width = "min(100%, calc((100vh - 90px) * " + (W / h).toFixed(4) + "))";
      },
      // §181 v0.99: 画面の飾り（下のボタン・説明）を減らしてゲーム画面を大きくする
      setCompact: function (on) { if (rootEl.classList) { if (on) { rootEl.classList.add("arcade-compact"); } else { rootEl.classList.remove("arcade-compact"); } } },
      // §213 v1.21: 横向き表示（画面いっぱい。縦持ちのときは 90° 回して見せる。CSS .arcade-land）
      setLandscape: function (on) { if (rootEl.classList) { if (on) { rootEl.classList.add("arcade-land"); } else { rootEl.classList.remove("arcade-land"); } } }
    };
    host.game = def.create(api, opts.config || null);
    bindCanvas(canvas);
    // タッチボタン
    var ctrl = rootEl.querySelector(".arcade-controls");
    var controls = def.controls;
    if (def.controlsClass && ctrl.classList) { ctrl.classList.add(def.controlsClass); } // §182: ゲームごとのボタンの見た目
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
    for (var hk = 0; hk < stopHooks.length; hk++) { stopHooks[hk](); }
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
    if (root) { root.innerHTML = ""; if (root.classList) { root.classList.remove("arcade-land"); root.classList.remove("arcade-compact"); } }
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
    cat: "puzzle",
    name: "ゴリラブロック",
    icon: "&#x1F9F1;",
    desc: "落ちてくるブロックを並べて横一列を消そう",
    help: "←→移動 / ↑回転 / ↓ソフトドロップ / Spaceハードドロップ / 画面: 横になぞる=移動・タップ=回転・下へはらう=落とす / P一時停止",
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
      // §166 v0.85: 着地してから少し待って固定（動かすと待ち直し、最大15回）
      var LOCK_FRAMES = 30, LOCK_RESETS = 15, lockT = 0, lockResets = 0;
      var touch = null;

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
        lockT = 0;
        lockResets = 0;
        if (!fits(cur)) { api.gameOver(); }
      }
      function tryMove(dx, dy) {
        var p = { t: cur.t, r: cur.r, x: cur.x + dx, y: cur.y + dy };
        if (fits(p)) { cur = p; if (dx !== 0) { moved(); } return true; }
        return false;
      }
      function grounded() { return !fits({ t: cur.t, r: cur.r, x: cur.x, y: cur.y + 1 }); }
      function moved() {
        if (lockT > 0 && lockResets < LOCK_RESETS) { lockT = 0; lockResets++; }
      }
      function rotate() {
        var r = (cur.r + 1) % 4;
        // 横にずらす → 床際では1段上にずらす
        var kicks = [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1], [-1, -1], [1, -1]];
        for (var i = 0; i < kicks.length; i++) {
          var p = { t: cur.t, r: r, x: cur.x + kicks[i][0], y: cur.y + kicks[i][1] };
          if (fits(p)) { cur = p; moved(); return; }
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
        // 画面: 横になぞると1マスずつ移動、タップで回転、下へすばやくはらうとハードドロップ
        pointer: function (type, x, y) {
          if (!cur) { return; }
          if (type === "down") { touch = { sx: x, sy: y, lx: x, slid: false }; return; }
          if (!touch) { return; }
          if (type === "move") {
            while (x - touch.lx >= CELL) { tryMove(1, 0); touch.lx += CELL; touch.slid = true; }
            while (touch.lx - x >= CELL) { tryMove(-1, 0); touch.lx -= CELL; touch.slid = true; }
            return;
          }
          if (type === "up") {
            if (!touch.slid) {
              var d = swipeDir(touch.sx, touch.sy, x, y);
              if (d === "tap" || d === "up") { rotate(); }
              else if (d === "down" && y - touch.sy > 40) { hardDrop(); }
            }
            touch = null;
          }
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
          if (!cur) { return; }
          if (grounded()) {
            dropTimer = 0;
            lockT++;
            if (lockT >= LOCK_FRAMES) { lock(); }
            return;
          }
          lockT = 0;
          dropTimer++;
          var iv = held.down ? Math.min(2, interval()) : interval();
          if (dropTimer >= iv) {
            dropTimer = 0;
            if (tryMove(0, 1) && held.down) { api.addScore(1); }
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
    cat: "action",
    name: "UMAシューター",
    icon: "&#x1F47E;",
    desc: "せまりくるUMAの大群を撃ち落とそう",
    help: "←→移動 / Space発射 / 画面をさわっている間は指の位置へ動いて連射 / P一時停止",
    controls: [
      { action: "left", label: "&#x25C0;" },
      { action: "fire", label: "&#x1F52B; 発射" },
      { action: "right", label: "&#x25B6;" }
    ],
    keys: { "ArrowLeft": "left", "ArrowRight": "right", " ": "fire", "ArrowUp": "fire", "z": "fire", "Z": "fire" },
    create: function (api) {
      var COLS = 8, ROWS = 5, DX = 22, DY = 20, EW = 16, EH = 14;
      var PY = 296, PW = 18;
      var player = { x: W / 2, inv: 0 }, touchX = null;
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
        // §166 v0.85: さわっている間は指のx位置へ向かって動き、自動で撃つ
        pointer: function (type, x) {
          if (type === "up") { touchX = null; held.fire = false; return; }
          touchX = clamp(x, 12, W - 12);
          held.fire = true;
        },
        step: function () {
          var r, c, p, k;
          if (held.left) { player.x -= 2.2; }
          if (held.right) { player.x += 2.2; }
          if (touchX !== null) { player.x += clamp(touchX - player.x, -3, 3); }
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
    cat: "action",
    name: "ゴリラピンボール",
    icon: "&#x1F3AF;",
    desc: "フリッパーでボールを打ち返してバンパーを狙おう",
    help: "Z/←左フリッパー / M/→右フリッパー / Space/↓発射（長押しでため） / 画面の左半分・右半分をさわってもフリッパー（2本指OK） / P一時停止",
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
      // §166 v0.85: 発射から5秒以内に落ちたら1球につき1回だけ戻す（ボールセーブ）
      var SAVE_FRAMES = 300, saveT = 0, saveUsed = false, saveMsg = 0;
      var fingers = {}; // 指の番号 → 0 左 / 1 右

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
      function launchInput(down) {
        if (down) { launchHeld = true; return; }
        if (launchHeld && mode === "ready") {
          ball.vy = -(9 + 5 * charge);
          ball.vx = 0;
          mode = "play";
          if (!saveUsed) { saveT = SAVE_FRAMES; }
        }
        launchHeld = false;
        charge = 0;
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
          else if (action === "launch") { launchInput(down); }
        },
        // 画面の左半分＝左フリッパー、右半分＝右フリッパー。発射待ちのときは長押し→離すで発射
        // §167 v0.86: 指ごとにどちらのフリッパーかを覚え、離した指の側だけ下げる
        pointer: function (type, x, y, id) {
          if (type === "down") {
            if (mode === "ready") { launchInput(true); }
            var side = x < W / 2 ? 0 : 1;
            fingers[id] = side;
            flippers[side].held = true;
          } else if (type === "up") {
            if (launchHeld) { launchInput(false); }
            var sd = fingers[id];
            delete fingers[id];
            for (var s2 = 0; s2 < 2; s2++) {
              if (sd !== undefined && sd !== s2) { continue; }
              var still = false;
              for (var k in fingers) { if (fingers.hasOwnProperty(k) && fingers[k] === s2) { still = true; } }
              if (!still) { flippers[s2].held = false; }
            }
          }
        },
        step: function () {
          var k;
          for (k = 0; k < BUMPERS.length; k++) { if (BUMPERS[k].flash > 0) { BUMPERS[k].flash--; } }
          if (bonusMsg > 0) { bonusMsg--; }
          if (saveMsg > 0) { saveMsg--; }
          if (saveT > 0 && mode === "play") { saveT--; }
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
            if (saveT > 0 && !saveUsed) {
              saveUsed = true;
              saveT = 0;
              saveMsg = 90;
              readyBall();
              return;
            }
            saveT = 0;
            saveUsed = false;
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
          if (saveT > 0 && Math.floor(saveT / 10) % 2 === 0) { ctx.fillStyle = "#55efc4"; ctx.fillText("SAVE", 160, 312); }
          if (saveMsg > 0) {
            ctx.textAlign = "center";
            ctx.fillStyle = "#55efc4";
            ctx.font = "bold 14px sans-serif";
            ctx.fillText("BALL SAVE! もう一度", 110, 180);
            ctx.font = "bold 11px sans-serif";
            ctx.fillStyle = "#ffd166";
            ctx.textAlign = "left";
          }
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
    cat: "action",
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
    cat: "action",
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
      var started = false; // §166 v0.85: 最初の方向入力まで待つ

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
        if (!started) { started = true; timer = 0; }
        var last = queue.length ? queue[queue.length - 1] : dir;
        if ((d.x === -last.x && d.y === -last.y) || (d.x === last.x && d.y === last.y)) { return; }
        if (queue.length < 2) { queue.push(d); }
      }
      function interval() { return Math.max(5, 10 - Math.floor(body.length / 6)); }

      food = emptyCell();

      return {
        input: function (action, down) { if (down) { turn(action); } },
        pointer: function (type, x, y) {
          if (type === "down") { sx = x; sy = y; }
          else if (type === "up") {
            var d = swipeDir(sx, sy, x, y);
            if (d !== "tap") { turn(d); }
            else if (!started) { started = true; }
          }
        },
        step: function () {
          if (!started) { return; }
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
          if (!started) {
            ctx.fillStyle = "rgba(0,0,0,0.55)";
            ctx.fillRect(20, 196, W - 40, 44);
            hudText(ctx, "方向ボタン・スワイプ・タップでスタート", W / 2, 211, "center");
            hudText(ctx, "（いまは → 向き）", W / 2, 227, "center");
          }
        }
      };
    }
  });

  // ---------------------------------------------------------
  // 🏓 ゴリラテニス（CPU対戦）
  // ---------------------------------------------------------
  register({
    id: "tennis",
    cat: "action",
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
    cat: "action",
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
    cat: "action",
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
    cat: "puzzle",
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
    cat: "puzzle",
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
    cat: "puzzle",
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
    cat: "puzzle",
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
    cat: "puzzle",
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
    cat: "action",
    name: "メテオシューター",
    icon: "&#x2604;&#xFE0F;",
    desc: "宇宙船をあやつって隕石をこなごなにしよう",
    help: "←→回転 / ↑加速 / Space発射 / P一時停止",
    controls: [
      { action: "rotL", label: "&#x21BA; 左" },
      { action: "rotR", label: "&#x21BB; 右" },
      { action: "thrust", label: "&#x1F525; 加速" },
      { action: "fire", label: "&#x1F52B; 発射" }
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
    cat: "action",
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
  // 共通部品（別ファイルのゲームからも internal 経由で使う）
  // ---------------------------------------------------------
  function lsGet(k) {
    try { var s = window.localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  }
  function lsSet(k, v) {
    try { window.localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; }
  }
  function escHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  // スマホは共有メニュー（保存・送信）、できなければダウンロード
  function saveBlob(blob, filename) {
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

  // ---------------------------------------------------------
  // 公開API
  // ---------------------------------------------------------
  window.UGArcade = {
    list: function () {
      var out = [];
      for (var i = 0; i < ORDER.length; i++) {
        var d = GAMES[ORDER[i]];
        out.push({ id: d.id, name: d.name, icon: d.icon, desc: d.desc, music: !!d.music, cat: d.cat || "action" });
      }
      return out;
    },
    start: start,
    stop: stop,
    isRunning: function () { return !!host || !!setupState; },
    // §159 v0.78: 別ファイルのゲーム（arcade-melody.js 等）とテストが使う内部API
    internal: {
      W: W, H: H, register: register, randInt: randInt, clamp: clamp, hudText: hudText, emojiAt: emojiAt, swipeDir: swipeDir,
      BREAK_COLORS: BREAK_COLORS, DIR_CONTROLS: DIR_CONTROLS, DIR_KEYS: DIR_KEYS,
      lsGet: lsGet, lsSet: lsSet, escHtml: escHtml, saveBlob: saveBlob,
      isSetupRoot: function (root) { return !!setupState && setupState.root === root; },
      addStopHook: function (fn) { stopHooks.push(fn); }
    }
  };
})();
