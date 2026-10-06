/* 艾宾浩斯计划层 · 纯函数（小程序 require / Node 测试共用）
 * 复习节点：学后第 1/2/4/7/15/30 天（stage 0=新学 → 6=毕业）
 * 答对：stage+1，下次到期 = 今天 + INTERVALS[stage]
 * 答错：回 stage 0，明天优先再来
 * 新词：每日额度 = round(每周目标/7)，漏学顺延（累计额度制），单日上限 = 额度×2
 */

const INTERVALS = [1, 2, 4, 7, 15, 30]; // stage 0..5 对应的下次间隔；stage 6 = 毕业
const MAX_STAGE = 6;
const DAY_MS = 86400000;

/* ---------- 日期工具（全部用 YYYY-MM-DD 字符串，规避时区） ---------- */
function todayStr(d) {
  const t = d ? new Date(d) : new Date();
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, "0");
  const dd = String(t.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + dd;
}
function addDays(dateStr, n) {
  const t = new Date(dateStr + "T00:00:00");
  t.setDate(t.getDate() + n);
  return todayStr(t);
}
function daysBetween(a, b) { // b - a 的天数
  return Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / DAY_MS);
}

/* ---------- 初始状态 / 重置 ---------- */
// 单个词库的进度（切库时整体存取，各库互不干扰）
function createBankProgress(today) {
  return {
    plan: { startDate: today || todayStr() },
    words: {}, // en -> { stage, learnedDate, dueDate, correct, wrong }
    extras: {}, // "YYYY-MM-DD" -> 当日手动加量的新词数（次日自动失效）
    extraBase: {}, // "YYYY-MM-DD" -> 首次加量时的已学词数（进度超前时算加量余额）
    stats: { streak: 0, bestStreak: 0, totalLearned: 0, lastDoneDate: "", days: [] }
  };
}
function createInitialState(today, bankIds) {
  const p = createBankProgress(today);
  return Object.assign({
    version: 4,
    bankIds: (bankIds && bankIds.length ? bankIds : ["pu1"]).slice(), // 可多选，按顺序合并
    settings: { weeklyNew: 35 } // 每周目标全局共享
  }, p);
}
function isValidState(s) {
  return !!(s && s.settings && s.plan && s.words && s.stats && Array.isArray(s.stats.days));
}

/* ---------- 词库多选：勾选 / 取消 ---------- */
// 勾选集合变化后调用：返回是否变化。取消勾选不会删除已学进度，重新勾回来接着背
function toggleBank(state, bankId) {
  if (!Array.isArray(state.bankIds)) state.bankIds = [bankId || "pu1"];
  const i = state.bankIds.indexOf(bankId);
  if (i >= 0) {
    if (state.bankIds.length <= 1) return false; // 至少保留一套
    state.bankIds.splice(i, 1);
  } else {
    state.bankIds.push(bankId);
  }
  return true;
}

// 兼容旧备份：version ≤3 的单选 bankId / banks 存档 → version 4 的 bankIds
function migrateState(s) {
  if (!s) return s;
  if (!s.version || s.version < 4) {
    const ids = Array.isArray(s.bankIds) && s.bankIds.length ? s.bankIds : (s.bankId ? [s.bankId] : ["pu1"]);
    // 旧版把各库进度分开存档：合并成一份，取其中已有进度的库作为勾选
    if (s.banks && Object.keys(s.banks).length) {
      const saved = Object.keys(s.banks).filter((id) => s.banks[id] && Object.keys(s.banks[id].words || {}).length);
      if (saved.length) {
        saved.forEach((id) => { if (ids.indexOf(id) < 0) ids.push(id); });
        // 用最后使用的那份进度覆盖顶层（旧版顶层是最后一次用的库）
      }
      delete s.banks;
    }
    s.bankIds = ids;
    delete s.bankId;
    s.version = 4;
  }
  if (!Array.isArray(s.bankIds) || !s.bankIds.length) s.bankIds = ["pu1"];
  if (!s.extraBase) s.extraBase = {};
  return s;
}

