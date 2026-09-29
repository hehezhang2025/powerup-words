/* 发音工具：有道语音接口（type=1 英音，与 Power Up 剑桥教材口音一致）
 * 前置：真机/发布需在 mp 后台配置 downloadFile 合法域名 https://dict.youdao.com
 * 三层保障：
 *   1. 预下载 preload(ens)：进入今日任务时把当天少量词（≤15个）的音频提前下载到本地临时文件
 *   2. 播放时优先用本地缓存，秒出不依赖网络
 *   3. 未缓存时走在线播放，失败静默重试最多 2 次
 */
let ctx = null;
const cache = {}; // en -> 本地临时文件路径
const retryCount = {}; // en -> 已重试次数
const MAX_RETRY = 2;

function getCtx() {
  if (!ctx) {
    ctx = wx.createInnerAudioContext();
    ctx.obeyMuteSwitch = false; // iOS 静音键下也播放（学习场景需要）
    ctx.onError(() => {
      const en = ctx._word;
      if (!en) return;
      const n = retryCount[en] || 0;
      if (n < MAX_RETRY) {
        retryCount[en] = n + 1;
        setTimeout(() => playOnline(en), 400 * (n + 1)); // 退避重试
      }
    });
  }
  return ctx;
}

function url(en) {
  return "https://dict.youdao.com/dictvoice?audio=" + encodeURIComponent(en) + "&type=1";
}

function playOnline(en) {
  try {
    const c = getCtx();
    c.stop();
    c._word = en;
    c.src = url(en);
    c.play();
  } catch (e) {}
}

/* 预下载一批单词的发音到本地（异步、静默失败，不阻塞界面） */
function preload(ens) {
  if (!ens || !ens.length) return;
  ens.forEach((en) => {
    if (cache[en]) return;
    wx.downloadFile({
      url: url(en),
      success(res) {
        if (res.statusCode === 200 && res.tempFilePath) cache[en] = res.tempFilePath;
      },
      fail() {} // 静默失败，播放时走在线 + 重试兜底
    });
  });
}

function speak(en) {
  if (!en) return;
  retryCount[en] = 0; // 新一次点播重置重试计数
  try {
    const c = getCtx();
    c.stop();
    c._word = cache[en] ? "" : en; // 本地文件不会触发网络错误，无需重试
    c.src = cache[en] || url(en);
    c.play();
  } catch (e) {}
}

module.exports = { speak, preload };
