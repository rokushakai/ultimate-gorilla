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
      if (f === 1) { var M = e.window.UGMelody, s0 = M.synth; M.synth = function (m, p) { if (p !== M.DRUM) { snd.push(m + "@" + p); } return s0.apply(M, arguments); }; }
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
  ok(f1.snd.join() === "44@34,46@34,28@34", "fretboard: tap plays the cell, sliding to another fret plays that note, in the chosen voice", f1.snd);
  // パッド: コード Dm にして、5 のパッド
  var cDm = at(B.chordRect(1)), p5 = at(B.padRect(2));
  var f2 = run({ view: "pad" }, 20, function (f, e) {
    if (f === 3) { e.ptr("down", cDm[0], cDm[1], 1); e.ptr("up", cDm[0], cDm[1], 1); }
    if (f === 5) { e.ptr("down", p5[0], p5[1], 1); e.ptr("up", p5[0], p5[1], 1); }
    if (f === 7) { e.key("keydown", "1"); e.key("keyup", "1"); e.key("keydown", "q"); e.key("keyup", "q"); }
  });
  ok(f2.snd.join() === "45@33,36@33", "pads: pick Dm on the chord strip, then the 5 pad plays A; keys 1 / Q pick C and play its root", f2.snd);
  // 録音: Z → カウント4拍（BPM 120 で 2秒）のあと1音 → Z で保存
  var f3 = run({ bpm: 120 }, 260, function (f, e) {
    if (f === 2) { e.key("keydown", "z"); e.key("keyup", "z"); }
    if (f === 150) { e.ptr("down", a1[0], a1[1], 1); }
    if (f === 180) { e.ptr("up", a1[0], a1[1], 1); }
    if (f === 200) { e.key("keydown", "z"); e.key("keyup", "z"); }
  });
  var tk = JSON.parse(f3.e.store[B.TAKES_KEY] || "[]");
  ok(tk.length === 1 && tk[0].notes.length === 1 && tk[0].notes[0][2] === 44 && Math.abs(tk[0].notes[0][0] - 0.93) < 0.05 && Math.abs(tk[0].notes[0][1] - 1) < 0.05 && tk[0].bpm === 120,
    "recording: after a 4-beat count, a held note is saved with its beat and length", tk[0] && tk[0].notes);
};
