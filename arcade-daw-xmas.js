// =========================================================
// 究極ゴリラ — 🎄 Gorilla Christmas Production Pack（§343 v2.72・ゴリラDAW）
// クリスマスの音色（シンセのパッチ・ゲームの楽器の録音）・演奏パターン・MIDI 伴奏ジェネレーター・テンプレート・🎧 リファレンス解析 Lite
// arcade-daw.js の後に読みこむ。画面は DAW の st.view = "xmas"（DAW から host を受けとって描く）。ES5
// 音はいまのエンジンだけ（UGSynth.note・UGMelody のサンプル・UGMelody.drum）。固有の曲のメロディ・フレーズは入れない
// =========================================================
(function () {
  "use strict";

  var PPQ = 960, STEP = 240;
  var MAXB = 256; // 曲の上限（arcade-daw-model.js の MAX_BARS と同じ。モデルは公開していない → v2.74 で直す: 前は M.MAX_BARS が undefined で上限の確認が素通りした）
  function DM() { return window.UGDawModel; }
  function UGM() { return window.UGMelody; }
  function SY() { return window.UGSynth; }
  function esc(s) { return String(s === undefined || s === null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  // シードつきの疑似乱数（mulberry32）。同じシードなら同じ並び（Math.random は使わない）
  function rng(seed) {
    var a = (Number(seed) >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul ? Math.imul(t ^ (t >>> 15), t | 1) : mul(t ^ (t >>> 15), t | 1);
      t ^= t + (Math.imul ? Math.imul(t ^ (t >>> 7), t | 61) : mul(t ^ (t >>> 7), t | 61));
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function mul(a, b) { var ah = (a >>> 16) & 0xffff, al = a & 0xffff, bh = (b >>> 16) & 0xffff, bl = b & 0xffff; return ((al * bl) + (((ah * bl + al * bh) << 16) >>> 0) | 0); }

  // ---------- 音楽の理論（メジャーのキー・ダイアトニックのコード）----------
  var KEYS = ["C", "C#", "D", "E♭", "E", "F", "F#", "G", "A♭", "A", "B♭", "B"];
  var SCALE = [0, 2, 4, 5, 7, 9, 11];
  var SCALES = { maj: SCALE, min: [0, 2, 3, 5, 7, 8, 10] }; // マイナーは自然的短音階（V・V7 は和声的短音階のコードで使う）
  var MODES = [["maj", "メジャー"], ["min", "マイナー"]];
  function modeName(m) { return m === "min" ? "マイナー" : "メジャー"; }
  // id: [キーの主音からの半音, 構成音（根音から）, 名前の後ろ]
  var CHORDS = {
    "I": [0, [0, 4, 7], ""], "ii": [2, [0, 3, 7], "m"], "iii": [4, [0, 3, 7], "m"], "IV": [5, [0, 4, 7], ""], "V": [7, [0, 4, 7], ""], "vi": [9, [0, 3, 7], "m"],
    "V7": [7, [0, 4, 7, 10], "7"], "ii7": [2, [0, 3, 7, 10], "m7"], "Imaj7": [0, [0, 4, 7, 11], "maj7"], "IVmaj7": [5, [0, 4, 7, 11], "maj7"], "vi7": [9, [0, 3, 7, 10], "m7"],
    // v2.74 §345 A2: 4 番目 ＝ オンコードのベースの音（根音からの半音）
    "iii7": [4, [0, 3, 7, 10], "m7"], "Isus4": [0, [0, 5, 7], "sus4"], "Vsus4": [7, [0, 5, 7], "sus4"], "V7sus4": [7, [0, 5, 7, 10], "7sus4"], "Iadd9": [0, [0, 4, 7, 14], "add9"], "IVadd9": [5, [0, 4, 7, 14], "add9"],
    "V/ii": [9, [0, 4, 7, 10], "7"], "V/iii": [11, [0, 4, 7, 10], "7"], "V/IV": [0, [0, 4, 7, 10], "7"], "V/V": [2, [0, 4, 7, 10], "7"], "V/vi": [4, [0, 4, 7, 10], "7"],
    "I_3": [0, [0, 4, 7], "", 4], "I_5": [0, [0, 4, 7], "", 7], "IV_1": [5, [0, 4, 7], "", 7], "V_4": [7, [0, 4, 7], "", 10], "ii_1": [2, [0, 3, 7], "m", 10], "vi_5": [9, [0, 3, 7], "m", 7],
    // マイナーキー（主音からの半音）
    "i": [0, [0, 3, 7], "m"], "ii°": [2, [0, 3, 6], "dim"], "III": [3, [0, 4, 7], ""], "iv": [5, [0, 3, 7], "m"], "v": [7, [0, 3, 7], "m"], "VI": [8, [0, 4, 7], ""], "VII": [10, [0, 4, 7], ""],
    "i7": [0, [0, 3, 7, 10], "m7"], "iiø7": [2, [0, 3, 6, 10], "m7♭5"], "iv7": [5, [0, 3, 7, 10], "m7"], "VImaj7": [8, [0, 4, 7, 11], "maj7"], "IIImaj7": [3, [0, 4, 7, 11], "maj7"], "i_3": [0, [0, 3, 7], "m", 3]
  };
  // キーの種類ごとの「小節ごとのコード」の一覧
  var CHORD_LISTS = {
    maj: ["I", "ii", "iii", "IV", "V", "vi", "V7", "ii7", "iii7", "Imaj7", "IVmaj7", "vi7", "Isus4", "Vsus4", "V7sus4", "Iadd9", "IVadd9", "V/ii", "V/iii", "V/IV", "V/V", "V/vi", "I_3", "I_5", "IV_1", "V_4", "ii_1", "vi_5"],
    min: ["i", "ii°", "III", "iv", "v", "V", "VI", "VII", "i7", "iiø7", "iv7", "V7", "VImaj7", "IIImaj7", "Vsus4", "V7sus4", "V/IV", "i_3"]
  };
  // メジャーの進行をマイナーで使うときの読みかえ
  var MINMAP = { "I": "i", "ii": "ii°", "iii": "III", "IV": "iv", "V": "V", "vi": "VI", "V7": "V7", "ii7": "iiø7", "Imaj7": "i7", "IVmaj7": "iv7", "vi7": "VImaj7", "iii7": "IIImaj7", "I_3": "i_3" };
  function chordLabel(id) { return String(id).replace("_", "/"); }
  var CHORD_ORDER = ["I", "ii", "iii", "IV", "V", "vi", "V7", "ii7", "Imaj7", "IVmaj7", "vi7"];
  // ジャズの 7th（三和音のときに足す 7 度）
  var SEVENTH = { "I": 11, "ii": 10, "iii": 10, "IV": 11, "V": 10, "vi": 10, "i": 10, "ii°": 10, "III": 11, "iv": 10, "v": 10, "VI": 11, "VII": 10 };
  var PROGS = [
    ["p1", "I–vi–IV–V", ["I", "vi", "IV", "V"]],
    ["p2", "I–V–vi–IV", ["I", "V", "vi", "IV"]],
    ["p3", "I–IV–V–I", ["I", "IV", "V", "I"]],
    ["p4", "ii–V–I", ["ii7", "V7", "Imaj7", "Imaj7"]],
    ["p5", "I–vi–ii–V", ["I", "vi", "ii", "V"]],
    ["p6", "IV–V–iii–vi", ["IV", "V", "iii", "vi"]],
    ["p7", "vi–IV–I–V", ["vi", "IV", "I", "V"]],
    ["p8", "Imaj7–vi7–ii7–V7", ["Imaj7", "vi7", "ii7", "V7"]],
    ["p9", "IV–V–I/3–vi", ["IV", "V", "I_3", "vi"]],
    ["m1", "i–VI–III–VII（マイナー）", ["i", "VI", "III", "VII"], "min"],
    ["m2", "i–iv–V–i（マイナー）", ["i", "iv", "V", "i"], "min"],
    ["m3", "i–VI–iv–V（マイナー）", ["i", "VI", "iv", "V"], "min"],
    ["m4", "iiø7–V7–i7（マイナー）", ["iiø7", "V7", "i7", "i7"], "min"]
  ];
  function progById(id) { for (var i = 0; i < PROGS.length; i++) { if (PROGS[i][0] === id) { return PROGS[i]; } } return PROGS[0]; }
  function chordOf(key, id) {
    var c = CHORDS[id] || CHORDS.I, k = ((Math.round(Number(key)) || 0) % 12 + 12) % 12, r = (k + c[0]) % 12, pcs = [], i;
    for (i = 0; i < c[1].length; i++) { pcs.push((r + c[1][i]) % 12); }
    var bs = c[3] !== undefined ? (r + c[3]) % 12 : r;
    return { id: CHORDS[id] ? id : "I", root: r, pcs: pcs, ivs: c[1].slice(), name: KEYS[r] + c[2] + (bs !== r ? "/" + KEYS[bs] : ""), key: k, bass: bs, fifth: (r + (c[1][2] !== undefined ? c[1][2] : 7)) % 12 };
  }
  // 小節ごとのコード（進行を小節の数だけくり返す）。custom: { 小節（0 から）: コードの id } で上書き。mode "min" ＝ メジャーの進行を読みかえる
  function chordsFor(progId, bars, custom, mode) {
    var P = progById(progId), pr = P[2], mp = mode === "min" && P[3] !== "min", out = [], b;
    for (b = 0; b < bars; b++) { var q = pr[b % pr.length], c = custom && CHORDS[custom[b]] ? custom[b] : (mp && MINMAP[q] ? MINMAP[q] : q); out.push(c); }
    return out;
  }
  function pcIn(pc, lo) { return lo + ((pc - lo) % 12 + 12) % 12; } // lo 以上でいちばん低い pc の音
  function avg(a) { var s = 0, i; for (i = 0; i < a.length; i++) { s += a[i]; } return a.length ? s / a.length : 0; }
  // 和音の形（center のあたり・前の和音に近い転回）
  function voice(pcs, center, prev) {
    var best = null, bestD = 1e9, lo, i, target = prev && prev.length ? avg(prev) : center;
    for (lo = center - 7; lo <= center + 4; lo++) {
      var ns = [];
      for (i = 0; i < pcs.length; i++) { ns.push(pcIn(pcs[i], lo)); }
      ns.sort(function (a, b) { return a - b; });
      var d = Math.abs(avg(ns) - target) + Math.abs(avg(ns) - center) * 0.35;
      if (d < bestD - 1e-9) { bestD = d; best = ns; }
    }
    return best;
  }
  function scaleTone(key, m, dir, mode) { // m から dir（＋1／−1）の方向にいちばん近いキーの音
    var k = ((key % 12) + 12) % 12, x = m + dir, g = 0, S = SCALES[mode] || SCALE;
    while (g++ < 13) { if (S.indexOf(((x - k) % 12 + 12) % 12) >= 0) { return x; } x += dir; }
    return m + dir;
  }

  // ---------- 音色（§343）----------
  // [id, カテゴリ, 名前, 作り方 "syn"|"smp"|"drum", 中身, そのほか]
  // syn: ゴリラシンセのパッチ（いまの形）。smp: { prog（UGMelody のサンプルの番号）, loop, att, rel, gain }。drum: ドラムのトラック（pat ＝ はじめのパターン）
  // そのほか: gm（MIDI の音色番号）・rev（残響の送り）・eq・lo／hi（試聴の高さ）・f（特徴の目安 [明るさ, 低音, 倍音, ノイズ, アタック, 減衰の速さ] 0〜1）・lic・fb（録音が使えないときのシンセ）
  var CATS = [["bells", "&#x1F514; Christmas Bells"], ["orch", "&#x1F3BB; Christmas Orchestra"], ["pop", "&#x2728; Christmas Pop"], ["jazz", "&#x1F3B7; Christmas Jazz"], ["more", "&#x1F3B8; More（ギター・木管・声・ベース）"]];
  var LIC = {
    cc0: "CC0（VSCO 2 CE）・表記なしで商用に使える",
    fluid: "CC BY 3.0（FluidR3_GM・Frank Wen）・クレジットの表記が要る",
    sal: "CC BY 3.0（Salamander Grand Piano・Alexander Holm）・クレジットの表記が要る",
    gs: "CC BY 3.0（GregSullivan E-Pianos）・クレジットの表記が要る",
    own: "ゴリラシンセで作った音（権利の表記は要らない）"
  };
  var SOUNDS = [
    ["xm-sleigh", "bells", "&#x1F6F7; Sleigh Bells（スレイベル）", "drum", { pat: "sleigh8" }, { gm: 83, f: [0.95, 0, 0.4, 0.85, 0.9, 0.7], lic: "own", how: "ドラム（83 Jingle Bell を合成）" }],
    ["xm-glock", "bells", "&#x1F514; Glockenspiel（グロッケン）", "smp", { prog: 9, rel: 0.6, gain: 2.7 }, { gm: 9, rev: 0.25, lo: 72, hi: 96, f: [0.85, 0, 0.25, 0.05, 0.9, 0.35], lic: "cc0", fb: "bell" }],
    ["xm-celesta", "bells", "&#x2728; Celesta（チェレスタ）", "smp", { prog: 8, rel: 0.5, gain: 1.1 }, { gm: 8, rev: 0.25, lo: 60, hi: 96, f: [0.7, 0.05, 0.3, 0.05, 0.75, 0.45], lic: "fluid", fb: "xm-musicbox" }],
    ["xm-musicbox", "bells", "&#x1F381; Music Box（オルゴール風）", "syn", { w1: "tri", w2: "sine", mix: 0.45, oct2: 1, det: 2, cut: 0.9, res: 0, env: 0, a: 0.002, d: 0.9, s: 0, r: 0.8, ldep: 0, vol: 0.75 }, { gm: 10, rev: 0.3, lo: 72, hi: 96, f: [0.75, 0, 0.3, 0.02, 0.85, 0.55], lic: "own" }],
    ["xm-chimes", "bells", "&#x1F390; Soft Chimes（やわらかいチャイム）", "syn", { w1: "sine", w2: "sine", mix: 0.55, oct2: 1, det: 9, cut: 1, env: 0, a: 0.004, d: 2, s: 0, r: 2.2, lrate: 0.4, ldep: 0.04, lto: "amp", vol: 0.7 }, { gm: 14, rev: 0.4, lo: 67, hi: 91, f: [0.6, 0.05, 0.25, 0.02, 0.6, 0.15], lic: "own" }],
    ["xm-brightbells", "bells", "&#x1F31F; Bright Christmas Bells（明るいベル）", "syn", { w1: "square", w2: "sine", mix: 0.6, oct2: 1, det: 4, cut: 0.75, res: 0.15, env: 0.45, fd: 0.25, fs: 0.3, a: 0.002, d: 1.1, s: 0, r: 1, vol: 0.55 }, { gm: 112, rev: 0.25, lo: 67, hi: 91, f: [0.85, 0.05, 0.6, 0.05, 0.9, 0.35], lic: "own" }],
    ["xm-8bitbells", "bells", "&#x1F47E; 8bit Bells（ピコピコのベル）", "syn", { w1: "square", w2: "square", mix: 0.35, oct2: 1, det: 0, cut: 1, res: 0, env: 0, a: 0.002, d: 0.35, s: 0, r: 0.2, ldep: 0, vol: 0.5 }, { gm: 80, lo: 67, hi: 91, f: [0.8, 0.05, 0.85, 0.05, 0.95, 0.7], lic: "own" }],
    ["xm-strings", "orch", "&#x1F3BB; Warm Strings（あたたかい弦の合奏）", "smp", { prog: 48, loop: true, att: 0.08, rel: 0.45, gain: 0.95 }, { gm: 48, rev: 0.3, lo: 48, hi: 84, f: [0.45, 0.25, 0.7, 0.1, 0.2, 0.1], lic: "cc0", fb: "spad" }],
    ["xm-pizz", "orch", "&#x1F3BB; Pizzicato Strings（ピチカート）", "smp", { prog: 45, rel: 0.2, gain: 0.85 }, { gm: 45, rev: 0.2, lo: 40, hi: 79, f: [0.45, 0.25, 0.5, 0.1, 0.85, 0.8], lic: "cc0", fb: "pluck" }],
    ["xm-horn", "orch", "&#x1F4EF; Christmas Horn（ホルン）", "smp", { prog: 60, loop: true, att: 0.04, rel: 0.3, gain: 0.75 }, { gm: 60, rev: 0.25, lo: 41, hi: 72, f: [0.35, 0.3, 0.55, 0.05, 0.3, 0.1], lic: "cc0", fb: "brass" }],
    ["xm-softbrass", "orch", "&#x1F3BA; Soft Brass（やわらかいブラス）", "smp", { prog: 1061, loop: true, att: 0.05, rel: 0.3, gain: 0.75 }, { gm: 61, rev: 0.2, lo: 48, hi: 76, f: [0.4, 0.3, 0.65, 0.05, 0.35, 0.1], lic: "cc0", fb: "brass" }],
    ["xm-church", "orch", "&#x26EA; Church Organ（教会のオルガン）", "smp", { prog: 19, loop: true, att: 0.015, rel: 0.25, gain: 1.0 }, { gm: 19, rev: 0.45, lo: 36, hi: 84, f: [0.5, 0.45, 0.75, 0.05, 0.25, 0.05], lic: "cc0", fb: "organ" }],
    ["xm-harp", "orch", "&#x1FA89; Orchestral Harp（ハープ）", "smp", { prog: 46, rel: 0.6, gain: 0.5 }, { gm: 46, rev: 0.3, lo: 36, hi: 91, f: [0.5, 0.2, 0.4, 0.05, 0.8, 0.5], lic: "cc0", fb: "pluck" }],
    ["xm-cinepad", "orch", "&#x1F3AC; Cinematic Pad（映画のようなパッド）", "syn", { w1: "saw", w2: "tri", mix: 0.6, det: 10, uni: 3, cut: 0.35, res: 0.1, env: 0.15, fd: 1.5, fs: 0.6, a: 1.2, d: 1.5, s: 0.85, r: 2, lrate: 0.2, ldep: 0.3, lto: "cut", vol: 0.55 }, { gm: 89, rev: 0.45, lo: 48, hi: 79, f: [0.35, 0.35, 0.7, 0.1, 0.05, 0.05], lic: "own" }],
    ["xm-warmpiano", "pop", "&#x1F3B9; Warm Piano（あたたかいピアノ）", "smp", { prog: 1, rel: 0.35, gain: 1.15 }, { gm: 0, rev: 0.15, eq: { high: -2 }, lo: 36, hi: 96, f: [0.45, 0.35, 0.55, 0.05, 0.75, 0.4], lic: "cc0", fb: "soft" }],
    ["xm-ep", "pop", "&#x1F3B9; Christmas Electric Piano（エレピ）", "smp", { prog: 4, rel: 0.35, gain: 0.9 }, { gm: 4, rev: 0.2, lo: 40, hi: 84, f: [0.4, 0.3, 0.45, 0.05, 0.65, 0.4], lic: "gs", fb: "soft" }],
    ["xm-synthbells", "pop", "&#x1F514; Synth Bells（シンセのベル）", "syn", { w1: "sine", w2: "saw", mix: 0.25, oct2: 1, det: 5, cut: 0.55, res: 0.2, env: 0.6, fd: 0.3, fs: 0.2, a: 0.002, d: 1.2, s: 0.05, r: 1, vol: 0.7 }, { gm: 98, rev: 0.25, lo: 60, hi: 91, f: [0.7, 0.1, 0.55, 0.05, 0.9, 0.4], lic: "own" }],
    ["xm-sparkpluck", "pop", "&#x2728; Sparkling Pluck（キラキラのプラック）", "syn", { w1: "saw", w2: "sine", mix: 0.5, oct2: 1, det: 8, uni: 2, cut: 0.35, res: 0.25, env: 0.75, fd: 0.12, fs: 0, a: 0.002, d: 0.4, s: 0, r: 0.35, vol: 0.7 }, { gm: 108, rev: 0.25, dly: 0.2, lo: 60, hi: 91, f: [0.65, 0.15, 0.7, 0.05, 0.95, 0.75], lic: "own" }],
    ["xm-winterpad", "pop", "&#x2744;&#xFE0F; Winter Pad（冬のパッド）", "syn", { w1: "tri", w2: "saw", mix: 0.35, det: 14, uni: 2, cut: 0.5, res: 0.05, env: 0.1, fd: 1.2, fs: 0.7, a: 0.6, d: 1, s: 0.85, r: 1.4, lrate: 4.5, ldep: 0.05, lto: "pitch", vol: 0.6 }, { gm: 88, rev: 0.35, lo: 52, hi: 84, f: [0.4, 0.3, 0.55, 0.05, 0.1, 0.05], lic: "own" }],
    ["xm-choirpad", "pop", "&#x1F56F;&#xFE0F; Soft Choir-like Pad（声のようなパッド）", "syn", { w1: "saw", w2: "tri", mix: 0.6, det: 6, uni: 3, cut: 0.28, res: 0.3, env: 0.12, fd: 0.8, fs: 0.8, a: 0.45, d: 0.8, s: 0.9, r: 1, lrate: 5.2, ldep: 0.07, lto: "pitch", vol: 0.6 }, { gm: 91, rev: 0.4, lo: 52, hi: 79, f: [0.3, 0.3, 0.6, 0.1, 0.15, 0.05], lic: "own" }],
    ["xm-retrolead", "pop", "&#x1F579;&#xFE0F; Retro Christmas Lead（レトロなリード）", "syn", { w1: "square", w2: "tri", mix: 0.4, det: 6, cut: 0.8, res: 0.1, env: 0.2, fd: 0.3, fs: 0.6, a: 0.01, d: 0.2, s: 0.85, r: 0.15, lrate: 5.5, ldep: 0.1, lto: "pitch", mono: true, glide: 0.04, vol: 0.55 }, { gm: 80, dly: 0.2, lo: 60, hi: 88, f: [0.65, 0.2, 0.85, 0.05, 0.7, 0.1], lic: "own" }],
    ["xm-jazzpiano", "jazz", "&#x1F3B9; Jazz Piano（グランドピアノ）", "smp", { prog: 0, rel: 0.35, gain: 1.25 }, { gm: 0, rev: 0.15, lo: 36, hi: 96, f: [0.55, 0.35, 0.6, 0.05, 0.8, 0.4], lic: "sal", fb: "soft" }],
    ["xm-vibes", "jazz", "&#x1F3B5; Vibraphone（ビブラフォン）", "smp", { prog: 11, rel: 0.6, gain: 1.4 }, { gm: 11, rev: 0.2, lo: 53, hi: 89, f: [0.55, 0.1, 0.25, 0.02, 0.75, 0.3], lic: "fluid", fb: "bell" }],
    ["xm-upbass", "jazz", "&#x1F3BB; Upright Bass 風（ウッドベース風）", "smp", { prog: 32, rel: 0.15, gain: 0.75 }, { gm: 32, lo: 28, hi: 55, f: [0.15, 0.95, 0.4, 0.05, 0.6, 0.5], lic: "fluid", fb: "bass" }],
    ["xm-softorgan", "jazz", "&#x1F3B9; Soft Organ（やわらかいオルガン）", "syn", { w1: "sine", w2: "tri", mix: 0.45, oct2: 1, det: 2, sub: 0.35, cut: 0.6, env: 0, a: 0.03, d: 0.1, s: 1, r: 0.15, lrate: 5.8, ldep: 0.12, lto: "amp", vol: 0.6 }, { gm: 16, rev: 0.2, lo: 48, hi: 84, f: [0.35, 0.35, 0.45, 0.02, 0.35, 0.05], lic: "own" }],
    ["xm-brush", "jazz", "&#x1F9F9; Brush-like Percussion（ブラシ風）", "drum", { pat: "brush" }, { f: [0.85, 0.05, 0.3, 0.95, 0.5, 0.6], lic: "own", how: "ドラム（シェイカー・クロススティック・弱いキック。本物のブラシの録音ではない）" }],
    // v2.77 §345 A3-2: 🎸 More（ゲームにある録音だけ）
    ["xm-nylon", "more", "&#x1F3B8; Nylon Guitar（ナイロンギター）", "smp", { prog: 24, rel: 0.4, gain: 1.2 }, { gm: 24, rev: 0.18, lo: 40, hi: 84, f: [0.45, 0.25, 0.45, 0.05, 0.8, 0.45], lic: "fluid", fb: "pluck" }],
    ["xm-steel", "more", "&#x1F3B8; Steel Guitar（アコースティックギター）", "smp", { prog: 25, rel: 0.4, gain: 1.2 }, { gm: 25, rev: 0.15, lo: 40, hi: 84, f: [0.6, 0.2, 0.55, 0.1, 0.85, 0.45], lic: "fluid", fb: "pluck" }],
    ["xm-cleangtr", "more", "&#x1F3B8; Clean Electric Guitar（クリーンのエレキ）", "smp", { prog: 27, rel: 0.3, gain: 1.5 }, { gm: 27, rev: 0.15, lo: 40, hi: 86, f: [0.55, 0.2, 0.5, 0.05, 0.8, 0.5], lic: "fluid", fb: "pluck" }],
    ["xm-marimba", "more", "&#x1FA98; Marimba（マリンバ）", "smp", { prog: 12, rel: 0.4, gain: 1.15 }, { gm: 12, rev: 0.2, lo: 48, hi: 96, f: [0.5, 0.2, 0.2, 0.02, 0.9, 0.6], lic: "cc0", fb: "bell" }],
    ["xm-flute", "more", "&#x1FA88; Flute（フルート）", "smp", { prog: 73, loop: true, att: 0.05, rel: 0.25, gain: 0.8 }, { gm: 73, rev: 0.22, lo: 60, hi: 96, f: [0.55, 0.05, 0.3, 0.2, 0.3, 0.1], lic: "cc0", fb: "soft" }],
    ["xm-clarinet", "more", "&#x1F3B6; Clarinet（クラリネット）", "smp", { prog: 71, loop: true, att: 0.04, rel: 0.25, gain: 0.8 }, { gm: 71, rev: 0.2, lo: 50, hi: 89, f: [0.4, 0.15, 0.55, 0.05, 0.3, 0.1], lic: "cc0", fb: "soft" }],
    ["xm-cello", "more", "&#x1F3BB; Cello（チェロ）", "smp", { prog: 42, loop: true, att: 0.07, rel: 0.35, gain: 0.8 }, { gm: 42, rev: 0.25, lo: 36, hi: 76, f: [0.3, 0.45, 0.65, 0.08, 0.25, 0.1], lic: "cc0", fb: "pad" }],
    ["xm-fingerbass", "more", "&#x1F3B8; Finger Bass（フィンガーベース）", "smp", { prog: 33, rel: 0.15, gain: 0.5 }, { gm: 33, lo: 28, hi: 55, f: [0.2, 0.9, 0.45, 0.05, 0.65, 0.45], lic: "fluid", fb: "bass" }],
    ["xm-synbass", "more", "&#x1F50A; Synth Bass（シンセベース）", "smp", { prog: 38, rel: 0.12, gain: 0.9 }, { gm: 38, lo: 28, hi: 55, f: [0.35, 0.9, 0.7, 0.05, 0.7, 0.4], lic: "fluid", fb: "bass" }],
    ["xm-choir", "more", "&#x1F3B5; Choir Aahs（コーラス）", "smp", { prog: 52, loop: true, att: 0.15, rel: 0.5, gain: 1.05 }, { gm: 52, rev: 0.35, lo: 48, hi: 79, f: [0.4, 0.2, 0.55, 0.15, 0.15, 0.05], lic: "fluid", fb: "xm-choirpad" }]
  ];
  // 見送った音色（いまのエンジンでは十分な音にならない）
  var SKIPPED = [["Tubular Bells", "いまのシンセは倍音を整数倍でしか作れず、チューブラーベルの金属の響きにならない。グロッケンの録音を下げると不自然になる"]];
  function sound(id) { for (var i = 0; i < SOUNDS.length; i++) { if (SOUNDS[i][0] === id) { return SOUNDS[i]; } } return null; }
  function plain(html) { return String(html).replace(/&#x[0-9A-F]+;/gi, "").replace(/^\s+/, ""); }
  function soundName(id) { var s = sound(id); if (s) { return s[2]; } var S = SY(), i; if (S && S.PRESETS) { for (i = 0; i < S.PRESETS.length; i++) { if (S.PRESETS[i][0] === id) { return S.PRESETS[i][1]; } } } return id === "@drum" ? "&#x1F941; ドラム" : esc(id); }
  // 録音の音色が使えないときのシンセのパッチ
  function synPatchOf(id) {
    var s = sound(id), S = SY();
    if (s && s[3] === "syn") { return S && S.patchClean ? S.patchClean(s[4]) : s[4]; }
    try { if (S && S.preset) { return S.preset(id).patch; } } catch (e) {}
    return null;
  }
  // トラックの楽器（§343）。シンセ ＝ いまと同じ形（古い版でも鳴る）・録音 ＝ type "sample"
  function instrument(id) {
    var s = sound(id), M = DM(), S = SY();
    if (!s) { return M && M.synthInstrument ? M.synthInstrument(id) : null; }
    var o = s[5], ext = { preset: s[0], presetName: plain(s[2]).substring(0, 80), gm: o.gm === undefined ? 0 : o.gm };
    if (s[3] === "drum") { return M.drumInstrument(); }
    if (s[3] === "syn") {
      var patch = S && S.patchClean ? S.patchClean(s[4]) : s[4];
      return { type: "synth", patch: { mode: "inline", patch: patch, hash: M.hash(JSON.stringify(patch)) }, ext: ext };
    }
    var d = s[4], ins = { type: "sample", prog: d.prog, loop: !!d.loop, att: d.att || 0.003, rel: d.rel || 0.3, gain: d.gain || 1, ext: ext };
    ext.fb = o.fb || "soft";
    return ins;
  }
  function isSample(ins) { return !!(ins && ins.type === "sample" && typeof ins.prog === "number"); }
  function label(ins) { if (!ins) { return "?"; } var s = sound(ins.ext && ins.ext.preset); return s ? s[2] : "&#x1F3BC; " + esc((ins.ext && ins.ext.presetName) || "録音の音色"); }
  // 音色に合う FX（残響の送り・EQ）をトラックに入れる（あとで変えられる）
  function trackFx(t, id) {
    var s = sound(id), M = DM();
    if (!s || !t || !M) { return; }
    var o = s[5];
    if (o.rev && M.sendSet) { M.sendSet(t, "rev", o.rev); }
    if (o.dly && M.sendSet) { M.sendSet(t, "dly", o.dly); }
    if (o.eq && M.fxSet) { M.fxSet(t, "eq", "on", true); for (var k in o.eq) { if (o.eq.hasOwnProperty(k)) { M.fxSet(t, "eq", k, o.eq[k]); } } }
  }
  // 新しいトラック（音色・名前・アイコン）。16 本をこえるなら null
  function makeTrack(p, id, name) {
    var M = DM(), s = sound(id), t;
    if (!p || p.tracks.length >= M.MAX_TRACKS) { return null; }
    if (id === "@drum" || (s && s[3] === "drum")) { t = M.newTrack(p, name || (s ? plain(s[2]).replace(/（.*$/, "") : "ドラム"), M.drumInstrument()); t.ext.icon = "&#x1F941;"; }
    else { t = M.newTrack(p, name || (s ? plain(s[2]).replace(/（.*$/, "") : "トラック"), instrument(id)); t.ext.icon = s ? (s[2].match(/^(&#x[0-9A-F]+;(&#xFE0F;)?)/i) || ["&#x1F3B5;"])[0] : "&#x1F3B5;"; }
    t.ext.xm = id;
    trackFx(t, id);
    return t;
  }

  // ---------- 演奏パターン（ふつうの MIDI ノート・ここで作る一般的な形だけ）----------
  // { id, cat, name, m（使える拍子）, snd（はじめの音色）, drum, gen(c) }
  // c: { bars, bt, num, den, bl（拍の長さ）, nb（1 小節の拍の数）, ch(b)（その小節のコード）, key, r（乱数）, dens（0〜2）, rs（音域の±半音）, v(強さ), add(t, d, m, v) }
  var PCATS = [["drum", "&#x1F941; リズム・ベル"], ["keys", "&#x1F3B9; ピアノ"], ["bass", "&#x1F3B8; ベース"], ["str", "&#x1F3BB; 弦・ハープ・管"], ["bell", "&#x1F514; ベル・シンセ"]];
  function stepsPer(c) { return Math.round(c.bt / STEP); }
  // ドラムの行: [[GM, [ステップ…], 強さ, 裏の強さ]]。拍の頭（4 ステップごと／6/8 は 6 ステップごと）でないステップは裏の強さ
  function drumRows(c, rows, b) {
    var t0 = b * c.bt, i, j, n = stepsPer(c), acc = c.den === 8 ? 6 : 4;
    for (i = 0; i < rows.length; i++) {
      for (j = 0; j < rows[i][1].length; j++) {
        var st = rows[i][1][j]; if (st >= n) { continue; }
        var v = rows[i][3] !== undefined && st % acc !== 0 ? rows[i][3] : rows[i][2];
        c.add(t0 + st * STEP, 0, rows[i][0], c.v(v));
      }
    }
  }
  function all16(n) { var a = [], i; for (i = 0; i < n; i++) { a.push(i); } return a; }
  function every(n, k, from) { var a = [], i; for (i = from || 0; i < n; i += k) { a.push(i); } return a; }
  function fill(c, b) { // 4 小節ごとのおわりのフィル（スネアの 16 分・だんだん強く）
    if (c.nofill || c.dens < 1 || b % 4 !== 3 || c.den === 8) { return; }
    var n = stepsPer(c), t0 = b * c.bt, k;
    for (k = 0; k < 4; k++) { c.add(t0 + (n - 4 + k) * STEP, 0, 38, c.v(0.45 + k * 0.12)); }
  }
  function crash(c, b, v) { if (b % 8 === 0) { c.add(b * c.bt, 0, 49, c.v(v)); } }
  function ctone(c, b, center, prev) { return voice(c.ch(b).pcs, center + c.rs, prev); }
  function bassOf(c, b, pc) { return pcIn(pc === undefined ? c.ch(b).bass : pc, 31 + c.rs); }
  var PATS = [
    // --- リズム・ベル（ドラムのトラック・ステップの画面で直せる）---
    { id: "sleigh8", cat: "drum", name: "8 分のスレイベル", m: ["4/4"], snd: "xm-sleigh", drum: true, gen: function (c) {
      for (var b = 0; b < c.bars; b++) { drumRows(c, [[83, c.dens === 0 ? every(16, 4) : (c.dens === 2 ? all16(16) : every(16, 2)), 0.75, c.dens === 2 ? 0.38 : 0.5]], b); }
    } },
    { id: "sleigh16", cat: "drum", name: "軽い 16 分のベル", m: ["4/4"], snd: "xm-sleigh", drum: true, gen: function (c) {
      for (var b = 0; b < c.bars; b++) { drumRows(c, [[83, c.dens === 0 ? every(16, 2) : all16(16), 0.5, 0.3]].concat(c.dens === 2 ? [[54, [4, 12], 0.6]] : []), b); }
    } },
    { id: "sleighShuffle", cat: "drum", name: "スレイベルのシャッフル", m: ["4/4"], snd: "xm-sleigh", drum: true, gen: function (c) {
      for (var b = 0; b < c.bars; b++) { drumRows(c, [[83, [0, 3, 4, 7, 8, 11, 12, 15], 0.7, 0.45]].concat(c.dens === 2 ? [[83, [2, 6, 10, 14], 0.3]] : []), b); }
    } },
    { id: "bellAccent", cat: "drum", name: "鐘のアクセント（トライアングル・ベルツリー）", m: ["4/4", "3/4", "6/8"], snd: "xm-sleigh", drum: true, gen: function (c) {
      var n = stepsPer(c), half = c.den === 8 ? 6 : (c.num === 4 ? 8 : -1), b;
      for (b = 0; b < c.bars; b++) {
        var t0 = b * c.bt;
        if (c.dens > 0 || b % 2 === 0) { c.add(t0, 0, 81, c.v(0.6)); }
        if (half > 0 && c.dens >= 1) { c.add(t0 + half * STEP, 0, 53, c.v(0.42)); }
        if (c.dens === 2) { var k; for (k = c.den === 8 ? 3 : 4; k < n; k += c.den === 8 ? 3 : 4) { if (k !== half) { c.add(t0 + k * STEP, 0, 81, c.v(0.32)); } } }
        if (b % 4 === 3) { c.add(t0 + (n - (c.den === 8 ? 6 : 4)) * STEP, 0, 84, c.v(0.55)); }
      }
    } },
    { id: "tamb16", cat: "drum", name: "タンバリンの 16 分", m: ["4/4"], snd: "@drum", drum: true, gen: function (c) {
      for (var b = 0; b < c.bars; b++) { drumRows(c, [[54, c.dens === 0 ? every(16, 2) : all16(16), 0.55, 0.3], [54, [4, 12], 0.75]], b); }
    } },
    { id: "pop8", cat: "drum", name: "ポップスの 8 ビート", m: ["4/4"], snd: "@drum", drum: true, gen: function (c) {
      for (var b = 0; b < c.bars; b++) {
        drumRows(c, [[36, c.dens === 0 ? [0, 8] : (c.dens === 2 ? [0, 7, 8, 10] : [0, 8, 10]), 0.9], [38, [4, 12], 0.85], [42, c.dens === 0 ? every(16, 4) : (c.dens === 2 ? all16(16) : every(16, 2)), 0.7, c.dens === 2 ? 0.35 : 0.45]], b);
        crash(c, b, 0.7); fill(c, b);
      }
    } },
    { id: "popSleigh", cat: "drum", name: "8 ビート ＋ スレイベル", m: ["4/4"], snd: "@drum", drum: true, gen: function (c) {
      for (var b = 0; b < c.bars; b++) {
        drumRows(c, [[36, c.dens === 0 ? [0, 8] : [0, 8, 10], 0.9], [38, [4, 12], 0.85], [42, every(16, 2), 0.6, 0.4], [83, c.dens === 2 ? all16(16) : every(16, 2), 0.55, 0.35]], b);
        crash(c, b, 0.65); fill(c, b);
      }
    } },
    { id: "ballad", cat: "drum", name: "バラードのドラム", m: ["4/4"], snd: "@drum", drum: true, gen: function (c) {
      for (var b = 0; b < c.bars; b++) {
        drumRows(c, [[36, [0, 10], 0.75], [37, [4, 12], 0.6], [42, c.dens === 0 ? every(16, 4) : every(16, 2), 0.45, 0.3]].concat(c.dens === 2 ? [[83, every(16, 4), 0.35]] : []), b);
        if (b === 0) { c.add(0, 0, 49, c.v(0.5)); }
      }
    } },
    { id: "swing", cat: "drum", name: "スイングのドラム（ライド・3:1）", m: ["4/4"], snd: "xm-brush", drum: true, gen: function (c) {
      for (var b = 0; b < c.bars; b++) {
        drumRows(c, [[51, [0, 4, 7, 8, 12, 15], 0.62, 0.45], [44, [4, 12], 0.5]].concat(c.dens >= 1 ? [[36, [0, 4, 8, 12], 0.25]] : []), b);
        if (c.dens === 2) { var gs = [6, 11, 14]; c.add(b * c.bt + gs[Math.floor(c.r() * 3)] * STEP, 0, 38, c.v(0.3)); }
      }
    } },
    { id: "brush", cat: "drum", name: "ブラシ風（シェイカー・クロススティック）", m: ["4/4", "3/4"], snd: "xm-brush", drum: true, gen: function (c) {
      var n = stepsPer(c), back = c.num === 4 ? [4, 12] : [4, 8], b;
      for (b = 0; b < c.bars; b++) {
        drumRows(c, [[70, c.dens === 0 ? every(n, 2) : all16(n), 0.5, 0.28], [37, back, 0.45], [36, c.num === 4 ? [0, 8] : [0], 0.45]].concat(c.dens === 2 ? [[69, every(n, 4, 2), 0.3]] : []), b);
      }
    } },
    { id: "waltzDrums", cat: "drum", name: "3 拍子のドラム", m: ["3/4"], snd: "@drum", drum: true, gen: function (c) {
      for (var b = 0; b < c.bars; b++) { drumRows(c, [[36, [0], 0.85], [37, c.dens === 0 ? [] : [4, 8], 0.45], [42, c.dens === 2 ? [2, 4, 6, 8, 10] : [4, 8], 0.55, 0.3]], b); if (b % 8 === 0) { c.add(b * c.bt, 0, 49, c.v(0.55)); } }
    } },
    { id: "sleighWaltz", cat: "drum", name: "3 拍子のスレイベル", m: ["3/4"], snd: "xm-sleigh", drum: true, gen: function (c) {
      for (var b = 0; b < c.bars; b++) { drumRows(c, [[83, c.dens === 0 ? [0, 4, 8] : (c.dens === 2 ? all16(12) : every(12, 2)), 0.75, 0.42]], b); if (b % 4 === 0) { c.add(b * c.bt, 0, 81, c.v(0.5)); } }
    } },
    { id: "drums68", cat: "drum", name: "6/8 のドラム", m: ["6/8"], snd: "@drum", drum: true, gen: function (c) {
      for (var b = 0; b < c.bars; b++) { drumRows(c, [[36, c.dens === 2 ? [0, 10] : [0], 0.85], [37, [6], 0.65], [42, c.dens === 0 ? [0, 6] : every(12, 2), 0.55, 0.35]], b); if (b % 8 === 0) { c.add(b * c.bt, 0, 49, c.v(0.5)); } }
    } },
    { id: "sleigh68", cat: "drum", name: "6/8 のスレイベル", m: ["6/8"], snd: "xm-sleigh", drum: true, gen: function (c) {
      for (var b = 0; b < c.bars; b++) { drumRows(c, [[83, c.dens === 0 ? [0, 6] : (c.dens === 2 ? all16(12) : every(12, 2)), 0.72, 0.42]], b); }
    } },
    { id: "chipDrums", cat: "drum", name: "8bit のドラム", m: ["4/4"], snd: "@drum", drum: true, gen: function (c) {
      for (var b = 0; b < c.bars; b++) { drumRows(c, [[36, [0, 6, 8, 11], 0.9], [38, c.dens === 2 ? [4, 12, 15] : [4, 12], 0.85, 0.5], [42, c.dens === 0 ? every(16, 2) : all16(16), 0.5, 0.3]], b); }
    } },
    // --- ピアノ（コードについていく・ピアノロールで直せる）---
    { id: "arpPiano", cat: "keys", name: "ピアノの分散和音", m: ["4/4", "3/4", "6/8"], snd: "xm-warmpiano", gen: function (c) {
      var prev = null, b, step = c.dens === 0 ? 960 : (c.dens === 2 ? 240 : 480), order = [0, 1, 2, 3, 2, 1];
      for (b = 0; b < c.bars; b++) {
        var t0 = b * c.bt, vc = ctone(c, b, 62, prev), tones = [vc[0], vc[1], vc[2], vc[0] + 12], k = 0, t;
        prev = vc;
        c.add(t0, c.bt, bassOf(c, b) + 12, c.v(0.6));
        for (t = 0; t < c.bt; t += step) { c.add(t0 + t, Math.min(step * 1.6, c.bt - t), tones[order[k % order.length]], c.v(t % c.bl === 0 ? 0.55 : 0.45)); k++; }
      }
    } },
    { id: "balladPiano", cat: "keys", name: "バラードのピアノ伴奏", m: ["4/4"], snd: "xm-warmpiano", gen: function (c) {
      var prev = null, b;
      for (b = 0; b < c.bars; b++) {
        var t0 = b * c.bt, vc = ctone(c, b, 64, prev), ch = c.ch(b), lo = bassOf(c, b) + 12, i; prev = vc;
        c.add(t0, c.dens === 0 ? c.bt : 1920, lo, c.v(0.6));
        if (c.dens >= 1) { c.add(t0 + 1920, 1920, pcIn(ch.fifth, lo), c.v(0.5)); }
        if (c.dens === 0) { for (i = 0; i < vc.length; i++) { c.add(t0, c.bt, vc[i], c.v(0.48)); } continue; }
        for (i = 0; i < vc.length; i++) { c.add(t0, 1900, vc[i], c.v(0.5)); c.add(t0 + 1920, c.dens === 2 ? 940 : 1900, vc[i], c.v(0.45)); }
        if (c.dens === 2) { c.add(t0 + 2880, 480, vc[1], c.v(0.42)); c.add(t0 + 3360, 480, vc[2], c.v(0.46)); }
      }
    } },
    { id: "popPiano8", cat: "keys", name: "ポップスの 8 分のピアノ", m: ["4/4"], snd: "xm-ep", gen: function (c) {
      var prev = null, b, pos = c.dens === 0 ? [0, 4] : (c.dens === 2 ? [0, 1, 2, 3, 4, 5, 6, 7] : [0, 3, 6]);
      for (b = 0; b < c.bars; b++) {
        var t0 = b * c.bt, vc = ctone(c, b, 64, prev), lo = bassOf(c, b) + 12, i, j; prev = vc;
        for (j = 0; j < pos.length; j++) { var len = (j + 1 < pos.length ? pos[j + 1] : 8) - pos[j]; for (i = 0; i < vc.length; i++) { c.add(t0 + pos[j] * 480, Math.max(200, len * 480 - 80), vc[i], c.v(pos[j] % 2 === 0 ? 0.55 : 0.45)); } }
        c.add(t0, 1800, lo, c.v(0.6)); c.add(t0 + 1920, 1800, lo, c.v(0.55));
      }
    } },
    { id: "waltzPiano", cat: "keys", name: "3 拍子の伴奏（ズン・チャッ・チャッ）", m: ["3/4"], snd: "xm-warmpiano", gen: function (c) {
      var prev = null, b;
      for (b = 0; b < c.bars; b++) {
        var t0 = b * c.bt, ch = c.ch(b), vc = ctone(c, b, 62, prev), lo = bassOf(c, b, b % 2 && c.dens > 0 ? ch.fifth : ch.bass) + 12, i; prev = vc;
        c.add(t0, 900, lo, c.v(0.62));
        for (i = 0; i < vc.length; i++) { c.add(t0 + 960, c.dens === 0 ? 1800 : 700, vc[i], c.v(0.45)); if (c.dens > 0) { c.add(t0 + 1920, 700, vc[i], c.v(0.42)); } }
        if (c.dens === 2) { c.add(t0 + 2400, 400, vc[vc.length - 1] + 12 > 84 ? vc[vc.length - 1] : vc[vc.length - 1] + 12, c.v(0.35)); }
      }
    } },
    { id: "sixEightPiano", cat: "keys", name: "6/8 のゆったりした伴奏", m: ["6/8"], snd: "xm-warmpiano", gen: function (c) {
      var prev = null, b, ord = [0, 1, 2, 3, 2, 1];
      for (b = 0; b < c.bars; b++) {
        var t0 = b * c.bt, ch = c.ch(b), vc = ctone(c, b, 62, prev), lo = bassOf(c, b) + 12, tones = [vc[0], vc[1], vc[2], vc[0] + 12], k; prev = vc;
        c.add(t0, 1400, lo, c.v(0.6)); c.add(t0 + 1440, 1400, pcIn(ch.fifth, lo), c.v(0.5));
        if (c.dens === 0) { for (k = 0; k < vc.length; k++) { c.add(t0, 1400, vc[k], c.v(0.45)); c.add(t0 + 1440, 1400, vc[k], c.v(0.42)); } continue; }
        for (k = 0; k < 6; k++) { c.add(t0 + k * 480, 560, tones[ord[k]] + (c.dens === 2 && k >= 3 ? 12 : 0), c.v(k % 3 === 0 ? 0.52 : 0.42)); }
      }
    } },
    { id: "jazzComp", cat: "keys", name: "ジャズのコンピング（チャールストン・3:1）", m: ["4/4"], snd: "xm-jazzpiano", gen: function (c) {
      var prev = null, b;
      for (b = 0; b < c.bars; b++) {
        var t0 = b * c.bt, ch = c.ch(b), pcs = [(ch.root + ch.ivs[1]) % 12, (ch.root + (ch.ivs[3] !== undefined ? ch.ivs[3] : (SEVENTH[ch.id] || 10))) % 12], vc, i;
        if (c.dens === 2 && c.r() < 0.5) { pcs.push((ch.root + 2) % 12); } // 9th
        vc = voice(pcs, 60 + c.rs, prev); prev = vc;
        var hits = c.dens === 0 ? [[0, 1800]] : (c.dens === 2 ? [[0, 600], [1680, 400], [3600, 240]] : [[0, 600], [1680, 400]]);
        for (i = 0; i < hits.length; i++) { for (var k = 0; k < vc.length; k++) { c.add(t0 + hits[i][0], hits[i][1], vc[k], c.v(i === 0 ? 0.58 : 0.5)); } }
      }
    } },
    // --- ベース ---
    { id: "bassRoot5", cat: "bass", name: "ルートと 5 度（ウッドベース風）", m: ["4/4", "3/4", "6/8"], snd: "xm-upbass", gen: function (c) {
      for (var b = 0; b < c.bars; b++) {
        var t0 = b * c.bt, ch = c.ch(b), r = bassOf(c, b), f = pcIn(ch.fifth, r);
        if (c.dens === 0) { c.add(t0, c.bt - 60, r, c.v(0.7)); continue; }
        if (c.num === 3) { c.add(t0, c.dens === 2 ? 900 : 2700, r, c.v(0.7)); if (c.dens === 2) { c.add(t0 + 1920, 900, f, c.v(0.6)); } continue; }
        if (c.den === 8) { c.add(t0, 1400, r, c.v(0.7)); c.add(t0 + 1440, 1400, f, c.v(0.6)); continue; }
        if (c.dens === 2) { c.add(t0, 900, r, c.v(0.72)); c.add(t0 + 960, 900, f, c.v(0.6)); c.add(t0 + 1920, 900, r + 12 <= 52 ? r + 12 : r, c.v(0.65)); c.add(t0 + 2880, 900, f, c.v(0.6)); continue; }
        c.add(t0, 1800, r, c.v(0.72)); c.add(t0 + 1920, 1800, f, c.v(0.62));
      }
    } },
    { id: "walking", cat: "bass", name: "ウォーキングベース", m: ["4/4"], snd: "xm-upbass", gen: function (c) {
      var b;
      for (b = 0; b < c.bars; b++) {
        var t0 = b * c.bt, ch = c.ch(b), r = bassOf(c, b), nx = b + 1 < c.bars ? bassOf(c, b + 1) : bassOf(c, 0);
        if (c.dens === 0) { c.add(t0, 1800, r, c.v(0.72)); c.add(t0 + 1920, 1800, pcIn(ch.fifth, r), c.v(0.62)); continue; }
        var n2 = pcIn(c.r() < 0.5 ? (ch.root + ch.ivs[1]) % 12 : ch.fifth, r), n3 = c.r() < 0.5 ? pcIn(ch.fifth, r) : scaleTone(c.key, n2, c.r() < 0.5 ? 1 : -1, c.mode);
        var app = c.r() < 0.6 ? nx + (c.r() < 0.5 ? -1 : 1) : scaleTone(c.key, nx, n3 > nx ? 1 : -1, c.mode);
        if (Math.abs(app - n3) > 7) { app += app > n3 ? -12 : 12; }
        var ns = [r, n2, n3, app], k;
        var gh = c.dens === 2 && c.r() < 0.5; // 4 拍目の裏の音（v2.77: 4 拍目を短くして同じ高さの重なりをなくす）
        for (k = 0; k < 4; k++) { c.add(t0 + k * 960, k === 3 && gh ? 640 : 880, clamp(ns[k], 28, 55), c.v(k === 0 ? 0.75 : 0.62)); }
        if (gh) { c.add(t0 + 3600, 200, clamp(app, 28, 55), c.v(0.4)); }
      }
    } },
    { id: "popBass8", cat: "bass", name: "8 分のベース", m: ["4/4"], snd: "bass", gen: function (c) {
      for (var b = 0; b < c.bars; b++) {
        var t0 = b * c.bt, ch = c.ch(b), r = bassOf(c, b), k, st = c.dens === 0 ? 960 : 480;
        for (k = 0; k < c.bt / st; k++) {
          var m = r;
          if (c.dens === 2 && k === 7) { m = r + 12; } else if (c.dens === 2 && k === 5) { m = pcIn(ch.fifth, r); }
          c.add(t0 + k * st, st - 80, m, c.v(k % 2 === 0 ? 0.72 : 0.58));
        }
      }
    } },
    { id: "balladBass", cat: "bass", name: "バラードのベース（のばす）", m: ["4/4", "3/4", "6/8"], snd: "xm-upbass", gen: function (c) {
      for (var b = 0; b < c.bars; b++) {
        var t0 = b * c.bt, ch = c.ch(b), r = bassOf(c, b), half = Math.round(c.bt / 2);
        if (c.dens === 0) { c.add(t0, c.bt - 40, r, c.v(0.68)); continue; }
        c.add(t0, half - 40, r, c.v(0.7)); c.add(t0 + half, half - 40, c.dens === 2 ? pcIn(ch.fifth, r) : r, c.v(0.58));
      }
    } },
    { id: "waltzBass", cat: "bass", name: "3 拍子のベース", m: ["3/4"], snd: "xm-upbass", gen: function (c) {
      for (var b = 0; b < c.bars; b++) {
        var t0 = b * c.bt, ch = c.ch(b), r = bassOf(c, b), m = c.dens > 0 && b % 2 ? pcIn(ch.fifth, r) : r;
        c.add(t0, c.dens === 0 ? 2700 : 900, m, c.v(0.72));
        if (c.dens === 2) { c.add(t0 + 1920, 900, pcIn((ch.root + ch.ivs[1]) % 12, r), c.v(0.5)); }
      }
    } },
    { id: "chipBass", cat: "bass", name: "8bit のベース（オクターブ）", m: ["4/4", "3/4"], snd: "chip", gen: function (c) {
      for (var b = 0; b < c.bars; b++) {
        var t0 = b * c.bt, r = bassOf(c, b) + 12, st = c.dens === 0 ? 960 : (c.dens === 2 ? 240 : 480), k;
        for (k = 0; k < c.bt / st; k++) { c.add(t0 + k * st, Math.max(100, st - 60), k % 2 ? r + 12 : r, c.v(k % 2 ? 0.55 : 0.7)); }
      }
    } },
    // --- 弦・ハープ・管 ---
    { id: "stringsLong", cat: "str", name: "ストリングスのロングトーン", m: ["4/4", "3/4", "6/8"], snd: "xm-strings", gen: function (c) {
      var prev = null, b;
      for (b = 0; b < c.bars; b++) {
        var t0 = b * c.bt, vc = ctone(c, b, 64, prev), i, sw = b % 2 ? 0.5 : 0.56; prev = vc;
        for (i = 0; i < vc.length; i++) { c.add(t0, c.bt, vc[i], c.v(sw)); }
        if (c.dens >= 1) { c.add(t0, c.bt, pcIn(c.ch(b).bass, 46 + c.rs), c.v(sw - 0.04)); }
        if (c.dens === 2) { c.add(t0, c.bt, vc[1] + 12, c.v(sw - 0.08)); }
      }
    } },
    { id: "stringsHalf", cat: "str", name: "ストリングスの 2 分音符", m: ["4/4", "3/4", "6/8"], snd: "xm-strings", gen: function (c) {
      var prev = null, b, segs = c.num === 3 && c.den === 4 ? [[0, 1920], [1920, 960]] : [[0, Math.round(c.bt / 2)], [Math.round(c.bt / 2), Math.round(c.bt / 2)]];
      if (c.dens === 2 && c.num === 4) { segs = [[0, 1920], [1920, 960], [2880, 960]]; }
      for (b = 0; b < c.bars; b++) {
        var t0 = b * c.bt, i, j;
        for (j = 0; j < segs.length; j++) { var vc = ctone(c, b, j === 0 ? 64 : 66, prev); prev = vc; for (i = 0; i < vc.length; i++) { c.add(t0 + segs[j][0], segs[j][1] - 30, vc[i], c.v(j === 0 ? 0.56 : 0.48)); } }
      }
    } },
    { id: "pizz", cat: "str", name: "ピチカートの刻み", m: ["4/4", "3/4", "6/8"], snd: "xm-pizz", gen: function (c) {
      var b, st = c.den === 8 ? 480 : (c.dens === 2 ? 480 : 960);
      for (b = 0; b < c.bars; b++) {
        var t0 = b * c.bt, vc = ctone(c, b, 60, null), lo = bassOf(c, b) + 12, k = 0, t;
        for (t = 0; t < c.bt; t += st) {
          if (c.dens === 0 && t % (c.den === 8 ? 1440 : 1920) !== 0) { continue; }
          var m = t === 0 ? lo : (t % c.bl === 0 && c.den !== 8 ? vc[k % 3] : vc[(k + 1) % 3]); k++;
          c.add(t0 + t, 300, m, c.v(t % c.bl === 0 ? 0.62 : 0.5));
        }
      }
    } },
    { id: "harpArp", cat: "str", name: "ハープ風アルペジオ", m: ["4/4", "3/4", "6/8"], snd: "xm-harp", gen: function (c) {
      var b, st = c.dens === 0 ? 480 : 240;
      for (b = 0; b < c.bars; b++) {
        var t0 = b * c.bt, vc = ctone(c, b, 55, null), tones = vc.concat(vc.map(function (x) { return x + 12; }), vc.map(function (x) { return x + 24; })), n = Math.round(c.bt / st), k;
        var seq = []; for (k = 0; k < tones.length; k++) { seq.push(tones[k]); } if (c.dens === 2) { for (k = tones.length - 2; k > 0; k--) { seq.push(tones[k]); } }
        for (k = 0; k < n; k++) { c.add(t0 + k * st, 700, seq[k % seq.length], c.v(k * st % c.bl === 0 ? 0.55 : 0.45)); }
      }
    } },
    { id: "harpFlow", cat: "str", name: "ハープの流れ（小節の頭で上る）", m: ["4/4", "3/4", "6/8"], snd: "xm-harp", gen: function (c) {
      for (var b = 0; b < c.bars; b++) {
        if (c.dens === 0 && b % 2) { continue; }
        var t0 = b * c.bt, vc = ctone(c, b, 55, null), tones = vc.concat(vc.map(function (x) { return x + 12; }), [vc[0] + 24]), k;
        for (k = 0; k < tones.length; k++) { c.add(t0 + k * 120, 1600 - k * 100, tones[k], c.v(0.42 + k * 0.03)); }
        if (c.dens === 2) { var h = Math.round(c.bt / 2); for (k = 0; k < tones.length; k++) { c.add(t0 + h + k * 120, 900, tones[tones.length - 1 - k], c.v(0.45 - k * 0.02)); } }
      }
    } },
    { id: "hornPad", cat: "str", name: "ホルンのハーモニー", m: ["4/4", "3/4", "6/8"], snd: "xm-horn", gen: function (c) {
      var prev = null, b;
      for (b = 0; b < c.bars; b++) {
        var t0 = b * c.bt, ch = c.ch(b), pcs = [(ch.root + ch.ivs[1]) % 12, ch.fifth], vc = voice(pcs, 58 + c.rs, prev), i; prev = vc;
        var segs = c.dens === 0 ? [[0, c.bt]] : (c.num === 3 && c.den === 4 ? [[0, 2880]] : [[0, Math.round(c.bt / 2)], [Math.round(c.bt / 2), Math.round(c.bt / 2)]]);
        if (c.dens === 2 && c.num === 4) { segs = [[0, 1920], [1920, 1440], [3360, 480]]; }
        for (var j = 0; j < segs.length; j++) { for (i = 0; i < vc.length; i++) { c.add(t0 + segs[j][0], segs[j][1] - 40, vc[i], c.v(j === 0 ? 0.55 : 0.48)); } }
      }
    } },
    { id: "organHold", cat: "str", name: "オルガンのコード（のばす）", m: ["4/4", "3/4", "6/8"], snd: "xm-church", gen: function (c) {
      var prev = null, b;
      for (b = 0; b < c.bars; b++) {
        var t0 = b * c.bt, vc = ctone(c, b, 62, prev), lo = pcIn(c.ch(b).bass, 43 + c.rs), i; prev = vc;
        var segs = c.dens === 2 ? [[0, Math.round(c.bt / 2)], [Math.round(c.bt / 2), Math.round(c.bt / 2)]] : [[0, c.bt]];
        for (var j = 0; j < segs.length; j++) { for (i = 0; i < vc.length; i++) { c.add(t0 + segs[j][0], segs[j][1] - 20, vc[i], c.v(0.52)); } if (c.dens >= 1) { c.add(t0 + segs[j][0], segs[j][1] - 20, lo, c.v(0.5)); } }
      }
    } },
    // --- ベル・シンセ ---
    { id: "bellObb", cat: "bell", name: "ベルのオブリガート（すきまに鳴る短い飾り）", m: ["4/4", "3/4", "6/8"], snd: "xm-glock", gen: function (c) {
      var last = 79 + c.rs, b;
      var R4 = [[[2880, 480], [3360, 480]], [[1920, 960], [2880, 960]], [[3360, 240], [3600, 240]], [[2400, 480], [2880, 960]]], R3 = [[[1920, 480], [2400, 480]], [[960, 960], [1920, 960]]], R68 = [[[1920, 480], [2400, 480]], [[1440, 480], [2400, 480]]];
      for (b = 0; b < c.bars; b++) {
        if (c.dens === 0 && b % 2 === 0) { continue; }
        var t0 = b * c.bt, ch = c.ch(b), set = c.den === 8 ? R68 : (c.num === 3 ? R3 : R4), rh = set[Math.floor(c.r() * set.length)], k;
        if (c.dens === 2 && c.num === 4) { rh = rh.concat([[960, 480]]).sort(function (x, y) { return x[0] - y[0]; }); }
        for (k = 0; k < rh.length; k++) {
          var cands = [], o;
          for (o = 70 + c.rs; o <= 93 + c.rs; o++) { if (ch.pcs.indexOf(((o % 12) + 12) % 12) >= 0) { cands.push(o); } }
          cands.sort(function (x, y) { return Math.abs(x - last) - Math.abs(y - last); });
          var m = cands[Math.min(cands.length - 1, Math.floor(c.r() * 3))];
          if (m === last && cands.length > 1) { m = cands[1]; }
          last = m;
          c.add(t0 + rh[k][0], Math.max(240, rh[k][1]), m, c.v(0.5 + (k === rh.length - 1 ? 0.06 : 0)));
        }
      }
    } },
    { id: "bellPing", cat: "bell", name: "ベルのアクセント（小節の頭）", m: ["4/4", "3/4", "6/8"], snd: "xm-celesta", gen: function (c) {
      for (var b = 0; b < c.bars; b++) {
        if (c.dens === 0 && b % 2) { continue; }
        var t0 = b * c.bt, ch = c.ch(b), r = pcIn(ch.root, 79 + c.rs), f = pcIn(ch.fifth, r);
        c.add(t0, c.bt, r, c.v(0.55)); c.add(t0, c.bt, f, c.v(0.45));
        if (c.dens === 2) { var h = Math.round(c.bt / 2); c.add(t0 + h, h, pcIn((ch.root + ch.ivs[1]) % 12, r), c.v(0.45)); }
      }
    } },
    { id: "synthArp", cat: "bell", name: "シンセのアルペジオ", m: ["4/4", "3/4", "6/8"], snd: "xm-sparkpluck", gen: function (c) {
      var b, st = c.dens === 0 ? 480 : 240;
      for (b = 0; b < c.bars; b++) {
        var t0 = b * c.bt, vc = ctone(c, b, 64, null), tones = vc.concat(vc.map(function (x) { return x + 12; })), n = Math.round(c.bt / st), seq = tones.slice(), k;
        if (c.dens === 2) { seq = tones.concat([vc[0] + 24]).concat(tones.slice(1).reverse()); }
        for (k = 0; k < n; k++) { c.add(t0 + k * st, Math.round(st * 0.6), seq[k % seq.length], c.v(k * st % c.bl === 0 ? 0.62 : 0.48)); }
      }
    } },
    { id: "chipArp", cat: "bell", name: "8bit のアルペジオ（和音を細かく）", m: ["4/4", "3/4", "6/8"], snd: "xm-8bitbells", gen: function (c) {
      var b, st = c.dens === 0 ? 480 : (c.dens === 2 ? 120 : 240);
      for (b = 0; b < c.bars; b++) {
        var t0 = b * c.bt, vc = ctone(c, b, 72, null), n = Math.round(c.bt / st), k;
        for (k = 0; k < n; k++) { c.add(t0 + k * st, Math.max(60, st - 30), vc[k % vc.length], c.v(k * st % c.bl === 0 ? 0.6 : 0.48)); }
      }
    } },
    { id: "padSwell", cat: "bell", name: "パッドのロングトーン", m: ["4/4", "3/4", "6/8"], snd: "xm-winterpad", gen: function (c) {
      var prev = null, b;
      for (b = 0; b < c.bars; b++) {
        var t0 = b * c.bt, vc = ctone(c, b, 67, prev), i; prev = vc;
        for (i = 0; i < vc.length; i++) { c.add(t0, c.bt, vc[i], c.v(b % 2 ? 0.45 : 0.55)); }
        if (c.dens === 2) { c.add(t0, c.bt, vc[0] - 12, c.v(0.42)); }
      }
    } },
    // --- v2.77 §345 A3-2（一般的な奏法の形・ここで作る）---
    { id: "strum", cat: "keys", name: "ギターのストローク（ダウン・アップ）", m: ["4/4", "3/4", "6/8"], snd: "xm-steel", gen: function (c) {
      var prev = null, b, E = 480, n = Math.round(c.bt / E), i, k;
      var H = c.den === 8 ? [[0, 1], [2, 0], [3, 1], [5, 0]] : (c.num === 3 ? [[0, 1], [2, 1], [3, 0], [4, 1], [5, 0]] : [[0, 1], [2, 1], [3, 0], [5, 0], [6, 1], [7, 0]]);
      var H0 = c.den === 8 ? [[0, 1], [3, 1]] : (c.num === 3 ? [[0, 1], [2, 1], [4, 1]] : [[0, 1], [4, 1]]), H2 = [];
      for (i = 0; i < n; i++) { H2.push([i, i % 2 === 0 ? 1 : 0]); }
      for (b = 0; b < c.bars; b++) {
        var t0 = b * c.bt, vc = ctone(c, b, 57, prev), lo = bassOf(c, b) + 12, hits = c.dens === 0 ? H0 : (c.dens === 2 ? H2 : H); prev = vc;
        for (i = 0; i < hits.length; i++) {
          var nx = i + 1 < hits.length ? hits[i + 1][0] : n, gap = (nx - hits[i][0]) * E - 40, down = hits[i][1] === 1, st = (down ? [lo] : []).concat(vc, [vc[0] + 12]), seen = {}, us = [];
          for (k = 0; k < st.length; k++) { if (!seen[st[k]]) { seen[st[k]] = 1; us.push(st[k]); } }
          if (!down) { us.reverse(); }
          for (k = 0; k < us.length; k++) { c.add(t0 + hits[i][0] * E + k * 12, Math.max(60, gap - k * 12), us[k], c.v((down ? 0.5 : 0.36) - k * 0.01)); }
        }
      }
    } },
    { id: "fingerpick", cat: "keys", name: "ギターのフィンガーピッキング", m: ["4/4", "3/4", "6/8"], snd: "xm-nylon", gen: function (c) {
      var prev = null, b, E = 480, k;
      for (b = 0; b < c.bars; b++) {
        var t0 = b * c.bt, ch = c.ch(b), vc = ctone(c, b, 62, prev), bs = bassOf(c, b) + 12, f5 = pcIn(ch.fifth, bs - 5); prev = vc;
        var seq = c.num === 4 ? [bs, vc[0], vc[1], vc[2], f5, vc[0], vc[1], vc[2]] : [bs, vc[0], vc[1], vc[2], vc[1], vc[0]];
        for (k = 0; k < seq.length; k++) {
          if (c.dens === 0 && k % 2 === 1) { continue; }
          var top = c.dens === 2 && k === seq.length - 1;
          c.add(t0 + k * E, E * 2 - 20, seq[k], c.v(k === 0 ? 0.55 : 0.42));
          if (top) { c.add(t0 + k * E + 10, E - 30, vc[0] + 12, c.v(0.38)); }
        }
      }
    } },
    { id: "organChop", cat: "keys", name: "オルガンの裏打ち（ゴスペル風）", m: ["4/4", "3/4"], snd: "xm-softorgan", gen: function (c) {
      var prev = null, b, j;
      for (b = 0; b < c.bars; b++) {
        var t0 = b * c.bt, vc = ctone(c, b, 64, prev), i; prev = vc;
        if (c.dens === 2) { c.add(t0, c.bt - 40, pcIn(c.ch(b).bass, 36 + c.rs), c.v(0.5)); }
        for (j = 0; j < c.nb; j++) {
          var at = c.dens === 0 ? t0 + j * c.bl : t0 + j * c.bl + c.bl / 2, d = c.dens === 0 ? c.bl - 60 : c.bl / 2 - 60;
          if (c.dens === 0 && j % 2 === 0 && c.num === 4) { continue; }
          for (i = 0; i < vc.length; i++) { c.add(at, d, vc[i], c.v(0.46)); }
        }
      }
    } },
    { id: "danceStab", cat: "keys", name: "ダンスのコードのスタブ（3-3-2）", m: ["4/4"], snd: "pluck", gen: function (c) {
      var prev = null, b, j;
      var S = c.dens === 0 ? [0, 6, 12] : (c.dens === 2 ? [0, 3, 6, 8, 10, 12, 14] : [0, 3, 6, 10, 12]);
      for (b = 0; b < c.bars; b++) {
        var t0 = b * c.bt, vc = ctone(c, b, 64, prev), i; prev = vc;
        for (j = 0; j < S.length; j++) { for (i = 0; i < vc.length; i++) { c.add(t0 + S[j] * STEP, 190, vc[i], c.v(j === 0 ? 0.55 : 0.46)); } }
      }
    } },
    { id: "fourFloor", cat: "drum", name: "4 つ打ち（キック・クラップ・オープンハット）", m: ["4/4"], snd: "@drum", drum: true, gen: function (c) {
      for (var b = 0; b < c.bars; b++) {
        var rows = [[36, [0, 4, 8, 12], 0.9], [39, [4, 12], c.dens === 0 ? 0.6 : 0.75]];
        if (c.dens >= 1) { rows.push([46, [2, 6, 10, 14], 0.5]); }
        if (c.dens === 2) { rows.push([42, [1, 3, 5, 7, 9, 11, 13, 15], 0.3]); }
        drumRows(c, rows, b); crash(c, b, 0.6); fill(c, b);
      }
    } },
    { id: "halfTime", cat: "drum", name: "ハーフタイムのドラム（3 拍目のスネア）", m: ["4/4"], snd: "@drum", drum: true, gen: function (c) {
      for (var b = 0; b < c.bars; b++) {
        drumRows(c, [[36, c.dens === 2 ? [0, 7, 10] : [0, 10], 0.85], [38, [8], 0.85], [42, c.dens === 0 ? every(16, 4) : every(16, 2), 0.45, 0.3]], b);
        crash(c, b, 0.55); fill(c, b);
      }
    } },
    { id: "orchPerc", cat: "drum", name: "オーケストラの打楽器（タム・ロール・シンバル）", m: ["4/4", "3/4", "6/8"], snd: "@drum", drum: true, gen: function (c) {
      var n = stepsPer(c), b, k;
      for (b = 0; b < c.bars; b++) {
        var t0 = b * c.bt;
        c.add(t0, 0, 41, c.v(0.7));
        if (c.dens >= 1) { c.add(t0 + Math.round(n / 2) * STEP, 0, 43, c.v(0.5)); }
        if (c.dens >= 1 && b % 8 === 0) { c.add(t0, 0, 49, c.v(0.55)); }
        if (b % 4 === 3 && c.dens >= 1) { var st0 = n - (c.den === 8 ? 6 : 4); for (k = st0; k < n; k++) { c.add(t0 + k * STEP, 0, 41, c.v(0.35 + (k - st0) * 0.08)); } }
      }
    } },
    { id: "syncBass", cat: "bass", name: "シンコペーションのベース（シティポップ風）", m: ["4/4"], snd: "xm-fingerbass", gen: function (c) {
      var E = 480, b, k;
      for (b = 0; b < c.bars; b++) {
        var t0 = b * c.bt, ch = c.ch(b), r = bassOf(c, b), o = r + 12, f = pcIn(ch.fifth, r);
        var seq = c.dens === 0 ? [[0, r, 1800, 0.72], [4, r, 1800, 0.62]] : [[0, r, 400, 0.75], [3, o, 200, 0.55], [4, r, 400, 0.66], [6, f, 200, 0.55], [7, o, 200, 0.5]];
        for (k = 0; k < seq.length; k++) { c.add(t0 + seq[k][0] * E, seq[k][2], seq[k][1], c.v(seq[k][3])); }
        if (c.dens === 2) { c.add(t0 + 5 * E, 160, r, c.v(0.38)); }
      }
    } },
    { id: "pulseBass", cat: "bass", name: "パルスのベース（8 分・16 分）", m: ["4/4", "3/4"], snd: "xm-synbass", gen: function (c) {
      var b, k;
      for (b = 0; b < c.bars; b++) {
        var t0 = b * c.bt, r = bassOf(c, b), st = c.dens === 0 ? 960 : (c.dens === 2 ? 240 : 480), n = Math.round(c.bt / st);
        for (k = 0; k < n; k++) { var off = (k * st) % 960 !== 0; c.add(t0 + k * st, st - 50, r, c.v(off ? 0.62 : 0.5)); }
      }
    } },
    { id: "jazzWaltzComp", cat: "keys", name: "ジャズワルツのコンピング", m: ["3/4"], snd: "xm-jazzpiano", gen: function (c) {
      var prev = null, b, i, k;
      for (b = 0; b < c.bars; b++) {
        var t0 = b * c.bt, ch = c.ch(b), pcs = [(ch.root + ch.ivs[1]) % 12, (ch.root + (ch.ivs[3] !== undefined ? ch.ivs[3] : (SEVENTH[ch.id] || 10))) % 12], vc;
        if (c.dens === 2 && c.r() < 0.5) { pcs.push((ch.root + 2) % 12); }
        vc = voice(pcs, 60 + c.rs, prev); prev = vc;
        var hits = c.dens === 0 ? [[0, 1800]] : (c.dens === 2 ? [[0, 500], [1440, 400], [2400, 300]] : [[0, 500], [1440, 600]]);
        for (i = 0; i < hits.length; i++) { for (k = 0; k < vc.length; k++) { c.add(t0 + hits[i][0], hits[i][1], vc[k], c.v(i === 0 ? 0.56 : 0.48)); } }
      }
    } },
    { id: "waltzWalk", cat: "bass", name: "3 拍子のウォーキングベース", m: ["3/4"], snd: "xm-upbass", gen: function (c) {
      var b;
      for (b = 0; b < c.bars; b++) {
        var t0 = b * c.bt, ch = c.ch(b), r = bassOf(c, b), nx = b + 1 < c.bars ? bassOf(c, b + 1) : bassOf(c, 0);
        if (c.dens === 0) { c.add(t0, 2700, r, c.v(0.72)); continue; }
        var n2 = pcIn(c.r() < 0.5 ? (ch.root + ch.ivs[1]) % 12 : ch.fifth, r), app = c.r() < 0.6 ? nx + (c.r() < 0.5 ? -1 : 1) : scaleTone(c.key, nx, n2 > nx ? 1 : -1, c.mode);
        if (Math.abs(app - n2) > 7) { app += app > n2 ? -12 : 12; }
        var ns = [r, n2, app], k;
        for (k = 0; k < 3; k++) { c.add(t0 + k * 960, 880, clamp(ns[k], 28, 55), c.v(k === 0 ? 0.74 : 0.6)); }
      }
    } },
    { id: "counterLine", cat: "str", name: "対旋律（コードの音を近くへ動く）", m: ["4/4", "3/4", "6/8"], snd: "xm-cello", gen: function (c) {
      var last = 67 + c.rs, b, j;
      for (b = 0; b < c.bars; b++) {
        var t0 = b * c.bt, ch = c.ch(b), segs = c.dens === 0 ? [[0, c.bt]] : (c.num === 3 && c.den === 4 ? [[0, 1920], [1920, 960]] : [[0, c.bt / 2], [c.bt / 2, c.bt / 2]]);
        if (c.dens === 2 && c.num === 4) { segs = [[0, 1920], [1920, 960], [2880, 960]]; }
        for (j = 0; j < segs.length; j++) {
          var cands = [], o;
          for (o = 60 + c.rs; o <= 76 + c.rs; o++) { if (ch.pcs.indexOf(((o % 12) + 12) % 12) >= 0 && o !== last) { cands.push(o); } }
          cands.sort(function (x, y) { return Math.abs(x - last) - Math.abs(y - last) || x - y; });
          var m = cands[j === 0 ? 0 : Math.min(cands.length - 1, Math.floor(c.r() * 2))];
          last = m;
          c.add(t0 + segs[j][0], segs[j][1] - 30, m, c.v(j === 0 ? 0.5 : 0.44));
        }
      }
    } },
    { id: "lullabyArp", cat: "bell", name: "子守歌のアルペジオ（ゆれる分散和音）", m: ["4/4", "3/4", "6/8"], snd: "xm-musicbox", gen: function (c) {
      var b, k;
      for (b = 0; b < c.bars; b++) {
        var t0 = b * c.bt, vc = ctone(c, b, 72, null), seq = [vc[0], vc[1], vc[2], vc[0] + 12, vc[2], vc[1]];
        var st = c.dens === 0 ? c.bl : (c.dens === 2 ? (c.den === 8 ? 240 : c.bl / 2) : (c.den === 8 ? 480 : c.bl)), n = Math.round(c.bt / st);
        for (k = 0; k < n; k++) { c.add(t0 + k * st, (k === n - 1 ? st : st * 2) - 10, seq[k % seq.length], c.v(k === 0 ? 0.5 : 0.4)); } // 小節の最後の音は次の小節へのばさない（同じ高さの重なりを作らない）
      }
    } },
    { id: "brassStabs", cat: "str", name: "ブラスのキメ（2 拍目の裏・4 拍目）", m: ["4/4"], snd: "xm-softbrass", gen: function (c) {
      var prev = null, b, j;
      for (b = 0; b < c.bars; b++) {
        var t0 = b * c.bt, vc = ctone(c, b, 64, prev), i, hits; prev = vc;
        if (c.dens === 0) { if (b % 2 === 1) { continue; } hits = [[2880, 600]]; }
        else { hits = c.dens === 2 ? [[960, 200], [1440, 260], [2400, 200], [2880, 500]] : [[1440, 260], [2880, 500]]; }
        for (j = 0; j < hits.length; j++) { for (i = 0; i < vc.length; i++) { c.add(t0 + hits[j][0], hits[j][1], vc[i], c.v(j === hits.length - 1 ? 0.58 : 0.5)); } }
      }
    } }
  ];
  function pat(id) { for (var i = 0; i < PATS.length; i++) { if (PATS[i].id === id) { return PATS[i]; } } return null; }
  function meterKey(num, den) { return num + "/" + den; }
  function patsFor(num, den) { var k = meterKey(num, den), out = [], i; for (i = 0; i < PATS.length; i++) { if (PATS[i].m.indexOf(k) >= 0) { out.push(PATS[i]); } } return out; }

  // ---------- MIDI 伴奏ジェネレーター ----------
  var DENS = ["すくない", "ふつう", "多い"], VELS = ["なし", "少し", "大きい"], RANGES = [["low", "低い", -12], ["mid", "ふつう", 0], ["high", "高い", 12]], LENS = [4, 8, 16];
  var VEL_AMT = [0, 0.07, 0.16];
  // 設定を整える（知らない値ははじめの値）
  function genClean(o) {
    o = o || {};
    var x = {
      pat: pat(o.pat) ? o.pat : "arpPiano", key: clamp(Math.round(Number(o.key)) || 0, 0, 11), prog: progById(o.prog)[0],
      bars: Math.round(Number(o.bars)) >= 1 && Math.round(Number(o.bars)) <= 64 ? Math.round(Number(o.bars)) : 8, range: o.range === "low" || o.range === "high" ? o.range : "mid",
      vel: clamp(Math.round(Number(o.vel)) || 0, 0, 2), dens: o.dens === undefined ? 1 : clamp(Math.round(Number(o.dens)) || 0, 0, 2),
      seed: (Math.round(Number(o.seed)) >>> 0) % 100000 || 1, custom: {}
    };
    if (o.vel === undefined) { x.vel = 1; }
    if (o.nofill) { x.nofill = 1; }
    x.mode = o.mode === "min" ? "min" : "maj";
    if (o.custom && typeof o.custom === "object") { for (var k in o.custom) { if (o.custom.hasOwnProperty(k) && CHORDS[o.custom[k]] && Number(k) >= 0 && Number(k) < 64) { x.custom[Math.round(Number(k))] = o.custom[k]; } } }
    return x;
  }
  // 作る → { ok, why, notes, len, drum, pat }。meter: { num, den }。同じ設定・シードなら同じ音符
  function generate(o, meter) {
    var g = genClean(o), P = pat(g.pat), num = meter && meter.num || 4, den = meter && meter.den || 4;
    if (P.m.indexOf(meterKey(num, den)) < 0) { return { ok: false, why: "「" + P.name + "」は " + P.m.join("・") + " の曲で使えます（この曲は " + num + "/" + den + "）" }; }
    var bt = Math.round(num * PPQ * 4 / den), chords = chordsFor(g.prog, g.bars, g.custom, g.mode), r = rng(g.seed * 7919 + 13), notes = [], amt = VEL_AMT[g.vel], rs = 0, i;
    for (i = 0; i < RANGES.length; i++) { if (RANGES[i][0] === g.range) { rs = RANGES[i][2]; } }
    var c = {
      bars: g.bars, bt: bt, num: num, den: den, bl: den === 8 && num % 3 === 0 ? 1440 : Math.round(PPQ * 4 / den), nb: den === 8 && num % 3 === 0 ? num / 3 : num,
      key: g.key, mode: g.mode, r: r, dens: g.dens, rs: P.drum ? 0 : rs, nofill: !!g.nofill,
      ch: function (b) { return chordOf(g.key, chords[b % chords.length]); },
      v: function (base) { var x = base * (1 + amt * (r() * 2 - 1)); return r3(clamp(x, 0.08, 1)); },
      add: function (t, d, m, v) { t = Math.round(t); if (t < 0 || t >= g.bars * bt) { return; } d = Math.round(d); if (d > 0 && t + d > g.bars * bt) { d = g.bars * bt - t; } notes.push([t, Math.max(P.drum ? 0 : 1, d), clamp(Math.round(m), 0, 127), v]); }
    };
    P.gen(c);
    // 同じ時刻・同じ高さは 1 つ（重なりを作らない）
    notes.sort(function (a, b) { return a[0] - b[0] || a[2] - b[2] || b[3] - a[3]; });
    var out = [], seen = {};
    for (i = 0; i < notes.length; i++) { var key = notes[i][0] + ":" + notes[i][2]; if (!seen[key]) { seen[key] = 1; out.push(notes[i]); } }
    return { ok: true, notes: out, len: g.bars * bt, drum: !!P.drum, pat: P, set: g, chords: chords };
  }
  // 音色の高さの範囲に入れる（オクターブで動かす）
  function fitRange(notes, id) {
    var s = sound(id), lo = s && s[5].lo, hi = s && s[5].hi, i;
    if (!lo || !hi) { return notes; }
    for (i = 0; i < notes.length; i++) { var m = notes[i][2]; while (m < lo && m + 12 <= 127) { m += 12; } while (m > hi && m - 12 >= 0) { m -= 12; } notes[i][2] = m; }
    // オクターブを動かして同じ時刻・同じ高さになった音は 1 つ（強いほう）にする（v2.74 §345・重なりの不具合）
    var best = {}, k;
    for (i = 0; i < notes.length; i++) { k = notes[i][0] + ":" + notes[i][2]; if (best[k] === undefined || notes[i][3] > notes[best[k]][3]) { best[k] = i; } }
    for (i = notes.length - 1; i >= 0; i--) { if (best[notes[i][0] + ":" + notes[i][2]] !== i) { notes.splice(i, 1); } }
    return notes;
  }
  function xgenOf(g) { var o = { v: 1, pat: g.pat, key: g.key, prog: g.prog, bars: g.bars, range: g.range, vel: g.vel, dens: g.dens, seed: g.seed, custom: g.custom }; if (g.nofill) { o.nofill = 1; } if (g.mode === "min") { o.mode = "min"; } return o; }
  // 曲に置く（DAW の ↶ は呼ぶ側）→ { ok, why, track, clip, notes }。dest: { track: id | "" （新しいトラック）, bar（1 から）, sound }
  function place(p, o, dest) {
    var M = DM(), m0 = M.meterAt(p, 0), r = generate(o, m0), t, s, bt = M.barTicks(p), snd = dest && dest.sound;
    if (!r.ok) { return r; }
    var bar = Math.max(1, Math.round(Number(dest && dest.bar) || 1)), start = (bar - 1) * bt;
    if (start + r.len > MAXB * bt) { return { ok: false, why: "曲の長さ（" + MAXB + " 小節）をこえます" }; }
    if (dest && dest.track) {
      t = M.findTrack(p, dest.track);
      if (!t || t.kind !== "midi" || M.isAudio(t)) { return { ok: false, why: "そのトラックには置けません（MIDI のトラックを選んでください）" }; }
      if (M.isDrum(t) !== r.drum) { return { ok: false, why: r.drum ? "リズムのパターンは、ドラムのトラックに置きます（「新しいトラック」を選ぶか、ドラムのトラックを選んでください）" : "音の高さのあるパターンは、ドラムでないトラックに置きます" }; }
      if (M.overlapClip(t, start, r.len)) { return { ok: false, why: bar + " 小節目から " + Math.round(r.len / bt) + " 小節に、もうクリップがあります（上書きしません。ほかの小節か、新しいトラックを選んでください）" }; }
      snd = (t.ext && t.ext.xm) || (t.instrument && t.instrument.ext && t.instrument.ext.preset) || "";
    } else {
      if (p.tracks.length >= M.MAX_TRACKS) { return { ok: false, why: "トラックは " + M.MAX_TRACKS + " 本までです（いまのトラックを選んで置いてください）" }; }
      var isDr = snd === "@drum" || !!(sound(snd) && sound(snd)[3] === "drum");
      if (r.drum) { snd = isDr ? snd : (r.pat.snd || "@drum"); }
      else { snd = snd && !isDr && (sound(snd) || synPatchOf(snd)) ? snd : r.pat.snd; }
      t = makeTrack(p, snd, sound(snd) && sound(snd)[3] !== "drum" ? null : r.pat.name.replace(/（.*$/, "").substring(0, 30));
      if (!t) { return { ok: false, why: "トラックを足せませんでした" }; }
    }
    if (!r.drum) { fitRange(r.notes, snd); }
    var c = M.newMidiClip(p, t, start, r.len, r.notes, r.pat.name.replace(/（.*$/, "").substring(0, 30));
    c.ext.xgen = xgenOf(r.set); stampClip(c); // §345 A5: 音符の指紋
    t.clips.sort(function (a, b) { return a.start - b.start; });
    s = { ok: true, track: t, clip: c, notes: c.notes.length, set: r.set };
    return s;
  }
  // 作りなおす（同じクリップの中身だけ置きかえる。o は変えたい設定）
  function regen(p, clipId, o) {
    var M = DM(), f = M.findClip(p, clipId);
    if (!f || !f.clip.ext || !f.clip.ext.xgen) { return { ok: false, why: "このクリップは伴奏ジェネレーターで作ったものではありません" }; }
    var base = f.clip.ext.xgen, x = {}, k;
    for (k in base) { if (base.hasOwnProperty(k)) { x[k] = base[k]; } }
    for (k in o || {}) { if (o.hasOwnProperty(k)) { x[k] = o[k]; } }
    var r = generate(x, M.meterAt(p, 0));
    if (!r.ok) { return r; }
    if (r.len !== f.clip.len && M.overlapClip(f.track, f.clip.start, r.len, f.clip)) { return { ok: false, why: "長さを変えると、うしろのクリップと重なります" }; }
    if (!r.drum) { fitRange(r.notes, (f.track.ext && f.track.ext.xm) || (f.track.instrument && f.track.instrument.ext && f.track.instrument.ext.preset)); }
    var keepT = base.t, keepSv = base.sv;
    f.clip.len = r.len; f.clip.offset = 0; f.clip.notes = M.cleanNotes(r.notes); f.clip.ext.xgen = xgenOf(r.set); stampClip(f.clip, { t: keepT, sv: keepSv });
    return { ok: true, track: f.track, clip: f.clip, notes: f.clip.notes.length, set: r.set };
  }

  // ---------- クリスマス編曲テンプレート（v2: セクションの型・構成・セクションごとの設定 §345）----------
  // tracks: [音色, パターン, [A の密度, サビの密度]（null ＝ その所は作らない）, 音域, 名前, { セクションの型: 密度 | [パターン, 密度] | null }（なくてよい・上書き）]
  // prog: { セクションの型: コード進行 }（なくてよい）・sec: { セクションの型: セクションの設定 }（なくてよい）
  var TPLS = [
    { id: "pop", genre: "xmas", moods: ["bright", "party"], rec: 1, tags: "Christmas pop sparkle bells sleigh クリスマス ポップ キラキラ ベル スレイベル", aim: "8 分のエレピとベースで前へ進み、グロッケンのかざりとスレイベルでクリスマスらしさを足す。サビで弦が広がり、キラキラのシンセが入る", name: "&#x2728; キラキラ・クリスマスポップ", num: 4, den: 4, bpm: 120, key: 2, progs: ["p2", "p1"], desc: "8 分のピアノ・ベース・弦・ベルのかざり・8 ビートとスレイベル", tracks: [
      ["xm-ep", "popPiano8", [0, 1], "mid", "エレピ"], ["bass", "popBass8", [0, 1], "mid", "ベース"], ["xm-strings", "stringsLong", [0, 1], "mid", "ストリングス"],
      ["xm-glock", "bellObb", [0, 1], "mid", "グロッケン"], ["xm-sparkpluck", "synthArp", [null, 0], "mid", "キラキラ"], ["@drum", "pop8", [0, 1], "mid", "ドラム"], ["xm-sleigh", "sleigh8", [0, 1], "mid", "スレイベル"]] },
    { id: "ballad", genre: "xmas", moods: ["calm", "warm", "sad"], rec: 1, tags: "Christmas ballad silent night piano strings クリスマス バラード 聖夜 しっとり ピアノ 弦", aim: "ゆっくりしたピアノの伴奏と弦のロングトーンで、歌のための余白を大きくとる。サビだけドラムとパッドが入る", name: "&#x1F56F;&#xFE0F; 聖夜のバラード", num: 4, den: 4, bpm: 72, key: 3, progs: ["p1", "p2"], desc: "ゆったりしたピアノ・弦のロングトーン・チェレスタ・声のようなパッド", tracks: [
      ["xm-warmpiano", "balladPiano", [0, 1], "mid", "ピアノ"], ["xm-upbass", "balladBass", [0, 1], "mid", "ベース"], ["xm-strings", "stringsLong", [0, 1], "mid", "ストリングス"],
      ["xm-celesta", "bellPing", [0, 1], "mid", "チェレスタ"], ["xm-choirpad", "padSwell", [null, 1], "mid", "パッド"], ["@drum", "ballad", [null, 1], "mid", "ドラム"], ["xm-sleigh", "sleigh8", [null, 0], "mid", "スレイベル"]] },
    { id: "jazz", genre: "xmas", moods: ["cool", "warm"], rec: 1, tags: "Christmas jazz swing piano trio クリスマス ジャズ スイング おしゃれ", aim: "3 度と 7 度のピアノのコンピングとウォーキングベースのジャズトリオ。A はブラシ風・サビはライドのスイング", name: "&#x1F3B7; クリスマス・ジャズ", num: 4, den: 4, bpm: 132, key: 5, progs: ["p4", "p5"], prog: { B: "p6", bridge: "p4" }, desc: "ジャズピアノのコンピング・ウォーキングベース・ブラシ風・ビブラフォン（スイング 3:1）", tracks: [
      ["xm-jazzpiano", "jazzComp", [1, 2], "mid", "ジャズピアノ"], ["xm-upbass", "walking", [1, 1], "mid", "ウッドベース"], ["xm-brush", "brush", [1, null], "mid", "ブラシ", { intro: 0, outro: 0, bridge: 0 }],
      ["xm-brush", "swing", [null, 1], "mid", "スイング"], ["xm-vibes", "bellObb", [0, 1], "low", "ビブラフォン"], ["xm-sleigh", "sleighShuffle", [null, 0], "mid", "スレイベル"]] },
    { id: "orch", genre: "xmas", moods: ["grand", "warm"], rec: 1, tags: "Christmas orchestra waltz harp horn クリスマス オーケストラ ワルツ ハープ ホルン", aim: "3 拍子のワルツ。ピチカートの刻みとハープで軽く始め、サビでホルン・グロッケン・スレイベルが入って華やかに", name: "&#x1F3BB; オーケストラ・クリスマス", num: 3, den: 4, bpm: 138, key: 7, progs: ["p3", "p1"], desc: "3 拍子のワルツ。ピチカート・ハープ・弦・ホルン・グロッケン", tracks: [
      ["xm-pizz", "pizz", [1, 1], "mid", "ピチカート"], ["xm-upbass", "waltzBass", [0, 1], "mid", "コントラバス風"], ["xm-harp", "harpArp", [0, null], "mid", "ハープ", { intro: 0, bridge: 0, outro: 0 }],
      ["xm-harp", "harpFlow", [null, 1], "mid", "ハープ（流れ）", { intro: null, bridge: null, outro: null }], ["xm-strings", "stringsLong", [0, 1], "mid", "ストリングス"], ["xm-horn", "hornPad", [null, 1], "mid", "ホルン"],
      ["xm-glock", "bellObb", [null, 1], "mid", "グロッケン"], ["xm-sleigh", "sleighWaltz", [null, 1], "mid", "スレイベル"]] },
    { id: "chip", genre: "xmas", moods: ["retro", "bright"], rec: 1, tags: "Christmas 8bit chiptune retro game クリスマス レトロ ゲーム ピコピコ", aim: "四角い波の細かいアルペジオとオクターブのベースで、昔のゲーム機のようなクリスマス", name: "&#x1F47E; レトロ 8bit クリスマス", num: 4, den: 4, bpm: 140, key: 0, progs: ["p2", "p1"], desc: "四角い波のアルペジオ・オクターブのベース・8bit のドラム・ベル", tracks: [
      ["xm-8bitbells", "chipArp", [1, 2], "mid", "8bit アルペジオ", { bridge: 0 }], ["chip", "chipBass", [1, 1], "mid", "8bit ベース"], ["xm-brightbells", "bellObb", [null, 1], "mid", "ベル"],
      ["@drum", "chipDrums", [1, 1], "mid", "8bit ドラム"], ["xm-sleigh", "sleigh8", [0, 1], "mid", "スレイベル"]] },
    // ===== v2.77 §345 A3-2: 🎄 Christmas =====
    { id: "xacoustic", genre: "xmas", moods: ["warm", "calm"], rec: 1, tags: "Christmas acoustic guitar fingerpicking クリスマス アコースティック ギター 弾き語り", aim: "ナイロンギターのフィンガーピッキングが主役。ブラシとウッドベースは軽く、サビでスチールギターのストロークと弦・ベルが重なる。歌の余白が多い", name: "&#x1F3B8; アコースティック・クリスマス", num: 4, den: 4, bpm: 96, key: 7, progs: ["p1", "p2"], desc: "フィンガーピッキング・ストローク・ブラシ・ウッドベース・グロッケン", tracks: [
      ["xm-nylon", "fingerpick", [0, 1], "mid", "ナイロンギター"], ["xm-steel", "strum", [null, 0], "mid", "ストローク"], ["xm-upbass", "bassRoot5", [0, 1], "mid", "ウッドベース"],
      ["xm-strings", "stringsHalf", [null, 0], "mid", "ストリングス"], ["xm-glock", "bellObb", [null, 0], "mid", "グロッケン"], ["xm-brush", "brush", [0, 1], "mid", "ブラシ"], ["xm-sleigh", "sleigh8", [null, 0], "mid", "スレイベル"]] },
    { id: "xswing", genre: "xmas", moods: ["party", "cool"], rec: 1, tags: "Christmas swing big band brass クリスマス スイング ビッグバンド ブラス", aim: "速いスイング。ブラスのキメ（2 拍目の裏・4 拍目）がサビを押し上げ、ウォーキングベースとライドがずっと前へ進む。Imaj7–vi7–ii7–V7 の回る進行", name: "&#x1F3BA; クリスマス・スイング", num: 4, den: 4, bpm: 168, key: 10, progs: ["p8", "p5"], desc: "ジャズピアノ・ウォーキングベース・ブラスのキメ・ギターのきざみ・スイングのドラム・スレイベル", tracks: [
      ["xm-jazzpiano", "jazzComp", [1, 1], "mid", "ピアノ"], ["xm-upbass", "walking", [1, 2], "mid", "ウッドベース"], ["xm-softbrass", "brassStabs", [0, 1], "mid", "ブラス"],
      ["xm-brush", "swing", [1, 1], "mid", "スイング"], ["xm-sleigh", "sleighShuffle", [0, 1], "mid", "スレイベル"], ["xm-cleangtr", "strum", [0, 0], "mid", "ギター（4 ビートのきざみ）"]] },
    { id: "xwaltz", genre: "xmas", moods: ["warm", "bright"], rec: 1, tags: "Christmas waltz piano clarinet クリスマス ワルツ 3拍子 ピアノ クラリネット", aim: "小さな編成のワルツ。ピアノのズン・チャッ・チャッにウォーキングのベース、クラリネットの対旋律が歌の合間をつなぐ（🎻 オーケストラのワルツより軽く、近い音）", name: "&#x1F483; クリスマス・ワルツ", num: 3, den: 4, bpm: 152, key: 5, progs: ["p1", "p3"], desc: "ワルツのピアノ・ウォーキングベース・クラリネットの対旋律・チェレスタ", tracks: [
      ["xm-warmpiano", "waltzPiano", [0, 1], "mid", "ピアノ"], ["xm-upbass", "waltzWalk", [1, 1], "mid", "ウッドベース"], ["xm-clarinet", "counterLine", [0, 1], "mid", "クラリネット"],
      ["xm-celesta", "bellObb", [null, 1], "mid", "チェレスタ"], ["xm-strings", "stringsLong", [null, 0], "mid", "ストリングス"], ["xm-sleigh", "sleighWaltz", [null, 0], "mid", "スレイベル"]] },
    { id: "xgospel", genre: "xmas", moods: ["warm", "grand"], rec: 1, tags: "Christmas gospel organ choir クリスマス ゴスペル オルガン コーラス 合唱", aim: "オルガンの裏打ちとバラードのピアノ。オンコード（I/3）の進行で上へ進み、サビでコーラスの録音が重なる。手拍子のような 2・4 拍", name: "&#x26EA; ゴスペル風クリスマス", num: 4, den: 4, bpm: 92, key: 3, progs: ["p9", "p3"], desc: "オルガンの裏打ち・ピアノ・コーラス・フィンガーベース・ドラム", tracks: [
      ["xm-softorgan", "organChop", [1, 1], "mid", "オルガン"], ["xm-warmpiano", "balladPiano", [0, 1], "mid", "ピアノ"], ["xm-choir", "padSwell", [null, 1], "mid", "コーラス"],
      ["xm-fingerbass", "bassRoot5", [0, 1], "mid", "ベース"], ["@drum", "ballad", [0, 1], "mid", "ドラム"], ["xm-sleigh", "bellAccent", [null, 0], "mid", "ベル"]] },
    { id: "xcinema", genre: "xmas", moods: ["grand", "sad"], rec: 1, tags: "Christmas cinematic film orchestra choir クリスマス 映画 シネマティック 壮大", aim: "パッドとハープで静かに始まり、チェロの対旋律がつなぐ。サビでホルン・コーラス・オーケストラの打楽器が入り、大きく広がる", name: "&#x1F3AC; シネマティック・クリスマス", num: 4, den: 4, bpm: 84, key: 2, progs: ["p7", "p6"], desc: "映画のようなパッド・ハープ・チェロ・ホルン・コーラス・ティンパニ風", tracks: [
      ["xm-cinepad", "padSwell", [0, 1], "mid", "パッド"], ["xm-harp", "harpFlow", [0, 1], "mid", "ハープ"], ["xm-cello", "counterLine", [0, 1], "low", "チェロ"],
      ["xm-horn", "hornPad", [null, 1], "mid", "ホルン"], ["xm-choir", "padSwell", [null, 0], "high", "コーラス"], ["@drum", "orchPerc", [0, 1], "mid", "打楽器"], ["xm-celesta", "bellPing", [0, 0], "mid", "チェレスタ"]] },
    { id: "xlullaby", genre: "xmas", moods: ["calm", "warm"], rec: 1, tags: "Christmas lullaby music box harp 6/8 クリスマス 子守歌 オルゴール ハープ 静か", aim: "6/8 のゆれ。オルゴールの分散和音とハープだけで始め、サビでフルートと弦がやさしく入る。ドラムは使わない", name: "&#x1F319; クリスマス子守歌", num: 6, den: 8, bpm: 58, key: 5, progs: ["p3", "p1"], desc: "6/8・オルゴール・ハープ・フルート・弦・ウッドベース", tracks: [
      ["xm-musicbox", "lullabyArp", [0, 1], "mid", "オルゴール"], ["xm-harp", "harpArp", [0, 0], "low", "ハープ"], ["xm-flute", "counterLine", [null, 0], "high", "フルート"],
      ["xm-strings", "stringsLong", [null, 0], "mid", "ストリングス"], ["xm-upbass", "balladBass", [0, 0], "mid", "ベース"], ["xm-sleigh", "sleigh68", [null, 0], "mid", "スレイベル"]] },
    { id: "xdance", genre: "xmas", moods: ["party", "bright"], rec: 1, tags: "Christmas dance EDM four on the floor クリスマス ダンス 4つ打ち", aim: "マイナーの 4 つ打ち。シンセベースのパルスとプラックのスタブ、16 分のスレイベル。サビで明るいベルが入る", name: "&#x1F57A; クリスマス・ダンス", num: 4, den: 4, bpm: 124, key: 9, kmode: "min", progs: ["m3", "m1"], desc: "マイナー・4 つ打ち・シンセベース・スタブ・スレイベルの 16 分", tracks: [
      ["xm-synbass", "pulseBass", [1, 1], "mid", "シンセベース"], ["pluck", "danceStab", [0, 1], "mid", "スタブ"], ["@drum", "fourFloor", [1, 2], "mid", "ドラム"],
      ["xm-brightbells", "bellObb", [null, 1], "mid", "ベル"], ["xm-winterpad", "padSwell", [0, 0], "mid", "パッド"], ["xm-sleigh", "sleigh16", [0, 1], "mid", "スレイベル"]] },
    // ===== 🎤 J-POP・POP =====
    { id: "jpop", genre: "pop", moods: ["bright", "sad"], tags: "J-POP royal road progression piano guitar 王道 進行 ピアノ ギター", aim: "サビは IV–V–iii–vi（よく使われる流れ）。8 分のピアノとストロークのエレキ、ドラムはサビで密に。弦の 2 分音符とベルでサビを広げる", name: "&#x1F3A4; 王道 J-POP", num: 4, den: 4, bpm: 132, key: 0, progs: ["p2", "p6"], desc: "8 分のピアノ・エレキのストローク・ベース・弦・ドラム", tracks: [
      ["xm-warmpiano", "popPiano8", [0, 1], "mid", "ピアノ"], ["xm-cleangtr", "strum", [0, 1], "mid", "エレキ"], ["xm-fingerbass", "popBass8", [0, 1], "mid", "ベース"],
      ["xm-strings", "stringsHalf", [null, 1], "mid", "ストリングス"], ["@drum", "pop8", [1, 2], "mid", "ドラム"], ["xm-synthbells", "bellObb", [null, 0], "mid", "ベル"]] },
    { id: "pianopop", genre: "pop", moods: ["bright", "warm"], tags: "piano pop arpeggio ピアノポップ 分散和音", aim: "ピアノの分散和音が主役。オンコードの進行でベースが下へ歩く。サビで弦の対旋律が入る", name: "&#x1F3B9; ピアノポップ", num: 4, den: 4, bpm: 112, key: 3, progs: ["p9", "p2"], desc: "ピアノの分散和音・ベース・弦の対旋律・ドラム", tracks: [
      ["xm-warmpiano", "arpPiano", [1, 2], "mid", "ピアノ"], ["xm-fingerbass", "bassRoot5", [0, 1], "mid", "ベース"], ["xm-strings", "counterLine", [null, 1], "mid", "ストリングス"],
      ["@drum", "pop8", [0, 1], "mid", "ドラム"], ["xm-marimba", "bellPing", [null, 0], "mid", "マリンバ"]] },
    { id: "acoupop", genre: "pop", moods: ["bright", "warm"], tags: "acoustic pop guitar tambourine marimba アコースティックポップ ギター タンバリン", aim: "スチールギターの 8 分のストロークとタンバリンで明るく弾む。マリンバのかざりとベース。vi–IV–I–V で前向きに終わらない流れ", name: "&#x1F33B; アコースティックポップ", num: 4, den: 4, bpm: 116, key: 2, progs: ["p2", "p7"], desc: "ストローク・タンバリン・マリンバ・ベース", tracks: [
      ["xm-steel", "strum", [1, 2], "mid", "ギター"], ["xm-fingerbass", "bassRoot5", [1, 1], "mid", "ベース"], ["@drum", "tamb16", [0, 1], "mid", "タンバリン"],
      ["xm-marimba", "bellObb", [0, 1], "low", "マリンバ"], ["xm-nylon", "fingerpick", [null, 0], "mid", "ナイロンギター"]] },
    { id: "citypop", genre: "pop", moods: ["cool", "retro"], tags: "city pop 80s electric piano slap bass brass シティポップ 80年代 エレピ", aim: "Imaj7–vi7–ii7–V7 の回る進行。シンコペーションのベースとエレピ・エレキ、サビでブラスのキメ。都会的でおしゃれに", name: "&#x1F303; シティポップ", num: 4, den: 4, bpm: 108, key: 5, progs: ["p8", "p9"], desc: "エレピ・エレキ・シンコペーションのベース・ブラス・ドラム", tracks: [
      ["xm-ep", "popPiano8", [0, 1], "mid", "エレピ"], ["xm-cleangtr", "strum", [0, 0], "high", "エレキ"], ["xm-fingerbass", "syncBass", [1, 2], "mid", "ベース"],
      ["xm-softbrass", "brassStabs", [null, 1], "mid", "ブラス"], ["@drum", "pop8", [1, 2], "mid", "ドラム"], ["xm-winterpad", "padSwell", [0, 0], "mid", "パッド"]] },
    { id: "electropop", genre: "pop", moods: ["bright", "party"], tags: "electro pop synth arpeggio エレクトロポップ シンセ", aim: "シンセのアルペジオとパルスのベースで機械的に走る。A はハーフタイム、サビは 8 ビートで一気に開く", name: "&#x26A1; エレクトロポップ", num: 4, den: 4, bpm: 128, key: 7, progs: ["p2", "p7"], desc: "シンセのアルペジオ・パルスベース・パッド・ドラム", tracks: [
      ["xm-sparkpluck", "synthArp", [1, 2], "mid", "アルペジオ"], ["xm-synbass", "pulseBass", [1, 2], "mid", "シンセベース"], ["pad", "padSwell", [0, 1], "mid", "パッド"],
      ["@drum", "pop8", [1, 2], "mid", "ドラム", { intro: null, A: ["halfTime", 1], B: ["halfTime", 1], bridge: ["halfTime", 0] }], ["xm-synthbells", "bellPing", [null, 0], "mid", "ベル"]] },
    { id: "ssw", genre: "pop", moods: ["calm", "sad"], tags: "singer songwriter acoustic guitar solo シンガーソングライター 弾き語り ギター", aim: "ナイロンギターのフィンガーピッキングだけで歌を支える最小の編成。サビでチェロの対旋律とベースが少しだけ足される", name: "&#x1FA91; シンガーソングライター", num: 4, den: 4, bpm: 84, key: 0, progs: ["p1", "p9"], desc: "フィンガーピッキング・チェロ・ベース（最小の編成）", tracks: [
      ["xm-nylon", "fingerpick", [0, 1], "mid", "ギター"], ["xm-cello", "counterLine", [null, 0], "low", "チェロ"], ["xm-upbass", "balladBass", [null, 0], "mid", "ベース"]] },
    { id: "midballad", genre: "pop", moods: ["sad", "warm"], tags: "ballad mid tempo piano strings ミドルテンポ バラード ピアノ 弦", aim: "ピアノのバラード伴奏にハーフタイムのドラム。弦の対旋律が歌の合間を埋め、サビで弦のロングトーンとコーラスが重なる", name: "&#x1F4A7; ミドルテンポバラード", num: 4, den: 4, bpm: 80, key: 8, progs: ["p9", "p6"], desc: "ピアノ・ハーフタイムのドラム・弦の対旋律・コーラス", tracks: [
      ["xm-warmpiano", "balladPiano", [1, 2], "mid", "ピアノ"], ["xm-fingerbass", "balladBass", [0, 1], "mid", "ベース"], ["xm-strings", "counterLine", [0, 1], "mid", "対旋律"],
      ["xm-strings", "stringsLong", [null, 1], "low", "ストリングス"], ["@drum", "halfTime", [0, 1], "mid", "ドラム"], ["xm-choir", "padSwell", [null, 0], "mid", "コーラス"]] },
    { id: "uptempo", genre: "pop", moods: ["bright", "party"], tags: "up tempo fast pop rock brass アップテンポ 速い ブラス", aim: "速い 8 ビート。ピアノとベースは 8 分で走り、エレキのストロークは 8 分ぜんぶ。サビでブラスのキメが入る", name: "&#x1F3C3; アップテンポポップ", num: 4, den: 4, bpm: 152, key: 9, progs: ["p5", "p2"], desc: "8 分のピアノとベース・エレキのストローク・ブラス・ドラム", tracks: [
      ["xm-warmpiano", "popPiano8", [1, 2], "mid", "ピアノ"], ["xm-fingerbass", "popBass8", [1, 2], "mid", "ベース"], ["xm-cleangtr", "strum", [2, 2], "mid", "エレキ"],
      ["xm-softbrass", "brassStabs", [null, 1], "mid", "ブラス"], ["@drum", "pop8", [1, 2], "mid", "ドラム"]] },
    // ===== 🎷 Jazz・Orchestra =====
    { id: "jtrio", genre: "jazz", moods: ["cool"], tags: "jazz trio piano bass drums ジャズトリオ ピアノトリオ", aim: "ピアノ・ベース・ドラムの 3 つだけ。3 度と 7 度のコンピング、ウォーキングベース、ライドのスイング。メロディの余白がいちばん多いジャズ", name: "&#x1F3B9; ジャズトリオ", num: 4, den: 4, bpm: 140, key: 10, progs: ["p8", "p4"], desc: "ピアノ・ウォーキングベース・スイングのドラム（3 人）", tracks: [
      ["xm-jazzpiano", "jazzComp", [1, 2], "mid", "ピアノ"], ["xm-upbass", "walking", [1, 2], "mid", "ベース"], ["xm-brush", "swing", [1, 1], "mid", "ドラム"]] },
    { id: "slowjazz", genre: "jazz", moods: ["calm", "cool", "sad"], tags: "slow jazz ballad brush vibraphone スロージャズ バラード ブラシ", aim: "ゆっくりのジャズ。ベースは 2 分音符の 2 ビート、ピアノはのばす和音、ブラシ。サビだけ 4 ビートになり、クラリネットの対旋律が入る", name: "&#x1F319; スロージャズ", num: 4, den: 4, bpm: 72, key: 3, progs: ["p4", "p8"], desc: "のばすピアノ・2 ビートのベース・ブラシ・クラリネット", tracks: [
      ["xm-jazzpiano", "jazzComp", [0, 1], "mid", "ピアノ"], ["xm-upbass", "walking", [0, 1], "mid", "ベース"], ["xm-brush", "brush", [0, 1], "mid", "ブラシ"], ["xm-clarinet", "counterLine", [null, 0], "mid", "クラリネット"]] },
    { id: "jwaltz", genre: "jazz", moods: ["cool", "sad"], tags: "jazz waltz 3/4 minor ジャズワルツ 3拍子 マイナー", aim: "マイナーの 3 拍子のジャズ。1 拍目と 2 拍目の裏のコンピング、3 拍子のウォーキング、ブラシ。サビでビブラフォン", name: "&#x1F378; ジャズワルツ", num: 3, den: 4, bpm: 150, key: 2, kmode: "min", progs: ["m4", "m3"], desc: "3/4・マイナー・ジャズワルツのコンピング・ウォーキング・ブラシ", tracks: [
      ["xm-jazzpiano", "jazzWaltzComp", [1, 2], "mid", "ピアノ"], ["xm-upbass", "waltzWalk", [1, 1], "mid", "ベース"], ["xm-brush", "brush", [1, 1], "mid", "ブラシ"], ["xm-vibes", "bellObb", [null, 1], "low", "ビブラフォン"]] },
    { id: "orchballad", genre: "jazz", moods: ["grand", "sad", "warm"], tags: "orchestra ballad strings harp horn オーケストラ バラード 弦 ハープ", aim: "ハープの分散和音と弦のロングトーン、チェロの対旋律。サビでホルンとフルートが入り、ティンパニ風の打楽器で区切る", name: "&#x1F3BB; オーケストラバラード", num: 4, den: 4, bpm: 70, key: 2, progs: ["p1", "p9"], desc: "ハープ・弦・チェロ・ホルン・フルート・打楽器", tracks: [
      ["xm-harp", "harpArp", [0, 0], "mid", "ハープ"], ["xm-strings", "stringsLong", [0, 1], "mid", "ストリングス"], ["xm-cello", "counterLine", [0, 1], "low", "チェロ"],
      ["xm-horn", "hornPad", [null, 1], "mid", "ホルン"], ["xm-flute", "bellObb", [null, 0], "low", "フルート"], ["xm-upbass", "balladBass", [0, 1], "mid", "コントラバス風"], ["@drum", "orchPerc", [null, 0], "mid", "打楽器"]] },
    { id: "film", genre: "jazz", moods: ["grand"], tags: "film score cinematic epic minor ostinato 映画音楽 壮大 マイナー", aim: "マイナーのピチカートの刻み（オスティナート）とタム・ロールで緊張感を作る。サビでブラスとコーラスが大きく重なる", name: "&#x1F39E;&#xFE0F; 映画音楽風", num: 4, den: 4, bpm: 96, key: 0, kmode: "min", progs: ["m3", "m1"], desc: "マイナー・ピチカートの刻み・弦・ブラス・コーラス・打楽器", tracks: [
      ["xm-pizz", "pizz", [1, 2], "mid", "ピチカート"], ["xm-strings", "stringsHalf", [0, 1], "mid", "ストリングス"], ["xm-softbrass", "hornPad", [null, 1], "mid", "ブラス"],
      ["xm-choir", "padSwell", [null, 1], "mid", "コーラス"], ["@drum", "orchPerc", [1, 2], "mid", "打楽器"], ["xm-cello", "balladBass", [0, 0], "mid", "チェロ", { chorus: ["bassRoot5", 1], last: ["bassRoot5", 1] }]] },
    { id: "chamber", genre: "jazz", moods: ["calm", "warm"], tags: "chamber music classical woodwinds harp 室内楽 クラシック 木管", aim: "3 拍子の小さな室内楽。チェロが低音、クラリネットが対旋律、フルートがかざり、ハープが和音。ドラムは使わない", name: "&#x1F3BC; 室内楽風", num: 3, den: 4, bpm: 108, key: 7, progs: ["p3", "p1"], desc: "3/4・チェロ・クラリネット・フルート・ハープ・ピチカート", tracks: [
      ["xm-cello", "waltzBass", [0, 1], "mid", "チェロ"], ["xm-clarinet", "counterLine", [0, 1], "mid", "クラリネット"], ["xm-flute", "bellObb", [0, 1], "low", "フルート"],
      ["xm-harp", "harpArp", [0, 1], "mid", "ハープ"], ["xm-pizz", "pizz", [null, 0], "mid", "ピチカート"]] },
    // ===== 👾 Retro・Electronic =====
    { id: "bitpop", genre: "retro", moods: ["retro", "bright"], tags: "8bit chiptune pop game ピコピコ 8bit ゲーム", aim: "四角い波だけのポップ。和音は 3-3-2 のスタブ、ベースはオクターブ、ベルのアルペジオ。スレイベルは使わない（🎄 の 8bit より速く、リズムで押す・オンコードの進行）", name: "&#x1F579;&#xFE0F; 8bit ポップ", num: 4, den: 4, bpm: 156, key: 4, mel: "xm-retrolead", progs: ["p9", "p6"], desc: "8bit のスタブ・ベース・ベルのアルペジオ・ドラム", tracks: [
      ["chip", "danceStab", [0, 1], "mid", "スタブ"], ["chip", "chipBass", [1, 2], "mid", "ベース"], ["xm-8bitbells", "synthArp", [0, 1], "mid", "アルペジオ"], ["@drum", "chipDrums", [1, 2], "mid", "ドラム"]] },
    { id: "bit16", genre: "retro", moods: ["retro", "party"], tags: "16bit game music RPG battle synth brass 16bit ゲーム音楽", aim: "シンセのブラスのキメとアシッドのパルスベース、シンセの弦。マイナーで勇ましく、昔のゲームの戦いの曲のような編成", name: "&#x1F3AE; 16bit ゲーム音楽", num: 4, den: 4, bpm: 136, key: 2, kmode: "min", mel: "xm-retrolead", progs: ["m3", "m1"], desc: "マイナー・シンセブラス・パルスベース・アルペジオ・弦・ドラム", tracks: [
      ["brass", "brassStabs", [0, 1], "mid", "シンセブラス"], ["acid", "pulseBass", [1, 2], "mid", "ベース"], ["pluck", "synthArp", [1, 2], "mid", "アルペジオ"],
      ["xm-strings", "stringsHalf", [0, 1], "mid", "ストリングス"], ["@drum", "pop8", [1, 2], "mid", "ドラム"]] },
    { id: "synthwave", genre: "retro", moods: ["cool", "retro", "sad"], tags: "synthwave 80s retrowave night drive シンセウェーブ 80年代 夜", aim: "マイナーのゆっくりした 8 分のパルスベースと大きなパッド、ハーフタイムのドラム。夜のドライブのような音", name: "&#x1F306; シンセウェーブ", num: 4, den: 4, bpm: 96, key: 9, kmode: "min", progs: ["m1", "m3"], desc: "マイナー・パルスベース・パッド・アルペジオ・ハーフタイム", tracks: [
      ["xm-synbass", "pulseBass", [1, 1], "mid", "シンセベース"], ["xm-cinepad", "padSwell", [1, 1], "mid", "パッド"], ["xm-sparkpluck", "synthArp", [0, 1], "mid", "アルペジオ"],
      ["@drum", "halfTime", [1, 1], "mid", "ドラム"], ["lead", "bellPing", [null, 0], "mid", "リード"]] },
    { id: "edmpop", genre: "retro", moods: ["party", "bright"], tags: "EDM pop build up drop four on the floor EDM ダンス 4つ打ち", aim: "A・B はハーフタイムでためて、サビで 4 つ打ちになる（ビルドアップ）。プラックのスタブと明るいメジャーの進行", name: "&#x1F389; EDM ポップ", num: 4, den: 4, bpm: 126, key: 5, progs: ["p2", "p7"], desc: "ハーフタイム → 4 つ打ち・スタブ・ベース・パッド・ベル", tracks: [
      ["pluck", "danceStab", [0, 2], "mid", "スタブ"], ["bass", "popBass8", [1, 2], "mid", "ベース"], ["@drum", "fourFloor", [1, 2], "mid", "ドラム", { A: ["halfTime", 0], B: ["halfTime", 1], bridge: ["halfTime", 0] }],
      ["xm-synthbells", "synthArp", [null, 1], "mid", "ベル"], ["spad", "padSwell", [0, 0], "mid", "パッド"]] },
    { id: "ambient", genre: "retro", moods: ["calm"], tags: "ambient pad drone chill relax アンビエント 静か ヒーリング", aim: "ドラムとベースなし。パッドのロングトーンとチャイム・ハープの粒だけ。テンポ感を出さず、空間を残す", name: "&#x1F32B;&#xFE0F; アンビエント", num: 4, den: 4, bpm: 70, key: 4, progs: ["p3", "p9"], desc: "パッド・チャイム・ハープ（ドラム・ベースなし）", tracks: [
      ["xm-winterpad", "padSwell", [0, 1], "mid", "パッド"], ["xm-cinepad", "stringsLong", [0, 0], "low", "低いパッド"], ["xm-chimes", "bellPing", [0, 0], "mid", "チャイム"], ["xm-harp", "harpFlow", [null, 0], "mid", "ハープ"]] },
    { id: "retroballad", genre: "retro", moods: ["retro", "sad"], tags: "retro ballad 80s electric piano バラード レトロ エレピ 80年代", aim: "エレピのバラード伴奏とシンセのパッド、シンセのベース。オンコードの進行でゆっくり下る。サビでチャイム", name: "&#x1F4FC; レトロバラード", num: 4, den: 4, bpm: 74, key: 10, progs: ["p9", "p8"], desc: "エレピ・シンセパッド・シンセベース・ドラム・チャイム", tracks: [
      ["xm-ep", "balladPiano", [0, 1], "mid", "エレピ"], ["spad", "stringsLong", [0, 1], "mid", "パッド"], ["bass", "balladBass", [0, 1], "mid", "ベース"],
      ["@drum", "ballad", [0, 1], "mid", "ドラム"], ["xm-chimes", "bellPing", [null, 0], "mid", "チャイム"]] }
  ];
  // セクションの型: [名前, 色（DAW のセクションの色）, 強さの倍率, 短い名前]
  var SECT = {
    intro: ["イントロ", "purple", 0.85, "イ"], A: ["Aメロ", "blue", 0.92, "A"], B: ["Bメロ", "green", 0.98, "B"], chorus: ["サビ", "red", 1.12, "サ"],
    inter: ["間奏", "teal", 1.0, "間"], bridge: ["ブリッジ", "yellow", 0.95, "ブ"], last: ["ラストサビ", "pink", 1.18, "ラ"], outro: ["アウトロ", "orange", 0.88, "ア"]
  };
  var SECT_ORDER = ["intro", "A", "B", "chorus", "inter", "bridge", "last", "outro"];
  // 型ごとのはじめの設定: rise ＝ 強さの倍率をはじめ→おわりへ直線で・acc ＝ 小節の頭の強さの倍率・fill: false ＝ ドラムのフィルなし・end ＝ 最後の小節は I の和音をのばして終わる・up ＝ 音域を 1 段上げる種類
  var SECT_DEF = { intro: { fill: false }, B: { rise: [0.9, 1.06] }, bridge: { fill: false }, last: { acc: 1.06, up: ["bell"] }, outro: { rise: [1, 0.8], end: true, fill: false } };
  // 構成（小節は 4 の倍数・コード進行の 4 小節がそろう）
  var FORMS = [
    ["std", "標準", [["A", 8], ["chorus", 8]]],
    ["short", "短い曲", [["intro", 4], ["A", 8], ["B", 8], ["chorus", 8], ["outro", 4]]],
    ["full", "フル", [["intro", 4], ["A", 8], ["B", 4], ["chorus", 8], ["inter", 4], ["A", 8], ["last", 8], ["outro", 4]]],
    ["long", "長い曲", [["intro", 4], ["A", 8], ["B", 8], ["chorus", 8], ["inter", 4], ["A", 8], ["B", 8], ["bridge", 4], ["last", 8], ["outro", 4]]]
  ];
  var SECS = [["Aメロ", 8, "blue", 0.92], ["サビ", 8, "red", 1.12]]; // v2.72 の形（標準の構成と同じ・読み取り口のため残す）
  function tpl(id) { for (var i = 0; i < TPLS.length; i++) { if (TPLS[i].id === id) { return TPLS[i]; } } return null; }
  function formById(id) { for (var i = 0; i < FORMS.length; i++) { if (FORMS[i][0] === id) { return FORMS[i]; } } return FORMS[0]; }
  function formBars(id) { var F = formById(id)[2], n = 0, i; for (i = 0; i < F.length; i++) { n += F[i][1]; } return n; }
  // 構成のセクション（設定をまとめる）→ [{ t, bars, name, color, e, rise, acc, fill, end, up }]
  function formOf(T, id) {
    var F = formById(id)[2], out = [], seen = {}, i, k;
    for (i = 0; i < F.length; i++) {
      var t = F[i][0], S = SECT[t], x = { t: t, bars: F[i][1], name: S[0] + (seen[t] ? " " + (seen[t] + 1) : ""), color: S[1], e: S[2] }, d = SECT_DEF[t] || {}, o = (T && T.sec && T.sec[t]) || {};
      seen[t] = (seen[t] || 0) + 1;
      for (k in d) { if (d.hasOwnProperty(k)) { x[k] = d[k]; } }
      for (k in o) { if (o.hasOwnProperty(k)) { x[k] = o[k]; } }
      out.push(x);
    }
    return out;
  }
  function catOf(id) { var P = pat(id); return P ? P.cat : "keys"; }
  // セクションの型ごとの「鳴らすか・密度・パターン」→ null（鳴らさない）か { pat, d }
  function partFor(tr, t) {
    var a = tr[2][0], c = tr[2][1], cat = catOf(tr[1]), any = a !== null ? a : c, sleigh = tr[0] === "xm-sleigh", d;
    if (tr[5] && tr[5].hasOwnProperty(t)) { var o = tr[5][t]; if (o === null) { return null; } return o instanceof Array ? { pat: pat(o[0]) ? o[0] : tr[1], d: clamp(o[1], 0, 2) } : { pat: tr[1], d: clamp(o, 0, 2) }; }
    if (t === "A") { d = a; }
    else if (t === "chorus") { d = c; }
    else if (t === "last") { d = c !== null ? c : a; }
    else if (t === "B") { d = a !== null ? a : (cat === "str" ? Math.max(0, c - 1) : null); }
    else if (t === "inter") { d = cat === "bell" ? (c !== null ? c : a) : (a !== null ? a : (cat === "str" ? c : null)); }
    else if (t === "bridge") { d = cat === "drum" || cat === "bell" ? null : (any === null ? null : Math.max(0, any - 1)); }
    else if (t === "intro") { d = cat === "drum" ? (sleigh && a !== null ? 0 : null) : (cat === "bass" ? null : (any === null ? null : 0)); }
    else if (t === "outro") { d = cat === "drum" ? (sleigh && any !== null ? 0 : null) : (any === null ? null : 0); }
    return d === null || d === undefined ? null : { pat: tr[1], d: d };
  }
  function progFor(T, t) {
    if (T.prog && T.prog[t]) { return T.prog[t]; }
    if (t === "A" || t === "outro") { return T.progs[0]; }
    if (t === "B") { return "p6"; }
    if (t === "bridge") { return "p7"; }
    return T.progs[1];
  }
  var RANGE_IDS = ["low", "mid", "high"];
  function rangeUp(r) { var i = RANGE_IDS.indexOf(r); return RANGE_IDS[Math.min(2, (i < 0 ? 1 : i) + 1)]; }
  // セクションの形に整える（強さ・小節の頭・最後の和音）。標準の A メロ・サビは v2.72 と同じ計算
  function shapeSec(r, sec, bt) {
    var notes = r.notes, n = sec.bars * bt, lastBar = (sec.bars - 1) * bt, out = [], i;
    for (i = 0; i < notes.length; i++) {
      var x = notes[i], f = sec.e;
      if (sec.rise) { f = f * (sec.rise[0] + (sec.rise[1] - sec.rise[0]) * x[0] / n); }
      if (sec.acc && x[0] % bt === 0) { f = f * sec.acc; }
      x[3] = r3(clamp(x[3] * f, 0.08, 1));
      if (sec.end && x[0] >= lastBar) {
        if (x[0] > lastBar) { continue; }
        if (!r.drum) { x[1] = n - lastBar; }
      }
      out.push(x);
    }
    r.notes = out;
    return r;
  }
  // 見本（プレビュー）: mode "new" | "add"・bar（足すときの小節・1 から）・form（構成の id）→ { ok, why, rows, tracks, clips, notes, lic, bars, form }
  function tplPlan(p, id, mode, bar, seed, formId, opt) {
    var T = tpl(id), M = DM();
    if (!T) { return { ok: false, why: "テンプレートが見つかりません" }; }
    var meter = mode === "new" ? { num: T.num, den: T.den } : M.meterAt(p, 0);
    if (mode !== "new" && (meter.num !== T.num || meter.den !== T.den)) { return { ok: false, why: "この曲は " + meter.num + "/" + meter.den + " です。「" + plain(T.name) + "」は " + T.num + "/" + T.den + " なので、「新しい曲で作る」を使ってください" }; }
    var key = mode === "new" ? T.key : (Number(p.ext && p.ext.xmKey) >= 0 ? Number(p.ext.xmKey) : T.key);
    var kmode = mode === "new" ? (T.kmode === "min" ? "min" : "maj") : (p.ext && p.ext.xmMode === "min" ? "min" : (p.ext && Number(p.ext.xmKey) >= 0 ? "maj" : (T.kmode === "min" ? "min" : "maj")));
    if (opt && opt.key !== undefined && opt.key !== null && Number(opt.key) >= 0 && Number(opt.key) <= 11) { key = Math.round(Number(opt.key)); }
    if (opt && (opt.kmode === "maj" || opt.kmode === "min")) { kmode = opt.kmode; }
    var fid = formById(formId)[0], form = formOf(T, fid), bt = Math.round(meter.num * PPQ * 4 / meter.den);
    var rows = [], lic = {}, nTr = 0, nCl = 0, nN = 0, total = 0, i, s;
    for (s = 0; s < form.length; s++) { total += form[s].bars; }
    for (i = 0; i < T.tracks.length; i++) {
      var tr = T.tracks[i], cls = [];
      for (s = 0; s < form.length; s++) {
        var sec = form[s], part = partFor(tr, sec.t);
        if (!part) { continue; }
        var cust = null; if (sec.end) { cust = {}; cust[sec.bars - 1] = kmode === "min" ? "i" : "I"; }
        var rg = sec.up && sec.up.indexOf(catOf(part.pat)) >= 0 ? rangeUp(tr[3]) : tr[3];
        var go = { pat: part.pat, key: key, prog: progFor(T, sec.t), bars: sec.bars, range: rg, vel: 1, dens: part.d, seed: (seed || 1) + i * 31 + s * 7 };
        if (cust) { go.custom = cust; }
        if (kmode === "min") { go.mode = "min"; }
        if (sec.fill === false) { go.nofill = 1; }
        var r = generate(go, meter);
        if (!r.ok) { return r; }
        shapeSec(r, sec, bt);
        cls.push({ sec: s, notes: r.notes.length, r: r });
        nN += r.notes.length; nCl++;
      }
      if (!cls.length) { continue; }
      var so = sound(tr[0]); if (so) { lic[so[5].lic] = true; }
      rows.push({ name: tr[4], snd: tr[0], pat: tr[1], clips: cls });
      nTr++;
    }
    var have = mode === "new" ? (T.melody === false ? 0 : 1) : p.tracks.length;
    if (have + nTr > M.MAX_TRACKS) { return { ok: false, why: "トラックは " + M.MAX_TRACKS + " 本までです（いま " + p.tracks.length + " 本・足すのは " + nTr + " 本）" }; }
    var hear = 0; for (s = 0; s < form.length; s++) { if (form[s].t === "chorus" || form[s].t === "last") { hear = s; break; } }
    return { ok: true, T: T, rows: rows, tracks: nTr, clips: nCl, notes: nN, lic: Object.keys(lic), meter: meter, key: key, kmode: kmode, bar: mode === "new" ? 1 : Math.max(1, Math.round(Number(bar) || 1)), mode: mode, bars: total, form: form, formId: fid, hear: hear };
  }
  function secStart(form, k) { var b = 0, j; for (j = 0; j < k; j++) { b += form[j].bars; } return b; }
  // 当てはめる（曲を直す。↶ は呼ぶ側）→ { ok, why, tracks }
  function tplApply(p, plan) {
    var M = DM(), bt = M.barTicks(p), out = [], i, k, b0 = (plan.bar - 1) * bt;
    if (b0 + plan.bars * bt > MAXB * bt) { return { ok: false, why: "曲の長さ（" + MAXB + " 小節）をこえます" }; }
    for (i = 0; i < plan.rows.length; i++) {
      var row = plan.rows[i], t = makeTrack(p, row.snd, row.name);
      if (!t) { return { ok: false, why: "トラックを足せませんでした" }; }
      for (k = 0; k < row.clips.length; k++) {
        var cl = row.clips[k], r = cl.r;
        var notes = JSON.parse(JSON.stringify(r.notes)); if (!r.drum) { fitRange(notes, row.snd); }
        var c = M.newMidiClip(p, t, b0 + secStart(plan.form, cl.sec) * bt, r.len, notes, plan.form[cl.sec].name);
        c.ext.xgen = xgenOf(r.set); stampClip(c, { t: plan.form[cl.sec].t });
      }
      out.push(t);
    }
    putChords(p, planChords(plan, plan.bar - 1), false); // §345 A4: 曲のコード
    if (songKey(p).key === null) { p.ext.xmKey = plan.key; if (plan.kmode === "min") { p.ext.xmMode = "min"; } }
    return { ok: true, tracks: out };
  }
  // 新しい曲（キー・BPM・拍子・セクション・空のメロディのトラック）
  function tplNewProject(plan) {
    var M = DM(), T = plan.T, form = plan.form, p = M.newProject({ name: plain(T.name).substring(0, 30), bpm: T.bpm }), s;
    p.tempo.meters[0].num = T.num; p.tempo.meters[0].den = T.den;
    p.ext.xmKey = plan.key;
    if (plan.kmode === "min") { p.ext.xmMode = "min"; }
    var mel = makeTrack(p, T.mel || (T.id === "chip" ? "xm-retrolead" : "xm-musicbox"), "メロディ（あなたの）");
    if (mel) { mel.ext.icon = "&#x1F3A4;"; var bt = M.barTicks(p); for (s = 0; s < form.length; s++) { M.newMidiClip(p, mel, secStart(form, s) * bt, form[s].bars * bt, [], form[s].name + "（メロディ）"); } }
    var r = tplApply(p, plan);
    if (!r.ok) { return r; }
    for (s = 0; s < form.length; s++) { M.addSection(p, { name: form[s].name, bar: secStart(form, s) + 1, bars: form[s].bars, color: form[s].color }); }
    p.practice = { loopOn: false, loopA: 0, loopB: M.barToTick(p, 4) };
    return { ok: true, project: p };
  }
  // ---------- 音楽の機械的な検査（§345・耳での評価ではない）----------
  // plan を調べる → { ok, problems: [文字], stats }。音域・強さ・クリップの外・同じ高さの重なり・空のセクション・多すぎる／少なすぎる・コードの音（7th・9th をふくむ）・ベースの跳躍（2 オクターブより大きいと問題・13 半音以上は leaps12 に数える）
  function audit(plan) {
    var form = plan.form, bt = Math.round(plan.meter.num * PPQ * 4 / plan.meter.den), probs = [], secN = [], i, k, j;
    var st = { notes: 0, clips: 0, overlaps: 0, outRange: 0, badVel: 0, outClip: 0, maxPerBar: 0, maxPerBarDrum: 0, chordHits: 0, chordAll: 0, leaps: 0, leaps12: 0, maxLeap: 0, bars: plan.bars, perSec: secN };
    for (k = 0; k < form.length; k++) { secN.push(0); }
    for (i = 0; i < plan.rows.length; i++) {
      var row = plan.rows[i], so = sound(row.snd), lo = so && so[5].lo, hi = so && so[5].hi;
      for (k = 0; k < row.clips.length; k++) {
        var cl = row.clips[k], r = cl.r, ns = JSON.parse(JSON.stringify(r.notes)), cat = r.pat.cat, perBar = {};
        if (!r.drum) { fitRange(ns, row.snd); }
        st.clips++; st.notes += ns.length; secN[cl.sec] += ns.length;
        for (j = 0; j < ns.length; j++) {
          var x = ns[j], b = Math.floor(x[0] / bt);
          perBar[b] = (perBar[b] || 0) + 1;
          if (x[2] < 0 || x[2] > 127 || (!r.drum && lo && hi && (x[2] < lo || x[2] > hi))) { st.outRange++; }
          if (!(x[3] >= 0.08 && x[3] <= 1)) { st.badVel++; }
          if (x[0] < 0 || x[0] >= r.len || (!r.drum && x[0] + x[1] > r.len)) { st.outClip++; }
          if (!r.drum && x[0] % bt === 0 && (cat === "keys" || cat === "str" || cat === "bass")) {
            var ch = chordOf(r.set.key, r.chords[b % r.chords.length]);
            var pc = ((x[2] % 12) + 12) % 12, ext = [(ch.root + (ch.ivs[3] !== undefined ? ch.ivs[3] : (SEVENTH[ch.id] || 10))) % 12, (ch.root + 2) % 12];
            st.chordAll++; if (ch.pcs.indexOf(pc) >= 0 || ext.indexOf(pc) >= 0 || pc === ch.bass) { st.chordHits++; }
          }
        }
        for (var bb in perBar) { if (perBar.hasOwnProperty(bb)) { if (r.drum) { st.maxPerBarDrum = Math.max(st.maxPerBarDrum, perBar[bb]); } else { st.maxPerBar = Math.max(st.maxPerBar, perBar[bb]); } } }
        if (!r.drum) {
          var byP = ns.slice().sort(function (a, c) { return a[2] - c[2] || a[0] - c[0]; });
          for (j = 1; j < byP.length; j++) { if (byP[j][2] === byP[j - 1][2] && byP[j][0] < byP[j - 1][0] + byP[j - 1][1]) { st.overlaps++; } }
          if (cat === "bass") { var byT = ns.slice().sort(function (a, c) { return a[0] - c[0]; }); for (j = 1; j < byT.length; j++) { var lp = Math.abs(byT[j][2] - byT[j - 1][2]); if (lp > 12) { st.leaps12++; } if (lp > 24) { st.leaps++; } st.maxLeap = Math.max(st.maxLeap, lp); } }
        }
      }
    }
    for (k = 0; k < form.length; k++) {
      var per = secN[k] / form[k].bars;
      if (secN[k] === 0) { probs.push("音のないセクション: " + form[k].name); }
      else if (per < 2) { probs.push("少なすぎるセクション: " + form[k].name + "（1 小節 " + per.toFixed(1) + " 音）"); }
    }
    if (st.outRange) { probs.push("音域の外の音: " + st.outRange); }
    if (st.badVel) { probs.push("強さが範囲の外: " + st.badVel); }
    if (st.outClip) { probs.push("クリップの外にはみ出す音: " + st.outClip); }
    if (st.overlaps) { probs.push("同じ高さの重なり: " + st.overlaps); }
    if (st.maxPerBar > 64) { probs.push("1 小節の音が多すぎるパート: " + st.maxPerBar); }
    if (st.leaps) { probs.push("ベースの 2 オクターブをこえる跳躍: " + st.leaps); }
    st.chordRate = st.chordAll ? Math.round(st.chordHits / st.chordAll * 1000) / 1000 : 1;
    if (st.chordRate < 0.95) { probs.push("小節の頭のコードの音の割合が低い: " + st.chordRate); }
    return { ok: probs.length === 0, problems: probs, stats: st };
  }

  // ---------- 🔍 テンプレートブラウザー（§345 A3-1）----------
  var GENRES = [["xmas", "&#x1F384; Christmas", "christmas xmas クリスマス"], ["pop", "&#x1F3A4; J-POP・POP", "pop jpop j-pop ポップ"], ["jazz", "&#x1F3B7; Jazz・Orchestra", "jazz orchestra ジャズ オーケストラ クラシック"], ["retro", "&#x1F47E; Retro・Electronic", "retro electronic レトロ エレクトロ ゲーム"]];
  var MOODS = [["bright", "明るい・華やか", "bright sparkle happy 明るい 華やか キラキラ"], ["calm", "静か・おだやか", "calm quiet soft gentle 静か おだやか しっとり"], ["warm", "あたたかい", "warm cozy あたたかい ほっこり"], ["cool", "おしゃれ・クール", "cool stylish おしゃれ クール"], ["party", "ノリ・ダンス", "dance party groove ノリ ダンス"], ["grand", "壮大", "epic grand cinematic 壮大 映画"], ["retro", "レトロ", "retro vintage レトロ なつかしい"], ["sad", "せつない", "sad emotional せつない 泣ける"]];
  var FAMS = [["piano", "ピアノ・鍵盤", "piano keys organ ピアノ 鍵盤 オルガン"], ["bass", "ベース", "bass ベース"], ["drums", "ドラム・打楽器", "drums percussion ドラム 打楽器 リズム"], ["strings", "弦・ハープ", "strings harp 弦 ストリングス ハープ"], ["bells", "ベル", "bells glockenspiel celesta ベル グロッケン チェレスタ"], ["winds", "管楽器", "brass horn winds flute 管楽器 ブラス ホルン フルート"], ["synth", "シンセ", "synth pad lead シンセ パッド"], ["guitar", "ギター", "guitar ギター"], ["choir", "声・パッド", "choir voice 声 コーラス"]];
  var BPMS = [["slow", "ゆっくり（〜89）"], ["mid", "ふつう（90〜125）"], ["fast", "速い（126〜）"]];
  var FAM_OF = { "xm-strings": "strings", "xm-pizz": "strings", "xm-harp": "strings", "xm-glock": "bells", "xm-celesta": "bells", "xm-musicbox": "bells", "xm-chimes": "bells", "xm-brightbells": "bells", "xm-8bitbells": "bells", "xm-synthbells": "bells", "xm-vibes": "bells", "bell": "bells",
    "xm-horn": "winds", "xm-softbrass": "winds", "brass": "winds", "xm-warmpiano": "piano", "xm-ep": "piano", "xm-jazzpiano": "piano", "xm-church": "piano", "xm-softorgan": "piano", "organ": "piano", "xm-choirpad": "choir",
    "xm-nylon": "guitar", "xm-steel": "guitar", "xm-cleangtr": "guitar", "xm-marimba": "bells", "xm-flute": "winds", "xm-clarinet": "winds", "xm-cello": "strings", "xm-choir": "choir", "xm-cinepad": "synth" }; // v2.79: v2.77 の音色の種類（ギターなどが シンセ になっていた）
  var TPL_KEY = "ultimateGorillaXmasTplV1";
  function lbl(list, id) { for (var i = 0; i < list.length; i++) { if (list[i][0] === id) { return list[i][1]; } } return ""; }
  function famsOf(T) {
    var out = [], i;
    for (i = 0; i < T.tracks.length; i++) { var cat = catOf(T.tracks[i][1]), f = cat === "drum" ? "drums" : (cat === "bass" ? "bass" : (FAM_OF[T.tracks[i][0]] || "synth")); if (out.indexOf(f) < 0) { out.push(f); } }
    return out;
  }
  function bpmBand(bpm) { return bpm < 90 ? "slow" : (bpm <= 125 ? "mid" : "fast"); }
  function norm(s) { s = String(s === undefined || s === null ? "" : s); try { if (s.normalize) { s = s.normalize("NFKC"); } } catch (e) {} return s.toLowerCase(); }
  // 検索のための文字（名前・説明・ねらい・ことば・ジャンル・雰囲気・楽器・拍子・BPM）
  function hayOf(T) {
    var x = [plain(T.name), T.desc, T.aim || "", T.tags || "", T.num + "/" + T.den, T.num === 3 || T.den === 8 ? "3拍子 ワルツ waltz" : "", "bpm" + T.bpm, String(T.bpm)], i;
    for (i = 0; i < GENRES.length; i++) { if (GENRES[i][0] === T.genre) { x.push(plain(GENRES[i][1]), GENRES[i][2]); } }
    for (i = 0; i < MOODS.length; i++) { if ((T.moods || []).indexOf(MOODS[i][0]) >= 0) { x.push(MOODS[i][1], MOODS[i][2]); } }
    var fs = famsOf(T); for (i = 0; i < FAMS.length; i++) { if (fs.indexOf(FAMS[i][0]) >= 0) { x.push(FAMS[i][1], FAMS[i][2]); } }
    for (i = 0; i < T.tracks.length; i++) { x.push(T.tracks[i][4], plain(soundName(T.tracks[i][0]))); }
    return norm(x.join(" "));
  }
  // q（ことば）と f（{ genre, mood, meter, bpm, fam }）に合うか。genre "" ＝ おすすめだけ（ことば・しぼりこみがあるときは全部から）
  function tplMatch(T, q, f) {
    f = f || {};
    var words = norm(q).split(/\s+/).filter(function (w) { return w; }), hay = hayOf(T), i, any = words.length || f.mood || f.meter || f.bpm || f.fam;
    for (i = 0; i < words.length; i++) { if (hay.indexOf(words[i]) < 0) { return false; } }
    if (f.genre && f.genre !== "all" && T.genre !== f.genre) { return false; }
    if (!f.genre && !any && !T.rec) { return false; }
    if (f.mood && (T.moods || []).indexOf(f.mood) < 0) { return false; }
    if (f.meter && T.num + "/" + T.den !== f.meter) { return false; }
    if (f.bpm && bpmBand(T.bpm) !== f.bpm) { return false; }
    if (f.fam && famsOf(T).indexOf(f.fam) < 0) { return false; }
    return true;
  }
  function tplSearch(q, f) { return TPLS.filter(function (T) { return tplMatch(T, q, f); }); }
  // お気に入り・最近（端末の設定。曲には入れない。知らない id・こわれた値は無視）
  function idList(a) { var out = [], i; if (!(a instanceof Array)) { return out; } for (i = 0; i < a.length && out.length < 50; i++) { if (typeof a[i] === "string" && a[i].length < 40 && out.indexOf(a[i]) < 0) { out.push(a[i]); } } return out; }
  function tplPrefs() { var o = null; try { o = JSON.parse(window.localStorage.getItem(TPL_KEY) || "null"); } catch (e) { o = null; } o = o && typeof o === "object" ? o : {}; return { fav: idList(o.fav), recent: idList(o.recent) }; }
  function tplPrefsPut(o) { try { window.localStorage.setItem(TPL_KEY, JSON.stringify({ fav: idList(o.fav), recent: idList(o.recent).slice(0, 8) })); } catch (e) {} }
  function tplFav(id, on) { var o = tplPrefs(), i = o.fav.indexOf(id); if (!tpl(id)) { return o; } if (on === undefined) { on = i < 0; } if (on && i < 0) { o.fav.push(id); } if (!on && i >= 0) { o.fav.splice(i, 1); } tplPrefsPut(o); return tplPrefs(); }
  function tplUsed(id) { var o = tplPrefs(), i = o.recent.indexOf(id); if (!tpl(id)) { return o; } if (i >= 0) { o.recent.splice(i, 1); } o.recent.unshift(id); tplPrefsPut(o); return tplPrefs(); }
  function known(ids) { return ids.filter(function (id) { return !!tpl(id); }); }
  function tFilter() { return { genre: ui.tgen, mood: ui.tmood, meter: ui.tmeter, bpm: ui.tbpm, fam: ui.tfam }; }
  function licOfT(T) { var l = {}, i; for (i = 0; i < T.tracks.length; i++) { var so = sound(T.tracks[i][0]); if (so) { l[so[5].lic] = 1; } } return Object.keys(l); }
  function tRow(T, fav) {
    var on = tplMatch(T, ui.tq, tFilter());
    return '<div class="dxm-trow' + (on ? "" : " dxm-hide") + '" data-xtrow="' + T.id + '"><button class="dxm-tname" data-xtsel="' + T.id + '"><b>' + T.name + '</b><small>' + plain(lbl(GENRES, T.genre)) + '・' + T.num + '/' + T.den + '・BPM ' + T.bpm + '・' + (T.moods || []).map(function (m) { return lbl(MOODS, m); }).join("・") + '</small></button>' +
      '<button class="dxm-fav' + (fav ? " on" : "") + '" data-xfav="' + T.id + '" aria-pressed="' + (fav ? "true" : "false") + '" title="お気に入り">' + (fav ? "&#x2B50;" : "&#x2606;") + '</button></div>';
  }
  function quick(ids, title) { if (!ids.length) { return ""; } return '<div class="dxm-quick"><span>' + title + '</span>' + ids.map(function (id) { return '<button class="dxm-chip" data-xtsel="' + id + '">' + tpl(id).name + '</button>'; }).join("") + '</div>'; }
  function browseHtml() {
    var pf = tplPrefs(), fav = known(pf.fav), rec = known(pf.recent), n = tplSearch(ui.tq, tFilter()).length, i, x = '<div class="dxm-browse">';
    x += '<div class="dxm-tsearch"><input type="search" class="dxm-tq" value="' + esc(ui.tq) + '" placeholder="さがす（例: ベル・Jazz・静か）" aria-label="テンプレートをさがす"><span class="dxm-tcount" aria-live="polite">' + n + ' 件</span>' + (ui.tq ? '<button class="modal-btn dxm-b" data-xm="tqClear" title="消す">&#x2716;</button>' : '') + '</div>';
    x += quick(fav, "&#x2B50; お気に入り") + quick(rec.slice(0, 4), "&#x1F558; 最近");
    x += '<div class="dxm-opt dxm-gen">' + chip("data-xtgen", "", "&#x1F384; おすすめ", ui.tgen === "") + chip("data-xtgen", "all", "すべて", ui.tgen === "all") + GENRES.map(function (g) { return chip("data-xtgen", g[0], g[1], ui.tgen === g[0]); }).join("") + '</div>';
    x += '<div class="dxm-tfil">' + selHtml('data-xtf="mood" aria-label="雰囲気"', [["", "雰囲気: ぜんぶ"]].concat(MOODS.map(function (m) { return [m[0], m[1]]; })), ui.tmood) +
      selHtml('data-xtf="meter" aria-label="拍子"', [["", "拍子: ぜんぶ"], ["4/4", "4/4"], ["3/4", "3/4"], ["6/8", "6/8"]], ui.tmeter) +
      selHtml('data-xtf="bpm" aria-label="BPM"', [["", "BPM: ぜんぶ"]].concat(BPMS), ui.tbpm) +
      selHtml('data-xtf="fam" aria-label="楽器"', [["", "楽器: ぜんぶ"]].concat(FAMS.map(function (m) { return [m[0], m[1]]; })), ui.tfam) + '</div>';
    x += '<p class="small dxm-thead">' + (ui.tgen === "" && !ui.tq && !ui.tmood && !ui.tmeter && !ui.tbpm && !ui.tfam ? "&#x1F384; クリスマスのおすすめ（ほかは「すべて」・ジャンル・さがす）" : "見つかったテンプレート") + '</p><div class="dxm-tlist">';
    for (i = 0; i < TPLS.length; i++) { x += tRow(TPLS[i], pf.fav.indexOf(TPLS[i].id) >= 0); }
    x += '</div><p class="small dxm-tnone' + (n ? " dxm-hide" : "") + '">見つかりません。ことばを短くするか、しぼりこみを「ぜんぶ」にしてください。</p></div>';
    return x;
  }
  // くわしく（まだ曲は変えない）
  function detailHtml(h) {
    var T = tpl(ui.tsel), pf = tplPrefs(), fav = pf.fav.indexOf(T.id) >= 0, form = formOf(T, ui.form), i, x = '<div class="dxm-detail">';
    x += '<div class="dxm-dtop"><button class="modal-btn dxm-b" data-xm="tselBack">&#x2190; 一覧へ</button><button class="dxm-fav' + (fav ? " on" : "") + '" data-xfav="' + T.id + '" aria-pressed="' + (fav ? "true" : "false") + '">' + (fav ? "&#x2B50; お気に入り" : "&#x2606; お気に入りに") + '</button></div>';
    x += '<b class="dxm-dname">' + T.name + '</b><p class="small">' + esc(T.aim || T.desc) + '</p>';
    x += '<table class="dxm-tbl dxm-meta"><tr><th>ジャンル</th><td>' + lbl(GENRES, T.genre) + '</td></tr><tr><th>雰囲気</th><td>' + (T.moods || []).map(function (m) { return lbl(MOODS, m); }).join("・") + '</td></tr>' +
      '<tr><th>BPM・拍子</th><td>' + T.bpm + '（' + lbl(BPMS, bpmBand(T.bpm)) + '）・' + T.num + '/' + T.den + '</td></tr><tr><th>キー</th><td>' + KEYS[T.key] + ' ' + modeName(T.kmode) + '（プレビューで変えられる）</td></tr>' +
      '<tr><th>楽器</th><td>' + famsOf(T).map(function (f) { return lbl(FAMS, f); }).join("・") + '<br><small>' + T.tracks.map(function (t) { return esc(t[4]); }).join("・") + '</small></td></tr>' +
      '<tr><th>権利</th><td><small>' + licOfT(T).map(function (l) { return esc(LIC[l]); }).join(" ／ ") + '</small></td></tr></table>';
    x += '<div class="dxm-parts"><b class="small">&#xFF0B; この楽器だけ いまの曲に足す</b>' + T.tracks.map(function (t, j) { return '<div class="dxm-ptr"><span>' + esc(t[4]) + '<small>' + soundName(t[0]) + '</small></span><button class="modal-btn dxm-b" data-xpart="' + j + '">&#xFF0B; この楽器だけ</button></div>'; }).join("") + '</div>';
    x += formChips() + '<p class="small">' + form.length + ' セクション・' + formBars(ui.form) + ' 小節（＋ 空のメロディのトラック）</p>';
    x += '<div class="dxm-go">' + pvBtn("d:" + T.id, "&#x25B6;&#xFE0F; サビを試聴") + '<button class="modal-btn dxm-b dxm-main" data-xtpl="' + T.id + '" data-xmode="new">&#x1F195; 新しい曲で</button><button class="modal-btn dxm-b" data-xtpl="' + T.id + '" data-xmode="add">&#xFF0B; いまの曲に</button></div>';
    return x + '<p class="small dxm-note">試聴・お気に入りでは曲は変わりません。「新しい曲で」「いまの曲に」は、先に足すものを見せます。</p></div>';
  }
  // 一覧の表示だけを変える（入力の途中でフォーカスを失わない）
  function tplRefresh(root) {
    if (!root || !root.querySelectorAll) { return 0; }
    var rows = root.querySelectorAll("[data-xtrow]"), f = tFilter(), n = 0, k;
    for (k = 0; k < rows.length; k++) { var T = tpl(rows[k].getAttribute("data-xtrow")), on = !!T && tplMatch(T, ui.tq, f); if (on) { n++; } if (rows[k].classList) { rows[k].classList.toggle("dxm-hide", !on); } }
    var c = root.querySelector(".dxm-tcount"); if (c) { c.textContent = n + " 件"; }
    var no = root.querySelector(".dxm-tnone"); if (no && no.classList) { no.classList.toggle("dxm-hide", n > 0); }
    return n;
  }

  // ---------- §345 A4 部分テンプレート（選んだ所に 1 つの楽器だけ足す）----------
  function secTypeOfName(n) {
    n = String(n || "");
    if (/ラスト|大サビ|last/i.test(n)) { return "last"; }
    if (/サビ|chorus|hook/i.test(n)) { return "chorus"; }
    if (/B ?メロ|pre/i.test(n)) { return "B"; }
    if (/イントロ|intro/i.test(n)) { return "intro"; }
    if (/間奏|inter|solo/i.test(n)) { return "inter"; }
    if (/ブリッジ|C ?メロ|bridge/i.test(n)) { return "bridge"; }
    if (/アウトロ|エンディング|outro|ending/i.test(n)) { return "outro"; }
    return "A";
  }
  // 曲のキー（テンプレートで作った曲・部分テンプレートを足した曲にある）
  function songKey(p) { var e = (p && p.ext) || {}, k = Number(e.xmKey); return { key: e.xmKey !== undefined && e.xmKey !== null && k >= 0 && k <= 11 ? Math.round(k) : null, kmode: e.xmMode === "min" ? "min" : "maj" }; }
  // 曲のコード { 小節（0 から）: コードの id }（知らない id・こわれた値は無視）
  function songChords(p) {
    var e = p && p.ext, o = {}, k;
    if (!e || !e.xmChords || typeof e.xmChords !== "object") { return o; }
    for (k in e.xmChords) { if (e.xmChords.hasOwnProperty(k) && /^[0-9]+$/.test(k) && Number(k) < MAXB && CHORDS[e.xmChords[k]]) { o[k] = e.xmChords[k]; } }
    return o;
  }
  // 曲のコードを書く（over: true ＝ 上書き・false ＝ まだ書いていない小節だけ）
  function putChords(p, map, over) {
    if (!p.ext || typeof p.ext !== "object") { p.ext = {}; }
    var cur = songChords(p), k;
    for (k in map) { if (map.hasOwnProperty(k) && CHORDS[map[k]] && (over || !cur[k])) { cur[k] = map[k]; } }
    p.ext.xmChords = cur;
  }
  // テンプレートの見本（plan）から、曲の小節ごとのコードを出す（b0 ＝ はじまりの小節・0 から）
  function planChords(plan, b0) {
    var out = {}, s, i, k;
    for (s = 0; s < plan.form.length; s++) {
      var at = b0 + secStart(plan.form, s), cs = null;
      for (i = 0; i < plan.rows.length && !cs; i++) { for (k = 0; k < plan.rows[i].clips.length; k++) { var c = plan.rows[i].clips[k]; if (c.sec === s && !c.r.drum) { cs = c.r.chords; break; } } }
      if (!cs) { cs = chordsFor(progFor(plan.T, plan.form[s].t), plan.form[s].bars, null, plan.kmode); }
      for (i = 0; i < plan.form[s].bars; i++) { out[at + i] = cs[i % cs.length]; }
    }
    return out;
  }
  // 見本: o = { tpl, ti（テンプレートの楽器の番号）, bar（1 から）, bars, type, key, kmode, prog, chords（{ 小節: id } 画面で変えたもの）, dest（トラックの id ／ "" ＝ 新しい）, seed }
  function partPlan(p, o) {
    var M = DM(), T = tpl(o && o.tpl), tr = T && T.tracks[Math.round(Number(o.ti))];
    if (!T || !tr) { return { ok: false, why: "テンプレートの楽器が見つかりません" }; }
    var bar = Math.round(Number(o.bar)), bars = Math.round(Number(o.bars));
    if (!(bars >= 1 && bars <= 64)) { return { ok: false, why: "長さは 1〜64 小節です" }; }
    if (!(bar >= 1) || bar - 1 + bars > MAXB) { return { ok: false, why: "曲の長さ（" + MAXB + " 小節）をこえます" }; }
    var start = M.barToTick(p, bar - 1), end = M.barToTick(p, bar - 1 + bars), m0 = M.meterAt(p, start), b;
    for (b = 1; b < bars; b++) { var mb = M.meterAt(p, M.barToTick(p, bar - 1 + b)); if (mb.num !== m0.num || mb.den !== m0.den) { return { ok: false, why: (bar + b) + " 小節目で拍子が " + m0.num + "/" + m0.den + " から " + mb.num + "/" + mb.den + " に変わります。拍子がそろう範囲を選んでください" }; } }
    var type = SECT[o.type] ? o.type : "A", part = partFor(tr, type) || { pat: tr[1], d: tr[2][0] !== null ? tr[2][0] : tr[2][1] }, P = pat(part.pat);
    if (P.m.indexOf(meterKey(m0.num, m0.den)) < 0) { return { ok: false, why: "「" + P.name + "」は " + P.m.join("・") + " の曲で使えます（この所は " + m0.num + "/" + m0.den + "）" }; }
    var sk = songKey(p), key = o.key !== undefined && o.key !== null && Number(o.key) >= 0 && Number(o.key) <= 11 ? Math.round(Number(o.key)) : (sk.key !== null ? sk.key : T.key);
    var kmode = o.kmode === "min" || o.kmode === "maj" ? o.kmode : (sk.key !== null ? sk.kmode : (T.kmode === "min" ? "min" : "maj"));
    var prog = progById(o.prog)[0] === o.prog ? o.prog : progFor(T, type), base = chordsFor(prog, bars, null, kmode), sc = songChords(p), chords = [], from = [], cust = {}, i;
    for (i = 0; i < bars; i++) {
      var ab = bar - 1 + i, ov = o.chords && CHORDS[o.chords[ab]] ? o.chords[ab] : null;
      chords.push(ov || sc[ab] || base[i]); from.push(ov ? "edit" : (sc[ab] ? "song" : "prog")); cust[i] = chords[i];
    }
    var r = generate({ pat: part.pat, key: key, prog: prog, bars: bars, range: tr[3], vel: 1, dens: part.d, seed: (Math.round(Number(o.seed)) || 1) + Math.round(Number(o.ti)) * 31, custom: cust, mode: kmode }, m0);
    if (!r.ok) { return r; }
    var sec = { t: type, bars: bars, e: SECT[type][2] }, d = SECT_DEF[type] || {}, k;
    for (k in d) { if (d.hasOwnProperty(k) && k !== "end") { sec[k] = d[k]; } }
    shapeSec(r, sec, M.ticksPerBar(m0));
    var t = null, snd = tr[0];
    if (o.dest) {
      t = M.findTrack(p, o.dest);
      if (!t || t.kind !== "midi" || M.isAudio(t)) { return { ok: false, why: "そのトラックには置けません（MIDI のトラックを選んでください）" }; }
      if (M.isDrum(t) !== r.drum) { return { ok: false, why: r.drum ? "リズムのパートは、ドラムのトラックか新しいトラックに置きます" : "音の高さのあるパートは、ドラムでないトラックか新しいトラックに置きます" }; }
      if (M.overlapClip(t, start, end - start)) { return { ok: false, why: "「" + t.name + "」の " + bar + "〜" + (bar + bars - 1) + " 小節に、もうクリップがあります（上書きしません。新しいトラックか、ほかの所を選んでください）" }; }
      snd = (t.ext && t.ext.xm) || (t.instrument && t.instrument.ext && t.instrument.ext.preset) || snd;
    } else if (p.tracks.length >= M.MAX_TRACKS) { return { ok: false, why: "トラックは " + M.MAX_TRACKS + " 本までです（いまのトラックを選んで置いてください）" }; }
    if (!r.drum) { fitRange(r.notes, snd); }
    if (r.notes.length > 4000) { return { ok: false, why: "音符が 4000 をこえます（範囲を短くしてください）" }; }
    var mini = { form: [{ name: SECT[type][0], bars: bars }], meter: m0, bars: bars, rows: [{ snd: snd, clips: [{ sec: 0, r: { notes: r.notes, len: r.len, drum: r.drum, pat: r.pat, set: r.set, chords: r.chords } }] }] };
    var au = audit(mini); au.problems = au.problems.filter(function (q) { return q.indexOf("少なすぎる") !== 0; }); au.ok = au.problems.length === 0; // 1 つの楽器だけなので「少なすぎる」は問題にしない
    return { ok: true, T: T, ti: Math.round(Number(o.ti)), tr: tr, pat: part.pat, dens: part.d, type: type, bar: bar, bars: bars, start: start, len: end - start, meter: m0, key: key, kmode: kmode, prog: prog, chords: chords, from: from, r: r, notes: r.notes.length, dest: t ? t.id : "", snd: snd, name: tr[4], audit: au };
  }
  // 足す（曲を直す。↶ は呼ぶ側 ＝ ext もふくむ写し）→ { ok, why, track, clip }
  function partApply(p, pl) {
    var M = DM(), t = pl.dest ? M.findTrack(p, pl.dest) : makeTrack(p, pl.snd, pl.name), i;
    if (!t) { return { ok: false, why: "トラックを足せませんでした" }; }
    if (pl.dest && M.overlapClip(t, pl.start, pl.len)) { return { ok: false, why: "同じ所にクリップがあります" }; }
    var c = M.newMidiClip(p, t, pl.start, pl.len, JSON.parse(JSON.stringify(pl.r.notes)), (plain(pl.T.name) + "・" + pl.name).substring(0, 40));
    c.ext.xgen = xgenOf(pl.r.set); stampClip(c, { t: pl.type });
    c.ext.xpart = { tpl: pl.T.id, ti: pl.ti, type: pl.type };
    t.clips.sort(function (a, b) { return a.start - b.start; });
    var mp = {}, ov = {};
    for (i = 0; i < pl.bars; i++) { var ab = String(pl.bar - 1 + i); if (pl.from[i] === "edit") { ov[ab] = pl.chords[i]; } else { mp[ab] = pl.chords[i]; } }
    putChords(p, mp, false); putChords(p, ov, true);
    if (songKey(p).key === null) { p.ext.xmKey = pl.key; if (pl.kmode === "min") { p.ext.xmMode = "min"; } }
    return { ok: true, track: t, clip: c };
  }
  // 画面
  function partInit(h, id, ti) {
    var p = h.project(), M = DM(), T = tpl(id), secs = M.sectionsOf(p), s0 = secs[0], sk = songKey(p), o;
    o = { tpl: id, ti: ti, where: s0 ? s0.id : "bars", bar: 1, bars: 8, type: "A", key: sk.key !== null ? sk.key : T.key, kmode: sk.key !== null ? sk.kmode : (T.kmode === "min" ? "min" : "maj"), prog: "", chords: {}, dest: "", seed: g0().seed };
    if (s0) { partWhere(h, o, s0.id); }
    o.prog = progFor(T, o.type);
    return o;
  }
  function partWhere(h, o, where) {
    var p = h.project(), M = DM(), s = null, i, secs = M.sectionsOf(p);
    for (i = 0; i < secs.length; i++) { if (secs[i].id === where) { s = secs[i]; } }
    o.where = s ? s.id : "bars";
    if (s) { var b0 = M.tickToBar(p, s.tick).bar, b1 = M.tickToBar(p, s.tick + s.len).bar; o.bar = b0; o.bars = Math.max(1, Math.min(64, b1 - b0)); o.type = secTypeOfName(s.name); }
  }
  function partHtml(h) {
    var p = h.project(), M = DM(), o = ui.part, T = tpl(o.tpl), tr = T.tracks[o.ti], pl = partPlan(p, o), secs = M.sectionsOf(p), i, x = '<div class="dxm-part">';
    x += '<div class="dxm-dtop"><button class="modal-btn dxm-b" data-xm="partBack">&#x2190; もどる</button></div>';
    x += '<b class="dxm-dname">&#xFF0B; この楽器だけ</b><p class="small">' + T.name + ' の「' + esc(tr[4]) + '」（' + soundName(tr[0]) + '・' + esc(pat(tr[1]).name.replace(/（.*$/, "")) + '）を、いまの曲の選んだ所だけに足します。メロディ・歌・録音・ほかのトラックは変えません。</p>';
    var wo = secs.map(function (s) { var b0 = M.tickToBar(p, s.tick).bar, b1 = M.tickToBar(p, s.tick + s.len).bar; return [s.id, esc(s.name) + "（" + b0 + "〜" + (b1 - 1) + " 小節）"]; });
    wo.push(["bars", "小節を指定"]);
    x += '<div class="dxm-opt dxm-pw"><span>置く所</span>' + selHtml('data-xpw aria-label="置く所"', wo, o.where) + '</div>';
    if (o.where === "bars") { x += '<div class="dxm-opt"><label class="dxm-barl">何小節目から <input type="number" class="dxm-pbar" min="1" max="' + MAXB + '" value="' + o.bar + '"></label><label class="dxm-barl">何小節 <input type="number" class="dxm-pbars" min="1" max="64" value="' + o.bars + '"></label></div>'; }
    x += '<div class="dxm-opt dxm-forms"><span>弾き方</span>' + SECT_ORDER.map(function (t) { return chip("data-xptype", t, SECT[t][0], o.type === t); }).join("") + '</div>';
    x += '<div class="dxm-opt dxm-tkey"><span>キー</span>' + selHtml('data-xpkey aria-label="キー"', KEYS.map(function (k, j) { return [j, k]; }), o.key) + MODES.map(function (m) { return chip("data-xpkm", m[0], m[1], o.kmode === m[0]); }).join("") + '</div>';
    x += '<div class="dxm-opt"><span>進行</span>' + selHtml('data-xpprog aria-label="進行"', PROGS.map(function (q) { return [q[0], q[1]]; }), o.prog) + '<button class="modal-btn dxm-b" data-xm="partFill" title="範囲のコードを、えらんだ進行にする">進行で埋める</button></div>';
    if (pl.ok || pl.chords) {
      var cl = CHORD_LISTS[o.kmode] || CHORD_LISTS.maj, ch = pl.chords || [];
      x += '<div class="dxm-chords dxm-pch">';
      for (i = 0; i < ch.length; i++) { var c1 = cl.indexOf(ch[i]) >= 0 ? cl : cl.concat([ch[i]]); x += '<label class="dxm-ch' + (pl.from[i] === "song" ? " song" : (pl.from[i] === "edit" ? " edit" : "")) + '"><small>' + (o.bar + i) + '</small>' + selHtml('data-xpch="' + (o.bar - 1 + i) + '"', c1.map(function (c) { return [c, chordOf(o.key, c).name + " (" + chordLabel(c) + ")"]; }), ch[i]) + '</label>'; }
      x += '</div><p class="small">コード: 曲にあるもの（緑）をそのまま使い、ないところは進行で埋めます。ここで変えたもの（黄）は「足す」で曲に書きます。</p>';
    }
    var dopts = [["", "&#xFF0B; 新しいトラック"]], drum = !!pat(tr[1]).drum;
    for (i = 0; i < p.tracks.length; i++) { var t = p.tracks[i]; if (t.kind === "midi" && !M.isAudio(t) && M.isDrum(t) === drum) { dopts.push([t.id, esc(t.name)]); } }
    x += '<div class="dxm-opt"><span>置くトラック</span>' + selHtml('data-xpdest aria-label="置くトラック"', dopts, o.dest) + '</div>';
    if (pl.ok) {
      x += '<div class="dxm-prev"><b>足すもの</b><br><span class="small">' + pl.bar + '〜' + (pl.bar + pl.bars - 1) + ' 小節（' + pl.bars + ' 小節・' + pl.meter.num + '/' + pl.meter.den + '）・' + (pl.dest ? "「" + esc(M.findTrack(p, pl.dest).name) + "」に" : "新しいトラック「" + esc(pl.name) + "」") + '・' + esc(pat(pl.pat).name.replace(/（.*$/, "")) + '（' + DENS[pl.dens] + '）・音符 ' + pl.notes + ' 個・' + KEYS[pl.key] + ' ' + modeName(pl.kmode) + '</span><br><span class="small">検査: ' + (pl.audit.ok ? "問題なし" : esc(pl.audit.problems.join("／"))) + '</span></div>';
      x += '<div class="dxm-go">' + pvBtn("q", "&#x25B6;&#xFE0F; 試聴") + '<button class="modal-btn dxm-b dxm-main" data-xm="partApply">&#xFF0B; 足す（↶ で戻せる）</button><button class="modal-btn dxm-b" data-xm="partCancel">やめる</button></div>';
    } else {
      x += '<div class="daw-msg dxm-msg">&#x26A0;&#xFE0F; ' + esc(pl.why) + '</div><div class="dxm-go"><button class="modal-btn dxm-b" data-xm="partCancel">やめる</button></div>';
    }
    return x + '</div>';
  }
  function partItems(h) {
    var p = h.project(), M = DM(), pl = partPlan(p, ui.part);
    if (!pl.ok) { return []; }
    var ins = pl.r.drum ? null : instrument(pl.snd), bt = M.ticksPerBar(pl.meter);
    return notesToItems(JSON.parse(JSON.stringify(pl.r.notes)), ins, !ins, M.bpmAt(p, pl.start), 4, bt);
  }

  // ---------- §345 A5 フルソングアレンジャー（差しかえ）----------
  // 音符の指紋（手で直したかを見分ける）
  function notesHash(notes) { return DM().hash(JSON.stringify(notes || [])); }
  function stampClip(c, more) { var x = c.ext.xgen, k; if (!x) { return; } for (k in more || {}) { if (more.hasOwnProperty(k) && more[k] !== undefined) { x[k] = more[k]; } } x.h = notesHash(c.notes); }
  // "gen" 作ったまま・"edited" 手で直した・"unknown" v2.78 までに作った（指紋なし）・"none" 伴奏で作ったものでない
  function clipState(c) { var x = c && c.ext && c.ext.xgen; if (!x || !x.pat) { return "none"; } if (!x.h) { return "unknown"; } return x.h === notesHash(c.notes) ? "gen" : "edited"; }
  var STATE_LBL = { gen: "作ったまま", edited: "手で直した", unknown: "確かめられない（前の版）" };
  var SV = [[0.85, "弱く"], [1, "そのまま"], [1.15, "強く"]];
  function trackSnd(t) { return (t.ext && t.ext.xm) || (t.instrument && t.instrument.ext && t.instrument.ext.preset) || ""; }
  function famOfTrack(t) { var M = DM(); if (M.isDrum(t)) { return "drums"; } var c = null, i; for (i = 0; i < t.clips.length && !c; i++) { if (t.clips[i].ext && t.clips[i].ext.xgen) { c = t.clips[i]; } } if (c && catOf(c.ext.xgen.pat) === "bass") { return "bass"; } return FAM_OF[trackSnd(t)] || (c && catOf(c.ext.xgen.pat) === "keys" ? "piano" : "synth"); }
  function famOfTplTrack(tr) { var cat = catOf(tr[1]); return cat === "drum" ? "drums" : (cat === "bass" ? "bass" : (FAM_OF[tr[0]] || "synth")); }
  // クリップの所（小節・拍子・セクションの型・コード）
  function clipSpot(p, c) {
    var M = DM(), m0 = M.meterAt(p, c.start), tpb = M.ticksPerBar(m0), b0 = M.tickToBar(p, c.start).bar - 1, bars = Math.round(c.len / tpb), i, x = c.ext.xgen || {};
    if (M.barToTick(p, b0) !== c.start || bars < 1 || bars * tpb !== c.len) { return { ok: false, why: "このクリップは小節にそろっていません（はじまり・長さが小節の区切りでない）" }; }
    if (bars > 64) { return { ok: false, why: "64 小節より長いクリップは差しかえられません" }; }
    for (i = 1; i < bars; i++) { var mb = M.meterAt(p, M.barToTick(p, b0 + i)); if (mb.num !== m0.num || mb.den !== m0.den) { return { ok: false, why: "クリップの途中で拍子が変わります" }; } }
    var type = SECT[x.t] ? x.t : "A", secs = M.sectionsOf(p);
    if (!SECT[x.t]) { for (i = 0; i < secs.length; i++) { if (secs[i].tick <= c.start && c.start < secs[i].tick + secs[i].len) { type = secTypeOfName(secs[i].name); } } }
    var sc = songChords(p), base = chordsFor(x.prog || "p1", bars, x.custom, x.mode), ch = [];
    for (i = 0; i < bars; i++) { ch.push(sc[b0 + i] || base[i]); }
    var sk = songKey(p);
    return { ok: true, meter: m0, tpb: tpb, b0: b0, bars: bars, type: type, chords: ch, key: x.key !== undefined ? x.key : (sk.key !== null ? sk.key : 0), kmode: x.mode === "min" ? "min" : (x.mode ? "maj" : sk.kmode) };
  }
  // 1 つのパートを作る（A5・Chord Track で共通）
  function genPart(o) {
    var cust = {}, i;
    for (i = 0; i < o.bars; i++) { cust[i] = o.chords[i]; }
    var go = { pat: o.pat, key: o.key, prog: "p1", bars: o.bars, range: o.range, vel: 1, dens: o.dens, seed: o.seed, custom: cust, mode: o.kmode };
    if (o.nofill) { go.nofill = 1; }
    var r = generate(go, o.meter);
    if (!r.ok) { return r; }
    var sec = { t: o.type, bars: o.bars, e: SECT[o.type][2] * (o.sv || 1) }, d = SECT_DEF[o.type] || {}, k;
    for (k in d) { if (d.hasOwnProperty(k) && k !== "end") { sec[k] = d[k]; } }
    shapeSec(r, sec, DM().ticksPerBar(o.meter));
    if (!r.drum) { fitRange(r.notes, o.snd); }
    return r;
  }
  // 差しかえの見本: o = { clip, src: "pat" | "tpl", pat, tpl, ti, dens, sv, seed } → { ok, why, state, before, notes, ... }
  function swapPlan(p, o) {
    var M = DM(), f = M.findClip(p, o && o.clip);
    if (!f || f.clip.type === "audio" || !f.clip.ext || !f.clip.ext.xgen) { return { ok: false, why: "伴奏で作ったクリップではありません（自分のメロディ・録音・手で書いたクリップは差しかえません）" }; }
    var c = f.clip, t = f.track, x = c.ext.xgen, sp = clipSpot(p, c);
    if (!sp.ok) { return sp; }
    var pt = x.pat, dens = x.dens, range = x.range || "mid", T2 = null, tr2 = null;
    if (o.src === "tpl") {
      T2 = tpl(o.tpl); tr2 = T2 && T2.tracks[Math.round(Number(o.ti))];
      if (!tr2) { return { ok: false, why: "テンプレートの楽器が見つかりません" }; }
      var part = partFor(tr2, sp.type) || { pat: tr2[1], d: tr2[2][0] !== null ? tr2[2][0] : tr2[2][1] };
      pt = part.pat; dens = part.d; range = tr2[3];
    } else if (o.pat && pat(o.pat)) { pt = o.pat; }
    if (o.dens !== undefined && o.dens !== null && o.dens !== "") { dens = clamp(Math.round(Number(o.dens)) || 0, 0, 2); }
    var P = pat(pt);
    if (!P) { return { ok: false, why: "パターンが見つかりません" }; }
    if (!!P.drum !== M.isDrum(t)) { return { ok: false, why: P.drum ? "リズムのパターンは、ドラムのトラックにだけ使えます" : "音の高さのあるパターンは、ドラムでないトラックにだけ使えます" }; }
    if (P.m.indexOf(meterKey(sp.meter.num, sp.meter.den)) < 0) { return { ok: false, why: "「" + P.name + "」は " + P.m.join("・") + " の曲で使えます（この所は " + sp.meter.num + "/" + sp.meter.den + "）" }; }
    var sv = Number(o.sv) > 0 ? Number(o.sv) : (Number(x.sv) > 0 ? Number(x.sv) : 1), seed = Math.round(Number(o.seed)) || x.seed || 1;
    var r = genPart({ pat: pt, dens: dens, range: range, key: sp.key, kmode: sp.kmode, chords: sp.chords, bars: sp.bars, meter: sp.meter, type: sp.type, seed: seed, snd: trackSnd(t), sv: sv, nofill: x.nofill });
    if (!r.ok) { return r; }
    if (r.notes.length > 4000) { return { ok: false, why: "音符が 4000 をこえます" }; }
    return { ok: true, clip: c, track: t, state: clipState(c), before: c.notes, notes: r.notes, r: r, pat: pt, dens: dens, sv: sv, seed: seed, type: sp.type, spot: sp, T2: T2, same: JSON.stringify(M.cleanNotes(r.notes)) === JSON.stringify(c.notes) };
  }
  // 差しかえ（how: "replace" 上書き ／ "newtrack" 別のトラック）。force: 手で直した・確かめられないクリップも上書きする（ユーザーが選んだとき）
  function swapApply(p, pl, how, force) {
    var M = DM(), c = pl.clip, x;
    if (how === "newtrack") {
      var t = makeTrack(p, trackSnd(pl.track) || (pl.r.drum ? "@drum" : "xm-warmpiano"), (pl.track.name + "（差しかえ）").substring(0, 30));
      if (!t) { return { ok: false, why: "トラックは " + M.MAX_TRACKS + " 本までです" }; }
      var nc = M.newMidiClip(p, t, c.start, c.len, JSON.parse(JSON.stringify(pl.notes)), c.ext.name || "");
      nc.ext.xgen = xgenOf(pl.r.set); stampClip(nc, { t: pl.type, sv: pl.sv !== 1 ? pl.sv : undefined });
      return { ok: true, track: t, clip: nc, how: how };
    }
    if (pl.state !== "gen" && !force) { return { ok: false, why: "このクリップは" + STATE_LBL[pl.state] + "ので、上書きするか、別のトラックに作るかを選んでください" }; }
    c.notes = M.cleanNotes(JSON.parse(JSON.stringify(pl.notes)));
    var keepName = c.ext.name, xp = c.ext.xpart;
    c.ext.xgen = xgenOf(pl.r.set); if (xp) { c.ext.xpart = xp; } c.ext.name = keepName;
    stampClip(c, { t: pl.type, sv: pl.sv !== 1 ? pl.sv : undefined });
    return { ok: true, track: pl.track, clip: c, how: "replace" };
  }
  // セクションの中の伴奏のクリップ（トラックの順）
  function secClips(p, sec) {
    var out = [], i, k;
    for (i = 0; i < p.tracks.length; i++) {
      var t = p.tracks[i];
      if (t.kind !== "midi") { continue; }
      for (k = 0; k < t.clips.length; k++) { var c = t.clips[k]; if (c.type !== "audio" && c.ext && c.ext.xgen && c.start >= sec.tick && c.start < sec.tick + sec.len) { out.push({ track: t, clip: c, state: clipState(c), fam: famOfTrack(t) }); } }
    }
    return out;
  }
  // セクションをまとめて（ほかのテンプレート）: 作ったままのクリップだけ・楽器の種類で合わせる
  function sectionSwapPlan(p, secId, tplId, seed) {
    var M = DM(), T = tpl(tplId), secs = M.sectionsOf(p), sec = null, i, k, items = [];
    for (i = 0; i < secs.length; i++) { if (secs[i].id === secId) { sec = secs[i]; } }
    if (!sec) { return { ok: false, why: "セクションが見つかりません" }; }
    if (!T) { return { ok: false, why: "テンプレートが見つかりません" }; }
    var list = secClips(p, sec), used = {};
    for (i = 0; i < list.length; i++) {
      var it = list[i], ti = -1;
      for (k = 0; k < T.tracks.length; k++) { if (!used[k] && famOfTplTrack(T.tracks[k]) === it.fam) { var P = pat(T.tracks[k][1]); var m0 = M.meterAt(p, it.clip.start); if (P.m.indexOf(meterKey(m0.num, m0.den)) >= 0 || (partFor(T.tracks[k], "A") && pat(partFor(T.tracks[k], "A").pat).m.indexOf(meterKey(m0.num, m0.den)) >= 0)) { ti = k; break; } } }
      if (it.state !== "gen") { items.push({ track: it.track, clip: it.clip, skip: STATE_LBL[it.state] }); continue; }
      if (ti < 0) { items.push({ track: it.track, clip: it.clip, skip: "合う楽器がない" }); continue; }
      var pl = swapPlan(p, { clip: it.clip.id, src: "tpl", tpl: T.id, ti: ti, seed: seed });
      if (!pl.ok) { items.push({ track: it.track, clip: it.clip, skip: pl.why }); continue; }
      used[ti] = 1; items.push({ track: it.track, clip: it.clip, plan: pl, ti: ti });
    }
    var n = items.filter(function (x) { return !!x.plan; }).length;
    return { ok: n > 0, why: n ? "" : "差しかえられるクリップがありません（手で直した・確かめられない・合う楽器がない）", T: T, sec: sec, items: items, n: n };
  }
  function sectionSwapApply(p, sp) { var n = 0; sp.items.forEach(function (x) { if (x.plan && swapApply(p, x.plan, "replace").ok) { n++; } }); return { ok: n > 0, n: n }; }
  // 画面
  function arrTab(h) {
    var p = h.project(), M = DM(), secs = M.sectionsOf(p), x = '<div class="dxm-arr">', i;
    if (!secs.length) { return x + '<p class="small dxm-note">セクションの印がありません。🎄 テンプレートで曲を作るか、アレンジでセクション（Aメロ・サビ など）を作ってください。</p></div>'; }
    var sec = null; for (i = 0; i < secs.length; i++) { if (secs[i].id === ui.asec) { sec = secs[i]; } }
    if (!sec) { sec = secs[0]; ui.asec = sec.id; }
    x += '<div class="dxm-opt dxm-forms"><span>セクション</span>' + secs.map(function (s) { return chip("data-xasec", s.id, esc(s.name), s.id === sec.id); }).join("") + '</div>';
    if (ui.aclip && M.findClip(p, ui.aclip)) { return x + swapHtml(h) + '</div>'; }
    ui.aclip = null;
    var list = secClips(p, sec), b0 = M.tickToBar(p, sec.tick).bar, b1 = M.tickToBar(p, sec.tick + sec.len).bar - 1;
    x += '<p class="small">「' + esc(sec.name) + '」' + b0 + '〜' + b1 + ' 小節の伴奏のクリップ（自分のメロディ・録音・手で書いたクリップは出しません・変えません）</p>';
    if (!list.length) { x += '<p class="small dxm-note">このセクションには伴奏で作ったクリップがありません。</p>'; }
    for (i = 0; i < list.length; i++) {
      var it = list[i], xg = it.clip.ext.xgen;
      x += '<div class="dxm-ptr"><span>' + esc(it.track.name) + '<small>' + esc((pat(xg.pat) || { name: xg.pat }).name.replace(/（.*$/, "")) + '・' + DENS[xg.dens] + '・<b class="dxm-st ' + it.state + '">' + STATE_LBL[it.state] + '</b></small></span><button class="modal-btn dxm-b" data-xaclip="' + it.clip.id + '">&#x1F501; かえる</button></div>';
    }
    // まとめて
    var m0 = M.meterAt(p, sec.tick), tl = TPLS.filter(function (T) { return T.num === m0.num && T.den === m0.den; });
    if (list.length) {
      if (!ui.atpl || !tpl(ui.atpl)) { ui.atpl = tl.length ? tl[0].id : ""; }
      x += '<div class="dxm-prev"><b>セクションの伴奏をまとめて</b><div class="dxm-opt">' + selHtml('data-xatpl aria-label="テンプレート"', tl.map(function (T) { return [T.id, plain(T.name)]; }), ui.atpl) + '</div>';
      var sp = ui.atpl ? sectionSwapPlan(p, sec.id, ui.atpl, g0().seed) : { ok: false, why: "この拍子のテンプレートがありません", items: [] };
      x += '<ul class="small dxm-alist">' + sp.items.map(function (it2) { return '<li>' + esc(it2.track.name) + ' → ' + (it2.plan ? esc(it2.plan.T2.tracks[it2.ti][4]) + '（' + esc(pat(it2.plan.pat).name.replace(/（.*$/, "")) + '）' : 'そのまま（' + esc(it2.skip) + '）') + '</li>'; }).join("") + '</ul>';
      x += sp.ok ? '<div class="dxm-go">' + pvBtn("so", "&#x25B6;&#xFE0F; いま") + pvBtn("sn", "&#x25B6;&#xFE0F; 差しかえ後") + '<button class="modal-btn dxm-b dxm-main" data-xm="secSwap">&#x1F501; ' + sp.n + ' つ差しかえる（↶ で戻せる）</button></div>' : '<p class="small">&#x26A0;&#xFE0F; ' + esc(sp.why) + '</p>';
      x += '</div>';
    }
    return x + '</div>';
  }
  function swapOpt() { var a = ui.aopt || {}; return { clip: ui.aclip, src: a.src || "pat", pat: a.pat, tpl: a.tpl, ti: a.ti, dens: a.dens, sv: a.sv, seed: a.seed }; }
  function swapHtml(h) {
    var p = h.project(), M = DM(), f = M.findClip(p, ui.aclip), a = ui.aopt || (ui.aopt = {}), xg = f.clip.ext.xgen, pl = swapPlan(p, swapOpt()), drum = M.isDrum(f.track), m0 = M.meterAt(p, f.clip.start), mk = meterKey(m0.num, m0.den), i;
    var x = '<div class="dxm-part"><div class="dxm-dtop"><button class="modal-btn dxm-b" data-xm="aBack">&#x2190; 一覧へ</button></div>';
    x += '<b class="dxm-dname">&#x1F501; 「' + esc(f.track.name) + '」を差しかえ</b><p class="small">いま: ' + esc((pat(xg.pat) || { name: xg.pat }).name) + '・' + DENS[xg.dens] + '・<b class="dxm-st ' + clipState(f.clip) + '">' + STATE_LBL[clipState(f.clip)] + '</b>。楽器・FX・音量は変えず、音符だけを差しかえます。コードは曲のコードを使います。</p>';
    x += '<div class="dxm-opt dxm-forms"><span>えらび方</span>' + chip("data-xasrc", "pat", "パターン", (a.src || "pat") === "pat") + chip("data-xasrc", "tpl", "ほかのテンプレートの同じ楽器", a.src === "tpl") + '</div>';
    if ((a.src || "pat") === "pat") {
      var cat = catOf(xg.pat), pl2 = PATS.filter(function (P) { return !!P.drum === drum && P.m.indexOf(mk) >= 0 && (drum || P.cat === cat || (cat === "str" && P.cat === "keys") || (cat === "keys" && P.cat === "str") || (cat === "bell" && P.cat === "bell")); });
      x += '<div class="dxm-opt">' + selHtml('data-xapat aria-label="パターン"', pl2.map(function (P) { return [P.id, P.name]; }), a.pat || xg.pat) + '</div>';
    } else {
      var fam = famOfTrack(f.track), opts = [];
      TPLS.forEach(function (T) { T.tracks.forEach(function (tr, j) { if (famOfTplTrack(tr) === fam) { opts.push([T.id + ":" + j, plain(T.name) + " の " + tr[4]]); } }); });
      if (!a.tpl && opts.length) { a.tpl = opts[0][0].split(":")[0]; a.ti = Number(opts[0][0].split(":")[1]); }
      x += '<div class="dxm-opt">' + selHtml('data-xatpl2 aria-label="テンプレートの楽器"', opts, a.tpl + ":" + a.ti) + '</div>';
    }
    x += '<div class="dxm-opt"><span>密度</span>' + DENS.map(function (n, j) { return chip("data-xadens", j, n, (a.dens !== undefined ? Number(a.dens) : -1) === j); }).join("") + '</div>';
    x += '<div class="dxm-opt"><span>強さ</span>' + SV.map(function (s) { return chip("data-xasv", s[0], s[1], (Number(a.sv) || Number(xg.sv) || 1) === s[0]); }).join("") + '<button class="modal-btn dxm-b" data-xm="aSeed">&#x1F3B2; ' + (a.seed || xg.seed || 1) + '</button></div>';
    if (pl.ok) {
      x += '<div class="dxm-prev small">' + (pl.spot.b0 + 1) + '〜' + (pl.spot.b0 + pl.spot.bars) + ' 小節・弾き方 ' + SECT[pl.type][0] + '・音符 ' + f.clip.notes.length + ' → ' + pl.notes.length + (pl.same ? '（いまと同じ）' : '') + '</div>';
      x += '<div class="dxm-go">' + pvBtn("ao", "&#x25B6;&#xFE0F; いま") + pvBtn("an", "&#x25B6;&#xFE0F; 差しかえ後") + '</div><div class="dxm-go">';
      if (pl.state === "gen") { x += '<button class="modal-btn dxm-b dxm-main" data-xm="aApply">&#x1F501; 差しかえる（↶ で戻せる）</button>'; }
      else { x += '<p class="small dxm-warn">&#x26A0;&#xFE0F; このクリップは「' + STATE_LBL[pl.state] + '」です。上書きすると、いまの音符は消えます（↶ で戻せます）。</p><button class="modal-btn dxm-b" data-xm="aForce">上書きする</button>'; }
      x += '<button class="modal-btn dxm-b" data-xm="aNew">別のトラックに作る</button><button class="modal-btn dxm-b" data-xm="aBack">やめる</button></div>';
    } else { x += '<div class="daw-msg dxm-msg">&#x26A0;&#xFE0F; ' + esc(pl.why) + '</div><div class="dxm-go"><button class="modal-btn dxm-b" data-xm="aBack">やめる</button></div>'; }
    return x + '</div>';
  }
  function clipItems(h, track, notes, start) { var p = h.project(), M = DM(), drum = M.isDrum(track), ins = drum ? null : instrument(trackSnd(track)), m0 = M.meterAt(p, start); return notesToItems(JSON.parse(JSON.stringify(notes)), ins, drum, M.bpmAt(p, start), 4, M.ticksPerBar(m0)); }
  function secItems(h, after) {
    var p = h.project(), M = DM(), secs = M.sectionsOf(p), sec = null, i, out = [];
    for (i = 0; i < secs.length; i++) { if (secs[i].id === ui.asec) { sec = secs[i]; } }
    if (!sec) { return out; }
    var sp = after ? sectionSwapPlan(p, sec.id, ui.atpl, g0().seed) : null, list = secClips(p, sec);
    for (i = 0; i < list.length; i++) {
      var it = list[i], nn = it.clip.notes;
      if (sp) { sp.items.forEach(function (z) { if (z.clip === it.clip && z.plan) { nn = z.plan.notes; } }); }
      out = out.concat(clipItems(h, it.track, nn, it.clip.start));
    }
    return out;
  }

  // ---------- 🎧 リファレンス解析 Lite（FFT の特徴だけ・推薦は目安）----------
  function fft(re, im) { // その場で（長さは 2 の累乗）
    var n = re.length, i, j = 0, k, len;
    for (i = 1; i < n; i++) { var bit = n >> 1; for (; j & bit; bit >>= 1) { j ^= bit; } j ^= bit; if (i < j) { var tr = re[i]; re[i] = re[j]; re[j] = tr; var ti = im[i]; im[i] = im[j]; im[j] = ti; } }
    for (len = 2; len <= n; len <<= 1) {
      var ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (i = 0; i < n; i += len) {
        var cr = 1, ci = 0;
        for (k = 0; k < len / 2; k++) {
          var a = i + k, b = a + len / 2, xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
          var ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
        }
      }
    }
  }
  var FEAT_NAMES = [["bright", "明るさ"], ["low", "低音の強さ"], ["harm", "倍音の多さ"], ["noise", "ノイズっぽさ"], ["attack", "アタックの強さ"], ["decay", "減衰の速さ"]];
  // chans: [Float32Array…]（同じ長さ）・sr → 特徴（音が小さすぎるなら ok: false）
  function analyze(chans, sr) {
    var n = chans[0].length, N = 2048, H = 1024, i, k, ch;
    var x = new Float32Array(n);
    for (ch = 0; ch < chans.length; ch++) { for (i = 0; i < n; i++) { x[i] += chans[ch][i] / chans.length; } }
    var sum2 = 0; for (i = 0; i < n; i++) { sum2 += x[i] * x[i]; }
    var rms = Math.sqrt(sum2 / Math.max(1, n));
    if (n < N || rms < 1e-4) { return { ok: false, why: "音が小さすぎるか、短すぎます（ほかの区間を選んでください）", rms: rms }; }
    var win = new Float32Array(N); for (i = 0; i < N; i++) { win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)); }
    var bins = N / 2, hz = sr / N, avgP = new Float64Array(bins), frames = 0, cents = 0, flats = 0, flux = [], prevMag = null, re = new Float64Array(N), im = new Float64Array(N);
    var b100 = Math.max(1, Math.round(100 / hz)), b200 = Math.round(200 / hz), b10k = Math.min(bins - 1, Math.round(10000 / hz));
    for (var s = 0; s + N <= n; s += H) {
      for (i = 0; i < N; i++) { re[i] = x[s + i] * win[i]; im[i] = 0; }
      fft(re, im);
      var tot = 0, wsum = 0, lg = 0, ar = 0, cnt = 0, fl = 0, msum = 0, mag = new Float64Array(bins);
      for (k = 1; k < bins; k++) {
        var pw = re[k] * re[k] + im[k] * im[k]; mag[k] = Math.sqrt(pw); avgP[k] += pw; tot += pw; wsum += pw * k * hz;
        if (k >= b100 && k <= b10k) { lg += Math.log(pw + 1e-12); ar += pw + 1e-12; cnt++; }
        if (prevMag) { var dm = mag[k] - prevMag[k]; if (dm > 0) { fl += dm; } }
        msum += mag[k];
      }
      if (tot > 1e-9) { cents += wsum / tot; flats += Math.exp(lg / cnt) / (ar / cnt); frames++; }
      flux.push(fl / (msum + 1e-9)); prevMag = mag; // 大きさで割る（ずっと鳴っている音では小さい）
    }
    if (!frames) { return { ok: false, why: "音が小さすぎます" }; }
    var cen = cents / frames, flat = flats / frames, totP = 0, lowP = 0;
    for (k = 1; k < bins; k++) { totP += avgP[k]; if (k <= b200) { lowP += avgP[k]; } }
    // 倍音の多さ ＝ 平均のスペクトルで、いちばん強い山から −30dB より強い山の数（100Hz〜8kHz）
    var mx = 0, peaks = 0, b8k = Math.min(bins - 2, Math.round(8000 / hz));
    for (k = b100; k <= b8k; k++) { if (avgP[k] > mx) { mx = avgP[k]; } }
    for (k = b100; k <= b8k; k++) { if (avgP[k] > mx * 0.001 && avgP[k] > avgP[k - 1] && avgP[k] >= avgP[k + 1]) { peaks++; } }
    // 大きさの動き（10ms ごとの RMS・dB）
    var hop = Math.max(1, Math.round(sr * 0.01)), env = [];
    for (s = 0; s + hop <= n; s += hop) { var e2 = 0; for (i = 0; i < hop; i++) { e2 += x[s + i] * x[s + i]; } env.push(10 * Math.log(e2 / hop + 1e-10) / Math.LN10); }
    var rise = 0, pk = 0, pkI = 0;
    for (i = 1; i < env.length; i++) { if (env[i] - env[i - 1] > rise) { rise = env[i] - env[i - 1]; } if (env[i] > env[pkI]) { pkI = i; } }
    pk = env[pkI];
    var j30 = Math.min(env.length - 1, pkI + 30), drop = pk - env[j30], dsec = Math.max(0.01, (j30 - pkI) * 0.01);
    // オンセット（スペクトルのフラックスの山）
    var fm = avg(flux), sd = 0; for (i = 0; i < flux.length; i++) { sd += (flux[i] - fm) * (flux[i] - fm); } sd = Math.sqrt(sd / Math.max(1, flux.length));
    var ons = [], hopSec = H / sr, lastOn = -1;
    for (i = 1; i + 1 < flux.length; i++) { if (flux[i] > fm + 1.2 * sd && flux[i] > 0.12 && flux[i] >= flux[i - 1] && flux[i] >= flux[i + 1] && (lastOn < 0 || (i - lastOn) * hopSec >= 0.07)) { ons.push(i); lastOn = i; } }
    var dur = n / sr, dens = ons.length / dur;
    // テンポ（フラックスの自己相関。区間が 4 秒以上・オンセットが 4 つ以上・山がはっきりしているときだけ）
    var tempo = null;
    if (dur >= 3.9 && ons.length >= 4) {
      var od = [], best = -1, bestL = 0, mean = 0, cntL = 0, L, om = 0;
      for (i = 1; i < env.length; i++) { od.push(Math.max(0, env[i] - env[i - 1])); }
      om = avg(od);
      for (L = 30; L <= 100 && L < od.length / 2; L++) { // 0.3〜1.0 秒（10ms ごと）
        var acc = 0; for (i = 0; i + L < od.length; i++) { acc += (od[i] - om) * (od[i + L] - om); }
        acc /= Math.max(1, od.length - L); mean += Math.max(0, acc); cntL++;
        var bpm0 = 6000 / L, wgt = Math.exp(-0.5 * Math.pow(Math.log(bpm0 / 120) / Math.LN2, 2)), sc = acc * (0.6 + 0.4 * wgt);
        if (sc > best) { best = sc; bestL = L; }
      }
      mean /= Math.max(1, cntL);
      if (bestL && best > mean * 2.2) { var bpm = 6000 / bestL; while (bpm < 70) { bpm *= 2; } while (bpm > 180) { bpm /= 2; } tempo = Math.round(bpm); }
    }
    // いちばん強い音の高さ（HPS・80Hz〜2kHz・目安）
    var b80 = Math.max(2, Math.round(80 / hz)), b2k = Math.min(bins - 2, Math.round(2000 / hz)), hb = 0, d0;
    for (k = b80; k <= b2k; k++) { if (!hb || avgP[k] > avgP[hb]) { hb = k; } }
    for (d0 = 3; d0 >= 2 && hb; d0--) { // 下の倍音（1/3・1/2）にも山があれば、そちらが基音
      var kk = Math.round(hb / d0), j0, bk = 0;
      for (j0 = kk - 1; j0 <= kk + 1; j0++) { if (j0 >= b80 && (!bk || avgP[j0] > avgP[bk])) { bk = j0; } }
      if (bk && avgP[bk] > avgP[hb] * 0.1) { hb = bk; break; }
    }
    var fr = hb;
    if (hb > 0 && hb + 1 < bins) { var y0 = Math.log(avgP[hb - 1] + 1e-12), y1 = Math.log(avgP[hb] + 1e-12), y2 = Math.log(avgP[hb + 1] + 1e-12), dn = y0 - 2 * y1 + y2; if (dn < 0) { fr = hb + 0.5 * (y0 - y2) / dn; } }
    var f0 = fr * hz, midi = hb ? Math.round(69 + 12 * Math.log(f0 / 440) / Math.LN2) : null;
    var f = {
      bright: r3(clamp(Math.log(Math.max(cen, 1) / 250) / Math.log(6000 / 250), 0, 1)),
      low: r3(clamp(lowP / Math.max(1e-12, totP) * 2.5, 0, 1)),
      harm: r3(clamp(peaks / 28, 0, 1)),
      noise: r3(clamp((flat - 0.02) / 0.35, 0, 1)),
      attack: r3(clamp(rise / 18, 0, 1)),
      decay: r3(clamp(drop / dsec / 60, 0, 1))
    };
    return { ok: true, f: f, centroid: Math.round(cen), flat: r3(flat), peaks: peaks, rms: r3(rms), onsets: ons.length, density: Math.round(dens * 10) / 10, tempo: tempo, midi: midi, hz: Math.round(f0), dur: Math.round(dur * 100) / 100 };
  }
  var FEAT_W = [1.2, 0.8, 0.8, 0.7, 1.0, 1.0];
  function recommend(a, n) {
    if (!a || !a.ok) { return []; }
    var keys = ["bright", "low", "harm", "noise", "attack", "decay"], out = [], i, k;
    for (i = 0; i < SOUNDS.length; i++) {
      var pf = SOUNDS[i][5].f; if (!pf) { continue; }
      var d = 0, diffs = [];
      for (k = 0; k < keys.length; k++) { var df = a.f[keys[k]] - pf[k]; d += FEAT_W[k] * df * df; diffs.push([Math.abs(df), k]); }
      diffs.sort(function (x, y) { return x[0] - y[0]; });
      out.push({ id: SOUNDS[i][0], d: r3(Math.sqrt(d)), near: [FEAT_NAMES[diffs[0][1]][1], FEAT_NAMES[diffs[1][1]][1]] });
    }
    out.sort(function (x, y) { return x.d - y.d || (x.id < y.id ? -1 : 1); });
    return out.slice(0, n || 5);
  }

  // ---------- 音（録音の音色・83／84 のドラム・試聴）----------
  // ゴリラストリングスと同じ「のびている所をくり返す」位置（バッファに覚える）
  function loopPoints(buf) {
    if (buf.ugLoop) { return buf.ugLoop; }
    var dur = buf.duration || (buf.length / (buf.sampleRate || 44100)) || 3, ls = Math.min(1, dur * 0.35), le = Math.max(ls + 0.3, dur - 0.25), lp = [ls, le];
    if (typeof buf.getChannelData === "function" && buf.sampleRate) {
      var d = buf.getChannelData(0), sr = buf.sampleRate, S = Math.round(ls * sr), E = Math.round(le * sr), R = Math.round(sr * 0.01), N = 48, bestE = E, bestErr = -1, e, j;
      for (e = E - R; e <= E + R; e++) {
        if (e - 4 < S || e + N >= d.length) { continue; }
        var err = 0;
        for (j = -4; j < N; j++) { var df = d[e + j] - d[S + j]; err += df * df; }
        if (bestErr < 0 || err < bestErr) { bestErr = err; bestE = e; }
      }
      lp = [S / sr, bestE / sr];
    }
    try { buf.ugLoop = lp; } catch (e2) {}
    return lp;
  }
  function sampleState(prog) { var UG = UGM(), n = UG && UG.sampleFiles ? UG.sampleFiles[prog] : null; return n && UG.samples ? (UG.samples.state[n] || "") : "nofile"; }
  function sampleOk(prog) { var UG = UGM(); return !!(UG && UG.sampleReady && UG.sampleReady(prog)); }
  function fbVoice(ins, m, when, vel, sec, dest) {
    var Y = SY(), patch = synPatchOf((ins.ext && ins.ext.fb) || "soft");
    if (!Y || !Y.note || !patch) { return null; }
    var v = Y.note(patch, m, dest, when, vel, sec); if (v) { v.fb = true; }
    return v;
  }
  var stat = { smp: 0, fb: 0 };
  // 録音の音色の 1 音 → 声 { kill, end, amp }（使えなければ代わりのシンセ・それも無理なら null）
  function note(ac, ins, m, when, vel, sec, dest) {
    if (!ac || !ins || !dest) { return null; }
    var UG = UGM(), prog = ins.prog;
    if (!sampleOk(prog)) { stat.fb++; return fbVoice(ins, m, when, vel, sec, dest); }
    var name = UG.sampleFiles[prog], bank = UG.samples.buffers[name], keys = UG.samples.keys[name], best = keys[0], i;
    for (i = 1; i < keys.length; i++) { if (Math.abs(keys[i] - m) < Math.abs(best - m)) { best = keys[i]; } }
    var buf = bank && bank[best];
    if (!buf) { stat.fb++; return fbVoice(ins, m, when, vel, sec, dest); }
    stat.smp++;
    var t = Math.max(when, ac.currentTime), rate = Math.pow(2, (m - best) / 12), lv = clamp(vel === undefined ? 0.8 : vel, 0.05, 1), bdur = buf.duration || (buf.length / (buf.sampleRate || 44100)) || 1;
    // 録音はシンセより小さいので、2 倍を土台に音色ごとの gain でそろえた（QA の WAV の RMS）
    var peak = 2 * (ins.gain || 1) * Math.pow(lv, 1.3), att = clamp(Number(ins.att) || 0.003, 0.001, 1), rel = clamp(Number(ins.rel) || 0.3, 0.02, 3);
    var src = ac.createBufferSource(), g = ac.createGain(), end, stop;
    src.buffer = buf; src.playbackRate.value = rate;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + att);
    if (ins.loop) {
      var lp = loopPoints(buf); src.loop = true; src.loopStart = lp[0]; src.loopEnd = lp[1];
      end = t + Math.max(att, sec);
    } else {
      var avail = bdur / rate;
      end = t + Math.max(att, Math.min(sec, avail - 0.03));
    }
    g.gain.setTargetAtTime(0, end, rel / 3);
    stop = end + rel * 1.6 + 0.02;
    if (!ins.loop) { stop = Math.min(stop, t + bdur / rate); }
    src.connect(g); g.connect(dest);
    src.start(t); src.stop(Math.max(t + 0.01, stop));
    src.onended = function () { try { src.disconnect(); g.disconnect(); } catch (e) {} };
    return { ac: ac, amp: g, src: src, end: stop, t0: t, kill: function (r) { var n0 = ac.currentTime; try { g.gain.cancelScheduledValues(n0); g.gain.setTargetAtTime(0, n0, Math.max(0.005, (r || 0.05) / 4)); src.stop(n0 + (r || 0.05) + 0.05); } catch (e) {} } };
  }
  // 83（Jingle Bell）・84（Bell Tree）だけ鳴らす（ほかは false ＝ いまの UGMelody.drum で）
  function noiseBuf(ac) {
    if (ac.__ugxNoise) { return ac.__ugxNoise; }
    var len = Math.round(ac.sampleRate * 0.4), b = ac.createBuffer(1, len, ac.sampleRate), d = b.getChannelData(0), s = 12345, i;
    for (i = 0; i < len; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = (s / 0x3fffffff) - 1; }
    try { ac.__ugxNoise = b; } catch (e) {}
    return b;
  }
  // 鳴り終わったら外す（リアルタイムだけ）。オフライン（WAV）は外さない: 描いている途中の決まらない時刻にフィルターの小さな残りを切ると、書き出すたびに音が少し変わる（QA で 3.4 LSB）。オフラインは描き終わると全部捨てる
  function tidy(nodes, ac) { if (ac && typeof ac.startRendering === "function") { return null; } return function () { for (var i = 0; i < nodes.length; i++) { try { nodes[i].disconnect(); } catch (e) {} } }; }
  function drum(ac, m, t, level, dest) {
    if (m !== 83 && m !== 84) { return false; }
    if (!ac || !dest) { return true; }
    var lv = level > 0 && level <= 1 ? level : 1, out = ac.createGain(), i;
    out.gain.value = lv; out.connect(dest);
    var last = t;
    if (m === 83) {
      // スレイベル: 高い所に絞ったノイズの小さな粒（少しずつずらす）＋ 金属の部分音
      var jit = (Math.floor(t * 997) % 5) * 0.0013, nb = noiseBuf(ac), F = [6200, 8100, 9800, 7200, 5400], Q = [7, 9, 8, 6, 7];
      for (i = 0; i < 5; i++) {
        var s = ac.createBufferSource(), bp = ac.createBiquadFilter(), g = ac.createGain(), st = t + i * 0.011 + (i % 2 ? jit : 0);
        s.buffer = nb; bp.type = "bandpass"; bp.frequency.value = F[i]; bp.Q.value = Q[i];
        g.gain.setValueAtTime(0, st); g.gain.linearRampToValueAtTime(0.9 - i * 0.1, st + 0.002); g.gain.setTargetAtTime(0, st + 0.004, 0.028 + i * 0.006);
        s.connect(bp); bp.connect(g); g.connect(out);
        s.start(st, (i * 0.05 + jit * 10) % 0.3); s.stop(st + 0.22);
        s.onended = tidy([s, bp, g], ac);
        last = Math.max(last, st + 0.22);
      }
      var P = [5150, 6730, 8320];
      for (i = 0; i < 3; i++) {
        var o = ac.createOscillator(), og = ac.createGain();
        o.type = "sine"; o.frequency.value = P[i] * (1 + jit);
        og.gain.setValueAtTime(0.07 - i * 0.015, t); og.gain.setTargetAtTime(0, t + 0.003, 0.04);
        o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.25);
        o.onended = tidy([o, og], ac);
      }
    } else {
      // ベルツリー: 高い音が上から下へ流れる
      for (i = 0; i < 10; i++) {
        var o2 = ac.createOscillator(), g2 = ac.createGain(), st2 = t + i * 0.028;
        o2.type = "sine"; o2.frequency.value = 6200 * Math.pow(0.9, i);
        g2.gain.setValueAtTime(0, st2); g2.gain.linearRampToValueAtTime(0.12, st2 + 0.002); g2.gain.setTargetAtTime(0, st2 + 0.004, 0.12);
        o2.connect(g2); g2.connect(out); o2.start(st2); o2.stop(st2 + 0.7);
        o2.onended = tidy([o2, g2], ac);
        last = Math.max(last, st2 + 0.7);
      }
    }
    setTimeoutSafe(function () { try { out.disconnect(); } catch (e) {} }, ac, last + 0.05);
    return true;
  }
  // 出口のゲインは、音が鳴り終わったあとに外す（リアルタイムだけ。オフラインは描き終わると全部捨てる）
  function setTimeoutSafe(fn, ac, at) { if (typeof ac.startRendering === "function") { return; } try { setTimeout(fn, Math.max(0, (at - ac.currentTime) * 1000) + 200); } catch (e) {} }
  // 曲で使う録音（番号）
  function progsOf(p) {
    var out = [], i;
    for (i = 0; p && i < p.tracks.length; i++) { var ins = p.tracks[i].instrument; if (isSample(ins) && out.indexOf(ins.prog) < 0 && p.tracks[i].clips.length) { out.push(ins.prog); } }
    return out;
  }
  // 読みこむのを待つ必要があるか（読めなかった録音は待たない ＝ 代わりのシンセで鳴らす）
  function needLoad(p) { var l = progsOf(p), i; for (i = 0; i < l.length; i++) { var s = sampleState(l[i]); if (s !== "ready" && s !== "error" && s !== "nofile") { return true; } } return false; }
  function missing(p) { var l = progsOf(p), n = 0, i; for (i = 0; i < l.length; i++) { if (!sampleOk(l[i])) { n++; } } return n; }
  // 読む（そろったら・timeout ms たったら cb を 1 回）
  function load(progs, cb, timeout) {
    var UG = UGM(), done = false, tm = null;
    function fin() { if (done) { return; } done = true; if (tm) { clearTimeout(tm); } if (cb) { cb(); } }
    if (!UG || !UG.loadSamples || !progs || !progs.length) { fin(); return; }
    tm = setTimeout(fin, timeout || 8000);
    try { UG.loadSamples(progs, fin); } catch (e) { fin(); }
  }

  // 試聴のプレーヤー（DAW の再生とは別・止めると全部の声を消す）
  var pv = { timer: null, items: [], i: 0, t0: 0, voices: [], ac: null, tok: 0, endAt: 0, onEnd: null, what: "" };
  function pvDest(ac) { var UG = UGM(); return (UG && UG.audio && UG.audio.bus) || ac.destination; }
  function playItem(ac, it, when, dest) {
    var v = null, Y = SY(), UG = UGM();
    try {
      if (it.drum) { if (!drum(ac, it.m, when, it.v, dest) && UG && UG.drum) { UG.drum(ac, it.m, when, it.v, dest); } return; }
      if (isSample(it.ins)) { v = note(ac, it.ins, it.m, when, it.v, it.sec, dest); }
      else if (it.ins && it.ins.patch && it.ins.patch.patch && Y && Y.note) { v = Y.note(it.ins.patch.patch, it.m, dest, when, it.v, it.sec); }
    } catch (e) { v = null; }
    if (v) { pv.voices.push(v); if (pv.voices.length > 96) { var now = ac.currentTime; pv.voices = pv.voices.filter(function (x) { return !(x.end < now); }); } }
  }
  function pvStop() {
    pv.tok++;
    if (pv.timer) { clearInterval(pv.timer); pv.timer = null; }
    for (var i = 0; i < pv.voices.length; i++) { try { if (pv.voices[i].kill) { pv.voices[i].kill(0.05); } } catch (e) {} }
    pv.voices = []; pv.items = []; pv.i = 0; pv.what = "";
    if (pv.refSrc) { try { pv.refSrc.stop(); } catch (e2) {} pv.refSrc = null; }
  }
  function pvPump() {
    var ac = pv.ac; if (!ac) { return; }
    var horizon = ac.currentTime + 0.35, dest = pvDest(ac);
    while (pv.i < pv.items.length && pv.t0 + pv.items[pv.i].at < horizon) { var it = pv.items[pv.i++]; playItem(ac, it, Math.max(ac.currentTime, pv.t0 + it.at), dest); }
    if (pv.i >= pv.items.length && ac.currentTime > pv.endAt) { var cb = pv.onEnd; clearInterval(pv.timer); pv.timer = null; pv.what = ""; pv.onEnd = null; if (cb) { cb(); } }
  }
  // items: [{ at（秒）, m, v, sec, ins | drum }]。録音を読んでから鳴らす → cb(状態)
  function pvPlay(items, what, onState) {
    var UG = UGM(), ac = null;
    pvStop();
    try { ac = UG && UG.audioInit ? UG.audioInit() : null; } catch (e) { ac = null; }
    if (!ac) { if (onState) { onState("noaudio"); } return false; }
    var progs = [], i, tok = pv.tok, end = 0;
    for (i = 0; i < items.length; i++) { if (items[i].ins && isSample(items[i].ins) && progs.indexOf(items[i].ins.prog) < 0) { progs.push(items[i].ins.prog); } end = Math.max(end, items[i].at + (items[i].sec || 0.3)); if (items[i].drum && UG.DRUM !== undefined && progs.indexOf(UG.DRUM) < 0) { progs.push(UG.DRUM); } }
    items.sort(function (a, b) { return a.at - b.at; });
    pv.what = what;
    if (onState) { onState(progs.length && needProgs(progs) ? "loading" : "play"); }
    load(progs, function () {
      if (tok !== pv.tok) { return; }
      pv.ac = ac; pv.items = items; pv.i = 0; pv.t0 = ac.currentTime + 0.12; pv.endAt = pv.t0 + end + 0.3; pv.what = what;
      pv.onEnd = function () { if (onState) { onState("end"); } };
      pvPump(); pv.timer = setInterval(pvPump, 40);
      if (onState) { onState("play"); }
    }, 6000);
    return true;
  }
  function needProgs(progs) { for (var i = 0; i < progs.length; i++) { if (!sampleOk(progs[i]) && sampleState(progs[i]) !== "error") { return true; } } return false; }
  // 音色の試聴のフレーズ（コードの分散和音 → 和音・その音色の高さで）
  function hearItems(id) {
    var s = sound(id); if (!s) { return []; }
    if (s[3] === "drum") { var r = generate({ pat: s[4].pat, bars: 2, dens: 1, seed: 3 }, { num: 4, den: 4 }); return notesToItems(r.notes, null, true, 110, 4); }
    var ins = instrument(id), o = s[5], lo = o.lo || 48, hi = o.hi || 84, base = clamp(60, lo, hi - 12), out = [], seq = [0, 4, 7, 12, 7, 4], i;
    base = base - ((base % 12) + 12) % 12; if (base < lo) { base += 12; }
    for (i = 0; i < seq.length; i++) { out.push({ at: i * 0.22, m: base + seq[i], v: 0.75, sec: 0.32, ins: ins }); }
    var cs = [0, 4, 7, 12]; for (i = 0; i < cs.length; i++) { out.push({ at: 1.45, m: base + cs[i], v: 0.65, sec: 1.4, ins: ins }); }
    return out;
  }
  function notesToItems(notes, ins, drumK, bpm, maxBars, bt) {
    var sp = 60 / (bpm || 120) / PPQ, out = [], lim = (maxBars || 4) * (bt || 3840), i;
    for (i = 0; i < notes.length; i++) { var n = notes[i]; if (n[0] >= lim) { break; } out.push({ at: n[0] * sp, m: n[2], v: n[3], sec: drumK ? 0 : Math.max(0.05, n[1] * sp), ins: ins, drum: !!drumK }); }
    return out;
  }
  // 1 音だけ（ピアノロールで高さを変えたとき）
  function hearNote(ins, m) {
    var UG = UGM(), ac = null;
    try { ac = UG && UG.audioInit ? UG.audioInit() : null; } catch (e) { ac = null; }
    if (!ac || !isSample(ins)) { return false; }
    if (!sampleOk(ins.prog)) { load([ins.prog], null, 6000); }
    var v = note(ac, ins, m, ac.currentTime + 0.01, 0.8, 0.3, pvDest(ac));
    return !!v;
  }

  // ---------- 画面（DAW の host から呼ぶ）----------
  var XM_KEY = "ultimateGorillaXmasV1";
  var ui = { tab: "sound", cat: "bells", pcat: "drum", g: null, dest: "", bar: 1, snd: "", msg: "", last: null, tpl: "", tplMode: "new", tplBar: 1, tplPlan: null, form: "std", tplKey: null, tplKmode: null, tq: "", tgen: "", tmood: "", tmeter: "", tbpm: "", tfam: "", tsel: null, part: null, asec: null, aclip: null, aopt: null, atpl: "", an: null, anStart: 0, anLen: 2, anBusy: false, pvState: "", pvWhat: "" };
  function lsGet() { try { var s = window.localStorage.getItem(XM_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function lsPut() { try { window.localStorage.setItem(XM_KEY, JSON.stringify({ g: ui.g })); } catch (e) {} }
  function g0() { if (!ui.g) { var s = lsGet(); ui.g = genClean(s && s.g ? s.g : { seed: 1 }); } return ui.g; }
  function chip(attr, val, label, on) { return '<button class="dxm-chip' + (on ? " on" : "") + '" ' + attr + '="' + esc(val) + '"' + (on ? ' aria-pressed="true"' : '') + '>' + label + '</button>'; }
  function selHtml(attr, list, cur) { var h = '<select class="dxm-sel" ' + attr + '>', i; for (i = 0; i < list.length; i++) { h += '<option value="' + esc(list[i][0]) + '"' + (String(list[i][0]) === String(cur) ? " selected" : "") + '>' + list[i][1] + '</option>'; } return h + '</select>'; }
  function pvBtn(what, label) { var on = pv.what === what && (ui.pvState === "play" || ui.pvState === "loading"); return '<button class="modal-btn dxm-b dxm-pv' + (on ? " on" : "") + '" data-xpv="' + esc(what) + '" title="試聴">' + (on ? (ui.pvState === "loading" ? "&#x23F3;" : "&#x23F9;&#xFE0F;") : (label || "&#x25B6;&#xFE0F;")) + '</button>'; }
  function licText(id) { var s = sound(id); return s ? LIC[s[5].lic] || "" : ""; }
  function selTrackId(h) { var p = h.project(), t = h.selTrack ? h.selTrack() : null, M = DM(); return t && M.findTrack(p, t) ? t : ""; }

  function html(h) {
    var p = h.project(), M = DM(), m0 = M.meterAt(p, 0), x = '<div class="daw dxm">' +
      '<div class="daw-top"><button class="modal-btn daw-small" data-xm="back">&#x2190; もどる</button><b>&#x1F384; クリスマス制作</b><span class="daw-pname">' + esc(p.name) + '・' + m0.num + '/' + m0.den + '・BPM ' + M.bpmAt(p, 0) + '</span></div>' +
      '<div class="dxm-tabs" role="tablist">' + chip("data-xtab", "sound", "&#x1F514; 音色", ui.tab === "sound") + chip("data-xtab", "pat", "&#x1F3BC; パターン", ui.tab === "pat") + chip("data-xtab", "gen", "&#x1F3B9; 伴奏", ui.tab === "gen") +
        chip("data-xtab", "tpl", "&#x1F384; テンプレート", ui.tab === "tpl") + chip("data-xtab", "arr", "&#x1F501; 差しかえ", ui.tab === "arr") + chip("data-xtab", "ana", "&#x1F3A7; 解析", ui.tab === "ana") + '</div>' +
      (ui.msg ? '<div class="daw-msg dxm-msg">' + ui.msg + '</div>' : '');
    if (ui.tab === "sound") { x += soundTab(h); }
    else if (ui.tab === "pat") { x += patTab(h, m0); }
    else if (ui.tab === "gen") { x += genTab(h, m0); }
    else if (ui.tab === "tpl") { x += tplTab(h); }
    else if (ui.tab === "arr") { x += arrTab(h); }
    else { x += anaTab(h); }
    x += '<p class="small dxm-foot">&#x1F4DD; ここで作る伴奏・音色は、一般的なコード進行・リズム・音作りから作ったものです（有名な曲のメロディ・フレーズは入っていません）。録音の音色の権利は、音色の下に書いてあります（CC BY はクレジットの表記が要ります）。</p></div>';
    return x;
  }
  function soundTab(h) {
    var x = '<div class="dxm-cats">', i, sel = selTrackId(h), p = h.project(), M = DM(), st = sel ? M.findTrack(p, sel) : null, canSel = st && st.kind === "midi" && !M.isAudio(st) && !M.isDrum(st);
    for (i = 0; i < CATS.length; i++) { x += chip("data-xcat", CATS[i][0], CATS[i][1], ui.cat === CATS[i][0]); }
    x += '</div><div class="dxm-list">';
    for (i = 0; i < SOUNDS.length; i++) {
      var s = SOUNDS[i]; if (s[1] !== ui.cat) { continue; }
      var how = s[5].how || (s[3] === "syn" ? "シンセ" : "録音（" + (UGM() && UGM().sampleFiles ? esc(UGM().sampleFiles[s[4].prog] || "") : "") + "）") + (s[5].rev ? "・残響 " + Math.round(s[5].rev * 100) : "");
      x += '<div class="dxm-row"><div class="dxm-rn"><b>' + s[2] + '</b><span class="small">' + how + '・' + esc(LIC[s[5].lic]) + '</span></div>' +
        '<div class="dxm-rb">' + pvBtn("s:" + s[0]) + '<button class="modal-btn dxm-b" data-xadd="' + s[0] + '" title="この音色で新しいトラック">&#xFF0B; トラック</button>' +
        (canSel && s[3] !== "drum" ? '<button class="modal-btn dxm-b" data-xset="' + s[0] + '" title="選んでいるトラックの音色にする">&#x2192; 「' + esc(st.name.substring(0, 8)) + '」</button>' : '') + '</div></div>';
    }
    x += '</div>';
    if (ui.cat === "bells") { x += '<p class="small dxm-note">見送った音色: ' + SKIPPED.map(function (s) { return "<b>" + s[0] + "</b>（" + s[1] + "）"; }).join("") + '</p>'; }
    x += '<p class="small dxm-note">「→」は、アレンジで選んでいるトラック（またはクリップのトラック）の音色を変えます（↶ で戻せます）。</p>';
    return x;
  }
  function patTab(h, m0) {
    var x = '<div class="dxm-cats">', i, list = patsFor(m0.num, m0.den), other = PATS.length - list.length;
    for (i = 0; i < PCATS.length; i++) { x += chip("data-xpcat", PCATS[i][0], PCATS[i][1], ui.pcat === PCATS[i][0]); }
    x += '</div><div class="dxm-list">';
    for (i = 0; i < list.length; i++) {
      var P = list[i]; if (P.cat !== ui.pcat) { continue; }
      x += '<div class="dxm-row"><div class="dxm-rn"><b>' + esc(P.name) + '</b><span class="small">' + P.m.join("・") + '・はじめの音色 ' + soundName(P.snd) + '</span></div>' +
        '<div class="dxm-rb">' + pvBtn("p:" + P.id) + '<button class="modal-btn dxm-b" data-xuse="' + P.id + '">&#x1F3B9; 伴奏で作る</button></div></div>';
    }
    x += '</div><p class="small dxm-note">' + PATS.length + ' 個のうち、この曲の拍子（' + m0.num + '/' + m0.den + '）で使えるのは ' + list.length + ' 個' + (other ? '（ほかの拍子のパターン ' + other + ' 個は、その拍子の曲で出ます）' : '') + '。試聴は伴奏のタブのキー・コード進行で 2 小節。</p>';
    return x;
  }
  function genTab(h, m0) {
    var g = g0(), p = h.project(), M = DM(), P = pat(g.pat), ok = P.m.indexOf(meterKey(m0.num, m0.den)) >= 0, i, list = patsFor(m0.num, m0.den), chs = chordsFor(g.prog, g.bars, g.custom, g.mode), clist = CHORD_LISTS[g.mode] || CHORD_LISTS.maj;
    if (!ok && list.length) { g.pat = list[0].id; P = list[0]; ok = true; }
    var x = '<div class="dxm-form">' +
      '<label>キー ' + selHtml('data-xg="key"', KEYS.map(function (k, j) { return [j, k + " " + modeName(g.mode)]; }), g.key) + '</label>' +
      '<div class="dxm-opt"><span>キーの種類</span>' + MODES.map(function (m) { return chip("data-xkmode", m[0], m[1], g.mode === m[0]); }).join("") + '</div>' +
      '<span class="dxm-bpm">BPM <button class="modal-btn dxm-b" data-xm="bpm-">&#x2212;</button><b>' + M.bpmAt(p, 0) + '</b><button class="modal-btn dxm-b" data-xm="bpm+">&#xFF0B;</button></span>' +
      '<label>コード進行 ' + selHtml('data-xg="prog"', PROGS.map(function (q) { return [q[0], q[1]]; }), g.prog) + '</label>' +
      '<div class="dxm-chords">';
    for (i = 0; i < g.bars; i++) {
      var cl1 = clist.indexOf(chs[i]) >= 0 ? clist : clist.concat([chs[i]]);
      x += '<label class="dxm-ch"><small>' + (i + 1) + '</small>' + selHtml('data-xch="' + i + '"', cl1.map(function (c) { return [c, chordOf(g.key, c).name + " (" + chordLabel(c) + ")"]; }), chs[i]) + '</label>';
    }
    x += '</div>' +
      '<label class="dxm-wide">スタイル ' + selHtml('data-xg="pat"', list.map(function (q) { return [q.id, q.name]; }), g.pat) + '</label>' +
      '<div class="dxm-opt"><span>長さ</span>' + LENS.map(function (n) { return chip("data-xlen", n, n + " 小節", g.bars === n); }).join("") + '</div>' +
      '<div class="dxm-opt"><span>音域</span>' + RANGES.map(function (r) { return chip("data-xrange", r[0], r[1], g.range === r[0]); }).join("") + '</div>' +
      '<div class="dxm-opt"><span>強さの変化</span>' + VELS.map(function (n, j) { return chip("data-xvel", j, n, g.vel === j); }).join("") + '</div>' +
      '<div class="dxm-opt"><span>リズムの密度</span>' + DENS.map(function (n, j) { return chip("data-xdens", j, n, g.dens === j); }).join("") + '</div>' +
      '<div class="dxm-opt"><span>シード</span><input type="number" class="dxm-seed" min="1" max="99999" value="' + g.seed + '" aria-label="シード"><button class="modal-btn dxm-b" data-xm="seed">&#x1F3B2; かえる</button></div>';
    // 置く所
    var opts = [["", "&#xFF0B; 新しいトラック"]];
    for (i = 0; i < p.tracks.length; i++) { var t = p.tracks[i]; if (t.kind === "midi" && !M.isAudio(t) && M.isDrum(t) === !!P.drum) { opts.push([t.id, esc(t.name)]); } }
    if (ui.dest && !M.findTrack(p, ui.dest)) { ui.dest = ""; }
    var sOpts = []; for (i = 0; i < SOUNDS.length; i++) { if ((SOUNDS[i][3] === "drum") === !!P.drum) { sOpts.push([SOUNDS[i][0], SOUNDS[i][2]]); } }
    if (P.drum) { sOpts.unshift(["@drum", "&#x1F941; ドラム"]); } else if (!sound(P.snd)) { sOpts.unshift([P.snd, soundName(P.snd)]); }
    var sv = ui.snd && (sound(ui.snd) && (sound(ui.snd)[3] === "drum") === !!P.drum || (ui.snd === "@drum" && P.drum)) ? ui.snd : P.snd;
    x += '<div class="dxm-opt dxm-dest"><span>置く所</span>' + selHtml('data-xdest', opts, ui.dest) + (ui.dest ? '' : selHtml('data-xsnd', sOpts, sv)) +
      '<label class="dxm-barl">小節 <input type="number" class="dxm-bar" min="1" max="' + MAXB + '" value="' + ui.bar + '" aria-label="何小節目から"></label></div>' +
      '<div class="dxm-go">' + pvBtn("g", "&#x25B6;&#xFE0F; 試聴") + '<button class="modal-btn dxm-b dxm-main" data-xm="make">&#xFF0B; 作る</button></div>';
    if (ui.last && DM().findClip(p, ui.last.clip)) {
      x += '<div class="dxm-res"><div>' + ui.last.note + '</div><div class="dxm-rb"><button class="modal-btn dxm-b" data-xm="edit">' + (ui.last.drum ? "&#x1F941; ステップで直す" : "&#x1F3B9; ピアノロールで直す") + '</button>' +
        '<button class="modal-btn dxm-b" data-xm="regen" title="同じクリップのまま、いまの設定で作りなおす">&#x1F501; 作りなおす</button><button class="modal-btn dxm-b" data-xm="undo">&#x21B6; 戻す</button></div></div>';
    }
    x += '<p class="small dxm-note">同じ設定とシードなら、同じ音符になります。「作る」は毎回新しいクリップ（重なる所には作りません）。「作りなおす」はさっきのクリップの中身だけを置きかえます。BPM の変更は ↶ の対象外です（DAW の BPM と同じ）。</p></div>';
    return x;
  }
  function formChips() {
    var x = '<div class="dxm-opt dxm-forms"><span>構成</span>', i;
    for (i = 0; i < FORMS.length; i++) { x += chip("data-xform", FORMS[i][0], FORMS[i][1] + " " + formBars(FORMS[i][0]) + " 小節", ui.form === FORMS[i][0]); }
    return x + '</div><p class="small dxm-formline">' + formLine(formOf(null, ui.form)) + '</p>';
  }
  function tplOpt() { return { key: ui.tplKey, kmode: ui.tplKmode }; }
  function formLine(form) { return form.map(function (f) { return esc(f.name) + " " + f.bars; }).join(" → "); }
  function tplTab(h) {
    var x = '<div class="dxm-list">', i, p = h.project(), M = DM();
    if (!ui.tplPlan && ui.part && tpl(ui.part.tpl)) { return x + partHtml(h) + '</div>'; }
    if (!ui.tplPlan) { return x + (ui.tsel && tpl(ui.tsel) ? detailHtml(h) : browseHtml()) + '</div>'; }
    var pl0 = ui.tplPlan, T2 = pl0.T;
    x += formChips();
    x += '<div class="dxm-prev"><b>' + T2.name + '</b>・' + (pl0.mode === "new" ? "&#x1F195; 新しい曲で作る" : "&#xFF0B; いまの曲の " + pl0.bar + " 小節目から足す") + '<br><span class="small">' + pl0.meter.num + '/' + pl0.meter.den + '・' + (pl0.mode === "new" ? "BPM " + T2.bpm + "・" : "BPM " + M.bpmAt(p, 0) + "（いまの曲のまま）・") + KEYS[pl0.key] + ' ' + modeName(pl0.kmode) + '・' + pl0.bars + ' 小節・トラック ' + pl0.tracks + ' 本' + (pl0.mode === "new" ? '（＋ 空のメロディのトラック）' : '') + '・クリップ ' + pl0.clips + ' 個・音符 ' + pl0.notes + ' 個</span>' +
      '<table class="dxm-tbl"><tr><th>トラック</th><th>音色・パターン</th><th>鳴る所（密度）</th></tr>';
    for (i = 0; i < pl0.rows.length; i++) {
      var r = pl0.rows[i], cells = [], k, at = {};
      for (k = 0; k < r.clips.length; k++) { at[r.clips[k].sec] = r.clips[k]; }
      for (k = 0; k < pl0.form.length; k++) {
        var c0 = at[k];
        cells.push('<span class="dxm-sx' + (c0 ? " on d" + c0.r.set.dens : "") + '" title="' + esc(pl0.form[k].name) + (c0 ? "・" + esc(c0.r.pat.name.replace(/（.*$/, "")) + "・" + DENS[c0.r.set.dens] : "・なし") + '">' + SECT[pl0.form[k].t][3] + '</span>');
      }
      x += '<tr><td>' + esc(r.name) + '</td><td>' + soundName(r.snd) + '<br><small>' + esc(pat(r.pat).name.replace(/（.*$/, "")) + '</small></td><td class="dxm-sxs">' + cells.join("") + '</td></tr>';
    }
    x += '</table><div class="small">' + formLine(pl0.form) + '（' + SECT_ORDER.filter(function (t) { return pl0.form.some(function (f) { return f.t === t; }); }).map(function (t) { return SECT[t][3] + "＝" + SECT[t][0]; }).join("・") + '・明るいほど密度が多い）</div>';
    x += '<div class="dxm-opt dxm-tkey"><span>キー</span>' + selHtml('data-xtkey', KEYS.map(function (k, j) { return [j, k]; }), pl0.key) + MODES.map(function (m) { return chip("data-xtkmode", m[0], m[1], pl0.kmode === m[0]); }).join("") + '</div>';
    x += '<div class="small">権利: ' + pl0.lic.map(function (l) { return esc(LIC[l]); }).join(" ／ ") + '</div>';
    if (pl0.mode === "add") { x += '<label class="dxm-barl">何小節目から <input type="number" class="dxm-tbar" min="1" max="' + MAXB + '" value="' + pl0.bar + '"></label>'; }
    x += '<div class="dxm-go">' + pvBtn("t", "&#x25B6;&#xFE0F; " + esc(pl0.form[pl0.hear].name) + "を試聴") + '<button class="modal-btn dxm-b dxm-main" data-xm="tplApply">' + (pl0.mode === "new" ? "&#x1F195; 新しい曲で作る" : "&#xFF0B; 足す（↶ で戻せる）") + '</button><button class="modal-btn dxm-b" data-xm="tplCancel">やめる</button></div></div>';
    return x + '</div>';
  }
  function anaTab(h) {
    var p = h.project(), M = DM(), s = M.refSpan(p), x = '<div class="dxm-ana">';
    x += '<p class="small dxm-warn">&#x26A0;&#xFE0F; 混ざった曲（いくつもの楽器）から、楽器の名前・元の音色の設定はわかりません。ここで出すのは「明るさ・アタックなどの傾向が近い」クリスマスの音色の候補です。🎧 の音は曲・WAV・MIDI に入りません。</p>';
    if (!s) { return x + '<p>🎧 リファレンスがありません。</p><button class="modal-btn dxm-b" data-xm="openRef">&#x1F3A7; リファレンスを読みこむ</button></div>'; }
    var rb = h.refBuf ? h.refBuf() : null, dur = s.dur;
    if (!rb) { return x + '<p>🎧「' + esc(s.asset.name) + '」を読みこんでいます…</p><button class="modal-btn dxm-b" data-xm="refresh">&#x1F504; 読めたか見る</button></div>'; }
    var len = ui.anLen, mxs = Math.max(0, Math.floor((dur - len) * 10) / 10);
    if (ui.anStart > mxs) { ui.anStart = mxs; }
    x += '<div class="dxm-opt"><span>区間</span>' + [1, 2, 4].map(function (n) { return chip("data-xalen", n, n + " 秒", len === n); }).join("") + '</div>' +
      '<label class="dxm-wide">はじまり <input type="range" class="dm-fader dxm-ast" min="0" max="' + mxs + '" step="0.1" value="' + ui.anStart + '" aria-label="はじまりの秒"> <b class="dxm-astv">' + ui.anStart.toFixed(1) + ' 秒</b>（全体 ' + Math.round(dur) + ' 秒）</label>' +
      '<div class="dxm-go">' + pvBtn("r", "&#x25B6;&#xFE0F; この区間") + '<button class="modal-btn dxm-b dxm-main" data-xm="analyze">&#x1F50D; 解析する</button></div>';
    var a = ui.an;
    if (a && !a.ok) { x += '<p class="dxm-msg">' + esc(a.why) + '</p>'; }
    if (a && a.ok) {
      x += '<div class="dxm-feat">';
      for (var i = 0; i < FEAT_NAMES.length; i++) { var v = a.f[FEAT_NAMES[i][0]]; x += '<div class="dxm-fr"><span>' + FEAT_NAMES[i][1] + '</span><i style="--w:' + Math.round(v * 100) + '%;"></i><b>' + Math.round(v * 100) + '</b></div>'; }
      x += '</div><p class="small">オンセット ' + a.onsets + ' 個（' + a.density + ' 個／秒）・推定テンポ ' + (a.tempo ? a.tempo + "（目安）" : "わからない（4 秒・はっきりしたリズムのときだけ出します）") + '・いちばん強い音の高さ ' + (a.midi !== null ? noteNameOf(a.midi) + "（" + a.hz + " Hz・目安）" : "わからない") + '</p>';
      var rec = recommend(a, 5);
      x += '<div class="dxm-list"><b>近い傾向の候補（目安）</b>';
      for (i = 0; i < rec.length; i++) {
        x += '<div class="dxm-row"><div class="dxm-rn"><b>' + (i + 1) + '. ' + soundName(rec[i].id) + '</b><span class="small">' + esc(rec[i].near.join("・")) + 'が近い・ちがい ' + rec[i].d + '</span></div>' +
          '<div class="dxm-rb">' + pvBtn("ra", "A &#x1F3A7;") + pvBtn("rb:" + rec[i].id, "B &#x1F384;") + '<button class="modal-btn dxm-b" data-xadd="' + rec[i].id + '">&#xFF0B; トラック</button></div></div>';
      }
      x += '</div><p class="small dxm-note">A ＝ 選んだ区間（大きさを −18dBFS RMS にそろえる）・B ＝ 候補の音色を、目安の高さで 1 音（大きさは目安）。</p>';
    }
    return x + '</div>';
  }
  function noteNameOf(m) { var UG = UGM(); try { if (UG && UG.noteName) { return UG.noteName(m); } } catch (e) {} return String(m); }

  // ---------- 操作 ----------
  function genItems(h, g, snd) {
    var p = h.project(), M = DM(), m0 = M.meterAt(p, 0), r = generate(g, m0);
    if (!r.ok) { return { ok: false, why: r.why }; }
    var bt = M.barTicks(p), id = snd, ins = null, t;
    if (ui.dest && (t = M.findTrack(p, ui.dest))) { ins = t.instrument; id = (t.ext && t.ext.xm) || ""; }
    else { id = snd || r.pat.snd; if (!r.drum) { ins = instrument(id); } }
    if (!r.drum) { fitRange(r.notes, id); }
    return { ok: true, items: notesToItems(r.notes, ins, r.drum, M.bpmAt(p, 0), 2, bt) };
  }
  function previewTpl(h, pl) {
    var pl0 = pl || ui.tplPlan, M = DM(), items = [], i, k, bpm = pl0.mode === "new" ? pl0.T.bpm : M.bpmAt(h.project(), 0), bt = Math.round(pl0.meter.num * PPQ * 4 / pl0.meter.den);
    for (i = 0; i < pl0.rows.length; i++) {
      var row = pl0.rows[i], ins = row.snd === "@drum" || (sound(row.snd) && sound(row.snd)[3] === "drum") ? null : instrument(row.snd);
      for (k = 0; k < row.clips.length; k++) { if (row.clips[k].sec !== pl0.hear) { continue; } var ns = JSON.parse(JSON.stringify(row.clips[k].r.notes)); if (ins) { fitRange(ns, row.snd); } items = items.concat(notesToItems(ns, ins, !ins, bpm, 4, bt)); }
    }
    return items;
  }
  function refItems(h) {
    var rb = h.refBuf ? h.refBuf() : null; if (!rb) { return null; }
    return rb;
  }
  function playRef(h, onState) {
    var rb = refItems(h), UG = UGM(), ac = null;
    pvStop();
    if (!rb) { return false; }
    try { ac = UG.audioInit(); } catch (e) { ac = null; }
    if (!ac) { return false; }
    var buf = rb.buf, sr = buf.sampleRate, a0 = Math.floor(ui.anStart * sr), n = Math.min(buf.length - a0, Math.floor(ui.anLen * sr)), s2 = 0, ch, i;
    for (ch = 0; ch < buf.numberOfChannels; ch++) { var d = buf.getChannelData(ch); for (i = a0; i < a0 + n; i += 4) { s2 += d[i] * d[i]; } }
    var rms = Math.sqrt(s2 / Math.max(1, n / 4 * buf.numberOfChannels)), g = ac.createGain(), src = ac.createBufferSource();
    g.gain.value = rms > 1e-5 ? Math.min(10, 0.126 / rms) : 1;
    src.buffer = buf; src.connect(g); g.connect(pvDest(ac)); // 候補（B）と同じ出口
    g.gain.value *= 4; // 出口の全体の音量（UGMelody の master ≈ 0.25）の分をもどす
    src.start(ac.currentTime + 0.05, ui.anStart, ui.anLen);
    src.onended = function () { try { src.disconnect(); g.disconnect(); } catch (e) {} if (pv.refSrc === src) { pv.refSrc = null; pv.what = ""; if (onState) { onState("end"); } } };
    pv.refSrc = src; pv.what = "ra"; if (onState) { onState("play"); }
    return true;
  }
  function analyzeRef(h) {
    var rb = refItems(h);
    if (!rb) { ui.an = { ok: false, why: "🎧 の音をまだ読みこめていません" }; return ui.an; }
    var buf = rb.buf, sr = buf.sampleRate, a0 = Math.floor(ui.anStart * sr), n = Math.min(buf.length - a0, Math.floor(ui.anLen * sr)), chans = [], ch;
    for (ch = 0; ch < Math.min(2, buf.numberOfChannels); ch++) { chans.push(buf.getChannelData(ch).subarray(a0, a0 + n)); }
    var t0 = Date.now();
    ui.an = analyze(chans, sr); ui.an.ms = Date.now() - t0;
    return ui.an;
  }
  function bind(root, h) {
    if (!root || !root.querySelectorAll) { return; }
    var els = root.querySelectorAll("button"), k, M = DM();
    function re() { h.render(); }
    function pvState(s) { ui.pvState = s; if (s === "end" || s === "noaudio") { pv.what = ""; } if (s === "noaudio") { ui.msg = "&#x26A0;&#xFE0F; 音を出す準備ができませんでした"; } if (h.isView()) { re(); } }
    function stopSong() { if (h.playing && h.playing()) { h.stopSong(); } }
    for (k = 0; k < els.length; k++) {
      els[k].onclick = function (ev) {
        var el = ev.currentTarget, v, p = h.project(), g = g0();
        if ((v = el.getAttribute("data-xtab"))) { ui.tab = v; ui.msg = ""; pvStop(); ui.pvState = ""; re(); return; }
        if ((v = el.getAttribute("data-xcat"))) { ui.cat = v; re(); return; }
        if ((v = el.getAttribute("data-xpcat"))) { ui.pcat = v; re(); return; }
        if ((v = el.getAttribute("data-xpv"))) {
          if (pv.what === v && (ui.pvState === "play" || ui.pvState === "loading")) { pvStop(); ui.pvState = ""; re(); return; }
          stopSong(); ui.msg = "";
          if (v.indexOf("s:") === 0) { pvPlay(hearItems(v.substring(2)), v, pvState); }
          else if (v.indexOf("p:") === 0) { var gx = {}, kk; for (kk in g) { if (g.hasOwnProperty(kk)) { gx[kk] = g[kk]; } } gx.pat = v.substring(2); gx.bars = 4; var it0 = genItems(h, gx, pat(gx.pat).snd); if (it0.ok) { pvPlay(it0.items, v, pvState); } else { ui.msg = "&#x26A0;&#xFE0F; " + esc(it0.why); } }
          else if (v === "g") { var it1 = genItems(h, g, ui.snd); if (it1.ok) { pvPlay(it1.items, v, pvState); } else { ui.msg = "&#x26A0;&#xFE0F; " + esc(it1.why); } }
          else if (v === "t") { pvPlay(previewTpl(h), v, pvState); }
          else if (v === "q" && ui.part) { pvPlay(partItems(h), v, pvState); }
          else if ((v === "ao" || v === "an") && ui.aclip) { var fa = M.findClip(p, ui.aclip), pa = v === "an" ? swapPlan(p, swapOpt()) : null; if (fa && (v === "ao" || pa.ok)) { pvPlay(clipItems(h, fa.track, v === "an" ? pa.notes : fa.clip.notes, fa.clip.start), v, pvState); } }
          else if (v === "so" || v === "sn") { pvPlay(secItems(h, v === "sn"), v, pvState); }
          else if (v.indexOf("d:") === 0) { var pld = tplPlan(null, v.substring(2), "new", 1, g.seed, ui.form); if (pld.ok) { pvPlay(previewTpl(h, pld), v, pvState); } else { ui.msg = "&#x26A0;&#xFE0F; " + esc(pld.why); } }
          else if (v === "ra") { playRef(h, pvState); }
          else if (v.indexOf("rb:") === 0) { var a = ui.an, id = v.substring(3), s = sound(id), m = a && a.midi !== null ? a.midi : 60, items; if (s && s[3] === "drum") { items = hearItems(id); } else { var lo = (s && s[5].lo) || 36, hi = (s && s[5].hi) || 96; while (m < lo) { m += 12; } while (m > hi) { m -= 12; } items = [{ at: 0, m: m, v: 0.8, sec: Math.min(2, ui.anLen), ins: instrument(id) }]; } pvPlay(items, v, pvState); }
          re(); return;
        }
        if ((v = el.getAttribute("data-xadd"))) {
          var snap = h.snap(), t = makeTrack(p, v, null);
          if (!t) { ui.msg = "&#x26A0;&#xFE0F; トラックは " + M.MAX_TRACKS + " 本までです"; re(); return; }
          if (sound(v) && sound(v)[3] === "drum") { var rd = generate({ pat: sound(v)[4].pat, bars: 1, dens: 1, seed: 1 }, M.meterAt(p, 0)); M.newMidiClip(p, t, 0, M.barTicks(p), rd.ok ? rd.notes : [], "パターン 1"); }
          else { M.newMidiClip(p, t, 0, M.barTicks(p) * 4, [], "クリップ 1"); }
          ui.msg = "「" + esc(t.name) + "」を足しました（" + p.tracks.length + " 本目・↶ で戻せます）";
          h.commit(snap, ui.msg, t.id); return;
        }
        if ((v = el.getAttribute("data-xset"))) {
          var tid = selTrackId(h), tt = tid ? M.findTrack(p, tid) : null;
          if (!tt || M.isDrum(tt) || M.isAudio(tt)) { ui.msg = "&#x26A0;&#xFE0F; 音色を変えるトラックを、アレンジで選んでください"; re(); return; }
          var snap2 = h.snap(); tt.instrument = instrument(v); tt.ext.xm = v;
          ui.msg = "「" + esc(tt.name) + "」の音色を " + sound(v)[2] + " にしました（↶ で戻せます）";
          h.commit(snap2, ui.msg, tt.id); return;
        }
        if ((v = el.getAttribute("data-xuse"))) { g.pat = v; ui.snd = ""; ui.dest = ""; lsPut(); ui.tab = "gen"; ui.msg = ""; pvStop(); re(); return; }
        if ((v = el.getAttribute("data-xkmode"))) { g.mode = v === "min" ? "min" : "maj"; g.custom = {}; lsPut(); re(); return; }
        if ((v = el.getAttribute("data-xtkmode"))) { ui.tplKmode = v === "min" ? "min" : "maj"; if (ui.tplPlan) { var plk = tplPlan(p, ui.tplPlan.T.id, ui.tplPlan.mode, ui.tplPlan.bar, g.seed, ui.form, tplOpt()); if (plk.ok) { ui.tplPlan = plk; ui.msg = ""; } else { ui.msg = "&#x26A0;&#xFE0F; " + esc(plk.why); } } pvStop(); re(); return; }
        if ((v = el.getAttribute("data-xlen"))) { g.bars = Number(v); lsPut(); re(); return; }
        if ((v = el.getAttribute("data-xrange"))) { g.range = v; lsPut(); re(); return; }
        if ((v = el.getAttribute("data-xvel"))) { g.vel = Number(v); lsPut(); re(); return; }
        if ((v = el.getAttribute("data-xdens"))) { g.dens = Number(v); lsPut(); re(); return; }
        if (el.hasAttribute && el.hasAttribute("data-xtgen")) { ui.tgen = el.getAttribute("data-xtgen") || ""; re(); return; }
        if ((v = el.getAttribute("data-xtsel"))) { if (tpl(v)) { ui.tsel = v; ui.tplPlan = null; ui.msg = ""; } pvStop(); ui.pvState = ""; re(); return; }
        if ((v = el.getAttribute("data-xfav"))) { tplFav(v); re(); return; }
        if ((v = el.getAttribute("data-xasec"))) { ui.asec = v; ui.aclip = null; ui.aopt = null; pvStop(); ui.pvState = ""; re(); return; }
        if ((v = el.getAttribute("data-xaclip"))) { ui.aclip = v; ui.aopt = {}; pvStop(); ui.pvState = ""; ui.msg = ""; re(); return; }
        if ((v = el.getAttribute("data-xasrc")) && ui.aopt) { ui.aopt.src = v === "tpl" ? "tpl" : "pat"; ui.aopt.tpl = undefined; ui.aopt.ti = undefined; ui.aopt.pat = undefined; pvStop(); re(); return; }
        if ((v = el.getAttribute("data-xadens")) !== null && v !== undefined && v !== "" && ui.aopt) { ui.aopt.dens = Number(v); pvStop(); re(); return; }
        if ((v = el.getAttribute("data-xasv")) && ui.aopt) { ui.aopt.sv = Number(v); pvStop(); re(); return; }
        if ((v = el.getAttribute("data-xpart")) !== null && v !== undefined && v !== "" && ui.tsel && tpl(ui.tsel)) { pvStop(); ui.pvState = ""; ui.part = partInit(h, ui.tsel, Number(v)); ui.msg = ""; re(); return; }
        if ((v = el.getAttribute("data-xptype")) && ui.part) { ui.part.type = SECT[v] ? v : "A"; ui.part.prog = progFor(tpl(ui.part.tpl), ui.part.type); pvStop(); re(); return; }
        if ((v = el.getAttribute("data-xpkm")) && ui.part) { ui.part.kmode = v === "min" ? "min" : "maj"; ui.part.chords = {}; pvStop(); re(); return; }
        if ((v = el.getAttribute("data-xform"))) {
          ui.form = formById(v)[0]; pvStop();
          if (ui.tplPlan) { var plf = tplPlan(p, ui.tplPlan.T.id, ui.tplPlan.mode, ui.tplPlan.bar, g.seed, ui.form, tplOpt()); if (plf.ok) { ui.tplPlan = plf; ui.msg = ""; } else { ui.msg = "&#x26A0;&#xFE0F; " + esc(plf.why); } }
          re(); return;
        }
        if ((v = el.getAttribute("data-xalen"))) { ui.anLen = Number(v); ui.an = null; re(); return; }
        if ((v = el.getAttribute("data-xtpl"))) {
          ui.tplMode = el.getAttribute("data-xmode") === "add" ? "add" : "new"; ui.tpl = v; ui.tsel = v; pvStop(); ui.pvState = "";
          ui.tplBar = ui.tplMode === "add" ? Math.max(1, Math.ceil(M.endTick(p) / M.barTicks(p)) + 1) : 1;
          ui.tplKey = null; ui.tplKmode = null;
          var pln = tplPlan(p, v, ui.tplMode, ui.tplBar, g.seed, ui.form);
          if (!pln.ok) { ui.msg = "&#x26A0;&#xFE0F; " + esc(pln.why); ui.tplPlan = null; } else { ui.tplPlan = pln; ui.msg = ""; }
          re(); return;
        }
        v = el.getAttribute("data-xm");
        if (v === "back") { pvStop(); ui.pvState = ""; ui.msg = ""; h.back(); return; }
        if (v === "bpm-" || v === "bpm+") { M.setBpm(p, M.bpmAt(p, 0) + (v === "bpm+" ? 1 : -1)); h.dirty(); re(); return; }
        if (v === "seed") { g.seed = (g.seed * 48271 + 11) % 99991 + 1; lsPut(); re(); return; }
        if (v === "make") {
          var snap3 = h.snap(), r = place(p, g, { track: ui.dest, bar: ui.bar, sound: ui.snd });
          if (!r.ok) { ui.msg = "&#x26A0;&#xFE0F; " + esc(r.why); re(); return; }
          ui.last = { clip: r.clip.id, track: r.track.id, drum: M.isDrum(r.track), note: "「" + esc(r.track.name) + "」の " + ui.bar + " 小節目に「" + esc(pat(g.pat).name) + "」（" + g.bars + " 小節・音符 " + r.notes + " 個・" + KEYS[g.key] + (g.mode === "min" ? "m" : "") + "・シード " + g.seed + "）を作りました" };
          if (!ui.dest) { ui.dest = ""; }
          ui.msg = ""; h.commit(snap3, ui.last.note, r.track.id, r.clip.id); return;
        }
        if (v === "regen") {
          if (!ui.last) { return; }
          var snap4 = h.snap(), r2 = regen(p, ui.last.clip, { key: g.key, mode: g.mode, prog: g.prog, custom: g.custom, range: g.range, vel: g.vel, dens: g.dens, seed: g.seed, pat: g.pat, bars: g.bars });
          if (!r2.ok) { ui.msg = "&#x26A0;&#xFE0F; " + esc(r2.why); re(); return; }
          ui.last.note = "同じクリップを作りなおしました（音符 " + r2.notes + " 個・シード " + g.seed + "）";
          h.commit(snap4, ui.last.note, r2.track.id, r2.clip.id); return;
        }
        if (v === "edit") { if (ui.last) { pvStop(); h.edit(ui.last.clip); } return; }
        if (v === "undo") { h.undo(); return; }
        if ((v === "partBack" || v === "partCancel") && ui.part) { ui.part = null; pvStop(); ui.pvState = ""; ui.msg = ""; re(); return; }
        if (v === "partFill" && ui.part) { var pf0 = ui.part, bf = chordsFor(pf0.prog, pf0.bars, null, pf0.kmode), fi; pf0.chords = {}; for (fi = 0; fi < pf0.bars; fi++) { pf0.chords[pf0.bar - 1 + fi] = bf[fi]; } re(); return; }
        if (v === "partApply" && ui.part) {
          pvStop();
          var plp = partPlan(p, ui.part);
          if (!plp.ok) { ui.msg = "&#x26A0;&#xFE0F; " + esc(plp.why); re(); return; }
          var snp = h.snapAll ? h.snapAll() : h.snap(), rp = partApply(p, plp);
          if (!rp.ok) { if (snp && snp.__all) { p.tracks = snp.tracks; p.ext = snp.ext; } else { h.restore(snp); } ui.msg = "&#x26A0;&#xFE0F; " + esc(rp.why); re(); return; }
          tplUsed(plp.T.id); ui.part = null;
          ui.msg = "「" + esc(rp.track.name) + "」の " + plp.bar + "〜" + (plp.bar + plp.bars - 1) + " 小節に「" + esc(plp.name) + "」（" + plain(plp.T.name) + "・音符 " + plp.notes + " 個）を足しました（↶ 1 回で戻せます）";
          h.commit(snp, ui.msg, rp.track.id, rp.clip.id); return;
        }
        if (v === "aBack") { ui.aclip = null; ui.aopt = null; pvStop(); ui.pvState = ""; re(); return; }
        if (v === "aSeed" && ui.aopt) { var sd0 = ui.aopt.seed || (M.findClip(p, ui.aclip) || { clip: { ext: { xgen: {} } } }).clip.ext.xgen.seed || 1; ui.aopt.seed = (sd0 * 48271 + 11) % 99991 + 1; pvStop(); re(); return; }
        if ((v === "aApply" || v === "aForce" || v === "aNew") && ui.aclip) {
          pvStop();
          var spl = swapPlan(p, swapOpt());
          if (!spl.ok) { ui.msg = "&#x26A0;&#xFE0F; " + esc(spl.why); re(); return; }
          var sns = h.snapAll ? h.snapAll() : h.snap(), sr = swapApply(p, spl, v === "aNew" ? "newtrack" : "replace", v === "aForce");
          if (!sr.ok) { if (sns && sns.__all) { p.tracks = sns.tracks; p.ext = sns.ext; } else { h.restore(sns); } ui.msg = "&#x26A0;&#xFE0F; " + esc(sr.why); re(); return; }
          ui.msg = (sr.how === "newtrack" ? "新しいトラック「" + esc(sr.track.name) + "」に作りました（元のクリップはそのまま）" : "「" + esc(sr.track.name) + "」の " + (spl.spot.b0 + 1) + "〜" + (spl.spot.b0 + spl.spot.bars) + " 小節を差しかえました") + "（↶ 1 回で戻せます）";
          ui.aclip = null; ui.aopt = null;
          h.commit(sns, ui.msg, sr.track.id, sr.clip.id); return;
        }
        if (v === "secSwap") {
          pvStop();
          var ssp = sectionSwapPlan(p, ui.asec, ui.atpl, g.seed);
          if (!ssp.ok) { ui.msg = "&#x26A0;&#xFE0F; " + esc(ssp.why); re(); return; }
          var sns2 = h.snapAll ? h.snapAll() : h.snap(), sr2 = sectionSwapApply(p, ssp);
          ui.msg = "「" + esc(ssp.sec.name) + "」の伴奏 " + sr2.n + " つを「" + plain(ssp.T.name) + "」の楽器に差しかえました（↶ 1 回で戻せます）";
          h.commit(sns2, ui.msg); return;
        }
        if (v === "tselBack") { ui.tsel = null; pvStop(); ui.pvState = ""; re(); return; }
        if (v === "tqClear") { ui.tq = ""; re(); return; }
        if (v === "tplCancel") { ui.tplPlan = null; pvStop(); re(); return; }
        if (v === "tplApply") {
          var pl0 = ui.tplPlan; if (!pl0) { return; }
          pvStop();
          if (pl0.mode === "new") {
            var rn = tplNewProject(pl0);
            if (!rn.ok) { ui.msg = "&#x26A0;&#xFE0F; " + esc(rn.why); re(); return; }
            tplUsed(pl0.T.id); ui.tplPlan = null; ui.msg = "新しい曲「" + esc(rn.project.name) + "」を作りました（前の曲は保存してあります）。メロディのトラックに、あなたのメロディを書いてください";
            h.newSong(rn.project); return;
          }
          var pl1 = tplPlan(p, pl0.T.id, "add", pl0.bar, g.seed, pl0.formId, { key: pl0.key, kmode: pl0.kmode });
          if (!pl1.ok) { ui.msg = "&#x26A0;&#xFE0F; " + esc(pl1.why); re(); return; }
          var snap5 = h.snapAll ? h.snapAll() : h.snap(), ra = tplApply(p, pl1);
          if (!ra.ok) { if (snap5 && snap5.__all) { p.tracks = snap5.tracks; p.ext = snap5.ext; } else { h.restore(snap5); } ui.msg = "&#x26A0;&#xFE0F; " + esc(ra.why); re(); return; }
          tplUsed(pl1.T.id); ui.tplPlan = null; ui.msg = "「" + plain(pl1.T.name) + "」のトラック " + ra.tracks.length + " 本を " + pl1.bar + " 小節目から足しました（↶ 1 回で全部戻せます）";
          h.commit(snap5, ui.msg, ra.tracks[0].id); return;
        }
        if (v === "openRef") { pvStop(); h.openRef(); return; }
        if (v === "refresh") { re(); return; }
        if (v === "analyze") { analyzeRef(h); re(); return; }
      };
    }
    var sels = root.querySelectorAll("select"), j;
    for (j = 0; j < sels.length; j++) {
      sels[j].onchange = function (ev) {
        var el = ev.currentTarget, g = g0(), v;
        if ((v = el.getAttribute("data-xg"))) { if (v === "key") { g.key = Number(el.value); } else if (v === "prog") { g.prog = el.value; g.custom = {}; } else if (v === "pat") { g.pat = el.value; ui.snd = ""; } lsPut(); re(); return; }
        if ((v = el.getAttribute("data-xch")) !== null && v !== undefined && v !== "") { var bi = Number(v), base = chordsFor(g.prog, g.bars, {}, g.mode)[bi]; if (el.value === base) { delete g.custom[bi]; } else { g.custom[bi] = el.value; } lsPut(); re(); return; }
        if (el.hasAttribute && el.hasAttribute("data-xdest")) { ui.dest = el.value; var t = ui.dest ? M.findTrack(h.project(), ui.dest) : null; ui.bar = t ? Math.max(1, Math.round(M.trackEnd(t) / M.barTicks(h.project())) + 1) : 1; re(); return; }
        if (el.hasAttribute && el.hasAttribute("data-xsnd")) { ui.snd = el.value; re(); return; }
        if (el.hasAttribute && el.hasAttribute("data-xatpl")) { ui.atpl = el.value; pvStop(); re(); return; }
        if (el.hasAttribute && el.hasAttribute("data-xapat") && ui.aopt) { ui.aopt.pat = el.value; pvStop(); re(); return; }
        if (el.hasAttribute && el.hasAttribute("data-xatpl2") && ui.aopt) { var tv = String(el.value).split(":"); ui.aopt.tpl = tv[0]; ui.aopt.ti = Number(tv[1]); pvStop(); re(); return; }
        if (ui.part && el.hasAttribute) {
          if (el.hasAttribute("data-xpw")) { partWhere(h, ui.part, el.value); ui.part.prog = progFor(tpl(ui.part.tpl), ui.part.type); pvStop(); re(); return; }
          if (el.hasAttribute("data-xpkey")) { ui.part.key = Math.round(Number(el.value)) || 0; pvStop(); re(); return; }
          if (el.hasAttribute("data-xpprog")) { ui.part.prog = progById(el.value)[0]; pvStop(); re(); return; }
          if (el.hasAttribute("data-xpdest")) { ui.part.dest = el.value || ""; re(); return; }
          if (el.hasAttribute("data-xpch")) { var cb = el.getAttribute("data-xpch"); if (/^[0-9]+$/.test(cb) && CHORDS[el.value]) { ui.part.chords[cb] = el.value; } pvStop(); re(); return; }
        }
        if ((v = el.getAttribute("data-xtf"))) { if (["mood", "meter", "bpm", "fam"].indexOf(v) >= 0) { ui["t" + v] = el.value || ""; } re(); return; }
        if (el.hasAttribute && el.hasAttribute("data-xtkey")) { ui.tplKey = Math.round(Number(el.value)); if (ui.tplPlan) { var plq = tplPlan(h.project(), ui.tplPlan.T.id, ui.tplPlan.mode, ui.tplPlan.bar, g.seed, ui.form, tplOpt()); if (plq.ok) { ui.tplPlan = plq; } } pvStop(); re(); return; }
      };
    }
    var pbE = root.querySelector(".dxm-pbar"), pnE = root.querySelector(".dxm-pbars");
    if (pbE) { pbE.onchange = function () { var n = Math.round(Number(pbE.value)); if (ui.part && n >= 1 && n <= MAXB) { ui.part.bar = n; } pvStop(); re(); }; }
    if (pnE) { pnE.onchange = function () { var n = Math.round(Number(pnE.value)); if (ui.part && n >= 1 && n <= 64) { ui.part.bars = n; } pvStop(); re(); }; }
    var tqEl = root.querySelector(".dxm-tq"); if (tqEl) { tqEl.oninput = function () { ui.tq = String(tqEl.value || "").substring(0, 60); tplRefresh(root); }; }
    var sd = root.querySelector(".dxm-seed"); if (sd) { sd.onchange = function () { var g = g0(), n = Math.round(Number(sd.value)); if (n >= 1 && n <= 99999) { g.seed = n; lsPut(); } re(); }; }
    var br = root.querySelector(".dxm-bar"); if (br) { br.onchange = function () { var n = Math.round(Number(br.value)); if (n >= 1 && n <= MAXB) { ui.bar = n; } re(); }; }
    var tb = root.querySelector(".dxm-tbar"); if (tb) { tb.onchange = function () { var n = Math.round(Number(tb.value)); if (n >= 1 && n <= MAXB && ui.tplPlan) { var pl2 = tplPlan(h.project(), ui.tplPlan.T.id, "add", n, g0().seed, ui.tplPlan.formId, tplOpt()); if (pl2.ok) { ui.tplPlan = pl2; } else { ui.msg = "&#x26A0;&#xFE0F; " + esc(pl2.why); } } re(); }; }
    var as = root.querySelector(".dxm-ast"); if (as) { as.oninput = function () { ui.anStart = Number(as.value) || 0; var l = root.querySelector(".dxm-astv"); if (l) { l.textContent = ui.anStart.toFixed(1) + " 秒"; } }; as.onchange = function () { ui.anStart = Number(as.value) || 0; ui.an = null; re(); }; }
  }
  function leave() { pvStop(); ui.pvState = ""; }

  window.UGXmas = {
    VERSION: 1, KEY: XM_KEY,
    KEYS: KEYS, CHORDS: CHORDS, CHORD_ORDER: CHORD_ORDER, PROGS: PROGS, CHORD_LISTS: CHORD_LISTS, MINMAP: MINMAP, SCALES: SCALES, MODES: MODES, scaleTone: scaleTone, chordOf: chordOf, chordsFor: chordsFor, voice: voice, rng: rng,
    SOUNDS: SOUNDS, SKIPPED: SKIPPED, CATS: CATS, LIC: LIC, sound: sound, instrument: instrument, isSample: isSample, label: label, makeTrack: makeTrack, trackFx: trackFx, soundName: soundName,
    PATS: PATS, PCATS: PCATS, pat: pat, patsFor: patsFor, generate: generate, genClean: genClean, place: place, regen: regen, fitRange: fitRange,
    TPLS: TPLS, SECS: SECS, tplPlan: tplPlan, tplApply: tplApply, tplNewProject: tplNewProject,
    notesHash: notesHash, stampClip: stampClip, clipState: clipState, clipSpot: clipSpot, genPart: genPart, swapPlan: swapPlan, swapApply: swapApply, secClips: secClips, sectionSwapPlan: sectionSwapPlan, sectionSwapApply: sectionSwapApply, famOfTrack: famOfTrack, arrTab: arrTab, STATE_LBL: STATE_LBL,
    secTypeOfName: secTypeOfName, songKey: songKey, songChords: songChords, putChords: putChords, planChords: planChords, partPlan: partPlan, partApply: partApply, partInit: partInit, partHtml: partHtml,
    GENRES: GENRES, MOODS: MOODS, FAMS: FAMS, BPMS: BPMS, TPL_KEY: TPL_KEY, famsOf: famsOf, bpmBand: bpmBand, hayOf: hayOf, tplMatch: tplMatch, tplSearch: tplSearch, tplPrefs: tplPrefs, tplFav: tplFav, tplUsed: tplUsed, tplRefresh: tplRefresh,
    SECT: SECT, SECT_ORDER: SECT_ORDER, SECT_DEF: SECT_DEF, FORMS: FORMS, formOf: formOf, formBars: formBars, partFor: partFor, progFor: progFor, audit: audit,
    fft: fft, analyze: analyze, recommend: recommend, FEAT_NAMES: FEAT_NAMES,
    note: note, drum: drum, progsOf: progsOf, needLoad: needLoad, missing: missing, load: load, loopPoints: loopPoints, sampleOk: sampleOk, stat: stat,
    hearItems: hearItems, pvPlay: pvPlay, pvStop: pvStop, pv: pv, hearNote: hearNote, notesToItems: notesToItems,
    ui: ui, html: html, bind: bind, leave: leave, analyzeRef: analyzeRef
  };
})();
