const logic = require("../../utils/logic.js");
const tts = require("../../utils/tts.js");
const { WORDS, TOTAL } = require("../../data/words.js");

const ZH_MAP = {};
WORDS.forEach(w => { ZH_MAP[w.en] = w.zh; });

Page({
  data: {
    learned: 0,
    graduated: 0,
    total: TOTAL,
    reviewing: [],   // 复习中（含掌握度）
    done: [],        // 已毕业
    tab: "reviewing" // reviewing | done
  },

  onShow() {
    const s = getApp().globalData.state;
    const reviewing = [], done = [];
    for (const en of Object.keys(s.words)) {
      const w = s.words[en];
      const item = {
        en,
        zh: ZH_MAP[en] || "",
        mastery: logic.masteryOf(w),
        correct: w.correct,
        wrong: w.wrong,
        dueDate: w.dueDate || "已毕业"
      };
      (w.stage >= logic.MAX_STAGE ? done : reviewing).push(item);
    }
    reviewing.sort((a, b) => a.mastery - b.mastery); // 最弱的排前面，方便家长盯
    done.sort((a, b) => b.correct - a.correct);
    this.setData({
      learned: Object.keys(s.words).length,
      graduated: done.length,
      reviewing,
      done
    });
  },

  switchTab(e) {
    this.setData({ tab: e.currentTarget.dataset.tab });
  },

  speak(e) {
    tts.speak(e.currentTarget.dataset.en);
  }
});
