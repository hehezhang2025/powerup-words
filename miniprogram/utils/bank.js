/* 词库运行时：取当前选中词库的词表（页面统一走这里，不再直接 require data/words.js） */
const { BANKS, BANK_MAP, DEFAULT_BANK } = require("../data/banks.js");

function currentId() {
  const app = (typeof getApp === "function" && getApp()) || null;
  const s = app && app.globalData && app.globalData.state;
  return (s && s.bankId) || DEFAULT_BANK;
}

function info(bankId) {
  return BANK_MAP[bankId || currentId()] || BANK_MAP[DEFAULT_BANK];
}

// 当前词库的扁平有序词表
function words(bankId) {
  return info(bankId).words;
}

function total(bankId) {
  return info(bankId).total;
}

// en -> zh（消消乐配对用），按词库缓存
const zhCache = {};
function zhMap(bankId) {
  const id = (bankId || currentId());
  if (!zhCache[id]) {
    const m = {};
    info(id).words.forEach((w) => { m[w.en] = w.zh; });
    zhCache[id] = m;
  }
  return zhCache[id];
}

module.exports = { BANKS, BANK_MAP, DEFAULT_BANK, currentId, info, words, total, zhMap };
