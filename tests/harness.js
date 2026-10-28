// 究極ゴリラ 自動テスト用ハーネス（Node.js で実行。ゲーム本体には含まれない）
// ブラウザの window / document / canvas / Web Audio / Web MIDI / localStorage を最小限まねて、
// arcade.js などを vm の中で読み込む。
"use strict";
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var ROOT = path.join(__dirname, "..");

// ---------- 乱数の種 ----------
// テストもゲーム本体（vm の中）も同じ種から乱数を作る。失敗したら UG_SEED=<種> で同じ結果を再現できる
var SEED = process.env.UG_SEED ? (parseInt(process.env.UG_SEED, 10) >>> 0) : (Math.floor(Math.random() * 1e9) >>> 0);
function makeRandom(seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
Math.random = makeRandom(SEED);
var loadCount = 0;

// ---------- 小さなアサーション ----------
var results = [];
var currentSuite = "";
function suite(name) { currentSuite = name; }
function ok(cond, name, detail) {
  results.push({ suite: currentSuite, name: name, pass: !!cond, detail: detail });
  if (!cond) { console.log("  ✗ [" + currentSuite + "] " + name + (detail !== undefined ? "  → " + JSON.stringify(detail) : "")); }
}
function summary() {
  var pass = 0, fail = 0;
  results.forEach(function (r) { if (r.pass) { pass++; } else { fail++; } });
  return { pass: pass, fail: fail, results: results };
}

// ---------- DOM ----------
function makeEl(tag) {
  var el = {
    tagName: tag || "div", innerHTML: "", textContent: "", style: {}, children: [], listeners: {}, attrs: {},
    classList: { add: function () {}, remove: function () {}, contains: function () { return false; } },
    addEventListener: function (t, f) { (el.listeners[t] = el.listeners[t] || []).push(f); },
    removeEventListener: function () {},
    appendChild: function (c) { el.children.push(c); if (el.onAppend) { el.onAppend(c); } return c; },
    removeChild: function () {},
    setAttribute: function (k, v) { el.attrs[k] = v; }, getAttribute: function (k) { return el.attrs[k] === undefined ? null : el.attrs[k]; },
    querySelectorAll: function () { return []; }, querySelector: function () { return null; },
    getBoundingClientRect: function () { return { left: 0, top: 0, width: 240, height: 320 }; },
    setPointerCapture: function () {}, click: function () { if (el.onClickHook) { el.onClickHook(el); } }, blur: function () {}
  };
  return el;
}
// canvas 2D は何もしない（fillText の文字だけ記録）
function makeCtx(texts) {
  return new Proxy({}, {
    get: function (t, k) {
      if (k === "fillText") { return function (s) { texts.push(String(s)); if (texts.length > 400) { texts.shift(); } }; }
      return t[k] !== undefined ? t[k] : function () {};
    },
    set: function (t, k, v) { t[k] = v; return true; }
  });
}

// ---------- Web Audio ----------
function makeAudio(counters) {
  function param(name) {
    return {
      value: 0,
      setValueAtTime: function (v, t) { if (isNaN(v) || isNaN(t)) { counters.errors.push(name + " setValue NaN"); } },
      exponentialRampToValueAtTime: function (v, t) { if (!(v > 0)) { counters.errors.push(name + " expRamp to " + v); } if (isNaN(t)) { counters.errors.push(name + " ramp NaN time"); } },
      linearRampToValueAtTime: function () {}
    };
  }
  function makeNode(kind, ctxKind) {
    counters.nodes[ctxKind] = (counters.nodes[ctxKind] || 0) + 1;
    var n = {
      connect: function (x) { if (!x) { counters.errors.push("connect(undefined)"); } }, disconnect: function () {},
      start: function (t) { if (isNaN(t)) { counters.errors.push("start NaN"); } if (kind === "osc") { counters.osc++; } if (kind === "src") { counters.src.push({ buf: n.buffer, rate: n.playbackRate.value, t: t }); } },
      stop: function (t) { if (isNaN(t)) { counters.errors.push("stop NaN"); } },
      gain: param("gain"), frequency: param("frequency"), detune: param("detune"), Q: param("Q"), delayTime: param("delayTime"), playbackRate: param("playbackRate")
    };
    return n;
  }
  function makeBuffer(ch, len, rate) {
    var d = [];
    for (var i = 0; i < ch; i++) { d.push(new Float32Array(len)); }
    return { numberOfChannels: ch, length: len, sampleRate: rate || 8000, getChannelData: function (i) { return d[i || 0]; } };
  }
  function proto(C, ctxKind) {
    C.prototype.createGain = function () { return makeNode("gain", ctxKind); };
    C.prototype.createBiquadFilter = function () { return makeNode("filter", ctxKind); };
    C.prototype.createOscillator = function () { return makeNode("osc", ctxKind); };
    C.prototype.createWaveShaper = function () { return makeNode("ws", ctxKind); };
    C.prototype.createConvolver = function () { return makeNode("conv", ctxKind); };
    C.prototype.createDelay = function () { return makeNode("delay", ctxKind); };
    C.prototype.createBufferSource = function () { return makeNode("src", ctxKind); };
    C.prototype.createBuffer = function (c, l, r) { return makeBuffer(c, l, r); };
  }
  function AudioContext() { this.sampleRate = 44100; this.currentTime = 1; this.destination = {}; this.state = "running"; }
  proto(AudioContext, "rt");
  // MP3 の先頭バイトだけ確かめて、4秒の無音バッファを返す
  AudioContext.prototype.decodeAudioData = function (ab, okCb, ngCb) {
    var b = new Uint8Array(ab), mp3 = (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) || (b[0] === 0xFF && (b[1] & 0xE0) === 0xE0);
    counters.decodes++;
    setTimeout(function () { if (mp3) { okCb(makeBuffer(2, 44100 * 4, 44100)); } else { counters.errors.push("decode: not MP3"); if (ngCb) { ngCb(); } } }, 0);
    return { catch: function () {} };
  };
  function OfflineAudioContext(ch, len, rate) { this.channels = ch; this.len = len; this.sampleRate = rate; this.currentTime = 0; this.destination = {}; counters.offline.push(this); }
  proto(OfflineAudioContext, "off");
  OfflineAudioContext.prototype.startRendering = function () {
    var self = this;
    return { then: function (ok) { var buf = makeBuffer(2, Math.min(self.len, 32000), self.sampleRate); var d = buf.getChannelData(0); for (var i = 0; i < d.length; i++) { d[i] = Math.sin(i / 9) * 1.2; } ok(buf); } };
  };
  return { AudioContext: AudioContext, OfflineAudioContext: OfflineAudioContext };
}

// ---------- 読み込み ----------
// opts.files: 読み込む JS（ROOT からの相対パス）。opts.midiPort: 偽の Web MIDI 出力ポート
function load(opts) {
  opts = opts || {};
  var counters = { osc: 0, src: [], decodes: 0, errors: [], nodes: {}, offline: [], stopped: 0, texts: [], downloads: [], shared: [], scripts: [] };
  var audio = makeAudio(counters);
  var store = {};
  var winListeners = {};
  var rafCb = null;
  var sandbox = {
    console: console, setTimeout: setTimeout, clearTimeout: clearTimeout, setInterval: setInterval, clearInterval: clearInterval,
    Uint8Array: Uint8Array, Float32Array: Float32Array, ArrayBuffer: ArrayBuffer, DataView: DataView, Map: Map, Promise: Promise
  };
  sandbox.window = sandbox;
  sandbox.AudioContext = audio.AudioContext;
  sandbox.OfflineAudioContext = audio.OfflineAudioContext;
  sandbox.PointerEvent = function () {};
  sandbox.performance = { now: function () { return Date.now(); } };
  sandbox.requestAnimationFrame = function (f) { rafCb = f; return 1; };
  sandbox.cancelAnimationFrame = function () { rafCb = null; };
  sandbox.addEventListener = function (t, f) { (winListeners[t] = winListeners[t] || []).push(f); };
  sandbox.removeEventListener = function (t, f) { var a = winListeners[t] || []; var i = a.indexOf(f); if (i >= 0) { a.splice(i, 1); } };
  sandbox.localStorage = { getItem: function (k) { return store[k] === undefined ? null : store[k]; }, setItem: function (k, v) { store[k] = String(v); }, removeItem: function (k) { delete store[k]; } };
  sandbox.atob = function (s) { return Buffer.from(s, "base64").toString("binary"); };
  sandbox.confirm = function () { return opts.confirm !== false; };
  sandbox.Blob = function (parts, o) { this.parts = parts; this.type = o && o.type; };
  sandbox.File = function (parts, name, o) { this.parts = parts; this.name = name; this.type = o && o.type; };
  sandbox.URL = { createObjectURL: function () { return "blob:test"; }, revokeObjectURL: function () {} };
  var nav = {};
  if (opts.midiPort) {
    nav.requestMIDIAccess = function () { return { then: function (okCb) { okCb({ outputs: new Map([[opts.midiPort.id, opts.midiPort]]) }); } }; };
  }
  if (opts.share) {
    nav.canShare = function () { return true; };
    nav.share = function (o) { counters.shared.push(o.files[0].name); return { catch: function () {} }; };
  }
  sandbox.navigator = nav;
  var head = makeEl("head");
  // <script src="samples/x.js"> を同期せずに後で読み込む
  head.onAppend = function (sc) {
    counters.scripts.push(sc.src);
    setTimeout(function () {
      var file = path.join(ROOT, sc.src);
      if (!fs.existsSync(file)) { if (sc.onerror) { sc.onerror(); } return; }
      vm.runInContext(fs.readFileSync(file, "utf8"), ctx, { filename: sc.src });
    }, 0);
  };
  sandbox.document = {
    hidden: false, head: head, body: makeEl("body"),
    createElement: function (tag) { var e = makeEl(tag); if (tag === "a") { e.onClickHook = function (a) { counters.downloads.push(a.download); }; } return e; },
    addEventListener: function () {}, removeEventListener: function () {}
  };
  var ctx = vm.createContext(sandbox);
  // vm の中の Math は別物なので、読み込みごとに種から決まる乱数に差し替える
  vm.runInContext("Math", ctx).random = makeRandom(SEED + (++loadCount) * 7919);
  // opts.patch(src, file): テストだけで中身をのぞくための置換（本体のファイルは変更しない）
  (opts.files || ["arcade.js", "arcade-melody.js", "arcade-lyrics.js", "arcade-table.js", "arcade-sports.js", "arcade-chords.js", "arcade-ukulele.js", "arcade-quiz.js"]).forEach(function (f) {
    var src = fs.readFileSync(path.join(ROOT, f), "utf8");
    if (opts.patch) { src = opts.patch(src, f); }
    vm.runInContext(src, ctx, { filename: f });
  });

  var env = { window: sandbox, counters: counters, store: store, ctx: ctx };
  env.canvas = null;
  env.key = function (type, k) {
    (winListeners[type] || []).slice().forEach(function (f) {
      f({ key: k, repeat: false, cancelable: true, preventDefault: function () {}, stopPropagation: function () { counters.stopped++; } });
    });
  };
  // id: 指の番号（省略時 1）、kind: "touch" / "mouse"（省略時はなし＝タッチ扱い）
  env.ptr = function (type, x, y, id, kind) {
    if (!env.canvas) { return; }
    (env.canvas.listeners["pointer" + type] || []).forEach(function (f) {
      f({ clientX: x, clientY: y === undefined ? 300 : y, pointerId: id === undefined ? 1 : id, pointerType: kind, cancelable: true, preventDefault: function () {} });
    });
  };
  env.tap = function (x, y) { env.ptr("down", x, y); env.ptr("up", x, y); };
  env.lastTitle = function () {
    var keys = ["WIN!", "LOSE", "DRAW", "CLEAR!", "GAME OVER", "TIME UP"];
    for (var i = counters.texts.length - 1; i >= 0; i--) { if (keys.indexOf(counters.texts[i]) >= 0) { return counters.texts[i]; } }
    return "?";
  };
  // ゲームを frames フレーム動かす。policy(f, env) で入力。戻り値 { ended: スコア or null, frames, earned }
  env.run = function (gameId, startOpts, frames, policy) {
    var root = makeEl("div"), parts = {};
    root.querySelector = function (sel) {
      if (!parts[sel]) {
        parts[sel] = makeEl(sel);
        if (sel === ".arcade-canvas") { parts[sel].getContext = function () { return makeCtx(counters.texts); }; }
      }
      return parts[sel];
    };
    var ended = null, t = 0, f;
    var o = startOpts || {};
    o.hiScore = o.hiScore || 0;
    var userEnd = o.onEnd;
    o.onEnd = function (g, s) { ended = s; return userEnd ? userEnd(g, s) : 7; };
    o.onExit = o.onExit || function () {};
    sandbox.UGArcade.start(gameId, root, o);
    env.canvas = parts[".arcade-canvas"];
    env.root = root;
    for (f = 0; f < frames && ended === null; f++) {
      if (policy) { policy(f, env); }
      t += 1000 / 60;
      if (rafCb) { rafCb(t); }
    }
    sandbox.UGArcade.stop();
    return { ended: ended, frames: f };
  };
  // setTimeout を待つ
  env.wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms || 0); }); };
  return env;
}

// ES5 で使えない書き方を探す（文字列中の誤検出を避けるため単純なパターンのみ）
function es5Problems(file) {
  var src = fs.readFileSync(path.join(ROOT, file), "utf8"), out = [];
  src.split("\n").forEach(function (line, i) {
    if (/=>|`|\blet\s|\bconst\s|^\s*class\s/.test(line)) { out.push((i + 1) + ": " + line.trim().slice(0, 80)); }
  });
  return out;
}

module.exports = { SEED: SEED, load: load, suite: suite, ok: ok, summary: summary, es5Problems: es5Problems, ROOT: ROOT, makeEl: makeEl };
