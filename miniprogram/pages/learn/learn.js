const logic = require("../../utils/logic.js");
const tts = require("../../utils/tts.js");
const bank = require("../../utils/bank.js");

Page({
  finished: false, // 是否走完正常流程（finish 置位）；中途返回时不置位

  data: {
    word: null,      // 当前词
    index: 0,
    total: 0,
    flipped: false   // 是否显示中文（点卡片翻面）
  },

  onLoad() {
    const s = getApp().globalData.state;
    const today = logic.todayStr();
    const plan = logic.getTodayPlan(s, bank.words(), today);
    this.newWords = plan.newWords;
    if (!this.newWords.length) {
      this.backSafe();
      return;
    }
    this.setData({ total: this.newWords.length });
    this.showWord(0);
  },

  // 安全返回：有上一页就返回；无上一页（如审核直达本页）则回首页
  backSafe() {
    wx.navigateBack({
      fail: () => wx.switchTab({ url: "/pages/index/index" })
    });
  },

  // 中途退出（点导航栏返回/物理返回）：结束本次流程会话。
  // 否则返回首页后 onShow 里的 inFlow 检查会立刻 nextStep 把人推回本页，
  // 返回键看起来就是"点了没反应"（微信审核驳回的原因）
  onUnload() {
    if (!this.finished) {
      const sess = getApp().globalData.session;
      if (sess) sess.inFlow = false;
    }
  },

  showWord(i) {
    const w = this.newWords[i];
    this.setData({ word: w, index: i, flipped: false });
    tts.speak(w.en); // 自动发音
  },

  flip() {
    this.setData({ flipped: !this.data.flipped });
    if (!this.data.flipped) tts.speak(this.data.word.en);
  },

  speak() {
    tts.speak(this.data.word.en);
  },

  next() {
    const i = this.data.index + 1;
    if (i >= this.newWords.length) {
      this.finish();
    } else {
      this.showWord(i);
    }
  },

  finish() {
    this.finished = true; // 正常完成：返回后由首页 onShow 自动衔接巩固环节
    // 登记今日新词（stage 0，明天开始复习）
    const s = getApp().globalData.state;
    const today = logic.todayStr();
    logic.markNewWordsLearned(s, this.newWords.map(w => w.en), today);
    const sess = getApp().globalData.session;
    if (sess) {
      sess.practicedEns = this.newWords.map(w => w.en);
      sess.learnDone = true;
    }
    getApp().saveState();
    this.backSafe();
  }
});
