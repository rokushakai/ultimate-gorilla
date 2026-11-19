// §345 A25: ハモりづくり（上ハモ・下ハモ・オクターブ・コードの音・対旋律）
"use strict";
var H = require("./harness");
var ok = H.ok;

module.exports = async function () {
  H.suite("harmony");
  var env = H.load(), W = env.window, X = W.UGXmas, D = W.UGDaw, A = W.UGArcade, M = W.UGDawModel, R = H.makeEl("div");
  A.start("daw", R, {});
  D.xmas.host.newSong(X.tplNewProject(X.tplPlan(null, "pop", "new", 1, 1, "full")).project); D.xmas.host.back();
  var p = D.project(), mel = p.tracks[0], c = mel.clips[1], scale = [2, 4, 6, 7, 9, 11, 1];
  c.notes = [[0, 480, 74, 0.8], [480, 480, 76, 0.7], [960, 960, 78, 0.8], [1920, 480, 76, 0.7], [2400, 480, 74, 0.7], [3840, 960, 81, 0.9], [4800, 480, 79, 0.7], [5760, 1920, 78, 0.8]];
  var melKeep = JSON.stringify(mel), all = JSON.stringify(p);
  function plan(k) { return X.harmPlan(p, mel.id, k, "xm-choir"); }
  function pairs(pl) { var out = []; pl.clips.forEach(function (hc) { hc.notes.forEach(function (n) { var at = hc.start + n[0], m = c.notes.filter(function (x) { return c.start + x[0] === at; })[0]; out.push({ h: n[2], m: m ? m[2] : null, at: at }); }); }); return out; }
  function chordAt(at) { var b = M.tickToBar(p, at).bar - 1, id = X.songChords(p)[b]; return id ? X.chordOf(2, id).pcs : null; }
  // 1. どの種類も作れる・同じ入力なら同じ・曲は変わらない
  var ks = X.HARM_KINDS.map(function (k) { return k[0]; }), plans = {};
  ks.forEach(function (k) { plans[k] = plan(k); });
  ok(ks.every(function (k) { return plans[k].ok && plans[k].stats.notes > 0; }) && ks.every(function (k) { return JSON.stringify(plan(k)) === JSON.stringify(plans[k]); }) && JSON.stringify(p) === all, "all 5 kinds make a plan; the same input gives the same notes; making plans changes nothing", ks.map(function (k) { return k + ":" + plans[k].stats.notes; }));
  // 2. 上ハモ: 主旋律の上・3〜9 半音・スケールの音・コードの音を優先
  var up = pairs(plans.up);
  ok(up.length === 8 && up.every(function (x) { return x.h - x.m >= 3 && x.h - x.m <= 9 && scale.indexOf(x.h % 12) >= 0; }) && plans.up.stats.cross === 0 && plans.up.stats.chordRate >= 70, "上ハモ: every note 3–9 semitones above the melody, in the scale, no crossing, mostly chord tones (" + plans.up.stats.chordRate + "%)", up.map(function (x) { return x.m + "→" + x.h; }));
  // 3. 下ハモ
  var dn = pairs(plans.down);
  ok(dn.every(function (x) { return x.m - x.h >= 3 && x.m - x.h <= 9 && scale.indexOf(x.h % 12) >= 0; }) && plans.down.stats.cross === 0, "下ハモ: every note 3–9 semitones below, in the scale, no crossing", dn.map(function (x) { return x.m + "→" + x.h; }));
  // 4. オクターブ
  ok(pairs(plans.oct).every(function (x) { return x.h === x.m - 12; }), "オクターブ: exactly an octave below");
  // 5. コードの音を優先
  var ch = pairs(plans.chord);
  ok(ch.every(function (x) { var pcs = chordAt(x.at); return !pcs || (pcs.indexOf(x.h % 12) >= 0 && x.m - x.h >= 3 && x.m - x.h <= 9); }), "コードの音を優先: each note is a tone of that bar's chord, 3–9 semitones below the melody", ch.map(function (x) { return x.m + "→" + x.h; }));
  // 6. 対旋律: 主旋律が休む拍・のばしている拍だけ・コードの音・メロディのないセクションは埋めない
  var cp = pairs(plans.counter), first = c.start, last = c.start + 5760 + 1920;
  ok(cp.length >= 2 && cp.every(function (x) { var busy = c.notes.some(function (n) { var a = c.start + n[0]; return a <= x.at && x.at < a + Math.min(960, n[1]); }); var pcs = chordAt(x.at); return !busy && pcs && pcs.indexOf(x.h % 12) >= 0 && x.at >= first && x.at < last; }), "対旋律: only on beats where the melody rests or holds, chord tones, only inside the melody's phrase", cp.map(function (x) { return (x.at - c.start) / 960 + ":" + x.h; }));
  // 跳躍の目安
  ok(ks.every(function (k) { return plans[k].stats.maxLeap <= 12 && plans[k].stats.leaps <= 2; }), "the harmony lines move smoothly (largest leap ≤ an octave; few leaps over a fifth)", ks.map(function (k) { return k + ":" + plans[k].stats.maxLeap; }));
  // 7. キーのない曲
  var ek = p.ext.xmKey; delete p.ext.xmKey; var nk = X.harmPlan(p, mel.id, "up", "xm-choir"), no = X.harmPlan(p, mel.id, "oct", "xm-choir"); p.ext.xmKey = ek;
  ok(!nk.ok && /キーがない/.test(nk.why) && no.ok, "a song without a key: scale-based kinds give a reason; the octave still works");
  ok(!X.harmPlan(p, p.tracks.filter(function (t) { return M.isDrum(t); })[0].id, "up").ok, "a drum track cannot be the melody");
  // 8. 新しいトラックとして足す（主旋律のすぐ下・同じ音符・元は同じ・↶）
  var nT = p.tracks.length, snap = D.xmas.host.snapAll(), ap = X.harmApply(p, plans.up); D.xmas.host.commit(snap, "harm", ap.track.id);
  var ht = p.tracks[1], hn = []; ht.clips.forEach(function (hc) { hc.notes.forEach(function (n) { hn.push([hc.start + n[0], n[2]]); }); });
  ok(ap.ok && p.tracks.length === nT + 1 && ht === ap.track && ht.ext.harm.src === mel.id && ht.ext.harm.kind === "up" && ht.ext.xm === "xm-choir" && JSON.stringify(hn) === JSON.stringify(up.map(function (x) { return [x.at, x.h]; })) && JSON.stringify(p.tracks[0]) === melKeep, "added as a new track right below the melody, with the planned notes and the chosen sound; the melody unchanged");
  // 9. MIDI・ステム・Cubasis・保存
  var ex = M.midiExport(p), rd = M.midiRead(ex.bytes, "h.mid"), part = rd.parts.filter(function (x0) { return x0.name === ht.name; })[0], sp = D.stem.plan(), info = D.handoff.info();
  ok(ex.ok && part && part.notes.length === 8 && sp.list.some(function (x0) { return x0.id === ht.id && x0.has; }) && info.tracks.some(function (x0) { return x0.name === ht.name && x0.midi && x0.stem; }), "the harmony track is in the MIDI file (8 notes), the stems and the Cubasis sheet");
  var back = M.fromRecord(JSON.parse(JSON.stringify(M.toRecord(p, Date.now())))).project;
  ok(JSON.stringify(back.tracks[1].clips.map(function (x0) { return x0.notes; })) === JSON.stringify(ht.clips.map(function (x0) { return x0.notes; })) && back.tracks[1].ext.harm.kind === "up", "save → restore keeps the harmony track and its notes");
  D.xmas.host.undo();
  ok(D.project().tracks.length === nT && JSON.stringify(D.project().tracks[0]) === melKeep, "↶ removes the added harmony track");
  // 10. 画面
  X.ui.tab = "harm"; X.ui.hkind = "down"; X.ui.hsrc = ""; var hh = X.harmTab(D.xmas.host);
  ok((hh.match(/data-xhkind="/g) || []).length === 5 && (hh.match(/data-xhsnd="/g) || []).length === 5 && /data-xm="hAdd"/.test(hh) && /下ハモ/.test(hh) && /機械の目安/.test(hh) && /data-xhsrc="/.test(hh), "the ハモり tab: melody choice, 5 kinds, 5 sounds, the plan with its numbers, ▶ and 新しいトラックとして足す");
  X.ui.tab = "tpl"; X.ui.hkind = "";
  A.stop();
};
