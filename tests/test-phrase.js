// §345 A24: フレーズの道具（範囲・コピー・貼り付け・複製・移調・オクターブ・拍で移動・長さ・強さ）
"use strict";
var H = require("./harness");
var ok = H.ok;

module.exports = async function () {
  H.suite("phrase");
  var env = H.load(), W = env.window, X = W.UGXmas, D = W.UGDaw, A = W.UGArcade, M = W.UGDawModel, R = H.makeEl("div");
  A.start("daw", R, {});
  D.xmas.host.newSong(X.tplNewProject(X.tplPlan(null, "pop", "new", 1, 1, "full")).project); D.xmas.host.back();
  var p = D.project(), mel = p.tracks[0], L = M.sectionsOf(p), P = D.phrase;
  var iA = L.map(function (s) { return s.name; }).indexOf("Aメロ"), iA2 = L.map(function (s) { return s.name; }).indexOf("Aメロ 2");
  function clipAt(t, tick) { return t.clips.filter(function (c) { return c.start <= tick && tick < c.start + c.len; })[0]; }
  var cA = clipAt(mel, L[iA].tick), cA2 = clipAt(mel, L[iA2].tick);
  // A メロに 8 音のフレーズ
  cA.notes = [[0, 480, 74, 0.8], [480, 480, 76, 0.7], [960, 960, 78, 0.8], [1920, 480, 76, 0.7], [2400, 480, 74, 0.7], [3840, 960, 81, 0.9], [4800, 480, 79, 0.7], [5760, 1920, 78, 0.8]];
  cA2.notes = [[0, 1920, 60, 0.5]]; // 2 番には仮の音
  var srcKeep = JSON.stringify(cA.notes), accKeep = JSON.stringify(p.tracks.slice(1));
  // 1. 全部を選んでコピー → 2 番の A メロへ貼り付け（置きかえ）
  D.openRoll(cA.id); P.act("phr"); P.act("pall"); var cp = P.copy();
  ok(cp.ok && cp.n === 8 && P.clip().bar0 === M.tickToBar(p, L[iA].tick).bar - 1, "copy the A-melody phrase (8 notes, from its bar)", cp);
  var u0 = D.project().tracks.length, snapBefore = JSON.stringify(p.tracks);
  var pr = P.paste(mel, L[iA2].tick, "replace");
  ok(pr.ok && pr.added === 8 && pr.removed === 1 && pr.dropped === 0 && JSON.stringify(cA2.notes.map(function (n) { return [n[0], n[1], n[2], n[3]]; })) === srcKeep && JSON.stringify(cA.notes) === srcKeep, "paste to verse 2 (replace): the same 8 notes at the same places; the old note there removed; the original phrase is untouched", pr);
  // 最後の数音だけ変える
  cA2.notes[7][2] = 81; cA2.notes[6][2] = 83;
  ok(JSON.stringify(cA.notes) === srcKeep && cA2.notes[7][2] === 81, "changing the last notes of verse 2 does not change verse 1 (the copies are independent)");
  // 2. 重ねる（同じ高さの重なりを切る）
  cA2.notes = [[0, 1920, 74, 0.5]];
  var pm = P.paste(mel, L[iA2].tick, "mix");
  var d74 = cA2.notes.filter(function (n) { return n[2] === 74; });
  ok(pm.ok && pm.removed === 0 && pm.trimmed >= 1 && d74.every(function (n, i) { return i === 0 || d74[i - 1][0] + d74[i - 1][1] <= n[0]; }) && d74.length === 2, "paste (mix) over a long note of the same pitch: kept, cut where the pasted note starts; no same-pitch overlaps", d74);
  // 3. クリップの外 ／ クリップがない場所
  var last = L[L.length - 1], pd = P.paste(mel, last.tick + last.len - M.barTicks(p), "replace");
  ok(pd.ok && pd.dropped > 0 && pd.added > 0, "pasting near the song end: notes past the last clip are not added (counted)", pd);
  var drum = p.tracks.filter(function (t) { return M.isDrum(t); })[0], none = P.paste({ kind: "audio", clips: [] }, 0, "mix");
  ok(!none.ok && /MIDI/.test(none.why), "pasting onto a non-MIDI track is refused");
  // 4. ほかのトラックへ（ストリングスへ写す）
  var strT = p.tracks.filter(function (t) { return t.name === "ストリングス"; })[0], sc0 = clipAt(strT, L[iA2].tick), n0 = sc0.notes.length;
  var px = P.paste(strT, L[iA2].tick, "mix");
  ok(px.ok && px.added === 8 && sc0.notes.length >= n0 + 8 - px.trimmed, "copy between tracks: the melody phrase onto the strings (mixed in)", px);
  // 5. 拍子がちがう小節にかかる
  p.tempo.meters.push({ tick: L[iA2].tick, num: 3, den: 4 });
  var pw = P.paste(mel, L[iA2].tick, "replace");
  ok(pw.ok && pw.meterWarn, "pasting into bars with another meter: a warning (positions kept in ticks)");
  p.tempo.meters.pop();
  // 6. 移調・オクターブ・スケールに沿って
  D.openRoll(cA.id); P.act("phr"); P.act("pall");
  var t0 = cA.notes.map(function (n) { return n[2]; });
  P.act("pt:2"); var t1 = cA.notes.map(function (n) { return n[2]; });
  P.act("pt:-12"); var t2 = cA.notes.map(function (n) { return n[2]; });
  ok(t1.every(function (m, i) { return m === t0[i] + 2; }) && t2.every(function (m, i) { return m === t0[i] - 10; }), "transpose +2 semitones, then an octave down");
  P.act("pt:10");
  P.act("pd:1"); var dsc = cA.notes.map(function (n) { return n[2]; }), scale = [2, 4, 6, 7, 9, 11, 1];
  ok(dsc.every(function (m) { return scale.indexOf(m % 12) >= 0; }) && dsc[0] === 76 && dsc[1] === 78 && dsc[2] === 79, "スケール▲ (chosen explicitly): each note moves one step up the D major scale (D→E, E→F#, F#→G)", dsc);
  var big = cA.notes.slice(); P.sel(big); var hi = P.act("pt:60");
  ok(cA.notes.every(function (n, i) { return n[2] === dsc[i]; }), "a transpose that would leave 0–127 is refused (nothing moves)");
  // 7. 拍で移動（クリップの外に出るなら動かさない）
  P.sel([cA.notes[1]]); var before = cA.notes[1][0]; P.act("pm:960");
  ok(cA.notes.some(function (n) { return n[0] === before + 960 && n[2] === 78; }), "move a note one beat later");
  P.act("pall"); P.act("pm:-960");
  ok(cA.notes[0][0] === 0, "moving everything one beat earlier (the first note would leave the clip) is refused");
  // 8. 長さ・強さ（↶ は 1 操作ずつ）
  P.act("pall"); P.act("pl:240"); P.act("pv:0.5"); var beforeAdd = JSON.stringify(D.project().tracks[0].clips.map(function (c) { return c.notes; })); P.act("pva:0.1");
  var cAnow = clipAt(D.project().tracks[0], L[iA].tick);
  ok(cAnow.notes.every(function (n) { return n[1] === 240 && Math.abs(n[3] - 0.6) < 1e-9; }), "set every length to 1/16 and the velocity to 0.5, then +0.1");
  D.xmas.host.undo();
  ok(JSON.stringify(D.project().tracks[0].clips.map(function (c) { return c.notes; })) === beforeAdd, "↶ once steps back exactly the last phrase edit (+0.1)");
  // 9. 小節で選ぶ
  var cB = clipAt(D.project().tracks[0], L[iA].tick); D.openRoll(cB.id); P.act("phr");
  var bA = M.tickToBar(D.project(), cB.start).bar, inBar1 = cB.notes.filter(function (n) { return n[0] - (cB.offset || 0) < M.barTicks(D.project()); }).length;
  ok(P.bars(bA, bA) === inBar1 && inBar1 > 0 && P.bars(bA, bA + 1) > inBar1, "select by bars: bar " + bA + " only, then bars " + bA + "–" + (bA + 1), [inBar1]);
  // 10. 伴奏は変わらない（貼り付けたストリングスのほか）
  ok(JSON.stringify(D.project().tracks.slice(1).filter(function (t) { return t.name !== "ストリングス"; })) === JSON.stringify(JSON.parse(accKeep).filter(function (t) { return t.name !== "ストリングス"; })), "the accompaniment (other than the strings pasted into) is unchanged");
  // 11. 重なりを直す（同じ位置・同じ高さは 1 つに）
  var cz = { notes: [[0, 960, 60, 0.8], [0, 480, 60, 0.6], [480, 480, 60, 0.7]] }; P.fix(cz);
  ok(cz.notes.length === 2 && cz.notes.every(function (n, i, a) { return i === 0 || a[i - 1][0] + a[i - 1][1] <= n[0]; }), "same-pitch overlaps are fixed (same start → one note, overlap → cut)", cz.notes);
  A.stop();
};
