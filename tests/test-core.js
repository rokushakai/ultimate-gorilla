// ゲームセンターの土台と15本のゲーム（メロディくずし以外）のテスト
"use strict";
var H = require("./harness");
var ok = H.ok;

// テスト用ののぞき穴（ゲームの内部状態を global.__ に出す）
function sub(src, from, to) {
  if (src.indexOf(from) < 0) { throw new Error("patch target not found: " + from.slice(0, 70)); }
  return src.split(from).join(to);
}
function patch(src, file) {
  if (file !== "arcade.js") { return src; }
  src = sub(src, "var ball = { x: W / 2, y: PY - BR - 1, vx: 0, vy: 0 };\n      var stuck = true, lives = 3, level = 1, bricks = [], msg = 0;",
    "var ball = window.__bb = { x: W / 2, y: PY - BR - 1, vx: 0, vy: 0 };\n      var stuck = true, lives = 3, level = 1, bricks = [], msg = 0; window.__blv = function () { return level; };");
  src = sub(src, "var ball = { x: W / 2, y: H / 2, vx: 0, vy: 0 };", "var ball = window.__tb = { x: W / 2, y: H / 2, vx: 0, vy: 0 };");
  src = sub(src, "var myPts = 0, cpuPts = 0, level = 1, msg = 0;", "var myPts = 0, cpuPts = 0, level = 1, msg = 0; window.__tlv = function () { return level; };");
  src = sub(src, "var grid = [], placed = false", "var grid = window.__grid = [], placed = false");
  src = sub(src, "var tiles = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 0];", "var tiles = window.__tiles = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 0];");
  src = sub(src, "var first = -1, second = -1, waitT = 0", "window.__cards = cards; var first = -1, second = -1, waitT = 0");
  src = sub(src, "var enemies = [], shots = [], booms = [];", "var enemies = window.__en = [], shots = [], booms = [];");
  src = sub(src, "var wave = 0, toSpawn = 0", "window.__dw = function () { return wave; }; var wave = 0, toSpawn = 0");
  src = sub(src, "var ball = { x: 220, y: 300, vx: 0, vy: 0 };", "var ball = window.__pb = { x: 220, y: 300, vx: 0, vy: 0 };");
  src = sub(src, "      function resetPlayer() { px = START_X;", "      window.__cx = function () { return { px: px, row: row, lanes: lanes, level: level, dead: dead }; };\n      function resetPlayer() { px = START_X;");
  return src;
}

function rnd(a) { return a[Math.floor(Math.random() * a.length)]; }
function press(env, k) { env.key("keydown", k); env.key("keyup", k); }

