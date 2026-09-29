/* 纯逻辑测试（Node 运行，无需浏览器） */
var path = require("path");
var bank = require(path.join(__dirname, "..", "src", "words.js"));
var G = require(path.join(__dirname, "..", "src", "logic.js"));

var pass = 0;
var fail = 0;
var failures = [];

function ok(cond, msg) {
  if (cond) {
    pass++;
  } else {
    fail++;
    failures.push(msg);
    console.error("  ✗ " + msg);
  }
}
function eq(a, b, msg) {
  ok(a === b, msg + "  (期望 " + b + "，实际 " + a + ")");
}

function section(name) {
  console.log("\n▶ " + name);
}

/* ---------- 词库完整性 ---------- */
section("词库完整性");
["L1", "L2"].forEach(function (lv) {
  ok(bank[lv] && bank[lv].units, lv + " 存在");
  Object.keys(bank[lv].units).forEach(function (u) {
    var unit = bank[lv].units[u];
    ok(unit.words.length >= 3, lv + "/" + u + " 至少 3 词");
    unit.words.forEach(function (w) {
      ok(!!w.en && !!w.zh, lv + "/" + u + " 词条含 en 与 zh：" + JSON.stringify(w));
    });
  });
});

// 全库唯一性：en 与 zh 各自不得重复（重复会导致配对歧义——同一中文可对多个英文）
(function () {
  var enSeen = {}, zhSeen = {}, enDup = [], zhDup = [];
  ["L1", "L2"].forEach(function (lv) {
    Object.keys(bank[lv].units).forEach(function (u) {
      bank[lv].units[u].words.forEach(function (w) {
        var e = w.en.toLowerCase();
        if (enSeen[e]) enDup.push(e + "(" + enSeen[e] + "/" + lv + u + ")"); else enSeen[e] = lv + u;
        if (zhSeen[w.zh]) zhDup.push(w.zh + "(" + zhSeen[w.zh] + "/" + lv + u + ")"); else zhSeen[w.zh] = lv + u;
      });
    });
  });
  eq(enDup.length, 0, "全库英文无重复" + (enDup.length ? "，重复:" + enDup.join(",") : ""));
  eq(zhDup.length, 0, "全库中文无重复" + (zhDup.length ? "，重复:" + zhDup.join(",") : ""));
  var total = Object.keys(enSeen).length;
  ok(total >= 450, "全库词数 >= 450，实际 " + total);
})();

/* ---------- 词池构建与去重 ---------- */
section("词池构建与去重");
var poolAll = G.buildPool(bank, { level: "ALL", units: "ALL" });
ok(poolAll.length > 100, "全部混合词池 >100，实际 " + poolAll.length);
var ids = poolAll.map(function (w) { return w.id.toLowerCase(); });
var uniq = {};
var dup = 0;
ids.forEach(function (id) { if (uniq[id]) dup++; uniq[id] = 1; });
eq(dup, 0, "全部混合词池按 en 去重后无重复");

var poolL1 = G.buildPool(bank, { level: "L1", units: "ALL" });
ok(poolL1.every(function (w) { return w.level === "L1"; }), "L1 词池只含 L1");
var poolU1 = G.buildPool(bank, { level: "L1", units: ["U1"] });
ok(poolU1.every(function (w) { return w.unit === "U1"; }), "L1/U1 词池只含 U1");
ok(poolU1.length === bank.L1.units.U1.words.length, "L1/U1 词数匹配");

/* ---------- 出题正确性（多难度、多随机种子） ---------- */
section("出题正确性");
[3, 4, 5].forEach(function (size) {
  for (var seed = 1; seed <= 40; seed++) {
    var rng = G.makeRng(seed * 100 + size);
    var round = G.buildRound(poolAll, size, rng);
    eq(round.enTiles.length, size, "size=" + size + " seed=" + seed + " 英文方块数");
    eq(round.cnTiles.length, size, "size=" + size + " seed=" + seed + " 中文方块数");
    eq(round.correctPairIds.length, size - 1, "size=" + size + " seed=" + seed + " 正确对数=size-1");

    // 干扰项：正好 1 个英文、1 个中文无法配对
    var cnIds = {};
    round.cnTiles.forEach(function (t) { cnIds[t.wordId] = true; });
    var enIds = {};
    round.enTiles.forEach(function (t) { enIds[t.wordId] = true; });
    var enDistract = round.enTiles.filter(function (t) { return !cnIds[t.wordId]; });
    var cnDistract = round.cnTiles.filter(function (t) { return !enIds[t.wordId]; });
    eq(enDistract.length, 1, "size=" + size + " seed=" + seed + " 恰好 1 个英文干扰");
    eq(cnDistract.length, 1, "size=" + size + " seed=" + seed + " 恰好 1 个中文干扰");

    // 方块内不重复 wordId
    var seenEn = {}; var dupEn = 0;
    round.enTiles.forEach(function (t) { if (seenEn[t.wordId]) dupEn++; seenEn[t.wordId] = 1; });
    eq(dupEn, 0, "size=" + size + " seed=" + seed + " 英文侧无重复词");
    var seenCn = {}; var dupCn = 0;
    round.cnTiles.forEach(function (t) { if (seenCn[t.wordId]) dupCn++; seenCn[t.wordId] = 1; });
    eq(dupCn, 0, "size=" + size + " seed=" + seed + " 中文侧无重复词");

    // 正确对确实两侧都在
    round.correctPairIds.forEach(function (pid) {
      ok(enIds[pid] && cnIds[pid], "size=" + size + " seed=" + seed + " 正确对两侧齐全:" + pid);
    });
  }
});

