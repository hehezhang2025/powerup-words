const storage = require("./utils/storage.js");
const logic = require("./utils/logic.js");
const bank = require("./utils/bank.js");

App({
  globalData: {
    state: null // 当前学习状态（内存副本，本地缓存为准）
  },

  onLaunch() {
    // 纯本地：读取本机缓存，没有则从今天开始
    let local = storage.loadLocal();
    if (!local || !logic.isValidState(local)) {
      local = logic.createInitialState(logic.todayStr());
      storage.saveLocal(local);
    } else {
      local = logic.migrateState(local); // 旧版本备份（单选 bankId）升级为多选 bankIds
    }
    // 过滤掉已下线/整理中的词库，全没了就回默认库
    local.bankIds = local.bankIds.filter((id) => bank.BANK_MAP[id] && bank.BANK_MAP[id].available);
    if (!local.bankIds.length) local.bankIds = [bank.DEFAULT_BANK];
    this.globalData.state = local;
    this.applySettings();
  },

  // 把设置同步给依赖它的模块（如词表排布：单元内是否打乱）
  applySettings() {
    const s = this.globalData.state;
    bank.configure({ shuffleInUnit: !!(s && s.settings && s.settings.shuffleInUnit) });
  },

  // 统一保存入口：内存 + 本地缓存
  saveState() {
    storage.saveLocal(this.globalData.state);
  },

  // 用外部状态整体替换（导入备份用；调用方需先校验）
  replaceState(state) {
    this.globalData.state = logic.migrateState(state);
    this.applySettings();
    this.saveState();
  },

  // 重置：清空全部学习进度（各词库共享一个进度池，重置后都从头开始）
  resetState() {
    const s = this.globalData.state;
    const fresh = logic.createBankProgress(logic.todayStr());
    s.plan = fresh.plan;
    s.words = fresh.words;
    s.extras = fresh.extras;
    s.extraBase = fresh.extraBase;
    s.stats = fresh.stats;
    this.saveState();
  },

  // 勾选 / 取消一套词库（可多选）：取消不丢进度，重新勾回来接着背
  toggleBank(bankId) {
    const b = bank.BANK_MAP[bankId];
    if (!b || !b.available) return false;
    const changed = logic.toggleBank(this.globalData.state, bankId);
    if (changed) {
      this.saveState();
      this.globalData.session = null; // 词表变了，进行中的流程作废
    }
    return changed;
  }
});