module.exports = function () {
  H.suite("core");
  var env = H.load({ patch: patch });
  var W = env.window, A = W.UGArcade;

  // --- 登録・内部API ---
  var ids = A.list().map(function (g) { return g.id; });
  ["blocks", "shooter", "pinball", "breakout", "melody", "snake", "tennis", "crossing", "mole", "sweeper", "g2048", "reversi", "slide", "memory", "meteor", "defense", "lyrics"].forEach(function (id) {
    ok(ids.indexOf(id) >= 0, "game registered: " + id);
  });
  ok(ids.indexOf("melody") === ids.indexOf("breakout") + 1 && ids.indexOf("lyrics") === ids.indexOf("melody") + 1, "melody and lyrics listed right after breakout");
  ok(A.internal && typeof A.internal.register === "function" && typeof A.internal.saveBlob === "function", "internal API exposed");
  var badCat = A.list().filter(function (g) { return ["action", "puzzle", "music"].indexOf(g.cat) < 0; }).map(function (g) { return g.id; });
  ok(badCat.length === 0, "every game has a menu category (action/puzzle/music)", badCat);

  // --- 全ゲームのスモーク（例外なく動く） ---
  ids.filter(function (id) { return id !== "melody" && id !== "lyrics"; }).forEach(function (id) {
    var err = null, r;
    try {
      r = env.run(id, {}, 3000, function (f, e) {
        if (f % 7 === 0) { press(e, rnd(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "])); }
        if (f % 11 === 0) { e.tap(Math.random() * 240, 30 + Math.random() * 260); }
      });
    } catch (ex) { err = ex.message; }
    ok(!err, "smoke " + id + " runs without exception", err);
  });

  // --- ゲーム別 ---
  var r = env.run("blocks", {}, 20000, function (f, e) { if (f % 7 === 0) { press(e, rnd(["ArrowLeft", "ArrowRight", "ArrowUp"])); } if (f % 40 === 0) { press(e, " "); } });
  ok(r.ended !== null, "blocks: random play reaches game over", r);
  ok(env.counters.texts.indexOf("🪙 メダル +7枚") >= 0, "game over screen shows medals returned by onEnd");

  // pinball: 壁を突き抜けない・盤面に入る・フリッパーなしなら落ちる
  var st = { minX: 999, maxX: -999, entered: 0, was: false };
  r = env.run("pinball", {}, 20000, function (f, e) {
    var b = W.__pb; if (b.x < st.minX) { st.minX = b.x; } if (b.x > st.maxX) { st.maxX = b.x; }
    var inF = b.x < 205 && b.y < 260; if (inF && !st.was) { st.entered++; } st.was = inF;
    if (f % 240 === 0) { e.key("keydown", " "); } if (f % 240 === 60) { e.key("keyup", " "); }
    if (b.vy > 0 && b.y > 255 && b.y < 280 && f % 10 === 0) { press(e, "z"); press(e, "m"); }
  });
  ok(st.minX >= 9.9 && st.maxX <= 230.1, "pinball: ball stays inside walls", st);
  ok(st.entered > 0, "pinball: launched ball enters the playfield", st);
  r = env.run("pinball", {}, 20000, function (f, e) { if (f % 240 === 0) { e.key("keydown", " "); } if (f % 240 === 40) { e.key("keyup", " "); } });
  ok(r.ended !== null, "pinball: without flippers all balls drain", r);

  // breakout: 追いかければレベル2へ
  r = env.run("breakout", {}, 40000, function (f, e) { var b = W.__bb; e.ptr(f === 0 ? "down" : "move", b.x + Math.sin(f / 50) * 10, 300); });
  ok(W.__blv() >= 2, "breakout: tracking paddle clears level 1", W.__blv());

  // tennis: 追いかければCPUに勝てる / 適当だと負ける
  // （真ん中で打つとボールが真上に飛び、CPUが動かずに返せる終わらないラリーになるので、端で打って角度をつける）
  r = env.run("tennis", {}, 30000, function (f, e) { var b = W.__tb; e.ptr(f === 0 ? "down" : "move", b.x + (Math.floor(f / 150) % 2 ? 14 : -14), 300); });
  ok(W.__tlv() >= 3, "tennis: tracking beats the CPU repeatedly", W.__tlv());
  r = env.run("tennis", {}, 30000, function (f, e) { if (f % 40 === 0) { e.ptr("down", Math.random() * 240, 300); } });
  ok(r.ended !== null, "tennis: random play loses", r);

  // crossing: 先読みAIでゴールできる
  function carSafe(ln, px, fr) { if (!ln || ln.type !== "car") { return true; } for (var t = 0; t <= fr; t++) { for (var i = 0; i < ln.xs.length; i++) { var x = ln.xs[i] + ln.speed * t; if (px + 2 < x + ln.w && px + 18 > x) { return false; } } } return true; }
  function logSafe(ln, px, fr) { if (!ln || ln.type !== "log") { return true; } for (var i = 0; i < ln.xs.length; i++) { var good = true; for (var t = 0; t <= fr; t++) { var x = ln.xs[i] + ln.speed * t, cx = px + 10; if (!(cx >= x + 4 && cx <= x + ln.w - 4)) { good = false; break; } } if (good) { return true; } } return false; }
  // 車の配置は毎回ランダムで簡易AIは完璧ではないので、最大8回試す
  var goals = 0, lastLv = 1;
  for (var attempt = 0; attempt < 8 && goals === 0; attempt++) {
  lastLv = 1;
  env.run("crossing", {}, 60000, function (f, e) {
    var s = W.__cx(); if (s.level !== lastLv) { goals++; lastLv = s.level; }
    if (s.dead > 0 || f % 3 !== 0) { return; }
    var nr = s.row - 1, cur = s.lanes[s.row], nxt = nr >= 0 ? s.lanes[nr] : null;
    if (nr >= 0 && carSafe(nxt, s.px, 22) && logSafe(nxt, s.px, 8)) { press(e, "ArrowUp"); return; }
    if (cur && cur.type === "car" && !carSafe(cur, s.px, 10) && carSafe(s.lanes[s.row + 1], s.px, 15)) { press(e, "ArrowDown"); return; }
    if (cur && cur.type === "log") { if (s.px < 30 && logSafe(cur, s.px + 20, 3)) { press(e, "ArrowRight"); } else if (s.px > 190 && logSafe(cur, s.px - 20, 3)) { press(e, "ArrowLeft"); } }
  });
  }
  ok(goals >= 1, "crossing: goal is reachable (within 8 tries)", goals);

  // mole: 30秒で TIME UP
  r = env.run("mole", {}, 5000, function (f, e) { if (f % 4 === 0) { var c = f / 4 % 9; e.tap(50 + (c % 3) * 70, 100 + Math.floor(c / 3) * 78); } });
  ok(r.frames === 1801 && env.lastTitle() === "TIME UP", "mole: ends with TIME UP at 30s", { frames: r.frames, title: env.lastTitle() });

  // sweeper: 全安全マスで CLEAR、長押しで旗
  r = env.run("sweeper", {}, 20000, function (f, e) {
    if (f === 1) { e.tap(3 + 4 * 26 + 13, 22 + 5 * 26 + 13); return; }
    if (f > 1 && f % 2 === 0) { var g = W.__grid; for (var y = 0; y < 11; y++) { for (var x = 0; x < 9; x++) { var c = g[y][x]; if (!c.mine && !c.open) { e.tap(3 + x * 26 + 13, 22 + y * 26 + 13); return; } } } }
  });
  // 得点 = 85マス×5 + タイムボーナス（開く順で1〜2秒かかるので 1980〜2000）
  ok(r.ended >= 425 + 1980 && r.ended <= 2425 && env.lastTitle() === "CLEAR!", "sweeper: opening every safe cell clears (425 + time bonus)", r);
  var flagged = null, target = null;
  env.run("sweeper", {}, 60, function (f, e) {
    if (f === 1) { e.tap(3 + 4 * 26 + 13, 22 + 5 * 26 + 13); }
    if (f === 5) {
      // 最初のタップで開かなかったマスを長押しする
      for (var y = 0; y < 11 && !target; y++) { for (var x = 0; x < 9; x++) { if (!W.__grid[y][x].open) { target = [x, y]; break; } } }
      e.ptr("down", 3 + target[0] * 26 + 13, 22 + target[1] * 26 + 13);
    }
    if (f === 40) { e.ptr("up", 3 + target[0] * 26 + 13, 22 + target[1] * 26 + 13); flagged = W.__grid[target[1]][target[0]]; }
  });
  ok(flagged && flagged.flag && !flagged.open, "sweeper: long press places a flag", flagged);

  // slide: 完成で CLEAR
  r = env.run("slide", {}, 30, function (f, e) { if (f === 1) { var v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 0, 15]; for (var i = 0; i < 16; i++) { W.__tiles[i] = v[i]; } press(e, "ArrowLeft"); } });
  ok(env.lastTitle() === "CLEAR!" && r.ended > 4000, "slide: solving clears", r);

  // memory: 全部連続で当てると 3250＋ボーナス
  function pos(k) { return [7 + (k % 4) * 58 + 20, 30 + Math.floor(k / 4) * 54 + 20]; }
  r = env.run("memory", {}, 2000, function (f, e) {
    if (f % 4 !== 0) { return; } var cs = W.__cards;
    for (var i = 0; i < cs.length; i++) { if (cs[i].taken) { continue; } for (var j = i + 1; j < cs.length; j++) { if (!cs[j].taken && cs[j].e === cs[i].e) { var a = pos(i), b = pos(j); e.tap(a[0], a[1]); e.tap(b[0], b[1]); return; } } }
  });
  ok(r.ended >= 4200 && env.lastTitle() === "CLEAR!", "memory: perfect play scores 3250 + bonus", r);

  // reversi: ランダムに打つと勝負がつく
  r = env.run("reversi", {}, 50000, function (f, e) { if (f % 2 === 0) { e.tap(8 + Math.random() * 224, 44 + Math.random() * 224); } });
  ok(r.ended !== null && ["WIN!", "LOSE", "DRAW"].indexOf(env.lastTitle()) >= 0, "reversi: game finishes with a result title", env.lastTitle());

  // 2048 / meteor: 終わる
  r = env.run("g2048", {}, 50000, function (f, e) { if (f % 3 === 0) { press(e, rnd(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"])); } });
  ok(r.ended !== null, "2048: random play eventually gets stuck", r);
  r = env.run("meteor", {}, 60000, function (f, e) { if (f % 60 === 0) { e.key(Math.random() < 0.5 ? "keydown" : "keyup", "ArrowLeft"); } if (f % 8 === 0) { e.key("keydown", " "); } else { e.key("keyup", " "); } });
  ok(r.ended !== null, "meteor: random play ends", r);

  // defense: 先読みで迎撃すれば何ウェーブも守れる
  var targeted = [];
  env.run("defense", {}, 60000, function (f, e) {
    var en = W.__en; if (!en.length || f % 3 !== 0) { return; }
    for (var i = 0; i < en.length; i++) {
      var q = en[i]; if (targeted.indexOf(q) >= 0 || q.y < 20) { continue; }
      var dx = q.tx - q.x, dy = q.ty - q.y, d = Math.sqrt(dx * dx + dy * dy), vx = dx / d * q.sp, vy = dy / d * q.sp, px = q.x, py = q.y;
      for (var k = 0; k < 6; k++) { var dd = Math.sqrt((px - 120) * (px - 120) + (py - 286) * (py - 286)), tt = dd / 4.5 + 12; px = q.x + vx * tt; py = q.y + vy * tt; }
      if (py < 268) { e.tap(px, py); targeted.push(q); }
      return;
    }
  });
  ok(W.__dw() >= 5, "defense: lead-targeting survives 5+ waves", W.__dw());

  // キー入力はフィールド側へ届かない（capture で止める）
  ok(env.counters.stopped > 1000, "keys during play are stopped from reaching the field", env.counters.stopped);

  // 設定画面つきのゲーム
  var root = H.makeEl("div");
  A.start("melody", root, { onEnd: function () {}, onExit: function () {} });
  ok(A.isRunning() && root.innerHTML.indexOf("メロディくずし") >= 0, "melody: setup screen counts as running");
  A.stop();
  ok(!A.isRunning() && root.innerHTML === "", "stop() clears the setup screen");
};
