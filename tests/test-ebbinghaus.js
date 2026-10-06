/* 艾宾浩斯计划层测试（Node 直接运行） */
const L = require("../miniprogram/utils/logic.js");
const bank = require("../miniprogram/utils/bank.js");
const WORDS = bank.wordsOf(["pu1"]);
const TOTAL = bank.total(["pu1"]);

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.error("  ✗ " + msg); } }
function section(name) { console.log("\n== " + name + " =="); }

/* ---------- 日期工具 ---------- */
section("日期工具");
ok(L.todayStr(new Date("2026-09-28T10:00:00")) === "2026-09-28", "todayStr 格式化");
ok(L.addDays("2026-09-28", 1) === "2026-09-29", "addDays +1");
ok(L.addDays("2026-09-30", 1) === "2026-10-01", "addDays 跨月");
ok(L.addDays("2026-12-31", 1) === "2027-01-01", "addDays 跨年");
ok(L.daysBetween("2026-09-28", "2026-10-05") === 7, "daysBetween 7天");
ok(L.daysBetween("2026-09-28", "2026-09-28") === 0, "daysBetween 同日=0");

/* ---------- 初始状态 ---------- */
section("初始状态与词库");
const T0 = "2026-09-28";
let s = L.createInitialState(T0);
ok(L.isValidState(s), "初始状态结构有效");
ok(s.settings.weeklyNew === 35, "默认每周35词");
ok(TOTAL === 434, "PU1 词库434词，实际:" + TOTAL);
ok(L.dailyQuota(s) === 5, "每日新词额度=5");

/* ---------- 第1天：无复习+5个新词 ---------- */
section("第1天计划");
let plan = L.getTodayPlan(s, WORDS, T0);
ok(plan.reviews.length === 0, "第1天无复习词");
ok(plan.newWords.length === 5, "第1天5个新词，实际:" + plan.newWords.length);
ok(plan.newWords[0].en === WORDS[0].en, "新词按词库顺序取");
ok(plan.doneToday === false, "未完成打卡");

/* ---------- 学完5新词 → 明天全到期 ---------- */
section("新词登记与次日复习");
const newEns = plan.newWords.map(w => w.en);
L.markNewWordsLearned(s, newEns, T0);
ok(L.learnedCount(s) === 5, "已学=5");
ok(s.stats.totalLearned === 5, "totalLearned=5");
ok(s.words[newEns[0]].stage === 0, "新词stage=0");
ok(s.words[newEns[0]].dueDate === "2026-09-29", "新词次日到期");
L.checkIn(s, T0);
ok(s.stats.streak === 1, "首日打卡streak=1");

const T1 = "2026-09-29";
plan = L.getTodayPlan(s, WORDS, T1);
ok(plan.reviews.length === 5, "第2天5个复习词");
ok(plan.newWords.length === 5, "第2天再学5新词");

/* ---------- 答对推进 1/2/4/7/15/30 ---------- */
section("答对推进艾宾浩斯节点");
const en1 = newEns[0];
L.applyAnswer(s, en1, true, T1); // stage 0→1, due = T1+2
ok(s.words[en1].stage === 1, "答对后stage=1");
ok(s.words[en1].dueDate === L.addDays(T1, 2), "stage1 间隔2天");
L.applyAnswer(s, en1, true, L.addDays(T1, 2)); // →2, +4
ok(s.words[en1].dueDate === L.addDays(T1, 6), "stage2 间隔4天");
L.applyAnswer(s, en1, true, L.addDays(T1, 6)); // →3, +7
L.applyAnswer(s, en1, true, L.addDays(T1, 13)); // →4, +15
L.applyAnswer(s, en1, true, L.addDays(T1, 28)); // →5, +30
ok(s.words[en1].stage === 5, "推进到stage5");
L.applyAnswer(s, en1, true, L.addDays(T1, 58)); // →6 毕业
ok(s.words[en1].stage === 6, "stage6毕业");
ok(s.words[en1].dueDate === null, "毕业后无到期日");
// 毕业词不再进复习
plan = L.getTodayPlan(s, WORDS, L.addDays(T1, 100));
ok(!plan.reviews.some(r => r.en === en1), "毕业词不再出现复习");

