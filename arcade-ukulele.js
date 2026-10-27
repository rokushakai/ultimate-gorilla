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

  // ---------- §187 v0.99.6: 練習の記録・リズム判定 ----------
  var UKE_STATS_KEY = "ultimateGorillaUkuleleStatsV1", UKE_STATS_MAX = 400;
  function ukeStatsLoad() {
    var o = lsGet(UKE_STATS_KEY), out = {}, n = 0;
    if (!o || typeof o !== "object") { return out; }
    for (var k in o) {
      if (!o.hasOwnProperty(k) || n >= UKE_STATS_MAX) { continue; }
      var r = o[k];
      if (!r || !(r.n > 0)) { continue; }
      out[String(k).slice(0, 24)] = { n: Math.round(r.n), ok: Math.max(0, Math.min(Math.round(r.n), Math.round(r.ok || 0))), t: Math.max(0, Number(r.t) || 0) };
      n++;
    }
    return out;
  }
  function ukeStatsAdd(name, ok, secs) {
    if (!name) { return; }
    var st = ukeStatsLoad(), r = st[name] || { n: 0, ok: 0, t: 0 };
    r.n++;
    if (ok) { r.ok++; r.t += Math.max(0, Math.min(60, secs || 0)); }
    st[name] = r;
    lsSet(UKE_STATS_KEY, st);
  }
  // 苦手な順（正解率の低い順 → 平均の秒が長い順）[{ name, n, ok, rate, avg }]
  function ukeWeakList(limit) {
    var st = ukeStatsLoad(), out = [];
    for (var k in st) {
      if (!st.hasOwnProperty(k)) { continue; }
      var r = st[k];
      out.push({ name: k, n: r.n, ok: r.ok, rate: r.ok / r.n, avg: r.ok ? r.t / r.ok : 99 });
    }
    out.sort(function (a, b) { return a.rate - b.rate || b.avg - a.avg || a.name.localeCompare(b.name); });
    return limit ? out.slice(0, limit) : out;
  }
  // §188: 1分間チェンジの組み合わせと自己ベスト
  var UKE_CHANGE_PAIRS = [["C", "Am"], ["C", "F"], ["Am", "F"], ["C", "G7"], ["F", "G7"], ["G", "Em"], ["Am", "Dm"], ["D", "A"]];
  var UKE_BEST_KEY = "ultimateGorillaUkuleleBestV1", UKE_STRUM_BPMS = [60, 80, 100, 120];
  function ukeBestLoad() { var o = lsGet(UKE_BEST_KEY); return o && typeof o === "object" ? o : {}; }
  function ukeBestSet(key, n) {
    var o = ukeBestLoad(), old = Math.max(0, Math.round(Number(o[key]) || 0));
    if (n <= old) { return false; }
    o[key] = n;
    lsSet(UKE_BEST_KEY, o);
    return true;
  }
  // ストローク練習の音符（カウントイン1小節のあと8小節）[{ t, dir }]
  function ukeStrumNotes(pattern, bpm) {
    var pat = C.seqPattern(pattern), spb = 60 / bpm, unit = 4 / pat.length, out = [];
    for (var bar = 0; bar < 8; bar++) {
      for (var k = 0; k < pat.length; k++) {
        var ch = pat.charAt(k);
        if (ch === "D" || ch === "U") { out.push({ t: (4 + bar * 4 + k * unit) * spb, dir: ch === "D" ? "down" : "up", res: "" }); }
      }
    }
    return out;
  }
  // ずれ（秒・＋はおそい）→ { id, label, pts, combo }
  function ukeRhythmGrade(d) {
    var a = Math.abs(d);
    if (a <= 0.07) { return { id: "perfect", label: "PERFECT", pts: 20, combo: true }; }
    if (a <= 0.14) { return { id: "great", label: "GREAT", pts: 10, combo: true }; }
    if (a <= 0.22) { return { id: "good", label: "GOOD", pts: 5, combo: false }; }
    return { id: d < 0 ? "early" : "late", label: d < 0 ? "はやい" : "おそい", pts: 0, combo: false };
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
    return { lowG: !!p0.lowG, notes: !!p0.notes, tones: !!p0.tones, fingers: p0.fingers !== false, next: p0.next !== false,
      latency: Math.max(-200, Math.min(200, Math.round((Number(p0.latency) || 0) / 10) * 10)), strumBpm: UKE_STRUM_BPMS.indexOf(Number(p0.strumBpm)) >= 0 ? Number(p0.strumBpm) : 80, frets: ukeLayout(p0.frets).frets, posPref: ukePosOk(p0.posPref) ? p0.posPref : "auto", view: p0.view === "compact" ? "compact" : "normal", hold: p0.hold === "hold" || p0.hold === "hybrid" || p0.hold === "smart" ? p0.hold : "real", progKey: Math.max(0, Math.min(11, Math.round(Number(p0.progKey) || 0))) };
  }
  function ukeSavePrefs(p1) {
    lsSet(UKE_PREFS_KEY, { lowG: !!p1.lowG, notes: !!p1.notes, tones: !!p1.tones, fingers: !!p1.fingers, next: p1.next !== false,
      latency: Math.max(-200, Math.min(200, Math.round((Number(p1.latency) || 0) / 10) * 10)), strumBpm: UKE_STRUM_BPMS.indexOf(Number(p1.strumBpm)) >= 0 ? Number(p1.strumBpm) : 80, frets: ukeLayout(p1.frets).frets, posPref: ukePosOk(p1.posPref) ? p1.posPref : "auto", view: p1.view === "compact" ? "compact" : "normal", hold: p1.hold === "hold" || p1.hold === "hybrid" || p1.hold === "smart" ? p1.hold : "real", progKey: Math.max(0, Math.min(11, Math.round(Number(p1.progKey) || 0))) });
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
      loopOn: false, loopA: 0, loopB: 3, pos: "auto", tracks: null, arr: [], lyrics: { id: 0 }, rate: 100, rateUp: false, dyn: false, rev: -1, dly: -1,
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
    out.rate = UKE_RATES.indexOf(Number(out.rate)) >= 0 ? Number(out.rate) : 100;
    out.rateUp = !!out.rateUp;
    out.dyn = !!out.dyn;
    // §197: 響き（-1＝いつもの設定）
    out.rev = [-1, 0, 1, 2, 3].indexOf(Number(out.rev)) >= 0 ? Number(out.rev) : -1;
    out.dly = [-1, 0, 1, 2, 3].indexOf(Number(out.dly)) >= 0 ? Number(out.dly) : -1;
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
      else {
        // §189: 行ごとの奏法（"song"＝曲の奏法）とその行のパターン
        var rsty = C.SEQ_STYLES.some(function (st0) { return st0.id === r.style; }) ? r.style : "song";
        rows.push({ type: "chord", name: String(r.name || "").slice(0, 24), len: C.seqLen(r.len).id, pos: ukePosOk(r.pos) ? r.pos : "auto", style: rsty, pattern: rsty === "pat" ? C.seqPattern(r.pattern) : "" });
      }
    }
    out.rows = rows;
    // §174 v0.93: 区間ループの行の番号（行の範囲に収める）
    var last = Math.max(0, rows.length - 1);
    out.loopOn = !!out.loopOn;
    out.loopA = Math.max(0, Math.min(last, Math.round(Number(out.loopA) || 0)));
    out.loopB = Math.max(0, Math.min(last, Math.round(Number(out.loopB) || 0)));
    return out;
  }
  // §189: 練習テンポ（％）で鳴らすための写し（曲の BPM とテンポの行を遅くする）
  var UKE_RATES = [50, 60, 70, 80, 90, 100];
  // rate は 30〜100（ループごとに +5% で 55・65… にもなる）
  function ukeSeqAtRate(seq, rate) {
    rate = Math.max(30, Math.min(100, Number(rate) || 100));
    if (rate === 100) { return seq; }
    var out = {}, k;
    for (k in seq) { if (seq.hasOwnProperty(k)) { out[k] = seq[k]; } }
    out.bpm = seq.bpm * rate / 100;
    out.rows = seq.rows.map(function (r) {
      if (r.type !== "tempo") { return r; }
      var c = {}; for (var k2 in r) { if (r.hasOwnProperty(k2)) { c[k2] = r[k2]; } }
      c.bpm = r.bpm * rate / 100;
      return c;
    });
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
  var ukePick = { row: -1, tab: "rec", root: 0, qual: "maj" };
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
  // §193 v1.02: 追加トラック（x1〜x8。tracks.xs が並び順）
  var UKE_X_MAX = 8, UKE_X_CH = [3, 7, 8, 10, 11, 12, 13, 14];
  // [id, 名前, 音色, 種類 "chord" | "notes", 鳴らし方, 高さ（オクターブ）, 音量]
  var UKE_X_PRESETS = [
    ["strings", "&#x1F3BB; ストリングス", 48, "chord", "hold", 0, 60], ["strings8", "&#x1F3BB; ストリングス刻み", 48, "chord", "e", 0, 55],
    ["pizz", "&#x1F3BB; ピチカート", 45, "chord", "q", 0, 65], ["synpad", "&#x1F30C; シンセパッド", 88, "chord", "hold", 0, 55],
    ["warm", "&#x1F32B;&#xFE0F; ウォームパッド", 89, "chord", "hold", -1, 55], ["choir", "&#x1F47C; コーラス", 52, "chord", "hold", 0, 55],
    ["lead", "&#x1F39B;&#xFE0F; シンセリード", 80, "chord", "arp16", 1, 50], ["arp", "&#x1F39B;&#xFE0F; シンセアルペジオ", 81, "chord", "arpud", 0, 50],
    ["poly", "&#x1F39B;&#xFE0F; ポリシンセ", 90, "chord", "off", 0, 55], ["piano", "&#x1F3B9; ピアノ", 0, "chord", "q", 0, 65],
    ["ep", "&#x1F3B9; エレピ", 4, "chord", "half", 0, 60], ["organ", "&#x1FA88; オルガン", 16, "chord", "hold", 0, 50],
    ["brass", "&#x1F3BA; ブラス", 61, "chord", "stab", 0, 60], ["bell", "&#x1F514; ベル", 9, "chord", "arp8", 1, 50],
    ["mel", "&#x1F3B5; メロディ打ち込み", 73, "notes", "hold", 0, 75], ["synmel", "&#x1F39B;&#xFE0F; シンセメロディ打ち込み", 80, "notes", "hold", 0, 70]
  ];
  var UKE_X_PLAYS = [["hold", "伸ばす（小節ごと）"], ["half", "2拍ごと"], ["q", "4分"], ["e", "8分"], ["off", "裏打ち"], ["stab", "キメ（1拍目と2拍目の裏）"],
    ["arp8", "アルペジオ8分（上り）"], ["arp16", "アルペジオ16分（上り）"], ["arpud", "アルペジオ16分（上り下り）"]];
  function ukeXPreset(id) { for (var i = 0; i < UKE_X_PRESETS.length; i++) { if (UKE_X_PRESETS[i][0] === id) { return UKE_X_PRESETS[i]; } } return null; }
  // 鳴らすトラックの id（決まったトラック＋追加トラック）
  function ukeTrackIds(tracks) { return tracks && tracks.xs && tracks.xs.length ? UKE_TRACK_IDS.concat(tracks.xs) : UKE_TRACK_IDS; }
  function ukeXClean(s0) {
    var pr = ukeXPreset(s0.preset) || UKE_X_PRESETS[0], o = {
      preset: pr[0], kind: s0.kind === "notes" ? "notes" : (s0.kind === "chord" ? "chord" : pr[3]),
      name: String(s0.name === undefined ? pr[1].replace(/&#x[0-9A-F]+;/g, "").replace(/^\s+/, "") : s0.name).slice(0, 12),
      on: s0.on === undefined ? true : !!s0.on, mute: !!s0.mute, solo: !!s0.solo, genre: !!s0.genre,
      vol: Math.max(0, Math.min(100, Math.round(s0.vol === undefined ? pr[6] : Number(s0.vol) || 0))),
      pan: [-0.6, 0, 0.6].indexOf(Number(s0.pan)) >= 0 ? Number(s0.pan) : 0,
      prog: Math.max(0, Math.min(127, Math.round(s0.prog === undefined ? pr[2] : Number(s0.prog) || 0))),
      play: UKE_X_PLAYS.some(function (p) { return p[0] === s0.play; }) ? s0.play : pr[4],
      oct: [-1, 0, 1].indexOf(Number(s0.oct)) >= 0 ? Number(s0.oct) : (s0.oct === undefined ? pr[5] : 0),
      notes: []
    };
    var mn = o.kind === "notes" && Array.isArray(s0.notes) ? s0.notes : [];
    for (var q = 0; q < mn.length && o.notes.length < UKE_MEL_MAX; q++) {
      var b1 = mn[q] && ukeNum(mn[q][0], 0, 4096), d1 = mn[q] && ukeNum(mn[q][1], 0.0625, 32), m1 = mn[q] && ukeNum(mn[q][2], 0, 127), v1 = mn[q] && ukeNum(mn[q][3], 0.1, 1);
      if (b1 !== null && d1 !== null && m1 !== null) { o.notes.push(v1 !== null && v1 !== 0.8 ? [b1, d1, Math.round(m1), v1] : [b1, d1, Math.round(m1)]); }
    }
    return o;
  }
  // 名前・音色の情報（追加トラックは自分の名前）
  function ukeTrackName(tracks, id) { return UKE_TRACK_INFO[id] ? UKE_TRACK_INFO[id].name : (ukeXPreset(tracks[id].preset)[1].split(" ")[0] + " " + I.escHtml(tracks[id].name)); }
  function ukeXAdd(tracks, presetId) {
    if (!ukeXPreset(presetId) || tracks.xs.length >= UKE_X_MAX) { return null; }
    for (var n = 1; n <= UKE_X_MAX; n++) {
      var id = "x" + n;
      if (tracks.xs.indexOf(id) < 0) { tracks[id] = ukeXClean({ preset: presetId }); tracks.xs.push(id); return id; }
    }
    return null;
  }
  function ukeXRemove(tracks, id) { var at = tracks.xs.indexOf(id); if (at < 0) { return false; } tracks.xs.splice(at, 1); delete tracks[id]; return true; }
  function ukeXMove(tracks, id, d) {
    var at = tracks.xs.indexOf(id), to = at + d;
    if (at < 0 || to < 0 || to >= tracks.xs.length) { return false; }
    tracks.xs.splice(at, 1); tracks.xs.splice(to, 0, id);
    return true;
  }
  function ukeNum(v, lo, hi) { var n = Number(v); return isFinite(n) && n >= lo && n <= hi ? n : null; }
  // §191 v1.00: 1小節の文字のパターン（R 根音 / 3 / 5 / 6 / 7 / 8 オクターブ上 / v 下の5度 / A 次の根音へ半音 / - 休み）
  var UKE_BASS_STEPS = [
    ["oct", "オクターブ（ディスコ）", "R8R8R8R8"], ["pop", "ポップス", "R--RR-5-"], ["rock", "ロック（刻み）", "RRRRRRRA"],
    ["sync", "シンコペーション", "R--R--R-"], ["ballad", "バラード", "R-----5-"], ["two", "2ビート", "R---5---"],
    ["country", "カントリー", "R-v-R-v-"], ["arp", "分散（1-3-5-8）", "R358R358"], ["boogie", "ブギ", "R3567653"],
    ["motown", "モータウン", "R--8R-5A"], ["bossa", "ボサノバ", "R--5R--5"], ["reggae", "レゲエ", "--R-R-5-"],
    ["walk2", "ウォーキング（半音で近づく）", "R-3-5-A-"], ["funk", "ファンク（16分）", "R--R--8-R-5R--7-"],
    ["gallop", "ギャロップ（16分）", "R-RRR-RRR-RRR-RR"], ["shuffle", "シャッフル（3連）", "R-R5-5R-R5-5"],
    ["waltz", "ワルツ（3拍子）", "R-5-5-", 3], ["waltz2", "ワルツ・分散（3拍子）", "R-3-5-", 3]
  ];
  var UKE_BASS_PATTERNS = [["root", "ルート（伸ばす）"], ["root8", "ルート8分"], ["r5", "ルートと5度"], ["walk", "ウォーキング"]].concat(UKE_BASS_STEPS.map(function (b) { return [b[0], b[1]]; }));
  function ukeBassStep(id) {
    for (var i = 0; i < UKE_BASS_STEPS.length; i++) { if (UKE_BASS_STEPS[i][0] === id) { return { p: UKE_BASS_STEPS[i][2], meter: UKE_BASS_STEPS[i][3] || 4 }; } }
    return null;
  }
  // 文字 → 音（root は根音の MIDI。next はつぎのコード、left はコードの終わりまでの拍）
  function ukeBassTok(ch, root, hm, next, left) {
    var pt = hm.parts || [], has = function (p) { return pt.indexOf(p) >= 0; };
    var third = has("m") || has("dim") || has("dim7") ? 3 : 4, fifth = has("dim") || has("dim7") || has("b5") ? 6 : (has("aug") || has("s5") ? 8 : 7);
    if (ch === "3") { return root + third; }
    if (ch === "5") { return root + fifth; }
    if (ch === "6") { return root + 9; }
    if (ch === "7") { return root + (has("M7") ? 11 : (has("dim7") ? 9 : 10)); }
    if (ch === "8") { return root + 12; }
    if (ch === "v") { return root + fifth - 12 >= 28 ? root + fifth - 12 : root + fifth; }
    if (ch === "A") {
      if (next && left <= 1 + 1e-6) { var nr = ukeBassMidi(next.bass); return nr - 1 >= 40 ? nr - 1 : nr + 1; }
      return root + fifth;
    }
    return root;
  }
  var UKE_WALTZ = { id: "waltz", name: "ワルツ（3拍子）", hits: [[36, [0], 0.7], [42, [4, 8], 0.35], [38, [4, 8], 0.3]] };
  // §191: ウクレレだけのリズム（メロディくずしのリズムは変えない）。16マス＝1小節（3/4 は12マス）
  var UKE_E8 = [0, 2, 4, 6, 8, 10, 12, 14], UKE_S16 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
  var UKE_MORE_GROOVES = [
    { id: "rock", name: "ロック", hits: [[36, [0, 6, 8, 10], 0.75], [38, [4, 12], 0.7], [42, UKE_E8, 0.32]] },
    { id: "beat16", name: "16ビート", hits: [[36, [0, 7, 10], 0.7], [38, [4, 12], 0.6], [42, UKE_S16, 0.2]] },
    { id: "disco", name: "ディスコ", hits: [[36, [0, 4, 8, 12], 0.75], [38, [4, 12], 0.55], [46, [2, 6, 10, 14], 0.32], [42, [0, 4, 8, 12], 0.22]] },
    { id: "funk", name: "ファンク", hits: [[36, [0, 3, 10], 0.75], [38, [4, 12], 0.65], [38, [7, 9, 15], 0.18], [42, UKE_S16, 0.22]] },
    { id: "halftime", name: "ハーフタイム", hits: [[36, [0, 3, 10], 0.7], [38, [8], 0.7], [42, UKE_E8, 0.28]] },
    { id: "hiphop", name: "ヒップホップ", hits: [[36, [0, 7, 10], 0.8], [39, [4, 12], 0.55], [42, UKE_E8, 0.25], [46, [14], 0.25]] },
    { id: "punk", name: "パンク（2ビート）", hits: [[36, [0, 4, 8, 12], 0.75], [38, [2, 6, 10, 14], 0.65], [42, UKE_E8, 0.3]] },
    { id: "onedrop", name: "レゲエ（ワンドロップ）", hits: [[36, [8], 0.7], [37, [8], 0.5], [42, [2, 6, 10, 14], 0.3]] },
    { id: "ska", name: "スカ", hits: [[36, [0, 8], 0.6], [38, [4, 12], 0.5], [46, [2, 6, 10, 14], 0.3]] },
    { id: "march", name: "マーチ", hits: [[36, [0, 8], 0.6], [38, [0, 4, 6, 8, 12, 14], 0.5], [49, [0], 0.22]] },
    { id: "jazz", name: "ジャズ（ライド）", hits: [[51, [0, 4, 7, 8, 12, 15], 0.35], [44, [4, 12], 0.3], [36, [0], 0.35]] },
    { id: "samba", name: "サンバ", hits: [[36, [0, 4, 8, 12], 0.5], [41, [4, 12], 0.55], [54, UKE_S16, 0.18], [37, [2, 5, 9, 12, 15], 0.35]] },
    { id: "train", name: "トレインビート", hits: [[36, [0, 8], 0.6], [38, UKE_S16, 0.15], [38, [4, 12], 0.6]] },
    { id: "shaker", name: "アコースティック（シェイカー）", hits: [[36, [0, 8], 0.55], [37, [4, 12], 0.45], [70, UKE_S16, 0.2]] },
    { id: "cajon", name: "カホン風", hits: [[36, [0, 6, 10], 0.6], [38, [4, 12], 0.45], [37, [14], 0.3]] },
    { id: "tribal", name: "トライバル（タム）", hits: [[36, [0, 8], 0.6], [45, [3, 6, 11, 14], 0.5], [48, [4, 12], 0.5], [42, UKE_E8, 0.2]] },
    { id: "jwaltz", name: "ジャズワルツ（3拍子）", hits: [[51, [0, 4, 7, 8, 11], 0.3], [36, [0], 0.35], [37, [8], 0.3]] },
    { id: "swaltz", name: "スローワルツ8分（3拍子）", hits: [[36, [0], 0.6], [42, [0, 2, 4, 6, 8, 10], 0.25], [38, [8], 0.4]] },
    { id: "ballad3", name: "3拍子バラード", hits: [[36, [0], 0.55], [42, [0, 4, 8], 0.25], [37, [4, 8], 0.35], [51, [0], 0.18]] }
  ];
  // §192 v1.01: ジャンル（ウクレレの奏法・ベース・ドラム・パッドの組み合わせ）
  // [id, 名前, BPM, パターン（"q" などは奏法の id）, ベース, ドラム, パッドの音色（-1 なし）, ベースの音色（なしは 32）, スイング, スイングの音符, 拍子]
  var UKE_GENRES = [
    ["pop", "&#x1F3A4; ポップス", 100, "D-DUD-DU", "pop", "8beat", -1],
    ["rock", "&#x1F3B8; ロック", 130, "DDUUDDUU", "rock", "rock", -1, 33],
    ["ballad", "&#x1F319; バラード", 72, "43214321", "ballad", "ballad", 48],
    ["hawaii", "&#x1F33A; ハワイアン", 96, "D-DU-UDU", "two", "shaker", -1],
    ["reggae", "&#x1F334; レゲエ", 76, "xUxUxUxU", "reggae", "onedrop", 16, 33],
    ["ska", "&#x1F3BA; スカ", 150, "xUxUxUxU", "walk2", "ska", -1],
    ["bossa", "&#x2615; ボサノバ", 120, "P-21-P21", "bossa", "bossa", 4],
    ["jazz", "&#x1F3B7; ジャズ", 120, "q", "walk", "jazz", -1, 32, 0.67],
    ["blues", "&#x1F3B8; ブルース", 90, "D-UD-UD-UD-U", "shuffle", "shuffle", -1],
    ["funk", "&#x1F57A; ファンク", 100, "D-DUxUDUD-DUxUDU", "funk", "funk", -1, 36],
    ["disco", "&#x1FAA9; ディスコ", 118, "D-xUD-xU", "oct", "disco", 48, 38],
    ["country", "&#x1F920; カントリー", 120, "D-xUD-xU", "country", "train", -1],
    ["lofi", "&#x1F3A7; ローファイ", 85, "D---D-DU", "sync", "hiphop", 4, 32, 0.58, 0.25],
    ["punk", "&#x26A1; パンク", 170, "DDDDDDDD", "rock", "punk", -1, 33],
    ["samba", "&#x1F483; サンバ", 100, "D-xUD-xU", "sync", "samba", -1],
    ["march", "&#x1F941; マーチ", 112, "D-D-D-D-", "two", "march", -1],
    ["folk", "&#x1F343; フォーク", 92, "31423142", "r5", "cajon", -1],
    ["soul", "&#x1F49C; ソウル", 104, "D-DU-UDU", "motown", "beat16", 4],
    ["waltz", "&#x1F483; ワルツ", 140, "D-DUDU", "waltz", "waltz", -1, 32, 0.5, 0.5, 3],
    ["jwaltz", "&#x1F3B7; ジャズワルツ", 120, "D-D-D-", "waltz2", "jwaltz", -1, 32, 0.67, 0.5, 3],
    ["ballad3", "&#x1F319; 3拍子バラード", 72, "321212", "waltz2", "ballad3", 48, 32, 0.5, 0.5, 3],
    // §194 v1.03: [11] ジャンルの楽器（追加トラックの楽器 id。"楽器:音色:名前" で音色と名前を変える）。ドラム "" はドラムなし
    ["jpop", "&#x1F3A4; J-POP", 140, "D-DUD-DU", "oct", "beat16", -1, 33, 0.5, 0.5, 4, ["strings", "piano"]],
    ["anison", "&#x1F31F; アニソン", 175, "DDUUDDUU", "rock", "rock", -1, 34, 0.5, 0.5, 4, ["strings8", "lead"]],
    ["citypop", "&#x1F303; シティポップ", 110, "D-xU-UxU", "motown", "beat16", -1, 33, 0.5, 0.5, 4, ["ep", "brass"]],
    ["idol", "&#x1F380; アイドル", 160, "D-DUD-DU", "oct", "four", -1, 38, 0.5, 0.5, 4, ["arp", "strings"]],
    ["pballad", "&#x1F525; パワーバラード", 76, "D---D-DU", "ballad", "halftime", -1, 32, 0.5, 0.5, 4, ["strings", "piano"]],
    ["sprint", "&#x1F3C3; 疾走ロック", 180, "DDDDDDDD", "rock", "rock", -1, 34, 0.5, 0.5, 4, ["strings8"]],
    ["hardrock", "&#x1F918; ハードロック", 120, "D--D--D-D-DUxUDU", "rock", "rock", -1, 34, 0.5, 0.5, 4, ["organ"]],
    ["edm", "&#x1F4A5; EDM", 128, "D-D-D-D-", "oct", "four", -1, 38, 0.5, 0.5, 4, ["arp", "synpad", "poly"]],
    ["house", "&#x1F3E0; ハウス", 124, "xUxUxUxU", "sync", "four", -1, 38, 0.5, 0.5, 4, ["poly", "synpad"]],
    ["technopop", "&#x1F916; テクノポップ", 132, "DUDUDUDU", "oct", "disco", -1, 38, 0.5, 0.5, 4, ["lead", "poly"]],
    ["eurobeat", "&#x1F3CE;&#xFE0F; ユーロビート", 155, "D-xUD-xU", "oct", "four", -1, 38, 0.5, 0.5, 4, ["arp", "brass"]],
    ["synthwave", "&#x1F306; シンセウェーブ", 100, "D---D-DU", "gallop", "rock", -1, 38, 0.5, 0.5, 4, ["synpad", "arp"]],
    ["trap", "&#x1F48E; トラップ", 140, "4-3-2-1-", "ballad", "halftime", -1, 38, 0.5, 0.5, 4, ["bell", "warm"]],
    ["chillout", "&#x1F3D6;&#xFE0F; チルアウト", 90, "3-21D-DU", "ballad", "shaker", -1, 32, 0.5, 0.5, 4, ["warm", "bell"]],
    ["rnb", "&#x1F48B; R&amp;B", 88, "D---D-DU", "sync", "hiphop", -1, 33, 0.58, 0.25, 4, ["ep", "strings"]],
    ["neosoul", "&#x1F33F; ネオソウル", 78, "3-21D-DU", "funk", "hiphop", -1, 33, 0.62, 0.25, 4, ["ep"]],
    ["gospel", "&#x26EA; ゴスペル", 70, "D-UD-UD-UD-U", "shuffle", "shuffle", -1, 32, 0.5, 0.5, 4, ["organ", "choir"]],
    ["acidjazz", "&#x1F3A9; アシッドジャズ", 108, "D-DUxUDUD-DUxUDU", "funk", "funk", -1, 33, 0.5, 0.5, 4, ["organ", "brass"]],
    ["doowop", "&#x1F399;&#xFE0F; ドゥーワップ", 72, "D-UD-UD-UD-U", "shuffle", "ballad", -1, 32, 0.5, 0.5, 4, ["choir", "piano"]],
    ["swing", "&#x1F3BA; スウィング", 160, "q", "walk", "jazz", -1, 32, 0.67, 0.5, 4, ["brass", "piano"]],
    ["jballad", "&#x1F303; ジャズバラード", 64, "43214321", "two", "jazz", -1, 32, 0.67, 0.5, 4, ["piano"]],
    ["bluesrock", "&#x1F525; ブルースロック", 110, "D-UD-UD-UD-U", "boogie", "shuffle", -1, 34, 0.5, 0.5, 4, ["organ"]],
    ["rockabilly", "&#x1F576;&#xFE0F; ロカビリー", 180, "DUDUDUDU", "walk2", "train", -1, 32, 0.62, 0.5, 4, []],
    ["salsa", "&#x1F336;&#xFE0F; サルサ", 180, "D-xU-UxU", "sync", "latin", -1, 32, 0.5, 0.5, 4, ["piano", "brass"]],
    ["cumbia", "&#x1F99C; クンビア", 95, "xUxUxUxU", "r5", "latin", -1, 33, 0.5, 0.5, 4, ["organ:21:アコーディオン"]],
    ["tango", "&#x1F339; タンゴ", 120, "D--D--D-", "sync", "march", -1, 32, 0.5, 0.5, 4, ["organ:23:バンドネオン", "pizz"]],
    ["celtic", "&#x2618;&#xFE0F; ケルト", 110, "DUDUDUDU", "two", "cajon", -1, 32, 0.5, 0.5, 4, ["strings8:40:フィドル"]],
    ["afro", "&#x1F30D; アフロビート", 110, "D-xU-UxU", "funk", "tribal", -1, 33, 0.5, 0.5, 4, ["organ", "brass"]],
    ["okinawa", "&#x1F33A; 沖縄", 120, "D-DU-UDU", "two", "shaker", -1, 32, 0.67, 0.5, 4, ["bell:106:三線風"]],
    ["enka", "&#x1F376; 演歌", 70, "D---D-DU", "ballad", "ballad", -1, 32, 0.62, 0.5, 4, ["strings", "bell:107:琴"]],
    ["ondo", "&#x1F3EE; 音頭", 120, "D-D-D-D-", "two", "tribal", -1, 32, 0.67, 0.5, 4, ["bell:72:笛"]],
    ["bluegrass", "&#x1FA95; ブルーグラス", 170, "D-xUD-xU", "country", "train", -1, 32, 0.5, 0.5, 4, ["arp:105:バンジョー", "strings8:40:フィドル"]],
    ["campfire", "&#x1F525; キャンプファイヤー", 96, "D-DU-UDU", "r5", "shaker", -1, 32, 0.5, 0.5, 4, []],
    ["lullaby", "&#x1F37C; 子守唄", 60, "4-3-2-1-", "ballad", "", -1, 32, 0.5, 0.5, 4, ["bell"]],
    ["ambient", "&#x1F30C; アンビエント", 70, "4-3-2-1-", "ballad", "", -1, 32, 0.5, 0.5, 4, ["warm", "bell"]],
    ["minuet", "&#x1F3BB; メヌエット", 110, "321212", "waltz", "", -1, 32, 0.5, 0.5, 3, ["strings"]],
    ["cwaltz", "&#x1F920; カントリーワルツ", 100, "D-DUDU", "waltz2", "waltz", -1, 32, 0.5, 0.5, 3, []],
    ["chanson", "&#x1F956; シャンソン", 140, "D-D-D-", "waltz2", "swaltz", -1, 32, 0.5, 0.5, 3, ["organ:21:アコーディオン"]]
  ];
  // §194: ジャンルの見出し
  var UKE_GENRE_GROUPS = [
    ["J-POP・ロック", ["pop", "jpop", "anison", "citypop", "idol", "ballad", "pballad", "rock", "sprint", "hardrock", "punk"]],
    ["ダンス・電子", ["disco", "edm", "house", "technopop", "eurobeat", "synthwave", "trap", "lofi", "chillout"]],
    ["ソウル・ファンク", ["soul", "funk", "rnb", "neosoul", "gospel", "acidjazz", "doowop"]],
    ["ジャズ・ブルース", ["jazz", "swing", "jballad", "blues", "bluesrock", "rockabilly"]],
    ["ワールド", ["hawaii", "reggae", "ska", "bossa", "samba", "salsa", "cumbia", "tango", "celtic", "afro", "okinawa", "enka", "ondo"]],
    ["アコースティック・その他", ["country", "bluegrass", "folk", "campfire", "march", "lullaby", "ambient"]],
    ["3拍子", ["waltz", "jwaltz", "ballad3", "minuet", "cwaltz", "chanson"]]
  ];
  function ukeGenre(id) {
    for (var i = 0; i < UKE_GENRES.length; i++) {
      var gg = UKE_GENRES[i];
      if (gg[0] === id) {
        var isPat = gg[3].length > 2;
        var layers = (gg[11] || []).map(function (ly) { var lp = ly.split(":"); return { preset: lp[0], prog: lp[1] === undefined ? -1 : Number(lp[1]), name: lp[2] || "" }; });
        return { id: gg[0], name: gg[1], bpm: gg[2], style: isPat ? "pat" : gg[3], pattern: isPat ? gg[3] : "", bass: gg[4], drum: gg[5], pad: gg[6], bassProg: gg[7] === undefined ? 32 : gg[7], swing: gg[8] || 0.5, swingGrid: gg[9] || 0.5, meter: gg[10] || 4, layers: layers };
      }
    }
    return null;
  }
  function ukeGenresFor(meter) { return UKE_GENRES.map(function (gg) { return ukeGenre(gg[0]); }).filter(function (gn) { return gn.meter === (meter === 3 ? 3 : 4); }); }
  // 曲にジャンルを当てる（withBpm: テンポも / withLayers: ジャンルの楽器も。省略はする）。行ごとの奏法は変えない
  function ukeApplyGenre(seq, id, withBpm, withLayers) {
    var gn = ukeGenre(id);
    if (!gn) { return false; }
    seq.tracks = ukeTracksClean(seq.tracks);
    seq.style = gn.style;
    if (gn.pattern) { seq.pattern = gn.pattern; }
    seq.swing = gn.swing; seq.swingGrid = gn.swingGrid;
    if (withBpm) { seq.bpm = gn.bpm; }
    seq.tracks.bass.on = true; seq.tracks.bass.pattern = gn.bass; seq.tracks.bass.prog = gn.bassProg;
    seq.tracks.drum.on = !!gn.drum;
    if (gn.drum) { seq.tracks.drum.groove = gn.drum; }
    seq.tracks.pad.on = gn.pad >= 0;
    if (gn.pad >= 0) { seq.tracks.pad.prog = gn.pad; }
    var gfx = ukeGenreFx(id);
    seq.rev = gfx[0]; seq.dly = gfx[1];
    // §194: 前のジャンルの楽器（🎼）を消して、このジャンルの楽器を足す
    var tr = seq.tracks, i;
    for (i = tr.xs.length - 1; i >= 0; i--) { if (tr[tr.xs[i]].genre) { ukeXRemove(tr, tr.xs[i]); } }
    if (withLayers !== false) {
      for (i = 0; i < gn.layers.length; i++) {
        var nid = ukeXAdd(tr, gn.layers[i].preset);
        if (!nid) { break; }
        if (gn.layers[i].prog >= 0) { tr[nid].prog = gn.layers[i].prog; }
        if (gn.layers[i].name) { tr[nid].name = gn.layers[i].name; }
        tr[nid].genre = true;
      }
    }
    return true;
  }
  // §197: ジャンルの響き [リバーブ, ディレイ]（系統のふだん＋ジャンルごと）
  var UKE_GENRE_FX_GROUP = [[1, 0], [2, 1], [1, 0], [1, 0], [1, 0], [0, 0], [2, 0]];
  var UKE_GENRE_FX = {
    ballad: [3, 1], pballad: [3, 1], anison: [2, 1], idol: [2, 1], citypop: [2, 1],
    edm: [2, 2], synthwave: [3, 2], chillout: [3, 2], lofi: [1, 0], disco: [1, 1],
    gospel: [3, 0], funk: [0, 0], neosoul: [2, 0], doowop: [2, 1], jballad: [2, 0], rockabilly: [1, 2],
    reggae: [1, 2], ska: [1, 1], enka: [3, 1], tango: [2, 0], celtic: [2, 0], hawaii: [2, 0],
    country: [1, 0], march: [1, 0], lullaby: [3, 1], ambient: [3, 3], chanson: [1, 0]
  };
  function ukeGenreFx(id) {
    if (UKE_GENRE_FX[id]) { return UKE_GENRE_FX[id]; }
    for (var i = 0; i < UKE_GENRE_GROUPS.length; i++) { if (UKE_GENRE_GROUPS[i][1].indexOf(id) >= 0) { return UKE_GENRE_FX_GROUP[i]; } }
    return [1, 0];
  }
  // 鳴らしているあいだだけ曲の響きにする（止めたら ukeFxPop でもとの設定へ）
  var ukeFxSaved = null;
  function ukeFxPush(seq) {
    var UG = window.UGMelody;
    if (!UG || !UG.setFx || !UG.audio || !seq || (!(seq.rev >= 0) && !(seq.dly >= 0))) { return; }
    if (!ukeFxSaved) { ukeFxSaved = { rev: UG.audio.fxRev || 0, dly: UG.audio.fxDly || 0 }; }
    try { UG.setFx(seq.rev >= 0 ? seq.rev : ukeFxSaved.rev, seq.dly >= 0 ? seq.dly : ukeFxSaved.dly); } catch (e) {}
  }
  function ukeFxPop() {
    if (!ukeFxSaved) { return; }
    var sv = ukeFxSaved;
    ukeFxSaved = null;
    try { window.UGMelody.setFx(sv.rev, sv.dly); } catch (e) {}
  }
  // §196: おまかせ作曲（系統ごとの Aメロ・サビの進行の候補。UKE_GENRE_GROUPS と同じ順）
  var UKE_COMPOSE_PROGS = [
    [["fifties", "letitbe", "i37", "canon", "setsunai"], ["ohdo", "ohdo37", "komuro", "letitbe", "canonbass"]],
    [["setsunai", "komuro", "letitbe"], ["ohdo", "komuro", "setsunai", "b67"]],
    [["ohdo7", "marusa", "gyaku"], ["marusa", "ohdo7", "junkan"]],
    [["251", "junkan", "gyaku"], ["rhythm", "kareha", "junkan"]],
    [["three", "fifties", "andalusia"], ["letitbe", "three", "andalusia"]],
    [["three", "fifties", "canon"], ["letitbe", "fifties", "ohdo"]],
    [["fifties", "canon", "three"], ["ohdo", "letitbe", "sdm"]]
  ];
  var UKE_COMPOSE_BLUES = ["blues", "bluesrock", "rockabilly"];
  var UKE_COMPOSE_KEYS = [[0, "C"], [7, "G"], [5, "F"], [2, "D"], [9, "A"]];
  // 曲の行をジャンルに合わせて作りなおす。rnd は 0〜1 の乱数。{ genre, a, s, key } を返す（作れなければ null）
  function ukeCompose(seq, gid, rnd, withBpm, withLayers) {
    rnd = rnd || Math.random;
    function pick(a) { return a[Math.floor(rnd() * a.length) % a.length]; }
    var meter = seq.meter === 3 ? 3 : 4;
    if (!gid || !ukeGenre(gid) || ukeGenre(gid).meter !== meter) { gid = pick(ukeGenresFor(meter)).id; }
    var gi = 0, i, j;
    for (i = 0; i < UKE_GENRE_GROUPS.length; i++) { if (UKE_GENRE_GROUPS[i][1].indexOf(gid) >= 0) { gi = i; } }
    var blues = UKE_COMPOSE_BLUES.indexOf(gid) >= 0, cand = UKE_COMPOSE_PROGS[gi];
    var pa = ukeProgression(blues ? "blues" : pick(cand[0])), ps = ukeProgression(blues ? "blues" : pick(cand[1]));
    for (i = 0; !blues && ps.id === pa.id && i < 6; i++) { ps = ukeProgression(pick(cand[1])); }
    var kk = pick(UKE_COMPOSE_KEYS), len = meter === 3 ? "h." : "w", rows = [];
    var end = blues ? ["G7", "F7", "C7"] : (gi === 3 ? ["Dm7", "G7", "Cmaj7"] : ["F", "G7", "C"]);
    function add(chords, times) { for (var t = 0; t < times; t++) { for (var c = 0; c < chords.length; c++) { rows.push({ type: "chord", name: chords[c], len: len }); } } }
    rows.push({ type: "sec", name: "イントロ" }); add(ps.chords.slice(0, 2), 1);
    rows.push({ type: "sec", name: "Aメロ" }); add(pa.chords, pa.chords.length >= 8 ? 1 : 2);
    rows.push({ type: "sec", name: "サビ" }); add(ps.chords, ps.chords.length >= 8 ? 1 : 2);
    rows.push({ type: "sec", name: "アウトロ" }); add(end, 1);
    ukeApplyGenre(seq, gid, withBpm, withLayers);
    seq.rows = rows.slice(0, UKE_SEQ_MAX_ROWS);
    seq.arr = []; seq.loopOn = false; seq.loopA = 0; seq.loopB = 0; seq.loop = false;
    seq.key = kk[0]; seq.dyn = true;
    seq.tracks.drum.fill = "sec";
    for (j = 0; j < seq.rows.length; j++) { if (seq.rows[j].type === "chord") { seq.rows[j].pos = "auto"; seq.rows[j].style = "song"; seq.rows[j].pattern = ""; } }
    return { genre: gid, a: pa.name, s: ps.name, key: kk[1] };
  }
  // いまの曲がどのジャンルと同じか（なければ ""）
  function ukeGenreOf(seq) {
    var tr = seq.tracks, list = ukeGenresFor(seq.meter);
    if (!tr || !tr.bass.on) { return ""; }
    // §194: ジャンルの楽器（🎼 のトラック）があれば、それも同じこと
    var gly = (tr.xs || []).filter(function (x) { return tr[x].genre; }).map(function (x) { return tr[x].preset; }).join();
    for (var i = 0; i < list.length; i++) {
      var gn = list[i];
      if (gly && gly !== gn.layers.map(function (ly) { return ly.preset; }).join()) { continue; }
      if (Math.abs((seq.swing || 0.5) - gn.swing) > 1e-6) { continue; }
      if (seq.style === gn.style && (!gn.pattern || seq.pattern === gn.pattern) && tr.bass.pattern === gn.bass && (gn.drum ? tr.drum.on && tr.drum.groove === gn.drum : !tr.drum.on)) { return gn.id; }
    }
    return "";
  }
  function ukeGrooves() {
    var g = (window.UGMelody && window.UGMelody.grooves) || [];
    var out = [];
    for (var i = 0; i < g.length; i++) { if (g[i].hits) { out.push(g[i]); } }
    out.push(UKE_WALTZ);
    return out.concat(UKE_MORE_GROOVES);
  }
  // §189: マイリズム（6段 × 16マス）
  var UKE_DRUM_ROWS = [[36, "キック", 0.7], [38, "スネア", 0.6], [42, "ハイハット", 0.3], [46, "オープンHH", 0.3], [39, "クラップ", 0.5], [37, "リム", 0.45]];
  function ukeDrumCustomClean(c) {
    var out = [], have = {};
    if (Array.isArray(c)) {
      for (var i = 0; i < c.length; i++) {
        var h = c[i];
        if (!h || !Array.isArray(h[1])) { continue; }
        var row = null;
        for (var j = 0; j < UKE_DRUM_ROWS.length; j++) { if (UKE_DRUM_ROWS[j][0] === Number(h[0])) { row = UKE_DRUM_ROWS[j]; } }
        if (!row || have[row[0]]) { continue; }
        var st = [];
        for (var k = 0; k < h[1].length; k++) { var n = Math.round(Number(h[1][k])); if (n >= 0 && n < 16 && st.indexOf(n) < 0) { st.push(n); } }
        st.sort(function (a, b) { return a - b; });
        have[row[0]] = true;
        out.push([row[0], st, row[2]]);
      }
    }
    for (var r = 0; r < UKE_DRUM_ROWS.length; r++) { if (!have[UKE_DRUM_ROWS[r][0]]) { out.push([UKE_DRUM_ROWS[r][0], [], UKE_DRUM_ROWS[r][2]]); } }
    out.sort(function (a, b) { return ukeDrumRowIdx(a[0]) - ukeDrumRowIdx(b[0]); });
    return out;
  }
  function ukeDrumRowIdx(m) { for (var i = 0; i < UKE_DRUM_ROWS.length; i++) { if (UKE_DRUM_ROWS[i][0] === m) { return i; } } return 99; }
  // ほかのリズムを写す（マイリズムにない音は捨てる）
  function ukeDrumFrom(id) {
    var g = ukeGroove(id), out = [];
    for (var i = 0; i < g.hits.length; i++) { out.push([g.hits[i][0], g.hits[i][1].slice()]); }
    return ukeDrumCustomClean(out);
  }
  function ukeGroove(id) {
    if (id === "custom") { return null; }
    var g = ukeGrooves();
    for (var i = 0; i < g.length; i++) { if (g[i].id === id) { return g[i]; } }
    return g[0] || UKE_WALTZ;
  }
  // §195: フィルと展開
  var UKE_FILL_MODES = [["off", "なし"], ["4", "4小節ごと"], ["8", "8小節ごと"], ["sec", "セクションごと"]];
  // フィルの音（フィルの頭からのマス・音・強さ）。短い＝最後の1拍、長い＝最後の2拍
  var UKE_FILL_SHORT = [[0, 38, 0.5], [1, 38, 0.55], [2, 47, 0.6], [3, 45, 0.65]];
  var UKE_FILL_LONG = [[0, 38, 0.45], [1, 38, 0.5], [2, 50, 0.55], [3, 50, 0.55], [4, 48, 0.6], [5, 48, 0.6], [6, 45, 0.65], [7, 43, 0.7]];
  // セクションの名前 → 強さ（0 イントロ・アウトロ / 1 Aメロ / 2 そのほか / 3 サビ）
  function ukeSecEnergy(name) {
    name = String(name || "");
    if (/イントロ|アウトロ|エンディング|intro|outro|ending/i.test(name)) { return 0; }
    if (/^[AＡ]メロ|ヴァース|verse/i.test(name)) { return 1; }
    if (/サビ|コーラス|chorus/i.test(name)) { return 3; }
    return 2;
  }
  var UKE_SEC_GAIN = [0.7, 0.85, 1, 1.12];
  // どの小節にフィル（"s" 短い / "l" 長い）・クラッシュを入れるか。end＝最後の小節は「ジャーン」
  function ukeDrumFills(mode, secs, nBars, meter, loop) {
    var o = { fill: {}, crash: {}, end: false }, last = nBars - 1, b, i;
    if (mode !== "4" && mode !== "8" && mode !== "sec") { return o; }
    if (mode === "sec" && secs.length) {
      for (i = 0; i < secs.length; i++) {
        b = Math.round(secs[i].start / meter);
        if (Math.abs(secs[i].start - b * meter) > 1e-6 || b <= 0 || b > last) { continue; }
        o.fill[b - 1] = ukeSecEnergy(secs[i].name) === 3 ? "l" : "s";
        o.crash[b] = true;
      }
    } else {
      var every = mode === "4" ? 4 : 8;
      for (b = every; b <= last; b += every) { o.fill[b - 1] = "s"; o.crash[b] = true; }
    }
    if (loop) { o.fill[last] = o.fill[last] || "s"; }
    else if (nBars >= 2) { o.end = true; o.fill[last - 1] = o.fill[last - 1] || "s"; delete o.fill[last]; }
    return o;
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
      if (id === "drum") {
        o.groove = typeof s0.groove === "string" && s0.groove ? s0.groove : "8beat";
        // §195: フィル
        o.fill = UKE_FILL_MODES.some(function (f) { return f[0] === s0.fill; }) ? s0.fill : "off";
        // マイリズム（はじめは 8ビートと同じ形）
        o.custom = ukeDrumCustomClean(s0.custom || [[36, [0, 8, 10]], [38, [4, 12]], [42, [0, 2, 4, 6, 8, 10, 12, 14]]]);
      }
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
          var b1 = mn[q] && ukeNum(mn[q][0], 0, 4096), d1 = mn[q] && ukeNum(mn[q][1], 0.0625, 32), m1 = mn[q] && ukeNum(mn[q][2], 0, 127), v1 = mn[q] && ukeNum(mn[q][3], 0.1, 1);
          if (b1 !== null && d1 !== null && m1 !== null) { o.notes.push(v1 !== null && v1 !== 0.8 ? [b1, d1, Math.round(m1), v1] : [b1, d1, Math.round(m1)]); }
        }
      }
      out[id] = o;
    }
    // §193: 追加トラック
    out.xs = [];
    var xs = Array.isArray(t.xs) ? t.xs : [];
    for (var xi = 0; xi < xs.length && out.xs.length < UKE_X_MAX; xi++) {
      var xid = xs[xi];
      if (/^x[1-8]$/.test(xid) && out.xs.indexOf(xid) < 0 && t[xid] && typeof t[xid] === "object") { out[xid] = ukeXClean(t[xid]); out.xs.push(xid); }
    }
    return out;
  }
  // そのトラックが鳴るか（オン・ミュートでない・ソロがあればソロ）
  function ukeTrackAudible(tracks, id) {
    var t = tracks[id];
    if (!t || !t.on || t.mute) { return false; }
    var ids = ukeTrackIds(tracks);
    for (var i = 0; i < ids.length; i++) { var o = tracks[ids[i]]; if (o && o.on && o.solo) { return !!t.solo; } }
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
        var bst = ukeBassStep(pat);
        if (bst) {
          // §191: 小節の頭からの位置で文字を選ぶ
          var bu = bst.meter / bst.p.length, bHit = false;
          for (k = Math.ceil(r.start / bu - 1e-6); k * bu < r.end - 1e-6; k++) {
            var bpos = k * bu, inBar = bpos - Math.floor(bpos / meter + 1e-9) * meter, ci = Math.round(inBar / bu);
            var bch = ci < bst.p.length ? bst.p.charAt(ci) : "-";
            if (bch === "-") { continue; }
            if (Math.abs(bpos - r.start) < 1e-6) { bHit = true; }
            out.push({ t: tm(bpos), kind: "note", track: "bass", midi: ukeBassTok(bch, root, hm, next, r.end - bpos), level: ci === 0 ? 0.9 : 0.75 });
          }
          if (!bHit) { out.push({ t: tm(r.start), kind: "note", track: "bass", midi: root, level: 0.9 }); }
        } else if (pat === "root") {
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
        out.push({ t: tm(mnote[0]), kind: "note", track: "mel", midi: mnote[2], level: ukeNoteVel(mnote), beat: mnote[0], dur: mnote[1] });
      }
    }
    // §193: 追加トラック
    for (var xi = 0; tr.xs && xi < tr.xs.length; xi++) { out = out.concat(ukeXEvents(tr.xs[xi], tr[tr.xs[xi]], chordRows, tm, meter, lowG)); }
    // §195: セクションの目印（拍の位置と名前）
    var secs = [];
    for (i = 0; i < rows.length; i++) { if (rows[i].type === "sec" && rows[i].start < sched.beats - 1e-6) { secs.push({ start: rows[i].start, name: rows[i].name }); } }
    var crashAt = {};
    if (tr.drum.on && sched.beats > 0) {
      var g = tr.drum.groove === "custom" ? { hits: tr.drum.custom } : ukeGroove(tr.drum.groove), steps = meter * 4;
      var nBars = Math.ceil(sched.beats / meter - 1e-6), fl = ukeDrumFills(tr.drum.fill, secs, nBars, meter, !!seq.loop);
      for (var bar = 0; bar < nBars; bar++) {
        var b0 = bar * meter;
        if (fl.end && bar === nBars - 1) {
          // 曲の終わり: 頭で1回「ジャーン」
          out.push({ t: tm(b0), kind: "drum", track: "drum", midi: 49, level: 0.6 });
          out.push({ t: tm(b0), kind: "drum", track: "drum", midi: 36, level: 0.75 });
          crashAt[b0] = true;
          continue;
        }
        var fz = fl.fill[bar], from = fz ? steps - (fz === "l" ? 8 : 4) : steps;
        for (k = 0; k < g.hits.length; k++) {
          for (var h = 0; h < g.hits[k][1].length; h++) {
            var st = g.hits[k][1][h];
            if (st >= from) { continue; }
            var pos = b0 + st / 4;
            if (pos >= sched.beats - 1e-6) { continue; }
            out.push({ t: tm(pos), kind: "drum", track: "drum", midi: g.hits[k][0], level: g.hits[k][2] });
          }
        }
        if (fz) {
          var fn = fz === "l" ? UKE_FILL_LONG : UKE_FILL_SHORT;
          for (k = 0; k < fn.length; k++) {
            var fp = b0 + (from + fn[k][0]) / 4;
            if (fp < sched.beats - 1e-6) { out.push({ t: tm(fp), kind: "drum", track: "drum", midi: fn[k][1], level: fn[k][2] }); }
          }
        }
        if (fl.crash[bar]) { out.push({ t: tm(b0), kind: "drum", track: "drum", midi: 49, level: 0.55 }); crashAt[b0] = true; }
      }
    }
    // §195: 展開（セクションの名前で強さを変える。ウクレレ・録音・メロディはそのまま）
    if (seq.dyn && secs.length) {
      var energyAt = function (bt) {
        var e = 2;
        for (var si = 0; si < secs.length; si++) { if (secs[si].start <= bt + 1e-6) { e = ukeSecEnergy(secs[si].name); } }
        return e;
      };
      for (k = 0; k < out.length; k++) {
        var ev = out[k];
        if (ev.track === "rec1" || ev.track === "rec2" || ev.track === "mel") { continue; }
        var eb = ev.beat !== undefined ? ev.beat : (sched.beatAt ? sched.beatAt(ev.t) : 0), en = energyAt(eb);
        if (en === 0 && ev.kind === "drum" && (ev.midi === 38 || ev.midi === 39 || ev.midi === 40)) { ev.midi = 37; }
        ev.level = Math.min(1, ev.level * UKE_SEC_GAIN[en]);
      }
      if (tr.drum.on) {
        for (k = 0; k < secs.length; k++) {
          if (ukeSecEnergy(secs[k].name) === 3 && !crashAt[secs[k].start]) { out.push({ t: tm(secs[k].start), kind: "drum", track: "drum", midi: 49, level: 0.6 }); crashAt[secs[k].start] = true; }
        }
      }
    }
    return out;
  }
  // §193: 追加トラックの音（コードで自動演奏 / ピアノロールの音符）。beat・dur（拍）つき
  function ukeXEvents(id, x, chordRows, tm, meter, lowG) {
    var out = [], i, k;
    if (!x || !x.on) { return out; }
    if (x.kind === "notes") {
      for (k = 0; k < x.notes.length; k++) { out.push({ t: tm(x.notes[k][0]), kind: "note", track: id, midi: x.notes[k][2], level: ukeNoteVel(x.notes[k]), beat: x.notes[k][0], dur: x.notes[k][1] }); }
      return out;
    }
    var P = { hold: [meter, 0], half: [2, 0], q: [1, 0], e: [0.5, 0], off: [0.5, 0], stab: [0.5, 0], arp8: [0.5, 1], arp16: [0.25, 1], arpud: [0.25, 2] }[x.play] || [meter, 0];
    var unit = P[0], arp = P[1];
    for (i = 0; i < chordRows.length; i++) {
      var r = chordRows[i], hm = ukeRowHarmony(r, lowG);
      if (!hm) { continue; }
      var notes = [];
      for (k = 0; k < hm.pcs.length && notes.length < 4; k++) { var nm = 57 + C.pcOf(hm.pcs[k] - 57) + x.oct * 12; if (notes.indexOf(nm) < 0) { notes.push(nm); } }
      notes.sort(function (a, b) { return a - b; });
      if (!notes.length) { continue; }
      var hits = [], kk;
      for (kk = Math.ceil(r.start / unit - 1e-6); kk * unit < r.end - 1e-6; kk++) {
        var p = kk * unit, inBar = p - Math.floor(p / meter + 1e-9) * meter;
        if (x.play === "off" && kk % 2 === 0) { continue; }
        if (x.play === "stab" && Math.abs(inBar) > 1e-6 && Math.abs(inBar - 1.5) > 1e-6) { continue; }
        hits.push({ p: p, n: kk });
      }
      if (x.play !== "off" && (!hits.length || hits[0].p > r.start + 1e-6)) { hits.unshift({ p: r.start, n: 0 }); }
      for (k = 0; k < hits.length; k++) {
        var hp = hits[k].p, dur = (k + 1 < hits.length ? hits[k + 1].p : r.end) - hp;
        if (x.play === "stab" || x.play === "off") { dur = Math.min(dur, 0.5); }
        if (arp) {
          // 上り: 0,1,2,3,0… / 上り下り: 0,1,2,3,2,1,0…
          var L = notes.length, cyc = arp === 2 ? Math.max(1, 2 * L - 2) : L, ix = ((hits[k].n % cyc) + cyc) % cyc;
          if (ix >= L) { ix = cyc - ix; }
          out.push({ t: tm(hp), kind: "note", track: id, midi: notes[ix], level: 0.6, beat: hp, dur: dur });
        } else {
          for (var q = 0; q < notes.length; q++) { out.push({ t: tm(hp), kind: "note", track: id, midi: notes[q], level: 0.5, beat: hp, dur: dur }); }
        }
      }
    }
    return out;
  }
  // ミキサー: トラックごとの出口（GainNode → StereoPanner → 全体の出口）
  function ukeMixer(UG, ac, tracks) {
    var bus = (UG.audio && UG.audio.ctx === ac && UG.audio.bus) ? UG.audio.bus : ac.destination, mix = {}, ids = ukeTrackIds(tracks);
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i], g = ac.createGain(), pn = null;
      g.gain.value = ukeTrackAudible(tracks, id) ? tracks[id].vol / 100 : 0;
      if (ac.createStereoPanner) { try { pn = ac.createStereoPanner(); pn.pan.value = tracks[id].pan; g.connect(pn); pn.connect(bus); } catch (e) { pn = null; } }
      if (!pn) { g.connect(bus); }
      mix[id] = { g: g, pn: pn };
    }
    return mix;
  }
  function ukeMixerUpdate(mix, tracks) {
    if (!mix) { return; }
    var ids = ukeTrackIds(tracks);
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      if (!mix[id] || !tracks[id]) { continue; }
      try { mix[id].g.gain.value = ukeTrackAudible(tracks, id) ? tracks[id].vol / 100 : 0; } catch (e) {}
      if (mix[id].pn) { try { mix[id].pn.pan.value = tracks[id].pan; } catch (e2) {} }
    }
  }

  function ukeSeqSchedule(seq, lowG) {
    var sc = C.schedule(seq, function (n, s, row) { return ukeResolve(n, s, lowG, ukeRowPos(seq, row)); });
    var tracks = seq.tracks || ukeTracksClean(null), i;
    if (seq._src) { for (i = 0; i < sc.rows.length; i++) { sc.rows[i].i = seq._src[sc.rows[i].i]; } }
    for (i = 0; i < sc.events.length; i++) { if (sc.events[i].kind !== "click") { sc.events[i].track = "uke"; } }
    var more = ukeTrackEvents({ tracks: tracks, dyn: !!seq.dyn, loop: !!seq.loop }, sc, lowG);
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
    ukeFxPop();
  }
  I.addStopHook(ukeSeqStop);
  // speed（省略可・§189）: { rate, up } 練習テンポと「ループごとに +5%」
  function ukeSeqStart(seq, lowG, onRow, onTick, speed) {
    ukeSeqStop();
    var base = seq;
    if (speed && speed.rate !== 100) { seq = ukeSeqAtRate(base, speed.rate); }
    var UG = window.UGMelody;
    if (!UG) { return false; }
    var ac = UG.audioInit();
    if (!ac) { return false; }
    try { UG.loadSamples([UKE_PROG]); } catch (e) {}
    ukeFxPush(seq);
    var sched = ukeSeqSchedule(seq, lowG);
    if (!sched.events.length) { return false; }
    var pl = { sched: sched, startAt: ac.currentTime + 0.1, idx: 0, off: 0, row: -2, seq: seq, outs: [null, null, null, null], mix: ukeMixer(UG, ac, sched.tracks) };
    var progs = [UKE_PROG];
    var tids = ukeTrackIds(sched.tracks);
    for (var ti = 0; ti < tids.length; ti++) { var tt = sched.tracks[tids[ti]]; if (tt.on && tt.prog !== undefined) { progs.push(tt.prog); } }
    try { UG.loadSamples(progs); } catch (e3) {}
    pl.timer = setInterval(function () {
      var now = ac.currentTime - pl.startAt, ev;
      while (pl.idx < sched.events.length && (ev = sched.events[pl.idx]).t + pl.off < now + 0.12) {
        ukeSeqPlayEvent(UG, ac, ev, pl.startAt + pl.off + ev.t, lowG, 0.8, pl.outs, pl.mix, sched.tracks);
        pl.idx++;
      }
      if (pl.idx >= sched.events.length && now >= pl.off + sched.time) {
        if (!seq.loop) { ukeSeqStop(); if (onRow) { onRow(-1, null); } if (onTick) { onTick(null); } return; }
        // くりかえし: カウントインは飛ばす（§189: ループごとに練習テンポを +5%）
        var oldTime = sched.time;
        if (speed && speed.up && speed.rate < 100) {
          speed.rate = Math.min(100, speed.rate + 5);
          sched = ukeSeqSchedule(ukeSeqAtRate(base, speed.rate), lowG);
          pl.sched = sched;
          if (speed.onRate) { speed.onRate(speed.rate); }
        }
        pl.off += oldTime - sched.lead;
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
        notes.push([ms, ev.midi, UKE_TRACK_INFO[ev.track] ? UKE_TRACK_INFO[ev.track].voice : ev.track, ev.level]);
      } else if (ev.kind === "pluck") {
        if (ev.shape[ev.string] !== null) { notes.push([ms, ukeMidi(ev.string, ev.shape[ev.string], lowG), "b", 0.85]); }
      } else if (ev.kind === "strum") {
        for (k = 0; k < 4; k++) {
          var st = ev.dir === "up" ? 3 - k : k;
          if (ev.shape[st] !== null) { notes.push([ms + k * 12, ukeMidi(st, ev.shape[st], lowG), "b", ev.dir === "up" ? 0.65 : 0.9]); }
        }
      }
    }
    var tr = sc.tracks, pm = { b: tr.uke.prog, p: tr.bass.prog, c: tr.pad.prog, d: 128, w: tr.rec1.prog, r: tr.rec2.prog, m: tr.mel.prog };
    for (i = 0; tr.xs && i < tr.xs.length; i++) { pm[tr.xs[i]] = tr[tr.xs[i]].prog; }
    var rq = { id: Date.now(), date: Date.now(), notes: notes, prog: pm, fxRev: seq.rev >= 0 ? seq.rev : 1 };
    if (seq.dly >= 0) { rq.fxDly = seq.dly; }
    return rq;
  }
  function ukeFileStamp() {
    var d = new Date(), z = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + "-" + z(d.getHours()) + z(d.getMinutes());
  }
  // §179 v0.98: SMF フォーマット1（トラックごとの MTrk・テンポ・音の長さ・歌詞）
  var UKE_REV_CC = [0, 30, 60, 100]; // §197: リバーブ量（メロディくずしと同じ）
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
        var dur = (id === "mel" || id.charAt(0) === "x") && ev.beat !== undefined ? (sc.tm(ev.beat + (ev.dur || 0.5)) - sc.tm(ev.beat)) : (id === "pad" ? 2 * sc.spb : (id === "bass" ? 4 * sc.spb : 0.4));
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
    var mids = ukeTrackIds(tr);
    for (i = 0; i < mids.length; i++) {
      var tid = mids[i], notes = per[tid];
      if (!notes || !notes.length) { continue; }
      var xat = tr.xs ? tr.xs.indexOf(tid) : -1;
      var ch = xat >= 0 ? UKE_X_CH[xat] : UKE_MIDI_CH[tid], ev2 = [], nm = ukeUtf8(xat >= 0 ? tr[tid].name : UKE_MIDI_NAMES[tid]);
      ev2.push([0, 0, [0xFF, 0x03].concat(ukeVlq(nm.length), nm)]);
      if (tid !== "drum") { ev2.push([0, 1, [0xC0 | ch, tr[tid].prog]]); }
      ev2.push([0, 1, [0xB0 | ch, 7, Math.round(tr[tid].vol * 1.27)]]);
      ev2.push([0, 1, [0xB0 | ch, 10, Math.round(64 + tr[tid].pan * 63)]]);
      if (seq.rev >= 0) { ev2.push([0, 1, [0xB0 | ch, 91, UKE_REV_CC[seq.rev]]]); }
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
  // §189: コードのおすすめ（その行のキーのダイアトニック・前のコードのあとによく来るコード・セカンダリードミナント）
  var UKE_DEG_NAMES = { 0: "Ⅰ", 2: "Ⅱ", 4: "Ⅲ", 5: "Ⅳ", 7: "Ⅴ", 9: "Ⅵ", 11: "Ⅶ" };
  var UKE_AFTER = { 0: [[5, ""], [7, ""], [9, "m"]], 2: [[7, "7"], [5, ""]], 4: [[9, "m"], [5, ""]], 5: [[7, ""], [0, ""], [4, "m"], [5, "m"]], 7: [[0, ""], [9, "m"]], 9: [[5, ""], [2, "m"], [7, ""]], 11: [[4, "7"], [0, ""]] };
  // 書いたコードからキーを推定（その長調のダイアトニックに合うコードがいちばん多いキー。同じなら C に近い順）
  function ukeEstimateKey(rows) {
    var best = 0, bestScore = -1, QUAL = { 0: "", 2: "m", 4: "m", 5: "", 7: "", 9: "m", 11: "dim" };
    for (var t = 0; t < 12; t++) {
      var sc = 0, first = true;
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].type !== "chord") { continue; }
        var sp = C.parse(rows[i].name);
        if (!sp) { continue; }
        var d = C.pcOf(sp.root - t);
        if (!QUAL.hasOwnProperty(d)) { continue; }
        var minor = sp.parts.indexOf("m") >= 0, dim = sp.parts.indexOf("dim") >= 0, dom7 = sp.parts.indexOf("7") >= 0 && !minor && !dim && sp.parts.indexOf("M7") < 0;
        sc += (QUAL[d] === "m" ? minor : (QUAL[d] === "dim" ? dim : !minor && !dim)) ? 2 : 1;
        // ドミナント7th は Ⅴ が自然（Ⅰ のときは減らす）。最初のコードが Ⅰ なら少し足す
        if (dom7) { sc += d === 7 ? 1 : (d === 0 ? -1 : 0); }
        if (first && d === 0) { sc += 1; }
        first = false;
      }
      if (sc > bestScore) { bestScore = sc; best = t; }
    }
    return best;
  }
  // 名前は書いた音（Key と転調は鳴らすときにずらす）なので、おすすめも書いた音のキーで出す
  function ukeSuggest(seq, row) {
    var tonic = ukeEstimateKey(seq.rows), out = { tonic: tonic, diatonic: [], after: [], secondary: [], prev: "", prevDeg: "" }, i;
    function mk(iv, suf) {
      var q = { "": [], m: ["m"], "7": ["7"], maj7: ["M7"], m7: ["m", "7"], m7b5: ["dim", "7"] }[suf];
      return { name: C.name({ root: C.pcOf(tonic + iv), parts: q, bass: null }), deg: UKE_DEG_NAMES[iv] + (suf === "m7b5" ? "m7(♭5)" : suf) };
    }
    var DIA = [[0, ""], [2, "m"], [4, "m"], [5, ""], [7, ""], [9, "m"], [11, "m7b5"], [0, "maj7"], [2, "m7"], [4, "m7"], [5, "maj7"], [7, "7"], [9, "m7"]];
    for (i = 0; i < DIA.length; i++) { out.diatonic.push(mk(DIA[i][0], DIA[i][1])); }
    var SEC = [[0, "7", "→Ⅳ"], [2, "7", "→Ⅴ"], [4, "7", "→Ⅵm"], [9, "7", "→Ⅱm"], [11, "7", "→Ⅲm"]];
    for (i = 0; i < SEC.length; i++) { var sc = mk(SEC[i][0], SEC[i][1]); sc.deg += "（" + SEC[i][2] + "）"; out.secondary.push(sc); }
    // 前のコードの行（★マイコードは押さえ方から名前を当てる）
    for (i = row - 1; i >= 0; i--) {
      var r = seq.rows[i];
      if (r.type !== "chord") { continue; }
      var sp = C.parse(r.name);
      if (!sp) { var rv = ukeResolve(r.name, 0, false); if (rv) { var dt = C.detect(rv.shape, { preferred: UKE_PREFERRED }); sp = dt && dt.spec; } }
      if (!sp) { break; }
      var deg = C.pcOf(sp.root - tonic);
      out.prev = r.name;
      if (UKE_DEG_NAMES.hasOwnProperty(deg) && UKE_AFTER[deg]) {
        out.prevDeg = UKE_DEG_NAMES[deg];
        for (var j = 0; j < UKE_AFTER[deg].length; j++) { out.after.push(mk(UKE_AFTER[deg][j][0], UKE_AFTER[deg][j][1])); }
      }
      break;
    }
    return out;
  }
  function ukePickHtml(seq, row) {
    var h = '<div class="uke-pick" data-row="' + row + '">', i, semis = ukeSeqSemisAt(seq, row), my = ukeLoadMy();
    h += '<div class="uke-pick-head"><span class="uke-label">' + (row + 1) + '行目のコードを選ぶ' + (semis ? '（この行の Key ' + (semis > 0 ? "+" : "") + semis + '）' : '') + '</span>' +
      '<button class="arcade-mini-btn" data-seq="pickClose" title="閉じる">&#x2716;&#xFE0F;</button></div>';
    h += ukeChips([{ v: "rec", t: "&#x1F4A1; おすすめ" }, { v: "my", t: "&#x2B50; マイコード（" + my.length + "）" }, { v: "common", t: "&#x1F3B5; よく使う" }, { v: "dict", t: "&#x1F4DA; 辞典で選ぶ" }],
      function (v) { return v === ukePick.tab; }, "ptab");
    h += '<div class="uke-pick-list">';
    if (ukePick.tab === "rec") {
      var rs = ukeSuggest(seq, row);
      h += '</div><div class="uke-label">キー ' + C.ROOTS[rs.tonic] + '（書いたコードから推定）のダイアトニック</div><div class="uke-pick-list">';
      for (i = 0; i < rs.diatonic.length; i++) { h += ukePickItem(rs.diatonic[i].name, '<b>' + I.escHtml(rs.diatonic[i].name) + '</b> <span class="uke-role">' + rs.diatonic[i].deg + '</span>'); }
      if (rs.after.length) {
        h += '</div><div class="uke-label">' + I.escHtml(rs.prev) + '（' + rs.prevDeg + '）のあとによく来る</div><div class="uke-pick-list">';
        for (i = 0; i < rs.after.length; i++) { h += ukePickItem(rs.after[i].name, '<b>' + I.escHtml(rs.after[i].name) + '</b> <span class="uke-role">' + rs.after[i].deg + '</span>'); }
      }
      h += '</div><div class="uke-label">セカンダリードミナント（次のコードへ強く進む 7th）</div><div class="uke-pick-list">';
      for (i = 0; i < rs.secondary.length; i++) { h += ukePickItem(rs.secondary[i].name, '<b>' + I.escHtml(rs.secondary[i].name) + '</b> <span class="uke-role">' + rs.secondary[i].deg + '</span>'); }
    } else if (ukePick.tab === "my") {
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
    for (var i = 0; t.xs && i < t.xs.length; i++) { var x = t[t.xs[i]]; if (x.on && (x.kind === "chord" || x.notes.length)) { l.push(t.xs[i]); } }
    return l;
  }
  var UKE_X_COLORS = ["#81ecec", "#fab1a0", "#ffeaa7", "#a29bfe", "#55efc4", "#ff7675", "#74b9ff", "#fd79a8"];
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
          else if (lid.charAt(0) === "x") {
            ctx.fillStyle = UKE_X_COLORS[(parseInt(lid.substring(1), 10) - 1) % 8];
            ctx.fillRect(ex, y0 + 14 - Math.max(0, Math.min(12, (e2.midi - 50) * 0.35)), Math.max(2, (e2.dur || 0.5) * ppb - 1), 2);
          }
          else if (lid === "rec1" || lid === "rec2" || lid === "mel") {
            ctx.fillStyle = lid === "mel" ? "#fd79a8" : (lid === "rec1" ? "#55efc4" : "#a29bfe");
            ctx.fillRect(ex, y0 + 14 - Math.max(0, Math.min(12, (e2.midi - 55) * 0.4)), lid === "mel" ? Math.max(2, (e2.dur || 0.5) * ppb - 1) : 2, 2);
          }
          else if (e2.midi === 36 || e2.midi === 38 || e2.midi === 37) { ctx.fillStyle = e2.midi === 36 ? "#ff7675" : "#ffd166"; ctx.fillRect(ex, y0 + (e2.midi === 36 ? 9 : 3), 2, 5); }
        }
        // レーンの名前（音の上に重ねて読めるように背景つき）
        ctx.fillStyle = "rgba(11,22,38,0.85)"; ctx.fillRect(0, y0, 36, 16);
        ctx.fillStyle = "#adb5bd"; ctx.font = "8px sans-serif"; ctx.fillText(UKE_LANE_NAMES[lid] || seq.tracks[lid].name.slice(0, 5), 2, y0 + 8);
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
  // §189: 行ごとの奏法
  // §190: 拍子に合うパターン（kind: "s" / "a"、省略はどちらも）
  function ukePatterns(meter, kind) {
    return C.SEQ_PATTERNS.filter(function (pp) { return (pp.meter || 4) === (meter || 4) && (!kind || pp.kind === kind); });
  }
  function ukeRowStyleHtml(r, i, sel, meter) {
    var popt = [["", "パターンを選ぶ…"]].concat(ukePatterns(meter).map(function (pp) { return [pp.p, (pp.kind === "a" ? "🎼 " : "🎸 ") + pp.label + " " + pp.p]; }));
    return '<span class="uke-seq-sty">' + sel('class="uke-seq-style" data-row="' + i + '"', [["song", "奏法: 全体"]].concat(C.SEQ_STYLES.map(function (st) { return [st.id, st.label]; })), r.style) +
      (r.style === "pat" ? '<input type="text" class="uke-seq-rpat" data-row="' + i + '" maxlength="16" value="' + I.escHtml(r.pattern) + '">' +
        sel('class="uke-seq-rpsel" data-row="' + i + '"', popt, "") + '<button class="arcade-mini-btn" data-seq="patprev" data-row="' + i + '" title="この行のパターンを試聴">&#x25B6;&#xFE0F;</button>' : '') + '</span>';
  }
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
        '<span class="uke-seq-res">' + (bad ? '<span style="color:#ff7675;">？ 読めない名前です</span>' : I.escHtml(info.name) + ' <span class="uke-role">押さえ方 ' + info.shape.join("-") + '</span>') + '</span>' +
        ukeRowStyleHtml(r, i, sel, seq.meter);
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
  var UKE_ROLL_ROWS = 24, UKE_ROLL_RH = 13;
  // §198: tool＝"pen" 書く / "move" 動かす / "sel" 選ぶ。sel は選んだ音符の "拍:音" の一覧
  var ukeRoll = { low: 60, len: 0.5, redraw: null, track: "mel", tool: "pen", sel: [], vel: 0.8, guide: true, box: null };
  var UKE_ROLL_VELS = [[0.4, "弱い"], [0.6, "やや弱い"], [0.8, "ふつう"], [1, "強い"]];
  function ukeNoteKey(n) { return n[0] + ":" + n[2]; }
  function ukeNoteVel(n) { return n[3] === undefined ? 0.8 : n[3]; }
  // 拍・音の位置にある音符の番号（なければ -1）
  function ukeRollHit(ns, beat, midi) {
    for (var i = 0; i < ns.length; i++) { if (ns[i][2] === midi && beat >= ns[i][0] - 1e-6 && beat < ns[i][0] + ns[i][1]) { return i; } }
    return -1;
  }
  // §199: 枠（拍と音の範囲）に少しでもかかる音符のキー
  function ukeRollBox(ns, b0, b1, m0, m1) {
    var bl = Math.min(b0, b1), bh = Math.max(b0, b1), ml = Math.min(m0, m1), mh = Math.max(m0, m1), out = [];
    for (var i = 0; i < ns.length; i++) {
      if (ns[i][0] < bh && ns[i][0] + ns[i][1] > bl && ns[i][2] >= ml && ns[i][2] <= mh) { out.push(ukeNoteKey(ns[i])); }
    }
    return out;
  }
  function ukeRollSort(ns) { ns.sort(function (a, b) { return a[0] - b[0] || a[2] - b[2]; }); }
  // §198: 選んだ音符への操作（ns をその場で変える）。新しい選択を返す
  function ukeRollOp(ns, sel, op, arg, meter) {
    var picked = [], i, out = [];
    for (i = 0; i < ns.length; i++) { if (sel.indexOf(ukeNoteKey(ns[i])) >= 0) { picked.push(ns[i]); } }
    if (op === "all") { return ns.map(ukeNoteKey); }
    if (!picked.length) { return []; }
    if (op === "del") {
      for (i = ns.length - 1; i >= 0; i--) { if (picked.indexOf(ns[i]) >= 0) { ns.splice(i, 1); } }
      return [];
    }
    if (op === "semi") {
      for (i = 0; i < picked.length; i++) { picked[i][2] = Math.max(0, Math.min(127, picked[i][2] + arg)); }
    } else if (op === "vel") {
      for (i = 0; i < picked.length; i++) { if (arg === 0.8) { picked[i].length = 3; } else { picked[i][3] = arg; } }
    } else if (op === "copy") {
      var a = Infinity, b = 0;
      for (i = 0; i < picked.length; i++) { a = Math.min(a, picked[i][0]); b = Math.max(b, picked[i][0] + picked[i][1]); }
      var m = meter === 3 ? 3 : 4, off = Math.max(1, Math.ceil((b - a) / m - 1e-6)) * m, have = {};
      for (i = 0; i < ns.length; i++) { have[ukeNoteKey(ns[i])] = true; }
      for (i = 0; i < picked.length && ns.length < UKE_MEL_MAX; i++) {
        var c = picked[i].slice();
        c[0] = picked[i][0] + off;
        if (c[0] > 4096 || have[ukeNoteKey(c)]) { continue; }
        have[ukeNoteKey(c)] = true;
        ns.push(c);
        out.push(c);
      }
      ukeRollSort(ns);
      return out.map(ukeNoteKey);
    }
    ukeRollSort(ns);
    return picked.map(ukeNoteKey);
  }
  // §193: ピアノロールで編集するトラック（メロディ・追加の打ち込みトラック。オンのものだけ）
  function ukeRollIds(seq) {
    var t = seq.tracks, out = [];
    if (!t) { return out; }
    if (t.mel.on) { out.push("mel"); }
    for (var i = 0; t.xs && i < t.xs.length; i++) { if (t[t.xs[i]].on && t[t.xs[i]].kind === "notes") { out.push(t.xs[i]); } }
    return out;
  }
  function ukeRollT(seq) {
    var ids = ukeRollIds(seq);
    if (!ids.length) { return null; }
    if (ids.indexOf(ukeRoll.track) < 0) { ukeRoll.track = ids[0]; ukeRoll.sel = []; }
    return seq.tracks[ukeRoll.track];
  }
  function ukeRollHtml(seq, sel) {
    var rt = ukeRollT(seq), rids = ukeRollIds(seq);
    if (!rt) { return ""; }
    var recs = (window.UGMelody && window.UGMelody.loadRecs) ? window.UGMelody.loadRecs() : [], ro = [];
    for (var i = 0; i < recs.length; i++) { ro.push([recs[i].id, new Date(recs[i].date).getMonth() + 1 + "/" + new Date(recs[i].date).getDate() + " " + recs[i].notes.length + "音"]); }
    // 選んだ音符が消えていたら外す
    var keys = rt.notes.map(ukeNoteKey);
    ukeRoll.sel = ukeRoll.sel.filter(function (k) { return keys.indexOf(k) >= 0; });
    var ns = ukeRoll.sel.length, tool = ukeRoll.tool;
    var hint = tool === "move" ? "音符をドラッグで動かす・右はしをドラッグで長さを変える・空いた所の横ドラッグでスクロール" :
      (tool === "sel" ? "音符をタップで選ぶ／外す・ドラッグで囲んでまとめて選ぶ・空いた所をタップで全部外す" : "空いたマスをタップで音符を置く・音符をタップで消す・横ドラッグでスクロール");
    return '<h4 class="arcade-prize-cat">&#x1F3B5; ピアノロール</h4>' +
      (rids.length > 1 ? '<div class="uke-tl-tools"><span class="uke-label">編集するトラック</span>' + sel('class="uke-roll-trk"', rids.map(function (rid) { return [rid, rid === "mel" ? "メロディ" : seq.tracks[rid].name]; }), ukeRoll.track) + '</div>' : '') +
      '<div class="uke-chips">' + [["pen", "&#x270F;&#xFE0F; 書く"], ["move", "&#x270B; 動かす・のばす"], ["sel", "&#x2B1A; 選ぶ"]].map(function (tl) {
        return '<button class="uke-chip' + (tool === tl[0] ? " active" : "") + '" data-rolltool="' + tl[0] + '">' + tl[1] + '</button>';
      }).join("") + '</div>' +
      '<div class="uke-tl-tools uke-roll-tools"><span class="uke-label">置く長さ</span>' + sel('class="uke-roll-len"', [[0.25, "1/4拍"], [0.5, "1/2拍"], [1, "1拍"], [2, "2拍"]], ukeRoll.len) +
      '<span class="uke-label">強さ</span>' + sel('class="uke-roll-vel"', UKE_ROLL_VELS, ukeRoll.vel) +
      '<button class="arcade-mini-btn" data-roll="up" title="音域を上へ">&#x25B2;</button><button class="arcade-mini-btn" data-roll="down" title="音域を下へ">&#x25BC;</button>' +
      '<button class="arcade-mini-btn" data-roll="clear" title="全部消す">&#x1F5D1;&#xFE0F;</button></div>' +
      (tool === "sel" || ns ? '<div class="uke-tl-tools uke-roll-tools uke-roll-selbar"><span class="uke-label">選んだ音 ' + ns + '</span>' +
        '<button class="arcade-mini-btn" data-roll="all">全部選ぶ</button>' +
        (ns ? '<button class="arcade-mini-btn" data-roll="copy" title="うしろにコピー">&#x29C9; うしろにコピー</button>' +
          '<button class="arcade-mini-btn" data-roll="semi:1">半音&#x2191;</button><button class="arcade-mini-btn" data-roll="semi:-1">半音&#x2193;</button>' +
          '<button class="arcade-mini-btn" data-roll="semi:12">8va&#x2191;</button><button class="arcade-mini-btn" data-roll="semi:-12">8va&#x2193;</button>' +
          '<button class="arcade-mini-btn" data-roll="del" title="選んだ音を消す">&#x1F5D1;&#xFE0F;</button><button class="arcade-mini-btn" data-roll="none">選ぶのをやめる</button>' : '') + '</div>' : '') +
      '<canvas class="uke-roll"></canvas>' +
      '<p class="small" style="color:#adb5bd;margin:2px 0;">' + hint + '（' + rt.notes.length + '音）</p>' +
      '<label class="uke-genre-bpm"><input type="checkbox" class="uke-roll-guide"' + (ukeRoll.guide ? " checked" : "") + '> &#x1F3AF; コードの音を色で表示</label>' +
      (ro.length && ukeRoll.track === "mel" ? '<div class="uke-tl-tools"><span class="uke-label">メロディくずしの録音</span>' + sel('class="uke-roll-imp"', ro, ro[0][0]) + '<button class="uke-chip" data-roll="import">取り込む</button></div>' : '');
  }
  function ukeRollDraw(cv, seq, sched) {
    if (!cv || !cv.getContext) { return; }
    var w = cv.clientWidth || 330, k = 2, H = UKE_ROLL_ROWS * UKE_ROLL_RH, ctx = cv.getContext("2d"), ppb = ukeTlPpb(), sx = ukeTl.scroll, meter = seq.meter === 3 ? 3 : 4, i, j;
    if (cv.width !== w * k) { cv.width = w * k; cv.height = H * k; }
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.fillStyle = "#0b1626"; ctx.fillRect(0, 0, w, H);
    for (i = 0; i < UKE_ROLL_ROWS; i++) {
      var m = ukeRoll.low + i, y = H - (i + 1) * UKE_ROLL_RH, black = [1, 3, 6, 8, 10].indexOf(m % 12) >= 0;
      ctx.fillStyle = black ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.03)";
      ctx.fillRect(0, y, w, UKE_ROLL_RH);
      ctx.fillStyle = "rgba(255,255,255,0.06)"; ctx.fillRect(0, y, w, 1);
    }
    // §198: そのとき鳴っているコードの音の行をうすく（根音は少し濃く）
    if (ukeRoll.guide && C) {
      for (i = 0; i < sched.rows.length; i++) {
        var cr = sched.rows[i];
        if (cr.type !== "chord" || !cr.ok) { continue; }
        var x0 = cr.start * ppb - sx, x1 = cr.end * ppb - sx;
        if (x1 < 0 || x0 > w) { continue; }
        var hm = ukeRowHarmony(cr, false);
        if (!hm) { continue; }
        var pcs = hm.pcs.map(function (p) { return C.pcOf(p); }), rootPc = C.pcOf(hm.root);
        for (j = 0; j < UKE_ROLL_ROWS; j++) {
          var pc = (ukeRoll.low + j) % 12;
          if (pcs.indexOf(pc) < 0) { continue; }
          ctx.fillStyle = pc === rootPc ? "rgba(255,209,102,0.16)" : "rgba(116,185,255,0.11)";
          ctx.fillRect(x0, H - (j + 1) * UKE_ROLL_RH + 1, x1 - x0, UKE_ROLL_RH - 1);
        }
      }
    }
    var total = Math.max(sched.beats, meter * 4);
    for (var b = 0; b <= total + meter; b++) {
      var x = b * ppb - sx;
      if (x < -2 || x > w + 2) { continue; }
      ctx.fillStyle = b % meter === 0 ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.08)";
      ctx.fillRect(x, 0, 1, H);
    }
    var rt = ukeRollT(seq), ns = rt ? rt.notes : [];
    for (i = 0; i < ns.length; i++) {
      var row = ns[i][2] - ukeRoll.low;
      if (row < 0 || row >= UKE_ROLL_ROWS) { continue; }
      var nx = ns[i][0] * ppb - sx, nw = Math.max(3, ns[i][1] * ppb - 2), ny = H - (row + 1) * UKE_ROLL_RH + 1;
      if (nx > w || nx + ns[i][1] * ppb < 0) { continue; }
      var picked = ukeRoll.sel.indexOf(ukeNoteKey(ns[i])) >= 0;
      ctx.globalAlpha = 0.45 + 0.55 * ukeNoteVel(ns[i]);
      ctx.fillStyle = picked ? "#ffeaa7" : "#fd79a8";
      ctx.fillRect(nx + 1, ny, nw, UKE_ROLL_RH - 2);
      ctx.globalAlpha = 1;
      if (picked) { ctx.strokeStyle = "#fdcb6e"; ctx.lineWidth = 1; ctx.strokeRect(nx + 1.5, ny + 0.5, nw - 1, UKE_ROLL_RH - 3); }
      // 長さを変えられる右はしのしるし
      if (ukeRoll.tool === "move" && nw > 8) { ctx.fillStyle = "rgba(11,22,38,0.55)"; ctx.fillRect(nx + nw - 2, ny + 2, 2, UKE_ROLL_RH - 6); }
    }
    // 音名（C は強く）
    ctx.font = "9px sans-serif"; ctx.textBaseline = "middle"; ctx.textAlign = "left";
    for (i = 0; i < UKE_ROLL_ROWS; i++) {
      var mm = ukeRoll.low + i, isC = mm % 12 === 0;
      ctx.fillStyle = "rgba(11,22,38,0.45)"; ctx.fillRect(0, H - (i + 1) * UKE_ROLL_RH, 26, UKE_ROLL_RH);
      ctx.fillStyle = isC ? "#ffd166" : "#adb5bd";
      ctx.fillText(ukeNoteName(mm) + (isC ? Math.floor(mm / 12) - 1 : ""), 2, H - (i + 0.5) * UKE_ROLL_RH);
    }
    if (ukeTl.play !== null) { ctx.fillStyle = "#ff7675"; ctx.fillRect(ukeTl.play * ppb - sx, 0, 2, H); }
    // §199: 囲んでいる枠
    var bx = ukeRoll.box;
    if (bx) {
      ctx.fillStyle = "rgba(255,234,167,0.12)"; ctx.fillRect(Math.min(bx[0], bx[2]), Math.min(bx[1], bx[3]), Math.abs(bx[2] - bx[0]), Math.abs(bx[3] - bx[1]));
      ctx.strokeStyle = "#fdcb6e"; ctx.lineWidth = 1;
      if (ctx.setLineDash) { ctx.setLineDash([4, 3]); }
      ctx.strokeRect(Math.min(bx[0], bx[2]) + 0.5, Math.min(bx[1], bx[3]) + 0.5, Math.abs(bx[2] - bx[0]), Math.abs(bx[3] - bx[1]));
      if (ctx.setLineDash) { ctx.setLineDash([]); }
    }
  }
  function ukeRollBind(root, seq, ctx, save) {
    var cv = root.querySelector("canvas.uke-roll");
    var all = function (sel, ev, fn) { var els = root.querySelectorAll(sel); for (var i = 0; i < els.length; i++) { els[i][ev] = fn; } };
    all("select.uke-roll-len", "onchange", function (ev) { ukeRoll.len = Number(ev.currentTarget.value); });
    all("select.uke-roll-trk", "onchange", function (ev) { ukeRoll.track = ev.currentTarget.value; ukeRoll.sel = []; ctx.render(); });
    all("button[data-rolltool]", "onclick", function (ev) { ukeRoll.tool = ev.currentTarget.getAttribute("data-rolltool"); ctx.render(); });
    all("input.uke-roll-guide", "onchange", function (ev) { ukeRoll.guide = !!ev.currentTarget.checked; if (ukeRoll.redraw) { ukeRoll.redraw(); } });
    all("select.uke-roll-vel", "onchange", function (ev) {
      ukeRoll.vel = Number(ev.currentTarget.value);
      var rtv = ukeRollT(seq);
      if (rtv && ukeRoll.sel.length) { ukeRoll.sel = ukeRollOp(rtv.notes, ukeRoll.sel, "vel", ukeRoll.vel, seq.meter); save(true); }
    });
    all("button[data-roll]", "onclick", function (ev) {
      var a = ev.currentTarget.getAttribute("data-roll"), rto = ukeRollT(seq);
      if (a === "up") { ukeRoll.low = Math.min(72, ukeRoll.low + 12); ctx.render(); return; }
      if (a === "down") { ukeRoll.low = Math.max(36, ukeRoll.low - 12); ctx.render(); return; }
      if (a === "clear") { if (rto) { rto.notes = []; } ukeRoll.sel = []; save(true); return; }
      if (a === "none") { ukeRoll.sel = []; ctx.render(); return; }
      if (a === "all" || a === "copy" || a === "del" || a.indexOf("semi:") === 0) {
        if (!rto) { return; }
        var op = a.indexOf("semi:") === 0 ? "semi" : a, n0 = rto.notes.length;
        ukeRoll.sel = ukeRollOp(rto.notes, ukeRoll.sel, op, op === "semi" ? Number(a.split(":")[1]) : 0, seq.meter);
        if (op === "all") { ctx.render(); return; }
        if (op === "copy" && rto.notes.length === n0) { ctx.toast("コピーできる場所がありません（" + UKE_MEL_MAX + "音まで）"); }
        save(true);
        return;
      }
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
    function at(p) { return { beat: (p.x + ukeTl.scroll) / ukeTlPpb(), midi: ukeRoll.low + Math.floor((H - p.y) / UKE_ROLL_RH) }; }
    function sound(midi, prog, v) { var UG = window.UGMelody, ac2 = UG && UG.audioInit(); if (ac2) { try { UG.synth(midi, prog, 0, v || 0.8); } catch (e) {} } }
    function down(ev) {
      if (ev.cancelable) { ev.preventDefault(); }
      var p0 = pt(ev), q = at(p0), rtd = ukeRollT(seq);
      drag = { x0: p0.x, y0: p0.y, s0: ukeTl.scroll, moved: false, grab: null };
      // §198: 動かす — 音符をつかむ（右の3割なら長さ）
      if (ukeRoll.tool === "move" && rtd) {
        var hi = ukeRollHit(rtd.notes, q.beat, q.midi);
        if (hi >= 0) {
          var hn = rtd.notes[hi], inSel = ukeRoll.sel.indexOf(ukeNoteKey(hn)) >= 0;
          var grp = inSel ? rtd.notes.filter(function (n) { return ukeRoll.sel.indexOf(ukeNoteKey(n)) >= 0; }) : [hn];
          drag.grab = { len: q.beat > hn[0] + hn[1] * 0.7, notes: grp, orig: grp.map(function (n) { return [n[0], n[1], n[2]]; }), keepSel: inSel, prog: rtd.prog, lastM: hn[2] };
        }
      }
    }
    function move(ev) {
      if (!drag) { return; }
      var p1 = pt(ev);
      if (Math.abs(p1.x - drag.x0) > 6 || ((drag.grab || ukeRoll.tool === "sel") && Math.abs(p1.y - drag.y0) > 6)) { drag.moved = true; }
      if (!drag.moved) { return; }
      // §199: 選ぶ — ドラッグで枠を出す（スクロールはしない）
      if (ukeRoll.tool === "sel") {
        ukeRoll.box = [drag.x0, drag.y0, Math.max(0, Math.min(cv.clientWidth || 330, p1.x)), Math.max(0, Math.min(H - 1, p1.y))];
        ukeRollDraw(cv, seq, sched);
        return;
      }
      if (drag.grab) {
        var g = ukeTl.snap, gb = drag.grab, db = Math.round((p1.x - drag.x0) / ukeTlPpb() / g) * g, dm = -Math.round((p1.y - drag.y0) / UKE_ROLL_RH), i;
        for (i = 0; i < gb.notes.length; i++) {
          var o = gb.orig[i];
          if (gb.len) { gb.notes[i][1] = Math.max(Math.min(g, 0.25), Math.min(32, o[1] + db)); }
          else { gb.notes[i][0] = Math.max(0, o[0] + db); gb.notes[i][2] = Math.max(0, Math.min(127, o[2] + dm)); }
        }
        if (!gb.len && gb.notes[0][2] !== gb.lastM) { gb.lastM = gb.notes[0][2]; sound(gb.lastM, gb.prog, 0.5); }
        if (gb.keepSel) { ukeRoll.sel = gb.notes.map(ukeNoteKey); }
        ukeRollDraw(cv, seq, sched);
        return;
      }
      ukeTl.scroll = Math.max(0, drag.s0 - (p1.x - drag.x0));
      ukeRollDraw(cv, seq, sched);
      if (ukeTl.redraw) { ukeTl.redraw(true); }
    }
    function up() {
      if (!drag) { return; }
      var d = drag;
      drag = null;
      var rtu = ukeRollT(seq);
      if (!rtu) { return; }
      var ns = rtu.notes;
      if (d.grab) {
        if (d.moved) { ukeRollSort(ns); if (d.grab.keepSel) { ukeRoll.sel = d.grab.notes.map(ukeNoteKey); } save(true); }
        else { sound(d.grab.notes[0][2], d.grab.prog, ukeNoteVel(d.grab.notes[0])); }
        return;
      }
      if (d.moved && ukeRoll.box) {
        var bq = ukeRoll.box, qa = at({ x: bq[0], y: bq[1] }), qb = at({ x: bq[2], y: bq[3] });
        ukeRoll.box = null;
        var got = ukeRollBox(ns, qa.beat, qb.beat, qa.midi, qb.midi);
        for (var gi = 0; gi < got.length; gi++) { if (ukeRoll.sel.indexOf(got[gi]) < 0) { ukeRoll.sel.push(got[gi]); } }
        ctx.render();
        return;
      }
      if (d.moved) { return; }
      var q = at({ x: d.x0, y: d.y0 });
      if (q.midi < ukeRoll.low || q.midi >= ukeRoll.low + UKE_ROLL_ROWS) { return; }
      var hit = ukeRollHit(ns, q.beat, q.midi);
      if (ukeRoll.tool === "sel") {
        // §198: 選ぶ — タップで選ぶ／外す。空いた所で全部外す
        if (hit < 0) { if (ukeRoll.sel.length) { ukeRoll.sel = []; ctx.render(); } return; }
        var key = ukeNoteKey(ns[hit]), at0 = ukeRoll.sel.indexOf(key);
        if (at0 >= 0) { ukeRoll.sel.splice(at0, 1); } else { ukeRoll.sel.push(key); sound(ns[hit][2], rtu.prog, ukeNoteVel(ns[hit])); }
        ctx.render();
        return;
      }
      if (ukeRoll.tool === "move") { return; }
      if (hit >= 0) { ns.splice(hit, 1); save(true); return; }
      if (ns.length >= UKE_MEL_MAX) { ctx.toast("メロディは" + UKE_MEL_MAX + "音までです"); return; }
      var g = ukeTl.snap, nb = Math.max(0, Math.floor(q.beat / g + 1e-6) * g), nn = [nb, ukeRoll.len, q.midi];
      if (ukeRoll.vel !== 0.8) { nn.push(ukeRoll.vel); }
      ns.push(nn);
      ukeRollSort(ns);
      sound(q.midi, rtu.prog, ukeRoll.vel);
      save(true);
    }
    if (window.PointerEvent) {
      cv.addEventListener("pointerdown", function (ev) { try { cv.setPointerCapture(ev.pointerId); } catch (e) {} down(ev); });
      cv.addEventListener("pointermove", move);
      cv.addEventListener("pointerup", up);
      cv.addEventListener("pointercancel", function () { if (drag && drag.grab) { for (var i = 0; i < drag.grab.notes.length; i++) { var o = drag.grab.orig[i]; drag.grab.notes[i][0] = o[0]; drag.grab.notes[i][1] = o[1]; drag.grab.notes[i][2] = o[2]; } ukeRollDraw(cv, seq, sched); } if (ukeRoll.box) { ukeRoll.box = null; ukeRollDraw(cv, seq, sched); } drag = null; });
    } else {
      cv.addEventListener("touchstart", down, { passive: false });
      cv.addEventListener("touchmove", move, { passive: false });
      cv.addEventListener("touchend", up);
      cv.addEventListener("mousedown", down);
      cv.addEventListener("mousemove", move);
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

  function ukeDrumGridHtml(t, steps, sel) {
    var h = '<div class="uke-drum"><table>', i, k;
    for (i = 0; i < t.custom.length; i++) {
      var row = t.custom[i], nm = UKE_DRUM_ROWS[ukeDrumRowIdx(row[0])][1];
      h += '<tr><th>' + nm + '</th>';
      for (k = 0; k < steps; k++) {
        h += '<td><button class="uke-step' + (row[1].indexOf(k) >= 0 ? " on" : "") + (k % 4 === 0 ? " beat" : "") + '" data-dstep="' + row[0] + ':' + k + '"></button></td>';
      }
      h += '</tr>';
    }
    h += '</table></div><div class="uke-chips">' + sel('class="uke-drum-src"', ukeGrooves().map(function (g) { return [g.id, g.name]; }), "8beat") +
      '<button class="uke-chip" data-dcopy="1">をもとにする</button><button class="uke-chip" data-dclear="1">&#x1F9F9; 全部消す</button></div>';
    return h;
  }
  var UKE_FX_OPTS = [[-1, "いつもの設定"], [0, "なし"], [1, "少し"], [2, "ふつう"], [3, "たっぷり"]];
  function ukeMixerHtml(seq, sel) {
    var tr = seq.tracks, names = (window.UGMelody && window.UGMelody.gmNames) || [], h = '<h4 class="arcade-prize-cat">&#x1F39A;&#xFE0F; トラック・ミキサー</h4>' +
      '<div class="uke-chips"><button class="uke-chip" data-seq="bandprev">&#x25B6;&#xFE0F; ベースとドラムを試聴（2小節）</button>' +
      '<button class="uke-chip" data-seq="fillprev">&#x25B6;&#xFE0F; フィルを試聴（3小節）</button></div>' +
      // §197: 響き
      '<div class="uke-seq-set"><label>&#x1F30A; 響き（リバーブ）' + sel('data-set="rev"', UKE_FX_OPTS, seq.rev) + '</label>' +
      '<label>やまびこ（ディレイ）' + sel('data-set="dly"', UKE_FX_OPTS, seq.dly) + '</label></div>' +
      // §195: 展開
      '<div class="melody-checks uke-seq-checks"><label><input type="checkbox" data-set="dyn"' + (seq.dyn ? " checked" : "") + '> &#x1F4C8; セクションで強弱をつける（イントロは静か・サビは強く）</label></div>';
    var progOpts = [];
    for (var pg = 0; pg < 128; pg++) { progOpts.push([pg, (pg + 1 < 10 ? "00" : (pg + 1 < 100 ? "0" : "")) + (pg + 1) + " " + (names[pg] || "")]); }
    var ids = ukeTrackIds(tr);
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i], t = tr[id], au = ukeTrackAudible(tr, id), isX = id.charAt(0) === "x";
      h += '<div class="uke-trk' + (t.on ? "" : " off") + (isX ? " uke-trk-x" : "") + '"><div class="uke-trk-head">' +
        (id === "uke" ? '<b>' + UKE_TRACK_INFO[id].name + '</b>' : '<label><input type="checkbox" data-trk="' + id + '" data-tk="on"' + (t.on ? " checked" : "") + '> <b>' + ukeTrackName(tr, id) + '</b></label>') +
        '<span class="uke-trk-ms">' +
        (isX ? '<button class="arcade-mini-btn" data-xmove="' + id + ':-1" title="上へ"' + (tr.xs.indexOf(id) === 0 ? " disabled" : "") + '>&#x25B2;</button>' +
          '<button class="arcade-mini-btn" data-xmove="' + id + ':1" title="下へ"' + (tr.xs.indexOf(id) === tr.xs.length - 1 ? " disabled" : "") + '>&#x25BC;</button>' +
          '<button class="arcade-mini-btn" data-xdel="' + id + '" title="トラックを消す">&#x1F5D1;&#xFE0F;</button>' +
          (t.genre ? '<button class="arcade-mini-btn on" data-trk="' + id + '" data-tk="genre" title="ジャンルの楽器（次のジャンルで入れかわる）。押すとずっと残す">&#x1F3BC;</button>' : '') : '') +
        '<button class="arcade-mini-btn' + (t.mute ? " on" : "") + '" data-trk="' + id + '" data-tk="mute" title="ミュート">M</button>' +
        '<button class="arcade-mini-btn' + (t.solo ? " on" : "") + '" data-trk="' + id + '" data-tk="solo" title="ソロ">S</button>' +
        '<span class="uke-trk-led' + (au ? " on" : "") + '"></span></span></div>';
      if (t.on) {
        h += '<div class="uke-trk-body">';
        if (id === "bass") { h += '<label>パターン' + sel('data-trk="bass" data-tk="pattern"', UKE_BASS_PATTERNS, t.pattern) + '</label>'; }
        if (id === "drum") {
          h += '<label>リズム' + sel('data-trk="drum" data-tk="groove"', ukeGrooves().map(function (g) { return [g.id, g.name]; }).concat([["custom", "✏ マイリズム（打ち込み）"]]), t.groove) + '</label>' +
            '<label>フィル' + sel('data-trk="drum" data-tk="fill"', UKE_FILL_MODES, t.fill) + '</label>';
        }
        if (isX) {
          h += '<label>名前<input type="text" maxlength="12" data-trk="' + id + '" data-tk="name" value="' + I.escHtml(t.name) + '"></label>';
          if (t.kind === "chord") { h += '<label>鳴らし方' + sel('data-trk="' + id + '" data-tk="play"', UKE_X_PLAYS, t.play) + '</label>'; }
          h += '<label>高さ' + sel('data-trk="' + id + '" data-tk="oct"', [[-1, "1オクターブ下"], [0, "そのまま"], [1, "1オクターブ上"]], t.oct) + '</label>';
        }
        if (id === "rec1" || id === "rec2") { h += '<label>クオンタイズ' + sel('data-trk="' + id + '" data-tk="quant"', [["off", "なし"], ["8", "8分"], ["16", "16分"]], t.quant) + '</label>'; }
        if (id !== "drum") { h += '<label>音色' + sel('data-trk="' + id + '" data-tk="prog"', progOpts, t.prog) + '</label>'; }
        h += '<label>音量 ' + t.vol + '<input type="range" min="0" max="100" step="5" value="' + t.vol + '" data-trk="' + id + '" data-tk="vol"></label>' +
          '<label>左右' + sel('data-trk="' + id + '" data-tk="pan"', [[-0.6, "左"], [0, "中央"], [0.6, "右"]], t.pan) + '</label></div>';
      }
      if (id === "drum" && t.on && t.groove === "custom") { h += ukeDrumGridHtml(t, seq.meter === 3 ? 12 : 16, sel); }
      if (id === "rec1" || id === "rec2") {
        h += '<div class="uke-chips"><button class="uke-chip uke-rec-btn" data-rec="' + id + '">&#x1F399;&#xFE0F; 録音する</button>' +
          '<span class="uke-role">' + t.notes.length + '音</span>' + (t.notes.length ? '<button class="uke-chip" data-recclear="' + id + '">&#x1F5D1;&#xFE0F; 消す</button>' : '') + '</div>';
      }
      if (isX && t.on && t.kind === "notes") {
        h += '<div class="uke-chips"><button class="uke-chip" data-xroll="' + id + '">&#x1F3B9; ピアノロールで打ち込む</button><span class="uke-role">' + t.notes.length + '音</span></div>';
      }
      h += '</div>';
    }
    // §193: トラックを追加
    h += '<div class="uke-xadd"><div class="uke-label">&#x2795; トラックを追加（' + tr.xs.length + ' / ' + UKE_X_MAX + '本）</div>' +
      (tr.xs.length < UKE_X_MAX ? ukeChips(UKE_X_PRESETS.map(function (p) { return { v: p[0], t: p[1] }; }), function () { return false; }, "xadd") : '<p class="small" style="color:#adb5bd;margin:2px 0;">これ以上は追加できません（いらないトラックを 🗑 で消してください）</p>') + '</div>';
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
    var gNow = ukeGenreOf(seq);
    h += '<p class="small" style="color:#adb5bd;margin:0 0 6px;">コードを並べて伴奏を流そう。長さは音符で、Key・転調・スイング・奏法も選べるよ。</p>' +
      // §192: ジャンルでおまかせ伴奏
      // §194: たためる（見出しにいまのジャンル）
      '<details class="uke-genre"' + (ukeUi.genreOpen ? " open" : "") + '><summary class="uke-label">&#x1F3BC; ジャンル' + (gNow ? "（いま: " + ukeGenre(gNow).name + "）" : "") + '</summary>' +
      '<p class="small" style="color:#adb5bd;margin:2px 0;">ウクレレ・ベース・ドラム・楽器をまとめて切りかえ。再生中なら、そのジャンルで鳴らし直します。</p>' +
      UKE_GENRE_GROUPS.map(function (gp) {
        var gl = gp[1].map(ukeGenre).filter(function (gn) { return gn && gn.meter === (seq.meter === 3 ? 3 : 4); });
        return gl.length ? '<div class="uke-genre-cat">' + gp[0] + '</div>' + ukeChips(gl.map(function (gn) { return { v: gn.id, t: gn.name }; }), function (v) { return v === gNow; }, "genre") : '';
      }).join("") +
      '<div class="uke-chips"><button class="uke-chip" data-genre="random">&#x1F3B2; おまかせ</button>' +
      '<button class="uke-chip" data-seq="compose" title="いまのジャンルで イントロ→Aメロ→サビ→アウトロ の曲を作る（↶ で戻せる）">&#x1F3B9; おまかせ作曲</button>' +
      '<label class="uke-genre-bpm"><input type="checkbox" class="uke-genre-bpm-on"' + (ukeUi.genreBpm ? " checked" : "") + '> テンポもジャンルに合わせる</label>' +
      '<label class="uke-genre-bpm"><input type="checkbox" class="uke-genre-ly-on"' + (ukeUi.genreLayers ? " checked" : "") + '> ジャンルの楽器も足す</label></div></details>' +
      '<div class="uke-seq-set">' +
      '<label>BPM<input type="number" min="40" max="240" data-set="bpm" value="' + seq.bpm + '"></label>' +
      '<label>Key（全体）' + sel('data-set="key"', semiOpts, seq.key) + '</label>' +
      '<label>拍子' + sel('data-set="meter"', [[4, "4/4"], [3, "3/4"]], seq.meter) + '</label>' +
      '<label>奏法' + sel('data-set="style"', C.SEQ_STYLES.map(function (s2) { return [s2.id, s2.label]; }), seq.style) + '</label>' +
      '<label>スイング' + sel('data-set="swing"', C.SEQ_SWINGS.map(function (s3) { return [s3.v, s3.label]; }), seq.swing) + '</label>' +
      '<label>スイングする音符' + sel('data-set="swingGrid"', [[0.5, "8分"], [0.25, "16分"]], seq.swingGrid) + '</label>' +
      '<label>ポジション（全体）' + sel('data-set="pos"', UKE_POS, seq.pos) + '</label>' +
      '</div>' +
      (seq.style === "pat" ? '<label class="melody-row"><span>パターン（1小節・D ダウン / U アップ / - 休み / x ブラッシング / 1〜4 その弦だけ（1弦＝A・4弦＝G）/ P 4弦と1弦をいっしょに）</span><input type="text" class="uke-seq-pat" maxlength="16" value="' + I.escHtml(seq.pattern) + '"></label>' +
        '<div class="uke-chips"><button class="uke-chip" data-seq="patprev">&#x25B6;&#xFE0F; パターンを試聴</button></div>' +
        [["s", "&#x1F3B8; ストローク"], ["a", "&#x1F3BC; アルペジオ"]].map(function (kd) {
          var pl0 = ukePatterns(seq.meter, kd[0]);
          return pl0.length ? '<div class="uke-label">' + kd[1] + '</div>' + ukeChips(pl0.map(function (pp) { return { v: pp.p, t: pp.p + ' <span class="uke-role">' + pp.label + '</span>' }; }), function (v) { return v === seq.pattern; }, "pat") : '';
        }).join("") : '') +
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
          (bad ? '<span style="color:#ff7675;">？ 読めない名前です（🎯で選べます）</span>' : I.escHtml(info.name !== r.name ? "→" + info.name : info.name) + ' <span class="uke-role">押さえ方 ' + info.shape.join("-") + '</span>') + '</span>' +
          ukeRowStyleHtml(r, i, sel, seq.meter);
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
      '<div class="uke-seq-set"><label>&#x1F422; 練習テンポ' + sel('data-set="rate"', UKE_RATES.map(function (r5) { return [r5, r5 + "%" + (r5 === 100 ? "（そのまま）" : "")]; }), seq.rate) + '</label>' +
      '<label class="uke-rate-up"><span><input type="checkbox" data-set="rateUp"' + (seq.rateUp ? " checked" : "") + '> ループごとに +5%</span><span class="uke-rate-now"></span></label></div>' +
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
      else if (k === "rate") { seq.rate = Number(el.value); }
      else { seq[k] = Number(el.value); }
      if ((k === "rev" || k === "dly") && ukeSeqPlayer) { ukeFxPop(); ukeFxPush(seq); }
      save(true);
    });
    all("input.uke-seq-pat", "onchange", function (ev) { seq.pattern = C.seqPattern(ev.currentTarget.value); save(true); });
    // §192: ジャンル（再生中なら、そのジャンルで鳴らし直す）
    all("input.uke-genre-bpm-on", "onchange", function (ev) { ukeUi.genreBpm = !!ev.currentTarget.checked; });
    all("input.uke-genre-ly-on", "onchange", function (ev) { ukeUi.genreLayers = !!ev.currentTarget.checked; });
    var gD = root.querySelector("details.uke-genre");
    if (gD && gD.addEventListener) { gD.addEventListener("toggle", function () { ukeUi.genreOpen = !!gD.open; }); }
    all("button[data-genre]", "onclick", function (ev) {
      var gid = ev.currentTarget.getAttribute("data-genre"), playing = !!ukeSeqPlayer;
      if (gid === "random") {
        var cand = ukeGenresFor(seq.meter).filter(function (gn) { return gn.id !== ukeGenreOf(seq); });
        gid = cand[Math.floor(Math.random() * cand.length)].id;
      }
      if (!ukeApplyGenre(seq, gid, ukeUi.genreBpm, ukeUi.genreLayers)) { return; }
      ctx.toast(ukeGenre(gid).name + " にしました");
      save(true);
      if (playing) { var pb = root.querySelector('button[data-seq="play"]'); if (pb && pb.onclick) { pb.onclick({ currentTarget: pb }); } }
    });
    all("button[data-pat]", "onclick", function (ev) { seq.pattern = ev.currentTarget.getAttribute("data-pat"); save(true); });
    all("input.uke-seq-chord", "onchange", function (ev) { seq.rows[rowOf(ev)].name = String(ev.currentTarget.value || "").slice(0, 24); save(true); });
    all("select.uke-seq-len", "onchange", function (ev) { seq.rows[rowOf(ev)].len = ev.currentTarget.value; save(true); });
    all("select.uke-seq-pos", "onchange", function (ev) { seq.rows[rowOf(ev)].pos = ev.currentTarget.value; save(true); });
    all("select.uke-seq-style", "onchange", function (ev) { var rw = seq.rows[rowOf(ev)]; rw.style = ev.currentTarget.value; if (rw.style === "pat" && !rw.pattern) { rw.pattern = seq.pattern; } save(true); });
    all("input.uke-seq-rpat", "onchange", function (ev) { seq.rows[rowOf(ev)].pattern = C.seqPattern(ev.currentTarget.value); save(true); });
    all("select.uke-seq-rpsel", "onchange", function (ev) { if (ev.currentTarget.value) { seq.rows[rowOf(ev)].pattern = ev.currentTarget.value; save(true); } });
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
        // §189: 練習テンポ（ループごとに +5% は、くりかえし・区間ループのとき）
        var rateEl = root.querySelector(".uke-rate-now");
        var speed = { rate: sc.rate, up: sc.rateUp, onRate: function (rt) { if (rateEl) { rateEl.textContent = "いま " + rt + "%"; } } };
        if (rateEl) { rateEl.textContent = sc.rate < 100 ? "いま " + sc.rate + "%" : ""; }
        var okp = sec ? ukeSeqStart(sec.seq, ctx.lowG, function (ri2, info2) { showNow(ri2 >= 0 ? ri2 + sec.offset : -1, info2); }, tick, speed) : ukeSeqStart(ukeSeqExpand(sc), ctx.lowG, showNow, tick, speed);
        if (!okp) { ctx.toast("鳴らせるコードがありません"); }
        return;
      }
      if (a === "bandprev") {
        // §191: 最初の2つのコードを1小節ずつ、いまのトラックの設定で（メロディ・録音は鳴らさない）
        var bvs = ukeSeqClean(seq), bv = {}, bk, bRows = [];
        for (var bj = 0; bj < bvs.rows.length && bRows.length < 2; bj++) {
          var brw = bvs.rows[bj];
          if (brw.type === "chord" && ukeResolve(brw.name, 0, ctx.lowG)) { bRows.push({ type: "chord", name: brw.name, len: "b" + bvs.meter, pos: brw.pos, style: brw.style, pattern: brw.pattern }); }
        }
        if (!bRows.length) { bRows = [{ type: "chord", name: "C", len: "b" + bvs.meter }, { type: "chord", name: "G", len: "b" + bvs.meter }]; }
        for (bk in bvs) { if (bvs.hasOwnProperty(bk)) { bv[bk] = bvs[bk]; } }
        bv.rows = bRows; bv.arr = []; bv.loop = false; bv.countIn = false; bv.metronome = false;
        bv.tracks = ukeTracksClean(JSON.parse(JSON.stringify(bvs.tracks)));
        bv.tracks.mel.on = false; bv.tracks.rec1.on = false; bv.tracks.rec2.on = false;
        bv.tracks.drum.fill = "off"; bv.dyn = false;
        if (!ukeSeqStart(bv, ctx.lowG, null, null)) { ctx.toast("鳴らせるコードがありません"); }
        return;
      }
      if (a === "compose") {
        // §196: いまのジャンルで曲を作る（再生中なら鳴らし直す）
        var cPlaying = !!ukeSeqPlayer, cr = ukeCompose(seq, ukeGenreOf(seq), Math.random, ukeUi.genreBpm, ukeUi.genreLayers);
        if (!cr) { return; }
        ctx.toast("&#x1F3B9; " + ukeGenre(cr.genre).name + "で作曲: Aメロ " + cr.a + " / サビ " + cr.s + "（Key " + cr.key + "）");
        save(true);
        if (cPlaying) { var cpb = root.querySelector('button[data-seq="play"]'); if (cpb && cpb.onclick) { cpb.onclick({ currentTarget: cpb }); } }
        return;
      }
      if (a === "fillprev") {
        // §195: 2小節目にフィル、3小節目の頭で「ジャーン」（フィルが「なし」なら4小節ごとの形で）
        var fvs = ukeSeqClean(seq), fv = {}, fk, fRows = [];
        for (var fj = 0; fj < fvs.rows.length && fRows.length < 3; fj++) {
          var frw = fvs.rows[fj];
          if (frw.type === "chord" && ukeResolve(frw.name, 0, ctx.lowG)) { fRows.push({ type: "chord", name: frw.name, len: "b" + fvs.meter, pos: frw.pos, style: frw.style, pattern: frw.pattern }); }
        }
        if (!fRows.length) { fRows = [{ type: "chord", name: "C", len: "b" + fvs.meter }]; }
        while (fRows.length < 3) { fRows.push(fRows[0]); }
        for (fk in fvs) { if (fvs.hasOwnProperty(fk)) { fv[fk] = fvs[fk]; } }
        fv.rows = fRows; fv.arr = []; fv.loop = false; fv.countIn = false; fv.metronome = false; fv.dyn = false;
        fv.tracks = ukeTracksClean(JSON.parse(JSON.stringify(fvs.tracks)));
        fv.tracks.mel.on = false; fv.tracks.rec1.on = false; fv.tracks.rec2.on = false;
        fv.tracks.drum.on = true;
        if (fv.tracks.drum.fill === "off") { fv.tracks.drum.fill = "4"; }
        if (!ukeSeqStart(fv, ctx.lowG, null, null)) { ctx.toast("鳴らせるコードがありません"); }
        return;
      }
      if (a === "patprev") {
        // §190: パターンだけを2小節（行の ▶ はその行のコードとパターン）
        var pvs = ukeSeqClean(seq), pvr = r >= 0 ? pvs.rows[r] : null, pv = {}, pk, pvName = "C";
        if (!pvr) { for (var pj = 0; pj < pvs.rows.length; pj++) { if (pvs.rows[pj].type === "chord" && ukeResolve(pvs.rows[pj].name, 0, ctx.lowG)) { pvName = pvs.rows[pj].name; break; } } }
        else { pvName = pvr.name; }
        for (pk in pvs) { if (pvs.hasOwnProperty(pk)) { pv[pk] = pvs[pk]; } }
        var pvPat = pvr && pvr.style === "pat" ? pvr.pattern : pvs.pattern, pvLen = "b" + pvs.meter;
        pv.rows = [0, 1].map(function () { return { type: "chord", name: pvName, len: pvLen, pos: pvr ? pvr.pos : "auto", style: "pat", pattern: pvPat }; });
        pv.arr = []; pv.loop = false; pv.countIn = false; pv.metronome = false;
        if (!ukeSeqStart(pv, ctx.lowG, null, null)) { ctx.toast("鳴らせるコードがありません"); }
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
        ctx.done({ mode: "seq", lowG: ctx.lowG, sound: true, seq: ukeSeqAtRate(sc2 ? sc2.seq : ukeSeqExpand(sq), sq.rate), notes: pf.notes, tones: pf.tones, fingers: pf.fingers, frets: pf.frets, compact: pf.view === "compact", hold: pf.hold === "hold", hybrid: pf.hold === "hybrid", smart: pf.hold === "smart", next: pf.next, latency: pf.latency });
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
      if (k === "mute" || k === "solo" || k === "genre") { t[k] = !t[k]; }
      else if (k === "on") { t.on = !!v; }
      else if (k === "pattern" || k === "groove" || k === "quant" || k === "play" || k === "fill") { t[k] = v; }
      else if (k === "name") { t.name = String(v || "").slice(0, 12); }
      else { t[k] = Number(v); }
      if (ukeSeqPlayer && ukeSeqPlayer.mix) { ukeSeqPlayer.sched.tracks = ukeTracksClean(seq.tracks); ukeMixerUpdate(ukeSeqPlayer.mix, ukeSeqPlayer.sched.tracks); }
      save(true);
    }
    all("button[data-trk]", "onclick", function (ev) { trkSet(ev.currentTarget.getAttribute("data-trk"), ev.currentTarget.getAttribute("data-tk")); });
    // §193: トラックの追加・並べかえ・削除・ピアノロールへ
    all("button[data-xadd]", "onclick", function (ev) {
      var nid = ukeXAdd(seq.tracks, ev.currentTarget.getAttribute("data-xadd"));
      if (!nid) { ctx.toast("トラックは" + UKE_X_MAX + "本までです"); return; }
      if (seq.tracks[nid].kind === "notes") { ukeRoll.track = nid; }
      ctx.toast("&#x2795; " + I.escHtml(seq.tracks[nid].name) + " を追加しました");
      save(true);
    });
    all("button[data-xmove]", "onclick", function (ev) { var pz = ev.currentTarget.getAttribute("data-xmove").split(":"); if (ukeXMove(seq.tracks, pz[0], Number(pz[1]))) { save(true); } });
    all("button[data-xdel]", "onclick", function (ev) { if (ukeXRemove(seq.tracks, ev.currentTarget.getAttribute("data-xdel"))) { ctx.toast("トラックを消しました（↶ で戻せます）"); save(true); } });
    all("button[data-xroll]", "onclick", function (ev) {
      ukeRoll.track = ev.currentTarget.getAttribute("data-xroll");
      ctx.render();
      var rc = root.querySelector("canvas.uke-roll");
      if (rc && rc.scrollIntoView) { try { rc.scrollIntoView({ block: "center" }); } catch (e) {} }
    });
    // §178: 録音する（合わせて弾く画面で録る。区間ループがオンなら区間だけ）
    all("button[data-rec]", "onclick", function (ev) {
      var id = ev.currentTarget.getAttribute("data-rec"), pf = ukePrefs(), sq = ukeSeqClean(seq), sc2 = ukeSeqSection(sq), offB = 0;
      if (sc2) {
        var fs = ukeSeqSchedule(sq, ctx.lowG);
        for (var fi = 0; fi < fs.rows.length; fi++) { if (fs.rows[fi].i === sc2.a) { offB = fs.rows[fi].start; break; } }
        sc2.seq.loop = false;
      } else { sq = ukeSeqExpand(sq); sq.loop = false; }
      ukeSeqStop();
      ctx.done({ mode: "seq", lowG: ctx.lowG, sound: true, seq: ukeSeqAtRate(sc2 ? sc2.seq : sq, sq.rate), rec: id, recOffset: offB, notes: pf.notes, tones: pf.tones, fingers: pf.fingers, frets: pf.frets, compact: pf.view === "compact", hold: pf.hold === "hold", hybrid: pf.hold === "hybrid", smart: pf.hold === "smart", next: pf.next, latency: pf.latency });
    });
    // §189: マイリズムの打ち込み
    all("button[data-dstep]", "onclick", function (ev) {
      var ps = ev.currentTarget.getAttribute("data-dstep").split(":"), m = Number(ps[0]), k = Number(ps[1]), cu = seq.tracks.drum.custom;
      for (var i = 0; i < cu.length; i++) {
        if (cu[i][0] !== m) { continue; }
        var at = cu[i][1].indexOf(k);
        if (at >= 0) { cu[i][1].splice(at, 1); } else { cu[i][1].push(k); cu[i][1].sort(function (a, b) { return a - b; }); }
        var UG = window.UGMelody, ac4 = UG && UG.audioInit();
        if (ac4 && at < 0) { try { UG.drum(ac4, m, ac4.currentTime, cu[i][2]); } catch (e) {} }
      }
      save(true);
    });
    all("button[data-dcopy]", "onclick", function () {
      var src = root.querySelector("select.uke-drum-src");
      seq.tracks.drum.custom = ukeDrumFrom(src ? src.value : "8beat");
      save(true);
    });
    all("button[data-dclear]", "onclick", function () { seq.tracks.drum.custom = ukeDrumCustomClean([]); save(true); });
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
  var ukeUi = { tab: "play", genreBpm: true, genreLayers: true, genreOpen: true, setOpen: false, drillOpen: false, markBig: false, vPos: "auto", dRoot: 0, dQual: "maj", dVoice: 0, pRoot: 0, pParts: [], pBass: -1, pVoice: 0, sMode: "parts", sShape: [0, 0, 0, 3], sName: "" };
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
      // 設定（Low-G・勉強の助け・フレット数・画面・押さえ方）。あそぶタブは上に、ほかのタブは下に（§186）
      var settingsH = '<div class="melody-checks"><label><input type="checkbox" data-p="lowG"' + (lowG ? " checked" : "") + '> Low-G（4弦のGを1オクターブ低く）</label>' +
        (ukeUi.tab === "play" ? '<label><input type="checkbox" data-p="notes"' + (prefs.notes ? " checked" : "") + '> 指板に音名を表示</label>' +
          '<label><input type="checkbox" data-p="tones"' + (prefs.tones ? " checked" : "") + '> コードの音がある場所を光らせる</label>' +
          '<label><input type="checkbox" data-p="fingers"' + (prefs.fingers ? " checked" : "") + '> お手本に指番号を出す</label>' +
          '<label><input type="checkbox" data-p="next"' + (prefs.next ? " checked" : "") + '> 次のコードの押さえ方を表示（紫の点線）</label>' : '') + '</div>' +
        (ukeUi.tab === "play" ? '<div class="uke-seq-set"><label>表示するフレット数' + ukeSelect('data-pp="frets"', UKE_FRET_CHOICES, prefs.frets) + '</label>' +
          '<label>辞典から出題のポジション' + ukeSelect('data-pp="posPref"', UKE_POS, prefs.posPref) + '</label>' +
          '<label>画面' + ukeSelect('data-pp="view"', [["normal", "ふつう"], ["compact", "引き（ボタンを減らして指板を大きく）"]], prefs.view) + '</label>' +
          '<label class="uke-wide">押さえ方' + ukeSelect('data-pp="hold"', [["real", "リアルタイム（押さえている間だけ）"], ["hold", "ホールド（タップで印を付けておく）"], ["hybrid", "ハイブリッド（鳴らしたら次の押さえで入れかえ）"], ["smart", "スマート（1か所なら飾り・2か所目から新しいコード）"]], prefs.hold) + '</label></div>' +
          '<details class="uke-help"><summary>ボタンと押さえ方の説明</summary><p class="small" style="color:#adb5bd;margin:4px 0;">ボタン: &#x2B07;&#xFE0F; ダウン・&#x2B06;&#xFE0F; アップ＝4本をその向きに鳴らす ／ &#x270B; はなす＝ホールドした印（ホールドの押さえ方・マウスで付けた印）を全部消す ／ ▲▼＝見えるフレットの位置を動かす。' +
          'ホールドにすると、先にマスをタップして押さえ方を作り、あとはストロークするだけで鳴らせます（正解すると印は自動で消えます）。' +
          'ハイブリッドは、鳴らしたあとに次の所を押さえ始めると前の印が消えて、すぐ次のコードを作れます。' +
          'スマートは、鳴らしたあと1か所だけ押すと「飾り」（コードはそのまま。sus4 やメロディに）、2か所目を押すと「新しいコード」として作り直します（C→Am のような指1本のコードは、前の印を外してから押す）。</p></details>' : '');
      var h = '<div class="melody-setup"><div class="uke-title"><h3 style="margin:0;">&#x1F3B8; ゴリラウクレレ</h3>' +
        '<button class="modal-btn melody-small-btn" data-m="back">&#x1F579;&#xFE0F; メニューへ</button></div>', i, my = ukeLoadMy(), c, seqTab = null;
      // タブは大きなボタンで3列に（小さいと見落としやすいため）
      h += ukeChips(UKE_TABS.map(function (t) { return { v: t[0], t: t[1] }; }), function (v) { return v === ukeUi.tab; }, "tab").replace('<div class="uke-chips">', '<div class="uke-chips uke-tabs">');
      cards = {};
      if (ukeUi.tab === "play") {
        // たたんでおき、見出しに今の設定を出す（開いたかどうかは覚えておく）
        var HOLD_NAMES = { real: "リアルタイム", hold: "ホールド", hybrid: "ハイブリッド", smart: "スマート" };
        h += '<details class="uke-settings"' + (ukeUi.setOpen ? " open" : "") + '><summary>&#x2699;&#xFE0F; 設定: 押さえ方 ' + HOLD_NAMES[prefs.hold] + '・' + prefs.frets + 'フレット・' +
          (prefs.view === "compact" ? "引き" : "ふつう") + (lowG ? "・Low-G" : "") + '</summary>' + settingsH + '</details>';
        // §188: 上達メニュー
        var bests = ukeBestLoad();
        h += '<details class="uke-settings uke-drill"' + (ukeUi.drillOpen ? " open" : "") + '><summary>&#x1F3CB;&#xFE0F; 上達メニュー（ストローク練習・1分間チェンジ・タイミング調整）</summary>' +
          '<div class="uke-label">&#x1F941; ストローク練習（流れてくる ⬇⬆ に合わせて8小節）</div>' +
          '<div class="uke-seq-set"><label>テンポ' + ukeSelect('data-pp="strumBpm"', UKE_STRUM_BPMS.map(function (b0) { return [b0, "BPM " + b0]; }), prefs.strumBpm) + '</label></div>' +
          ukeChips(ukePatterns(4, "s").map(function (pp) { return { v: "strum:" + pp.p, t: pp.p + ' <span class="uke-role">' + pp.label + '</span>' }; }), function () { return false; }, "m") +
          '<div class="uke-label">&#x1F501; 1分間チェンジ（60秒で何回持ちかえられるか）</div>' +
          ukeChips(UKE_CHANGE_PAIRS.map(function (pr0) { var k0 = pr0[0] + "|" + pr0[1]; return { v: "change:" + k0, t: pr0[0] + " ↔ " + pr0[1] + (bests[k0] ? ' <span class="uke-role">ベスト ' + bests[k0] + '回</span>' : '') }; }), function () { return false; }, "m") +
          '<div class="uke-label">&#x23F1;&#xFE0F; タイミング調整（いまの補正 ' + (prefs.latency > 0 ? "+" : "") + prefs.latency + 'ms）</div>' +
          '<div class="uke-chips"><button class="uke-chip" data-m="calib">&#x23F1;&#xFE0F; 音に合わせて測る</button>' +
          '<button class="uke-chip" data-lat="-10">&#xFF0D;10ms</button><button class="uke-chip" data-lat="10">&#xFF0B;10ms</button><button class="uke-chip" data-lat="0">0 にもどす</button></div>' +
          '<p class="small" style="color:#adb5bd;margin:2px 0;">画面をさわってから音が出るまでの遅れを測って、リズム判定（合わせて弾く・ストローク練習）で補正します。判定が「おそい」ばかりなら＋に。</p></details>';
        h += '<p class="small" style="color:#ffd166;margin:0 0 6px;">&#x1F446; コード辞典・カスタム（自分でコードを作る）・マイコード・シーケンサーは、上のボタンで切りかえ</p>';
        h += '<p class="small" style="color:#adb5bd;margin:0 0 8px;">左手で指板（上）を押さえたまま、右手でサウンドホール（下の丸）の上を横にスワイプ。通った弦が順番に鳴るよ。押さえる場所はコード表と同じ向き（左から G・C・E・A）。</p>';
        for (i = 0; i < UKE_MODES.length; i++) { h += modeBtn(UKE_MODES[i].id, UKE_MODES[i].name, UKE_MODES[i].note); }
        h += modeBtn("dict", "&#x1F393; コード辞典から出題", "360コードからランダム（お手本あり・60秒）");
        h += modeBtn("my", "&#x2B50; マイコードで練習", my.length ? "保存した" + my.length + "個から出題（お手本あり・60秒）" : "マイコードを保存すると遊べます", !my.length);
        // §187: 練習の記録と苦手
        var weak = ukeWeakList(10);
        h += modeBtn("weak", "&#x1F613; 苦手なコードを練習", weak.length >= 3 ? "記録から苦手な順に8つを多めに出題（お手本あり・60秒）" : "コード練習で3コード以上の記録ができると遊べます", weak.length < 3);
        h += '<details class="uke-settings"><summary>&#x1F4C8; 練習の記録（苦手な順）</summary>';
        if (!weak.length) { h += '<p class="small" style="color:#6c757d;margin:4px 0;">まだ記録がありません。コード練習で4本ストロークすると記録されます。</p>'; }
        else {
          h += '<table class="uke-stats"><tr><th>コード</th><th>正解率</th><th>平均</th><th>回数</th></tr>';
          for (i = 0; i < weak.length; i++) {
            h += '<tr><td>' + I.escHtml(weak[i].name) + '</td><td>' + Math.round(weak[i].rate * 100) + '%</td><td>' + (weak[i].ok ? weak[i].avg.toFixed(1) + '秒' : '―') + '</td><td>' + weak[i].n + '</td></tr>';
          }
          h += '</table><button class="uke-chip" data-stats="clear">&#x1F5D1;&#xFE0F; 記録を消す</button>';
        }
        h += '</details>';
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
      if (ukeUi.tab !== "play") { h += settingsH; }
      h += '<button class="modal-btn" data-m="back" style="width:100%;margin-top:8px;">&#x1F579;&#xFE0F; メニューへ</button></div>';
      root.innerHTML = h;
      on("button[data-lat]", function (ev) {
        var dv = Number(attr(ev, "data-lat"));
        prefs.latency = dv === 0 ? 0 : Math.max(-200, Math.min(200, prefs.latency + dv));
        ukeSavePrefs(prefs);
        render();
      });
      var drD = root.querySelector("details.uke-drill");
      if (drD && drD.addEventListener) { drD.addEventListener("toggle", function () { ukeUi.drillOpen = !!drD.open; }); }
      on("button[data-stats]", function () { lsSet(UKE_STATS_KEY, {}); toast = "&#x1F4C8; 練習の記録を消しました"; render(); });
      var setD = root.querySelector("details.uke-settings");
      if (setD && setD.addEventListener) { setD.addEventListener("toggle", function () { ukeUi.setOpen = !!setD.open; }); }
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
          prefs[k2] = k2 === "frets" || k2 === "progKey" || k2 === "strumBpm" ? Number(ev.currentTarget.value) : ev.currentTarget.value;
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
        ctl.done({ mode: v, lowG: lowG, sound: true, notes: prefs.notes, tones: prefs.tones, fingers: prefs.fingers, frets: prefs.frets, posPref: prefs.posPref, compact: prefs.view === "compact", hold: prefs.hold === "hold", hybrid: prefs.hold === "hybrid", smart: prefs.hold === "smart", progKey: prefs.progKey, next: prefs.next, latency: prefs.latency, strumBpm: prefs.strumBpm });
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
      // §187: リズム判定・次のコードの予告・苦手
      var rhythm = { perfect: 0, great: 0, good: 0, miss: 0, combo: 0, best: 0, label: "", t: 0, id: "" }, showNext = cfg.next !== false;
      var weakList = mode === "weak" ? ukeWeakList(8) : [];
      // §188: 上達メニュー（ストローク練習・1分間チェンジ・タイミング調整）
      var latency = Math.max(-0.2, Math.min(0.2, (Number(cfg.latency) || 0) / 1000)), MODE_START = 30, strokeOrder = [], strokeF = -999;
      var strumP = null, changeP = null, calibP = null;
      if (mode.indexOf("strum:") === 0 && C) {
        var sbpm = UKE_STRUM_BPMS.indexOf(Number(cfg.strumBpm)) >= 0 ? Number(cfg.strumBpm) : 80;
        strumP = { pat: C.seqPattern(mode.substring(6)), bpm: sbpm, spb: 60 / sbpm, notes: ukeStrumNotes(mode.substring(6), sbpm), click: 0, done: false, label: "", labelT: 0, labelId: "",
          perfect: 0, great: 0, good: 0, miss: 0, combo: 0, best: 0 };
        practice = false;
      }
      if (mode.indexOf("change:") === 0) {
        var pr = mode.substring(7).split("|");
        if (pr.length === 2 && pr[0] && pr[1]) { changeP = { a: pr[0], b: pr[1], key: pr[0] + "|" + pr[1], turn: 0 }; } else { mode = "free"; practice = false; }
      }
      if (mode === "calib") { calibP = { bpm: 100, spb: 0.6, beats: 12, click: 0, offs: [], done: false, result: null }; practice = false; }
      if (mode === "weak" && weakList.length < 3) { mode = "free"; practice = false; }
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
        // §197: 合わせて弾くあいだも曲の響き（やめるときに ukeSeqStop でもどす）
        if (window.UGMelody && window.UGMelody.audioInit && window.UGMelody.audioInit()) { ukeFxPush(seqData); }
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
        if (changeP) {
          // 1分間チェンジ: 2つのコードを交互に
          var cn = changeP.turn % 2 === 0 ? changeP.a : changeP.b, csp = C ? C.parse(cn) : null;
          changeP.turn++;
          target = UKE_BY_NAME[cn] ? { name: cn, shape: UKE_BY_NAME[cn].shape } : (csp ? { name: cn, shape: ukeVoicePos(csp, lowG, cfg.posPref)[0] || [0, 0, 0, 0] } : null);
          chordT = 0;
          if (target) { pos = ukeFitPos(target.shape, pos, L.frets); }
          return;
        }
        if (mode === "weak") {
          // 苦手なほど出やすい（1番目は8回分・8番目は1回分）
          var bag = [], wi, wj;
          for (wi = 0; wi < weakList.length; wi++) { for (wj = 0; wj < weakList.length - wi; wj++) { bag.push(weakList[wi].name); } }
          var wn = null, wt = 0;
          do { wn = bag[randInt(0, bag.length - 1)]; wt++; } while (target && wn === target.name && wt < 20);
          var wsp = C ? C.parse(wn) : null, wmy = null;
          if (!wsp) { var ml = ukeLoadMy(); for (wi = 0; wi < ml.length; wi++) { if ("★" + ml[wi].name === wn || ml[wi].name === wn) { wmy = ml[wi]; } } }
          target = UKE_BY_NAME[wn] ? { name: wn, shape: UKE_BY_NAME[wn].shape } : (wsp ? { name: wn, shape: ukeVoicePos(wsp, lowG, cfg.posPref)[0] || [0, 0, 0, 0] } : (wmy ? { name: wn, shape: wmy.shape } : { name: "C", shape: [0, 0, 0, 3] }));
          chordT = 0;
          pos = ukeFitPos(target.shape, pos, L.frets);
          return;
        }
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
      function judge(firstFrame) {
        if (!practice || ended || !target || ear) { return; }
        var cur = current(), bad = [], i;
        for (i = 0; i < 4; i++) { if (cur[i] !== target.shape[i]) { bad.push(i); } }
        if (!bad.length && seqS) {
          var hk = seqPass + ":" + seqRow;
          msg = "◎ " + target.name;
          if (!seqHit[hk]) { seqHit[hk] = true; correct++; api.addScore(100); msg += "  +100"; ukeStatsAdd(target.name, true, chordT / 60); if (holdMode) { sticky = {}; } }
          // §187: リズム判定（1本目の時刻といちばん近い8分の拍）
          var gr = seqRhythm(firstFrame === undefined ? frames : firstFrame);
          if (gr) {
            rhythm[gr.id === "early" || gr.id === "late" ? "miss" : gr.id]++;
            rhythm.combo = gr.combo ? rhythm.combo + 1 : 0;
            if (rhythm.combo > rhythm.best) { rhythm.best = rhythm.combo; }
            if (gr.pts) { api.addScore(gr.pts); }
            rhythm.label = gr.label + (rhythm.combo >= 2 ? "  " + rhythm.combo + " COMBO" : "");
            rhythm.id = gr.id;
            rhythm.t = 50;
          }
          msgGood = true;
          msgT = 40;
          wrong = null;
          return;
        }
        if (bad.length && seqS) { rhythm.combo = 0; }
        if (bad.length) { ukeStatsAdd(target.name, false, 0); }
        if (!bad.length) {
          ukeStatsAdd(target.name, true, chordT / 60);
          var pts = prog ? 100 : (changeP ? 50 : 100 + Math.max(0, 50 - Math.floor(chordT / 60) * 5));
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
        // §188: ストロークの向き（最初に鳴った弦が G・C ならダウン、E・A ならアップ）
        if (frames - strokeF > UKE_STRUM_WINDOW) { strokeOrder = []; }
        strokeOrder.push(s);
        strokeF = frames;
        // 4本がまとまって鳴ったら「ストローク」として判定
        for (var i = 0; i < 4; i++) { if (frames - lastPluck[i] > UKE_STRUM_WINDOW) { return; } }
        var firstF = Math.min(lastPluck[0], lastPluck[1], lastPluck[2], lastPluck[3]), sdir = strokeOrder[0] <= 1 ? "down" : "up";
        lastPluck = [-999, -999, -999, -999];
        strokeOrder = [];
        if (strumP) { strumJudge(firstF, sdir); return; }
        if (calibP) { calibTap(firstF); return; }
        judge(firstF);
      }
      // §187: ストロークの1本目のフレーム → 判定（seqS がないときは null）
      function seqRhythm(f0) {
        if (!seqS || !seqS.beatAt) { return null; }
        var t = (f0 - SEQ_START) / 60 - seqPass * (seqS.time - seqS.lead) - latency, b = seqS.beatAt(t), g0 = Math.floor(b / 0.5) * 0.5;
        var d0 = t - seqS.tm(g0), d1 = t - seqS.tm(g0 + 0.5);
        return ukeRhythmGrade(Math.abs(d0) <= Math.abs(d1) ? d0 : d1);
      }
      // §188: ストローク練習の判定
      function strumJudge(f0, dir) {
        if (strumP.done) { return; }
        var t = (f0 - MODE_START) / 60 - latency, best = -1, bd = 0.25;
        for (var i = 0; i < strumP.notes.length; i++) {
          var n = strumP.notes[i];
          if (n.res) { continue; }
          var d = Math.abs(t - n.t);
          if (d <= bd) { bd = d; best = i; }
        }
        if (best < 0) { return; }
        var nt = strumP.notes[best], g = ukeRhythmGrade(t - nt.t);
        if (nt.dir !== dir || !(g.id === "perfect" || g.id === "great" || g.id === "good")) {
          nt.res = "miss"; strumP.miss++; strumP.combo = 0;
          strumP.label = nt.dir !== dir ? "MISS（向きがちがう）" : "MISS"; strumP.labelId = "miss";
        } else {
          nt.res = g.id; strumP[g.id]++;
          strumP.combo = g.combo ? strumP.combo + 1 : 0;
          if (strumP.combo > strumP.best) { strumP.best = strumP.combo; }
          api.addScore({ perfect: 30, great: 20, good: 10 }[g.id]);
          strumP.label = g.label + (strumP.combo >= 2 ? "  " + strumP.combo + " COMBO" : ""); strumP.labelId = g.id;
        }
        strumP.labelT = 40;
      }
      // §188: タイミング調整（押した時刻といちばん近い拍とのずれ）
      function calibTap(f0) {
        if (calibP.done) { return; }
        var t = (f0 - MODE_START) / 60, b = Math.round(t / calibP.spb);
        if (b < 4 || b >= calibP.beats) { return; }
        calibP.offs.push(t - b * calibP.spb);
      }
      // 上達メニューの時間を進める（メトロノーム・通りすぎた音符・終わり）
      function drillStep() {
        var now = (frames - MODE_START) / 60, UGd = window.UGMelody;
        if (strumP && !strumP.done) {
          var spb = strumP.spb, lastT = strumP.notes.length ? strumP.notes[strumP.notes.length - 1].t : 0;
          while (strumP.click * spb <= now + 0.1 && strumP.click < 36) {
            if (UGd && ac) { try { UGd.drum(ac, strumP.click % 4 === 0 ? 76 : 77, ac.currentTime + Math.max(0, strumP.click * spb - now), strumP.click % 4 === 0 ? 0.55 : 0.35); } catch (e) {} }
            strumP.click++;
          }
          for (var i = 0; i < strumP.notes.length; i++) {
            var n = strumP.notes[i];
            if (!n.res && now - latency > n.t + 0.25) { n.res = "miss"; strumP.miss++; strumP.combo = 0; strumP.label = "MISS"; strumP.labelId = "miss"; strumP.labelT = 30; }
          }
          if (now > lastT + 1) {
            strumP.done = true; ended = true;
            var tot = strumP.notes.length, acc = tot ? Math.round((strumP.perfect + strumP.great) / tot * 100) : 0;
            api.gameOver("おつかれさま！ 正確さ" + acc + "%");
          }
        }
        if (calibP && !calibP.done) {
          while (calibP.click < calibP.beats && calibP.click * calibP.spb <= now + 0.1) {
            if (UGd && ac) { try { UGd.drum(ac, calibP.click < 4 ? 77 : 76, ac.currentTime + Math.max(0, calibP.click * calibP.spb - now), 0.55); } catch (e2) {} }
            calibP.click++;
          }
          if (now > calibP.beats * calibP.spb + 0.6) {
            calibP.done = true; ended = true;
            var o = calibP.offs.slice().sort(function (a, b) { return a - b; });
            if (o.length >= 4) {
              var med = o.length % 2 ? o[(o.length - 1) / 2] : (o[o.length / 2 - 1] + o[o.length / 2]) / 2;
              calibP.result = Math.max(-200, Math.min(200, Math.round(med * 1000 / 10) * 10));
              var pfs = ukePrefs(); pfs.latency = calibP.result; ukeSavePrefs(pfs);
              api.gameOver("調整おわり " + (calibP.result > 0 ? "+" : "") + calibP.result + "ms");
            } else { api.gameOver("音に合わせて4回以上鳴らしてね"); }
          }
        }
      }
      // §187: 次のコードの押さえ方（予告）
      function nextShape() {
        if (!showNext) { return null; }
        if (changeP && target) {
          var cnm = target.name === changeP.a ? changeP.b : changeP.a, csp2 = C ? C.parse(cnm) : null;
          return UKE_BY_NAME[cnm] ? UKE_BY_NAME[cnm].shape : (csp2 ? ukeVoicePos(csp2, lowG, cfg.posPref)[0] : null);
        }
        if (prog && progIdx + 1 < progTotal) {
          var nn = progChords[(progIdx + 1) % progChords.length], nsp = C ? C.parse(nn) : null;
          return UKE_BY_NAME[nn] ? UKE_BY_NAME[nn].shape : (nsp ? ukeVoicePos(nsp, lowG, cfg.posPref)[0] : null);
        }
        if (seqS && (seqProg >= 0.5 || !target)) {
          for (var i = 0; i < seqS.rows.length; i++) {
            var r = seqS.rows[i], off = seqPass * (seqS.time - seqS.lead), songT = (frames - SEQ_START) / 60;
            if (r.type === "chord" && r.ok && r.t0 + off > songT + 1e-6) { return r.shape; }
          }
        }
        return null;
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
          if (rhythm.t > 0) { rhythm.t--; }
          if (wrongT > 0) { wrongT--; if (wrongT === 0) { wrong = null; } }
          if (practice && !prog && !seqS && !ended && frames >= UKE_TIME) {
            ended = true;
            // §188: 1分間チェンジは自己ベスト
            if (changeP) { api.gameOver(ukeBestSet(changeP.key, correct) ? "ベスト更新！ " + correct + "回" : correct + "回 持ちかえ"); }
            else { api.gameOver("TIME UP"); }
          }
          if ((strumP || calibP) && !ended) { drillStep(); }
          if (strumP && strumP.labelT > 0) { strumP.labelT--; }
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
          // §187: 次のコードの予告（紫の点線）
          var nsh = nextShape();
          if (nsh) {
            ctx.strokeStyle = "rgba(190,140,255,0.9)"; ctx.lineWidth = 1.5;
            if (ctx.setLineDash) { ctx.setLineDash([3, 3]); }
            for (s = 0; s < 4; s++) {
              var nf2 = nsh[s] - pos;
              if (nsh[s] > 0 && nf2 >= 1 && nf2 <= L.frets) { ctx.beginPath(); ctx.arc(UKE_STRX[s] + 6, L.nut + (nf2 - 0.5) * L.fh, Math.min(8, L.fh * 0.3), 0, Math.PI * 2); ctx.stroke(); }
            }
            if (ctx.setLineDash) { ctx.setLineDash([]); }
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
          if (strumP || calibP) {
            var nowD = (frames - MODE_START) / 60;
            if (strumP) {
              hudText(ctx, "🥁 " + strumP.pat + "  BPM " + strumP.bpm, 6, 9);
              var barN = Math.floor((nowD / strumP.spb - 4) / 4) + 1;
              hudText(ctx, nowD < 4 * strumP.spb ? "カウント " + (Math.floor(nowD / strumP.spb) + 1) : "小節 " + Math.max(1, Math.min(8, barN)) + "/8", W - 6, 9, "right");
              hudText(ctx, "P" + strumP.perfect + " G" + strumP.great + " Good" + strumP.good + " MISS" + strumP.miss, W - 6, 22, "right");
              // レーン（右から左へ。左の線で弾く）
              var LY = L.nut + 6, LH = 56, JX = 40, PXS = 110;
              ctx.fillStyle = "rgba(5,6,15,0.82)"; ctx.fillRect(10, LY, W - 20, LH);
              ctx.strokeStyle = "#ffd166"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(JX, LY + 4); ctx.lineTo(JX, LY + LH - 4); ctx.stroke();
              for (var bb = 0; bb < 40; bb++) {
                var bx = JX + (bb * strumP.spb - nowD) * PXS;
                if (bx < 12 || bx > W - 12) { continue; }
                ctx.fillStyle = bb % 4 === 0 ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.12)"; ctx.fillRect(bx, LY + 2, 1, LH - 4);
              }
              ctx.font = "bold 20px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
              for (var ni = 0; ni < strumP.notes.length; ni++) {
                var sn = strumP.notes[ni], nx2 = JX + (sn.t - nowD) * PXS;
                if (nx2 < 14 || nx2 > W - 14) { continue; }
                ctx.fillStyle = sn.res === "miss" ? "rgba(255,118,117,0.5)" : (sn.res ? "rgba(85,239,196,0.5)" : (sn.dir === "down" ? "#ffd166" : "#74b9ff"));
                ctx.fillText(sn.dir === "down" ? "↓" : "↑", nx2, LY + LH / 2);
              }
              if (strumP.labelT > 0) {
                ctx.fillStyle = { perfect: "#ffd166", great: "#55efc4", good: "#74b9ff" }[strumP.labelId] || "#ff7675";
                ctx.font = "bold 13px sans-serif"; ctx.fillText(strumP.label, W / 2, LY + LH + 12);
              }
            } else {
              hudText(ctx, "⏱ タイミング調整", 6, 9);
              var bn = Math.floor(nowD / calibP.spb);
              hudText(ctx, bn < 4 ? "カウント " + (bn + 1) : "鳴らした " + calibP.offs.length + "/8", W - 6, 9, "right");
              ctx.fillStyle = "rgba(5,6,15,0.82)"; ctx.fillRect(10, L.nut + 6, W - 20, 56);
              ctx.fillStyle = nowD - bn * calibP.spb < 0.12 ? "#ffd166" : "#f1e4c8"; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
              ctx.fillText(bn < 4 ? "音を聞いて…" : "音に合わせて ⬇ ダウン！", W / 2, L.nut + 34);
            }
          } else if (ear) {
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
            hudText(ctx, "せいかい " + correct + "/" + (seqChords * seqPasses) + "  P" + rhythm.perfect + " G" + rhythm.great, W - 6, 22, "right");
            if (rhythm.t > 0) {
              ctx.fillStyle = { perfect: "#ffd166", great: "#55efc4", good: "#74b9ff" }[rhythm.id] || "#ff7675";
              ctx.font = "bold 13px sans-serif"; ctx.textAlign = "center";
              ctx.fillText(rhythm.label, W / 2, L.holeY + L.hole + 14 > L.h - 4 ? L.h - 18 : L.holeY + L.hole + 14);
            }
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
              hudText(ctx, "のこり " + remain + "秒  " + (changeP ? "持ちかえ " + correct + "回" : "せいかい " + correct), W - 6, 9, "right");
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
    roll: ukeRoll, rollImport: ukeRollImport, rollOp: ukeRollOp, rollHit: ukeRollHit, rollBox: ukeRollBox,
    tracksClean: ukeTracksClean, trackIds: ukeTrackIds, drumFills: ukeDrumFills, compose: ukeCompose, genreFx: ukeGenreFx, fxPush: ukeFxPush, fxPop: ukeFxPop, seqStart: ukeSeqStart, seqStop: ukeSeqStop, secEnergy: ukeSecEnergy, FILL_MODES: UKE_FILL_MODES, xAdd: ukeXAdd, xRemove: ukeXRemove, xMove: ukeXMove, xEvents: ukeXEvents, X_PRESETS: UKE_X_PRESETS, X_PLAYS: UKE_X_PLAYS, trackEvents: ukeTrackEvents, trackAudible: ukeTrackAudible, grooves: ukeGrooves, mixer: ukeMixer, TRACK_IDS: UKE_TRACK_IDS,
    arrangedToWritten: ukeArrangedToWritten, expand: ukeSeqExpand, sections: ukeSeqSections, lyricPlace: ukeLyricPlace, midiBytes: ukeMidiBytes, projectJson: ukeProjectJson, projectRead: ukeProjectRead, isMark: ukeIsMark,
    seqAtRate: ukeSeqAtRate, suggest: ukeSuggest, estimateKey: ukeEstimateKey, drumFrom: ukeDrumFrom, drumCustomClean: ukeDrumCustomClean, RATES: UKE_RATES,
    seqSection: ukeSeqSection, seqSemisAt: ukeSeqSemisAt, pick: ukePick,
    seqRec: ukeSeqRec, exportMidi: ukeSeqExportMidi, exportWav: ukeSeqExportWav,
    seqClean: ukeSeqClean, seqLoad: ukeSeqLoad, seqSave: ukeSeqSave, seqSchedule: ukeSeqSchedule, seqPresets: ukeSeqPresets, resolve: ukeResolve, SEQ_KEY: UKE_SEQ_KEY,
    strumNotes: ukeStrumNotes, patterns: ukePatterns, GENRES: UKE_GENRES, GENRE_GROUPS: UKE_GENRE_GROUPS, genre: ukeGenre, genresFor: ukeGenresFor, applyGenre: ukeApplyGenre, genreOf: ukeGenreOf, bestLoad: ukeBestLoad, bestSet: ukeBestSet, CHANGE_PAIRS: UKE_CHANGE_PAIRS, BEST_KEY: UKE_BEST_KEY,
    statsLoad: ukeStatsLoad, statsAdd: ukeStatsAdd, weakList: ukeWeakList, rhythmGrade: ukeRhythmGrade, STATS_KEY: UKE_STATS_KEY,
    countKeys: ukeCountKeys,
    markSet: ukeMarkSet, MARK_FRETS: UKE_MARK_FRETS,
    layout: ukeLayout, FRET_CHOICES: UKE_FRET_CHOICES, voicePos: ukeVoicePos, rowPos: ukeRowPos,
    ui: ukeUi, fitPos: ukeFitPos, voice: ukeVoice, detect: ukeDetect, loadMy: ukeLoadMy, saveMy: ukeSaveMy, addMy: ukeAddMy, MY_KEY: UKE_MY_KEY
  };
})();
