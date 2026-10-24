// ✍️ 歌詞くずし（arcade-lyrics.js）のテスト
"use strict";
var H = require("./harness");
var ok = H.ok;

function patch(src, file) {
  if (file !== "arcade-lyrics.js") { return src; }
  var from = "var ball = { x: W / 2, y: PY - BR - 1, vx: 0, vy: 0 };", from2 = "var lyricOpenId = null, lyricMsg = \"\";";
  if (src.indexOf(from) < 0 || src.indexOf(from2) < 0) { throw new Error("lyrics patch target missing"); }
  return src.split(from).join("var ball = window.__lb = { x: W / 2, y: PY - BR - 1, vx: 0, vy: 0 };")
    .split(from2).join("var lyricOpenId = window.__lyricOpen || null, lyricMsg = \"\";");
}
function cfg(over) {
  var c = { genres: ["love", "youth"], mix: false, phrases: true, fillers: true, breakMode: "rally", joiner: "space", relax: false };
  for (var k in over) { if (over.hasOwnProperty(k)) { c[k] = over[k]; } }
  return c;
}
// ボールを追いかけ、最後はわざと落として終わらせる
function play(env, c, frames, extra) {
  return env.run("lyrics", { config: c }, frames, function (f, e) {
    var b = e.window.__lb;
    e.ptr(f === 0 ? "down" : "move", b.x + Math.sin(f / 33) * 14, 300);
    if (extra) { extra(f, e); }
    if (f > frames * 0.7) { e.ptr("move", 5, 300); if (f % 200 === 0) { e.ptr("down", 5, 300); } }
  });
}

