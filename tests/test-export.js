// §345 A16: 書き出すファイルの名前・保存の結果の案内・保存で曲をこわさない（iPhone を先に考える）
"use strict";
var H = require("./harness");
var ok = H.ok;
var fs = require("fs"), path = require("path");

module.exports = async function () {
  H.suite("export");
  // 0. 同じ名前の関数を 2 回書かない（あとの定義が前のものを上書きして、別の画面がこわれる）
  var dup = [];
  ["arcade.js", "arcade-melody.js", "arcade-daw.js", "arcade-daw-model.js", "arcade-daw-xmas.js", "arcade-daw-zip.js"].forEach(function (f) {
    var src = fs.readFileSync(path.join(H.ROOT, f), "utf8"), seen = {};
    (src.match(/^ {2}function [A-Za-z0-9_$]+\(/mg) || []).forEach(function (m) { if (seen[m]) { dup.push(f + ": " + m); } seen[m] = 1; });
  });
  ok(dup.length === 0, "no top-level function is declared twice in the DAW / melody files (a second one would silently replace the first)", dup);
  // 1. 名前
  var env = H.load({ share: true }), W = env.window, D = W.UGDaw, A = W.UGArcade, M = W.UGDawModel, X = W.UGXmas, R = H.makeEl("div");
  A.start("daw", R, {});
  var n1 = D.outName("曲 / A:B", "", "wav"), n2 = D.outName("曲 / A:B", "", "wav"), n3 = D.outName("曲 / A:B", "", "wav"), nm = D.outName("ポップ", "stems", "zip");
  ok(/^曲 _ A_B_\d{8}-\d{4}\.wav$/.test(n1) && n2 === n1.replace(/\.wav$/, "-2.wav") && n3 === n1.replace(/\.wav$/, "-3.wav") && /^ポップ_stems_\d{8}-\d{4}\.zip$/.test(nm), "file names: 曲名_[中身_]日時.拡張子, unsafe characters replaced, the same name again gets -2, -3 (never overwrites)", [n1, n2, n3, nm]);
  // 2. 保存の結果
  var blob = new W.Blob(["x"], { type: "text/plain" }), got = [];
  function wait() { return new Promise(function (r) { setTimeout(r, 5); }); }
  W.navigator.share = function () { return { then: function (a) { a(); } }; };
  D.saveFile(blob, "a.txt", function (r) { got.push(r); });
  W.navigator.share = function () { return { then: function (a, b) { b({ name: "AbortError" }); } }; };
  var dl0 = env.counters.downloads.length;
  D.saveFile(blob, "b.txt", function (r) { got.push(r); });
  var dl1 = env.counters.downloads.length;
  W.navigator.share = function () { return { then: function (a, b) { b({ name: "NotAllowedError" }); } }; };
  D.saveFile(blob, "c.txt", function (r) { got.push(r); });
  delete W.navigator.share; delete W.navigator.canShare;
  D.saveFile(blob, "d.txt", function (r) { got.push(r); });
  var ce = W.document.createElement; W.document.createElement = function () { throw new Error("no"); };
  D.saveFile(blob, "e.txt", function (r) { got.push(r); });
  W.document.createElement = ce;
  await wait();
  ok(JSON.stringify(got) === JSON.stringify(["shared", "canceled", "download", "download", "fail"]) && dl1 === dl0 && env.counters.downloads.indexOf("c.txt") >= 0 && env.counters.downloads.indexOf("d.txt") >= 0, "saving: share sheet done / closed (nothing downloaded) / share failed → download / no share → download / nothing works → fail", got);
  ok(D.SAVE_NOTE.canceled.indexOf("データはそのまま") >= 0 && D.SAVE_NOTE.fail.indexOf("曲はそのまま") >= 0 && D.SAVE_NOTE.shared.indexOf("ファイル") >= 0, "each result has its own message (closed → the data is kept; failed → what to do, the song is kept)");
  // 3. 書き出して保存しても曲は変わらない
  D.xmas.host.newSong(X.tplNewProject(X.tplPlan(null, "pop", "new", 1, 1, "std")).project);
  var keep = JSON.stringify(D.project()), mh = D.midi.html();
  ok(/MIDI書き出し（約 \d+ (KB|バイト)）/.test(mh), "MIDI: the size is shown before exporting", mh.match(/MIDI書き出し（[^）]*）/));
  var me = D.midi.exportNow();
  ok(me.ok && /^キラキラ・クリスマスポップ_\d{8}-\d{4}(-\d+)?\.mid$/.test(me.name), "MIDI file name: 曲名_日時.mid", me.name);
  var sres = []; W.navigator.canShare = function () { return true; }; W.navigator.share = function () { return { then: function (a) { a(); } }; };
  D.saveFile(D.midi.state().blob, me.name, function (r) { sres.push(r); });
  await wait();
  ok(sres[0] === "shared" && JSON.stringify(D.project()) === keep, "saving the MIDI does not change the song", sres);
  // 4. ステム: ひと組は同じ日時・トラックの番号と名前・同じトラックをもう一度 → -2
  async function stemOnce(tid) { var done = false; D.stem.one(tid, function () { done = true; }); for (var g = 0; g < 4000 && !done; g++) { await env.wait(5); } return D.stem.state(); }
  var p = D.project(), s1 = (await stemOnce(p.tracks[1].id)).name, s2 = (await stemOnce(p.tracks[2].id)).name, s3 = (await stemOnce(p.tracks[1].id)).name;
  var st1 = (s1.match(/_(\d{8}-\d{4})/) || [])[1], st2 = (s2.match(/_(\d{8}-\d{4})/) || [])[1];
  ok(/_02_エレピ_\d{8}-\d{4}\.wav$/.test(s1) && /_03_ベース_\d{8}-\d{4}\.wav$/.test(s2) && st1 && st1 === st2 && s3 === s1.replace(/\.wav$/, "-2.wav") && JSON.stringify(D.project()) === keep, "stems: 曲名_02_エレピ_日時.wav … one set shares the date and time; the same track again → -2; the song unchanged", [s1, s2, s3]);
  // 5. マイテンプレートの書き出し
  try { W.localStorage.removeItem(X.MY_KEY); } catch (e) {}
  var cap = X.myCapture(D.project(), null, "わたしの曲"); X.mySave(cap.item);
  X.ui.tab = "my"; D.xmas.host.render();
  var html0 = R.innerHTML;
  ok(html0.indexOf("マイテンプレート 1 / 20") >= 0, "my templates: one saved");
  try { W.localStorage.removeItem(X.MY_KEY); } catch (e2) {}
  A.stop();
};
