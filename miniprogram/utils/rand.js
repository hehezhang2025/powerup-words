/* 可复现随机：同一颗种子永远得到同一串数/同一个顺序
 * 用途：① 单元内打乱（每天一个种子，同一天进去顺序稳定，隔天会换）
 *      ② 毕业前抽查（同一天抽到的词固定，退出重进还是那一批）
 */
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRandom(seed) {
  let a = hashStr(String(seed));
  return function () {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher-Yates，不改变原数组
function shuffle(arr, seed) {
  const a = arr.slice();
  const rnd = seededRandom(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

module.exports = { hashStr, seededRandom, shuffle };
