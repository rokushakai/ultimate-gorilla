// 🛠️ デバッグセンター（§344 v2.73）: 見出しの分類・検索・script.js へのつなぎ方（画面の操作は Chrome の QA で見る）
"use strict";
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var H = require("./harness");
var ok = H.ok;

module.exports = function () {
  H.suite("debugcenter");
  var ROOT = H.ROOT, src = fs.readFileSync(path.join(ROOT, "debug-center.js"), "utf8"), s = fs.readFileSync(path.join(ROOT, "script.js"), "utf8").replace(/\r\n/g, "\n");
  var box = { window: {}, document: {} };
  vm.runInNewContext(src, box);
  var D = box.window.UGDebugCenter;
  ok(!!D && typeof D.mount === "function" && typeof D.reset === "function", "window.UGDebugCenter (mount / reset)");
  ok(D.CATS.map(function (c) { return c.id; }).join() === "music,arcade,rpg,party,save,sys,other" && D.CATS.length === 7, "7 categories in the order of the spec");

  // --- script.js のデバッグのボタン（いまの HTML の作り）を、見出しごとのグループに ---
  var a = s.indexOf("  function renderSettingsBodyRaw() {"), z = s.indexOf("    body.innerHTML = html;", a), blk = s.slice(a, z);
  var d0 = blk.indexOf("    if (DEBUG_MODE) {\n"), dbg = blk.slice(d0);
  var groups = [], cur = null, ids = {}, dupId = 0, nBtn = 0;
  dbg.split("\n").forEach(function (line) {
    var m = /html \+= '<(p|h\d|div)[^>]*>(.*?)<\/(p|h\d|div)>'/.exec(line);
    if (m && line.indexOf("<button") < 0) { cur = { title: m[2].replace(/<[^>]+>/g, ""), cat: D.classify(m[2]), btns: [] }; groups.push(cur); return; }
    var re = /<button[^>]*id="([^"]+)"[^>]*>(.*?)<\/button>/g, b;
    while ((b = re.exec(line))) { nBtn++; if (ids[b[1]]) { dupId++; } ids[b[1]] = 1; if (!cur) { cur = { title: "", cat: "other", btns: [] }; groups.push(cur); } cur.btns.push({ id: b[1], text: b[2] }); }
  });
  ok(groups.length >= 70 && nBtn >= 540, "the debug buttons are still all there (groups / buttons)", [groups.length, nBtn]);
  ok(dupId === 0, "every debug button keeps a unique id", dupId);
  var per = {}; D.CATS.forEach(function (c) { per[c.id] = 0; });
  groups.forEach(function (g) { per[g.cat] += g.btns.length; });
  var save = 0; groups.forEach(function (g) { g.btns.forEach(function (b) { if (D.SAVE_RE.test(b.text)) { save++; } }); });
  ok(["music", "arcade", "rpg", "party", "sys"].every(function (k) { return per[k] > 0; }) && save >= 20, "every heading category has buttons (💾 gathers save/reset/flag buttons, 📚 shows all in the original order)", [per, save]);
  var fake = groups.map(function (g) { return { cat: g.cat, btns: g.btns.map(function (b) { return { text: b.text }; }) }; }), cnt = D.counts(fake);
  ok(cnt.all === nBtn && cnt.other === nBtn && cnt.save === save && cnt.music === per.music, "counts: 📚 = all buttons, 💾 = by name", cnt);
  ok(per.music + per.arcade + per.rpg + per.party + per.sys + per.other === nBtn, "each button belongs to exactly one group category (none lost)", [per, nBtn]);
  function catOfTitle(re) { for (var i = 0; i < groups.length; i++) { if (re.test(groups[i].title)) { return groups[i].cat; } } return null; }
  ok(catOfTitle(/§146 v0\.65 ゲームセンター/) === "arcade" && catOfTitle(/サウンドテスト/) === "music" && catOfTitle(/ファイルBGM再生基盤/) === "music" &&
    catOfTitle(/開発用テスト/) === "rpg" && catOfTitle(/横スクロールマップ/) === "rpg" && catOfTitle(/仲間装備システム/) === "party" && catOfTitle(/まかせるAI 4択確認/) === "party" &&
    catOfTitle(/デバッグ検証/) === "sys" && catOfTitle(/モーダル直接表示/) === "sys", "spot checks: arcade / music / RPG / party / system groups");
  ok(D.classify("") === "other" && D.classify("なにか新しいテスト") === "other", "an unknown heading goes to 📚 その他");

  // --- 検索（押さない・文字を見るだけ）---
  ok(D.matches("🪙 メダル+1000枚", "メダル") && D.matches("📈 Lv.99にする", "lv.99") && D.matches("📈 Lv.99にする", "ｌｖ．９９") && D.matches("A B C", "a  c") && D.matches("A B C", "Ａ　Ｃ"), "search: case / full-width / several words");
  ok(!D.matches("🪙 メダル+1000枚", "") && !D.matches("🪙 メダル+1000枚", "   ") && !D.matches("🪙 メダル+1000枚", "メダル ゴリラ"), "search: empty finds nothing, every word must match");
  var hitMedal = 0; groups.forEach(function (g) { g.btns.forEach(function (b) { if (D.matches(b.text + " " + g.title, "メダル")) { hitMedal++; } }); });
  ok(hitMedal >= 2, "search 'メダル' reaches the medal buttons", hitMedal);
  ok(!/\.click\(\)|dispatchEvent|\.onclick\(/.test(src), "debug-center.js never presses an existing button (show / hide only)");

  // --- script.js へのつなぎ方 ---
  ok(/function renderSettingsBody\(\) \{\n    renderSettingsBodyRaw\(\);\n    if \(!DEBUG_MODE\) \{ return; \}/.test(s), "renderSettingsBody() = the old body (renderSettingsBodyRaw) + the debug center only with ?debug=1");
  ok(s.split("function renderSettingsBodyRaw()").length === 2 && s.split("function renderSettingsBody()").length === 2, "one raw renderer and one wrapper");
  var openLine = /\n(.*)id="btn-debug-center"/.exec(blk);
  ok(!!openLine && /^    if \(DEBUG_MODE\) \{ html = '<button/.test(openLine[1]), "the 🛠️ button and the wrappers are only built with DEBUG_MODE (normal URL unchanged)");
  ok(blk.indexOf('html = \'<button class="shop-menu-btn dbgc-open" id="btn-debug-center">') < blk.indexOf('html += \'<p class="small" style="color:#ffd166;margin-top:16px;">🛠️ 開発用テスト'), "the 🛠️ button comes before (above) everything");
  ok(/html \+= '<\/div>'; \/\/ §344 v2\.73: #dbg-legacy\n    \}\n$/.test(blk), "the debug wrapper closes inside the DEBUG_MODE block");
  ok(/function openSettingsModal\(\) \{\n    openModal\("settings-modal"\);\n    if \(window\.UGDebugCenter\) \{ window\.UGDebugCenter\.reset\(\); \}/.test(s), "opening ⚙️ starts from the normal settings");
  var api = s.slice(s.indexOf("  function debugCenterApi() {"), s.indexOf("  function renderSettingsBodyRaw() {"));
  ok(/state\.inBattle/.test(api) && /isRunning\(\)/.test(api) && /closeModal\("settings-modal"\);\n        openArcadeModal\(\);/.test(api) && /startArcadeGame\("daw"\)/.test(api) && /UGDaw\.xmas\.open\(\)/.test(api), "shortcuts reuse openArcadeModal → startArcadeGame('daw') → UGDaw.xmas.open, and refuse in battle / while a game runs");
  ok(!/state\.(?!inBattle)[a-zA-Z]+\s*=/.test(api) && !/saveGame|localStorage/.test(api + src), "the debug center changes no game state and saves nothing");
  // 通常の URL での HTML は前と同じ（デバッグの所以外は変えていない）
  ok(blk.indexOf('id="btn-manual-save"') > 0 && blk.indexOf('id="btn-new-game"') > 0 && blk.indexOf('id="btn-toggle-sound"') > 0, "normal settings items are unchanged");
};
