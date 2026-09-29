const logic = require("../../utils/logic.js");
const { TOTAL } = require("../../data/words.js");

const WEEK_OPTIONS = [7, 14, 21, 35, 49, 70];

Page({
  data: {
    weeklyNew: 35,
    weekOptions: WEEK_OPTIONS,
    todayExtra: 0,
    streak: 0,
    bestStreak: 0,
    dayCount: 0,
    learned: 0,
    graduated: 0,
    total: TOTAL,
    confirmReset: false,
    resetText: ""
  },

  onShow() {
    const s = getApp().globalData.state;
    let graduated = 0;
    for (const en of Object.keys(s.words)) {
      if (s.words[en].stage >= logic.MAX_STAGE) graduated++;
    }
    this.setData({
      weeklyNew: s.settings.weeklyNew,
      todayExtra: (s.extras && s.extras[logic.todayStr()]) || 0,
      streak: s.stats.streak,
      bestStreak: s.stats.bestStreak,
      dayCount: s.stats.days.length,
      learned: Object.keys(s.words).length,
      graduated
    });
  },

  // ---- 今日加点量：+5 新词 + 一轮消消乐（仅当天有效，明天自动恢复） ----
  addExtra() {
    const app = getApp();
    const s = app.globalData.state;
    logic.addExtra(s, logic.todayStr(), 5);
    app.saveState();
    this.onShow();
    wx.showToast({ title: "已加5词，回「今日」继续", icon: "none", duration: 2000 });
  },

  setWeekly(e) {
    const v = Number(e.currentTarget.dataset.v);
    const s = getApp().globalData.state;
    s.settings.weeklyNew = v;
    getApp().saveState();
    this.setData({ weeklyNew: v });
    wx.showToast({ title: "已保存", icon: "success" });
  },

  noop() {},

  // ---- 重置 ----
  openReset() {
    this.setData({ confirmReset: true, resetText: "" });
  },
  cancelReset() {
    this.setData({ confirmReset: false, resetText: "" });
  },
  onResetInput(e) {
    this.setData({ resetText: e.detail.value });
  },
  doReset() {
    if (this.data.resetText !== "重置") {
      wx.showToast({ title: "请输入「重置」确认", icon: "none" });
      return;
    }
    getApp().resetState();
    this.setData({ confirmReset: false, resetText: "" });
    this.onShow();
    wx.showToast({ title: "已清零，从头开始", icon: "success" });
  }
});
