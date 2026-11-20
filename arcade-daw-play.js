// =========================================================
// 究極ゴリラ ゴリラDAW: 🪕 弾いて録る（§346 A35）
//   DAW の伴奏を止めずに、ゴリラウクレレと同じ操作（弦を横切る・タップ）で弾いて、
//   その演奏を DAW の MIDI のクリップにする。時刻は DAW の再生の時計（AudioContext と
//   テンポマップ）だけを使う。ゲームのフレームや自前のタイマーは録る位置に使わない。
//   画面を持たない部分（strum・build・perfOf など）と、パネルの部分（html・bind・head）に分ける。
//   DAW とは host（arcade-daw.js の playHost）だけでつながる。読み取り口 window.UGDawPlay
// =========================================================
(function () {
  "use strict";

  var GAP = 0.012;        // ストロークの弦と弦の間（秒・ゲームの ukeSeqParts と同じ）
  var RING = 2.0;         // 1 本の弦が鳴る長さの上限（秒・同じ弦をもう一度弾いたらそこで止まる）
  var MAX_EV = 4000;      // 1 回の録音で受けとる弦の音の数の上限
  var BARS = 4;           // 録る小節の数（ループの範囲がなければ）
  var MAX_BARS = 16;      // ループの範囲で録るときの上限
  var EARLY = 120;        // 録りはじめより少し早い音（tick・32 分音符ぶん）は頭にそろえる
  var WAIT_MS = 15000;    // 伴奏の準備（サンプルの読みこみ）を待つ上限
  var PREF_KEY = "ultimateGorillaDawPlayV1";
  var DEF_CHORDS = ["C", "Am", "F", "G", "Dm", "Em", "G7", "E7"];
  var GX = [54, 98, 142, 186], GW = 240; // ゲームの弦の位置（UGUkulele が無いときの代わり）

  function C() { return window.UGChords || null; }
  function DM() { return window.UGDawModel || null; }
  function U() { return window.UGUkulele || null; }
  function esc(s) { return String(s === undefined || s === null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function isArr(a) { return Object.prototype.toString.call(a) === "[object Array]"; }
  function perfNow() { try { return window.performance && window.performance.now ? window.performance.now() : Date.now(); } catch (e) { return Date.now(); } }

  // ---------- 弦と押さえ方（ゲームの UGChords を使う）----------
  function openOf(lowG) { var c = C(); return c && c.openMidis ? c.openMidis(!!lowG) : [lowG ? 55 : 67, 60, 64, 69]; }
  // 押さえ方 shape（[G, C, E, A] の各弦のフレット・null ＝ 鳴らさない）の s 弦の高さ（鳴らさない弦は null）
  function midiOf(shape, s, lowG) {
    var f = shape ? shape[s] : null;
    if (f === null || f === undefined || !(f >= 0)) { return null; }
    return openOf(lowG)[s] + f;
  }
  // コードの名前 → { name, shape }（いちばん弾きやすい押さえ方・読めない名前は null）
  function shapeOf(name) {
    var c = C(), sp = null, v = null;
    if (!c || !name) { return null; }
    try { sp = c.parse(String(name)); v = sp ? c.voicings(sp) : null; } catch (e) { v = null; }
    if (!v || !v.length) { return null; }
    var sh = isArr(v[0]) ? v[0] : v[0].shape;
    if (!isArr(sh) || sh.length < 4) { return null; }
    return { name: c.name(sp), shape: sh.slice(0, 4) };
  }
  // ストローク → 弦ごとの音 [{ s, m, dt（秒）, v }]。ダウン ＝ 4 弦 G → 1 弦 A（弦の並びの順・音の高さの順ではない）、アップ ＝ 逆で少し弱く
  function strum(shape, lowG, dir, vel) {
    var order = dir === "up" ? [3, 2, 1, 0] : [0, 1, 2, 3], out = [], k = 0, i, v = Math.max(0.05, Math.min(1, (vel || 0.8) * (dir === "up" ? 0.85 : 1)));
    for (i = 0; i < 4; i++) {
      var s = order[i], m = midiOf(shape, s, lowG);
      if (m === null) { continue; }
      out.push({ s: s, m: m, dt: r4(k * GAP), v: r3(v) });
      k++;
    }
    return out;
  }
  function pluck(shape, lowG, s, vel) { var m = midiOf(shape, s, lowG); return m === null ? [] : [{ s: s, m: m, dt: 0, v: r3(Math.max(0.05, Math.min(1, vel || 0.75))) }]; }

  // ---------- 録音の記録（演奏そのもの ＝ raw）→ DAW の音符 ----------
  // raw の 1 つ: [録りはじめの小節の頭からの秒（補正なし）, 弦, 高さ, 強さ]
  function takeNew(lowG) { return { lowG: !!lowG, ev: [], full: false }; }
  function takeHit(tk, s, m, v, rel) {
    if (!tk) { return false; }
    if (tk.ev.length >= MAX_EV) { tk.full = true; return false; }
    if (!(s >= 0 && s <= 3) || !(m >= 0 && m <= 127) || typeof rel !== "number" || !isFinite(rel)) { return false; }
    tk.ev.push([r4(rel), s, Math.round(m), r3(Math.max(0.05, Math.min(1, Number(v) || 0.8)))]);
    return true;
  }
  // raw → 音符（クリップの頭からの tick）。compMs ＝ ずれの補正（聞こえる音の遅れ ＋ 手での補正）。a〜b の外は捨てる・b で閉じる
  //   同じ弦: 前の音は次の音の頭で止まる（同じ tick なら前の音は捨てる）。弦の番号は str に（音符と同じ順）
  //   同じ高さの音がほかの弦で鳴ったら、前の音もそこで止める（MIDI で同じ高さの音が重ならないように ＝ 外の音源で音が切れない）
  function build(p, raw, a, b, compMs) {
    var M = DM(), out = [], i, j, base = M.tickToSec(p, a), comp = (Number(compMs) || 0) / 1000;
    var ev = (raw || []).map(function (e, k) { return { e: e, k: k }; }).filter(function (x) { return isArr(x.e) && typeof x.e[0] === "number" && isFinite(x.e[0]) && x.e[1] >= 0 && x.e[1] <= 3; });
    ev.sort(function (x, y) { return x.e[0] - y.e[0] || x.k - y.k; });
    function tk(sec) { var x = base + sec - comp; return x >= 0 ? Math.round(M.secToTick(p, x)) : Math.round(x * M.bpmAt(p, 0) / 60 * M.PPQ); } /* 曲の頭より前（カウントイン）は負の tick */
    for (i = 0; i < ev.length; i++) {
      var e = ev[i].e, on = tk(e[0]);
      if (on < a - EARLY || on >= b) { continue; }
      if (on < a) { on = a; }
      var off = Math.min(b, tk(e[0] + RING));
      for (j = i + 1; j < ev.length; j++) { if (ev[j].e[1] === e[1]) { off = Math.min(off, Math.max(a, tk(ev[j].e[0]))); break; } }
      for (j = i + 1; j < ev.length; j++) { if (ev[j].e[1] !== e[1] && Math.round(ev[j].e[2]) === Math.round(e[2])) { var oj = tk(ev[j].e[0]); if (oj >= a - EARLY && oj < b) { off = Math.min(off, Math.max(a, oj)); break; } } }
      if (off <= on) { continue; } // 同じ弦をすぐまた弾いた（同じ tick）→ 前の音は捨てる
      out.push({ n: [on - a, off - on, Math.max(0, Math.min(127, Math.round(e[2]))), r3(Math.max(0, Math.min(1, e[3])))], s: e[1], k: i });
    }
    out.sort(function (x, y) { return x.n[0] - y.n[0] || x.n[2] - y.n[2] || x.k - y.k; }); /* DAW と同じ順（時刻 → 高さ ＝ cleanNotes）。同じ時刻の音でも str が音符とずれない */
    return { notes: out.map(function (x) { return x.n; }), str: out.map(function (x) { return x.s; }) };
  }
  function sigOf(notes) { var M = DM(); return M && M.hash ? M.hash(JSON.stringify(notes || [])) : ""; }
  // クリップの演奏の情報（音符を手で直していたら null ＝ 弦の番号は使わない・音はふつうの MIDI のまま）
  function perfOf(c) {
    var x = c && c.ext && c.ext.perf;
    if (!x || x.v !== 1 || !isArr(x.str) || !isArr(x.raw) || !c.notes || x.str.length !== c.notes.length) { return null; }
    return x.sig === sigOf(c.notes) ? x : null;
  }
  // "ok" 弾いたまま・"edited" 音符を直した（弦の番号は使わない）・"none" 弾いたクリップでない
  function perfState(c) { if (!(c && c.ext && c.ext.perf)) { return "none"; } return perfOf(c) ? "ok" : "edited"; }
  function perfMake(lowG, res, raw, comp, auto) { return { v: 1, inst: "uke", tun: lowG ? "low" : "high", src: "live", str: res.str.slice(), raw: raw.slice(), comp: Math.round(comp), auto: Math.round(auto), sig: sigOf(res.notes) }; }

  // ---------- 設定（端末に・なくても動く）----------
  function prefs() {
    var o = { lowG: false, manual: 0 };
    try { var ls = window.localStorage, raw = ls ? ls.getItem(PREF_KEY) : null, d = raw ? JSON.parse(raw) : null; if (d && typeof d === "object") { o.lowG = !!d.lowG; o.manual = Math.max(-200, Math.min(200, Math.round(Number(d.manual) || 0))); } } catch (e) {}
    return o;
  }
  function prefsSave() { try { var ls = window.localStorage; if (ls) { ls.setItem(PREF_KEY, JSON.stringify({ lowG: ui.lowG, manual: ui.manual })); } } catch (e) {} }

  // ---------- パネル ----------
  var ui = { tid: "", lowG: false, manual: 0, chord: "C", auto: true, rec: null, msg: "", last: null, outs: [null, null, null, null], host: null, ptr: {} };

  function songChordList(host) {
    var p = host.project(), X = window.UGXmas, out = [], seen = {}, k, sc = X && X.songChords ? X.songChords(p) : {}, keys = Object.keys(sc).map(Number).sort(function (a, b) { return a - b; });
    for (k = 0; k < keys.length; k++) { var nm = X.chordName(p, sc[keys[k]]); if (!seen[nm] && shapeOf(nm)) { seen[nm] = true; out.push(nm); } }
    return out;
  }
  // tick の小節の曲のコード（なければ ""）
  function songChordAt(host, tick) {
    var p = host.project(), X = window.UGXmas, M = DM();
    if (!X || !X.songChords) { return ""; }
    var sc = X.songChords(p), b = M.tickToBar(p, Math.max(0, tick)).bar - 1, id = sc[b];
    return id ? X.chordName(p, id) : "";
  }
  function trackOk(t) { var M = DM(); return !!(t && !M.isDrum(t) && !(M.isAudio && M.isAudio(t))); }
  function tracksFor(host) { return host.project().tracks.filter(trackOk); }
  function targetTrack(host) { var M = DM(), t = ui.tid ? M.findTrack(host.project(), ui.tid) : null; return trackOk(t) ? t : null; }
  function curShape() { var s = shapeOf(ui.chord); return s ? s.shape : null; }

  function open(host, tid) {
    var M = DM(), t = tid ? M.findTrack(host.project(), tid) : null, pf = prefs();
    ui.host = host; ui.tid = trackOk(t) ? t.id : ""; ui.lowG = pf.lowG; ui.manual = pf.manual; ui.msg = ""; ui.last = null; ui.ptr = {};
    var list = songChordList(host);
    ui.auto = list.length > 0;
    var c0 = songChordAt(host, host.playTick());
    ui.chord = c0 && shapeOf(c0) ? c0 : (list[0] || "C");
    if (host.preload) { host.preload(); }
    return true;
  }
  function rangeText(host, r) { var p = host.project(), M = DM(), b0 = M.tickToBar(p, r.a).bar, b1 = M.tickToBar(p, Math.max(r.a, r.b - 1)).bar; return b0 + "〜" + b1 + " 小節（" + (b1 - b0 + 1) + " 小節）"; }

  function html(host) {
    var p = host.project(), M = DM(), t = targetTrack(host), r = ui.rec, rg = r ? { a: r.a, b: r.b } : host.range(), i, h;
    var list = songChordList(host), chords = list.length ? list : DEF_CHORDS.slice();
    if (chords.indexOf(ui.chord) < 0 && shapeOf(ui.chord)) { chords.push(ui.chord); }
    h = '<div class="dpl" role="region" aria-label="弾いて録る">';
    h += '<div class="dpl-top"><button class="modal-btn daw-small" data-pl="back"' + (r ? ' disabled' : '') + '>&#x25C0; DAW へ</button><b>&#x1FA95; 弾いて録る</b></div>';
    h += '<div class="dpl-row small">録るトラック <select class="dpl-trk" aria-label="録るトラック"' + (r ? ' disabled' : '') + '><option value="">＋ 新しいウクレレのトラック</option>';
    var ts = tracksFor(host);
    for (i = 0; i < ts.length; i++) { h += '<option value="' + esc(ts[i].id) + '"' + (t && t.id === ts[i].id ? ' selected' : '') + '>' + esc(ts[i].name) + '</option>'; }
    h += '</select></div>';
    h += '<div class="dpl-row small">録る所: <b>' + rangeText(host, rg) + '</b>・カウントイン 1 小節 <span class="dpl-pos" aria-live="polite">' + (r ? posText(host) : '') + '</span></div>';
    // コード
    h += '<div class="dpl-chords" role="group" aria-label="コード">';
    for (i = 0; i < chords.length; i++) { h += '<button class="modal-btn dpl-ch' + (chords[i] === ui.chord ? ' on' : '') + '" data-pl="ch:' + esc(chords[i]) + '" aria-pressed="' + (chords[i] === ui.chord) + '">' + esc(chords[i]) + '</button>'; }
    h += '</div>';
    if (list.length) { h += '<div class="dpl-row small"><button class="modal-btn daw-small' + (ui.auto ? ' daw-on' : '') + '" data-pl="auto" aria-pressed="' + ui.auto + '">&#x1F3BC; 曲のコードに合わせる ' + (ui.auto ? 'ON' : 'OFF') + '</button> <span class="dpl-hint">ON: 再生の位置のコードに自動で変わります</span></div>'; }
    // 弦（ゲームと同じ: 左から 4 弦 G・3 弦 C・2 弦 E・1 弦 A。左 → 右に横切る ＝ ダウン）
    var sh = curShape(), names = ["G", "C", "E", "A"];
    h += '<div class="dpl-pad" data-pad="1" aria-label="弦（左から右へ こするとダウン・右から左でアップ・弦をタップで 1 本）">';
    for (i = 0; i < 4; i++) {
      var m = midiOf(sh, i, ui.lowG);
      h += '<i class="dpl-str dpl-s' + i + (m === null ? ' dpl-mute' : '') + '" style="left:' + r3(gx(i) / GW * 100) + '%;"><span>' + (4 - i) + '弦 ' + names[i] + (i === 0 && ui.lowG ? '↓' : '') + '</span></i>';
    }
    h += '<span class="dpl-padhint">&#x27A1;&#xFE0F; こすってダウン ／ &#x2B05;&#xFE0F; アップ</span></div>';
    h += '<div class="dpl-btns"><button class="modal-btn" data-pl="dn">&#x2B07;&#xFE0F; ダウン</button><button class="modal-btn" data-pl="up">&#x2B06;&#xFE0F; アップ</button></div>';
    // 録る
    if (r) {
      h += '<div class="dpl-btns"><button class="modal-btn dpl-recon" data-pl="stop">&#x23F9;&#xFE0F; 止めて置く</button><button class="modal-btn" data-pl="cancel">&#x2716;&#xFE0F; やめる</button></div>';
    } else {
      h += '<div class="dpl-btns"><button class="modal-btn dpl-rec" data-pl="rec">&#x1F534; 録る（' + rangeText(host, rg) + '）</button></div>';
    }
    // 設定
    h += '<details class="dpl-set"><summary>&#x2699;&#xFE0F; チューニング・ずれの補正</summary><div class="dpl-row small">チューニング ' +
      '<button class="modal-btn daw-small' + (!ui.lowG ? ' daw-on' : '') + '" data-pl="tun:high"' + (r ? ' disabled' : '') + '>High G</button>' +
      '<button class="modal-btn daw-small' + (ui.lowG ? ' daw-on' : '') + '" data-pl="tun:low"' + (r ? ' disabled' : '') + '>Low G</button></div>' +
      '<div class="dpl-row small">ずれの補正: 自動 ' + host.autoLat() + 'ms ＋ 手で <button class="modal-btn daw-small" data-pl="man:-10"' + (r ? ' disabled' : '') + '>&#x2212;10</button><b class="dpl-man">' + (ui.manual > 0 ? '+' : '') + ui.manual + 'ms</b><button class="modal-btn daw-small" data-pl="man:10"' + (r ? ' disabled' : '') + '>+10</button></div>' +
      '<div class="small dpl-hint">音符が遅れて入るなら ＋ を大きく（録ったあとでも、下の「ずれを直す」で直せます）</div></details>';
    // 録った結果
    var lc = ui.last ? M.findClip(p, ui.last.cid) : null;
    if (lc) {
      var ps = perfState(lc.clip), px = perfOf(lc.clip);
      h += '<div class="dpl-res"><div>&#x1F3B5; 「' + esc(lc.track.name) + '」の ' + M.tickToBar(p, lc.clip.start).bar + ' 小節目に、音符 ' + lc.clip.notes.length + ' 個のクリップを置きました' + (ui.last.moved ? '（いまのクリップと重なるので、新しいトラックに）' : '') + '</div>' +
        '<div class="dpl-btns"><button class="modal-btn" data-pl="edit">&#x1F3B9; 音符を直す</button><button class="modal-btn" data-pl="undo">&#x21B6; 元に戻す</button><button class="modal-btn" data-pl="redo">&#x21B7; やりなおす</button></div>' +
        (px ? '<div class="dpl-row small">ずれを直す（弾いた記録から作りなおす・いまの補正 ' + px.comp + 'ms）<button class="modal-btn daw-small" data-pl="re:-10">&#x2212;10ms</button><button class="modal-btn daw-small" data-pl="re:10">+10ms</button></div>'
          : (ps === "edited" ? '<div class="small dpl-hint">音符を手で直したので、弦の番号とずれの補正は使いません（音はそのまま）</div>' : '')) + '</div>';
    } else if (ui.last && host.redoN() > 0) {
      h += '<div class="dpl-res"><div>&#x21B6; 置いたクリップを元に戻しました</div><div class="dpl-btns"><button class="modal-btn" data-pl="redo">&#x21B7; やりなおす</button></div></div>';
    }
    if (ui.msg) { h += '<div class="dpl-msg small">' + ui.msg + '</div>'; }
    h += '<div class="small dpl-hint">音は「' + esc(t ? t.name : "ウクレレ（新しいトラック）") + '」の音色。MIDI の音符になるので、あとでピアノロールで直せます</div>';
    return h + '</div>';
  }
  function gx(s) { var u = U(); return u && u.STRX ? u.STRX[s] : GX[s]; }

  // いまの位置の文字（カウントイン中は 「カウント 3」）
  function posText(host) {
    var r = ui.rec;
    if (!r) { return ""; }
    if (r.state === "wait") { return "&#x23F3; 伴奏を準備しています…"; }
    var now = r.ac.currentTime;
    if (now < r.t0) { var left = Math.ceil((r.t0 - now) / r.beat - 1e-6); return "&#x1F941; カウント " + Math.max(1, Math.min(r.beats, left)); }
    var p = host.project(), b = DM().tickToBar(p, Math.min(r.b - 1, host.playTick()));
    return "&#x1F534; 録っています " + b.bar + " 小節 " + b.beat + " 拍";
  }
  // 再生の 1 コマごと（DAW の loopHead から・画面は作りなおさない）
  function head(root, tick) {
    var host = ui.host;
    if (!host || !root || !root.querySelector) { return; }
    var el = root.querySelector(".dpl-pos");
    if (el && ui.rec) { var tx = posText(host); if (el.innerHTML !== tx) { el.innerHTML = tx; } }
    if (ui.auto && host.playing()) {
      var nm = songChordAt(host, tick);
      if (nm && nm !== ui.chord && shapeOf(nm)) { setChord(root, nm); }
    }
  }
  function setChord(root, nm) {
    ui.chord = nm;
    var els = root && root.querySelectorAll ? root.querySelectorAll(".dpl-ch") : [], k;
    for (k = 0; k < els.length; k++) { var on = els[k].getAttribute("data-pl") === "ch:" + nm; els[k].className = "modal-btn dpl-ch" + (on ? " on" : ""); els[k].setAttribute("aria-pressed", String(on)); }
    var sh = curShape();
    for (k = 0; k < 4; k++) { var se = root && root.querySelector ? root.querySelector(".dpl-s" + k) : null; if (se) { se.className = "dpl-str dpl-s" + k + (midiOf(sh, k, ui.lowG) === null ? " dpl-mute" : ""); } }
  }

  // ---------- 音を出す・記録する ----------
  // 指の時刻 → AudioContext の時刻（イベントが届くまでの遅れを引く・0〜50ms）
  function evTime(ac, ev) {
    var now = ac.currentTime, lag = 0;
    if (ev && typeof ev.timeStamp === "number") { lag = (perfNow() - ev.timeStamp) / 1000; if (!(lag >= 0 && lag < 1)) { lag = 0; } }
    return now - Math.min(0.05, lag);
  }
  // 1 本の弦の音（同じ弦の前の音はここで止める ＝ ゲームの ukeStringOut と同じ）
  function sound(host, s, m, v, when) {
    var ac = host.ac();
    if (!ac) { return false; }
    var dest = host.dest(ui.tid), ins = host.ins(ui.tid), prev = ui.outs[s], g;
    if (!dest || !ins) { return false; }
    when = Math.max(ac.currentTime, when);
    if (prev && prev.ac === ac) { try { prev.g.gain.setValueAtTime(1, Math.max(when, prev.t)); prev.g.gain.setTargetAtTime(0, Math.max(when, prev.t), 0.012); } catch (e) {} }
    try { g = ac.createGain(); g.gain.value = 1; g.connect(dest); } catch (e1) { return false; }
    ui.outs[s] = { g: g, t: when, ac: ac };
    return host.noteTo(ins, m, when, v, RING, g);
  }
  // 弦の音を鳴らして、録っていれば記録する（tAudio ＝ 弾いた AudioContext の時刻）
  function hit(host, s, v, tAudio) {
    var m = midiOf(curShape(), s, ui.lowG);
    if (m === null) { return false; } // 押さえない弦（ミュート）は鳴らさない
    sound(host, s, m, v, tAudio);
    var r = ui.rec;
    if (r && (r.state === "count" || r.state === "rec")) { var rel = relSec(host, tAudio); if (rel !== null) { takeHit(r.take, s, m, v, rel); } }
    return true;
  }
  // AudioContext の時刻 → 録りはじめの小節の頭からの秒（DAW の再生の区間とテンポマップ）
  function relSec(host, t) {
    var r = ui.rec, P = host.player();
    if (!r || !P || P.tag !== r.tok) { return null; }
    var p = host.project(), M = DM();
    return M.tickToSec(p, P.tick0) + (t - P.t0) - M.tickToSec(p, r.a);
  }
  function strumAt(host, dir, tAudio, vel) {
    var list = strum(curShape(), ui.lowG, dir, vel || 0.8), i;
    for (i = 0; i < list.length; i++) { hit(host, list[i].s, list[i].v, tAudio + list[i].dt); }
    return list.length;
  }

  // ---------- 録る ----------
  function recStart(host) {
    if (ui.rec) { return false; }
    var p = host.project(), M = DM(), rg = host.range(), ac = host.ac();
    if (!ac) { ui.msg = "&#x26A0;&#xFE0F; 音を出す準備ができませんでした（曲は変えていません）"; return false; }
    var m0 = M.meterAt(p, rg.a), beat = 60 / M.bpmAt(p, rg.a) * 4 / (m0.den || 4), tok = {};
    ui.msg = "";
    ui.rec = { tok: tok, state: "wait", a: rg.a, b: rg.b, beat: beat, beats: m0.num, lead: m0.num * beat, take: takeNew(ui.lowG), ac: ac, t0: 0, tEnd: 0, auto: host.autoLat(), manual: ui.manual, since: perfNow(), timer: null };
    var ok = host.startPlay({ from: rg.a, a: rg.a, b: rg.b, loop: false, delay: m0.num * beat, tag: tok });
    if (!ok) { ui.rec = null; ui.msg = "&#x26A0;&#xFE0F; " + (host.msg() || "伴奏を鳴らせませんでした") + "（曲は変えていません）"; return false; }
    ui.rec.timer = setInterval(function () { tick(); }, 40);
    tick();
    return true;
  }
  // 録音の見張り（40ms ごと・テストからも呼ぶ）。時刻は AudioContext だけで決める
  function tick() {
    var host = ui.host, r = ui.rec;
    if (!host || !r) { return; }
    var P = host.player(), p = host.project(), M = DM();
    if (r.state === "wait") {
      if (P && P.tag === r.tok) {
        r.ac = P.ac; r.t0 = P.t0 + M.tickToSec(p, r.a) - M.tickToSec(p, P.tick0); r.tEnd = r.t0 + M.tickToSec(p, r.b) - M.tickToSec(p, r.a); r.state = "count";
        host.clicks(r.ac, r.t0 - r.lead, r.beat, r.beats);
        refresh();
      } else if (P && P.tag !== r.tok) { cancel("&#x26A0;&#xFE0F; ほかの再生がはじまったので、録音をやめました（曲は変えていません）"); }
      else if (perfNow() - r.since > WAIT_MS && !host.waiting()) { cancel("&#x26A0;&#xFE0F; 伴奏の準備ができませんでした（曲は変えていません）"); }
      return;
    }
    var now = r.ac.currentTime;
    if (!P || P.tag !== r.tok) {
      if (now >= r.tEnd - 0.03) { finish(false); } else { cancel("&#x26A0;&#xFE0F; 再生が止まったので、録音をやめました（曲は変えていません）"); }
      return;
    }
    if (r.state === "count" && now >= r.t0) { r.state = "rec"; }
    if (now >= r.tEnd + 0.05) { finish(false); }
  }
  function endRec() { var r = ui.rec; if (r && r.timer) { clearInterval(r.timer); } ui.rec = null; return r; }
  function cancel(why) {
    var host = ui.host, r = endRec();
    if (!r) { return false; }
    if (host) { host.stopPlay(); }
    ui.msg = why || "録音をやめました（曲は変えていません）";
    refresh();
    return true;
  }
  // 録り終わり → 新しいクリップ 1 つ（いまのクリップは変えない）。early ＝ ■ で途中で止めた
  function finish(early) {
    var host = ui.host, r = endRec();
    if (!host || !r) { return { ok: false }; }
    host.stopPlay();
    var p = host.project(), comp = r.auto + r.manual, res = build(p, r.take.ev, r.a, r.b, comp);
    if (!res.notes.length) { ui.msg = "音がなかったので、置きませんでした（曲は変えていません）"; refresh(); return { ok: false, why: "empty" }; }
    var pr = host.place({ tid: ui.tid, a: r.a, len: r.b - r.a, notes: res.notes, perf: perfMake(r.take.lowG, res, r.take.ev, comp, r.auto), name: "🪕 弾いた" });
    if (!pr.ok) { ui.msg = "&#x26A0;&#xFE0F; " + esc(pr.why) + "（曲は変えていません）"; refresh(); return pr; }
    ui.tid = pr.tid; ui.last = { cid: pr.cid, moved: !!pr.moved };
    ui.msg = (early ? "&#x23F9;&#xFE0F; 途中で止めました。" : "") + (r.take.full ? "&#x26A0;&#xFE0F; 音が多すぎたので、" + MAX_EV + " 個までにしました。" : "") + (pr.saveWarn ? "&#x26A0;&#xFE0F; " + esc(pr.saveWarn) : "");
    refresh();
    return pr;
  }
  // 置いたクリップのずれを直す（弾いた記録から作りなおす・音符を手で直したクリップはしない）
  function reoffset(host, cid, delta) {
    var p = host.project(), f = DM().findClip(p, cid);
    if (!f) { return { ok: false, why: "クリップがありません" }; }
    var x = perfOf(f.clip);
    if (!x) { return { ok: false, why: "音符を手で直したので、ずれの補正は使えません" }; }
    var comp = Math.max(-500, Math.min(800, x.comp + Math.round(Number(delta) || 0)));
    var res = build(p, x.raw, f.clip.start, f.clip.start + f.clip.len, comp);
    if (!res.notes.length) { return { ok: false, why: "補正すると音符がなくなるので、やめました" }; }
    var snap = host.snap();
    f.clip.notes = res.notes; x.str = res.str; x.comp = comp; x.sig = sigOf(f.clip.notes);
    host.commit(snap, "", f.track.id, cid);
    return { ok: true, comp: comp };
  }
  function refresh() { var host = ui.host; if (host && host.isView()) { host.render(); } }

  // ---------- 画面の操作 ----------
  function act(host, v, ev) {
    var m;
    if (v === "back") { if (!ui.rec) { host.back(); } return true; }
    if ((m = /^ch:(.+)$/.exec(v))) { if (shapeOf(m[1])) { ui.auto = false; ui.chord = m[1]; } host.render(); return true; }
    if (v === "auto") { ui.auto = !ui.auto; if (ui.auto) { var c0 = songChordAt(host, host.playTick()); if (c0 && shapeOf(c0)) { ui.chord = c0; } } host.render(); return true; }
    if (v === "dn" || v === "up") { var ac = host.ac(); if (ac) { strumAt(host, v === "dn" ? "down" : "up", evTime(ac, ev), 0.8); } return true; }
    if (v === "rec") { recStart(host); host.render(); return true; }
    if (v === "stop") { if (ui.rec && ui.rec.state !== "wait") { finish(true); } else { cancel(); } return true; }
    if (v === "cancel") { cancel(); return true; }
    if ((m = /^tun:(high|low)$/.exec(v)) && !ui.rec) { ui.lowG = m[1] === "low"; prefsSave(); host.render(); return true; }
    if ((m = /^man:(-?\d+)$/.exec(v)) && !ui.rec) { ui.manual = Math.max(-200, Math.min(200, ui.manual + Number(m[1]))); prefsSave(); host.render(); return true; }
    if ((m = /^re:(-?\d+)$/.exec(v)) && ui.last) { var rr = reoffset(host, ui.last.cid, Number(m[1])); ui.msg = rr.ok ? "ずれを直しました（いまの補正 " + rr.comp + "ms）" : "&#x26A0;&#xFE0F; " + esc(rr.why); host.render(); return true; }
    if (v === "edit" && ui.last) { host.edit(ui.last.cid); return true; }
    if (v === "undo") { host.undo(); ui.msg = ""; host.render(); return true; }
    if (v === "redo") { host.redo(); ui.msg = ""; host.render(); return true; }
    return false;
  }
  // 弦の場所の指（ゲームと同じ: 弦の上をタップで 1 本・横切った弦を順に。速いほど強く・右 → 左は少し弱く）
  //   1 回の move で何本も横切ったら、弦ごとの時刻を指の動きの割合で分ける（弦ごとに本当の時刻）
  function padX(pad, ev) { var rc = pad.getBoundingClientRect ? pad.getBoundingClientRect() : null; if (!rc || !(rc.width > 0)) { return null; } return (ev.clientX - rc.left) / rc.width * GW; }
  function crossed(x0, x1) {
    var u = U(), out = [], s;
    if (u && u.crossed) { return u.crossed(x0, x1); }
    if (x1 > x0) { for (s = 0; s < 4; s++) { if (x0 < GX[s] && x1 >= GX[s]) { out.push(s); } } }
    else if (x1 < x0) { for (s = 3; s >= 0; s--) { if (x0 > GX[s] && x1 <= GX[s]) { out.push(s); } } }
    return out;
  }
  function velOf(speed) { var u = U(); return u && u.velocity ? u.velocity(speed) : Math.max(0.45, Math.min(1, 0.45 + speed / 50)); }
  function padDown(host, id, x, tAudio) {
    var st0 = { lx: x, lt: tAudio }, s;
    for (s = 0; s < 4; s++) { if (Math.abs(x - gx(s)) <= 8) { hit(host, s, 0.75, tAudio); st0.lx = gx(s); break; } }
    ui.ptr[id] = st0;
  }
  function padMove(host, id, x, tAudio) {
    var sm = ui.ptr[id];
    if (!sm) { return 0; }
    var cr = crossed(sm.lx, x), k;
    if (tAudio < sm.lt) { tAudio = sm.lt; } /* 同じ指の時刻は戻らない（イベントごとの遅れの差で順が入れかわらないように）*/
    if (cr.length) {
      var frames = Math.max(1, (tAudio - sm.lt) * 60), vel = velOf(Math.abs(x - sm.lx) / frames) * (x < sm.lx ? 0.85 : 1);
      for (k = 0; k < cr.length; k++) { var f = (gx(cr[k]) - sm.lx) / ((x - sm.lx) || 1); hit(host, cr[k], vel, sm.lt + (tAudio - sm.lt) * Math.max(0, Math.min(1, f))); }
    }
    sm.lx = x; sm.lt = tAudio;
    return cr.length;
  }
  function padUp(id) { delete ui.ptr[id]; }

  function bind(root, host) {
    ui.host = host;
    var els = root.querySelectorAll ? root.querySelectorAll("[data-pl]") : [], k;
    for (k = 0; k < els.length; k++) {
      (function (el) { el.onclick = function (ev) { act(host, el.getAttribute("data-pl"), ev); }; })(els[k]);
    }
    var sel = root.querySelector ? root.querySelector(".dpl-trk") : null;
    if (sel) { sel.onchange = function () { if (!ui.rec) { var t = DM().findTrack(host.project(), sel.value); ui.tid = trackOk(t) ? t.id : ""; host.render(); } }; }
    var pad = root.querySelector ? root.querySelector(".dpl-pad") : null;
    if (pad && pad.addEventListener) {
      var down = function (ev) {
        if (ev.cancelable) { ev.preventDefault(); }
        var ac = host.ac(), x = padX(pad, ev);
        if (!ac || x === null) { return; }
        try { if (pad.setPointerCapture && ev.pointerId !== undefined) { pad.setPointerCapture(ev.pointerId); } } catch (e) {}
        padDown(host, ev.pointerId === undefined ? "m" : ev.pointerId, x, evTime(ac, ev));
      };
      var move = function (ev) {
        var id = ev.pointerId === undefined ? "m" : ev.pointerId;
        if (!ui.ptr[id]) { return; }
        if (ev.cancelable) { ev.preventDefault(); }
        var ac = host.ac(), x = padX(pad, ev);
        if (!ac || x === null) { return; }
        padMove(host, id, x, evTime(ac, ev));
      };
      var up = function (ev) { padUp(ev.pointerId === undefined ? "m" : ev.pointerId); };
      pad.addEventListener("pointerdown", down);
      pad.addEventListener("pointermove", move);
      pad.addEventListener("pointerup", up);
      pad.addEventListener("pointercancel", up);
      pad.addEventListener("contextmenu", function (ev) { if (ev.preventDefault) { ev.preventDefault(); } });
    }
  }
  // DAW の画面を離れる・曲を切りかえる（録っていたらやめる・曲は変えない）
  function leave() { if (ui.rec) { cancel(); } ui.ptr = {}; return true; }

  window.UGDawPlay = {
    VERSION: 1, GAP: GAP, RING: RING, BARS: BARS, MAX_BARS: MAX_BARS, MAX_EV: MAX_EV, EARLY: EARLY, PREF_KEY: PREF_KEY,
    openOf: openOf, midiOf: midiOf, shapeOf: shapeOf, strum: strum, pluck: pluck,
    takeNew: takeNew, takeHit: takeHit, build: build, sigOf: sigOf, perfOf: perfOf, perfState: perfState, perfMake: perfMake,
    open: open, html: html, bind: bind, head: head, leave: leave, act: act, tick: tick, finish: finish, cancel: cancel, reoffset: reoffset,
    hit: hit, strumAt: strumAt, padDown: padDown, padMove: padMove, padUp: padUp, relSec: relSec, songChordAt: songChordAt, songChordList: songChordList,
    ui: function () { return ui; }, busy: function () { return ui.rec ? ui.rec.tok : null; }, rec: function () { return ui.rec; },
    setChord: function (nm) { if (!shapeOf(nm)) { return false; } ui.chord = nm; ui.auto = false; return true; }
  };
})();
