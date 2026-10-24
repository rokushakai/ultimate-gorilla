// script.js（本編）側のテスト: マップ・ゲームセンターのメダル/景品・セーブ項目・ES5
"use strict";
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var H = require("./harness");
var ok = H.ok;

module.exports = function () {
  H.suite("script");
  var ROOT = H.ROOT;
  var s = fs.readFileSync(path.join(ROOT, "script.js"), "utf8");
  function slice(a, b) { var i = s.indexOf(a), j = s.indexOf(b, i); if (i < 0 || j < 0) { throw new Error("slice " + a); } return s.slice(i, j); }

  // --- 構文・ES5 ---
  var jsFiles = ["script.js", "arcade.js", "arcade-melody.js", "arcade-lyrics.js"];
  jsFiles.forEach(function (f) {
    var err = null;
    try { new vm.Script(fs.readFileSync(path.join(ROOT, f), "utf8"), { filename: f }); } catch (e) { err = e.message; }
    ok(!err, "syntax ok: " + f, err);
    var probs = H.es5Problems(f);
    ok(probs.length === 0, "ES5 only: " + f, probs.slice(0, 3));
  });
  var html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  var order = ["arcade.js", "arcade-melody.js", "arcade-lyrics.js", "script.js"].map(function (f) { return html.indexOf('<script src="' + f + '">'); });
  ok(order[0] > 0 && order[0] < order[1] && order[1] < order[2] && order[2] < order[3], "index.html loads arcade.js → arcade-melody.js → arcade-lyrics.js → script.js", order);

  // --- マップ ---
  var mapSrc = slice("var RAW_MAP = [", "];") + "];";
  var RAW_MAP = vm.runInNewContext(mapSrc + " RAW_MAP;");
  ok(RAW_MAP.every(function (r) { return r.length === 26; }), "RAW_MAP rows are 26 wide");
  var qCount = RAW_MAP.join("").split("Q").length - 1;
  ok(qCount === 1 && RAW_MAP[1][3] === "Q" && RAW_MAP[1][4] === "H", "game center Q sits just left of the start house", qCount);

  // --- メダル・景品（script.js の該当関数と実データで動かす） ---
  var dataSrc = slice("  var ITEM_DATA = [", "  // --- まほうデータ");
  var arcadeSrc = slice("  var ARCADE_GAME_IDS = [", "  function openHintShopModal() {");
  var ownSrc = slice("  function isEquipOwned(slotInfo, id) {", "  function bonusText(item) {");
  var bonusSrc = slice("  function bonusText(item) {", "\n  }\n") + "\n  }\n";
  var findSlotSrc = slice("  function findEquipSlot(slot) {", "\n  }\n") + "\n  }\n";
  var addExpSrc = slice("  function addExp(amount) {", "\n  }\n") + "\n  }\n";
  var slotsStart = s.lastIndexOf("var ", s.indexOf('{ slot: "weapon", label: "⚔ 武器"'));
  var slotsDef = s.slice(slotsStart, s.indexOf("];", slotsStart) + 2);
  var sandbox = { console: console, toasts: [], saves: 0, closed: 0, confirmAnswer: true, realList: H.load().window.UGArcade.list() };
  var prelude = "var state = { inBattle: false, arcadeHighScores: {}, arcadeMedals: 0, arcadeMedalsTotal: 0, player: { level: 1, exp: 0, nextExp: 25, gold: 0, ownedWeapons: ['woodstick'], ownedArmors: ['tshirt'], ownedShields: ['cardboard'], ownedHelmets: ['hachimaki'] } };\n" +
    "function findById(a, id) { for (var i = 0; i < a.length; i++) { if (a[i].id === id) { return a[i]; } } return null; }\n" +
    "function getItemCount(id) { return state.player[id + 'Count'] || 0; } function addItemCount(id, d) { state.player[id + 'Count'] = getItemCount(id) + d; }\n" +
    "function updateStatusBar() {} function saveGame() { saves++; } function showToast(m) { toasts.push(m); } function closeModal() { closed++; } function openModal() {} function renderField() {} function updateBGM() {} function stopBGM() {}\n" +
    "function levelUp() { var p = state.player; p.level++; p.nextExp = p.level * 10 + 15; if (p.level >= 99) { throw new Error('reached Lv99 via exchange'); } }\n" +
    "var soundEnabled = false; var elStub = { innerHTML: '', classList: { add: function () {}, remove: function () {} }, querySelectorAll: function () { return []; } };\n" +
    "var document = { getElementById: function () { return elStub; } }; var window = { confirm: function () { return confirmAnswer; }, UGArcade: { list: function () { return realList; }, isRunning: function () { return false; }, stop: function () {} } };\n";
  vm.runInNewContext(prelude + dataSrc + slotsDef + findSlotSrc + ownSrc + bonusSrc + addExpSrc + arcadeSrc +
    "\nthis.T = { calc: calcArcadeMedals, end: onArcadeGameEnd, ex: exchangeArcadePrize, st: getArcadePrizeStatus, amt: getArcadeExpAmount, prizes: ARCADE_PRIZES, rate: ARCADE_MEDAL_RATE, ids: ARCADE_GAME_IDS, state: state, findEquipSlot: findEquipSlot, findById: findById, setConfirm: function (v) { confirmAnswer = v; }, render: renderArcadeMenu, setCat: function (c) { _arcadeCat = c; }, html: function () { return elStub.innerHTML; } };", sandbox);
  var T = sandbox.T, st = T.state;
  ok(T.ids.every(function (id) { return !!T.rate[id]; }), "every arcade game has a medal rate");
  ok(T.calc("blocks", 2000, false) === 20 && T.calc("g2048", 999999, false) === 100 && T.calc("mole", 500, true) === 25 && T.calc("mole", 0, true) === 0, "medal calculation (rate, cap 100, high score +5)");
  ok(T.end("blocks", 2000) === 25 && T.end("blocks", 1500) === 15 && T.end("nope", 9999) === 0, "onArcadeGameEnd returns medals and ignores unknown games");
  var badPrize = T.prizes.filter(function (p) {
    if (p.kind !== "equip") { return false; }
    var eq = T.findById(T.findEquipSlot(p.slot).data(), p.equipId);
    return !eq || eq.isLegendary || eq.buyPrice;
  });
  ok(badPrize.length === 0, "prize gear excludes legendary and shop-sold equipment", badPrize.map(function (p) { return p.id; }));
  st.arcadeMedals = 30; T.ex("g50");
  ok(st.player.gold === 50 && st.arcadeMedals === 20, "exchange gold");
  st.arcadeMedals = 5000; st.player.level = 19;
  ok(T.st(T.findById(T.prizes, "e_rockcutter")).reason === "Lv20から", "level-gated gear");
  st.player.level = 20; T.setConfirm(false); T.ex("e_rockcutter");
  ok(st.player.ownedWeapons.indexOf("rockcutter") < 0, "declining the confirm keeps medals");
  T.setConfirm(true); T.ex("e_rockcutter");
  ok(st.player.ownedWeapons.indexOf("rockcutter") >= 0 && T.st(T.findById(T.prizes, "e_rockcutter")).reason === "所持済み", "gear exchange once");
  var never99 = true;
  for (var k = 0; k < 5000; k++) {
    st.player.level = 1 + Math.floor(Math.random() * 98); st.player.nextExp = st.player.level * 10 + 15; st.player.exp = Math.floor(Math.random() * st.player.nextExp); st.arcadeMedals = 100;
    try { T.ex(Math.random() < 0.5 ? "exp_s" : "exp_l"); } catch (e) { never99 = false; break; }
  }
  ok(never99, "EXP packs never reach Lv99");

  // --- メニューの分類タブ（§161） ---
  var counts = {};
  sandbox.realList.forEach(function (g) { counts[g.cat] = (counts[g.cat] || 0) + 1; });
  ["all", "action", "puzzle", "music"].forEach(function (c) {
    T.setCat(c); T.render("games");
    var shown = (T.html().match(/data-arcade-game="/g) || []).length;
    ok(shown === (c === "all" ? sandbox.realList.length : counts[c]), "menu tab '" + c + "' shows its games", shown);
  });
  ok(T.html().indexOf('data-arcade-game="melody"') >= 0 && T.html().indexOf('data-arcade-game="lyrics"') >= 0, "music tab has melody and lyrics");

  // --- セーブ項目（ゲームセンター系が saveGame と loadGame の両方にある） ---
  var saveSrc = slice("function saveGame()", "function loadGame()"), loadSrc = slice("function loadGame()", "\n  function ");
  ["arcadeHighScores", "arcadeMedals", "arcadeMedalsTotal", "companionTechnique2LearnedNotices"].forEach(function (key) {
    ok(saveSrc.indexOf(key + ":") >= 0 && loadSrc.indexOf("data." + key) >= 0, "save/load both handle " + key);
  });
};
