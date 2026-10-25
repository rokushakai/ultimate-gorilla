// 🎹 メロディくずし（arcade-melody.js）のテスト
"use strict";
var fs = require("fs");
var path = require("path");
var H = require("./harness");
var ok = H.ok;

function patch(src, file) {
  if (file !== "arcade-melody.js") { return src; }
  var from = "var ball = { x: W / 2, y: PY - BR - 1, vx: 0, vy: 0 };\n      var stuck = true, lives = 3, level = 1, bricks = [], span = W";
  if (src.indexOf(from) < 0) { throw new Error("melody patch target missing"); }
  return src.split(from).join("var ball = window.__mb = { x: W / 2, y: PY - BR - 1, vx: 0, vy: 0 };\n      var stuck = true, lives = 3, level = 1, bricks = [], span = W");
}
function baseCfg(over) {
  var c = { mode: "pos", scale: "major", key: 0, sound: true, rec: true, relax: false, prog: null, chord: 1, arp: false, chordAt: "bw", samples: false,
    layout: "pos", oct: 2, rows: 3, scroll: 0, autoTone: true, bpm: 0, quant: 8, groove: "none", progId: "none", pad: true };
  for (var k in over) { if (over.hasOwnProperty(k)) { c[k] = over[k]; } }
  return c;
}
// 追いかけてから最後はわざと落としてゲームを終わらせる
function play(env, cfg, frames) {
  return env.run("melody", { config: cfg }, frames, function (f, e) {
    var b = e.window.__mb;
    e.ptr(f === 0 ? "down" : "move", b.x + Math.sin(f / 31) * 14, 300);
    if (f > frames * 0.6) { e.ptr("move", 5, 300); if (f % 200 === 0) { e.ptr("down", 5, 300); } }
  });
}

