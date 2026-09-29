const logic = require("../../utils/logic.js");
const tts = require("../../utils/tts.js");
const { WORDS } = require("../../data/words.js");

Page({
  data: {
    word: null,      // 当前词
    index: 0,
    total: 0,
    flipped: false   // 是否显示中文（点卡片翻面）
  },

  onLoad() {
    const s = getApp().globalData.state;
    const today = logic.todayStr();
    const plan = logic.getTodayPlan(s, WORDS, today);
    this.newWords = plan.newWords;
    if (!this.newWords.length) {
      wx.navigateBack();
      return;
    }
    this.setData({ total: this.newWords.length });
    this.showWord(0);
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
    wx.navigateBack();
  }
});
