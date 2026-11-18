// §345 A19: その場でコードを変える（アレンジの画面のコードをタップ → 編集パネル）
"use strict";
var H = require("./harness");
var ok = H.ok;

module.exports = async function () {
  H.suite("ced");
  var env = H.load(), W = env.window, X = W.UGXmas, D = W.UGDaw, A = W.UGArcade, M = W.UGDawModel, R = H.makeEl("div");
  A.start("daw", R, {});
  function song(id, form, opt) { D.xmas.host.newSong(X.tplNewProject(X.tplPlan(null, id, "new", 1, 1, form, opt)).project); D.xmas.host.back(); return D.project(); }
  // 1. 41 のコード: どのキーでも 名前 → 読みとり → 同じ id（オンコードもふくむ）
  var p = song("pop", "std"), ids = Object.keys(X.CHORDS), bad = [], k, i;
  for (k = 0; k < 12; k++) {
    p.ext.xmKey = k;
    for (i = 0; i < ids.length; i++) { var nm = X.chordOf(k, ids[i]).name, r = X.chordParse(p, nm); if (!r.ok || r.id !== ids[i] && X.chordOf(k, r.id).name !== nm) { bad.push([k, ids[i], nm, r.id || r.why]); } }
  }
  p.ext.xmKey = 2;
  ok(ids.length === 41 && bad.length === 0, "all 41 chords in all 12 keys: name → read back → the same chord (slash chords too)", bad.slice(0, 5));
  // 2. 書き方のゆれ・オンコード・読めないもの（ほかのコードに変えない）
  var pr = function (t) { var r = X.chordParse(p, t); return r.ok ? r.id : "NG"; };
  ok(pr("Bm") === "vi" && pr("bm") === "vi" && pr("B-") === "vi" && pr("Em7") === "ii7" && pr("E-7") === "ii7" && pr("A7") === "V7" && pr("DM7") === "Imaj7" && pr("DΔ7") === "Imaj7" && pr("D/F#") === "I_3" && pr("D/F♯") === "I_3" && pr("D/A") === "I_5" && pr("G/D") === "IV_1" && pr("Asus4") === "Vsus4" && pr("A7sus4") === "V7sus4" && pr("Dadd9") === "Iadd9" && pr("E7") === "V/V" && pr("D/D") === "I", "spellings: Bm, bm, B-, Em7, E-7, A7, DM7, DΔ7, D/F#, D/F♯, D/A, G/D, Asus4, A7sus4, Dadd9, E7 (V/V), D/D = D");
  var n1 = X.chordParse(p, "G7"), n2 = X.chordParse(p, "Xyz"), n3 = X.chordParse(p, "D9"), n4 = X.chordParse(p, "");
  ok(!n1.ok && /ない/.test(n1.why) && /勝手には変えません/.test(n1.why) && !n2.ok && /読めません/.test(n2.why) && !n3.ok && /種類/.test(n3.why) && !n4.ok, "not in the accompaniment (G7 in D), not a chord name, an unknown kind (D9), empty: a reason, never another chord", [n1.why, n3.why]);
  // 3. 128 小節: 65 小節目を変える → 伴奏が追従・ほかのトラックと小節は同じ・メロディは同じ・↶ 1 回で戻る
  p = song("pop", "full128"); p.tracks[0].clips[4].notes = [[0, 480, 74, 0.8]];
  var keep = JSON.stringify(p), mel = JSON.stringify(p.tracks[0]), drums = JSON.stringify(p.tracks.filter(function (t) { return M.isDrum(t); })), u0 = D.undoCount ? D.undoCount() : null;
  D.ced.open(64);
  ok((D.ced.html().match(/data-ced="pick:/g) || []).length === 28 && /65 小節目のコード/.test(D.ced.html()) && JSON.stringify(D.project()) === keep, "tap bar 65: a panel with 28 chord buttons for the key and a text field; nothing changed yet");
  D.ced.click("pick:vi");
  var q = D.ced.state().q;
  ok(q.ok && q.regen.length === 4 && q.none.some(function (z) { return z.name === "ドラム"; }) && JSON.stringify(D.project()) === keep && /伴奏が追従: エレピ・ベース・ストリングス・グロッケン/.test(R.innerHTML), "choosing Bm shows what will follow (4 parts) and what will not (drums) before anything changes", q.regen);
  var before = {}; D.project().tracks.forEach(function (t) { before[t.id] = JSON.stringify(t.clips.map(function (c) { return c.notes; })); });
  D.ced.click("apply");
  p = D.project();
  var changed = p.tracks.filter(function (t) { return JSON.stringify(t.clips.map(function (c) { return c.notes; })) !== before[t.id]; }).map(function (t) { return t.name; });
  var b64 = M.barToTick(p, 64), touched = p.tracks.every(function (t) { return t.clips.every(function (c) { var hit = c.start <= b64 && b64 < c.start + c.len, j = JSON.stringify(c.notes); return hit || JSON.parse(before[t.id]).some(function (n0) { return JSON.stringify(n0) === j; }); }); });
  ok(X.songChords(p)[64] === "vi" && changed.length >= 3 && changed.every(function (n) { return ["エレピ", "ベース", "ストリングス", "グロッケン"].indexOf(n) >= 0; }) && touched && JSON.stringify(p.tracks[0]) === mel && JSON.stringify(p.tracks.filter(function (t) { return M.isDrum(t); })) === drums, "apply: bar 65 is Bm; only clips over bar 65 of the 4 parts changed; the melody and drums are the same", changed);
  var stt = p.tracks.every(function (t) { return t.clips.every(function (c) { return X.clipState(c) !== "edited"; }); });
  ok(stt && /65 小節目のコードを [^ ]+ → Bm にしました。伴奏 4 つが追従/.test(R.innerHTML) && D.ced.state() === null, "the regenerated clips keep their fingerprints (still 'untouched'); the note says what followed; the panel closes", R.innerHTML.match(/65 小節目のコードを[^（]*/));
  D.xmas.host.undo();
  var pu = D.project();
  ok(JSON.stringify({ t: pu.tracks, e: pu.ext }) === JSON.stringify({ t: JSON.parse(keep).tracks, e: JSON.parse(keep).ext }), "↶ once: the chord and all the notes are back");
  // 4. 手で直したクリップ: 元のまま ／ 新しいトラック
  p = D.project(); var bass = p.tracks.filter(function (t) { return t.name === "ベース"; })[0], bc = bass.clips.filter(function (c) { return c.start <= M.barToTick(p, 64) && M.barToTick(p, 64) < c.start + c.len; })[0];
  bc.notes[0][3] = 0.31; var bcN = JSON.stringify(bc.notes), nT = p.tracks.length;
  var cur64 = X.songChords(p)[64]; D.ced.open(64); D.ced.click("pick:" + (cur64 === "V" ? "iii" : "V"));
  ok(D.ced.state().q.keep.indexOf("ベース") >= 0 && /手で直したクリップ: ベース/.test(R.innerHTML) && /元のまま/.test(R.innerHTML) && /新しいトラックに作る/.test(R.innerHTML), "a hand-edited bass clip is shown with 元のまま / 新しいトラックに作る in the same panel");
  D.ced.click("apply");
  ok(JSON.stringify(bc.notes) === bcN && /ベース は元のまま（追従していません）/.test(R.innerHTML) && D.project().tracks.length === nT, "元のまま: the hand-edited notes stay, and the note says the bass did not follow");
  D.ced.open(64); D.ced.click("how:newtrack"); D.ced.click("pick:ii"); D.ced.click("apply");
  ok(JSON.stringify(bc.notes) === bcN && D.project().tracks.length === nT + 1 && /新しいトラックに作りました/.test(R.innerHTML), "新しいトラックに作る: the hand edit stays and a new track gets the new chord's part");
  // 5. 録音・自分のメロディは変えない
  p = song("ballad", "std"); var ts = p.tracks[0]; ts.clips[0].notes = [[0, 960, 70, 0.7]];
  var at = M.addAudioTrack ? M.addAudioTrack(p) : null;
  D.ced.open(1); D.ced.click("pick:IV");
  var q5 = D.ced.state().q;
  ok(q5.ok && q5.none.some(function (z) { return /自分のメロディ/.test(z.why); }) && q5.regen.indexOf(ts.name) < 0, "my melody is listed as not following (it is never regenerated)", q5.none);
  D.ced.click("close");
  // 6. 入力: 打つあいだは描きなおさない（キーボードが閉じない）・Enter で決める
  p = song("pop", "std"); D.ced.open(2);
  var inp = R.querySelector ? R.querySelector(".daw-ced-in") : null;
  ok(D.ced.html().indexOf('class="daw-ced-in"') >= 0 && /enterkeyhint="done"/.test(D.ced.html()) && /font-size|daw-ced-in/.test(D.ced.html()), "the panel has a text field for chord names");
  D.ced.state().text = "Bm"; D.ced.click("text");
  ok(D.ced.state().id === "vi" && D.ced.state().err === "", "typing Bm and 決める selects Bm");
  D.ced.state().text = "G7"; D.ced.click("text");
  ok(D.ced.state().id === "" && /勝手には変えません/.test(D.ced.state().err), "typing G7 (not in D) shows the reason and selects nothing");
  D.ced.click("close");
  // 7. 128 小節のいろいろな位置（はじめ・まんなか・終わり）
  p = song("ballad", "full128"); var okAll = true, at3 = [0, 63, 127];
  at3.forEach(function (b) { D.ced.open(b); D.ced.click("pick:" + (X.songChords(D.project())[b] === "IV" ? "V" : "IV")); var qq = D.ced.state().q; if (!qq || !qq.ok) { okAll = false; } D.ced.click("apply"); });
  ok(okAll && X.songChords(D.project())[0] && X.songChords(D.project())[127], "bars 1, 64 and 128 of a 128-bar song can be changed in place");
  A.stop();
};
