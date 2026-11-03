// =========================================================
// 究極ゴリラ ゲームセンター: 🎻 ゴリラストリングス（§300〜）
// arcade.js・arcade-melody.js・arcade-bass.js の後に読み込む。音は window.UGMelody のサンプルを使う。
// 弦楽器は音をのばすので、サンプルののびている所をくり返して鳴らす（strVoice）。
// コード・スケール・音量の出口などはゴリラベース（window.UGBass）のものを借りる
// =========================================================
(function () {
  "use strict";

  var I = window.UGArcade && window.UGArcade.internal;
  if (!I) { return; }
  var W = I.W, hudText = I.hudText, lsGet = I.lsGet, lsSet = I.lsSet, escHtml = I.escHtml;
  function BA() { return window.UGBass; }

  var STR_H = 320;
  var STR_PREFS_KEY = "ultimateGorillaStringsPrefsV1", STR_TAKES_KEY = "ultimateGorillaStringsTakesV1";
  var STR_TAKES_MAX = 10, STR_NOTES_MAX = 2000, STR_LEVEL = 1.8, STR_LAYER_LO = 0.3, STR_LAYER_HI = 0.95;
  var STR_DO = ["ド", "ド#", "レ", "レ#", "ミ", "ファ", "ファ#", "ソ", "ソ#", "ラ", "ラ#", "シ"];
  var STR_CDE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  var STR_NAMES = [["do", "ドレミ"], ["cde", "CDE"], ["none", "なし"]];
  var STR_VIEWS = [["solo", "&#x1F3BB; ソロ"], ["chord", "&#x1F3BC; 合奏コード"]];
  // 楽器 [id, 名前, GM, 弦の開放（低い → 高い）, 弓で弾くか]
  var STR_VIOLA = [48, 55, 62, 69];
  var STR_INSTS = [
    ["violin", "&#x1F3BB; バイオリン", 40, [55, 62, 69, 76], true], ["viola", "ビオラ", 41, STR_VIOLA, true],
    ["cello", "チェロ", 42, [36, 43, 50, 57], true], ["bass", "コントラバス", 43, [28, 33, 38, 43], true],
    ["ens", "&#x1F3BC; 合奏", 48, STR_VIOLA, true], ["slow", "ゆったり合奏", 49, STR_VIOLA, true], ["trem", "トレモロ", 44, STR_VIOLA, true],
    ["pizz", "ピチカート", 45, STR_VIOLA, false], ["harp", "ハープ", 46, [36, 43, 50, 57], false]
  ];
  function strOpt(list, id) { for (var i = 0; i < list.length; i++) { if (list[i][0] === id) { return list[i]; } } return list[0]; }
  function strPc(m) { return ((m % 12) + 12) % 12; }
  function strName(m, names) {
    if (names === "none") { return ""; }
    var r = Math.round(m);
    return names === "cde" ? STR_CDE[strPc(r)] + (Math.floor(r / 12) - 1) : STR_DO[strPc(r)];
  }

  // ---------- ソロの画面（指板・上が1弦 ＝ いちばん高い弦）----------
  var STR_COLS = 8, STR_POS_MAX = 12, STR_BOARD_X = 4, STR_BOARD_Y = 96, STR_BOARD_BOT = 314, STR_BOW_X = W - 4 - Math.round(W * 0.26), STR_BOW_R = W - 4, STR_BOARD_R = W - 4;
  var STR_MARKS = [3, 5, 7, 9, 12, 15, 17, 19];
  var STR_LAND = false, STR_MIRROR = false;
  // bow: 弓の所を出すか。o（省略可）: §303 { land: よこ向き, h: 高さ }。よこ向きは持ち方（ゴリラベースの grip）で、利き手・ネックの太さと位置・弓の所の広さ
  function strLayout(bow, o) {
    o = o || {};
    var land = !!o.land, B = BA(), g = land && B && B.grip ? B.grip() : null, zw = Math.round(W * (g ? Math.max(0.2, g.pw / 100) : 0.26)), gut = land ? 11 : 4;
    STR_LAND = land; STR_MIRROR = !!(g && g.lefty);
    if (land) {
      STR_H = o.h || 130;
      var bx = B.gripBox(14, STR_H - 9, g);
      STR_BOARD_Y = bx.y0; STR_BOARD_BOT = bx.y1;
      STR_COLS = bow ? Math.max(7, Math.round(13 * (1 - zw / W))) : 13;
    } else { STR_H = 320; STR_BOARD_Y = 96; STR_BOARD_BOT = 314; STR_COLS = 8; }
    if (!bow) { STR_BOARD_X = STR_MIRROR ? 4 : gut; STR_BOARD_R = STR_MIRROR ? W - gut : W - 4; }
    else if (!STR_MIRROR) { STR_BOW_X = W - 4 - zw; STR_BOW_R = W - 4; STR_BOARD_X = gut; STR_BOARD_R = STR_BOW_X - 6; }
    else { STR_BOW_X = 4; STR_BOW_R = 4 + zw; STR_BOARD_X = STR_BOW_R + 6; STR_BOARD_R = W - gut; }
  }
  function strColW() { return (STR_BOARD_R - STR_BOARD_X) / STR_COLS; }
  // 列 c の左はし・列の区切り c の x（左利きは右から）
  function strColX(c) { return STR_MIRROR ? STR_BOARD_R - (c + 1) * strColW() : STR_BOARD_X + c * strColW(); }
  function strFretX(c) { return STR_MIRROR ? STR_BOARD_R - c * strColW() : STR_BOARD_X + c * strColW(); }
  // 半音 semi（ポジション pos から）の指の x
  function strSemiX(semi, pos) { return STR_MIRROR ? STR_BOARD_R - (semi - pos + 0.5) * strColW() : STR_BOARD_X + (semi - pos + 0.5) * strColW(); }
  function strRowH() { return (STR_BOARD_BOT - STR_BOARD_Y) / 4; }
  function strRowLineY(r) { return STR_BOARD_Y + (r + 0.5) * strRowH(); }
  // 行 r（0 ＝ 1弦）→ 弦の番号（0 ＝ いちばん低い）
  function strSnOfRow(r) { return 3 - r; }
  // 指板の座標 → { r, sn, semi: 開放からの半音（小数）}（外なら null）
  function strBoardAt(x, y, pos) {
    if (x < STR_BOARD_X || x >= STR_BOARD_R || y < STR_BOARD_Y || y >= STR_BOARD_BOT) { return null; }
    var r = Math.floor((y - STR_BOARD_Y) / strRowH());
    return { r: r, sn: strSnOfRow(r), semi: pos + (STR_MIRROR ? STR_BOARD_R - x : x - STR_BOARD_X) / strColW() - 0.5 };
  }
  // 弓の所の行（外は -1）
  function strBowRow(x, y) {
    if (x < STR_BOW_X || x > STR_BOW_R || y < STR_BOARD_Y || y >= STR_BOARD_BOT) { return -1; }
    return Math.max(0, Math.min(3, Math.floor((y - STR_BOARD_Y) / strRowH())));
  }
  // 弓の速さ（1フレームに動いた量）→ 大きさ（0〜1.1）
  function strBowLevel(speed) { return speed < 0.4 ? 0 : Math.max(0.2, Math.min(1.1, 0.2 + speed / 14)); }

  // ---------- 合奏コード ----------
  // ボタン i（0〜6）の四角（上に4つ・下に3つ）
  function strChordRect(i) {
    if (STR_LAND) { var lw = (W - 8) / 7; return { x: 4 + i * lw + 2, y: 12, w: lw - 4, h: STR_H - 16 }; } // §303: よこ向きは1列に7つ
    var top = 40, h = (STR_H - top - 10) / 2, row = i < 4 ? 0 : 1, n = row ? 3 : 4, w = (W - 8) / n, k = row ? i - 4 : i;
    return { x: 4 + k * w + 3, y: top + row * h + 3, w: w - 6, h: h - 6 };
  }
  function strChordAt(x, y) { for (var i = 0; i < 7; i++) { var r = strChordRect(i); if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) { return i; } } return -1; }
  // コード（ゴリラベースの chord）・いちばん低い音 low → 鳴らす音（ルート・5度・オクターブ上のルート・その上の3度・7th なら7度）
  function strVoicing(ch, low, sev) {
    var root = low + ((strPc(ch.r !== undefined ? ch.r : ch.root) - strPc(low) + 12) % 12), iv = ch.iv, out = [root, root + iv[4], root + 12, root + 12 + iv[2]];
    if (sev) { out.push(root + 12 + iv[6]); }
    return out;
  }

  // ---------- §302: 合奏のパターン [id, 名前, 1小節のマス, 拍子] ----------
  // S 和音をのばす / E 和音を短く（刻み）/ P ピチカートの和音 / a〜e ピチカートの1音（和音の何番目）/ 1〜5 和音の1音をのばす / B いちばん低い音をのばす / - のばす
  var STR_PATS = [
    ["hold", "のばす（全音符）", "S-------", 4], ["half", "2分音符", "S---S---", 4], ["q4", "4分音符", "S-S-S-S-", 4], ["syn", "シンコペーション", "S--S--S-", 4],
    ["e8", "8分の刻み", "EEEEEEEE", 4], ["e16", "16分の刻み", "EEEEEEEEEEEEEEEE", 4], ["march", "マーチ", "B-E-B-E-", 4], ["bass", "低い音と和音", "B---S---", 4],
    ["arp", "アルペジオ（弓）", "1-2-3-4-", 4], ["pz", "ピチカート（アルペジオ）", "a-c-d-c-", 4], ["pzc", "ピチカート（和音）", "P-P-P-P-", 4], ["waltz", "ワルツ（3拍子）", "B-S-S-", 3]
  ];
  function strPat(id) { return strOpt(STR_PATS, id); }
  var STR_VOL_MAX = 150, STR_VOL_STEP = 10;
  function strVol(v, d) { v = Number(v); return v >= 0 && v <= STR_VOL_MAX && v % STR_VOL_STEP === 0 ? v : d; }

  // ---------- §304: 編成（合奏の楽器の組み合わせ）----------
  var STR_ORCH_PRESETS = [
    ["quartet", "弦楽四重奏", [["violin", 1], ["violin", 1], ["viola", 1], ["cello", 1]]],
    ["orch", "弦楽合奏", [["violin", 3], ["viola", 2], ["cello", 2], ["bass", 1]]],
    ["low", "低音（チェロとコントラバス）", [["cello", 2], ["bass", 2]]],
    ["harp", "ハープ入り", [["harp", 1], ["cello", 1], ["viola", 1], ["violin", 2]]]
  ];
  var STR_ORCH_MAX = 6, STR_PLAYERS_MAX = 4, STR_DETUNE = [0, 0.07, -0.07, 0.12]; // 人数ごとの音程のずれ（半音）
  function strPresetParts(id) { return strOpt(STR_ORCH_PRESETS, id)[2].map(function (p) { return { inst: p[0], n: p[1] }; }); }
  // 設定の編成 → { on, preset（"" ＝ じぶんで）, parts: [{ inst, n: 人数 }]（1〜4）}
  function strOrchClean(o) {
    o = o && typeof o === "object" ? o : {};
    var a = o.parts && o.parts.length ? o.parts : strPresetParts("quartet"), parts = [], i;
    for (i = 0; i < a.length && parts.length < STR_ORCH_MAX; i++) {
      var x = a[i] || {}, n = Math.round(Number(x.n));
      parts.push({ inst: strOpt(STR_INSTS, x.inst)[0], n: n >= 1 && n <= STR_PLAYERS_MAX ? n : 1 });
    }
    return { on: !!o.on, preset: typeof o.preset === "string" && strOpt(STR_ORCH_PRESETS, o.preset)[0] === o.preset ? o.preset : "", parts: parts };
  }
  // 編成で和音を鳴らす音 → [{ inst, m, n }]（低い楽器から）。3パート以上は ルート・5度・3度・ルート（7th は7度）を下から1つずつ、2パートまではそれぞれが和音ぜんぶ
  function strOrchNotes(ch, sev, parts) {
    var sorted = parts.slice().sort(function (a, b) { return strOpt(STR_INSTS, a.inst)[3][0] - strOpt(STR_INSTS, b.inst)[3][0]; }), out = [], k, j;
    if (sorted.length < 3) {
      for (k = 0; k < sorted.length; k++) { var vs = strVoicing(ch, strOpt(STR_INSTS, sorted[k].inst)[3][0], sev); for (j = 0; j < vs.length; j++) { out.push({ inst: sorted[k].inst, m: vs[j], n: sorted[k].n }); } }
      return out;
    }
    // §305: 6パートまで（下から ルート・5度・3度・ルート・5度・3度。7th はいちばん上を 7度に）
    var rootPc = strPc(ch.r !== undefined ? ch.r : ch.root), iv = ch.iv, roles = [0, iv[4], iv[2], 12, iv[4] + 12, iv[2] + 12].slice(0, sorted.length), prev = -1;
    if (sev && roles.length >= 4) { roles[roles.length - 1] = iv[6]; }
    for (k = 0; k < sorted.length; k++) {
      var low = strOpt(STR_INSTS, sorted[k].inst)[3][0], pc = (rootPc + roles[k]) % 12, m = low + ((pc - strPc(low) + 12) % 12);
      while (m <= prev) { m += 12; }
      out.push({ inst: sorted[k].inst, m: m, n: sorted[k].n });
      prev = m;
    }
    return out;
  }

  // ---------- 設定・テイク ----------
  function strPrefs() {
    var p = lsGet(STR_PREFS_KEY) || {}, pos = Math.round(Number(p.pos)), key = Math.round(Number(p.key)), B = BA();
    return {
      view: p.view === "chord" ? "chord" : "solo", inst: strOpt(STR_INSTS, p.inst)[0],
      names: p.names === "cde" || p.names === "none" ? p.names : "do",
      pos: pos >= 0 && pos <= STR_POS_MAX ? pos : 0, key: key >= 0 && key <= 11 ? key : 0,
      scale: B ? B.scale(p.scale)[0] : "major", sev: !!p.sev, land: !!p.land, orch: strOrchClean(p.orch), rlevel: strOpt(STR_RLEVELS, p.rlevel)[0], rspeed: STR_SPEEDS.indexOf(Number(p.rspeed)) >= 0 ? Number(p.rspeed) : 100, tab: ["play", "pat", "band", "key"].indexOf(p.tab) >= 0 ? p.tab : "play",
      pat: strPat(p.pat)[0], swing: B ? strOpt(B.SWINGS, Number(p.swing))[0] : 0, cprog: B && B.cprog(p.cprog) ? p.cprog : "",
      drum: typeof p.drum === "string" && /^[gdp]:[A-Za-z0-9_-]{1,32}$/.test(p.drum) ? p.drum : "",
      bpat: typeof p.bpat === "string" && /^[a-z0-9]{1,12}$/.test(p.bpat) ? p.bpat : "",
      svol: strVol(p.svol, 100), bvol: strVol(p.bvol, 100), dvol: strVol(p.dvol, 50),
      backing: typeof p.backing === "string" && /^(cur|s:\d+)$/.test(p.backing) ? p.backing : "",
      bow: p.bow !== false, snap: p.snap !== false, vib: p.vib !== false,
      bpm: Math.max(40, Math.min(240, Math.round(Number(p.bpm) || 100))), metro: p.metro !== false
    };
  }
  function strSavePrefs(p) { return lsSet(STR_PREFS_KEY, p); }
  function strNum(v, lo, hi) { var n = Number(v); return isFinite(n) && n >= lo && n <= hi ? n : null; }
  function strNotesClean(a) {
    var out = [], i;
    a = a && a.length ? a : [];
    for (i = 0; i < a.length && out.length < STR_NOTES_MAX; i++) {
      var b = a[i] && strNum(a[i][0], 0, 4096), d = a[i] && strNum(a[i][1], 0.0625, 32), m = a[i] && strNum(a[i][2], 0, 127), v = a[i] && strNum(a[i][3], 0.1, 1);
      if (b !== null && d !== null && m !== null) { out.push(v !== null && v !== 0.8 ? [b, d, Math.round(m), v] : [b, d, Math.round(m)]); }
    }
    out.sort(function (x, y) { return x[0] - y[0]; });
    return out;
  }
  function strTakeClean(t, i) {
    return {
      id: Math.max(1, Math.round(Number(t.id)) || i + 1), name: String(t.name || "テイク").slice(0, 20),
      bpm: Math.max(40, Math.min(240, Math.round(Number(t.bpm) || 100))), meter: t.meter === 3 ? 3 : 4,
      inst: strOpt(STR_INSTS, t.inst)[0], notes: strNotesClean(t.notes), parts: strPartsClean(t.parts)
    };
  }
  // §305: 編成で録ったテイクのパート [{ inst, notes }]（2〜6。それ以外は undefined）
  function strPartsClean(a) {
    if (!a || !a.length || a.length < 2) { return undefined; }
    var out = [], i;
    for (i = 0; i < a.length && out.length < STR_ORCH_MAX; i++) {
      var p = a[i] || {}, n = strNotesClean(p.notes);
      if (n.length) { out.push({ inst: strOpt(STR_INSTS, p.inst)[0], notes: n }); }
    }
    return out.length >= 2 ? out : undefined;
  }
  // テイクを鳴らす音 [拍, 長さ, MIDI, 強さ, 楽器]（パートがあれば楽器ごと）
  function strPlayList(take) {
    var out = [], ps = take.parts || [{ inst: take.inst, notes: take.notes }], i, j;
    for (i = 0; i < ps.length; i++) { var ins = strOpt(STR_INSTS, ps[i].inst); for (j = 0; j < ps[i].notes.length; j++) { var n = ps[i].notes[j]; out.push([n[0], n[1], n[2], n[3] || 0.8, ins]); } }
    out.sort(function (a, b) { return a[0] - b[0]; });
    return out;
  }
  function strTakesLoad() {
    var a = lsGet(STR_TAKES_KEY), out = [], i;
    if (!a || !a.length) { return out; }
    for (i = 0; i < a.length && out.length < STR_TAKES_MAX; i++) { if (a[i] && typeof a[i] === "object") { out.push(strTakeClean(a[i], i)); } }
    return out;
  }
  function strTakesSave(list) { return lsSet(STR_TAKES_KEY, list.slice(0, STR_TAKES_MAX)); }
  function strTakeAdd(list, t) {
    var id = 0, i;
    for (i = 0; i < list.length; i++) { id = Math.max(id, list[i].id); }
    var take = strTakeClean({ id: id + 1, name: t.name || "ストリングス " + (id + 1), bpm: t.bpm, meter: t.meter, inst: t.inst, notes: t.notes, parts: t.parts }, 0);
    list.unshift(take);
    if (list.length > STR_TAKES_MAX) { list.length = STR_TAKES_MAX; }
    return take;
  }
  function strTakeById(list, id) { for (var i = 0; i < list.length; i++) { if (list[i].id === id) { return list[i]; } } return null; }

  // ---------- シーケンサーへ送る ----------
  var STR_SEQ_MAX = 1000;
  function strSendToSeq(take) {
    var U = window.UGUkulele;
    if (!U || !U.seqLoad || !U.xAdd) { return { ok: false, msg: "ゴリラウクレレが読みこめませんでした" }; }
    if (!take || !take.notes || !take.notes.length) { return { ok: false, msg: "音のないテイクは送れません" }; }
    var st = U.seqLoad();
    // §305: パートのあるテイクは、パートごとに別のトラックへ
    if (take.parts && take.parts.length >= 2) {
      var ids = [], k;
      for (k = 0; k < take.parts.length; k++) {
        var pid = U.xAdd(st.cur.tracks, "snotes");
        if (!pid) { break; }
        var pt = st.cur.tracks[pid], pins = strOpt(STR_INSTS, take.parts[k].inst);
        pt.name = (String(take.name).slice(0, 6) + " " + pins[1].replace(/&#x[0-9A-F]+;\s*/g, "")).slice(0, 12);
        pt.prog = pins[2];
        pt.notes = strNotesClean(take.parts[k].notes).slice(0, STR_SEQ_MAX);
        ids.push(pid);
      }
      if (!ids.length) { return { ok: false, msg: "追加トラックがいっぱいです（8本まで）。シーケンサーで1本消してから送ってね" }; }
      U.seqSave(st);
      return { ok: true, ids: ids, id: ids[0], msg: "「" + take.name + "」を、パートごとに " + ids.length + " 本の 🎻 ストリングス打ち込みトラックとして送りました" + (ids.length < take.parts.length ? "（トラックがいっぱいで、" + (take.parts.length - ids.length) + " パートは送れませんでした）" : "") };
    }
    var id = U.xAdd(st.cur.tracks, "snotes");
    if (!id) { return { ok: false, msg: "追加トラックがいっぱいです（8本まで）。シーケンサーで1本消してから送ってね" }; }
    var t = st.cur.tracks[id], n = strNotesClean(take.notes), cut = n.length > STR_SEQ_MAX;
    t.name = String(take.name).slice(0, 12);
    t.prog = strOpt(STR_INSTS, take.inst)[2];
    t.notes = n.slice(0, STR_SEQ_MAX);
    U.seqSave(st);
    return { ok: true, id: id, cut: cut, msg: "「" + take.name + "」を、ゴリラウクレレのシーケンサー（編集中の曲）に 🎻 ストリングス打ち込みトラックとして送りました" + (cut ? "（音が多いので、はじめの " + STR_SEQ_MAX + " 音）" : "") };
  }

  // ---------- 音: のばせる声（サンプルののびている所をくり返す）----------
  // → { src（サンプル）または h（合成音）, g: 大きさ, best, m }。音が出せなければ null
  function strVoice(prog, m, out, when) {
    var UG = window.UGMelody, A = UG && UG.audio, ac = A && A.ctx;
    if (!ac || !out) { return null; }
    var S = UG.samples, name = UG.sampleFiles ? UG.sampleFiles[prog] : null, bank = S && S.buffers && name ? S.buffers[name] : null, keys = S && S.keys && name ? S.keys[name] : null;
    var g = ac.createGain(), t = Math.max(when || 0, ac.currentTime), v = { ac: ac, g: g, m: m, src: null, h: null, best: m };
    g.gain.value = 0;
    g.connect(out);
    // §314: 立ち上がりのゆっくりな音色（ゆったり合奏）は、サンプルをこの長さで大きくする
    var att = UG.sampleAttack ? UG.sampleAttack[prog] || 0 : 0, into = g;
    if (S && S.enabled && UG.sampleReady && UG.sampleReady(prog) && bank && keys && keys.length) {
      var best = strNearest(keys, m), buf = bank[best];
      if (buf) {
        if (att) { into = ac.createGain(); into.gain.setValueAtTime(0, t); into.gain.linearRampToValueAtTime(1, t + att); into.connect(g); }
        // §310: 弱く弾いた録音（＋1000）があれば、2つを混ぜる（strLevel の大きさで）
        var nameP = UG.sampleFiles[prog + 1000], bankP = nameP && UG.sampleReady(prog + 1000) ? S.buffers[nameP] : null, keysP = bankP ? S.keys[nameP] : null;
        var bestP = keysP && keysP.length ? strNearest(keysP, m) : 0, bufP = bankP ? bankP[bestP] : null;
        if (bufP) {
          v.gL = ac.createGain(); v.gL.gain.value = 0; v.gL.connect(into);
          v.gS = ac.createGain(); v.gS.gain.value = 1; v.gS.connect(into);
          v.src2 = strLoop(ac, bufP, m, bestP, v.gS, t); v.best2 = bestP;
        }
        v.src = strLoop(ac, buf, m, best, v.gL || into, t); v.best = best;
        return v;
      }
    }
    try { v.h = UG.synth(m, prog, t, 0.8, g, 30) || null; } catch (e) {}
    return v;
  }
  function strNearest(keys, m) {
    var best = keys[0];
    for (var i = 1; i < keys.length; i++) { if (Math.abs(keys[i] - m) < Math.abs(best - m)) { best = keys[i]; } }
    return best;
  }
  // のびている所をくり返すサンプル
  function strLoop(ac, buf, m, best, out, t) {
    var src = ac.createBufferSource(), lp = buf.ugLoop || strLoopPoints(buf);
    src.buffer = buf;
    src.loop = true;
    src.loopStart = lp[0];
    src.loopEnd = lp[1];
    src.playbackRate.value = Math.pow(2, (m - best) / 12);
    src.connect(out);
    src.start(t);
    return src;
  }
  // §310: くり返しの頭と終わり。終わりは ±10ms で、頭と波の形がいちばん合う所に（つなぎ目でプツッといわない）。バッファに覚えておく
  function strLoopPoints(buf) {
    var dur = buf.duration || 3, ls = Math.min(1, dur * 0.35), le = Math.max(ls + 0.3, dur - 0.25), lp = [ls, le];
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
  // 音程（なめらかに）
  function strPitch(v, m, glide) {
    if (!v) { return; }
    v.m = m;
    var t = v.ac.currentTime;
    if (v.src) { try { v.src.playbackRate.cancelScheduledValues(t); v.src.playbackRate.setTargetAtTime(Math.pow(2, (m - v.best) / 12), t, (glide || 0.04) / 3); } catch (e) {} }
    else if (v.h && window.UGMelody.voiceBend) { try { window.UGMelody.voiceBend(v.h, m, 0, glide || 0.04); } catch (e2) {} }
    if (v.src2) { try { v.src2.playbackRate.cancelScheduledValues(t); v.src2.playbackRate.setTargetAtTime(Math.pow(2, (m - v.best2) / 12), t, (glide || 0.04) / 3); } catch (e4) {} }
  }
  // 大きさ（tau: なめらかさ・秒。when（省略可）: §302 その時刻から）
  function strLevel(v, lv, tau, when) {
    if (!v) { return; }
    try {
      var later = when > v.ac.currentTime, t = later ? when : v.ac.currentTime;
      if (!later) { v.g.gain.cancelScheduledValues(t); }
      v.g.gain.setTargetAtTime(lv * STR_LEVEL, t, tau || 0.05);
      if (v.gS) {
        // §310: 小さいと弱い録音・大きいと強い録音（等パワー）
        var x = Math.max(0, Math.min(1, (lv - STR_LAYER_LO) / (STR_LAYER_HI - STR_LAYER_LO)));
        if (!later) { v.gL.gain.cancelScheduledValues(t); v.gS.gain.cancelScheduledValues(t); }
        v.gL.gain.setTargetAtTime(Math.sin(x * Math.PI / 2), t, tau || 0.05);
        v.gS.gain.setTargetAtTime(Math.cos(x * Math.PI / 2), t, tau || 0.05);
      }
    } catch (e) {}
  }
  function strStop(v, rel, when) {
    if (!v) { return; }
    var t = Math.max(v.ac.currentTime, when || 0), r = rel || 0.25;
    try { if (t <= v.ac.currentTime) { v.g.gain.cancelScheduledValues(t); } v.g.gain.setTargetAtTime(0, t, r / 3); } catch (e) {}
    if (v.src) { try { v.src.stop(t + r * 2 + 0.05); } catch (e2) {} }
    if (v.src2) { try { v.src2.stop(t + r * 2 + 0.05); } catch (e4) {} }
    if (v.h && window.UGMelody.voiceStop) { try { window.UGMelody.voiceStop(v.h, t + r, r); } catch (e3) {} }
  }
  // §315: 生の録音でのばせる音色（弱い録音 ＋1000 がある・フルート）。読みこみずみのときだけ
  function strSustains(prog) {
    var UG = window.UGMelody;
    return !!(UG && UG.sampleFiles && (UG.sampleFiles[prog + 1000] || prog === 73) && UG.samples && UG.samples.enabled && UG.sampleReady && UG.sampleReady(prog));
  }
  // §315: シーケンサーの1音。when から sec 秒のばし、強さ vel（0.1〜1）で大きさと弱い/強いの録音をまぜる。大きさはメロディくずしの1音（0.6 × vel）と同じ
  function strNote(prog, m, out, when, vel, sec) {
    var UG = window.UGMelody, ac = UG && UG.audio && UG.audio.ctx;
    if (!ac || !out) { return null; }
    var o = ac.createGain();
    o.gain.value = 0.6 / STR_LEVEL;
    o.connect(out);
    var v = strVoice(prog, m, o, when);
    if (!v) { return null; }
    strLevel(v, vel, 0.02, when);
    strStop(v, 0.15, when + Math.max(0.05, sec));
    v.end = when + Math.max(0.05, sec) + 0.4;
    return v;
  }
  // ビブラート（5.5Hz で再生の速さをゆらす）
  function strVibrato(v, on) {
    if (!v || !v.src || !v.ac.createOscillator) { return; }
    try {
      if (on && !v.lfo) {
        var o = v.ac.createOscillator(), d = v.ac.createGain();
        o.frequency.value = 5.5; d.gain.value = 0.006 * v.src.playbackRate.value;
        o.connect(d); d.connect(v.src.playbackRate); if (v.src2) { d.connect(v.src2.playbackRate); } o.start(v.ac.currentTime + 0.25);
        v.lfo = o;
      } else if (!on && v.lfo) { v.lfo.stop(0); v.lfo = null; }
    } catch (e) {}
  }

  // ---------- はじめの画面 ----------
  function strSetup(root, ctl) {
    var p = strPrefs(), note = "";
    function opts(list, cur, attr) {
      var h = "", i;
      for (i = 0; i < list.length; i++) { h += '<button class="modal-btn quiz-opt' + (cur === list[i][0] ? " active" : "") + '" data-' + attr + '="' + list[i][0] + '">' + list[i][1] + '</button>'; }
      return h;
    }
    function draw() {
      var takes = strTakesLoad(), i;
      var html = '<div class="melody-setup"><h3 style="margin:0 0 4px;">&#x1F3BB; ゴリラストリングス</h3>' +
        '<p class="small" style="color:#adb5bd;margin:0 0 8px;">バイオリンからコントラバス・合奏・ハープまで。弓でこすって音をのばそう。</p>' +
        '<p class="small" style="margin:4px 0 2px;">弾き方</p><div class="quiz-opts">' + opts(STR_VIEWS, p.view, "view") + '</div>' +
        '<p class="small" style="margin:4px 0 2px;">楽器</p><div class="piano-opts">' + opts(STR_INSTS, p.inst, "inst") + '</div>' +
        '<p class="small" style="margin:4px 0 2px;">音名</p><div class="quiz-opts">' + opts(STR_NAMES, p.names, "names") + '</div>';
      var bl = BA() && BA().backList ? BA().backList() : [];
      if (bl.length) { html += '<p class="small" style="margin:6px 0 2px;">&#x1F3B8; 伴奏（ゴリラウクレレのシーケンサーの曲）</p><div class="piano-opts">' + opts([["-", "なし"]].concat(bl), p.backing || "-", "backing") + '</div>'; }
      html += '<button class="modal-btn" data-go="1" style="width:100%;margin-top:8px;">&#x1F3BB; はじめる</button>' +
        '<p class="small" style="margin:10px 0 2px;">&#x1F399;&#xFE0F; 録音したテイク（' + takes.length + ' / ' + STR_TAKES_MAX + '）</p>';
      if (note) { html += '<p class="small" style="color:#ffd166;margin:0 0 4px;">' + note + '</p>'; }
      if (!takes.length) { html += '<p class="small" style="color:#adb5bd;margin:0;">まだありません。弾く画面の「🔴 録音」で録れます。</p>'; }
      for (i = 0; i < takes.length; i++) {
        html += '<div class="piano-take"><span>' + escHtml(takes[i].name) + '<br><span class="small" style="color:#adb5bd;">' + takes[i].notes.length + '音・BPM ' + takes[i].bpm + '・' + (takes[i].parts ? "編成 " + takes[i].parts.length + " パート" : strOpt(STR_INSTS, takes[i].inst)[1]) + '</span></span>' +
          '<button class="modal-btn" data-open="' + takes[i].id + '">&#x25B6;&#xFE0F; ひらく</button>' +
          '<button class="modal-btn" data-send="' + takes[i].id + '" title="シーケンサーへ送る">&#x1F3B8; 送る</button>' +
          '<button class="modal-btn" data-del="' + takes[i].id + '">&#x1F5D1;&#xFE0F;</button></div>';
      }
      // §303: リズムゲーム
      var best = strBest();
      html += '<p class="small" style="margin:12px 0 2px;">&#x1F3AE; リズムゲーム（長い音符を押しているあいだ和音がのびる。よこ向きの設定ならよこ向きで）</p><div class="quiz-opts">' + opts(STR_RLEVELS, p.rlevel, "rlevel") + '</div><div class="quiz-opts">';
      for (i = 0; i < STR_SPEEDS.length; i++) { html += '<button class="modal-btn quiz-opt' + (p.rspeed === STR_SPEEDS[i] ? " active" : "") + '" data-rspeed="' + STR_SPEEDS[i] + '">' + STR_SPEEDS[i] + '%</button>'; }
      html += '</div>';
      for (i = 0; i < STR_SONGS.length; i++) {
        var bs0 = best[STR_SONGS[i][0] + "@" + p.rlevel + "@" + p.rspeed];
        html += '<button class="modal-btn quiz-cat-btn" data-song="' + STR_SONGS[i][0] + '" style="width:100%;">' + escHtml(STR_SONGS[i][1]) + '（BPM ' + STR_SONGS[i][5] + '）' +
          ' <span class="small" style="color:#6b4f00;">' + new Array(STR_SONGS[i][10] + 1).join("&#x2B50;") + (bs0 ? "・ベスト " + bs0.s + "（" + bs0.r + "）" : "") + '</span></button>';
      }
      html += '<button class="modal-btn" data-back="1" style="width:100%;margin-top:14px;">&#x1F579;&#xFE0F; メニューへ</button></div>';
      root.innerHTML = html;
      var btns = root.querySelectorAll("button"), j;
      for (j = 0; j < btns.length; j++) {
        btns[j].onclick = function (ev) {
          var el = ev.currentTarget, v;
          if ((v = el.getAttribute("data-view"))) { p.view = v; strSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-inst"))) { p.inst = v; strSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-names"))) { p.names = v; strSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-rlevel"))) { p.rlevel = v; strSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-rspeed"))) { p.rspeed = Number(v); strSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-song"))) { ctl.done({ mode: "rhythm", song: v, level: p.rlevel, speed: p.rspeed, land: p.land }); return; }
          if ((v = el.getAttribute("data-backing"))) { p.backing = v === "-" ? "" : v; strSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-send"))) { var rs = strSendToSeq(strTakeById(strTakesLoad(), Number(v))); note = (rs.ok ? "&#x2705; " : "&#x26A0;&#xFE0F; ") + escHtml(rs.msg); draw(); return; }
          if ((v = el.getAttribute("data-del"))) {
            var list = strTakesLoad(), t = strTakeById(list, Number(v));
            if (!t || (window.confirm && !window.confirm("「" + t.name + "」を消しますか？"))) { return; }
            list.splice(list.indexOf(t), 1);
            strTakesSave(list);
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

  // ---------- §303: リズムゲーム（長い音符を押しているあいだ和音がのびる）----------
  var STR_BEST_KEY = "ultimateGorillaStringsBestV1", STR_SPEEDS = [70, 85, 100], STR_RLEVELS = [["easy", "かんたん"], ["normal", "ふつう"]];
  // [id, 名前, コード進行, キー, スケール, BPM, 小節, パターン, ゴリラドラム, ゴリラベースのパターン, ★]
  var STR_SONGS = [
    ["canon", "カノン", "canon", 2, "major", 72, 8, "half", "g:ballad", "root", 1], ["royal", "王道バラード", "royal", 0, "major", 76, 8, "hold", "g:ballad", "root", 1],
    ["fifty", "50年代ポップ", "fifty", 7, "major", 92, 8, "q4", "g:8beat", "r5", 2], ["minor", "マイナーの調べ", "minor3", 4, "minor", 84, 8, "half", "g:ballad", "root", 1],
    ["epic", "エピック", "epic", 9, "minor", 100, 8, "syn", "g:rock", "root8", 2], ["andalus", "アンダルシア", "andalus", 9, "minor", 96, 8, "half", "g:latin", "r5", 2],
    ["blues", "ブルース", "blues12", 9, "major", 88, 12, "q4", "g:shuffle", "walk2", 3], ["waltz", "ワルツ（3拍子）", "canon", 0, "major", 108, 8, "waltz", "g:waltz", "waltz2", 2]
  ];
  function strSong(id) { return strOpt(STR_SONGS, id); }
  function strBest() { var o = lsGet(STR_BEST_KEY); return o && typeof o === "object" ? o : {}; }
  // 譜面 → { meter, notes: [{ beat, len, d: 度数, name }] }。音符はパターンの文字（- 以外）ごと、次の文字まで。かんたん は1小節に1つ
  function strChart(song, level) {
    var pd = strPat(song[7]), meter = pd[3], pt = pd[2], L = pt.length, unit = meter / L, cp = BA().cprog(song[2]), out = [], b, ci;
    for (b = 0; b < song[6]; b++) {
      var d = cp ? BA().cprogAt(cp, b * meter, meter).d : 0, name = BA().chord(song[3], d, song[4]).name;
      if (level === "easy") { out.push({ beat: b * meter, len: meter, d: d, name: name }); continue; }
      for (ci = 0; ci < L; ci++) {
        if (pt.charAt(ci) === "-") { continue; }
        var n = 1;
        while (ci + n < L && pt.charAt(ci + n) === "-") { n++; }
        out.push({ beat: b * meter + ci * unit, len: n * unit, d: d, name: name });
      }
    }
    return { meter: meter, notes: out };
  }
  function strRhythm(api, cfg) {
    var B = BA(), prefs = strPrefs(), panel = api.panel, frame = 0, ended = false, msg = "", land = !!cfg.land;
    if (panel && panel.classList) { panel.classList.add("quiz-panel"); }
    if (api.setLandscape) { api.setLandscape(land); }
    var box = panel && panel.parentNode;
    strLayout(false, land ? { land: true, h: box && B.landH ? B.landH(box.clientWidth, box.clientHeight) : 130 } : {});
    if (api.setCanvasHeight) { api.setCanvasHeight(STR_H); }
    var song = strSong(cfg.song), level = strOpt(STR_RLEVELS, cfg.level)[0], rate = (STR_SPEEDS.indexOf(Number(cfg.speed)) >= 0 ? Number(cfg.speed) : 100) / 100;
    var chart = strChart(song, level), meter = chart.meter, spb = 60 / song[5] / rate, t0 = 0.5 + meter * spb, JG = B.JUDGE, ins = strOpt(STR_INSTS, prefs.inst), i;
    if (!ins[4]) { ins = strOpt(STR_INSTS, "ens"); } // はじく楽器はのばせないので合奏で
    var cols = [], cnames = [];
    for (i = 0; i < chart.notes.length; i++) { if (cols.indexOf(chart.notes[i].d) < 0) { cols.push(chart.notes[i].d); cnames.push(chart.notes[i].name); } }
    var nL = cols.length, rn = [], counts = [0, 0, 0, 0], combo = 0, maxCombo = 0, keeps = 0, judgeText = "", judgeFrames = 0, lastClick = -99, laneFlash = [], offs = [], holding = {};
    for (i = 0; i < nL; i++) { laneFlash.push(0); }
    for (i = 0; i < chart.notes.length; i++) { var cn = chart.notes[i]; rn.push({ t: t0 + cn.beat * spb, end: t0 + (cn.beat + cn.len) * spb, lane: cols.indexOf(cn.d), d: cn.d, name: cn.name, j: -2, kept: false }); }
    var endT = t0 + song[6] * meter * spb;
    function now() { return frame / 60; }
    var UG = window.UGMelody, audioOk = false, LAT = UG && UG.latency ? UG.latency() / 1000 : 0, buses = {};
    try { if (UG && UG.prefetchSamples) { UG.prefetchSamples([ins[2], 33]); } } catch (e0) {} // §316
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
    // 押しているあいだのばす和音
    function chordOn(n) {
      audio();
      if (!audioOk) { return []; }
      var bus = B.bus(buses, "s", prefs.svol, false), ch = B.chord(song[3], n.d, song[4]), vs = [], k, j;
      // §304: 編成 ON なら編成で（はじく楽器のパートは短く）
      var ns = prefs.orch.on ? strOrchNotes(ch, false, prefs.orch.parts) : strVoicing(ch, ins[3][0], false).map(function (m) { return { inst: ins[0], m: m, n: 1 }; });
      for (k = 0; k < ns.length; k++) {
        var pi = strOpt(STR_INSTS, ns[k].inst);
        for (j = 0; j < ns[k].n; j++) {
          var v = strVoice(pi[2], ns[k].m + STR_DETUNE[j], bus, 0);
          strLevel(v, 0.45 / Math.sqrt(ns[k].n), 0.06);
          if (!pi[4]) { strStop(v, 0.4, (v ? v.ac.currentTime : 0) + 0.5); }
          vs.push(v);
        }
      }
      return vs;
    }
    function chordOffAll(vs) { for (var k = 0; k < vs.length; k++) { strStop(vs[k], 0.3); } }
    // ゴリラドラムのリズムとゴリラベースのパターン
    var D0 = window.UGDrum, dsteps = null, dlen = 16, dk = 0, bpd = null, bk = 0, bvo = null;
    try { dsteps = D0 && D0.patternSteps ? D0.patternSteps(song[8]) : null; dlen = D0 && D0.patLen ? D0.patLen(song[8]) : 16; if (dlen !== (meter === 3 ? 12 : 16)) { dsteps = null; } } catch (e0) {}
    try { bpd = B.patById(B.patterns(meter), song[9]); if (!bpd || bpd[0] !== song[9] || bpd[3] !== meter) { bpd = null; } } catch (e1) {}
    function band() {
      var ac = audioOk && UG.audio ? UG.audio.ctx : null, n = 0, k;
      if (!ac) { return; }
      while (dsteps && n++ < 16) {
        var du = meter / dlen, tt = t0 + dk * du * spb, dt = tt - now();
        if (dt > 0.1 || tt >= endT - 1e-6) { break; }
        var s0 = dk % dlen;
        dk++;
        if (dt < -0.05) { continue; }
        for (k = 0; k < dsteps.length; k++) {
          if (dsteps[k][1].indexOf(s0) < 0) { continue; }
          var lv = 0.8;
          try { lv = D0.patVel ? D0.patVel(dsteps[k][0], s0 % 16, false) : 0.8; } catch (e) {}
          try { UG.synth(dsteps[k][0], UG.DRUM, ac.currentTime + dt, lv * 0.7, B.bus(buses, "d", prefs.dvol) || undefined); } catch (e2) {}
        }
      }
      n = 0;
      while (bpd && n++ < 16) {
        var pt = bpd[2], u = meter / pt.length, b = bk * u, ci = bk % pt.length, tb = t0 + b * spb, db = tb - now();
        if (db > 0.1 || tb >= endT - 1e-6) { break; }
        bk++;
        if (db < -0.05) { continue; }
        var c = pt.charAt(ci);
        if (c === "-" && ci === 0) { c = "R"; }
        if (c === "-") { continue; }
        var cp = B.cprog(song[2]), ca = cp ? B.cprogAt(cp, b, meter) : { d: 0, next: 0, left: 99 }, last = Math.floor(b / meter + 1e-6) + 1 >= song[6];
        var m = B.tokNote(c, B.chord(song[3], ca.d, song[4]), last ? null : B.chord(song[3], ca.next, song[4]), ca.left), when = ac.currentTime + db;
        if (bvo && UG.voiceStop) { try { UG.voiceStop(bvo, when, 0.03); } catch (e3) {} }
        try {
          var bus2 = B.bus(buses, "b", prefs.bvol, false), smp2 = !!(UG.samples && UG.samples.enabled && UG.sampleReady && UG.sampleReady(33)), g2 = null;
          if (bus2) { g2 = ac.createGain(); g2.gain.value = 0.85 * (smp2 ? 4 : 1); g2.connect(bus2); }
          bvo = UG.synth(m, 33, when, 0.85, g2 || undefined, 8) || null;
          if (bvo && UG.voiceStop) { UG.voiceStop(bvo, when + B.tokLen(pt, ci) * u * spb * 0.92, 0.04); }
        } catch (e4) {}
      }
    }
    // id（指・キー）でレーン lane を押す / はなす
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
      holding[id] = { n: best, vs: chordOn(best) };
    }
    function release(id) {
      var h = holding[id];
      if (!h) { return; }
      delete holding[id];
      chordOffAll(h.vs);
      // おわりの手前まで（音符の長さの 75%）押していればキープ
      if (!h.n.kept && now() - LAT >= h.n.t + (h.n.end - h.n.t) * 0.75) { h.n.kept = true; keeps++; api.addScore(50); judgeText = "キープ！"; judgeFrames = 20; }
    }
    function finish() {
      if (ended) { return; }
      ended = true;
      var k;
      for (k in holding) { if (holding.hasOwnProperty(k)) { release(k); } }
      var acc = rn.length ? (counts[0] + counts[1] * 0.7 + counts[2] * 0.4) / rn.length : 0, rk = B.rank(acc), best = strBest();
      if (rn.length && counts[3] === 0) { api.addScore(500); }
      var key = song[0] + "@" + level + "@" + Math.round(rate * 100), sc = api.getScore();
      if (!best[key] || !(best[key].s >= sc)) { best[key] = { s: sc, r: rk }; lsSet(STR_BEST_KEY, best); }
      msg = "ランク <b>" + rk + "</b>（正確さ " + Math.round(acc * 100) + "%）・最大コンボ " + maxCombo + "・キープ " + keeps + " / " + rn.length + (counts[3] === 0 ? "・&#x1F525; フルコンボ +500" : "") +
        "<br>PERFECT " + counts[0] + " / GREAT " + counts[1] + " / GOOD " + counts[2] + " / MISS " + counts[3];
      var td = B.tendency ? B.tendency(offs) : null;
      if (td) { msg += "<br>" + td.text; }
      render();
      api.gameOver("ランク " + rk);
    }
    function render() {
      if (!panel) { return; }
      panel.innerHTML = '<p class="small" style="margin:4px 0 0;">&#x1F3AE; ' + escHtml(song[1]) + '（' + strOpt(STR_RLEVELS, level)[1] + '・BPM ' + Math.round(song[5] * rate) + '・' + rn.length + '音・' + ins[1] + '）</p>' +
        '<p class="small" style="margin:4px 0 0;">音符の頭が線に来たら、そのコードのレーンを押して、音符のおわりまで押しつづける（キープでボーナス。キー 1〜' + nL + '）</p>' +
        (msg ? '<p class="small" style="margin:4px 0 0;color:#ffd166;">' + msg + '</p>' : "");
    }
    render();
    function text(ctx, s, x, y, size, color) { ctx.fillStyle = color; ctx.font = "bold " + (land ? Math.max(4, size * 0.6) : size) + "px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(s, x, y); }
    var TOP = land ? 12 : 26, HIT = land ? STR_H - 18 : STR_H - 50, LW = (W - 8) / nL, LOOK = land ? 1.2 : 2.0;
    return {
      input: function (a, down) {
        var mk = /^c(\d)$/.exec(a);
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
        // 音符のおわりまで押していたら自動でキープ（音も止める）
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
        ctx.fillRect(0, 0, W, STR_H);
        hudText(ctx, "🎮 " + song[1], 8, land ? 6 : 10, "left");
        hudText(ctx, "コンボ " + combo, W - 8, land ? 6 : 10, "right");
        var t = now() - LAT, k;
        for (k = 0; k < nL; k++) {
          var x = 4 + k * LW;
          ctx.fillStyle = laneFlash[k] > 0 ? "rgba(255,209,102,0.25)" : (k % 2 ? "#232a4d" : "#1f2546");
          ctx.fillRect(x + 1, TOP, LW - 2, STR_H - TOP);
          text(ctx, cnames[k] + (land || nL >= 5 ? "" : "（" + (k + 1) + "）"), x + LW / 2, HIT + (land ? 9 : 28), 13, "#adb5bd");
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
          ctx.fillStyle = held0 ? "rgba(255,209,102,0.6)" : (n.j >= 0 ? "rgba(116,192,252,0.25)" : "rgba(116,192,252,0.45)");
          ctx.fillRect(nx + LW * 0.3, Math.max(TOP, yT), LW * 0.4, Math.min(HIT, yH) - Math.max(TOP, yT)); // のばす所
          if (n.j === -2 && yH <= HIT + 6) { ctx.fillStyle = "#74c0fc"; ctx.fillRect(nx + 6, yH - (land ? 4 : 9), LW - 12, land ? 8 : 18); text(ctx, n.name, nx + LW / 2, yH, 12, "#14213d"); }
        }
        var c0 = Math.ceil((t0 - now()) / spb);
        if (now() < t0 && c0 >= 1 && c0 <= meter) { text(ctx, String(c0), W / 2, STR_H / 2 - 20, 40, "#ffd166"); }
        if (judgeFrames > 0) { text(ctx, judgeText, W / 2, HIT - 40, 20, judgeText === "MISS" ? "#ff6b6b" : "#ffd166"); }
      }
    };
  }

  // コードは 1〜7（合奏コードは押しているあいだ）、Z 録音・X 再生
  var STR_KEYS = { "1": "c0", "2": "c1", "3": "c2", "4": "c3", "5": "c4", "6": "c5", "7": "c6", z: "rec", x: "play", b: "pat" };

  I.register({
    id: "strings",
    after: "guitar",
    cat: "music",
    music: true,
    name: "ゴリラストリングス",
    icon: "&#x1F3BB;",
    desc: "バイオリン・ビオラ・チェロ・コントラバス・合奏・ハープ。弓でこすって音をのばす",
    help: "🎮 リズムゲームは音符の頭で押して、おわりまで押しつづける（1〜）/ ソロ: 左手で指板を押さえて、右の「弓」の所をこする（速いほど大きい）/ 合奏コード: ボタンを押しているあいだ和音がのびる（1〜7）/ B パターン / Z 録音 / X 再生 / P一時停止",
    controls: [],
    keys: STR_KEYS,
    setup: strSetup,
    setupLabel: "楽器・テイク",
    panel: true,
    create: function (api, cfg) {
      cfg = cfg || {};
      if (cfg.mode === "rhythm") { return strRhythm(api, cfg); } // §303
      var B = BA(), prefs = strPrefs(), view = prefs.view, names = prefs.names;
      var frame = 0, msg = "", panel = api.panel, flash = {};
      if (panel && panel.classList) { panel.classList.add("quiz-panel"); }
      function inst() { return strOpt(STR_INSTS, prefs.inst); }
      function bowing() { return inst()[4] && prefs.bow && view === "solo"; }
      // §303: よこ向き・持ち方
      function applyLand() {
        if (api.setLandscape) { api.setLandscape(prefs.land); }
        var box = panel && panel.parentNode;
        strLayout(bowing(), { land: prefs.land, h: prefs.land && box && B.landH ? B.landH(box.clientWidth, box.clientHeight) : 130 });
        if (api.setCanvasHeight) { api.setCanvasHeight(STR_H); }
      }
      applyLand();
      function now() { return frame / 60; }

      // --- 音 ---
      var UG = window.UGMelody, audioOk = false, buses = {};
      // §316: 画面を開いたら、楽器（合奏の編成ならパートぜんぶ）の録音を先に読みはじめる
      function progsNow() { return [inst()[2], 33].concat(prefs.orch.on ? prefs.orch.parts.map(function (p) { return strOpt(STR_INSTS, p.inst)[2]; }) : []); }
      try { if (UG && UG.prefetchSamples) { UG.prefetchSamples(progsNow()); } } catch (e0) {}
      function audio() {
        if (audioOk || !UG || !UG.audioInit) { return; }
        try { if (UG.audioInit()) { audioOk = true; UG.loadSamples(progsNow().concat([45])); } } catch (e) {}
      }
      function preload(progs) { try { if (audioOk) { UG.loadSamples(progs); } else if (UG && UG.prefetchSamples) { UG.prefetchSamples(progs); } } catch (e) {} }
      function out() { return audioOk && B.bus ? B.bus(buses, "s", prefs.svol, false) : null; }
      function click(accent) { if (audioOk) { try { UG.synth(accent ? 37 : 42, UG.DRUM, 0, accent ? 0.9 : 0.6); } catch (e) {} } }
      // id ごとに鳴っている音 { v, m（録音する半音）}
      var vo = {};
      // id の音を m（小数可）・大きさ lv で鳴らしはじめる
      // ins（省略可）: §304 編成のパートの楽器。norec: 録音しない（人数ぶん重ねる音）
      function noteOn(id, m, lv, att, ins, norec) {
        audio();
        noteOff(id, 0.08);
        ins = ins || inst();
        var v = strVoice(ins[2], m, out(), 0);
        if (!v) { vo[id] = { v: null, m: Math.round(m) }; if (!norec) { recOn(id, Math.round(m), lv || 0.8, 0, ins[0]); } return; }
        strLevel(v, lv, att || 0.06);
        if (prefs.vib && ins[4]) { strVibrato(v, true); }
        vo[id] = { v: v, m: Math.round(m) };
        if (!norec) { recOn(id, Math.round(m), lv || 0.8, 0, ins[0]); } // 弓はこすりはじめ 0 なので、録音はふつうの強さ
      }
      function noteOff(id, rel) { var o = vo[id]; if (!o) { return; } strStop(o.v, rel); delete vo[id]; recOff(id); }
      // 音程を変える（録音は半音が変わったら区切る）
      function notePitch(id, m) {
        var o = vo[id];
        if (!o) { return; }
        strPitch(o.v, m, 0.05);
        if (Math.round(m) !== o.m && rec) { var lv = rec.open[id] ? rec.open[id][2] : 0.8, oi = rec.open[id] ? rec.open[id][3] : prefs.inst; recOff(id); o.m = Math.round(m); recOn(id, o.m, lv, 0, oi); }
        else { o.m = Math.round(m); }
      }
      // はじく（ピチカート・ハープ）
      // prog（省略可）: §302 ほかの音色ではじく（弓の楽器のピチカートのパターン）
      function pluck(m, lv, dt, prog, norec) {
        audio();
        var ac = audioOk && UG.audio ? UG.audio.ctx : null, bus = out();
        if (!ac || !bus) { return; }
        try { var g = ac.createGain(); g.gain.value = (lv || 0.8) * STR_LEVEL * 0.6; g.connect(bus); UG.synth(Math.round(m), prog || inst()[2], ac.currentTime + (dt || 0), lv || 0.8, g, 0); } catch (e) {}
        if (rec && !norec) { var id = "k" + Math.random(), pins = prefs.inst, q; for (q = 0; q < STR_INSTS.length; q++) { if (STR_INSTS[q][2] === (prog || inst()[2])) { pins = STR_INSTS[q][0]; } } recOn(id, Math.round(m), lv || 0.8, dt || 0, pins); recOff(id); }
      }

      // --- 録音・再生 ---
      var bpm = prefs.bpm, meter = 4, metro = prefs.metro, takes = strTakesLoad();
      var take = cfg.take ? strTakeById(takes, cfg.take) : null, rec = null, play = null;
      if (take) { msg = "「" + escHtml(take.name) + "」をひらきました。▶ 再生で聴けます"; }
      // §302: 伴奏（シーケンサーの曲）。bk ＝ 鳴らしているあいだ
      var back = cfg.backing && B.backing ? B.backing(cfg.backing) : null, bk = null;
      if (back) { bpm = back.seq.bpm; meter = back.seq.meter; if (!take) { msg = "&#x1F3B8; 伴奏に合わせて弾こう。合奏コードは曲のコードになります"; } }
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
        try {
          ids = U.trackIds(back.s.tracks);
          for (i = 0; i < ids.length; i++) { if (back.s.tracks[ids[i]].on && back.s.tracks[ids[i]].prog !== undefined) { progs.push(back.s.tracks[ids[i]].prog); } }
          UG.loadSamples(progs);
        } catch (e0) {}
        if (U.fxPush) { try { U.fxPush(back.seq); bk.fx = true; } catch (e) {} }
      }
      function backStop() {
        if (!bk) { return; }
        var U = backApi();
        if (bk.fx && U && U.fxPop) { try { U.fxPop(); } catch (e) {} }
        if (U && U.susStop) { try { U.susStop(); } catch (e9) {} } // §315: のばしている弦・管の音を消す
        bk = null;
        if (pat && pat.back) { patStop(); }
      }
      function backStep() {
        var S0 = back.s, t = backT(), U = backApi(), ac = audioOk && UG.audio ? UG.audio.ctx : null, ev;
        while (bk.idx < S0.events.length && (ev = S0.events[bk.idx]).t <= t + 0.1) {
          if (ac && U && B.backEventOn(ev, back.seq, S0.lead, false)) {
            try {
              if (!bk.mix) { bk.mix = U.mixer(UG, ac, S0.tracks); }
              U.seqPlayEvent(UG, ac, ev, ac.currentTime + Math.max(0, ev.t - t), back.lowG, 0.55, bk.outs, bk.mix, S0.tracks);
            } catch (e) {}
          }
          bk.idx++;
        }
        if (t >= S0.time) { if (rec) { recStop(); } backStop(); if (play) { playStop(); } render(); }
      }
      function backToggle() { if (bk) { if (rec) { recStop(); } backStop(); playStop(); } else { backStart(0); } render(); }
      // 伴奏の拍 beat（省略は いま）の曲のコードの番号（伴奏なしは -1）
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
      // ins（省略可）: §305 楽器の id（パートごとに分けて残す）
      function recOn(id, m, v, dt, ins) {
        if (!rec) { return; }
        var b = recBeat() + (dt || 0) * bpm / 60;
        if (b < -0.25 || rec.notes.length >= STR_NOTES_MAX) { return; }
        rec.open[id] = [Math.max(0, b), m, Math.min(1, v || 0.8), ins || prefs.inst];
      }
      function recOff(id) {
        if (!rec || !rec.open[id]) { return; }
        var o = rec.open[id];
        delete rec.open[id];
        var nt = [r3(o[0]), r3(Math.max(0.0625, recBeat() - o[0])), o[1]];
        if (o[2] !== 0.8) { nt.push(r3(Math.max(0.1, o[2]))); }
        rec.notes.push(nt);
        rec.insts.push(o[3]);
      }
      function recStop() {
        var ks = [], k;
        for (k in rec.open) { if (rec.open.hasOwnProperty(k)) { ks.push(k); } }
        for (k = 0; k < ks.length; k++) { recOff(ks[k]); }
        var n = rec.notes, wasBack = rec.back, byInst = {}, order = [], q;
        // §305: 楽器ごとに分ける（2つ以上ならパート）
        for (q = 0; q < n.length; q++) { var ii = rec.insts[q] || prefs.inst; if (!byInst[ii]) { byInst[ii] = []; order.push(ii); } byInst[ii].push(n[q]); }
        rec = null;
        if (wasBack) { backStop(); }
        if (n.length) {
          take = strTakeAdd(takes, { bpm: bpm, meter: meter, inst: order.length === 1 ? order[0] : prefs.inst, notes: n, parts: order.length >= 2 ? order.map(function (k0) { return { inst: k0, notes: byInst[k0] }; }) : undefined });
          strTakesSave(takes);
          msg = "&#x1F4BE; 「" + escHtml(take.name) + "」に保存しました（" + take.notes.length + "音）<br>はじめの画面の「🎸 送る」でシーケンサーに入れられます";
        } else { msg = "音がなかったので保存しませんでした"; }
        render();
      }
      function playBeat() { return play ? (play.back ? backBeat() : (now() - play.t0) * play.bpm / 60) : 0; }
      function playStop() {
        if (!play) { return; }
        var wasBack = play.back;
        for (var i = 0; i < play.vo.length; i++) { strStop(play.vo[i].v, 0.15); }
        play = null;
        if (wasBack) { backStop(); }
      }
      function playToggle() {
        if (play) { playStop(); render(); return; }
        if (rec) { return; }
        if (!take || !take.notes.length) { msg = "まだテイクがありません。🔴 録音で録ってね"; render(); return; }
        audio();
        if (back) { backStart(0); }
        play = { back: !!back, t0: now() + 0.1, bpm: take.bpm, notes: strPlayList(take), idx: 0, vo: [] };
        render();
      }

      // --- コード ---
      var chordD = 0;
      function chordObj(d) { return B.chord(prefs.key, d, prefs.scale, prefs.sev); }
      // 拍 beat（省略は いま）に鳴らすコード（伴奏なら曲のコード）とその 7th か
      function chordAt(beat) { var k = songIdx(beat); return k >= 0 ? back.chords[k].ch : chordObj(chordD); }
      function sevAt(beat) { var k = songIdx(beat); return k >= 0 ? /(7|9|11|13)/.test(String(back.chords[k].name).split("/")[0]) : prefs.sev; }
      var held = {}; // 合奏コード: 指・キー → ボタン
      // d: ボタン（-1 ＝ 伴奏の曲のいまのコード）
      function chordOn(id, d) {
        audio();
        if (pat && d >= 0) { pend = d; flash["c" + d] = 10; render(); return; } // §302: パターン中は次の小節の頭で
        chordOff(id);
        if (d >= 0) { chordD = d; flash["c" + d] = 10; if (prefs.cprog) { prefs.cprog = ""; strSavePrefs(prefs); } }
        var ns = chordNotes(d >= 0 ? chordObj(d) : chordAt(), d >= 0 ? prefs.sev : sevAt()), i, j;
        held[id] = { d: d, ids: [] };
        for (i = 0; i < ns.length; i++) {
          var ins = strOpt(STR_INSTS, ns[i].inst);
          for (j = 0; j < ns[i].n; j++) {
            if (ins[4]) { var nid = id + ":" + i + ":" + j; noteOn(nid, ns[i].m + STR_DETUNE[j], 0.55 / Math.sqrt(ns[i].n), 0.12 + j * 0.03, ins, j > 0); held[id].ids.push(nid); }
            else { pluck(ns[i].m + STR_DETUNE[j], 0.7, i * 0.035 + j * 0.012, ins[2], j > 0); }
          }
        }
        render();
      }
      // §304: コードを鳴らす音 [{ inst, m, n }]（編成 ON なら編成・OFF ならいまの楽器で和音）
      function chordNotes(ch, sev) {
        if (prefs.orch.on) { return strOrchNotes(ch, sev, prefs.orch.parts); }
        return strVoicing(ch, inst()[3][0], sev).map(function (m) { return { inst: prefs.inst, m: m, n: 1 }; });
      }
      function chordOff(id) { var h = held[id]; if (!h) { return; } for (var i = 0; i < h.ids.length; i++) { noteOff(h.ids[i], 0.4); } delete held[id]; }

      // --- §302: パターン（合奏・ドラム・ベース）---
      var pat = null, pend = -1, pvn = 0;
      function patTime(b) { return pat.back ? now() + (back.s.tm(b) - backT()) : pat.t0 + b * 60 / bpm; }
      function patDef() { var d = strPat(prefs.pat); return d[3] === meter ? d : strPat(meter === 3 ? "waltz" : "hold"); }
      function patStart() {
        patStop();
        audio();
        if (back && !bk) { backStart(0); }
        var d = patDef();
        pat = { back: !!(back && bk), t0: rec && !rec.back ? rec.t0 : now() + 0.1, k: 0, d: d, unit: d[3] / d[2].length, dk: 0, bk: 0, bvo: null, lastBar: -1, vo: [] };
        if (pat.back) { pat.k = Math.max(0, Math.ceil(backBeat() / pat.unit - 1e-6)); }
        drumInit();
      }
      function patRelease(when) { for (var i = 0; i < pat.vo.length; i++) { strStop(pat.vo[i].v, 0.12, when); recOff(pat.vo[i].id); } pat.vo = []; }
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
      function nextChord(b) {
        var cp = B.cprog(prefs.cprog);
        if (pend >= 0) { return chordObj(pend); }
        return cp ? chordObj(B.cprogAt(cp, b, meter).next) : null;
      }
      function barChordAhead(b) { var cp = B.cprog(prefs.cprog); if (pend >= 0) { return pend; } return cp ? B.cprogAt(cp, b, meter).d : chordD; }
      function patStep() {
        var d = pat.d, pt = d[2], unit = pat.unit, per = pt.length / d[3], n = 0, ac = audioOk && UG.audio ? UG.audio.ctx : null, spb = pat.back ? back.s.spb : 60 / bpm, ins = inst(), i;
        while (pat && n++ < 32) {
          var b = pat.k * unit, ci = pat.k % pt.length, sb = b + B.swingOf(prefs.swing, per, ci) * unit, dt = patTime(sb) - now();
          if (dt > 0.1 || (pat.back && b >= back.s.beats - 1e-6)) { break; }
          pat.k++;
          if (ci === 0 && !pat.back) { barChord(b); }
          if (dt < -0.05) { continue; }
          var c = pt.charAt(ci);
          if (c === "-") { continue; }
          // §304: 編成 ON なら編成の音（パートの楽器・人数）
          var dd = Math.max(0, dt), when = ac ? ac.currentTime + dd : 0, ns = chordNotes(pat.back ? chordAt(b) : chordObj(chordD), pat.back ? sevAt(b) : prefs.sev), j;
          var vs = ns.map(function (x) { return x.m; }), anyBow = prefs.orch.on || ins[4];
          patRelease(when);
          if (c === "P" || ((c === "S" || c === "E") && !anyBow)) { for (i = 0; i < vs.length; i++) { pluck(vs[i], 0.7, dd + i * 0.02, anyBow ? 45 : 0); } continue; }
          if ("abcde".indexOf(c) >= 0) { pluck(vs[Math.min("abcde".indexOf(c), vs.length - 1)], 0.75, dd, anyBow ? 45 : 0); continue; }
          var sel = c === "S" || c === "E" ? ns : [c === "B" ? ns[0] : ns[Math.min(Number(c) - 1, ns.length - 1)]];
          for (i = 0; i < sel.length; i++) {
            var pi = strOpt(STR_INSTS, sel[i].inst), lv = (c === "E" ? 0.6 : 0.45) / Math.sqrt(sel[i].n);
            for (j = 0; j < sel[i].n; j++) {
              if (!pi[4]) { pluck(sel[i].m + STR_DETUNE[j], 0.75, dd + j * 0.012, pi[2], j > 0); continue; }
              var v = strVoice(pi[2], sel[i].m + STR_DETUNE[j], out(), when + j * 0.012), id = "pv" + (pvn++);
              strLevel(v, lv, c === "E" ? 0.01 : 0.08, when + j * 0.012);
              if (c === "E") { strStop(v, 0.06, when + unit * spb * 0.5); }
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
          var s0 = pat.dk % dd.len, sw = (bper === 2 && s0 % 4 === 2) || (bper === 4 && s0 % 2 === 1) ? strOpt(B.SWINGS, prefs.swing)[2] * pat.unit : 0;
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

      // --- ソロ: 左手（指 → { sn, semi }）と弓（指 → { r, y, x, f, lv }）---
      var left = {}, bows = {};
      // 弦 sn の音（押さえていなければ開放弦。いちばん高い所を押さえている指）
      function stringNote(sn) {
        var best = null, k;
        for (k in left) { if (left.hasOwnProperty(k) && left[k].sn === sn && (best === null || left[k].semi > best)) { best = left[k].semi; } }
        var semi = best === null ? 0 : Math.max(0, best);
        if (prefs.snap) { semi = Math.round(semi); }
        return inst()[3][sn] + semi;
      }
      // 左手が変わったら、その弦を弾いている音の音程を変える
      function leftChanged(sn) {
        var k;
        for (k in bows) { if (bows.hasOwnProperty(k) && strSnOfRow(bows[k].r) === sn) { notePitch("b" + k, stringNote(sn)); } }
        for (k in left) { if (left.hasOwnProperty(k) && left[k].sn === sn && vo["t" + k]) { notePitch("t" + k, stringNote(sn)); } }
      }
      function allOff() {
        var k, ks = [];
        for (k in vo) { if (vo.hasOwnProperty(k)) { ks.push(k); } }
        for (k = 0; k < ks.length; k++) { noteOff(ks[k], 0.1); }
        left = {}; bows = {}; held = {};
      }

      // --- パネル ---
      var METRO = B.METRO_ICON || "&#x23F1;&#xFE0F;";
      function scaleOptions() {
        var h = "", gs = B.SCALE_GROUPS || [["", B.SCALES.map(function (s) { return s[0]; })]], i, j;
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
        else if (v === "metro") { metro = !metro; prefs.metro = metro; strSavePrefs(prefs); render(); }
        else if (v === "bpmdown" || v === "bpmup") {
          if (rec || back) { return; }
          var pcb = pat ? (now() - pat.t0) * bpm / 60 : 0;
          bpm = Math.max(40, Math.min(240, bpm + (v === "bpmup" ? 5 : -5)));
          if (pat) { pat.t0 = now() - pcb * 60 / bpm; }
          prefs.bpm = bpm; strSavePrefs(prefs); render();
        }
        else if (/^view:/.test(v)) { allOff(); view = prefs.view = v.substring(5) === "chord" ? "chord" : "solo"; strSavePrefs(prefs); applyLand(); render(); }
        else if (/^inst:/.test(v)) { allOff(); prefs.inst = strOpt(STR_INSTS, v.substring(5))[0]; strSavePrefs(prefs); applyLand(); preload([inst()[2]]); render(); }
        else if (/^tab:/.test(v)) { var tb0 = v.substring(4); prefs.tab = ["play", "pat", "band", "key"].indexOf(tb0) >= 0 ? tb0 : "play"; strSavePrefs(prefs); render(); }
        // §302
        else if (v === "pat") { patToggle(); }
        else if (v === "back") { backToggle(); }
        else if (/^spat:/.test(v)) { prefs.pat = strPat(v.substring(5))[0]; strSavePrefs(prefs); if (pat) { patRetime(); } render(); }
        else if (v === "swing") { var sl = B.SWINGS, si = 0, q; for (q = 0; q < sl.length; q++) { if (sl[q][0] === prefs.swing) { si = q; } } prefs.swing = sl[(si + 1) % sl.length][0]; strSavePrefs(prefs); render(); }
        else if (/^cprog:/.test(v)) { prefs.cprog = B.cprog(v.substring(6)) ? v.substring(6) : ""; strSavePrefs(prefs); render(); }
        else if (/^drum:/.test(v)) { prefs.drum = v.substring(5); drumCache = null; strSavePrefs(prefs); if (pat) { patRetime(); } render(); }
        else if (/^bpat:/.test(v)) { prefs.bpat = v.substring(5); strSavePrefs(prefs); if (pat) { patRetime(); } render(); }
        else if (/^[sbd]vol:[+-]$/.test(v)) {
          var vk = v.charAt(0) + "vol";
          prefs[vk] = Math.max(0, Math.min(STR_VOL_MAX, prefs[vk] + (v.charAt(5) === "+" ? STR_VOL_STEP : -STR_VOL_STEP)));
          strSavePrefs(prefs);
          B.bus(buses, v.charAt(0), prefs[vk], false);
          render();
        }
        else if (v === "bow" || v === "snap" || v === "vib") { allOff(); prefs[v] = !prefs[v]; strSavePrefs(prefs); applyLand(); render(); }
        // §304: 編成
        else if (v === "orch") { allOff(); prefs.orch.on = !prefs.orch.on; strSavePrefs(prefs); preload(progsNow()); render(); }
        else if (/^orchp:/.test(v)) { allOff(); var pid0 = v.substring(6); if (pid0) { prefs.orch.preset = strOpt(STR_ORCH_PRESETS, pid0)[0]; prefs.orch.parts = strPresetParts(prefs.orch.preset); } strSavePrefs(prefs); preload(progsNow()); render(); }
        else if (v === "parts:+" || v === "parts:-") {
          allOff();
          var pa = prefs.orch.parts;
          if (v === "parts:+" && pa.length < STR_ORCH_MAX) { pa.push({ inst: pa.length ? pa[pa.length - 1].inst : "violin", n: 1 }); }
          if (v === "parts:-" && pa.length > 1) { pa.pop(); }
          prefs.orch.preset = ""; strSavePrefs(prefs); render();
        }
        else if (/^pi:\d:/.test(v)) { allOff(); var pk = Number(v.charAt(3)); if (prefs.orch.parts[pk]) { prefs.orch.parts[pk].inst = strOpt(STR_INSTS, v.substring(5))[0]; prefs.orch.preset = ""; strSavePrefs(prefs); } render(); }
        else if (/^pn:\d:[+-]$/.test(v)) { allOff(); var pk2 = Number(v.charAt(3)), pp = prefs.orch.parts[pk2]; if (pp) { pp.n = Math.max(1, Math.min(STR_PLAYERS_MAX, pp.n + (v.charAt(5) === "+" ? 1 : -1))); prefs.orch.preset = ""; strSavePrefs(prefs); } render(); }
        else if (v === "land") { allOff(); prefs.land = !prefs.land; strSavePrefs(prefs); applyLand(); render(); }
        else if (/^grip:/.test(v)) { allOff(); B.gripStep(v.substring(5)); applyLand(); render(); }
        else if (v === "posdown" || v === "posup") { allOff(); prefs.pos = Math.max(0, Math.min(STR_POS_MAX, prefs.pos + (v === "posup" ? 1 : -1))); strSavePrefs(prefs); render(); }
        else if (v === "keydown" || v === "keyup") { prefs.key = (prefs.key + (v === "keyup" ? 1 : 11)) % 12; strSavePrefs(prefs); render(); }
        else if (v === "sev") { prefs.sev = !prefs.sev; strSavePrefs(prefs); render(); }
        else if (/^scale:/.test(v)) { prefs.scale = B.scale(v.substring(6))[0]; strSavePrefs(prefs); render(); }
      }
      function patOptions() {
        var h = "", i;
        for (i = 0; i < STR_PATS.length; i++) { if (STR_PATS[i][3] === meter) { h += '<option value="' + STR_PATS[i][0] + '"' + (STR_PATS[i][0] === prefs.pat ? " selected" : "") + '>' + escHtml(STR_PATS[i][1]) + '</option>'; } }
        return h;
      }
      function cprogOptions() {
        var h = '<option value=""' + (prefs.cprog ? "" : " selected") + '>コード進行なし（コードのボタンで）</option>', gs = B.CPROG_GROUPS || [], i, j;
        for (i = 0; i < gs.length; i++) {
          h += '<optgroup label="' + escHtml(gs[i][0]) + '">';
          for (j = 0; j < gs[i][1].length; j++) { var cp = B.cprog(gs[i][1][j]); if (cp) { h += '<option value="' + cp[0] + '"' + (cp[0] === prefs.cprog ? " selected" : "") + '>' + escHtml(cp[1]) + '</option>'; } }
          h += '</optgroup>';
        }
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
        for (i = 0; i < gs.length; i++) {
          h += '<optgroup label="' + escHtml(gs[i][0]) + '">';
          for (j = 0; j < gs[i][1].length; j++) { var p0 = gs[i][1][j]; if (p0[3] === meter) { h += '<option value="' + p0[0] + '"' + (p0[0] === prefs.bpat ? " selected" : "") + '>' + escHtml(p0[1]) + '</option>'; } }
          h += '</optgroup>';
        }
        return h;
      }
      function render() {
        if (!panel) { return; }
        var html = "", i, ins = inst();
        html += '<div class="piano-row"><button class="modal-btn' + (rec ? " piano-rec-on" : "") + '" data-sa="rec">' + (rec ? "&#x23F9;&#xFE0F; 録音をとめる" : "&#x1F534; 録音") + '</button>' +
          '<button class="modal-btn' + (play ? " piano-rec-on" : "") + '" data-sa="play"' + (rec ? " disabled" : "") + '>' + (play ? "&#x23F9;&#xFE0F; とめる" : "&#x25B6;&#xFE0F; 再生") + '</button>' +
          '<button class="modal-btn' + (pat ? " piano-rec-on" : "") + '" data-sa="pat">' + (pat ? "&#x23F9;&#xFE0F; パターン" : "&#x25B6;&#xFE0F; パターン") + '</button></div>' +
          (back ? '<div class="piano-row"><button class="modal-btn" data-sa="back"' + (rec ? " disabled" : "") + '>' + (bk && !play && !rec ? "&#x23F9;&#xFE0F; 伴奏をとめる" : "&#x1F3B8; 伴奏だけ鳴らす") + '</button>' +
            '<button class="modal-btn" data-sa="metro" title="録音のメトロノーム">' + METRO + ' ' + (metro ? "ON" : "OFF") + '</button></div>' +
            '<p class="small" style="margin:4px 0 0;">&#x1F3B8; 伴奏: ' + escHtml(back.name) + '（BPM ' + back.seq.bpm + '・' + back.seq.meter + '拍子）</p>' :
          '<div class="piano-row"><button class="modal-btn" data-sa="bpmdown">&minus;</button><span>BPM ' + bpm + '</span><button class="modal-btn" data-sa="bpmup">&#xFF0B;</button>' +
          '<button class="modal-btn" data-sa="metro" title="録音のメトロノーム">' + METRO + ' ' + (metro ? "ON" : "OFF") + '</button></div>');
        var tabN = back ? 2 : 4, tab = back && (prefs.tab === "band" || prefs.tab === "key") ? "play" : prefs.tab;
        html += '<div class="piano-row">';
        for (i = 0; i < tabN; i++) { var tid = ["play", "pat", "band", "key"][i]; html += '<button class="modal-btn' + (tab === tid ? " piano-rec-on" : "") + '" data-sa="tab:' + tid + '">' + ["弾き方", "パターン", "バンド", "キー"][i] + '</button>'; }
        html += '</div>';
        if (tab === "pat") {
          html += '<div class="piano-row"><label class="piano-select">&#x1F3BC; <select data-spat="1">' + patOptions() + '</select></label></div>' +
            '<div class="piano-row"><button class="modal-btn" data-sa="swing">ハネ: ' + strOpt(B.SWINGS, prefs.swing)[1] + '</button></div>' +
            (back ? "" : '<div class="piano-row"><label class="piano-select">&#x1F501; <select data-scprog="1">' + cprogOptions() + '</select></label></div>') +
            '<p class="small" style="margin:4px 0 0;">&#x1F3BC; ' + escHtml(patDef()[2]) + '（S のばす・E 刻む・P ピチカートの和音・a〜e ピチカートの1音・1〜5 和音の1音・B 低い音・- のばす）<br>' +
            (back ? "コードは曲に合わせて変わります。" : prefs.cprog ? "コードは進行どおり1小節ごとに変わります。" : "パターン中にコードのボタンを押すと、次の小節の頭で変わります。") + '</p>';
        } else if (tab === "band") {
          html += '<div class="piano-row"><label class="piano-select">&#x1F941; <select data-sdrum="1">' + drumOptions() + '</select></label></div>' +
            '<div class="piano-row"><label class="piano-select">&#x1F3B8; <select data-sbpat="1">' + bpatOptions() + '</select></label></div>';
          var vols = [["s", "ストリングス"], ["b", "ベース"], ["d", "ドラム"]];
          for (i = 0; i < 3; i++) { html += '<div class="piano-row"><span>&#x1F50A; ' + vols[i][1] + '</span><button class="modal-btn" data-sa="' + vols[i][0] + 'vol:-">－</button><span>' + prefs[vols[i][0] + "vol"] + '%</span><button class="modal-btn" data-sa="' + vols[i][0] + 'vol:+">＋</button></div>'; }
          html += '<p class="small" style="margin:4px 0 0;">▶ パターンのあいだ、ドラムとベースもいっしょに鳴ります</p>';
        } else if (tab === "key") {
          html += '<div class="piano-row"><button class="modal-btn" data-sa="keydown">&#x25C0;</button><span>キー ' + STR_CDE[prefs.key] + '</span><button class="modal-btn" data-sa="keyup">&#x25B6;</button>' +
            '<button class="modal-btn" data-sa="sev">' + (prefs.sev ? "7th" : "3和音") + '</button></div>' +
            '<div class="piano-row"><label class="piano-select">&#x1F3B5; <select data-sscale="1">' + scaleOptions() + '</select></label></div>';
        } else {
          html += '<div class="piano-row">';
          for (i = 0; i < STR_VIEWS.length; i++) { html += '<button class="modal-btn' + (view === STR_VIEWS[i][0] ? " piano-rec-on" : "") + '" data-sa="view:' + STR_VIEWS[i][0] + '">' + STR_VIEWS[i][1] + '</button>'; }
          html += '<button class="modal-btn' + (prefs.land ? " piano-rec-on" : "") + '" data-sa="land">&#x1F4F1; ' + (prefs.land ? "たて向き" : "よこ向き") + '</button>';
          html += '</div>' + (prefs.land && B.gripRows ? B.gripRows("sa") : "") + '<div class="piano-opts">';
          for (i = 0; i < STR_INSTS.length; i++) { html += '<button class="modal-btn quiz-opt' + (prefs.inst === STR_INSTS[i][0] ? " active" : "") + '" data-sa="inst:' + STR_INSTS[i][0] + '">' + STR_INSTS[i][1] + '</button>'; }
          html += '</div>';
          if (view === "chord") {
            // §304: 編成
            var oc = prefs.orch, po = '<option value=""' + (oc.preset ? "" : " selected") + '>じぶんで</option>', q;
            for (q = 0; q < STR_ORCH_PRESETS.length; q++) { po += '<option value="' + STR_ORCH_PRESETS[q][0] + '"' + (oc.preset === STR_ORCH_PRESETS[q][0] ? " selected" : "") + '>' + escHtml(STR_ORCH_PRESETS[q][1]) + '</option>'; }
            html += '<div class="piano-row"><button class="modal-btn' + (oc.on ? " piano-rec-on" : "") + '" data-sa="orch">&#x1F3BB; 編成: ' + (oc.on ? "ON" : "OFF（いまの楽器だけ）") + '</button></div>';
            if (oc.on) {
              html += '<div class="piano-row"><label class="piano-select">&#x1F3BC; <select data-sorch="1">' + po + '</select></label></div>' +
                '<div class="piano-row"><span>パートの数</span><button class="modal-btn" data-sa="parts:-">－</button><span>' + oc.parts.length + '</span><button class="modal-btn" data-sa="parts:+">＋</button></div>';
              for (q = 0; q < oc.parts.length; q++) {
                var io0 = "", qi;
                for (qi = 0; qi < STR_INSTS.length; qi++) { io0 += '<option value="' + STR_INSTS[qi][0] + '"' + (STR_INSTS[qi][0] === oc.parts[q].inst ? " selected" : "") + '>' + escHtml(STR_INSTS[qi][1].replace(/&#x[0-9A-F]+;\s*/g, "")) + '</option>'; }
                html += '<div class="piano-row"><label class="piano-select">' + (q + 1) + ' <select data-spi="' + q + '">' + io0 + '</select></label>' +
                  '<button class="modal-btn" data-sa="pn:' + q + ':-">－</button><span>' + oc.parts[q].n + '人</span><button class="modal-btn" data-sa="pn:' + q + ':+">＋</button></div>';
              }
              html += '<p class="small" style="margin:4px 0 0;">3パート以上は、低い楽器から ルート・5度・3度・ルート（7th は7度）を1つずつ。2パートまではそれぞれが和音ぜんぶ。人数をふやすと少しずらして重ねて厚く</p>';
            }
          }
          if (view === "solo") {
            if (ins[4]) {
              html += '<div class="piano-row"><button class="modal-btn' + (prefs.bow ? " piano-rec-on" : "") + '" data-sa="bow">&#x1F3BB; 弓で弾く: ' + (prefs.bow ? "ON" : "OFF") + '</button>' +
                '<button class="modal-btn' + (prefs.vib ? " piano-rec-on" : "") + '" data-sa="vib">ビブラート: ' + (prefs.vib ? "ON" : "OFF") + '</button></div>';
            }
            html += '<div class="piano-row"><button class="modal-btn' + (prefs.snap ? " piano-rec-on" : "") + '" data-sa="snap">音程ガイド: ' + (prefs.snap ? "ON" : "OFF（自由）") + '</button></div>' +
              '<div class="piano-row"><button class="modal-btn" data-sa="posdown">&#x25C0;</button><span>' + (prefs.pos ? prefs.pos + "〜" + (prefs.pos + STR_COLS - 1) : "開放弦〜" + (STR_COLS - 1)) + '</span><button class="modal-btn" data-sa="posup">&#x25B6;</button></div>' +
              '<p class="small" style="margin:4px 0 0;">' + (!ins[4] ? "指板をタップするとはじく" : prefs.bow ? "左手で指板を押さえて、右の「弓」の所をこする（速いほど大きい・止めると消える）" : "指板を押しているあいだ鳴る") + '。押さえたまま横にすべらせると音程がなめらかに変わる</p>';
          } else {
            html += '<p class="small" style="margin:4px 0 0;">ボタンを押しているあいだ和音がのびる（キー 1〜7 も）</p>';
          }
        }
        if (take && !rec) { html += '<p class="small" style="margin:4px 0 0;">いまのテイク: ' + escHtml(take.name) + '（' + take.notes.length + '音・BPM ' + take.bpm + '）</p>'; }
        if (msg) { html += '<p class="small" style="margin:4px 0 0;color:#ffd166;">' + msg + '</p>'; }
        panel.innerHTML = html;
        var bs = panel.querySelectorAll ? panel.querySelectorAll("button[data-sa]") : [];
        for (i = 0; i < bs.length; i++) { bs[i].onclick = function (ev) { if (ev.currentTarget.blur) { ev.currentTarget.blur(); } action(ev.currentTarget.getAttribute("data-sa")); }; }
        var sels = [["sscale", "scale:"], ["spat", "spat:"], ["scprog", "cprog:"], ["sdrum", "drum:"], ["sbpat", "bpat:"], ["sorch", "orchp:"]];
        for (i = 0; i < sels.length; i++) {
          var sel = panel.querySelector ? panel.querySelector("select[data-" + sels[i][0] + "]") : null;
          if (sel) { sel.onchange = (function (pre) { return function (ev) { if (ev.currentTarget.blur) { ev.currentTarget.blur(); } action(pre + ev.currentTarget.value); }; })(sels[i][1]); }
        }
        var psel = panel.querySelectorAll ? panel.querySelectorAll("select[data-spi]") : [];
        for (i = 0; i < psel.length; i++) { psel[i].onchange = function (ev) { if (ev.currentTarget.blur) { ev.currentTarget.blur(); } action("pi:" + ev.currentTarget.getAttribute("data-spi") + ":" + ev.currentTarget.value); }; }
      }
      render();

      // --- 描く ---
      function text(ctx, s, x, y, size, color) { ctx.fillStyle = color; ctx.font = "bold " + (STR_LAND ? Math.max(4, size * 0.6) : size) + "px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(s, x, y); }
      function drawSolo(ctx) {
        var cw = strColW(), rh = strRowH(), top = STR_BOARD_Y, bot = STR_BOARD_BOT, ins = inst(), spc = B.scalePcs(prefs.key, prefs.scale), r, c;
        var numY = STR_LAND ? (bot + 4 <= STR_H ? bot + 3 : top - 4) : top - 7, bw0 = STR_BOW_R - STR_BOW_X;
        ctx.fillStyle = "#2b1d14";
        ctx.fillRect(STR_BOARD_X, top, STR_BOARD_R - STR_BOARD_X, bot - top);
        if (bowing()) {
          ctx.fillStyle = "#6b3f1f";
          ctx.fillRect(STR_BOW_X, top, bw0, bot - top);
          ctx.fillStyle = "#c9a227";
          ctx.fillRect(STR_MIRROR ? STR_BOW_R - 7 : STR_BOW_X + 4, top + 2, 3, bot - top - 4); // 駒（指板の側）
          text(ctx, "弓", STR_BOW_X + bw0 / 2, numY, 9, "#ffd166");
        }
        for (c = 0; c < STR_COLS; c++) {
          var f = prefs.pos + c, cx = strColX(c) + cw / 2;
          if (STR_MARKS.indexOf(f) >= 0) { ctx.fillStyle = "rgba(232,216,184,0.5)"; ctx.beginPath(); ctx.arc(cx, top + rh * 2, 3, 0, Math.PI * 2); ctx.fill(); }
          if (c > 0) { ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.fillRect(strFretX(c) - 0.5, top, 1, bot - top); }
          text(ctx, f === 0 ? "開放" : String(f), cx, numY, 8, "#adb5bd");
        }
        if (prefs.pos === 0) { ctx.fillStyle = "#f5f0e6"; ctx.fillRect(strFretX(1) - 1.5, top, 3, bot - top); }
        for (r = 0; r < 4; r++) {
          var sn = strSnOfRow(r), sy = strRowLineY(r), open = ins[3][sn];
          for (c = 0; c < STR_COLS; c++) {
            var m = open + prefs.pos + c, sx = strColX(c) + cw / 2;
            if (spc && spc[strPc(m)]) { var sk = spc[strPc(m)]; ctx.fillStyle = sk === 3 ? "#ffffff" : (sk === 2 ? "#f783ac" : "rgba(255,255,255,0.45)"); ctx.beginPath(); ctx.arc(sx, sy + rh * 0.3, sk === 1 ? 2 : 3, 0, Math.PI * 2); ctx.fill(); }
            var nm = strName(m, names);
            if (nm) { text(ctx, nm, sx, sy - rh * 0.3, 7, "rgba(255,255,255,0.55)"); }
          }
          var sounding = false, k;
          for (k in bows) { if (bows.hasOwnProperty(k) && bows[k].r === r && bows[k].lv > 0) { sounding = true; } }
          for (k in vo) { if (vo.hasOwnProperty(k) && k.charAt(0) === "t" && left[k.substring(1)] && left[k.substring(1)].sn === sn) { sounding = true; } }
          ctx.fillStyle = sounding ? "#ffe8a3" : "#cfcfcf";
          var th = 1 + sn * 0.5, wob = sounding ? Math.sin(frame * 2.1 + r) * 0.8 : 0;
          var sx0 = bowing() ? Math.min(STR_BOARD_X, STR_BOW_X) : STR_BOARD_X, sx1 = bowing() ? Math.max(STR_BOARD_R, STR_BOW_R) : STR_BOARD_R;
          ctx.fillRect(sx0, sy - th / 2 + wob, sx1 - sx0, th * (STR_LAND ? 0.7 : 1));
          if (STR_LAND) { text(ctx, STR_CDE[strPc(open)], STR_MIRROR ? W - 5.5 : 5.5, sy, 10, "#ffd166"); } else { hudText(ctx, STR_CDE[strPc(open)], 1, sy - rh * 0.3, "left"); }
        }
        // 左手の指
        for (var k2 in left) {
          if (!left.hasOwnProperty(k2)) { continue; }
          var L = left[k2], semi = prefs.snap ? Math.round(Math.max(0, L.semi)) : Math.max(0, L.semi), lx = strSemiX(semi, prefs.pos);
          ctx.fillStyle = "#ffd166"; ctx.beginPath(); ctx.arc(lx, strRowLineY(3 - L.sn), Math.min(cw, rh) * 0.3, 0, Math.PI * 2); ctx.fill();
        }
        // 弓の指
        for (var k3 in bows) {
          if (!bows.hasOwnProperty(k3)) { continue; }
          var bw = bows[k3];
          ctx.fillStyle = "rgba(255,209,102," + (0.3 + Math.min(0.7, bw.lv)) + ")";
          ctx.fillRect(STR_BOW_X + 6, strRowLineY(bw.r) - 3, bw0 - 12, 6);
        }
      }
      function drawChords(ctx) {
        if (back) {
          var k0 = songIdx(), nx = k0 >= 0 ? back.chords[k0 + 1] : null, onB = !!held["pback"];
          var by0 = STR_LAND ? 12 : 44;
          ctx.fillStyle = onB ? "#ffd166" : "#2f4a6e"; ctx.fillRect(8, by0, W - 16, STR_H - by0 - 6);
          text(ctx, k0 >= 0 ? back.chords[k0].name : "—", W / 2, (by0 + STR_H) / 2, 40, onB ? "#14213d" : "#ffd166");
          text(ctx, nx ? "→ " + nx.name : "", W / 2, (by0 + STR_H) / 2 + (STR_LAND ? 26 : 46), 16, onB ? "#14213d" : "#adb5bd");
          if (!STR_LAND) { text(ctx, "押しているあいだ曲のコードがのびる", W / 2, 60, 11, onB ? "#14213d" : "#adb5bd"); }
          return;
        }
        for (var i = 0; i < 7; i++) {
          var r = strChordRect(i), ch = chordObj(i), on = false, k;
          for (k in held) { if (held.hasOwnProperty(k) && held[k].d === i) { on = true; } }
          if (pat && i === chordD) { on = true; } // §302: パターンで鳴っているコード
          ctx.fillStyle = on ? "#ffd166" : (flash["c" + i] > 0 ? "#fff3b0" : "#2f4a6e");
          ctx.fillRect(r.x, r.y, r.w, r.h);
          if (i === pend) { ctx.strokeStyle = "#ff922b"; ctx.lineWidth = 3; ctx.strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4); ctx.lineWidth = 1; }
          text(ctx, ch.deg, r.x + r.w / 2, r.y + r.h * 0.3, 11, on ? "#14213d" : "#adb5bd");
          text(ctx, ch.name, r.x + r.w / 2, r.y + r.h * 0.6, ch.name.length > 5 ? 15 : 20, on ? "#14213d" : "#ffffff");
        }
      }
      return {
        input: function (a, down) {
          var mk = /^c([0-6])$/.exec(a);
          if (mk) {
            if (view !== "chord") { return; }
            if (down) { chordOn("key" + mk[1], Number(mk[1])); } else { chordOff("key" + mk[1]); render(); }
            return;
          }
          if (down) { action(a); }
        },
        pointer: function (type, x, y, id) {
          var pid = String(id === undefined ? 0 : id);
          if (type === "down") {
            audio();
            if (view === "chord") { if (back) { if (y > (STR_LAND ? 12 : 40)) { chordOn("pback", -1); } return; } var d = strChordAt(x, y); if (d >= 0) { chordOn("p" + pid, d); } return; }
            var ins = inst(), cell = strBoardAt(x, y, prefs.pos);
            if (cell) {
              if (!ins[4]) { pluck(ins[3][cell.sn] + Math.max(0, Math.round(cell.semi)), 0.8); return; }
              left[pid] = { sn: cell.sn, semi: cell.semi };
              if (bowing()) { leftChanged(cell.sn); }
              else { noteOn("t" + pid, stringNote(cell.sn), 0.75, 0.05); }
              return;
            }
            var br = bowing() ? strBowRow(x, y) : -1;
            if (br >= 0) { bows[pid] = { r: br, x: x, y: y, f: frame, lv: 0, still: 0 }; noteOn("b" + pid, stringNote(strSnOfRow(br)), 0, 0.05); }
          } else if (type === "move") {
            if (left[pid]) {
              var L = left[pid], rowY = strRowLineY(3 - L.sn), c2 = strBoardAt(Math.max(STR_BOARD_X, Math.min(STR_BOARD_R - 1, x)), rowY, prefs.pos);
              if (c2) { L.semi = c2.semi; leftChanged(L.sn); }
              return;
            }
            var bw = bows[pid];
            if (bw) {
              var sp = (Math.abs(x - bw.x) + Math.abs(y - bw.y)) / Math.max(1, frame - bw.f), r2 = strBowRow(Math.max(STR_BOW_X, Math.min(STR_BOW_R, x)), y);
              bw.x = x; bw.y = y; bw.f = frame;
              if (r2 >= 0 && r2 !== bw.r) { bw.r = r2; noteOff("b" + pid, 0.06); noteOn("b" + pid, stringNote(strSnOfRow(r2)), 0, 0.03); }
              var lv = strBowLevel(sp);
              if (lv > 0) { bw.lv = bw.lv * 0.5 + lv * 0.5; bw.still = 0; if (vo["b" + pid]) { strLevel(vo["b" + pid].v, bw.lv, 0.05); } }
            }
          } else {
            if (left[pid]) { var sn0 = left[pid].sn; delete left[pid]; noteOff("t" + pid, 0.15); leftChanged(sn0); return; }
            if (bows[pid]) { delete bows[pid]; noteOff("b" + pid, 0.25); return; }
            if (held["p" + pid]) { chordOff("p" + pid); render(); }
            if (held.pback) { chordOff("pback"); }
          }
        },
        step: function () {
          frame++;
          var k;
          for (k in flash) { if (flash.hasOwnProperty(k) && flash[k] > 0) { flash[k]--; } }
          // 弓が止まったら小さくなって消える
          for (k in bows) {
            if (!bows.hasOwnProperty(k)) { continue; }
            var bw = bows[k];
            if (frame - bw.f > 4) { bw.still++; if (bw.lv > 0) { bw.lv = Math.max(0, bw.lv - 0.08); if (vo["b" + k]) { strLevel(vo["b" + k].v, bw.lv, 0.08); } } }
          }
          if (pat) { patStep(); if (pat && !pat.back) { drumStep(); bassStep(); } }
          if (bk) { backStep(); }
          if (play) {
            var pb = playBeat(), last = 0, i;
            while (play.idx < play.notes.length && play.notes[play.idx][0] <= pb) {
              var pn = play.notes[play.idx], v = null;
              if (pn[4][4]) { v = strVoice(pn[4][2], pn[2], out(), 0); strLevel(v, pn[3], 0.06); }
              else { pluck(pn[2], pn[3], 0, pn[4][2], true); }
              play.vo.push({ v: v, end: pn[0] + pn[1] });
              play.idx++;
            }
            for (i = play.vo.length - 1; i >= 0; i--) { if (pb >= play.vo[i].end) { strStop(play.vo[i].v, 0.2); play.vo.splice(i, 1); } }
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
          var g = ctx.createLinearGradient ? ctx.createLinearGradient(0, 0, 0, STR_H) : null;
          if (g) { g.addColorStop(0, "#1b1f3b"); g.addColorStop(1, "#3a2318"); }
          ctx.fillStyle = g || "#1b263b";
          ctx.fillRect(0, 0, W, STR_H);
          hudText(ctx, (view === "chord" && prefs.orch.on ? "🎻 " + (prefs.orch.preset ? strOpt(STR_ORCH_PRESETS, prefs.orch.preset)[1] : "じぶんの編成") : inst()[1].replace(/&#x[0-9A-F]+;\s*/g, "")) + (back ? " ・🎸 " + (bk ? "伴奏" : back.name) : pat ? " ・🎼 " + patDef()[1] : view === "chord" ? " ・キー " + STR_CDE[prefs.key] : ""), 8, STR_LAND ? 6 : 10, "left");
          hudText(ctx, "BPM " + bpm, W - 8, STR_LAND ? 6 : 10, "right");
          if (rec) { var rb = recBeat(); text(ctx, rb < 0 ? String(Math.ceil(-rb)) : "● REC " + (Math.floor(rb / meter) + 1) + "小節・" + rec.notes.length + "音", W / 2, STR_LAND ? 6 : 28, 14, "#ff6b6b"); }
          if (view === "chord") { drawChords(ctx); return; }
          var line = [], k;
          for (k in vo) { if (vo.hasOwnProperty(k) && k.charAt(0) !== "k") { line.push(strName(vo[k].m, names === "none" ? "do" : names) + "（" + strName(vo[k].m, "cde") + "）"); } }
          if (!rec && (!STR_LAND || line.length)) { text(ctx, line.join(" ") || (play ? "再生中…" : bowing() ? "左手で押さえて、右の「弓」をこすろう" : "指板を押して弾こう"), W / 2, STR_LAND ? 6 : (line.length ? 60 : 70), line.length ? 16 : 12, line.length ? "#ffd166" : "#ffffff"); }
          drawSolo(ctx);
        }
      };
    }
  });

  window.UGStrings = {
    H: STR_H, INSTS: STR_INSTS, VIEWS: STR_VIEWS, COLS: STR_COLS, BOARD_Y: STR_BOARD_Y, BOW_X: STR_BOW_X, PREFS_KEY: STR_PREFS_KEY, TAKES_KEY: STR_TAKES_KEY, TAKES_MAX: STR_TAKES_MAX, SEQ_MAX: STR_SEQ_MAX,
    layout: strLayout, colX: strColX, geom: function () { return { H: STR_H, COLS: STR_COLS, BOARD_X: STR_BOARD_X, BOARD_R: STR_BOARD_R, BOARD_Y: STR_BOARD_Y, BOARD_BOT: STR_BOARD_BOT, BOW_X: STR_BOW_X, BOW_R: STR_BOW_R, MIRROR: STR_MIRROR, LAND: STR_LAND }; }, boardAt: strBoardAt, bowRow: strBowRow, bowLevel: strBowLevel, rowLineY: strRowLineY, chordRect: strChordRect, chordAt: strChordAt, voicing: strVoicing,
    voice: strVoice, sustains: strSustains, note: strNote, pitch: strPitch, level: strLevel, stop: strStop, vibrato: strVibrato, partsClean: strPartsClean, playList: strPlayList, ORCH_MAX: STR_ORCH_MAX, takeById: strTakeById, ORCH_PRESETS: STR_ORCH_PRESETS, orchClean: strOrchClean, orchNotes: strOrchNotes, presetParts: strPresetParts, SONGS: STR_SONGS, chart: strChart, BEST_KEY: STR_BEST_KEY, PATS: STR_PATS, pat: strPat, vol: strVol, prefs: strPrefs, notesClean: strNotesClean, takesLoad: strTakesLoad, takeAdd: strTakeAdd, sendToSeq: strSendToSeq
  };
})();
