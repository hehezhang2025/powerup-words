/* 艾宾浩斯计划层 · 纯函数（小程序 require / Node 测试共用）
 * 复习节点：学后第 1/2/4/7/15/30 天（stage 0=新学 → 6=毕业）
 * 答对：stage+1，下次到期 = 今天 + INTERVALS[stage]
 * 答错：回 stage 0，明天优先再来
 * 新词：每日额度 = round(每周目标/7)，漏学顺延（累计额度制），单日上限 = 额度×2
 */

const { seededRandom } = require("./rand.js");

const INTERVALS = [1, 2, 4, 7, 15, 30]; // stage 0..5 对应的下次间隔；stage 6 = 毕业
const MAX_STAGE = 6;
const DAY_MS = 86400000;

// 答错处理：不归零，只回退（SM-2 的 lapse 思路——已经答对过几次的词，
// 一次手滑不该让它从头再走六轮；回退后间隔自然变短，等价于"打折"）
const LAPSE_DROP = 2;
// 错词本：累计答错几次收录，连续答对几次放出，每天最多练几个
const HARD_MIN_LAPSES = 2;
const HARD_CLEAR = 3;
const HARD_DAILY = 6;
// 毕业前抽查：间隔已经拉到 15/30 天的词，提前随机考一次（防"顺序记忆"）
const SPOT_STAGE = 4;
const SPOT_DAILY = 2;

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
    settings: { weeklyNew: 35, shuffleInUnit: true } // 每周目标/单元内打乱，全局共享
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
  if (s.settings.shuffleInUnit === undefined) s.settings.shuffleInUnit = true; // 老存档默认打乱
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
// 被标记为「加量」的已学词数。加量词在 markNewWordsLearned 时打上 extra:1，永久豁免额度。
// 否则：今天多背 5 个 → 已学词数 +5 → 明天的「累计额度 − 已学」少 5，等于从明后天借词。
function eachExtra(state, allWords, fn) {
  if (allWords) {
    for (let i = 0; i < allWords.length; i++) {
      const w = state.words[allWords[i].en];
      if (w && w.extra) fn(w);
    }
  } else {
    for (const en of Object.keys(state.words)) {
      const w = state.words[en];
      if (w && w.extra) fn(w);
    }
  }
}
function extraLearned(state, allWords) {
  let n = 0;
  eachExtra(state, allWords, () => n++);
  return n;
}
// 当天登记的加量词数（连点两次加量时，不能把第一次已经背掉的再给一遍）
function extraLearnedOn(state, today, allWords) {
  let n = 0;
  eachExtra(state, allWords, (w) => { if (w.learnedDate === today) n++; });
  return n;
}
// 今日可学新词数：累计欠账补发，但单日不超过额度×2；extras 为当日手动加量
function todayNewAllowance(state, today, remainingPool, allWords) {
  const learnedRaw = learnedInPool(state, allWords);
  // 已学词里扣掉加量部分：加量是"白送"的，不影响明后天的基础额度
  const normal = Math.max(0, learnedRaw - extraLearned(state, allWords));
  const extra = (state.extras && state.extras[today]) || 0;
  // 加量额度单独结算：已背掉的加量要从今天的加量额度里扣，剩下的才是还能背的
  const extraLeft = Math.max(0, extra - extraLearnedOn(state, today, allWords));
  const allow = earnedQuota(state, today) - normal + extraLeft;
  const cap = dailyQuota(state) * 2 + extra;
  const pool = remainingPool == null ? Infinity : remainingPool;
  let n = Math.max(0, Math.min(allow, cap, pool));
  // 进度超前（已学 > 累计额度，常见于改过手机系统时间）：累计额度已被吃光，
  // 此时加量必须硬性生效，否则「今天多背5个」点了没反应。
  // 用 extraBase 记录首次加量时的已学词数，扣掉本次已用掉的量，避免连点两次一次给 10 个
  if (n === 0 && extra > 0) {
    const base = state.extraBase && state.extraBase[today];
    const used = base == null ? 0 : Math.max(0, learnedRaw - base);
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
  const extraLeft = Math.max(0, ((state.extras && state.extras[today]) || 0) - extraLearnedOn(state, today, allWords));
  return {
    reviews,            // [{en, stage, dueDate}] 全量到期复习
    newWords,           // [{en, zh, level, unit, order}] 今日新词
    newCount,
    extraCount: Math.min(extraLeft, newWords.length), // 今日新词里属于「加量」的个数（尾部）
    hardWords: todayHardQueue(state, today, allWords),        // 错词本：今天要过的顽固词（已排除今天答过的）
    spotChecks: spotChecks(state, today, allWords, SPOT_DAILY), // 毕业前抽查：提前考几个长间隔词
    // 复习环节的完整队列（到期复习 + 抽查），首页和消消乐页共用，避免两边判空不一致
    reviewQueue: reviews.map((r) => r.en).concat(spotChecks(state, today, allWords, SPOT_DAILY)),
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
// 加量词不计入：那是主动多背的，不算超前
function aheadBy(state, today) {
  return learnedCount(state) - extraLearned(state, null) - earnedQuota(state, today);
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
// opts.probe：探查性答题（毕业前抽查、当天巩固）——答对不推进 stage，
// 因为提前考出来不代表真能撑到那个间隔；答错照常回退
function applyAnswer(state, en, isCorrect, today, opts) {
  const w = state.words[en];
  if (!w) return state;
  w.lastOn = today; // 今天答过题：错词本当天不再重复排队
  if (isCorrect) {
    w.correct += 1;
    if (opts && opts.probe) return state;
    w.stage = Math.min(MAX_STAGE, w.stage + 1);
    w.dueDate = w.stage >= MAX_STAGE ? null : addDays(today, INTERVALS[w.stage]);
  } else {
    w.wrong += 1;
    w.lapses = (w.lapses || 0) + 1;
    w.hardClear = 0;
    // lapse：回退而不是归零（stage 5 → 3，下次间隔 30 天变 7 天），明天先强化一次
    w.stage = Math.max(0, w.stage - LAPSE_DROP);
    w.dueDate = addDays(today, INTERVALS[0]);
  }
  return state;
}

/* ---------- 错词本 ---------- */
// 顽固词：累计答错 ≥2 次且还没毕业。按错得多的、出册进度少的排前面
function hardWords(state, allWords, limit) {
  const inPool = allWords ? allWords.map((w) => w.en) : null;
  const out = [];
  for (const en of Object.keys(state.words)) {
    const w = state.words[en];
    if (!w || w.stage >= MAX_STAGE) continue;
    if ((w.lapses || 0) < HARD_MIN_LAPSES) continue;
    if (inPool && inPool.indexOf(en) < 0) continue;
    out.push({ en, lapses: w.lapses, stage: w.stage, hardClear: w.hardClear || 0 });
  }
  out.sort((a, b) => (b.lapses - a.lapses) || (a.hardClear - b.hardClear));
  return typeof limit === "number" && limit > 0 ? out.slice(0, limit) : out;
}
// 今天真正要过的错词：排除今天已经答过题的（复习环节刚练过就别再来一遍）
// 首页和消消乐页必须用同一个函数判空，否则会出现"进了空队列又被弹回来"的死循环
function todayHardQueue(state, today, allWords) {
  return hardWords(state, allWords, HARD_DAILY)
    .filter((h) => {
      const w = state.words[h.en];
      return !(w && w.lastOn === today);
    })
    .map((h) => h.en);
}
// 错词本里答题：连续答对 HARD_CLEAR 次就放出（清零 lapses），答错则出册进度归零
function applyHardAnswer(state, en, isCorrect, today) {
  const w = state.words[en];
  if (!w) return state;
  applyAnswer(state, en, isCorrect, today);
  if (isCorrect) {
    w.hardClear = (w.hardClear || 0) + 1;
    if (w.hardClear >= HARD_CLEAR) {
      w.lapses = 0;
      w.hardClear = 0;
    }
  } else {
    w.hardClear = 0;
  }
  return state;
}

/* ---------- 毕业前抽查 ---------- */
// 从间隔已拉到 15/30 天、今天又不到期的词里随机抽几个提前考：
// 答对不推进（只记一笔），答错才回退——专门揪"看着会、其实没会"的词
function spotChecks(state, today, allWords, limit) {
  const n = typeof limit === "number" && limit > 0 ? limit : SPOT_DAILY;
  const inPool = allWords ? allWords.map((w) => w.en) : null;
  const pool = [];
  for (const en of Object.keys(state.words)) {
    const w = state.words[en];
    if (!w || w.stage < SPOT_STAGE || w.stage >= MAX_STAGE) continue;
    if (!w.dueDate || w.dueDate <= today) continue; // 今天本来就要复习的不算抽查
    if (inPool && inPool.indexOf(en) < 0) continue;
    pool.push(en);
  }
  const rnd = seededRandom(today + "|spot"); // 同一天抽到同一批，退出重进不换词
  const picked = [];
  const arr = pool.slice();
  while (arr.length && picked.length < n) {
    picked.push(arr.splice(Math.floor(rnd() * arr.length), 1)[0]);
  }
  return picked;
}
// 新词学习卡翻完后登记：stage 0，明天第一次复习。
// extraN：本次里属于「加量」的词数（取尾部 N 个），打上 extra:1 让它们不占明后天的额度
function markNewWordsLearned(state, ens, today, extraN) {
  const n = Math.max(0, Number(extraN) || 0);
  const from = ens.length - Math.min(n, ens.length);
  ens.forEach((en, i) => {
    if (!state.words[en]) {
      state.words[en] = { stage: 0, learnedDate: today, dueDate: addDays(today, INTERVALS[0]), correct: 0, wrong: 0 };
      if (i >= from) state.words[en].extra = 1;
      state.stats.totalLearned += 1;
    }
  });
  return state;
}
// 撤销某天的加量（只撤销尚未学掉的部分；已学的词保留，只是不再额外给量）
function clearExtra(state, today) {
  if (!state.extras) return state;
  delete state.extras[today];
  if (state.extraBase) delete state.extraBase[today];
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
  dailyQuota, earnedQuota, learnedCount, learnedInPool, extraLearned, todayNewAllowance, addExtra, clearExtra,
  dueReviews, pickNewWords, getTodayPlan,
  applyAnswer, applyHardAnswer, markNewWordsLearned, checkIn,
  masteryOf,
  nextDueDate, scheduleAheadCount, aheadBy, normalizeSchedule,
  hardWords, todayHardQueue, spotChecks, LAPSE_DROP, HARD_MIN_LAPSES, HARD_CLEAR, HARD_DAILY, SPOT_STAGE, SPOT_DAILY
};
