// 究極ゴリラ 自動テスト: node tests/run.js
"use strict";
var H = require("./harness");
var suites = [require("./test-core"), require("./test-melody"), require("./test-lyrics"), require("./test-table"), require("./test-sports"), require("./test-chords"), require("./test-quiz"), require("./test-piano"), require("./test-drum"), require("./test-bass"), require("./test-guitar"), require("./test-strings"), require("./test-horn"), require("./test-synth"), require("./test-daw"), require("./test-xmas"), require("./test-arranger"), require("./test-workflow"), require("./test-style"), require("./test-render"), require("./test-export"), require("./test-handoff"), require("./test-ced"), require("./test-transport"), require("./test-loop"), require("./test-flow2"), require("./test-assist"), require("./test-phrase"), require("./test-harmony"), require("./test-finish"), require("./test-humanize"), require("./test-auto2"), require("./test-link"), require("./test-mixa"), require("./test-render2"), require("./test-script"), require("./test-debugcenter")];

(async function () {
  var t0 = Date.now();
  for (var i = 0; i < suites.length; i++) {
    try { await suites[i](); }
    catch (e) { H.ok(false, "suite crashed: " + (e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e)); }
  }
  var s = H.summary(), bySuite = {};
  s.results.forEach(function (r) { var k = r.suite; bySuite[k] = bySuite[k] || { pass: 0, fail: 0 }; bySuite[k][r.pass ? "pass" : "fail"]++; });
  Object.keys(bySuite).forEach(function (k) { console.log("  " + k + ": " + bySuite[k].pass + " passed" + (bySuite[k].fail ? ", " + bySuite[k].fail + " FAILED" : "")); });
  console.log((s.fail ? "FAIL" : "OK") + " — " + s.pass + " passed, " + s.fail + " failed (" + ((Date.now() - t0) / 1000).toFixed(1) + "s)" + (s.fail ? "  再現: UG_SEED=" + H.SEED + " node tests/run.js  失敗: " + s.results.filter(function (r) { return !r.pass; }).map(function (r) { return "[" + r.suite + "] " + r.name; }).join(" / ") : ""));
  process.exit(s.fail ? 1 : 0);
})();
