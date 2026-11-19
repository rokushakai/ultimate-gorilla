// §345 A33: 独立した SMF（標準 MIDI ファイル）の読みとり。テストで、ゴリラの書き出しを「ゴリラ自身のパーサー以外」で確かめるためのもの。
// arcade-daw-model.js の関数は 1 つも使わない（SMF 1.0 の仕様から書いた・ES5）。読めないものは throw せず errors に入れる。
"use strict";

function u16(b, o) { return (b[o] << 8) | b[o + 1]; }
function u32(b, o) { return ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3]; }
function txt(b, a, n) { var s = "", i; for (i = 0; i < n; i++) { s += String.fromCharCode(b[a + i]); } try { return decodeURIComponent(escape(s)); } catch (e) { return s; } }

// → { format, ntrks, division, chunks（MTrk の数）, tracks: [{ name, events: [{ tick, kind, ch, a, b, value, num, den, text, us }], eot }], errors: [] }
function parse(bytes) {
  var b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), out = { errors: [], tracks: [] }, pos;
  if (b.length < 14 || txt(b, 0, 4) !== "MThd") { out.errors.push("no MThd"); return out; }
  var hl = u32(b, 4);
  if (hl !== 6) { out.errors.push("header length " + hl); }
  out.format = u16(b, 8); out.ntrks = u16(b, 10); out.division = u16(b, 12);
  if (out.division & 0x8000) { out.errors.push("SMPTE division"); }
  pos = 8 + hl; out.chunks = 0;
  while (pos + 8 <= b.length) {
    var id = txt(b, pos, 4), len = u32(b, pos + 4), a = pos + 8, z = a + len;
    if (z > b.length) { out.errors.push("chunk past end"); break; }
    if (id === "MTrk") { out.chunks++; out.tracks.push(readTrack(b, a, z, out.errors, out.chunks)); }
    pos = z;
  }
  if (pos !== b.length) { out.errors.push("trailing bytes " + (b.length - pos)); }
  if (out.chunks !== out.ntrks) { out.errors.push("ntrks " + out.ntrks + " but " + out.chunks + " MTrk"); }
  return out;
}

function readTrack(b, a, z, errors, no) {
  var p = a, tick = 0, run = 0, tr = { name: null, events: [], eot: false }, guard = 0;
  function vlq() { var v = 0, i, c; for (i = 0; i < 4; i++) { if (p >= z) { errors.push("trk" + no + ": vlq past end"); return -1; } c = b[p++]; v = v * 128 + (c & 127); if (!(c & 128)) { return v; } } errors.push("trk" + no + ": vlq > 4 bytes"); return -1; }
  while (p < z && guard++ < 5000000) {
    var d = vlq(); if (d < 0) { break; }
    tick += d;
    if (tr.eot) { errors.push("trk" + no + ": event after End of Track"); }
    var s = b[p];
    if (s & 128) { p++; } else { if (!run) { errors.push("trk" + no + ": running status without status"); break; } s = run; }
    if (s === 0xFF) {
      run = 0; // メタはランニングステータスを消す（SMF の書き方）。続くデータイベントはステータスを書くはず
      var ty = b[p++], ln = vlq(), st = p; if (ln < 0) { break; } p += ln;
      if (p > z) { errors.push("trk" + no + ": meta past end"); break; }
      if (ty === 0x2F) { tr.eot = true; if (ln !== 0) { errors.push("trk" + no + ": EOT length " + ln); } }
      else if (ty === 0x03) { if (tr.name === null) { tr.name = txt(b, st, ln); } tr.events.push({ tick: tick, kind: "name", text: txt(b, st, ln) }); }
      else if (ty === 0x51) { if (ln !== 3) { errors.push("trk" + no + ": tempo length " + ln); } tr.events.push({ tick: tick, kind: "tempo", us: (b[st] << 16) | (b[st + 1] << 8) | b[st + 2] }); }
      else if (ty === 0x58) { if (ln !== 4) { errors.push("trk" + no + ": time signature length " + ln); } tr.events.push({ tick: tick, kind: "meter", num: b[st], den: Math.pow(2, b[st + 1]) }); }
      else if (ty === 0x06) { tr.events.push({ tick: tick, kind: "marker", text: txt(b, st, ln) }); }
      else { tr.events.push({ tick: tick, kind: "meta", type: ty, text: txt(b, st, ln) }); }
      continue;
    }
    if (s === 0xF0 || s === 0xF7) { run = 0; var ls = vlq(); if (ls < 0) { break; } p += ls; tr.events.push({ tick: tick, kind: "sysex" }); continue; }
    if (s > 0xF0) { errors.push("trk" + no + ": system message 0x" + s.toString(16) + " in a file"); break; }
    run = s;
    var hi = s & 0xF0, ch = s & 15, n = hi === 0xC0 || hi === 0xD0 ? 1 : 2, x = b[p], y = n === 2 ? b[p + 1] : 0;
    if (p + n > z) { errors.push("trk" + no + ": data past end"); break; }
    if ((x & 128) || (y & 128)) { errors.push("trk" + no + ": data byte >= 0x80 at tick " + tick); }
    p += n;
    if (hi === 0x90 && y > 0) { tr.events.push({ tick: tick, kind: "on", ch: ch, a: x, b: y }); }
    else if (hi === 0x80 || hi === 0x90) { tr.events.push({ tick: tick, kind: "off", ch: ch, a: x, b: y }); }
    else if (hi === 0xB0) { tr.events.push({ tick: tick, kind: "cc", ch: ch, a: x, b: y }); }
    else if (hi === 0xC0) { tr.events.push({ tick: tick, kind: "pc", ch: ch, a: x }); }
    else if (hi === 0xE0) { tr.events.push({ tick: tick, kind: "bend", ch: ch, value: (y << 7) | x }); }
    else { tr.events.push({ tick: tick, kind: hi === 0xA0 ? "polyat" : "chanat", ch: ch, a: x, b: y }); }
  }
  if (!tr.eot) { errors.push("trk" + no + ": no End of Track"); }
  return tr;
}

// ノートオンとオフを組にする（同じチャンネル・同じ高さは、先に始まった音から）→ { notes: [{ ch, key, on, off, vel }], unmatchedOff, unclosed, overlap }
function pairNotes(tr) {
  var open = {}, out = { notes: [], unmatchedOff: 0, unclosed: 0, overlap: 0 }, i;
  for (i = 0; i < tr.events.length; i++) {
    var e = tr.events[i], k = e.ch * 128 + e.a;
    if (e.kind === "on") { if (open[k] && open[k].length) { out.overlap++; } (open[k] = open[k] || []).push(e); }
    else if (e.kind === "off") { if (open[k] && open[k].length) { var o = open[k].shift(); out.notes.push({ ch: e.ch, key: e.a, on: o.tick, off: e.tick, vel: o.b }); } else { out.unmatchedOff++; } }
  }
  for (i in open) { if (open.hasOwnProperty(i)) { out.unclosed += open[i].length; } }
  out.notes.sort(function (x, y) { return x.on - y.on || x.key - y.key; });
  return out;
}

module.exports = { parse: parse, pairNotes: pairNotes };
