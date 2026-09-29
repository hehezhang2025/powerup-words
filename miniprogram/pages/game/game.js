const logic = require("../../utils/logic.js");
const tts = require("../../utils/tts.js");
const { WORDS } = require("../../data/words.js");

const ZH_MAP = {};
WORDS.forEach(w => { ZH_MAP[w.en] = w.zh; });

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

Page({
  data: {
    mode: "review",
    enTiles: [],
    zhTiles: [],
    doneCount: 0,
    totalCount: 0,
    roundNo: 1,
    toast: "",        // 轻提示（再试试~）
    finished: false
  },

  onLoad(options) {
    const mode = options.mode === "practice" ? "practice" : "review";
    this.mode = mode;
    const app = getApp();
    const s = app.globalData.state;
    const today = logic.todayStr();

    // 构建今日待办词队列
    if (mode === "review") {
      const plan = logic.getTodayPlan(s, WORDS, today);
      this.queue = plan.reviews.map(r => r.en); // 全量到期复习
    } else {
      const sess = app.globalData.session || {};
      this.queue = (sess.practicedEns || []).slice();
    }
    if (!this.queue.length) { wx.navigateBack(); return; }
    tts.preload(this.queue); // 预下载本局词的发音，配对点击秒出声

    this.passed = {};   // 已配对成功的 en
    this.sel = null;    // 当前选中的 tile
    this.setData({ mode, totalCount: this.queue.length });
    this.buildRound();
  },

  // 本轮目标词：队列里未通过的前 N 个
  currentTargets() {
    const rest = this.queue.filter(en => !this.passed[en]);
    return rest.slice(0, this.mode === "review" ? 4 : 2);
  },

  buildRound() {
    const targets = this.currentTargets();
    if (!targets.length) { this.finishAll(); return; }

    let enList, zhList;
    if (this.mode === "review") {
      // 4 对纯配对（不足则有几个算几个）
      enList = targets.map(en => ({ key: en, text: en }));
      zhList = targets.map(en => ({ key: en, text: ZH_MAP[en] }));
    } else {
      // 经典 3+3：目标对 + 英文干扰 + 中文干扰（互不配对）
      const distract = this.pickDistractors(targets, 2);
      enList = targets.map(en => ({ key: en, text: en }));
      zhList = targets.map(en => ({ key: en, text: ZH_MAP[en] }));
      if (distract[0]) enList.push({ key: "dx-" + distract[0].en, text: distract[0].en, distract: true });
      if (distract[1]) zhList.push({ key: "dz-" + distract[1].en, text: distract[1].zh, distract: true });
    }
    this.roundTargets = targets;
    this.setData({
      enTiles: shuffle(enList),
      zhTiles: shuffle(zhList),
      toast: ""
    });
    this.sel = null;
  },

  // 从词库选干扰项（不在队列、不在本轮、英文与中文干扰来自不同词）
  pickDistractors(targets, n) {
    const pool = WORDS.filter(w => !this.queue.includes(w.en) && !targets.includes(w.en));
    const shuffled = shuffle(pool);
    return shuffled.slice(0, n);
  },

  onTile(e) {
    if (this.data.finished) return;
    const { type, index } = e.currentTarget.dataset;
    const tile = (type === "en" ? this.data.enTiles : this.data.zhTiles)[index];
    if (tile.gone) return;

    tts.speak(type === "en" ? tile.text : undefined); // 点英文发音

    // 第一次选择
    if (!this.sel) {
      this.sel = { type, index, tile };
      this.markSelected(type, index, true);
      return;
    }
    // 点了同一列 → 换选
    if (this.sel.type === type) {
      this.markSelected(this.sel.type, this.sel.index, false);
      this.sel = { type, index, tile };
      this.markSelected(type, index, true);
      return;
    }
    // 第二次选择 → 判定
    const first = this.sel;
    this.sel = null;
    this.markSelected(first.type, first.index, false);

    const enTile = first.type === "en" ? first.tile : tile;
    const zhTile = first.type === "en" ? tile : first.tile;
    const enPos = first.type === "en" ? first.index : index;
    const zhPos = first.type === "en" ? index : first.index;

    // 干扰项不可被配对（点了就提示）
    if (enTile.distract || zhTile.distract) {
      this.wrong(enPos, zhPos, null);
      return;
    }
    if (enTile.key === zhTile.key) {
      this.correct(enPos, zhPos, enTile.key);
    } else {
      this.wrong(enPos, zhPos, enTile.key);
    }
  },

  markSelected(type, index, on) {
    const field = type === "en" ? "enTiles" : "zhTiles";
    this.setData({ [`${field}[${index}].selected`]: on });
  },

  correct(enPos, zhPos, en) {
    const s = getApp().globalData.state;
    const today = logic.todayStr();
    // 复习模式记答题（推进遗忘曲线）；巩固模式新词今天刚学也记（帮助区分掌握度）
    logic.applyAnswer(s, en, true, today);
    getApp().saveState();
    this.passed[en] = true;

    this.setData({
      [`enTiles[${enPos}].gone`]: true,
      [`zhTiles[${zhPos}].gone`]: true,
      doneCount: Object.keys(this.passed).length
    });

    // 本轮目标全部配对成功 → 下一轮
    const roundDone = this.roundTargets.every(t => this.passed[t]);
    if (roundDone) {
      setTimeout(() => {
        this.setData({ roundNo: this.data.roundNo + 1 });
        this.buildRound();
      }, 450);
    }
  },

  wrong(enPos, zhPos, en) {
    if (en) {
      // 真实目标词答错：遗忘曲线回退，且移到队列末尾当天强化一次
      const s = getApp().globalData.state;
      logic.applyAnswer(s, en, false, logic.todayStr());
      getApp().saveState();
      const i = this.queue.indexOf(en);
      if (i > -1 && this.mode === "review") {
        this.queue.splice(i, 1);
        this.queue.push(en);
      }
    }
    this.setData({
      [`enTiles[${enPos}].shake`]: true,
      [`zhTiles[${zhPos}].shake`]: true,
      toast: "再试试~ 💪"
    });
    setTimeout(() => {
      this.setData({
        [`enTiles[${enPos}].shake`]: false,
        [`zhTiles[${zhPos}].shake`]: false
      });
    }, 450);
    setTimeout(() => { if (this.data.toast) this.setData({ toast: "" }); }, 1500);
  },

  finishAll() {
    // 通知首页：本步骤真正完成（中途退出则不会置位，返回后重新进入本步骤）
    const sess = getApp().globalData.session;
    if (sess) {
      if (this.mode === "review") sess.reviewDone = true;
      else sess.practiceDone = true;
    }
    this.setData({ finished: true });
    setTimeout(() => wx.navigateBack(), 1200);
  },

  // 中途退出：已答的已记录，剩余保留到明天（复习词未处理仍到期）
  onUnload() {}
});
