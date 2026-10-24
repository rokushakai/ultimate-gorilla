// =========================================================
// 究極ゴリラ ゲームセンター: 🎸 ゴリラウクレレ（§167）
//   左手で指板を押さえ、右手でサウンドホールの上をスワイプして鳴らす練習ゲーム
// arcade.js・arcade-melody.js の後に読み込む。音は window.UGMelody（ナイロンギターの音色）を使う。
// =========================================================
(function () {
  "use strict";

  var I = window.UGArcade && window.UGArcade.internal;
  if (!I) { return; }
  var W = I.W, randInt = I.randInt, hudText = I.hudText, lsGet = I.lsGet, lsSet = I.lsSet;

  var UKE_PREFS_KEY = "ultimateGorillaUkulelePrefsV1";
  var UKE_PROG = 24; // GM 025 Acoustic Guitar (nylon)
  var UKE_STRINGS = ["G", "C", "E", "A"];
  var UKE_OPEN = [67, 60, 64, 69], UKE_OPEN_LOWG = 55;
  var UKE_STRX = [54, 98, 142, 186], UKE_NUT_Y = 44, UKE_FRETS = 6, UKE_FH = 28;
  var UKE_STRUM_Y = 218, UKE_HOLE_Y = 266, UKE_TIME = 3600, UKE_STRUM_WINDOW = 24;
  var NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

  // 押さえ方は [G, C, E, A] の各弦のフレット（0 = 開放）
  var UKE_CHORDS = {
    easy: [
      { name: "C", shape: [0, 0, 0, 3] }, { name: "Am", shape: [2, 0, 0, 0] }, { name: "F", shape: [2, 0, 1, 0] },
      { name: "G7", shape: [0, 2, 1, 2] }, { name: "C7", shape: [0, 0, 0, 1] }, { name: "A7", shape: [0, 1, 0, 0] },
      { name: "Am7", shape: [0, 0, 0, 0] }
    ],
    normal: [
      { name: "G", shape: [0, 2, 3, 2] }, { name: "Dm", shape: [2, 2, 1, 0] }, { name: "Em", shape: [0, 4, 3, 2] },
      { name: "D", shape: [2, 2, 2, 0] }, { name: "A", shape: [2, 1, 0, 0] }, { name: "Em7", shape: [0, 2, 0, 2] },
      { name: "Dm7", shape: [2, 2, 1, 3] }, { name: "E7", shape: [1, 2, 0, 2] }, { name: "D7", shape: [2, 2, 2, 3] },
      { name: "Gm", shape: [0, 2, 3, 1] }, { name: "Cmaj7", shape: [0, 0, 0, 2] }
    ],
    hard: [
      { name: "B♭", shape: [3, 2, 1, 1] }, { name: "E", shape: [4, 4, 4, 2] }, { name: "B7", shape: [2, 3, 2, 2] },
      { name: "Cm", shape: [0, 3, 3, 3] }, { name: "Fm", shape: [1, 0, 1, 3] }, { name: "Bm", shape: [4, 2, 2, 2] },
      { name: "F#m", shape: [2, 1, 2, 0] }, { name: "E♭", shape: [0, 3, 3, 1] }
    ],
    // §168 v0.87: コード進行だけで使う（クイズには出ない）
    extra: [{ name: "Fmaj7", shape: [2, 4, 1, 3] }, { name: "Gm7", shape: [0, 2, 1, 1] }]
  };
  // §168 v0.87: コード進行で練習（2周でクリア）
  var UKE_PROGRESSIONS = [
    { id: "ohdo", name: "&#x1F38C; 王道進行", chords: ["F", "G7", "Em", "Am"] },
    { id: "canon", name: "&#x1F3BB; カノン進行", chords: ["C", "G", "Am", "Em", "F", "C", "F", "G7"] },
    { id: "fifties", name: "&#x1F3B7; 50年代進行", chords: ["C", "Am", "F", "G7"] },
    { id: "komuro", name: "&#x1F303; 小室進行", chords: ["Am", "F", "G", "C"] },
    { id: "letitbe", name: "&#x1F3B9; レット・イット・ビー風", chords: ["C", "G", "Am", "F"] },
    { id: "marusa", name: "&#x1F319; 丸サ進行（おしゃれ）", chords: ["Fmaj7", "E7", "Am7", "Gm7", "C7"] }
  ];
  var UKE_PROG_LOOPS = 2;
  function ukeProgression(id) {
    for (var i = 0; i < UKE_PROGRESSIONS.length; i++) { if (UKE_PROGRESSIONS[i].id === id) { return UKE_PROGRESSIONS[i]; } }
    return null;
  }
  var UKE_MODES = [
    { id: "free", name: "&#x1F3B5; フリー演奏", note: "時間制限なし。自由に弾こう" },
    { id: "easy", name: "&#x1F530; コード練習 やさしい", note: "C・Am・F・G7 など7つ（お手本あり・60秒）" },
    { id: "normal", name: "&#x1F3B8; コード練習 ふつう", note: "＋G・Dm・Em・D・E7 など（お手本あり・60秒）" },
    { id: "hard", name: "&#x1F525; コード練習 むずかしい", note: "＋B♭・E・Bm・F#m など（コード名だけ・60秒）" }
  ];

  // そのモードで出るコード
  function ukeChordSet(mode) {
    var out = UKE_CHORDS.easy.slice();
    if (mode === "normal" || mode === "hard") { out = out.concat(UKE_CHORDS.normal); }
    if (mode === "hard") { out = out.concat(UKE_CHORDS.hard); }
    return out;
  }
  // 押さえ方 → コード名（知らない押さえ方は ""）
  var UKE_INDEX = {}, UKE_BY_NAME = {};
  (function () {
    var all = ukeChordSet("hard").concat(UKE_CHORDS.extra);
    for (var i = 0; i < all.length; i++) { UKE_INDEX[all[i].shape.join(",")] = all[i].name; UKE_BY_NAME[all[i].name] = all[i]; }
  })();
  function ukeChordName(frets) { return UKE_INDEX[frets.join(",")] || ""; }
  function ukeMidi(s, fret, lowG) { return (s === 0 && lowG ? UKE_OPEN_LOWG : UKE_OPEN[s]) + fret; }
  function ukeNoteName(midi) { return NOTE_NAMES[((midi % 12) + 12) % 12]; }
  // 指板の座標 → { s: 弦, f: フレット } / null
  function ukeCellAt(x, y) {
    if (y < UKE_NUT_Y - 4 || y > UKE_NUT_Y + UKE_FRETS * UKE_FH + 4) { return null; }
    var best = -1, bd = 23;
    for (var s = 0; s < 4; s++) { var d = Math.abs(x - UKE_STRX[s]); if (d < bd) { bd = d; best = s; } }
    if (best < 0) { return null; }
    var f = Math.floor((y - UKE_NUT_Y) / UKE_FH) + 1;
    return { s: best, f: Math.max(1, Math.min(UKE_FRETS, f)) };
  }
  // x0 → x1 へ動いたときに通った弦（通った順）
  function ukeCrossed(x0, x1) {
    var out = [], s;
    if (x1 > x0) { for (s = 0; s < 4; s++) { if (x0 < UKE_STRX[s] && x1 >= UKE_STRX[s]) { out.push(s); } } }
    else if (x1 < x0) { for (s = 3; s >= 0; s--) { if (x0 > UKE_STRX[s] && x1 <= UKE_STRX[s]) { out.push(s); } } }
    return out;
  }
  // 押さえている場所の一覧 [{s, f}] → 各弦の鳴るフレット（いちばん高いフレット）
  var UKE_MAX_POS = 9;
  // 👂 耳コピの答えボタン（2×2・指板の上に重ねる）
  function ukeEarBtn(i) { return { x: 30 + (i % 2) * 94, y: 70 + Math.floor(i / 2) * 70, w: 86, h: 58 }; }
  // 押さえ方が表示の6フレットに入るようにポジションを決める（入っていればそのまま）
  function ukeFitPos(shape, pos) {
    var mn = 99, mx = 0;
    for (var i = 0; i < 4; i++) { if (shape[i] > 0) { if (shape[i] < mn) { mn = shape[i]; } if (shape[i] > mx) { mx = shape[i]; } } }
    if (mx === 0) { return 0; }
    if (mn > pos && mx <= pos + UKE_FRETS) { return pos; }
    return mx <= UKE_FRETS ? 0 : Math.min(UKE_MAX_POS, mn - 1);
  }
  function ukeFrets(presses) {
    var out = [0, 0, 0, 0];
    for (var i = 0; i < presses.length; i++) { if (presses[i].f > out[presses[i].s]) { out[presses[i].s] = presses[i].f; } }
    return out;
  }

  // ---------- §169 v0.88: マイコード・音・押さえ方の図 ----------
  var UKE_MY_KEY = "ultimateGorillaUkuleleChordsV1", UKE_MY_MAX = 50;
  var C = window.UGChords;
  function ukeLoadMy() {
    var a = lsGet(UKE_MY_KEY), out = [];
    if (!a || !a.length) { return out; }
    for (var i = 0; i < a.length && out.length < UKE_MY_MAX; i++) {
      var r = a[i];
      if (r && typeof r.name === "string" && r.shape && r.shape.length === 4) { out.push({ id: r.id || i + 1, name: r.name.slice(0, 24), shape: r.shape.slice(0, 4), src: r.src || "" }); }
    }
    return out;
  }
  function ukeSaveMy(list) { return lsSet(UKE_MY_KEY, list.slice(0, UKE_MY_MAX)); }
  function ukeAddMy(name, shape, src) {
    var list = ukeLoadMy(), id = 1;
    for (var i = 0; i < list.length; i++) {
      if (list[i].name === name && list[i].shape.join(",") === shape.join(",")) { return false; }
      if (list[i].id >= id) { id = list[i].id + 1; }
    }
    if (list.length >= UKE_MY_MAX) { return false; }
    list.push({ id: id, name: name, shape: shape.slice(), src: src || "" });
    ukeSaveMy(list);
    return true;
  }
  // 定番の押さえ方（名前 → 押さえ方）。エンジンの優先・名前当てに使う
  var UKE_PREFERRED = {};
  (function () {
    for (var k in UKE_BY_NAME) {
      if (!UKE_BY_NAME.hasOwnProperty(k)) { continue; }
      var sp = C ? C.parse(k) : null;
      UKE_PREFERRED[sp ? C.name(sp) : k] = UKE_BY_NAME[k].shape;
    }
  })();
  function ukeVoice(spec, lowG) { return C ? C.voicings(spec, { lowG: lowG, preferred: UKE_PREFERRED, count: 6 }) : []; }
  // 押さえ方 → 名前（定番を優先し、なければエンジンで当てる）
  function ukeDetect(frets, lowG) {
    var nm = ukeChordName(frets);
    var d = C ? C.detect(frets, { lowG: lowG, preferred: UKE_PREFERRED }) : null;
    if (nm) { return { name: nm, alts: d ? d.alts : [], tones: d ? d.tones : [] }; }
    return d || { name: "", alts: [], tones: [] };
  }
  // §171 v0.90: 弦ごとの出口。同じ弦の前の音を 0.04 秒で消してから、新しい出口（GainNode）を返す
  function ukeStringOut(UG, ac, outs, s, when, level) {
    var bus = (UG.audio && UG.audio.ctx === ac && UG.audio.bus) ? UG.audio.bus : ac.destination;
    var prev = outs[s];
    if (prev) {
      try {
        prev.g.gain.setValueAtTime(prev.lv, Math.max(when, prev.t));
        prev.g.gain.exponentialRampToValueAtTime(0.0001, Math.max(when, prev.t) + 0.04);
      } catch (e) {}
      (function (node, ms) { setTimeout(function () { try { node.disconnect(); } catch (e2) {} }, ms); })(prev.g, Math.max(0, (when - ac.currentTime) * 1000) + 200);
    }
    var g = ac.createGain();
    g.gain.value = level;
    g.connect(bus);
    outs[s] = { g: g, lv: level, t: when };
    return g;
  }
  // 1本の弦を鳴らす（outs があれば同じ弦の前の音を止める）
  function ukeNote(UG, ac, outs, s, fret, when, level, lowG) {
    if (fret === null || fret === undefined) { return; }
    var midi = ukeMidi(s, fret, lowG);
    try {
      if (outs) { UG.synth(midi, UKE_PROG, when, 1, ukeStringOut(UG, ac, outs, s, when, level)); }
      else { UG.synth(midi, UKE_PROG, when, level); }
    } catch (e) {}
  }
  // スワイプの速さ（1フレームに動いた px）→ 強さ 0.45〜1.0
  function ukeVelocity(speed) { return Math.max(0.45, Math.min(1, 0.45 + speed / 50)); }
  // §171 v0.90: 押さえ方 → 指番号 [弦ごと 0=押さえない / 1〜4]
  function ukeFingering(shape) {
    var fr = [], i, out = [0, 0, 0, 0], min = 99;
    for (i = 0; i < 4; i++) { if (shape[i] > 0) { fr.push({ s: i, f: shape[i] }); if (shape[i] < min) { min = shape[i]; } } }
    if (!fr.length) { return out; }
    if (fr.length === 1) { out[fr[0].s] = fr[0].f <= 4 ? fr[0].f : 1; return out; }
    var atMin = 0;
    for (i = 0; i < fr.length; i++) { if (fr[i].f === min) { atMin++; } }
    fr.sort(function (a, b) { return a.f - b.f || a.s - b.s; });
    var next = 1;
    if (fr.length === 4 && atMin >= 2) {
      // いちばん低いフレットを人さし指でセーハ
      for (i = 0; i < fr.length; i++) { if (fr[i].f === min) { out[fr[i].s] = 1; } }
      next = 2;
      for (i = 0; i < fr.length; i++) { if (fr[i].f !== min) { out[fr[i].s] = Math.min(4, Math.max(next, fr[i].f - min + 1)); next = out[fr[i].s] + 1; } }
      return out;
    }
    for (i = 0; i < fr.length; i++) {
      out[fr[i].s] = Math.min(4, Math.max(next, fr[i].f - min + 1));
      next = out[fr[i].s] + 1;
    }
    return out;
  }
  // 設定（Low-G・勉強の助け）を読む・書く（足りない項目は既定値）
  function ukePrefs() {
    var p0 = lsGet(UKE_PREFS_KEY) || {};
    return { lowG: !!p0.lowG, notes: !!p0.notes, tones: !!p0.tones, fingers: p0.fingers !== false };
  }
  function ukeSavePrefs(p1) { lsSet(UKE_PREFS_KEY, { lowG: !!p1.lowG, notes: !!p1.notes, tones: !!p1.tones, fingers: !!p1.fingers }); }
  // 設定画面で音を鳴らす（arp: アルペジオ）
  function ukePlayShape(shape, lowG, arp) {
    var UG = window.UGMelody;
    if (!UG) { return; }
    var ac = UG.audioInit();
    if (!ac) { return; }
    try { UG.loadSamples([UKE_PROG]); } catch (e) {}
    for (var s = 0; s < 4; s++) { ukeNote(UG, ac, ukePreviewOuts, s, shape[s], ac.currentTime + 0.02 + s * (arp ? 0.22 : 0.03), 0.85, lowG); }
  }
  var ukePreviewOuts = [null, null, null, null];
  // 押さえ方の図（コード表の向き）。canvas は CSS で 110×152
  function ukeDiagram(cv, shape, rootPc, lowG) {
    if (!cv || !cv.getContext) { return; }
    var ctx = cv.getContext("2d"), k = 2, w = 110, h = 152;
    cv.width = w * k; cv.height = h * k;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.fillStyle = "#3b2414"; ctx.fillRect(0, 0, w, h);
    var mx = 0, mn = 99, i;
    for (i = 0; i < 4; i++) { if (shape[i] > 0) { if (shape[i] > mx) { mx = shape[i]; } if (shape[i] < mn) { mn = shape[i]; } } }
    var base = mx > 5 ? mn - 1 : 0, X0 = 28, DX = 18, Y0 = 26, DY = 20, fing = ukeFingering(shape);
    ctx.strokeStyle = "#c0c0c0"; ctx.lineWidth = 1;
    for (i = 0; i <= 5; i++) { ctx.beginPath(); ctx.moveTo(X0, Y0 + i * DY); ctx.lineTo(X0 + 3 * DX, Y0 + i * DY); ctx.stroke(); }
    for (i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(X0 + i * DX, Y0); ctx.lineTo(X0 + i * DX, Y0 + 5 * DY); ctx.stroke(); }
    if (base === 0) { ctx.fillStyle = "#f1e4c8"; ctx.fillRect(X0 - 1, Y0 - 3, 3 * DX + 2, 3); }
    ctx.font = "bold 9px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    if (base > 0) { ctx.fillStyle = "#e9c46a"; ctx.fillText((base + 1) + "fr", 12, Y0 + DY / 2); }
    for (i = 0; i < 4; i++) {
      ctx.fillStyle = "#e9c46a";
      ctx.fillText(UKE_STRINGS[i], X0 + i * DX, 8);
      var f = shape[i];
      if (f === null) { ctx.fillStyle = "#ff7675"; ctx.fillText("×", X0 + i * DX, Y0 - 9); continue; }
      var midi = ukeMidi(i, f, lowG), isRoot = rootPc !== undefined && rootPc !== null && ((midi % 12) + 12) % 12 === rootPc;
      if (f === 0) {
        ctx.strokeStyle = isRoot ? "#ff7675" : "#f1e4c8"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(X0 + i * DX, Y0 - 9, 4, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.fillStyle = isRoot ? "#ff7675" : "#ffd166";
        ctx.beginPath(); ctx.arc(X0 + i * DX, Y0 + (f - base - 0.5) * DY, 7, 0, Math.PI * 2); ctx.fill();
        if (fing[i]) { ctx.fillStyle = "#1b0f07"; ctx.fillText(String(fing[i]), X0 + i * DX, Y0 + (f - base - 0.5) * DY + 0.5); }
      }
      ctx.fillStyle = "#f1e4c8";
      ctx.fillText(ukeNoteName(midi), X0 + i * DX, Y0 + 5 * DY + 10);
    }
    ctx.fillStyle = "#adb5bd";
    ctx.font = "8px sans-serif";
    ctx.fillText("赤＝根音・数字＝指", w / 2, h - 4);
  }

  // ---------- §170 v0.89: シーケンサー ----------
  var UKE_SEQ_KEY = "ultimateGorillaUkuleleSeqV1", UKE_SEQ_MAX_ROWS = 64, UKE_SEQ_MAX_SONGS = 10;
  var UKE_SEQ_PALETTE = ["C", "Am", "F", "G7", "G", "Dm", "Em", "E7", "Dm7", "Cmaj7", "A7", "D7", "B♭", "Fmaj7"];
  function ukeSeqDefault() {
    return { bpm: 90, key: 0, meter: 4, swing: 0.5, swingGrid: 0.5, style: "e", pattern: "D-DU-UDU", metronome: true, countIn: true, loop: false, backing: true,
      rows: [{ type: "chord", name: "C", len: "w" }, { type: "chord", name: "Am", len: "w" }, { type: "chord", name: "F", len: "w" }, { type: "chord", name: "G7", len: "w" }] };
  }
  function ukeSeqClean(q) {
    var d = ukeSeqDefault(), out = {}, k;
    q = q && typeof q === "object" ? q : {};
    for (k in d) { if (d.hasOwnProperty(k)) { out[k] = q[k] === undefined ? d[k] : q[k]; } }
    out.bpm = Math.max(40, Math.min(240, Math.round(Number(out.bpm) || 90)));
    out.key = Math.max(-11, Math.min(11, Math.round(Number(out.key) || 0)));
    out.meter = out.meter === 3 ? 3 : 4;
    out.swing = Math.max(0.5, Math.min(0.75, Number(out.swing) || 0.5));
    out.swingGrid = out.swingGrid === 0.25 ? 0.25 : 0.5;
    out.style = C && C.SEQ_STYLES.some(function (st) { return st.id === out.style; }) ? out.style : "e";
    out.pattern = C.seqPattern(out.pattern);
    out.metronome = !!out.metronome; out.countIn = !!out.countIn; out.loop = !!out.loop; out.backing = out.backing !== false;
    var rows = [], src = Array.isArray(q.rows) ? q.rows : d.rows;
    for (var i = 0; i < src.length && rows.length < UKE_SEQ_MAX_ROWS; i++) {
      var r = src[i];
      if (!r) { continue; }
      if (r.type === "key") { rows.push({ type: "key", semis: Math.max(-11, Math.min(11, Math.round(Number(r.semis) || 0))) }); }
      else if (r.type === "rest") { rows.push({ type: "rest", len: C.seqLen(r.len).id }); }
      else { rows.push({ type: "chord", name: String(r.name || "").slice(0, 24), len: C.seqLen(r.len).id }); }
    }
    out.rows = rows;
    return out;
  }
  function ukeSeqLoad() {
    var a = lsGet(UKE_SEQ_KEY) || {}, songs = [];
    if (Array.isArray(a.songs)) {
      for (var i = 0; i < a.songs.length && songs.length < UKE_SEQ_MAX_SONGS; i++) {
        var s = a.songs[i];
        if (s && typeof s.name === "string") { songs.push({ id: s.id || i + 1, name: s.name.slice(0, 20), seq: ukeSeqClean(s.seq) }); }
      }
    }
    return { cur: ukeSeqClean(a.cur || ukeSeqDefault()), songs: songs };
  }
  function ukeSeqSave(st) { return lsSet(UKE_SEQ_KEY, st); }
  // 名前 → { name, shape }（★名前 はマイコード。semis だけ移調）
  var ukeResolveCache = {};
  function ukeResolve(name, semis, lowG) {
    name = String(name || "").trim();
    if (!name) { return null; }
    var key = name + "|" + semis + "|" + (lowG ? 1 : 0);
    if (ukeResolveCache.hasOwnProperty(key)) { return ukeResolveCache[key]; }
    var res = null;
    if (name.charAt(0) === "★" || name.charAt(0) === "*") {
      var my = ukeLoadMy(), nm = name.substring(1).trim();
      for (var i = 0; i < my.length; i++) {
        if (my[i].name === nm) { res = { name: "★" + nm + (semis ? (semis > 0 ? " +" : " ") + semis : ""), shape: semis ? C.shiftShape(my[i].shape, semis) : my[i].shape.slice() }; break; }
      }
      return res; // マイコードは変わることがあるのでキャッシュしない
    }
    var sp = C.parse(name);
    if (sp) {
      var t = C.transpose(sp, semis), vs = ukeVoice(t, lowG);
      if (vs.length) { res = { name: C.name(t), shape: vs[0] }; }
    }
    ukeResolveCache[key] = res;
    return res;
  }
  function ukeSeqSchedule(seq, lowG) { return C.schedule(seq, function (n, s) { return ukeResolve(n, s, lowG); }); }
  // プリセット（§168 の進行＋ブルース・ii-V-I）
  function ukeSeqPresets() {
    var out = [], i;
    for (i = 0; i < UKE_PROGRESSIONS.length; i++) {
      out.push({ id: UKE_PROGRESSIONS[i].id, name: UKE_PROGRESSIONS[i].name, chords: UKE_PROGRESSIONS[i].chords, len: "w", style: "e", swing: 0.5, bpm: 90 });
    }
    out.push({ id: "blues", name: "&#x1F3B8; 12小節ブルース", chords: ["C7", "C7", "C7", "C7", "F7", "F7", "C7", "C7", "G7", "F7", "C7", "G7"], len: "w", style: "e", swing: 0.67, bpm: 100 });
    out.push({ id: "251", name: "&#x1F3B7; ii-V-I（ジャズ）", chords: ["Dm7", "G7", "Cmaj7", "Cmaj7"], len: "w", style: "q", swing: 0.62, bpm: 110 });
    return out;
  }
  // 1つの音・ストロークを予約して鳴らす
  function ukeSeqPlayEvent(UG, ac, ev, when, lowG, level, outs) {
    if (ev.kind === "click") { try { UG.drum(ac, ev.accent ? 76 : 77, when, ev.accent ? 0.55 : 0.35); } catch (e) {} return; }
    var lv = level || 0.8;
    if (ev.kind === "pluck") { ukeNote(UG, ac, outs, ev.string, ev.shape[ev.string], when, lv, lowG); return; }
    if (ev.kind === "chuck") {
      // ブラッシング: 鳴っている弦を止めて、短い「チャッ」
      for (var c = 0; c < 4; c++) { if (outs && outs[c]) { ukeStringOut(UG, ac, outs, c, when, 0.0001); } }
      try { UG.drum(ac, 37, when, lv * 0.6); } catch (e4) {}
      return;
    }
    for (var i = 0; i < 4; i++) {
      var s = ev.dir === "up" ? 3 - i : i;
      ukeNote(UG, ac, outs, s, ev.shape[s], when + i * 0.012, ev.dir === "up" ? lv * 0.7 : lv, lowG);
    }
  }
  // 設定画面の再生（25ms ごとに 120ms 先まで予約）
  var ukeSeqPlayer = null;
  function ukeSeqStop() {
    if (ukeSeqPlayer) { clearInterval(ukeSeqPlayer.timer); ukeSeqPlayer = null; }
  }
  I.addStopHook(ukeSeqStop);
  function ukeSeqStart(seq, lowG, onRow) {
    ukeSeqStop();
    var UG = window.UGMelody;
    if (!UG) { return false; }
    var ac = UG.audioInit();
    if (!ac) { return false; }
    try { UG.loadSamples([UKE_PROG]); } catch (e) {}
    var sched = ukeSeqSchedule(seq, lowG);
    if (!sched.events.length) { return false; }
    var pl = { sched: sched, startAt: ac.currentTime + 0.1, idx: 0, off: 0, row: -2, seq: seq, outs: [null, null, null, null] };
    pl.timer = setInterval(function () {
      var now = ac.currentTime - pl.startAt, ev;
      while (pl.idx < sched.events.length && (ev = sched.events[pl.idx]).t + pl.off < now + 0.12) {
        ukeSeqPlayEvent(UG, ac, ev, pl.startAt + pl.off + ev.t, lowG, 0.8, pl.outs);
        pl.idx++;
      }
      if (pl.idx >= sched.events.length && now >= pl.off + sched.time) {
        if (!seq.loop) { ukeSeqStop(); if (onRow) { onRow(-1, null); } return; }
        // くりかえし: カウントインは飛ばす
        pl.off += sched.time - sched.lead;
        pl.idx = 0;
        while (pl.idx < sched.events.length && sched.events[pl.idx].t < sched.lead - 1e-6) { pl.idx++; }
      }
      var cur = -1;
      for (var i = 0; i < sched.rows.length; i++) {
        var r = sched.rows[i];
        if (r.type !== "key" && now >= r.t0 + pl.off && now < r.t1 + pl.off) { cur = i; break; }
      }
      if (cur !== pl.row) { pl.row = cur; if (onRow) { onRow(cur >= 0 ? sched.rows[cur].i : -1, cur >= 0 ? sched.rows[cur] : null); } }
    }, 25);
    ukeSeqPlayer = pl;
    return true;
  }

  // §172 v0.91: 曲 → メロディくずしの録音と同じ形（MIDI・WAV の書き出しに使う）
  function ukeSeqRec(seq, lowG) {
    var sc = ukeSeqSchedule(seq, lowG), notes = [], i, k;
    for (i = 0; i < sc.events.length; i++) {
      var ev = sc.events[i], ms = Math.round((ev.t - sc.lead) * 1000);
      if (ev.kind === "pluck") {
        if (ev.shape[ev.string] !== null) { notes.push([ms, ukeMidi(ev.string, ev.shape[ev.string], lowG), "b", 0.85]); }
      } else if (ev.kind === "strum") {
        for (k = 0; k < 4; k++) {
          var st = ev.dir === "up" ? 3 - k : k;
          if (ev.shape[st] !== null) { notes.push([ms + k * 12, ukeMidi(st, ev.shape[st], lowG), "b", ev.dir === "up" ? 0.65 : 0.9]); }
        }
      }
    }
    return { id: Date.now(), date: Date.now(), notes: notes, prog: { b: UKE_PROG }, fxRev: 1 };
  }
  function ukeFileStamp() {
    var d = new Date(), z = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + "-" + z(d.getHours()) + z(d.getMinutes());
  }
  function ukeSeqExportMidi(seq, lowG) {
    var UG = window.UGMelody, rec = ukeSeqRec(seq, lowG);
    if (!UG || !rec.notes.length) { return "fail"; }
    return I.saveBlob(new Blob([new Uint8Array(UG.midiBytes(rec))], { type: "audio/midi" }), "ukulele-" + ukeFileStamp() + ".mid");
  }
  var ukeWavBusy = false;
  function ukeSeqExportWav(seq, lowG, done) {
    var UG = window.UGMelody, rec = ukeSeqRec(seq, lowG), started = false;
    if (!UG || !rec.notes.length || ukeWavBusy) { done("fail"); return; }
    ukeWavBusy = true;
    function go() {
      if (started) { return; }
      started = true;
      UG.renderWav(rec, function (blob, sec, cut) {
        ukeWavBusy = false;
        if (!blob) { done("fail"); return; }
        var how = I.saveBlob(blob, "ukulele-" + ukeFileStamp() + ".wav");
        done(how === "fail" ? "fail" : (cut ? "cut" : "ok"));
      });
    }
    // サンプルの読み込みを待つ（8秒で来なければ合成音のまま）
    UG.loadSamples([UKE_PROG], go);
    setTimeout(go, 8000);
  }

  function ukeSeqTab(ctx) {
    // ctx: { lowG, render, toast(msg), done(cfg) } と、描画後の結びつけ
    var st = ukeSeqLoad(), seq = st.cur, h = "", i, k;
    function sel(attr, opts, cur) {
      var o = '<select ' + attr + '>';
      for (var j = 0; j < opts.length; j++) { o += '<option value="' + opts[j][0] + '"' + (String(opts[j][0]) === String(cur) ? " selected" : "") + '>' + opts[j][1] + '</option>'; }
      return o + '</select>';
    }
    var lenOpts = C.SEQ_LENGTHS.map(function (l) { return [l.id, l.label]; });
    var semiOpts = [];
    for (k = -11; k <= 11; k++) { semiOpts.push([k, (k > 0 ? "+" : "") + k + "（C→" + C.ROOTS[((k % 12) + 12) % 12] + "）"]); }
    h += '<p class="small" style="color:#adb5bd;margin:0 0 6px;">コードを並べて伴奏を流そう。長さは音符で、Key・転調・スイング・奏法も選べるよ。</p>' +
      '<div class="uke-seq-set">' +
      '<label>BPM<input type="number" min="40" max="240" data-set="bpm" value="' + seq.bpm + '"></label>' +
      '<label>Key（全体）' + sel('data-set="key"', semiOpts, seq.key) + '</label>' +
      '<label>拍子' + sel('data-set="meter"', [[4, "4/4"], [3, "3/4"]], seq.meter) + '</label>' +
      '<label>奏法' + sel('data-set="style"', C.SEQ_STYLES.map(function (s2) { return [s2.id, s2.label]; }), seq.style) + '</label>' +
      '<label>スイング' + sel('data-set="swing"', C.SEQ_SWINGS.map(function (s3) { return [s3.v, s3.label]; }), seq.swing) + '</label>' +
      '<label>スイングする音符' + sel('data-set="swingGrid"', [[0.5, "8分"], [0.25, "16分"]], seq.swingGrid) + '</label>' +
      '</div>' +
      (seq.style === "pat" ? '<label class="melody-row"><span>パターン（1小節・D ダウン / U アップ / - 休み / x ブラッシング）</span><input type="text" class="uke-seq-pat" maxlength="16" value="' + I.escHtml(seq.pattern) + '"></label>' +
        ukeChips(C.SEQ_PATTERNS.map(function (pp) { return { v: pp.p, t: pp.p + ' <span class="uke-role">' + pp.label + '</span>' }; }), function (v) { return v === seq.pattern; }, "pat") : '') +
      '<div class="melody-checks uke-seq-checks">' +
      [["metronome", "メトロノーム"], ["countIn", "カウントイン（1小節）"], ["loop", "くりかえし"], ["backing", "合わせて弾くとき伴奏も鳴らす"]].map(function (c2) {
        return '<label><input type="checkbox" data-set="' + c2[0] + '"' + (seq[c2[0]] ? " checked" : "") + '> ' + c2[1] + '</label>';
      }).join("") + '</div>';
    var sched = ukeSeqSchedule(seq, ctx.lowG), ri = 0;
    h += '<div class="uke-seq-rows">';
    if (!seq.rows.length) { h += '<p class="small" style="color:#6c757d;">行がありません。下のボタンかコードのボタンで追加しよう。</p>'; }
    for (i = 0; i < seq.rows.length; i++) {
      var r = seq.rows[i], info = null;
      while (ri < sched.rows.length && sched.rows[ri].i < i) { ri++; }
      if (ri < sched.rows.length && sched.rows[ri].i === i) { info = sched.rows[ri]; }
      h += '<div class="uke-seq-row" data-row="' + i + '"><span class="uke-seq-no">' + (info && info.bar ? '<span class="uke-seq-bar">&#x2669;' + info.bar + '</span>' : (i + 1)) + '</span>';
      if (r.type === "chord") {
        var bad = !info || !info.ok;
        h += '<input type="text" class="uke-seq-chord' + (bad ? " bad" : "") + '" data-row="' + i + '" value="' + I.escHtml(r.name) + '" maxlength="24" placeholder="例 Am7">' +
          sel('class="uke-seq-len" data-row="' + i + '"', lenOpts, r.len) +
          '<span class="uke-seq-res">' + (bad ? '<span style="color:#ff7675;">？</span>' : I.escHtml(info.name !== r.name ? "→" + info.name : "") + ' <span class="uke-role">' + info.shape.join("-") + '</span>') + '</span>';
      } else if (r.type === "rest") {
        h += '<span class="uke-seq-kind">&#x1F92B; 休符</span>' + sel('class="uke-seq-len" data-row="' + i + '"', lenOpts, r.len);
      } else {
        h += '<span class="uke-seq-kind">&#x1F511; 転調</span>' + sel('class="uke-seq-semis" data-row="' + i + '"', semiOpts, r.semis);
      }
      h += '<button class="arcade-mini-btn" data-seq="up" data-row="' + i + '" title="上へ">&#x2191;</button>' +
        '<button class="arcade-mini-btn" data-seq="del" data-row="' + i + '" title="消す">&#x1F5D1;&#xFE0F;</button></div>';
    }
    h += '</div><div class="uke-chips">' +
      '<button class="uke-chip" data-seq="addChord">&#xFF0B; コード</button><button class="uke-chip" data-seq="addRest">&#xFF0B; 休符</button>' +
      '<button class="uke-chip" data-seq="addKey">&#xFF0B; 転調</button><button class="uke-chip" data-seq="clear">&#x1F9F9; 全部消す</button></div>' +
      '<div class="uke-label">タップで追加（最後の行と同じ長さ）</div>';
    var pal = UKE_SEQ_PALETTE.map(function (n) { return { v: n, t: n }; });
    var my = ukeLoadMy();
    for (i = 0; i < my.length && i < 12; i++) { pal.push({ v: "★" + my[i].name, t: "&#x2B50;" + I.escHtml(my[i].name) }); }
    h += ukeChips(pal.map(function (p) { return { v: I.escHtml(p.v), t: p.t }; }), function () { return false; }, "pal");
    h += '<div class="uke-label">合計 ' + (Math.round(sched.beats * 100) / 100) + '拍・' + sched.bars + '小節（' + (Math.round((sched.time - sched.lead) * 10) / 10) + '秒）　&#x2669;＝小節の頭</div>' +
      '<div class="melody-actions"><button class="modal-btn" data-seq="play">&#x25B6;&#xFE0F; 再生</button><button class="modal-btn" data-seq="stop">&#x23F9; 停止</button></div>' +
      '<div class="melody-actions"><button class="modal-btn melody-small-btn" data-seq="midi">&#x1F4BE; MIDIで保存</button><button class="modal-btn melody-small-btn" data-seq="wav"' + (ukeWavBusy ? " disabled" : "") + '>&#x1F3A7; ' + (ukeWavBusy ? "作成中…" : "WAVで保存") + '</button></div>' +
      '<div class="uke-card uke-now"><div class="uke-card-info"><div class="uke-label">いま鳴っているコード</div><div class="uke-card-name uke-now-name">―</div></div><canvas class="uke-diagram" data-k="now"></canvas></div>' +
      '<button class="modal-btn" data-seq="together" style="width:100%;">&#x1F3B8; この曲に合わせて弾く<br><span class="small" style="color:inherit;opacity:0.75;">伴奏が流れるので、お題のコードを押さえてストローク</span></button>';
    // プリセット・保存
    h += '<h4 class="arcade-prize-cat">&#x1F4E6; プリセット</h4>' +
      ukeChips(ukeSeqPresets().map(function (p) { return { v: p.id, t: p.name }; }), function () { return false; }, "preset");
    h += '<h4 class="arcade-prize-cat">&#x1F4BE; 保存した曲（' + st.songs.length + '/' + UKE_SEQ_MAX_SONGS + '）</h4>' +
      '<label class="melody-row"><span>曲の名前</span><input type="text" class="uke-song-name" maxlength="20" placeholder="例 わたしの曲"></label>' +
      '<button class="modal-btn melody-small-btn" data-seq="save">&#x1F4BE; いまの曲を保存</button>';
    for (i = 0; i < st.songs.length; i++) {
      h += '<div class="melody-rec"><div class="melody-rec-info"><b>' + I.escHtml(st.songs[i].name) + '</b><span class="small" style="color:#adb5bd;">' +
        st.songs[i].seq.rows.length + '行・BPM ' + st.songs[i].seq.bpm + '</span></div>' +
        '<button class="arcade-mini-btn melody-midi-btn" data-song="load" data-id="' + st.songs[i].id + '">読み込む</button>' +
        '<button class="arcade-mini-btn" data-song="del" data-id="' + st.songs[i].id + '" title="削除">&#x1F5D1;&#xFE0F;</button></div>';
    }
    return { html: h, bind: function (root) { ukeSeqBind(root, ctx, st); } };
  }
  function ukeSeqBind(root, ctx, st) {
    var seq = st.cur;
    function save(re) { st.cur = ukeSeqClean(seq); ukeSeqSave(st); if (re) { ctx.render(); } }
    function all(sel, ev, fn) { var els = root.querySelectorAll(sel); for (var i = 0; i < els.length; i++) { els[i][ev] = fn; } }
    function rowOf(ev) { return parseInt(ev.currentTarget.getAttribute("data-row"), 10); }
    function lastLen() { for (var i = seq.rows.length - 1; i >= 0; i--) { if (seq.rows[i].len) { return seq.rows[i].len; } } return "w"; }
    function showNow(rowIdx, info) {
      var rows = root.querySelectorAll(".uke-seq-row");
      for (var i = 0; i < rows.length; i++) {
        var on = parseInt(rows[i].getAttribute("data-row"), 10) === rowIdx;
        if (on) { rows[i].classList.add("playing"); } else { rows[i].classList.remove("playing"); }
      }
      var nm = root.querySelector(".uke-now-name");
      if (nm) { nm.textContent = info && info.type === "chord" ? info.name : (info ? "休符" : "―"); }
      if (info && info.shape) { ukeDiagram(root.querySelector('canvas[data-k="now"]'), info.shape, null, ctx.lowG); }
    }
    all("input[data-set], select[data-set]", "onchange", function (ev) {
      var el = ev.currentTarget, k = el.getAttribute("data-set");
      if (el.type === "checkbox") { seq[k] = !!el.checked; }
      else if (k === "style") { seq[k] = el.value; }
      else { seq[k] = Number(el.value); }
      save(true);
    });
    all("input.uke-seq-pat", "onchange", function (ev) { seq.pattern = C.seqPattern(ev.currentTarget.value); save(true); });
    all("button[data-pat]", "onclick", function (ev) { seq.pattern = ev.currentTarget.getAttribute("data-pat"); save(true); });
    all("input.uke-seq-chord", "onchange", function (ev) { seq.rows[rowOf(ev)].name = String(ev.currentTarget.value || "").slice(0, 24); save(true); });
    all("select.uke-seq-len", "onchange", function (ev) { seq.rows[rowOf(ev)].len = ev.currentTarget.value; save(true); });
    all("select.uke-seq-semis", "onchange", function (ev) { seq.rows[rowOf(ev)].semis = Number(ev.currentTarget.value); save(true); });
    all("button[data-pal]", "onclick", function (ev) {
      if (seq.rows.length >= UKE_SEQ_MAX_ROWS) { ctx.toast("行は" + UKE_SEQ_MAX_ROWS + "までです"); return; }
      seq.rows.push({ type: "chord", name: ev.currentTarget.getAttribute("data-pal"), len: lastLen() });
      save(true);
    });
    all("button[data-preset]", "onclick", function (ev) {
      var id = ev.currentTarget.getAttribute("data-preset"), ps = ukeSeqPresets();
      for (var i = 0; i < ps.length; i++) {
        if (ps[i].id !== id) { continue; }
        seq.rows = ps[i].chords.map(function (n) { return { type: "chord", name: n, len: ps[i].len }; });
        seq.style = ps[i].style; seq.swing = ps[i].swing; seq.bpm = ps[i].bpm; seq.key = 0;
      }
      save(true);
    });
    all("button[data-seq]", "onclick", function (ev) {
      var a = ev.currentTarget.getAttribute("data-seq"), r = parseInt(ev.currentTarget.getAttribute("data-row"), 10);
      if (a === "up" && r > 0) { var t = seq.rows[r - 1]; seq.rows[r - 1] = seq.rows[r]; seq.rows[r] = t; save(true); return; }
      if (a === "del") { seq.rows.splice(r, 1); save(true); return; }
      if ((a === "addChord" || a === "addRest" || a === "addKey") && seq.rows.length >= UKE_SEQ_MAX_ROWS) { ctx.toast("行は" + UKE_SEQ_MAX_ROWS + "までです"); return; }
      if (a === "addChord") { seq.rows.push({ type: "chord", name: "C", len: lastLen() }); save(true); return; }
      if (a === "addRest") { seq.rows.push({ type: "rest", len: lastLen() }); save(true); return; }
      if (a === "addKey") { seq.rows.push({ type: "key", semis: 2 }); save(true); return; }
      if (a === "clear") { seq.rows = []; save(true); return; }
      if (a === "play") { if (!ukeSeqStart(ukeSeqClean(seq), ctx.lowG, showNow)) { ctx.toast("鳴らせるコードがありません"); } return; }
      if (a === "stop") { ukeSeqStop(); showNow(-1, null); return; }
      if (a === "midi") {
        var hm = ukeSeqExportMidi(ukeSeqClean(seq), ctx.lowG);
        ctx.toast(hm === "fail" ? "MIDIを作れませんでした（鳴らせるコードがありません）" : "&#x1F4BE; MIDIファイルを保存しました");
        return;
      }
      if (a === "wav") {
        ukeSeqExportWav(ukeSeqClean(seq), ctx.lowG, function (how) {
          ctx.toast(how === "fail" ? "WAVを作れませんでした" : (how === "cut" ? "&#x1F3A7; WAVを保存しました（3分で切りました）" : "&#x1F3A7; WAVファイルを保存しました"));
        });
        ctx.render();
        return;
      }
      if (a === "together") { var pf = ukePrefs(); ukeSeqStop(); ctx.done({ mode: "seq", lowG: ctx.lowG, sound: true, seq: ukeSeqClean(seq), notes: pf.notes, tones: pf.tones, fingers: pf.fingers }); return; }
      if (a === "save") {
        var nmEl = root.querySelector("input.uke-song-name"), nm = nmEl ? String(nmEl.value || "").trim().slice(0, 20) : "";
        if (!nm) { nm = "曲" + (st.songs.length + 1); }
        if (st.songs.length >= UKE_SEQ_MAX_SONGS) { ctx.toast("保存できる曲は" + UKE_SEQ_MAX_SONGS + "曲までです"); return; }
        var id = 1;
        for (var i = 0; i < st.songs.length; i++) { if (st.songs[i].id >= id) { id = st.songs[i].id + 1; } }
        st.songs.push({ id: id, name: nm, seq: ukeSeqClean(seq) });
        save(false);
        ctx.toast("&#x1F4BE; 「" + I.escHtml(nm) + "」を保存しました");
      }
    });
    all("button[data-song]", "onclick", function (ev) {
      var a = ev.currentTarget.getAttribute("data-song"), id = parseInt(ev.currentTarget.getAttribute("data-id"), 10);
      for (var i = 0; i < st.songs.length; i++) {
        if (st.songs[i].id !== id) { continue; }
        if (a === "load") { seq = ukeSeqClean(st.songs[i].seq); } else { st.songs.splice(i, 1); }
        break;
      }
      save(true);
    });
    if (ukeSeqPlayer) { ukeSeqPlayer.row = -2; }
  }

  // ---------- 設定画面（タブ: あそぶ / コード辞典 / カスタム / マイコード / シーケンサー） ----------
  var ukeUi = { tab: "play", dRoot: 0, dQual: "maj", dVoice: 0, pRoot: 0, pParts: [], pBass: -1, pVoice: 0, sMode: "parts", sShape: [0, 0, 0, 3], sName: "" };
  var UKE_TABS = [["play", "&#x1F3B8; あそぶ"], ["dict", "&#x1F4DA; コード辞典"], ["custom", "&#x1F6E0;&#xFE0F; カスタム"], ["my", "&#x2B50; マイコード"], ["seq", "&#x1F39B;&#xFE0F; シーケンサー"]];
  function ukeChips(items, isOn, attr) {
    var h = '<div class="uke-chips">';
    for (var i = 0; i < items.length; i++) {
      h += '<button class="uke-chip' + (isOn(items[i].v) ? " active" : "") + '" data-' + attr + '="' + items[i].v + '">' + items[i].t + '</button>';
    }
    return h + '</div>';
  }
  function ukeRootItems(prefix) {
    var o = [];
    for (var i = 0; i < 12; i++) { o.push({ v: i, t: (prefix || "") + C.ROOTS[i] }); }
    return o;
  }
  // 名前・構成音・押さえ方の図・ボタンのカード
  function ukeCard(name, tonesHtml, shapes, vIdx, key) {
    var shape = shapes.length ? shapes[vIdx % shapes.length] : null;
    var h = '<div class="uke-card"><div class="uke-card-info"><div class="uke-card-name">' + I.escHtml(name || "?") + '</div>' +
      '<div class="small" style="color:#f1e4c8;">' + (tonesHtml || "&nbsp;") + '</div>';
    if (shape) {
      h += '<div class="small" style="color:#adb5bd;">押さえ方 ' + shape.join("-") + (shapes.length > 1 ? '（' + (vIdx % shapes.length + 1) + '/' + shapes.length + '）' : '') + '</div>' +
        '<div class="uke-card-btns">' +
        '<button class="arcade-mini-btn melody-midi-btn" data-a="strum" data-k="' + key + '">&#x1F3B6; ジャーン</button>' +
        '<button class="arcade-mini-btn melody-midi-btn" data-a="arp" data-k="' + key + '">&#x1F3BC; アルペジオ</button>' +
        (shapes.length > 1 ? '<button class="arcade-mini-btn melody-midi-btn" data-a="next" data-k="' + key + '">&#x1F504; 別の押さえ方</button>' : '') +
        '<button class="arcade-mini-btn melody-midi-btn" data-a="add" data-k="' + key + '">&#x2B50; 追加</button></div>';
    } else {
      h += '<div class="small" style="color:#ff7675;">4本で押さえられる形が見つかりませんでした</div>';
    }
    return { html: h + '</div><canvas class="uke-diagram" data-k="' + key + '"></canvas></div>', shape: shape };
  }
  function ukeTonesHtml(spec) {
    var ts = C.tones(spec), h = "";
    for (var i = 0; i < ts.length; i++) { h += (i ? " " : "") + ts[i].name + '<span class="uke-role">(' + ts[i].role + ')</span>'; }
    return h;
  }
  function ukeDictSpec() {
    var parts = [];
    for (var i = 0; i < C.QUALITIES.length; i++) { if (C.QUALITIES[i].id === ukeUi.dQual) { parts = C.QUALITIES[i].parts; } }
    return { root: ukeUi.dRoot, parts: parts.slice(), bass: null };
  }
  function ukePartsSpec() { return { root: ukeUi.pRoot, parts: ukeUi.pParts.slice(), bass: ukeUi.pBass >= 0 ? ukeUi.pBass : null }; }

  function ukeSetup(root, ctl) {
    var prefs = ukePrefs(), lowG = prefs.lowG, toast = "", cards = {};
    function modeBtn(id, title, note, disabled) {
      return '<button class="modal-btn" data-m="' + id + '" style="width:100%;"' + (disabled ? " disabled" : "") + '>' + title +
        '<br><span class="small" style="color:inherit;opacity:0.75;">' + note + '</span></button>';
    }
    function render() {
      var h = '<div class="melody-setup"><h3 style="margin:0 0 4px;">&#x1F3B8; ゴリラウクレレ</h3>', i, my = ukeLoadMy(), c, seqTab = null;
      h += ukeChips(UKE_TABS.map(function (t) { return { v: t[0], t: t[1] }; }), function (v) { return v === ukeUi.tab; }, "tab");
      cards = {};
      if (ukeUi.tab === "play") {
        h += '<p class="small" style="color:#adb5bd;margin:0 0 8px;">左手で指板（上）を押さえたまま、右手でサウンドホール（下の丸）の上を横にスワイプ。通った弦が順番に鳴るよ。押さえる場所はコード表と同じ向き（左から G・C・E・A）。</p>';
        for (i = 0; i < UKE_MODES.length; i++) { h += modeBtn(UKE_MODES[i].id, UKE_MODES[i].name, UKE_MODES[i].note); }
        h += modeBtn("dict", "&#x1F393; コード辞典から出題", "360コードからランダム（お手本あり・60秒）");
        h += modeBtn("my", "&#x2B50; マイコードで練習", my.length ? "保存した" + my.length + "個から出題（お手本あり・60秒）" : "マイコードを保存すると遊べます", !my.length);
        h += '<h4 class="arcade-prize-cat">&#x1F442; 耳コピクイズ（鳴ったコードを当てる・60秒）</h4>' +
          modeBtn("ear:easy", "&#x1F530; やさしい", "C・Am・F・G7 など7つから") +
          modeBtn("ear:normal", "&#x1F3B8; ふつう", "18コードから") +
          modeBtn("ear:hard", "&#x1F525; むずかしい", "コード辞典360コードから（同じ根音の別の種類とくらべる）");
        h += '<h4 class="arcade-prize-cat">&#x1F3BC; コード進行で練習（2周でクリア・時間制限なし）</h4>';
        for (i = 0; i < UKE_PROGRESSIONS.length; i++) { h += modeBtn("prog:" + UKE_PROGRESSIONS[i].id, UKE_PROGRESSIONS[i].name, UKE_PROGRESSIONS[i].chords.join(" → ")); }
      } else if (ukeUi.tab === "dict") {
        h += '<p class="small" style="color:#adb5bd;margin:0 0 6px;">根音と種類を選ぶと、押さえ方と構成音が出るよ（12×30＝360コード）。</p>' +
          '<div class="uke-label">根音</div>' + ukeChips(ukeRootItems(), function (v) { return v === ukeUi.dRoot; }, "droot") +
          '<div class="uke-label">種類</div>' + ukeChips(C.QUALITIES.map(function (q) { return { v: q.id, t: q.label }; }), function (v) { return v === ukeUi.dQual; }, "dqual");
        var ds = ukeDictSpec();
        c = ukeCard(C.name(ds), ukeTonesHtml(ds), ukeVoice(ds, lowG), ukeUi.dVoice, "d");
        cards.d = { shape: c.shape, root: ds.root, name: C.name(ds), src: "コード辞典" };
        h += c.html;
      } else if (ukeUi.tab === "custom") {
        h += ukeChips([{ v: "parts", t: "&#x1F9E9; パーツで作る" }, { v: "strings", t: "&#x1F3B8; 弦で作る" }], function (v) { return v === ukeUi.sMode; }, "smode");
        if (ukeUi.sMode === "parts") {
          h += '<div class="uke-label">根音</div>' + ukeChips(ukeRootItems(), function (v) { return v === ukeUi.pRoot; }, "proot");
          var groups = [["triad", "3和音を変える"], ["4th", "4つ目の音"], ["ten", "テンション"]];
          for (var g = 0; g < groups.length; g++) {
            var items = [];
            for (i = 0; i < C.PARTS.length; i++) { if (C.PARTS[i].group === groups[g][0]) { items.push({ v: C.PARTS[i].id, t: C.PARTS[i].label }); } }
            h += '<div class="uke-label">' + groups[g][1] + '</div>' + ukeChips(items, function (v) { return ukeUi.pParts.indexOf(v) >= 0; }, "part");
          }
          h += '<div class="uke-label">on（いちばん低い音・分数コード）</div>' +
            ukeChips([{ v: -1, t: "なし" }].concat(ukeRootItems("on")), function (v) { return v === ukeUi.pBass; }, "pbass");
          var ps = ukePartsSpec();
          c = ukeCard(C.name(ps), ukeTonesHtml(ps), ukeVoice(ps, lowG), ukeUi.pVoice, "p");
          cards.p = { shape: c.shape, root: ps.root, name: C.name(ps), src: "パーツで作成" };
          h += c.html;
        } else {
          h += '<p class="small" style="color:#adb5bd;margin:4px 0;">弦ごとにフレットを選ぶと、コード名を当てるよ（0＝開放）。</p><div class="uke-strsel">';
          for (i = 0; i < 4; i++) {
            h += '<label><span>' + UKE_STRINGS[i] + '弦</span><select data-str="' + i + '">';
            for (var fr = 0; fr <= 12; fr++) { h += '<option value="' + fr + '"' + (ukeUi.sShape[i] === fr ? " selected" : "") + '>' + fr + '</option>'; }
            h += '</select></label>';
          }
          h += '</div>';
          var det = ukeDetect(ukeUi.sShape, lowG), auto = det.name || det.tones.join("・");
          h += '<label class="melody-row"><span>名前（空ならコード名を自動で）</span><input type="text" class="uke-name" maxlength="24" value="' + I.escHtml(ukeUi.sName) + '" placeholder="' + I.escHtml(auto) + '"></label>';
          var tonesH = I.escHtml(det.tones.join(" ")) + (det.alts.length ? ' <span class="uke-role">別名: ' + I.escHtml(det.alts.join(" / ")) + '</span>' : '');
          c = ukeCard(ukeUi.sName || auto, tonesH, [ukeUi.sShape.slice()], 0, "s");
          var dsp = det.name ? C.parse(det.name) : null;
          cards.s = { shape: c.shape, root: dsp ? dsp.root : null, name: ukeUi.sName || auto, src: "弦で作成" };
          h += c.html;
        }
      } else if (ukeUi.tab === "seq") {
        seqTab = ukeSeqTab({ lowG: lowG, render: render, toast: function (m) { toast = m; render(); }, done: ctl.done });
        h += seqTab.html;
      } else {
        h += '<p class="small" style="color:#adb5bd;margin:4px 0;">保存したコード（最大' + UKE_MY_MAX + '個）。「あそぶ」の「マイコードで練習」で出題されるよ。</p>';
        if (!my.length) { h += '<p class="small" style="color:#6c757d;">まだありません。コード辞典やカスタムで ⭐ 追加 を押すと入ります。</p>'; }
        for (i = 0; i < my.length; i++) {
          h += '<div class="melody-rec"><div class="melody-rec-info"><b>' + I.escHtml(my[i].name) + '</b><span class="small" style="color:#adb5bd;">押さえ方 ' + my[i].shape.join("-") + (my[i].src ? ' ・ ' + I.escHtml(my[i].src) : '') + '</span></div>' +
            '<button class="arcade-mini-btn" data-my="play" data-id="' + my[i].id + '" title="鳴らす">&#x25B6;&#xFE0F;</button>' +
            '<button class="arcade-mini-btn" data-my="del" data-id="' + my[i].id + '" title="削除">&#x1F5D1;&#xFE0F;</button></div>';
        }
      }
      if (toast) { h += '<p class="small" style="color:#55efc4;margin:6px 0 0;">' + toast + '</p>'; toast = ""; }
      h += '<div class="melody-checks"><label><input type="checkbox" data-p="lowG"' + (lowG ? " checked" : "") + '> Low-G（4弦のGを1オクターブ低く）</label>' +
        (ukeUi.tab === "play" ? '<label><input type="checkbox" data-p="notes"' + (prefs.notes ? " checked" : "") + '> 指板に音名を表示</label>' +
          '<label><input type="checkbox" data-p="tones"' + (prefs.tones ? " checked" : "") + '> コードの音がある場所を光らせる</label>' +
          '<label><input type="checkbox" data-p="fingers"' + (prefs.fingers ? " checked" : "") + '> お手本に指番号を出す</label>' : '') + '</div>' +
        '<button class="modal-btn" data-m="back" style="width:100%;margin-top:8px;">&#x1F579;&#xFE0F; メニューへ</button></div>';
      root.innerHTML = h;
      for (var k in cards) {
        if (cards.hasOwnProperty(k) && cards[k].shape) { ukeDiagram(root.querySelector('canvas[data-k="' + k + '"]'), cards[k].shape, cards[k].root, lowG); }
      }
      bind();
      if (seqTab) { seqTab.bind(root); }
    }
    function on(sel, fn) {
      var els = root.querySelectorAll(sel);
      for (var i = 0; i < els.length; i++) { els[i].onclick = fn; }
    }
    function attr(ev, a) { return ev.currentTarget.getAttribute(a); }
    function bind() {
      on("button[data-tab]", function (ev) { ukeUi.tab = attr(ev, "data-tab"); if (ukeUi.tab !== "seq") { ukeSeqStop(); } render(); });
      on("button[data-droot]", function (ev) { ukeUi.dRoot = parseInt(attr(ev, "data-droot"), 10); ukeUi.dVoice = 0; render(); });
      on("button[data-dqual]", function (ev) { ukeUi.dQual = attr(ev, "data-dqual"); ukeUi.dVoice = 0; render(); });
      on("button[data-proot]", function (ev) { ukeUi.pRoot = parseInt(attr(ev, "data-proot"), 10); ukeUi.pVoice = 0; render(); });
      on("button[data-pbass]", function (ev) { ukeUi.pBass = parseInt(attr(ev, "data-pbass"), 10); ukeUi.pVoice = 0; render(); });
      on("button[data-part]", function (ev) {
        var id = attr(ev, "data-part"), at = ukeUi.pParts.indexOf(id);
        if (at >= 0) { ukeUi.pParts.splice(at, 1); } else { ukeUi.pParts = C.addPart(ukeUi.pParts, id); }
        ukeUi.pVoice = 0;
        render();
      });
      on("button[data-smode]", function (ev) { ukeUi.sMode = attr(ev, "data-smode"); render(); });
      var sels = root.querySelectorAll("select[data-str]");
      for (var i = 0; i < sels.length; i++) {
        sels[i].onchange = function (ev) {
          ukeUi.sShape[parseInt(attr(ev, "data-str"), 10)] = parseInt(ev.currentTarget.value, 10);
          ukePlayShape(ukeUi.sShape, lowG, false);
          render();
        };
      }
      var nm = root.querySelector("input.uke-name");
      if (nm) { nm.onchange = function () { ukeUi.sName = String(nm.value || "").slice(0, 24); render(); }; }
      on("button[data-a]", function (ev) {
        var a = attr(ev, "data-a"), cd = cards[attr(ev, "data-k")];
        if (!cd || !cd.shape) { return; }
        if (a === "strum" || a === "arp") { ukePlayShape(cd.shape, lowG, a === "arp"); return; }
        if (a === "next") { if (attr(ev, "data-k") === "d") { ukeUi.dVoice++; } else { ukeUi.pVoice++; } render(); return; }
        if (a === "add") {
          toast = ukeAddMy(cd.name, cd.shape, cd.src) ? "&#x2B50; 「" + I.escHtml(cd.name) + "」をマイコードに追加しました" : "同じコードがすでにあるか、" + UKE_MY_MAX + "個までいっぱいです";
          render();
        }
      });
      on("button[data-my]", function (ev) {
        var a = attr(ev, "data-my"), id = parseInt(attr(ev, "data-id"), 10), list = ukeLoadMy();
        for (var j = 0; j < list.length; j++) {
          if (list[j].id !== id) { continue; }
          if (a === "play") { ukePlayShape(list[j].shape, lowG, false); return; }
          list.splice(j, 1);
          ukeSaveMy(list);
          render();
          return;
        }
      });
      var chks = root.querySelectorAll("input[data-p]");
      for (var ci = 0; ci < chks.length; ci++) {
        chks[ci].onchange = function (ev) {
          prefs[attr(ev, "data-p")] = !!ev.currentTarget.checked;
          lowG = prefs.lowG;
          ukeSavePrefs(prefs);
          render();
        };
      }
      on("button[data-m]", function (ev) {
        var v = attr(ev, "data-m");
        if (v === "back") { ukeSeqStop(); ctl.back(); return; }
        ukeSeqStop();
        ukeSavePrefs(prefs);
        ctl.done({ mode: v, lowG: lowG, sound: true, notes: prefs.notes, tones: prefs.tones, fingers: prefs.fingers });
      });
    }
    render();
  }

  I.register({
    id: "ukulele",
    after: "lyrics",
    cat: "music",
    music: true,
    name: "ゴリラウクレレ",
    icon: "&#x1F3B8;",
    desc: "左手で押さえて右手でジャカジャン！本物の押さえ方でコード練習",
    help: "指板を押さえたまま、下の丸の上を横にスワイプで鳴らす / 弦をタップで1本だけ / マウスはクリックで押さえる・はなす / ▲▼（↑↓）で表示するフレットの位置を動かす / Space で4本鳴らす・1〜4 で1本ずつ / P一時停止",
    controls: [
      { action: "strum", label: "&#x1F3B6; 鳴らす" },
      { action: "clear", label: "&#x270B; はなす" },
      { action: "posUp", label: "&#x25B2;" },
      { action: "posDown", label: "&#x25BC;" }
    ],
    keys: { " ": "strum", "1": "p0", "2": "p1", "3": "p2", "4": "p3", "Backspace": "clear", "ArrowUp": "posUp", "ArrowDown": "posDown" },
    setup: ukeSetup,
    setupLabel: "モードを変える",
    create: function (api, cfg) {
      cfg = cfg || {};
      var mode = cfg.mode || "free", practice = mode !== "free", lowG = !!cfg.lowG;
      var prog = mode.indexOf("prog:") === 0 ? ukeProgression(mode.substring(5)) : null, progIdx = -1, progTotal = prog ? prog.chords.length * UKE_PROG_LOOPS : 0;
      if (mode.indexOf("prog:") === 0 && !prog) { mode = "free"; practice = false; }
      var fingers = {}, sticky = {}, strums = {}, ring = [0, 0, 0, 0], lastPluck = [-999, -999, -999, -999];
      var frames = 0, chordT = 0, target = null, set = ukeChordSet(mode), correct = 0, ended = false;
      var pos = 0, myList = mode === "my" ? ukeLoadMy() : []; // pos: 表示しているいちばん上のフレット − 1（§169）
      // §171 v0.90: 弦ごとの出口（自分の音・伴奏）・勉強の助け・耳コピ
      var outs = [null, null, null, null], backOuts = [null, null, null, null];
      var showNotes = !!cfg.notes, showTones = !!cfg.tones, showFingers = cfg.fingers !== false;
      var ear = mode.indexOf("ear:") === 0 ? { level: mode.substring(4), opts: [], ans: -1, pick: -1, t: 0, reveal: 0, chord: null } : null;
      if (ear && ["easy", "normal", "hard"].indexOf(ear.level) < 0) { ear.level = "easy"; }
      if (ear && ear.level === "hard" && !C) { ear.level = "normal"; }
      if (mode === "my" && !myList.length) { mode = "free"; practice = false; }
      if (mode === "dict" && !C) { mode = "easy"; set = ukeChordSet("easy"); }
      // §170 v0.89: シーケンサーの曲に合わせて弾く
      var seqData = mode === "seq" && cfg.seq && C ? ukeSeqClean(cfg.seq) : null, seqS = null, seqIdx = 0, seqPass = 0, seqPasses = 1;
      var seqRow = -1, seqHit = {}, seqChords = 0, seqNext = "", SEQ_START = 30, seqProg = 0, seqCount = 0;
      if (seqData) {
        seqS = ukeSeqSchedule(seqData, lowG);
        seqPasses = seqData.loop ? 2 : 1;
        for (var sr = 0; sr < seqS.rows.length; sr++) { if (seqS.rows[sr].type === "chord" && seqS.rows[sr].ok) { seqChords++; } }
        if (!seqChords) { seqS = null; }
      }
      if (mode === "seq" && !seqS) { mode = "free"; practice = false; }
      var msg = "", msgT = 0, msgGood = false, wrong = null, wrongT = 0;
      var UG = window.UGMelody, ac = null;

      if (UG && cfg.sound !== false) {
        ac = UG.audioInit();
        try { UG.loadSamples([UKE_PROG]); } catch (e) {}
      }
      function presses() {
        var out = [], k;
        for (k in fingers) { if (fingers.hasOwnProperty(k) && fingers[k]) { out.push(fingers[k]); } }
        for (k in sticky) { if (sticky.hasOwnProperty(k)) { out.push(sticky[k]); } }
        return out;
      }
      function current() { return ukeFrets(presses()); }
      function nextChord() {
        if (!practice || seqS) { return; }
        if (prog) {
          progIdx++;
          if (progIdx >= progTotal) {
            ended = true;
            target = null;
            api.addScore(Math.max(0, 2000 - Math.floor(frames / 60) * 20));
            api.gameOver("CLEAR!");
            return;
          }
          target = UKE_BY_NAME[prog.chords[progIdx % prog.chords.length]];
          chordT = 0;
          pos = ukeFitPos(target.shape, pos);
          return;
        }
        var n;
        if (mode === "dict" || mode === "my") {
          var tries = 0;
          do {
            if (mode === "dict") {
              var q = C.QUALITIES[randInt(0, C.QUALITIES.length - 1)], sp = { root: randInt(0, 11), parts: q.parts, bass: null };
              var vs = ukeVoice(sp, lowG);
              n = vs.length ? { name: C.name(sp), shape: vs[0] } : null;
            } else {
              n = myList[randInt(0, myList.length - 1)];
            }
            tries++;
          } while ((!n || (target && n.name === target.name && (mode === "dict" || myList.length > 1))) && tries < 20);
          target = n;
          chordT = 0;
          pos = ukeFitPos(target.shape, pos);
          return;
        }
        do { n = set[randInt(0, set.length - 1)]; } while (set.length > 1 && target && n.name === target.name);
        target = n;
        chordT = 0;
        pos = ukeFitPos(target.shape, pos);
      }
      function sound(s, delay, vel) {
        if (!UG || !ac) { return; }
        ukeNote(UG, ac, outs, s, current()[s], ac.currentTime + (delay || 0), 0.9 * (vel || 0.8), lowG);
      }
      // 👂 耳コピ: 問題を作って鳴らす
      function earChord(pool) {
        if (ear.level === "hard") {
          var q = C.QUALITIES[randInt(0, C.QUALITIES.length - 1)], sp = { root: randInt(0, 11), parts: q.parts, bass: null }, vs = ukeVoice(sp, lowG);
          return vs.length ? { name: C.name(sp), shape: vs[0], root: sp.root } : null;
        }
        return pool[randInt(0, pool.length - 1)];
      }
      function earNext() {
        var pool = ukeChordSet(ear.level === "hard" ? "hard" : ear.level), ch = null, tries = 0;
        do { ch = earChord(pool); tries++; } while ((!ch || (ear.chord && ch.name === ear.chord.name)) && tries < 30);
        var opts = [ch], names = {};
        names[ch.name] = true;
        tries = 0;
        while (opts.length < 4 && tries < 200) {
          tries++;
          var o;
          if (ear.level === "hard") {
            // 同じ根音の別の種類とくらべる
            var q2 = C.QUALITIES[randInt(0, C.QUALITIES.length - 1)], sp2 = { root: ch.root, parts: q2.parts, bass: null };
            o = { name: C.name(sp2) };
          } else { o = pool[randInt(0, pool.length - 1)]; }
          if (!names[o.name]) { names[o.name] = true; opts.push(o); }
        }
        for (var i = opts.length - 1; i > 0; i--) { var j = randInt(0, i), tmp = opts[i]; opts[i] = opts[j]; opts[j] = tmp; }
        ear.chord = ch;
        ear.opts = opts;
        for (i = 0; i < opts.length; i++) { if (opts[i].name === ch.name) { ear.ans = i; } }
        ear.pick = -1;
        ear.t = 0;
        ear.reveal = 0;
        target = null;
        earPlay(0.25);
      }
      function earPlay(delay) {
        if (!UG || !ac || !ear.chord) { return; }
        for (var s = 0; s < 4; s++) { ukeNote(UG, ac, outs, s, ear.chord.shape[s], ac.currentTime + (delay || 0) + s * 0.03, 0.85, lowG); ring[s] = 30; }
      }
      function earAnswer(i) {
        if (!ear || ended || ear.pick >= 0 || i < 0 || i >= ear.opts.length) { return; }
        ear.pick = i;
        ear.reveal = 90;
        target = { name: ear.chord.name, shape: ear.chord.shape };
        pos = ukeFitPos(target.shape, pos);
        if (i === ear.ans) {
          var pts = 100 + Math.max(0, 50 - Math.floor(ear.t / 60) * 5);
          api.addScore(pts);
          correct++;
          msg = "◎ " + ear.chord.name + "  +" + pts;
          msgGood = true;
        } else {
          msg = "正解は " + ear.chord.name;
          msgGood = false;
          earPlay(0.1);
        }
        msgT = 80;
      }
      function judge() {
        if (!practice || ended || !target || ear) { return; }
        var cur = current(), bad = [], i;
        for (i = 0; i < 4; i++) { if (cur[i] !== target.shape[i]) { bad.push(i); } }
        if (!bad.length && seqS) {
          var hk = seqPass + ":" + seqRow;
          msg = "◎ " + target.name;
          if (!seqHit[hk]) { seqHit[hk] = true; correct++; api.addScore(100); msg += "  +100"; }
          msgGood = true;
          msgT = 40;
          wrong = null;
          return;
        }
        if (!bad.length) {
          var pts = prog ? 100 : 100 + Math.max(0, 50 - Math.floor(chordT / 60) * 5);
          api.addScore(pts);
          correct++;
          msg = "◎ " + target.name + "  +" + pts;
          msgGood = true;
          msgT = 50;
          wrong = null;
          nextChord();
        } else {
          msg = "おしい！";
          msgGood = false;
          msgT = 50;
          wrong = bad;
          wrongT = 60;
        }
      }
      function pluck(s, delay, vel) {
        sound(s, delay, vel);
        ring[s] = 30;
        lastPluck[s] = frames;
        // 4本がまとまって鳴ったら「ストローク」として判定
        for (var i = 0; i < 4; i++) { if (frames - lastPluck[i] > UKE_STRUM_WINDOW) { return; } }
        lastPluck = [-999, -999, -999, -999];
        judge();
      }
      // 曲の時間（秒）はフレームから数える（音は AudioContext の時計に合わせて予約）
      function seqStep() {
        var songT = (frames - SEQ_START) / 60, cycle = seqS.time - seqS.lead, off = seqPass * cycle, ev;
        while (seqIdx < seqS.events.length && (ev = seqS.events[seqIdx]).t + off <= songT + 0.1) {
          var play = ev.kind === "click" ? seqData.metronome || ev.t < seqS.lead : seqData.backing;
          if (play && UG && ac) { ukeSeqPlayEvent(UG, ac, ev, ac.currentTime + Math.max(0, ev.t + off - songT), lowG, 0.55, backOuts); }
          seqIdx++;
        }
        if (songT >= off + seqS.time) {
          if (seqPass + 1 < seqPasses) {
            seqPass++;
            seqIdx = 0;
            while (seqIdx < seqS.events.length && seqS.events[seqIdx].t < seqS.lead - 1e-6) { seqIdx++; }
            return;
          }
          ended = true;
          target = null;
          api.gameOver(correct >= seqChords * seqPasses ? "CLEAR!" : "おつかれさま！");
          return;
        }
        var cur = -1, nx = -1, i;
        for (i = 0; i < seqS.rows.length; i++) {
          var r = seqS.rows[i];
          if (r.type === "key") { continue; }
          if (songT >= r.t0 + off && songT < r.t1 + off) { cur = i; }
          else if (r.t0 + off > songT && r.type === "chord" && nx < 0) { nx = i; }
        }
        // いまの行のどこまで進んだか（0〜1）と、カウントインの数字
        seqProg = cur >= 0 ? Math.max(0, Math.min(1, (songT - seqS.rows[cur].t0 - off) / Math.max(0.01, seqS.rows[cur].t1 - seqS.rows[cur].t0))) : 0;
        seqCount = seqPass === 0 && songT >= 0 && songT < seqS.lead ? Math.floor(songT / seqS.spb) + 1 : 0;
        if (cur !== seqRow) {
          seqRow = cur;
          var cr = cur >= 0 ? seqS.rows[cur] : null;
          target = cr && cr.type === "chord" && cr.ok ? { name: cr.name, shape: cr.shape } : null;
          chordT = 0;
          if (target) { pos = ukeFitPos(target.shape, pos); }
        }
        seqNext = nx >= 0 ? seqS.rows[nx].name : (seqPass + 1 < seqPasses && seqS.rows.length ? "（もう1周）" : "おわり");
      }
      function strumAll() {
        if (ear) { earPlay(0); return; }
        for (var s = 0; s < 4; s++) { pluck(s, s * 0.025, 0.85); }
      }

      if (ear) { practice = true; earNext(); } else { nextChord(); }

      return {
        input: function (action, down) {
          if (!down) { return; }
          if (action === "strum") { strumAll(); }
          else if (action === "clear") { sticky = {}; }
          else if (action === "posUp") { pos = Math.max(0, pos - 1); }
          else if (action === "posDown") { pos = Math.min(UKE_MAX_POS, pos + 1); }
          else if (action.charAt(0) === "p") {
            if (ear) { earAnswer(parseInt(action.substring(1), 10)); } else { pluck(parseInt(action.substring(1), 10), 0, 0.8); }
          }
        },
        pointer: function (type, x, y, id, kind) {
          if (id === undefined) { id = "p"; }
          if (type === "down" && ear) {
            // 耳コピ: 答えボタン / サウンドホールでもう一度
            for (var bi = 0; bi < ear.opts.length; bi++) {
              var bb = ukeEarBtn(bi);
              if (x >= bb.x && x <= bb.x + bb.w && y >= bb.y && y <= bb.y + bb.h) { earAnswer(bi); return; }
            }
            if (y >= UKE_STRUM_Y) { earPlay(0); }
            return;
          }
          if (type === "down") {
            var cell = ukeCellAt(x, y);
            if (cell) {
              cell = { s: cell.s, f: cell.f + pos };
              if (kind === "mouse") {
                var key = cell.s + "," + cell.f;
                if (sticky[key]) { delete sticky[key]; } else { sticky[key] = cell; }
              } else {
                fingers[id] = cell;
              }
              return;
            }
            if (y >= UKE_STRUM_Y) {
              var st = { lx: x };
              st.lf = frames;
              for (var s = 0; s < 4; s++) {
                if (Math.abs(x - UKE_STRX[s]) <= 8) { pluck(s, 0, 0.75); st.lx = UKE_STRX[s]; break; }
              }
              strums[id] = st;
            }
            return;
          }
          if (type === "move") {
            if (fingers[id]) {
              var c2 = ukeCellAt(x, y);
              if (c2) { fingers[id] = { s: c2.s, f: c2.f + pos }; }
              return;
            }
            if (strums[id]) {
              var sm = strums[id], cr = ukeCrossed(sm.lx, x);
              if (cr.length) {
                // 速いスワイプほど強く。アップストロークは少し弱い
                var vel = ukeVelocity(Math.abs(x - sm.lx) / Math.max(1, frames - sm.lf)) * (x < sm.lx ? 0.85 : 1);
                for (var k = 0; k < cr.length; k++) { pluck(cr[k], 0, vel); }
              }
              sm.lx = x;
              sm.lf = frames;
            }
            return;
          }
          if (type === "up") {
            delete fingers[id];
            delete strums[id];
          }
        },
        step: function () {
          frames++;
          chordT++;
          for (var s = 0; s < 4; s++) { if (ring[s] > 0) { ring[s]--; } }
          if (msgT > 0) { msgT--; }
          if (wrongT > 0) { wrongT--; if (wrongT === 0) { wrong = null; } }
          if (practice && !prog && !seqS && !ended && frames >= UKE_TIME) { ended = true; api.gameOver("TIME UP"); }
          if (ear && !ended) {
            ear.t++;
            if (ear.reveal > 0) { ear.reveal--; if (ear.reveal === 0) { earNext(); } }
          }
          if (seqS && !ended) { seqStep(); }
        },
        draw: function (ctx) {
          var s, f, i;
          var cur = current(), held = presses();
          // ボディと指板
          ctx.fillStyle = "#3b2414";
          ctx.fillRect(0, 0, W, 320);
          ctx.fillStyle = "#5c3a1e";
          ctx.fillRect(UKE_STRX[0] - 22, UKE_NUT_Y, UKE_STRX[3] - UKE_STRX[0] + 44, UKE_FRETS * UKE_FH);
          ctx.fillStyle = "#c68642";
          ctx.beginPath(); ctx.arc(W / 2, UKE_HOLE_Y, 70, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#1b0f07";
          ctx.beginPath(); ctx.arc(W / 2, UKE_HOLE_Y, 34, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "#e9c46a";
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(W / 2, UKE_HOLE_Y, 38, 0, Math.PI * 2); ctx.stroke();
          // ナット・フレット（ポジションが上がっているときはナットのかわりに線）
          ctx.fillStyle = pos === 0 ? "#f1e4c8" : "#8d6e4a";
          ctx.fillRect(UKE_STRX[0] - 22, UKE_NUT_Y - 4, UKE_STRX[3] - UKE_STRX[0] + 44, pos === 0 ? 4 : 2);
          ctx.strokeStyle = "#c0c0c0";
          ctx.lineWidth = 1.5;
          for (f = 1; f <= UKE_FRETS; f++) {
            var fy = UKE_NUT_Y + f * UKE_FH;
            ctx.beginPath(); ctx.moveTo(UKE_STRX[0] - 22, fy); ctx.lineTo(UKE_STRX[3] + 22, fy); ctx.stroke();
          }
          ctx.fillStyle = "#f1e4c8";
          var MARKS = [3, 5, 7, 10, 12, 15];
          for (i = 0; i < MARKS.length; i++) {
            var mk = MARKS[i] - pos;
            if (mk < 1 || mk > UKE_FRETS) { continue; }
            ctx.beginPath(); ctx.arc(W / 2, UKE_NUT_Y + (mk - 0.5) * UKE_FH, 3, 0, Math.PI * 2); ctx.fill();
            if (MARKS[i] === 12) { ctx.beginPath(); ctx.arc(W / 2 - 22, UKE_NUT_Y + (mk - 0.5) * UKE_FH, 3, 0, Math.PI * 2); ctx.arc(W / 2 + 22, UKE_NUT_Y + (mk - 0.5) * UKE_FH, 3, 0, Math.PI * 2); ctx.fill(); }
          }
          ctx.fillStyle = "#e9c46a";
          ctx.font = "bold 9px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          for (f = 1; f <= UKE_FRETS; f++) { ctx.fillText(String(f + pos), 14, UKE_NUT_Y + (f - 0.5) * UKE_FH); }
          if (pos > 0) { ctx.fillText("▲", 14, UKE_NUT_Y - 11); }
          // 弦（鳴っている弦は揺らす）
          for (s = 0; s < 4; s++) {
            ctx.strokeStyle = ring[s] > 0 ? "#ffd166" : "#e0e0e0";
            ctx.lineWidth = 1 + (3 - s) * 0.3;
            var amp = ring[s] > 0 ? (ring[s] / 30) * 2.2 : 0;
            ctx.beginPath();
            ctx.moveTo(UKE_STRX[s], UKE_NUT_Y);
            for (var yy = UKE_NUT_Y; yy <= 304; yy += 8) { ctx.lineTo(UKE_STRX[s] + Math.sin(yy / 6 + frames) * amp, yy); }
            ctx.stroke();
            ctx.fillStyle = "#e9c46a";
            ctx.fillText(UKE_STRINGS[s], UKE_STRX[s], UKE_NUT_Y - 11);
          }
          // お手本（練習モード: やさしい・ふつうはいつも、むずかしいは4秒後）
          if (target && (mode !== "hard" || chordT >= 240)) {
            ctx.strokeStyle = "rgba(116,185,255,0.95)";
            ctx.lineWidth = 2;
            for (s = 0; s < 4; s++) {
              var tf = target.shape[s] - pos;
              if (target.shape[s] > 0 && tf >= 1 && tf <= UKE_FRETS) {
                ctx.beginPath(); ctx.arc(UKE_STRX[s], UKE_NUT_Y + (tf - 0.5) * UKE_FH, 11, 0, Math.PI * 2); ctx.stroke();
              }
            }
          }
          // §171: 指板の音名・コードの音がある場所
          if (showTones) {
            var tsp = null, tpcs = null;
            if (target) { tsp = C ? C.parse(target.name) : null; }
            else if (!practice) { var dd = ukeDetect(cur, lowG); tsp = dd.name && C ? C.parse(dd.name) : null; }
            if (tsp) { tpcs = C.pcs(tsp); }
            else if (target) { tpcs = []; for (s = 0; s < 4; s++) { tpcs.push(ukeMidi(s, target.shape[s], lowG) % 12); } }
            if (tpcs && !(ear && ear.pick < 0)) {
              for (s = 0; s < 4; s++) {
                for (f = 1; f <= UKE_FRETS; f++) {
                  var npc = ukeMidi(s, f + pos, lowG) % 12;
                  if (tpcs.indexOf(npc) < 0) { continue; }
                  ctx.strokeStyle = tsp && npc === tsp.root ? "rgba(255,118,117,0.9)" : "rgba(85,239,196,0.8)";
                  ctx.lineWidth = 1.5;
                  ctx.beginPath(); ctx.arc(UKE_STRX[s], UKE_NUT_Y + (f - 0.5) * UKE_FH, 5, 0, Math.PI * 2); ctx.stroke();
                }
              }
            }
          }
          if (showNotes) {
            ctx.fillStyle = "rgba(241,228,200,0.75)";
            ctx.font = "7px sans-serif";
            ctx.textAlign = "left";
            for (s = 0; s < 4; s++) {
              for (f = 1; f <= UKE_FRETS; f++) { ctx.fillText(ukeNoteName(ukeMidi(s, f + pos, lowG)), UKE_STRX[s] + 5, UKE_NUT_Y + (f - 0.5) * UKE_FH - 7); }
            }
            ctx.textAlign = "center";
          }
          // お手本の指番号
          if (target && showFingers && (mode !== "hard" || chordT >= 240)) {
            var fg = ukeFingering(target.shape);
            ctx.fillStyle = "#74b9ff";
            ctx.font = "bold 10px sans-serif";
            for (s = 0; s < 4; s++) {
              var ff = target.shape[s] - pos;
              if (fg[s] && ff >= 1 && ff <= UKE_FRETS) { ctx.fillText(String(fg[s]), UKE_STRX[s], UKE_NUT_Y + (ff - 0.5) * UKE_FH); }
            }
          }
          // 押さえている指
          for (i = 0; i < held.length; i++) {
            var p = held[i], top = cur[p.s] === p.f, pf = p.f - pos;
            if (pf < 1 || pf > UKE_FRETS) { continue; }
            ctx.fillStyle = top ? "rgba(255,209,102,0.95)" : "rgba(255,209,102,0.45)";
            ctx.beginPath(); ctx.arc(UKE_STRX[p.s], UKE_NUT_Y + (pf - 0.5) * UKE_FH, 9, 0, Math.PI * 2); ctx.fill();
          }
          // ちがう弦に ×
          if (wrong) {
            ctx.fillStyle = "#ff7675";
            ctx.font = "bold 14px sans-serif";
            for (i = 0; i < wrong.length; i++) { ctx.fillText("×", UKE_STRX[wrong[i]], UKE_NUT_Y + UKE_FRETS * UKE_FH + 10); }
          } else {
            // 各弦のいまの音名
            ctx.fillStyle = "#f1e4c8";
            ctx.font = "bold 10px sans-serif";
            for (s = 0; s < 4; s++) { ctx.fillText(ukeNoteName(ukeMidi(s, cur[s], lowG)), UKE_STRX[s], UKE_NUT_Y + UKE_FRETS * UKE_FH + 10); }
          }
          // 上の表示
          var det = ukeDetect(cur, lowG), name = det.name;
          ctx.textAlign = "left";
          if (ear) {
            hudText(ctx, "👂 どのコード？", 6, 9);
            hudText(ctx, "のこり " + Math.max(0, Math.ceil((UKE_TIME - frames) / 60)) + "秒  せいかい " + correct, W - 6, 9, "right");
            for (i = 0; i < ear.opts.length; i++) {
              var eb = ukeEarBtn(i), st2 = ear.pick < 0 ? 0 : (i === ear.ans ? 1 : (i === ear.pick ? 2 : 0));
              ctx.fillStyle = st2 === 1 ? "rgba(0,184,148,0.92)" : (st2 === 2 ? "rgba(214,48,49,0.92)" : "rgba(27,38,59,0.92)");
              ctx.fillRect(eb.x, eb.y, eb.w, eb.h);
              ctx.strokeStyle = "#74b9ff";
              ctx.lineWidth = 1.5;
              ctx.strokeRect(eb.x, eb.y, eb.w, eb.h);
              ctx.fillStyle = "#ffffff";
              var on = ear.opts[i].name;
              ctx.font = "bold " + (on.length <= 5 ? 16 : (on.length <= 8 ? 12 : 10)) + "px sans-serif";
              ctx.textAlign = "center";
              ctx.fillText(on, eb.x + eb.w / 2, eb.y + eb.h / 2);
              ctx.fillStyle = "#adb5bd";
              ctx.font = "8px sans-serif";
              ctx.fillText(String(i + 1), eb.x + 8, eb.y + 9);
            }
          } else if (seqS) {
            hudText(ctx, "お題", 6, 9);
            ctx.fillStyle = "#ffffff";
            var tn = target ? target.name : "休み";
            ctx.font = "bold " + (tn.length <= 4 ? 18 : (tn.length <= 7 ? 14 : 11)) + "px sans-serif";
            ctx.fillText(tn, 34, 10);
            hudText(ctx, "BPM " + seqData.bpm + "  つぎ: " + seqNext, W - 6, 9, "right");
            hudText(ctx, "せいかい " + correct + "/" + (seqChords * seqPasses), W - 6, 22, "right");
            ctx.fillStyle = "rgba(255,255,255,0.2)";
            ctx.fillRect(6, 22, 96, 3);
            ctx.fillStyle = "#ffd166";
            ctx.fillRect(6, 22, 96 * seqProg, 3);
          } else if (practice && target) {
            hudText(ctx, "お題", 6, 9);
            ctx.fillStyle = "#ffffff";
            // 長いコード名（C7(♭9,13) など）は小さくして右の表示と重ならないようにする
            ctx.font = "bold " + (target.name.length <= 4 ? 18 : (target.name.length <= 7 ? 14 : 11)) + "px sans-serif";
            ctx.fillText(target.name, 34, 10);
            if (prog) {
              var nx = progIdx + 1 < progTotal ? prog.chords[(progIdx + 1) % prog.chords.length] : "ゴール";
              hudText(ctx, (progIdx + 1) + "/" + progTotal + "  つぎ: " + nx, W - 6, 9, "right");
            } else {
              var remain = Math.max(0, Math.ceil((UKE_TIME - frames) / 60));
              hudText(ctx, "のこり " + remain + "秒  せいかい " + correct, W - 6, 9, "right");
            }
            if (name) { hudText(ctx, "いま: " + name, W - 6, 22, "right"); }
          } else {
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold " + ((name || "").length <= 6 ? 18 : 13) + "px sans-serif";
            ctx.fillText(name || "♪", 8, 12);
            hudText(ctx, "フリー演奏" + (lowG ? "（Low-G）" : ""), W - 6, 9, "right");
            if (det.alts && det.alts.length) { hudText(ctx, "別名: " + det.alts[0], W - 6, 22, "right"); }
          }
          if (seqCount > 0) {
            ctx.fillStyle = "#ffd166";
            ctx.font = "bold 36px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(String(seqCount), W / 2, UKE_HOLE_Y);
          } else if (msgT > 0) {
            ctx.fillStyle = msgGood ? "#55efc4" : "#ff7675";
            ctx.font = "bold 16px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(msg, W / 2, UKE_HOLE_Y);
          } else if (ear) {
            hudText(ctx, "タップでもう一度聞く", W / 2, UKE_HOLE_Y, "center");
          } else if (frames < 300 && !held.length) {
            hudText(ctx, "ここを横にスワイプ", W / 2, UKE_HOLE_Y, "center");
          }
        }
      };
    }
  });

  // テスト・他ファイル用の読み取り口
  window.UGUkulele = {
    chords: UKE_CHORDS, chordSet: ukeChordSet, progressions: UKE_PROGRESSIONS, byName: UKE_BY_NAME, PROG_LOOPS: UKE_PROG_LOOPS, chordName: ukeChordName, midi: ukeMidi, cellAt: ukeCellAt, crossed: ukeCrossed, frets: ukeFrets,
    STRX: UKE_STRX, NUT_Y: UKE_NUT_Y, FH: UKE_FH, STRUM_Y: UKE_STRUM_Y,
    fingering: ukeFingering, velocity: ukeVelocity, stringOut: ukeStringOut, earBtn: ukeEarBtn, prefs: ukePrefs,
    seqRec: ukeSeqRec, exportMidi: ukeSeqExportMidi, exportWav: ukeSeqExportWav,
    seqClean: ukeSeqClean, seqLoad: ukeSeqLoad, seqSave: ukeSeqSave, seqSchedule: ukeSeqSchedule, seqPresets: ukeSeqPresets, resolve: ukeResolve, SEQ_KEY: UKE_SEQ_KEY,
    ui: ukeUi, fitPos: ukeFitPos, voice: ukeVoice, detect: ukeDetect, loadMy: ukeLoadMy, saveMy: ukeSaveMy, addMy: ukeAddMy, MY_KEY: UKE_MY_KEY
  };
})();
