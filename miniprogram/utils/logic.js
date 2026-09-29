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
function createInitialState(today) {
  return {
    version: 2,
    settings: { weeklyNew: 35 },
    plan: { startDate: today || todayStr() },
    words: {}, // en -> { stage, learnedDate, dueDate, correct, wrong }
    extras: {}, // "YYYY-MM-DD" -> 当日手动加量的新词数（次日自动失效）
    stats: { streak: 0, bestStreak: 0, totalLearned: 0, lastDoneDate: "", days: [] }
  };
}
function isValidState(s) {
  return !!(s && s.settings && s.plan && s.words && s.stats && Array.isArray(s.stats.days));
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
// 今日可学新词数：累计欠账补发，但单日不超过额度×2；extras 为当日手动加量
function todayNewAllowance(state, today, remainingPool) {
  const extra = (state.extras && state.extras[today]) || 0;
  const allow = earnedQuota(state, today) + extra - learnedCount(state);
  const cap = dailyQuota(state) * 2 + extra;
  return Math.max(0, Math.min(allow, cap, remainingPool));
}
// 手动加量：今天多学 n 个新词（仅当日有效，明天自动恢复）
function addExtra(state, today, n) {
  if (!state.extras) state.extras = {};
  state.extras[today] = (state.extras[today] || 0) + n;
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
  const remaining = allWords.length - learnedCount(state);
  const newCount = todayNewAllowance(state, today, remaining);
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
  createInitialState, isValidState,
  dailyQuota, earnedQuota, learnedCount, todayNewAllowance, addExtra,
  dueReviews, pickNewWords, getTodayPlan,
  applyAnswer, markNewWordsLearned, checkIn,
  masteryOf
};
