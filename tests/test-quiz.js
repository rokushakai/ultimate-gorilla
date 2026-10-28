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
  ok(ids.join() === "uke,music,ai,social,money,fad", "six genres in order", ids);
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
};
