/* 界面集成测试：用 jsdom 模拟真实点击流程 */
var fs = require("fs");
var path = require("path");
var Module = require("module");

var NODE_MODULES = "/Users/weipengzhang/.workbuddy/binaries/node/workspace/node_modules";
var JSDOM;
try {
  JSDOM = require(path.join(NODE_MODULES, "jsdom")).JSDOM;
} catch (e) {
  JSDOM = require("jsdom").JSDOM;
}

var SRC = path.join(__dirname, "..", "src");
function read(f) { return fs.readFileSync(path.join(SRC, f), "utf8"); }

var scripts = ["words.js", "logic.js", "confetti.js", "app.js"].map(read).join("\n;\n");
var html =
  '<!DOCTYPE html><html><head></head><body><div class="app"><div id="app-root"></div></div>' +
  "<script>" + scripts + "</script></body></html>";

var dom = new JSDOM(html, {
  url: "http://localhost/",
  runScripts: "dangerously",
  pretendToBeVisual: true
});
var win = dom.window;
var doc = win.document;

var pass = 0, fail = 0, failures = [];
function ok(cond, msg) { if (cond) pass++; else { fail++; failures.push(msg); console.error("  ✗ " + msg); } }
function sleep(ms) { return new Promise(function (r) { win.setTimeout(r, ms); }); }
function $(sel, ctx) { return (ctx || doc).querySelector(sel); }
function $all(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }
function words(rowSel) { return $all(rowSel + " .tile").map(function (t) { return t.getAttribute("data-word"); }); }
function tileByWord(rowSel, w) {
  return $all(rowSel + " .tile").filter(function (t) { return t.getAttribute("data-word") === w; })[0];
}

(async function run() {
  // 关掉撒花（jsdom 无 canvas）
  win.Confetti = { burst: function () {} };

  console.log("\n▶ 首页渲染");
  ok(!!$(".hero"), "首页有主入口 hero");
  ok($all(".entry").length === 4, "首页 4 个功能入口");
  ok(!!$(".chip"), "顶部有星星/连击展示");

  console.log("\n▶ 进入游戏（默认 L1/全部/简单3+3）");
  $(".hero").click();
  await sleep(10);
  ok(!!$(".sheet-mask"), "点击开始弹出选择弹层");
  var startBtn = $(".sheet-mask .btn-primary");
  ok(!!startBtn, "弹层有开始按钮");
  startBtn.click();
  await sleep(20);
  ok(!!$("#row-en"), "进入游戏后有英文行");
  ok(words("#row-en").length === 3, "简单档英文 3 块，实际 " + words("#row-en").length);
  ok(words("#row-cn").length === 3, "简单档中文 3 块");

  // 计算正确对与干扰项
  function analyze() {
    var en = words("#row-en"), cn = words("#row-cn");
    var pairs = en.filter(function (w) { return cn.indexOf(w) !== -1; });
    var enDist = en.filter(function (w) { return cn.indexOf(w) === -1; });
    var cnDist = cn.filter(function (w) { return en.indexOf(w) === -1; });
    return { en: en, cn: cn, pairs: pairs, enDist: enDist, cnDist: cnDist };
  }
  var a = analyze();
  ok(a.pairs.length === 2, "简单档有 2 对可配对，实际 " + a.pairs.length);
  ok(a.enDist.length === 1, "恰好 1 个英文干扰");
  ok(a.cnDist.length === 1, "恰好 1 个中文干扰");

  console.log("\n▶ 错误配对：干扰英文 + 任意中文");
  tileByWord("#row-en", a.enDist[0]).click();
  await sleep(5);
  tileByWord("#row-cn", a.cnDist[0]).click();
  await sleep(520);
  ok($("#lastclear").textContent.indexOf("再试试") !== -1, "配错显示温柔提示，实际:" + $("#lastclear").textContent);
  var prog1 = JSON.parse(win.localStorage.getItem("powerup_adventure_v1"));
  ok(prog1 && prog1.progress[a.enDist[0]] && prog1.progress[a.enDist[0]].wrong >= 1, "配错记入错误库(wrong>=1)");

  console.log("\n▶ 正确配对第 1 对");
  tileByWord("#row-en", a.pairs[0]).click();
  await sleep(5);
  tileByWord("#row-cn", a.pairs[0]).click();
  await sleep(420);
  ok($(".hint").textContent.indexOf("已配对 1/2") !== -1, "配对成功进度 1/2，实际:" + $(".hint").textContent);
  var s2 = JSON.parse(win.localStorage.getItem("powerup_adventure_v1"));
  ok(s2.progress[a.pairs[0]] && s2.progress[a.pairs[0]].correct >= 1, "配对成功记入正确库(correct>=1)");
  ok(s2.progress[a.pairs[0]].box >= 2, "答对后 Leitner 盒子升级");

  console.log("\n▶ 正确配对第 2 对 → 过关换新题");
  tileByWord("#row-en", a.pairs[1]).click();
  await sleep(5);
  tileByWord("#row-cn", a.pairs[1]).click();
  await sleep(2000); // 消除动画320ms + 过关庆祝1400ms = 1720ms，留余量
  ok($(".page-title").textContent.indexOf("第 2 关") !== -1, "两对完成后进入第 2 关，实际:" + $(".page-title").textContent);
  var s3 = JSON.parse(win.localStorage.getItem("powerup_adventure_v1"));
  ok(s3.stats.rounds >= 1, "通关次数 rounds>=1");
  ok(s3.stats.stars > 0, "获得星星 stars>0");

  console.log("\n▶ 换一批按钮");
  var before = words("#row-en").join(",");
  $('[data-act="skip"]').click();
  await sleep(20);
  ok(!!$("#row-en"), "换一批后仍在游戏页");
  ok(words("#row-en").length === 3, "换一批后仍是 3 块");

  console.log("\n▶ 返回首页并查看错题本/已掌握");
  $('[data-act="home"]').click();
  await sleep(10);
  ok(!!$(".hero"), "返回首页成功");
  $('[data-act="wrong"]').click();
  await sleep(10);
  ok($(".page-title").textContent.indexOf("错题本") !== -1, "打开错题本");
  ok($all(".word-card").length >= 1, "错题本至少 1 条记录");

  $('[data-act="home"]').click(); await sleep(10);
  $('[data-act="badges"]').click(); await sleep(10);
  ok($(".badges") && $all(".badge-card").length === 8, "成就页 8 个徽章");
  ok($(".badge-card:not(.locked)"), "至少解锁一个徽章（初次通关）");

  console.log("\n▶ 难度切换（挑战 5+5）");
  $('[data-act="home"]').click(); await sleep(10);
  $(".hero").click(); await sleep(10);
  $('.sheet-mask [data-d="hard"]').click(); await sleep(15);
  // 弹层会重建，再点开始
  $('.sheet-mask [data-d="hard"]');
  var sb2 = $(".sheet-mask .btn-primary");
  sb2.click(); await sleep(20);
  ok(words("#row-en").length === 5, "挑战档英文 5 块，实际 " + words("#row-en").length);
  var a5 = analyze();
  ok(a5.pairs.length === 4, "挑战档 4 对可配对，实际 " + a5.pairs.length);

  console.log("\n========================================");
  console.log("通过 " + pass + " 项，失败 " + fail + " 项");
  if (fail > 0) {
    console.log("失败明细：");
    failures.forEach(function (f) { console.log("  - " + f); });
    process.exit(1);
  } else {
    console.log("✅ 集成测试全部通过");
    process.exit(0);
  }
})().catch(function (e) {
  console.error("测试异常：", e);
  process.exit(2);
});
