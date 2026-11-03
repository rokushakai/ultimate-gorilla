// =========================================================
// 究極ゴリラ ゲームセンター: 🎺 ゴリラホーン（§306〜）
// arcade.js・arcade-melody.js・arcade-bass.js・arcade-strings.js の後に読み込む。
// のばす音はゴリラストリングス（window.UGStrings）の voice / pitch / level / stop / vibrato を借りる。
// コード・スケール・音量の出口などはゴリラベース（window.UGBass）のもの
// =========================================================
(function () {
  "use strict";

  var I = window.UGArcade && window.UGArcade.internal;
  if (!I) { return; }
  var W = I.W, hudText = I.hudText, lsGet = I.lsGet, lsSet = I.lsSet, escHtml = I.escHtml;
  function BA() { return window.UGBass; }
  function SV() { return window.UGStrings; }

  var HRN_H = 320;
  var HRN_PREFS_KEY = "ultimateGorillaHornPrefsV1", HRN_TAKES_KEY = "ultimateGorillaHornTakesV1";
  var HRN_TAKES_MAX = 10, HRN_NOTES_MAX = 2000, HRN_SEQ_MAX = 1000;
  var HRN_DO = ["ド", "ド#", "レ", "レ#", "ミ", "ファ", "ファ#", "ソ", "ソ#", "ラ", "ラ#", "シ"];
  var HRN_CDE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  var HRN_NAMES = [["do", "ドレミ"], ["cde", "CDE"], ["none", "なし"]];
  // 楽器 [id, 名前, GM, いちばん低い音, いちばん高い音]
  var HRN_INSTS = [
    ["trumpet", "&#x1F3BA; トランペット", 56, 54, 82], ["trombone", "トロンボーン", 57, 40, 72], ["tuba", "チューバ", 58, 28, 58], ["horn", "ホルン", 60, 41, 77],
    ["brass", "ブラスセクション", 61, 40, 84], ["ssax", "&#x1F3B7; ソプラノサックス", 64, 56, 87], ["asax", "アルトサックス", 65, 49, 80], ["tsax", "テナーサックス", 66, 44, 75],
    ["bsax", "バリトンサックス", 67, 36, 68], ["oboe", "オーボエ", 68, 58, 91], ["bassoon", "ファゴット", 70, 34, 75], ["clarinet", "クラリネット", 71, 50, 91], ["flute", "フルート", 73, 60, 96]
  ];
  function hrnOpt(list, id) { for (var i = 0; i < list.length; i++) { if (list[i][0] === id) { return list[i]; } } return list[0]; }
  function hrnPc(m) { return ((m % 12) + 12) % 12; }
  function hrnName(m, names) {
    if (names === "none") { return ""; }
    var r = Math.round(m);
    return names === "cde" ? HRN_CDE[hrnPc(r)] + (Math.floor(r / 12) - 1) : HRN_DO[hrnPc(r)];
  }

  // ---------- キー（3段。下の段がいちばん低い）----------
  var HRN_ROWS = 3, HRN_KEY_Y = 60, HRN_KEY_BOT = 314, HRN_LAND = false;
  // §309: よこ向き（高さ h）
  function hrnLayout(land, h) {
    HRN_LAND = !!land;
    if (land) { HRN_H = h || 130; HRN_KEY_Y = 14; HRN_KEY_BOT = HRN_H - 4; } else { HRN_H = 320; HRN_KEY_Y = 60; HRN_KEY_BOT = 314; }
  }
  // 段の音（chrom: 半音階）: ルートからオクターブ上のルートまで（スケール 8・半音階 13）
  function hrnRowNotes(base, scale, chrom) {
    var out = [], i, sc = BA().scale(scale)[2];
    if (chrom) { for (i = 0; i <= 12; i++) { out.push(base + i); } return out; }
    for (i = 0; i < 7; i++) { out.push(base + sc[i]); }
    out.push(base + 12);
    return out;
  }
  // いちばん下の段のルート（楽器の音域の下のほう・キーの音名）。oct で上下
  function hrnBase(ins, key, oct) { var low = ins[3] + 2; return low + ((key - hrnPc(low) + 12) % 12) + oct * 12; }
  function hrnRowH() { return (HRN_KEY_BOT - HRN_KEY_Y) / HRN_ROWS; }
  // 段 r（0 ＝ 上）・列 c（n 列）の四角
  function hrnKeyRect(r, c, n) { var w = (W - 8) / n, h = hrnRowH(); return { x: 4 + c * w + 1.5, y: HRN_KEY_Y + r * h + 2, w: w - 3, h: h - 4 }; }
  // 座標 → { r, c, fy: 上からの割合 }（外は null）
  function hrnKeyAt(x, y, n) {
    if (x < 4 || x >= W - 4 || y < HRN_KEY_Y || y >= HRN_KEY_BOT) { return null; }
    var h = hrnRowH(), r = Math.floor((y - HRN_KEY_Y) / h), c = Math.floor((x - 4) / ((W - 8) / n));
    return { r: r, c: Math.max(0, Math.min(n - 1, c)), fy: (y - (HRN_KEY_Y + r * h)) / h };
  }
  // 息の強さ（キーの上からの割合 → 0.35〜1.1。上ほど強い）
  function hrnBreath(fy) { return Math.max(0.35, Math.min(1.1, 1.1 - Math.max(0, Math.min(1, fy)) * 0.75)); }

  // ---------- §308: ホーンセクション（和音の編成）----------
  var HRN_VIEWS = [["solo", "&#x1F3BA; ソロ"], ["section", "&#x1F3BC; セクション"]];
  var HRN_SECTIONS = [
    ["jazz", "ジャズのホーン隊", [["trumpet", 1], ["asax", 1], ["tsax", 1], ["trombone", 1]]],
    ["brass", "金管（ブラス）", [["trumpet", 2], ["horn", 1], ["trombone", 1], ["tuba", 1]]],
    ["band", "吹奏楽", [["flute", 1], ["clarinet", 2], ["trumpet", 1], ["horn", 1], ["trombone", 1], ["tuba", 1]]],
    ["sax", "サックス四重奏", [["ssax", 1], ["asax", 1], ["tsax", 1], ["bsax", 1]]],
    ["wood", "木管五重奏", [["flute", 1], ["oboe", 1], ["clarinet", 1], ["horn", 1], ["bassoon", 1]]]
  ];
  var HRN_SEC_MAX = 6, HRN_PLAYERS_MAX = 4, HRN_DETUNE = [0, 0.07, -0.07, 0.12];
  function hrnPresetParts(id) { return hrnOpt(HRN_SECTIONS, id)[2].map(function (p) { return { inst: p[0], n: p[1] }; }); }
  function hrnSectionClean(o) {
    o = o && typeof o === "object" ? o : {};
    var a = o.parts && o.parts.length ? o.parts : hrnPresetParts("jazz"), parts = [], i;
    for (i = 0; i < a.length && parts.length < HRN_SEC_MAX; i++) {
      var x = a[i] || {}, n = Math.round(Number(x.n));
      parts.push({ inst: hrnOpt(HRN_INSTS, x.inst)[0], n: n >= 1 && n <= HRN_PLAYERS_MAX ? n : 1 });
    }
    return { preset: typeof o.preset === "string" && hrnOpt(HRN_SECTIONS, o.preset)[0] === o.preset ? o.preset : (o.parts ? "" : "jazz"), parts: parts };
  }
  // セクションで和音を鳴らす音 → [{ inst, m, n }]（低い楽器から ルート・5度・3度・ルート・5度・3度。7th はいちばん上を7度に。音域の中へ）
  function hrnSectionNotes(ch, sev, parts) {
    var sorted = parts.slice().sort(function (a, b) { return hrnOpt(HRN_INSTS, a.inst)[3] - hrnOpt(HRN_INSTS, b.inst)[3]; }), out = [], k;
    var rootPc = hrnPc(ch.r !== undefined ? ch.r : ch.root), iv = ch.iv, prev = -1;
    var roles = sorted.length === 1 ? [0] : sorted.length === 2 ? [0, iv[2]] : [0, iv[4], iv[2], 12, iv[4] + 12, iv[2] + 12].slice(0, sorted.length);
    if (sev && roles.length >= 3) { roles[roles.length - 1] = iv[6]; }
    for (k = 0; k < sorted.length; k++) {
      var ins = hrnOpt(HRN_INSTS, sorted[k].inst), low = ins[3] + 3, pc = (rootPc + roles[k]) % 12, m = low + ((pc - hrnPc(low) + 12) % 12);
      while (m <= prev - 0) { m += 12; }
      while (m > ins[4] && m - 12 >= ins[3]) { m -= 12; }
      out.push({ inst: sorted[k].inst, m: m, n: sorted[k].n });
      prev = m;
    }
    return out;
  }
  // ボタン i（0〜6）の四角（上に4つ・下に3つ）
  function hrnChordRect(i) {
    if (HRN_LAND) { var lw = (W - 8) / 7; return { x: 4 + i * lw + 2, y: 12, w: lw - 4, h: HRN_H - 16 }; }
    var top = 40, h = (HRN_H - top - 10) / 2, row = i < 4 ? 0 : 1, n = row ? 3 : 4, w = (W - 8) / n, k = row ? i - 4 : i;
    return { x: 4 + k * w + 3, y: top + row * h + 3, w: w - 6, h: h - 6 };
  }
  function hrnChordAt(x, y) { for (var i = 0; i < 7; i++) { var r = hrnChordRect(i); if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) { return i; } } return -1; }
  // §308: セクションのパターン。S のばす / E 短く / A キメ（短く強く）/ B いちばん低いパート / 1〜6 パートの1つ / - のばす
  var HRN_PATS = [
    ["hold", "のばす（全音符）", "S-------", 4], ["half", "2分音符", "S---S---", 4], ["pad", "のばす＋キメ", "S-----A-", 4], ["stab", "キメ（2と4の裏）", "---A---A", 4],
    ["e8", "8分の刻み", "EEEEEEEE", 4], ["funk", "ファンクのキメ", "A--A--A---A-A---", 4], ["swing", "スウィングの合いの手", "-A-A-A-A", 4], ["latin", "ラテン", "A--A--A-", 4],
    ["march", "マーチ", "B-E-B-E-", 4], ["waltz", "ワルツ（3拍子）", "B-E-E-", 3]
  ];
  function hrnPat(id) { return hrnOpt(HRN_PATS, id); }
  function hrnVol(v, d) { v = Number(v); return v >= 0 && v <= 150 && v % 10 === 0 ? v : d; }
  // §308: パートのあるテイク [{ inst, notes }]（2〜6）
  function hrnPartsClean(a) {
    if (!a || !a.length || a.length < 2) { return undefined; }
    var out = [], i, S = SV();
    for (i = 0; i < a.length && out.length < HRN_SEC_MAX; i++) { var p = a[i] || {}, n = S.notesClean(p.notes); if (n.length) { out.push({ inst: hrnOpt(HRN_INSTS, p.inst)[0], notes: n }); } }
    return out.length >= 2 ? out : undefined;
  }
  function hrnPlayList(take) {
    var out = [], ps = take.parts || [{ inst: take.inst, notes: take.notes }], i, j;
    for (i = 0; i < ps.length; i++) { var ins = hrnOpt(HRN_INSTS, ps[i].inst); for (j = 0; j < ps[i].notes.length; j++) { var n = ps[i].notes[j]; out.push([n[0], n[1], n[2], n[3] || 0.8, ins]); } }
    out.sort(function (a, b) { return a[0] - b[0]; });
    return out;
  }

  // ---------- 設定・テイク ----------
  function hrnPrefs() {
    var p = lsGet(HRN_PREFS_KEY) || {}, key = Math.round(Number(p.key)), oct = Math.round(Number(p.oct)), B = BA();
    return {
      inst: hrnOpt(HRN_INSTS, p.inst)[0], names: p.names === "cde" || p.names === "none" ? p.names : "do",
      key: key >= 0 && key <= 11 ? key : 0, scale: B ? B.scale(p.scale)[0] : "major", oct: oct >= -1 && oct <= 1 ? oct : 0,
      chrom: !!p.chrom, legato: p.legato !== false, vib: p.vib !== false, bend: p.bend !== false, tab: ["play", "pat", "band", "key"].indexOf(p.tab) >= 0 ? p.tab : "play",
      view: p.view === "section" ? "section" : "solo", land: !!p.land, rspeed: HRN_SPEEDS.indexOf(Number(p.rspeed)) >= 0 ? Number(p.rspeed) : 100, sec: hrnSectionClean(p.sec), sev: !!p.sev,
      pat: hrnPat(p.pat)[0], swing: B ? hrnOpt(B.SWINGS, Number(p.swing))[0] : 0, cprog: B && B.cprog(p.cprog) ? p.cprog : "",
      drum: typeof p.drum === "string" && /^[gdp]:[A-Za-z0-9_-]{1,32}$/.test(p.drum) ? p.drum : "",
      bpat: typeof p.bpat === "string" && /^[a-z0-9]{1,12}$/.test(p.bpat) ? p.bpat : "",
      hvol: hrnVol(p.hvol, 100), bvol: hrnVol(p.bvol, 100), dvol: hrnVol(p.dvol, 50),
      backing: typeof p.backing === "string" && /^(cur|s:\d+)$/.test(p.backing) ? p.backing : "",
      bpm: Math.max(40, Math.min(240, Math.round(Number(p.bpm) || 100))), metro: p.metro !== false
    };
  }
  function hrnSavePrefs(p) { return lsSet(HRN_PREFS_KEY, p); }
  function hrnTakeClean(t, i) {
    var S = SV();
    return {
      id: Math.max(1, Math.round(Number(t.id)) || i + 1), name: String(t.name || "テイク").slice(0, 20),
      bpm: Math.max(40, Math.min(240, Math.round(Number(t.bpm) || 100))), meter: t.meter === 3 ? 3 : 4,
      inst: hrnOpt(HRN_INSTS, t.inst)[0], notes: S.notesClean(t.notes), parts: hrnPartsClean(t.parts)
    };
  }
  function hrnTakesLoad() {
    var a = lsGet(HRN_TAKES_KEY), out = [], i;
    if (!a || !a.length) { return out; }
    for (i = 0; i < a.length && out.length < HRN_TAKES_MAX; i++) { if (a[i] && typeof a[i] === "object") { out.push(hrnTakeClean(a[i], i)); } }
    return out;
  }
  function hrnTakesSave(list) { return lsSet(HRN_TAKES_KEY, list.slice(0, HRN_TAKES_MAX)); }
  function hrnTakeAdd(list, t) {
    var id = 0, i;
    for (i = 0; i < list.length; i++) { id = Math.max(id, list[i].id); }
    var take = hrnTakeClean({ id: id + 1, name: t.name || "ホーン " + (id + 1), bpm: t.bpm, meter: t.meter, inst: t.inst, notes: t.notes, parts: t.parts }, 0);
    list.unshift(take);
    if (list.length > HRN_TAKES_MAX) { list.length = HRN_TAKES_MAX; }
    return take;
  }
  function hrnTakeById(list, id) { for (var i = 0; i < list.length; i++) { if (list[i].id === id) { return list[i]; } } return null; }
  function hrnSendToSeq(take) {
    var U = window.UGUkulele, S = SV();
    if (!U || !U.seqLoad || !U.xAdd) { return { ok: false, msg: "ゴリラウクレレが読みこめませんでした" }; }
    if (!take || !take.notes || !take.notes.length) { return { ok: false, msg: "音のないテイクは送れません" }; }
    var st = U.seqLoad();
    // §308: パートのあるテイクは、パートごとに別のトラックへ
    if (take.parts && take.parts.length >= 2) {
      var ids = [], k;
      for (k = 0; k < take.parts.length; k++) {
        var pid = U.xAdd(st.cur.tracks, "hnotes");
        if (!pid) { break; }
        var pt = st.cur.tracks[pid], pins = hrnOpt(HRN_INSTS, take.parts[k].inst);
        pt.name = (String(take.name).slice(0, 5) + " " + pins[1].replace(/&#x[0-9A-F]+;\s*/g, "")).slice(0, 12);
        pt.prog = pins[2];
        pt.notes = S.notesClean(take.parts[k].notes).slice(0, HRN_SEQ_MAX);
        ids.push(pid);
      }
      if (!ids.length) { return { ok: false, msg: "追加トラックがいっぱいです（8本まで）。シーケンサーで1本消してから送ってね" }; }
      U.seqSave(st);
      return { ok: true, ids: ids, id: ids[0], msg: "「" + take.name + "」を、パートごとに " + ids.length + " 本の 🎺 管楽器打ち込みトラックとして送りました" + (ids.length < take.parts.length ? "（トラックがいっぱいで、" + (take.parts.length - ids.length) + " パートは送れませんでした）" : "") };
    }
    var id = U.xAdd(st.cur.tracks, "hnotes");
    if (!id) { return { ok: false, msg: "追加トラックがいっぱいです（8本まで）。シーケンサーで1本消してから送ってね" }; }
    var t = st.cur.tracks[id], n = S.notesClean(take.notes), cut = n.length > HRN_SEQ_MAX;
    t.name = String(take.name).slice(0, 12);
    t.prog = hrnOpt(HRN_INSTS, take.inst)[2];
    t.notes = n.slice(0, HRN_SEQ_MAX);
    U.seqSave(st);
    return { ok: true, id: id, cut: cut, msg: "「" + take.name + "」を、ゴリラウクレレのシーケンサー（編集中の曲）に 🎺 管楽器打ち込みトラックとして送りました" + (cut ? "（音が多いので、はじめの " + HRN_SEQ_MAX + " 音）" : "") };
  }

  // ---------- はじめの画面 ----------
  function hrnSetup(root, ctl) {
    var p = hrnPrefs(), note = "";
    function opts(list, cur, attr) {
      var h = "", i;
      for (i = 0; i < list.length; i++) { h += '<button class="modal-btn quiz-opt' + (cur === list[i][0] ? " active" : "") + '" data-' + attr + '="' + list[i][0] + '">' + list[i][1] + '</button>'; }
      return h;
    }
    function draw() {
      var takes = hrnTakesLoad(), i;
      var html = '<div class="melody-setup"><h3 style="margin:0 0 4px;">&#x1F3BA; ゴリラホーン</h3>' +
        '<p class="small" style="color:#adb5bd;margin:0 0 8px;">トランペットからフルートまで13の管楽器。キーの上のほうを押すほど強く吹ける。</p>' +
        '<p class="small" style="margin:4px 0 2px;">吹き方</p><div class="quiz-opts">' + opts(HRN_VIEWS, p.view, "view") + '</div>' +
        '<p class="small" style="margin:4px 0 2px;">楽器</p><div class="piano-opts">' + opts(HRN_INSTS, p.inst, "inst") + '</div>' +
        '<p class="small" style="margin:4px 0 2px;">音名</p><div class="quiz-opts">' + opts(HRN_NAMES, p.names, "names") + '</div>';
      var bl = BA() && BA().backList ? BA().backList() : [];
      if (bl.length) { html += '<p class="small" style="margin:6px 0 2px;">&#x1F3B8; 伴奏（ゴリラウクレレのシーケンサーの曲）</p><div class="piano-opts">' + opts([["-", "なし"]].concat(bl), p.backing || "-", "backing") + '</div>'; }
      html += '<button class="modal-btn" data-go="1" style="width:100%;margin-top:8px;">&#x1F3BA; はじめる</button>' +
        '<p class="small" style="margin:10px 0 2px;">&#x1F399;&#xFE0F; 録音したテイク（' + takes.length + ' / ' + HRN_TAKES_MAX + '）</p>';
      if (note) { html += '<p class="small" style="color:#ffd166;margin:0 0 4px;">' + note + '</p>'; }
      if (!takes.length) { html += '<p class="small" style="color:#adb5bd;margin:0;">まだありません。吹く画面の「🔴 録音」で録れます。</p>'; }
      for (i = 0; i < takes.length; i++) {
        html += '<div class="piano-take"><span>' + escHtml(takes[i].name) + '<br><span class="small" style="color:#adb5bd;">' + takes[i].notes.length + '音・BPM ' + takes[i].bpm + '・' + hrnOpt(HRN_INSTS, takes[i].inst)[1] + '</span></span>' +
          '<button class="modal-btn" data-open="' + takes[i].id + '">&#x25B6;&#xFE0F; ひらく</button>' +
          '<button class="modal-btn" data-send="' + takes[i].id + '" title="シーケンサーへ送る">&#x1F3B8; 送る</button>' +
          '<button class="modal-btn" data-del="' + takes[i].id + '">&#x1F5D1;&#xFE0F;</button></div>';
      }
      // §309: リズムゲーム
      var best = hrnBest();
      html += '<p class="small" style="margin:12px 0 2px;">&#x1F3AE; リズムゲーム（メロディの長い音符を、押しているあいだ吹く。よこ向きの設定ならよこ向きで）</p><div class="quiz-opts">';
      for (i = 0; i < HRN_SPEEDS.length; i++) { html += '<button class="modal-btn quiz-opt' + (p.rspeed === HRN_SPEEDS[i] ? " active" : "") + '" data-rspeed="' + HRN_SPEEDS[i] + '">' + HRN_SPEEDS[i] + '%</button>'; }
      html += '</div>';
      for (i = 0; i < HRN_SONGS.length; i++) {
        var bs0 = best[HRN_SONGS[i][0] + "@" + p.rspeed];
        html += '<button class="modal-btn quiz-cat-btn" data-song="' + HRN_SONGS[i][0] + '" style="width:100%;">' + escHtml(HRN_SONGS[i][1]) + '（BPM ' + HRN_SONGS[i][2] + '）' +
          ' <span class="small" style="color:#6b4f00;">' + new Array(HRN_SONGS[i][6] + 1).join("&#x2B50;") + (bs0 ? "・ベスト " + bs0.s + "（" + bs0.r + "）" : "") + '</span></button>';
      }
      html += '<button class="modal-btn" data-back="1" style="width:100%;margin-top:14px;">&#x1F579;&#xFE0F; メニューへ</button></div>';
      root.innerHTML = html;
      var btns = root.querySelectorAll("button"), j;
      for (j = 0; j < btns.length; j++) {
        btns[j].onclick = function (ev) {
          var el = ev.currentTarget, v;
          if ((v = el.getAttribute("data-inst"))) { p.inst = v; hrnSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-view"))) { p.view = v; hrnSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-rspeed"))) { p.rspeed = Number(v); hrnSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-song"))) { ctl.done({ mode: "rhythm", song: v, speed: p.rspeed, land: p.land }); return; }
          if ((v = el.getAttribute("data-backing"))) { p.backing = v === "-" ? "" : v; hrnSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-names"))) { p.names = v; hrnSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-send"))) { var rs = hrnSendToSeq(hrnTakeById(hrnTakesLoad(), Number(v))); note = (rs.ok ? "&#x2705; " : "&#x26A0;&#xFE0F; ") + escHtml(rs.msg); draw(); return; }
          if ((v = el.getAttribute("data-del"))) {
            var list = hrnTakesLoad(), t = hrnTakeById(list, Number(v));
            if (!t || (window.confirm && !window.confirm("「" + t.name + "」を消しますか？"))) { return; }
            list.splice(list.indexOf(t), 1);
            hrnTakesSave(list);
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

  // ---------- §309: リズムゲーム（メロディの長い音符を、押しているあいだ吹く）----------
  var HRN_BEST_KEY = "ultimateGorillaHornBestV1", HRN_SPEEDS = [70, 85, 100];
  // [id, 名前, BPM, 1小節ごとのコード（度数）, メロディ "度数:拍,…"（度数 1〜8 ＝ ド〜上のド・拍を省くと 1）, ドラム, ★]
  var HRN_SONGS = [
    ["kira", "きらきら星", 96, [0, 3, 3, 4, 0, 4, 0, 4, 0, 3, 3, 0], "1,1,5,5,6,6,5:2,4,4,3,3,2,2,1:2,5,5,4,4,3,3,2:2,5,5,4,4,3,3,2:2,1,1,5,5,6,6,5:2,4,4,3,3,2,2,1:2", "g:ballad", 1],
    ["ode", "よろこびの歌", 104, [0, 4, 0, 4, 0, 4, 0, 0], "3,3,4,5,5,4,3,2,1,1,2,3,3:1.5,2:0.5,2:2,3,3,4,5,5,4,3,2,1,1,2,3,2:1.5,1:0.5,1:2", "g:8beat", 1],
    ["kaeru", "かえるの合唱", 100, [0, 0, 3, 0, 0, 0, 0, 0], "1,2,3,4,3,2,1:2,3,4,5,6,5,4,3:2,1:2,1:2,1:2,1:2,1:0.5,1:0.5,2:0.5,2:0.5,3:0.5,3:0.5,4:0.5,4:0.5,3,2,1:2", "g:8beat", 2],
    ["mary", "メリーさんのひつじ", 108, [0, 0, 4, 0, 0, 0, 4, 0], "3,2,1,2,3,3,3:2,2,2,2:2,3,5,5:2,3,2,1,2,3,3,3,3,2,2,3,2,1:4", "g:8beat", 1],
    ["london", "ロンドン橋", 104, [0, 0, 4, 0, 0, 0, 4, 0], "5:1.5,6:0.5,5,4,3,4,5:2,2,3,4:2,3,4,5:2,5:1.5,6:0.5,5,4,3,4,5:2,2:2,5:2,3,1:3", "g:8beat", 2],
    ["jingle", "ジングルベル", 120, [0, 0, 0, 0, 3, 0, 4, 4], "3,3,3:2,3,3,3:2,3,5,1:1.5,2:0.5,3:4,4,4,4:1.5,4:0.5,4,3,3,3:0.5,3:0.5,3,2,2,3,2:2,5:2", "g:rock", 2]
  ];
  var HRN_SCALE_C = [0, 2, 4, 5, 7, 9, 11, 12];
  function hrnSong(id) { return hrnOpt(HRN_SONGS, id); }
  function hrnBest() { var o = lsGet(HRN_BEST_KEY); return o && typeof o === "object" ? o : {}; }
  // 譜面 → { meter: 4, bars, notes: [{ beat, len, deg: 0〜7 }] }
  function hrnChart(song) {
    var out = [], b = 0, parts = song[4].split(","), i;
    for (i = 0; i < parts.length; i++) { var q = parts[i].split(":"), len = q.length > 1 ? Number(q[1]) : 1; out.push({ beat: b, len: len, deg: Number(q[0]) - 1 }); b += len; }
    return { meter: 4, bars: Math.ceil(b / 4 - 1e-6), notes: out };
  }
  function hrnRhythm(api, cfg) {
    var B = BA(), S = SV(), prefs = hrnPrefs(), panel = api.panel, frame = 0, ended = false, msg = "", land = !!cfg.land;
    if (panel && panel.classList) { panel.classList.add("quiz-panel"); }
    if (api.setLandscape) { api.setLandscape(land); }
    var box = panel && panel.parentNode;
    hrnLayout(land, land && box && B.landH ? B.landH(box.clientWidth, box.clientHeight) : 130);
    if (api.setCanvasHeight) { api.setCanvasHeight(HRN_H); }
    var song = hrnSong(cfg.song), rate = (HRN_SPEEDS.indexOf(Number(cfg.speed)) >= 0 ? Number(cfg.speed) : 100) / 100, ins = hrnOpt(HRN_INSTS, prefs.inst);
    var chart = hrnChart(song), meter = 4, spb = 60 / song[2] / rate, t0 = 0.5 + meter * spb, JG = B.JUDGE, base = hrnBase(ins, 0, 0), i;
    var nL = 8, rn = [], counts = [0, 0, 0, 0], combo = 0, maxCombo = 0, keeps = 0, judgeText = "", judgeFrames = 0, lastClick = -99, laneFlash = [0, 0, 0, 0, 0, 0, 0, 0], offs = [], holding = {};
    for (i = 0; i < chart.notes.length; i++) { var cn = chart.notes[i]; rn.push({ t: t0 + cn.beat * spb, end: t0 + (cn.beat + cn.len) * spb, lane: cn.deg, m: base + HRN_SCALE_C[cn.deg], j: -2, kept: false }); }
    var endT = t0 + chart.bars * meter * spb;
    function now() { return frame / 60; }
    var UG = window.UGMelody, audioOk = false, LAT = UG && UG.latency ? UG.latency() / 1000 : 0, buses = {};
    function audio() {
      if (audioOk || !UG || !UG.audioInit) { return; }
      try {
        if (UG.audioInit()) {
          audioOk = true;
          UG.loadSamples([ins[2], 33]);
          var D = window.UGDrum, dp = D && D.prefs ? D.prefs() : null;
          if (dp) { if (UG.setDrumSamples) { UG.setDrumSamples(dp.real); } if (UG.setDrumKit) { UG.setDrumKit(dp.kitId); } if (dp.real) { UG.loadSamples([UG.DRUM]); } }
        }
      } catch (e) {}
    }
    // ゴリラドラムのリズムと、小節ごとのコードのルート（4分）
    var D0 = window.UGDrum, dsteps = null, dlen = 16, dk = 0, bk = 0, bvo = null;
    try { dsteps = D0 && D0.patternSteps ? D0.patternSteps(song[5]) : null; dlen = D0 && D0.patLen ? D0.patLen(song[5]) : 16; if (dlen !== 16) { dsteps = null; } } catch (e0) {}
    function band() {
      var ac = audioOk && UG.audio ? UG.audio.ctx : null, n = 0, k;
      if (!ac) { return; }
      while (dsteps && n++ < 16) {
        var tt = t0 + dk * 0.25 * spb, dt = tt - now();
        if (dt > 0.1 || tt >= endT - 1e-6) { break; }
        var s0 = dk % dlen;
        dk++;
        if (dt < -0.05) { continue; }
        for (k = 0; k < dsteps.length; k++) {
          if (dsteps[k][1].indexOf(s0) < 0) { continue; }
          var lv = 0.8;
          try { lv = D0.patVel ? D0.patVel(dsteps[k][0], s0 % 16, false) : 0.8; } catch (e) {}
          try { UG.synth(dsteps[k][0], UG.DRUM, ac.currentTime + dt, lv * 0.6, B.bus(buses, "d", prefs.dvol) || undefined); } catch (e2) {}
        }
      }
      n = 0;
      while (n++ < 8) {
        var tb = t0 + bk * spb, db = tb - now();
        if (db > 0.1 || tb >= endT - 1e-6) { break; }
        var bar = Math.floor(bk / meter), ch = B.chord(0, song[3][bar % song[3].length], "major"), when = ac.currentTime + Math.max(0, db);
        bk++;
        if (db < -0.05) { continue; }
        if (bvo && UG.voiceStop) { try { UG.voiceStop(bvo, when, 0.03); } catch (e3) {} }
        try {
          var bus2 = B.bus(buses, "b", prefs.bvol, false), smp2 = !!(UG.samples && UG.samples.enabled && UG.sampleReady && UG.sampleReady(33)), g2 = null;
          if (bus2) { g2 = ac.createGain(); g2.gain.value = 0.7 * (smp2 ? 4 : 1); g2.connect(bus2); }
          bvo = UG.synth(ch.root, 33, when, 0.7, g2 || undefined, 8) || null;
          if (bvo && UG.voiceStop) { UG.voiceStop(bvo, when + spb * 0.85, 0.04); }
        } catch (e4) {}
      }
    }
    function press(id, lane) {
      if (ended || !(lane >= 0 && lane < nL)) { return; }
      laneFlash[lane] = 8;
      var t = now() - LAT, best = null, k;
      for (k = 0; k < rn.length; k++) {
        var n = rn[k];
        if (n.t - t > JG[2][0]) { break; }
        if (n.j !== -2 || n.lane !== lane || Math.abs(t - n.t) > JG[2][0]) { continue; }
        if (!best || Math.abs(t - n.t) < Math.abs(t - best.t)) { best = n; }
      }
      if (!best) { return; }
      var g = B.rjudge(t - best.t);
      best.j = g; counts[g]++; combo++; maxCombo = Math.max(maxCombo, combo); offs.push(t - best.t);
      api.addScore(JG[g][2] + Math.min(50, combo) * 2);
      judgeText = JG[g][1]; judgeFrames = 30;
      audio();
      var v = audioOk ? S.voice(ins[2], best.m, B.bus(buses, "h", prefs.hvol, false), 0) : null;
      S.level(v, 0.75, 0.04);
      if (prefs.vib) { S.vibrato(v, true); }
      holding[id] = { n: best, v: v };
    }
    function release(id) {
      var h = holding[id];
      if (!h) { return; }
      delete holding[id];
      S.stop(h.v, 0.15);
      if (!h.n.kept && now() - LAT >= h.n.t + (h.n.end - h.n.t) * 0.75) { h.n.kept = true; keeps++; api.addScore(50); judgeText = "キープ！"; judgeFrames = 20; }
    }
    function finish() {
      if (ended) { return; }
      ended = true;
      var k;
      for (k in holding) { if (holding.hasOwnProperty(k)) { release(k); } }
      var acc = rn.length ? (counts[0] + counts[1] * 0.7 + counts[2] * 0.4) / rn.length : 0, rk = B.rank(acc), best = hrnBest();
      if (rn.length && counts[3] === 0) { api.addScore(500); }
      var key = song[0] + "@" + Math.round(rate * 100), sc = api.getScore();
      if (!best[key] || !(best[key].s >= sc)) { best[key] = { s: sc, r: rk }; lsSet(HRN_BEST_KEY, best); }
      msg = "ランク <b>" + rk + "</b>（正確さ " + Math.round(acc * 100) + "%）・最大コンボ " + maxCombo + "・キープ " + keeps + " / " + rn.length + (counts[3] === 0 ? "・&#x1F525; フルコンボ +500" : "") +
        "<br>PERFECT " + counts[0] + " / GREAT " + counts[1] + " / GOOD " + counts[2] + " / MISS " + counts[3];
      var td = B.tendency ? B.tendency(offs) : null;
      if (td) { msg += "<br>" + td.text; }
      render();
      api.gameOver("ランク " + rk);
    }
    function render() {
      if (!panel) { return; }
      panel.innerHTML = '<p class="small" style="margin:4px 0 0;">&#x1F3AE; ' + escHtml(song[1]) + '（BPM ' + Math.round(song[2] * rate) + '・' + rn.length + '音・' + ins[1] + '）</p>' +
        '<p class="small" style="margin:4px 0 0;">音符の頭が線に来たら、その音のキー（ド〜上のド・キー A〜K）を押して、おわりまで吹きつづける（キープでボーナス）</p>' +
        (msg ? '<p class="small" style="margin:4px 0 0;color:#ffd166;">' + msg + '</p>' : "");
    }
    render();
    function text(ctx, s, x, y, size, color) { ctx.fillStyle = color; ctx.font = "bold " + (land ? Math.max(4, size * 0.6) : size) + "px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(s, x, y); }
    var TOP = land ? 12 : 26, HIT = land ? HRN_H - 18 : HRN_H - 50, LW = (W - 8) / nL, LOOK = land ? 1.2 : 2.0;
    return {
      input: function (a, down) {
        var mk = /^k2:(\d)$/.exec(a);
        if (!mk) { return; }
        audio();
        if (down) { press("k" + mk[1], Number(mk[1])); } else { release("k" + mk[1]); }
      },
      pointer: function (type, x, y, id) {
        var pid = "p" + (id === undefined ? 0 : id);
        if (type === "down" && y >= TOP) { audio(); press(pid, Math.floor((x - 4) / LW)); }
        else if (type === "up") { release(pid); }
      },
      step: function () {
        frame++;
        if (judgeFrames > 0) { judgeFrames--; }
        for (var q = 0; q < nL; q++) { if (laneFlash[q] > 0) { laneFlash[q]--; } }
        if (ended) { return; }
        var t = now() - LAT, left = 0, k;
        for (k = 0; k < rn.length; k++) {
          if (rn[k].j === -2 && t - rn[k].t > JG[2][0]) { rn[k].j = -1; counts[3]++; combo = 0; judgeText = "MISS"; judgeFrames = 30; }
          if (rn[k].j === -2) { left++; }
        }
        for (k in holding) { if (holding.hasOwnProperty(k) && t >= holding[k].n.end) { release(k); } }
        var sb = Math.floor((now() - t0) / spb);
        if (sb < 0 && sb >= -meter && sb !== lastClick) {
          lastClick = sb; audio();
          if (audioOk) { try { UG.synth(sb === -meter ? 37 : 42, UG.DRUM, 0, sb === -meter ? 0.9 : 0.6); } catch (e) {} }
        }
        if (audioOk) { band(); }
        if (!left && t > Math.max(endT, rn.length ? rn[rn.length - 1].end + 0.5 : 0)) { finish(); }
      },
      draw: function (ctx) {
        ctx.fillStyle = "#1b1f3b";
        ctx.fillRect(0, 0, W, HRN_H);
        hudText(ctx, "🎮 " + song[1], 8, land ? 6 : 10, "left");
        hudText(ctx, "コンボ " + combo, W - 8, land ? 6 : 10, "right");
        var t = now() - LAT, k;
        for (k = 0; k < nL; k++) {
          var x = 4 + k * LW;
          ctx.fillStyle = laneFlash[k] > 0 ? "rgba(255,209,102,0.25)" : (k % 2 ? "#232a4d" : "#1f2546");
          ctx.fillRect(x + 1, TOP, LW - 2, HRN_H - TOP);
          text(ctx, HRN_DO[hrnPc(HRN_SCALE_C[k])], x + LW / 2, HIT + (land ? 9 : 28), 12, "#adb5bd");
        }
        ctx.fillStyle = "#ffd166";
        ctx.fillRect(4, HIT - 1, W - 8, 3);
        var px = HIT - TOP;
        for (k = 0; k < rn.length; k++) {
          var n = rn[k];
          if (n.t - t > LOOK) { break; }
          if (t > n.end + 0.1 || (n.j === -1 && t - n.t > 0.25)) { continue; }
          var yH = HIT - (n.t - t) / LOOK * px, yT = HIT - (n.end - t) / LOOK * px, nx = 4 + n.lane * LW, held0 = false, q2;
          for (q2 in holding) { if (holding.hasOwnProperty(q2) && holding[q2].n === n) { held0 = true; } }
          ctx.fillStyle = held0 ? "rgba(255,209,102,0.6)" : (n.j >= 0 ? "rgba(255,169,77,0.25)" : "rgba(255,169,77,0.45)");
          ctx.fillRect(nx + LW * 0.3, Math.max(TOP, yT), LW * 0.4, Math.min(HIT, yH) - Math.max(TOP, yT));
          if (n.j === -2 && yH <= HIT + 6) { ctx.fillStyle = "#ffa94d"; ctx.fillRect(nx + 3, yH - (land ? 4 : 8), LW - 6, land ? 8 : 16); }
        }
        var c0 = Math.ceil((t0 - now()) / spb);
        if (now() < t0 && c0 >= 1 && c0 <= meter) { text(ctx, String(c0), W / 2, HRN_H / 2 - 20, 40, "#ffd166"); }
        if (judgeFrames > 0) { text(ctx, judgeText, W / 2, HIT - 40, 20, judgeText === "MISS" ? "#ff6b6b" : "#ffd166"); }
      }
    };
  }

  // 下の段 A〜K・まん中の段 Q〜I（押しているあいだ）、Z 録音・X 再生
  var HRN_KEYS = { a: "k2:0", s: "k2:1", d: "k2:2", f: "k2:3", g: "k2:4", h: "k2:5", j: "k2:6", k: "k2:7", q: "k1:0", w: "k1:1", e: "k1:2", r: "k1:3", t: "k1:4", y: "k1:5", u: "k1:6", i: "k1:7", z: "rec", x: "play", b: "pat",
    "1": "c0", "2": "c1", "3": "c2", "4": "c3", "5": "c4", "6": "c5", "7": "c6" };

  I.register({
    id: "horn",
    after: "strings",
    cat: "music",
    music: true,
    name: "ゴリラホーン",
    icon: "&#x1F3BA;",
    desc: "トランペット・サックス・フルートなど13の管楽器。キーの上のほうを押すほど強く吹ける",
    help: "🎮 リズムゲームは音符の頭で押して、おわりまで吹きつづける（A〜K）/ キーを押しているあいだ鳴る（上のほうほど強い・押したまま上下で強さが変わる・横にずらすとベンド）/ 押したまま別のキーへ ＝ スラー / キー A〜K（下の段）・Q〜I（まん中）/ セクション: コードのボタン（1〜7）を押しているあいだ和音 / B パターン / Z 録音 / X 再生 / P一時停止",
    controls: [],
    keys: HRN_KEYS,
    setup: hrnSetup,
    setupLabel: "楽器・テイク",
    panel: true,
    create: function (api, cfg) {
      cfg = cfg || {};
      if (cfg.mode === "rhythm") { return hrnRhythm(api, cfg); } // §309
      var B = BA(), S = SV(), prefs = hrnPrefs(), names = prefs.names, view = prefs.view;
      var frame = 0, msg = "", panel = api.panel, flash = {};
      if (panel && panel.classList) { panel.classList.add("quiz-panel"); }
      // §309: よこ向き
      function applyLand() {
        if (api.setLandscape) { api.setLandscape(prefs.land); }
        var box = panel && panel.parentNode;
        hrnLayout(prefs.land, prefs.land && box && B.landH ? B.landH(box.clientWidth, box.clientHeight) : 130);
        if (api.setCanvasHeight) { api.setCanvasHeight(HRN_H); }
      }
      applyLand();
      function inst() { return hrnOpt(HRN_INSTS, prefs.inst); }
      function now() { return frame / 60; }
      function cols() { return prefs.chrom ? 13 : 8; }
      // 段 r（0 ＝ 上）の音
      function rowNotes(r) { return hrnRowNotes(hrnBase(inst(), prefs.key, prefs.oct) + (HRN_ROWS - 1 - r) * 12, prefs.scale, prefs.chrom); }

      // --- 音 ---
      var UG = window.UGMelody, audioOk = false, buses = {};
      function audio() {
        if (audioOk || !UG || !UG.audioInit) { return; }
        try { if (UG.audioInit()) { audioOk = true; UG.loadSamples([inst()[2], 33].concat(prefs.sec.parts.map(function (p) { return hrnOpt(HRN_INSTS, p.inst)[2]; }))); } } catch (e) {}
      }
      function out() { return audioOk && B.bus ? B.bus(buses, "h", prefs.hvol, false) : null; }
      function click(accent) { if (audioOk) { try { UG.synth(accent ? 37 : 42, UG.DRUM, 0, accent ? 0.9 : 0.6); } catch (e) {} } }

      // --- 吹いている音（1つだけ）。指の重なり held: [{ id, m, x0, w, lv, bd }]（あとから押したものが上）---
      var held = [], tone = null; // tone: { v, m: 鳴らしている音（ベンド前）, lv }
      function top() { return held.length ? held[held.length - 1] : null; }
      function sounding() {
        var h = top();
        if (!h) {
          if (tone) { S.stop(tone.v, 0.18); recOff("tone"); tone = null; }
          return;
        }
        audio();
        var m = h.m + (prefs.bend ? h.bd : 0);
        if (tone && prefs.legato) {
          S.pitch(tone.v, m, 0.05);
          S.level(tone.v, h.lv, 0.06);
          if (h.m !== tone.m) { recOff("tone"); recOn("tone", h.m, h.lv); }
          tone.m = h.m; tone.lv = h.lv;
          return;
        }
        if (tone && tone.m === h.m) { S.pitch(tone.v, m, 0.03); S.level(tone.v, h.lv, 0.06); tone.lv = h.lv; return; }
        if (tone) { S.stop(tone.v, 0.06); recOff("tone"); }
        var v = S.voice(inst()[2], m, out(), 0);
        S.level(v, h.lv, 0.04);
        if (prefs.vib) { S.vibrato(v, true); }
        tone = { v: v, m: h.m, lv: h.lv };
        recOn("tone", h.m, h.lv);
      }
      function press(id, m, x0, w, lv, r) {
        release(id, true);
        held.push({ id: id, m: m, x0: x0, w: w, lv: lv, bd: 0, r: r });
        if (!prefs.legato && tone) { S.stop(tone.v, 0.05); recOff("tone"); tone = null; }
        sounding();
      }
      function release(id, quiet) {
        for (var i = held.length - 1; i >= 0; i--) { if (held[i].id === id) { held.splice(i, 1); } }
        if (!quiet) { sounding(); }
      }
      function allOff() { held = []; sounding(); }
      function chordAllOff() { var k, ks = []; for (k in hc) { if (hc.hasOwnProperty(k)) { ks.push(k); } } for (k = 0; k < ks.length; k++) { chordOff(ks[k]); } }

      // --- 録音・再生 ---
      var bpm = prefs.bpm, meter = 4, metro = prefs.metro, takes = hrnTakesLoad();
      var take = cfg.take ? hrnTakeById(takes, cfg.take) : null, rec = null, play = null;
      if (take) { msg = "「" + escHtml(take.name) + "」をひらきました。▶ 再生で聴けます"; }
      // §308: 伴奏（シーケンサーの曲）
      var back = cfg.backing && B.backing ? B.backing(cfg.backing) : null, bk = null;
      if (back) { bpm = back.seq.bpm; meter = back.seq.meter; if (!take) { msg = "&#x1F3B8; 伴奏に合わせて吹こう。セクションのコードは曲のコードになります"; } }
      else if (cfg.backing) { msg = "伴奏の曲が見つかりませんでした（ゴリラウクレレのシーケンサーで曲を作ってね）"; }
      function backApi() { var U = window.UGUkulele; return U && U.seqPlayEvent ? U : null; }
      function backT() { return bk ? (frame - bk.f0) / 60 : 0; }
      function backBeat() { var S0 = back.s, t = backT(); return t < S0.lead ? (t - S0.lead) / S0.spb : S0.beatAt(t); }
      function backStart(pre) {
        backStop();
        audio();
        var U = backApi(), progs = [24], ids, i;
        bk = { f0: frame + Math.round((pre || 0) * 60), idx: 0, outs: [null, null, null, null], mix: null, fx: false };
        if (!audioOk || !U) { return; }
        try { ids = U.trackIds(back.s.tracks); for (i = 0; i < ids.length; i++) { if (back.s.tracks[ids[i]].on && back.s.tracks[ids[i]].prog !== undefined) { progs.push(back.s.tracks[ids[i]].prog); } } UG.loadSamples(progs); } catch (e0) {}
        if (U.fxPush) { try { U.fxPush(back.seq); bk.fx = true; } catch (e) {} }
      }
      function backStop() {
        if (!bk) { return; }
        var U = backApi();
        if (bk.fx && U && U.fxPop) { try { U.fxPop(); } catch (e) {} }
        bk = null;
        if (pat && pat.back) { patStop(); }
      }
      function backStep() {
        var S0 = back.s, t = backT(), U = backApi(), ac = audioOk && UG.audio ? UG.audio.ctx : null, ev;
        while (bk.idx < S0.events.length && (ev = S0.events[bk.idx]).t <= t + 0.1) {
          if (ac && U && B.backEventOn(ev, back.seq, S0.lead, false)) {
            try { if (!bk.mix) { bk.mix = U.mixer(UG, ac, S0.tracks); } U.seqPlayEvent(UG, ac, ev, ac.currentTime + Math.max(0, ev.t - t), back.lowG, 0.55, bk.outs, bk.mix, S0.tracks); } catch (e) {}
          }
          bk.idx++;
        }
        if (t >= S0.time) { if (rec) { recStop(); } backStop(); if (play) { playStop(); } render(); }
      }
      function backToggle() { if (bk) { if (rec) { recStop(); } backStop(); playStop(); } else { backStart(0); } render(); }
      function songIdx(beat) { return back && back.chords.length ? B.chordIdx(back.chords, beat === undefined ? (bk ? backBeat() : -1) : beat) : -1; }
      function recBeat() { return rec ? (rec.back ? backBeat() : (now() - rec.t0) * bpm / 60) : 0; }
      function r3(v) { return Math.round(v * 1000) / 1000; }
      function recToggle() {
        if (rec) { recStop(); return; }
        var wasPat = !!pat;
        playStop();
        audio();
        if (back) { backStart(back.s.lead ? 0 : meter * back.s.spb); rec = { back: true, notes: [], insts: [], open: {}, beat: -99 }; }
        else { rec = { t0: now() + meter * 60 / bpm, notes: [], insts: [], open: {}, beat: -meter - 1 }; }
        if (wasPat) { patStart(); }
        msg = "";
        render();
      }
      // id ごとに録る（ins: 楽器の id。パートに分けるため）
      function recOn(id, m, v, dt, ins) {
        if (!rec) { return; }
        var b = recBeat() + (dt || 0) * bpm / 60;
        if (b < -0.25 || rec.notes.length >= HRN_NOTES_MAX) { return; }
        rec.open[id] = [Math.max(0, b), m, Math.min(1, v || 0.8), ins || prefs.inst];
      }
      function recOff(id) {
        if (!rec || !rec.open[id]) { return; }
        var o = rec.open[id], nt = [r3(o[0]), r3(Math.max(0.0625, recBeat() - o[0])), o[1]];
        delete rec.open[id];
        if (o[2] !== 0.8) { nt.push(r3(Math.max(0.1, o[2]))); }
        rec.notes.push(nt);
        rec.insts.push(o[3]);
      }
      function recStop() {
        var ks = [], k, q;
        for (k in rec.open) { if (rec.open.hasOwnProperty(k)) { ks.push(k); } }
        for (k = 0; k < ks.length; k++) { recOff(ks[k]); }
        var n = rec.notes, wasBack = rec.back, byInst = {}, order = [];
        for (q = 0; q < n.length; q++) { var ii = rec.insts[q] || prefs.inst; if (!byInst[ii]) { byInst[ii] = []; order.push(ii); } byInst[ii].push(n[q]); }
        rec = null;
        if (wasBack) { backStop(); }
        if (n.length) {
          take = hrnTakeAdd(takes, { bpm: bpm, meter: meter, inst: order.length === 1 ? order[0] : prefs.inst, notes: n, parts: order.length >= 2 ? order.map(function (k0) { return { inst: k0, notes: byInst[k0] }; }) : undefined });
          hrnTakesSave(takes);
          msg = "&#x1F4BE; 「" + escHtml(take.name) + "」に保存しました（" + take.notes.length + "音）<br>はじめの画面の「🎸 送る」でシーケンサーに入れられます";
        } else { msg = "音がなかったので保存しませんでした"; }
        render();
      }
      function playBeat() { return play ? (play.back ? backBeat() : (now() - play.t0) * play.bpm / 60) : 0; }
      function playStop() { if (!play) { return; } var wb = play.back; for (var i = 0; i < play.vo.length; i++) { S.stop(play.vo[i].v, 0.12); } play = null; if (wb) { backStop(); } }
      function playToggle() {
        if (play) { playStop(); render(); return; }
        if (rec) { return; }
        if (!take || !take.notes.length) { msg = "まだテイクがありません。🔴 録音で録ってね"; render(); return; }
        audio();
        if (back) { backStart(0); }
        play = { back: !!back, t0: now() + 0.1, bpm: take.bpm, notes: hrnPlayList(take), idx: 0, vo: [] };
        render();
      }

      // --- §308: セクション（コードのボタンを押しているあいだ和音）---
      var chordD = 0, hc = {}, svo = {}, pat = null, pend = -1, pvn = 0;
      function chordObj(d) { return B.chord(prefs.key, d, prefs.scale, prefs.sev); }
      function chordAt(beat) { var k = songIdx(beat); return k >= 0 ? back.chords[k].ch : chordObj(chordD); }
      function sevAt(beat) { var k = songIdx(beat); return k >= 0 ? /(7|9|11|13)/.test(String(back.chords[k].name).split("/")[0]) : prefs.sev; }
      function chordNotes(ch, sev) { return hrnSectionNotes(ch, sev, prefs.sec.parts); }
      function voiceOn(id, ins, m, lv, att, when, norec, dt) {
        var v = S.voice(ins[2], m, out(), when || 0);
        S.level(v, lv, att || 0.06, when);
        if (prefs.vib) { S.vibrato(v, true); }
        svo[id] = v;
        if (!norec) { recOn(id, Math.round(m), lv, dt || 0, ins[0]); }
        return v;
      }
      function voiceOff(id, rel, when) { if (svo[id] === undefined) { return; } S.stop(svo[id], rel || 0.25, when); delete svo[id]; recOff(id); }
      function chordOn(id, d) {
        audio();
        if (pat && d >= 0) { pend = d; flash["c" + d] = 10; render(); return; }
        chordOff(id);
        if (d >= 0) { chordD = d; flash["c" + d] = 10; if (prefs.cprog) { prefs.cprog = ""; hrnSavePrefs(prefs); } }
        var ns = chordNotes(d >= 0 ? chordObj(d) : chordAt(), d >= 0 ? prefs.sev : sevAt()), i, j;
        hc[id] = { d: d, ids: [] };
        for (i = 0; i < ns.length; i++) {
          var ins = hrnOpt(HRN_INSTS, ns[i].inst);
          for (j = 0; j < ns[i].n; j++) { var nid = id + ":" + i + ":" + j; voiceOn(nid, ins, ns[i].m + HRN_DETUNE[j], 0.55 / Math.sqrt(ns[i].n), 0.08 + j * 0.03, 0, j > 0); hc[id].ids.push(nid); }
        }
        render();
      }
      function chordOff(id) { var h = hc[id]; if (!h) { return; } for (var i = 0; i < h.ids.length; i++) { voiceOff(h.ids[i], 0.3); } delete hc[id]; }
      // --- §308: パターン（セクション・ドラム・ベース）---
      function patTime(b) { return pat.back ? now() + (back.s.tm(b) - backT()) : pat.t0 + b * 60 / bpm; }
      function patDef() { var d = hrnPat(prefs.pat); return d[3] === meter ? d : hrnPat(meter === 3 ? "waltz" : "hold"); }
      function patStart() {
        patStop();
        audio();
        if (back && !bk) { backStart(0); }
        var d = patDef();
        pat = { back: !!(back && bk), t0: rec && !rec.back ? rec.t0 : now() + 0.1, k: 0, d: d, unit: d[3] / d[2].length, dk: 0, bk: 0, bvo: null, lastBar: -1, vo: [] };
        if (pat.back) { pat.k = Math.max(0, Math.ceil(backBeat() / pat.unit - 1e-6)); }
        drumInit();
      }
      function patRelease(when) { for (var i = 0; i < pat.vo.length; i++) { S.stop(pat.vo[i].v, 0.1, when); recOff(pat.vo[i].id); } pat.vo = []; }
      function patStop() {
        if (!pat) { return; }
        patRelease(0);
        if (pat.bvo && UG.voiceStop) { try { UG.voiceStop(pat.bvo, 0, 0.06); } catch (e) {} }
        pat = null;
        if (pend >= 0) { chordD = pend; pend = -1; }
      }
      function patRetime() {
        var d = patDef(), bd;
        pat.d = d; pat.unit = d[3] / d[2].length;
        drumInit();
        var bt = pat.back ? backBeat() : (now() - pat.t0) * bpm / 60;
        function at(u) { return Math.max(0, Math.ceil(bt / u - 1e-6)); }
        pat.k = at(pat.unit); pat.dk = at(0.25); bd = bassDef(); pat.bk = bd ? at(meter / bd[2].length) : 0;
      }
      function patToggle() { if (pat) { patStop(); } else { if (play) { playStop(); } patStart(); } render(); }
      function barChord(b) {
        var bar = Math.floor(b / meter + 1e-6), cp = B.cprog(prefs.cprog);
        if (bar === pat.lastBar) { return; }
        pat.lastBar = bar;
        if (pend >= 0) { chordD = pend; pend = -1; flash["c" + chordD] = 10; }
        else if (cp) { var ca = B.cprogAt(cp, b, meter); if (ca.d !== chordD) { chordD = ca.d; flash["c" + chordD] = 10; } }
      }
      function nextChord(b) { var cp = B.cprog(prefs.cprog); if (pend >= 0) { return chordObj(pend); } return cp ? chordObj(B.cprogAt(cp, b, meter).next) : null; }
      function barChordAhead(b) { var cp = B.cprog(prefs.cprog); if (pend >= 0) { return pend; } return cp ? B.cprogAt(cp, b, meter).d : chordD; }
      function patStep() {
        var d = pat.d, pt = d[2], unit = pat.unit, per = pt.length / d[3], n = 0, ac = audioOk && UG.audio ? UG.audio.ctx : null, spb = pat.back ? back.s.spb : 60 / bpm, i, j;
        while (pat && n++ < 32) {
          var b = pat.k * unit, ci = pat.k % pt.length, sb = b + B.swingOf(prefs.swing, per, ci) * unit, dt = patTime(sb) - now();
          if (dt > 0.1 || (pat.back && b >= back.s.beats - 1e-6)) { break; }
          pat.k++;
          if (ci === 0 && !pat.back) { barChord(b); }
          if (dt < -0.05) { continue; }
          var c = pt.charAt(ci);
          if (c === "-") { continue; }
          var dd = Math.max(0, dt), when = ac ? ac.currentTime + dd : 0, ns = chordNotes(pat.back ? chordAt(b) : chordObj(chordD), pat.back ? sevAt(b) : prefs.sev);
          patRelease(when);
          var sel = c === "S" || c === "E" || c === "A" ? ns : [c === "B" ? ns[0] : ns[Math.min(Number(c) - 1, ns.length - 1)]], lv0 = c === "A" ? 0.85 : (c === "E" ? 0.6 : 0.45);
          for (i = 0; i < sel.length; i++) {
            var pi = hrnOpt(HRN_INSTS, sel[i].inst), lv = lv0 / Math.sqrt(sel[i].n);
            for (j = 0; j < sel[i].n; j++) {
              var v = S.voice(pi[2], sel[i].m + HRN_DETUNE[j], out(), when + j * 0.01), id = "pv" + (pvn++);
              S.level(v, lv, c === "A" ? 0.005 : (c === "E" ? 0.01 : 0.06), when + j * 0.01);
              if (c === "E" || c === "A") { S.stop(v, c === "A" ? 0.08 : 0.06, when + unit * spb * (c === "A" ? 0.6 : 0.5)); }
              pat.vo.push({ v: v, id: id });
              if (j === 0) { recOn(id, sel[i].m, lv * Math.sqrt(sel[i].n), dd, pi[0]); }
            }
          }
        }
      }
      var drumCache = null;
      function drumDef() {
        var D = window.UGDrum, id = prefs.drum;
        if (!id || !D || !D.patternSteps) { return null; }
        if (drumCache && drumCache.id === id) { return drumCache.steps ? drumCache : null; }
        var st = null, len = 16;
        try { st = D.patternSteps(id); len = D.patLen ? D.patLen(id) : 16; } catch (e) {}
        drumCache = { id: id, len: len, steps: st && st.length && len === (meter === 3 ? 12 : 16) ? st : null };
        return drumCache.steps ? drumCache : null;
      }
      function drumInit() {
        var D = window.UGDrum, dp = null;
        try { dp = D && D.prefs ? D.prefs() : null; } catch (e) {}
        if (!dp || !audioOk) { return; }
        try { if (UG.setDrumSamples) { UG.setDrumSamples(dp.real); } if (UG.setDrumKit) { UG.setDrumKit(dp.kitId); } if (dp.real && UG.loadSamples) { UG.loadSamples([UG.DRUM]); } } catch (e2) {}
      }
      function drumStep() {
        var dd = drumDef(), D = window.UGDrum, ac = audioOk && UG.audio ? UG.audio.ctx : null, n = 0, i;
        if (!dd || !ac) { return; }
        var du = meter / dd.len, bper = pat.d[2].length / meter;
        while (n++ < 16) {
          var s0 = pat.dk % dd.len, sw = (bper === 2 && s0 % 4 === 2) || (bper === 4 && s0 % 2 === 1) ? hrnOpt(B.SWINGS, prefs.swing)[2] * pat.unit : 0;
          var dt = patTime(pat.dk * du + sw) - now();
          if (dt > 0.1) { break; }
          pat.dk++;
          if (dt < -0.05) { continue; }
          for (i = 0; i < dd.steps.length; i++) {
            if (dd.steps[i][1].indexOf(s0) < 0) { continue; }
            var lv = 0.8;
            try { lv = D.patVel ? D.patVel(dd.steps[i][0], s0 % 16, false) : 0.8; } catch (e) {}
            try { UG.synth(dd.steps[i][0], UG.DRUM, ac.currentTime + Math.max(0, dt), lv * 0.75, B.bus(buses, "d", prefs.dvol) || undefined); } catch (e2) {}
          }
        }
      }
      function bassDef() { if (!prefs.bpat) { return null; } var d = B.patById(B.patterns(meter), prefs.bpat); return d && d[0] === prefs.bpat && d[3] === meter ? d : null; }
      function bassStep() {
        var bd = bassDef(), ac = audioOk && UG.audio ? UG.audio.ctx : null, n = 0;
        if (!bd || !ac) { return; }
        var pt = bd[2], unit = meter / pt.length, per = pt.length / meter, spb = 60 / bpm;
        while (n++ < 16) {
          var b = pat.bk * unit, ci = pat.bk % pt.length, dt = patTime(b + B.swingOf(prefs.swing, per, ci) * unit) - now();
          if (dt > 0.1) { break; }
          pat.bk++;
          if (dt < -0.05) { continue; }
          var c = pt.charAt(ci);
          if (c === "-" && ci === 0) { c = "R"; }
          if (c === "-") { continue; }
          var ch = chordObj(ci === 0 ? barChordAhead(b) : chordD), nx = nextChord(b), left0 = Math.floor(b / meter + 1e-6) * meter + meter - b;
          var m = B.tokNote(c, ch, nx, left0), len = B.tokLen(pt, ci) * unit, when = ac.currentTime + Math.max(0, dt);
          if (pat.bvo && UG.voiceStop) { try { UG.voiceStop(pat.bvo, when, 0.03); } catch (e0) {} }
          try {
            var bus = B.bus(buses, "b", prefs.bvol, false), smp = !!(UG.samples && UG.samples.enabled && UG.sampleReady && UG.sampleReady(33)), g = null;
            if (bus) { g = ac.createGain(); g.gain.value = 0.85 * (smp ? 4 : 1); g.connect(bus); }
            pat.bvo = UG.synth(m, 33, when, 0.85, g || undefined, 8) || null;
            if (pat.bvo && UG.voiceStop) { UG.voiceStop(pat.bvo, when + len * spb * 0.92, 0.04); }
          } catch (e) {}
        }
      }

      // --- パネル ---
      var METRO = B.METRO_ICON || "&#x23F1;&#xFE0F;";
      function scaleOptions() {
        var h = "", gs = B.SCALE_GROUPS || [["", B.SCALES.map(function (s0) { return s0[0]; })]], i, j;
        for (i = 0; i < gs.length; i++) {
          if (gs[i][0]) { h += '<optgroup label="' + escHtml(gs[i][0]) + '">'; }
          for (j = 0; j < gs[i][1].length; j++) { var sc = B.scale(gs[i][1][j]); h += '<option value="' + sc[0] + '"' + (sc[0] === prefs.scale ? " selected" : "") + '>' + escHtml(sc[1]) + '</option>'; }
          if (gs[i][0]) { h += '</optgroup>'; }
        }
        return h;
      }
      function action(v) {
        if (v === "rec") { recToggle(); }
        else if (v === "play") { playToggle(); }
        else if (v === "metro") { metro = !metro; prefs.metro = metro; hrnSavePrefs(prefs); render(); }
        else if (v === "bpmdown" || v === "bpmup") {
          if (rec || back) { return; }
          var pcb = pat ? (now() - pat.t0) * bpm / 60 : 0;
          bpm = Math.max(40, Math.min(240, bpm + (v === "bpmup" ? 5 : -5)));
          if (pat) { pat.t0 = now() - pcb * 60 / bpm; }
          prefs.bpm = bpm; hrnSavePrefs(prefs); render();
        }
        else if (/^inst:/.test(v)) { allOff(); prefs.inst = hrnOpt(HRN_INSTS, v.substring(5))[0]; hrnSavePrefs(prefs); if (audioOk) { try { UG.loadSamples([inst()[2]]); } catch (e) {} } render(); }
        else if (/^tab:/.test(v)) { var tb0 = v.substring(4); prefs.tab = ["play", "pat", "band", "key"].indexOf(tb0) >= 0 ? tb0 : "play"; hrnSavePrefs(prefs); render(); }
        // §308
        else if (v === "land") { allOff(); chordAllOff(); prefs.land = !prefs.land; hrnSavePrefs(prefs); applyLand(); render(); }
        else if (/^view:/.test(v)) { allOff(); chordAllOff(); view = prefs.view = v.substring(5) === "section" ? "section" : "solo"; hrnSavePrefs(prefs); render(); }
        else if (v === "sev") { prefs.sev = !prefs.sev; hrnSavePrefs(prefs); render(); }
        else if (/^secp:/.test(v)) { chordAllOff(); var sp0 = v.substring(5); if (sp0) { prefs.sec.preset = hrnOpt(HRN_SECTIONS, sp0)[0]; prefs.sec.parts = hrnPresetParts(prefs.sec.preset); } hrnSavePrefs(prefs); if (audioOk) { try { UG.loadSamples(prefs.sec.parts.map(function (p) { return hrnOpt(HRN_INSTS, p.inst)[2]; })); } catch (e2) {} } render(); }
        else if (v === "parts:+" || v === "parts:-") {
          chordAllOff();
          var pa = prefs.sec.parts;
          if (v === "parts:+" && pa.length < HRN_SEC_MAX) { pa.push({ inst: pa.length ? pa[pa.length - 1].inst : "trumpet", n: 1 }); }
          if (v === "parts:-" && pa.length > 1) { pa.pop(); }
          prefs.sec.preset = ""; hrnSavePrefs(prefs); render();
        }
        else if (/^pi:\d:/.test(v)) { chordAllOff(); var pk = Number(v.charAt(3)); if (prefs.sec.parts[pk]) { prefs.sec.parts[pk].inst = hrnOpt(HRN_INSTS, v.substring(5))[0]; prefs.sec.preset = ""; hrnSavePrefs(prefs); if (audioOk) { try { UG.loadSamples([hrnOpt(HRN_INSTS, prefs.sec.parts[pk].inst)[2]]); } catch (e3) {} } } render(); }
        else if (/^pn:\d:[+-]$/.test(v)) { chordAllOff(); var pk2 = Number(v.charAt(3)), pp = prefs.sec.parts[pk2]; if (pp) { pp.n = Math.max(1, Math.min(HRN_PLAYERS_MAX, pp.n + (v.charAt(5) === "+" ? 1 : -1))); prefs.sec.preset = ""; hrnSavePrefs(prefs); } render(); }
        else if (v === "pat") { patToggle(); }
        else if (v === "back") { backToggle(); }
        else if (/^hpat:/.test(v)) { prefs.pat = hrnPat(v.substring(5))[0]; hrnSavePrefs(prefs); if (pat) { patRetime(); } render(); }
        else if (v === "swing") { var sl = B.SWINGS, si = 0, q; for (q = 0; q < sl.length; q++) { if (sl[q][0] === prefs.swing) { si = q; } } prefs.swing = sl[(si + 1) % sl.length][0]; hrnSavePrefs(prefs); render(); }
        else if (/^cprog:/.test(v)) { prefs.cprog = B.cprog(v.substring(6)) ? v.substring(6) : ""; hrnSavePrefs(prefs); render(); }
        else if (/^drum:/.test(v)) { prefs.drum = v.substring(5); drumCache = null; hrnSavePrefs(prefs); if (pat) { patRetime(); } render(); }
        else if (/^bpat:/.test(v)) { prefs.bpat = v.substring(5); hrnSavePrefs(prefs); if (pat) { patRetime(); } render(); }
        else if (/^[hbd]vol:[+-]$/.test(v)) { var vk = v.charAt(0) + "vol"; prefs[vk] = Math.max(0, Math.min(150, prefs[vk] + (v.charAt(5) === "+" ? 10 : -10))); hrnSavePrefs(prefs); B.bus(buses, v.charAt(0), prefs[vk], false); render(); }
        else if (v === "chrom" || v === "legato" || v === "vib" || v === "bend") { allOff(); prefs[v] = !prefs[v]; hrnSavePrefs(prefs); render(); }
        else if (v === "octdown" || v === "octup") { allOff(); prefs.oct = Math.max(-1, Math.min(1, prefs.oct + (v === "octup" ? 1 : -1))); hrnSavePrefs(prefs); render(); }
        else if (v === "keydown" || v === "keyup") { allOff(); prefs.key = (prefs.key + (v === "keyup" ? 1 : 11)) % 12; hrnSavePrefs(prefs); render(); }
        else if (/^scale:/.test(v)) { allOff(); prefs.scale = B.scale(v.substring(6))[0]; hrnSavePrefs(prefs); render(); }
      }
      function patOptions() {
        var h = "", i;
        for (i = 0; i < HRN_PATS.length; i++) { if (HRN_PATS[i][3] === meter) { h += '<option value="' + HRN_PATS[i][0] + '"' + (HRN_PATS[i][0] === prefs.pat ? " selected" : "") + '>' + escHtml(HRN_PATS[i][1]) + '</option>'; } }
        return h;
      }
      function cprogOptions() {
        var h = '<option value=""' + (prefs.cprog ? "" : " selected") + '>コード進行なし（コードのボタンで）</option>', gs = B.CPROG_GROUPS || [], i, j;
        for (i = 0; i < gs.length; i++) { h += '<optgroup label="' + escHtml(gs[i][0]) + '">'; for (j = 0; j < gs[i][1].length; j++) { var cp = B.cprog(gs[i][1][j]); if (cp) { h += '<option value="' + cp[0] + '"' + (cp[0] === prefs.cprog ? " selected" : "") + '>' + escHtml(cp[1]) + '</option>'; } } h += '</optgroup>'; }
        return h;
      }
      function drumOptions() {
        var D = window.UGDrum, l = [], h = '<option value=""' + (prefs.drum ? "" : " selected") + '>ドラムなし</option>', grp = "", i;
        try { l = D && D.patternList ? D.patternList() : []; } catch (e) {}
        for (i = 0; i < l.length; i++) {
          if (l[i].kind !== "loop" || l[i].len !== (meter === 3 ? 12 : 16)) { continue; }
          if (l[i].group !== grp) { h += (grp ? '</optgroup>' : "") + '<optgroup label="' + escHtml(l[i].group) + '">'; grp = l[i].group; }
          h += '<option value="' + escHtml(l[i].id) + '"' + (l[i].id === prefs.drum ? " selected" : "") + '>' + escHtml(l[i].name) + '</option>';
        }
        return h + (grp ? '</optgroup>' : "");
      }
      function bpatOptions() {
        var h = '<option value=""' + (prefs.bpat ? "" : " selected") + '>ベースなし</option>', gs = B.patGroups(B.patterns(meter)), i, j;
        for (i = 0; i < gs.length; i++) { h += '<optgroup label="' + escHtml(gs[i][0]) + '">'; for (j = 0; j < gs[i][1].length; j++) { var p0 = gs[i][1][j]; if (p0[3] === meter) { h += '<option value="' + p0[0] + '"' + (p0[0] === prefs.bpat ? " selected" : "") + '>' + escHtml(p0[1]) + '</option>'; } } h += '</optgroup>'; }
        return h;
      }
      function render() {
        if (!panel) { return; }
        var html = "", i;
        html += '<div class="piano-row"><button class="modal-btn' + (rec ? " piano-rec-on" : "") + '" data-ha="rec">' + (rec ? "&#x23F9;&#xFE0F; 録音をとめる" : "&#x1F534; 録音") + '</button>' +
          '<button class="modal-btn' + (play ? " piano-rec-on" : "") + '" data-ha="play"' + (rec ? " disabled" : "") + '>' + (play ? "&#x23F9;&#xFE0F; とめる" : "&#x25B6;&#xFE0F; 再生") + '</button>' +
          '<button class="modal-btn' + (pat ? " piano-rec-on" : "") + '" data-ha="pat">' + (pat ? "&#x23F9;&#xFE0F; パターン" : "&#x25B6;&#xFE0F; パターン") + '</button></div>' +
          (back ? '<div class="piano-row"><button class="modal-btn" data-ha="back"' + (rec ? " disabled" : "") + '>' + (bk && !play && !rec ? "&#x23F9;&#xFE0F; 伴奏をとめる" : "&#x1F3B8; 伴奏だけ鳴らす") + '</button>' +
            '<button class="modal-btn" data-ha="metro" title="録音のメトロノーム">' + METRO + ' ' + (metro ? "ON" : "OFF") + '</button></div>' +
            '<p class="small" style="margin:4px 0 0;">&#x1F3B8; 伴奏: ' + escHtml(back.name) + '（BPM ' + back.seq.bpm + '・' + back.seq.meter + '拍子）</p>' :
          '<div class="piano-row"><button class="modal-btn" data-ha="bpmdown">&minus;</button><span>BPM ' + bpm + '</span><button class="modal-btn" data-ha="bpmup">&#xFF0B;</button>' +
          '<button class="modal-btn" data-ha="metro" title="録音のメトロノーム">' + METRO + ' ' + (metro ? "ON" : "OFF") + '</button></div>');
        var tabN = back ? 2 : 4, tab = back && (prefs.tab === "band" || prefs.tab === "key") ? "play" : prefs.tab;
        html += '<div class="piano-row">';
        for (i = 0; i < tabN; i++) { var tid = ["play", "pat", "band", "key"][i]; html += '<button class="modal-btn' + (tab === tid ? " piano-rec-on" : "") + '" data-ha="tab:' + tid + '">' + ["吹き方", "パターン", "バンド", "キー"][i] + '</button>'; }
        html += '</div>';
        if (tab === "pat") {
          html += '<div class="piano-row"><label class="piano-select">&#x1F3BC; <select data-hpat="1">' + patOptions() + '</select></label></div>' +
            '<div class="piano-row"><button class="modal-btn" data-ha="swing">ハネ: ' + hrnOpt(B.SWINGS, prefs.swing)[1] + '</button></div>' +
            (back ? "" : '<div class="piano-row"><label class="piano-select">&#x1F501; <select data-hcprog="1">' + cprogOptions() + '</select></label></div>') +
            '<p class="small" style="margin:4px 0 0;">&#x1F3BC; ' + escHtml(patDef()[2]) + '（S のばす・E 短く・A キメ・B いちばん低いパート・1〜6 パート・- のばす）。セクションの編成で鳴る<br>' +
            (back ? "コードは曲に合わせて変わります。" : prefs.cprog ? "コードは進行どおり1小節ごとに変わります。" : "パターン中にコードのボタンを押すと、次の小節の頭で変わります。") + '</p>';
        } else if (tab === "band") {
          html += '<div class="piano-row"><label class="piano-select">&#x1F941; <select data-hdrum="1">' + drumOptions() + '</select></label></div>' +
            '<div class="piano-row"><label class="piano-select">&#x1F3B8; <select data-hbpat="1">' + bpatOptions() + '</select></label></div>';
          var vols = [["h", "管楽器"], ["b", "ベース"], ["d", "ドラム"]];
          for (i = 0; i < 3; i++) { html += '<div class="piano-row"><span>&#x1F50A; ' + vols[i][1] + '</span><button class="modal-btn" data-ha="' + vols[i][0] + 'vol:-">－</button><span>' + prefs[vols[i][0] + "vol"] + '%</span><button class="modal-btn" data-ha="' + vols[i][0] + 'vol:+">＋</button></div>'; }
        } else if (tab === "key") {
          html += '<div class="piano-row"><button class="modal-btn" data-ha="keydown">&#x25C0;</button><span>キー ' + HRN_CDE[prefs.key] + '</span><button class="modal-btn" data-ha="keyup">&#x25B6;</button>' +
            '<button class="modal-btn' + (prefs.chrom ? " piano-rec-on" : "") + '" data-ha="chrom">' + (prefs.chrom ? "半音階" : "スケール") + '</button><button class="modal-btn" data-ha="sev">' + (prefs.sev ? "7th" : "3和音") + '</button></div>' +
            '<div class="piano-row"><label class="piano-select">&#x1F3B5; <select data-hscale="1">' + scaleOptions() + '</select></label></div>';
        } else {
          html += '<div class="piano-row">';
          for (i = 0; i < HRN_VIEWS.length; i++) { html += '<button class="modal-btn' + (view === HRN_VIEWS[i][0] ? " piano-rec-on" : "") + '" data-ha="view:' + HRN_VIEWS[i][0] + '">' + HRN_VIEWS[i][1] + '</button>'; }
          html += '<button class="modal-btn' + (prefs.land ? " piano-rec-on" : "") + '" data-ha="land">&#x1F4F1; ' + (prefs.land ? "たて向き" : "よこ向き") + '</button></div>';
          if (view === "section") {
            var sc0 = prefs.sec, po = '<option value=""' + (sc0.preset ? "" : " selected") + '>じぶんで</option>', q, qi;
            for (q = 0; q < HRN_SECTIONS.length; q++) { po += '<option value="' + HRN_SECTIONS[q][0] + '"' + (sc0.preset === HRN_SECTIONS[q][0] ? " selected" : "") + '>' + escHtml(HRN_SECTIONS[q][1]) + '</option>'; }
            html += '<div class="piano-row"><label class="piano-select">&#x1F3BC; 編成 <select data-hsec="1">' + po + '</select></label></div>' +
              '<div class="piano-row"><span>パートの数</span><button class="modal-btn" data-ha="parts:-">－</button><span>' + sc0.parts.length + '</span><button class="modal-btn" data-ha="parts:+">＋</button></div>';
            for (q = 0; q < sc0.parts.length; q++) {
              var io0 = "";
              for (qi = 0; qi < HRN_INSTS.length; qi++) { io0 += '<option value="' + HRN_INSTS[qi][0] + '"' + (HRN_INSTS[qi][0] === sc0.parts[q].inst ? " selected" : "") + '>' + escHtml(HRN_INSTS[qi][1].replace(/&#x[0-9A-F]+;\s*/g, "")) + '</option>'; }
              html += '<div class="piano-row"><label class="piano-select">' + (q + 1) + ' <select data-hpi="' + q + '">' + io0 + '</select></label><button class="modal-btn" data-ha="pn:' + q + ':-">－</button><span>' + sc0.parts[q].n + '人</span><button class="modal-btn" data-ha="pn:' + q + ':+">＋</button></div>';
            }
            html += '<p class="small" style="margin:4px 0 0;">コードのボタンを押しているあいだ、低い楽器から ルート・5度・3度…を分けて吹く（キー 1〜7 も）</p>';
            if (take && !rec) { html += '<p class="small" style="margin:4px 0 0;">いまのテイク: ' + escHtml(take.name) + '（' + take.notes.length + '音）</p>'; }
            if (msg) { html += '<p class="small" style="margin:4px 0 0;color:#ffd166;">' + msg + '</p>'; }
            panel.innerHTML = html;
            bindPanel();
            return;
          }
          html += '<div class="piano-opts">';
          for (i = 0; i < HRN_INSTS.length; i++) { html += '<button class="modal-btn quiz-opt' + (prefs.inst === HRN_INSTS[i][0] ? " active" : "") + '" data-ha="inst:' + HRN_INSTS[i][0] + '">' + HRN_INSTS[i][1] + '</button>'; }
          html += '</div><div class="piano-row"><button class="modal-btn" data-ha="octdown">&#x25C0;</button><span>オクターブ ' + (prefs.oct > 0 ? "+" : "") + prefs.oct + '</span><button class="modal-btn" data-ha="octup">&#x25B6;</button></div>' +
            '<div class="piano-row"><button class="modal-btn' + (prefs.legato ? " piano-rec-on" : "") + '" data-ha="legato">スラー: ' + (prefs.legato ? "ON" : "OFF") + '</button>' +
            '<button class="modal-btn' + (prefs.vib ? " piano-rec-on" : "") + '" data-ha="vib">ビブラート: ' + (prefs.vib ? "ON" : "OFF") + '</button>' +
            '<button class="modal-btn' + (prefs.bend ? " piano-rec-on" : "") + '" data-ha="bend">ベンド: ' + (prefs.bend ? "ON" : "OFF") + '</button></div>' +
            '<p class="small" style="margin:4px 0 0;">キーの上のほうを押すほど強い（押したまま上下で強さが変わる）。横にずらすとベンド。押したまま別のキーへ ＝ スラー</p>';
        }
        if (take && !rec) { html += '<p class="small" style="margin:4px 0 0;">いまのテイク: ' + escHtml(take.name) + '（' + take.notes.length + '音・BPM ' + take.bpm + '）</p>'; }
        if (msg) { html += '<p class="small" style="margin:4px 0 0;color:#ffd166;">' + msg + '</p>'; }
        panel.innerHTML = html;
        bindPanel();
      }
      function bindPanel() {
        var i, bs = panel.querySelectorAll ? panel.querySelectorAll("button[data-ha]") : [];
        for (i = 0; i < bs.length; i++) { bs[i].onclick = function (ev) { if (ev.currentTarget.blur) { ev.currentTarget.blur(); } action(ev.currentTarget.getAttribute("data-ha")); }; }
        var sels = [["hscale", "scale:"], ["hpat", "hpat:"], ["hcprog", "cprog:"], ["hdrum", "drum:"], ["hbpat", "bpat:"], ["hsec", "secp:"]];
        for (i = 0; i < sels.length; i++) {
          var sel = panel.querySelector ? panel.querySelector("select[data-" + sels[i][0] + "]") : null;
          if (sel) { sel.onchange = (function (pre) { return function (ev) { if (ev.currentTarget.blur) { ev.currentTarget.blur(); } action(pre + ev.currentTarget.value); }; })(sels[i][1]); }
        }
        var ps = panel.querySelectorAll ? panel.querySelectorAll("select[data-hpi]") : [];
        for (i = 0; i < ps.length; i++) { ps[i].onchange = function (ev) { if (ev.currentTarget.blur) { ev.currentTarget.blur(); } action("pi:" + ev.currentTarget.getAttribute("data-hpi") + ":" + ev.currentTarget.value); }; }
      }
      render();

      // --- 描く ---
      function text(ctx, s, x, y, size, color) { ctx.fillStyle = color; ctx.font = "bold " + (HRN_LAND ? Math.max(4, size * 0.6) : size) + "px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(s, x, y); }
      function drawKeys(ctx) {
        var n = cols(), r, c, h = top(), lit = h ? h.m : null;
        for (r = 0; r < HRN_ROWS; r++) {
          var ns = rowNotes(r);
          for (c = 0; c < n; c++) {
            var m = ns[c], rc = hrnKeyRect(r, c, n), on = lit === m, isRoot = hrnPc(m) === prefs.key, inRange = m >= inst()[3] && m <= inst()[4];
            var g = ctx.createLinearGradient ? ctx.createLinearGradient(0, rc.y, 0, rc.y + rc.h) : null;
            if (g) { g.addColorStop(0, on ? "#ffe066" : (isRoot ? "#4c6ef5" : "#3b5bdb")); g.addColorStop(1, on ? "#f08c00" : (isRoot ? "#22356e" : "#1c2a5c")); }
            ctx.fillStyle = g || (on ? "#ffd166" : "#2f4a6e");
            if (!inRange) { ctx.globalAlpha = 0.45; }
            ctx.fillRect(rc.x, rc.y, rc.w, rc.h);
            ctx.globalAlpha = 1;
            var nm = hrnName(m, names);
            if (nm) { text(ctx, nm, rc.x + rc.w / 2, rc.y + rc.h - (HRN_LAND ? 6 : 12), n > 8 ? 8 : 11, on ? "#14213d" : "#ffffff"); }
            if (c === 0 || c === n - 1) { text(ctx, HRN_CDE[hrnPc(m)] + (Math.floor(m / 12) - 1), rc.x + rc.w / 2, rc.y + 9, 7, on ? "#14213d" : "rgba(255,255,255,0.5)"); }
          }
        }
        // 息の強さ・ベンドの印
        if (h && tone) {
          var bar = Math.max(0, Math.min(1, (h.lv - 0.35) / 0.75));
          if (!HRN_LAND) { ctx.fillStyle = "#ff922b"; ctx.fillRect(W - 10, HRN_KEY_Y - 6 - 40 * bar, 6, 40 * bar); }
          if (prefs.bend && Math.abs(h.bd) > 0.05 && !HRN_LAND) { text(ctx, (h.bd > 0 ? "⤴+" : "⤵") + h.bd.toFixed(1), W / 2, HRN_KEY_Y - 8, 10, "#ff922b"); }
        }
      }
      function drawSection(ctx) {
        if (back) {
          var k0 = songIdx(), nx = k0 >= 0 ? back.chords[k0 + 1] : null, onB = !!hc.pback;
          ctx.fillStyle = onB ? "#ffd166" : "#2f4a6e"; ctx.fillRect(8, HRN_LAND ? 12 : 44, W - 16, HRN_H - (HRN_LAND ? 16 : 54));
          text(ctx, k0 >= 0 ? back.chords[k0].name : "—", W / 2, HRN_H / 2, 40, onB ? "#14213d" : "#ffd166");
          text(ctx, nx ? "→ " + nx.name : "", W / 2, HRN_H / 2 + 46, 16, onB ? "#14213d" : "#adb5bd");
          if (!HRN_LAND) { text(ctx, "押しているあいだ曲のコードを吹く", W / 2, 60, 11, onB ? "#14213d" : "#adb5bd"); }
          return;
        }
        for (var i = 0; i < 7; i++) {
          var r = hrnChordRect(i), ch = chordObj(i), on = pat && i === chordD, k;
          for (k in hc) { if (hc.hasOwnProperty(k) && hc[k].d === i) { on = true; } }
          ctx.fillStyle = on ? "#ffd166" : (flash["c" + i] > 0 ? "#fff3b0" : "#5c3d0e");
          ctx.fillRect(r.x, r.y, r.w, r.h);
          if (i === pend) { ctx.strokeStyle = "#ff922b"; ctx.lineWidth = 3; ctx.strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4); ctx.lineWidth = 1; }
          text(ctx, ch.deg, r.x + r.w / 2, r.y + r.h * 0.3, 11, on ? "#14213d" : "#e9c46a");
          text(ctx, ch.name, r.x + r.w / 2, r.y + r.h * 0.6, ch.name.length > 5 ? 15 : 20, on ? "#14213d" : "#ffffff");
        }
      }
      return {
        input: function (a, down) {
          var mc = /^c([0-6])$/.exec(a);
          if (mc) {
            if (view !== "section") { return; }
            if (down) { chordOn("key" + mc[1], Number(mc[1])); } else { chordOff("key" + mc[1]); render(); }
            return;
          }
          var mk = /^k([12]):(\d)$/.exec(a);
          if (mk) {
            if (prefs.chrom) { return; }
            var r = Number(mk[1]), c = Number(mk[2]);
            if (down) { press("key" + a, rowNotes(r)[c], 0, 1, 0.8, r); } else { release("key" + a); }
            return;
          }
          if (down) { action(a); }
        },
        pointer: function (type, x, y, id) {
          var pid = "p" + (id === undefined ? 0 : id), n = cols(), k, i;
          if (view === "section") {
            if (type === "down") { audio(); if (back) { if (y > (HRN_LAND ? 12 : 40)) { chordOn("pback", -1); } return; } var d0 = hrnChordAt(x, y); if (d0 >= 0) { chordOn(pid, d0); } }
            else if (type === "up") { if (hc[pid]) { chordOff(pid); render(); } if (hc.pback) { chordOff("pback"); } }
            return;
          }
          if (type === "down") {
            k = hrnKeyAt(x, y, n);
            if (!k) { return; }
            press(pid, rowNotes(k.r)[k.c], x, (W - 8) / n, hrnBreath(k.fy), k.r);
          } else if (type === "move") {
            var h = null;
            for (i = 0; i < held.length; i++) { if (held[i].id === pid) { h = held[i]; } }
            if (!h) { return; }
            k = hrnKeyAt(Math.max(4, Math.min(W - 5, x)), Math.max(HRN_KEY_Y, Math.min(HRN_KEY_BOT - 1, y)), n);
            if (!k) { return; }
            var m2 = rowNotes(k.r)[k.c];
            // 別のキーへ: 縦に段を変えた・横に大きく動いた（ベンド OFF）ときは スラー
            if (m2 !== h.m && (!prefs.bend || k.r !== h.r || Math.abs(x - h.x0) > h.w * 1.5)) { h.m = m2; h.x0 = x; h.r = k.r; h.bd = 0; }
            else if (prefs.bend) { h.bd = Math.max(-1, Math.min(1, Math.round((x - h.x0) / h.w * 20) / 20)); }
            h.lv = hrnBreath(k.fy);
            if (h === top()) { sounding(); }
          } else {
            release(pid);
          }
        },
        step: function () {
          frame++;
          var fk;
          for (fk in flash) { if (flash.hasOwnProperty(fk) && flash[fk] > 0) { flash[fk]--; } }
          if (pat) { patStep(); if (pat && !pat.back) { drumStep(); bassStep(); } }
          if (bk) { backStep(); }
          if (play) {
            var pb = playBeat(), last = 0, i;
            while (play.idx < play.notes.length && play.notes[play.idx][0] <= pb) {
              var pn = play.notes[play.idx], v = S.voice(pn[4][2], pn[2], out(), 0);
              S.level(v, pn[3], 0.04);
              play.vo.push({ v: v, end: pn[0] + pn[1] });
              play.idx++;
            }
            for (i = play.vo.length - 1; i >= 0; i--) { if (pb >= play.vo[i].end) { S.stop(play.vo[i].v, 0.12); play.vo.splice(i, 1); } }
            for (i = 0; i < play.notes.length; i++) { last = Math.max(last, play.notes[i][0] + play.notes[i][1]); }
            if (play.idx >= play.notes.length && pb > last && !play.back) { playStop(); render(); }
          }
          if (rec) {
            var rb = Math.floor(recBeat());
            var cnt = rec.back ? !back.s.lead : true;
            if (rb !== rec.beat && ((metro && rb >= 0) || (rb < 0 && cnt))) { click(((rb % meter) + meter) % meter === 0); }
            rec.beat = rb;
          }
        },
        draw: function (ctx) {
          var g = ctx.createLinearGradient ? ctx.createLinearGradient(0, 0, 0, HRN_H) : null;
          if (g) { g.addColorStop(0, "#1b1f3b"); g.addColorStop(1, "#3a2e12"); }
          ctx.fillStyle = g || "#1b263b";
          ctx.fillRect(0, 0, W, HRN_H);
          hudText(ctx, (view === "section" ? "🎼 " + (prefs.sec.preset ? hrnOpt(HRN_SECTIONS, prefs.sec.preset)[1] : "じぶんの編成") : inst()[1].replace(/&#x[0-9A-F]+;\s*/g, "")) + (back ? " ・🎸 " + (bk ? "伴奏" : back.name) : view === "section" ? "" : pat ? " ・" + patDef()[1] : " ・キー " + HRN_CDE[prefs.key]), 8, HRN_LAND ? 6 : 10, "left");
          hudText(ctx, "BPM " + bpm, W - 8, HRN_LAND ? 6 : 10, "right");
          var h = top();
          if (rec) { var rb = recBeat(); text(ctx, rb < 0 ? String(Math.ceil(-rb)) : "● REC " + (Math.floor(rb / meter) + 1) + "小節・" + rec.notes.length + "音", W / 2, HRN_LAND ? 6 : 32, 14, "#ff6b6b"); }
          else if (view !== "section" && !HRN_LAND) { text(ctx, h ? hrnName(h.m, names === "none" ? "do" : names) + "（" + hrnName(h.m, "cde") + "）" : (play ? "再生中…" : "キーを押して吹こう（上のほうほど強い）"), W / 2, 34, h ? 16 : 12, h ? "#ffd166" : "#ffffff"); }
          if (view === "section") { drawSection(ctx); return; }
          drawKeys(ctx);
        }
      };
    }
  });

  window.UGHorn = {
    H: HRN_H, INSTS: HRN_INSTS, ROWS: HRN_ROWS, KEY_Y: HRN_KEY_Y, PREFS_KEY: HRN_PREFS_KEY, TAKES_KEY: HRN_TAKES_KEY,
    SONGS: HRN_SONGS, chart: hrnChart, BEST_KEY: HRN_BEST_KEY, layout: hrnLayout, geom: function () { return { H: HRN_H, KEY_Y: HRN_KEY_Y, KEY_BOT: HRN_KEY_BOT, LAND: HRN_LAND }; }, SECTIONS: HRN_SECTIONS, PATS: HRN_PATS, sectionNotes: hrnSectionNotes, sectionClean: hrnSectionClean, presetParts: hrnPresetParts, chordRect: hrnChordRect, playList: hrnPlayList, rowNotes: hrnRowNotes, base: hrnBase, keyRect: hrnKeyRect, keyAt: hrnKeyAt, breath: hrnBreath, prefs: hrnPrefs, takesLoad: hrnTakesLoad, takeById: hrnTakeById, sendToSeq: hrnSendToSeq
  };
})();
