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
  // 設定画面で音を鳴らす（arp: アルペジオ）
  function ukePlayShape(shape, lowG, arp) {
    var UG = window.UGMelody;
    if (!UG) { return; }
    var ac = UG.audioInit();
    if (!ac) { return; }
    try { UG.loadSamples([UKE_PROG]); } catch (e) {}
    for (var s = 0; s < 4; s++) {
      if (shape[s] === null) { continue; }
      try { UG.synth(ukeMidi(s, shape[s], lowG), UKE_PROG, ac.currentTime + 0.02 + s * (arp ? 0.22 : 0.03), 0.85); } catch (e2) {}
    }
  }
  // 押さえ方の図（コード表の向き）。canvas は CSS で 110×152
  function ukeDiagram(cv, shape, rootPc, lowG) {
    if (!cv || !cv.getContext) { return; }
    var ctx = cv.getContext("2d"), k = 2, w = 110, h = 152;
    cv.width = w * k; cv.height = h * k;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.fillStyle = "#3b2414"; ctx.fillRect(0, 0, w, h);
    var mx = 0, mn = 99, i;
    for (i = 0; i < 4; i++) { if (shape[i] > 0) { if (shape[i] > mx) { mx = shape[i]; } if (shape[i] < mn) { mn = shape[i]; } } }
    var base = mx > 5 ? mn - 1 : 0, X0 = 28, DX = 18, Y0 = 26, DY = 20;
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
      }
      ctx.fillStyle = "#f1e4c8";
      ctx.fillText(ukeNoteName(midi), X0 + i * DX, Y0 + 5 * DY + 10);
    }
    ctx.fillStyle = "#adb5bd";
    ctx.font = "8px sans-serif";
    ctx.fillText("赤＝根音", w / 2, h - 4);
  }

  // ---------- 設定画面（タブ: あそぶ / コード辞典 / カスタム / マイコード） ----------
  var ukeUi = { tab: "play", dRoot: 0, dQual: "maj", dVoice: 0, pRoot: 0, pParts: [], pBass: -1, pVoice: 0, sMode: "parts", sShape: [0, 0, 0, 3], sName: "" };
  var UKE_TABS = [["play", "&#x1F3B8; あそぶ"], ["dict", "&#x1F4DA; コード辞典"], ["custom", "&#x1F6E0;&#xFE0F; カスタム"], ["my", "&#x2B50; マイコード"]];
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
    var prefs = lsGet(UKE_PREFS_KEY) || {}, lowG = !!prefs.lowG, toast = "", cards = {};
    function modeBtn(id, title, note, disabled) {
      return '<button class="modal-btn" data-m="' + id + '" style="width:100%;"' + (disabled ? " disabled" : "") + '>' + title +
        '<br><span class="small" style="color:inherit;opacity:0.75;">' + note + '</span></button>';
    }
    function render() {
      var h = '<div class="melody-setup"><h3 style="margin:0 0 4px;">&#x1F3B8; ゴリラウクレレ</h3>', i, my = ukeLoadMy(), c;
      h += ukeChips(UKE_TABS.map(function (t) { return { v: t[0], t: t[1] }; }), function (v) { return v === ukeUi.tab; }, "tab");
      cards = {};
      if (ukeUi.tab === "play") {
        h += '<p class="small" style="color:#adb5bd;margin:0 0 8px;">左手で指板（上）を押さえたまま、右手でサウンドホール（下の丸）の上を横にスワイプ。通った弦が順番に鳴るよ。押さえる場所はコード表と同じ向き（左から G・C・E・A）。</p>';
        for (i = 0; i < UKE_MODES.length; i++) { h += modeBtn(UKE_MODES[i].id, UKE_MODES[i].name, UKE_MODES[i].note); }
        h += modeBtn("dict", "&#x1F393; コード辞典から出題", "360コードからランダム（お手本あり・60秒）");
        h += modeBtn("my", "&#x2B50; マイコードで練習", my.length ? "保存した" + my.length + "個から出題（お手本あり・60秒）" : "マイコードを保存すると遊べます", !my.length);
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
      h += '<div class="melody-checks"><label><input type="checkbox" data-p="lowG"' + (lowG ? " checked" : "") + '> Low-G（4弦のGを1オクターブ低く）</label></div>' +
        '<button class="modal-btn" data-m="back" style="width:100%;margin-top:8px;">&#x1F579;&#xFE0F; メニューへ</button></div>';
      root.innerHTML = h;
      for (var k in cards) {
        if (cards.hasOwnProperty(k) && cards[k].shape) { ukeDiagram(root.querySelector('canvas[data-k="' + k + '"]'), cards[k].shape, cards[k].root, lowG); }
      }
      bind();
    }
    function on(sel, fn) {
      var els = root.querySelectorAll(sel);
      for (var i = 0; i < els.length; i++) { els[i].onclick = fn; }
    }
    function attr(ev, a) { return ev.currentTarget.getAttribute(a); }
    function bind() {
      on("button[data-tab]", function (ev) { ukeUi.tab = attr(ev, "data-tab"); render(); });
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
      var lowEl = root.querySelector('input[data-p="lowG"]');
      if (lowEl) { lowEl.onchange = function () { lowG = !!lowEl.checked; lsSet(UKE_PREFS_KEY, { lowG: lowG }); render(); }; }
      on("button[data-m]", function (ev) {
        var v = attr(ev, "data-m");
        if (v === "back") { ctl.back(); return; }
        lsSet(UKE_PREFS_KEY, { lowG: lowG });
        ctl.done({ mode: v, lowG: lowG, sound: true });
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
      if (mode === "my" && !myList.length) { mode = "free"; practice = false; }
      if (mode === "dict" && !C) { mode = "easy"; set = ukeChordSet("easy"); }
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
        if (!practice) { return; }
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
      function sound(s, delay) {
        if (!UG || !ac) { return; }
        var midi = ukeMidi(s, current()[s], lowG);
        try { UG.synth(midi, UKE_PROG, ac.currentTime + (delay || 0), 0.85); } catch (e) {}
      }
      function judge() {
        if (!practice || ended || !target) { return; }
        var cur = current(), bad = [], i;
        for (i = 0; i < 4; i++) { if (cur[i] !== target.shape[i]) { bad.push(i); } }
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
      function pluck(s, delay) {
        sound(s, delay);
        ring[s] = 30;
        lastPluck[s] = frames;
        // 4本がまとまって鳴ったら「ストローク」として判定
        for (var i = 0; i < 4; i++) { if (frames - lastPluck[i] > UKE_STRUM_WINDOW) { return; } }
        lastPluck = [-999, -999, -999, -999];
        judge();
      }
      function strumAll() { for (var s = 0; s < 4; s++) { pluck(s, s * 0.025); } }

      nextChord();

      return {
        input: function (action, down) {
          if (!down) { return; }
          if (action === "strum") { strumAll(); }
          else if (action === "clear") { sticky = {}; }
          else if (action === "posUp") { pos = Math.max(0, pos - 1); }
          else if (action === "posDown") { pos = Math.min(UKE_MAX_POS, pos + 1); }
          else if (action.charAt(0) === "p") { pluck(parseInt(action.substring(1), 10)); }
        },
        pointer: function (type, x, y, id, kind) {
          if (id === undefined) { id = "p"; }
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
              for (var s = 0; s < 4; s++) {
                if (Math.abs(x - UKE_STRX[s]) <= 8) { pluck(s); st.lx = UKE_STRX[s]; break; }
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
              var cr = ukeCrossed(strums[id].lx, x);
              for (var k = 0; k < cr.length; k++) { pluck(cr[k]); }
              strums[id].lx = x;
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
          if (practice && !prog && !ended && frames >= UKE_TIME) { ended = true; api.gameOver("TIME UP"); }
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
          if (practice && target) {
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
          if (msgT > 0) {
            ctx.fillStyle = msgGood ? "#55efc4" : "#ff7675";
            ctx.font = "bold 16px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(msg, W / 2, UKE_HOLE_Y);
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
    ui: ukeUi, fitPos: ukeFitPos, voice: ukeVoice, detect: ukeDetect, loadMy: ukeLoadMy, saveMy: ukeSaveMy, addMy: ukeAddMy, MY_KEY: UKE_MY_KEY
  };
})();
