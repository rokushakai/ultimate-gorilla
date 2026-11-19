// §345 A31: 書き出しのキャッシュ（同じ曲・同じ設定ならバイトまで同じ WAV・何か変われば描きなおす）
"use strict";
var H = require("./harness");
var ok = H.ok;

module.exports = async function () {
  H.suite("render2");
  var env = H.load(), W = env.window, X = W.UGXmas, D = W.UGDaw, A = W.UGArcade, M = W.UGDawModel, R = H.makeEl("div");
  A.start("daw", R, {});
  D.xmas.host.newSong(X.tplNewProject(X.tplPlan(null, "pop", "new", 1, 1, "std")).project); D.xmas.host.back();
  var p = D.project(), C = D.wav.cache;
  function rend(ro) { return new Promise(function (res) { D.wav.render(function (blob, why, stt) { res({ blob: blob, why: why, stt: stt }); }, ro || {}); }); }
  async function bytes(b) { var ab = b.arrayBuffer ? await b.arrayBuffer() : null; return ab ? Array.prototype.slice.call(new Uint8Array(ab), 0, 4000).join(",") + ":" + ab.byteLength : ""; }
  // Node では楽器の録音を読みこまないので「読みこみ済み」にしてから（読みこみ中のときは、下でしまわないことを確かめる）
  var nl0 = X.needLoad, sr0 = W.UGMelody.sampleReady; X.needLoad = function () { return false; }; W.UGMelody.sampleReady = function () { return true; };
  C.clear();
  var a = await rend(), s0 = C.state();
  ok(a.blob && s0.has && s0.stores >= 1 && s0.skip === "", "the first render is stored in the cache", s0);
  var h0 = C.state().hits, b = await rend();
  ok(b.blob === a.blob && C.state().hits === h0 + 1 && C.state().last && C.state().last.same && C.state().last.maxAbs <= 1 && (await bytes(b.blob)) === (await bytes(a.blob)), "the same song again: rendered again, compared (difference " + JSON.stringify(C.state().last) + "), and the earlier WAV is returned (byte-identical)");
  var c = await rend({ noCache: true });
  ok(c.blob && c.blob !== a.blob && C.state().hits === h0 + 1, "noCache returns the fresh render as it is (used to measure the engine itself)");
  // 鍵が同じでも、本当に大きな差があれば新しい音（そろえない）
  var enc0 = W.UGMelody.encodeWav; W.UGMelody.encodeWav = function (buf) { var d = buf.getChannelData(0), k = 0; for (; k < d.length && k < 50000; k += 997) { d[k] = 0.5; } return enc0(buf); };
  var big0 = C.state().big, bb = await rend(); W.UGMelody.encodeWav = enc0;
  ok(bb.blob !== a.blob && C.state().big === big0 + 1 && C.state().last.maxAbs > 1, "same key but a real difference (max " + C.state().last.maxAbs + ") → the new WAV is used, not the old one", C.state().last);
  var b2 = await rend();
  // 音に関係ないもの（自動保存の時刻・練習のループ）は描きなおさない
  p.saved = Date.now() + 5; p.practice = { loopA: 0, loopB: 3840, loopOn: true };
  var d = await rend();
  ok(d.blob === b2.blob, "autosave time and the practice loop do not change the key");
  // 音が変わるものは描きなおす
  var t = p.tracks.filter(function (x) { return x.clips.some(function (cl) { return cl.notes.length; }); })[0], n0 = t.clips.filter(function (cl) { return cl.notes.length; })[0].notes[0], v0 = n0[3];
  n0[3] = v0 === 0.5 ? 0.6 : 0.5; var e = await rend();
  ok(e.blob !== a.blob, "a changed note velocity → rendered again");
  n0[3] = v0; var e2 = await rend();
  ok(e2.blob !== e.blob, "changing it back → rendered again (only the last result is kept)");
  var UG = W.UGMelody; UG.audioInit(); var A0 = UG.audio, keep = A0.revSend ? A0.revSend.gain.value : null;
  if (A0.revSend) { A0.revSend.gain.value = (keep || 0) + 0.1; }
  var f = await rend();
  ok(!A0.revSend || f.blob !== e2.blob, "a different shared reverb amount → rendered again");
  if (A0.revSend) { A0.revSend.gain.value = keep; }
  var g1 = await rend(), g2 = await rend({ noSend: true }), g3 = await rend({ range: { a: 0, b: 3840 * 2 } });
  ok(g2.blob !== g1.blob && g3.blob !== g2.blob, "stems (no send) and ranges have their own keys");
  p.ext = p.ext || {}; p.ext.xmGroove = 40; var k1 = C.key(); delete p.ext.xmGroove; var k2 = C.key();
  ok(k1 !== k2, "song settings in ext (groove, links) are part of the key");
  // 代わりの音で描いたときは しまわない
  X.needLoad = function () { return true; }; C.clear();
  var r1 = await rend(); X.needLoad = function () { return false; };
  ok(r1.blob && !C.state().has && C.state().skip === "samples", "rendered while instrument samples are still loading → not stored (it would be the stand-in sound)");
  // WAV の書き出しの画面
  C.clear();
  await new Promise(function (res) { D.wav.start(function () { res(); }); }); var w1 = D.wav.state().blob;
  await new Promise(function (res) { D.wav.start(function () { res(); }); }); var w2 = D.wav.state();
  ok(w1 && w2.blob === w1 && w2.cached === true, "WAV export twice: the second is the same file (marked as cached)");
  D.showProject ? D.showProject() : 0;
  ok(typeof w2.cached === "boolean", "the export state says whether it was reused");
  X.needLoad = nl0; W.UGMelody.sampleReady = sr0;
  A.stop();
};
