const logic = require("../../utils/logic.js");
const tts = require("../../utils/tts.js");
const bank = require("../../utils/bank.js");
const { shuffle } = require("../../utils/rand.js");

function shuffleArr(arr) {
  return shuffle(arr, "tile-" + Date.now() + "-" + Math.random());
}

// 编辑距离（形近词判定）
function editDist(a, b) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 3) return 4;
  const prev = [], cur = [];
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    for (let j = 0; j <= n; j++) prev[j] = cur[j];
  }
  return prev[n];
}
// 最长公共前缀/后缀（音近词判定：cat/cap、ship/sheep）
function commonAffix(a, b) {
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length && suf < b.length && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  return Math.max(pre, suf);
}

const MODE_TEXT = { review: "🔁 复习模式", hard: "💪 错词本", practice: "🎮 巩固模式" };

Page({
  flowDone: false, // 本环节是否走完（finishAll 置位）；中途返回时不置位

  data: {
    mode: "review",
    modeText: MODE_TEXT.review,
    enTiles: [],
    zhTiles: [],
    doneCount: 0,
    totalCount: 0,
    roundNo: 1,
    toast: "",        // 轻提示（干扰项/再试试）
    answerCard: null, // 答错后的正解卡 {en, zh}
    finished: false
  },

  onLoad(options) {
    const m = options && options.mode;
    const mode = (m === "hard" || m === "practice") ? m : "review";
    this.mode = mode;
    const app = getApp();
    const s = app.globalData.state;
    const today = logic.todayStr();
    const WORDS = bank.words();
    this.ZH_MAP = bank.zhMap();
    this.WORDS = WORDS;
    this.UNIT_OF = {};
    WORDS.forEach((w) => { this.UNIT_OF[w.en] = w.unit; });
    this.spotSet = {}; // 毕业前抽查的词：答对不算推进

    // 构建本环节待办词队列（首页用同一批规则判空，避免"进来是空的"）
    if (mode === "review") {
      const plan = logic.getTodayPlan(s, WORDS, today);
      this.queue = (plan.reviewQueue || plan.reviews.map(r => r.en)).slice();
      (plan.spotChecks || []).forEach((en) => { this.spotSet[en] = 1; });
    } else if (mode === "hard") {
      this.queue = logic.todayHardQueue(s, today, WORDS);
    } else {
      const sess = app.globalData.session || {};
      this.queue = (sess.practicedEns || []).slice();
    }
    if (!this.queue.length) { this.backSafe(); return; }
    tts.preload(this.queue); // 预下载本局词的发音，配对点击秒出声

    this.passed = {};   // 已配对成功的 en
    this.sel = null;    // 当前选中的 tile
    this.setData({ mode, modeText: MODE_TEXT[mode], totalCount: this.queue.length });
    this.buildRound();
  },

  // 本轮目标词：队列里未通过的前 N 个
  currentTargets() {
    const rest = this.queue.filter(en => !this.passed[en]);
    return rest.slice(0, this.mode === "practice" ? 2 : 4);
  },

  buildRound() {
    const targets = this.currentTargets();
    if (!targets.length) { this.finishAll(); return; }

    let enList, zhList;
    if (this.mode === "review" || this.mode === "hard") {
      // 4 对纯配对（不足则有几个算几个）
      enList = targets.map(en => ({ key: en, text: en, spot: !!this.spotSet[en] }));
      zhList = targets.map(en => ({ key: en, text: this.ZH_MAP[en] }));
    } else {
      // 经典 3+3：目标对 + 英文干扰 + 中文干扰（互不配对）
      const distract = this.pickDistractors(targets, 2);
      enList = targets.map(en => ({ key: en, text: en }));
      zhList = targets.map(en => ({ key: en, text: this.ZH_MAP[en] }));
      if (distract[0]) enList.push({ key: "dx-" + distract[0].en, text: distract[0].en, distract: true });
      if (distract[1]) zhList.push({ key: "dz-" + distract[1].en, text: distract[1].zh, distract: true });
    }
    this.roundTargets = targets;
    this.setData({
      enTiles: shuffleArr(enList),
      zhTiles: shuffleArr(zhList),
      toast: "",
      answerCard: null
    });
    this.sel = null;
  },

  // 干扰项打分：曾错过 > 同单元 > 形近音近。
  // 小孩错的大多是 cat/cap、ship/sheep 这类，随机干扰项练不到痛点
  distractScore(w, targets) {
    const s = getApp().globalData.state;
    const rec = s.words[w.en];
    let score = 0;
    if (rec && ((rec.wrong || 0) > 0 || (rec.lapses || 0) > 0)) score += 100;
    targets.forEach((t) => {
      if (this.UNIT_OF[t] && w.unit === this.UNIT_OF[t]) score += 20;
      const d = editDist(w.en, t);
      if (d <= 3) score += (4 - d) * 12;
      const aff = commonAffix(w.en, t);
      if (aff >= 3) score += aff * 5;
    });
    return score;
  },

  // 从词库选干扰项：先随机抽一批候选，再按上面的分排序，从最像的几个里取
  pickDistractors(targets, n) {
    const pool = this.WORDS.filter(w => this.queue.indexOf(w.en) < 0 && targets.indexOf(w.en) < 0);
    const cand = shuffle(pool, "dx-" + targets.join(",")).slice(0, 80);
    const scored = cand.map(w => ({ w: w, score: this.distractScore(w, targets) }));
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, Math.max(n * 4, 8)); // 前几名里再随机，避免每天同一组
    return shuffle(top, "pick-" + targets.join(",")).slice(0, n).map(x => x.w);
  },

  onTile(e) {
    if (this.data.finished || this.data.answerCard) return;
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
      this.correct(enPos, zhPos, enTile.key, !!enTile.spot);
    } else {
      this.wrong(enPos, zhPos, enTile.key);
    }
  },

  markSelected(type, index, on) {
    const field = type === "en" ? "enTiles" : "zhTiles";
    this.setData({ [`${field}[${index}].selected`]: on });
  },

  correct(enPos, zhPos, en, isSpot) {
    const s = getApp().globalData.state;
    const today = logic.todayStr();
    if (this.mode === "hard") {
      // 错词本：连续答对 3 次自动放出
      logic.applyHardAnswer(s, en, true, today);
    } else if (this.mode === "practice" || isSpot) {
      // 当天巩固 / 毕业前抽查：答对不推进 stage（提前答出来不代表能撑到那个间隔）
      logic.applyAnswer(s, en, true, today, { probe: true });
    } else {
      logic.applyAnswer(s, en, true, today);
    }
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
      const s = getApp().globalData.state;
      const today = logic.todayStr();
      if (this.mode === "hard") {
        logic.applyHardAnswer(s, en, false, today);
      } else {
        logic.applyAnswer(s, en, false, today, { probe: !!this.spotSet[en] });
      }
      getApp().saveState();
      // 复习模式：移到队列末尾，当天再给一次机会
      const i = this.queue.indexOf(en);
      if (i > -1 && this.mode === "review") {
        this.queue.splice(i, 1);
        this.queue.push(en);
      }
      // 正解卡：错了立刻给答案（发音+中文），不然孩子靠排除法"试出来"不算真会
      if (this.acTimer) clearTimeout(this.acTimer);
      this.setData({ answerCard: { en: en, zh: this.ZH_MAP[en] || "" }, toast: "" });
      tts.speak(en);
      this.acTimer = setTimeout(() => this.setData({ answerCard: null }), 1800);
    } else {
      this.setData({ toast: "这个不在今天的词里~" });
      if (this.toastTimer) clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => { if (this.data.toast) this.setData({ toast: "" }); }, 1500);
    }
    this.setData({
      [`enTiles[${enPos}].shake`]: true,
      [`zhTiles[${zhPos}].shake`]: true
    });
    setTimeout(() => {
      this.setData({
        [`enTiles[${enPos}].shake`]: false,
        [`zhTiles[${zhPos}].shake`]: false
      });
    }, 450);
  },

  finishAll() {
    this.flowDone = true; // 正常完成：返回后由首页 onShow 自动衔接下一步
    // 通知首页：本步骤真正完成（中途退出则不会置位，返回后重新进入本步骤）
    const sess = getApp().globalData.session;
    if (sess) {
      if (this.mode === "review") sess.reviewDone = true;
      else if (this.mode === "hard") sess.hardDone = true;
      else sess.practiceDone = true;
    }
    this.setData({ finished: true, answerCard: null });
    setTimeout(() => this.backSafe(), 1200);
  },

  // 安全返回：有上一页就返回；无上一页（如审核直达本页）则回首页
  backSafe() {
    wx.navigateBack({
      fail: () => wx.switchTab({ url: "/pages/index/index" })
    });
  },

  // 中途退出（点导航栏返回/物理返回）：结束本次流程会话，
  // 否则返回首页后 onShow 的 inFlow 检查会立刻 nextStep 把人推回本页，返回键形同虚设
  onUnload() {
    if (this.acTimer) clearTimeout(this.acTimer);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    if (!this.flowDone) {
      const sess = getApp().globalData.session;
      if (sess) sess.inFlow = false;
    }
  }
});
