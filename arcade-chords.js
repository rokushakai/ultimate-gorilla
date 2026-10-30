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

  // ---------- §175 v0.94: ポジション（ロー・ミドル・ハイ） ----------
  var POS_CENTER = { low: 0, mid: 4.5, high: 9 };
  function posOf(shape) {
    var sp = shapeSpan(shape);
    var open = shape[0] === 0 || shape[1] === 0 || shape[2] === 0 || shape[3] === 0;
    // 5フレット以内で、低いフレット（2以下）か開放弦を使う形はロー
    if (sp.max === 0 || (sp.max <= 5 && (sp.min <= 2 || open))) { return "low"; }
    return sp.min >= 7 ? "high" : (sp.min >= 3 ? "mid" : "low");
  }
  // そのポジションの押さえ方（よい順）。なければいちばん近いポジションのもの。pos が "auto" ならふつうの voicings
  function voicingsAt(spec, pos, opts) {
    opts = opts || {};
    if (!pos || pos === "auto" || !POS_CENTER.hasOwnProperty(pos)) { return voicings(spec, opts); }
    var all = voicings(spec, { lowG: opts.lowG, preferred: opts.preferred, count: 400, maxFret: opts.maxFret === undefined ? 15 : opts.maxFret });
    var hit = [], i;
    for (i = 0; i < all.length; i++) { if (posOf(all[i]) === pos) { hit.push(all[i]); } }
    // ミドル・ハイは開放弦の少ない形（そのポジションらしい響き）を先に。同じ数ならもとの順
    if (pos !== "low") {
      var opensOf = function (sh) { var n = 0; for (var j = 0; j < 4; j++) { if (sh[j] === 0) { n++; } } return n; };
      hit = hit.map(function (sh, j) { return { sh: sh, j: j, o: opensOf(sh) }; }).sort(function (a, b) { return a.o - b.o || a.j - b.j; }).map(function (x) { return x.sh; });
    }
    if (!hit.length) {
      // いちばん近いポジションのものを、近い順に
      hit = all.slice().sort(function (a, b) {
        var ma = shapeSpan(a).min, mb = shapeSpan(b).min;
        return Math.abs(ma - POS_CENTER[pos]) - Math.abs(mb - POS_CENTER[pos]);
      });
    }
    return hit.slice(0, opts.count || 6);
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

  // §215 v1.23: 鍵盤で押した音（MIDI）→ コード名（いちばん低い音がベース。根音でなければオンコード「C/E」）
  // ベースだけがコードの外の音でもよい（F/G など）。→ { name, alts, tones, spec, onBass, interval } / null（音がない）
  // §216: 鍵盤のときだけ足す種類（Gsus4add9 ＝ ソ・ド・レ・ラ）
  var NOTE_EXTRA_PARTS = [["sus4", "add9"]];
  var INTERVAL_NAMES = ["オクターブ", "短2度", "長2度", "短3度", "長3度", "完全4度", "増4度", "完全5度", "短6度", "長6度", "短7度", "長7度"];
  // opts.maxAlts: 別の読み方をいくつまで返すか（省略で 3。Infinity ですべて）
  function detectNotes(midis, opts) {
    var maxAlts = opts && opts.maxAlts >= 0 ? opts.maxAlts : 3;
    var sounding = {}, list = [], low = 999, i;
    for (i = 0; i < (midis || []).length; i++) {
      var m = Math.round(Number(midis[i]));
      if (!isFinite(m)) { continue; }
      var pc = pcOf(m);
      if (!sounding[pc]) { sounding[pc] = true; list.push(pc); }
      if (m < low) { low = m; }
    }
    if (!list.length) { return null; }
    var bass = pcOf(low), tones = [], names = [], r, q, kinds = DETECT_PARTS.concat(NOTE_EXTRA_PARTS);
    for (i = 0; i < list.length; i++) { tones.push(ROOTS[list[i]]); }
    for (r = 0; r < 12; r++) {
      if (!sounding[r]) { continue; }
      for (q = 0; q < kinds.length; q++) {
        var parts = kinds[q], ivs = intervals(parts), chordSet = {}, miss = 0, extra = 0, bassOut = false;
        for (i = 0; i < ivs.length; i++) {
          var p = pcOf(r + ivs[i].iv);
          chordSet[p] = true;
          if (!sounding[p]) { miss += ivs[i].omit > 0 ? 1 : 100; }
        }
        for (i = 0; i < list.length; i++) { if (!chordSet[list[i]]) { if (list[i] === bass) { bassOut = true; } else { extra++; } } }
        // ベースだけがコードの外の音（オンコード）は、上に3つ以上の音があるときだけ
        if (extra || miss >= 100 || (bassOut && list.length < 4)) { continue; }
        // テンションつきのコードの転回形（Fadd9/G など）より、オンコード（F/G）を先に
        var tens = has(parts, "add9") || has(parts, "9") || has(parts, "b9") || has(parts, "s9") || has(parts, "11") || has(parts, "s11") || has(parts, "13") || has(parts, "b13");
        var score = miss * 3 + parts.length + (r === bass ? 0 : 2) + (bassOut ? 3 : 0) + (has(parts, "6") ? 2 : 0) + (tens && r !== bass ? 3 : 0);
        names.push({ name: chordName({ root: r, parts: parts, bass: r === bass ? null : bass }), score: score, miss: miss, spec: { root: r, parts: parts.slice(), bass: r === bass ? null : bass } });
      }
    }
    names.sort(function (a, b) { return a.score - b.score; });
    var out = { name: "", alts: [], tones: tones, spec: null, onBass: "", interval: "" };
    if (list.length === 2 && (!names.length || !has(names[0].spec.parts, "pow") || names[0].spec.bass !== null)) {
      var hi = -1;
      for (i = 0; i < midis.length; i++) { if (pcOf(midis[i]) !== bass) { hi = pcOf(midis[i]); } }
      out.interval = INTERVAL_NAMES[pcOf(hi - bass)];
      return out;
    }
    if (list.length === 1) { return out; }
    if (!names.length) { return out; }
    out.name = names[0].name;
    out.spec = names[0].spec;
    out.onBass = names[0].spec.bass === null ? "" : ROOTS[names[0].spec.bass];
    // 同じ根音・同じ構成音・同じベースの書き方ちがい（Am11 と Am7(11) など）は1つにまとめる
    var seen = {}, sameKey = function (sp) { return sp.root + ":" + chordPcs(sp).slice().sort(function (a, b) { return a - b; }).join(",") + "/" + sp.bass; };
    seen[out.name] = true;
    seen[sameKey(names[0].spec)] = true;
    for (i = 1; i < names.length && out.alts.length < maxAlts; i++) {
      if (!names[0].miss && names[i].miss) { continue; }
      var sk = sameKey(names[i].spec);
      if (!seen[names[i].name] && !seen[sk]) { seen[names[i].name] = true; seen[sk] = true; out.alts.push(names[i].name); }
    }
    return out;
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

  // ---------- §170 v0.89: シーケンサーの時間計算 ----------
  var SEQ_LENGTHS = [
    { id: "w", label: "全音符", beats: 4 }, { id: "h.", label: "付点2分", beats: 3 }, { id: "h", label: "2分", beats: 2 },
    { id: "q.", label: "付点4分", beats: 1.5 }, { id: "q", label: "4分", beats: 1 }, { id: "qt", label: "3連4分", beats: 2 / 3 },
    { id: "e.", label: "付点8分", beats: 0.75 }, { id: "e", label: "8分", beats: 0.5 }, { id: "et", label: "3連8分", beats: 1 / 3 },
    { id: "s", label: "16分", beats: 0.25 }
  ];
  var SEQ_STYLES = [
    { id: "once", label: "ジャーン（1回）", unit: 0 }, { id: "q", label: "4分ストローク", unit: 1 }, { id: "e", label: "8分ストローク", unit: 0.5 },
    { id: "s", label: "16分ストローク", unit: 0.25 }, { id: "arp8", label: "アルペジオ8分", unit: 0.5, arp: true }, { id: "arp16", label: "アルペジオ16分", unit: 0.25, arp: true },
    { id: "pat", label: "🎵 パターン", unit: 0, pattern: true }
  ];
  // §172 v0.91: ストロークパターン（1小節。D ダウン / U アップ / - 休み / x ブラッシング）
  // §190 v0.99.9: 1〜4 その弦だけ（1弦＝A … 4弦＝G）/ P 4弦と1弦をいっしょに。kind: "s" ストローク / "a" アルペジオ。meter: 拍子（なしは 4）
  var SEQ_PATTERNS = [
    { p: "D-DU-UDU", label: "島のストローク", kind: "s" }, { p: "D-D-D-D-", label: "4分", kind: "s" }, { p: "DUDUDUDU", label: "8分", kind: "s" },
    { p: "D--UD-DU", label: "ためて", kind: "s" }, { p: "D-xUD-xU", label: "チャック入り", kind: "s" }, { p: "DDUUDDUU", label: "2つずつ", kind: "s" },
    { p: "D-DUD-DU", label: "ポップス", kind: "s" }, { p: "D---D-DU", label: "バラード", kind: "s" }, { p: "D-D-DUDU", label: "走り出し", kind: "s" },
    { p: "xUxUxUxU", label: "裏打ち（レゲエ風）", kind: "s" }, { p: "D-xU-UxU", label: "カッティング", kind: "s" },
    { p: "D-DUxUDUD-DUxUDU", label: "16ビート", kind: "s" }, { p: "D--D--D-D-DUxUDU", label: "シンコペーション", kind: "s" },
    { p: "D-UD-UD-UD-U", label: "シャッフル（3連）", kind: "s" }, { p: "D--D-UD--D-U", label: "ブルース（3連）", kind: "s" },
    { p: "D-D-D-", label: "3拍子", kind: "s", meter: 3 }, { p: "D-DUDU", label: "ワルツ", kind: "s", meter: 3 },
    { p: "43214321", label: "上り（4→1）", kind: "a" }, { p: "12341234", label: "下り（1→4）", kind: "a" }, { p: "32123212", label: "行ったり来たり", kind: "a" },
    { p: "4-3-2-1-", label: "ゆったり", kind: "a" }, { p: "P-2-P-2-", label: "ピンチ", kind: "a" }, { p: "31423142", label: "トラヴィス風", kind: "a" },
    { p: "3-21D-DU", label: "アルペジオ＋ストローク", kind: "a" }, { p: "P-21-P21", label: "ボサノバ風", kind: "a" },
    { p: "4321234143212341", label: "16分の波", kind: "a" },
    { p: "321212", label: "3拍子", kind: "a", meter: 3 }, { p: "P-2121", label: "ワルツ（ピンチ）", kind: "a", meter: 3 }
  ];
  function seqPattern(p) {
    var out = String(p || "").toUpperCase().replace(/X/g, "x").replace(/[^DUxP1-4\-]/g, "").slice(0, 16);
    return out || "D-DU-UDU";
  }
  var SEQ_SWINGS = [{ v: 0.5, label: "なし" }, { v: 0.58, label: "軽め 58%" }, { v: 0.62, label: "中くらい 62%" }, { v: 0.67, label: "3連 67%" }, { v: 0.72, label: "強め 72%" }];
  var SEQ_ARP = [1, 0, 2, 3]; // C → G → E → A
  var EPS = 1e-6;
  function seqLen(id) {
    for (var i = 0; i < SEQ_LENGTHS.length; i++) { if (SEQ_LENGTHS[i].id === id) { return SEQ_LENGTHS[i]; } }
    // §176 v0.95: 「◯拍」（"b2.5" = 2.5拍。0.25拍きざみ・最大32拍）
    var m = /^b(\d+(?:\.\d+)?)$/.exec(String(id || ""));
    if (m) {
      var n = Math.max(0.25, Math.min(32, Math.round(parseFloat(m[1]) * 4) / 4));
      return { id: "b" + n, label: n + "拍", beats: n };
    }
    return SEQ_LENGTHS[4];
  }
  // 拍の数 → 長さの id（音符にちょうど合えばその音符）
  function lenId(beats) {
    for (var i = 0; i < SEQ_LENGTHS.length; i++) { if (Math.abs(SEQ_LENGTHS[i].beats - beats) < 1e-6) { return SEQ_LENGTHS[i].id; } }
    return seqLen("b" + beats).id;
  }
  function seqStyle(id) {
    for (var i = 0; i < SEQ_STYLES.length; i++) { if (SEQ_STYLES[i].id === id) { return SEQ_STYLES[i]; } }
    return SEQ_STYLES[0];
  }
  // スイング: 拍の位置 b（拍）を、grid（8分=0.5 / 16分=0.25）の2つ組ごとに「前半を長く・後半を短く」ゆがめる
  function swingBeat(b, ratio, grid) {
    if (!(ratio > 0.5) || !(grid > 0)) { return b; }
    var pair = grid * 2, k = Math.floor((b + EPS) / pair), f = b - k * pair, split = pair * ratio;
    if (f < EPS) { return k * pair; }
    var out = f <= grid ? f * split / grid : split + (f - grid) * (pair - split) / grid;
    return k * pair + out;
  }
  // 名前を半音 n ずらす（読めない名前＝★マイコードなどはそのまま）
  function transposeName(name, n) {
    var sp = parseName(name);
    return sp ? chordName(transpose(sp, n)) : name;
  }
  // 曲 → 鳴らす予定の一覧
  //   seq: { bpm, key, meter, swing, swingGrid, style, metronome, countIn, rows: [{ type: "chord"|"rest"|"key", name, len, semis }] }
  //   resolve(name, semis, row) → { name, shape } / null（押さえ方を決める。row は行そのもの＝ポジションの指定など）
  //   戻り値: { rows: [{ i, name, shape, ok, start, end, t0, t1 }], events: [{ t, kind, ... }], beats, time, lead }
  function seqSchedule(seq, resolve) {
    // §189: BPM の下限は 20（練習テンポで遅くしたとき用。入力できるのは 40〜240）
    var bpm = Math.max(20, Math.min(240, Math.round(seq.bpm || 90))), spb = 60 / bpm;
    var meter = seq.meter === 3 ? 3 : 4, style = seqStyle(seq.style), ratio = seq.swing || 0.5, grid = seq.swingGrid === 0.25 ? 0.25 : 0.5;
    var lead = seq.countIn ? meter : 0, rows = [], events = [], beat = 0, semis = seq.key || 0, i;
    function barOf(b) { return Math.abs(b / meter - Math.round(b / meter)) < EPS ? Math.round(b / meter) + 1 : 0; }
    // §179 v0.98: テンポの区切りごとに時間を積み上げる（区切りの頭の時刻 ＋ スイングをかけた拍の差 × その区切りの1拍の秒）
    var segs = [{ b0: 0, t0: lead * spb, spb: spb }];
    function segAt(b) { var sg = segs[0]; for (var q = 1; q < segs.length; q++) { if (segs[q].b0 <= b + EPS) { sg = segs[q]; } } return sg; }
    function tm(b) { var sg = segAt(b); return sg.t0 + (swingBeat(b, ratio, grid) - swingBeat(sg.b0, ratio, grid)) * sg.spb; }
    // スイングなしの時刻と、その逆（録音のクオンタイズなし・MIDI の拍に使う）
    function tmRaw(b) { var sg = segAt(b); return sg.t0 + (b - sg.b0) * sg.spb; }
    function beatAt(t) {
      var sg = segs[0];
      for (var q = 1; q < segs.length; q++) { if (segs[q].t0 <= t + EPS) { sg = segs[q]; } }
      return sg.b0 + (t - sg.t0) / sg.spb;
    }
    var list = seq.rows || [];
    for (i = 0; i < list.length; i++) {
      var r = list[i];
      if (!r) { continue; }
      if (r.type === "key") { semis += (r.semis || 0); rows.push({ i: i, type: "key", start: beat, end: beat, t0: tm(beat), t1: tm(beat), semis: semis }); continue; }
      if (r.type === "tempo") {
        var nb = Math.max(20, Math.min(240, Math.round(r.bpm || bpm))), tt = tm(beat);
        segs.push({ b0: beat, t0: tt, spb: 60 / nb });
        rows.push({ i: i, type: "tempo", start: beat, end: beat, t0: tt, t1: tt, bpm: nb });
        continue;
      }
      if (r.type === "sec") { rows.push({ i: i, type: "sec", name: String(r.name || ""), start: beat, end: beat, t0: tm(beat), t1: tm(beat) }); continue; }
      var len = seqLen(r.len).beats, start = beat, end = beat + len;
      beat = end;
      if (r.type === "rest") { rows.push({ i: i, type: "rest", start: start, end: end, t0: tm(start), t1: tm(end), bar: barOf(start) }); continue; }
      var res = resolve ? resolve(r.name, semis, r) : null;
      var row = { i: i, type: "chord", name: res ? res.name : String(r.name || ""), shape: res ? res.shape : null, ok: !!res, start: start, end: end, t0: tm(start), t1: tm(end), bar: barOf(start) };
      rows.push(row);
      if (!res) { continue; }
      // §189: 行ごとの奏法（"song" か なしなら曲の奏法）とパターン
      var rst = r.style && r.style !== "song" ? seqStyle(r.style) : style;
      var pat = rst.pattern ? seqPattern(r.style === "pat" && r.pattern ? r.pattern : seq.pattern) : "", patUnit = pat ? meter / pat.length : 0;
      if (pat) {
        // 小節の頭からの位置で文字を選ぶ（コードが小節の途中から始まってもパターンは続く）
        var kp0 = Math.ceil(start / patUnit - EPS), hitStart = false;
        for (var kp = kp0; kp * patUnit < end - EPS; kp++) {
          var chp = pat.charAt(((kp % pat.length) + pat.length) % pat.length), tp = tm(kp * patUnit);
          if (chp === "D" || chp === "U") { events.push({ t: tp, kind: "strum", dir: chp === "D" ? "down" : "up", shape: res.shape, row: rows.length - 1 }); }
          else if (chp === "x") { events.push({ t: tp, kind: "chuck", shape: res.shape, row: rows.length - 1 }); }
          // §190: 弦の番号（1弦＝A は形の [3]）とピンチ（4弦＋1弦）
          else if (chp >= "1" && chp <= "4") { events.push({ t: tp, kind: "pluck", string: 4 - parseInt(chp, 10), shape: res.shape, row: rows.length - 1 }); }
          else if (chp === "P") {
            events.push({ t: tp, kind: "pluck", string: 0, shape: res.shape, row: rows.length - 1 });
            events.push({ t: tp, kind: "pluck", string: 3, shape: res.shape, row: rows.length - 1 });
          }
          if (Math.abs(kp * patUnit - start) < EPS && chp !== "-") { hitStart = true; }
        }
        // 頭が休みの位置でも、コードが変わったら最初に1回鳴らす
        if (!hitStart) { events.push({ t: tm(start), kind: "strum", dir: "down", shape: res.shape, row: rows.length - 1 }); }
        continue;
      }
      if (!rst.unit) {
        events.push({ t: tm(start), kind: "strum", dir: "down", shape: res.shape, row: rows.length - 1 });
        continue;
      }
      // 拍の頭からの格子で打つ（ダウン／アップは格子の偶数・奇数で決める）
      var k0 = Math.ceil(start / rst.unit - EPS);
      for (var k = k0; k * rst.unit < end - EPS; k++) {
        var p = k * rst.unit;
        if (rst.arp) { events.push({ t: tm(p), kind: "pluck", string: SEQ_ARP[((k % 4) + 4) % 4], shape: res.shape, row: rows.length - 1 }); }
        else { events.push({ t: tm(p), kind: "strum", dir: k % 2 === 0 ? "down" : "up", shape: res.shape, row: rows.length - 1 }); }
      }
      // 格子にのらない長さ（3連など）で始まるときは頭でも1回鳴らす
      if (k0 * rst.unit > start + EPS) { events.push({ t: tm(start), kind: rst.arp ? "pluck" : "strum", dir: "down", string: SEQ_ARP[0], shape: res.shape, row: rows.length - 1 }); }
    }
    var total = beat;
    if (seq.metronome || seq.countIn) {
      for (var b = -lead; b < (seq.metronome ? total : 0) - EPS; b++) {
        events.push({ t: b < 0 ? (lead + b) * spb : tm(b), kind: "click", accent: ((b % meter) + meter) % meter === 0 });
      }
    }
    events.sort(function (x, y) { return x.t - y.t; });
    // tm: 拍 → 秒（スイング・カウントイン込み。ほかのトラックの音を置くのに使う）
    return { rows: rows, events: events, beats: total, time: tm(total), lead: lead * spb, spb: spb, bars: Math.ceil(total / meter - EPS), meter: meter, tm: tm, tmRaw: tmRaw, beatAt: beatAt, segs: segs };
  }

  window.UGChords = {
    ROOTS: ROOTS, PARTS: PARTS, PART_CLASH: PART_CLASH, QUALITIES: QUALITIES,
    intervals: intervals, suffix: suffix, name: chordName, pcs: chordPcs, tones: chordTones, parse: parseName, addPart: addPart,
    voicings: voicings, voicingsAt: voicingsAt, posOf: posOf, fingerCount: fingerCount, span: shapeSpan, detect: detect, detectNotes: detectNotes, transpose: transpose, shiftShape: shiftShape,
    shapeMidis: shapeMidis, openMidis: openMidis, pcOf: pcOf,
    SEQ_LENGTHS: SEQ_LENGTHS, SEQ_STYLES: SEQ_STYLES, SEQ_SWINGS: SEQ_SWINGS, SEQ_PATTERNS: SEQ_PATTERNS, seqPattern: seqPattern, seqLen: seqLen, lenId: lenId, swingBeat: swingBeat, transposeName: transposeName, schedule: seqSchedule
  };
})();
