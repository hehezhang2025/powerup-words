/* 词库汇总：把各库的 units 展平成有序词表（顺序 = 学习推进顺序）
 * 每词: { en, zh, unit, order }
 * available=false 的词库仅占位展示（整理中），不可选
 */
const RAW = [
  require("./banks/pu1.js"),
  require("./banks/pep3.js")
];

// 整理中的词库（先占位，避免用户以为漏了）
const PLANNED = [
  { id: "pu2", name: "PU 2 · 二级", group: "剑桥体系", desc: "A1 · YLE Movers｜整理中" },
  { id: "pu3", name: "PU 3 · 三级", group: "剑桥体系", desc: "A1 · YLE Movers｜整理中" },
  { id: "pu4", name: "PU 4 · 四级", group: "剑桥体系", desc: "A2 · YLE Flyers｜整理中" },
  { id: "pep4", name: "人教 PEP · 四年级", group: "校内教材", desc: "四年级上下册｜整理中" },
  { id: "pep5", name: "人教 PEP · 五年级", group: "校内教材", desc: "五年级上下册｜整理中" },
  { id: "pep6", name: "人教 PEP · 六年级", group: "校内教材", desc: "六年级上下册｜整理中" }
];

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
