// 将 index.html + src/* 打包为单文件离线版 dist/powerup单词冒险.html
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

let html = read("index.html");
html = html.replace(
  /<link rel="stylesheet" href="src\/styles.css" \/>/,
  "<style>\n" + read("src/styles.css") + "\n</style>"
);
for (const f of ["words", "logic", "confetti", "app"]) {
  html = html.replace(
    new RegExp('<script src="src/' + f + '\\.js"></script>'),
    "<script>\n" + read("src/" + f + ".js") + "\n</script>"
  );
}
if (/src\//.test(html)) {
  console.error("❌ 仍有未内联的 src 引用");
  process.exit(1);
}
fs.mkdirSync(path.join(root, "dist"), { recursive: true });
const out = path.join(root, "dist", "powerup单词冒险.html");
fs.writeFileSync(out, html);
console.log("✅ 打包完成:", out, (fs.statSync(out).size / 1024).toFixed(1) + " KB");
