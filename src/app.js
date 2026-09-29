/* 应用主控：界面渲染、交互、发音、动画、存储 */
(function () {
  "use strict";
  var G = window.GameLogic;
  var BANK = window.WORD_BANK;
  var STORE_KEY = "powerup_adventure_v1";

  var DIFFS = { easy: 3, mid: 4, hard: 5 };
  var DIFF_LABEL = { easy: "简单 3+3", mid: "进阶 4+4", hard: "挑战 5+5" };

  /* ---------------- 存储 ---------------- */
  function defaultState() {
    return {
      progress: {}, // id -> {box,due,correct,wrong,lastSeen,seen,en,zh,level,unit}
      stats: { stars: 0, matches: 0, rounds: 0, perfectRounds: 0, streak: 0, lastPlayDay: "", days: [] },
      settings: { level: "L1", units: "ALL", difficulty: "easy", sound: true }
    };
  }
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE_KEY));
      if (!s || !s.progress) return defaultState();
      var d = defaultState();
      s.stats = Object.assign(d.stats, s.stats || {});
      s.settings = Object.assign(d.settings, s.settings || {});
      s.progress = s.progress || {};
      return s;
    } catch (e) {
      return defaultState();
    }
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
  }
  var state = load();

  function todayStr(d) {
    d = d || new Date();
    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
  }
  function bumpStreak() {
    var t = todayStr();
    var st = state.stats;
    if (st.lastPlayDay === t) return;
    var yStr = todayStr(new Date(Date.now() - 86400000));
    if (st.lastPlayDay === yStr) st.streak = (st.streak || 0) + 1;
    else st.streak = 1;
    st.lastPlayDay = t;
    if (st.days.indexOf(t) === -1) st.days.push(t);
    save();
  }

  /* ---------------- 发音 ---------------- */
  var voices = [];
  function loadVoices() { voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : []; }
  if (window.speechSynthesis) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }
  function pickVoice(lang) {
    if (!voices.length) loadVoices();
    var exact = voices.filter(function (v) { return v.lang && v.lang.toLowerCase().indexOf(lang.toLowerCase()) === 0; });
    if (exact.length) return exact[0];
    var base = lang.split("-")[0].toLowerCase();
    var loose = voices.filter(function (v) { return v.lang && v.lang.toLowerCase().indexOf(base) === 0; });
    return loose[0] || null;
  }
  function speak(text, lang) {
    if (!state.settings.sound) return;
    if (!window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      var v = pickVoice(lang);
      if (v) u.voice = v;
      u.rate = 0.85; u.pitch = 1.1;
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }

  /* ---------------- 音效（Web Audio 轻量提示音） ---------------- */
  var actx = null;
  function beep(type) {
    if (!state.settings.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      var o = actx.createOscillator(), g = actx.createGain();
      o.connect(g); g.connect(actx.destination);
      if (type === "good") { o.frequency.value = 660; o.type = "sine"; }
      else if (type === "win") { o.frequency.value = 880; o.type = "triangle"; }
      else { o.frequency.value = 180; o.type = "square"; }
      g.gain.setValueAtTime(0.001, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.25, actx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.3);
      o.start(); o.stop(actx.currentTime + 0.3);
    } catch (e) {}
  }

  /* ---------------- 记录答题 ---------------- */
  function currentPool() {
    return G.buildPool(BANK, { level: state.settings.level, units: state.settings.units });
  }
  function fullPool() { return G.buildPool(BANK, { level: "ALL", units: "ALL" }); }

  function record(word, correct) {
    var id = word.id || word.en;
    var prev = state.progress[id] || G.initProgress();
    var np = G.scheduleAfterAnswer(prev, correct, Date.now());
    np.en = word.en; np.zh = word.zh; np.level = word.level; np.unit = word.unit;
    state.progress[id] = np;
    save();
  }
  function wordFromId(id) {
    var fp = fullPool();
    for (var i = 0; i < fp.length; i++) if (fp[i].id === id) return fp[i];
    var p = state.progress[id];
    return p ? { id: id, en: p.en, zh: p.zh, level: p.level, unit: p.unit } : { id: id, en: id, zh: id };
  }

  /* ---------------- 路由 ---------------- */
  var root = document.getElementById("app-root");
  function show(html) { root.innerHTML = html; }

  function topbarHtml() {
    var s = state.stats;
    return '<div class="topbar">' +
      '<div class="brand"><div class="logo">⚡</div><div><h1>PowerUp 单词冒险</h1><p>今天也要加油鸭！</p></div></div>' +
      '<div class="stats">' +
      '<div class="chip"><div class="ico">🔥</div><div class="val">' + (s.streak || 0) + '天</div></div>' +
      '<div class="chip"><div class="ico">⭐</div><div class="val">' + (s.stars || 0) + '</div></div>' +
      '</div></div>';
  }

  /* ---------------- 首页 ---------------- */
  function renderHome() {
    var pool = currentPool();
    var due = G.countDue(pool, state.progress, Date.now());
    var lv = state.settings.level;
    var levels = [["L1", "一级 Level 1"], ["L2", "二级 Level 2"], ["ALL", "全部混合"]];
    var tabs = levels.map(function (x) {
      return '<button class="tab ' + (lv === x[0] ? "active" : "") + '" data-act="setlevel" data-lv="' + x[0] + '">' + x[1] + '</button>';
    }).join("");

    show(topbarHtml() +
      '<div class="tabs">' + tabs + '</div>' +
      '<div class="hero" data-act="openplay"><div><div class="t">🎯 单词消消乐</div><div class="s">英文配中文，配对消除，闯关得星星</div></div><div class="go">开始 ▶</div></div>' +
      '<div class="grid">' +
      '<div class="entry amber" data-act="review"><div class="ei">📅</div><div class="en">今日复习</div><div class="ed">遗忘曲线智能推送</div>' + (due > 0 ? '<div class="badge">' + due + '</div>' : '') + '</div>' +
      '<div class="entry coral" data-act="wrong"><div class="ei">📕</div><div class="en">错题本</div><div class="ed">错过的都在这里练</div></div>' +
      '<div class="entry green" data-act="mastered"><div class="ei">✅</div><div class="en">已掌握</div><div class="ed">你认识的单词墙</div></div>' +
      '<div class="entry purple" data-act="badges"><div class="ei">🏆</div><div class="en">成就 · 徽章</div><div class="ed">收集勋章看进度</div></div>' +
      '</div>' +
      '<div class="backup-bar">' +
      '<button class="backup-btn" data-act="export">⬇️ 导出进度</button>' +
      '<button class="backup-btn" data-act="import">⬆️ 导入进度</button>' +
      '<span class="backup-tip">换设备/换浏览器时用：先导出，再到另一台导入</span>' +
      '</div>');
  }

  /* ---------------- 导出 / 导入进度（跨设备） ---------------- */
  function openExport() {
    var code = G.encodeState(state);
    var mask = document.createElement("div");
    mask.className = "sheet-mask";
    mask.innerHTML = '<div class="sheet">' +
      '<h3>导出进度</h3>' +
      '<p class="speak-hint">把下面的内容复制，或下载文件，发到另一台设备（微信/备忘录/隔空投送都行）。在新设备上「导入进度」即可继续。</p>' +
      '<textarea class="code-box" id="expcode" readonly>' + code + '</textarea>' +
      '<div class="sheet-actions">' +
      '<button class="btn-ghost" data-act="copycode">📋 复制</button>' +
      '<button class="btn-ghost" data-act="dlfile">💾 下载文件</button>' +
      '<button class="btn-primary" data-act="closesheet">完成</button>' +
      '</div></div>';
    document.body.appendChild(mask);
    mask.addEventListener("click", function (e) {
      if (e.target === mask) { mask.remove(); return; }
      var t = e.target.closest("[data-act]"); if (!t) return;
      var act = t.getAttribute("data-act");
      if (act === "closesheet") mask.remove();
      else if (act === "copycode") {
        var ta = document.getElementById("expcode");
        ta.focus(); ta.select();
        var done = function () { t.textContent = "✅ 已复制"; setTimeout(function () { t.textContent = "📋 复制"; }, 1500); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(code).then(done, function () { try { document.execCommand("copy"); done(); } catch (e2) {} });
        } else {
          try { document.execCommand("copy"); done(); } catch (e2) {}
        }
      } else if (act === "dlfile") {
        try {
          var blob = new Blob([code], { type: "text/plain;charset=utf-8" });
          var url = URL.createObjectURL(blob);
          var a = document.createElement("a");
          a.href = url; a.download = "powerup进度.txt";
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        } catch (e) {}
      }
    });
  }

  function openImport() {
    var mask = document.createElement("div");
    mask.className = "sheet-mask";
    mask.innerHTML = '<div class="sheet">' +
      '<h3>导入进度</h3>' +
      '<p class="speak-hint">把另一台设备「导出」的内容粘贴进来，或选择导出的文件。导入会合并两边进度，不会丢失任何一边。</p>' +
      '<textarea class="code-box" id="impcode" placeholder="在此粘贴导出的内容…"></textarea>' +
      '<div class="file-row"><label class="btn-ghost">📁 选择文件<input type="file" id="impfile" accept=".txt,.json,.html" style="display:none"></label>' +
      '<span id="impfname" class="impfname"></span></div>' +
      '<div id="impmsg" class="impmsg"></div>' +
      '<div class="sheet-actions">' +
      '<button class="btn-ghost" data-act="closesheet">取消</button>' +
      '<button class="btn-primary" data-act="doimport">导入 ▶</button>' +
      '</div></div>';
    document.body.appendChild(mask);
    var fileInput = mask.querySelector("#impfile");
    var fname = mask.querySelector("#impfname");
    fileInput.addEventListener("change", function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      fname.textContent = f.name;
      var reader = new FileReader();
      reader.onload = function () { mask.querySelector("#impcode").value = String(reader.result).trim(); };
      reader.readAsText(f);
    });
    mask.addEventListener("click", function (e) {
      if (e.target === mask) { mask.remove(); return; }
      var t = e.target.closest("[data-act]"); if (!t) return;
      var act = t.getAttribute("data-act");
      if (act === "closesheet") mask.remove();
      else if (act === "doimport") {
        var raw = mask.querySelector("#impcode").value;
        var incoming = G.decodeState(raw);
        var msg = mask.querySelector("#impmsg");
        if (!incoming) { msg.textContent = "❌ 内容无效，请重新粘贴或选择正确文件"; msg.className = "impmsg err"; return; }
        var before = Object.keys(state.progress).length;
        state = G.mergeState(state, incoming);
        save();
        msg.textContent = "✅ 导入成功！已合并 " + Object.keys(incoming.progress).length + " 个词的进度（原有 " + before + " 个，现共 " + Object.keys(state.progress).length + " 个）";
        msg.className = "impmsg ok";
        setTimeout(function () { mask.remove(); renderHome(); }, 1400);
      }
    });
  }

  /* ---------------- 单元选择弹层 ---------------- */
  function openPlaySheet() {
    var lv = state.settings.level;
    var diff = state.settings.difficulty;
    var selUnits = state.settings.units; // "ALL" 或数组
    var unitKeys = [];
    if (lv === "ALL") unitKeys = [];
    else unitKeys = Object.keys(BANK[lv].units);

    function diffBtns() {
      return ["easy", "mid", "hard"].map(function (d) {
        return '<button class="diff ' + (diff === d ? "active" : "") + '" data-act="setdiff" data-d="' + d + '">' + DIFF_LABEL[d] + '</button>';
      }).join("");
    }
    function unitBtns() {
      if (lv === "ALL") return '<div class="speak-hint">全部混合模式：一级二级所有单词随机出现</div>';
      var all = '<button class="unit-chip ' + (selUnits === "ALL" ? "active" : "") + '" data-act="setunit" data-u="ALL">全部单元</button>';
      var chips = unitKeys.map(function (u) {
        var active = Array.isArray(selUnits) && selUnits.indexOf(u) !== -1;
        return '<button class="unit-chip ' + (active ? "active" : "") + '" data-act="setunit" data-u="' + u + '">' + BANK[lv].units[u].title + '</button>';
      }).join("");
      return all + chips;
    }
    var mask = document.createElement("div");
    mask.className = "sheet-mask";
    mask.innerHTML = '<div class="sheet">' +
      '<h3>选择难度</h3><div class="diff-row">' + diffBtns() + '</div>' +
      '<h3>选择范围（' + (lv === "ALL" ? "全部混合" : BANK[lv].title) + '）</h3><div class="unit-grid">' + unitBtns() + '</div>' +
      '<div class="sheet-actions"><button class="btn-ghost" data-act="closesheet">取消</button><button class="btn-primary" data-act="startplay">开始游戏 ▶</button></div>' +
      '</div>';
    document.body.appendChild(mask);

    mask.addEventListener("click", function (e) {
      if (e.target === mask) { mask.remove(); return; }
      var t = e.target.closest("[data-act]"); if (!t) return;
      var act = t.getAttribute("data-act");
      if (act === "setdiff") { state.settings.difficulty = t.getAttribute("data-d"); save(); mask.remove(); openPlaySheet(); }
      else if (act === "setunit") {
        var u = t.getAttribute("data-u");
        if (u === "ALL") state.settings.units = "ALL";
        else {
          var cur = Array.isArray(state.settings.units) ? state.settings.units.slice() : [];
          var i = cur.indexOf(u);
          if (i === -1) cur.push(u); else cur.splice(i, 1);
          state.settings.units = cur.length ? cur : "ALL";
        }
        save(); mask.remove(); openPlaySheet();
      }
      else if (act === "closesheet") mask.remove();
      else if (act === "startplay") { mask.remove(); startGame("play"); }
    });
  }

  /* ---------------- 游戏 ---------------- */
  var session = null;
  function startGame(source) {
    bumpStreak();
    var roundSize = DIFFS[state.settings.difficulty] || 3;
    var pool;
    if (source === "review") {
      var base = currentPool();
      var due = G.pickDueWords(base, state.progress, Date.now());
      if (due.length < roundSize + 1) {
        // 到期不足，用全部当前范围补齐，仍智能优先
        pool = base;
      } else {
        pool = due.concat(base); // 去重由 buildPool 保证 base 唯一；此处只需保证足够
      }
      if (base.length < roundSize + 1) pool = fullPool();
    } else {
      pool = currentPool();
      if (pool.length < roundSize + 1) pool = fullPool();
    }
    session = { source: source, roundSize: roundSize, pool: pool, level: 1, selEn: null, selCn: null, cleared: 0, round: null, locked: false };
    nextRound();
    renderGame();
  }

  function nextRound() {
    var rs = session.roundSize;
    var words = G.pickRoundWords(session.pool, rs + 1, state.progress, Date.now(), Math.random, true);
    session.round = G.buildRoundFromWords(words, rs, Math.random);
    session.selEn = null; session.selCn = null; session.cleared = 0; session.locked = false;
  }

  function tileHtml(t) {
    return '<div class="tile ' + t.side + '" data-tile="' + t.tileId + '" data-word="' + t.wordId + '" data-side="' + t.side + '">' + t.text + '</div>';
  }
  function renderGame() {
    var r = session.round;
    var total = r.correctPairIds.length;
    var pct = Math.round((session.cleared / total) * 100);
    var head = '<div class="page-head"><button class="btn-back" data-act="home">← 返回</button>' +
      '<div class="page-title">第 ' + session.level + ' 关 · ⭐ ' + state.stats.stars + '</div>' +
      '<button class="icon-btn ' + (state.settings.sound ? "on" : "") + '" data-act="togglesound">' + (state.settings.sound ? "🔊" : "🔇") + '</button></div>';
    var game = '<div class="game-wrap">' +
      '<div class="progress"><i style="width:' + pct + '%"></i></div>' +
      '<div class="hint">' + (session.source === "review" ? "复习模式 · " : "") + '找出配对的英文和中文 👇 已配对 ' + session.cleared + '/' + total + '</div>' +
      '<div class="board" style="--n:' + r.roundSize + '">' +
      '<div class="tile-row" id="row-en">' + r.enTiles.map(tileHtml).join("") + '</div>' +
      '<div class="tile-row" id="row-cn">' + r.cnTiles.map(tileHtml).join("") + '</div>' +
      '</div>' +
      '<div class="game-foot"><div class="last-clear" id="lastclear">选一个英文，再选一个中文，配对成功就消除 🎉</div>' +
      '<button class="btn-skip" data-act="skip">换一批 ⏭</button></div>' +
      '</div><div class="speak-hint">点方块会读出发音（英式）</div>';
    show(head + game);
  }

  function tileEl(id) { return document.querySelector('[data-tile="' + id + '"]'); }

  function onTileTap(el) {
    if (session.locked) return;
    var side = el.getAttribute("data-side");
    var tileId = el.getAttribute("data-tile");
    var wordId = el.getAttribute("data-word");
    if (el.classList.contains("matched")) return;

    // 发音
    if (side === "en") speak(el.textContent, "en-GB");
    else speak(el.textContent, "zh-CN");

    if (side === "en") {
      if (session.selEn === tileId) { session.selEn = null; el.classList.remove("sel"); return; }
      if (session.selEn) { var old = tileEl(session.selEn); old && old.classList.remove("sel"); }
      session.selEn = tileId; el.classList.add("sel");
    } else {
      if (session.selCn === tileId) { session.selCn = null; el.classList.remove("sel"); return; }
      if (session.selCn) { var oldc = tileEl(session.selCn); oldc && oldc.classList.remove("sel"); }
      session.selCn = tileId; el.classList.add("sel");
    }
    if (session.selEn && session.selCn) evaluate();
  }

  function evaluate() {
    var enEl = tileEl(session.selEn), cnEl = tileEl(session.selCn);
    var r = session.round;
    var enTile = r.enTiles.find(function (t) { return t.tileId === session.selEn; });
    var cnTile = r.cnTiles.find(function (t) { return t.tileId === session.selCn; });
    var matched = G.checkMatch(enTile, cnTile);
    session.locked = true;

    if (matched) {
      record(wordFromId(enTile.wordId), true);
      beep("good");
      enEl.classList.add("good"); cnEl.classList.add("good");
      setTimeout(function () {
        enEl.classList.add("matched"); cnEl.classList.add("matched");
        session.cleared += 1;
        var last = document.getElementById("lastclear");
        if (last) last.textContent = "✅ 已消除：" + enTile.en + " - " + cnTile.zh;
        session.selEn = null; session.selCn = null; session.locked = false;
        var total = r.correctPairIds.length;
        var prog = document.querySelector(".progress > i");
        if (prog) prog.style.width = Math.round((session.cleared / total) * 100) + "%";
        var hint = document.querySelector(".hint");
        if (hint) hint.textContent = (session.source === "review" ? "复习模式 · " : "") + "找出配对的英文和中文 👇 已配对 " + session.cleared + "/" + total;
        if (session.cleared >= total) roundComplete();
      }, 320);
    } else {
      // 记英文侧为错
      record(wordFromId(enTile.wordId), false);
      beep("bad");
      enEl.classList.add("wrong"); cnEl.classList.add("wrong");
      setTimeout(function () {
        enEl.classList.remove("wrong", "sel"); cnEl.classList.remove("wrong", "sel");
        session.selEn = null; session.selCn = null; session.locked = false;
        var last = document.getElementById("lastclear");
        if (last) last.textContent = "再试试～ (" + enTile.en + " 不是 " + cnTile.zh + ")";
      }, 480);
    }
  }

  function roundComplete() {
    state.stats.matches += session.round.correctPairIds.length;
    state.stats.rounds += 1;
    state.stats.stars += 10 + session.round.correctPairIds.length * 2;
    state.stats.perfectRounds += 1;
    save();
    beep("win");
    try { window.Confetti && window.Confetti.burst({ y: window.innerHeight / 3 }); } catch (e) {}
    showToast("🎉", "太棒了！过关啦");
    setTimeout(function () {
      session.level += 1;
      nextRound();
      renderGame();
    }, 1400);
  }

  function showToast(big, msg) {
    var t = document.createElement("div");
    t.className = "toast";
    t.innerHTML = '<div class="big">' + big + '</div><div class="msg">' + msg + '</div>';
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add("show"); });
    setTimeout(function () { t.classList.remove("show"); setTimeout(function () { t.remove(); }, 300); }, 1200);
  }

  /* ---------------- 词表页 ---------------- */
  function listPage(title, cards, emptyIco, emptyMsg) {
    var body = cards.length
      ? '<div class="wordlist">' + cards + '</div>'
      : '<div class="empty"><div class="ei">' + emptyIco + '</div>' + emptyMsg + '</div>';
    show('<div class="page-head"><button class="btn-back" data-act="home">← 返回</button><div class="page-title">' + title + '</div><div style="width:52px"></div></div>' + body);
  }
  function fmtDate(ts) {
    if (!ts) return "";
    var d = new Date(ts);
    return (d.getMonth() + 1) + "/" + d.getDate();
  }
  function renderWrong() {
    var items = Object.keys(state.progress).map(function (id) { return state.progress[id]; })
      .filter(function (p) { return p.wrong > 0; })
      .sort(function (a, b) { return b.wrong - a.wrong || b.lastSeen - a.lastSeen; });
    var cards = items.map(function (p) {
      return '<div class="word-card wrongc" data-act="say" data-en="' + p.en + '"><div class="we">' + p.en + '</div><div class="wz">' + p.zh + '</div>' +
        '<div class="wm"><span>错 ' + p.wrong + ' 次</span><span>' + fmtDate(p.lastSeen) + '</span></div></div>';
    }).join("");
    listPage("📕 错题本", cards, "🎈", "还没有错题，太厉害啦！");
  }
  function isProficient(p) { return p.box >= 4 || (p.correct >= 3 && p.wrong === 0); }
  function renderMastered() {
    var items = Object.keys(state.progress).map(function (id) { return state.progress[id]; })
      .filter(function (p) { return p.correct >= 1; })
      .sort(function (a, b) {
        var pa = isProficient(a) ? 1 : 0, pb = isProficient(b) ? 1 : 0;
        return pb - pa || b.correct - a.correct || b.box - a.box;
      });
    var profCount = items.filter(isProficient).length;
    var cards = items.map(function (p) {
      var tag = isProficient(p) ? '<span class="prof">🌟 熟练</span>' : '<span>Lv.' + p.box + '</span>';
      var wrongTxt = p.wrong > 0 ? ' · 错 ' + p.wrong + ' 次' : '';
      return '<div class="word-card rightc" data-act="say" data-en="' + p.en + '"><div class="we">' + p.en + '</div><div class="wz">' + p.zh + '</div>' +
        '<div class="wm"><span>对 ' + p.correct + ' 次' + wrongTxt + '</span>' + tag + '</div></div>';
    }).join("");
    var head = items.length ? '<div style="margin-bottom:12px;color:var(--ink-soft);font-size:16px">会认 ' + items.length + ' 个 · 其中 🌟熟练 ' + profCount + ' 个（连对3次不出错）</div>' : "";
    listPage("✅ 已掌握", head + cards, "🌱", "还没有掌握的单词，快去消消乐吧！");
  }
  function renderReviewList() {
    var pool = currentPool();
    var due = G.pickDueWords(pool, state.progress, Date.now());
    if (due.length === 0) {
      listPage("📅 今日复习", "", "🌈", "今天没有需要复习的单词，休息一下吧～");
      return;
    }
    var cards = due.map(function (w) {
      var p = state.progress[w.id];
      return '<div class="word-card wrongc" data-act="say" data-en="' + w.en + '"><div class="we">' + w.en + '</div><div class="wz">' + w.zh + '</div>' +
        '<div class="wm"><span>盒子 ' + p.box + '</span><span>错 ' + p.wrong + '</span></div></div>';
    }).join("");
    var startBtn = '<div style="margin:16px 0"><button class="btn-primary" data-act="startreview">开始复习这些单词 ▶</button></div>';
    show('<div class="page-head"><button class="btn-back" data-act="home">← 返回</button><div class="page-title">📅 今日复习（' + due.length + '）</div><div style="width:52px"></div></div>' + startBtn + '<div class="wordlist">' + cards + '</div>');
  }
  function renderBadges() {
    var s = state.stats;
    var mastered = Object.keys(state.progress).filter(function (id) { return state.progress[id].correct >= 1; }).length;
    var defs = [
      { ico: "🥇", name: "初次通关", desc: "完成第一关", got: s.rounds >= 1 },
      { ico: "🔥", name: "坚持3天", desc: "连续打卡3天", got: (s.streak || 0) >= 3 },
      { ico: "⭐", name: "星星达人", desc: "累计100星", got: (s.stars || 0) >= 100 },
      { ico: "🌱", name: "小小词汇", desc: "掌握10个词", got: mastered >= 10 },
      { ico: "🌟", name: "词汇小达人", desc: "掌握50个词", got: mastered >= 50 },
      { ico: "💯", name: "百次消除", desc: "累计消除100对", got: (s.matches || 0) >= 100 },
      { ico: "🏆", name: "闯关高手", desc: "通关20次", got: (s.rounds || 0) >= 20 },
      { ico: "👑", name: "单词之王", desc: "掌握100个词", got: mastered >= 100 }
    ];
    var cards = defs.map(function (b) {
      return '<div class="badge-card ' + (b.got ? "" : "locked") + '"><div class="bi">' + b.ico + '</div><div class="bn">' + b.name + '</div><div class="bd">' + b.desc + '</div></div>';
    }).join("");
    show('<div class="page-head"><button class="btn-back" data-act="home">← 返回</button><div class="page-title">🏆 成就 · 徽章</div><div style="width:52px"></div></div>' +
      '<div style="margin-bottom:14px;color:var(--ink-soft);font-size:16px">已掌握 ' + mastered + ' 词 · 通关 ' + (s.rounds || 0) + ' 次 · ⭐ ' + (s.stars || 0) + '</div>' +
      '<div class="badges">' + cards + '</div>');
  }

  /* ---------------- 全局事件委托 ---------------- */
  document.addEventListener("click", function (e) {
    var tileT = e.target.closest(".tile");
    if (tileT && document.getElementById("row-en")) { onTileTap(tileT); return; }
    var t = e.target.closest("[data-act]"); if (!t) return;
    var act = t.getAttribute("data-act");
    switch (act) {
      case "home": renderHome(); break;
      case "setlevel": state.settings.level = t.getAttribute("data-lv"); if (state.settings.level === "ALL") state.settings.units = "ALL"; save(); renderHome(); break;
      case "openplay": openPlaySheet(); break;
      case "review": renderReviewList(); break;
      case "startreview": startGame("review"); break;
      case "wrong": renderWrong(); break;
      case "mastered": renderMastered(); break;
      case "badges": renderBadges(); break;
      case "skip": nextRound(); renderGame(); break;
      case "togglesound": state.settings.sound = !state.settings.sound; save(); renderGame(); break;
      case "say": speak(t.getAttribute("data-en"), "en-GB"); break;
      case "export": openExport(); break;
      case "import": openImport(); break;
    }
  });

  renderHome();
})();