/* ---------- 配对判定 ---------- */
section("配对判定");
var r = G.buildRound(poolAll, 3, G.makeRng(7));
var pid = r.correctPairIds[0];
var enT = r.enTiles.find(function (t) { return t.wordId === pid; });
var cnT = r.cnTiles.find(function (t) { return t.wordId === pid; });
ok(G.checkMatch(enT, cnT), "同词英+中 判定为匹配");
var cnIdsMap = {};
r.cnTiles.forEach(function (t) { cnIdsMap[t.wordId] = t; });
var enDist = r.enTiles.find(function (t) { return !cnIdsMap[t.wordId]; });
var anyCn = r.cnTiles[0];
ok(!G.checkMatch(enDist, anyCn) || enDist.wordId === anyCn.wordId, "英文干扰项与任意中文一般不匹配");
ok(!G.checkMatch(cnT, enT), "参数顺序错误(中,英)不判为匹配");

/* ---------- Leitner 遗忘曲线 ---------- */
section("Leitner 遗忘曲线");
var now = 1000000000000;
var p0 = G.initProgress();
eq(p0.box, 1, "初始盒子=1");
var p1 = G.scheduleAfterAnswer(p0, true, now);
eq(p1.box, 2, "答对升到第2盒");
eq(p1.due, now + G.LEITNER_INTERVALS_DAYS[2] * G.DAY, "答对后 due=now+2天");
eq(p1.correct, 1, "答对计数+1");
var p2 = G.scheduleAfterAnswer(p1, false, now);
eq(p2.box, 1, "答错回到第1盒");
eq(p2.due, now, "答错 due=now(立即到期)");
eq(p2.wrong, 1, "答错计数+1");

// 连续答对盒子封顶 6
var pp = G.initProgress();
for (var i = 0; i < 10; i++) pp = G.scheduleAfterAnswer(pp, true, now);
eq(pp.box, G.MAX_BOX, "连续答对盒子封顶=" + G.MAX_BOX);

/* ---------- 到期筛选与次日优先 ---------- */
section("到期筛选与次日优先");
var pmap = {};
var wWrong = poolAll[0];
var wRight = poolAll[1];
pmap[wWrong.id] = G.scheduleAfterAnswer(G.initProgress(), false, now); // 立即到期
pmap[wRight.id] = G.scheduleAfterAnswer(G.initProgress(), true, now);  // 2天后到期

var dueNow = G.pickDueWords(poolAll, pmap, now);
ok(dueNow.some(function (w) { return w.id === wWrong.id; }), "错词当天即到期");
ok(!dueNow.some(function (w) { return w.id === wRight.id; }), "刚答对的词当天不到期");

var tomorrow = now + G.DAY;
var dueTomorrow = G.pickDueWords(poolAll, pmap, tomorrow);
ok(dueTomorrow.some(function (w) { return w.id === wWrong.id; }), "次日错词仍优先到期");
ok(dueTomorrow[0].id === wWrong.id || pmap[dueTomorrow[0].id].box === 1, "次日队列弱项(box=1)排最前");

// countDue
eq(G.countDue(poolAll, pmap, now), dueNow.length, "countDue 与队列长度一致");

/* ---------- 智能取词优先复习 ---------- */
section("智能取词");
var smartWords = G.pickRoundWords(poolAll, 4, pmap, now, G.makeRng(3), true);
eq(smartWords.length, 4, "智能取词返回指定数量");
var smUniq = {}; var smDup = 0;
smartWords.forEach(function (w) { if (smUniq[w.id]) smDup++; smUniq[w.id] = 1; });
eq(smDup, 0, "智能取词无重复");
ok(smartWords.some(function (w) { return w.id === wWrong.id; }), "智能取词包含到期错词");

