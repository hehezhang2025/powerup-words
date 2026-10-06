/* 词库运行时：支持多选——把勾选的多套词库合并成一份学习词表
 * 合并规则：按勾选顺序拼接，en 去重（保留首次出现）、zh 也去重（保证消消乐配对无歧义）
 * 排序规则：按「词库 + 单元」分组，单元之间保持教材顺序；单元内可选打乱
 * 页面统一走这里，不再直接 require 词表数据
 */
const { BANKS, BANK_MAP, DEFAULT_BANK } = require("../data/banks.js");
const { shuffle } = require("./rand.js");
const logic = require("./logic.js");

// 全局排布选项（由 app.js 按 state.settings 注入，页面不用各自传参）
let options = { shuffleInUnit: true, seed: "" };
function configure(opts) {
  if (opts) {
    if (opts.shuffleInUnit !== undefined) options.shuffleInUnit = !!opts.shuffleInUnit;
    if (opts.seed !== undefined) options.seed = String(opts.seed);
  }
  return options;
}
// 默认用当天日期做种子：同一天进出顺序稳定，隔天自动换一套顺序
function seedOf() {
  return options.seed || logic.todayStr();
}

function currentIds() {
  const app = (typeof getApp === "function" && getApp()) || null;
  const s = app && app.globalData && app.globalData.state;
  if (s && Array.isArray(s.bankIds) && s.bankIds.length) return s.bankIds;
  if (s && s.bankId) return [s.bankId]; // 旧数据（单选）兼容
  return [DEFAULT_BANK];
}

// 按「词库 + 单元」分组：组间保持教材顺序，组内按种子洗牌（不打乱则保持原序）
function arrange(list, shuffleInUnit, seed) {
  const groups = [];
  const index = {};
  list.forEach((w) => {
    const key = w.bank + "|" + w.unit;
    let g = index[key];
    if (!g) {
      g = { key: key, items: [] };
      index[key] = g;
      groups.push(g);
    }
    g.items.push(w);
  });
  const out = [];
  groups.forEach((g) => {
    const items = shuffleInUnit ? shuffle(g.items, seed + "|" + g.key) : g.items.slice();
    items.forEach((w) => out.push(w));
  });
  out.forEach((w, i) => { w.order = i; }); // order 跟着展示顺序走，保持连续
  return out;
}

// 合并去重 + 排布后的词表（带缓存：勾选/开关/种子不变时零开销）
const mergeCache = {};
function wordsOf(ids, opts) {
  const list = (ids && ids.length ? ids : [DEFAULT_BANK]).slice();
  const shuf = opts && opts.shuffleInUnit !== undefined ? !!opts.shuffleInUnit : options.shuffleInUnit;
  const seed = (opts && opts.seed) || seedOf();
  const key = list.join("+") + "|" + (shuf ? "S" : "N") + "|" + seed;
  if (mergeCache[key]) return mergeCache[key];
  const seenEn = {}, seenZh = {};
  const raw = [];
  list.forEach((id) => {
    const b = BANK_MAP[id];
    if (!b || !b.available) return;
    b.words.forEach((w) => {
      if (seenEn[w.en] || seenZh[w.zh]) return; // 跨库重复词只保留一次
      seenEn[w.en] = 1;
      seenZh[w.zh] = 1;
      raw.push({ en: w.en, zh: w.zh, unit: w.unit, bank: id, order: raw.length });
    });
  });
  mergeCache[key] = arrange(raw, shuf, seed);
  return mergeCache[key];
}

function words(ids, opts) {
  return wordsOf(ids || currentIds(), opts);
}

function total(ids) {
  return words(ids).length;
}

// en -> zh（消消乐配对用）
const zhCache = {};
function zhMap(ids) {
  const list = (ids || currentIds());
  const key = list.join("+");
  if (!zhCache[key]) {
    const m = {};
    wordsOf(list).forEach((w) => { m[w.en] = w.zh; });
    zhCache[key] = m;
  }
  return zhCache[key];
}

function info(ids) {
  const list = ids || currentIds();
  const picked = list.map((id) => BANK_MAP[id]).filter((b) => b && b.available);
  return {
    ids: list,
    count: picked.length,
    name: picked.length === 1 ? picked[0].name : "已选 " + picked.length + " 套",
    names: picked.map((b) => b.name),
    total: words(list).length
  };
}

module.exports = { BANKS, BANK_MAP, DEFAULT_BANK, configure, currentIds, wordsOf, words, total, zhMap, info };
