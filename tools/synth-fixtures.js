// §330 Phase 0: patch v1 の旧データの見本（tests/fixtures/synth-v1-data.json）を、いまのコードの読みこみ結果ごと作る
//   node tools/synth-fixtures.js   （エンジンを変えるまえに1回だけ。テスト test-synth がこの見本とくらべる）
var fs = require("fs"), path = require("path"), H = require("../tests/harness");
var e = H.load(), W = e.window, Y = W.UGSynth, U = W.UGUkulele;
var raw = {
  // じぶんの音色（範囲外・知らない値・足りない項目をまぜる）
  my: [{ name: "ぼくのリード", patch: { w1: "square", w2: "saw", mix: 0.4, det: 9, cut: 0.5, res: 0.3, mono: true, glide: 0.1 } },
       { name: "こわれた", patch: { w1: "nope", w2: "tri", uni: 7, cut: -3, res: 2, a: 99, lto: "x", det: "12", vol: null } },
       { name: "", patch: {} }],
  take: { id: 4, name: "テイク 4", bpm: 128, meter: 4, pname: "アシッドベース", patch: { w1: "saw", cut: 0.22, res: 0.8, env: 0.7, mono: true }, notes: [[0, 0.25, 36], [0.5, 0.25, 48, 0.6], [1, 1, 43]] },
  ytrack: { preset: "ynotes", kind: "notes", name: "シンセ打ち込み", vol: 70, prog: 81, patch: { w1: "saw", w2: "saw", uni: 3, det: 18, cut: 0.45, a: 0.8, r: 1.5 }, notes: [[0, 4, 60], [4, 4, 67, 0.5]] }
};
e.store[Y.MY_KEY] = JSON.stringify(raw.my);
e.store[Y.TAKES_KEY] = JSON.stringify([raw.take]);
var tracks = U.tracksClean({ xs: ["x1"], x1: raw.ytrack });
var out = {
  note: "§330 patch v1 の旧データの見本と、v2.33 のコードで読みこんだ結果（tools/synth-fixtures.js で作成）",
  params: Y.PARAMS.map(function (d) { return d.slice(0, 5); }),
  presets: Y.PRESETS.map(function (p) { return { id: p[0], patch: Y.preset(p[0]).patch }; }),
  raw: raw,
  clean: { my: Y.myLoad(), take: Y.takesLoad()[0], ytrack: tracks.x1 }
};
fs.writeFileSync(path.join(__dirname, "..", "tests", "fixtures", "synth-v1-data.json"), JSON.stringify(out, null, 1));
console.log("presets", out.presets.length, "my", out.clean.my.length, "take notes", out.clean.take.notes.length, "ytrack patch", !!out.clean.ytrack.patch);
