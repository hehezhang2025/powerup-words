const logic = require("../../utils/logic.js");
const backup = require("../../utils/backup.js");
const bank = require("../../utils/bank.js");

// 每周新词档位：每天 1/2/3/5/10/15/20 个；不够用可在下面自定义 1~280
const WEEK_OPTIONS = [7, 14, 21, 35, 70, 105, 140];
const EXTRA_OPTIONS = [5, 10, 20];

Page({
  data: {
    weeklyNew: 35,
    weekOptions: WEEK_OPTIONS,
    extraOptions: EXTRA_OPTIONS,
    weekInput: "",
    dailyNew: 5,
    restWords: 0,
    weeksLeft: 0,
    todayExtra: 0,
    streak: 0,
    bestStreak: 0,
    dayCount: 0,
    learned: 0,
    graduated: 0,
    total: 0,
    bankName: "",
    bankCount: 0,
    bankGroups: [],
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
    const words = bank.words();
    const rest = Math.max(0, words.length - logic.learnedInPool(s, words));
    this.setData({
      weeklyNew: s.settings.weeklyNew,
      weekInput: String(s.settings.weeklyNew),
      dailyNew: logic.dailyQuota(s),
      restWords: rest,
      weeksLeft: rest ? Math.max(1, Math.ceil(rest / Math.max(1, s.settings.weeklyNew))) : 0,
      todayExtra: (s.extras && s.extras[today]) || 0,
      streak: s.stats.streak,
      bestStreak: s.stats.bestStreak,
      dayCount: s.stats.days.length,
      learned: logic.learnedInPool(s, words), // 只算已勾选词库里的已学词
      graduated,
      schedAhead: logic.scheduleAheadCount(s, today),
      aheadBy: Math.max(0, logic.aheadBy(s, today)),
      total: bank.total(),
      bankName: bank.info().name,
      bankCount: bank.info().count,
      bankGroups: this.buildBankGroups(s.bankIds)
    });
  },

  // 词库列表按系列分组，标记是否已勾选 / 是否可用
  buildBankGroups(ids) {
    const groups = [];
    bank.BANKS.forEach((b) => {
      let g = groups.find((x) => x.group === b.group);
      if (!g) { g = { group: b.group, items: [] }; groups.push(g); }
      g.items.push({
        id: b.id,
        name: b.name,
        desc: b.available ? b.desc + "｜" + b.total + " 词" : "整理中…",
        total: b.total,
        available: !!b.available,
        checked: ids.indexOf(b.id) >= 0
      });
    });
    return groups;
  },

  // 勾选 / 取消一套词库（可多选，至少留一套）
  toggleBank(e) {
    const id = e.currentTarget.dataset.id;
    const b = bank.BANK_MAP[id];
    if (!b || !b.available) {
      wx.showToast({ title: "这套词库正在整理中", icon: "none" });
      return;
    }
    const changed = getApp().toggleBank(id);
    if (!changed) {
      wx.showToast({ title: "至少要留一套词库", icon: "none" });
      return;
    }
    const on = getApp().globalData.state.bankIds.indexOf(id) >= 0;
    this.onShow();
    wx.showToast({
      title: (on ? "已加入" : "已移除") + "，共 " + bank.total() + " 词",
      icon: "none",
      duration: 2000
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

  // ---- 今日加点量：临时多背 N 个新词（仅当天有效，明天自动恢复正常节奏） ----
  // 加量背掉的词会打上标记，不占明后天的额度——今天多背不影响后面几天的计划
  addExtra(e) {
    const app = getApp();
    const s = app.globalData.state;
    const n = Number((e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.n) || 5);
    logic.addExtra(s, logic.todayStr(), n);
    app.saveState();
    this.onShow();
    wx.showToast({ title: "今天多给 " + n + " 词，回「今日」继续", icon: "none", duration: 2000 });
  },

  undoExtra() {
    const app = getApp();
    logic.clearExtra(app.globalData.state, logic.todayStr());
    app.saveState();
    this.onShow();
    wx.showToast({ title: "已撤销今天的加量", icon: "none", duration: 2000 });
  },

  setWeekly(e) {
    this.applyWeekly(Number(e.currentTarget.dataset.v));
  },
  onWeekInput(e) {
    this.setData({ weekInput: e.detail.value || "" });
  },
  applyCustomWeekly() {
    const v = Math.floor(Number(this.data.weekInput));
    if (!v || v < 1 || v > 280) {
      wx.showToast({ title: "请填 1~280 之间的整数", icon: "none", duration: 2000 });
      return;
    }
    this.applyWeekly(v);
  },
  applyWeekly(v) {
    const s = getApp().globalData.state;
    s.settings.weeklyNew = v;
    getApp().saveState();
    this.onShow();
    wx.showToast({ title: "每天 " + logic.dailyQuota(s) + " 个新词", icon: "success", duration: 2000 });
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
