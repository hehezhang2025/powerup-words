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

/* ---------- 多选合并 ---------- */
section("多选合并与去重");
const pu1Words = bank.wordsOf(["pu1"]);
const pep3Words = bank.wordsOf(["pep3"]);
const merged = bank.wordsOf(["pu1", "pep3"]);
ok(merged.length > pu1Words.length, "合并后多于单套，实际:" + merged.length);
ok(merged.length < pu1Words.length + pep3Words.length, "重叠词已去重，合并" + merged.length + " < " + (pu1Words.length + pep3Words.length));
const mEn = {}, mZh = {}, dEn = [], dZh = [];
merged.forEach((w) => {
  if (mEn[w.en]) dEn.push(w.en);
  mEn[w.en] = 1;
  if (mZh[w.zh]) dZh.push(w.zh);
  mZh[w.zh] = 1;
});
ok(dEn.length === 0, "合并后英文唯一，重复:" + dEn.join(", "));
ok(dZh.length === 0, "合并后中文唯一（消消乐不能歧义），重复:" + dZh.join(", "));
ok(bank.info(["pu1", "pep3"]).count === 2, "info 报告已选 2 套");
ok(bank.info(["pu1"]).name.indexOf("PU 1") >= 0, "单套时显示词库名");

/* ---------- 勾选 / 取消，进度不丢 ---------- */
section("勾选取消与进度保留");
let s = L.createInitialState(T0, ["pu1"]);
ok(s.bankIds.length === 1 && s.bankIds[0] === "pu1", "初始勾选 pu1");

// 加选 pep3
ok(L.toggleBank(s, "pep3") === true, "加选 pep3 成功");
ok(s.bankIds.join(",") === "pu1,pep3", "勾选顺序保持，实际:" + s.bankIds.join(","));

// 在合并池里学 5 个词（来自 pu1）
let plan = L.getTodayPlan(s, merged, T0);
L.markNewWordsLearned(s, plan.newWords.map((w) => w.en), T0);
L.checkIn(s, T0);
ok(L.learnedInPool(s, merged) === 5, "合并池学过 5 词，实际:" + L.learnedInPool(s, merged));

// 再学 3 个 pep3 独有的词（pu1 里没有，取消 pep3 后就不在池内）
const restWords = merged.filter((w) => !s.words[w.en] && w.bank === "pep3").slice(0, 3);
L.markNewWordsLearned(s, restWords.map((w) => w.en), T0);
ok(L.learnedInPool(s, merged) === 8, "合并池学过 8 词，实际:" + L.learnedInPool(s, merged));
const globalCount = L.learnedCount(s);

// 取消 pep3：池内计数减少，但进度一条不丢
L.toggleBank(s, "pep3");
const onlyPu1 = bank.wordsOf(["pu1"]);
ok(s.bankIds.join(",") === "pu1", "已取消 pep3");
ok(L.learnedCount(s) === globalCount, "取消勾选不删进度，总数仍 " + globalCount + "，实际:" + L.learnedCount(s));
ok(L.learnedInPool(s, onlyPu1) < globalCount, "池内计数按已勾选库算，实际:" + L.learnedInPool(s, onlyPu1));

// 取消到只剩一套时不能再取消
ok(L.toggleBank(s, "pu1") === false, "最后一套不允许取消");
ok(s.bankIds.length === 1, "仍保留 1 套");

// 重新勾回 pep3：进度原样恢复
L.toggleBank(s, "pep3");
ok(L.learnedInPool(s, merged) === 8, "重新勾回后进度恢复 8 词，实际:" + L.learnedInPool(s, merged));

// 取消勾选后，新词额度不该被未勾选库的已学词吃掉
section("取消勾选不影响新词额度");
let s2 = L.createInitialState(T0, ["pu1", "pep3"]);
const pool2 = bank.wordsOf(["pu1", "pep3"]);
let p2 = L.getTodayPlan(s2, pool2, T0);
L.markNewWordsLearned(s2, p2.newWords.map((w) => w.en), T0);
const before = L.todayNewAllowance(s2, T0, pool2.length - L.learnedInPool(s2, pool2), pool2);
L.toggleBank(s2, "pep3");
const pool3 = bank.wordsOf(["pu1"]);
const after = L.todayNewAllowance(s2, T0, pool3.length - L.learnedInPool(s2, pool3), pool3);
ok(after >= before, "取消后新词额度不减少 before=" + before + " after=" + after);

