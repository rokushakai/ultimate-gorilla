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
      cleanComp(c, o); // §341 9A-16
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
        fx: fxClean(s.fx), clips: [], auto: autoClean(s.auto), ext: isObj(s.ext) ? copy(s.ext) : {}
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

  // ---------- §342 9B-8: トラックの FX（3 バンド EQ・コンプレッサー）。§340 の FxChain（{ items: [{ type, on, …値 }] }）の形のまま ----------
  // 範囲 [はじめ, 下, 上, きざみ]。EQ・Makeup・Threshold は dB、Ratio は :1、Attack・Release は秒
  var FX_EQ = { low: [0, -12, 12, 0.5], mid: [0, -12, 12, 0.5], high: [0, -12, 12, 0.5] };
  var FX_COMP = { threshold: [-18, -60, 0, 0.5], ratio: [3, 1, 20, 0.1], attack: [0.01, 0.001, 0.1, 0.001], release: [0.2, 0.02, 1, 0.001], makeup: [0, -12, 12, 0.5] };
  var FX_BANDS = { low: { type: "lowshelf", freq: 150, q: 1 }, mid: { type: "peaking", freq: 1000, q: 1 }, high: { type: "highshelf", freq: 7000, q: 1 } }, FX_KNEE = 6;
  function fxNum(v, d) { var n = Number(v); if (typeof v === "boolean" || v === null || v === "" || !isFinite(n)) { n = d[0]; } n = Math.max(d[1], Math.min(d[2], n)); n = Math.round(n / d[3]) * d[3]; return Math.round(n * 10000) / 10000; }
  function fxItem(type, src) {
    var def = type === "eq3" ? FX_EQ : FX_COMP, o = isObj(src) ? copy(src) : {}, k;
    o.type = type; o.on = isObj(src) ? src.on === true : false;
    for (k in def) { if (def.hasOwnProperty(k)) { o[k] = fxNum(o[k], def[k]); } }
    return o;
  }
  // 読むとき: eq3・comp は値を範囲に入れる（同じ type の 2 つ目からは捨てる）。知らない type・知らない値は残す。オブジェクトでない項目は捨てる
  function fxClean(src) {
    if (!isObj(src) || !isArr(src.items)) { var o0 = isObj(src) ? copy(src) : {}; o0.items = []; if (o0.bypass !== undefined) { o0.bypass = o0.bypass === true; } return o0; }
    var o = copy(src), it = [], seen = {}, i;
    for (i = 0; i < src.items.length; i++) {
      var x = src.items[i];
      if (!isObj(x)) { continue; }
      if (x.type === "eq3" || x.type === "comp") { if (seen[x.type]) { continue; } seen[x.type] = true; it.push(fxItem(x.type, x)); }
      else { it.push(copy(x)); }
    }
    o.items = it;
    if (o.bypass !== undefined) { o.bypass = o.bypass === true; }
    return o;
  }
  function fxFind(t, type) { var l = t && isObj(t.fx) && isArr(t.fx.items) ? t.fx.items : [], i; for (i = 0; i < l.length; i++) { if (isObj(l[i]) && l[i].type === type) { return l[i]; } } return null; }
  // いまの設定（無ければはじめの値・OFF）
  function fxOf(t) {
    var e = fxItem("eq3", fxFind(t, "eq3")), c = fxItem("comp", fxFind(t, "comp"));
    return { bypass: !!(t && isObj(t.fx) && t.fx.bypass === true), eq: { on: e.on, low: e.low, mid: e.mid, high: e.high }, comp: { on: c.on, threshold: c.threshold, ratio: c.ratio, attack: c.attack, release: c.release, makeup: c.makeup } };
  }
  // 音に効くもの: EQ ＝ ON で 0dB でないバンドがある・コンプ ＝ ON。バイパスなら何も効かない（そのときはノードを作らない ＝ v2.57 と同じ音）
  function fxLive(t) {
    var f = fxOf(t), eq = !f.bypass && f.eq.on && (f.eq.low !== 0 || f.eq.mid !== 0 || f.eq.high !== 0 || autoMoves(t, "eq.low") || autoMoves(t, "eq.mid") || autoMoves(t, "eq.high")), cp = !f.bypass && f.comp.on; // 9B-9: EQ のオートメーションに 0dB でない点があれば EQ を作る
    return { eq: eq, comp: cp, sig: (eq ? "e" : "") + (cp ? "c" : ""), fx: f };
  }
  // DynamicsCompressorNode が自分でかける「自動のメイクアップ」（Web Audio の仕様・Blink の DynamicsCompressorKernel と同じ計算）＝ (1 / fullRangeGain)^0.6。
  // これで割って、Makeup 0dB のときは「しきい値より小さい音の大きさは変わらない」にそろえる（そのままだと Threshold −60・Ratio 20 で約 +34dB も上がる）
  function fxAutoMakeup(threshold, ratio) {
    var th = Number(threshold), kn = FX_KNEE, sl = 1 / Math.max(1, Number(ratio) || 1);
    function lin(db) { return Math.pow(10, db / 20); }
    function db(x) { return 20 * Math.log(x) / Math.LN10; }
    var lt = lin(th), kdb = th + kn, kt = lin(kdb);
    function curve(x, k) { return x < lt ? x : lt + (1 - Math.exp(-k * (x - lt))) / k; }
    function slopeAt(x, k) { if (x < lt) { return 1; } var x2 = x * 1.001; return (db(curve(x2, k)) - db(curve(x, k))) / (db(x2) - db(x)); }
    var lo = 0.1, hi = 10000, k = 5, i;
    for (i = 0; i < 15; i++) { if (slopeAt(kt, k) < sl) { hi = k; } else { lo = k; } k = Math.sqrt(lo * hi); }
    var ykdb = db(curve(kt, k)), full = 1 < kt ? curve(1, k) : lin(ykdb + sl * (0 - kdb));
    var g = Math.pow(1 / full, 0.6);
    return isFinite(g) && g > 0 ? g : 1;
  }
  // 音を上げる設定か（画面の注意: EQ の + ・Makeup の +）
  function fxBoost(t) { var l = fxLive(t), f = l.fx, b = 0; if (l.eq) { b = Math.max(b, f.eq.low, f.eq.mid, f.eq.high); } if (l.comp) { b = Math.max(b, f.comp.makeup); } return b; }
  function fxHost(t) { if (!isObj(t.fx)) { t.fx = { items: [] }; } if (!isArr(t.fx.items)) { t.fx.items = []; } return t.fx; }
  // 値を 1 つ変える（part: "eq" | "comp" | "bypass"、key: "on" か値の名前）→ { ok, value }
  function fxSet(t, part, key, v) {
    if (!t) { return { ok: false }; }
    if (part === "bypass") { var h0 = fxHost(t); if (v) { h0.bypass = true; } else { delete h0.bypass; } return { ok: true, value: !!v }; }
    var type = part === "eq" ? "eq3" : (part === "comp" ? "comp" : ""), def = type === "eq3" ? FX_EQ : FX_COMP;
    if (!type || (key !== "on" && !def.hasOwnProperty(key))) { return { ok: false }; }
    var h = fxHost(t), it = fxFind(t, type);
    if (!it) { it = fxItem(type, null); h.items.push(it); }
    if (key === "on") { it.on = !!v; return { ok: true, value: it.on }; }
    it[key] = fxNum(v, def[key]);
    return { ok: true, value: it[key] };
  }
  // ↺: part ＝ "eq" | "comp"（その項目をはじめの値・ON／OFF はそのまま）／ 無し（eq3・comp の項目と bypass を消す。ほかの項目は残す）
  function fxReset(t, part) {
    if (!t) { return false; }
    if (part === "eq" || part === "comp") { var type = part === "eq" ? "eq3" : "comp", it = fxFind(t, type); if (it) { var on = it.on, d = fxItem(type, null), k; for (k in d) { if (d.hasOwnProperty(k)) { it[k] = d[k]; } } it.on = on; } return true; }
    var h = fxHost(t);
    h.items = h.items.filter(function (x) { return !(isObj(x) && (x.type === "eq3" || x.type === "comp")); });
    delete h.bypass;
    return true;
  }

  // ---------- §342 9B-9: トラック・オートメーション（§340 の Automation: { target, on, points: [[tick, 0〜1, "lin"|"step"]] }）----------
  // 画面の値 ↔ 0〜1: 音量 0〜100 ÷ 100・パン (−1〜1 + 1) ÷ 2・EQ (−12〜+12dB + 12) ÷ 24
  var AUTO_MAX_POINTS = 64;
  var AUTO_TARGETS = {
    "vol": { name: "音量", lo: 0, hi: 100, step: 1, unit: "" },
    "pan": { name: "パン", lo: -1, hi: 1, step: 0.01, unit: "" },
    "eq.low": { name: "EQ LOW", lo: -12, hi: 12, step: 0.5, unit: "dB" },
    "eq.mid": { name: "EQ MID", lo: -12, hi: 12, step: 0.5, unit: "dB" },
    "eq.high": { name: "EQ HIGH", lo: -12, hi: 12, step: 0.5, unit: "dB" }
  };
  var AUTO_ORDER = ["vol", "pan", "eq.low", "eq.mid", "eq.high"];
  function autoMaxTick() { return MAX_BARS * PPQ * 32; } // 曲の上限の外（拍子が変わっても 256 小節に収まる大きさ）。画面では曲の上限で調べる
  function autoNorm(target, v) { var d = AUTO_TARGETS[target]; v = Number(v); if (!d || typeof v !== "number" || !isFinite(v)) { return null; } v = Math.max(d.lo, Math.min(d.hi, Math.round(v / d.step) * d.step)); return Math.round((v - d.lo) / (d.hi - d.lo) * 1e6) / 1e6; }
  function autoReal(target, n) { var d = AUTO_TARGETS[target]; if (!d) { return 0; } var v = d.lo + Math.max(0, Math.min(1, Number(n) || 0)) * (d.hi - d.lo); return Math.round(Math.round(v / d.step) * d.step * 1000) / 1000; }
  // 読むとき: 知っている target は点を整える（数でない・範囲の外の tick は捨てる・tick の順・同じ tick は 1 つ・64 個まで）。知らない target・値は残す
  function autoClean(src) {
    if (!isArr(src)) { return []; }
    var out = [], seen = {}, i, j;
    for (i = 0; i < src.length; i++) {
      var a = src[i];
      if (!isObj(a)) { continue; }
      if (typeof a.target !== "string" || !AUTO_TARGETS[a.target]) { out.push(copy(a)); continue; }
      if (seen[a.target]) { continue; }
      seen[a.target] = true;
      var o = copy(a), byTick = {}, ps = isArr(a.points) ? a.points : [];
      o.on = a.on !== false;
      for (j = 0; j < ps.length; j++) {
        var q = ps[j];
        if (!isArr(q) || q.length < 2) { continue; }
        var tk = Number(q[0]), v = Number(q[1]);
        if (typeof q[0] !== "number" || typeof q[1] !== "number" || !isFinite(tk) || !isFinite(v) || tk < 0 || tk >= autoMaxTick()) { continue; }
        byTick[Math.round(tk)] = [Math.round(tk), Math.round(Math.max(0, Math.min(1, v)) * 1e6) / 1e6, q[2] === "step" ? "step" : "lin"];
      }
      o.points = Object.keys(byTick).map(Number).sort(function (x, y) { return x - y; }).slice(0, AUTO_MAX_POINTS).map(function (k) { return byTick[k]; });
      out.push(o);
    }
    return out;
  }
  function autoLane(t, target) { var l = t && isArr(t.auto) ? t.auto : [], i; for (i = 0; i < l.length; i++) { if (isObj(l[i]) && l[i].target === target) { return l[i]; } } return null; }
  // 音に効く（ON で点がある）
  function autoActive(t, target) { var a = autoLane(t, target); return !!(a && a.on !== false && isArr(a.points) && a.points.length); }
  function autoMoves(t, target) { var a = autoLane(t, target), i; if (!autoActive(t, target)) { return false; } for (i = 0; i < a.points.length; i++) { if (Math.abs(a.points[i][1] - 0.5) > 1e-9) { return true; } } return false; } // EQ: 0dB（0.5）でない点がある
  // tick での値（0〜1）。点の間は直線（"step" の点は、そこから次の点まで同じ値）
  function autoValueAt(a, tick) {
    var ps = a && isArr(a.points) ? a.points : [], i;
    if (!ps.length) { return null; }
    if (tick <= ps[0][0]) { return ps[0][1]; }
    for (i = 1; i < ps.length; i++) {
      if (tick < ps[i][0]) { var p0 = ps[i - 1], p1 = ps[i]; if (p1[2] === "step") { return p0[1]; } return p0[1] + (p1[1] - p0[1]) * (tick - p0[0]) / (p1[0] - p0[0]); }
    }
    return ps[ps.length - 1][1];
  }
  // (from, to] の予約の点: [tick, 0〜1, "lin"|"step"]。点の tick と、テンポの変わる tick（tick で直線 ＝ テンポごとに時間で直線）、to の点
  function autoAnchors(p, a, from, to) {
    var ps = a && isArr(a.points) ? a.points : [], ks = {}, i, out = [];
    for (i = 0; i < ps.length; i++) { if (ps[i][0] > from && ps[i][0] < to) { ks[ps[i][0]] = ps[i][2] === "step" ? "step" : "lin"; } }
    var tp = p && p.tempo && isArr(p.tempo.points) ? p.tempo.points : [];
    for (i = 0; i < tp.length; i++) { if (tp[i].tick > from && tp[i].tick < to && !ks[tp[i].tick]) { ks[tp[i].tick] = "lin"; } }
    ks[to] = ks[to] || "lin";
    Object.keys(ks).map(Number).sort(function (x, y) { return x - y; }).forEach(function (k) {
      if (ks[k] === "step") { var j; for (j = 0; j < ps.length; j++) { if (ps[j][0] === k) { break; } } out.push([k, j < ps.length ? ps[j][1] : autoValueAt(a, k), "step"]); return; }
      out.push([k, autoValueAt(a, k), "lin"]);
    });
    return out;
  }
  function autoHost(t, target) { if (!isArr(t.auto)) { t.auto = []; } var a = autoLane(t, target); if (!a) { a = { target: target, on: true, points: [] }; t.auto.push(a); } if (!isArr(a.points)) { a.points = []; } return a; }
  // 曲の位置（小節 1 から・拍 1 から・拍の中は 0〜）→ tick。曲の上限（256 小節）の外・数でないものは null
  function autoTickAt(p, bar, beat) {
    bar = Number(bar); beat = Number(beat);
    if (!isFinite(bar) || !isFinite(beat) || bar !== Math.floor(bar) || bar < 1 || bar > MAX_BARS || beat < 1) { return null; }
    var t0 = barToTick(p, bar - 1), m = meterAt(p, t0), bt = PPQ * 4 / m.den;
    if (beat >= m.num + 1) { return null; }
    var tk = Math.round(t0 + (beat - 1) * bt);
    return tk >= barToTick(p, MAX_BARS) ? null : tk;
  }
  // 点を足す（同じ tick があれば値を変える）→ { ok, why, replaced, tick, value }
  function autoSet(p, t, target, tick, real) {
    if (!t || !AUTO_TARGETS[target]) { return { ok: false, why: "オートメーションできない値です" }; }
    tick = Number(tick);
    if (typeof tick !== "number" || !isFinite(tick) || tick < 0 || tick !== Math.round(tick) || tick >= barToTick(p, MAX_BARS)) { return { ok: false, why: "位置がおかしいです（1〜" + MAX_BARS + " 小節）" }; }
    var n = autoNorm(target, real);
    if (n === null) { return { ok: false, why: "値が数ではありません" }; }
    var a = autoHost(t, target), i;
    for (i = 0; i < a.points.length; i++) { if (a.points[i][0] === tick) { a.points[i] = [tick, n, "lin"]; return { ok: true, replaced: true, tick: tick, value: autoReal(target, n) }; } }
    if (a.points.length >= AUTO_MAX_POINTS) { return { ok: false, why: "点は " + AUTO_MAX_POINTS + " 個までです" }; }
    a.points.push([tick, n, "lin"]);
    a.points.sort(function (x, y) { return x[0] - y[0]; });
    return { ok: true, replaced: false, tick: tick, value: autoReal(target, n) };
  }
  function autoDel(t, target, tick) { var a = autoLane(t, target), i; if (!a || !isArr(a.points)) { return false; } for (i = 0; i < a.points.length; i++) { if (a.points[i][0] === tick) { a.points.splice(i, 1); return true; } } return false; }
  function autoOn(t, target, on) { if (!t || !AUTO_TARGETS[target]) { return false; } autoHost(t, target).on = !!on; return true; }
  function autoClear(t, target) { var a = autoLane(t, target); if (!a) { return false; } a.points = []; return true; }
  // 画面の値（いまの位置）: オートメーションが効いていれば その値、でなければ ふだんの値
  function autoStatic(t, target) { if (target === "vol") { return num(t.vol, 80, 0, 100); } if (target === "pan") { return num(t.pan, 0, -1, 1); } var f = fxOf(t); return f.eq[target.split(".")[1]]; }
  function autoNow(t, target, tick) { return autoActive(t, target) ? autoReal(target, autoValueAt(autoLane(t, target), tick)) : autoStatic(t, target); }

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
        var segs = audioSegs(p, c), q; // 9A-16: コンピングなら 2 つ（ないクリップは audioSpan の 1 つ ＝ いままでと同じ）
        for (q = 0; q < segs.length; q++) {
          var s = segs[q], b = Math.max(0, s.p0), at = null;
          if (!s.ok) { continue; }
          if (b >= fs && b < ts) { at = b; } else if (fresh && b < fs && s.p1 > fs) { at = fs; }
          if (at === null) { continue; }
          var tk = Math.round(secToTick(p, at) * 1000) / 1000;
          var ev = { tick: tk, sec: at, src: s.tin + (at - s.p0), p0: s.p0, endSec: s.p1, fadeIn: s.fadeIn, fadeOut: s.fadeOut, gain: s.gain, skip: at > b ? Math.round((tk - secToTick(p, b)) * 1000) / 1000 : 0,
            start: c.start, end: c.start + c.len, asset: s.comp ? s.id : c.asset, srcOffset: s.so, track: t.id, clip: c.id, ti: i };
          if (s.comp) { ev.comp = true; ev.take = s.take; ev.xIn = !!s.xIn && at === b; ev.xOut = !!s.xOut; }
          out.push(ev);
        }
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
        var len = Math.max(audioClipLen(p, c.start, s.tout - s.so), compNeedLen(p, c)), t = f.track, nx = Infinity, j; // 9A-16: コンピングなら長いほうのテイクに合わせる
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
    if (c.hasOwnProperty("comp") && !compOf(p, c)) { delete c.comp; } // 9A-16: テイクが見つからない古い組み合わせ（v2.48 以前で外した）は、同じ ID の新しいテイクとまちがえないように消す
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
    if (isObj(f.clip.comp) && compRaw(f.clip).secs.indexOf(id) >= 0) { return { ok: false, why: "組み合わせで使っているテイクは外せません（🎧 で単一テイクに戻してから）" }; } // 9A-16
    for (i = 0; i < f.clip.takes.length; i++) { if (f.clip.takes[i].id === id) { f.clip.takes.splice(i, 1); return { ok: true }; } }
    return { ok: false, why: "テイクが見つかりません" };
  }
  // ---------- §341 9A-16: コンピング Lite（AudioClip の comp ＝ { a: 前半のテイク, b: 後半のテイク, at: クリップの頭からの秒 }。GAME_DESIGN §341「9A-16」）----------
  var COMP_XF = 0.008, COMP_MIN = 0.05;
  function cleanComp(c, o) {
    if (!c.hasOwnProperty("comp")) { return; }
    var cp = c.comp, at = isObj(cp) ? Number(cp.at) : NaN;
    if (!isObj(cp) || typeof cp.a !== "string" || typeof cp.b !== "string" || !/^[A-H]$/.test(cp.a) || !/^[A-H]$/.test(cp.b) || cp.a === cp.b || !isFinite(at) || at < 0) { delete o.comp; return; }
    o.comp = copy(cp) || {}; o.comp.at = r4(Math.min(3600, at)); // 知らない項目は残す
  }
  function takeById(c, id) { var i; for (i = 0; c && isArr(c.takes) && i < c.takes.length; i++) { if (c.takes[i] && c.takes[i].id === id) { return c.takes[i]; } } return null; }
  // そのテイクだけを鳴らすときのクリップ（いま使っているテイクはクリップそのもの・ほかは takes[].edit の値）
  function takeView(p, c, id) {
    if (id === activeTakeId(c)) { return c; }
    var t = takeById(c, id), e, k;
    if (!t) { return null; }
    var v = { type: "audio", id: c.id, asset: t.asset, start: c.start, len: c.len, srcOffset: c.srcOffset, gain: c.gain, fadeIn: 0, fadeOut: 0 };
    e = cleanEdit(t.edit); for (k in e) { if (e.hasOwnProperty(k)) { v[k] = e[k]; } }
    return v;
  }
  // 9A-17: 区間の生の列（データのまま・テイクの有無は見ない）→ { secs: [テイク], cuts: [秒], bad }。cuts の読めない所から後ろは使わない（データは残す）
  var COMP_GAP = 0.02, COMP_MAX_SECS = 4;
  function compRaw(c) {
    var cp = c && c.comp, out = { secs: [], cuts: [], bad: false }, i, x;
    if (!isObj(cp)) { return out; }
    out.secs = [cp.a, cp.b]; out.cuts = [Number(cp.at)];
    if (cp.hasOwnProperty("cuts")) {
      if (!isArr(cp.cuts)) { out.bad = true; return out; }
      for (i = 0; i < cp.cuts.length; i++) {
        x = cp.cuts[i];
        if (out.secs.length >= COMP_MAX_SECS || !isObj(x) || typeof x.take !== "string" || !/^[A-H]$/.test(x.take) || !isFinite(Number(x.at))) { out.bad = true; break; }
        out.secs.push(x.take); out.cuts.push(Number(x.at));
      }
    }
    return out;
  }
  function takeOk(p, c, id) { var v = takeById(c, id) ? takeView(p, c, id) : null, a = v && findAsset(p, v.asset); return !!(a && Number(a.sec) > 0); }
  // 使えるコンピング → { a, b, at, raw, T, C0, box, secs（区間のテイク）, ats（切りかえ・クリップの頭からの秒）, Ts（曲の秒）, n, bad（鳴らさない区間がある）} / null
  // 区間 1・2（v2.49 の a・b・at）がそろわなければ null。3 区間目からは、読めない・テイクがない・順番がおかしい・箱の外の所から後ろを使わない。となりの同じテイクはまとめる
  function compOf(p, c) {
    if (!c || c.type !== "audio" || !isObj(c.comp) || !isArr(c.takes) || c.takes.length < 2) { return null; }
    var a = c.comp.a, b = c.comp.b, r = compRaw(c), i;
    if (a === b || !takeOk(p, c, a) || !takeOk(p, c, b)) { return null; }
    var C0 = tickToSec(p, c.start), box = tickToSec(p, c.start + c.len) - C0, raw = Number(c.comp.at);
    if (!isFinite(raw)) { return null; }
    var hiAt = Math.max(COMP_MIN, box - COMP_MIN), at = Math.max(COMP_MIN, Math.min(hiAt, raw)), secs = [a, b], ats = [at], bad = r.bad;
    for (i = 2; i < r.secs.length; i++) {
      var t = r.cuts[i - 1], prev = ats[ats.length - 1];
      if (!takeOk(p, c, r.secs[i]) || !(t >= prev + COMP_GAP - 1e-9) || t > hiAt + 1e-9) { bad = true; break; }
      if (r.secs[i] === secs[secs.length - 1]) { continue; } // 同じテイクが続く: 継ぎ目を作らない
      secs.push(r.secs[i]); ats.push(t);
    }
    return { a: a, b: b, at: at, raw: raw, T: C0 + at, C0: C0, box: box, secs: secs, ats: ats, Ts: ats.map(function (x) { return C0 + x; }), n: secs.length, bad: bad };
  }
  // 鳴る区間（曲の秒）の列。コンピングでないクリップは audioSpan の 1 つ（いままでと同じ）。
  // コンピング: 区間 k ＝ テイク secs[k] を、前の切りかえ T−h から（2h で 0→1）次の切りかえ T＋h まで（2h で 1→0）。h ＝ その切りかえのクロスフェードの半分。2 区間は v2.49 と同じ計算
  function audioSegs(p, c) {
    var cp = compOf(p, c);
    if (!cp) { return [audioSpan(p, c)]; }
    var n = cp.n, T = cp.Ts, sp = [], ids = [], xf = [], out = [], k;
    for (k = 0; k < n; k++) { var v = takeView(p, c, cp.secs[k]); ids.push(v.asset); sp.push(audioSpan(p, v)); }
    for (k = 0; k < n - 1; k++) {
      var left = k === 0 ? 2 * Math.max(0, T[0] - Math.max(0, sp[0].p0)) : T[k] - T[k - 1];
      var right = k === n - 2 ? 2 * Math.max(0, sp[n - 1].p1 - T[k]) : T[k + 1] - T[k];
      xf.push(Math.max(0, Math.min(COMP_XF, left, right)));
    }
    for (k = 0; k < n; k++) {
      var s = sp[k], from = k > 0 ? T[k - 1] : -Infinity, to = k < n - 1 ? T[k] : Infinity, p0, tin, fi, xIn = false, p1, fo, xOut = false;
      if (!s.ok || s.p0 >= to - 1e-6 || s.p1 <= from + 1e-6) { continue; } // この区間で鳴らない
      p0 = s.p0; tin = s.tin; fi = s.fadeIn; p1 = s.p1; fo = s.fadeOut;
      if (k > 0) { var s0 = from - xf[k - 1] / 2; if (s.p0 < s0 - 1e-9) { p0 = s0; tin = s.tin + (s0 - s.p0); fi = xf[k - 1]; xIn = xf[k - 1] > 0; } } // でなければ自分の頭（自分のフェード）
      if (k < n - 1) { var e0 = to + xf[k] / 2; if (s.p1 > e0 + 1e-9) { p1 = e0; fo = xf[k]; xOut = xf[k] > 0; } } // でなければ自分の終わり
      out.push({ comp: true, id: ids[k], take: cp.secs[k], sec: k, asset: s.asset, dur: s.dur, so: s.so, A: s.A, tin: tin, p0: p0, p1: p1, fadeIn: fi, fadeOut: fo, gain: s.gain, xIn: xIn, xOut: xOut,
        xf: k < n - 1 ? xf[k] : xf[k - 1], T: T[0], from: from, to: to, ok: p1 > Math.max(0, p0) + 1e-4 });
    }
    return out;
  }
  // 組み合わせの全部のテイクのうち長いものに合わせた箱の長さ（tick）・コンピングでなければ 0
  function compNeedLen(p, c) {
    if (!c || !isObj(c.comp)) { return 0; }
    var l = compRaw(c).secs, n = 0, i, seen = {};
    for (i = 0; i < l.length; i++) { if (seen[l[i]] || !takeById(c, l[i])) { continue; } seen[l[i]] = 1; var s = audioSpan(p, takeView(p, c, l[i])); if (isFinite(s.full)) { n = Math.max(n, audioClipLen(p, c.start, Math.max(0, s.full - tickToSec(p, c.start)))); } }
    return n;
  }
  // はじめの切りかえ位置: 2 つのテイクが両方鳴る所のまん中（なければ箱のまん中）・10ms に丸める
  function compDefaultAt(p, c, a, b) {
    var C0 = tickToSec(p, c.start), box = tickToSec(p, c.start + c.len) - C0, va = takeView(p, c, a), vb = takeView(p, c, b);
    var sa = va ? audioSpan(p, va) : null, sb = vb ? audioSpan(p, vb) : null, lo = 0, hi = box;
    if (sa && sb) { lo = Math.max(sa.p0, sb.p0) - C0; hi = Math.min(sa.p1, sb.p1) - C0; }
    var m = hi > lo + 2 * COMP_MIN ? (lo + hi) / 2 : box / 2;
    return Math.round(Math.max(COMP_MIN, Math.min(Math.max(COMP_MIN, box - COMP_MIN), m)) * 100) / 100;
  }
  // 区間の列を整える（となりの同じテイクをまとめる）→ { secs, cuts }
  function compMerge(secs, cuts) {
    var s = [secs[0]], t = [], i;
    for (i = 1; i < secs.length; i++) { if (secs[i] === s[s.length - 1]) { continue; } s.push(secs[i]); t.push(Number(cuts[i - 1])); }
    return { secs: s, cuts: t };
  }
  // 組み合わせを作る・変える。o: { secs: [テイク…], cuts: [秒…] }（全部を入れかえる・9A-17）／ { a, b, at, swap }（1 本目だけ・9A-16）／ { off }
  // 同じテイクのとなりはまとめる。箱は全部のテイクの長いものに合わせて広げる（縮めない・次のクリップと重ねない）。だめなら何も変えない
  function setComp(p, clipId, o) {
    var f = findClip(p, clipId);
    if (!f || f.clip.type !== "audio") { return { ok: false, why: "オーディオのクリップが見つかりません" }; }
    var c = f.clip, cur = isObj(c.comp) ? c.comp : null, j, before = c.hasOwnProperty("comp") ? copy(c.comp) : undefined, lenB = c.len;
    o = o || {};
    if (o.off) { if (!c.hasOwnProperty("comp")) { return { ok: true, same: true, clip: c }; } delete c.comp; return { ok: true, clip: c }; }
    if (!isArr(c.takes) || c.takes.length < 2) { return { ok: false, why: "テイクが 2 つ以上あるときだけ組み合わせられます" }; }
    function undoFail(why) { if (before === undefined) { delete c.comp; } else { c.comp = before; } c.len = lenB; return { ok: false, why: why }; }
    var nc = copy(cur) || {}, secs, cuts;
    if (o.secs) {
      if (!isArr(o.secs) || !isArr(o.cuts) || o.cuts.length !== o.secs.length - 1) { return { ok: false, why: "区間の形がおかしいです" }; }
      if (o.secs.length > COMP_MAX_SECS) { return { ok: false, why: "区間は " + COMP_MAX_SECS + " つまでです" }; }
      var m = compMerge(o.secs, o.cuts); secs = m.secs; cuts = m.cuts;
      if (secs.length < 2) { return { ok: false, why: "ちがうテイクを 2 つ以上使ってください（同じテイクだけなら単一テイクと同じです）" }; }
    } else {
      var act = activeTakeId(c), a = cur && takeById(c, cur.a) ? cur.a : act, b = cur && takeById(c, cur.b) ? cur.b : "";
      if (!b || b === a) { b = ""; for (j = 0; j < c.takes.length; j++) { if (c.takes[j].id !== a) { b = c.takes[j].id; break; } } }
      if (o.a !== undefined) { if (o.a === b) { b = a; } a = o.a; }
      if (o.b !== undefined) { if (o.b === a) { a = b; } b = o.b; }
      if (o.swap) { var tmp = a; a = b; b = tmp; }
      var at = o.at !== undefined ? Number(o.at) : (cur && isFinite(Number(cur.at)) ? Number(cur.at) : compDefaultAt(p, c, a, b));
      if (!isFinite(at)) { return { ok: false, why: "切りかえの位置が数ではありません" }; }
      secs = [a, b]; cuts = [at];
    }
    for (j = 0; j < secs.length; j++) {
      if (typeof secs[j] !== "string" || !takeById(c, secs[j])) { return { ok: false, why: "テイクが見つかりません" }; }
      if (!takeOk(p, c, secs[j])) { return { ok: false, why: "テイク " + secs[j] + " の素材がありません" }; }
    }
    if (secs[0] === secs[1]) { return { ok: false, why: "テイクが見つかりません" }; }
    for (j = 0; j < cuts.length; j++) { if (!isFinite(Number(cuts[j]))) { return { ok: false, why: "切りかえの位置が数ではありません" }; } }
    nc.a = secs[0]; nc.b = secs[1]; nc.at = 0;
    if (o.secs) { // 9A-17: 同じ位置の古い要素の知らない項目は引きつぐ
      var oldCuts = cur && isArr(cur.cuts) ? cur.cuts : [];
      if (secs.length > 2) { nc.cuts = []; for (j = 2; j < secs.length; j++) { var ci = isObj(oldCuts[j - 2]) ? copy(oldCuts[j - 2]) : {}; ci.at = 0; ci.take = secs[j]; nc.cuts.push(ci); } } else { delete nc.cuts; }
    }
    c.comp = nc;
    var need = compNeedLen(p, c), nx = Infinity, t = f.track;
    for (j = 0; j < t.clips.length; j++) { if (t.clips[j] !== c && t.clips[j].start >= c.start + 1 && t.clips[j].start < nx) { nx = t.clips[j].start; } }
    if (need > c.len) { c.len = Math.max(c.len, Math.min(need, Math.floor((nx - c.start) / barTicks(p)) * barTicks(p), CLIP_MAX_BARS * barTicks(p), MAX_BARS * barTicks(p) - c.start)); }
    var box = tickToSec(p, c.start + c.len) - tickToSec(p, c.start), hiAt = Math.max(COMP_MIN, box - COMP_MIN);
    nc.at = r4(Math.max(COMP_MIN, Math.min(hiAt, Number(cuts[0]))));
    if (o.secs) {
      var prev = nc.at;
      for (j = 1; j < cuts.length; j++) {
        var v = r4(Number(cuts[j]));
        if (v < prev + COMP_GAP - 1e-9) { return undoFail("切りかえ " + j + " と " + (j + 1) + " が近すぎます（" + Math.round(COMP_GAP * 1000) + "ms 以上はなしてください）"); }
        if (v > hiAt + 1e-9) { return undoFail("切りかえ " + (j + 1) + " がクリップの外です"); }
        nc.cuts[j - 1].at = v; prev = v;
      }
    }
    return { ok: true, clip: c, comp: compOf(p, c) };
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

  // ---------- §342 9B-1: 曲の構成（セクション ＝ markers の { kind: "section", id, tick, len, name, color }・目印だけ）----------
  var SECTION_NAMES = ["イントロ", "Aメロ", "Bメロ", "サビ", "間奏", "アウトロ"], SECTION_COLORS = ["red", "orange", "yellow", "green", "teal", "blue", "purple", "pink"];
  var MAX_SECTIONS = 32, MAX_CLIPS_PER_TRACK = 256, REPEAT_MAX = 16;
  function isSection(m) { return isObj(m) && m.kind === "section" && typeof m.id === "string" && isFinite(Number(m.tick)) && Number(m.tick) >= 0 && isFinite(Number(m.len)) && Number(m.len) > 0; }
  // セクションの一覧（はじまりの順・読めないものは数えない・データは変えない）
  function sectionsOf(p) {
    var l = p && isArr(p.markers) ? p.markers : [], out = [], i;
    for (i = 0; i < l.length; i++) { if (isSection(l[i])) { out.push(l[i]); } }
    out.sort(function (a, b) { return a.tick - b.tick; });
    return out;
  }
  function findSection(p, id) { var l = sectionsOf(p), i; for (i = 0; i < l.length; i++) { if (l[i].id === id) { return l[i]; } } return null; }
  function nextSectionId(p) { var used = {}, l = p && isArr(p.markers) ? p.markers : [], i, n = 1; for (i = 0; i < l.length; i++) { if (isObj(l[i]) && l[i].id) { used[l[i].id] = true; } } while (used["s" + n]) { n++; } return "s" + n; }
  function sectionName(v) { var s = String(v === undefined || v === null ? "" : v).replace(/[\u0000-\u001f]/g, "").replace(/^\s+|\s+$/g, ""); return s.substring(0, 20); }
  // [tick, tick＋len) と重なるセクション（except は数えない）
  function sectionOverlap(p, tick, len, except) { var l = sectionsOf(p), i; for (i = 0; i < l.length; i++) { var s = l[i]; if (s !== except && s.id !== except && tick < s.tick + s.len && s.tick < tick + len) { return s; } } return null; }
  // 小節（1 から）・小節の数 → tick。はみ出し・重なりを調べる → { ok, why, tick, len }
  function sectionRange(p, bar, bars, except) {
    var bt = barTicks(p), b = Math.round(Number(bar)), n = Math.round(Number(bars));
    if (!isFinite(b) || b < 1) { return { ok: false, why: "はじまりの小節は 1 から" }; }
    if (!isFinite(n) || n < 1) { return { ok: false, why: "長さは 1 小節から" }; }
    var tick = (b - 1) * bt, len = n * bt;
    if (tick + len > MAX_BARS * bt) { return { ok: false, why: "曲の長さ（" + MAX_BARS + " 小節）をこえます" }; }
    var o = sectionOverlap(p, tick, len, except);
    if (o) { return { ok: false, why: "「" + o.name + "」（" + (Math.round(o.tick / bt) + 1) + " 小節目から）と重なります" }; }
    return { ok: true, tick: tick, len: len };
  }
  function addSection(p, o) {
    o = o || {};
    if (sectionsOf(p).length >= MAX_SECTIONS) { return { ok: false, why: "セクションは " + MAX_SECTIONS + " 個までです" }; }
    var name = sectionName(o.name);
    if (!name) { return { ok: false, why: "名前を入れてください" }; }
    var r = sectionRange(p, o.bar, o.bars, null);
    if (!r.ok) { return r; }
    if (!isArr(p.markers)) { p.markers = []; }
    var color = SECTION_COLORS.indexOf(o.color) >= 0 ? o.color : SECTION_COLORS[sectionsOf(p).length % SECTION_COLORS.length];
    var s = { kind: "section", id: nextSectionId(p), tick: r.tick, len: r.len, name: name, color: color };
    p.markers.push(s);
    return { ok: true, section: s };
  }
  // 変える（o: { name, bar, bars, color }・省いた値はそのまま）。知らない項目は残す
  function updateSection(p, id, o) {
    var s = findSection(p, id), bt = barTicks(p);
    if (!s) { return { ok: false, why: "セクションが見つかりません" }; }
    o = o || {};
    var name = o.name !== undefined ? sectionName(o.name) : s.name;
    if (!name) { return { ok: false, why: "名前を入れてください" }; }
    var r = sectionRange(p, o.bar !== undefined ? o.bar : Math.round(s.tick / bt) + 1, o.bars !== undefined ? o.bars : Math.round(s.len / bt), s);
    if (!r.ok) { return r; }
    s.name = name; s.tick = r.tick; s.len = r.len;
    if (o.color !== undefined && SECTION_COLORS.indexOf(o.color) >= 0) { s.color = o.color; }
    return { ok: true, section: s };
  }
  function deleteSection(p, id) {
    var l = p && isArr(p.markers) ? p.markers : [], i;
    for (i = 0; i < l.length; i++) { if (isSection(l[i]) && l[i].id === id) { l.splice(i, 1); return { ok: true }; } }
    return { ok: false, why: "セクションが見つかりません" };
  }
  // ---------- §342 9B-1: クリップの繰り返し・セクションの複製（先に全部を調べる・だめなら 1 つも足さない）----------
  // クリップの写し（深いコピー・新しい ID・はじまりだけ変える。オーディオの素材は同じ参照）
  function cloneClipAt(p, c, start, usedIds) {
    var d = copy(c), n = 1;
    while (usedIds["c" + n]) { n++; }
    d.id = "c" + n; usedIds[d.id] = true;
    d.start = start;
    return d;
  }
  function usedIdMap(p) { var used = {}, i, j; for (i = 0; i < p.tracks.length; i++) { used[p.tracks[i].id] = true; for (j = 0; j < p.tracks[i].clips.length; j++) { used[p.tracks[i].clips[j].id] = true; } } return used; }
  // 並べる場所（コピー先の tick から、元の長さで count 個）→ { ok, why, starts }
  function repeatPlan(p, clipId, count, destTick) {
    var f = findClip(p, clipId), bt = barTicks(p), i;
    if (!f) { return { ok: false, why: "クリップが見つかりません" }; }
    var c = f.clip, n = Math.round(Number(count));
    if (!isFinite(n) || n < 1 || n > REPEAT_MAX) { return { ok: false, why: "回数は 1〜" + REPEAT_MAX + " 回です" }; }
    var d0 = destTick === undefined || destTick === null ? c.start + c.len : Number(destTick);
    if (!isFinite(d0) || d0 < 0) { return { ok: false, why: "コピー先の小節がおかしいです" }; }
    d0 = Math.round(d0 / bt) * bt;
    if (f.track.clips.length + n > MAX_CLIPS_PER_TRACK) { return { ok: false, why: "1 つのトラックのクリップは " + MAX_CLIPS_PER_TRACK + " 個までです" }; }
    var starts = [];
    for (i = 0; i < n; i++) {
      var s = d0 + i * c.len;
      if (s + c.len > MAX_BARS * bt) { return { ok: false, why: "曲の長さ（" + MAX_BARS + " 小節）をこえます（" + (i + 1) + " 個目）" }; }
      var o = overlapClip(f.track, s, c.len, null);
      if (o) { return { ok: false, why: (i + 1) + " 個目（" + (Math.floor(s / bt) + 1) + " 小節目）が「" + ((o.ext && o.ext.name) || "クリップ") + "」（" + (Math.floor(o.start / bt) + 1) + " 小節目から）と重なります", at: s, clash: o.id }; }
      starts.push(s);
    }
    return { ok: true, starts: starts, track: f.track, clip: c, from: d0 };
  }
  function repeatClip(p, clipId, count, destTick) {
    var r = repeatPlan(p, clipId, count, destTick), i, made = [];
    if (!r.ok) { return r; }
    var used = usedIdMap(p);
    for (i = 0; i < r.starts.length; i++) { var d = cloneClipAt(p, r.clip, r.starts[i], used); r.track.clips.push(d); made.push(d); }
    sortClips(r.track);
    return { ok: true, clips: made, from: r.from };
  }
  // セクションの中に全部入っているクリップ（全部のトラック）と、またいでいるクリップの数
  function clipsInSection(p, s) {
    var inside = [], cross = 0, i, j, a = s.tick, b = s.tick + s.len;
    for (i = 0; i < p.tracks.length; i++) {
      for (j = 0; j < p.tracks[i].clips.length; j++) {
        var c = p.tracks[i].clips[j], e = c.start + c.len;
        if (c.start >= a && e <= b) { inside.push({ track: p.tracks[i], clip: c }); }
        else if (c.start < b && e > a) { cross++; }
      }
    }
    return { inside: inside, cross: cross };
  }
  // セクションの複製の計画（コピー先の小節は 1 から）→ { ok, why, items, delta, cross, newSection }
  function sectionCopyPlan(p, id, destBar) {
    var s = findSection(p, id), bt = barTicks(p), i;
    if (!s) { return { ok: false, why: "セクションが見つかりません" }; }
    var b = Math.round(Number(destBar));
    if (!isFinite(b) || b < 1) { return { ok: false, why: "コピー先の小節は 1 から" }; }
    var dest = (b - 1) * bt, delta = dest - s.tick;
    if (delta === 0) { return { ok: false, why: "同じ場所にはコピーできません" }; }
    if (dest + s.len > MAX_BARS * bt) { return { ok: false, why: "曲の長さ（" + MAX_BARS + " 小節）をこえます" }; }
    var cs = clipsInSection(p, s), count = {};
    if (!cs.inside.length) { return { ok: false, why: "このセクションの中に、全部入っているクリップがありません" + (cs.cross ? "（境目をまたぐクリップ " + cs.cross + " 個は対象外）" : ""), cross: cs.cross }; }
    for (i = 0; i < cs.inside.length; i++) {
      var it = cs.inside[i], ns = it.clip.start + delta, o = overlapClip(it.track, ns, it.clip.len, null);
      count[it.track.id] = (count[it.track.id] || 0) + 1;
      if (o) { return { ok: false, why: "「" + it.track.name + "」の " + (Math.floor(ns / bt) + 1) + " 小節目に、もうクリップ（「" + ((o.ext && o.ext.name) || "クリップ") + "」）があります。上書きはしません", cross: cs.cross, clashTrack: it.track.id }; }
      if (it.track.clips.length + count[it.track.id] > MAX_CLIPS_PER_TRACK) { return { ok: false, why: "「" + it.track.name + "」のクリップが " + MAX_CLIPS_PER_TRACK + " 個をこえます" }; }
    }
    var freeSec = !sectionOverlap(p, dest, s.len, null) && sectionsOf(p).length < MAX_SECTIONS;
    return { ok: true, items: cs.inside, delta: delta, dest: dest, cross: cs.cross, newSection: freeSec, section: s };
  }
  function copySection(p, id, destBar) {
    var r = sectionCopyPlan(p, id, destBar), i, made = [], touched = [];
    if (!r.ok) { return r; }
    var used = usedIdMap(p);
    for (i = 0; i < r.items.length; i++) { var it = r.items[i], d = cloneClipAt(p, it.clip, it.clip.start + r.delta, used); it.track.clips.push(d); made.push(d); if (touched.indexOf(it.track) < 0) { touched.push(it.track); } }
    for (i = 0; i < touched.length; i++) { sortClips(touched[i]); }
    var ns = null;
    if (r.newSection) {
      var base = r.section.name, k = 2, names = {}, l = sectionsOf(p), j;
      for (j = 0; j < l.length; j++) { names[l[j].name] = true; }
      var nm = sectionName(base.replace(/\s\d+$/, "") + " " + k); while (names[nm] && k < 99) { k++; nm = sectionName(base.replace(/\s\d+$/, "") + " " + k); }
      ns = { kind: "section", id: nextSectionId(p), tick: r.dest, len: r.section.len, name: nm, color: r.section.color };
      if (!isArr(p.markers)) { p.markers = []; }
      p.markers.push(ns);
    }
    return { ok: true, clips: made, cross: r.cross, section: ns, dest: r.dest };
  }

  // ---------- §342 9B-2: ゲームセンターからの受け取り箱（localStorage に 1 つだけ・同じブラウザの中だけ）----------
  var INBOX_PATCH_MAX = 2048; // 9B-7
  var INBOX_KEY = "ultimateGorillaDawInboxV1", INBOX_TYPE = "ultimate-gorilla-daw-inbox", INBOX_DAYS = 7, INBOX_MAX_BYTES = 512 * 1024, INBOX_MAX_PARTS = 8;
  var INBOX_FROM = { ukulele: "&#x1F3B8; ゴリラウクレレ（コード・シーケンサー）", piano: "&#x1F3B9; ゴリラピアノ（テイク）", drum: "&#x1F941; ゴリラドラム", bass: "&#x1F3B8; ゴリラベース（テイク）", guitar: "&#x1F3B8; ゴリラギター（テイク）", strings: "&#x1F3BB; ゴリラストリングス（テイク）", horn: "&#x1F3BA; ゴリラホーン（テイク）", synth: "&#x1F39B;&#xFE0F; ゴリラシンセ（テイク）" }; // 9B-7: シンセ・9B-3: ピアノ・ドラム・9B-5: ベース・ギター・9B-6: ストリングス・ホーン
  var INBOX_PRESETS = ["pluck", "bass", "pad", "spad", "lead", "soft", "brass", "organ", "bell", "chip", "drum"]; // "drum" ＝ ドラムのトラック（9B-3）
  // §342 9B-3: ゴリラドラムの番号 → 名前（DAW の 16 ステップの行。5 つのほかは、その音があるクリップだけ）。25・26 は音のない操作（取りこまない）
  var DRUM_NAMES = { 36: "キック", 38: "スネア", 39: "クラップ", 42: "ハイハット（閉）", 46: "ハイハット（開）", 37: "リム", 47: "タム", 49: "クラッシュ", 51: "ライド", 48: "タム（高）", 45: "タム（中）", 43: "フロアタム",
    44: "ペダルHH", 23: "ハーフオープン", 21: "フットスプラッシュ", 24: "リムショット", 22: "フラム", 53: "ライドのベル" };
  var DRUM_SILENT = { 26: "チョーク", 25: "キックをおさえる" };
  function drumName(m) { return DRUM_NAMES.hasOwnProperty(m) ? DRUM_NAMES[m] : (GM_DRUM_NAMES.hasOwnProperty(m) ? GM_DRUM_NAMES[m] : null); } // 9B-4: GM の 35〜81 の名前も
  function inboxId(now) { return "g" + (typeof now === "number" ? now : Date.now()).toString(36) + Math.floor(Math.random() * 1679616).toString(36); }
  // 受け取ったものを全部調べなおす → { ok, why, box }（値はそろえる・おかしいものは取りこまない）
  function inboxClean(o, now) {
    now = typeof now === "number" ? now : Date.now();
    if (!isObj(o) || o.type !== INBOX_TYPE || o.v !== 1) { return { ok: false, why: "受け取ったデータの形がちがいます" }; }
    if (!INBOX_FROM.hasOwnProperty(o.from)) { return { ok: false, why: "知らないゲームからのデータです" }; }
    if (typeof o.id !== "string" || !/^[a-z0-9]{4,40}$/.test(o.id)) { return { ok: false, why: "受け取ったデータの ID がおかしいです" }; }
    if (Number(o.ppq) !== PPQ) { return { ok: false, why: "時間の単位（PPQ）がちがいます" }; }
    var made = Number(o.made);
    if (!isFinite(made) || made > now + 86400000) { return { ok: false, why: "送った日時がおかしいです" }; }
    if (now - made > INBOX_DAYS * 86400000) { return { ok: false, why: "送ってから " + INBOX_DAYS + " 日たったので、使えません（もう一度送ってください）", expired: true }; }
    var bpm = Number(o.bpm), meter = Number(o.meter), len = Number(o.len);
    if (!isFinite(bpm) || bpm < 20 || bpm > 400) { return { ok: false, why: "BPM がおかしいです" }; }
    if (meter !== 3 && meter !== 4) { return { ok: false, why: "拍子がおかしいです" }; }
    if (!isFinite(len) || len < 1 || len > MAX_BARS * PPQ * 4) { return { ok: false, why: "長さがおかしいです" }; }
    if (!isArr(o.parts) || !o.parts.length || o.parts.length > INBOX_MAX_PARTS) { return { ok: false, why: "パートの数がおかしいです" }; }
    var parts = [], keys = {}, i, j;
    for (i = 0; i < o.parts.length; i++) {
      var q = o.parts[i];
      if (!isObj(q) || typeof q.key !== "string" || !/^[a-z0-9]{1,12}$/.test(q.key) || keys[q.key]) { return { ok: false, why: "パートの名前がおかしいです" }; }
      var qDrum = q.preset === "drum"; // 9B-3: ドラムの音符は長さ 0（DAW のドラムと同じ）・番号は表にあるものだけ
      if (!isArr(q.notes) || !q.notes.length || q.notes.length > MAX_NOTES) { return { ok: false, why: "パート「" + str(q.name, q.key, 20) + "」の音符の数がおかしいです（1〜" + MAX_NOTES + "）" }; }
      var ns = [];
      for (j = 0; j < q.notes.length; j++) {
        var n = q.notes[j];
        if (!isArr(n) || n.length < 4) { return { ok: false, why: "音符の形がおかしいです" }; }
        var t = Number(n[0]), d = Number(n[1]), m = Number(n[2]), v = Number(n[3]);
        if (!isFinite(t) || t < 0 || t >= len + PPQ * 4 || !isFinite(d) || d < (qDrum ? 0 : 1) || d > PPQ * 4 * CLIP_MAX_BARS || !isFinite(m) || m < 0 || m > 127 || Math.round(m) !== m || !isFinite(v) || v < 0 || v > 1) { return { ok: false, why: "音符の値がおかしいです（" + (j + 1) + " 個目）" }; }
        if (qDrum && !DRUM_NAMES.hasOwnProperty(m)) { return { ok: false, why: "DAW のドラムにない番号（" + m + "）があります（" + (j + 1) + " 個目）" }; }
        ns.push([Math.round(t), Math.round(d), m, Math.round(v * 1000) / 1000]);
      }
      ns.sort(function (a, b) { return a[0] - b[0] || a[2] - b[2]; });
      keys[q.key] = true;
      var pt0 = { key: q.key, name: str(q.name, q.key, 20).replace(/[<>&"]/g, "") || q.key, preset: INBOX_PRESETS.indexOf(q.preset) >= 0 ? q.preset : "lead", notes: ns };
      // 9B-7: 音色のパラメーター（なくてもよい）。2 KB まで・公開版の UGSynth.patchClean で値をそろえる（UGSynth が無ければ使わない）
      if (q.patch !== undefined && q.patch !== null && !qDrum) {
        var pj = ""; try { pj = JSON.stringify(q.patch); } catch (ep) { pj = ""; }
        if (!isObj(q.patch) || !pj || pj.length > INBOX_PATCH_MAX) { return { ok: false, why: "パート「" + pt0.name + "」の音色のデータがおかしいです（" + INBOX_PATCH_MAX + " バイトまでのオブジェクト）" }; }
        var SY = window.UGSynth, pc = null;
        try { pc = SY && SY.patchClean ? SY.patchClean(q.patch) : null; } catch (ec) { pc = null; }
        if (pc) { pt0.patch = pc; pt0.patchName = str(q.patchName, "", 20).replace(/[<>&"\u0000-\u001f]/g, ""); }
      }
      parts.push(pt0);
    }
    var sk = [];
    if (isArr(o.skipped)) { for (i = 0; i < o.skipped.length && sk.length < 16; i++) { if (typeof o.skipped[i] === "string") { sk.push(o.skipped[i].replace(/[<>&"]/g, "").substring(0, 20)); } } }
    var src = null; // 9B-3: 元のテイク・リズム（なくてもよい）
    if (isObj(o.src) && (o.src.kind === "take" || o.src.kind === "pat" || o.src.kind === "seq") && (typeof o.src.id === "number" || typeof o.src.id === "string")) { src = { kind: o.src.kind, id: typeof o.src.id === "number" ? Math.round(o.src.id) : String(o.src.id).substring(0, 20), name: str(o.src.name, "", 40) }; }
    return { ok: true, box: { type: INBOX_TYPE, v: 1, id: o.id, from: o.from, made: made, src: src, name: str(o.name, "ゲームの曲", 40).replace(/[\u0000-\u001f]/g, "") || "ゲームの曲", bpm: Math.round(bpm * 100) / 100, meter: meter, ppq: PPQ, len: Math.round(len), tempoRows: Math.max(0, Math.round(Number(o.tempoRows) || 0)), parts: parts, skipped: sk } };
  }
  // 送る側が作る（ゲームのデータ → 受け取り箱の形）→ { ok, why, box, json }
  function inboxMake(from, o, now) {
    now = typeof now === "number" ? now : Date.now();
    var src = { type: INBOX_TYPE, v: 1, id: inboxId(now), from: from, made: now, name: o && o.name, bpm: o && o.bpm, meter: o && o.meter, ppq: PPQ, len: o && o.len, tempoRows: o && o.tempoRows, parts: o && o.parts, skipped: o && o.skipped, src: o && o.src };
    var r = inboxClean(src, now);
    if (!r.ok) { return r; }
    var json = JSON.stringify(r.box);
    if (json.length > INBOX_MAX_BYTES) { return { ok: false, why: "大きすぎて送れません（" + Math.round(json.length / 1024) + " KB・" + (INBOX_MAX_BYTES / 1024) + " KB まで）" }; }
    return { ok: true, box: r.box, json: json };
  }
  function inboxLs() { try { return window.localStorage || null; } catch (e) { return null; } }
  function inboxRaw() { var ls = inboxLs(); try { return ls ? ls.getItem(INBOX_KEY) : null; } catch (e) { return null; } }
  // 読む → { box（なければ null）, why, bad, expired }
  function inboxRead(now) {
    var raw = inboxRaw(), o = null;
    if (raw === null || raw === undefined) { return { box: null }; }
    if (raw.length > INBOX_MAX_BYTES) { return { box: null, bad: true, why: "受け取り箱のデータが大きすぎます" }; }
    try { o = JSON.parse(raw); } catch (e) { return { box: null, bad: true, why: "受け取り箱のデータが読めません" }; }
    var r = inboxClean(o, now);
    return r.ok ? { box: r.box } : { box: null, bad: true, expired: !!r.expired, why: r.why };
  }
  function inboxWrite(made) { var ls = inboxLs(); if (!ls || !made || !made.ok) { return { ok: false, why: "このブラウザでは保存できません" }; } try { ls.setItem(INBOX_KEY, made.json); return { ok: true }; } catch (e) { return { ok: false, why: "保存できませんでした（容量がいっぱいかもしれません）" }; } }
  function inboxClear() { var ls = inboxLs(); try { if (ls) { ls.removeItem(INBOX_KEY); } return true; } catch (e) { return false; } }
  // 取りこんだクリップか（二重の追加をふせぐ）
  function inboxUsed(p, id) { var i, j; for (i = 0; p && i < p.tracks.length; i++) { for (j = 0; j < p.tracks[i].clips.length; j++) { var x = p.tracks[i].clips[j].ext; if (isObj(x) && isObj(x.src) && x.src.inbox === id) { return true; } } } return false; }
  // 取りこみの計画（先に全部を調べる）。o: { parts: [key], bar（1 から）, target: "new" ／ トラックの ID } → { ok, why, items, dest, span }
  function importPlan(p, box, o) {
    o = o || {};
    var bt = barTicks(p), i, j, k, sel = [];
    if (!box) { return { ok: false, why: "届いているものがありません" }; }
    if (inboxUsed(p, box.id)) { return { ok: false, why: "この曲には、もう取りこんであります（二重には足しません）" }; }
    for (i = 0; i < box.parts.length; i++) { if (!o.parts || o.parts.indexOf(box.parts[i].key) >= 0) { sel.push(box.parts[i]); } }
    if (!sel.length) { return { ok: false, why: "取りこむパートを 1 つ以上選んでください" }; }
    var b = Math.round(Number(o.bar === undefined ? 1 : o.bar));
    if (!isFinite(b) || b < 1) { return { ok: false, why: "はじまりの小節は 1 から" }; }
    var dest = (b - 1) * bt, last = box.len;
    for (i = 0; i < sel.length; i++) { for (j = 0; j < sel[i].notes.length; j++) { last = Math.max(last, sel[i].notes[j][0] + 1); } }
    var span = Math.ceil(last / bt) * bt, chunk = CLIP_MAX_BARS * bt;
    if (dest + span > MAX_BARS * bt) { return { ok: false, why: "曲の長さ（" + MAX_BARS + " 小節）をこえます（" + Math.round(span / bt) + " 小節ぶん・" + b + " 小節目から）" }; }
    var target = o.target && o.target !== "new" ? findTrack(p, o.target) : null;
    if (o.target && o.target !== "new") {
      var wantDrum = sel.length === 1 && sel[0].preset === "drum"; // 9B-3: 同じ種類のトラックだけ
      if (!target || target.kind !== "midi" || isDrum(target) !== wantDrum) { return { ok: false, why: wantDrum ? "ドラムのパートは、ドラムのトラックにだけ取りこめます" : "そのトラックには取りこめません（シンセのトラックだけ）" }; }
      if (sel.length !== 1) { return { ok: false, why: "いまあるトラックに入れるときは、パートを 1 つだけ選んでください" }; }
    } else if (p.tracks.length + sel.length > MAX_TRACKS) { return { ok: false, why: "トラックは " + MAX_TRACKS + " 本までです（あと " + Math.max(0, MAX_TRACKS - p.tracks.length) + " 本・" + sel.length + " パート）" }; }
    var items = [], qs = { moved: 0, kept: 0, max: 0 };
    for (i = 0; i < sel.length; i++) {
      var part = sel[i], clips = [], isD = part.preset === "drum";
      // 9B-3: ドラムを 16 分の格子にそろえる（同じ楽器が同じマスに重なる打は、元の位置のまま残す ＝ 音を減らさない）
      if (isD && o.quant) {
        var used = {}, qn = [];
        for (j = 0; j < part.notes.length; j++) {
          var n0 = part.notes[j], g = Math.round(n0[0] / STEP) * STEP, kq = g + ":" + n0[2];
          if (g !== n0[0] && used[kq]) { qs.kept++; used[n0[0] + ":" + n0[2]] = true; qn.push(n0.slice()); continue; }
          if (g !== n0[0]) { qs.moved++; qs.max = Math.max(qs.max, Math.abs(g - n0[0])); }
          used[kq] = true; qn.push([g, n0[1], n0[2], n0[3]]);
        }
        qn.sort(function (a2, b2) { return a2[0] - b2[0] || a2[2] - b2[2]; });
        part = { key: part.key, name: part.name, preset: part.preset, notes: qn };
      }
      for (k = 0; k * chunk < span; k++) {
        var a = k * chunk, z = Math.min(span, a + chunk), ns = [];
        for (j = 0; j < part.notes.length; j++) { var n = part.notes[j]; if (n[0] >= a && n[0] < z) { ns.push([n[0] - a, isD ? 0 : Math.max(1, Math.min(n[1], z - n[0])), n[2], n[3]]); } }
        if (!ns.length) { continue; }
        if (ns.length > MAX_NOTES) { return { ok: false, why: "「" + part.name + "」の " + (Math.round(a / bt) + 1) + " 小節目からのクリップの音符が " + MAX_NOTES + " 個をこえます" }; }
        clips.push({ start: dest + a, len: z - a, notes: ns });
      }
      if (!clips.length) { continue; }
      if (target) {
        if (target.clips.length + clips.length > MAX_CLIPS_PER_TRACK) { return { ok: false, why: "「" + target.name + "」のクリップが " + MAX_CLIPS_PER_TRACK + " 個をこえます" }; }
        for (j = 0; j < clips.length; j++) { var ov = overlapClip(target, clips[j].start, clips[j].len, null); if (ov) { return { ok: false, why: "「" + target.name + "」の " + (Math.floor(ov.start / bt) + 1) + " 小節目のクリップ（「" + ((ov.ext && ov.ext.name) || "クリップ") + "」）と重なります。上書きはしません" }; } }
      }
      items.push({ part: part, clips: clips, track: target });
    }
    if (!items.length) { return { ok: false, why: "取りこめる音符がありません" }; }
    return { ok: true, items: items, dest: dest, span: span, bar: b, quant: qs };
  }
  // ---------- §342 9B-5: 拍のテイク（ゴリラベース・ゴリラギター）→ 送る形・確かめる・送る（2 つの楽器で共通。元のテイクは変えない）----------
  // take: { id, name, bpm, meter, notes: [[拍, 長さ, MIDI, 強さ?]…] }  o: { key, part（パートの名前）, preset, def（名前が無いとき）}
  // 9B-6: o.parts ＝ [{ key, part, preset, notes（拍）}]（編成のテイク ＝ 楽器ごと）。無いときは take.notes を 1 パート（9B-5 と同じ結果）
  function takePayload(take, o) {
    o = o || {};
    var list = isArr(o.parts) && o.parts.length ? o.parts : [{ key: o.key || "take", part: o.part || "テイク", preset: o.preset || "lead", notes: take && take.notes, patch: o.patch || null, patchName: o.patchName || "" }];
    var parts = [], all = [], i, j, end = 0, lo = 127, hi = 0;
    for (j = 0; j < list.length; j++) {
      var src = isArr(list[j].notes) ? list[j].notes : [], notes = [];
      for (i = 0; i < src.length && notes.length < MAX_NOTES; i++) {
        var n = src[i];
        if (!isArr(n)) { continue; }
        var b = Number(n[0]), d = Number(n[1]), m = Number(n[2]), v = n.length > 3 ? Number(n[3]) : 0.8;
        if (!isFinite(b) || b < 0 || !isFinite(d) || d <= 0 || !isFinite(m) || m < 0 || m > 127) { continue; }
        var t = Math.max(0, Math.round(b * PPQ)), dd = Math.max(1, Math.round(d * PPQ));
        notes.push([t, dd, Math.round(m), Math.round(num(v, 0.8, 0, 1) * 1000) / 1000]);
        end = Math.max(end, t + dd); lo = Math.min(lo, Math.round(m)); hi = Math.max(hi, Math.round(m));
      }
      notes.sort(function (a, c) { return a[0] - c[0] || a[2] - c[2]; });
      if (notes.length) { var pq = { key: String(list[j].key || "take" + j), name: list[j].part || "テイク", preset: list[j].preset || "lead", notes: notes }; if (list[j].patch) { pq.patch = list[j].patch; pq.patchName = list[j].patchName || ""; } parts.push(pq); all = all.concat(notes); } // 9B-7: 音色のパラメーター
    }
    // 同時に鳴る音の最大（ストロークは弦ごとにずれるので、同じ tick ではなく重なりで数える。全部のパート）
    var evs = [], poly = 0, cur = 0;
    for (i = 0; i < all.length; i++) { evs.push([all[i][0], 1], [all[i][0] + all[i][1], -1]); }
    evs.sort(function (a, c) { return a[0] - c[0] || a[1] - c[1]; });
    for (i = 0; i < evs.length; i++) { cur += evs[i][1]; poly = Math.max(poly, cur); }
    var meter = take && take.meter === 3 ? 3 : 4, bpm = take && isFinite(Number(take.bpm)) ? Number(take.bpm) : 100, bar = PPQ * meter, len = Math.max(bar, Math.ceil(end / bar) * bar);
    return { name: str(String(take && take.name || o.def || "テイク"), "テイク", 40), bpm: bpm, meter: meter, len: len, tempoRows: 0, notes: all.length, poly: poly, lo: all.length ? lo : null, hi: all.length ? hi : null,
      bars: Math.round(len / bar), sec: Math.round(len / PPQ * 60 / bpm * 10) / 10, parts: parts, skipped: [],
      src: take ? { kind: "take", id: take.id, name: take.name } : null };
  }
  function takeCheck(from, pay, take) {
    if (!take) { return { ok: false, why: "テイクが見つかりません" }; }
    if (!pay || !pay.parts.length) { return { ok: false, why: "音のないテイクは送れません", pay: pay }; }
    var made = inboxMake(from, pay), old = inboxRead();
    return { ok: made.ok, why: made.why || "", pay: pay, made: made, prev: old.box ? old.box.name : null };
  }
  // 書いてから読みなおして確かめる（だめなら理由。元のテイクには触らない）
  function takeSend(from, pay, take) {
    var c = takeCheck(from, pay, take);
    if (!c.ok) { return { ok: false, why: c.why }; }
    var w = inboxWrite(c.made);
    if (!w.ok) { return { ok: false, why: w.why }; }
    var back = inboxRead();
    if (!back.box || back.box.id !== c.made.box.id) { return { ok: false, why: "保存したデータを読みなおせませんでした" }; }
    return { ok: true, name: c.made.box.name, id: c.made.box.id };
  }
  // §342 9B-7: 音色のパラメーター → トラックの音色（inline の patch）。同じプリセットがあれば、そのプリセットの名前で出す（ちがえば「じぶんの音色」）
  function patchPreset(patch) {
    var S = window.UGSynth, l = S && S.PRESETS ? S.PRESETS : [], js = JSON.stringify(patch), i;
    for (i = 0; i < l.length; i++) { try { if (JSON.stringify(S.patchClean(l[i][2])) === js) { return l[i][0]; } } catch (e) {} }
    return "";
  }
  function patchInstrument(patch, name) {
    var pre = patchPreset(patch), ins;
    if (pre) { ins = synthInstrument(pre); if (ins.patch.patch && JSON.stringify(ins.patch.patch) === JSON.stringify(patch)) { return ins; } }
    return { type: "synth", patch: { mode: "inline", patch: copy(patch), hash: hash(JSON.stringify(patch)) }, ext: { preset: "", presetName: str(name, "", 80) } };
  }
  // 計画どおりに足す（importPlan が ok のときだけ）→ { ok, clips, tracks }
  function importApply(p, box, plan) {
    var made = [], tracks = [], i, j;
    if (!plan || !plan.ok) { return { ok: false, why: plan ? plan.why : "計画がありません" }; }
    for (i = 0; i < plan.items.length; i++) {
      var it = plan.items[i], t = it.track;
      if (!t && it.part.preset === "drum") { if (p.tracks.length >= MAX_TRACKS) { return { ok: false, why: "トラックを足せませんでした" }; } t = newTrack(p, it.part.name, drumInstrument()); t.ext.icon = "&#x1F941;"; t.ext.src = { game: box.from, inbox: box.id }; tracks.push(t); } // 9B-3: ドラム（空のパターンは作らない）
      if (!t) { t = addTrack(p, it.part.name, it.part.preset); if (!t) { return { ok: false, why: "トラックを足せませんでした" }; } if (it.part.patch) { t.instrument = patchInstrument(it.part.patch, it.part.patchName); } t.ext.icon = box.from === "synth" ? "&#x1F39B;&#xFE0F;" : box.from === "strings" ? "&#x1F3BB;" : (box.from === "horn" ? "&#x1F3BA;" : (it.part.preset === "pluck" || box.from === "bass" || box.from === "guitar" ? "&#x1F3B8;" : "&#x1F3B5;")); t.ext.src = { game: box.from, inbox: box.id }; tracks.push(t); }
      for (j = 0; j < it.clips.length; j++) {
        var q = it.clips[j], nm = str(it.part.name + "（" + box.name + "）" + (it.clips.length > 1 ? " " + (j + 1) : ""), "", 40);
        var c = newMidiClip(p, t, q.start, q.len, q.notes, nm);
        c.ext.src = { game: box.from, inbox: box.id, name: box.name };
        made.push(c);
      }
      sortClips(t);
    }
    return { ok: true, clips: made, tracks: tracks };
  }

  // ---------- §342 9B-4: 標準 MIDI ファイル（SMF）の読み込み・書き出し（画面を持たない・バイトの配列）----------
  var MIDI_MAX_BYTES = 1048576, MIDI_MAX_EVENTS = 200000, MIDI_MAX_NOTES = 20000, MIDI_MAX_MS = 3000, MIDI_MAX_TRKS = 64, MIDI_MAX_TICK = 2147483647;
  var MIDI_DRUM_LO = 35, MIDI_DRUM_HI = 81, MIDI_DRUM_LEN = PPQ / 8, MIDI_DRUM_CH = 9;
  // DAW だけのドラムの番号 → GM の番号（ゴリラウクレレ・メロディくずしの書き出しと同じ表。0 ＝ 書かない）
  var DRUM_GM = { 21: 44, 23: 46, 24: 40, 22: 38, 26: 0, 25: 0 };
  var GM_DRUM_NAMES = { 35: "バスドラム", 36: "キック", 37: "サイドスティック", 38: "スネア", 39: "クラップ", 40: "エレキスネア", 41: "フロアタム（低）", 42: "ハイハット（閉）", 43: "フロアタム（高）", 44: "ペダルHH", 45: "タム（低）",
    46: "ハイハット（開）", 47: "タム（中低）", 48: "タム（中高）", 49: "クラッシュ", 50: "タム（高）", 51: "ライド", 52: "チャイナ", 53: "ライドのベル", 54: "タンバリン", 55: "スプラッシュ", 56: "カウベル", 57: "クラッシュ2", 58: "ビブラスラップ",
    59: "ライド2", 60: "ボンゴ（高）", 61: "ボンゴ（低）", 62: "コンガ（ミュート）", 63: "コンガ（高）", 64: "コンガ（低）", 65: "ティンバレス（高）", 66: "ティンバレス（低）", 67: "アゴゴ（高）", 68: "アゴゴ（低）", 69: "カバサ", 70: "マラカス",
    71: "ホイッスル（短）", 72: "ホイッスル（長）", 73: "ギロ（短）", 74: "ギロ（長）", 75: "クラベス", 76: "ウッドブロック（高）", 77: "ウッドブロック（低）", 78: "クイーカ（ミュート）", 79: "クイーカ（開）", 80: "トライアングル（ミュート）", 81: "トライアングル（開）" };
  // シンセのプリセット → 近い GM の音色（0 から）。読みこみは GM の音色 → プリセット
  var MIDI_PRESET_GM = { lead: 81, chip: 80, pad: 89, spad: 50, brass: 62, bass: 38, acid: 39, pluck: 24, bell: 14, organ: 16, wobble: 87, soft: 79 };
  function midiGmPreset(g) {
    g = Number(g);
    if (!(g >= 0 && g <= 127)) { return "lead"; }
    if (g < 8 || (g >= 24 && g < 32) || (g >= 104 && g < 112)) { return "pluck"; }
    if (g < 16 || (g >= 112 && g < 120)) { return "bell"; }
    if (g < 24) { return "organ"; }
    if (g < 40) { return "bass"; }
    if (g < 56) { return "spad"; }
    if (g < 72) { return "brass"; }
    if (g < 80) { return "soft"; }
    if (g < 88 || g >= 120) { return "lead"; }
    return "pad";
  }
  function midiPresetOk(id) {
    if (typeof id !== "string" || !/^[a-z0-9_-]{1,24}$/.test(id)) { return false; }
    var S = window.UGSynth;
    try { if (S && S.preset) { var pr = S.preset(id); return !!(pr && pr.id === id); } } catch (e) { return false; }
    return MIDI_PRESET_GM.hasOwnProperty(id);
  }
  function midiVlq(n) { var b = [n & 0x7F]; n = Math.floor(n / 128); while (n > 0) { b.unshift((n & 0x7F) | 0x80); n = Math.floor(n / 128); } return b; }
  function midiUtf8(s) { var u = unescape(encodeURIComponent(String(s))), o = [], i; for (i = 0; i < u.length; i++) { o.push(u.charCodeAt(i)); } return o; }
  function midiText(u8, a, z) {
    var s = "", i;
    for (i = a; i < z && i < a + 400; i++) { s += String.fromCharCode(u8[i]); }
    try { s = decodeURIComponent(escape(s)); } catch (e) {} // UTF-8 でなければ 1 バイトずつの文字のまま
    return s.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").replace(/^\s+|\s+$/g, "").substring(0, 40);
  }
  function midiMeta(type, bytes) { return [0xFF, type].concat(midiVlq(bytes.length), bytes); }
  // evs: [tick, 順番, バイト, 並び] → MTrk のバイト
  function midiTrack(evs, out) {
    var i, j, last = 0, d = [];
    for (i = 0; i < evs.length; i++) { evs[i][3] = i; }
    evs.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1] || a[3] - b[3]; });
    for (i = 0; i < evs.length; i++) { var dv = midiVlq(evs[i][0] - last); last = evs[i][0]; for (j = 0; j < dv.length; j++) { d.push(dv[j]); } for (j = 0; j < evs[i][2].length; j++) { d.push(evs[i][2][j]); } }
    d.push(0x00, 0xFF, 0x2F, 0x00);
    out.push(0x4D, 0x54, 0x72, 0x6B, (d.length >>> 24) & 255, (d.length >>> 16) & 255, (d.length >>> 8) & 255, d.length & 255);
    for (i = 0; i < d.length; i++) { out.push(d[i]); }
  }
  // 📤 曲 → SMF Format 1（PPQ 960）。鳴る音符（noteEvents）だけ。→ { ok, why, bytes, info }
  function midiExport(p) {
    var ev = noteEvents(p, 0, Infinity), by = {}, i, j, info = { tracks: [], notes: 0, audio: 0, empty: 0, drumMap: {}, drumDrop: 0, tempos: 0, meters: 0, sections: 0, muted: 0, swing: 0 };
    for (i = 0; i < ev.length; i++) { (by[ev[i].track] = by[ev[i].track] || []).push(ev[i]); }
    var cond = [[0, 0, midiMeta(0x03, midiUtf8(str(p.name, "Gorilla DAW", 40)))]], ms = meters(p), ps = points(p), sec = sectionsOf(p);
    for (i = 0; i < ms.length; i++) { var dd = Math.round(Math.log(ms[i].den || 4) / Math.LN2); cond.push([ms[i].tick, 0, [0xFF, 0x58, 0x04, ms[i].num, dd, 24, 8]]); info.meters++; }
    for (i = 0; i < ps.length; i++) { var us = Math.max(1, Math.min(0xFFFFFF, Math.round(60000000 / ps[i].bpm))); cond.push([ps[i].tick, 0, [0xFF, 0x51, 0x03, (us >> 16) & 255, (us >> 8) & 255, us & 255]]); info.tempos++; }
    for (i = 0; i < sec.length; i++) { cond.push([sec[i].tick, 1, midiMeta(0x06, midiUtf8(sectionName(sec[i].name) || "Section"))]); info.sections++; }
    var trks = [], synthN = 0;
    for (i = 0; p && i < p.tracks.length; i++) {
      var t = p.tracks[i], list = by[t.id] || [];
      if (isAudio(t)) { info.audio++; continue; }
      if (t.kind !== "midi") { continue; }
      if (!list.length) { info.empty++; continue; }
      var drum = isDrum(t), ch = drum ? MIDI_DRUM_CH : (synthN % 15 < 9 ? synthN % 15 : synthN % 15 + 1), evs = [], n = 0, preset = "";
      if (!drum) { synthN++; }
      if (t.mute || t.solo) { info.muted++; }
      if (drum && swingOf(t)) { info.swing++; }
      evs.push([0, 0, midiMeta(0x03, midiUtf8(str(t.name, "Track", 40)))]);
      if (!drum) {
        preset = t.instrument && t.instrument.ext && typeof t.instrument.ext.preset === "string" ? t.instrument.ext.preset : "";
        if (/^[a-z0-9_-]{1,24}$/.test(preset)) { evs.push([0, 0, midiMeta(0x04, midiUtf8("ugsynth:" + preset))]); }
        evs.push([0, 1, [0xC0 | ch, MIDI_PRESET_GM.hasOwnProperty(preset) ? MIDI_PRESET_GM[preset] : 80]]);
      }
      evs.push([0, 1, [0xB0 | ch, 7, Math.max(0, Math.min(127, Math.round(num(t.vol, 80, 0, 100) * 1.27)))]]);
      evs.push([0, 1, [0xB0 | ch, 10, Math.max(0, Math.min(127, Math.round(64 + num(t.pan, 0, -1, 1) * 63)))]]);
      for (j = 0; j < list.length; j++) {
        var e = list[j], m = e.m, on = e.tick, off;
        if (drum && DRUM_GM.hasOwnProperty(m)) {
          if (!DRUM_GM[m]) { info.drumDrop++; continue; }
          info.drumMap[m] = (info.drumMap[m] || 0) + 1; m = DRUM_GM[m];
        }
        off = drum ? on + MIDI_DRUM_LEN : on + Math.max(1, e.end - e.tick);
        var vel = Math.max(1, Math.min(127, Math.round(num(e.v, 0.8, 0, 1) * 127)));
        evs.push([off, 2, [0x80 | ch, m, 0]]);
        evs.push([on, 3, [0x90 | ch, m, vel]]);
        n++;
      }
      if (!n) { info.empty++; continue; }
      trks.push(evs); info.notes += n;
      info.tracks.push({ id: t.id, name: t.name, drum: drum, ch: ch + 1, notes: n, preset: preset });
    }
    if (!trks.length) { return { ok: false, why: "書き出せる音符がありません（MIDI のトラックに音符を置いてください）", info: info }; }
    var out = [0x4D, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, ((trks.length + 1) >> 8) & 255, (trks.length + 1) & 255, (PPQ >> 8) & 255, PPQ & 255];
    midiTrack(cond, out);
    for (i = 0; i < trks.length; i++) { midiTrack(trks[i], out); }
    return { ok: true, bytes: out, info: info };
  }
  // 📥 バイト → 調べた結果（曲は作らない）→ { ok, why, ... }。断るときは ok: false と理由
  function midiParse(u8, clock) {
    var n = u8 ? u8.length : 0, t0 = clock ? clock() : Date.now(), evN = 0, noteN = 0;
    var cnt = { cc: 0, sus: 0, bend: 0, at: 0, sysex: 0, text: 0, lyric: 0, marker: 0, key: 0, meta: 0, chunk: 0, orphan: 0, overlap: 0, open: 0, noEot: 0 };
    var tempos = [], meters0 = [], trks = [];
    function fail(why) { return { ok: false, why: why }; }
    function tag(o) { return String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]); }
    function r32(o) { return u8[o] * 16777216 + (u8[o + 1] << 16) + (u8[o + 2] << 8) + u8[o + 3]; }
    function r16(o) { return (u8[o] << 8) + u8[o + 1]; }
    if (!n) { return fail("ファイルが空です"); }
    if (n > MIDI_MAX_BYTES) { return fail("ファイルが大きすぎます（" + Math.round(n / 1024) + " KB・" + (MIDI_MAX_BYTES / 1048576) + " MB まで）"); }
    if (n < 14 || tag(0) !== "MThd") { return fail("MIDI ファイルではありません（はじめが MThd ではありません）"); }
    var hl = r32(4);
    if (hl < 6 || 8 + hl > n) { return fail("ヘッダーが壊れています（長さ " + hl + "）"); }
    var fmt = r16(8), ntr = r16(10), div = r16(12);
    if (fmt === 2) { return fail("Format 2（別々のパターンの集まり）には対応していません（Format 0・1 だけ）"); }
    if (fmt > 2) { return fail("知らない形式です（Format " + fmt + "）"); }
    if (div & 0x8000) { return fail("SMPTE の時刻（フレームの単位）には対応していません（4 分音符の単位だけ）"); }
    if (!div) { return fail("ヘッダーの時刻の単位（division）が 0 です"); }
    var pos = 8 + hl;
    function track(a, z, ti) {
      var p = a, tick = 0, run = 0, notes = [], open = {}, prog = {}, name = "", inst = "", eot = false, k;
      function vlq() { var v = 0, c, b; for (c = 0; c < 4; c++) { if (p >= z) { return -1; } b = u8[p++]; v = v * 128 + (b & 0x7F); if (!(b & 0x80)) { return v; } } return -2; }
      while (p < z && !eot) {
        evN++;
        if (evN > MIDI_MAX_EVENTS) { return fail("イベントが多すぎます（" + MIDI_MAX_EVENTS + " 個まで）"); }
        if ((evN & 2047) === 0 && (clock ? clock() : Date.now()) - t0 > MIDI_MAX_MS) { return fail("調べるのに時間がかかりすぎます（" + (MIDI_MAX_MS / 1000) + " 秒まで）"); }
        var dt = vlq();
        if (dt < 0) { return fail(dt === -2 ? "トラック " + (ti + 1) + " の可変長の数が壊れています（4 バイトをこえる）" : "トラック " + (ti + 1) + " が途中で終わっています"); }
        tick += dt;
        if (tick > MIDI_MAX_TICK) { return fail("曲が長すぎます（時刻があふれます）"); }
        if (p >= z) { return fail("トラック " + (ti + 1) + " が途中で終わっています"); }
        var s = u8[p];
        if (s & 0x80) { p++; } else { if (!run) { return fail("トラック " + (ti + 1) + " にステータスの無いイベントがあります（ランニングステータスの前が無い）"); } s = run; }
        if (s === 0xFF) {
          if (p >= z) { return fail("トラック " + (ti + 1) + " が途中で終わっています"); }
          var ty = u8[p++], ln = vlq();
          if (ln < 0 || p + ln > z) { return fail("トラック " + (ti + 1) + " のメタイベントの長さがおかしいです"); }
          var a2 = p; p += ln; // ランニングステータスは残す（メタのあとに続けて書くファイルもある）
          if (ty === 0x2F) { eot = true; }
          else if (ty === 0x03) { if (!name) { name = midiText(u8, a2, p); } }
          else if (ty === 0x04) { if (!inst) { inst = midiText(u8, a2, p); } }
          else if (ty === 0x51) { if (ln === 3) { var us = (u8[a2] << 16) + (u8[a2 + 1] << 8) + u8[a2 + 2]; if (us > 0) { tempos.push([tick, us, ti]); } } else { cnt.meta++; } }
          else if (ty === 0x58) { if (ln >= 2) { meters0.push([tick, u8[a2], u8[a2 + 1] <= 6 ? Math.pow(2, u8[a2 + 1]) : 0]); } else { cnt.meta++; } }
          else if (ty === 0x05) { cnt.lyric++; }
          else if (ty === 0x06) { cnt.marker++; }
          else if (ty >= 0x01 && ty <= 0x0F) { cnt.text++; }
          else if (ty === 0x59) { cnt.key++; }
          else { cnt.meta++; }
          continue;
        }
        if (s === 0xF0 || s === 0xF7) { var ls = vlq(); if (ls < 0 || p + ls > z) { return fail("トラック " + (ti + 1) + " の SysEx の長さがおかしいです"); } p += ls; cnt.sysex++; continue; }
        if (s > 0xF0) { return fail("トラック " + (ti + 1) + " に知らない種類のイベントがあります（0x" + s.toString(16).toUpperCase() + "）"); }
        run = s;
        var hi = s & 0xF0, ch = s & 0x0F, need = hi === 0xC0 || hi === 0xD0 ? 1 : 2;
        if (p + need > z) { return fail("トラック " + (ti + 1) + " が途中で終わっています"); }
        var d1 = u8[p], d2 = need === 2 ? u8[p + 1] : 0;
        if ((d1 & 0x80) || (d2 & 0x80)) { return fail("トラック " + (ti + 1) + " のデータのバイトがおかしいです（0x80 以上）"); }
        p += need;
        var key = ch * 128 + d1;
        if (hi === 0x90 && d2 > 0) {
          noteN++;
          if (noteN > MIDI_MAX_NOTES) { return fail("音符が多すぎます（" + MIDI_MAX_NOTES + " 個まで）"); }
          if (open[key] && open[key].length) { cnt.overlap++; }
          (open[key] = open[key] || []).push(notes.length);
          notes.push([tick, -1, d1, d2, ch]);
        } else if (hi === 0x80 || hi === 0x90) {
          var q = open[key];
          if (q && q.length) { var ix = q.shift(); notes[ix][1] = tick - notes[ix][0]; } else { cnt.orphan++; }
        } else if (hi === 0xB0) { cnt.cc++; if (d1 === 64) { cnt.sus++; } }
        else if (hi === 0xC0) { if (prog[ch] === undefined) { prog[ch] = d1; } }
        else if (hi === 0xE0) { cnt.bend++; }
        else { cnt.at++; }
      }
      if (!eot) { cnt.noEot++; }
      for (k in open) { if (open.hasOwnProperty(k)) { while (open[k].length) { var oi = open[k].shift(); notes[oi][1] = Math.max(0, tick - notes[oi][0]); cnt.open++; } } }
      return { ok: true, name: name, inst: inst, notes: notes, prog: prog, end: tick };
    }
    while (pos < n) {
      if (pos + 8 > n) { return fail("ファイルの終わりが壊れています"); }
      var tg = tag(pos), len = r32(pos + 4), body = pos + 8;
      if (body + len > n) { return fail("トラックの長さがおかしいです（ファイルの終わりをこえます）"); }
      if (tg !== "MTrk") { cnt.chunk++; pos = body + len; continue; }
      if (trks.length >= MIDI_MAX_TRKS) { return fail("トラックが多すぎます（" + MIDI_MAX_TRKS + " 本まで）"); }
      var r = track(body, body + len, trks.length);
      if (!r.ok) { return r; }
      trks.push(r);
      pos = body + len;
    }
    if (!trks.length) { return fail("トラック（MTrk）がありません"); }
    return { ok: true, format: fmt, ntrks: ntr, division: div, trks: trks, tempos: tempos, meters: meters0, cnt: cnt, notes: noteN };
  }
  // 📥 調べた結果 → 確認の画面に出すもの・取りこむパート（PPQ 960 に直す）。fileName は表示だけ
  function midiRead(u8, fileName, clock) {
    var r = midiParse(u8, clock), i, j, k;
    if (!r.ok) { return r; }
    var div = r.division, cnt = r.cnt, notices = [], skipped = [];
    function tk(x) { return Math.round(x * PPQ / div); }
    // 拍子（tick 0）
    var mt = r.meters.slice().sort(function (a, b) { return a[0] - b[0]; }), mnum = 4, mden = 4, meterChanges = [];
    for (i = 0; i < mt.length && mt[i][0] === 0; i++) { mnum = mt[i][1]; mden = mt[i][2]; }
    if (!(mnum >= 1 && mnum <= 32) || [1, 2, 4, 8, 16].indexOf(mden) < 0) { notices.push("拍子（" + mnum + "/" + mden + "）は DAW で使えないので 4/4 にします"); mnum = 4; mden = 4; }
    var tpb = Math.round(mnum * PPQ * 4 / mden);
    function barOf(ft) { return Math.floor(tk(ft) / tpb) + 1; }
    for (; i < mt.length; i++) { var lm = meterChanges.length ? meterChanges[meterChanges.length - 1] : { num: mnum, den: mden }; if (mt[i][1] !== lm.num || mt[i][2] !== lm.den) { meterChanges.push({ tick: tk(mt[i][0]), bar: barOf(mt[i][0]), num: mt[i][1], den: mt[i][2] }); } }
    // テンポ（tick 0）・途中の変化
    var tp = r.tempos.slice().sort(function (a, b) { return a[0] - b[0] || a[2] - b[2]; }), us0 = 500000, tempoChanges = [];
    for (i = 0; i < tp.length && tp[i][0] === 0; i++) { us0 = tp[i][1]; }
    function bpmOf(us) { return Math.round(60000000 / us * 100) / 100; }
    var bpm = bpmOf(us0), last = bpm;
    if (bpm < BPM_MIN || bpm > BPM_MAX) { notices.push("BPM " + bpm + " は DAW の範囲（" + BPM_MIN + "〜" + BPM_MAX + "）の外なので " + Math.max(BPM_MIN, Math.min(BPM_MAX, bpm)) + " にします"); bpm = Math.max(BPM_MIN, Math.min(BPM_MAX, bpm)); last = bpm; }
    for (; i < tp.length; i++) { var b2 = bpmOf(tp[i][1]); if (b2 !== last) { tempoChanges.push({ tick: tk(tp[i][0]), bar: barOf(tp[i][0]), bpm: b2 }); last = b2; } }
    // パート（Format 1 ＝ MTrk ごと・中でチャンネルが分かれていればチャンネルごと。Format 0 ＝ チャンネルごと）
    var gprog = {}, parts = [], total = 0, endT = 0;
    for (i = 0; i < r.trks.length; i++) { for (k in r.trks[i].prog) { if (r.trks[i].prog.hasOwnProperty(k) && gprog[k] === undefined) { gprog[k] = r.trks[i].prog[k]; } } }
    for (i = 0; i < r.trks.length; i++) {
      var tr = r.trks[i], chs = [], byc = {};
      for (j = 0; j < tr.notes.length; j++) { var c0 = tr.notes[j][4]; if (!byc[c0]) { byc[c0] = []; chs.push(c0); } byc[c0].push(tr.notes[j]); }
      chs.sort(function (a, b) { return a - b; });
      for (j = 0; j < chs.length; j++) {
        var ch = chs[j], list = byc[ch], ns = [], pg = tr.prog[ch] !== undefined ? tr.prog[ch] : gprog[ch], m0 = /^ugsynth:([a-z0-9_-]{1,24})$/.exec(tr.inst || ""), nm;
        for (k = 0; k < list.length; k++) {
          var a = tk(list[k][0]), z = tk(list[k][0] + Math.max(0, list[k][1]));
          ns.push([a, z - a, list[k][2], Math.round(list[k][3] / 127 * 1000) / 1000]);
          endT = Math.max(endT, z, a + 1);
        }
        ns.sort(function (x, y) { return x[0] - y[0] || x[2] - y[2]; });
        nm = tr.name ? (chs.length > 1 ? tr.name.substring(0, 34) + " " + (ch + 1) + "ch" : tr.name) : (r.format === 0 ? "チャンネル " + (ch + 1) : "トラック " + (i + 1) + (chs.length > 1 ? " " + (ch + 1) + "ch" : ""));
        if (!tr.name && ch === MIDI_DRUM_CH) { nm = r.format === 0 || chs.length > 1 ? "ドラム（10ch）" : "ドラム"; }
        parts.push({ key: "p" + parts.length, name: str(nm, "トラック", 40), ch: ch + 1, trk: i + 1, drum: ch === MIDI_DRUM_CH, prog: pg === undefined ? null : pg, preset: m0 && midiPresetOk(m0[1]) ? m0[1] : midiGmPreset(pg), notes: ns });
        total += ns.length;
      }
    }
    if (!total) { return { ok: false, why: "音符（Note On）がありません" }; }
    var len = Math.max(tpb, Math.ceil(endT / tpb) * tpb), bars = Math.round(len / tpb);
    if (bars > MAX_BARS) { return { ok: false, why: "曲が長すぎます（" + bars + " 小節・" + MAX_BARS + " 小節まで）" }; }
    // 入らないもの
    if (cnt.sus) { skipped.push("サステインペダル " + cnt.sus + " 個（音の長さは鍵盤を離した所まで）"); }
    if (cnt.cc - cnt.sus > 0) { skipped.push("コントロールチェンジ（音量・定位など）" + (cnt.cc - cnt.sus) + " 個"); }
    if (cnt.bend) { skipped.push("ピッチベンド " + cnt.bend + " 個"); }
    if (cnt.at) { skipped.push("アフタータッチ " + cnt.at + " 個"); }
    if (cnt.sysex) { skipped.push("SysEx " + cnt.sysex + " 個"); }
    if (cnt.lyric) { skipped.push("歌詞 " + cnt.lyric + " 個"); }
    if (cnt.marker) { skipped.push("マーカー " + cnt.marker + " 個（セクションにはしません）"); }
    if (cnt.text) { skipped.push("テキスト " + cnt.text + " 個"); }
    if (cnt.key) { skipped.push("調号 " + cnt.key + " 個"); }
    if (cnt.meta) { skipped.push("そのほかのメタイベント " + cnt.meta + " 個"); }
    if (cnt.chunk) { skipped.push("知らない種類のチャンク " + cnt.chunk + " 個（飛ばしました）"); }
    if (cnt.overlap) { notices.push("同じ高さの音の重なり " + cnt.overlap + " か所（先に始まった音から順に終わらせました）"); }
    if (cnt.open) { notices.push("終わり（Note Off）の無い音 " + cnt.open + " 個（トラックの終わりまで伸ばしました）"); }
    if (cnt.orphan) { notices.push("始まりの無い Note Off " + cnt.orphan + " 個（無視しました）"); }
    if (cnt.noEot) { notices.push("End of Track の無いトラック " + cnt.noEot + " 本（トラックの終わりまで読みました）"); }
    if (r.format === 0 && r.trks.length !== 1) { notices.push("Format 0 なのにトラックが " + r.trks.length + " 本あります（全部読みました）"); }
    if (r.ntrks !== r.trks.length) { notices.push("ヘッダーのトラック数（" + r.ntrks + "）と、実際のトラック（" + r.trks.length + "）がちがいます"); }
    var base = String(fileName || "MIDI").replace(/\.(mid|midi|smf)$/i, "").replace(/[\u0000-\u001f\u007f]/g, "").replace(/^\s+|\s+$/g, "").substring(0, 40) || "MIDI";
    return { ok: true, file: str(String(fileName || ""), "", 80), name: base, format: r.format, division: div, trks: r.trks.length, notes: total, bpm: bpm, meter: { num: mnum, den: mden }, len: len, bars: bars,
      sec: Math.round(len / PPQ * 60 / bpm * 10) / 10, tempoChanges: tempoChanges, meterChanges: meterChanges, parts: parts, skipped: skipped, notices: notices };
  }
  // ドラムのパートの音符（GM の 35〜81 はそのまま・ほかは入れない・長さ 0）→ { notes, drop: { 番号: 数 } }
  function midiDrumNotes(notes) {
    var o = [], drop = {}, i;
    for (i = 0; i < notes.length; i++) { var m = notes[i][2]; if (m < MIDI_DRUM_LO || m > MIDI_DRUM_HI) { drop[m] = (drop[m] || 0) + 1; continue; } o.push([notes[i][0], 0, m, notes[i][3]]); }
    return { notes: o, drop: drop };
  }
  // 確認の画面の選び方 → importPlan に渡す箱（受け取り箱と同じ形・保存はしない）。kinds: { パートの key: "drum" ／ "synth" }
  function midiBox(info, kinds, id) {
    var parts = [], drops = [], i;
    for (i = 0; i < info.parts.length; i++) {
      var pt = info.parts[i], drum = kinds && kinds[pt.key] ? kinds[pt.key] === "drum" : pt.drum;
      if (drum) {
        var dn = midiDrumNotes(pt.notes), k, dl = [];
        for (k in dn.drop) { if (dn.drop.hasOwnProperty(k)) { dl.push("番号 " + k + "（" + dn.drop[k] + " 個）"); } }
        if (dl.length) { drops.push({ key: pt.key, name: pt.name, text: dl.join("・"), n: pt.notes.length - dn.notes.length }); }
        parts.push({ key: pt.key, name: pt.name, preset: "drum", notes: dn.notes });
      } else { parts.push({ key: pt.key, name: pt.name, preset: pt.preset, notes: pt.notes }); }
    }
    return { box: { id: id || ("m" + Date.now().toString(36)), from: "midi", name: info.name, bpm: info.bpm, meter: info.meter.num, len: info.len, parts: parts, skipped: [], tempoRows: info.tempoChanges.length }, drops: drops };
  }
  // 新しい曲（ファイルの BPM・拍子）
  function midiNewProject(info) {
    var p = newProject({ name: info.name, bpm: info.bpm, meter: info.meter.num });
    p.tempo.meters[0].den = info.meter.den;
    return p;
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
    addAudioClip: addAudioClip, audioEvents: audioEvents, audioSpan: audioSpan, setAudioEdit: setAudioEdit, clipAssets: clipAssets, takesOf: takesOf, activeTakeId: activeTakeId, addTake: addTake, selectTake: selectTake, removeTake: removeTake, takeRoomWhy: takeRoomWhy, MAX_TAKES: MAX_TAKES,
    SECTION_NAMES: SECTION_NAMES, SECTION_COLORS: SECTION_COLORS, MAX_SECTIONS: MAX_SECTIONS, MAX_CLIPS_PER_TRACK: MAX_CLIPS_PER_TRACK, REPEAT_MAX: REPEAT_MAX, sectionsOf: sectionsOf, findSection: findSection, addSection: addSection, updateSection: updateSection, deleteSection: deleteSection, sectionRange: sectionRange,
    repeatPlan: repeatPlan, repeatClip: repeatClip, clipsInSection: clipsInSection, sectionCopyPlan: sectionCopyPlan, copySection: copySection,
    DRUM_NAMES: DRUM_NAMES, DRUM_SILENT: DRUM_SILENT, drumName: drumName, // 9B-3
    MIDI_MAX_BYTES: MIDI_MAX_BYTES, MIDI_MAX_EVENTS: MIDI_MAX_EVENTS, MIDI_MAX_NOTES: MIDI_MAX_NOTES, MIDI_MAX_MS: MIDI_MAX_MS, MIDI_DRUM_LO: MIDI_DRUM_LO, MIDI_DRUM_HI: MIDI_DRUM_HI, DRUM_GM: DRUM_GM, GM_DRUM_NAMES: GM_DRUM_NAMES, MIDI_PRESET_GM: MIDI_PRESET_GM, // 9B-4
    midiExport: midiExport, midiParse: midiParse, midiRead: midiRead, midiBox: midiBox, midiDrumNotes: midiDrumNotes, midiNewProject: midiNewProject, midiGmPreset: midiGmPreset,
    takePayload: takePayload, takeCheck: takeCheck, takeSend: takeSend, // 9B-5
    patchPreset: patchPreset, patchInstrument: patchInstrument, INBOX_PATCH_MAX: INBOX_PATCH_MAX, // 9B-7
    FX_EQ: FX_EQ, FX_COMP: FX_COMP, FX_BANDS: FX_BANDS, FX_KNEE: FX_KNEE, fxClean: fxClean, fxOf: fxOf, fxLive: fxLive, fxBoost: fxBoost, fxSet: fxSet, fxReset: fxReset, fxAutoMakeup: fxAutoMakeup, // 9B-8
    AUTO_TARGETS: AUTO_TARGETS, AUTO_ORDER: AUTO_ORDER, AUTO_MAX_POINTS: AUTO_MAX_POINTS, autoClean: autoClean, autoLane: autoLane, autoActive: autoActive, autoMoves: autoMoves, autoValueAt: autoValueAt, autoAnchors: autoAnchors, autoNorm: autoNorm, autoReal: autoReal, autoTickAt: autoTickAt, autoSet: autoSet, autoDel: autoDel, autoOn: autoOn, autoClear: autoClear, autoStatic: autoStatic, autoNow: autoNow, // 9B-9
    INBOX_KEY: INBOX_KEY, INBOX_TYPE: INBOX_TYPE, INBOX_DAYS: INBOX_DAYS, INBOX_MAX_BYTES: INBOX_MAX_BYTES, INBOX_FROM: INBOX_FROM, inboxClean: inboxClean, inboxMake: inboxMake, inboxRead: inboxRead, inboxWrite: inboxWrite, inboxClear: inboxClear, inboxUsed: inboxUsed, importPlan: importPlan, importApply: importApply, // 9B-2
    compOf: compOf, audioSegs: audioSegs, setComp: setComp, takeView: takeView, compDefaultAt: compDefaultAt, compRaw: compRaw, compMerge: compMerge, COMP_XF: COMP_XF, COMP_MIN: COMP_MIN, COMP_GAP: COMP_GAP, COMP_MAX_SECS: COMP_MAX_SECS, NUDGE_MAX: NUDGE_MAX, FADE_MAX: FADE_MAX, computePeaks: computePeaks, cleanAsset: cleanAsset
  };
})();
