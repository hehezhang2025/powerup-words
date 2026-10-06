/* 词库汇总：把各库的 units 展平成有序词表（顺序 = 学习推进顺序）
 * 每词: { en, zh, unit, order }
 * available=false 的词库仅占位展示（整理中），不可选
 */
// 全部 8 套词库（新增词库：复制一份 banks/*.js 改内容，再在这里加一行 require）
const RAW = [
  require("./banks/pu1.js"),
  require("./banks/pu2.js"),
  require("./banks/pu3.js"),
  require("./banks/pu4.js"),
  require("./banks/pep3.js"),
  require("./banks/pep4.js"),
  require("./banks/pep5.js"),
  require("./banks/pep6.js")
];

const PLANNED = []; // 暂无待整理词库

function flatten(bank) {
  const words = [];
  let order = 0;
  bank.units.forEach((u) => {
    u.words.forEach((w) => {
      words.push({ en: w.en, zh: w.zh, unit: u.key, order: order++ });
    });
  });
  return words;
}

const BANKS = RAW.map((b) => {
  const words = flatten(b);
  return {
    id: b.id,
    name: b.name,
    group: b.group,
    desc: b.desc,
    available: true,
    units: b.units.map((u) => ({ key: u.key, title: u.title, count: u.words.length })),
    words,
    total: words.length
  };
}).concat(PLANNED.map((p) => Object.assign({ available: false, words: [], total: 0, units: [] }, p)));

const BANK_MAP = {};
BANKS.forEach((b) => { BANK_MAP[b.id] = b; });

const DEFAULT_BANK = "pu1";

module.exports = { BANKS, BANK_MAP, DEFAULT_BANK };