/* ---------- 答错回退 ---------- */
section("答错回退明天优先");
const en2 = newEns[1];
L.applyAnswer(s, en2, true, T1); // stage1
L.applyAnswer(s, en2, true, L.addDays(T1, 2)); // stage2
L.applyAnswer(s, en2, false, L.addDays(T1, 6)); // 答错
ok(s.words[en2].stage === 0, "答错回stage0");
ok(s.words[en2].wrong === 1, "错误次数=1");
ok(s.words[en2].dueDate === L.addDays(T1, 7), "答错后明天到期");
plan = L.getTodayPlan(s, WORDS, L.addDays(T1, 7));
ok(plan.reviews.some(r => r.en === en2), "答错词次日出现在复习列表");
let asc = true;
for (let i = 1; i < plan.reviews.length; i++) {
  if (plan.reviews[i].dueDate < plan.reviews[i - 1].dueDate) asc = false;
}
ok(asc, "复习列表按到期日升序（最逾期最优先）");

/* ---------- 漏学顺延 + 单日上限 ---------- */
section("漏学顺延与单日上限");
let s2 = L.createInitialState(T0);
// 第1天开始但一直没学，第5天才打开
const T4 = L.addDays(T0, 4);
plan = L.getTodayPlan(s2, WORDS, T4);
// 累计额度 = 5天×5 = 25，单日上限 5×2 = 10
ok(plan.newWords.length === 10, "漏4天后单日上限10个，实际:" + plan.newWords.length);
// 学掉10个，第6天再开
L.markNewWordsLearned(s2, plan.newWords.map(w => w.en), T4);
plan = L.getTodayPlan(s2, WORDS, L.addDays(T0, 5));
// 累计额度 6×5=30，已学10，欠20，上限10
ok(plan.newWords.length === 10, "次日继续补欠账10个");

/* ---------- 复习全量不设上限（复习优先） ---------- */
section("复习全量（复习优先全部完成）");
let s3 = L.createInitialState(T0);
const many = WORDS.slice(0, 40).map(w => w.en);
L.markNewWordsLearned(s3, many, T0); // 一天学40个（极端）
plan = L.getTodayPlan(s3, WORDS, T1);
ok(plan.reviews.length === 40, "40个到期复习全量给出，实际:" + plan.reviews.length);

/* ---------- 打卡连续与断签 ---------- */
section("打卡 streak");
let s4 = L.createInitialState(T0);
L.checkIn(s4, T0);
L.checkIn(s4, T1);
ok(s4.stats.streak === 2, "连续2天streak=2");
L.checkIn(s4, L.addDays(T1, 2)); // 断1天
ok(s4.stats.streak === 1, "断签后streak重置为1");
ok(s4.stats.bestStreak === 2, "bestStreak保留=2");
L.checkIn(s4, L.addDays(T1, 2)); // 同日重复打卡
ok(s4.stats.streak === 1, "同日重复打卡不叠加");
ok(s4.stats.days.length === 3, "打卡日期去重=3天");

/* ---------- 词池用尽 ---------- */
section("词池用尽");
let s5 = L.createInitialState(T0);
const all = WORDS.map(w => w.en);
L.markNewWordsLearned(s5, all, T0);
plan = L.getTodayPlan(s5, WORDS, L.addDays(T0, 100));
ok(plan.newWords.length === 0, "全部学完后无新词");
ok(plan.remainingPool === 0, "词池剩余=0");

/* ---------- 周目标调整生效 ---------- */
section("每周目标调整");
let s6 = L.createInitialState(T0);
s6.settings.weeklyNew = 70;
ok(L.dailyQuota(s6) === 10, "70/周→每天10个");
s6.settings.weeklyNew = 21;
ok(L.dailyQuota(s6) === 3, "21/周→每天3个");

