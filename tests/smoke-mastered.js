/* 冒烟测试：打包单文件 + 已掌握页展示（答对≥1次即显示，含次数与熟练标记） */
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "dist", "powerup单词冒险.html"), "utf8");

const KEY = "powerup_adventure_v1";
const now = Date.now();
const st = {
  progress: {
    apple: { id: "apple", en: "apple", zh: "苹果", box: 2, due: now + 86400000, correct: 1, wrong: 0, lastSeen: now, seen: 1, level: "L1", unit: "U5" },
    cat: { id: "cat", en: "cat", zh: "猫", box: 4, due: now + 86400000, correct: 4, wrong: 0, lastSeen: now, seen: 4, level: "L1", unit: "U4" },
    dog: { id: "dog", en: "dog", zh: "狗", box: 1, due: now, correct: 0, wrong: 2, lastSeen: now, seen: 2, level: "L1", unit: "U4" }
  },
  stats: { stars: 30, matches: 5, rounds: 2, perfectRounds: 2, streak: 1, lastPlayDay: "", days: [] },
  settings: { level: "L1", units: "ALL", difficulty: "easy", sound: true }
};

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  pretendToBeVisual: true,
  url: "http://localhost/",
  beforeParse(win) { win.localStorage.setItem(KEY, JSON.stringify(st)); }
});

setTimeout(() => {
  const w = dom.window, d = w.document;
  let count = 0;
  for (const lv of Object.values(w.WORD_BANK)) for (const u of Object.values(lv.units)) count += u.words.length;

  d.querySelector('[data-act="mastered"]').click();
  setTimeout(() => {
    const cards = d.querySelectorAll(".word-card").length;
    const txt = d.body.textContent;
    const okApple = txt.includes("apple") && txt.includes("对 1 次");
    const okProf = txt.includes("熟练") && txt.includes("对 4 次");
    const noDog = !Array.from(d.querySelectorAll(".word-card .we")).some(e => e.textContent === "dog");
    console.log("词库量:", count, "| 已掌握卡片:", cards, "| apple对1次:", okApple, "| cat熟练:", okProf, "| dog(全错)不显示:", noDog);
    if (count >= 450 && cards === 2 && okApple && okProf && noDog) {
      console.log("✅ 已掌握页冒烟测试通过");
      process.exit(0);
    }
    console.error("❌ 冒烟测试失败");
    process.exit(1);
  }, 100);
}, 300);
