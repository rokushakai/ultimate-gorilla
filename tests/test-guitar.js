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
  var gm = G.geom(), upS = G.strumCross(gm.STRUM_BOT - 1, gm.STRUM_Y), dnS = G.strumCross(gm.STRUM_Y, gm.STRUM_BOT - 1), part = G.strumCross(G.strumLineY(1) - 1, G.strumLineY(3) - 1);
  ok(upS.join() === "0,1,2,3,4,5" && dnS.join() === "5,4,3,2,1,0" && part.join() === "2,3" && G.strumAt(G.strumLineY(4)) === 4 && G.strumAt(10) === -1 && G.strumLineY(0) > G.strumLineY(5) &&
    G.chordRect(0).y > gm.STRUM_BOT && G.chordRect(0).y + G.chordRect(0).h <= 320,
    "strum view (§290): the 6th string is nearest (bottom), swiping up from it crosses 6th → 1st (a down stroke); the chord buttons are at the bottom", [upS, dnS, part]);

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
  var x0 = 200, yT = gm.STRUM_Y + 2, yB = gm.STRUM_BOT - 2, s2 = grun({ view: "chord", voice: "nylon" }, 20, function (fr, e) {
    if (fr === 2) { e.ptr("down", x0, yB, 1); }
    if (fr === 3) { e.ptr("move", x0, 150, 1); }
    if (fr === 4) { e.ptr("move", x0, yT, 1); e.ptr("up", x0, yT, 1); }
    if (fr === 6) { e.ptr("down", x0, yT, 1); e.ptr("move", x0, yB, 1); e.ptr("up", x0, yB, 1); }
    if (fr === 8) { e.ptr("down", x0, G.strumLineY(2) + 3, 1); e.ptr("up", x0, G.strumLineY(2) + 3, 1); }
  });
  ok(s2.snd.join() === "48@24,52@24,55@24,60@24,64@24,64@24,60@24,55@24,52@24,48@24,52@24", "swiping up from the near (6th) string strums 6th → 1st (muted 6th skipped), swiping down strums back; a tap picks one string", s2.snd);
  // 単音: 2弦の1フレットをタップ → 3フレットへすべらせる ＝ 鳴らしなおさずに音程だけ（スライド）。別の弦は新しい音
  var b1 = G.cellRect(1, 1), b3 = G.cellRect(1, 3), e2 = G.cellRect(2, 2);
  var s3 = grun({ view: "fret", voice: "clean" }, 20, function (fr, e) {
    if (fr === 2) { e.ptr("down", b1.x + 5, b1.y + 5, 1); }
    if (fr === 4) { e.ptr("move", b3.x + 5, b3.y + b3.h / 2, 1); }
    if (fr === 6) { e.ptr("up", b3.x + 5, b3.y + b3.h / 2, 1); e.ptr("down", e2.x + 5, e2.y + 5, 2); e.ptr("up", e2.x + 5, e2.y + 5, 2); }
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
  ok(bb1.mine.join() === "48,52,55,60,64,43,47,50,55,59,65" && bb1.others.indexOf(140) < 0 && bb2.others.indexOf(140) >= 0 &&
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
    if (fr === 6) { pk.st0 = pk.stops; epk.ptr("move", c3.x + 5, c3.y + c3.h / 2, 1); }
    if (fr === 8) { pk.st1 = pk.stops; epk.ptr("up", c3.x + 5, c3.y + c3.h / 2, 1); }
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

  // --- §291: よこ向きのストローク（左手側のコードのボタン・左利き・コードの列）---
  var e91 = H.load(), G91 = e91.window.UGGuitar, B91 = e91.window.UGBass;
  function lay(o) { G91.layout(o); var g = G91.geom(); g.r0 = G91.chordRect(0); g.r6 = G91.chordRect(6); return g; }
  var sN = lay({ land: true, h: 130 }), sF = lay({ land: true, h: 130, cpos: "far" }), sS = lay({ land: true, h: 130, cpos: "side" });
  var gN = lay({ land: true, h: 130, cgrid: true }), gF = lay({ land: true, h: 130, cgrid: true, cpos: "far" }), gS = lay({ land: true, h: 130, cgrid: true, cpos: "side" });
  var gNcol = (lay({ land: true, h: 130, cgrid: true }), G91.gridCol(gN.r6.x + 3));
  e91.store[B91.GRIP_KEY] = JSON.stringify({ lefty: true });
  var lN = lay({ land: true, h: 130 }), lS = lay({ land: true, h: 130, cpos: "side" }), lG = lay({ land: true, h: 130, cgrid: true });
  var lGcol = G91.gridCol(lG.r6.x + 3);
  ok(sN.CMODE === "strip" && sN.r0.y > sN.STRUM_BOT && sN.r0.y + sN.r0.h <= 130 && sN.r0.x < sN.r6.x && sF.r0.y < sF.STRUM_Y &&
    sS.CMODE === "side" && sS.r0.x === 4 && sS.STRUM_X0 > sS.r0.x + sS.r0.w && sS.r6.y > sS.r0.y &&
    gN.CMODE === "grid" && gN.r0.y > gN.STRUM_BOT && gF.r0.y < gF.STRUM_Y && gS.CMODE === "grid" && gS.r0.y === gN.r0.y && gNcol === 6 &&
    lN.CREV && lN.r0.x > lN.r6.x && lS.r0.x > lS.STRUM_X1 && lG.r0.x > lG.r6.x && lGcol === 6,
    "landscape strum (§292): chords near (bottom, default), far (top) or at the side; the chord grid near or far; left-handed lays the chords out from the right", [sN, sS, gN, lN]);
  // コードの列: F の列（4つめ）を下から上へなぞる ＝ F のダウン。G の名前をタップ ＝ G のジャーン
  var g91 = { snd: [] }, eg91 = H.load();
  eg91.store[G.PREFS_KEY] = JSON.stringify({ view: "chord", land: true, cgrid: true, voice: "steel" });
  eg91.run("guitar", { config: {} }, 12, function (fr) {
    var Gw = eg91.window.UGGuitar, gm = Gw.geom(), M = eg91.window.UGMelody;
    // テストの画面（240×320）はたて長なので、よこ向きのゲームは 90° 回した座標で渡す
    function lp(t, x, y, id) { eg91.ptr(t, 240 - y * 240 / gm.H, x * 320 / 240, id); }
    if (fr === 1) { var s0 = M.synth; M.synth = function (m, pg) { if (pg === 25) { g91.snd.push(m); } return s0.apply(M, arguments); }; }
    var fx = Gw.chordRect(3).x + 5, gx = Gw.chordRect(4).x + 5;
    if (fr === 2) { g91.mode = gm.CMODE; lp("down", fx, gm.STRUM_BOT - 1, 1); lp("move", fx, gm.STRUM_Y + 1, 1); lp("up", fx, gm.STRUM_Y + 1, 1); }
    if (fr === 5) { lp("down", gx, Gw.chordRect(4).y + 3, 2); lp("up", gx, Gw.chordRect(4).y + 3, 2); }
  });
  ok(g91.mode === "grid" && g91.snd.slice(0, 6).join() === "41,48,53,57,60,65" && g91.snd.slice(6, 12).join() === "43,47,50,55,59,67",
    "chord grid: swiping up in the F column strums F; tapping the G name strums G", g91.snd);

  // --- §293: ストロークの強さ（ゆっくりなぞると弱く・速いと強く）---
  function vrun(steps) {
    var e = H.load(), lv = [];
    e.store[G.PREFS_KEY] = JSON.stringify({ view: "chord", voice: "steel" });
    e.run("guitar", { config: {} }, steps + 6, function (fr) {
      var gm = e.window.UGGuitar.geom(), M = e.window.UGMelody, y0 = gm.STRUM_BOT - 2, y1 = gm.STRUM_Y + 2;
      if (fr === 1) { var s0 = M.synth; M.synth = function (m, pg, w, l) { if (pg === 25) { lv.push(l); } return s0.apply(M, arguments); }; }
      if (fr === 2) { e.ptr("down", 200, y0, 1); }
      if (fr > 2 && fr <= 2 + steps) { e.ptr("move", 200, y0 + (y1 - y0) * (fr - 2) / steps, 1); }
      if (fr === 3 + steps) { e.ptr("up", 200, y1, 1); }
    });
    return lv;
  }
  var vSlow = vrun(40), vFast = vrun(1);
  ok(vSlow.length === 5 && vFast.length === 5 && vSlow[0] < vFast[0] * 0.6 && G.vel(0) === 0.4 && G.vel(1000) === 1.2,
    "stroke strength: a slow swipe plays softer than a fast one", [vSlow, vFast]);

  // --- §294: 自分でコードをならべる（sus4・add9・分数コード・パワーコードなど）---
  function fq(pc, q, b) { return JSON.stringify(G.shapeQ(pc, q, b === undefined ? -1 : b).frets); }
  ok(fq(2, "sus4") === "[null,null,0,2,3,3]" && fq(9, "sus2") === "[null,0,2,2,0,0]" && fq(4, "sus4") === "[0,2,2,2,0,0]" && fq(0, "add9") === "[null,3,2,0,3,0]" &&
    fq(7, "maj", 11) === "[null,2,0,0,0,3]" && fq(2, "maj", 6) === "[2,null,0,2,3,2]" && fq(0, "maj", 4) === "[0,3,2,0,1,0]" && fq(4, "9") === "[null,7,6,7,7,7]" && fq(0, "pow") === "[null,3,5,5,null,null]" &&
    G.slotName({ r: 7, q: "maj", b: 11 }) === "G/B" && G.slotName({ r: 10, q: "sus4", b: -1 }) === "B♭sus4" && G.slotName({ r: 9, q: "m7b5", b: -1 }) === "Am7(♭5)" &&
    G.CTYPES.every(function (ct) { var n = G.slotName({ r: 2, q: ct[0], b: -1 }); return !!B.songChord(n, 0) && G.shapeQ(2, ct[0], -1).midis.filter(function (m) { return m !== null; }).length >= 2; }),
    "custom chords: open sus/add9 shapes, slash chords put the bass on the 6th or 5th string (G/B, D/F#, C/E), barre 9 and power chords; every type has a name and a shape", [fq(7, "maj", 11), fq(4, "9"), fq(0, "pow")]);
  var my = prun({ view: "chord", tab: "key", voice: "steel" }, 12, function (fr, e) {
    if (fr === 3) { e.window.__gAct("myon"); e.key("keydown", "5"); e.key("keyup", "5"); }
    if (fr === 5) { e.window.__gAct("myq:sus4"); e.window.__gAct("myb:11"); e.window.__gAct("myr:-"); }
    if (fr === 8) { e.key("keydown", "j"); e.key("keyup", "j"); }
  });
  var myp = JSON.parse(my.e.store[G.PREFS_KEY]), myh = my.e.window.__gPanel(), myLast = my.snd.slice(-5);
  ok(myp.myOn && myp.myEdit && myp.myc[4].r === 6 && myp.myc[4].q === "sus4" && myp.myc[4].b === 11 && myp.myc[0].r === 0 && myh.indexOf("F#sus4/B") > 0 && myh.indexOf('data-gmyq="1"') > 0 &&
    myLast.join() === JSON.stringify(G.shapeQ(6, "sus4", 11).midis.filter(function (m) { return m !== null; })).replace(/[\[\]]/g, ""),
    "the key tab edits the selected chord button (root, type, bass); strums use it", [myp.myc[4], myLast]);

  // --- §295: チョーキング（押さえた指を縦に動かす ＝ 音が上がる・1行で全音まで・弦は変わらない）---
  var bn = { b: [], snd: [] }, ebn = H.load();
  ebn.store[G.PREFS_KEY] = JSON.stringify({ view: "fret", voice: "steel" });
  ebn.run("guitar", { config: {} }, 14, function (fr) {
    var Gw = ebn.window.UGGuitar, M = ebn.window.UGMelody, c = Gw.cellRect(1, 3), cy = c.y + c.h / 2;
    if (fr === 1) { var s0 = M.synth, b0 = M.voiceBend; M.synth = function (m, pg) { if (pg === 25) { bn.snd.push(m); } return s0.apply(M, arguments); }; M.voiceBend = function (h, m) { bn.b.push(m); return b0.apply(M, arguments); }; }
    if (fr === 2) { ebn.ptr("down", c.x + 5, cy, 1); }
    if (fr === 4) { ebn.ptr("move", c.x + 5, cy - c.h * 0.05, 1); }
    if (fr === 6) { ebn.ptr("move", c.x + 5, cy - c.h * 0.575, 1); }
    if (fr === 8) { ebn.ptr("move", c.x + 5, cy - c.h * 2, 1); }
    if (fr === 10) { ebn.ptr("move", c.x + 5, cy, 1); ebn.ptr("up", c.x + 5, cy, 1); }
  });
  ok(bn.snd.join() === "62" && bn.b.join() === "63,64,62" && G.bendOf(0, 40) === 0 && G.bendOf(40, 40) === 2 && G.bendOf(-100, 40) === 2,
    "bending: moving the pressed finger across the neck raises the pitch (a small wobble is ignored), a whole step at most, back down when it returns; the string does not change", [bn.snd, bn.b]);

  // --- §296: ブリッジミュート（短く。エレキはミュートのサンプル）---
  function mrun(voice) {
    var e = H.load(), r = { snd: [], stops: [] };
    e.store[G.PREFS_KEY] = JSON.stringify({ view: "chord", voice: voice, pmute: true });
    e.run("guitar", { config: {} }, 6, function (fr) {
      var M = e.window.UGMelody;
      if (fr === 1) { var s0 = M.synth, v0 = M.voiceStop; M.synth = function (m, pg) { if (pg !== M.DRUM) { r.snd.push(pg); } return s0.apply(M, arguments); }; M.voiceStop = function (h, t) { r.stops.push(t - h.ac.currentTime); return v0.apply(M, arguments); }; }
      if (fr === 2) { e.key("keydown", "j"); e.key("keyup", "j"); }
    });
    return r;
  }
  var pmE = mrun("dist"), pmA = mrun("steel");
  ok(pmE.snd.length === 5 && pmE.snd.every(function (p) { return p === 28; }) && pmA.snd.every(function (p) { return p === 25; }) && pmA.stops.length >= 5 && pmA.stops.slice(-5).every(function (d) { return d > 0.1 && d < 0.3; }),
    "palm mute: notes are cut short; electric voices use the muted-guitar sample", [pmE.snd, pmA.stops]);

  // --- §297: パワーコード・カポ ---
  var pw = grun({ view: "chord", voice: "steel", power: true }, 6, function (fr, e) { if (fr === 2) { e.key("keydown", "j"); e.key("keyup", "j"); } });
  var cp = grun({ view: "chord", voice: "steel", key: 2, capo: 2 }, 6, function (fr, e) { if (fr === 2) { e.key("keydown", "j"); e.key("keyup", "j"); } });
  var cpk = { snd: [] }, ecp = H.load();
  ecp.store[G.PREFS_KEY] = JSON.stringify({ view: "fret", pick: true, capo: 3, voice: "steel" });
  ecp.run("guitar", { config: {} }, 6, function (fr) {
    var Gw = ecp.window.UGGuitar, M = ecp.window.UGMelody, px = Gw.geom().PICK_X + 12;
    if (fr === 1) { var s0 = M.synth; M.synth = function (m, pg) { if (pg === 25) { cpk.snd.push(m); } return s0.apply(M, arguments); }; }
    if (fr === 2) { ecp.ptr("down", px, Gw.rowLineY(0), 1); ecp.ptr("up", px, Gw.rowLineY(0), 1); }
  });
  ok(pw.snd.join() === "48@25,55@25,60@25" && cp.snd.join() === "50@25,54@25,57@25,62@25,66@25" && cpk.snd.join() === "67",
    "power chords play root-5th-octave; capo 2 in D uses the C shape two frets up; with the capo an unpressed string sounds at the capo fret", [pw.snd, cp.snd, cpk.snd]);

  // --- §298: エフェクト（コーラス・ディレイ・リバーブを混ぜる量）---
  var ef = H.load(), Mf = ef.window.UGMelody, Gf = ef.window.UGGuitar;
  Mf.audioInit();
  var stf = {};
  Gf.bus(stf, "clean", 100, {});
  var f0 = stf["g:clean"].fx, z = [f0.ch.gain.value, f0.dl.gain.value, f0.rv.gain.value].join();
  Gf.bus(stf, "clean", 100, { ch: 1, dl: 2, rv: 2 });
  var f1 = stf["g:clean"].fx;
  var pf = prun({ tab: "play" }, 6, function (fr, e) { if (fr === 3) { e.window.__gAct("fxd"); e.window.__gAct("fxd"); e.window.__gAct("fxr"); e.window.__gAct("fxc"); } });
  var pfp = JSON.parse(pf.e.store[G.PREFS_KEY]), pfh = pf.e.window.__gPanel();
  ok(z === "0,0,0" && f1.ch.gain.value === 0.6 && f1.dl.gain.value === 0.35 && f1.dly.delayTime.value === 0.42 && f1.rv.gain.value === 0.55 && f0 === f1 &&
    pfp.fxd === 2 && pfp.fxr === 1 && pfp.fxc === 1 && pfh.indexOf("ディレイ 長い") > 0 && pfh.indexOf("リバーブ 少し") > 0,
    "effects: chorus, delay (short / long) and reverb (a little / lots) are mixed in by the settings; the chain is built once", [z, pfp.fxc, pfp.fxd, pfp.fxr]);

  // --- §299: リズムゲームのコードの列（レーン ＝ 曲のコード。キー 1〜）・よこ向き ---
  function grrun(song, land) {
    var e = H.load(), sg = G.SONGS.filter(function (x) { return x[0] === song; })[0], c = G.chart(sg, "normal"), spb = 60 / sg[6], t0 = 0.5 + c.meter * spb, done = {}, cols = [], gs = 0, H0 = 0;
    c.notes.forEach(function (n) { if (cols.indexOf(n.d) < 0) { cols.push(n.d); } });
    var r = e.run("guitar", { config: { mode: "rhythm", song: song, level: "normal", speed: 100, grid: true, land: land } }, 3000, function (f) {
      if (f === 1) { H0 = e.window.UGGuitar.geom().H; var M = e.window.UGMelody, s0 = M.synth; M.synth = function (m, pg) { if (pg === 24) { gs++; } return s0.apply(M, arguments); }; }
      c.notes.forEach(function (n, k) {
        if (!done[k] && f / 60 >= t0 + n.beat * spb - 0.005) { done[k] = 1; var key = String(cols.indexOf(n.d) + 1); e.key("keydown", key); e.key("keyup", key); }
      });
    });
    return { r: r, best: JSON.parse(e.store[G.BEST_KEY] || "{}")[song + "@normal@100@g"], n: c.notes.length, cols: cols, gs: gs, H: H0 };
  }
  var gq1 = grrun("pop", false), gq2 = grrun("rock", true);
  ok(gq1.cols.length === 4 && gq1.best && gq1.best.r === "S" && gq1.gs >= gq1.n * 4 && gq1.H === 320 && gq2.best && gq2.best.r === "S" && gq2.H < 200,
    "rhythm game chord grid: lanes are the song's chords (keys 1-n); hitting every chord on time gets rank S; landscape works too", [gq1.cols, gq1.best, gq2.best, gq2.H]);

  // --- §289: 音色は本物のサンプル（エレキも）。エレキのカッティングはミュートのサンプル ---
  var M9 = W.UGMelody, files9 = require("fs"), vOk = G.VOICES.every(function (v) { var f = M9.sampleFiles[v[2]]; return f && files9.existsSync(require("path").join(__dirname, "..", "samples", f + ".js")); });
  var cutE = grun({ view: "chord", voice: "dist" }, 8, function (fr, e) { if (fr === 2) { e.key("keydown", "l"); e.key("keyup", "l"); } });
  var cutA = grun({ view: "chord", voice: "steel" }, 8, function (fr, e) { if (fr === 2) { e.key("keydown", "l"); e.key("keyup", "l"); } });
  ok(vOk && G.VOICES.map(function (v) { return v[2]; }).join() === "24,25,26,27,29,30" && M9.sampleFiles[G.MUTED] === "electric_guitar_muted" &&
    cutE.snd.length === 5 && cutE.snd.every(function (x) { return /@28$/.test(x); }) && cutA.snd.every(function (x) { return /@25$/.test(x); }),
    "voices are real samples (nylon, steel, jazz, clean, overdriven, distortion); electric cutting uses the muted-guitar sample", [cutE.snd, cutA.snd]);
};
