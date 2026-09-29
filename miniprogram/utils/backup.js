/* 进度备份：导出为文件分享到微信 / 粘贴文本导入
 * 设计原则：不联网、不上传、不调用任何隐私接口
 *   - 不读剪贴板（wx.getClipboardData 属隐私接口）
 *   - 不选聊天文件（wx.chooseMessageFile 属隐私接口，需在隐私保护指引声明"选中的文件"）
 *   - 导出走 wx.shareFileMessage（用户主动分享出去，非收集行为）；不支持时降级为文本复制
 * 备份内容是 JSON 文本（后缀 .txt 保证微信里能直接打开预览）
 */
const logic = require("./logic.js");

const ROOT = wx.env.USER_DATA_PATH;

// 备份文件里的全部内容：一个 JSON 字符串
function buildText(state) {
  return JSON.stringify(state);
}

function fileName() {
  return "卡卡记单词-进度-" + logic.todayStr() + ".txt";
}

// 把当前进度写入本地临时文件，返回 { path, name, size }
function writeBackupFile(state) {
  return new Promise((resolve, reject) => {
    const text = buildText(state);
    const name = fileName();
    const path = ROOT + "/" + name;
    wx.getFileSystemManager().writeFile({
      filePath: path,
      data: text,
      encoding: "utf8",
      success: () => resolve({ path: path, name: name, size: text.length }),
      fail: reject
    });
  });
}

// 分享到微信会话（发给「文件传输助手」/自己或家人即可长期保存）
// 用户中途取消会走 fail，调用方需按 errMsg 判断是否降级
function shareFile(path, name) {
  return new Promise((resolve, reject) => {
    if (!wx.shareFileMessage) {
      reject(new Error("shareFileMessage unsupported"));
      return;
    }
    wx.shareFileMessage({ filePath: path, fileName: name, success: resolve, fail: reject });
  });
}

function isCancel(err) {
  const m = (err && (err.errMsg || err.errno)) + "";
  return m.indexOf("cancel") >= 0 || m.indexOf("deny") >= 0;
}

// 解析导入文本，失败抛错（message 直接给用户看）
function parseText(text) {
  if (!text || !text.trim()) throw new Error("请先粘贴备份内容");
  let obj;
  try {
    obj = JSON.parse(text.trim());
  } catch (e) {
    throw new Error("内容不是有效的备份（JSON 解析失败）");
  }
  if (!logic.isValidState(obj)) throw new Error("内容不是本小程序的进度备份");
  return obj;
}

// 摘要：给用户确认覆盖前看一眼
function summary(state) {
  return {
    learned: Object.keys(state.words).length,
    days: state.stats.days.length,
    streak: state.stats.streak
  };
}

module.exports = { buildText, fileName, writeBackupFile, shareFile, isCancel, parseText, summary };
