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
    var fresh = !!seg.fresh && !seg.freshDone && from === seg.tick0, aev = M.audioEvents(pl.shadow || p, from, to, fresh); // 9A-17: 下書きの試聴は影の曲（同じクリップ ID・トラック）
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
    var cue = st.cue !== null && st.cue !== undefined && !clip && (!loop || (st.cue >= a && st.cue < b)) ? st.cue : null; // 9B-1: 小節へ
    var from = opts.from !== undefined ? opts.from : (cue !== null ? cue : (loop || clip ? a : 0));
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
    pl = { ac: ac, mix: {}, segs: [{ t0: ac.currentTime + START_LEAD + Math.max(0, Number(opts.delay) || 0), tick0: from, fresh: true }], cur: from, loop: loop, la: a, segEnd: b, endAt: 0, pass: 0, timer: null, raf: null, clip: clip,
      opts: { a: a, b: b, loop: loop, clip: clip, fixedB: opts.b !== undefined }, muteClip: opts.muteClip || null, shadow: opts.shadow || null };
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
  I.addStopHook(function () { if (rec.state !== "idle") { st.root = null; recStop("exit"); } rec.open = false; flushSave(); if (typeof wavCancel === "function") { wavCancel(); wavFree(); wav.state = "idle"; } stopPlay(false); clearTail(); audFree(null); aud.pending = null; packFree(); pk.state = "idle"; pk.istate = "idle"; pk.restored = null; st.root = null; st.ctl = null; }); // 9A-4: 待っている保存も書く。9A-10: デコードした音声を捨てる（素材は IndexedDB に残る）

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
    var M = DM(), p = project();
    if (M && p && st.view === "roll") { renderRoll(root, ctl); return; }
    if (M && p && st.view === "proj") { renderProj(root, ctl); return; }
    if (M && p && st.view === "mix") { renderMix(root, ctl); return; }
    if (M && p && st.view === "steps") { renderSteps(root, ctl); return; }
    if (M && p && st.view === "aedit") { renderAedit(root, ctl); return; } // 9A-13
    if (M && p && st.view === "lib") { renderLib(root, ctl); return; } // 9A-15
    if (M && p && st.view === "sec") { renderSec(root, ctl); return; } // 9B-1
    if (M && p && st.view === "comp") { renderComp(root, ctl); return; } // 9A-16
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
        '<button class="modal-btn daw-small" data-ar="sections">&#x1F3BC; 曲の構成</button>' + // 9B-1
        '<span class="small da-hint">クリップをタップ ＝ 選ぶ ／ もう一度 ＝ 音符</span></div>' +
      '<div class="daw-arr" style="--daw-head:' + HEAD_W + 'px;">';
    // 目盛り（小節の番号・拍の線）
    var secL = M.sectionsOf(p), rulerH = secL.length ? RULER_H + 16 : RULER_H; // 9B-1
    h += '<div class="daw-row daw-ruler-row"><div class="daw-corner">トラック</div><div class="daw-ruler daw-grid" style="' + grid + 'height:' + rulerH + 'px;">';
    for (i = 0; i < secL.length; i++) { var sx0 = tickX(secL[i].tick), sw0 = Math.max(4, tickX(secL[i].tick + secL[i].len) - sx0 - 1); h += '<button class="daw-secband sc-' + escHtml(secL[i].color || "blue") + '" data-secjump="' + escHtml(secL[i].id) + '" style="left:' + sx0 + 'px;width:' + sw0 + 'px;" title="' + escHtml(secL[i].name) + '（タップでこの小節へ）">' + escHtml(secL[i].name) + '</button>'; }
    if (st.cue !== null && st.cue !== undefined && !pl) { h += '<i class="daw-cue" style="left:' + tickX(st.cue) + 'px;" title="▶ のはじまり"></i>'; }
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
    st.project = p; st.view = "arr"; st.roll = null; st.sel = null; st.cue = null; st.secUI = null; st.repeat = null; st.secMsg = ""; st.scroll = 0; st.undo.length = 0; st.anote = ""; st.steps = null; st.chooseAdd = false; st.confirmDel = null;
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
    for (i = 0; p && i < p.tracks.length; i++) { for (j = 0; j < p.tracks[i].clips.length; j++) { var ca = DM().clipAssets(p.tracks[i].clips[j]), k; for (k = 0; k < ca.length; k++) { if (!seen[ca[k]]) { seen[ca[k]] = true; out.push(ca[k]); } } } } // 9A-14: 使っていないテイクの素材もふくむ（読みこむ・ZIP に入れる）
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
    if (!buf) { rec.why = assetState(ev.asset) || "notLoaded"; }
    else {
      var dur = Math.min(buf.duration - off, endS - ev.sec);
      rec.dur = dur;
      if (!(dur > 0.001)) { rec.why = "end"; }
      else {
        try {
          var mx = mixFor(t), ac = pl.ac, dest = mx.dry ? mx.dry.g : mx.main.g, src = ac.createBufferSource(), g = ac.createGain(), cut = off + dur < buf.duration - 0.0005;
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
    var key = c.asset + "|" + c.start + "|" + c.len + "|" + (c.srcOffset || 0) + "|" + (c.trimIn || 0) + "|" + (c.trimOut || 0) + "|" + (c.nudge || 0) + "|" + w + "|" + JSON.stringify(p.tempo.points);
    if (aud.wave[key]) { return aud.wave[key]; }
    var out = "";
    try {
      var top = 14, H = LANE_H - 6 - top - 2, mid = top + H / 2, sp = M.audioSpan(p, c), PR = M.PEAK_RATE, lo = Math.max(0, sp.p0), d = "", x, i; // 9A-13: トリム・微調整を反映（鳴る所だけ描く）
      for (x = 0; x < w; x += 2) {
        var x0 = M.tickToSec(p, c.start + x / PX_BEAT * M.PPQ), x1 = M.tickToSec(p, c.start + (x + 2) / PX_BEAT * M.PPQ);
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
    var M = DM(), segs = M.audioSegs(p, c), key = "comp|" + JSON.stringify([c.start, c.len, c.comp, c.takes, c.asset, c.trimIn, c.trimOut, c.nudge, c.fadeIn, c.fadeOut, w, p.tempo.points]);
    if (aud.wave[key]) { return aud.wave[key]; }
    var top = 14, H = LANE_H - 6 - top - 2, mid = top + H / 2, PR = M.PEAK_RATE, ds = {}, x, i, q, k, ready = true, cp = M.compOf(p, c);
    for (q = 0; q < segs.length; q++) { if (!aud.peaks[segs[q].id]) { ready = false; } }
    if (!ready || !segs.length || !cp) { return ""; }
    for (x = 0; x < w; x += 2) {
      var x0 = M.tickToSec(p, c.start + x / PX_BEAT * M.PPQ), x1 = M.tickToSec(p, c.start + (x + 2) / PX_BEAT * M.PPQ), xm = (x0 + x1) / 2, sg = null;
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
    for (i = 0; i < cp.Ts.length; i++) { var cx = Math.round((M.secToTick(p, cp.Ts[i]) - c.start) / M.PPQ * PX_BEAT); out += '<line class="da-wave-x" x1="' + cx + '" y1="' + top + '" x2="' + cx + '" y2="' + (top + H) + '"/>'; }
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
      var z = u.pop(); if (z && z.__all) { st.project.tracks = z.tracks; st.project.markers = z.markers; } else { st.project.tracks = z; } // 9B-1: セクションの写しも
      if (st.roll) { st.roll.sel = null; } markDirty(); afterEdit(); // 戻したあとの状態を保存
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
        if (v === "stop") { transportStop(); rerender(); return; }
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
    if (f.clip.type === "audio") { return openAedit(id); } // 9A-13: オーディオ ＝ ✂️ 編集
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
    try { r.undo = JSON.stringify(st.undo).indexOf(id) >= 0; } catch (e2) { r.undo = true; }
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
        if (v === "stop") { transportStop(); renderMix(root, ctl); return; }
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

  // ---------- §342 9B-1: 曲の構成（セクション）・小節へ・クリップの繰り返し・セクションの複製 ----------
  // ↶ の写し: セクション（markers）も入れる（いままでの写しはトラックの配列のまま）
  function snapAll() { return { __all: true, tracks: snapTracks(), markers: JSON.parse(JSON.stringify(project().markers || [])) }; }
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
          if (v === "stop") { st.cue = null; stopPlay(false); redraw(); return; }
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
        if ((v = el.getAttribute("data-ar")) === "sections") { keepScroll(root); st.view = "sec"; st.secUI = null; st.secMsg = ""; renderSec(root, ctl); return; } // 9B-1
        if ((v = el.getAttribute("data-secjump"))) { keepScroll(root); sections.jump(v); return; } // 9B-1
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
        if ((v = el.getAttribute("data-addwav"))) { keepScroll(root); st.anote = ""; pickWav(root, { track: v }); return; }
        if ((v = el.getAttribute("data-ar"))) { keepScroll(root); if (v === "addTrack") { st.chooseAdd = !st.chooseAdd; st.sel = null; st.confirmDel = null; st.anote = ""; rerender(); } else if (v === "addSynth" || v === "addDrum") { ops.addTrack(v === "addDrum" ? "drum" : "synth"); } else if (v === "addCancel") { st.chooseAdd = false; rerender(); } else if (v === "undo") { ops.undo(); } else if (v === "mixer") { st.confirmDel = null; st.view = "mix"; renderMix(root, ctl); } return; }
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
    reset: function () { recCancel(""); rec.open = false; rec.msg = ""; rec.result = null; st.aedit = null; recFreeFail(); if (sv.timer) { clearTimeout(sv.timer); sv.timer = null; } stopPlay(false); clearTail(); audForget(); st.undo.length = 0; st.anote = ""; st.steps = null; st.chooseAdd = false; st.confirmDel = null; st.project = null; st.sel = null; st.scroll = 0; st.msg = ""; st.view = "arr"; st.roll = null; sv.status = "demo"; sv.msg = ""; sv.note = ""; sv.at = 0; },
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
    aedit: { open: function (id) { var ok = openAedit(id); if (ok && st.root) { rerender(); } return ok; }, set: aedit.set, step: aedit.step, reset: aedit.reset, play: aeditPlay, svg: aeditSvg, env: audEnv }, // 9A-13
    transportStop: transportStop,
    sections: { list: sections.list, add: sections.add, update: sections.update, remove: sections.remove, copy: sections.copy, jump: sections.jump, html: function () { return secHtml(project()); }, draft: secDraft, open: function () { st.view = "sec"; st.secUI = null; if (st.root) { rerender(); } }, cue: function () { return st.cue; }, setUI: function (u) { st.secUI = u; if (st.root) { rerender(); } }, ui: function () { return st.secUI; } }, // 9B-1
    jumpTo: jumpTo, repeatUI: function () { return st.repeat; },
    lib: { lockInit: lockShared, lockState: function () { return lk.state; }, lockDrop: function () { lk.gen++; if (lk.rel) { var r = lk.rel; lk.rel = null; r(); } lk.state = "off"; }, addWhy: assetAddWhy, LOCK: LOCK_NAME, open: function () { libOpen(); if (st.root) { rerender(); } }, load: libLoad, scan: libScan, refs: libRefs, del: libDelete, hear: libHear, busyWhy: libBusyWhy, otherTabs: otherTabs, chanInit: libChanInit, state: function () { return lib; }, html: libHtml, songAssets: songAssets, PING_MS: LIB_PING_MS }, // 9A-15
    comp: { open: function (id) { var ok = openComp(id); if (ok && st.root) { rerender(); } return ok; }, cur: comp.cur, take: comp.take, sel: comp.sel, nudge: comp.nudge, setAt: comp.setAt, add: comp.add, del: comp.del, apply: comp.apply, cancel: comp.cancel, off: comp.off, undo: comp.undo, changed: comp.changed, play: compPlay, html: function () { var f = comp.clip(); return f ? compHtml(project(), f) : ""; }, svg: compWaveSvg, obj: compObj }, // 9A-16／9A-17
    takes: { select: function (cid, id) { return takes.select(cid, id); }, remove: function (cid, id) { return takes.remove(cid, id); }, hear: takeHear, stop: takeHearStop, info: function () { return hearInfo; }, html: function (cid) { var f = DM().findClip(project(), cid); return f ? takesHtml(project(), f.clip) : ""; }, openRec: function (cid) { var ok = recOpenTake(cid); if (ok && st.root) { rerender(); } return ok; } }, // 9A-14
    rec: { open: recOpen, start: recStart, stop: recStop, cancel: recCancel, ui: recUi, state: function () { return rec; }, wav: recWav, chunk: recChunk, manual: recManual, setManual: recSetManual, room: function () { return recRoom(project(), rec.sr || 48000); }, why: function () { var p = project(); return recWhy(p, DM().findTrack(p, rec.track)); }, html: function () { return recHtml(project()); }, KEY: REC_KEY, MAX_SEC: REC_MAX_SEC, WORKLET: REC_WORKLET },
    // §341 9A-10: オーディオトラック（テストからも呼ぶ）
    audio: { importWav: importWav, ensure: ensureAssets, state: function () { return aud; }, add: addAudio, pick: pickWav, waveSvg: waveSvg, used: usedAssets, missing: audMissing, assetState: assetState, IDB_NAME: IDB_NAME, forget: audForget },
    reload: function () { recCancel(""); rec.open = false; rec.msg = ""; recFreeFail(); if (sv.timer) { clearTimeout(sv.timer); sv.timer = null; } stopPlay(false); clearTail(); audForget(); st.undo.length = 0; st.anote = ""; st.steps = null; st.chooseAdd = false; st.confirmDel = null; st.project = null; st.view = "arr"; st.roll = null; st.sel = null; st.cue = null; st.secUI = null; st.repeat = null; st.secMsg = ""; sv.status = "demo"; sv.msg = ""; sv.note = ""; sv.at = 0; return project(); },
    ROLL: { RB: RB, RH: RH, LO: LO, HI: HI, KEYW: KEYW },
    presetList: presetList,
    PX_BEAT: PX_BEAT, LOOK: LOOK,
    // §341 9A-2: 再生（テストからも呼ぶ）
    play: startPlay, stop: function () { stopPlay(false); }, pump: pump, setLoop: setLoop, setBpm: changeBpm, updateMix: updateMix,
    isPlaying: function () { return !!pl; }, player: function () { return pl; }, playTick: playTick, log: function () { return plLog; }, clearLog: function () { plLog = []; },
    tailPending: function () { return !!tailTimer; }
  };
})();