/* ---------- 掌握度 ---------- */
section("掌握度计算");
ok(L.masteryOf(null) === 0, "未学=0");
ok(L.masteryOf({ stage: 6, correct: 6, wrong: 0 }) === 100, "毕业=100");
const mid = L.masteryOf({ stage: 3, correct: 3, wrong: 0 });
ok(mid > 0 && mid < 100, "中期0-100之间:" + mid);

/* ---------- 重置 ---------- */
section("重置");
let s7 = L.createInitialState(T0);
L.markNewWordsLearned(s7, ["hello", "hi"], T0);
L.checkIn(s7, T0);
s7 = L.createInitialState(T0); // 重置=重建初始态
ok(L.learnedCount(s7) === 0 && s7.stats.streak === 0 && s7.stats.days.length === 0, "重置后清零");

/* ---------- 手动加量（extras） ---------- */
section("手动加量");
let s8 = L.createInitialState(T0);
// 第一天先学完正常额度 5 个
let p8 = L.getTodayPlan(s8, WORDS, T0);
L.markNewWordsLearned(s8, p8.newWords.map(w => w.en), T0);
L.checkIn(s8, T0);
p8 = L.getTodayPlan(s8, WORDS, T0);
ok(p8.newWords.length === 0, "学完5个后今日新词=0");
// 手动加量 5 个
L.addExtra(s8, T0, 5);
p8 = L.getTodayPlan(s8, WORDS, T0);
ok(p8.newWords.length === 5, "加量后今日新词=5，实际:" + p8.newWords.length);
ok(p8.extraCount === 5, "其中5个标记为加量，实际:" + p8.extraCount);
// 学完加量的 5 个（按 extraCount 打豁免标记），再加 5 个
L.markNewWordsLearned(s8, p8.newWords.map(w => w.en), T0, p8.extraCount);
ok(L.extraLearned(s8, WORDS) === 5, "5个加量词被标记豁免，实际:" + L.extraLearned(s8, WORDS));
L.addExtra(s8, T0, 5);
p8 = L.getTodayPlan(s8, WORDS, T0);
ok(p8.newWords.length === 5, "加量可叠加，仍为5");
L.markNewWordsLearned(s8, p8.newWords.map(w => w.en), T0, p8.extraCount);
// 次日 extras 失效：加量过的 10 个词不占额度 → 明天的计划不受影响（仍给正常的 5 个）
p8 = L.getTodayPlan(s8, WORDS, T1);
ok(p8.newWords.length === 5, "次日加量失效但仍给正常额度5个，实际:" + p8.newWords.length);

/* ---------- 进度超前时加量必须生效（改过系统时间的场景） ---------- */
section("超前进度下的加量");
let s10 = L.createInitialState(T0);
// 模拟调过系统时间：一次学了 60 个词（累计额度才 5），复习日也排到了未来
L.markNewWordsLearned(s10, WORDS.slice(0, 60).map(w => w.en), T0);
let p10 = L.getTodayPlan(s10, WORDS, T0);
ok(p10.newWords.length === 0, "超前60词后今日新词=0，实际:" + p10.newWords.length);
ok(L.aheadBy(s10, T0) === 55, "超前量=55，实际:" + L.aheadBy(s10, T0));
L.addExtra(s10, T0, 5);
p10 = L.getTodayPlan(s10, WORDS, T0);
ok(p10.newWords.length === 5, "超前时加量仍给5个，实际:" + p10.newWords.length);
// 学完这 5 个后再加 5，应只再给 5 个（不能一次给 10）
L.markNewWordsLearned(s10, p10.newWords.map(w => w.en), T0, p10.extraCount);
L.addExtra(s10, T0, 5);
p10 = L.getTodayPlan(s10, WORDS, T0);
ok(p10.newWords.length === 5, "连点两次各给5个（非10），实际:" + p10.newWords.length);

