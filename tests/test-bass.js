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
