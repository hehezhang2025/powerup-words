/* 存储封装：纯本地存储（无云、无账号、不联网）
 *
 * 变更说明：云开发同步已移除。原因：云开发免费环境有有效期，到期停服销毁、
 * 数据不可恢复；且小程序发布上线后免费环境会在「上线第 15 天」到期，续期无效。
 * 本小程序是孩子固定一台设备自用，跨设备同步非必需，故改为纯本地 + 手动备份。
 *
 * 进度存在本机微信缓存（wx.setStorageSync），容量上限 10MB，本进度数据仅几十 KB。
 * 换设备 / 微信清缓存前，请用「设置 → 进度备份」导出保存。
 */

const LOCAL_KEY = "powerup_state_v2";

function loadLocal() {
  try {
    return wx.getStorageSync(LOCAL_KEY) || null;
  } catch (e) {
    return null;
  }
}

function saveLocal(state) {
  try {
    wx.setStorageSync(LOCAL_KEY, state);
  } catch (e) {}
}

module.exports = { loadLocal, saveLocal };