/* ---------- 加量不占用明后天额度 ---------- */
section("加量不影响后续计划");
// A：不加量，连学 3 天
let sa = L.createInitialState(T0);
const seqA = [];
for (let d = 0; d < 3; d++) {
  const day = L.addDays(T0, d);
  const pa = L.getTodayPlan(sa, WORDS, day);
  seqA.push(pa.newWords.length);
  L.markNewWordsLearned(sa, pa.newWords.map(w => w.en), day, pa.extraCount);
}
ok(seqA.join(",") === "5,5,5", "不加量时每天都是5个，实际:" + seqA.join(","));

// B：第1天加量 5（学10个），第2、3天的计划必须与 A 完全一致
let sb = L.createInitialState(T0);
const seqB = [];
for (let d = 0; d < 3; d++) {
  const day = L.addDays(T0, d);
  if (d === 0) L.addExtra(sb, day, 5);
  const pb = L.getTodayPlan(sb, WORDS, day);
  seqB.push(pb.newWords.length);
  L.markNewWordsLearned(sb, pb.newWords.map(w => w.en), day, pb.extraCount);
}
ok(seqB[0] === 10, "第1天加量后给10个，实际:" + seqB[0]);
ok(seqB.slice(1).join(",") === seqA.slice(1).join(","),
  "加量后第2、3天计划与不加量时一致，实际:" + seqB.slice(1).join(",") + " vs " + seqA.slice(1).join(","));
ok(L.learnedCount(sb) === 20, "B 三天共学20个（15正常+5加量），实际:" + L.learnedCount(sb));
ok(L.aheadBy(sb, L.addDays(T0, 2)) === 0, "加量不算进度超前，实际:" + L.aheadBy(sb, L.addDays(T0, 2)));

// 撤销加量
let sc = L.createInitialState(T0);
L.addExtra(sc, T0, 5);
ok((sc.extras[T0] || 0) === 5, "加量记录=5");
L.clearExtra(sc, T0);
ok((sc.extras[T0] || 0) === 0, "撤销后加量清零");
const pc = L.getTodayPlan(sc, WORDS, T0);
ok(pc.newWords.length === 5, "撤销后回到正常额度5个，实际:" + pc.newWords.length);

/* ---------- 排期体检与拉回 ---------- */
section("排期体检");
let s11 = L.createInitialState(T0);
L.markNewWordsLearned(s11, ["hello", "hi"], T0);
ok(L.nextDueDate(s11) === L.addDays(T0, 1), "下次复习=明天，实际:" + L.nextDueDate(s11));
ok(L.scheduleAheadCount(s11, T0) === 0, "正常排期不算超前");
// 人为把复习日推到 60 天后（等价于改过系统时间）
s11.words["hello"].dueDate = L.addDays(T0, 60);
ok(L.scheduleAheadCount(s11, T0) === 1, "识别出1个超前排期");
const fixed = L.normalizeSchedule(s11, T0);
ok(fixed === 1, "拉回1个，实际:" + fixed);
ok(s11.words["hello"].stage === 0, "拉回后 stage 不变");
ok(s11.words["hello"].dueDate === L.addDays(T0, 1), "拉回后从明天复习，实际:" + s11.words["hello"].dueDate);
ok(L.scheduleAheadCount(s11, T0) === 0, "拉回后无超前");

/* ---------- 打卡幂等（加量后再打卡 streak 不变） ---------- */
section("打卡幂等");
let s9 = L.createInitialState(T0);
L.checkIn(s9, T0);
ok(s9.stats.streak === 1, "首次打卡 streak=1");
L.checkIn(s9, T0); // 加量学习完成后再次打卡
ok(s9.stats.streak === 1, "同日再打卡 streak 仍为1（幂等）");
ok(s9.stats.days.length === 1, "同日 days 不重复");

/* ---------- 汇总 ---------- */
console.log("\n==============================");
console.log("通过 " + pass + " 项，失败 " + fail + " 项");
process.exit(fail ? 1 : 0);