/* ---------- 新词额度 ---------- */
function dailyQuota(state) {
  const w = Number(state.settings.weeklyNew) || 35;
  return Math.max(1, Math.round(w / 7));
}
// 从开始日到今天的累计新词额度（漏学顺延）
function earnedQuota(state, today) {
  const elapsed = daysBetween(state.plan.startDate, today) + 1;
  return elapsed * dailyQuota(state);
}
function learnedCount(state) {
  return Object.keys(state.words).length;
}
// 当前学习池（已勾选词库合并后）里已学的词数。
// 多选场景下若取消勾选某套，那套的进度仍留在 state.words 里，但不计入额度，
// 否则会把新词额度白白吃掉（重新勾回来进度还在，也不会重复学）
function learnedInPool(state, allWords) {
  if (!allWords) return learnedCount(state);
  let n = 0;
  for (let i = 0; i < allWords.length; i++) {
    if (state.words[allWords[i].en]) n++;
  }
  return n;
}
// 今日可学新词数：累计欠账补发，但单日不超过额度×2；extras 为当日手动加量
function todayNewAllowance(state, today, remainingPool, allWords) {
  const learned = learnedInPool(state, allWords);
  const extra = (state.extras && state.extras[today]) || 0;
  const allow = earnedQuota(state, today) + extra - learned;
  const cap = dailyQuota(state) * 2 + extra;
  const pool = remainingPool == null ? Infinity : remainingPool;
  let n = Math.max(0, Math.min(allow, cap, pool));
  // 进度超前（已学 > 累计额度，常见于改过手机系统时间）：累计额度已被吃光，
  // 此时加量必须硬性生效，否则「今天多背5个」点了没反应。
  // 用 extraBase 记录首次加量时的已学词数，扣掉本次已用掉的量，避免连点两次一次给 10 个
  if (n === 0 && extra > 0) {
    const base = state.extraBase && state.extraBase[today];
    const used = base == null ? 0 : Math.max(0, learned - base);
    n = Math.min(Math.max(0, extra - used), pool);
  }
  return n;
}
// 手动加量：今天多学 n 个新词（仅当日有效，明天自动恢复）
function addExtra(state, today, n) {
  if (!state.extras) state.extras = {};
  state.extras[today] = (state.extras[today] || 0) + n;
  // 首次加量时记下已学词数作为基线（进度超前时用于精确计算加量余额）
  if (!state.extraBase) state.extraBase = {};
  if (state.extraBase[today] == null) state.extraBase[today] = learnedCount(state);
  return state;
}

/* ---------- 今日计划 ---------- */
// 到期复习词（全量，复习优先）：dueDate <= today，按逾期程度升序（最逾期最优先）
function dueReviews(state, today) {
  const list = [];
  for (const en of Object.keys(state.words)) {
    const w = state.words[en];
    if (w.dueDate && w.dueDate <= today && w.stage < MAX_STAGE) {
      list.push({ en, stage: w.stage, dueDate: w.dueDate });
    }
  }
  list.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
  return list;
}
// 从未学过的词里按词库顺序取前 n 个
function pickNewWords(state, allWords, n) {
  const out = [];
  for (const w of allWords) {
    if (out.length >= n) break;
    if (!state.words[w.en]) out.push(w);
  }
  return out;
}
function getTodayPlan(state, allWords, today) {
  const reviews = dueReviews(state, today);
  const remaining = allWords.length - learnedInPool(state, allWords);
  const newCount = todayNewAllowance(state, today, remaining, allWords);
  const newWords = pickNewWords(state, allWords, newCount);
  return {
    reviews,            // [{en, stage, dueDate}] 全量到期复习
    newWords,           // [{en, zh, level, unit, order}] 今日新词
    newCount,
    dailyQuota: dailyQuota(state),
    remainingPool: remaining,
    doneToday: state.stats.lastDoneDate === today
  };
}

