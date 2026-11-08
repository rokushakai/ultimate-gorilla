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
  // セッションのあいだのプロジェクト（9A-4 で ultimateGorillaDawV1 に保存する）
  var st = { project: null, sel: null, scroll: 0, undo: [], anote: "" }; // undo: §341 9A-5 ↶ の列（ピアノロールとアレンジで共通・トラック全部の写し）

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

  function tickX(tick) { return Math.round(tick / DM().PPQ * PX_BEAT); }

  // ---------- 再生（§341 9A-2）----------
  // 時計は AudioContext（UGMelody.audio.ctx の 1 つだけ）。25ms ごとに LOOK 秒先までの音を AudioContext の時刻で予約する（いまのシーケンサーと同じ）
  // 区間 seg = { t0（AudioContext の秒）, tick0 }: 曲の tick → 時刻 = t0 ＋ 秒(tick) − 秒(tick0)。ループで頭に戻る・BPM を変えたら区間を足す
  var LOOK = 0.12, PUMP_MS = 25, START_LEAD = 0.08, TAIL_MS = 4000;
  var pl = null, plLog = []; // pl: 再生中の状態。plLog: 予約した音の記録（テスト・確かめ用・最新 400 個）
  function SE() { var e = window.UGSynthEngine; return e && e.API === 1 ? e : null; }
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
      var g = ac.createGain(), pn = null;
      if (ac.createStereoPanner) { try { pn = ac.createStereoPanner(); pn.pan.value = t.pan; g.connect(pn); pn.connect(dest); } catch (e) { pn = null; } }
      if (!pn) { g.connect(dest); }
      return { g: g, pn: pn };
    }
    var mm = masterOf(); // §341 9A-6: トラック → DAW のマスター → 共有のバス・マスター（RPG やほかのゲームの音量は変えない）
    mx = { main: chain(mm.bus), dry: mm.dry ? chain(mm.dry) : null, syn: null, voices: [], srcs: [], ac: ac };
    mx.syn = Y && Y.track && !(t.instrument && t.instrument.type === "drum") && !DM().isAudio(t) ? Y.track(ac, { bus: mx.main.g, dry: mx.dry ? mx.dry.g : null }) : null; // エンジンが無ければ null（UGSynth.note で鳴らす）。9A-10: オーディオは使わない
    pl.mix[t.id] = mx;
    setGain(t, mx, true);
    return mx;
  }
  // §341 9A-6: DAW のマスター（ゲイン 2 つ: 共有のバスへ・共有の残響を通さない出口へ）。ゲイン ＝ master.vol ÷ 100
  function masterVol() { var p = st.project, v = p && p.master ? Number(p.master.vol) : 80; return (isFinite(v) ? Math.max(0, Math.min(100, v)) : 80) / 100; }
  function masterOf() {
    var m = pl.mix.__master;
    if (m) { return m; }
    var ac = pl.ac, UG = window.UGMelody;
    var bus = UG && UG.audio && UG.audio.ctx === ac && UG.audio.bus ? UG.audio.bus : ac.destination;
    var master = UG && UG.audio && UG.audio.ctx === ac && UG.audio.master ? UG.audio.master : null;
    m = { bus: ac.createGain(), dry: master ? ac.createGain() : null };
    m.bus.gain.value = masterVol(); m.bus.connect(bus);
    if (m.dry) { m.dry.gain.value = masterVol(); m.dry.connect(master); }
    pl.mix.__master = m;
    return m;
  }
  function rampTo(param, v, now) { try { if (now) { param.value = v; } else { param.setTargetAtTime(v, pl.ac.currentTime, 0.01); } } catch (e) { param.value = v; } }
  function setMasterGain() { if (!pl || !pl.mix.__master) { return; } var m = pl.mix.__master, v = masterVol(); rampTo(m.bus.gain, v, false); if (m.dry) { rampTo(m.dry.gain, v, false); } }
  function setGain(t, mx, now) {
    var on = DM().audible(st.project, t), v = on ? t.vol / 100 : 0, ac = pl.ac, list = [mx.main, mx.dry], i;
    for (i = 0; i < list.length; i++) {
      if (!list[i]) { continue; }
      rampTo(list[i].g.gain, v, now);
      if (list[i].pn) { rampTo(list[i].pn.pan, Math.max(-1, Math.min(1, Number(t.pan) || 0)), now); } // 9A-6: パンもなめらかに
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
    var M = DM(), evs = M.noteEvents(p, from, to), i, Y = window.UGSynth;
    // §341 9A-10: 音声のクリップ（区間の頭なら、かかっているクリップを途中から）
    var fresh = !!seg.fresh && !seg.freshDone && from === seg.tick0, aev = M.audioEvents(p, from, to, fresh);
    if (fresh) { seg.freshDone = true; }
    for (i = 0; i < aev.length; i++) { playAudio(p, aev[i], seg); }
    for (i = 0; i < evs.length; i++) {
      var ev = evs[i], t = M.findTrack(p, ev.track);
      if (pl.clip) { if (ev.clip !== pl.clip || !t) { continue; } } // 9A-3: クリップだけ鳴らす（直している音を聞けるように M／S は見ない）
      else if (!t || !M.audible(p, t)) { continue; }
      if (t.instrument && t.instrument.type === "drum") {
        // §341 9A-7: ドラム ＝ いまある UGMelody.drum（GM の番号）を、トラックの出口（音量 → 左右）→ DAW のマスターへ
        // 9A-8: スイング（8 分の裏の 16 分だけ・tick で遅らせる・ループの終わりはこえない）
        var dly = M.swingDelay(ev.rel, M.swingOf(t));
        if (ev.tick + dly >= pl.segEnd) { dly = 0; }
        var mxd = mixFor(t), whd = segTime(p, seg, ev.tick + dly), UGd = window.UGMelody, okd = false, dest = mxd.main.g, choked = null;
        // 9A-8: ハイハットの開閉（同じトラックの中だけ）: 開いたハイハットは 1 打ごとのゲインを通す → 閉じたハイハット・次の開いたハイハットでそのゲインを 0 へ
        if ((ev.m === 42 || ev.m === 44 || ev.m === 46) && mxd.openHat && mxd.openHat.t < whd) {
          try { var og = mxd.openHat.g.gain; og.setValueAtTime(1, whd); og.setTargetAtTime(0, whd, 0.015); choked = mxd.openHat.tick; } catch (eo) {}
          mxd.openHat = null;
        }
        if (ev.m === 46) {
          try { var cg = pl.ac.createGain(); cg.gain.value = 1; cg.connect(mxd.main.g); dest = cg; mxd.openHat = { g: cg, t: whd, tick: ev.tick }; } catch (ec) { dest = mxd.main.g; }
        }
        try { if (UGd && UGd.drum) { UGd.drum(pl.ac, ev.m, whd, ev.v, dest); okd = true; } } catch (ed) { okd = false; }
        plLog.push({ track: t.id, tick: ev.tick, m: ev.m, v: ev.v, when: whd, sec: 0, hash: "drum", pass: pl.pass, ok: okd, drum: true, swing: dly, choked: choked });
        if (plLog.length > 400 && !pl.wav) { plLog.shift(); }
        continue;
      }
      var patch = t.instrument && t.instrument.type === "synth" && t.instrument.patch ? t.instrument.patch.patch : null;
      if (!patch) { continue; }
      var mx = mixFor(t), when = segTime(p, seg, ev.tick), end = ev.end;
      if (pl.loop && end > pl.segEnd) { end = pl.segEnd; } // ループの終わりで切る（次の回の頭と重ねない）
      var sec = ev.d > 0 ? Math.max(0.05, segTime(p, seg, end) - when) : zeroSec(patch), v = null;
      try {
        if (mx.syn) { v = mx.syn.note(patch, ev.m, when, ev.v, sec); }
        else if (Y && Y.note) { v = Y.note(patch, ev.m, mx.main.g, when, ev.v, sec); if (v) { mx.voices.push(v); if (mx.voices.length > 64) { mx.voices = mx.voices.filter(function (x) { return !(x.end < pl.ac.currentTime); }); } } }
      } catch (e) { v = null; }
      plLog.push({ track: t.id, tick: ev.tick, m: ev.m, v: ev.v, when: when, sec: sec, hash: t.instrument.patch.hash, pass: pl.pass, ok: !!v });
      if (plLog.length > 400 && !pl.wav) { plLog.shift(); }
    }
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
      if (!mix.hasOwnProperty(id) || id === "__master") { continue; }
      var mx = mix[id];
      if (mx.syn) { try { mx.syn.dispose(); } catch (e) {} mx.syn = null; }
      for (i = 0; i < mx.voices.length; i++) { try { if (mx.voices[i].kill) { mx.voices[i].kill(0.05); } } catch (e2) {} }
      mx.voices = [];
      // 9A-10: 音声（これから鳴る予約もふくめて止める）
      for (i = 0; mx.srcs && i < mx.srcs.length; i++) { try { var sct = mx.ac ? mx.ac.currentTime : 0, sg = mx.srcs[i].g.gain; sg.cancelScheduledValues(sct); sg.setTargetAtTime(0, sct, 0.01); mx.srcs[i].src.stop(sct + 0.06); } catch (e6) {} }
      mx.srcs = [];
      (function (m) { var l0 = [m.main, m.dry], k0; for (k0 = 0; k0 < l0.length; k0++) { if (l0[k0]) { try { l0[k0].g.gain.setTargetAtTime(0, l0[k0].g.context ? l0[k0].g.context.currentTime : 0, 0.01); } catch (e5) {} } } })(mx); // 9A-7: 先に予約したドラムの音も残らないように、外す前に 0 へ
      (function (m) { setTimeout(function () { var l = [m.main, m.dry], k; for (k = 0; k < l.length; k++) { if (l[k]) { try { l[k].g.disconnect(); if (l[k].pn) { l[k].pn.disconnect(); } } catch (e3) {} } } }, 150); })(mx);
    }
    var ms = mix.__master;
    if (ms) { setTimeout(function () { try { ms.bus.disconnect(); if (ms.dry) { ms.dry.disconnect(); } } catch (e4) {} }, 150); } // 9A-6: DAW のマスターも外す
  }
  var tailTimer = null, tailMix = null;
  function clearTail() { if (tailTimer) { clearTimeout(tailTimer); tailTimer = null; } if (tailMix) { var m = tailMix; tailMix = null; disposeMix(m); } }
  function stopTimers() {
    if (pl && pl.timer) { clearInterval(pl.timer); pl.timer = null; }
    if (pl && pl.raf) { var caf = window.cancelAnimationFrame; if (caf) { try { caf(pl.raf); } catch (e) {} } pl.raf = null; }
  }
  // ⏹: すぐ止める（鳴っている音も 50ms で消す）・プレイヘッドは頭へ
  function stopPlay(keepPos) {
    clearTail();
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
    tailTimer = setTimeout(function () { tailTimer = null; if (tailMix) { var m = tailMix; tailMix = null; disposeMix(m); } }, TAIL_MS);
    if (st.root && st.ctl) { rerender(); }
  }
  // ▶: ユーザーの操作の中で AudioContext を作る／再開する（自動再生の制限）
  // opts（省略可）: { from, a, b, loop, clip } … 9A-3 のクリップだけの再生・直したあとの鳴らしなおし
  function startPlay(opts) {
    var p = project(), M = DM(), UG = window.UGMelody, ac = null, i;
    opts = opts || {};
    if (rec.state === "rec" && !opts.rec) { st.msg = "録音中は ▶ を使えません（録音の「■ 停止して置く」で止めてから）"; return false; } // 9A-12: 伴奏の時計を変えない
    stopPlay(true);
    st.msg = "";
    try { ac = UG && UG.audioInit ? UG.audioInit() : null; } catch (e) { ac = null; }
    if (!ac || !p || !M) {
      st.msg = "音を出す準備ができませんでした。このブラウザでは Web Audio が使えないか、音のファイルを読みこめていません。ページを読みなおして、もう一度 ▶ を押してください。";
      return false;
    }
    if (!window.UGSynth) { st.msg = "ゴリラシンセ（arcade-synth.js）を読みこめなかったため、鳴らせません。"; return false; }
    var lr = M.loopRange(p), clip = opts.clip || null, loop = opts.loop !== undefined ? !!opts.loop : !!(p.practice && p.practice.loopOn);
    var a = opts.a !== undefined ? opts.a : lr.a, b = opts.b !== undefined ? opts.b : (loop ? lr.b : M.songEndTick(p));
    var from = opts.from !== undefined ? opts.from : (loop || clip ? a : 0);
    if (from >= b || from < 0) { from = loop ? a : 0; }
    from = Math.round(from);
    // §341 9A-10: 音声の素材をまだ読みこんでいるなら、読みこめてから鳴らしはじめる（⏹ を押したらやめる）
    if (!opts.noWait && audNeedLoad(p)) {
      var tok = aud.playTok = {}, o2 = {}, k2;
      for (k2 in opts) { if (opts.hasOwnProperty(k2)) { o2[k2] = opts[k2]; } }
      o2.noWait = true;
      st.msg = "音声の素材を読みこんでいます…（読みこめたら鳴りはじめます）";
      ensureAssets(p, function () { if (aud.playTok === tok && st.project === p) { aud.playTok = null; startPlay(o2); rerender(); } });
      return true;
    }
    var E = SE(); if (E && E.setTempo) { try { E.setTempo(M.bpmAt(p, from)); } catch (e2) {} }
    pl = { ac: ac, mix: {}, segs: [{ t0: ac.currentTime + START_LEAD, tick0: from, fresh: true }], cur: from, loop: loop, la: a, segEnd: b, endAt: 0, pass: 0, timer: null, raf: null, clip: clip,
      opts: { a: a, b: b, loop: loop, clip: clip, fixedB: opts.b !== undefined } };
    for (i = 0; i < p.tracks.length; i++) { mixFor(p.tracks[i]); warm(p.tracks[i]); }
    // §341 9A-7: ドラムのトラックがあれば生ドラムのサンプルを読みはじめる（終わるまでは作る音）
    for (i = 0; i < p.tracks.length; i++) { if (DM().isDrum(p.tracks[i])) { try { if (UG.loadSamples && UG.DRUM !== undefined) { UG.loadSamples([UG.DRUM]); } } catch (e5) {} break; } }
    pump();
    pl.timer = setInterval(pump, PUMP_MS);
    loopHead();
    var miss = audMissing(p, clip);
    if (miss) { st.msg = "素材がない音声のクリップ " + miss + " 個は鳴りません（クリップを選んで「🔗 素材を選びなおす」）"; }
    return true;
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
      pl.segEnd = on ? lr.b : M.songEndTick(p);
      pl.opts.loop = !!on; pl.opts.a = lr.a; pl.opts.b = pl.segEnd;
      pl.endAt = 0;
      if (pl.cur > pl.segEnd) { pl.cur = pl.segEnd; }
      if (usedAssets(p).length) { resync(); } // 9A-10: 音声はループの終わりで切ってあるので、鳴らしなおす
    }
  }
  // BPM: 再生中なら、まだ予約していない音から新しい速さ（すでに予約した音の時刻はそのまま）
  function changeBpm(v) {
    var p = project(), M = DM(), t0 = null, E = SE();
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
    if (!o.fixedB && !o.loop) { o.b = M.songEndTick(p); }
    if (t < o.a || t >= o.b) { t = o.loop ? o.a : t; }
    return startPlay({ from: t, a: o.a, b: o.b, loop: o.loop, clip: o.clip });
  }
  // ---------- プレイヘッド（画面だけ。音の時計から位置を計算）----------
  function drawHead() {
    var root = st.root;
    if (!root || !root.querySelector) { return; }
    var el = root.querySelector(".daw-playhead"), pos = root.querySelector(".daw-pos"), tick = playTick(), x = tickX(tick);
    if (el) { el.style.left = (HEAD_W + x) + "px"; }
    if (pos) { var b = DM().tickToBar(st.project, tick); pos.textContent = b.bar + "." + b.beat; }
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
  I.addStopHook(function () { if (rec.state !== "idle") { st.root = null; recStop("exit"); } rec.open = false; flushSave(); if (typeof wavCancel === "function") { wavCancel(); wavFree(); wav.state = "idle"; } stopPlay(false); clearTail(); audFree(null); aud.pending = null; packFree(); pk.state = "idle"; pk.istate = "idle"; pk.restored = null; st.root = null; st.ctl = null; }); // 9A-4: 待っている保存も書く。9A-10: デコードした音声を捨てる（素材は IndexedDB に残る）

  // ---------- 描く ----------
  function clipHtml(p, t, c) {
    var x = tickX(c.start), w = Math.max(6, tickX(c.start + c.len) - x), sel = st.sel && st.sel.kind === "clip" && st.sel.id === c.id;
    if (c.type === "audio") { // §341 9A-10: 波形（素材が無いときは「素材がありません」）
      var as = assetState(c.asset), bad = !!as && as !== "ready" && as !== "loading", wv = aud.peaks[c.asset] ? waveSvg(p, c, w) : "";
      return '<div class="daw-clip daw-aclip' + (sel ? " daw-sel" : "") + (bad ? " da-missing" : "") + '" data-clip="' + c.id + '" style="left:' + x + 'px;width:' + w + 'px;">' + wv +
        '<span class="daw-clip-name">' + escHtml((c.ext && c.ext.name) || "音声") + '</span>' +
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
    var M = DM(), p = project();
    if (M && p && st.view === "roll") { renderRoll(root, ctl); return; }
    if (M && p && st.view === "proj") { renderProj(root, ctl); return; }
    if (M && p && st.view === "mix") { renderMix(root, ctl); return; }
    if (M && p && st.view === "steps") { renderSteps(root, ctl); return; }
    if (!M || !p) {
      root.innerHTML = '<div class="melody-setup"><p>DAW のファイル（arcade-daw-model.js）を読みこめませんでした。</p><button class="modal-btn" data-back="1">メニューへ</button></div>';
      bind(root, ctl);
      return;
    }
    var bars = M.viewBars(p), W = tickX(M.barToTick(p, bars)), m0 = M.meterAt(p, 0), barPx = tickX(M.ticksPerBar(m0)), beatPx = tickX(M.PPQ * 4 / m0.den);
    var grid = 'background-size:' + barPx + 'px 100%,' + beatPx + 'px 100%;width:' + W + 'px;';
    var plist = presetList(), i, j, b, loopOn = !!(p.practice && p.practice.loopOn), lr = M.loopRange(p);
    var h = '<div class="daw">' +
      '<div class="daw-top"><b>&#x1F39A;&#xFE0F; ゴリラDAW</b><span class="daw-pname"></span>' +
      '<button class="modal-btn daw-small" data-back="1">&#x1F579;&#xFE0F; メニューへ</button></div>' +
      projBarHtml(p) +
      '<div class="daw-transport">' +
        '<button class="modal-btn daw-tbtn' + (pl ? " daw-on" : "") + '" data-act="play" title="再生">&#x25B6;&#xFE0F;</button>' +
        '<button class="modal-btn daw-tbtn" data-act="stop" title="停止（頭へ）">&#x23F9;&#xFE0F;</button>' +
        '<button class="modal-btn daw-tbtn' + (loopOn ? " daw-on" : "") + '" data-act="loop" title="ループ（' + (loopOn ? "ON" : "OFF") + '）">&#x1F501;</button>' +
        '<span class="daw-pos" title="小節.拍">1.1</span>' +
        '<span class="daw-bpm"><button class="modal-btn daw-tbtn" data-act="bpm-">&#x2212;</button>' +
        '<button class="daw-bpm-val" data-act="bpm">BPM <b>' + M.bpmAt(p, 0) + '</b></button>' +
        '<button class="modal-btn daw-tbtn" data-act="bpm+">&#xFF0B;</button></span>' +
        '<span class="daw-meter">' + m0.num + '/' + m0.den + '</span>' +
      '</div>' +
      '<div class="da-tools"><button class="modal-btn daw-small" data-ar="addTrack">&#xFF0B; トラック</button>' +
        '<button class="modal-btn daw-small" data-ar="undo"' + (st.undo.length ? '' : ' disabled') + '>&#x21B6; 戻す<small>' + (st.undo.length || '') + '</small></button>' +
        '<button class="modal-btn daw-small" data-ar="mixer">&#x1F39A;&#xFE0F; ミキサー</button>' +
        '<span class="small da-hint">クリップをタップ ＝ 選ぶ ／ もう一度 ＝ 音符</span></div>' +
      '<div class="daw-arr" style="--daw-head:' + HEAD_W + 'px;">';
    // 目盛り（小節の番号・拍の線）
    h += '<div class="daw-row daw-ruler-row"><div class="daw-corner">トラック</div><div class="daw-ruler daw-grid" style="' + grid + 'height:' + RULER_H + 'px;">';
    if (loopOn) { h += '<i class="daw-loopband" style="left:' + tickX(lr.a) + 'px;width:' + (tickX(lr.b) - tickX(lr.a)) + 'px;"></i>'; }
    for (b = 0; b < bars; b++) { h += '<span class="daw-barno" style="left:' + tickX(M.barToTick(p, b)) + 'px;">' + (b + 1) + '</span>'; }
    h += '</div></div>';
    // トラック
    for (i = 0; i < p.tracks.length; i++) {
      var t = p.tracks[i], tsel = st.sel && st.sel.kind === "track" && st.sel.id === t.id;
      var opts = "", cur = t.instrument && t.instrument.ext ? t.instrument.ext.preset : "", found = false;
      for (j = 0; j < plist.length; j++) { if (plist[j][0] === cur) { found = true; } opts += '<option value="' + plist[j][0] + '"' + (plist[j][0] === cur ? " selected" : "") + '>' + plist[j][1] + '</option>'; }
      if (!found) { opts = '<option value="" selected>じぶんの音色</option>' + opts; }
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
    h += '<div class="daw-playhead" style="left:' + (HEAD_W + tickX(playTick())) + 'px;"></div></div>';
    h += (st.msg ? '<div class="daw-msg">&#x26A0;&#xFE0F; ' + escHtml(st.msg) + '</div>' : '') +
      '<div class="da-area">' + panelHtml(p) + '</div>' + // 9A-5: 選んでも高さが変わらない（画面がずれてタップが別のクリップに当たらないように）
      saveNoteHtml() +
      '<p class="small daw-note">クリップをタップ ＝ 選ぶ（下に操作）／ もう一度タップ ＝ ピアノロールで音符を直す。</p>' +
      '<input type="file" class="da-wavfile" accept=".wav,audio/wav,audio/x-wav,audio/wave,audio/vnd.wave" style="display:none;"></div>';
    audKick(p); // 9A-10: 音声の素材を読みはじめる（終わったら描きなおす）
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
    bind(root, ctl);
    drawHead();
  }

  // §341 9A-5: 選んだクリップ・トラックの操作の欄（小さい画面でも押しやすいボタン）
  function panelHtml(p) {
    var M = DM(), s = st.sel, h = st.anote ? '<div class="da-note">' + st.anote + '</div>' : '';
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
      if (f && f.clip.type === "audio") { // §341 9A-10: 音声のクリップ
        var ac0 = f.clip, aa0 = M.findAsset(p, ac0.asset), ab0 = M.tickToBar(p, ac0.start), abars = Math.round(ac0.len / M.barTicks(p) * 100) / 100, astate = assetState(ac0.asset);
        var csec = M.tickToSec(p, ac0.start + ac0.len) - M.tickToSec(p, ac0.start), asec = aa0 ? aa0.sec - (ac0.srcOffset || 0) : 0;
        return h + '<div class="daw-info da-panel"><div>&#x1F3B5; <b>' + escHtml(clipLabel(ac0)) + '</b>（' + escHtml(f.track.name) + '）: ' + ab0.bar + '小節目から ' + abars + '小節（' + (Math.round(csec * 10) / 10) + ' 秒）・音声 ' + (aa0 ? (Math.round(aa0.sec * 10) / 10) + ' 秒' : '？') +
          (aa0 && asec > csec + 0.01 ? '<br><span class="small">&#x2702;&#xFE0F; クリップが短いので、後ろの ' + (Math.round((asec - csec) * 10) / 10) + ' 秒は鳴りません</span>' : '') +
          '<br><span class="small">' + assetStateText(ac0.asset) + '</span></div>' +
          '<div class="da-btns">' + (astate === "ready" || astate === "loading" || !astate ? '' : b("cl", "relink", "&#x1F517; 素材を選びなおす（同じ WAV）", "da-wide")) +
          b("cl", "dup", "&#x29C9; 複製") + b("cl", "left", "&#x25C0; 1小節") + b("cl", "right", "1小節 &#x25B6;") + b("cl", "shorter", "&#x2212; 短く") +
          b("cl", "longer", "&#xFF0B; 長く") + b("cl", "name", "&#x270F;&#xFE0F; 名前") + b("cl", "del", "&#x1F5D1;&#xFE0F; 削除", "da-half") + '</div></div>';
      }
      if (f) {
        var c = f.clip, a = M.tickToBar(p, c.start), bars = Math.round(c.len / M.barTicks(p) * 100) / 100, hid = M.hiddenNotes(c);
        return h + '<div class="daw-info da-panel"><div>&#x1F3B5; <b>' + escHtml(clipLabel(c)) + '</b>（' + escHtml(f.track.name) + '）: ' + a.bar + '小節目から ' + bars + '小節・音符 ' + (c.notes.length - hid) + ' 個' + (hid ? '（はみ出て鳴らない音符 ' + hid + ' 個）' : '') + '</div>' +
          '<div class="da-btns">' + (M.isDrum(f.track) ? b("cl", "roll", "&#x1F941; パターンを直す", "da-wide") : b("cl", "roll", "&#x1F3B9; 音符を直す", "da-wide")) + b("cl", "dup", "&#x29C9; 複製") + b("cl", "left", "&#x25C0; 1小節") + b("cl", "right", "1小節 &#x25B6;") +
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
        return h + '<div class="daw-info da-panel"><div>' + infoHtml(p) + '</div><div class="da-btns">' + (M.isAudio(t) ? b("tr", "rec", "&#x1F399;&#xFE0F; 録音", "da-wide dr-open") + b("tr", "wav", "&#x1F3B5; WAV を読みこむ", "da-wide") : b("tr", "clip", "&#xFF0B; クリップ", "da-wide")) + b("tr", "name", "&#x270F;&#xFE0F; 名前") + b("tr", "up", "&#x25B2; 上へ") + b("tr", "down", "&#x25BC; 下へ") + b("tr", "del", "&#x1F5D1;&#xFE0F; トラックを削除", "da-wide da-danger-o") + '</div></div>';
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
    return '<span class="small">クリップをタップすると選べて、下に操作が出ます（もう一度タップで音符を直す）。トラック名をタップするとトラックを選べます。全部で ' + p.tracks.length + ' トラック・' + M.viewBars(p) + ' 小節。</span>';
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
    st.project = p; st.view = "arr"; st.roll = null; st.sel = null; st.scroll = 0; st.undo.length = 0; st.anote = ""; st.steps = null; st.chooseAdd = false; st.confirmDel = null;
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
        var n = b && b.data && typeof b.data.byteLength === "number" ? b.data.byteLength : -1;
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
    for (i = 0; p && i < p.tracks.length; i++) { for (j = 0; j < p.tracks[i].clips.length; j++) { var c = p.tracks[i].clips[j]; if (c.type === "audio" && c.asset && !seen[c.asset]) { seen[c.asset] = true; out.push(c.asset); } } }
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
    aud.st[id] = "loading";
    function fin(s, why) { aud.st[id] = s; if (why) { aud.err[id] = why; } var w = aud.wait[id] || [], i; aud.wait[id] = []; for (i = 0; i < w.length; i++) { try { w[i](); } catch (e) {} } }
    idbGet("meta", id, function (m, w1) {
      if (m === undefined) { fin(aud.dbState === "none" ? "nodb" : "error", w1); return; }
      if (!m) { fin("missing"); return; }
      if (m.peaks && m.peaks.length) { aud.peaks[id] = m.peaks; }
      idbGet("blobs", id, function (b, w2) {
        if (b === undefined) { fin("error", w2); return; }
        if (!b || !b.data) { fin("missing"); return; }
        if (aud.st[id] !== "loading") { return; } // 途中で捨てた
        decodeWav(b.data, m, function (buf, why) {
          if (aud.st[id] !== "loading") { return; }
          if (!buf) { fin("error", why); return; }
          aud.buf[id] = buf;
          if (!aud.peaks[id]) { try { aud.peaks[id] = peaksOf(buf); } catch (e4) {} }
          fin("ready");
        }, false);
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
  // 音声のクリップ 1 つを予約する（ev ＝ UGDawModel.audioEvents の 1 つ）
  function playAudio(p, ev, seg) {
    var M = DM(), t = M.findTrack(p, ev.track);
    if (pl.clip) { if (ev.clip !== pl.clip || !t) { return; } } else if (!t || !M.audible(p, t)) { return; }
    var buf = aud.buf[ev.asset], endT = Math.min(ev.end, pl.segEnd), when = segTime(p, seg, ev.tick), stop = segTime(p, seg, endT);
    var off = ev.srcOffset + (ev.skip ? M.tickToSec(p, ev.tick) - M.tickToSec(p, ev.start) : 0);
    var rec = { track: t.id, tick: ev.tick, audio: true, asset: ev.asset, clip: ev.clip, when: when, offset: off, dur: 0, pass: pl.pass, ok: false, why: "" };
    if (!buf) { rec.why = assetState(ev.asset) || "notLoaded"; }
    else {
      var dur = Math.min(buf.duration - off, stop - when);
      rec.dur = dur;
      if (!(dur > 0.001)) { rec.why = "end"; }
      else {
        try {
          var mx = mixFor(t), ac = pl.ac, dest = mx.dry ? mx.dry.g : mx.main.g, src = ac.createBufferSource(), g = ac.createGain(), gv = ev.gain, cut = dur < buf.duration - off - 0.0005;
          src.buffer = buf; src.connect(g); g.connect(dest);
          g.gain.value = off > 0.0005 ? 0 : gv;
          if (off > 0.0005) { g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(gv, when + FADE_IN); } // 途中から: 3ms でフェードイン
          else { g.gain.setValueAtTime(gv, when); }
          if (cut) { g.gain.setValueAtTime(gv, Math.max(when + FADE_IN, when + dur - FADE_OUT)); g.gain.linearRampToValueAtTime(0, when + dur); } // クリップ・ループの終わり: 5ms で消す
          src.start(when, off, dur);
          mx.srcs.push({ src: src, g: g, end: when + dur });
          if (mx.srcs.length > 16) { mx.srcs = mx.srcs.filter(function (x) { return !(x.end < ac.currentTime - 1); }); }
          rec.ok = true; rec.cut = cut;
        } catch (e) { rec.why = errName(e); }
      }
    }
    plLog.push(rec);
    if (plLog.length > 400 && !pl.wav) { plLog.shift(); }
  }
  // 波形（2px に 1 本の線の SVG・クリップの位置・長さ・テンポごとにとっておく）
  function waveSvg(p, c, w) {
    var M = DM(), pk = aud.peaks[c.asset], a = M.findAsset(p, c.asset);
    if (!pk || !pk.length || !a) { return ""; }
    var key = c.asset + "|" + c.start + "|" + c.len + "|" + (c.srcOffset || 0) + "|" + w + "|" + JSON.stringify(p.tempo.points);
    if (aud.wave[key]) { return aud.wave[key]; }
    var out = "";
    try {
      var top = 14, H = LANE_H - 6 - top - 2, mid = top + H / 2, s0 = M.tickToSec(p, c.start), PR = M.PEAK_RATE, off = c.srcOffset || 0, d = "", x, i;
      for (x = 0; x < w; x += 2) {
        var t0 = M.tickToSec(p, c.start + x / PX_BEAT * M.PPQ) - s0 + off, t1 = M.tickToSec(p, c.start + (x + 2) / PX_BEAT * M.PPQ) - s0 + off;
        if (t0 >= a.sec) { break; }
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
      if (file.size > M.WAV_MAX_BYTES) { audNote("⚠️ 読みこめませんでした: " + M.wavLimitWhy(null, file.size) + "（曲は変えていません）"); rerender(); return; }
      audNote("⏳ 「" + file.name + "」を読みこんでいます…"); rerender();
      var rd = new FileReader();
      rd.onload = function () { importWav(rd.result, file.name, tgt, function (r) { audDone(r, file.name); }); };
      rd.onerror = function () { audNote("⚠️ ファイルを読めませんでした（曲は変えていません）"); rerender(); };
      rd.readAsArrayBuffer(file);
    };
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
  var rec = { state: "idle", open: false, track: "", bar: 0, withPlay: true, monitor: false, msg: "", tok: null, ac: null, stream: null, src: null, node: null, sink: null, mon: null, mode: "",
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
    try { var tr = stream && stream.getAudioTracks ? stream.getAudioTracks()[0] : null, s = tr && tr.getSettings ? tr.getSettings() : null; i = s && Number(s.latency) > 0 && Number(s.latency) < 1 ? Number(s.latency) : 0; } catch (e2) { i = 0; }
    return { out: o, inp: i, sec: o + i };
  }
  // 録れる長さ（秒）: 60 秒・WAV の上限・1 曲の素材の合計の残り
  function recRoom(p, sr) {
    var M = DM(), l = p && p.assets ? p.assets : [], sec = 0, i;
    for (i = 0; i < l.length; i++) { sec += Number(l[i] && l[i].sec) || 0; }
    return Math.max(0, Math.min(REC_MAX_SEC, M.WAV_MAX_SEC, (M.WAV_MAX_BYTES - 44) / (2 * (sr || 48000)), M.MAX_ASSET_SEC - sec));
  }
  function recMedia() { try { var n = window.navigator, md = n && n.mediaDevices; return md && md.getUserMedia ? md : null; } catch (e) { return null; } }
  // 録音を始められない理由（"" ＝ 始められる）
  function recWhy(p, t) {
    var M = DM();
    if (!p || p.readOnly) { return "この曲は読むだけなので、録音を置けません"; }
    if (!t || !M.isAudio(t)) { return "オーディオトラックを選んでください"; }
    if (aud.busy) { return "いま別の音声を読みこんでいます"; }
    if (wav.busy) { return "WAV を書き出しています。終わってから録音してください"; }
    if (pk.busy) { return "ZIP を作っています。終わってから録音してください"; }
    if (window.isSecureContext === false) { return "マイクは https のページ（GitHub Pages）か localhost でだけ使えます"; }
    if (!recMedia()) { return "このブラウザではマイクを使えません（getUserMedia がありません）"; }
    if ((p.assets || []).length >= M.MAX_ASSETS) { return M.assetRoomWhy(p, { sec: 0 }); }
    if (recRoom(p, 0) < 1) { return "1 曲の音声の素材は合計 " + M.MAX_ASSET_SEC + " 秒までなので、もう録れません（「📁 曲」の画面で、使っていない素材を外せます）"; }
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
  function recOpen(tid) { if (rec.state !== "idle") { return false; } var p = project(), M = DM(), lr = M.loopRange(p); rec.open = true; rec.track = tid; rec.msg = ""; recFreeFail(); rec.bar = p.practice && p.practice.loopOn ? M.tickToBar(p, lr.a).bar - 1 : 0; rec.manual = recManual(); st.chooseAdd = false; st.confirmDel = null; st.anote = ""; return true; }
  // ● 録音開始（ボタンの中から: AudioContext を作る・再開する → マイクの許可）
  function recStart() {
    var p = project(), M = DM(), t = M.findTrack(p, rec.track), UG = window.UGMelody, ac = null, why;
    if (rec.state !== "idle") { return false; }
    rec.msg = ""; recFreeFail();
    why = recWhy(p, t);
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
    rec.state = "rec"; rec.last = Date.now();
    if (rec.withPlay) {
      rec.comp = Math.max(0, rec.auto.sec + rec.manual / 1000);
      var end = M.songEndTick(p);
      if (!startPlay({ from: rec.start, a: rec.start, b: Math.max(end, rec.start + M.barTicks(p)), loop: false, noWait: true, rec: true }) || !pl) { recFail(tok, { ugText: st.msg || "伴奏を鳴らせませんでした" }); return; }
      rec.f0 = Math.round((pl.segs[0].t0 + rec.comp) * rec.sr); // この番号のフレーム ＝ 録りはじめの小節の頭（伴奏の予約と同じ時計）
    } else {
      rec.comp = 0;
      rec.f0 = Math.round(ac.currentTime * rec.sr);
    }
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
  function recClock(sec) { var s = Math.max(0, sec), m = Math.floor(s / 60), r = s - m * 60; return m + ":" + (r < 10 ? "0" : "") + (Math.floor(r * 10) / 10).toFixed(1); }
  // 100ms ごと: 経過時間・入力レベル（描きなおさずに文字と幅だけ）。データが 3 秒来なければ止める（電話・別のアプリなどで止まった）
  function recTick() {
    if (rec.state !== "rec") { return; }
    if (Date.now() - rec.last > REC_STALL_MS) { recStop("stall"); return; }
    var root = st.root, el = root && root.querySelector ? root.querySelector(".dr-time") : null, lv = root && root.querySelector ? root.querySelector(".dr-lv") : null;
    if (el) { el.textContent = recClock(rec.kept / rec.sr) + " / " + recClock(rec.max / rec.sr); }
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
    var withPl = rec.withPlay;
    recRelease();
    if (withPl) { stopPlay(false); }
    rec.chunks = [];
    if (n < REC_MIN_SEC * sr) { rec.state = "idle"; rec.msg = why0 + "録音が短すぎる（" + (Math.round(n / sr * 10) / 10) + " 秒）ので捨てました（曲は変えていません）"; rerender(); return true; }
    var ab = recWav(chunks, n, sr), info = M.parseWav(ab), name = "録音 " + fmtTime(Date.now()) + ".wav", sec = Math.round(n / sr * 10) / 10;
    if (!info.ok || info.fmt !== 1 || info.bits !== 16 || info.ch !== 1 || info.frames !== n) { rec.state = "idle"; rec.msg = "録音を WAV にできませんでした（曲は変えていません）"; rerender(); return true; }
    rec.state = "saving"; rec.msg = why0; rerender();
    importWav(ab, name, { track: tid, start: start, src: "rec" }, function (r) {
      rec.state = "idle";
      if (!r.ok) {
        rec.fail = { ab: ab, name: name.replace(/[\/:]/g, "-") };
        rec.msg = why0 + "録音を置けませんでした: " + r.why + (/曲は変えていません|保存しました/.test(r.why) ? "" : "（曲は変えていません）") + "。下のボタンで、録った音を WAV のファイルにとっておけます";
        rerender(); return;
      }
      var t = M.findTrack(project(), tid), moved = r.clip && r.clip.start !== start;
      rec.open = false; rec.msg = "";
      audNote(why0 + "🎙️ 録音（" + sec + " 秒）を「" + (t ? t.name : "") + "」の " + (r.clip ? M.tickToBar(project(), r.clip.start).bar : "?") + " 小節目に置きました" + (moved ? "（録りはじめの小節にほかのクリップが重なったので、後ろへずらしました。伴奏とはずれています）" : "") + (clipN ? "。音が大きすぎて割れたところがあります（マイクから少し離れてください）" : "") + (r.saved ? "" : "。ただし曲を保存できませんでした"));
      rerender();
    });
    return true;
  }
  // ✕ やめる（捨てる）・曲を切りかえる
  function recCancel(msg) {
    if (rec.state !== "rec" && rec.state !== "ask") { return false; }
    var withPl = rec.state === "rec" && rec.withPlay;
    recRelease();
    if (withPl) { stopPlay(false); }
    rec.chunks = []; rec.kept = 0; rec.state = "idle"; rec.msg = msg || "";
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
    if (v === "bar-" || v === "bar+") { rec.bar = Math.max(0, Math.min(REC_BARS - 1, rec.bar + (v === "bar+" ? 1 : -1))); return; }
    if (v === "play") { rec.withPlay = !rec.withPlay; return; }
    if (v === "off-" || v === "off+") { rec.manual = recSetManual(recManual() + (v === "off+" ? 10 : -10)); }
  }
  function recHtml(p) {
    var M = DM(), t = M.findTrack(p, rec.track), i;
    if (!t || !M.isAudio(t)) { if (rec.state === "idle") { rec.open = false; return ""; } }
    function b(act, label, cls, dis) { return '<button class="modal-btn' + (cls ? " " + cls : "") + '" data-rc="' + act + '"' + (dis ? " disabled" : "") + '>' + label + '</button>'; }
    var h = '<div class="daw-info da-panel dr"><div>&#x1F399;&#xFE0F; <b>録音</b> &#x2192; 「' + escHtml(t ? t.name : "?") + '」</div>';
    var monB = b("mon", "&#x1F3A7; モニター（マイクの音を聞く）: " + (rec.monitor ? "ON" : "OFF"), "da-wide dr-tg" + (rec.monitor ? " on" : ""));
    if (rec.state === "rec") {
      h += '<div class="dr-live"><span class="dr-dot">&#x25CF;</span> 録音中 <b class="dr-time">' + recClock(rec.kept / rec.sr) + ' / ' + recClock(rec.max / rec.sr) + '</b><span class="dr-meter" aria-hidden="true"><i class="dr-lv" style="width:0%;"></i></span></div>' +
        '<div class="small">' + (rec.withPlay ? '伴奏といっしょに ' + (rec.bar + 1) + ' 小節目から（補正 ' + Math.round(rec.comp * 1000) + 'ms）' : 'マイクだけ（伴奏なし）・' + (rec.bar + 1) + ' 小節目に置きます') + '・' + rec.sr + 'Hz・' + (rec.mode === "worklet" ? "AudioWorklet" : "ScriptProcessor") + '</div>' +
        '<div class="da-btns">' + b("stop", "&#x25A0; 停止して置く", "da-half dr-stop") + b("cancel", "&#x2715; やめる（捨てる）", "da-half") + monB + '</div>';
    } else if (rec.state === "ask") {
      h += '<div>&#x23F3; マイクの準備をしています…（ブラウザがマイクを使ってよいか聞いてきたら「許可」を押してください）</div><div class="da-btns">' + b("cancel", "&#x2715; やめる", "da-wide") + '</div>';
    } else if (rec.state === "saving") {
      h += '<div>&#x23F3; 録音を保存しています…（この端末の中に保存して、確かめてから置きます）</div>';
    } else {
      var why = recWhy(p, t), room = recRoom(p, rec.ac ? rec.ac.sampleRate : 0), st0 = M.barToTick(p, rec.bar), over = false, mn = rec.manual;
      for (i = 0; t && i < t.clips.length; i++) { if (t.clips[i].start + t.clips[i].len > st0) { over = true; } }
      var au = rec.auto ? Math.round(rec.auto.sec * 1000) : null;
      h += '<div class="dr-row">録りはじめ: ' + b("bar-", "&#x2212;", "dr-sm", rec.bar <= 0) + ' <b>' + (rec.bar + 1) + ' 小節目</b> ' + b("bar+", "&#xFF0B;", "dr-sm") + '</div>' +
        '<div class="da-btns">' + b("play", (rec.withPlay ? "&#x2611;" : "&#x2610;") + " &#x1F3B6; 伴奏を鳴らしながら録る", "da-wide dr-tg" + (rec.withPlay ? " on" : "")) + monB + '</div>' +
        (rec.withPlay ? '<div class="dr-row small">ずれの補正: 自動 ' + (au === null ? '（録りはじめに測る）' : au + 'ms') + ' ＋ 手で ' + b("off-", "&#x2212;10", "dr-sm") + ' <b>' + (mn > 0 ? "+" : "") + mn + 'ms</b> ' + b("off+", "&#xFF0B;10", "dr-sm") + '<br>録った音が伴奏より遅れて聞こえるときは ＋、早いときは − にします。</div>' : '') +
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
  var WAV_RATE = 44100, WAV_MAX_MUSIC = 60, WAV_TAIL = 3, WAV_SAMPLE_WAIT = 8000;
  var wav = { busy: false, job: null, blob: null, url: "", name: "", stats: null, plan: null, msg: "", note: "", state: "idle", log: [], ms: 0 };
  function fileBase(name) { return String(name || "gorilla-daw").replace(/[\\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/^[\s.]+|[\s.]+$/g, "").substring(0, 40) || "gorilla-daw"; }
  function stamp() { var d = new Date(), z = function (n) { return (n < 10 ? "0" : "") + n; }; return d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + "-" + z(d.getHours()) + z(d.getMinutes()); }
  // 書き出す範囲と大きさの見こみ（曲の頭から曲の終わり ＋ 余韻。ループは使わない）
  function wavPlan(p) {
    var M = DM(), end = M.songEndTick(p), music = M.tickToSec(p, end), sec = music + WAV_TAIL, frames = Math.ceil(sec * WAV_RATE);
    var r = { endTick: end, bars: M.tickToBar(p, Math.max(0, end - 1)).bar, music: music, sec: sec, frames: frames, bytes: 44 + frames * 4, ok: true, why: "" };
    if (!(M.noteCount(p) > 0) && !(M.audioClipCount(p) > 0)) { r.ok = false; r.why = "音符も音声のクリップもありません"; }
    else if (music > WAV_MAX_MUSIC) { r.ok = false; r.why = "曲が " + Math.round(music) + " 秒あります。いまは " + WAV_MAX_MUSIC + " 秒までです（途中で切らないので、書き出しません）"; }
    return r;
  }
  function wavFree() { if (wav.url) { try { URL.revokeObjectURL(wav.url); } catch (e) {} } wav.url = ""; wav.blob = null; }
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
  function renderSong(cb) {
    var p = project(), M = DM(), UG = window.UGMelody, OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext, plan = wavPlan(p), id;
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
    var off;
    try { off = new OAC(2, plan.frames, WAV_RATE); } catch (e) { cb(null, "書き出しの準備ができませんでした（メモリが足りないかもしれません）"); return; }
    var A = UG.audio, saved = { ctx: A.ctx, master: A.master, bus: A.bus, revSend: A.revSend, dlySend: A.dlySend }, savedPl = pl, savedLog = plLog, ok = true, err = "";
    plLog = [];
    try {
      // オフライン側にも、いまと同じ「全体の音量 → 共有の残響（リバーブ・ディレイ）」を作る（送りの量はいまの値を写す）
      var mst = off.createGain(); mst.gain.value = A.master ? A.master.gain.value : 0.25; mst.connect(off.destination);
      var fx = UG.buildFx ? UG.buildFx(off, mst) : { bus: mst, revSend: null, dlySend: null };
      if (fx.revSend && A.revSend) { fx.revSend.gain.value = A.revSend.gain.value; }
      if (fx.dlySend && A.dlySend) { fx.dlySend.gain.value = A.dlySend.gain.value; }
      A.ctx = off; A.master = mst; A.bus = fx.bus; A.revSend = fx.revSend || null; A.dlySend = fx.dlySend || null;
      pl = { ac: off, mix: {}, segs: [{ t0: 0, tick0: 0, fresh: true }], cur: 0, loop: false, la: 0, segEnd: plan.endTick, endAt: 0, pass: 0, timer: null, raf: null, clip: null, wav: true, opts: { a: 0, b: plan.endTick, loop: false, clip: null } };
      var E = SE(); if (E && E.setTempo) { try { E.setTempo(M.bpmAt(p, 0)); } catch (e1) {} }
      for (var ti = 0; ti < p.tracks.length; ti++) { mixFor(p.tracks[ti]); }
      schedule(p, 0, plan.endTick, pl.segs[0]);
      for (id in pl.mix) { if (pl.mix.hasOwnProperty(id) && pl.mix[id] && pl.mix[id].syn && pl.mix[id].syn.finish) { try { pl.mix[id].syn.finish(); } catch (e3) {} } }
    } catch (e2) { ok = false; err = String(e2 && e2.message ? e2.message : e2); }
    wav.log = plLog;
    pl = savedPl; plLog = savedLog;
    A.ctx = saved.ctx; A.master = saved.master; A.bus = saved.bus; A.revSend = saved.revSend; A.dlySend = saved.dlySend;
    if (!ok) { cb(null, "書き出しに失敗しました（" + err + "）"); return; }
    var done = false;
    function fin(buf) {
      if (done) { return; }
      done = true;
      var stt = null;
      try { stt = bufStats(buf); } catch (e5) { cb(null, "描いた音を調べられませんでした"); return; }
      if (stt.rate !== WAV_RATE || stt.ch < 2) { cb(null, "描いた音の形がちがいます（" + stt.rate + "Hz・" + stt.ch + "ch）", stt, plan); return; }
      if (stt.nan > 0) { cb(null, "描いた音がこわれていました（NaN " + stt.nan + " 個）", stt, plan); return; }
      if (stt.peak < 0.0001) { cb(null, "音がありません（全部ミュート・マスター 0 などではありませんか）", stt, plan); return; }
      var blob = null;
      try { blob = UG.encodeWav(buf); } catch (e6) { blob = null; }
      if (!blob) { cb(null, "WAV にできませんでした", stt, plan); return; }
      cb(blob, "", stt, plan);
    }
    off.oncomplete = function (ev) { fin(ev.renderedBuffer); };
    try {
      var pr = off.startRendering();
      if (pr && pr.then) { pr.then(fin, function () { if (!done) { done = true; cb(null, "描けませんでした"); } }); }
    } catch (e4) { if (!done) { done = true; cb(null, "描けませんでした"); } }
  }
  // 書き出す（再生を止めてから・一度に 1 つ・データは変えない）
  function wavExport(onDone) {
    if (wav.busy) { return false; }
    stopPlay(false);
    wavFree();
    var p = project(), plan = wavPlan(p), UG = window.UGMelody, i, hasDrum = false;
    wav.plan = plan; wav.stats = null; wav.note = ""; wav.msg = "";
    if (!plan.ok) { wav.state = "fail"; wav.msg = plan.why; if (onDone) { onDone(); } return false; }
    for (i = 0; i < p.tracks.length; i++) { if (DM().isDrum(p.tracks[i])) { hasDrum = true; } }
    wav.busy = true; wav.state = "busy";
    var job = wav.job = { canceled: false, t0: Date.now() }, started = false, tm = null;
    function go() {
      if (started) { return; }
      started = true;
      if (tm) { clearTimeout(tm); }
      var samplesOk = !hasDrum || !UG.sampleReady || !!UG.sampleReady(UG.DRUM);
      renderSong(function (blob, why, stt, pln) {
        wav.busy = false; wav.job = null; wav.stats = stt || null; wav.ms = Date.now() - job.t0;
        if (job.canceled) { wav.state = "canceled"; wav.msg = "やめました（描いた音は捨てました）"; }
        else if (!blob) { wav.state = "fail"; wav.msg = why || "書き出せませんでした"; }
        else {
          wav.blob = blob; wav.name = fileBase(p.name) + "_" + stamp() + ".wav";
          try { wav.url = URL.createObjectURL(blob); } catch (e) { wav.url = ""; }
          wav.state = "done";
          wav.note = (samplesOk ? "" : "生ドラムのサンプルを読みこめなかったので、作るドラムの音で描きました。") + (stt && stt.clip ? "音が大きすぎて割れているところがあります（" + stt.clip + " サンプル）。マスター音量を下げてください。" : "");
        }
        if (onDone) { onDone(); }
      });
    }
    function begin() {
      if (job.canceled) { wav.busy = false; wav.job = null; wav.state = "canceled"; wav.msg = "やめました"; if (onDone) { onDone(); } return; }
      if (hasDrum && UG.loadSamples && UG.DRUM !== undefined) { tm = setTimeout(go, WAV_SAMPLE_WAIT); try { UG.loadSamples([UG.DRUM], go); } catch (e) { go(); } }
      else { go(); }
    }
    ensureAssets(p, begin); // 9A-10: 音声の素材を読みこんでから
    return true;
  }
  function wavCancel() { if (wav.job) { wav.job.canceled = true; } }

  // ---------- §341 9A-11: プロジェクトパック（ZIP: manifest.json・project.json・audio/ の WAV）----------
  var PACK_FORMAT = "ultimate-gorilla-daw-pack", PACK_VERSION = 1, PACK_MAX_ZIP = 100 * 1024 * 1024, PACK_MAX_JSON = 2 * 1024 * 1024;
  var pk = { busy: false, state: "idle", msg: "", blob: null, url: "", name: "", size: 0, assets: 0, restored: null, istate: "idle", imsg: "" };
  function ZP() { return window.UGDawZip || null; }
  function packFile(id) { return "audio/" + String(id).replace(":", "-") + ".wav"; }
  function packFree() { if (pk.url) { try { URL.revokeObjectURL(pk.url); } catch (e) {} } pk.url = ""; pk.blob = null; }
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
    function next() {
      i++;
      if (i >= plan.list.length) { build(); return; }
      var it = plan.list[i];
      if (!it.ref) { if (it.used) { fail("クリップが使う素材の情報が曲にありません（" + it.id + "）"); return; } next(); return; }
      idbGet("blobs", it.id, function (b, why) {
        var data = b && b.data ? new Uint8Array(b.data) : null;
        if (!data || data.length !== it.ref.bytes || M.hashBytes(data) !== it.id) {
          if (it.used) { fail("音声の素材「" + it.ref.name + "」が" + (b === undefined ? "読めません（" + (why || "") + "）" : (data ? "こわれています" : "この端末にありません")) + "。まとめられません（「🔗 素材を選びなおす」でつなぎなおしてください）"); return; }
          next(); return; // 使っていない素材が端末に無いときは入れない
        }
        Z.sha256Async(data, function (sha) {
          if (!/^[0-9a-f]{64}$/.test(sha)) { fail("SHA-256 を計算できませんでした"); return; }
          var r = it.ref;
          out.push({ data: data, m: { id: it.id, file: packFile(it.id), name: r.name, bytes: data.length, sha256: sha, sr: r.sr, ch: r.ch, bits: r.bits, frames: r.frames, sec: r.sec, used: it.used } });
          next();
        });
      });
    }
    function build() {
      var rec = M.toRecord(p, p.saved || Date.now()), files = [], k, man;
      man = { format: PACK_FORMAT, packVersion: PACK_VERSION, app: "究極ゴリラ ゴリラDAW", created: d.toISOString(), name: p.name, projectId: p.id, project: "project.json", assets: [] };
      for (k = 0; k < out.length; k++) { man.assets.push(out[k].m); }
      files.push({ name: "manifest.json", data: Z.utf8(JSON.stringify(man, null, 1)) });
      files.push({ name: "project.json", data: Z.utf8(JSON.stringify(rec, null, 1)) });
      for (k = 0; k < out.length; k++) { files.push({ name: out[k].m.file, data: out[k].data }); }
      var z, blob;
      try { z = Z.zipBuild(files, d); blob = new Blob(z.parts, { type: "application/zip" }); } catch (e) { fail("ZIP を作れませんでした（" + errName(e) + "・メモリが足りないかもしれません）"); return; }
      pk.busy = false;
      cb({ ok: true, blob: blob, name: fileBase(p.name) + "_" + stamp() + ".zip", size: z.size, assets: out.length, manifest: man });
    }
    if (!plan.list.length) { build(); return; }
    next();
  }
  // 読みこむ（全部確かめてから IndexedDB へ・新しい曲 ID で一覧に足す。いまの曲は切りかえない）→ cb({ ok, why, id, name, assets, reused })
  function packImport(ab, cb) {
    var Z = ZP(), M = DM();
    function fail(why) { pk.busy = false; cb({ ok: false, why: why }); }
    if (pk.busy) { cb({ ok: false, why: "いま別の ZIP を処理しています" }); return; }
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
      if (!a || typeof a.id !== "string" || !/^a:[0-9a-f]{16}$/.test(a.id) || a.file !== packFile(a.id) || !/^[0-9a-f]{64}$/.test(String(a.sha256))) { cb({ ok: false, why: "manifest の素材の情報がおかしいです（" + (i + 1) + " 個目）" }); return; }
      if (byId[a.id]) { cb({ ok: false, why: "manifest に同じ素材が 2 回あります" }); return; }
      if (!zr.files[a.file]) { if (need.indexOf(a.id) >= 0) { cb({ ok: false, why: "素材が足りません（「" + String(a.name || a.id) + "」が ZIP に入っていません）。読みこみをやめました" }); return; } continue; }
      if (!(a.bytes > 0) || a.bytes > M.WAV_MAX_BYTES || zr.files[a.file].usize !== a.bytes) { cb({ ok: false, why: "素材「" + String(a.name || a.id) + "」の大きさがおかしいです" }); return; }
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
        var buf = u.buffer.byteLength === u.length ? u.buffer : u.slice(0).buffer, info = M.parseWav(buf);
        if (!info.ok) { fail("素材「" + a.name + "」: " + info.why); return; }
        var ref = M.findAsset(p, a.id);
        if (!M.sameAsset(ref, M.assetRef(info, ref.name, a.id))) { fail("素材「" + a.name + "」が曲の記録（長さ・レート・ch）と合いません。読みこみをやめました"); return; }
        decodeWav(buf, info, function (b, why) {
          if (!b) { fail("素材「" + a.name + "」: " + why); return; }
          var peaks = []; try { peaks = peaksOf(b); } catch (e) { peaks = []; }
          ok.push({ id: a.id, data: buf, meta: { id: a.id, name: ref.name, bytes: ref.bytes, sr: ref.sr, ch: ref.ch, bits: ref.bits, frames: ref.frames, sec: ref.sec, hash: a.id, peaks: peaks, added: Date.now() } });
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
    if (pk.state === "busy") { h += '<div class="daw-info">&#x23F3; ZIP を作っています…</div>'; }
    else if (pk.state === "done" && pk.blob) {
      h += '<div class="daw-info">&#x2705; できました: ' + escHtml(pk.name) + '<br><span class="small">' + mb(pk.size) + '・音声 ' + pk.assets + ' 個</span></div>' +
        '<div class="dp-btns"><button class="modal-btn" data-pj="packSave">&#x1F4BE; ファイルに保存（共有）</button>' + (pk.url ? '<a class="modal-btn dp-dl" href="' + pk.url + '" download="' + escHtml(pk.name) + '">&#x2B07;&#xFE0F; ダウンロード</a>' : '') + '</div>';
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
    h += '<div class="small">「' + escHtml(p.name) + '」・1〜' + pln.bars + ' 小節（曲の全体・ループは使わない）＋ 余韻 ' + WAV_TAIL + ' 秒<br>長さ 約 ' + (Math.round(pln.sec * 10) / 10) + ' 秒・大きさ 約 ' + mb(pln.bytes) + '（44.1kHz・16bit・ステレオ）</div>';
    if (wav.state === "busy") { h += '<div class="daw-info">&#x23F3; 書き出し中…</div><button class="modal-btn" data-pj="wavCancel">やめる</button>'; }
    else {
      if (wav.state === "done" && wav.blob) {
        var w = wav.stats;
        h += '<div class="daw-info">&#x2705; 書き出しました: ' + escHtml(wav.name) + '<br><span class="small">' + (Math.round(w.sec * 100) / 100) + ' 秒・' + mb(wav.blob.size) + '・' + w.rate + 'Hz・ピーク L ' + w.L.peak + ' ／ R ' + w.R.peak + '</span>' + (wav.note ? '<br><span class="small">&#x26A0;&#xFE0F; ' + escHtml(wav.note) + '</span>' : '') + '</div>' +
          '<div class="dp-btns"><button class="modal-btn" data-pj="wavSave">&#x1F4BE; ファイルに保存（共有）</button>' + (wav.url ? '<a class="modal-btn dp-dl" href="' + wav.url + '" download="' + escHtml(wav.name) + '">&#x2B07;&#xFE0F; ダウンロード</a>' : '') + '</div>';
      } else if (wav.state === "fail" || wav.state === "canceled") { h += '<div class="daw-msg">&#x26A0;&#xFE0F; ' + escHtml(wav.msg) + '</div>'; }
      h += pln.ok ? '<button class="modal-btn dp-wavgo" data-pj="wav">&#x1F3B5; WAV を書き出す</button>' : '<div class="daw-msg">&#x26A0;&#xFE0F; ' + escHtml(pln.why) + '</div>';
    }
    return h + '<p class="small dsv-note">書き出しは数秒かかります（曲の長さを待ちません）。iPhone では「ファイルに保存（共有）」で共有シートが開きます（実機では未確認）。開かないときは「ダウンロード」を使ってください。</p></div>';
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
      wavHtml(p) +
      packHtml(p) +
      assetsHtml(p) +
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
    return h + '<p class="small dsv-note">クリップを消しても素材は消えません。「曲から外す」も端末の中の WAV は消しません（ほかの曲が使っているかもしれないため）。</p>' +
      '<input type="file" class="da-wavfile" accept=".wav,audio/wav,audio/x-wav,audio/wave,audio/vnd.wave" style="display:none;"></div>';
  }
  function renderProj(root, ctl) {
    audKick(project());
    root.innerHTML = projHtml();
    if (!root.querySelectorAll) { return; }
    var btns = root.querySelectorAll("button"), k, file = root.querySelector(".dp-file");
    function back() { st.view = "arr"; sv.note = ""; render(root, ctl); }
    bindWavFile(root);
    for (k = 0; k < btns.length; k++) {
      btns[k].onclick = function (ev) {
        var el = ev.currentTarget, v = el.getAttribute("data-pj"), id = el.getAttribute("data-pj-open"), aid;
        if ((aid = el.getAttribute("data-pj-relink"))) { sv.note = ""; pickWav(root, { relink: aid }); return; } // 9A-10
        if ((aid = el.getAttribute("data-pj-unasset"))) { proj.unasset(aid); renderProj(root, ctl); return; }
        if (id) { var r = proj.open(id); if (r.ok) { sv.note = ""; render(root, ctl); } else { renderProj(root, ctl); } return; }
        if (v === "back") { back(); return; }
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
        // §341 9A-11: ZIP
        if (v === "pack") { packStart(function () { if (st.view === "proj" && st.root === root) { renderProj(root, ctl); } }); renderProj(root, ctl); return; }
        if (v === "packSave" && pk.blob) { var hz = "fail"; try { hz = I.saveBlob(pk.blob, pk.name); } catch (ez) { hz = "fail"; } if (hz === "fail") { pk.state = "fail"; pk.msg = "保存できませんでした。「ダウンロード」を使ってください"; } renderProj(root, ctl); return; }
        if (v === "unpack") { var zf = root.querySelector(".dp-zipfile"); if (zf && !pk.busy) { zf.value = ""; zf.click(); } return; }
        if (v === "wavSave" && wav.blob) { var how = "fail"; try { how = I.saveBlob(wav.blob, wav.name); } catch (e) { how = "fail"; } if (how === "fail") { wav.note = "保存できませんでした。「ダウンロード」を使ってください。"; } renderProj(root, ctl); }
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
      '<button class="modal-btn daw-small" data-save-now="1" title="いま保存">&#x1F4BE;</button></div>';
  }
  // 上の段のボタン（DAW とピアノロールで同じ）
  function bindProjBar(root, ctl) {
    var a = root.querySelector("[data-go-proj]"), b = root.querySelector("[data-rename]"), c = root.querySelector("[data-save-now]");
    if (a) { a.onclick = function () { keepScroll(root); if (pl) { stopPlay(false); } st.view = "proj"; sv.note = ""; renderProj(root, ctl); }; }
    if (b) { b.onclick = function () { var v = window.prompt ? window.prompt("曲名（40 文字まで）", project().name) : null; if (v !== null && v !== undefined) { proj.rename(v); keepScroll(root); render(root, ctl); } }; }
    if (c) { c.onclick = function () { saveNow(); drawStatus(); }; }
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
    return true;
  }
  function closeRoll() { if (pl && pl.clip) { stopPlay(false); } st.view = "arr"; st.roll = null; }
  // §341 9A-5: ↶ はトラック全部の写し（音符もふくむ）を覚える。ピアノロールとアレンジで同じ列
  function snapTracks() { return JSON.parse(JSON.stringify(project().tracks)); }
  function pushUndo(snap) { var u = st.undo; u.push(snap); if (u.length > UNDO_MAX) { u.shift(); } }
  // 直したあと: 再生中なら同じ位置から鳴らしなおす（古い予約の音を消す）・描きなおす
  function afterEdit() { if (pl) { resync(); } rerender(); }
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
      st.project.tracks = u.pop(); if (st.roll) { st.roll.sel = null; } markDirty(); afterEdit(); // 戻したあとの状態を保存
      return true;
    }
  };
  function rollHtml(p, f) {
    var M = DM(), c = f.clip, t = f.track, r = st.roll, o = c.offset || 0, PPQ = M.PPQ, i, m;
    var W = Math.round(c.len / PPQ * RB), H = (HI - LO + 1) * RH, m0 = M.meterAt(p, c.start), barPx = Math.round(M.ticksPerBar(m0) / PPQ * RB), snapPx = Math.max(4, Math.round(r.snap / PPQ * RB));
    var playing = !!(pl && pl.clip === c.id), sopt = "";
    for (i = 0; i < SNAPS.length; i++) { sopt += '<option value="' + SNAPS[i][0] + '"' + (SNAPS[i][0] === r.snap ? " selected" : "") + '>' + SNAPS[i][1] + '</option>'; }
    var h = '<div class="daw pr">' +
      '<div class="daw-top"><button class="modal-btn daw-small" data-roll="back">&#x2190; もどる</button><b>&#x270F;&#xFE0F; ' + escHtml((c.ext && c.ext.name) || "クリップ") + '</b>' +
      '<span class="daw-pname">' + ((t.ext && t.ext.icon) || "&#x1F3B5;") + ' ' + escHtml(t.name) + '・' + instName(t) + '</span></div>' +
      projBarHtml(p) +
      '<div class="daw-transport">' +
        '<button class="modal-btn daw-tbtn' + (playing ? " daw-on" : "") + '" data-roll="play" title="このクリップだけ鳴らす（くり返し）">&#x25B6;&#xFE0F;</button>' +
        '<button class="modal-btn daw-tbtn" data-roll="stop" title="停止">&#x23F9;&#xFE0F;</button>' +
        '<button class="modal-btn daw-tbtn" data-roll="undo" title="戻す"' + (r.undo.length ? '' : ' disabled') + '>&#x21B6;<small>' + (r.undo.length || '') + '</small></button>' +
        '<button class="modal-btn daw-tbtn" data-roll="del" title="選んだ音符を消す"' + (r.sel ? '' : ' disabled') + '>&#x1F5D1;&#xFE0F;</button>' +
        '<label class="pr-snap">グリッド <select data-roll-snap="1" aria-label="グリッド">' + sopt + '</select></label>' +
        '<span class="pr-oct"><button class="modal-btn daw-tbtn" data-roll="up" title="1 オクターブ上へ">&#x25B2;</button><button class="modal-btn daw-tbtn" data-roll="down" title="1 オクターブ下へ">&#x25BC;</button></span>' +
      '</div>' +
      '<div class="pr-wrap"><div class="pr-inner" style="width:' + (KEYW + W) + 'px;height:' + H + 'px;">' +
      '<div class="pr-keys" style="width:' + KEYW + 'px;height:' + H + 'px;">';
    for (m = HI; m >= LO; m--) {
      var bk = BLACK.indexOf(m % 12) >= 0;
      h += '<div class="pr-key' + (bk ? " pr-black" : "") + (m % 12 === 0 ? " pr-c" : "") + '" style="top:' + (HI - m) * RH + 'px;height:' + RH + 'px;line-height:' + RH + 'px;">' + noteName(m) + '</div>';
    }
    h += '</div><div class="pr-grid" style="width:' + W + 'px;height:' + H + 'px;background-size:' + barPx + 'px 100%,' + RB + 'px 100%,' + snapPx + 'px 100%,100% ' + RH + 'px;">';
    for (m = HI; m >= LO; m--) { if (BLACK.indexOf(m % 12) >= 0) { h += '<i class="pr-rowb" style="top:' + (HI - m) * RH + 'px;height:' + RH + 'px;"></i>'; } }
    for (i = 0; i < c.notes.length; i++) {
      var n = c.notes[i];
      if (n[2] < LO || n[2] > HI) { continue; }
      var x = Math.round((n[0] - o) / PPQ * RB), w = Math.max(16, Math.round((n[1] > 0 ? n[1] : 240) / PPQ * RB) - 1), sel = n === r.sel;
      h += '<div class="pr-note' + (sel ? " pr-sel" : "") + (n[1] > 0 ? "" : " pr-zero") + '" data-n="' + i + '" style="left:' + x + 'px;top:' + ((HI - n[2]) * RH + 2) + 'px;width:' + w + 'px;height:' + (RH - 4) + 'px;">' +
        (sel ? '<i class="pr-handle" data-h="' + i + '"></i>' : '') + '</div>';
    }
    h += '<div class="pr-playhead" style="display:none;"></div></div></div></div>';
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
        if (v === "stop") { stopPlay(false); rerender(); return; }
        if (v === "undo") { edit.undo(); return; }
        if (v === "del") { edit.del(); return; }
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
    if (DM().isDrum(f.track)) { st.view = "steps"; st.sel = { kind: "clip", id: id }; st.steps = { clip: id, track: f.track.id, sx: 0, mode: "tap", pick: null }; return true; }
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
  function stepsHtml(p, f) {
    var M = DM(), c = f.clip, t = f.track, n = M.stepCount(c), kit = M.DRUM_KIT, i, j, h;
    var playing = !!(pl && pl.clip === c.id);
    h = '<div class="daw ds">' +
      '<div class="daw-top"><button class="modal-btn daw-small" data-sq="back">&#x2190; もどる</button><b>&#x1F941; ' + escHtml(clipLabel(c)) + '</b><span class="daw-pname">' + escHtml(t.name) + '</span></div>' +
      projBarHtml(p) +
      '<div class="daw-transport"><button class="modal-btn daw-tbtn' + (playing ? " daw-on" : "") + '" data-sq="play" title="このパターンをくり返し鳴らす">&#x25B6;&#xFE0F;</button>' +
        '<button class="modal-btn daw-tbtn" data-sq="stop" title="停止">&#x23F9;&#xFE0F;</button>' +
        '<button class="modal-btn daw-tbtn" data-sq="undo" title="戻す"' + (st.undo.length ? '' : ' disabled') + '>&#x21B6;<small>' + (st.undo.length || '') + '</small></button>' +
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
        if (v === "back") { if (pl && pl.clip) { stopPlay(false); } st.view = "arr"; st.steps = null; render(root, ctl); return; }
        if (v === "play") { startPlay({ clip: c.id, a: c.start, b: c.start + c.len, loop: true }); renderSteps(root, ctl); return; }
        if (v === "stop") { stopPlay(false); renderSteps(root, ctl); return; }
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
    commit: function () { markDirty(); } // 指をはなしたとき 1 回だけ保存
  };
  function panSupported() { var UG = window.UGMelody, ac = UG && UG.audio && UG.audio.ctx; if (ac) { return !!ac.createStereoPanner; } var AC = window.AudioContext || window.webkitAudioContext; return !!(AC && AC.prototype && AC.prototype.createStereoPanner); }
  function mixHtml(p) {
    var i, h, mv = p.master ? Math.round(clampNum(p.master.vol, 0, 100, VOL0)) : VOL0, ps = panSupported();
    h = '<div class="daw dm">' +
      '<div class="daw-top"><button class="modal-btn daw-small" data-mx="back">&#x2190; アレンジ</button><b>&#x1F39A;&#xFE0F; ミキサー</b></div>' +
      projBarHtml(p) +
      '<div class="daw-transport"><button class="modal-btn daw-tbtn' + (pl ? " daw-on" : "") + '" data-mx="play" title="再生">&#x25B6;&#xFE0F;</button><button class="modal-btn daw-tbtn" data-mx="stop" title="停止">&#x23F9;&#xFE0F;</button><span class="daw-pos">1.1</span></div>' +
      '<div class="dm-row dm-master"><div class="dm-name"><b>DAW のマスター</b></div>' +
        '<div class="dm-ctl"><span class="dm-lab">音量</span><input type="range" class="dm-fader" min="0" max="100" step="1" value="' + mv + '" data-mxv="master" aria-label="マスター音量"><b class="dm-val" data-mxval="master">' + mv + '</b>' +
        '<button class="modal-btn dm-reset" data-mx="resetMaster" title="80 に戻す">&#x21BA;</button></div></div>';
    if (!ps) { h += '<p class="small dsv-note">このブラウザでは左右（パン）を変えられません（音量・M／S は使えます）。</p>'; }
    for (i = 0; i < p.tracks.length; i++) {
      var t = p.tracks[i], pv = Math.round(clampNum(t.pan, -1, 1, 0) * 100), tv = Math.round(clampNum(t.vol, 0, 100, VOL0));
      h += '<div class="dm-row"><div class="dm-name">' + ((t.ext && t.ext.icon) || "&#x1F3B5;") + ' <b>' + escHtml(t.name) + '</b> <span class="small">' + instName(t) + '</span>' +
          '<span class="daw-ms dm-ms"><button class="daw-m' + (t.mute ? " on" : "") + '" data-mxm="' + t.id + '">M</button><button class="daw-s' + (t.solo ? " on" : "") + '" data-mxs="' + t.id + '">S</button></span></div>' +
        '<div class="dm-ctl"><span class="dm-lab">音量</span><input type="range" class="dm-fader" min="0" max="100" step="1" value="' + tv + '" data-mxv="' + t.id + '" aria-label="' + escHtml(t.name) + ' の音量"><b class="dm-val" data-mxval="' + t.id + '">' + tv + '</b>' +
          '<button class="modal-btn dm-reset" data-mxr="' + t.id + '" title="音量 80・パン C に戻す">&#x21BA;</button></div>' +
        '<div class="dm-ctl"><span class="dm-lab">パン</span><input type="range" class="dm-fader dm-pan" min="-100" max="100" step="1" value="' + pv + '" data-mxp="' + t.id + '" aria-label="' + escHtml(t.name) + ' の左右"' + (ps ? '' : ' disabled') + '><b class="dm-val" data-mxpval="' + t.id + '">' + panText(pv / 100) + '</b><span class="dm-sp"></span></div></div>';
    }
    return h + saveNoteHtml() + '<p class="small dsv-note">フェーダーは指で左右に動かします。↺ で初期値（音量 80・パン C・マスター 80）に戻ります。音量・パン・マスターは ↶ の対象外です。</p></div>';
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
        if (v === "stop") { stopPlay(false); renderMix(root, ctl); return; }
        if (v === "resetMaster") { mixer.resetMaster(); renderMix(root, ctl); return; }
        if ((id = el.getAttribute("data-mxr"))) { mixer.resetTrack(id); renderMix(root, ctl); return; }
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
        if (pid) { mixer.setPan(pid, Number(el.value) / 100); lab = root.querySelector('[data-mxpval="' + pid + '"]'); if (lab) { lab.textContent = panText(Number(el.value) / 100); } }
      };
      rs[k].onchange = function () { mixer.commit(); };
    }
    drawHead();
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
          if (v === "play") { startPlay(); redraw(); return; }
          if (v === "stop") { stopPlay(false); redraw(); return; }
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
        if ((v = el.getAttribute("data-addwav"))) { keepScroll(root); st.anote = ""; pickWav(root, { track: v }); return; }
        if ((v = el.getAttribute("data-ar"))) { keepScroll(root); if (v === "addTrack") { st.chooseAdd = !st.chooseAdd; st.sel = null; st.confirmDel = null; st.anote = ""; rerender(); } else if (v === "addSynth" || v === "addDrum") { ops.addTrack(v === "addDrum" ? "drum" : "synth"); } else if (v === "addCancel") { st.chooseAdd = false; rerender(); } else if (v === "undo") { ops.undo(); } else if (v === "mixer") { st.confirmDel = null; st.view = "mix"; renderMix(root, ctl); } return; }
        if ((v = el.getAttribute("data-addclip"))) { keepScroll(root); ops.addClip(v); return; }
        if ((v = el.getAttribute("data-cl")) && st.sel && st.sel.kind === "clip") {
          var cid = st.sel.id, fc = M.findClip(p, cid);
          keepScroll(root);
          if (!fc) { return; }
          if (v === "roll") { st.anote = ""; if (openEditor(cid)) { render(root, ctl); } return; }
          if (v === "relink") { st.anote = ""; pickWav(root, { relink: fc.clip.asset }); return; } // 9A-10
          if (v === "dup") { ops.duplicate(cid); return; }
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
        if (t && el.value) { t.instrument = M.synthInstrument(el.value); st.sel = { kind: "track", id: t.id }; if (pl) { warm(t); } markDirty(); } // 再生中なら、これから予約する音から新しい音色
        redraw();
      };
    }
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
    state: function () { return st; },
    project: project,
    reset: function () { recCancel(""); rec.open = false; rec.msg = ""; recFreeFail(); if (sv.timer) { clearTimeout(sv.timer); sv.timer = null; } stopPlay(false); clearTail(); audForget(); st.undo.length = 0; st.anote = ""; st.steps = null; st.chooseAdd = false; st.confirmDel = null; st.project = null; st.sel = null; st.scroll = 0; st.msg = ""; st.view = "arr"; st.roll = null; sv.status = "demo"; sv.msg = ""; sv.note = ""; sv.at = 0; },
    // §341 9A-3: ピアノロール（テストからも呼ぶ）
    openRoll: function (id) { var ok = openRoll(id); if (ok && st.root) { rerender(); } return ok; },
    closeRoll: function () { closeRoll(); if (st.root) { rerender(); } }, roll: function () { return st.roll; }, edit: edit, resync: resync,
    // §341 9A-4: 保存・読みこみ（テストからも呼ぶ）。reload ＝ ページの読みなおしと同じ（メモリの曲を捨てて、保存から開く）
    wav: { plan: function () { return wavPlan(project()); }, start: wavExport, cancel: wavCancel, state: function () { return wav; }, render: renderSong, stats: bufStats, RATE: WAV_RATE, MAX: WAV_MAX_MUSIC, TAIL: WAV_TAIL },
    hear: hear, steps: steps, openEditor: function (id) { var ok = openEditor(id); if (ok && st.root) { rerender(); } return ok; }, ops: ops, mixer: mixer, panText: panText, showMixer: function () { if (st.root) { st.view = "mix"; renderMix(st.root, st.ctl); } }, askDelete: function (id) { st.confirmDel = id; if (st.root) { rerender(); } }, undoDepth: function () { return st.undo.length; }, select: function (kind, id) { st.sel = kind ? { kind: kind, id: id } : null; st.anote = ""; if (st.root) { rerender(); } },
    proj: proj, saveNow: saveNow, markDirty: markDirty, flushSave: flushSave, saveState: function () { return sv; }, readIndex: readIndex, loadProject: loadProject,
    showProj: function () { if (st.root) { st.view = "proj"; renderProj(st.root, st.ctl); } },
    // §341 9A-11: プロジェクトパック（ZIP）
    pack: { exportZip: packExport, importZip: packImport, start: packStart, load: packLoad, state: function () { return pk; }, plan: function () { return packPlan(project()); }, file: packFile, FORMAT: PACK_FORMAT, VERSION: PACK_VERSION, MAX_ZIP: PACK_MAX_ZIP },
    // §341 9A-12: マイク録音（テストからも呼ぶ）
    rec: { open: recOpen, start: recStart, stop: recStop, cancel: recCancel, ui: recUi, state: function () { return rec; }, wav: recWav, chunk: recChunk, manual: recManual, setManual: recSetManual, room: function () { return recRoom(project(), rec.sr || 48000); }, why: function () { var p = project(); return recWhy(p, DM().findTrack(p, rec.track)); }, html: function () { return recHtml(project()); }, KEY: REC_KEY, MAX_SEC: REC_MAX_SEC, WORKLET: REC_WORKLET },
    // §341 9A-10: オーディオトラック（テストからも呼ぶ）
    audio: { importWav: importWav, ensure: ensureAssets, state: function () { return aud; }, add: addAudio, pick: pickWav, waveSvg: waveSvg, used: usedAssets, missing: audMissing, assetState: assetState, IDB_NAME: IDB_NAME, forget: audForget },
    reload: function () { recCancel(""); rec.open = false; rec.msg = ""; recFreeFail(); if (sv.timer) { clearTimeout(sv.timer); sv.timer = null; } stopPlay(false); clearTail(); audForget(); st.undo.length = 0; st.anote = ""; st.steps = null; st.chooseAdd = false; st.confirmDel = null; st.project = null; st.view = "arr"; st.roll = null; st.sel = null; sv.status = "demo"; sv.msg = ""; sv.note = ""; sv.at = 0; return project(); },
    ROLL: { RB: RB, RH: RH, LO: LO, HI: HI, KEYW: KEYW },
    presetList: presetList,
    PX_BEAT: PX_BEAT, LOOK: LOOK,
    // §341 9A-2: 再生（テストからも呼ぶ）
    play: startPlay, stop: function () { stopPlay(false); }, pump: pump, setLoop: setLoop, setBpm: changeBpm, updateMix: updateMix,
    isPlaying: function () { return !!pl; }, player: function () { return pl; }, playTick: playTick, log: function () { return plLog; }, clearLog: function () { plLog = []; },
    tailPending: function () { return !!tailTimer; }
  };
})();