module.exports = async function () {
  H.suite("melody");
  var sent = [];
  var port = { id: "gs", name: "Microsoft GS Wavetable Synth", send: function (b, ts) { sent.push({ b: b.slice(), ts: ts }); } };
  var env = H.load({ patch: patch, midiPort: port });
  var M = env.window.UGMelody;
  ok(!!M, "UGMelody test API exists");
  var maj = M.scale("major");

  // --- 位置と音程 ---
  var worst = 0, mono = true;
  M.scales.forEach(function (sc) {
    for (var i = 0; i < 3000; i++) {
      var x = Math.random() * 240, y = Math.random() * 320;
      var d = Math.abs(M.posDegree(sc, x, y) - M.posDegree(sc, x + (Math.random() - 0.5) * 8, y + (Math.random() - 0.5) * 8));
      if (d > worst) { worst = d; }
    }
    var prev = -1;
    for (var xx = 0; xx <= 240; xx += 2) { var m = M.degreeToMidi(sc, 0, M.posDegree(sc, xx, 160)); if (m < prev) { mono = false; } prev = m; }
  });
  ok(worst <= 1, "nearby points differ by at most one scale degree", worst);
  ok(mono, "pitch rises left to right in every scale");

  // --- 和音 ---
  var names = [];
  for (var d = 0; d < 7; d++) { names.push(M.chordName(M.chordMidis(maj, 0, 7 + d, 4, 0))); }
  ok(names.join(" ") === "CM7 Dm7 Em7 FM7 G7 Am7 Bm7(b5)", "C major diatonic sevenths", names.join(" "));
  ok(M.chordName(M.chordMidis(maj, 0, 13, 5, 0)) === "Bm7(b5,b9)", "ninth tension merged into parentheses");
  var bad = 0;
  M.scales.forEach(function (sc) { for (var k = 0; k < 12; k++) { for (var dd = 0; dd < sc.iv.length * 3; dd++) { [1, 3, 4, 5].forEach(function (sz) {
    var ms = M.chordMidis(sc, k, dd, sz, 0); if (ms.length !== sz) { bad++; }
    ms.forEach(function (m) { if (m > 100 || (sc.id !== "chromatic" && sc.iv.indexOf(((m - k) % 12 + 12) % 12) < 0)) { bad++; } });
  }); } } });
  ok(bad === 0, "all chords stay in scale, correct size, <= MIDI 100", bad);

  // --- 音色 ---
  ok(M.patches.length === 128, "128 GM patches");
  ok(M.patches.every(function (p) { return !!M.recipes[p[0]]; }), "every patch has a base recipe");
  var fps = {}; for (var p = 0; p < 128; p++) { fps[JSON.stringify(M.recipe(p))] = 1; }
  ok(Object.keys(fps).length === 128, "all 128 patches sound different", Object.keys(fps).length);
  M.audioInit();
  env.counters.errors.length = 0;
  for (p = 0; p <= 128; p++) { for (var mm = 28; mm <= 100; mm += 12) { M.synth(mm, p, 0, p % 2 ? 0.5 : 1); } }
  for (var dn = 30; dn <= 85; dn++) { M.drum(M.audio.ctx, dn, 1, 1); }
  ok(env.counters.errors.length === 0, "synth + drums schedule no invalid audio params", env.counters.errors.slice(0, 3));
  M.setFx(3, 2);
  ok(M.audio.revSend.gain.value === 0.6 && M.audio.dlySend.gain.value === 0.25, "effects sends follow settings");
  M.setFx(1, 0);

  // --- 配置モード ---
  var wpc = [0, 2, 4, 5, 7, 9, 11];
  for (var oct = 1; oct <= 6; oct++) {
    var lo = M.buildLayout("piano", { rows: 3, oct: oct, scroll: 0 }), notes = {};
    lo.bricks.forEach(function (b) { notes[b.midi] = (notes[b.midi] || 0) + 1; if ((b.kind === "white") !== (wpc.indexOf(b.midi % 12) >= 0)) { notes.bad = 1; } });
    var keys = Object.keys(notes).filter(function (k) { return k !== "bad"; }).map(Number).sort(function (a, b) { return a - b; });
    ok(!notes.bad && keys.length === 12 * oct + 1 && keys[keys.length - 1] - keys[0] === 12 * oct, "piano " + oct + " octaves: real key layout", keys.length);
    ok(keys.every(function (k) { return notes[k] >= (wpc.indexOf(k % 12) >= 0 ? 6 : 3); }), "piano " + oct + " octaves: white keys rows*2 blocks, black keys rows blocks");
  }
  [["guitar", [64, 59, 55, 50, 45, 40]], ["ukulele", [69, 64, 60, 67]], ["bass", [43, 38, 33, 28]]].forEach(function (g) {
    var l = M.buildLayout(g[0], { rows: 3 }), opens = l.bricks.filter(function (b) { return b.fret === 0; }).map(function (b) { return b.midi; });
    ok(opens.join(",") === g[1].join(",") && l.bricks.every(function (b) { return b.midi === opens[b.str] + b.fret; }), g[0] + ": standard tuning and fret math");
  });
  ["drums", "perc"].forEach(function (l) {
    var lay = M.buildLayout(l, { rows: 3 });
    ok(lay.bricks.every(function (b) { return !!M.drumSynth[b.midi]; }), l + ": every pad has a drum sound");
  });
  M.layouts.forEach(function (L) {
    var lay = M.buildLayout(L.id, { rows: 6, oct: 6, scroll: 0, scale: maj, key: 0 }), over = 0;
    for (var i = 0; i < lay.bricks.length; i++) { for (var j = i + 1; j < lay.bricks.length; j++) { var a = lay.bricks[i], b = lay.bricks[j];
      if (a.x0 < b.x0 + b.w - 0.01 && b.x0 < a.x0 + a.w - 0.01 && a.y < b.y + b.h - 0.01 && b.y < a.y + a.h - 0.01) { over++; } } }
    ok(over === 0 && lay.bricks.every(function (b) { return b.y >= 30 && b.y + b.h < 200; }), L.id + ": no overlapping blocks, clear of HUD/paddle", over);
  });

  // --- プレイ＋録音（配置ごと、スクロールあり） ---
  M.layouts.forEach(function (L) {
    play(env, baseCfg({ layout: L.id, rows: 2, scroll: 2, chord: 3 }), 20000);
    var rec = M.loadRecs()[0];
    ok(rec && rec.layout === L.id && rec.notes.length > 0, L.id + ": play is recorded", rec && rec.notes.length);
    var want = { piano: 0, guitar: 25, ukulele: 24, bass: 32, drums: 128, perc: 128 }[L.id];
    if (want !== undefined) { ok(rec.prog.b === want, L.id + ": block tone follows the instrument", rec.prog.b); }
    if (L.id === "drums" || L.id === "perc") { ok(rec.notes.filter(function (n) { return n[2] === "b"; }).every(function (n) { return n[3] === undefined; }), L.id + ": drum blocks never play chords"); }
    ok(rec.notes.every(function (n, i, a) { return i === 0 || n[0] >= a[i - 1][0]; }), L.id + ": recording is in time order");
  });

  // --- パドルを「いつも主音」 ---
  play(env, baseCfg({ key: 2, paddleRoot: true }), 12000);
  var pr = M.loadRecs()[0].notes.filter(function (n) { return n[2] === "s"; });
  ok(pr.length > 0 && pr.every(function (n) { return n[1] === 38; }), "paddleRoot: paddle always plays the tonic (D2 in D)", pr.slice(0, 5).map(function (n) { return n[1]; }));

  // --- テンポ・伴奏・コード進行 ---
  play(env, baseCfg({ bpm: 130, groove: "8beat", progId: "ohdo" }), 12000);
  var rec2 = M.loadRecs()[0], stepMs = 60000 / 130 / 4, grid = stepMs * 2, bar = stepMs * 16;
  function onGrid(t, g) { var r = t / g; return Math.abs(r - Math.round(r)) * g < 1.01; }
  var drums = rec2.notes.filter(function (n) { return n[2] === "d"; }), hits = rec2.notes.filter(function (n) { return n[2] === "b" || n[2] === "w"; });
  ok(drums.length > 100 && drums.every(function (n) { return onGrid(n[0], stepMs); }), "backing drums land on the 16th grid", drums.length);
  var perBar = {}; drums.forEach(function (n) { var b = Math.floor((n[0] + 1) / bar); perBar[b] = (perBar[b] || 0) + 1; });
  var full = Object.keys(perBar).slice(0, -1).map(function (k) { return perBar[k]; });
  ok(full.every(function (c) { return c === 13; }), "8beat has 13 hits per bar", full.slice(0, 8));
  ok(hits.every(function (n) { return onGrid(n[0], grid); }), "hit sounds are quantized to 8th notes");
  var seq = M.progressions[1].seq;
  function chordAt(t) { var c = seq[Math.floor(t / bar + 1e-6) % seq.length]; return M.chordTypes[c[1]].map(function (x) { return (c[0] + x) % 12; }); }
  ok(hits.every(function (n) { return chordAt(n[0]).indexOf(n[1] % 12) >= 0 || chordAt(Math.max(0, n[0] - grid)).indexOf(n[1] % 12) >= 0; }), "with a progression, block/wall notes are chord tones");
  ok(rec2.notes.filter(function (n) { return n[2] === "c"; }).every(function (n) { return onGrid(n[0], bar); }), "pad chords start on bar lines");

  // --- MIDI 書き出し ---
  var bytes = M.midiBytes({ id: 1, date: Date.now(), fxRev: 3, prog: { b: 0, p: 40, w: 128, s: 33, d: 128, c: 48 },
    notes: [[0, 60, "b"], [100, 62, "p"], [200, 50, "w"], [300, 40, "s", 0.5], [400, 36, "d"], [500, 60, "c"]] });
  var q = 22, pcs = [], ons = [], cc = 0;
  function rdv() { var v = 0, c; do { c = bytes[q++]; v = (v << 7) | (c & 0x7F); } while (c & 0x80); return v; }
  while (q < bytes.length) { rdv(); var stt = bytes[q++];
    if (stt === 0xFF) { var ty = bytes[q++], ln = rdv(); q += ln; if (ty === 0x2F) { break; } }
    else if ((stt & 0xF0) === 0xC0) { pcs.push(((stt & 15) + 1) + "=" + bytes[q++]); }
    else if ((stt & 0xF0) === 0xB0) { if (bytes[q] === 91) { cc++; } q += 2; }
    else if ((stt & 0xF0) === 0x90) { ons.push(((stt & 15) + 1) + ":" + bytes[q + 1]); q += 2; } else { q += 2; } }
  // ch6・ch7 はゴリラウクレレの書き出し用の声部（§178）
  ok(pcs.join(" ") === "1=0 2=40 4=33 5=48 6=24 7=24", "MIDI: program changes per voice channel", pcs.join(" "));
  ok(ons.join(" ") === "1:96 2:96 10:96 4:48 10:96 5:96", "MIDI: channels and chord velocity", ons.join(" "));
  ok(cc >= 4 && ((bytes[18] << 24) | (bytes[19] << 16) | (bytes[20] << 8) | bytes[21]) === bytes.length - 22, "MIDI: reverb CC91 and track length");

  // --- 本物の楽器サンプル ---
  var sampleDir = path.join(H.ROOT, "samples");
  var files = Object.keys(M.sampleFiles).map(function (p) { return M.sampleFiles[p]; });
  ok(files.every(function (n) { return fs.existsSync(path.join(sampleDir, n + ".js")); }), "all 16 sample files exist");
  M.samples.enabled = true;
  await new Promise(function (res) { M.loadSamples([0, 12], res); });
  ok(M.sampleReady(0) && M.sampleReady(12), "piano and marimba samples load and decode");
  env.counters.src.length = 0;
  for (var nn = 34; nn <= 98; nn++) { M.synth(nn, 0, 0, 1); }
  ok(env.counters.src.length === 65 && env.counters.src.every(function (s) { return Math.abs(12 * Math.log(s.rate) / Math.log(2)) <= 2.0001; }), "sample notes pitch-shift at most 2 semitones in range");
  await new Promise(function (res) { M.loadSamples([4, 8, 11, 24, 25, 32, 40], res); });
  ok(Object.keys(M.samples.buffers).length <= 7, "sample memory is capped (old instruments evicted)", Object.keys(M.samples.buffers).length);

  // --- WAV ---
  var wavRec = { id: 9, date: Date.UTC(2026, 9, 24, 12, 30), prog: { b: 0 }, fxRev: 1, notes: [[0, 60, "b"], [500, 64, "b", 0.5], [1000, 50, "w"]] };
  var ctxBefore = M.audio.ctx;
  var wav = await new Promise(function (res) { M.renderWav(wavRec, function (blob, sec, cut) { res({ blob: blob, sec: sec, cut: cut }); }); });
  var dv = new DataView(wav.blob.parts[0]);
  ok(wav.blob && wav.sec === 3.5 && !wav.cut && dv.getUint32(24, true) === 32000 && dv.getUint16(22, true) === 2 && dv.getUint16(34, true) === 16, "WAV: 32kHz stereo 16-bit header");
  ok(M.audio.ctx === ctxBefore, "WAV: audio output restored after offline render");
  var longWav = await new Promise(function (res) { M.renderWav({ id: 10, date: Date.now(), notes: [[0, 60, "b"], [400000, 62, "b"]] }, function (b, s, c) { res({ s: s, c: c }); }); });
  ok(longWav.s === 180 && longWav.c, "WAV: long recordings are cut at 3 minutes");

  // --- Web MIDI 出力 ---
  await new Promise(function (res) { M.requestMidi(res); });
  M.selectOutput("gs");
  ok(!!M.midi.out, "Web MIDI: output port can be selected");
  sent.length = 0;
  M.startPlayback({ id: 11, date: Date.now(), prog: { b: 73 }, notes: [[0, 60, "b"], [100, 64, "b"], [200, 67, "b", 0.5]] }, function () {});
  await env.wait(1600);
  var noteOns = sent.filter(function (e) { return (e.b[0] & 0xF0) === 0x90; });
  ok(noteOns.length === 3 && noteOns[2].b[2] === 50 && sent.some(function (e) { return e.b[0] === 0xC0 && e.b[1] === 73; }), "Web MIDI: playback sends program change and notes", noteOns.length);
  M.selectOutput("synth");
  ok(!M.midi.out, "Web MIDI: back to built-in synth");
};
