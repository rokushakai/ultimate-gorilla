// §345 A30: ミックスの補助（範囲・トラック・役割・診断とおすすめ・試聴の上書き・採用・↶／↷・画面）
"use strict";
var H = require("./harness");
var ok = H.ok;

module.exports = async function () {
  H.suite("mixa");
  var env = H.load(), W = env.window, X = W.UGXmas, D = W.UGDaw, A = W.UGArcade, M = W.UGDawModel, R = H.makeEl("div");
  A.start("daw", R, {});
  function song(id, form) { D.xmas.host.newSong(X.tplNewProject(X.tplPlan(null, id || "pop", "new", 1, 1, form || "full")).project); D.xmas.host.back(); return D.project(); }
  var p = song(), L = M.sectionsOf(p);
  // 1. 範囲
  var rg = D.mixa.range("loud"), last = L.filter(function (s) { return s.name === "ラストサビ"; })[0];
  ok(rg.a === last.tick && rg.b === Math.min(last.tick + last.len, M.barToTick(p, M.tickToBar(p, last.tick).bar - 1 + 8)) && /ラストサビ/.test(rg.name), "range: the first 8 bars of the loudest section (ラストサビ)", rg);
  var ra = D.mixa.range("all");
  ok(ra.a === 0 && ra.b === M.songEndTick(p), "range: the whole song when chosen");
  var rp = D.mixa.rangePlan(rg.a, rg.b);
  ok(rp.ok && rp.a === rg.a && rp.endTick === rg.b && Math.abs(rp.music - (M.tickToSec(p, rg.b) - M.tickToSec(p, rg.a))) < 1e-6 && rp.frames === Math.ceil((rp.music + 1.5) * 44100), "the render plan for a range: only that part plus 1.5 s");
  // 2. トラックと役割
  var ts = D.mixa.tracks("loud"), roles = {}; ts.forEach(function (t) { roles[t.name] = D.mixa.role(t); });
  ok(ts.length >= 5 && roles["ベース"] === "bass" && roles["ドラム"] === "drum" && roles["エレピ"] === "keys" && roles["ストリングス"] === "str", "tracks with sound in the range, and their roles", roles);
  var mt = p.tracks[0]; ok(D.mixa.role(mt) === "melody", "the melody track is the melody");
  p.tracks.filter(function (t) { return t.name === "ベース"; })[0].mute = true;
  ok(!D.mixa.tracks("loud").some(function (t) { return t.name === "ベース"; }), "a muted track is not measured");
  p.tracks.filter(function (t) { return t.name === "ベース"; })[0].mute = false;
  // 3. 診断とおすすめ（合成の数字）
  function tr(name) { return p.tracks.filter(function (t) { return t.name === name; })[0]; }
  function row(name, rms, peak, extra) { var t = tr(name), o = { id: t.id, name: name, role: D.mixa.role(t), rms: rms, peak: peak, lr: 0, clip: 0, vol: t.vol, pan: t.pan }, k; for (k in extra || {}) { o[k] = extra[k]; } return o; }
  mt.clips[1].notes = [[0, 960, 74, 0.8]];
  var base = { range: rg, master: { peak: -6, rms: -18, lr: 0.4, clip: 0 }, tracks: [row(mt.name, -20, -8), row("ドラム", -22, -9), row("ベース", -24, -10), row("エレピ", -27, -12), row("ストリングス", -28, -14)] };
  var a0 = D.mixa.advise(base);
  ok(a0.sug.length === 0 && a0.diag.every(function (d) { return d.lv !== "warn"; }) && a0.diag.some(function (d) { return /音割れなし/.test(d.text); }), "balanced (each within 3 dB of its role target): no suggestion, no warning");
  var b1 = JSON.parse(JSON.stringify(base)); b1.tracks[2].rms = -18; var a1 = D.mixa.advise(b1), sb = a1.sug.filter(function (s) { return s.name === "ベース"; })[0], bv = tr("ベース").vol;
  ok(sb && sb.kind === "vol" && sb.to === Math.round(bv * Math.pow(10, -6 / 20)) && Math.abs(sb.db + 6) < 0.6 && /目安/.test(sb.why), "bass 6 dB too loud → lower its volume about 6 dB (with the reason, called a 目安)", sb);
  var b2 = JSON.parse(JSON.stringify(base)); b2.master = { peak: 0, rms: -12, lr: 0, clip: 120 }; var a2 = D.mixa.advise(b2), sm = a2.sug.filter(function (s) { return s.kind === "master"; })[0], mv = p.master && p.master.vol !== undefined ? p.master.vol : 80;
  ok(a2.diag[0].lv === "warn" && /音割れ/.test(a2.diag[0].text) && sm && sm.to === Math.max(1, Math.round(mv * Math.pow(10, -1.5 / 20))), "master clipping: a warning and lowering the master so the peak is about −1.5 dBFS", sm);
  var b3 = JSON.parse(JSON.stringify(base)); b3.master.lr = 4; tr("エレピ").pan = -0.8; b3.tracks[3].pan = -0.8; var a3 = D.mixa.advise(b3), sp = a3.sug.filter(function (s) { return s.kind === "pan"; })[0];
  ok(a3.diag.some(function (d) { return /左に 4dB/.test(d.text); }) && sp && sp.name === "エレピ" && sp.to === -0.4, "4 dB more on the left: move the left-panned track halfway to the center", sp);
  tr("エレピ").pan = 0;
  M.autoSet(p, tr("ベース"), "vol", 0, 50); var a4 = D.mixa.advise(b1);
  ok(!a4.sug.some(function (s) { return s.name === "ベース"; }), "a track whose volume is automated gets no volume suggestion");
  tr("ベース").auto = [];
  var b5 = JSON.parse(JSON.stringify(base)); b5.tracks.shift(); b5.tracks[0].rms = -12; var a5 = D.mixa.advise(b5);
  ok(a5.sug.length >= 1 && !a5.sug.some(function (s) { return s.name === "ドラム"; }) && a5.sug.every(function (s) { return s.kind === "vol" && s.db > 0; }) && a5.sug.some(function (s) { return /上げきれない/.test(s.why); }), "without a melody the loudest track (drums) is the reference: the others are raised (and it says when 100 is not enough)", a5.sug);
  var b6 = JSON.parse(JSON.stringify(base)); b6.tracks[4].clip = 5; var a6 = D.mixa.advise(b6);
  ok(a6.diag.some(function (d) { return /「ストリングス」だけで音割れ/.test(d.text); }), "a single track that clips by itself is named");
  ok([a0, a1, a2, a3, a5].every(function (a) { return JSON.stringify(a).indexOf("プロ") < 0; }), "the advice never says it is professional quality");
  // 4. 上書き・採用・↶／↷
  var ov = D.mixa.ov(a1, null), sel = D.mixa.ov(a1, a1.sug.map(function () { return false; }));
  ok(ov[tr("ベース").id] && ov[tr("ベース").id].vol === sb.to && Object.keys(sel).length === 0, "preview B overrides only the chosen suggestions (nothing chosen → nothing)");
  var keep = JSON.stringify({ t: p.tracks, m: p.master });
  D.mixa.open("mix"); D.mixa.set(b1);
  ok(JSON.stringify({ t: D.project().tracks, m: D.project().master }) === keep && /data-mas="0"/.test(R.innerHTML) && /data-ma="pa"/.test(R.innerHTML) && /data-ma="pb"/.test(R.innerHTML) && /data-ma="apply"/.test(R.innerHTML), "the result screen: suggestions with check boxes, ▶ A / ▶ B, use; the song unchanged");
  ok(/プロの品質」かどうかは数字だけでは決まりません/.test(R.innerHTML) && /診断（測った数字）/.test(R.innerHTML) && /おすすめ（音楽の目安/.test(R.innerHTML), "it separates 診断 (numbers) from おすすめ (musical 目安) and says numbers alone do not decide quality");
  D.mixa.act("apply");
  ok(tr("ベース").vol === sb.to && D.mixa.state().res === null, "使う: the chosen suggestions are applied");
  D.xmas.host.undo();
  ok(JSON.stringify({ t: D.project().tracks, m: D.project().master }) === keep, "↶ undoes it exactly");
  D.redo(); ok(D.project().tracks.filter(function (t) { return t.name === "ベース"; })[0].vol === sb.to, "↷ redoes it");
  // 5. 画面のつながり
  D.showMixer ? D.showMixer() : D.mixer && D.mixer.show ? D.mixer.show() : 0;
  X.ui.tab = "fin"; var fh = X.finishTab(D.xmas.host);
  ok(/data-xm="fMixa"/.test(fh), "仕上げ: a 🩺 button");
  D.xmas.host.go("mixa"); ok(/ミックスの補助/.test(R.innerHTML) && D.mixa.state().from === "fin", "仕上げ → 🩺 opens the mix assistant (back goes to 仕上げ)");
  X.ui.tab = "tpl";
  // 6. Node（書き出しの道具がない）では「測る」が失敗を正しく伝える
  var keepRun = JSON.stringify({ t: D.project().tracks, m: D.project().master }), nT = D.mixa.tracks("loud").length;
  D.mixa.act("run"); var waited = 0; while (D.mixa.state().busy && waited < 60000) { await new Promise(function (r) { setTimeout(r, 200); }); waited += 200; }
  var stR = D.mixa.state();
  ok(!stR.busy && stR.state === "done" && stR.res && stR.res.master && stR.res.tracks.length === nT && stR.adv && stR.adv.diag.length >= 2 && JSON.stringify({ t: D.project().tracks, m: D.project().master }) === keepRun, "測る: master + " + nT + " tracks one by one (" + waited + " ms); diagnosis made; the song unchanged", stR.state + " " + stR.msg);
  A.stop();
};
