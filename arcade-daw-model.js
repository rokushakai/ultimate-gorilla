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
          out.push({ tick: at, end: n[1] > 0 ? Math.min(at + n[1], ce) : at, d: n[1], m: n[2], v: n[3], track: t.id, clip: c.id, ti: i });
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
    p.assets = isArr(src.assets) ? copy(src.assets) : [];
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
    toRecord: toRecord, fromRecord: fromRecord, parseRecordText: parseRecordText
  };
})();
