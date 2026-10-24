// =========================================================
// 究極ゴリラ ゲームセンター: 🎸 ゴリラウクレレ（§167）
//   左手で指板を押さえ、右手でサウンドホールの上をスワイプして鳴らす練習ゲーム
// arcade.js・arcade-melody.js の後に読み込む。音は window.UGMelody（ナイロンギターの音色）を使う。
// =========================================================
(function () {
  "use strict";

  var I = window.UGArcade && window.UGArcade.internal;
  if (!I) { return; }
  var W = I.W, randInt = I.randInt, hudText = I.hudText, lsGet = I.lsGet, lsSet = I.lsSet;

  var UKE_PREFS_KEY = "ultimateGorillaUkulelePrefsV1";
  var UKE_PROG = 24; // GM 025 Acoustic Guitar (nylon)
  var UKE_STRINGS = ["G", "C", "E", "A"];
  var UKE_OPEN = [67, 60, 64, 69], UKE_OPEN_LOWG = 55;
  var UKE_STRX = [54, 98, 142, 186], UKE_NUT_Y = 44, UKE_FRETS = 6, UKE_FH = 28;
  var UKE_STRUM_Y = 218, UKE_HOLE_Y = 266, UKE_TIME = 3600, UKE_STRUM_WINDOW = 24;
  var NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

  // 押さえ方は [G, C, E, A] の各弦のフレット（0 = 開放）
  var UKE_CHORDS = {
    easy: [
      { name: "C", shape: [0, 0, 0, 3] }, { name: "Am", shape: [2, 0, 0, 0] }, { name: "F", shape: [2, 0, 1, 0] },
      { name: "G7", shape: [0, 2, 1, 2] }, { name: "C7", shape: [0, 0, 0, 1] }, { name: "A7", shape: [0, 1, 0, 0] },
      { name: "Am7", shape: [0, 0, 0, 0] }
    ],
    normal: [
      { name: "G", shape: [0, 2, 3, 2] }, { name: "Dm", shape: [2, 2, 1, 0] }, { name: "Em", shape: [0, 4, 3, 2] },
      { name: "D", shape: [2, 2, 2, 0] }, { name: "A", shape: [2, 1, 0, 0] }, { name: "Em7", shape: [0, 2, 0, 2] },
      { name: "Dm7", shape: [2, 2, 1, 3] }, { name: "E7", shape: [1, 2, 0, 2] }, { name: "D7", shape: [2, 2, 2, 3] },
      { name: "Gm", shape: [0, 2, 3, 1] }, { name: "Cmaj7", shape: [0, 0, 0, 2] }
    ],
    hard: [
      { name: "B♭", shape: [3, 2, 1, 1] }, { name: "E", shape: [4, 4, 4, 2] }, { name: "B7", shape: [2, 3, 2, 2] },
      { name: "Cm", shape: [0, 3, 3, 3] }, { name: "Fm", shape: [1, 0, 1, 3] }, { name: "Bm", shape: [4, 2, 2, 2] },
      { name: "F#m", shape: [2, 1, 2, 0] }, { name: "E♭", shape: [0, 3, 3, 1] }
    ]
  };
  var UKE_MODES = [
    { id: "free", name: "&#x1F3B5; フリー演奏", note: "時間制限なし。自由に弾こう" },
    { id: "easy", name: "&#x1F530; コード練習 やさしい", note: "C・Am・F・G7 など7つ（お手本あり・60秒）" },
    { id: "normal", name: "&#x1F3B8; コード練習 ふつう", note: "＋G・Dm・Em・D・E7 など（お手本あり・60秒）" },
    { id: "hard", name: "&#x1F525; コード練習 むずかしい", note: "＋B♭・E・Bm・F#m など（コード名だけ・60秒）" }
  ];

  // そのモードで出るコード
  function ukeChordSet(mode) {
    var out = UKE_CHORDS.easy.slice();
    if (mode === "normal" || mode === "hard") { out = out.concat(UKE_CHORDS.normal); }
    if (mode === "hard") { out = out.concat(UKE_CHORDS.hard); }
    return out;
  }
  // 押さえ方 → コード名（知らない押さえ方は ""）
  var UKE_INDEX = {};
  (function () {
    var all = ukeChordSet("hard");
    for (var i = 0; i < all.length; i++) { UKE_INDEX[all[i].shape.join(",")] = all[i].name; }
  })();
  function ukeChordName(frets) { return UKE_INDEX[frets.join(",")] || ""; }
  function ukeMidi(s, fret, lowG) { return (s === 0 && lowG ? UKE_OPEN_LOWG : UKE_OPEN[s]) + fret; }
  function ukeNoteName(midi) { return NOTE_NAMES[((midi % 12) + 12) % 12]; }
  // 指板の座標 → { s: 弦, f: フレット } / null
  function ukeCellAt(x, y) {
    if (y < UKE_NUT_Y - 4 || y > UKE_NUT_Y + UKE_FRETS * UKE_FH + 4) { return null; }
    var best = -1, bd = 23;
    for (var s = 0; s < 4; s++) { var d = Math.abs(x - UKE_STRX[s]); if (d < bd) { bd = d; best = s; } }
    if (best < 0) { return null; }
    var f = Math.floor((y - UKE_NUT_Y) / UKE_FH) + 1;
    return { s: best, f: Math.max(1, Math.min(UKE_FRETS, f)) };
  }
  // x0 → x1 へ動いたときに通った弦（通った順）
  function ukeCrossed(x0, x1) {
    var out = [], s;
    if (x1 > x0) { for (s = 0; s < 4; s++) { if (x0 < UKE_STRX[s] && x1 >= UKE_STRX[s]) { out.push(s); } } }
    else if (x1 < x0) { for (s = 3; s >= 0; s--) { if (x0 > UKE_STRX[s] && x1 <= UKE_STRX[s]) { out.push(s); } } }
    return out;
  }
  // 押さえている場所の一覧 [{s, f}] → 各弦の鳴るフレット（いちばん高いフレット）
  function ukeFrets(presses) {
    var out = [0, 0, 0, 0];
    for (var i = 0; i < presses.length; i++) { if (presses[i].f > out[presses[i].s]) { out[presses[i].s] = presses[i].f; } }
    return out;
  }

  function ukeSetup(root, ctl) {
    var prefs = lsGet(UKE_PREFS_KEY) || {};
    var html = '<div class="melody-setup"><h3 style="margin:0 0 4px;">&#x1F3B8; ゴリラウクレレ</h3>' +
      '<p class="small" style="color:#adb5bd;margin:0 0 8px;">左手で指板（上）を押さえたまま、右手でサウンドホール（下の丸）の上を横にスワイプ。通った弦が順番に鳴るよ。押さえる場所はコード表と同じ向き（左から G・C・E・A）。</p>';
    for (var i = 0; i < UKE_MODES.length; i++) {
      html += '<button class="modal-btn" data-m="' + UKE_MODES[i].id + '" style="width:100%;">' + UKE_MODES[i].name +
        '<br><span class="small" style="color:inherit;opacity:0.75;">' + UKE_MODES[i].note + '</span></button>';
    }
    html += '<div class="melody-checks"><label><input type="checkbox" data-p="lowG"' + (prefs.lowG ? " checked" : "") + '> Low-G（4弦のGを1オクターブ低く）</label></div>' +
      '<button class="modal-btn" data-m="back" style="width:100%;margin-top:8px;">&#x1F579;&#xFE0F; メニューへ</button></div>';
    root.innerHTML = html;
    var lowEl = root.querySelector('input[data-p="lowG"]');
    var btns = root.querySelectorAll("button[data-m]");
    for (i = 0; i < btns.length; i++) {
      btns[i].onclick = function (ev) {
        var v = ev.currentTarget.getAttribute("data-m");
        if (v === "back") { ctl.back(); return; }
        var lowG = !!(lowEl && lowEl.checked);
        lsSet(UKE_PREFS_KEY, { lowG: lowG });
        ctl.done({ mode: v, lowG: lowG, sound: true });
      };
    }
  }

  I.register({
    id: "ukulele",
    after: "lyrics",
    cat: "music",
    music: true,
    name: "ゴリラウクレレ",
    icon: "&#x1F3B8;",
    desc: "左手で押さえて右手でジャカジャン！本物の押さえ方でコード練習",
    help: "指板を押さえたまま、下の丸の上を横にスワイプで鳴らす / 弦をタップで1本だけ / マウスはクリックで押さえる・はなす / Space ジャラーン・1〜4 で1本ずつ / P一時停止",
    controls: [
      { action: "strum", label: "&#x1F3B6; ジャラーン" },
      { action: "clear", label: "&#x270B; はなす" }
    ],
    keys: { " ": "strum", "1": "p0", "2": "p1", "3": "p2", "4": "p3", "Backspace": "clear" },
    setup: ukeSetup,
    setupLabel: "モードを変える",
    create: function (api, cfg) {
      cfg = cfg || {};
      var mode = cfg.mode || "free", practice = mode !== "free", lowG = !!cfg.lowG;
      var fingers = {}, sticky = {}, strums = {}, ring = [0, 0, 0, 0], lastPluck = [-999, -999, -999, -999];
      var frames = 0, chordT = 0, target = null, set = ukeChordSet(mode), correct = 0, ended = false;
      var msg = "", msgT = 0, msgGood = false, wrong = null, wrongT = 0;
      var UG = window.UGMelody, ac = null;

      if (UG && cfg.sound !== false) {
        ac = UG.audioInit();
        try { UG.loadSamples([UKE_PROG]); } catch (e) {}
      }
      function presses() {
        var out = [], k;
        for (k in fingers) { if (fingers.hasOwnProperty(k) && fingers[k]) { out.push(fingers[k]); } }
        for (k in sticky) { if (sticky.hasOwnProperty(k)) { out.push(sticky[k]); } }
        return out;
      }
      function current() { return ukeFrets(presses()); }
      function nextChord() {
        if (!practice) { return; }
        var n;
        do { n = set[randInt(0, set.length - 1)]; } while (set.length > 1 && target && n.name === target.name);
        target = n;
        chordT = 0;
      }
      function sound(s, delay) {
        if (!UG || !ac) { return; }
        var midi = ukeMidi(s, current()[s], lowG);
        try { UG.synth(midi, UKE_PROG, ac.currentTime + (delay || 0), 0.85); } catch (e) {}
      }
      function judge() {
        if (!practice || ended || !target) { return; }
        var cur = current(), bad = [], i;
        for (i = 0; i < 4; i++) { if (cur[i] !== target.shape[i]) { bad.push(i); } }
        if (!bad.length) {
          var pts = 100 + Math.max(0, 50 - Math.floor(chordT / 60) * 5);
          api.addScore(pts);
          correct++;
          msg = "◎ " + target.name + "  +" + pts;
          msgGood = true;
          msgT = 50;
          wrong = null;
          nextChord();
        } else {
          msg = "おしい！";
          msgGood = false;
          msgT = 50;
          wrong = bad;
          wrongT = 60;
        }
      }
      function pluck(s, delay) {
        sound(s, delay);
        ring[s] = 30;
        lastPluck[s] = frames;
        // 4本がまとまって鳴ったら「ストローク」として判定
        for (var i = 0; i < 4; i++) { if (frames - lastPluck[i] > UKE_STRUM_WINDOW) { return; } }
        lastPluck = [-999, -999, -999, -999];
        judge();
      }
      function strumAll() { for (var s = 0; s < 4; s++) { pluck(s, s * 0.025); } }

      nextChord();

      return {
        input: function (action, down) {
          if (!down) { return; }
          if (action === "strum") { strumAll(); }
          else if (action === "clear") { sticky = {}; }
          else if (action.charAt(0) === "p") { pluck(parseInt(action.substring(1), 10)); }
        },
        pointer: function (type, x, y, id, kind) {
          if (id === undefined) { id = "p"; }
          if (type === "down") {
            var cell = ukeCellAt(x, y);
            if (cell) {
              if (kind === "mouse") {
                var key = cell.s + "," + cell.f;
                if (sticky[key]) { delete sticky[key]; } else { sticky[key] = cell; }
              } else {
                fingers[id] = cell;
              }
              return;
            }
            if (y >= UKE_STRUM_Y) {
              var st = { lx: x };
              for (var s = 0; s < 4; s++) {
                if (Math.abs(x - UKE_STRX[s]) <= 8) { pluck(s); st.lx = UKE_STRX[s]; break; }
              }
              strums[id] = st;
            }
            return;
          }
          if (type === "move") {
            if (fingers[id]) {
              var c2 = ukeCellAt(x, y);
              if (c2) { fingers[id] = c2; }
              return;
            }
            if (strums[id]) {
              var cr = ukeCrossed(strums[id].lx, x);
              for (var k = 0; k < cr.length; k++) { pluck(cr[k]); }
              strums[id].lx = x;
            }
            return;
          }
          if (type === "up") {
            delete fingers[id];
            delete strums[id];
          }
        },
        step: function () {
          frames++;
          chordT++;
          for (var s = 0; s < 4; s++) { if (ring[s] > 0) { ring[s]--; } }
          if (msgT > 0) { msgT--; }
          if (wrongT > 0) { wrongT--; if (wrongT === 0) { wrong = null; } }
          if (practice && !ended && frames >= UKE_TIME) { ended = true; api.gameOver("TIME UP"); }
        },
        draw: function (ctx) {
          var s, f, i;
          var cur = current(), held = presses();
          // ボディと指板
          ctx.fillStyle = "#3b2414";
          ctx.fillRect(0, 0, W, 320);
          ctx.fillStyle = "#5c3a1e";
          ctx.fillRect(UKE_STRX[0] - 22, UKE_NUT_Y, UKE_STRX[3] - UKE_STRX[0] + 44, UKE_FRETS * UKE_FH);
          ctx.fillStyle = "#c68642";
          ctx.beginPath(); ctx.arc(W / 2, UKE_HOLE_Y, 70, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#1b0f07";
          ctx.beginPath(); ctx.arc(W / 2, UKE_HOLE_Y, 34, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "#e9c46a";
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(W / 2, UKE_HOLE_Y, 38, 0, Math.PI * 2); ctx.stroke();
          // ナット・フレット
          ctx.fillStyle = "#f1e4c8";
          ctx.fillRect(UKE_STRX[0] - 22, UKE_NUT_Y - 4, UKE_STRX[3] - UKE_STRX[0] + 44, 4);
          ctx.strokeStyle = "#c0c0c0";
          ctx.lineWidth = 1.5;
          for (f = 1; f <= UKE_FRETS; f++) {
            var fy = UKE_NUT_Y + f * UKE_FH;
            ctx.beginPath(); ctx.moveTo(UKE_STRX[0] - 22, fy); ctx.lineTo(UKE_STRX[3] + 22, fy); ctx.stroke();
          }
          ctx.fillStyle = "#f1e4c8";
          for (i = 0; i < 2; i++) {
            var mk = [3, 5][i];
            ctx.beginPath(); ctx.arc(W / 2, UKE_NUT_Y + (mk - 0.5) * UKE_FH, 3, 0, Math.PI * 2); ctx.fill();
          }
          ctx.fillStyle = "#e9c46a";
          ctx.font = "bold 9px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          for (f = 1; f <= UKE_FRETS; f++) { ctx.fillText(String(f), 14, UKE_NUT_Y + (f - 0.5) * UKE_FH); }
          // 弦（鳴っている弦は揺らす）
          for (s = 0; s < 4; s++) {
            ctx.strokeStyle = ring[s] > 0 ? "#ffd166" : "#e0e0e0";
            ctx.lineWidth = 1 + (3 - s) * 0.3;
            var amp = ring[s] > 0 ? (ring[s] / 30) * 2.2 : 0;
            ctx.beginPath();
            ctx.moveTo(UKE_STRX[s], UKE_NUT_Y);
            for (var yy = UKE_NUT_Y; yy <= 304; yy += 8) { ctx.lineTo(UKE_STRX[s] + Math.sin(yy / 6 + frames) * amp, yy); }
            ctx.stroke();
            ctx.fillStyle = "#e9c46a";
            ctx.fillText(UKE_STRINGS[s], UKE_STRX[s], UKE_NUT_Y - 11);
          }
          // お手本（練習モード: やさしい・ふつうはいつも、むずかしいは4秒後）
          if (target && (mode !== "hard" || chordT >= 240)) {
            ctx.strokeStyle = "rgba(116,185,255,0.95)";
            ctx.lineWidth = 2;
            for (s = 0; s < 4; s++) {
              if (target.shape[s] > 0) {
                ctx.beginPath(); ctx.arc(UKE_STRX[s], UKE_NUT_Y + (target.shape[s] - 0.5) * UKE_FH, 11, 0, Math.PI * 2); ctx.stroke();
              }
            }
          }
          // 押さえている指
          for (i = 0; i < held.length; i++) {
            var p = held[i], top = cur[p.s] === p.f;
            ctx.fillStyle = top ? "rgba(255,209,102,0.95)" : "rgba(255,209,102,0.45)";
            ctx.beginPath(); ctx.arc(UKE_STRX[p.s], UKE_NUT_Y + (p.f - 0.5) * UKE_FH, 9, 0, Math.PI * 2); ctx.fill();
          }
          // ちがう弦に ×
          if (wrong) {
            ctx.fillStyle = "#ff7675";
            ctx.font = "bold 14px sans-serif";
            for (i = 0; i < wrong.length; i++) { ctx.fillText("×", UKE_STRX[wrong[i]], UKE_NUT_Y + UKE_FRETS * UKE_FH + 10); }
          } else {
            // 各弦のいまの音名
            ctx.fillStyle = "#f1e4c8";
            ctx.font = "bold 10px sans-serif";
            for (s = 0; s < 4; s++) { ctx.fillText(ukeNoteName(ukeMidi(s, cur[s], lowG)), UKE_STRX[s], UKE_NUT_Y + UKE_FRETS * UKE_FH + 10); }
          }
          // 上の表示
          var name = ukeChordName(cur);
          ctx.textAlign = "left";
          if (practice && target) {
            hudText(ctx, "お題", 6, 9);
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 18px sans-serif";
            ctx.fillText(target.name, 34, 10);
            var remain = Math.max(0, Math.ceil((UKE_TIME - frames) / 60));
            hudText(ctx, "のこり " + remain + "秒  せいかい " + correct, W - 6, 9, "right");
            if (name) { hudText(ctx, "いま: " + name, W - 6, 22, "right"); }
          } else {
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 18px sans-serif";
            ctx.fillText(name || "♪", 8, 12);
            hudText(ctx, "フリー演奏" + (lowG ? "（Low-G）" : ""), W - 6, 9, "right");
          }
          if (msgT > 0) {
            ctx.fillStyle = msgGood ? "#55efc4" : "#ff7675";
            ctx.font = "bold 16px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(msg, W / 2, UKE_HOLE_Y);
          } else if (frames < 300 && !held.length) {
            hudText(ctx, "ここを横にスワイプ", W / 2, UKE_HOLE_Y, "center");
          }
        }
      };
    }
  });

  // テスト・他ファイル用の読み取り口
  window.UGUkulele = {
    chords: UKE_CHORDS, chordSet: ukeChordSet, chordName: ukeChordName, midi: ukeMidi, cellAt: ukeCellAt, crossed: ukeCrossed, frets: ukeFrets,
    STRX: UKE_STRX, NUT_Y: UKE_NUT_Y, FH: UKE_FH, STRUM_Y: UKE_STRUM_Y
  };
})();
