// ゴリラストリングス（arcade-strings.js）のテスト（§300〜）
"use strict";
var H = require("./harness");
var ok = H.ok;

module.exports = function () {
  H.suite("strings");
  var env = H.load(), W = env.window, S = W.UGStrings, A = W.UGArcade, B = W.UGBass, U = W.UGUkulele;
  ok(!!S, "UGStrings API exists");
  var ids = A.list().map(function (g) { return g.id; }), g = A.list().filter(function (x) { return x.id === "strings"; })[0];
  ok(g && g.cat === "music" && g.music && ids.indexOf("strings") === ids.indexOf("guitar") + 1 && S.INSTS.length === 9, "strings is a music game right after the guitar, with 9 instruments", ids.indexOf("strings"));

  // --- 指板（上が1弦）・弓の所 ---
  S.layout(true);
  var y2 = S.rowLineY(2), a = S.boardAt(4 + (S.BOW_X - 6 - 4) / 8 * 3.5, y2, 0), b = S.boardAt(5, S.rowLineY(0), 2);
  ok(a && a.sn === 1 && Math.abs(a.semi - 3) < 1e-6 && b.sn === 3 && b.semi < 2 && S.bowRow(S.BOW_X + 5, y2) === 2 && S.bowRow(10, y2) === -1 && S.boardAt(S.BOW_X + 5, y2, 0) === null &&
    S.bowLevel(0) === 0 && S.bowLevel(1000) === 1.1 && S.bowLevel(7) > S.bowLevel(2),
    "fingerboard: 1st string on top, fretless pitch from x; the bow area is separate; faster bowing = louder", [a, b]);
  // --- 合奏コードの和音 ---
  var vC = S.voicing(B.chord(0, 0, "major"), 48, false), vAm = S.voicing(B.chord(0, 5, "major"), 48, false), vG7 = S.voicing(B.chord(0, 4, "major", true), 55, true);
  ok(vC.join() === "48,55,60,64" && vAm.join() === "57,64,69,72" && vG7.join() === "55,62,67,71,77", "chord voicing: root above the lowest string, 5th, octave, 3rd (and the 7th)", [vC, vAm, vG7]);

  // --- ゲーム（サンプルは使わず合成音で）---
  function srun(prefs, frames, fn) {
    var e = H.load(), log = { on: [], stop: 0, targets: [] };
    e.store[S.PREFS_KEY] = JSON.stringify(prefs);
    e.run("strings", { config: {} }, frames, function (fr) {
      var M = e.window.UGMelody;
      if (fr === 1) {
        M.samples.enabled = false;
        var s0 = M.synth, v0 = M.voiceStop;
        M.synth = function (m, pg, w, lv, dest, hold) { if (pg !== M.DRUM) { log.on.push(m + "@" + pg + (hold === 0 ? "p" : "")); } return s0.apply(M, arguments); };
        M.voiceStop = function () { log.stop++; return v0.apply(M, arguments); };
      }
      fn(fr, e, e.window.UGStrings);
    });
    log.targets = e.counters.targets.filter(function (t) { return t.name === "gain"; }).map(function (t) { return t.v; });
    return { log: log, e: e };
  }
  // 弓: 左手で D 線（2行目）の 2 を押さえて、弓の所をこする → E4（64）がのびる。弓をはなすと止まる
  var r1 = srun({ view: "solo", inst: "violin", bow: true }, 40, function (fr, e, Sw) {
    var y = Sw.rowLineY(2), cw = (Sw.BOW_X - 6 - 4) / 8, lx = 4 + cw * 2.5, bx = Sw.BOW_X + 10;
    if (fr === 2) { e.ptr("down", lx, y, 1); }
    if (fr === 3) { e.ptr("down", bx, y, 2); }
    if (fr >= 4 && fr <= 20) { e.ptr("move", bx + (fr % 2 ? 15 : 0), y, 2); }
    if (fr === 30) { e.ptr("up", bx, y, 2); e.ptr("up", lx, y, 1); }
  });
  ok(r1.log.on.join() === "64@40" && r1.log.targets.some(function (v) { return v > 1; }) && r1.log.stop >= 1,
    "bowing: the bowed string sounds the left-hand note while the bow moves (louder when moving), and stops when the bow lifts", r1.log);
  // 弓 OFF: 押しているあいだ鳴る・横にすべらせると音程が変わる（音程ガイドで半音）
  var r2 = srun({ view: "solo", inst: "cello", bow: false }, 20, function (fr, e, Sw) {
    var y = Sw.rowLineY(3), cw = (240 - 4 - 4) / 8;
    if (fr === 2) { e.ptr("down", 4 + cw * 0.5, y, 1); }
    if (fr === 4) { e.ptr("move", 4 + cw * 2.5, y, 1); }
    if (fr === 8) { e.ptr("up", 4 + cw * 2.5, y, 1); }
  });
  ok(r2.log.on.join() === "36@42" && r2.log.stop >= 1, "without the bow, pressing the board sounds the note (cello C2); sliding glides without a new note", r2.log);
  // 合奏コード: キー 1 を押しているあいだ C の和音（バイオリンの音域）、はなすと止まる
  var r3 = srun({ view: "chord", inst: "violin" }, 20, function (fr, e) {
    if (fr === 2) { e.key("keydown", "1"); }
    if (fr === 10) { e.key("keyup", "1"); }
  });
  ok(r3.log.on.join() === "60@40,67@40,72@40,76@40" && r3.log.stop >= 4, "ensemble chords: holding a chord button sustains the voiced chord, releasing stops it", r3.log);
  // はじく楽器（ピチカート）: 指板をタップするとはじく
  var r4 = srun({ view: "solo", inst: "pizz" }, 10, function (fr, e, Sw) { if (fr === 2) { var y = Sw.rowLineY(0); e.ptr("down", 10, y, 1); e.ptr("up", 10, y, 1); } });
  ok(r4.log.on.join() === "69@45p", "plucked instruments (pizzicato) play a short note on tap", r4.log);

  // --- §302: パターン・コード進行・バンド・伴奏 ---
  function bsrun(prefs, frames, fn, cfg) {
    var e = H.load({ patch: function (src, file) { return file === "arcade-strings.js" ? src.split("      function render() {\n").join("      window.__sAct = action; window.__sPanel = function () { return panel.innerHTML; };\n      function render() {\n") : src; } });
    var log = { on: [], dr: 0, bs: [] };
    if (fn && fn.pre) { fn.pre(e); }
    e.store[S.PREFS_KEY] = JSON.stringify(prefs);
    e.run("strings", { config: cfg || {} }, frames, function (fr) {
      var M = e.window.UGMelody;
      if (fr === 1) { M.samples.enabled = false; var s0 = M.synth; M.synth = function (m, pg, w, lv, dest, hold) { if (pg === M.DRUM) { log.dr++; } else if (pg === 33) { log.bs.push(m); } else { log.on.push(m + "@" + pg + (hold === 0 ? "p" : "")); } return s0.apply(M, arguments); }; }
      if (fr === 2) { e.key("keydown", "b"); e.key("keyup", "b"); }
      if (fn) { fn(fr, e); }
    });
    return { log: log, e: e };
  }
  var q1 = bsrun({ view: "chord", inst: "violin", pat: "hold", bpm: 120, cprog: "royal" }, 140);
  var q2 = bsrun({ view: "chord", inst: "violin", pat: "e8", bpm: 120 }, 62);
  var q3 = bsrun({ view: "solo", inst: "cello", pat: "pz", bpm: 120 }, 62);
  ok(q1.log.on.slice(0, 4).join() === "65@40,72@40,77@40,81@40" && q1.log.on.slice(4, 8).join() === "55@40,62@40,67@40,71@40" &&
    q2.log.on.length === 16 && q3.log.on.slice(0, 2).join() === "36@45p,48@45p",
    "patterns: a held chord per bar following the progression (F, then G), eighth-note staccato chords, and pizzicato arpeggios (with the pizzicato sound)", [q1.log.on.slice(0, 8), q2.log.on.length, q3.log.on.slice(0, 4)]);
  var q4 = bsrun({ view: "chord", inst: "violin", pat: "hold", bpm: 120 }, 140, function (fr, e) { if (fr === 40) { e.key("keydown", "6"); } if (fr === 44) { e.key("keyup", "6"); } });
  var q5 = bsrun({ view: "solo", inst: "violin", pat: "q4", bpm: 120, drum: "g:8beat", bpat: "root8" }, 70);
  ok(q4.log.on.join() === "60@40,67@40,72@40,76@40,57@40,64@40,69@40,72@40" && q5.log.dr > 4 && q5.log.bs.length >= 4 && q5.log.bs.every(function (m) { return m === 36; }),
    "a chord pressed during the pattern waits for the next bar; drums and the bass pattern play along", [q4.log.on, q5.log.dr, q5.log.bs]);
  function bfn(fr, e) { }
  bfn.pre = function (e) {
    var U2 = e.window.UGUkulele, sq = U2.seqClean(null);
    sq.rows = [{ type: "chord", name: "C", len: "w" }, { type: "chord", name: "G7", len: "w" }]; sq.bpm = 120; sq.countIn = false; sq.loop = false;
    e.store[U2.SEQ_KEY] = JSON.stringify({ cur: U2.seqClean(sq), songs: [] });
  };
  var q6 = bsrun({ view: "chord", inst: "violin", pat: "hold" }, 260, bfn, { backing: "cur" });
  var mine = q6.log.on.filter(function (x) { return /@40$/.test(x); });
  ok(mine.join() === "60@40,67@40,72@40,76@40,55@40,62@40,67@40,71@40,77@40", "backing: the pattern follows the song's chords (C, then G7 with its 7th)", mine);
  var q7 = bsrun({ tab: "band" }, 6, function (fr, e) { if (fr === 3) { e.window.__sAct("svol:-"); e.window.__sAct("dvol:+"); e.window.__sAct("tab:pat"); } });
  var q7p = JSON.parse(q7.e.store[S.PREFS_KEY]), q7h = q7.e.window.__sPanel();
  ok(q7p.svol === 90 && q7p.dvol === 60 && q7h.indexOf('data-spat="1"') > 0 && q7h.indexOf('data-scprog="1"') > 0 && S.PATS.length === 12 && S.vol(155, 100) === 100,
    "pattern and band tabs: pattern / progression selects and volumes (saved)", [q7p.svol, q7p.dvol]);

  // --- §303: よこ向き・持ち方 ---
  var el = H.load(), Sl = el.window.UGStrings, Bl = el.window.UGBass;
  Sl.layout(true, { land: true, h: 130 });
  var lg1 = Sl.geom(), lc1 = Sl.boardAt(lg1.BOARD_X + 2, Sl.rowLineY(0), 0);
  el.store[Bl.GRIP_KEY] = JSON.stringify({ lefty: true, pw: 30 });
  Sl.layout(true, { land: true, h: 130 });
  var lg2 = Sl.geom(), lc2 = Sl.boardAt(lg2.BOARD_R - 2, Sl.rowLineY(0), 0);
  Sl.layout(false, { land: true, h: 130 });
  var lg3 = Sl.geom();
  Sl.layout(true);
  var lg4 = Sl.geom();
  ok(lg1.LAND && lg1.H === 130 && lg1.COLS >= 7 && lg1.COLS < 13 && lg1.BOW_X > lg1.BOARD_R && lc1 && lc1.semi < 0.5 && lg2.MIRROR && lg2.BOW_X === 4 && lg2.BOARD_X > lg2.BOW_R && lc2 && lc2.semi < 0.5 &&
    lg3.COLS === 13 && !lg4.LAND && lg4.H === 320 && lg4.COLS === 8,
    "strings landscape: more frets, the bow area on the right (left when left-handed, nut on the right); without the bow 13 frets; portrait goes back", [lg1, lg2]);
  // --- §303: リズムゲーム（長い音符を押しつづける）---
  var D = W.UGDrum, songsOk = S.SONGS.every(function (sg) {
    var cE = S.chart(sg, "easy"), cN = S.chart(sg, "normal"), bp = B.patById(B.patterns(cN.meter), sg[9]);
    return cE.notes.length === sg[6] && cN.notes.length >= cE.notes.length && cN.notes.every(function (n) { return n.len > 0; }) && D.patternSteps(sg[8]) && D.patLen(sg[8]) === (cN.meter === 3 ? 12 : 16) && bp && bp[0] === sg[9];
  });
  function rrun(song, holdAll, land) {
    var e = H.load(), sg = S.SONGS.filter(function (x) { return x[0] === song; })[0], c = S.chart(sg, "normal"), spb = 60 / sg[5], t0 = 0.5 + c.meter * spb, cols = [], dn = {}, up = {}, H0 = 0;
    c.notes.forEach(function (n) { if (cols.indexOf(n.d) < 0) { cols.push(n.d); } });
    var r = e.run("strings", { config: { mode: "rhythm", song: song, level: "normal", speed: 100, land: land } }, 3600, function (f) {
      if (f === 1) { H0 = e.window.UGStrings.geom().H; }
      c.notes.forEach(function (n, k) {
        var key = String(cols.indexOf(n.d) + 1), endB = holdAll ? n.beat + n.len - 0.05 : n.beat + n.len * 0.3;
        if (!dn[k] && f / 60 >= t0 + n.beat * spb - 0.005) { dn[k] = 1; e.key("keydown", key); }
        if (dn[k] && !up[k] && f / 60 >= t0 + endB * spb) { up[k] = 1; e.key("keyup", key); }
      });
    });
    var best = JSON.parse(e.store[S.BEST_KEY] || "{}")[song + "@normal@100"];
    return { r: r, best: best, n: c.notes.length, H: H0, text: e.lastTitle ? e.lastTitle() : "" };
  }
  var sr1 = rrun("canon", true, false), sr2 = rrun("canon", false, false), sr3 = rrun("royal", true, true);
  ok(songsOk && sr1.best && sr1.best.r === "S" && sr2.best && sr2.best.s < sr1.best.s && sr1.best.s - sr2.best.s >= sr1.n * 50 - 1 && sr1.H === 320 && sr3.best && sr3.best.r === "S" && sr3.H < 200,
    "strings rhythm game: press at the head and keep holding to the end for a keep bonus (letting go early loses it); landscape works too", [sr1.best, sr2.best, sr1.n, sr3.H]);

  // --- §304: 編成（楽器の組み合わせ・パートの数・人数）---
  var oq = S.orchNotes(B.chord(0, 0, "major"), false, S.presetParts("quartet")), ol = S.orchNotes(B.chord(0, 0, "major"), false, S.presetParts("low"));
  var o7 = S.orchNotes(B.chord(0, 4, "major", true), true, S.presetParts("quartet")), oc = S.orchClean({ on: true, parts: [{ inst: "x", n: 9 }, {}, {}, {}, {}] });
  ok(oq.map(function (x) { return x.inst + ":" + x.m; }).join() === "cello:36,viola:55,violin:64,violin:72" && ol.length === 8 && ol[0].inst === "bass" && ol[4].inst === "cello" && ol[0].n === 2 &&
    o7[3].m % 12 === 5 && oc.parts.length === 4 && oc.parts[0].inst === "violin" && oc.parts[0].n === 1,
    "orchestration: 3+ parts share the chord low to high (root, 5th, 3rd, root / 7th); 2 parts each play the whole chord; settings are cleaned", [oq, o7.map(function (x) { return x.m; })]);
  var ro = srun({ view: "chord", inst: "violin", orch: { on: true, preset: "orch", parts: S.presetParts("orch") } }, 12, function (fr, e) { if (fr === 2) { e.key("keydown", "1"); } if (fr === 8) { e.key("keyup", "1"); } });
  var progs = ro.log.on.map(function (x) { return x.split("@")[1]; }).sort().join();
  ok(ro.log.on.length === 8 && progs === "40,40,40,41,41,42,42,43" && ro.log.stop >= 8, "a held chord with the string-orchestra preset plays every part with its players (violins x3, violas x2, cellos x2, bass)", ro.log.on);
  var po = bsrun({ view: "chord", tab: "play", orch: { on: true, parts: S.presetParts("quartet") } }, 6, function (fr, e) { if (fr === 3) { e.window.__sAct("parts:-"); e.window.__sAct("pn:0:+"); e.window.__sAct("pi:1:cello"); } });
  var pop = JSON.parse(po.e.store[S.PREFS_KEY]).orch, poh = po.e.window.__sPanel();
  ok(pop.parts.length === 3 && pop.parts[0].n === 2 && pop.parts[1].inst === "cello" && pop.preset === "" && poh.indexOf('data-sorch="1"') > 0 && poh.indexOf('data-spi="2"') > 0 && poh.indexOf("パートの数") > 0,
    "the play tab edits the orchestration (number of parts, instrument and players per part)", pop);

  // --- 録音・シーケンサーへ送る ---
  var r5 = srun({ view: "chord", inst: "cello", bpm: 120 }, 260, function (fr, e) {
    if (fr === 2) { e.key("keydown", "z"); e.key("keyup", "z"); }
    if (fr === 130) { e.key("keydown", "1"); }
    if (fr === 190) { e.key("keyup", "1"); }
    if (fr === 200) { e.key("keydown", "z"); e.key("keyup", "z"); }
  });
  var tk = JSON.parse(r5.e.store[S.TAKES_KEY] || "[]")[0];
  ok(tk && tk.inst === "cello" && tk.notes.length === 4 && tk.notes[0][2] === 36 && tk.notes[0][1] > 1.5 && tk.name === "ストリングス 1", "recording: a held chord is saved as long notes with the instrument", tk);
  var rs = S.sendToSeq({ name: "ぼくの弦", inst: "cello", notes: [[0, 2, 36], [0, 2, 43]] }), xt = U.seqLoad().cur.tracks[rs.id];
  ok(rs.ok && xt && xt.preset === "snotes" && xt.prog === 42 && xt.notes.length === 2 && U.X_PRESETS.some(function (p) { return p[0] === "snotes"; }) && !S.sendToSeq({ name: "x", notes: [] }).ok,
    "send to the sequencer: a strings-notes track with the instrument's GM number", rs.msg);
};
