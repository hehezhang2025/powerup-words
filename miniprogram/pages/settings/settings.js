const logic = require("../../utils/logic.js");
const backup = require("../../utils/backup.js");
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
    resetText: "",
    backupPanel: false,
    backupMode: "",   // "export" | "import"
    backupText: "",
    schedAhead: 0,    // 复习排期被推到 30 天以后的词数（改过系统时间的痕迹）
    aheadBy: 0        // 已学词数比计划超前的量
  },

  onShow() {
    const s = getApp().globalData.state;
    const today = logic.todayStr();
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
      graduated,
      schedAhead: logic.scheduleAheadCount(s, today),
      aheadBy: Math.max(0, logic.aheadBy(s, today))
    });
  },

  // 排期自救：改过系统时间后，复习日被推到很远的未来，导致「今日」长期无任务
  fixSchedule() {
    const self = this;
    wx.showModal({
      title: "拉回复习排期？",
      content: "把 " + this.data.schedAhead + " 个被排到很久以后的单词，按各自的掌握进度重新从今天开始排期。已学单词、掌握度、打卡天数都不变，只改下次复习日期。",
      confirmText: "拉回",
      cancelText: "取消",
      success(res) {
        if (!res.confirm) return;
        const app = getApp();
        const n = logic.normalizeSchedule(app.globalData.state, logic.todayStr());
        app.saveState();
        self.onShow();
        wx.showToast({ title: "已修正 " + n + " 个", icon: "success" });
      }
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

  // ---- 进度备份：导出 ----
  exportProgress() {
    const s = getApp().globalData.state;
    wx.showLoading({ title: "生成备份…", mask: true });
    backup.writeBackupFile(s)
      .then((f) => backup.shareFile(f.path, f.name))
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: "选个聊天发送保存即可", icon: "none", duration: 2500 });
      })
      .catch((err) => {
        wx.hideLoading();
        // 用户取消分享：不做任何提示，也不降级
        if (backup.isCancel(err)) return;
        // 不支持分享文件：降级为文本，长按复制
        this.setData({ backupPanel: true, backupMode: "export", backupText: backup.buildText(s) });
      });
  },

  // ---- 进度备份：一键复制（写入剪贴板） ----
  // 说明：wx.setClipboardData 属隐私接口，若 mp 后台未声明「剪贴板」，会 fail，此时降级为长按复制
  openCopyBackup() {
    const s = getApp().globalData.state;
    const text = backup.buildText(s);
    this.setData({ backupPanel: true, backupMode: "export", backupText: text });
    this.copyBackup(text);
  },
  copyBackup(text) {
    const t = text || this.data.backupText;
    if (!t) {
      wx.showToast({ title: "没有可复制的内容", icon: "none" });
      return;
    }
    wx.setClipboardData({
      data: t,
      success: () => {
        wx.showToast({ title: "已复制，去微信里粘贴保存", icon: "none", duration: 2500 });
      },
      fail: (err) => {
        const m = ((err && err.errMsg) || "") + "";
        if (m.indexOf("scope is not declared") >= 0 || m.indexOf("privacy") >= 0) {
          wx.showModal({
            title: "一键复制未开启",
            content: "本小程序还没声明剪贴板权限。请长按上方文字全选复制；或在 mp 后台「设置 → 服务内容声明 → 用户隐私保护指引」增加“剪贴板”后重新发布即可用按钮。",
            showCancel: false,
            confirmText: "知道了"
          });
        } else {
          wx.showToast({ title: "复制失败，请长按文本复制", icon: "none", duration: 2500 });
        }
      }
    });
  },

  // ---- 进度备份：导入 ----
  openImport() {
    this.importText = "";
    this.setData({ backupPanel: true, backupMode: "import", backupText: "" });
  },
  closeBackup() {
    this.setData({ backupPanel: false, backupText: "" });
  },
  // 导入模式不回写 data，避免长文本输入时光标跳动
  onBackupInput(e) {
    this.importText = e.detail.value || "";
  },
  doImport() {
    let obj;
    try {
      obj = backup.parseText(this.importText || "");
    } catch (err) {
      wx.showToast({ title: err.message || "备份内容无法识别", icon: "none", duration: 2000 });
      return;
    }
    const cur = backup.summary(getApp().globalData.state);
    const inc = backup.summary(obj);
    const self = this;
    wx.showModal({
      title: "确认导入？",
      content: "当前：" + cur.learned + " 词 / " + cur.days + " 天\n备份：" + inc.learned + " 词 / " + inc.days + " 天\n导入后备份将覆盖当前进度",
      confirmText: "导入覆盖",
      cancelText: "取消",
      success(res) {
        if (!res.confirm) return;
        getApp().replaceState(obj);
        self.setData({ backupPanel: false, backupText: "" });
        self.onShow();
        wx.showToast({ title: "导入完成", icon: "success" });
      }
    });
  },

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
