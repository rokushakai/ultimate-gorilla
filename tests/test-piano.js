// ゴリラピアノ（arcade-piano.js）のテスト（§212）
"use strict";
var H = require("./harness");
var ok = H.ok;

function press(env, k) { env.key("keydown", k); env.key("keyup", k); }

module.exports = function () {
  H.suite("piano");
  var env = H.load(), W = env.window, P = W.UGPiano, A = W.UGArcade;
  ok(!!P, "UGPiano API exists");
  var ids = A.list().map(function (g) { return g.id; }), g = A.list().filter(function (x) { return x.id === "piano"; })[0];
  ok(g && g.cat === "music" && g.music && ids.indexOf("piano") === ids.indexOf("ukulele") + 1, "piano is a music game right after the ukulele", ids.indexOf("piano"));

  // --- 楽譜 ---
  var pr = P.parse("C4 D#4:2 R:.5 Bb3");
  ok(JSON.stringify(pr) === "[[0,1,60],[1,2,63],[3.5,1,58]]", "score text → [beat, length, midi]", pr);
  var bad = [];
  P.songs.forEach(function (s) {
    var n = P.song(s.id).notes;
    if (n.length < 8 || n.some(function (x) { return x[2] < P.SONG_LOW || x[2] > P.SONG_LOW + 23; })) { bad.push(s.id); }
  });
  ok(P.songs.length === 9 && bad.length === 0, "9 songs; every note fits the C4–B5 keyboard", bad);

  // --- 鍵盤 ---
  var ww = 240 / 14;
  ok(P.keyAt(1, 290, 60) === 60 && P.keyAt(ww * 0.95, 190, 60) === 61 && P.keyAt(ww * 0.95, 290, 60) === 60 && P.keyAt(239, 290, 60) === 83 && P.keyAt(100, 100, 60) === -1,
    "keys under the finger (black keys on top, white below, nothing above the keyboard)");
  var r61 = P.keyRect(61, 60), r62 = P.keyRect(62, 60);
  ok(r61.black && !r62.black && r61.x > 0 && r61.x < r62.x, "black key sits between C and D");
  ok(P.judge(0.05) === 0 && P.judge(-0.1) === 1 && P.judge(0.18) === 2 && P.judge(0.25) === -1 && P.rank(0.96) === "S" && P.rank(0.6) === "C" && P.rank(0.2) === "D", "timing judge and rank");

  // --- テイク（シーケンサーと同じ形） ---
  var list = [];
  for (var i = 0; i < 12; i++) { P.takeAdd(list, { bpm: 90, notes: [[1, 0.5, 60]] }); }
  ok(list.length === P.TAKES_MAX && list[0].id === 12 && list[0].name === "テイク 12", "takes: newest first, 10 at most", list.length);
  var cl = P.notesClean([[2, 1, 64], [0, 0.5, 60.4, 0.8], ["x", 1, 60], [1, 0.25, 62, 0.5], [0, 0, 60]]);
  ok(JSON.stringify(cl) === "[[0,0.5,60],[1,0.25,62,0.5],[2,1,64]]", "notes are cleaned and sorted ([beat, len, midi(, velocity)])", cl);
  var U = W.UGUkulele, seqT = U.tracksClean({ mel: { on: true, notes: P.toSeqNotes({ notes: cl }) } });
  ok(JSON.stringify(seqT.mel.notes) === JSON.stringify(cl), "a take's notes go straight into the ukulele sequencer's melody track", seqT.mel.notes);

  function hooked() {
    return H.load({ patch: function (src, file) {
      if (file === "arcade-piano.js") { src = src.split("      function now() { return frame / 60; }").join("      function now() { return frame / 60; } window.__piano = function () { return { t: now(), rn: rn, counts: counts, ended: ended, pi: pi, miss: miss, rec: rec, play: play, take: take, base: base, notes: notes, back: back, bk: bk, L: L, press: press, act: action, pads: pads, padSel: padSel, padEdit: padEdit, padView: padView }; };"); }
      return src;
    } });
  }
  function center(m) { var r = P.keyRect(m, 60); return [r.x + r.w / 2, r.black ? 200 : 290]; }

  // リズムゲーム: ちょうどのタイミングで全部押す → 全部 PERFECT・ランク S・フルコンボ
  var e1 = hooked(), up1 = null, r1;
  r1 = e1.run("piano", { config: { mode: "rhythm", song: "twinkle", speed: 100 } }, 4000, function () {
    var h = e1.window.__piano; if (!h) { return; }
    var st = h();
    if (up1) { e1.ptr("up", up1[0], up1[1], 1); up1 = null; return; }
    for (var k = 0; k < st.rn.length; k++) {
      var n = st.rn[k];
      if (n.j === -2 && st.t >= n.t - 0.005) { var c = center(n.m); e1.ptr("down", c[0], c[1], 1); up1 = c; return; }
    }
  });
  var s1 = e1.window.__piano(), best1 = JSON.parse(e1.store.ultimateGorillaPianoBestV1 || "{}");
  ok(r1.ended !== null && s1.counts[0] === s1.rn.length && s1.counts[3] === 0, "rhythm: hitting every note on time → all PERFECT", s1.counts);
  ok(best1["rhythm:twinkle@100"] && best1["rhythm:twinkle@100"].r === "S" && best1["rhythm:twinkle@100"].s === r1.ended && r1.ended > s1.rn.length * 100 + 500 - 1, "rank S and the best score are saved (full combo bonus)", [best1, r1.ended]);

  // 何もしない → 全部 MISS で終わる
  var e2 = hooked(), r2 = e2.run("piano", { config: { mode: "rhythm", song: "mary", speed: 70 } }, 6000);
  var s2 = e2.window.__piano();
  ok(r2.ended === 0 && s2.counts[3] === s2.rn.length && JSON.parse(e2.store.ultimateGorillaPianoBestV1)["rhythm:mary@70"].r === "D", "rhythm: doing nothing → all MISS, rank D, game ends at 0", s2.counts);

  // れんしゅう: 1回まちがえてから全部正しく押す
  var e3 = hooked(), wrong = false, up3 = null, r3;
  r3 = e3.run("piano", { config: { mode: "practice", song: "mary" } }, 3000, function (f) {
    var h = e3.window.__piano; if (!h) { return; }
    var st = h();
    if (up3) { e3.ptr("up", up3[0], up3[1], 2); up3 = null; return; }
    if (st.ended || f % 3) { return; }
    var m = st.notes[st.pi][2];
    if (!wrong) { wrong = true; m = m === 60 ? 62 : 60; }
    up3 = center(m);
    e3.ptr("down", up3[0], up3[1], 2);
  });
  var s3 = e3.window.__piano(), best3 = JSON.parse(e3.store.ultimateGorillaPianoBestV1 || "{}");
  ok(s3.ended && s3.miss === 1 && s3.pi === s3.notes.length && r3.ended === (s3.notes.length - 1) * 50, "practice waits for the right key; a missed note scores nothing", [s3.miss, r3.ended]);
  ok(best3["practice:mary"] === 1, "practice best (fewest misses) is saved", best3);

  // じゆうに弾く: 録音 → 自動で保存 → 再生
  var e4 = hooked(), recF = -1;
  e4.store.ultimateGorillaPianoPrefsV1 = JSON.stringify({ bpm: 90, metro: true });
  e4.run("piano", { config: { mode: "free" } }, 600, function (f) {
    if (f === 10) { press(e4, "r"); recF = f; }
    if (f === 210) { e4.key("keydown", "a"); }
    if (f === 255) { e4.key("keyup", "a"); }
    if (f === 270) { e4.key("keydown", "d"); }
    if (f === 300) { e4.key("keyup", "d"); }
    if (f === 330) { press(e4, "r"); }
    if (f === 340) { press(e4, "v"); }
  });
  var s4 = e4.window.__piano(), takes4 = JSON.parse(e4.store.ultimateGorillaPianoTakesV1 || "[]"), n4 = takes4[0] && takes4[0].notes;
  var b0 = (210 - recF - 160) / 60 * 1.5;
  ok(takes4.length === 1 && n4.length === 2 && n4[0][2] === 60 && n4[1][2] === 64 && Math.abs(n4[0][0] - b0) < 0.06 && Math.abs(n4[0][1] - 45 / 60 * 1.5) < 0.06,
    "recording: after a 4-beat count-in, notes are saved in beats (A = C4, D = E4)", n4);
  ok(s4.take && s4.take.id === takes4[0].id && takes4[0].bpm === 90, "the new take is open and can be played back", s4.take && s4.take.name);
  var e5 = hooked(), base5 = [];
  e5.run("piano", { config: { mode: "free" } }, 30, function (f) {
    if (f === 2) { press(e5, "x"); }
    if (f === 4) { var h = e5.window.__piano; base5.push(h().base); press(e5, "z"); press(e5, "z"); base5.push(h().base); }
  });
  ok(base5.join() === "72,48" && JSON.parse(e5.store.ultimateGorillaPianoPrefsV1).base === 48, "Z / X move the keyboard by an octave (remembered)", base5);

  // --- §213: よこ向き ---
  var LD = P.LAND;
  ok(LD.h < P.H && P.keyAt(1, LD.h - 5, 60, LD) === 60 && P.keyAt(ww * 0.95, LD.kb + 5, 60, LD) === 61 && P.keyAt(100, LD.kb - 5, 60, LD) === -1, "landscape layout: a shorter screen, same keys");
  var phone = P.landLayout(P.landH(844, 390)), pc = P.landLayout(P.landH(1400, 820)), tiny = P.landLayout(P.landH(500, 120));
  ok(phone.h >= 80 && phone.h < 100 && pc.h > phone.h && tiny.h === 80 && phone.kb === LD.kb && phone.bh > 0 && phone.bh < phone.h - phone.kb,
    "landscape height follows the screen so the keyboard spans edge to edge with the buttons below", [phone.h, pc.h, tiny.h]);
  var cls = [], lroot = H.makeEl("div"), lparts = {};
  lroot.classList = { add: function (c) { cls.push("+" + c); }, remove: function (c) { cls.push("-" + c); }, contains: function () { return false; } };
  lroot.querySelector = function (sel) {
    if (!lparts[sel]) {
      lparts[sel] = H.makeEl(sel);
      if (sel === ".arcade-canvas") { lparts[sel].getContext = function () { return new Proxy({}, { get: function (t, k) { return t[k] !== undefined ? t[k] : function () {}; }, set: function (t, k, v) { t[k] = v; return true; } }); }; }
    }
    return lparts[sel];
  };
  env.store.ultimateGorillaPianoPrefsV1 = JSON.stringify({ land: true });
  W.UGArcade.start("piano", lroot, { config: { mode: "free" }, onExit: function () {} });
  var lh = lparts[".arcade-canvas"].height;
  W.UGArcade.stop();
  ok(cls.indexOf("+arcade-land") >= 0 && cls.indexOf("-arcade-land") > cls.indexOf("+arcade-land") && lh < 300 * 2, "landscape: the screen goes sideways while playing and back after", [cls, lh]);
  // 回して見せているとき（見えている形が縦長）もタッチの位置が合う
  function landTap(rect, cx, cy) {
    var e = hooked(), got = null;
    e.store.ultimateGorillaPianoPrefsV1 = JSON.stringify({ land: true });
    e.run("piano", { config: { mode: "free" } }, 4, function (f) {
      if (f === 0) { e.canvas.getBoundingClientRect = function () { return rect; }; e.ptr("down", cx, cy, 5); }
      if (f === 1) { var h = e.window.__piano(); got = h.press[5]; e.ptr("up", cx, cy, 5); }
    });
    return got;
  }
  var want = P.keyAt(100, 110, 60, LD);
  ok(want === 69 && landTap({ left: 0, top: 0, width: 240, height: 480, right: 240 }, 240 - 110 * 2, 100 * 2) === want && landTap({ left: 0, top: 0, width: 480, height: 240, right: 480 }, 200, 220) === want,
    "touches land on the right key whether the screen is turned by CSS or the phone is held sideways", want);

  // --- §213: シーケンサーと統合 ---
  var e6 = hooked(), U6 = e6.window.UGUkulele, P6 = e6.window.UGPiano;
  e6.store[U6.SEQ_KEY] = JSON.stringify({ cur: U6.seqClean(null), songs: [{ id: 3, name: "ぼくの曲", seq: U6.seqClean(null) }] });
  var bl = P6.backList();
  ok(bl.map(function (b) { return b[0]; }).join() === "cur,s:3" && bl[1][1] === "ぼくの曲" && P6.backing("s:3").s.events.length > 0 && P6.backing("s:99") === null, "backing songs: the one being edited and the saved ones");
  // 伴奏に合わせて録音: 3拍目（beat 2）で弾く → 拍が合って保存され、曲が終わると止まる
  var S6 = P6.backing("cur").s, f0 = -1, k6 = -1, mid6 = null;
  e6.run("piano", { config: { mode: "free", backing: "cur" } }, 1400, function (f) {
    if (f === 5) { press(e6, "r"); f0 = f; }
    if (f0 >= 0 && k6 < 0 && (f - f0) / 60 >= S6.lead + 2 * S6.spb) { e6.key("keydown", "d"); k6 = f; mid6 = e6.window.__piano(); }
    if (k6 >= 0 && f === k6 + 30) { e6.key("keyup", "d"); }
  });
  var end6 = e6.window.__piano(), t6 = JSON.parse(e6.store.ultimateGorillaPianoTakesV1 || "[]")[0];
  ok(mid6 && mid6.bk && mid6.rec && mid6.rec.back && !end6.rec && !end6.bk, "recording with the backing runs the song and stops when it ends", [!!(mid6 && mid6.bk), !!end6.bk]);
  ok(t6 && t6.song === "編集中の曲" && t6.bpm === 90 && t6.notes.length === 1 && t6.notes[0][2] === 64 && Math.abs(t6.notes[0][0] - 2) < 0.05, "the take is saved in the song's beats", t6);
  // テイクをシーケンサーへ送る（🎹 ピアノ打ち込みトラック）
  var sr = P6.sendToSeq(P6.takesLoad()[0]), sq6 = U6.seqLoad().cur.tracks, x6 = sq6[sq6.xs[0]];
  ok(sr.ok && sq6.xs.length === 1 && x6.preset === "pnotes" && x6.kind === "notes" && JSON.stringify(x6.notes) === JSON.stringify(t6.notes) && x6.name === t6.name, "a take goes into the sequencer as a piano notes track", [sr, x6]);
  for (var k7 = 0; k7 < 7; k7++) { P6.sendToSeq(P6.takesLoad()[0]); }
  var sr9 = P6.sendToSeq(P6.takesLoad()[0]);
  ok(!sr9.ok && U6.seqLoad().cur.tracks.xs.length === 8 && P6.sendToSeq({ name: "x", notes: [] }).ok === false, "no more than 8 extra tracks; empty takes are not sent", sr9.msg);
  ok(U6.X_PRESETS.some(function (p) { return p[0] === "pnotes" && p[2] === 0 && p[3] === "notes"; }), "the sequencer has a 🎹 piano notes track preset");
  // --- §215: 押した鍵盤のコード名（オンコードも） ---
  var CH = W.UGChords, cn = function (ns) { var d = CH.detectNotes(ns); return d ? d.name || d.interval : null; };
  ok(cn([60, 64, 67]) === "C" && cn([64, 67, 72]) === "C/E" && cn([55, 60, 64, 67]) === "C/G" && cn([57, 60, 64, 67]) === "Am7" && cn([60, 64, 67, 69]) === "C6",
    "chord names from piano keys (lowest note is the bass; inversions are on-chords)");
  ok(cn([55, 65, 69, 72]) === "F/G" && cn([50, 60, 64, 67]) === "C/D" && cn([62, 67, 71, 74, 77]) === "G7/D" && CH.detectNotes([64, 67, 72]).onBass === "E",
    "on-chords with a bass outside the chord (F/G, C/D) and the bass note is reported");
  ok(cn([60, 67]) === "C5" && cn([60, 64]) === "長3度" && cn([60, 65]) === "完全4度" && cn([59, 62, 65, 69]) === "Bm7(♭5)" && cn([60, 63, 66, 69]) === "Cdim7" && P.chord([60]) === null,
    "two notes show a power chord or the interval; one note shows no chord");
  var dg = CH.detectNotes([55, 57, 60, 62]), d6 = CH.detectNotes([60, 64, 67, 69]);
  ok(dg.name === "Gsus4add9" && dg.alts.indexOf("D7sus4/G") >= 0 && d6.alts.indexOf("Am7/C") >= 0 && CH.detectNotes([60, 64, 67]).alts.length === 0,
    "chords that can be read two ways keep the other readings (alts)", [dg, d6.alts]);
  var e10 = hooked();
  e10.run("piano", { config: { mode: "free" } }, 12, function (f) {
    if (f === 2) { ["a", "d", "g", "h"].forEach(function (k) { e10.key("keydown", k); }); }
  });
  ok(e10.counters.texts.indexOf("C6") >= 0 && e10.counters.texts.indexOf("＝ Am7/C") >= 0, "both readings are shown on the screen (C6 ＝ Am7/C)", e10.counters.texts.slice(-6));
  var dAll = CH.detectNotes([60, 63, 66, 69], { maxAlts: Infinity }), d69 = CH.detectNotes([60, 62, 64, 67, 69], { maxAlts: Infinity });
  ok(CH.detectNotes([60, 63, 66, 69], { maxAlts: 0 }).alts.length === 0 && CH.detectNotes([60, 63, 66, 69], { maxAlts: 1 }).alts.length === 1 && dAll.alts.length >= 4,
    "how many other readings: none / 1 / … / all", dAll.alts);
  ok(d69.alts.indexOf("Am11/C") >= 0 && d69.alts.indexOf("Am7(11)/C") < 0, "spellings of the same chord (Am11 / Am7(11)) are shown once", d69.alts);
  function altTexts(n) {
    var e = hooked();
    e.store.ultimateGorillaPianoPrefsV1 = JSON.stringify({ alts: n });
    e.run("piano", { config: { mode: "free" } }, 12, function (f) { if (f === 2) { ["a", "e", "t", "h"].forEach(function (k) { e.key("keydown", k); }); } });
    return e.counters.texts.filter(function (t) { return t.indexOf("＝ ") === 0; });
  }
  var t0 = altTexts(0), tA = altTexts(P.ALTS_ALL), t1 = altTexts(1);
  ok(t0.length === 0 && t1.length && t1[t1.length - 1].split("／").length === 1 && tA.length && tA[tA.length - 1].split("／").length >= 4,
    "the setting decides how many readings appear on the screen (none / 1 / all)", [t1.slice(-1), tA.slice(-1)]);
  var e9 = hooked();
  e9.run("piano", { config: { mode: "free" } }, 12, function (f) {
    if (f === 2) { e9.key("keydown", "d"); e9.key("keydown", "g"); e9.key("keydown", "k"); }
  });
  ok(e9.counters.texts.indexOf("C/E") >= 0 && e9.counters.texts.some(function (t) { return t.indexOf("C on E") === 0; }), "holding E-G-C shows C/E and 'C on E' on the screen", e9.counters.texts.slice(-6));
  // --- §218: パッド（和音を仕込んで1タップで鳴らす） ---
  var dl = P.PAD_DEFAULT.map(function (pd) { return P.padLabel(pd); });
  ok(P.PAD_DEFAULT.length === 16 && dl.join() === "C,Dm,Em,F,G,Am,G7,C/E,Fmaj7,Am7,Dm7,E7,C7,Fm,Gsus4,Cadd9" && P.PAD_DEFAULT.every(function (pd) { return pd.every(function (m) { return m >= 60 && m <= 83; }); }),
    "16 pads start with common chords in C (all on the C4–B5 keyboard)", dl);
  var pc0 = P.padsClean([[67, 60, 64, 60, "x"], [], null]);
  ok(pc0.length === 16 && pc0[0].join() === "60,64,67" && pc0[1].length === 0 && pc0[15].length === 0 && P.padsLoad().length === 16, "pads are cleaned (sorted, no repeats) and default to the starter chords");
  var rp = P.padRects(P.PORT, false), rl = P.padRects(LD, false), re = P.padRects(LD, true);
  ok(rp.length === 16 && rp.every(function (r) { return r.y >= 14 && r.y + r.h <= P.KB_Y; }) && rp[4].y > rp[0].y && rp[1].x > rp[0].x && rl[8].y > rl[0].y && rl[7].x > rl[6].x && rl[15].y + rl[15].h > LD.kb && re.every(function (r) { return r.y + r.h <= LD.kb; }),
    "pad layout: 4×4 above the keys / 8×2 filling the landscape screen / 8×2 above the keys while registering sideways");
  ok(P.padAt(rp[5].x + 5, rp[5].y + 5, rp) === 5 && P.padAt(1, 1, rp) === -1, "a tap finds its pad");
  // たて: パッドを押すと和音が鳴り、録音にも入る
  var e11 = hooked(), held11 = null, after11 = null;
  e11.store.ultimateGorillaPianoPrefsV1 = JSON.stringify({ pad: true, bpm: 120 });
  e11.run("piano", { config: { mode: "free" } }, 400, function (f) {
    var h = e11.window.__piano;
    if (f === 2) { e11.ptr("down", rp[0].x + rp[0].w / 2, (rp[0].y + rp[0].h / 2) * 320 / P.H, 7); held11 = h().press; held11 = Object.keys(held11).map(function (k) { return held11[k]; }).sort(); }
    if (f === 4) { e11.ptr("up", 0, 0, 7); after11 = Object.keys(h().press).length; }
    if (f === 10) { press(e11, "r"); }
    if (f === 200) { e11.key("keydown", "6"); }
    if (f === 230) { e11.key("keyup", "6"); }
    if (f === 260) { press(e11, "r"); }
  });
  var t11 = JSON.parse(e11.store.ultimateGorillaPianoTakesV1 || "[]")[0];
  ok(held11 && held11.join() === "60,64,67" && after11 === 0, "tapping a pad plays its chord (keys light up) and lets go on release", held11);
  ok(t11 && t11.notes.length === 3 && t11.notes.map(function (n) { return n[2]; }).sort().join() === "69,72,76" && t11.notes[0][0] === t11.notes[2][0], "pads are recorded too (number key 6 = Am, all notes on the same beat)", t11 && t11.notes);
  // 登録: 鍵盤で音を選んで（もう一度で外す）、パッドをタップ
  var e12 = hooked(), st12 = null;
  e12.store.ultimateGorillaPianoPrefsV1 = JSON.stringify({ pad: true });
  e12.run("piano", { config: { mode: "free" } }, 30, function (f) {
    var h = e12.window.__piano;
    if (f === 1) { h().act("padedit"); }
    [62, 65, 69, 71, 71].forEach(function (m, n) { if (f === 3 + n * 2) { var c = center(m); e12.ptr("down", c[0], c[1], 8); e12.ptr("up", c[0], c[1], 8); } });
    if (f === 16) { st12 = h().padSel.slice(); e12.ptr("down", rp[15].x + 4, (rp[15].y + 4) * 320 / P.H, 9); e12.ptr("up", 0, 0, 9); }
  });
  var pads12 = JSON.parse(e12.store.ultimateGorillaPianoPadsV1 || "[]");
  ok(st12 && st12.join() === "62,65,69" && pads12[15] && pads12[15].join() === "62,65,69" && P.padLabel(pads12[15]) === "Dm" && e12.window.__piano().padSel.length === 0,
    "registering: pick notes on the keyboard (tap again to remove) and tap a pad to store them", [st12, pads12[15]]);
  // よこ: 演奏中は鍵盤をかくしてパッドが画面いっぱい
  var e13 = hooked(), g13 = null;
  e13.store.ultimateGorillaPianoPrefsV1 = JSON.stringify({ pad: true, land: true });
  e13.run("piano", { config: { mode: "free" } }, 6, function (f) {
    if (f === 0) { e13.canvas.getBoundingClientRect = function () { return { left: 0, top: 0, width: 480, height: 240, right: 480 }; }; }
    if (f === 2) { e13.ptr("down", rl[12].x * 2 + 10, (rl[12].y + rl[12].h / 2) * 2, 3); var p13 = e13.window.__piano().press; g13 = Object.keys(p13).map(function (k) { return p13[k]; }).sort().join(); }
  });
  ok(g13 === "60,64,67,70", "landscape: pads fill the screen (pad 13 = C7 where the keys would be)", g13);
};
