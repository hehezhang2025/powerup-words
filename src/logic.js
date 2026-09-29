/* 核心逻辑（纯函数，浏览器与 Node 双端可用）
   - 词池构建与去重
   - 出题（N-1 对配对 + 1 英文干扰 + 1 中文干扰）
   - 配对判定
   - Leitner 遗忘曲线调度与到期筛选 */
(function (root) {
  "use strict";

  var DAY = 24 * 60 * 60 * 1000;

  /* Leitner 盒子：第 n 盒答对后的复习间隔（天） */
  var LEITNER_INTERVALS_DAYS = { 1: 1, 2: 2, 3: 4, 4: 7, 5: 15, 6: 30 };
  var MAX_BOX = 6;

  /* 可复现随机数（mulberry32），便于测试；不传 seed 时用 Math.random */
  function makeRng(seed) {
    if (seed === undefined || seed === null) {
      return Math.random;
    }
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rng) {
    rng = rng || Math.random;
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  function sample(arr, n, rng) {
    return shuffle(arr, rng).slice(0, n);
  }

  /* 由词库构建词池。
     selection = { level: "L1"|"L2"|"ALL", units: ["U1",...] | "ALL" }
     返回去重后的 [{ id, en, zh, level, unit }]（按 en 去重） */
  function buildPool(bank, selection) {
    selection = selection || { level: "ALL", units: "ALL" };
    var levels;
    if (selection.level === "ALL" || !selection.level) {
      levels = Object.keys(bank);
    } else {
      levels = [selection.level];
    }
    var out = [];
    var seen = {};
    levels.forEach(function (lv) {
      var levelObj = bank[lv];
      if (!levelObj) return;
      var unitKeys = Object.keys(levelObj.units);
      var wantUnits = selection.units;
      levels.length === 1 &&
        Array.isArray(wantUnits) &&
        (unitKeys = unitKeys.filter(function (u) {
          return wantUnits.indexOf(u) !== -1;
        }));
      unitKeys.forEach(function (u) {
        var unit = levelObj.units[u];
        if (!unit) return;
        unit.words.forEach(function (w) {
          var key = w.en.toLowerCase();
          if (seen[key]) return;
          seen[key] = true;
          out.push({
            id: w.en,
            en: w.en,
            zh: w.zh,
            level: lv,
            unit: u
          });
        });
      });
    });
    return out;
  }

  var _tileSeq = 0;
  function tile(word, side) {
    _tileSeq += 1;
    return {
      tileId: side + "_" + word.id + "_" + _tileSeq,
      wordId: word.id,
      en: word.en,
      zh: word.zh,
      side: side,
      text: side === "en" ? word.en : word.zh,
      matched: false
    };
  }

  /* 出题：roundSize = 每侧方块数（3=简单,4=进阶,5=挑战）
     生成 (roundSize-1) 对可配对 + 1 个英文干扰 + 1 个中文干扰。
     返回 { enTiles, cnTiles, correctPairIds, roundSize } */
  function buildRound(pool, roundSize, rng) {
    rng = rng || Math.random;
    roundSize = roundSize || 3;
    var need = roundSize + 1; // (roundSize-1) 对 + 2 个干扰 = roundSize+1 个不同的词
    if (!pool || pool.length < need) {
      throw new Error(
        "词池不足：需要至少 " + need + " 个词，当前 " + (pool ? pool.length : 0)
      );
    }
    var picked = sample(pool, need, rng);
    var pairCount = roundSize - 1;
    var paired = picked.slice(0, pairCount);
    var enDistractor = picked[pairCount];
    var cnDistractor = picked[pairCount + 1];

    var enTiles = paired.map(function (w) {
      return tile(w, "en");
    });
    enTiles.push(tile(enDistractor, "en"));

    var cnTiles = paired.map(function (w) {
      return tile(w, "cn");
    });
    cnTiles.push(tile(cnDistractor, "cn"));

    return {
      enTiles: shuffle(enTiles, rng),
      cnTiles: shuffle(cnTiles, rng),
      correctPairIds: paired.map(function (w) {
        return w.id;
      }),
      roundSize: roundSize
    };
  }

  /* 配对判定：同一个 wordId 即为正确。干扰项在另一侧没有同 wordId，永远配不上。 */
  function checkMatch(enTile, cnTile) {
    if (!enTile || !cnTile) return false;
    if (enTile.side !== "en" || cnTile.side !== "cn") return false;
    return enTile.wordId === cnTile.wordId;
  }

  function initProgress() {
    return { box: 1, due: 0, correct: 0, wrong: 0, lastSeen: 0, seen: 0 };
  }

  /* 答题后更新某词的 Leitner 状态。
     correct=true 升盒并按间隔推迟；correct=false 回第 1 盒、立即到期（次日优先）。 */
  function scheduleAfterAnswer(progress, correct, now) {
    now = now || Date.now();
    var p = progress
      ? {
          box: progress.box || 1,
          due: progress.due || 0,
          correct: progress.correct || 0,
          wrong: progress.wrong || 0,
          lastSeen: progress.lastSeen || 0,
          seen: progress.seen || 0
        }
      : initProgress();
    p.seen += 1;
    p.lastSeen = now;
    if (correct) {
      p.correct += 1;
      p.box = Math.min(p.box + 1, MAX_BOX);
      p.due = now + LEITNER_INTERVALS_DAYS[p.box] * DAY;
    } else {
      p.wrong += 1;
      p.box = 1;
      p.due = now; // 立即到期，次日复习优先
    }
    return p;
  }

  /* 到期复习队列：due<=now 视为到期；错得多/盒子低的排前面。 */
  function pickDueWords(pool, progressMap, now, limit) {
    now = now || Date.now();
    progressMap = progressMap || {};
    var due = pool.filter(function (w) {
      var p = progressMap[w.id];
      return p && p.due <= now && p.seen > 0;
    });
    due.sort(function (a, b) {
      var pa = progressMap[a.id];
      var pb = progressMap[b.id];
      if (pa.box !== pb.box) return pa.box - pb.box; // 弱项优先
      return pa.due - pb.due;
    });
    if (limit && limit > 0) return due.slice(0, limit);
    return due;
  }

  /* 统计到期数量（用于首页角标） */
  function countDue(pool, progressMap, now) {
    return pickDueWords(pool, progressMap, now).length;
  }

  /* 智能取词：优先到期/错词，其余随机填满，用于普通对局也能带复习。
     返回长度为 count 的不重复词数组。 */
  function pickRoundWords(pool, count, progressMap, now, rng, smart) {
    rng = rng || Math.random;
    if (!smart) return sample(pool, count, rng);
    var dueList = pickDueWords(pool, progressMap, now);
    var chosen = [];
    var usedIds = {};
    shuffle(dueList, rng).forEach(function (w) {
      if (chosen.length >= count) return;
      if (usedIds[w.id]) return;
      usedIds[w.id] = true;
      chosen.push(w);
    });
    if (chosen.length < count) {
      var rest = pool.filter(function (w) {
        return !usedIds[w.id];
      });
      shuffle(rest, rng).forEach(function (w) {
        if (chosen.length >= count) return;
        usedIds[w.id] = true;
        chosen.push(w);
      });
    }
    return shuffle(chosen, rng);
  }

  /* 用给定的一组词直接出题（供复习/智能模式复用 buildRound 的排布逻辑）。
     words 长度需为 roundSize+1。 */
  function buildRoundFromWords(words, roundSize, rng) {
    rng = rng || Math.random;
    var need = roundSize + 1;
    if (!words || words.length < need) {
      throw new Error("出题词数不足：需要 " + need + " 个");
    }
    var picked = shuffle(words, rng).slice(0, need);
    var fakePool = picked;
    // 复用 buildRound 需要随机抽样，这里已定好集合，直接构造
    var pairCount = roundSize - 1;
    var paired = picked.slice(0, pairCount);
    var enDistractor = picked[pairCount];
    var cnDistractor = picked[pairCount + 1];
    var enTiles = paired.map(function (w) { return tile(w, "en"); });
    enTiles.push(tile(enDistractor, "en"));
    var cnTiles = paired.map(function (w) { return tile(w, "cn"); });
    cnTiles.push(tile(cnDistractor, "cn"));
    void fakePool;
    return {
      enTiles: shuffle(enTiles, rng),
      cnTiles: shuffle(cnTiles, rng),
      correctPairIds: paired.map(function (w) { return w.id; }),
      roundSize: roundSize
    };
  }

  /* ---------------- 进度导出 / 导入 / 合并 ---------------- */
  // UTF-8 安全的 base64（含中文），环境兼容 btoa/atob 或 Buffer
  function b64encode(str) {
    if (typeof btoa === "function") {
      return btoa(unescape(encodeURIComponent(str)));
    }
    return Buffer.from(str, "utf8").toString("base64");
  }
  function b64decode(b64) {
    if (typeof atob === "function") {
      return decodeURIComponent(escape(atob(b64)));
    }
    return Buffer.from(b64, "base64").toString("utf8");
  }

  // 校验导入数据是否为合法状态
  function isValidState(obj) {
    return obj && typeof obj === "object" && obj.progress && typeof obj.progress === "object";
  }

  // 将整个 state 编码成可复制/粘贴的字符串（用于微信、备忘录等跨设备传递）
  function encodeState(state) {
    return "PU1:" + b64encode(JSON.stringify(state));
  }

  // 解码；非法返回 null
  function decodeState(code) {
    if (!code || typeof code !== "string") return null;
    code = code.trim();
    if (code.indexOf("PU1:") === 0) code = code.slice(4);
    try {
      var obj = JSON.parse(b64decode(code));
      return isValidState(obj) ? obj : null;
    } catch (e) {
      return null;
    }
  }

  // 合并两个状态：进度取较强（次数/盒子更高），统计取较大值，成就取并集，设置保留 base
  function mergeState(base, incoming) {
    if (!isValidState(incoming)) return base;
    var out = JSON.parse(JSON.stringify(base || { progress: {}, stats: {}, settings: {} }));
    if (!out.progress) out.progress = {};
    var bp = out.progress, ip = incoming.progress || {};
    Object.keys(ip).forEach(function (id) {
      var b = bp[id], w = ip[id];
      if (!b) { bp[id] = JSON.parse(JSON.stringify(w)); return; }
      b.correct = Math.max(b.correct || 0, w.correct || 0);
      b.wrong = Math.max(b.wrong || 0, w.wrong || 0);
      b.box = Math.max(b.box || 1, w.box || 1);
      b.appear = Math.max(b.appear || 0, w.appear || 0);
      b.lastSeen = Math.max(b.lastSeen || 0, w.lastSeen || 0);
      b.due = Math.min((b.due == null ? Infinity : b.due), (w.due == null ? Infinity : w.due));
      if (w.level) b.level = w.level;
      if (w.unit) b.unit = w.unit;
      if (w.en) b.en = w.en;
      if (w.zh) b.zh = w.zh;
    });
    if (incoming.stats) {
      out.stats = out.stats || {};
      var s = out.stats, is = incoming.stats;
      ["stars", "matches", "rounds", "perfectRounds", "streak", "bestStreak"].forEach(function (k) {
        s[k] = Math.max(s[k] || 0, is[k] || 0);
      });
      s.plays = (s.plays || 0) + (is.plays || 0);
      if (Array.isArray(is.days)) {
        s.days = (s.days || []).slice();
        is.days.forEach(function (d) { if (s.days.indexOf(d) === -1) s.days.push(d); });
      }
    }
    if (incoming.achievements) {
      out.achievements = Object.assign({}, out.achievements || {}, incoming.achievements);
    }
    return out;
  }

  var GameLogic = {
    DAY: DAY,
    LEITNER_INTERVALS_DAYS: LEITNER_INTERVALS_DAYS,
    MAX_BOX: MAX_BOX,
    makeRng: makeRng,
    shuffle: shuffle,
    sample: sample,
    buildPool: buildPool,
    buildRound: buildRound,
    buildRoundFromWords: buildRoundFromWords,
    checkMatch: checkMatch,
    initProgress: initProgress,
    scheduleAfterAnswer: scheduleAfterAnswer,
    pickDueWords: pickDueWords,
    countDue: countDue,
    pickRoundWords: pickRoundWords,
    /* ---------------- 进度导出/导入/合并（跨设备） ---------------- */
    encodeState: encodeState,
    decodeState: decodeState,
    mergeState: mergeState,
    isValidState: isValidState
  };

  root.GameLogic = GameLogic;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = GameLogic;
  }
})(typeof window !== "undefined" ? window : this);
