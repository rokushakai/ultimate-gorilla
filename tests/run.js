// 究極ゴリラ 自動テスト: node tests/run.js
"use strict";
var H = require("./harness");
var suites = [require("./test-core"), require("./test-melody"), require("./test-lyrics"), require("./test-table"), require("./test-sports"), require("./test-chords"), require("./test-script")];

(async function () {
  var t0 = Date.now();
  for (var i = 0; i < suites.length; i++) {
    try { await suites[i](); }
    catch (e) { H.ok(false, "suite crashed: " + (e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e)); }
  }
  var s = H.summary(), bySuite = {};
  s.results.forEach(function (r) { var k = r.suite; bySuite[k] = bySuite[k] || { pass: 0, fail: 0 }; bySuite[k][r.pass ? "pass" : "fail"]++; });
  Object.keys(bySuite).forEach(function (k) { console.log("  " + k + ": " + bySuite[k].pass + " passed" + (bySuite[k].fail ? ", " + bySuite[k].fail + " FAILED" : "")); });
  console.log((s.fail ? "FAIL" : "OK") + " — " + s.pass + " passed, " + s.fail + " failed (" + ((Date.now() - t0) / 1000).toFixed(1) + "s)");
  process.exit(s.fail ? 1 : 0);
})();
