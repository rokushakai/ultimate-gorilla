// §345 A34: スマホの速さ（アレンジの DOM をへらす・フリーズの音声を 1 チャンネルに・バウンスは 2 チャンネル）
"use strict";
var H = require("./harness");
var ok = H.ok;

module.exports = async function () {
  H.suite("perf");
  var env = H.load(), W = env.window, X = W.UGXmas, D = W.UGDaw, A = W.UGArcade, M = W.UGDawModel, R = H.makeEl("div");
  A.start("daw", R, {});
  D.xmas.host.newSong(X.tplNewProject(X.tplPlan(null, "pop", "new", 1, 1, "full128")).project); D.xmas.host.back();
  var p = D.project(); D.xmas.host.render();
  var html = R.innerHTML, clips = [], notes = 0;
  p.tracks.forEach(function (t) { t.clips.forEach(function (c) { if (c.type === "midi" && c.notes.length) { var n = c.notes.filter(function (x) { return x[0] < c.len; }).length; clips.push([c.id, n]); notes += n; } }); });
  // 1. クリップごとに SVG 1 つ・線の数 ＝ 音符の数
  var badC = clips.filter(function (x) { var i = html.indexOf('data-clip="' + x[0] + '"'), j = html.indexOf('data-clip="', i + 5), part = html.substring(i, j < 0 ? html.length : j), sv = (part.match(/class="daw-minis"/g) || []).length, seg = (part.match(/M\d+ [\d.]+h\d+/g) || []).length; return sv !== 1 || seg !== x[1]; });
  ok(clips.length > 30 && badC.length === 0 && html.indexOf('class="daw-mini"') < 0, "every clip with notes has one SVG line with exactly one segment per note (" + notes + " notes in " + clips.length + " clips); no per-note elements", badC.slice(0, 3));
  // 2. DOM の大きさの目安: タグの数
  var tags = (html.match(/<[a-z]/g) || []).length;
  ok(tags < notes / 3, "128 bars: the arrangement has " + tags + " tags for " + notes + " notes (it was one tag per note before)");
  // 3. フリーズ: 左右が同じなら 1 チャンネル・鳴らせる
  var nl0 = X.needLoad, sr0 = W.UGMelody.sampleReady; X.needLoad = function () { return false; }; W.UGMelody.sampleReady = function () { return true; };
  D.xmas.host.newSong(X.tplNewProject(X.tplPlan(null, "pop", "new", 1, 1, "std")).project); D.xmas.host.back(); p = D.project(); // 短い曲（この Node の模擬は長い曲を区切って描けないため・1 分まで）
  var t = p.tracks.filter(function (x) { return !M.isDrum(x) && x.clips.some(function (c) { return c.notes.length; }); })[0];
  t.pan = 0;
  var r = await new Promise(function (res) { D.frz.make(t.id, true, function (x) { res(x); }); });
  var fb = D.frz.info().buf[t.id];
  var L = fb && fb.buf.getChannelData(0), chs = fb ? fb.buf.numberOfChannels : 0;
  ok(r.ok && (chs === 1 || chs === 2), "freeze made (" + chs + " channel" + (chs === 1 ? ", left and right were identical" : "s") + ")", r.why);
  ok(D.frz.bytes() === fb.buf.length * chs * 4 && /MB/.test(D.frz.html(t.id)), "the memory count follows the channel count (" + Math.round(D.frz.bytes() / 1048576 * 10) / 10 + " MB)");
  D.clearLog(); D.play(); var ac = D.player().ac, g = 0, to = ac.currentTime + 2; while (ac.currentTime < to && g++ < 1000) { ac.currentTime += 0.025; D.pump(); } D.stop();
  var lg = D.log().filter(function (x) { return x.track === t.id; });
  ok(lg.length >= 1 && lg.every(function (x) { return x.frz && x.ok; }), "the frozen audio plays (" + chs + " ch)");
  // 4. バウンスは 2 チャンネルの WAV（トラックのパンで −3dB にならないように）。この道をかならず通すため、フリーズの音声を 1 チャンネルにして確かめる
  var ctx = W.UGMelody.audio.ctx || (W.UGMelody.audioInit && W.UGMelody.audioInit()), mono = ctx.createBuffer(1, fb.buf.length, fb.buf.sampleRate); mono.getChannelData(0).set(fb.buf.getChannelData(0));
  fb.buf = mono;
  var enc0 = W.UGMelody.encodeWav, seen = null, err = null, same = null; W.UGMelody.encodeWav = function (b) { seen = b.numberOfChannels; try { same = b.getChannelData(0) === b.getChannelData(1) || b.getChannelData(0).every(function (x, k) { return x === b.getChannelData(1)[k]; }); } catch (e) { err = String(e); } return enc0(b); };
  var bres = await new Promise(function (res) { var started = false; try { started = D.frz.bounce(t.id, function (x) { res(x || {}); }); } catch (e) { err = String(e); } if (!started) { res({ ok: false, why: D.frz.info().msg }); } });
  W.UGMelody.encodeWav = enc0;
  ok(seen === 2 && same === true && !err, "bouncing a 1-channel freeze writes a 2-channel WAV with the same left and right (no error)", [seen, same, err, bres.why]);
  X.needLoad = nl0; W.UGMelody.sampleReady = sr0;
  A.stop();
};