/* ---------- 排期体检（系统时间被改过时的自救） ---------- */
// 最近一次到期复习日；全部毕业/无词时返回 null
function nextDueDate(state) {
  let min = null;
  for (const en of Object.keys(state.words)) {
    const w = state.words[en];
    if (w.dueDate && w.stage < MAX_STAGE && (min === null || w.dueDate < min)) min = w.dueDate;
  }
  return min;
}
// 复习排期被推到很远的未来（超过最长间隔 30 天）的词数 —— 只可能因改过系统时间
function scheduleAheadCount(state, today) {
  const limit = addDays(today, INTERVALS[INTERVALS.length - 1]);
  let n = 0;
  for (const en of Object.keys(state.words)) {
    const w = state.words[en];
    if (w.dueDate && w.stage < MAX_STAGE && w.dueDate > limit) n++;
  }
  return n;
}
// 已学词数超出累计额度的量（>0 说明进度超前，新词会被"欠账抵扣"逻辑卡住）
function aheadBy(state, today) {
  return learnedCount(state) - earnedQuota(state, today);
}
// 把超前排期拉回：保留 stage/掌握度，仅按当前 stage 从今天重新排下次复习日
function normalizeSchedule(state, today) {
  const limit = addDays(today, INTERVALS[INTERVALS.length - 1]);
  let fixed = 0;
  for (const en of Object.keys(state.words)) {
    const w = state.words[en];
    if (w.dueDate && w.stage < MAX_STAGE && w.dueDate > limit) {
      w.dueDate = addDays(today, INTERVALS[Math.min(w.stage, INTERVALS.length - 1)]);
      fixed++;
    }
  }
  return fixed;
}

/* ---------- 答题结算 ---------- */
function applyAnswer(state, en, isCorrect, today) {
  const w = state.words[en];
  if (!w) return state;
  if (isCorrect) {
    w.correct += 1;
    w.stage = Math.min(MAX_STAGE, w.stage + 1);
    w.dueDate = w.stage >= MAX_STAGE ? null : addDays(today, INTERVALS[w.stage]);
  } else {
    w.wrong += 1;
    w.stage = 0;
    w.dueDate = addDays(today, INTERVALS[0]); // 明天再来
  }
  return state;
}
// 新词学习卡翻完后登记：stage 0，明天第一次复习
function markNewWordsLearned(state, ens, today) {
  ens.forEach((en) => {
    if (!state.words[en]) {
      state.words[en] = { stage: 0, learnedDate: today, dueDate: addDays(today, INTERVALS[0]), correct: 0, wrong: 0 };
      state.stats.totalLearned += 1;
    }
  });
  return state;
}

/* ---------- 打卡（幂等：同日重复调用不改变 streak） ---------- */
function checkIn(state, today) {
  if (state.stats.days.includes(today)) {
    state.stats.lastDoneDate = today;
    return state;
  }
  state.stats.days.push(today);
  const yesterday = addDays(today, -1);
  state.stats.streak = state.stats.days.includes(yesterday) ? state.stats.streak + 1 : 1;
  state.stats.lastDoneDate = today;
  if (state.stats.streak > state.stats.bestStreak) state.stats.bestStreak = state.stats.streak;
  return state;
}

/* ---------- 掌握度（词表页用） ---------- */
function masteryOf(w) {
  if (!w) return 0;
  if (w.stage >= MAX_STAGE) return 100;
  const base = (w.stage / MAX_STAGE) * 100;
  const total = w.correct + w.wrong;
  const acc = total ? (w.correct / total) * 20 : 0; // 正确率加成最多20
  return Math.min(100, Math.round(base * 0.8 + acc));
}

module.exports = {
  INTERVALS, MAX_STAGE,
  todayStr, addDays, daysBetween,
  createInitialState, createBankProgress, isValidState, toggleBank, migrateState,
  dailyQuota, earnedQuota, learnedCount, learnedInPool, todayNewAllowance, addExtra,
  dueReviews, pickNewWords, getTodayPlan,
  applyAnswer, markNewWordsLearned, checkIn,
  masteryOf,
  nextDueDate, scheduleAheadCount, aheadBy, normalizeSchedule
};
