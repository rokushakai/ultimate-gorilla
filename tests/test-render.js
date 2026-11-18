// §345 A15: 書き出しの再現性（同じ曲・同じ設定なら、ページを開きなおしても同じ音になる材料）
"use strict";
var H = require("./harness");
var ok = H.ok;

module.exports = async function () {
  H.suite("render");
  // 1. 音の準備・残響の作りで Math.random を使わない
  var e1 = H.load(), W1 = e1.window, used = 0, VM = require("vm"), mr = VM.runInContext("Math", e1.ctx), keepR = mr.random;
  mr.random = function () { used++; return keepR(); };
  var U1 = W1.UGMelody, ac1 = U1.audioInit(), fx1 = U1.buildFx ? U1.buildFx(ac1, ac1.createGain()) : null;
  mr.random = keepR;
  ok(ac1 && fx1 && used === 0, "audio init and the reverb do not use Math.random (the noise and the reverb tail are made from a fixed seed)", used);
  // 2. ノイズはページを開きなおしても同じ
  var e2 = H.load(), U2 = e2.window.UGMelody; U2.audioInit();
  var n1 = U1.audio.noise.getChannelData(0), n2 = U2.audio.noise.getChannelData(0), same = n1.length === n2.length && n1.length > 1000, nz = 0, i;
  for (i = 0; i < n1.length && same; i++) { if (n1[i] !== n2[i]) { same = false; } if (n1[i] !== 0) { nz++; } }
  var mean = 0; for (i = 0; i < n1.length; i++) { mean += n1[i]; } mean /= n1.length;
  ok(same && nz > n1.length * 0.99 && Math.abs(mean) < 0.02, "the noise buffer is the same after reopening the page, and is still noise (centered, not silent)", [n1.length, nz, mean]);
  // 3. シードつきの乱数
  var r1 = U1.seedRand(42), r2 = U1.seedRand(42), r3 = U1.seedRand(43), a = [], b = [], c = [];
  for (i = 0; i < 5; i++) { a.push(r1()); b.push(r2()); c.push(r3()); }
  ok(JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(a) !== JSON.stringify(c) && a.every(function (x) { return x >= 0 && x < 1; }), "the seeded random: the same seed gives the same numbers, another seed others (0 ≤ x < 1)", a);
  // 4. 楽器の録音は 44.1kHz で展開する
  ok(U1.decodeRate() === 44100 && U2.decodeRate() === 44100, "instrument samples are decoded at 44.1 kHz (not at the playback rate), so the WAV is the same on every device", U1.decodeRate());
  // 5. 書き出しの記録（指紋）: 同じ曲を 2 回 → 同じ指紋
  var e3 = H.load(), W3 = e3.window, D3 = W3.UGDaw, A3 = W3.UGArcade, R3 = H.makeEl("div");
  A3.start("daw", R3, {}); D3.proj.create("demo");
  async function wavOnce() { var done = false; D3.wav.start(function () { done = true; }); for (var g = 0; g < 4000 && !done; g++) { await e3.wait(5); } return D3.wav.state(); }
  var w1 = await wavOnce(), d1 = w1.diag, w2 = await wavOnce(), d2 = w2.diag;
  ok(w1.state === "done" && d1 && /^[0-9a-f]{8}$/.test(d1.fp) && d2 && d2.fp === d1.fp && JSON.stringify(d2.prof) === JSON.stringify(d1.prof) && d1.prof.length >= 1 && d1.dec === 44100 && d1.frames > 0 && typeof d1.live === "number", "the WAV export keeps a diagnosis (fingerprint, playback / decode rate, drum samples, time); the same song twice → the same fingerprint", [d1, d2 && d2.fp]);
  ok(R3.innerHTML.indexOf("dp-diag") < 0, "the diagnosis is not shown on the normal screen (only with ?debug=1)");
  A3.stop();
};
