// =========================================================
// 究極ゴリラ ゲームセンター: 🎸 ゴリラベース（§254）
// arcade.js・arcade-melody.js の後に読み込む。音は window.UGMelody を使う。
// 録音（テイク）はシーケンサーの打ち込みと同じ [拍, 長さ（拍）, MIDI] の形で保存し、
// ゴリラウクレレのシーケンサーへ「🎸 ベース打ち込み」トラックとして送れる
// =========================================================
(function () {
  "use strict";

  var I = window.UGArcade && window.UGArcade.internal;
  if (!I) { return; }
  var W = I.W, hudText = I.hudText, emojiAt = I.emojiAt, lsGet = I.lsGet, lsSet = I.lsSet, escHtml = I.escHtml;

  var BASS_H = 300;
  var BASS_PREFS_KEY = "ultimateGorillaBassPrefsV1", BASS_TAKES_KEY = "ultimateGorillaBassTakesV1";
  var BASS_TAKES_MAX = 10, BASS_NOTES_MAX = 1000;
  var BASS_DO = ["ド", "ド#", "レ", "レ#", "ミ", "ファ", "ファ#", "ソ", "ソ#", "ラ", "ラ#", "シ"];
  var BASS_CDE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  var BASS_NAMES = [["do", "ドレミ"], ["cde", "CDE"], ["none", "なし"]];
  var BASS_VIEWS = [["fret", "&#x1F3B8; フレット"], ["pad", "&#x1F39B;&#xFE0F; パッド"]];
  // §256: 奏法
  var BASS_TECHS = [["normal", "ふつう"], ["slap", "&#x1F44D; スラップ"], ["mute", "&#x1F92B; ミュート"]];
  // 音色 [GM の番号, 名前]（32 だけサンプル。ほかは合成音）
  var BASS_VOICES = [[32, "&#x1F3BB; ウッドベース"], [33, "&#x1F3B8; エレキベース（指）"], [34, "&#x1F3B8; ピック"], [36, "&#x1F44D; スラップ"], [38, "&#x1F39B;&#xFE0F; シンセベース"]];

  // ---------- フレット ----------
  // 弦（上から G・D・A・E）の開放弦の MIDI と名前
  var BASS_STRINGS = [[43, "G"], [38, "D"], [33, "A"], [28, "E"]];
  var BASS_COLS = 8, BASS_POS_MAX = 12, BASS_BOARD_Y = 128, BASS_BOARD_X = 4;
  var BASS_MARKS = [3, 5, 7, 9, 12, 15, 17]; // フレットの印（12 は2つ）
  function bassColW() { return (W - BASS_BOARD_X * 2) / BASS_COLS; }
  function bassRowH() { return (BASS_H - BASS_BOARD_Y - 6) / BASS_STRINGS.length; }
  // マス（弦 s・列 c）の四角
  function bassCellRect(s, c) { var cw = bassColW(), rh = bassRowH(); return { x: BASS_BOARD_X + c * cw, y: BASS_BOARD_Y + s * rh, w: cw, h: rh }; }
  // 列 c のフレット（ポジション pos から）
  function bassFretOf(pos, c) { return pos + c; }
  // 座標 → { s: 弦, c: 列, f: フレット, m: MIDI }。フレットの外なら null
  function bassCellAt(x, y, pos) {
    var cw = bassColW(), rh = bassRowH(), c = Math.floor((x - BASS_BOARD_X) / cw), s = Math.floor((y - BASS_BOARD_Y) / rh);
    if (c < 0 || c >= BASS_COLS || s < 0 || s >= BASS_STRINGS.length || y < BASS_BOARD_Y) { return null; }
    var f = bassFretOf(pos, c);
    return { s: s, c: c, f: f, m: BASS_STRINGS[s][0] + f };
  }
  function bassPc(m) { return ((m % 12) + 12) % 12; }
  function bassName(m, names) {
    if (names === "none") { return ""; }
    return names === "cde" ? BASS_CDE[bassPc(m)] + (Math.floor(m / 12) - 1) : BASS_DO[bassPc(m)];
  }

  // ---------- パッド（いまのコードに合う音）----------
  var BASS_SCALE = [0, 2, 4, 5, 7, 9, 11];
  var BASS_QUAL = ["", "m", "m", "", "", "m", "dim"];
  // パッドの並び [ラベル, 音階で何度上か（0 ＝ ルート）, オクターブ]
  var BASS_PAD_DEFS = [["R", 0, 0], ["3", 2, 0], ["5", 4, 0], ["7", 6, 0], ["5↓", 4, -1], ["2", 1, 0], ["6", 5, 0], ["R↑", 0, 1]];
  var BASS_PAD_N = BASS_PAD_DEFS.length, BASS_CHORD_Y = 26, BASS_CHORD_H = 34, BASS_PAD_Y = 70;
  // キー key（0〜11）の d 番目（0〜6）のダイアトニックコード → { name, root: ルートの MIDI（E1〜D#2）, notes: パッドの MIDI 8つ }
  function bassChord(key, d) {
    var rootPc = (key + BASS_SCALE[d]) % 12, root = 28 + ((rootPc - 4 + 12) % 12), notes = [], i;
    for (i = 0; i < BASS_PAD_DEFS.length; i++) {
      var pd = BASS_PAD_DEFS[i], dd = d + pd[1], up = BASS_SCALE[dd % 7] + Math.floor(dd / 7) * 12 - BASS_SCALE[d];
      notes.push(root + up + pd[2] * 12);
    }
    return { name: BASS_CDE[rootPc] + BASS_QUAL[d], root: root, notes: notes };
  }
  function bassPadRect(i) {
    var cw = (W - 8) / 4, rh = (BASS_H - BASS_PAD_Y - 6) / 2;
    return { x: 4 + (i % 4) * cw + 2, y: BASS_PAD_Y + Math.floor(i / 4) * rh + 2, w: cw - 4, h: rh - 4 };
  }
  function bassPadAt(x, y) {
    for (var i = 0; i < BASS_PAD_N; i++) { var r = bassPadRect(i); if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) { return i; } }
    return -1;
  }
  function bassChordRect(d) { var cw = (W - 8) / 7; return { x: 4 + d * cw + 1, y: BASS_CHORD_Y, w: cw - 2, h: BASS_CHORD_H }; }
  function bassChordAt(x, y) {
    if (y < BASS_CHORD_Y || y >= BASS_CHORD_Y + BASS_CHORD_H) { return -1; }
    var d = Math.floor((x - 4) / ((W - 8) / 7));
    return d >= 0 && d < 7 ? d : -1;
  }

  // ---------- §255: シーケンサーの曲のコード ----------
  // コード名 → { name, root, notes }（パッドの MIDI 8つ）。key: 曲のキー（コードにない 7・2・6 を音階から選ぶ）。読めなければ null
  function bassSongChord(name, key) {
    var C = window.UGChords, sp = C && C.parse ? C.parse(name) : null, i;
    if (!sp) { return null; }
    var ivs = C.intervals(sp.parts), rpc = bassPc(sp.root), pow = ivs.length === 2;
    var third = pow ? -1 : ivs[1].iv, fifth = pow ? 7 : ivs[2].iv, sev = -1;
    for (i = 3; i < ivs.length; i++) { if (ivs[i].role === "7" || ivs[i].role === "♭7" || ivs[i].role === "°7") { sev = ivs[i].iv; } }
    function pick(a, d) { for (var k = 0; k < a.length; k++) { if (BASS_SCALE.indexOf(bassPc(rpc + a[k] - key)) >= 0) { return a[k]; } } return d; }
    if (third < 0) { third = pick([4, 3], 4); }
    if (sev < 0) { sev = pick([10, 11], third === 3 ? 10 : 11); }
    var root = 28 + bassPc(rpc - 4), low = sp.bass === null || sp.bass === undefined ? root : 28 + bassPc(sp.bass - 4);
    return { name: String(name), root: low, notes: [low, root + third, root + fifth, root + sev, root + fifth - 12, root + pick([2, 1], 2), root + pick([9, 8], 9), low + 12] };
  }
  // 伴奏の予定 → コードの並び [{ start, end, name, ch }]（拍。休み・読めないコードは前のコードをのばす。同じコードが続けば1つに）
  function bassSongChords(S, key) {
    var out = [], i;
    for (i = 0; i < S.rows.length; i++) {
      var r = S.rows[i], last = out[out.length - 1];
      if (r.type !== "chord" && r.type !== "rest") { continue; }
      var ch = r.type === "chord" ? bassSongChord(r.name, key) : null;
      if (ch && !(last && last.name === ch.name)) { out.push({ start: r.start, end: r.end, name: ch.name, ch: ch }); }
      else if (last) { last.end = r.end; }
    }
    return out;
  }
  // 拍 beat のときのコードの番号（はじめのコードより前は 0）
  function bassChordIdx(list, beat) {
    var k = 0;
    for (var i = 0; i < list.length; i++) { if (list[i].start <= beat + 1e-6) { k = i; } }
    return k;
  }

  // ---------- 設定・テイク ----------
  function bassProgOk(p) { for (var i = 0; i < BASS_VOICES.length; i++) { if (BASS_VOICES[i][0] === p) { return true; } } return false; }
  function bassPrefs() {
    var p = lsGet(BASS_PREFS_KEY) || {}, pos = Math.round(Number(p.pos)), key = Math.round(Number(p.key));
    return {
      view: p.view === "pad" ? "pad" : "fret",
      prog: bassProgOk(Number(p.prog)) ? Number(p.prog) : 33,
      names: p.names === "cde" || p.names === "none" ? p.names : "do",
      pos: pos >= 0 && pos <= BASS_POS_MAX ? pos : 0,
      key: key >= 0 && key <= 11 ? key : 0,
      bpm: Math.max(40, Math.min(240, Math.round(Number(p.bpm) || 100))),
      metro: p.metro !== false, tech: p.tech === "slap" || p.tech === "mute" ? p.tech : "normal",
      backing: typeof p.backing === "string" && /^(cur|s:\d+)$/.test(p.backing) ? p.backing : "", backBass: !!p.backBass
    };
  }
  function bassSavePrefs(p) { return lsSet(BASS_PREFS_KEY, p); }
  function bassNum(v, lo, hi) { var n = Number(v); return isFinite(n) && n >= lo && n <= hi ? n : null; }
  // シーケンサーの打ち込み（§178）と同じ形に整える: [拍, 長さ, MIDI]（強さが 0.8 以外なら4つ目）
  function bassNotesClean(a) {
    var out = [], i;
    a = a && a.length ? a : [];
    for (i = 0; i < a.length && out.length < BASS_NOTES_MAX; i++) {
      var b = a[i] && bassNum(a[i][0], 0, 4096), d = a[i] && bassNum(a[i][1], 0.0625, 32), m = a[i] && bassNum(a[i][2], 0, 127), v = a[i] && bassNum(a[i][3], 0.1, 1);
      if (b !== null && d !== null && m !== null) { out.push(v !== null && v !== 0.8 ? [b, d, Math.round(m), v] : [b, d, Math.round(m)]); }
    }
    out.sort(function (x, y) { return x[0] - y[0]; });
    return out;
  }
  function bassTakeClean(t, i) {
    return {
      id: Math.max(1, Math.round(Number(t.id)) || i + 1), name: String(t.name || "テイク").slice(0, 20),
      bpm: Math.max(40, Math.min(240, Math.round(Number(t.bpm) || 100))), meter: t.meter === 3 ? 3 : 4,
      prog: bassProgOk(Number(t.prog)) ? Number(t.prog) : 33, notes: bassNotesClean(t.notes)
    };
  }
  function bassTakesLoad() {
    var a = lsGet(BASS_TAKES_KEY), out = [], i;
    if (!a || !a.length) { return out; }
    for (i = 0; i < a.length && out.length < BASS_TAKES_MAX; i++) { if (a[i] && typeof a[i] === "object") { out.push(bassTakeClean(a[i], i)); } }
    return out;
  }
  function bassTakesSave(list) { return lsSet(BASS_TAKES_KEY, list.slice(0, BASS_TAKES_MAX)); }
  // 新しいテイクを先頭に足す（10個をこえたら古いものを消す）。足したテイクを返す
  function bassTakeAdd(list, t) {
    var id = 0, i;
    for (i = 0; i < list.length; i++) { id = Math.max(id, list[i].id); }
    var take = bassTakeClean({ id: id + 1, name: t.name || "ベース " + (id + 1), bpm: t.bpm, meter: t.meter, prog: t.prog, notes: t.notes }, 0);
    list.unshift(take);
    if (list.length > BASS_TAKES_MAX) { list.length = BASS_TAKES_MAX; }
    return take;
  }
  function bassTakeById(list, id) { for (var i = 0; i < list.length; i++) { if (list[i].id === id) { return list[i]; } } return null; }
  function bassToSeqNotes(take) { return bassNotesClean(take && take.notes); }

  // ---------- ゴリラウクレレのシーケンサーへ送る ----------
  function bassSeqApi() { var U = window.UGUkulele; return U && U.seqLoad && U.xAdd ? U : null; }
  // テイクを、編集中の曲へ「🎸 ベース打ち込み」トラックとして送る。自動のベースが鳴っていればミュート → { ok, id, muted, msg }
  function bassSendToSeq(take) {
    var U = bassSeqApi();
    if (!U) { return { ok: false, msg: "ゴリラウクレレが読みこめませんでした" }; }
    if (!take || !take.notes || !take.notes.length) { return { ok: false, msg: "音のないテイクは送れません" }; }
    var st = U.seqLoad(), id = U.xAdd(st.cur.tracks, "bnotes");
    if (!id) { return { ok: false, msg: "追加トラックがいっぱいです（8本まで）。シーケンサーで1本消してから送ってね" }; }
    var t = st.cur.tracks[id], b = st.cur.tracks.bass, muted = false;
    t.name = String(take.name).slice(0, 12);
    t.prog = take.prog;
    t.notes = bassToSeqNotes(take);
    if (b && b.on && !b.mute) { b.mute = true; muted = true; }
    U.seqSave(st);
    return { ok: true, id: id, muted: muted, msg: "「" + take.name + "」を、ゴリラウクレレのシーケンサー（編集中の曲）に 🎸 ベース打ち込みトラックとして送りました" +
      (muted ? "。自動のベースは重ならないようにミュートしました（シーケンサーのミキサーでもどせます）" : "") };
  }

  // ---------- §255: 伴奏（ゴリラドラムの §227 と同じ） ----------
  function bassBackApi() { var U = window.UGUkulele; return U && U.seqLoad && U.seqSchedule && U.expand ? U : null; }
  // 伴奏にえらべる曲 [[id, 名前]]（"cur" ＝ 編集中の曲、"s:番号" ＝ 保存した曲）
  function bassBackList() {
    var U = bassBackApi(), out = [], st, i;
    if (!U) { return out; }
    st = U.seqLoad();
    out.push(["cur", "編集中の曲"]);
    for (i = 0; i < st.songs.length; i++) { out.push(["s:" + st.songs[i].id, st.songs[i].name]); }
    return out;
  }
  // 伴奏の曲（構成どおり・練習テンポ・くりかえしなし）→ { name, seq, s: 予定, lowG, key, chords }
  function bassBacking(id) {
    var U = bassBackApi(), st, sq = null, name = "", lowG = false, key = 0, i;
    if (!U || !id) { return null; }
    st = U.seqLoad();
    if (id === "cur") { sq = st.cur; name = "編集中の曲"; }
    for (i = 0; i < st.songs.length; i++) { if ("s:" + st.songs[i].id === id) { sq = st.songs[i].seq; name = st.songs[i].name; } }
    if (!sq || !sq.rows || !sq.rows.length) { return null; }
    sq = U.expand(U.seqClean(sq));
    sq.loop = false;
    if (U.seqAtRate) { sq = U.seqAtRate(sq, sq.rate); }
    try { lowG = !!U.prefs().lowG; } catch (e) {}
    var sc = U.seqSchedule(sq, lowG);
    if (!sc || !sc.events || !sc.events.length) { return null; }
    try { key = U.estimateKey ? U.estimateKey(sc.rows) : 0; } catch (e2) {}
    return { name: name, seq: sq, s: sc, lowG: lowG, key: key, chords: bassSongChords(sc, key) };
  }
  // 伴奏のイベントを鳴らすか（クリックは曲のメトロノームかカウントインのとき。noBass: 曲のベースを鳴らさない）
  function bassBackEventOn(ev, seq, lead, noBass) {
    if (ev.kind === "click") { return !!seq.metronome || ev.t < lead; }
    var xt = seq && seq.tracks && ev.track ? seq.tracks[ev.track] : null;
    return !(noBass && (ev.track === "bass" || (xt && xt.prog >= 32 && xt.prog <= 39)));
  }

  // ---------- はじめの画面 ----------
  function bassSetup(root, ctl) {
    var p = bassPrefs(), note = "";
    function draw() {
      var takes = bassTakesLoad(), i;
      var html = '<div class="melody-setup"><h3 style="margin:0 0 4px;">&#x1F3B8; ゴリラベース</h3>' +
        '<p class="small" style="color:#adb5bd;margin:0 0 8px;">4本の弦のフレットか、コードに合う音のパッドで弾こう。録ったベースはシーケンサーへ送れます。</p>';
      html += '<p class="small" style="margin:4px 0 2px;">弾き方</p><div class="quiz-opts">';
      for (i = 0; i < BASS_VIEWS.length; i++) {
        html += '<button class="modal-btn quiz-opt' + (p.view === BASS_VIEWS[i][0] ? " active" : "") + '" data-view="' + BASS_VIEWS[i][0] + '">' + BASS_VIEWS[i][1] + '</button>';
      }
      html += '</div><p class="small" style="margin:4px 0 2px;">音色</p><div class="piano-opts">';
      for (i = 0; i < BASS_VOICES.length; i++) {
        html += '<button class="modal-btn quiz-opt' + (p.prog === BASS_VOICES[i][0] ? " active" : "") + '" data-prog="' + BASS_VOICES[i][0] + '">' + BASS_VOICES[i][1] + '</button>';
      }
      html += '</div><p class="small" style="margin:4px 0 2px;">音名</p><div class="quiz-opts">';
      for (i = 0; i < BASS_NAMES.length; i++) {
        html += '<button class="modal-btn quiz-opt' + (p.names === BASS_NAMES[i][0] ? " active" : "") + '" data-names="' + BASS_NAMES[i][0] + '">' + BASS_NAMES[i][1] + '</button>';
      }
      html += '</div>';
      var bl = bassBackList();
      if (bl.length) {
        html += '<p class="small" style="margin:6px 0 2px;">&#x1F3B8; 伴奏（ゴリラウクレレのシーケンサーの曲）</p><div class="piano-opts">' +
          '<button class="modal-btn quiz-opt' + (!p.backing ? " active" : "") + '" data-backing="-">なし</button>';
        for (i = 0; i < bl.length; i++) { html += '<button class="modal-btn quiz-opt' + (p.backing === bl[i][0] ? " active" : "") + '" data-backing="' + bl[i][0] + '">' + escHtml(bl[i][1]) + '</button>'; }
        html += '</div>';
        if (p.backing) { html += '<div class="quiz-opts"><button class="modal-btn quiz-opt' + (p.backBass ? " active" : "") + '" data-backbass="1">伴奏のベースも鳴らす ' + (p.backBass ? "ON" : "OFF") + '</button></div>'; }
      }
      html += '<button class="modal-btn" data-go="1" style="width:100%;margin-top:8px;">&#x1F3B8; はじめる</button>';
      html += '<p class="small" style="margin:10px 0 2px;">&#x1F399;&#xFE0F; 録音したテイク（' + takes.length + ' / ' + BASS_TAKES_MAX + '）</p>';
      if (note) { html += '<p class="small" style="color:#ffd166;margin:0 0 4px;">' + note + '</p>'; }
      if (!takes.length) { html += '<p class="small" style="color:#adb5bd;margin:0;">まだありません。弾く画面の「🔴 録音」で録れます。</p>'; }
      for (i = 0; i < takes.length; i++) {
        html += '<div class="piano-take"><span>' + escHtml(takes[i].name) + '<br><span class="small" style="color:#adb5bd;">' + takes[i].notes.length + '音・BPM ' + takes[i].bpm + '</span></span>' +
          '<button class="modal-btn" data-open="' + takes[i].id + '">&#x25B6;&#xFE0F; ひらく</button>' +
          '<button class="modal-btn" data-send="' + takes[i].id + '" title="シーケンサーへ送る">&#x1F3B8; 送る</button>' +
          '<button class="modal-btn" data-del="' + takes[i].id + '">&#x1F5D1;&#xFE0F;</button></div>';
      }
      html += '<button class="modal-btn" data-back="1" style="width:100%;margin-top:14px;">&#x1F579;&#xFE0F; メニューへ</button></div>';
      root.innerHTML = html;
      var btns = root.querySelectorAll("button"), j;
      for (j = 0; j < btns.length; j++) {
        btns[j].onclick = function (ev) {
          var el = ev.currentTarget, v;
          if ((v = el.getAttribute("data-view"))) { p.view = v; bassSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-prog")) !== null) { p.prog = Number(v); bassSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-names"))) { p.names = v; bassSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-backing"))) { p.backing = v === "-" ? "" : v; bassSavePrefs(p); draw(); return; }
          if (el.getAttribute("data-backbass")) { p.backBass = !p.backBass; bassSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-send"))) {
            var rs = bassSendToSeq(bassTakeById(bassTakesLoad(), Number(v)));
            note = (rs.ok ? "&#x2705; " : "&#x26A0;&#xFE0F; ") + escHtml(rs.msg);
            draw();
            return;
          }
          if ((v = el.getAttribute("data-del"))) {
            var list = bassTakesLoad(), t = bassTakeById(list, Number(v));
            if (!t || (window.confirm && !window.confirm("「" + t.name + "」を消しますか？"))) { return; }
            list.splice(list.indexOf(t), 1);
            bassTakesSave(list);
            draw();
            return;
          }
          if (el.getAttribute("data-back")) { ctl.back(); return; }
          if (el.getAttribute("data-go")) { ctl.done({ backing: p.backing }); return; }
          if ((v = el.getAttribute("data-open"))) { ctl.done({ take: Number(v), backing: p.backing }); }
        };
      }
    }
    draw();
  }

  // パッドの見た目でキー Q W E R / A S D F、コードは 1〜7、Z 録音・X 再生
  var BASS_KEYS = { q: "p0", w: "p1", e: "p2", r: "p3", a: "p4", s: "p5", d: "p6", f: "p7",
    "1": "c0", "2": "c1", "3": "c2", "4": "c3", "5": "c4", "6": "c5", "7": "c6", z: "rec", x: "play", t: "tech" };

  I.register({
    id: "bass",
    after: "drum",
    cat: "music",
    music: true,
    name: "ゴリラベース",
    icon: "&#x1F3B8;",
    desc: "4本の弦のフレットか、コードに合う音のパッドで弾いて録音。ゴリラウクレレのシーケンサーへ送れる",
    help: "フレット・パッドをタップ（同じ弦ですべらせるとスライド・押さえたまま上をタップでハンマリング）/ パッドは Q W E R・A S D F、コードは 1〜7 / T 奏法 / Z 録音 / X 再生 / P一時停止",
    controls: [],
    keys: BASS_KEYS,
    setup: bassSetup,
    setupLabel: "音色・テイク",
    panel: true,
    create: function (api, cfg) {
      cfg = cfg || {};
      var prefs = bassPrefs(), view = prefs.view, prog = prefs.prog, names = prefs.names;
      var frame = 0, press = {}, ended = false, msg = "", flash = {}, chordD = 0;
      var panel = api.panel;
      if (panel && panel.classList) { panel.classList.add("quiz-panel"); }
      if (api.setCanvasHeight) { api.setCanvasHeight(BASS_H); }
      function now() { return frame / 60; }

      // --- 音 ---
      var UG = window.UGMelody, audioOk = false;
      function audio() {
        if (audioOk || !UG || !UG.audioInit) { return; }
        try { if (UG.audioInit()) { audioOk = true; UG.loadSamples([prog]); } } catch (e) {}
      }
      // §256: how ＝ 奏法の音 "thumb" / "pop" / "ghost"（なしは ""）→ 音のハンドル（音が出せなければ null）
      function sound(m, lv, how) {
        audio();
        if (!audioOk) { return null; }
        var h = null;
        try {
          h = UG.synth(m, prog, 0, how === "ghost" ? 0.45 : (lv || 0.85)) || null;
          if (how && UG.bassHit) { UG.bassHit(how, 0, how === "ghost" ? 0.6 : 1); }
          if (how === "ghost" && h && UG.voiceStop) { UG.voiceStop(h, h.ac.currentTime + 0.05, 0.02); }
        } catch (e) {}
        return h;
      }
      // 奏法の音（s: 弦。パッドは -1）と、録音する強さ
      function techOf(m, s) {
        if (prefs.tech === "mute") { return "ghost"; }
        if (prefs.tech === "slap") { return (s >= 0 ? s >= 2 : m < 38) ? "thumb" : "pop"; }
        return "";
      }
      function velOf(how) { return how === "ghost" ? 0.35 : (how ? 1 : 0.8); }
      function howOfVel(v, m) { return v <= 0.4 ? "ghost" : (v >= 0.95 ? (m < 38 ? "thumb" : "pop") : ""); }
      // 鳴っている音 { h, cur }（ハンマリングのときは指どうしで同じものを使う）
      function bend(v, m, glide) { v.cur = m; if (v.h && UG.voiceBend) { try { UG.voiceBend(v.h, m, 0, glide); } catch (e) {} } }
      function hush(v) { if (v && v.h && UG.voiceStop) { try { UG.voiceStop(v.h, 0, 0.06); } catch (e) {} } }
      function click(accent) { if (audioOk) { try { UG.synth(accent ? 37 : 42, UG.DRUM, 0, accent ? 0.9 : 0.6); } catch (e) {} } }

      // --- 録音・再生 ---
      var bpm = prefs.bpm, meter = 4, metro = prefs.metro, takes = bassTakesLoad();
      var take = cfg.take ? bassTakeById(takes, cfg.take) : null, rec = null, play = null;
      if (take) { msg = "「" + escHtml(take.name) + "」をひらきました。▶ 再生で聴けます"; }
      // §255: 伴奏（シーケンサーの曲）。bk ＝ 鳴らしているあいだ
      var back = cfg.backing ? bassBacking(cfg.backing) : null, bk = null;
      if (back) { bpm = back.seq.bpm; meter = back.seq.meter; if (!take) { msg = "&#x1F3B8; 伴奏に合わせて弾こう。パッドのコードは曲に合わせて変わります"; } }
      else if (cfg.backing) { msg = "伴奏の曲が見つかりませんでした（ゴリラウクレレのシーケンサーで曲を作ってね）"; }
      function backT() { return bk ? (frame - bk.f0) / 60 : 0; }
      function backBeat() {
        var S = back.s, t = backT();
        return t < S.lead ? (t - S.lead) / S.spb : S.beatAt(t);
      }
      // pre: 伴奏の前に空ける秒（曲にカウントインがないときの録音）
      function backStart(pre) {
        backStop();
        audio();
        var U = bassBackApi(), progs = [24], ids, i;
        bk = { f0: frame + Math.round((pre || 0) * 60), idx: 0, outs: [null, null, null, null], mix: null, fx: false };
        if (!audioOk || !U) { return; }
        try {
          ids = U.trackIds(back.s.tracks);
          for (i = 0; i < ids.length; i++) { if (back.s.tracks[ids[i]].on && back.s.tracks[ids[i]].prog !== undefined) { progs.push(back.s.tracks[ids[i]].prog); } }
          UG.loadSamples(progs);
        } catch (e0) {}
        if (U.fxPush) { try { U.fxPush(back.seq); bk.fx = true; } catch (e) {} }
      }
      function backStop() {
        if (!bk) { return; }
        var U = bassBackApi();
        if (bk.fx && U && U.fxPop) { try { U.fxPop(); } catch (e) {} }
        bk = null;
      }
      function backStep() {
        var S = back.s, t = backT(), U = bassBackApi(), ac = audioOk && UG.audio ? UG.audio.ctx : null, ev;
        while (bk.idx < S.events.length && (ev = S.events[bk.idx]).t <= t + 0.1) {
          if (ac && U && U.seqPlayEvent && bassBackEventOn(ev, back.seq, S.lead, !prefs.backBass)) {
            try {
              if (!bk.mix) { bk.mix = U.mixer(UG, ac, S.tracks); }
              U.seqPlayEvent(UG, ac, ev, ac.currentTime + Math.max(0, ev.t - t), back.lowG, 0.55, bk.outs, bk.mix, S.tracks);
            } catch (e) {}
          }
          bk.idx++;
        }
        if (t >= S.time) {
          if (rec) { recStop(); }
          backStop();
          play = null;
          render();
        }
      }
      // いまのコード（伴奏があるとき）の番号
      function songIdx() { return back && back.chords.length ? bassChordIdx(back.chords, bk ? backBeat() : -1) : -1; }
      function curChord() { var k = songIdx(); return k >= 0 ? back.chords[k].ch : bassChord(prefs.key, chordD); }
      function recBeat() { return rec ? (rec.back ? backBeat() : (now() - rec.t0) * bpm / 60) : 0; }
      function r3(v) { return Math.round(v * 1000) / 1000; }
      function recToggle() {
        if (rec) { recStop(); return; }
        playStop();
        audio();
        if (back) {
          // 曲にカウントインがなければ、ベースが1小節ぶん数える
          backStart(back.s.lead ? 0 : meter * back.s.spb);
          rec = { back: true, notes: [], open: {}, beat: -99 };
        } else {
          rec = { t0: now() + meter * 60 / bpm, notes: [], open: {}, beat: -meter - 1 };
        }
        msg = "";
        render();
      }
      function recOn(id, m, v) {
        if (!rec) { return; }
        var b = recBeat();
        if (b < -0.25 || rec.notes.length >= BASS_NOTES_MAX) { return; }
        rec.open[id] = [Math.max(0, b), m, v || 0.8];
      }
      function recOff(id) {
        if (!rec || !rec.open[id]) { return; }
        var o = rec.open[id];
        delete rec.open[id];
        var nt = [r3(o[0]), r3(Math.max(0.0625, recBeat() - o[0])), o[1]];
        if (o[2] !== 0.8) { nt.push(o[2]); }
        rec.notes.push(nt);
      }
      function recStop() {
        var ks = [], k;
        for (k in rec.open) { if (rec.open.hasOwnProperty(k)) { ks.push(k); } }
        for (k = 0; k < ks.length; k++) { recOff(ks[k]); }
        var n = rec.notes, wasBack = rec.back;
        rec = null;
        if (wasBack) { backStop(); }
        if (n.length) {
          take = bassTakeAdd(takes, { bpm: bpm, meter: meter, prog: prog, notes: n });
          bassTakesSave(takes);
          msg = "&#x1F4BE; 「" + escHtml(take.name) + "」に保存しました（" + take.notes.length + "音）<br>はじめの画面の「🎸 送る」でシーケンサーに入れられます";
        } else {
          msg = "音がなかったので保存しませんでした";
        }
        render();
      }
      function playStop() {
        if (!play) { return; }
        for (var i = 0; i < play.vo.length; i++) { hush(play.vo[i]); }
        if (play.back) { backStop(); }
        play = null;
        render();
      }
      function playBeat() { return play ? (play.back ? backBeat() : (now() - play.t0) * play.bpm / 60) : 0; }
      function playToggle() {
        if (play) { playStop(); return; }
        if (rec) { return; }
        if (!take || !take.notes.length) { msg = "まだテイクがありません。🔴 録音してみよう"; render(); return; }
        // 伴奏があれば、テイクを伴奏といっしょに頭から
        play = { t0: now() + 0.1, notes: take.notes, bpm: take.bpm, idx: 0, back: !!back, vo: [] };
        if (back) { backStart(0); }
        audio();
        render();
      }
      function backToggle() {
        if (rec || !back) { return; }
        if (play) { playStop(); }
        if (bk) { backStop(); } else { backStart(0); }
        render();
      }

      // --- 弾く ---
      var vo = {}, pstr = {}; // §256: 指 → 鳴っている音・弦
      // 同じ弦を押さえているほかの指（いちばん高いフレット）
      function holderOn(s, not) {
        var best = null, k;
        for (k in press) { if (press.hasOwnProperty(k) && k !== not && pstr[k] === s && (best === null || press[k] > press[best])) { best = k; } }
        return best;
      }
      // s: 弦（フレット。パッドは省略）
      function noteOn(id, m, s) {
        if (m < 0 || ended) { return; }
        if (press[id] !== undefined) { noteOff(id); }
        s = s === undefined ? -1 : s;
        var j = s >= 0 ? holderOn(s, id) : null;
        press[id] = m;
        pstr[id] = s;
        // §256 ハンマリング: 同じ弦を押さえたまま、高いフレットを別の指でタップ → 鳴らしなおさずに高さを変える
        if (j !== null && m > vo[j].cur && prefs.tech !== "mute") {
          vo[id] = vo[j];
          bend(vo[id], m, 0);
          recOff(j);
          recOn(id, m, 0.8);
          return;
        }
        var how = techOf(m, s);
        vo[id] = { h: sound(m, 0.85, how), cur: m };
        recOn(id, m, velOf(how));
      }
      function noteOff(id) {
        if (press[id] === undefined) { return; }
        var v = vo[id], m = press[id], top = null, k;
        delete press[id];
        delete vo[id];
        delete pstr[id];
        recOff(id);
        for (k in press) { if (press.hasOwnProperty(k) && vo[k] === v && (top === null || press[k] > press[top])) { top = k; } }
        // はなすと止まる。ほかの指が同じ音を使っていれば、プリング（残った指の音にもどる）
        if (top === null) { hush(v); return; }
        if (v.cur === m) { bend(v, press[top], 0); recOn(top, press[top], 0.8); }
      }
      function allOff() { var ks = [], k; for (k in press) { if (press.hasOwnProperty(k)) { ks.push(k); } } for (k = 0; k < ks.length; k++) { noteOff(ks[k]); } }
      var padHeld = {}; // 指・キー → 押しているパッド
      function padPress(id, i) {
        if (!(i >= 0 && i < BASS_PAD_N)) { return; }
        padHeld[id] = i;
        flash["p" + i] = 10;
        noteOn(id, curChord().notes[i]);
      }
      // 伴奏があるときは、コードは曲に合わせて変わる（自分では選ばない）
      function setChord(d) { if (d >= 0 && d < 7 && !back) { chordD = d; flash["c" + d] = 10; } }
      function setTech(t) { prefs.tech = t; bassSavePrefs(prefs); render(); }
      function action(v) {
        if (v === "rec") { recToggle(); } else if (v === "play") { playToggle(); } else if (v === "back") { backToggle(); }
        else if (v === "view") { allOff(); padHeld = {}; view = view === "pad" ? "fret" : "pad"; prefs.view = view; bassSavePrefs(prefs); render(); }
        else if (v === "posdown" || v === "posup") {
          allOff();
          prefs.pos = Math.max(0, Math.min(BASS_POS_MAX, prefs.pos + (v === "posup" ? 1 : -1)));
          bassSavePrefs(prefs);
          render();
        }
        else if (v === "keydown" || v === "keyup") {
          allOff(); padHeld = {};
          prefs.key = (prefs.key + (v === "keyup" ? 1 : 11)) % 12;
          bassSavePrefs(prefs);
          render();
        }
        else if (v === "tech") {
          var ti = 0;
          for (var q = 0; q < BASS_TECHS.length; q++) { if (BASS_TECHS[q][0] === prefs.tech) { ti = q; } }
          setTech(BASS_TECHS[(ti + 1) % BASS_TECHS.length][0]);
        }
        else if (/^tech:/.test(v)) { setTech(v.substring(5)); }
        else if (v === "metro") { metro = !metro; prefs.metro = metro; bassSavePrefs(prefs); render(); }
        else if (v === "bpmdown" || v === "bpmup") {
          if (rec) { return; }
          bpm = Math.max(40, Math.min(240, bpm + (v === "bpmup" ? 5 : -5)));
          prefs.bpm = bpm;
          bassSavePrefs(prefs);
          render();
        }
      }

      function render() {
        if (!panel) { return; }
        var html = '<div class="piano-row"><button class="modal-btn' + (rec ? " piano-rec-on" : "") + '" data-ba="rec">' + (rec ? "&#x23F9;&#xFE0F; 録音をとめる" : (back ? "&#x1F534; 合わせて録音" : "&#x1F534; 録音")) + '</button>' +
          '<button class="modal-btn" data-ba="play"' + (rec ? " disabled" : "") + '>' + (play ? "&#x23F9;&#xFE0F; とめる" : (back ? "&#x25B6;&#xFE0F; テイク＋伴奏" : "&#x25B6;&#xFE0F; 再生")) + '</button></div>';
        if (back) {
          html += '<div class="piano-row"><button class="modal-btn" data-ba="back"' + (rec ? " disabled" : "") + '>' + (bk && !play && !rec ? "&#x23F9;&#xFE0F; 伴奏をとめる" : "&#x1F3B8; 伴奏だけ鳴らす") + '</button>' +
            '<button class="modal-btn" data-ba="metro">&#x1F941; ' + (metro ? "ON" : "OFF") + '</button></div>' +
            '<p class="small" style="margin:4px 0 0;">&#x1F3B8; 伴奏: ' + escHtml(back.name) + '（BPM ' + back.seq.bpm + '・' + back.seq.meter + '拍子' + (prefs.backBass ? "" : "・曲のベースは鳴らさない") + '）</p>';
        } else {
          html += '<div class="piano-row"><button class="modal-btn" data-ba="bpmdown">&minus;</button><span>BPM ' + bpm + '</span><button class="modal-btn" data-ba="bpmup">&#xFF0B;</button>' +
            '<button class="modal-btn" data-ba="metro">&#x1F941; ' + (metro ? "ON" : "OFF") + '</button></div>';
        }
        if (view === "fret") {
          html += '<div class="piano-row"><button class="modal-btn" data-ba="posdown">&#x25C0;</button><span>' + (prefs.pos ? prefs.pos + "〜" + (prefs.pos + BASS_COLS - 1) + " フレット" : "開放弦〜7 フレット") + '</span>' +
            '<button class="modal-btn" data-ba="posup">&#x25B6;</button></div>';
        } else if (!back) {
          html += '<div class="piano-row"><button class="modal-btn" data-ba="keydown">&#x25C0;</button><span>キー ' + BASS_CDE[prefs.key] + '</span>' +
            '<button class="modal-btn" data-ba="keyup">&#x25B6;</button></div>';
        }
        html += '<div class="piano-row">';
        for (i = 0; i < BASS_TECHS.length; i++) { html += '<button class="modal-btn' + (prefs.tech === BASS_TECHS[i][0] ? " piano-rec-on" : "") + '" data-ba="tech:' + BASS_TECHS[i][0] + '">' + BASS_TECHS[i][1] + '</button>'; }
        html += '</div>';
        html += '<div class="piano-row"><button class="modal-btn" data-ba="view">' + (view === "pad" ? "&#x1F3B8; フレットにする" : "&#x1F39B;&#xFE0F; パッドにする") + '</button></div>';
        if (take && !rec) { html += '<p class="small" style="margin:4px 0 0;">いまのテイク: ' + escHtml(take.name) + '（' + take.notes.length + '音・BPM ' + take.bpm + '）</p>'; }
        if (msg) { html += '<p class="small" style="margin:4px 0 0;color:#ffd166;">' + msg + '</p>'; }
        panel.innerHTML = html;
        var bs = panel.querySelectorAll ? panel.querySelectorAll("button[data-ba]") : [], i;
        for (i = 0; i < bs.length; i++) {
          bs[i].onclick = function (ev) { if (ev.currentTarget.blur) { ev.currentTarget.blur(); } action(ev.currentTarget.getAttribute("data-ba")); };
        }
      }
      render();

      // いま鳴っている（押している・再生している）音
      function litNotes() {
        var out = {}, k, i;
        if (play) {
          var pb = playBeat();
          for (i = 0; i < play.notes.length; i++) { var n = play.notes[i]; if (n[0] <= pb && pb < n[0] + Math.max(0.25, n[1])) { out[n[2]] = "play"; } }
        }
        for (k in press) { if (press.hasOwnProperty(k)) { out[press[k]] = "press"; } }
        return out;
      }
      function text(ctx, s, x, y, size, color) {
        ctx.fillStyle = color;
        ctx.font = "bold " + size + "px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(s, x, y);
      }
      function drawFret(ctx) {
        var lit = litNotes(), s, c, r, cw = bassColW(), rh = bassRowH(), top = BASS_BOARD_Y, bot = BASS_BOARD_Y + rh * BASS_STRINGS.length;
        ctx.fillStyle = "#5b3a24";
        ctx.fillRect(BASS_BOARD_X, top, cw * BASS_COLS, bot - top);
        // フレットの印
        for (c = 0; c < BASS_COLS; c++) {
          var f = bassFretOf(prefs.pos, c), cx = BASS_BOARD_X + (c + 0.5) * cw;
          if (BASS_MARKS.indexOf(f) < 0) { continue; }
          ctx.fillStyle = "#e8d8b8";
          if (f === 12) {
            ctx.beginPath(); ctx.arc(cx, top + rh, 3.5, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(cx, top + rh * 3, 3.5, 0, Math.PI * 2); ctx.fill();
          } else { ctx.beginPath(); ctx.arc(cx, top + rh * 2, 3.5, 0, Math.PI * 2); ctx.fill(); }
        }
        // フレット（列の区切り）。ポジション 0 の開放弦の右は太いナット
        for (c = 1; c < BASS_COLS; c++) {
          ctx.fillStyle = c === 1 && prefs.pos === 0 ? "#f5f0e6" : "#b8b8b8";
          ctx.fillRect(BASS_BOARD_X + c * cw - (c === 1 && prefs.pos === 0 ? 2 : 0.75), top, c === 1 && prefs.pos === 0 ? 4 : 1.5, bot - top);
        }
        // §255: 伴奏があるときは、いまのコードの音（R・3・5）のマスに輪（ルートは太く）
        var ch = back && back.chords.length ? curChord() : null, chPcs = {};
        if (ch) { chPcs[bassPc(ch.notes[1])] = 1; chPcs[bassPc(ch.notes[2])] = 1; chPcs[bassPc(ch.root)] = 2; }
        // 弦と、押している・鳴っているマス
        for (s = 0; s < BASS_STRINGS.length; s++) {
          var sy = top + (s + 0.5) * rh;
          for (c = 0; c < BASS_COLS; c++) {
            var m = BASS_STRINGS[s][0] + bassFretOf(prefs.pos, c), st = lit[m];
            r = bassCellRect(s, c);
            if (ch && chPcs[bassPc(m)]) {
              ctx.strokeStyle = chPcs[bassPc(m)] === 2 ? "#ff922b" : "rgba(116,192,252,0.85)";
              ctx.lineWidth = chPcs[bassPc(m)] === 2 ? 3 : 1.5;
              ctx.beginPath(); ctx.arc(r.x + r.w / 2, sy, Math.min(r.w, r.h) * 0.36, 0, Math.PI * 2); ctx.stroke();
              ctx.lineWidth = 1;
            }
            if (st) {
              ctx.fillStyle = st === "press" ? "#ffd166" : "#74c0fc";
              ctx.beginPath(); ctx.arc(r.x + r.w / 2, sy, Math.min(r.w, r.h) * 0.36, 0, Math.PI * 2); ctx.fill();
            }
          }
          ctx.fillStyle = "#d9d9d9";
          ctx.fillRect(BASS_BOARD_X, sy - (1 + (3 - s) * 0.45), cw * BASS_COLS, 2 + (3 - s) * 0.9);
          for (c = 0; c < BASS_COLS; c++) {
            var nm = bassName(BASS_STRINGS[s][0] + bassFretOf(prefs.pos, c), names);
            if (nm) { r = bassCellRect(s, c); text(ctx, nm, r.x + r.w / 2, sy - rh * 0.3, 7, lit[BASS_STRINGS[s][0] + bassFretOf(prefs.pos, c)] ? "#ffffff" : "rgba(255,255,255,0.6)"); }
          }
        }
        // 弦の名前・フレットの番号
        for (s = 0; s < BASS_STRINGS.length; s++) { hudText(ctx, BASS_STRINGS[s][1], 1, top + (s + 0.5) * rh - rh * 0.3, "left"); }
        for (c = 0; c < BASS_COLS; c++) { var fn = bassFretOf(prefs.pos, c); text(ctx, fn === 0 ? "開放" : String(fn), BASS_BOARD_X + (c + 0.5) * cw, top - 7, 8, "#adb5bd"); }
      }
      function drawPads(ctx) {
        var ch = curChord(), lit = litNotes(), i, on = {}, k, si = songIdx();
        for (k in padHeld) { if (padHeld.hasOwnProperty(k)) { on[padHeld[k]] = true; } }
        // §255: 伴奏があるときは、上の段に「いまのコード・次のコード3つ」
        for (i = 0; si >= 0 && i < 4; i++) {
          var sr = { x: 4 + i * (W - 8) / 4 + 1, y: BASS_CHORD_Y, w: (W - 8) / 4 - 2, h: BASS_CHORD_H }, sc = back.chords[si + i];
          if (!sc) { continue; }
          ctx.fillStyle = i === 0 ? "#ffd166" : "#2f4a6e";
          ctx.fillRect(sr.x, sr.y, sr.w, sr.h);
          text(ctx, (i === 1 ? "次 " : "") + sc.name, sr.x + sr.w / 2, sr.y + sr.h / 2, i === 0 ? 14 : 10, i === 0 ? "#14213d" : "#ffffff");
        }
        for (i = 0; si < 0 && i < 7; i++) {
          var cr = bassChordRect(i), cur = i === chordD;
          ctx.fillStyle = cur ? "#ffd166" : (flash["c" + i] > 0 ? "#fff3b0" : "#2f4a6e");
          ctx.fillRect(cr.x, cr.y, cr.w, cr.h);
          text(ctx, bassChord(prefs.key, i).name, cr.x + cr.w / 2, cr.y + cr.h / 2, 10, cur ? "#14213d" : "#ffffff");
        }
        for (i = 0; i < BASS_PAD_N; i++) {
          var r = bassPadRect(i), m = ch.notes[i], hot = on[i] || flash["p" + i] > 0 || lit[m] === "play";
          ctx.fillStyle = hot ? "#ffd166" : (i === 0 || i === 7 ? "#6c4a9e" : "#4c3a8f");
          ctx.fillRect(r.x, r.y, r.w, r.h);
          ctx.strokeStyle = "#7d6bd6";
          ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
          text(ctx, BASS_PAD_DEFS[i][0], r.x + r.w / 2, r.y + r.h / 2 - 8, 18, hot ? "#14213d" : "#ffffff");
          text(ctx, bassName(m, names === "none" ? "cde" : names), r.x + r.w / 2, r.y + r.h / 2 + 14, 9, hot ? "#14213d" : "#d6ccff");
        }
      }

      return {
        input: function (a, down) {
          if (/^p\d$/.test(a)) {
            if (view !== "pad") { return; }
            if (down) { padPress("k" + a, Number(a.substring(1))); } else { delete padHeld["k" + a]; noteOff("k" + a); }
            return;
          }
          if (/^c\d$/.test(a)) { if (down && view === "pad") { setChord(Number(a.substring(1))); } return; }
          if (down && !ended) { action(a); }
        },
        pointer: function (type, x, y, id) {
          var pid = "p" + (id === undefined ? 0 : id);
          if (type === "down") {
            if (view === "pad") {
              var d = bassChordAt(x, y);
              if (d >= 0) { setChord(d); return; }
              padPress(pid, bassPadAt(x, y));
              return;
            }
            var c = bassCellAt(x, y, prefs.pos);
            if (c) { noteOn(pid, c.m, c.s); }
          } else if (type === "move") {
            // フレット: 同じ指をすべらせたら、となりのマスの音（スライド）
            if (view !== "fret" || press[pid] === undefined) { return; }
            var c2 = bassCellAt(x, y, prefs.pos);
            if (!c2 || c2.m === press[pid]) { return; }
            // §256: 同じ弦なら、鳴らしなおさずに高さをなめらかに変える（スライド）。別の弦は鳴らしなおす
            if (c2.s === pstr[pid] && vo[pid]) {
              var sounding = vo[pid].cur === press[pid];
              press[pid] = c2.m;
              if (sounding) { recOff(pid); bend(vo[pid], c2.m, 0.07); recOn(pid, c2.m, 0.8); }
              return;
            }
            noteOn(pid, c2.m, c2.s);
          } else { delete padHeld[pid]; noteOff(pid); }
        },
        step: function () {
          frame++;
          for (var k in flash) { if (flash.hasOwnProperty(k) && flash[k] > 0) { flash[k]--; } }
          if (play) {
            var pb = playBeat(), last = 0, i;
            while (play.idx < play.notes.length && play.notes[play.idx][0] <= pb) {
              var pn = play.notes[play.idx], pv = pn[3] || 0.8;
              play.vo.push({ h: sound(pn[2], pv, howOfVel(pv, pn[2])), end: pn[0] + pn[1] });
              play.idx++;
            }
            // §256: 録った長さで止める
            for (i = play.vo.length - 1; i >= 0; i--) { if (pb >= play.vo[i].end) { hush(play.vo[i]); play.vo.splice(i, 1); } }
            for (i = 0; i < play.notes.length; i++) { last = Math.max(last, play.notes[i][0] + play.notes[i][1]); }
            if (play.idx >= play.notes.length && pb > last && !play.back) { play = null; render(); } // 伴奏といっしょなら伴奏の終わりまで
          }
          if (rec) {
            // 伴奏で録るときのカウントは、曲にカウントインがなければベースが数える（あれば曲のクリック）
            var rb = Math.floor(recBeat()), cnt = rec.back ? !back.s.lead : true;
            if (rb !== rec.beat && ((metro && rb >= 0) || (rb < 0 && cnt))) { click(((rb % meter) + meter) % meter === 0); }
            rec.beat = rb;
          }
          if (bk) { backStep(); }
        },
        draw: function (ctx) {
          var g = ctx.createLinearGradient ? ctx.createLinearGradient(0, 0, 0, BASS_H) : null;
          if (g) { g.addColorStop(0, "#1b1f3b"); g.addColorStop(1, "#2d1b4e"); }
          ctx.fillStyle = g || "#1b263b";
          ctx.fillRect(0, 0, W, BASS_H);
          var si = songIdx(), nx = si >= 0 ? back.chords[si + 1] : null;
          hudText(ctx, view === "pad" ? (si >= 0 ? "🎸 伴奏" : "🎛️ キー " + BASS_CDE[prefs.key]) : (si >= 0 ? "🎸 " + back.chords[si].name + (nx ? " → " + nx.name : "") : "🎸 " + (prefs.pos ? prefs.pos + "フレット〜" : "開放弦〜")), 8, 10, "left");
          hudText(ctx, "BPM " + bpm, W - 8, 10, "right");
          var held = [], k;
          for (k in press) { if (press.hasOwnProperty(k)) { held.push(press[k]); } }
          held.sort(function (a, b) { return a - b; });
          var line = held.map(function (m) { return bassName(m, names === "none" ? "do" : names) + "（" + bassName(m, "cde") + "）"; }).join(" ");
          if (rec) {
            var rb = recBeat();
            text(ctx, rb < 0 ? String(Math.ceil(-rb)) : "● REC " + (Math.floor(rb / meter) + 1) + "小節・" + rec.notes.length + "音", W / 2, view === "pad" ? 18 : 30, view === "pad" ? 11 : 16, "#ff6b6b");
          }
          if (view === "pad") {
            if (!rec) { text(ctx, line || (play ? "再生中…" : (bk ? "伴奏中…" : "コード " + curChord().name + " に合う音")), W / 2, 18, 10, "#ffffff"); }
            drawPads(ctx);
          } else {
            if (!rec) { if (!line) { emojiAt(ctx, play ? "🎶" : "🦍", W / 2, 50, 34); } }
            text(ctx, line || (play ? "再生中…" : (bk ? "伴奏中…（輪はいまのコードの音）" : "弦のマスをタップして弾こう")), W / 2, rec ? 62 : (line ? 60 : 92), line ? 20 : 12, line ? "#ffd166" : "#ffffff");
            drawFret(ctx);
          }
        }
      };
    }
  });

  window.UGBass = {
    STRINGS: BASS_STRINGS, COLS: BASS_COLS, POS_MAX: BASS_POS_MAX, H: BASS_H, VOICES: BASS_VOICES, VIEWS: BASS_VIEWS, PAD_DEFS: BASS_PAD_DEFS, KEYS: BASS_KEYS,
    cellAt: bassCellAt, cellRect: bassCellRect, name: bassName, chord: bassChord, padRect: bassPadRect, padAt: bassPadAt, chordRect: bassChordRect, chordAt: bassChordAt,
    prefs: bassPrefs, notesClean: bassNotesClean, takesLoad: bassTakesLoad, takesSave: bassTakesSave, takeAdd: bassTakeAdd, takeById: bassTakeById, toSeqNotes: bassToSeqNotes,
    sendToSeq: bassSendToSeq, songChord: bassSongChord, songChords: bassSongChords, chordIdx: bassChordIdx, backList: bassBackList, backing: bassBacking, backEventOn: bassBackEventOn, PREFS_KEY: BASS_PREFS_KEY, TAKES_KEY: BASS_TAKES_KEY, TAKES_MAX: BASS_TAKES_MAX
  };
})();
