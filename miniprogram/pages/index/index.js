const logic = require("../../utils/logic.js");
const tts = require("../../utils/tts.js");
const bank = require("../../utils/bank.js");

Page({
  data: {
    streak: 0,
    learned: 0,
    total: 0,
    reviewCount: 0,
    newCount: 0,
    extraCount: 0,   // 今日新词里属于「加量」的个数
    hardCount: 0,    // 错词本：今天要过的顽固词
    spotCount: 0,    // 毕业前抽查：提前考的长间隔词
    reviewTodo: 0,   // 复习环节总数（到期 + 抽查）
    dailyQuota: 5,
    doneToday: false,
    nothingToday: false, // 没复习也没新词（全部学完且未到期）
    nextDueText: "",     // 下次复习日期提示（"明天" / "10月5日（6天后）"）
    celebrate: false,
    confetti: []
  },

  onShow() {
    const app = getApp();
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
    const WORDS = bank.words();
    const plan = logic.getTodayPlan(s, WORDS, today);
    this.plan = plan;
    const reviewQueue = plan.reviewQueue || plan.reviews.map(r => r.en);
    // 预下载今日全部词的发音到本地，播放秒出不卡网络
    tts.preload(reviewQueue.concat(plan.hardWords).concat(plan.newWords.map(w => w.en)));
    this.setData({
      streak: s.stats.streak,
      learned: logic.learnedInPool(s, WORDS),
      reviewCount: plan.reviews.length,
      reviewTodo: reviewQueue.length,
      hardCount: (plan.hardWords || []).length,
      spotCount: (plan.spotChecks || []).length,
      newCount: plan.newWords.length,
      extraCount: plan.extraCount || 0,
      dailyQuota: plan.dailyQuota,
      // 打卡完成且无任何剩余任务才显示"已完成"（加量后新词出现时可继续学习）
      doneToday: plan.doneToday && reviewQueue.length === 0 && plan.hardWords.length === 0 && plan.newWords.length === 0,
      nothingToday: !plan.doneToday && reviewQueue.length === 0 && plan.hardWords.length === 0 && plan.newWords.length === 0,
      nextDueText: this.describeNextDue(s),
      total: bank.total()
    });
  },

  // 下一次复习什么时候：没有到期任务时告诉用户还要等多久（排查"调过系统时间"很有用）
  describeNextDue(s) {
    const today = logic.todayStr();
    const d = logic.nextDueDate(s);
    if (!d) return "";
    const gap = logic.daysBetween(today, d);
    const pretty = Number(d.slice(5, 7)) + "月" + Number(d.slice(8, 10)) + "日";
    if (gap <= 0) return "今天";
    if (gap === 1) return "明天";
    return pretty + "（" + gap + "天后）";
  },

  // 看错词本（不进学习流程，纯查看）
  openHard() {
    wx.navigateTo({ url: "/pages/hard/hard" });
  },

  // 点击"开始学习"：初始化今日流程会话
  startFlow() {
    const app = getApp();
    app.globalData.session = {
      date: logic.todayStr(),
      inFlow: true,
      reviewDone: false,
      hardDone: false,
      learnDone: false,
      practiceDone: false,
      practicedEns: []
    };
    this.nextStep();
  },

  // 流程编排：复习 → 错词本 → 新词卡片 → 新词巩固 → 打卡
  // 各步骤的 done 标志由对应页面"真正完成"时置位，中途退出会回到该步骤继续
  nextStep() {
    const app = getApp();
    const sess = app.globalData.session;
    const s = app.globalData.state;
    const today = logic.todayStr();
    const plan = logic.getTodayPlan(s, bank.words(), today);
    const reviewQueue = plan.reviewQueue || plan.reviews.map(r => r.en);

    if (!sess.reviewDone && reviewQueue.length > 0) {
      wx.navigateTo({ url: "/pages/game/game?mode=review" });
      return;
    }
    if (!sess.hardDone && (plan.hardWords || []).length > 0) {
      wx.navigateTo({ url: "/pages/game/game?mode=hard" });
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
