const storage = require("./utils/storage.js");
const logic = require("./utils/logic.js");

App({
  globalData: {
    state: null,      // 当前学习状态（内存副本）
    cloudReady: false // 云端数据是否已加载/合并完成
  },

  onLaunch() {
    // 1. 初始化云开发（部署时把占位符换成你的环境 ID）
    storage.initCloud();

    // 2. 先用本地缓存秒开，再异步拉云端合并
    const today = logic.todayStr();
    let local = storage.loadLocal();
    if (!local || !logic.isValidState(local)) {
      local = logic.createInitialState(today);
    }
    this.globalData.state = local;

    // 3. 异步拉云端：云端版本更新则覆盖本地（跨设备同步）
    storage.loadCloud()
      .then((cloud) => {
        if (cloud && logic.isValidState(cloud)) {
          // 简单合并：以内容更多/更新的一方为准（按已学词数+打卡天数判断）
          const localScore = Object.keys(local.words).length + local.stats.days.length;
          const cloudScore = Object.keys(cloud.words).length + cloud.stats.days.length;
          if (cloudScore >= localScore) {
            this.globalData.state = cloud;
            storage.saveLocal(cloud);
          }
        }
        this.globalData.cloudReady = true;
        // 通知可能已打开的页面刷新
        if (this.cloudReadyCallback) this.cloudReadyCallback();
      })
      .catch(() => {
        // 离线/未开通云开发：仅本地模式，照常可用
        this.globalData.cloudReady = true;
        if (this.cloudReadyCallback) this.cloudReadyCallback();
      });
  },

  // 统一保存入口：内存 + 本地缓存 + 云端（云端失败不阻塞使用）
  saveState() {
    const s = this.globalData.state;
    storage.saveLocal(s);
    storage.saveCloud(s).catch(() => {});
  },

  // 重置：清空进度从头开始
  resetState() {
    this.globalData.state = logic.createInitialState(logic.todayStr());
    this.saveState();
  }
});
