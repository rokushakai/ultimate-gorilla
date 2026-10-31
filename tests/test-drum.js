// ゴリラドラム（arcade-drum.js）のテスト（§226）
"use strict";
var H = require("./harness");
var ok = H.ok;

function press(env, k) { env.key("keydown", k); env.key("keyup", k); }

module.exports = function () {
  H.suite("drum");
  var env = H.load(), W = env.window, D = W.UGDrum, A = W.UGArcade;
  ok(!!D, "UGDrum API exists");
  var ids = A.list().map(function (g) { return g.id; }), g = A.list().filter(function (x) { return x.id === "drum"; })[0];
  ok(g && g.cat === "music" && g.music && ids.indexOf("drum") === ids.indexOf("piano") + 1, "drum is a music game right after the piano", ids.indexOf("drum"));

  // --- リズム・ステップ ---
  ok(D.pads.length === 8 && D.rows.length === 8 && D.grooves().length >= 20 && D.grooves().every(function (gr) { return !/3拍子/.test(gr.name); }), "8 pads; the sequencer's 4/4 grooves are the examples");
  var s8 = D.stepsFrom("8beat");
  ok(s8.length === 8 && D.stepOn(s8, 36, 0) && D.stepOn(s8, 38, 4) && !D.stepOn(s8, 38, 0) && D.stepsClean([[36, [3, 3, 99, 1]], [12, [0]]])[0][1].join() === "1,3", "steps from a groove; cleaned (8 rows, 0–15, no repeats)");
  var tg = D.stepsFrom("8beat");
  ok(D.stepToggle(tg, 47, 2) === true && D.stepOn(tg, 47, 2) && D.stepToggle(tg, 47, 2) === false && !D.stepOn(tg, 47, 2), "toggling a step on and off");
  var U = W.UGUkulele, cu = D.toSeqCustom(s8);
  ok(cu.every(function (r) { return D.SEQ_ROWS.indexOf(r[0]) >= 0; }) && JSON.stringify(U.drumCustomClean(cu)) === JSON.stringify(U.drumFrom("8beat")), "steps fit the sequencer's 'my rhythm' (toms and crash left out)", cu);

  // --- リズムゲームの譜面 ---
  var ce = D.chart("8beat", "easy"), cn = D.chart("8beat", "normal"), ch = D.chart("disco", "hard");
  ok(ce.lanes.join() === "36,38" && cn.lanes.join() === "36,38,42" && ch.lanes.indexOf(46) >= 0 && ce.notes.length === 5 * D.BARS && ce.notes[0].beat === 0, "chart lanes depend on the level (easy: kick+snare / normal: +hi-hat / hard: all)", [ce.lanes, cn.lanes, ch.lanes]);
  ok(D.songs.every(function (s) { return D.chart(s[0], "easy").lanes.length >= 2; }), "every song has at least 2 lanes even on easy");
  ok(D.judge(0.05) === 0 && D.judge(0.1) === 1 && D.judge(-0.2) === 2 && D.judge(0.3) === -1 && D.rank(0.96) === "S" && D.rank(0.1) === "D", "timing judge and rank");

  // --- テイク（録音トラックと同じ形） ---
  var tl = [];
  for (var i = 0; i < 12; i++) { D.listAdd(tl, { bpm: 100, notes: [[1, 36, 0.9]] }, D.TAKES_MAX, D.takeClean, "テイク"); }
  ok(tl.length === D.TAKES_MAX && tl[0].name === "テイク 12" && JSON.stringify(D.toSeqRec({ notes: [[2, 38, 0.8], [0, 36, 2], ["x", 36]] })) === "[[0,36,0.8],[2,38,0.8]]", "takes: newest first, 10 at most; notes as [beat, midi, level]");

  function hooked() {
    return H.load({ patch: function (src, file) {
      if (file === "arcade-drum.js") { src = src.split("      function now() { return frame / 60; }").join("      function now() { return frame / 60; } window.__drum = function () { return { t: now(), rn: rn, counts: counts, ended: ended, rec: rec, play: play, take: take, steps: steps, stepRun: stepRun, flash: flash, chart: chart, act: action, back: back, bk: bk, patRun: patRun, patTap: patTap, patPads: patPads, prac: prac, bpm: bpm, tapTarget: tapTarget }; };"); }
      return src;
    } });
  }
  function padXY(i) { var r = D.padRect(i); return [r.x + r.w / 2, (r.y + r.h / 2) * 320 / D.H]; }

  // じゆう: パッドを叩く・録音（カウントイン後の拍で）
  var e1 = hooked(), f0 = -1;
  e1.store[D.PREFS_KEY] = JSON.stringify({ bpm: 120, metro: true });
  e1.run("drum", { config: { mode: "free" } }, 400, function (f) {
    if (f === 2) { var c = padXY(4); e1.ptr("down", c[0], c[1], 1); e1.ptr("up", c[0], c[1], 1); }
    if (f === 10) { press(e1, "z"); f0 = f; }
    if (f === 10 + 120 + 30) { press(e1, "s"); }
    if (f === 10 + 120 + 60) { press(e1, "a"); press(e1, "q"); }
    if (f === 300) { press(e1, "z"); }
  });
  var t1 = JSON.parse(e1.store[D.TAKES_KEY] || "[]")[0];
  ok(t1 && t1.notes.length === 3 && t1.notes[0][1] === 38 && Math.abs(t1.notes[0][0] - 1) < 0.05 && Math.abs(t1.notes[1][0] - 2) < 0.05 && t1.bpm === 120, "recording: after a 4-beat count-in, hits are saved in beats (S = snare, A = kick, Q = hi-hat)", t1);

  // ステップ: マスをタップしてオン、▶ でループ再生、保存
  var e2 = hooked(), st2 = null, fl2 = 0;
  e2.store[D.PREFS_KEY] = JSON.stringify({ bpm: 120, steps: [] });
  e2.run("drum", { config: { mode: "step" } }, 80, function (f) {
    var h = e2.window.__drum; if (!h) { return; }
    if (f === 2) { var cw = (240 - 36 - 2) / 16; e2.ptr("down", 36 + cw * 2 + 3, (22 + 24 * 1 + 10) * 320 / D.H, 1); }
    if (f === 4) { h().act("play"); }
    if (f > 4 && h().flash[38] > fl2) { fl2 = h().flash[38]; }
    if (f === 60) { st2 = h(); h().act("save"); }
  });
  var pats2 = JSON.parse(e2.store[D.PATS_KEY] || "[]");
  ok(st2 && D.stepOn(st2.steps, 38, 2) && st2.stepRun && fl2 > 0 && pats2.length === 1 && D.stepOn(pats2[0].steps, 38, 2) && JSON.parse(e2.store[D.PREFS_KEY]).steps[1][1].join() === "2",
    "step mode: tap a cell (snare, 3rd step), loop playback sounds it, save keeps it", [st2 && st2.steps[1], pats2.length]);

  // リズムゲーム: ちょうどで全部叩く → 全部 PERFECT・ランク S
  var e3 = hooked(), last3 = {};
  e3.run("drum", { config: { mode: "rhythm", song: "8beat", level: "normal", speed: 100 } }, 2000, function () {
    var h = e3.window.__drum; if (!h) { return; }
    var st = h(), k;
    for (k = 0; k < st.rn.length; k++) {
      var n = st.rn[k];
      if (n.j === -2 && st.t >= n.t - 0.005 && last3[k] === undefined) {
        last3[k] = 1;
        var lane = st.chart.lanes.indexOf(n.m), lw = 240 / st.chart.lanes.length;
        e3.ptr("down", lane * lw + lw / 2, 200, 9);
        e3.ptr("up", lane * lw + lw / 2, 200, 9);
      }
    }
  });
  var s3 = e3.window.__drum(), b3 = JSON.parse(e3.store[D.BEST_KEY] || "{}")["8beat@normal@100"];
  ok(s3.ended && s3.counts[0] === s3.rn.length && s3.counts[3] === 0 && b3 && b3.r === "S", "rhythm: hitting every note on time (lanes by tapping) → all PERFECT, rank S saved", [s3.counts, b3]);
  var e4 = hooked();
  e4.run("drum", { config: { mode: "rhythm", song: "four", level: "easy", speed: 70 } }, 3000);
  var s4 = e4.window.__drum();
  ok(s4.ended && s4.counts[3] === s4.rn.length, "rhythm: doing nothing → all MISS and the game ends", s4.counts);
  // --- §227: シーケンサーと統合 ---
  var e5 = hooked(), U5 = e5.window.UGUkulele, D5 = e5.window.UGDrum;
  e5.store[U5.SEQ_KEY] = JSON.stringify({ cur: U5.seqClean(null), songs: [{ id: 4, name: "ぼくの曲", seq: U5.seqClean(null) }] });
  var bl5 = D5.backList();
  ok(bl5.map(function (b) { return b[0]; }).join() === "cur,s:4" && D5.backing("s:4").s.events.length > 0 && D5.backing("s:9") === null, "backing songs: the one being edited and the saved ones");
  var S5 = D5.backing("cur"), dEv = { kind: "drum", track: "drum", t: 5 }, cEv = { kind: "click", t: 0 };
  ok(!D5.backEventOn(dEv, S5.seq, S5.s.lead, true) && D5.backEventOn(dEv, S5.seq, S5.s.lead, false) && D5.backEventOn({ kind: "strum", track: "uke", t: 5 }, S5.seq, S5.s.lead, true) && D5.backEventOn(cEv, S5.seq, S5.s.lead, true),
    "the song's own drums can be left out of the backing (count-in clicks stay)");
  // 伴奏に合わせて録音: 3拍目（beat 2）で叩く → 曲の拍で保存、曲が終わると止まる
  var g0 = -1, k5 = -1, mid5 = null;
  e5.run("drum", { config: { mode: "free", backing: "cur" } }, 1400, function (f) {
    if (f === 5) { press(e5, "z"); g0 = f; }
    if (g0 >= 0 && k5 < 0 && (f - g0) / 60 >= S5.s.lead + 2 * S5.s.spb) { press(e5, "s"); k5 = f; mid5 = e5.window.__drum(); }
  });
  var end5 = e5.window.__drum(), t5 = JSON.parse(e5.store[D5.TAKES_KEY] || "[]")[0];
  ok(mid5 && mid5.bk && mid5.rec && mid5.rec.back && !end5.rec && !end5.bk, "recording with the backing runs the song and stops when it ends");
  ok(t5 && t5.song === "編集中の曲" && t5.notes.length === 1 && t5.notes[0][1] === 38 && Math.abs(t5.notes[0][0] - 2) < 0.05, "the take is saved in the song's beats", t5);
  // ステップを送る・読みこむ
  var my = D5.stepsFrom("funk");
  D5.stepToggle(my, 47, 3);
  var sr = D5.sendSteps(my), dr = U5.seqLoad().cur.tracks.drum;
  ok(sr.ok && dr.on && dr.groove === "custom" && JSON.stringify(dr.custom) === JSON.stringify(U5.drumCustomClean(D5.toSeqCustom(my))) && sr.msg.indexOf("タム") >= 0, "steps go to the sequencer's drum as 'my rhythm' (toms/crash left out, with a note)", sr.msg);
  var back5 = D5.stepsFromSeq();
  ok(D5.stepOn(back5, 36, 0) && !D5.stepOn(back5, 47, 3) && JSON.stringify(D5.toSeqCustom(back5)) === JSON.stringify(D5.toSeqCustom(my)) && !D5.sendSteps(D5.stepsClean([[47, [0]]])).ok, "the sequencer's drum can be read back into steps; only toms/crash can't be sent");
  var st6 = U5.seqLoad(); st6.cur.tracks.drum.groove = "bossa"; U5.seqSave(st6);
  ok(JSON.stringify(D5.stepsFromSeq()) === JSON.stringify(D5.stepsFrom("bossa")), "when the sequencer uses a built-in rhythm, reading gives that rhythm's steps");
  // --- §228: ドラムセットの形 ---
  var kb = D.kitBox(58, 300 - 58 - 4);
  function kc(id) { var r = D.kitShape(D.kitPiece(id), kb); return [r.cx, r.cy]; }
  ok(D.kit.length === 8 && ["snare", "kick", "tom1", "floor", "ride", "crash", "hh", "tom2"].every(function (id) { var c = kc(id); var p = D.kitAt(c[0], c[1], kb); return p && p[0] === id; }), "every kit piece is hit at its center (front pieces win)");
  ok(D.kitAt(2, 2, kb) === null && D.pad(51)[1] === "ライド" && D.pad(43)[2] === "FLOOR", "taps outside the kit hit nothing; ride / toms / floor tom have names");
  var e7 = hooked(), got7 = [];
  e7.store[D.PREFS_KEY] = JSON.stringify({ kit: true, bpm: 120 });
  e7.run("drum", { config: { mode: "free" } }, 400, function (f) {
    var h = e7.window.__drum; if (!h) { return; }
    if (f === 2) { var c = kc("floor"); e7.ptr("down", c[0], c[1] * 320 / D.H, 3); e7.ptr("up", c[0], c[1] * 320 / D.H, 3); }
    if (f === 4) { press(e7, "z"); }
    if (f === 200) { press(e7, "q"); }
    if (f === 210) { e7.key("keydown", "c"); press(e7, "q"); e7.key("keyup", "c"); press(e7, "f"); } // §241: C を押しているあいだ開く・はなすと閉じる（44）
    if (f === 260) { press(e7, "z"); }
    if (f === 3) { got7.push(Object.keys(h().flash).filter(function (k) { return h().flash[k] > 0; }).join()); }
  });
  var t7 = JSON.parse(e7.store[D.TAKES_KEY] || "[]")[0];
  ok(got7[0] === "43" && t7 && t7.notes.map(function (n) { return n[1]; }).join() === "42,46,44,51", "kit: tapping the floor tom hits it; keys Q (hi-hat), holding C (pedal) opens it → open hi-hat, releasing closes it (44), F (ride) are recorded", [got7, t7 && t7.notes]);
  ok(D.landH(844, 390) >= 90 && D.landH(844, 390) < D.landH(1400, 820) + 1, "landscape height follows the screen");
  // --- §229 / §230: 生ドラムのサンプル（ロック DRSKit・ジャズ Virtuosity） ---
  var UG = W.UGMelody, fs = require("fs"), path = require("path");
  var used = D.pads.map(function (pd) { return pd[0]; }).concat(D.extra.map(function (x) { return x[0]; })).filter(function (m) { return m !== 39; });
  ok(UG.sampleFiles[UG.DRUM] === "drums_drs" && used.every(function (m) { return !!UG.drumMap[m]; }) && !UG.drumMap[39] && typeof UG.setDrumSamples === "function",
    "every drum (except the clap) has a real drum sample; rock (DRSKit) is the default kit", used.filter(function (m) { return !UG.drumMap[m]; }));
  ok(UG.drumKits.length === 5 && UG.setDrumKit("swirly") && UG.sampleFiles[UG.DRUM] === "drums_swirly" && UG.setDrumKit("virtuosity") && UG.sampleFiles[UG.DRUM] === "drums_virtuosity" && !UG.setDrumKit("nope") && UG.setDrumKit("drs") && UG.sampleFiles[UG.DRUM] === "drums_drs",
    "choosing a kit switches the sample file");
  [["drums_drs", /CC BY 4\.0/, 10], ["drums_virtuosity", /CC0/, 9], ["drums_rusty", /CC0/, 10], ["drums_brush", /CC0/, 10], ["drums_swirly", /CC0/, 10]].forEach(function (kf) {
    var js = fs.readFileSync(path.join(__dirname, "..", "samples", kf[0] + ".js"), "utf8"), keys = (js.match(/"(\d+)": "/g) || []).map(function (k) { return Number(k.replace(/\D/g, "")); });
    ok(kf[1].test(js) && keys.length === kf[2] && Object.keys(UG.drumMap).every(function (m) { return keys.indexOf(Number(m)) >= 0 || keys.indexOf(UG.drumMap[m][0]) >= 0; }) && js.length < 700 * 1024, kf[0] + ": license noted, every mapped drum has a sound, small file", keys);
  });
  var cr = fs.readFileSync(path.join(__dirname, "..", "CREDITS.md"), "utf8");
  ok(/Virtuosity Drums/.test(cr) && /Big Rusty Drums/.test(cr) && /Swirly Drums/.test(cr) && /DRSKit/.test(cr) && /CC BY 4\.0/.test(cr), "CREDITS.md names both drum sample sets (DRSKit needs attribution)");
  var pr = JSON.parse(JSON.stringify(D.prefs()));
  ok(pr.kitId === "drs" && pr.deep === false && pr.real === true, "drum game defaults: real drums, rock kit, normal kick", pr);
  // --- §231: 読みこみが止まったらやりなおす ---
  var e9 = H.load(), U9 = e9.window.UGMelody;
  U9.audioInit();
  var S9 = U9.samples, f9 = U9.sampleFiles[U9.DRUM];
  S9.state[f9] = "loading"; S9.loadAt[f9] = Date.now();
  U9.loadSamples([U9.DRUM]);
  var fresh = S9.loadAt[f9];
  S9.state[f9] = "decoding"; S9.loadAt[f9] = Date.now() - 60000;
  U9.loadSamples([U9.DRUM]);
  ok(S9.state[f9] === "loading" && S9.loadAt[f9] > Date.now() - 5000 && fresh > 0, "a sample load stuck for more than 10 s is started again (a fresh one is left alone)", [S9.state[f9]]);
  S9.state[f9] = "error"; S9.loadAt[f9] = Date.now();
  U9.loadSamples([U9.DRUM]);
  ok(S9.state[f9] === "error", "a failed load is not retried right away (only after 10 s)");
  // --- §233: 演奏パターン ---
  ok(D.PATPAD_DEFAULT.length === 32 && D.PATPAD_N === 32 && D.patPadsLoad().every(function (id) { return id && D.patternSteps(id); }) && D.fills.length === 14 && D.pattern("f:toms").kind === "fill" && D.pattern("g:8beat").kind === "loop",
    "32 pattern pads (2 pages): grooves loop, fills play one bar");
  // --- §236: 音色とパターンを追加 ---
  var jz = D.patternSteps("g:jazz"), mt = D.patternSteps("d:metal");
  ok(jz && jz.some(function (x) { return x[0] === 51 && x[1].length >= 4; }) && jz.some(function (x) { return x[0] === 42; }) && mt && mt[0][1].length === 16 &&
    D.patternList().filter(function (pt) { return pt.group === "ドラムのリズム"; }).length === 14,
    "groove patterns keep the ride and toms (pedal hi-hat becomes hi-hat); 14 drum-only loops added");
  // §242: オープン・クローズのパターン（開けて、すぐペダル 44 で閉じる）
  ok(["d:tsuchi", "d:bark", "d:sizzle"].every(function (id) { var st = D.patternSteps(id); return D.pattern(id).kind === "loop" && st.some(function (x) { return x[0] === 46; }) && st.some(function (x) { return x[0] === 44; }); }) &&
    D.HH_STYLES.map(function (x) { return x[0]; }).join() === "auto,tight,bark,sizzle", "open-close patterns (ツッチー・バーク・シュワッ) open the hi-hat and close it with the pedal");
  var e18 = hooked();
  e18.store[D.PATPADS_KEY] = JSON.stringify(D.PATPAD_DEFAULT.slice(0, 16).reverse());
  e18.store[D.PREFS_KEY] = JSON.stringify({ kitId: "rusty" });
  var pp18 = e18.window.UGDrum.patPadsLoad(), pr18 = e18.window.UGDrum.prefs();
  e18.store[D.PREFS_KEY] = JSON.stringify({ kitId: "nope" });
  ok(pp18[0] === "f:crash" && pp18[16] === "d:metal" && pp18[31] === "f:kime4" && pr18.kitId === "rusty" && e18.window.UGDrum.prefs().kitId === "drs" && D.kits.length === 5,
    "an old 16-pad save keeps its pads and gets the new second page; new kits can be chosen (unknown → rock)", [pp18[0], pp18[16], pr18.kitId]);
  var my2 = []; D.listAdd(my2, { name: "ぼくの", bpm: 100, steps: D.stepsFrom("funk") }, D.PATS_MAX, D.patClean, "リズム");
  var e10 = hooked(); e10.store[D.PATS_KEY] = JSON.stringify(my2);
  ok(e10.window.UGDrum.patternList().some(function (pt) { return pt.id === "p:1" && pt.name === "ぼくの" && pt.group === "じぶんのリズム"; }), "saved step rhythms can be used as patterns");
  // BPM 120: 16分 ＝ 7.5フレーム。8ビート → 小節の頭で フィル（キュー）→ 1小節後に 8ビートへもどる → もう一度押すと止まる
  var log = [], qd = null;
  e10.store[D.PREFS_KEY] = JSON.stringify({ pat: true, bpm: 120 });
  e10.run("drum", { config: { mode: "free" } }, 400, function (f) {
    var h = e10.window.__drum; if (!h) { return; }
    var st = h();
    if (f === 2) { st.patTap(0); }
    if (f === 40) { st.patTap(10); qd = h().patRun.queue && h().patRun.queue.id; }
    var pr = h().patRun, id = pr ? pr.id : "-";
    if (log[log.length - 1] !== id) { log.push(id); }
    if (f === 300) { h().patTap(0); }
  });
  ok(qd === "f:snare" && log.join() === "-,g:8beat,f:snare,g:8beat,-", "a loop starts at once; a fill waits for the next bar, plays one bar, then the loop comes back; tapping the loop again stops it", log);
  // 録音中なら、パターンの音もテイクに入る
  var e11 = hooked();
  e11.store[D.PREFS_KEY] = JSON.stringify({ pat: true, bpm: 120, metro: false });
  e11.run("drum", { config: { mode: "free" } }, 300, function (f) {
    var h = e11.window.__drum; if (!h) { return; }
    if (f === 2) { press(e11, "z"); }
    if (f === 120) { h().patTap(15); }
    if (f === 250) { press(e11, "z"); }
  });
  var t11 = JSON.parse(e11.store[D.TAKES_KEY] || "[]")[0];
  ok(t11 && t11.notes.map(function (n) { return n[1]; }).sort().join() === "36,38,49", "pattern hits are recorded too (the ending = kick + snare + crash)", t11 && t11.notes);
  // --- §234: 強弱・オートフィル・鳴らさないパート・音量・タップテンポ ---
  ok(D.patVel(42, 0) > D.patVel(42, 2) && D.patVel(42, 2) > D.patVel(42, 1) && D.patVel(38, 3) < D.patVel(38, 4) * 0.5 && D.patVel(38, 15, true) > D.patVel(38, 8, true) &&
    D.partOf(36) === "kick" && D.partOf(46) === "hh" && D.partOf(45) === "tom" && D.patVol("s") < D.patVol("m") && D.patVol("m") < D.patVol("l"),
    "pattern dynamics: hi-hat on the beat is louder, snare 16th offbeats are ghost notes, fills get louder");
  var e12 = hooked();
  e12.store[D.PREFS_KEY] = JSON.stringify({ autoFill: 5, patVol: "x", mute: ["hh", "nope", "hh", "kick"] });
  var pr12 = e12.window.UGDrum.prefs();
  ok(pr12.autoFill === 0 && pr12.patVol === "l" && pr12.mute.join() === "hh,kick", "bad pattern settings are cleaned (auto fill / volume / muted parts)", pr12);
  // オートフィル 4小節（BPM 120 → 1小節 120フレーム）: 3小節 8ビート → 4小節目にフィル → もどってクラッシュ。ハイハットは鳴らさない・音は少し先に予約
  var e13 = hooked(), log13 = [], snd = [], fr = 0, autoSeen = false;
  e13.store[D.PREFS_KEY] = JSON.stringify({ pat: true, bpm: 120, autoFill: 4, mute: ["hh"], patVol: "m" });
  e13.run("drum", { config: { mode: "free" } }, 620, function (f) {
    fr = f;
    var h = e13.window.__drum; if (!h) { return; }
    if (f === 1) { var U = e13.window.UGMelody, s0 = U.synth; U.synth = function (m, p, when, lv) { snd.push([fr, m, when, lv]); return s0.apply(U, arguments); }; }
    if (f === 2) { h().patTap(0); }
    var pr = h().patRun, id = pr ? pr.id : "-";
    if (pr && pr.auto) { autoSeen = true; }
    if (log13[log13.length - 1] !== id) { log13.push(id); }
  });
  var crashAfter = snd.filter(function (s) { return s[1] === 49 && s[0] > 470 && s[0] < 490; });
  ok(log13.join() === "-,g:8beat,f:snare,g:8beat" && autoSeen && crashAfter.length === 1, "auto fill plays a fill in the last bar of every 4 bars, then the loop comes back with a crash", [log13, crashAfter]);
  ok(snd.length > 20 && !snd.some(function (s) { return s[1] === 42 || s[1] === 46; }) && snd.some(function (s) { return s[2] > 1; }) && snd.every(function (s) { return s[3] <= 0.75 * 0.86; }),
    "muted parts are skipped, pattern hits are scheduled slightly ahead, and the volume setting applies", snd.slice(0, 6));
  // タップテンポ: 0.5秒ごと（30フレーム）に4回 → BPM 120
  var e14 = hooked();
  e14.store[D.PREFS_KEY] = JSON.stringify({ bpm: 80 });
  e14.run("drum", { config: { mode: "free" } }, 120, function (f) {
    var h = e14.window.__drum; if (!h) { return; }
    if (f === 10 || f === 40 || f === 70 || f === 100) { h().act("tap"); }
  });
  ok(Math.abs(e14.window.UGDrum.prefs().bpm - 120) <= 1, "tap tempo sets the BPM from the taps", e14.window.UGDrum.prefs().bpm);
  // --- §243: 演奏中のタップテンポは、少しずつ近づく ---
  ok(Math.abs(D.tapBpm([0, 0.5, 1, 1.5], 100) - 120) < 0.01 && Math.abs(D.tapBpm([0, 0.25, 0.5, 0.75], 110) - 120) < 0.01 && Math.abs(D.tapBpm([0, 1, 2], 110) - 120) < 0.01 &&
    Math.abs(D.tapBpm([0, 0.5, 1, 1.25, 1.75, 2.25], 120) - 120) < 0.01 && D.tapBpm([0, 3], 120) === null,
    "tap BPM: the middle interval, eighths / half notes are folded to beats, a stray tap is ignored");
  var g0 = 100, gq = 100, gi;
  for (gi = 0; gi < 60; gi++) { g0 = D.tapGlide(g0, 130, "mid", 1 / 60); gq = D.tapGlide(gq, 130, "quick", 1 / 60); }
  ok(g0 > 119 && g0 < 121 && gq > 129 && gq <= 130 && D.tapGlide(100, 130, "now", 1 / 60) === 130 && D.tapGlide(129.8, 130, "soft", 1 / 60) === 130,
    "tempo glide: up to 20 BPM a second (ふつう), faster when きびきび, 'すぐ' jumps", [g0, gq]);
  function tfRun(follow) {
    var e = hooked(), tr = [];
    e.store[D.PREFS_KEY] = JSON.stringify({ pat: true, bpm: 100, tapFollow: follow });
    e.run("drum", { config: { mode: "free" } }, 400, function (f) {
      var h = e.window.__drum; if (!h) { return; }
      if (f === 2) { h().patTap(0); }
      if (f >= 40 && f <= 220 && (f - 40) % 30 === 0) { h().act("tap"); } // 0.5秒ごと ＝ BPM 120
      if (f === 85 || f === 399) { tr.push(Math.round(h().bpm * 10) / 10); }
    });
    return tr.concat([e.window.UGDrum.prefs().bpm]);
  }
  var tfm = tfRun("mid"), tfn = tfRun("now");
  ok(tfm[0] > 101 && tfm[0] < 115 && tfm[1] === 120 && tfm[2] === 120 && tfn[0] === 120, "while a pattern plays, tapping moves the BPM gradually to the tapped tempo (saved when it arrives); 'すぐ' jumps", [tfm, tfn]);
  // --- §235: ハネ・じぶんのフィル・ステップの予約再生・練習の判定 ---
  ok(D.swingOff("0", 1) === 0 && D.swingOff("16b", 1) === 0.33 && D.swingOff("16b", 2) === 0 && D.swingOff("8b", 2) === 0.66 && D.swingOff("8b", 0) === 0 && D.swingOff("8a", 1) === 0.17,
    "swing delays the offbeats (16th or 8th, light or triplet feel)");
  var my3 = []; D.listAdd(my3, { name: "ぼくのフィル", bpm: 100, steps: D.stepsFrom("funk"), kind: "fill" }, D.PATS_MAX, D.patClean, "フィル");
  D.listAdd(my3, { name: "ふつう", bpm: 100, steps: D.stepsFrom("funk") }, D.PATS_MAX, D.patClean, "リズム");
  var e15 = hooked(); e15.store[D.PATS_KEY] = JSON.stringify(my3);
  var pl15 = e15.window.UGDrum.patternList();
  ok(my3[1].kind === "fill" && my3[0].kind === "loop" && pl15.some(function (pt) { return pt.id === "p:1" && pt.kind === "fill"; }) && pl15.some(function (pt) { return pt.id === "p:2" && pt.kind === "loop"; }),
    "a step rhythm saved as a fill works as a fill pattern");
  // ステップ: ハイハット16マス・BPM 120・16分しっかりハネ → 鳴る時刻の間かくが長い・短いをくりかえす
  var e16 = hooked(), hh16 = [], fr16 = 0;
  e16.store[D.PREFS_KEY] = JSON.stringify({ mode: "step", bpm: 120, swing: "16b", steps: [[42, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]]] });
  e16.run("drum", { config: { mode: "step" } }, 200, function (f) {
    fr16 = f;
    if (f === 1) { var U = e16.window.UGMelody, s0 = U.synth; U.synth = function (m, p, when) { if (m === 42) { hh16.push(e16.window.__drum().t + (when > 0 ? when - 1 : 0)); } return s0.apply(U, arguments); }; }
    if (f === 3) { press(e16, "x"); }
  });
  var gaps = []; for (var gi = 2; gi < Math.min(14, hh16.length); gi++) { gaps.push(Math.round((hh16[gi] - hh16[gi - 1]) * 1000)); }
  ok(hh16.length > 20 && gaps.every(function (g, j) { return Math.abs(g - (gaps[0] > 125 ? (j % 2 ? 84 : 166) : (j % 2 ? 166 : 84))) <= 6; }), "step playback is scheduled ahead and swings the 16th offbeats", gaps);
  // 練習: ハイハットを鳴らさない 8ビート。予定どおりに叩く → ぴったり、50ms早く → はやい、叩かない → わすれ。止めると結果
  var e17 = hooked(), seen = {}, n17 = 0, c17 = null;
  e17.store[D.PREFS_KEY] = JSON.stringify({ pat: true, bpm: 120, mute: ["hh"] });
  e17.run("drum", { config: { mode: "free" } }, 300, function (f) {
    var h = e17.window.__drum; if (!h) { return; }
    var st = h();
    if (f === 2) { st.patTap(0); return; }
    if (!st.prac || f > 250) { return; }
    for (var i = 0; i < st.prac.exp.length; i++) {
      var x = st.prac.exp[i], key = Math.round(x.t * 1000), dt = x.t - st.t;
      if (seen[key]) { continue; }
      var k = n17 % 8;
      if ((k === 6 && dt > 0.04 && dt < 0.07) || (k !== 6 && k !== 7 && dt >= 0 && dt < 1 / 60)) { seen[key] = 1; n17++; press(e17, "q"); }
      else if (k === 7 && dt < 0) { seen[key] = 1; n17++; }
    }
    if (f === 250) { c17 = st.prac.c.slice(); st.act("patstop"); }
  });
  ok(c17 && c17[0] >= 8 && c17[1] >= 1 && c17[2] === 0 && c17[3] >= 1 && e17.window.__drum().prac === null && e17.window.__drum().patRun === null,
    "practice mode judges hits on the muted part (on time / early / missed) and stopping shows the result", c17);
  // --- §237: ソング・ずれ直し・ゆらぎ・シーケンサーへ ---
  var sc = D.songClean([["g:8beat", 40], ["nope", 2], ["f:snare", 0], "x", ["g:rock", 4]]);
  ok(sc.length === 3 && sc[0][1] === 16 && sc[1][1] === 1 && D.songBars(D.songLoad()) === 15 && D.songClean([["g:8beat", 16], ["g:8beat", 16], ["g:8beat", 16], ["g:8beat", 16], ["g:8beat", 16], ["g:8beat", 16], ["g:8beat", 16], ["g:8beat", 16], ["g:8beat", 16]]).length === 8,
    "song entries: unknown patterns are dropped, 1-16 bars each, up to 128 bars", sc);
  var sn = D.songNotes(D.SONG_DEFAULT, "0");
  ok(sn.length > 100 && sn.some(function (n) { return n[0] === 16 && n[1] === 49; }) && sn[sn.length - 1][0] < 60 && sn.every(function (n, i) { return !i || sn[i - 1][0] <= n[0]; }),
    "a song becomes one note list (15 bars), with a crash after each fill");
  var qz = D.quantize([[0.03, 36, 0.9], [0.26, 38, 0.8], [0.22, 38, 0.7], [1.1, 42, 0.5]]);
  ok(JSON.stringify(qz) === JSON.stringify([[0, 36, 0.9], [0.25, 38, 0.8], [1, 42, 0.5]]), "quantize moves hits to the nearest 16th and merges doubles", qz);
  // ソングを鳴らす: 8ビート 1小節 → スネアフィル 1小節 → ロック 1小節 → 止まる（BPM 120 ＝ 1小節 120フレーム）
  var e19 = hooked(), log19 = [];
  e19.store[D.SONG_KEY] = JSON.stringify([["g:8beat", 1], ["f:snare", 1], ["g:rock", 1]]);
  e19.store[D.PREFS_KEY] = JSON.stringify({ pat: true, bpm: 120, songOpen: true });
  e19.run("drum", { config: { mode: "free" } }, 480, function (f) {
    var h = e19.window.__drum; if (!h) { return; }
    if (f === 2) { h().act("songplay"); }
    var pr = h().patRun, id = pr ? pr.id + (pr.song ? "#" + pr.song.i : "") : "-";
    if (log19[log19.length - 1] !== id) { log19.push(id); }
  });
  ok(log19.join() === "-,g:8beat#0,f:snare#1,g:rock#2,-", "the song plays each pattern for its bars, then stops", log19);
  // テイクにする・ずれ直し
  var e20 = hooked();
  e20.store[D.SONG_KEY] = JSON.stringify([["g:8beat", 2]]);
  e20.store[D.PREFS_KEY] = JSON.stringify({ pat: true });
  e20.run("drum", { config: { mode: "free" } }, 10, function (f) { var h = e20.window.__drum; if (h && f === 2) { h().act("songtake"); h().act("quant"); } });
  var tk20 = JSON.parse(e20.store[D.TAKES_KEY] || "[]");
  ok(tk20.length === 2 && /ソング/.test(tk20[1].name) && /（直し）/.test(tk20[0].name) && tk20[1].notes.length === tk20[0].notes.length && tk20[1].notes[tk20[1].notes.length - 1][0] < 8,
    "a song can be saved as a take, and a take can be quantized into a new take", tk20.map(function (t) { return t.name; }));
  // シーケンサーへ: 🥁 ドラム打ち込みトラック（音色 128）
  var e21 = hooked(), U21 = e21.window.UGUkulele, r21 = e21.window.UGDrum.songSend([["g:8beat", 2], ["f:crash", 1]], "0", "テスト");
  var st21 = U21.seqLoad(), xid = st21.cur.tracks.xs[st21.cur.tracks.xs.length - 1], xt = st21.cur.tracks[xid];
  ok(r21.ok && xt.preset === "dnotes" && xt.prog === 128 && xt.notes.length > 20 && xt.notes.every(function (n) { return n[1] === 0.25 && n[2] >= 36 && n[2] <= 51; }),
    "a song can be sent to the sequencer as a drum-notes track", [r21.msg, xt && xt.prog]);
  // ゆらぎ: 同じマスのハイハットでも強さが少しずつちがう
  var e22 = hooked(), lv22 = [];
  e22.store[D.PREFS_KEY] = JSON.stringify({ pat: true, bpm: 120, human: true });
  e22.run("drum", { config: { mode: "free" } }, 250, function (f) {
    var h = e22.window.__drum; if (!h) { return; }
    if (f === 1) { var U = e22.window.UGMelody, s0 = U.synth; U.synth = function (m, p, when, lv) { if (m === 42) { lv22.push(Math.round(lv * 1000)); } return s0.apply(U, arguments); }; }
    if (f === 2) { h().patTap(0); }
  });
  var uniq = lv22.filter(function (v, i, a) { return a.indexOf(v) === i; });
  ok(lv22.length > 10 && uniq.length > 6, "humanize varies the level of each hit", uniq.length);
  // --- §238: シーケンサーの曲とソングをつなぐ ---
  ok(D.secKind("サビ") === "chorus" && D.secKind("Bメロ") === "b" && D.secKind("イントロ") === "intro" && D.secKind("Aメロ") === "a" && D.secKind("アウトロ") === "outro" &&
    D.secPattern("8beat", "chorus") === "g:rock" && D.secPattern("8beat", "b") === "g:beat16" && D.secPattern("bossa", "chorus") === "g:bossa" && D.secPattern("nope", "a") === "g:8beat",
    "section names map to kinds, and each kind picks a pattern from the song's groove");
  var e23 = hooked(), U23 = e23.window.UGUkulele, st23 = U23.seqLoad(), c4 = st23.cur.rows.slice(0, 4);
  st23.cur.rows = [{ type: "sec", name: "Aメロ" }].concat(c4).concat([{ type: "sec", name: "サビ" }]).concat(c4.slice(0, 2));
  st23.cur.tracks.drum.on = true; st23.cur.tracks.drum.groove = "8beat";
  U23.seqSave(st23);
  var fs23 = e23.window.UGDrum.songFromSeq(U23.seqLoad().cur);
  ok(fs23.ok && JSON.stringify(fs23.song) === JSON.stringify([["g:8beat", 3], ["f:toms", 1], ["g:rock", 1], ["f:crash", 1]]) && fs23.bpm === st23.cur.bpm,
    "a song is made from the sequencer's sections (A: 8beat + fill into the chorus, chorus: rock + ending), same length", fs23.song);
  ok(JSON.stringify(D.songFit([["g:8beat", 2], ["f:crash", 1]], 5)) === JSON.stringify([["g:8beat", 4], ["f:crash", 1]]) &&
    JSON.stringify(D.songFit([["g:8beat", 2], ["f:snare", 1], ["g:rock", 3], ["f:crash", 1]], 4)) === JSON.stringify([["g:8beat", 2], ["f:snare", 1], ["f:crash", 1]]),
    "fitting a song to a length keeps the ending and stretches or trims the loops before it");
  // 送る: 曲の長さ（6小節）に合わせる・2回目は同じトラックに上書き・読みもどせる
  var D23 = e23.window.UGDrum, r1 = D23.songSend([["g:8beat", 2], ["f:crash", 1]], "0", "A"), r2 = D23.songSend([["g:rock", 9], ["f:crash", 1]], "0", "B");
  var tr23 = U23.seqLoad().cur.tracks, dn = tr23.xs.filter(function (x) { return tr23[x].preset === "dnotes"; });
  var maxB = Math.max.apply(null, tr23[dn[0]].notes.map(function (n) { return n[0]; })), tk23 = D23.takeFromSeq();
  ok(r1.ok && r2.ok && r2.replaced && dn.length === 1 && r2.bars === 6 && maxB >= 20 && maxB < 24 && tk23.ok && tk23.notes.length === tr23[dn[0]].notes.length,
    "sending fits the song to the sequencer song's length, replaces the earlier drum-notes track, and can be read back as a take", [r2.msg, maxB]);
  ok(D.backEventOn({ track: "x1", kind: "note" }, { tracks: { x1: { prog: 128 } } }, 0, true) === false && D.backEventOn({ track: "x1", kind: "note" }, { tracks: { x1: { prog: 0 } } }, 0, true) === true &&
    D.backEventOn({ track: "x1", kind: "note" }, { tracks: { x1: { prog: 128 } } }, 0, false) === true,
    "'don't play the song's drums' also mutes the drum-notes track in the backing");
  // ピアノロール: ドラム打ち込みトラックは楽器の段
  var sq23 = U23.seqLoad().cur; sq23.tracks.mel.on = false;
  var lay = U23.rollLay(sq23);
  ok(lay.drum && lay.n === 11 && lay.midi(0) === 36 && lay.row(38) === 1 && lay.label(0) === "キック" && lay.midi(11) === -1, "the piano roll shows drum-notes tracks as drum lanes", lay.n);
  // 伴奏といっしょにソング: 伴奏も頭から鳴る
  var e24 = hooked(), ok24 = null;
  e24.store[D.PREFS_KEY] = JSON.stringify({ pat: true, songOpen: true });
  e24.run("drum", { config: { mode: "free", backing: "cur" } }, 60, function (f) {
    var h = e24.window.__drum; if (!h) { return; }
    if (f === 2) { h().act("songplay"); }
    if (f === 30) { var st = h(); ok24 = !!(st.bk && st.patRun && st.patRun.song && st.patRun.song.bk); h().act("songplay"); ok24 = ok24 && !e24.window.__drum().bk && !e24.window.__drum().patRun; }
  });
  ok(ok24 === true, "with backing, the song starts the backing from the top and stopping the song stops it", ok24);
  // --- §240: タイミング補正・3拍子 ---
  var UGm = W.UGMelody, clk = [0, 0.6, 1.2, 1.8, 2.4, 3.0, 3.6, 4.2, 4.8, 5.4];
  ok(UGm.latencyFrom(clk, [0.05, 1.32, 1.92, 2.5, 3.13, 3.72, 9]) === 120 && UGm.latencyFrom(clk, [1.3, 1.9]) === null && UGm.latencyFrom(clk, [1.1, 1.7, 2.3, 2.9]) === 0,
    "latency measuring: the middle offset of taps against the clicks (first two clicks and stray taps ignored, never below 0)");
  // 補正 100ms: 100ms おくれて叩いても PERFECT
  var e25 = hooked(), done25 = {};
  e25.store[UGm.LAT_KEY] = "100";
  e25.run("drum", { config: { mode: "rhythm", song: "8beat", level: "easy", speed: 100 } }, 2000, function () {
    var h = e25.window.__drum; if (!h) { return; }
    var st = h(), k;
    for (k = 0; k < st.rn.length; k++) {
      var n = st.rn[k];
      if (n.j === -2 && st.t >= n.t + 0.095 && !done25[k]) {
        done25[k] = 1;
        var lane = st.chart.lanes.indexOf(n.m), lw = 240 / st.chart.lanes.length;
        e25.ptr("down", lane * lw + lw / 2, 200, 9); e25.ptr("up", lane * lw + lw / 2, 200, 9);
      }
    }
  });
  var s25 = e25.window.__drum();
  ok(s25.ended && s25.counts[0] === s25.rn.length, "with a 100 ms latency setting, hits 100 ms late are judged on time", s25.counts);
  ok(D.patLen("d:waltz") === 12 && D.patLen("f:end3") === 12 && D.patLen("g:8beat") === 16 && D.patLen("g:waltz") === 12 &&
    D.patternList().filter(function (pt) { return pt.group === "3拍子・6/8"; }).length >= 6 && D.patternSteps("g:jwaltz").some(function (x) { return x[0] === 51; }),
    "3/4 and 6/8 patterns are 12 steps a bar (drum-only ones and the sequencer's 3/4 grooves)");
  var sn3 = D.songNotes([["d:waltz", 2], ["f:end3", 1]], "0");
  ok(sn3[sn3.length - 1][0] === 6 && sn3.some(function (n) { return n[0] === 3 && n[1] === 36; }), "song notes use 12-step bars for 3/4 patterns", sn3.slice(-3));
  // 3拍子のループ＋オートフィル4小節（BPM 120 → 1小節 90フレーム）
  var e26 = hooked(), log26 = [];
  e26.store[D.PATPADS_KEY] = JSON.stringify(["d:waltz"]);
  e26.store[D.PREFS_KEY] = JSON.stringify({ pat: true, bpm: 120, autoFill: 4 });
  e26.run("drum", { config: { mode: "free" } }, 470, function (f) {
    var h = e26.window.__drum; if (!h) { return; }
    if (f === 2) { h().patTap(0); }
    var pr = h().patRun, id = pr ? pr.id + "@" + pr.len : "-";
    if (!log26.length || log26[log26.length - 1].split("#")[0] !== id) { log26.push(id + "#" + f); }
  });
  var ids26 = log26.map(function (x) { return x.split("#")[0]; }), fillAt = Number((log26[2] || "").split("#")[1]);
  ok(ids26.join() === "-,d:waltz@12,f:fill3@12,d:waltz@12" && fillAt > 260 && fillAt < 280, "a 3/4 loop has 12-step bars; auto fill uses a 3/4 fill in the 4th bar", log26);
  // 3拍子の曲から
  var e27 = hooked(), U27 = e27.window.UGUkulele, st27 = U27.seqLoad(), c27 = st27.cur.rows.slice(0, 4);
  st27.cur.meter = 3;
  st27.cur.rows = [{ type: "sec", name: "Aメロ" }].concat(c27).concat([{ type: "sec", name: "サビ" }]).concat(c27.slice(0, 2));
  U27.seqSave(st27);
  var fs27 = e27.window.UGDrum.songFromSeq(U27.seqLoad().cur);
  // （全音符の行は3拍子でも4拍なので、Aメロ16拍＝5小節・サビ8拍＝3小節。わりきれないお知らせも出る）
  ok(fs27.ok && JSON.stringify(fs27.song) === JSON.stringify([["d:waltz", 4], ["f:tom3", 1], ["d:waltzbig", 2], ["f:end3", 1]]) && /3拍子/.test(fs27.msg) && /3拍でわりきれない/.test(fs27.msg),
    "a 3/4 sequencer song gets a waltz song with 3/4 fills (bars counted in 3 beats)", [fs27.msg, fs27.song]);
  // --- §241: 切りかえのタイミング・ハイハット ---
  ok(D.switchWait("2", 0, "loop") === 2 && D.switchWait("2", 1, "loop") === 1 && D.switchWait("4", 0, "fill") === 3 && D.switchWait("4", 3, "fill") === 4 &&
    D.switchWait("4", 2, "fill") === 1 && D.switchWait("1", 5, "loop") === 1 && D.switchWait("now", 5, "fill") === 1,
    "switch wait: loops change at the start of a 2/4-bar block, fills play in its last bar");
  function swRun(sw, taps, frames) {
    var e = hooked(), log = [];
    e.store[D.PREFS_KEY] = JSON.stringify({ pat: true, bpm: 120, patSwitch: sw });
    e.run("drum", { config: { mode: "free" } }, frames, function (f) {
      var h = e.window.__drum; if (!h) { return; }
      if (taps[f] !== undefined) { h().patTap(taps[f]); }
      var pr = h().patRun, id = pr ? pr.id : "-";
      if (!log.length || log[log.length - 1][0] !== id) { log.push([id, f]); }
      if (f === frames - 1) { log.push(["q", pr && pr.queue ? pr.queue.id : null]); }
    });
    return log;
  }
  var l2 = swRun("2", { 2: 0, 20: 1 }, 300), l4 = swRun("4", { 2: 0, 20: 10 }, 520), ln = swRun("now", { 2: 0, 50: 1 }, 80), lc = swRun("4", { 2: 0, 20: 1, 30: 1 }, 60);
  ok(l2[2] && l2[2][0] === "g:beat16" && l2[2][1] > 230 && l2[2][1] < 250, "2-bar switching: a new loop starts at the start of bar 3 (not bar 2)", l2);
  ok(l4[2] && l4[2][0] === "f:snare" && l4[2][1] > 350 && l4[2][1] < 370 && l4[3] && l4[3][0] === "g:8beat" && l4[3][1] > 470 && l4[3][1] < 490, "4-bar switching: a fill plays in the 4th bar, then the loop comes back", l4);
  ok(ln[2] && ln[2][0] === "g:beat16" && ln[2][1] >= 50 && ln[2][1] < 56, "'now' switching changes the pattern right away (mid-bar)", ln);
  ok(lc[lc.length - 1][1] === null && lc[1][0] === "g:8beat" && lc.length === 3, "tapping the waiting pad again cancels the switch", lc);
  // オープンHH のパッドを押しているあいだ開く → はなすと閉じる（44）。OFF なら閉じない
  function ohRun(hold) {
    var e = hooked(), snd = [];
    e.store[D.PREFS_KEY] = JSON.stringify({ hhHold: hold });
    e.run("drum", { config: { mode: "free" } }, 30, function (f) {
      if (f === 1) { var U = e.window.UGMelody, s0 = U.synth; U.synth = function (m) { snd.push(m); return s0.apply(U, arguments); }; }
      var c = padXY(1);
      if (f === 3) { e.ptr("down", c[0], c[1], 4); }
      if (f === 12) { e.ptr("up", c[0], c[1], 4); }
    });
    return snd.join();
  }
  // §242: ハイハットの閉じ方の設定を、音を出すときに UGMelody へ
  function hsRun(st) {
    var e = hooked(), got = null;
    e.store[D.PREFS_KEY] = JSON.stringify({ hhStyle: st });
    e.run("drum", { config: { mode: "free" } }, 12, function (f) {
      var c = padXY(1);
      if (f === 3) { e.ptr("down", c[0], c[1], 4); e.ptr("up", c[0], c[1], 4); }
      if (f === 8) { got = e.window.UGMelody.hatClose(); }
    });
    return got;
  }
  var hs1 = hsRun("sizzle"), hs0 = hsRun("nope");
  ok(hs1 === "sizzle" && hs0 === "auto", "the hi-hat close style is saved and handed to the sound engine (unknown → おまかせ)", [hs1, hs0]);
  var oh1 = ohRun(true), oh0 = ohRun(false);
  ok(oh1 === "46,44" && oh0 === "46", "open hi-hat pad: ringing while held, closed (44) when the finger is lifted; OFF keeps the old way", [oh1, oh0]);
  // セットのペダル（左下）: 押しているあいだ ハイハット＝オープン、はなすと閉じる
  var kbp = D.kitBox(58, 300 - 58 - 4), pc = [kbp.x + 18 * kbp.sx, kbp.y + 99 * kbp.sy], e28 = hooked(), snd28 = [];
  ok(D.kitPedal(pc[0], pc[1], kbp) && !D.kitPedal(kc("snare")[0], kc("snare")[1], kbp) && D.kitAt(pc[0], pc[1], kbp) === null, "the hi-hat pedal sits at the kit's lower left, clear of the drums");
  e28.store[D.PREFS_KEY] = JSON.stringify({ kit: true });
  e28.run("drum", { config: { mode: "free" } }, 30, function (f) {
    if (f === 1) { var U = e28.window.UGMelody, s0 = U.synth; U.synth = function (m) { snd28.push(m); return s0.apply(U, arguments); }; }
    var hh = kc("hh");
    if (f === 3) { e28.ptr("down", pc[0], pc[1] * 320 / D.H, 5); }
    if (f === 5) { e28.ptr("down", hh[0], hh[1] * 320 / D.H, 6); e28.ptr("up", hh[0], hh[1] * 320 / D.H, 6); }
    if (f === 10) { e28.ptr("up", pc[0], pc[1] * 320 / D.H, 5); }
    if (f === 15) { e28.ptr("down", hh[0], hh[1] * 320 / D.H, 6); e28.ptr("up", hh[0], hh[1] * 320 / D.H, 6); }
  });
  ok(snd28.join() === "46,44,42", "kit pedal: hold it and the hi-hat rings open, let go and it closes (44); then it is closed (42)", snd28);
};