/* ---------- 边界：词池刚好/不足 ---------- */
section("边界条件");
var tiny = poolAll.slice(0, 4);
ok((function () { try { G.buildRound(tiny, 3, G.makeRng(1)); return true; } catch (e) { return false; } })(), "3+3 需要4词，恰好4词可出题");
var tooTiny = poolAll.slice(0, 3);
ok((function () { try { G.buildRound(tooTiny, 3, G.makeRng(1)); return false; } catch (e) { return true; } })(), "词池不足(3词)应抛错");

/* ---------- 导出 / 导入 / 合并（跨设备） ---------- */
section("导出导入合并");
var stA = {
  progress: {
    apple: { id: "apple", en: "apple", zh: "苹果", correct: 2, wrong: 1, box: 3, lastSeen: 1000, due: 2000, appear: 3, level: "L1", unit: "U5" },
    cat: { id: "cat", en: "cat", zh: "猫", correct: 5, wrong: 0, box: 5, lastSeen: 1500, due: 5000, appear: 5, level: "L1", unit: "U4" }
  },
  stats: { stars: 12, matches: 30, rounds: 10, perfectRounds: 4, streak: 3, bestStreak: 5, plays: 10, days: ["d1", "d2"] },
  settings: { level: "L1", units: "ALL", difficulty: "easy", sound: true }
};
var code = G.encodeState(stA);
ok(typeof code === "string" && code.indexOf("PU1:") === 0, "encodeState 生成 PU1: 前缀字符串");
var dec = G.decodeState(code);
ok(G.isValidState(dec), "decodeState 还原合法状态");
eq(dec.progress.apple.correct, 2, "解码后字段保留(apple.correct)");
eq(dec.progress.cat.box, 5, "解码后字段保留(cat.box)");
ok(G.decodeState("乱码不是base64!!!") === null, "非法内容返回 null");
ok(G.decodeState("") === null, "空串返回 null");
ok(G.decodeState("PU1:@@@@") === null, "损坏的 base64 返回 null");
// 含中文编码往返
stA.progress["高兴的"] = { id: "高兴的", en: "happy", zh: "高兴的", correct: 1, wrong: 0, box: 2, lastSeen: 1, due: 2, appear: 1, level: "L1", unit: "U3" };
var dec2 = G.decodeState(G.encodeState(stA));
ok(dec2.progress["高兴的"] && dec2.progress["高兴的"].zh === "高兴的", "中文词条编解码往返正常");
// 合并：base 与 incoming 各有数据，取较强
var stB = {
  progress: {
    apple: { id: "apple", en: "apple", zh: "苹果", correct: 4, wrong: 0, box: 4, lastSeen: 3000, due: 900, appear: 4, level: "L1", unit: "U5" },
    dog: { id: "dog", en: "dog", zh: "狗", correct: 1, wrong: 2, box: 1, lastSeen: 500, due: 600, appear: 3, level: "L1", unit: "U2" }
  },
  stats: { stars: 5, matches: 10, rounds: 3, perfectRounds: 1, streak: 2, bestStreak: 2, plays: 3, days: ["d3"] },
  settings: { level: "L2", units: "U1", difficulty: "mid", sound: false }
};
var merged = G.mergeState(stA, stB);
eq(Object.keys(merged.progress).length, 4, "合并后 progress 含 4 个词(apple/cat/高兴的/dog)");
eq(merged.progress.apple.correct, 4, "apple.correct 取较大(4)");
eq(merged.progress.apple.wrong, 1, "apple.wrong 取较大(1)");
eq(merged.progress.apple.box, 4, "apple.box 取较大(4)");
eq(merged.progress.apple.due, 900, "apple.due 取较早(900)");
ok(merged.progress.dog && merged.progress.dog.correct === 1, "新词 dog 被并入");
eq(merged.stats.stars, 12, "stats.stars 取较大(12)");
eq(merged.stats.plays, 13, "stats.plays 累加(10+3)");
ok(merged.settings.level === "L1", "settings 保留 base(L1，不被 incoming L2 覆盖)");
var merged2 = G.mergeState(stA, null);
ok(merged2 === stA, "mergeState 遇到非法 incoming 原样返回 base");

/* ---------- 汇总 ---------- */
console.log("\n========================================");
console.log("通过 " + pass + " 项，失败 " + fail + " 项");
if (fail > 0) {
  console.log("失败明细：");
  failures.slice(0, 30).forEach(function (f) { console.log("  - " + f); });
  process.exit(1);
} else {
  console.log("✅ 全部通过");
  process.exit(0);
}