module.exports = function () {
  H.suite("lyrics");
  var env = H.load({ patch: patch });
  var L = env.window.UGLyrics;
  ok(!!L, "UGLyrics test API exists");

  // --- 言葉データ ---
  ok(L.genres.length === 12, "12 genres", L.genres.length);
  L.genres.forEach(function (g) {
    var all = g.words.concat(g.phrases), seen = {}, dup = [];
    all.forEach(function (w) { if (seen[w]) { dup.push(w); } seen[w] = 1; });
    ok(g.words.length >= 30 && g.phrases.length >= 4, g.id + ": at least 30 words and 4 phrases", [g.words.length, g.phrases.length]);
    ok(dup.length === 0, g.id + ": no duplicates", dup);
    ok(all.every(function (w) { return typeof w === "string" && w.length > 0 && !/[<>&"]/.test(w) && L.textWidth(w) + 10 <= 110; }), g.id + ": words are plain and fit a block");
  });
  ok(L.fillers.length >= 10, "fillers exist");

  // --- 造語 ---
  ok(L.coin("ときめき", "キック", 1) === "ときめキック", "coin mode 1: drop last char + whole word (ときめキック)", L.coin("ときめき", "キック", 1));
  ok(L.coin("ネオン", "花火", 0) === "ネオ火", "coin mode 0: first half + second half", L.coin("ネオン", "花火", 0));
  ok(L.coin("残業", "流れ星", 2) === "残業れ星", "coin mode 2: whole word + second half", L.coin("残業", "流れ星", 2));
  ok(L.coin("恋", "恋", 0) === "恋恋", "coin: identical result falls back to concatenation");
  var coinOk = true;
  for (var i = 0; i < 2000; i++) {
    var g1 = L.genres[i % 12], g2 = L.genres[(i * 7) % 12];
    var a = g1.words[i % g1.words.length], b = g2.words[(i * 3) % g2.words.length], c = L.coin(a, b, i % 3);
    if (L.chars(c).length < 2 || L.chars(c).length > 10) { coinOk = false; }
  }
  ok(coinOk, "coined words are 2-10 characters");
  ok(L.chars("😀あ").length === 2, "surrogate pairs count as one character");

  // --- ステージの並べ方 ---
  [cfg({}), cfg({ mix: true }), cfg({ phrases: false, fillers: false, genres: ["business"] })].forEach(function (c, idx) {
    for (var t = 0; t < 30; t++) {
      var bs = L.buildStage(c, L.pool(c)), over = 0;
      for (var p = 0; p < bs.length; p++) { for (var q = p + 1; q < bs.length; q++) {
        var x = bs[p], y = bs[q]; if (x.x < y.x + y.w && y.x < x.x + x.w && x.y < y.y + y.h && y.y < x.y + x.h) { over++; } } }
      var coins = bs.filter(function (b2) { return b2.kind === "coin"; }).length;
      if (over || !bs.every(function (b3) { return b3.x >= 4 && b3.x + b3.w <= 236 && b3.y >= 30 && b3.y + b3.h < 130; }) || coins !== (c.mix ? 4 : 2) || bs.length < 20) {
        ok(false, "stage layout #" + idx, { over: over, coins: coins, n: bs.length }); return;
      }
      if (!c.phrases && bs.some(function (b4) { return b4.kind === "phrase"; })) { ok(false, "words-only setting has no phrases"); return; }
      if (!c.fillers && bs.some(function (b5) { return b5.kind === "filler"; })) { ok(false, "fillers off has no fillers"); return; }
    }
    ok(true, "stage layout #" + idx + ": no overlap, in bounds, coin count, enough blocks");
  });
  var biz = L.pool(cfg({ genres: ["business"], phrases: true }));
  ok(biz.every(function (e) { return e.genre === "business"; }), "pool only uses selected genres");

  // --- プレイ: ラリーごと改行 ---
  var r = play(env, cfg({}), 15000);
  var rec = L.loadSaved()[0];
  ok(r.ended !== null && rec && rec.lines.length > 1, "rally mode: playing writes several lines and saves", rec && rec.lines.length);
  var times = [];
  rec.lines.forEach(function (ln) { ln.words.forEach(function (w) { times.push(w.t); }); });
  ok(times.every(function (t, i2) { return i2 === 0 || t >= times[i2 - 1]; }), "word timestamps are in order (for future melody sync)");
  var known = {};
  L.pool(cfg({})).forEach(function (e) { known[e.w] = 1; });
  L.fillers.forEach(function (w) { known[w] = 1; });
  var bad = [];
  rec.lines.forEach(function (ln) { ln.words.forEach(function (w) { if (w.kind !== "coined" && !known[w.w]) { bad.push(w.w); } }); });
  ok(bad.length === 0, "every non-coined word comes from the chosen genres or fillers", bad.slice(0, 5));
  var panelHtml = env.root.querySelector(".arcade-panel").innerHTML;
  ok(panelHtml.indexOf("lyric-line") >= 0 && panelHtml.indexOf("行・") >= 0, "panel under the canvas shows written lines", panelHtml.slice(0, 80));

  // --- 4語ごと ---
  play(env, cfg({ breakMode: "four" }), 15000);
  rec = L.loadSaved()[0];
  ok(rec.lines.slice(0, -1).every(function (ln) { return ln.words.length === 4; }), "four mode: every finished line has 4 words");

  // --- 手動だけ＋Enter / Backspace ---
  play(env, cfg({ breakMode: "manual" }), 12000, function (f, e) {
    if (f === 6000) { e.key("keydown", "Enter"); e.key("keyup", "Enter"); }
  });
  rec = L.loadSaved()[0];
  ok(rec.lines.length <= 2, "manual mode: lines only break on Enter (plus final line)", rec.lines.length);
  // Backspace: 最後の1語を取り消す（改行直後なら前の行に戻って取り消す）
  var before = null, after = null;
  play(env, cfg({ breakMode: "manual" }), 9000, function (f, e) {
    var p = e.root.querySelector(".arcade-panel").innerHTML;
    if (f === 5000) { before = p; e.key("keydown", "Backspace"); e.key("keyup", "Backspace"); }
    if (f === 5001) { after = p; }
  });
  var countWords = function (h) { var m = /(\d+)行・(\d+)語/.exec(h || ""); return m ? parseInt(m[2], 10) : -1; };
  ok(countWords(before) > 0 && countWords(after) === countWords(before) - 1, "Backspace removes exactly one word", [countWords(before), countWords(after)]);

  // --- テキスト書き出し ---
  var sample = { id: 1, date: new Date(2026, 9, 24, 21, 30).getTime(), genres: ["love", "business"], mix: false, joiner: "space",
    lines: [{ t: 0, words: [{ w: "恋", t: 0, kind: "word" }, { w: "残業", t: 10, kind: "word" }] }, { t: 20, words: [{ w: "ときめキック", t: 20, kind: "coined" }] }] };
  var txt = L.toText(sample);
  ok(txt.indexOf("タイトル: 恋 残業\n") === 0 && txt.indexOf("作成: 2026/10/24 21:30") > 0 && txt.indexOf("ジャンル: 恋愛・ビジネス") > 0 && txt.indexOf("\nときめキック\n") > 0, "text export format", txt);
  sample.joiner = "none";
  ok(L.toText(sample).indexOf("タイトル: 恋残業") === 0, "joiner none concatenates words");
  ok(L.fileName(sample) === "lyrics-20261024-2130.txt", "file name", L.fileName(sample));

  // --- 歌詞 × メロディ（§162） ---
  var mrec = { id: 77, date: Date.now(), scale: "major", key: 0, prog: { b: 0 },
    notes: [[0, 60, "b"], [20, 64, "b", 0.5], [40, 67, "b", 0.5], [500, 62, "w"], [600, 40, "s"], [700, 36, "d"], [800, 60, "c"], [1000, 65, "p"]] };
  ok(L.slots(mrec).join(",") === "0,500,1000", "singable slots skip chord tones, paddle and accompaniment", L.slots(mrec));
  var lrec = { id: 5, date: new Date(2026, 9, 24, 21, 30).getTime(), joiner: "space", genres: ["love"],
    lines: [{ t: 0, words: [{ w: "恋", t: 0 }, { w: "残業", t: 9 }, { w: "流れ星", t: 18 }] }, { t: 30, words: [{ w: "Oh", t: 30 }, { w: "ときめキック", t: 40 }] }] };
  var al = L.align(lrec, mrec);
  ok(al.words.map(function (w) { return w.t; }).join(",") === "0,500,1000,1400,1800" && al.extra === 2 && al.lines[1].t === 1400, "words go on notes in order; extras every 0.4s", al.words.map(function (w) { return w.t; }));
  var lrc = L.toLrc(lrec, al).split("\n");
  ok(lrc[0] === "[ti:恋 残業 流れ星]" && lrc[2] === "[00:00.00]<00:00.00>恋 <00:00.50>残業 <00:01.00>流れ星" && lrc[3] === "[00:01.40]<00:01.40>Oh <00:01.80>ときめキック", "LRC with word timings", lrc.slice(0, 4));
  var mb = env.window.UGMelody.midiBytes(mrec, L.midiEvents(lrec, al)), texts = [], qi = 22;
  function rdv() { var v = 0, cc; do { cc = mb[qi++]; v = (v << 7) | (cc & 0x7F); } while (cc & 0x80); return v; }
  while (qi < mb.length) { rdv(); var stt = mb[qi++];
    if (stt === 0xFF) { var ty = mb[qi++], ln2 = rdv(); if (ty === 5) { texts.push(decodeURIComponent(escape(String.fromCharCode.apply(null, mb.slice(qi, qi + ln2))))); } qi += ln2; if (ty === 0x2F) { break; } }
    else if ((stt & 0xF0) === 0xC0) { qi++; } else { qi += 2; } }
  ok(texts.join("|") === "恋 |残業 |流れ星\r|Oh |ときめキック\r", "lyric MIDI: UTF-8 lyric events with spaces and line ends", texts);
  ok(((mb[18] << 24) | (mb[19] << 16) | (mb[20] << 8) | mb[21]) === mb.length - 22, "lyric MIDI: track length still valid");
  ok(L.songName(lrec, "mid") === "song-20261024-2130.mid", "song file name");
  var kh = L.karaokeHtml(lrec, al, 1);
  ok(kh.indexOf('<span class="k-done">恋</span>') >= 0 && kh.indexOf('<span class="k-on">残業</span>') >= 0 && kh.indexOf('<span class="">流れ星</span>') >= 0, "karaoke highlights the current word", kh.slice(0, 120));
  // 歌詞ノートで開くと「メロディと合わせる」欄（メロディの録音があるとき）
  //（歌詞を開いた状態は、読み込み時に lyricOpenId の初期値を差し替えて作る）
  var saved = L.loadSaved()[0];
  var env3 = H.load({ patch: function (src, f) { src = patch(src, f); return f === "arcade-lyrics.js" ? src.split("window.__lyricOpen || null").join(saved.id + " || null") : src; } });
  env3.store.ultimateGorillaMelodyRecV1 = JSON.stringify([mrec]);
  env3.store.ultimateGorillaLyricsV1 = JSON.stringify([saved]);
  var root3 = H.makeEl("div");
  env3.window.UGArcade.start("lyrics", root3, { onEnd: function () {}, onExit: function () {} });
  ok(root3.innerHTML.indexOf("メロディと合わせる") >= 0 && root3.innerHTML.indexOf('data-k="melody"') >= 0 && root3.innerHTML.indexOf("歌詞つき再生") >= 0, "opened lyric shows the melody pairing box");
  env3.window.UGArcade.stop();

  // --- 設定画面 ---
  var root = H.makeEl("div");
  env.window.UGArcade.start("lyrics", root, { onEnd: function () {}, onExit: function () {} });
  ok(root.innerHTML.indexOf("data-genre=\"love\"") > 0 && root.innerHTML.indexOf("歌詞ノート") > 0 && root.innerHTML.indexOf("ジャンルミックス") > 0, "setup screen shows genres, mix and lyric notebook");
  env.window.UGArcade.stop();
  ok(L.loadPrefs().genres.join(",") === "love,youth", "default genres are love and youth");
};
