// =========================================================
// 究極ゴリラ ゲームセンター: コードの理論エンジン（§169〜）
//   コードを「根音＋パーツ＋on（分数）」で表し、名前の読み書き・構成音・
//   ウクレレの押さえ方の自動計算・押さえた形からの名前当て・移調をする。
//   画面は持たない（arcade-ukulele.js が使う）。読み取り口 window.UGChords
// =========================================================
(function () {
  "use strict";

  var ROOTS = ["C", "C#", "D", "E♭", "E", "F", "F#", "G", "A♭", "A", "B♭", "B"];
  var LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var UKE_OPEN = [67, 60, 64, 69], UKE_OPEN_LOWG = 55;

  // パーツ（ボタンの順）
  var PARTS = [
    { id: "m", label: "m", group: "triad" }, { id: "sus2", label: "sus2", group: "triad" }, { id: "sus4", label: "sus4", group: "triad" },
    { id: "dim", label: "dim", group: "triad" }, { id: "aug", label: "aug", group: "triad" }, { id: "b5", label: "♭5", group: "triad" },
    { id: "s5", label: "♯5", group: "triad" }, { id: "pow", label: "5（パワー）", group: "triad" },
    { id: "6", label: "6", group: "4th" }, { id: "7", label: "7", group: "4th" }, { id: "M7", label: "Maj7", group: "4th" }, { id: "dim7", label: "dim7", group: "4th" },
    { id: "add9", label: "add9", group: "ten" }, { id: "9", label: "9", group: "ten" }, { id: "b9", label: "♭9", group: "ten" }, { id: "s9", label: "♯9", group: "ten" },
    { id: "11", label: "11", group: "ten" }, { id: "s11", label: "♯11", group: "ten" }, { id: "13", label: "13", group: "ten" }, { id: "b13", label: "♭13", group: "ten" }
  ];
  // 同時に選べないパーツ（新しく選んだほうを残す）
  var PART_CLASH = {
    m: ["sus2", "sus4", "dim", "pow"], sus2: ["m", "sus4", "dim", "pow"], sus4: ["m", "sus2", "dim", "pow"],
    dim: ["m", "sus2", "sus4", "aug", "b5", "s5", "pow"], aug: ["dim", "b5", "s5", "pow"], b5: ["dim", "aug", "s5", "pow"], s5: ["dim", "aug", "b5", "pow"],
    pow: ["m", "sus2", "sus4", "dim", "aug", "b5", "s5", "6", "7", "M7", "dim7", "add9", "9", "b9", "s9", "11", "s11", "13", "b13"],
    "6": ["dim7", "pow"], "7": ["M7", "dim7", "pow"], M7: ["7", "dim7", "pow"], dim7: ["6", "7", "M7", "pow"],
    add9: ["9", "pow"], "9": ["add9", "pow"], b9: ["pow"], s9: ["pow"], "11": ["s11", "pow"], s11: ["11", "pow"], "13": ["b13", "pow"], b13: ["13", "pow"]
  };
  // 辞典に並べる種類（30種類）
  var QUALITIES = [
    { id: "maj", label: "メジャー", parts: [] }, { id: "m", label: "m", parts: ["m"] }, { id: "7", label: "7", parts: ["7"] },
    { id: "maj7", label: "Maj7", parts: ["M7"] }, { id: "m7", label: "m7", parts: ["m", "7"] }, { id: "mM7", label: "mMaj7", parts: ["m", "M7"] },
    { id: "6", label: "6", parts: ["6"] }, { id: "m6", label: "m6", parts: ["m", "6"] }, { id: "dim", label: "dim", parts: ["dim"] },
    { id: "dim7", label: "dim7", parts: ["dim7"] }, { id: "m7b5", label: "m7(♭5)", parts: ["dim", "7"] }, { id: "aug", label: "aug", parts: ["aug"] },
    { id: "aug7", label: "aug7", parts: ["aug", "7"] }, { id: "sus2", label: "sus2", parts: ["sus2"] }, { id: "sus4", label: "sus4", parts: ["sus4"] },
    { id: "7sus4", label: "7sus4", parts: ["7", "sus4"] }, { id: "add9", label: "add9", parts: ["add9"] }, { id: "madd9", label: "madd9", parts: ["m", "add9"] },
    { id: "9", label: "9", parts: ["9"] }, { id: "maj9", label: "Maj9", parts: ["M7", "9"] }, { id: "m9", label: "m9", parts: ["m", "9"] },
    { id: "7b9", label: "7(♭9)", parts: ["7", "b9"] }, { id: "7s9", label: "7(♯9)", parts: ["7", "s9"] }, { id: "7s11", label: "7(♯11)", parts: ["7", "s11"] },
    { id: "7_13", label: "7(13)", parts: ["7", "13"] }, { id: "69", label: "6/9", parts: ["6", "9"] }, { id: "7b5", label: "7(♭5)", parts: ["7", "b5"] },
    { id: "7s5", label: "7(♯5)", parts: ["7", "s5"] }, { id: "11", label: "11", parts: ["11"] }, { id: "m11", label: "m11", parts: ["m", "11"] }
  ];

  function has(parts, id) { return parts.indexOf(id) >= 0; }
  function pcOf(n) { return ((n % 12) + 12) % 12; }

  // パーツ → 音程の一覧 [{ iv, role, omit }]（omit: 5音以上のとき省ける順。0 は省かない）
  function intervals(parts) {
    parts = parts || [];
    if (has(parts, "pow")) { return [{ iv: 0, role: "R", omit: 0 }, { iv: 7, role: "5", omit: 0 }]; }
    var third = 4, thirdRole = "3", fifth = 7, fifthRole = "5";
    if (has(parts, "m")) { third = 3; thirdRole = "m3"; }
    if (has(parts, "sus2")) { third = 2; thirdRole = "2"; }
    if (has(parts, "sus4")) { third = 5; thirdRole = "4"; }
    if (has(parts, "dim") || has(parts, "dim7")) { third = 3; thirdRole = "m3"; fifth = 6; fifthRole = "♭5"; }
    if (has(parts, "aug") || has(parts, "s5")) { fifth = 8; fifthRole = "♯5"; }
    if (has(parts, "b5")) { fifth = 6; fifthRole = "♭5"; }
    var out = [{ iv: 0, role: "R", omit: 2 }, { iv: third, role: thirdRole, omit: 0 }, { iv: fifth, role: fifthRole, omit: fifth === 7 ? 1 : 0 }];
    var natTen = has(parts, "9") || has(parts, "11") || has(parts, "13");
    if (has(parts, "dim7")) { out.push({ iv: 9, role: "°7", omit: 0 }); }
    else if (has(parts, "M7")) { out.push({ iv: 11, role: "7", omit: 0 }); }
    else if (has(parts, "7") || (natTen && !has(parts, "6"))) { out.push({ iv: 10, role: "♭7", omit: 0 }); }
    if (has(parts, "6")) { out.push({ iv: 9, role: "6", omit: 0 }); }
    var TEN = [["b9", 1, "♭9"], ["9", 2, "9"], ["add9", 2, "9"], ["s9", 3, "♯9"], ["11", 5, "11"], ["s11", 6, "♯11"], ["b13", 8, "♭13"], ["13", 9, "13"]];
    for (var i = 0; i < TEN.length; i++) {
      if (!has(parts, TEN[i][0])) { continue; }
      var dup = false;
      for (var k = 0; k < out.length; k++) { if (out[k].iv === TEN[i][1]) { dup = true; } }
      // 11 は 9 より先に省く（4本に入りきらないとき）
      if (!dup) { out.push({ iv: TEN[i][1], role: TEN[i][2], omit: TEN[i][0] === "11" && natTen && has(parts, "13") ? 3 : 0 }); }
    }
    return out;
  }

  // パーツ → コード名の後ろの部分（例 m7(♭5)、7(♭9,13)、maj7(9)、6/9）
  function suffix(parts) {
    parts = parts || [];
    if (has(parts, "pow")) { return "5"; }
    var m = has(parts, "m"), q = "", ten = [], numTen = "";
    var natTen = has(parts, "9") || has(parts, "11") || has(parts, "13");
    var sev7 = has(parts, "7"), implied7 = !sev7 && natTen && !has(parts, "6") && !has(parts, "M7") && !has(parts, "dim7");
    if (has(parts, "dim7")) { q = "dim7"; }
    else if (has(parts, "dim")) { q = (sev7 || implied7) ? "m7(♭5)" : "dim"; if (implied7) { implied7 = false; } }
    else if (has(parts, "aug")) { q = (sev7 || implied7) ? "aug7" : "aug"; }
    else {
      q = m ? "m" : "";
      if (has(parts, "M7")) { q += m ? "M7" : "maj7"; }
      else if (has(parts, "6")) { q += has(parts, "9") ? "6/9" : "6"; }
      else if (sev7) { q += "7"; }
      else if (implied7) {
        numTen = has(parts, "13") ? "13" : (has(parts, "11") ? "11" : "9");
        q += numTen;
      }
    }
    if (has(parts, "sus4")) { q += "sus4"; }
    if (has(parts, "sus2")) { q += "sus2"; }
    if (has(parts, "add9")) { q += "add9"; }
    var ORDER = [["b5", "♭5"], ["s5", "♯5"], ["b9", "♭9"], ["9", "9"], ["s9", "♯9"], ["11", "11"], ["s11", "♯11"], ["b13", "♭13"], ["13", "13"]];
    for (var i = 0; i < ORDER.length; i++) {
      var id = ORDER[i][0];
      if (!has(parts, id)) { continue; }
      if (id === numTen) { continue; }
      if (id === "9" && has(parts, "6") && !has(parts, "M7")) { continue; } // 6/9 に入っている
      if ((id === "b5") && has(parts, "dim")) { continue; }
      if (id === "s5" && has(parts, "aug")) { continue; }
      // 13・11 の名前のときは下の 9・11 は書かない
      if (numTen === "13" && (id === "9" || id === "11")) { continue; }
      if (numTen === "11" && id === "9") { continue; }
      ten.push(ORDER[i][1]);
    }
    if (ten.length) { q += "(" + ten.join(",") + ")"; }
    return q;
  }
  function chordName(spec) {
    if (!spec) { return ""; }
    if (spec.shape && !spec.parts) { return spec.name || "?"; }
    var n = ROOTS[pcOf(spec.root)] + suffix(spec.parts);
    if (spec.bass !== undefined && spec.bass !== null && pcOf(spec.bass) !== pcOf(spec.root)) { n += "/" + ROOTS[pcOf(spec.bass)]; }
    return n;
  }
  function chordPcs(spec) {
    var ivs = intervals(spec.parts), out = [];
    for (var i = 0; i < ivs.length; i++) { out.push(pcOf(spec.root + ivs[i].iv)); }
    return out;
  }
  // 構成音の表示 [{ name: "E", role: "3" }]
  function chordTones(spec) {
    var ivs = intervals(spec.parts), out = [];
    for (var i = 0; i < ivs.length; i++) { out.push({ name: ROOTS[pcOf(spec.root + ivs[i].iv)], role: ivs[i].role, pc: pcOf(spec.root + ivs[i].iv) }); }
    return out;
  }

  // ---------- 名前を読む ----------
  var ALIASES = [
    ["maj7", ["M7"]], ["Maj7", ["M7"]], ["M7", ["M7"]], ["ma7", ["M7"]], ["△7", ["M7"]], ["Δ7", ["M7"]], ["△", ["M7"]],
    ["maj9", ["M7", "9"]], ["Maj9", ["M7", "9"]], ["M9", ["M7", "9"]],
    ["m(maj7)", ["m", "M7"]], ["mmaj7", ["m", "M7"]], ["mMaj7", ["m", "M7"]], ["mM7", ["m", "M7"]], ["m△7", ["m", "M7"]], ["-M7", ["m", "M7"]],
    ["m7(b5)", ["dim", "7"]], ["m7(-5)", ["dim", "7"]], ["m7b5", ["dim", "7"]], ["m7-5", ["dim", "7"]], ["ø7", ["dim", "7"]], ["ø", ["dim", "7"]],
    ["madd9", ["m", "add9"]], ["m(add9)", ["m", "add9"]], ["min7", ["m", "7"]], ["m7", ["m", "7"]], ["-7", ["m", "7"]],
    ["m6", ["m", "6"]], ["-6", ["m", "6"]], ["m9", ["m", "9"]], ["-9", ["m", "9"]], ["m11", ["m", "11"]], ["m13", ["m", "13"]],
    ["min", ["m"]], ["m", ["m"]], ["-", ["m"]],
    ["dim7", ["dim7"]], ["°7", ["dim7"]], ["o7", ["dim7"]], ["dim", ["dim"]], ["°", ["dim"]], ["o", ["dim"]],
    ["aug7", ["aug", "7"]], ["+7", ["aug", "7"]], ["aug", ["aug"]], ["+", ["aug"]],
    ["7sus4", ["7", "sus4"]], ["7sus", ["7", "sus4"]], ["sus4", ["sus4"]], ["sus2", ["sus2"]], ["sus", ["sus4"]],
    ["add9", ["add9"]], ["add2", ["add9"]], ["6/9", ["6", "9"]], ["69", ["6", "9"]], ["6(9)", ["6", "9"]],
    ["13", ["13"]], ["11", ["11"]], ["9", ["9"]], ["7", ["7"]], ["6", ["6"]], ["5", ["pow"]], ["maj", []], ["M", []]
  ];
  ALIASES.sort(function (a, b) { return b[0].length - a[0].length; });
  var TENSION_TOKENS = { b5: "b5", "-5": "b5", "#5": "s5", "+5": "s5", b9: "b9", "-9": "b9", "#9": "s9", "+9": "s9", "9": "9",
    "11": "11", "#11": "s11", "+11": "s11", b13: "b13", "-13": "b13", "13": "13", add9: "add9", add2: "add9" };

  function parseRoot(s) {
    var m = /^([A-G])(#|b)?/.exec(s);
    if (!m) { return null; }
    var pc = LETTER_PC[m[1]] + (m[2] === "#" ? 1 : (m[2] === "b" ? -1 : 0));
    return { pc: pcOf(pc), len: m[0].length };
  }
  function addPart(parts, id) {
    var clash = PART_CLASH[id] || [];
    var out = [];
    for (var i = 0; i < parts.length; i++) { if (parts[i] !== id && clash.indexOf(parts[i]) < 0) { out.push(parts[i]); } }
    out.push(id);
    return out;
  }
  // "F#m7(b5)/E" → { root, parts, bass } / null
  function parseName(str) {
    if (typeof str !== "string") { return null; }
    var s = str.replace(/♯/g, "#").replace(/♭/g, "b").replace(/（/g, "(").replace(/）/g, ")").replace(/，|、/g, ",").replace(/／/g, "/").replace(/\s+/g, " ").trim();
    if (!s) { return null; }
    var bass = null, bm = /(?:\/|\s?on\s?)([A-G](?:#|b)?)$/.exec(s);
    if (bm) {
      bass = parseRoot(bm[1]).pc;
      s = s.substring(0, bm.index).trim();
    }
    s = s.replace(/\s/g, "");
    var r = parseRoot(s);
    if (!r) { return null; }
    var rest = s.substring(r.len), parts = [], i;
    for (i = 0; i < ALIASES.length; i++) {
      if (rest.indexOf(ALIASES[i][0]) === 0) {
        parts = ALIASES[i][1].slice();
        rest = rest.substring(ALIASES[i][0].length);
        break;
      }
    }
    // 残りはテンション: (b9,13) / b5 / #11 / add9 …
    rest = rest.replace(/[()]/g, ",");
    var toks = rest.split(",");
    for (i = 0; i < toks.length; i++) {
      var t = toks[i];
      while (t.length) {
        var hit = null;
        for (var k in TENSION_TOKENS) {
          if (TENSION_TOKENS.hasOwnProperty(k) && t.indexOf(k) === 0 && (!hit || k.length > hit.length)) { hit = k; }
        }
        if (!hit) { return null; }
        parts = addPart(parts, TENSION_TOKENS[hit]);
        t = t.substring(hit.length);
      }
    }
    return { root: r.pc, parts: parts, bass: bass };
  }

  // ---------- 押さえ方 ----------
  function openMidis(lowG) { return [lowG ? UKE_OPEN_LOWG : UKE_OPEN[0], UKE_OPEN[1], UKE_OPEN[2], UKE_OPEN[3]]; }
  // 押さえ方の指の数（いちばん低いフレットが2本以上ならセーハで1本）
  function fingerCount(shape) {
    var fr = [], i, min = 99;
    for (i = 0; i < 4; i++) { if (shape[i] > 0) { fr.push(shape[i]); if (shape[i] < min) { min = shape[i]; } } }
    if (!fr.length) { return 0; }
    var atMin = 0;
    for (i = 0; i < fr.length; i++) { if (fr[i] === min) { atMin++; } }
    return atMin >= 2 ? fr.length - atMin + 1 : fr.length;
  }
  function shapeSpan(shape) {
    var mn = 99, mx = 0;
    for (var i = 0; i < 4; i++) { if (shape[i] > 0) { if (shape[i] < mn) { mn = shape[i]; } if (shape[i] > mx) { mx = shape[i]; } } }
    return mx === 0 ? { min: 0, max: 0, span: 0 } : { min: mn, max: mx, span: mx - mn };
  }
  // spec → 押さえ方の候補（よい順・最大 count 個）。opts: { lowG, preferred: {name: shape}, count, maxFret }
  function voicings(spec, opts) {
    opts = opts || {};
    var count = opts.count || 6, maxFret = opts.maxFret === undefined ? 12 : opts.maxFret;
    var ivs = intervals(spec.parts), open = openMidis(opts.lowG), i;
    var allowed = {}, bassPc = (spec.bass !== undefined && spec.bass !== null) ? pcOf(spec.bass) : null;
    for (i = 0; i < ivs.length; i++) { allowed[pcOf(spec.root + ivs[i].iv)] = true; }
    if (bassPc !== null) { allowed[bassPc] = true; }
    // 必要な音（4つまで。5度 → 根音 → 11 の順に省く）
    var need = ivs.slice();
    for (var lv = 1; lv <= 3; lv++) {
      for (i = need.length - 1; i >= 0 && need.length > 4; i--) { if (need[i].omit === lv) { need.splice(i, 1); } }
    }
    while (need.length > 4) { need.pop(); }
    var cands = [];
    for (var s = 0; s < 4; s++) {
      var list = [];
      for (var f = 0; f <= maxFret; f++) { if (allowed[pcOf(open[s] + f)]) { list.push(f); } }
      cands.push(list);
    }
    function search(needIvs, maxSpan) {
      var needPcs = [], found = [], f0, f1, f2, f3, shape, j;
      for (j = 0; j < needIvs.length; j++) { needPcs.push(pcOf(spec.root + needIvs[j].iv)); }
      if (bassPc !== null && needPcs.indexOf(bassPc) < 0) { needPcs.push(bassPc); }
      for (f0 = 0; f0 < cands[0].length; f0++) {
        for (f1 = 0; f1 < cands[1].length; f1++) {
          for (f2 = 0; f2 < cands[2].length; f2++) {
            for (f3 = 0; f3 < cands[3].length; f3++) {
              shape = [cands[0][f0], cands[1][f1], cands[2][f2], cands[3][f3]];
              var sp = shapeSpan(shape);
              if (sp.span > maxSpan) { continue; }
              var fing = fingerCount(shape);
              if (fing > 4) { continue; }
              var pcs = {}, low = 999, lowPc = -1;
              for (j = 0; j < 4; j++) {
                var mm = open[j] + shape[j];
                pcs[pcOf(mm)] = true;
                if (mm < low) { low = mm; lowPc = pcOf(mm); }
              }
              var ok = true;
              for (j = 0; j < needPcs.length; j++) { if (!pcs[needPcs[j]]) { ok = false; break; } }
              if (!ok) { continue; }
              if (bassPc !== null && lowPc !== bassPc) { continue; }
              var opens = 0;
              for (j = 0; j < 4; j++) { if (shape[j] === 0) { opens++; } }
              var cost = sp.min * 3 + sp.max + sp.span * 1.5 + fing - opens * 0.6;
              if (bassPc === null && !pcs[pcOf(spec.root)]) { cost += 2; }
              found.push({ shape: shape, cost: cost });
            }
          }
        }
      }
      return found;
    }
    // 見つからなければ 5度 → 根音 を省き、それでもだめなら押さえる範囲を5フレットまで広げる
    function without(list, lvl) { var o = []; for (var j = 0; j < list.length; j++) { if (list[j].omit !== lvl) { o.push(list[j]); } } return o; }
    var tries = [[need, 3], [without(need, 1), 3], [without(without(need, 1), 2), 3], [need, 4], [without(without(need, 1), 2), 4]];
    var out = [];
    for (var ti = 0; ti < tries.length && !out.length; ti++) { out = search(tries[ti][0], tries[ti][1]); }
    out.sort(function (a, b) { return a.cost - b.cost; });
    var res = [], seen = {};
    var pref = opts.preferred && opts.preferred[chordName(spec)];
    if (pref) { res.push(pref.slice()); seen[pref.join(",")] = true; }
    for (i = 0; i < out.length && res.length < count; i++) {
      var key = out[i].shape.join(",");
      if (seen[key]) { continue; }
      seen[key] = true;
      res.push(out[i].shape);
    }
    return res;
  }

  // ---------- 押さえた形 → コード名 ----------
  var DETECT_PARTS = [];
  (function () {
    for (var i = 0; i < QUALITIES.length; i++) { DETECT_PARTS.push(QUALITIES[i].parts); }
    DETECT_PARTS.push(["pow"], ["m", "13"], ["7", "b9", "13"], ["m", "7", "11"]);
  })();
  // shape: 各弦のフレット（null = 鳴らさない）→ { name, alts: [別名], tones: [音名], spec } / null
  function detect(shape, opts) {
    opts = opts || {};
    var open = openMidis(opts.lowG), sounding = {}, list = [], low = 999, lowPc = -1, i;
    for (i = 0; i < 4; i++) {
      if (shape[i] === null || shape[i] === undefined || shape[i] < 0) { continue; }
      var mm = open[i] + shape[i], pc = pcOf(mm);
      if (!sounding[pc]) { sounding[pc] = true; list.push(pc); }
      if (mm < low) { low = mm; lowPc = pc; }
    }
    if (!list.length) { return null; }
    var names = [];
    if (opts.preferred) {
      for (var nm in opts.preferred) {
        if (opts.preferred.hasOwnProperty(nm) && opts.preferred[nm].join(",") === shape.join(",")) { names.push({ name: nm, score: -100, spec: parseName(nm) }); }
      }
    }
    for (var r = 0; r < 12; r++) {
      if (!sounding[r]) { continue; }
      for (var q = 0; q < DETECT_PARTS.length; q++) {
        var spec = { root: r, parts: DETECT_PARTS[q], bass: null };
        var ivs = intervals(spec.parts), chordSet = {}, miss = 0, extra = 0;
        for (i = 0; i < ivs.length; i++) {
          var p = pcOf(r + ivs[i].iv);
          chordSet[p] = true;
          if (!sounding[p]) { if (ivs[i].omit > 0) { miss += 1; } else { miss += 100; } }
        }
        for (i = 0; i < list.length; i++) { if (!chordSet[list[i]]) { extra++; } }
        if (extra || miss >= 100) { continue; }
        // High-G は低い音の順がばらばらなので、根音がいちばん低いかはあまり気にしない。6 の和音より 7th 系を優先
        var score = miss * 3 + spec.parts.length + (r === lowPc ? 0 : (opts.lowG ? 1.5 : 0.5)) + (has(spec.parts, "6") ? 2 : 0);
        names.push({ name: chordName(spec), score: score, spec: spec, miss: miss });
      }
    }
    names.sort(function (a, b) { return a.score - b.score; });
    var tones = [];
    for (i = 0; i < list.length; i++) { tones.push(ROOTS[list[i]]); }
    if (!names.length) { return { name: "", alts: [], tones: tones, spec: null }; }
    var alts = [], seen = {};
    seen[names[0].name] = true;
    for (i = 1; i < names.length && alts.length < 3; i++) {
      // 1つ目が全部の音そろっているなら、音が足りない別名は出さない
      if (!names[0].miss && names[i].miss) { continue; }
      if (!seen[names[i].name]) { seen[names[i].name] = true; alts.push(names[i].name); }
    }
    return { name: names[0].name, alts: alts, tones: tones, spec: names[0].spec };
  }

  // ---------- 移調 ----------
  function transpose(spec, n) {
    if (!spec) { return spec; }
    if (spec.shape && !spec.parts) { return { shape: shiftShape(spec.shape, n), name: spec.name }; }
    return { root: pcOf(spec.root + n), parts: spec.parts.slice(), bass: (spec.bass === null || spec.bass === undefined) ? null : pcOf(spec.bass + n) };
  }
  function shiftShape(shape, n) {
    var out = [], i, mn = 99, mx = -99;
    for (i = 0; i < 4; i++) { out.push(shape[i] === null ? null : shape[i] + n); }
    for (i = 0; i < 4; i++) { if (out[i] !== null) { if (out[i] < mn) { mn = out[i]; } if (out[i] > mx) { mx = out[i]; } } }
    var adj = mn < 0 ? 12 : (mx > 12 && mn >= 12 ? -12 : 0);
    for (i = 0; i < 4; i++) { if (out[i] !== null) { out[i] = Math.max(0, Math.min(15, out[i] + adj)); } }
    return out;
  }
  function shapeMidis(shape, lowG) {
    var open = openMidis(lowG), out = [];
    for (var i = 0; i < 4; i++) { out.push(shape[i] === null ? null : open[i] + shape[i]); }
    return out;
  }

  window.UGChords = {
    ROOTS: ROOTS, PARTS: PARTS, PART_CLASH: PART_CLASH, QUALITIES: QUALITIES,
    intervals: intervals, suffix: suffix, name: chordName, pcs: chordPcs, tones: chordTones, parse: parseName, addPart: addPart,
    voicings: voicings, fingerCount: fingerCount, span: shapeSpan, detect: detect, transpose: transpose, shiftShape: shiftShape,
    shapeMidis: shapeMidis, openMidis: openMidis, pcOf: pcOf
  };
})();
