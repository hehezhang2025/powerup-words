const storage = require("./utils/storage.js");
const logic = require("./utils/logic.js");

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
    }
    this.globalData.state = local;
  },

  // 统一保存入口：内存 + 本地缓存
  saveState() {
    storage.saveLocal(this.globalData.state);
  },

  // 用外部状态整体替换（导入备份用；调用方需先校验）
  replaceState(state) {
    this.globalData.state = state;
    this.saveState();
  },

  // 重置：清空进度从头开始
  resetState() {
    this.globalData.state = logic.createInitialState(logic.todayStr());
    this.saveState();
  }
});
