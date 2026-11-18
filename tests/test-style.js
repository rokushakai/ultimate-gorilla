// §345 A14: Style Match の解析を、入力の種類ごとに確かめる（音はすべて tests/style-corpus.js で合成・実演奏の代わりではない）
"use strict";
var H = require("./harness");
var ok = H.ok;
var C = require("./style-corpus");

module.exports = async function () {
  H.suite("style");
  var env = H.load(), W = env.window, X = W.UGXmas;
  function cond0() { return { bpm: 0, meter: "", genre: "", moods: [], fam: "", bright: "", kmode: "", vocal: false, key: -1 }; }
  var res = C.corpus().map(function (o) { var a = X.styleAnalyze([C.make(o)], C.SR); return { o: o, a: a, c: X.analysisToCond(a, cond0()) }; });
  var music = res.filter(function (r) { return !r.o.none; }), none = res.filter(function (r) { return r.o.none; });
  function exB(o) { return o.meter === "6/8" || o.meter === "12/8" ? o.bpm * 1.5 : o.bpm; } // 6/8・12/8 は付点 4 分の速さ → 4 分音符の BPM
  function tol(o) { return o.drift ? 0.07 : 0.04; }
  function bpmOk(o, v) { return Math.abs(v / exB(o) - 1) < tol(o); }
  // 1. まちがった値を条件に入れない（確かなものだけ入れる）
  var wrong = music.filter(function (r) { var o = r.o, c = r.c; return (c.bpm && !bpmOk(o, c.bpm)) || (c.meter && c.meter !== o.meter) || (c.key >= 0 && !(c.key === o.key[0] && c.kmode === o.key[1])); });
  ok(wrong.length === 0, "no wrong tempo, meter or key is put into the conditions (" + music.length + " synthetic performances)", wrong.map(function (r) { return [r.o.id, r.c.bpm, r.c.meter, r.c.key, r.c.kmode]; }));
  // 2. 無音・ノイズ・50Hz のうなり: 断るか、何も入れない
  ok(none.every(function (r) { return !r.a.ok || (r.c.bpm === 0 && r.c.meter === "" && r.c.key === -1 && r.c.bright === ""); }) && !none[0].a.ok, "silence is refused; white noise, pink noise and 50 Hz hum put nothing into the conditions", none.map(function (r) { return [r.o.id, r.a.ok ? [r.a.bpm.conf, r.a.meter.conf, r.a.key.conf, r.a.sig.beat, r.a.sig.tonal] : r.a.why]; }));
  // 3. 正解は候補に入る
  var miss = music.filter(function (r) { var a = r.a, o = r.o; return !a.bpm.cands.some(function (z) { return bpmOk(o, z.v); }) || !a.meter.cands.some(function (z) { return z.v === o.meter; }); });
  var kmiss = music.filter(function (r) { return !r.a.key.cands.some(function (z) { return z.v === r.o.key[0] && z.mode === r.o.key[1]; }); });
  ok(miss.length <= 1 && kmiss.length <= 2, "the right tempo and meter are among the candidates (all but " + miss.length + "); the right key too (all but " + kmiss.length + ")", [miss.map(function (r) { return r.o.id; }), kmiss.map(function (r) { return r.o.id; })]);
  // 4. よく当たる（合成の音で）: いちばん上の答え
  var nB = music.filter(function (r) { return bpmOk(r.o, r.a.bpm.v); }).length, nM = music.filter(function (r) { return r.a.meter.v === r.o.meter; }).length, nK = music.filter(function (r) { return r.a.key.v === r.o.key[0] && r.a.key.mode === r.o.key[1]; }).length;
  ok(nB >= 22 && nM >= 21 && nK >= 22, "top answers on the synthetic set: tempo " + nB + " / meter " + nM + " / key " + nK + " of " + music.length, [nB, nM, nK]);
  // 5. 半分・倍・3:2 の取りちがえは、信頼度が低く、正解が候補にある
  var hd = music.filter(function (r) { return !bpmOk(r.o, r.a.bpm.v); });
  ok(hd.every(function (r) { return r.a.bpm.conf < 0.6 && (r.o.kind === "hum" || r.a.bpm.cands.some(function (z) { return bpmOk(r.o, z.v); })); }), "when the tempo is half / double / 3:2, the confidence is low and (except humming) the right tempo is a candidate", hd.map(function (r) { return [r.o.id, r.a.bpm.v, r.a.bpm.conf]; }));
  // 6. 6/8: ストロークは 6/8・4 分音符の BPM（付点 4 分の 1.5 倍）。3/4 と区別できないときは信頼度を下げて 6/8 を候補に
  var s68 = music.filter(function (r) { return r.o.meter === "6/8"; });
  ok(s68.filter(function (r) { return r.o.kind === "strum"; }).every(function (r) { return r.a.meter.v === "6/8" && bpmOk(r.o, r.a.bpm.v) && r.a.swing.v === 0; }) && s68.every(function (r) { return r.a.meter.v === "6/8" || (r.a.meter.conf < 0.6 && r.a.meter.cands.some(function (z) { return z.v === "6/8"; })); }), "6/8 strumming is found as 6/8 (not as swing); a 6/8 arpeggio that looks like 3/4 has low confidence and 6/8 as a candidate", s68.map(function (r) { return [r.o.id, r.a.meter.v, r.a.meter.conf, r.a.bpm.v]; }));
  ok(music.filter(function (r) { return r.o.meter === "3/4"; }).every(function (r) { return r.a.meter.v !== "6/8" || r.a.meter.conf < 0.6; }), "3/4 is never taken for 6/8 with confidence");
  // 7. 鼻歌: テンポ・拍子の信頼度は低い（入れない）・調は入れるならあっている
  var hums = music.filter(function (r) { return r.o.kind === "hum"; });
  ok(hums.every(function (r) { return r.a.bpm.conf < 0.3 && r.a.meter.conf < 0.3 && r.c.bpm === 0 && r.c.meter === ""; }), "humming: tempo and meter have low confidence and are not put in", hums.map(function (r) { return [r.o.id, r.a.bpm.conf, r.a.meter.conf, r.a.sig.sharp]; }));
  // 8. 不規則な演奏: 拍のずれで信頼度が下がる
  var loose = music.filter(function (r) { return r.o.jitter; }), tight = music.filter(function (r) { return r.o.kind === "strum" && !r.o.jitter && r.o.meter === "4/4" && r.o.bpm === 96; })[0];
  ok(loose.every(function (r) { return r.a.sig.spread > tight.a.sig.spread; }) && loose.some(function (r) { return r.a.bpm.conf < 0.6; }), "irregular playing: a larger timing spread than steady playing, lower confidence", loose.map(function (r) { return [r.o.id, r.a.sig.spread, r.a.bpm.conf]; }));
  // 9. 歌＋ウクレレ: 調は前半・後半でそろう・信頼度が低いときは入れない
  var voc = music.filter(function (r) { return r.o.kind === "vocal"; });
  ok(voc.every(function (r) { return (r.a.key.v === r.o.key[0] && r.a.key.mode === r.o.key[1]) || r.c.key === -1; }), "voice + ukulele: the key is right, or (when unsure, e.g. the relative minor) it is not put in", voc.map(function (r) { return [r.o.id, r.a.key.name, r.a.key.conf, r.a.key.stab]; }));
  // 10. 同じ音なら同じ答え（決まった計算）
  var o1 = C.corpus()[1], r1 = X.styleAnalyze([C.make(o1)], C.SR), r2 = X.styleAnalyze([C.make(o1)], C.SR);
  ok(JSON.stringify(r1) === JSON.stringify(r2), "the same sound gives the same answer");
  // 12. サンプリング周波数（48kHz にした同じ音）でも、まちがいを入れない・調はほぼ同じ
  function up(d, f) { var u = new Float32Array(Math.floor(d.length * f)), i; for (i = 0; i < u.length; i++) { var p = i / f, j = Math.floor(p), q = p - j; u[i] = (d[j] || 0) * (1 - q) + (d[j + 1] || 0) * q; } return u; }
  var r48 = music.map(function (r) { var a = X.styleAnalyze([up(C.make(r.o), 48000 / 22050)], 48000); return { o: r.o, a: a, c: X.analysisToCond(a, cond0()) }; });
  var w48 = r48.filter(function (r) { var o = r.o, c = r.c; return (c.bpm && !bpmOk(o, c.bpm)) || (c.meter && c.meter !== o.meter) || (c.key >= 0 && !(c.key === o.key[0] && c.kmode === o.key[1])); });
  var k48 = r48.filter(function (r) { return r.a.key.v === r.o.key[0] && r.a.key.mode === r.o.key[1]; }).length;
  ok(w48.length === 0 && k48 >= 22, "the same sounds at 48 kHz (as Chrome decodes files): nothing wrong is put in, key right in " + k48 + " of " + music.length, w48.map(function (r) { return r.o.id; }));
  // 13. §345 A18: 12/8・速いストローク・スイングと 12/8・音程のゆれる鼻歌と歌
  function one(id) { return res.filter(function (r) { return r.o.id === id; })[0]; }
  var s128 = one("strum128-60"), f160 = one("strum44-160"), sw96 = one("swing-96"), hw = one("hum-wobble-80"), vw = one("vocal-wobble-100");
  ok(s128.a.meter.v === "12/8" && bpmOk(s128.o, s128.a.bpm.v) && s128.a.swing.v === 0, "12/8 strumming → 12/8 (not 6/8), BPM 90 in quarter notes", [s128.a.meter.v, s128.a.meter.cands, s128.a.bpm.v]);
  ok(f160.a.bpm.cands.some(function (z) { return z.v === 160; }) && (f160.a.bpm.v === 160 || (f160.a.bpm.conf < 0.6 && f160.c.bpm === 0)) && f160.a.meter.conf <= 0.5, "fast strumming at 160: 160 is a candidate; when 80 is on top it is not put in, and the meter waits for the tempo", [f160.a.bpm.v, f160.a.bpm.conf, f160.a.bpm.cands]);
  ok(sw96.a.swing.v >= 60 && sw96.a.meter.cands.some(function (z) { return z.v === "12/8"; }), "a swing at 96: swing, and 12/8 is offered as a candidate (a shuffle can be written in 12/8)", [sw96.a.swing, sw96.a.meter.cands]);
  ok(hw.c.bpm === 0 && hw.c.meter === "" && (hw.c.key === -1 || hw.c.key === hw.o.key[0]) && hw.a.bpm.conf < 0.3, "humming with a wobbly pitch: no tempo / meter put in, the key only if right", [hw.a.bpm.conf, hw.a.key.name, hw.a.key.conf]);
  ok(vw.a.key.v === vw.o.key[0] && vw.a.key.mode === vw.o.key[1], "voice with a wobbly pitch over the ukulele: the key is still right", [vw.a.key.name, vw.a.key.conf]);
  X.ui.mcond = cond0(); X.ui.mcond.bpm = 120;
  var hx2 = X.analysisHtml(sw96.a), hx3 = X.analysisHtml(one("hum-90").a);
  ok(hx2.indexOf('data-xmcand="bpm:60"') >= 0 && hx2.indexOf('data-xmcand="bpm:240"') >= 0 && /はねるリズム/.test(hx2) && /12\/8/.test(hx2) && /どれも自信が低い/.test(hx3), "the result shows ½ / ×2 for the chosen BPM, a swing / 12/8 note, and 'nothing is sure' for unclear humming");
  X.ui.mcond = null;
  var sw48 = r48.filter(function (r) { return r.o.swing; });
  ok(sw48.length >= 2 && sw48.every(function (r) { return r.a.swing.v >= 60 || r.a.bpm.conf < 0.6; }) && r48.filter(function (r) { return r.o.id === "swing-96"; })[0].a.swing.v >= 60, "swing is still found at 48 kHz (the swing at 96; the swing at 112 is either found or its tempo is unsure)", sw48.map(function (r) { return [r.o.id, r.a.swing.v, r.a.bpm.v]; }));
  // 11. 候補のボタン
  var hx = X.analysisHtml(res.filter(function (r) { return r.o.id === "swing-112"; })[0].a);
  ok((hx.match(/data-xmcand="bpm:/g) || []).length >= 2 && hx.indexOf('data-xmcand="bpm:112"') >= 0 && (hx.match(/data-xmcand="meter:/g) || []).length >= 2 && (hx.match(/data-xmcand="key:/g) || []).length === 3 && hx.indexOf("実際の演奏での当たり方は確かめていません") >= 0, "the result shows candidate buttons (tempo incl. 112 for a swing at 112 found as 56, meter, 3 keys) and says it was checked only with synthetic sound");
};
