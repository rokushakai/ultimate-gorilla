// §345 A14: Style Match の検証用の音（すべてここで合成する・外の素材は使わない・決まった乱数）
// 実演奏の代わりではない（合成の音で当たっても、実演奏で当たるとは限らない）
"use strict";

var SR = 22050;
function rng(seed) { var s = seed >>> 0 || 1; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
// ウクレレの弦（Karplus-Strong・ナイロンらしく早めに減る）
function pluck(d, at, freq, amp, r, len) {
  var p = Math.max(2, Math.round(SR / freq)), buf = new Float32Array(p), i, a0 = Math.round(at * SR), n = Math.round((len || 1.2) * SR), idx = 0;
  for (i = 0; i < p; i++) { buf[i] = (r() * 2 - 1) * amp; }
  for (i = 0; i < n && a0 + i < d.length; i++) {
    var j = idx % p, nx = (idx + 1) % p, v = buf[j];
    if (a0 + i >= 0) { d[a0 + i] += v; }
    buf[j] = 0.497 * (v + buf[nx]); idx++;
  }
}
// 声（のこぎり波 → 母音のフォルマント 3 つ・ビブラート）。notes: [[秒, 長さ, MIDI]]。hum: 鼻歌（こもった音）
function voice(d, notes, amp, r, hum, wob) {
  var fm = hum ? [[250, 60], [2200, 150], [2900, 200]] : [[700, 90], [1150, 110], [2700, 160]], ph = 0, i, k;
  var st = fm.map(function () { return [0, 0]; });
  for (k = 0; k < notes.length; k++) {
    var a0 = Math.round(notes[k][0] * SR), n = Math.round(notes[k][1] * SR), f0 = hz(notes[k][2]);
    for (i = 0; i < n && a0 + i < d.length; i++) {
      var t = i / SR, cents = wob ? (wob * Math.sin(2 * Math.PI * 0.7 * t + k) + (t < 0.12 ? -wob * (1 - t / 0.12) : 0)) : 0, vib = (1 + (wob ? 0.02 : 0.012) * Math.sin(2 * Math.PI * 5.5 * t) * Math.min(1, t * 3)) * Math.pow(2, cents / 1200), env = Math.min(1, t * 12) * Math.min(1, (n - i) / (SR * 0.06));
      ph += 2 * Math.PI * f0 * vib / SR; if (ph > Math.PI) { ph -= 2 * Math.PI; }
      var src = (ph / Math.PI) * (hum ? 0.4 : 1) + (hum ? Math.sin(ph) * 0.8 : 0) + (r() * 2 - 1) * 0.02, out = 0, q;
      for (q = 0; q < fm.length; q++) { // 2 次の共振（バンドパス）
        var fc = fm[q][0], bw = fm[q][1], R = Math.exp(-Math.PI * bw / SR), th = 2 * Math.PI * fc / SR, y = (1 - R) * src + 2 * R * Math.cos(th) * st[q][0] - R * R * st[q][1];
        st[q][1] = st[q][0]; st[q][0] = y; out += y;
      }
      if (a0 + i >= 0) { d[a0 + i] += out * amp * env; }
    }
  }
}
var UKE = [67, 60, 64, 69]; // G C E A（リエントラント）
var CH = { C: [0, 4, 7], Am: [9, 12, 16], F: [5, 9, 12], G: [7, 11, 14], Dm: [2, 5, 9], Em: [4, 7, 11], E7: [4, 8, 14] };
// コードの形（ウクレレの 4 本の弦で、いちばん近いコードの音）
function voicing(root, name) {
  var pcs = CH[name].map(function (x) { return (x + root) % 12; });
  return UKE.map(function (s) { var b = s, k; for (k = 0; k < 12; k++) { if (pcs.indexOf((s + k) % 12) >= 0) { return s + k; } } return b; });
}
// o: { kind, bpm, meter（"4/4"｜"3/4"｜"6/8"）, root, prog（["C","Am"...]）, sec, swing（0〜1）, jitter（秒）, drift（テンポのゆれの割合）, seed }
function make(o) {
  var r = rng(o.seed || 7), sec = o.sec || 16, d = new Float32Array(Math.round(sec * SR)), i;
  if (o.kind === "silence") { return d; }
  if (o.kind === "noise" || o.kind === "pink" || o.kind === "hum50") {
    var b0 = 0, b1 = 0, b2 = 0;
    for (i = 0; i < d.length; i++) {
      var wv = r() * 2 - 1;
      if (o.kind === "noise") { d[i] = wv * 0.2; }
      else if (o.kind === "pink") { b0 = 0.99765 * b0 + wv * 0.099; b1 = 0.963 * b1 + wv * 0.2965; b2 = 0.57 * b2 + wv * 1.0527; d[i] = (b0 + b1 + b2 + wv * 0.1848) * 0.05; }
      else { d[i] = 0.2 * Math.sin(2 * Math.PI * 50 * i / SR) + 0.06 * Math.sin(2 * Math.PI * 150 * i / SR) + wv * 0.01; }
    }
    return d;
  }
  var bpm = o.bpm, compound = o.meter === "6/8" || o.meter === "12/8", perBar = o.meter === "3/4" ? 3 : (o.meter === "6/8" ? 2 : 4), beatSec = 60 / bpm; // 6/8 は付点 4 分を 1 拍（1 小節 2 拍・1 拍を 3 つに分ける）
  var root = o.root || 0, prog = o.prog || ["C", "G", "Am", "F"], t = 0, beat = 0, mel = [], scale = o.minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
  while (t < sec) {
    var bar = Math.floor(beat / perBar), pos = beat % perBar, chord = prog[bar % prog.length], v = voicing(root, chord), jit = function () { return (r() * 2 - 1) * (o.jitter || 0); };
    var spb = beatSec * (1 + (o.drift ? o.drift * Math.sin(beat / 7) : 0)), acc = pos === 0 ? 1 : 0.62;
    if (o.kind === "strum" || o.kind === "vocal") {
      // 下ろし（拍の頭）と上げ（裏・スイングなら 2/3）。6/8 は 3 つに分けて ↓↑↓
      var subs = compound ? [0, 1 / 3, 2 / 3] : [0, o.swing ? 0.5 + o.swing / 6 : 0.5];
      subs.forEach(function (sb, si) {
        var at = t + sb * spb + jit(), up = si % 2 === 1, order = up ? v.slice().reverse() : v, g = (si === 0 ? acc : 0.45) * 0.55;
        order.forEach(function (m, k) { pluck(d, at + k * 0.012, hz(m), g * (up ? 0.7 : 1), r, 0.9); });
      });
    } else if (o.kind === "arp" || o.kind === "humarp") {
      var pat = compound ? [1, 2, 3] : [1, 3], idx = [0, 2, 1, 3];
      pat.forEach(function (_, si) { var at = t + si * spb / pat.length + jit(); pluck(d, at, hz(v[idx[(pos * pat.length + si) % 4]]), (si === 0 ? acc : 0.5) * 0.7, r, 1.4); });
    }
    if ((o.kind === "vocal" || o.kind === "hum") && pos === 0) {
      // 歌（1 小節に 2 つ・コードの音と音階の音）
      var cr = root + CH[chord][0] + 60, bl = spb * perBar;
      mel.push([t + 0.02, bl * 0.48, cr + 12 * 0 + (r() < 0.5 ? CH[chord][1] - CH[chord][0] : 0)]);
      mel.push([t + bl * 0.5, bl * 0.45, root + 60 + scale[Math.floor(r() * 7)]]);
    }
    t += spb; beat++;
  }
  if (o.kind === "vocal" || o.kind === "hum") { voice(d, mel, o.kind === "hum" ? 0.05 : 0.04, r, o.kind === "hum", o.wobble || 0); }
  return d;
}
// 検証の一覧（正解つき）。meter の正解: 3/4・4/4・6/8。key: 主音（0〜11）と maj／min
function corpus() {
  var L = [], bpms = [72, 96, 120, 150], i;
  for (i = 0; i < bpms.length; i++) {
    L.push({ id: "strum44-" + bpms[i], kind: "strum", bpm: bpms[i], meter: "4/4", root: 0, prog: ["C", "G", "Am", "F"], key: [0, "maj"], seed: 11 + i });
    L.push({ id: "strum34-" + bpms[i], kind: "strum", bpm: bpms[i], meter: "3/4", root: 7, prog: ["C", "Dm", "G", "C"], key: [7, "maj"], seed: 21 + i });
    L.push({ id: "arp44-" + bpms[i], kind: "arp", bpm: bpms[i], meter: "4/4", root: 9, prog: ["C", "F", "G", "C"], key: [9, "maj"], seed: 31 + i });
    L.push({ id: "vocal44-" + bpms[i], kind: "vocal", bpm: bpms[i], meter: "4/4", root: 2, prog: ["C", "Am", "F", "G"], key: [2, "maj"], seed: 41 + i });
  }
  [60, 80].forEach(function (b, j) { L.push({ id: "strum68-" + b, kind: "strum", bpm: b, meter: "6/8", root: 5, prog: ["C", "F", "G", "C"], key: [5, "maj"], seed: 51 + j }); L.push({ id: "arp68-" + b, kind: "arp", bpm: b, meter: "6/8", root: 0, prog: ["Am", "Dm", "E7", "Am"], key: [9, "min"], minor: true, seed: 55 + j }); });
  L.push({ id: "strumMin-100", kind: "strum", bpm: 100, meter: "4/4", root: 0, prog: ["Am", "Dm", "E7", "Am"], key: [9, "min"], minor: true, seed: 61 });
  L.push({ id: "swing-112", kind: "strum", bpm: 112, meter: "4/4", root: 0, prog: ["C", "Am", "Dm", "G"], key: [0, "maj"], swing: 1, seed: 62 });
  L.push({ id: "hum-90", kind: "hum", bpm: 90, meter: "4/4", root: 4, prog: ["C", "G", "Am", "F"], key: [4, "maj"], seed: 63 });
  L.push({ id: "hum-70-34", kind: "hum", bpm: 70, meter: "3/4", root: 0, prog: ["C", "F", "G", "C"], key: [0, "maj"], seed: 64 });
  L.push({ id: "loose-100", kind: "strum", bpm: 100, meter: "4/4", root: 0, prog: ["C", "G", "Am", "F"], key: [0, "maj"], jitter: 0.03, drift: 0.06, seed: 65 });
  L.push({ id: "loose-84-34", kind: "strum", bpm: 84, meter: "3/4", root: 0, prog: ["C", "F", "G", "C"], key: [0, "maj"], jitter: 0.035, drift: 0.07, seed: 66 });
  // §345 A18: 12/8・スイング・速いストローク・音程のゆれる鼻歌と歌
  L.push({ id: "strum128-60", kind: "strum", bpm: 60, meter: "12/8", root: 0, prog: ["C", "Am", "F", "G"], key: [0, "maj"], seed: 71 });
  L.push({ id: "arp128-70", kind: "arp", bpm: 70, meter: "12/8", root: 7, prog: ["C", "F", "G", "C"], key: [7, "maj"], seed: 72 });
  L.push({ id: "swing-96", kind: "strum", bpm: 96, meter: "4/4", root: 5, prog: ["C", "Am", "Dm", "G"], key: [5, "maj"], swing: 1, seed: 73 });
  L.push({ id: "strum44-160", kind: "strum", bpm: 160, meter: "4/4", root: 0, prog: ["C", "G", "Am", "F"], key: [0, "maj"], seed: 74 });
  L.push({ id: "hum-wobble-80", kind: "hum", bpm: 80, meter: "4/4", root: 2, prog: ["C", "G", "Am", "F"], key: [2, "maj"], wobble: 40, seed: 75 });
  L.push({ id: "vocal-wobble-100", kind: "vocal", bpm: 100, meter: "4/4", root: 7, prog: ["C", "F", "G", "C"], key: [7, "maj"], wobble: 35, seed: 76 });
  L.push({ id: "silence", kind: "silence", none: true });
  L.push({ id: "noise", kind: "noise", none: true, seed: 67 });
  L.push({ id: "pink", kind: "pink", none: true, seed: 68 });
  L.push({ id: "hum50", kind: "hum50", none: true, seed: 69 });
  return L;
}
module.exports = { SR: SR, make: make, corpus: corpus };
