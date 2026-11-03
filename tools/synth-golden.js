// §330 Phase 0: いまのゴリラシンセ（patch v1）の音を本物の Chrome で書き出して、数値の「基準」を作る・くらべる
//   node tools/synth-golden.js            → tests/fixtures/synth-v1-golden.json とくらべる（ずれを表示・ずれたら終了コード 1）
//   node tools/synth-golden.js --write    → 基準を書きなおす（エンジンを変えるまえに1回だけ）
// 書き出し: プリセット12 × 音 36・60・84。強さ 0.8・1.0 秒のばしてはなす。OfflineAudioContext 44100Hz モノラル 2.5 秒
// 数値: 50ms ごとの RMS（50個）・ピーク・はじめの 0.5 秒と 0.5〜0.8 秒の音の重心（Hz）
// のばす長さを立ち上がり（いちばん長いプリセットで 0.8 秒）より長くしているのは、§330 の不具合 B2（のばす長さが立ち上がり以下だと無音になる）をさけるため
// Chrome が要る（C:/Program Files/Google/Chrome/Application/chrome.exe か CHROME 環境変数）
var cp = require("child_process"), fs = require("fs"), path = require("path");
var ROOT = path.join(__dirname, ".."), OUT = path.join(ROOT, "tests", "fixtures", "synth-v1-golden.json");
var CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe", PORT = 9450;
var WRITE = process.argv.indexOf("--write") >= 0;
var URL0 = "file:///" + path.join(ROOT, "index.html").replace(/\\/g, "/");
var prof = path.join(require("os").tmpdir(), "ug-synth-golden-profile");
var ch = cp.spawn(CHROME, ["--headless=new", "--disable-gpu", "--autoplay-policy=no-user-gesture-required", "--allow-file-access-from-files", "--remote-debugging-port=" + PORT, "--user-data-dir=" + prof, URL0], { stdio: "ignore" });
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
// ページで動かす: 全プリセット・3音を書き出して数値にする
var PAGE = function () {
  var Y = window.UGSynth, M = window.UGMelody, out = {}, jobs = [];
  M.audioInit();
  function centroid(d, a, b, sr) {
    var N = 2048, s0 = 0, s1 = 0, st, k, n;
    for (st = a; st + N <= b; st += N) {
      for (k = 1; k < N / 2; k += 4) {
        var re = 0, im = 0;
        for (n = 0; n < N; n += 2) { var w = d[st + n] * (0.5 - 0.5 * Math.cos(2 * Math.PI * n / N)), ph = 2 * Math.PI * k * n / N; re += w * Math.cos(ph); im -= w * Math.sin(ph); }
        var mag = Math.sqrt(re * re + im * im); s0 += mag; s1 += mag * k * sr / N;
      }
    }
    return s0 > 0 ? Math.round(s1 / s0) : 0;
  }
  Y.PRESETS.forEach(function (pr) {
    [36, 60, 84].forEach(function (m) {
      jobs.push(function () {
        var sr = 44100, off = new OfflineAudioContext(1, sr * 2.5, sr), save = M.audio.ctx;
        M.audio.ctx = off;
        try { Y.note(Y.preset(pr[0]).patch, m, off.destination, 0, 0.8, 1.0); } finally { M.audio.ctx = save; }
        return off.startRendering().then(function (buf) {
          var d = buf.getChannelData(0), rms = [], pk = 0, i, j;
          for (i = 0; i < d.length; i++) { pk = Math.max(pk, Math.abs(d[i])); }
          for (j = 0; j < 50; j++) { var s = 0; for (i = j * 2205; i < (j + 1) * 2205; i++) { s += d[i] * d[i]; } rms.push(Math.round(Math.sqrt(s / 2205) * 10000) / 10000); }
          out[pr[0] + "@" + m] = { peak: Math.round(pk * 10000) / 10000, rms: rms, c1: centroid(d, 0, sr * 0.5, sr), c2: centroid(d, sr * 0.5, sr * 0.8, sr) };
        });
      });
    });
  });
  return jobs.reduce(function (p, f) { return p.then(f); }, Promise.resolve()).then(function () { return JSON.stringify(out); });
};
(async function () {
  var list; for (var i = 0; i < 60; i++) { try { list = await (await fetch("http://127.0.0.1:" + PORT + "/json/list")).json(); if (list.some(function (t) { return t.type === "page"; })) { break; } } catch (e) {} await sleep(250); }
  await sleep(2000);
  var page = list.filter(function (t) { return t.type === "page"; })[0], ws = new WebSocket(page.webSocketDebuggerUrl), res;
  await new Promise(function (r) { ws.onopen = r; });
  res = await new Promise(function (r) { ws.onmessage = function (m) { var d = JSON.parse(m.data); if (d.id === 1) { r(d); } }; ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression: "(" + PAGE.toString() + ")()", awaitPromise: true, returnByValue: true } })); });
  ws.close(); ch.kill();
  if (!res.result || !res.result.result || typeof res.result.result.value !== "string") { console.log("FAIL", JSON.stringify(res).slice(0, 400)); process.exit(1); }
  var now = JSON.parse(res.result.result.value), keys = Object.keys(now);
  if (WRITE) {
    fs.writeFileSync(OUT, JSON.stringify({ note: "§330 ゴリラシンセ patch v1 の基準（tools/synth-golden.js --write で作成）", made: new Date().toISOString().slice(0, 10), chrome: "headless", renders: now }, null, 1));
    console.log("wrote", OUT, keys.length, "renders");
    process.exit(0);
  }
  var base = JSON.parse(fs.readFileSync(OUT, "utf8")).renders, bad = [];
  keys.forEach(function (k) {
    var a = base[k], b = now[k];
    if (!a) { bad.push(k + ": 基準がない"); return; }
    // ずれの許し: RMS は大きいほうの 3%（または 0.0005）、重心は 3%、ピークは 3%
    var worst = 0;
    for (var j = 0; j < 50; j++) { var tol = Math.max(0.0005, Math.max(a.rms[j], b.rms[j]) * 0.03); worst = Math.max(worst, Math.abs(a.rms[j] - b.rms[j]) / tol); }
    var cOk = Math.abs(a.c1 - b.c1) <= Math.max(20, a.c1 * 0.03) && Math.abs(a.c2 - b.c2) <= Math.max(20, a.c2 * 0.03), pOk = Math.abs(a.peak - b.peak) <= Math.max(0.002, a.peak * 0.03);
    if (worst > 1 || !cOk || !pOk) { bad.push(k + ": rms " + worst.toFixed(2) + "× / 重心 " + a.c1 + "→" + b.c1 + "・" + a.c2 + "→" + b.c2 + " / ピーク " + a.peak + "→" + b.peak); }
  });
  console.log(bad.length ? "DIFF " + bad.length + "/" + keys.length + "\n  " + bad.join("\n  ") : "OK " + keys.length + " renders match the v1 baseline");
  process.exit(bad.length ? 1 : 0);
})().catch(function (e) { console.log("FAIL", e); ch.kill(); process.exit(1); });
