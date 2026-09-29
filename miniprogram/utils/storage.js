/* 存储封装：云数据库（跟微信账号） + 本地缓存（秒开/离线）
 * 集合：words_progress，每用户一条 doc（权限设"仅创建者可读写"，自动按 openid 隔离）
 */

const DB_NAME = "words_progress";
const LOCAL_KEY = "powerup_state_v2";
// ⚠️ 部署时替换：微信开发者工具 → 云开发控制台 → 环境 ID
const CLOUD_ENV = "cloud1-d9gizmz77e41d8cf7";

let cloudInited = false;
let cloudAvailable = true;
let docId = null; // 当前用户在云端 doc 的 _id

function initCloud() {
  try {
    if (!cloudInited && wx.cloud) {
      // traceUser: false —— 最小化收集：不在云开发控制台记录访问用户名单（不影响进度同步）
      // 若以后想在云开发后台看用户数/留存，再改回 true
      wx.cloud.init({ env: CLOUD_ENV, traceUser: false });
      cloudInited = true;
    }
  } catch (e) {
    cloudAvailable = false;
  }
}

/* ---------- 本地缓存 ---------- */
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

/* ---------- 云端 ---------- */
function db() {
  return wx.cloud.database();
}

// 读取当前用户的云端进度；没有则返回 null
function loadCloud() {
  return new Promise((resolve, reject) => {
    if (!cloudAvailable || !wx.cloud) return reject(new Error("cloud unavailable"));
    db().collection(DB_NAME).limit(1).get()
      .then((res) => {
        if (res.data && res.data.length) {
          docId = res.data[0]._id;
          resolve(res.data[0].state || null);
        } else {
          resolve(null);
        }
      })
      .catch(reject);
  });
}

// 保存到云端（upsert：有 doc 更新，没有则新建，openid 自动注入）
function saveCloud(state) {
  return new Promise((resolve, reject) => {
    if (!cloudAvailable || !wx.cloud) return reject(new Error("cloud unavailable"));
    const col = db().collection(DB_NAME);
    if (docId) {
      col.doc(docId).update({ data: { state: state } })
        .then(resolve)
        .catch((err) => {
          // doc 可能不存在（如被删），降级为新增
          col.add({ data: { state: state } })
            .then((res) => { docId = res._id; resolve(res); })
            .catch(reject);
        });
    } else {
      col.add({ data: { state: state } })
        .then((res) => { docId = res._id; resolve(res); })
        .catch(reject);
    }
  });
}

module.exports = { initCloud, loadLocal, saveLocal, loadCloud, saveCloud };
