// ゴリラギター（arcade-guitar.js）のテスト（§282〜）
"use strict";
var H = require("./harness");
var ok = H.ok;

module.exports = function () {
  H.suite("guitar");
  var env = H.load(), W = env.window, G = W.UGGuitar, A = W.UGArcade, B = W.UGBass;
  ok(!!G, "UGGuitar API exists");
  var ids = A.list().map(function (g) { return g.id; }), g = A.list().filter(function (x) { return x.id === "guitar"; })[0];
  ok(g && g.cat === "music" && g.music && ids.indexOf("guitar") === ids.indexOf("bass") + 1, "guitar is a music game right after the bass", ids.indexOf("guitar"));

  // --- 押さえ方: 開放のコードがあればそれ、なければ低いほうのバレーコード ---
  function sh(key, d, scale, sev) { return G.shape(B.chord(key, d, scale || "major", sev), sev); }
  var c = sh(0, 0), f = sh(0, 3), bm = sh(2, 5), bd = sh(0, 6), g7 = sh(0, 4, "major", true), cm7 = sh(0, 0, "major", true), am = sh(0, 5), em = sh(0, 2);
  ok(JSON.stringify(c.frets) === "[null,3,2,0,1,0]" && JSON.stringify(c.midis) === "[null,48,52,55,60,64]" && JSON.stringify(f.frets) === "[1,3,3,2,1,1]" &&
    JSON.stringify(bm.frets) === "[null,2,4,4,3,2]" && JSON.stringify(bd.frets) === "[null,2,3,4,3,null]" && JSON.stringify(g7.frets) === "[3,2,0,0,0,1]" &&
    JSON.stringify(cm7.frets) === "[null,3,2,0,0,0]" && JSON.stringify(am.frets) === "[null,0,2,2,1,0]" && JSON.stringify(em.frets) === "[0,2,2,0,0,0]",
    "chord shapes: open C / G7 / Cmaj7 / Am / Em, barre F (E shape) and Bm (A shape in D), Bdim", [c.frets, f.frets, bm.frets, bd.frets, g7.frets]);
  var allOk = true, k, d, sc;
  for (k = 0; k < 12; k++) {
    for (d = 0; d < 7; d++) {
      for (sc = 0; sc < B.SCALES.length; sc++) {
        [false, true].forEach(function (sev) {
          var ch = B.chord(k, d, B.SCALES[sc][0], sev), s = G.shape(ch, sev), pcs = s.midis.filter(function (m) { return m !== null; }).map(function (m) { return m % 12; });
          if (pcs.length < 3 || pcs.indexOf(ch.root % 12) < 0 || s.frets.some(function (x) { return x !== null && (x < 0 || x > 15); })) { allOk = false; }
        });
      }
    }
  }
  ok(allOk, "every diatonic chord in every key and scale gets a playable shape (3+ strings, frets 0–15, has the root)");

  // --- 単音のフレット（上が1弦）・ストロークの弦（上が6弦）---
  var r00 = G.cellRect(0, 0), r53 = G.cellRect(5, 3), c00 = G.cellAt(r00.x + 2, r00.y + 2, 0), c53 = G.cellAt(r53.x + 2, r53.y + 2, 0), c5p = G.cellAt(r53.x + 2, r53.y + 2, 5);
  ok(c00.sn === 5 && c00.m === 64 && c53.sn === 0 && c53.m === 43 && c5p.m === 48 && G.cellAt(10, 20, 0) === null,
    "fret view: 1st string on top, 6th at the bottom; frets follow the position", [c00, c53, c5p]);
  var down = G.strumCross(G.STRUM_Y, 319), up = G.strumCross(319, G.STRUM_Y), part = G.strumCross(G.strumLineY(1) + 1, G.strumLineY(3) + 1);
  ok(down.join() === "0,1,2,3,4,5" && up.join() === "5,4,3,2,1,0" && part.join() === "2,3" && G.strumAt(G.strumLineY(4)) === 4 && G.strumAt(10) === -1,
    "strum view: swiping down crosses 6th → 1st, up crosses 1st → 6th", [down, up, part]);

  // --- ゲーム ---
  function grun(prefs, frames, fn, cfg) {
    var e = H.load(), snd = [], bends = 0;
    e.store[G.PREFS_KEY] = JSON.stringify(prefs);
    e.run("guitar", { config: cfg || {} }, frames, function (fr) {
      if (fr === 1) {
        var M = e.window.UGMelody, s0 = M.synth, b0 = M.voiceBend;
        M.synth = function (m, pg) { if (pg !== M.DRUM) { snd.push(m + "@" + pg); } return s0.apply(M, arguments); };
        M.voiceBend = function () { bends++; return b0.apply(M, arguments); };
      }
      fn(fr, e);
    });
    return { snd: snd, e: e, bends: function () { return bends; } };
  }
  // ストローク: J ＝ ダウン（C: 5弦 → 1弦）・K ＝ アップ（1弦 → 4弦）・コード 6（Am）
  var s1 = grun({ view: "chord", voice: "steel" }, 20, function (fr, e) {
    if (fr === 2) { e.key("keydown", "j"); e.key("keyup", "j"); }
    if (fr === 5) { e.key("keydown", "k"); e.key("keyup", "k"); }
    if (fr === 8) { e.key("keydown", "6"); e.key("keyup", "6"); e.key("keydown", "j"); e.key("keyup", "j"); }
  });
  ok(s1.snd.join() === "48@25,52@25,55@25,60@25,64@25,64@25,60@25,55@25,52@25,45@25,52@25,57@25,60@25,64@25",
    "strum buttons: down plays the C shape low → high, up plays the top 4 high → low, key 6 picks Am", s1.snd);
  // 指でかき鳴らす: 上から下 ＝ ダウン、下から上 ＝ アップ。弦を1本タップ ＝ その弦だけ
  var x0 = 200, s2 = grun({ view: "chord", voice: "nylon" }, 20, function (fr, e) {
    if (fr === 2) { e.ptr("down", x0, G.STRUM_Y + 2, 1); }
    if (fr === 3) { e.ptr("move", x0, 200, 1); }
    if (fr === 4) { e.ptr("move", x0, 316, 1); e.ptr("up", x0, 316, 1); }
    if (fr === 6) { e.ptr("down", x0, 316, 1); e.ptr("move", x0, G.STRUM_Y + 2, 1); e.ptr("up", x0, G.STRUM_Y + 2, 1); }
    if (fr === 8) { e.ptr("down", x0, G.strumLineY(2) + 3, 1); e.ptr("up", x0, G.strumLineY(2) + 3, 1); }
  });
  ok(s2.snd.join() === "48@24,52@24,55@24,60@24,64@24,64@24,60@24,55@24,52@24,48@24,52@24", "swiping over the strings strums them in order (muted 6th skipped); a tap picks one string", s2.snd);
  // 単音: 2弦の1フレットをタップ → 3フレットへすべらせる ＝ 鳴らしなおさずに音程だけ（スライド）。別の弦は新しい音
  var b1 = G.cellRect(1, 1), b3 = G.cellRect(1, 3), e2 = G.cellRect(2, 2);
  var s3 = grun({ view: "fret", voice: "clean" }, 20, function (fr, e) {
    if (fr === 2) { e.ptr("down", b1.x + 5, b1.y + 5, 1); }
    if (fr === 4) { e.ptr("move", b3.x + 5, b3.y + 5, 1); }
    if (fr === 6) { e.ptr("up", b3.x + 5, b3.y + 5, 1); e.ptr("down", e2.x + 5, e2.y + 5, 2); e.ptr("up", e2.x + 5, e2.y + 5, 2); }
  });
  ok(s3.snd.join() === "60@25,57@25" && s3.bends() === 1, "single notes: tap plays the fret, sliding on the same string bends it; the electric voices use the steel sample", [s3.snd, s3.bends()]);

  // --- 録音: 4拍のカウントのあとのストロークをテイクに（音色も）---
  var s4 = grun({ view: "chord", voice: "dist", bpm: 120 }, 260, function (fr, e) {
    if (fr === 2) { e.key("keydown", "z"); e.key("keyup", "z"); }
    if (fr === 2 + 125) { e.key("keydown", "j"); e.key("keyup", "j"); }
    if (fr === 2 + 185) { e.key("keydown", "z"); e.key("keyup", "z"); }
  });
  var tk = JSON.parse(s4.e.store[G.TAKES_KEY] || "[]")[0];
  ok(tk && tk.voice === "dist" && tk.notes.length === 5 && tk.notes[0][2] === 48 && tk.notes[4][2] === 64 && tk.notes[0][0] < tk.notes[4][0] && tk.notes[4][0] - tk.notes[0][0] < 0.15 && tk.name === "ギター 1",
    "recording: a strum is saved as 5 staggered notes with the voice", tk);

  // --- §284: パターン ---
  function prun(prefs, frames, fn) {
    var e = H.load({ patch: function (src, file) { return file === "arcade-guitar.js" ? src.split("      function render() {\n").join("      window.__gAct = action; window.__gPanel = function () { return panel.innerHTML; };\n      function render() {\n") : src; } });
    var snd = [], dr = [], bs = [];
    e.store[G.PREFS_KEY] = JSON.stringify(prefs);
    e.run("guitar", { config: {} }, frames, function (fr) {
      if (fr === 1) { var M = e.window.UGMelody, s0 = M.synth; M.synth = function (m, pg) { if (pg === M.DRUM) { dr.push(m); } else if (pg === 33) { bs.push(m); } else { snd.push(m); } return s0.apply(M, arguments); }; }
      if (fr === 2) { e.key("keydown", "b"); e.key("keyup", "b"); }
      if (fn) { fn(fr, e); }
    });
    return { snd: snd, dr: dr, bs: bs, e: e };
  }
  // 8分ダウン・BPM 120（8分 ＝ 0.25秒）→ 1秒で4回
  var p1 = prun({ view: "chord", pat: "down8", bpm: 120 }, 62);
  ok(p1.snd.length === 20 && p1.snd.slice(0, 5).join() === "48,52,55,60,64", "pattern: eighth-note down strums at the BPM on the current chord", p1.snd.length);
  // コード進行（王道進行 F G Em Am）: 1小節目は F（バレー）、2小節目は G
  var p2 = prun({ view: "chord", pat: "ballad", bpm: 120, cprog: "royal" }, 140);
  ok(p2.snd.slice(0, 6).join() === "41,48,53,57,60,65" && p2.snd.slice(6, 12).join() === "43,47,50,55,59,67", "chord progression: F then G, one bar each", p2.snd);
  // パターン中にコード 6（Am）をタップ → 次の小節の頭から
  var p3 = prun({ view: "chord", pat: "down8", bpm: 120 }, 140, function (fr, e) { if (fr === 40) { e.key("keydown", "6"); e.key("keyup", "6"); } });
  var i45 = p3.snd.indexOf(45);
  ok(i45 === 40 && p3.snd.slice(0, 40).every(function (m) { return [48, 52, 55, 60, 64].indexOf(m) >= 0; }), "a chord tapped during the pattern waits for the next bar", [i45, p3.snd.length]);
  // アルペジオ（B 3 2 3 1 3 2 3）: C の5弦（いちばん低い鳴る弦）・3弦・2弦・1弦
  var p4 = prun({ view: "chord", pat: "arp", bpm: 120 }, 125);
  ok(p4.snd.slice(0, 8).join() === "48,55,60,55,64,55,60,55" && G.arpString(G.shape(B.chord(0, 0, "major")), "6") === 1, "arpeggio pattern picks single strings (a muted string falls back to the next lower one)", p4.snd.slice(0, 8));
  // バンド: ゴリラドラムの8ビートとベースのルート8分もいっしょに
  var p5 = prun({ view: "fret", pat: "down8", bpm: 120, drum: "g:8beat", bpat: "root8" }, 70);
  ok(p5.dr.indexOf(36) >= 0 && p5.dr.indexOf(38) >= 0 && p5.dr.indexOf(42) >= 0 && p5.bs.length >= 4 && p5.bs.every(function (m) { return m === 36; }) && p5.snd.length >= 15,
    "band: the drum loop and the bass pattern play along with the strums", [p5.dr.length, p5.bs, p5.snd.length]);
  // 音量（－ ＋ で 10%）・タブ
  var p6 = prun({ tab: "band" }, 6, function (fr, e) { if (fr === 3) { e.window.__gAct("gvol:-"); e.window.__gAct("dvol:+"); e.window.__gAct("bvol:+"); } });
  var pp6 = JSON.parse(p6.e.store[G.PREFS_KEY]), h6 = p6.e.window.__gPanel();
  ok(pp6.gvol === 90 && pp6.dvol === 60 && pp6.bvol === 110 && h6.indexOf("90%") > 0 && h6.indexOf('data-gdrum="1"') > 0 && h6.indexOf('data-gbpat="1"') > 0 && G.vol(155, 100) === 100,
    "band tab: drum and bass selects, three volume rows (saved)", [pp6.gvol, pp6.dvol, pp6.bvol]);

  // --- アンプ: エレキはゆがみ（クランチ・ディストーション）、アコギは通さない ---
  var e5 = H.load(), M5 = e5.window.UGMelody, G5 = e5.window.UGGuitar, ws = 0;
  M5.audioInit();
  var ac5 = M5.audio.ctx, cw0 = ac5.createWaveShaper;
  ac5.createWaveShaper = function () { ws++; return cw0.apply(ac5, arguments); };
  var st = {};
  G5.bus(st, "nylon", 100); var w0 = ws;
  G5.bus(st, "clean", 100); var w1 = ws;
  G5.bus(st, "dist", 80); var w2 = ws;
  G5.bus(st, "dist", 100); var w3 = ws;
  ok(w0 === 0 && w1 === 0 && w2 === 1 && w3 === 1 && st["g:dist"].g.gain.value === 1 && G5.AMPS.dist[1] > G5.AMPS.crunch[1],
    "amp: distortion and crunch go through a wave shaper (built once), clean and acoustic do not", [w0, w1, w2, w3]);
};
