// =========================================================
// 究極ゴリラ ゲームセンター: ✍️ 歌詞くずし（§160 v0.79）
// 言葉のブロックを打ち落として作詞するブロックくずし。
// arcade.js の後に読み込む。土台の機能は window.UGArcade.internal から使う。
// =========================================================
(function () {
  "use strict";

  var I = window.UGArcade && window.UGArcade.internal;
  if (!I) { return; }
  var W = I.W, H = I.H, clamp = I.clamp, randInt = I.randInt, hudText = I.hudText, escHtml = I.escHtml;

  var LYRIC_PREFS_KEY = "ultimateGorillaLyricsPrefsV1", LYRIC_SAVE_KEY = "ultimateGorillaLyricsV1";
  var LYRIC_SAVE_MAX = 20, LYRIC_MAX_LINES = 100;

  // ---------------------------------------------------------
  // 言葉データ（ジャンルごとに 単語30以上・フレーズ4以上）
  // ---------------------------------------------------------
  var LYRIC_GENRES = [
    { id: "love", name: "恋愛", icon: "💕", color: "#e84393",
      words: ["恋", "好き", "キス", "片想い", "ときめき", "指輪", "約束", "君", "あなた", "抱きしめて", "運命", "告白", "ハート", "涙", "夜明け",
        "二人", "秘密", "手紙", "薔薇", "ささやき", "永遠", "初恋", "甘い", "胸の鼓動", "待ち合わせ", "遠距離", "星空", "微笑み", "愛してる", "せつない",
        "嫉妬", "花束", "恋人", "夢中", "合図", "赤い糸", "雨上がり", "帰り道", "声", "まなざし"],
      phrases: ["君に会いたい", "好きと言えなくて", "今夜だけは", "離さないで", "ずっとそばにいて", "恋に落ちた", "二人だけの秘密", "抱きしめたい"] },
    { id: "youth", name: "青春", icon: "🌸", color: "#fd79a8",
      words: ["放課後", "制服", "夏休み", "屋上", "部活", "汗", "夕焼け", "自転車", "卒業", "桜", "黒板", "青空", "未来", "仲間", "涙",
        "全力", "走れ", "校庭", "チャイム", "花火", "夢", "憧れ", "初夏", "教室", "背伸び", "秘密基地", "グラウンド", "青春", "寄り道", "一番星"],
      phrases: ["あの日の約束", "風になれ", "明日へ走れ", "君と見た空", "終わらない夏", "胸を張って"] },
    { id: "family", name: "家族", icon: "👪", color: "#e17055",
      words: ["母さん", "父さん", "ただいま", "おかえり", "食卓", "手のぬくもり", "兄弟", "姉妹", "故郷", "笑顔", "写真", "誕生日", "子守唄", "背中", "ありがとう",
        "ごめんね", "実家", "縁側", "味噌汁", "家族", "宝物", "毎日", "窓辺", "帰る場所", "灯り", "じいちゃん", "ばあちゃん", "小さな手", "思い出", "春"],
      phrases: ["いつもありがとう", "ここにいるよ", "大きくなったね", "帰っておいで", "見守っている"] },
    { id: "friends", name: "友情", icon: "🤝", color: "#00b894",
      words: ["親友", "仲間", "肩を組んで", "笑い声", "約束", "ハイタッチ", "秘密", "再会", "旅立ち", "絆", "ケンカ", "仲直り", "一緒に", "合言葉", "夜通し",
        "乾杯", "友よ", "背中合わせ", "支え", "信じて", "手を伸ばせ", "未来", "地図", "寄せ書き", "円陣", "夢", "打ち明け話", "河川敷", "帰り道", "夕暮れ"],
      phrases: ["いつまでも友達", "一人じゃない", "また会おう", "肩を並べて", "笑い合えたら"] },
    { id: "business", name: "ビジネス", icon: "💼", color: "#0984e3",
      words: ["会議", "締め切り", "名刺", "残業", "出張", "満員電車", "上司", "部下", "企画書", "プレゼン", "売上", "目標", "成長", "戦略", "改革",
        "革命", "未来図", "契約", "挑戦", "根回し", "ネクタイ", "オフィス", "決算", "朝礼", "交渉", "定時", "有給", "リモート", "KPI", "シナジー",
        "コンセンサス", "アジェンダ", "イノベーション", "ブレイクスルー"],
      phrases: ["前向きに検討します", "持ち帰ります", "結論から言うと", "本日は以上です", "今期こそ", "走りながら考える"] },
    { id: "sports", name: "スポーツ", icon: "⚽", color: "#00cec9",
      words: ["ゴール", "シュート", "全力疾走", "ホームラン", "逆転", "延長戦", "汗", "声援", "ライバル", "優勝", "メダル", "ホイッスル", "円陣", "スタジアム", "決勝",
        "歓声", "ダッシュ", "ガッツポーズ", "エース", "背番号", "リベンジ", "限界突破", "トレーニング", "スタート", "バトン", "必殺技", "魂", "勝利", "キャプテン", "引退"],
      phrases: ["最後まであきらめるな", "勝利をつかめ", "一点を取りに行け", "ここからが勝負", "走り抜けろ"] },
    { id: "selfhelp", name: "自己啓発", icon: "🔥", color: "#d63031",
      words: ["夢", "情熱", "挑戦", "成長", "一歩", "可能性", "自分らしく", "習慣", "感謝", "継続", "覚悟", "自信", "未来", "行動", "変われる",
        "限界", "突破", "目標", "信念", "輝き", "ポジティブ", "勇気", "チャンス", "原点", "本気", "今この瞬間", "道", "扉", "翼", "奇跡"],
      phrases: ["今日から変われる", "自分を信じて", "できない理由はない", "失敗は成功のもと", "一歩踏み出せ", "昨日の自分を超えろ"] },
    { id: "city", name: "夜・都会", icon: "🌙", color: "#6c5ce7",
      words: ["ネオン", "終電", "摩天楼", "交差点", "夜風", "ハイウェイ", "月明かり", "路地裏", "カクテル", "高層ビル", "満月", "深夜", "ラジオ", "信号", "雑踏",
        "窓明かり", "タクシー", "午前零時", "街灯", "サイレン", "東京", "夜景", "ジャズ", "煙", "孤独", "鼓動", "地下鉄", "星くず", "ミッドナイト", "シルエット"],
      phrases: ["眠らない街で", "午前二時のメロディ", "夜を駆け抜けて", "光の海に溺れて"] },
    { id: "nature", name: "季節・自然", icon: "🍃", color: "#55efc4",
      words: ["桜", "若葉", "夕立", "蝉しぐれ", "紅葉", "雪", "木漏れ日", "風", "波", "海", "山", "虹", "月", "星", "太陽",
        "花びら", "朝露", "入道雲", "夕焼け", "銀河", "森", "川", "空", "雨", "霧", "春風", "秋風", "粉雪", "陽だまり", "地平線"],
      phrases: ["季節が巡る", "風が歌う", "花が咲くころ", "雪解けの頃に", "波音に揺られて"] },
    { id: "travel", name: "旅", icon: "✈️", color: "#74b9ff",
      words: ["切符", "地図", "旅立ち", "汽車", "港", "空港", "滑走路", "宿", "絵はがき", "スーツケース", "知らない街", "地平線", "峠", "車窓", "終着駅",
        "夜行バス", "パスポート", "冒険", "コンパス", "道しるべ", "遠回り", "旅人", "異国", "灯台", "寄り道", "旅路", "風景", "一人旅", "朝焼け", "星座"],
      phrases: ["どこまでも行こう", "知らない空の下", "次の駅まで", "帰りの切符はいらない"] },
    { id: "food", name: "ごはん", icon: "🍙", color: "#fdcb6e",
      words: ["おにぎり", "ラーメン", "カレー", "唐揚げ", "卵焼き", "お弁当", "味噌汁", "パンケーキ", "いちご", "チョコ", "コーヒー", "焼きそば", "たこ焼き", "ドーナツ", "牛丼",
        "餃子", "プリン", "かき氷", "焼肉", "寿司", "梅干し", "炊きたて", "おかわり", "いただきます", "ごちそうさま", "満腹", "腹ペコ", "夜食", "スパイス", "バナナ"],
      phrases: ["おなかがすいた", "もう一杯", "世界一おいしい", "冷めないうちに"] },
    { id: "gorilla", name: "ゴリラ", icon: "🦍", color: "#a29bfe",
      words: ["ゴリラ", "バナナ", "ドラミング", "ジャングル", "ウホ", "森の賢者", "胸を叩け", "雄叫び", "群れ", "UMA", "ウクレレ", "酒場", "冒険", "伝説", "勇者",
        "レベル99", "究極", "野生", "筋肉", "ボス", "チンパンジー", "秘境", "宝箱", "呪文", "仲間", "バナナボート", "群れのボス", "森のうた", "腕相撲", "雄大"],
      phrases: ["森の王者だ", "胸を叩いて叫べ", "究極ゴリラに会いに行く", "ウホッと笑え"] }
  ];
  var LYRIC_FILLERS = ["ラララ", "Oh", "Yeah", "Baby", "Hey", "ララバイ", "フゥー", "Woo", "Ah", "ナナナ", "Wow", "シャラララ"];
  var LYRIC_BREAKS = [
    { id: "rally", name: "ラリーごと（パドルに戻ったら改行）" },
    { id: "four", name: "4語ごと" },
    { id: "manual", name: "手動だけ（↵ボタン）" }
  ];
  var LYRIC_COIN_COLOR = "#f1c40f", LYRIC_FILLER_COLOR = "#b2bec3";

  function lyricGenre(id) {
    for (var i = 0; i < LYRIC_GENRES.length; i++) { if (LYRIC_GENRES[i].id === id) { return LYRIC_GENRES[i]; } }
    return null;
  }
  // サロゲートペアも1文字として分ける
  function lyricChars(s) { return String(s).match(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\s\S]/g) || []; }
  function lyricTextWidth(s) {
    var cs = lyricChars(s), w = 0;
    for (var i = 0; i < cs.length; i++) { w += cs[i].charCodeAt(0) < 0x80 ? 5 : 9; }
    return w;
  }
  // 造語の作り方（mode を省くとランダム）
  //   0: Aの前半＋Bの後半（ネオン＋花火 → ネオ火）
  //   1: Aの最後の1文字を落として＋B全体（ときめき＋キック → ときめキック）
  //   2: A全体＋Bの後半（残業＋流れ星 → 残業れ星）
  function lyricCoin(a, b, mode) {
    var ca = lyricChars(a), cb = lyricChars(b), front, back;
    if (mode === undefined) { mode = randInt(0, 2); }
    if (mode === 1 && ca.length >= 2) { front = ca.slice(0, ca.length - 1); back = cb; }
    else if (mode === 2) { front = ca; back = cb.slice(Math.floor(cb.length / 2)); }
    else { front = ca.slice(0, Math.max(1, Math.ceil(ca.length / 2))); back = cb.slice(Math.floor(cb.length / 2)); }
    if (!back.length) { back = cb; }
    var res = front.concat(back);
    if (res.length > 10) { res = res.slice(0, 10); }
    var s = res.join("");
    return (s === a || s === b) ? a + b : s;
  }
  function lyricSelectedGenres(cfg) {
    var out = [];
    for (var i = 0; i < LYRIC_GENRES.length; i++) {
      if (cfg.mix || (cfg.genres && cfg.genres.indexOf(LYRIC_GENRES[i].id) >= 0)) { out.push(LYRIC_GENRES[i]); }
    }
    return out;
  }
  // 出てくる言葉の一覧 { w, kind, genre, color }
  function lyricPool(cfg) {
    var gs = lyricSelectedGenres(cfg), pool = [], i, j;
    for (i = 0; i < gs.length; i++) {
      for (j = 0; j < gs[i].words.length; j++) { pool.push({ w: gs[i].words[j], kind: "word", genre: gs[i].id, color: gs[i].color }); }
      if (cfg.phrases !== false) {
        for (j = 0; j < gs[i].phrases.length; j++) { pool.push({ w: gs[i].phrases[j], kind: "phrase", genre: gs[i].id, color: gs[i].color }); }
      }
    }
    return pool;
  }
  // 1ステージ分の言葉ブロックを6段に詰める
  function lyricBuildStage(cfg, pool) {
    var bricks = [], used = {}, rows = 6, x0 = 4, x1 = W - 4, top = 34, rh = 15;
    function pick(maxW) {
      for (var tries = 0; tries < 40; tries++) {
        var e;
        if (cfg.fillers !== false && Math.random() < 0.1) {
          e = { w: LYRIC_FILLERS[randInt(0, LYRIC_FILLERS.length - 1)], kind: "filler", genre: "filler", color: LYRIC_FILLER_COLOR };
        } else {
          e = pool[randInt(0, pool.length - 1)];
          if (used[e.w] && tries < 30) { continue; }
        }
        var bw = clamp(lyricTextWidth(e.w) + 10, 22, 110);
        if (bw <= maxW) { used[e.w] = true; return { e: e, bw: bw }; }
      }
      return null;
    }
    if (!pool.length) { return bricks; }
    for (var r = 0; r < rows; r++) {
      var x = x0;
      while (x1 - x >= 22) {
        var got = pick(x1 - x);
        if (!got) { break; }
        bricks.push({ x: x, y: top + r * rh, w: got.bw, h: rh - 2, text: got.e.w, kind: got.e.kind, genre: got.e.genre, color: got.e.color, alive: true });
        x += got.bw + 3;
      }
    }
    // ✨造語ブロックに置きかえる（フレーズ以外から）
    var nCoin = cfg.mix ? 4 : 2, cands = [];
    for (var k = 0; k < bricks.length; k++) { if (bricks[k].kind !== "phrase") { cands.push(k); } }
    for (var c = 0; c < nCoin && cands.length; c++) {
      var bi = cands.splice(randInt(0, cands.length - 1), 1)[0];
      bricks[bi].kind = "coin";
      bricks[bi].text = "✨造語";
      bricks[bi].color = LYRIC_COIN_COLOR;
    }
    return bricks;
  }

  // ---------------------------------------------------------
  // 保存・書き出し
  // ---------------------------------------------------------
  function lyricLoadPrefs() {
    var p = I.lsGet(LYRIC_PREFS_KEY) || {}, gs = [];
    if (p.genres && p.genres.length) {
      for (var i = 0; i < p.genres.length; i++) { if (lyricGenre(p.genres[i])) { gs.push(p.genres[i]); } }
    } else if (!p.genres) {
      gs = ["love", "youth"];
    }
    var br = "rally";
    for (var b = 0; b < LYRIC_BREAKS.length; b++) { if (LYRIC_BREAKS[b].id === p.breakMode) { br = p.breakMode; } }
    return {
      genres: gs, mix: p.mix === true, phrases: p.phrases !== false, fillers: p.fillers !== false,
      breakMode: br, joiner: p.joiner === "none" ? "none" : "space", relax: p.relax === true
    };
  }
  function lyricLoadSaved() {
    var arr = I.lsGet(LYRIC_SAVE_KEY);
    if (!arr || !arr.length) { return []; }
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var r = arr[i];
      if (r && typeof r.id === "number" && r.lines && r.lines.length) { out.push(r); }
    }
    return out;
  }
  function lyricSave(rec) {
    var all = lyricLoadSaved();
    all.unshift(rec);
    if (all.length > LYRIC_SAVE_MAX) { all.length = LYRIC_SAVE_MAX; }
    while (all.length > 0 && !I.lsSet(LYRIC_SAVE_KEY, all)) { all.pop(); }
  }
  function lyricDelete(id) {
    var all = lyricLoadSaved(), out = [];
    for (var i = 0; i < all.length; i++) { if (all[i].id !== id) { out.push(all[i]); } }
    I.lsSet(LYRIC_SAVE_KEY, out);
  }
  function lyricLineText(line, joiner) {
    var ws = [];
    for (var i = 0; i < line.words.length; i++) { ws.push(line.words[i].w); }
    return ws.join(joiner === "none" ? "" : " ");
  }
  function lyricPad(n) { return (n < 10 ? "0" : "") + n; }
  function lyricDateText(ms) {
    var d = new Date(ms);
    return d.getFullYear() + "/" + lyricPad(d.getMonth() + 1) + "/" + lyricPad(d.getDate()) + " " + lyricPad(d.getHours()) + ":" + lyricPad(d.getMinutes());
  }
  function lyricGenreText(rec) {
    if (rec.mix) { return "ジャンルミックス"; }
    var names = [];
    for (var i = 0; i < (rec.genres || []).length; i++) { var g = lyricGenre(rec.genres[i]); if (g) { names.push(g.name); } }
    return names.join("・");
  }
  function lyricTitle(rec) { return rec.lines.length ? lyricLineText(rec.lines[0], rec.joiner) : "（無題）"; }
  function lyricToText(rec) {
    var out = ["タイトル: " + lyricTitle(rec), "作成: " + lyricDateText(rec.date), "ジャンル: " + lyricGenreText(rec), "----------------"];
    for (var i = 0; i < rec.lines.length; i++) { out.push(lyricLineText(rec.lines[i], rec.joiner)); }
    out.push("----------------", "究極ゴリラ ゲームセンター「歌詞くずし」で作詞");
    return out.join("\n") + "\n";
  }
  function lyricFileName(rec) {
    var d = new Date(rec.date);
    return "lyrics-" + d.getFullYear() + lyricPad(d.getMonth() + 1) + lyricPad(d.getDate()) + "-" + lyricPad(d.getHours()) + lyricPad(d.getMinutes()) + ".txt";
  }

  // ---------------------------------------------------------
  // 設定画面・歌詞ノート
  // ---------------------------------------------------------
  var lyricOpenId = null, lyricMsg = "";

  function lyricSetup(root, ctl) {
    var prefs = lyricLoadPrefs();
    function savePrefs() { I.lsSet(LYRIC_PREFS_KEY, prefs); }
    function canStart() { return prefs.mix || prefs.genres.length > 0; }
    function render() {
      var i, recs = lyricLoadSaved();
      var html = '<div class="melody-setup">' +
        '<h3 style="margin:0 0 4px;">&#x270D;&#xFE0F; 歌詞くずし</h3>' +
        '<p class="small" style="color:#adb5bd;margin:0 0 8px;">言葉のブロックを打ち落とすと、その言葉で歌詞が書かれていくよ。✨造語ブロックは2つの言葉をつないで新しい言葉を作る！</p>' +
        '<div class="melody-section-title">ジャンル（いくつでも）</div><div class="lyric-genres">';
      for (i = 0; i < LYRIC_GENRES.length; i++) {
        var g = LYRIC_GENRES[i], on = prefs.genres.indexOf(g.id) >= 0;
        html += '<label class="lyric-genre' + (prefs.mix ? " dim" : "") + '"><input type="checkbox" data-genre="' + g.id + '"' + (on ? " checked" : "") + (prefs.mix ? " disabled" : "") + '> ' + g.icon + " " + g.name + '</label>';
      }
      html += '</div>' +
        '<div class="melody-checks"><label><input type="checkbox" data-p="mix"' + (prefs.mix ? " checked" : "") + '> &#x1F3B2; ジャンルミックス（全部まぜる・✨造語多め）</label>' +
        '<label><input type="checkbox" data-p="fillers"' + (prefs.fillers ? " checked" : "") + '> &#x1F3B5; 合いの手を混ぜる（ラララ・Oh Yeah など）</label>' +
        '<label><input type="checkbox" data-p="relax"' + (prefs.relax ? " checked" : "") + '> &#x1F33F; のんびり（ボールを落としても減らない）</label></div>' +
        '<label class="melody-row"><span>言葉</span><select data-p="phrases">' +
        '<option value="1"' + (prefs.phrases ? " selected" : "") + '>単語とフレーズ</option><option value="0"' + (prefs.phrases ? "" : " selected") + '>単語だけ</option></select></label>' +
        '<label class="melody-row"><span>改行のしかた</span><select data-p="breakMode">';
      for (i = 0; i < LYRIC_BREAKS.length; i++) { html += '<option value="' + LYRIC_BREAKS[i].id + '"' + (LYRIC_BREAKS[i].id === prefs.breakMode ? " selected" : "") + ">" + LYRIC_BREAKS[i].name + "</option>"; }
      html += '</select></label>' +
        '<label class="melody-row"><span>言葉のつなぎ方</span><select data-p="joiner">' +
        '<option value="space"' + (prefs.joiner === "space" ? " selected" : "") + '>スペースで区切る</option><option value="none"' + (prefs.joiner === "none" ? " selected" : "") + '>つなげて書く</option></select></label>' +
        (canStart() ? "" : '<p class="small" style="color:#ff7675;margin:4px 0;">ジャンルを1つ以上選ぶか、ジャンルミックスをONにしてね。</p>') +
        '<div class="melody-actions"><button class="modal-btn" data-m="start"' + (canStart() ? "" : " disabled") + '>&#x25B6;&#xFE0F; スタート</button></div>' +
        '<h4 style="margin:12px 0 4px;">&#x1F4D2; 歌詞ノート（最大' + LYRIC_SAVE_MAX + '曲）</h4>' +
        (lyricMsg ? '<p class="small" style="color:#ffd166;margin:0 0 6px;">' + escHtml(lyricMsg) + '</p>' : '');
      if (!recs.length) { html += '<p class="small" style="color:#6c757d;">まだ歌詞はありません。遊ぶとゲーム終了時に保存されます。</p>'; }
      for (i = 0; i < recs.length; i++) {
        var r = recs[i], words = 0;
        for (var li = 0; li < r.lines.length; li++) { words += r.lines[li].words.length; }
        html += '<div class="melody-rec">' +
          '<div class="melody-rec-info"><b>' + escHtml(lyricTitle(r)) + '</b>' +
          '<span class="small">' + lyricDateText(r.date) + ' / ' + escHtml(lyricGenreText(r)) + '</span>' +
          '<span class="small" style="color:#adb5bd;">' + r.lines.length + '行・' + words + '語</span></div>' +
          '<button class="arcade-mini-btn" data-m="view" data-id="' + r.id + '" title="見る">&#x1F441;&#xFE0F;</button>' +
          '<button class="arcade-mini-btn melody-midi-btn" data-m="txt" data-id="' + r.id + '" title="テキストで保存">&#x1F4C4; 保存</button>' +
          '<button class="arcade-mini-btn" data-m="copy" data-id="' + r.id + '" title="コピー">&#x1F4CB;</button>' +
          '<button class="arcade-mini-btn" data-m="del" data-id="' + r.id + '" title="削除">&#x1F5D1;&#xFE0F;</button>' +
          '</div>';
        if (lyricOpenId === r.id) {
          html += '<textarea class="lyric-view" readonly rows="' + Math.min(14, r.lines.length + 6) + '">' + escHtml(lyricToText(r)) + '</textarea>';
        }
      }
      html += '<button class="modal-btn" data-m="back" style="width:100%;margin-top:10px;">&#x1F579;&#xFE0F; メニューへ</button></div>';
      root.innerHTML = html;
      var gcs = root.querySelectorAll("input[data-genre]");
      for (i = 0; i < gcs.length; i++) {
        gcs[i].onchange = function (ev) {
          var id = ev.currentTarget.getAttribute("data-genre"), at = prefs.genres.indexOf(id);
          if (ev.currentTarget.checked && at < 0) { prefs.genres.push(id); }
          if (!ev.currentTarget.checked && at >= 0) { prefs.genres.splice(at, 1); }
          savePrefs();
          render();
        };
      }
      var chks = root.querySelectorAll("input[data-p]");
      for (i = 0; i < chks.length; i++) {
        chks[i].onchange = function (ev) {
          var k = ev.currentTarget.getAttribute("data-p");
          prefs[k] = !!ev.currentTarget.checked;
          savePrefs();
          if (k === "mix") { render(); }
        };
      }
      var sels = root.querySelectorAll("select[data-p]");
      for (i = 0; i < sels.length; i++) {
        sels[i].onchange = function (ev) {
          var k = ev.currentTarget.getAttribute("data-p"), v = ev.currentTarget.value;
          prefs[k] = k === "phrases" ? v === "1" : v;
          savePrefs();
        };
      }
      var btns = root.querySelectorAll("button[data-m]");
      for (i = 0; i < btns.length; i++) { btns[i].onclick = onButton; }
    }
    function findRec(id) {
      var all = lyricLoadSaved();
      for (var i = 0; i < all.length; i++) { if (all[i].id === id) { return all[i]; } }
      return null;
    }
    function onButton(ev) {
      var m = ev.currentTarget.getAttribute("data-m"), id = parseInt(ev.currentTarget.getAttribute("data-id"), 10), r;
      if (m === "start") {
        if (!canStart()) { return; }
        lyricMsg = "";
        ctl.done({ genres: prefs.genres.slice(), mix: prefs.mix, phrases: prefs.phrases, fillers: prefs.fillers, breakMode: prefs.breakMode, joiner: prefs.joiner, relax: prefs.relax });
      } else if (m === "back") {
        ctl.back();
      } else if (m === "view") {
        lyricOpenId = lyricOpenId === id ? null : id;
        render();
      } else if (m === "txt") {
        r = findRec(id);
        if (r) {
          var how = I.saveBlob(new Blob([lyricToText(r)], { type: "text/plain;charset=utf-8" }), lyricFileName(r));
          lyricMsg = how === "fail" ? "保存できませんでした。👁 で開いて選択→コピーしてね。" : "📄 テキストを" + (how === "share" ? "共有メニューに出しました" : "保存しました") + "（" + lyricFileName(r) + "）";
          render();
        }
      } else if (m === "copy") {
        r = findRec(id);
        if (!r) { return; }
        var text = lyricToText(r);
        var fallback = function () { lyricOpenId = id; lyricMsg = "自動コピーできない環境です。下の欄を長押し（またはドラッグ）して選択→コピーしてね。"; render(); };
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () { lyricMsg = "📋 コピーしました"; if (I.isSetupRoot(root)) { render(); } }, function () { if (I.isSetupRoot(root)) { fallback(); } });
          } else { fallback(); }
        } catch (e) { fallback(); }
      } else if (m === "del") {
        if (window.confirm && !window.confirm("この歌詞を削除しますか？")) { return; }
        lyricDelete(id);
        if (lyricOpenId === id) { lyricOpenId = null; }
        render();
      }
    }
    render();
  }

  // ---------------------------------------------------------
  // ゲーム
  // ---------------------------------------------------------
  I.register({
    id: "lyrics",
    cat: "music",
    after: "melody",
    name: "歌詞くずし",
    icon: "&#x270D;&#xFE0F;",
    desc: "言葉ブロックを打ち落として作詞！ジャンルを混ぜると思わぬ名フレーズも",
    help: "←→移動 / Space発射 / Enter改行 / Backspaceで1語取消 / 画面ドラッグでも移動 / P一時停止",
    controls: [
      { action: "left", label: "&#x25C0;" },
      { action: "launch", label: "&#x1F680;" },
      { action: "right", label: "&#x25B6;" },
      { action: "nl", label: "&#x21B5; 改行" },
      { action: "undo", label: "&#x232B;" }
    ],
    keys: { "ArrowLeft": "left", "ArrowRight": "right", " ": "launch", "ArrowUp": "launch", "Enter": "nl", "Backspace": "undo" },
    setup: lyricSetup,
    panel: true,
    create: function (api, cfg) {
      cfg = cfg || lyricLoadPrefs();
      var PW = 44, PH = 6, PY = 292, BR = 4;
      var pad = { x: W / 2 }, held = { left: false, right: false };
      var ball = { x: W / 2, y: PY - BR - 1, vx: 0, vy: 0 };
      var stuck = true, lives = 3, stage = 1, frame = 0, msg = 0;
      var pool = lyricPool(cfg), bricks = lyricBuildStage(cfg, pool);
      var lines = [], cur = { t: 0, words: [] }, pops = [], full = false;

      function tms() { return Math.round(frame * 1000 / 60); }
      function renderPanel() {
        if (!api.panel) { return; }
        var html = "", from = Math.max(0, lines.length - 8);
        if (!lines.length && !cur.words.length) { html = '<div class="lyric-hint">言葉のブロックを打つと、ここに歌詞が書かれていくよ</div>'; }
        for (var i = from; i < lines.length; i++) { html += '<div class="lyric-line">' + escHtml(lyricLineText(lines[i], cfg.joiner)) + '</div>'; }
        if (cur.words.length || lines.length) { html += '<div class="lyric-line lyric-cur">' + escHtml(lyricLineText(cur, cfg.joiner)) + '<span class="lyric-caret">▌</span></div>'; }
        var words = cur.words.length;
        for (var j = 0; j < lines.length; j++) { words += lines[j].words.length; }
        html += '<div class="lyric-count">' + lines.length + '行・' + words + '語' + (full ? '（上限）' : '') + '</div>';
        api.panel.innerHTML = html;
      }
      function commit() {
        if (!cur.words.length) { return; }
        lines.push(cur);
        cur = { t: 0, words: [] };
        if (lines.length >= LYRIC_MAX_LINES) { full = true; }
        renderPanel();
      }
      function addWord(w, kind, x, y, col) {
        if (full) { return; }
        if (!cur.words.length) { cur.t = tms(); }
        cur.words.push({ w: w, t: tms(), kind: kind });
        pops.push({ x: clamp(x, 30, W - 30), y: clamp(y, 14, H - 40), text: (kind === "coined" ? "✨" : "") + w, t: 50, col: col });
        if (pops.length > 6) { pops.shift(); }
        if (cfg.breakMode === "four" && cur.words.length >= 4) { commit(); }
        renderPanel();
      }
      function undo() {
        if (!cur.words.length && lines.length) { cur = lines.pop(); full = false; }
        if (cur.words.length) { cur.words.pop(); }
        renderPanel();
      }
      // 造語: 選んだジャンルの言葉2つから作る
      function coin(x, y) {
        var words = [];
        for (var i = 0; i < pool.length; i++) { if (pool[i].kind === "word") { words.push(pool[i].w); } }
        if (words.length < 2) { return; }
        var a = words[randInt(0, words.length - 1)], b = words[randInt(0, words.length - 1)], tries = 0;
        while (b === a && tries++ < 10) { b = words[randInt(0, words.length - 1)]; }
        addWord(lyricCoin(a, b), "coined", x, y, LYRIC_COIN_COLOR);
      }
      function speed() { return Math.min(6, 3.2 + (stage - 1) * 0.3); }
      function launch() {
        if (!stuck) { return; }
        stuck = false;
        var a = (Math.random() - 0.5) * 0.8;
        ball.vx = speed() * Math.sin(a);
        ball.vy = -speed() * Math.cos(a);
      }

      renderPanel();

      return {
        input: function (action, down) {
          if (action === "left" || action === "right") { held[action] = down; }
          if (!down) { return; }
          if (action === "launch") { launch(); }
          else if (action === "nl") { commit(); }
          else if (action === "undo") { undo(); }
        },
        pointer: function (type, x) {
          if (type === "down" || type === "move") { pad.x = clamp(x, PW / 2, W - PW / 2); }
          if (type === "down") { launch(); }
        },
        finish: function () {
          commit();
          if (!lines.length) { return; }
          lyricSave({ id: Date.now(), date: Date.now(), genres: (cfg.genres || []).slice(), mix: !!cfg.mix, joiner: cfg.joiner, lines: lines });
        },
        step: function () {
          var k, s;
          frame++;
          if (msg > 0) { msg--; }
          for (k = pops.length - 1; k >= 0; k--) { pops[k].t--; if (pops[k].t <= 0) { pops.splice(k, 1); } }
          if (held.left) { pad.x -= 3.6; }
          if (held.right) { pad.x += 3.6; }
          pad.x = clamp(pad.x, PW / 2, W - PW / 2);
          if (stuck) { ball.x = pad.x; ball.y = PY - BR - 1; return; }
          for (s = 0; s < 3; s++) {
            var px = ball.x, py = ball.y;
            ball.x += ball.vx / 3;
            ball.y += ball.vy / 3;
            if (ball.x < BR) { ball.x = BR; ball.vx = Math.abs(ball.vx); }
            if (ball.x > W - BR) { ball.x = W - BR; ball.vx = -Math.abs(ball.vx); }
            if (ball.y < BR) { ball.y = BR; ball.vy = Math.abs(ball.vy); }
            if (ball.vy > 0 && ball.y + BR >= PY && py + BR <= PY + PH && Math.abs(ball.x - pad.x) <= PW / 2 + BR) {
              var rel = clamp((ball.x - pad.x) / (PW / 2), -1, 1), sp = speed();
              ball.vx = sp * Math.sin(rel * 1.05);
              ball.vy = -sp * Math.cos(rel * 1.05);
              ball.y = PY - BR;
              if (cfg.breakMode === "rally") { commit(); }
            }
            for (k = 0; k < bricks.length; k++) {
              var b = bricks[k];
              if (!b.alive) { continue; }
              var cx = clamp(ball.x, b.x, b.x + b.w), cy = clamp(ball.y, b.y, b.y + b.h);
              var dx = ball.x - cx, dy = ball.y - cy;
              if (dx * dx + dy * dy > BR * BR) { continue; }
              if (px >= b.x && px <= b.x + b.w) { ball.vy = -ball.vy; ball.y = py; }
              else { ball.vx = -ball.vx; ball.x = px; }
              b.alive = false;
              if (b.kind === "coin") { coin(b.x + b.w / 2, b.y); api.addScore(30); }
              else { addWord(b.text, b.kind, b.x + b.w / 2, b.y, b.color); api.addScore(10); }
              break;
            }
          }
          if (ball.y > H + 10) {
            if (!cfg.relax) { lives--; }
            if (lives <= 0) { api.gameOver(); return; }
            stuck = true; ball.vx = 0; ball.vy = 0;
          }
          var left = 0;
          for (k = 0; k < bricks.length; k++) { if (bricks[k].alive) { left++; } }
          if (left === 0) { stage++; bricks = lyricBuildStage(cfg, pool); stuck = true; ball.vx = 0; ball.vy = 0; msg = 90; }
        },
        draw: function (ctx) {
          var k;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          for (k = 0; k < bricks.length; k++) {
            var b = bricks[k];
            if (!b.alive) { continue; }
            ctx.fillStyle = b.color;
            ctx.fillRect(b.x, b.y, b.w, b.h);
            ctx.fillStyle = "rgba(255,255,255,0.25)";
            ctx.fillRect(b.x, b.y, b.w, 2);
            ctx.fillStyle = (b.kind === "coin" || b.color === LYRIC_FILLER_COLOR || b.genre === "food" || b.genre === "nature") ? "#2d3436" : "#ffffff";
            ctx.font = "bold 9px sans-serif";
            ctx.fillText(b.text, b.x + b.w / 2, b.y + b.h / 2 + 0.5);
          }
          ctx.fillStyle = "#74b9ff";
          ctx.fillRect(pad.x - PW / 2, PY, PW, PH);
          ctx.fillStyle = "#ffffff";
          ctx.beginPath(); ctx.arc(ball.x, ball.y, BR, 0, Math.PI * 2); ctx.fill();
          ctx.font = "bold 13px sans-serif";
          for (k = 0; k < pops.length; k++) {
            ctx.globalAlpha = Math.min(1, pops[k].t / 25);
            ctx.fillStyle = pops[k].col;
            ctx.fillText(pops[k].text, pops[k].x, pops[k].y + 18 - (50 - pops[k].t) * 0.5);
          }
          ctx.globalAlpha = 1;
          var curText = lyricLineText(cur, cfg.joiner);
          hudText(ctx, curText ? "♪ " + (lyricChars(curText).length > 22 ? "…" + lyricChars(curText).slice(-21).join("") : curText) : "♪ " + (lines.length + 1) + "行目", 6, 14);
          hudText(ctx, "LIFE " + (cfg.relax ? "∞" : lives) + "   STAGE " + stage + "   " + lines.length + "行", 6, 312);
          if (stuck) { hudText(ctx, "タップ or 発射でスタート", W / 2, 220, "center"); }
          if (msg > 0) {
            ctx.fillStyle = "#55efc4";
            ctx.font = "bold 18px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("STAGE " + stage, W / 2, 180);
          }
        }
      };
    }
  });

  // テスト・将来のメロディ連携用（ゲームの動作には使わない）
  window.UGLyrics = {
    genres: LYRIC_GENRES, fillers: LYRIC_FILLERS, coin: lyricCoin, chars: lyricChars, textWidth: lyricTextWidth,
    pool: lyricPool, buildStage: lyricBuildStage, toText: lyricToText, fileName: lyricFileName, loadSaved: lyricLoadSaved, loadPrefs: lyricLoadPrefs
  };
})();
