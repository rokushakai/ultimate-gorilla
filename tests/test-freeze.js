// §345 A32: トラックのフリーズ／バウンス
"use strict";
var H = require("./harness");
var ok = H.ok;

module.exports = async function () {
  function fakeIDB() {
    var dbs = {}, api = { writes: 0, failNext: null, data: dbs, opens: 0 };
    function isAB(v) { return Object.prototype.toString.call(v) === "[object ArrayBuffer]"; }
    function clone(v) { if (isAB(v)) { return v.slice(0); } if (v && typeof v === "object") { var o = Array.isArray(v) ? [] : {}, k; for (k in v) { o[k] = clone(v[k]); } return o; } return v; }
    function makeTx(D, mode) {
      var tx = { pending: [], aborted: false, reads: 0 }, fail = mode === "readwrite" && api.failNext; // 9B-6: reads ＝ まだ届いていない読みとり（本物と同じく、結果が先・完了があと）
      if (fail) { api.failNext = null; }
      tx.objectStore = function (n) {
        var S = D.stores[n];
        return {
          get: function (k) { var r = {}; tx.reads++; setTimeout(function () { r.result = S.rows[k] ? clone(S.rows[k]) : undefined; if (r.onsuccess) { r.onsuccess(); } tx.reads--; }, 0); return r; },
          getAll: function () { var r = {}; tx.reads++; setTimeout(function () { r.result = Object.keys(S.rows).map(function (k) { return clone(S.rows[k]); }); if (r.onsuccess) { r.onsuccess(); } tx.reads--; }, 0); return r; }, // 9A-15
          getAllKeys: function () { var r = {}; tx.reads++; setTimeout(function () { r.result = Object.keys(S.rows); if (r.onsuccess) { r.onsuccess(); } tx.reads--; }, 0); return r; },
          "delete": function (k) { if (mode !== "readwrite") { throw new Error("ReadOnlyError"); } tx.pending.push([S, k, undefined, true]); },
          put: function (val) { if (mode !== "readwrite") { throw new Error("ReadOnlyError"); } tx.pending.push([S, val[S.key], clone(val)]); }
        };
      };
      tx.abort = function () { tx.aborted = true; };
      setTimeout(function fin() {
        if (tx.reads > 0) { setTimeout(fin, 1); return; } // 読みとりの結果がみな届いてから完了（タイマーがまとめて動いても順番を守る）
        if (fail || tx.aborted) { tx.error = { name: fail || "AbortError" }; if (tx.onerror) { tx.onerror(); } if (tx.onabort) { tx.onabort(); } return; }
        tx.pending.forEach(function (x) { if (x[3]) { delete x[0].rows[x[1]]; api.deletes = (api.deletes || 0) + 1; } else { x[0].rows[x[1]] = x[2]; api.writes++; } });
        if (tx.oncomplete) { tx.oncomplete(); }
      }, 2);
      return tx;
    }
    api.open = function (name) {
      var rq = {};
      api.opens++;
      setTimeout(function () {
        var fresh = !dbs[name];
        if (fresh) { dbs[name] = { stores: {} }; }
        var D = dbs[name];
        rq.result = { objectStoreNames: { contains: function (n) { return !!D.stores[n]; } }, createObjectStore: function (n, o) { D.stores[n] = { key: o.keyPath, rows: {} }; }, close: function () {}, transaction: function (names, mode) { return makeTx(D, mode); } };
        if (fresh && rq.onupgradeneeded) { rq.onupgradeneeded(); }
        if (rq.onsuccess) { rq.onsuccess(); }
      }, 0);
      return rq;
    };
    return api;
  }
  H.suite("freeze");
  var env = H.load(), W = env.window, X = W.UGXmas, D = W.UGDaw, A = W.UGArcade, M = W.UGDawModel, R = H.makeEl("div");
  A.start("daw", R, {});
  D.xmas.host.newSong(X.tplNewProject(X.tplPlan(null, "pop", "new", 1, 1, "std")).project); D.xmas.host.back();
  var nl0 = X.needLoad, sr0 = W.UGMelody.sampleReady; X.needLoad = function () { return false; }; W.UGMelody.sampleReady = function () { return true; };
  var p = D.project(), F = D.frz, t = p.tracks.filter(function (x) { return !M.isDrum(x) && x.clips.some(function (c) { return c.notes.length; }); })[0], tid = t.id;
  function make(id, fx) { return new Promise(function (res) { var r = F.make(id, fx, function (x) { res(x); }); if (!r) { res({ ok: false, why: "busy" }); } }); }
  function run(sec) { var ac = D.player().ac, g = 0, to = ac.currentTime + sec; while (ac.currentTime < to - 1e-9 && g++ < 100000) { ac.currentTime = Math.min(to, ac.currentTime + 0.025); D.pump(); } }
  // 1. 鍵: 描いた中身にかかわるものだけ
  var k0 = F.key(tid, true);
  t.vol = 55; t.sends = { rev: 0.3, dly: 0 }; t.mute = true; t.name = "べつの名前"; M.autoSet(p, t, "vol", 0, 40); M.autoSet(p, t, "expr", 0, 70);
  ok(F.key(tid, true) === k0, "the key ignores fader volume, sends, mute, name, volume and Expression automation (they stay live)");
  t.vol = 80; t.sends = { rev: 0, dly: 0 }; t.mute = false; t.auto = [];
  var n0 = t.clips.filter(function (c) { return c.notes.length; })[0].notes[0], v0 = n0[3]; n0[3] = 0.33;
  var k1 = F.key(tid, true); n0[3] = v0; var pan0 = t.pan; t.pan = 0.5; var k2 = F.key(tid, true); t.pan = pan0;
  t.ext.hum = { pre: "natural", amt: 50, seed: 1 }; var k3 = F.key(tid, true); delete t.ext.hum;
  ok(k1 !== k0 && k2 !== k0 && k3 !== k0 && F.key(tid, true) === k0, "notes, pan and expression (humanize) change the key");
  t.fx = { items: [], eq: { on: true, low: 3, mid: 0, high: 0 } }; var k4 = F.key(tid, true), k5 = F.key(tid, false); t.fx = { items: [] };
  ok(k4 !== k0 && k5 === F.key(tid, false), "FX changes the key only when FX are frozen in");
  // 2. フリーズ
  var notes0 = JSON.stringify(t.clips.map(function (c) { return c.notes; })), inst0 = JSON.stringify(t.instrument);
  var r = await make(tid, true);
  t = M.findTrack(D.project(), tid);
  ok(r.ok && t.ext.frz && t.ext.frz.on && t.ext.frz.fx === true && F.state(tid) === "ok" && F.info().buf[tid] && [1, 2].indexOf(F.info().buf[tid].buf.numberOfChannels) >= 0, "フリーズ: the track gets an audio buffer (§345 A34: 1 channel when left and right are identical, else 2) and is marked frozen (state ok)", r.why);
  ok(JSON.stringify(t.clips.map(function (c) { return c.notes; })) === notes0 && JSON.stringify(t.instrument) === inst0, "the original MIDI notes and the instrument are kept as they were");
  ok(F.bytes() > 0 && F.info().buf[tid].s0 >= 0, "memory is counted (bytes) and the silent head is trimmed (start " + F.info().buf[tid].s0.toFixed(3) + " s)");
  // 3. 再生: 音符を鳴らさず、音声を鳴らす
  D.clearLog(); D.play(); var P = D.player();
  ok(P.frz && P.frz[tid], "while playing, the frozen track is used");
  run(4);
  var lg = D.log(), mine = lg.filter(function (x) { return x.track === tid; });
  ok(mine.length >= 1 && mine.every(function (x) { return x.frz; }) && mine[0].ok, "no notes of the frozen track are played; its audio starts instead", mine.slice(0, 2));
  ok(lg.some(function (x) { return x.track !== tid && !x.frz; }), "the other tracks still play their notes");
  D.stop();
  // 4. 古くなる → シンセで鳴らす
  var n1 = t.clips.filter(function (c) { return c.notes.length; })[0].notes[0]; n1[3] = n1[3] > 0.5 ? 0.3 : 0.9;
  ok(F.state(tid) === "stale", "editing a note makes the freeze stale");
  D.clearLog(); D.play(); run(3); D.stop();
  var lg2 = D.log().filter(function (x) { return x.track === tid; });
  ok(lg2.length > 0 && lg2.every(function (x) { return !x.frz; }), "a stale freeze is not used: the synth plays the notes (always correct)");
  var rr = await make(tid, true);
  ok(rr.ok && F.state(tid) === "ok", "作りなおす: fresh again");
  // 5. 音量・センドは生きたまま
  t = M.findTrack(D.project(), tid); t.vol = 30; t.sends = { rev: 0.2, dly: 0 };
  ok(F.state(tid) === "ok", "moving the fader or the send does not make it stale");
  t.vol = 80; t.sends = { rev: 0, dly: 0 };
  // 6. ↶・↷・解除
  D.xmas.host.undo(); t = M.findTrack(D.project(), tid);
  ok(F.state(tid) === "stale" || F.state(tid) === "", "↶ goes back to before the re-freeze");
  D.redo(); ok(F.state(tid) === "ok", "↷ brings the freeze back (the audio is still in memory)");
  F.off(tid); t = M.findTrack(D.project(), tid);
  ok(!t.ext.frz && !F.info().buf[tid] && F.state(tid) === "", "解除: back to the editable synth track; the audio is freed");
  D.xmas.host.undo(); t = M.findTrack(D.project(), tid);
  ok(t.ext.frz && F.state(tid) === "nobuf", "↶ after 解除: the mark is back but the audio must be made again (plays the synth meanwhile)");
  // 7. 保存と復元（音声は保存しない）
  var rec = M.toRecord(D.project(), Date.now()), txt = JSON.stringify(rec), q0 = JSON.parse(JSON.stringify(D.project())); delete M.findTrack(q0, tid).ext.frz;
  var txt0 = JSON.stringify(M.toRecord(q0, Date.now()));
  ok(/"frz"/.test(txt) && txt.length - txt0.length < 400, "the saved song keeps only the small mark, no audio (" + (txt.length - txt0.length) + " bytes more)");
  var back = M.fromRecord(JSON.parse(txt)).project, bt = M.findTrack(back, tid);
  ok(bt.ext.frz && bt.ext.frz.on && bt.ext.frz.key && JSON.stringify(bt.clips.map(function (c) { return c.notes; })) === JSON.stringify(t.clips.map(function (c) { return c.notes; })), "save → restore: the freeze mark and all notes come back");
  // 8. FX をふくめない
  var r2 = await make(tid, false); t = M.findTrack(D.project(), tid);
  ok(r2.ok && t.ext.frz.fx === false && F.state(tid) === "ok", "freeze without FX (FX stay live)");
  // 8b. WAV の書き出しでもフリーズの音声を使う
  await new Promise(function (res) { D.wav.start(function () { res(); }); });
  var wl = D.wav.state().log || [], wf = wl.filter(function (x) { return x.track === tid; });
  ok(D.wav.state().state === "done" && wf.length >= 1 && wf.every(function (x) { return x.frz; }), "WAV export uses the frozen audio for that track (no notes rendered)", wf.length);
  // 8c. バウンス（まねの IndexedDB とデコード: tests/test-daw.js と同じもの）
  W.indexedDB = fakeIDB(); D.audio.forget();
  W.OfflineAudioContext.prototype.decodeAudioData = function (ab, okCb, ngCb) {
    var info = M.parseWav(ab), self = this;
    setTimeout(function () {
      if (!info.ok || info.bits !== 16) { if (ngCb) { ngCb({ name: "EncodingError" }); } return; }
      var v = new DataView(ab), chs = [], c, i;
      for (c = 0; c < info.ch; c++) { chs.push(new Float32Array(info.frames)); }
      for (i = 0; i < info.frames; i++) { for (c = 0; c < info.ch; c++) { chs[c][i] = v.getInt16(info.dataOffset + (i * info.ch + c) * 2, true) / 32768; } }
      okCb({ numberOfChannels: info.ch, length: info.frames, sampleRate: info.sr, duration: info.frames / info.sr, getChannelData: function (k) { return chs[k]; }, ctxRate: self.sampleRate });
    }, 1);
    return { catch: function () {} };
  };
  var nT = D.project().tracks.length, keepB = JSON.stringify(D.project().tracks), nA = (D.project().assets || []).length;
  var br = await new Promise(function (res) { if (!F.bounce(tid, function (x) { res(x); })) { res({ ok: false, why: F.info().msg }); } });
  var pB = D.project(), nt = br.track ? M.findTrack(pB, br.track.id) : null;
  ok(br.ok && pB.tracks.length === nT + 1 && nt && M.isAudio(nt) && nt.clips.length === 1 && M.findTrack(pB, tid).mute === true && pB.tracks.indexOf(nt) === pB.tracks.indexOf(M.findTrack(pB, tid)) + 1, "バウンス: a new audio track right below with one clip; the original track is muted and kept", br.why);
  D.xmas.host.undo();
  ok(JSON.stringify(D.project().tracks) === keepB && (D.project().assets || []).length === nA + 1, "↶ once undoes the whole bounce (the tracks are as before; the audio stays in the song's material list, as with any imported WAV)");
  // 9. 画面
  D.select ? D.select({ kind: "track", id: tid }) : 0;
  var hh = F.html(tid);
  ok(/フリーズ中/.test(hh) && /FX ふくまない/.test(hh), "the panel shows the frozen state");
  // 10. 音のないトラック・オーディオのトラック
  var dt = D.project().tracks.filter(function (x) { return !x.clips.some(function (c) { return c.notes && c.notes.length; }) && !M.isAudio(x); })[0];
  if (dt) { var r3 = await make(dt.id, true); ok(!r3.ok, "a track without notes cannot be frozen (says why)", r3.why); }
  X.needLoad = nl0; W.UGMelody.sampleReady = sr0;
  A.stop();
};
