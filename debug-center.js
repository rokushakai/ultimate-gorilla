// 🛠️ デバッグセンター（§344 v2.73）: ?debug=1 の ⚙️ 設定にあるデバッグのボタンを、カテゴリと検索で見つける。
// いままでのボタン（ID・onclick）は script.js が作ったまま。ここでは見せる・隠すだけ（作りなおさない・動かさない・押さない）
(function () {
  "use strict";

  var CATS = [
    { id: "music", icon: "&#x1F3B5;", name: "音楽・DAW" },
    { id: "arcade", icon: "&#x1F3AE;", name: "ゲームセンター" },
    { id: "rpg", icon: "&#x2694;&#xFE0F;", name: "RPG・戦闘" },
    { id: "party", icon: "&#x1F465;", name: "仲間・装備" },
    { id: "save", icon: "&#x1F4BE;", name: "セーブ・データ" },
    { id: "sys", icon: "&#x1F527;", name: "システム・動作確認" },
    { id: "other", icon: "&#x1F4DA;", name: "その他・旧バージョン別テスト" }
  ];
  // 見出し（グループ）の文字 → カテゴリ（上から順に、最初に合うもの）。合わなければ other
  var RULES = [
    ["arcade", /ゲームセンター|メダル|ハイスコア/],
    ["music", /サウンド|BGM|音楽|DAW/],
    ["party", /仲間|まかせる|パーティ|装備|わざ|サイドストーリー|第[1-3]話|全話完了|命名|メンバー|王様|個人バッグ|固有コマンド|アルバム|戦闘UI|ショップ|特化/],
    ["rpg", /開発用テスト|横スクロール|ステージ|究極ゴリラ|ガマン|捕獲|クリア後|冒険|図鑑|NPC|ペーパービュー|ゲート|ゴール|フィールド|ワープ|案内|ストーリー/],
    ["sys", /安定化|監査|検証|モーダル/]
  ];
  // 💾 は、ボタンの名前で集める（どのグループからも。もとのグループにも残る）
  var SAVE_RE = /セーブ|ロード|リセット|フラグ|データ|メダルを0/;

  // 開いている画面（設定の画面が作りなおされても、そのまま）。view: "off"（通常の設定）| "top" | "cat"
  var S = { view: "off", cat: "", q: "", msg: "" };

  function classify(title) {
    var t = String(title || ""), i;
    for (i = 0; i < RULES.length; i++) { if (RULES[i][1].test(t)) { return RULES[i][0]; } }
    return "other";
  }
  function norm(s) {
    s = String(s || "");
    try { if (s.normalize) { s = s.normalize("NFKC"); } } catch (e) {}
    return s.toLowerCase();
  }
  // 検索: スペース（全角も）で区切った言葉を全部ふくむ。空なら false
  function matches(text, q) {
    var words = norm(q).split(/\s+/), t = norm(text), n = 0, i;
    for (i = 0; i < words.length; i++) {
      if (!words[i]) { continue; }
      n++;
      if (t.indexOf(words[i]) < 0) { return false; }
    }
    return n > 0;
  }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function catOf(id) { for (var i = 0; i < CATS.length; i++) { if (CATS[i].id === id) { return CATS[i]; } } return null; }
  function hasClass(el, c) { return (" " + (el.className || "") + " ").indexOf(" " + c + " ") >= 0; }
  function setClass(el, c, on) {
    if (!el) { return; }
    var has = hasClass(el, c);
    if (on && !has) { el.className = (el.className ? el.className + " " : "") + c; }
    else if (!on && has) { el.className = (" " + el.className + " ").replace(" " + c + " ", " ").replace(/^\s+|\s+$/g, ""); }
  }

  // #dbg-legacy の中を、見出し（ボタンでない要素）ごとのグループに分ける
  function scan(legacy) {
    var groups = [], cur = null, kids = legacy.children, i;
    for (i = 0; i < kids.length; i++) {
      var el = kids[i];
      if (String(el.tagName).toUpperCase() !== "BUTTON") {
        var title = (el.textContent || "").replace(/^\s+|\s+$/g, "");
        cur = { head: el, title: title, cat: classify(title), btns: [] };
        groups.push(cur);
        continue;
      }
      if (!cur) { cur = { head: null, title: "", cat: "other", btns: [] }; groups.push(cur); }
      cur.btns.push({ el: el, text: el.textContent || "" });
    }
    return groups;
  }
  // 💾 ＝ ボタンの名前で集める・📚 ＝ 全部を元の順で（どこにも合わない見出しもここ）・ほか ＝ 見出しのカテゴリ
  function btnIn(g, b, cat) { return cat === "save" ? SAVE_RE.test(b.text) : cat === "other" ? true : g.cat === cat; }
  function counts(groups) {
    var c = { all: 0 }, i, j;
    for (i = 0; i < CATS.length; i++) { c[CATS[i].id] = 0; }
    for (i = 0; i < groups.length; i++) {
      for (j = 0; j < groups[i].btns.length; j++) {
        c.all++;
        if (groups[i].cat !== "other") { c[groups[i].cat]++; }
        if (SAVE_RE.test(groups[i].btns[j].text)) { c.save++; }
      }
    }
    c.other = c.all; // 📚 は全部（元の順・版ごとの見出し）
    return c;
  }

  // ---------- 画面 ----------
  var M = null; // いま付いている設定の画面 { body, legacy, normal, open, box, foot, groups, api, modal }

  function topHtml(c) {
    var h = '<div class="dbgc-head"><b>&#x1F6E0;&#xFE0F; デバッグセンター</b><span class="small">ボタン ' + c.all + ' 個</span></div>' +
      '<button class="shop-menu-btn dbgc-back" data-dbgc="off">&#x25C0; 設定へ戻る</button>' +
      '<div class="dbgc-sub">よく使う入口</div>' +
      '<div class="dbgc-short">' +
        '<button class="shop-menu-btn dbgc-go" data-dbgc-go="daw">&#x1F39A;&#xFE0F; ゴリラDAWを開く</button>' +
        '<button class="shop-menu-btn dbgc-go" data-dbgc-go="arcade">&#x1F3AE; ゲームセンターを開く</button>' +
        '<button class="shop-menu-btn dbgc-go" data-dbgc-go="xmas">&#x1F384; クリスマス制作へ進む</button>' +
      '</div>' +
      '<div class="dbgc-msg" role="alert"' + (S.msg ? '' : ' hidden') + '>' + esc(S.msg) + '</div>' +
      '<div class="dbgc-sub">&#x1F50D; さがす（名前・見出し。押すまで何もしません）</div>' +
      '<div class="dbgc-search"><input type="search" class="dbgc-q" placeholder="例: メダル・Lv99・BGM" value="' + esc(S.q) + '" autocomplete="off" autocapitalize="off" spellcheck="false">' +
      '<button class="shop-menu-btn dbgc-clear" data-dbgc="clear" aria-label="検索を消す">&#x2716;</button></div>' +
      '<div class="dbgc-count small"></div>' +
      '<div class="dbgc-cats">';
    for (var i = 0; i < CATS.length; i++) {
      h += '<button class="shop-menu-btn dbgc-cat" data-dbgc-cat="' + CATS[i].id + '"><span class="dbgc-ci">' + CATS[i].icon + '</span><span class="dbgc-cn">' + CATS[i].name + '</span><span class="dbgc-cc">' + c[CATS[i].id] + '</span></button>';
    }
    return h + '</div>';
  }
  // 上に残るバー（#settings-body のすぐ下の段に置く。箱の中だと、その箱の外までは残らない）
  function barHtml() {
    var C = catOf(S.cat);
    return '<button class="shop-menu-btn dbgc-back" data-dbgc="top">&#x25C0; デバッグセンターのトップ</button>' +
      '<div class="dbgc-head"><b>' + C.icon + ' ' + C.name + '</b><span class="small dbgc-n"></span></div>';
  }
  function catHtml(groups) {
    var h = "", jumps = "", i, j;
    for (i = 0; i < groups.length; i++) {
      var any = false;
      for (j = 0; j < groups[i].btns.length; j++) { if (btnIn(groups[i], groups[i].btns[j], S.cat)) { any = true; } }
      if (any && groups[i].head) { jumps += '<button class="dbgc-jump" data-dbgc-jump="' + i + '">' + esc(groups[i].title) + '</button>'; }
    }
    if (jumps) { h += '<div class="dbgc-sub">見出しへジャンプ</div><div class="dbgc-jumps">' + jumps + '</div>'; }
    return h;
  }

  // ボタン・見出しを見せる／隠す（どれも押さない）。→ 見えるボタンの数
  function filter() {
    var gs = M.groups, n = 0, i, j, on = S.view === "cat" || (S.view === "top" && !!norm(S.q).replace(/\s+/g, ""));
    for (i = 0; i < gs.length; i++) {
      var g = gs[i], gn = 0;
      for (j = 0; j < g.btns.length; j++) {
        var b = g.btns[j], vis = on && (S.view === "cat" ? btnIn(g, b, S.cat) : matches(b.text + " " + g.title, S.q));
        setClass(b.el, "dbgc-hide", !vis);
        if (vis) { gn++; }
      }
      setClass(g.head, "dbgc-hide", !gn);
      n += gn;
    }
    setClass(M.legacy, "dbgc-show", on);
    setClass(M.foot, "dbgc-hide", !on);
    return n;
  }
  function searchUpdate() {
    var n = filter(), has = !!norm(S.q).replace(/\s+/g, ""), cnt = M.box.querySelector(".dbgc-count"), cats = M.box.querySelector(".dbgc-cats");
    if (cnt) { cnt.textContent = has ? (n ? n + " 件（下に出ています）" : "見つかりません") : ""; }
    setClass(cats, "dbgc-hide", has);
  }
  function scroller() { var el = M && M.body; while (el && el !== document.body) { if (hasClass(el, "modal-box")) { return el; } el = el.parentNode; } return null; }
  function toTop() { var sc = scroller(); if (sc) { sc.scrollTop = 0; } }

  function render() {
    if (!M) { return; }
    var off = S.view === "off";
    setClass(M.modal, "dbgc-on", !off);
    setClass(M.normal, "dbgc-hide", !off);
    setClass(M.open, "dbgc-hide", !off);
    setClass(M.box, "dbgc-hide", off);
    var c = counts(M.groups);
    if (S.view === "cat" && !catOf(S.cat)) { S.view = "top"; }
    setClass(M.bar, "dbgc-hide", S.view !== "cat");
    M.bar.innerHTML = S.view === "cat" ? barHtml() : "";
    M.box.innerHTML = off ? "" : (S.view === "cat" ? catHtml(M.groups) : topHtml(c));
    if (S.view === "cat") { var nn = filter(), ne = M.bar.querySelector(".dbgc-n"); if (ne) { ne.textContent = nn + " 個"; } }
    else if (S.view === "top") { searchUpdate(); }
    else { filter(); }
    bind();
  }
  function go(view, cat) {
    S.view = view; S.msg = "";
    if (cat) { S.cat = cat; }
    render();
    toTop();
  }
  function qAll(sel) { var out = [], a = M.bar.querySelectorAll(sel), b = M.box.querySelectorAll(sel), i; for (i = 0; i < a.length; i++) { out.push(a[i]); } for (i = 0; i < b.length; i++) { out.push(b[i]); } return out; }
  function bind() {
    var i, bs = qAll("button[data-dbgc]");
    for (i = 0; i < bs.length; i++) {
      bs[i].onclick = function (ev) {
        var v = ev.currentTarget.getAttribute("data-dbgc");
        if (v === "clear") { S.q = ""; var q0 = M.box.querySelector(".dbgc-q"); if (q0) { q0.value = ""; } searchUpdate(); return; }
        go(v);
      };
    }
    bs = M.box.querySelectorAll("button[data-dbgc-cat]");
    for (i = 0; i < bs.length; i++) { bs[i].onclick = function (ev) { go("cat", ev.currentTarget.getAttribute("data-dbgc-cat")); }; }
    bs = M.box.querySelectorAll("button[data-dbgc-jump]");
    for (i = 0; i < bs.length; i++) {
      bs[i].onclick = function (ev) {
        var g = M.groups[Number(ev.currentTarget.getAttribute("data-dbgc-jump"))], sc = scroller(), bar = M.bar;
        if (!g || !g.head || !sc) { return; }
        var top = g.head.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - (bar ? bar.offsetHeight : 0) - 8;
        sc.scrollTop = Math.max(0, top);
      };
    }
    bs = M.box.querySelectorAll("button[data-dbgc-go]");
    for (i = 0; i < bs.length; i++) {
      bs[i].onclick = function (ev) {
        var k = ev.currentTarget.getAttribute("data-dbgc-go"), why = "";
        try { why = M.api && M.api.go ? M.api.go(k) : "開けません"; } catch (e) { why = "開けませんでした（" + (e && e.message ? e.message : e) + "）"; }
        if (why) { S.msg = "⚠️ " + why; var m = M.box.querySelector(".dbgc-msg"); if (m) { m.textContent = S.msg; m.removeAttribute("hidden"); } }
        else { S.view = "off"; S.msg = ""; }
      };
    }
    var q = M.box.querySelector(".dbgc-q");
    if (q) {
      q.oninput = function () { S.q = q.value; searchUpdate(); };
      q.onkeydown = function (ev) { if (ev && (ev.key === "Enter" || ev.keyCode === 13)) { try { q.blur(); } catch (e) {} } };
    }
  }

  // script.js の renderSettingsBody() のあと（?debug=1 のときだけ）。→ 付けられたら true
  function mount(body, api) {
    if (!body || !body.querySelector) { return false; }
    var legacy = body.querySelector("#dbg-legacy"), normal = body.querySelector("#set-normal"), open = body.querySelector("#btn-debug-center");
    if (!legacy || !normal || !open) { return false; }
    var bar = document.createElement("div"), box = document.createElement("div"), foot = document.createElement("div"), modal = body;
    bar.className = "dbgc-bar dbgc-hide";
    box.className = "dbgc-box";
    foot.className = "dbgc-foot";
    foot.innerHTML = '<button class="shop-menu-btn dbgc-back" data-dbgc-foot="top">&#x25B2; デバッグセンターのトップへ戻る</button>';
    legacy.parentNode.insertBefore(bar, legacy);
    legacy.parentNode.insertBefore(box, legacy);
    if (legacy.nextSibling) { legacy.parentNode.insertBefore(foot, legacy.nextSibling); } else { legacy.parentNode.appendChild(foot); }
    while (modal && !hasClass(modal, "modal")) { modal = modal.parentNode; if (modal === document.body) { modal = null; } }
    M = { body: body, legacy: legacy, normal: normal, open: open, bar: bar, box: box, foot: foot, modal: modal, api: api, groups: scan(legacy) };
    open.onclick = function () { go("top"); };
    foot.querySelector("button").onclick = function () { go("top"); };
    render();
    return true;
  }
  // 設定を開きなおしたときは、通常の設定から
  function reset() { S.view = "off"; S.cat = ""; S.q = ""; S.msg = ""; }

  window.UGDebugCenter = {
    CATS: CATS, RULES: RULES, SAVE_RE: SAVE_RE,
    classify: classify, matches: matches, scan: scan, counts: counts,
    mount: mount, reset: reset,
    state: function () { return { view: S.view, cat: S.cat, q: S.q, msg: S.msg }; },
    open: function (view, cat) { if (M) { go(view || "top", cat); } return !!M; }
  };
}());
