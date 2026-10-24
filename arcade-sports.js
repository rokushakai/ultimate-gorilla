// =========================================================
// 究極ゴリラ ゲームセンター: スポーツのゲーム（§167〜）
//   ⚾ ゴリラバッティングセンター
// arcade.js の後に読み込む。土台の機能は window.UGArcade.internal から使う。
// =========================================================
(function () {
  "use strict";

  var I = window.UGArcade && window.UGArcade.internal;
  if (!I) { return; }
  var W = I.W, randInt = I.randInt, clamp = I.clamp, hudText = I.hudText, emojiAt = I.emojiAt;

  // ---------------------------------------------------------
  // ⚾ ゴリラバッティングセンター
  // ---------------------------------------------------------
  var BAT_PITCHES = 20;
  var BAT_MACHINES = [
    { id: "slow", name: "&#x1F422; ゆっくり", note: "80〜95km/h・ストレートだけ", min: 80, max: 95, mix: { straight: 1 } },
    { id: "normal", name: "&#x26BE; ふつう", note: "100〜125km/h・たまにスロー", min: 100, max: 125, mix: { straight: 0.8, slow: 0.2 } },
    { id: "fast", name: "&#x1F525; はやい", note: "130〜150km/h・チェンジアップあり", min: 130, max: 150, mix: { straight: 0.75, change: 0.25 } },
    { id: "mix", name: "&#x1F300; 変化球ミックス", note: "90〜140km/h・カーブ・フォーク・チェンジアップ", min: 90, max: 140, mix: { straight: 0.4, curve: 0.25, fork: 0.2, change: 0.15 } }
  ];
  var BAT_PITCH_NAMES = { straight: "ストレート", slow: "スローボール", change: "チェンジアップ", curve: "カーブ", fork: "フォーク" };
  // タイミングのずれ（フレーム）→ 結果
  var BAT_GRADES = [
    { max: 1, id: "hr", name: "HOME RUN!", pts: 100, hit: true },
    { max: 3, id: "long", name: "長打！", pts: 50, hit: true },
    { max: 5, id: "hit", name: "ヒット！", pts: 30, hit: true },
    { max: 7, id: "foul", name: "ファウル", pts: 0, hit: false }
  ];
  var BAT_PLATE_Y = 272, BAT_RELEASE_Y = 74;

  function batMachine(id) {
    for (var i = 0; i < BAT_MACHINES.length; i++) { if (BAT_MACHINES[i].id === id) { return BAT_MACHINES[i]; } }
    return BAT_MACHINES[1];
  }
  // 球速(km/h) → ベースに届くまでのフレーム数
  function batFrames(kmh) { return Math.round(5040 / kmh); }
  // ずれ diff（＋は早い・−は遅い）→ BAT_GRADES の1つ / null（空振り）
  function batGrade(diff) {
    var a = Math.abs(diff);
    for (var i = 0; i < BAT_GRADES.length; i++) { if (a <= BAT_GRADES[i].max) { return BAT_GRADES[i]; } }
    return null;
  }
  function batPickType(m, r) {
    var acc = 0;
    for (var k in m.mix) {
      if (!m.mix.hasOwnProperty(k)) { continue; }
      acc += m.mix[k];
      if (r < acc) { return k; }
    }
    return "straight";
  }
  // 1球つくる（rnd は 0〜1 を返す関数）
  function batMakePitch(m, rnd) {
    var type = batPickType(m, rnd());
    var kmh = Math.round(m.min + (m.max - m.min) * rnd());
    if (type === "slow") { kmh = Math.round(kmh * 0.7); }
    if (type === "change") { kmh = Math.round(kmh * 0.78); }
    if (type === "curve") { kmh = Math.round(kmh * 0.85); }
    return { type: type, kmh: kmh, frames: batFrames(kmh), drift: type === "curve" ? (rnd() < 0.5 ? -26 : 26) : (rnd() - 0.5) * 8 };
  }
  // 飛んだ方向（−1 左〜＋1 右）と距離(m)
  function batFlight(grade, diff, rnd) {
    var dir = clamp(-diff / 6, -1, 1);
    var dist = grade.id === "hr" ? 110 + Math.round(rnd() * 30) : (grade.id === "long" ? 80 + Math.round(rnd() * 25) : (grade.id === "hit" ? 40 + Math.round(rnd() * 35) : 30 + Math.round(rnd() * 30)));
    if (grade.id === "foul") { dir = diff > 0 ? -1.6 : 1.6; }
    return { dir: dir, dist: dist };
  }
  function batSound(cfg, kind) {
    if (!cfg.sound || !window.UGMelody) { return; }
    var ac = window.UGMelody.audioInit();
    if (!ac) { return; }
    try {
      if (kind === "hit") { window.UGMelody.drum(ac, 76, ac.currentTime, 1); window.UGMelody.drum(ac, 75, ac.currentTime + 0.01, 0.7); }
      if (kind === "hr") { window.UGMelody.drum(ac, 49, ac.currentTime + 0.05, 0.6); }
      if (kind === "foul") { window.UGMelody.drum(ac, 77, ac.currentTime, 0.6); }
    } catch (e) {}
  }

  function batSetup(root, ctl) {
    var html = '<div class="melody-setup"><h3 style="margin:0 0 4px;">&#x26BE; ゴリラバッティングセンター</h3>' +
      '<p class="small" style="color:#adb5bd;margin:0 0 8px;">ゴリラマシンが' + BAT_PITCHES + '球投げるよ。ボールがベースに来た瞬間にタップしてスイング！ ぴったりならホームラン。早いと左へ、遅いと右へ飛ぶ。</p>';
    for (var i = 0; i < BAT_MACHINES.length; i++) {
      html += '<button class="modal-btn" data-m="' + BAT_MACHINES[i].id + '" style="width:100%;">' + BAT_MACHINES[i].name +
        '<br><span class="small" style="color:inherit;opacity:0.75;">' + BAT_MACHINES[i].note + '</span></button>';
    }
    html += '<button class="modal-btn" data-m="back" style="width:100%;margin-top:14px;">&#x1F579;&#xFE0F; メニューへ</button></div>';
    root.innerHTML = html;
    var btns = root.querySelectorAll("button[data-m]");
    for (i = 0; i < btns.length; i++) {
      btns[i].onclick = function (ev) {
        var v = ev.currentTarget.getAttribute("data-m");
        if (v === "back") { ctl.back(); } else { ctl.done({ machine: v, sound: !!ctl.soundEnabled }); }
      };
    }
  }

  I.register({
    id: "batting",
    after: "defense",
    cat: "action",
    name: "ゴリラバッティングセンター",
    icon: "&#x26BE;",
    desc: "ゴリラマシンの20球をタイミングよく打ち返せ！ホームランをねらおう",
    help: "画面タップ / スイングボタン / Space でスイング。ボールがベース（下の白い五角形）に来た瞬間に振る / P一時停止",
    controls: [{ action: "swing", label: "&#x26BE; スイング" }],
    keys: { " ": "swing", "Enter": "swing", "ArrowUp": "swing", "z": "swing", "Z": "swing" },
    setup: batSetup,
    setupLabel: "マシンを変える",
    create: function (api, cfg) {
      cfg = cfg || {};
      var m = batMachine(cfg.machine), rnd = Math.random;
      var phase = "wait", t = 0, left = BAT_PITCHES, pitch = null, swung = false, swingT = 0;
      var result = null, streak = 0, hrs = 0, hits = 0, flash = 0;

      function nextPitch() {
        if (left <= 0) {
          api.gameOver("おつかれさま！");
          return;
        }
        phase = "windup";
        t = 0;
        swung = false;
        pitch = batMakePitch(m, rnd);
      }
      function finish(res) {
        result = res;
        phase = "result";
        t = 0;
        left--;
      }
      function ballProgress() { return pitch ? t / pitch.frames : 0; }
      function ballPos(p) {
        var y = BAT_RELEASE_Y + (BAT_PLATE_Y - BAT_RELEASE_Y) * (0.35 * p + 0.65 * p * p);
        if (pitch.type === "fork") { y += 14 * Math.pow(Math.max(0, p - 0.6) / 0.4, 3); }
        return { x: W / 2 + pitch.drift * p * p, y: y, r: 2 + 5 * Math.min(1.2, p) };
      }
      function swing() {
        if (swungAnim()) { return; }
        swingT = 14;
        if (phase !== "pitch" || swung) { return; }
        swung = true;
        var diff = pitch.frames - t, g = batGrade(diff);
        if (!g) { streak = 0; batSound(cfg, "miss"); finish({ id: "miss", name: "空振り…", diff: diff }); return; }
        var fl = batFlight(g, diff, rnd), pts = g.pts;
        if (g.hit) {
          streak++;
          if (streak >= 2) { pts += Math.min(50, 10 * (streak - 1)); }
          hits++;
          if (g.id === "hr") { hrs++; flash = 60; }
        } else { streak = 0; }
        api.addScore(pts);
        batSound(cfg, g.hit ? "hit" : "foul");
        if (g.id === "hr") { batSound(cfg, "hr"); }
        finish({ id: g.id, name: g.name, diff: diff, pts: pts, dir: fl.dir, dist: fl.dist, hit: g.hit });
      }
      function swungAnim() { return swingT > 0; }

      return {
        input: function (action, down) { if (down && action === "swing") { swing(); } },
        pointer: function (type) { if (type === "down") { swing(); } },
        step: function () {
          t++;
          if (swingT > 0) { swingT--; }
          if (flash > 0) { flash--; }
          if (phase === "wait") { if (t >= 50) { nextPitch(); } return; }
          if (phase === "windup") { if (t >= 36) { phase = "pitch"; t = 0; } return; }
          if (phase === "pitch") {
            // ベースを過ぎても振らなければ見逃し（遅すぎる空振りの判定の余地として少し待つ）
            if (t > pitch.frames + 8) {
              streak = 0;
              finish(swung ? { id: "miss", name: "空振り…" } : { id: "look", name: "見逃し" });
            }
            return;
          }
          if (phase === "result" && t >= (result && result.hit ? 90 : 55)) { phase = "wait"; t = 0; pitch = null; result = null; }
        },
        draw: function (ctx) {
          var i;
          // 背景: 夜のバッティングセンター（ネットと照明）
          ctx.fillStyle = "#0b1d3a";
          ctx.fillRect(0, 0, W, 320);
          ctx.fillStyle = flash > 0 && Math.floor(flash / 6) % 2 === 0 ? "#ffd166" : "#1d3557";
          ctx.fillRect(70, 10, 100, 22);
          ctx.fillStyle = flash > 0 ? "#05060f" : "#ffd166";
          ctx.font = "bold 11px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("🦍 HOME RUN 🍌", W / 2, 21);
          ctx.strokeStyle = "rgba(255,255,255,0.08)";
          ctx.lineWidth = 1;
          for (i = 0; i <= W; i += 16) { ctx.beginPath(); ctx.moveTo(i, 36); ctx.lineTo(W / 2 + (i - W / 2) * 0.3, 0); ctx.stroke(); }
          // 地面
          ctx.fillStyle = "#2d6a4f";
          ctx.beginPath(); ctx.moveTo(W / 2 - 30, 60); ctx.lineTo(W / 2 + 30, 60); ctx.lineTo(W, 300); ctx.lineTo(0, 300); ctx.closePath(); ctx.fill();
          ctx.fillStyle = "#b08968";
          ctx.beginPath(); ctx.moveTo(W / 2 - 10, 64); ctx.lineTo(W / 2 + 10, 64); ctx.lineTo(W / 2 + 60, 300); ctx.lineTo(W / 2 - 60, 300); ctx.closePath(); ctx.fill();
          // マシン（ゴリラ）
          var wind = phase === "windup" ? Math.sin(t / 36 * Math.PI) : 0;
          emojiAt(ctx, "🦍", W / 2, 58 - wind * 6, 26);
          ctx.fillStyle = "#636e72";
          ctx.fillRect(W / 2 - 6, 70, 12, 6);
          // ホームベース
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.moveTo(W / 2 - 14, BAT_PLATE_Y + 4); ctx.lineTo(W / 2 + 14, BAT_PLATE_Y + 4); ctx.lineTo(W / 2 + 14, BAT_PLATE_Y + 10);
          ctx.lineTo(W / 2, BAT_PLATE_Y + 16); ctx.lineTo(W / 2 - 14, BAT_PLATE_Y + 10); ctx.closePath(); ctx.fill();
          // 打つところの目安
          ctx.strokeStyle = "rgba(255,209,102,0.5)";
          ctx.setLineDash([3, 3]);
          ctx.strokeRect(W / 2 - 24, BAT_PLATE_Y - 12, 48, 20);
          ctx.setLineDash([]);
          // ボール
          if (pitch && phase === "pitch") {
            var bp = ballPos(ballProgress());
            ctx.fillStyle = "rgba(0,0,0,0.3)";
            ctx.beginPath(); ctx.ellipse(bp.x, Math.min(300, bp.y + 6 + bp.r), bp.r, bp.r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "#ffffff";
            ctx.beginPath(); ctx.arc(bp.x, bp.y, bp.r, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = "#e17055";
            ctx.lineWidth = 0.8;
            ctx.beginPath(); ctx.arc(bp.x - bp.r * 0.5, bp.y, bp.r * 0.7, -0.9, 0.9); ctx.stroke();
          }
          // 打球
          if (phase === "result" && result && result.dir !== undefined) {
            var q = Math.min(1, t / 60);
            var fx = W / 2 + result.dir * 100 * q, fy = BAT_PLATE_Y - (BAT_PLATE_Y - 40) * q * Math.min(1, result.dist / 110) - Math.sin(q * Math.PI) * 50;
            ctx.fillStyle = "#ffffff";
            ctx.beginPath(); ctx.arc(fx, fy, Math.max(1.5, 6 - 4.5 * q), 0, Math.PI * 2); ctx.fill();
          }
          // バット（右打ち・キャッチャー側から見た図）
          var sw = swingT > 0 ? 1 - swingT / 14 : 0;
          var ang = -2.3 + sw * 3.2, bx = W / 2 - 34, by = BAT_PLATE_Y + 10;
          ctx.strokeStyle = "#d4a373";
          ctx.lineWidth = 5;
          ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(ang) * 46, by + Math.sin(ang) * 46); ctx.stroke();
          ctx.lineCap = "butt";
          // 表示
          if (pitch && (phase === "pitch" || phase === "result")) {
            hudText(ctx, pitch.kmh + "km/h " + BAT_PITCH_NAMES[pitch.type], W - 6, 46, "right");
          }
          if (phase === "result" && result) {
            ctx.fillStyle = result.id === "hr" ? "#ffd166" : (result.hit ? "#55efc4" : "#ff7675");
            ctx.font = "bold " + (result.id === "hr" ? 26 : 20) + "px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(result.name, W / 2, 150);
            var sub = "";
            if (result.dist !== undefined && result.hit) { sub = result.dist + "m  +" + result.pts; }
            if (result.diff !== undefined) {
              var tm = result.diff > 1 ? "はやい" : (result.diff < -1 ? "おそい" : "ジャスト");
              sub = (sub ? sub + "  " : "") + tm;
            }
            if (sub) { hudText(ctx, sub, W / 2, 176, "center"); }
            if (streak >= 2 && result.hit) { hudText(ctx, streak + "連続ヒット！", W / 2, 194, "center"); }
          }
          if (phase === "wait" && left > 0) { hudText(ctx, "次の球…", W / 2, 150, "center"); }
          hudText(ctx, "のこり " + left + "球   HR " + hrs + "   ヒット " + hits, 6, 310);
          hudText(ctx, m.name.replace(/&#x[0-9A-F]+;\s*/i, ""), 6, 46);
        }
      };
    }
  });

  // テスト・他ファイル用の読み取り口
  window.UGSports = {
    batFrames: batFrames, batGrade: batGrade, batMakePitch: batMakePitch, batFlight: batFlight, machines: BAT_MACHINES, pitches: BAT_PITCHES
  };
})();