/* ---------- 单元内顺序 ---------- */
section("单元内顺序");
function unitSeq(arr) {
  const u = [];
  arr.forEach((w) => { if (!u.length || u[u.length - 1] !== w.unit) u.push(w.unit); });
  return u.join(",");
}
const ord = bank.wordsOf(["pu1"], { shuffleInUnit: false, seed: "s1" });
const shf = bank.wordsOf(["pu1"], { shuffleInUnit: true, seed: "s1" });
ok(ord.length === shf.length && ord.length === 434, "打乱前后词数一致，实际:" + ord.length + "/" + shf.length);
ok(unitSeq(ord) === unitSeq(shf), "打乱后单元之间的顺序不变");
ok(ord.map(w => w.en).sort().join("|") === shf.map(w => w.en).sort().join("|"), "打乱前后是同一批词");
let samePos = 0;
for (let i = 0; i < ord.length; i++) if (ord[i].en === shf[i].en) samePos++;
ok(samePos < ord.length, "打乱后整体顺序有变化，同位置数:" + samePos + "/" + ord.length);
ok(bank.wordsOf(["pu1"], { shuffleInUnit: true, seed: "s1" }).map(w => w.en).join("|") === shf.map(w => w.en).join("|"), "同种子结果稳定（一天内不跳动）");
ok(bank.wordsOf(["pu1"], { shuffleInUnit: true, seed: "s2" }).map(w => w.en).join("|") !== shf.map(w => w.en).join("|"), "换种子顺序变化（隔天会换一批）");
let seqOk = true;
ord.forEach((w, i) => { if (w.order !== i) seqOk = false; });
ok(seqOk, "不打乱时 order 连续递增");
// 多选时按「词库+单元」分组，库与库之间不混
const mix = bank.wordsOf(["pu1", "pep3"], { shuffleInUnit: false, seed: "s1" });
let lastBank = "", flips = 0;
mix.forEach((w) => { if (w.bank !== lastBank) { flips++; lastBank = w.bank; } });
ok(flips === 2, "多库合并时先pu1后pep3，切换次数:" + flips);
// configure 注入后默认生效
bank.configure({ shuffleInUnit: false, seed: "s1" });
ok(bank.words(["pu1"]).map(w => w.en).join("|") === ord.map(w => w.en).join("|"), "configure 后默认按序");
bank.configure({ shuffleInUnit: true, seed: "s1" });
ok(bank.words(["pu1"]).map(w => w.en).join("|") === shf.map(w => w.en).join("|"), "configure 后默认打乱");

/* ---------- 旧备份迁移 ---------- */
section("旧备份迁移");
const old = {
  version: 2,
  settings: { weeklyNew: 35 },
  plan: { startDate: T0 },
  words: { hello: { stage: 0, learnedDate: T0, dueDate: "2026-10-07", correct: 0, wrong: 0 } },
  stats: { streak: 1, bestStreak: 1, totalLearned: 1, lastDoneDate: T0, days: [T0] }
};
const mig = L.migrateState(JSON.parse(JSON.stringify(old)));
ok(mig.version === 4, "升级到 version 4，实际:" + mig.version);
ok(mig.bankIds.length === 1 && mig.bankIds[0] === "pu1", "补上 bankIds，实际:" + JSON.stringify(mig.bankIds));
ok(mig.bankId === undefined, "清掉旧的 bankId 字段");
ok(L.isValidState(mig), "迁移后仍是合法状态");
ok(mig.words["hello"] && mig.words["hello"].stage === 0, "旧进度保留");

// 旧版单选存档（version 3）也要能迁
const v3 = {
  version: 3, bankId: "pep3",
  settings: { weeklyNew: 35 }, plan: { startDate: T0 },
  words: {}, extras: {}, extraBase: {},
  stats: { streak: 0, bestStreak: 0, totalLearned: 0, lastDoneDate: "", days: [] },
  banks: { pu1: { words: { apple: { stage: 1, correct: 1, wrong: 0 } } } }
};
const mig3 = L.migrateState(JSON.parse(JSON.stringify(v3)));
ok(mig3.bankIds.indexOf("pep3") >= 0, "保留原选中 pep3，实际:" + JSON.stringify(mig3.bankIds));
ok(mig3.bankIds.indexOf("pu1") >= 0, "有进度的 pu1 也并入勾选");
ok(mig3.banks === undefined, "旧的 banks 存档已清理");

/* ---------- 汇总 ---------- */
console.log("\n==============================");
console.log("通过 " + pass + " 项，失败 " + fail + " 项");
if (fail) process.exit(1);
