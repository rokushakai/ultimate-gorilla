// §346 A35: 🪕 弾いて録る（DAW の伴奏に合わせてウクレレを弾く → MIDI のクリップ）
"use strict";
var H = require("./harness"), REF = require("./smf-ref");
var ok = H.ok;

module.exports = async function () {
  H.suite("play");
  var env = H.load(), W = env.window, D = W.UGDaw, A = W.UGArcade, M = W.UGDawModel, X = W.UGXmas, Y = W.UGDawPlay, R = H.makeEl("div");
  ok(!!Y && !!D.playp && !!D.playp.host, "UGDawPlay exists (arcade-daw-play.js) and the DAW gives it a host");
  A.start("daw", R, {});
  var host = D.playp.host, PPQ = M.PPQ, BAR = PPQ * 4;
  var nl0 = X.needLoad; X.needLoad = function () { return false; };
  var lat0 = host.autoLat; host.autoLat = function () { return 0; }; // 聞こえる音の遅れ 0 として位置を確かめる（補正は別に確かめる）

  // ---------- 1. 弦と押さえ方（画面なし）----------
  var C = Y.shapeOf("C");
  ok(C && JSON.stringify(C.shape) === "[0,0,0,3]", "C is fingered 0003 (from the game's UGChords)", C);
  var dn = Y.strum(C.shape, false, "down", 0.8), up = Y.strum(C.shape, false, "up", 0.8);
  ok(JSON.stringify(dn.map(function (x) { return x.m; })) === "[67,60,64,72]" && JSON.stringify(dn.map(function (x) { return x.s; })) === "[0,1,2,3]", "High G, C (0003), down stroke: 67, 60, 64, 72 — the string order G→C→E→A, not the pitch order", dn);
  ok(JSON.stringify(up.map(function (x) { return x.m; })) === "[72,64,60,67]" && up[0].v < dn[0].v, "up stroke: the reverse order (72, 64, 60, 67), a little softer", up);
  ok(JSON.stringify(dn.map(function (x) { return x.dt; })) === "[0,0.012,0.024,0.036]", "12 ms between strings (same as the ukulele game)", dn.map(function (x) { return x.dt; }));
  ok(JSON.stringify(Y.strum(C.shape, true, "down", 0.8).map(function (x) { return x.m; })) === "[55,60,64,72]", "Low G: the 4th string is G3 (55)");
  var mute = Y.strum([null, 0, 0, 3], false, "down", 0.8);
  ok(mute.length === 3 && mute[0].s === 1 && mute[0].dt === 0 && Y.pluck([null, 0, 0, 3], false, 0, 0.8).length === 0, "a muted string (null) is not played, and the stroke closes up", mute);
  var ch4 = ["Am", "F", "G"].map(function (n) { var s = Y.shapeOf(n); return Y.strum(s.shape, false, "down", 0.8).map(function (x) { return x.m; }).join(","); });
  ok(ch4[0] === "69,60,64,69" && ch4[1] === "69,60,65,69" && ch4[2] === "67,62,67,71", "Am (2000), F (2010), G (0232) in string order", ch4);

  // ---------- 2. 演奏の記録 → 音符（DAW のテンポマップ）----------
  var p0 = M.newProject({ bpm: 120 });
  function bt(rawList, a, b, comp) { return Y.build(p0, rawList, a, b, comp || 0); }
  var b1 = bt([[0, 0, 67, 0.8], [0.25, 0, 67, 0.7], [0.25, 1, 60, 0.7]], 0, BAR);
  ok(JSON.stringify(b1.notes) === JSON.stringify([[0, 480, 67, 0.8], [480, 3360, 60, 0.7], [480, 3360, 67, 0.7]]) && JSON.stringify(b1.str) === "[0,1,0]", "same string again: the earlier note stops where the next begins; the ring is cut at the end of the range (b)", b1);
  var b2 = bt([[0.5, 2, 64, 0.8], [0.5, 2, 64, 0.9], [0.2, 3, 69, 0.8]], 0, BAR * 4);
  ok(b2.notes.length === 2 && b2.notes[0][0] === 384 && b2.notes[0][1] === 1920 * 2 && b2.notes[1][0] === 960 && b2.notes[1][3] === 0.9, "the same string twice in the same instant keeps only the later one; a ringing string stops after 2 s", b2);
  var b3 = bt([[-0.03, 0, 67, 0.8], [-0.3, 1, 60, 0.8], [2.1, 2, 64, 0.8], [1.99, 3, 69, 0.8]], 0, BAR);
  ok(b3.notes.length === 2 && b3.notes[0][0] === 0 && b3.notes[1][0] === 3821 && b3.notes[1][1] === 19, "a little early (30 ms) is moved to the downbeat; too early (count-in) and after the range are dropped; a note at the end is closed at the range end", b3);
  var bE = bt([[-0.02, 0, 67, 0.8], [-0.01, 1, 60, 0.8], [0.012, 2, 64, 0.8]], 0, BAR);
  ok(JSON.stringify(bE.notes.map(function (n) { return [n[0], n[2]]; })) === "[[0,60],[0,67],[23,64]]" && JSON.stringify(bE.str) === "[1,0,2]" && JSON.stringify(M.cleanNotes(bE.notes)) === JSON.stringify(bE.notes), "two early strings moved to the downbeat share tick 0: notes are in the DAW order (time, then pitch) and the string list follows them (C = string 1, G = string 0)", bE);
  var b4 = bt([[0, 0, 67, 0.8]], 0, BAR, 10);
  ok(b4.notes[0][0] === 0 && bt([[0.5, 0, 67, 0.8]], 0, BAR, 10).notes[0][0] === 941, "the latency compensation is applied to the recorded times (10 ms earlier = 19 ticks at 120 BPM), the raw take is not changed");
  // テンポが途中で変わる（120 → 60 BPM を 3 小節目から）
  var pt = M.newProject({ bpm: 120 }); pt.tempo.points.push({ tick: BAR * 2, bpm: 60 });
  var sec3 = M.tickToSec(pt, BAR * 2), sec3b = M.tickToSec(pt, BAR * 2 + PPQ);
  var bT = Y.build(pt, [[sec3, 0, 67, 0.8], [sec3b, 1, 60, 0.8], [sec3 - 0.5, 2, 64, 0.8]], 0, BAR * 4, 0);
  ok(bT.notes[1][0] === BAR * 2 && bT.notes[2][0] === BAR * 2 + PPQ && bT.notes[0][0] === BAR * 2 - PPQ && Math.abs(sec3b - sec3 - 1) < 1e-9, "a tempo change in the middle (120 → 60 BPM at bar 3): times convert through the DAW tempo map (bar 3 = tick " + BAR * 2 + ", one beat later = 1 s later)", bT.notes);
  // 6/8・12/8（8 分音符が 1 拍）
  [[6, 8], [12, 8]].forEach(function (mt) {
    var pm = M.newProject({ bpm: 120 }); pm.tempo.meters = [{ tick: 0, num: mt[0], den: mt[1] }];
    var bar1 = M.barToTick(pm, 1), s1 = M.tickToSec(pm, bar1), bm = Y.build(pm, [[s1, 0, 67, 0.8], [s1 + 0.25, 1, 60, 0.8]], 0, M.barToTick(pm, 4), 0);
    ok(bar1 === PPQ * 4 * mt[0] / mt[1] && bm.notes[0][0] === bar1 && bm.notes[1][0] === bar1 + PPQ / 2, mt[0] + "/" + mt[1] + ": bar 2 starts at tick " + bar1 + " and an eighth later is +" + PPQ / 2 + " ticks", bm.notes);
  });

  // ---------- 3. 完成の条件のシナリオ: C → Am → F → G の 4 小節・伴奏つき ----------
  var p = M.newProject({ name: "A35", bpm: 120, now: 1 }), bk = M.newTrack(p, "ピアノ", M.synthInstrument("pad"));
  M.newMidiClip(p, bk, 0, BAR * 4, [[0, 3800, 60, 0.6], [3840, 3800, 57, 0.6], [7680, 3800, 53, 0.6], [11520, 3800, 55, 0.6]], "伴奏");
  p.ext.xmKey = 0; p.ext.xmMode = "maj"; p.ext.xmChords = { "0": "I", "1": "vi", "2": "IV", "3": "V" };
  D.xmas.host.newSong(p); D.xmas.host.back(); p = D.project();
  var bk0 = JSON.stringify(p.tracks), nTr0 = p.tracks.length;
  // トラックのボタン（音のトラックだけ・ドラムにはない）
  D.state().sel = { kind: "track", id: p.tracks[0].id }; D.xmas.host.render();
  ok(R.innerHTML.indexOf('data-tr="play"') >= 0, "the track panel has '🪕 弾いて録る' for a MIDI instrument track");
  ok(D.playp.open(""), "open the play panel (new ukulele track)");
  var html = R.innerHTML;
  ok(D.state().view === "play" && /dpl-pad/.test(html) && ["C", "Am", "F", "G"].every(function (n) { return html.indexOf('data-pl="ch:' + n + '"') >= 0; }) && /1〜4 小節/.test(html) && html.indexOf("曲のコードに合わせる") >= 0, "the panel shows the song's chords (C, Am, F, G), the strings, and the range 1〜4 bars");
  ok(!D.isPlaying(), "opening the panel does not stop or start anything");
  // ● 録る
  Y.act(host, "rec");
  var rc = Y.rec(), P0 = D.player();
  ok(rc && P0 && P0.tag === rc.tok && P0.opts.a === 0 && P0.opts.b === BAR * 4 && !P0.loop, "● starts the backing on the DAW clock (no loop, bars 1〜4, tagged as this recording)");
  ok(D.play() === false && /弾いて録って/.test(D.state().msg || "") && D.player() === P0, "while recording, ▶ elsewhere is refused (the DAW clock is not changed)");
  Y.tick();
  var ac = P0.ac, t0 = rc.t0;
  ok(rc.state === "count" && Math.abs(t0 - P0.segs[0].t0) < 1e-9 && rc.beats === 4 && Math.abs(rc.lead - 2) < 1e-9 && Math.abs(t0 - ac.currentTime - 2 - 0.08) < 0.02, "count-in: 4 clicks (one bar at 120 BPM = 2 s); bar 1 is the DAW's segment start", [rc.state, t0, ac.currentTime]);
  // カウントイン中に早く弾いた音（1 拍前）は入らない
  Y.setChord("C"); Y.strumAt(host, "down", t0 - 0.5, 0.8);
  function adv(to) { var g = 0; while (ac.currentTime < to && g++ < 4000) { ac.currentTime += 0.025; D.pump(); Y.tick(); } }
  var names = ["C", "Am", "F", "G"], k;
  for (k = 0; k < 4; k++) { adv(t0 + k * 2 - 0.01); Y.setChord(names[k]); Y.strumAt(host, "down", t0 + k * 2, 0.8); }
  adv(t0 + 8 + 0.3);
  ok(Y.rec() === null && !D.isPlaying(), "after bar 4 the recording ends by itself and the backing stops");
  p = D.project();
  var nt = p.tracks.filter(function (t) { return t.name === "ウクレレ（弾いた）"; })[0], cl = nt && nt.clips[0];
  ok(p.tracks.length === nTr0 + 1 && nt && nt.instrument.type === "sample" && nt.instrument.prog === 140 && nt.clips.length === 1, "one new track 'ウクレレ（弾いた）' with the ukulele sound (sample 140) and one clip");
  ok(JSON.stringify(p.tracks.slice(0, nTr0)) === bk0, "the existing tracks and clips are unchanged");
  ok(cl && cl.start === 0 && cl.len === BAR * 4 && cl.notes.length === 16, "the clip is at bar 1, 4 bars long, 16 notes (4 strokes × 4 strings; the count-in stroke is not in)", cl && [cl.start, cl.len, cl.notes.length]);
  var exp = [], chs = ["0,0,0,3", "2,0,0,0", "2,0,1,0", "0,2,3,2"];
  for (k = 0; k < 4; k++) { var sh = chs[k].split(",").map(Number); [0, 1, 2, 3].forEach(function (s, i) { exp.push([k * BAR + Math.round(i * 0.012 * 1920), [67, 60, 64, 69][s] + sh[s]]); }); }
  ok(JSON.stringify(cl.notes.map(function (n) { return [n[0], n[2]]; })) === JSON.stringify(exp), "every note is at its bar and string time (0, 23, 46, 69 ticks) with the chord's pitches in string order", cl.notes.slice(0, 5));
  var lenExp = cl.notes.map(function (n, i) { var end = Math.min(n[0] + BAR, BAR * 4), j; for (j = i + 1; j < cl.notes.length; j++) { var q = cl.notes[j]; if ((j % 4 === i % 4 || q[2] === n[2]) && q[0] > n[0]) { end = Math.min(end, q[0]); break; } } return end - n[0]; });
  ok(cl.notes.every(function (n, i) { return n[1] === lenExp[i] && n[3] === 0.8; }), "lengths: each string rings until its next stroke, or until the same pitch sounds on another string (Am, F: 4th and 1st strings are both A4), or the end of bar 4; strength 0.8", [cl.notes.map(function (n) { return n[1]; }), lenExp]);
  ok(cl.notes.every(function (n, i) { return cl.notes.every(function (q, j) { return j <= i || q[2] !== n[2] || q[0] >= n[0] + n[1]; }); }) && cl.notes[4][1] === 69 && cl.notes[7][2] === 69, "no two notes of the same pitch overlap (safe for external MIDI instruments) — the strings stay separate notes", cl.notes.slice(4, 8));
  var px = Y.perfOf(cl);
  ok(px && px.inst === "uke" && px.tun === "high" && px.src === "live" && JSON.stringify(px.str) === JSON.stringify(cl.notes.map(function (n, i) { return i % 4; })) && px.raw.length === 20 && Y.perfState(cl) === "ok", "ext.perf keeps the string of every note, and the raw take (20 hits, also the count-in one) — the notes keep the normal [tick, len, pitch, vel] form", px && [px.str.length, px.raw.length]);
  ok(cl.notes.every(function (n) { return n.length === 4; }), "NoteEvents stay 4 numbers (no string number inside)");
  ok(D.state().view === "play" && /音符 16 個のクリップを置きました/.test(R.innerHTML) && R.innerHTML.indexOf('data-pl="edit"') >= 0, "the panel reports the new clip and offers 🎹 edit, ↶, ↷");
  ok(!(M.inboxRead().box), "the game inbox (localStorage) is not used");

  // ---------- 7. ↶ ↷（置いたこと）----------
    var before = JSON.stringify(D.project().tracks);
  Y.act(host, "undo");
  ok(D.project().tracks.length === nTr0 && JSON.stringify(D.project().tracks) === bk0, "↶ removes the new track and clip (the song is as before recording)");
  Y.act(host, "redo");
  ok(JSON.stringify(D.project().tracks) === before, "↷ puts them back exactly");

  // ---------- 4. 保存 → 読みなおし ----------
  D.flushSave();
  var js1 = JSON.stringify(cl), id1 = cl.id;
  var p2 = D.reload(), f2 = M.findClip(p2, id1);
  ok(f2 && JSON.stringify(f2.clip) === js1 && Y.perfState(f2.clip) === "ok", "save → reload: the clip (notes and ext.perf) is identical, the string data is still valid");
  // ---------- 5. MIDI の書き出し（独立したパーサー）----------
  var mr = M.midiExport(p2), rf = REF.parse(mr.bytes), ti = -1;
  rf.tracks.forEach(function (t, i) { if (t.name === "ウクレレ（弾いた）") { ti = i; } });
  var pn = ti >= 0 ? REF.pairNotes(rf.tracks[ti]) : null, mine = f2.clip.notes.slice().sort(function (x, y) { return x[0] - y[0] || x[2] - y[2]; });
  ok(mr.ok && rf.errors.length === 0 && pn && pn.notes.length === 16 && pn.unclosed === 0 && pn.overlap === 0 && pn.notes.every(function (n, i) { var q = mine[i]; return n.on === q[0] && n.off - n.on === q[1] && n.key === q[2] && n.vel === Math.round(q[3] * 127); }), "MIDI export (read by an independent parser): every note's position, length, pitch and strength match the clip", pn && pn.notes.slice(0, 3));

  // ---------- 6. ピアノロールで直す → 弦の情報は使わない（音はそのまま）→ ↶ で戻る ----------
  ok(D.openRoll(id1), "the recorded clip opens in the piano roll");
  D.edit.add(BAR * 3 + 480, 76);
  var f3 = M.findClip(D.project(), id1);
  ok(f3.clip.notes.length === 17 && Y.perfState(f3.clip) === "edited" && Y.perfOf(f3.clip) === null, "after a note edit the string data is no longer trusted ('edited'), the notes play as normal MIDI");
  D.edit.undo();
  var f4 = M.findClip(D.project(), id1);
  ok(f4.clip.notes.length === 16 && Y.perfState(f4.clip) === "ok", "↶ the edit: the string data matches again");
  D.closeRoll();
  // 複製しても対応はこわれない
  var dupSrc = JSON.parse(JSON.stringify(f4.clip)); dupSrc.notes.reverse();
  ok(Y.perfState(dupSrc) === "edited", "a copy whose notes were reordered is not trusted (the string list follows the note order)");

  // ---------- 8. ずれを直す（弾いた記録から作りなおす）----------
  D.playp.open(nt.id); Y.ui().last = { cid: id1, moved: false };
  var n0 = M.findClip(D.project(), id1).clip.notes.map(function (n) { return n[0]; });
  Y.act(host, "re:10");
  var f5 = M.findClip(D.project(), id1).clip, px5 = Y.perfOf(f5);
  ok(px5 && px5.comp === 10 && f5.notes[4][0] === n0[4] - 19 && f5.notes[0][0] === 0 && px5.raw.length === 20, "+10 ms: the notes are rebuilt from the raw take 19 ticks earlier (the downbeat stays at 0), the raw take is kept", [f5.notes[4][0], n0[4]]);
  Y.act(host, "undo");
  ok(JSON.stringify(M.findClip(D.project(), id1).clip.notes.map(function (n) { return n[0]; })) === JSON.stringify(n0), "↶ undoes the compensation");

  // ---------- 9. 同じ所をもう一度（重なる）→ いまのクリップは変えずに新しいトラック ----------
  D.stop(); D.state().cue = 0;
  var keep = JSON.stringify(M.findClip(D.project(), id1).clip), nT = D.project().tracks.length;
  D.playp.open(nt.id); Y.act(host, "rec"); Y.tick(); rc = Y.rec(); ac = D.player().ac; t0 = rc.t0;
  Y.setChord("G"); adv(t0 + 1); Y.strumAt(host, "up", t0 + 1, 0.8); adv(t0 + 8.3);
  var ft = M.findClip(D.project(), id1);
  ok(JSON.stringify(ft.clip) === keep && D.project().tracks.length === nT + 1 && Y.ui().last.moved && /新しいトラックに/.test(R.innerHTML), "recording over an existing clip: the old clip is untouched, the take goes to a new track");
  var up4 = M.findClip(D.project(), Y.ui().last.cid).clip.notes;
  ok(up4.length === 4 && JSON.stringify(up4.map(function (n) { return n[2]; })) === "[71,67,62,67]" && up4[0][0] === 1920 && up4[0][3] < 0.8, "an up stroke of G: 1st string first (71, 67, 62, 67), on beat 3, softer");

  // ---------- 10. やめる・再生が止まった・音がない・保存できない ----------
  function snapJ() { return JSON.stringify(D.project().tracks); }
  var s10 = snapJ();
  Y.act(host, "rec"); Y.tick(); rc = Y.rec(); ac = D.player().ac; adv(rc.t0 + 1); Y.strumAt(host, "down", rc.t0 + 1, 0.8);
  Y.act(host, "cancel");
  ok(Y.rec() === null && !D.isPlaying() && snapJ() === s10 && /やめました/.test(R.innerHTML), "✖ やめる: the song is unchanged, the backing stops");
  Y.act(host, "rec"); Y.tick(); rc = Y.rec(); ac = D.player().ac; adv(rc.t0 + 1); Y.strumAt(host, "down", rc.t0 + 1, 0.8);
  D.stop(); Y.tick();
  ok(Y.rec() === null && snapJ() === s10 && /再生が止まったので/.test(Y.ui().msg), "the backing stopped from elsewhere in the middle: the recording is dropped, the song is unchanged");
  Y.act(host, "rec"); Y.tick(); rc = Y.rec(); ac = D.player().ac; adv(rc.t0 + 8.3);
  ok(Y.rec() === null && snapJ() === s10 && /音がなかった/.test(Y.ui().msg), "nothing played: nothing is placed");
  // ■ 止めて置く（途中まで）
  Y.act(host, "rec"); Y.tick(); rc = Y.rec(); ac = D.player().ac; adv(rc.t0 + 2.5); Y.setChord("F"); Y.strumAt(host, "down", rc.t0 + 2.5, 0.8); adv(rc.t0 + 3);
  Y.act(host, "stop");
  var fs = M.findClip(D.project(), Y.ui().last.cid);
  ok(Y.rec() === null && fs && fs.clip.notes.length === 4 && fs.clip.notes[0][0] === BAR + 960 && /途中で止めました/.test(Y.ui().msg), "■ 止めて置く: what was played so far becomes a clip");
  // 保存できない（容量いっぱい）: クリップはメモリに残り、保存できないと出る。直れば保存できる
  var set0 = W.localStorage.setItem; W.localStorage.setItem = function () { var e = new Error("QuotaExceededError"); e.name = "QuotaExceededError"; throw e; };
  Y.act(host, "rec"); Y.tick(); rc = Y.rec(); ac = D.player().ac; adv(rc.t0 + 4); Y.strumAt(host, "down", rc.t0 + 4, 0.8); adv(rc.t0 + 8.3);
  var cidQ = Y.ui().last.cid, sq = D.saveNow();
  ok(sq === false && D.saveState().status === "error" && !!M.findClip(D.project(), cidQ), "save fails (storage full): the new clip stays in the song, the status is an error (never 'saved')");
  W.localStorage.setItem = set0; ok(D.saveNow() !== false && D.saveState().status === "saved", "when storage works again, saving succeeds");
  var pq = D.reload();
  ok(D.saveState().status === "saved" && !!M.findClip(pq, cidQ) && Y.perfState(M.findClip(pq, cidQ).clip) === "ok", "after the storage works again, the clip is saved and reloads with its string data");

  // ---------- 11. 生の操作: 弦を横切る（ゲームと同じ）----------
  D.playp.open(""); Y.setChord("C");
  var acx = host.ac(), tx0 = acx.currentTime;
  Y.padDown(host, "f1", 20, tx0);
  var nCross = Y.padMove(host, "f1", 220, tx0 + 0.04);
  ok(nCross === 4, "one swipe left → right over all four strings plays 4 strings (the game's string crossing)");
  Y.padUp("f1");
  // 録音中の横切り: 弦ごとの時刻を指の動きの割合で分ける
  D.state().cue = 0; Y.act(host, "rec"); Y.tick(); rc = Y.rec(); acx = D.player().ac; adv(rc.t0 + 0.5);
  Y.padDown(host, "f2", 20, rc.t0 + 0.5); Y.padMove(host, "f2", 220, rc.t0 + 0.54); Y.padUp("f2");
  var tk = rc.take.ev.map(function (e) { return [e[1], Math.round(e[0] * 1000)]; });
  ok(tk.length === 4 && JSON.stringify(tk.map(function (x) { return x[0]; })) === "[0,1,2,3]" && tk[0][1] < tk[1][1] && tk[1][1] < tk[2][1] && tk[2][1] < tk[3][1] && tk[0][1] >= 500 && tk[3][1] <= 540, "while recording, a swipe records each string at its own time (G → A, inside the 40 ms of the move)", tk);
  // 指のイベントの時刻が前より早く届いても（イベントごとの遅れの差）、弦の順は入れかわらない
  var e0 = rc.take.ev.length;
  Y.padDown(host, "f3", 20, rc.t0 + 1.0); Y.padMove(host, "f3", 120, rc.t0 + 0.98); Y.padMove(host, "f3", 220, rc.t0 + 1.01); Y.padUp("f3");
  var tk3 = rc.take.ev.slice(e0).map(function (e) { return [e[1], e[0]]; });
  ok(tk3.length === 4 && JSON.stringify(tk3.map(function (x) { return x[0]; })) === "[0,1,2,3]" && tk3.every(function (x, i) { return i === 0 || x[1] >= tk3[i - 1][1]; }), "an event that arrives with an earlier time does not reorder the strings (time never goes back within one finger)", tk3);
  Y.act(host, "cancel");

  // ---------- 12. 画面（390px）----------
  var css = require("fs").readFileSync(require("path").join(H.ROOT, "style.css"), "utf8");
  ok(/\.dpl-pad \{[^}]*touch-action: none/.test(css) && /\.dpl-pad \{[^}]*user-select: none/.test(css), "the string pad takes the touch (no page scroll, no text selection)");
  ok(/\.dpl-ch \{[^}]*min-height: 44px/.test(css) && /\.dpl-chords \{[^}]*repeat\(4, 1fr\)/.test(css), "chord buttons are 44 px tall, 4 in a row (fits 390 px)");
  Y.act(host, "back");
  ok(D.state().view === "arr", "◀ DAW へ returns to the arrangement");
  // ドラムのトラックには出さない
  var dr = M.newTrack(D.project(), "ドラム", M.drumInstrument()); D.state().sel = { kind: "track", id: dr.id }; D.xmas.host.render();
  ok(R.innerHTML.indexOf('data-tr="play"') < 0, "no '弾いて録る' on a drum track");
  ok(D.playp.open(dr.id) && Y.ui().tid === "", "opening on a drum track falls back to a new ukulele track");
  Y.act(host, "back");

  host.autoLat = lat0;
  X.needLoad = nl0;
  A.stop();
};
