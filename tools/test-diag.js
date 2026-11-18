// §345 A15: テストを診断つきで回す（Node の異常終了の調べ方）
//   node tools/test-diag.js [ログのファイル]   （無ければ tests/diag-<時刻>.log ではなく OS の一時フォルダーに書く）
// tests/run.js と同じ順にスイートを回し、スイートを始めるたびに「時刻・プロセスのメモリ・PC の空きメモリ」を
// ファイルへ同期で書く（落ちてもそこまでは残る）。終わりに合計と終了コードを書く。
// Segmentation fault などで落ちたときは、ログの最後の行のスイートの途中で落ちている。
// 同じところで何度も落ちる → コードの問題の可能性。毎回ちがうところ・Windows のサービスも落ちている → PC（メモリ・ストレージ）を先に点検する
"use strict";
var fs = require("fs"), path = require("path"), os = require("os");
var ROOT = path.join(__dirname, ".."), runSrc = fs.readFileSync(path.join(ROOT, "tests", "run.js"), "utf8");
var names = (runSrc.match(/require\("\.\/(test-[a-z0-9-]+)"\)/g) || []).map(function (s) { return s.replace(/^require\("\.\/|"\)$/g, ""); });
var log = process.argv[2] || path.join(os.tmpdir(), "ug-test-diag-" + new Date().toISOString().replace(/[:.]/g, "-") + ".log");
function mb(n) { return Math.round(n / 1048576); }
function w(s) { fs.appendFileSync(log, new Date().toISOString() + " " + s + "\n"); }
w("start node " + process.version + " " + os.platform() + " " + os.release() + " cpus " + os.cpus().length + " (" + (os.cpus()[0] || {}).model + ") RAM " + mb(os.totalmem()) + "MB free " + mb(os.freemem()) + "MB pid " + process.pid);
process.on("exit", function (code) { try { w("exit code " + code + " rss " + mb(process.memoryUsage().rss) + "MB free " + mb(os.freemem()) + "MB"); } catch (e) {} });
var H = require(path.join(ROOT, "tests", "harness")), t0 = Date.now();
(async function () {
  for (var i = 0; i < names.length; i++) {
    var m = process.memoryUsage();
    w("suite " + names[i] + " rss " + mb(m.rss) + "MB heap " + mb(m.heapUsed) + "MB ext " + mb(m.external) + "MB free " + mb(os.freemem()) + "MB");
    try { await require(path.join(ROOT, "tests", names[i]))(); } catch (e) { H.ok(false, "suite crashed: " + e); }
  }
  var s = H.summary();
  w("end pass " + s.pass + " fail " + s.fail + " " + ((Date.now() - t0) / 1000).toFixed(1) + "s");
  console.log((s.fail ? "FAIL" : "OK") + " — " + s.pass + " passed, " + s.fail + " failed  log: " + log);
  if (s.fail) { s.results.filter(function (r) { return !r.pass; }).slice(0, 10).forEach(function (r) { console.log("  ✗ [" + r.suite + "] " + r.name); }); }
  process.exit(s.fail ? 1 : 0);
})();
