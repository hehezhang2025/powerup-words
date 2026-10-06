const logic = require("../../utils/logic.js");
const tts = require("../../utils/tts.js");
const bank = require("../../utils/bank.js");

Page({
  data: {
    list: [],
    total: 0,
    minLapses: logic.HARD_MIN_LAPSES,
    clearNeed: logic.HARD_CLEAR
  },

  onShow() {
    const s = getApp().globalData.state;
    const ZH = bank.zhMap();
    // 顽固词：累计答错 ≥2 次且还没毕业，按错得多的排前面
    const list = logic.hardWords(s, bank.words()).map((h) => {
      const w = s.words[h.en] || {};
      return {
        en: h.en,
        zh: ZH[h.en] || "",
        wrong: w.wrong || 0,
        correct: w.correct || 0,
        mastery: logic.masteryOf(w),
        need: Math.max(0, logic.HARD_CLEAR - (h.hardClear || 0)) // 还要连续答对几次才放出
      };
    });
    this.setData({ list: list, total: list.length });
  },

  speak(e) {
    tts.speak(e.currentTarget.dataset.en);
  }
});
