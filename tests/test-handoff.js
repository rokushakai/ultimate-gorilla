// §345 A17: Cubasis に渡す（受け渡しシート・MIDI・ステムの対応）
"use strict";
var H = require("./harness");
var ok = H.ok;

module.exports = async function () {
  H.suite("handoff");
  var env = H.load(), W = env.window, D = W.UGDaw, A = W.UGArcade, M = W.UGDawModel, X = W.UGXmas, R = H.makeEl("div");
  A.start("daw", R, {});
  D.xmas.host.newSong(X.tplNewProject(X.tplPlan(null, "pop", "new", 1, 1, "full")).project);
  var p = D.project(), keep = JSON.stringify(p), info = D.handoff.info(), txt = D.handoff.text();
  ok(JSON.stringify(D.project()) === keep, "making the hand-off sheet does not change the song");
  // 1. 曲の情報
  var secs = M.sectionsOf(p);
  ok(info.bars === 48 && info.tempos.length === 1 && info.tempos[0].bpm === 120 && info.meters[0].sig === "4/4" && info.key === "D メジャー" && info.sections.length === secs.length && info.sections.every(function (s, i) { return s.bar === M.tickToBar(p, secs[i].tick).bar && s.name === secs[i].name; }) && info.sections.reduce(function (n, s) { return n + s.bars; }, 0) === 48, "sheet info: 48 bars, BPM 120, 4/4, D major, every section with its bar and length (adding up to the song)", info.sections.map(function (s) { return [s.bar, s.bars, s.name]; }));
  var sc = X.songChords(p), first = info.chords[0];
  ok(info.chords.length > 10 && first.bar === 1 && first.name === X.chordOf(2, sc[0]).name && info.chords.every(function (c, i) { return i === 0 || c.name !== info.chords[i - 1].name; }), "chords: the bars where the chord changes, with names in the song key", info.chords.slice(0, 4));
  // 2. MIDI のトラックの番号が、本当の MIDI ファイルの順と同じ
  var ex = M.midiExport(p), rd = M.midiRead(ex.bytes, "x.mid"), withMidi = info.tracks.filter(function (t) { return t.midi; });
  ok(ex.ok && rd.ok && withMidi.length === rd.parts.length && withMidi.every(function (t, i) { return t.midi.track === i + 2 && rd.parts[i].name === t.name && rd.parts[i].notes.length === t.midi.notes; }) && withMidi.filter(function (t) { return t.midi.drum; }).length === 2, "the sheet's MIDI track numbers match the real MIDI file (track 1 is tempo / markers; names and note counts agree; drums on 10ch)", withMidi.map(function (t) { return [t.name, t.midi.track]; }));
  // 3. ステムのファイル名が、本当に書き出す名前と同じ
  var sp = D.stem.plan();
  ok(info.tracks.every(function (t, i) { return t.stem === "" ? !sp.list[i].has : sp.list[i].has && /\.wav$/.test(t.stem) && t.stem.indexOf("_" + (i < 9 ? "0" : "") + (i + 1) + "_") > 0; }) && info.stemSec === sp.sec, "the sheet's stem names are the files the stem export makes (number, track name, one date); the same length", info.tracks.map(function (t) { return t.stem; }).slice(0, 3));
  // 4. 文字のシート: 手順と注意
  ok(/BPM 120/.test(txt) && /拍子: 4\/4/.test(txt) && /PPQ 960/.test(txt) && /1 小節目の頭（0 の位置）/.test(txt) && /0dB/.test(txt) && /二重/.test(txt) && /確かめていません/.test(txt) && txt.indexOf("\r\n") > 0, "the text sheet has tempo, meter, PPQ 960, how to line the stems up at 0, faders at 0 dB (not twice), and says it is not checked on Cubasis 3", txt.length);
  // 5. テンポ・拍子が途中で変わる曲
  var q = D.project(); q.tempo.points.push({ tick: M.barToTick(q, 16), bpm: 100 }); q.tempo.meters.push({ tick: M.barToTick(q, 32), num: 3, den: 4 }); D.markDirty();
  var i2 = D.handoff.info(), t2 = D.handoff.text();
  ok(i2.tempos.length === 2 && i2.tempos[1].bar === 17 && i2.tempos[1].bpm === 100 && i2.meters[1].bar === 33 && i2.meters[1].sig === "3/4" && /17 小節目から BPM 100/.test(t2) && /33 小節目から 3\/4/.test(t2), "tempo and meter changes are listed with their bars", [i2.tempos, i2.meters]);
  // 6. 画面: iPhone では ZIP を出さない・PC は出す
  var h1 = D.handoff.html(), ua0 = W.navigator.userAgent; W.navigator.userAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)";
  var h2 = D.handoff.html(); W.navigator.userAgent = ua0;
  ok(h1.indexOf('data-pj="hoSheet"') >= 0 && h1.indexOf('data-pj="hoMidi"') >= 0 && h2.indexOf('data-pj="hoAll"') < 0 && /1 つずつ保存/.test(h2), "the Cubasis section: sheet and MIDI buttons, stems one by one; no big ZIP on iPhone", [h1.indexOf('data-pj="hoAll"'), h2.indexOf('data-pj="hoAll"')]);
  A.stop();
};
