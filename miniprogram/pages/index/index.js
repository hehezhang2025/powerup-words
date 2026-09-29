const logic = require("../../utils/logic.js");
const tts = require("../../utils/tts.js");
const { WORDS, TOTAL } = require("../../data/words.js");

Page({
  data: {
    streak: 0,
    learned: 0,
    total: TOTAL,
    reviewCount: 0,
    newCount: 0,
    dailyQuota: 5,
    doneToday: false,
    nothingToday: false, // 没复习也没新词（全部学完且未到期）
    celebrate: false,
    confetti: []
  },

  onShow() {
    const app = getApp();
    // 云端数据就绪后刷新一次（跨设备同步回来的场景）
    if (!app.globalData.cloudReady) {
      app.cloudReadyCallback = () => this.refresh();
    }
    this.refresh();
    // 从 learn / game 返回时，推进学习流程
    const sess = app.globalData.session;
    if (sess && sess.date === logic.todayStr() && sess.inFlow) {
      this.nextStep();
    }
  },

  refresh() {
    const s = getApp().globalData.state;
    const today = logic.todayStr();
    const plan = logic.getTodayPlan(s, WORDS, today);
    this.plan = plan;
    // 预下载今日全部词的发音到本地，播放秒出不卡网络
    tts.preload(plan.reviews.map(r => r.en).concat(plan.newWords.map(w => w.en)));
    this.setData({
      streak: s.stats.streak,
      learned: logic.learnedCount(s),
      reviewCount: plan.reviews.length,
      newCount: plan.newWords.length,
      dailyQuota: plan.dailyQuota,
      // 打卡完成且无任何剩余任务才显示"已完成"（加量后新词出现时可继续学习）
      doneToday: plan.doneToday && plan.reviews.length === 0 && plan.newWords.length === 0,
      nothingToday: !plan.doneToday && plan.reviews.length === 0 && plan.newWords.length === 0
    });
  },

  // 点击"开始学习"：初始化今日流程会话
  startFlow() {
    const app = getApp();
    app.globalData.session = {
      date: logic.todayStr(),
      inFlow: true,
      reviewDone: false,
      learnDone: false,
      practiceDone: false,
      practicedEns: []
    };
    this.nextStep();
  },

  // 流程编排：复习 → 新词卡片 → 新词巩固 → 打卡
  // 各步骤的 done 标志由对应页面"真正完成"时置位，中途退出会回到该步骤继续
  nextStep() {
    const app = getApp();
    const sess = app.globalData.session;
    const s = app.globalData.state;
    const today = logic.todayStr();
    const plan = logic.getTodayPlan(s, WORDS, today);

    if (!sess.reviewDone && plan.reviews.length > 0) {
      wx.navigateTo({ url: "/pages/game/game?mode=review" });
      return;
    }
    if (!sess.learnDone && plan.newWords.length > 0) {
      wx.navigateTo({ url: "/pages/learn/learn" });
      return;
    }
    if (!sess.practiceDone && sess.practicedEns && sess.practicedEns.length > 0) {
      // 注意：新词已被 learn 登记为"已学"，plan.newWords 此时为 0，
      // 必须用会话里的今日新词清单判断，否则会错误跳过巩固
      wx.navigateTo({ url: "/pages/game/game?mode=practice" });
      return;
    }
    // 全部完成 → 打卡
    sess.inFlow = false;
    logic.checkIn(s, today);
    app.saveState();
    this.showCelebrate();
    this.refresh();
  },

  showCelebrate() {
    const icons = ["🎉", "⭐", "🌟", "🎊", "💖", "🍭"];
    const pieces = [];
    for (let i = 0; i < 14; i++) {
      pieces.push({
        icon: icons[i % icons.length],
        left: Math.round(Math.random() * 90) + "vw",
        delay: (Math.random() * 0.4).toFixed(2) + "s"
      });
    }
    this.setData({ celebrate: true, confetti: pieces });
    setTimeout(() => this.setData({ celebrate: false }), 1800);
  }
});
