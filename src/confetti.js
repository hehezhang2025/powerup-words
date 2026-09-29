/* 轻量撒花动画（纯 canvas，离线可用，无需 CDN） */
(function (root) {
  "use strict";
  var COLORS = ["#EF9F27", "#1D9E75", "#378ADD", "#E24B4A", "#D4537E", "#7F77DD", "#97C459"];

  function burst(opts) {
    opts = opts || {};
    var count = opts.count || 90;
    var originX = opts.x != null ? opts.x : window.innerWidth / 2;
    var originY = opts.y != null ? opts.y : window.innerHeight / 3;

    var canvas = document.createElement("canvas");
    canvas.style.cssText =
      "position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:9999;";
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    var ctx = canvas.getContext("2d");

    var parts = [];
    for (var i = 0; i < count; i++) {
      var angle = Math.random() * Math.PI * 2;
      var speed = 4 + Math.random() * 9;
      parts.push({
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 4,
        size: 6 + Math.random() * 8,
        color: COLORS[(Math.random() * COLORS.length) | 0],
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.4,
        life: 0,
        maxLife: 60 + Math.random() * 40
      });
    }

    var raf;
    function frame() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      var alive = false;
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        if (p.life > p.maxLife) continue;
        alive = true;
        p.life++;
        p.vy += 0.28;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        var alpha = 1 - p.life / p.maxLife;
        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
      if (alive) {
        raf = requestAnimationFrame(frame);
      } else {
        cancelAnimationFrame(raf);
        canvas.remove();
      }
    }
    frame();
  }

  root.Confetti = { burst: burst };
})(typeof window !== "undefined" ? window : this);
