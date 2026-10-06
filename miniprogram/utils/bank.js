/* 词库运行时：支持多选——把勾选的多套词库合并成一份学习词表
 * 合并规则：按勾选顺序拼接，en 去重（保留首次出现）、zh 也去重（保证消消乐配对无歧义）
 * 页面统一走这里，不再直接 require 词表数据
 */
const { BANKS, BANK_MAP, DEFAULT_BANK } = require("../data/banks.js");

function currentIds() {
  const app = (typeof getApp === "function" && getApp()) || null;
  const s = app && app.globalData && app.globalData.state;
  if (s && Array.isArray(s.bankIds) && s.bankIds.length) return s.bankIds;
  if (s && s.bankId) return [s.bankId]; // 旧数据（单选）兼容
  return [DEFAULT_BANK];
}

// 合并去重后的词表（带缓存，勾选不变时零开销）
const mergeCache = {};
function wordsOf(ids) {
  const list = (ids && ids.length ? ids : [DEFAULT_BANK]).slice();
  const key = list.join("+");
  if (mergeCache[key]) return mergeCache[key];
  const seenEn = {}, seenZh = {};
  const out = [];
  let order = 0;
  list.forEach((id) => {
    const b = BANK_MAP[id];
    if (!b || !b.available) return;
    b.words.forEach((w) => {
      if (seenEn[w.en] || seenZh[w.zh]) return; // 跨库重复词只保留一次
      seenEn[w.en] = 1;
      seenZh[w.zh] = 1;
      out.push({ en: w.en, zh: w.zh, unit: w.unit, bank: id, order: order++ });
    });
  });
  mergeCache[key] = out;
  return out;
}

function words(ids) {
  return wordsOf(ids || currentIds());
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

module.exports = { BANKS, BANK_MAP, DEFAULT_BANK, currentIds, wordsOf, words, total, zhMap, info };
