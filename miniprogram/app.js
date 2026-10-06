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
      local = logic.migrateState(local); // 旧版本备份（无 bankId）升级
    }
    // 词库已被移除时（如旧版合并库），回退到默认库
    if (!bank.BANK_MAP[local.bankId] || !bank.BANK_MAP[local.bankId].available) {
      logic.switchBank(local, bank.DEFAULT_BANK, logic.todayStr());
    }
    this.globalData.state = local;
  },

  // 统一保存入口：内存 + 本地缓存
  saveState() {
    storage.saveLocal(this.globalData.state);
  },

  // 用外部状态整体替换（导入备份用；调用方需先校验）
  replaceState(state) {
    this.globalData.state = logic.migrateState(state);
    this.saveState();
  },

  // 重置：只清空当前词库的进度，其他词库不受影响
  resetState() {
    const s = this.globalData.state;
    const fresh = logic.createBankProgress(logic.todayStr());
    s.plan = fresh.plan;
    s.words = fresh.words;
    s.extras = fresh.extras;
    s.extraBase = fresh.extraBase;
    s.stats = fresh.stats;
    if (s.banks) delete s.banks[s.bankId];
    this.saveState();
  },

  // 切换词库：各库进度独立保存，切回来还在
  switchBank(bankId) {
    const b = bank.BANK_MAP[bankId];
    if (!b || !b.available) return false;
    logic.switchBank(this.globalData.state, bankId, logic.todayStr());
    this.saveState();
    return true;
  }
});
