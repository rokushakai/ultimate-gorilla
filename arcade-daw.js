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
    mx = { main: chain(bus), dry: master ? chain(master) : null, syn: null, voices: [] };
    mx.syn = Y && Y.track ? Y.track(ac, { bus: mx.main.g, dry: mx.dry ? mx.dry.g : null }) : null; // エンジンが無ければ null（UGSynth.note で鳴らす）
    pl.mix[t.id] = mx;
    setGain(t, mx, true);
    return mx;
  }
  function setGain(t, mx, now) {
    var on = DM().audible(st.project, t), v = on ? t.vol / 100 : 0, ac = pl.ac, list = [mx.main, mx.dry], i;
    for (i = 0; i < list.length; i++) {
      if (!list[i]) { continue; }
      try { if (now) { list[i].g.gain.value = v; } else { list[i].g.gain.setTargetAtTime(v, ac.currentTime, 0.01); } } catch (e) { list[i].g.gain.value = v; }
      if (list[i].pn) { try { list[i].pn.pan.value = t.pan; } catch (e2) {} }
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
    for (i = 0; i < evs.length; i++) {
      var ev = evs[i], t = M.findTrack(p, ev.track);
      if (pl.clip) { if (ev.clip !== pl.clip || !t) { continue; } } // 9A-3: クリップだけ鳴らす（直している音を聞けるように M／S は見ない）
      else if (!t || !M.audible(p, t)) { continue; }
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
      if (plLog.length > 400) { plLog.shift(); }
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
        pl.segs.push({ t0: segTime(p, seg, pl.segEnd), tick0: la });
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
      if (!mix.hasOwnProperty(id)) { continue; }
      var mx = mix[id];
      if (mx.syn) { try { mx.syn.dispose(); } catch (e) {} mx.syn = null; }
      for (i = 0; i < mx.voices.length; i++) { try { if (mx.voices[i].kill) { mx.voices[i].kill(0.05); } } catch (e2) {} }
      mx.voices = [];
      (function (m) { setTimeout(function () { var l = [m.main, m.dry], k; for (k = 0; k < l.length; k++) { if (l[k]) { try { l[k].g.disconnect(); if (l[k].pn) { l[k].pn.disconnect(); } } catch (e3) {} } } }, 150); })(mx);
    }
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
    var E = SE(); if (E && E.setTempo) { try { E.setTempo(M.bpmAt(p, from)); } catch (e2) {} }
    pl = { ac: ac, mix: {}, segs: [{ t0: ac.currentTime + START_LEAD, tick0: from }], cur: from, loop: loop, la: a, segEnd: b, endAt: 0, pass: 0, timer: null, raf: null, clip: clip,
      opts: { a: a, b: b, loop: loop, clip: clip, fixedB: opts.b !== undefined } };
    for (i = 0; i < p.tracks.length; i++) { mixFor(p.tracks[i]); warm(p.tracks[i]); }
    pump();
    pl.timer = setInterval(pump, PUMP_MS);
    loopHead();
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
    }
  }
  // BPM: 再生中なら、まだ予約していない音から新しい速さ（すでに予約した音の時刻はそのまま）
  function changeBpm(v) {
    var p = project(), M = DM(), t0 = null, E = SE();
    if (pl) { t0 = segTime(p, pl.segs[pl.segs.length - 1], pl.cur); }
    var b = M.setBpm(p, v);
    if (pl && t0 !== null) { pl.segs.push({ t0: t0, tick0: pl.cur }); if (pl.segs.length > 3) { pl.segs.shift(); } if (pl.endAt) { pl.endAt = 0; } }
    if (pl && E && E.setTempo) { try { E.setTempo(b); } catch (e) {} }
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
  I.addStopHook(function () { flushSave(); stopPlay(false); clearTail(); st.root = null; st.ctl = null; }); // 9A-4: 待っている保存も書く

  // ---------- 描く ----------
  function clipHtml(p, t, c) {
    var x = tickX(c.start), w = Math.max(6, tickX(c.start + c.len) - x), sel = st.sel && st.sel.kind === "clip" && st.sel.id === c.id;
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
          '<select class="daw-inst" data-inst="' + t.id + '" aria-label="音色">' + opts + '</select>' +
          '<div class="daw-ms"><button class="daw-m' + (t.mute ? " on" : "") + '" data-mute="' + t.id + '">M</button><button class="daw-s' + (t.solo ? " on" : "") + '" data-solo="' + t.id + '">S</button></div>' +
        '</div>' +
        '<div class="daw-lane daw-grid" style="' + grid + 'height:' + LANE_H + 'px;">';
      for (j = 0; j < t.clips.length; j++) { h += clipHtml(p, t, t.clips[j]); }
      if (t.kind === "midi") { h += '<button class="da-add" data-addclip="' + t.id + '" style="left:' + (tickX(M.trackEnd(t)) + 3) + 'px;" title="ここに空のクリップを足す" aria-label="クリップを足す">&#xFF0B;</button>'; }
      h += '</div></div>';
    }
    h += '<div class="daw-playhead" style="left:' + (HEAD_W + tickX(playTick())) + 'px;"></div></div>';
    h += (st.msg ? '<div class="daw-msg">&#x26A0;&#xFE0F; ' + escHtml(st.msg) + '</div>' : '') +
      '<div class="da-area">' + panelHtml(p) + '</div>' + // 9A-5: 選んでも高さが変わらない（画面がずれてタップが別のクリップに当たらないように）
      saveNoteHtml() +
      '<p class="small daw-note">クリップをタップ ＝ 選ぶ（下に操作）／ もう一度タップ ＝ ピアノロールで音符を直す。</p></div>';
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
    function b(kind, act, label, cls) { return '<button class="modal-btn' + (cls ? " " + cls : "") + '" data-' + kind + '="' + act + '">' + label + '</button>'; }
    if (s && s.kind === "clip") {
      var f = M.findClip(p, s.id);
      if (f) {
        var c = f.clip, a = M.tickToBar(p, c.start), bars = Math.round(c.len / M.barTicks(p) * 100) / 100, hid = M.hiddenNotes(c);
        return h + '<div class="daw-info da-panel"><div>&#x1F3B5; <b>' + escHtml(clipLabel(c)) + '</b>（' + escHtml(f.track.name) + '）: ' + a.bar + '小節目から ' + bars + '小節・音符 ' + (c.notes.length - hid) + ' 個' + (hid ? '（はみ出て鳴らない音符 ' + hid + ' 個）' : '') + '</div>' +
          '<div class="da-btns">' + b("cl", "roll", "&#x1F3B9; 音符を直す", "da-wide") + b("cl", "dup", "&#x29C9; 複製") + b("cl", "left", "&#x25C0; 1小節") + b("cl", "right", "1小節 &#x25B6;") +
          b("cl", "shorter", "&#x2212; 短く") + b("cl", "longer", "&#xFF0B; 長く") + b("cl", "name", "&#x270F;&#xFE0F; 名前") + b("cl", "del", "&#x1F5D1;&#xFE0F; 削除") + '</div></div>';
      }
    }
    if (s && s.kind === "track") {
      var t = M.findTrack(p, s.id);
      if (t) {
        return h + '<div class="daw-info da-panel"><div>' + infoHtml(p) + '</div><div class="da-btns">' + b("tr", "clip", "&#xFF0B; クリップ", "da-wide") + b("tr", "name", "&#x270F;&#xFE0F; 名前") + b("tr", "up", "&#x25B2; 上へ") + b("tr", "down", "&#x25BC; 下へ") + '</div></div>';
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
      if (t) { return ((t.ext && t.ext.icon) || "&#x1F3B5;") + ' <b>' + escHtml(t.name) + '</b>: ゴリラシンセ「' + instName(t) + '」・クリップ ' + t.clips.length + ' 個・音量 ' + t.vol + (t.mute ? '・ミュート' : '') + (t.solo ? '・ソロ' : ''); }
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
    flushSave();
    stopPlay(false);
    st.project = p; st.view = "arr"; st.roll = null; st.sel = null; st.scroll = 0; st.undo.length = 0; st.anote = "";
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
      return { ok: how !== "fail", name: name, text: text, how: how };
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
      '<p class="small dsv-note">保存は<b>この端末・このブラウザの中だけ</b>です。ほかの端末やブラウザとは同期しません。機種を変える・PC に移す・念のための控えには「JSON に書き出す」を使ってください。</p>' +
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
  function renderProj(root, ctl) {
    root.innerHTML = projHtml();
    if (!root.querySelectorAll) { return; }
    var btns = root.querySelectorAll("button"), k, file = root.querySelector(".dp-file");
    function back() { st.view = "arr"; sv.note = ""; render(root, ctl); }
    for (k = 0; k < btns.length; k++) {
      btns[k].onclick = function (ev) {
        var el = ev.currentTarget, v = el.getAttribute("data-pj"), id = el.getAttribute("data-pj-open");
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
        if (v === "import" && file) { file.value = ""; file.click(); }
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
    addTrack: function () {
      var p = project(), s = snapTracks(), t = DM().addTrack(p);
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
      var p = project(), s = snapTracks(), c = DM().addClip(p, trackId, start, 4);
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
    undo: function () { var ok = edit.undo(); if (ok) { st.anote = "1 つ戻しました"; if (st.sel && st.sel.kind === "clip" && !DM().findClip(project(), st.sel.id)) { st.sel = null; } rerender(); } return ok; }
  };
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
        if ((v = el.getAttribute("data-act"))) {
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
        if ((v = el.getAttribute("data-clip"))) { var arr0 = root.querySelector(".daw-arr"); if (arr0) { st.scroll = arr0.scrollLeft || 0; } st.anote = ""; if (st.sel && st.sel.kind === "clip" && st.sel.id === v && openRoll(v)) { render(root, ctl); return; } st.sel = { kind: "clip", id: v }; render(root, ctl); return; } // 9A-5: タップで選ぶ・もう一度でピアノロール
        if ((v = el.getAttribute("data-ar"))) { keepScroll(root); if (v === "addTrack") { ops.addTrack(); } else if (v === "undo") { ops.undo(); } return; }
        if ((v = el.getAttribute("data-addclip"))) { keepScroll(root); ops.addClip(v); return; }
        if ((v = el.getAttribute("data-cl")) && st.sel && st.sel.kind === "clip") {
          var cid = st.sel.id, fc = M.findClip(p, cid);
          keepScroll(root);
          if (!fc) { return; }
          if (v === "roll") { st.anote = ""; if (openRoll(cid)) { render(root, ctl); } return; }
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
          if (v === "up" || v === "down") { ops.moveTrack(tid, v === "up" ? -1 : 1); return; }
          if (v === "name") { var tn = window.prompt ? window.prompt("トラックの名前（40 文字まで）", ft.name) : null; if (tn !== null && tn !== undefined) { ops.renameTrack(tid, tn); } }
          return;
        }
        if ((v = el.getAttribute("data-track"))) { st.sel = { kind: "track", id: v }; st.anote = ""; redraw(); }
      };
    }
    bindProjBar(root, ctl);
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
    reset: function () { if (sv.timer) { clearTimeout(sv.timer); sv.timer = null; } stopPlay(false); clearTail(); st.undo.length = 0; st.anote = ""; st.project = null; st.sel = null; st.scroll = 0; st.msg = ""; st.view = "arr"; st.roll = null; sv.status = "demo"; sv.msg = ""; sv.note = ""; sv.at = 0; },
    // §341 9A-3: ピアノロール（テストからも呼ぶ）
    openRoll: function (id) { var ok = openRoll(id); if (ok && st.root) { rerender(); } return ok; },
    closeRoll: function () { closeRoll(); if (st.root) { rerender(); } }, roll: function () { return st.roll; }, edit: edit, resync: resync,
    // §341 9A-4: 保存・読みこみ（テストからも呼ぶ）。reload ＝ ページの読みなおしと同じ（メモリの曲を捨てて、保存から開く）
    ops: ops, undoDepth: function () { return st.undo.length; }, select: function (kind, id) { st.sel = kind ? { kind: kind, id: id } : null; st.anote = ""; if (st.root) { rerender(); } },
    proj: proj, saveNow: saveNow, markDirty: markDirty, flushSave: flushSave, saveState: function () { return sv; }, readIndex: readIndex, loadProject: loadProject,
    showProj: function () { if (st.root) { st.view = "proj"; renderProj(st.root, st.ctl); } },
    reload: function () { if (sv.timer) { clearTimeout(sv.timer); sv.timer = null; } stopPlay(false); clearTail(); st.undo.length = 0; st.anote = ""; st.project = null; st.view = "arr"; st.roll = null; st.sel = null; sv.status = "demo"; sv.msg = ""; sv.note = ""; sv.at = 0; return project(); },
    ROLL: { RB: RB, RH: RH, LO: LO, HI: HI, KEYW: KEYW },
    presetList: presetList,
    PX_BEAT: PX_BEAT, LOOK: LOOK,
    // §341 9A-2: 再生（テストからも呼ぶ）
    play: startPlay, stop: function () { stopPlay(false); }, pump: pump, setLoop: setLoop, setBpm: changeBpm, updateMix: updateMix,
    isPlaying: function () { return !!pl; }, player: function () { return pl; }, playTick: playTick, log: function () { return plLog; }, clearLog: function () { plLog = []; },
    tailPending: function () { return !!tailTimer; }
  };
})();
