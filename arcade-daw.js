// 究極ゴリラ — ゴリラDAW（§341 Phase 9A）。ゲームセンターの「設定画面だけのゲーム」として開く
// 9A-1: 画面の骨格（トラックの一覧・小節と拍の目盛り・クリップ・BPM・トラックの音色）。再生は 9A-2・ピアノロールは 9A-3・保存は 9A-4
// 音はゴリラシンセ（UGSynth）を使う。新しい音のエンジンは作らない。データは UGDawModel（arcade-daw-model.js・§340 の形）
(function () {
  "use strict";
  var A = window.UGArcade;
  if (!A || !A.internal) { return; }
  var I = A.internal, escHtml = I.escHtml;
  function DM() { return window.UGDawModel; }

  var PX_BEAT = 28, HEAD_W = 96, LANE_H = 64, RULER_H = 24;
  var pxb = PX_BEAT; // 9B-21: アレンジの 1 拍の幅（モバイルは 28px のまま・PC Studio はズームで 7〜56px）
  // セッションのあいだのプロジェクト（9A-4 で ultimateGorillaDawV1 に保存する）
  var st = { project: null, sel: null, scroll: 0, undo: [], redo: [], anote: "" }; // undo: §341 9A-5 ↶ の列（ピアノロールとアレンジで共通・トラック全部の写し）

  // はじめて開いたとき: 最後に開いた曲を読む。保存が無ければ見本（まだ保存しない）。読めなければ見本を開いて理由を出す（壊れたデータは消さない）
  function project() {
    if (!st.project && DM()) {
      var r = loadLast();
      if (r && r.ok) { st.project = r.project; sv.status = "saved"; sv.at = r.project.saved || 0; }
      else {
        st.project = DM().demoProject();
        st.project.id = DM().newProjectId();
        sv.status = r && r.error === "storage" ? "error" : "demo";
        sv.msg = r && r.why ? r.why : "";
      }
    }
    return st.project;
  }

  // ゴリラシンセのプリセット（いままでの 12 個 ＋ ウェーブテーブル・FM）: [[id, 名前（HTML）], …]
  function presetList() {
    var S = window.UGSynth, out = [], i, x;
    if (!S) { return out; }
    for (i = 0; S.PRESETS && i < S.PRESETS.length; i++) { out.push([S.PRESETS[i][0], S.PRESETS[i][1]]); }
    try { x = S.presetsX ? S.presetsX() : []; } catch (e) { x = []; }
    for (i = 0; i < x.length; i++) { out.push([x[i][0], x[i][1]]); }
    return out;
  }
  // 表示する音色の名前（いまのプリセットの一覧から引く。保存された文字はそのまま HTML にしない）
  function instName(t) {
    var ins = t.instrument || {}, l = presetList(), i;
    if (ins.type === "drum") { return "&#x1F941; ドラム"; }
    if (ins.type === "audio" || t.kind === "audio") { return "&#x1F3B5; オーディオ"; }
    if (ins.type === "sample") { return XM() ? XM().label(ins) : "&#x1F3BC; " + escHtml((ins.ext && ins.ext.presetName) || "録音の音色"); } // §343
    if (ins.type !== "synth") { return escHtml(ins.type || "?"); }
    var id = ins.ext && ins.ext.preset;
    for (i = 0; i < l.length; i++) { if (l[i][0] === id) { return l[i][1]; } }
    return "じぶんの音色";
  }
  function noteName(m) {
    var UG = window.UGMelody;
    if (UG && UG.noteName) { try { return UG.noteName(m); } catch (e) {} }
    return ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][m % 12] + (Math.floor(m / 12) - 1);
  }

  function tickX(tick) { return Math.round(tick / DM().PPQ * pxb); }

  // ---------- 再生（§341 9A-2）----------
  // 時計は AudioContext（UGMelody.audio.ctx の 1 つだけ）。25ms ごとに LOOK 秒先までの音を AudioContext の時刻で予約する（いまのシーケンサーと同じ）
  // 区間 seg = { t0（AudioContext の秒）, tick0 }: 曲の tick → 時刻 = t0 ＋ 秒(tick) − 秒(tick0)。ループで頭に戻る・BPM を変えたら区間を足す
  var LOOK = 0.3, PUMP_MS = 25, START_LEAD = 0.08, TAIL_MS = 4000; // 9B-18: LOOK 0.12 → 0.3 秒（メインスレッドが約 0.27 秒止まっても予約が間に合う。間に合わない音は同じ瞬間にまとめて鳴り、重なってピークが上がる）
  var pl = null, plLog = []; // pl: 再生中の状態。plLog: 予約した音の記録（テスト・確かめ用・最新 400 個）
  function SE() { var e = window.UGSynthEngine; return e && e.API === 1 ? e : null; }
  function XM() { return window.UGXmas || null; } // §343: 🎄 クリスマス制作（arcade-daw-xmas.js）
  function segTime(p, seg, tick) { var M = DM(); return seg.t0 + M.tickToSec(p, tick) - M.tickToSec(p, seg.tick0); }
  function segTick(p, seg, time) { var M = DM(); return M.secToTick(p, M.tickToSec(p, seg.tick0) + (time - seg.t0)); }
  function segFor(time) { var i, s = pl.segs[0]; for (i = 0; i < pl.segs.length; i++) { if (pl.segs[i].t0 <= time + 1e-9) { s = pl.segs[i]; } } return s; }
  // いまのプレイヘッドの tick（止まっているときは st.pos）
  function playTick() {
    if (!pl) { return st.pos || 0; }
    var p = st.project, now = pl.ac.currentTime, s = segFor(now), t = segTick(p, s, Math.max(now, s === pl.segs[0] ? pl.segs[0].t0 : now));
    return Math.max(0, t);
  }
  // トラックの出口（音量 → 左右 → バス。シンセの FX にリバーブ・ディレイがあるときの共有の残響を通さない出口も）＋ SynthTrack
  function mixFor(t) {
    var mx = pl.mix[t.id];
    if (mx) { return mx; }
    var ac = pl.ac, UG = window.UGMelody, Y = window.UGSynth;
    var bus = UG && UG.audio && UG.audio.ctx === ac && UG.audio.bus ? UG.audio.bus : ac.destination;
    var master = UG && UG.audio && UG.audio.ctx === ac && UG.audio.master ? UG.audio.master : null;
    function chain(dest) {
      var g = ac.createGain(), pn = null, av = null, ae = null;
      if (!pl.wav) { av = ac.createGain(); av.gain.value = 1; av.connect(g); ae = ac.createGain(); ae.gain.value = 1; ae.connect(av); } // §345 A28: ae ＝ Expression // 9B-9: 音量のオートメーション（FX のあと・フェーダーの前）。WAV では使う出口にだけ（fxBuild で）
      if (ac.createStereoPanner) { try { pn = ac.createStereoPanner(); pn.pan.value = t.pan; g.connect(pn); pn.connect(dest); } catch (e) { pn = null; } }
      if (!pn) { g.connect(dest); }
      return { g: g, pn: pn, av: av, ae: ae };
    }
    var mm = masterOf(); // §341 9A-6: トラック → DAW のマスター → 共有のバス・マスター（RPG やほかのゲームの音量は変えない）
    mx = { main: chain(mm.bus), dry: mm.dry ? chain(mm.dry) : null, syn: null, voices: [], srcs: [], ac: ac };
    mx.syn = Y && Y.track && !(t.instrument && t.instrument.type === "drum") && !DM().isAudio(t) ? Y.track(ac, { bus: trackIn(t, mx, "main"), dry: mx.dry ? trackIn(t, mx, "dry") : null }) : null; // エンジンが無ければ null（UGSynth.note で鳴らす）。9A-10: オーディオは使わない
    pl.mix[t.id] = mx;
    sendTaps(t, mx); // 9B-11: パンのあとから送る（送りが 0 なら作らない）
    setGain(t, mx, true);
    return mx;
  }
  // ---------- §342 9B-8: トラックの FX（入口 → EQ → コンプ → メイクアップ → これまでの出口（音量 → パン））----------
  // 効いていないトラックの WAV にはノードを足さない（入口 ＝ 出口のゲイン ＝ v2.57 と同じ）。再生中は 入口 → 道のゲイン → 出口 で、切りかえはクロスフェード
  function perfNow() { var pf = window.performance; return pf && pf.now ? pf.now() : Date.now(); } // 9B-19
  function dbGain(db) { return Math.pow(10, (Number(db) || 0) / 20); }
  function mkGain(c) { return dbGain(c.makeup) / DM().fxAutoMakeup(c.threshold, c.ratio); } // ブラウザの自動のメイクアップを打ち消して、Makeup の dB だけ上げ下げする
  function fxBranch(ac, t, live, withPan) {
    var f = live.fx, M = DM(), b = { inp: null, out: null, nodes: [], eq: [], cp: null, mk: null, pn: null }, k, n;
    function add(x) { if (b.out) { b.out.connect(x); } else { b.inp = x; } b.out = x; b.nodes.push(x); }
    // パンを先に: DynamicsCompressorNode はモノの音もステレオで出す（Chrome で確かめた）ので、あとのパンだとモノの音の真ん中の −3dB が消えて +3dB になる。
    // 先にパン（同じ pan）→ 出口のパンは 0（ステレオはそのまま通る）にすると、FX が中立のときは前と同じ音
    if (withPan && ac.createStereoPanner) { n = ac.createStereoPanner(); n.pan.value = Math.max(-1, Math.min(1, Number(t.pan) || 0)); add(n); b.pn = n; }
    if (live.eq) {
      var bands = ["low", "mid", "high"];
      for (k = 0; k < 3; k++) { var bd = M.FX_BANDS[bands[k]]; n = ac.createBiquadFilter(); n.type = bd.type; n.frequency.value = bd.freq; n.Q.value = bd.q; n.gain.value = eqGain(f, bands[k]); add(n); b.eq.push(n); }
    }
    if (live.comp) {
      n = ac.createDynamicsCompressor(); n.threshold.value = f.comp.threshold; n.knee.value = M.FX_KNEE; n.ratio.value = f.comp.ratio; n.attack.value = f.comp.attack; n.release.value = f.comp.release; add(n); b.cp = n;
      n = ac.createGain(); n.gain.value = mkGain(f.comp); add(n); b.mk = n;
    }
    return b;
  }
  function eqGain(f, band) { return !f.bypass && f.eq.on ? f.eq[band] : 0; } // EQ が OFF ＝ 0dB（shelf・peaking の 0dB は素通し）
  // 再生中の道の形: コンプがあれば EQ もいつも入れておく（EQ の ON／OFF はゲインを 0dB へ動かすだけ ＝ コンプを作りなおさない。作りなおすと新しいコンプは圧縮していない状態から始まり、切りかえで音が跳ねる）
  function rtKey(live) { var f = live.fx; return live.comp ? "c" : (!f.bypass && f.eq.on ? "e" : ""); }
  function branchOff(b) { var i, l = b.nodes.concat(b.bg ? [b.bg] : []); for (i = 0; i < l.length; i++) { try { l[i].disconnect(); } catch (e) {} } }
  // c（main／dry の出口）に、いまの設定の道を作る（now: すぐ／でなければクロスフェード）
  function fxBuild(t, c, now) {
    var ac = pl.ac, live = DM().fxLive(t), b;
    if (pl.wav) { // 書き出し: 設定は変わらないので、道は 1 つ（クロスフェード用のゲインは作らない）
      if (!c.av && DM().autoActive(t, "vol")) { c.av = ac.createGain(); c.av.gain.value = 1; c.av.connect(c.g); } // 9B-9: 音量のオートメーションのあるトラックだけ
      if (!c.ae && DM().autoActive(t, "expr")) { c.ae = ac.createGain(); c.ae.gain.value = 1; c.ae.connect(c.av || c.g); } // §345 A28: Expression のあるトラックだけ
      if (!live.sig) { c.inp = c.ae || c.av || c.g; c.sig = ""; autoBind(t, c, true, true); return; }
      try { b = fxBranch(ac, t, live, !!c.pn); b.out.connect(c.ae || c.av || c.g); c.inp = b.inp; c.br = b; c.sig = live.sig; if (b.pn) { c.pn.pan.value = 0; } } catch (e) { c.inp = c.ae || c.av || c.g; c.sig = ""; }
      autoBind(t, c, true, true);
      return;
    }
    if (!c.inp) { c.inp = ac.createGain(); c.inp.gain.value = 1; if (c.pn) { try { c.pn.pan.cancelScheduledValues(0); } catch (e0) {} c.pn.pan.value = 0; } } // 再生中は、どの道も頭にパンを持つ（クロスフェードのあいだも同じパン）
    var key = rtKey(live);
    try { b = key || c.pn ? fxBranch(ac, t, { eq: !!key, comp: key === "c", fx: live.fx }, !!c.pn) : { inp: null, out: null, nodes: [] }; } catch (e1) { b = { inp: null, out: null, nodes: [] }; live = { sig: "" }; key = ""; }
    var bg = ac.createGain(), t0 = ac.currentTime, old = c.br;
    bg.gain.value = now || !old ? 1 : 0;
    if (b.inp) { c.inp.connect(b.inp); b.out.connect(bg); } else { c.inp.connect(bg); }
    bg.connect(c.ae || c.av || c.g);
    b.bg = bg; var first = !old; c.br = b; c.sig = live.sig; c.key = key;
    autoBind(t, c, first, true); // 9B-9: 新しい道のパン・EQ（はじめてなら音量も）に、いまの位置から先を予約
    if (old) {
      // コンプの入った道は、先読みの遅れ（Chrome は 6ms）が音で満ちてから入れかえる（空のうちに入れると、つないだ所の段差が遅れて出てプチッとなる）
      var s0 = t0 + (b.cp ? 0.012 : 0);
      if (!now) { try { bg.gain.setValueAtTime(0, t0); bg.gain.setTargetAtTime(1, s0, 0.003); old.bg.gain.setValueAtTime(old.bg.gain.value, t0); old.bg.gain.setTargetAtTime(0, s0, 0.003); } catch (e2) { bg.gain.value = 1; old.bg.gain.value = 0; } }
      else { old.bg.gain.value = 0; }
      setTimeout(function () { try { c.inp.disconnect(old.inp || old.bg); } catch (e3) {} branchOff(old); }, 150);
    }
  }
  // 音を入れる口（はじめて使うときに FX を作る）
  function trackIn(t, mx, k) { var c = mx[k] || mx.main; if (!c.inp) { fxBuild(t, c, true); } return c.inp; }
  // 再生中に設定を変えた: 効くものが変われば道を作りなおす（クロスフェード）、同じなら値をなめらかに
  function fxUpdate(t) {
    if (!pl || pl.wav || !pl.mix[t.id]) { return; }
    var mx = pl.mix[t.id], live = DM().fxLive(t), f = live.fx, l = [mx.main, mx.dry], i, k, now = pl.ac.currentTime, bands = ["low", "mid", "high"];
    for (i = 0; i < l.length; i++) {
      var c = l[i];
      if (!c || !c.inp) { continue; }
      if (c.key !== rtKey(live)) { fxBuild(t, c, false); continue; }
      c.sig = live.sig;
      var b = c.br;
      if (!b) { continue; }
      try {
        for (k = 0; k < b.eq.length; k++) { var eqA = DM().autoActive(t, "eq." + bands[k]) && !f.bypass && f.eq.on; holdAt(b.eq[k].gain, now); if (eqA) { autoPlan(t, b.eq[k].gain, "eq." + bands[k], false); } else { b.eq[k].gain.setTargetAtTime(eqGain(f, bands[k]), now, 0.01); } } // 9B-9
        if (b.cp) { b.cp.threshold.setTargetAtTime(f.comp.threshold, now, 0.01); b.cp.ratio.setTargetAtTime(f.comp.ratio, now, 0.01); b.cp.attack.setTargetAtTime(f.comp.attack, now, 0.01); b.cp.release.setTargetAtTime(f.comp.release, now, 0.01); }
        if (b.mk) { b.mk.gain.setTargetAtTime(mkGain(f.comp), now, 0.01); }
      } catch (e) {}
    }
  }
  // いまの圧縮（dB・0 以下）。コンプが無ければ null
  function fxReduction(id) {
    var mx = pl && pl.mix[id], l = mx ? [mx.main, mx.dry] : [], i, r = null;
    for (i = 0; i < l.length; i++) { var cp = l[i] && l[i].br && l[i].br.cp; if (cp) { var v = typeof cp.reduction === "number" ? cp.reduction : (cp.reduction && cp.reduction.value); if (isFinite(v)) { r = r === null ? v : Math.min(r, v); } } }
    return r;
  }
  // ---------- §342 9B-9: オートメーションの予約（AudioParam の setValueAtTime・linearRampToValueAtTime。タイマーで値を書きつづけない）----------
  var AUTO_MAP = { "vol": function (v) { return v; }, "expr": function (v) { return v; }, "pan": function (v) { return v * 2 - 1; }, "eq.low": function (v) { return v * 24 - 12; }, "eq.mid": function (v) { return v * 24 - 12; }, "eq.high": function (v) { return v * 24 - 12; } };
  function holdAt(param, now) { try { if (param.cancelAndHoldAtTime) { param.cancelAndHoldAtTime(now); } else { param.cancelScheduledValues(now); } } catch (e) {} }
  // 区間 s の [from, to] を予約。mode: "set"（その時刻に値を置く）／ "ramp"（前の値から 5ms で移る: 折り返し・途中から）
  function autoSeg(param, a, target, s, from, to, mode, now) {
    var M = DM(), p = st.project, map = AUTO_MAP[target], t0 = Math.max(now, segTime(p, s, from)), v0 = map(M.autoValueAt(a, from)), an, i, lim = t0 + (mode === "set" ? 0 : 0.005);
    try {
      if (mode === "set") { param.setValueAtTime(v0, t0); } else { param.linearRampToValueAtTime(v0, lim); }
      an = M.autoAnchors(p, a, from, to);
      for (i = 0; i < an.length; i++) {
        var tt = segTime(p, s, an[i][0]);
        if (tt <= lim + 1e-6) { continue; }
        if (an[i][2] === "step") { param.setValueAtTime(map(an[i][1]), tt); } else { param.linearRampToValueAtTime(map(an[i][1]), tt); }
      }
    } catch (e) {}
  }
  // いまから先（いまの区間と、もう作った次の区間）を予約しなおす。fresh: 新しいノード（その時刻に値を置く）
  function autoPlan(t, param, target, fresh) {
    if (pl.prep) { pl.prep.push(function () { autoPlan(t, param, target, fresh); }); return; } // 9B-19: 鳴りはじめが決まってから
    var M = DM(), p = st.project, a = M.autoLane(t, target), now = pl.wav ? 0 : pl.ac.currentTime, i, first = true;
    if (!a || !param) { return; }
    for (i = 0; i < pl.segs.length; i++) {
      var s = pl.segs[i], next = pl.segs[i + 1], endT = next ? next.t0 : segTime(p, s, pl.segEnd);
      if (endT <= now && next) { continue; }
      var from = s.t0 >= now ? s.tick0 : Math.max(s.tick0, Math.min(pl.segEnd, Math.floor(segTick(p, s, now))));
      autoSeg(param, a, target, s, from, pl.segEnd, first && (fresh || s.t0 >= now) ? "set" : "ramp", now);
      first = false;
    }
  }
  // 出口 c の音量・パン・EQ にオートメーションを予約（vol: 音量も。fresh: 新しいノード）
  function chainParams(t, c) {
    var o = {}, f = DM().fxOf(t), bands = ["low", "mid", "high"], k;
    if (c.av) { o.vol = c.av.gain; }
    if (c.ae) { o.expr = c.ae.gain; } // §345 A28
    if (c.br && c.br.pn) { o.pan = c.br.pn.pan; } else if (c.pn && (!c.inp || c.inp === c.g || c.inp === c.av || c.inp === c.ae)) { o.pan = c.pn.pan; }
    if (c.br && c.br.eq && c.br.eq.length === 3 && !f.bypass && f.eq.on) { for (k = 0; k < 3; k++) { o["eq." + bands[k]] = c.br.eq[k].gain; } }
    return o;
  }
  function autoBind(t, c, vol, fresh) {
    var M = DM(), ps = chainParams(t, c), now = pl.wav ? 0 : pl.ac.currentTime, k;
    for (k in ps) {
      if (!ps.hasOwnProperty(k) || (k === "vol" && !vol) || !M.autoActive(t, k)) { continue; }
      if (!fresh && !pl.wav) { holdAt(ps[k], now); }
      autoPlan(t, ps[k], k, fresh);
    }
  }
  // ループの折り返し: 作った出口に、新しい区間を予約（前の区間の終わりの値から 5ms で頭の値へ）
  function autoLoopSeg(s) {
    var p = st.project, M = DM(), i, j, ms = pl.mix.__master;
    if (ms && ms.send && ms.send.dly) { dlySeg(ms.send.dly.d.delayTime, s, s.tick0, pl.segEnd, "ramp", pl.ac.currentTime); } // 9B-12: ディレイの時間も
    for (i = 0; i < p.tracks.length; i++) {
      var t = p.tracks[i], mx = pl.mix[t.id], l = mx ? [mx.main, mx.dry] : [];
      for (j = 0; j < l.length; j++) {
        if (!l[j] || !l[j].inp) { continue; }
        var ps = chainParams(t, l[j]), k;
        for (k in ps) { if (ps.hasOwnProperty(k) && M.autoActive(t, k)) { autoSeg(ps[k], M.autoLane(t, k), k, s, s.tick0, pl.segEnd, "ramp", pl.ac.currentTime); } }
      }
    }
  }
  // ---------- §342 9B-12: ディレイの時間をテンポに合わせる（区間の頭で、その区間のテンポの点ごとに予約。変わる所は 50ms でなめらかに）----------
  function dlySeg(param, s, from, to, mode, now) {
    var p = st.project, M = DM(), t0 = Math.max(now, segTime(p, s, from)), ps = M.tempoList(p), i;
    try {
      if (mode === "set") { param.setValueAtTime(M.delaySecAt(p, from), t0); } else { param.setTargetAtTime(M.delaySecAt(p, from), t0, 0.05); }
      for (i = 0; i < ps.length; i++) { if (ps[i].tick > from && ps[i].tick < to) { var tt = segTime(p, s, ps[i].tick); if (tt > t0) { param.setTargetAtTime(M.delaySecAt(p, ps[i].tick), tt, 0.05); } } }
    } catch (e) {}
  }
  function dlyPlan(s, fresh) {
    if (pl.prep) { pl.prep.push(function () { dlyPlan(s, fresh); }); return; } // 9B-19: 鳴りはじめが決まってから
    var p = st.project, param = s.dly.d.delayTime, now = pl.wav ? 0 : pl.ac.currentTime, i, first = true;
    if (!fresh && !pl.wav) { holdAt(param, now); }
    for (i = 0; i < pl.segs.length; i++) {
      var sg = pl.segs[i], next = pl.segs[i + 1], endT = next ? next.t0 : segTime(p, sg, pl.segEnd);
      if (endT <= now && next) { continue; }
      var from = sg.t0 >= now ? sg.tick0 : Math.max(sg.tick0, Math.min(pl.segEnd, Math.floor(segTick(p, sg, now))));
      dlySeg(param, sg, from, pl.segEnd, first && (fresh || sg.t0 >= now) ? "set" : "ramp", now);
      first = false;
    }
  }
  // ---------- §342 9B-11: センド FX（DAW 専用のリバーブ・ディレイ。Wet だけを DAW のマスターの dry へ ＝ 共有の残響を二重にしない・Master FX の EQ・リミッターも通る）----------
  // リバーブのインパルス（2.2 秒・ステレオ・ノイズ × (1 − t/長さ)^3）。決まった種の乱数なので、再生と WAV・何度書き出しても同じ
  function revImpulse(ac) {
    var sr = ac.sampleRate, c = ac.__ugRev;
    if (c && c.sampleRate === sr) { return c; }
    // ノイズはいつも 44.1kHz で作り、ほかのレート（再生の 48kHz など）では直線で写す（時間の上で同じ残響 ＝ 再生と WAV がそろう）
    // 大きさも自分で決める（normalize は使わない）: Web Audio の正規化と同じ式（0.00125 ÷ √パワー）を 44.1kHz のノイズで計算し、レートの分（44100 ÷ レート）を掛ける
    var BR = 44100, bl = Math.round(DM().REV_SEC * BR), len = Math.round(DM().REV_SEC * sr), b = ac.createBuffer(2, len, sr), ch, i, x = 20261114, bases = [], pw = 0;
    for (ch = 0; ch < 2; ch++) { var base = new Float32Array(bl + 1); for (i = 0; i < bl; i++) { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; base[i] = (x / 4294967296 * 2 - 1) * Math.pow(1 - i / bl, 3); pw += base[i] * base[i]; } bases.push(base); }
    var sc = 0.00125 / Math.sqrt(pw / (2 * bl)) * BR / sr;
    for (ch = 0; ch < 2; ch++) {
      var bs = bases[ch], dd = b.getChannelData(ch);
      if (sr === BR) { for (i = 0; i < len; i++) { dd[i] = bs[i] * sc; } }
      else { for (i = 0; i < len; i++) { var ps = i * BR / sr, k0 = Math.floor(ps), fr = ps - k0; dd[i] = k0 + 1 <= bl ? (bs[k0] * (1 - fr) + bs[k0 + 1] * fr) * sc : 0; } }
    }
    try { ac.__ugRev = b; } catch (e) {}
    return b;
  }
  function sendBuild(ac, m) {
    var M = DM(), p = st.project, lv = M.sendLive(p), out = m.dry || m.bus, s = { rev: null, dly: null, key: M.sendKey(p) };
    if (!lv.rev && !lv.dly) { return pl.wav ? null : s; } // 効くセンドが無い: ノードは作らない（再生中は形の印だけ持つ）
    if (lv.rev) {
      var ri = ac.createGain(), cv = ac.createConvolver(), rr = ac.createGain();
      cv.normalize = false; cv.buffer = revImpulse(ac); rr.gain.value = lv.fx.rev.level;
      ri.connect(cv); cv.connect(rr); rr.connect(out);
      s.rev = { inp: ri, cv: cv, ret: rr };
    }
    if (lv.dly) {
      var di = ac.createGain(), dn = ac.createDelay(2.1), lp = ac.createBiquadFilter(), fb = ac.createGain(), dr = ac.createGain();
      dn.delayTime.value = M.delaySecAt(p, pl.segs[0].tick0); lp.type = "lowpass"; lp.frequency.value = 3000; fb.gain.value = lv.fx.dly.fb; dr.gain.value = lv.fx.dly.level;
      di.connect(dn); dn.connect(lp); lp.connect(fb); fb.connect(dn); lp.connect(dr); dr.connect(out);
      s.dly = { inp: di, d: dn, lp: lp, fb: fb, ret: dr };
    }
    return s;
  }
  function sendOff(s) { var l = [], i; if (s.rev) { l.push(s.rev.inp, s.rev.cv, s.rev.ret); } if (s.dly) { l.push(s.dly.fb, s.dly.inp, s.dly.d, s.dly.lp, s.dly.ret); } for (i = 0; i < l.length; i++) { try { l[i].disconnect(); } catch (e) {} } }
  // トラックの出口（パンのあと）→ 送りのゲイン → FX の入口
  function sendTaps(t, mx) {
    var ms = pl.mix.__master, s = ms && ms.send, sv = DM().sendOf(t), l = [mx.main, mx.dry], i, ac = pl.ac;
    if (!s || (!s.rev && !s.dly)) { return; }
    for (i = 0; i < l.length; i++) {
      var c = l[i], src = c ? (c.pn || c.g) : null;
      if (!src) { continue; }
      if (s.rev && sv.rev > 0) { c.tr = ac.createGain(); c.tr.gain.value = sv.rev; src.connect(c.tr); c.tr.connect(s.rev.inp); }
      if (s.dly && sv.dly > 0) { c.td = ac.createGain(); c.td.gain.value = sv.dly; src.connect(c.td); c.td.connect(s.dly.inp); }
    }
  }
  // 再生中に値を変えた: つなぎの形が変われば同じ位置から鳴らしなおす、同じなら値をなめらかに
  function sendUpdate() {
    if (!pl || pl.wav || !pl.mix.__master) { return; }
    var p = st.project, M = DM(), ms = pl.mix.__master, s = ms.send, now = pl.ac.currentTime, i, j;
    if (!s || s.key !== M.sendKey(p)) { resync(); return; }
    var f = M.sendFxOf(p);
    try {
      if (s.rev) { s.rev.ret.gain.setTargetAtTime(f.rev.level, now, 0.01); }
      if (s.dly) { s.dly.ret.gain.setTargetAtTime(f.dly.level, now, 0.01); s.dly.fb.gain.setTargetAtTime(f.dly.fb, now, 0.01); dlyPlan(s, false); } // 9B-12: 時間はテンポの点ごとに予約しなおす
      for (i = 0; i < p.tracks.length; i++) {
        var mx = pl.mix[p.tracks[i].id], sv = M.sendOf(p.tracks[i]), l = mx ? [mx.main, mx.dry] : [];
        for (j = 0; j < l.length; j++) { if (!l[j]) { continue; } if (l[j].tr) { l[j].tr.gain.setTargetAtTime(sv.rev, now, 0.01); } if (l[j].td) { l[j].td.gain.setTargetAtTime(sv.dly, now, 0.01); } }
      }
    } catch (e) {}
  }
  // ---------- §342 9B-10: マスターの EQ・ピークリミッター ----------
  // ピークリミッター（AudioWorklet・サンプルピーク・左右連動・先読み LIM_LOOK）:
  // 必要なゲイン g＝min(1, Ceiling÷max|L|,|R|) → 先読み＋1 サンプルの最小値 → リリース（上がるときだけゆっくり）→ 先読みの長さの箱型の平均 → 先読みだけ遅らせた音に掛ける。
  // 平均する値は全部そのサンプルに必要なゲイン以下なので、出力のサンプルピークは Ceiling をこえない（True Peak ではない）。mode "meter" は遅らせずに通してピークだけ知らせる
  var LIM_NAME = "ug-daw-limiter", LIM_LOOK = 0.005;
  var LM_NAME = "ug-daw-loud"; // 9B-17: ラウドネスメーター（同じモジュール）
  var LIM_NAME_TP = "ug-daw-limiter-tp", LIM_TP_HALF = 16, LIM_TP_BETA = 8, LIM_TP_OS = 8; // 9B-16: True Peak のリミッター（8 倍の検出・各相 32 タップの Kaiser 窓 sinc。4 倍だとクリップした波形で +0.008dB こえた）
  var LIM_WORKLET = [
    "class P extends AudioWorkletProcessor {",
    "  static get parameterDescriptors() { return [{ name: 'ceiling', defaultValue: 0.891, minValue: 0.0001, maxValue: 1, automationRate: 'k-rate' }, { name: 'release', defaultValue: 0.1, minValue: 0.001, maxValue: 2, automationRate: 'k-rate' }]; }",
    "  constructor(o) {",
    "    super(); var q = (o && o.processorOptions) || {}, i;",
    "    this.lim = q.mode !== 'meter'; this.D = Math.max(1, Math.round((q.look || 0.005) * sampleRate)); var D = this.D;",
    "    this.dl = new Float32Array(D); this.dr = new Float32Array(D); this.p = 0; this.H = D + 1; this.Q = D + 2;",
    "    this.qv = new Float64Array(this.Q); this.qi = new Float64Array(this.Q); this.qh = 0; this.qt = 0; this.n = 0; this.r = 1;",
    "    this.rb = new Float64Array(D); for (i = 0; i < D; i++) { this.rb[i] = 1; } this.sum = D; this.bp = 0;",
    "    this.rep = !!q.report; this.cnt = 0; this.pk = 0; this.mg = 1; this.every = Math.round(sampleRate * 0.1); this.alive = true;",
    "    var s = this; this.port.onmessage = function (e) { if (e.data === 'stop') { s.alive = false; } };",
    "  }",
    "  process(inp, out, prm) {",
    "    if (!this.alive) { return false; }",
    "    var a = inp[0] || [], o = out[0], L = a[0], R = a[1] || a[0], oL = o[0], oR = o[1] || o[0], N = oL.length, i;",
    "    var c = prm.ceiling[0] * (1 - 1e-6), rc = Math.exp(-1 / (Math.max(0.001, prm.release[0]) * sampleRate)), D = this.D, H = this.H, Q = this.Q, qv = this.qv, qi = this.qi;",
    "    for (i = 0; i < N; i++) {",
    "      var xl = L ? L[i] : 0, xr = R ? R[i] : 0, yl = xl, yr = xr, gg = 1;",
    "      if (this.lim) {",
    "        var ax = Math.max(Math.abs(xl), Math.abs(xr)), g = ax > c ? c / ax : 1, n = this.n;",
    "        while (this.qt > this.qh && qv[(this.qt - 1) % Q] >= g) { this.qt--; }",
    "        qv[this.qt % Q] = g; qi[this.qt % Q] = n; this.qt++;",
    "        while (qi[this.qh % Q] <= n - H) { this.qh++; }",
    "        var h = qv[this.qh % Q];",
    "        this.r = h < this.r ? h : h + (this.r - h) * rc;",
    "        this.sum += this.r - this.rb[this.bp]; this.rb[this.bp] = this.r; this.bp = (this.bp + 1) % D;",
    "        gg = this.sum / D; if (gg > 1) { gg = 1; }",
    "        yl = this.dl[this.p] * gg; yr = this.dr[this.p] * gg; this.dl[this.p] = xl; this.dr[this.p] = xr; this.p = (this.p + 1) % D; this.n = n + 1;",
    "      }",
    "      oL[i] = yl; if (oR !== oL) { oR[i] = yr; }",
    "      var ap = Math.max(Math.abs(yl), Math.abs(yr)); if (ap > this.pk) { this.pk = ap; } if (gg < this.mg) { this.mg = gg; }",
    "    }",
    "    if (this.lim) { var s2 = 0; for (i = 0; i < D; i++) { s2 += this.rb[i]; } this.sum = s2; }",
    "    if (this.rep) { this.cnt += N; if (this.cnt >= this.every) { this.port.postMessage({ pk: this.pk, mg: this.mg }); this.cnt = 0; this.pk = 0; this.mg = 1; } }",
    "    return true;",
    "  }",
    "}",
    "registerProcessor('" + LIM_NAME + "', P);",
    // 9B-16: True Peak のリミッター（P はそのまま）。4 倍のオーバーサンプリング（Kaiser 窓の sinc・各相 2×HT タップ）でサンプルの間の値を出し、4 倍の点の山は放物線で補う。
    // その区間の補間に使う前後 HT サンプル全部に「Ceiling ÷ その区間の True Peak」以下のゲインを求める（前後 HT に広げる）→ P と同じ（先読みの最小値・リリース・箱型の平均）。遅れ ＝ 2×HT ＋ 先読み
    "class T extends AudioWorkletProcessor {",
    "  static get parameterDescriptors() { return [{ name: 'ceiling', defaultValue: 0.891, minValue: 0.0001, maxValue: 1, automationRate: 'k-rate' }, { name: 'release', defaultValue: 0.1, minValue: 0.001, maxValue: 2, automationRate: 'k-rate' }]; }",
    "  constructor(o) {",
    "    super(); var q = (o && o.processorOptions) || {}, i, p, k;",
    "    var D = Math.max(1, Math.round((q.look || 0.005) * sampleRate)), HT = " + LIM_TP_HALF + ", N = 2 * HT, L = 2 * HT + D; this.D = D; this.HT = HT; this.N = N; this.L = L;",
    "    function i0(x) { var s = 1, t = 1, j; for (j = 1; j < 40; j++) { t *= (x / (2 * j)) * (x / (2 * j)); s += t; } return s; }",
    "    var B = " + LIM_TP_BETA + ", ib = i0(B), OS = " + LIM_TP_OS + "; this.OS = OS; this.tp = []; this.a = new Float64Array(OS + 2);",
    "    for (p = 1; p < OS; p++) { var t = new Float64Array(N), sum = 0; for (k = 0; k < N; k++) { var x = (k - HT + 1) - p / OS, r = x / HT, w = Math.abs(r) < 1 ? i0(B * Math.sqrt(1 - r * r)) / ib : 0; t[k] = (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x)) * w; sum += t[k]; } for (k = 0; k < N; k++) { t[k] /= sum; } this.tp.push(t); }",
    "    this.h = [new Float64Array(2 * N), new Float64Array(2 * N)]; this.hp = 0; this.pv = [0, 0];",
    "    this.W = 2 * HT + 1; this.sv = new Float64Array(this.W + 1); this.si = new Float64Array(this.W + 1); this.sh = 0; this.st = 0; this.m = 0;",
    "    this.dl = new Float32Array(L); this.dr = new Float32Array(L); this.p = 0; this.H = D + 1; this.Q = D + 2;",
    "    this.qv = new Float64Array(this.Q); this.qi = new Float64Array(this.Q); this.qh = 0; this.qt = 0; this.n = 0; this.r = 1;",
    "    this.rb = new Float64Array(D); for (i = 0; i < D; i++) { this.rb[i] = 1; } this.sum = D; this.bp = 0;",
    "    this.rep = !!q.report; this.cnt = 0; this.pk = 0; this.mg = 1; this.every = Math.round(sampleRate * 0.1); this.alive = true;",
    "    var s = this; this.port.onmessage = function (e) { if (e.data === 'stop') { s.alive = false; } };",
    "  }",
    "  itp(ch) {",
    "    var b = this.h[ch], N = this.N, HT = this.HT, OS = this.OS, o = this.hp + 1, a = this.a, p, k, t, v, j, mx = 0;",
    "    a[0] = this.pv[ch]; a[1] = b[o + HT - 1]; a[OS + 1] = b[o + HT];",
    "    for (p = 0; p < OS - 1; p++) { t = this.tp[p]; v = 0; for (k = 0; k < N; k++) { v += t[k] * b[o + k]; } a[p + 2] = v; }",
    "    this.pv[ch] = a[OS];",
    "    for (j = 1; j <= OS; j++) { var sg = a[j] < 0 ? -1 : 1, y0 = a[j] * sg; if (y0 > mx) { mx = y0; } var ym = a[j - 1] * sg, yp = a[j + 1] * sg; if (ym > 0 && yp > 0 && y0 >= ym && y0 >= yp) { var dn = ym - 2 * y0 + yp; if (dn < 0) { var pk = y0 - (ym - yp) * (ym - yp) / (8 * dn); if (pk > mx) { mx = pk; } } } }",
    "    return mx;",
    "  }",
    "  process(inp, out, prm) {",
    "    if (!this.alive) { return false; }",
    "    var a = inp[0] || [], o = out[0], L = a[0], R = a[1] || a[0], oL = o[0], oR = o[1] || o[0], Nb = oL.length, i, N = this.N, W = this.W;",
    "    var c = prm.ceiling[0] * (1 - 1e-6), rc = Math.exp(-1 / (Math.max(0.001, prm.release[0]) * sampleRate)), D = this.D, H = this.H, Q = this.Q, qv = this.qv, qi = this.qi, sv = this.sv, si = this.si, hl = this.h[0], hr = this.h[1];",
    "    for (i = 0; i < Nb; i++) {",
    "      var xl = L ? L[i] : 0, xr = R ? R[i] : 0;",
    "      hl[this.hp] = xl; hl[this.hp + N] = xl; hr[this.hp] = xr; hr[this.hp + N] = xr;",
    "      var tv = Math.max(this.itp(0), this.itp(1)), m = this.m;",
    "      this.hp = this.hp + 1 === N ? 0 : this.hp + 1;",
    "      while (this.st > this.sh && sv[(this.st - 1) % (W + 1)] <= tv) { this.st--; }",
    "      sv[this.st % (W + 1)] = tv; si[this.st % (W + 1)] = m; this.st++;",
    "      while (si[this.sh % (W + 1)] <= m - W) { this.sh++; }",
    "      this.m = m + 1;",
    "      var tm = sv[this.sh % (W + 1)], g = tm > c ? c / tm : 1, n = this.n;",
    "      while (this.qt > this.qh && qv[(this.qt - 1) % Q] >= g) { this.qt--; }",
    "      qv[this.qt % Q] = g; qi[this.qt % Q] = n; this.qt++;",
    "      while (qi[this.qh % Q] <= n - H) { this.qh++; }",
    "      var h = qv[this.qh % Q];",
    "      this.r = h < this.r ? h : h + (this.r - h) * rc;",
    "      this.sum += this.r - this.rb[this.bp]; this.rb[this.bp] = this.r; this.bp = (this.bp + 1) % D;",
    "      var gg = this.sum / D; if (gg > 1) { gg = 1; }",
    "      var yl = this.dl[this.p] * gg, yr = this.dr[this.p] * gg; this.dl[this.p] = xl; this.dr[this.p] = xr; this.p = (this.p + 1) % this.L; this.n = n + 1;",
    "      oL[i] = yl; if (oR !== oL) { oR[i] = yr; }",
    "      var ap = Math.max(Math.abs(yl), Math.abs(yr)); if (ap > this.pk) { this.pk = ap; } if (gg < this.mg) { this.mg = gg; }",
    "    }",
    "    var s2 = 0; for (i = 0; i < D; i++) { s2 += this.rb[i]; } this.sum = s2;",
    "    if (this.rep) { this.cnt += Nb; if (this.cnt >= this.every) { this.port.postMessage({ pk: this.pk, mg: this.mg }); this.cnt = 0; this.pk = 0; this.mg = 1; } }",
    "    return true;",
    "  }",
    "}",
    "registerProcessor('" + LIM_NAME_TP + "', T);",
    // 9B-17: 再生中のラウドネスメーター（出力なし ＝ 音を変えない）。K 特性（係数は UGDawModel.kCoef(sampleRate)）の 2 乗の平均を 100ms ごと、その間のサンプルピークといっしょに送るだけ
    "class U extends AudioWorkletProcessor {",
    "  constructor(o) { super(); var q = (o && o.processorOptions) || {}, k = q.k || []; this.s1 = k[0]; this.s2 = k[1]; this.z = [new Float64Array(4), new Float64Array(4)]; this.sub = Math.max(1, Math.round(sampleRate * 0.1)); this.cnt = 0; this.acc = 0; this.pk = 0; this.alive = !!(this.s1 && this.s2); var s = this; this.port.onmessage = function (e) { if (e.data === 'stop') { s.alive = false; } };",
    // 9B-19: True Peak（tp ＝ UGDawModel.tpTaps() の 3 相 × 32 タップ ＝ 📊 の解析と同じ 4 倍の補間）。前の 32 サンプルを左右ごとに持ちつづける（128 サンプルの区切りをまたぐ）。無ければ計算しない
    "    var t = q.tp; this.tp = null; if (t && t.length === 3 && t[0].length === 32) { this.tp = [new Float64Array(t[0]), new Float64Array(t[1]), new Float64Array(t[2])]; this.tb = [new Float64Array(64), new Float64Array(64)]; this.tpos = 0; this.tpk = 0; } }",
    "  process(inp) {",
    "    if (!this.alive) { return false; }",
    "    var a = inp[0] || [], L = a[0] || null, R = a[1] || L, n = L ? L.length : 128, s1 = this.s1, s2 = this.s2, tp = this.tp, i, c;",
    "    for (i = 0; i < n; i++) {",
    "      var e = 0;",
    "      for (c = 0; c < 2; c++) { var x = c === 0 ? (L ? L[i] : 0) : (R ? R[i] : 0), q = this.z[c], y = s1.b0 * x + q[0]; q[0] = s1.b1 * x - s1.a1 * y + q[1]; q[1] = s1.b2 * x - s1.a2 * y; var y2 = s2.b0 * y + q[2]; q[2] = s2.b1 * y - s2.a1 * y2 + q[3]; q[3] = s2.b2 * y - s2.a2 * y2; e += y2 * y2; var ax = x < 0 ? -x : x; if (ax > this.pk) { this.pk = ax; }",
    "        if (tp) { var b = this.tb[c], tq = this.tpos, o = tq + 1, ph, kk, ta, sm; b[tq] = x; b[tq + 32] = x; for (ph = 0; ph < 3; ph++) { ta = tp[ph]; sm = 0; for (kk = 0; kk < 32; kk++) { sm += ta[kk] * b[o + kk]; } if (sm < 0) { sm = -sm; } if (sm > this.tpk) { this.tpk = sm; } } } }",
    "      if (tp) { this.tpos = this.tpos === 31 ? 0 : this.tpos + 1; }",
    "      this.acc += e;",
    "      if (++this.cnt === this.sub) { if (tp) { this.port.postMessage([this.acc / this.sub, this.pk, Math.max(this.tpk, this.pk)]); this.tpk = 0; } else { this.port.postMessage([this.acc / this.sub, this.pk]); } this.acc = 0; this.cnt = 0; this.pk = 0; }",
    "    }",
    "    return true;",
    "  }",
    "}",
    "registerProcessor('" + LM_NAME + "', U);"
  ].join("\n");
  // ワークレットを読みこむ（コンテキストごとに 1 回・data: URL → だめなら Blob URL）→ cb(ok)
  function limState(ac) { return ac && ac.__ugLim ? ac.__ugLim.st : ""; }
  function limLoad(ac, cb) {
    var s = ac ? ac.__ugLim : null;
    if (!ac) { cb(false); return; }
    if (s && s.st === "ok") { cb(true); return; }
    if (s && s.st === "fail") { cb(false); return; }
    if (s) { s.cbs.push(cb); return; }
    s = { st: "loading", cbs: [cb] };
    try { ac.__ugLim = s; } catch (e0) { cb(false); return; }
    function end(ok) { s.st = ok ? "ok" : "fail"; var l = s.cbs, i; s.cbs = []; for (i = 0; i < l.length; i++) { try { l[i](ok); } catch (e) {} } }
    if (!ac.audioWorklet || !window.AudioWorkletNode) { end(false); return; }
    function load(u, next) { var pr; try { pr = ac.audioWorklet.addModule(u); } catch (e) { next(); return; } if (!pr || !pr.then) { next(); return; } pr.then(function () { end(true); }, function () { next(); }); }
    load("data:application/javascript;charset=utf-8," + encodeURIComponent(LIM_WORKLET), function () {
      var bu = ""; try { bu = URL.createObjectURL(new Blob([LIM_WORKLET], { type: "application/javascript" })); } catch (e) { bu = ""; }
      if (!bu) { end(false); return; }
      load(bu, function () { end(false); });
    });
  }
  function limNode(ac, mode, report) {
    if (limState(ac) !== "ok") { return null; }
    try { return new window.AudioWorkletNode(ac, mode === "tp" ? LIM_NAME_TP : LIM_NAME, { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: "explicit", channelInterpretation: "speakers", processorOptions: { mode: mode, look: LIM_LOOK, report: !!report } }); } catch (e) { return null; }
  }
  function limSamples(rate, tp) { return Math.max(1, Math.round(LIM_LOOK * rate)) + (tp ? 2 * LIM_TP_HALF : 0); } // 9B-16: True Peak は補間の前後 2×HT サンプルだけ多く遅れる
  function limKey(k) { return k === "l" || k === "t"; } // 9B-16: リミッターの出口（l ＝ サンプルピーク・t ＝ True Peak）
  function limParams(n, f, now) {
    var c = n.parameters && n.parameters.get ? n.parameters.get("ceiling") : null, r = n.parameters && n.parameters.get ? n.parameters.get("release") : null, cl = dbGain(f.lim.ceiling);
    if (c) { if (now === undefined) { c.value = cl; } else { c.setTargetAtTime(cl, now, 0.01); } }
    if (r) { if (now === undefined) { r.value = f.lim.release; } else { r.setValueAtTime(f.lim.release, now); } }
  }
  // 再生中の出口の形（"" ＝ v2.59 と同じ共有の出口・"e" ＝ EQ（＋メーター）・"l" ＝ EQ ＋ リミッター）
  function masterRtKey(p) { var f = DM().masterFx(p); return f.bypass ? "" : (f.lim.on ? (f.lim.mode === "tp" ? "t" : "l") : (f.eq.on ? "e" : "")); } // 9B-16: t ＝ True Peak（モードを変えたら出口を作りなおす）
  // DAW 専用の出口（再生中）: 全体の音量（共有の値を写す）＋ 共有と同じ残響（送りの量を写す）→ EQ（いつも・OFF は 0dB）→ [入力ゲイン → リミッター] or メーター → スピーカー
  function masterPriv(ac, key) {
    var UG = window.UGMelody, A = UG.audio, M = DM(), f = M.masterFx(st.project), bands = ["low", "mid", "high"], k, last;
    var pm = ac.createGain(); pm.gain.value = A.master ? A.master.gain.value : 0.25;
    var fx = UG.buildFx ? UG.buildFx(ac, pm) : { bus: pm, revSend: null, dlySend: null };
    if (fx.revSend && A.revSend) { fx.revSend.gain.value = A.revSend.gain.value; }
    if (fx.dlySend && A.dlySend) { fx.dlySend.gain.value = A.dlySend.gain.value; }
    var o = { key: key, pm: pm, fx: fx, eq: [], ing: null, lim: null, out: null }; last = pm;
    for (k = 0; k < 3; k++) { var bd = M.FX_BANDS[bands[k]], n = ac.createBiquadFilter(); n.type = bd.type; n.frequency.value = bd.freq; n.Q.value = bd.q; n.gain.value = eqGain(f, bands[k]); last.connect(n); last = n; o.eq.push(n); }
    o.lim = limNode(ac, key === "t" ? "tp" : (key === "l" ? "lim" : "meter"), true);
    if (o.lim && limKey(key)) { o.ing = ac.createGain(); o.ing.gain.value = dbGain(f.lim.gain); last.connect(o.ing); o.ing.connect(o.lim); limParams(o.lim, f); }
    else if (o.lim) { last.connect(o.lim); }
    o.out = o.lim || last; o.out.connect(ac.destination);
    if (o.lim) { o.lim.port.onmessage = function (e) { var m = e.data, s = st.mstat; if (!m || !s || s.node !== o.lim) { return; } s.pk = m.pk; s.gr = m.mg; s.max = Math.max(s.max, m.pk); s.minGr = Math.min(s.minGr, m.mg); }; }
    st.mstat = { node: o.lim, pk: 0, gr: 1, max: 0, minGr: 1, key: key, lim: !!o.lim };
    return o;
  }
  // ---------- §342 9B-17: 再生中のラウドネスメーター ----------
  // OFF（はじめ）のときはノードを作らない・ワークレットも読まない。ON のときだけ、DAW のいちばん最後の出口（Master FX があれば DAW 専用の出口の最後 ＝ リミッター・EQ のあと、無ければ共有の全体の音量）から横に分けて測る（出力のないノード ＝ 音・遅れは変わらない）
  // 止まっているところから ▶ ＝ 新しく測る。再生中のジャンプ・鳴らしなおし・ループの折り返しは続けて測る（窓には前の音も入る）。⏹・曲の終わり（余韻のあと）＝ 止めて数字を残す。曲を開きなおす ＝ 消す
  var lm = { on: false, node: null, src: null, live: null, state: "off", upd: 0, full: null, fullAt: -1, late: { n: 0, max: 0 }, tp: false }; // 9B-18: late ＝ 測っているあいだに遅れた音・9B-19: tp ＝ True Peak も測る（はじめは OFF）
  function lmTarget() {
    if (!pl || pl.wav) { return null; }
    var m = pl.mix.__master, A = window.UGMelody && window.UGMelody.audio;
    if (m && m.priv && m.priv.out) { return m.priv.out; }
    return A && A.ctx === pl.ac && A.master ? A.master : null;
  }
  function lmAttach(fresh) {
    if (!lm.on || !pl || pl.wav) { return; }
    if (fresh || !lm.live) { lm.live = DM().loudLive(); lm.full = null; lm.fullAt = -1; lm.upd = 0; lm.late = { n: 0, max: 0 }; }
    if (lm.node) { return; }
    var ac = pl.ac, ls = limState(ac);
    if (ls === "fail") { lm.state = "fail"; return; }
    if (ls !== "ok") { lm.state = "wait"; limLoad(ac, function () { if (pl && pl.ac === ac && !lm.node && lm.on) { lmAttach(false); if (st.root && st.view === "master") { msHead(st.root); } } }); return; }
    var tg = lmTarget(), n = null;
    if (!tg) { lm.state = "fail"; return; }
    try { n = new window.AudioWorkletNode(ac, LM_NAME, { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 2, channelCountMode: "explicit", channelInterpretation: "speakers", processorOptions: { k: DM().kCoef(ac.sampleRate), tp: lm.tp ? DM().tpTaps() : null } }); } catch (e) { lm.state = "fail"; return; } // 9B-19: tp ＝ 📊 の解析と同じ 4 倍の補間の係数
    var live = lm.live;
    n.port.onmessage = function (ev) { var d = ev.data; if (lm.node !== n || !d || lm.live !== live) { return; } live.push(d[0], d[1], d[2]); lm.upd++; };
    try { tg.connect(n); } catch (e2) { try { n.port.onmessage = null; n.port.close(); } catch (e3) {} lm.state = "fail"; return; }
    lm.node = n; lm.src = tg; lm.state = "run";
  }
  function lmDetach(state) {
    var n = lm.node, sr = lm.src;
    if (n) {
      try { sr.disconnect(n); } catch (e) {}
      try { n.port.onmessage = null; n.port.postMessage("stop"); } catch (e1) {}
      var pp = n.port; setTimeout(function () { try { pp.close(); } catch (e2) {} }, 200);
    }
    lm.node = null; lm.src = null;
    if (state && (lm.on || state === "off")) { lm.state = state; }
  }
  // 9B-19: True Peak だけを ON／OFF（測っている途中なら、ノードを作りなおして続ける。True Peak の数字はそこから）
  function lmSetTp(on) {
    lm.tp = !!on;
    if (lm.live && lm.live.tpReset) { lm.live.tpReset(); }
    if (lm.node) { lmDetach(""); lmAttach(false); }
    return lm.tp;
  }
  function lmClear() { lmDetach(lm.on ? "idle" : "off"); lm.live = null; lm.full = null; lm.fullAt = -1; lm.upd = 0; lm.late = { n: 0, max: 0 }; }
  // 数字（表示は 10Hz・Integrated と LRA は 1 秒ごとに計算）
  function lmValues() {
    if (!lm.live) { return null; }
    var o = lm.live.get(false);
    if (!lm.full || lm.upd - lm.fullAt >= 10 || lm.state !== "run") { if (lm.fullAt !== lm.upd) { lm.full = lm.live.get(true); lm.fullAt = lm.upd; } }
    o.I = lm.full ? lm.full.I : null; o.lra = lm.full ? lm.full.lra : null; o.lraWhy = lm.full ? lm.full.lraWhy : ""; o.late = { n: lm.late.n, max: lm.late.max }; // 9B-18
    return o;
  }
  function masterPrivOff(o) {
    var l = [o.pm, o.fx && o.fx.bus, o.ing, o.lim].concat(o.eq, (o.fx && o.fx.nodes) || []), i; // 9B-15: 共有と同じ残響のノードも全部（ディレイのフィードバックの輪は、外さないとおたがいを生かしつづける）
    if (o.lim) {
      var lp = o.lim.port;
      try { lp.postMessage("stop"); } catch (e0) {}
      try { lp.onmessage = null; } catch (e1) {}
      setTimeout(function () { try { lp.close(); } catch (e2) {} }, 200); // 9B-15: 受け口を閉じる（開いたままだと、ワークレットと出口のノードが GC されない）。"stop" が届いてから
    }
    for (i = 0; i < l.length; i++) { if (l[i]) { try { l[i].disconnect(); } catch (e) {} } }
  }
  // 再生中に値を変えた: 出口の形が変われば同じ位置から鳴らしなおす、同じなら値をなめらかに
  function masterUpdate() {
    if (!pl || pl.wav || !pl.mix.__master) { return; }
    var m = pl.mix.__master, p = st.project, key = masterRtKey(p), pv = m.priv, M = DM(), f = M.masterFx(p), now = pl.ac.currentTime, bands = ["low", "mid", "high"], k;
    if ((pv ? pv.key : "") !== key) { resync(); return; }
    if (!pv) { return; }
    try {
      for (k = 0; k < pv.eq.length; k++) { pv.eq[k].gain.setTargetAtTime(eqGain(f, bands[k]), now, 0.01); }
      if (pv.ing) { pv.ing.gain.setTargetAtTime(dbGain(f.lim.gain), now, 0.01); }
      if (pv.lim && limKey(pv.key)) { limParams(pv.lim, f, now); }
    } catch (e) {}
  }
  // 再生中の出口の遅れ（秒）: リミッターの先読み（録音の自動の補正に足す）
  function masterLatency(ac) { var k = masterRtKey(st.project); return ac && limKey(k) && limState(ac) === "ok" ? limSamples(ac.sampleRate, k === "t") / ac.sampleRate : 0; }
  // §341 9A-6: DAW のマスター（ゲイン 2 つ: 共有のバスへ・共有の残響を通さない出口へ）。ゲイン ＝ master.vol ÷ 100
  function masterVol() { var p = st.project, v = p && p.master ? Number(p.master.vol) : 80; return (isFinite(v) ? Math.max(0, Math.min(100, v)) : 80) / 100; }
  function masterOf() {
    var m = pl.mix.__master;
    if (m) { return m; }
    var ac = pl.ac, UG = window.UGMelody;
    var bus = UG && UG.audio && UG.audio.ctx === ac && UG.audio.bus ? UG.audio.bus : ac.destination;
    var master = UG && UG.audio && UG.audio.ctx === ac && UG.audio.master ? UG.audio.master : null;
    m = { bus: ac.createGain(), dry: master ? ac.createGain() : null, priv: null };
    m.bus.gain.value = masterVol() * abDaw(); // 9B-20: 「🎧 だけ」なら 0（WAV は 1）
    var mk = !pl.wav && master ? masterRtKey(st.project) : ""; // 9B-10: Master FX が効くときは DAW 専用の出口（共有の残響・全体の音量を写して、そのあと EQ・リミッター → スピーカー）
    if (mk) { try { m.priv = masterPriv(ac, mk); } catch (e0) { m.priv = null; } }
    if (m.priv) { m.bus.connect(m.priv.fx.bus); if (m.dry) { m.dry.gain.value = masterVol() * abDaw(); m.dry.connect(m.priv.pm); } }
    else { m.bus.connect(bus); if (m.dry) { m.dry.gain.value = masterVol() * abDaw(); m.dry.connect(master); } }
    m.send = sendBuild(ac, m); // 9B-11: DAW 専用のリバーブ・ディレイ（センドが無ければ作らない）
    if (m.send && m.send.dly) { dlyPlan(m.send, true); } // 9B-12: ディレイの時間をテンポの点ごとに予約
    pl.mix.__master = m;
    return m;
  }
  function rampTo(param, v, now) { try { if (now) { param.value = v; } else { param.setTargetAtTime(v, pl.ac.currentTime, 0.01); } } catch (e) { param.value = v; } }
  function setMasterGain() { if (!pl || !pl.mix.__master) { return; } var m = pl.mix.__master, v = masterVol() * abDaw(); rampTo(m.bus.gain, v, false); if (m.dry) { rampTo(m.dry.gain, v, false); } }
  function setGain(t, mx, now) {
    var on = DM().audible(st.project, t), v = on ? (DM().autoActive(t, "vol") ? 1 : t.vol / 100) : 0, ac = pl.ac, list = [mx.main, mx.dry], i, ap = DM().autoActive(t, "pan"); // 9B-9: 音量のオートメーション中はフェーダーの代わりに av（ミュート・ソロはここで 0）
    for (i = 0; i < list.length; i++) {
      if (!list[i]) { continue; }
      rampTo(list[i].g.gain, v, now);
      if (ap) { continue; } // 9B-9: パンはオートメーションが動かす
      if (list[i].br && list[i].br.pn) { rampTo(list[i].br.pn.pan, Math.max(-1, Math.min(1, Number(t.pan) || 0)), now); } // 9B-8: FX の道の頭のパン（出口のパンは 0 のまま）
      else if (list[i].pn) { rampTo(list[i].pn.pan, Math.max(-1, Math.min(1, Number(t.pan) || 0)), now); } // 9A-6: パンもなめらかに
    }
  }
  // ミュート・ソロ・音量を、鳴っているトラックにすぐ反映
  function updateMix() {
    if (!pl) { return; }
    var p = st.project, i;
    for (i = 0; i < p.tracks.length; i++) { var mx = pl.mix[p.tracks[i].id]; if (mx) { setGain(p.tracks[i], mx, false); } }
  }
  // 音色のテンポ（BPM に合わせる LFO・ディレイ）と、Wavetable・FM の表を裏で作りはじめる（§339）
  function warm(t) {
    var E = SE(), patch = t.instrument && t.instrument.patch && t.instrument.patch.patch;
    if (E && patch && E.dspWarm && E.toV2 && pl && typeof pl.ac.startRendering !== "function") { try { E.dspWarm(E.toV2(patch), pl.ac.sampleRate, true); } catch (e) {} }
  }
  // d＝0（長さなし）: 音色の立ち上がり ＋ 減衰でノートオフ（サステインのない音色は自然に消える）
  function zeroSec(patch) {
    var E = SE(), a = 0.01, d = 0.3;
    try {
      if (E && E.toV2) { var e2 = E.toV2(patch).envs.amp; a = e2.a; d = e2.d; } else if (patch) { a = patch.a; d = patch.d; }
    } catch (e) {}
    return Math.max(0.05, Math.min(4, (Number(a) || 0) + (Number(d) || 0)));
  }
  // [from, to) の音を予約する
  function schedule(p, from, to, seg) {
    var M = DM(), evs = M.noteEvents(p, from, to, pl.opts && pl.opts.hum), i, Y = window.UGSynth; // §345 A27: 試聴の A／B
    // §341 9A-10: 音声のクリップ（区間の頭なら、かかっているクリップを途中から）
    var fresh = !!seg.fresh && !seg.freshDone && from === seg.tick0, aev = M.audioEvents(pl.shadow || p, from, to, fresh); // 9A-17: 下書きの試聴は影の曲（同じクリップ ID・トラック）
    if (fresh) { seg.freshDone = true; }
    for (i = 0; i < aev.length; i++) { playAudio(p, aev[i], seg); }
    playRef(p, seg, from, to, fresh); // 9B-20: 🎧 リファレンス（再生だけ）
    for (i = 0; i < evs.length; i++) {
      var ev = evs[i], t = M.findTrack(p, ev.track);
      if (pl.clip) { if (ev.clip !== pl.clip || !t) { continue; } } // 9A-3: クリップだけ鳴らす（直している音を聞けるように M／S は見ない）
      else if (!t || !M.audible(p, t)) { continue; }
      if (t.instrument && t.instrument.type === "drum") {
        // §341 9A-7: ドラム ＝ いまある UGMelody.drum（GM の番号）を、トラックの出口（音量 → 左右）→ DAW のマスターへ
        // 9A-8: スイング（8 分の裏の 16 分だけ・tick で遅らせる・ループの終わりはこえない）
        var dly = M.swingDelay(ev.rel, M.swingOf(t));
        if (ev.tick + dly >= pl.segEnd) { dly = 0; }
        var mxd = mixFor(t), whd = segTime(p, seg, ev.tick + dly), UGd = window.UGMelody, okd = false, dest = trackIn(t, mxd, "main"), choked = null;
        lateMark(whd); // 9B-18
        // 9A-8: ハイハットの開閉（同じトラックの中だけ）: 開いたハイハットは 1 打ごとのゲインを通す → 閉じたハイハット・次の開いたハイハットでそのゲインを 0 へ
        if ((ev.m === 42 || ev.m === 44 || ev.m === 46) && mxd.openHat && mxd.openHat.t < whd) {
          try { var og = mxd.openHat.g.gain; og.setValueAtTime(1, whd); og.setTargetAtTime(0, whd, 0.015); choked = mxd.openHat.tick; } catch (eo) {}
          mxd.openHat = null;
        }
        if (ev.m === 46) {
          var din = dest; try { var cg = pl.ac.createGain(); cg.gain.value = 1; cg.connect(din); dest = cg; mxd.openHat = { g: cg, t: whd, tick: ev.tick }; } catch (ec) { dest = din; }
        }
        try { if (XM() && XM().drum(pl.ac, ev.m, whd, ev.v, dest)) { okd = true; } else if (UGd && UGd.drum) { UGd.drum(pl.ac, ev.m, whd, ev.v, dest); okd = true; } } catch (ed) { okd = false; } // §343: 83 Jingle Bell・84 Bell Tree は DAW で
        plLog.push({ track: t.id, tick: ev.tick, m: ev.m, v: ev.v, when: whd, sec: 0, hash: "drum", pass: pl.pass, ok: okd, drum: true, swing: dly, choked: choked });
        if (plLog.length > 400 && !pl.wav) { plLog.shift(); }
        continue;
      }
      if (t.instrument && t.instrument.type === "sample") { // §343: 録音の音色（UGMelody のサンプル・使えなければ代わりのシンセ）
        var mxs = mixFor(t), whs = segTime(p, seg, ev.tick), ends = ev.end, vs = null;
        if (pl.loop && ends > pl.segEnd) { ends = pl.segEnd; }
        lateMark(whs);
        try { vs = XM() ? XM().note(pl.ac, t.instrument, ev.m, whs, ev.v, ev.d > 0 ? Math.max(0.05, segTime(p, seg, ends) - whs) : 0.5, trackIn(t, mxs, "main")) : null; } catch (es) { vs = null; }
        if (vs) { mxs.voices.push(vs); if (mxs.voices.length > 64) { mxs.voices = mxs.voices.filter(function (x) { return !(x.end < pl.ac.currentTime); }); } }
        plLog.push({ track: t.id, tick: ev.tick, m: ev.m, v: ev.v, when: whs, sec: 0, hash: "smp" + t.instrument.prog, pass: pl.pass, ok: !!vs, fb: !!(vs && vs.fb) });
        if (plLog.length > 400 && !pl.wav) { plLog.shift(); }
        continue;
      }
      var patch = t.instrument && t.instrument.type === "synth" && t.instrument.patch ? t.instrument.patch.patch : null;
      if (!patch) { continue; }
      var mx = mixFor(t), when = segTime(p, seg, ev.tick), end = ev.end;
      if (pl.loop && end > pl.segEnd) { end = pl.segEnd; } // ループの終わりで切る（次の回の頭と重ねない）
      var sec = ev.d > 0 ? Math.max(0.05, segTime(p, seg, end) - when) : zeroSec(patch), v = null;
      lateMark(when); // 9B-18
      try {
        if (mx.syn) { v = mx.syn.note(patch, ev.m, when, ev.v, sec); }
        else if (Y && Y.note) { v = Y.note(patch, ev.m, trackIn(t, mx, "main"), when, ev.v, sec); if (v) { mx.voices.push(v); if (mx.voices.length > 64) { mx.voices = mx.voices.filter(function (x) { return !(x.end < pl.ac.currentTime); }); } } }
      } catch (e) { v = null; }
      plLog.push({ track: t.id, tick: ev.tick, m: ev.m, v: ev.v, when: when, sec: sec, hash: t.instrument.patch.hash, pass: pl.pass, ok: !!v });
      if (plLog.length > 400 && !pl.wav) { plLog.shift(); }
    }
  }
  // 9B-18: 再生で、予約したときにもう過ぎていた音（メインスレッドが止まっていた）を数える。過ぎた時刻の音はすぐ鳴るので、本来ずれて鳴る音が重なる（ピークが WAV とちがう）。音は変えない・数字も補正しない
  function lateMark(when) {
    if (!pl || pl.wav || !pl.late) { return; }
    var d = pl.ac.currentTime - when;
    if (pl.start && pl.start.on) { pl.start.n++; if (-d < pl.start.lead) { pl.start.lead = -d; } } // 9B-19: 最初の予約の余裕
    if (!(d > 0)) { return; }
    pl.late.n++; if (d > pl.late.max) { pl.late.max = d; }
    if (lm.live && lm.node) { lm.late.n++; if (d > lm.late.max) { lm.late.max = d; } }
  }
  // タイマーから: いまから LOOK 秒先まで予約。区間の終わりに来たら、ループなら頭へ・でなければ終わりの時刻を決める
  function pump() {
    if (!pl) { return; }
    var p = st.project, now = pl.ac.currentTime, horizon = now + LOOK, guard = 0;
    while (guard++ < 16) {
      var seg = pl.segs[pl.segs.length - 1], h = segTick(p, seg, horizon), upto = Math.min(h, pl.segEnd);
      if (upto > pl.cur) { schedule(p, pl.cur, upto, seg); pl.cur = upto; }
      if (h < pl.segEnd) { break; }
      if (pl.loop) {
        var la = pl.la;
        pl.segs.push({ t0: segTime(p, seg, pl.segEnd), tick0: la, fresh: true }); // 9A-10: ループの頭 ＝ 音声を途中から鳴らす区間
        autoLoopSeg(pl.segs[pl.segs.length - 1]); // 9B-9: 折り返しのオートメーション
        if (pl.segs.length > 3) { pl.segs.shift(); }
        pl.cur = la; pl.pass++; pl.endAt = 0;
        continue;
      }
      if (!pl.endAt) { pl.endAt = segTime(p, seg, pl.segEnd); }
      break;
    }
    if (pl.endAt && now >= pl.endAt) { finish(); }
  }
  // 音を消して、ノードを外す（now: すぐ／でなければ余韻のあと）
  function disposeMix(mix) {
    var id, i;
    for (id in mix) {
      if (!mix.hasOwnProperty(id) || id === "__master" || id === "__ref") { continue; }
      var mx = mix[id];
      if (mx.syn) { try { mx.syn.dispose(); } catch (e) {} mx.syn = null; }
      for (i = 0; i < mx.voices.length; i++) { try { if (mx.voices[i].kill) { mx.voices[i].kill(0.05); } } catch (e2) {} }
      mx.voices = [];
      // 9A-10: 音声（これから鳴る予約もふくめて止める）
      for (i = 0; mx.srcs && i < mx.srcs.length; i++) { try { var sct = mx.ac ? mx.ac.currentTime : 0, sg = mx.srcs[i].g.gain; sg.cancelScheduledValues(sct); sg.setTargetAtTime(0, sct, 0.01); mx.srcs[i].src.stop(sct + 0.06); } catch (e6) {} }
      mx.srcs = [];
      (function (m) { var l0 = [m.main, m.dry], k0; for (k0 = 0; k0 < l0.length; k0++) { if (l0[k0]) { try { l0[k0].g.gain.setTargetAtTime(0, l0[k0].g.context ? l0[k0].g.context.currentTime : 0, 0.01); } catch (e5) {} } } })(mx); // 9A-7: 先に予約したドラムの音も残らないように、外す前に 0 へ
      (function (m) { setTimeout(function () { var l = [m.main, m.dry], k; for (k = 0; k < l.length; k++) { if (l[k]) { try { l[k].g.disconnect(); if (l[k].pn) { l[k].pn.disconnect(); } } catch (e3) {} if (l[k].br) { branchOff(l[k].br); l[k].br = null; } if (l[k].inp && l[k].inp !== l[k].g && l[k].inp !== l[k].av && l[k].inp !== l[k].ae) { try { l[k].inp.disconnect(); } catch (e7) {} } if (l[k].av) { try { l[k].av.disconnect(); } catch (e8) {} } if (l[k].ae) { try { l[k].ae.disconnect(); } catch (e10) {} } if (l[k].tr) { try { l[k].tr.disconnect(); } catch (e9) {} } if (l[k].td) { try { l[k].td.disconnect(); } catch (e10) {} } } } }, 150); })(mx); // 9B-8: FX のノードも・9B-9: オートメーションのゲインも・9B-11: センドも
    }
    if (mix.__ref) { refOff(mix.__ref); mix.__ref = null; } // 9B-20
    var ms = mix.__master;
    if (ms) { setTimeout(function () { try { ms.bus.disconnect(); if (ms.dry) { ms.dry.disconnect(); } } catch (e4) {} if (ms.priv) { masterPrivOff(ms.priv); ms.priv = null; } if (ms.send) { sendOff(ms.send); ms.send = null; } }, 150); } // 9A-6: DAW のマスターも外す・9B-10: DAW 専用の出口も
  }
  var tailTimer = null, tailMix = null;
  function clearTail() { if (tailTimer) { clearTimeout(tailTimer); tailTimer = null; } if (tailMix) { var m = tailMix; tailMix = null; disposeMix(m); } }
  function stopTimers() {
    if (pl && pl.timer) { clearInterval(pl.timer); pl.timer = null; }
    if (pl && pl.raf) { var caf = window.cancelAnimationFrame; if (caf) { try { caf(pl.raf); } catch (e) {} } pl.raf = null; }
  }
  // ⏹: すぐ止める（鳴っている音も 50ms で消す）・プレイヘッドは頭へ
  function stopPlay(keepPos) {
    if (lm.node || lm.state === "wait") { lmDetach("stop"); } // 9B-17: 測るのをやめる（数字は残す）
    clearTail(); takeHearStop(); // 9A-14: テイクの試聴も止める
    if (typeof aud === "object" && aud) { aud.playTok = null; } // 9A-10: 素材を待っている ▶ もやめる
    if (pl) { stopTimers(); var m = pl.mix; pl = null; disposeMix(m); }
    if (!keepPos) { st.pos = 0; }
    drawHead();
  }
  // 曲の終わりまで鳴った（ループ OFF）: タイマーを止め、余韻のあとで片づける
  function finish() {
    if (!pl) { return; }
    stopTimers();
    tailMix = pl.mix;
    pl = null;
    st.pos = 0;
    tailTimer = setTimeout(function () { tailTimer = null; if (lm.node) { lmDetach("stop"); if (st.root && st.view === "master") { msHead(st.root); } } if (tailMix) { var m = tailMix; tailMix = null; disposeMix(m); } }, Math.max(TAIL_MS, Math.round(DM().sendTail(st.project).sec * 1000) + 500)); // 9B-11: 残響の長さまで（最大 10 秒）
    if (st.root && st.ctl) { rerender(); }
  }
  // ▶: ユーザーの操作の中で AudioContext を作る／再開する（自動再生の制限）
  // opts（省略可）: { from, a, b, loop, clip } … 9A-3 のクリップだけの再生・直したあとの鳴らしなおし
  function startPlay(opts) {
    var p = project(), M = DM(), UG = window.UGMelody, ac = null, i;
    opts = opts || {};
    if (rec.state === "rec" && !opts.rec) { st.msg = "録音中は ▶ を使えません（録音の「■ 停止して置く」で止めてから）"; return false; } // 9A-12: 伴奏の時計を変えない
    var lmFresh = !pl; // 9B-17: 止まっていたなら新しく測る（再生中の鳴らしなおし・ジャンプは続ける）
    stopPlay(true);
    st.msg = "";
    try { ac = UG && UG.audioInit ? UG.audioInit() : null; } catch (e) { ac = null; }
    if (!ac || !p || !M) {
      st.msg = "音を出す準備ができませんでした。このブラウザでは Web Audio が使えないか、音のファイルを読みこめていません。ページを読みなおして、もう一度 ▶ を押してください。";
      dgLog("play", { s: "fail", why: "noctx" }); return false;
    }
    if (!window.UGSynth) { st.msg = "ゴリラシンセ（arcade-synth.js）を読みこめなかったため、鳴らせません。"; dgLog("play", { s: "fail", why: "nosynth" }); return false; }
    var lr = M.loopRange(p), clip = opts.clip || null, loop = opts.loop !== undefined ? !!opts.loop : !!(p.practice && p.practice.loopOn);
    var a = opts.a !== undefined ? opts.a : lr.a, b = opts.b !== undefined ? opts.b : (loop ? lr.b : M.playEndTick(p)); // 9B-20: リファレンスが長ければそこまで（WAV は songEndTick）
    var cue = st.cue !== null && st.cue !== undefined && !clip && (!loop || (st.cue >= a && st.cue < b)) ? st.cue : null; // 9B-1: 小節へ
    var from = opts.from !== undefined ? opts.from : (cue !== null ? cue : (loop || clip ? a : 0));
    if (from >= b || from < 0) { from = loop ? a : 0; }
    from = Math.round(from);
    // §341 9A-10: 音声の素材をまだ読みこんでいるなら、読みこめてから鳴らしはじめる（⏹ を押したらやめる）
    if (!opts.noWait && audNeedLoad(p)) {
      var tok = aud.playTok = {}, o2 = {}, k2;
      for (k2 in opts) { if (opts.hasOwnProperty(k2)) { o2[k2] = opts[k2]; } }
      o2.noWait = true;
      st.msg = "音声の素材を読みこんでいます…（読みこめたら鳴りはじめます）"; dgLog("play", { s: "waitAssets" });
      ensureAssets(p, function () { if (aud.playTok === tok && st.project === p) { aud.playTok = null; startPlay(o2); rerender(); } });
      return true;
    }
    // §343: 録音の音色（楽器のサンプル）を読みこんでから鳴らす（読めなければ 8 秒で、代わりのシンセの音で鳴らす）
    if (!opts.noSmp && !opts.rec && XM() && XM().needLoad(p)) {
      var tokS = aud.playTok = {}, o4 = {}, k4;
      for (k4 in opts) { if (opts.hasOwnProperty(k4)) { o4[k4] = opts[k4]; } }
      o4.noSmp = true; o4.noWait = true;
      st.msg = "楽器の録音を読みこんでいます…（読みこめたら鳴りはじめます）"; dgLog("play", { s: "waitSmp" });
      XM().load(XM().progsOf(p), function () { if (aud.playTok === tokS && st.project === p) { aud.playTok = null; st.msg = ""; startPlay(o4); rerender(); } }, 8000);
      return true;
    }
    // 9B-10: Master FX が効くなら、リミッター（ワークレット）を読みこめてから鳴らす（録音の伴奏は待たない）
    if (!opts.noLim && !opts.rec && masterRtKey(p) && limState(ac) !== "ok" && limState(ac) !== "fail") {
      var tokL = aud.playTok = {}, o3 = {}, k3;
      for (k3 in opts) { if (opts.hasOwnProperty(k3)) { o3[k3] = opts[k3]; } }
      o3.noLim = true; o3.noWait = true;
      st.msg = "マスターのリミッターを準備しています…"; dgLog("play", { s: "waitLim" });
      limLoad(ac, function () { if (aud.playTok === tokL && st.project === p) { aud.playTok = null; st.msg = ""; startPlay(o3); rerender(); } });
      return true;
    }
    var E = SE(); if (E && E.setTempo) { try { E.setTempo(M.bpmAt(p, from)); } catch (e2) {} }
    var dl0 = Math.max(0, Number(opts.delay) || 0), pf0 = perfNow(), ct0 = ac.currentTime;
    pl = { ac: ac, mix: {}, segs: [{ t0: ct0 + START_LEAD + dl0, tick0: from, fresh: true }], cur: from, loop: loop, la: a, segEnd: b, endAt: 0, pass: 0, timer: null, raf: null, clip: clip,
      opts: { a: a, b: b, loop: loop, clip: clip, fixedB: opts.b !== undefined, hum: opts.hum || null }, muteClip: opts.muteClip || null, shadow: opts.shadow || null, late: { n: 0, max: 0 }, prep: [], start: null }; // 9B-18: late ＝ 遅れた音・9B-19: prep ＝ 準備のあいだ後回しにする時刻の予約
    for (i = 0; i < p.tracks.length; i++) { mixFor(p.tracks[i]); warm(p.tracks[i]); }
    // §341 9A-7: ドラムのトラックがあれば生ドラムのサンプルを読みはじめる（終わるまでは作る音）
    for (i = 0; i < p.tracks.length; i++) { if (DM().isDrum(p.tracks[i])) { try { if (UG.loadSamples && UG.DRUM !== undefined) { UG.loadSamples([UG.DRUM]); } } catch (e5) {} break; } }
    if (lm.on) { lmAttach(lmFresh); } // 9B-17（9B-19: 鳴りはじめを決める前に）
    // 9B-19: 出口・FX・センド・メーターを作り終えてから鳴りはじめ（t0）を決める（作っているあいだに予約の余裕が減らないように）。後回しにしたオートメーション・ディレイの時間の予約は、そのあとで
    var ct1 = ac.currentTime, pq = pl.prep; pl.prep = null;
    pl.segs[0].t0 = ct1 + START_LEAD + dl0;
    for (i = 0; i < pq.length; i++) { try { pq[i](); } catch (e6) {} }
    pl.start = { prepMs: Math.round((perfNow() - pf0) * 10) / 10, prepCtx: Math.round((ct1 - ct0) * 10000) / 10, lead: Infinity, n: 0, on: true }; // prepMs ＝ 準備の時間（ms）・prepCtx ＝ そのあいだに進んだ音の時計（ms）・lead ＝ 最初の予約でいちばん少ない余裕（秒）
    pump();
    pl.start.on = false; if (pl.start.lead === Infinity) { pl.start.lead = null; }
    pl.timer = setInterval(pump, PUMP_MS);
    loopHead();
    dgLog("play", { s: "ok", from: from, ctx: ac.state || "", prepMs: pl.start.prepMs }); // 9B-21
    if (limKey(masterRtKey(p)) && limState(ac) === "fail") { st.msg = "このブラウザではマスターのリミッターを使えません（" + (masterRtKey(p) === "t" ? "True Peak の処理もしていません・" : "") + "リミッターなしで鳴らしています）"; } // 9B-10・9B-16
    var miss = audMissing(p, clip);
    if (miss) { st.msg = "素材がない音声のクリップ " + miss + " 個は鳴りません（クリップを選んで「🔗 素材を選びなおす」）"; }
    return true;
  }
  // ---------- §345 A20: トランスポート（一時停止・再開・小節の移動・タイムラインで移動）----------
  // ⏸: いまの位置（tick）を覚えて止める（予約した音・タイマー・出口を片づける。音量を 0 にするだけではない）→ ▶ でその位置から。⏹ は前と同じ（頭へ・覚えた位置も消す）
  // 位置は tick（小節・拍）で覚えるので、止めているあいだにテンポ・音符を変えても、同じ音楽の位置から鳴りはじめる。録音中はどれも使えない（伴奏の時計を変えない）
  function pausePlay() {
    if (!pl || rec.state !== "idle") { return false; }
    if (pl.clip) { stopPlay(true); return true; } // クリップだけの再生は、ふつうの停止と同じ
    var t = Math.max(0, Math.floor(playTick()));
    stopPlay(true);
    st.cue = t; st.pos = t; st.paused = true;
    drawHead(); dgLog("pause", { at: t });
    return true;
  }
  function resumePlay() { if (pl || rec.state !== "idle") { return false; } st.paused = false; return startPlay(); }
  function togglePlay() { if (pl && !pl.clip) { return pausePlay(); } return resumePlay(); }
  // いまの位置（再生中は鳴っているところ・止まっていれば ▶ のはじまり）
  function tpNow() { return pl && !pl.clip ? Math.max(0, Math.floor(playTick())) : Math.max(0, Math.round(st.cue || 0)); }
  // n 小節うごく（戻るときは、小節の途中なら その小節の頭へ。拍子が変わる曲でも小節で数える）
  function nudgeBars(n) {
    var p = project(), M = DM(); if (!p || rec.state !== "idle") { return false; }
    var t = tpNow(), b = M.tickToBar(p, t), bar0 = b.bar - 1, last = Math.max(0, M.tickToBar(p, Math.max(0, M.playEndTick(p) - 1)).bar - 1);
    var mid = t > M.barToTick(p, bar0) + (pl ? DM().PPQ / 2 : 0); // 再生中は小節の頭から少しあとなら「その小節の頭」を 1 つめに数える
    var to = n < 0 && mid ? bar0 + n + 1 : bar0 + n;
    to = Math.max(0, Math.min(last, to));
    return tpGo(M.barToTick(p, to));
  }
  // ある位置へ（再生中なら古い予約を消して、そこから鳴らす・止まっていれば ▶ のはじまりに）
  function tpGo(tick) {
    var p = project(), M = DM(); if (!p) { return false; }
    tick = Math.max(0, Math.min(Math.round(Number(tick) || 0), Math.max(0, M.playEndTick(p) - 1)));
    if (rec.state !== "idle") { st.anote = "録音中は移れません"; return false; }
    var lr = M.loopRange(p), loopOn = !!(p.practice && p.practice.loopOn);
    if (loopOn && (tick < lr.a || tick >= lr.b) && pl && !pl.clip) { st.anote = "&#x1F501; ループの外なので、ループの頭から鳴らします（ループを切ると、どこからでも）"; tick = lr.a; }
    st.cue = tick; st.pos = tick;
    if (pl && !pl.clip) { startPlay({ from: tick }); } else { drawHead(); }
    dgLog("go", { to: tick, playing: !!pl });
    return true;
  }
  // 目盛りのタップ → いちばん近い拍の頭
  function tpTapX(x) { var p = project(), M = DM(), tk = Math.max(0, x) / pxb * M.PPQ, bt = M.ticksPerBar(M.meterAt(p, tk)) / Math.max(1, M.meterAt(p, tk).num); return tpGo(Math.round(tk / bt) * bt); }
  // 動いた先が見えるように横へスクロール（描きなおす前に st.scroll へ）
  function tpReveal(root) {
    var arr = root && root.querySelector ? root.querySelector(".daw-arr") : null; if (!arr || !arr.clientWidth) { return; }
    var x = tickX(tpNow()), vis = Math.max(40, arr.clientWidth - HEAD_W), sl = arr.scrollLeft || 0;
    if (x < sl || x > sl + vis - 24) { try { arr.scrollLeft = Math.max(0, x - Math.round(vis / 3)); } catch (e) {} }
    st.scroll = arr.scrollLeft || 0;
  }
  // 目盛り（小節の番号の行）をタップ → その拍へ（モバイル・PC Studio）
  function tpBind(root, ctl) {
    var rl = root && root.querySelector ? root.querySelector(".daw-ruler-row .daw-ruler") : null;
    if (!rl) { return; }
    rl.onclick = function (ev) { var rc = rl.getBoundingClientRect ? rl.getBoundingClientRect() : null; if (!rc) { return; } var arr = root.querySelector(".daw-arr"); if (arr) { st.scroll = arr.scrollLeft || 0; } if (tpTapX(ev.clientX - rc.left)) { render(root, ctl); } };
  }
  // §345 A22: 再生位置を追いかけて横にスクロール（モバイルははじめ ON・PC ははじめ OFF・ボタンで切りかえ）
  function tpFollow() { return st.follow === undefined || st.follow === null ? vw.lay !== "pc" : !!st.follow; }
  function tpFollowTick(root, tick) {
    if (!pl || pl.clip || !tpFollow() || !root || !root.querySelector || st.view !== "arr") { return; }
    var arr = root.querySelector(".daw-arr"); if (!arr || !arr.clientWidth) { return; }
    var x = tickX(tick), vis = Math.max(40, arr.clientWidth - HEAD_W), sl = arr.scrollLeft || 0;
    if (x < sl || x > sl + vis * 0.85) { try { arr.scrollLeft = Math.max(0, x - Math.round(vis * 0.15)); st.scroll = arr.scrollLeft; } catch (e) {} }
  }
  function posText() { var p = project(), M = DM(), b = M.tickToBar(p, tpNow()); return b.bar + "." + b.beat; }
  // ボタン（モバイル・PC Studio で同じ）
  function tpButtons(big) {
    var cls = "modal-btn daw-tbtn" + (big ? " daw-tbig" : ""), playing = pl && !pl.clip;
    return '<button class="' + cls + '" data-act="b4" title="4 小節戻る（Shift＋,）" aria-label="4 小節戻る">&#x23EA;</button>' +
      '<button class="' + cls + '" data-act="b1" title="1 小節戻る（,）" aria-label="1 小節戻る">&#x25C0;&#xFE0E;</button>' +
      '<button class="' + cls + (playing ? " daw-on" : "") + '" data-act="play" title="' + (playing ? "一時停止（Space）" : (st.paused ? "続きから再生（Space）" : "再生（Space）")) + '" aria-label="' + (playing ? "一時停止" : "再生") + '">' + (playing ? "&#x23F8;&#xFE0F;" : "&#x25B6;&#xFE0F;") + '</button>' +
      '<button class="' + cls + '" data-act="f1" title="1 小節進む（.）" aria-label="1 小節進む">&#x25B6;&#xFE0E;</button>' +
      '<button class="' + cls + '" data-act="f4" title="4 小節進む（Shift＋.）" aria-label="4 小節進む">&#x23E9;</button>' +
      '<button class="' + cls + '" data-act="stop" title="停止（頭へ）" aria-label="停止">&#x23F9;&#xFE0F;</button>';
  }
  // ---------- §345 A21: セクションの前／次・一覧・ループ（範囲・セクション・小節）----------
  // セクションは曲のマーカー（M.sectionsOf）から毎回とる（並び・長さが変わっても合う）
  function secNow(p) { var L = DM().sectionsOf(p), t = tpNow(), i, cur = -1; for (i = 0; i < L.length; i++) { if (L[i].tick <= t) { cur = i; } } return { list: L, i: cur, t: t }; }
  // 次 ／ 前（前は: セクションの途中なら、まずそのセクションの頭へ）
  function secStep(dir) {
    var p = project(), s = secNow(p), L = s.list, to = null;
    if (!L.length || rec.state !== "idle") { return false; }
    if (dir > 0) { to = s.i + 1 < L.length ? L[s.i + 1].tick : null; }
    else { var mid = s.i >= 0 && s.t > L[s.i].tick + (pl ? DM().PPQ : 0); to = mid ? L[s.i].tick : (s.i > 0 ? L[s.i - 1].tick : 0); }
    if (to === null) { st.anote = "最後のセクションです"; return false; }
    return tpGo(to);
  }
  // ループの範囲を決める（tick・小節の頭にそろえる・曲の中だけ）→ ON にする。再生中で、いまの位置が範囲の外なら範囲の頭から
  function loopSet(a, b, label) {
    var p = project(), M = DM(); if (!p || rec.state !== "idle") { return false; }
    var end = M.songEndTick(p), lastBar = M.tickToBar(p, Math.max(0, end - 1)).bar, ba = M.tickToBar(p, Math.max(0, Math.min(a, end))).bar - 1, bb;
    if (a >= end) { st.anote = "曲は " + lastBar + " 小節までです（ループのはじまりが曲の外）"; return false; }
    bb = Math.min(lastBar, Math.max(ba + 1, M.tickToBar(p, Math.max(0, Math.min(end, b) - 1)).bar));
    a = M.barToTick(p, ba); b = Math.min(end, M.barToTick(p, bb));
    if (!(b > a)) { st.anote = "ループの範囲がおかしいです"; return false; }
    p.practice = p.practice || {}; p.practice.loopA = a; p.practice.loopB = b;
    setLoop(true); markDirty();
    st.anote = "&#x1F501; " + (label ? escHtml(label) + "（" : "") + (ba + 1) + "〜" + bb + " 小節" + (label ? "）" : "") + "をくり返します";
    if (pl && !pl.clip) { var t = Math.floor(playTick()); if (t < a || t >= b) { startPlay({ from: a }); } }
    else { st.cue = a; st.pos = a; }
    dgLog("loop", { a: a, b: b });
    return true;
  }
  function loopSecs(i0, i1) { var p = project(), L = DM().sectionsOf(p); if (!L[i0] || !L[i1]) { return false; } var lo = Math.min(i0, i1), hi = Math.max(i0, i1); return loopSet(L[lo].tick, L[hi].tick + L[hi].len, lo === hi ? L[lo].name : L[lo].name + "〜" + L[hi].name); }
  function loopBars(b1, b2) { var p = project(), M = DM(); return loopSet(M.barToTick(p, Math.max(0, Math.round(b1) - 1)), M.barToTick(p, Math.max(Math.round(b1), Math.round(b2))), ""); }
  function loopText(p) { var M = DM(), lr = M.loopRange(p), on = !!(p.practice && p.practice.loopOn); return (on ? "&#x1F501; " : "&#x1F501;&#xFE0F; OFF ") + (M.tickToBar(p, lr.a).bar) + "〜" + M.tickToBar(p, Math.max(lr.a, lr.b - 1)).bar; }
  // セクションのバー（再生のボタンの下）
  function secBarHtml(p) {
    var s = secNow(p), L = s.list, cur = s.i >= 0 ? L[s.i] : null;
    var h = '<div class="daw-secbar">';
    h += '<button class="modal-btn daw-tbtn" data-act="secPrev" aria-label="前のセクション" title="前のセクション"' + (L.length ? '' : ' disabled') + '>&#x23EE;&#xFE0F;</button>';
    h += '<button class="modal-btn daw-secname" data-act="secList" aria-label="セクションの一覧">' + (cur ? escHtml(cur.name) : (L.length ? "（はじまり）" : "セクションなし")) + ' &#x25BE;</button>';
    h += '<button class="modal-btn daw-tbtn" data-act="secNext" aria-label="次のセクション" title="次のセクション"' + (L.length ? '' : ' disabled') + '>&#x23ED;&#xFE0F;</button>';
    h += '<button class="modal-btn daw-loopinfo' + (p.practice && p.practice.loopOn ? ' daw-on' : '') + '" data-act="secList" aria-label="ループの範囲">' + loopText(p) + '</button>';
    h += '<button class="modal-btn daw-tbtn' + (tpFollow() ? ' daw-on' : '') + '" data-act="follow" aria-label="再生位置を追いかける" title="再生位置を追いかける（' + (tpFollow() ? "ON" : "OFF") + '）">&#x1F441;&#xFE0F;</button>'; // §345 A22
    return h + '</div>';
  }
  // セクションの一覧（下のパネル）: ▶ ここから・🔁 ループ・〜までループ・小節の範囲
  function secSheetHtml(p) {
    if (!st.secSheet) { return ""; }
    var M = DM(), L = M.sectionsOf(p), s = secNow(p), ss = st.secSheet, lr = M.loopRange(p), h = '<div class="daw-ced daw-secsheet" role="dialog" aria-label="セクションとループ"><div class="daw-ced-top"><b>セクションとループ</b><button class="modal-btn daw-small" data-act="secClose" aria-label="閉じる">&#x2715;</button></div>', i;
    if (ss.from !== undefined && ss.from !== null) { h += '<div class="small">「' + escHtml(L[ss.from] ? L[ss.from].name : "") + '」から、どこまでをループしますか？（終わりのセクションの 🔁 を押す）</div>'; }
    h += '<div class="daw-seclist">';
    for (i = 0; i < L.length; i++) {
      var a = M.tickToBar(p, L[i].tick).bar, b = M.tickToBar(p, L[i].tick + L[i].len - 1).bar;
      h += '<div class="daw-secrow' + (i === s.i ? ' on' : '') + '"><span class="daw-secnm">' + escHtml(L[i].name) + ' <small>' + a + '〜' + b + '</small></span>' +
        '<button class="modal-btn daw-small" data-act="secGo:' + i + '">&#x25B6;&#xFE0F; ここから</button>' +
        '<button class="modal-btn daw-small" data-act="secLoop:' + i + '">&#x1F501; ' + (ss.from !== undefined && ss.from !== null ? 'ここまで' : 'ループ') + '</button>' +
        (ss.from === undefined || ss.from === null ? '<button class="modal-btn daw-small" data-act="secFrom:' + i + '">〜</button>' : '') + '</div>';
    }
    if (!L.length) { h += '<p class="small">セクション（マーカー）がありません。「🎼 曲の構成」で作れます。</p>'; }
    h += '</div><div class="daw-ced-row small">小節の範囲 <input type="number" class="daw-lpa" min="1" value="' + M.tickToBar(p, lr.a).bar + '" aria-label="ループのはじまりの小節"> 〜 <input type="number" class="daw-lpb" min="1" value="' + M.tickToBar(p, Math.max(lr.a, lr.b - 1)).bar + '" aria-label="ループの終わりの小節"> <button class="modal-btn daw-small" data-act="loopBars">&#x1F501; この範囲</button>' +
      '<button class="modal-btn daw-small' + (p.practice && p.practice.loopOn ? ' daw-on' : '') + '" data-act="loop">' + (p.practice && p.practice.loopOn ? 'ループ OFF にする' : 'ループ ON') + '</button></div>';
    return h + '</div>';
  }
  // ボタン（data-act）→ true
  function secAct(v, root, ctl) {
    var p = project(), M = DM(), m;
    if (v === "secPrev" || v === "secNext") { secStep(v === "secNext" ? 1 : -1); tpReveal(root); return true; }
    if (v === "secList") { st.secSheet = st.secSheet ? null : {}; st.ced = null; return true; }
    if (v === "secClose") { st.secSheet = null; return true; }
    if ((m = /^secGo:(\d+)$/.exec(v))) { var L = M.sectionsOf(p); if (L[+m[1]]) { tpGo(L[+m[1]].tick); if (!pl && rec.state === "idle") { resumePlay(); } } st.secSheet = null; tpReveal(root); return true; }
    if ((m = /^secFrom:(\d+)$/.exec(v))) { st.secSheet = { from: +m[1] }; return true; }
    if ((m = /^secLoop:(\d+)$/.exec(v))) { var f0 = st.secSheet && st.secSheet.from !== undefined && st.secSheet.from !== null ? st.secSheet.from : +m[1]; loopSecs(f0, +m[1]); st.secSheet = null; tpReveal(root); return true; }
    if (v === "loopBars") { var ia = root.querySelector(".daw-lpa"), ib = root.querySelector(".daw-lpb"); loopBars(Number(ia && ia.value), Number(ib && ib.value)); st.secSheet = null; return true; }
    if ((m = /^loopBar:(\d+)$/.exec(v))) { loopBars(+m[1] + 1, +m[1] + 1); if (!pl && rec.state === "idle") { resumePlay(); } return true; }
    return false;
  }
  // 🔁: 再生中でも切りかえる（ON: ループの終わりで頭へ・OFF: 曲の終わりで止まる）
  function setLoop(on) {
    var p = project(), M = DM();
    p.practice = p.practice || {};
    p.practice.loopOn = !!on;
    if (pl && !pl.clip) {
      var lr = M.loopRange(p);
      pl.loop = !!on;
      pl.la = lr.a;
      pl.segEnd = on ? lr.b : M.playEndTick(p);
      pl.opts.loop = !!on; pl.opts.a = lr.a; pl.opts.b = pl.segEnd;
      pl.endAt = 0;
      if (pl.cur > pl.segEnd) { pl.cur = pl.segEnd; }
      if (usedAssets(p).length) { resync(); } // 9A-10: 音声はループの終わりで切ってあるので、鳴らしなおす
    }
  }
  // BPM: 再生中なら、まだ予約していない音から新しい速さ（すでに予約した音の時刻はそのまま）
  function changeBpm(v) {
    var p0c = project(), c0b = DM().audioCutIds(p0c); setTimeout(function () { tpCutCheck(c0b); if (st.tpCut && st.tpCut.length) { st.anote = "&#x26A0;&#xFE0F; テンポを変えたので、音声のクリップ " + st.tpCut.length + " 個が箱の終わりで切れます（⏱ テンポの画面でのばせます）"; if (st.root && st.view === "arr") { rerender(); } } }, 0); // 9B-14
    var p = project(), M = DM(), t0 = null, E = SE();
    if (pl && tempoSched(p)) { var bb = M.setBpm(p, v); resync(); return bb; } // 9B-12: オートメーション・ディレイの予約があれば、同じ位置から鳴らしなおす（古い予約を残さない）
    if (pl) { t0 = segTime(p, pl.segs[pl.segs.length - 1], pl.cur); }
    var b = M.setBpm(p, v);
    if (pl && t0 !== null) { pl.segs.push({ t0: t0, tick0: pl.cur }); if (pl.segs.length > 3) { pl.segs.shift(); } if (pl.endAt) { pl.endAt = 0; } }
    if (pl && E && E.setTempo) { try { E.setTempo(b); } catch (e) {} }
    if (pl && usedAssets(p).length) { resync(); } // 9A-10: 音声の終わり（クリップの終わり）がテンポで変わるので、いまの位置から鳴らしなおす
    return b;
  }
  // 9A-3: 再生中に音符を直したら、いまの位置を覚えて止め（予約した音は 50ms で消える）、同じ位置から鳴らしなおす（古い予約の音を残さない）
  function resync() {
    if (!pl) { return false; }
    var o = pl.opts, t = Math.floor(playTick()), M = DM(), p = st.project;
    if (!o.fixedB && !o.loop) { o.b = M.playEndTick(p); }
    if (t < o.a || t >= o.b) { t = o.loop ? o.a : t; }
    return startPlay({ from: t, a: o.a, b: o.b, loop: o.loop, clip: o.clip, hum: o.hum || null });
  }
  // ---------- プレイヘッド（画面だけ。音の時計から位置を計算）----------
  function drawHead() {
    var root = st.root;
    if (!root || !root.querySelector) { return; }
    var el = root.querySelector(".daw-playhead"), pos = root.querySelector(".daw-pos"), tick = playTick(), x = tickX(tick);
    if (el) { el.style.left = (HEAD_W + x) + "px"; }
    if (pos) { var b = DM().tickToBar(st.project, tick); pos.textContent = (st.paused && !pl ? "⏸ " : "") + b.bar + "." + b.beat; }
    tpFollowTick(root, tick); // §345 A22
    if (st.view === "auto" && st.au) { auHead(root, tick); } // 9B-9
    if (st.view === "master") { msHead(root); } // 9B-10
    if (st.view === "ref") { refHead(root); } // 9B-20
    if (vw.lay === "pc" && st.view === "arr") { stHead(root, tick); } // 9B-21
    if (st.view === "tempo") { var tb = root.querySelector(".dtp-now"); if (tb) { tb.textContent = String(DM().bpmAt(st.project, pl ? tick : Math.max(0, Math.round(st.cue || 0)))); } } // 9B-12
    var gre = st.view === "fx" && st.fxTrack ? root.querySelector(".dfx-gr") : null; if (gre) { var grv = fxReduction(st.fxTrack); gre.textContent = grv === null ? "—" : (Math.round(Math.min(0, grv) * 10) / 10).toFixed(1) + " dB"; } // 9B-8
    var dph = st.steps && st.view === "steps" ? root.querySelector(".ds-ph") : null, df = dph ? DM().findClip(st.project, st.steps.clip) : null;
    if (dph && df) {
      var drel = tick - df.clip.start, dstep = Math.floor(drel / DM().STEP);
      dph.style.display = pl && drel >= 0 && drel < df.clip.len ? "block" : "none";
      dph.style.left = (DS_LW + Math.max(0, dstep) * DS_CW) + "px";
    }
    var ph = st.roll ? root.querySelector(".pr-playhead") : null, rf = ph ? rollClip() : null;
    if (ph && rf) {
      var rel = tick - rf.clip.start;
      ph.style.display = pl && rel >= 0 && rel <= rf.clip.len ? "block" : "none";
      ph.style.left = Math.round(rel / DM().PPQ * RB) + "px";
    }
    var cph = st.view === "comp" && st.cview ? root.querySelector(".cp-ph") : null, cf = cph ? comp.clip() : null; // 9A-16: クリップの箱の秒
    if (cph && cf) { var cC0 = DM().tickToSec(st.project, cf.clip.start), cbx = DM().tickToSec(st.project, cf.clip.start + cf.clip.len) - cC0, cu = DM().tickToSec(st.project, tick) - cC0; cph.style.display = pl && cbx > 0 && cu >= 0 && cu <= cbx ? "block" : "none"; if (cbx > 0) { cph.style.left = (cu / cbx * 100) + "%"; } }
    var aph = st.view === "aedit" && st.aedit ? root.querySelector(".ae-ph") : null, af = aph ? aedit.clip() : null; // 9A-13: 編集の波形のプレイヘッド（素材の時刻）
    if (aph && af) { var asp = DM().audioSpan(st.project, af.clip), au = DM().tickToSec(st.project, tick) - asp.A + asp.so; aph.style.display = pl && isFinite(asp.dur) && au >= 0 && au <= asp.dur ? "block" : "none"; if (isFinite(asp.dur)) { aph.style.left = (au / asp.dur * 100) + "%"; } }
    var arr = pl ? root.querySelector(".daw-arr") : null;
    if (arr && arr.clientWidth) {
      var vis = arr.clientWidth - HEAD_W;
      if (x < arr.scrollLeft || x > arr.scrollLeft + vis - 24) { arr.scrollLeft = Math.max(0, x - 24); }
    }
  }
  function loopHead() {
    if (!pl) { return; }
    drawHead();
    var raf = window.requestAnimationFrame;
    if (raf) { pl.raf = raf(function () { if (pl) { pl.raf = null; loopHead(); } }); }
  }
  function rerender() { if (!st.root) { return; } var arr = st.root.querySelector ? st.root.querySelector(".daw-arr") : null; if (arr) { st.scroll = arr.scrollLeft || 0; } render(st.root, st.ctl); }
  // メニューへ戻る・ゲームセンターを閉じる: 音とタイマーを全部片づける
  I.addStopHook(function () { if (XM()) { try { XM().leave(); } catch (ex) {} } hostClass(st.root, false); st.backGame = null; inbPrevStop(); if (rec.state !== "idle") { st.root = null; recStop("exit"); } rec.open = false; flushSave(); if (typeof wavCancel === "function") { wavCancel(); wavFree(); wav.state = "idle"; } stopPlay(false); clearTail(); audFree(null); aud.pending = null; packFree(); pk.state = "idle"; pk.istate = "idle"; pk.restored = null; st.root = null; st.ctl = null; }); // 9A-4: 待っている保存も書く。9A-10: デコードした音声を捨てる（素材は IndexedDB に残る）

  // ---------- 描く ----------
  function clipHtml(p, t, c) {
    var x = tickX(c.start), w = Math.max(6, tickX(c.start + c.len) - x), sel = st.sel && st.sel.kind === "clip" && st.sel.id === c.id;
    if (c.type === "audio") { // §341 9A-10: 波形（素材が無いときは「素材がありません」）
      var as = assetState(c.asset), bad = !!as && as !== "ready" && as !== "loading", wv = aud.peaks[c.asset] ? waveSvg(p, c, w) : "";
      return '<div class="daw-clip daw-aclip' + (sel ? " daw-sel" : "") + (bad ? " da-missing" : "") + '" data-clip="' + c.id + '" style="left:' + x + 'px;width:' + w + 'px;">' + wv +
        '<span class="daw-clip-name">' + escHtml((c.ext && c.ext.name) || "音声") + (c.takes && c.takes.length > 1 ? ' <b class="tk-tag">' + escHtml(c.take || "") + '</b>' : '') + '</span>' +
        (bad ? '<span class="da-miss">&#x26A0;&#xFE0F; ' + (as === "error" ? "素材を読めません" : "素材がありません") + '</span>' : (as === "ready" ? '' : '<span class="da-miss da-wait">&#x23F3;</span>')) + '</div>';
    }
    var h = '<div class="daw-clip' + (sel ? " daw-sel" : "") + '" data-clip="' + c.id + '" style="left:' + x + 'px;width:' + w + 'px;">' +
      '<span class="daw-clip-name">' + escHtml((c.ext && c.ext.name) || "クリップ") + '</span>';
    if (c.type === "midi" && c.notes.length) {
      var lo = 127, hi = 0, i, n;
      for (i = 0; i < c.notes.length; i++) { lo = Math.min(lo, c.notes[i][2]); hi = Math.max(hi, c.notes[i][2]); }
      var span = Math.max(6, hi - lo), top = 15, ht = LANE_H - 6 - top - 4;
      for (i = 0; i < c.notes.length; i++) {
        n = c.notes[i];
        if (n[0] >= c.len) { continue; }
        var nx = tickX(n[0]), nw = Math.max(2, tickX(n[0] + Math.max(n[1], 120)) - nx - 1), ny = top + Math.round((hi - n[2]) / span * (ht - 3));
        h += '<i class="daw-mini" style="left:' + nx + 'px;width:' + nw + 'px;top:' + ny + 'px;"></i>';
      }
    }
    return h + '</div>';
  }

  function render(root, ctl) {
    var M = DM(), p = project(), lay = syncLayout(root); // 9B-21
    if (M && p && st.view === "roll") { renderRoll(root, ctl); return; }
    if (M && p && st.view === "proj") { renderProj(root, ctl); return; }
    if (M && p && st.view === "mix") { renderMix(root, ctl); return; }
    if (M && p && st.view === "fx") { renderFx(root, ctl); return; } // 9B-8
    if (M && p && st.view === "master") { renderMaster(root, ctl); return; } // 9B-10
    if (M && p && st.view === "sendfx") { renderSendFx(root, ctl); return; } // 9B-11
    if (M && p && st.view === "tempo") { renderTempo(root, ctl); return; } // 9B-12
    if (M && p && st.view === "ref") { renderRef(root, ctl); return; } // 9B-20
    if (M && p && st.view === "lufs") { renderLufs(root, ctl); return; } // 9B-13
    if (M && p && st.view === "auto") { renderAuto(root, ctl); return; } // 9B-9
    if (M && p && st.view === "steps") { renderSteps(root, ctl); return; }
    if (M && p && st.view === "aedit") { renderAedit(root, ctl); return; } // 9A-13
    if (M && p && st.view === "lib") { renderLib(root, ctl); return; } // 9A-15
    if (M && p && st.view === "sec") { renderSec(root, ctl); return; } // 9B-1
    if (M && p && st.view === "inbox") { renderInbox(root, ctl); return; } // 9B-2
    if (M && p && st.view === "midi") { renderMidi(root, ctl); return; } // 9B-4
    if (M && p && st.view === "comp") { renderComp(root, ctl); return; } // 9A-16
    if (M && p && st.view === "xmas") { renderXmas(root, ctl); return; } // §343
    if (!M || !p) {
      root.innerHTML = '<div class="melody-setup"><p>DAW のファイル（arcade-daw-model.js）を読みこめませんでした。</p><button class="modal-btn" data-back="1">メニューへ</button></div>';
      bind(root, ctl);
      return;
    }
    var m0 = M.meterAt(p, 0), loopOn = !!(p.practice && p.practice.loopOn), h;
    if (lay === "pc") { h = studioHtml(p); } else { // 9B-21: PC Studio ＝ アレンジの別の並べ方（同じ st・同じ bind）
    h = '<div class="daw">' +
      '<div class="daw-top"><b>&#x1F39A;&#xFE0F; ゴリラDAW</b><span class="daw-pname"></span>' +
      '<button class="modal-btn daw-small" data-back="1">&#x1F579;&#xFE0F; メニューへ</button></div>' +
      projBarHtml(p) +
      '<div class="daw-tpwrap"><div class="daw-transport">' + tpButtons(false) + // §345 A20・A22: 包み（上に残る）
        '<button class="modal-btn daw-tbtn' + (loopOn ? " daw-on" : "") + '" data-act="loop" title="ループ（' + (loopOn ? "ON" : "OFF") + '）">&#x1F501;</button>' +
        '<button class="daw-pos" data-act="goBar" title="小節.拍（タップで小節へ）" aria-label="いまの位置（タップで小節へ移る）">1.1</button>' + // §345 A22
        '<span class="daw-bpm"><button class="modal-btn daw-tbtn" data-act="bpm-">&#x2212;</button>' +
        '<button class="daw-bpm-val" data-act="bpm">BPM <b>' + M.bpmAt(p, 0) + '</b></button>' +
        '<button class="modal-btn daw-tbtn" data-act="bpm+">&#xFF0B;</button></span>' +
        '<span class="daw-meter">' + m0.num + '/' + m0.den + '</span>' +
      '</div>' + secBarHtml(p) + '</div>' + // §345 A21・A22
      '<div class="da-tools"><button class="modal-btn daw-small" data-ar="addTrack">&#xFF0B; トラック</button>' +
        '<button class="modal-btn daw-small" data-ar="undo"' + (st.undo.length ? '' : ' disabled') + '>&#x21B6; 戻す<small>' + (st.undo.length || '') + '</small></button>' +
        '<button class="modal-btn daw-small" data-ar="redo"' + (st.redo.length ? '' : ' disabled') + ' title="やりなおし（Ctrl+Shift+Z）">&#x21B7;<small>' + (st.redo.length || '') + '</small></button>' + /* §345 A27 */
        '<button class="modal-btn daw-small" data-ar="mixer">&#x1F39A;&#xFE0F; ミキサー</button>' +
        '<button class="modal-btn daw-small" data-ar="sections">&#x1F3BC; 曲の構成</button>' + // 9B-1
        '<button class="modal-btn daw-small" data-ar="tempo">&#x23F1;&#xFE0F; テンポ' + (M.tempoList(p).length > 1 ? '<small>' + (M.tempoList(p).length - 1) + '</small>' : '') + '</button>' + // 9B-12
        '<button class="modal-btn daw-small" data-ar="inbox">&#x1F4E5; 取り込み</button>' + // 9B-2
        '<button class="modal-btn daw-small" data-ar="ref">&#x1F3A7; リファレンス' + (M.refOf(p) ? '<small>1</small>' : '') + '</button>' + // 9B-20
        (XM() ? '<button class="modal-btn daw-small dxm-open" data-ar="xmas">&#x1F384; クリスマス制作</button>' : '') + // §343
        viewSelHtml() + (vw.narrow ? '<span class="small dstu-narrow">画面がせまいので、モバイルの表示にしています（PC Studio は幅 ' + STU_MIN_PC + 'px から）</span>' : '') + // 9B-21
        '<span class="small da-hint">クリップをタップ ＝ 選ぶ ／ もう一度 ＝ 音符</span></div>' + inbNoteHtml() + backHtml() +
      arrGridHtml(p, false);
    h += (st.msg ? '<div class="daw-msg">&#x26A0;&#xFE0F; ' + escHtml(st.msg) + '</div>' : '') +
      '<div class="da-area">' + panelHtml(p) + '</div>' + cedHtml(p) + secSheetHtml(p) + // 9A-5・§345 A19・A21: 選んでも高さが変わらない（画面がずれてタップが別のクリップに当たらないように）
      saveNoteHtml() +
      '<p class="small daw-note">クリップをタップ ＝ 選ぶ（下に操作）／ もう一度タップ ＝ ピアノロールで音符を直す。</p>' +
      '<input type="file" class="da-wavfile" accept="' + AUD_ACCEPT + '" style="display:none;"></div>';
    }
    audKick(p); // 9A-10: 音声の素材を読みはじめる（終わったら描きなおす）
    var fo = lay === "pc" && stFocusIn(root); // 9B-21: DAW にフォーカスがあったら、描きなおしたあとも DAW に（Space・Ctrl+Z が続けて効く）
    root.innerHTML = h;
    var arr = root.querySelector && root.querySelector(".daw-arr");
    if (arr && st.scroll) { try { arr.scrollLeft = st.scroll; } catch (e) {} }
    // 9A-5: 足した・複製した・動かしたクリップが見えるように横へスクロール
    var fsel = st.reveal && st.sel && st.sel.kind === "clip" ? M.findClip(p, st.sel.id) : null;
    st.reveal = false;
    if (arr && fsel && arr.clientWidth) {
      var cx = tickX(fsel.clip.start), cw = tickX(fsel.clip.start + fsel.clip.len) - cx, vis = arr.clientWidth - HEAD_W;
      if (cx < arr.scrollLeft || cx + Math.min(cw, vis) > arr.scrollLeft + vis) { try { arr.scrollLeft = Math.max(0, cx - 24); st.scroll = arr.scrollLeft; } catch (e2) {} }
    }
    bind(root, ctl); cedBind(root, ctl); tpBind(root, ctl);
    if (fo) { var sf = root.querySelector(".dstu"); if (sf && sf.focus) { try { sf.focus({ preventScroll: true }); } catch (e3) {} } }
    drawHead();
  }
  // アレンジの格子（目盛り・セクションの帯・トラック・クリップ・プレイヘッド）。モバイルと PC Studio で同じ（9B-21: stu ＝ 縦にスクロールするのでプレイヘッドの高さを決める）
  function arrGridHtml(p, stu) {
    var M = DM();
    var bars = M.viewBars(p), W = tickX(M.barToTick(p, bars)), m0 = M.meterAt(p, 0), barPx = tickX(M.ticksPerBar(m0)), beatPx = tickX(M.PPQ * 4 / m0.den);
    var grid = 'background-size:' + barPx + 'px 100%,' + beatPx + 'px 100%;width:' + W + 'px;';
    var plist = presetList(), i, j, b, loopOn = !!(p.practice && p.practice.loopOn), lr = M.loopRange(p);
    var h = '<div class="daw-arr" style="--daw-head:' + HEAD_W + 'px;">';
    // 目盛り（小節の番号・拍の線）
    var secL = M.sectionsOf(p), rulerH = secL.length ? RULER_H + 16 : RULER_H; // 9B-1
    h += '<div class="daw-row daw-ruler-row"><div class="daw-corner">トラック</div><div class="daw-ruler daw-grid" style="' + grid + 'height:' + rulerH + 'px;">';
    for (i = 0; i < secL.length; i++) { var sx0 = tickX(secL[i].tick), sw0 = Math.max(4, tickX(secL[i].tick + secL[i].len) - sx0 - 1); h += '<button class="daw-secband sc-' + escHtml(secL[i].color || "blue") + '" data-secjump="' + escHtml(secL[i].id) + '" style="left:' + sx0 + 'px;width:' + sw0 + 'px;" title="' + escHtml(secL[i].name) + '（タップでこの小節へ）">' + escHtml(secL[i].name) + '</button>'; }
    if (st.cue !== null && st.cue !== undefined && !pl) { h += '<i class="daw-cue" style="left:' + tickX(st.cue) + 'px;" title="▶ のはじまり"></i>'; }
    if (loopOn) { h += '<i class="daw-loopband" style="left:' + tickX(lr.a) + 'px;width:' + (tickX(lr.b) - tickX(lr.a)) + 'px;"></i>'; }
    for (b = 0; b < bars; b++) { h += '<span class="daw-barno" style="left:' + tickX(M.barToTick(p, b)) + 'px;">' + (b + 1) + '</span>'; }
    var tps = M.tempoList(p); for (b = 1; b < tps.length; b++) { h += '<span class="daw-tmk" style="left:' + tickX(tps[b].tick) + 'px;" title="BPM ' + tps[b].bpm + '">&#x2669;' + tps[b].bpm + '</span>'; } // 9B-12: テンポの変更点
    h += '</div></div>';
    // §345 A6: 曲のコードの行（曲にコードがあるときだけ・タップで 🎼 コード へ）
    var chm = XM() && XM().songChords ? XM().songChords(p) : {}, chordH = Object.keys(chm).length ? 23 : 0;
    if (chordH) {
      h += '<div class="daw-row daw-chord-row"><div class="daw-corner">&#x1F3BC; コード</div><div class="daw-ruler daw-grid daw-chords" style="' + grid + 'height:22px;">';
      for (b = 0; b < bars; b++) { if (!chm[b]) { continue; } var cx0 = tickX(M.barToTick(p, b)), cw0 = Math.max(8, tickX(M.barToTick(p, b + 1)) - cx0 - 1); h += '<button class="daw-chd' + (st.ced && st.ced.bar === b ? ' on' : '') + '" data-chordbar="' + b + '" style="left:' + cx0 + 'px;width:' + cw0 + 'px;" title="' + (b + 1) + ' 小節目のコード（タップで変える）">' + escHtml(XM().chordName(p, chm[b])) + '</button>'; }
      h += '</div></div>';
    }
    // トラック
    for (i = 0; i < p.tracks.length; i++) {
      var t = p.tracks[i], tsel = st.sel && st.sel.kind === "track" && st.sel.id === t.id;
      var opts = "", cur = t.instrument && t.instrument.ext ? t.instrument.ext.preset : "", found = false;
      for (j = 0; j < plist.length; j++) { if (plist[j][0] === cur) { found = true; } opts += '<option value="' + plist[j][0] + '"' + (plist[j][0] === cur ? " selected" : "") + '>' + plist[j][1] + '</option>'; }
      if (XM()) { var xs = XM().SOUNDS, xo = ""; for (j = 0; j < xs.length; j++) { if (xs[j][3] === "drum") { continue; } if (xs[j][0] === cur) { found = true; } xo += '<option value="' + xs[j][0] + '"' + (xs[j][0] === cur ? " selected" : "") + '>' + xs[j][2] + '</option>'; } opts += '<optgroup label="クリスマス">' + xo + '</optgroup>'; } // §343
      if (!found) { opts = '<option value="" selected>' + (t.instrument && t.instrument.type === "sample" ? escHtml((t.instrument.ext && t.instrument.ext.presetName) || "録音の音色") : "じぶんの音色") + '</option>' + opts; }
      h += '<div class="daw-row">' +
        '<div class="daw-head' + (tsel ? " daw-sel" : "") + '" data-track="' + t.id + '" style="height:' + LANE_H + 'px;">' +
          '<div class="daw-tname">' + ((t.ext && t.ext.icon) || "&#x1F3B5;") + ' ' + escHtml(t.name) + '</div>' +
          (DM().isDrum(t) ? '<div class="daw-inst daw-drumlab">&#x1F941; ドラム</div>' : (DM().isAudio(t) ? '<div class="daw-inst daw-drumlab da-audlab">&#x1F3B5; オーディオ</div>' : '<select class="daw-inst" data-inst="' + t.id + '" aria-label="音色">' + opts + '</select>')) +
          '<div class="daw-ms"><button class="daw-m' + (t.mute ? " on" : "") + '" data-mute="' + t.id + '">M</button><button class="daw-s' + (t.solo ? " on" : "") + '" data-solo="' + t.id + '">S</button></div>' +
        '</div>' +
        '<div class="daw-lane daw-grid" style="' + grid + 'height:' + LANE_H + 'px;">';
      for (j = 0; j < t.clips.length; j++) { h += clipHtml(p, t, t.clips[j]); }
      if (t.kind === "midi") { h += '<button class="da-add" data-addclip="' + t.id + '" style="left:' + (tickX(M.trackEnd(t)) + 3) + 'px;" title="ここに空のクリップを足す" aria-label="クリップを足す">&#xFF0B;</button>'; }
      else if (M.isAudio(t)) { h += '<button class="da-add da-addwav" data-addwav="' + t.id + '" style="left:' + (tickX(M.trackEnd(t)) + 3) + 'px;" title="ここに WAV を読みこむ" aria-label="WAV を読みこむ">&#xFF0B;</button>'; } // 9A-10
      h += '</div></div>';
    }
    h += '<div class="daw-playhead" style="left:' + (HEAD_W + tickX(playTick())) + 'px;' + (stu ? 'bottom:auto;height:' + (rulerH + 1 + chordH + p.tracks.length * (LANE_H + 1)) + 'px;' : '') + '"></div></div>';
    return h;
  }

  // ---------- §342 9B-21: 表示（自動・モバイル・PC Studio）＝ 同じ曲・同じ操作の関数で、見せ方だけ変える ----------
  // PC Studio は「アレンジ（st.view = "arr"）の別の並べ方」。パネルは 1 回の render で 1 つの HTML にして、同じ bind でつなぐ（root・st.view を取り合わない）
  // 表示の設定は端末ごと（localStorage）。曲の JSON・ZIP・保存には入れない（切りかえても「保存待ち」にしない）
  var VIEW_KEY = "ultimateGorillaDawViewV1", STU_MIN_AUTO = 1024, STU_MIN_PC = 700, ZOOMS = [0.25, 0.5, 1, 2];
  var vw = { mode: null, zoom: 2, lay: "", narrow: false };
  function viewMode() {
    if (vw.mode === null) { var v = null; try { v = window.localStorage ? window.localStorage.getItem(VIEW_KEY) : null; } catch (e) { v = null; } vw.mode = v === "mobile" || v === "pc" ? v : "auto"; }
    return vw.mode;
  }
  function setViewMode(v) { v = v === "mobile" || v === "pc" ? v : "auto"; vw.mode = v; try { if (window.localStorage) { window.localStorage.setItem(VIEW_KEY, v); } } catch (e) {} return v; }
  function winW() { var d = window.document && document.documentElement; return Number(window.innerWidth) || (d && Number(d.clientWidth)) || 0; }
  // いまの並べ方: "pc" ／ "mobile"（PC Studio を選んでも、せまい画面ではモバイルで見せる＝操作できなくならないように）
  function layout() { var m = viewMode(), w = winW(); vw.narrow = m === "pc" && w < STU_MIN_PC; return (m === "pc" && !vw.narrow) || (m === "auto" && w >= STU_MIN_AUTO) ? "pc" : "mobile"; }
  function hostClass(root, on) { if (!root || typeof root.className !== "string") { return; } var c = root.className.replace(/(^|\s)dstu-host(?=\s|$)/g, "").replace(/^\s+|\s+$/g, ""); root.className = on ? (c ? c + " " : "") + "dstu-host" : c; }
  // 描く前に: 並べ方・1 拍の幅（ズーム）をそろえる。幅が変わったら横のスクロールを同じ拍の位置へ
  function syncLayout(root) {
    var lay = layout(), np = lay === "pc" ? Math.round(PX_BEAT * ZOOMS[vw.zoom]) : PX_BEAT;
    if (np !== pxb) { st.scroll = Math.max(0, Math.round((st.scroll || 0) * np / pxb)); pxb = np; }
    vw.lay = lay; hostClass(root, lay === "pc");
    return lay;
  }
  function stZoom(root, dir) {
    var nz = Math.max(0, Math.min(ZOOMS.length - 1, vw.zoom + dir)), arr = root && root.querySelector ? root.querySelector(".daw-arr") : null;
    if (nz === vw.zoom) { return false; }
    var vis = arr && arr.clientWidth ? Math.max(0, arr.clientWidth - HEAD_W) : 0, cx = (arr ? arr.scrollLeft || 0 : st.scroll || 0) + vis / 2, np = Math.round(PX_BEAT * ZOOMS[nz]);
    st.scroll = Math.max(0, Math.round(cx * np / pxb - vis / 2)); vw.zoom = nz; pxb = np; // 真ん中の拍をたもつ
    if (root) { render(root, st.ctl); }
    return true;
  }
  if (window.addEventListener) { window.addEventListener("resize", function () { if (st.root && st.project && layout() !== vw.lay) { rerender(); } }); } // 1 つだけ（並べ方が変わったときだけ描きなおす）
  function viewSelHtml() {
    var m = viewMode(), o = [["auto", "自動"], ["mobile", "モバイル"], ["pc", "PC Studio"]], h = '<label class="daw-vsel" title="表示（この端末だけ・曲には入りません）"><span>&#x1F5A5;&#xFE0F;</span><select data-viewmode="1" aria-label="表示">', i;
    for (i = 0; i < o.length; i++) { h += '<option value="' + o[i][0] + '"' + (o[i][0] === m ? ' selected' : '') + '>' + o[i][1] + '</option>'; }
    return h + '</select></label>';
  }
  function r1(v) { return Math.round(v * 10) / 10; }
  // A. Transport
  function stTransportHtml(p) {
    var M = DM(), m0 = M.meterAt(p, 0), loopOn = !!(p.practice && p.practice.loopOn), z = Math.round(ZOOMS[vw.zoom] * 100);
    return '<div class="daw-transport dstu-tp">' +
      tpButtons(false) + // §345 A20
      '<button class="modal-btn daw-tbtn' + (loopOn ? " daw-on" : "") + '" data-act="loop" title="ループ（' + (loopOn ? "ON" : "OFF") + '）">&#x1F501;</button>' +
      '<button class="daw-pos" data-act="goBar" title="小節.拍（タップで小節へ）" aria-label="いまの位置（タップで小節へ移る）">1.1</button>' + // §345 A22
      '<span class="daw-bpm dstu-bpm"><button class="modal-btn daw-tbtn" data-act="bpm-">&#x2212;</button><button class="daw-bpm-val" data-act="bpm">BPM <b>' + M.bpmAt(p, 0) + '</b></button><button class="modal-btn daw-tbtn" data-act="bpm+">&#xFF0B;</button></span>' +
      '<span class="daw-meter">' + m0.num + '/' + m0.den + '</span>' +
      '<button class="modal-btn daw-small" data-ar="undo"' + (st.undo.length ? '' : ' disabled') + ' title="戻す（Ctrl+Z）">&#x21B6; 戻す<small>' + (st.undo.length || '') + '</small></button>' +
      '<button class="modal-btn daw-small" data-ar="redo"' + (st.redo.length ? '' : ' disabled') + ' title="やりなおし（Ctrl+Shift+Z）">&#x21B7;<small>' + (st.redo.length || '') + '</small></button>' + /* §345 A27 */
      '<button class="modal-btn daw-small" data-stx="wav" title="WAV の書き出し（📁 曲の画面）">&#x1F4E4; WAV</button>' +
      '<span class="dstu-zoom" title="横の拡大・縮小"><button class="modal-btn daw-tbtn" data-zoom="-" aria-label="縮小"' + (vw.zoom <= 0 ? ' disabled' : '') + '>&#x2212;</button><b class="dstu-zv">' + z + '%</b><button class="modal-btn daw-tbtn" data-zoom="+" aria-label="拡大"' + (vw.zoom >= ZOOMS.length - 1 ? ' disabled' : '') + '>&#xFF0B;</button></span>' +
      viewSelHtml() + '</div>';
  }
  function stToolsHtml(p) {
    var M = DM();
    return '<div class="da-tools"><button class="modal-btn daw-small" data-ar="addTrack">&#xFF0B; トラック</button>' +
      '<button class="modal-btn daw-small" data-ar="mixer">&#x1F39A;&#xFE0F; ミキサー</button>' +
      '<button class="modal-btn daw-small" data-ar="sections">&#x1F3BC; 曲の構成</button>' +
      '<button class="modal-btn daw-small" data-ar="tempo">&#x23F1;&#xFE0F; テンポ' + (M.tempoList(p).length > 1 ? '<small>' + (M.tempoList(p).length - 1) + '</small>' : '') + '</button>' +
      '<button class="modal-btn daw-small" data-ar="inbox">&#x1F4E5; 取り込み</button>' +
      '<button class="modal-btn daw-small" data-ar="ref">&#x1F3A7; リファレンス' + (M.refOf(p) ? '<small>1</small>' : '') + '</button>' +
      (XM() ? '<button class="modal-btn daw-small dxm-open" data-ar="xmas">&#x1F384; クリスマス制作</button>' : '') + // §343
      '<span class="small da-hint">クリック ＝ 選ぶ ／ もう一度 ＝ フルの編集 ／ Space ▶⏹ ・ Ctrl+Z 戻す ・ Esc 外す</span></div>';
  }
  // B. 全体図（曲の全部・クリップの箱・🎧 の波形・見えている範囲・プレイヘッド）
  function stTotal(p) { var M = DM(); return M.barToTick(p, M.viewBars(p)); }
  function stOverviewHtml(p) {
    var M = DM(), total = stTotal(p), s = M.refSpan(p), n = p.tracks.length, lh = Math.max(3, Math.min(8, Math.floor(40 / Math.max(1, n)))), i, j, h, secL = M.sectionsOf(p);
    if (!(total > 0)) { return ''; }
    function pc(t) { return r1(Math.max(0, Math.min(100, t / total * 100))); }
    h = '<div class="dstu-ov" data-stov="1" title="曲の全体（クリックでそこへスクロール）"><div class="dstu-ovin">';
    for (i = 0; i < secL.length; i++) { h += '<b class="dstu-ovsec sc-' + escHtml(secL[i].color || "blue") + '" style="left:' + pc(secL[i].tick) + '%;width:' + Math.max(0.3, pc(secL[i].tick + secL[i].len) - pc(secL[i].tick)) + '%;">' + escHtml(secL[i].name) + '</b>'; }
    if (s && aud.peaks[s.asset.id]) { var a0 = M.secToTick(p, s.start), a1 = M.secToTick(p, s.end); h += '<div class="dstu-ovref" style="left:' + pc(a0) + '%;width:' + Math.max(0.3, pc(a1) - pc(a0)) + '%;" title="🎧 リファレンス">' + refWave(p, s, 400, 18) + '</div>'; }
    for (i = 0; i < n; i++) {
      var t = p.tracks[i];
      h += '<div class="dstu-ovl" style="height:' + lh + 'px;">';
      for (j = 0; j < t.clips.length; j++) { var c = t.clips[j]; h += '<i class="' + (c.type === "audio" ? "dstu-ova" : "dstu-ovm") + (st.sel && st.sel.kind === "clip" && st.sel.id === c.id ? " on" : "") + '" style="left:' + pc(c.start) + '%;width:' + Math.max(0.2, pc(c.start + c.len) - pc(c.start)) + '%;"></i>'; }
      h += '</div>';
    }
    return h + '<i class="dstu-ovvp"></i><i class="dstu-ovph" style="left:' + pc(Math.max(0, playTick())) + '%;"></i></div></div>';
  }
  function stOvSync(S) {
    var arr = S.querySelector(".daw-arr"), vp = S.querySelector(".dstu-ovvp"), W = tickX(stTotal(st.project));
    if (!arr || !vp || !(W > 0)) { return; }
    var vis = Math.max(0, (arr.clientWidth || 0) - HEAD_W), l = Math.max(0, Math.min(100, (arr.scrollLeft || 0) / W * 100)), w = Math.max(0.5, Math.min(100 - l, vis / W * 100));
    vp.style.left = r1(l) + "%"; vp.style.width = r1(w) + "%";
  }
  // C. ミキサー（モバイルのミキサーと同じ mixer.setVol・setPan・commit。↶ の対象外も同じ）
  function stMixHtml(p) {
    var M = DM(), ps = panSupported(), mv = p.master ? Math.round(clampNum(p.master.vol, 0, 100, VOL0)) : VOL0, i, h;
    h = '<div class="dstu-card dstu-mix"><div class="dstu-ch"><b>&#x1F39A;&#xFE0F; ミキサー</b><button class="modal-btn daw-small" data-ar="mixer" title="ミキサーのフルの画面（センド・オートメーション・↺）">くわしく</button></div>';
    for (i = 0; i < p.tracks.length; i++) {
      var t = p.tracks[i], pv = Math.round(clampNum(t.pan, -1, 1, 0) * 100), tv = Math.round(clampNum(t.vol, 0, 100, VOL0)), av = M.autoActive(t, "vol"), ap = M.autoActive(t, "pan"), on = st.sel && st.sel.kind === "track" && st.sel.id === t.id;
      h += '<div class="dstu-strip' + (on ? " on" : "") + '"><div class="dstu-sn"><span class="dstu-tn" data-track="' + t.id + '">' + ((t.ext && t.ext.icon) || "&#x1F3B5;") + ' ' + escHtml(t.name) + '</span>' +
          '<span class="daw-ms"><button class="daw-m' + (t.mute ? " on" : "") + '" data-mute="' + t.id + '">M</button><button class="daw-s' + (t.solo ? " on" : "") + '" data-solo="' + t.id + '">S</button></span>' +
          '<button class="modal-btn dm-fxb' + (M.fxLive(t).sig ? " on" : "") + '" data-stx-fx="' + t.id + '" title="EQ・コンプ">&#x1F39B;&#xFE0F;</button></div>' +
        '<div class="dstu-scs"><div class="dstu-sc"><span class="dm-lab">音量</span><input type="range" class="dm-fader" min="0" max="100" step="1" value="' + tv + '" data-mxv="' + t.id + '" aria-label="' + escHtml(t.name) + ' の音量"' + (av ? ' disabled' : '') + '><b class="dm-val" data-mxval="' + t.id + '">' + (av ? '&#x1F4C8;' : tv) + '</b></div>' +
        '<div class="dstu-sc"><span class="dm-lab">パン</span><input type="range" class="dm-fader dm-pan" min="-100" max="100" step="1" value="' + pv + '" data-mxp="' + t.id + '" aria-label="' + escHtml(t.name) + ' の左右"' + (ps && !ap ? '' : ' disabled') + '><b class="dm-val" data-mxpval="' + t.id + '">' + (ap ? '&#x1F4C8;' : panText(pv / 100)) + '</b></div></div></div>';
    }
    h += '<div class="dstu-strip dstu-mst"><div class="dstu-sn"><b>MASTER</b><button class="modal-btn dm-fxb dm-mfx' + (M.masterLive(p).sig ? " on" : "") + '" data-stx="master" title="マスター EQ・リミッター・メーター">&#x1F39A;&#xFE0F; MASTER</button><button class="modal-btn dm-fxb dm-sfx' + (M.sendLive(p).rev || M.sendLive(p).dly ? " on" : "") + '" data-stx="sendfx" title="リバーブ・ディレイ（センドの戻り）">&#x1F30A; FX</button></div>' +
      '<div class="dstu-sc"><span class="dm-lab">音量</span><input type="range" class="dm-fader" min="0" max="100" step="1" value="' + mv + '" data-mxv="master" aria-label="マスター音量"><b class="dm-val" data-mxval="master">' + mv + '</b></div></div>';
    return h + (ps ? '' : '<p class="small">このブラウザでは左右（パン）を変えられません。</p>') + '<p class="small dstu-mnote">音量・パン・FX は ↶ の対象外です（モバイルのミキサーと同じ）。</p></div>';
  }
  // D. 選んだクリップの編集（見本 ＋ フルの編集へ）。MIDI ＝ ピアノロールの見本・音声 ＝ ピークのキャッシュの波形（デコードしなおさない）
  function stRollHtml(p, c) {
    var M = DM(), len = Math.max(1, c.len), lo = 127, hi = 0, i, n, W = 1000, H = 140, g = '', d = '', cnt = 0;
    for (i = 0; i < c.notes.length; i++) { if (c.notes[i][0] < c.len) { lo = Math.min(lo, c.notes[i][2]); hi = Math.max(hi, c.notes[i][2]); } }
    if (hi < lo) { lo = 60; hi = 72; }
    if (hi - lo < 12) { lo = Math.max(0, Math.floor((lo + hi) / 2) - 6); hi = Math.min(127, lo + 12); }
    lo = Math.max(0, lo - 1); hi = Math.min(127, hi + 1);
    var rh = H / (hi - lo + 1), b0 = M.tickToBar(p, c.start).bar - 1, bt;
    for (i = lo; i <= hi; i++) { var k = i % 12; if (k === 1 || k === 3 || k === 6 || k === 8 || k === 10) { g += '<rect class="dstu-rk" x="0" y="' + r1((hi - i) * rh) + '" width="' + W + '" height="' + r1(rh) + '"/>'; } }
    for (i = b0; i < b0 + 600; i++) { bt = M.barToTick(p, i); if (bt > c.start + len) { break; } if (bt >= c.start) { var bx = r1((bt - c.start) / len * W); g += '<line class="dstu-rb" x1="' + bx + '" y1="0" x2="' + bx + '" y2="' + H + '"/>'; } }
    for (i = 0; i < c.notes.length; i++) {
      n = c.notes[i];
      if (n[0] >= c.len) { continue; }
      cnt++;
      d += '<rect class="dstu-rn" x="' + r1(n[0] / len * W) + '" y="' + r1((hi - n[2]) * rh + 0.5) + '" width="' + r1(Math.max(1.5, Math.min(n[1], c.len - n[0]) / len * W)) + '" height="' + r1(Math.max(1, rh - 1)) + '"/>';
    }
    return '<div class="dstu-ew"><div class="dstu-ekeys"><span>' + noteName(hi) + '</span><span>' + noteName(lo) + '</span></div><svg class="dstu-roll" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">' + g + d + '</svg><i class="dstu-eph"></i></div>' +
      '<p class="small dstu-guide">音符 ' + cnt + ' 個（ここは見るだけ。直すときは上のボタンでフルのピアノロールへ）</p>';
  }
  function stWaveSvg(p, c) {
    var M = DM(), pk = aud.peaks[c.asset], W = 600, H = 110, as = assetState(c.asset);
    if (M.compOf(p, c)) { return '<p class="small dstu-guide">コンピングのクリップです。テイクごとの波形は「&#x2702;&#xFE0F; 編集」で見られます。</p>'; }
    if (!pk || !pk.length) { return '<p class="small dstu-guide">' + (as === "loading" || !as ? "&#x23F3; 波形を読みこんでいます…" : escHtml(assetStateText(c.asset))) + '</p>'; }
    var sp = M.audioSpan(p, c), PR = M.PEAK_RATE, lo = Math.max(0, sp.p0), d = '', x, i, mid = H / 2, len = Math.max(1, c.len);
    for (x = 0; x < W; x++) {
      var x0 = M.tickToSec(p, c.start + x / W * len), x1 = M.tickToSec(p, c.start + (x + 1) / W * len);
      if (x0 >= sp.p1) { break; }
      if (x1 <= lo) { continue; }
      var t0 = Math.max(x0, lo) - sp.A + sp.so, t1 = Math.min(x1, sp.p1) - sp.A + sp.so, i0 = Math.floor(t0 * PR), i1 = Math.max(i0 + 1, Math.ceil(t1 * PR)), m = 0;
      for (i = i0; i < i1 && i < pk.length; i++) { if (pk[i] > m) { m = pk[i]; } }
      var hh = Math.max(0.5, m / 255 * (H / 2 - 2));
      d += 'M' + (x + 0.5) + ' ' + r1(mid - hh) + 'V' + r1(mid + hh);
    }
    return '<div class="dstu-ew dstu-ewa"><svg class="dstu-wave" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true"><path d="' + d + '"/></svg><i class="dstu-eph"></i></div>';
  }
  function stEditHtml(p) {
    var M = DM(), s = st.sel, f = s && s.kind === "clip" ? M.findClip(p, s.id) : null;
    if (!f) {
      var t = s && s.kind === "track" ? M.findTrack(p, s.id) : null;
      return '<div class="dstu-eh"><b>&#x270F;&#xFE0F; 編集</b></div><p class="small dstu-guide">' + (t ? 'トラック「' + escHtml(t.name) + '」を選んでいます。' : '') + 'クリップをクリックすると、ここに音符（ピアノロール）・波形が出ます。もう一度クリック ＝ フルの編集の画面。</p>';
    }
    var c = f.clip, a = M.tickToBar(p, c.start), bars = Math.round(c.len / M.barTicks(p) * 100) / 100, au = c.type === "audio", dr = M.isDrum(f.track);
    var head = '<div class="dstu-eh"><b>' + (au ? "&#x1F3B5;" : (dr ? "&#x1F941;" : "&#x1F3B9;")) + ' ' + escHtml(clipLabel(c)) + '</b><span class="small">' + escHtml(f.track.name) + '・' + a.bar + ' 小節目から ' + bars + ' 小節</span>' +
      (au ? '<button class="modal-btn daw-small" data-cl="edit">&#x2702;&#xFE0F; 編集（フルの画面）</button>' : '<button class="modal-btn daw-small" data-cl="roll">' + (dr ? "&#x1F941; パターンを直す" : "&#x1F3B9; 音符を直す") + '（フルの画面）</button>') + '</div>';
    return head + (au ? stWaveSvg(p, c) : stRollHtml(p, c));
  }
  // E. 🎧 リファレンス（波形・A／B・音量・ミュート。くわしくは、いまのリファレンスの画面）
  function stRefHtml(p) {
    var M = DM(), r = M.refOf(p), s = M.refSpan(p), ab = st.refAB || "both", h = '<div class="dstu-card dstu-ref"><div class="dstu-ch"><b>&#x1F3A7; リファレンス</b><button class="modal-btn daw-small" data-ar="ref">' + (r ? "くわしく" : "置く") + '</button></div>';
    if (!r) { return h + '<p class="small">くらべるための音声（WAV・MP3・M4A・5 分 30 秒まで）。WAV・MIDI の書き出しには入りません。</p></div>'; }
    var a = s ? s.asset : M.findAsset(p, r.asset);
    function abB(v, lab) { return '<button class="modal-btn dfx-tog' + (ab === v ? " on" : "") + '" data-st-ab="' + v + '">' + lab + '</button>'; }
    return h + '<div class="small dstu-rn">' + escHtml(a ? a.name : r.asset) + (a ? '・' + escHtml(M.secText(a.sec)) : '') + '</div>' +
      (s ? '<div class="drf-wave dstu-rw" data-st-refwave="1" title="クリックでその位置へ">' + refWave(p, s, 300, 40) + '<div class="drf-head"></div></div>' : '<p class="small">' + (a ? assetStateText(a.id) : '&#x26A0;&#xFE0F; 素材の情報がありません') + '</p>') +
      '<div class="drf-btns dstu-ab">' + abB("both", "両方") + abB("daw", "DAW だけ") + abB("ref", "&#x1F3A7; だけ") + '</div>' +
      '<div class="dstu-rg"><button class="modal-btn daw-tbtn" data-st-rg="-" aria-label="リファレンスを小さく">&#x2212;</button><b class="drf-gv">' + (r.gain > 0 ? "+" : "") + r.gain + ' dB</b><button class="modal-btn daw-tbtn" data-st-rg="+" aria-label="リファレンスを大きく">&#xFF0B;</button>' +
      '<button class="modal-btn dfx-tog' + (r.mute ? " on" : "") + '" data-st-rm="1">ミュート ' + (r.mute ? "ON" : "OFF") + '</button></div></div>';
  }
  function studioHtml(p) {
    return '<div class="daw dstu" tabindex="-1">' +
      '<div class="daw-top dstu-top"><b>&#x1F39A;&#xFE0F; ゴリラDAW <small class="dstu-badge">PC Studio</small></b><div class="dstu-pbar">' + projBarHtml(p) + '</div>' +
      '<button class="modal-btn daw-small" data-back="1">&#x1F579;&#xFE0F; メニューへ</button></div>' +
      stTransportHtml(p) + secBarHtml(p) + stToolsHtml(p) + inbNoteHtml() + backHtml() +
      '<div class="dstu-grid"><div class="dstu-mainc">' + stOverviewHtml(p) + arrGridHtml(p, true) +
        (st.msg ? '<div class="daw-msg">&#x26A0;&#xFE0F; ' + escHtml(st.msg) + '</div>' : '') +
        '<div class="dstu-bot"><div class="dstu-card dstu-edit">' + stEditHtml(p) + '</div><div class="dstu-ops">' + panelHtml(p) + '</div></div></div>' +
      '<div class="dstu-side">' + stRefHtml(p) + stMixHtml(p) + '</div></div>' +
      cedHtml(p) + secSheetHtml(p) + saveNoteHtml() + '<input type="file" class="da-wavfile" accept="' + AUD_ACCEPT + '" style="display:none;"></div>';
  }
  // プレイヘッド（全体図・編集の見本・🎧）
  function stHead(root, tick) {
    var M = DM(), p = st.project, ov = root.querySelector(".dstu-ovph"), e = root.querySelector(".dstu-eph"), tot = stTotal(p);
    if (ov && tot > 0) { ov.style.left = r1(Math.max(0, Math.min(100, tick / tot * 100))) + "%"; }
    if (e) {
      var f = st.sel && st.sel.kind === "clip" ? M.findClip(p, st.sel.id) : null, rr = f && f.clip.len > 0 ? (tick - f.clip.start) / f.clip.len : -1;
      e.style.display = pl && rr >= 0 && rr <= 1 ? "block" : "none";
      if (rr >= 0) { e.style.left = r1(Math.min(1, rr) * 100) + "%"; }
    }
    refHead(root);
  }
  // PC の操作（DAW の入れ物にフォーカスがあるときだけ。文字の入力・選ぶ欄・スライダーでは何もしない）
  function stTyping(t) { var tg = t && t.tagName ? String(t.tagName).toLowerCase() : ""; return tg === "input" || tg === "textarea" || tg === "select" || !!(t && t.isContentEditable); }
  function stIsSpace(ev) { return ev.key === " " || ev.key === "Spacebar" || ev.keyCode === 32; }
  function stKey(ev, root, ctl) {
    if (!ev || stTyping(ev.target) || ev.altKey) { return false; }
    var k = ev.key, mod = ev.ctrlKey || ev.metaKey;
    if (stIsSpace(ev) && !mod) {
      keepScroll(root);
      if (rec.state === "rec" || rec.state === "ask") { recStop("btn"); } else { togglePlay(); } // §345 A20: Space ＝ 一時停止／続きから
    } else if (!mod && (k === "[" || k === "]" || ev.keyCode === 219 || ev.keyCode === 221)) { // §345 A22: [ ] ＝ 前／次のセクション
      if (ev.preventDefault) { ev.preventDefault(); }
      keepScroll(root); secStep(k === "[" || ev.keyCode === 219 ? -1 : 1); tpReveal(root); render(root, ctl);
      return true;
    } else if (!mod && (k === "," || k === "." || k === "<" || k === ">" || ev.keyCode === 188 || ev.keyCode === 190)) { // §345 A20: , . ＝ 1 小節・Shift で 4 小節
      if (ev.preventDefault) { ev.preventDefault(); }
      keepScroll(root); nudgeBars((k === "," || k === "<" || ev.keyCode === 188 ? -1 : 1) * (ev.shiftKey ? 4 : 1)); tpReveal(root); render(root, ctl);
      return true;
    } else if (mod && (((k === "z" || k === "Z" || ev.keyCode === 90) && ev.shiftKey) || k === "y" || k === "Y" || ev.keyCode === 89)) { // §345 A27: ↷（Ctrl+Shift+Z・Ctrl+Y）
      if (ev.preventDefault) { ev.preventDefault(); }
      keepScroll(root);
      if (st.redo.length) { ops.redo(); }
      return true;
    } else if ((k === "z" || k === "Z" || ev.keyCode === 90) && mod && !ev.shiftKey) {
      if (ev.preventDefault) { ev.preventDefault(); }
      keepScroll(root);
      if (st.undo.length) { ops.undo(); }
      return true;
    } else if (k === "Escape" || k === "Esc" || ev.keyCode === 27) {
      if (st.confirmDel) { st.confirmDel = null; } else if (st.chooseAdd) { st.chooseAdd = false; } else if (st.repeat) { st.repeat = null; } else if (aud.stage) { stageCancel(); } else if (st.sel) { st.sel = null; st.anote = ""; } else { return false; }
      keepScroll(root);
    } else { return false; }
    if (ev.preventDefault) { ev.preventDefault(); }
    if (st.root === root && st.view === "arr") { render(root, ctl); }
    return true;
  }
  function stFocusIn(root) { var a = window.document && document.activeElement; return !a || a === document.body || (root.contains ? root.contains(a) : false); }
  function bindStudio(root, ctl) {
    var S = root.querySelector(".dstu"), M = DM(), p = st.project, k, els;
    if (!S) { return; }
    els = S.querySelectorAll("[data-zoom],[data-stx],[data-stx-fx],[data-st-ab],[data-st-rg],[data-st-rm]");
    for (k = 0; k < els.length; k++) {
      els[k].onclick = function (ev) {
        var el = ev.currentTarget, v, r;
        if (ev.stopPropagation) { ev.stopPropagation(); }
        keepScroll(root);
        if ((v = el.getAttribute("data-zoom"))) { stZoom(root, v === "+" ? 1 : -1); return; }
        if ((v = el.getAttribute("data-stx-fx"))) { if (M.findTrack(p, v)) { st.view = "fx"; st.fxTrack = v; renderFx(root, ctl); } return; }
        if ((v = el.getAttribute("data-stx"))) {
          if (v === "master") { st.view = "master"; renderMaster(root, ctl); }
          else if (v === "sendfx") { st.view = "sendfx"; renderSendFx(root, ctl); }
          else if (v === "wav") { if (rec.state === "rec" || rec.state === "ask") { recStop("btn"); } else if (pl) { stopPlay(false); } st.view = "proj"; sv.note = ""; renderProj(root, ctl); } // 📁 曲 と同じ
          return;
        }
        if ((v = el.getAttribute("data-st-ab"))) { refSetAB(v); render(root, ctl); return; }
        if ((v = el.getAttribute("data-st-rg"))) { r = M.refOf(p); if (r) { M.refSet(p, "gain", r.gain + (v === "+" ? 1 : -1)); refApply(); markDirty(); } render(root, ctl); return; }
        if (el.getAttribute("data-st-rm")) { r = M.refOf(p); if (r) { M.refSet(p, "mute", !r.mute); refApply(); markDirty(); } render(root, ctl); }
      };
    }
    var rs = S.querySelectorAll(".dstu-mix input[type=range]");
    for (k = 0; k < rs.length; k++) {
      rs[k].oninput = function (ev) {
        var el = ev.currentTarget, id = el.getAttribute("data-mxv"), pid = el.getAttribute("data-mxp"), lab;
        if (id === "master") { mixer.setMaster(el.value); lab = S.querySelector('[data-mxval="master"]'); if (lab) { lab.textContent = String(Math.round(el.value)); } return; }
        if (id) { mixer.setVol(id, el.value); lab = S.querySelector('[data-mxval="' + id + '"]'); if (lab) { lab.textContent = String(Math.round(el.value)); } return; }
        if (pid) { mixer.setPan(pid, Number(el.value) / 100); lab = S.querySelector('[data-mxpval="' + pid + '"]'); if (lab) { lab.textContent = panText(Number(el.value) / 100); } }
      };
      rs[k].onchange = function () { mixer.commit(); };
    }
    var arr = S.querySelector(".daw-arr"), ov = S.querySelector("[data-stov]"), rr = S.querySelector(".daw-ruler-row"), rw = S.querySelector("[data-st-refwave]");
    function wheelX(ev) { // 縦のホイール → 横へ（全体図・目盛りの上だけ。Ctrl＋ホイールの拡大は止めない）
      if (!arr || ev.ctrlKey || ev.metaKey) { return; }
      var dy = ev.deltaY || 0, dx = ev.deltaX || 0;
      if (Math.abs(dy) <= Math.abs(dx)) { return; }
      arr.scrollLeft = (arr.scrollLeft || 0) + dy * (ev.deltaMode === 1 ? 16 : (ev.deltaMode === 2 ? (arr.clientWidth || 400) : 1)); st.scroll = arr.scrollLeft;
      if (ev.preventDefault) { ev.preventDefault(); }
    }
    if (arr) { arr.onscroll = function () { stOvSync(S); }; }
    if (ov && arr) {
      ov.onclick = function (ev) { var rc = ov.getBoundingClientRect ? ov.getBoundingClientRect() : null; if (!rc || !(rc.width > 0)) { return; } var f = Math.max(0, Math.min(1, (ev.clientX - rc.left) / rc.width)), vis = Math.max(0, (arr.clientWidth || 0) - HEAD_W); arr.scrollLeft = Math.max(0, f * tickX(stTotal(p)) - vis / 2); st.scroll = arr.scrollLeft; stOvSync(S); };
      ov.onwheel = wheelX;
    }
    if (rr && arr) { rr.onwheel = wheelX; }
    if (rw) { rw.onclick = function (ev) { var s = M.refSpan(p), rc = rw.getBoundingClientRect ? rw.getBoundingClientRect() : null; if (!s || !rc || !(rc.width > 0)) { return; } var f = Math.max(0, Math.min(1, (ev.clientX - rc.left) / rc.width)), tk = Math.max(0, Math.round(M.secToTick(p, Math.max(0, s.start + f * s.dur)))); if (refJump(tk)) { st.scroll = Math.max(0, tickX(tk) - 24); } render(root, ctl); }; }
    S.onkeydown = function (ev) { stKey(ev, root, ctl); };
    S.onkeyup = function (ev) { if (stIsSpace(ev) && !stTyping(ev.target) && ev.preventDefault) { ev.preventDefault(); } }; // ボタンの上の Space で、ボタンを押したことにしない
    stOvSync(S);
  }

  // §341 9A-5: 選んだクリップ・トラックの操作の欄（小さい画面でも押しやすいボタン）
  function panelHtml(p) {
    var M = DM(), s = st.sel, h = (st.anote ? '<div class="da-note">' + st.anote + '</div>' : '') + stageHtml(); // 9B-20: 読みこんだ音声を確かめる
    if (rec.open) { var rh = recHtml(p); if (rh) { return h + rh; } } // 9A-12: 録音の欄
    if (st.chooseAdd) {
      return h + '<div class="daw-info da-panel"><div>&#xFF0B; どのトラックを足しますか？</div><div class="da-btns da-btns3">' +
        '<button class="modal-btn" data-ar="addSynth">&#x1F3B9; シンセ</button><button class="modal-btn" data-ar="addDrum">&#x1F941; ドラム</button><button class="modal-btn" data-ar="addAudio">&#x1F3B5; オーディオ</button>' +
        '<button class="modal-btn da-wide" data-ar="addCancel">やめる</button></div>' +
        '<div class="small">&#x1F3B5; オーディオ ＝ WAV（ウクレレ・歌など）を読みこんで並べるトラック（' + M.MAX_AUDIO_TRACKS + ' 本まで）</div></div>';
    }
    function b(kind, act, label, cls) { return '<button class="modal-btn' + (cls ? " " + cls : "") + '" data-' + kind + '="' + act + '">' + label + '</button>'; }
    if (s && s.kind === "clip") {
      var f = M.findClip(p, s.id);
      if (f && st.repeat && st.repeat.clip === f.clip.id) { return h + repeatHtml(p, f); } // 9B-1
      if (f && f.clip.type === "audio") { // §341 9A-10: 音声のクリップ
        var ac0 = f.clip, aa0 = M.findAsset(p, ac0.asset), ab0 = M.tickToBar(p, ac0.start), abars = Math.round(ac0.len / M.barTicks(p) * 100) / 100, astate = assetState(ac0.asset);
        var csec = M.tickToSec(p, ac0.start + ac0.len) - M.tickToSec(p, ac0.start), asec = aa0 ? aa0.sec - (ac0.srcOffset || 0) : 0;
        return h + '<div class="daw-info da-panel"><div>&#x1F3B5; <b>' + escHtml(clipLabel(ac0)) + '</b>（' + escHtml(f.track.name) + '）: ' + ab0.bar + '小節目から ' + abars + '小節（' + (Math.round(csec * 10) / 10) + ' 秒）・音声 ' + (aa0 ? (Math.round(aa0.sec * 10) / 10) + ' 秒' : '？') +
          (aa0 && asec > csec + 0.01 && !M.audioSpan(p, ac0).edited ? '<br><span class="small">&#x2702;&#xFE0F; クリップが短いので、後ろの ' + (Math.round((asec - csec) * 10) / 10) + ' 秒は鳴りません</span>' : '') +
          aeditSummary(p, ac0) +
          '<br><span class="small">' + assetStateText(ac0.asset) + '</span></div>' +
          '<div class="da-btns">' + (astate === "ready" || astate === "loading" || !astate ? b("cl", "edit", "&#x2702;&#xFE0F; 編集（前後・位置・フェード・テイク）", "da-wide da-aedit") + b("cl", "take", "&#x1F399;&#xFE0F; 別テイクを録音", "da-wide da-take") : b("cl", "relink", "&#x1F517; 素材を選びなおす（同じ WAV）", "da-wide")) +
          b("cl", "dup", "&#x29C9; 複製") + b("cl", "repeat", "&#x1F501; 繰り返し") + b("cl", "left", "&#x25C0; 1小節") + b("cl", "right", "1小節 &#x25B6;") + b("cl", "shorter", "&#x2212; 短く") +
          b("cl", "longer", "&#xFF0B; 長く") + b("cl", "name", "&#x270F;&#xFE0F; 名前") + b("cl", "del", "&#x1F5D1;&#xFE0F; 削除", "da-half") + '</div></div>';
      }
      if (f) {
        var c = f.clip, a = M.tickToBar(p, c.start), bars = Math.round(c.len / M.barTicks(p) * 100) / 100, hid = M.hiddenNotes(c);
        return h + '<div class="daw-info da-panel"><div>&#x1F3B5; <b>' + escHtml(clipLabel(c)) + '</b>（' + escHtml(f.track.name) + '）: ' + a.bar + '小節目から ' + bars + '小節・音符 ' + (c.notes.length - hid) + ' 個' + (hid ? '（はみ出て鳴らない音符 ' + hid + ' 個）' : '') + '</div>' +
          '<div class="da-btns">' + (M.isDrum(f.track) ? b("cl", "roll", "&#x1F941; パターンを直す", "da-wide") : b("cl", "roll", "&#x1F3B9; 音符を直す", "da-wide")) + b("cl", "dup", "&#x29C9; 複製") + b("cl", "repeat", "&#x1F501; 繰り返し") + b("cl", "left", "&#x25C0; 1小節") + b("cl", "right", "1小節 &#x25B6;") +
          b("cl", "shorter", "&#x2212; 短く") + b("cl", "longer", "&#xFF0B; 長く") + b("cl", "name", "&#x270F;&#xFE0F; 名前") + b("cl", "del", "&#x1F5D1;&#xFE0F; 削除") + '</div></div>';
      }
    }
    if (s && s.kind === "track") {
      var t = M.findTrack(p, s.id);
      if (t) {
        if (st.confirmDel === t.id) {
          var nc = 0, nn = 0, q; for (q = 0; q < t.clips.length; q++) { nc++; nn += (t.clips[q].notes || []).length; }
          return h + '<div class="daw-info da-panel da-confirm"><div>&#x26A0;&#xFE0F; 「<b>' + escHtml(t.name) + '</b>」を削除します。中のクリップ ' + nc + ' 個（音符 ' + nn + ' 個）も消えます。' + (pl ? '再生は止まります。' : '') + '消したあとも &#x21B6; で戻せます。</div>' +
            '<div class="da-btns">' + b("tr", "delYes", "&#x1F5D1;&#xFE0F; 削除する", "da-half da-danger") + b("tr", "delNo", "やめる", "da-half") + '</div></div>';
        }
        return h + '<div class="daw-info da-panel"><div>' + infoHtml(p) + '</div><div class="da-btns">' + (M.isAudio(t) ? b("tr", "rec", "&#x1F399;&#xFE0F; 録音", "da-wide dr-open") + b("tr", "wav", "&#x1F3B5; WAV を読みこむ", "da-wide") : b("tr", "clip", "&#xFF0B; クリップ", "da-wide")) + b("tr", "name", "&#x270F;&#xFE0F; 名前") + b("tr", "up", "&#x25B2; 上へ") + b("tr", "down", "&#x25BC; 下へ") + b("tr", "auto", "&#x1F4C8; オートメーション", "da-wide") + b("tr", "del", "&#x1F5D1;&#xFE0F; トラックを削除", "da-wide da-danger-o") + '</div></div>';
      }
    }
    return h + '<div class="daw-info">' + infoHtml(p) + '</div>';
  }
  function infoHtml(p) {
    var M = DM(), s = st.sel;
    if (s && s.kind === "clip") {
      var f = M.findClip(p, s.id);
      if (f) {
        var c = f.clip, a = M.tickToBar(p, c.start), lo = 127, hi = 0, i;
        for (i = 0; i < c.notes.length; i++) { lo = Math.min(lo, c.notes[i][2]); hi = Math.max(hi, c.notes[i][2]); }
        var bars = Math.round(c.len / M.ticksPerBar(M.meterAt(p, c.start)) * 100) / 100;
        return '&#x1F3B5; <b>' + escHtml((c.ext && c.ext.name) || "クリップ") + '</b>（' + escHtml(f.track.name) + '）: ' + a.bar + '小節目から ' + bars + '小節・音符 ' + c.notes.length + ' 個' +
          (c.notes.length ? '・音域 ' + noteName(lo) + '〜' + noteName(hi) : '') + '<br><span class="small">タップするとピアノロールで直せます</span>';
      }
    }
    if (s && s.kind === "track") {
      var t = M.findTrack(p, s.id);
      if (t) { return ((t.ext && t.ext.icon) || "&#x1F3B5;") + ' <b>' + escHtml(t.name) + '</b>: ' + (M.isAudio(t) ? 'オーディオ（WAV）' : 'ゴリラシンセ「' + instName(t) + '」') + '・クリップ ' + t.clips.length + ' 個・音量 ' + t.vol + (t.mute ? '・ミュート' : '') + (t.solo ? '・ソロ' : '') + (M.isAudio(t) && !t.clips.length ? '<br><span class="small">「&#x1F3B5; WAV を読みこむ」か、トラックの ＋ で WAV を選んでください（' + (M.WAV_MAX_BYTES / 1048576) + 'MB・' + M.WAV_MAX_SEC + ' 秒まで）</span>' : ''); }
    }
    return '<span class="small">クリップをタップすると選べて、下に操作が出ます（もう一度タップで音符を直す）。トラック名をタップするとトラックを選べます。全部で ' + p.tracks.length + ' トラック・' + M.viewBars(p) + ' 小節・曲の長さ ' + secText(M.tickToSec(p, M.songEndTick(p))) + '。</span>';
  }

  // ---------- §341 9A-3: ピアノロール ----------
  // 縦 ＝ 音の高さ（C1〜C7・1 段 RH px）、横 ＝ 拍（1 拍 RB px）。音符の t・d はクリップの中の tick（offset から）
  var RB = 56, RH = 24, LO = 24, HI = 96, KEYW = 44, UNDO_MAX = 20;
  var SNAPS = [[960, "1/4"], [480, "1/8"], [240, "1/16"]];
  // ---------- §341 9A-4: 保存・読みこみ・JSON ----------
  // localStorage: KEY ＝ 曲の一覧、KEY:p:<ID> ＝ 曲 1 つ（JSON の書き出しと同じ形）、KEY:broken:<時刻> ＝ 読めなかった一覧の写し
  var SAVE_DELAY = 500, STORE_FORMAT = "ultimate-gorilla-daw-store";
  var sv = { status: "demo", at: 0, msg: "", timer: null, note: "" }; // status: demo / dirty / saved / error / readonly
  function skey() { return DM().STORE_KEY; }
  function pkey(id) { return skey() + ":p:" + id; }
  // 読む: 文字（無ければ null）。localStorage が使えないときは undefined
  function lsRaw(k) { try { return window.localStorage ? window.localStorage.getItem(k) : undefined; } catch (e) { return undefined; } }
  // 書く: 書いたあと読みなおして同じなら true（容量いっぱい・プライベートブラウズ・禁止はどれも false）
  function lsPut(k, v) { try { window.localStorage.setItem(k, v); return window.localStorage.getItem(k) === v; } catch (e) { return false; } }
  function emptyIndex() { return { format: STORE_FORMAT, schemaVersion: 1, last: "", list: [] }; }
  // 一覧を読む → { ok, idx } / { ok:false, error:"storage" | "broken", raw }
  function readIndex() {
    var raw = lsRaw(skey()), o;
    if (raw === undefined) { return { ok: false, error: "storage", why: "このブラウザでは保存が使えません（プライベートブラウズ・保存の禁止など）" }; }
    if (raw === null) { return { ok: true, idx: emptyIndex() }; }
    try { o = JSON.parse(raw); } catch (e) { o = null; }
    if (!o || o.format !== STORE_FORMAT || Object.prototype.toString.call(o.list) !== "[object Array]") { return { ok: false, error: "broken", raw: raw, why: "保存した曲の一覧が読めませんでした（データは消さずに残しています）" }; }
    if (Number(o.schemaVersion) > 1) { return { ok: false, error: "newer", raw: raw, why: "新しい版のゴリラDAW の保存なので、この版では書きかえません" }; }
    return { ok: true, idx: o };
  }
  // 一覧がこわれたとき: 保存してある曲のキーを探して一覧を作りなおす（キーの一覧が取れないブラウザでは空）
  function scanProjects() {
    var out = [], pre = skey() + ":p:", i, k, n;
    try {
      var ls = window.localStorage;
      n = ls.length;
      for (i = 0; i < n; i++) {
        k = ls.key(i);
        if (!k || k.indexOf(pre) !== 0) { continue; }
        var r = DM().parseRecordText(ls.getItem(k));
        if (r.ok) { out.push({ id: k.substring(pre.length), name: r.project.name, saved: r.project.saved || 0, created: r.project.created || 0, notes: DM().noteCount(r.project), tracks: r.project.tracks.length }); }
      }
    } catch (e) { return out; }
    return out;
  }
  function findEntry(idx, id) { var i; for (i = 0; i < idx.list.length; i++) { if (idx.list[i] && idx.list[i].id === id) { return i; } } return -1; }
  // 曲 1 つを読む → fromRecord の結果
  function loadProject(id) {
    var raw = lsRaw(pkey(id));
    if (raw === undefined) { return { ok: false, error: "storage", why: "このブラウザでは保存が使えません" }; }
    if (raw === null) { return { ok: false, error: "missing", why: "保存した曲が見つかりません" }; }
    return DM().parseRecordText(raw);
  }
  function loadLast() {
    var r = readIndex();
    if (!r.ok) { return r; }
    if (!r.idx.last) { return { ok: false, error: "none" }; }
    var q = loadProject(r.idx.last);
    if (!q.ok) { q.why = "最後に開いていた曲を読めませんでした（" + q.why + "）。見本の曲を開きました。保存したデータは消していません"; }
    return q;
  }
  function setStatus(s, msg) { sv.status = s; sv.msg = msg || ""; drawStatus(); }
  // いま保存する（成功したときだけ「保存ずみ」）
  function saveNow() {
    if (sv.timer) { clearTimeout(sv.timer); sv.timer = null; }
    var p = st.project, M = DM();
    if (!p || !M) { return false; }
    if (p.readOnly) { setStatus("readonly", "新しい版のデータなので保存しません"); return false; }
    var r = readIndex(), now = Date.now();
    if (!r.ok && r.error === "broken") {
      // 一覧がこわれている: 元の文字を別のキーに写して守ってから、新しい一覧を作る
      if (!lsPut(skey() + ":broken:" + now, r.raw)) { setStatus("error", "保存した曲の一覧が読めず、控えも作れなかったので、保存をやめました。JSON に書き出して控えを作ってください"); return false; }
      r = { ok: true, idx: emptyIndex() };
      r.idx.list = scanProjects();
      sv.note = "読めなかった一覧は「" + skey() + ":broken:" + now + "」に残しました";
    }
    if (!r.ok) { setStatus("error", r.why); return false; }
    var rec = M.toRecord(p, now), text = JSON.stringify(rec);
    if (!lsPut(pkey(p.id), text)) { setStatus("error", "保存できませんでした（容量がいっぱい・プライベートブラウズなど）。JSON に書き出して控えを作ってください"); return false; }
    var idx = r.idx, at = findEntry(idx, p.id), ent = { id: p.id, name: p.name, saved: now, created: p.created || now, notes: M.noteCount(p), tracks: p.tracks.length };
    if (at >= 0) { idx.list[at] = ent; } else { idx.list.push(ent); }
    idx.list.sort(function (a, b) { return (b.saved || 0) - (a.saved || 0); });
    idx.last = p.id;
    if (!lsPut(skey(), JSON.stringify(idx))) { setStatus("error", "曲は書けましたが、一覧を書けませんでした。JSON に書き出して控えを作ってください"); return false; }
    p.saved = now;
    sv.at = now;
    setStatus("saved", "");
    return true;
  }
  // 直した: 0.5 秒後にまとめて保存（ドラッグ中は呼ばない・確定したときだけ）
  function markDirty() {
    if (!st.project || st.project.readOnly) { return; }
    if (sv.timer) { clearTimeout(sv.timer); }
    sv.status = "dirty";
    sv.timer = setTimeout(function () { sv.timer = null; saveNow(); }, SAVE_DELAY);
    drawStatus();
  }
  // 待っている保存を今すぐ（曲を切りかえる・画面を隠す・メニューへ戻る）
  function flushSave() { if (sv.timer) { saveNow(); } }
  if (window.addEventListener) { window.addEventListener("pagehide", flushSave); }
  if (window.document && document.addEventListener) { document.addEventListener("visibilitychange", function () { if (document.hidden) { flushSave(); } }); }
  function fmtTime(ms) { if (!ms) { return ""; } var d = new Date(ms), z = function (n) { return (n < 10 ? "0" : "") + n; }; return (d.getMonth() + 1) + "/" + d.getDate() + " " + z(d.getHours()) + ":" + z(d.getMinutes()); }
  function statusHtml() {
    var s = sv.status;
    if (s === "saved") { return '<span class="dsv dsv-ok">&#x2705; 保存ずみ ' + fmtTime(sv.at) + '</span>'; }
    if (s === "dirty") { return '<span class="dsv dsv-wait">&#x270F;&#xFE0F; 保存待ち…</span>'; }
    if (s === "error") { return '<span class="dsv dsv-err">&#x26A0;&#xFE0F; 保存できません</span>'; }
    if (s === "readonly") { return '<span class="dsv dsv-err">&#x1F512; 読むだけ</span>'; }
    return '<span class="dsv dsv-demo">&#x1F4C4; 見本（まだ保存していない）</span>';
  }
  // 画面の下の説明（保存の状態に合わせる。成功のふりをしない）
  function saveNoteHtml() {
    if (sv.status === "error" || sv.status === "readonly") { return '<div class="daw-msg">&#x26A0;&#xFE0F; ' + escHtml(sv.msg || "保存できません") + '</div>'; }
    var h = sv.msg ? '<div class="daw-msg">&#x26A0;&#xFE0F; ' + escHtml(sv.msg) + '</div>' : '';
    if (sv.status === "demo") { return h + '<p class="small dsv-note">見本の曲です。直すと、自動で「じぶんの曲」として保存します。</p>'; }
    return h + '<p class="small dsv-note">直すと自動で保存します（この端末のこのブラウザの中だけ）。</p>';
  }
  function drawStatus() {
    var root = st.root;
    if (!root || !root.querySelectorAll) { return; }
    var els = root.querySelectorAll(".dsv-slot"), i;
    for (i = 0; i < els.length; i++) { els[i].innerHTML = statusHtml(); }
  }
  // 曲を切りかえる（いまの曲の待っている保存を先に書く・再生を止める）
  function switchTo(p, status) {
    if (rec.state === "rec" || rec.state === "ask") { recCancel("曲を切りかえたので、録音をやめました（録った音は捨てました）"); } rec.open = false; // 9A-12
    flushSave();
    stopPlay(false);
    wavCancel(); wavFree(); wav.state = "idle"; wav.msg = ""; wav.note = "";
    audFree(p); // 9A-10: 新しい曲で使わない音声を捨てる
    if (!pk.busy) { packFree(); pk.state = "idle"; pk.msg = ""; } pk.istate = "idle"; pk.imsg = ""; // 9A-11
    midiFree(); // 9B-4
    lmClear(); // 9B-17
    aud.stage = null; st.rfMsg = ""; st.refAB = "both"; // 9B-20
    st.project = p; st.view = "arr"; st.roll = null; st.sel = null; st.cue = null; st.secUI = null; st.repeat = null; st.secMsg = ""; st.scroll = 0; st.undo.length = 0; st.redo.length = 0; st.anote = ""; st.steps = null; st.chooseAdd = false; st.confirmDel = null;
    sv.status = status; sv.msg = ""; sv.at = p.saved || 0;
  }
  var proj = {
    // 保存した曲の一覧（読めない曲も「読めない」として出す）
    list: function () {
      var r = readIndex(), out = [], i;
      if (!r.ok) { return { ok: false, why: r.why, list: [] }; }
      for (i = 0; i < r.idx.list.length; i++) { var e = r.idx.list[i]; if (e && e.id) { out.push({ id: e.id, name: String(e.name || "（名前なし）"), saved: e.saved || 0, notes: e.notes || 0, ok: lsRaw(pkey(e.id)) !== null }); } }
      return { ok: true, list: out, last: r.idx.last };
    },
    open: function (id) {
      if (st.project && st.project.id === id) { return { ok: true }; }
      var r = loadProject(id);
      if (!r.ok) { sv.note = "開けませんでした: " + r.why + "（データは消していません）"; return r; }
      switchTo(r.project, "saved");
      var ix = readIndex(); if (ix.ok) { ix.idx.last = id; lsPut(skey(), JSON.stringify(ix.idx)); }
      return r;
    },
    // 新しい曲（kind: "empty" ＝ からっぽ / "demo" ＝ 見本から）。すぐ保存して一覧に出す
    create: function (kind) {
      var M = DM(), p = kind === "demo" ? M.demoProject() : M.emptyProject();
      p.id = M.newProjectId();
      if (kind === "demo") { p.name = "見本からの曲"; }
      switchTo(p, "dirty");
      saveNow();
      return p;
    },
    rename: function (name) {
      var p = project(); name = String(name || "").replace(/[\u0000-\u001f]/g, "").replace(/^\s+|\s+$/g, "").substring(0, 40);
      if (!name) { return false; }
      p.name = name;
      return saveNow() || true;
    },
    // JSON に書き出す（DAW の曲だけ・UTF-8）
    exportJson: function () {
      var p = project(), M = DM(), text = JSON.stringify(M.toRecord(p, p.saved || Date.now()), null, 1);
      var d = new Date(), z = function (n) { return (n < 10 ? "0" : "") + n; };
      var base = String(p.name || "gorilla-daw").replace(/[\\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/^[\s.]+|[\s.]+$/g, "").substring(0, 40) || "gorilla-daw";
      var name = base + "_" + d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + "-" + z(d.getHours()) + z(d.getMinutes()) + ".json";
      var how = "fail";
      try { how = I.saveBlob(new Blob([text], { type: "application/json" }), name); } catch (e) { how = "fail"; }
      sv.note = how === "fail" ? "書き出せませんでした" : "「" + name + "」を書き出しました" + (how === "share" ? "（共有シートから「ファイルに保存」を選んでください）" : "");
      var na = (p.assets || []).length; // §341 9A-10: JSON だけで全部の控えにならないことを書く
      if (how !== "fail" && na) { sv.note += "。⚠️ この JSON に音声（WAV）" + na + " 個の中身は入っていません。WAV ファイルは別に残してください"; }
      return { ok: how !== "fail", name: name, text: text, how: how, assets: na };
    },
    // §341 9A-10: 使っていない素材を曲から外す（端末の IndexedDB の中身は消さない）
    unasset: function (id) {
      var p = project(), M = DM(), l = p.assets || [], i;
      if (M.assetUse(p, id) > 0) { sv.note = "クリップが使っている素材は外せません"; return false; }
      for (i = 0; i < l.length; i++) { if (l[i].id === id) { var nm = l[i].name; l.splice(i, 1); markDirty(); flushSave(); sv.note = "「" + nm + "」を曲から外しました（端末の中の WAV は消していません）"; return true; } }
      return false;
    },
    // JSON を読みこむ（検証してから・新しい曲として保存・ほかの曲を上書きしない）
    importText: function (text) {
      var M = DM(), r = M.parseRecordText(text);
      if (!r.ok) { sv.note = "読みこめませんでした: " + r.why + "（いまの曲と保存した曲はそのままです）"; return r; }
      var p = r.project, ix = readIndex(), i;
      if (ix.ok) {
        if (findEntry(ix.idx, p.id) >= 0 || (st.project && st.project.id === p.id)) { p.id = M.newProjectId(); }
        for (i = 0; i < ix.idx.list.length; i++) { if (ix.idx.list[i] && ix.idx.list[i].name === p.name) { p.name = (p.name + "（読みこみ）").substring(0, 40); break; } }
      } else if (st.project && st.project.id === p.id) { p.id = M.newProjectId(); }
      switchTo(p, "dirty");
      var ok = saveNow();
      sv.note = "「" + p.name + "」を読みこみました" + (ok ? "" : "（ただし保存できませんでした）");
      return { ok: true, project: p, saved: ok };
    }
  };
  // ---------- §341 9A-10: オーディオトラック（素材の WAV は IndexedDB・デコードした音はメモリだけ）----------
  // aud.st[素材の ID]: "loading" | "ready" | "missing"（端末に無い）| "error"（読めない）| "nodb"（IndexedDB が使えない）
  var IDB_NAME = "ultimateGorillaDawAudioV1", IDB_VER = 1, FADE_IN = 0.003, FADE_OUT = 0.005, WAVE_CACHE = 200;
  var AUD_ACCEPT = ".wav,.mp3,.m4a,.aac,.mp4,audio/wav,audio/x-wav,audio/wave,audio/vnd.wave,audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/*"; // 9B-20: 形式は中身で決める（拡張子は選びやすくするだけ）
  var aud = { db: null, dbState: "", dbWhy: "", opening: [], st: {}, err: {}, wait: {}, buf: {}, peaks: {}, wave: {}, waveN: 0, busy: false, pending: null, playTok: null, kicked: false };
  function errName(e) { return String((e && (e.name || e.message)) || e || "エラー").substring(0, 60); }
  function storeErr(e) { var n = errName(e); return /quota/i.test(n) ? "端末の空き容量が足りないため、音声を保存できませんでした" : "音声を保存できませんでした（" + n + "）"; }
  function idbOpen(cb) {
    if (aud.db) { cb(aud.db, ""); return; }
    if (aud.dbState === "none") { cb(null, aud.dbWhy); return; }
    aud.opening.push(cb);
    if (aud.opening.length > 1) { return; }
    var f = null, rq = null;
    function fin(db, why) {
      var l = aud.opening, i; aud.opening = [];
      if (db) { aud.db = db; aud.dbState = "ok"; } else { aud.dbState = "none"; aud.dbWhy = why; }
      for (i = 0; i < l.length; i++) { try { l[i](db, why); } catch (e) {} }
    }
    try { f = window.indexedDB || null; } catch (e0) { f = null; }
    if (!f) { fin(null, "このブラウザでは音声の素材を保存できません（IndexedDB が使えません）"); return; }
    try { rq = f.open(IDB_NAME, IDB_VER); } catch (e1) { fin(null, "音声の素材の保存場所（IndexedDB）を開けませんでした（" + errName(e1) + "・プライベートブラウズなど）"); return; }
    rq.onupgradeneeded = function () {
      var db = rq.result;
      if (!db.objectStoreNames.contains("blobs")) { db.createObjectStore("blobs", { keyPath: "id" }); }
      if (!db.objectStoreNames.contains("meta")) { db.createObjectStore("meta", { keyPath: "id" }); }
    };
    rq.onsuccess = function () { var db = rq.result; try { db.onversionchange = function () { try { db.close(); } catch (e2) {} aud.db = null; aud.dbState = ""; }; } catch (e3) {} fin(db, ""); };
    rq.onerror = function () { fin(null, "音声の素材の保存場所（IndexedDB）を開けませんでした（" + errName(rq.error) + "）"); };
    rq.onblocked = function () { aud.opening.length && fin(null, "ほかのタブがゴリラDAW の音声の保存場所を使っています。ほかのタブを閉じて、ページを読みなおしてください"); };
  }
  // 1 つ読む → cb(値 | null（無い）| undefined（読めない）, 理由)
  function idbGet(store, id, cb) {
    idbOpen(function (db, why) {
      if (!db) { cb(undefined, why); return; }
      var r, done = false;
      function end(v, w) { if (!done) { done = true; cb(v, w); } }
      try { r = db.transaction([store], "readonly").objectStore(store).get(id); } catch (e) { end(undefined, errName(e)); return; }
      r.onsuccess = function () { end(r.result || null, ""); };
      r.onerror = function () { end(undefined, errName(r.error)); };
    });
  }
  // 素材を書く（blobs と meta を 1 つのトランザクションで。完了したら cb("")・失敗は理由）
  function idbPutAsset(meta, data, cb) {
    idbOpen(function (db, why) {
      if (!db) { cb(why); return; }
      var tx, done = false;
      function end(w) { if (!done) { done = true; cb(w); } }
      try { tx = db.transaction(["blobs", "meta"], "readwrite"); } catch (e) { end(storeErr(e)); return; }
      tx.oncomplete = function () { end(""); };
      tx.onerror = function () { end(storeErr(tx.error)); };
      tx.onabort = function () { end(storeErr(tx.error)); };
      try { tx.objectStore("blobs").put({ id: meta.id, data: data }); tx.objectStore("meta").put(meta); } catch (e2) { try { tx.abort(); } catch (e3) {} end(storeErr(e2)); }
    });
  }
  // 書いたあとに読みなおして確かめる（大きさ・ハッシュ）
  function verifyAsset(id, bytes, cb) {
    idbGet("meta", id, function (m, w1) {
      if (!m) { cb("保存した音声を確かめられませんでした（" + (w1 || "見つかりません") + "）"); return; }
      idbGet("blobs", id, function (b, w2) {
        var n = b && b.data ? dataSize(b.data) : -1; // 9B-20: Blob（長い・圧縮の素材）は大きさだけ（中身をメモリに読まない）
        if (n !== bytes || m.bytes !== bytes || m.hash !== id) { cb("保存した音声を確かめられませんでした（" + (w2 || "大きさがちがいます") + "）"); return; }
        cb("");
      });
    });
  }
  // デコード（素材のレートのままの OfflineAudioContext。できなければ UGMelody.audio.ctx）→ cb(AudioBuffer | null, 理由)
  function decodeWav(ab, info, cb, keep) {
    var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext, ctx = null, done = false;
    function ok(b) { if (done) { return; } done = true; if (b && b.length > 0) { cb(b, ""); } else { cb(null, "この WAV の音を読めませんでした"); } }
    function ng(e) { if (!done) { done = true; cb(null, "このブラウザではこの WAV を読めませんでした（" + errName(e) + "）"); } }
    try { if (OAC) { ctx = new OAC(Math.max(1, Math.min(2, info.ch || 2)), 1, info.sr || 44100); } } catch (e) { ctx = null; }
    if (!ctx || !ctx.decodeAudioData) { var UG = window.UGMelody; try { ctx = UG && UG.audioInit ? UG.audioInit() : null; } catch (e2) { ctx = null; } }
    if (!ctx || !ctx.decodeAudioData) { ng("decodeAudioData がありません"); return; }
    try { var pr = ctx.decodeAudioData(keep ? ab.slice(0) : ab, ok, ng); if (pr && pr.then) { pr.then(ok, ng); } } catch (e3) { ng(e3); }
  }
  function peaksOf(buf) { var ch = [], c; for (c = 0; c < buf.numberOfChannels; c++) { ch.push(buf.getChannelData(c)); } return DM().computePeaks(ch, buf.sampleRate, DM().PEAK_RATE); }
  // 曲のクリップが使う素材の ID（重ならない）
  function usedAssets(p) {
    var out = [], seen = {}, i, j;
    for (i = 0; p && i < p.tracks.length; i++) { for (j = 0; j < p.tracks[i].clips.length; j++) { var ca = DM().clipAssets(p.tracks[i].clips[j]), k; for (k = 0; k < ca.length; k++) { if (!seen[ca[k]]) { seen[ca[k]] = true; out.push(ca[k]); } } } } // 9A-14: 使っていないテイクの素材もふくむ（読みこむ・ZIP に入れる）
    var rf = p ? DM().refOf(p) : null; if (rf && !seen[rf.asset]) { out.push(rf.asset); } // 9B-20: 🎧 リファレンスの素材も（読みこむ・ZIP に入れる）
    return out;
  }
  function audNeedLoad(p) { var l = usedAssets(p), i; for (i = 0; i < l.length; i++) { if (!aud.st[l[i]] || aud.st[l[i]] === "loading") { return true; } } return false; }
  // 鳴らすはずなのに音が無いクリップの数（ミュート・ソロを見る。clip ＝ そのクリップだけ）
  function audMissing(p, clip) {
    var M = DM(), n = 0, i, j;
    for (i = 0; p && i < p.tracks.length; i++) {
      var t = p.tracks[i];
      if (!M.isAudio(t) || (!clip && !M.audible(p, t))) { continue; }
      for (j = 0; j < t.clips.length; j++) { var c = t.clips[j]; if (c.type === "audio" && (!clip || c.id === clip) && !aud.buf[c.asset]) { n++; } }
    }
    return n;
  }
  function loadAsset(id) {
    aud.st[id] = "loading"; dgLog("asset", { id: id, s: "loading" }); // 9B-21
    function fin(s, why) { dgLog("asset", { id: id, s: s, why: why || "" }); aud.st[id] = s; if (why) { aud.err[id] = why; } var w = aud.wait[id] || [], i; aud.wait[id] = []; for (i = 0; i < w.length; i++) { try { w[i](); } catch (e) {} } }
    idbGet("meta", id, function (m, w1) {
      if (m === undefined) { fin(aud.dbState === "none" ? "nodb" : "error", w1); return; }
      if (!m) { fin("missing"); return; }
      if (m.peaks && m.peaks.length) { aud.peaks[id] = m.peaks; }
      idbGet("blobs", id, function (b, w2) {
        if (b === undefined) { fin("error", w2); return; }
        if (!b || !b.data) { fin("missing"); return; }
        if (aud.st[id] !== "loading") { return; } // 途中で捨てた
        dataAB(b.data, function (bab, wab) { // 9B-20: Blob → ArrayBuffer（写さない）
          if (aud.st[id] !== "loading") { return; }
          if (!bab) { fin("error", wab); return; }
          function got(buf, why) {
            if (aud.st[id] !== "loading") { return; }
            if (!buf) { fin("error", why); return; }
            aud.buf[id] = buf;
            if (!aud.peaks[id]) { try { aud.peaks[id] = peaksOf(buf); } catch (e4) {} }
            fin("ready");
          }
          if (m.kind && m.kind !== "wav") { decodeAny(bab, m.sr, m.ch, function (buf, why) { got(buf, buf ? "" : "このブラウザでは、この形式（" + kindText(m) + "）の音を読めませんでした（" + why + "）"); }, true); } else { decodeWav(bab, m, got, false); }
        });
      });
    });
  }
  // 曲の素材を用意する（波形のピークと、デコードした音）。全部の結果が出たら cb()
  function ensureAssets(p, cb) {
    var ids = usedAssets(p), left = ids.length, i;
    function one() { left--; if (left === 0 && cb) { var f = cb; cb = null; f(); } }
    if (!left) { if (cb) { cb(); } return; }
    for (i = 0; i < ids.length; i++) {
      var id = ids[i], s = aud.st[id];
      if (aud.buf[id]) { aud.st[id] = "ready"; one(); continue; }
      aud.wait[id] = aud.wait[id] || [];
      if (s === "loading") { aud.wait[id].push(one); continue; }
      aud.wait[id].push(one);
      loadAsset(id);
    }
  }
  // 画面を描くとき: まだ調べていない素材があれば読みはじめ、終わったら描きなおす
  function audKick(p) {
    var l = usedAssets(p), i, need = false;
    for (i = 0; i < l.length; i++) { if (!aud.st[l[i]]) { need = true; } }
    if (!need) { return; }
    ensureAssets(p, function () { setTimeout(function () { if (st.root && st.project === p && !wav.busy) { rerender(); } }, 0); });
  }
  // デコードした音を捨てる（keep の曲が使う素材は残す。null ＝ 全部）
  function audFree(keep) {
    var use = {}, l = keep ? usedAssets(keep) : [], i, id;
    for (i = 0; i < l.length; i++) { use[l[i]] = true; }
    for (id in aud.st) { if (aud.st.hasOwnProperty(id) && !use[id]) { delete aud.buf[id]; delete aud.st[id]; delete aud.err[id]; } }
    aud.wave = {}; aud.waveN = 0;
  }
  // ページの読みなおしと同じ（メモリの音声・ピーク・IndexedDB の接続を捨てる。IndexedDB の中身は残る）
  function audForget() { audFree(null); aud.peaks = {}; aud.wait = {}; aud.busy = false; aud.pending = null; aud.playTok = null; if (aud.db) { try { aud.db.close(); } catch (e) {} } aud.db = null; aud.dbState = ""; aud.dbWhy = ""; aud.opening = []; }
  function assetState(id) { return aud.st[id] || ""; }
  function assetStateText(id) {
    var s = assetState(id);
    if (s === "ready") { return "&#x2705; この端末にあります"; }
    if (s === "loading" || !s) { return "&#x23F3; 読みこみ中…"; }
    if (s === "missing") { return "&#x26A0;&#xFE0F; 素材がありません（この端末に WAV がありません）"; }
    if (s === "nodb") { return "&#x26A0;&#xFE0F; この端末では音声を使えません（" + escHtml(aud.dbWhy || "IndexedDB が使えません") + "）"; }
    return "&#x26A0;&#xFE0F; 読みこめません（" + escHtml(aud.err[id] || "エラー") + "）";
  }
  function baseName(n) { return String(n || "音声").replace(/\.[^.]{1,5}$/, "").replace(/[\u0000-\u001f]/g, "").substring(0, 40) || "音声"; }
  // WAV（ArrayBuffer）を読みこむ。opts: { track（ID）, start（tick・省くとトラックの後ろ）} ＝ クリップを足す / { relink（素材の ID）} ＝ つなぎなおす
  // → cb({ ok, why, clip, asset, reused, saved, relinked })。曲を変えるのは、IndexedDB に入ったのを確かめたあとだけ
  function importWav(ab, fileName, opts, cb) {
    var M = DM(), p = project();
    opts = opts || {};
    function fail(why) { aud.busy = false; cb({ ok: false, why: why }); }
    if (aud.busy) { cb({ ok: false, why: "いま別の音声を読みこんでいます" }); return; }
    var gw = assetAddWhy(); if (gw) { cb({ ok: false, why: gw }); return; } // 9A-16: 削除の排他ロックのあいだは参照を足さない
    if (!p || p.readOnly) { cb({ ok: false, why: "この曲は読むだけなので、音声を足せません" }); return; }
    if (!ab || typeof ab.byteLength !== "number") { cb({ ok: false, why: "ファイルを読めませんでした" }); return; }
    if (ab.byteLength > M.WAV_MAX_BYTES) { cb({ ok: false, why: M.wavLimitWhy(null, ab.byteLength) }); return; }
    var info = M.parseWav(ab);
    if (!info.ok) { cb({ ok: false, why: info.why }); return; }
    var lim = M.wavLimitWhy(info, ab.byteLength);
    if (lim) { cb({ ok: false, why: lim }); return; }
    aud.busy = true;
    var hash = M.hashBytes(new Uint8Array(ab)), ref = M.assetRef(info, fileName, hash), have = M.findAsset(p, hash);
    if (opts.src === "rec") { ref.src = "rec"; } // 9A-12: マイクで録った素材
    if (opts.relink) {
      var want = M.findAsset(p, opts.relink);
      if (!want) { fail("つなぎなおす素材が曲の中に見つかりません"); return; }
      if (!M.sameAsset(want, ref)) {
        var d = [];
        if (want.bytes !== ref.bytes) { d.push("大きさ " + want.bytes + " → " + ref.bytes + " バイト"); }
        if (want.frames !== ref.frames || want.sr !== ref.sr) { d.push("長さ " + (Math.round(want.sec * 100) / 100) + " → " + (Math.round(ref.sec * 100) / 100) + " 秒"); }
        if (want.ch !== ref.ch) { d.push(want.ch + "ch → " + ref.ch + "ch"); }
        fail("選んだ WAV は「" + want.name + "」と中身がちがうので、つなぎませんでした（" + (d.length ? d.join("・") : "中身のハッシュがちがいます") + "）");
        return;
      }
    } else {
      var tr = M.findTrack(p, opts.track);
      if (!tr || !M.isAudio(tr)) { fail("オーディオトラックが見つかりません"); return; }
      if (opts.take) { var fk = M.findClip(p, opts.take); if (!fk || fk.clip.type !== "audio") { fail("テイクを足すクリップが見つかりません"); return; } var tw = M.takeRoomWhy(fk.clip); if (tw) { fail(tw); return; } } // 9A-14
      if (!have) { var room = M.assetRoomWhy(p, info); if (room) { fail(room); return; } }
    }
    decodeWav(ab, info, function (buf, why) {
      if (!buf) { fail(why); return; }
      var peaks = []; try { peaks = peaksOf(buf); } catch (e) { peaks = []; }
      var meta = { id: hash, name: ref.name, bytes: ref.bytes, sr: ref.sr, ch: ref.ch, bits: ref.bits, frames: ref.frames, sec: ref.sec, hash: hash, peaks: peaks, added: ref.added };
      idbGet("meta", hash, function (old, w0) {
        if (old === undefined) { fail(w0 || "音声の保存場所を使えませんでした"); return; }
        function after() {
          verifyAsset(hash, ab.byteLength, function (vw) {
            if (vw) { fail(vw); return; }
            aud.buf[hash] = buf; aud.peaks[hash] = peaks; aud.st[hash] = "ready"; delete aud.err[hash]; aud.wave = {}; aud.waveN = 0;
            if (st.project !== p) { fail("とちゅうで曲が切りかわったので、クリップは足していません（音声は端末に保存しました）"); return; }
            if (opts.relink) { aud.busy = false; cb({ ok: true, relinked: true, asset: M.findAsset(p, hash), reused: !!old }); return; }
            if (opts.take) { // 9A-14: 保存と照合のあとで、テイクを足して使う（失敗したら曲はそのまま）
              var snapT = snapTracks(), hadRef = !!M.findAsset(p, hash);
              if (!hadRef) { p.assets.push(ref); }
              var rt = M.addTake(p, opts.take, hash, baseName(fileName), Date.now());
              if (!rt.ok) { p.tracks = snapT; if (!hadRef) { p.assets.pop(); } fail(rt.why + "（音声は端末に保存しました。いまのテイクはそのままです）"); return; }
              pushUndo(snapT); st.sel = { kind: "clip", id: opts.take }; aud.busy = false;
              var savedT = saveNow();
              cb({ ok: true, take: rt.take, clip: rt.clip, asset: M.findAsset(p, hash), reused: !!old, saved: savedT });
              return;
            }
            var snap = snapTracks(), t = M.findTrack(p, opts.track), c = t ? M.addAudioClip(p, t, opts.start, ref, baseName(fileName)) : null;
            if (!c) { fail("ここにはクリップを置けませんでした（曲が長すぎます）。音声は端末に保存しました"); return; }
            if (!M.findAsset(p, hash)) { p.assets.push(ref); }
            pushUndo(snap);
            st.sel = { kind: "clip", id: c.id }; st.reveal = true;
            aud.busy = false;
            var saved = saveNow();
            cb({ ok: true, clip: c, asset: M.findAsset(p, hash), reused: !!old, saved: saved });
          });
        }
        if (old && old.hash === hash && old.bytes === ab.byteLength) { after(); return; } // 同じ中身がもう端末にある（書かない）
        idbPutAsset(meta, ab, function (pw) { if (pw) { fail(pw + "（曲は変えていません）"); return; } after(); });
      });
    }, true);
  }
  // §341 9A-13: クリップのゲインの折れ目（曲の秒 → 値）。フェードイン・フェードアウトは鳴る範囲（p0〜endSec）に合わせた直線。
  // microIn ＝ 素材の途中から鳴らしはじめる（3ms で 0 から）・microOut ＝ 素材の途中で切る（5ms で 0 へ）。編集していなければ [s0, gv]〜[s1, gv]（いままでと同じ）
  function audEnv(ev, s0, s1, microIn, microOut) {
    var gv = ev.gain, fi = ev.fadeIn || 0, fo = ev.fadeOut || 0, p0 = ev.p0, p1 = ev.endSec, len = s1 - s0, mi = microIn ? Math.min(FADE_IN, len / 2) : 0, mo = microOut ? Math.min(FADE_OUT, len / 2) : 0;
    function g(x) {
      var v = gv;
      if (fi > 0) { v *= Math.max(0, Math.min(1, (x - p0) / fi)); }
      if (fo > 0) { v *= Math.max(0, Math.min(1, (p1 - x) / fo)); }
      if (mi && x < s0 + mi) { v *= Math.max(0, (x - s0) / mi); }
      if (mo && x > s1 - mo) { v *= Math.max(0, (s1 - x) / mo); }
      return v;
    }
    var pts = [s0, s1], out = [], i;
    if (fi > 0) { pts.push(p0 + fi); } if (fo > 0) { pts.push(p1 - fo); } if (mi) { pts.push(s0 + mi); } if (mo) { pts.push(s1 - mo); }
    pts.sort(function (a, b) { return a - b; });
    for (i = 0; i < pts.length; i++) { var x = pts[i]; if (x < s0 || x > s1 || (out.length && x - out[out.length - 1][0] < 1e-6)) { continue; } out.push([x, g(x)]); }
    return out;
  }
  // 音声のクリップ 1 つを予約する（ev ＝ UGDawModel.audioEvents の 1 つ）。start(when, offset ＝ 素材の時刻, duration ＝ 鳴る長さ)
  function playAudio(p, ev, seg) {
    var M = DM(), t = M.findTrack(p, ev.track);
    if (pl.clip) { if (ev.clip !== pl.clip || !t) { return; } } else if (!t || !M.audible(p, t)) { return; }
    if (pl.muteClip && ev.clip === pl.muteClip) { return; } // 9A-14: 別テイクを録っているクリップの前のテイクは鳴らさない
    var buf = aud.buf[ev.asset], base = M.tickToSec(p, seg.tick0);
    function at(x) { return seg.t0 + (x - base); }
    var endS = Math.min(ev.endSec, M.tickToSec(p, pl.segEnd)), when = at(ev.sec), off = ev.src;
    var rec = { track: t.id, tick: ev.tick, sec: ev.sec, audio: true, asset: ev.asset, clip: ev.clip, when: when, offset: off, dur: 0, pass: pl.pass, ok: false, why: "", env: null };
    lateMark(when); // 9B-18
    if (!buf) { rec.why = assetState(ev.asset) || "notLoaded"; }
    else {
      var dur = Math.min(buf.duration - off, endS - ev.sec);
      rec.dur = dur;
      if (!(dur > 0.001)) { rec.why = "end"; }
      else {
        try {
          var mx = mixFor(t), ac = pl.ac, dest = trackIn(t, mx, mx.dry ? "dry" : "main"), src = ac.createBufferSource(), g = ac.createGain(), cut = off + dur < buf.duration - 0.0005;
          var env = audEnv(ev, ev.sec, ev.sec + dur, off > 0.0005 && !ev.xIn, cut && !(ev.xOut && endS >= ev.endSec - 1e-9)), k; // 9A-16: 継ぎ目（クロスフェード）の端には小さなフェードをかけない
          src.buffer = buf; src.connect(g); g.connect(dest);
          g.gain.value = env[0][1];
          g.gain.setValueAtTime(env[0][1], when);
          for (k = 1; k < env.length; k++) { g.gain.linearRampToValueAtTime(env[k][1], at(env[k][0])); }
          src.start(when, off, dur);
          mx.srcs.push({ src: src, g: g, end: when + dur });
          if (mx.srcs.length > 16) { mx.srcs = mx.srcs.filter(function (x) { if (x.end < ac.currentTime - 1) { try { x.g.disconnect(); } catch (e0) {} return false; } return true; }); } // 鳴り終わったノードを外す
          rec.ok = true; rec.cut = cut;
          rec.env = env.map(function (x) { return [Math.round((x[0] - ev.sec) * 1e6) / 1e6, Math.round(x[1] * 1e6) / 1e6]; });
        } catch (e) { rec.why = errName(e); }
      }
    }
    plLog.push(rec);
    if (plLog.length > 400 && !pl.wav) { plLog.shift(); }
  }  // 波形（2px に 1 本の線の SVG・クリップの位置・長さ・テンポごとにとっておく）
  function waveSvg(p, c, w) {
    var M = DM(), pk = aud.peaks[c.asset], a = M.findAsset(p, c.asset);
    if (M.compOf(p, c)) { return compWaveSvg(p, c, w); } // 9A-16
    if (!pk || !pk.length || !a) { return ""; }
    var key = c.asset + "|" + c.start + "|" + c.len + "|" + (c.srcOffset || 0) + "|" + (c.trimIn || 0) + "|" + (c.trimOut || 0) + "|" + (c.nudge || 0) + "|" + w + "|" + pxb + "|" + JSON.stringify(p.tempo.points);
    if (aud.wave[key]) { return aud.wave[key]; }
    var out = "";
    try {
      var top = 14, H = LANE_H - 6 - top - 2, mid = top + H / 2, sp = M.audioSpan(p, c), PR = M.PEAK_RATE, lo = Math.max(0, sp.p0), d = "", x, i; // 9A-13: トリム・微調整を反映（鳴る所だけ描く）
      for (x = 0; x < w; x += 2) {
        var x0 = M.tickToSec(p, c.start + x / pxb * M.PPQ), x1 = M.tickToSec(p, c.start + (x + 2) / pxb * M.PPQ);
        if (x0 >= sp.p1) { break; }
        if (x1 <= lo) { continue; }
        var t0 = Math.max(x0, lo) - sp.A + sp.so, t1 = Math.min(x1, sp.p1) - sp.A + sp.so;
        var i0 = Math.floor(t0 * PR), i1 = Math.max(i0 + 1, Math.ceil(t1 * PR)), m = 0;
        for (i = i0; i < i1 && i < pk.length; i++) { if (pk[i] > m) { m = pk[i]; } }
        var hh = Math.max(0.5, m / 255 * H / 2);
        d += "M" + (x + 0.5) + " " + (Math.round((mid - hh) * 10) / 10) + "V" + (Math.round((mid + hh) * 10) / 10);
      }
      out = '<svg class="da-wave" width="' + w + '" height="' + (LANE_H - 6) + '" aria-hidden="true"><path d="' + d + '"/></svg>';
    } catch (e) { out = ""; }
    if (aud.waveN++ > WAVE_CACHE) { aud.wave = {}; aud.waveN = 0; }
    aud.wave[key] = out;
    return out;
  }
  // 9A-16／9A-17: コンピングのクリップの波形（区間ごとにそのテイクのピーク・テイクの色・切りかえの線）
  function compWaveSvg(p, c, w) {
    var M = DM(), segs = M.audioSegs(p, c), key = "comp|" + JSON.stringify([c.start, c.len, c.comp, c.takes, c.asset, c.trimIn, c.trimOut, c.nudge, c.fadeIn, c.fadeOut, w, pxb, p.tempo.points]);
    if (aud.wave[key]) { return aud.wave[key]; }
    var top = 14, H = LANE_H - 6 - top - 2, mid = top + H / 2, PR = M.PEAK_RATE, ds = {}, x, i, q, k, ready = true, cp = M.compOf(p, c);
    for (q = 0; q < segs.length; q++) { if (!aud.peaks[segs[q].id]) { ready = false; } }
    if (!ready || !segs.length || !cp) { return ""; }
    for (x = 0; x < w; x += 2) {
      var x0 = M.tickToSec(p, c.start + x / pxb * M.PPQ), x1 = M.tickToSec(p, c.start + (x + 2) / pxb * M.PPQ), xm = (x0 + x1) / 2, sg = null;
      for (q = 0; q < segs.length; q++) { var s = segs[q]; if (xm >= s.from && xm < s.to && xm >= Math.max(0, s.p0) && xm < s.p1) { sg = s; } }
      if (!sg) { continue; }
      var pk = aud.peaks[sg.id], t0 = sg.tin + (Math.max(x0, Math.max(0, sg.p0)) - sg.p0), t1 = sg.tin + (Math.min(x1, sg.p1) - sg.p0);
      var i0 = Math.floor(t0 * PR), i1 = Math.max(i0 + 1, Math.ceil(t1 * PR)), m = 0;
      for (i = i0; i < i1 && i < pk.length; i++) { if (pk[i] > m) { m = pk[i]; } }
      var hh = Math.max(0.5, m / 255 * H / 2);
      ds[sg.take] = (ds[sg.take] || "") + "M" + (x + 0.5) + " " + (Math.round((mid - hh) * 10) / 10) + "V" + (Math.round((mid + hh) * 10) / 10);
    }
    var out = '<svg class="da-wave" width="' + w + '" height="' + (LANE_H - 6) + '" aria-hidden="true">';
    for (k in ds) { if (ds.hasOwnProperty(k)) { out += '<path class="' + cpCls(k) + '" d="' + ds[k] + '"/>'; } }
    for (i = 0; i < cp.Ts.length; i++) { var cx = Math.round((M.secToTick(p, cp.Ts[i]) - c.start) / M.PPQ * pxb); out += '<line class="da-wave-x" x1="' + cx + '" y1="' + top + '" x2="' + cx + '" y2="' + (top + H) + '"/>'; }
    out += '</svg>';
    if (aud.waveN++ > WAVE_CACHE) { aud.wave = {}; aud.waveN = 0; }
    aud.wave[key] = out;
    return out;
  }
  // ファイルを選ぶ（tgt: importWav の opts）
  function pickWav(root, tgt) {
    var f = root && root.querySelector ? root.querySelector(".da-wavfile") : null;
    if (!f) { return false; }
    aud.pending = tgt; f.value = "";
    f.click();
    return true;
  }
  function audNote(text) { if (st.view === "proj") { sv.note = text; } else { st.anote = escHtml(text); } } // 文字だけ（どちらの画面でも escHtml して出す）
  function bindWavFile(root) {
    var f = root.querySelector ? root.querySelector(".da-wavfile") : null;
    if (!f) { return; }
    f.onchange = function () {
      var file = f.files && f.files[0], tgt = aud.pending, M = DM();
      aud.pending = null;
      if (!file || !tgt) { return; }
      if (file.size > M.LONG_WAV_BYTES) { var bm = "⚠️ 読みこめませんでした: ファイルが大きすぎます（" + mb(file.size) + "・WAV は " + (M.LONG_WAV_BYTES / 1048576) + "MB・MP3／M4A は " + (M.LONG_Z_BYTES / 1048576) + "MB まで）（曲は変えていません）"; audNote(bm); st.rfMsg = bm; rerender(); return; }
      audNote("⏳ 「" + file.name + "」を読みこんでいます…"); st.rfMsg = "⏳ 「" + file.name + "」を読みこんでいます…"; rerender();
      var rd = new FileReader();
      rd.onload = function () { audFileGo(rd.result, file, file.name, tgt); };
      rd.onerror = function () { audNote("⚠️ ファイルを読めませんでした（曲は変えていません）"); rerender(); };
      rd.readAsArrayBuffer(file);
    };
  }
  // 9B-20: ふつうの WAV（10MB・60 秒以内）はいままでどおりすぐ置く。長い・MP3・M4A・リファレンスは、デコードしてから確かめる画面へ
  function audFileGo(ab, file, name, tgt) {
    var M = DM(), pr = M.probeAudio(ab), shortWav = pr.ok && pr.kind === "wav" && ab.byteLength <= M.WAV_MAX_BYTES && pr.sec <= M.WAV_MAX_SEC + 0.0005, rl = tgt.relink ? M.findAsset(project(), tgt.relink) : null;
    if ((shortWav || (pr.kind === "wav" && !pr.ok)) && !tgt.ref && !(rl && (rl.long || (rl.kind && rl.kind !== "wav")))) { importWav(ab, name, tgt, function (r) { audDone(r, name); }); return; }
    longImport(ab, file, name, tgt, function (r) {
      if (r.ok && r.staged) { var m = "🎵 「" + name + "」を読みこみました（まだ曲は変えていません）。下で置き場所を選んでください"; audNote(m); st.rfMsg = m; rerender(); return; }
      stageDone(r);
    });
  }
  // ---------- §342 9B-20: 長い音声（WAV・MP3・M4A）の読みこみ・🎧 リファレンス ----------
  // 長い素材・圧縮の素材は、選んだファイル（Blob）をそのまま IndexedDB へ（大きな WAV に変えない・JS のメモリに写さない）。ふつうの WAV はいままでどおり ArrayBuffer
  function dataSize(d) { return d && typeof d.byteLength === "number" ? d.byteLength : (d && typeof d.size === "number" ? d.size : -1); }
  function dataAB(d, cb) { // Blob → ArrayBuffer（ArrayBuffer ならそのまま）
    if (d && typeof d.byteLength === "number") { cb(d, ""); return; }
    if (!d || typeof d.size !== "number") { cb(null, "中身がありません"); return; }
    try { if (typeof d.arrayBuffer === "function") { d.arrayBuffer().then(function (ab) { cb(ab, ""); }, function (e) { cb(null, errName(e)); }); return; } } catch (e0) {}
    try { var fr = new FileReader(); fr.onload = function () { cb(fr.result, ""); }; fr.onerror = function () { cb(null, errName(fr.error)); }; fr.readAsArrayBuffer(d); } catch (e1) { cb(null, errName(e1)); }
  }
  // デコード（圧縮もふくむ・ブラウザの decodeAudioData だけ）。sr: そのレートの OfflineAudioContext（わからなければ・できなければ再生のレート）。ab は写さない（デコードのあと使えなくなる）。retry: 1 回目がだめなら写しで再生のレートでもう一度
  function decodeAny(ab, sr, ch, cb, retry) {
    var cb0 = cb, dt0 = perfNow(); cb = function (b, why) { dgLog("decode", { ok: !!b, ms: Math.round(perfNow() - dt0), sec: b ? Math.round(b.duration * 1000) / 1000 : 0, why: why || "" }); cb0(b, why); }; // 9B-21
    var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext, ctx = null, done = false, spare = null, usedOff = false;
    function rt() { var UG = window.UGMelody; try { return UG && UG.audioInit ? UG.audioInit() : null; } catch (e) { return null; } }
    function ok(b) { if (done) { return; } done = true; if (b && b.length > 0) { cb(b, ""); } else { cb(null, "音がありません"); } }
    function ng(e) { if (done) { return; } if (spare && usedOff) { var s2 = spare, c2 = rt(); spare = null; usedOff = false; if (c2 && c2.decodeAudioData) { go(c2, s2); return; } } done = true; cb(null, errName(e)); }
    function go(c, data) { try { var pr = c.decodeAudioData(data, ok, ng); if (pr && pr.then) { pr.then(ok, ng); } } catch (e3) { ng(e3); } }
    try { if (OAC && sr >= 8000 && sr <= 192000) { ctx = new OAC(Math.max(1, Math.min(2, ch || 2)), 1, sr); usedOff = true; } } catch (e) { ctx = null; usedOff = false; }
    if (!ctx || !ctx.decodeAudioData) { ctx = rt(); usedOff = false; }
    if (!ctx || !ctx.decodeAudioData) { ng("decodeAudioData がありません"); return; }
    if (retry && usedOff) { try { spare = ab.slice(0); } catch (e4) { spare = null; } }
    go(ctx, ab);
  }
  // 端末の空き（わかるブラウザだけ）→ cb("" ／ 理由)
  function storageRoom(bytes, cb) {
    var n = window.navigator;
    try {
      if (n && n.storage && typeof n.storage.estimate === "function") {
        n.storage.estimate().then(function (e) { var q = Number(e && e.quota) || 0, free = q - (Number(e && e.usage) || 0); if (q > 0 && free < bytes * 1.1 + 5 * 1048576) { cb("端末の空き容量が足りないため、音声を保存できません（必要 約 " + mb(bytes) + "・空き 約 " + mb(Math.max(0, free)) + "）"); } else { cb(""); } }, function () { cb(""); });
        return;
      }
    } catch (e0) {}
    cb("");
  }
  var KIND_TEXT = { wav: "WAV", mp3: "MP3", m4a: "M4A（AAC）", ogg: "Ogg", flac: "FLAC" };
  function kindText(a) { var k = a && a.kind ? a.kind : "wav"; return (KIND_TEXT[k] || k) + (a && a.codec && k === "m4a" && a.codec !== "aac" ? "（" + a.codec + "）" : ""); }
  // 読みこみ（長い・圧縮）: 形式を中身で見る → 大きさ → ハッシュ → デコード（写さない）→ 長さ → 確かめる画面（aud.stage）。曲はまだ変えない。relink はそのままつなぎなおす
  // tgt: { track, start } ／ { ref: true } ／ { relink: 素材の ID }。file ＝ 選んだファイル（Blob）
  function longImport(ab, file, fileName, tgt, cb) {
    var M = DM(), p = project();
    function fail(why) { aud.busy = false; cb({ ok: false, why: why }); }
    tgt = tgt || {};
    if (aud.busy) { cb({ ok: false, why: "いま別の音声を読みこんでいます" }); return; }
    var gw = assetAddWhy(); if (gw) { cb({ ok: false, why: gw }); return; }
    if (!p || p.readOnly) { cb({ ok: false, why: "この曲は読むだけなので、音声を足せません" }); return; }
    if (!ab || typeof ab.byteLength !== "number") { cb({ ok: false, why: "ファイルを読めませんでした" }); return; }
    var pr = M.probeAudio(ab);
    if (!pr.ok) { cb({ ok: false, why: pr.why }); return; }
    var bw = M.importBytesWhy(pr, ab.byteLength); if (bw) { cb({ ok: false, why: bw }); return; }
    if (tgt.take) { cb({ ok: false, why: "テイクには 60 秒以内・10MB 以内の WAV を使ってください（長い音声・MP3・M4A はテイクにできません）" }); return; }
    var hash = M.hashBytes(new Uint8Array(ab)), bytes = ab.byteLength, want = null;
    if (tgt.relink) {
      want = M.findAsset(p, tgt.relink);
      if (!want) { cb({ ok: false, why: "つなぎなおす素材が曲の中に見つかりません" }); return; }
      if (want.hash !== hash || want.bytes !== bytes) { cb({ ok: false, why: "選んだファイルは「" + want.name + "」と中身がちがうので、つなぎませんでした（大きさ " + want.bytes + " → " + bytes + " バイト）" }); return; }
    }
    var shortWav = pr.kind === "wav" && bytes <= M.WAV_MAX_BYTES && pr.sec <= M.WAV_MAX_SEC + 0.0005, keepAb = shortWav ? ab.slice(0) : null; // ふつうの WAV はいままでどおり ArrayBuffer で保存（10MB まで）
    aud.busy = true;
    var t0 = perfNow(), pid = p.id;
    decodeAny(ab, pr.sr, pr.ch, function (buf, why) {
      if (!buf) { fail((pr.tryOnly ? "このブラウザでは、この形式（" + kindText(pr) + "）の音を読めませんでした" : "このファイルの音を読めませんでした（こわれているかもしれません）") + "（" + why + "）"); return; }
      var sw = M.importSecWhy(buf.duration); if (sw) { fail(sw); return; }
      var info = { kind: pr.kind, codec: pr.codec, srcSr: pr.sr || 0, sr: buf.sampleRate, ch: buf.numberOfChannels, frames: buf.length, sec: buf.duration, bytes: bytes, bits: pr.kind === "wav" ? pr.bits : 32 };
      info.long = M.isLongInfo(info);
      var peaks = []; try { peaks = peaksOf(buf); } catch (e) { peaks = []; }
      var stg = { file: keepAb || file, info: info, buf: buf, peaks: peaks, hash: hash, name: fileName, tgt: tgt, pid: pid, decMs: Math.round(perfNow() - t0), pcm: M.pcmBytes(info) };
      aud.busy = false;
      if (tgt.relink) { aud.stage = stg; stageCommit("relink", cb); return; }
      aud.stage = stg;
      cb({ ok: true, staged: true, stage: stageInfo() });
    }, !shortWav && bytes <= M.LONG_Z_BYTES);
  }
  function stageInfo() { var s = aud.stage; if (!s) { return null; } var i = s.info; return { name: s.name, kind: i.kind, codec: i.codec, sec: i.sec, sr: i.sr, srcSr: i.srcSr, ch: i.ch, frames: i.frames, bytes: i.bytes, long: i.long, pcmMB: Math.round(s.pcm / 104857.6) / 10, decMs: s.decMs, hash: s.hash, tgt: s.tgt }; }
  function stageCancel() { aud.stage = null; }
  // 確かめたあと: where ＝ "track"（通常のトラックへ・無ければオーディオトラックを作る）／ "ref"（🎧 リファレンス）／ "relink"。空き → IndexedDB → 照合 → 曲を変える
  function stageCommit(where, cb) {
    var s = aud.stage, M = DM(), p = project();
    function fail(why) { aud.busy = false; cb({ ok: false, why: why }); }
    if (!s) { cb({ ok: false, why: "読みこんだ音声がありません（もう一度ファイルを選んでください）" }); return; }
    if (aud.busy) { cb({ ok: false, why: "いま別の音声を読みこんでいます" }); return; }
    if (!p || p.id !== s.pid) { aud.stage = null; cb({ ok: false, why: "曲が切りかわったので、やめました" }); return; }
    var gw = assetAddWhy(); if (gw) { cb({ ok: false, why: gw }); return; }
    var ref = M.assetRef(s.info, s.name, s.hash), have = M.findAsset(p, s.hash), t = null;
    if (where !== "relink" && !have) { var room = M.assetRoomWhy(p, ref); if (room) { cb({ ok: false, why: room }); return; } }
    if (where === "track") {
      t = s.tgt.track ? M.findTrack(p, s.tgt.track) : null;
      if (!t) { var i; for (i = 0; i < p.tracks.length; i++) { if (M.isAudio(p.tracks[i])) { t = p.tracks[i]; break; } } }
      if (!t) { var tc = JSON.parse(JSON.stringify(p)), at = M.addAudioTrack(tc); if (!at.ok) { cb({ ok: false, why: at.why }); return; } }
    }
    aud.busy = true;
    var meta = { id: s.hash, name: ref.name, bytes: ref.bytes, sr: ref.sr, ch: ref.ch, bits: ref.bits, frames: ref.frames, sec: ref.sec, hash: s.hash, peaks: s.peaks, added: ref.added, kind: s.info.kind, codec: s.info.codec, long: !!ref.long };
    idbGet("meta", s.hash, function (old, w0) {
      if (old === undefined) { fail(w0 || "音声の保存場所を使えませんでした"); return; }
      function after() {
        verifyAsset(s.hash, ref.bytes, function (vw) {
          if (vw) { fail(vw); return; }
          aud.buf[s.hash] = s.buf; aud.peaks[s.hash] = s.peaks; aud.st[s.hash] = "ready"; delete aud.err[s.hash]; aud.wave = {}; aud.waveN = 0;
          if (st.project !== p) { aud.stage = null; fail("とちゅうで曲が切りかわったので、曲は変えていません（音声は端末に保存しました）"); return; }
          aud.stage = null;
          if (where === "relink") { aud.busy = false; cb({ ok: true, relinked: true, asset: M.findAsset(p, s.hash), reused: !!old }); return; }
          var snap = snapTracks(), hadRef = !!M.findAsset(p, s.hash), c = null, made = null;
          if (!hadRef) { p.assets.push(ref); }
          if (where === "ref") { M.setRef(p, s.hash); }
          else {
            if (!t) { var ar = M.addAudioTrack(p); if (ar.ok) { made = ar.track; t = ar.track; } }
            c = t ? M.addAudioClip(p, t, s.tgt.track ? s.tgt.start : undefined, M.findAsset(p, s.hash), baseName(s.name)) : null;
            if (!c) { p.tracks = snap; if (!hadRef) { p.assets.pop(); } fail("ここには全部を置けないので、置きませんでした（曲の長さ・テンポ・ほかのクリップを見なおしてください）。音声は端末に保存しました"); return; }
            pushUndo(snap); st.sel = { kind: "clip", id: c.id }; st.reveal = true;
          }
          aud.busy = false;
          var saved = saveNow();
          cb({ ok: true, where: where, clip: c, track: made ? made.id : (t ? t.id : null), asset: M.findAsset(p, s.hash), reused: !!old, saved: saved });
        });
      }
      if (old && old.hash === s.hash && old.bytes === ref.bytes) { after(); return; } // 同じ中身がもう端末にある（書かない）
      storageRoom(ref.bytes, function (sw) {
        if (sw) { fail(sw + "（曲は変えていません）"); return; }
        idbPutAsset(meta, s.file, function (pw) { if (pw) { fail(pw + "（曲は変えていません）"); return; } after(); });
      });
    });
  }
  // ---------- 🎧 リファレンスの再生（トラック・センド・MASTER FX・リミッター・メーターを通らない・ゲームセンターの全体の音量と同じ大きさでスピーカーへ・WAV には入れない）----------
  function refGainVal(p) { var s = DM().refSpan(p), A = window.UGMelody && window.UGMelody.audio; if (!s || s.mute || st.refAB === "daw") { return 0; } return (A && A.master ? A.master.gain.value : 0.25) * dbGain(s.gain); }
  function abDaw() { return pl && !pl.wav && st.refAB === "ref" && DM().refOf(st.project) ? 0 : 1; } // 「🎧 だけ」のとき DAW の音を 0 に（WAV は変えない）
  function refOut() { var m = pl.mix.__ref; if (m) { return m; } var g = pl.ac.createGain(); g.gain.value = refGainVal(st.project); g.connect(pl.ac.destination); m = { g: g, srcs: [], ac: pl.ac }; pl.mix.__ref = m; return m; }
  function playRef(p, seg, from, to, fresh) {
    if (!pl || pl.wav || pl.clip) { return; }
    var M = DM(), s = M.refSpan(p), buf = s ? aud.buf[s.asset.id] : null;
    if (!s || !buf) { return; }
    var fs = M.tickToSec(p, from), ts = M.tickToSec(p, to), es = M.tickToSec(p, pl.segEnd), base = M.tickToSec(p, seg.tick0), at = null, off = 0;
    if (s.start >= fs && s.start < ts) { at = s.start; } else if (fresh && s.start < fs && s.end > fs) { at = fs; off = fs - s.start; }
    if (at === null) { return; }
    var dur = Math.min(Math.min(s.end, es) - at, buf.duration - off);
    if (!(dur > 0.002)) { return; }
    var ac = pl.ac, when = seg.t0 + (at - base), o = refOut(), src = ac.createBufferSource(), sg = ac.createGain(), cut = at + dur < s.end - 0.001;
    lateMark(when);
    src.buffer = buf; src.connect(sg); sg.connect(o.g);
    try {
      if (off > 0) { sg.gain.setValueAtTime(0, when); sg.gain.linearRampToValueAtTime(1, when + Math.min(FADE_IN, dur / 2)); } // 途中から: 3ms で 0 から
      if (cut) { sg.gain.setValueAtTime(1, when + dur - Math.min(FADE_OUT, dur / 2)); sg.gain.linearRampToValueAtTime(0, when + dur); } // ループの終わりで切る: 5ms で 0 へ
      src.start(Math.max(0, when), off, dur);
    } catch (e) { try { sg.disconnect(); } catch (e1) {} return; }
    o.srcs.push({ src: src, g: sg, end: when + dur });
    if (o.srcs.length > 8) { o.srcs = o.srcs.filter(function (x) { if (x.end < ac.currentTime - 1) { try { x.g.disconnect(); } catch (e2) {} return false; } return true; }); }
  }
  function refOff(m) {
    if (!m) { return; }
    var t = m.ac.currentTime, i;
    try { m.g.gain.cancelScheduledValues(t); m.g.gain.setTargetAtTime(0, t, 0.01); } catch (e) {}
    for (i = 0; i < m.srcs.length; i++) { try { m.srcs[i].src.stop(t + 0.06); } catch (e1) {} }
    setTimeout(function () { for (i = 0; i < m.srcs.length; i++) { try { m.srcs[i].src.disconnect(); m.srcs[i].g.disconnect(); } catch (e2) {} } m.srcs = []; try { m.g.disconnect(); } catch (e3) {} }, 150);
  }
  // 音量・ミュート・A／B を変えた（再生中なら 10ms でなめらかに）
  function refApply() {
    if (!pl || pl.wav) { return; }
    if (pl.mix.__ref) { rampTo(pl.mix.__ref.g.gain, refGainVal(st.project), false); }
    setMasterGain();
  }
  function refSetAB(v) { st.refAB = v === "daw" || v === "ref" ? v : "both"; refApply(); return st.refAB; }
  // リファレンスの画面
  function refWave(p, s, W, H) {
    var pk = s ? aud.peaks[s.asset.id] : null, n = W, i, d = "", PR = DM().PEAK_RATE;
    if (!pk || !pk.length) { return ""; }
    var per = pk.length / n, mid = H / 2;
    for (i = 0; i < n; i++) { var a = Math.floor(i * per), b = Math.max(a + 1, Math.floor((i + 1) * per)), m = 0, k; for (k = a; k < b && k < pk.length; k++) { if (pk[k] > m) { m = pk[k]; } } var hh = Math.max(0.5, m / 255 * H / 2); d += "M" + (i + 0.5) + " " + (Math.round((mid - hh) * 10) / 10) + "V" + (Math.round((mid + hh) * 10) / 10); }
    return '<svg class="drf-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true"><path d="' + d + '"/></svg>' + (PR ? "" : "");
  }
  function stageHtml() {
    var s = stageInfo(), M = DM();
    if (!s) { return ""; }
    var ttl = (s.tgt && s.tgt.ref) ? "🎧 リファレンス" : "通常のトラック";
    return '<div class="dm-row drf-stage"><b>&#x1F3B5; 読みこんだ音声を確かめてください</b>' +
      '<div class="dlu-kv"><span>ファイル</span><b>' + escHtml(s.name) + '</b></div>' +
      '<div class="dlu-kv"><span>形式</span><b>' + escHtml(kindText(s)) + (s.long ? '・長い素材' : '') + '</b></div>' +
      '<div class="dlu-kv"><span>長さ</span><b>' + escHtml(M.secText(s.sec)) + '</b></div>' +
      '<div class="dlu-kv"><span>レート・ch</span><b>' + s.sr + 'Hz' + (s.srcSr && s.srcSr !== s.sr ? '（元 ' + s.srcSr + 'Hz）' : '') + '・' + s.ch + 'ch</b></div>' +
      '<div class="dlu-kv"><span>ファイルの大きさ</span><b>' + mb(s.bytes) + '</b></div>' +
      '<div class="dlu-kv"><span>デコードしたあとのメモリ</span><b>約 ' + s.pcmMB + ' MB（' + (Math.round(s.decMs / 100) / 10) + ' 秒でデコード）</b></div>' +
      '<div class="drf-btns"><button class="modal-btn" data-stg="track">&#x2795; 通常トラックへ追加</button><button class="modal-btn" data-stg="ref">&#x1F3A7; リファレンスに設定</button><button class="modal-btn" data-stg="cancel">やめる</button></div>' +
      '<p class="small">まだ曲は変えていません（選んだほうへ置きます・いまは「' + ttl + '」から選びました）。音声はそのまま保存します（圧縮しなおさない）。リファレンスは WAV の書き出しに入りません。</p></div>';
  }
  function refHtml(p) {
    var M = DM(), s = M.refSpan(p), r = M.refOf(p), h, ab = st.refAB || "both";
    h = '<div class="daw dm dfx drf">' +
      '<div class="daw-top"><button class="modal-btn daw-small" data-rf="back">&#x2190; アレンジ</button><b>&#x1F3A7; リファレンス</b></div>' +
      '<div class="daw-transport"><button class="modal-btn daw-tbtn' + (pl ? " daw-on" : "") + '" data-rf="play" title="再生">&#x25B6;&#xFE0F;</button><button class="modal-btn daw-tbtn" data-rf="stop" title="停止">&#x23F9;&#xFE0F;</button><span class="daw-pos">1.1</span><span class="small drf-sec">0:00.0</span></div>' +
      (st.rfMsg ? '<p class="small dau-msg">' + escHtml(st.rfMsg) + '</p>' : '') + stageHtml();
    if (!r) {
      h += '<div class="dm-row"><p class="small">自分の曲とくらべるための音声（好きな曲・伴奏など）を置けます。WAV・MP3・M4A（AAC）・5 分 30 秒まで。曲の頭から、DAW の再生と同じ時計で鳴ります。</p>' +
        '<button class="modal-btn" data-rf="pick">&#x1F3B5; 音声を読み込む（WAV・MP3・M4A）</button></div>';
    } else {
      var a = s ? s.asset : M.findAsset(p, r.asset), stt = a ? assetState(a.id) : "missing";
      h += '<div class="dm-row"><div class="dlu-kv"><span>音声</span><b>' + escHtml(a ? a.name : r.asset) + '</b></div>' +
        (a ? '<div class="dlu-kv"><span>形式・長さ</span><b>' + escHtml(kindText(a)) + '・' + escHtml(M.secText(a.sec)) + '・' + a.sr + 'Hz・' + a.ch + 'ch・' + mb(a.bytes) + '</b></div>' : '') +
        '<div class="dlu-kv"><span>状態</span><b>' + (a ? assetStateText(a.id) : "&#x26A0;&#xFE0F; 素材の情報がありません") + '</b></div>' +
        '<div class="drf-wave" data-rf-wave="1">' + refWave(p, s, 300, 64) + '<div class="drf-head"></div></div>' +
        '<p class="small">波形をタップ ＝ その位置から（曲の秒 ＝ リファレンスの秒 ＋ ずらし）</p></div>' +
        '<div class="dm-row"><b class="small">聞きくらべ（A／B）</b><div class="drf-btns">' +
          '<button class="modal-btn dfx-tog' + (ab === "both" ? " on" : "") + '" data-rf-ab="both">両方</button>' +
          '<button class="modal-btn dfx-tog' + (ab === "daw" ? " on" : "") + '" data-rf-ab="daw">DAW だけ</button>' +
          '<button class="modal-btn dfx-tog' + (ab === "ref" ? " on" : "") + '" data-rf-ab="ref">&#x1F3A7; だけ</button></div>' +
          '<p class="small">音量はそろえません（そのままの大きさでくらべます）。A／B は保存しません。</p></div>' +
        '<div class="dm-row"><div class="dfx-sw"><b>ミュート</b><button class="modal-btn dfx-tog' + (r.mute ? " on" : "") + '" data-rf="mute">' + (r.mute ? "ON" : "OFF") + '</button></div>' +
          '<div class="dfx-sw"><b>音量</b><input type="range" min="' + M.REF_GAIN_MIN + '" max="' + M.REF_GAIN_MAX + '" step="0.5" value="' + r.gain + '" data-rf-gain="1" aria-label="リファレンスの音量"><span class="small drf-gv">' + (r.gain > 0 ? "+" : "") + r.gain + ' dB</span></div>' +
          '<div class="dfx-sw"><b>ずらす（秒）</b><input type="number" class="dfx-num" inputmode="decimal" min="' + (-M.REF_OFF_MAX) + '" max="' + M.REF_OFF_MAX + '" step="0.01" value="' + r.offset + '" data-rf-off="1" aria-label="リファレンスをずらす秒"></div></div>' +
        '<div class="dm-row drf-btns">' + (a && stt !== "ready" && stt !== "loading" && stt !== "" ? '<button class="modal-btn" data-rf="relink">&#x1F517; 素材を選びなおす</button>' : '') +
          '<button class="modal-btn" data-rf="pick">&#x1F3B5; 別の音声にする</button><button class="modal-btn" data-rf="clear">リファレンスを外す</button></div>';
    }
    h += '<p class="small dfx-note">リファレンスは WAV・MIDI の書き出しに入りません（書き出しの曲の長さにも入りません）。トラック・センド・MASTER の EQ・リミッター・📏 メーターを通らず、ゲームセンターの全体の音量と同じ大きさで鳴ります。曲の保存・JSON・ZIP に入ります（音声の中身は ZIP にだけ入ります。JSON には入りません）。外しても端末の素材は消えません。</p>' +
      '<input type="file" class="da-wavfile" accept="' + AUD_ACCEPT + '" style="display:none;"></div>';
    return h;
  }
  function refHead(root) {
    var e = root.querySelector(".drf-head"), tx = root.querySelector(".drf-sec"), p = st.project, M = DM(), s = M.refSpan(p), tk = playTick(), sec = M.tickToSec(p, Math.max(0, tk));
    if (tx) { var m = Math.floor(sec / 60), r = sec - m * 60; tx.textContent = m + ":" + (r < 10 ? "0" : "") + (Math.floor(r * 10) / 10).toFixed(1); }
    if (e && s && s.dur > 0) { var f = Math.max(0, Math.min(1, (sec - s.start) / s.dur)); e.style.left = (f * 100) + "%"; }
  }
  function renderRef(root, ctl) {
    var p = project();
    root.innerHTML = refHtml(p);
    if (!root.querySelectorAll) { return; }
    audKick(p);
    bindWavFile(root);
    var els = root.querySelectorAll("button"), k, M = DM();
    for (k = 0; k < els.length; k++) {
      els[k].onclick = function (ev) {
        var el = ev.currentTarget, v = el.getAttribute("data-rf"), x;
        st.rfMsg = "";
        if ((x = el.getAttribute("data-stg"))) { stageAct(x); return; }
        if ((x = el.getAttribute("data-rf-ab"))) { refSetAB(x); renderRef(root, ctl); return; }
        if (v === "back") { st.view = "arr"; render(root, ctl); return; }
        if (v === "play") { startPlay(); renderRef(root, ctl); return; }
        if (v === "stop") { transportStop(); renderRef(root, ctl); return; }
        if (v === "pick") { pickWav(root, { ref: true }); return; }
        if (v === "relink") { var r0 = M.refOf(p); if (r0) { pickWav(root, { relink: r0.asset }); } return; }
        if (v === "mute") { var r1 = M.refOf(p); if (r1) { M.refSet(p, "mute", !r1.mute); markDirty(); refApply(); } }
        if (v === "clear") { M.clearRef(p); markDirty(); if (pl) { resync(); } st.rfMsg = "リファレンスを外しました（端末の素材は残っています）"; }
        renderRef(root, ctl);
      };
    }
    var g = root.querySelector("[data-rf-gain]"), o = root.querySelector("[data-rf-off]"), w = root.querySelector("[data-rf-wave]");
    if (g) { g.oninput = function () { M.refSet(p, "gain", Number(g.value)); refApply(); var gv = root.querySelector(".drf-gv"); if (gv) { var r2 = M.refOf(p); gv.textContent = (r2.gain > 0 ? "+" : "") + r2.gain + " dB"; } }; g.onchange = function () { markDirty(); }; }
    if (o) { o.onchange = function () { M.refSet(p, "offset", Number(o.value)); markDirty(); if (pl) { resync(); } renderRef(root, ctl); }; }
    if (w) { w.onclick = function (ev) { var s = M.refSpan(p), rc = w.getBoundingClientRect ? w.getBoundingClientRect() : null; if (!s || !rc || !(rc.width > 0)) { return; } var f = Math.max(0, Math.min(1, (ev.clientX - rc.left) / rc.width)), tk = Math.max(0, Math.round(M.secToTick(p, Math.max(0, s.start + f * s.dur)))); refJump(tk); renderRef(root, ctl); }; }
    drawHead();
  }
  // §343: 🎄 クリスマス制作（画面と仕組みは arcade-daw-xmas.js。ここは曲・↶・保存・切りかえを渡すだけ）
  var xmHost = {
    project: function () { return project(); },
    snap: function () { return snapTracks(); },
    go: function (v) { var p = project(), mel = p.tracks.filter(function (t0) { return /^メロディ/.test(t0.name) || (t0.ext && t0.ext.icon === "&#x1F3A4;"); })[0]; if (v === "mel") { var mc = mel ? (mel.clips.filter(function (c0) { return c0.notes && c0.notes.length; })[0] || mel.clips[0]) : null; if (mc && openRoll(mc.id)) { rerender(); return true; } st.view = "arr"; rerender(); return false; } if (v === "mix") { st.view = "mix"; rerender(); return true; } if (v === "proj") { st.view = "proj"; rerender(); return true; } st.view = "arr"; rerender(); return true; }, // §345 A26: 仕上げの道案内から
    snapAll: function () { var p = project(); return { __all: true, tracks: JSON.parse(JSON.stringify(p.tracks)), markers: JSON.parse(JSON.stringify(p.markers || [])), tempo: JSON.parse(JSON.stringify(p.tempo)), ext: JSON.parse(JSON.stringify(p.ext || {})) }; }, // §345 A4: 曲のコード（ext）も ↶ で戻す
    restore: function (s) { project().tracks = s; },
    commit: function (snap, note, tid, cid) { pushUndo(snap); st.anote = note ? String(note) : ""; if (cid) { st.sel = { kind: "clip", id: cid }; } else if (tid) { st.sel = { kind: "track", id: tid }; } st.reveal = true; markDirty(); if (pl) { resync(); } rerender(); return true; },
    dirty: function () { markDirty(); if (pl) { resync(); } },
    render: function () { rerender(); },
    isView: function () { return st.view === "xmas" && !!st.root; },
    back: function () { st.view = "arr"; rerender(); },
    edit: function (cid) { if (openEditor(cid)) { rerender(); } },
    undo: function () { ops.undo(); },
    redo: function () { ops.redo(); }, // §345 A27
    playing: function () { return !!pl; },
    stopSong: function () { stopPlay(false); },
    selTrack: function () { var s0 = st.sel; if (!s0) { return ""; } if (s0.kind === "track") { return s0.id; } if (s0.kind === "clip") { var f = DM().findClip(project(), s0.id); return f ? f.track.id : ""; } return ""; },
    newSong: function (np) { np.id = DM().newProjectId(); switchTo(np, "dirty"); saveNow(); st.view = "xmas"; rerender(); },
    openRef: function () { st.view = "ref"; rerender(); },
    refBuf: function () { var p0 = project(), s1 = DM().refSpan(p0); if (!s1) { return null; } audKick(p0); var b = aud.buf[s1.asset.id]; return b ? { buf: b, span: s1 } : null; }
  };
  function renderXmas(root, ctl) {
    var X = XM();
    if (!X) { st.view = "arr"; render(root, ctl); return; }
    root.innerHTML = X.html(xmHost);
    X.bind(root, xmHost);
  }
  // リファレンスの画面から、その位置へ（再生中ならそこから鳴らす・画面は切りかえない）
  function refJump(tick) {
    if (rec.state !== "idle") { st.rfMsg = "録音中は移れません"; return false; }
    st.cue = Math.max(0, Math.round(tick));
    if (pl && !pl.clip) { startPlay({ from: st.cue }); }
    return true;
  }
  // 確かめる画面のボタン
  function stageAct(v) {
    if (v === "cancel") { stageCancel(); audNote("読みこみをやめました（曲は変えていません）"); st.rfMsg = "読みこみをやめました（曲は変えていません）"; rerender(); return; }
    stageCommit(v === "ref" ? "ref" : "track", function (r) { stageDone(r); });
    rerender();
  }
  function stageDone(r) {
    var msg;
    if (!r.ok) { msg = "⚠️ " + r.why + (/曲は変えていません|保存しました/.test(r.why) ? "" : "（曲は変えていません）"); }
    else if (r.relinked) { msg = "🔗 「" + (r.asset ? r.asset.name : "") + "」をつなぎなおしました"; }
    else if (r.where === "ref") { msg = "🎧 「" + r.asset.name + "」をリファレンスにしました（" + DM().secText(r.asset.sec) + "）" + (r.saved ? "" : "。ただし曲を保存できませんでした"); }
    else { msg = "🎵 「" + r.asset.name + "」を置きました（" + DM().secText(r.asset.sec) + "）" + (r.saved ? "" : "。ただし曲を保存できませんでした"); }
    st.rfMsg = msg; audNote(msg);
    if (r.ok && pl) { resync(); }
    rerender();
  }
  // 読みこみが終わった（画面のメッセージ・再生中なら鳴らしなおす）
  function audDone(r, name) {
    if (!r.ok) { audNote("⚠️ 読みこめませんでした: " + r.why + (/曲は変えていません|保存しました/.test(r.why) ? "" : "（曲は変えていません）")); }
    else if (r.relinked) { audNote("🔗 「" + (r.asset ? r.asset.name : name) + "」をつなぎなおしました"); }
    else {
      var a = r.asset;
      audNote("🎵 「" + name + "」を置きました（" + (Math.round(a.sec * 10) / 10) + " 秒・" + a.sr + "Hz・" + a.ch + "ch" + (r.reused ? "・端末にあった同じ素材を使いました" : "") + "）" + (r.saved ? "" : "。ただし曲を保存できませんでした"));
    }
    if (r.ok && pl) { resync(); }
    rerender();
  }

  // ---------- §341 9A-12: マイク録音 ----------
  // getUserMedia → MediaStreamAudioSourceNode（UGMelody.audio.ctx）→ AudioWorklet（だめなら ScriptProcessor）で PCM をそのまま受けとる → モノラル 16bit の WAV → importWav（9A-10 と同じ保存）
  // MediaRecorder は使わない（形式がブラウザでちがう・圧縮される・録りはじめを AudioContext の時計と合わせられない）
  var REC_MAX_SEC = 60, REC_MIN_SEC = 0.5, REC_KEY = "ultimateGorillaDawRecV1", REC_CHUNK = 2048, REC_SP = 4096, REC_TICK_MS = 100, REC_STALL_MS = 3000, REC_NAME = "ug-daw-rec", REC_BARS = 256;
  var rec = { state: "idle", open: false, track: "", takeClip: "", bar: 0, withPlay: true, countIn: true, beats: 0, beat: 0.5, t0: 0, clicks: [], result: null, monitor: false, msg: "", tok: null, ac: null, stream: null, src: null, node: null, sink: null, mon: null, mode: "",
    sr: 0, f0: 0, next: -1, kept: 0, max: 0, chunks: [], peak: 0, clipN: 0, comp: 0, auto: null, manual: 0, start: 0, timer: null, last: 0, fail: null, failUrl: "", wl: null, info: null };
  // AudioWorklet の中のコード（文字列のまま data: URL・だめなら Blob URL で読む）。REC_CHUNK フレームごとに { f: 1 フレーム目の番号, d: Float32Array } を送る
  var REC_WORKLET = [
    "class P extends AudioWorkletProcessor {",
    "  constructor() { super(); this.b = new Float32Array(" + REC_CHUNK + "); this.n = 0; this.f = 0; this.on = true; var s = this; this.port.onmessage = function (e) { if (e.data === 'stop') { s.on = false; } }; }",
    "  process(inp) {",
    "    if (!this.on) { return false; }",
    "    var c = inp[0] && inp[0][0], i;",
    "    if (!c) { return true; }",
    "    for (i = 0; i < c.length; i++) {",
    "      if (this.n === 0) { this.f = currentFrame + i; }",
    "      this.b[this.n++] = c[i];",
    "      if (this.n === this.b.length) { this.port.postMessage({ f: this.f, d: this.b }, [this.b.buffer]); this.b = new Float32Array(" + REC_CHUNK + "); this.n = 0; }",
    "    }",
    "    return true;",
    "  }",
    "}",
    "registerProcessor('" + REC_NAME + "', P);"
  ].join("\n");
  // 手で足す遅れの補正（ms・この端末だけ）
  function recManual() { var r = lsRaw(REC_KEY), o = null; if (r) { try { o = JSON.parse(r); } catch (e) { o = null; } } var v = o && isFinite(Number(o.offsetMs)) ? Number(o.offsetMs) : 0; return Math.max(-500, Math.min(500, Math.round(v))); }
  function recSetManual(ms) { var v = Math.max(-500, Math.min(500, Math.round(Number(ms) || 0))); lsPut(REC_KEY, JSON.stringify({ format: "ultimate-gorilla-daw-rec", offsetMs: v })); return v; }
  // 自動の補正（ブラウザが報告する 出力の遅れ ＋ マイクの入力の遅れ・秒）
  function recAuto(ac, stream) {
    var o = 0, i = 0;
    try { o = Number(ac.outputLatency); if (!(o > 0 && o < 1)) { o = Number(ac.baseLatency); } if (!(o > 0 && o < 1)) { o = 0; } } catch (e) { o = 0; }
    o += masterLatency(ac); // 9B-10: マスターのリミッターの先読み（5ms）
    try { var tr = stream && stream.getAudioTracks ? stream.getAudioTracks()[0] : null, s = tr && tr.getSettings ? tr.getSettings() : null; i = s && Number(s.latency) > 0 && Number(s.latency) < 1 ? Number(s.latency) : 0; } catch (e2) { i = 0; }
    return { out: o, inp: i, sec: o + i };
  }
  // 録れる長さ（秒）: 60 秒・WAV の上限・1 曲の素材の合計の残り
  function recRoom(p, sr) {
    var M = DM(), sec = M.shortSec(p); // 9B-20: 長い素材は録音の合計（120 秒）に入れない（録音の上限は変えない）
    return Math.max(0, Math.min(REC_MAX_SEC, M.WAV_MAX_SEC, (M.WAV_MAX_BYTES - 44) / (2 * (sr || 48000)), M.MAX_ASSET_SEC - sec));
  }
  function recMedia() { try { var n = window.navigator, md = n && n.mediaDevices; return md && md.getUserMedia ? md : null; } catch (e) { return null; } }
  // 録音を始められない理由（"" ＝ 始められる）
  function recWhy(p, t) {
    var M = DM();
    if (!p || p.readOnly) { return "この曲は読むだけなので、録音を置けません"; }
    if (!t || !M.isAudio(t)) { return "オーディオトラックを選んでください"; }
    if (rec.takeClip) { var fk = M.findClip(p, rec.takeClip); if (!fk || fk.clip.type !== "audio") { return "テイクを足すクリップが見つかりません"; } var tw = M.takeRoomWhy(fk.clip); if (tw) { return tw; } } // 9A-14
    if (aud.busy) { return "いま別の音声を読みこんでいます"; }
    if (wav.busy) { return "WAV を書き出しています。終わってから録音してください"; }
    if (pk.busy) { return "ZIP を作っています。終わってから録音してください"; }
    if (window.isSecureContext === false) { return "マイクは https のページ（GitHub Pages）か localhost でだけ使えます"; }
    if (!recMedia()) { return "このブラウザではマイクを使えません（getUserMedia がありません）"; }
    if ((p.assets || []).length >= M.MAX_ASSETS) { return M.assetRoomWhy(p, { sec: 0 }); }
    if (recRoom(p, 0) < 1) { return M.assetRoomWhy(p, { sec: 1 }) || ("1 曲の音声の素材は合計 " + M.MAX_ASSET_SEC + " 秒までなので、もう録れません"); }
    return "";
  }
  function micErr(e) {
    var n = String((e && e.name) || "");
    if (n === "NotAllowedError" || n === "SecurityError" || n === "PermissionDeniedError") { return "マイクの使用が許可されませんでした。ブラウザの設定（iPhone は「設定 → アプリ → Safari → マイク」、PC はアドレスバーの鍵のマーク）で許可してから、もう一度 ● を押してください"; }
    if (n === "NotFoundError" || n === "OverconstrainedError" || n === "DevicesNotFoundError") { return "マイクが見つかりませんでした"; }
    if (n === "NotReadableError" || n === "AbortError" || n === "TrackStartError") { return "マイクを使えませんでした（ほかのアプリが使っている・マイクの不具合など）"; }
    if (n === "ended") { return "マイクが切れました"; }
    return "録音を始められませんでした（" + errName(e) + "）";
  }
  function stopStream(s) { var l = [], i; try { l = s && s.getTracks ? s.getTracks() : []; } catch (e) { l = []; } for (i = 0; i < l.length; i++) { try { l[i].onended = null; l[i].stop(); } catch (e2) {} } }
  // マイクとノードを全部はなす（どの終わり方でも必ず通る）
  function recRelease() {
    var l = [rec.src, rec.mon, rec.sink], i;
    rec.tok = null;
    if (rec.timer) { clearInterval(rec.timer); rec.timer = null; }
    for (i = 0; i < rec.clicks.length; i++) { try { rec.clicks[i].o.stop(0); } catch (e4) {} try { rec.clicks[i].g.disconnect(); } catch (e5) {} } // 9A-13: カウントインのクリック
    rec.clicks = [];
    if (rec.node) {
      try { if (rec.node.port) { rec.node.port.onmessage = null; rec.node.port.postMessage("stop"); } } catch (e) {}
      try { rec.node.onaudioprocess = null; } catch (e1) {}
      try { rec.node.disconnect(); } catch (e2) {}
    }
    for (i = 0; i < l.length; i++) { if (l[i]) { try { l[i].disconnect(); } catch (e3) {} } }
    stopStream(rec.stream);
    rec.stream = null; rec.src = null; rec.node = null; rec.mon = null; rec.sink = null;
  }
  function recFreeFail() { if (rec.failUrl) { try { URL.revokeObjectURL(rec.failUrl); } catch (e) {} } rec.failUrl = ""; rec.fail = null; }
  function recOpen(tid) { if (rec.state !== "idle") { return false; } var p = project(), M = DM(), lr = M.loopRange(p); rec.open = true; rec.track = tid; rec.takeClip = ""; rec.msg = ""; recFreeFail(); rec.bar = p.practice && p.practice.loopOn ? M.tickToBar(p, lr.a).bar - 1 : 0; rec.manual = recManual(); st.chooseAdd = false; st.confirmDel = null; st.anote = ""; return true; }
  // ● 録音開始（ボタンの中から: AudioContext を作る・再開する → マイクの許可）
  function recStart() {
    var p = project(), M = DM(), t = M.findTrack(p, rec.track), UG = window.UGMelody, ac = null, why;
    if (rec.state !== "idle") { return false; }
    rec.msg = ""; recFreeFail();
    why = recWhy(p, t) || assetAddWhy(); // 9A-16
    if (why) { rec.msg = why; return false; }
    try { ac = UG && UG.audioInit ? UG.audioInit() : null; } catch (e) { ac = null; }
    if (!ac || !ac.createMediaStreamSource) { rec.msg = "このブラウザでは録音できません（Web Audio のマイク入力が使えません）"; return false; }
    stopPlay(false);
    var tok = rec.tok = {}, pr;
    rec.state = "ask"; rec.ac = ac; rec.mode = ""; rec.info = null;
    try { pr = recMedia().getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 }, video: false }); } catch (e1) { recFail(tok, e1); return true; }
    if (!pr || !pr.then) { recFail(tok, { message: "getUserMedia" }); return true; }
    pr.then(function (stream) { if (rec.tok !== tok) { stopStream(stream); return; } recWire(tok, stream); }, function (e2) { recFail(tok, e2); });
    return true;
  }
  function recFail(tok, e) {
    if (rec.tok !== tok) { return; }
    var withPl = rec.state === "rec" && rec.withPlay;
    recRelease();
    if (withPl) { stopPlay(false); }
    rec.chunks = []; rec.state = "idle";
    rec.msg = (e && e.ugText ? e.ugText : micErr(e)) + "（曲は変えていません）";
    rec.result = { kind: "fail", text: rec.msg };
    rerender();
  }
  function recWire(tok, stream) {
    var ac = rec.ac, UG = window.UGMelody, trs = [], i;
    rec.stream = stream;
    try { rec.src = ac.createMediaStreamSource(stream); } catch (e) { recFail(tok, { ugText: "このブラウザでは、マイクの音を Web Audio に入れられませんでした（" + errName(e) + "）" }); return; }
    try {
      rec.sink = ac.createGain(); rec.sink.gain.value = 0; rec.sink.connect(ac.destination); // 処理を動かすための出口（音は出さない）
      rec.mon = ac.createGain(); rec.mon.gain.value = rec.monitor ? 1 : 0; rec.src.connect(rec.mon); // モニター（はじめは OFF ＝ 0）
      rec.mon.connect(UG && UG.audio && UG.audio.ctx === ac && UG.audio.master ? UG.audio.master : ac.destination);
    } catch (e1) { recFail(tok, { ugText: "録音の準備ができませんでした（" + errName(e1) + "）" }); return; }
    try { trs = stream.getAudioTracks ? stream.getAudioTracks() : []; } catch (e2) { trs = []; }
    for (i = 0; i < trs.length; i++) { trs[i].onended = function () { if (rec.tok !== tok) { return; } if (rec.state === "rec") { recStop("ended"); } else { recFail(tok, { name: "ended" }); } }; }
    try { var s0 = trs[0] && trs[0].getSettings ? trs[0].getSettings() : {}; rec.info = { label: String((trs[0] && trs[0].label) || "").substring(0, 60), ch: s0.channelCount || 0, sr: s0.sampleRate || 0, ec: s0.echoCancellation, ns: s0.noiseSuppression, agc: s0.autoGainControl }; } catch (e3) { rec.info = null; }
    recNode(ac, tok, function (ok) { if (rec.tok !== tok) { return; } if (!ok) { recFail(tok, { ugText: "このブラウザでは録音の処理を作れませんでした" }); return; } recBegin(tok); });
  }
  // PCM を受けとるノード（AudioWorklet → だめなら ScriptProcessor）
  function recNode(ac, tok, cb) {
    function sp() {
      if (rec.tok !== tok) { return; }
      var n = null;
      try { n = ac.createScriptProcessor(REC_SP, 1, 1); } catch (e) { n = null; }
      if (!n) { cb(false); return; }
      n.onaudioprocess = function (ev) { if (rec.node !== n) { return; } var d = ev.inputBuffer.getChannelData(0); recChunk(rec.next >= 0 ? rec.next : Math.round(ac.currentTime * ac.sampleRate) - d.length, new Float32Array(d)); };
      try { rec.src.connect(n); n.connect(rec.sink); } catch (e1) { cb(false); return; }
      rec.node = n; rec.mode = "script"; cb(true);
    }
    function make() {
      if (rec.tok !== tok) { return; }
      var n = null;
      try { n = new window.AudioWorkletNode(ac, REC_NAME, { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 1, channelCountMode: "explicit", channelInterpretation: "speakers" }); } catch (e) { n = null; }
      if (!n) { sp(); return; }
      n.port.onmessage = function (e) { var m = e.data; if (rec.node === n && m && m.d) { recChunk(m.f, m.d); } };
      try { rec.src.connect(n); n.connect(rec.sink); } catch (e1) { sp(); return; }
      rec.node = n; rec.mode = "worklet"; cb(true);
    }
    if (!ac.audioWorklet || !window.AudioWorkletNode) { sp(); return; }
    if (rec.wl === ac) { make(); return; }
    function load(u, next) {
      var pr;
      try { pr = ac.audioWorklet.addModule(u); } catch (e) { next(); return; }
      if (!pr || !pr.then) { next(); return; }
      pr.then(function () { rec.wl = ac; make(); }, function () { next(); });
    }
    load("data:application/javascript;charset=utf-8," + encodeURIComponent(REC_WORKLET), function () {
      var bu = "";
      try { bu = URL.createObjectURL(new Blob([REC_WORKLET], { type: "application/javascript" })); } catch (e) { bu = ""; }
      if (!bu) { sp(); return; }
      load(bu, sp);
    });
  }
  // 録りはじめる（伴奏ありなら、ループなしの再生を録りはじめの小節から）
  function recBegin(tok) {
    var p = project(), M = DM(), ac = rec.ac;
    if (rec.withPlay && audNeedLoad(p)) { ensureAssets(p, function () { if (rec.tok === tok) { recBegin(tok); } }); return; } // 伴奏の音声の素材を読みこんでから
    rec.sr = ac.sampleRate; rec.max = Math.floor(recRoom(p, rec.sr) * rec.sr); rec.kept = 0; rec.chunks = []; rec.peak = 0; rec.clipN = 0; rec.next = -1;
    rec.auto = recAuto(ac, rec.stream); rec.manual = recManual();
    rec.start = M.barToTick(p, rec.bar);
    var fkc = rec.takeClip ? M.findClip(p, rec.takeClip) : null; if (fkc) { rec.start = fkc.clip.start; } // 9A-14: 別テイクはクリップと同じ位置
    // 9A-13: カウントイン 1 小節（録りはじめの小節の拍子・BPM）。録るのはそのあとの小節の頭から
    var m0 = M.meterAt(p, rec.start), beat = 60 / M.bpmAt(p, rec.start) * 4 / m0.den;
    rec.beats = rec.countIn ? m0.num : 0; rec.beat = beat;
    var lead = rec.beats * beat;
    rec.state = "rec"; rec.last = Date.now();
    if (rec.withPlay) {
      rec.comp = Math.max(0, rec.auto.sec + rec.manual / 1000);
      var end = M.songEndTick(p);
      if (!startPlay({ from: rec.start, a: rec.start, b: Math.max(end, rec.start + M.barTicks(p)), loop: false, noWait: true, rec: true, delay: lead, muteClip: rec.takeClip || null }) || !pl) { recFail(tok, { ugText: st.msg || "伴奏を鳴らせませんでした" }); return; }
      rec.t0 = pl.segs[0].t0;
    } else {
      rec.comp = rec.beats ? Math.max(0, rec.auto.sec + rec.manual / 1000) : 0; // カウントインに合わせて弾くので、伴奏なしでも補正する
      rec.t0 = rec.beats ? ac.currentTime + START_LEAD + lead : ac.currentTime;
    }
    rec.f0 = Math.round((rec.t0 + rec.comp) * rec.sr); // この番号のフレーム ＝ 録りはじめの小節の頭（伴奏・クリックの予約と同じ時計）。それより前（カウントイン）は捨てる
    if (rec.beats) { recClicks(ac, rec.t0 - lead, beat, rec.beats); }
    rec.timer = setInterval(recTick, REC_TICK_MS);
    rerender();
  }
  // 受けとった PCM（f ＝ 1 フレーム目の AudioContext のフレーム番号）。抜けは無音で埋め、重なりは捨てる
  function recChunk(f, d) {
    if (rec.state !== "rec") { return; }
    rec.last = Date.now();
    if (rec.next >= 0 && f > rec.next) { var gap = Math.min(f - rec.next, rec.max + 1); recPush(rec.next, new Float32Array(gap)); if (rec.state !== "rec") { return; } }
    else if (rec.next >= 0 && f < rec.next) { var cut = rec.next - f; if (cut >= d.length) { return; } d = d.subarray(cut); f = rec.next; }
    recPush(f, d);
  }
  function recPush(f, d) {
    rec.next = f + d.length;
    var a = Math.max(0, rec.f0 - f);
    if (a >= d.length) { return; }
    var take = Math.min(d.length - a, rec.max - rec.kept), i, x, pk = rec.peak;
    if (take <= 0) { return; }
    var seg = new Float32Array(take);
    for (i = 0; i < take; i++) { x = d[a + i]; if (x !== x) { x = 0; } seg[i] = x; if (x < 0) { x = -x; } if (x > pk) { pk = x; } if (x >= 0.999) { rec.clipN++; } }
    rec.peak = pk;
    rec.chunks.push(seg); rec.kept += take;
    if (rec.kept >= rec.max) { setTimeout(function () { recStop("max"); }, 0); }
  }
  // 9A-13: カウントインのクリック（1 拍目は高い音）。伴奏ありなら DAW のマスターへ
  function recClicks(ac, t0, beat, n) {
    var UG = window.UGMelody, dest = pl && pl.ac === ac ? masterOf().bus : (UG && UG.audio && UG.audio.ctx === ac && UG.audio.bus ? UG.audio.bus : ac.destination), k;
    rec.clicks = [];
    for (k = 0; k < n; k++) {
      try {
        var o = ac.createOscillator(), g = ac.createGain(), t = t0 + k * beat;
        o.frequency.value = k === 0 ? 1760 : 1320; g.gain.value = 0;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(k === 0 ? 0.5 : 0.35, t + 0.002); g.gain.setTargetAtTime(0, t + 0.012, 0.012);
        o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.1);
        rec.clicks.push({ o: o, g: g, t: t, accent: k === 0 });
      } catch (e) {}
    }
  }
  // いまの段階（カウント n／拍・録音中）
  function recPhase() {
    var now = rec.ac ? rec.ac.currentTime : 0;
    if (rec.state !== "rec") { return ""; }
    if (now < rec.t0) { return rec.beats ? "カウント " + Math.min(rec.beats, Math.max(1, Math.floor((now - (rec.t0 - rec.beats * rec.beat)) / rec.beat) + 1)) + "／" + rec.beats : "準備中…"; }
    return "録音中";
  }
  function recClock(sec) { var s = Math.max(0, sec), m = Math.floor(s / 60), r = s - m * 60; return m + ":" + (r < 10 ? "0" : "") + (Math.floor(r * 10) / 10).toFixed(1); }
  // 100ms ごと: 経過時間・入力レベル（描きなおさずに文字と幅だけ）。データが 3 秒来なければ止める（電話・別のアプリなどで止まった）
  function recTick() {
    if (rec.state !== "rec") { return; }
    if (Date.now() - rec.last > REC_STALL_MS) { recStop("stall"); return; }
    var root = st.root, el = root && root.querySelector ? root.querySelector(".dr-time") : null, lv = root && root.querySelector ? root.querySelector(".dr-lv") : null;
    if (el) { el.textContent = recClock(rec.kept / rec.sr) + " / " + recClock(rec.max / rec.sr); }
    var lb = root && root.querySelector ? root.querySelector(".dr-lab") : null; if (lb) { lb.textContent = recPhase(); }
    if (lv) { lv.style.width = Math.round(Math.min(1, rec.peak) * 100) + "%"; lv.className = "dr-lv" + (rec.peak >= 0.999 ? " dr-hot" : ""); }
    rec.peak = 0;
  }
  // PCM（Float32 の列）→ モノラル 16bit の WAV（RIFF・fmt の PCM 1・data）
  function recWav(chunks, n, sr) {
    var ab = new ArrayBuffer(44 + n * 2), v = new DataView(ab), o = 44, w = 0, i, j, x;
    function tag(off, s) { var k; for (k = 0; k < 4; k++) { v.setUint8(off + k, s.charCodeAt(k)); } }
    tag(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); tag(8, "WAVE"); tag(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); tag(36, "data"); v.setUint32(40, n * 2, true);
    for (i = 0; i < chunks.length && w < n; i++) {
      var d = chunks[i];
      for (j = 0; j < d.length && w < n; j++) { x = d[j]; x = x > 1 ? 1 : (x < -1 ? -1 : x); v.setInt16(o, x < 0 ? Math.round(x * 32768) : Math.round(x * 32767), true); o += 2; w++; }
    }
    return ab;
  }
  var REC_WHY = { max: "上限の長さになったので止めました。", ended: "マイクが切れたので、そこまでを置きます。", stall: "マイクの音が来なくなったので（電話・ほかのアプリなど）、そこまでを置きます。", hidden: "画面を離れたので、そこまでを置きます。", exit: "DAW を閉じたので、そこまでを置きます。", btn: "" };
  // ■ 停止して置く（ボタン・⏹・上限・中断）。マイクを先にはなしてから WAV にして importWav へ
  function recStop(reason) {
    if (rec.state === "ask") { recCancel("録音をやめました（曲は変えていません）"); return true; }
    if (rec.state !== "rec") { return false; }
    var p = project(), M = DM(), n = rec.kept, sr = rec.sr, chunks = rec.chunks, start = rec.start, tid = rec.track, why0 = REC_WHY[reason] || "", clipN = rec.clipN;
    var withPl = rec.withPlay, takeClip = rec.takeClip;
    recRelease();
    if (withPl) { stopPlay(false); }
    rec.chunks = [];
    if (n < REC_MIN_SEC * sr) { rec.state = "idle"; rec.msg = why0 + "録音が短すぎる（" + (Math.round(n / sr * 10) / 10) + " 秒）ので捨てました（曲は変えていません）"; rec.result = { kind: "discard", text: rec.msg }; rerender(); return true; }
    var ab = recWav(chunks, n, sr), info = M.parseWav(ab), name = "録音 " + fmtTime(Date.now()) + ".wav", sec = Math.round(n / sr * 10) / 10;
    if (!info.ok || info.fmt !== 1 || info.bits !== 16 || info.ch !== 1 || info.frames !== n) { rec.state = "idle"; rec.msg = "録音を WAV にできませんでした（曲は変えていません）"; rec.result = { kind: "fail", text: rec.msg }; rerender(); return true; }
    rec.state = "saving"; rec.msg = why0; rerender();
    importWav(ab, name, { track: tid, start: start, src: "rec", take: takeClip || undefined }, function (r) {
      rec.state = "idle";
      if (!r.ok) {
        rec.fail = { ab: ab, name: name.replace(/[\/:]/g, "-") };
        rec.msg = why0 + "録音を置けませんでした: " + r.why + (/曲は変えていません|保存しました/.test(r.why) ? "" : "（曲は変えていません）") + "。下のボタンで、録った音を WAV のファイルにとっておけます";
        rec.result = { kind: "fail", text: why0 + "録音を置けませんでした: " + r.why + "。録音の欄で WAV のファイルにとっておけます" }; rec.open = true; rec.track = tid;
        rerender(); return;
      }
      var t = M.findTrack(project(), tid), moved = r.clip && r.clip.start !== start;
      rec.open = false; rec.msg = "";
      if (r.take) { rec.result = { kind: r.saved ? "ok" : "fail", text: why0 + "🎙️ テイク " + r.take + "（" + sec + " 秒）を「" + clipLabel(r.clip) + "」に足して、使用中にしました" + (clipN ? "。音が大きすぎて割れたところがあります" : "") + (r.saved ? "（保存しました・前のテイクも残っています）" : "。ただし曲を保存できませんでした") }; rerender(); return; } // 9A-14
      rec.result = { kind: r.saved ? "ok" : "fail", text: why0 + "🎙️ 録音（" + sec + " 秒）を「" + (t ? t.name : "") + "」の " + (r.clip ? M.tickToBar(project(), r.clip.start).bar : "?") + " 小節目に置きました" + (moved ? "（録りはじめの小節にほかのクリップが重なったので、後ろへずらしました。伴奏とはずれています）" : "") + (clipN ? "。音が大きすぎて割れたところがあります（マイクから少し離れてください）" : "") + (r.saved ? "（保存しました）" : "。ただし曲を保存できませんでした") }; // 9A-13: 置いた・捨てたを上の欄に
      rerender();
    });
    return true;
  }
  // 9A-13: どの画面の ⏹ も同じ: 録音中なら「録音の停止（置く）」、でなければ再生を止める
  function transportStop() { if (rec.state === "rec" || rec.state === "ask") { recStop("btn"); return true; } stopPlay(false); return false; }
  // ✕ やめる（捨てる）・曲を切りかえる
  function recCancel(msg) {
    if (rec.state !== "rec" && rec.state !== "ask") { return false; }
    var withPl = rec.state === "rec" && rec.withPlay;
    recRelease();
    if (withPl) { stopPlay(false); }
    rec.chunks = []; rec.kept = 0; rec.state = "idle"; rec.msg = msg || "";
    if (msg) { rec.result = { kind: "discard", text: "🗑️ " + msg }; }
    return true;
  }
  // 画面のボタン（data-rc）
  function recUi(v) {
    if (v === "go") { recStart(); return; }
    if (v === "stop") { recStop("btn"); return; }
    if (v === "cancel") { recCancel("録音をやめました（捨てました・曲は変えていません）"); return; }
    if (v === "mon") { rec.monitor = !rec.monitor; if (rec.mon) { try { rec.mon.gain.value = rec.monitor ? 1 : 0; } catch (e) {} } return; }
    if (rec.state !== "idle") { return; }
    if (v === "close") { rec.open = false; rec.msg = ""; recFreeFail(); return; }
    if ((v === "bar-" || v === "bar+") && rec.takeClip) { return; }
    if (v === "bar-" || v === "bar+") { rec.bar = Math.max(0, Math.min(REC_BARS - 1, rec.bar + (v === "bar+" ? 1 : -1))); return; }
    if (v === "play") { rec.withPlay = !rec.withPlay; return; }
    if (v === "cnt") { rec.countIn = !rec.countIn; return; }
    if (v === "off-" || v === "off+") { rec.manual = recSetManual(recManual() + (v === "off+" ? 10 : -10)); }
  }
  function recHtml(p) {
    var M = DM(), t = M.findTrack(p, rec.track), i;
    if (!t || !M.isAudio(t)) { if (rec.state === "idle") { rec.open = false; return ""; } }
    function b(act, label, cls, dis) { return '<button class="modal-btn' + (cls ? " " + cls : "") + '" data-rc="' + act + '"' + (dis ? " disabled" : "") + '>' + label + '</button>'; }
    var tkc = rec.takeClip ? M.findClip(p, rec.takeClip) : null;
    var h = '<div class="daw-info da-panel dr">' + (tkc ? '<div>&#x1F399;&#xFE0F; <b>別テイクを録音</b> &#x2192; 「' + escHtml(clipLabel(tkc.clip)) + '」（いまのテイク ' + escHtml(M.activeTakeId(tkc.clip)) + '・' + M.takesOf(p, tkc.clip).length + '／' + M.MAX_TAKES + '）</div>' : '<div>&#x1F399;&#xFE0F; <b>録音</b> &#x2192; 「' + escHtml(t ? t.name : "?") + '」</div>');
    var monB = b("mon", "&#x1F3A7; モニター（マイクの音を聞く）: " + (rec.monitor ? "ON" : "OFF"), "da-wide dr-tg" + (rec.monitor ? " on" : ""));
    if (rec.state === "rec") {
      h += '<div class="dr-live"><span class="dr-dot">&#x25CF;</span> <span class="dr-lab">' + recPhase() + '</span> <b class="dr-time">' + recClock(rec.kept / rec.sr) + ' / ' + recClock(rec.max / rec.sr) + '</b><span class="dr-meter" aria-hidden="true"><i class="dr-lv" style="width:0%;"></i></span></div>' +
        '<div class="small">' + (rec.beats ? 'カウントイン 1 小節（' + rec.beats + ' 拍）のあと、' : '') + (rec.withPlay ? '伴奏といっしょに ' + (rec.bar + 1) + ' 小節目の頭から録ります' : 'マイクだけ（伴奏なし）・' + (rec.bar + 1) + ' 小節目に置きます') + (rec.comp ? '（ずれの補正 ' + Math.round(rec.comp * 1000) + 'ms）' : '') + '・' + rec.sr + 'Hz・' + (rec.mode === "worklet" ? "AudioWorklet" : "ScriptProcessor") + '</div>' +
        '<div class="da-btns">' + b("stop", "&#x25A0; 停止して置く", "da-half dr-stop") + b("cancel", "&#x2715; やめる（捨てる）", "da-half") + monB + '</div>';
    } else if (rec.state === "ask") {
      h += '<div>&#x23F3; マイクの準備をしています…（ブラウザがマイクを使ってよいか聞いてきたら「許可」を押してください）</div><div class="da-btns">' + b("cancel", "&#x2715; やめる", "da-wide") + '</div>';
    } else if (rec.state === "saving") {
      h += '<div>&#x23F3; 録音を保存しています…（この端末の中に保存して、確かめてから置きます）</div>';
    } else {
      var why = recWhy(p, t), room = recRoom(p, rec.ac ? rec.ac.sampleRate : 0), st0 = M.barToTick(p, rec.bar), over = false, mn = rec.manual;
      for (i = 0; t && i < t.clips.length; i++) { if (t.clips[i].start + t.clips[i].len > st0) { over = true; } }
      var au = rec.auto ? Math.round(rec.auto.sec * 1000) : null;
      if (tkc) { over = false; }
      h += (tkc ? '<div class="dr-row">録りはじめ: <b>' + M.tickToBar(p, tkc.clip.start).bar + ' 小節目</b>（クリップと同じ位置。伴奏では、いまのテイクを鳴らしません）</div>' : '<div class="dr-row">録りはじめ: ' + b("bar-", "&#x2212;", "dr-sm", rec.bar <= 0) + ' <b>' + (rec.bar + 1) + ' 小節目</b> ' + b("bar+", "&#xFF0B;", "dr-sm") + '</div>') +
        '<div class="da-btns">' + b("cnt", (rec.countIn ? "&#x2611;" : "&#x2610;") + " &#x1F941; カウントイン 1 小節", "da-wide dr-tg" + (rec.countIn ? " on" : "")) + b("play", (rec.withPlay ? "&#x2611;" : "&#x2610;") + " &#x1F3B6; 伴奏を鳴らしながら録る", "da-wide dr-tg" + (rec.withPlay ? " on" : "")) + monB + '</div>' +
        (rec.withPlay || rec.countIn ? '<div class="dr-row small">ずれの補正: 自動 ' + (au === null ? '（録りはじめに測る）' : au + 'ms') + ' ＋ 手で ' + b("off-", "&#x2212;10", "dr-sm") + ' <b>' + (mn > 0 ? "+" : "") + mn + 'ms</b> ' + b("off+", "&#xFF0B;10", "dr-sm") + '<br>録った音が伴奏より遅れて聞こえるときは ＋、早いときは − にします。</div>' : '') +
        (over ? '<div class="small">&#x26A0;&#xFE0F; このトラックの ' + (rec.bar + 1) + ' 小節目より後ろにクリップがあります。重なると後ろへずらして置くので、伴奏とずれます（空いたオーディオトラックで録るのがおすすめ）。</div>' : '') +
        '<div class="da-btns">' + b("go", "&#x25CF; 録音開始（" + Math.floor(room) + " 秒まで）", "da-wide dr-go", !!why) + b("close", "閉じる", "da-wide") + '</div>' +
        (why ? '<div class="small">' + escHtml(why) + '</div>' : '') +
        '<div class="small">イヤホンをつけると、伴奏がマイクに入りません。モニターはイヤホンのときだけ ON にしてください（ハウリングします）。録った音は外へ送らず、この端末の中だけに保存します。</div>';
    }
    if (rec.msg) { h += '<div class="da-note">' + escHtml(rec.msg) + '</div>'; }
    if (rec.fail && rec.state === "idle") {
      if (!rec.failUrl) { try { rec.failUrl = URL.createObjectURL(new Blob([rec.fail.ab], { type: "audio/wav" })); } catch (e) { rec.failUrl = ""; } }
      if (rec.failUrl) { h += '<a class="modal-btn da-wide dr-dl" href="' + rec.failUrl + '" download="' + escHtml(rec.fail.name) + '">&#x2B07;&#xFE0F; 置けなかった録音を WAV で保存</a>'; }
    }
    return h + '</div>';
  }
  // ページを隠した（iPhone でホームへ・アプリの切りかえ・電話）: そこまでを置く
  if (window.document && document.addEventListener) { document.addEventListener("visibilitychange", function () { if (document.hidden && rec.state !== "idle") { if (rec.state === "rec") { recStop("hidden"); } else if (rec.state === "ask") { recCancel("画面を離れたので、録音をやめました"); } } }); }

  // ---------- §341 9A-9: WAV の書き出し（OfflineAudioContext・再生と同じ schedule()・44.1kHz・16bit・ステレオ）----------
  var WAV_RATE = 44100, WAV_MAX_MUSIC = 330, WAV_TAIL = 3, WAV_SAMPLE_WAIT = 8000, WAV_LONG = 150, WAV_STEP_FR = 688 * 128, WAV_AHEAD = 4, WAV_VO_KEEP = 1, WAV_SUS_WAIT = 60000, WAV_SLOW_MAX = 60; // 9B-14: 5 分 30 秒まで（2 分 30 秒からは注意）・9B-15: 区切って予約できないブラウザは 60 秒まで（v2.63 と同じ）
  var wav = { busy: false, job: null, blob: null, url: "", name: "", stats: null, plan: null, msg: "", note: "", state: "idle", log: [], ms: 0 };
  function fileBase(name) { return String(name || "gorilla-daw").replace(/[\\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/^[\s.]+|[\s.]+$/g, "").substring(0, 40) || "gorilla-daw"; }
  // ---------- §345 A16: 書き出すファイルの名前と保存（iPhone を先に考える）----------
  // 名前: 「曲名_[中身_]YYYYMMDD-HHMM.拡張子」（ミックスの WAV・MIDI・ZIP は中身なし・ステムは 01_トラック名・ステムの ZIP は stems）。この画面を開いているあいだに同じ名前を作ったら「-2」「-3」…（同じ名前のファイルで上書きしない）
  var outUsed = {};
  function outName(base, kind, ext, st0) {
    var b = fileBase(base) + (kind ? "_" + kind : "") + "_" + (st0 || stamp()), n = b + "." + ext, k = 2;
    while (outUsed[n]) { n = b + "-" + k + "." + ext; k++; }
    outUsed[n] = 1;
    return n;
  }
  // 保存の結果 → 案内（曲と録音はどの場合もそのまま）
  var SAVE_NOTE = {
    shared: "共有シートを開きました。「\"ファイル\"に保存」を選ぶと ファイル アプリに入ります",
    canceled: "保存をやめました（データはそのままです）。もう一度「ファイルに保存」を押せます",
    download: "ダウンロードしました（iPhone では ファイル アプリの「ダウンロード」）",
    fail: "保存できませんでした。下の「ダウンロード」を押すか、ほかのタブを閉じてからもう一度ためしてください（曲はそのままです）"
  };
  // blob を保存する → done(結果)。共有シート（iPhone）→ だめならダウンロード。共有シートを閉じた・失敗した、を分けて返す
  function daSave(blob, name, done) {
    var nav = window.navigator || {}, fin = function (r) { dgLog("save", { r: r, name: name, bytes: blob && blob.size }); if (done) { done(r); } };
    if (!blob) { fin("fail"); return "fail"; }
    try {
      if (window.File && nav.share && nav.canShare) {
        var file = new window.File([blob], name, { type: blob.type || "application/octet-stream" });
        if (nav.canShare({ files: [file] })) {
          var sp = nav.share({ files: [file], title: name });
          if (sp && sp.then) { sp.then(function () { fin("shared"); }, function (e) { fin(e && e.name === "AbortError" ? "canceled" : (dlBlob(blob, name) ? "download" : "fail")); }); }
          else { fin("shared"); }
          return "share";
        }
      }
    } catch (e) {}
    var r = dlBlob(blob, name) ? "download" : "fail"; fin(r); return r;
  }
  function dlBlob(blob, name) {
    try { var url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { try { document.body.removeChild(a); URL.revokeObjectURL(url); } catch (e) {} }, 3000); return true; } catch (e2) { return false; }
  }
  function fileSaveNote(r) { return r && SAVE_NOTE[r] ? '<div class="small dp-snote' + (r === "fail" ? " dp-sfail" : "") + '">' + (r === "fail" ? "&#x26A0;&#xFE0F; " : (r === "canceled" ? "" : "&#x2705; ")) + escHtml(SAVE_NOTE[r]) + '</div>' : ""; }
  function stamp() { var d = new Date(), z = function (n) { return (n < 10 ? "0" : "") + n; }; return d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + "-" + z(d.getHours()) + z(d.getMinutes()); }
  // 書き出す範囲と大きさの見こみ（曲の頭から曲の終わり ＋ 余韻。ループは使わない）
  function wavPlan(p) {
    var M = DM(), end = M.songEndTick(p), music = M.tickToSec(p, end), tl = M.sendTail(p), sec = music + Math.max(WAV_TAIL, tl.sec), frames = Math.ceil(sec * WAV_RATE); // 9B-11: センドの残響の長さまで（最大 10 秒）
    var r = { endTick: end, bars: M.tickToBar(p, Math.max(0, end - 1)).bar, music: music, sec: sec, frames: frames, bytes: 44 + frames * 4, ok: true, why: "", tail: Math.max(WAV_TAIL, tl.sec), tailCapped: tl.capped,
      memMB: Math.round(frames * 16 / 1048576), long: music > WAV_LONG, chunk: wavCanChunk() }; // 9B-14: 音声データだけのメモリの見積もり（描く音 8 ＋ WAV 4 ＋ 解析で読む 4 バイト／フレーム）。ブラウザ全体ではもっと使う（9B-15: PC の Chrome で 3 分の曲に 約 250MB）
    if (!(M.noteCount(p) > 0) && !(M.audioClipCount(p) > 0)) { r.ok = false; r.why = "音符も音声のクリップもありません"; }
    else if (music > WAV_MAX_MUSIC) { r.ok = false; r.why = "曲が " + secText(music) + "（" + Math.round(music) + " 秒）あります。WAV は " + secText(WAV_MAX_MUSIC) + " までです（メモリを守るため・途中で切らないので、書き出しません）"; }
    else if (!r.chunk && music > WAV_SLOW_MAX) { r.ok = false; r.why = "曲が " + secText(music) + "（" + Math.round(music) + " 秒）あります。" + (wav.noSuspend ? "前の書き出しが途中で止まったため、" : "このブラウザでは") + "長い曲を区切って書き出せないので、WAV は " + secText(WAV_SLOW_MAX) + " までです（区切らないと、長い曲はとても時間がかかります）。PC の Chrome なら " + secText(WAV_MAX_MUSIC) + " まで書き出せます"; } // 9B-15
    return r;
  }
  // 9B-15: 区切って予約できるか（OfflineAudioContext の suspend がある・止まったままになったことがない・SynthTrack のエンジンでない）。できないと全部を先に予約するので、長い曲ほどとても遅い（長さの 2 乗に近い）
  function wavCanChunk() {
    var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext, Y = window.UGSynth;
    return !!(OAC && OAC.prototype && typeof OAC.prototype.suspend === "function") && !wav.noSuspend && !(Y && Y.track);
  }
  function secText(s) { s = Math.max(0, Math.round(s)); var mm = Math.floor(s / 60), ss = s - mm * 60; return mm + ":" + (ss < 10 ? "0" : "") + ss; } // 9B-14: 分:秒
  function wavFree() { wav.saved = ""; if (wav.url) { try { URL.revokeObjectURL(wav.url); } catch (e) {} } wav.url = ""; wav.blob = null; }
  // 描いた音の検査（左右のピーク・RMS・NaN・0dBFS に届いたサンプル）
  function bufStats(buf) {
    var out = { ch: buf.numberOfChannels, rate: buf.sampleRate, frames: buf.length, sec: buf.length / buf.sampleRate, peak: 0, nan: 0, clip: 0, L: null, R: null }, c, i;
    for (c = 0; c < Math.min(2, buf.numberOfChannels); c++) {
      var d = buf.getChannelData(c), pk = 0, sq = 0, nan = 0, cl = 0, x;
      for (i = 0; i < d.length; i++) { x = d[i]; if (x !== x) { nan++; continue; } if (x < 0) { x = -x; } if (x > pk) { pk = x; } if (x >= 0.9999) { cl++; } sq += x * x; }
      var o = { peak: Math.round(pk * 10000) / 10000, rms: Math.round(Math.sqrt(sq / Math.max(1, d.length)) * 100000) / 100000, nan: nan, clip: cl };
      if (c === 0) { out.L = o; } else { out.R = o; }
      out.peak = Math.max(out.peak, o.peak); out.nan += nan; out.clip += cl;
    }
    return out;
  }
  // 曲全体を描く → cb(blob, why, stats, plan)
  function renderSong(cb, ro) { // ro（9B-14）: { job, onProgress } ＝ 進み具合（約 2 秒ごと）・やめる。§345 A12: proj ＝ 描く曲（無ければいまの曲）・noSend ＝ 共有のリバーブ・ディレイを入れない
    var p = (ro && ro.proj) || project(), M = DM(), UG = window.UGMelody, OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext, plan = wavPlan(p), id;
    if (!plan.ok) { cb(null, plan.why); return; }
    if (!OAC || !UG || !UG.audioInit || !UG.encodeWav) { cb(null, "このブラウザでは書き出せません（OfflineAudioContext がありません）"); return; }
    if (!UG.audioInit()) { cb(null, "音の準備ができませんでした"); return; }
    // §341 9A-10: 鳴らすはずの音声の素材が無い・読めないときは書き出さない（無音のまま成功にしない）
    var ti0, cj, miss = [];
    for (ti0 = 0; ti0 < p.tracks.length; ti0++) {
      var at = p.tracks[ti0];
      if (!M.isAudio(at) || !M.audible(p, at)) { continue; }
      for (cj = 0; cj < at.clips.length; cj++) { var acl = at.clips[cj]; if (acl.type === "audio" && !aud.buf[acl.asset]) { var aa = M.findAsset(p, acl.asset); miss.push((aa && aa.name) || clipLabel(acl)); } }
    }
    if (miss.length) { cb(null, "音声の素材がありません（「" + miss[0] + "」" + (miss.length > 1 ? " ほか " + (miss.length - 1) + " 個" : "") + "）。クリップを選んで「🔗 素材を選びなおす」でつなぎなおしてから書き出してください"); return; }
    var off, mlive = M.masterLive(p);
    try { off = new OAC(2, plan.frames, WAV_RATE); } catch (e) { cb(null, "書き出しの準備ができませんでした（メモリが足りないかもしれません）"); return; }
    if (mlive.lim) { limLoad(off, function (okL) { build(okL); }); } else { build(false); } // 9B-10: リミッターはワークレットを読みこんでから
    function build(canLim) {
    var A = UG.audio, saved = { ctx: A.ctx, master: A.master, bus: A.bus, revSend: A.revSend, dlySend: A.dlySend }, savedPl = pl, savedLog = plLog, ok = true, err = "", limUsed = false;
    var chunk = false, pc = p, rcur = 0, rpl = null, rA = null, rlog = null, rvo = []; // 9B-14: 区切って予約・予約した声
    plLog = [];
    try {
      // オフライン側にも、いまと同じ「全体の音量 → 共有の残響（リバーブ・ディレイ）」を作る（送りの量はいまの値を写す）
      var mst = off.createGain(); mst.gain.value = A.master ? A.master.gain.value : 0.25;
      // 9B-10: 全体の音量（＋残響）→ マスター EQ → 入力ゲイン → リミッター → 出口（リミッターがいちばん最後）。効いていなければ v2.59 と同じ（mst → 出口）
      var mlast = mst, mf = mlive.fx, mb = ["low", "mid", "high"], mk;
      if (mlive.eq) { for (mk = 0; mk < 3; mk++) { var mbd = M.FX_BANDS[mb[mk]], mn = off.createBiquadFilter(); mn.type = mbd.type; mn.frequency.value = mbd.freq; mn.Q.value = mbd.q; mn.gain.value = mf.eq[mb[mk]]; mlast.connect(mn); mlast = mn; } }
      var limTp = mf.lim.mode === "tp"; // 9B-16
      if (mlive.lim && canLim) { var mln = limNode(off, limTp ? "tp" : "lim", false); if (mln) { var mig = off.createGain(); mig.gain.value = dbGain(mf.lim.gain); mlast.connect(mig); mig.connect(mln); limParams(mln, mf); mlast = mln; limUsed = true; } }
      mlast.connect(off.destination);
      var fx = UG.buildFx ? UG.buildFx(off, mst) : { bus: mst, revSend: null, dlySend: null };
      if (fx.revSend && A.revSend) { fx.revSend.gain.value = A.revSend.gain.value; }
      if (fx.dlySend && A.dlySend) { fx.dlySend.gain.value = A.dlySend.gain.value; }
      if (ro && ro.noSend) { if (fx.revSend) { fx.revSend.gain.value = 0; } if (fx.dlySend) { fx.dlySend.gain.value = 0; } } // §345 A12: ステムは共有の残響なし
      A.ctx = off; A.master = mst; A.bus = fx.bus; A.revSend = fx.revSend || null; A.dlySend = fx.dlySend || null;
      pl = { ac: off, mix: {}, segs: [{ t0: 0, tick0: 0, fresh: true }], cur: 0, loop: false, la: 0, segEnd: plan.endTick, endAt: 0, pass: 0, timer: null, raf: null, clip: null, wav: true, opts: { a: 0, b: plan.endTick, loop: false, clip: null } };
      var E = SE(); if (E && E.setTempo) { try { E.setTempo(M.bpmAt(p, 0)); } catch (e1) {} }
      for (var ti = 0; ti < p.tracks.length; ti++) { mixFor(p.tracks[ti]); }
      // 9B-14: 区切って予約する（suspend で止まるたびに数秒先まで）。全部の音を先に作ると、まだ鳴らない音のノードも毎回処理されて、長い曲ほど（長さの 2 乗に近く）遅くなるため。
      // 予約は書き出しを始めたときの曲の写し（あとから直しても混ざらない）。SynthTrack（finish が要る）・suspend の無いブラウザは、これまでどおり全部を先に予約する
      var hasSyn = false;
      for (id in pl.mix) { if (pl.mix.hasOwnProperty(id) && pl.mix[id] && pl.mix[id].syn) { hasSyn = true; } }
      chunk = !hasSyn && typeof off.suspend === "function" && !wav.noSuspend;
      if (chunk) {
        pc = JSON.parse(JSON.stringify(p));
        for (ti = 0; ti < pc.tracks.length; ti++) { var ct = pc.tracks[ti], cm = pl.mix[ct.id]; if (cm && M.audible(pc, ct)) { trackIn(ct, cm, "main"); } } // 出口（FX・オートメーション）は頭で作る（途中で作らない）
        rcur = Math.min(plan.endTick, segTick(pc, pl.segs[0], WAV_AHEAD));
        schedule(pc, 0, rcur, pl.segs[0]); voCollect(pl);
      } else {
        schedule(p, 0, plan.endTick, pl.segs[0]);
        for (id in pl.mix) { if (pl.mix.hasOwnProperty(id) && pl.mix[id] && pl.mix[id].syn && pl.mix[id].syn.finish) { try { pl.mix[id].syn.finish(); } catch (e3) {} } }
      }
      rpl = pl; rA = { ctx: off, master: mst, bus: fx.bus, revSend: fx.revSend || null, dlySend: fx.dlySend || null };
    } catch (e2) { ok = false; err = String(e2 && e2.message ? e2.message : e2); }
    wav.log = plLog; rlog = plLog;
    pl = savedPl; plLog = savedLog;
    A.ctx = saved.ctx; A.master = saved.master; A.bus = saved.bus; A.revSend = saved.revSend; A.dlySend = saved.dlySend;
    if (!ok) { cb(null, "書き出しに失敗しました（" + err + "）"); return; }
    var done = false;
    function fin(buf) {
      if (done) { return; }
      done = true; if (typeof stopWd === "function") { stopWd(); } off.oncomplete = null; forget(); // 9B-14: 描いた音への参照はこの関数のあいだだけ・9B-16: ドラムのチョークの記録からも外す
      var stt = null;
      if (limUsed) { var sh = limSamples(WAV_RATE, limTp), ci, si; for (ci = 0; ci < buf.numberOfChannels; ci++) { var cd = buf.getChannelData(ci); for (si = 0; si + sh < cd.length; si++) { cd[si] = cd[si + sh]; } for (; si < cd.length; si++) { cd[si] = 0; } } } // 9B-10: 先読みの遅れを戻す（リミッターなしと同じ位置）
      if (plan.tailCapped) { var fl = Math.min(buf.length, WAV_RATE), fc, fi; for (fc = 0; fc < buf.numberOfChannels; fc++) { var fd = buf.getChannelData(fc); for (fi = 0; fi < fl; fi++) { fd[buf.length - fl + fi] *= 1 - fi / fl; } } } // 9B-11: 余韻が 10 秒をこえるときは最後の 1 秒を小さく
      try { stt = bufStats(buf); } catch (e5) { cb(null, "描いた音を調べられませんでした"); return; }
      if (stt.rate !== WAV_RATE || stt.ch < 2) { cb(null, "描いた音の形がちがいます（" + stt.rate + "Hz・" + stt.ch + "ch）", stt, plan); return; }
      if (stt.nan > 0) { cb(null, "描いた音がこわれていました（NaN " + stt.nan + " 個）", stt, plan); return; }
      if (stt.peak < 0.0001) { cb(null, "音がありません（全部ミュート・マスター 0 などではありませんか）", stt, plan); return; }
      stt.fp = pcmPrint(buf); stt.prof = pcmProfile(buf); // §345 A15: 指紋（まったく同じ音か）と 1 秒ごとの音量（端末どうしは少しの幅でくらべる）
      stt.lim = mlive.lim ? (limUsed ? "ok" : "none") : ""; stt.limMode = mlive.lim ? (limTp ? "tp" : "sample") : ""; // 9B-10・9B-16: limMode ＝ 設定のモード（使えたかは lim）
      var blob = null;
      try { blob = UG.encodeWav(buf); } catch (e6) { blob = null; }
      if (!blob) { cb(null, "WAV にできませんでした", stt, plan); return; }
      cb(blob, "", stt, plan);
    }
    off.oncomplete = function (ev) { fin(ev.renderedBuffer); };
    // 9B-14: 鳴り終わった声を出口から外す（つないだままだと、終わった声のノードも毎回処理されて、曲の後ろほど遅くなる）。終わり（はなした音が消える時刻）から WAV_VO_KEEP 秒あとに外す（そのころは音が無い）
    function voCollect(lp) { var id2, k2, vl; for (id2 in lp.mix) { if (lp.mix.hasOwnProperty(id2) && id2 !== "__master" && lp.mix[id2] && lp.mix[id2].voices) { vl = lp.mix[id2].voices; for (k2 = 0; k2 < vl.length; k2++) { if (vl[k2] && !vl[k2].__wq) { vl[k2].__wq = 1; rvo.push(vl[k2]); } } } } }
    function voFree(tSec) { var keep = [], k3, v3; for (k3 = 0; k3 < rvo.length; k3++) { v3 = rvo[k3]; if (isFinite(v3.end) && v3.end + WAV_VO_KEEP < tSec && v3.amp) { try { v3.amp.disconnect(); } catch (e8) {} } else { keep.push(v3); } } rvo = keep; }
    // 9B-14: 止まっているあいだに、tSec ＋ WAV_AHEAD 秒まで（Infinity ＝ 終わりまで）の音を予約する（書き出しの状態に入れかえて・すぐ戻す）
    function more(tSec) {
      if (chunk && tSec !== Infinity) { voFree(tSec); }
      if (!chunk || rcur >= plan.endTick) { return ""; }
      var to = tSec === Infinity ? plan.endTick : Math.min(plan.endTick, segTick(pc, rpl.segs[0], tSec + WAV_AHEAD)), sv = { ctx: A.ctx, master: A.master, bus: A.bus, revSend: A.revSend, dlySend: A.dlySend }, spl = pl, slog = plLog, er = "";
      if (!(to > rcur)) { return ""; }
      pl = rpl; plLog = rlog; A.ctx = rA.ctx; A.master = rA.master; A.bus = rA.bus; A.revSend = rA.revSend; A.dlySend = rA.dlySend;
      try { schedule(pc, rcur, to, rpl.segs[0]); rcur = to; voCollect(rpl); } catch (e7) { er = String(e7 && e7.message ? e7.message : e7); }
      pl = spl; plLog = slog; A.ctx = sv.ctx; A.master = sv.master; A.bus = sv.bus; A.revSend = sv.revSend; A.dlySend = sv.dlySend;
      return er;
    }
    // 9B-14: suspend で約 2 秒ごとに止まって、先の音を予約・進み具合を出す（音は変わらない）・やめるなら続けない。止まったまま（60 秒）のブラウザでは失敗にして、次からは使わない
    var useSus = (chunk || !!(ro && (ro.onProgress || ro.job))) && typeof off.suspend === "function" && !wav.noSuspend, lastAct = Date.now(), wd = null, sk, susOk = true;
    function stopWd() { if (wd) { clearInterval(wd); wd = null; } }
    // 9B-15: やめたあと: 出口を外して（音は描かない）最後まで流して終わらせる。止めたままだと、このコンテキストと描く途中の音（長い曲で 100MB 以上）がずっと残る
    var drained = false;
    function drainGo() { drained = true; forget(); try { mlast.disconnect(); } catch (ed) {} try { off.resume(); } catch (er1) {} }
    function forget() { try { if (UG.forgetCtx) { UG.forgetCtx(off); } } catch (ef) {} } // 9B-16: UGMelody のシンバル・キックの記録が、このコンテキストを持ちつづけないように
    if (useSus) {
      for (sk = 1; sk * WAV_STEP_FR < plan.frames; sk++) {
        (function (kk) {
          var fr = kk * WAV_STEP_FR;
          var sp; try { sp = off.suspend(fr / WAV_RATE); } catch (es) { susOk = false; return; }
          if (!sp || !sp.then) { susOk = false; return; }
          sp.then(function () {
            lastAct = Date.now();
            if (done) { if (drained) { try { off.resume(); } catch (er0) {} } return; }
            if (ro && ro.job && ro.job.canceled) { done = true; stopWd(); off.oncomplete = null; drainGo(); cb(null, "やめました（描いた音は捨てました）"); return; }
            var erm = more(fr / WAV_RATE);
            if (erm) { done = true; stopWd(); off.oncomplete = null; cb(null, "書き出しに失敗しました（" + erm + "）"); return; }
            if (ro && ro.onProgress) { try { ro.onProgress(Math.floor(fr * 100 / plan.frames)); } catch (ep) {} }
            try { off.resume(); } catch (er) {}
          }, function () {});
        })(sk);
      }
      wd = setInterval(function () { if (done) { stopWd(); return; } if (Date.now() - lastAct > WAV_SUS_WAIT) { stopWd(); done = true; wav.noSuspend = true; off.oncomplete = null; drained = true; forget(); try { mlast.disconnect(); } catch (ew) {} cb(null, "書き出しが途中で止まりました（このブラウザでは途中の進み具合を使えないようです）。もう一度「WAV を書き出す」を押すと、進み具合なしで書き出します（曲は変えていません）"); } }, 1000);
    }
    if (chunk && !susOk) { var erA = more(Infinity); if (erA) { done = true; stopWd(); off.oncomplete = null; cb(null, "書き出しに失敗しました（" + erA + "）"); return; } } // suspend を予約できなかった: 残りを全部いま予約（これまでと同じ）
    try {
      var pr = off.startRendering();
      if (pr && pr.then) { pr.then(fin, function () { if (!done) { done = true; cb(null, "描けませんでした"); } }); }
    } catch (e4) { if (!done) { done = true; cb(null, "描けませんでした"); } }
    }
  }
  // §345 A15: 描いた音の指紋（16bit にしたときの値を、64 サンプルおきに FNV-1a）・同じ曲・同じ設定で同じ値なら、同じ WAV
  function pcmPrint(buf) {
    var h = 0x811c9dc5, c, i, chs = Math.min(2, buf.numberOfChannels);
    for (c = 0; c < chs; c++) { var d = buf.getChannelData(c); for (i = 0; i < d.length; i += 64) { var v = Math.max(-32768, Math.min(32767, Math.round(d[i] * 32767))) & 0xffff; h ^= v & 0xff; h = (h * 16777619) >>> 0; h ^= v >>> 8; h = (h * 16777619) >>> 0; } }
    return ("0000000" + h.toString(16)).slice(-8);
  }
  // §345 A15: 1 秒ごとの音量（16bit の値の RMS・小数 1 けた）。1 LSB のちがいでは変わらないので、端末・ページをまたいでくらべられる（幅 ±1 で）
  function pcmProfile(buf) {
    var sr = buf.sampleRate, n = buf.length, out = [], b, c, i, chs = Math.min(2, buf.numberOfChannels);
    for (b = 0; b * sr < n; b++) { var q = 0, k = 0; for (c = 0; c < chs; c++) { var d = buf.getChannelData(c); for (i = b * sr; i < Math.min(n, (b + 1) * sr); i += 4) { var v = d[i] * 32767; q += v * v; k++; } } out.push(Math.round(Math.sqrt(q / Math.max(1, k)) * 10) / 10); }
    return out;
  }
  // §345 A15: 書き出しの記録（?debug=1 で見る・あとで「なぜ音がちがうか」を調べるため）
  function wavDiag(p, stt, ms, samplesOk) {
    var UG = window.UGMelody, A = UG && UG.audio, X0 = XM();
    return { fp: stt ? stt.fp : "", prof: stt ? stt.prof : [], frames: stt ? stt.frames : 0, ms: ms, live: A && A.ctx ? A.ctx.sampleRate : 0, dec: UG && UG.decodeRate ? UG.decodeRate() : 0, drum: samplesOk, missing: X0 && X0.missing ? X0.missing(p) : 0, chunk: wavCanChunk(), at: new Date().toISOString() };
  }
  function isDbg() { try { return /[?&]debug=1/.test(window.location.search); } catch (e) { return false; } }
  // 書き出す（再生を止めてから・一度に 1 つ・データは変えない）
  function wavExport(onDone) {
    if (wav.busy) { return false; }
    stopPlay(false);
    wavFree();
    var p = project(), plan = wavPlan(p), UG = window.UGMelody, i, hasDrum = false;
    wav.plan = plan; wav.stats = null; wav.note = ""; wav.msg = "";
    if (!plan.ok) { wav.state = "fail"; wav.msg = plan.why; dgLog("wav", { s: "fail", why: plan.why }); if (onDone) { onDone(); } return false; }
    dgLog("wav", { s: "start" }); // 9B-21
    for (i = 0; i < p.tracks.length; i++) { if (DM().isDrum(p.tracks[i])) { hasDrum = true; } }
    wav.busy = true; wav.state = "busy"; wav.sig = "";
    var job = wav.job = { canceled: false, t0: Date.now() }, started = false, tm = null, lim0 = DM().masterLive(p).lim ? DM().masterFx(p).lim.ceiling : null; // 9B-13: 書き出したときの Ceiling
    function go() {
      if (started) { return; }
      started = true;
      if (tm) { clearTimeout(tm); }
      var samplesOk = !hasDrum || !UG.sampleReady || !!UG.sampleReady(UG.DRUM);
      wav.pct = 0;
      renderSong(function (blob, why, stt, pln) {
        wav.busy = false; wav.job = null; wav.stats = stt || null; wav.ms = Date.now() - job.t0;
        if (job.canceled) { wav.state = "canceled"; wav.msg = "やめました（描いた音は捨てました）"; }
        else if (!blob) { wav.state = "fail"; wav.msg = why || "書き出せませんでした"; }
        else {
          wav.diag = wavDiag(p, stt, Date.now() - job.t0, samplesOk); wav.blob = blob; wav.name = outName(p.name, "", "wav"); wav.sig = luSig(p); wav.limCeil = lim0; // 9B-13: 書き出した曲のしるし（音の準備のあとで取る）
          try { wav.url = URL.createObjectURL(blob); } catch (e) { wav.url = ""; }
          wav.state = "done";
          wav.note = (samplesOk ? "" : "生ドラムのサンプルを読みこめなかったので、作るドラムの音で描きました。") + (XM() && XM().missing(p) ? "読みこめなかった楽器の録音（" + XM().missing(p) + " 音色）は、代わりのシンセの音で描きました。" : "") + // §343
             (stt && stt.clip ? "音が大きすぎて割れているところがあります（" + stt.clip + " サンプル）。マスター音量を下げてください。" + (fxBoosted(p) ? "🎛️ FX で上げた値（EQ の＋・Makeup）も下げてください。" : "") : "") + (stt && stt.lim === "none" ? "このブラウザではマスターのリミッターを使えなかったので、リミッターなしで書き出しました。" : "");
        }
        dgLog("wav", { s: wav.state, ms: wav.ms, why: wav.state === "done" ? "" : wav.msg, bytes: blob ? blob.size : 0, fp: stt ? stt.fp : "", live: wav.diag ? wav.diag.live : 0 }); // 9B-21・§345 A15
        if (onDone) { onDone(); }
      }, { job: job, onProgress: function (pc) { wav.pct = pc; var r0 = st.root, el = r0 && r0.querySelector ? r0.querySelector(".dp-wpct, .dlu-wpct") : null; if (el) { el.textContent = pc + "%"; } } }); // 9B-14: 進み具合
    }
    function begin() {
      if (job.canceled) { wav.busy = false; wav.job = null; wav.state = "canceled"; wav.msg = "やめました"; if (onDone) { onDone(); } return; }
      var smp = XM() ? XM().progsOf(p) : [], progs = (hasDrum && UG.DRUM !== undefined ? [UG.DRUM] : []).concat(smp); // §343: 録音の音色も
      if (progs.length && UG.loadSamples) { tm = setTimeout(go, WAV_SAMPLE_WAIT); try { UG.loadSamples(progs, go); } catch (e) { go(); } }
      else { go(); }
    }
    ensureAssets(p, begin); // 9A-10: 音声の素材を読みこんでから
    return true;
  }
  function wavCancel() { if (wav.job) { wav.job.canceled = true; } }
  // ---------- §345 A12 トラック別 WAV（ステム）: 1 本ずつ・マスター FX なし・センドなし・0 秒から同じ長さ・ステレオ ----------
  var STEM_ZIP_MAX = 256 * 1024 * 1024;
  var stm = { busy: false, job: null, cur: "", state: "idle", msg: "", blob: null, url: "", name: "", stats: null, tid: "", zip: null, zipUrl: "", zipName: "", pct: 0, all: null };
  function stemIOS() { var n = window.navigator || {}, u = String(n.userAgent || ""); return /iPad|iPhone|iPod/.test(u) || (/Macintosh/.test(u) && Number(n.maxTouchPoints) > 1); }
  function stemHas(t) { var i; for (i = 0; i < t.clips.length; i++) { var c = t.clips[i]; if ((c.type === "midi" && c.notes && c.notes.length) || c.type === "audio") { return true; } } return false; }
  // 描くための曲の写し（元の曲は変えない）: tid だけ鳴らす（ほかはミュート・ソロは外す）・センド 0・マスターの FX なし
  function stemProject(p, tid) {
    var q = JSON.parse(JSON.stringify(p)), i;
    for (i = 0; i < q.tracks.length; i++) { var t = q.tracks[i]; t.solo = false; if (tid !== null) { t.mute = t.id !== tid; } t.sends = { rev: 0, dly: 0 }; }
    if (!q.master || typeof q.master !== "object") { q.master = { vol: 80 }; }
    q.master.fx = { items: [] };
    return q;
  }
  var stemSet = { key: "", st: "" };
  function stemStamp(p) { var k = p.id + ":" + DM().hash(JSON.stringify([p.tracks, p.tempo, p.master])); if (stemSet.key !== k) { stemSet.key = k; stemSet.st = stamp(); } return stemSet.st; } // §345 A16: 同じ曲の同じ版のステムは同じ日時（ひと組とわかる）
  function stemName(p, idx, t, fresh) { var z = idx + 1, part = (z < 10 ? "0" : "") + z + "_" + fileBase(t.name).substring(0, 24); return fresh ? outName(p.name, part, "wav", stemStamp(p)) : fileBase(p.name) + "_" + part + "_" + stemStamp(p) + ".wav"; }
  // 書き出す前の見こみ（どれも同じ長さ・同じ大きさ）
  function stemPlan(p) {
    var M = DM(), base = wavPlan(stemProject(p, null)), list = [], n = 0, i;
    for (i = 0; i < p.tracks.length; i++) { var t = p.tracks[i], has = stemHas(t); list.push({ id: t.id, name: t.name, idx: i, has: has, mutedNow: !!t.mute, file: stemName(p, i, t) }); if (has) { n++; } }
    var r = { ok: base.ok, why: base.why, sec: base.sec, frames: base.frames, bytes: base.bytes, bars: base.bars, music: base.music, tail: base.tail, list: list, count: n, total: base.bytes * n, memMB: base.memMB, ios: stemIOS() };
    r.zipOk = r.ok && !r.ios && n > 0 && r.total <= STEM_ZIP_MAX;
    r.zipWhy = r.ios ? "iPhone・iPad では 1 本ずつ保存してください（まとめるとメモリが足りなくなるおそれ）" : (r.total > STEM_ZIP_MAX ? "ぜんぶで " + mb(r.total) + " になるので、まとめて ZIP にはしません（256 MB まで）。1 本ずつ保存してください" : "");
    if (r.ok && !n) { r.ok = false; r.why = "音のあるトラックがありません"; }
    return r;
  }
  function stemFree() { stm.saved = ""; if (stm.url) { try { URL.revokeObjectURL(stm.url); } catch (e) {} } stm.url = ""; stm.blob = null; stm.stats = null; stm.name = ""; stm.tid = ""; }
  function stemZipFree() { if (stm.zipUrl) { try { URL.revokeObjectURL(stm.zipUrl); } catch (e) {} } stm.zipUrl = ""; stm.zip = null; stm.zipName = ""; }
  // 1 本描く → cb({ ok, why, blob, stats, name })。WAV の書き出しと同時には動かさない
  function stemRender(p, tid, job, cb) {
    var UG = window.UGMelody, i, idx = -1, hasDrum = false, t = null;
    for (i = 0; i < p.tracks.length; i++) { if (p.tracks[i].id === tid) { idx = i; t = p.tracks[i]; } }
    if (!t) { cb({ ok: false, why: "トラックが見つかりません" }); return; }
    if (!stemHas(t)) { cb({ ok: false, why: "音のないトラックです" }); return; }
    var q = stemProject(p, tid), started = false, tm = null;
    hasDrum = DM().isDrum(t);
    function go() {
      if (started) { return; } started = true; if (tm) { clearTimeout(tm); }
      if (job.canceled) { cb({ ok: false, why: "やめました" }); return; }
      renderSong(function (blob, why, stt) { cb(blob ? { ok: true, blob: blob, stats: stt, name: stemName(p, idx, t, true) } : { ok: false, why: why || "書き出せませんでした" }); },
        { job: job, proj: q, noSend: true, onProgress: function (pc) { stm.pct = pc; var r0 = st.root, el = r0 && r0.querySelector ? r0.querySelector(".dp-spct") : null; if (el) { el.textContent = pc + "%"; } } });
    }
    ensureAssets(p, function () {
      var smp = XM() ? XM().progsOf(q) : [], progs = (hasDrum && UG.DRUM !== undefined ? [UG.DRUM] : []).concat(smp);
      if (progs.length && UG.loadSamples) { tm = setTimeout(go, WAV_SAMPLE_WAIT); try { UG.loadSamples(progs, go); } catch (e) { go(); } } else { go(); }
    });
  }
  // 1 本（前のステムは捨てる・メモリに 1 本だけ）
  function stemOne(tid, onDone) {
    if (stm.busy || wav.busy) { return false; }
    var p = project(), pln = stemPlan(p);
    if (!pln.ok) { stm.state = "fail"; stm.msg = pln.why; if (onDone) { onDone(); } return false; }
    stopPlay(false); stemFree(); stemZipFree();
    var job = stm.job = { canceled: false }; stm.busy = true; wav.busy = true; stm.state = "busy"; stm.cur = tid; stm.pct = 0; stm.msg = "";
    stemRender(p, tid, job, function (r) {
      stm.busy = false; wav.busy = false; stm.job = null; stm.cur = "";
      if (job.canceled) { stm.state = "canceled"; stm.msg = "やめました（描いた音は捨てました）"; }
      else if (!r.ok) { stm.state = "fail"; stm.msg = r.why; }
      else { stm.state = "done"; stm.blob = r.blob; stm.stats = r.stats; stm.name = r.name; stm.tid = tid; try { stm.url = URL.createObjectURL(r.blob); } catch (e) { stm.url = ""; } }
      dgLog("stem", { s: stm.state, why: stm.state === "done" ? "" : stm.msg });
      if (onDone) { onDone(); }
    });
    return true;
  }
  // ぜんぶ（PC だけ・256MB まで）→ ZIP（README.txt つき・無圧縮）
  function stemAll(onDone, opt) { // §345 A17: opt ＝ { kind: ZIP の名前の中身, extra: [{ name, data }] }（Cubasis に渡すときは MIDI とシートも）
    if (stm.busy || wav.busy) { return false; }
    var p = project(), pln = stemPlan(p), Z = ZP();
    if (!pln.ok || !pln.zipOk || !Z) { stm.state = "fail"; stm.msg = !pln.ok ? pln.why : (pln.zipWhy || "ZIP の道具を読みこめませんでした"); if (onDone) { onDone(); } return false; }
    stopPlay(false); stemFree(); stemZipFree();
    var ids = pln.list.filter(function (x) { return x.has; }), files = [], k = -1, job = stm.job = { canceled: false }, d = new Date(), info = [];
    stm.busy = true; wav.busy = true; stm.state = "busy"; stm.all = { n: ids.length, i: 0 }; stm.msg = "";
    function end(ok, why) {
      stm.busy = false; wav.busy = false; stm.job = null; stm.cur = ""; stm.all = null;
      if (job.canceled) { stm.state = "canceled"; stm.msg = "やめました（描いた音は捨てました）"; }
      else if (!ok) { stm.state = "fail"; stm.msg = why; }
      else { stm.state = "zip"; }
      dgLog("stem", { s: stm.state, n: files.length - 1, why: ok ? "" : why });
      if (onDone) { onDone(); }
    }
    function next() {
      k++;
      if (job.canceled) { end(false, "やめました"); return; }
      if (k >= ids.length) {
        files.unshift({ name: "README.txt", data: Z.utf8(stemReadme(p, pln, info)) });
        if (opt && opt.extra) { for (var xe = opt.extra.length - 1; xe >= 0; xe--) { files.unshift(opt.extra[xe]); } }
        var z; try { z = Z.zipBuild(files, d); stm.zip = new Blob(z.parts, { type: "application/zip" }); } catch (e) { end(false, "ZIP を作れませんでした（メモリが足りないかもしれません）"); return; }
        stm.zipName = outName(p.name, opt && opt.kind ? opt.kind : "stems", "zip", stemStamp(p)); try { stm.zipUrl = URL.createObjectURL(stm.zip); } catch (e2) { stm.zipUrl = ""; }
        end(true, ""); return;
      }
      stm.cur = ids[k].id; stm.all.i = k + 1; stm.pct = 0;
      if (st.root && st.view === "proj" && onDone) { onDone(); }
      stemRender(p, ids[k].id, job, function (r) {
        if (!r.ok) { end(false, "「" + ids[k].name + "」: " + r.why); return; }
        r.blob.arrayBuffer().then(function (ab) { files.push({ name: r.name, data: new Uint8Array(ab) }); info.push(r.name + "  peak " + r.stats.peak); next(); }, function () { end(false, "WAV を読めませんでした"); });
      });
    }
    next();
    return true;
  }
  // ---------- §345 A17: Cubasis に渡す（MIDI・ステム・受け渡しシート）----------
  // 受け渡しシートの中身（曲は変えない）: テンポ・拍子・キー・長さ・セクション・コード・トラックの対応・読みこみの手順
  function handoffInfo(p) {
    var M = DM(), X0 = XM(), end = M.songEndTick(p), mx0 = M.midiExport(p), sp = stemPlan(p), i;
    var sk = X0 && X0.songKey ? X0.songKey(p) : { key: null, kmode: "maj" }, KN = ["C", "C#", "D", "E♭", "E", "F", "F#", "G", "A♭", "A", "B♭", "B"];
    var o = { name: p.name, bars: M.tickToBar(p, Math.max(0, end - 1)).bar, sec: Math.round(M.tickToSec(p, end) * 100) / 100, ppq: 960, format: 1,
      key: sk.key === null ? "" : KN[sk.key] + (sk.kmode === "min" ? " マイナー" : " メジャー"),
      tempos: M.tempoList(p).map(function (t) { return { bar: M.tickToBar(p, t.tick).bar, beat: M.tickToBar(p, t.tick).beat, bpm: t.bpm }; }),
      meters: (p.tempo.meters || []).map(function (m) { return { bar: M.tickToBar(p, m.tick).bar, sig: m.num + "/" + m.den }; }),
      sections: M.sectionsOf(p).map(function (s) { return { name: s.name, bar: M.tickToBar(p, s.tick).bar, bars: M.tickToBar(p, Math.max(s.tick, s.tick + s.len - 1)).bar - M.tickToBar(p, s.tick).bar + 1, sec: Math.round(M.tickToSec(p, s.tick) * 100) / 100 }; }),
      chords: [], tracks: [], stemSec: sp.sec, stemFrames: sp.frames };
    if (X0 && X0.songChords && X0.chordOf) { var sc = X0.songChords(p), ks = Object.keys(sc).map(Number).sort(function (a, b) { return a - b; }), last = ""; for (i = 0; i < ks.length; i++) { var nm = X0.chordOf(sk.key === null ? 0 : sk.key, sc[ks[i]]).name; if (nm !== last) { o.chords.push({ bar: ks[i] + 1, name: nm }); last = nm; } } }
    var mt = mx0.ok ? mx0.info.tracks : [], st0 = stemStamp(p);
    for (i = 0; i < p.tracks.length; i++) {
      var t = p.tracks[i], m = null, k; for (k = 0; k < mt.length; k++) { if (mt[k].id === t.id) { m = mt[k]; m.n = k + 2; } }
      o.tracks.push({ n: i + 1, name: t.name, midi: m ? { track: m.n, ch: m.ch, drum: !!m.drum, notes: m.notes } : null, stem: stemHas(t) ? stemName(p, i, t) : "", audio: M.isAudio(t), vol: t.vol, pan: t.pan, mute: !!t.mute });
    }
    return o;
  }
  function handoffText(p) {
    var o = handoffInfo(p), L = [], i;
    L.push("ゴリラDAW → Cubasis 3 受け渡しシート");
    L.push("曲: " + o.name);
    L.push("長さ: " + o.bars + " 小節・" + o.sec + " 秒（ステムは余韻を入れて " + Math.round(o.stemSec * 100) / 100 + " 秒・" + o.stemFrames + " フレーム）");
    L.push("テンポ: " + o.tempos.map(function (t) { return (t.bar === 1 && t.beat === 1 ? "" : t.bar + " 小節目から ") + "BPM " + t.bpm; }).join(" → "));
    L.push("拍子: " + o.meters.map(function (m) { return (m.bar === 1 ? "" : m.bar + " 小節目から ") + m.sig; }).join(" → "));
    if (o.key) { L.push("キー: " + o.key); }
    L.push("MIDI: Format " + o.format + "・PPQ " + o.ppq + "（1 本目はテンポ・拍子・セクションのマーカー）");
    L.push(""); L.push("■ セクション（小節・時刻）");
    for (i = 0; i < o.sections.length; i++) { var s = o.sections[i]; L.push("  " + s.bar + " 小節目〜（" + s.bars + " 小節・" + s.sec + " 秒）" + s.name); }
    if (!o.sections.length) { L.push("  （セクションなし）"); }
    L.push(""); L.push("■ コード（変わる小節）");
    if (o.chords.length) { var row = []; for (i = 0; i < o.chords.length; i++) { row.push(o.chords[i].bar + ": " + o.chords[i].name); if (row.length === 8) { L.push("  " + row.join("  ")); row = []; } } if (row.length) { L.push("  " + row.join("  ")); } } else { L.push("  （曲のコードなし）"); }
    L.push(""); L.push("■ トラック（MIDI のトラック・チャンネル ／ ステムのファイル）");
    for (i = 0; i < o.tracks.length; i++) { var t = o.tracks[i]; L.push("  " + t.n + ". " + t.name + (t.audio ? "（録音）" : "") + (t.mute ? "（ミュート中）" : "") + " — " + (t.midi ? "MIDI " + t.midi.track + " 本目・" + (t.midi.drum ? "10ch（GM ドラム）" : t.midi.ch + "ch") + "・" + t.midi.notes + " 音" : "MIDI なし") + " ／ " + (t.stem || "ステムなし（音なし）")); }
    L.push(""); L.push("■ Cubasis 3 での組み立て（目安・Cubasis 3 の実機では確かめていません。メニューの名前は版によってちがうことがあります）");
    L.push("  1. 新しいプロジェクトを作り、テンポ BPM " + (o.tempos[0] ? o.tempos[0].bpm : "") + "・拍子 " + (o.meters[0] ? o.meters[0].sig : "") + " にする");
    L.push("  2. MIDI ファイル（.mid）を読みこむ（ファイル アプリ → Cubasis のメディアのブラウザーからインポート）。トラックに音色（HALion など）を割り当てる。ドラムは 10ch の GM ドラム");
    L.push("  3. ステム（.wav）をすべて 1 小節目の頭（0 の位置）に置く。どれも同じ長さなので、そろう");
    L.push("  4. ステムには、トラックの音量・パン・FX がもう入っている → Cubasis のフェーダーは 0dB・パンは中央のまま（もう一度かけると二重になる）");
    L.push("  5. マスターの FX・リミッター・共有のリバーブとディレイはステムに入っていない → Cubasis でかける");
    L.push("  6. MIDI とステムの両方を使うときは、同じパートの音が重ならないように、どちらかをミュートする");
    return L.join("\r\n") + "\r\n";
  }
  var ho = { saved: {}, msg: "" };
  function hoKey(p) { return p.id + ":" + stemStamp(p); }
  function hoMark(p, what, r) { var k = hoKey(p); if (!ho.saved[k]) { ho.saved = {}; ho.saved[k] = {}; } ho.saved[k][what] = r; }
  function hoGot(p, what) { var s = ho.saved[hoKey(p)]; return s ? s[what] : ""; }
  function hoMarkHtml(r) { return r === "shared" || r === "download" ? ' <span class="dp-hok">&#x2705; 保存</span>' : (r === "canceled" ? ' <span class="small">（やめた）</span>' : (r === "fail" ? ' <span class="small uke-daw-warn">できなかった</span>' : "")); }
  function handoffHtml(p) {
    var o = handoffInfo(p), sp = stemPlan(p), mx1 = DM().midiExport(p), h = '<div class="dp-wav dp-handoff"><div class="dp-h">&#x1F39B;&#xFE0F; Cubasis に渡す</div>', i;
    h += '<div class="small">MIDI（Format 1・PPQ 960）・トラック別 WAV（0 秒から同じ長さ）・受け渡しシート（テンポ・拍子・キー・セクション・コード・トラックの対応・組み立ての手順）。iPhone では 1 つずつ保存します（Cubasis 3 の実機では確かめていません）。</div>';
    h += '<div class="small">' + o.bars + ' 小節・BPM ' + (o.tempos[0] ? o.tempos[0].bpm : "") + (o.tempos.length > 1 ? '（変化 ' + (o.tempos.length - 1) + '）' : '') + '・' + (o.meters[0] ? o.meters[0].sig : "") + (o.key ? '・' + escHtml(o.key) : '') + '・セクション ' + o.sections.length + '・コード ' + o.chords.length + '</div>';
    h += '<ol class="dp-hlist">';
    h += '<li><button class="modal-btn" data-pj="hoSheet">&#x1F4C4; 受け渡しシート（.txt）を保存</button>' + hoMarkHtml(hoGot(p, "sheet")) + '</li>';
    h += '<li>' + (mx1.ok ? '<button class="modal-btn" data-pj="hoMidi">&#x1F3B9; MIDI（約 ' + Math.ceil(mx1.bytes.length / 1024) + ' KB）を保存</button>' + hoMarkHtml(hoGot(p, "midi")) : '<span class="small">MIDI: ' + escHtml(mx1.why) + '</span>') + '</li>';
    var ns = 0, nd = 0; for (i = 0; i < sp.list.length; i++) { if (sp.list[i].has) { ns++; if (hoGot(p, "stem:" + sp.list[i].id) === "shared" || hoGot(p, "stem:" + sp.list[i].id) === "download") { nd++; } } }
    h += '<li>ステム ' + ns + ' 本（1 本 約 ' + mb(sp.bytes) + '）: 下の「🎚️ トラック別 WAV」で 1 本ずつ書き出して保存' + (ns ? '・保存 ' + nd + ' / ' + ns : '') + (sp.ok ? '' : '<br><span class="small uke-daw-warn">' + escHtml(sp.why) + '</span>') + '</li>';
    h += '</ol>';
    if (sp.ok && sp.zipOk && mx1.ok && sp.total <= STEM_ZIP_MAX) { h += '<button class="modal-btn" data-pj="hoAll"' + (stm.busy ? ' disabled' : '') + '>&#x1F4E6; ぜんぶを ZIP で（PC 向け・MIDI ＋ シート ＋ ステム ' + ns + ' 本・約 ' + mb(sp.total) + '）</button>'; }
    else if (sp.ios) { h += '<p class="small">iPhone・iPad では、まとめた ZIP は作りません（メモリを守るため）。上の順に 1 つずつ保存してください。</p>'; }
    if (ho.msg) { h += '<div class="small">' + ho.msg + '</div>'; }
    return h + '</div>';
  }
  function stemReadme(p, pln, info) {
    return "Gorilla DAW stems / トラック別 WAV\r\n曲: " + p.name + "\r\n" +
      "44.1kHz 16bit stereo / " + (Math.round(pln.sec * 100) / 100) + " sec (" + pln.frames + " frames) — すべて同じ長さ\r\n" +
      "0 秒 = 1 小節目の頭。Cubasis では、すべてのファイルを 0 の位置に置くとそろいます。テンポ BPM " + DM().bpmAt(p, 0) + "\r\n" +
      "入っているもの: トラックの音色・音量・パン・トラックの FX・オートメーション\r\n" +
      "入っていないもの: マスターの FX（EQ・リミッター）、共有のリバーブ・ディレイ\r\n" +
      "注意: 音量とパンはすでに入っています。Cubasis のフェーダーは 0dB・パンは中央のままにしてください（もう一度かけると二重になります）。\r\n\r\n" + info.join("\r\n") + "\r\n";
  }
  function stemCancel() { if (stm.job) { stm.job.canceled = true; } }
  function stemHtml(p) {
    var pln = stemPlan(p), h = '<div class="dp-wav dp-stem"><div class="dp-h">&#x1F39A;&#xFE0F; トラック別 WAV（ステム）</div>', i;
    h += '<div class="small">1 本ずつ・どれも 0 秒から同じ長さ（約 ' + (Math.round(pln.sec * 10) / 10) + ' 秒・1 本 約 ' + mb(pln.bytes) + '・音のあるトラック ' + pln.count + ' 本で ぜんぶ 約 ' + mb(pln.total) + '）。44.1kHz・16bit・ステレオ。<br>トラックの音量・パン・FX は入っています（Cubasis のフェーダーは 0dB・パンは中央のまま）。マスターの FX と共有のリバーブ・ディレイは入りません。</div>';
    if (!pln.ok) { return h + '<div class="daw-msg">&#x26A0;&#xFE0F; ' + escHtml(pln.why) + '</div></div>'; }
    if (stm.state === "busy") { h += '<div class="daw-info">&#x23F3; 書き出し中' + (stm.all ? '（' + stm.all.i + ' / ' + stm.all.n + '）' : '') + '… <b class="dp-spct">' + (stm.pct ? stm.pct + '%' : '') + '</b></div><button class="modal-btn" data-pj="stemCancel">やめる</button>'; }
    else if (stm.state === "fail" || stm.state === "canceled") { h += '<div class="daw-msg">&#x26A0;&#xFE0F; ' + escHtml(stm.msg) + '</div>'; }
    if (stm.state === "done" && stm.blob) { var w = stm.stats; h += '<div class="daw-info">&#x2705; ' + escHtml(stm.name) + '<br><span class="small">' + (Math.round(w.sec * 100) / 100) + ' 秒・' + mb(stm.blob.size) + '・ピーク L ' + w.L.peak + ' ／ R ' + w.R.peak + '</span></div><div class="dp-btns"><button class="modal-btn" data-pj="stemSave">&#x1F4BE; ファイルに保存（共有）</button>' + (stm.url ? '<a class="modal-btn dp-dl" href="' + stm.url + '" download="' + escHtml(stm.name) + '">&#x2B07;&#xFE0F; ダウンロード</a>' : '') + '</div>' + fileSaveNote(stm.saved) + '<p class="small">次のトラックを書き出すと、このステムは消えます（メモリに 1 本だけ）。先に保存してください。</p>'; }
    if (stm.state === "zip" && stm.zip) { h += '<div class="daw-info">&#x2705; ' + escHtml(stm.zipName) + '（' + mb(stm.zip.size) + '）</div><div class="dp-btns"><button class="modal-btn" data-pj="stemZipSave">&#x1F4BE; ファイルに保存（共有）</button>' + (stm.zipUrl ? '<a class="modal-btn dp-dl" href="' + stm.zipUrl + '" download="' + escHtml(stm.zipName) + '">&#x2B07;&#xFE0F; ダウンロード</a>' : '') + '</div>' + fileSaveNote(stm.saved) + ''; }
    h += '<div class="dp-stems">';
    for (i = 0; i < pln.list.length; i++) {
      var x = pln.list[i];
      h += '<div class="dp-srow"><span class="dp-sname">' + (i + 1) + '. ' + escHtml(x.name) + (x.mutedNow ? '<span class="small">（いまミュート）</span>' : '') + '</span>' + (x.has ? '<button class="modal-btn dp-sgo" data-pj="stem:' + escHtml(x.id) + '"' + (stm.busy ? ' disabled' : '') + '>&#x1F3B5; 書き出す</button>' : '<span class="small">音なし</span>') + '</div>';
    }
    h += '</div>';
    if (pln.ios && pln.bytes > 100 * 1024 * 1024) { h += '<p class="small uke-daw-warn">&#x26A0;&#xFE0F; 1 本が ' + mb(pln.bytes) + ' あります。iPhone ではメモリが足りずに失敗することがあります（ほかのタブ・アプリを閉じてから、1 本ずつ）。曲はそのままです。</p>'; }
    if (pln.zipOk) { h += '<button class="modal-btn" data-pj="stemAll"' + (stm.busy ? ' disabled' : '') + '>&#x1F4E6; ぜんぶを ZIP で（PC 向け・約 ' + mb(pln.total) + '）</button>'; }
    else if (pln.zipWhy) { h += '<p class="small">' + escHtml(pln.zipWhy) + '</p>'; }
    return h + '</div>';
  }
  // 9B-21: テスト用の記録（画面に出さない・80 件まで）。QA でどの段階が失敗したかを分ける
  var dg = [];
  function dgLog(k, o) { var e = { t: Math.round(perfNow()), k: k }, x; if (o) { for (x in o) { if (o.hasOwnProperty(x)) { e[x] = o[x]; } } } dg.push(e); if (dg.length > 80) { dg.shift(); } }

  // ---------- §341 9A-11: プロジェクトパック（ZIP: manifest.json・project.json・audio/ の WAV）----------
  var PACK_FORMAT = "ultimate-gorilla-daw-pack", PACK_VERSION = 2, PACK_MAX_ZIP = 256 * 1024 * 1024, PACK_MAX_JSON = 2 * 1024 * 1024; // 9B-20: 版 2 ＝ 長い・圧縮の素材（それが無い ZIP は版 1 のまま書く）・256MiB まで
  var pk = { busy: false, state: "idle", msg: "", blob: null, url: "", name: "", size: 0, assets: 0, restored: null, istate: "idle", imsg: "" };
  function ZP() { return window.UGDawZip || null; }
  function packFile(id, kind) { return "audio/" + String(id).replace(":", "-") + "." + (kind && kind !== "wav" ? ({ mp3: "mp3", m4a: "m4a", ogg: "ogg", flac: "flac" }[kind] || "bin") : "wav"); } // 9B-20: 元のファイルのまま
  function packNew(a) { return !!(a && (a.long || (a.kind && a.kind !== "wav"))); } // 9B-20: 版 2 が要る素材
  function packFree() { pk.saved = ""; if (pk.url) { try { URL.revokeObjectURL(pk.url); } catch (e) {} } pk.url = ""; pk.blob = null; }
  // まとめる素材（クリップが使う素材は必須・曲の一覧にある素材は端末にあれば）と大きさの見こみ
  function packPlan(p) {
    var M = DM(), used = usedAssets(p), l = p.assets || [], i, bytes = 0, list = [], seen = {};
    for (i = 0; i < used.length; i++) { var a = M.findAsset(p, used[i]); list.push({ id: used[i], ref: a, used: true }); seen[used[i]] = true; if (a) { bytes += a.bytes; } }
    for (i = 0; i < l.length; i++) { if (!seen[l[i].id]) { list.push({ id: l[i].id, ref: l[i], used: false }); bytes += l[i].bytes; } }
    return { list: list, used: used.length, bytes: bytes + 8000 };
  }
  // 書き出す → cb({ ok, why, blob, name, size, assets })。曲も保存も変えない
  function packExport(cb) {
    var Z = ZP(), M = DM(), p = project();
    function fail(why) { pk.busy = false; cb({ ok: false, why: why }); }
    if (pk.busy) { cb({ ok: false, why: "いま ZIP を作っています" }); return; }
    if (!Z) { cb({ ok: false, why: "ZIP の道具（arcade-daw-zip.js）を読みこめませんでした" }); return; }
    pk.busy = true;
    var plan = packPlan(p), out = [], i = -1, d = new Date();
    pk.cancel = false; pk.prog = "";
    function next() {
      i++;
      if (pk.cancel) { fail("やめました（ZIP は作っていません。曲と録音はそのままです）"); return; } // §345 A16
      pk.prog = plan.list.length ? Math.min(i + 1, plan.list.length) + " / " + plan.list.length : ""; var r0 = st.root, pe = r0 && r0.querySelector ? r0.querySelector(".dp-ppct") : null; if (pe) { pe.textContent = pk.prog ? "音声 " + pk.prog : ""; }
      if (i >= plan.list.length) { build(); return; }
      var it = plan.list[i];
      if (!it.ref) { if (it.used) { fail("クリップが使う素材の情報が曲にありません（" + it.id + "）"); return; } next(); return; }
      idbGet("blobs", it.id, function (b, why) { dataAB(b && b.data, function (dab) { // 9B-20: Blob も
        var data = dab ? new Uint8Array(dab) : null;
        if (!data || data.length !== it.ref.bytes || M.hashBytes(data) !== it.id) {
          if (it.used) { fail("音声の素材「" + it.ref.name + "」が" + (b === undefined ? "読めません（" + (why || "") + "）" : (data ? "こわれています" : "この端末にありません")) + "。まとめられません（「🔗 素材を選びなおす」でつなぎなおしてください）"); return; }
          next(); return; // 使っていない素材が端末に無いときは入れない
        }
        Z.sha256Async(data, function (sha) {
          if (!/^[0-9a-f]{64}$/.test(sha)) { fail("SHA-256 を計算できませんでした"); return; }
          var r = it.ref;
          var mm = { id: it.id, file: packFile(it.id, r.kind), name: r.name, bytes: data.length, sha256: sha, sr: r.sr, ch: r.ch, bits: r.bits, frames: r.frames, sec: r.sec, used: it.used };
          if (packNew(r)) { mm.kind = r.kind || "wav"; if (r.codec) { mm.codec = r.codec; } mm.long = !!r.long; } // 9B-20
          out.push({ data: data, m: mm, v2: packNew(r) });
          next();
        });
      }); });
    }
    function build() {
      var rec = M.toRecord(p, p.saved || Date.now()), files = [], k, man;
      var v2 = false; for (k = 0; k < out.length; k++) { if (out[k].v2) { v2 = true; } }
      man = { format: PACK_FORMAT, packVersion: v2 ? 2 : 1, app: "究極ゴリラ ゴリラDAW", created: d.toISOString(), name: p.name, projectId: p.id, project: "project.json", assets: [] };
      for (k = 0; k < out.length; k++) { man.assets.push(out[k].m); }
      files.push({ name: "manifest.json", data: Z.utf8(JSON.stringify(man, null, 1)) });
      files.push({ name: "project.json", data: Z.utf8(JSON.stringify(rec, null, 1)) });
      for (k = 0; k < out.length; k++) { files.push({ name: out[k].m.file, data: out[k].data }); }
      var z, blob;
      try { z = Z.zipBuild(files, d); blob = new Blob(z.parts, { type: "application/zip" }); } catch (e) { fail("ZIP を作れませんでした（" + errName(e) + "・メモリが足りないかもしれません）"); return; }
      pk.busy = false;
      cb({ ok: true, blob: blob, name: outName(p.name, "", "zip"), size: z.size, assets: out.length, manifest: man });
    }
    if (!plan.list.length) { build(); return; }
    next();
  }
  // 読みこむ（全部確かめてから IndexedDB へ・新しい曲 ID で一覧に足す。いまの曲は切りかえない）→ cb({ ok, why, id, name, assets, reused })
  function packImport(ab, cb) {
    var Z = ZP(), M = DM();
    function fail(why) { pk.busy = false; cb({ ok: false, why: why }); }
    if (pk.busy) { cb({ ok: false, why: "いま別の ZIP を処理しています" }); return; }
    var gz = assetAddWhy(); if (gz) { cb({ ok: false, why: gz }); return; } // 9A-16
    if (!Z) { cb({ ok: false, why: "ZIP の道具（arcade-daw-zip.js）を読みこめませんでした" }); return; }
    if (!ab || typeof ab.byteLength !== "number") { cb({ ok: false, why: "ファイルを読めませんでした" }); return; }
    if (ab.byteLength > PACK_MAX_ZIP) { cb({ ok: false, why: "ZIP が大きすぎます（" + mb(ab.byteLength) + "・" + (PACK_MAX_ZIP / 1048576) + "MB まで）" }); return; }
    var zr = Z.zipRead(ab, { maxEntries: 64, maxTotal: PACK_MAX_ZIP, maxRatio: 200 });
    if (!zr.ok) { cb({ ok: false, why: zr.why }); return; }
    function json(name) {
      var f = zr.files[name];
      if (!f) { return { ok: false, why: "ZIP に " + name + " がありません（ゴリラDAW のプロジェクトの ZIP ではないようです）" }; }
      if (f.usize > PACK_MAX_JSON) { return { ok: false, why: name + " が大きすぎます" }; }
      var d = Z.zipData(ab, f);
      if (!d.ok) { return d; }
      var o; try { o = JSON.parse(Z.fromUtf8(d.data).replace(/^﻿/, "")); } catch (e) { return { ok: false, why: name + " を読めませんでした（こわれています）" }; }
      return { ok: true, obj: o, text: Z.fromUtf8(d.data) };
    }
    var mj = json("manifest.json");
    if (!mj.ok) { cb({ ok: false, why: mj.why }); return; }
    var man = mj.obj;
    if (!man || typeof man !== "object" || man.format !== PACK_FORMAT) { cb({ ok: false, why: "ゴリラDAW のプロジェクトの ZIP ではありません（manifest の形がちがいます）" }); return; }
    var pv = Number(man.packVersion);
    if (!(pv >= 1)) { cb({ ok: false, why: "manifest の版がおかしいです" }); return; }
    if (pv > PACK_VERSION) { cb({ ok: false, why: "新しい版のゴリラDAW で作られた ZIP なので、この版では読めません（ページを最新にしてください）" }); return; }
    if (man.project !== "project.json") { cb({ ok: false, why: "manifest の曲のファイル名がおかしいです" }); return; }
    var pj = json("project.json");
    if (!pj.ok) { cb({ ok: false, why: pj.why }); return; }
    var pr = M.parseRecordText(pj.text);
    if (!pr.ok) { cb({ ok: false, why: "曲のデータ（project.json）を読めませんでした: " + pr.why }); return; }
    var p = pr.project, need = usedAssets(p), mas = Object.prototype.toString.call(man.assets) === "[object Array]" ? man.assets : null, byId = {}, i;
    if (!mas) { cb({ ok: false, why: "manifest の素材の一覧がありません" }); return; }
    if (mas.length > M.MAX_ASSETS) { cb({ ok: false, why: "素材が多すぎます（" + mas.length + " 個・" + M.MAX_ASSETS + " 個まで）" }); return; }
    for (i = 0; i < mas.length; i++) {
      var a = mas[i];
      if (!a || typeof a.id !== "string" || !/^a:[0-9a-f]{16}$/.test(a.id) || a.file !== packFile(a.id, a.kind) || !/^[0-9a-f]{64}$/.test(String(a.sha256))) { cb({ ok: false, why: "manifest の素材の情報がおかしいです（" + (i + 1) + " 個目）" }); return; }
      if (byId[a.id]) { cb({ ok: false, why: "manifest に同じ素材が 2 回あります" }); return; }
      if (!zr.files[a.file]) { if (need.indexOf(a.id) >= 0) { cb({ ok: false, why: "素材が足りません（「" + String(a.name || a.id) + "」が ZIP に入っていません）。読みこみをやめました" }); return; } continue; }
      var rr0 = M.findAsset(p, a.id), lim0 = rr0 && packNew(rr0) ? (rr0.kind && rr0.kind !== "wav" ? M.LONG_Z_BYTES : M.LONG_WAV_BYTES) : M.WAV_MAX_BYTES; // 9B-20: 長い・圧縮の素材は大きくてよい
      if (!(a.bytes > 0) || a.bytes > lim0 || zr.files[a.file].usize !== a.bytes) { cb({ ok: false, why: "素材「" + String(a.name || a.id) + "」の大きさがおかしいです" }); return; }
      if (M.findAsset(p, a.id)) { byId[a.id] = a; } // 曲の一覧にある素材だけ使う（ほかは読まない）
    }
    for (i = 0; i < need.length; i++) { if (!byId[need[i]]) { var nr = M.findAsset(p, need[i]); cb({ ok: false, why: "素材が足りません（「" + (nr ? nr.name : need[i]) + "」が ZIP にありません）。読みこみをやめました" }); return; } }
    pk.busy = true;
    var ids = Object.keys(byId), ok = [], k = -1;
    // 1 つずつ: 取り出す → 大きさ・SHA-256・中身の ID・WAV のヘッダー・曲の参照と同じか → デコードできるか
    function check() {
      k++;
      if (k >= ids.length) { store(); return; }
      var a = byId[ids[k]], d = Z.zipData(ab, zr.files[a.file]);
      if (!d.ok) { fail(d.why + "。読みこみをやめました"); return; }
      var u = d.data;
      if (u.length !== a.bytes || M.hashBytes(u) !== a.id) { fail("素材「" + a.name + "」の中身が一致しません（こわれているか、書きかえられています）。読みこみをやめました"); return; }
      Z.sha256Async(u, function (sha) {
        if (sha !== a.sha256) { fail("素材「" + a.name + "」の SHA-256 が一致しません。読みこみをやめました"); return; }
        var buf = u.buffer.byteLength === u.length ? u.buffer : u.slice(0).buffer, ref = M.findAsset(p, a.id);
        if (ref && ref.kind && ref.kind !== "wav") { // 9B-20: 圧縮の素材（中身・大きさは上で確かめた）→ 形式・デコードできるか（写しで）・保存は Blob
          var prz = M.probeAudio(buf);
          if (!prz.ok) { fail("素材「" + a.name + "」: " + prz.why); return; }
          decodeAny(buf.slice(0), ref.sr, ref.ch, function (b2, why2) {
            if (!b2) { fail("素材「" + a.name + "」: このブラウザでは、この形式（" + kindText(ref) + "）の音を読めませんでした（" + why2 + "）"); return; }
            var pk2 = []; try { pk2 = peaksOf(b2); } catch (e2) { pk2 = []; }
            ok.push({ id: a.id, data: typeof Blob === "function" ? new Blob([buf]) : buf, meta: { id: a.id, name: ref.name, bytes: ref.bytes, sr: ref.sr, ch: ref.ch, bits: ref.bits, frames: ref.frames, sec: ref.sec, hash: a.id, peaks: pk2, added: Date.now(), kind: ref.kind, codec: ref.codec, long: !!ref.long } });
            check();
          }, false);
          return;
        }
        var info = M.parseWav(buf);
        if (!info.ok) { fail("素材「" + a.name + "」: " + info.why); return; }
        if (!M.sameAsset(ref, M.assetRef(info, ref.name, a.id))) { fail("素材「" + a.name + "」が曲の記録（長さ・レート・ch）と合いません。読みこみをやめました"); return; }
        decodeWav(buf, info, function (b, why) {
          if (!b) { fail("素材「" + a.name + "」: " + why); return; }
          var peaks = []; try { peaks = peaksOf(b); } catch (e) { peaks = []; }
          ok.push({ id: a.id, data: ref.long && typeof Blob === "function" ? new Blob([buf]) : buf, meta: { id: a.id, name: ref.name, bytes: ref.bytes, sr: ref.sr, ch: ref.ch, bits: ref.bits, frames: ref.frames, sec: ref.sec, hash: a.id, peaks: peaks, added: Date.now(), long: !!ref.long } }); // 9B-20: 長い WAV は Blob
          check();
        }, true);
      });
    }
    // IndexedDB へ（同じ中身があれば使う）→ 読みなおして照合
    var reused = 0, j = -1;
    function store() {
      j++;
      if (j >= ok.length) { register(); return; }
      var it = ok[j];
      idbGet("meta", it.id, function (old, w0) {
        if (old === undefined) { fail((w0 || "音声の保存場所を使えませんでした") + "（曲は登録していません）"); return; }
        function after() { verifyAsset(it.id, it.meta.bytes, function (vw) { if (vw) { fail(vw + "（曲は登録していません）"); return; } store(); }); }
        if (old && old.hash === it.id && old.bytes === it.meta.bytes) { reused++; after(); return; }
        idbPutAsset(it.meta, it.data, function (pw) { if (pw) { fail(pw + "（曲は登録していません・ほかの曲は変えていません）"); return; } after(); });
      });
    }
    // 新しい曲 ID で一覧に足す（いまの曲・ほかの曲は上書きしない）
    function register() {
      var r = readIndex();
      if (!r.ok) { fail((r.why || "保存した曲の一覧が読めません") + "（曲は登録していません）"); return; }
      var names = {}, q;
      for (q = 0; q < r.idx.list.length; q++) { if (r.idx.list[q]) { names[r.idx.list[q].name] = true; } }
      p.id = M.newProjectId();
      while (findEntry(r.idx, p.id) >= 0 || lsRaw(pkey(p.id)) !== null) { p.id = M.newProjectId(); }
      var base = String(p.name || "曲").substring(0, 34), nm = p.name, n2 = 2;
      if (names[nm]) { nm = (base + "（復元）").substring(0, 40); }
      while (names[nm]) { nm = (base + "（復元 " + n2++ + "）").substring(0, 40); }
      p.name = nm;
      var now = Date.now(), text = JSON.stringify(M.toRecord(p, now)), key = pkey(p.id);
      if (!lsPut(key, text)) { try { window.localStorage.removeItem(key); } catch (e) {} fail("曲を保存できませんでした（容量がいっぱいかもしれません）。曲は登録していません"); return; }
      r.idx.list.push({ id: p.id, name: p.name, saved: now, created: p.created || now, notes: M.noteCount(p), tracks: p.tracks.length });
      r.idx.list.sort(function (x, y) { return (y.saved || 0) - (x.saved || 0); });
      if (!lsPut(skey(), JSON.stringify(r.idx))) { try { window.localStorage.removeItem(key); } catch (e2) {} fail("曲の一覧を書けませんでした。曲は登録していません"); return; }
      pk.busy = false;
      cb({ ok: true, id: p.id, name: p.name, assets: ok.length, reused: reused });
    }
    check();
  }
  // 画面から: 書き出す（前の ZIP は捨てる）・読みこむ
  function packStart(onDone) {
    if (pk.busy) { return false; }
    stopPlay(false); packFree();
    pk.state = "busy"; pk.msg = "";
    packExport(function (r) {
      if (r.ok) { pk.state = "done"; pk.blob = r.blob; pk.name = r.name; pk.size = r.size; pk.assets = r.assets; try { pk.url = URL.createObjectURL(r.blob); } catch (e) { pk.url = ""; } }
      else { pk.state = "fail"; pk.msg = r.why; }
      if (onDone) { onDone(r); }
    });
    return true;
  }
  function packLoad(ab, onDone) {
    pk.istate = "busy"; pk.restored = null; pk.imsg = "";
    packImport(ab, function (r) {
      if (r.ok) { pk.istate = "done"; pk.restored = { id: r.id, name: r.name, assets: r.assets, reused: r.reused }; }
      else { pk.istate = "fail"; pk.imsg = r.why; }
      if (onDone) { onDone(r); }
    });
  }
  function packHtml(p) {
    var pl0 = packPlan(p), h = '<div class="dp-wav dp-pack"><div class="dp-h">&#x1F4E6; まとめて保存（ZIP）・復元</div>' +
      '<div class="small dp-kinds"><b>JSON</b> ＝ 曲の編集データだけ（音声は入らない）<br><b>ZIP</b> ＝ 曲と、使っている音声の素材のまるごとの控え（ほかの端末へ移すとき）<br><b>WAV</b> ＝ できあがった音（聞く・送る）</div>' +
      '<div class="small">「' + escHtml(p.name) + '」・音声の素材 ' + pl0.list.length + ' 個・約 ' + mb(pl0.bytes) + '</div>';
    if (pk.state === "busy") { h += '<div class="daw-info">&#x23F3; ZIP を作っています… <b class="dp-ppct">' + (pk.prog ? "音声 " + pk.prog : "") + '</b></div><button class="modal-btn" data-pj="packCancel">やめる</button>'; }
    else if (pk.state === "done" && pk.blob) {
      h += '<div class="daw-info">&#x2705; できました: ' + escHtml(pk.name) + '<br><span class="small">' + mb(pk.size) + '・音声 ' + pk.assets + ' 個</span></div>' +
        '<div class="dp-btns"><button class="modal-btn" data-pj="packSave">&#x1F4BE; ファイルに保存（共有）</button>' + (pk.url ? '<a class="modal-btn dp-dl" href="' + pk.url + '" download="' + escHtml(pk.name) + '">&#x2B07;&#xFE0F; ダウンロード</a>' : '') + '</div>' + fileSaveNote(pk.saved) + '';
    } else if (pk.state === "fail") { h += '<div class="daw-msg">&#x26A0;&#xFE0F; ' + escHtml(pk.msg) + '</div>'; }
    h += '<button class="modal-btn dp-wavgo" data-pj="pack"' + (pk.busy ? ' disabled' : '') + '>&#x1F4E6; プロジェクトをまとめて保存（ZIP）</button>' +
      '<button class="modal-btn dp-wavgo" data-pj="unpack"' + (pk.busy ? ' disabled' : '') + '>&#x1F4C2; プロジェクトZIPを読みこむ</button>' +
      '<input type="file" class="dp-zipfile" accept=".zip,application/zip,application/x-zip-compressed" style="display:none;">';
    if (pk.istate === "busy") { h += '<div class="daw-info">&#x23F3; ZIP を確かめて読みこんでいます…</div>'; }
    else if (pk.istate === "done" && pk.restored) { h += '<div class="daw-info">&#x2705; 「' + escHtml(pk.restored.name) + '」を復元しました（音声の素材 ' + pk.restored.assets + ' 個' + (pk.restored.reused ? '・うち ' + pk.restored.reused + ' 個は端末にあった同じ素材' : '') + '）。いまの曲はそのままです。</div>' + (st.project && st.project.id === pk.restored.id ? '' : '<button class="modal-btn dp-wavgo" data-pj-open="' + escHtml(pk.restored.id) + '">&#x25B6;&#xFE0F; 復元した曲を開く</button>'); }
    else if (pk.istate === "fail") { h += '<div class="daw-msg">&#x26A0;&#xFE0F; 読みこめませんでした: ' + escHtml(pk.imsg) + '（いまの曲と保存した曲はそのままです）</div>'; }
    return h + '<p class="small dsv-note">ZIP は数秒かかることがあります。iPhone では「ファイルに保存（共有）」で共有シートが開き、「"ファイル"に保存」を選べる見こみです（実機では未確認）。開かないときは「ダウンロード」を使ってください。</p></div>';
  }
  function mb(n) { return (Math.round(n / 104857.6) / 10) + " MB"; }
  function wavHtml(p) {
    var pln = wavPlan(p), h = '<div class="dp-wav"><div class="dp-h">&#x1F3B5; WAV を書き出す</div>';
    h += '<div class="small">「' + escHtml(p.name) + '」・1〜' + pln.bars + ' 小節（曲の全体・ループは使わない）・曲 ' + secText(pln.music) + ' ＋ 余韻 ' + (Math.round(pln.tail * 10) / 10) + ' 秒<br>長さ 約 ' + (Math.round(pln.sec * 10) / 10) + ' 秒・大きさ 約 ' + mb(pln.bytes) + '（44.1kHz・16bit・ステレオ）</div>';
    if (pln.ok && pln.long) { h += '<div class="small dp-long">&#x26A0;&#xFE0F; 長い曲なので、書き出しにメモリを多く使います。音声データだけで 約 ' + pln.memMB + ' MB（描く音・WAV・解析）。ブラウザ全体では、さらに多くのメモリを使います（PC の Chrome で 3 分の曲に 約 250MB 増えました）。端末の空きメモリによっては失敗することがあります。ほかのタブ・アプリを閉じてから書き出してください。' + secText(WAV_MAX_MUSIC) + ' までです。</div>'; } // 9B-14
    if (wav.state === "busy") { h += '<div class="daw-info">&#x23F3; 書き出し中… <b class="dp-wpct">' + (wav.pct ? wav.pct + '%' : '') + '</b></div><button class="modal-btn" data-pj="wavCancel">やめる</button>'; }
    else {
      if (wav.state === "done" && wav.blob) {
        var w = wav.stats;
        h += '<div class="daw-info">&#x2705; 書き出しました: ' + escHtml(wav.name) + (isDbg() && wav.diag ? '<br><span class="small dp-diag">診断: 指紋 ' + escHtml(wav.diag.fp) + '・再生 ' + wav.diag.live + 'Hz・録音の展開 ' + wav.diag.dec + 'Hz・ドラムの録音 ' + (wav.diag.drum ? "あり" : "なし") + '・' + wav.diag.ms + 'ms</span>' : '') + '<br><span class="small">' + (Math.round(w.sec * 100) / 100) + ' 秒・' + mb(wav.blob.size) + '・' + w.rate + 'Hz・ピーク L ' + w.L.peak + ' ／ R ' + w.R.peak + '</span>' + (wav.note ? '<br><span class="small">&#x26A0;&#xFE0F; ' + escHtml(wav.note) + '</span>' : '') + '</div>' +
          '<div class="dp-btns"><button class="modal-btn" data-pj="wavSave">&#x1F4BE; ファイルに保存（共有）</button>' + (wav.url ? '<a class="modal-btn dp-dl" href="' + wav.url + '" download="' + escHtml(wav.name) + '">&#x2B07;&#xFE0F; ダウンロード</a>' : '') + '</div>' + fileSaveNote(wav.saved) + '';
      } else if (wav.state === "fail" || wav.state === "canceled") { h += '<div class="daw-msg">&#x26A0;&#xFE0F; ' + escHtml(wav.msg) + '</div>'; }
      h += pln.ok ? '<button class="modal-btn dp-wavgo" data-pj="wav">&#x1F3B5; WAV を書き出す</button>' : '<div class="daw-msg">&#x26A0;&#xFE0F; ' + escHtml(pln.why) + '</div>';
    }
    return h + '<p class="small dsv-note">書き出しは数秒かかります（曲の長さを待ちません。長い曲は、PC の Chrome で 3 分の曲に 1 分半ほど）。iPhone では「ファイルに保存（共有）」で共有シートが開きます（実機では未確認）。開かないときは「ダウンロード」を使ってください。</p></div>';
  }

  function projHtml() {
    var p = project(), L = proj.list(), i, h;
    h = '<div class="daw dp">' +
      '<div class="daw-top"><button class="modal-btn daw-small" data-pj="back">&#x2190; もどる</button><b>&#x1F4C1; 曲の保存と読みこみ</b></div>' +
      '<div class="dp-cur"><div class="dp-name">' + escHtml(p.name) + '</div><span class="dsv-slot">' + statusHtml() + '</span></div>' +
      '<div class="dp-btns">' +
        '<button class="modal-btn" data-pj="save">&#x1F4BE; いま保存</button>' +
        '<button class="modal-btn" data-pj="rename">&#x270F;&#xFE0F; 曲名を変える</button>' +
        '<button class="modal-btn" data-pj="new">&#x1F195; 新しい曲（からっぽ）</button>' +
        '<button class="modal-btn" data-pj="demo">&#x1F3BC; 見本の曲から作る</button>' +
        '<button class="modal-btn" data-pj="export">&#x2B07;&#xFE0F; JSON に書き出す</button>' +
        '<button class="modal-btn" data-pj="import">&#x2B06;&#xFE0F; JSON を読みこむ</button>' +
        '<input type="file" class="dp-file" accept=".json,application/json,text/plain" style="display:none;">' +
      '</div>' +
      (sv.note ? '<div class="daw-info">' + escHtml(sv.note) + '</div>' : '') +
      saveNoteHtml() +
      handoffHtml(p) + wavHtml(p) + stemHtml(p) +
      midiHtml(p) + // 9B-4
      packHtml(p) +
      assetsHtml(p) +
      '<div class="dp-btns dp-lib"><button class="modal-btn" data-pj="lib">&#x1F3B5; 素材ライブラリ（端末の素材・容量・削除）</button></div>' + // 9A-15
      '<p class="small dsv-note">保存は<b>この端末・このブラウザの中だけ</b>です。ほかの端末やブラウザとは同期しません。機種を変える・PC に移す・念のための控えには「&#x1F4E6; プロジェクトをまとめて保存（ZIP）」を使ってください（音声の素材も入ります。JSON には音声が入りません）。</p>' +
      '<p class="small dp-h">保存した曲' + (L.ok ? '（' + L.list.length + '）' : '') + '</p>';
    if (!L.ok) { h += '<div class="daw-msg">&#x26A0;&#xFE0F; ' + escHtml(L.why) + '</div>'; }
    else if (!L.list.length) { h += '<p class="small dsv-note">まだありません。</p>'; }
    for (i = 0; i < L.list.length; i++) {
      var e = L.list[i], cur = e.id === p.id;
      h += '<div class="dp-row' + (cur ? " dp-curr" : "") + '"><span class="dp-rn">' + escHtml(e.name) + '<br><span class="small">' + fmtTime(e.saved) + '・音符 ' + e.notes + ' 個' + (e.ok ? '' : '・<b>読めません（データはそのまま）</b>') + '</span></span>' +
        (cur ? '<span class="small dp-now">いま開いている</span>' : (e.ok ? '<button class="modal-btn" data-pj-open="' + escHtml(e.id) + '">開く</button>' : '')) + '</div>';
    }
    return h + '</div>';
  }
  // §341 9A-10: この曲の音声の素材（JSON に中身が入らないことをはっきり出す）
  function assetsHtml(p) {
    var M = DM(), l = p.assets || [], i, h;
    if (!l.length && !M.audioClipCount(p)) { return ""; }
    h = '<div class="dp-wav dp-aud"><div class="dp-h">&#x1F3B5; 音声の素材（' + l.length + '）</div>' +
      '<div class="daw-msg">&#x26A0;&#xFE0F; <b>JSON に音声（WAV）の中身は入っていません</b>。入るのはクリップの位置と、素材の名前・長さ・ハッシュだけです。ほかの端末で開くときは WAV ファイルも別に送り、「&#x1F517; 選びなおす」で同じ WAV をつなぎなおしてください。</div>';
    for (i = 0; i < l.length; i++) {
      var a = l[i], use = M.assetUse(p, a.id), s = assetState(a.id);
      h += '<div class="dp-row"><span class="dp-rn">' + escHtml(a.name) + '<br><span class="small">' + (Math.round(a.sec * 10) / 10) + ' 秒・' + mb(a.bytes) + '・' + a.sr + 'Hz・' + a.ch + 'ch・クリップ ' + use + ' 個<br>' + (s || use ? assetStateText(a.id) : '（この曲では使っていない）') + '</span></span>' +
        (s && s !== "ready" && s !== "loading" ? '<button class="modal-btn" data-pj-relink="' + escHtml(a.id) + '">&#x1F517; 選びなおす</button>' : '') +
        (use ? '' : '<button class="modal-btn" data-pj-unasset="' + escHtml(a.id) + '">曲から外す</button>') + '</div>';
    }
    return h + '<p class="small dsv-note">クリップを消しても素材は消えません。「曲から外す」も端末の中の WAV は消しません（ほかの曲が使っているかもしれないため）。端末の素材の確認・削除は「&#x1F3B5; 素材ライブラリ」で。</p>' +
      '<input type="file" class="da-wavfile" accept="' + AUD_ACCEPT + '" style="display:none;"></div>';
  }
  function renderProj(root, ctl) {
    audKick(project());
    root.innerHTML = projHtml();
    if (!root.querySelectorAll) { return; }
    var btns = root.querySelectorAll("button"), k, file = root.querySelector(".dp-file");
    function back() { st.view = "arr"; sv.note = ""; st.midErr = ""; render(root, ctl); }
    bindWavFile(root);
    for (k = 0; k < btns.length; k++) {
      btns[k].onclick = function (ev) {
        var el = ev.currentTarget, v = el.getAttribute("data-pj"), id = el.getAttribute("data-pj-open"), aid;
        if ((aid = el.getAttribute("data-pj-relink"))) { sv.note = ""; pickWav(root, { relink: aid }); return; } // 9A-10
        if ((aid = el.getAttribute("data-pj-unasset"))) { proj.unasset(aid); renderProj(root, ctl); return; }
        if (id) { var r = proj.open(id); if (r.ok) { sv.note = ""; render(root, ctl); } else { renderProj(root, ctl); } return; }
        if (v === "back") { back(); return; }
        // §342 9B-4: MIDI
        if (v === "midiOut") { midiExportNow(); renderProj(root, ctl); return; }
        if (v === "midiSave" && mx.blob) { mx.saved = ""; daSave(mx.blob, mx.name, function (r) { mx.saved = r; if (st.view === "proj" && st.root === root) { renderProj(root, ctl); } }); return; } // §345 A16
        if (v === "midiIn") { var mf = root.querySelector(".dp-midifile"); if (mf) { mf.value = ""; mf.click(); } return; }
        if (v === "lib") { libOpen(); renderLib(root, ctl); return; } // 9A-15
        if (v === "save") { sv.note = saveNow() ? "保存しました" : ""; renderProj(root, ctl); return; }
        if (v === "rename") {
          var a = window.prompt ? window.prompt("曲名（40 文字まで）", project().name) : null;
          if (a !== null && a !== undefined) { proj.rename(a); }
          renderProj(root, ctl); return;
        }
        if (v === "new" || v === "demo") { proj.create(v === "demo" ? "demo" : "empty"); sv.note = ""; render(root, ctl); return; }
        if (v === "export") { proj.exportJson(); renderProj(root, ctl); return; }
        if (v === "import" && file) { file.value = ""; file.click(); return; }
        if (v === "wav") { wavExport(function () { if (st.view === "proj" && st.root === root) { renderProj(root, ctl); } }); renderProj(root, ctl); return; }
        if (v === "wavCancel") { wavCancel(); renderProj(root, ctl); return; }
        if (v === "packCancel") { pk.cancel = true; renderProj(root, ctl); return; } // §345 A16
        if (v.indexOf("stem:") === 0) { stemOne(v.substring(5), function () { if (st.view === "proj" && st.root === root) { renderProj(root, ctl); } }); renderProj(root, ctl); return; } // §345 A12
        if (v === "stemAll") { stemAll(function () { if (st.view === "proj" && st.root === root) { renderProj(root, ctl); } }); renderProj(root, ctl); return; }
        if (v === "stemCancel") { stemCancel(); renderProj(root, ctl); return; }
        if (v === "stemSave" && stm.blob) { stm.saved = ""; var stid = stm.tid; daSave(stm.blob, stm.name, function (r) { stm.saved = r; hoMark(project(), "stem:" + stid, r); if (st.view === "proj" && st.root === root) { renderProj(root, ctl); } }); return; }
        if (v === "hoSheet") { var hp = project(); daSave(new Blob([handoffText(hp)], { type: "text/plain" }), outName(hp.name, "cubasis", "txt", stemStamp(hp)), function (r) { hoMark(hp, "sheet", r); if (st.view === "proj" && st.root === root) { renderProj(root, ctl); } }); return; } // §345 A17
        if (v === "hoMidi") { var hp2 = project(), mr = DM().midiExport(hp2); if (!mr.ok) { ho.msg = escHtml(mr.why); renderProj(root, ctl); return; } daSave(new Blob([new Uint8Array(mr.bytes)], { type: "audio/midi" }), outName(hp2.name, "", "mid", stemStamp(hp2)), function (r) { hoMark(hp2, "midi", r); if (st.view === "proj" && st.root === root) { renderProj(root, ctl); } }); return; }
        if (v === "hoAll") { var hp3 = project(), mr3 = DM().midiExport(hp3), Z3 = ZP(); if (!mr3.ok || !Z3) { ho.msg = "&#x26A0;&#xFE0F; " + escHtml(mr3.why || "ZIP の道具がありません"); renderProj(root, ctl); return; } var st3 = stemStamp(hp3); stemAll(function () { if (st.view === "proj" && st.root === root) { renderProj(root, ctl); } }, { kind: "cubasis", extra: [{ name: fileBase(hp3.name) + "_cubasis_" + st3 + ".txt", data: Z3.utf8(handoffText(hp3)) }, { name: fileBase(hp3.name) + "_" + st3 + ".mid", data: new Uint8Array(mr3.bytes) }] }); renderProj(root, ctl); return; }
        if (v === "stemZipSave" && stm.zip) { stm.saved = ""; daSave(stm.zip, stm.zipName, function (r) { stm.saved = r; if (st.view === "proj" && st.root === root) { renderProj(root, ctl); } }); return; }
        // §341 9A-11: ZIP
        if (v === "pack") { packStart(function () { if (st.view === "proj" && st.root === root) { renderProj(root, ctl); } }); renderProj(root, ctl); return; }
        if (v === "packSave" && pk.blob) { pk.saved = ""; daSave(pk.blob, pk.name, function (r) { pk.saved = r; if (st.view === "proj" && st.root === root) { renderProj(root, ctl); } }); return; }
        if (v === "unpack") { var zf = root.querySelector(".dp-zipfile"); if (zf && !pk.busy) { zf.value = ""; zf.click(); } return; }
        if (v === "wavSave" && wav.blob) { wav.saved = ""; daSave(wav.blob, wav.name, function (r) { wav.saved = r; if (st.view === "proj" && st.root === root) { renderProj(root, ctl); } }); return; }
      };
    }
    var mfile = root.querySelector(".dp-midifile"); // §342 9B-4
    if (mfile) {
      mfile.onchange = function () {
        var f = mfile.files && mfile.files[0], M = DM();
        if (!f) { return; }
        if (f.size > M.MIDI_MAX_BYTES) { st.midErr = "読みこめませんでした: ファイルが大きすぎます（" + Math.round(f.size / 1024) + " KB・" + (M.MIDI_MAX_BYTES / 1048576) + " MB まで）"; renderProj(root, ctl); return; }
        var rm = new FileReader();
        rm.onload = function () { var r = midiOpen(new Uint8Array(rm.result), f.name); if (st.root === root) { if (r.ok) { render(root, ctl); } else { renderProj(root, ctl); } } };
        rm.onerror = function () { st.midErr = "ファイルを読めませんでした"; renderProj(root, ctl); };
        rm.readAsArrayBuffer(f);
      };
    }
    var zfile = root.querySelector(".dp-zipfile"); // §341 9A-11
    if (zfile) {
      zfile.onchange = function () {
        var f = zfile.files && zfile.files[0];
        if (!f) { return; }
        if (f.size > PACK_MAX_ZIP) { pk.istate = "fail"; pk.imsg = "ZIP が大きすぎます（" + mb(f.size) + "・" + (PACK_MAX_ZIP / 1048576) + "MB まで）"; renderProj(root, ctl); return; }
        pk.istate = "busy"; pk.restored = null; renderProj(root, ctl);
        var rz = new FileReader();
        rz.onload = function () { packLoad(rz.result, function () { if (st.view === "proj" && st.root === root) { renderProj(root, ctl); } }); };
        rz.onerror = function () { pk.istate = "fail"; pk.imsg = "ファイルを読めませんでした"; renderProj(root, ctl); };
        rz.readAsArrayBuffer(f);
      };
    }
    if (file) {
      file.onchange = function () {
        var f = file.files && file.files[0];
        if (!f) { return; }
        if (f.size > DM().MAX_JSON) { sv.note = "読みこめませんでした: ファイルが大きすぎます（2MB まで）"; renderProj(root, ctl); return; }
        var rd = new FileReader();
        rd.onload = function () { var r = proj.importText(String(rd.result || "")); if (r.ok) { render(root, ctl); } else { renderProj(root, ctl); } };
        rd.onerror = function () { sv.note = "ファイルを読めませんでした"; renderProj(root, ctl); };
        rd.readAsText(f, "UTF-8");
      };
    }
  }
  // DAW とピアノロールの上の段: 📁 曲・曲名・保存の状態・💾
  function projBarHtml(p) {
    return '<div class="dp-bar"><button class="modal-btn daw-small" data-go-proj="1">&#x1F4C1; 曲</button>' +
      '<button class="dp-title" data-rename="1" title="曲名を変える">' + escHtml(p.name) + ' &#x270F;&#xFE0F;</button>' +
      '<span class="dsv-slot">' + statusHtml() + '</span>' +
      '<button class="modal-btn daw-small" data-save-now="1" title="いま保存">&#x1F4BE;</button></div>' + recBannerHtml();
  }
  // 9A-13: 録音の状態・結果（どの画面でも上に出す）
  function recBannerHtml() {
    if (rec.state === "rec" || rec.state === "ask") { return '<div class="dr-banner dr-now">&#x25CF; ' + (rec.state === "ask" ? "マイクの準備中…" : "録音中") + ' — &#x23F9;&#xFE0F; で止めて置きます（▶ は使えません）</div>'; }
    if (rec.state === "saving") { return '<div class="dr-banner dr-now">&#x23F3; 録音を保存しています…</div>'; }
    if (!rec.result) { return ''; }
    return '<div class="dr-banner dr-' + rec.result.kind + '">' + (rec.result.kind === "ok" ? "&#x2705; " : (rec.result.kind === "fail" ? "&#x26A0;&#xFE0F; " : "")) + escHtml(rec.result.text) + '<button class="dr-x" data-rc-x="1" aria-label="消す">&#x2715;</button></div>';
  }
  // 上の段のボタン（DAW とピアノロールで同じ）
  function bindProjBar(root, ctl) {
    var a = root.querySelector("[data-go-proj]"), b = root.querySelector("[data-rename]"), c = root.querySelector("[data-save-now]");
    if (a) { a.onclick = function () { keepScroll(root); if (rec.state === "rec" || rec.state === "ask") { recStop("btn"); } else if (pl) { stopPlay(false); } st.view = "proj"; sv.note = ""; renderProj(root, ctl); }; }
    if (b) { b.onclick = function () { var v = window.prompt ? window.prompt("曲名（40 文字まで）", project().name) : null; if (v !== null && v !== undefined) { proj.rename(v); keepScroll(root); render(root, ctl); } }; }
    if (c) { c.onclick = function () { saveNow(); drawStatus(); }; }
    var x = root.querySelector("[data-rc-x]"); // 9A-13: 録音の結果の欄を消す
    if (x) { x.onclick = function () { rec.result = null; keepScroll(root); render(root, ctl); }; }
  }
  function keepScroll(root) { var arr = root.querySelector && root.querySelector(".daw-arr"); if (arr) { st.scroll = arr.scrollLeft || 0; } var w = root.querySelector && root.querySelector(".pr-wrap"); if (w && st.roll) { st.roll.sx = w.scrollLeft; st.roll.sy = w.scrollTop; } }
  var BLACK = [1, 3, 6, 8, 10];
  function rollClip() { var r = st.roll, f = r ? DM().findClip(st.project, r.clip) : null; return f; }
  function openRoll(id) {
    var f = DM().findClip(project(), id);
    if (!f || f.clip.type !== "midi") { return false; }
    st.view = "roll";
    st.sel = { kind: "clip", id: id };
    st.roll = { clip: id, track: f.track.id, sel: null, snap: st.rollSnap || 480, undo: st.undo, init: true, sx: 0, sy: 0 };
    st.humUI = null; // §345 A27
    return true;
  }
  function closeRoll() { if (pl && pl.clip) { stopPlay(false); } st.view = "arr"; st.roll = null; }
  // §341 9A-5: ↶ はトラック全部の写し（音符もふくむ）を覚える。ピアノロールとアレンジで同じ列
  function snapTracks() { return JSON.parse(JSON.stringify(project().tracks)); }
  // ---------- §345 A19: その場でコードを変える（アレンジの画面のコードをタップ → 下に小さな編集パネル）----------
  // st.ced ＝ { bar, id（選んだコード）, how（"keep"｜"newtrack"）, text, err, q（見本） }。曲は「確定」まで変えない
  function cedOpen(bar) { st.secSheet = null; st.ced = { bar: Math.max(0, Math.round(Number(bar)) || 0), id: "", how: "keep", text: "", err: "", q: null }; st.confirmDel = null; st.chooseAdd = false; }
  function cedPick(p, id) { var X0 = XM(); st.ced.id = id; st.ced.err = ""; st.ced.q = X0 && X0.chordQuickPlan ? X0.chordQuickPlan(p, st.ced.bar, id, st.ced.how) : null; }
  function cedHtml(p) {
    var c = st.ced, X0 = XM(); if (!c || !X0 || !X0.chordCands) { return ""; }
    var cur = (X0.songChords(p) || {})[c.bar], curName = cur ? X0.chordName(p, cur) : "（なし）", cands = X0.chordCands(p), q = c.q, h, i;
    h = '<div class="daw-ced" role="dialog" aria-label="' + (c.bar + 1) + ' 小節目のコード"><div class="daw-ced-top"><b>' + (c.bar + 1) + ' 小節目のコード</b> <span class="daw-ced-cur">' + escHtml(curName) + (c.id ? ' → <b>' + escHtml(X0.chordName(p, c.id)) + '</b>' : '') + '</span><button class="modal-btn daw-small" data-ced="close" aria-label="閉じる">&#x2715;</button></div>';
    h += '<div class="daw-ced-chips">';
    for (i = 0; i < cands.length; i++) { h += '<button class="daw-ced-c' + (cands[i].id === c.id ? ' on' : '') + (cands[i].id === cur ? ' cur' : '') + '" data-ced="pick:' + escHtml(cands[i].id) + '">' + escHtml(cands[i].name) + '</button>'; }
    h += '</div><div class="daw-ced-row"><input type="text" class="daw-ced-in" value="' + escHtml(c.text) + '" placeholder="直接入力（例 Dm7・D/F#）" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done" aria-label="コード名"><button class="modal-btn daw-small" data-ced="text">決める</button></div>';
    h += '<div class="daw-ced-st small">' + (c.err ? '&#x26A0;&#xFE0F; ' + escHtml(c.err) : '') + '</div>';
    if (c.id && q) {
      if (!q.ok) { h += '<div class="small">' + escHtml(q.why) + '</div>'; }
      else {
        h += '<div class="daw-ced-pv small">';
        h += q.regen.length ? '&#x2705; 伴奏が追従: ' + escHtml(q.regen.join("・")) + '（' + q.regen.length + '）' : '伴奏で追従するものはありません';
        if (q.same.length) { h += '<br>音が変わらない: ' + escHtml(q.same.join("・")); }
        if (q.edited) { h += '<br>&#x270F;&#xFE0F; 手で直したクリップ: ' + escHtml(q.keep.concat(q.newtrack).join("・")) + ' <span class="daw-ced-how">' + '<button class="daw-ced-c' + (c.how === "keep" ? " on" : "") + '" data-ced="how:keep">元のまま</button><button class="daw-ced-c' + (c.how === "newtrack" ? " on" : "") + '" data-ced="how:newtrack">新しいトラックに作る</button></span>'; }
        if (q.none.length) { h += '<br>追従しない: ' + escHtml(q.none.map(function (z) { return z.name + "（" + z.why + "）"; }).join("・")); }
        h += '</div>';
      }
    }
    h += '<div class="daw-ced-row">' + (c.id && q && q.ok ? '<button class="modal-btn daw-ced-go" data-ced="apply">&#x2705; 確定</button>' : '') + '<button class="modal-btn daw-small" data-ced="full">くわしい画面</button><button class="modal-btn daw-small" data-ced="close">やめる</button></div>';
    return h + '</div>';
  }
  // パネルのボタン → true（処理した）
  function cedClick(v, root, ctl) {
    var p = project(), X0 = XM(), c = st.ced;
    if (!c || !X0) { return false; }
    if (v === "close") { st.ced = null; render(root, ctl); return true; }
    if (v === "full") { var b0 = c.bar; st.ced = null; if (X0.chordOpen) { X0.chordOpen(b0); st.view = "xmas"; renderXmas(root, ctl); } return true; }
    if (v.indexOf("pick:") === 0) { c.text = ""; cedPick(p, v.substring(5)); render(root, ctl); return true; }
    if (v.indexOf("how:") === 0) { c.how = v.substring(4) === "newtrack" ? "newtrack" : "keep"; if (c.id) { cedPick(p, c.id); } render(root, ctl); return true; }
    if (v === "text") { var inp = root.querySelector(".daw-ced-in"), r = X0.chordParse(p, inp ? inp.value : c.text); c.text = inp ? inp.value : c.text; if (r.ok) { cedPick(p, r.id); } else { c.err = r.why; c.id = ""; c.q = null; } render(root, ctl); return true; }
    if (v === "apply") {
      if (!c.id || !c.q || !c.q.ok) { return true; }
      var q = X0.chordQuickPlan(p, c.bar, c.id, c.how); if (!q.ok) { c.q = q; render(root, ctl); return true; } // 確定のときに作りなおす（見本のあとに曲が変わっていても安全）
      var from = (X0.songChords(p) || {})[c.bar], fromN = from ? X0.chordName(p, from) : "（なし）", snap = xmHost.snapAll(), r2 = X0.chordQuickApply(p, q), toN = X0.chordName(p, c.id);
      var note = (c.bar + 1) + " 小節目のコードを " + fromN + " → " + toN + " にしました。" + (q.regen.length ? "伴奏 " + q.regen.length + " つが追従" : "追従した伴奏はありません") + (q.keep.length ? "・手で直した " + q.keep.join("・") + " は元のまま（追従していません）" : "") + (q.newtrack.length ? "・手で直した " + q.newtrack.join("・") + " は新しいトラックに作りました" : "") + "（↶ 1 回で戻せます）";
      st.ced = null; st.lastChord = { bar: c.bar }; pushUndo(snap); st.anote = escHtml(note) + ' <button class="modal-btn daw-small" data-act="loopBar:' + c.bar + '">&#x1F501; ' + (c.bar + 1) + ' 小節目をくり返し聴く</button>'; /* §345 A21 */ markDirty(); if (pl) { resync(); } render(root, ctl);
      dgLog("chord", { bar: c.bar, id: c.id, n: r2.n });
      return true;
    }
    return false;
  }
  // 入力欄: 打つたびに読みとりだけ見せる（描きなおさない＝キーボードを閉じない）・Enter で決める。iPhone のキーボードでパネルが隠れないように、見えている高さに合わせる
  function cedBind(root, ctl) {
    var inp = root.querySelector && root.querySelector(".daw-ced-in"), box = root.querySelector && root.querySelector(".daw-ced"), X0 = XM();
    if (!inp || !X0) { return; }
    inp.oninput = function () { var r = X0.chordParse(project(), inp.value), s0 = root.querySelector(".daw-ced-st"); st.ced.text = inp.value; if (s0) { s0.textContent = !inp.value ? "" : (r.ok ? "→ " + r.name + "（「決める」か Enter）" : r.why); } };
    inp.onkeydown = function (ev) { if (ev && (ev.key === "Enter" || ev.keyCode === 13)) { if (ev.preventDefault) { ev.preventDefault(); } cedClick("text", root, ctl); } if (ev && ev.stopPropagation) { ev.stopPropagation(); } };
    var vv = window.visualViewport;
    if (box && vv && vv.addEventListener) { var fit = function () { if (!document.body.contains(box)) { vv.removeEventListener("resize", fit); return; } var gap = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop)); box.style.bottom = (8 + gap) + "px"; }; vv.addEventListener("resize", fit); fit(); }
  }
  function pushUndo(snap) { var u = st.undo; u.push(snap); if (u.length > UNDO_MAX) { u.shift(); } st.redo.length = 0; } /* §345 A27: 新しく直したら ↷ の列は消す */
  function humResync() { if (pl) { if (pl.opts) { pl.opts.hum = null; } resync(); } } // §345 A27: 試聴の A／B をやめて、いまの曲で鳴らしなおす
  // 直したあと: 再生中なら同じ位置から鳴らしなおす（古い予約の音を消す）・描きなおす
  function afterEdit() { if (pl) { resync(); } rerender(); }
  function restoreSnap(z) { if (z && z.__all) { st.project.tracks = z.tracks; st.project.markers = z.markers; if (z.tempo) { st.project.tempo = z.tempo; } if (z.ext) { st.project.ext = z.ext; } } else { st.project.tracks = z; } } // 9B-1: セクションの写しも・9B-12: テンポも
  // ---------- §341 9A-5: アレンジの操作（トラック・クリップ）。どれも ↶ に写しを積み、自動保存し、再生中なら同じ位置から鳴らしなおす ----------
  function findSelClip() { return st.sel && st.sel.kind === "clip" ? DM().findClip(project(), st.sel.id) : null; }
  function clipLabel(c) { return (c.ext && c.ext.name) || "クリップ"; }
  function done(snap, note) { pushUndo(snap); st.anote = note || ""; st.reveal = true; markDirty(); if (pl) { resync(); } rerender(); return true; }
  function nope(why) { st.anote = "&#x26A0;&#xFE0F; " + escHtml(why); rerender(); return false; }
  var ops = {
    addTrack: function (kind) {
      var p = project(), s = snapTracks(), t;
      st.chooseAdd = false;
      if (kind === "audio") { // §341 9A-10（IndexedDB が使えるかは、呼ぶ前に addAudio で確かめる）
        var ra = DM().addAudioTrack(p);
        if (!ra.ok) { return nope(ra.why); }
        st.sel = { kind: "track", id: ra.track.id };
        done(s, "「" + escHtml(ra.track.name) + "」を足しました。「&#x1F3B5; WAV を読みこむ」かトラックの ＋ で WAV を選んでください");
        return ra.track;
      }
      t = kind === "drum" ? DM().addDrumTrack(p) : DM().addTrack(p);
      if (!t) { return nope("トラックは " + DM().MAX_TRACKS + " 本までです"); }
      st.sel = { kind: "track", id: t.id };
      done(s, "「" + escHtml(t.name) + "」を足しました。＋ でクリップを足せます");
      return t;
    },
    renameTrack: function (id, name) {
      var t = DM().findTrack(project(), id); name = String(name || "").replace(/[\u0000-\u001f]/g, "").replace(/^\s+|\s+$/g, "").substring(0, 40);
      if (!t || !name || name === t.name) { return false; }
      var s = snapTracks(); t.name = name; return done(s, "");
    },
    moveTrack: function (id, dir) {
      var s = snapTracks();
      if (!DM().moveTrack(project(), id, dir)) { return nope(dir < 0 ? "いちばん上です" : "いちばん下です"); }
      return done(s, "");
    },
    addClip: function (trackId, start) {
      var p = project(), s = snapTracks(), tt = DM().findTrack(p, trackId), drum = DM().isDrum(tt), c = DM().addClip(p, trackId, start, drum ? 1 : 4, drum && tt ? "パターン " + (tt.clips.length + 1) : undefined);
      if (!c) { return nope("ここにはクリップを足せません（曲が長すぎます）"); }
      st.sel = { kind: "clip", id: c.id };
      done(s, "空のクリップを足しました。もう一度タップすると音符を入れられます");
      return c;
    },
    // §342 9B-1: くり返して並べる（全部を先に調べる・↶ 1 回）
    repeat: function (id, n, destTick) {
      var p = project(), s = snapTracks(), r = DM().repeatClip(p, id, n, destTick);
      if (!r.ok) { return nope(r.why); }
      st.repeat = null;
      var bt = DM().barTicks(p), last = r.clips[r.clips.length - 1];
      return done(s, r.clips.length + " 個並べました（" + (Math.round(r.from / bt) + 1) + "〜" + Math.round((last.start + last.len) / bt) + " 小節目・↶ 1 回で戻せます）");
    },
    duplicate: function (id) {
      var s = snapTracks(), c = DM().duplicateClip(project(), id);
      if (!c) { return nope("複製できませんでした（曲が長すぎます）"); }
      st.sel = { kind: "clip", id: c.id };
      done(s, "複製しました（" + DM().tickToBar(project(), c.start).bar + " 小節目）");
      return c;
    },
    move: function (id, bars) {
      var s = snapTracks(), r = DM().moveClip(project(), id, bars);
      if (!r.ok) { return nope(r.why); }
      return done(s, "");
    },
    resize: function (id, bars) {
      var s = snapTracks(), r = DM().resizeClip(project(), id, bars);
      if (!r.ok) { return nope(r.why); }
      return done(s, r.hidden ? "はみ出た音符 " + r.hidden + " 個は鳴りません（長くすると戻ります）" : "");
    },
    renameClip: function (id, name) {
      var f = DM().findClip(project(), id); name = String(name || "").replace(/[\u0000-\u001f]/g, "").replace(/^\s+|\s+$/g, "").substring(0, 40);
      if (!f || !name || name === clipLabel(f.clip)) { return false; }
      var s = snapTracks(); f.clip.ext = f.clip.ext || {}; f.clip.ext.name = name; return done(s, "");
    },
    remove: function (id) {
      var f = DM().findClip(project(), id), s = snapTracks();
      if (!f || !DM().deleteClip(project(), id)) { return false; }
      st.sel = null;
      return done(s, "「" + escHtml(clipLabel(f.clip)) + "」を消しました（&#x21B6; で戻せます）");
    },
    redo: function () { var ok = edit.redo(); if (ok) { st.anote = "1 つやりなおしました"; if (st.sel && st.sel.kind === "clip" && !DM().findClip(project(), st.sel.id)) { st.sel = null; } rerender(); } return ok; }, // §345 A27
    undo: function () { var ok = edit.undo(); if (ok) { st.anote = "1 つ戻しました"; if (st.sel && st.sel.kind === "clip" && !DM().findClip(project(), st.sel.id)) { st.sel = null; } rerender(); } return ok; },
    // §341 9A-6: トラックを消す（確かめの欄のあと。再生中なら止めてから。↶ で戻せる・最後の 1 本は消さない）
    deleteTrack: function (id) {
      var p = project(), t = DM().findTrack(p, id);
      st.confirmDel = null;
      if (!t) { return false; }
      if (p.tracks.length <= 1) { return nope("曲には 1 本以上のトラックが要ります（最後の 1 本は消せません）"); }
      if (pl) { stopPlay(false); }
      var s = snapTracks(), r = DM().deleteTrack(p, id);
      if (!r.ok) { return nope(r.why); }
      st.sel = null;
      return done(s, "「" + escHtml(t.name) + "」を消しました（&#x21B6; で戻せます）");
    },
  };
  // §341 9A-10: 🎵 オーディオのトラックを足す（先に IndexedDB が使えるかを確かめる・使えなければ理由）
  function addAudio(cb) {
    idbOpen(function (db, why) {
      var r = db ? ops.addTrack("audio") : (st.chooseAdd = false, nope(why || "このブラウザでは音声の素材を保存できません"));
      if (cb) { cb(r); }
    });
  }
  // 音を短く鳴らす（足した・高さを変えたとき。再生中は鳴らさない）
  function preview(t, m) {
    if (pl) { return; }
    var UG = window.UGMelody, Y = window.UGSynth, patch = t && t.instrument && t.instrument.patch ? t.instrument.patch.patch : null;
    if (t && t.instrument && t.instrument.type === "sample") { if (XM()) { XM().hearNote(t.instrument, m); } return; } // §343: 録音の音色
    if (!UG || !UG.audioInit || !Y || !Y.note || !patch) { return; }
    try { var ac = UG.audioInit(); if (ac) { Y.note(patch, m, (UG.audio && UG.audio.bus) || ac.destination, ac.currentTime + 0.01, 0.8, 0.25); } } catch (e) {}
  }
  // 編集（画面とテストの両方から呼ぶ）。どれも直す前の状態を ↶ 用に覚える
  var edit = {
    add: function (t, m) {
      var f = rollClip(); if (!f) { return null; }
      var snap = snapTracks(), n = DM().noteAdd(f.clip, t, m, st.roll.snap, 0.8);
      if (n) { pushUndo(snap); st.roll.sel = n; preview(f.track, n[2]); markDirty(); afterEdit(); }
      return n;
    },
    set: function (n, o, snap) {
      var f = rollClip(); if (!f || !n) { return null; }
      var before = snap || snapTracks(), m0 = n[2], t0 = n[0], d0 = n[1];
      DM().noteSet(f.clip, n, o);
      if (n[0] === t0 && n[1] === d0 && n[2] === m0) { rerender(); return n; }
      pushUndo(before); st.roll.sel = n; markDirty();
      if (n[2] !== m0) { preview(f.track, n[2]); }
      afterEdit();
      return n;
    },
    del: function (n) {
      var f = rollClip(); n = n || (st.roll && st.roll.sel); if (!f || !n) { return false; }
      var snap = snapTracks();
      if (!DM().noteDelete(f.clip, n)) { return false; }
      pushUndo(snap); st.roll.sel = null; markDirty(); afterEdit();
      return true;
    },
    undo: function () {
      var u = st.undo; if (!u.length || !st.project) { return false; }
      var z = u.pop(); st.redo.push(z && z.__all ? xmHost.snapAll() : snapTracks()); if (st.redo.length > UNDO_MAX) { st.redo.shift(); } // §345 A27: ↷ のために、いまを覚える
      restoreSnap(z);
      if (st.roll) { st.roll.sel = null; } markDirty(); afterEdit(); // 戻したあとの状態を保存
      return true;
    },
    // §345 A27: ↷ やりなおし（↶ で戻したものをもう一度）
    redo: function () {
      var rd = st.redo; if (!rd.length || !st.project) { return false; }
      var z = rd.pop(), u = st.undo; u.push(z && z.__all ? xmHost.snapAll() : snapTracks()); if (u.length > UNDO_MAX) { u.shift(); }
      restoreSnap(z);
      if (st.roll) { st.roll.sel = null; } markDirty(); afterEdit();
      return true;
    }
  };
  // ---------- §345 A23: メロディの補助（コード・スケール・ルート・音域・小節）とステップ入力（ピアノロール）----------
  var SCALE = { maj: [0, 2, 4, 5, 7, 9, 11], min: [0, 2, 3, 5, 7, 8, 10] };
  var MEL_RANGE = [60, 81]; // 歌のメロディの目安（C4〜A5）
  function isMelT(t) { return !!(t && ((t.ext && t.ext.icon === "&#x1F3A4;") || /^メロディ/.test(t.name || ""))); }
  // 補助の材料（曲は変えない）: キー・スケール・小節ごとのコード（x・幅・名前・構成音・ルート）・音域
  function rollAssist(p, f) {
    var M = DM(), X0 = XM(), c = f.clip, o = c.offset || 0, PPQ = M.PPQ, sk = X0 && X0.songKey ? X0.songKey(p) : { key: null, kmode: "maj" }, sc = X0 && X0.songChords ? X0.songChords(p) : {};
    var key = sk.key === null ? null : sk.key, scale = key === null ? [] : SCALE[sk.kmode === "min" ? "min" : "maj"].map(function (x) { return (x + key) % 12; });
    var a = { key: key, kmode: sk.kmode, scale: scale, bars: [], range: isMelT(f.track) ? MEL_RANGE : null };
    var t0 = c.start, t1 = c.start + c.len, b = M.tickToBar(p, t0).bar - 1;
    while (M.barToTick(p, b) < t1) {
      var bs = Math.max(t0, M.barToTick(p, b)), be = Math.min(t1, M.barToTick(p, b + 1)), id = sc[b], ch = id && key !== null && X0.chordOf ? X0.chordOf(key, id) : null;
      a.bars.push({ bar: b, x: Math.round((bs - c.start) / PPQ * RB), w: Math.max(1, Math.round((be - bs) / PPQ * RB)), t: bs - c.start + o, te: be - c.start + o, name: ch ? ch.name : "", pcs: ch ? ch.pcs : [], root: ch ? ch.root : null });
      b++;
      if (a.bars.length > 300) { break; }
    }
    return a;
  }
  // 音符（クリップの中の tick）の種類: "ct"（その小節のコードの音）・"sc"（スケールの音）・"out"（それ以外・使ってよい）
  function noteKind(a, n) {
    var pc = ((n[2] % 12) + 12) % 12, i, bar = null;
    for (i = 0; i < a.bars.length; i++) { if (n[0] >= a.bars[i].t && n[0] < a.bars[i].te) { bar = a.bars[i]; } }
    if (bar && bar.pcs.indexOf(pc) >= 0) { return pc === bar.root ? "rt" : "ct"; }
    if (a.scale.indexOf(pc) >= 0) { return "sc"; }
    return a.key === null ? "" : "out";
  }
  function rollAssistOn() { return st.rollAssist === undefined || st.rollAssist === null ? true : !!st.rollAssist; }
  // 格子の上の補助（スケールの行・コードの音の帯・ルート）
  function assistGridHtml(a) {
    var h = "", m, i, k;
    if (a.key !== null) { for (m = HI; m >= LO; m--) { if (a.scale.indexOf(m % 12) >= 0) { h += '<i class="pr-sc" style="top:' + (HI - m) * RH + 'px;height:' + RH + 'px;"></i>'; } } }
    for (i = 0; i < a.bars.length; i++) {
      var B = a.bars[i]; if (!B.pcs.length) { continue; }
      for (m = HI; m >= LO; m--) { k = m % 12; if (B.pcs.indexOf(k) >= 0) { h += '<i class="' + (k === B.root ? 'pr-cr' : 'pr-ct') + '" style="left:' + B.x + 'px;width:' + B.w + 'px;top:' + (HI - m) * RH + 'px;height:' + RH + 'px;"></i>'; } }
    }
    if (a.range) { h += '<i class="pr-rg" style="top:' + (HI - a.range[1]) * RH + 'px;height:' + (a.range[1] - a.range[0] + 1) * RH + 'px;"></i>'; }
    return h;
  }
  // 上の行（小節の番号・コード名）。縦にスクロールしても見える
  function assistBarHtml(a, W) {
    var h = '<div class="pr-cbar"><span class="pr-cbk" style="width:' + KEYW + 'px;">' + (a.key === null ? "" : escHtml(["C", "C#", "D", "E♭", "E", "F", "F#", "G", "A♭", "A", "B♭", "B"][a.key] + (a.kmode === "min" ? "m" : ""))) + '</span>', i;
    for (i = 0; i < a.bars.length; i++) { var B = a.bars[i]; h += '<span class="pr-cb" style="left:' + (KEYW + B.x) + 'px;width:' + B.w + 'px;"><b>' + (B.bar + 1) + '</b> ' + escHtml(B.name) + '</span>'; }
    return h + '</div>';
  }
  // ---- ステップ入力: 長さ・高さを選ぶ → 入力位置に音符 → 位置が進む ----
  var STEP_LENS = [[240, "1/16"], [480, "1/8"], [720, "付点1/8"], [960, "1/4"], [1440, "付点1/4"], [1920, "1/2"], [3840, "全"]];
  function stepOn() { return !!(st.roll && st.roll.step); }
  function stepStart(f) { var c = f.clip, last = 0, i; for (i = 0; i < c.notes.length; i++) { last = Math.max(last, c.notes[i][0] + Math.max(0, c.notes[i][1])); } st.roll.step = { pos: Math.max(c.offset || 0, Math.min(last, (c.offset || 0) + c.len - 1)), len: 480, oct: isMelT(f.track) ? 5 : 4, last: null }; }
  function stepHtml(p, f, a) {
    var s = st.roll.step, M = DM(), c = f.clip, PPQ = M.PPQ, b = M.tickToBar(p, c.start + s.pos - (c.offset || 0)), i, bar = null, NN = ["C", "C#", "D", "E♭", "E", "F", "F#", "G", "A♭", "A", "B♭", "B"];
    if (a) { for (i = 0; i < a.bars.length; i++) { if (s.pos >= a.bars[i].t && s.pos < a.bars[i].te) { bar = a.bars[i]; } } }
    var h = '<div class="pr-step"><div class="pr-srow"><b>&#x270D;&#xFE0F; ステップ入力</b> <span class="pr-spos">' + b.bar + '.' + b.beat + (b.sub ? '.' + b.sub : '') + (bar && bar.name ? '・' + escHtml(bar.name) : '') + '</span>' +
      '<button class="modal-btn daw-tbtn" data-roll="sback" aria-label="入力位置を戻す">&#x25C0;&#xFE0E;</button><button class="modal-btn daw-tbtn" data-roll="srest" aria-label="休符（位置を進める）">休符</button><button class="modal-btn daw-tbtn" data-roll="sundo" aria-label="入れた音を取り消す"' + (s.last ? '' : ' disabled') + '>取消</button></div>';
    h += '<div class="pr-srow">' + STEP_LENS.map(function (L) { return '<button class="daw-ced-c' + (L[0] === s.len ? ' on' : '') + '" data-roll="slen:' + L[0] + '">' + L[1] + '</button>'; }).join("") + '</div>';
    h += '<div class="pr-srow pr-skeys"><button class="modal-btn daw-tbtn" data-roll="soct:-1" aria-label="オクターブ下">&#x25BC;</button>';
    for (i = 0; i < 12; i++) {
      var m = (s.oct + 1) * 12 + i, k = bar && bar.pcs.indexOf(i) >= 0 ? (i === bar.root ? " pr-skr" : " pr-skc") : (a && a.scale.indexOf(i) >= 0 ? " pr-sks" : " pr-sko");
      h += '<button class="pr-sk' + (BLACK.indexOf(i) >= 0 ? ' pr-skb' : '') + k + '" data-roll="sk:' + m + '" aria-label="' + noteName(m) + '">' + NN[i] + '<small>' + (s.oct) + '</small></button>';
    }
    h += '<button class="modal-btn daw-tbtn" data-roll="soct:1" aria-label="オクターブ上">&#x25B2;</button></div>';
    return h + '<p class="small">音を押すと、入力位置に ' + escHtml(STEP_LENS.filter(function (L) { return L[0] === s.len; })[0][1]) + ' の音符が入り、位置が進みます（緑 ＝ コードの音・こい緑 ＝ ルート・うす ＝ スケールの音・灰 ＝ それ以外（使ってもよい））。↶ でも 1 音ずつ戻せます。</p></div>';
  }
  // ステップ入力のボタン → true
  function stepAct(v, f) {
    var s = st.roll && st.roll.step, c = f.clip, M = DM(), m;
    if (v === "step") { if (s) { st.roll.step = null; } else { stepStart(f); } return true; }
    if (!s) { return false; }
    var o = c.offset || 0, end = o + c.len;
    if ((m = /^slen:(\d+)$/.exec(v))) { s.len = Number(m[1]); return true; }
    if ((m = /^soct:(-?\d)$/.exec(v))) { s.oct = Math.max(1, Math.min(7, s.oct + Number(m[1]))); return true; }
    if (v === "srest") { s.pos = Math.min(end - 1, s.pos + s.len); return true; }
    if (v === "sback") { s.pos = Math.max(o, s.pos - s.len); return true; }
    if (v === "sundo") { if (s.last && c.notes.indexOf(s.last) >= 0) { var snap0 = snapTracks(); M.noteDelete(c, s.last); pushUndo(snap0); s.pos = s.last[0]; s.last = null; st.roll.sel = null; markDirty(); } return true; }
    if ((m = /^sk:(\d+)$/.exec(v))) {
      if (s.pos >= end) { st.msg = "クリップの終わりです（クリップをのばすか、◀ で位置を戻してください）"; return true; }
      var snap = snapTracks(), n = M.noteAdd(c, s.pos, Number(m[1]), Math.min(s.len, end - s.pos), 0.8);
      if (!n) { st.msg = "これ以上 音符を足せません"; return true; }
      pushUndo(snap); st.roll.sel = n; s.last = n; preview(f.track, n[2]); markDirty(); st.msg = "";
      s.pos = Math.min(end, n[0] + Math.max(1, n[1]));
      if (s.pos >= end) { st.msg = "クリップの終わりまで入れました"; }
      return true;
    }
    return false;
  }
  // ---------- §345 A24: フレーズの道具（範囲を選んで コピー・貼り付け・複製・移調・オクターブ・拍で移動・長さ・強さ）----------
  // 選んだ音符 ＝ st.roll.ms（いま開いているクリップの音符の参照）。クリップボード ＝ st.clip2 ＝ { notes: [[曲の位置からの差 tick, 長さ, 高さ, 強さ]], span, bar0（はじまりの小節）, meter, from（トラック名） }
  function phrMs(c) { var r = st.roll; if (!r.ms) { r.ms = []; } r.ms = r.ms.filter(function (n) { return c.notes.indexOf(n) >= 0; }); return r.ms; }
  function absT(c, n) { return c.start + n[0] - (c.offset || 0); }
  // 選ぶ: 全部 ／ 小節 a〜b（クリップの中・曲の小節の番号）／ タップで 1 音ずつ
  function phrSelBars(p, c, a, b) { var M = DM(), t0 = M.barToTick(p, Math.max(0, a - 1)), t1 = M.barToTick(p, Math.max(a, b)); st.roll.ms = c.notes.filter(function (n) { var t = absT(c, n); return t >= t0 && t < t1; }); return st.roll.ms.length; }
  // コピー（曲は変えない）: はじまり ＝ 選んだいちばん前の音の小節の頭
  function phrCopy(p, c, t) {
    var M = DM(), ms = phrMs(c); if (!ms.length) { return { ok: false, why: "音符を選んでください" }; }
    var first = Math.min.apply(null, ms.map(function (n) { return absT(c, n); })), b0 = M.tickToBar(p, first).bar - 1, base = M.barToTick(p, b0), end = 0;
    var notes = ms.map(function (n) { var rel = absT(c, n) - base; end = Math.max(end, rel + Math.max(1, n[1])); return [rel, n[1], n[2], n[3]]; }).sort(function (x, y) { return x[0] - y[0] || x[2] - y[2]; });
    var span = Math.max(M.barToTick(p, M.tickToBar(p, base + end - 1).bar) - base, M.ticksPerBar(M.meterAt(p, base)));
    st.clip2 = { notes: notes, span: span, bar0: b0, meter: M.meterAt(p, base), from: t ? t.name : "", n: notes.length };
    return { ok: true, n: notes.length, bars: Math.round(span / M.ticksPerBar(M.meterAt(p, base)) * 100) / 100 };
  }
  // 貼り付け（曲の位置 at へ・そのトラックの、その位置にある MIDI のクリップに入れる。クリップをまたいでもよい）
  // mode: "mix"（重ねる）｜"replace"（その範囲の音を消してから）。→ { ok, added, dropped（クリップがない・終わりをこえる）, trimmed（同じ高さの重なりを切った）, meterWarn }
  function phrPaste(p, t, at, cb, mode) {
    var M = DM(); cb = cb || st.clip2;
    if (!cb || !cb.notes.length) { return { ok: false, why: "コピーした音符がありません" }; }
    if (!t || M.isAudio(t) || t.kind !== "midi") { return { ok: false, why: "MIDI のトラックに貼り付けてください" }; }
    var end = at + cb.span, clips = t.clips.filter(function (c) { return c.type === "midi" && c.start < end && c.start + c.len > at; });
    if (!clips.length) { return { ok: false, why: "その場所に、このトラックのクリップがありません" }; }
    var mw = false, b, m0 = cb.meter, bars = M.tickToBar(p, Math.max(at, end - 1)).bar - M.tickToBar(p, at).bar + 1;
    for (b = 0; b < bars; b++) { var mm = M.meterAt(p, M.barToTick(p, M.tickToBar(p, at).bar - 1 + b)); if (mm.num !== m0.num || mm.den !== m0.den) { mw = true; } }
    var r = { ok: true, added: 0, dropped: 0, trimmed: 0, removed: 0, meterWarn: mw, clips: clips.length };
    if (mode === "replace") { clips.forEach(function (c) { var before = c.notes.length; c.notes = c.notes.filter(function (n) { var x = absT(c, n); return x < at || x >= end; }); r.removed += before - c.notes.length; }); }
    var added = [];
    cb.notes.forEach(function (n) {
      var x = at + n[0], c = null, i;
      for (i = 0; i < clips.length; i++) { if (x >= clips[i].start && x < clips[i].start + clips[i].len) { c = clips[i]; } }
      if (!c) { r.dropped++; return; }
      var lt = x - c.start + (c.offset || 0), d = n[1] > 0 ? Math.min(n[1], (c.offset || 0) + c.len - lt) : n[1];
      if (c.notes.length >= 4000) { r.dropped++; return; }
      var nn = [lt, d, n[2], n[3]]; c.notes.push(nn); added.push({ c: c, n: nn }); r.added++;
    });
    clips.forEach(function (c) { r.trimmed += fixOverlaps(c); c.notes.sort(function (x, y) { return x[0] - y[0] || x[2] - y[2]; }); });
    r.notes = added;
    return r;
  }
  // 同じ高さの重なり: 前の音を、次の音の頭で切る（同じ位置の同じ高さは 1 つに）→ 切った数
  function fixOverlaps(c) {
    var by = {}, cut = 0, i, k;
    c.notes.forEach(function (n) { (by[n[2]] = by[n[2]] || []).push(n); });
    for (k in by) { if (!by.hasOwnProperty(k)) { continue; } var L = by[k].sort(function (x, y) { return x[0] - y[0]; }); for (i = 1; i < L.length; i++) { var a = L[i - 1], b2 = L[i]; if (a[1] > 0 && a[0] + a[1] > b2[0]) { if (a[0] === b2[0]) { a[1] = -1; } else { a[1] = b2[0] - a[0]; } cut++; } } }
    var before = c.notes.length; c.notes = c.notes.filter(function (n) { return n[1] !== -1; }); return cut + 0 * (before - c.notes.length);
  }
  // 移調: 半音（semis）／ スケールに沿って（deg 度・選んだときだけ）
  function phrTranspose(p, c, semis, deg) {
    var ms = phrMs(c), X0 = XM(), sk = X0 && X0.songKey ? X0.songKey(p) : { key: null };
    if (!ms.length) { return { ok: false, why: "音符を選んでください" }; }
    if (deg) {
      if (sk.key === null) { return { ok: false, why: "曲のキーがないので、スケールに沿った移調はできません（半音で動かしてください）" }; }
      var sc = (sk.kmode === "min" ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11]).map(function (x) { return (x + sk.key) % 12; });
      var out = ms.map(function (n) { var m = n[2], steps = Math.abs(deg), dir = deg > 0 ? 1 : -1, g = 0; while (steps > 0 && g++ < 48) { m += dir; if (sc.indexOf(((m % 12) + 12) % 12) >= 0) { steps--; } } return m; });
      if (out.some(function (m) { return m < 0 || m > 127; })) { return { ok: false, why: "音域の外に出る音があります" }; }
      ms.forEach(function (n, i) { n[2] = out[i]; });
    } else {
      if (ms.some(function (n) { return n[2] + semis < 0 || n[2] + semis > 127; })) { return { ok: false, why: "音域の外（0〜127）に出る音があります" }; }
      ms.forEach(function (n) { n[2] += semis; });
    }
    var tr = fixOverlaps(c);
    return { ok: true, n: ms.length, trimmed: tr };
  }
  // 拍で移動（クリップの外に出る音があれば動かさない）
  function phrMove(c, dt) {
    var ms = phrMs(c), o = c.offset || 0; if (!ms.length) { return { ok: false, why: "音符を選んでください" }; }
    var bad = ms.filter(function (n) { return n[0] + dt < o || n[0] + dt + Math.max(0, n[1]) > o + c.len; }).length;
    if (bad) { return { ok: false, why: "クリップの外に出る音が " + bad + " 個あるので、動かしません（クリップをのばすか、貼り付けを使ってください）" }; }
    ms.forEach(function (n) { n[0] += dt; });
    var tr = fixOverlaps(c); c.notes.sort(function (x, y) { return x[0] - y[0] || x[2] - y[2]; });
    return { ok: true, n: ms.length, trimmed: tr };
  }
  function phrLen(c, d) { var ms = phrMs(c), o = c.offset || 0; if (!ms.length) { return { ok: false, why: "音符を選んでください" }; } ms.forEach(function (n) { n[1] = Math.max(1, Math.min(d, o + c.len - n[0])); }); var tr = fixOverlaps(c); return { ok: true, n: ms.length, trimmed: tr }; }
  function phrVel(c, v, add) { var ms = phrMs(c); if (!ms.length) { return { ok: false, why: "音符を選んでください" }; } ms.forEach(function (n) { n[3] = Math.round(Math.max(0.05, Math.min(1, add ? n[3] + v : v)) * 1000) / 1000; }); return { ok: true, n: ms.length }; }
  // パネル
  function phrHtml(p, f) {
    var c = f.clip, ms = phrMs(c), M = DM(), r = st.roll, cb = st.clip2, L = M.sectionsOf(p), i;
    var b0 = M.tickToBar(p, c.start).bar, b1 = M.tickToBar(p, c.start + c.len - 1).bar;
    var h = '<div class="pr-step pr-phr"><div class="pr-srow"><b>&#x2702;&#xFE0F; フレーズ</b> <span class="small">選んだ音 <b>' + ms.length + '</b> 個</span>' +
      '<button class="daw-ced-c" data-roll="pall">全部</button><button class="daw-ced-c' + (r.pick ? ' on' : '') + '" data-roll="ppick">タップで選ぶ</button><button class="daw-ced-c" data-roll="pnone">選ばない</button></div>';
    h += '<div class="pr-srow small">小節 <input type="number" class="pr-pa" min="' + b0 + '" max="' + b1 + '" value="' + (r.pa || b0) + '" aria-label="はじまりの小節"> 〜 <input type="number" class="pr-pb" min="' + b0 + '" max="' + b1 + '" value="' + (r.pb || b1) + '" aria-label="終わりの小節"> <button class="daw-ced-c" data-roll="pbars">この小節を選ぶ</button></div>';
    h += '<div class="pr-srow"><button class="daw-ced-c" data-roll="pcopy"' + (ms.length ? '' : ' disabled') + '>&#x1F4CB; コピー</button><button class="daw-ced-c" data-roll="pdup"' + (ms.length ? '' : ' disabled') + '>&#x2795; 後ろに複製</button>' +
      (cb ? '<span class="small">コピー中: ' + cb.n + ' 音（' + escHtml(cb.from) + '・' + (cb.bar0 + 1) + ' 小節目から）</span>' : '') + '</div>';
    if (cb) {
      h += '<div class="pr-srow small">貼り付け先 <select class="pr-pto" aria-label="貼り付け先">';
      for (i = 0; i < L.length; i++) { h += '<option value="s' + i + '">' + escHtml(L[i].name) + '（' + M.tickToBar(p, L[i].tick).bar + ' 小節目）</option>'; }
      h += '<option value="bar">小節の番号で →</option></select> <input type="number" class="pr-pbar" min="1" value="' + (r.pbar || b0) + '" aria-label="貼り付ける小節"> <select class="pr-pmode" aria-label="重なり"><option value="replace">その範囲を置きかえる</option><option value="mix">重ねる</option></select> <button class="daw-ced-c" data-roll="ppaste">貼り付け</button></div>';
    }
    h += '<div class="pr-srow"><span class="small">移調</span><button class="daw-ced-c" data-roll="pt:-1">−1</button><button class="daw-ced-c" data-roll="pt:1">＋1</button><button class="daw-ced-c" data-roll="pt:-12">−8va</button><button class="daw-ced-c" data-roll="pt:12">＋8va</button><button class="daw-ced-c" data-roll="pd:-1" title="スケールに沿って 1 度下">スケール▼</button><button class="daw-ced-c" data-roll="pd:1" title="スケールに沿って 1 度上">スケール▲</button></div>';
    h += '<div class="pr-srow"><span class="small">移動</span><button class="daw-ced-c" data-roll="pm:-960">−1拍</button><button class="daw-ced-c" data-roll="pm:960">＋1拍</button><button class="daw-ced-c" data-roll="pm:-240">−1/16</button><button class="daw-ced-c" data-roll="pm:240">＋1/16</button></div>';
    h += '<div class="pr-srow"><span class="small">長さ</span>' + STEP_LENS.map(function (L2) { return '<button class="daw-ced-c" data-roll="pl:' + L2[0] + '">' + L2[1] + '</button>'; }).join("") + '</div>';
    h += '<div class="pr-srow"><span class="small">強さ</span><button class="daw-ced-c" data-roll="pv:0.5">弱</button><button class="daw-ced-c" data-roll="pv:0.75">中</button><button class="daw-ced-c" data-roll="pv:1">強</button><button class="daw-ced-c" data-roll="pva:-0.1">−</button><button class="daw-ced-c" data-roll="pva:0.1">＋</button></div>';
    return h + (r.pmsg ? '<p class="small">' + r.pmsg + '</p>' : '') + '<p class="small">どれも ↶ で戻せます。スケール▲▼ は、曲のキーのスケールの音だけを数えて動かします（選んだときだけ）。</p></div>';
  }
  // ボタン → true
  function phrAct(v, f, root) {
    var r = st.roll, c = f.clip, p = project(), M = DM(), m, res = null, snap;
    function did(x, msg) { if (x.ok) { pushUndo(snap); markDirty(); r.pmsg = msg; } else { r.pmsg = "&#x26A0;&#xFE0F; " + escHtml(x.why); } }
    if (v === "phr") { r.phr = !r.phr; r.pmsg = ""; return true; }
    if (!r.phr) { return false; }
    if (v === "pall") { r.ms = c.notes.slice(); r.pmsg = ""; return true; }
    if (v === "pnone") { r.ms = []; r.pick = false; return true; }
    if (v === "ppick") { r.pick = !r.pick; return true; }
    if (v === "pbars") { var ia = root.querySelector(".pr-pa"), ib = root.querySelector(".pr-pb"); r.pa = Math.round(Number(ia && ia.value)) || 1; r.pb = Math.round(Number(ib && ib.value)) || r.pa; r.pmsg = phrSelBars(p, c, r.pa, r.pb) + " 音を選びました（" + r.pa + "〜" + r.pb + " 小節）"; return true; }
    if (v === "pcopy") { res = phrCopy(p, c, f.track); r.pmsg = res.ok ? res.n + " 音をコピーしました（" + res.bars + " 小節）。貼り付け先を選んでください" : "&#x26A0;&#xFE0F; " + escHtml(res.why); return true; }
    if (v === "pdup" || v === "ppaste") {
      if (v === "pdup") { res = phrCopy(p, c, f.track); if (!res.ok) { r.pmsg = "&#x26A0;&#xFE0F; " + escHtml(res.why); return true; } }
      var at, sel = root.querySelector(".pr-pto"), mode = (root.querySelector(".pr-pmode") || {}).value || "replace", L = M.sectionsOf(p);
      if (v === "pdup") { at = M.barToTick(p, st.clip2.bar0) + st.clip2.span; mode = "replace"; }
      else if (sel && /^s\d+$/.test(sel.value) && L[Number(sel.value.substring(1))]) { at = L[Number(sel.value.substring(1))].tick; }
      else { var ib2 = root.querySelector(".pr-pbar"); r.pbar = Math.max(1, Math.round(Number(ib2 && ib2.value)) || 1); at = M.barToTick(p, r.pbar - 1); }
      snap = xmHost.snapAll ? xmHost.snapAll() : snapTracks();
      res = phrPaste(p, f.track, at, st.clip2, mode);
      if (res.ok && !res.added) { res = { ok: false, why: "入れられる音がありませんでした（その場所にクリップがない・終わりをこえる）" }; }
      if (res.ok) { r.ms = (res.notes || []).filter(function (x) { return x.c === c; }).map(function (x) { return x.n; }); } // 貼り付けた音を選んでおく（最後の数音だけ変えやすく）
      did(res, res.ok ? res.added + " 音を " + M.tickToBar(p, at).bar + " 小節目から" + (v === "pdup" ? "複製" : "貼り付け") + "ました" + (res.removed ? "（置きかえた音 " + res.removed + "）" : "") + (res.dropped ? "・クリップの外の " + res.dropped + " 音は入れていません" : "") + (res.trimmed ? "・同じ高さの重なり " + res.trimmed + " か所を切りました" : "") + (res.meterWarn ? "・&#x26A0;&#xFE0F; 拍子がちがう小節にかかります（位置は tick のまま）" : "") + "（元の音符はそのまま・↶ で戻せます）" : "");
      return true;
    }
    snap = snapTracks();
    if ((m = /^pt:(-?\d+)$/.exec(v))) { res = phrTranspose(p, c, Number(m[1]), 0); did(res, res.ok ? res.n + " 音を " + (Number(m[1]) > 0 ? "＋" : "") + m[1] + " 半音" : ""); return true; }
    if ((m = /^pd:(-?\d+)$/.exec(v))) { res = phrTranspose(p, c, 0, Number(m[1])); did(res, res.ok ? res.n + " 音をスケールに沿って " + (Number(m[1]) > 0 ? "上" : "下") + "へ 1 度" : ""); return true; }
    if ((m = /^pm:(-?\d+)$/.exec(v))) { res = phrMove(c, Number(m[1])); did(res, res.ok ? res.n + " 音を動かしました" : ""); return true; }
    if ((m = /^pl:(\d+)$/.exec(v))) { res = phrLen(c, Number(m[1])); did(res, res.ok ? res.n + " 音の長さをそろえました" : ""); return true; }
    if ((m = /^pv:([\d.]+)$/.exec(v))) { res = phrVel(c, Number(m[1]), false); did(res, res.ok ? res.n + " 音の強さをそろえました" : ""); return true; }
    if ((m = /^pva:(-?[\d.]+)$/.exec(v))) { res = phrVel(c, Number(m[1]), true); did(res, res.ok ? res.n + " 音の強さを変えました" : ""); return true; }
    return false;
  }
  // ---------- §345 A27 演奏の表情（ピアノロール・ステップ入力の 🎭）----------
  // st.humUI ＝ { pre, amt, seed, msg }（パネルの選び中・曲は変えない）。トラックに使う ＝ t.ext.hum（元の音符は変えない・外せる）／書きこむ ＝ 選んだ音符を書きかえる。どれも ↶ で戻せる
  function humName(h) { var P = h ? DM().HUM_PRESETS[h.pre] : null; return P ? P.name + "（" + P.en + "）" + h.amt + "%" : "なし"; }
  function humUI(t) { if (!st.humUI) { var h0 = DM().humOf(t); st.humUI = { pre: h0 ? h0.pre : "natural", amt: h0 ? h0.amt : 50, seed: h0 ? h0.seed : 1, msg: "" }; } return st.humUI; }
  function humSel(f) { return st.roll && st.roll.clip === f.clip.id && st.roll.ms ? st.roll.ms.filter(function (n) { return f.clip.notes.indexOf(n) >= 0; }) : []; }
  function humHtml(p, f, at) {
    var M = DM(), t = f.track, u = humUI(t), cur = M.humOf(t), sel = humSel(f), drum = M.isDrum(t), pv = pl && pl.clip === f.clip.id && pl.opts && pl.opts.hum ? (pl.opts.hum[t.id] ? "B" : "A") : "";
    function b(v, label, on, extra) { return '<button class="daw-ced-c' + (on ? ' on' : '') + '" ' + at + '="' + v + '"' + (extra || '') + '>' + label + '</button>'; }
    var h = '<div class="pr-step pr-hum"><div class="pr-srow"><b>&#x1F3AD; 演奏の表情</b> <span class="small">このトラック: <b>' + escHtml(humName(cur)) + '</b></span></div>';
    h += '<div class="pr-srow">' + M.HUM_ORDER.map(function (k) { var P = M.HUM_PRESETS[k]; return b("hmp:" + k, escHtml(P.name), u.pre === k, ' title="' + P.en + '"'); }).join("") + '</div>';
    h += '<div class="pr-srow"><span class="small">量 <b>' + u.amt + '%</b></span>' + b("hma:-10", "−") + [25, 50, 75, 100].map(function (a) { return b("hma=" + a, a + "%", u.amt === a); }).join("") + b("hma:10", "＋") + '<span class="small">ゆらぎ #' + u.seed + '</span>' + b("hmseed", "&#x1F3B2; 別のゆらぎ") + '</div>';
    h += '<div class="pr-srow">' + b("hmA", "&#x25B6;&#xFE0F; A（元のまま）", pv === "A") + b("hmB", "&#x25B6;&#xFE0F; B（表情つき）", pv === "B") + '<span class="small">このクリップをくり返し・曲は変えません</span></div>';
    h += '<div class="pr-srow">' + b("hmuse", "&#x2705; このトラックに使う") + (cur ? b("hmoff", "外す") : '') + (drum ? '' : b("hmwrite", sel.length ? "&#x270D;&#xFE0F; 選んだ " + sel.length + " 音に書きこむ" : "&#x270D;&#xFE0F; このクリップの音符に書きこむ")) + '</div>';
    return h + (u.msg ? '<p class="small">' + u.msg + '</p>' : '') + '<p class="small">強さのゆらぎ・拍のアクセント（小節の頭を強く）・位置と長さの小さなずれをつけます。同じ設定とゆらぎの番号なら、いつも同じ結果です。「使う」は元の音符を変えず（再生・WAV・ステム・MIDI に入る・あとで外せる）、「書きこむ」は音符そのものを直します（' + (drum ? '' : '✂️ で選んだ音だけ・') + 'どちらも ↶ で戻せます）。和音はくずさず、音の高さは変えません。</p></div>';
  }
  // ボタン → true（描きなおす）
  function humAct(v, f) {
    var M = DM(), t = f.track, c = f.clip, u = humUI(t), m, snap;
    if (v === "hum") { st.humOpen = !st.humOpen; st.humUI = null; return true; }
    if (!st.humOpen || !v || v.indexOf("hm") !== 0) { return false; }
    function pv(on) { var o = {}; o[t.id] = on ? { pre: u.pre, amt: u.amt, seed: u.seed } : null; startPlay({ clip: c.id, a: c.start, b: c.start + c.len, loop: true, hum: o }); }
    if ((m = /^hmp:(\w+)$/.exec(v)) && M.HUM_PRESETS[m[1]]) { u.pre = m[1]; u.msg = ""; if (pl && pl.opts && pl.opts.hum && pl.opts.hum[t.id]) { pv(true); } return true; }
    if ((m = /^hma([:=])(-?\d+)$/.exec(v))) { u.amt = Math.max(0, Math.min(100, m[1] === "=" ? Number(m[2]) : u.amt + Number(m[2]))); u.msg = ""; if (pl && pl.opts && pl.opts.hum && pl.opts.hum[t.id]) { pv(true); } return true; }
    if (v === "hmseed") { u.seed = u.seed % 9999 + 1; u.msg = ""; if (pl && pl.opts && pl.opts.hum && pl.opts.hum[t.id]) { pv(true); } return true; }
    if (v === "hmA" || v === "hmB") { pv(v === "hmB"); return true; }
    if (v === "hmuse") {
      if (!(u.amt > 0)) { u.msg = "&#x26A0;&#xFE0F; 量が 0% です（外すときは「外す」）"; return true; }
      snap = snapTracks(); t.ext = t.ext || {}; t.ext.hum = { pre: u.pre, amt: u.amt, seed: u.seed }; pushUndo(snap); markDirty(); humResync();
      u.msg = "「" + escHtml(t.name) + "」に " + escHtml(humName(M.humOf(t))) + " を使いました（元の音符はそのまま・↶ で戻せます）"; return true;
    }
    if (v === "hmoff") { if (!t.ext || !t.ext.hum) { return true; } snap = snapTracks(); delete t.ext.hum; pushUndo(snap); markDirty(); humResync(); u.msg = "表情を外しました（↶ で戻せます）"; return true; }
    if (v === "hmwrite") {
      if (M.isDrum(t)) { return true; }
      if (!(u.amt > 0)) { u.msg = "&#x26A0;&#xFE0F; 量が 0% です"; return true; }
      var sel = humSel(f); snap = snapTracks();
      var n = M.humWrite(project(), t, c, { pre: u.pre, amt: u.amt, seed: u.seed }, sel.length ? sel : null);
      if (!n) { u.msg = "&#x26A0;&#xFE0F; 書きこめる音符がありません"; return true; }
      pushUndo(snap); markDirty(); humResync();
      u.msg = n + " 音に書きこみました（↶ で戻せます）" + (M.humOf(t) ? "。&#x26A0;&#xFE0F; このトラックには表情も使っているので、再生では 2 重にかかります（外すこともできます）" : ""); return true;
    }
    return false;
  }
  function rollHtml(p, f) {
    var M = DM(), c = f.clip, t = f.track, r = st.roll, o = c.offset || 0, PPQ = M.PPQ, i, m;
    var W = Math.round(c.len / PPQ * RB), H = (HI - LO + 1) * RH, m0 = M.meterAt(p, c.start), barPx = Math.round(M.ticksPerBar(m0) / PPQ * RB), snapPx = Math.max(4, Math.round(r.snap / PPQ * RB));
    var playing = !!(pl && pl.clip === c.id), sopt = "", asOn = rollAssistOn(), as = asOn || stepOn() ? rollAssist(p, f) : null; // §345 A23
    for (i = 0; i < SNAPS.length; i++) { sopt += '<option value="' + SNAPS[i][0] + '"' + (SNAPS[i][0] === r.snap ? " selected" : "") + '>' + SNAPS[i][1] + '</option>'; }
    var h = '<div class="daw pr">' +
      '<div class="daw-top"><button class="modal-btn daw-small" data-roll="back">&#x2190; もどる</button><b>&#x270F;&#xFE0F; ' + escHtml((c.ext && c.ext.name) || "クリップ") + '</b>' +
      '<span class="daw-pname">' + ((t.ext && t.ext.icon) || "&#x1F3B5;") + ' ' + escHtml(t.name) + '・' + instName(t) + '</span></div>' +
      projBarHtml(p) +
      '<div class="daw-transport">' +
        '<button class="modal-btn daw-tbtn' + (playing ? " daw-on" : "") + '" data-roll="play" title="このクリップだけ鳴らす（くり返し）">&#x25B6;&#xFE0F;</button>' +
        '<button class="modal-btn daw-tbtn" data-roll="stop" title="停止">&#x23F9;&#xFE0F;</button>' +
        '<button class="modal-btn daw-tbtn" data-roll="undo" title="戻す"' + (r.undo.length ? '' : ' disabled') + '>&#x21B6;<small>' + (r.undo.length || '') + '</small></button>' +
        '<button class="modal-btn daw-tbtn" data-roll="redo" title="やりなおし"' + (st.redo.length ? '' : ' disabled') + '>&#x21B7;<small>' + (st.redo.length || '') + '</small></button>' + // §345 A27
        '<button class="modal-btn daw-tbtn" data-roll="del" title="選んだ音符を消す"' + (r.sel ? '' : ' disabled') + '>&#x1F5D1;&#xFE0F;</button>' +
        '<label class="pr-snap">グリッド <select data-roll-snap="1" aria-label="グリッド">' + sopt + '</select></label>' +
        '<span class="pr-oct"><button class="modal-btn daw-tbtn" data-roll="up" title="1 オクターブ上へ">&#x25B2;</button><button class="modal-btn daw-tbtn" data-roll="down" title="1 オクターブ下へ">&#x25BC;</button></span>' +
        '<button class="modal-btn daw-tbtn' + (asOn ? ' daw-on' : '') + '" data-roll="assist" title="コード・スケールの補助（' + (asOn ? 'ON' : 'OFF') + '）" aria-label="コードとスケールの補助">&#x1F3BC;</button>' + // §345 A23
        '<button class="modal-btn daw-tbtn' + (stepOn() ? ' daw-on' : '') + '" data-roll="step" title="ステップ入力" aria-label="ステップ入力">&#x270D;&#xFE0F;</button>' +
        '<button class="modal-btn daw-tbtn' + (r.phr ? ' daw-on' : '') + '" data-roll="phr" title="フレーズ（範囲・コピー・移調など）" aria-label="フレーズの道具">&#x2702;&#xFE0F;</button>' + // §345 A24
        '<button class="modal-btn daw-tbtn' + (st.humOpen ? ' daw-on' : '') + (DM().humOf(t) ? ' daw-hum' : '') + '" data-roll="hum" title="演奏の表情（ヒューマナイズ）" aria-label="演奏の表情">&#x1F3AD;</button>' + // §345 A27
      '</div>' +
      '<div class="pr-wrap"><div class="pr-inner" style="width:' + (KEYW + W) + 'px;height:' + H + 'px;">' + (asOn && as ? assistBarHtml(as, W) : '') +
      '<div class="pr-keys" style="width:' + KEYW + 'px;height:' + H + 'px;">';
    for (m = HI; m >= LO; m--) {
      var bk = BLACK.indexOf(m % 12) >= 0;
      h += '<div class="pr-key' + (bk ? " pr-black" : "") + (m % 12 === 0 ? " pr-c" : "") + (asOn && as && as.range && (m < as.range[0] || m > as.range[1]) ? " pr-oor" : "") + '" style="top:' + (HI - m) * RH + 'px;height:' + RH + 'px;line-height:' + RH + 'px;">' + noteName(m) + '</div>';
    }
    h += '</div><div class="pr-grid" style="width:' + W + 'px;height:' + H + 'px;background-size:' + barPx + 'px 100%,' + RB + 'px 100%,' + snapPx + 'px 100%,100% ' + RH + 'px;">';
    for (m = HI; m >= LO; m--) { if (BLACK.indexOf(m % 12) >= 0) { h += '<i class="pr-rowb" style="top:' + (HI - m) * RH + 'px;height:' + RH + 'px;"></i>'; } }
    if (asOn && as) { h += assistGridHtml(as); } // §345 A23
    for (i = 0; i < c.notes.length; i++) {
      var n = c.notes[i];
      if (n[2] < LO || n[2] > HI) { continue; }
      var x = Math.round((n[0] - o) / PPQ * RB), w = Math.max(16, Math.round((n[1] > 0 ? n[1] : 240) / PPQ * RB) - 1), sel = n === r.sel;
      var nk = asOn && as ? noteKind(as, n) : "", inMs = r.ms && r.ms.indexOf(n) >= 0;
      h += '<div class="pr-note' + (sel ? " pr-sel" : "") + (inMs ? " pr-ms" : "") + (n[1] > 0 ? "" : " pr-zero") + (nk ? " pr-k-" + nk : "") + '" data-n="' + i + '" style="left:' + x + 'px;top:' + ((HI - n[2]) * RH + 2) + 'px;width:' + w + 'px;height:' + (RH - 4) + 'px;">' +
        (sel ? '<i class="pr-handle" data-h="' + i + '"></i>' : '') + '</div>';
    }
    h += '<div class="pr-playhead" style="display:none;"></div></div></div></div>';
    if (stepOn()) { h += stepHtml(p, f, as); } // §345 A23
    if (r.phr) { h += phrHtml(p, f); } // §345 A24
    if (st.humOpen) { h += humHtml(p, f, "data-roll"); } // §345 A27
    if (asOn && as) { h += '<p class="small pr-legend"><i class="pr-lg pr-lg-rt"></i>ルート <i class="pr-lg pr-lg-ct"></i>コードの音 <i class="pr-lg pr-lg-sc"></i>スケールの音 <i class="pr-lg pr-lg-out"></i>それ以外（半音・経過音も使ってよい）' + (as.range ? '・点線の中 ＝ 歌の目安の音域' : '') + (as.key === null ? '・曲のキーがないのでスケールは出していません' : '') + '</p>'; }
    h += (st.msg ? '<div class="daw-msg">&#x26A0;&#xFE0F; ' + escHtml(st.msg) + '</div>' : '') + '<div class="daw-info">' + rollInfo(p, f) + '</div>' +
      '<p class="small pr-help">空いた所をタップ ＝ 音符を足す ／ 音符をドラッグ ＝ 高さと位置 ／ 選んだ音符の右はしをドラッグ ＝ 長さ ／ 選んで &#x1F5D1;&#xFE0F; ＝ 消す ／ &#x21B6; ＝ 戻す ／ 空いた所をスワイプ ＝ スクロール</p></div>';
    return h;
  }
  function rollInfo(p, f) {
    var M = DM(), n = st.roll.sel, c = f.clip;
    if (n && c.notes.indexOf(n) >= 0) {
      var b = M.tickToBar(p, c.start + n[0] - (c.offset || 0));
      return '&#x1F3B5; <b>' + noteName(n[2]) + '</b>・' + b.bar + '小節目 ' + b.beat + '拍' + (b.sub ? '（＋' + b.sub + '）' : '') + '・長さ ' + (n[1] > 0 ? Math.round(n[1] / M.PPQ * 1000) / 1000 + '拍' : 'なし（自然に消える）') + '・強さ ' + n[3];
    }
    return '<span class="small">音符 ' + c.notes.length + ' 個・' + Math.round(c.len / M.ticksPerBar(M.meterAt(p, c.start)) * 100) / 100 + ' 小節。音符をタップすると選べます。</span>';
  }
  function renderRoll(root, ctl) {
    var p = project(), f = rollClip();
    if (!f) { closeRoll(); render(root, ctl); return; }
    var r = st.roll;
    root.innerHTML = rollHtml(p, f);
    var wrap = root.querySelector && root.querySelector(".pr-wrap");
    if (wrap) {
      if (r.init) {
        // はじめて開いた: 音符のまん中の高さが見えるように
        var c = f.clip, lo = 127, hi = 0, i;
        for (i = 0; i < c.notes.length; i++) { lo = Math.min(lo, c.notes[i][2]); hi = Math.max(hi, c.notes[i][2]); }
        var mid = c.notes.length ? (lo + hi) / 2 : 60;
        r.sy = Math.max(0, (HI - mid) * RH - (wrap.clientHeight || 300) / 2);
        r.sx = 0; r.init = false;
      }
      try { wrap.scrollTop = r.sy; wrap.scrollLeft = r.sx; } catch (e) {}
    }
    bindRoll(root, ctl, f);
    drawHead();
  }
  function bindRoll(root, ctl, f) {
    if (!root.querySelectorAll) { return; }
    var r = st.roll, M = DM(), c = f.clip, o = c.offset || 0, PPQ = M.PPQ;
    var wrap = root.querySelector(".pr-wrap"), grid = root.querySelector(".pr-grid");
    function keep() { if (wrap) { r.sx = wrap.scrollLeft; r.sy = wrap.scrollTop; } }
    var btns = root.querySelectorAll("button"), k;
    for (k = 0; k < btns.length; k++) {
      btns[k].onclick = function (ev) {
        var v = ev.currentTarget.getAttribute("data-roll");
        keep();
        if (v === "back") { closeRoll(); render(root, ctl); return; }
        if (v === "play") { startPlay({ clip: c.id, a: c.start, b: c.start + c.len, loop: true }); rerender(); return; }
        if (v === "stop") { transportStop(); rerender(); return; }
        if (v === "undo") { edit.undo(); return; }
        if (v === "redo") { edit.redo(); return; } // §345 A27
        if (v === "del") { edit.del(); return; }
        if (v && humAct(v, f)) { rerender(); return; } // §345 A27
        if (v === "assist") { st.rollAssist = !rollAssistOn(); rerender(); return; } // §345 A23
        if (v && phrAct(v, f, root)) { rerender(); return; } // §345 A24
        if (v && stepAct(v, f)) { rerender(); return; }
        if (v === "up" || v === "down") { if (wrap) { wrap.scrollTop += (v === "up" ? -12 : 12) * RH; keep(); } }
      };
    }
    bindProjBar(root, ctl);
    var ss = root.querySelector("select[data-roll-snap]");
    if (ss) { ss.onchange = function () { keep(); r.snap = st.rollSnap = Number(ss.value) || 480; rerender(); }; }
    if (wrap) { wrap.onscroll = keep; }
    if (!grid || !grid.addEventListener) { return; }
    var drag = null;
    function noteOf(el) { while (el && el !== grid) { if (el.getAttribute && el.getAttribute("data-n") !== null) { return el; } el = el.parentNode; } return null; }
    grid.addEventListener("pointerdown", function (e) {
      if (e.button) { return; }
      keep();
      var hEl = e.target && e.target.getAttribute ? e.target.getAttribute("data-h") : null, nEl = noteOf(e.target);
      if (nEl) {
        var n = c.notes[Number(nEl.getAttribute("data-n"))];
        if (!n) { return; }
        if (r.phr && r.pick) { var mi = phrMs(c).indexOf(n); if (mi >= 0) { r.ms.splice(mi, 1); } else { r.ms.push(n); } rerender(); if (e.preventDefault) { e.preventDefault(); } return; } // §345 A24: タップで選ぶ
        if (r.sel !== n) { var prev = grid.querySelector(".pr-sel"); if (prev) { prev.className = prev.className.replace(" pr-sel", ""); } nEl.className += " pr-sel"; r.sel = n; }
        drag = { kind: hEl !== null ? "len" : "move", n: n, el: nEl, x0: e.clientX, y0: e.clientY, t0: n[0], m0: n[2], d0: n[1] > 0 ? n[1] : 240, snap: snapTracks(), moved: false, nt: n[0], nm: n[2], nd: n[1] };
        try { grid.setPointerCapture(e.pointerId); } catch (e2) {}
        if (e.preventDefault) { e.preventDefault(); }
        return;
      }
      drag = { kind: "tap", x0: e.clientX, y0: e.clientY, sl: wrap ? wrap.scrollLeft : 0, st: wrap ? wrap.scrollTop : 0, moved: false };
    });
    grid.addEventListener("pointermove", function (e) {
      if (!drag) { return; }
      var dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) { drag.moved = true; }
      if (drag.kind === "move" && drag.moved) {
        var d = drag.n[1], nt = drag.t0 + M.snap(dx / RB * PPQ, r.snap), nm = Math.max(LO, Math.min(HI, drag.m0 - Math.round(dy / RH)));
        nt = Math.max(o, Math.min(nt, o + c.len - Math.max(1, d)));
        drag.nt = nt; drag.nm = nm;
        drag.el.style.left = Math.round((nt - o) / PPQ * RB) + "px";
        drag.el.style.top = ((HI - nm) * RH + 2) + "px";
      } else if (drag.kind === "len" && drag.moved) {
        var end = M.snap(drag.t0 + drag.d0 + dx / RB * PPQ, r.snap), nd = Math.max(r.snap, end - drag.t0);
        nd = Math.min(nd, o + c.len - drag.t0);
        drag.nd = nd;
        drag.el.style.width = Math.max(16, Math.round(nd / PPQ * RB) - 1) + "px";
      }
    });
    function end(e, cancel) {
      var d0 = drag; drag = null;
      if (!d0) { return; }
      keep();
      if (cancel) { if (d0.kind !== "tap") { rerender(); } return; }
      if (d0.kind === "tap") {
        var scrolled = wrap && (Math.abs(wrap.scrollLeft - d0.sl) > 2 || Math.abs(wrap.scrollTop - d0.st) > 2);
        if (d0.moved || scrolled) { return; }
        var rc = grid.getBoundingClientRect(), x = e.clientX - rc.left, y = e.clientY - rc.top;
        edit.add(o + M.snap(x / RB * PPQ, r.snap, true), HI - Math.floor(y / RH));
        return;
      }
      if (d0.kind === "move") { if (d0.moved) { edit.set(d0.n, { t: d0.nt, m: d0.nm }, d0.snap); } else { rerender(); } return; }
      if (d0.moved) { edit.set(d0.n, { d: d0.nd }, d0.snap); } else { rerender(); }
    }
    grid.addEventListener("pointerup", function (e) { end(e, false); });
    grid.addEventListener("pointercancel", function (e) { end(e, true); });
  }

  // ---------- §341 9A-7: 16 ステップ（ドラムのパターン）----------
  var DS_CW = 34, DS_LW = 72;
  function openEditor(id) {
    var f = DM().findClip(project(), id);
    if (!f) { return false; }
    if (f.clip.type === "audio") { return openAedit(id); } // 9A-13: オーディオ ＝ ✂️ 編集
    if (DM().isDrum(f.track)) { st.humUI = null; st.view = "steps"; st.sel = { kind: "clip", id: id }; st.steps = { clip: id, track: f.track.id, sx: 0, mode: "tap", pick: null }; return true; }
    return openRoll(id);
  }
  var steps = {
    // マスを切りかえる（↶ に積む・自動保存。再生は止めない ＝ 先読みの 0.12 秒より先から反映）
    toggle: function (m, step) {
      var f = st.steps ? DM().findClip(project(), st.steps.clip) : null;
      if (!f) { return null; }
      var snap = snapTracks(), on = DM().toggleStep(f.clip, m, step);
      if (on === null) { return null; }
      pushUndo(snap); markDirty();
      if (on && !pl) { hear(m, DM().DRUM_V); }
      return on;
    },
    // 9A-8: 強さ（ON のマスだけ。↶ に積む・自動保存）
    pick: function (m, step) { var f = st.steps ? DM().findClip(project(), st.steps.clip) : null; if (!f || !DM().findStep(f.clip, m, step)) { st.steps.pick = null; return false; } st.steps.pick = { m: m, step: step }; return true; },
    setVel: function (v) {
      var sp = st.steps && st.steps.pick, f = sp ? DM().findClip(project(), st.steps.clip) : null, n = f ? DM().findStep(f.clip, sp.m, sp.step) : null;
      if (!n) { return null; }
      var nv = Math.round(Math.max(0.05, Math.min(1, Number(v) || DM().DRUM_V)) * 1000) / 1000;
      if (nv === n[3]) { return n[3]; }
      var snap = snapTracks(); DM().setStepVel(f.clip, sp.m, sp.step, nv); pushUndo(snap); markDirty();
      if (!pl) { hear(sp.m, nv); }
      return nv;
    },
    // 9A-8: スイング（トラックの ext.swing・0〜100）。snap ＝ 動かしはじめる前の写し（指をはなしたとき 1 回だけ ↶ に積む）
    setSwing: function (v, snap) {
      var t = st.steps ? DM().findTrack(project(), st.steps.track) : null;
      if (!t) { return null; }
      var nv = Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
      if ((t.ext && t.ext.swing || 0) === nv) { return nv; }
      if (snap !== false) { pushUndo(snap || snapTracks()); }
      t.ext = t.ext || {}; t.ext.swing = nv;
      if (snap !== false) { markDirty(); }
      return nv;
    },
    pattern: function (id) {
      var f = st.steps ? DM().findClip(project(), st.steps.clip) : null;
      if (!f || !DM().PATTERNS[id]) { return false; }
      var snap = snapTracks();
      DM().applyPattern(f.clip, id); pushUndo(snap); markDirty(); st.steps.pick = null;
      return true;
    },
    mode: function (m) { if (st.steps) { st.steps.mode = m === "vel" ? "vel" : "tap"; st.steps.pick = null; } }
  };
  function hear(m, v) { var UG = window.UGMelody; try { var ac = UG.audioInit(); if (ac && UG.drum) { UG.drum(ac, m, ac.currentTime + 0.01, v, (UG.audio && UG.audio.bus) || ac.destination); } } catch (e) {} }
  // §342 9B-3: 16 ステップの行 ＝ いつもの 5 つ ＋ そのクリップにある、ほかの楽器（ゴリラドラムから取りこんだ音など）
  var STEP_MORE = [37, 47, 48, 45, 43, 49, 51, 53, 44, 23, 21, 24, 22];
  function stepRows(c) {
    var M = DM(), kit = M.DRUM_KIT.slice(), have = {}, i;
    for (i = 0; i < kit.length; i++) { have[kit[i][0]] = true; }
    var inClip = {}; for (i = 0; c && i < c.notes.length; i++) { inClip[c.notes[i][2]] = true; }
    for (i = 0; i < STEP_MORE.length; i++) { if (inClip[STEP_MORE[i]] && !have[STEP_MORE[i]]) { kit.push([STEP_MORE[i], M.drumName(STEP_MORE[i])]); have[STEP_MORE[i]] = true; } }
    for (var k in inClip) { if (inClip.hasOwnProperty(k) && !have[k]) { kit.push([Number(k), M.drumName(Number(k)) || ("番号 " + k)]); have[k] = true; } }
    return kit;
  }
  function stepsHtml(p, f) {
    var M = DM(), c = f.clip, t = f.track, n = M.stepCount(c), kit = stepRows(c), i, j, h;
    var playing = !!(pl && pl.clip === c.id);
    h = '<div class="daw ds">' +
      '<div class="daw-top"><button class="modal-btn daw-small" data-sq="back">&#x2190; もどる</button><b>&#x1F941; ' + escHtml(clipLabel(c)) + '</b><span class="daw-pname">' + escHtml(t.name) + '</span></div>' +
      projBarHtml(p) +
      '<div class="daw-transport"><button class="modal-btn daw-tbtn' + (playing ? " daw-on" : "") + '" data-sq="play" title="このパターンをくり返し鳴らす">&#x25B6;&#xFE0F;</button>' +
        '<button class="modal-btn daw-tbtn" data-sq="stop" title="停止">&#x23F9;&#xFE0F;</button>' +
        '<button class="modal-btn daw-tbtn" data-sq="undo" title="戻す"' + (st.undo.length ? '' : ' disabled') + '>&#x21B6;<small>' + (st.undo.length || '') + '</small></button>' +
        '<button class="modal-btn daw-tbtn" data-sq="redo" title="やりなおし"' + (st.redo.length ? '' : ' disabled') + '>&#x21B7;<small>' + (st.redo.length || '') + '</small></button>' + // §345 A27
        '<button class="modal-btn daw-tbtn' + (st.humOpen ? ' daw-on' : '') + (M.humOf(t) ? ' daw-hum' : '') + '" data-sq="hum" title="演奏の表情（ヒューマナイズ）" aria-label="演奏の表情">&#x1F3AD;</button>' +
        '<span class="daw-pos">1.1</span><span class="small ds-bpm">BPM ' + M.bpmAt(p, 0) + '</span></div>' +
      '<div class="ds-tools"><span class="ds-seg"><button class="' + (st.steps.mode === "vel" ? "" : "on") + '" data-sq="modeTap">&#x270B; 打つ</button><button class="' + (st.steps.mode === "vel" ? "on" : "") + '" data-sq="modeVel">&#x1F4AA; 強さ</button></span>' +
        '<label class="ds-sw">スイング <input type="range" class="dm-fader ds-swing" min="0" max="100" step="1" value="' + M.swingOf(t) + '" aria-label="スイング"><b class="ds-swv">' + M.swingOf(t) + '%</b></label></div>' +
      '<div class="ds-wrap"><div class="ds-grid" style="width:' + (DS_LW + n * DS_CW) + 'px;">' +
      '<div class="ds-row ds-head"><div class="ds-lab"></div>';
    for (j = 0; j < n; j++) { h += '<div class="ds-num' + (j % 4 === 0 ? " ds-beat" : "") + (j % 16 === 0 && j ? " ds-bar" : "") + '">' + (j % 4 === 0 ? (j / 4 + 1) : '') + '</div>'; }
    h += '</div>';
    for (i = 0; i < kit.length; i++) {
      h += '<div class="ds-row"><div class="ds-lab">' + kit[i][1] + '</div>';
      for (j = 0; j < n; j++) {
        var nn = M.findStep(c, kit[i][0], j), on = !!nn, pk = st.steps.pick && st.steps.pick.m === kit[i][0] && st.steps.pick.step === j;
        h += '<button class="ds-cell' + (on ? " ds-on" : "") + (pk ? " ds-pick" : "") + (Math.floor(j / 4) % 2 ? " ds-alt" : "") + (j % 16 === 0 && j ? " ds-bar" : "") + '" data-st="' + j + '" data-m="' + kit[i][0] + '" aria-pressed="' + on + '" aria-label="' + kit[i][1] + ' ' + (j + 1) + (on ? ' 強さ ' + nn[3] : '') + '"' +
          (on ? ' style="--v:' + nn[3] + ';"><i class="ds-vel">' + Math.round(nn[3] * 100) + '</i></button>' : '></button>');
      }
      h += '</div>';
    }
    h += '<div class="ds-ph" style="display:none;left:' + DS_LW + 'px;width:' + DS_CW + 'px;"></div></div></div>';
    // 9A-8: 強さの欄は「打つ」のときも同じ高さで出す（モードを変えても箱の高さが変わらず、上のマスがずれない）
    if (st.steps.mode !== "vel") {
      h += '<div class="daw-info ds-velp"><div class="small">&#x1F4AA; 強さを変えるときは、上の「強さ」に切りかえて、ON のマスをタップして選びます。</div></div>';
    } else {
      var sp = st.steps.pick, pn = sp ? M.findStep(c, sp.m, sp.step) : null, kn = "";
      for (i = 0; sp && i < kit.length; i++) { if (kit[i][0] === sp.m) { kn = kit[i][1]; } }
      h += '<div class="daw-info ds-velp"><div>' + (pn ? '&#x1F4AA; <b>' + kn + '</b>・' + (Math.floor(sp.step / 4) + 1) + '拍目の ' + (sp.step % 4 + 1) + ' つ目：強さ <b class="ds-vnow">' + pn[3] + '</b>' : '<span class="small">ON のマス（色のついたマス）をタップして選ぶと、強さを変えられます。</span>') + '</div>' +
        '<div class="da-btns">' + [["0.3", "弱 0.3"], ["0.6", "中 0.6"], ["0.85", "標準 0.85"], ["1", "強 1.0"]].map(function (x) { return '<button class="modal-btn" data-vel="' + x[0] + '"' + (pn ? '' : ' disabled') + '>' + x[1] + '</button>'; }).join('') +
        '<button class="modal-btn da-half" data-vel="-"' + (pn ? '' : ' disabled') + '>&#x2212; 0.05</button><button class="modal-btn da-half" data-vel="+"' + (pn ? '' : ' disabled') + '>&#xFF0B; 0.05</button></div></div>';
    }
    if (st.humOpen) { h += humHtml(p, f, "data-sq"); } // §345 A27
    h += '<div class="ds-pats"><span class="small">パターン:</span><button class="modal-btn" data-pat="four">4 つ打ち</button><button class="modal-btn" data-pat="eight">8 ビート</button><button class="modal-btn" data-pat="sixteen">16 ビート</button><button class="modal-btn" data-pat="clear">消す</button></div>' +
      saveNoteHtml() +
      '<p class="small dsv-note">「打つ」: マスをタップ ＝ ON／OFF。「強さ」: ON のマスをタップして選び、下のボタンで強さ（色の高さと数字）。スイングは裏の 16 分を遅らせます（0% ＝ まっすぐ）。&#x25B6; でくり返し鳴らしながら直せます。1 マス ＝ 16 分音符。</p></div>';
    return h;
  }
  function renderSteps(root, ctl) {
    var p = project(), f = st.steps ? DM().findClip(p, st.steps.clip) : null;
    if (!f) { st.view = "arr"; st.steps = null; render(root, ctl); return; }
    root.innerHTML = stepsHtml(p, f);
    if (!root.querySelectorAll) { return; }
    var wrap = root.querySelector(".ds-wrap");
    if (wrap && st.steps.sx) { try { wrap.scrollLeft = st.steps.sx; } catch (e) {} }
    if (wrap) { wrap.onscroll = function () { if (st.steps) { st.steps.sx = wrap.scrollLeft; } }; }
    var els = root.querySelectorAll("button"), k;
    for (k = 0; k < els.length; k++) {
      els[k].onclick = function (ev) {
        var el = ev.currentTarget, v = el.getAttribute("data-sq"), stp = el.getAttribute("data-st"), c = f.clip;
        if (stp !== null && stp !== undefined && el.getAttribute("data-m")) {
          if (st.steps.mode === "vel") { steps.pick(Number(el.getAttribute("data-m")), Number(stp)); } else { steps.toggle(Number(el.getAttribute("data-m")), Number(stp)); }
          renderSteps(root, ctl); return;
        }
        var vv = el.getAttribute("data-vel"), pt = el.getAttribute("data-pat");
        if (vv) {
          var sp0 = st.steps.pick, cn = sp0 ? DM().findStep(DM().findClip(project(), st.steps.clip).clip, sp0.m, sp0.step) : null;
          if (cn) { steps.setVel(vv === "+" ? cn[3] + 0.05 : (vv === "-" ? cn[3] - 0.05 : Number(vv))); }
          renderSteps(root, ctl); return;
        }
        if (pt) { steps.pattern(pt); renderSteps(root, ctl); return; }
        if (v === "modeTap" || v === "modeVel") { steps.mode(v === "modeVel" ? "vel" : "tap"); renderSteps(root, ctl); return; }
        if (v === "redo") { edit.redo(); return; } // §345 A27
        if (v && humAct(v, f)) { renderSteps(root, ctl); return; }
        if (v === "back") { if (pl && pl.clip) { stopPlay(false); } st.view = "arr"; st.steps = null; render(root, ctl); return; }
        if (v === "play") { startPlay({ clip: c.id, a: c.start, b: c.start + c.len, loop: true }); renderSteps(root, ctl); return; }
        if (v === "stop") { transportStop(); renderSteps(root, ctl); return; }
        if (v === "undo") { edit.undo(); return; }
      };
    }
    bindProjBar(root, ctl); // 9A-9: ほかのボタンのあとに付ける（前は上書きされて 📁 曲・曲名・💾 が効かなかった）
    var sw = root.querySelector(".ds-swing"), swv = root.querySelector(".ds-swv"), swSnap = null;
    if (sw) {
      sw.oninput = function () { if (!swSnap) { swSnap = snapTracks(); } steps.setSwing(sw.value, false); if (swv) { swv.textContent = Math.round(sw.value) + "%"; } };
      sw.onchange = function () { var before = swSnap; swSnap = null; if (before) { pushUndo(before); markDirty(); } renderSteps(root, ctl); };
    }
    drawHead();
  }


  // ---------- §341 9A-15: 素材ライブラリ（端末の素材の一覧・容量・参照・どこからも参照されていない素材だけを 1 つずつ削除）----------
  var lib = { loading: false, list: null, scan: null, est: null, msg: "", confirm: "", busy: false, chan: null, ack: false };
  // ほかのタブ（同じゲーム）への問いあわせ。BroadcastChannel が無ければ確かめられない（＝ 削除しない）
  var libChan = { ch: null, id: "", pongs: 0 };
  function libChanInit() {
    libChan.ch = null; libChan.id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    try {
      if (window.BroadcastChannel) {
        var c = new window.BroadcastChannel("ultimate-gorilla-daw");
        c.onmessage = function (e) { var d = e && e.data || {}; if (d.t === "ping" && d.from !== libChan.id) { try { c.postMessage({ t: "pong", to: d.from, from: libChan.id }); } catch (e1) {} } else if (d.t === "pong" && d.to === libChan.id) { libChan.pongs++; } };
        libChan.ch = c;
      }
    } catch (e) { libChan.ch = null; }
  }
  libChanInit();
  // §341 9A-16: タブ間の排他（Web Locks）。ページを開いているあいだは共有ロック・削除のときだけ排他ロック（すぐ取れるときだけ）
  // state: off（Web Locks が無い）・wait（共有ロックを待っている ＝ ほかのタブが削除中）・held（共有を持っている）・swap（排他に持ちかえ中）・excl（排他を持っている）
  var LOCK_NAME = "ultimate-gorilla-daw-assets", lk = { state: "off", rel: null, done: null, gen: 0 };
  function lockApi() { var n = window.navigator; return n && n.locks && typeof n.locks.request === "function" && typeof Promise === "function" ? n.locks : null; }
  function lockShared(onHeld) {
    var L = lockApi(), g = ++lk.gen, fired = false;
    function fire() { if (!fired && onHeld) { fired = true; onHeld(); } }
    lk.rel = null;
    if (!L) { lk.state = "off"; fire(); return; }
    lk.state = "wait";
    try {
      lk.done = L.request(LOCK_NAME, { mode: "shared" }, function () {
        if (lk.gen !== g) { return null; } // あとから取りなおした（古い要求はすぐ放す）
        lk.state = "held"; fire();
        return new Promise(function (res) { lk.rel = res; });
      });
      lk.done.then(null, function () { if (lk.gen === g) { lk.state = "off"; } fire(); });
    } catch (e) { lk.state = "off"; lk.done = null; fire(); }
    if (onHeld) { setTimeout(fire, 3000); } // ほかのタブが排他を持ちつづけても、返事は返す
  }
  lockShared();
  if (window.addEventListener) { window.addEventListener("pageshow", function (e) { if (e && e.persisted && lk.state !== "held" && lk.state !== "swap" && lk.state !== "excl") { lockShared(); } }); } // 戻る・進むのキャッシュから戻った
  // 素材の参照を足す処理（WAV の読みこみ・録音・ZIP の復元）を始めてよいか → "" / 理由
  function assetAddWhy() {
    if (lib.busy) { return "素材を削除しているあいだは、音声を足せません（少し待ってから）"; }
    if (lk.state === "wait") { return "ほかのタブで素材を削除しているところです。少し待ってから、もう一度ためしてください"; }
    return "";
  }
  // 自分の共有ロックを放して、排他ロックをすぐ取れるときだけ取る → fn(done)・done(結果)。cb(結果 / 理由の文字) は共有ロックを取りなおしてから
  function lockExclusive(fn, cb) {
    var L = lockApi(), NOT = "タブ間の排他ロックを取れませんでした（削除はしません）";
    if (!L) { cb("このブラウザはタブ間の排他（Web Locks）に対応していないので、削除はできません"); return; }
    if (lk.state !== "held" || !lk.rel) { cb(lk.state === "wait" ? "ほかのタブで素材を削除しているところです（少し待ってから）" : "タブ間の排他の準備ができていません（少し待ってから、もう一度ためしてください）"); return; }
    var d = lk.done, r = lk.rel, g = ++lk.gen, got = false, res = null;
    lk.state = "swap"; lk.rel = null;
    r();
    function back(x) { if (lk.gen === g) { lockShared(function () { cb(x); }); } else { cb(x); } }
    d.then(function () {
      var pr;
      try {
        pr = L.request(LOCK_NAME, { mode: "exclusive", ifAvailable: true }, function (lock) {
          if (!lock) { return null; }
          got = true; lk.state = "excl";
          return new Promise(function (ok) { fn(function (x) { res = x; ok(); }); });
        });
      } catch (e) { back(NOT); return; }
      pr.then(function () { back(got ? res : "ほかのタブでもこのゲームが開いています。ほかのタブを閉じてから、もう一度ためしてください（まだ保存していない変更があるかもしれないため）"); }, function () { back(got ? res : NOT); });
    }, function () { back(NOT); });
  }
  function otherTabs(cb) {
    if (!libChan.ch) { cb(null); return; }
    libChan.pongs = 0;
    try { libChan.ch.postMessage({ t: "ping", from: libChan.id }); } catch (e) { cb(null); return; }
    setTimeout(function () { cb(libChan.pongs); }, LIB_PING_MS);
  }
  var LIB_PING_MS = 400;
  // IndexedDB の素材を全部（meta の値と blobs のキー）→ cb({ ok, meta, blobs, why })
  function idbAll(cb) {
    idbOpen(function (db, why) {
      if (!db) { cb({ ok: false, why: why || "IndexedDB が使えません" }); return; }
      var tx, m, b, done = false;
      function end(r) { if (!done) { done = true; cb(r); } }
      try { tx = db.transaction(["meta", "blobs"], "readonly"); m = tx.objectStore("meta").getAll(); b = tx.objectStore("blobs").getAllKeys(); } catch (e) { end({ ok: false, why: errName(e) }); return; }
      tx.oncomplete = function () { end({ ok: true, meta: m.result || [], blobs: b.result || [] }); };
      tx.onerror = function () { end({ ok: false, why: errName(tx.error) }); };
      tx.onabort = function () { end({ ok: false, why: errName(tx.error) }); };
    });
  }
  function idbDelete(id, cb) {
    idbOpen(function (db, why) {
      if (!db) { cb(why || "IndexedDB が使えません"); return; }
      var tx, done = false;
      function end(w) { if (!done) { done = true; cb(w); } }
      try { tx = db.transaction(["blobs", "meta"], "readwrite"); tx.objectStore("blobs").delete(id); tx.objectStore("meta").delete(id); } catch (e) { end(errName(e)); return; }
      tx.oncomplete = function () { end(""); };
      tx.onerror = function () { end(errName(tx.error)); };
      tx.onabort = function () { end(errName(tx.error) || "中止"); };
    });
  }
  // 曲 1 つが参照する素材（全部のクリップの asset・takes[].asset と、素材の一覧 assets）
  function songAssets(p) {
    var M = DM(), set = {}, i, j, k;
    for (i = 0; p && i < p.tracks.length; i++) { for (j = 0; j < p.tracks[i].clips.length; j++) { var l = M.clipAssets(p.tracks[i].clips[j]); for (k = 0; k < l.length; k++) { set[l[k]] = true; } } }
    for (i = 0; p && p.assets && i < p.assets.length; i++) { if (p.assets[i] && p.assets[i].id) { set[p.assets[i].id] = true; } }
    return set;
  }
  // 保存した全部の曲を調べる（削除はこれが ok のときだけ）→ { ok, why, raws（DAW の全部のキーの文字）, songs: { 素材 ID: [曲名…] }, nSongs }
  function libScan() {
    var M = DM(), pre = skey(), out = { ok: true, why: "", raws: [], songs: {}, nSongs: 0 }, ls = null, n = -1, i, k, keys = [];
    function bad(w) { if (out.ok) { out.ok = false; out.why = w; } }
    try { ls = window.localStorage; n = ls.length; } catch (e) { ls = null; }
    if (!ls || typeof n !== "number" || n < 0 || typeof ls.key !== "function") { bad("このブラウザでは保存した曲を全部は調べられないので、削除はできません"); return out; }
    try { for (i = 0; i < n; i++) { k = ls.key(i); if (k && k.indexOf(pre) === 0) { keys.push(k); } } } catch (e2) { bad("保存した曲を調べられませんでした（削除はできません）"); return out; }
    var idx = readIndex();
    if (!idx.ok) { bad((idx.why || "曲の一覧が読めません") + "。削除はできません"); }
    for (i = 0; i < keys.length; i++) {
      var v = lsRaw(keys[i]);
      if (v === undefined) { bad("保存を読めませんでした（削除はできません）"); continue; }
      out.raws.push(v || "");
      if (keys[i].indexOf(pre + ":p:") !== 0) { continue; }
      var r = M.parseRecordText(v);
      if (!r.ok) { bad("読めない保存曲があります（その曲が素材を使っているかもしれないので、削除はできません）"); continue; }
      out.nSongs++;
      var set = songAssets(r.project), id;
      for (id in set) { if (set.hasOwnProperty(id)) { (out.songs[id] = out.songs[id] || []).push({ id: keys[i].substring((pre + ":p:").length), name: r.project.name }); } }
    }
    if (idx.ok) { for (i = 0; i < idx.idx.list.length; i++) { var en = idx.idx.list[i]; if (en && en.id && keys.indexOf(pkey(en.id)) < 0) { bad("曲の一覧にあるのに見つからない曲があります（削除はできません）"); } } }
    return out;
  }
  // 素材 1 つの参照（raw ＝ 保存の文字のどこかに出てくる・mem ＝ いまの曲（メモリ）・undo ＝ ↶ の履歴）
  function libRefs(id, scan) {
    var p = project(), M = DM(), r = { raw: false, mem: false, undo: false, songs: (scan.songs[id] || []), cur: "" }, i, j;
    for (i = 0; i < scan.raws.length; i++) { if (scan.raws[i].indexOf(id) >= 0) { r.raw = true; break; } }
    try { r.mem = JSON.stringify(p).indexOf(id) >= 0; } catch (e) { r.mem = true; }
    try { r.undo = JSON.stringify([st.undo, st.redo]).indexOf(id) >= 0; } catch (e2) { r.undo = true; }
    for (i = 0; p && i < p.tracks.length && !r.cur; i++) { for (j = 0; j < p.tracks[i].clips.length; j++) { var c = p.tracks[i].clips[j]; if (c.type !== "audio") { continue; } if (c.asset === id) { r.cur = "clip"; break; } if (M.clipAssets(c).indexOf(id) >= 0) { r.cur = "take"; } } }
    if (!r.cur && M.findAsset(p, id)) { r.cur = "list"; }
    return r;
  }
  // この画面のタブで動いている処理（動いていれば削除しない）
  function libBusyWhy() {
    if (rec.state !== "idle") { return "録音中は削除できません"; }
    if (aud.busy) { return "WAV を読みこんでいるあいだは削除できません"; }
    if (pk.busy) { return "ZIP を作っているあいだは削除できません"; }
    if (pk.istate === "busy") { return "ZIP を読みこんでいるあいだは削除できません"; }
    if (wav.busy) { return "WAV を書き出しているあいだは削除できません"; }
    return "";
  }
  function libSize(n) { return n < 1048576 ? Math.max(1, Math.round(n / 1024)) + " KB" : mb(n); }
  function libDeletable(a, rf, scan) { return !!(scan && scan.ok && a.hasMeta && a.hasBlob && !rf.raw && !rf.mem && !rf.undo); }
  // 一覧を読みなおす（IndexedDB・保存した曲・見積もり）
  function libLoad(cb) {
    lib.loading = true;
    idbAll(function (r) {
      lib.loading = false;
      if (!r.ok) { lib.list = null; lib.msg = "素材の保存場所を読めませんでした（" + r.why + "）"; if (cb) { cb(); } return; }
      var by = {}, out = [], i;
      for (i = 0; i < r.meta.length; i++) { var m = r.meta[i]; if (m && m.id) { by[m.id] = { id: m.id, name: m.name || "?", bytes: Number(m.bytes) || 0, sec: Number(m.sec) || 0, sr: m.sr || 0, ch: m.ch || 0, added: m.added || 0, hasMeta: true, hasBlob: false }; } }
      for (i = 0; i < r.blobs.length; i++) { var k = String(r.blobs[i]); if (!by[k]) { by[k] = { id: k, name: "（情報なし）", bytes: 0, sec: 0, sr: 0, ch: 0, added: 0, hasMeta: false, hasBlob: true }; } else { by[k].hasBlob = true; } }
      for (k in by) { if (by.hasOwnProperty(k)) { out.push(by[k]); } }
      out.sort(function (a, b) { return (b.added || 0) - (a.added || 0) || (a.id < b.id ? -1 : 1); });
      lib.list = out; lib.scan = libScan();
      var nv = window.navigator, done = false;
      function fin() { if (!done) { done = true; if (cb) { cb(); } } }
      try {
        if (nv && nv.storage && nv.storage.estimate) { var pr = nv.storage.estimate(); if (pr && pr.then) { pr.then(function (e) { lib.est = e ? { usage: e.usage, quota: e.quota } : null; fin(); }, function () { lib.est = null; fin(); }); setTimeout(fin, 1500); return; } }
      } catch (e3) {}
      lib.est = null; fin();
    });
  }
  function libOpen() { st.view = "lib"; lib.msg = ""; lib.confirm = ""; libLoad(function () { if (st.root && st.view === "lib") { rerender(); } }); }
  // 1 つ削除する（直前に全部調べなおす）→ cb({ ok, why, name, bytes })
  function libDelete(id, cb) {
    function no(w) { lib.busy = false; cb({ ok: false, why: w }); }
    if (lib.busy) { cb({ ok: false, why: "いま削除しています" }); return; }
    lib.busy = true;
    if (sv.timer && !saveNow()) { no("保存待ちの変更を保存できなかったので、削除しませんでした"); return; }
    var b = libBusyWhy(); if (b) { no(b); return; }
    if (!libChan.ch) { no("このブラウザでは、ほかのタブで開いていないかを確かめられないので、削除はできません"); return; }
    // 9A-16: 排他ロックを持ったまま、問いあわせ・調べなおし・削除・確かめまでを行う（そのあいだ、ほかのタブは参照を足せない）
    lockExclusive(function (done) {
      function no2(w) { done({ ok: false, why: w }); }
      otherTabs(function (n) {
        if (n === null) { no2("このブラウザでは、ほかのタブで開いていないかを確かめられないので、削除はできません"); return; }
        if (n > 0) { no2("ほかのタブでもこのゲームが開いています（" + n + " 個）。ほかのタブを閉じてから、もう一度ためしてください（まだ保存していない変更があるかもしれないため）"); return; }
        if (sv.timer && !saveNow()) { no2("保存待ちの変更を保存できなかったので、削除しませんでした"); return; }
        var b2 = libBusyWhy(); if (b2) { no2(b2); return; }
        var sc = libScan();
        if (!sc.ok) { no2(sc.why); return; }
        var rf = libRefs(id, sc);
        if (rf.raw || rf.mem || rf.undo) { no2("この素材は使われています（" + (rf.mem ? "いまの曲" : (rf.undo ? "↶ の履歴" : "保存した曲")) + "）。削除しませんでした"); return; }
        idbGet("meta", id, function (m) {
          if (!m) { no2("素材の情報が見つかりません（削除しませんでした）"); return; }
          var nm = m.name, by = m.bytes;
          idbDelete(id, function (w) {
            if (w) { no2("削除できませんでした（" + w + "）"); return; }
            idbGet("blobs", id, function (bl) {
              idbGet("meta", id, function (mm) {
                delete aud.buf[id]; delete aud.st[id]; delete aud.peaks[id]; delete aud.err[id]; aud.wave = {}; aud.waveN = 0;
                if (bl || mm) { done({ ok: false, why: "削除のあとで確かめたら、まだ残っていました" }); return; }
                done({ ok: true, name: nm, bytes: by });
              });
            });
          });
        });
      });
    }, function (x) { lib.busy = false; cb(typeof x === "string" ? { ok: false, why: x } : x); }); // 共有ロックを取りなおしてから返す
  }
  // 素材だけを鳴らす（曲は変えない）
  function libHear(id) {
    var buf = aud.buf[id], UG = window.UGMelody, ac = null;
    if (!buf) {
      lib.msg = "読みこんでいます…"; aud.wait[id] = aud.wait[id] || [];
      aud.wait[id].push(function () { if (aud.buf[id] && st.view === "lib") { lib.msg = ""; libHear(id); if (st.root) { rerender(); } } else if (st.view === "lib") { lib.msg = "この素材を読めませんでした"; if (st.root) { rerender(); } } });
      if (aud.st[id] !== "loading") { loadAsset(id); }
      return false;
    }
    stopPlay(true);
    try { ac = UG.audioInit(); } catch (e) { ac = null; }
    if (!ac) { return false; }
    try {
      var src = ac.createBufferSource(); src.buffer = buf; src.connect(UG.audio && UG.audio.ctx === ac && UG.audio.master ? UG.audio.master : ac.destination);
      src.start(ac.currentTime + 0.02, 0, buf.duration);
      hearSrc = src; hearInfo = { lib: id, at: ac.currentTime + 0.02, dur: buf.duration };
      src.onended = function () { if (hearSrc === src) { hearSrc = null; hearInfo = null; if (st.root && st.view === "lib") { rerender(); } } };
    } catch (e1) { return false; }
    return true;
  }
  function libHtml() {
    var p = project(), L = lib, i, h, sc = L.scan, nUse = 0, nFree = 0, total = 0;
    h = '<div class="daw dl"><div class="daw-top"><button class="modal-btn daw-small" data-lb="back">&#x2190; 曲</button><b>&#x1F3B5; 素材ライブラリ</b></div>';
    if (L.loading && !L.list) { return h + '<div class="daw-info">&#x23F3; 読みこんでいます…</div></div>'; }
    if (!L.list) { return h + '<div class="daw-msg">&#x26A0;&#xFE0F; ' + escHtml(L.msg || "読みこめませんでした") + '</div></div>'; }
    var rows = [];
    for (i = 0; i < L.list.length; i++) {
      var a = L.list[i], rf = libRefs(a.id, sc || { raws: [], songs: {} }), used = rf.raw || rf.mem || rf.undo;
      total += a.bytes; if (used) { nUse++; } else { nFree++; }
      rows.push({ a: a, rf: rf, used: used, del: libDeletable(a, rf, sc) });
    }
    var est = L.est && L.est.quota ? '<br>ブラウザの保存領域（見積もり）: 使用 ' + mb(L.est.usage || 0) + '／上限の見積もり ' + mb(L.est.quota) + '<br><span class="small">見積もりは目安です。この分を必ず使えるわけではありません</span>' : '<br><span class="small">このブラウザでは保存領域の見積もりを出せません</span>';
    h += '<div class="daw-info dl-sum">端末の素材 <b>' + L.list.length + '</b> 個・WAV の合計 <b>' + libSize(total) + '</b><br>使われている ' + nUse + ' 個・どの曲からも参照されていない ' + nFree + ' 個' + est + '</div>';
    var why = libBusyWhy() || (sc && !sc.ok ? sc.why : "") || (!libChan.ch ? "このブラウザでは、ほかのタブで開いていないかを確かめられないので、削除はできません" : "") || libLockWhy(); // 9A-16
    h += why ? '<div class="daw-msg">&#x26A0;&#xFE0F; 削除はできません: ' + escHtml(why) + '</div>' : '<p class="small dsv-note">どの曲からも参照されていない素材だけ、1 つずつ削除できます（削除の直前に、保存した全部の曲・いまの曲・↶ の履歴・ほかのタブをもう一度調べます）。</p>';
    h += '<div class="daw-msg dl-warn">削除すると元に戻せません。大切な素材は ZIP などでバックアップしてください。v2.47 以前の版で作った ZIP には、使っていないテイクの素材が入っていないことがあります（バックアップは v2.48 以降で）。</div>';
    if (L.msg) { h += '<div class="da-note">' + escHtml(L.msg) + '</div>'; }
    if (!rows.length) { h += '<p class="small dsv-note">まだ素材はありません。</p>'; }
    for (i = 0; i < rows.length; i++) {
      var r = rows[i], A = r.a, f = r.rf, lab = [], others = 0, k;
      for (k = 0; k < f.songs.length; k++) { if (f.songs[k].id !== p.id) { others++; } }
      if (f.cur === "clip") { lab.push("この曲のクリップで使用中"); } else if (f.cur === "take") { lab.push("この曲の使っていないテイク"); } else if (f.cur === "list") { lab.push("この曲の素材の一覧にある"); }
      if (others) { lab.push("ほかの曲 " + others + " 曲"); }
      if (!f.cur && !others && f.undo) { lab.push("↶ の履歴にある"); }
      if (!f.cur && !others && !f.undo && f.raw) { lab.push("保存のどこかに出てくる"); }
      if (!r.used) { lab.push("どの曲からも参照されていない"); }
      if (!A.hasMeta || !A.hasBlob) { lab.push(A.hasMeta ? "WAV がありません" : "情報がありません"); }
      var hearing = !!(hearInfo && hearInfo.lib === A.id);
      h += '<div class="dl-row' + (r.used ? '' : ' dl-free') + '"><div class="dl-meta"><b>' + escHtml(A.name) + '</b><br><span class="small">' + (Math.round(A.sec * 10) / 10) + ' 秒・' + libSize(A.bytes) + '・' + (A.ch === 1 ? 'モノラル' : (A.ch === 2 ? 'ステレオ' : A.ch + 'ch')) + '・' + A.sr + 'Hz・使っている曲 ' + f.songs.length + '<br>' + (r.used ? '&#x1F512; ' : '&#x1F4A4; ') + escHtml(lab.join("・")) + '</span></div>' +
        '<div class="dl-btns"><button class="modal-btn dl-b' + (hearing ? ' daw-on' : '') + '" data-lbp="' + escHtml(A.id) + '"' + (A.hasBlob && A.hasMeta ? '' : ' disabled') + '>' + (hearing ? '&#x23F9;&#xFE0F;' : '&#x25B6;&#xFE0F;') + '</button>' +
        (r.del && !why ? '<button class="modal-btn dl-b dl-del" data-lbd="' + escHtml(A.id) + '">&#x1F5D1;&#xFE0F; 削除</button>' : '') + '</div></div>';
      if (L.confirm === A.id && r.del && !why) { // 消せる素材にだけ確かめの欄を出す
        h += '<div class="daw-info da-confirm dl-confirm"><div>&#x26A0;&#xFE0F; 「<b>' + escHtml(A.name) + '</b>」（' + libSize(A.bytes) + '）を端末から削除します。<b>削除すると元に戻せません。</b>大切な素材は ZIP などでバックアップしてください。</div>' +
          '<label class="dl-ack"><input type="checkbox" data-lbk="1"' + (L.ack ? ' checked' : '') + '> ほかのタブ・ウィンドウでこのゲームを開いていないことを確かめました<br><span class="small">（v2.48 以降のタブは自動で見つけますが、更新の前から開いたままの v2.47 以前のページは見つけられません）</span></label>' + // 9A-16
          '<div class="da-btns"><button class="modal-btn da-half da-danger" data-lby="' + escHtml(A.id) + '"' + (L.ack ? '' : ' disabled') + '>&#x1F5D1;&#xFE0F; 削除する</button><button class="modal-btn da-half" data-lbn="1">やめる</button></div></div>';
      }
    }
    return h + '<p class="small dsv-note">「テイクを外す」「曲から外す」をしても、端末の素材は消えません。端末の素材を削除しても、1 曲の上限（素材 ' + DM().MAX_ASSETS + ' 個・合計 ' + DM().MAX_ASSET_SEC + ' 秒）は増えません。</p></div>';
  }
  function renderLib(root, ctl) {
    root.innerHTML = libHtml();
    if (!root.querySelectorAll) { return; }
    var els = root.querySelectorAll("button"), k;
    for (k = 0; k < els.length; k++) {
      els[k].onclick = function (ev) {
        var el = ev.currentTarget, v;
        if (el.getAttribute("data-lb") === "back") { takeHearStop(); lib.confirm = ""; st.view = "proj"; renderProj(root, ctl); return; }
        if ((v = el.getAttribute("data-lbp"))) { if (hearInfo && hearInfo.lib === v) { takeHearStop(); } else { libHear(v); } renderLib(root, ctl); return; }
        if ((v = el.getAttribute("data-lbd"))) { lib.confirm = v; lib.ack = false; lib.msg = ""; renderLib(root, ctl); return; }
        if (el.getAttribute("data-lbn")) { lib.confirm = ""; lib.msg = "削除をやめました（何も変えていません）"; renderLib(root, ctl); return; }
        if ((v = el.getAttribute("data-lby"))) {
          if (!lib.ack) { return; }
          lib.confirm = ""; lib.ack = false; lib.msg = "⏳ 調べています…（ほかのタブも確かめます）"; renderLib(root, ctl);
          libDelete(v, function (r) {
            lib.msg = r.ok ? "「" + r.name + "」を削除しました（" + libSize(r.bytes) + "）" : "削除しませんでした: " + r.why;
            libLoad(function () { if (st.root && st.view === "lib") { renderLib(st.root, st.ctl); } });
          });
        }
      };
    }
    var ck = root.querySelector("[data-lbk]"); // 9A-16
    if (ck) { ck.onchange = function () { lib.ack = !!ck.checked; renderLib(root, ctl); }; }
  }
  function libLockWhy() {
    if (lk.state === "off") { return "このブラウザはタブ間の排他（Web Locks）に対応していないので、削除はできません"; }
    if (lk.state === "wait") { return "ほかのタブで素材を削除しているところです（少し待ってから）"; }
    return "";
  }

  // ---------- §341 9A-14: テイク（別テイクを録音・切りかえ・試聴・外す）----------
  function recOpenTake(cid) {
    var p = project(), M = DM(), f = M.findClip(p, cid);
    if (!f || f.clip.type !== "audio" || rec.state !== "idle") { return false; }
    recOpen(f.track.id); rec.takeClip = cid; rec.bar = M.tickToBar(p, f.clip.start).bar - 1;
    st.view = "arr"; st.aedit = null; st.sel = { kind: "clip", id: cid };
    return true;
  }
  var hearSrc = null, hearInfo = null;
  function takeHearStop() { var s0 = hearSrc; hearSrc = null; hearInfo = null; if (s0) { try { s0.onended = null; s0.stop(0); } catch (e) {} try { s0.disconnect(); } catch (e2) {} } }
  function takeNote(t) { if (st.aedit) { st.aedit.msg = t; } else { st.anote = escHtml(t); } }
  // そのテイクの素材だけを鳴らす（そのテイクの先頭・末尾で。曲・選択は変えない）
  function takeHear(cid, id) {
    var p = project(), M = DM(), f = M.findClip(p, cid), UG = window.UGMelody, i, tk = null;
    if (!f || rec.state !== "idle") { return false; }
    var l = M.takesOf(p, f.clip); for (i = 0; i < l.length; i++) { if (l[i].id === id) { tk = l[i]; } }
    if (!tk) { return false; }
    var buf = aud.buf[tk.asset];
    if (!buf) { takeNote(assetState(tk.asset) === "missing" ? "テイク " + id + " の素材がありません" : "テイク " + id + " を読みこんでいます…"); ensureAssets(p, function () { if (st.root) { rerender(); } }); return false; }
    stopPlay(true);
    var e = id === M.activeTakeId(f.clip) ? f.clip : (tk.edit || {}), a = Math.max(0, Number(e.trimIn) || 0), b = Number(e.trimOut) > 0 ? Math.min(buf.duration, Number(e.trimOut)) : buf.duration, ac = null;
    try { ac = UG.audioInit(); } catch (e0) { ac = null; }
    if (!ac) { return false; }
    try {
      var src = ac.createBufferSource(); src.buffer = buf; src.connect(UG.audio && UG.audio.ctx === ac && UG.audio.master ? UG.audio.master : ac.destination);
      src.start(ac.currentTime + 0.02, a, Math.max(0.01, b - a));
      hearSrc = src; hearInfo = { clip: cid, id: id, at: ac.currentTime + 0.02, a: a, dur: b - a, asset: tk.asset };
      src.onended = function () { if (hearSrc === src) { hearSrc = null; hearInfo = null; if (st.root && st.view === "aedit") { rerender(); } } };
    } catch (e1) { return false; }
    return true;
  }
  var takes = {
    // 使うテイクを切りかえる（↶ で戻せる・自動保存・再生中は古いノードを止めて鳴らしなおす）
    select: function (cid, id) {
      if (rec.state !== "idle") { takeNote("録音中はテイクを切りかえられません"); if (st.root) { rerender(); } return { ok: false, why: "rec" }; }
      var p = project(), snap = snapTracks(), r = DM().selectTake(p, cid, id);
      if (!r.ok) { takeNote(r.why); if (st.root) { rerender(); } return r; }
      if (r.same) { return r; }
      pushUndo(snap); markDirty(); takeHearStop();
      if (pl && pl.clip) { aeditPlay(false); } else if (pl) { resync(); }
      takeNote(""); if (st.root) { rerender(); }
      return r;
    },
    remove: function (cid, id) {
      var p = project(), snap = snapTracks(), r = DM().removeTake(p, cid, id);
      if (!r.ok) { takeNote(r.why); if (st.root) { rerender(); } return r; }
      pushUndo(snap); markDirty(); takeNote("テイク " + id + " を一覧から外しました（素材は残っています・↶ で戻せます）"); if (st.root) { rerender(); }
      return r;
    }
  };
  function takesHtml(p, c) {
    var M = DM(), l = M.takesOf(p, c), act = M.activeTakeId(c), i, h, sec = 0, al = p.assets || [], cp = M.compOf(p, c);
    for (i = 0; i < al.length; i++) { sec += Number(al[i] && al[i].sec) || 0; }
    h = '<div class="tk"><div class="tk-h">&#x1F399;&#xFE0F; テイク（' + l.length + '／' + M.MAX_TAKES + '）<span class="small">この曲の素材 ' + al.length + '／' + M.MAX_ASSETS + ' 個・' + Math.round(sec * 10) / 10 + '／' + M.MAX_ASSET_SEC + ' 秒</span></div>';
    if (cp) { h += '<div class="tk-comp">&#x1F3A7; 組み合わせ中: <b>' + escHtml(cp.secs.join(" → ")) + '</b>（' + cp.n + ' 区間）。鳴るのは組み合わせです。「&#x270F;&#xFE0F; 直す」でテイクを選ぶと、そのテイクの先頭・末尾・位置の調整を下で直せます（組み合わせの区間は変わりません）</div>'; } // 9A-16／9A-17
    else if (c.comp) { h += '<div class="tk-comp">&#x26A0;&#xFE0F; 組み合わせのテイクが見つかりません（いま使っているテイクで鳴らしています・設定は残しています）</div>'; }
    for (i = 0; i < l.length; i++) {
      var t = l[i], a = M.findAsset(p, t.asset), on = t.id === act, hearing = !!(hearInfo && hearInfo.clip === c.id && hearInfo.id === t.id);
      h += '<div class="tk-row' + (on ? ' tk-on' : '') + '"><b class="tk-id">' + escHtml(t.id) + '</b><span class="tk-meta">' + escHtml(t.name) + '<br><small>' + (t.at || (a && a.added) ? fmtTime(t.at || a.added) : '—') + '・' + (a ? (Math.round(a.sec * 100) / 100) + ' 秒' : '&#x26A0;&#xFE0F; 素材がありません') + '</small>' + (on ? '<br><b class="tk-use">' + (cp ? '&#x270F;&#xFE0F; 下で直しているテイク' : '&#x2705; このテイクを使用中') + '</b>' : '') + '</span>' +
        '<span class="tk-btns"><button class="modal-btn tk-b' + (hearing ? ' daw-on' : '') + '" data-tkp="' + escHtml(t.id) + '" title="試聴">' + (hearing ? '&#x23F9;&#xFE0F;' : '&#x25B6;&#xFE0F;') + '</button>' +
        (on ? '' : '<button class="modal-btn tk-b" data-tku="' + escHtml(t.id) + '"' + (a ? '' : ' disabled') + '>' + (cp ? '&#x270F;&#xFE0F; 直す' : '使う') + '</button>') +
        (on || t.virtual || (c.comp && M.compRaw(c).secs.indexOf(t.id) >= 0) ? '' : '<button class="modal-btn tk-b tk-x" data-tkx="' + escHtml(t.id) + '" title="一覧から外す（素材は残る）">外す</button>') + '</span></div>';
    }
    var why = M.takeRoomWhy(c);
    return h + '<div class="da-btns"><button class="modal-btn da-wide tk-rec" data-tk="rec"' + (why || rec.state !== "idle" ? ' disabled' : '') + '>&#x1F399;&#xFE0F; 別テイクを録音（' + l.length + '／' + M.MAX_TAKES + '）</button></div>' + (why ? '<div class="small">' + escHtml(why) + '</div>' : '') +
      (l.length >= 2 ? '<div class="da-btns"><button class="modal-btn da-wide tk-cmp" data-tk="comp"' + (rec.state !== "idle" ? ' disabled' : '') + '>&#x1F3A7; テイクを組み合わせる' + (cp ? '（組み合わせ中）' : '') + '</button></div>' : '') + '</div>'; // 9A-16
  }
  // 9A-16: 鳴る区間の全体（コンピングなら 2 つの区間の頭〜終わり）→ { p0, p1 }
  function segsExtent(p, c) {
    var l = DM().audioSegs(p, c), lo = Infinity, hi = -Infinity, i;
    for (i = 0; i < l.length; i++) { if (l[i].ok) { lo = Math.min(lo, l[i].p0); hi = Math.max(hi, l[i].p1); } }
    if (!(hi > lo)) { var s = DM().audioSpan(p, c); return { p0: s.p0, p1: s.p1 }; }
    return { p0: lo, p1: hi };
  }

  // ---------- §341 9A-16／9A-17: コンピング（最大 4 区間・下書きを「確定」するまで曲は変えない・元の WAV はそのまま）----------
  var CP_W = 340, CP_H = 84, CP_STEPS = [["-0.1", "&#x2212;100ms"], ["-0.01", "&#x2212;10ms"], ["-0.001", "&#x2212;1ms"], ["0.001", "＋1ms"], ["0.01", "＋10ms"], ["0.1", "＋100ms"]], CP_SEAM = 1.5;
  function cpCls(id) { return "cp-t" + (/^[A-H]$/.test(id) ? id : "X"); }
  function r4s(x) { return Math.round(x * 10000) / 10000; }
  function openComp(id) {
    var p = project(), f = DM().findClip(p, id);
    if (!f || f.clip.type !== "audio" || DM().takesOf(p, f.clip).length < 2 || rec.state !== "idle") { return false; }
    takeHearStop(); if (pl && pl.clip) { stopPlay(false); }
    st.view = "comp"; st.sel = { kind: "clip", id: id }; st.aedit = { clip: id, msg: "" }; st.cview = { clip: id, msg: "", draft: null, mode: "", leave: "" };
    return true;
  }
  // 曲の値から下書きを作る（組み合わせていなければ、いまのテイクと次のテイクの 2 区間）
  function compInit(p, c) {
    var M = DM(), cp = M.compOf(p, c), l, act, b = "", i;
    if (cp) { return { secs: cp.secs.slice(), cuts: cp.ats.slice(), sel: 0, hist: [], live: true, bad: cp.bad }; }
    l = M.takesOf(p, c); act = M.activeTakeId(c);
    for (i = 0; i < l.length; i++) { if (l[i].id !== act) { b = l[i].id; break; } }
    return { secs: [act, b], cuts: [M.compDefaultAt(p, c, act, b)], sel: 0, hist: [], live: false, bad: false };
  }
  // 下書きの comp（となりの同じテイクはまとめる）
  function compObj(d) {
    var m = DM().compMerge(d.secs, d.cuts), o = { a: m.secs[0], b: m.secs[1], at: m.cuts[0] }, i;
    if (m.secs.length > 2) { o.cuts = []; for (i = 2; i < m.secs.length; i++) { o.cuts.push({ at: m.cuts[i - 1], take: m.secs[i] }); } }
    return o;
  }
  // 下書きが曲の値とちがうか（組み合わせていない曲なら、下書きを動かしたか）
  function compChanged(p, c, d) {
    var cp = DM().compOf(p, c);
    if (!cp) { return d.hist.length > 0; }
    var m = DM().compMerge(d.secs, d.cuts);
    return JSON.stringify([m.secs, m.cuts.map(r4s)]) !== JSON.stringify([cp.secs, cp.ats.map(r4s)]);
  }
  function compBox(p, c) { return DM().tickToSec(p, c.start + c.len) - DM().tickToSec(p, c.start); }
  // 切りかえ j を v 秒へ（となりと 20ms 以上・箱の中）→ "" / 理由
  function compSetCut(p, c, d, j, v) {
    var M = DM(), box = compBox(p, c), lo = j === 0 ? M.COMP_MIN : d.cuts[j - 1] + M.COMP_GAP, hi = j === d.cuts.length - 1 ? Math.max(M.COMP_MIN, box - M.COMP_MIN) : d.cuts[j + 1] - M.COMP_GAP;
    if (!isFinite(v)) { return "数を入れてください"; }
    if (hi < lo) { return "ここには動かせません（となりの切りかえと近すぎます）"; }
    d.cuts[j] = r4s(Math.max(lo, Math.min(hi, v)));
    return Math.abs(d.cuts[j] - v) > 1e-6 ? "その位置には置けないので、" + fsec(d.cuts[j]) + " 秒にしました（となりと " + Math.round(M.COMP_GAP * 1000) + "ms 以上・クリップの中）" : "";
  }
  // いちばん長い区間をまん中で分けて、後ろをほかのテイクに（前後と同じにならないテイクがある区間だけ）
  function compAddSec(p, c, d) {
    var M = DM(), l = M.takesOf(p, c), box = compBox(p, c), e = [0].concat(d.cuts).concat([box]), order = [], k, i;
    if (d.secs.length >= M.COMP_MAX_SECS) { return "区間は " + M.COMP_MAX_SECS + " つまでです"; }
    for (k = 0; k < d.secs.length; k++) { order.push(k); }
    order.sort(function (x, y) { return (e[y + 1] - e[y]) - (e[x + 1] - e[x]); });
    for (i = 0; i < order.length; i++) {
      k = order[i];
      var lo = e[k], hi = e[k + 1], mid = r4s(Math.round((lo + hi) / 2 * 1000) / 1000), nt = "", j;
      if (mid - lo < M.COMP_GAP || hi - mid < M.COMP_GAP || mid < M.COMP_MIN || mid > box - M.COMP_MIN) { continue; }
      for (j = 0; j < l.length && !nt; j++) { if (l[j].id !== d.secs[k] && (k + 1 >= d.secs.length || l[j].id !== d.secs[k + 1]) && M.findAsset(p, l[j].asset)) { nt = l[j].id; } }
      if (!nt) { continue; }
      d.cuts.splice(k, 0, mid); d.secs.splice(k + 1, 0, nt); d.sel = k;
      return "";
    }
    return "分けられる区間がありません（区間が短すぎるか、ちがうテイクがありません）";
  }
  var comp = {
    clip: function () { return st.cview ? DM().findClip(project(), st.cview.clip) : null; },
    cur: function () { var f = comp.clip(); if (!f) { return null; } if (!st.cview.draft) { st.cview.draft = compInit(project(), f.clip); } return st.cview.draft; },
    // 下書きを変える（曲は変えない・下書きの ↶ に積む）。fn(d) → "" ／ 理由（理由なら元に戻す）
    edit: function (fn, keepOnWhy) {
      var f = comp.clip(), d = comp.cur();
      if (!f || !d) { return { ok: false, why: "クリップが見つかりません" }; }
      if (rec.state !== "idle") { st.cview.msg = "録音中は変えられません"; if (st.root) { rerender(); } return { ok: false, why: "rec" }; }
      var keep = JSON.stringify({ secs: d.secs, cuts: d.cuts, sel: d.sel }), why = fn(d), now = JSON.stringify({ secs: d.secs, cuts: d.cuts, sel: d.sel });
      if (why && !keepOnWhy) { var k0 = JSON.parse(keep); d.secs = k0.secs; d.cuts = k0.cuts; d.sel = k0.sel; now = keep; }
      if (now !== keep) { d.hist.push(keep); if (d.hist.length > 40) { d.hist.shift(); } st.cview.leave = ""; if (pl && pl.clip === f.clip.id) { compPlay(st.cview.mode || "all"); } }
      st.cview.msg = why || "";
      if (st.root) { rerender(); }
      return { ok: !why || !!keepOnWhy, why: why };
    },
    take: function (k, id) { return comp.edit(function (d) { if (k < 0 || k >= d.secs.length) { return "区間がありません"; } d.secs[k] = id; return ""; }); },
    sel: function (j) { var d = comp.cur(); if (d && j >= 0 && j < d.cuts.length) { d.sel = j; } if (st.root) { rerender(); } return !!d; },
    nudge: function (sec) { var p = project(), f = comp.clip(); return comp.edit(function (d) { return compSetCut(p, f.clip, d, d.sel, d.cuts[d.sel] + sec); }, true); },
    setAt: function (j, v) { var p = project(), f = comp.clip(); return comp.edit(function (d) { if (j < 0 || j >= d.cuts.length) { return "切りかえがありません"; } d.sel = j; return compSetCut(p, f.clip, d, j, Number(v)); }, true); },
    add: function () { var p = project(), f = comp.clip(); return comp.edit(function (d) { return compAddSec(p, f.clip, d); }); },
    del: function (j) { return comp.edit(function (d) { if (j === undefined) { j = d.sel; } if (d.secs.length <= 2) { return "2 区間より少なくはできません（やめるときは「単一テイクに戻す」）"; } if (j < 0 || j >= d.cuts.length) { return "切りかえがありません"; } d.cuts.splice(j, 1); d.secs.splice(j + 1, 1); d.sel = Math.max(0, Math.min(j, d.cuts.length - 1)); return ""; }); },
    // 確定: 下書きを曲へ（↶ 1 つ・自動保存）
    apply: function () {
      var f = comp.clip(), d = comp.cur(), p = project();
      if (!f || !d) { return { ok: false, why: "クリップが見つかりません" }; }
      if (rec.state !== "idle") { st.cview.msg = "録音中は変えられません"; if (st.root) { rerender(); } return { ok: false, why: "rec" }; }
      var snap = snapTracks(), before = JSON.stringify(f.clip), r = DM().setComp(p, f.clip.id, { secs: d.secs.slice(), cuts: d.cuts.slice() });
      if (!r.ok) { st.cview.msg = r.why; if (st.root) { rerender(); } return r; }
      if (JSON.stringify(f.clip) !== before) { pushUndo(snap); markDirty(); }
      st.cview.draft = null; st.cview.leave = ""; st.cview.msg = "";
      st.cview.note = "確定しました（" + DM().compOf(p, f.clip).secs.join("→") + "）";
      if (pl && pl.clip === f.clip.id) { compPlay(st.cview.mode || "all"); } else if (pl) { resync(); }
      if (st.root) { rerender(); }
      return r;
    },
    cancel: function () { var f = comp.clip(); st.cview.draft = null; st.cview.leave = ""; st.cview.msg = ""; st.cview.note = "下書きを捨てました（曲は変えていません）"; if (pl && f && pl.clip === f.clip.id) { compPlay(st.cview.mode || "all"); } if (st.root) { rerender(); } return true; },
    // 単一テイクに戻す（曲を変える・↶ で戻せる）
    off: function () {
      var f = comp.clip(), p = project();
      if (!f) { return { ok: false }; }
      var snap = snapTracks(), had = f.clip.hasOwnProperty("comp"), r = DM().setComp(p, f.clip.id, { off: true });
      if (r.ok && had) { pushUndo(snap); markDirty(); if (pl && pl.clip === f.clip.id) { compPlay(st.cview.mode || "all"); } else if (pl) { resync(); } }
      st.cview.draft = null; st.cview.leave = ""; st.cview.note = had ? "単一テイクに戻しました（↶ で戻せます）" : "";
      if (st.root) { rerender(); }
      return r;
    },
    // ↶: 下書きの 1 つ前（なければ曲の ↶）
    undo: function () {
      var d = comp.cur();
      if (d && d.hist.length) { var h = JSON.parse(d.hist.pop()); d.secs = h.secs; d.cuts = h.cuts; d.sel = h.sel; st.cview.msg = ""; var f = comp.clip(); if (pl && f && pl.clip === f.clip.id) { compPlay(st.cview.mode || "all"); } if (st.root) { rerender(); } return true; }
      st.cview.draft = null;
      return edit.undo();
    },
    changed: function () { var f = comp.clip(), d = comp.cur(); return !!(f && d && compChanged(project(), f.clip, d)); }
  };
  // 試聴: all ＝ このクリップだけ（くり返し）・seam ＝ 選んだ切りかえの前後 ±1.5 秒（くり返し）。下書きがちがえば「影の曲」（写しに下書きを当てたもの）で鳴らす
  function compPlay(mode) {
    var f = comp.clip(), M = DM(), p = project(), d = comp.cur();
    if (!f || !d) { return false; }
    var shadow = null, c = f.clip, a, b;
    if (!M.compOf(p, c) || compChanged(p, c, d)) {
      shadow = JSON.parse(JSON.stringify(p));
      var r = M.setComp(shadow, c.id, { secs: d.secs.slice(), cuts: d.cuts.slice() });
      if (!r.ok) { st.cview.msg = r.why; return false; }
      c = M.findClip(shadow, c.id).clip;
    }
    var q = shadow || p;
    if (mode === "seam") {
      var T = M.tickToSec(q, c.start) + d.cuts[Math.min(d.sel, d.cuts.length - 1)];
      a = Math.max(0, Math.floor(M.secToTick(q, Math.max(0, T - CP_SEAM)))); b = Math.max(a + 1, Math.ceil(M.secToTick(q, T + CP_SEAM)));
    } else {
      var ex = segsExtent(q, c);
      a = Math.max(0, Math.floor(M.secToTick(q, Math.max(0, ex.p0)))); b = Math.max(a + 1, Math.ceil(M.secToTick(q, ex.p1)) + 1);
    }
    st.cview.mode = mode;
    return startPlay({ clip: c.id, a: a, b: b, from: a, loop: true, shadow: shadow });
  }
  // 色分けの波形（区間ごとにそのテイクの色・切りかえの線（選んだ線は太く）・区間のテイク名）。下書きをそのまま描く
  function compSvg(p, c, d) {
    var M = DM(), cc = JSON.parse(JSON.stringify(c));
    cc.comp = compObj(d);
    var segs = M.audioSegs(p, cc), C0 = M.tickToSec(p, c.start), box = compBox(p, c), mid = CP_H / 2, ds = {}, x, i, q, PR = M.PEAK_RATE, k;
    for (q = 0; q < segs.length; q++) { if (!aud.peaks[segs[q].id]) { return '<div class="ae-nowave small">&#x23F3; 波形を読みこんでいます…</div>'; } }
    if (!segs.length || !segs[0].comp || !(box > 0)) { return '<div class="ae-nowave small">組み合わせを表示できません（' + escHtml(st.cview.msg || "区間を見なおしてください") + '）</div>'; }
    for (x = 0; x < CP_W; x += 2) {
      var x0 = C0 + x / CP_W * box, x1 = C0 + (x + 2) / CP_W * box, xm = (x0 + x1) / 2, sg = null;
      for (q = 0; q < segs.length; q++) { var s = segs[q]; if (xm >= s.from && xm < s.to && xm >= Math.max(0, s.p0) && xm < s.p1) { sg = s; } }
      if (!sg) { continue; }
      var pk = aud.peaks[sg.id], t0 = sg.tin + (Math.max(x0, sg.p0) - sg.p0), t1 = sg.tin + (Math.min(x1, sg.p1) - sg.p0), i0 = Math.floor(t0 * PR), i1 = Math.max(i0 + 1, Math.ceil(t1 * PR)), m = 0;
      for (i = i0; i < i1 && i < pk.length; i++) { if (pk[i] > m) { m = pk[i]; } }
      var hh = Math.max(0.5, m / 255 * (CP_H / 2 - 12));
      ds[sg.take] = (ds[sg.take] || "") + "M" + (x + 0.5) + " " + (Math.round((mid - hh) * 10) / 10) + "V" + (Math.round((mid + hh) * 10) / 10);
    }
    function X(t) { return Math.round(Math.max(0, Math.min(1, t / box)) * CP_W * 10) / 10; }
    var h = '<svg class="cp-svg" viewBox="0 0 ' + CP_W + ' ' + CP_H + '" preserveAspectRatio="none" aria-hidden="true">';
    for (k in ds) { if (ds.hasOwnProperty(k)) { h += '<path class="' + cpCls(k) + '" d="' + ds[k] + '"/>'; } }
    var e = [0].concat(d.cuts).concat([box]);
    for (i = 0; i < d.cuts.length; i++) { h += '<line class="cp-x' + (i === d.sel ? ' cp-xs' : '') + '" x1="' + X(d.cuts[i]) + '" y1="0" x2="' + X(d.cuts[i]) + '" y2="' + CP_H + '"/>'; }
    for (i = 0; i < d.secs.length; i++) { h += '<text class="cp-lt" x="' + X((e[i] + e[i + 1]) / 2) + '" y="11" text-anchor="middle">' + escHtml(d.secs[i]) + '</text>'; }
    return h + '</svg>';
  }
  function compHtml(p, f) {
    var M = DM(), c = f.clip, d = comp.cur(), l = M.takesOf(p, c), playing = !!(pl && pl.clip === c.id), i, j, act = M.activeTakeId(c), cp = M.compOf(p, c), ch = compChanged(p, c, d), box = compBox(p, c);
    var e = [0].concat(d.cuts).concat([box]), merged = M.compMerge(d.secs, d.cuts), sel = Math.min(d.sel, d.cuts.length - 1);
    var st0 = cp ? '&#x1F3A7; <b>曲の組み合わせ</b>: ' + escHtml(cp.secs.join(" → ")) + '（' + cp.n + ' 区間・継ぎ目は ' + Math.round(M.COMP_XF * 1000) + 'ms のクロスフェード）' + (cp.bad ? '<br>&#x26A0;&#xFE0F; 読めない区間があるので、その後ろは鳴らしていません（データは残しています）' : '')
      : (c.comp ? '&#x26A0;&#xFE0F; 前の組み合わせのテイクが見つかりません（いまはテイク ' + escHtml(act) + ' だけで鳴っています）' : 'いまは単一テイク（テイク ' + escHtml(act) + '）です');
    st0 += ch ? '<br>&#x270F;&#xFE0F; <b>確定していない変更があります</b>（▶ は下書きの音・曲はまだ変わっていません）' : (!cp ? '<br>区間とテイクを決めて「&#x2705; 確定」を押すと、曲に入ります' : '');
    var h = '<div class="daw cp">' +
      '<div class="daw-top"><button class="modal-btn daw-small" data-cp="back">&#x2190; 編集</button><b>&#x1F3A7; 組み合わせ</b><button class="modal-btn daw-small" data-cp="arr">アレンジへ</button></div>' +
      projBarHtml(p) +
      '<div class="daw-transport"><button class="modal-btn daw-tbtn' + (playing && st.cview.mode !== "seam" ? " daw-on" : "") + '" data-cp="play" title="このクリップだけ（くり返し）">&#x25B6;&#xFE0F;</button>' +
        '<button class="modal-btn daw-small' + (playing && st.cview.mode === "seam" ? " daw-on" : "") + '" data-cp="seam" title="選んだ切りかえの前後（±' + CP_SEAM + ' 秒・くり返し）">&#x25B6;&#xFE0F; 継ぎ目 ' + (sel + 1) + '</button>' +
        '<button class="modal-btn daw-tbtn" data-cp="stop" title="停止">&#x23F9;&#xFE0F;</button>' +
        '<button class="modal-btn daw-tbtn" data-cp="undo" title="戻す"' + (d.hist.length || st.undo.length ? '' : ' disabled') + '>&#x21B6;<small>' + (d.hist.length ? '下' : (st.undo.length || '')) + '</small></button><span class="daw-pos">1.1</span></div>' +
      '<div class="daw-info cp-st">' + st0 + '</div>' +
      '<div class="ae-wave cp-wave">' + compSvg(p, c, d) + '<i class="ae-ph cp-ph" style="display:none;"></i></div>';
    for (i = 0; i < d.secs.length; i++) {
      h += '<div class="cp-row"><span class="cp-lab"><b class="' + cpCls(d.secs[i]) + '-c">区間 ' + (i + 1) + '</b><small>' + fsec(e[i]) + '〜' + fsec(e[i + 1]) + '</small></span>';
      for (j = 0; j < l.length; j++) { var on = l[j].id === d.secs[i]; h += '<button class="modal-btn cp-tk ' + cpCls(l[j].id) + '-b' + (on ? ' daw-on' : '') + '" data-cpt="' + i + '|' + escHtml(l[j].id) + '"' + (M.findAsset(p, l[j].asset) ? '' : ' disabled') + '>' + (on ? '&#x2705;' : '') + escHtml(l[j].id) + '</button>'; }
      h += '</div>';
    }
    if (merged.secs.length < d.secs.length) { h += '<div class="small cp-pos">となりが同じテイクの区間は、確定のときに 1 つにまとめます（継ぎ目を作りません）</div>'; }
    h += '<div class="cp-cuts"><span class="cp-lab">切りかえ</span>';
    for (i = 0; i < d.cuts.length; i++) { h += '<button class="modal-btn cp-cut' + (i === sel ? ' daw-on' : '') + '" data-cpc="' + i + '">' + (i + 1) + '<small>' + fsec(d.cuts[i]) + '</small></button>'; }
    h += '</div><div class="ae-row"><span class="ae-lab">切りかえ ' + (sel + 1) + '</span><button class="ae-val" data-cp="atv" title="数字で入れる">' + fsec(d.cuts[sel]) + ' 秒</button></div><div class="ae-btns">';
    for (i = 0; i < CP_STEPS.length; i++) { h += '<button class="modal-btn ae-b" data-cps="' + CP_STEPS[i][0] + '">' + CP_STEPS[i][1] + '</button>'; }
    h += '</div><div class="da-btns"><button class="modal-btn da-half" data-cp="add"' + (d.secs.length >= M.COMP_MAX_SECS ? ' disabled' : '') + '>＋ 区間を足す（' + d.secs.length + '／' + M.COMP_MAX_SECS + '）</button>' +
      '<button class="modal-btn da-half" data-cp="del"' + (d.secs.length <= 2 ? ' disabled' : '') + '>&#x2212; 切りかえ ' + (sel + 1) + ' を消す</button></div>' +
      '<div class="da-btns"><button class="modal-btn da-half cp-make" data-cp="apply"' + (ch || !cp ? '' : ' disabled') + '>&#x2705; 確定</button><button class="modal-btn da-half" data-cp="cancel"' + (ch ? '' : ' disabled') + '>&#x2716; やめる</button></div>' +
      (cp || c.comp ? '<div class="da-btns"><button class="modal-btn da-wide" data-cp="off">&#x21BA; 単一テイクに戻す（いまのテイク ' + escHtml(act) + '）</button></div>' : '') +
      (st.cview.msg ? '<div class="daw-msg">&#x26A0;&#xFE0F; ' + escHtml(st.cview.msg) + '</div>' : '') +
      (st.cview.note ? '<div class="da-note">' + escHtml(st.cview.note) + '</div>' : '') +
      (st.msg ? '<div class="daw-msg">&#x26A0;&#xFE0F; ' + escHtml(st.msg) + '</div>' : '') +
      saveNoteHtml() +
      '<p class="small dsv-note">元の WAV は変えません（区間のテイクと切りかえの位置だけを曲に保存）。切りかえの位置はクリップの頭からの秒で、となりとは ' + Math.round(M.COMP_GAP * 1000) + 'ms 以上はなします。区間ごとに、そのテイクの先頭・末尾・位置の調整を使います（テイクの欄の「&#x270F;&#xFE0F; 直す」で選んで ✂️ 編集）。&#x21B6; は下書きの 1 つ前、なければ曲の ↶ です。</p></div>';
    return h;
  }
  function renderComp(root, ctl) {
    var p = project(), f = comp.clip();
    if (!f || DM().takesOf(p, f.clip).length < 2) { st.view = f ? "aedit" : "arr"; st.cview = null; render(root, ctl); return; }
    audKick(p);
    root.innerHTML = compHtml(p, f);
    st.cview.note = "";
    if (!root.querySelectorAll) { return; }
    var els = root.querySelectorAll("button"), k;
    function leave(where) {
      if (comp.changed() && st.cview.leave !== where) { st.cview.leave = where; st.cview.msg = "確定していない変更があります。もう一度押すと、下書きを捨てて戻ります"; renderComp(root, ctl); return; }
      if (pl && pl.clip) { stopPlay(false); }
      st.view = where === "arr" ? "arr" : "aedit"; st.cview = null; if (where === "arr") { st.aedit = null; }
      render(root, ctl);
    }
    for (k = 0; k < els.length; k++) {
      els[k].onclick = function (ev) {
        var el = ev.currentTarget, v = el.getAttribute("data-cp"), t;
        if ((t = el.getAttribute("data-cpt"))) { var tp = t.split("|"); comp.take(Number(tp[0]), tp[1]); return; }
        if ((t = el.getAttribute("data-cpc"))) { comp.sel(Number(t)); return; }
        if ((t = el.getAttribute("data-cps"))) { comp.nudge(Number(t)); return; }
        if (v === "back" || v === "arr") { leave(v); return; }
        if (v === "play") { compPlay("all"); renderComp(root, ctl); return; }
        if (v === "seam") { compPlay("seam"); renderComp(root, ctl); return; }
        if (v === "stop") { transportStop(); rerender(); return; }
        if (v === "undo") { comp.undo(); if (st.root) { rerender(); } return; }
        if (v === "add") { comp.add(); return; }
        if (v === "del") { comp.del(); return; }
        if (v === "apply") { comp.apply(); return; }
        if (v === "cancel") { comp.cancel(); return; }
        if (v === "off") { comp.off(); return; }
        if (v === "atv") {
          var d = comp.cur(), sj = Math.min(d.sel, d.cuts.length - 1), a = window.prompt ? window.prompt("切りかえ " + (sj + 1) + " の位置（クリップの頭からの秒・1ms まで）", fsec(d.cuts[sj])) : null;
          if (a !== null && a !== undefined && String(a).replace(/\s/g, "") !== "" && isFinite(Number(a))) { comp.setAt(sj, Number(a)); }
        }
      };
    }
    bindProjBar(root, ctl);
    drawHead();
  }

  // ---------- §341 9A-13: オーディオ編集 Lite（非破壊: クリップの値だけを変える・元の WAV はそのまま）----------
  var FADES = [0, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2], AE_W = 340, AE_H = 96;
  function openAedit(id) {
    var f = DM().findClip(project(), id);
    if (!f || f.clip.type !== "audio") { return false; }
    st.view = "aedit"; st.sel = { kind: "clip", id: id }; st.aedit = { clip: id, msg: "" };
    return true;
  }
  function fsec(x) { return (Math.round(x * 1000) / 1000).toFixed(3); }
  function fms(x) { var v = Math.round(x * 10) / 10; return (v > 0 ? "+" : (v < 0 ? "&#x2212;" : "")) + Math.abs(v) + "ms"; }
  function fadeText(x) { return x >= 1 ? (Math.round(x * 100) / 100) + " 秒" : (x > 0 ? Math.round(x * 1000) + "ms" : "なし"); }
  // アレンジのクリップの欄に出す、編集の要約（編集していなければ出さない）
  function aeditSummary(p, c) {
    var sp = DM().audioSpan(p, c), out = [], nt = DM().takesOf(p, c).length;
    var cpS = DM().compOf(p, c); // 9A-16
    if (cpS) { out.push("&#x1F3A7; 組み合わせ " + escHtml(cpS.secs.join("→")) + "（" + cpS.ats.map(fsec).join("・") + " 秒）"); }
    else if (nt > 1) { out.push("テイク " + DM().activeTakeId(c) + "（" + nt + " 個）"); } // 9A-14
    if (!sp.edited && nt < 2) { return ""; }
    if (c.hasOwnProperty("trimIn") || c.hasOwnProperty("trimOut")) { out.push("鳴る所 素材の " + fsec(sp.tin) + "〜" + (isFinite(sp.tout) ? fsec(sp.tout) : "?") + " 秒"); }
    if (sp.nudge) { out.push("位置 " + fms(sp.nudge)); }
    if (sp.fadeIn || sp.fadeOut) { out.push("フェード " + fadeText(sp.fadeIn) + "／" + fadeText(sp.fadeOut)); }
    return '<br><span class="small">&#x2702;&#xFE0F; ' + out.join("・") + (sp.pre > 0.0005 ? "（曲の頭より前の " + Math.round(sp.pre * 1000) + "ms は鳴りません）" : "") + '</span>';
  }
  var aedit = {
    clip: function () { return st.aedit ? DM().findClip(project(), st.aedit.clip) : null; },
    // 値を変える（↶ に積む・自動保存・試聴中なら鳴らしなおす）
    set: function (o) {
      var f = aedit.clip();
      if (!f) { return { ok: false, why: "クリップが見つかりません" }; }
      var snap = snapTracks(), before = JSON.stringify(f.clip), r = DM().setAudioEdit(project(), f.clip.id, o);
      st.aedit.msg = r.ok ? "" : r.why;
      if (r.ok && JSON.stringify(f.clip) !== before) {
        pushUndo(snap); markDirty();
        if (pl && pl.clip) { aeditPlay(false); } else if (pl) { resync(); }
      }
      if (st.root) { rerender(); }
      return r;
    },
    // ボタン（d: 秒・ms・フェードは ±1 ＝ となりの値）
    step: function (field, d) {
      var f = aedit.clip(), o = {}, i;
      if (!f) { return { ok: false }; }
      var sp = DM().audioSpan(project(), f.clip);
      if (field === "trimIn") { o.trimIn = sp.tin + d; }
      else if (field === "trimOut") { o.trimOut = sp.tout + d; }
      else if (field === "nudge") { o.nudge = sp.nudge + d; }
      else if (field === "fadeIn" || field === "fadeOut") {
        var cur = sp[field], nv = cur;
        if (d > 0) { for (i = 0; i < FADES.length; i++) { if (FADES[i] > cur + 1e-9) { nv = FADES[i]; break; } } }
        else { for (i = FADES.length - 1; i >= 0; i--) { if (FADES[i] < cur - 1e-9) { nv = FADES[i]; break; } } }
        o[field] = nv;
      } else { return { ok: false }; }
      return aedit.set(o);
    },
    reset: function () { return aedit.set({ reset: true }); }
  };
  // 試聴: solo ＝ このクリップだけくり返し／でなければ 伴奏と（クリップの 1 小節前から・くり返さない）
  function aeditPlay(withAll) {
    var f = aedit.clip(), M = DM(), p = project();
    if (!f) { return false; }
    var sp = segsExtent(p, f.clip); // 9A-16: コンピングなら 2 つの区間の全体
    if (withAll) { return startPlay({ from: Math.max(0, f.clip.start - M.barTicks(p)), loop: false }); }
    var a = Math.max(0, Math.floor(M.secToTick(p, Math.max(0, sp.p0)))), b = Math.max(a + 1, Math.ceil(M.secToTick(p, sp.p1)) + 1);
    return startPlay({ clip: f.clip.id, a: a, b: b, from: a, loop: true });
  }
  // 素材の全体の波形（画面の幅）: 鳴る所・鳴らない所（暗い）・フェードの線
  function aeditSvg(p, c, sp) {
    var pk = aud.peaks[c.asset], dur = sp.dur, mid = AE_H / 2, on = "", off = "", x;
    if (!pk || !pk.length || !isFinite(dur) || !(dur > 0)) { return '<div class="ae-nowave small">&#x23F3; 波形を読みこんでいます…</div>'; }
    var u0 = sp.tin + sp.pre, u1 = sp.tin + (sp.p1 - sp.p0), PR = DM().PEAK_RATE;
    for (x = 0; x < AE_W; x += 2) {
      var a = x / AE_W * dur, b = (x + 2) / AE_W * dur, i0 = Math.floor(a * PR), i1 = Math.max(i0 + 1, Math.ceil(b * PR)), m = 0, i;
      for (i = i0; i < i1 && i < pk.length; i++) { if (pk[i] > m) { m = pk[i]; } }
      var hh = Math.max(0.5, m / 255 * (AE_H / 2 - 4)), seg = "M" + (x + 0.5) + " " + (Math.round((mid - hh) * 10) / 10) + "V" + (Math.round((mid + hh) * 10) / 10);
      if (b > u0 && a < u1) { on += seg; } else { off += seg; }
    }
    function X(u) { return Math.round(Math.max(0, Math.min(1, u / dur)) * AE_W * 10) / 10; }
    function Y(v) { return Math.round((4 + (1 - v) * (AE_H - 8)) * 10) / 10; }
    var ev = { gain: 1, fadeIn: sp.fadeIn, fadeOut: sp.fadeOut, p0: sp.p0, endSec: sp.p1 }, s0 = Math.max(0, sp.p0), env = audEnv(ev, s0, sp.p1, false, false), pts = [], k;
    for (k = 0; k < env.length; k++) { pts.push(X(env[k][0] - sp.A + sp.so) + "," + Y(env[k][1])); }
    return '<svg class="ae-svg" viewBox="0 0 ' + AE_W + ' ' + AE_H + '" preserveAspectRatio="none" aria-hidden="true">' +
      '<rect class="ae-dim" x="0" y="0" width="' + X(u0) + '" height="' + AE_H + '"/><rect class="ae-dim" x="' + X(u1) + '" y="0" width="' + Math.max(0, AE_W - X(u1)) + '" height="' + AE_H + '"/>' +
      '<path class="ae-off" d="' + off + '"/><path class="ae-on" d="' + on + '"/>' +
      (sp.fadeIn || sp.fadeOut ? '<polyline class="ae-env" points="' + pts.join(" ") + '"/>' : '') +
      '<line class="ae-cut" x1="' + X(u0) + '" y1="0" x2="' + X(u0) + '" y2="' + AE_H + '"/><line class="ae-cut" x1="' + X(u1) + '" y1="0" x2="' + X(u1) + '" y2="' + AE_H + '"/></svg>';
  }
  function aeditHtml(p, f) {
    var M = DM(), c = f.clip, sp = M.audioSpan(p, c), a = sp.asset, bar = M.tickToBar(p, c.start).bar, playing = !!(pl && pl.clip === c.id), i;
    function bb(field, list) { var h = '', k; for (k = 0; k < list.length; k++) { h += '<button class="modal-btn ae-b" data-aeb="' + field + '|' + list[k][0] + '">' + list[k][1] + '</button>'; } return h; }
    function row(field, label, val, btns) { return '<div class="ae-row"><span class="ae-lab">' + label + '</span><button class="ae-val" data-aev="' + field + '" title="数字で入れる">' + val + '</button></div><div class="ae-btns">' + btns + '</div>'; }
    var T = [["-0.1", "&#x2212;0.1s"], ["-0.01", "&#x2212;10ms"], ["0.01", "＋10ms"], ["0.1", "＋0.1s"]];
    var h = '<div class="daw ae">' +
      '<div class="daw-top"><button class="modal-btn daw-small" data-ae="back">&#x2190; アレンジ</button><b>&#x2702;&#xFE0F; ' + escHtml(clipLabel(c)) + '</b><span class="daw-pname">' + escHtml(f.track.name) + '</span></div>' +
      projBarHtml(p) +
      '<div class="daw-transport"><button class="modal-btn daw-tbtn' + (playing ? " daw-on" : "") + '" data-ae="play" title="この音だけ（くり返し）">&#x25B6;&#xFE0F;</button>' +
        '<button class="modal-btn daw-small ae-all' + (pl && !pl.clip ? " daw-on" : "") + '" data-ae="playAll" title="伴奏といっしょに（1 小節前から）">&#x25B6;&#xFE0F; 伴奏と</button>' +
        '<button class="modal-btn daw-tbtn" data-ae="stop" title="停止">&#x23F9;&#xFE0F;</button>' +
        '<button class="modal-btn daw-tbtn" data-ae="undo" title="戻す"' + (st.undo.length ? '' : ' disabled') + '>&#x21B6;<small>' + (st.undo.length || '') + '</small></button><span class="daw-pos">1.1</span></div>' +
      '<div class="ae-wave">' + aeditSvg(p, c, sp) + '<i class="ae-ph" style="display:none;"></i></div>' +
      '<div class="small ae-info">素材 ' + escHtml(a ? a.name : "?") + '（' + (isFinite(sp.dur) ? fsec(sp.dur) + ' 秒' : '?') + '）・鳴る所 ' + fsec(sp.tin) + '〜' + (isFinite(sp.tout) ? fsec(Math.min(sp.tout, sp.tin + sp.p1 - sp.p0)) : '?') + ' 秒（' + fsec(Math.max(0, sp.p1 - sp.p0)) + ' 秒）・' + bar + ' 小節目の頭 ' + (sp.nudge ? fms(sp.nudge) : '') +
        (sp.pre > 0.0005 ? '<br>&#x26A0;&#xFE0F; 曲の頭より前の ' + Math.round(sp.pre * 1000) + 'ms は鳴りません（位置を ＋ にするか、クリップを後ろの小節へ）' : '') +
        (sp.boxCut ? '<br>&#x2702;&#xFE0F; クリップの箱（' + Math.round(c.len / M.barTicks(p)) + ' 小節）で切れています' : '') + '</div>' +
      takesHtml(p, c) + // 9A-14
      row("trimIn", "先頭", fsec(sp.tin) + " 秒", bb("trimIn", T)) +
      row("trimOut", "末尾", (isFinite(sp.tout) ? fsec(sp.tout) : "?") + " 秒", bb("trimOut", T)) +
      row("nudge", "位置の微調整", fms(sp.nudge), bb("nudge", [["-100", "&#x2212;100"], ["-10", "&#x2212;10"], ["-1", "&#x2212;1"], ["1", "＋1"], ["10", "＋10"], ["100", "＋100"]])) +
      row("fadeIn", "フェードイン", fadeText(sp.fadeIn), bb("fadeIn", [["-1", "&#x2212;"], ["1", "＋"]])) +
      row("fadeOut", "フェードアウト", fadeText(sp.fadeOut), bb("fadeOut", [["-1", "&#x2212;"], ["1", "＋"]])) +
      '<div class="da-btns"><button class="modal-btn da-wide" data-ae="reset"' + (sp.edited ? '' : ' disabled') + '>&#x21BA; 編集をもとに戻す（元の音）</button></div>' +
      (st.aedit.msg ? '<div class="daw-msg">&#x26A0;&#xFE0F; ' + escHtml(st.aedit.msg) + '</div>' : '') +
      (st.msg ? '<div class="daw-msg">&#x26A0;&#xFE0F; ' + escHtml(st.msg) + '</div>' : '') +
      saveNoteHtml() +
      '<p class="small dsv-note">元の WAV は変えません（クリップの値だけ）。先頭・末尾は素材の秒、位置の微調整は ms（&#x2212;1000〜＋1000・小節の位置とは別）。数字をタップすると入力できます。&#x21B6; で戻せます。</p></div>';
    return h;
  }
  function renderAedit(root, ctl) {
    var p = project(), f = aedit.clip();
    if (!f) { st.view = "arr"; st.aedit = null; render(root, ctl); return; }
    audKick(p);
    root.innerHTML = aeditHtml(p, f);
    if (!root.querySelectorAll) { return; }
    var els = root.querySelectorAll("button"), k;
    for (k = 0; k < els.length; k++) {
      els[k].onclick = function (ev) {
        var el = ev.currentTarget, v = el.getAttribute("data-ae"), b = el.getAttribute("data-aeb"), fv = el.getAttribute("data-aev"), tk;
        if ((tk = el.getAttribute("data-tkp"))) { if (hearInfo && hearInfo.id === tk) { takeHearStop(); } else { takeHear(f.clip.id, tk); } renderAedit(root, ctl); return; } // 9A-14
        if ((tk = el.getAttribute("data-tku"))) { takes.select(f.clip.id, tk); return; }
        if ((tk = el.getAttribute("data-tkx"))) { takes.remove(f.clip.id, tk); return; }
        if (el.getAttribute("data-tk") === "rec") { if (pl && pl.clip) { stopPlay(false); } if (recOpenTake(f.clip.id)) { render(root, ctl); } return; }
        if (el.getAttribute("data-tk") === "comp") { if (openComp(f.clip.id)) { render(root, ctl); } return; } // 9A-16
        if (b) { var bp = b.split("|"), fd = bp[0], dv = Number(bp[1]); aedit.step(fd, fd === "fadeIn" || fd === "fadeOut" ? dv : dv); return; }
        if (fv) {
          var sp = DM().audioSpan(project(), f.clip), ms = fv === "nudge" || fv === "fadeIn" || fv === "fadeOut", cur = fv === "trimIn" ? sp.tin : (fv === "trimOut" ? sp.tout : (fv === "nudge" ? sp.nudge : sp[fv] * 1000));
          var lab = { trimIn: "先頭（素材の秒）", trimOut: "末尾（素材の秒）", nudge: "位置の微調整（ms・−1000〜1000）", fadeIn: "フェードイン（ms・0〜10000）", fadeOut: "フェードアウト（ms・0〜10000）" }[fv];
          var a = window.prompt ? window.prompt(lab, String(ms ? Math.round(cur * 10) / 10 : fsec(cur))) : null;
          if (a !== null && a !== undefined && String(a).replace(/\s/g, "") !== "" && isFinite(Number(a))) { var o = {}; o[fv] = fv === "fadeIn" || fv === "fadeOut" ? Number(a) / 1000 : Number(a); aedit.set(o); }
          return;
        }
        if (v === "back") { if (pl && pl.clip) { stopPlay(false); } st.view = "arr"; st.aedit = null; render(root, ctl); return; }
        if (v === "play") { aeditPlay(false); renderAedit(root, ctl); return; }
        if (v === "playAll") { aeditPlay(true); renderAedit(root, ctl); return; }
        if (v === "stop") { transportStop(); rerender(); return; }
        if (v === "undo") { edit.undo(); return; }
        if (v === "reset") { aedit.reset(); }
      };
    }
    bindProjBar(root, ctl);
    drawHead();
  }
  // ---------- §341 9A-6: ミキサー Lite ----------
  // 音量 vol 0〜100（ゲイン ＝ ÷100）・パン pan −1〜1（表示は ×100 で L〜C〜R）・DAW のマスター master.vol 0〜100（ゲイン ＝ ÷100）
  var VOL0 = 80;
  function clampNum(v, lo, hi, d) { v = Number(v); if (!isFinite(v)) { v = d; } return Math.max(lo, Math.min(hi, v)); }
  function panText(pan) { var n = Math.round(pan * 100); return n === 0 ? "C" : (n < 0 ? "L" + (-n) : "R" + n); }
  var mixer = {
    // 動かしているあいだ（保存はしない・音だけ変える）
    setVol: function (id, v) { var t = DM().findTrack(project(), id); if (!t) { return false; } t.vol = Math.round(clampNum(v, 0, 100, VOL0)); if (pl && pl.mix[id]) { setGain(t, pl.mix[id], false); } return true; },
    setPan: function (id, v) { var t = DM().findTrack(project(), id); if (!t) { return false; } t.pan = Math.round(clampNum(v, -1, 1, 0) * 100) / 100; if (pl && pl.mix[id]) { setGain(t, pl.mix[id], false); } return true; },
    setMaster: function (v) { var p = project(); p.master = p.master || { vol: VOL0, rev: 0, dly: 0, fx: { items: [] } }; p.master.vol = Math.round(clampNum(v, 0, 100, VOL0)); setMasterGain(); return true; },
    resetTrack: function (id) { if (!mixer.setVol(id, VOL0) || !mixer.setPan(id, 0)) { return false; } markDirty(); return true; },
    resetMaster: function () { mixer.setMaster(VOL0); markDirty(); return true; },
    setSend: function (id, which, v) { var t = DM().findTrack(project(), id); if (!t) { return { ok: false }; } var r = DM().sendSet(t, which, v); if (r.ok && pl && pl.mix[id]) { var l = [pl.mix[id].main, pl.mix[id].dry], i; for (i = 0; i < l.length; i++) { var g = l[i] && (which === "rev" ? l[i].tr : l[i].td); if (g) { rampTo(g.gain, r.value, false); } } } return r; }, // 9B-11: 動かしているあいだ（つなぎの形が変わるときは、指をはなしたときに鳴らしなおす）
    commit: function () { markDirty(); } // 指をはなしたとき 1 回だけ保存
  };
  function panSupported() { var UG = window.UGMelody, ac = UG && UG.audio && UG.audio.ctx; if (ac) { return !!ac.createStereoPanner; } var AC = window.AudioContext || window.webkitAudioContext; return !!(AC && AC.prototype && AC.prototype.createStereoPanner); }
  function mixHtml(p) {
    var i, h, mv = p.master ? Math.round(clampNum(p.master.vol, 0, 100, VOL0)) : VOL0, ps = panSupported();
    h = '<div class="daw dm">' +
      '<div class="daw-top"><button class="modal-btn daw-small" data-mx="back">&#x2190; アレンジ</button><b>&#x1F39A;&#xFE0F; ミキサー</b></div>' +
      projBarHtml(p) +
      '<div class="daw-transport"><button class="modal-btn daw-tbtn' + (pl ? " daw-on" : "") + '" data-mx="play" title="再生">&#x25B6;&#xFE0F;</button><button class="modal-btn daw-tbtn" data-mx="stop" title="停止">&#x23F9;&#xFE0F;</button><span class="daw-pos">1.1</span></div>' +
      '<div class="dm-row dm-master"><div class="dm-name"><b>DAW のマスター</b><span class="small"></span><button class="modal-btn dm-fxb dm-mfx' + (DM().masterLive(p).sig ? " on" : "") + '" data-mx="masterFx" title="マスター EQ・ピークリミッター">&#x1F39A;&#xFE0F; MASTER</button><button class="modal-btn dm-fxb dm-sfx' + (DM().sendLive(p).rev || DM().sendLive(p).dly ? " on" : "") + '" data-mx="sendFx" title="リバーブ・ディレイ（センドの戻り）">&#x1F30A; FX</button></div>' +
        '<div class="dm-ctl"><span class="dm-lab">音量</span><input type="range" class="dm-fader" min="0" max="100" step="1" value="' + mv + '" data-mxv="master" aria-label="マスター音量"><b class="dm-val" data-mxval="master">' + mv + '</b>' +
        '<button class="modal-btn dm-reset" data-mx="resetMaster" title="80 に戻す">&#x21BA;</button></div></div>';
    if (!ps) { h += '<p class="small dsv-note">このブラウザでは左右（パン）を変えられません（音量・M／S は使えます）。</p>'; }
    for (i = 0; i < p.tracks.length; i++) {
      var t = p.tracks[i], pv = Math.round(clampNum(t.pan, -1, 1, 0) * 100), tv = Math.round(clampNum(t.vol, 0, 100, VOL0)), M9 = DM(), av = M9.autoActive(t, "vol"), ap = M9.autoActive(t, "pan"), snd = M9.sendOf(t); // 9B-9: オートメーション中はフェーダーを止める
      h += '<div class="dm-row"><div class="dm-name">' + ((t.ext && t.ext.icon) || "&#x1F3B5;") + ' <b>' + escHtml(t.name) + '</b> <span class="small">' + instName(t) + '</span>' +
          '<button class="modal-btn dm-fxb' + (DM().fxLive(t).sig ? " on" : "") + '" data-mxf="' + t.id + '" title="EQ・コンプ">&#x1F39B;&#xFE0F; FX</button>' +
          '<span class="daw-ms dm-ms"><button class="daw-m' + (t.mute ? " on" : "") + '" data-mxm="' + t.id + '">M</button><button class="daw-s' + (t.solo ? " on" : "") + '" data-mxs="' + t.id + '">S</button></span></div>' +
        '<div class="dm-ctl"><span class="dm-lab">音量</span><input type="range" class="dm-fader" min="0" max="100" step="1" value="' + tv + '" data-mxv="' + t.id + '" aria-label="' + escHtml(t.name) + ' の音量"' + (av ? ' disabled' : '') + '><b class="dm-val" data-mxval="' + t.id + '">' + (av ? '&#x1F4C8;' : tv) + '</b>' +
          '<button class="modal-btn dm-reset" data-mxr="' + t.id + '" title="音量 80・パン C に戻す">&#x21BA;</button></div>' +
        '<div class="dm-ctl dm-send"><span class="dm-lab">REV</span><input type="range" class="dm-fader dm-sf" min="0" max="100" step="1" value="' + Math.round(snd.rev * 100) + '" data-mxsr="' + t.id + '" aria-label="' + escHtml(t.name) + ' のリバーブの送り"><b class="dm-val dm-sv" data-mxsrv="' + t.id + '">' + Math.round(snd.rev * 100) + '%</b><span class="dm-lab">DLY</span><input type="range" class="dm-fader dm-sf" min="0" max="100" step="1" value="' + Math.round(snd.dly * 100) + '" data-mxsd="' + t.id + '" aria-label="' + escHtml(t.name) + ' のディレイの送り"><b class="dm-val dm-sv" data-mxsdv="' + t.id + '">' + Math.round(snd.dly * 100) + '%</b></div>' +
        '<div class="dm-ctl"><span class="dm-lab">パン</span><input type="range" class="dm-fader dm-pan" min="-100" max="100" step="1" value="' + pv + '" data-mxp="' + t.id + '" aria-label="' + escHtml(t.name) + ' の左右"' + (ps && !ap ? '' : ' disabled') + '><b class="dm-val" data-mxpval="' + t.id + '">' + (ap ? '&#x1F4C8;' : panText(pv / 100)) + '</b><button class="modal-btn dm-autob' + (av || ap || M9.autoActive(t, "eq.low") || M9.autoActive(t, "eq.mid") || M9.autoActive(t, "eq.high") ? " on" : "") + '" data-mxa="' + t.id + '" title="オートメーション">&#x1F4C8;</button></div></div>';
    }
    return h + saveNoteHtml() + '<p class="small dsv-note">フェーダーは指で左右に動かします。↺ で初期値（音量 80・パン C・マスター 80）に戻ります。REV・DLY はリバーブ・ディレイへの送り（音量・パンのあと）。🌊 FX で戻りの量・ディレイの時間。🎛️ FX でトラックごとの EQ・コンプ。📈 でオートメーション（その間はフェーダー・パンが止まります）。音量・パン・マスター・FX は ↶ の対象外です。</p></div>';
  }
  function renderMix(root, ctl) {
    var p = project();
    root.innerHTML = mixHtml(p);
    if (!root.querySelectorAll) { return; }
    var M = DM(), els = root.querySelectorAll("button"), k;
    for (k = 0; k < els.length; k++) {
      els[k].onclick = function (ev) {
        var el = ev.currentTarget, v = el.getAttribute("data-mx"), id;
        if (v === "back") { st.view = "arr"; render(root, ctl); return; }
        if (v === "play") { startPlay(); renderMix(root, ctl); return; }
        if (v === "stop") { transportStop(); renderMix(root, ctl); return; }
        if (v === "resetMaster") { mixer.resetMaster(); renderMix(root, ctl); return; }
        if (v === "masterFx") { st.view = "master"; renderMaster(root, ctl); return; } // 9B-10
        if (v === "sendFx") { st.view = "sendfx"; renderSendFx(root, ctl); return; } // 9B-11
        if ((id = el.getAttribute("data-mxr"))) { mixer.resetTrack(id); renderMix(root, ctl); return; }
        if ((id = el.getAttribute("data-mxa"))) { if (M.findTrack(p, id)) { openAuto(id, "mix"); renderAuto(root, ctl); } return; } // 9B-9
        if ((id = el.getAttribute("data-mxf"))) { if (M.findTrack(p, id)) { st.view = "fx"; st.fxTrack = id; renderFx(root, ctl); } return; } // 9B-8
        if ((id = el.getAttribute("data-mxm"))) { var tm = M.findTrack(p, id); if (tm) { tm.mute = !tm.mute; updateMix(); markDirty(); } renderMix(root, ctl); return; }
        if ((id = el.getAttribute("data-mxs"))) { var ts = M.findTrack(p, id); if (ts) { ts.solo = !ts.solo; updateMix(); markDirty(); } renderMix(root, ctl); }
      };
    }
    bindProjBar(root, ctl); // 9A-9: ほかのボタンのあとに付ける（前は上書きされて 📁 曲・曲名・💾 が効かなかった）
    var rs = root.querySelectorAll("input[type=range]");
    for (k = 0; k < rs.length; k++) {
      rs[k].oninput = function (ev) {
        var el = ev.currentTarget, id = el.getAttribute("data-mxv"), pid = el.getAttribute("data-mxp"), lab;
        if (id === "master") { mixer.setMaster(el.value); lab = root.querySelector('[data-mxval="master"]'); if (lab) { lab.textContent = String(Math.round(el.value)); } return; }
        if (id) { mixer.setVol(id, el.value); lab = root.querySelector('[data-mxval="' + id + '"]'); if (lab) { lab.textContent = String(Math.round(el.value)); } return; }
        if (pid) { mixer.setPan(pid, Number(el.value) / 100); lab = root.querySelector('[data-mxpval="' + pid + '"]'); if (lab) { lab.textContent = panText(Number(el.value) / 100); } return; }
        var sr = el.getAttribute("data-mxsr"), sd = el.getAttribute("data-mxsd"); // 9B-11: センド
        if (sr || sd) { mixer.setSend(sr || sd, sr ? "rev" : "dly", Number(el.value) / 100); lab = root.querySelector(sr ? '[data-mxsrv="' + sr + '"]' : '[data-mxsdv="' + sd + '"]'); if (lab) { lab.textContent = Math.round(el.value) + "%"; } }
      };
      rs[k].onchange = function (ev) { var el = ev.currentTarget; if (el.getAttribute("data-mxsr") || el.getAttribute("data-mxsd")) { mixer.commit(); sendUpdate(); renderMix(root, ctl); return; } mixer.commit(); };
    }
    drawHead();
  }

  // ---------- §342 9B-8: 🎛️ FX の画面（EQ・コンプ・バイパス）----------
  // つまみ: [part, key, 画面の倍率, 単位, 名前, 小さい説明]（Attack・Release は秒で持ち ms で見せる）
  var FX_ROWS = { eq: [["eq", "low", 1, "dB", "LOW", "150Hz"], ["eq", "mid", 1, "dB", "MID", "1kHz"], ["eq", "high", 1, "dB", "HIGH", "7kHz"]],
    comp: [["comp", "threshold", 1, "dB", "Threshold", "しきい"], ["comp", "ratio", 1, ":1", "Ratio", "比"], ["comp", "attack", 1000, "ms", "Attack", "かかり"], ["comp", "release", 1000, "ms", "Release", "もどり"], ["comp", "makeup", 1, "dB", "Makeup", "持ち上げ"]],
    lim: [["lim", "ceiling", 1, "dBFS", "Ceiling", "上限"], ["lim", "gain", 1, "dB", "Input", "入力"], ["lim", "release", 1000, "ms", "Release", "もどり"]] }; // 9B-10
  function fxBoosted(p) { var i; for (i = 0; i < p.tracks.length; i++) { if (DM().audible(p, p.tracks[i]) && DM().fxBoost(p.tracks[i]) > 0) { return true; } } return false; }
  function fxDef(r) { var M = DM(); if (r[0] === "rev" || r[0] === "dly") { return M.SEND_FX[r[0]][r[1]]; } return (r[0] === "eq" ? M.FX_EQ : (r[0] === "lim" ? M.FX_LIM : M.FX_COMP))[r[1]]; }
  function fxShow(v, r) { var x = Math.round(v * r[2] * 1000) / 1000; return String(r[2] > 1 ? Math.round(x) : x); }
  var fxApi = {
    // 動かしているあいだ（保存はしない・音だけ変える）。v は画面の単位（ms など）
    set: function (id, part, key, v) {
      var t = DM().findTrack(project(), id), r = null, i, l = FX_ROWS[part] || [];
      if (!t) { return { ok: false }; }
      for (i = 0; i < l.length; i++) { if (l[i][1] === key) { r = l[i]; } }
      var out = DM().fxSet(t, part, key, key === "on" || part === "bypass" ? v : (r ? Number(v) / r[2] : v));
      if (out.ok) { fxUpdate(t); }
      return out;
    },
    reset: function (id, part) { var t = DM().findTrack(project(), id); if (!t) { return false; } DM().fxReset(t, part); fxUpdate(t); markDirty(); return true; },
    commit: function () { markDirty(); },
    reduction: function (id) { return fxReduction(id); },
    nodes: function (id) { var mx = pl && pl.mix[id], o = { main: null, dry: null }; if (mx) { if (mx.main && mx.main.inp) { o.main = { sig: mx.main.sig, n: mx.main.br ? mx.main.br.nodes.length : 0 }; } if (mx.dry && mx.dry.inp) { o.dry = { sig: mx.dry.sig, n: mx.dry.br ? mx.dry.br.nodes.length : 0 }; } } return o; } // テスト・確かめ用
  };
  function fxRowHtml(t, f, r) {
    var lk = r[0] === "eq" && DM().autoActive(t, "eq." + r[1]), df = fxDef(r), v = f[r[0]][r[1]], nm = r[0] + "." + r[1], lo = fxShow(df[1], r), hi = fxShow(df[2], r), stp = r[2] > 1 ? "1" : String(df[3]), sv = fxShow(v, r);
    return '<div class="dm-ctl dfx-row"><span class="dfx-lab">' + r[4] + '<small>' + r[5] + '</small></span>' +
      '<input type="range" class="dm-fader" min="' + lo + '" max="' + hi + '" step="' + stp + '" value="' + sv + '" data-fxr="' + nm + '" aria-label="' + r[4] + '"' + (lk ? ' disabled' : '') + '>' +
      '<input type="number" class="dfx-num" inputmode="decimal" min="' + lo + '" max="' + hi + '" step="' + stp + '" value="' + sv + '" data-fxn="' + nm + '" aria-label="' + r[4] + ' の数字"' + (lk ? ' disabled' : '') + '><span class="dfx-unit">' + (lk ? '&#x1F4C8;' : r[3]) + '</span></div>';
  }
  function fxHtml(p, t) {
    var M = DM(), f = M.fxOf(t), live = M.fxLive(t), boost = M.fxBoost(t), i, h;
    function tog(on, nm, a, b) { return '<button class="modal-btn dfx-tog' + (on ? " on" : "") + '" data-fx="' + nm + '">' + (on ? a : b) + '</button>'; }
    h = '<div class="daw dm dfx">' +
      '<div class="daw-top"><button class="modal-btn daw-small" data-fx="back">&#x2190; ミキサー</button><b>&#x1F39B;&#xFE0F; FX</b></div>' +
      '<div class="daw-transport"><button class="modal-btn daw-tbtn' + (pl ? " daw-on" : "") + '" data-fx="play" title="再生">&#x25B6;&#xFE0F;</button><button class="modal-btn daw-tbtn" data-fx="stop" title="停止">&#x23F9;&#xFE0F;</button><span class="daw-pos">1.1</span></div>' +
      '<div class="dm-row dfx-track"><div class="dm-name">' + ((t.ext && t.ext.icon) || "&#x1F3B5;") + ' <b>' + escHtml(t.name) + '</b> <span class="small">' + instName(t) + '</span></div></div>' +
      '<div class="dm-row' + (f.bypass ? " dfx-off" : "") + '"><div class="dfx-sw"><b>FX 全体</b>' + tog(!f.bypass, "bypass", "ON", "バイパス") + '</div>' +
        '<p class="small dfx-note">' + (f.bypass ? "バイパス中: EQ・コンプを通さない（前と同じ音）。" : (live.sig ? "効いています: パン → " + (live.eq ? "EQ" : "") + (live.eq && live.comp ? " → " : "") + (live.comp ? "コンプ" : "") + " → 音量。" : "いまは何も効いていません（前と同じ音）。")) + '</p></div>' +
      '<div class="dm-row' + (f.eq.on && !f.bypass ? "" : " dfx-off") + '"><div class="dfx-sw"><b>EQ（3 バンド）</b>' + tog(f.eq.on, "eqOn", "ON", "OFF") + '<button class="modal-btn dm-reset" data-fx="eqReset" title="3 つとも 0dB に">&#x21BA;</button></div>';
    for (i = 0; i < FX_ROWS.eq.length; i++) { h += fxRowHtml(t, f, FX_ROWS.eq[i]); }
    h += '</div><div class="dm-row' + (f.comp.on && !f.bypass ? "" : " dfx-off") + '"><div class="dfx-sw"><b>コンプレッサー</b>' + tog(f.comp.on, "compOn", "ON", "OFF") + '<button class="modal-btn dm-reset" data-fx="compReset" title="はじめの値に">&#x21BA;</button></div>';
    for (i = 0; i < FX_ROWS.comp.length; i++) { h += fxRowHtml(t, f, FX_ROWS.comp[i]); }
    h += '<p class="small dfx-note">いまの圧縮: <b class="dfx-gr">—</b>（再生中・コンプが ON のとき）</p></div>' +
      '<p class="small dfx-warn"' + (boost > 0 ? '' : ' hidden') + '>&#x26A0;&#xFE0F; 音が大きくなります（いちばん大きい＋ ' + boost + 'dB）。Makeup・EQ の＋は音量を上げるだけで、音割れは防ぎません。割れたら値かトラックの音量を下げてください（WAV の書き出しで、割れたところを数えて知らせます）。</p>' +
      '<button class="modal-btn daw-small dfx-all" data-fx="resetAll">&#x21BA; 全部をはじめに戻す</button>' +
      saveNoteHtml() + '<p class="small dsv-note">スライダーを動かすと、再生しながら音が変わります。数字を入れても変えられます（範囲に入れます）。EQ ＝ LOW 150Hz・MID 1kHz（Q 1.0）・HIGH 7kHz。コンプ ＝ パンのあと・音量より前（Knee 6dB・ブラウザが自分でかける持ち上げは打ち消して、Makeup の dB だけ上げ下げ）。FX は ↶ の対象外です。</p></div>';
    return h;
  }
  function renderFx(root, ctl) {
    var p = project(), M = DM(), t = M.findTrack(p, st.fxTrack);
    if (!t) { st.view = "mix"; st.fxTrack = null; renderMix(root, ctl); return; }
    root.innerHTML = fxHtml(p, t);
    if (!root.querySelectorAll) { return; }
    var els = root.querySelectorAll("button[data-fx]"), k;
    for (k = 0; k < els.length; k++) {
      els[k].onclick = function (ev) {
        var v = ev.currentTarget.getAttribute("data-fx"), f = M.fxOf(t);
        if (v === "back") { st.view = "mix"; st.fxTrack = null; renderMix(root, ctl); return; }
        if (v === "play") { startPlay(); renderFx(root, ctl); return; }
        if (v === "stop") { transportStop(); renderFx(root, ctl); return; }
        if (v === "bypass") { fxApi.set(t.id, "bypass", "", !f.bypass); markDirty(); }
        else if (v === "eqOn") { fxApi.set(t.id, "eq", "on", !f.eq.on); markDirty(); }
        else if (v === "compOn") { fxApi.set(t.id, "comp", "on", !f.comp.on); markDirty(); }
        else if (v === "eqReset") { fxApi.reset(t.id, "eq"); }
        else if (v === "compReset") { fxApi.reset(t.id, "comp"); }
        else if (v === "resetAll") { fxApi.reset(t.id); }
        renderFx(root, ctl);
      };
    }
    function parts(el, a) { var s = (el.getAttribute(a) || "").split("."); return { part: s[0], key: s[1] }; }
    function warn() { var w = root.querySelector(".dfx-warn"), b = M.fxBoost(t); if (w) { if (b > 0) { w.removeAttribute("hidden"); } else { w.setAttribute("hidden", ""); } } }
    var rs = root.querySelectorAll("input[data-fxr]");
    for (k = 0; k < rs.length; k++) {
      rs[k].oninput = function (ev) {
        var el = ev.currentTarget, q = parts(el, "data-fxr"), r = fxApi.set(t.id, q.part, q.key, el.value), n = root.querySelector('[data-fxn="' + q.part + "." + q.key + '"]');
        if (r.ok && n) { var row = null, i, l = FX_ROWS[q.part]; for (i = 0; i < l.length; i++) { if (l[i][1] === q.key) { row = l[i]; } } n.value = fxShow(r.value, row); }
        warn();
      };
      rs[k].onchange = function () { fxApi.commit(); renderFx(root, ctl); };
    }
    var ns = root.querySelectorAll("input[data-fxn]");
    for (k = 0; k < ns.length; k++) {
      ns[k].onchange = function (ev) { var el = ev.currentTarget, q = parts(el, "data-fxn"); if (String(el.value).replace(/\s/g, "") !== "") { fxApi.set(t.id, q.part, q.key, el.value); fxApi.commit(); } renderFx(root, ctl); };
    }
    drawHead();
  }

  // ---------- §342 9B-13: 📊 曲を解析（LUFS・True Peak）。書き出す WAV（16 bit）のバイトを読んで測るだけ ----------
  // 曲のしるし（同じなら、前に書き出した WAV をそのまま測る）: トラック・テンポ・マスター・素材・ゲームの残響の送り・全体の音量
  function luSig(p) { var A = window.UGMelody && window.UGMelody.audio || {}; return DM().hash(JSON.stringify([p.tracks, p.tempo, p.master, p.assets, A.revSend ? A.revSend.gain.value : null, A.dlySend ? A.dlySend.gain.value : null, A.master ? A.master.gain.value : null])); }
  var lu = { busy: false, state: "idle", pct: 0, msg: "", res: null, job: null };
  function luReadBlob(blob, cb) {
    try {
      if (blob && blob.arrayBuffer) { blob.arrayBuffer().then(function (ab) { cb(ab); }, function () { cb(null); }); return; }
      var fr = new window.FileReader(); fr.onload = function () { cb(fr.result); }; fr.onerror = function () { cb(null); }; fr.readAsArrayBuffer(blob);
    } catch (e) { cb(null); }
  }
  function luFail(msg) { lu.busy = false; lu.state = "fail"; lu.msg = msg; luRedraw(); }
  function luRedraw() { if (st.root && st.view === "lufs") { renderLufs(st.root, st.ctl); } }
  // 1 秒ずつ区切って測る（画面を止めない・大きな配列を作らない）
  function luAnalyze(blob, sig) {
    var M = DM(), job = lu.job;
    lu.state = "read"; luRedraw();
    luReadBlob(blob, function (ab) {
      if (job !== lu.job) { return; }
      var info = ab ? M.parseWav(ab) : null;
      if (!info || !info.ok || info.bits !== 16) { luFail("WAV を読めませんでした"); return; }
      var v = new DataView(ab), sr = info.sr, ch = info.ch, n = info.frames, pos = 0, step = sr, L = new Float32Array(step), Rr = new Float32Array(step), meter = M.loudMeter(sr, { ch: ch }), t0 = Date.now();
      lu.state = "calc"; lu.pct = 0; luRedraw();
      function next() {
        if (job !== lu.job) { return; }
        var m = Math.min(step, n - pos), i, o;
        for (i = 0; i < m; i++) { o = info.dataOffset + (pos + i) * ch * 2; L[i] = v.getInt16(o, true) / 32768; if (ch > 1) { Rr[i] = v.getInt16(o + 2, true) / 32768; } }
        meter.push(L, Rr, m); pos += m; lu.pct = Math.round(pos / Math.max(1, n) * 100);
        var pe = st.root && st.root.querySelector ? st.root.querySelector(".dlu-pct") : null; if (pe) { pe.textContent = lu.pct + "%"; }
        if (pos < n) { setTimeout(next, 0); return; }
        var r = meter.finish();
        r.ms = Date.now() - t0; r.sig = sig; r.lim = wav.stats && wav.stats.lim || ""; r.limMode = wav.stats && wav.stats.limMode || ""; r.ceil = wav.limCeil; r.bits = 16;
        lu.res = r; lu.busy = false; lu.state = "done"; luRedraw();
      }
      next();
    });
  }
  var luApi = {
    // 解析する（曲が前の書き出しと同じなら、その WAV を読む・ちがえば書き出してから）
    run: function () {
      if (lu.busy || wav.busy) { return false; }
      try { if (window.UGMelody && window.UGMelody.audioInit) { window.UGMelody.audioInit(); } } catch (e0) {} // しるしに入る「ゲームの残響の送り」をそろえる（書き出しと同じ準備）
      var p = project(), sig = luSig(p);
      lu.busy = true; lu.msg = ""; lu.pct = 0; lu.job = {}; lu.res = null; // 前の結果は消す（失敗したときに古い数字を残さない）
      if (wav.state === "done" && wav.blob && wav.sig === sig) { lu.reused = true; luAnalyze(wav.blob, sig); return true; }
      lu.reused = false; lu.state = "render"; luRedraw();
      var job = lu.job;
      var ok = wavExport(function () { if (job !== lu.job) { return; } if (wav.state === "done" && wav.blob) { luAnalyze(wav.blob, wav.sig); } else { luFail(wav.msg || "書き出せませんでした"); } });
      if (!ok && lu.busy && wav.state !== "busy") { luFail(wav.msg || "書き出せませんでした"); }
      return true;
    },
    cancel: function () { lu.job = null; lu.busy = false; lu.state = "idle"; if (wav.busy) { wavCancel(); } },
    state: function () { return lu; },
    stale: function () { return !!(lu.res && lu.res.sig !== luSig(project())); }
  };
  function luFmt(v, unit, why) { return v === null || v === undefined || !isFinite(v) ? '<span class="dlu-na">— ' + (why || "") + '</span>' : (Math.round(v * 10) / 10).toFixed(1) + ' ' + unit; }
  function luSvg(r) {
    var s = r.series, W = 340, H = 100, i, pts = [], lo = -60, hi = 0, tmax = Math.max(1, r.sec);
    function Y(v) { return Math.round((hi - Math.max(lo, Math.min(hi, v))) / (hi - lo) * (H - 8) * 10) / 10 + 4; }
    for (i = 0; i < s.length; i++) { if (s[i][1] !== null) { pts.push(Math.round(s[i][0] / tmax * W * 10) / 10 + "," + Y(s[i][1])); } }
    var gl = [-10, -20, -30, -40, -50].map(function (v) { return '<line class="dlu-gl" x1="0" x2="' + W + '" y1="' + Y(v) + '" y2="' + Y(v) + '"/><text class="dlu-gt" x="2" y="' + (Y(v) - 2) + '">' + v + '</text>'; }).join("");
    var il = r.integrated !== null ? '<line class="dlu-il" x1="0" x2="' + W + '" y1="' + Y(r.integrated) + '" y2="' + Y(r.integrated) + '"/>' : "";
    var lb = r.lra !== null && r.lra !== undefined ? '<rect class="dlu-lrab" x="0" width="' + W + '" y="' + Y(r.lraHigh) + '" height="' + Math.max(0.5, Y(r.lraLow) - Y(r.lraHigh)) + '"/>' : ""; // 9B-17
    return '<svg class="dlu-g" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="Short-Term ラウドネスのグラフ">' + lb + gl + il + (pts.length > 1 ? '<polyline class="dlu-line" points="' + pts.join(" ") + '"/>' : '') + '</svg>';
  }
  function luHtml(p) {
    var r = lu.res, h, stale = luApi.stale(), busy = lu.busy;
    h = '<div class="daw dm dfx dlu">' +
      '<div class="daw-top"><button class="modal-btn daw-small" data-lu="back">&#x2190; MASTER</button><b>&#x1F4CA; 曲を解析</b></div>' +
      '<p class="small dfx-note">書き出す WAV（16 bit）をそのまま測ります（MASTER の EQ・リミッター・残響・余韻のあと）。音・曲・WAV は変えません。結果は保存しません。</p>' +
      '<div class="da-btns"><button class="modal-btn da-wide dlu-run" data-lu="run"' + (busy ? ' disabled' : '') + '>&#x1F4CA; ' + (r ? 'もう一度解析する' : '解析する') + '</button>' + (busy ? '<button class="modal-btn da-half" data-lu="cancel">やめる</button>' : '') + '</div>';
    if (busy) { h += '<p class="small dfx-note">' + (lu.state === "render" ? 'WAV を書き出しています… <b class="dlu-wpct">' + (wav.pct ? wav.pct + '%' : '') + '</b>（そのあとで測ります）' : (lu.state === "read" ? "WAV を読んでいます…" : 'ラウドネスを計算しています… <b class="dlu-pct">' + lu.pct + '%</b>')) + '</p>'; }
    if (lu.state === "fail") { h += '<p class="small dfx-warn">&#x26A0;&#xFE0F; ' + escHtml(lu.msg) + '（曲は変えていません）</p>'; }
    if (r && !busy) {
      var warn = [];
      if (stale) { warn.push("解析のあとで曲を変えたので、この数字は古くなっています。もう一度解析してください。"); }
      if (r.lim === "none") { warn.push("この WAV はリミッターを使えずに書き出されました（このブラウザでは AudioWorklet が使えません）。リミッターなしの音を測っています。"); }
      if (r.ceil !== null && r.ceil !== undefined && r.truePeak !== null && r.truePeak > r.ceil) { warn.push(r.limMode === "tp" && r.lim === "ok" ? "True Peak モードで書き出しましたが、True Peak（4× 推定）が Ceiling（" + r.ceil + " dBTP）より " + (Math.round((r.truePeak - r.ceil) * 100) / 100).toFixed(2) + " dB 上です。" : "True Peak（4× 推定）が、リミッターの Ceiling（" + r.ceil + " dBFS）より " + (Math.round((r.truePeak - r.ceil) * 10) / 10).toFixed(1) + " dB 上です（サンプルピークのモードは、サンプルの間のピークを抑えません。🎚️ MASTER で「True Peak」のモードにすると抑えます）。"); } // 9B-16
      if (r.truePeak !== null && r.truePeak > 0) { warn.push("True Peak（4× 推定）が 0 dBTP をこえています。ほかの形式（MP3 など）に変えたり、ほかの機械で鳴らしたりすると、割れることがあります。"); }
      h += '<div class="dm-row dlu-res">' +
        '<div class="dlu-kv"><span>Integrated（曲全体）</span><b class="dlu-i">' + luFmt(r.integrated, "LUFS", r.tooShortM ? "（400ms 未満）" : (r.silent ? "（無音・−70 LUFS より小さい）" : "")) + '</b></div>' +
        '<div class="dlu-kv"><span>最大 Momentary（400ms）</span><b>' + luFmt(r.maxM, "LUFS", r.tooShortM ? "（400ms 未満）" : "（無音）") + '</b></div>' +
        '<div class="dlu-kv"><span>最大 Short-Term（3 秒）</span><b>' + luFmt(r.maxS, "LUFS", r.tooShortS ? "（3 秒未満）" : "（無音）") + '</b></div>' +
        '<div class="dlu-kv"><span>LRA（Loudness Range）</span><b class="dlu-lra">' + luFmt(r.lra, "LU", r.lraWhy === "short" ? "（3 秒未満）" : (r.lraWhy === "silent" ? "（無音・−70 LUFS より小さい）" : "")) + '</b></div>' +
        '<div class="dlu-kv"><span>Short-Term の 10％ ／ 95％</span><b>' + (r.lra === null || r.lra === undefined ? '<span class="dlu-na">—</span>' : luFmt(r.lraLow, "LUFS", "") + ' ／ ' + luFmt(r.lraHigh, "LUFS", "")) + '</b></div>' +
        '<div class="dlu-kv"><span>Sample Peak</span><b>' + luFmt(r.samplePeak, "dBFS", "（無音）") + '</b></div>' +
        '<div class="dlu-kv"><span>True Peak（4× 推定）</span><b class="dlu-tp">' + luFmt(r.truePeak, "dBTP", "（無音）") + '</b></div>' +
        '<div class="dlu-kv"><span>True Peak − Sample Peak</span><b>' + luFmt(r.diff, "dB", "") + '</b></div>' +
        '<div class="dlu-kv"><span>長さ（余韻もふくむ）</span><b>' + (Math.round(r.sec * 100) / 100).toFixed(2) + ' 秒</b></div>' +
        '<div class="dlu-kv"><span>サンプルレート・形</span><b>' + r.sr + ' Hz・' + r.bits + ' bit・' + (r.ch === 2 ? 'ステレオ' : 'モノ') + '</b></div>' +
        '<p class="small dfx-note">Short-Term（3 秒）の変化（横 ＝ 時間・点線 ＝ Integrated・うすい帯 ＝ LRA の範囲（10％〜95％））</p>' + luSvg(r) +
        '<p class="small dfx-note">LRA は、曲全体の音量の変わり方の幅です（Short-Term の大きさの分布の 10％ と 95％ の差・とても小さい音と、いちばん大きい 5％ は入れない）。波形のいちばん大きいところと小さいところの差ではありません。大きい・小さいで音のよしあしは決まりません（曲の作りによってちがいます）。</p>' +
        '<p class="small dfx-note">計算 ' + (r.ms / 1000).toFixed(2) + ' 秒' + (lu.reused ? '（前に書き出した WAV を使いました）' : '（WAV を書き出して測りました）') + '</p></div>';
      if (warn.length) { h += '<p class="small dfx-warn">&#x26A0;&#xFE0F; ' + warn.join('<br>&#x26A0;&#xFE0F; ') + '</p>'; }
    }
    h += '<p class="small dsv-note">測り方: ITU-R BS.1770-5（K 特性・ゲート −70 LUFS と −10 LU）と EBU Tech 3341（Momentary 400ms・Short-Term 3 秒）。LRA は EBU Tech 3342（Short-Term を 0.1 秒ごと・ゲート −70 LUFS と −20 LU・10％ と 95％。WAV の終わりに 1.5 秒の無音があるとして数える・WAV は変えない）。True Peak は 4 倍のオーバーサンプリングで出した推定です（規格の試験をすべて通したものではありません）。<br>' +
      '数字の目安: −23 LUFS は EBU R128（放送）の目安で、すべての曲の目標ではありません。配信サービスごとに目安はちがいます。LUFS が大きいほど音がよい、というわけではありません。True Peak が低くても、ほかの形式に変えたときなどに音割れが絶対に起きないとは言えません。音量を自動でそろえる機能はありません。</p></div>';
    return h;
  }
  function renderLufs(root, ctl) {
    root.innerHTML = luHtml(project());
    if (!root.querySelectorAll) { return; }
    var els = root.querySelectorAll("button[data-lu]"), k;
    for (k = 0; k < els.length; k++) {
      els[k].onclick = function (ev) {
        var v = ev.currentTarget.getAttribute("data-lu");
        if (v === "back") { st.view = "master"; renderMaster(root, ctl); return; }
        if (v === "run") { luApi.run(); renderLufs(root, ctl); return; }
        if (v === "cancel") { luApi.cancel(); renderLufs(root, ctl); }
      };
    }
  }

  // ---------- §342 9B-12: ⏱ テンポ（曲の頭の BPM・変更点）----------
  // 再生中にオートメーション・ディレイの予約があるか（テンポを変えたら鳴らしなおす）
  function tempoSched(p) { var M = DM(), i, k; if (M.sendLive(p).dly) { return true; } for (i = 0; i < p.tracks.length; i++) { for (k = 0; k < M.AUTO_ORDER.length; k++) { if (M.autoActive(p.tracks[i], M.AUTO_ORDER[k])) { return true; } } } return false; }
  function tpDone(snap, cut0) { pushUndo(snap); markDirty(); tpCutCheck(cut0); if (pl) { resync(); } }
  // 9B-14: テンポを変えて、新しく箱の終わりで切れるようになった音声のクリップ
  function tpCutCheck(cut0) { if (!cut0) { return; } var now = DM().audioCutIds(project()), i, nw = []; for (i = 0; i < now.length; i++) { if (cut0.indexOf(now[i]) < 0) { nw.push(now[i]); } } st.tpCut = nw.length ? nw : (st.tpCut || []).filter(function (id) { return now.indexOf(id) >= 0; }); }
  var tpApi = {
    // 変更点（小節・拍・BPM）。同じ位置なら BPM を変える。1 小節 1 拍 ＝ 曲の頭の BPM
    set: function (bar, beat, bpm) { var p = project(), M = DM(), tick = M.autoTickAt(p, bar, beat); if (tick === null) { return { ok: false, why: "位置がおかしいです（小節 1〜256・拍 1〜その小節の拍の数）" }; } var snap = snapAll(), c0 = M.audioCutIds(p), r = M.tempoSet(p, tick, bpm); if (r.ok) { tpDone(snap, c0); } return r; },
    setTick: function (tick, bpm) { var snap = snapAll(), c0 = DM().audioCutIds(project()), r = DM().tempoSet(project(), tick, bpm); if (r.ok) { tpDone(snap, c0); } return r; },
    cut: function () { return (st.tpCut || []).slice(); },
    // 新しく切れるようになったクリップの箱を、音声の終わりまでのばす（↶ 1 回で戻る）
    fit: function () { var p = project(), M = DM(), ids = (st.tpCut || []).slice(), snap = snapAll(), n = 0, still = 0, i; for (i = 0; i < ids.length; i++) { var r = M.fitAudioBox(p, ids[i]); if (r.ok) { n++; if (r.still) { still++; } } else if (M.findClip(p, ids[i])) { still++; } } if (!n) { return { ok: false, n: 0, still: still }; } pushUndo(snap); markDirty(); st.tpCut = M.audioCutIds(p).filter(function (id) { return ids.indexOf(id) >= 0; }); if (pl) { resync(); } return { ok: true, n: n, still: still }; },
    del: function (tick) { var snap = snapAll(), c0 = DM().audioCutIds(project()); if (!DM().tempoDel(project(), tick)) { return false; } tpDone(snap, c0); return true; },
    list: function () { return DM().tempoList(project()); }
  };
  function tpHtml(p) {
    var M = DM(), ps = M.tempoList(p), tu = st.tpUi || { bar: 9, beat: 1, bpm: M.bpmAt(p, 0), msg: "" }, i, h, na = 0;
    for (i = 0; i < p.tracks.length; i++) { if (M.isAudio(p.tracks[i])) { na += p.tracks[i].clips.length; } }
    h = '<div class="daw dm dfx dtp">' +
      '<div class="daw-top"><button class="modal-btn daw-small" data-tp="back">&#x2190; アレンジ</button><b>&#x23F1;&#xFE0F; テンポ</b></div>' +
      '<div class="daw-transport"><button class="modal-btn daw-tbtn' + (pl ? " daw-on" : "") + '" data-tp="play" title="再生">&#x25B6;&#xFE0F;</button><button class="modal-btn daw-tbtn" data-tp="stop" title="停止">&#x23F9;&#xFE0F;</button>' +
        '<button class="modal-btn daw-tbtn" data-tp="undo" title="戻す"' + (st.undo.length ? '' : ' disabled') + '>&#x21B6;</button><span class="daw-pos">1.1</span><span class="small">いまの BPM <b class="dtp-now">' + M.bpmAt(p, Math.max(0, Math.round(st.cue || 0))) + '</b></span></div>' +
      '<div class="dm-row"><div class="dfx-sw"><b>曲の頭の BPM</b><input type="number" class="dfx-num" inputmode="decimal" min="' + M.BPM_MIN + '" max="' + M.BPM_MAX + '" step="1" value="' + ps[0].bpm + '" data-tpv="0" aria-label="曲の頭の BPM"></div></div>' +
      '<div class="dm-row"><b class="small">テンポの変更点を足す（その小節・拍から、この BPM）</b><div class="dau-add">' +
        '<label>小節<input type="number" class="dfx-num" inputmode="numeric" min="1" max="256" step="1" value="' + tu.bar + '" data-tpf="bar"></label>' +
        '<label>拍<input type="number" class="dfx-num" inputmode="numeric" min="1" step="1" value="' + tu.beat + '" data-tpf="beat"></label>' +
        '<label>BPM<input type="number" class="dfx-num" inputmode="decimal" min="' + M.BPM_MIN + '" max="' + M.BPM_MAX + '" step="1" value="' + tu.bpm + '" data-tpf="bpm"></label>' +
        '<button class="modal-btn dau-addb" data-tp="add">&#x2795; 足す</button></div>' + (tu.msg ? '<p class="small dau-msg">' + tu.msg + '</p>' : '') + '</div>' +
      '<div class="dm-row"><b class="small">変更点（' + (ps.length - 1) + ' ／ ' + (M.TEMPO_MAX - 1) + '）</b>';
    if (ps.length > 1) {
      for (i = 1; i < ps.length; i++) {
        var q = auPos(p, ps[i].tick);
        h += '<div class="dm-ctl dau-pt"><span class="dau-ptpos">' + auPosText(q) + '</span><input type="number" class="dfx-num" inputmode="decimal" min="' + M.BPM_MIN + '" max="' + M.BPM_MAX + '" step="1" value="' + ps[i].bpm + '" data-tpv="' + ps[i].tick + '" aria-label="' + q.bar + ' 小節の BPM"><span class="dfx-unit">BPM</span><span class="dau-sp">' + (Math.round(M.tickToSec(p, ps[i].tick) * 100) / 100) + ' 秒</span><button class="modal-btn dm-reset" data-tpd="' + ps[i].tick + '" title="この変更点を消す">&#x1F5D1;&#xFE0F;</button></div>';
      }
    } else { h += '<p class="small dfx-note">まだありません。小節・拍・BPM を入れて「➕ 足す」。</p>'; }
    h += '</div><p class="small dfx-note">テンポは変更点からすぐに切りかわります（だんだん速くする・遅くするはありません）。テンポを変えても、音符・クリップ・オートメーションの位置（小節・拍）は変わらず、秒が変わります。センドのディレイも、その位置の BPM に合わせます。</p>' +
      ((st.tpCut || []).length ? '<div class="dm-row dtp-cut"><p class="small dfx-warn">&#x26A0;&#xFE0F; テンポを変えたので、音声のクリップ ' + st.tpCut.length + ' 個が箱の終わりで切れるようになりました（音声そのものは変えていません）。</p><button class="modal-btn daw-small" data-tp="fit">&#x2194;&#xFE0F; 箱を音声の終わりまでのばす（' + st.tpCut.length + ' 個）</button></div>' : '') + // 9B-14
      (na ? '<p class="small dfx-warn">&#x26A0;&#xFE0F; 音声のクリップが ' + na + ' 個あります。録音・WAV の音声は伸び縮みしないので、テンポを変えると小節とずれます（頭の位置は小節のまま。クリップの箱の終わりが早くなると、そこで音声が切れます）。録音・テイク・コンピングのデータは変えません。</p>' : '') +
      saveNoteHtml() + '<p class="small dsv-note">テンポの変更点・曲の頭の BPM（この画面）は ↶ で戻せます。MIDI の書き出しにはテンポの変化も入ります。</p></div>';
    return h;
  }
  function renderTempo(root, ctl) {
    var p = project();
    root.innerHTML = tpHtml(p);
    if (!root.querySelectorAll) { return; }
    var els = root.querySelectorAll("button"), k;
    function val(n) { var e = root.querySelector('[data-tpf="' + n + '"]'); return e ? e.value : ""; }
    for (k = 0; k < els.length; k++) {
      els[k].onclick = function (ev) {
        var el = ev.currentTarget, v = el.getAttribute("data-tp"), x;
        st.tpUi = st.tpUi || { bar: 9, beat: 1, bpm: DM().bpmAt(p, 0), msg: "" }; st.tpUi.msg = "";
        if (v === "back") { st.view = "arr"; render(root, ctl); return; }
        if (v === "play") { startPlay(); renderTempo(root, ctl); return; }
        if (v === "stop") { transportStop(); renderTempo(root, ctl); return; }
        if (v === "undo") { ops.undo(); return; }
        if (v === "add") { st.tpUi.bar = val("bar"); st.tpUi.beat = val("beat"); st.tpUi.bpm = val("bpm"); var r = tpApi.set(val("bar"), val("beat"), val("bpm")); st.tpUi.msg = r.ok ? (r.tick === 0 ? "曲の頭の BPM を " + r.bpm + " にしました" : (r.replaced ? "同じ位置の BPM を " + r.bpm + " にしました" : "変更点を足しました（BPM " + r.bpm + "）")) : "&#x26A0;&#xFE0F; " + r.why; }
        else if ((x = el.getAttribute("data-tpd"))) { tpApi.del(Number(x)); st.tpUi.msg = "変更点を消しました（↶ で戻せます）"; }
        else if (v === "fit") { var rf = tpApi.fit(); st.tpUi.msg = rf.ok ? rf.n + " 個のクリップの箱をのばしました（↶ で戻せます）" + (rf.still ? "。" + rf.still + " 個は次のクリップ・長さの上限で、まだ切れます" : "") : "のばせませんでした（次のクリップ・長さの上限）"; }
        renderTempo(root, ctl);
      };
    }
    var ins = root.querySelectorAll("input[data-tpv]");
    for (k = 0; k < ins.length; k++) {
      ins[k].onchange = function (ev) { var el = ev.currentTarget, r = tpApi.setTick(Number(el.getAttribute("data-tpv")), el.value); st.tpUi = st.tpUi || { bar: 9, beat: 1, bpm: DM().bpmAt(p, 0), msg: "" }; st.tpUi.msg = r.ok ? "BPM を " + r.bpm + " にしました" : "&#x26A0;&#xFE0F; " + r.why; renderTempo(root, ctl); };
    }
    drawHead();
  }

  // ---------- §342 9B-11: 🌊 FX（センドの戻り: リバーブ・ディレイ）----------
  var SF_ROWS = { rev: [["rev", "level", 100, "%", "Return", "戻り"]], dly: [["dly", "fb", 100, "%", "Feedback", "くり返し"], ["dly", "level", 100, "%", "Return", "戻り"]] };
  var sfApi = {
    // v: 画面の単位（%）・"div" は "1/8" など
    set: function (part, key, v) { var p = project(), r = DM().sendFxSet(p, part, key, key === "on" || key === "div" ? v : Number(v) / 100); if (r.ok) { sendUpdate(); } return r; },
    reset: function (part) { DM().sendFxReset(project(), part); sendUpdate(); markDirty(); return true; },
    commit: function () { markDirty(); },
    nodes: function () { var m = pl && pl.mix.__master, s = m && m.send; return s ? { rev: !!s.rev, dly: !!s.dly, key: s.key, delay: s.dly ? s.dly.d.delayTime.value : null } : null; } // テスト・確かめ用
  };
  function sfHtml(p) {
    var M = DM(), f = M.sendFxOf(p), lv = M.sendLive(p), i, h, nr = 0, nd = 0, bpm = M.bpmAt(p, 0);
    for (i = 0; i < p.tracks.length; i++) { var s = M.sendOf(p.tracks[i]); if (s.rev > 0) { nr++; } if (s.dly > 0) { nd++; } }
    function tog(on, nm) { return '<button class="modal-btn dfx-tog' + (on ? " on" : "") + '" data-sf="' + nm + '">' + (on ? "ON" : "OFF") + '</button>'; }
    h = '<div class="daw dm dfx dsf">' +
      '<div class="daw-top"><button class="modal-btn daw-small" data-sf="back">&#x2190; ミキサー</button><b>&#x1F30A; FX（リバーブ・ディレイ）</b></div>' +
      '<div class="daw-transport"><button class="modal-btn daw-tbtn' + (pl ? " daw-on" : "") + '" data-sf="play" title="再生">&#x25B6;&#xFE0F;</button><button class="modal-btn daw-tbtn" data-sf="stop" title="停止">&#x23F9;&#xFE0F;</button><span class="daw-pos">1.1</span></div>' +
      '<p class="small dfx-note">ミキサーの REV・DLY で送ったトラックの音（音量・パンのあと）だけに、DAW 専用のリバーブ・ディレイをかけて、残響（Wet）だけを DAW のマスターへ戻します（そのあと MASTER の EQ・リミッター）。ゲームの残響の設定は変えません。</p>' +
      '<div class="dm-row' + (f.rev.on ? "" : " dfx-off") + '"><div class="dfx-sw"><b>リバーブ</b>' + tog(f.rev.on, "revOn") + '<button class="modal-btn dm-reset" data-sf="revReset" title="はじめの値に">&#x21BA;</button></div>';
    h += fxRowHtml(p.master || {}, f, SF_ROWS.rev[0]);
    h += '<p class="small dfx-note">送っているトラック: ' + nr + ' 本' + (lv.rev ? '（効いています）' : (f.rev.on ? '（送りが 0 なので鳴りません）' : '（OFF）')) + '・残響 2.2 秒</p></div>' +
      '<div class="dm-row' + (f.dly.on ? "" : " dfx-off") + '"><div class="dfx-sw"><b>ディレイ</b>' + tog(f.dly.on, "dlyOn") + '<button class="modal-btn dm-reset" data-sf="dlyReset" title="はじめの値に">&#x21BA;</button></div><div class="dsf-divs">';
    for (i = 0; i < M.SEND_DIV_ORDER.length; i++) { var dv = M.SEND_DIV_ORDER[i], sec = Math.max(0.02, Math.min(2, 60 / bpm * M.SEND_DIVS[dv])); h += '<button class="modal-btn dau-tg' + (f.dly.div === dv ? " sel" : "") + '" data-sfd="' + dv + '">' + (dv === "1/8." ? "1/8 付点" : dv) + '<small>' + Math.round(sec * 1000) + 'ms</small></button>'; }
    h += '</div>';
    for (i = 0; i < SF_ROWS.dly.length; i++) { h += fxRowHtml(p.master || {}, f, SF_ROWS.dly[i]); }
    h += '<p class="small dfx-note">送っているトラック: ' + nd + ' 本' + (lv.dly ? '（効いています）' : (f.dly.on ? '（送りが 0 なので鳴りません）' : '（OFF）')) + '・その位置の BPM に合わせます（ms は曲の頭の BPM ' + bpm + '・テンポが変わる所で 50ms かけて変わります）。Feedback は 85% まで。</p></div>' +
      '<button class="modal-btn daw-small dfx-all" data-sf="resetAll">&#x21BA; 全部をはじめに戻す</button>' +
      saveNoteHtml() + '<p class="small dsv-note">WAV の余韻は残響の長さまで（最大 10 秒・こえるときは最後の 1 秒を小さく）。⏹ を押すと残響も止まります。センドは ↶ の対象外で、MIDI の書き出しには入りません（JSON・ZIP には入ります）。</p></div>';
    return h;
  }
  function renderSendFx(root, ctl) {
    var p = project(), M = DM();
    root.innerHTML = sfHtml(p);
    if (!root.querySelectorAll) { return; }
    var els = root.querySelectorAll("button"), k;
    for (k = 0; k < els.length; k++) {
      els[k].onclick = function (ev) {
        var el = ev.currentTarget, v = el.getAttribute("data-sf"), dv = el.getAttribute("data-sfd"), f = M.sendFxOf(p);
        if (v === "back") { st.view = "mix"; renderMix(root, ctl); return; }
        if (v === "play") { startPlay(); renderSendFx(root, ctl); return; }
        if (v === "stop") { transportStop(); renderSendFx(root, ctl); return; }
        if (dv) { sfApi.set("dly", "div", dv); markDirty(); }
        else if (v === "revOn") { sfApi.set("rev", "on", !f.rev.on); markDirty(); }
        else if (v === "dlyOn") { sfApi.set("dly", "on", !f.dly.on); markDirty(); }
        else if (v === "revReset") { sfApi.reset("rev"); }
        else if (v === "dlyReset") { sfApi.reset("dly"); }
        else if (v === "resetAll") { sfApi.reset(); }
        else { return; }
        renderSendFx(root, ctl);
      };
    }
    function parts(el, a) { var s = (el.getAttribute(a) || "").split("."); return { part: s[0], key: s[1] }; }
    var rs = root.querySelectorAll("input[data-fxr]");
    for (k = 0; k < rs.length; k++) {
      rs[k].oninput = function (ev) { var el = ev.currentTarget, q = parts(el, "data-fxr"), r = sfApi.set(q.part, q.key, el.value), n = root.querySelector('[data-fxn="' + q.part + "." + q.key + '"]'); if (r.ok && n) { n.value = String(Math.round(r.value * 100)); } };
      rs[k].onchange = function () { sfApi.commit(); renderSendFx(root, ctl); };
    }
    var ns = root.querySelectorAll("input[data-fxn]");
    for (k = 0; k < ns.length; k++) { ns[k].onchange = function (ev) { var el = ev.currentTarget, q = parts(el, "data-fxn"); if (sfApi.set(q.part, q.key, el.value).ok) { sfApi.commit(); } renderSendFx(root, ctl); }; }
    drawHead();
  }

  // ---------- §342 9B-10: 🎚️ MASTER の画面（マスター EQ・ピークリミッター）----------
  function msRowVal(part, key, v) { var l = FX_ROWS[part] || [], i; for (i = 0; i < l.length; i++) { if (l[i][1] === key) { return Number(v) / l[i][2]; } } return v; }
  var msApi = {
    // 動かしているあいだ（保存はしない・音だけ変える）。v は画面の単位（ms など）
    set: function (part, key, v) { var p = project(); if (!p.master) { p.master = { vol: VOL0, rev: 0, dly: 0, fx: { items: [] } }; } var r = DM().fxSet(p.master, part, key, key === "on" || part === "bypass" ? v : msRowVal(part, key, v)); if (r.ok) { if (part === "lim" && key === "on" && v) { try { limLoad(window.UGMelody.audioInit(), function () {}); } catch (e) {} } masterUpdate(); } return r; },
    reset: function (part) { var p = project(); if (!p.master) { return false; } DM().fxReset(p.master, part); masterUpdate(); markDirty(); return true; },
    commit: function () { markDirty(); },
    stat: function () { return st.mstat ? { pk: st.mstat.pk, gr: st.mstat.gr, max: st.mstat.max, minGr: st.mstat.minGr, key: st.mstat.key, lim: st.mstat.lim } : null; },
    limState: function () { var UG = window.UGMelody; return limState(UG && UG.audio ? UG.audio.ctx : null); },
    out: function () { var m = pl && pl.mix.__master; return m && m.priv ? m.priv.out : null; }, // テスト・確かめ用（DAW 専用の出口の最後のノード）
    key: function () { return masterRtKey(project()); }, latency: function () { var UG = window.UGMelody; return masterLatency(UG && UG.audio ? UG.audio.ctx : null); }, LOOK: LIM_LOOK, src: LIM_WORKLET, NAME: LIM_NAME
  };
  function msDb(x) { return x > 0 ? (Math.round(20 * Math.log(x) / Math.LN10 * 10) / 10).toFixed(1) : "−∞"; }
  function msHtml(p) {
    var M = DM(), mp = p.master || { fx: { items: [] } }, f = M.masterFx(p), live = M.masterLive(p), i, h, ls = msApi.limState(), boost = Math.max(f.eq.on ? Math.max(f.eq.low, f.eq.mid, f.eq.high) : 0, f.lim.on ? f.lim.gain : 0);
    function tog(on, nm, a, b) { return '<button class="modal-btn dfx-tog' + (on ? " on" : "") + '" data-ms="' + nm + '">' + (on ? a : b) + '</button>'; }
    var wst = wav.stats && wav.state === "done" ? wav.stats : null;
    h = '<div class="daw dm dfx dms">' +
      '<div class="daw-top"><button class="modal-btn daw-small" data-ms="back">&#x2190; ミキサー</button><b>&#x1F39A;&#xFE0F; MASTER</b></div>' +
      '<div class="daw-transport"><button class="modal-btn daw-tbtn' + (pl ? " daw-on" : "") + '" data-ms="play" title="再生">&#x25B6;&#xFE0F;</button><button class="modal-btn daw-tbtn" data-ms="stop" title="停止">&#x23F9;&#xFE0F;</button><span class="daw-pos">1.1</span></div>' +
      '<div class="dm-row' + (f.bypass ? " dfx-off" : "") + '"><div class="dfx-sw"><b>MASTER FX</b>' + tog(!f.bypass, "bypass", "ON", "バイパス") + '</div>' +
        '<p class="small dfx-note">' + (f.bypass ? "バイパス中: マスターの EQ・リミッターを通さない（前と同じ音）。" : (live.sig ? "効いています: 全部のトラック → 残響 → 全体の音量 → " + (live.eq ? "EQ → " : "") + (live.lim ? "入力ゲイン → ピークリミッター → " : "") + "出口。" : "いまは何も効いていません（前と同じ音）。")) + '</p></div>' +
      '<div class="dm-row' + (f.eq.on && !f.bypass ? "" : " dfx-off") + '"><div class="dfx-sw"><b>マスター EQ</b>' + tog(f.eq.on, "eqOn", "ON", "OFF") + '<button class="modal-btn dm-reset" data-ms="eqReset" title="3 つとも 0dB に">&#x21BA;</button></div>';
    for (i = 0; i < FX_ROWS.eq.length; i++) { h += fxRowHtml(mp, f, FX_ROWS.eq[i]); }
    h += '</div><div class="dm-row' + (f.lim.on && !f.bypass ? "" : " dfx-off") + '"><div class="dfx-sw"><b>ピークリミッター</b>' + tog(f.lim.on, "limOn", "ON", "OFF") + '<button class="modal-btn dm-reset" data-ms="limReset" title="はじめの値に">&#x21BA;</button></div>';
    var tpm = f.lim.mode === "tp"; // 9B-16
    h += '<div class="dms-mode"><span class="small">モード</span><button class="modal-btn dfx-tog' + (tpm ? "" : " on") + '" data-ms="modeSp">Sample Peak</button><button class="modal-btn dfx-tog' + (tpm ? " on" : "") + '" data-ms="modeTp">True Peak</button></div>';
    for (i = 0; i < FX_ROWS.lim.length; i++) { var lrw = FX_ROWS.lim[i]; if (tpm && lrw[1] === "ceiling") { lrw = lrw.slice(); lrw[3] = "dBTP"; } h += fxRowHtml(mp, f, lrw); } // 9B-17: True Peak のときの Ceiling は dBTP（値・保存は同じ）
    h += '<p class="small dfx-note">ゲインリダクション: <b class="dms-gr">—</b>・出力のサンプルピーク: <b class="dms-pk">—</b>（再生中・0.1 秒ごと）・いちばん大きいピーク: <b class="dms-max">—</b></p>' +
      (tpm ? '<p class="small dfx-note">True Peak のリミッター（サンプルの間を 8 倍で調べる・先読み 5ms・左右いっしょ）。サンプルとサンプルの間のピークも Ceiling（dBTP）に抑えます。測った試験の信号・曲では、4× の解析の True Peak が Ceiling をこえませんでした（理想的な補間で測ると、急に大きくなる音などで +0.01dB ほど上に出ることがあります）。サンプルピークのモードより計算が多く、再生は 5.7ms 遅れます（WAV はずれません）。</p>'
        : '<p class="small dfx-note">サンプルピークのリミッター（先読み 5ms・左右いっしょ）。出力のサンプルは Ceiling をこえませんが、サンプルとサンプルの間のピーク（True Peak）は抑えません。Ceiling は −1dBFS くらいの余裕をおすすめします（サンプルの間も抑えるなら「True Peak」）。再生は 5ms 遅れます（WAV はずれません）。</p>') +
      (ls === "fail" ? '<p class="small dfx-warn">&#x26A0;&#xFE0F; このブラウザではリミッター（AudioWorklet）を使えません。リミッターなしで鳴らし、書き出します' + (tpm ? '（True Peak の処理もしていません）' : '') + '。</p>' : '') + '</div>' +
      '<p class="small dfx-warn"' + (boost > 0 && !(f.lim.on && !f.bypass) ? '' : ' hidden') + '>&#x26A0;&#xFE0F; リミッターが OFF のまま音を上げています（＋' + boost + 'dB）。音割れのおそれがあります。リミッターを ON にするか、値を下げてください。</p>' +
      (wst ? '<p class="small dfx-note">さいごの WAV: ピーク ' + msDb(wst.peak) + ' dBFS' + (wst.clip ? '・0dBFS に届いたサンプル ' + wst.clip + ' 個' : '') + (wst.lim === "ok" ? (wst.limMode === "tp" ? '・True Peak のリミッターあり' : '・サンプルピークのリミッターあり') : (wst.lim === "none" ? '・リミッターを使えませんでした' : '')) + (lu.res && !luApi.stale() && lu.res.truePeak !== null ? '・解析した True Peak ' + lu.res.truePeak.toFixed(2) + ' dBTP（Ceiling ' + f.lim.ceiling + '）' : '・True Peak は「📊 曲を解析」で測れます') + '</p>' : '') +
      lmHtml() +
      '<button class="modal-btn daw-small dfx-all dms-lu" data-ms="lufs">&#x1F4CA; 曲を解析（LUFS・True Peak）</button>' +
      '<button class="modal-btn daw-small dfx-all" data-ms="resetAll">&#x21BA; 全部をはじめに戻す</button>' +
      saveNoteHtml() + '<p class="small dsv-note">MASTER の値は ↶ の対象外です。MIDI の書き出しには入りません（JSON・ZIP には入ります）。MASTER FX・リミッターの ON／OFF を再生中に変えると、同じ位置から鳴らしなおします。</p></div>';
    return h;
  }
  // 9B-17: メーターの欄
  function lmHtml() {
    return '<div class="dm-row dlm' + (lm.on ? "" : " dfx-off") + '"><div class="dfx-sw"><b>&#x1F4CF; ラウドネスメーター</b><button class="modal-btn dfx-tog' + (lm.on ? " on" : "") + '" data-ms="lmOn">' + (lm.on ? "ON" : "OFF") + '</button><button class="modal-btn dm-reset" data-ms="lmReset" title="測った数字を消す">&#x21BA;</button></div>' +
      '<div class="dlm-grid"><div class="dlu-kv"><span>状態</span><b class="dlm-st">—</b></div><div class="dlu-kv"><span>Momentary（400ms）</span><b class="dlm-m">—</b></div><div class="dlu-kv"><span>Short-Term（3 秒）</span><b class="dlm-s">—</b></div>' +
      '<div class="dlu-kv"><span>Integrated（測りはじめから）</span><b class="dlm-i">—</b></div><div class="dlu-kv"><span>LRA（測りはじめから）</span><b class="dlm-l">—</b></div><div class="dlu-kv"><span>Sample Peak（いま・いちばん大きい）</span><b class="dlm-p">—</b></div>' +
      '<div class="dlu-kv dlm-tpsw"><span>True Peak（4 倍の補間・推定）</span><button class="modal-btn dfx-tog' + (lm.tp ? " on" : "") + '" data-ms="lmTp">' + (lm.tp ? "ON" : "OFF") + '</button></div><div class="dlu-kv"><span>True Peak（いま・いちばん大きい）</span><b class="dlm-tp">—</b></div><div class="dlu-kv"><span>True Peak − Sample Peak（いちばん大きいものどうし）</span><b class="dlm-td">—</b></div></div><p class="small dlm-late" style="display:none"></p>' +
      '<p class="small dfx-note">再生中の DAW のいちばん最後の音（トラックの FX・センド・MASTER の EQ・リミッターのあと）を、横に分けて測ります（音・遅れは変わりません）。OFF のときは測るためのノードを作りません。▶ を止まったところから押すと新しく測り、再生中のジャンプ・ループの折り返しは続けて測ります（ループでは同じところを何度も測るので、曲全体の LRA とはちがうことがあります）。Integrated・LRA は測った時間が短いと安定しません（LRA は 60 秒未満では目安）。数字は保存しません。曲全体は「📊 曲を解析」で。True Peak は「📊 曲を解析」と同じ 4 倍の補間による推定です（有限の補間なので、すべての波形の本当のピークを保証するものではありません）。True Peak を ON にしたときだけ計算します（OFF なら計算しません）。</p></div>';
  }
  function lmFmt(v, unit) { return v === null || v === undefined ? "—" : (!isFinite(v) ? "−∞ " + unit : (Math.round(v * 10) / 10).toFixed(1) + " " + unit); }
  function lmHead(root) {
    var e = { st: root.querySelector(".dlm-st"), m: root.querySelector(".dlm-m"), s: root.querySelector(".dlm-s"), i: root.querySelector(".dlm-i"), l: root.querySelector(".dlm-l"), p: root.querySelector(".dlm-p"), tp: root.querySelector(".dlm-tp"), td: root.querySelector(".dlm-td") };
    if (!e.st) { return; }
    var v = lmValues(), stx = { off: "OFF（測っていません）", idle: "▶ で測りはじめます", wait: "準備中…", run: "計測中", stop: "停止中（さいごの数字）", fail: "このブラウザでは測れません（AudioWorklet）" }[lm.state] || "—";
    if (v && (lm.state === "run" || lm.state === "stop")) { stx += "・" + (Math.round(v.sec * 10) / 10).toFixed(1) + " 秒"; }
    e.st.textContent = stx;
    var lt = root.querySelector(".dlm-late"); // 9B-18: 測っているあいだに遅れた音
    if (lt) { if (v && v.late && v.late.n > 0) { lt.style.display = ""; lt.textContent = "⚠️ 端末が混んでいて、" + v.late.n + " 個の音が予定より遅れて鳴りました（最大 " + Math.round(v.late.max * 1000) + "ms）。遅れた音は重なって鳴るので、ピークなどが WAV とちがうことがあります（WAV は遅れません）"; } else { lt.style.display = "none"; lt.textContent = ""; } }
    if (e.tp && e.td) { if (!lm.tp) { e.tp.textContent = "OFF（測っていません）"; e.td.textContent = "—"; } else if (!v || v.maxTp === null || v.maxTp === undefined) { e.tp.textContent = "—"; e.td.textContent = "—"; } else { e.tp.textContent = lmFmt(v.tp, "dBTP") + " ／ " + lmFmt(v.maxTp, "dBTP"); e.td.textContent = v.tpDiff === null ? "—" : (v.tpDiff >= 0 ? "+" : "") + (Math.round(v.tpDiff * 100) / 100).toFixed(2) + " dB"; } } // 9B-19
    if (!v) { e.m.textContent = "—"; e.s.textContent = "—"; e.i.textContent = "—"; e.l.textContent = "—"; e.p.textContent = "—"; return; }
    e.m.textContent = v.M === null ? "—（0.4 秒たまるまで）" : lmFmt(v.M, "LUFS");
    e.s.textContent = v.S === null ? "—（3 秒たまるまで）" : lmFmt(v.S, "LUFS");
    e.i.textContent = v.I === null || v.I === undefined ? "—" : lmFmt(v.I, "LUFS");
    e.l.textContent = v.lra === null || v.lra === undefined ? (v.lraWhy === "silent" ? "—（無音）" : "—（3 秒たまるまで）") : lmFmt(v.lra, "LU") + (v.sec < 60 ? "（60 秒未満・目安）" : "");
    e.p.textContent = lmFmt(v.peak, "dBFS") + " ／ " + lmFmt(v.maxPeak, "dBFS");
  }
  function msHead(root) {
    lmHead(root); // 9B-17
    var s = st.mstat, gr = root.querySelector(".dms-gr"), pk = root.querySelector(".dms-pk"), mx = root.querySelector(".dms-max");
    if (!gr || !pk) { return; }
    if (!pl || !s || !s.node) { gr.textContent = "—"; pk.textContent = "—"; if (mx) { mx.textContent = s && s.max ? msDb(s.max) + " dBFS" : "—"; } return; }
    gr.textContent = limKey(s.key) ? msDb(s.gr) + " dB" : "—"; pk.textContent = msDb(s.pk) + " dBFS"; if (mx) { mx.textContent = msDb(s.max) + " dBFS"; }
  }
  function renderMaster(root, ctl) {
    var p = project(), M = DM();
    root.innerHTML = msHtml(p);
    if (!root.querySelectorAll) { return; }
    var els = root.querySelectorAll("button[data-ms]"), k;
    for (k = 0; k < els.length; k++) {
      els[k].onclick = function (ev) {
        var v = ev.currentTarget.getAttribute("data-ms"), f = M.masterFx(p);
        if (v === "back") { st.view = "mix"; renderMix(root, ctl); return; }
        if (v === "lufs") { st.view = "lufs"; renderLufs(root, ctl); return; } // 9B-13
        if (v === "play") { startPlay(); renderMaster(root, ctl); return; }
        if (v === "stop") { transportStop(); renderMaster(root, ctl); return; }
        if (v === "bypass") { msApi.set("bypass", "", !f.bypass); markDirty(); }
        else if (v === "eqOn") { msApi.set("eq", "on", !f.eq.on); markDirty(); }
        else if (v === "limOn") { msApi.set("lim", "on", !f.lim.on); markDirty(); }
        else if (v === "lmOn") { lm.on = !lm.on; if (lm.on) { lm.state = pl ? "wait" : "idle"; if (pl) { lmAttach(true); } } else { lmClear(); } } // 9B-17: 数字は保存しない
        else if (v === "lmTp") { lmSetTp(!lm.tp); } // 9B-19
        else if (v === "lmReset") { var wasRun = !!lm.node; lm.live = null; lm.full = null; lm.fullAt = -1; lm.upd = 0; lm.late = { n: 0, max: 0 }; if (wasRun) { lmDetach(""); lmAttach(true); } else if (lm.on) { lm.state = "idle"; } }
        else if (v === "modeSp" || v === "modeTp") { msApi.set("lim", "mode", v === "modeTp" ? "tp" : "sample"); markDirty(); } // 9B-16
        else if (v === "eqReset") { msApi.reset("eq"); }
        else if (v === "limReset") { msApi.reset("lim"); }
        else if (v === "resetAll") { msApi.reset(); }
        renderMaster(root, ctl);
      };
    }
    function parts(el, a) { var s = (el.getAttribute(a) || "").split("."); return { part: s[0], key: s[1] }; }
    var rs = root.querySelectorAll("input[data-fxr]");
    for (k = 0; k < rs.length; k++) {
      rs[k].oninput = function (ev) {
        var el = ev.currentTarget, q = parts(el, "data-fxr"), r = msApi.set(q.part, q.key, el.value), n = root.querySelector('[data-fxn="' + q.part + "." + q.key + '"]');
        if (r.ok && n) { var row = null, i, l = FX_ROWS[q.part]; for (i = 0; i < l.length; i++) { if (l[i][1] === q.key) { row = l[i]; } } n.value = fxShow(r.value, row); }
      };
      rs[k].onchange = function () { msApi.commit(); renderMaster(root, ctl); };
    }
    var ns = root.querySelectorAll("input[data-fxn]");
    for (k = 0; k < ns.length; k++) {
      ns[k].onchange = function (ev) { var el = ev.currentTarget, q = parts(el, "data-fxn"); if (String(el.value).replace(/\s/g, "") !== "") { msApi.set(q.part, q.key, el.value); msApi.commit(); } renderMaster(root, ctl); };
    }
    drawHead();
  }

  // ---------- §342 9B-9: 📈 オートメーションの画面（数字とボタンで編集・グラフは見るだけ）----------
  // 画面の値: 音量 0〜100・パン −100（L）〜100（R）・EQ −12〜+12dB
  function auUi(target, real) { return target === "pan" ? Math.round(real * 100) : real; }
  function auReal(target, ui) { return target === "pan" ? Number(ui) / 100 : Number(ui); }
  function auText(target, real) { return target === "pan" ? panText(real) : (target === "vol" || target === "expr" || target === "mod" ? String(Math.round(real)) : (real > 0 ? "+" : "") + real + "dB"); } // §345 A28: Expression・Modulation は数
  function auPos(p, tick) { var M = DM(), b = M.tickToBar(p, tick).bar, t0 = M.barToTick(p, b - 1), m = M.meterAt(p, t0), bt = M.PPQ * 4 / m.den; return { bar: b, beat: Math.round((1 + (tick - t0) / bt) * 100) / 100 }; }
  function auPosText(q) { return q.bar + "小節 " + q.beat + "拍"; }
  function openAuto(tid, from) { var o = st.au || {}; st.view = "auto"; st.au = { track: tid, target: o.target || "vol", msg: "", from: from || "arr", bar: o.bar || 1, beat: o.beat || 1, snap: o.snap !== undefined ? o.snap : 960, sel: null, ca: o.ca, cb: o.cb, pbar: o.pbar }; }
  // 編集（↶ に写し・自動保存・再生中なら同じ位置から鳴らしなおす ＝ 新しい値で予約しなおす）
  var auApi = {
    set: function (id, target, bar, beat, ui) { var p = project(), M = DM(), t = M.findTrack(p, id), tick = M.autoTickAt(p, bar, beat); if (!t) { return { ok: false, why: "トラックがありません" }; } if (tick === null) { return { ok: false, why: "位置がおかしいです（小節 1〜" + 256 + "・拍 1〜その小節の拍の数）" }; } var snap = snapTracks(), r = M.autoSet(p, t, target, tick, auReal(target, ui)); if (r.ok) { auDone(snap); } return r; },
    setTick: function (id, target, tick, ui) { var p = project(), M = DM(), t = M.findTrack(p, id); if (!t) { return { ok: false }; } var snap = snapTracks(), r = M.autoSet(p, t, target, tick, auReal(target, ui)); if (r.ok) { auDone(snap); } return r; },
    del: function (id, target, tick) { var M = DM(), t = M.findTrack(project(), id); if (!t) { return false; } var snap = snapTracks(); if (!M.autoDel(t, target, tick)) { return false; } auDone(snap); return true; },
    on: function (id, target, on) { var M = DM(), t = M.findTrack(project(), id); if (!t) { return false; } var snap = snapTracks(); if (!M.autoOn(t, target, on)) { return false; } auDone(snap); return true; },
    clear: function (id, target) { var M = DM(), t = M.findTrack(project(), id); if (!t) { return false; } var snap = snapTracks(); if (!M.autoClear(t, target)) { return false; } auDone(snap); return true; },
    now: function (id, target, tick) { var M = DM(), t = M.findTrack(project(), id); return t ? M.autoNow(t, target, tick) : null; }
  };
  function auDone(snap) { pushUndo(snap); markDirty(); if (pl) { resync(); } }
  // グラフ（曲の長さ・点は 64 個まで・いまの位置の線）
  function auSvg(p, t, a, target) {
    var M = DM(), W = 340, H = 96, end = Math.max(M.songEndTick(p), a && a.points.length ? a.points[a.points.length - 1][0] + M.PPQ * 4 : 0), i, pts = [], dots = "";
    function X(tk) { return Math.round(tk / end * W * 10) / 10; }
    function Y(n) { return Math.round((1 - n) * (H - 8) * 10) / 10 + 4; }
    var on = a && a.on !== false && a.points.length, base = M.autoNorm(target, M.autoStatic(t, target));
    if (on) {
      pts.push(X(0) + "," + Y(a.points[0][1]));
      for (i = 0; i < a.points.length; i++) { if (a.points[i][2] === "step" && i > 0) { pts.push(X(a.points[i][0]) + "," + Y(a.points[i - 1][1])); } pts.push(X(a.points[i][0]) + "," + Y(a.points[i][1])); var sl = st.au && st.au.sel === a.points[i][0]; dots += '<circle' + (sl ? ' class="sel"' : '') + ' cx="' + X(a.points[i][0]) + '" cy="' + Y(a.points[i][1]) + '" r="' + (sl ? 7 : 4) + '"/>'; } // §345 A28: 選んだ点は大きく
      pts.push(W + "," + Y(a.points[a.points.length - 1][1]));
    } else { pts.push("0," + Y(base)); pts.push(W + "," + Y(base)); }
    var mid = target === "vol" || target === "expr" || target === "mod" ? "" : '<line class="dau-mid" x1="0" x2="' + W + '" y1="' + Y(0.5) + '" y2="' + Y(0.5) + '"/>';
    return '<svg class="dau-g" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" data-end="' + end + '" role="img" aria-label="オートメーションのグラフ">' + mid +
      '<polyline class="dau-line' + (on ? '' : ' off') + '" points="' + pts.join(" ") + '"/>' + dots + '<line class="dau-ph" x1="0" x2="0" y1="0" y2="' + H + '"/></svg>';
  }
  function auHtml(p, t) {
    var M = DM(), au = st.au, tg = au.target, a = M.autoLane(t, tg), d = M.AUTO_TARGETS[tg], i, h, act = M.autoActive(t, tg), f = M.fxOf(t), eqOff = tg.indexOf("eq.") === 0 && (f.bypass || !f.eq.on);
    var uiStep = tg === "pan" ? 1 : d.step, uiLo = tg === "pan" ? -100 : d.lo, uiHi = tg === "pan" ? 100 : d.hi, unit = tg === "pan" ? "L−／R＋" : (d.unit || "");
    var dv = auUi(tg, M.autoNow(t, tg, Math.max(0, Math.round(st.cue || 0))));
    h = '<div class="daw dm dau">' +
      '<div class="daw-top"><button class="modal-btn daw-small" data-au="back">&#x2190; ' + (au.from === "mix" ? "ミキサー" : "アレンジ") + '</button><b>&#x1F4C8; オートメーション</b></div>' +
      '<div class="daw-transport"><button class="modal-btn daw-tbtn' + (pl ? " daw-on" : "") + '" data-au="play" title="再生">&#x25B6;&#xFE0F;</button><button class="modal-btn daw-tbtn" data-au="stop" title="停止">&#x23F9;&#xFE0F;</button>' +
        '<button class="modal-btn daw-tbtn" data-au="undo" title="戻す"' + (st.undo.length ? '' : ' disabled') + '>&#x21B6;</button><button class="modal-btn daw-tbtn" data-au="redo" title="やりなおし"' + (st.redo.length ? '' : ' disabled') + '>&#x21B7;</button><span class="daw-pos">1.1</span></div>' + // §345 A28: ↷
      '<div class="dm-row"><label class="dau-trk">トラック <select data-au="track">';
    for (i = 0; i < p.tracks.length; i++) { h += '<option value="' + p.tracks[i].id + '"' + (p.tracks[i].id === t.id ? ' selected' : '') + '>' + escHtml(p.tracks[i].name) + '</option>'; }
    h += '</select></label><div class="dau-tgs">';
    for (i = 0; i < M.AUTO_ORDER.length; i++) { var k = M.AUTO_ORDER[i], on = M.autoActive(t, k); h += '<button class="modal-btn dau-tg' + (k === tg ? ' sel' : '') + (on ? ' on' : '') + '" data-aut="' + k + '">' + (M.AUTO_TARGETS[k].short || M.AUTO_TARGETS[k].name.replace("EQ ", "")) + (on ? ' &#x1F4C8;' : '') + '</button>'; }
    h += '</div></div>' +
      '<div class="dm-row"><div class="dfx-sw"><b>' + d.name + '</b><button class="modal-btn dfx-tog' + (a && a.on !== false ? ' on' : '') + '" data-au="on">' + (a && a.on !== false ? 'ON' : 'OFF') + '</button></div>' +
      '<p class="small dfx-note">' + (eqOff ? '&#x26A0;&#xFE0F; EQ が OFF（またはバイパス）なので、音には効きません（点は残ります）。' : (act ? '効いています（点 ' + a.points.length + ' 個・その間は' + (tg === "vol" ? 'フェーダー' : (tg === "pan" ? 'ミキサーのパン' : 'FX のつまみ')) + 'の代わり）。' : (a && a.on === false ? 'OFF: ふだんの値（' + auText(tg, M.autoStatic(t, tg)) + '）で鳴ります。点は残っています。' : '点がありません: ふだんの値（' + auText(tg, M.autoStatic(t, tg)) + '）で鳴ります。'))) + '</p>' +
      auSvg(p, t, a, tg) +
      '<p class="small dfx-note">いまの値（<span class="dau-at">' + auPosText(auPos(p, Math.max(0, Math.round(st.cue || 0)))) + '</span>）: <b class="dau-now">' + auText(tg, M.autoNow(t, tg, Math.max(0, Math.round(st.cue || 0)))) + '</b></p></div>' +
      auTargetNote(tg) + auSelHtml(p, t, a, tg) + // §345 A28
      '<div class="dm-row"><b class="small">点を足す（同じ位置なら値を変える）</b><div class="dau-add">' +
        '<label>小節<input type="number" class="dfx-num" inputmode="numeric" min="1" max="256" step="1" value="' + au.bar + '" data-auf="bar"></label>' +
        '<label>拍<input type="number" class="dfx-num" inputmode="decimal" min="1" step="0.25" value="' + au.beat + '" data-auf="beat"></label>' +
        '<label>値<input type="number" class="dfx-num" inputmode="decimal" min="' + uiLo + '" max="' + uiHi + '" step="' + uiStep + '" value="' + dv + '" data-auf="val"></label>' +
        '<button class="modal-btn dau-addb" data-au="add">&#x2795; 足す</button></div>' +
        '<p class="small dfx-note">' + (unit ? '値の単位: ' + unit + '・' : '') + '範囲 ' + uiLo + '〜' + uiHi + '</p>' + (au.msg ? '<p class="small dau-msg">' + au.msg + '</p>' : '') + '</div>';
    h += '<div class="dm-row"><b class="small">点（' + (a ? a.points.length : 0) + ' ／ ' + M.AUTO_MAX_POINTS + '）</b>';
    if (a && a.points.length) {
      for (i = 0; i < a.points.length; i++) {
        var q = a.points[i], ps = auPos(p, q[0]), rv = M.autoReal(tg, q[1]);
        h += '<div class="dm-ctl dau-pt"><span class="dau-ptpos">' + auPosText(ps) + '</span><input type="number" class="dfx-num" inputmode="decimal" min="' + uiLo + '" max="' + uiHi + '" step="' + uiStep + '" value="' + auUi(tg, rv) + '" data-aupv="' + q[0] + '" aria-label="' + ps.bar + ' 小節 ' + ps.beat + ' 拍の値"><span class="dfx-unit">' + (d.unit || '') + '</span><span class="dau-sp">' + auText(tg, rv) + '</span><button class="modal-btn dm-reset" data-aud="' + q[0] + '" title="この点を消す">&#x1F5D1;&#xFE0F;</button></div>';
      }
      h += '<button class="modal-btn daw-small dfx-all" data-au="clear">&#x1F5D1;&#xFE0F; 点を全部消す</button>';
    } else { h += '<p class="small dfx-note">まだありません。上で小節・拍・値を入れて「➕ 足す」。</p>'; }
    return h + '</div>' + saveNoteHtml() + '<p class="small dsv-note">点の間は直線でつなぎ、最初の点より前・最後の点より後は、その点の値のままです。音量・パンはオートメーションの値がそのまま使われ（フェーダーの値は残ります）、ミュート・ソロがいつも優先です。EQ は FX の EQ が ON のときだけ効きます。点を足す・直す・消す・ON／OFF は ↶ で戻せます。MIDI の書き出しには入りません（JSON・ZIP には入ります）。</p></div>';
  }
  // ---------- §345 A28: グラフで点を編集（タップ ＝ 足す・点をタップ ＝ 選ぶ・ドラッグ ＝ 動かす）・選んだ点の微調整・範囲のコピーと貼り付け ----------
  var AU_W = 340, AU_H = 96, AU_SNAPS = [[960, "1 拍"], [480, "1/2 拍"], [240, "1/4 拍"], [0, "1 小節"]];
  function auEnd(p, a) { var M = DM(); return Math.max(M.songEndTick(p), a && a.points.length ? a.points[a.points.length - 1][0] + M.PPQ * 4 : 0); }
  function auSnapTick(p, raw) {
    var M = DM(), sn = st.au && st.au.snap !== undefined ? st.au.snap : 960, lim = M.barToTick(p, 256) - 1, tk;
    raw = Math.max(0, raw);
    if (sn === 0) { var b = M.tickToBar(p, raw).bar - 1, t0 = M.barToTick(p, b), t1 = M.barToTick(p, b + 1); tk = raw - t0 < t1 - raw ? t0 : t1; } else { tk = Math.round(raw / sn) * sn; }
    return Math.max(0, Math.min(lim, tk));
  }
  // 0〜1 のグラフの位置 → 値（0〜1・その種類の刻みに合わせる）
  function auNormAt(target, fy) { var M = DM(), n = 1 - (fy * AU_H - 4) / (AU_H - 8); n = Math.max(0, Math.min(1, n)); return M.autoNorm(target, M.autoReal(target, n)); }
  // fx・fy（グラフの中の 0〜1）の近くの点（グラフの幅 340 のうち ±near）→ tick か null
  function auNear(p, t, target, fx, fy, near) {
    var M = DM(), a = M.autoLane(t, target), end = auEnd(p, a), i, best = null, bd = 1e9;
    if (!a || !a.points.length) { return null; }
    for (i = 0; i < a.points.length; i++) { var dx = (a.points[i][0] / end - fx) * AU_W, dy = ((1 - a.points[i][1]) * (AU_H - 8) + 4 - fy * AU_H), d = Math.sqrt(dx * dx + dy * dy); if (d < bd) { bd = d; best = a.points[i][0]; } }
    return bd <= (near || 14) ? best : null;
  }
  var auEdit = {
    // グラフをタップ: 点の近く ＝ 選ぶ・それ以外 ＝ 点を足して選ぶ
    tap: function (fx, fy, near) {
      var p = project(), M = DM(), t = M.findTrack(p, st.au.track), tg = st.au.target; if (!t) { return { ok: false }; }
      var hit = auNear(p, t, tg, fx, fy, near);
      if (hit !== null) { st.au.sel = hit; st.au.msg = ""; return { ok: true, sel: hit }; }
      var a = M.autoLane(t, tg), tick = auSnapTick(p, fx * auEnd(p, a)), n = auNormAt(tg, fy), snap = snapTracks(), r = M.autoSet(p, t, tg, tick, M.autoReal(tg, n));
      if (!r.ok) { st.au.msg = "&#x26A0;&#xFE0F; " + escHtml(r.why); return r; }
      auDone(snap); st.au.sel = tick; st.au.msg = (r.replaced ? "同じ位置の点の値を変えました" : "点を足しました") + "（" + auPosText(auPos(p, tick)) + "・" + auText(tg, r.value) + "）";
      return { ok: true, added: !r.replaced, sel: tick };
    },
    // 選んだ点を（fx, fy）へ動かす（指をはなしたとき 1 回・↶ 1 回）
    drag: function (from, fx, fy) {
      var p = project(), M = DM(), t = M.findTrack(p, st.au.track), tg = st.au.target; if (!t) { return { ok: false }; }
      var a = M.autoLane(t, tg), to = auSnapTick(p, fx * auEnd(p, a)), n = auNormAt(tg, fy), snap = snapTracks(), r = M.autoMove(p, t, tg, from, to, n);
      if (!r.ok) { st.au.msg = "&#x26A0;&#xFE0F; " + escHtml(r.why); return r; }
      auDone(snap); st.au.sel = to; st.au.msg = "点を動かしました（" + auPosText(auPos(p, to)) + "・" + auText(tg, M.autoReal(tg, n)) + "）"; return r;
    },
    // 選んだ点: dt（tick）・dv（画面の値の刻み）
    nudge: function (dt, dv) {
      var p = project(), M = DM(), t = M.findTrack(p, st.au.track), tg = st.au.target, a = t ? M.autoLane(t, tg) : null, sel = st.au.sel, i, q = null;
      for (i = 0; a && i < a.points.length; i++) { if (a.points[i][0] === sel) { q = a.points[i]; } }
      if (!q) { st.au.msg = "&#x26A0;&#xFE0F; 点を選んでください（グラフの点をタップ）"; return { ok: false }; }
      var d = M.AUTO_TARGETS[tg], to = Math.max(0, q[0] + dt), real = M.autoReal(tg, q[1]) + dv * d.step, n = M.autoNorm(tg, real), snap = snapTracks(), r = M.autoMove(p, t, tg, q[0], to, n);
      if (!r.ok) { st.au.msg = "&#x26A0;&#xFE0F; " + escHtml(r.why); return r; }
      auDone(snap); st.au.sel = to; st.au.msg = auPosText(auPos(p, to)) + "・" + auText(tg, M.autoReal(tg, n)); return r;
    },
    del: function () { var p = project(), M = DM(), t = M.findTrack(p, st.au.track); if (!t || st.au.sel === null || st.au.sel === undefined) { return false; } var ok0 = auApi.del(t.id, st.au.target, st.au.sel); if (ok0) { st.au.sel = null; st.au.msg = "点を消しました（↶ で戻せます）"; } return ok0; },
    // 範囲（小節 a〜b）をコピー
    copy: function (ba, bb) {
      var p = project(), M = DM(), t = M.findTrack(p, st.au.track), tg = st.au.target; ba = Math.max(1, Math.round(Number(ba)) || 1); bb = Math.max(ba, Math.round(Number(bb)) || ba);
      var c = t ? M.autoCopy(t, tg, M.barToTick(p, ba - 1), M.barToTick(p, bb)) : null;
      st.au.ca = ba; st.au.cb = bb;
      if (!c) { st.au.msg = "&#x26A0;&#xFE0F; " + ba + "〜" + bb + " 小節に点がありません"; return { ok: false }; }
      c.from = t.name; c.bars = bb - ba + 1; c.bar0 = ba; st.auClip = c; st.au.msg = c.n + " 個の点をコピーしました（" + ba + "〜" + bb + " 小節）。貼り付ける小節を入れてください"; return { ok: true, n: c.n };
    },
    paste: function (bar) {
      var p = project(), M = DM(), t = M.findTrack(p, st.au.track), tg = st.au.target; bar = Math.max(1, Math.round(Number(bar)) || 1); st.au.pbar = bar;
      if (!t) { return { ok: false }; }
      var snap = snapTracks(), r = M.autoPaste(p, t, tg, M.barToTick(p, bar - 1), st.auClip);
      if (!r.ok) { st.au.msg = "&#x26A0;&#xFE0F; " + escHtml(r.why); return r; }
      auDone(snap); st.au.msg = r.added + " 個の点を " + bar + " 小節目から貼り付けました" + (r.removed ? "（その範囲の点 " + r.removed + " 個を置きかえ）" : "") + (r.dropped ? "・入らなかった点 " + r.dropped + " 個（64 個まで・曲の外）" : "") + "（↶ で戻せます）"; return r;
    },
    // 選んだ点の 1 小節前から鳴らす
    play: function () { var p = project(), M = DM(), sel = st.au.sel; if (sel === null || sel === undefined) { return startPlay(); } var b = Math.max(0, M.tickToBar(p, sel).bar - 2); return startPlay({ from: M.barToTick(p, b) }); }
  };
  function auSelHtml(p, t, a, tg) {
    var M = DM(), sel = st.au.sel, q = null, i, sn = st.au.snap !== undefined ? st.au.snap : 960;
    for (i = 0; a && i < a.points.length; i++) { if (a.points[i][0] === sel) { q = a.points[i]; } }
    var h = '<div class="dm-row dau-edit"><div class="dau-snap small">グリッド ' + AU_SNAPS.map(function (s0) { return '<button class="daw-ced-c' + (s0[0] === sn ? ' on' : '') + '" data-au="snap:' + s0[0] + '">' + s0[1] + '</button>'; }).join("") + '</div>';
    if (q) {
      var stepT = sn || M.ticksPerBar(M.meterAt(p, q[0])), big = tg === "mod" ? 8 : (tg === "pan" ? 10 : (tg.indexOf("eq.") === 0 ? 2 : 5));
      h += '<div class="dau-selrow"><b class="small">選んだ点: ' + auPosText(auPos(p, q[0])) + '・' + auText(tg, M.autoReal(tg, q[1])) + '</b><br>' +
        '<button class="daw-ced-c" data-au="nudge:' + (-stepT) + ':0">&#x25C0; 前へ</button><button class="daw-ced-c" data-au="nudge:' + stepT + ':0">後ろへ &#x25B6;</button>' +
        '<button class="daw-ced-c" data-au="nudge:0:' + big + '">&#x25B2; 上げる</button><button class="daw-ced-c" data-au="nudge:0:' + (-big) + '">&#x25BC; 下げる</button>' +
        '<button class="daw-ced-c" data-au="seldel">&#x1F5D1;&#xFE0F; 消す</button><button class="daw-ced-c" data-au="selplay">&#x25B6;&#xFE0F; 1 小節前から</button></div>';
    } else { h += '<p class="small dfx-note">グラフの空いた所をタップ ＝ 点を足す（グリッドに合わせる）・点をタップ ＝ 選ぶ・選んだ点をドラッグ ＝ 動かす（指をはなしたとき 1 回だけ ↶ に入ります）。</p>'; }
    var bars = Math.max(1, M.tickToBar(p, Math.max(0, M.songEndTick(p) - 1)).bar), cb = st.auClip;
    h += '<div class="dau-cp small">コピー <input type="number" class="dfx-num" inputmode="numeric" min="1" max="256" value="' + (st.au.ca || 1) + '" data-auf="ca" aria-label="コピーのはじまりの小節"> 〜 <input type="number" class="dfx-num" inputmode="numeric" min="1" max="256" value="' + (st.au.cb || Math.min(4, bars)) + '" data-auf="cb" aria-label="コピーの終わりの小節"> 小節 <button class="daw-ced-c" data-au="copy">&#x1F4CB; コピー</button>' +
      (cb ? '<br>コピー中: ' + escHtml(M.AUTO_TARGETS[cb.target] ? M.AUTO_TARGETS[cb.target].name : cb.target) + ' ' + cb.n + ' 個（' + escHtml(cb.from) + '・' + cb.bar0 + ' 小節目から ' + cb.bars + ' 小節）→ <input type="number" class="dfx-num" inputmode="numeric" min="1" max="256" value="' + (st.au.pbar || 1) + '" data-auf="pbar" aria-label="貼り付ける小節"> 小節目へ <button class="daw-ced-c" data-au="paste">貼り付け</button>（同じ種類なら、ほかのトラックにも）' : '') + '</div>';
    return h + '</div>';
  }
  function auTargetNote(tg) {
    if (tg === "mod") { return '<p class="small dfx-note dau-midi">&#x2139;&#xFE0F; <b>MIDI だけ</b>: ゴリラの音源の鳴り方は変わりません。MIDI に CC1（モジュレーション）として書き出すので、Cubasis などの音源でビブラート・音色の変化に使えます（どう変わるかは受けとる音源しだい）。</p>'; }
    if (tg === "expr") { return '<p class="small dfx-note">Expression は、音量（フェーダー・音量のオートメーション）とは別の、もう一段の音量です（100 ＝ そのまま）。再生・WAV・ステムに効き、MIDI では CC11 になります。</p>'; }
    if (tg.indexOf("eq.") === 0) { return '<p class="small dfx-note">EQ のオートメーションは再生・WAV・ステムに効きますが、MIDI には入りません（MIDI に決まった番号がないため）。</p>'; }
    return '<p class="small dfx-note">MIDI では ' + (tg === "vol" ? "CC7（ボリューム）" : "CC10（パン）") + ' として書き出します。</p>';
  }
  // グラフの指の操作
  function auBindGraph(root, ctl) {
    var g = root.querySelector && root.querySelector(".dau-g"); if (!g || !g.addEventListener) { return; }
    var p = project(), M = DM(), t = M.findTrack(p, st.au.track), tg = st.au.target, drag = null;
    function fxy(e) { var r = g.getBoundingClientRect(); return { fx: Math.max(0, Math.min(1, (e.clientX - r.left) / (r.width || 1))), fy: Math.max(0, Math.min(1, (e.clientY - r.top) / (r.height || 1))), sx: AU_W / (r.width || 1) }; }
    g.addEventListener("pointerdown", function (e) {
      var q = fxy(e), hit = auNear(p, t, tg, q.fx, q.fy, 16 * q.sx);
      if (e.preventDefault) { e.preventDefault(); }
      if (hit !== null && hit === st.au.sel) { drag = { from: hit, moved: false, q: q }; try { g.setPointerCapture(e.pointerId); } catch (e1) {} return; }
      auEdit.tap(q.fx, q.fy, 16 * q.sx); renderAuto(root, ctl);
    });
    g.addEventListener("pointermove", function (e) {
      if (!drag) { return; }
      var q = fxy(e), dot = g.querySelector("circle.sel"); drag.moved = true; drag.q = q;
      if (dot) { dot.setAttribute("cx", Math.round(q.fx * AU_W)); dot.setAttribute("cy", Math.round(q.fy * AU_H)); }
    });
    function up() { if (!drag) { return; } var d = drag; drag = null; if (d.moved) { auEdit.drag(d.from, d.q.fx, d.q.fy); } renderAuto(root, ctl); }
    g.addEventListener("pointerup", up); g.addEventListener("pointercancel", function () { drag = null; renderAuto(root, ctl); });
  }
  function auHead(root, tick) {
    var p = st.project, t = DM().findTrack(p, st.au.track), now = root.querySelector(".dau-now"), at = root.querySelector(".dau-at"), ph = root.querySelector(".dau-ph"), g = root.querySelector(".dau-g");
    if (!t) { return; }
    if (!pl) { tick = Math.max(0, Math.round(st.cue || 0)); }
    if (now) { now.textContent = auText(st.au.target, DM().autoNow(t, st.au.target, tick)); }
    if (at) { at.textContent = auPosText(auPos(p, tick)); }
    if (ph && g) { var x = Math.min(340, tick / (Number(g.getAttribute("data-end")) || 1) * 340); ph.setAttribute("x1", x); ph.setAttribute("x2", x); }
  }
  function renderAuto(root, ctl) {
    var p = project(), M = DM(), t = M.findTrack(p, st.au && st.au.track);
    if (!t) { st.view = "arr"; st.au = null; render(root, ctl); return; }
    root.innerHTML = auHtml(p, t);
    if (!root.querySelectorAll) { return; }
    var au = st.au, tg = au.target, els = root.querySelectorAll("button"), k;
    function val(n) { var e = root.querySelector('[data-auf="' + n + '"]'); return e ? e.value : ""; }
    for (k = 0; k < els.length; k++) {
      els[k].onclick = function (ev) {
        var el = ev.currentTarget, v = el.getAttribute("data-au"), x;
        au.msg = "";
        if (v === "back") { st.view = au.from === "mix" ? "mix" : "arr"; render(root, ctl); return; }
        if (v === "play") { startPlay(); renderAuto(root, ctl); return; }
        if (v === "stop") { transportStop(); renderAuto(root, ctl); return; }
        if (v === "undo") { ops.undo(); return; }
        if (v === "redo") { ops.redo(); return; } // §345 A28
        if (v && v.indexOf("snap:") === 0) { au.snap = Number(v.substring(5)); renderAuto(root, ctl); return; }
        if (v && v.indexOf("nudge:") === 0) { var nq = v.split(":"); auEdit.nudge(Number(nq[1]), Number(nq[2])); renderAuto(root, ctl); return; }
        if (v === "seldel") { auEdit.del(); renderAuto(root, ctl); return; }
        if (v === "selplay") { auEdit.play(); renderAuto(root, ctl); return; }
        if (v === "copy") { auEdit.copy(val("ca"), val("cb")); renderAuto(root, ctl); return; }
        if (v === "paste") { auEdit.paste(val("pbar")); renderAuto(root, ctl); return; }
        if (v === "on") { var a0 = M.autoLane(t, tg); auApi.on(t.id, tg, !(a0 && a0.on !== false)); }
        else if (v === "add") {
          au.bar = val("bar"); au.beat = val("beat");
          var r = auApi.set(t.id, tg, val("bar"), val("beat"), val("val"));
          au.msg = r.ok ? (r.replaced ? "同じ位置の点の値を変えました" : "点を足しました") + "（" + auText(tg, r.value) + "）" : "&#x26A0;&#xFE0F; " + r.why;
        }
        else if (v === "clear") { auApi.clear(t.id, tg); au.msg = "点を全部消しました（↶ で戻せます）"; }
        else if ((x = el.getAttribute("data-aut"))) { au.target = x; au.sel = null; }
        else if ((x = el.getAttribute("data-aud"))) { auApi.del(t.id, tg, Number(x)); au.msg = "点を消しました"; }
        renderAuto(root, ctl);
      };
    }
    var sel = root.querySelector('select[data-au="track"]');
    if (sel) { sel.onchange = function () { au.track = sel.value; au.msg = ""; au.sel = null; renderAuto(root, ctl); }; }
    var ins = root.querySelectorAll("input[data-aupv]");
    for (k = 0; k < ins.length; k++) {
      ins[k].onchange = function (ev) { var el = ev.currentTarget, r = auApi.setTick(t.id, tg, Number(el.getAttribute("data-aupv")), el.value); au.msg = r.ok ? "値を変えました（" + auText(tg, r.value) + "）" : "&#x26A0;&#xFE0F; " + (r.why || "変えられませんでした"); renderAuto(root, ctl); };
    }
    drawHead();
    auBindGraph(root, ctl); // §345 A28
  }

  // ---------- §342 9B-1: 曲の構成（セクション）・小節へ・クリップの繰り返し・セクションの複製 ----------
  // ↶ の写し: セクション（markers）も入れる（いままでの写しはトラックの配列のまま）
  function snapAll() { return { __all: true, tracks: snapTracks(), markers: JSON.parse(JSON.stringify(project().markers || [])), tempo: JSON.parse(JSON.stringify(project().tempo || null)) }; } // 9B-12: テンポも
  function secBar(p, tick) { return Math.round(tick / DM().barTicks(p)) + 1; }
  function secBars(p, len) { return Math.round(len / DM().barTicks(p)); }
  // 小節へ: 鳴っていれば、そこから鳴らしなおす。止まっていれば、▶ のはじまり（キュー）にする。そこが見えるように横へ
  function jumpTo(tick) {
    var p = project(), M = DM();
    if (!p) { return false; }
    tick = Math.max(0, Math.round(Number(tick) || 0));
    var bar = M.tickToBar(p, tick).bar;
    if (rec.state !== "idle") { st.anote = "録音中は小節へ移れません"; if (st.root) { rerender(); } return false; }
    st.cue = tick;
    if (pl && !pl.clip) { startPlay({ from: tick }); st.anote = "&#x25B6;&#xFE0F; " + bar + " 小節目から鳴らしています"; }
    else { st.anote = "&#x25B6;&#xFE0F; ▶ を押すと " + bar + " 小節目から鳴ります（⏹ で頭へ）"; }
    st.view = "arr"; st.secUI = null; st.scroll = Math.max(0, tickX(tick) - 24); st.reveal = false;
    if (st.root) { render(st.root, st.ctl); }
    return true;
  }
  var sections = {
    list: function () { return DM().sectionsOf(project()); },
    // 足す・変える・消す（↶ に積む・自動保存）
    add: function (o) { var s = snapAll(), r = DM().addSection(project(), o); if (!r.ok) { st.secMsg = r.why; if (st.root) { rerender(); } return r; } pushUndo(s); markDirty(); st.secMsg = ""; st.secUI = null; st.secNote = "「" + r.section.name + "」を足しました"; if (st.root) { rerender(); } return r; },
    update: function (id, o) { var s = snapAll(), r = DM().updateSection(project(), id, o); if (!r.ok) { st.secMsg = r.why; if (st.root) { rerender(); } return r; } pushUndo(s); markDirty(); st.secMsg = ""; st.secUI = null; st.secNote = "「" + r.section.name + "」を変えました"; if (st.root) { rerender(); } return r; },
    remove: function (id) { var s = snapAll(), f = DM().findSection(project(), id), r = DM().deleteSection(project(), id); if (!r.ok) { st.secMsg = r.why; if (st.root) { rerender(); } return r; } pushUndo(s); markDirty(); st.secMsg = ""; st.secUI = null; st.secNote = "「" + (f ? f.name : "") + "」を消しました（クリップはそのまま・↶ で戻せます）"; if (st.root) { rerender(); } return r; },
    copy: function (id, destBar) {
      var p = project(), s = snapAll(), r = DM().copySection(p, id, destBar);
      if (!r.ok) { st.secMsg = r.why; if (st.root) { rerender(); } return r; }
      pushUndo(s); markDirty(); if (pl) { resync(); }
      st.secMsg = ""; st.secUI = null;
      st.secNote = "クリップ " + r.clips.length + " 個を " + secBar(p, r.dest) + " 小節目へ複製しました" + (r.section ? "（セクション「" + r.section.name + "」も足しました）" : "（そこにはセクションがあるので、セクションは足していません）") + (r.cross ? "・境目をまたぐクリップ " + r.cross + " 個は対象外" : "") + "（↶ 1 回で戻せます）";
      if (st.root) { rerender(); }
      return r;
    },
    jump: function (id) { var f = DM().findSection(project(), id); return f ? jumpTo(f.tick) : false; }
  };
  // 下書き（足す・変える・複製の欄）
  function secDraft(mode, id) {
    var p = project(), M = DM(), l = M.sectionsOf(p), bt = M.barTicks(p), f = id ? M.findSection(p, id) : null, used = {}, i, name = "";
    for (i = 0; i < l.length; i++) { used[l[i].name] = true; }
    if (mode === "add") {
      for (i = 0; i < M.SECTION_NAMES.length && !name; i++) { if (!used[M.SECTION_NAMES[i]]) { name = M.SECTION_NAMES[i]; } }
      var after = l.length ? l[l.length - 1].tick + l[l.length - 1].len : 0;
      return { mode: "add", name: name || "サビ", bar: Math.floor(after / bt) + 1, bars: 4, color: M.SECTION_COLORS[l.length % M.SECTION_COLORS.length] };
    }
    if (!f) { return null; }
    if (mode === "edit") { return { mode: "edit", id: id, name: f.name, bar: secBar(p, f.tick), bars: secBars(p, f.len), color: f.color }; }
    return { mode: "copy", id: id, dest: Math.ceil(M.songEndTick(p) / bt) + 1 };
  }
  function secHtml(p) {
    var M = DM(), l = M.sectionsOf(p), U = st.secUI, i, h, bt = M.barTicks(p);
    h = '<div class="daw dsec"><div class="daw-top"><button class="modal-btn daw-small" data-sx="back">&#x2190; アレンジ</button><b>&#x1F3BC; 曲の構成</b></div>' + projBarHtml(p) +
      '<div class="da-tools"><button class="modal-btn daw-small" data-sx="undo"' + (st.undo.length ? '' : ' disabled') + '>&#x21B6; 戻す<small>' + (st.undo.length || '') + '</small></button>' +
      '<button class="modal-btn daw-small" data-sx="add"' + (l.length >= M.MAX_SECTIONS ? ' disabled' : '') + '>&#xFF0B; セクションを足す</button></div>';
    if (st.secNote) { h += '<div class="da-note">' + escHtml(st.secNote) + '</div>'; }
    if (U && (U.mode === "add" || U.mode === "edit")) {
      var chk = M.sectionRange(p, U.bar, U.bars, U.mode === "edit" ? U.id : null), nb = '';
      for (i = 0; i < M.SECTION_NAMES.length; i++) { nb += '<button class="modal-btn sec-nm' + (U.name === M.SECTION_NAMES[i] ? ' daw-on' : '') + '" data-sn="' + escHtml(M.SECTION_NAMES[i]) + '">' + escHtml(M.SECTION_NAMES[i]) + '</button>'; }
      var cb = ''; for (i = 0; i < M.SECTION_COLORS.length; i++) { cb += '<button class="sec-col sc-' + M.SECTION_COLORS[i] + (U.color === M.SECTION_COLORS[i] ? ' on' : '') + '" data-sc="' + M.SECTION_COLORS[i] + '" aria-label="' + M.SECTION_COLORS[i] + '"></button>'; }
      h += '<div class="daw-info sec-form"><div><b>' + (U.mode === "add" ? '&#xFF0B; セクションを足す' : '&#x270F;&#xFE0F; セクションを変える') + '</b>（目印だけ。クリップは動きません）</div>' +
        '<div class="sec-line">名前: <b>' + escHtml(U.name || "（なし）") + '</b> <button class="modal-btn daw-small" data-sx="nameFree">&#x270F;&#xFE0F; 自由入力</button></div><div class="sec-nms">' + nb + '</div>' +
        '<div class="sec-line">はじまり <button class="modal-btn sec-st" data-sf="bar-">&#x2212;</button><button class="ae-val" data-sf="barv">' + U.bar + ' 小節目</button><button class="modal-btn sec-st" data-sf="bar+">＋</button></div>' +
        '<div class="sec-line">長さ <button class="modal-btn sec-st" data-sf="bars-">&#x2212;</button><button class="ae-val" data-sf="barsv">' + U.bars + ' 小節</button><button class="modal-btn sec-st" data-sf="bars+">＋</button></div>' +
        '<div class="sec-line">色 <span class="sec-cols">' + cb + '</span></div>' +
        (chk.ok ? '<div class="small">' + U.bar + '〜' + (U.bar + U.bars - 1) + ' 小節目</div>' : '<div class="daw-msg">&#x26A0;&#xFE0F; ' + escHtml(chk.why) + '</div>') +
        '<div class="da-btns"><button class="modal-btn da-half" data-sx="save"' + (chk.ok && U.name ? '' : ' disabled') + '>' + (U.mode === "add" ? '&#xFF0B; 足す' : '&#x2705; 変える') + '</button><button class="modal-btn da-half" data-sx="cancel">やめる</button></div></div>';
    }
    if (U && U.mode === "copy") {
      var fs0 = M.findSection(p, U.id), plan = fs0 ? M.sectionCopyPlan(p, U.id, U.dest) : { ok: false, why: "セクションが見つかりません" };
      var what = plan.ok ? 'クリップ ' + plan.items.length + ' 個（' + (function () { var nm = {}, o = [], q; for (q = 0; q < plan.items.length; q++) { if (!nm[plan.items[q].track.id]) { nm[plan.items[q].track.id] = 1; o.push(plan.items[q].track.name); } } return escHtml(o.join("・")); })() + '）を、' + U.dest + ' 小節目へ' + (plan.newSection ? '（セクションも足す）' : '（そこにはセクションがあるので、セクションは足さない）') : '';
      h += '<div class="daw-info sec-form"><div><b>&#x1F4CB; 「' + escHtml(fs0 ? fs0.name : "") + '」をまとめて複製</b>（' + (fs0 ? secBar(p, fs0.tick) + '〜' + (secBar(p, fs0.tick) + secBars(p, fs0.len) - 1) + ' 小節目' : '') + 'の中に全部入っているクリップ）</div>' +
        '<div class="sec-line">コピー先 <button class="modal-btn sec-st" data-sf="dest-">&#x2212;</button><button class="ae-val" data-sf="destv">' + U.dest + ' 小節目から</button><button class="modal-btn sec-st" data-sf="dest+">＋</button></div>' +
        (plan.ok ? '<div class="small">' + what + (plan.cross ? '<br>境目をまたぐクリップ ' + plan.cross + ' 個は対象外' : '') + '</div>' : '<div class="daw-msg">&#x26A0;&#xFE0F; ' + escHtml(plan.why) + '</div>') +
        '<div class="da-btns"><button class="modal-btn da-half" data-sx="copyGo"' + (plan.ok ? '' : ' disabled') + '>&#x1F4CB; 複製する</button><button class="modal-btn da-half" data-sx="cancel">やめる</button></div></div>';
    }
    if (st.secMsg) { h += '<div class="daw-msg">&#x26A0;&#xFE0F; ' + escHtml(st.secMsg) + '</div>'; }
    if (!l.length) { h += '<p class="small dsv-note">まだセクションはありません。「＋ セクションを足す」から、イントロ・Aメロ・サビなどの目印を付けられます。</p>'; }
    for (i = 0; i < l.length; i++) {
      var s = l[i], ci = M.clipsInSection(p, s), b0 = secBar(p, s.tick), n0 = secBars(p, s.len);
      h += '<div class="sec-row"><span class="sec-chip sc-' + escHtml(s.color || "blue") + '"></span><div class="sec-meta"><b>' + escHtml(s.name) + '</b><br><span class="small">' + b0 + '〜' + (b0 + n0 - 1) + ' 小節目（' + n0 + ' 小節）・中のクリップ ' + ci.inside.length + ' 個' + (ci.cross ? '・またぐ ' + ci.cross + ' 個' : '') + '</span></div>' +
        '<div class="sec-btns"><button class="modal-btn sec-b" data-sj="' + s.id + '" title="この小節へ">&#x25B6;&#xFE0F;</button><button class="modal-btn sec-b" data-se="' + s.id + '" title="変える">&#x270F;&#xFE0F;</button><button class="modal-btn sec-b" data-sc2="' + s.id + '" title="中のクリップをまとめて複製">&#x1F4CB;</button><button class="modal-btn sec-b" data-sd="' + s.id + '" title="消す（クリップは消えない）">&#x1F5D1;&#xFE0F;</button></div></div>';
    }
    return h + saveNoteHtml() + '<p class="small dsv-note">セクションは目印です。足す・変える・消すで音符やクリップは動きません。&#x25B6;&#xFE0F; でその小節へ（止まっているときは ▶ のはじまり）。&#x1F4CB; は、セクションの中に全部入っているクリップを、まとめて別の小節へ複製します（重なる所があれば何もしません）。&#x21B6; で戻せます。</p></div>';
  }
  function renderSec(root, ctl) {
    var p = project(), M = DM();
    root.innerHTML = secHtml(p);
    st.secNote = "";
    if (!root.querySelectorAll) { return; }
    var els = root.querySelectorAll("button"), k;
    function again() { renderSec(root, ctl); }
    function ask(label, cur) { var a = window.prompt ? window.prompt(label, String(cur)) : null; return a !== null && a !== undefined && String(a).replace(/\s/g, "") !== "" && isFinite(Number(a)) ? Math.round(Number(a)) : null; }
    for (k = 0; k < els.length; k++) {
      els[k].onclick = function (ev) {
        var el = ev.currentTarget, v = el.getAttribute("data-sx"), U = st.secUI, t;
        if (v === "back") { st.view = "arr"; st.secUI = null; st.secMsg = ""; render(root, ctl); return; }
        if (v === "undo") { st.secUI = null; st.secMsg = ""; edit.undo(); return; }
        if (v === "add") { st.secUI = secDraft("add"); st.secMsg = ""; again(); return; }
        if (v === "cancel") { st.secUI = null; st.secMsg = ""; again(); return; }
        if ((t = el.getAttribute("data-sj"))) { sections.jump(t); return; }
        if ((t = el.getAttribute("data-se"))) { st.secUI = secDraft("edit", t); st.secMsg = ""; again(); return; }
        if ((t = el.getAttribute("data-sc2"))) { st.secUI = secDraft("copy", t); st.secMsg = ""; again(); return; }
        if ((t = el.getAttribute("data-sd"))) { sections.remove(t); return; }
        if (!U) { return; }
        if ((t = el.getAttribute("data-sn"))) { U.name = t; again(); return; }
        if ((t = el.getAttribute("data-sc"))) { U.color = t; again(); return; }
        if (v === "nameFree") { var nm = window.prompt ? window.prompt("セクションの名前（20 字まで）", U.name || "") : null; if (nm !== null && nm !== undefined) { U.name = String(nm).replace(/^\s+|\s+$/g, "").substring(0, 20); } again(); return; }
        if ((t = el.getAttribute("data-sf"))) {
          if (t === "bar-") { U.bar = Math.max(1, U.bar - 1); } else if (t === "bar+") { U.bar = Math.min(256, U.bar + 1); }
          else if (t === "bars-") { U.bars = Math.max(1, U.bars - 1); } else if (t === "bars+") { U.bars = Math.min(256, U.bars + 1); }
          else if (t === "dest-") { U.dest = Math.max(1, U.dest - 1); } else if (t === "dest+") { U.dest = Math.min(256, U.dest + 1); }
          else if (t === "barv") { var a1 = ask("はじまりの小節（1〜256）", U.bar); if (a1 !== null) { U.bar = Math.max(1, Math.min(256, a1)); } }
          else if (t === "barsv") { var a2 = ask("長さ（小節）", U.bars); if (a2 !== null) { U.bars = Math.max(1, Math.min(256, a2)); } }
          else if (t === "destv") { var a3 = ask("コピー先の小節（1〜256）", U.dest); if (a3 !== null) { U.dest = Math.max(1, Math.min(256, a3)); } }
          again(); return;
        }
        if (v === "save") { if (U.mode === "add") { sections.add({ name: U.name, bar: U.bar, bars: U.bars, color: U.color }); } else { sections.update(U.id, { name: U.name, bar: U.bar, bars: U.bars, color: U.color }); } return; }
        if (v === "copyGo") { sections.copy(U.id, U.dest); }
      };
    }
    bindProjBar(root, ctl);
  }
  // クリップの繰り返しの欄（パネルの中）
  function repeatHtml(p, f) {
    var M = DM(), R = st.repeat, bt = M.barTicks(p), plan = M.repeatPlan(p, f.clip.id, R.n, (R.bar - 1) * bt), lenB = Math.round(f.clip.len / bt * 100) / 100;
    return '<div class="daw-info da-panel rp-panel"><div>&#x1F501; <b>' + escHtml(clipLabel(f.clip)) + '</b>（' + lenB + ' 小節）をくり返して並べる（元のクリップはそのまま）</div>' +
      '<div class="sec-line">回数 <button class="modal-btn sec-st" data-rp="n-">&#x2212;</button><button class="ae-val" data-rp="nv">' + R.n + ' 回</button><button class="modal-btn sec-st" data-rp="n+">＋</button>' +
      ' コピー先 <button class="modal-btn sec-st" data-rp="b-">&#x2212;</button><button class="ae-val" data-rp="bv">' + R.bar + ' 小節目</button><button class="modal-btn sec-st" data-rp="b+">＋</button></div>' +
      (plan.ok ? '<div class="small">' + R.bar + '〜' + Math.round((plan.starts[plan.starts.length - 1] + f.clip.len) / bt) + ' 小節目に ' + R.n + ' 個' + (f.clip.type === "audio" ? '（音声の素材は同じものを使います）' : '') + '</div>' : '<div class="daw-msg">&#x26A0;&#xFE0F; ' + escHtml(plan.why) + '</div>') +
      '<div class="da-btns"><button class="modal-btn da-half" data-rp="go"' + (plan.ok ? '' : ' disabled') + '>&#x1F501; 並べる</button><button class="modal-btn da-half" data-rp="cancel">やめる</button></div></div>';
  }

  // ---------- §342 9B-2: 📥 ゲームから取り込む（受け取り箱 → 確かめる → ✅ 曲に追加で、はじめて曲を変える）----------
  // st.inb: { parts: { key: true }, dest: "cur" ／ "new", target: "new" ／ トラックの ID, bar, busy, trashAsk, msg }
  function inbRead() { var M = DM(); return M && M.inboxRead ? M.inboxRead() : { box: null }; }
  function inbUi(box) {
    var u = st.inb, i;
    if (!u || u.id !== box.id) { u = st.inb = { id: box.id, parts: {}, dest: "cur", target: "new", bar: 1, busy: false, trashAsk: false, msg: "", quant: true }; for (i = 0; i < box.parts.length; i++) { u.parts[box.parts[i].key] = box.from === "ukulele" ? (box.parts[i].key === "uke" || box.parts.length === 1) : true; } } // 9B-6: ウクレレ以外（編成のテイク）は、はじめから全部のパート
    var any = false; for (i = 0; i < box.parts.length; i++) { if (u.parts[box.parts[i].key]) { any = true; } }
    if (!any && box.parts.length) { u.parts[box.parts[0].key] = true; }
    return u;
  }
  function inbSel(box, u) { var o = [], i; for (i = 0; i < box.parts.length; i++) { if (u.parts[box.parts[i].key]) { o.push(box.parts[i].key); } } return o; }
  // 計画（新しい曲なら、からの曲で調べる）
  function inbPlan(box, u) {
    var M = DM(), sel = inbSel(box, u), q = u.dest === "new" ? M.newProject({ name: box.name, bpm: box.bpm, meter: box.meter }) : project();
    var tgt = u.dest === "new" || sel.length !== 1 ? "new" : u.target;
    return M.importPlan(q, box, { parts: sel, bar: u.bar, target: tgt, quant: !!u.quant });
  }
  function inbSynthTracks(p, drum) { var o = [], i, M = DM(); for (i = 0; i < p.tracks.length; i++) { var t = p.tracks[i]; if (t.kind === "midi" && M.isDrum(t) === !!drum) { o.push(t); } } return o; } // 9B-3: drum ＝ ドラムのトラック
  function inbPart(box, key) { for (var i = 0; i < box.parts.length; i++) { if (box.parts[i].key === key) { return box.parts[i]; } } return null; }
  function inbHasDrum(box, u) { var sel = inbSel(box, u), i; for (i = 0; i < sel.length; i++) { var pt = inbPart(box, sel[i]); if (pt && pt.preset === "drum") { return true; } } return false; }
  // 試聴: はじめの 8 小節を DAW の音色で（曲は変えない・UGSynth に直接）
  function inbPrevStop() { if (st.inbPrev) { st.inbPrev = null; try { if (window.UGSynth && window.UGSynth.kill) { window.UGSynth.kill(); } } catch (e) {} } }
  function inbPreview(box, u) {
    var UG = window.UGMelody, Y = window.UGSynth, M = DM(), ac = null, i, j, n = 0;
    stopPlay(false); inbPrevStop();
    try { ac = UG && UG.audioInit ? UG.audioInit() : null; } catch (e) { ac = null; }
    if (!ac || !Y || !Y.note || !Y.preset) { u.msg = "音を出す準備ができませんでした"; return false; }
    var bpm = u.dest === "new" ? box.bpm : M.bpmAt(project(), 0), spt = 60 / bpm / M.PPQ, lim = M.PPQ * box.meter * 8, t0 = ac.currentTime + 0.15, out = (UG.audio && UG.audio.bus) || ac.destination, sel = inbSel(box, u);
    for (i = 0; i < box.parts.length; i++) {
      var pt = box.parts[i];
      if (sel.indexOf(pt.key) < 0) { continue; }
      if (pt.preset === "drum") { for (j = 0; j < pt.notes.length && n < 800; j++) { var qd = pt.notes[j]; if (qd[0] >= lim) { break; } try { UG.drum(ac, qd[2], t0 + qd[0] * spt, qd[3], out); n++; } catch (e4) {} } continue; } // 9B-3
      var patch = pt.patch || null; if (!patch) { try { patch = Y.preset(pt.preset).patch; } catch (e2) { patch = null; } } // 9B-7: ゲームの音色があればそれ
      if (!patch) { continue; }
      for (j = 0; j < pt.notes.length && n < 800; j++) { var q = pt.notes[j]; if (q[0] >= lim) { break; } try { Y.note(patch, q[2], out, t0 + q[0] * spt, q[3], Math.max(0.05, Math.min(lim - q[0], q[1]) * spt)); n++; } catch (e3) {} }
    }
    st.inbPrev = { n: n, until: t0 + lim * spt };
    u.msg = n ? "&#x25B6;&#xFE0F; はじめの 8 小節を鳴らしています（" + Math.round(bpm) + " BPM・DAW の音色）" : "鳴らせる音がありません";
    return n > 0;
  }
  // ✅ 曲に追加（いまの曲 ＝ ↶ 1 回で戻る・新しい曲 ＝ いまの曲を保存してから作る）。取りこんだら受け取り箱を消す
  function inbImport() {
    var M = DM(), r0 = inbRead(), box = r0.box, u = box ? inbUi(box) : null;
    if (!box) { st.inbMsg = r0.why || "届いているものがありません"; return { ok: false, why: st.inbMsg }; }
    if (u.busy) { return { ok: false, why: "取りこみ中です" }; }
    var plan = inbPlan(box, u);
    if (!plan.ok) { u.msg = "&#x26A0;&#xFE0F; " + escHtml(plan.why); return { ok: false, why: plan.why }; }
    u.busy = true; inbPrevStop();
    var r, p, saved;
    if (u.dest === "new") {
      flushSave();
      p = M.newProject({ name: box.name, bpm: box.bpm, meter: box.meter }); p.id = M.newProjectId();
      plan = M.importPlan(p, box, { parts: inbSel(box, u), bar: u.bar, target: "new", quant: !!u.quant });
      r = plan.ok ? M.importApply(p, box, plan) : plan;
      if (!r.ok) { u.busy = false; u.msg = "&#x26A0;&#xFE0F; " + escHtml(r.why); return r; }
      switchTo(p, "dirty");
      saved = saveNow();
    } else {
      p = project();
      var snap = snapTracks();
      r = M.importApply(p, box, plan);
      if (!r.ok) { p.tracks = snap; u.busy = false; u.msg = "&#x26A0;&#xFE0F; " + escHtml(r.why); return r; }
      pushUndo(snap);
      saved = saveNow();
    }
    if (saved) { M.inboxClear(); }
    st.backGame = box.from; // 9B-2: 「元のゲームへ戻る」
    st.inb = null; st.view = "arr"; st.sel = { kind: "clip", id: r.clips[0].id }; st.scroll = Math.max(0, tickX(plan.dest) - 24); st.reveal = true;
    var bt = M.barTicks(p);
    st.anote = "&#x1F4E5; 「" + escHtml(box.name) + "」を取りこみました（クリップ " + r.clips.length + " 個・" + (Math.round(plan.dest / bt) + 1) + "〜" + Math.round((plan.dest + plan.span) / bt) + " 小節目" + (u.dest === "new" ? "・新しい曲" : "・↶ 1 回で戻せます") + "）" + (saved ? "" : "。⚠️ 保存できなかったので、受け取り箱は残しています");
    if (pl) { resync(); }
    if (st.root) { render(st.root, st.ctl); }
    return { ok: true, clips: r.clips, tracks: r.tracks, saved: saved, project: p };
  }
  function inbHtml(p) {
    var M = DM(), r0 = inbRead(), box = r0.box, h, i;
    h = '<div class="daw dinb"><div class="daw-top"><button class="modal-btn daw-small" data-ib="back">&#x2190; アレンジ</button><b>&#x1F4E5; ゲームから取り込む</b></div>' + projBarHtml(p) + backHtml();
    if (st.inbMsg) { h += '<div class="da-note">' + st.inbMsg + '</div>'; }
    if (!box) {
      h += r0.bad ? '<div class="daw-msg">&#x26A0;&#xFE0F; ' + escHtml(r0.why) + '</div><div class="da-btns"><button class="modal-btn" data-ib="trash">&#x1F5D1;&#xFE0F; 受け取り箱を空にする</button></div>' : '';
      return h + '<p class="small dsv-note">いま届いているものはありません。ゲームセンターの「&#x1F3B8; ゴリラウクレレ」のシーケンサー・「&#x1F3B9; ゴリラピアノ」「&#x1F941; ゴリラドラム」「&#x1F3B8; ゴリラベース」「&#x1F3B8; ゴリラギター」「&#x1F3BB; ゴリラストリングス」「&#x1F3BA; ゴリラホーン」「&#x1F39B;&#xFE0F; ゴリラシンセ」のテイクの「DAWへ」を押すと、ここで受け取れます（同じブラウザの中だけ・' + M.INBOX_DAYS + ' 日のあいだ）。</p></div>';
    }
    var u = inbUi(box), sel = inbSel(box, u), bars = Math.ceil(box.len / (M.PPQ * box.meter)), sec = Math.round(box.len / M.PPQ * 60 / box.bpm * 10) / 10, d = new Date(box.made), z = function (x) { return (x < 10 ? "0" : "") + x; };
    h += '<div class="daw-info inb-box"><div>' + (M.INBOX_FROM[box.from] || escHtml(box.from)) + '</div><div class="inb-name"><b>' + escHtml(box.name) + '</b></div>' +
      '<div class="small">BPM ' + box.bpm + '・' + box.meter + '/4 拍子・' + bars + ' 小節（' + sec + ' 秒）・送った日時 ' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' + z(d.getHours()) + ':' + z(d.getMinutes()) + '</div>' +
      (box.src && box.src.name ? '<div class="small">元の' + (box.src.kind === "pat" ? "リズム" : (box.src.kind === "take" ? "テイク" : "曲")) + ': ' + escHtml(box.src.name) + '</div>' : '') + // 9B-3
      (box.skipped.length ? '<div class="small">送られていないもの: ' + escHtml(box.skipped.join("・")) + '</div>' : '') + '</div>';
    h += '<div class="inb-sec">取りこむパート</div><div class="inb-parts">';
    for (i = 0; i < box.parts.length; i++) { var pt = box.parts[i], on = !!u.parts[pt.key]; h += '<button class="modal-btn inb-part' + (on ? ' daw-on' : '') + '" data-ib="part:' + escHtml(pt.key) + '">' + (on ? '&#x2705;' : '&#x2B1C;') + ' ' + escHtml(pt.name) + '<small>' + pt.notes.length + ' 音</small></button>'; }
    h += '</div><div class="inb-sec">取り込み先</div><div class="da-btns"><button class="modal-btn da-half' + (u.dest === "cur" ? ' daw-on' : '') + '" data-ib="dest:cur">いまの曲に足す<br><small>「' + escHtml(p.name) + '」</small></button><button class="modal-btn da-half' + (u.dest === "new" ? ' daw-on' : '') + '" data-ib="dest:new">新しい曲を作る<br><small>BPM ' + box.bpm + '・' + box.meter + '/4</small></button></div>';
    var selDrum = sel.length === 1 && inbPart(box, sel[0]) && inbPart(box, sel[0]).preset === "drum", tl = inbSynthTracks(p, selDrum), tname = "";
    if (u.dest === "cur" && sel.length === 1) {
      if (u.target !== "new" && (!M.findTrack(p, u.target) || M.isDrum(M.findTrack(p, u.target)) !== selDrum)) { u.target = "new"; }
      var ft = u.target === "new" ? null : M.findTrack(p, u.target), pp = null; for (i = 0; i < box.parts.length; i++) { if (box.parts[i].key === sel[0]) { pp = box.parts[i]; } }
      tname = ft ? "いまあるトラック「" + escHtml(ft.name) + "」（" + (selDrum ? "ドラム" : "いまの音色") + "）" : "＋ 新しい" + (selDrum ? "ドラムの" : "") + "トラック「" + escHtml(pp ? pp.name : "") + "」（" + escHtml(partSound(pp)) + "）";
      h += '<div class="sec-line">トラック: <b>' + tname + '</b>' + (tl.length ? ' <button class="modal-btn daw-small" data-ib="tgt">&#x21C4; 変える</button>' : '') + '</div>';
    } else {
      var nn = []; for (i = 0; i < box.parts.length; i++) { if (u.parts[box.parts[i].key]) { nn.push(escHtml(box.parts[i].name) + "（" + escHtml(partSound(box.parts[i])) + "）"); } }
      h += '<div class="sec-line">トラック: <b>新しいトラック ' + sel.length + ' 本</b><br><span class="small">' + nn.join("・") + '</span></div>';
    }
    if (inbHasDrum(box, u)) { h += '<div class="da-btns"><button class="modal-btn da-wide' + (u.quant ? ' daw-on' : '') + '" data-ib="quant">' + (u.quant ? '&#x2705;' : '&#x2B1C;') + ' ドラムを 16 分の格子にそろえる<br><small>そろえると 16 ステップで直せます（重なる連打は元の位置のまま）</small></button></div>'; } // 9B-3
    h += '<div class="sec-line">はじまり <button class="modal-btn sec-st" data-ib="bar-">&#x2212;</button><button class="ae-val" data-ib="barv">' + u.bar + ' 小節目</button><button class="modal-btn sec-st" data-ib="bar+">＋</button></div>';
    var warn = [];
    if (u.dest === "cur") {
      var pb = M.bpmAt(p, 0), pm = M.meterAt(p, 0);
      if (Math.round(pb * 100) !== Math.round(box.bpm * 100)) { warn.push("この曲の BPM（" + pb + "）で鳴ります（送った曲は " + box.bpm + "）。音符の位置は拍のまま"); }
      if (pm.num !== box.meter || pm.den !== 4) { warn.push("拍子がちがいます（この曲 " + pm.num + "/" + pm.den + "・送った曲 " + box.meter + "/4）。拍の位置のまま入るので、小節の区切りがずれます"); }
    }
    if (box.tempoRows) { warn.push("送った曲の途中のテンポの変化（" + box.tempoRows + " か所）は入りません"); }
    if (box.from === "drum") { warn.push("ドラムは同じ音で鳴ります（ドラムセットの種類はそのとき読みこまれているもの）"); } else if (box.parts.some(function (q) { return !!q.patch; })) { warn.push("新しいトラックは、ゲームのシンセと同じ音源・同じ音色のつまみで鳴ります（モノ・ポルタメント・XY パッドの動き・強さの変化は入りません）。いまあるトラックに入れるときは、そのトラックの音色です"); } else { warn.push("音色は DAW のシンセです（ゲームの音そのものではありません・トラックの音色はあとで変えられます）"); } // 9B-3
    h += '<div class="small inb-warn">' + warn.map(function (w) { return "・" + escHtml(w); }).join("<br>") + '</div>';
    var plan = inbPlan(box, u);
    if (plan.ok && plan.quant && (plan.quant.moved || plan.quant.kept)) { h += '<div class="small">そろえる打 ' + plan.quant.moved + ' 個（いちばん大きく動くのは ' + Math.round(plan.quant.max / M.PPQ * 60000 / (u.dest === "new" ? box.bpm : M.bpmAt(p, 0))) + 'ms）' + (plan.quant.kept ? '・同じマスに重なるので元の位置のまま ' + plan.quant.kept + ' 個' : '') + '</div>'; } // 9B-3
    if (plan.ok) { var lastBar = plan.bar + Math.round(plan.span / M.barTicks(u.dest === "new" ? M.newProject({ meter: box.meter }) : p)) - 1; h += '<div class="small">' + (lastBar > plan.bar ? plan.bar + '〜' + lastBar : plan.bar) + ' 小節目に、クリップ ' + plan.items.reduce(function (a, x) { return a + x.clips.length; }, 0) + ' 個</div>'; }
    else { h += '<div class="daw-msg">&#x26A0;&#xFE0F; ' + escHtml(plan.why) + '</div>'; }
    if (u.msg) { h += '<div class="da-note">' + u.msg + '</div>'; }
    h += '<div class="da-btns"><button class="modal-btn da-half" data-ib="prev">&#x25B6;&#xFE0F; 試聴</button><button class="modal-btn da-half" data-ib="stop">&#x23F9; 止める</button></div>' +
      '<div class="da-btns"><button class="modal-btn da-wide inb-go" data-ib="go"' + (plan.ok && !u.busy ? '' : ' disabled') + '>&#x2705; 曲に追加</button></div>' +
      '<div class="da-btns"><button class="modal-btn da-wide" data-ib="trash">' + (u.trashAsk ? '&#x26A0;&#xFE0F; 本当に捨てる（元のゲームのデータは残ります）' : '&#x1F5D1;&#xFE0F; 捨てる') + '</button></div>';
    return h + '<p class="small dsv-note">「✅ 曲に追加」を押すまで、曲は変わりません。取りこんだら受け取り箱は空になります（元のゲームのデータはそのまま・また送れます）。</p></div>';
  }
  // ---------- §342 9B-4: 標準 MIDI ファイル（.mid）の書き出し・読み込み ----------
  var mx = { state: "idle", blob: null, url: "", name: "", info: null, msg: "", note: "", bytes: 0 }; // 📤 書き出し
  // st.mid（📥 確認の画面）: { info（midiRead の結果）, id, kinds: { key: "drum" ／ "synth" }, parts: { key: true }, dest: "new" ／ "cur", bar, tempoOk, busy, msg }
  function midiFree() { mx.saved = ""; if (mx.url) { try { URL.revokeObjectURL(mx.url); } catch (e) {} } mx.url = ""; mx.blob = null; mx.state = "idle"; mx.msg = ""; mx.note = ""; mx.info = null; mx.bytes = 0; }
  function midiFileName(p) {
    var d = new Date(), z = function (n) { return (n < 10 ? "0" : "") + n; };
    var base = String(p.name || "gorilla-daw").replace(/[\\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/^[\s.]+|[\s.]+$/g, "").substring(0, 40) || "gorilla-daw";
    return base + "_" + d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + "-" + z(d.getHours()) + z(d.getMinutes()) + ".mid";
  }
  function midiExportNow() {
    var M = DM(), p = project(), r = M.midiExport(p), blob = null;
    midiFree();
    if (!r.ok) { mx.state = "fail"; mx.msg = r.why; return r; }
    try { blob = new Blob([new Uint8Array(r.bytes)], { type: "audio/midi" }); } catch (e) { blob = null; }
    if (!blob) { mx.state = "fail"; mx.msg = "ファイルを作れませんでした"; return { ok: false, why: mx.msg }; }
    mx.state = "done"; mx.blob = blob; mx.name = outName(p.name, "", "mid"); mx.info = r.info; mx.bytes = r.bytes.length;
    try { mx.url = URL.createObjectURL(blob); } catch (e2) { mx.url = ""; }
    return { ok: true, name: mx.name, bytes: r.bytes, info: r.info };
  }
  function midiHtml(p) {
    var M = DM(), x = M.midiExport(p), f = x.info, i, nd = 0, ns = 0, out = [], h;
    for (i = 0; i < f.tracks.length; i++) { if (f.tracks[i].drum) { nd++; } else { ns++; } }
    h = '<div class="dp-wav dp-midi"><div class="dp-h">&#x1F3B9; MIDI ファイル（.mid）</div>' +
      '<div class="small dp-kinds"><b>MIDI</b> ＝ 音符・テンポ・拍子だけ（ほかの音楽ソフトとやりとりする）。<b>音は入りません</b></div>';
    if (x.ok) {
      h += '<div class="small">書き出すトラック ' + f.tracks.length + ' 本（シンセ ' + ns + '・ドラム ' + nd + '）・音符 ' + f.notes + ' 個・BPM ' + M.bpmAt(p, 0) + '・' + M.meterAt(p, 0).num + '/' + M.meterAt(p, 0).den + '・Format 1</div>';
      if (f.audio) { out.push("オーディオトラック " + f.audio + " 本（録音・WAV の素材・コンピング）"); }
      if (f.empty) { out.push("音符の無いトラック " + f.empty + " 本"); }
      out.push("エフェクト・マスター・シンセの音色の中身（近い GM の音色の番号と名前だけ入ります）");
      out.push(f.muted ? "ミュート・ソロ（" + f.muted + " 本。全部のトラックを書き出します）" : "ミュート・ソロ（全部のトラックを書き出します）");
      if (f.swing) { out.push("ドラムのスイング（格子の位置で書き出します）"); }
      if (f.autoEq) { out.push("EQ のオートメーション（" + f.autoEq + " 本・MIDI に決まった番号がないため。WAV・ステムには入ります）"); } // §345 A28
      var dm = [], k; for (k in f.drumMap) { if (f.drumMap.hasOwnProperty(k)) { dm.push(M.drumName(Number(k)) + " " + f.drumMap[k] + " 打 → " + M.drumName(M.DRUM_GM[k])); } }
      h += '<div class="small">入るもの: 音符（高さ・位置・長さ・強さ）・トラック名・BPM・拍子' + (f.tempos > 1 ? '（テンポの変化 ' + (f.tempos - 1) + ' か所も）' : '') + '・セクションの名前（マーカー）' + (f.cc && (f.cc.vol + f.cc.pan + f.cc.expr + f.cc.mod) ? '・オートメーション（' + [["vol", "音量 CC7"], ["pan", "パン CC10"], ["expr", "Expression CC11"], ["mod", "Modulation CC1"]].filter(function (z) { return f.cc[z[0]]; }).map(function (z) { return z[1] + " " + f.cc[z[0]]; }).join("・") + '）' : '') + '<br>入らないもの: ' + escHtml(out.join("・")) + '</div>'; /* §345 A28 */
      if (dm.length || f.drumDrop) { h += '<div class="small uke-daw-warn">&#x26A0;&#xFE0F; ' + (dm.length ? 'ゴリラDAW だけのドラムの番号は GM の近い番号で書きます: ' + escHtml(dm.join("・")) : '') + (f.drumDrop ? (dm.length ? '<br>' : '') + '音のない操作（チョークなど）' + f.drumDrop + ' 個は書きません' : '') + '</div>'; }
      h += '<div class="small">音色はほかのソフトでは同じになりません（シンセは 1〜16ch・ドラムは 10ch）</div>';
    }
    if (mx.state === "done" && mx.blob) {
      h += '<div class="daw-info">&#x2705; 書き出しました: ' + escHtml(mx.name) + '<br><span class="small">' + mx.bytes + ' バイト・トラック ' + mx.info.tracks.length + ' 本・音符 ' + mx.info.notes + ' 個</span>' + (mx.note ? '<br><span class="small">&#x26A0;&#xFE0F; ' + escHtml(mx.note) + '</span>' : '') + '</div>' +
        '<div class="dp-btns"><button class="modal-btn" data-pj="midiSave">&#x1F4BE; ファイルに保存（共有）</button>' + (mx.url ? '<a class="modal-btn dp-dl" href="' + mx.url + '" download="' + escHtml(mx.name) + '">&#x2B07;&#xFE0F; ダウンロード</a>' : '') + '</div>' + fileSaveNote(mx.saved) + '';
    } else if (mx.state === "fail") { h += '<div class="daw-msg">&#x26A0;&#xFE0F; ' + escHtml(mx.msg) + '</div>'; }
    h += x.ok ? '<button class="modal-btn dp-wavgo" data-pj="midiOut">&#x1F4E4; MIDI書き出し（約 ' + (x.bytes.length < 1024 ? x.bytes.length + ' バイト' : Math.ceil(x.bytes.length / 1024) + ' KB') + '）</button>' : '<div class="daw-msg">&#x26A0;&#xFE0F; ' + escHtml(x.why) + '</div>';
    h += '<button class="modal-btn dp-wavgo" data-pj="midiIn">&#x1F4E5; MIDIファイルを読み込む</button>' +
      '<input type="file" class="dp-midifile" accept=".mid,.midi,.smf,audio/midi,audio/x-midi,audio/mid" style="display:none;">';
    if (st.midErr) { h += '<div class="daw-msg">&#x26A0;&#xFE0F; ' + escHtml(st.midErr) + '</div>'; }
    return h + '<p class="small dsv-note">読み込みは Format 0・1 の .mid（' + (M.MIDI_MAX_BYTES / 1048576) + ' MB まで）。選ぶと、まず中身を確かめる画面になります（曲はまだ変わりません）。iPhone では「ファイルに保存（共有）」で共有シートが開く見こみです（実機では未確認）。</p></div>';
  }
  // ファイルのバイト → 確認の画面（曲は変えない）
  function midiOpen(u8, fileName) {
    var M = DM(), r = M.midiRead(u8, fileName), i, n = 0;
    if (!r.ok) { st.mid = null; st.midErr = "読みこめませんでした: " + r.why + "（いまの曲と保存した曲はそのままです）"; return r; }
    var u = { info: r, id: "m" + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36), kinds: {}, parts: {}, dest: "new", bar: 1, tempoOk: !r.tempoChanges.length, busy: false, msg: "" };
    for (i = 0; i < r.parts.length; i++) { u.kinds[r.parts[i].key] = r.parts[i].drum ? "drum" : "synth"; u.parts[r.parts[i].key] = n < M.MAX_TRACKS; n++; }
    st.mid = u; st.midErr = ""; st.view = "midi";
    return r;
  }
  function midSel(u) { var o = [], i, l = u.info.parts; for (i = 0; i < l.length; i++) { if (u.parts[l[i].key]) { o.push(l[i].key); } } return o; }
  function midPlan(u) {
    var M = DM(), mb = M.midiBox(u.info, u.kinds, u.id), q = u.dest === "new" ? M.midiNewProject(u.info, midTempoMap(u)) : project();
    return { plan: M.importPlan(q, mb.box, { parts: midSel(u), bar: u.dest === "new" ? 1 : u.bar, target: "new" }), box: mb.box, drops: mb.drops };
  }
  // 9B-12: MIDI の途中のテンポの変化を、新しい曲のテンポの点にそのまま入れられるか
  function midTempoMap(u) { return !!(u && u.dest === "new" && u.info && u.info.tempoChanges && u.info.tempoChanges.length && DM().midiTempoCheck(u.info).ok); }
  // ✅ 取りこむ（新しい曲 ＝ いまの曲を保存してから作って保存・いまの曲 ＝ 新しいトラックだけ・↶ 1 回で戻る）
  function midiImport() {
    var M = DM(), u = st.mid, r, p, saved, plan, x, i;
    if (!u) { return { ok: false, why: "MIDI ファイルを選んでください" }; }
    if (u.busy) { return { ok: false, why: "取りこみ中です" }; }
    if (!u.tempoOk && !midTempoMap(u)) { u.msg = "&#x26A0;&#xFE0F; 途中でテンポが変わる曲です。「テンポの変化を入れずに続ける」を選ぶか、やめてください"; return { ok: false, why: "tempo" }; }
    x = midPlan(u); plan = x.plan;
    if (!plan.ok) { u.msg = "&#x26A0;&#xFE0F; " + escHtml(plan.why); return { ok: false, why: plan.why }; }
    u.busy = true;
    if (u.dest === "new") {
      flushSave();
      p = M.midiNewProject(u.info, midTempoMap(u)); p.id = M.newProjectId(); // 9B-12: テンポの変化もそのまま
      var ix = readIndex();
      if (ix.ok) { for (i = 0; i < ix.idx.list.length; i++) { if (ix.idx.list[i] && ix.idx.list[i].name === p.name) { p.name = (p.name + "（MIDI）").substring(0, 40); break; } } }
      plan = M.importPlan(p, x.box, { parts: midSel(u), bar: 1, target: "new" });
      r = plan.ok ? M.importApply(p, x.box, plan) : plan;
      if (!r.ok) { u.busy = false; u.msg = "&#x26A0;&#xFE0F; " + escHtml(r.why); return r; }
      switchTo(p, "dirty");
      saved = saveNow();
    } else {
      p = project();
      var snap = snapTracks();
      r = M.importApply(p, x.box, plan);
      if (!r.ok) { p.tracks = snap; u.busy = false; u.msg = "&#x26A0;&#xFE0F; " + escHtml(r.why); return r; }
      pushUndo(snap);
      saved = saveNow();
    }
    var bt = M.barTicks(p), info = u.info;
    st.mid = null; st.midErr = ""; st.view = "arr"; st.sel = { kind: "clip", id: r.clips[0].id }; st.scroll = Math.max(0, tickX(plan.dest) - 24); st.reveal = true;
    st.anote = "&#x1F3B9; 「" + escHtml(info.file || info.name) + "」を取りこみました（トラック " + r.tracks.length + " 本・クリップ " + r.clips.length + " 個・" + (Math.round(plan.dest / bt) + 1) + "〜" + Math.round((plan.dest + plan.span) / bt) + " 小節目" + (u.dest === "new" ? "・新しい曲" : "・↶ 1 回で戻せます") + "）" + (saved ? "" : "。⚠️ 保存できませんでした");
    if (pl) { resync(); }
    if (st.root) { render(st.root, st.ctl); }
    return { ok: true, clips: r.clips, tracks: r.tracks, saved: saved, project: p };
  }
  function midHtml(p) {
    var M = DM(), u = st.mid, f = u.info, i, h, sel = midSel(u), drums = [];
    h = '<div class="daw dinb dmid"><div class="daw-top"><button class="modal-btn daw-small" data-mi="back">&#x2190; もどる</button><b>&#x1F4E5; MIDI ファイルを読み込む</b></div>';
    h += '<div class="daw-info inb-box"><div class="inb-name"><b>' + escHtml(f.file || f.name) + '</b></div>' +
      '<div class="small">Format ' + f.format + '・トラック ' + f.trks + ' 本・音符 ' + f.notes + ' 個<br>BPM ' + f.bpm + '・' + f.meter.num + '/' + f.meter.den + ' 拍子・' + f.bars + ' 小節（' + f.sec + ' 秒）</div></div>';
    h += '<div class="inb-sec">パート（' + f.parts.length + '）</div><div class="mid-parts">';
    for (i = 0; i < f.parts.length; i++) {
      var pt = f.parts[i], on = !!u.parts[pt.key], dr = u.kinds[pt.key] === "drum";
      if (pt.drum) { drums.push(pt.name); }
      h += '<div class="mid-row"><button class="modal-btn inb-part mid-on' + (on ? ' daw-on' : '') + '" data-mi="part:' + pt.key + '">' + (on ? '&#x2705;' : '&#x2B1C;') + ' ' + escHtml(pt.name) + '<small>' + pt.notes.length + ' 音・' + pt.ch + 'ch</small></button>' +
        '<button class="modal-btn mid-kind' + (dr ? ' daw-on' : '') + '" data-mi="kind:' + pt.key + '">' + (dr ? '&#x1F941; ドラム' : '&#x1F3B9; ' + escHtml(presetName(pt.preset))) + '</button></div>';
    }
    h += '</div><div class="small">ドラムの候補（10ch）: ' + (drums.length ? escHtml(drums.join("・")) : 'ありません') + '。「&#x1F3B9;／&#x1F941;」で種類を変えられます</div>';
    var x = midPlan(u), plan = x.plan, warn = [];
    for (i = 0; i < x.drops.length; i++) { if (u.parts[x.drops[i].key]) { warn.push("「" + x.drops[i].name + "」: GM の 35〜81 番にない番号は入れません（" + x.drops[i].text + "）"); } }
    var tmc = M.midiTempoCheck(f); // 9B-12
    if (f.tempoChanges.length && midTempoMap(u)) { var tl2 = []; for (i = 0; i < f.tempoChanges.length && i < 5; i++) { tl2.push(f.tempoChanges[i].bar + " 小節目 → " + f.tempoChanges[i].bpm); } h += '<div class="daw-msg mid-tempo-ok">&#x2705; <b>途中のテンポの変化（' + f.tempoChanges.length + ' か所）もそのまま入れます</b><br><span class="small">' + escHtml(tl2.join("・")) + (f.tempoChanges.length > 5 ? " ほか" : "") + '</span></div>'; }
    else if (f.tempoChanges.length) {
      if (u.dest === "new" && !tmc.ok) { h += '<div class="small mid-tempo-why">テンポの点に入れられない理由: ' + escHtml(tmc.why.join("・")) + '</div>'; } else if (u.dest !== "new") { h += '<div class="small mid-tempo-why">いまの曲へ取りこむときは、いまの曲のテンポのままです（テンポの変化は新しい曲のときだけ入ります）</div>'; }
      var tl = []; for (i = 0; i < f.tempoChanges.length && i < 5; i++) { tl.push(f.tempoChanges[i].bar + " 小節目 → " + f.tempoChanges[i].bpm); }
      h += '<div class="daw-msg mid-tempo">&#x26A0;&#xFE0F; <b>途中でテンポが変わります（' + f.tempoChanges.length + ' か所）</b><br><span class="small">' + escHtml(tl.join("・")) + (f.tempoChanges.length > 5 ? " ほか" : "") + '<br>ゴリラDAW は最初の BPM（' + f.bpm + '）だけで鳴らします。音符の位置（拍）はそのままで、変わる所から先の速さ（秒）が元のファイルとちがいます</span></div>' +
        '<div class="da-btns"><button class="modal-btn da-wide' + (u.tempoOk ? ' daw-on' : '') + '" data-mi="tempo">' + (u.tempoOk ? '&#x2705;' : '&#x2B1C;') + ' テンポの変化を入れずに続ける（BPM ' + f.bpm + ' のまま）</button></div>';
    }
    if (f.meterChanges.length) { var ml = []; for (i = 0; i < f.meterChanges.length && i < 5; i++) { ml.push(f.meterChanges[i].bar + " 小節目 → " + f.meterChanges[i].num + "/" + f.meterChanges[i].den); } warn.push("途中の拍子の変化（" + ml.join("・") + (f.meterChanges.length > 5 ? " ほか" : "") + "）は入りません。音符は拍の位置のままで、小節の区切りがずれます"); }
    h += '<div class="inb-sec">取り込み先</div><div class="da-btns"><button class="modal-btn da-half' + (u.dest === "new" ? ' daw-on' : '') + '" data-mi="dest:new">新しい曲<br><small>BPM ' + f.bpm + '・' + f.meter.num + '/' + f.meter.den + '</small></button><button class="modal-btn da-half' + (u.dest === "cur" ? ' daw-on' : '') + '" data-mi="dest:cur">いまの曲に足す<br><small>「' + escHtml(p.name) + '」</small></button></div>';
    if (u.dest === "cur") {
      h += '<div class="sec-line">新しいトラック ' + sel.length + ' 本・はじまり <button class="modal-btn sec-st" data-mi="bar-">&#x2212;</button><button class="ae-val" data-mi="barv">' + u.bar + ' 小節目</button><button class="modal-btn sec-st" data-mi="bar+">＋</button></div>';
      var pb = M.bpmAt(p, 0), pm = M.meterAt(p, 0);
      if (Math.round(pb * 100) !== Math.round(f.bpm * 100)) { warn.push("この曲の BPM（" + pb + "）で鳴ります（ファイルは " + f.bpm + "）。音符の位置は拍のまま"); }
      if (pm.num !== f.meter.num || pm.den !== f.meter.den) { warn.push("拍子がちがいます（この曲 " + pm.num + "/" + pm.den + "・ファイル " + f.meter.num + "/" + f.meter.den + "）。拍の位置のまま入るので、小節の区切りがずれます"); }
      warn.push("いまあるトラックには入れません（新しいトラックを足すだけ・↶ 1 回で戻せます）");
    }
    warn.push("音色は DAW のシンセ・ドラムです（ほかのソフトと同じ音にはなりません・あとで変えられます）。クオンタイズはしません");
    for (i = 0; i < f.notices.length; i++) { warn.push(f.notices[i]); }
    h += '<div class="small inb-warn">' + warn.map(function (w) { return "・" + escHtml(w); }).join("<br>") + '</div>';
    if (f.skipped.length) { h += '<div class="small inb-warn">入らないもの: ' + escHtml(f.skipped.join("・")) + '</div>'; }
    if (plan.ok) { var n2 = 0; for (i = 0; i < plan.items.length; i++) { n2 += plan.items[i].clips.length; } h += '<div class="small">' + (u.dest === "new" ? '新しい曲の ' : '') + plan.bar + '〜' + (plan.bar + Math.round(plan.span / M.barTicks(u.dest === "new" ? M.midiNewProject(f) : p)) - 1) + ' 小節目に、トラック ' + plan.items.length + ' 本・クリップ ' + n2 + ' 個</div>'; }
    else { h += '<div class="daw-msg">&#x26A0;&#xFE0F; ' + escHtml(plan.why) + '</div>'; }
    if (u.msg) { h += '<div class="da-note">' + u.msg + '</div>'; }
    h += '<div class="da-btns"><button class="modal-btn da-wide inb-go" data-mi="go"' + (plan.ok && (u.tempoOk || midTempoMap(u)) && !u.busy ? '' : ' disabled') + '>' + (u.dest === "new" ? '&#x2705; 新しい曲として取り込む' : '&#x2705; いまの曲に足す') + '</button></div>' +
      '<div class="da-btns"><button class="modal-btn da-wide" data-mi="back">やめる</button></div>';
    return h + '<p class="small dsv-note">「✅」を押すまで、曲は変わりません（いまの曲・保存した曲はそのまま）。</p></div>';
  }
  function renderMidi(root, ctl) {
    if (!st.mid) { st.view = "proj"; renderProj(root, ctl); return; }
    root.innerHTML = midHtml(project());
    if (!root.querySelectorAll) { return; }
    var els = root.querySelectorAll("button"), k;
    function again() { if (st.view === "midi" && st.mid) { renderMidi(root, ctl); } }
    for (k = 0; k < els.length; k++) {
      els[k].onclick = function (ev) {
        var v = ev.currentTarget.getAttribute("data-mi"), u = st.mid;
        if (!v || !u) { return; }
        if (v === "back") { st.mid = null; st.view = "proj"; renderProj(root, ctl); return; }
        if (v === "go") { midiImport(); again(); return; }
        u.msg = "";
        if (v.indexOf("part:") === 0) { var key = v.substring(5); u.parts[key] = !u.parts[key]; again(); return; }
        if (v.indexOf("kind:") === 0) { var k2 = v.substring(5); u.kinds[k2] = u.kinds[k2] === "drum" ? "synth" : "drum"; again(); return; }
        if (v === "tempo") { u.tempoOk = !u.tempoOk; again(); return; }
        if (v === "dest:new" || v === "dest:cur") { u.dest = v.substring(5); again(); return; }
        if (v === "bar-") { u.bar = Math.max(1, u.bar - 1); again(); return; }
        if (v === "bar+") { u.bar = Math.min(256, u.bar + 1); again(); return; }
        if (v === "barv") { var a = window.prompt ? window.prompt("はじまりの小節（1〜256）", String(u.bar)) : null; if (a !== null && a !== undefined && String(a).replace(/\s/g, "") !== "" && isFinite(Number(a))) { u.bar = Math.max(1, Math.min(256, Math.round(Number(a)))); } again(); return; }
      };
    }
  }
  function partSound(pt) { if (!pt) { return presetName("lead"); } if (pt.patch) { var pr = DM().patchPreset ? DM().patchPreset(pt.patch) : ""; return "ゲームと同じ音色「" + (pt.patchName || (pr ? presetName(pr) : "じぶんの音色")) + "」"; } return presetName(pt.preset); } // 9B-7
  function presetName(id) { if (id === "drum") { return "ドラム"; } try { var pr = window.UGSynth && window.UGSynth.preset ? window.UGSynth.preset(id) : null; return pr ? String(pr.name).replace(/&#x?[0-9a-f]+;/gi, "").replace(/^\s+|\s+$/g, "") : id; } catch (e) { return id; } }
  function renderInbox(root, ctl) {
    var p = project();
    root.innerHTML = inbHtml(p);
    st.inbMsg = "";
    if (!root.querySelectorAll) { return; }
    var els = root.querySelectorAll("button"), k;
    function again() { renderInbox(root, ctl); }
    for (k = 0; k < els.length; k++) {
      els[k].onclick = function (ev) {
        var v = ev.currentTarget.getAttribute("data-ib"), M = DM(), r0 = inbRead(), box = r0.box, u = box ? inbUi(box) : null;
        if (ev.currentTarget.getAttribute("data-ar") === "backGame") { goBackGame(); return; } // 9B-2: data-ib の無いボタン
        if (!v) { return; }
        if (v === "back") { inbPrevStop(); st.view = "arr"; render(root, ctl); return; }
        if (v === "trash") {
          if (u && !u.trashAsk) { u.trashAsk = true; again(); return; }
          inbPrevStop(); M.inboxClear(); st.inb = null; st.inbMsg = "受け取り箱を空にしました"; again(); return;
        }
        if (!box) { again(); return; }
        u.trashAsk = false;
        if (v === "go") { inbImport(); if (st.view === "inbox") { again(); } return; }
        if (v === "prev") { inbPreview(box, u); again(); return; }
        if (v === "stop") { inbPrevStop(); u.msg = ""; again(); return; }
        if (v.indexOf("part:") === 0) { var key = v.substring(5); u.parts[key] = !u.parts[key]; u.msg = ""; again(); return; }
        if (v === "dest:cur" || v === "dest:new") { u.dest = v.substring(5); u.msg = ""; again(); return; }
        if (v === "quant") { u.quant = !u.quant; u.msg = ""; again(); return; } // 9B-3
        if (v === "tgt") { var sl0 = inbSel(box, u), tl = inbSynthTracks(project(), sl0.length === 1 && inbPart(box, sl0[0]) && inbPart(box, sl0[0]).preset === "drum"), ids = ["new"], i; for (i = 0; i < tl.length; i++) { ids.push(tl[i].id); } u.target = ids[(ids.indexOf(u.target) + 1) % ids.length]; again(); return; }
        if (v === "bar-") { u.bar = Math.max(1, u.bar - 1); again(); return; }
        if (v === "bar+") { u.bar = Math.min(256, u.bar + 1); again(); return; }
        if (v === "barv") { var a = window.prompt ? window.prompt("はじまりの小節（1〜256）", String(u.bar)) : null; if (a !== null && a !== undefined && String(a).replace(/\s/g, "") !== "" && isFinite(Number(a))) { u.bar = Math.max(1, Math.min(256, Math.round(Number(a)))); } again(); return; }
      };
    }
  }
  // §342 9B-2: 元のゲームへ戻る（switchTo で来たとき・ゲームから取りこんだあと）。DAW をやめるときに保存する（stop hook）
  var BACK_GAMES = { ukulele: "&#x1F3B8; ゴリラウクレレへ戻る", piano: "&#x1F3B9; ゴリラピアノへ戻る", drum: "&#x1F941; ゴリラドラムへ戻る", bass: "&#x1F3B8; ゴリラベースへ戻る", guitar: "&#x1F3B8; ゴリラギターへ戻る", strings: "&#x1F3BB; ゴリラストリングスへ戻る", horn: "&#x1F3BA; ゴリラホーンへ戻る", synth: "&#x1F39B;&#xFE0F; ゴリラシンセへ戻る" }; // 9B-3・9B-5・9B-6・9B-7
  function backGame() { var c = null; try { c = I.cameFrom ? I.cameFrom() : null; } catch (e) { c = null; } var g = st.backGame || c; return g && BACK_GAMES[g] ? g : null; }
  function backHtml() { var g = backGame(); return g ? '<div class="da-btns daw-back"><button class="modal-btn da-wide" data-ar="backGame">' + BACK_GAMES[g] + '</button></div>' : ''; }
  function goBackGame() {
    var g = backGame();
    if (!g) { return false; }
    inbPrevStop(); stopPlay(false); flushSave();
    if (!(I.switchTo && I.switchTo(g))) { st.anote = "メニューへ戻って、ゲームを開いてください"; if (st.root) { rerender(); } return false; }
    return true;
  }
  // アレンジの上の「届いています」（7 日たったものは、ここで消す）
  function inbNoteHtml() {
    var M = DM(), r0;
    if (!M || !M.inboxRead) { return ""; }
    r0 = M.inboxRead();
    if (r0.expired) { M.inboxClear(); return '<div class="da-note">' + M.INBOX_DAYS + ' 日たった受け取り箱のデータを捨てました（ウクレレの曲は残っています）</div>'; }
    return r0.box ? '<div class="da-note daw-inb"><span>&#x1F4E5; ゲームから「' + escHtml(r0.box.name) + '」が届いています</span><button class="modal-btn daw-small" data-ar="inbox">受け取る</button></div>' : '';
  }
  // ---------- 操作 ----------
  function bind(root, ctl) {
    if (!root.querySelectorAll) { return; }
    var p = st.project, M = DM();
    function redraw() { var arr = root.querySelector(".daw-arr"); if (arr) { st.scroll = arr.scrollLeft || 0; } render(root, ctl); }
    var els = root.querySelectorAll("button, [data-clip], [data-track]"), k;
    for (k = 0; k < els.length; k++) {
      els[k].onclick = function (ev) {
        var el = ev.currentTarget, v;
        if (ev.stopPropagation) { ev.stopPropagation(); }
        if (el.getAttribute("data-back")) { ctl.back(); return; }
        if ((v = el.getAttribute("data-rc"))) { keepScroll(root); recUi(v); redraw(); return; } // 9A-12
        if ((v = el.getAttribute("data-act"))) {
          if (rec.state === "rec" || rec.state === "ask") { // 9A-12: 録音中は ⏹ ＝ 録音の停止。▶・ループ・BPM は変えない（伴奏の時計がずれる）
            if (v === "stop") { recStop("btn"); } else { st.msg = "録音中は ▶・ループ・BPM を変えられません（⏹ か「■ 停止して置く」で止めてから）"; }
            redraw(); return;
          }
          if (secAct(v, root, ctl)) { redraw(); return; } // §345 A21: セクションとループ
          if (v === "follow") { st.follow = !tpFollow(); redraw(); return; } // §345 A22
          if (v === "goBar") { var nb0 = window.prompt ? window.prompt("何小節目へ？（1〜" + M.tickToBar(p, Math.max(0, M.playEndTick(p) - 1)).bar + "）", String(M.tickToBar(p, tpNow()).bar)) : null; if (nb0 !== null && nb0 !== undefined && isFinite(Number(nb0)) && String(nb0).replace(/\s/g, "") !== "") { tpGo(M.barToTick(p, Math.max(0, Math.round(Number(nb0)) - 1))); tpReveal(root); } redraw(); return; }
          if (v === "play") { togglePlay(); redraw(); return; } // §345 A20: 再生中は ⏸（位置を覚える）
          if (v === "stop") { st.cue = null; st.paused = false; stopPlay(false); redraw(); return; }
          if (v === "b1" || v === "b4" || v === "f1" || v === "f4") { keepScroll(root); nudgeBars((v.charAt(0) === "b" ? -1 : 1) * Number(v.charAt(1))); tpReveal(root); redraw(); return; }
          if (v === "loop") { setLoop(!(p.practice && p.practice.loopOn)); markDirty(); redraw(); return; }
          if (v === "bpm-" || v === "bpm+") { changeBpm(M.bpmAt(p, 0) + (v === "bpm+" ? 1 : -1)); markDirty(); redraw(); return; }
          if (v === "bpm" && window.prompt) {
            var a = window.prompt("BPM（" + M.BPM_MIN + "〜" + M.BPM_MAX + "）", String(M.bpmAt(p, 0)));
            if (a !== null && isFinite(Number(a)) && String(a).replace(/\s/g, "") !== "") { changeBpm(Number(a)); markDirty(); redraw(); }
          }
          return;
        }
        if ((v = el.getAttribute("data-mute"))) { var tm = M.findTrack(p, v); if (tm) { tm.mute = !tm.mute; st.sel = { kind: "track", id: v }; updateMix(); markDirty(); } redraw(); return; }
        if ((v = el.getAttribute("data-solo"))) { var ts = M.findTrack(p, v); if (ts) { ts.solo = !ts.solo; st.sel = { kind: "track", id: v }; updateMix(); markDirty(); } redraw(); return; }
        if ((v = el.getAttribute("data-clip"))) { var arr0 = root.querySelector(".daw-arr"); if (arr0) { st.scroll = arr0.scrollLeft || 0; } st.anote = ""; if (st.sel && st.sel.kind === "clip" && st.sel.id === v && openEditor(v)) { render(root, ctl); return; } st.sel = { kind: "clip", id: v }; render(root, ctl); return; } // 9A-5: タップで選ぶ・もう一度でピアノロール
        if ((v = el.getAttribute("data-ar")) === "addAudio") { keepScroll(root); addAudio(); return; } // 9A-10
        if ((v = el.getAttribute("data-ar")) === "backGame") { goBackGame(); return; } // 9B-2
        if ((v = el.getAttribute("data-ar")) === "inbox") { keepScroll(root); stopPlay(false); st.view = "inbox"; st.inbMsg = ""; renderInbox(root, ctl); return; } // 9B-2
        if ((v = el.getAttribute("data-ar")) === "xmas") { keepScroll(root); st.confirmDel = null; st.chooseAdd = false; st.view = "xmas"; renderXmas(root, ctl); return; } // §343
        if ((v = el.getAttribute("data-ar")) === "sections") { keepScroll(root); st.view = "sec"; st.secUI = null; st.secMsg = ""; renderSec(root, ctl); return; } // 9B-1
        if ((v = el.getAttribute("data-secjump"))) { keepScroll(root); sections.jump(v); return; } // 9B-1
        if ((v = el.getAttribute("data-chordbar")) !== null && v !== undefined && v !== "" && XM() && XM().chordOpen) { keepScroll(root); if (XM().chordCands) { cedOpen(Number(v)); render(root, ctl); return; } st.confirmDel = null; st.chooseAdd = false; XM().chordOpen(Number(v)); st.view = "xmas"; renderXmas(root, ctl); return; } // §345 A6・A19: その場で編集（くわしい画面はパネルから）
        if ((v = el.getAttribute("data-ced"))) { keepScroll(root); if (cedClick(v, root, ctl)) { return; } } // §345 A19
        if ((v = el.getAttribute("data-rp")) && st.repeat) { // 9B-1: 繰り返しの欄
          var R = st.repeat, fr = M.findClip(p, R.clip);
          keepScroll(root);
          if (!fr || v === "cancel") { st.repeat = null; rerender(); return; }
          if (v === "n-") { R.n = Math.max(1, R.n - 1); } else if (v === "n+") { R.n = Math.min(M.REPEAT_MAX, R.n + 1); }
          else if (v === "b-") { R.bar = Math.max(1, R.bar - 1); } else if (v === "b+") { R.bar = Math.min(256, R.bar + 1); }
          else if (v === "nv" || v === "bv") { var ra = window.prompt ? window.prompt(v === "nv" ? "回数（1〜" + M.REPEAT_MAX + "）" : "コピー先の小節（1〜256）", String(v === "nv" ? R.n : R.bar)) : null; if (ra !== null && ra !== undefined && isFinite(Number(ra)) && String(ra).replace(/\s/g, "") !== "") { if (v === "nv") { R.n = Math.max(1, Math.min(M.REPEAT_MAX, Math.round(Number(ra)))); } else { R.bar = Math.max(1, Math.min(256, Math.round(Number(ra)))); } } }
          else if (v === "go") { ops.repeat(R.clip, R.n, (R.bar - 1) * M.barTicks(p)); return; }
          rerender(); return;
        }
        if ((v = el.getAttribute("data-stg"))) { stageAct(v); return; } // 9B-20
        if ((v = el.getAttribute("data-addwav"))) { keepScroll(root); st.anote = ""; pickWav(root, { track: v }); return; }
        if ((v = el.getAttribute("data-ar"))) { keepScroll(root); if (v === "addTrack") { st.chooseAdd = !st.chooseAdd; st.sel = null; st.confirmDel = null; st.anote = ""; rerender(); } else if (v === "addSynth" || v === "addDrum") { ops.addTrack(v === "addDrum" ? "drum" : "synth"); } else if (v === "addCancel") { st.chooseAdd = false; rerender(); } else if (v === "undo") { ops.undo(); } else if (v === "redo") { ops.redo(); } else if (v === "mixer") { st.confirmDel = null; st.view = "mix"; renderMix(root, ctl); } else if (v === "tempo") { st.confirmDel = null; st.view = "tempo"; renderTempo(root, ctl); } else if (v === "ref") { st.confirmDel = null; st.view = "ref"; renderRef(root, ctl); } return; }
        if ((v = el.getAttribute("data-addclip"))) { keepScroll(root); ops.addClip(v); return; }
        if ((v = el.getAttribute("data-cl")) && st.sel && st.sel.kind === "clip") {
          var cid = st.sel.id, fc = M.findClip(p, cid);
          keepScroll(root);
          if (!fc) { return; }
          if (v === "roll") { st.anote = ""; if (openEditor(cid)) { render(root, ctl); } return; }
          if (v === "relink") { st.anote = ""; pickWav(root, { relink: fc.clip.asset }); return; } // 9A-10
          if (v === "edit") { st.anote = ""; if (openAedit(cid)) { render(root, ctl); } return; } // 9A-13
          if (v === "take") { st.anote = ""; if (recOpenTake(cid)) { rerender(); } return; } // 9A-14
          if (v === "dup") { ops.duplicate(cid); return; }
          if (v === "repeat") { st.anote = ""; st.repeat = { clip: cid, n: 2, bar: Math.round((fc.clip.start + fc.clip.len) / M.barTicks(p)) + 1 }; rerender(); return; } // 9B-1
          if (v === "left" || v === "right") { ops.move(cid, v === "left" ? -1 : 1); return; }
          if (v === "shorter" || v === "longer") { ops.resize(cid, v === "shorter" ? -1 : 1); return; }
          if (v === "name") { var cn = window.prompt ? window.prompt("クリップの名前（40 文字まで）", clipLabel(fc.clip)) : null; if (cn !== null && cn !== undefined) { ops.renameClip(cid, cn); } return; }
          if (v === "del") { ops.remove(cid); }
          return;
        }
        if ((v = el.getAttribute("data-tr")) && st.sel && st.sel.kind === "track") {
          var tid = st.sel.id, ft = M.findTrack(p, tid);
          keepScroll(root);
          if (!ft) { return; }
          if (v === "clip") { ops.addClip(tid); return; }
          if (v === "wav") { st.anote = ""; pickWav(root, { track: tid }); return; } // 9A-10
          if (v === "rec") { recOpen(tid); rerender(); return; } // 9A-12
          if (v === "up" || v === "down") { ops.moveTrack(tid, v === "up" ? -1 : 1); return; }
          if (v === "auto") { openAuto(tid, "arr"); render(root, ctl); return; } // 9B-9
          if (v === "del") { st.confirmDel = tid; st.anote = ""; rerender(); return; }
          if (v === "delNo") { st.confirmDel = null; rerender(); return; }
          if (v === "delYes") { ops.deleteTrack(tid); return; }
          if (v === "name") { var tn = window.prompt ? window.prompt("トラックの名前（40 文字まで）", ft.name) : null; if (tn !== null && tn !== undefined) { ops.renameTrack(tid, tn); } }
          return;
        }
        if ((v = el.getAttribute("data-track"))) { st.sel = { kind: "track", id: v }; st.anote = ""; st.confirmDel = null; redraw(); }
      };
    }
    bindProjBar(root, ctl);
    bindWavFile(root); // 9A-10
    var sels = root.querySelectorAll("select[data-inst]");
    for (k = 0; k < sels.length; k++) {
      sels[k].onclick = function (ev) { if (ev.stopPropagation) { ev.stopPropagation(); } };
      sels[k].onchange = function (ev) {
        var el = ev.currentTarget, t = M.findTrack(p, el.getAttribute("data-inst"));
        if (t && el.value) { t.instrument = /^xm-/.test(el.value) && XM() ? XM().instrument(el.value) : M.synthInstrument(el.value); if (t.ext) { if (/^xm-/.test(el.value)) { t.ext.xm = el.value; } else { delete t.ext.xm; } } // §343: クリスマスの音色も
        st.sel = { kind: "track", id: t.id }; if (pl) { warm(t); } markDirty(); } // 再生中なら、これから予約する音から新しい音色
        redraw();
      };
    }
    var vsel = root.querySelector("select[data-viewmode]"); // 9B-21: 表示（この端末だけ・曲は変えない・再生は止めない）
    if (vsel) { vsel.onclick = function (ev) { if (ev.stopPropagation) { ev.stopPropagation(); } }; vsel.onchange = function () { keepScroll(root); setViewMode(vsel.value); render(root, ctl); }; }
    bindStudio(root, ctl);
  }

  function dawSetup(root, ctl) {
    stopPlay(false);
    st.view = "arr";
    st.roll = null;
    st.sel = null;
    st.anote = "";
    st.steps = null;
    st.chooseAdd = false;
    st.confirmDel = null;
    st.scroll = 0;
    st.msg = "";
    st.root = root;
    st.ctl = ctl;
    render(root, ctl);
  }

  I.register({
    id: "daw",
    after: "synth",
    cat: "music",
    music: true,
    name: "ゴリラDAW",
    icon: "&#x1F39A;&#xFE0F;",
    desc: "トラックとクリップで曲を組み立てる小さな DAW（作りかけ・Phase 9A）。音はゴリラシンセ",
    help: "トラックやクリップをタップで選ぶ / BPM の − ＋ でテンポ / トラックの音色はゴリラシンセのプリセットから",
    controls: [],
    setup: dawSetup,
    setupLabel: "DAW",
    // 設定画面だけで使う（本編は無い）。万一はじまったときは何もしない
    create: function () { return { step: function () {}, update: function () {}, draw: function () {}, input: function () {} }; }
  });

  window.UGDaw = {
    xmas: { host: xmHost, open: function () { if (!st.root) { return false; } st.view = "xmas"; rerender(); return true; } }, // §343
    state: function () { return st; },
    view: { mode: viewMode, set: function (v) { var r = setViewMode(v); if (st.root) { rerender(); } return r; }, layout: layout, zoom: function (d) { if (d && st.root) { keepScroll(st.root); stZoom(st.root, d > 0 ? 1 : -1); } return ZOOMS[vw.zoom]; }, // 9B-21: 表示（この端末だけ）
      state: function () { return { mode: viewMode(), lay: vw.lay, zoom: ZOOMS[vw.zoom], pxb: pxb, narrow: vw.narrow, host: !!(st.root && typeof st.root.className === "string" && / ?dstu-host/.test(st.root.className)) }; }, key: function (ev) { return st.root ? stKey(ev, st.root, st.ctl) : false; }, KEY: VIEW_KEY, MIN_AUTO: STU_MIN_AUTO, MIN_PC: STU_MIN_PC, ZOOMS: ZOOMS },
    diag: { log: function () { return JSON.parse(JSON.stringify(dg)); }, clear: function () { dg.length = 0; return true; } }, // 9B-21: テスト用
    project: project,
    reset: function () { recCancel(""); rec.open = false; rec.msg = ""; rec.result = null; st.aedit = null; recFreeFail(); if (sv.timer) { clearTimeout(sv.timer); sv.timer = null; } stopPlay(false); clearTail(); audForget(); st.undo.length = 0; st.redo.length = 0; st.anote = ""; st.steps = null; st.chooseAdd = false; st.confirmDel = null; st.project = null; st.sel = null; st.scroll = 0; st.msg = ""; st.view = "arr"; st.roll = null; sv.status = "demo"; sv.msg = ""; sv.note = ""; sv.at = 0; },
    // §341 9A-3: ピアノロール（テストからも呼ぶ）
    openRoll: function (id) { var ok = openRoll(id); if (ok && st.root) { rerender(); } return ok; },
    auEdit: auEdit, auState: function () { return { au: st.au, clip: st.auClip || null }; }, // §345 A28
    hum: { act: function (v) { var f = rollClip() || (st.steps ? DM().findClip(project(), st.steps.clip) : null); if (!f) { return false; } if (v !== "hum" && !st.humOpen) { st.humOpen = true; } var r = humAct(v, f); if (st.root) { rerender(); } return r; }, html: function () { var f = rollClip() || (st.steps ? DM().findClip(project(), st.steps.clip) : null); return f ? humHtml(project(), f, "data-roll") : ""; }, state: function () { return { open: !!st.humOpen, ui: st.humUI, opts: pl && pl.opts ? pl.opts.hum : null }; } }, // §345 A27
    redo: function () { return edit.redo(); }, redoN: function () { return st.redo.length; },
    phrase: { copy: function () { var f = rollClip(); return f ? phrCopy(project(), f.clip, f.track) : null; }, paste: function (t, at, mode) { return phrPaste(project(), t, at, st.clip2, mode); }, sel: function (a) { if (a === "all") { var f = rollClip(); st.roll.ms = f ? f.clip.notes.slice() : []; } else if (a && a.length !== undefined) { st.roll.ms = a; } return st.roll ? phrMs(rollClip().clip) : []; }, act: function (v) { var f = rollClip(); if (!f || !st.root) { return false; } var r0 = phrAct(v, f, st.root); if (r0) { rerender(); } return r0; }, clip: function () { return st.clip2; }, fix: fixOverlaps, bars: function (a, b) { var f = rollClip(); return f ? phrSelBars(project(), f.clip, a, b) : 0; } }, // §345 A24
    roll2: { assist: function () { var f = rollClip(); return f ? rollAssist(project(), f) : null; }, kind: function (n) { var f = rollClip(); return f ? noteKind(rollAssist(project(), f), n) : ""; }, act: function (v) { var f = rollClip(); var r0 = f ? stepAct(v, f) : false; if (r0 && st.root) { rerender(); } return r0; }, assistOn: function (v) { if (v !== undefined) { st.rollAssist = !!v; if (st.root) { rerender(); } } return rollAssistOn(); }, state: function () { return st.roll; }, html: function () { var f = rollClip(); return f ? rollHtml(project(), f) : ""; } }, // §345 A23
    closeRoll: function () { closeRoll(); if (st.root) { rerender(); } }, roll: function () { return st.roll; }, edit: edit, resync: resync,
    // §341 9A-4: 保存・読みこみ（テストからも呼ぶ）。reload ＝ ページの読みなおしと同じ（メモリの曲を捨てて、保存から開く）
    saveFile: daSave, outName: outName, SAVE_NOTE: SAVE_NOTE, // §345 A16: 保存の窓口（🎄 のマイテンプレートからも）
    ced: { open: function (b) { cedOpen(b); rerender(); }, click: function (v) { return st.root ? cedClick(v, st.root, st.ctl) : false; }, state: function () { return st.ced; }, html: function () { return cedHtml(project()); } }, // §345 A19
    handoff: { info: function () { return handoffInfo(project()); }, text: function () { return handoffText(project()); }, html: function () { return handoffHtml(project()); }, state: function () { return ho; } }, // §345 A17
    stem: { plan: function () { return stemPlan(project()); }, one: stemOne, all: stemAll, cancel: stemCancel, state: function () { return stm; }, project: stemProject, html: function () { return stemHtml(project()); } }, // §345 A12
    wav: { plan: function () { return wavPlan(project()); }, start: wavExport, cancel: wavCancel, state: function () { return wav; }, render: renderSong, stats: bufStats, RATE: WAV_RATE, MAX: WAV_MAX_MUSIC, TAIL: WAV_TAIL },
    hear: hear, steps: steps, openEditor: function (id) { var ok = openEditor(id); if (ok && st.root) { rerender(); } return ok; }, ops: ops, mixer: mixer, fx: fxApi, lufs: luApi, showLufs: function () { st.view = "lufs"; if (st.root) { renderLufs(st.root, st.ctl); } return true; }, master: msApi, meter: { set: function (on) { if (!!on !== lm.on) { lm.on = !!on; if (lm.on) { lm.state = pl ? "wait" : "idle"; if (pl) { lmAttach(true); } } else { lmClear(); } } return lm.on; }, reset: function () { var r0 = !!lm.node; lm.live = null; lm.full = null; lm.fullAt = -1; lm.upd = 0; lm.late = { n: 0, max: 0 }; if (r0) { lmDetach(""); lmAttach(true); } return true; }, state: function () { return { on: lm.on, state: lm.state, node: !!lm.node, n: lm.live ? lm.live.count() : 0, tp: lm.tp }; }, setTp: function (on) { return lmSetTp(on); }, values: function () { return lmValues(); }, NAME: LM_NAME },
    ref: { // 9B-20: 🎧 リファレンス・長い音声の読みこみ（テスト・確かめ用も）
      state: function () { var p = project(), M = DM(), r = M.refOf(p), s = M.refSpan(p); return { ref: r ? JSON.parse(JSON.stringify(r)) : null, span: s ? { start: s.start, end: s.end, dur: s.dur, kind: s.asset.kind || "wav", long: !!s.asset.long } : null, ab: st.refAB || "both", loaded: !!(s && aud.buf[s.asset.id]), stage: stageInfo(), playEnd: M.playEndTick(p), songEnd: M.songEndTick(p), node: !!(pl && pl.mix.__ref), srcs: pl && pl.mix.__ref ? pl.mix.__ref.srcs.length : 0, gain: refGainVal(p), daw: abDaw() }; },
      importAb: function (ab, name, tgt, cb) { longImport(ab, ab.slice(0), name, tgt || { ref: true }, cb); },
      importBlob: function (blob, name, tgt, cb) { dataAB(blob, function (ab, w) { if (!ab) { cb({ ok: false, why: w }); return; } longImport(ab, blob, name, tgt || { ref: true }, cb); }); },
      fileGo: function (blob, name, tgt) { dataAB(blob, function (ab, w) { if (!ab) { return; } audFileGo(ab, blob, name, tgt || { ref: true }); }); return true; }, // 画面のファイル選びと同じ振り分け（結果は state・メッセージで見る）
      commit: function (where, cb) { stageCommit(where, function (r) { if (r.ok && pl) { resync(); } if (cb) { cb(r); } }); },
      cancel: function () { stageCancel(); return true; },
      set: function (k, v) { var r = DM().refSet(project(), k, v); if (r.ok) { markDirty(); if (k === "offset" && pl) { resync(); } else { refApply(); } } return r; },
      ab: function (v) { return refSetAB(v); },
      clear: function () { var ok0 = DM().clearRef(project()); if (ok0) { markDirty(); if (pl) { resync(); } } return ok0; },
      jump: function (sec) { var p = project(); return refJump(Math.round(DM().secToTick(p, Math.max(0, Number(sec) || 0)))); },
      show: function () { st.view = "ref"; if (st.root) { renderRef(st.root, st.ctl); } return true; }
    }, sendFx: sfApi, tempo: tpApi, showTempo: function () { st.view = "tempo"; if (st.root) { renderTempo(st.root, st.ctl); } return true; }, showSendFx: function () { st.view = "sendfx"; if (st.root) { renderSendFx(st.root, st.ctl); } return true; }, showMaster: function () { st.view = "master"; if (st.root) { renderMaster(st.root, st.ctl); } return true; }, auto: auApi, showAuto: function (id, target) { if (!DM().findTrack(project(), id)) { return false; } openAuto(id, "arr"); if (target && DM().AUTO_TARGETS[target]) { st.au.target = target; } if (st.root) { renderAuto(st.root, st.ctl); } return true; }, showFx: function (id) { if (!DM().findTrack(project(), id)) { return false; } st.view = "fx"; st.fxTrack = id; if (st.root) { renderFx(st.root, st.ctl); } return true; }, panText: panText, showMixer: function () { if (st.root) { st.view = "mix"; renderMix(st.root, st.ctl); } }, askDelete: function (id) { st.confirmDel = id; if (st.root) { rerender(); } }, undoDepth: function () { return st.undo.length; }, select: function (kind, id) { st.sel = kind ? { kind: kind, id: id } : null; st.anote = ""; if (st.root) { rerender(); } },
    proj: proj, saveNow: saveNow, markDirty: markDirty, flushSave: flushSave, saveState: function () { return sv; }, readIndex: readIndex, loadProject: loadProject,
    showProj: function () { if (st.root) { st.view = "proj"; renderProj(st.root, st.ctl); } },
    // §341 9A-11: プロジェクトパック（ZIP）
    pack: { exportZip: packExport, importZip: packImport, start: packStart, load: packLoad, state: function () { return pk; }, plan: function () { return packPlan(project()); }, file: packFile, FORMAT: PACK_FORMAT, VERSION: PACK_VERSION, MAX_ZIP: PACK_MAX_ZIP },
    // §341 9A-12: マイク録音（テストからも呼ぶ）
    aedit: { open: function (id) { var ok = openAedit(id); if (ok && st.root) { rerender(); } return ok; }, set: aedit.set, step: aedit.step, reset: aedit.reset, play: aeditPlay, svg: aeditSvg, env: audEnv }, // 9A-13
    transportStop: transportStop,
    sections: { list: sections.list, add: sections.add, update: sections.update, remove: sections.remove, copy: sections.copy, jump: sections.jump, html: function () { return secHtml(project()); }, draft: secDraft, open: function () { st.view = "sec"; st.secUI = null; if (st.root) { rerender(); } }, cue: function () { return st.cue; }, setUI: function (u) { st.secUI = u; if (st.root) { rerender(); } }, ui: function () { return st.secUI; } }, // 9B-1
    jumpTo: jumpTo, repeatUI: function () { return st.repeat; },
    backGame: backGame, goBackGame: goBackGame, // 9B-2
    stepRows: stepRows, // 9B-3
    midi: { exportNow: midiExportNow, state: function () { return mx; }, html: function () { return midiHtml(project()); }, open: function (u8, name) { var r = midiOpen(u8, name); if (st.root) { rerender(); } return r; }, ui: function () { return st.mid; }, plan: function () { return st.mid ? midPlan(st.mid) : null; }, importNow: midiImport, pageHtml: function () { return st.mid ? midHtml(project()) : ""; } }, // 9B-4
    inbox: { read: inbRead, ui: function () { var b = inbRead().box; return b ? inbUi(b) : null; }, plan: function () { var b = inbRead().box; return b ? inbPlan(b, inbUi(b)) : null; }, html: function () { return inbHtml(project()); }, open: function () { st.view = "inbox"; if (st.root) { rerender(); } }, importNow: inbImport, preview: function () { var b = inbRead().box; return b ? inbPreview(b, inbUi(b)) : false; }, stopPreview: inbPrevStop, note: inbNoteHtml }, // 9B-2
    lib: { lockInit: lockShared, lockState: function () { return lk.state; }, lockDrop: function () { lk.gen++; if (lk.rel) { var r = lk.rel; lk.rel = null; r(); } lk.state = "off"; }, addWhy: assetAddWhy, LOCK: LOCK_NAME, open: function () { libOpen(); if (st.root) { rerender(); } }, load: libLoad, scan: libScan, refs: libRefs, del: libDelete, hear: libHear, busyWhy: libBusyWhy, otherTabs: otherTabs, chanInit: libChanInit, state: function () { return lib; }, html: libHtml, songAssets: songAssets, PING_MS: LIB_PING_MS }, // 9A-15
    comp: { open: function (id) { var ok = openComp(id); if (ok && st.root) { rerender(); } return ok; }, cur: comp.cur, take: comp.take, sel: comp.sel, nudge: comp.nudge, setAt: comp.setAt, add: comp.add, del: comp.del, apply: comp.apply, cancel: comp.cancel, off: comp.off, undo: comp.undo, changed: comp.changed, play: compPlay, html: function () { var f = comp.clip(); return f ? compHtml(project(), f) : ""; }, svg: compWaveSvg, obj: compObj }, // 9A-16／9A-17
    takes: { select: function (cid, id) { return takes.select(cid, id); }, remove: function (cid, id) { return takes.remove(cid, id); }, hear: takeHear, stop: takeHearStop, info: function () { return hearInfo; }, html: function (cid) { var f = DM().findClip(project(), cid); return f ? takesHtml(project(), f.clip) : ""; }, openRec: function (cid) { var ok = recOpenTake(cid); if (ok && st.root) { rerender(); } return ok; } }, // 9A-14
    rec: { room: function (sr) { return recRoom(project(), sr); }, open: recOpen, // 9B-20: room ＝ 録れる秒（テスト用）
       start: recStart, stop: recStop, cancel: recCancel, ui: recUi, state: function () { return rec; }, wav: recWav, chunk: recChunk, manual: recManual, setManual: recSetManual, room: function () { return recRoom(project(), rec.sr || 48000); }, why: function () { var p = project(); return recWhy(p, DM().findTrack(p, rec.track)); }, html: function () { return recHtml(project()); }, KEY: REC_KEY, MAX_SEC: REC_MAX_SEC, WORKLET: REC_WORKLET },
    // §341 9A-10: オーディオトラック（テストからも呼ぶ）
    audio: { importWav: importWav, ensure: ensureAssets, state: function () { return aud; }, add: addAudio, pick: pickWav, waveSvg: waveSvg, used: usedAssets, missing: audMissing, assetState: assetState, IDB_NAME: IDB_NAME, forget: audForget },
    reload: function () { recCancel(""); rec.open = false; rec.msg = ""; recFreeFail(); if (sv.timer) { clearTimeout(sv.timer); sv.timer = null; } stopPlay(false); clearTail(); audForget(); st.undo.length = 0; st.redo.length = 0; st.anote = ""; st.steps = null; st.chooseAdd = false; st.confirmDel = null; st.project = null; st.view = "arr"; st.roll = null; st.sel = null; st.cue = null; st.secUI = null; st.repeat = null; st.secMsg = ""; sv.status = "demo"; sv.msg = ""; sv.note = ""; sv.at = 0; return project(); },
    ROLL: { RB: RB, RH: RH, LO: LO, HI: HI, KEYW: KEYW },
    presetList: presetList,
    PX_BEAT: PX_BEAT, LOOK: LOOK,
    // §341 9A-2: 再生（テストからも呼ぶ）
    play: startPlay, stop: function () { stopPlay(false); }, pump: pump, follow: function (v) { if (v !== undefined) { st.follow = !!v; } return tpFollow(); } /* §345 A22 */, sections2: { step: secStep, loopSet: loopSet, loopSecs: loopSecs, loopBars: loopBars, act: function (v) { var r = st.root ? secAct(v, st.root, st.ctl) : false; if (r) { rerender(); } return r; }, now: function () { var s0 = secNow(project()); return s0.i >= 0 ? s0.list[s0.i] : null; }, bar: function () { return secBarHtml(project()); }, sheet: function () { return secSheetHtml(project()); } } /* §345 A21 */, transport: { pause: pausePlay, resume: resumePlay, toggle: togglePlay, nudge: nudgeBars, go: tpGo, tapX: tpTapX, now: tpNow, pos: posText, paused: function () { return !!st.paused; }, buttons: tpButtons } /* §345 A20 */, setLoop: setLoop, setBpm: changeBpm, updateMix: updateMix,
    isPlaying: function () { return !!pl; }, player: function () { return pl; }, playTick: playTick, log: function () { return plLog; }, clearLog: function () { plLog = []; },
    tailPending: function () { return !!tailTimer; }
  };
})();
