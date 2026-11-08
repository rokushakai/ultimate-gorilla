// 究極ゴリラ — ゴリラDAW の共通データモデル（§340 の形・§341 Phase 9A）
// 画面を持たない。プレーンな JSON（クラスにしない）・ES5。時刻は整数の tick（4 分音符 ＝ 960）
// 既存の保存（RPG のセーブ・シーケンサーの曲・シンセのテイク）は読まない・書かない
(function () {
  "use strict";

  var PPQ = 960, VERSION = 1, TYPE = "ultimate-gorilla-project", STORE_KEY = "ultimateGorillaDawV1";
  var BPM_MIN = 20, BPM_MAX = 400, MAX_TRACKS = 16, MAX_NOTES = 4000;

  function isArr(v) { return Object.prototype.toString.call(v) === "[object Array]"; }
  function isObj(v) { return !!v && typeof v === "object" && !isArr(v); }
  function copy(v) { if (v === undefined) { return undefined; } try { return JSON.parse(JSON.stringify(v)); } catch (e) { return undefined; } }
  function num(v, d, lo, hi) {
    v = Number(v);
    if (typeof v !== "number" || !isFinite(v)) { v = d; }
    if (lo !== undefined && v < lo) { v = lo; }
    if (hi !== undefined && v > hi) { v = hi; }
    return v;
  }
  function int(v, d, lo, hi) { return Math.round(num(v, d, lo, hi)); }
  function str(v, d, max) { v = typeof v === "string" ? v : (typeof v === "number" ? String(v) : d); return v.length > (max || 60) ? v.substring(0, max || 60) : v; }

  // 中身から決まる短いハッシュ（FNV-1a 32bit）。同じ音色をまとめるのに使う（§340 SynthPatchRef.hash）
  function hash(s) {
    s = String(s);
    var h = 0x811c9dc5, i;
    for (i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return "h" + ("0000000" + h.toString(16)).slice(-8);
  }

  // プロジェクトの中で一意の ID（t1・c1…）
  function nextId(p, prefix) {
    var used = {}, i, j, n = 1;
    var tr = p && isArr(p.tracks) ? p.tracks : [];
    for (i = 0; i < tr.length; i++) {
      if (tr[i] && tr[i].id) { used[tr[i].id] = true; }
      var cl = tr[i] && isArr(tr[i].clips) ? tr[i].clips : [];
      for (j = 0; j < cl.length; j++) { if (cl[j] && cl[j].id) { used[cl[j].id] = true; } }
    }
    while (used[prefix + n]) { n++; }
    return prefix + n;
  }

  // ---------- 作る ----------
  function newProject(opts) {
    opts = opts || {};
    var now = typeof opts.now === "number" ? opts.now : Date.now();
    return {
      type: TYPE, version: VERSION, id: str(opts.id, "p" + now.toString(36), 40), name: str(opts.name, "あたらしい曲", 40),
      created: now, saved: 0, ppq: PPQ,
      tempo: { points: [{ tick: 0, bpm: num(opts.bpm, 120, BPM_MIN, BPM_MAX) }], meters: [{ tick: 0, num: int(opts.meter, 4, 1, 32), den: 4 }] },
      key: [], markers: [], tracks: [], assets: [],
      master: { vol: 80, rev: 0, dly: 0, fx: { items: [] } },
      practice: { loopOn: false, loopA: 0, loopB: PPQ * 4 * 4 },
      ext: {}
    };
  }

  // ゴリラシンセのプリセットから InstrumentRef（§340: inline の patch を正とする・ext.preset は表示用）
  function synthInstrument(presetId) {
    var S = window.UGSynth, patch = null, name = "";
    try { if (S && S.preset) { var pr = S.preset(presetId); patch = pr.patch; name = pr.name; presetId = pr.id; } } catch (e) {}
    return { type: "synth", patch: { mode: "inline", patch: patch, hash: patch ? hash(JSON.stringify(patch)) : "" }, ext: { preset: str(presetId, "", 40), presetName: str(name, "", 80) } };
  }

  function newTrack(p, name, instrument) {
    var t = {
      id: nextId(p, "t"), name: str(name, "トラック", 40), kind: "midi",
      instrument: instrument || synthInstrument("lead"),
      vol: 80, pan: 0, mute: false, solo: false, fx: { items: [] }, clips: [], auto: [], ext: {}
    };
    if (p && isArr(p.tracks)) { p.tracks.push(t); }
    return t;
  }

  // notes: [[t, d, m, v], …]（t・d はクリップの中の tick）
  function newMidiClip(p, track, start, len, notes, name) {
    var c = { id: nextId(p, "c"), type: "midi", start: int(start, 0, 0), len: int(len, PPQ * 4, 1), offset: 0, loop: null, notes: cleanNotes(notes), ext: { name: str(name, "", 40) } };
    if (track && isArr(track.clips)) { track.clips.push(c); }
    return c;
  }

  // ---------- テンポ・拍子・時刻 ----------
  function points(p) { return p && p.tempo && isArr(p.tempo.points) && p.tempo.points.length ? p.tempo.points : [{ tick: 0, bpm: 120 }]; }
  function meters(p) { return p && p.tempo && isArr(p.tempo.meters) && p.tempo.meters.length ? p.tempo.meters : [{ tick: 0, num: 4, den: 4 }]; }
  function bpmAt(p, tick) { var ps = points(p), b = ps[0].bpm, i; for (i = 0; i < ps.length && ps[i].tick <= tick; i++) { b = ps[i].bpm; } return b; }
  function meterAt(p, tick) { var ms = meters(p), m = ms[0], i; for (i = 0; i < ms.length && ms[i].tick <= tick; i++) { m = ms[i]; } return m; }
  function ticksPerBar(m) { return Math.round((m && m.num || 4) * PPQ * 4 / (m && m.den || 4)); }
  // 小節（0 から）→ tick（拍子が途中で変わっても）
  function barToTick(p, bar) {
    var ms = meters(p), tick = 0, b = 0, i = 0, cur = ms[0];
    bar = Math.max(0, Math.floor(bar));
    while (b < bar) {
      while (i + 1 < ms.length && ms[i + 1].tick <= tick) { i++; cur = ms[i]; }
      tick += ticksPerBar(cur);
      b++;
    }
    return tick;
  }
  // tick → { bar（1 から）, beat（1 から）, sub（拍の中の tick）}
  function tickToBar(p, tick) {
    var ms = meters(p), t = 0, bar = 0, i = 0, cur = ms[0], tpb;
    tick = Math.max(0, tick);
    for (;;) {
      while (i + 1 < ms.length && ms[i + 1].tick <= t) { i++; cur = ms[i]; }
      tpb = ticksPerBar(cur);
      if (t + tpb > tick) { break; }
      t += tpb; bar++;
      if (bar > 100000) { break; }
    }
    var beatT = Math.round(PPQ * 4 / (cur.den || 4)), into = tick - t;
    return { bar: bar + 1, beat: Math.floor(into / beatT) + 1, sub: into % beatT, num: cur.num, den: cur.den };
  }
  // tick → 秒（テンポは段々に変わる・§340）。リアルタイムの再生と WAV で同じ計算を使う
  function tickToSec(p, tick) {
    var ps = points(p), sec = 0, i;
    for (i = 0; i < ps.length; i++) {
      var t0 = ps[i].tick, t1 = i + 1 < ps.length ? ps[i + 1].tick : Infinity;
      if (tick <= t0) { break; }
      sec += (Math.min(tick, t1) - t0) / PPQ * 60 / ps[i].bpm;
    }
    return sec;
  }
  function secToTick(p, sec) {
    var ps = points(p), acc = 0, i;
    for (i = 0; i < ps.length; i++) {
      var t0 = ps[i].tick, t1 = i + 1 < ps.length ? ps[i + 1].tick : Infinity, dur = (t1 - t0) / PPQ * 60 / ps[i].bpm;
      if (sec <= acc + dur) { return t0 + (sec - acc) * ps[i].bpm / 60 * PPQ; }
      acc += dur;
    }
    return 0;
  }
  // 曲のいちばん後ろ（クリップの終わり）
  function endTick(p) {
    var e = 0, i, j, tr = p && isArr(p.tracks) ? p.tracks : [];
    for (i = 0; i < tr.length; i++) { for (j = 0; j < tr[i].clips.length; j++) { e = Math.max(e, tr[i].clips[j].start + tr[i].clips[j].len); } }
    return e;
  }
  // 表示する小節の数（いちばん後ろのクリップ ＋ 1 小節・8 小節以上）
  function viewBars(p) { var e = endTick(p), b = tickToBar(p, Math.max(0, e - 1)).bar; return Math.max(8, e > 0 ? b + 1 : 8); }

  // 曲の終わり（いちばん後ろのクリップがある小節の終わり・クリップが無ければ 8 小節）
  function songEndTick(p) { var e = endTick(p); return e > 0 ? barToTick(p, tickToBar(p, e - 1).bar) : barToTick(p, 8); }
  // ループの範囲（practice.loopA〜loopB・おかしいときは曲の頭から終わりまで）
  function loopRange(p) {
    var pr = p && p.practice || {}, a = int(pr.loopA, 0, 0), b = int(pr.loopB, 0, 0);
    if (!(b > a)) { a = 0; b = songEndTick(p); }
    return { a: a, b: b };
  }
  // §341 9A-2: ミュート・ソロの優先（①ミュートは鳴らない ②ソロがあればソロだけ ③どちらもなければ全部）。いまのシーケンサーの ukeTrackAudible と同じ
  function audible(p, t) {
    var i;
    if (!t || t.mute) { return false; }
    for (i = 0; p && i < p.tracks.length; i++) { if (p.tracks[i].solo) { return !!t.solo; } }
    return true;
  }
  // 曲の tick の [from, to) に始まる音符（クリップの中だけ・長さはクリップの終わりで切る）。tick の早い順
  // → { tick, end（d＝0 なら tick と同じ）, d, m, v, track（ID）, clip（ID）}
  function noteEvents(p, from, to) {
    var out = [], i, j, k;
    for (i = 0; p && i < p.tracks.length; i++) {
      var t = p.tracks[i];
      if (t.kind !== "midi") { continue; }
      for (j = 0; j < t.clips.length; j++) {
        var c = t.clips[j], cs = c.start, ce = c.start + c.len;
        if (c.type !== "midi" || ce <= from || cs >= to) { continue; }
        for (k = 0; k < c.notes.length; k++) {
          var n = c.notes[k], rel = n[0] - (c.offset || 0), at = cs + rel;
          if (rel < 0 || rel >= c.len || at < from || at >= to) { continue; }
          out.push({ tick: at, end: n[1] > 0 ? Math.min(at + n[1], ce) : at, d: n[1], m: n[2], v: n[3], track: t.id, clip: c.id, ti: i, rel: rel });
        }
      }
    }
    out.sort(function (a, b) { return a.tick - b.tick || a.ti - b.ti || a.m - b.m; });
    return out;
  }

  // ---------- §341 9A-3: ピアノロールの編集（クリップの中の音符・tick は整数・NoteEvent の形はそのまま）----------
  function snap(t, grid, floor) { grid = Math.max(1, Math.round(grid) || 1); return (floor ? Math.floor(t / grid) : Math.round(t / grid)) * grid; }
  function sortNotes(c) { c.notes.sort(function (a, b) { return a[0] - b[0] || a[2] - b[2]; }); }
  // 位置・長さをクリップの中におさめる（t: offset〜offset＋len−1・終わりは offset＋len まで）
  function fitNote(c, t, d) {
    var o = c.offset || 0, end = o + c.len;
    t = Math.round(num(t, o, o, end - 1));
    d = Math.round(num(d, 0, 0));
    if (t + d > end) { d = end - t; }
    return [t, Math.max(0, d)];
  }
  // 足す（足した音符を返す。いっぱいなら null）
  function noteAdd(c, t, m, d, v) {
    if (!c || c.type !== "midi" || c.notes.length >= MAX_NOTES) { return null; }
    var f = fitNote(c, t, d === undefined ? PPQ : d);
    var n = [f[0], Math.max(1, f[1]), int(m, 60, 0, 127), Math.round(num(v, 0.8, 0, 1) * 1000) / 1000];
    c.notes.push(n);
    sortNotes(c);
    return n;
  }
  // 動かす・長さを変える（n はその音符の配列そのもの。o: { t, m, d } の変えたい所だけ）
  function noteSet(c, n, o) {
    if (!c || c.notes.indexOf(n) < 0) { return null; }
    var t = o.t !== undefined ? o.t : n[0], d = o.d !== undefined ? o.d : n[1];
    if (o.t !== undefined && o.d === undefined && d > 0) { t = Math.min(t, (c.offset || 0) + c.len - d); } // 動かすときは長さを保つ（はみ出すなら前へ）
    var f = fitNote(c, t, d);
    n[0] = f[0];
    n[1] = o.d !== undefined ? Math.max(1, f[1]) : f[1];
    if (o.m !== undefined) { n[2] = int(o.m, n[2], 0, 127); }
    sortNotes(c);
    return n;
  }
  function noteDelete(c, n) { var i = c ? c.notes.indexOf(n) : -1; if (i < 0) { return false; } c.notes.splice(i, 1); return true; }

  function findTrack(p, id) { var i; for (i = 0; p && i < p.tracks.length; i++) { if (p.tracks[i].id === id) { return p.tracks[i]; } } return null; }
  function findClip(p, id) {
    var i, j;
    for (i = 0; p && i < p.tracks.length; i++) { for (j = 0; j < p.tracks[i].clips.length; j++) { if (p.tracks[i].clips[j].id === id) { return { track: p.tracks[i], clip: p.tracks[i].clips[j] }; } } }
    return null;
  }
  function setBpm(p, bpm) { var ps = points(p); ps[0].bpm = num(Math.round(bpm), ps[0].bpm, BPM_MIN, BPM_MAX); if (p.tempo) { p.tempo.points = ps; } return ps[0].bpm; }

  // ---------- 直す（壊れた・古い・空のデータでも落ちない）----------
  function cleanNotes(list, scale) {
    var out = [], i, n;
    scale = scale || 1;
    if (!isArr(list)) { return out; }
    for (i = 0; i < list.length && out.length < MAX_NOTES; i++) {
      n = list[i];
      if (!isArr(n) || typeof n[0] !== "number" || typeof n[2] !== "number" || !isFinite(n[0]) || !isFinite(n[2])) { continue; } // 時刻と高さが数でない音符は捨てる（JSON の null・文字など）
      out.push([int(Number(n[0]) * scale, 0, 0), int(Number(n[1]) * scale, 0, 0), int(n[2], 60, 0, 127), Math.round(num(n[3], 0.8, 0, 1) * 1000) / 1000]);
    }
    out.sort(function (a, b) { return a[0] - b[0] || a[2] - b[2]; });
    return out;
  }
  function cleanClip(c, p, scale) {
    if (!isObj(c)) { return null; }
    var o = copy(c) || {};
    o.type = c.type === "gen" || c.type === "audio" ? c.type : "midi";
    o.start = int(num(c.start, 0) * scale, 0, 0);
    o.len = int(num(c.len, PPQ * 4) * scale, PPQ * 4, 1);
    o.offset = int(num(c.offset, 0) * scale, 0, 0);
    o.loop = isObj(c.loop) ? copy(c.loop) : null;
    if (o.type === "midi") { o.notes = cleanNotes(c.notes, scale); }
    if (o.type === "audio") { // §341 9A-10
      o.asset = typeof c.asset === "string" ? c.asset.substring(0, 40) : "";
      o.srcOffset = num(c.srcOffset, 0, 0); o.gain = num(c.gain, 1, 0, 4); o.fadeIn = num(c.fadeIn, 0, 0, FADE_MAX); o.fadeOut = num(c.fadeOut, 0, 0, FADE_MAX);
      // §341 9A-13: 非破壊の編集（あるときだけ整える。無いクリップには足さない ＝ 古い曲の保存の中身を変えない）
      if (c.hasOwnProperty("trimIn")) { var ti0 = Number(c.trimIn); if (isFinite(ti0) && ti0 > 0) { o.trimIn = r4(ti0); } else { delete o.trimIn; } }
      if (c.hasOwnProperty("trimOut")) { var to0 = Number(c.trimOut); if (c.trimOut !== null && isFinite(to0) && to0 > 0) { o.trimOut = r4(to0); } else { delete o.trimOut; } }
      if (c.hasOwnProperty("nudge")) { var nu0 = Number(c.nudge); if (isFinite(nu0) && nu0 !== 0) { o.nudge = Math.max(-NUDGE_MAX, Math.min(NUDGE_MAX, Math.round(nu0 * 10) / 10)); } else { delete o.nudge; } }
      cleanTakes(c, o); // §341 9A-14
      delete o.notes;
    }
    o.ext = isObj(c.ext) ? copy(c.ext) : {};
    o.id = typeof c.id === "string" && c.id ? c.id.substring(0, 20) : "";
    return o;
  }
  function cleanInstrument(ins) {
    if (!isObj(ins) || typeof ins.type !== "string") { return synthInstrument("lead"); }
    var o = copy(ins) || {};
    if (o.type === "synth") {
      if (!isObj(o.patch)) { o.patch = { mode: "inline", patch: null, hash: "" }; }
      if (!isObj(o.ext)) { o.ext = {}; }
    }
    return o;
  }
  // §341 9A-4: 知らない項目は消さずに残す（新しい版で足した値・いまの画面で変えられない値を守る）
  var PROJECT_KEYS = ["type", "version", "id", "name", "created", "saved", "ppq", "tempo", "key", "markers", "tracks", "assets", "master", "practice", "legacy", "ext", "readOnly"];
  var TRACK_KEYS = ["id", "name", "kind", "instrument", "vol", "pan", "mute", "solo", "fx", "clips", "auto", "ext"];
  function keepUnknown(src, dst, known) {
    var k, v;
    for (k in src) {
      if (!src.hasOwnProperty(k) || known.indexOf(k) >= 0 || /^__/.test(k)) { continue; }
      v = copy(src[k]);
      if (v !== undefined) { dst[k] = v; }
    }
  }
  function clean(src) {
    var p = newProject({ now: 0 }), i, j;
    if (!isObj(src)) { return p; }
    var scale = Number(src.ppq) > 0 && isFinite(Number(src.ppq)) ? PPQ / Number(src.ppq) : 1;
    p.version = int(src.version, VERSION, 1);
    if (p.version > VERSION) { p.readOnly = true; } // 知らない新しい版は読むだけ（§340）
    p.id = str(src.id, "p0", 40);
    p.name = str(src.name, "あたらしい曲", 40);
    p.created = num(src.created, 0, 0);
    p.saved = num(src.saved, 0, 0);
    // テンポ・拍子（tick 0 の点を必ず持つ・同じ tick は後のものを使う）
    var tp = src.tempo && isArr(src.tempo.points) ? src.tempo.points : [], pts = {};
    for (i = 0; i < tp.length; i++) { if (isObj(tp[i]) && isFinite(Number(tp[i].bpm))) { pts[int(num(tp[i].tick, 0) * scale, 0, 0)] = num(tp[i].bpm, 120, BPM_MIN, BPM_MAX); } }
    if (pts[0] === undefined) { pts[0] = 120; for (i = 0; i < tp.length; i++) { if (isObj(tp[i]) && isFinite(Number(tp[i].bpm))) { pts[0] = num(tp[i].bpm, 120, BPM_MIN, BPM_MAX); break; } } }
    p.tempo.points = Object.keys(pts).map(Number).sort(function (a, b) { return a - b; }).map(function (k) { return { tick: k, bpm: pts[k] }; });
    var tm = src.tempo && isArr(src.tempo.meters) ? src.tempo.meters : [], mts = {};
    for (i = 0; i < tm.length; i++) {
      if (!isObj(tm[i])) { continue; }
      var den = [1, 2, 4, 8, 16].indexOf(Number(tm[i].den)) >= 0 ? Number(tm[i].den) : 4;
      mts[int(num(tm[i].tick, 0) * scale, 0, 0)] = { num: int(tm[i].num, 4, 1, 32), den: den };
    }
    if (!mts[0]) { mts[0] = { num: 4, den: 4 }; }
    p.tempo.meters = Object.keys(mts).map(Number).sort(function (a, b) { return a - b; }).map(function (k) { return { tick: k, num: mts[k].num, den: mts[k].den }; });
    p.key = isArr(src.key) ? copy(src.key) : [];
    p.markers = isArr(src.markers) ? copy(src.markers) : [];
    p.assets = []; // §341 9A-10: 素材の参照（形のおかしいものは捨てる・同じ ID は 1 つ）
    var sa = isArr(src.assets) ? src.assets : [], aseen = {};
    for (i = 0; i < sa.length && p.assets.length < 64; i++) { var ca = cleanAsset(sa[i]); if (ca && !aseen[ca.id]) { aseen[ca.id] = true; p.assets.push(ca); } }
    if (isObj(src.master)) { p.master = copy(src.master); p.master.vol = num(p.master.vol, 80, 0, 100); if (!isObj(p.master.fx)) { p.master.fx = { items: [] }; } }
    if (isObj(src.practice)) { p.practice = copy(src.practice); }
    if (isObj(src.legacy)) { p.legacy = copy(src.legacy); }
    p.ext = isObj(src.ext) ? copy(src.ext) : {};
    // トラック（ID が無い・重なるときは付けなおす）
    var tr = isArr(src.tracks) ? src.tracks : [], seen = {};
    for (i = 0; i < tr.length && p.tracks.length < MAX_TRACKS; i++) {
      var s = tr[i];
      if (!isObj(s)) { continue; }
      var t = {
        id: "", name: str(s.name, "トラック", 40), kind: s.kind === "audio" || s.kind === "gen" ? s.kind : "midi",
        instrument: cleanInstrument(s.instrument), vol: num(s.vol, 80, 0, 100), pan: num(s.pan, 0, -1, 1), mute: !!s.mute, solo: !!s.solo,
        fx: isObj(s.fx) && isArr(s.fx.items) ? copy(s.fx) : { items: [] }, clips: [], auto: isArr(s.auto) ? copy(s.auto) : [], ext: isObj(s.ext) ? copy(s.ext) : {}
      };
      var cl = isArr(s.clips) ? s.clips : [];
      for (j = 0; j < cl.length; j++) { var c = cleanClip(cl[j], p, scale); if (c) { t.clips.push(c); } }
      t.clips.sort(function (a, b) { return a.start - b.start; });
      t.id = typeof s.id === "string" && s.id && !seen[s.id] ? s.id.substring(0, 20) : "";
      if (t.id) { seen[t.id] = true; }
      keepUnknown(s, t, TRACK_KEYS);
      p.tracks.push(t);
    }
    keepUnknown(src, p, PROJECT_KEYS);
    // 無い・重なる ID を付ける（トラックとクリップで一意）
    for (i = 0; i < p.tracks.length; i++) {
      if (!p.tracks[i].id) { p.tracks[i].id = nextId(p, "t"); }
      for (j = 0; j < p.tracks[i].clips.length; j++) { var cc = p.tracks[i].clips[j]; if (!cc.id || seen[cc.id]) { cc.id = ""; cc.id = nextId(p, "c"); } seen[cc.id] = true; }
    }
    return p;
  }

  // ---------- 見本のプロジェクト（8 小節・2 トラック）----------
  function demoProject(now) {
    var p = newProject({ name: "ゴリラのはじめの曲", bpm: 110, now: typeof now === "number" ? now : Date.now() });
    function n(list, vel) { var o = [], i; for (i = 0; i < list.length; i++) { o.push([Math.round(list[i][0] * PPQ), Math.round(list[i][1] * PPQ * 0.95), list[i][2], (list[i][0] % 4 === 0 ? (vel || 0.8) + 0.1 : (vel || 0.8))]); } return o; }
    var BAR4 = PPQ * 4 * 4;
    var lead = newTrack(p, "リード", synthInstrument("lead"));
    lead.ext.icon = "&#x1F3B8;";
    newMidiClip(p, lead, 0, BAR4, n([[0, 1, 76], [1, 0.5, 72], [1.5, 0.5, 74], [2, 1, 76], [3, 1, 69], [4, 1.5, 77], [5.5, 0.5, 76], [6, 1, 74], [7, 1, 72],
      [8, 1, 76], [9, 1, 79], [10, 0.5, 76], [10.5, 0.5, 74], [11, 1, 72], [12, 2, 74], [14, 1, 71], [15, 1, 67]]), "メロディ A");
    newMidiClip(p, lead, BAR4, BAR4, n([[0, 1, 81], [1, 0.5, 79], [1.5, 0.5, 76], [2, 1, 72], [3, 1, 76], [4, 1, 77], [5, 1, 81], [6, 1, 79], [7, 1, 77],
      [8, 1.5, 76], [9.5, 0.5, 74], [10, 1, 72], [11, 1, 76], [12, 1, 74], [13, 1, 71], [14, 2, 69]]), "メロディ B");
    var bass = newTrack(p, "ベース", synthInstrument("bass"));
    bass.ext.icon = "&#x1F50A;";
    var roots = [45, 41, 48, 43], bl = [], bl2 = [], k;
    for (k = 0; k < 4; k++) {
      var b0 = k * 4, r = roots[k];
      bl.push([b0, 0.9, r], [b0 + 1.5, 0.4, r], [b0 + 2, 0.9, r], [b0 + 3, 0.9, r]);
      bl2.push([b0, 0.9, r], [b0 + 1, 0.4, r + 12], [b0 + 1.5, 0.4, r], [b0 + 2, 0.9, r + 7], [b0 + 3, 0.9, r]);
    }
    newMidiClip(p, bass, 0, BAR4, n(bl, 0.75), "ベース A");
    newMidiClip(p, bass, BAR4, BAR4, n(bl2, 0.75), "ベース B");
    p.practice.loopA = 0;
    p.practice.loopB = BAR4 * 2; // 8 小節をループ
    return p;
  }

  // ---------- §341 9A-5: トラック・クリップの編集（クリップの中の音符の tick は動かさない。動かすのは start だけ）----------
  var MAX_BARS = 256, CLIP_MAX_BARS = 64;
  function barTicks(p) { return ticksPerBar(meterAt(p, 0)); }
  // 同じトラックで [start, start＋len) と重なるクリップ（except は数えない）
  function overlapClip(t, start, len, except) {
    var i, c;
    for (i = 0; i < t.clips.length; i++) { c = t.clips[i]; if (c !== except && c.id !== except && start < c.start + c.len && c.start < start + len) { return c; } }
    return null;
  }
  // start から後ろで、len が入る最初の空き
  function freeStart(t, start, len) {
    var s = Math.max(0, start), c, guard = 0;
    while ((c = overlapClip(t, s, len, null)) && guard++ < 500) { s = c.start + c.len; }
    return s;
  }
  function trackEnd(t) { var e = 0, i; for (i = 0; i < t.clips.length; i++) { e = Math.max(e, t.clips[i].start + t.clips[i].len); } return e; }
  function sortClips(t) { t.clips.sort(function (a, b) { return a.start - b.start; }); }
  function trackOf(p, t) { return typeof t === "string" ? findTrack(p, t) : t; }
  function addTrack(p, name, presetId) {
    if (!p || p.tracks.length >= MAX_TRACKS) { return null; }
    var t = newTrack(p, str(name, "", 40) || ("トラック " + (p.tracks.length + 1)), synthInstrument(presetId || "lead"));
    t.ext.icon = "&#x1F3B5;";
    return t;
  }
  function moveTrack(p, id, dir) {
    var i, j;
    for (i = 0; i < p.tracks.length; i++) { if (p.tracks[i].id === id) { break; } }
    j = i + (dir < 0 ? -1 : 1);
    if (i >= p.tracks.length || j < 0 || j >= p.tracks.length) { return false; }
    var t = p.tracks[i]; p.tracks[i] = p.tracks[j]; p.tracks[j] = t;
    return true;
  }
  // 空のクリップを足す（start を省くとトラックのいちばん後ろ。小節の頭にそろえ、重なるなら後ろへ）
  function addClip(p, track, start, bars, name) {
    var t = trackOf(p, track), bt = barTicks(p), len = Math.max(1, Math.min(CLIP_MAX_BARS, Math.round(bars || 4))) * bt;
    if (!t || t.kind !== "midi") { return null; }
    var s = start === undefined || start === null ? trackEnd(t) : snap(Math.max(0, start), bt, true);
    s = freeStart(t, s, len);
    if (s + len > MAX_BARS * bt) { return null; }
    var n = 1, names = {}, i;
    for (i = 0; i < t.clips.length; i++) { names[(t.clips[i].ext && t.clips[i].ext.name) || ""] = true; }
    while (names["クリップ " + n]) { n++; }
    var c = newMidiClip(p, t, s, len, [], name || ("クリップ " + n));
    sortClips(t);
    return c;
  }
  // 複製（音符は深いコピー・新しい ID・元のすぐ後ろの空き）
  function duplicateClip(p, id) {
    var f = findClip(p, id);
    if (!f) { return null; }
    var c = f.clip, t = f.track, d = copy(c), s = freeStart(t, c.start + c.len, c.len);
    if (s + c.len > MAX_BARS * barTicks(p)) { return null; }
    d.id = nextId(p, "c");
    d.start = s;
    d.ext = isObj(d.ext) ? d.ext : {};
    d.ext.name = str(((c.ext && c.ext.name) || "クリップ") + "（コピー）", "", 40);
    t.clips.push(d);
    sortClips(t);
    return d;
  }
  // 小節の単位で動かす（重なる・前に出る・遠すぎるときはやめて理由）
  function moveClip(p, id, bars) {
    var f = findClip(p, id);
    if (!f) { return { ok: false, why: "クリップが見つかりません" }; }
    var c = f.clip, bt = barTicks(p), ns = c.start + Math.round(bars) * bt;
    if (ns < 0) { return { ok: false, why: "これより前には動かせません" }; }
    if (ns + c.len > MAX_BARS * bt) { return { ok: false, why: "これより後ろには動かせません" }; }
    if (overlapClip(f.track, ns, c.len, c)) { return { ok: false, why: "ほかのクリップと重なるので動かせません" }; }
    c.start = ns;
    sortClips(f.track);
    return { ok: true };
  }
  // 長さを小節の単位で変える（はみ出た音符は消さない）
  function resizeClip(p, id, bars) {
    var f = findClip(p, id);
    if (!f) { return { ok: false, why: "クリップが見つかりません" }; }
    var c = f.clip, bt = barTicks(p), nl = c.len + Math.round(bars) * bt, i, hid = 0;
    if (nl < bt) { return { ok: false, why: "1 小節より短くはできません" }; }
    if (nl > CLIP_MAX_BARS * bt || c.start + nl > MAX_BARS * bt) { return { ok: false, why: "これより長くはできません" }; }
    if (overlapClip(f.track, c.start, nl, c)) { return { ok: false, why: "うしろのクリップと重なるので長くできません" }; }
    c.len = nl;
    for (i = 0; c.notes && i < c.notes.length; i++) { if (c.notes[i][0] - (c.offset || 0) >= nl) { hid++; } }
    return { ok: true, hidden: hid };
  }
  function hiddenNotes(c) { var i, n = 0; for (i = 0; c.notes && i < c.notes.length; i++) { if (c.notes[i][0] - (c.offset || 0) >= c.len) { n++; } } return n; }
  // ---------- §341 9A-7: ドラム（GM の番号の NoteEvent・d＝0・1 ステップ ＝ 16 分音符 ＝ 240 tick）----------
  var STEP = PPQ / 4, DRUM_V = 0.85;
  var DRUM_KIT = [[36, "キック"], [38, "スネア"], [39, "クラップ"], [42, "ハイハット（閉）"], [46, "ハイハット（開）"]];
  function drumInstrument() { return { type: "drum", kit: "gm" }; }
  function isDrum(t) { return !!(t && t.instrument && t.instrument.type === "drum"); }
  // ドラムのトラック（1 小節のパターンつき）
  function addDrumTrack(p, name) {
    if (!p || p.tracks.length >= MAX_TRACKS) { return null; }
    var n = 1, i;
    for (i = 0; i < p.tracks.length; i++) { if (isDrum(p.tracks[i])) { n++; } }
    var t = newTrack(p, str(name, "", 40) || (n > 1 ? "ドラム " + n : "ドラム"), drumInstrument());
    t.ext.icon = "&#x1F941;";
    newMidiClip(p, t, 0, barTicks(p), [], "パターン 1");
    return t;
  }
  function stepCount(c) { return Math.max(1, Math.floor(c.len / STEP)); }
  function findStep(c, m, step) {
    var t = (c.offset || 0) + step * STEP, i;
    for (i = 0; i < c.notes.length; i++) { if (c.notes[i][0] === t && c.notes[i][2] === m) { return c.notes[i]; } }
    return null;
  }
  // マスを切りかえる → true ＝ ON になった / false ＝ OFF になった（null ＝ 範囲の外）
  function toggleStep(c, m, step) {
    if (!c || c.type !== "midi" || step < 0 || step >= stepCount(c)) { return null; }
    var n = findStep(c, m, step);
    if (n) { c.notes.splice(c.notes.indexOf(n), 1); return false; }
    if (c.notes.length >= MAX_NOTES) { return null; }
    c.notes.push([(c.offset || 0) + step * STEP, 0, int(m, 36, 0, 127), DRUM_V]);
    sortNotes(c);
    return true;
  }

  // ---------- §341 9A-8: 強さ・スイング・パターン ----------
  var SWING_MAX_TICKS = STEP / 2; // 100% ＝ 120 tick（16 分の半分）
  function setStepVel(c, m, step, v) {
    var n = c ? findStep(c, m, step) : null;
    if (!n) { return null; }
    n[3] = Math.round(num(v, DRUM_V, 0.05, 1) * 1000) / 1000;
    return n;
  }
  function swingOf(t) { var v = t && t.ext ? Number(t.ext.swing) : 0; return isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : 0; }
  // クリップの中の位置 rel（t − offset）の音符を何 tick 遅らせるか（8 分の裏の 16 分だけ）
  function swingDelay(rel, swing) {
    if (!(swing > 0)) { return 0; }
    var r = ((Math.round(rel) % (2 * STEP)) + 2 * STEP) % (2 * STEP);
    return r === STEP ? Math.round(SWING_MAX_TICKS * Math.min(100, swing) / 100) : 0;
  }
  // パターン（1 小節 16 ステップ。[GM, [ステップ…], 強さ（省くと 0.85）, 裏の強さ]）
  var PATTERNS = {
    four: [[36, [0, 4, 8, 12]], [39, [4, 12]], [46, [2, 6, 10, 14]]],
    eight: [[36, [0, 8, 10]], [38, [4, 12]], [42, [0, 2, 4, 6, 8, 10, 12, 14], DRUM_V, 0.6]],
    sixteen: [[36, [0, 6, 8]], [38, [4, 12]], [42, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], DRUM_V, 0.55]],
    clear: []
  };
  // いまのクリップの 5 つの音のグリッドの上の音符を置きかえる（ほかの番号・ステップの間の音符は残す）
  function applyPattern(c, id) {
    var pat = PATTERNS[id], kit = {}, i, j, b, o = c ? (c.offset || 0) : 0;
    if (!c || !pat) { return false; }
    for (i = 0; i < DRUM_KIT.length; i++) { kit[DRUM_KIT[i][0]] = true; }
    c.notes = c.notes.filter(function (n) { var rel = n[0] - o; return !(kit[n[2]] && rel >= 0 && rel < c.len && rel % STEP === 0); });
    var bars = Math.max(1, Math.floor(stepCount(c) / 16));
    for (b = 0; b < bars; b++) {
      for (i = 0; i < pat.length; i++) {
        for (j = 0; j < pat[i][1].length; j++) {
          var st = pat[i][1][j], v = pat[i][3] !== undefined && st % 4 !== 0 ? pat[i][3] : (pat[i][2] || DRUM_V); // 拍の頭でないステップは「裏の強さ」
          if (c.notes.length < MAX_NOTES) { c.notes.push([o + (b * 16 + st) * STEP, 0, pat[i][0], v]); }
        }
      }
    }
    sortNotes(c);
    return true;
  }

  // §341 9A-6: トラックを消す（最後の 1 本は消さない）
  function deleteTrack(p, id) {
    var i;
    if (!p || p.tracks.length <= 1) { return { ok: false, why: "曲には 1 本以上のトラックが要ります（最後の 1 本は消せません）" }; }
    for (i = 0; i < p.tracks.length; i++) { if (p.tracks[i].id === id) { p.tracks.splice(i, 1); return { ok: true }; } }
    return { ok: false, why: "トラックが見つかりません" };
  }
  function deleteClip(p, id) {
    var f = findClip(p, id);
    if (!f) { return false; }
    f.track.clips.splice(f.track.clips.indexOf(f.clip), 1);
    return true;
  }

  // ---------- §341 9A-10: オーディオトラック（WAV の素材・音声の中身は IndexedDB。ここは形と計算だけ）----------
  var WAV_MAX_BYTES = 10 * 1024 * 1024, WAV_MAX_SEC = 60, MAX_AUDIO_TRACKS = 4, MAX_ASSETS = 8, MAX_ASSET_SEC = 120, PEAK_RATE = 100;
  function audioInstrument() { return { type: "audio" }; }
  function isAudio(t) { return !!(t && (t.kind === "audio" || (t.instrument && t.instrument.type === "audio"))); }
  function audioTrackCount(p) { var n = 0, i; for (i = 0; p && i < p.tracks.length; i++) { if (isAudio(p.tracks[i])) { n++; } } return n; }
  function addAudioTrack(p, name) {
    if (!p || p.tracks.length >= MAX_TRACKS) { return { ok: false, why: "トラックは " + MAX_TRACKS + " 本までです" }; }
    var n = audioTrackCount(p);
    if (n >= MAX_AUDIO_TRACKS) { return { ok: false, why: "オーディオトラックは " + MAX_AUDIO_TRACKS + " 本までです（同時に鳴る音声を少なくして、スマホで止まらないように）" }; }
    var t = newTrack(p, str(name, "", 40) || (n ? "オーディオ " + (n + 1) : "オーディオ"), audioInstrument());
    t.kind = "audio";
    t.ext.icon = "&#x1F3B5;";
    return { ok: true, track: t };
  }
  // WAV のヘッダーを調べる（RIFF のチャンクをたどる）→ { ok, fmt:1|3, bits, ch, sr, frames, sec, dataOffset, dataBytes } / { ok:false, why }
  function parseWav(ab) {
    var len = ab && typeof ab.byteLength === "number" ? ab.byteLength : 0;
    if (len < 12) { return { ok: false, error: "short", why: "ファイルが短すぎます（WAV ではないか、こわれています）" }; }
    var v = new DataView(ab);
    function tag(o) { return String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3)); }
    var t0 = tag(0);
    if (t0 !== "RIFF" || tag(8) !== "WAVE") {
      var why = "WAV（RIFF/WAVE）のファイルではありません";
      if (t0.substring(0, 3) === "ID3" || (v.getUint8(0) === 0xFF && (v.getUint8(1) & 0xE0) === 0xE0)) { why += "（MP3 のようです。いまは WAV だけ読みこめます）"; }
      else if (tag(4) === "ftyp") { why += "（m4a などのようです。いまは WAV だけ読みこめます）"; }
      else if (t0 === "RF64") { why = "RF64（4GB をこえる形式）の WAV には対応していません"; }
      return { ok: false, error: "notWav", why: why };
    }
    var o = 12, fmt = null, data = null, guard = 0;
    while (o + 8 <= len && guard++ < 1000) {
      var id = tag(o), size = v.getUint32(o + 4, true), body = o + 8;
      if (id === "fmt " && size >= 16 && body + 16 <= len) {
        fmt = { code: v.getUint16(body, true), ch: v.getUint16(body + 2, true), sr: v.getUint32(body + 4, true), align: v.getUint16(body + 12, true), bits: v.getUint16(body + 14, true) };
        if (fmt.code === 0xFFFE && size >= 40 && body + 26 <= len) { fmt.code = v.getUint16(body + 24, true); } // WAVE_FORMAT_EXTENSIBLE: サブフォーマットの頭
      } else if (id === "data") {
        data = { off: body, bytes: Math.min(size, len - body) }; // 録音の途中で止まった WAV（サイズが大きすぎる）はファイルの終わりまで
        if (fmt) { break; }
      }
      if (size > len) { break; }
      o = body + size + (size % 2); // チャンクは偶数のバイトにそろえる
    }
    if (!fmt) { return { ok: false, error: "broken", why: "WAV の形式（fmt）の情報が見つかりません（こわれているかもしれません）" }; }
    if (!data) { return { ok: false, error: "broken", why: "WAV の音のデータ（data）が見つかりません（こわれているかもしれません）" }; }
    if (fmt.code !== 1 && fmt.code !== 3) { return { ok: false, error: "codec", why: "圧縮された WAV（形式 " + fmt.code + "）には対応していません。PCM（非圧縮）の WAV にしてください" }; }
    if (fmt.code === 1 && [8, 16, 24, 32].indexOf(fmt.bits) < 0) { return { ok: false, error: "bits", why: fmt.bits + "bit の WAV には対応していません（16bit・24bit にしてください）" }; }
    if (fmt.code === 3 && fmt.bits !== 32) { return { ok: false, error: "bits", why: "32bit 以外の float の WAV には対応していません" }; }
    if (fmt.ch < 1 || fmt.ch > 2) { return { ok: false, error: "ch", why: fmt.ch + "ch の WAV には対応していません（モノラル・ステレオだけ）" }; }
    if (fmt.sr < 8000 || fmt.sr > 96000) { return { ok: false, error: "rate", why: "サンプリングレート " + fmt.sr + "Hz には対応していません（8,000〜96,000Hz）" }; }
    var align = fmt.align || fmt.ch * fmt.bits / 8, frames = Math.floor(data.bytes / align);
    if (!(frames > 0)) { return { ok: false, error: "empty", why: "WAV に音のデータがありません" }; }
    return { ok: true, fmt: fmt.code, bits: fmt.bits, ch: fmt.ch, sr: fmt.sr, frames: frames, sec: frames / fmt.sr, dataOffset: data.off, dataBytes: data.bytes, bytes: len };
  }
  // 読みこむ前の上限（大きさ・長さ・トラックの数・素材の数）→ "" ＝ OK / 理由
  function wavLimitWhy(info, bytes) {
    if (bytes > WAV_MAX_BYTES) { return "ファイルが大きすぎます（" + (Math.round(bytes / 104857.6) / 10) + "MB・" + (WAV_MAX_BYTES / 1048576) + "MB まで）"; }
    if (info && info.sec > WAV_MAX_SEC + 0.0005) { return "音声が長すぎます（" + (Math.round(info.sec * 10) / 10) + " 秒・" + WAV_MAX_SEC + " 秒まで）"; }
    return "";
  }
  // 中身のハッシュ（全バイト・2 つの 32bit）→ "a:" ＋ 16 けた
  function hashBytes(u8) {
    var h1 = 0x811c9dc5, h2 = 5381, i, n = u8.length, im = Math.imul;
    if (im) { for (i = 0; i < n; i++) { h1 = im(h1 ^ u8[i], 16777619); h2 = (im(h2, 33) + u8[i]) | 0; } }
    else { for (i = 0; i < n; i++) { h1 ^= u8[i]; h1 = (h1 + ((h1 << 1) + (h1 << 4) + (h1 << 7) + (h1 << 8) + (h1 << 24))) | 0; h2 = (((h2 << 5) + h2) + u8[i]) | 0; } }
    return "a:" + ("0000000" + (h1 >>> 0).toString(16)).slice(-8) + ("0000000" + ((h2 ^ n) >>> 0).toString(16)).slice(-8);
  }
  function assetRef(info, name, hash) {
    return { id: hash, name: str(name, "音声", 80), bytes: info.bytes, sr: info.sr, ch: info.ch, bits: info.bits, frames: info.frames, sec: Math.round(info.sec * 1e6) / 1e6, hash: hash, store: "idb", src: "import", license: "", added: Date.now() };
  }
  // 同じ素材か（名前は見ない）
  function sameAsset(a, b) { return !!(a && b && a.hash === b.hash && a.bytes === b.bytes && a.frames === b.frames && a.sr === b.sr && a.ch === b.ch); }
  function findAsset(p, id) { var i, l = p && isArr(p.assets) ? p.assets : []; for (i = 0; i < l.length; i++) { if (l[i] && l[i].id === id) { return l[i]; } } return null; }
  // その素材を使っているクリップの数
  function assetUse(p, id) { var n = 0, i, j; for (i = 0; p && i < p.tracks.length; i++) { for (j = 0; j < p.tracks[i].clips.length; j++) { if (clipAssets(p.tracks[i].clips[j]).indexOf(id) >= 0) { n++; } } } return n; } // 9A-14: 使っていないテイクの素材もふくむ
  function audioClipCount(p) { var n = 0, i, j; for (i = 0; p && i < p.tracks.length; i++) { for (j = 0; j < p.tracks[i].clips.length; j++) { if (p.tracks[i].clips[j].type === "audio") { n++; } } } return n; }
  // 曲に素材を足せるか（新しい素材のとき）→ "" / 理由
  function assetRoomWhy(p, info) {
    var l = p && isArr(p.assets) ? p.assets : [], sec = 0, i;
    for (i = 0; i < l.length; i++) { sec += Number(l[i] && l[i].sec) || 0; }
    var tail = "。テイクを外しても端末の素材は消えません（「📁 曲」の「曲から外す」で、この曲の一覧から外せます）。端末の素材は「🎵 素材ライブラリ」で確かめられますが、端末の素材を削除しても、1 曲の上限は増えません"; // §341 9A-15
    if (l.length >= MAX_ASSETS) { return "1 曲の音声の素材は " + MAX_ASSETS + " 個までです（いま " + l.length + " 個・合計 " + Math.round(sec * 10) / 10 + " 秒）" + tail; }
    if (sec + info.sec > MAX_ASSET_SEC + 0.001) { return "1 曲の音声の素材は合計 " + MAX_ASSET_SEC + " 秒までです（いま " + l.length + " 個・" + Math.round(sec * 10) / 10 + " 秒）" + tail; }
    return "";
  }
  // 音声の秒 → クリップの長さ（start から、いまのテンポで小節に切り上げ・1〜64 小節）
  function audioClipLen(p, start, sec) {
    var bt = barTicks(p), endT = secToTick(p, tickToSec(p, start) + sec), bars = Math.ceil((endT - start) / bt - 1e-6);
    return Math.max(1, Math.min(CLIP_MAX_BARS, bars)) * bt;
  }
  // オーディオのクリップを足す（start を省くとトラックのいちばん後ろ。小節の頭・重なるなら後ろへ）
  function addAudioClip(p, track, start, asset, name) {
    var t = trackOf(p, track), bt = barTicks(p);
    if (!t || !isAudio(t) || !asset) { return null; }
    var s = start === undefined || start === null ? trackEnd(t) : snap(Math.max(0, start), bt, true);
    var len = audioClipLen(p, s, asset.sec);
    s = freeStart(t, s, len);
    len = audioClipLen(p, s, asset.sec);
    if (s + len > MAX_BARS * bt) { return null; }
    var c = { id: nextId(p, "c"), type: "audio", asset: asset.id, start: s, len: len, offset: 0, srcOffset: 0, gain: 1, fadeIn: 0, fadeOut: 0, loop: null, ext: { name: str(name, "", 40) || "音声" } };
    t.clips.push(c);
    sortClips(t);
    return c;
  }
  // §341 9A-13: オーディオのクリップの鳴る範囲（曲の秒）。GAME_DESIGN §341「§340 の AudioClip の項目の意味」
  // A ＝ 秒(start) ＋ nudge。素材の時刻 s は A ＋ (s − srcOffset) に鳴る。鳴りはじめ p0 ＝ A ＋ (trimIn − srcOffset)、鳴り終わり p1 ＝ min(A ＋ (trimOut − srcOffset), 秒(start＋len) ＋ nudge)
  var NUDGE_MAX = 1000, FADE_MAX = 10, TRIM_MIN = 0.01;
  function r4(x) { return Math.round(x * 10000) / 10000; }
  function audioSpan(p, c) {
    var a = findAsset(p, c.asset), dur = a && Number(a.sec) > 0 ? Number(a.sec) : Infinity, so = Math.max(0, Number(c.srcOffset) || 0);
    var tin = Math.max(so, Number(c.trimIn) || 0), tout = c.trimOut !== null && c.trimOut !== undefined && Number(c.trimOut) > 0 ? Number(c.trimOut) : dur;
    tin = Math.min(tin, dur); tout = Math.max(tin, Math.min(dur, tout));
    var nu = Math.max(-NUDGE_MAX, Math.min(NUDGE_MAX, Number(c.nudge) || 0)), A = tickToSec(p, c.start) + nu / 1000, box = tickToSec(p, c.start + c.len) + nu / 1000;
    var p0 = A + (tin - so), full = A + (tout - so), p1 = Math.min(full, box);
    return { asset: a, dur: dur, so: so, tin: tin, tout: tout, nudge: nu, A: A, p0: p0, p1: p1, full: full, box: box, boxCut: box < full - 1e-6, pre: p0 < 0 ? -p0 : 0,
      fadeIn: num(c.fadeIn, 0, 0, FADE_MAX), fadeOut: num(c.fadeOut, 0, 0, FADE_MAX), gain: num(c.gain, 1, 0, 4), ok: p1 > Math.max(0, p0) + 1e-4,
      edited: c.hasOwnProperty("trimIn") || c.hasOwnProperty("trimOut") || c.hasOwnProperty("nudge") || num(c.fadeIn, 0, 0) > 0 || num(c.fadeOut, 0, 0) > 0 };
  }
  // 曲の tick の [from, to) で鳴りはじめる音声（区間の境目は同じ秒の計算なので、重ならない・欠けない）。fresh ＝ 区間の頭（再生の開始・ループで戻った）なら、from にかかっているクリップを途中から
  // → { tick, sec（鳴りはじめの曲の秒）, src（そこで鳴る素材の時刻）, p0（鳴りはじめ・頭より前もふくむ）, endSec（鳴り終わり）, fadeIn, fadeOut, gain, skip（tick・途中から）, start, end, asset, track, clip, ti }
  function audioEvents(p, from, to, fresh) {
    var out = [], i, j, fs = tickToSec(p, from), ts = tickToSec(p, to);
    for (i = 0; p && i < p.tracks.length; i++) {
      var t = p.tracks[i];
      if (!isAudio(t)) { continue; }
      for (j = 0; j < t.clips.length; j++) {
        var c = t.clips[j];
        if (c.type !== "audio" || !c.asset) { continue; }
        var s = audioSpan(p, c), b = Math.max(0, s.p0), at = null;
        if (!s.ok) { continue; }
        if (b >= fs && b < ts) { at = b; } else if (fresh && b < fs && s.p1 > fs) { at = fs; }
        if (at === null) { continue; }
        var tk = Math.round(secToTick(p, at) * 1000) / 1000;
        out.push({ tick: tk, sec: at, src: s.tin + (at - s.p0), p0: s.p0, endSec: s.p1, fadeIn: s.fadeIn, fadeOut: s.fadeOut, gain: s.gain, skip: at > b ? Math.round((tk - secToTick(p, b)) * 1000) / 1000 : 0,
          start: c.start, end: c.start + c.len, asset: c.asset, srcOffset: s.so, track: t.id, clip: c.id, ti: i });
      }
    }
    out.sort(function (a, b) { return a.sec - b.sec || a.ti - b.ti; });
    return out;
  }
  // §341 9A-13: 編集の値を変える（o: { trimIn, trimOut, nudge, fadeIn, fadeOut, reset }・秒／ms）。範囲に入れ、既定の値は消す（無い ＝ 編集なし）。trimOut を変えたら箱の長さを鳴る範囲に合わせる（次のクリップとは重ねない）
  function setAudioEdit(p, id, o) {
    var f = findClip(p, id);
    if (!f || f.clip.type !== "audio") { return { ok: false, why: "オーディオのクリップが見つかりません" }; }
    var c = f.clip, s = audioSpan(p, c), k;
    o = o || {};
    if (o.reset) { delete c.trimIn; delete c.trimOut; delete c.nudge; c.fadeIn = 0; c.fadeOut = 0; }
    if (!isFinite(s.dur) && (o.trimIn !== undefined || o.trimOut !== undefined)) { return { ok: false, why: "素材の長さが分からないので、切れません" }; }
    if (o.trimIn !== undefined) { var ti = r4(Math.max(s.so, Math.min(s.tout - TRIM_MIN, Number(o.trimIn) || 0))); if (ti > s.so) { c.trimIn = ti; } else { delete c.trimIn; } s = audioSpan(p, c); }
    if (o.trimOut !== undefined) { var to = r4(Math.max(s.tin + TRIM_MIN, Math.min(s.dur, Number(o.trimOut) || 0))); if (to < s.dur - 0.00005) { c.trimOut = to; } else { delete c.trimOut; } }
    if (o.nudge !== undefined) { var nu = Math.max(-NUDGE_MAX, Math.min(NUDGE_MAX, Math.round((Number(o.nudge) || 0) * 10) / 10)); if (nu) { c.nudge = nu; } else { delete c.nudge; } }
    var fl = ["fadeIn", "fadeOut"];
    for (k = 0; k < fl.length; k++) { if (o[fl[k]] !== undefined) { c[fl[k]] = r4(Math.max(0, Math.min(FADE_MAX, Number(o[fl[k]]) || 0))); } }
    if (o.trimOut !== undefined || o.reset) {
      s = audioSpan(p, c);
      if (isFinite(s.dur)) {
        var len = audioClipLen(p, c.start, s.tout - s.so), t = f.track, nx = Infinity, j;
        for (j = 0; j < t.clips.length; j++) { if (t.clips[j] !== c && t.clips[j].start >= c.start + 1 && t.clips[j].start < nx) { nx = t.clips[j].start; } }
        if (c.start + len > nx) { len = Math.max(barTicks(p), Math.floor((nx - c.start) / barTicks(p)) * barTicks(p)); }
        c.len = len;
      }
    }
    return { ok: true, clip: c, span: audioSpan(p, c) };
  }
  // ---------- §341 9A-14: テイク（AudioClip の takes・take。GAME_DESIGN §341「9A-14 のテイク管理 Lite」）----------
  // asset と trimIn〜fadeOut ＝ いま使っているテイク。takes[].edit ＝ 使っていないテイクの編集値
  var MAX_TAKES = 3, TAKE_IDS = "ABCDEFGH", EDIT_KEYS = ["trimIn", "trimOut", "nudge", "fadeIn", "fadeOut"];
  function cleanEdit(e) {
    var o = {}, v;
    if (!isObj(e)) { return o; }
    v = Number(e.trimIn); if (isFinite(v) && v > 0) { o.trimIn = r4(v); }
    v = Number(e.trimOut); if (e.trimOut !== null && isFinite(v) && v > 0) { o.trimOut = r4(v); }
    v = Number(e.nudge); if (isFinite(v) && v !== 0) { o.nudge = Math.max(-NUDGE_MAX, Math.min(NUDGE_MAX, Math.round(v * 10) / 10)); }
    v = num(e.fadeIn, 0, 0, FADE_MAX); if (v > 0) { o.fadeIn = v; }
    v = num(e.fadeOut, 0, 0, FADE_MAX); if (v > 0) { o.fadeOut = v; }
    return o;
  }
  function editOf(c) { return cleanEdit(c); }
  function cleanTakes(c, o) {
    if (!c.hasOwnProperty("takes")) { delete o.take; return; }
    var src = isArr(c.takes) ? c.takes : [], out = [], seen = {}, i;
    for (i = 0; i < src.length && out.length < TAKE_IDS.length; i++) {
      var t = src[i];
      if (!isObj(t) || typeof t.id !== "string" || !/^[A-H]$/.test(t.id) || seen[t.id] || typeof t.asset !== "string" || !t.asset) { continue; }
      var x = copy(t) || {};
      x.asset = t.asset.substring(0, 40); x.name = str(t.name, "テイク", 80); x.at = int(t.at, 0, 0);
      if (t.hasOwnProperty("edit")) { x.edit = cleanEdit(t.edit); }
      seen[t.id] = true; out.push(x);
    }
    if (!out.length) { delete o.takes; delete o.take; return; }
    var act = null;
    for (i = 0; i < out.length; i++) { if (out[i].id === c.take && out[i].asset === o.asset) { act = out[i]; } }
    if (!act) { for (i = 0; i < out.length; i++) { if (out[i].asset === o.asset) { act = out[i]; break; } } }
    if (!act && o.asset) { // 使っている素材のテイクが一覧に無い（こわれた）: 消さずに足す
      for (i = 0; i < TAKE_IDS.length && seen[TAKE_IDS.charAt(i)]; i++) {}
      if (i < TAKE_IDS.length) { act = { id: TAKE_IDS.charAt(i), asset: o.asset, name: "テイク", at: 0 }; out.push(act); }
    }
    o.takes = out; o.take = act ? act.id : out[0].id;
    if (act) { delete act.edit; } // 使っているテイクの値はクリップの項目に
  }
  // クリップが使う素材（全部のテイク）
  function clipAssets(c) {
    var out = [], i;
    if (!c || c.type !== "audio") { return out; }
    if (c.asset) { out.push(c.asset); }
    if (isArr(c.takes)) { for (i = 0; i < c.takes.length; i++) { var a = c.takes[i] && c.takes[i].asset; if (a && out.indexOf(a) < 0) { out.push(a); } } }
    return out;
  }
  // テイクの一覧（テイクが無いクリップは、いまの素材を「A」として返す・データは変えない）
  function takesOf(p, c) {
    if (c && isArr(c.takes) && c.takes.length) { return c.takes; }
    var a = c ? findAsset(p, c.asset) : null;
    return c && c.asset ? [{ id: "A", asset: c.asset, name: (a && a.name) || "テイク", at: (a && a.added) || 0, virtual: true }] : [];
  }
  function activeTakeId(c) { return c && isArr(c.takes) && c.takes.length ? c.take : "A"; }
  function takeRoomWhy(c) { return takesOfCount(c) >= MAX_TAKES ? "1 つのクリップのテイクは " + MAX_TAKES + " 個までです（使っていないテイクを外すと録れます）" : ""; }
  function takesOfCount(c) { return c && isArr(c.takes) && c.takes.length ? c.takes.length : (c && c.asset ? 1 : 0); }
  // テイクを足して、それを使う（素材の参照は呼ぶ側が先に足す）
  function addTake(p, clipId, assetId, name, at) {
    var f = findClip(p, clipId), i;
    if (!f || f.clip.type !== "audio") { return { ok: false, why: "オーディオのクリップが見つかりません" }; }
    var c = f.clip, why = takeRoomWhy(c);
    if (why) { return { ok: false, why: why }; }
    if (!isArr(c.takes) || !c.takes.length) { var a0 = findAsset(p, c.asset); c.takes = [{ id: "A", asset: c.asset, name: str(String((a0 && a0.name) || (c.ext && c.ext.name) || "テイク").replace(/\.wav$/i, ""), "テイク", 80), at: int(a0 && a0.added, 0, 0) }]; c.take = "A"; }
    var used = {}; for (i = 0; i < c.takes.length; i++) { used[c.takes[i].id] = true; }
    for (i = 0; i < TAKE_IDS.length && used[TAKE_IDS.charAt(i)]; i++) {}
    var id = TAKE_IDS.charAt(i);
    c.takes.push({ id: id, asset: assetId, name: str(name, "テイク", 80), at: int(at, 0, 0), edit: {} });
    var r = selectTake(p, clipId, id);
    if (!r.ok) { c.takes.pop(); return r; }
    return { ok: true, take: id, clip: c };
  }
  // テイクを切りかえる（いまの編集値は takes[].edit へ・選んだテイクの値をクリップへ・長さに合わせて範囲に入れる）
  function selectTake(p, clipId, id) {
    var f = findClip(p, clipId), i, k;
    if (!f || f.clip.type !== "audio") { return { ok: false, why: "オーディオのクリップが見つかりません" }; }
    var c = f.clip, cur = null, tgt = null;
    if (!isArr(c.takes)) { return { ok: false, why: "テイクがありません" }; }
    for (i = 0; i < c.takes.length; i++) { if (c.takes[i].id === c.take) { cur = c.takes[i]; } if (c.takes[i].id === id) { tgt = c.takes[i]; } }
    if (!tgt) { return { ok: false, why: "テイクが見つかりません" }; }
    if (tgt === cur) { return { ok: true, same: true, clip: c }; }
    var ta = findAsset(p, tgt.asset);
    if (!ta || !(Number(ta.sec) > 0)) { return { ok: false, why: "テイク " + id + " の素材がありません" }; }
    var keep = editOf(c), e = cleanEdit(tgt.edit);
    if (cur) { cur.edit = keep; cur.asset = c.asset; }
    for (k = 0; k < EDIT_KEYS.length; k++) { delete c[EDIT_KEYS[k]]; }
    c.fadeIn = 0; c.fadeOut = 0;
    c.asset = tgt.asset; c.take = id; delete tgt.edit;
    var o = { trimOut: e.hasOwnProperty("trimOut") ? e.trimOut : ta.sec };
    if (e.hasOwnProperty("trimIn")) { o.trimIn = e.trimIn; }
    if (e.hasOwnProperty("nudge")) { o.nudge = e.nudge; }
    if (e.fadeIn) { o.fadeIn = e.fadeIn; } if (e.fadeOut) { o.fadeOut = e.fadeOut; }
    var r = setAudioEdit(p, clipId, o); // 素材の長さで範囲に入れ、箱の長さを合わせる
    return { ok: r.ok, why: r.why, clip: c, from: cur ? cur.id : "", to: id };
  }
  // 使っていないテイクを一覧から外す（素材の参照と WAV は残る）
  function removeTake(p, clipId, id) {
    var f = findClip(p, clipId), i;
    if (!f || !isArr(f.clip.takes)) { return { ok: false, why: "テイクがありません" }; }
    if (f.clip.take === id) { return { ok: false, why: "使っているテイクは外せません（ほかのテイクを使ってから）" }; }
    for (i = 0; i < f.clip.takes.length; i++) { if (f.clip.takes[i].id === id) { f.clip.takes.splice(i, 1); return { ok: true }; } }
    return { ok: false, why: "テイクが見つかりません" };
  }
  // 波形のピーク（1 秒 rate 点・0〜255。チャンネルの大きいほう）。chans: Float32Array の列
  function computePeaks(chans, sr, rate) {
    rate = rate || PEAK_RATE;
    var n = chans.length ? chans[0].length : 0, per = sr / rate, cnt = Math.ceil(n / per), out = [], k, i, c;
    for (k = 0; k < cnt; k++) {
      var a = Math.floor(k * per), b = Math.min(n, Math.floor((k + 1) * per)), m = 0;
      for (c = 0; c < chans.length; c++) { var d = chans[c]; for (i = a; i < b; i++) { var x = d[i]; if (x < 0) { x = -x; } if (x > m) { m = x; } } }
      out.push(Math.min(255, Math.round(Math.sqrt(Math.min(1, m)) * 255))); // 平方根で小さい音も見えるように
    }
    return out;
  }
  function cleanAsset(a) {
    if (!isObj(a) || typeof a.id !== "string" || !/^a:[0-9a-f]{16}$/.test(a.id)) { return null; }
    var o = copy(a) || {};
    o.name = str(a.name, "音声", 80);
    o.bytes = int(a.bytes, 0, 0); o.sr = int(a.sr, 44100, 1); o.ch = int(a.ch, 1, 1, 8); o.bits = int(a.bits, 16, 1, 64); o.frames = int(a.frames, 0, 0);
    o.sec = num(a.sec, o.frames / o.sr, 0); o.hash = typeof a.hash === "string" ? a.hash : a.id;
    o.store = "idb";
    return o;
  }

  // ---------- §341 9A-4: 保存の形（localStorage の曲 1 つ ＝ JSON の書き出し）----------
  var FORMAT = "ultimate-gorilla-daw", SCHEMA = 1, MAX_JSON = 2 * 1024 * 1024;
  // 新しい曲の ID（時刻 ＋ 乱数・ほかの曲と重ならない）
  function newProjectId(now) { return "p" + (typeof now === "number" ? now : Date.now()).toString(36) + Math.floor(Math.random() * 1679616).toString(36); }
  // からっぽの曲（リードとベース・空のクリップ 4 小節 × 2・8 小節ループ）
  function emptyProject(now) {
    var p = newProject({ name: "あたらしい曲", bpm: 120, now: typeof now === "number" ? now : Date.now() }), BAR4 = PPQ * 4 * 4;
    var a = newTrack(p, "リード", synthInstrument("lead")), b = newTrack(p, "ベース", synthInstrument("bass"));
    a.ext.icon = "&#x1F3B8;"; b.ext.icon = "&#x1F50A;";
    newMidiClip(p, a, 0, BAR4, [], "メロディ A"); newMidiClip(p, a, BAR4, BAR4, [], "メロディ B");
    newMidiClip(p, b, 0, BAR4, [], "ベース A"); newMidiClip(p, b, BAR4, BAR4, [], "ベース B");
    p.practice.loopA = 0; p.practice.loopB = BAR4 * 2;
    return p;
  }
  function noteCount(p) { var n = 0, i, j; for (i = 0; p && i < p.tracks.length; i++) { for (j = 0; j < p.tracks[i].clips.length; j++) { n += (p.tracks[i].clips[j].notes || []).length; } } return n; }
  // 保存する形（schemaVersion つき）。readOnly（画面だけの印）は入れない
  function toRecord(p, now) {
    var q = copy(p);
    delete q.readOnly;
    if (typeof now === "number") { q.saved = now; }
    return { format: FORMAT, schemaVersion: SCHEMA, saved: q.saved || 0, project: q };
  }
  // 読む: 形を確かめて clean する → { ok, project } / { ok:false, error, why }。元のデータは変えない
  function fromRecord(obj) {
    var src;
    if (!isObj(obj)) { return { ok: false, error: "notDaw", why: "ゴリラDAW の曲のデータではありません" }; }
    if (obj.format === FORMAT) {
      var sv = Number(obj.schemaVersion);
      if (!isFinite(sv) || sv < 1) { return { ok: false, error: "schema", why: "保存の形の版（schemaVersion）がおかしいです" }; }
      if (sv > SCHEMA) { return { ok: false, error: "newer", why: "新しい版のゴリラDAW で作られたデータなので、この版では開けません" }; }
      src = obj.project;
    } else if (obj.type === TYPE) {
      src = obj; // schemaVersion の無い Project そのもの
    } else {
      return { ok: false, error: "notDaw", why: "ゴリラDAW の曲のデータではありません" };
    }
    if (!isObj(src) || src.type !== TYPE || !isArr(src.tracks)) { return { ok: false, error: "broken", why: "曲のデータが欠けています（トラックがありません）" }; }
    var p;
    try { p = clean(src); } catch (e) { return { ok: false, error: "broken", why: "曲のデータを読めませんでした" }; }
    if (p.readOnly) { return { ok: false, error: "newer", why: "新しい版のゴリラDAW で作られた曲なので、この版では開けません" }; }
    return { ok: true, project: p };
  }
  // JSON の文字 → fromRecord（大きすぎ・JSON でない は読まない）
  function parseRecordText(text) {
    if (typeof text !== "string" || !text.length) { return { ok: false, error: "empty", why: "ファイルが空です" }; }
    if (text.length > MAX_JSON) { return { ok: false, error: "big", why: "ファイルが大きすぎます（2MB まで）" }; }
    var obj;
    try { obj = JSON.parse(text.charCodeAt(0) === 0xFEFF ? text.substring(1) : text); } catch (e) { return { ok: false, error: "json", why: "JSON として読めませんでした（ファイルがこわれているか、ちがうファイルです）" }; }
    return fromRecord(obj);
  }

  window.UGDawModel = {
    PPQ: PPQ, VERSION: VERSION, TYPE: TYPE, STORE_KEY: STORE_KEY, BPM_MIN: BPM_MIN, BPM_MAX: BPM_MAX,
    clean: clean, cleanNotes: cleanNotes, newProject: newProject, newTrack: newTrack, newMidiClip: newMidiClip, synthInstrument: synthInstrument, demoProject: demoProject,
    nextId: nextId, hash: hash, bpmAt: bpmAt, setBpm: setBpm, meterAt: meterAt, ticksPerBar: ticksPerBar, barToTick: barToTick, tickToBar: tickToBar,
    tickToSec: tickToSec, secToTick: secToTick, endTick: endTick, viewBars: viewBars, findTrack: findTrack, findClip: findClip,
    songEndTick: songEndTick, loopRange: loopRange, audible: audible, noteEvents: noteEvents,
    snap: snap, noteAdd: noteAdd, noteSet: noteSet, noteDelete: noteDelete,
    FORMAT: FORMAT, SCHEMA: SCHEMA, MAX_JSON: MAX_JSON, newProjectId: newProjectId, emptyProject: emptyProject, noteCount: noteCount,
    toRecord: toRecord, fromRecord: fromRecord, parseRecordText: parseRecordText,
    MAX_TRACKS: MAX_TRACKS, barTicks: barTicks, trackEnd: trackEnd, overlapClip: overlapClip, addTrack: addTrack, moveTrack: moveTrack,
    addClip: addClip, duplicateClip: duplicateClip, moveClip: moveClip, resizeClip: resizeClip, deleteClip: deleteClip, hiddenNotes: hiddenNotes, deleteTrack: deleteTrack,
    STEP: STEP, DRUM_KIT: DRUM_KIT, drumInstrument: drumInstrument, isDrum: isDrum, addDrumTrack: addDrumTrack, stepCount: stepCount, findStep: findStep, toggleStep: toggleStep,
    DRUM_V: DRUM_V, SWING_MAX_TICKS: SWING_MAX_TICKS, setStepVel: setStepVel, swingOf: swingOf, swingDelay: swingDelay, PATTERNS: PATTERNS, applyPattern: applyPattern,
    // §341 9A-10: オーディオトラック
    WAV_MAX_BYTES: WAV_MAX_BYTES, WAV_MAX_SEC: WAV_MAX_SEC, MAX_AUDIO_TRACKS: MAX_AUDIO_TRACKS, MAX_ASSETS: MAX_ASSETS, MAX_ASSET_SEC: MAX_ASSET_SEC, PEAK_RATE: PEAK_RATE,
    audioInstrument: audioInstrument, isAudio: isAudio, audioTrackCount: audioTrackCount, addAudioTrack: addAudioTrack, parseWav: parseWav, wavLimitWhy: wavLimitWhy, hashBytes: hashBytes,
    assetRef: assetRef, sameAsset: sameAsset, findAsset: findAsset, assetUse: assetUse, audioClipCount: audioClipCount, assetRoomWhy: assetRoomWhy, audioClipLen: audioClipLen,
    addAudioClip: addAudioClip, audioEvents: audioEvents, audioSpan: audioSpan, setAudioEdit: setAudioEdit, clipAssets: clipAssets, takesOf: takesOf, activeTakeId: activeTakeId, addTake: addTake, selectTake: selectTake, removeTake: removeTake, takeRoomWhy: takeRoomWhy, MAX_TAKES: MAX_TAKES, NUDGE_MAX: NUDGE_MAX, FADE_MAX: FADE_MAX, computePeaks: computePeaks, cleanAsset: cleanAsset
  };
})();
