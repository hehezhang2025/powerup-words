/* 词库校验 + 多词库进度切换测试（Node 直接运行） */
const L = require("../miniprogram/utils/logic.js");
const bank = require("../miniprogram/utils/bank.js");

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.error("  ✗ " + msg); } }
function section(name) { console.log("\n== " + name + " =="); }

const T0 = "2026-10-06";
const AVAILABLE = bank.BANKS.filter((b) => b.available);

/* ---------- 词库清单 ---------- */
section("词库清单");
ok(bank.BANKS.length >= 2, "至少 2 套词库，实际:" + bank.BANKS.length);
ok(bank.BANK_MAP["pu1"] && bank.BANK_MAP["pu1"].available, "默认词库 pu1 可用");
ok(bank.DEFAULT_BANK === "pu1", "默认词库为 pu1");

/* ---------- 每套词库的完整性 ---------- */
AVAILABLE.forEach((b) => {
  section("词库 " + b.id + "（" + b.total + " 词）");
  ok(b.total >= 100, "词数不少于 100，实际:" + b.total);
  ok(b.units.length >= 6, "单元数不少于 6，实际:" + b.units.length);

  const enSeen = new Set(), zhSeen = new Set();
  const dupEn = [], dupZh = [], empty = [];
  b.words.forEach((w) => {
    if (!w.en || !w.zh) empty.push(JSON.stringify(w));
    if (enSeen.has(w.en)) dupEn.push(w.en);
    enSeen.add(w.en);
    if (zhSeen.has(w.zh)) dupZh.push(w.zh);
    zhSeen.add(w.zh);
  });
  ok(empty.length === 0, "无空字段，问题:" + empty.slice(0, 3).join("/"));
  ok(dupEn.length === 0, "英文唯一，重复:" + [...new Set(dupEn)].join(", "));
  ok(dupZh.length === 0, "中文唯一（消消乐配对不能有歧义），重复:" + [...new Set(dupZh)].join(", "));

  // order 连续且与单元内顺序一致
  let ordered = true;
  b.words.forEach((w, i) => { if (w.order !== i) ordered = false; });
  ok(ordered, "order 连续递增");

  // 单元词数不至于悬殊（基础单元允许更多）
  const counts = b.units.map((u) => u.count);
  const min = Math.min.apply(null, counts), max = Math.max.apply(null, counts);
  ok(max <= min * 3, "单元词数不悬殊 min=" + min + " max=" + max);
});

/* ---------- 多词库进度独立 ---------- */
section("词库切换与进度独立");
let s = L.createInitialState(T0, "pu1");
const pu1Words = bank.words("pu1");
const pep3Words = bank.words("pep3");

// 在 pu1 学 5 个词
let plan = L.getTodayPlan(s, pu1Words, T0);
L.markNewWordsLearned(s, plan.newWords.map((w) => w.en), T0);
L.checkIn(s, T0);
ok(L.learnedCount(s) === 5, "pu1 学 5 词，实际:" + L.learnedCount(s));
ok(s.stats.streak === 1, "pu1 打卡 streak=1");

// 切到 pep3：进度应为空
L.switchBank(s, "pep3", T0);
ok(s.bankId === "pep3", "已切到 pep3");
ok(L.learnedCount(s) === 0, "pep3 从零开始，实际:" + L.learnedCount(s));
ok(s.stats.streak === 0, "pep3 打卡独立，streak=0");

// 在 pep3 学 3 个词
plan = L.getTodayPlan(s, pep3Words, T0);
L.markNewWordsLearned(s, plan.newWords.slice(0, 3).map((w) => w.en), T0);
ok(L.learnedCount(s) === 3, "pep3 学 3 词，实际:" + L.learnedCount(s));

// 切回 pu1：进度原样恢复
L.switchBank(s, "pu1", T0);
ok(L.learnedCount(s) === 5, "切回 pu1 进度仍在，实际:" + L.learnedCount(s));
ok(s.words[pu1Words[0].en] && s.words[pu1Words[0].en].stage === 0, "pu1 词记录完整");
ok(s.stats.streak === 1, "pu1 打卡记录完整");

// 再切 pep3：3 词也在
L.switchBank(s, "pep3", T0);
ok(L.learnedCount(s) === 3, "pep3 进度也在，实际:" + L.learnedCount(s));
ok(Object.keys(s.banks).length >= 2, "存档里有两套库的进度，实际:" + Object.keys(s.banks).length);

/* ---------- 旧备份迁移 ---------- */
section("旧备份迁移");
const old = {
  version: 2,
  settings: { weeklyNew: 35 },
  plan: { startDate: T0 },
  words: { hello: { stage: 0, learnedDate: T0, dueDate: "2026-10-07", correct: 0, wrong: 0 } },
  stats: { streak: 1, bestStreak: 1, totalLearned: 1, lastDoneDate: T0, days: [T0] }
};
const mig = L.migrateState(JSON.parse(JSON.stringify(old)), "pu1");
ok(mig.version === 3, "升级到 version 3");
ok(mig.bankId === "pu1", "补上 bankId，实际:" + mig.bankId);
ok(typeof mig.banks === "object", "补上 banks 存档");
ok(L.isValidState(mig), "迁移后仍是合法状态");
ok(mig.words["hello"] && mig.words["hello"].stage === 0, "旧进度保留");

/* ---------- 汇总 ---------- */
console.log("\n==============================");
console.log("通过 " + pass + " 项，失败 " + fail + " 项");
if (fail) process.exit(1);
