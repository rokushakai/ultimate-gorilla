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
  // §168 v0.87 / §183 v0.99.2: コード進行で練習（2周でクリア）。キー C で書き、度数と説明つき
  var UKE_PROG_CATS = [
    { id: "jpop", name: "&#x1F38C; J-POPの定番" }, { id: "rock", name: "&#x1F3B8; 洋楽・ロック" },
    { id: "jazz", name: "&#x1F3B7; ジャズ・おしゃれ" }, { id: "cliche", name: "&#x1F3B5; クリシェ・終止形" }
  ];
  var UKE_PROGRESSIONS = [
    { id: "ohdo", cat: "jpop", name: "王道進行", chords: ["F", "G7", "Em", "Am"], deg: ["Ⅳ", "Ⅴ7", "Ⅲm", "Ⅵm"], note: "J-POPのサビの大定番。せつなさと前向きさが同居" },
    { id: "ohdo7", cat: "jpop", name: "王道進行（7th版）", chords: ["Fmaj7", "G7", "Em7", "Am7"], deg: ["Ⅳmaj7", "Ⅴ7", "Ⅲm7", "Ⅵm7"], note: "4和音にして、おしゃれで大人っぽく" },
    { id: "ohdo37", cat: "jpop", name: "王道進行（Ⅲ7入り）", chords: ["F", "G7", "E7", "Am"], deg: ["Ⅳ", "Ⅴ7", "Ⅲ7", "Ⅵm"], note: "Ⅲmを Ⅲ7 にすると、次の Ⅵm へ強く引っぱる（セカンダリードミナント）" },
    { id: "komuro", cat: "jpop", name: "小室進行", chords: ["Am", "F", "G", "C"], deg: ["Ⅵm", "Ⅳ", "Ⅴ", "Ⅰ"], note: "マイナーから始まる、疾走感のある進行" },
    { id: "canon", cat: "jpop", name: "カノン進行", chords: ["C", "G", "Am", "Em", "F", "C", "F", "G7"], deg: ["Ⅰ", "Ⅴ", "Ⅵm", "Ⅲm", "Ⅳ", "Ⅰ", "Ⅳ", "Ⅴ7"], note: "パッヘルベルのカノンから。いろいろな曲で使われる" },
    { id: "canonbass", cat: "jpop", name: "カノン進行（ベース下降）", chords: ["C", "G/B", "Am", "Em/G", "F", "C/E", "Dm7", "G7"], deg: ["Ⅰ", "Ⅴ/Ⅶ", "Ⅵm", "Ⅲm/Ⅴ", "Ⅳ", "Ⅰ/Ⅲ", "Ⅱm7", "Ⅴ7"], note: "分数コードでベースが ド→シ→ラ→ソ… と1音ずつ下がる" },
    { id: "marusa", cat: "jpop", name: "丸サ進行（おしゃれ）", chords: ["Fmaj7", "E7", "Am7", "Gm7", "C7"], deg: ["Ⅳmaj7", "Ⅲ7", "Ⅵm7", "Ⅴm7", "Ⅰ7"], note: "Ⅲ と Ⅰ を 7th にした都会的な進行" },
    { id: "i37", cat: "jpop", name: "Ⅰ–Ⅲ7–Ⅵm–Ⅴ", chords: ["C", "E7", "Am", "G"], deg: ["Ⅰ", "Ⅲ7", "Ⅵm", "Ⅴ"], note: "Ⅲ7 で一度ゆさぶってから Ⅵm へ" },
    { id: "fifties", cat: "rock", name: "50年代進行", chords: ["C", "Am", "F", "G7"], deg: ["Ⅰ", "Ⅵm", "Ⅳ", "Ⅴ7"], note: "オールディーズの定番。くり返しで覚えやすい" },
    { id: "letitbe", cat: "rock", name: "レット・イット・ビー風", chords: ["C", "G", "Am", "F"], deg: ["Ⅰ", "Ⅴ", "Ⅵm", "Ⅳ"], note: "Ⅰ–Ⅴ–Ⅵm–Ⅳ。洋楽ポップスの大定番" },
    { id: "setsunai", cat: "rock", name: "せつない進行", chords: ["Am", "F", "C", "G"], deg: ["Ⅵm", "Ⅳ", "Ⅰ", "Ⅴ"], note: "Ⅰ–Ⅴ–Ⅵm–Ⅳ を Ⅵm から始めた形。暗めでエモい" },
    { id: "three", cat: "rock", name: "スリーコード", chords: ["C", "F", "G7", "C"], deg: ["Ⅰ", "Ⅳ", "Ⅴ7", "Ⅰ"], note: "Ⅰ・Ⅳ・Ⅴ の3つだけ。ロックやフォークの基本" },
    { id: "mixo", cat: "rock", name: "ミクソリディアン（♭Ⅶ）", chords: ["C", "B♭", "F", "C"], deg: ["Ⅰ", "♭Ⅶ", "Ⅳ", "Ⅰ"], note: "♭Ⅶ（シ♭のコード）を使うと、ロックっぽい力強さ" },
    { id: "andalusia", cat: "rock", name: "アンダルシア進行", chords: ["Am", "G", "F", "E7"], deg: ["Ⅵm", "Ⅴ", "Ⅳ", "Ⅲ7"], note: "フラメンコ風。ベースが ラ→ソ→ファ→ミ と下がる" },
    { id: "b67", cat: "rock", name: "♭Ⅵ–♭Ⅶ–Ⅰ（クリア風）", chords: ["A♭", "B♭", "C", "C"], deg: ["♭Ⅵ", "♭Ⅶ", "Ⅰ", "Ⅰ"], note: "明るく堂々とした終わり方。ゲームのファンファーレ風" },
    { id: "blues", cat: "rock", name: "12小節ブルース", chords: ["C7", "C7", "C7", "C7", "F7", "F7", "C7", "C7", "G7", "F7", "C7", "G7"], deg: ["Ⅰ7", "Ⅰ7", "Ⅰ7", "Ⅰ7", "Ⅳ7", "Ⅳ7", "Ⅰ7", "Ⅰ7", "Ⅴ7", "Ⅳ7", "Ⅰ7", "Ⅴ7"], note: "12小節でひとまわり。シャッフル（スイング）で", style: "e", swing: 0.67, bpm: 100 },
    { id: "251", cat: "jazz", name: "ii-V-I", chords: ["Dm7", "G7", "Cmaj7", "Cmaj7"], deg: ["Ⅱm7", "Ⅴ7", "Ⅰmaj7", "Ⅰmaj7"], note: "ジャズの基本中の基本", style: "q", swing: 0.62, bpm: 110 },
    { id: "junkan", cat: "jazz", name: "循環コード", chords: ["C", "Am", "Dm", "G7"], deg: ["Ⅰ", "Ⅵm", "Ⅱm", "Ⅴ7"], note: "Ⅰ–Ⅵm–Ⅱm–Ⅴ7 をくり返す。ジャズやポップスの定番", style: "q", swing: 0.62, bpm: 110 },
    { id: "gyaku", cat: "jazz", name: "逆循環", chords: ["Dm7", "G7", "C", "Am7"], deg: ["Ⅱm7", "Ⅴ7", "Ⅰ", "Ⅵm7"], note: "Ⅱm から始める循環。おしゃれに回る", style: "q", swing: 0.62, bpm: 110 },
    { id: "rhythm", cat: "jazz", name: "リズム・チェンジ風", chords: ["Cmaj7", "A7", "Dm7", "G7"], deg: ["Ⅰmaj7", "Ⅵ7", "Ⅱm7", "Ⅴ7"], note: "Ⅵ を 7th にして次へ強く進む。ジャズの定番", style: "q", swing: 0.62, bpm: 120 },
    { id: "kareha", cat: "jazz", name: "枯葉風", chords: ["Dm7", "G7", "Cmaj7", "Fmaj7", "Bm7(♭5)", "E7", "Am7", "Am7"], deg: ["Ⅱm7", "Ⅴ7", "Ⅰmaj7", "Ⅳmaj7", "Ⅶm7(♭5)", "Ⅲ7", "Ⅵm7", "Ⅵm7"], note: "Ⅱ–Ⅴ–Ⅰ をメジャーとマイナーで2回。スタンダードの形", style: "q", swing: 0.62, bpm: 100 },
    { id: "minor251", cat: "jazz", name: "マイナー ii-V-i", chords: ["Bm7(♭5)", "E7", "Am", "Am"], deg: ["Ⅶm7(♭5)", "Ⅲ7", "Ⅵm", "Ⅵm"], note: "マイナーのキーで終わる Ⅱm7(♭5)–Ⅴ7–Ⅰm（Am のキーで見たとき）", style: "q", swing: 0.62, bpm: 100 },
    { id: "clichedown", cat: "cliche", name: "下降クリシェ", chords: ["Am", "AmM7", "Am7", "Am6"], deg: ["Ⅵm", "ⅥmM7", "Ⅵm7", "Ⅵm6"], note: "コードはそのままで、1つの音だけが ラ→ソ#→ソ→ファ# と半音ずつ下がる" },
    { id: "clicheup", cat: "cliche", name: "上昇クリシェ", chords: ["C", "Caug", "C6", "C7"], deg: ["Ⅰ", "Ⅰaug", "Ⅰ6", "Ⅰ7"], note: "5度の音が ソ→ソ#→ラ→シ♭ と上がっていく" },
    { id: "sdm", cat: "cliche", name: "サブドミナントマイナー", chords: ["F", "Fm", "C", "C"], deg: ["Ⅳ", "Ⅳm", "Ⅰ", "Ⅰ"], note: "Ⅳ を一瞬マイナー（Ⅳm）にすると、切なく温かい" },
    { id: "cadence", cat: "cliche", name: "終止形（カデンツ）", chords: ["F", "G7", "C", "C"], deg: ["Ⅳ", "Ⅴ7", "Ⅰ", "Ⅰ"], note: "Ⅳ→Ⅴ→Ⅰ で「おしまい」の感じ（完全終止）" },
    { id: "deceptive", cat: "cliche", name: "偽終止", chords: ["F", "G7", "Am", "Am"], deg: ["Ⅳ", "Ⅴ7", "Ⅵm", "Ⅵm"], note: "Ⅰ に行くと思わせて Ⅵm へ。意外な展開に" },
    { id: "domchain", cat: "cliche", name: "ドミナントの連鎖", chords: ["E7", "A7", "D7", "G7", "C"], deg: ["Ⅲ7", "Ⅵ7", "Ⅱ7", "Ⅴ7", "Ⅰ"], note: "7th のコードが4度ずつ進んで、最後に Ⅰ に着く" }
  ];
  var UKE_PROG_LOOPS = 2;
  // 進行のコードをキー（半音）でずらした名前の一覧
  function ukeProgChords(prog, key) {
    var out = [];
    for (var i = 0; i < prog.chords.length; i++) { out.push(key && C ? C.transposeName(prog.chords[i], key) : prog.chords[i]); }
    return out;
  }
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
  function ukeCountKeys(o) { var n = 0; for (var k in o) { if (o.hasOwnProperty(k)) { n++; } } return n; }
  // §175 v0.94: 表示するフレット数 → 指板の寸法（8以上はサウンドホールを小さくして指板を長く）
  var UKE_TOTAL_FRETS = 18, UKE_TALL_H = 420;
  var UKE_FRET_CHOICES = [[5, "5"], [6, "6（いつも）"], [8, "8"], [9, "9（半分）"], [12, "12"], [15, "15（ソプラノほぼ全部）"], [18, "18（テナー全部）"]];
  function ukeLayout(n, compact) {
    n = Math.round(Number(n) || 6);
    var ok = false;
    for (var i = 0; i < UKE_FRET_CHOICES.length; i++) { if (UKE_FRET_CHOICES[i][0] === n) { ok = true; } }
    if (!ok) { n = 6; }
    // §181 v0.99: 引きのビュー（サウンドホールを小さく、指板を長く）
    // 引きのときはゲーム画面を縦に 420 まで伸ばす（api.setCanvasHeight）
    if (compact) { return { frets: n, nut: 30, fh: 350 / n, strumY: 386, holeY: 404, body: 34, hole: 14, compact: true, h: UKE_TALL_H, bottom: UKE_TALL_H - 16 }; }
    if (n <= 7) { return { frets: n, nut: UKE_NUT_Y, fh: 168 / n, strumY: UKE_STRUM_Y, holeY: UKE_HOLE_Y, body: 70, hole: 34, h: 320, bottom: 304 }; }
    return { frets: n, nut: 40, fh: 210 / n, strumY: 256, holeY: 284, body: 48, hole: 22, h: 320, bottom: 304 };
  }
  var UKE_LAYOUT6 = null; // ukeLayout(6)（下の定数のあとで作る）
  // 指板の座標 → { s: 弦, f: 表示の中のフレット(1〜) } / null
  function ukeCellAt(x, y, L) {
    L = L || UKE_LAYOUT6;
    if (y < L.nut - 4 || y > L.nut + L.frets * L.fh + 4) { return null; }
    var best = -1, bd = 23;
    for (var s = 0; s < 4; s++) { var d = Math.abs(x - UKE_STRX[s]); if (d < bd) { bd = d; best = s; } }
    if (best < 0) { return null; }
    var f = Math.floor((y - L.nut) / L.fh) + 1;
    return { s: best, f: Math.max(1, Math.min(L.frets, f)) };
  }
  // x0 → x1 へ動いたときに通った弦（通った順）
  function ukeCrossed(x0, x1) {
    var out = [], s;
    if (x1 > x0) { for (s = 0; s < 4; s++) { if (x0 < UKE_STRX[s] && x1 >= UKE_STRX[s]) { out.push(s); } } }
    else if (x1 < x0) { for (s = 3; s >= 0; s--) { if (x0 > UKE_STRX[s] && x1 <= UKE_STRX[s]) { out.push(s); } } }
    return out;
  }
  // 押さえている場所の一覧 [{s, f}] → 各弦の鳴るフレット（いちばん高いフレット）
  UKE_LAYOUT6 = ukeLayout(6);
  // 👂 耳コピの答えボタン（2×2・指板の上に重ねる）
  function ukeEarBtn(i) { return { x: 30 + (i % 2) * 94, y: 70 + Math.floor(i / 2) * 70, w: 86, h: 58 }; }
  // 押さえ方が表示のフレット（frets 本・省略時6）に入るようにポジションを決める（入っていればそのまま）
  function ukeFitPos(shape, pos, frets) {
    frets = frets || 6;
    var mn = 99, mx = 0, maxPos = Math.max(0, UKE_TOTAL_FRETS - frets);
    for (var i = 0; i < 4; i++) { if (shape[i] > 0) { if (shape[i] < mn) { mn = shape[i]; } if (shape[i] > mx) { mx = shape[i]; } } }
    if (mx === 0) { return 0; }
    if (mn > pos && mx <= pos + frets) { return pos; }
    return mx <= frets ? 0 : Math.min(maxPos, mn - 1);
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
  // §175 v0.94: ポジション（auto / low / mid / high）を指定した押さえ方
  var UKE_POS = [["auto", "自動"], ["low", "ロー"], ["mid", "ミドル"], ["high", "ハイ"]];
  function ukePosOk(p) { return p === "low" || p === "mid" || p === "high"; }
  function ukeVoicePos(spec, lowG, pos) {
    if (!C) { return []; }
    return ukePosOk(pos) ? C.voicingsAt(spec, pos, { lowG: lowG, preferred: UKE_PREFERRED, count: 6 }) : ukeVoice(spec, lowG);
  }
  // 押さえ方 → 名前（定番を優先し、なければエンジンで当てる）
  function ukeDetect(frets, lowG) {
    var nm = ukeChordName(frets);
    var d = C ? C.detect(frets, { lowG: lowG, preferred: UKE_PREFERRED }) : null;
    if (nm) { return { name: nm, alts: d ? d.alts : [], tones: d ? d.tones : [] }; }
    return d || { name: "", alts: [], tones: [] };
  }
  // §171 v0.90: 弦ごとの出口。同じ弦の前の音を 0.04 秒で消してから、新しい出口（GainNode）を返す
  function ukeStringOut(UG, ac, outs, s, when, level, toBus) {
    var bus = toBus || ((UG.audio && UG.audio.ctx === ac && UG.audio.bus) ? UG.audio.bus : ac.destination);
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
  function ukeNote(UG, ac, outs, s, fret, when, level, lowG, bus, prog) {
    if (fret === null || fret === undefined) { return; }
    var midi = ukeMidi(s, fret, lowG), pg = prog === undefined ? UKE_PROG : prog;
    try {
      if (outs) { UG.synth(midi, pg, when, 1, ukeStringOut(UG, ac, outs, s, when, level, bus)); }
      else { UG.synth(midi, pg, when, level); }
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
    return { lowG: !!p0.lowG, notes: !!p0.notes, tones: !!p0.tones, fingers: p0.fingers !== false, frets: ukeLayout(p0.frets).frets, posPref: ukePosOk(p0.posPref) ? p0.posPref : "auto", view: p0.view === "compact" ? "compact" : "normal", hold: p0.hold === "hold" || p0.hold === "hybrid" || p0.hold === "smart" ? p0.hold : "real", progKey: Math.max(0, Math.min(11, Math.round(Number(p0.progKey) || 0))) };
  }
  function ukeSavePrefs(p1) {
    lsSet(UKE_PREFS_KEY, { lowG: !!p1.lowG, notes: !!p1.notes, tones: !!p1.tones, fingers: !!p1.fingers, frets: ukeLayout(p1.frets).frets, posPref: ukePosOk(p1.posPref) ? p1.posPref : "auto", view: p1.view === "compact" ? "compact" : "normal", hold: p1.hold === "hold" || p1.hold === "hybrid" || p1.hold === "smart" ? p1.hold : "real", progKey: Math.max(0, Math.min(11, Math.round(Number(p1.progKey) || 0))) });
  }
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
      loopOn: false, loopA: 0, loopB: 3, pos: "auto", tracks: null, arr: [], lyrics: { id: 0 },
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
    out.pos = ukePosOk(out.pos) ? out.pos : "auto";
    out.tracks = ukeTracksClean(out.tracks);
    // §179: 曲の構成（セクションの名前の並び）と歌詞
    out.arr = [];
    if (Array.isArray(q.arr)) { for (var ai = 0; ai < q.arr.length && out.arr.length < 32; ai++) { if (typeof q.arr[ai] === "string" && q.arr[ai]) { out.arr.push(q.arr[ai].slice(0, 12)); } } }
    out.lyrics = { id: q.lyrics && Number(q.lyrics.id) > 0 ? Number(q.lyrics.id) : 0 };
    out.metronome = !!out.metronome; out.countIn = !!out.countIn; out.loop = !!out.loop; out.backing = out.backing !== false;
    var rows = [], src = Array.isArray(q.rows) ? q.rows : d.rows;
    for (var i = 0; i < src.length && rows.length < UKE_SEQ_MAX_ROWS; i++) {
      var r = src[i];
      if (!r) { continue; }
      if (r.type === "key") { rows.push({ type: "key", semis: Math.max(-11, Math.min(11, Math.round(Number(r.semis) || 0))) }); }
      else if (r.type === "tempo") { rows.push({ type: "tempo", bpm: Math.max(40, Math.min(240, Math.round(Number(r.bpm) || 90))) }); }
      else if (r.type === "sec") { rows.push({ type: "sec", name: String(r.name || "セクション").replace(/[<>&"]/g, "").slice(0, 12) || "セクション" }); }
      else if (r.type === "rest") { rows.push({ type: "rest", len: C.seqLen(r.len).id }); }
      else { rows.push({ type: "chord", name: String(r.name || "").slice(0, 24), len: C.seqLen(r.len).id, pos: ukePosOk(r.pos) ? r.pos : "auto" }); }
    }
    out.rows = rows;
    // §174 v0.93: 区間ループの行の番号（行の範囲に収める）
    var last = Math.max(0, rows.length - 1);
    out.loopOn = !!out.loopOn;
    out.loopA = Math.max(0, Math.min(last, Math.round(Number(out.loopA) || 0)));
    out.loopB = Math.max(0, Math.min(last, Math.round(Number(out.loopB) || 0)));
    return out;
  }
  // §180: 構成どおりの予定の拍 → 書いた行の上の拍（鳴っているブロックがなければ null）
  function ukeArrangedToWritten(arrS, fullS, b) {
    for (var i = 0; i < arrS.rows.length; i++) {
      var r = arrS.rows[i];
      if (ukeIsMark(r.type) || b < r.start - 1e-6 || b >= r.end - 1e-6) { continue; }
      for (var j = 0; j < fullS.rows.length; j++) { if (fullS.rows[j].i === r.i) { return fullS.rows[j].start + (b - r.start); } }
    }
    return null;
  }
  // §179: 長さのない行（転調・テンポ・セクション）
  function ukeIsMark(t) { return t === "key" || t === "tempo" || t === "sec"; }
  // 曲の構成どおりに行を並べた曲（_src にもとの行の番号）。構成が空ならそのまま
  function ukeSeqSections(seq) {
    var secs = [], cur = { name: "はじめ", rows: [] }, i;
    for (i = 0; i < seq.rows.length; i++) {
      if (seq.rows[i].type === "sec") { if (cur.rows.length || cur.name !== "はじめ") { secs.push(cur); } cur = { name: seq.rows[i].name, rows: [i] }; }
      else { cur.rows.push(i); }
    }
    if (cur.rows.length || cur.name !== "はじめ") { secs.push(cur); }
    return secs;
  }
  function ukeSeqExpand(seq) {
    if (!seq.arr || !seq.arr.length) { return seq; }
    var secs = ukeSeqSections(seq), byName = {}, i, j, rows = [], src = [];
    for (i = 0; i < secs.length; i++) { if (!byName[secs[i].name]) { byName[secs[i].name] = secs[i]; } }
    for (i = 0; i < seq.arr.length; i++) {
      var sc = byName[seq.arr[i]];
      if (!sc) { continue; }
      for (j = 0; j < sc.rows.length && rows.length < 512; j++) { rows.push(seq.rows[sc.rows[j]]); src.push(sc.rows[j]); }
    }
    var out = {};
    for (var k in seq) { if (seq.hasOwnProperty(k)) { out[k] = seq[k]; } }
    out.rows = rows;
    out.arr = [];
    out._src = src;
    out.loopOn = false;
    return out;
  }
  // 区間ループがオンなら { seq: 区間だけの曲, offset: はじめの行 }、オフなら null
  function ukeSeqSection(seq) {
    if (!seq.loopOn || !seq.rows.length) { return null; }
    var a = Math.min(seq.loopA, seq.loopB), b = Math.max(seq.loopA, seq.loopB), key = seq.key, i;
    for (i = 0; i < a; i++) { if (seq.rows[i].type === "key") { key += seq.rows[i].semis; } }
    var sub = {};
    for (var k in seq) { if (seq.hasOwnProperty(k)) { sub[k] = seq[k]; } }
    sub.rows = seq.rows.slice(a, b + 1);
    sub.key = key;
    sub.loop = true;
    sub.loopOn = false;
    return { seq: sub, offset: a, a: a, b: b };
  }
  // その行で効いている移調（全体の Key ＋ それより上の転調）
  function ukeSeqSemisAt(seq, row) {
    var n = seq.key;
    for (var i = 0; i < row && i < seq.rows.length; i++) { if (seq.rows[i].type === "key") { n += seq.rows[i].semis; } }
    return n;
  }
  // §174 v0.93: コードを選ぶ画面の状態（開いている行・タブ・辞典の根音と種類）
  var ukePick = { row: -1, tab: "my", root: 0, qual: "maj" };
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
  function ukeResolve(name, semis, lowG, pos) {
    name = String(name || "").trim();
    if (!name) { return null; }
    var key = name + "|" + semis + "|" + (lowG ? 1 : 0) + "|" + (pos || "auto");
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
      var t = C.transpose(sp, semis), vs = ukeVoicePos(t, lowG, pos);
      if (vs.length) { res = { name: C.name(t), shape: vs[0] }; }
    }
    ukeResolveCache[key] = res;
    return res;
  }
  // 行の位置が「自動」なら曲全体のポジション
  function ukeRowPos(seq, row) { return row && ukePosOk(row.pos) ? row.pos : (seq && ukePosOk(seq.pos) ? seq.pos : "auto"); }
  // ---------- §177 v0.96: トラック（ベース・ドラム・パッド）とミキサー ----------
  var UKE_TRACK_IDS = ["uke", "bass", "drum", "pad", "rec1", "rec2", "mel"];
  var UKE_REC_MAX = 3000, UKE_MEL_MAX = 1000;
  var UKE_TRACK_INFO = {
    uke: { name: "&#x1F3B8; ウクレレ", prog: UKE_PROG, vol: 80, voice: "b" },
    bass: { name: "&#x1F3BB; ベース", prog: 32, vol: 80, voice: "p" },
    drum: { name: "&#x1F941; ドラム", prog: 128, vol: 70, voice: "d" },
    pad: { name: "&#x1F3B9; パッド", prog: 48, vol: 45, voice: "c" },
    // §178 v0.97: 録音・メロディ
    rec1: { name: "&#x1F399;&#xFE0F; 録音1", prog: UKE_PROG, vol: 85, voice: "w" },
    rec2: { name: "&#x1F399;&#xFE0F; 録音2", prog: UKE_PROG, vol: 85, voice: "r" },
    mel: { name: "&#x1F3B5; メロディ", prog: 0, vol: 75, voice: "m" }
  };
  function ukeNum(v, lo, hi) { var n = Number(v); return isFinite(n) && n >= lo && n <= hi ? n : null; }
  var UKE_BASS_PATTERNS = [["root", "ルート（伸ばす）"], ["root8", "ルート8分"], ["r5", "ルートと5度"], ["walk", "ウォーキング"]];
  var UKE_WALTZ = { id: "waltz", name: "ワルツ（3拍子）", hits: [[36, [0], 0.7], [42, [4, 8], 0.35], [38, [4, 8], 0.3]] };
  function ukeGrooves() {
    var g = (window.UGMelody && window.UGMelody.grooves) || [];
    var out = [];
    for (var i = 0; i < g.length; i++) { if (g[i].hits) { out.push(g[i]); } }
    out.push(UKE_WALTZ);
    return out;
  }
  function ukeGroove(id) {
    var g = ukeGrooves();
    for (var i = 0; i < g.length; i++) { if (g[i].id === id) { return g[i]; } }
    return g[0] || UKE_WALTZ;
  }
  function ukeTracksClean(t) {
    t = t && typeof t === "object" ? t : {};
    var out = {};
    for (var i = 0; i < UKE_TRACK_IDS.length; i++) {
      var id = UKE_TRACK_IDS[i], d = UKE_TRACK_INFO[id], s0 = t[id] && typeof t[id] === "object" ? t[id] : {};
      var o = {
        on: id === "uke" ? true : !!s0.on,
        vol: Math.max(0, Math.min(100, Math.round(s0.vol === undefined ? d.vol : Number(s0.vol) || 0))),
        mute: !!s0.mute, solo: !!s0.solo,
        pan: [-0.6, 0, 0.6].indexOf(Number(s0.pan)) >= 0 ? Number(s0.pan) : 0
      };
      if (id !== "drum") { o.prog = Math.max(0, Math.min(127, Math.round(s0.prog === undefined ? d.prog : Number(s0.prog) || 0))); }
      if (id === "bass") { o.pattern = UKE_BASS_PATTERNS.some(function (p) { return p[0] === s0.pattern; }) ? s0.pattern : "root"; }
      if (id === "drum") { o.groove = typeof s0.groove === "string" && s0.groove ? s0.groove : "8beat"; }
      if (id === "rec1" || id === "rec2") {
        o.quant = s0.quant === "8" || s0.quant === "16" ? s0.quant : "off";
        o.notes = [];
        var rn = Array.isArray(s0.notes) ? s0.notes : [];
        for (var j = 0; j < rn.length && o.notes.length < UKE_REC_MAX; j++) {
          var b0 = rn[j] && ukeNum(rn[j][0], 0, 4096), m0 = rn[j] && ukeNum(rn[j][1], 0, 127), l0 = rn[j] && ukeNum(rn[j][2], 0, 1);
          if (b0 !== null && m0 !== null) { o.notes.push([b0, Math.round(m0), l0 === null ? 0.8 : l0]); }
        }
      }
      if (id === "mel") {
        o.notes = [];
        var mn = Array.isArray(s0.notes) ? s0.notes : [];
        for (var q = 0; q < mn.length && o.notes.length < UKE_MEL_MAX; q++) {
          var b1 = mn[q] && ukeNum(mn[q][0], 0, 4096), d1 = mn[q] && ukeNum(mn[q][1], 0.0625, 32), m1 = mn[q] && ukeNum(mn[q][2], 0, 127);
          if (b1 !== null && d1 !== null && m1 !== null) { o.notes.push([b1, d1, Math.round(m1)]); }
        }
      }
      out[id] = o;
    }
    return out;
  }
  // そのトラックが鳴るか（オン・ミュートでない・ソロがあればソロ）
  function ukeTrackAudible(tracks, id) {
    var t = tracks[id];
    if (!t || !t.on || t.mute) { return false; }
    for (var i = 0; i < UKE_TRACK_IDS.length; i++) { var o = tracks[UKE_TRACK_IDS[i]]; if (o.on && o.solo) { return !!t.solo; } }
    return true;
  }
  // 行のコード → { root, bass, pcs }（★マイコードは押さえ方から名前を当てる）
  function ukeRowHarmony(row, lowG) {
    var sp = row.name ? C.parse(String(row.name).replace(/^★.*$/, "")) : null;
    if (!sp && row.shape) { var d = C.detect(row.shape, { lowG: lowG, preferred: UKE_PREFERRED }); sp = d && d.spec; }
    if (!sp) { return null; }
    return { root: sp.root, bass: sp.bass === null || sp.bass === undefined ? sp.root : sp.bass, pcs: C.pcs(sp), parts: sp.parts };
  }
  function ukeBassMidi(pc) { var m = 36 + C.pcOf(pc); return m < 40 ? m + 12 : m; }
  // ほかのトラックの音（{ t, kind: "note" | "drum", track, midi, level }）を作る
  function ukeTrackEvents(seq, sched, lowG) {
    var tr = seq.tracks, out = [], tm = sched.tm, i, b, k, rows = sched.rows, meter = sched.meter;
    if (!tm) { return out; }
    var chordRows = [];
    for (i = 0; i < rows.length; i++) { if (rows[i].type === "chord" && rows[i].ok) { chordRows.push(rows[i]); } }
    for (i = 0; i < chordRows.length; i++) {
      var r = chordRows[i], hm = ukeRowHarmony(r, lowG);
      if (!hm) { continue; }
      var next = chordRows[i + 1] ? ukeRowHarmony(chordRows[i + 1], lowG) : null;
      if (tr.bass.on) {
        // 3度は根音の上、5度は高くなりすぎるときは根音の下（E2〜G3 におさめる）
        var root = ukeBassMidi(hm.bass), fifth = root + 7 > 52 ? root - 5 : root + 7, pat = tr.bass.pattern;
        var third = root + (hm.parts.indexOf("m") >= 0 || hm.parts.indexOf("dim") >= 0 || hm.parts.indexOf("dim7") >= 0 ? 3 : 4);
        if (pat === "root") {
          out.push({ t: tm(r.start), kind: "note", track: "bass", midi: root, level: 0.9 });
          for (b = Math.ceil(r.start / meter + 1e-6) * meter; b < r.end - 1e-6; b += meter) { out.push({ t: tm(b), kind: "note", track: "bass", midi: root, level: 0.75 }); }
        } else {
          var unit = pat === "root8" ? 0.5 : 1;
          for (k = 0; r.start + k * unit < r.end - 1e-6; k++) {
            var p = r.start + k * unit, m = root;
            if (pat === "r5") { m = k % 2 === 0 ? root : fifth; }
            if (pat === "walk") {
              var left = r.end - p;
              m = [root, third, fifth, fifth][k % 4];
              // 次のコードの直前の拍は、次の根音へ半音で近づく
              if (left <= 1 + 1e-6 && next) { var nr = ukeBassMidi(next.bass); m = nr - 1 >= 40 ? nr - 1 : nr + 1; }
            }
            out.push({ t: tm(p), kind: "note", track: "bass", midi: m, level: k === 0 ? 0.9 : 0.75 });
          }
        }
      }
      if (tr.pad.on) {
        var notes = [];
        for (k = 0; k < hm.pcs.length && notes.length < 4; k++) { var nm = 57 + C.pcOf(hm.pcs[k] - 57); if (notes.indexOf(nm) < 0) { notes.push(nm); } }
        for (b = r.start; b < r.end - 1e-6; b += 2) {
          for (k = 0; k < notes.length; k++) { out.push({ t: tm(b), kind: "note", track: "pad", midi: notes[k], level: 0.5 }); }
        }
      }
    }
    // §178: 録音（クオンタイズなし＝録ったタイミングのまま / あり＝そろえてスイング）・メロディ
    for (var ri = 0; ri < 2; ri++) {
      var rid = ri === 0 ? "rec1" : "rec2", rt = tr[rid];
      if (!rt || !rt.on || !rt.notes) { continue; }
      var gq = rt.quant === "8" ? 0.5 : (rt.quant === "16" ? 0.25 : 0);
      for (k = 0; k < rt.notes.length; k++) {
        var nb = rt.notes[k][0];
        if (gq) { nb = Math.round(nb / gq) * gq; }
        if (nb > sched.beats + 1) { continue; }
        out.push({ t: gq ? tm(nb) : (sched.tmRaw ? sched.tmRaw(nb) : sched.lead + nb * sched.spb), kind: "note", track: rid, midi: rt.notes[k][1], level: rt.notes[k][2], beat: nb });
      }
    }
    if (tr.mel && tr.mel.on && tr.mel.notes) {
      for (k = 0; k < tr.mel.notes.length; k++) {
        var mnote = tr.mel.notes[k];
        out.push({ t: tm(mnote[0]), kind: "note", track: "mel", midi: mnote[2], level: 0.8, beat: mnote[0], dur: mnote[1] });
      }
    }
    if (tr.drum.on && sched.beats > 0) {
      var g = ukeGroove(tr.drum.groove), steps = meter * 4;
      for (var bar = 0; bar * meter < sched.beats - 1e-6; bar++) {
        for (k = 0; k < g.hits.length; k++) {
          for (var h = 0; h < g.hits[k][1].length; h++) {
            var st = g.hits[k][1][h];
            if (st >= steps) { continue; }
            var pos = bar * meter + st / 4;
            if (pos >= sched.beats - 1e-6) { continue; }
            out.push({ t: tm(pos), kind: "drum", track: "drum", midi: g.hits[k][0], level: g.hits[k][2] });
          }
        }
      }
    }
    return out;
  }
  // ミキサー: トラックごとの出口（GainNode → StereoPanner → 全体の出口）
  function ukeMixer(UG, ac, tracks) {
    var bus = (UG.audio && UG.audio.ctx === ac && UG.audio.bus) ? UG.audio.bus : ac.destination, mix = {};
    for (var i = 0; i < UKE_TRACK_IDS.length; i++) {
      var id = UKE_TRACK_IDS[i], g = ac.createGain(), pn = null;
      g.gain.value = ukeTrackAudible(tracks, id) ? tracks[id].vol / 100 : 0;
      if (ac.createStereoPanner) { try { pn = ac.createStereoPanner(); pn.pan.value = tracks[id].pan; g.connect(pn); pn.connect(bus); } catch (e) { pn = null; } }
      if (!pn) { g.connect(bus); }
      mix[id] = { g: g, pn: pn };
    }
    return mix;
  }
  function ukeMixerUpdate(mix, tracks) {
    if (!mix) { return; }
    for (var i = 0; i < UKE_TRACK_IDS.length; i++) {
      var id = UKE_TRACK_IDS[i];
      if (!mix[id]) { continue; }
      try { mix[id].g.gain.value = ukeTrackAudible(tracks, id) ? tracks[id].vol / 100 : 0; } catch (e) {}
      if (mix[id].pn) { try { mix[id].pn.pan.value = tracks[id].pan; } catch (e2) {} }
    }
  }

  function ukeSeqSchedule(seq, lowG) {
    var sc = C.schedule(seq, function (n, s, row) { return ukeResolve(n, s, lowG, ukeRowPos(seq, row)); });
    var tracks = seq.tracks || ukeTracksClean(null), i;
    if (seq._src) { for (i = 0; i < sc.rows.length; i++) { sc.rows[i].i = seq._src[sc.rows[i].i]; } }
    for (i = 0; i < sc.events.length; i++) { if (sc.events[i].kind !== "click") { sc.events[i].track = "uke"; } }
    var more = ukeTrackEvents({ tracks: tracks }, sc, lowG);
    if (more.length) {
      sc.events = sc.events.concat(more);
      sc.events.sort(function (a, b) { return a.t - b.t; });
    }
    sc.tracks = tracks;
    return sc;
  }
  // プリセット（§168 の進行＋ブルース・ii-V-I）
  function ukeSeqPresets() {
    var out = [], i;
    for (i = 0; i < UKE_PROGRESSIONS.length; i++) {
      var pg = UKE_PROGRESSIONS[i];
      out.push({ id: pg.id, name: pg.name, chords: pg.chords, len: "w", style: pg.style || "e", swing: pg.swing || 0.5, bpm: pg.bpm || 90 });
    }
    return out;
  }
  // 1つの音・ストロークを予約して鳴らす
  // mix（省略可）: ミキサーのトラックの出口。tracks: 音色を決める
  function ukeSeqPlayEvent(UG, ac, ev, when, lowG, level, outs, mix, tracks) {
    if (ev.kind === "click") { try { UG.drum(ac, ev.accent ? 76 : 77, when, ev.accent ? 0.55 : 0.35); } catch (e) {} return; }
    var lv = level || 0.8, tb = mix && mix[ev.track || "uke"] ? mix[ev.track || "uke"].g : null;
    var tprog = tracks && tracks[ev.track || "uke"] ? tracks[ev.track || "uke"].prog : undefined;
    if (ev.kind === "note") {
      try {
        var ng = ac.createGain();
        ng.gain.value = ev.level;
        ng.connect(tb || ((UG.audio && UG.audio.bus) || ac.destination));
        UG.synth(ev.midi, tprog === undefined ? 0 : tprog, when, 1, ng);
      } catch (e5) {}
      return;
    }
    if (ev.kind === "drum") { try { UG.drum(ac, ev.midi, when, ev.level, tb || undefined); } catch (e6) {} return; }
    if (ev.kind === "pluck") { ukeNote(UG, ac, outs, ev.string, ev.shape[ev.string], when, lv, lowG, tb, tprog); return; }
    if (ev.kind === "chuck") {
      // ブラッシング: 鳴っている弦を止めて、短い「チャッ」
      for (var c = 0; c < 4; c++) { if (outs && outs[c]) { ukeStringOut(UG, ac, outs, c, when, 0.0001, tb); } }
      try { UG.drum(ac, 37, when, lv * 0.6, tb || undefined); } catch (e4) {}
      return;
    }
    for (var i = 0; i < 4; i++) {
      var s = ev.dir === "up" ? 3 - i : i;
      ukeNote(UG, ac, outs, s, ev.shape[s], when + i * 0.012, ev.dir === "up" ? lv * 0.7 : lv, lowG, tb, tprog);
    }
  }
  // 設定画面の再生（25ms ごとに 120ms 先まで予約）
  var ukeSeqPlayer = null;
  // §178: ゲームが止まるとき（やめる）に録音を保存する
  var ukeRecFlush = null;
  I.addStopHook(function () { if (ukeRecFlush) { var f = ukeRecFlush; ukeRecFlush = null; try { f(); } catch (e) {} } });
  function ukeSeqStop() {
    if (ukeSeqPlayer) { clearInterval(ukeSeqPlayer.timer); ukeSeqPlayer = null; }
  }
  I.addStopHook(ukeSeqStop);
  function ukeSeqStart(seq, lowG, onRow, onTick) {
    ukeSeqStop();
    var UG = window.UGMelody;
    if (!UG) { return false; }
    var ac = UG.audioInit();
    if (!ac) { return false; }
    try { UG.loadSamples([UKE_PROG]); } catch (e) {}
    var sched = ukeSeqSchedule(seq, lowG);
    if (!sched.events.length) { return false; }
    var pl = { sched: sched, startAt: ac.currentTime + 0.1, idx: 0, off: 0, row: -2, seq: seq, outs: [null, null, null, null], mix: ukeMixer(UG, ac, sched.tracks) };
    var progs = [UKE_PROG];
    for (var ti = 0; ti < UKE_TRACK_IDS.length; ti++) { var tt = sched.tracks[UKE_TRACK_IDS[ti]]; if (tt.on && tt.prog !== undefined) { progs.push(tt.prog); } }
    try { UG.loadSamples(progs); } catch (e3) {}
    pl.timer = setInterval(function () {
      var now = ac.currentTime - pl.startAt, ev;
      while (pl.idx < sched.events.length && (ev = sched.events[pl.idx]).t + pl.off < now + 0.12) {
        ukeSeqPlayEvent(UG, ac, ev, pl.startAt + pl.off + ev.t, lowG, 0.8, pl.outs, pl.mix, sched.tracks);
        pl.idx++;
      }
      if (pl.idx >= sched.events.length && now >= pl.off + sched.time) {
        if (!seq.loop) { ukeSeqStop(); if (onRow) { onRow(-1, null); } if (onTick) { onTick(null); } return; }
        // くりかえし: カウントインは飛ばす
        pl.off += sched.time - sched.lead;
        pl.idx = 0;
        while (pl.idx < sched.events.length && sched.events[pl.idx].t < sched.lead - 1e-6) { pl.idx++; }
      }
      var cur = -1;
      for (var i = 0; i < sched.rows.length; i++) {
        var r = sched.rows[i];
        if (!ukeIsMark(r.type) && now >= r.t0 + pl.off && now < r.t1 + pl.off) { cur = i; break; }
      }
      if (cur !== pl.row) { pl.row = cur; if (onRow) { onRow(cur >= 0 ? sched.rows[cur].i : -1, cur >= 0 ? sched.rows[cur] : null); } }
      if (onTick) { onTick(ukeTimeToBeat(sched, now - pl.off)); }
    }, 25);
    ukeSeqPlayer = pl;
    return true;
  }

  // §172 v0.91: 曲 → メロディくずしの録音と同じ形（MIDI・WAV の書き出しに使う）
  function ukeSeqRec(seq, lowG) {
    var sc = ukeSeqSchedule(ukeSeqExpand(seq), lowG), notes = [], i, k;
    for (i = 0; i < sc.events.length; i++) {
      var ev = sc.events[i], ms = Math.round((ev.t - sc.lead) * 1000);
      if (ev.kind !== "click" && !ukeTrackAudible(sc.tracks, ev.track || "uke")) { continue; }
      if (ev.kind === "note" || ev.kind === "drum") {
        notes.push([ms, ev.midi, UKE_TRACK_INFO[ev.track].voice, ev.level]);
      } else if (ev.kind === "pluck") {
        if (ev.shape[ev.string] !== null) { notes.push([ms, ukeMidi(ev.string, ev.shape[ev.string], lowG), "b", 0.85]); }
      } else if (ev.kind === "strum") {
        for (k = 0; k < 4; k++) {
          var st = ev.dir === "up" ? 3 - k : k;
          if (ev.shape[st] !== null) { notes.push([ms + k * 12, ukeMidi(st, ev.shape[st], lowG), "b", ev.dir === "up" ? 0.65 : 0.9]); }
        }
      }
    }
    var tr = sc.tracks;
    return { id: Date.now(), date: Date.now(), notes: notes, prog: { b: tr.uke.prog, p: tr.bass.prog, c: tr.pad.prog, d: 128, w: tr.rec1.prog, r: tr.rec2.prog, m: tr.mel.prog }, fxRev: 1 };
  }
  function ukeFileStamp() {
    var d = new Date(), z = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + "-" + z(d.getHours()) + z(d.getMinutes());
  }
  // §179 v0.98: SMF フォーマット1（トラックごとの MTrk・テンポ・音の長さ・歌詞）
  var UKE_MIDI_CH = { uke: 0, bass: 1, rec1: 2, mel: 6, pad: 4, rec2: 5, drum: 9 };
  var UKE_MIDI_NAMES = { uke: "Ukulele", bass: "Bass", drum: "Drums", pad: "Pad", rec1: "Rec 1", rec2: "Rec 2", mel: "Melody" };
  function ukeUtf8(str) { var u = unescape(encodeURIComponent(String(str))), out = []; for (var i = 0; i < u.length; i++) { out.push(u.charCodeAt(i)); } return out; }
  function ukeVlq(n) { var b = [n & 0x7F]; n = Math.floor(n / 128); while (n > 0) { b.unshift((n & 0x7F) | 0x80); n = Math.floor(n / 128); } return b; }
  function ukeMtrk(evs) {
    // evs: [tick, 順番, bytes]
    evs.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    var d = [], last = 0, i;
    for (i = 0; i < evs.length; i++) { d = d.concat(ukeVlq(Math.max(0, evs[i][0] - last))); last = Math.max(last, evs[i][0]); d = d.concat(evs[i][2]); }
    d.push(0x00, 0xFF, 0x2F, 0x00);
    return [0x4D, 0x54, 0x72, 0x6B, (d.length >>> 24) & 255, (d.length >>> 16) & 255, (d.length >>> 8) & 255, d.length & 255].concat(d);
  }
  function ukeMidiBytes(seq, lowG) {
    var full = ukeSeqExpand(seq), sc = ukeSeqSchedule(full, lowG), TPQ = 480, tr = sc.tracks, i, k;
    var tick = function (t) { return Math.max(0, Math.round((sc.beatAt ? sc.beatAt(t) : (t - sc.lead) / sc.spb) * TPQ)); };
    var per = {}, lastOn = {};
    function add(id, t, midi, lv, dur) {
      if (!per[id]) { per[id] = []; }
      per[id].push({ t: t, m: Math.max(0, Math.min(127, Math.round(midi))), v: Math.max(1, Math.min(127, Math.round(10 + 110 * (lv || 0.8)))), d: dur });
    }
    for (i = 0; i < sc.events.length; i++) {
      var ev = sc.events[i], id = ev.track || "uke";
      if (ev.kind === "click" || ev.kind === "chuck" || !ukeTrackAudible(tr, id)) { continue; }
      if (ev.kind === "strum" || ev.kind === "pluck") {
        var strs = ev.kind === "pluck" ? [ev.string] : (ev.dir === "up" ? [3, 2, 1, 0] : [0, 1, 2, 3]);
        for (k = 0; k < strs.length; k++) {
          if (ev.shape[strs[k]] === null) { continue; }
          var t0 = ev.t + k * 0.012, key = "s" + strs[k];
          // 同じ弦の前の音はここで止まる
          if (lastOn[key]) { lastOn[key].d = Math.min(lastOn[key].d, t0 - lastOn[key].t); }
          add("uke", t0, ukeMidi(strs[k], ev.shape[strs[k]], lowG), ev.dir === "up" ? 0.65 : 0.9, 2);
          lastOn[key] = per.uke[per.uke.length - 1];
        }
      } else if (ev.kind === "note") {
        var dur = id === "mel" ? (sc.tm(ev.beat + (ev.dur || 0.5)) - sc.tm(ev.beat)) : (id === "pad" ? 2 * sc.spb : (id === "bass" ? 4 * sc.spb : 0.4));
        if (id === "bass" && lastOn.bass) { lastOn.bass.d = Math.min(lastOn.bass.d, ev.t - lastOn.bass.t); }
        add(id, ev.t, ev.midi, ev.level, dur);
        if (id === "bass") { lastOn.bass = per.bass[per.bass.length - 1]; }
      } else if (ev.kind === "drum") { add("drum", ev.t, ev.midi, ev.level, 0.1); }
    }
    var mtrks = [], cond = [];
    // 道具トラック: 曲名・拍子・テンポ（テンポの区切りごと）
    cond.push([0, 0, [0xFF, 0x03].concat(ukeVlq(ukeUtf8("Ultimate Gorilla Ukulele").length), ukeUtf8("Ultimate Gorilla Ukulele"))]);
    cond.push([0, 0, [0xFF, 0x58, 0x04, sc.meter, 2, 24, 8]]);
    for (i = 0; i < sc.segs.length; i++) {
      var us = Math.round(sc.segs[i].spb * 1000000);
      cond.push([Math.round(sc.segs[i].b0 * TPQ), 1, [0xFF, 0x51, 0x03, (us >> 16) & 255, (us >> 8) & 255, us & 255]]);
    }
    mtrks.push(ukeMtrk(cond));
    for (i = 0; i < UKE_TRACK_IDS.length; i++) {
      var tid = UKE_TRACK_IDS[i], notes = per[tid];
      if (!notes || !notes.length) { continue; }
      var ch = UKE_MIDI_CH[tid], ev2 = [], nm = ukeUtf8(UKE_MIDI_NAMES[tid]);
      ev2.push([0, 0, [0xFF, 0x03].concat(ukeVlq(nm.length), nm)]);
      if (tid !== "drum") { ev2.push([0, 1, [0xC0 | ch, tr[tid].prog]]); }
      ev2.push([0, 1, [0xB0 | ch, 7, Math.round(tr[tid].vol * 1.27)]]);
      ev2.push([0, 1, [0xB0 | ch, 10, Math.round(64 + tr[tid].pan * 63)]]);
      for (k = 0; k < notes.length; k++) {
        var on = tick(notes[k].t), off = Math.max(on + 1, tick(notes[k].t + Math.max(0.03, notes[k].d)));
        ev2.push([on, 3, [0x90 | ch, notes[k].m, notes[k].v]]);
        ev2.push([off, 2, [0x80 | ch, notes[k].m, 0]]);
      }
      mtrks.push(ukeMtrk(ev2));
    }
    var lp = ukeLyricPlace(full, sc);
    if (lp.length) {
      var le = [[0, 0, [0xFF, 0x03].concat(ukeVlq(ukeUtf8("Lyrics").length), ukeUtf8("Lyrics"))]];
      for (i = 0; i < lp.length; i++) { var lw = ukeUtf8(lp[i].w); le.push([Math.round(lp[i].beat * TPQ), 1, [0xFF, 0x05].concat(ukeVlq(lw.length), lw)]); }
      mtrks.push(ukeMtrk(le));
    }
    var head = [0x4D, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, mtrks.length, (TPQ >> 8) & 255, TPQ & 255], out = head;
    for (i = 0; i < mtrks.length; i++) { out = out.concat(mtrks[i]); }
    return mtrks.length > 1 ? out : null;
  }
  function ukeSeqExportMidi(seq, lowG) {
    var bytes = ukeMidiBytes(seq, lowG);
    if (!bytes) { return "fail"; }
    return I.saveBlob(new Blob([new Uint8Array(bytes)], { type: "audio/midi" }), "ukulele-" + ukeFileStamp() + ".mid");
  }
  // §179: プロジェクトのファイル（曲＋マイコード）
  var UKE_PROJECT_TYPE = "ultimate-gorilla-ukulele-project";
  function ukeProjectJson(seq) {
    return JSON.stringify({ type: UKE_PROJECT_TYPE, version: 1, saved: Date.now(), song: ukeSeqClean(seq), myChords: ukeLoadMy() });
  }
  function ukeProjectRead(text) {
    var o;
    try { o = JSON.parse(text); } catch (e) { return null; }
    if (!o || o.type !== UKE_PROJECT_TYPE || !o.song) { return null; }
    var added = 0;
    if (Array.isArray(o.myChords)) {
      var have = ukeLoadMy(), names = {};
      for (var i = 0; i < have.length; i++) { names[have[i].name] = true; }
      for (i = 0; i < o.myChords.length; i++) {
        var c = o.myChords[i];
        if (c && typeof c.name === "string" && c.shape && c.shape.length === 4 && !names[c.name] && ukeAddMy(c.name.slice(0, 24), c.shape.slice(0, 4), c.src || "ファイル")) { names[c.name] = true; added++; }
      }
    }
    return { seq: ukeSeqClean(o.song), added: added };
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
    var ps = [];
    for (var k in rec.prog) { if (rec.prog.hasOwnProperty(k) && rec.prog[k] < 128) { ps.push(rec.prog[k]); } }
    UG.loadSamples(ps, go);
    setTimeout(go, 8000);
  }

  function ukePickItem(name, label, shape) {
    var n = I.escHtml(name);
    return '<span class="uke-pick-item"><button class="arcade-mini-btn" data-pplay="' + n + '" title="試し聴き">&#x25B6;&#xFE0F;</button>' +
      '<button class="uke-chip" data-pset="' + n + '">' + (label || n) + (shape ? ' <span class="uke-role">' + shape.join("-") + '</span>' : '') + '</button></span>';
  }
  function ukePickHtml(seq, row) {
    var h = '<div class="uke-pick" data-row="' + row + '">', i, semis = ukeSeqSemisAt(seq, row), my = ukeLoadMy();
    h += '<div class="uke-pick-head"><span class="uke-label">' + (row + 1) + '行目のコードを選ぶ' + (semis ? '（この行の Key ' + (semis > 0 ? "+" : "") + semis + '）' : '') + '</span>' +
      '<button class="arcade-mini-btn" data-seq="pickClose" title="閉じる">&#x2716;&#xFE0F;</button></div>';
    h += ukeChips([{ v: "my", t: "&#x2B50; マイコード（" + my.length + "）" }, { v: "common", t: "&#x1F3B5; よく使う" }, { v: "dict", t: "&#x1F4DA; 辞典で選ぶ" }],
      function (v) { return v === ukePick.tab; }, "ptab");
    h += '<div class="uke-pick-list">';
    if (ukePick.tab === "my") {
      if (!my.length) { h += '<p class="small" style="color:#6c757d;">マイコードがありません。上の「カスタム」や「コード辞典」で ⭐ 追加 すると、ここに出ます。</p>'; }
      for (i = 0; i < my.length; i++) { h += ukePickItem("★" + my[i].name, "&#x2B50;" + I.escHtml(my[i].name), my[i].shape); }
    } else if (ukePick.tab === "common") {
      for (i = 0; i < UKE_SEQ_PALETTE.length; i++) { h += ukePickItem(UKE_SEQ_PALETTE[i]); }
    } else {
      h += '</div><div class="uke-label">根音</div>' + ukeChips(ukeRootItems(), function (v) { return v === ukePick.root; }, "pr") +
        '<div class="uke-label">種類</div>' + ukeChips(C.QUALITIES.map(function (q) { return { v: q.id, t: q.label }; }), function (v) { return v === ukePick.qual; }, "pq") + '<div class="uke-pick-list">';
      var parts = [];
      for (i = 0; i < C.QUALITIES.length; i++) { if (C.QUALITIES[i].id === ukePick.qual) { parts = C.QUALITIES[i].parts; } }
      var nm = C.name({ root: ukePick.root, parts: parts, bass: null }), rs = ukeResolve(nm, 0, false);
      h += ukePickItem(nm, '<b>' + I.escHtml(nm) + '</b> を入れる', rs ? rs.shape : null);
    }
    return h + '</div></div>';
  }

  // ---------- §176 v0.95: タイムライン・元に戻す ----------
  var UKE_TL_ZOOMS = [10, 16, 24, 36, 54], UKE_TL_H = 150, UKE_TL_RULER = 18, UKE_TL_LANE0 = 22, UKE_TL_LANE1 = 84, UKE_TL_FLAG = 92;
  var ukeTl = { view: "tl", zoom: 2, scroll: 0, sel: -1, snap: 0.5, play: null, redraw: null };
  var ukeHist = { undo: [], redo: [], last: null };
  var ukeClip = null;
  function ukeTlPpb() { return UKE_TL_ZOOMS[ukeTl.zoom] || 24; }
  function ukeRootColor(name, ok) {
    var sp = C.parse(String(name || "").replace(/^★/, ""));
    if (!ok) { return "#6c3a3a"; }
    if (!sp) { return "#8e7cc3"; } // ★マイコードなど
    return "hsl(" + ((sp.root * 30) % 360) + ",55%,42%)";
  }
  // 曲の時間（秒）→ 拍（行の中は直線で近似）
  function ukeTimeToBeat(sched, t) {
    var rows = sched.rows, last = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (ukeIsMark(r.type)) { continue; }
      if (t < r.t0) { return i === 0 || last === 0 ? Math.max(0, r.start - (r.t0 - t) / sched.spb) : r.start; }
      if (t < r.t1) { return r.start + (t - r.t0) / Math.max(1e-6, r.t1 - r.t0) * (r.end - r.start); }
      last = r.end;
    }
    return last;
  }
  // 拍の位置にあるブロック（コード・休符）の行番号。なければ -1
  function ukeRowAtBeat(sched, b) {
    for (var i = 0; i < sched.rows.length; i++) {
      var r = sched.rows[i];
      if (!ukeIsMark(r.type) && b >= r.start - 1e-6 && b < r.end - 1e-6) { return r.i; }
    }
    return -1;
  }
  function ukeTlLanes(seq) {
    var l = [], t = seq.tracks;
    if (!t) { return l; }
    if (t.bass.on) { l.push("bass"); }
    if (t.drum.on) { l.push("drum"); }
    if (t.rec1.on && t.rec1.notes.length) { l.push("rec1"); }
    if (t.rec2.on && t.rec2.notes.length) { l.push("rec2"); }
    if (t.mel.on && t.mel.notes.length) { l.push("mel"); }
    return l;
  }
  var UKE_LANE_NAMES = { bass: "ベース", drum: "ドラム", rec1: "録音1", rec2: "録音2", mel: "メロディ" };
  function ukeTlHeight(seq) { return UKE_TL_H + ukeTlLanes(seq).length * 18; }
  function ukeTlDraw(cv, seq, sched, tmp) {
    if (!cv || !cv.getContext) { return; }
    var w = cv.clientWidth || 330, k = 2, ctx = cv.getContext("2d"), ppb = ukeTlPpb(), meter = seq.meter === 3 ? 3 : 4, i, TH = ukeTlHeight(seq);
    if (cv.width !== w * k || cv.height !== TH * k) { cv.width = w * k; cv.height = TH * k; cv.style.height = TH + "px"; }
    ctx.setTransform(k, 0, 0, k, 0, 0);
    var sx = ukeTl.scroll;
    ctx.fillStyle = "#0b1626"; ctx.fillRect(0, 0, w, TH);
    var total = Math.max(sched.beats, meter * 4);
    // 区間ループの影
    var sec = tmp && tmp.loop ? tmp.loop : null;
    if (!sec && seq.loopOn && sched.rows.length) {
      var ra = null, rb = null;
      for (i = 0; i < sched.rows.length; i++) {
        if (sched.rows[i].i === Math.min(seq.loopA, seq.loopB)) { ra = sched.rows[i]; }
        if (sched.rows[i].i === Math.max(seq.loopA, seq.loopB)) { rb = sched.rows[i]; }
      }
      if (ra && rb) { sec = [ra.start, rb.end]; }
    }
    if (sec) { ctx.fillStyle = "rgba(85,239,196,0.16)"; ctx.fillRect(sec[0] * ppb - sx, 0, (sec[1] - sec[0]) * ppb, TH); ctx.fillStyle = "#55efc4"; ctx.fillRect(sec[0] * ppb - sx, 0, (sec[1] - sec[0]) * ppb, 3); }
    // 目盛り
    ctx.font = "bold 9px sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    for (var b = 0; b <= total + meter; b++) {
      var x = b * ppb - sx;
      if (x < -2 || x > w + 2) { continue; }
      var bar = b % meter === 0;
      ctx.strokeStyle = bar ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.1)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + 0.5, bar ? 4 : 12); ctx.lineTo(x + 0.5, TH); ctx.stroke();
      if (bar) { ctx.fillStyle = "#ffd166"; ctx.fillText(String(b / meter + 1), x + 3, 9); }
    }
    ctx.fillStyle = "rgba(255,255,255,0.06)"; ctx.fillRect(0, 0, w, UKE_TL_RULER);
    // ブロック
    for (i = 0; i < sched.rows.length; i++) {
      var r = sched.rows[i], end = r.end;
      if (tmp && tmp.resize && tmp.resize.i === r.i) { end = r.start + tmp.resize.beats; }
      var x0 = r.start * ppb - sx, x1 = end * ppb - sx;
      if (ukeIsMark(r.type)) {
        var fx = x0 + ukeMarkDx(sched.rows, i);
        if (fx < -40 || fx > w + 4) { continue; }
        var src = seq.rows[r.i] || {}, col = r.type === "key" ? "#ffd166" : (r.type === "tempo" ? "#74b9ff" : "#55efc4");
        var lab = r.type === "key" ? "🔑" + (src.semis > 0 ? "+" : "") + (src.semis || 0) : (r.type === "tempo" ? "⏱" + (src.bpm || "") : "§" + (src.name || "")), fw = ukeMarkW(src);
        ctx.strokeStyle = col; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x0, UKE_TL_LANE0); ctx.lineTo(x0, UKE_TL_FLAG + 8); ctx.stroke();
        ctx.fillStyle = ukeTl.sel === r.i ? col : "rgba(20,24,36,0.92)";
        ctx.fillRect(fx, UKE_TL_FLAG, fw, 14);
        ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.strokeRect(fx, UKE_TL_FLAG, fw, 14);
        ctx.fillStyle = ukeTl.sel === r.i ? "#05060f" : col;
        ctx.save(); ctx.beginPath(); ctx.rect(fx, UKE_TL_FLAG, fw, 14); ctx.clip();
        ctx.fillText(lab, fx + 2, UKE_TL_FLAG + 7);
        ctx.restore();
        continue;
      }
      if (x1 < 0 || x0 > w) { continue; }
      ctx.fillStyle = r.type === "rest" ? "#2d3436" : ukeRootColor(seq.rows[r.i] ? seq.rows[r.i].name : r.name, r.ok);
      ctx.fillRect(x0 + 1, UKE_TL_LANE0, Math.max(2, x1 - x0 - 2), UKE_TL_LANE1 - UKE_TL_LANE0);
      ctx.save();
      ctx.beginPath(); ctx.rect(x0 + 1, UKE_TL_LANE0, Math.max(2, x1 - x0 - 2), UKE_TL_LANE1 - UKE_TL_LANE0); ctx.clip();
      ctx.fillStyle = "#ffffff"; ctx.font = "bold 13px sans-serif";
      ctx.fillText(r.type === "rest" ? "休" : r.name, x0 + 5, UKE_TL_LANE0 + 16);
      if (r.type === "chord" && r.shape) { ctx.font = "9px sans-serif"; ctx.fillStyle = "rgba(255,255,255,0.75)"; ctx.fillText(r.shape.join("-"), x0 + 5, UKE_TL_LANE0 + 34); }
      ctx.restore();
      if (ukeTl.sel === r.i) {
        ctx.strokeStyle = "#ffd166"; ctx.lineWidth = 2;
        ctx.strokeRect(x0 + 1, UKE_TL_LANE0, Math.max(2, x1 - x0 - 2), UKE_TL_LANE1 - UKE_TL_LANE0);
        ctx.fillStyle = "#ffd166";
        ctx.fillRect(x1 - 6, UKE_TL_LANE0 + 14, 5, UKE_TL_LANE1 - UKE_TL_LANE0 - 28); // 長さのつまみ
      }
    }
    // §177: ベース・ドラムのレーン
    var lanes = ukeTlLanes(seq), ly = UKE_TL_FLAG + 18;
    if (lanes.length) {
      var evs = sched.events, tmInv = function (t) { return ukeTimeToBeat(sched, t); };
      for (var li = 0; li < lanes.length; li++) {
        var lid = lanes[li], y0 = ly + li * 18;
        ctx.fillStyle = "rgba(255,255,255,0.04)"; ctx.fillRect(0, y0, w, 16);
        for (var ei = 0; ei < evs.length; ei++) {
          var e2 = evs[ei];
          if (e2.track !== lid) { continue; }
          var ex = tmInv(e2.t) * ppb - sx;
          if (ex < 0 || ex > w) { continue; }
          if (lid === "bass") { ctx.fillStyle = "#74b9ff"; ctx.fillRect(ex, y0 + 14 - (e2.midi - 38) * 0.7, Math.max(3, ppb * 0.4), 2); }
          else if (lid === "rec1" || lid === "rec2" || lid === "mel") {
            ctx.fillStyle = lid === "mel" ? "#fd79a8" : (lid === "rec1" ? "#55efc4" : "#a29bfe");
            ctx.fillRect(ex, y0 + 14 - Math.max(0, Math.min(12, (e2.midi - 55) * 0.4)), lid === "mel" ? Math.max(2, (e2.dur || 0.5) * ppb - 1) : 2, 2);
          }
          else if (e2.midi === 36 || e2.midi === 38 || e2.midi === 37) { ctx.fillStyle = e2.midi === 36 ? "#ff7675" : "#ffd166"; ctx.fillRect(ex, y0 + (e2.midi === 36 ? 9 : 3), 2, 5); }
        }
        // レーンの名前（音の上に重ねて読めるように背景つき）
        ctx.fillStyle = "rgba(11,22,38,0.85)"; ctx.fillRect(0, y0, 36, 16);
        ctx.fillStyle = "#adb5bd"; ctx.font = "8px sans-serif"; ctx.fillText(UKE_LANE_NAMES[lid], 2, y0 + 8);
      }
    }
    // 再生位置
    if (ukeTl.play !== null) {
      var px = ukeTl.play * ppb - sx;
      ctx.strokeStyle = "#ff7675"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, TH); ctx.stroke();
    }
    ctx.fillStyle = "#adb5bd"; ctx.font = "9px sans-serif";
    ctx.fillText("目盛り＝区間ループ / つまみ＝長さ / ドラッグ＝スクロール", 4, TH - 8);
  }
  // 旗の幅（セクションは名前の長さに合わせる）と、同じ拍に重なったときに右へずらす量
  function ukeMarkW(row) { return row && row.type === "sec" ? Math.min(78, 12 + String(row.name || "").length * 10) : 34; }
  function ukeMarkDx(rows, i) {
    var dx = 0;
    for (var j = i - 1; j >= 0 && ukeIsMark(rows[j].type) && Math.abs(rows[j].start - rows[i].start) < 1e-6; j--) { dx += (rows[j].type === "sec" ? Math.min(78, 12 + String(rows[j].name || "").length * 10) : 34) + 2; }
    return dx;
  }
  function ukeTlMaxScroll(cv, sched, seq) {
    var w = (cv && cv.clientWidth) || 330, meter = seq.meter === 3 ? 3 : 4;
    return Math.max(0, (Math.max(sched.beats, meter * 4) + meter) * ukeTlPpb() - w);
  }
  // タイムラインの上の操作
  function ukeTlBindCanvas(cv, seq, sched, act) {
    if (!cv || !cv.addEventListener) { return; }
    var drag = null;
    function pt(ev) {
      var r = cv.getBoundingClientRect(), src = ev.touches && ev.touches[0] ? ev.touches[0] : (ev.changedTouches && ev.changedTouches[0] ? ev.changedTouches[0] : ev);
      return { x: src.clientX - r.left, y: src.clientY - r.top };
    }
    function snapB(b) { var g = ukeTl.snap; return Math.max(0, Math.round(b / g) * g); }
    function down(ev) {
      var p = pt(ev), ppb = ukeTlPpb(), beat = (p.x + ukeTl.scroll) / ppb, i;
      if (ev.cancelable) { ev.preventDefault(); }
      if (p.y < UKE_TL_RULER) { drag = { mode: "loop", b0: beat, b1: beat }; return; }
      if (ukeTl.sel >= 0) {
        for (i = 0; i < sched.rows.length; i++) {
          var rr = sched.rows[i];
          if (rr.i === ukeTl.sel && !ukeIsMark(rr.type) && Math.abs(rr.end * ppb - ukeTl.scroll - p.x) <= 12 && p.y >= UKE_TL_LANE0 && p.y <= UKE_TL_LANE1) {
            drag = { mode: "resize", i: rr.i, start: rr.start, beats: rr.end - rr.start };
            return;
          }
        }
      }
      var hit = -1;
      if (p.y >= UKE_TL_FLAG - 4) {
        for (i = 0; i < sched.rows.length; i++) {
          var mr = sched.rows[i], mx0 = mr.start * ppb - ukeTl.scroll + ukeMarkDx(sched.rows, i);
          if (ukeIsMark(mr.type) && p.x >= mx0 - 4 && p.x <= mx0 + ukeMarkW(mr) + 2) { hit = mr.i; }
        }
      }
      if (hit < 0 && p.y >= UKE_TL_LANE0 && p.y <= UKE_TL_LANE1) { hit = ukeRowAtBeat(sched, beat); }
      drag = { mode: "pan", x0: p.x, s0: ukeTl.scroll, moved: false, hit: hit };
    }
    function move(ev) {
      if (!drag) { return; }
      if (ev.cancelable) { ev.preventDefault(); }
      var p = pt(ev), ppb = ukeTlPpb(), beat = (p.x + ukeTl.scroll) / ppb;
      if (drag.mode === "pan") {
        if (Math.abs(p.x - drag.x0) > 6) { drag.moved = true; }
        if (drag.moved) { ukeTl.scroll = Math.max(0, Math.min(ukeTlMaxScroll(cv, sched, seq), drag.s0 - (p.x - drag.x0))); ukeTlDraw(cv, seq, sched); act("scroll"); }
      } else if (drag.mode === "resize") {
        drag.beats = Math.max(ukeTl.snap, Math.min(32, snapB(beat - drag.start)));
        ukeTlDraw(cv, seq, sched, { resize: { i: drag.i, beats: drag.beats } });
      } else if (drag.mode === "loop") {
        drag.b1 = beat;
        ukeTlDraw(cv, seq, sched, { loop: [Math.min(drag.b0, drag.b1), Math.max(drag.b0, drag.b1)] });
      }
    }
    function up() {
      if (!drag) { return; }
      var d = drag;
      drag = null;
      if (d.mode === "pan" && !d.moved) { act("select", d.hit); }
      else if (d.mode === "resize") { act("resize", d.i, d.beats); }
      else if (d.mode === "loop") {
        var a = ukeRowAtBeat(sched, Math.min(d.b0, d.b1)), b = ukeRowAtBeat(sched, Math.max(d.b0, d.b1));
        if (a < 0) { a = 0; }
        if (b < 0) { b = seq.rows.length - 1; }
        act("loop", a, b);
      }
    }
    if (window.PointerEvent) {
      cv.addEventListener("pointerdown", function (ev) { try { cv.setPointerCapture(ev.pointerId); } catch (e) {} down(ev); });
      cv.addEventListener("pointermove", move);
      cv.addEventListener("pointerup", up);
      // §180: 縦スクロールに切りかわったら、その操作は取り消す
      cv.addEventListener("pointercancel", function () { drag = null; ukeTlDraw(cv, seq, sched); });
    } else {
      cv.addEventListener("touchstart", down, { passive: false });
      cv.addEventListener("touchmove", move, { passive: false });
      cv.addEventListener("touchend", up);
      cv.addEventListener("mousedown", down);
      cv.addEventListener("mousemove", move);
      cv.addEventListener("mouseup", up);
    }
  }
  // 表示の切りかえ・元に戻す・ズーム・グリッド
  var UKE_SEC_NAMES = ["イントロ", "Aメロ", "Bメロ", "サビ", "間奏", "アウトロ"];
  function ukeSecInput(i, name) {
    var h = '<input type="text" class="uke-seq-secname" data-row="' + i + '" maxlength="12" value="' + I.escHtml(name) + '" list="uke-sec-names">';
    return h;
  }
  function ukeTlBar() {
    return '<div class="uke-tl-bar">' +
      ukeChips([{ v: "tl", t: "&#x1F39E;&#xFE0F; タイムライン" }, { v: "list", t: "&#x1F4CB; リスト" }], function (v) { return v === ukeTl.view; }, "tlview") +
      '<span class="uke-tl-undo"><button class="arcade-mini-btn" data-seq="undo" title="元に戻す"' + (ukeHist.undo.length ? "" : " disabled") + '>&#x21B6;</button>' +
      '<button class="arcade-mini-btn" data-seq="redo" title="やり直す"' + (ukeHist.redo.length ? "" : " disabled") + '>&#x21B7;</button></span></div>';
  }
  function ukeTlHtml(seq, sched, lenOpts, semiOpts, sel) {
    var h = '<div class="uke-tl-tools"><span class="uke-label">ズーム</span><button class="arcade-mini-btn" data-tl="zoomOut">&#xFF0D;</button><button class="arcade-mini-btn" data-tl="zoomIn">&#xFF0B;</button>' +
      '<span class="uke-label">グリッド</span>' + sel('class="uke-tl-snap"', [[1, "1拍"], [0.5, "1/2拍"], [0.25, "1/4拍"]], ukeTl.snap) + '</div>' +
      '<canvas class="uke-tl"></canvas>';
    var i = ukeTl.sel, r = seq.rows[i];
    if (!r) { ukeTl.sel = -1; return h + '<p class="small" style="color:#adb5bd;margin:4px 0;">ブロックをタップすると、ここで名前・長さ・複製などを変えられます。</p>' + (ukeClip ? '<div class="uke-tl-sel"><button class="uke-chip" data-tl="paste">&#x1F4E5; 最後に貼り付け</button></div>' : ''); }
    var info = null;
    for (var j = 0; j < sched.rows.length; j++) { if (sched.rows[j].i === i) { info = sched.rows[j]; } }
    h += '<div class="uke-tl-sel"><div class="uke-seq-row' + (r.type === "chord" ? " chord" : "") + '" data-row="' + i + '"><span class="uke-seq-no">' + (i + 1) + '</span>';
    if (r.type === "chord") {
      var bad = !info || !info.ok;
      h += '<input type="text" class="uke-seq-chord' + (bad ? " bad" : "") + '" data-row="' + i + '" value="' + I.escHtml(r.name) + '" maxlength="24">' +
        '<button class="arcade-mini-btn' + (ukePick.row === i ? " on" : "") + '" data-seq="pick" data-row="' + i + '" title="コードを選ぶ">&#x1F3AF;</button>' +
        '<button class="arcade-mini-btn" data-seq="rowplay" data-row="' + i + '" title="鳴らす">&#x25B6;&#xFE0F;</button>' +
        (r.name.charAt(0) === "★" ? '' : sel('class="uke-seq-pos" data-row="' + i + '"', [["auto", "位置: 全体"], ["low", "ロー"], ["mid", "ミドル"], ["high", "ハイ"]], r.pos)) +
        '<span class="uke-seq-res">' + (bad ? '<span style="color:#ff7675;">？ 読めない名前です</span>' : I.escHtml(info.name) + ' <span class="uke-role">押さえ方 ' + info.shape.join("-") + '</span>') + '</span>';
    } else if (r.type === "rest") {
      h += '<span class="uke-seq-kind">&#x1F92B; 休符</span>';
    } else if (r.type === "tempo") {
      h += '<span class="uke-seq-kind">&#x23F1;&#xFE0F; テンポ</span><input type="number" min="40" max="240" class="uke-seq-bpm" data-row="' + i + '" value="' + r.bpm + '">';
    } else if (r.type === "sec") {
      h += '<span class="uke-seq-kind">&#x1F3F7;&#xFE0F; セクション</span>' + ukeSecInput(i, r.name);
    } else {
      h += '<span class="uke-seq-kind">&#x1F511; 転調</span>' + sel('class="uke-seq-semis" data-row="' + i + '"', semiOpts, r.semis);
    }
    h += '</div><div class="uke-chips">';
    if (!ukeIsMark(r.type)) {
      h += '<span class="uke-label">長さ ' + C.seqLen(r.len).label + '</span><button class="uke-chip" data-tl="shorter">&#xFF0D;</button><button class="uke-chip" data-tl="longer">&#xFF0B;</button>';
    }
    h += '<button class="uke-chip" data-tl="dup">&#x29C9; 複製</button><button class="uke-chip" data-tl="copy">&#x1F4CB; コピー</button>' +
      (ukeClip ? '<button class="uke-chip" data-tl="paste">&#x1F4E5; 貼り付け</button>' : '') +
      '<button class="uke-chip" data-tl="left">&#x25C0;</button><button class="uke-chip" data-tl="right">&#x25B6;</button>' +
      '<button class="uke-chip" data-seq="del" data-row="' + i + '">&#x1F5D1;&#xFE0F; 消す</button></div></div>';
    if (ukePick.row === i && r.type === "chord") { h += ukePickHtml(seq, i); }
    return h;
  }

  // §179 v0.98: 曲の構成
  function ukeArrHtml(seq) {
    var secs = ukeSeqSections(seq), names = [], i, h = '<h4 class="arcade-prize-cat">&#x1F9E9; 曲の構成</h4>';
    for (i = 0; i < secs.length; i++) { if (names.indexOf(secs[i].name) < 0) { names.push(secs[i].name); } }
    if (!seq.rows.some(function (r) { return r.type === "sec"; })) { return h + '<p class="small" style="color:#6c757d;margin:2px 0;">「＋ セクション」で区切りを入れると、イントロ → サビ → … の順番を組めます。</p>'; }
    h += '<div class="uke-label">押した順に並ぶ（空なら書いた順に1回）</div>' + ukeChips(names.map(function (n) { return { v: I.escHtml(n), t: "&#xFF0B; " + I.escHtml(n) }; }), function () { return false; }, "arradd");
    h += '<div class="uke-chips uke-arr">';
    if (!seq.arr.length) { h += '<span class="uke-role">いまは書いた順に1回</span>'; }
    for (i = 0; i < seq.arr.length; i++) { h += '<button class="uke-chip active" data-arrdel="' + i + '" title="外す">' + (i + 1) + '. ' + I.escHtml(seq.arr[i]) + ' &#x2715;</button>'; }
    if (seq.arr.length) { h += '<button class="uke-chip" data-arrclear="1">&#x1F9F9; 空に</button>'; }
    return h + '</div>';
  }
  // §179: 歌詞トラック（歌詞くずしの歌詞ノートから）
  function ukeLyricList() { return (window.UGLyrics && window.UGLyrics.loadSaved) ? window.UGLyrics.loadSaved() : []; }
  function ukeLyricWords(id) {
    var ls = ukeLyricList(), out = [], i, j;
    for (i = 0; i < ls.length; i++) {
      if (ls[i].id !== id) { continue; }
      for (j = 0; j < ls[i].lines.length; j++) { for (var k = 0; k < ls[i].lines[j].words.length; k++) { out.push(ls[i].lines[j].words[k].w); } }
    }
    return out;
  }
  function ukeLyricTitle(rec) {
    var w = [];
    for (var j = 0; j < rec.lines.length && w.length < 3; j++) { for (var k = 0; k < rec.lines[j].words.length && w.length < 3; k++) { w.push(rec.lines[j].words[k].w); } }
    return w.join(" ") || "（空）";
  }
  // 言葉をのせる拍: メロディの音があればそれ、なければコードの拍ごと → [{ beat, t, w }]
  function ukeLyricPlace(seq, sched) {
    if (!seq.lyrics || !seq.lyrics.id) { return []; }
    var words = ukeLyricWords(seq.lyrics.id), slots = [], i, b;
    if (!words.length) { return []; }
    var mel = seq.tracks && seq.tracks.mel;
    if (mel && mel.on && mel.notes.length) { for (i = 0; i < mel.notes.length; i++) { if (slots.indexOf(mel.notes[i][0]) < 0) { slots.push(mel.notes[i][0]); } } slots.sort(function (a, c) { return a - c; }); }
    else {
      for (i = 0; i < sched.rows.length; i++) {
        var r = sched.rows[i];
        if (r.type !== "chord") { continue; }
        for (b = r.start; b < r.end - 1e-6; b += 1) { slots.push(b); }
      }
    }
    var out = [];
    for (i = 0; i < slots.length && i < words.length; i++) { out.push({ beat: slots[i], t: sched.tm ? sched.tm(slots[i]) : 0, w: words[i] }); }
    return out;
  }
  function ukeLyrHtml(seq, sel) {
    var ls = ukeLyricList(), opts = [[0, "なし"]];
    for (var i = 0; i < ls.length; i++) { opts.push([ls[i].id, ukeLyricTitle(ls[i]).slice(0, 18)]); }
    var mel = seq.tracks && seq.tracks.mel && seq.tracks.mel.on && seq.tracks.mel.notes.length;
    return '<h4 class="arcade-prize-cat">&#x1F3A4; 歌詞</h4>' +
      (ls.length ? '<div class="uke-tl-tools"><span class="uke-label">歌詞ノートから</span>' + sel('class="uke-lyr-pick"', opts, seq.lyrics.id) + '</div>' +
        (seq.lyrics.id ? '<p class="small" style="color:#adb5bd;margin:2px 0;">' + (mel ? "メロディの音" : "コードの拍") + 'に1つずつのせて、再生中にカラオケ表示します（' + ukeLyricWords(seq.lyrics.id).length + '語）。</p>' : '')
        : '<p class="small" style="color:#6c757d;margin:2px 0;">歌詞くずしで歌詞を作ると、ここで選べます。</p>');
  }
  function ukeLyrShow(root, places, beat) {
    var el = root.querySelector(".uke-lyr");
    if (!el) { return; }
    if (!places.length || beat === null) { el.innerHTML = ""; return; }
    var cur = -1;
    for (var i = 0; i < places.length; i++) { if (places[i].beat <= beat + 1e-6) { cur = i; } }
    var h = "";
    for (var j = Math.max(0, cur - 2); j < Math.min(places.length, cur + 4); j++) {
      h += '<span class="' + (j === cur ? "now" : (j < cur ? "past" : "")) + '">' + I.escHtml(places[j].w) + '</span> ';
    }
    el.innerHTML = '&#x1F3A4; ' + h;
  }

  // §178 v0.97: ピアノロール（メロディトラック）。横はタイムラインと同じズーム・スクロール
  var UKE_ROLL_ROWS = 16, UKE_ROLL_RH = 10;
  var ukeRoll = { low: 60, len: 0.5, redraw: null };
  function ukeRollHtml(seq, sel) {
    if (!seq.tracks || !seq.tracks.mel.on) { return ""; }
    var recs = (window.UGMelody && window.UGMelody.loadRecs) ? window.UGMelody.loadRecs() : [], ro = [];
    for (var i = 0; i < recs.length; i++) { ro.push([recs[i].id, new Date(recs[i].date).getMonth() + 1 + "/" + new Date(recs[i].date).getDate() + " " + recs[i].notes.length + "音"]); }
    return '<h4 class="arcade-prize-cat">&#x1F3B5; メロディ（ピアノロール）</h4>' +
      '<div class="uke-tl-tools"><span class="uke-label">置く長さ</span>' + sel('class="uke-roll-len"', [[0.25, "1/4拍"], [0.5, "1/2拍"], [1, "1拍"], [2, "2拍"]], ukeRoll.len) +
      '<button class="arcade-mini-btn" data-roll="up" title="音域を上へ">&#x25B2;</button><button class="arcade-mini-btn" data-roll="down" title="音域を下へ">&#x25BC;</button>' +
      '<button class="arcade-mini-btn" data-roll="clear" title="全部消す">&#x1F5D1;&#xFE0F;</button></div>' +
      '<canvas class="uke-roll"></canvas>' +
      '<p class="small" style="color:#adb5bd;margin:2px 0;">空いたマスをタップで音符を置く・音符をタップで消す・横ドラッグでスクロール（' + seq.tracks.mel.notes.length + '音）</p>' +
      (ro.length ? '<div class="uke-tl-tools"><span class="uke-label">メロディくずしの録音</span>' + sel('class="uke-roll-imp"', ro, ro[0][0]) + '<button class="uke-chip" data-roll="import">取り込む</button></div>' : '');
  }
  function ukeRollDraw(cv, seq, sched) {
    if (!cv || !cv.getContext) { return; }
    var w = cv.clientWidth || 330, k = 2, H = UKE_ROLL_ROWS * UKE_ROLL_RH, ctx = cv.getContext("2d"), ppb = ukeTlPpb(), sx = ukeTl.scroll, meter = seq.meter === 3 ? 3 : 4, i;
    if (cv.width !== w * k) { cv.width = w * k; cv.height = H * k; }
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.fillStyle = "#0b1626"; ctx.fillRect(0, 0, w, H);
    for (i = 0; i < UKE_ROLL_ROWS; i++) {
      var m = ukeRoll.low + i, y = H - (i + 1) * UKE_ROLL_RH, black = [1, 3, 6, 8, 10].indexOf(m % 12) >= 0;
      ctx.fillStyle = black ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.03)";
      ctx.fillRect(0, y, w, UKE_ROLL_RH);
      ctx.fillStyle = "rgba(255,255,255,0.06)"; ctx.fillRect(0, y, w, 1);
    }
    var total = Math.max(sched.beats, meter * 4);
    for (var b = 0; b <= total + meter; b++) {
      var x = b * ppb - sx;
      if (x < -2 || x > w + 2) { continue; }
      ctx.fillStyle = b % meter === 0 ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.08)";
      ctx.fillRect(x, 0, 1, H);
    }
    var ns = seq.tracks.mel.notes;
    for (i = 0; i < ns.length; i++) {
      var row = ns[i][2] - ukeRoll.low;
      if (row < 0 || row >= UKE_ROLL_ROWS) { continue; }
      var nx = ns[i][0] * ppb - sx;
      if (nx > w || nx + ns[i][1] * ppb < 0) { continue; }
      ctx.fillStyle = "#fd79a8";
      ctx.fillRect(nx + 1, H - (row + 1) * UKE_ROLL_RH + 1, Math.max(3, ns[i][1] * ppb - 2), UKE_ROLL_RH - 2);
    }
    // 音名（C は強く）
    ctx.font = "8px sans-serif"; ctx.textBaseline = "middle"; ctx.textAlign = "left";
    for (i = 0; i < UKE_ROLL_ROWS; i++) {
      var mm = ukeRoll.low + i, isC = mm % 12 === 0;
      ctx.fillStyle = "rgba(11,22,38,0.8)"; ctx.fillRect(0, H - (i + 1) * UKE_ROLL_RH, 24, UKE_ROLL_RH);
      ctx.fillStyle = isC ? "#ffd166" : "#adb5bd";
      ctx.fillText(ukeNoteName(mm) + (isC ? Math.floor(mm / 12) - 1 : ""), 2, H - (i + 0.5) * UKE_ROLL_RH);
    }
    if (ukeTl.play !== null) { ctx.fillStyle = "#ff7675"; ctx.fillRect(ukeTl.play * ppb - sx, 0, 2, H); }
  }
  function ukeRollBind(root, seq, ctx, save) {
    var cv = root.querySelector("canvas.uke-roll");
    var all = function (sel, ev, fn) { var els = root.querySelectorAll(sel); for (var i = 0; i < els.length; i++) { els[i][ev] = fn; } };
    all("select.uke-roll-len", "onchange", function (ev) { ukeRoll.len = Number(ev.currentTarget.value); });
    all("button[data-roll]", "onclick", function (ev) {
      var a = ev.currentTarget.getAttribute("data-roll");
      if (a === "up") { ukeRoll.low = Math.min(72, ukeRoll.low + 12); ctx.render(); return; }
      if (a === "down") { ukeRoll.low = Math.max(48, ukeRoll.low - 12); ctx.render(); return; }
      if (a === "clear") { seq.tracks.mel.notes = []; save(true); return; }
      if (a === "import") {
        var selEl = root.querySelector("select.uke-roll-imp"), id = selEl ? Number(selEl.value) : 0;
        var n = ukeRollImport(seq, id, ctx.lowG);
        ctx.toast(n ? "&#x1F3B5; メロディくずしの録音から" + n + "音を取り込みました" : "取り込める音がありませんでした");
        if (n) { save(true); }
      }
    });
    if (!cv || !cv.addEventListener) { ukeRoll.redraw = null; return; }
    var sched = ukeSeqSchedule(seq, ctx.lowG), drag = null, H = UKE_ROLL_ROWS * UKE_ROLL_RH;
    function pt(ev) { var r = cv.getBoundingClientRect(), src = ev.changedTouches && ev.changedTouches[0] ? ev.changedTouches[0] : ev; return { x: src.clientX - r.left, y: src.clientY - r.top }; }
    function down(ev) { if (ev.cancelable) { ev.preventDefault(); } var p0 = pt(ev); drag = { x0: p0.x, y0: p0.y, s0: ukeTl.scroll, moved: false }; }
    function move(ev) {
      if (!drag) { return; }
      var p1 = pt(ev);
      if (Math.abs(p1.x - drag.x0) > 6) { drag.moved = true; }
      if (drag.moved) {
        ukeTl.scroll = Math.max(0, drag.s0 - (p1.x - drag.x0));
        ukeRollDraw(cv, seq, sched);
        if (ukeTl.redraw) { ukeTl.redraw(true); }
      }
    }
    function up() {
      if (!drag) { return; }
      var d = drag;
      drag = null;
      if (d.moved) { return; }
      var ppb = ukeTlPpb(), beat = (d.x0 + ukeTl.scroll) / ppb, midi = ukeRoll.low + Math.floor((H - d.y0) / UKE_ROLL_RH);
      if (midi < ukeRoll.low || midi >= ukeRoll.low + UKE_ROLL_ROWS) { return; }
      var ns = seq.tracks.mel.notes;
      for (var i = 0; i < ns.length; i++) {
        if (ns[i][2] === midi && beat >= ns[i][0] - 1e-6 && beat < ns[i][0] + ns[i][1]) { ns.splice(i, 1); save(true); return; }
      }
      if (ns.length >= UKE_MEL_MAX) { ctx.toast("メロディは" + UKE_MEL_MAX + "音までです"); return; }
      var g = ukeTl.snap, nb = Math.max(0, Math.floor(beat / g + 1e-6) * g);
      ns.push([nb, ukeRoll.len, midi]);
      ns.sort(function (a, b) { return a[0] - b[0] || a[2] - b[2]; });
      var UG = window.UGMelody, ac2 = UG && UG.audioInit();
      if (ac2) { try { UG.synth(midi, seq.tracks.mel.prog, 0, 0.8); } catch (e) {} }
      save(true);
    }
    if (window.PointerEvent) {
      cv.addEventListener("pointerdown", function (ev) { try { cv.setPointerCapture(ev.pointerId); } catch (e) {} down(ev); });
      cv.addEventListener("pointermove", move);
      cv.addEventListener("pointerup", up);
      cv.addEventListener("pointercancel", function () { drag = null; });
    } else {
      cv.addEventListener("touchstart", down, { passive: false });
      cv.addEventListener("touchmove", move, { passive: false });
      cv.addEventListener("touchend", up);
      cv.addEventListener("mousedown", down);
      cv.addEventListener("mouseup", up);
    }
    ukeRollDraw(cv, seq, sched);
    ukeRoll.redraw = function () { ukeRollDraw(cv, seq, sched); };
  }
  // メロディくずしの録音 → メロディトラック（拍に直して8分にそろえる）
  function ukeRollImport(seq, recId, lowG) {
    var recs = (window.UGMelody && window.UGMelody.loadRecs) ? window.UGMelody.loadRecs() : [], rec = null, i;
    for (i = 0; i < recs.length; i++) { if (recs[i].id === recId) { rec = recs[i]; } }
    if (!rec) { return 0; }
    var spb = 60 / seq.bpm, sc = ukeSeqSchedule(seq, lowG), limit = sc.beats > 0 ? sc.beats : 64, out = [], seen = {};
    for (i = 0; i < rec.notes.length && out.length < UKE_MEL_MAX; i++) {
      var nt = rec.notes[i];
      if (nt[2] !== "b" && nt[2] !== "p" && nt[2] !== "w") { continue; }
      var b = Math.round(nt[0] / 1000 / spb / 0.5) * 0.5;
      if (b >= limit) { continue; }
      var key = b + ":" + nt[1];
      if (seen[key]) { continue; }
      seen[key] = true;
      out.push([b, 0.5, Math.max(0, Math.min(127, Math.round(nt[1])))]);
    }
    seq.tracks.mel.notes = out;
    seq.tracks.mel.on = true;
    return out.length;
  }

  function ukeMixerHtml(seq, sel) {
    var tr = seq.tracks, names = (window.UGMelody && window.UGMelody.gmNames) || [], h = '<h4 class="arcade-prize-cat">&#x1F39A;&#xFE0F; トラック・ミキサー</h4>';
    var progOpts = [];
    for (var pg = 0; pg < 128; pg++) { progOpts.push([pg, (pg + 1 < 10 ? "00" : (pg + 1 < 100 ? "0" : "")) + (pg + 1) + " " + (names[pg] || "")]); }
    for (var i = 0; i < UKE_TRACK_IDS.length; i++) {
      var id = UKE_TRACK_IDS[i], t = tr[id], au = ukeTrackAudible(tr, id);
      h += '<div class="uke-trk' + (t.on ? "" : " off") + '"><div class="uke-trk-head">' +
        (id === "uke" ? '<b>' + UKE_TRACK_INFO[id].name + '</b>' : '<label><input type="checkbox" data-trk="' + id + '" data-tk="on"' + (t.on ? " checked" : "") + '> <b>' + UKE_TRACK_INFO[id].name + '</b></label>') +
        '<span class="uke-trk-ms"><button class="arcade-mini-btn' + (t.mute ? " on" : "") + '" data-trk="' + id + '" data-tk="mute" title="ミュート">M</button>' +
        '<button class="arcade-mini-btn' + (t.solo ? " on" : "") + '" data-trk="' + id + '" data-tk="solo" title="ソロ">S</button>' +
        '<span class="uke-trk-led' + (au ? " on" : "") + '"></span></span></div>';
      if (t.on) {
        h += '<div class="uke-trk-body">';
        if (id === "bass") { h += '<label>パターン' + sel('data-trk="bass" data-tk="pattern"', UKE_BASS_PATTERNS, t.pattern) + '</label>'; }
        if (id === "drum") { h += '<label>リズム' + sel('data-trk="drum" data-tk="groove"', ukeGrooves().map(function (g) { return [g.id, g.name]; }), t.groove) + '</label>'; }
        if (id === "rec1" || id === "rec2") { h += '<label>クオンタイズ' + sel('data-trk="' + id + '" data-tk="quant"', [["off", "なし"], ["8", "8分"], ["16", "16分"]], t.quant) + '</label>'; }
        if (id !== "drum") { h += '<label>音色' + sel('data-trk="' + id + '" data-tk="prog"', progOpts, t.prog) + '</label>'; }
        h += '<label>音量 ' + t.vol + '<input type="range" min="0" max="100" step="5" value="' + t.vol + '" data-trk="' + id + '" data-tk="vol"></label>' +
          '<label>左右' + sel('data-trk="' + id + '" data-tk="pan"', [[-0.6, "左"], [0, "中央"], [0.6, "右"]], t.pan) + '</label></div>';
      }
      if (id === "rec1" || id === "rec2") {
        h += '<div class="uke-chips"><button class="uke-chip uke-rec-btn" data-rec="' + id + '">&#x1F399;&#xFE0F; 録音する</button>' +
          '<span class="uke-role">' + t.notes.length + '音</span>' + (t.notes.length ? '<button class="uke-chip" data-recclear="' + id + '">&#x1F5D1;&#xFE0F; 消す</button>' : '') + '</div>';
      }
      h += '</div>';
    }
    return h;
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
    function lenOptsFor(id) { var lo = C.seqLen(id); return lenOpts.some(function (o) { return o[0] === lo.id; }) ? lenOpts : lenOpts.concat([[lo.id, lo.label]]); }
    if (ukeHist.last === null) { ukeHist.last = JSON.stringify(seq); }
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
      '<label>ポジション（全体）' + sel('data-set="pos"', UKE_POS, seq.pos) + '</label>' +
      '</div>' +
      (seq.style === "pat" ? '<label class="melody-row"><span>パターン（1小節・D ダウン / U アップ / - 休み / x ブラッシング）</span><input type="text" class="uke-seq-pat" maxlength="16" value="' + I.escHtml(seq.pattern) + '"></label>' +
        ukeChips(C.SEQ_PATTERNS.map(function (pp) { return { v: pp.p, t: pp.p + ' <span class="uke-role">' + pp.label + '</span>' }; }), function (v) { return v === seq.pattern; }, "pat") : '') +
      '<div class="melody-checks uke-seq-checks">' +
      [["metronome", "メトロノーム"], ["countIn", "カウントイン（1小節）"], ["loop", "くりかえし"], ["backing", "合わせて弾くとき伴奏も鳴らす"]].map(function (c2) {
        return '<label><input type="checkbox" data-set="' + c2[0] + '"' + (seq[c2[0]] ? " checked" : "") + '> ' + c2[1] + '</label>';
      }).join("") + '</div>';
    var sched = ukeSeqSchedule(seq, ctx.lowG), ri = 0, sec = ukeSeqSection(seq);
    if (ukePick.row >= seq.rows.length || (ukePick.row >= 0 && seq.rows[ukePick.row].type !== "chord")) { ukePick.row = -1; }
    h += ukeTlBar();
    if (ukeTl.view === "list") {
    h += '<div class="uke-seq-rows">';
    if (!seq.rows.length) { h += '<p class="small" style="color:#6c757d;">行がありません。下のボタンかコードのボタンで追加しよう。</p>'; }
    for (i = 0; i < seq.rows.length; i++) {
      var r = seq.rows[i], info = null;
      while (ri < sched.rows.length && sched.rows[ri].i < i) { ri++; }
      if (ri < sched.rows.length && sched.rows[ri].i === i) { info = sched.rows[ri]; }
      var inLoop = sec && i >= sec.a && i <= sec.b;
      h += '<div class="uke-seq-row' + (inLoop ? " inloop" : "") + (r.type === "chord" ? " chord" : "") + '" data-row="' + i + '"><span class="uke-seq-no">' + (info && info.bar ? '<span class="uke-seq-bar">&#x2669;' + info.bar + '</span>' : (i + 1)) + '</span>';
      if (r.type === "chord") {
        var bad = !info || !info.ok;
        h += '<input type="text" class="uke-seq-chord' + (bad ? " bad" : "") + '" data-row="' + i + '" value="' + I.escHtml(r.name) + '" maxlength="24" placeholder="例 Am7">' +
          '<button class="arcade-mini-btn' + (ukePick.row === i ? " on" : "") + '" data-seq="pick" data-row="' + i + '" title="コードを選ぶ">&#x1F3AF;</button>' +
          '<button class="arcade-mini-btn" data-seq="rowplay" data-row="' + i + '" title="この行のコードを鳴らす">&#x25B6;&#xFE0F;</button>' +
          sel('class="uke-seq-len" data-row="' + i + '"', lenOptsFor(r.len), r.len) +
          '<span class="uke-seq-res">' + (r.name.charAt(0) === "★" ? '' : sel('class="uke-seq-pos" data-row="' + i + '"', [["auto", "位置: 全体"], ["low", "ロー"], ["mid", "ミドル"], ["high", "ハイ"]], r.pos) + ' ') +
          (bad ? '<span style="color:#ff7675;">？ 読めない名前です（🎯で選べます）</span>' : I.escHtml(info.name !== r.name ? "→" + info.name : info.name) + ' <span class="uke-role">押さえ方 ' + info.shape.join("-") + '</span>') + '</span>';
      } else if (r.type === "rest") {
        h += '<span class="uke-seq-kind">&#x1F92B; 休符</span>' + sel('class="uke-seq-len" data-row="' + i + '"', lenOptsFor(r.len), r.len);
      } else if (r.type === "tempo") {
        h += '<span class="uke-seq-kind">&#x23F1;&#xFE0F; テンポ</span><input type="number" min="40" max="240" class="uke-seq-bpm" data-row="' + i + '" value="' + r.bpm + '">';
      } else if (r.type === "sec") {
        h += '<span class="uke-seq-kind">&#x1F3F7;&#xFE0F; セクション</span>' + ukeSecInput(i, r.name);
      } else {
        h += '<span class="uke-seq-kind">&#x1F511; 転調</span>' + sel('class="uke-seq-semis" data-row="' + i + '"', semiOpts, r.semis);
      }
      h += '<button class="arcade-mini-btn" data-seq="up" data-row="' + i + '" title="上へ">&#x2191;</button>' +
        '<button class="arcade-mini-btn" data-seq="del" data-row="' + i + '" title="消す">&#x1F5D1;&#xFE0F;</button></div>';
      if (ukePick.row === i && r.type === "chord") { h += ukePickHtml(seq, i); }
    }
    h += '</div>';
    } else { h += ukeTlHtml(seq, sched, lenOpts, semiOpts, sel); }
    h += '<div class="uke-chips">' +
      '<button class="uke-chip" data-seq="addChord">&#xFF0B; コード</button><button class="uke-chip" data-seq="addRest">&#xFF0B; 休符</button>' +
      '<button class="uke-chip" data-seq="addKey">&#xFF0B; 転調</button><button class="uke-chip" data-seq="addTempo">&#xFF0B; テンポ</button>' +
      '<button class="uke-chip" data-seq="addSec">&#xFF0B; セクション</button><button class="uke-chip" data-seq="addAllMy">&#x2B50; マイコードを全部並べる</button>' +
      '<button class="uke-chip" data-seq="clear">&#x1F9F9; 全部消す</button></div>';
    // 区間ループ
    var rowOpts = seq.rows.map(function (rw, j) { return [j, (j + 1) + "：" + (rw.type === "chord" ? rw.name : ({ rest: "休符", key: "転調", tempo: "テンポ", sec: "§" + rw.name })[rw.type] || "").slice(0, 10)]; });
    h += '<div class="uke-seq-loop"><label class="uke-seq-loop-on"><input type="checkbox" data-set="loopOn"' + (seq.loopOn ? " checked" : "") + '> &#x1F501; 区間ループ</label>' +
      (seq.rows.length ? '<label>はじめ ' + sel('data-set="loopA"', rowOpts, seq.loopA) + '</label><label>おわり ' + sel('data-set="loopB"', rowOpts, seq.loopB) + '</label>' : '') +
      (sec ? '<span class="uke-role">' + (sec.a + 1) + '〜' + (sec.b + 1) + '行目をくり返し再生（合わせて弾くも区間だけ）</span>' : '') + '</div>' +
      '<div class="uke-label">タップで追加（最後の行と同じ長さ）</div>';
    var pal = UKE_SEQ_PALETTE.map(function (n) { return { v: n, t: n }; });
    var my = ukeLoadMy();
    for (i = 0; i < my.length; i++) { pal.push({ v: "★" + my[i].name, t: "&#x2B50;" + I.escHtml(my[i].name) }); }
    h += ukeChips(pal.map(function (p) { return { v: I.escHtml(p.v), t: p.t }; }), function () { return false; }, "pal");
    h += '<div class="uke-label">合計 ' + (Math.round(sched.beats * 100) / 100) + '拍・' + sched.bars + '小節（' + (Math.round((sched.time - sched.lead) * 10) / 10) + '秒）　&#x2669;＝小節の頭</div>' +
      '<div class="melody-actions"><button class="modal-btn" data-seq="play">&#x25B6;&#xFE0F; 再生</button><button class="modal-btn" data-seq="stop">&#x23F9; 停止</button></div>' +
      '<div class="uke-lyr"></div>' +
      '<div class="melody-actions"><button class="modal-btn melody-small-btn" data-seq="midi">&#x1F4BE; MIDI（トラック別）</button><button class="modal-btn melody-small-btn" data-seq="wav"' + (ukeWavBusy ? " disabled" : "") + '>&#x1F3A7; ' + (ukeWavBusy ? "作成中…" : "WAVで保存") + '</button></div>' +
      ukeArrHtml(seq) +
      ukeLyrHtml(seq, sel) +
      ukeRollHtml(seq, sel) +
      ukeMixerHtml(seq, sel) +
      '<div class="uke-card uke-now"><div class="uke-card-info"><div class="uke-label">いま鳴っているコード</div><div class="uke-card-name uke-now-name">―</div></div><canvas class="uke-diagram" data-k="now"></canvas></div>' +
      '<button class="modal-btn" data-seq="together" style="width:100%;">&#x1F3B8; この曲に合わせて弾く<br><span class="small" style="color:inherit;opacity:0.75;">伴奏が流れるので、お題のコードを押さえてストローク</span></button>';
    // プリセット・保存
    h += '<h4 class="arcade-prize-cat">&#x1F4E6; プリセット</h4>' +
      ukeChips(ukeSeqPresets().map(function (p) { return { v: p.id, t: p.name }; }), function () { return false; }, "preset");
    h += '<h4 class="arcade-prize-cat">&#x1F4E6; プロジェクトのファイル</h4><div class="uke-chips">' +
      '<button class="uke-chip" data-seq="projSave">&#x1F4E6; ファイルに保存</button>' +
      '<label class="uke-chip uke-file">&#x1F4C2; ファイルから読み込む<input type="file" accept=".json,application/json" class="uke-proj-file"></label></div>' +
      '<datalist id="uke-sec-names">' + UKE_SEC_NAMES.map(function (n) { return '<option value="' + n + '">'; }).join("") + '</datalist>';
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
    function save(re, noHist) {
      st.cur = ukeSeqClean(seq);
      var j = JSON.stringify(st.cur);
      // 元に戻す: 前の状態を積む（50回まで）
      if (!noHist && ukeHist.last !== null && j !== ukeHist.last) {
        ukeHist.undo.push(ukeHist.last);
        if (ukeHist.undo.length > 50) { ukeHist.undo.shift(); }
        ukeHist.redo = [];
      }
      ukeHist.last = j;
      ukeSeqSave(st);
      if (re) { ctx.render(); }
    }
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
      else if (k === "style" || k === "pos") { seq[k] = el.value; }
      else { seq[k] = Number(el.value); }
      save(true);
    });
    all("input.uke-seq-pat", "onchange", function (ev) { seq.pattern = C.seqPattern(ev.currentTarget.value); save(true); });
    all("button[data-pat]", "onclick", function (ev) { seq.pattern = ev.currentTarget.getAttribute("data-pat"); save(true); });
    all("input.uke-seq-chord", "onchange", function (ev) { seq.rows[rowOf(ev)].name = String(ev.currentTarget.value || "").slice(0, 24); save(true); });
    all("select.uke-seq-len", "onchange", function (ev) { seq.rows[rowOf(ev)].len = ev.currentTarget.value; save(true); });
    all("select.uke-seq-pos", "onchange", function (ev) { seq.rows[rowOf(ev)].pos = ev.currentTarget.value; save(true); });
    all("select.uke-seq-semis", "onchange", function (ev) { seq.rows[rowOf(ev)].semis = Number(ev.currentTarget.value); save(true); });
    all("input.uke-seq-bpm", "onchange", function (ev) { seq.rows[rowOf(ev)].bpm = Number(ev.currentTarget.value); save(true); });
    all("input.uke-seq-secname", "onchange", function (ev) {
      var r0 = seq.rows[rowOf(ev)], old = r0.name, nn = String(ev.currentTarget.value || "").trim().slice(0, 12) || "セクション";
      r0.name = nn;
      // 構成の中の名前もいっしょに変える
      for (var ai = 0; ai < seq.arr.length; ai++) { if (seq.arr[ai] === old) { seq.arr[ai] = nn; } }
      save(true);
    });
    all("button[data-arradd]", "onclick", function (ev) { if (seq.arr.length < 32) { seq.arr.push(ev.currentTarget.getAttribute("data-arradd")); save(true); } });
    all("button[data-arrdel]", "onclick", function (ev) { seq.arr.splice(Number(ev.currentTarget.getAttribute("data-arrdel")), 1); save(true); });
    all("button[data-arrclear]", "onclick", function () { seq.arr = []; save(true); });
    all("select.uke-lyr-pick", "onchange", function (ev) { seq.lyrics = { id: Number(ev.currentTarget.value) }; save(true); });
    all("input.uke-proj-file", "onchange", function (ev) {
      var f = ev.currentTarget.files && ev.currentTarget.files[0];
      if (!f || !window.FileReader) { return; }
      var fr = new FileReader();
      fr.onload = function () {
        var res = ukeProjectRead(String(fr.result || ""));
        if (!res) { ctx.toast("このファイルはゴリラウクレレのプロジェクトではありません"); return; }
        seq = res.seq;
        ukeTl.sel = -1;
        save(true);
        ctx.toast("&#x1F4C2; プロジェクトを読み込みました" + (res.added ? "（マイコード" + res.added + "個を追加）" : ""));
      };
      fr.readAsText(f);
    });
    all("button[data-pal]", "onclick", function (ev) {
      if (seq.rows.length >= UKE_SEQ_MAX_ROWS) { ctx.toast("行は" + UKE_SEQ_MAX_ROWS + "までです"); return; }
      seq.rows.push({ type: "chord", name: ev.currentTarget.getAttribute("data-pal"), len: lastLen() });
      save(true);
    });
    // §174: コードを選ぶ画面
    all("button[data-ptab]", "onclick", function (ev) { ukePick.tab = ev.currentTarget.getAttribute("data-ptab"); ctx.render(); });
    all("button[data-pr]", "onclick", function (ev) { ukePick.root = parseInt(ev.currentTarget.getAttribute("data-pr"), 10); ctx.render(); });
    all("button[data-pq]", "onclick", function (ev) { ukePick.qual = ev.currentTarget.getAttribute("data-pq"); ctx.render(); });
    all("button[data-pplay]", "onclick", function (ev) {
      var rs = ukeResolve(ev.currentTarget.getAttribute("data-pplay"), ukeSeqSemisAt(seq, ukePick.row), ctx.lowG, ukeRowPos(seq, seq.rows[ukePick.row]));
      if (rs) { ukePlayShape(rs.shape, ctx.lowG, false); }
    });
    all("button[data-pset]", "onclick", function (ev) {
      if (ukePick.row >= 0 && seq.rows[ukePick.row]) { seq.rows[ukePick.row].name = ev.currentTarget.getAttribute("data-pset").slice(0, 24); }
      ukePick.row = -1;
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
      if (a === "undo" || a === "redo") {
        var from = a === "undo" ? ukeHist.undo : ukeHist.redo, to = a === "undo" ? ukeHist.redo : ukeHist.undo;
        if (!from.length) { return; }
        to.push(ukeHist.last);
        seq = ukeSeqClean(JSON.parse(from.pop()));
        if (ukeTl.sel >= seq.rows.length) { ukeTl.sel = -1; }
        save(true, true);
        return;
      }
      if (a === "up" && r > 0) { var t = seq.rows[r - 1]; seq.rows[r - 1] = seq.rows[r]; seq.rows[r] = t; save(true); return; }
      if (a === "del") { seq.rows.splice(r, 1); if (ukeTl.sel >= seq.rows.length) { ukeTl.sel = seq.rows.length - 1; } ukePick.row = -1; save(true); return; }
      if ((a === "addChord" || a === "addRest" || a === "addKey") && seq.rows.length >= UKE_SEQ_MAX_ROWS) { ctx.toast("行は" + UKE_SEQ_MAX_ROWS + "までです"); return; }
      if (a === "addChord") { seq.rows.push({ type: "chord", name: "C", len: lastLen() }); save(true); return; }
      if (a === "addRest") { seq.rows.push({ type: "rest", len: lastLen() }); save(true); return; }
      if (a === "addKey") { seq.rows.push({ type: "key", semis: 2 }); save(true); return; }
      if (a === "addTempo") { if (seq.rows.length >= UKE_SEQ_MAX_ROWS) { return; } seq.rows.push({ type: "tempo", bpm: seq.bpm }); save(true); return; }
      if (a === "addSec") {
        if (seq.rows.length >= UKE_SEQ_MAX_ROWS) { return; }
        var used = seq.rows.filter(function (rw) { return rw.type === "sec"; }).map(function (rw) { return rw.name; }), nm2 = "セクション";
        for (var si = 0; si < UKE_SEC_NAMES.length; si++) { if (used.indexOf(UKE_SEC_NAMES[si]) < 0) { nm2 = UKE_SEC_NAMES[si]; break; } }
        seq.rows.push({ type: "sec", name: nm2 });
        save(true);
        return;
      }
      if (a === "projSave") {
        var hp = I.saveBlob(new Blob([ukeProjectJson(seq)], { type: "application/json" }), "ukulele-project-" + ukeFileStamp() + ".json");
        ctx.toast(hp === "fail" ? "保存できませんでした" : "&#x1F4E6; プロジェクトをファイルに保存しました");
        return;
      }
      if (a === "clear") { seq.rows = []; ukePick.row = -1; save(true); return; }
      if (a === "pick") { ukePick.row = ukePick.row === r ? -1 : r; ctx.render(); return; }
      if (a === "pickClose") { ukePick.row = -1; ctx.render(); return; }
      if (a === "rowplay") {
        var rp = ukeResolve(seq.rows[r].name, ukeSeqSemisAt(seq, r), ctx.lowG, ukeRowPos(seq, seq.rows[r]));
        if (rp) { ukePlayShape(rp.shape, ctx.lowG, false); } else { ctx.toast("この名前のコードは鳴らせません（🎯で選べます）"); }
        return;
      }
      if (a === "addAllMy") {
        var myl = ukeLoadMy(), added = 0;
        if (!myl.length) { ctx.toast("マイコードがありません（カスタムで作れます）"); return; }
        for (var mi = 0; mi < myl.length && seq.rows.length < UKE_SEQ_MAX_ROWS; mi++) { seq.rows.push({ type: "chord", name: "★" + myl[mi].name, len: lastLen() }); added++; }
        save(false);
        ctx.toast("&#x2B50; マイコードを" + added + "個並べました");
        return;
      }
      if (a === "play") {
        var sc = ukeSeqClean(seq), sec = ukeSeqSection(sc), lyrSeq = sec ? sec.seq : ukeSeqExpand(sc), lyrS = ukeSeqSchedule(lyrSeq, ctx.lowG), lyrP = ukeLyricPlace(lyrSeq, lyrS);
        // 区間ループのときは、区間のはじめの拍を足して全体の位置にする
        var fullS = ukeSeqSchedule(sc, ctx.lowG), offB = 0;
        if (sec) { for (var fi = 0; fi < fullS.rows.length; fi++) { if (fullS.rows[fi].i === sec.a) { offB = fullS.rows[fi].start; break; } } }
        var expd = !sec && sc.arr.length;
        var tick = function (b) {
          // §180: 構成どおりに鳴らしているときは、鳴っているブロックの書いた行の上の同じ位置へ
          ukeTl.play = b === null ? null : (expd ? ukeArrangedToWritten(lyrS, fullS, b) : b + offB);
          if (ukeTl.redraw) { ukeTl.redraw(); }
          ukeLyrShow(root, lyrP, b);
        };
        var okp = sec ? ukeSeqStart(sec.seq, ctx.lowG, function (ri2, info2) { showNow(ri2 >= 0 ? ri2 + sec.offset : -1, info2); }, tick) : ukeSeqStart(ukeSeqExpand(sc), ctx.lowG, showNow, tick);
        if (!okp) { ctx.toast("鳴らせるコードがありません"); }
        return;
      }
      if (a === "stop") { ukeSeqStop(); showNow(-1, null); ukeTl.play = null; if (ukeTl.redraw) { ukeTl.redraw(); } ukeLyrShow(root, [], null); return; }
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
      if (a === "together") {
        var pf = ukePrefs(), sq = ukeSeqClean(seq), sc2 = ukeSeqSection(sq);
        ukeSeqStop();
        ctx.done({ mode: "seq", lowG: ctx.lowG, sound: true, seq: sc2 ? sc2.seq : ukeSeqExpand(sq), notes: pf.notes, tones: pf.tones, fingers: pf.fingers, frets: pf.frets, compact: pf.view === "compact", hold: pf.hold === "hold", hybrid: pf.hold === "hybrid", smart: pf.hold === "smart" });
        return;
      }
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
    // §177: ミキサー（再生中は音量・M・S・左右をすぐ反映）
    function trkSet(id, k, v) {
      var t = seq.tracks[id];
      if (!t) { return; }
      if (k === "mute" || k === "solo") { t[k] = !t[k]; }
      else if (k === "on") { t.on = !!v; }
      else if (k === "pattern" || k === "groove" || k === "quant") { t[k] = v; }
      else { t[k] = Number(v); }
      if (ukeSeqPlayer && ukeSeqPlayer.mix) { ukeSeqPlayer.sched.tracks = ukeTracksClean(seq.tracks); ukeMixerUpdate(ukeSeqPlayer.mix, ukeSeqPlayer.sched.tracks); }
      save(true);
    }
    all("button[data-trk]", "onclick", function (ev) { trkSet(ev.currentTarget.getAttribute("data-trk"), ev.currentTarget.getAttribute("data-tk")); });
    // §178: 録音する（合わせて弾く画面で録る。区間ループがオンなら区間だけ）
    all("button[data-rec]", "onclick", function (ev) {
      var id = ev.currentTarget.getAttribute("data-rec"), pf = ukePrefs(), sq = ukeSeqClean(seq), sc2 = ukeSeqSection(sq), offB = 0;
      if (sc2) {
        var fs = ukeSeqSchedule(sq, ctx.lowG);
        for (var fi = 0; fi < fs.rows.length; fi++) { if (fs.rows[fi].i === sc2.a) { offB = fs.rows[fi].start; break; } }
        sc2.seq.loop = false;
      } else { sq = ukeSeqExpand(sq); sq.loop = false; }
      ukeSeqStop();
      ctx.done({ mode: "seq", lowG: ctx.lowG, sound: true, seq: sc2 ? sc2.seq : sq, rec: id, recOffset: offB, notes: pf.notes, tones: pf.tones, fingers: pf.fingers, frets: pf.frets, compact: pf.view === "compact", hold: pf.hold === "hold", hybrid: pf.hold === "hybrid", smart: pf.hold === "smart" });
    });
    all("button[data-recclear]", "onclick", function (ev) { var id = ev.currentTarget.getAttribute("data-recclear"); seq.tracks[id].notes = []; save(true); });
    ukeRollBind(root, seq, ctx, save);
    all("select[data-trk], input[data-trk]", "onchange", function (ev) {
      var el = ev.currentTarget;
      trkSet(el.getAttribute("data-trk"), el.getAttribute("data-tk"), el.type === "checkbox" ? el.checked : el.value);
    });
    // §176: タイムライン
    var tlSched = ukeSeqSchedule(seq, ctx.lowG), cv = root.querySelector("canvas.uke-tl");
    function snapLen(i, d) {
      var r = seq.rows[i];
      if (!r || ukeIsMark(r.type)) { return; }
      var nb = Math.max(ukeTl.snap, Math.min(32, Math.round((C.seqLen(r.len).beats + d) / ukeTl.snap) * ukeTl.snap));
      r.len = C.lenId(nb);
    }
    function copyRow(r) { return JSON.parse(JSON.stringify(r)); }
    all("button[data-tlview]", "onclick", function (ev) { ukeTl.view = ev.currentTarget.getAttribute("data-tlview"); ctx.render(); });
    all("select.uke-tl-snap", "onchange", function (ev) { ukeTl.snap = Number(ev.currentTarget.value); ctx.render(); });
    all("button[data-tl]", "onclick", function (ev) {
      var a = ev.currentTarget.getAttribute("data-tl"), i = ukeTl.sel, t;
      if (a === "zoomIn" || a === "zoomOut") {
        var old = ukeTlPpb();
        ukeTl.zoom = Math.max(0, Math.min(UKE_TL_ZOOMS.length - 1, ukeTl.zoom + (a === "zoomIn" ? 1 : -1)));
        ukeTl.scroll = Math.max(0, ukeTl.scroll * ukeTlPpb() / old);
        ctx.render();
        return;
      }
      if (a === "paste") {
        if (!ukeClip || seq.rows.length >= UKE_SEQ_MAX_ROWS) { return; }
        var at = i >= 0 ? i + 1 : seq.rows.length;
        seq.rows.splice(at, 0, copyRow(ukeClip));
        ukeTl.sel = at;
        save(true);
        return;
      }
      if (i < 0 || !seq.rows[i]) { return; }
      if (a === "shorter" || a === "longer") { snapLen(i, a === "shorter" ? -ukeTl.snap : ukeTl.snap); save(true); return; }
      if (a === "copy") { ukeClip = copyRow(seq.rows[i]); ctx.toast("&#x1F4CB; コピーしました（📥 貼り付けで入れられます）"); return; }
      if (a === "dup") {
        if (seq.rows.length >= UKE_SEQ_MAX_ROWS) { ctx.toast("行は" + UKE_SEQ_MAX_ROWS + "までです"); return; }
        seq.rows.splice(i + 1, 0, copyRow(seq.rows[i]));
        ukeTl.sel = i + 1;
        save(true);
        return;
      }
      if (a === "left" && i > 0) { t = seq.rows[i - 1]; seq.rows[i - 1] = seq.rows[i]; seq.rows[i] = t; ukeTl.sel = i - 1; save(true); return; }
      if (a === "right" && i < seq.rows.length - 1) { t = seq.rows[i + 1]; seq.rows[i + 1] = seq.rows[i]; seq.rows[i] = t; ukeTl.sel = i + 1; save(true); }
    });
    if (cv) {
      ukeTl.scroll = Math.min(ukeTl.scroll, ukeTlMaxScroll(cv, tlSched, seq));
      ukeTlBindCanvas(cv, seq, tlSched, function (what, a1, a2) {
        if (what === "select") { ukeTl.sel = a1; if (ukePick.row !== a1) { ukePick.row = -1; } ctx.render(); return; }
        if (what === "scroll") { if (ukeRoll.redraw) { ukeRoll.redraw(); } return; }
        if (what === "resize") { if (seq.rows[a1]) { seq.rows[a1].len = C.lenId(a2); } save(true); return; }
        if (what === "loop") { seq.loopOn = true; seq.loopA = a1; seq.loopB = a2; save(true); }
      });
      ukeTlDraw(cv, seq, tlSched);
      ukeTl.redraw = function (fromRoll) {
        // 再生位置が画面の外に出そうなら追いかける
        var w = cv.clientWidth || 330, px = ukeTl.play === null ? null : ukeTl.play * ukeTlPpb() - ukeTl.scroll;
        if (px !== null && (px > w - 30 || px < 0)) { ukeTl.scroll = Math.max(0, Math.min(ukeTlMaxScroll(cv, tlSched, seq), ukeTl.play * ukeTlPpb() - 60)); }
        ukeTlDraw(cv, seq, tlSched);
        if (ukeRoll.redraw && !fromRoll) { ukeRoll.redraw(); }
      };
    } else {
      // リスト表示のときもピアノロールの再生位置は動かす
      ukeTl.redraw = function (fromRoll) { if (ukeRoll.redraw && !fromRoll) { ukeRoll.redraw(); } };
    }
    if (ukeSeqPlayer) { ukeSeqPlayer.row = -2; }
  }

  // ---------- §181 v0.99: マーキング用の指板（弦で作る） ----------
  var UKE_MARK_FRETS = 15, UKE_MARK_HEAD = 22;
  function ukeMarkGeom(cv) {
    var w = cv.clientWidth || 330, h = cv.clientHeight || 346, rows = UKE_MARK_FRETS + 1;
    var rowH = (h - UKE_MARK_HEAD - 4) / rows, x0 = 40, colW = (w - x0 - 14) / 4;
    return { w: w, h: h, rowH: rowH, x0: x0, colW: colW, sx: function (s2) { return x0 + colW * (s2 + 0.5); }, ry: function (f) { return UKE_MARK_HEAD + rowH * f; } };
  }
  function ukeMarkDraw(cv, shape, lowG, rootPc) {
    if (!cv || !cv.getContext) { return; }
    var g = ukeMarkGeom(cv), k = 2, ctx = cv.getContext("2d"), s2, f;
    if (cv.width !== Math.round(g.w * k) || cv.height !== Math.round(g.h * k)) { cv.width = Math.round(g.w * k); cv.height = Math.round(g.h * k); }
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.fillStyle = "#3b2414"; ctx.fillRect(0, 0, g.w, g.h);
    ctx.fillStyle = "#5c3a1e"; ctx.fillRect(g.x0, g.ry(1), g.colW * 4, g.rowH * UKE_MARK_FRETS);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    // 開放の段・ナット・フレット・目印
    ctx.fillStyle = "rgba(255,255,255,0.05)"; ctx.fillRect(g.x0, g.ry(0), g.colW * 4, g.rowH);
    ctx.fillStyle = "#f1e4c8"; ctx.fillRect(g.x0, g.ry(1) - 2, g.colW * 4, 4);
    ctx.strokeStyle = "#c0c0c0"; ctx.lineWidth = 1;
    for (f = 2; f <= UKE_MARK_FRETS + 1; f++) { ctx.beginPath(); ctx.moveTo(g.x0, g.ry(f)); ctx.lineTo(g.x0 + g.colW * 4, g.ry(f)); ctx.stroke(); }
    var marks = [3, 5, 7, 10, 12, 15];
    ctx.fillStyle = "rgba(241,228,200,0.6)";
    for (var mi = 0; mi < marks.length; mi++) {
      var my = g.ry(marks[mi]) + g.rowH / 2;
      // 目印はフレット番号のとなりに（音名と重ならないように）
      if (marks[mi] === 12) { ctx.beginPath(); ctx.arc(31, my, 2.5, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(37, my, 2.5, 0, Math.PI * 2); ctx.fill(); }
      else { ctx.beginPath(); ctx.arc(34, my, 2.5, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.font = "bold " + Math.max(8, Math.min(12, g.rowH * 0.5)) + "px sans-serif";
    ctx.fillStyle = "#e9c46a";
    ctx.fillText("開放", 17, g.ry(0) + g.rowH / 2);
    for (f = 1; f <= UKE_MARK_FRETS; f++) { ctx.fillText(String(f), 15, g.ry(f) + g.rowH / 2); }
    for (s2 = 0; s2 < 4; s2++) {
      ctx.fillStyle = "#e9c46a";
      ctx.fillText(UKE_STRINGS[s2] + "弦", g.sx(s2), 11);
      ctx.strokeStyle = "#e0e0e0"; ctx.lineWidth = 1 + (3 - s2) * 0.3;
      ctx.beginPath(); ctx.moveTo(g.sx(s2), g.ry(0) + g.rowH / 2); ctx.lineTo(g.sx(s2), g.h - 4); ctx.stroke();
    }
    // 全マスの音名（薄く）と、押さえている印
    var nf = Math.max(7, Math.min(11, g.rowH * 0.42)), rad = Math.min(g.rowH * 0.46, g.colW * 0.32);
    for (s2 = 0; s2 < 4; s2++) {
      for (f = 0; f <= UKE_MARK_FRETS; f++) {
        var cx = g.sx(s2), cy = g.ry(f) + g.rowH / 2, midi = ukeMidi(s2, f, lowG), nm = ukeNoteName(midi);
        if (shape[s2] === f) {
          var isRoot = rootPc !== null && rootPc !== undefined && C.pcOf(midi) === rootPc;
          ctx.fillStyle = isRoot ? "#ff7675" : "#ffd166";
          ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#1b0f07"; ctx.font = "bold " + nf + "px sans-serif"; ctx.fillText(nm, cx, cy + 0.5);
        } else if (g.rowH >= 14) {
          ctx.fillStyle = "rgba(241,228,200,0.35)"; ctx.font = (nf - 1) + "px sans-serif"; ctx.fillText(nm, cx + g.colW * 0.28, cy);
        }
      }
    }
  }
  // タップ → onTap(弦, フレット)。少しでも動いたらスクロールとみなして何もしない
  function ukeMarkBind(cv, onTap) {
    if (!cv || !cv.addEventListener) { return; }
    var st = null;
    function pt(ev) { var r = cv.getBoundingClientRect(), src = ev.changedTouches && ev.changedTouches[0] ? ev.changedTouches[0] : ev; return { x: src.clientX - r.left, y: src.clientY - r.top }; }
    function down(ev) { st = pt(ev); }
    function up(ev) {
      if (!st) { return; }
      var p2 = pt(ev), s0 = st;
      st = null;
      if (Math.abs(p2.x - s0.x) > 10 || Math.abs(p2.y - s0.y) > 10) { return; }
      var g = ukeMarkGeom(cv), best = -1, bd = g.colW / 2 + 4;
      for (var i = 0; i < 4; i++) { var d = Math.abs(s0.x - g.sx(i)); if (d < bd) { bd = d; best = i; } }
      var f = Math.floor((s0.y - UKE_MARK_HEAD) / g.rowH);
      if (best < 0 || f < 0 || f > UKE_MARK_FRETS) { return; }
      onTap(best, f);
    }
    if (window.PointerEvent) {
      cv.addEventListener("pointerdown", down);
      cv.addEventListener("pointerup", up);
      cv.addEventListener("pointercancel", function () { st = null; });
    } else {
      cv.addEventListener("touchstart", down);
      cv.addEventListener("touchend", up);
      cv.addEventListener("mousedown", down);
      cv.addEventListener("mouseup", up);
    }
  }
  // 押さえ方を変える（同じ所をもう一度押したら開放）
  function ukeMarkSet(shape, s2, f) {
    var out = shape.slice();
    out[s2] = f > 0 && out[s2] === f ? 0 : f;
    return out;
  }

  // ---------- 設定画面（タブ: あそぶ / コード辞典 / カスタム / マイコード / シーケンサー） ----------
  var ukeUi = { tab: "play", markBig: false, vPos: "auto", dRoot: 0, dQual: "maj", dVoice: 0, pRoot: 0, pParts: [], pBass: -1, pVoice: 0, sMode: "parts", sShape: [0, 0, 0, 3], sName: "" };
  var UKE_TABS = [["play", "&#x1F3B8; あそぶ"], ["dict", "&#x1F4DA; コード辞典"], ["custom", "&#x1F6E0;&#xFE0F; カスタム"], ["my", "&#x2B50; マイコード"], ["seq", "&#x1F39B;&#xFE0F; シーケンサー"]];
  function ukeSelect(attr, opts, cur) {
    var o = '<select ' + attr + '>';
    for (var j = 0; j < opts.length; j++) { o += '<option value="' + opts[j][0] + '"' + (String(opts[j][0]) === String(cur) ? " selected" : "") + '>' + opts[j][1] + '</option>'; }
    return o + '</select>';
  }
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
  function ukePosChips() {
    return '<div class="uke-label">ポジション（押さえる場所の高さ）</div>' +
      ukeChips(UKE_POS.map(function (p2) { return { v: p2[0], t: p2[1] }; }), function (v) { return v === ukeUi.vPos; }, "vpos");
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
      // タブは大きなボタンで3列に（小さいと見落としやすいため）
      h += ukeChips(UKE_TABS.map(function (t) { return { v: t[0], t: t[1] }; }), function (v) { return v === ukeUi.tab; }, "tab").replace('<div class="uke-chips">', '<div class="uke-chips uke-tabs">');
      cards = {};
      if (ukeUi.tab === "play") {
        h += '<p class="small" style="color:#ffd166;margin:0 0 6px;">&#x1F446; コード辞典・カスタム（自分でコードを作る）・マイコード・シーケンサーは、上のボタンで切りかえ</p>';
        h += '<p class="small" style="color:#adb5bd;margin:0 0 8px;">左手で指板（上）を押さえたまま、右手でサウンドホール（下の丸）の上を横にスワイプ。通った弦が順番に鳴るよ。押さえる場所はコード表と同じ向き（左から G・C・E・A）。</p>';
        for (i = 0; i < UKE_MODES.length; i++) { h += modeBtn(UKE_MODES[i].id, UKE_MODES[i].name, UKE_MODES[i].note); }
        h += modeBtn("dict", "&#x1F393; コード辞典から出題", "360コードからランダム（お手本あり・60秒）");
        h += modeBtn("my", "&#x2B50; マイコードで練習", my.length ? "保存した" + my.length + "個から出題（お手本あり・60秒）" : "マイコードを保存すると遊べます", !my.length);
        h += '<h4 class="arcade-prize-cat">&#x1F442; 耳コピクイズ（鳴ったコードを当てる・60秒）</h4>' +
          modeBtn("ear:easy", "&#x1F530; やさしい", "C・Am・F・G7 など7つから") +
          modeBtn("ear:normal", "&#x1F3B8; ふつう", "18コードから") +
          modeBtn("ear:hard", "&#x1F525; むずかしい", "コード辞典360コードから（同じ根音の別の種類とくらべる）");
        h += '<h4 class="arcade-prize-cat">&#x1F3BC; コード進行で練習（2周でクリア・時間制限なし）</h4>' +
          '<div class="uke-seq-set"><label>進行のキー' + ukeSelect('data-pp="progKey"', C.ROOTS.map(function (r0, ri) { return [ri, r0 + (ri ? "（" + (ri > 6 ? "−" + (12 - ri) : "+" + ri) + "）" : "（そのまま）")]; }), prefs.progKey) + '</label></div>' +
          '<p class="small" style="color:#adb5bd;margin:2px 0 4px;">度数（Ⅰ・Ⅳ・Ⅴ…）はキーが変わっても同じ。同じ進行をいろいろなキーで弾くと、形のちがいが分かるよ。</p>';
        for (var pc = 0; pc < UKE_PROG_CATS.length; pc++) {
          h += '<div class="uke-label" style="margin-top:6px;">' + UKE_PROG_CATS[pc].name + '</div>';
          for (i = 0; i < UKE_PROGRESSIONS.length; i++) {
            var pg = UKE_PROGRESSIONS[i];
            if (pg.cat !== UKE_PROG_CATS[pc].id) { continue; }
            h += '<button class="modal-btn uke-prog-btn" data-m="prog:' + pg.id + '" style="width:100%;"><b>' + pg.name + '</b>' +
              '<br><span class="small" style="color:inherit;">' + I.escHtml(ukeProgChords(pg, prefs.progKey).join(" → ")) + '</span>' +
              '<br><span class="small" style="color:inherit;opacity:0.75;">' + pg.deg.join("–") + '　' + pg.note + '</span></button>';
          }
        }
      } else if (ukeUi.tab === "dict") {
        h += '<p class="small" style="color:#adb5bd;margin:0 0 6px;">根音と種類を選ぶと、押さえ方と構成音が出るよ（12×30＝360コード）。</p>' +
          '<div class="uke-label">根音</div>' + ukeChips(ukeRootItems(), function (v) { return v === ukeUi.dRoot; }, "droot") +
          '<div class="uke-label">種類</div>' + ukeChips(C.QUALITIES.map(function (q) { return { v: q.id, t: q.label }; }), function (v) { return v === ukeUi.dQual; }, "dqual");
        var ds = ukeDictSpec();
        h += ukePosChips();
        c = ukeCard(C.name(ds), ukeTonesHtml(ds), ukeVoicePos(ds, lowG, ukeUi.vPos), ukeUi.dVoice, "d");
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
          h += ukePosChips();
          c = ukeCard(C.name(ps), ukeTonesHtml(ps), ukeVoicePos(ps, lowG, ukeUi.vPos), ukeUi.pVoice, "p");
          cards.p = { shape: c.shape, root: ps.root, name: C.name(ps), src: "パーツで作成" };
          h += c.html;
        } else {
          h += '<p class="small" style="color:#adb5bd;margin:4px 0;">下の指板のマスをタップするか、弦ごとにフレットを選ぶと、コード名を当てるよ（0＝開放・15フレットまで）。</p><div class="uke-strsel">';
          for (i = 0; i < 4; i++) {
            h += '<label><span>' + UKE_STRINGS[i] + '弦</span><select data-str="' + i + '">';
            for (var fr = 0; fr <= UKE_MARK_FRETS; fr++) { h += '<option value="' + fr + '"' + (ukeUi.sShape[i] === fr ? " selected" : "") + '>' + fr + '</option>'; }
            h += '</select></label>';
          }
          h += '</div><div class="uke-chips"><button class="uke-chip" data-markbig="1">&#x1F50D; 大きく表示してマーキング</button>' +
            '<button class="uke-chip" data-markreset="1">&#x21BA; 全部開放</button></div>' +
            '<canvas class="uke-mark" data-k="mark"></canvas>';
          var det = ukeDetect(ukeUi.sShape, lowG), auto = det.name || det.tones.join("・");
          h += '<label class="melody-row"><span>名前（空ならコード名を自動で）</span><input type="text" class="uke-name" maxlength="24" value="' + I.escHtml(ukeUi.sName) + '" placeholder="' + I.escHtml(auto) + '"></label>';
          var tonesH = I.escHtml(det.tones.join(" ")) + (det.alts.length ? ' <span class="uke-role">別名: ' + I.escHtml(det.alts.join(" / ")) + '</span>' : '');
          c = ukeCard(ukeUi.sName || auto, tonesH, [ukeUi.sShape.slice()], 0, "s");
          var dsp = det.name ? C.parse(det.name) : null;
          cards.s = { shape: c.shape, root: dsp ? dsp.root : null, name: ukeUi.sName || auto, src: "弦で作成" };
          h += c.html;
          // 大きく表示（画面いっぱいの指板）
          if (ukeUi.markBig) {
            h += '<div class="uke-mark-full"><div class="uke-mark-head"><div class="uke-card-name">' + I.escHtml(ukeUi.sName || auto || "?") + '</div>' +
              '<button class="arcade-mini-btn melody-midi-btn" data-a="strum" data-k="s">&#x1F3B6; ジャーン</button>' +
              '<button class="arcade-mini-btn melody-midi-btn" data-a="arp" data-k="s">&#x1F3BC;</button>' +
              '<button class="arcade-mini-btn melody-midi-btn" data-a="add" data-k="s">&#x2B50; 追加</button>' +
              '<button class="arcade-mini-btn" data-markbig="0" title="閉じる">&#x2716;&#xFE0F;</button></div>' +
              '<div class="small" style="color:#f1e4c8;margin:2px 0;">' + tonesH + '　押さえ方 ' + ukeUi.sShape.join("-") + '</div>' +
              '<canvas class="uke-mark" data-k="markbig"></canvas></div>';
          }
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
        (ukeUi.tab === "play" ? '<div class="uke-seq-set"><label>表示するフレット数' + ukeSelect('data-pp="frets"', UKE_FRET_CHOICES, prefs.frets) + '</label>' +
          '<label>辞典から出題のポジション' + ukeSelect('data-pp="posPref"', UKE_POS, prefs.posPref) + '</label>' +
          '<label>画面' + ukeSelect('data-pp="view"', [["normal", "ふつう"], ["compact", "引き（ボタンを減らして指板を大きく）"]], prefs.view) + '</label>' +
          '<label>押さえ方' + ukeSelect('data-pp="hold"', [["real", "リアルタイム（押さえている間だけ）"], ["hold", "ホールド（タップで印を付けておく）"], ["hybrid", "ハイブリッド（鳴らしたら次の押さえで入れかえ）"], ["smart", "スマート（1か所なら飾り・2か所目から新しいコード）"]], prefs.hold) + '</label></div>' +
          '<p class="small" style="color:#adb5bd;margin:4px 0;">ボタン: &#x2B07;&#xFE0F; ダウン・&#x2B06;&#xFE0F; アップ＝4本をその向きに鳴らす ／ &#x270B; はなす＝ホールドした印（ホールドの押さえ方・マウスで付けた印）を全部消す ／ ▲▼＝見えるフレットの位置を動かす。' +
          'ホールドにすると、先にマスをタップして押さえ方を作り、あとはストロークするだけで鳴らせます（正解すると印は自動で消えます）。' +
          'ハイブリッドは、鳴らしたあとに次の所を押さえ始めると前の印が消えて、すぐ次のコードを作れます。' +
          'スマートは、鳴らしたあと1か所だけ押すと「飾り」（コードはそのまま。sus4 やメロディに）、2か所目を押すと「新しいコード」として作り直します（C→Am のような指1本のコードは、前の印を外してから押す）。</p>' : '') +
        '<button class="modal-btn" data-m="back" style="width:100%;margin-top:8px;">&#x1F579;&#xFE0F; メニューへ</button></div>';
      root.innerHTML = h;
      for (var k in cards) {
        if (cards.hasOwnProperty(k) && cards[k].shape) { ukeDiagram(root.querySelector('canvas[data-k="' + k + '"]'), cards[k].shape, cards[k].root, lowG); }
      }
      // §181: マーキング用の指板
      if (cards.s) {
        var mcs = [root.querySelector('canvas[data-k="mark"]'), root.querySelector('canvas[data-k="markbig"]')];
        for (var mc = 0; mc < mcs.length; mc++) {
          if (!mcs[mc]) { continue; }
          ukeMarkDraw(mcs[mc], ukeUi.sShape, lowG, cards.s.root);
          ukeMarkBind(mcs[mc], function (s3, f3) {
            ukeUi.sShape = ukeMarkSet(ukeUi.sShape, s3, f3);
            var UG = window.UGMelody, ac3 = UG && UG.audioInit();
            if (ac3) { ukeNote(UG, ac3, ukePreviewOuts, s3, ukeUi.sShape[s3], ac3.currentTime + 0.01, 0.85, lowG); }
            render();
          });
        }
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
      on("button[data-tab]", function (ev) { ukeUi.tab = attr(ev, "data-tab"); ukeUi.markBig = false; if (ukeUi.tab !== "seq") { ukeSeqStop(); } render(); });
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
      on("button[data-smode]", function (ev) { ukeUi.sMode = attr(ev, "data-smode"); ukeUi.markBig = false; render(); });
      on("button[data-markbig]", function (ev) { ukeUi.markBig = attr(ev, "data-markbig") === "1"; render(); });
      on("button[data-markreset]", function () { ukeUi.sShape = [0, 0, 0, 0]; render(); });
      on("button[data-vpos]", function (ev) { ukeUi.vPos = attr(ev, "data-vpos"); ukeUi.dVoice = 0; ukeUi.pVoice = 0; render(); });
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
      var pps = root.querySelectorAll("select[data-pp]");
      for (var pi = 0; pi < pps.length; pi++) {
        pps[pi].onchange = function (ev) {
          var k2 = attr(ev, "data-pp");
          prefs[k2] = k2 === "frets" || k2 === "progKey" ? Number(ev.currentTarget.value) : ev.currentTarget.value;
          ukeSavePrefs(prefs);
          render();
        };
      }
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
        ctl.done({ mode: v, lowG: lowG, sound: true, notes: prefs.notes, tones: prefs.tones, fingers: prefs.fingers, frets: prefs.frets, posPref: prefs.posPref, compact: prefs.view === "compact", hold: prefs.hold === "hold", hybrid: prefs.hold === "hybrid", smart: prefs.hold === "smart", progKey: prefs.progKey });
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
    help: "指板を押さえたまま、下の丸の上を横にスワイプで鳴らす / 弦をタップで1本だけ / ⬇ダウン・⬆アップ＝4本を鳴らす（Space・D / U）/ ✋はなす＝ホールドした印を全部消す（ホールドの押さえ方・マウスのとき）/ ▲▼（↑↓）で表示するフレットの位置を動かす / 1〜4 で1本ずつ / P一時停止",
    controls: [
      { action: "strum", label: "&#x2B07;&#xFE0F; ダウン" },
      { action: "strumUp", label: "&#x2B06;&#xFE0F; アップ" },
      { action: "clear", label: "&#x270B; はなす" },
      { action: "posUp", label: "&#x25B2;" },
      { action: "posDown", label: "&#x25BC;" }
    ],
    controlsClass: "uke-ctrl", // §182: 5つ並ぶので字を小さく
    keys: { " ": "strum", "d": "strum", "D": "strum", "u": "strumUp", "U": "strumUp", "1": "p0", "2": "p1", "3": "p2", "4": "p3", "Backspace": "clear", "ArrowUp": "posUp", "ArrowDown": "posDown" },
    setup: ukeSetup,
    setupLabel: "モードを変える",
    create: function (api, cfg) {
      cfg = cfg || {};
      var L = ukeLayout(cfg.frets, !!cfg.compact); // §175 v0.94: 表示するフレット数と寸法（§181: 引きのビュー）
      if (api.setCompact) { api.setCompact(!!cfg.compact); }
      if (L.compact && api.setCanvasHeight) { api.setCanvasHeight(L.h); }
      var mode = cfg.mode || "free", practice = mode !== "free", lowG = !!cfg.lowG;
      var prog = mode.indexOf("prog:") === 0 ? ukeProgression(mode.substring(5)) : null, progIdx = -1, progTotal = prog ? prog.chords.length * UKE_PROG_LOOPS : 0;
      var progKey = Math.max(0, Math.min(11, Math.round(Number(cfg.progKey) || 0))), progChords = prog ? ukeProgChords(prog, progKey) : [], progDeg = ""; // §183
      if (mode.indexOf("prog:") === 0 && !prog) { mode = "free"; practice = false; }
      var fingers = {}, sticky = {}, strums = {}, ring = [0, 0, 0, 0], lastPluck = [-999, -999, -999, -999];
      var frames = 0, chordT = 0, target = null, set = ukeChordSet(mode), correct = 0, ended = false;
      var pos = 0, myList = mode === "my" ? ukeLoadMy() : []; // pos: 表示しているいちばん上のフレット − 1（§169）
      // §171 v0.90: 弦ごとの出口（自分の音・伴奏）・勉強の助け・耳コピ
      var outs = [null, null, null, null], backOuts = [null, null, null, null];
      var holdMode = !!cfg.hold || !!cfg.hybrid || !!cfg.smart; // §182: ホールド（タップで印を付けておく）
      // §185: スマート（鳴らしたあと 1か所目＝飾り・2か所目＝新しいコード）
      var smart = !!cfg.smart, smartArmed = false, smartFirst = null, smartOrn = null;
      var hybrid = !!cfg.hybrid, hybridArmed = false; // §184: ハイブリッド（鳴らしたあとの最初のタップで印を入れかえる）
      var showNotes = !!cfg.notes, showTones = !!cfg.tones, showFingers = cfg.fingers !== false;
      var ear = mode.indexOf("ear:") === 0 ? { level: mode.substring(4), opts: [], ans: -1, pick: -1, t: 0, reveal: 0, chord: null } : null;
      if (ear && ["easy", "normal", "hard"].indexOf(ear.level) < 0) { ear.level = "easy"; }
      if (ear && ear.level === "hard" && !C) { ear.level = "normal"; }
      if (mode === "my" && !myList.length) { mode = "free"; practice = false; }
      if (mode === "dict" && !C) { mode = "easy"; set = ukeChordSet("easy"); }
      // §170 v0.89: シーケンサーの曲に合わせて弾く
      var seqData = mode === "seq" && cfg.seq && C ? ukeSeqClean(cfg.seq) : null, seqS = null, seqIdx = 0, seqPass = 0, seqPasses = 1;
      var seqRow = -1, seqHit = {}, seqChords = 0, seqNext = "", SEQ_START = 30, seqProg = 0, seqCount = 0, seqMix = null;
      // §178: 録音（合わせて弾く画面で、弾いた音をトラックに記録）
      var recId = mode === "seq" && (cfg.rec === "rec1" || cfg.rec === "rec2") ? cfg.rec : null, recNotes = [], recDirty = false, recOff = Number(cfg.recOffset) || 0;
      var lyrP = [], lyrNow = ""; // 歌詞（曲の予定を作ったあとで並べる）
      if (seqData) {
        seqS = ukeSeqSchedule(seqData, lowG);
        lyrP = ukeLyricPlace(seqData, seqS);
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
          var pnm = progChords[progIdx % progChords.length], psp = C ? C.parse(pnm) : null;
          target = UKE_BY_NAME[pnm] || (psp ? { name: C.name(psp), shape: (ukeVoicePos(psp, lowG, cfg.posPref)[0] || [0, 0, 0, 0]) } : null);
          if (target && psp && UKE_BY_NAME[pnm]) { target = { name: pnm, shape: UKE_BY_NAME[pnm].shape }; }
          progDeg = prog.deg ? prog.deg[progIdx % prog.deg.length] : "";
          chordT = 0;
          pos = ukeFitPos(target.shape, pos, L.frets);
          return;
        }
        var n;
        if (mode === "dict" || mode === "my") {
          var tries = 0;
          do {
            if (mode === "dict") {
              var q = C.QUALITIES[randInt(0, C.QUALITIES.length - 1)], sp = { root: randInt(0, 11), parts: q.parts, bass: null };
              var vs = ukeVoicePos(sp, lowG, cfg.posPref);
              n = vs.length ? { name: C.name(sp), shape: vs[0] } : null;
            } else {
              n = myList[randInt(0, myList.length - 1)];
            }
            tries++;
          } while ((!n || (target && n.name === target.name && (mode === "dict" || myList.length > 1))) && tries < 20);
          target = n;
          chordT = 0;
          pos = ukeFitPos(target.shape, pos, L.frets);
          return;
        }
        do { n = set[randInt(0, set.length - 1)]; } while (set.length > 1 && target && n.name === target.name);
        target = n;
        chordT = 0;
        pos = ukeFitPos(target.shape, pos, L.frets);
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
        pos = ukeFitPos(target.shape, pos, L.frets);
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
          if (!seqHit[hk]) { seqHit[hk] = true; correct++; api.addScore(100); msg += "  +100"; if (holdMode) { sticky = {}; } }
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
          if (holdMode) { sticky = {}; }
          nextChord();
        } else {
          msg = "おしい！";
          msgGood = false;
          msgT = 50;
          wrong = bad;
          wrongT = 60;
        }
      }
      function recSave() {
        if (!recId || !recDirty) { return; }
        recDirty = false;
        var st = ukeSeqLoad();
        st.cur.tracks[recId].notes = recNotes.slice(0, UKE_REC_MAX);
        st.cur.tracks[recId].on = true;
        ukeSeqSave(st);
      }
      if (recId) { ukeRecFlush = recSave; }
      function pluck(s, delay, vel) {
        sound(s, delay, vel);
        if (hybrid && ukeCountKeys(sticky) > 0) { hybridArmed = true; }
        if (smart && ukeCountKeys(sticky) > 0) { smartArmed = true; smartFirst = null; smartOrn = null; }
        if (recId && seqS && seqPass === 0 && !ended) {
          var rt = (frames - SEQ_START) / 60 + (delay || 0);
          if (rt >= seqS.lead && recNotes.length < UKE_REC_MAX) {
            var rb = seqS.beatAt ? seqS.beatAt(rt) : (rt - seqS.lead) / seqS.spb;
            recNotes.push([Math.round((rb + recOff) * 1000) / 1000, ukeMidi(s, current()[s], lowG), Math.round((vel || 0.8) * 100) / 100]);
            recDirty = true;
          }
        }
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
          var play = ev.kind === "click" ? seqData.metronome || ev.t < seqS.lead : (seqData.backing && ev.track !== recId);
          if (play && UG && ac) {
            if (!seqMix) { seqMix = ukeMixer(UG, ac, seqS.tracks); }
            ukeSeqPlayEvent(UG, ac, ev, ac.currentTime + Math.max(0, ev.t + off - songT), lowG, 0.55, backOuts, seqMix, seqS.tracks);
          }
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
          recSave();
          api.gameOver(recId ? "録音おわり" : (correct >= seqChords * seqPasses ? "CLEAR!" : "おつかれさま！"));
          return;
        }
        var cur = -1, nx = -1, i;
        for (i = 0; i < seqS.rows.length; i++) {
          var r = seqS.rows[i];
          if (ukeIsMark(r.type)) { continue; }
          if (songT >= r.t0 + off && songT < r.t1 + off) { cur = i; }
          else if (r.t0 + off > songT && r.type === "chord" && nx < 0) { nx = i; }
        }
        // いまの行のどこまで進んだか（0〜1）と、カウントインの数字
        lyrNow = "";
        if (lyrP.length && seqPass === 0) { var lb = ukeTimeToBeat(seqS, songT); for (var li = 0; li < lyrP.length; li++) { if (lyrP[li].beat <= lb + 1e-6) { lyrNow = lyrP[li].w; } } }
        seqProg = cur >= 0 ? Math.max(0, Math.min(1, (songT - seqS.rows[cur].t0 - off) / Math.max(0.01, seqS.rows[cur].t1 - seqS.rows[cur].t0))) : 0;
        seqCount = seqPass === 0 && songT >= 0 && songT < seqS.lead ? Math.floor(songT / seqS.spb) + 1 : 0;
        if (cur !== seqRow) {
          seqRow = cur;
          var cr = cur >= 0 ? seqS.rows[cur] : null;
          target = cr && cr.type === "chord" && cr.ok ? { name: cr.name, shape: cr.shape } : null;
          chordT = 0;
          if (target) { pos = ukeFitPos(target.shape, pos, L.frets); }
        }
        seqNext = nx >= 0 ? seqS.rows[nx].name : (seqPass + 1 < seqPasses && seqS.rows.length ? "（もう1周）" : "おわり");
      }
      // dir: "up" なら A→G の順に、少しやわらかく（§182）
      function strumAll(dir) {
        if (ear) { earPlay(0); return; }
        for (var i = 0; i < 4; i++) { var s = dir === "up" ? 3 - i : i; pluck(s, i * 0.025, dir === "up" ? 0.72 : 0.85); }
      }
      // ホールドの印: 1本の弦に1つ。同じ所をもう一度押したら消す
      function holdToggle(cell) {
        if (hybrid && hybridArmed) { sticky = {}; hybridArmed = false; }
        if (smart && smartArmed) {
          var k0 = cell.s + "," + cell.f;
          if (!smartFirst) {
            // 1か所目: 飾り（土台は残してその弦だけ変える）
            smartFirst = { cell: cell, removal: !!sticky[k0] };
            smartOrn = smartFirst.removal ? null : k0;
          } else {
            // 2か所目: 新しいコード（1か所目と2か所目だけで作り直す。外すタップは入れない）
            sticky = {};
            if (!smartFirst.removal) { sticky[smartFirst.cell.s + "," + smartFirst.cell.f] = smartFirst.cell; }
            smartArmed = false; smartFirst = null; smartOrn = null;
            msg = "新しいコード"; msgGood = true; msgT = 30;
          }
        }
        var key = cell.s + "," + cell.f, had = !!sticky[key];
        for (var k in sticky) { if (sticky.hasOwnProperty(k) && sticky[k].s === cell.s) { delete sticky[k]; } }
        if (!had) { sticky[key] = cell; }
      }

      if (ear) { practice = true; earNext(); } else { nextChord(); }

      return {
        input: function (action, down) {
          if (!down) { return; }
          if (action === "strum") { strumAll(); }
          else if (action === "strumUp") { strumAll("up"); }
          else if (action === "clear") {
            var hadAny = false;
            for (var hk2 in sticky) { if (sticky.hasOwnProperty(hk2)) { hadAny = true; } }
            sticky = {};
            hybridArmed = false; smartArmed = false; smartFirst = null; smartOrn = null;
            msg = hadAny ? "✋ 印を全部はなしました" : "✋ はなす＝ホールドした印を消す";
            msgGood = true;
            msgT = 45;
          }
          else if (action === "posUp") { pos = Math.max(0, pos - 1); }
          else if (action === "posDown") { pos = Math.min(UKE_TOTAL_FRETS - L.frets, pos + 1); }
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
            if (y >= L.strumY) { earPlay(0); }
            return;
          }
          if (type === "down" && L.compact && x < 30 && y >= L.nut && y <= L.nut + L.frets * L.fh) {
            // 引きのビュー: 左のフレット番号の列で ▲（上半分）・▼（下半分）
            if (y < L.nut + L.frets * L.fh / 2) { pos = Math.max(0, pos - 1); } else { pos = Math.min(UKE_TOTAL_FRETS - L.frets, pos + 1); }
            return;
          }
          if (type === "down") {
            var cell = ukeCellAt(x, y, L);
            if (cell) {
              cell = { s: cell.s, f: cell.f + pos };
              if (kind === "mouse" || holdMode) { holdToggle(cell); }
              else { fingers[id] = cell; }
              return;
            }
            if (y >= L.strumY) {
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
              var c2 = ukeCellAt(x, y, L);
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
          if (recId && frames % 60 === 0) { recSave(); }
        },
        draw: function (ctx) {
          var s, f, i;
          var cur = current(), held = presses();
          // ボディと指板
          ctx.fillStyle = "#3b2414";
          ctx.fillRect(0, 0, W, L.h);
          ctx.fillStyle = "#5c3a1e";
          ctx.fillRect(UKE_STRX[0] - 22, L.nut, UKE_STRX[3] - UKE_STRX[0] + 44, L.frets * L.fh);
          ctx.fillStyle = "#c68642";
          ctx.beginPath(); ctx.arc(W / 2, L.holeY, L.body, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#1b0f07";
          ctx.beginPath(); ctx.arc(W / 2, L.holeY, L.hole, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "#e9c46a";
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(W / 2, L.holeY, L.hole + 4, 0, Math.PI * 2); ctx.stroke();
          // ナット・フレット（ポジションが上がっているときはナットのかわりに線）
          ctx.fillStyle = pos === 0 ? "#f1e4c8" : "#8d6e4a";
          ctx.fillRect(UKE_STRX[0] - 22, L.nut - 4, UKE_STRX[3] - UKE_STRX[0] + 44, pos === 0 ? 4 : 2);
          ctx.strokeStyle = "#c0c0c0";
          ctx.lineWidth = 1.5;
          for (f = 1; f <= L.frets; f++) {
            var fy = L.nut + f * L.fh;
            ctx.beginPath(); ctx.moveTo(UKE_STRX[0] - 22, fy); ctx.lineTo(UKE_STRX[3] + 22, fy); ctx.stroke();
          }
          ctx.fillStyle = "#f1e4c8";
          var MARKS = [3, 5, 7, 10, 12, 15];
          for (i = 0; i < MARKS.length; i++) {
            var mk = MARKS[i] - pos;
            if (mk < 1 || mk > L.frets) { continue; }
            ctx.beginPath(); ctx.arc(W / 2, L.nut + (mk - 0.5) * L.fh, 3, 0, Math.PI * 2); ctx.fill();
            if (MARKS[i] === 12) { ctx.beginPath(); ctx.arc(W / 2 - 22, L.nut + (mk - 0.5) * L.fh, 3, 0, Math.PI * 2); ctx.arc(W / 2 + 22, L.nut + (mk - 0.5) * L.fh, 3, 0, Math.PI * 2); ctx.fill(); }
          }
          ctx.fillStyle = "#e9c46a";
          ctx.font = "bold 9px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          // フレットが細いときは番号を間引く（奇数と目印のフレットだけ）
          for (f = 1; f <= L.frets; f++) {
            var fnum = f + pos;
            if (L.fh < 12 && fnum % 2 === 0 && fnum !== 12) { continue; }
            ctx.fillText(String(fnum), 14, L.nut + (f - 0.5) * L.fh);
          }
          if (pos > 0) { ctx.fillText("▲", 14, L.nut - 11); }
          if (L.compact) {
            // 左のはしに小さく（フレット番号と重ならないように）
            ctx.fillStyle = "rgba(116,185,255,0.85)";
            ctx.font = "bold 8px sans-serif";
            ctx.fillText("▲", 4, L.nut + 6);
            ctx.fillText("▼", 4, L.nut + L.frets * L.fh - 6);
            ctx.font = "bold 9px sans-serif";
          }
          // 弦（鳴っている弦は揺らす）
          for (s = 0; s < 4; s++) {
            ctx.strokeStyle = ring[s] > 0 ? "#ffd166" : "#e0e0e0";
            ctx.lineWidth = 1 + (3 - s) * 0.3;
            var amp = ring[s] > 0 ? (ring[s] / 30) * 2.2 : 0;
            ctx.beginPath();
            ctx.moveTo(UKE_STRX[s], L.nut);
            for (var yy = L.nut; yy <= L.bottom; yy += 8) { ctx.lineTo(UKE_STRX[s] + Math.sin(yy / 6 + frames) * amp, yy); }
            ctx.stroke();
            ctx.fillStyle = "#e9c46a";
            ctx.fillText(UKE_STRINGS[s], UKE_STRX[s], L.nut - (L.frets > 7 ? 8 : 11));
          }
          // お手本（練習モード: やさしい・ふつうはいつも、むずかしいは4秒後）
          if (target && (mode !== "hard" || chordT >= 240)) {
            ctx.strokeStyle = "rgba(116,185,255,0.95)";
            ctx.lineWidth = 2;
            for (s = 0; s < 4; s++) {
              var tf = target.shape[s] - pos;
              if (target.shape[s] > 0 && tf >= 1 && tf <= L.frets) {
                ctx.beginPath(); ctx.arc(UKE_STRX[s], L.nut + (tf - 0.5) * L.fh, Math.min(11, L.fh * 0.42), 0, Math.PI * 2); ctx.stroke();
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
                for (f = 1; f <= L.frets; f++) {
                  var npc = ukeMidi(s, f + pos, lowG) % 12;
                  if (tpcs.indexOf(npc) < 0) { continue; }
                  ctx.strokeStyle = tsp && npc === tsp.root ? "rgba(255,118,117,0.9)" : "rgba(85,239,196,0.8)";
                  ctx.lineWidth = 1.5;
                  ctx.beginPath(); ctx.arc(UKE_STRX[s], L.nut + (f - 0.5) * L.fh, Math.min(5, L.fh * 0.3), 0, Math.PI * 2); ctx.stroke();
                }
              }
            }
          }
          if (showNotes && L.fh >= 14) {
            ctx.fillStyle = "rgba(241,228,200,0.75)";
            ctx.font = "7px sans-serif";
            ctx.textAlign = "left";
            for (s = 0; s < 4; s++) {
              for (f = 1; f <= L.frets; f++) { ctx.fillText(ukeNoteName(ukeMidi(s, f + pos, lowG)), UKE_STRX[s] + 5, L.nut + (f - 0.5) * L.fh - 7); }
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
              if (fg[s] && ff >= 1 && ff <= L.frets) { ctx.fillText(String(fg[s]), UKE_STRX[s], L.nut + (ff - 0.5) * L.fh); }
            }
          }
          // 押さえている指
          for (i = 0; i < held.length; i++) {
            var p = held[i], top = cur[p.s] === p.f, pf = p.f - pos;
            if (pf < 1 || pf > L.frets) { continue; }
            ctx.fillStyle = smartOrn === p.s + "," + p.f ? "rgba(116,220,255,0.95)" : (top ? (hybridArmed ? "rgba(255,209,102,0.55)" : "rgba(255,209,102,0.95)") : "rgba(255,209,102,0.45)");
            ctx.beginPath(); ctx.arc(UKE_STRX[p.s], L.nut + (pf - 0.5) * L.fh, Math.min(9, L.fh * 0.36), 0, Math.PI * 2); ctx.fill();
          }
          // ちがう弦に ×
          if (wrong) {
            ctx.fillStyle = "#ff7675";
            ctx.font = "bold 14px sans-serif";
            for (i = 0; i < wrong.length; i++) { ctx.fillText("×", UKE_STRX[wrong[i]], L.nut + L.frets * L.fh + 10); }
          } else {
            // 各弦のいまの音名
            ctx.fillStyle = "#f1e4c8";
            ctx.font = "bold 10px sans-serif";
            for (s = 0; s < 4; s++) { ctx.fillText(ukeNoteName(ukeMidi(s, cur[s], lowG)), UKE_STRX[s], L.nut + L.frets * L.fh + 10); }
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
            if (lyrNow) { ctx.fillStyle = "#ffd166"; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center"; ctx.fillText("♪ " + lyrNow, W / 2, L.h - 7); }
            if (recId) { ctx.fillStyle = Math.floor(frames / 20) % 2 ? "#ff7675" : "#d63031"; ctx.font = "bold 10px sans-serif"; ctx.textAlign = "left"; ctx.fillText("● 録音中 " + recNotes.length + "音", 106, 22); }
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
              var nx = progIdx + 1 < progTotal ? progChords[(progIdx + 1) % progChords.length] : "ゴール";
              if (progDeg) { hudText(ctx, progDeg, 6, 22); }
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
            ctx.fillText(String(seqCount), W / 2, L.holeY);
          } else if (msgT > 0) {
            ctx.fillStyle = msgGood ? "#55efc4" : "#ff7675";
            ctx.font = "bold 16px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(msg, W / 2, L.holeY);
          } else if (ear) {
            hudText(ctx, "タップでもう一度聞く", W / 2, L.holeY, "center");
          } else if (holdMode && ukeCountKeys(sticky) > 0) {
            ctx.fillStyle = "rgba(255,209,102,0.85)"; ctx.font = "bold 9px sans-serif"; ctx.textAlign = "center";
            ctx.fillText(smart ? "スマート ／ 1か所＝飾り・2か所目から新しいコード" : (hybrid ? "ハイブリッド ／ 鳴らしたあとに押さえると入れかわる" : "ホールド中 ／ ✋ はなす＝印を全部消す"), W / 2, Math.min(L.h - 6, L.holeY + L.hole + 12));
          } else if (frames < 300 && !held.length) {
            hudText(ctx, "ここを横にスワイプ", W / 2, L.holeY, "center");
          }
        }
      };
    }
  });

  // テスト・他ファイル用の読み取り口
  window.UGUkulele = {
    chords: UKE_CHORDS, chordSet: ukeChordSet, progressions: UKE_PROGRESSIONS, progCats: UKE_PROG_CATS, progChords: ukeProgChords, byName: UKE_BY_NAME, PROG_LOOPS: UKE_PROG_LOOPS, chordName: ukeChordName, midi: ukeMidi, cellAt: ukeCellAt, crossed: ukeCrossed, frets: ukeFrets,
    STRX: UKE_STRX, NUT_Y: UKE_NUT_Y, FH: UKE_FH, STRUM_Y: UKE_STRUM_Y,
    fingering: ukeFingering, velocity: ukeVelocity, stringOut: ukeStringOut, earBtn: ukeEarBtn, prefs: ukePrefs,
    tl: ukeTl, hist: ukeHist, timeToBeat: ukeTimeToBeat, rowAtBeat: ukeRowAtBeat,
    roll: ukeRoll, rollImport: ukeRollImport,
    tracksClean: ukeTracksClean, trackEvents: ukeTrackEvents, trackAudible: ukeTrackAudible, grooves: ukeGrooves, mixer: ukeMixer, TRACK_IDS: UKE_TRACK_IDS,
    arrangedToWritten: ukeArrangedToWritten, expand: ukeSeqExpand, sections: ukeSeqSections, lyricPlace: ukeLyricPlace, midiBytes: ukeMidiBytes, projectJson: ukeProjectJson, projectRead: ukeProjectRead, isMark: ukeIsMark,
    seqSection: ukeSeqSection, seqSemisAt: ukeSeqSemisAt, pick: ukePick,
    seqRec: ukeSeqRec, exportMidi: ukeSeqExportMidi, exportWav: ukeSeqExportWav,
    seqClean: ukeSeqClean, seqLoad: ukeSeqLoad, seqSave: ukeSeqSave, seqSchedule: ukeSeqSchedule, seqPresets: ukeSeqPresets, resolve: ukeResolve, SEQ_KEY: UKE_SEQ_KEY,
    countKeys: ukeCountKeys,
    markSet: ukeMarkSet, MARK_FRETS: UKE_MARK_FRETS,
    layout: ukeLayout, FRET_CHOICES: UKE_FRET_CHOICES, voicePos: ukeVoicePos, rowPos: ukeRowPos,
    ui: ukeUi, fitPos: ukeFitPos, voice: ukeVoice, detect: ukeDetect, loadMy: ukeLoadMy, saveMy: ukeSaveMy, addMy: ukeAddMy, MY_KEY: UKE_MY_KEY
  };
})();
