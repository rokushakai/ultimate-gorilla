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
  var st = { project: null, sel: null, scroll: 0 };

  function project() {
    if (!st.project && DM()) { st.project = DM().demoProject(); }
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
      if (!t || !M.audible(p, t)) { continue; }
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
        var la = DM().loopRange(p).a;
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
  function startPlay() {
    var p = project(), M = DM(), UG = window.UGMelody, ac = null, i;
    stopPlay(true);
    st.msg = "";
    try { ac = UG && UG.audioInit ? UG.audioInit() : null; } catch (e) { ac = null; }
    if (!ac || !p || !M) {
      st.msg = "音を出す準備ができませんでした。このブラウザでは Web Audio が使えないか、音のファイルを読みこめていません。ページを読みなおして、もう一度 ▶ を押してください。";
      return false;
    }
    if (!window.UGSynth) { st.msg = "ゴリラシンセ（arcade-synth.js）を読みこめなかったため、鳴らせません。"; return false; }
    var lr = M.loopRange(p), loop = !!(p.practice && p.practice.loopOn), from = loop ? lr.a : 0;
    var E = SE(); if (E && E.setTempo) { try { E.setTempo(M.bpmAt(p, from)); } catch (e2) {} }
    pl = { ac: ac, mix: {}, segs: [{ t0: ac.currentTime + START_LEAD, tick0: from }], cur: from, loop: loop, segEnd: loop ? lr.b : M.songEndTick(p), endAt: 0, pass: 0, timer: null, raf: null };
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
    if (pl) {
      var lr = M.loopRange(p);
      pl.loop = !!on;
      pl.segEnd = on ? lr.b : M.songEndTick(p);
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
  // ---------- プレイヘッド（画面だけ。音の時計から位置を計算）----------
  function drawHead() {
    var root = st.root;
    if (!root || !root.querySelector) { return; }
    var el = root.querySelector(".daw-playhead"), pos = root.querySelector(".daw-pos"), tick = playTick(), x = tickX(tick);
    if (el) { el.style.left = (HEAD_W + x) + "px"; }
    if (pos) { var b = DM().tickToBar(st.project, tick); pos.textContent = b.bar + "." + b.beat; }
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
  function rerender() { var arr = st.root && st.root.querySelector ? st.root.querySelector(".daw-arr") : null; if (arr) { st.scroll = arr.scrollLeft || 0; } render(st.root, st.ctl); }
  // メニューへ戻る・ゲームセンターを閉じる: 音とタイマーを全部片づける
  I.addStopHook(function () { stopPlay(false); clearTail(); st.root = null; st.ctl = null; });

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
    if (!M || !p) {
      root.innerHTML = '<div class="melody-setup"><p>DAW のファイル（arcade-daw-model.js）を読みこめませんでした。</p><button class="modal-btn" data-back="1">メニューへ</button></div>';
      bind(root, ctl);
      return;
    }
    var bars = M.viewBars(p), W = tickX(M.barToTick(p, bars)), m0 = M.meterAt(p, 0), barPx = tickX(M.ticksPerBar(m0)), beatPx = tickX(M.PPQ * 4 / m0.den);
    var grid = 'background-size:' + barPx + 'px 100%,' + beatPx + 'px 100%;width:' + W + 'px;';
    var plist = presetList(), i, j, b, loopOn = !!(p.practice && p.practice.loopOn), lr = M.loopRange(p);
    var h = '<div class="daw">' +
      '<div class="daw-top"><b>&#x1F39A;&#xFE0F; ゴリラDAW</b><span class="daw-pname">' + escHtml(p.name) + '</span>' +
      '<button class="modal-btn daw-small" data-back="1">&#x1F579;&#xFE0F; メニューへ</button></div>' +
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
      h += '</div></div>';
    }
    h += '<div class="daw-playhead" style="left:' + (HEAD_W + tickX(playTick())) + 'px;"></div></div>';
    h += (st.msg ? '<div class="daw-msg">&#x26A0;&#xFE0F; ' + escHtml(st.msg) + '</div>' : '') +
      '<div class="daw-info">' + infoHtml(p) + '</div>' +
      '<p class="small daw-note">Phase 9A-2: ▶ で 2 トラックをゴリラシンセで鳴らせます。ピアノロールは 9A-3、保存は 9A-4 から。</p></div>';
    root.innerHTML = h;
    var arr = root.querySelector && root.querySelector(".daw-arr");
    if (arr && st.scroll) { try { arr.scrollLeft = st.scroll; } catch (e) {} }
    bind(root, ctl);
    drawHead();
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
          (c.notes.length ? '・音域 ' + noteName(lo) + '〜' + noteName(hi) : '') + '<br><span class="small">ピアノロールで直すのは 9A-3 から</span>';
      }
    }
    if (s && s.kind === "track") {
      var t = M.findTrack(p, s.id);
      if (t) { return ((t.ext && t.ext.icon) || "&#x1F3B5;") + ' <b>' + escHtml(t.name) + '</b>: ゴリラシンセ「' + instName(t) + '」・クリップ ' + t.clips.length + ' 個・音量 ' + t.vol + (t.mute ? '・ミュート' : '') + (t.solo ? '・ソロ' : ''); }
    }
    return '<span class="small">トラックやクリップをタップすると、ここに説明が出ます。全部で ' + p.tracks.length + ' トラック・' + M.viewBars(p) + ' 小節。</span>';
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
          if (v === "loop") { setLoop(!(p.practice && p.practice.loopOn)); redraw(); return; }
          if (v === "bpm-" || v === "bpm+") { changeBpm(M.bpmAt(p, 0) + (v === "bpm+" ? 1 : -1)); redraw(); return; }
          if (v === "bpm" && window.prompt) {
            var a = window.prompt("BPM（" + M.BPM_MIN + "〜" + M.BPM_MAX + "）", String(M.bpmAt(p, 0)));
            if (a !== null && isFinite(Number(a)) && String(a).replace(/\s/g, "") !== "") { changeBpm(Number(a)); redraw(); }
          }
          return;
        }
        if ((v = el.getAttribute("data-mute"))) { var tm = M.findTrack(p, v); if (tm) { tm.mute = !tm.mute; st.sel = { kind: "track", id: v }; updateMix(); } redraw(); return; }
        if ((v = el.getAttribute("data-solo"))) { var ts = M.findTrack(p, v); if (ts) { ts.solo = !ts.solo; st.sel = { kind: "track", id: v }; updateMix(); } redraw(); return; }
        if ((v = el.getAttribute("data-clip"))) { st.sel = { kind: "clip", id: v }; redraw(); return; }
        if ((v = el.getAttribute("data-track"))) { st.sel = { kind: "track", id: v }; redraw(); }
      };
    }
    var sels = root.querySelectorAll("select[data-inst]");
    for (k = 0; k < sels.length; k++) {
      sels[k].onclick = function (ev) { if (ev.stopPropagation) { ev.stopPropagation(); } };
      sels[k].onchange = function (ev) {
        var el = ev.currentTarget, t = M.findTrack(p, el.getAttribute("data-inst"));
        if (t && el.value) { t.instrument = M.synthInstrument(el.value); st.sel = { kind: "track", id: t.id }; if (pl) { warm(t); } } // 再生中なら、これから予約する音から新しい音色
        redraw();
      };
    }
  }

  function dawSetup(root, ctl) {
    stopPlay(false);
    st.sel = null;
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
    reset: function () { stopPlay(false); clearTail(); st.project = null; st.sel = null; st.scroll = 0; st.msg = ""; },
    presetList: presetList,
    PX_BEAT: PX_BEAT, LOOK: LOOK,
    // §341 9A-2: 再生（テストからも呼ぶ）
    play: startPlay, stop: function () { stopPlay(false); }, pump: pump, setLoop: setLoop, setBpm: changeBpm, updateMix: updateMix,
    isPlaying: function () { return !!pl; }, player: function () { return pl; }, playTick: playTick, log: function () { return plLog; }, clearLog: function () { plLog = []; },
    tailPending: function () { return !!tailTimer; }
  };
})();
