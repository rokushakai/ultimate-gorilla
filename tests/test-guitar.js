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
  ok(s3.snd.join() === "60@27,57@27" && s3.bends() === 1, "single notes: tap plays the fret, sliding on the same string bends it (clean electric = GM 27)", [s3.snd, s3.bends()]);

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

  // --- §285: シーケンサーへ送る（🤘 ギター打ち込み・音色はシーケンサーの番号・1000 音まで）---
  var U = W.UGUkulele, gst = U.seqLoad();
  gst.cur.tracks.uke.on = true; gst.cur.tracks.uke.mute = false; U.seqSave(gst);
  var gn = G.notesClean([[0, 1, 48], [0.01, 1, 52, 0.6]]), rs = G.sendToSeq({ name: "ぼくのギター", voice: "dist", notes: gn }), gst2 = U.seqLoad(), xt = gst2.cur.tracks[rs.id];
  var many = [], q;
  for (q = 0; q < 1200; q++) { many.push([q * 0.25, 0.25, 50]); }
  var rs2 = G.sendToSeq({ name: "たくさん", voice: "nylon", notes: many }), xt2 = U.seqLoad().cur.tracks[rs2.id];
  ok(rs.ok && xt && xt.preset === "gnotes" && xt.kind === "notes" && xt.prog === 30 && JSON.stringify(xt.notes) === JSON.stringify(gn) && xt.name === "ぼくのギター" && gst2.cur.tracks.uke.mute === false &&
    rs2.ok && rs2.cut && xt2.notes.length === G.SEQ_MAX && xt2.prog === 24 && !G.sendToSeq({ name: "x", notes: [] }).ok && U.X_PRESETS.some(function (p0) { return p0[0] === "gnotes" && p0[3] === "notes"; }),
    "send to the sequencer: a guitar-notes track with the voice's GM number (distortion 30), at most 1000 notes; the ukulele stays", [rs.msg, rs2.cut]);
  // --- §285: 伴奏（曲のコード C → G7）。曲のウクレレは鳴らさない（ON なら鳴る）---
  function song(e, rows) {
    var U2 = e.window.UGUkulele, sq = U2.seqClean(null);
    sq.rows = rows; sq.bpm = 120; sq.countIn = false; sq.loop = false;
    e.store[U2.SEQ_KEY] = JSON.stringify({ cur: U2.seqClean(sq), songs: [] });
  }
  function brun(prefs, frames) {
    var e = H.load(), mine = [], others = [];
    song(e, [{ type: "chord", name: "C", len: "w" }, { type: "chord", name: "G7", len: "w" }]);
    e.store[G.PREFS_KEY] = JSON.stringify(prefs);
    e.run("guitar", { config: { backing: "cur" } }, frames, function (fr) {
      if (fr === 1) { var M = e.window.UGMelody, s0 = M.synth; M.synth = function (m, pg) { if (pg === 25) { mine.push(m); } else if (pg !== M.DRUM) { others.push(pg); } return s0.apply(M, arguments); }; }
      if (fr === 2) { e.key("keydown", "b"); e.key("keyup", "b"); }
    });
    return { mine: mine, others: others };
  }
  var bb1 = brun({ view: "chord", voice: "steel", pat: "ballad" }, 260), bb2 = brun({ view: "chord", voice: "steel", pat: "ballad", backUke: true }, 100);
  ok(bb1.mine.join() === "48,52,55,60,64,43,47,50,55,59,65" && bb1.others.indexOf(24) < 0 && bb2.others.indexOf(24) >= 0 &&
    G.songSev("G7") && G.songSev("Am9/G") && !G.songSev("C/E") && JSON.stringify(G.shape(B.songChord("C/E", 0), false).frets) === "[null,3,2,0,1,0]",
    "backing: the pattern follows the song's chords (C, then G7 with the 7th shape); the song's ukulele is left out unless turned on; slash chords use the chord's root", [bb1.mine, bb1.others.slice(0, 5), bb2.others.slice(0, 5)]);

  // --- §286: リズムゲーム ---
  var D = W.UGDrum, songsOk = G.SONGS.every(function (sg) {
    var cE = G.chart(sg, "easy"), cN = G.chart(sg, "normal"), cH = G.chart(sg, "hard"), bp = B.patById(B.patterns(cN.meter), sg[9]);
    return cE.notes.length > 0 && cE.notes.length <= cN.notes.length && cN.notes.length <= cH.notes.length && cE.notes.every(function (n) { return !n.cut; }) && (cE.notes.every(function (n) { return n.beat % 1 === 0; }) || sg[0] === "ska") &&
      cN.notes.every(function (n) { return !n.cut; }) && D.patternSteps(sg[8]) && D.patLen(sg[8]) === (cN.meter === 3 ? 12 : 16) && bp && bp[0] === sg[9] && bp[3] === cN.meter;
  });
  var cut = G.chart(G.SONGS.filter(function (x) { return x[0] === "cut"; })[0], "hard"), pop = G.chart(G.SONGS[0], "normal");
  ok(songsOk && cut.notes.some(function (n) { return n.cut && n.lane === 0; }) && pop.notes[0].name === "F" && pop.notes[0].lane === 0 && pop.notes.some(function (n) { return n.lane === 1; }),
    "rhythm charts: every song works at three levels (easy = notes on the beat, hard adds cuts ✕) with a matching drum loop and bass pattern", [pop.notes.slice(0, 4)]);
  function rrun(song, level, hitAll) {
    var e = H.load(), sg = G.SONGS.filter(function (x) { return x[0] === song; })[0], c = G.chart(sg, level), spb = 60 / sg[6], t0 = 0.5 + c.meter * spb, done = {}, gs = 0, bs = 0, ds = 0;
    var r = e.run("guitar", { config: { mode: "rhythm", song: song, level: level, speed: 100 } }, 3000, function (f) {
      if (f === 1) { var M = e.window.UGMelody, s0 = M.synth; M.synth = function (m, pg) { if (pg === M.DRUM) { ds++; } else if (pg === 33) { bs++; } else { gs++; } return s0.apply(M, arguments); }; }
      if (!hitAll) { return; }
      c.notes.forEach(function (n, k) {
        if (!done[k] && f / 60 >= t0 + n.beat * spb - 0.005) { done[k] = 1; var key = n.lane ? "k" : "j"; e.key("keydown", key); e.key("keyup", key); }
      });
    });
    return { r: r, best: JSON.parse(e.store[G.BEST_KEY] || "{}")[song + "@" + level + "@100"], n: c.notes.length, gs: gs, bs: bs, ds: ds };
  }
  var gr1 = rrun("pop", "normal", true), gr2 = rrun("rock", "easy", false);
  ok(gr1.r.ended !== null && gr1.best && gr1.best.r === "S" && gr1.best.s >= gr1.n * 100 + 500 && gr1.gs >= gr1.n * 4 && gr1.bs > 10 && gr1.ds > 20 && gr2.best && gr2.best.r === "D" && gr2.gs === 0,
    "guitar rhythm game: hitting every strum (J down / K up) on time → rank S and each hit strums the chord; drums and bass play along; doing nothing → rank D", [gr1.best, gr2.best, gr1.gs, gr1.bs, gr1.ds]);

  // --- §287: 右手ピッキング（左手は押さえるだけ・右手の所で弾く）---
  var pk = { snd: [], bends: 0, stops: 0, info: null }, epk = H.load();
  epk.store[G.PREFS_KEY] = JSON.stringify({ view: "fret", pick: true, voice: "steel" });
  epk.run("guitar", { config: {} }, 30, function (fr) {
    var Gw = epk.window.UGGuitar, M = epk.window.UGMelody, px = Gw.geom().PICK_X + 12;
    if (fr === 1) {
      var s0 = M.synth, b0 = M.voiceBend, v0 = M.voiceStop;
      M.synth = function (m, pg) { if (pg !== M.DRUM) { pk.snd.push(m); } return s0.apply(M, arguments); };
      M.voiceBend = function () { pk.bends++; return b0.apply(M, arguments); };
      M.voiceStop = function () { pk.stops++; return v0.apply(M, arguments); };
    }
    var c1 = Gw.cellRect(1, 1), c3 = Gw.cellRect(1, 3);
    if (fr === 2) { pk.info = [Gw.cellAt(px, Gw.rowLineY(1), 0), Gw.pickRow(px, Gw.rowLineY(1)), Gw.cellRect(0, 5).x + Gw.cellRect(0, 5).w <= Gw.geom().PICK_X]; epk.ptr("down", c1.x + 5, c1.y + 5, 1); }
    if (fr === 4) { pk.n0 = pk.snd.length; epk.ptr("down", px, Gw.BOARD_Y + 2, 2); epk.ptr("move", px, 316, 2); epk.ptr("up", px, 316, 2); }
    if (fr === 6) { pk.st0 = pk.stops; epk.ptr("move", c3.x + 5, c3.y + 5, 1); }
    if (fr === 8) { pk.st1 = pk.stops; epk.ptr("up", c3.x + 5, c3.y + 5, 1); }
    if (fr === 10) { pk.st2 = pk.stops; epk.ptr("down", px, Gw.rowLineY(4), 3); epk.ptr("up", px, Gw.rowLineY(4), 3); }
  });
  ok(pk.n0 === 0 && pk.snd.slice(0, 6).join() === "64,60,55,50,45,40" && pk.bends === 1 && pk.st2 > pk.st1 && pk.snd[6] === 45 && pk.info[0] === null && pk.info[1] === 1 && pk.info[2],
    "right-hand picking: pressing a fret is silent; swiping the right-hand area plays every string with the held frets (B string at C); moving the held finger bends the ringing string; lifting mutes it; a tap picks one string", [pk.snd, pk.bends, pk.info]);

  // --- §288: よこ向き・持ち方（右利き / 左利き・ネックの太さと位置・右手の所の広さ）---
  var eg = H.load(), Gg = eg.window.UGGuitar, Bg = eg.window.UGBass;
  Gg.layout({ land: true, h: 130 });
  var gA = Gg.geom();
  Gg.layout({ land: true, h: 130, pick: true });
  var gB = Gg.geom(), cB = Gg.cellRect(0, 0);
  eg.store[Bg.GRIP_KEY] = JSON.stringify({ lefty: true, size: "s", pos: "top", pw: 35 });
  Gg.layout({ land: true, h: 130, pick: true });
  var gC = Gg.geom(), cC0 = Gg.cellRect(0, 0), cC1 = Gg.cellRect(0, 1), hitC = Gg.cellAt(gC.BOARD_R - 2, Gg.rowLineY(2), 0), pkC = Gg.pickRow(gC.PICK_X + 5, Gg.rowLineY(2));
  Gg.layout({});
  var gD = Gg.geom();
  ok(gA.COLS === 13 && gA.H === 130 && !gA.MIRROR && gB.COLS < 13 && gB.COLS >= 7 && gB.PICK_X > gB.BOARD_R && cB.x === gB.BOARD_X &&
    gC.MIRROR && gC.PICK_X === 4 && gC.BOARD_X > gC.PICK_R && cC0.x + cC0.w === gC.BOARD_R && cC1.x < cC0.x && hitC && hitC.c === 0 && hitC.sn === 3 && pkC === 2 &&
    gC.BOARD_Y === 14 && gC.BOARD_BOT - gC.BOARD_Y < (gA.BOARD_BOT - gA.BOARD_Y) * 0.75 && (gC.PICK_R - gC.PICK_X) > (gB.PICK_R - gB.PICK_X) &&
    gD.H === 320 && gD.COLS === 8 && !gD.MIRROR,
    "landscape: 13 frets (fewer with the right-hand area); left-handed mirrors the neck (nut on the right, right-hand area on the left); a thin neck at the top; a wider right-hand area; portrait goes back", [gA, gB, gC]);
  var gs1 = Bg.gripStep("size"), gs2 = Bg.gripStep("pw"), gs3 = Bg.gripStep("lefty");
  var pg = prun({ land: true, view: "fret", pick: true, tab: "play" }, 6, function (fr, e) { if (fr === 3) { e.window.__gAct("grip:pos"); } });
  var gp = JSON.parse(pg.e.store["ultimateGorillaGripV1"] || "{}"), hp = pg.e.window.__gPanel();
  ok(gs1.size === "m" && gs2.pw === 20 && gs3.lefty === false && gp.pos === "bot" && hp.indexOf("持ち方") > 0 && hp.indexOf('data-ga="grip:lefty"') > 0 && hp.indexOf('data-ga="land"') > 0,
    "grip settings cycle and are saved (shared by guitar and bass); the play tab shows them in landscape", [gs1, gs2, gs3, gp]);

  // --- §289: 音色は本物のサンプル（エレキも）。エレキのカッティングはミュートのサンプル ---
  var M9 = W.UGMelody, files9 = require("fs"), vOk = G.VOICES.every(function (v) { var f = M9.sampleFiles[v[2]]; return f && files9.existsSync(require("path").join(__dirname, "..", "samples", f + ".js")); });
  var cutE = grun({ view: "chord", voice: "dist" }, 8, function (fr, e) { if (fr === 2) { e.key("keydown", "l"); e.key("keyup", "l"); } });
  var cutA = grun({ view: "chord", voice: "steel" }, 8, function (fr, e) { if (fr === 2) { e.key("keydown", "l"); e.key("keyup", "l"); } });
  ok(vOk && G.VOICES.map(function (v) { return v[2]; }).join() === "24,25,26,27,29,30" && M9.sampleFiles[G.MUTED] === "electric_guitar_muted" &&
    cutE.snd.length === 5 && cutE.snd.every(function (x) { return /@28$/.test(x); }) && cutA.snd.every(function (x) { return /@25$/.test(x); }),
    "voices are real samples (nylon, steel, jazz, clean, overdriven, distortion); electric cutting uses the muted-guitar sample", [cutE.snd, cutA.snd]);
};
