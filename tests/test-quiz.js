// ゴリラクイズ（arcade-quiz.js）のテスト（§202）
"use strict";
var H = require("./harness");
var ok = H.ok;

function press(env, k) { env.key("keydown", k); env.key("keyup", k); }

module.exports = function () {
  H.suite("quiz");
  var env = H.load(), W = env.window, Q = W.UGQuiz, A = W.UGArcade;
  ok(!!Q, "UGQuiz test API exists");
  var g = A.list().filter(function (x) { return x.id === "quiz"; })[0];
  ok(g && g.cat === "quiz", "quiz is registered in the quiz tab", g);

  // --- 問題データ ---
  var ids = Q.cats.map(function (c) { return c.id; });
  ok(ids.join() === "uke,music,ai,social,money,fad,animal,uma,game,sci,stat,it,geo,hist,food,sport,word", "seventeen genres in order", ids);
  var bad = [], texts = {};
  Q.cats.forEach(function (c) {
    if (c.qs.length < 20) { bad.push(c.id + " has " + c.qs.length); }
    c.qs.forEach(function (q, i) {
      var opts = [q[1], q[2], q[3], q[4]], uniq = {};
      opts.forEach(function (o) { uniq[o] = 1; });
      if (q.length !== 6 || !q[0] || !q[5] || Object.keys(uniq).length !== 4 || opts.some(function (o) { return !o; })) { bad.push(c.id + ":" + i); }
      if (texts[q[0]]) { bad.push("dup " + q[0]); }
      texts[q[0]] = 1;
    });
  });
  ok(bad.length === 0, "every genre has 20+ questions; each has text, 4 different choices and a note; no duplicate questions", bad.slice(0, 5));

  // --- 出題 ---
  var seen = {}, p1 = Q.pick("ai", 10, Math.random, seen);
  ok(p1.length === 10 && p1.every(function (q) { return q.cat === "ai" && q.choices.length === 4 && q.answer >= 0 && q.answer < 4; }), "pick 10 from one genre with the answer among shuffled choices");
  var p2 = Q.pick("ai", 10, Math.random, seen), k1 = p1.map(function (q) { return q.key; });
  ok(p2.every(function (q) { return k1.indexOf(q.key) < 0; }), "the next game asks questions not asked yet");
  var aiN = Q.catOf("ai").qs.length, p3 = Q.pick("ai", 10, Math.random, seen);
  ok(p3.length === 10 && Object.keys(seen).filter(function (k) { return k.indexOf("ai:") === 0; }).length <= aiN, "when a genre runs out, it starts over (still 10 questions)");
  var mix = Q.pick("mix", 10, Math.random, {}), mc = {};
  mix.forEach(function (q) { mc[q.cat] = 1; });
  ok(mix.length === 10 && Object.keys(mc).length >= 3, "mix draws from several genres", Object.keys(mc));
  var allKeys = {};
  mix.forEach(function (q) { allKeys[q.key] = 1; });
  ok(Object.keys(allKeys).length === 10, "no repeats within a game");

  // --- 点数 ---
  ok(Q.points(false, 10, 0) === 0 && Q.points(true, 15, 1) === 250 && Q.points(true, 0.2, 1) === 110 && Q.points(true, 5, 3) === 190 && Q.points(true, 5, 20) === 330,
    "points: 100 + seconds left ×10 + streak bonus (max +180)");

  // --- 遊ぶ（1〜4キーで答え、Enter で次へ） ---
  var answers = [];
  var res = env.run("quiz", { config: { cat: "uke" } }, 20000, function (f) {
    if (f % 20 === 5) { press(env, "1"); }
    if (f % 20 === 15) { press(env, "Enter"); }
  });
  ok(res.ended !== null && res.ended >= 0, "a game of 10 questions ends and reports the score", res);
  var best = JSON.parse(env.store.ugQuizBest || "{}");
  ok(typeof best.uke === "number" && best.uke >= 0 && best.uke <= 10, "best score per genre is saved", best);

  // 全部正解: 内部の答えを使う
  var env2 = H.load({ patch: function (src, file) {
    if (file === "arcade-quiz.js") { src = src.split("      var panel = api.panel;").join("      var panel = api.panel; window.__quiz = function () { return { q: qs[idx], phase: phase, t: t, right: right }; };"); }
    return src;
  } });
  var res2 = env2.run("quiz", { config: { cat: "money" } }, 20000, function (f) {
    var st = env2.window.__quiz && env2.window.__quiz();
    if (!st) { return; }
    if (st.phase === "ask" && f % 10 === 0) { press(env2, String(st.q.answer + 1)); }
    if (st.phase === "result" && f % 10 === 5) { press(env2, "Enter"); }
  });
  ok(res2.ended > 2500 && env2.lastTitle() === "CLEAR!", "all correct → CLEAR! with a high score", [res2.ended, env2.lastTitle()]);

  // 時間切れ: 何もしないと15秒で不正解になり、解説で止まる
  var env3 = H.load({ patch: function (src, file) {
    if (file === "arcade-quiz.js") { src = src.split("      var panel = api.panel;").join("      var panel = api.panel; window.__quiz = function () { return { phase: phase, t: t, idx: idx }; };"); }
    return src;
  } });
  var st3 = null;
  env3.run("quiz", { config: { cat: "fad" } }, 15 * 60 + 120, function () { st3 = env3.window.__quiz && env3.window.__quiz(); });
  ok(st3 && st3.phase === "result" && st3.idx === 0 && st3.t === 0, "time runs out after 15s and waits on the answer note", st3);

  // --- §205: にがて問題・図鑑・ヒント・サドンデス・問題数・メモ ---
  var done = {}, miss = {};
  Q.record("uke:3", false, done, miss);
  ok(miss["uke:3"] === Q.MISS_CLEAR && !done["uke:3"], "a wrong answer goes into にがて問題");
  Q.record("uke:3", true, done, miss);
  ok(miss["uke:3"] === 1 && done["uke:3"] === 1, "a right answer counts for the 図鑑 and once toward leaving にがて");
  Q.record("uke:3", false, done, miss);
  Q.record("uke:3", true, done, miss); Q.record("uke:3", true, done, miss);
  ok(!("uke:3" in miss), "two right answers in a row (after the last miss) take it out of にがて");
  var pm = Q.pickMiss({ "ai:2": 2, "sci:5": 1, "nope:1": 2, "ai:9999": 2 }, 10, Math.random);
  ok(pm.length === 2 && pm.every(function (q) { return q.key === "ai:2" || q.key === "sci:5"; }), "にがて問題 picks only real missed questions", pm.map(function (q) { return q.key; }));
  var cp = Q.complete({ "uke:0": 1, "uke:1": 1, "ai:0": 1 }, "uke"), cpAll = Q.complete({ "uke:0": 1, "ai:0": 1 }, "mix");
  ok(cp.n === 2 && cp.all === Q.catOf("uke").qs.length && cpAll.n === 2 && cpAll.all > 340, "図鑑 counts per genre and in total", [cp, cpAll]);
  var hq = Q.pick("game", 1, Math.random, {})[0], hh = Q.hint(hq);
  ok(hh.length === 2 && hh.indexOf(hq.answer) < 0 && hh[0] !== hh[1], "50:50 hides two wrong choices");
  ok(Q.bestKey("uke", 10) === "uke" && Q.bestKey("uke", 5) === "uke@5", "best for 10 questions keeps the old key; other counts get their own");

  function hooked() {
    return H.load({ patch: function (src, file) {
      if (file === "arcade-quiz.js") { src = src.split("      var panel = api.panel;").join("      var panel = api.panel; window.__quiz = { st: function () { return { q: qs[idx], qs: qs, phase: phase, right: right, hidden: hidden, hintUsed: hintUsed, bonus: bonus, results: results }; }, hint: useHint, flag: toggleFlag };"); }
      return src;
    } });
  }
  // 5問・ヒントなしで全問正解 → ボーナス、図鑑とベストが残る
  var e4 = hooked(), last4 = null;
  var r4 = e4.run("quiz", { config: { cat: "stat", n: 5 } }, 20000, function (f) {
    var h = e4.window.__quiz; if (!h) { return; }
    var st = h.st(); last4 = st;
    if (st.phase === "ask" && f % 10 === 0) { press(e4, String(st.q.answer + 1)); }
    if (st.phase === "result" && f % 10 === 5) { press(e4, "Enter"); }
  });
  last4 = e4.window.__quiz.st();
  var best4 = JSON.parse(e4.store.ugQuizBest || "{}"), done4 = JSON.parse(e4.store.ugQuizDone || "{}");
  ok(last4 && last4.qs.length === 5 && last4.bonus === Q.HINT_BONUS && e4.lastTitle() === "CLEAR!", "5-question game; no hint used → bonus", last4 && [last4.qs.length, last4.bonus]);
  ok(best4["stat@5"] === 5 && Object.keys(done4).length === 5, "best for 5 questions and the 図鑑 are saved", [best4, Object.keys(done4).length]);

  // ヒント: 2つ消え、消えた答えは押せない。使うとボーナスなし
  var e5 = hooked(), st5 = null, tried = false;
  e5.run("quiz", { config: { cat: "uke", n: 5 } }, 20000, function (f) {
    var h = e5.window.__quiz; if (!h) { return; }
    var st = h.st();
    if (st.phase === "ask" && !st.hintUsed && f === 3) { press(e5, "h"); }
    if (st.phase === "ask" && st.hidden.length && !tried) { tried = true; press(e5, String(st.hidden[0] + 1)); st5 = h.st().phase; }
    if (st.phase === "ask" && f % 10 === 0 && f > 3) { press(e5, String(st.q.answer + 1)); }
    if (st.phase === "result" && f % 10 === 5) { press(e5, "Enter"); }
  });
  st5 = { pressedHidden: st5, bonus: e5.window.__quiz.st().bonus, phase: e5.window.__quiz.st().phase };
  ok(st5.pressedHidden === "ask" && st5.phase === "end" && st5.bonus === 0, "H key = 50:50; a hidden choice can't be picked; using it means no bonus", st5);

  // サドンデス: 1問目でまちがえると終わり。にがて問題に入る。メモ（🚩）は保存される
  var e6 = hooked(), st6 = null, flagged = false;
  e6.run("quiz", { config: { cat: "money", mode: "sudden" } }, 4000, function (f) {
    var h = e6.window.__quiz; if (!h) { return; }
    var st = h.st();
    if (st.phase === "ask" && f === 5) { press(e6, String(((st.q.answer + 1) % 4) + 1)); }
    if (st.phase === "result" && !flagged) { flagged = true; h.flag(); }
    if (st.phase === "result" && f === 30) { press(e6, "Enter"); }
    st6 = st;
  });
  st6 = e6.window.__quiz.st();
  var miss6 = JSON.parse(e6.store.ugQuizMiss || "{}"), flag6 = JSON.parse(e6.store.ugQuizFlag || "{}"), surv6 = JSON.parse(e6.store.ugQuizSurv || "{}");
  ok(st6 && st6.phase === "end" && st6.results.length === 1 && st6.qs.length === Q.catOf("money").qs.length, "sudden death ends at the first miss (pool is the whole genre)", st6 && [st6.phase, st6.results.length]);
  ok(miss6[st6.q.key] === Q.MISS_CLEAR && flag6[st6.q.key] === 1 && surv6.money === 0, "the miss goes into にがて問題, 🚩 memo is saved, best streak saved", [miss6, flag6, surv6]);

  // にがて問題モード: 入っている問題だけ出る
  var e7 = hooked(), keys7 = {};
  e7.store.ugQuizMiss = JSON.stringify({ "fad:1": 2, "uma:4": 1, "sci:0": 2 });
  e7.run("quiz", { config: { cat: "miss", n: 10 } }, 20000, function (f) {
    var h = e7.window.__quiz; if (!h) { return; }
    var st = h.st();
    if (st.q) { keys7[st.q.key] = 1; }
    if (st.phase === "ask" && f % 10 === 0) { press(e7, String(st.q.answer + 1)); }
    if (st.phase === "result" && f % 10 === 5) { press(e7, "Enter"); }
  });
  var miss7 = JSON.parse(e7.store.ugQuizMiss || "{}");
  ok(Object.keys(keys7).sort().join() === "fad:1,sci:0,uma:4" && !miss7["uma:4"] && miss7["fad:1"] === 1, "にがて問題 mode asks only missed questions and counts them down", [Object.keys(keys7), miss7]);
};
