// §345 A23: メロディの補助（コード・スケール・ルート・音域）とステップ入力（ピアノロール）
"use strict";
var H = require("./harness");
var ok = H.ok;

module.exports = async function () {
  H.suite("assist");
  var env = H.load(), W = env.window, X = W.UGXmas, D = W.UGDaw, A = W.UGArcade, M = W.UGDawModel, R = H.makeEl("div");
  A.start("daw", R, {});
  function song(id, form, opt) { D.xmas.host.newSong(X.tplNewProject(X.tplPlan(null, id, "new", 1, 1, form || "std", opt)).project); D.xmas.host.back(); return D.project(); }
  // 1. 補助の材料（メジャー）
  var p = song("pop"), mc = p.tracks[0].clips[0], keepOther = JSON.stringify(p.tracks.slice(1)) + JSON.stringify(p.ext);
  D.openRoll(mc.id); var a = D.roll2.assist(), sc = X.songChords(p), bars = Math.round(mc.len / M.barTicks(p));
  ok(D.roll2.assistOn() && a.bars.length === bars && a.bars.every(function (b) { return b.name === X.chordOf(2, sc[b.bar]).name && JSON.stringify(b.pcs) === JSON.stringify(X.chordOf(2, sc[b.bar]).pcs); }) && JSON.stringify(a.scale) === JSON.stringify([2, 4, 6, 7, 9, 11, 1]) && JSON.stringify(a.range) === "[60,81]", "assist (on by default): each bar's chord name and tones from the song chords, the D major scale, a singing range for the melody track", [a.bars.length, a.bars[0].name, a.scale]);
  // マイナー・伴奏のトラック・キーのない曲
  var pm = song("pop", "std", { key: 9, kmode: "min" }); D.openRoll(pm.tracks[1].clips[0].id); var am = D.roll2.assist();
  ok(JSON.stringify(am.scale) === JSON.stringify([9, 11, 0, 2, 4, 5, 7]) && am.range === null && /m/.test(am.bars[0].name), "A minor: the natural minor scale; an accompaniment track has no singing range; minor chord names", [am.scale, am.bars[0].name]);
  D.proj.create("empty"); var pe = D.project(), te = pe.tracks.filter(function (t) { return t.kind === "midi"; })[0] || pe.tracks[0], ce = te.clips[0] || M.newMidiClip(pe, te, 0, 3840, [], "x");
  D.openRoll(ce.id); var ae = D.roll2.assist();
  ok(ae && ae.key === null && ae.scale.length === 0 && ae.bars.every(function (b) { return !b.name; }) && D.roll2.kind([0, 480, 61, 0.8]) === "", "a song without key or chords: no scale, no chord, notes are not colored (nothing is marked wrong)");
  // 2. 音の種類（禁止しない）
  p = song("pop"); mc = p.tracks[0].clips[0]; D.openRoll(mc.id);
  var b0 = D.roll2.assist().bars[0], rootM = 60 + b0.root, third = 60 + b0.pcs[1], scaleNon = [64, 65, 67, 69, 71, 72].filter(function (m) { return b0.pcs.indexOf(m % 12) < 0 && [2, 4, 6, 7, 9, 11, 1].indexOf(m % 12) >= 0; })[0], outM = [60, 65, 67, 70].filter(function (m) { return [2, 4, 6, 7, 9, 11, 1].indexOf(m % 12) < 0; })[0];
  ok(D.roll2.kind([0, 480, rootM, 0.8]) === "rt" && D.roll2.kind([0, 480, third, 0.8]) === "ct" && D.roll2.kind([0, 480, scaleNon, 0.8]) === "sc" && D.roll2.kind([0, 480, outM, 0.8]) === "out", "kinds: the bar's root, a chord tone, a scale tone, outside the scale", [rootM, third, scaleNon, outM]);
  D.roll2.act("step"); var nOut = mc.notes.length; D.roll2.act("sk:" + outM);
  ok(mc.notes.length === nOut + 1 && mc.notes.some(function (n) { return n[2] === outM; }), "a note outside the scale can be entered (never forbidden)");
  // 3. 画面
  var h = D.roll2.html(), nNotes = (h.match(/class="pr-note/g) || []).length;
  ok(/class="pr-cbar"/.test(h) && (h.match(/class="pr-cb"/g) || []).length === bars && (h.match(/class="pr-c[tr]"/g) || []).length > bars * 3 && (h.match(/class="pr-sc"/g) || []).length === 42 && /pr-k-out/.test(h) && /pr-legend/.test(h) && /歌の目安の音域/.test(h) && nNotes === mc.notes.length, "screen: bar numbers and chord names on top, chord-tone bands, scale rows, colored notes, a legend, the singing range");
  D.roll2.assistOn(false); var h2 = D.roll2.html();
  ok(!/pr-cbar|class="pr-ct"|class="pr-sc"|pr-k-|pr-legend/.test(h2) && (h2.match(/class="pr-note/g) || []).length === mc.notes.length, "assist off: none of it is drawn; the notes are the same");
  D.roll2.assistOn(true);
  // 4. ステップ入力
  mc.notes.length = 0; D.roll2.act("step"); D.roll2.act("step");
  var st0 = { pos: D.roll2.state().step.pos }; // 数で覚える（step のオブジェクトはこのあと進む）
  D.roll2.act("slen:480"); D.roll2.act("sk:74"); D.roll2.act("slen:960"); D.roll2.act("sk:78"); D.roll2.act("srest"); D.roll2.act("sk:81"); D.roll2.act("soct:-1"); D.roll2.act("slen:240"); D.roll2.act("sk:62");
  ok(st0.pos === 0 && JSON.stringify(mc.notes.map(function (n) { return [n[0], n[1], n[2]]; })) === JSON.stringify([[0, 480, 74], [480, 960, 78], [2400, 960, 81], [3360, 240, 62]]) && D.roll2.state().step.pos === 3600, "step input: D5 (1/8) → F#5 (1/4) → rest → A5 → octave down D4 (1/16); each note goes where the last ended", JSON.stringify(mc.notes));
  D.roll2.act("sundo");
  ok(mc.notes.length === 3 && D.roll2.state().step.pos === 3360, "取消: the last entered note is removed and the position goes back");
  D.roll2.act("sback");
  ok(D.roll2.state().step.pos === 3120, "◀: the position goes back by the length");
  var nb = mc.notes.length; D.xmas.host.undo();
  ok(mc.notes.length === nb + 1 || D.project().tracks[0].clips[0].notes.length === nb + 1, "↶ (the usual undo) also steps back one note entry", D.project().tracks[0].clips[0].notes.length);
  // 5. クリップの終わり
  p = D.project(); mc = p.tracks[0].clips[0]; D.openRoll(mc.id); D.roll2.act("step"); var s5 = D.roll2.state().step; s5.pos = mc.len - 240; s5.len = 960;
  D.roll2.act("sk:72"); var last = mc.notes.filter(function (n) { return n[0] === mc.len - 240; })[0];
  D.roll2.act("sk:74");
  ok(last && last[0] + last[1] <= mc.len && mc.notes.every(function (n) { return n[0] < mc.len; }) && /クリップの終わり/.test(D.roll2.html()), "at the clip end the note is cut to fit and no note goes past it (a message)");
  // 6. ほかのトラック・コードは変わらない
  p = song("pop"); var keep6 = JSON.stringify(p.tracks.slice(1)) + JSON.stringify(p.ext); D.openRoll(p.tracks[0].clips[0].id); D.roll2.act("step"); D.roll2.act("sk:74"); D.roll2.act("sk:76");
  ok(JSON.stringify(D.project().tracks.slice(1)) + JSON.stringify(D.project().ext) === keep6, "melody input does not change the accompaniment, chords or key");
  A.stop();
};
