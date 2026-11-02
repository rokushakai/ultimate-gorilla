// ゴリラベース（arcade-bass.js）のテスト（§254）
"use strict";
var H = require("./harness");
var ok = H.ok;

module.exports = function () {
  H.suite("bass");
  var env = H.load(), W = env.window, B = W.UGBass, A = W.UGArcade, U = W.UGUkulele;
  ok(!!B, "UGBass API exists");
  var ids = A.list().map(function (g) { return g.id; }), g = A.list().filter(function (x) { return x.id === "bass"; })[0];
  ok(g && g.cat === "music" && g.music && ids.indexOf("bass") === ids.indexOf("drum") + 1, "bass is a music game right after the drum", ids.indexOf("bass"));

  // --- フレット: 上から G D A E。ポジションで列のフレットが変わる ---
  var r00 = B.cellRect(0, 0), r33 = B.cellRect(3, 3), c00 = B.cellAt(r00.x + 2, r00.y + 2, 0), c33 = B.cellAt(r33.x + 2, r33.y + 2, 0), c50 = B.cellAt(r00.x + 2, r33.y + 2, 5);
  ok(c00.m === 43 && c00.f === 0 && c33.m === 31 && c33.f === 3 && c50.m === 33 && c50.f === 5 && B.cellAt(10, 20, 0) === null && B.STRINGS.length === 4,
    "fretboard: G D A E strings, open strings at position 0, frets follow the position", [c00, c33, c50]);
  ok(B.name(28, "do") === "ミ" && B.name(28, "cde") === "E1" && B.name(43, "none") === "", "note names (ドレミ / CDE with octave / none)");

  // --- パッド: キーのダイアトニックコードに合う8音 ---
  var dm = B.chord(0, 1), cM = B.chord(0, 0), g7 = B.chord(0, 4), gk = B.chord(7, 0), bd = B.chord(0, 6);
  ok(dm.name === "Dm" && JSON.stringify(dm.notes) === "[38,41,45,48,33,40,47,50]", "Dm pads: R F A C / A(below) E B R(octave up)", dm.notes);
  ok(cM.root === 36 && cM.notes[1] === 40 && g7.name === "G" && g7.root === 31 && g7.notes[3] === 41 && gk.name === "G" && gk.notes[1] === 35 && bd.name === "Bdim" && bd.notes[2] === 41,
    "chords follow the key's scale (G gets F as its 7th in C; key G has B as the 3rd; Bdim has F)", [cM.notes, g7.notes, gk.notes, bd.notes]);
  var pr = B.padRect(5), cr = B.chordRect(3);
  ok(B.padAt(pr.x + 3, pr.y + 3) === 5 && B.padAt(1, 1) === -1 && B.chordAt(cr.x + 3, cr.y + 3) === 3 && B.chordAt(cr.x + 3, pr.y + 3) === -1, "pad and chord strip hit tests");

  // --- テイク（シーケンサーと同じ形） ---
  var list = [], i;
  for (i = 0; i < 12; i++) { B.takeAdd(list, { bpm: 100, prog: 36, notes: [[1, 0.5, 40]] }); }
  ok(list.length === B.TAKES_MAX && list[0].id === 12 && list[0].name === "ベース 12" && list[0].prog === 36, "takes: newest first, 10 at most, keep the voice", list.length);
  var cl = B.notesClean([[2, 1, 40], [0, 0.5, 33.4], ["x", 1, 40], [1, 0.25, 36, 0.5]]);
  ok(JSON.stringify(cl) === "[[0,0.5,33],[1,0.25,36,0.5],[2,1,40]]", "notes are cleaned and sorted ([beat, len, midi(, velocity)])", cl);

  // --- シーケンサーへ送る: 🎸 ベース打ち込みトラック・自動のベースはミュート ---
  var st = U.seqLoad();
  st.cur.tracks.bass.on = true; st.cur.tracks.bass.mute = false;
  U.seqSave(st);
  var rs = B.sendToSeq({ name: "ぼくのベース", prog: 36, notes: cl }), st2 = U.seqLoad(), xt = st2.cur.tracks[rs.id];
  ok(rs.ok && rs.muted && xt && xt.preset === "bnotes" && xt.kind === "notes" && xt.prog === 36 && JSON.stringify(xt.notes) === JSON.stringify(cl) && st2.cur.tracks.bass.mute === true && xt.name === "ぼくのベース",
    "send to the sequencer: a bass-notes track with the take's notes and voice; the auto bass gets muted", rs);
  var rs2 = B.sendToSeq({ name: "2つめ", prog: 33, notes: cl });
  ok(rs2.ok && !rs2.muted && !B.sendToSeq({ name: "x", notes: [] }).ok, "a second send does not re-mute; an empty take is refused", rs2.msg);

  // --- 弾く: フレットをタップ・すべらせる（スライド）・録音 ---
  function run(prefs, frames, fn) {
    var e = H.load(), snd = [];
    e.store[B.PREFS_KEY] = JSON.stringify(prefs);
    e.run("bass", { config: {} }, frames, function (f) {
      if (f === 1) {
        var M = e.window.UGMelody, s0 = M.synth, b0 = M.voiceBend, v0 = M.voiceStop, h0 = M.bassHit;
        M.synth = function (m, p) { if (p !== M.DRUM) { snd.push(m + "@" + p); } return s0.apply(M, arguments); };
        M.voiceBend = function (h, m) { snd.push("bend" + m); return b0.apply(M, arguments); };
        M.voiceStop = function () { snd.push("stop"); return v0.apply(M, arguments); };
        M.bassHit = function (k) { snd.push(k); return h0.apply(M, arguments); };
      }
      fn(f, e);
    });
    return { snd: snd, e: e };
  }
  function at(r) { return [r.x + r.w / 2, (r.y + r.h / 2) * 320 / B.H]; }
  var a1 = at(B.cellRect(0, 1)), a3 = at(B.cellRect(0, 3)), a0 = at(B.cellRect(3, 0));
  var f1 = run({ prog: 34 }, 20, function (f, e) {
    if (f === 3) { e.ptr("down", a1[0], a1[1], 1); }
    if (f === 5) { e.ptr("move", a3[0], a3[1], 1); }
    if (f === 7) { e.ptr("up", a3[0], a3[1], 1); }
    if (f === 9) { e.ptr("down", a0[0], a0[1], 2); e.ptr("up", a0[0], a0[1], 2); }
  });
  ok(f1.snd.join() === "44@34,bend46,stop,28@34,stop", "fretboard: tap plays the cell in the chosen voice; sliding on the same string bends it (no new note); letting go stops it", f1.snd);
  // パッド: コード Dm にして、5 のパッド
  var cDm = at(B.chordRect(1)), p5 = at(B.padRect(2));
  var f2 = run({ view: "pad" }, 20, function (f, e) {
    if (f === 3) { e.ptr("down", cDm[0], cDm[1], 1); e.ptr("up", cDm[0], cDm[1], 1); }
    if (f === 5) { e.ptr("down", p5[0], p5[1], 1); e.ptr("up", p5[0], p5[1], 1); }
    if (f === 7) { e.key("keydown", "1"); e.key("keyup", "1"); e.key("keydown", "q"); e.key("keyup", "q"); }
  });
  ok(f2.snd.filter(function (x) { return x.indexOf("@") > 0; }).join() === "45@33,36@33", "pads: pick Dm on the chord strip, then the 5 pad plays A; keys 1 / Q pick C and play its root", f2.snd);
  // 録音: Z → カウント4拍（BPM 120 で 2秒）のあと1音 → Z で保存
  var f3 = run({ bpm: 120 }, 260, function (f, e) {
    if (f === 2) { e.key("keydown", "z"); e.key("keyup", "z"); }
    if (f === 150) { e.ptr("down", a1[0], a1[1], 1); }
    if (f === 180) { e.ptr("up", a1[0], a1[1], 1); }
    if (f === 200) { e.key("keydown", "z"); e.key("keyup", "z"); }
  });
  var tk = JSON.parse(f3.e.store[B.TAKES_KEY] || "[]");
  ok(tk.length === 1 && tk[0].notes.length === 1 && tk[0].notes[0].length === 3 && tk[0].notes[0][2] === 44 && Math.abs(tk[0].notes[0][0] - 0.93) < 0.05 && Math.abs(tk[0].notes[0][1] - 1) < 0.05 && tk[0].bpm === 120,
    "recording: after a 4-beat count, a held note is saved with its beat and length", tk[0] && tk[0].notes);

  // --- §256: 奏法 ---
  var e8 = H.load(), M8 = e8.window.UGMelody;
  M8.audioInit();
  var h8 = M8.synth(40, 33, 0, 0.8);
  e8.counters.targets.length = 0;
  M8.voiceBend(h8, 42, 0, 0.07);
  M8.voiceStop(h8, 0, 0.06);
  var tg8 = e8.counters.targets;
  ok(h8 && h8.p.length > 0 && h8.cur === 42 && M8.synth(36, M8.DRUM, 0, 0.8) === undefined &&
    tg8.filter(function (x) { return x.name === "frequency" && Math.abs(x.v / h8.p[0][1] - Math.pow(2, 2 / 12)) < 1e-6; }).length === h8.p.length &&
    tg8.filter(function (x) { return x.name === "gain" && x.v < 0.001 && x.tau === 0.06; }).length === 1 && !e8.counters.errors.length,
    "engine: synth returns a handle; voiceBend glides the pitch, voiceStop fades it out", [tg8, e8.counters.errors]);
  // ハンマリング・プリング: G 弦 1 フレットを押さえたまま 3 フレットをタップ → 鳴らしなおさず 46 へ、はなすと 44 にもどる。両方はなすと止まる
  var a2 = at(B.cellRect(0, 3)), b1 = at(B.cellRect(1, 3));
  var f4 = run({ prog: 33 }, 20, function (f, e) {
    if (f === 3) { e.ptr("down", a1[0], a1[1], 1); }
    if (f === 5) { e.ptr("down", a2[0], a2[1], 2); }
    if (f === 7) { e.ptr("up", a2[0], a2[1], 2); }
    if (f === 9) { e.ptr("up", a1[0], a1[1], 1); }
    if (f === 11) { e.ptr("down", a1[0], a1[1], 1); e.ptr("down", b1[0], b1[1], 2); e.ptr("up", b1[0], b1[1], 2); e.ptr("up", a1[0], a1[1], 1); }
  });
  ok(f4.snd.join() === "44@33,bend46,bend44,stop,44@33,41@33,stop,stop", "hammer-on bends up on the same string, pull-off goes back, a different string plays its own note", f4.snd);
  // スラップ: E・A 弦は親指、D・G 弦はプル。ミュート: 「ブッ」ですぐ止まる。録音の強さ（スラップ 1・ミュート 0.35）
  var aE = at(B.cellRect(3, 2)), aG = at(B.cellRect(0, 2));
  var f5 = run({ tech: "slap" }, 20, function (f, e) {
    if (f === 3) { e.ptr("down", aE[0], aE[1], 1); e.ptr("up", aE[0], aE[1], 1); e.ptr("down", aG[0], aG[1], 1); e.ptr("up", aG[0], aG[1], 1); }
    if (f === 5) { e.key("keydown", "t"); e.key("keyup", "t"); e.ptr("down", aE[0], aE[1], 1); e.ptr("up", aE[0], aE[1], 1); }
  });
  ok(f5.snd.join() === "30@33,thumb,stop,45@33,pop,stop,30@33,ghost,stop,stop" && JSON.parse(f5.e.store[B.PREFS_KEY]).tech === "mute",
    "slap: thumb on the E/A strings, pop on D/G; T switches to mute, a short ghost note", f5.snd);
  var f6 = run({ tech: "slap", bpm: 120 }, 200, function (f, e) {
    if (f === 2) { e.key("keydown", "z"); e.key("keyup", "z"); }
    if (f === 150) { e.ptr("down", aE[0], aE[1], 1); }
    if (f === 160) { e.ptr("up", aE[0], aE[1], 1); e.key("keydown", "t"); e.key("keyup", "t"); e.ptr("down", aE[0], aE[1], 1); }
    if (f === 170) { e.ptr("up", aE[0], aE[1], 1); }
    if (f === 180) { e.key("keydown", "z"); e.key("keyup", "z"); }
  });
  var tk6 = JSON.parse(f6.e.store[B.TAKES_KEY] || "[]")[0];
  ok(tk6 && tk6.notes.length === 2 && tk6.notes[0][3] === 1 && tk6.notes[1][3] === 0.35, "recording keeps the technique as the velocity (slap 1, mute 0.35)", tk6 && tk6.notes);
  // 再生: 強さで奏法の音を選び、録った長さで止める
  var e7 = H.load(), s7 = [];
  e7.store[B.TAKES_KEY] = JSON.stringify([{ id: 1, name: "t", bpm: 120, prog: 33, notes: [[0, 0.5, 30, 1], [1, 0.5, 45, 1], [2, 0.5, 33, 0.35], [3, 0.5, 40]] }]);
  e7.run("bass", { config: { take: 1 } }, 160, function (f) {
    if (f === 1) {
      var M = e7.window.UGMelody, h0 = M.bassHit, v0 = M.voiceStop;
      M.bassHit = function (k) { s7.push(k); return h0.apply(M, arguments); };
      M.voiceStop = function () { s7.push("stop"); return v0.apply(M, arguments); };
    }
    if (f === 2) { e7.key("keydown", "x"); e7.key("keyup", "x"); }
  });
  ok(s7.join() === "thumb,stop,pop,stop,ghost,stop,stop,stop", "playback picks the technique from the velocity and stops each note at its length", s7);

  // --- §258: 音がつづく・スライドが切れない・パッドの編集・16個 ---
  var e10 = H.load(), M10 = e10.window.UGMelody;
  M10.audioInit();
  e10.counters.targets.length = 0;
  var h10 = M10.synth(40, 33, 5, 0.8, undefined, 8), tg10 = e10.counters.targets.filter(function (x) { return x.name === "gain"; });
  e10.counters.targets.length = 0;
  M10.synth(40, 33, 5, 0.8);
  var tg10b = e10.counters.targets.length;
  ok(h10 && tg10.length === 3 && tg10[0].v < 0.6 * 0.4 && Math.abs(tg10[2].t - (5 + 8 - 0.3)) < 1e-6 && tg10b === 0 && !e10.counters.errors.length,
    "engine: hold keeps the note sounding (decays to a low sustain) until hold seconds; without hold nothing changes", tg10);
  var cC2 = B.chord(0, 0), am2 = B.songChord("Am", 0), ce2 = B.songChord("C/E", 0), pc2 = B.padsClean([[7, 0, 0], [1, 2, 1], "x"]);
  ok(B.PAD_MAX === 16 && B.padLabel([6, -1, -1]) === "♭7↓" && B.padLabel([0, 2, 0]) === "R↑↑" && B.padNote(cC2, [3, 0, 0]) === 41 && B.padNote(cC2, [6, -1, -1]) === 34 &&
    B.padNote(am2, [3, 0, 0]) === 38 && B.padNote(ce2, [0, 0, 0]) === 28 && B.padNote(ce2, [4, 0, 0]) === 43 &&
    JSON.stringify(B.PAD_DEFS.slice(0, 8).map(function (pd) { return B.padNote(cC2, pd); })) === JSON.stringify(cC2.notes) &&
    pc2.length === 16 && pc2[0].join() === "0,0,0" && pc2[1].join() === "1,2,1" && pc2[2].join() === "4,0,0",
    "pad notes: degree / octave / half step from the chord (a slash chord keeps its bass as R); the first 8 are the old pads; bad data falls back");
  // スライド: 0.6 段ずれても同じ弦のまま（G 弦 1F → 3F）。1 段ずれたら D 弦で鳴らしなおす
  var r01 = B.cellRect(0, 1), r03 = B.cellRect(0, 3), sA = at(r01), sB = [at(r03)[0], (r03.y + r03.h * 1.1) * 320 / B.H], sC = [at(r03)[0], (r03.y + r03.h * 1.5) * 320 / B.H];
  var f11 = run({ prog: 33 }, 20, function (f, e) {
    if (f === 3) { e.ptr("down", sA[0], sA[1], 1); }
    if (f === 5) { e.ptr("move", sB[0], sB[1], 1); }
    if (f === 7) { e.ptr("move", sC[0], sC[1], 1); }
    if (f === 9) { e.ptr("up", sC[0], sC[1], 1); }
  });
  ok(f11.snd.join() === "44@33,bend46,stop,41@33,stop", "slide stays on the held string when the finger drifts a little onto the next one", f11.snd);
  // 16個: 13番目（2↑）をタップ、キー J（14番目・4↑）
  var p12 = at(B.padRect(12, 16));
  var f12 = run({ view: "pad", padN: 16 }, 20, function (f, e) {
    if (f === 3) { e.ptr("down", p12[0], p12[1], 1); e.ptr("up", p12[0], p12[1], 1); }
    if (f === 5) { e.key("keydown", "j"); e.key("keyup", "j"); }
  });
  ok(f12.snd.filter(function (x) { return x.indexOf("@") > 0; }).join() === "50@33,53@33" && B.padAt(p12[0], p12[1] * B.H / 320, 16) === 12,
    "16 pads (4x4): the 13th pad plays 2 an octave up; key J plays the 14th", f12.snd);
  // 編集: ✏️ → 4番のパッドをタップしてえらぶ → 度数 4・オクターブ ↑・♯ → キー R で鳴る。音は hold 8秒で鳴らす
  var e13 = H.load({ patch: function (src, file) {
    if (file === "arcade-bass.js") { src = src.split("      function render() {\n").join("      window.__bassAct = action; window.__bassPanel = function () { return panel.innerHTML; };\n      function render() {\n"); }
    return src;
  } }), s13 = [], ph13 = [], pq = at(B.padRect(3));
  e13.store[B.PREFS_KEY] = JSON.stringify({ view: "pad" });
  e13.run("bass", { config: {} }, 30, function (f) {
    var w = e13.window;
    if (f === 1) { var M = w.UGMelody, s0 = M.synth; M.synth = function (m, pg) { if (pg !== M.DRUM) { s13.push(m + "/" + arguments[5]); } return s0.apply(M, arguments); }; }
    if (f === 3) { w.__bassAct("edit"); ph13.push(w.__bassPanel()); e13.ptr("down", pq[0], pq[1], 1); e13.ptr("up", pq[0], pq[1], 1); ph13.push(w.__bassPanel()); }
    if (f === 5) { w.__bassAct("pdeg:3"); w.__bassAct("poct:1"); w.__bassAct("psh:1"); }
    if (f === 7) { w.__bassAct("edit"); e13.key("keydown", "r"); e13.key("keyup", "r"); }
    if (f === 9) { w.__bassAct("padn"); }
  });
  var pf13 = JSON.parse(e13.store[B.PREFS_KEY]);
  ok(s13.join() === "47/8,41/8,53/8,54/8,54/8" && pf13.pads[3].join() === "3,1,1" && pf13.padN === 16 && ph13[0].indexOf("タップしてね") > 0 && ph13[1].indexOf("4 番のパッド") > 0,
    "editing a pad: tap to pick it, change degree / octave / half step (each change previews it), the pad keeps the new note; 8 ↔ 16 is saved", [s13, pf13.pads[3], ph13[1] && ph13[1].slice(0, 120)]);

  // --- §257: 演奏パターン ---
  var p4 = B.patterns(4), p3 = B.patterns(3);
  ok(p4.length === 60 && p3.length === 14 && p4.every(function (d) { return /^[R35678vA-]+$/.test(d[2]) && [8, 12, 16].indexOf(d[2].length) >= 0; }) && p3.every(function (d) { return /^[R35678vA-]+$/.test(d[2]) && [6, 12].indexOf(d[2].length) >= 0; }) && B.patById(p4, "pop")[2] === "R--RR-5-" && B.patById(p4, "waltz")[0] === "pop" && B.patById(p3, "waltz")[2] === "R-5-5-" && B.patById(p4, "walk")[2] === "R-3-5-A-",
    "patterns: the sequencer's bass patterns for the meter (4/4: 60, 3/4: 14), all one bar long", [p4.length, p3.length]);
  var cC = B.songChord("C", 0), cAm = B.songChord("Am", 0);
  ok(B.tokNote("R", cC, null, 9) === 36 && B.tokNote("5", cC, null, 9) === 43 && B.tokNote("8", cC, null, 9) === 48 && B.tokNote("v", cC, null, 9) === 31 &&
    B.tokNote("A", cC, cAm, 1) === 32 && B.tokNote("A", cC, cAm, 2) === 43 && B.tokNote("A", cC, null, 1) === 43 && B.tokLen("R--RR-5-", 0) === 3 && B.tokLen("R--RR-5-", 6) === 2,
    "pattern letters → notes (A walks a half step into the next chord in its last beat) and lengths");
  function prun(prefs, frames, fn, cfg) {
    var e = H.load(), snd = [];
    e.store[B.PREFS_KEY] = JSON.stringify(prefs);
    if (fn.pre) { fn.pre(e); }
    e.run("bass", { config: cfg || {} }, frames, function (f) {
      if (f === 1) { var M = e.window.UGMelody, s0 = M.synth; M.synth = function (m, pg) { if (pg === 33) { snd.push(m); } return s0.apply(M, arguments); }; }
      fn(f, e);
    });
    return { snd: snd, e: e };
  }
  // 伴奏なし: ルート8分・BPM 120（8分 ＝ 0.25秒）。とちゅうでキー 6（Am）→ 次の音から A
  var g1 = prun({ pat: "root8", bpm: 120, view: "fret", quant: "now" }, 80, function (f, e) {
    if (f === 2) { e.key("keydown", "b"); e.key("keyup", "b"); }
    if (f === 40) { e.key("keydown", "6"); e.key("keyup", "6"); }
  });
  var n36 = g1.snd.filter(function (m) { return m === 36; }).length, n33 = g1.snd.filter(function (m) { return m === 33; }).length;
  ok(g1.snd.length >= 5 && g1.snd.length <= 7 && n36 >= 2 && n33 >= 2 && g1.snd.indexOf(33) > g1.snd.lastIndexOf(36),
    "pattern without backing: eighth notes at the BPM on the current chord; changing the chord (key 6 → Am) moves the pattern", g1.snd);
  // 録音中のパターンの音も録る（録音の頭にそろう）
  var g2 = prun({ pat: "r5", bpm: 120 }, 330, function (f, e) {
    if (f === 2) { e.key("keydown", "b"); e.key("keyup", "b"); }
    if (f === 10) { e.key("keydown", "z"); e.key("keyup", "z"); }
    if (f === 10 + 120 + 105) { e.key("keydown", "z"); e.key("keyup", "z"); }
  });
  var tk2 = JSON.parse(g2.e.store[B.TAKES_KEY] || "[]")[0];
  ok(tk2 && tk2.notes.length === 4 && JSON.stringify(tk2.notes.map(function (n) { return [n[0], n[1], n[2]]; })) === "[[0,1,36],[1,1,43],[2,1,36],[3,1,43]]",
    "recording while the pattern plays: the pattern restarts with the take and its notes are saved", tk2 && tk2.notes);
  // 伴奏あり: ポップス（R--RR-5-）が曲のコード（C → Am）について行く。伴奏も頭から
  function g3fn(f, e) { if (f === 2) { e.key("keydown", "b"); e.key("keyup", "b"); } }
  g3fn.pre = function (e) { song(e, [{ type: "chord", name: "C", len: "w" }, { type: "chord", name: "Am", len: "w" }]); };
  var g3 = prun({ pat: "pop", view: "pad" }, 300, g3fn, { backing: "cur" });
  ok(g3.snd.join() === "36,36,36,43,33,33,33,40", "pattern with backing: starts the song and follows its chords (C → Am) to the end", g3.snd);
  // --- §259: わかりやすく・パターン追加 ---
  ok(B.patLegend("R--RR-5-") === "R ルート・5 5度・－ のばす" && B.patLegend("R-5-A-").indexOf("→ 次のコードへ半音") > 0 && B.patLegend("R-v-R-v-").indexOf("5↓ 下の5度") > 0 &&
    U.seqClean({ tracks: { bass: { pattern: "blues" } } }).tracks.bass.pattern === "blues" && U.seqClean({ tracks: { bass: { pattern: "waltzwalk" } } }).tracks.bass.pattern === "waltzwalk",
    "pattern legend for the panel; the new patterns are sequencer auto-bass patterns too");
  // 休みではじまるパターン（ハウス -R-R-R-R）も、はじめのコードの頭はルート
  var g4 = prun({ pat: "house", bpm: 120, view: "fret" }, 60, function (f, e) { if (f === 2) { e.key("keydown", "b"); e.key("keyup", "b"); } });
  ok(g4.snd.length >= 3 && g4.snd[0] === 36, "a pattern that starts with a rest still plays the root at the top of a new chord", g4.snd);
  // フレットの画面: パターン中は上にコードの段（タップで Am）とマスの段（v は 5↓）
  var cAm9 = at(B.chordRect(5));
  var g5 = prun({ pat: "country", bpm: 120, view: "fret", quant: "now" }, 90, function (f, e) {
    if (f === 2) { e.ptr("down", cAm9[0], cAm9[1], 1); e.ptr("up", cAm9[0], cAm9[1], 1); e.key("keydown", "b"); e.key("keyup", "b"); }
    if (f === 40) { e.ptr("down", cAm9[0], cAm9[1], 1); e.ptr("up", cAm9[0], cAm9[1], 1); }
  });
  ok(g5.snd[0] === 36 && g5.snd.indexOf(33) > 0 && g5.snd.indexOf(33) > g5.snd.lastIndexOf(36) && g5.e.counters.texts.indexOf("5↓") >= 0,
    "fret view: the chord strip appears while a pattern plays (tap Am → the pattern follows) with the pattern's cells", g5.snd);
  // --- §263: コード進行・スケールの音 ---
  var sp9 = B.scalePcs(2, "dorian"), ca9 = B.cprogAt(B.cprog("royal"), 5, 4);
  ok(sp9[2] === 3 && sp9[11] === 2 && sp9[4] === 1 && !sp9[1] && B.cprog("nope") === null && B.CPROGS.length === 14 && ca9.d === 4 && ca9.next === 2 && ca9.left === 3,
    "scale notes (tonic / characteristic 6th of dorian) and chord progression lookup by bar", [sp9, ca9]);
  var g7 = prun({ pat: "root", bpm: 240, view: "fret", cprog: "royal" }, 250, function (f, e) { if (f === 2) { e.key("keydown", "b"); e.key("keyup", "b"); } });
  var g8 = prun({ pat: "root", bpm: 240, view: "pad", cprog: "epic", key: 9, scale: "minor" }, 250, function (f, e) { if (f === 2) { e.key("keydown", "b"); e.key("keyup", "b"); } });
  ok(g7.snd.slice(0, 4).join() === "29,31,28,33" && g8.snd.slice(0, 4).join() === "33,29,36,31",
    "a chord progression moves the pattern bar by bar (royal road in C: F G Em Am; epic in A minor: Am F C G)", [g7.snd, g8.snd]);
  // --- §264: 切りかえは次の小節の頭（ルート8分・BPM 120 ＝ 1小節2秒。とちゅうで Am を予約 → 2小節目から Am）---
  var g9 = prun({ pat: "root8", bpm: 120, view: "fret" }, 170, function (f, e) {
    if (f === 2) { e.key("keydown", "b"); e.key("keyup", "b"); }
    if (f === 40) { e.key("keydown", "6"); e.key("keyup", "6"); }
  });
  ok(g9.snd.length >= 9 && g9.snd.slice(0, 8).join() === "36,36,36,36,36,36,36,36" && g9.snd[8] === 33,
    "chord changes during a pattern wait for the next bar (8 eighths of C, then Am)", g9.snd);
  // --- §265: じぶんのパターン ---
  var mc9 = B.myClean([["my1", "a", "R-5-R-5-", 4], ["my1", "dup", "R-------", 4], ["my2", "", "R-5", 4], ["x", "", "R-5-R-5-", 4], ["my3", "", "R-5-R-", 3], "bad"]);
  ok(mc9.length === 2 && mc9[1][1] === "じぶん 3" && B.patResize("R-5-R-5-", 16) === "R---5---R---5---" && B.patResize("R-5-R-5-A-5-R-5-", 8) === "R5R5A5R5",
    "my patterns are cleaned (ids my1-my8, valid cells and lengths); resizing keeps the beats", mc9);
  var cr0 = B.chordRect(0), W9 = (cr0.w + 2) * 7 + 8, st1 = [4 + (W9 - 8) / 8 * 1.5, 74 * 320 / B.H], html16 = "", seq16 = "", my16 = null, pf16 = null;
  var e16 = H.load({ patch: function (src, file) {
    if (file === "arcade-bass.js") { src = src.split("      function render() {\n").join("      window.__bassAct = action; window.__bassPanel = function () { return panel.innerHTML; };\n      function render() {\n"); }
    return src;
  } });
  e16.store[B.PREFS_KEY] = JSON.stringify({ pat: "pop", view: "fret" });
  e16.run("bass", { config: {} }, 14, function (f) {
    var w = e16.window;
    if (f === 3) { w.__bassAct("pedit"); e16.ptr("down", st1[0], st1[1], 1); e16.ptr("up", st1[0], st1[1], 1); w.__bassAct("psave"); html16 = w.__bassPanel(); }
    if (f === 5) { w.__bassAct("patseq"); seq16 = w.__bassPanel(); my16 = JSON.parse(e16.store[B.MYPATS_KEY]); pf16 = JSON.parse(e16.store[B.PREFS_KEY]).pat; }
    if (f === 7) { w.__bassAct("pdel"); }
  });
  ok(my16 && my16.length === 1 && my16[0][0] === "my1" && my16[0][2] === "RR-RR-5-" && pf16 === "my1" && html16.indexOf('<optgroup label="じぶんのパターン"><option value="my1" selected>') > 0 &&
    seq16.indexOf("送れません") > 0 && JSON.parse(e16.store[B.MYPATS_KEY]).length === 0 && JSON.parse(e16.store[B.PREFS_KEY]).pat === "pop",
    "make a pattern: tap a cell (－ → R), save as じぶん 1 (listed first, not sendable to the sequencer), delete it", [my16, pf16]);
  // --- §266: ノリ（ハネ・アクセント）---
  ok(B.swingOf(3, 2, 1) > 0.33 && B.swingOf(3, 2, 2) === 0 && B.swingOf(2, 3, 1) === 0 && B.swingOf(0, 4, 1) === 0 &&
    B.accOf("beat", 2, 0) === 0.92 && B.accOf("beat", 2, 1) === 0.6 && B.accOf("off", 4, 2) === 0.92 && B.accOf("none", 2, 0) === 0.8,
    "swing delays only the off cells of 2- or 4-per-beat patterns; accents on the beat or off the beat");
  // 録音すると、ハネた位置・アクセントの強さで録れる（ルート8分・3連のハネ・拍の頭）
  var g17 = prun({ pat: "root8", bpm: 120, swing: 3, acc: "beat" }, 330, function (f, e) {
    if (f === 2) { e.key("keydown", "b"); e.key("keyup", "b"); }
    if (f === 10) { e.key("keydown", "z"); e.key("keyup", "z"); }
    if (f === 10 + 120 + 105) { e.key("keydown", "z"); e.key("keyup", "z"); }
  });
  var tk17 = JSON.parse(g17.e.store[B.TAKES_KEY] || "[]")[0], n17 = tk17 ? tk17.notes.slice(0, 4) : [];
  ok(n17.length === 4 && JSON.stringify(n17.map(function (n) { return [n[0], n[3]]; })) === "[[0,0.92],[0.667,0.6],[1,0.92],[1.667,0.6]]",
    "a triplet swing records long-short eighths; the beat-head accent is louder", n17);
  // --- §267: ゴリラドラムのリズムといっしょに（8ビート）。ドラムなしならドラムは鳴らない ---
  function drun(prefs) {
    var e = H.load({ patch: function (src, file) {
      if (file === "arcade-bass.js") { src = src.split("      function render() {\n").join("      window.__bassPanel = function () { return panel.innerHTML; };\n      function render() {\n"); }
      return src;
    } }), dr = [], html = "";
    e.store[B.PREFS_KEY] = JSON.stringify(prefs);
    e.run("bass", { config: {} }, 130, function (f) {
      if (f === 1) { var M = e.window.UGMelody, s0 = M.synth; M.synth = function (m, pg) { if (pg === M.DRUM) { dr.push(m); } return s0.apply(M, arguments); }; }
      if (f === 2) { e.key("keydown", "b"); e.key("keyup", "b"); html = e.window.__bassPanel(); }
    });
    return { dr: dr, html: html };
  }
  var d18 = drun({ pat: "root8", bpm: 120, drum: "g:8beat", tab: "feel" }), d19 = drun({ pat: "root8", bpm: 120 }), d20 = drun({ pat: "root8", bpm: 120, drum: "f:end3" });
  ok(d18.dr.filter(function (m) { return m === 36; }).length >= 2 && d18.dr.filter(function (m) { return m === 38; }).length >= 2 && d18.dr.indexOf(42) >= 0 &&
    d19.dr.length === 0 && d20.dr.length === 0 && d18.html.indexOf('<option value="g:8beat" selected>') > 0 && d18.html.indexOf('value="f:') < 0,
    "a Gorilla Drum loop plays along with the bass pattern (kick, snare, hi-hat); none or a fill id plays no drums", [d18.dr.length, d19.dr.length, d20.dr.length]);
  // --- §268: 7th のコード名 ---
  var c7 = [0, 1, 2, 3, 4, 5, 6].map(function (d) { var c = B.chord(0, d, "major", true); return c.name + "/" + c.deg; }).join();
  var h7 = [B.chord(9, 6, "harm", true), B.chord(9, 0, "harm", true), B.chord(9, 2, "melo", true)].map(function (c) { return c.name + "/" + c.deg; }).join();
  ok(c7 === "CM7/IM7,Dm7/iim7,Em7/iiim7,FM7/IVM7,G7/V7,Am7/vim7,Bm7♭5/viiø7" && h7 === "G#dim7/vii°7,AmM7/imM7,CaugM7/♭III+M7" && B.chord(0, 4, "major").name === "G",
    "7th chord names and degrees (major scale, harmonic and melodic minor); triads stay the default", [c7, h7]);
  // --- §269: パネルのタブ（伴奏のときはキーのタブがない・知らないタブは無視）---
  var e21 = H.load({ patch: function (src, file) {
    if (file === "arcade-bass.js") { src = src.split("      function render() {\n").join("      window.__bassAct = action; window.__bassPanel = function () { return panel.innerHTML; };\n      function render() {\n"); }
    return src;
  } }), h21 = [];
  e21.store[B.PREFS_KEY] = JSON.stringify({ view: "fret" });
  e21.run("bass", { config: {} }, 8, function (f) {
    var w = e21.window;
    if (f === 3) { h21.push(w.__bassPanel()); ["feel", "key", "play", "nope"].forEach(function (t) { w.__bassAct("tab:" + t); h21.push(w.__bassPanel()); }); }
  });
  ok(h21[0].indexOf("data-bpat") > 0 && h21[0].indexOf("data-bscale") < 0 && h21[1].indexOf('data-ba="swing"') > 0 && h21[1].indexOf("data-bdrum") > 0 &&
    h21[2].indexOf("data-bscale") > 0 && h21[2].indexOf("data-bcprog") > 0 && h21[3].indexOf('data-ba="posup"') > 0 && h21[3].indexOf('data-ba="tech:slap"') > 0 &&
    h21[4] === h21[3] && JSON.parse(e21.store[B.PREFS_KEY]).tab === "play" && h21.every(function (h) { return h.indexOf('data-ba="pat"') > 0 && h.indexOf('data-ba="rec"') > 0; }),
    "panel tabs: pattern / feel / key / playing; record and pattern buttons stay on top", h21.map(function (h) { return h.length; }));
  // --- §270: リズムゲーム ---
  var allOk = B.SONGS.every(function (sg) {
    var cE = B.chart(sg, "easy"), cN = B.chart(sg, "normal");
    return cN.notes.length > 0 && cE.notes.length > 0 && cE.notes.length <= cN.notes.length &&
      cN.notes.every(function (n) { return n.m >= 28 && n.f >= 0 && n.lane === B.laneOf(n.m); }) && cE.notes.every(function (n) { return n.beat % 1 === 0; });
  });
  var ch0 = B.chart(B.SONGS[0], "normal"), chW = B.chart(B.SONGS.filter(function (x) { return x[0] === "waltz"; })[0], "normal");
  ok(B.SONGS.length === 10 && allOk && ch0.notes[0].m === 29 && ch0.notes[0].lane === 0 && ch0.notes[0].f === 1 && chW.meter === 3 && B.laneOf(45) === 3 && B.laneOf(37) === 1,
    "rhythm charts: 10 songs from pattern x progression, easy keeps the beat heads, each note on the lowest-fret string", [ch0.notes.slice(0, 3), chW.meter]);
  // ちょうどで全部たたく → 全部 PERFECT・ランク S・ベスト保存。なにもしなければ全部 MISS
  function rrun(song, level, hitAll) {
    var e = H.load(), sg = B.SONGS.filter(function (x) { return x[0] === song; })[0], c = B.chart(sg, level), spb = 60 / sg[6], t0 = 0.5 + c.meter * spb, done = {};
    var r = e.run("bass", { config: { mode: "rhythm", song: song, level: level, speed: 100 } }, 3000, function (f) {
      if (!hitAll) { return; }
      c.notes.forEach(function (n, k) {
        if (!done[k] && f / 60 >= t0 + n.beat * spb - 0.005) { done[k] = 1; var key = "dfjk".charAt(n.lane); e.key("keydown", key); e.key("keyup", key); }
      });
    });
    return { r: r, best: JSON.parse(e.store[B.BEST_KEY] || "{}")[song + "@" + level + "@100"], n: c.notes.length };
  }
  var rr1 = rrun("royal", "easy", true), rr2 = rrun("rock", "easy", false);
  ok(rr1.r.ended !== null && rr1.best && rr1.best.r === "S" && rr1.best.s >= rr1.n * 100 + 500 && rr2.r.ended !== null && rr2.best && rr2.best.r === "D",
    "rhythm game: hitting every note on time (keys D F J K) → rank S with full-combo bonus; doing nothing → rank D", [rr1.best, rr2.best]);
  // --- §271: よこ向きはフレット12列（たてにもどすと8列）---
  B.setLayout(true, 130);
  var lc = B.cellRect(3, 11), lcell = B.cellAt(lc.x + lc.w / 2, lc.y + lc.h / 2, 0), lpad = B.padRect(0, 8, B.PAD_Y);
  B.setLayout(false);
  var pc = B.cellRect(0, 7);
  ok(lcell && lcell.f === 11 && lcell.m === 39 && lc.y + lc.h <= 130 && B.cellAt(pc.x + 3, pc.y + 3, 0).f === 7 && B.cellRect(0, 0).y === 128 &&
    B.landH(844, 300) >= 90 && B.landH(844, 300) <= 170 && B.landH(0, 0) === 130,
    "landscape layout: 12 frets fit in the short canvas; portrait goes back to 8 frets", [lcell, lpad]);
  // §275: スマホ向けの音 ＝ ベースの出口に「ローパス → ゆがみ → ハイパス」をたす（OFF ならたす量 0）
  var M275 = W.UGMelody;
  M275.audioInit();
  var st275 = {}, bg275 = B.bus(st275, "b", 100, true), e275on = st275.b.e && st275.b.e.gain.value;
  B.bus(st275, "b", 80, false);
  var e275off = st275.b.e.gain.value, sd275 = {};
  B.bus(sd275, "d", 100, true);
  var ph275 = vrun({ tab: "feel" }, ["phone"]);
  ok(bg275 && e275on === B.ENH && e275off === 0 && Math.abs(st275.b.g.gain.value - 0.8) < 1e-9 && sd275.d.e === null && ph275.p.phone === true && ph275.html.indexOf("スマホ向けの音: ON") > 0,
    "phone speaker mode adds the bass's harmonics (low-pass → distortion → high-pass) only when on, only on the bass", [e275on, e275off]);
  // §274: 録音のメトロノームのボタンはメトロノームの絵（ドラムの絵文字ではない）
  var mh = vrun({}, []).html, mb = mh.slice(mh.indexOf('data-ba="metro"'), mh.indexOf("</button>", mh.indexOf('data-ba="metro"')));
  ok(mb.indexOf("<svg") > 0 && mb.indexOf("1F941") < 0 && mb.indexOf("ON") > 0, "the recording metronome button shows a metronome picture, not the drum emoji", mb.slice(0, 80));
  // §272: よこ向きは板が内側に寄って、弦の名前のところ（左はし）はマスではない
  B.setLayout(true, 130);
  var lo = B.cellRect(0, 0), lgut = B.cellAt(5, lo.y + lo.h / 2, 0), lopen = B.cellAt(lo.x + 2, lo.y + lo.h / 2, 0);
  B.setLayout(false);
  ok(lo.x === 11 && lgut === null && lopen && lopen.f === 0 && lopen.m === 43 && B.cellRect(0, 0).x === 4,
    "landscape: the board moves in so the string names sit outside it (the open G cell starts after them)", [lo, lgut, lopen]);
  // §272: ベース・ドラムの音量（設定は 0〜150 の 10 刻み・ベースもドラムも出口の GainNode を通る）
  function vrun(prefs, acts) {
    var e = H.load({ patch: function (src, file) {
      if (file === "arcade-bass.js") { src = src.split("      function render() {\n").join("      window.__bassAct = action; window.__bassPanel = function () { return panel.innerHTML; };\n      function render() {\n"); }
      return src;
    } }), bd = [], dd = [], html = "";
    e.store[B.PREFS_KEY] = JSON.stringify(prefs);
    e.run("bass", { config: {} }, 70, function (f) {
      if (f === 1) { var M = e.window.UGMelody, s0 = M.synth; M.synth = function (m, pg, w, lv, dest) { (pg === M.DRUM ? dd : bd).push(dest); return s0.apply(M, arguments); }; }
      if (f === 2) { e.key("keydown", "b"); e.key("keyup", "b"); }
      if (f === 3) { for (var i = 0; i < acts.length; i++) { e.window.__bassAct(acts[i]); } html = e.window.__bassPanel(); }
    });
    return { bd: bd, dd: dd, html: html, p: JSON.parse(e.store[B.PREFS_KEY]) };
  }
  var v1 = vrun({ pat: "root8", bpm: 120, drum: "g:8beat", tab: "feel", bvol: 120, volv: 2 }, ["bvol:+", "dvol:-", "dvol:-"]), v2 = vrun({ tab: "feel", bvol: 150, dvol: 10 }, []);
  var vb = v1.bd.filter(function (d) { return d && d.gain; }), vd = v1.dd.filter(function (d) { return d && d.gain; });
  ok(B.vol(150, 100) === 150 && B.vol(155, 100) === 100 && B.vol("x", 60) === 60 && B.vol(-10, 60) === 60 && v2.html.indexOf("100%") > 0 && v2.html.indexOf("50%") > 0 &&
    v1.p.bvol === 130 && v1.p.dvol === 30 && v1.html.indexOf("130%") > 0 && v1.html.indexOf("30%") > 0 &&
    vb.length >= 2 && vb.length === v1.bd.length && vd.length >= 2 && vd.length === v1.dd.length && Math.abs(vd[vd.length - 1].gain.value - 0.3 * 0.4) < 1e-9 && Math.abs(vb[0].gain.value - 0.85) < 0.2,
    "volume: bass and drum levels (0–150%, saved; drums 50% by default, v1.80 values reset; drums trimmed to 0.4) go through their own outputs, and each bass note keeps its own strength", [v1.p.bvol, v1.p.dvol, vb.length, vd.length, vd.length && vd[vd.length - 1].gain.value]);
  // パッドの画面: パターン中はパッドが下へずれる（ずれた位置の 5 のパッド）
  var pp5 = at(B.padRect(2, 8, B.PAD_Y_PAT));
  var g6 = prun({ pat: "root", bpm: 120, view: "pad" }, 30, function (f, e) {
    if (f === 2) { e.key("keydown", "b"); e.key("keyup", "b"); }
    if (f === 20) { e.ptr("down", pp5[0], pp5[1], 1); e.ptr("up", pp5[0], pp5[1], 1); }
  });
  ok(g6.snd.join() === "36,43", "pad view: the pads move down under the pattern cells while a pattern plays", g6.snd);
  // --- §260: ジャンルの一覧 ---
  var gp4 = B.patGroups(p4), gp3 = B.patGroups(p3), ids4 = [];
  gp4.forEach(function (g9) { g9[1].forEach(function (d) { ids4.push(d[0]); }); });
  var uniq = p4.every(function (d, i9) { return p4.map(function (x) { return x[0]; }).indexOf(d[0]) === i9; });
  ok(gp4.length === 6 && gp4[0][0] === "基本" && gp4[5][0] === "分散・そのほか" && gp4[5][1].map(function (d) { return d[0]; }).join() === "arp,arpud,arp7" &&
    ids4.length === 60 && uniq && gp3.length === 1 && gp3[0][0] === "3拍子" && gp3[0][1].length === 14,
    "pattern list by genre: every 4/4 pattern once (unique ids), 3/4 in its own group", gp4.map(function (g9) { return g9[0] + ":" + g9[1].length; }));
  // 一覧からえらぶ（patset）: 鳴らしているパターンが切りかわる。知らない id は無視
  var e14 = H.load({ patch: function (src, file) {
    if (file === "arcade-bass.js") { src = src.split("      function render() {\n").join("      window.__bassAct = action; window.__bassPanel = function () { return panel.innerHTML; };\n      function render() {\n"); }
    return src;
  } }), html14 = "";
  e14.store[B.PREFS_KEY] = JSON.stringify({ pat: "pop" });
  e14.run("bass", { config: {} }, 12, function (f) {
    var w = e14.window;
    if (f === 3) { w.__bassAct("patset:blues"); w.__bassAct("patset:nope"); html14 = w.__bassPanel(); }
  });
  ok(JSON.parse(e14.store[B.PREFS_KEY]).pat === "blues" && html14.indexOf('<option value="blues" selected>') > 0 && html14.indexOf('<optgroup label="ラテン・ワールド">') > 0,
    "picking from the genre list sets the pattern (unknown ids are ignored)", html14.length);
  // --- §262: スケール（ダイアトニック・マイナー・教会旋法）---
  var am9 = B.chord(9, 0, "minor"), sc9 = [B.chord(9, 2, "minor"), B.chord(9, 4, "harm"), B.chord(9, 2, "melo"), B.chord(2, 3, "dorian"), B.chord(4, 1, "phryg"),
    B.chord(0, 1, "lydian"), B.chord(7, 6, "mixo"), B.chord(11, 0, "locrian"), B.chord(0, 0, "nope"), B.chord(0, 1)];
  ok(am9.name === "Am" && am9.deg === "i" && am9.notes[1] === 36 && B.SCALES.length === 9 &&
    sc9.map(function (c) { return c.name + "/" + c.deg; }).join() === "C/♭III,E/V,Caug/♭III+,G/IV,F/♭II,D/II,F/♭VII,Bdim/i°,C/I,Dm/ii",
    "scales: chords and degrees follow the chosen scale (minor, harmonic/melodic minor, church modes; unknown is major)", sc9.map(function (c) { return c.name + "/" + c.deg; }));
  // §268: 7th のコード名
  var c7 = [0, 1, 2, 3, 4, 5, 6].map(function (d) { var c = B.chord(0, d, "major", true); return c.name + "/" + c.deg; }).join();
  var x7 = [B.chord(9, 0, "harm", true), B.chord(9, 6, "harm", true), B.chord(9, 2, "melo", true)].map(function (c) { return c.name + "/" + c.deg; }).join();
  ok(c7 === "CM7/IM7,Dm7/iim7,Em7/iiim7,FM7/IVM7,G7/V7,Am7/vim7,Bm7♭5/viiø7" && x7 === "AmM7/imM7,G#dim7/vii°7,CaugM7/♭III+M7" && B.chord(0, 4, "major", true).notes[3] === B.chord(0, 4).notes[3],
    "7th chord names and degrees (display only: the notes do not change)", [c7, x7]);
  // フレットの画面でもキーとスケールを変えられる（知らない id は無視）
  var e15 = H.load({ patch: function (src, file) {
    if (file === "arcade-bass.js") { src = src.split("      function render() {\n").join("      window.__bassAct = action; window.__bassPanel = function () { return panel.innerHTML; };\n      function render() {\n"); }
    return src;
  } }), html15 = "";
  e15.store[B.PREFS_KEY] = JSON.stringify({ pat: "pop", view: "fret", tab: "key" });
  e15.run("bass", { config: {} }, 12, function (f) {
    var w = e15.window;
    if (f === 3) { w.__bassAct("pat"); w.__bassAct("scale:dorian"); w.__bassAct("scale:nope"); w.__bassAct("keyup"); w.__bassAct("keyup"); html15 = w.__bassPanel(); }
  });
  var pf15 = JSON.parse(e15.store[B.PREFS_KEY]);
  ok(pf15.scale === "dorian" && pf15.key === 2 && html15.indexOf('<option value="dorian" selected>') > 0 && html15.indexOf('data-ba="keyup"') > 0 && html15.indexOf('<optgroup label="教会旋法">') > 0,
    "key and scale can be changed in the fret view while a pattern plays", pf15);
  // --- §261: ベースの音源はぜんぶサンプル（C1〜C5 の17音）---
  var fs9 = require("fs"), path9 = require("path"), sf9 = env.window.UGMelody.sampleFiles, okv = B.VOICES.length === 8;
  B.VOICES.forEach(function (v) {
    var nm = sf9[v[0]], fp = nm && path9.join(H.ROOT, "samples", nm + ".js"), src9 = fp && fs9.existsSync(fp) ? fs9.readFileSync(fp, "utf8") : "";
    var keys9 = (src9.match(/^  "(\d+)":/gm) || []).map(function (k) { return Number(k.replace(/\D/g, "")); });
    if (!src9 || keys9.length !== 17 || keys9[0] !== 24 || keys9[16] !== 72 || src9.indexOf("prog: " + v[0] + ",") < 0) { okv = false; }
  });
  ok(okv, "all 8 bass voices have sample files (17 notes C1..C5, right program)", B.VOICES.map(function (v) { return sf9[v[0]]; }));
  // シーケンサーの自動のベースへ
  var e9 = H.load(), B9 = e9.window.UGBass, U9 = e9.window.UGUkulele, rs9 = B9.patToSeq(B9.patById(B9.patterns(4), "funk"), 36), b9 = U9.seqLoad().cur.tracks.bass;
  ok(rs9.ok && b9.on && !b9.mute && b9.pattern === "funk" && b9.prog === 36, "the pattern can be set as the sequencer's auto bass (on, unmuted, same voice)", b9);

  // --- §255: シーケンサーの曲に合わせて弾く ---
  var am = B.songChord("Am", 0), g7s = B.songChord("G7", 0), ce = B.songChord("C/E", 0), bdim = B.songChord("Bdim", 0);
  ok(JSON.stringify(am.notes) === "[33,36,40,43,28,35,41,45]" && JSON.stringify(g7s.notes) === "[31,35,38,41,26,33,40,43]" && B.songChord("★マイ", 0) === null,
    "song chords: Am → A C E G / E(below) B F A(octave up) in C; G7 gets its own F", [am.notes, g7s.notes]);
  ok(ce.root === 28 && ce.notes[0] === 28 && ce.notes[7] === 40 && ce.notes[1] === 40 && ce.notes[3] === 47 && bdim.notes[2] === 41 && bdim.notes[3] === 45,
    "slash chords put E on the R pads (C/E); Bdim has F as its 5th and A as its 7th", [ce.notes, bdim.notes]);
  function song(e, rows, extra) {
    var U2 = e.window.UGUkulele, sq = U2.seqClean(null), k;
    sq.rows = rows; sq.bpm = 120; sq.countIn = false; sq.loop = false;
    for (k in extra || {}) { if (extra.hasOwnProperty(k)) { sq[k] = extra[k]; } }
    e.store[U2.SEQ_KEY] = JSON.stringify({ cur: U2.seqClean(sq), songs: [{ id: 3, name: "ぼくの曲", seq: U2.seqClean(sq) }] });
  }
  var e4 = H.load(), B4 = e4.window.UGBass;
  song(e4, [{ type: "chord", name: "C", len: "w" }, { type: "chord", name: "C", len: "w" }, { type: "rest", len: "w" }, { type: "chord", name: "Am", len: "w" }]);
  var bk4 = B4.backing("cur"), cs = bk4 && bk4.chords;
  ok(B4.backList().map(function (b) { return b[0]; }).join() === "cur,s:3" && B4.backing("s:9") === null && cs && cs.length === 2 && cs[0].name === "C" && cs[0].end === 12 && cs[1].start === 12 && bk4.key === 0 &&
    B4.chordIdx(cs, -1) === 0 && B4.chordIdx(cs, 11.9) === 0 && B4.chordIdx(cs, 12) === 1,
    "backing: the same chord in a row and rests stretch one chord; the chord at a beat", cs && cs.map(function (c) { return [c.name, c.start, c.end]; }));
  ok(!B4.backEventOn({ kind: "note", track: "bass", t: 1 }, bk4.seq, 0, true) && B4.backEventOn({ kind: "note", track: "bass", t: 1 }, bk4.seq, 0, false) &&
    !B4.backEventOn({ kind: "note", track: "x1", t: 1 }, { tracks: { x1: { prog: 33 } } }, 0, true) && B4.backEventOn({ kind: "strum", track: "uke", t: 1 }, bk4.seq, 0, true),
    "the song's own bass (auto bass and bass-voice tracks) can be left out of the backing");
  // 合わせて録音（パッド）: カウントインのない曲 → ベースが1小節数えてから曲。Am のところで R のパッド → A を鳴らし、曲の拍で保存。曲が終わると止まる
  var e5 = H.load(), snd5 = [], st5 = null, g5 = -1;
  song(e5, [{ type: "chord", name: "C", len: "w" }, { type: "chord", name: "Am", len: "w" }]);
  e5.store[B.PREFS_KEY] = JSON.stringify({ view: "pad" });
  e5.run("bass", { config: { backing: "cur" } }, 420, function (f) {
    if (f === 1) { var M = e5.window.UGMelody, s0 = M.synth; M.synth = function (m, p) { if (p === 33) { snd5.push(m); } return s0.apply(M, arguments); }; }
    if (f === 3) { e5.key("keydown", "q"); e5.key("keyup", "q"); }
    if (f === 5) { e5.key("keydown", "z"); e5.key("keyup", "z"); g5 = f; }
    if (g5 > 0 && f === g5 + Math.round((2 + 2.3) * 60)) { e5.key("keydown", "q"); }
    if (g5 > 0 && f === g5 + Math.round((2 + 2.8) * 60)) { e5.key("keyup", "q"); st5 = e5.window.UGBass ? JSON.parse(e5.store[B.TAKES_KEY] || "[]").length : -1; }
  });
  var tk5 = JSON.parse(e5.store[B.TAKES_KEY] || "[]")[0];
  ok(snd5.join() === "36,33", "pads follow the song: C's root before playing, A once the song reaches Am (the song's bass is not played)", snd5);
  ok(st5 === 0 && tk5 && tk5.bpm === 120 && tk5.notes.length === 1 && tk5.notes[0][2] === 33 && Math.abs(tk5.notes[0][0] - 4.6) < 0.1 && Math.abs(tk5.notes[0][1] - 1) < 0.1,
    "recording along: a 1-bar count first, the note is saved in the song's beats, and the take is saved when the song ends", tk5 && tk5.notes);
};
