// §345 A28: オートメーションを広げる（Expression・Modulation・グラフの編集・コピーと貼り付け・MIDI の CC）
"use strict";
var H = require("./harness");
var ok = H.ok;

module.exports = async function () {
  H.suite("auto2");
  var env = H.load(), W = env.window, X = W.UGXmas, D = W.UGDaw, A = W.UGArcade, M = W.UGDawModel, R = H.makeEl("div");
  A.start("daw", R, {});
  function song() { D.xmas.host.newSong(X.tplNewProject(X.tplPlan(null, "pop", "new", 1, 1, "std")).project); D.xmas.host.back(); return D.project(); }
  // MIDI のバイト → トラックごとの CC [[tick, ch, cc, v]]
  function ccs(b) {
    var pos = 14, out = [];
    function vlq(i) { var v = 0, c; do { c = b[i++]; v = (v << 7) | (c & 127); } while (c & 128); return [v, i]; }
    while (pos < b.length) {
      var len = (b[pos + 4] << 24) | (b[pos + 5] << 16) | (b[pos + 6] << 8) | b[pos + 7], e = pos + 8 + len, i = pos + 8, rs = 0, tick = 0, L = [];
      while (i < e) { var r = vlq(i); i = r[1]; tick += r[0]; var s0 = b[i]; if (s0 === 0xFF) { var l2 = vlq(i + 2); i = l2[1] + l2[0]; continue; } if (s0 & 128) { rs = s0; i++; } var hi = rs & 0xF0; if (hi === 0xB0) { L.push([tick, rs & 15, b[i], b[i + 1]]); i += 2; } else if (hi === 0xC0 || hi === 0xD0) { i += 1; } else { i += 2; } }
      out.push(L); pos = e;
    }
    return out;
  }
  // 1. 対象
  ok(M.AUTO_ORDER.join() === "vol,pan,expr,mod,eq.low,eq.mid,eq.high" && M.AUTO_TARGETS.expr.cc === 11 && M.AUTO_TARGETS.mod.cc === 1 && M.AUTO_TARGETS.mod.midiOnly && !M.AUTO_TARGETS.expr.midiOnly && M.AUTO_TARGETS.vol.cc === 7 && M.AUTO_TARGETS.pan.cc === 10 && !M.AUTO_TARGETS["eq.low"].cc, "targets: volume CC7, pan CC10, Expression CC11 (sound), Modulation CC1 (MIDI only), EQ (no CC)");
  var p = song(), t = p.tracks[1];
  ok(M.autoNow(t, "expr", 0) === 100 && M.autoNow(t, "mod", 0) === 0, "with no lane: Expression 100, Modulation 0");
  // 2. 点を動かす
  M.autoSet(p, t, "expr", 0, 100); M.autoSet(p, t, "expr", 3840, 40); M.autoSet(p, t, "expr", 7680, 80);
  var mv = M.autoMove(p, t, "expr", 3840, 4800, 0.5), lane = M.autoLane(t, "expr");
  ok(mv.ok && JSON.stringify(lane.points.map(function (q) { return q[0]; })) === "[0,4800,7680]" && lane.points[1][1] === 0.5, "autoMove moves a point (position and value)");
  ok(!M.autoMove(p, t, "expr", 4800, 7680).ok && !M.autoMove(p, t, "expr", 4800, -5).ok && !M.autoMove(p, t, "expr", 999, 10).ok, "it refuses an occupied place, a place outside the song, a missing point");
  // 3. コピーと貼り付け
  var cp = M.autoCopy(t, "expr", 0, 7680);
  ok(cp && cp.n === 2 && cp.span === 7680 && cp.pts[1][0] === 4800, "autoCopy copies the points in the range (relative positions)");
  var ps = M.autoPaste(p, t, "expr", 7680, cp);
  ok(ps.ok && ps.added === 2 && ps.removed === 1 && JSON.stringify(lane.points.map(function (q) { return q[0]; })) === "[0,4800,7680,12480]", "autoPaste replaces the points in the target range", ps);
  ok(!M.autoPaste(p, t, "vol", 0, cp).ok, "pasting into another kind of value is refused");
  var t2 = p.tracks[2], ps2 = M.autoPaste(p, t2, "expr", 0, cp);
  ok(ps2.ok && M.autoLane(t2, "expr").points.length === 2, "the same kind can be pasted to another track");
  var big = { target: "expr", pts: [], span: 3840 * 70 }, q; for (q = 0; q < 70; q++) { big.pts.push([q * 3840, 0.5, "lin"]); }
  var ps3 = M.autoPaste(p, t2, "expr", 0, big);
  ok(ps3.ok && M.autoLane(t2, "expr").points.length === 64 && ps3.dropped === 6, "at most 64 points; the rest are counted as dropped", ps3);
  // 4. CC の値
  ok(M.autoCC("vol", M.autoNorm("vol", 80)) === Math.round(80 * 1.27) && M.autoCC("pan", M.autoNorm("pan", -1)) === 1 && M.autoCC("pan", M.autoNorm("pan", 0)) === 64 && M.autoCC("pan", M.autoNorm("pan", 1)) === 127 && M.autoCC("expr", 1) === 127 && M.autoCC("mod", M.autoNorm("mod", 64)) === 64 && M.autoCC("eq.low", 0.5) === null, "CC values match the fader numbers the MIDI already used (CC7 = volume × 1.27, CC10 = 64 + pan × 63)");
  var la = { points: [[0, 0, "lin"], [960, 1, "lin"], [1920, 0.5, "step"], [2880, 0.5, "lin"]] }, ce = M.autoCCEvents(la, "expr", 3840);
  ok(ce[0][0] === 0 && ce[0][1] === 0 && ce.some(function (e) { return e[0] === 480 && e[1] === 64; }) && ce.filter(function (e) { return e[0] > 960 && e[0] < 1920; }).length === 0 && ce.some(function (e) { return e[0] === 1920 && e[1] === 64; }) && ce.every(function (e, i) { return !i || e[1] !== ce[i - 1][1]; }), "the line becomes CC every 16th (only when the value changes); a step point jumps", ce.slice(0, 6));
  // 5. MIDI の書き出し
  p = song(); var ex0 = M.midiExport(p), c0 = ccs(ex0.bytes);
  ok(c0.slice(1).every(function (L) { return L.length === 2 && L[0][0] === 0 && L[0][2] === 7 && L[1][2] === 10; }), "without automation: only the fader CC7 and CC10 at the start (as before)");
  t = p.tracks.filter(function (x) { return !M.isDrum(x) && x.clips.some(function (c) { return c.notes.length; }); })[0]; var tn = t.name; M.autoSet(p, t, "vol", 0, 80); M.autoSet(p, t, "vol", 7680, 20); M.autoSet(p, t, "pan", 0, -0.5); M.autoSet(p, t, "expr", 3840, 100); M.autoSet(p, t, "expr", 11520, 30); M.autoSet(p, t, "mod", 0, 0); M.autoSet(p, t, "mod", 3840, 100); M.autoSet(p, t, "eq.low", 0, 6);
  var ex = M.midiExport(p), cc = ccs(ex.bytes), ti = ex.info.tracks.map(function (x) { return x.name; }).indexOf(tn) + 1, L = cc[ti], by = {};
  L.forEach(function (e) { (by[e[2]] = by[e[2]] || []).push(e); });
  ok(ex.ok && by[7] && by[7][0][0] === 0 && by[7][0][3] === Math.round(80 * 1.27) && by[7][by[7].length - 1][3] === Math.round(20 * 1.27) && by[7].filter(function (e) { return e[0] === 0; }).length === 1, "volume automation → CC7 line (no extra fader CC7 at the start)", by[7] && by[7].slice(0, 3));
  ok(by[10] && by[10].length === 1 && by[10][0][3] === Math.round(64 - 0.5 * 63) && by[11] && by[11][by[11].length - 1][3] === Math.round(0.3 * 127) && by[1] && by[1][by[1].length - 1][3] === 100, "pan → CC10, Expression → CC11, Modulation → CC1", [by[10], by[11] && by[11].length, by[1] && by[1].length]);
  ok(!L.some(function (e) { return [7, 10, 11, 1].indexOf(e[2]) < 0; }) && L.every(function (e) { return e[1] === L[0][1]; }) && ex.info.autoEq === 1 && ex.info.cc.mod === by[1].length, "EQ is not written as a CC (counted as not included); every CC is on the track's channel", ex.info.cc);
  var rd = M.midiRead(ex.bytes, "a.mid");
  ok(rd.parts.length === ex.info.tracks.length && rd.bars === M.midiRead(ex0.bytes, "b.mid").bars, "the MIDI still reads back with the same tracks and bars");
  var hs = D.handoff && D.handoff.info ? JSON.stringify(D.handoff.info()) : "";
  // 6. 効いていないレーン
  p = song(); t = p.tracks[1]; var b0 = JSON.stringify(M.midiExport(p).bytes);
  M.autoSet(p, t, "expr", 0, 30); M.autoOn(t, "expr", false);
  ok(!M.autoActive(t, "expr") && JSON.stringify(M.midiExport(p).bytes) === b0, "a lane turned OFF changes nothing (MIDI identical)");
  // 7. 画面
  p = song(); t = p.tracks[1]; D.showAuto(t.id, "vol");
  ok((R.innerHTML.match(/data-aut="/g) || []).length === 7 && /data-au="redo"/.test(R.innerHTML) && /data-au="snap:960"/.test(R.innerHTML) && /data-au="copy"/.test(R.innerHTML) && /CC7/.test(R.innerHTML), "📈: 7 kinds, ↷, grid, copy, the MIDI note");
  D.showAuto(t.id, "mod");
  ok(/MIDI だけ/.test(R.innerHTML) && /鳴り方は変わりません/.test(R.innerHTML), "Modulation says clearly: MIDI only, the Gorilla sound does not change");
  D.showAuto(t.id, "expr");
  var end = M.songEndTick(p), r1 = D.auEdit.tap(0.5, 0.25, 14), st1 = D.auState().au, ln = M.autoLane(D.project().tracks[1], "expr");
  ok(r1.ok && r1.added && ln.points.length === 1 && ln.points[0][0] % 960 === 0 && Math.abs(ln.points[0][0] - end / 2) <= 480 && st1.sel === ln.points[0][0] && M.autoReal("expr", ln.points[0][1]) === 77, "tap on the graph adds a point at the grid (1 beat) and selects it", [ln.points[0], end]);
  var sel0 = st1.sel, r2 = D.auEdit.tap(sel0 / end, (1 - ln.points[0][1]) * (88 / 96) + 4 / 96, 14);
  ok(r2.ok && r2.sel === sel0 && M.autoLane(D.project().tracks[1], "expr").points.length === 1, "tap on a point selects it (adds nothing)");
  D.auEdit.drag(sel0, 0.25, 0.75); ln = M.autoLane(D.project().tracks[1], "expr");
  ok(ln.points.length === 1 && ln.points[0][0] % 960 === 0 && Math.abs(ln.points[0][0] - end / 4) <= 480 && M.autoReal("expr", ln.points[0][1]) === 23 && D.auState().au.sel === ln.points[0][0], "drag moves the selected point (grid and value)", ln.points[0]);
  var at0 = ln.points[0][0]; D.auEdit.nudge(960, 5); ln = M.autoLane(D.project().tracks[1], "expr");
  ok(ln.points[0][0] === at0 + 960 && M.autoReal("expr", ln.points[0][1]) === 28, "◀ ▶ ▲ ▼ move by the grid and by steps", ln.points[0]);
  D.xmas.host.undo(); ln = M.autoLane(D.project().tracks[1], "expr");
  ok(ln.points[0][0] === at0, "↶ undoes the nudge");
  D.redo(); ln = M.autoLane(D.project().tracks[1], "expr");
  ok(ln.points[0][0] === at0 + 960, "↷ redoes it");
  D.auState().au.sel = ln.points[0][0]; D.auEdit.del();
  ok(M.autoLane(D.project().tracks[1], "expr").points.length === 0, "🗑 deletes the selected point");
  // コピー → 別のトラックへ貼り付け
  var tt = D.project().tracks[1]; M.autoSet(D.project(), tt, "expr", 0, 100); M.autoSet(D.project(), tt, "expr", 3840, 50);
  D.showAuto(tt.id, "expr"); var cr = D.auEdit.copy(1, 2);
  D.showAuto(D.project().tracks[2].id, "expr"); var pr = D.auEdit.paste(5);
  var l2 = M.autoLane(D.project().tracks[2], "expr");
  ok(cr.ok && cr.n === 2 && pr.ok && l2.points.length === 2 && l2.points[0][0] === M.barToTick(D.project(), 4) && l2.points[1][0] === M.barToTick(D.project(), 5), "copy bars 1〜2 and paste them to another track at bar 5");
  // 8. 保存 → 復元
  p = D.project(); M.autoSet(p, p.tracks[3], "mod", 1920, 90);
  var back = M.fromRecord(JSON.parse(JSON.stringify(M.toRecord(p, Date.now())))).project;
  ok(JSON.stringify(back.tracks.map(function (x) { return x.auto; })) === JSON.stringify(p.tracks.map(function (x) { return x.auto; })) && JSON.stringify(M.midiExport(back).bytes) === JSON.stringify(M.midiExport(p).bytes), "save → restore: every lane comes back and the MIDI is byte-identical");
  // 9. 受け渡しの説明
  D.showAuto(t.id, "eq.low");
  ok(/MIDI には入りません/.test(R.innerHTML), "EQ lane says it is not in the MIDI");
  A.stop();
};
