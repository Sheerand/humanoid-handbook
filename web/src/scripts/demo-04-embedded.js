/* 04 章 · 演示 4.1：抖动如何变成截止期丢失
   契约：IIFE、只取 [data-demo="jitter"] 根节点、原生 Canvas、无全局、无依赖。 */
(function () {
  'use strict';

  function start() {
    var root = document.querySelector('[data-demo="jitter"]');
    if (!root) return;

    var cv = root.querySelector('#ch04-jitter-cv');
    var hv = root.querySelector('#ch04-jitter-hist');
    var sigEl = root.querySelector('#ch04-sigma');
    var costEl = root.querySelector('#ch04-cost');
    var sigOut = root.querySelector('#ch04-sigma-out');
    var costOut = root.querySelector('#ch04-cost-out');
    var presets = root.querySelectorAll('.ch04-preset');
    if (!cv || !hv || !sigEl || !costEl || !cv.getContext || !hv.getContext) return;

    /* ---- 颜色：从设计令牌读，读不到用等价回退 ---- */
    var rootStyle = window.getComputedStyle(document.documentElement);
    function token(name, fallback) {
      var v = rootStyle.getPropertyValue(name);
      v = v ? v.replace(/^\s+|\s+$/g, '') : '';
      return v || fallback;
    }
    var C = {
      d1: token('--d1', '#0E5A52'),
      d2: token('--d2', '#B0652C'),
      sig: token('--signal', '#C6472C'),
      sigInk: token('--signal-ink', '#A23A22'),
      line: token('--line', '#DBD6CA'),
      ink: token('--ink-2', '#3A4048'),
      muted: token('--muted-ink', '#5C626B'),
      paper: token('--surface', '#FFFFFF')
    };

    var FONT = '11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    var FONT_SM = '10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

    /* ---- 模型参数 ---- */
    var T = 1000;      // 标称周期，µs
    var N = 40;        // 可见窗口内的周期数
    var RING = 1000;   // 统计窗口
    var DISP = 1400;   // 纵轴上限，µs

    var sigma = 60;
    var cost = 660;
    var prevJ = 0;
    var rows = [];
    var ring = [];

    function gauss() {
      var u = 0;
      var v = 0;
      while (u === 0) u = Math.random();
      while (v === 0) v = Math.random();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }

    /* 一个周期：j 为本拍释放抖动，p 为(start-to-start)周期长度，miss 为越过截止线 */
    function sample() {
      var j = 0;
      if (sigma > 0) {
        j = gauss() * sigma;
        var lim = 3.2 * sigma;
        if (j > lim) j = lim;
        else if (j < -lim) j = -lim;
      }
      var p = T + j - prevJ;
      if (p < 200) p = 200;
      else if (p > 3000) p = 3000;
      var miss = (j + cost) > T;
      prevJ = j;
      return { j: j, p: p, miss: miss };
    }

    function reset() {
      rows.length = 0;
      ring.length = 0;
      prevJ = 0;
      for (var i = 0; i < RING; i++) {
        var s = sample();
        ring.push(s);
        if (i >= RING - N) rows.push(s);
      }
    }

    function stats() {
      var n = ring.length;
      var sum = 0;
      var hits = 0;
      var dev = new Array(n);
      var i;
      for (i = 0; i < n; i++) {
        sum += ring[i].p;
        dev[i] = Math.abs(ring[i].p - T);
        if (ring[i].miss) hits++;
      }
      dev.sort(function (a, b) { return a - b; });
      var idx = n ? Math.min(n - 1, Math.max(0, Math.floor(0.99 * n))) : 0;
      return {
        mean: n ? sum / n / 1000 : 1,
        p99: n ? dev[idx] : 0,
        rate: n ? (hits / n) * 100 : 0
      };
    }

    function out(key, text) {
      var nodes = root.querySelectorAll('[data-readout="' + key + '"]');
      for (var i = 0; i < nodes.length; i++) nodes[i].textContent = text;
    }

    function refresh() {
      var st = stats();
      out('mean', st.mean.toFixed(3));
      out('p99', String(Math.round(st.p99)));
      out('rate', st.rate.toFixed(1));
      out('per', String(Math.round(st.rate * 10)));
    }

    /* ---- 画布：按 devicePixelRatio 缩放 ---- */
    function fit(c) {
      var rect = c.getBoundingClientRect();
      if (!rect || rect.width < 40 || rect.height < 20) return null;
      var w = Math.round(rect.width);
      var h = Math.round(rect.height);
      var dpr = Math.min(window.devicePixelRatio || 1, 3);
      var bw = Math.round(w * dpr);
      var bh = Math.round(h * dpr);
      if (c.width !== bw) c.width = bw;
      if (c.height !== bh) c.height = bh;
      var ctx = c.getContext('2d');
      if (!ctx) return null;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { ctx: ctx, w: w, h: h };
    }

    /* ---- 主图：40 个周期，每列一个 1 ms 窗口 ---- */
    function drawTimeline() {
      var f = fit(cv);
      if (!f) return;
      var ctx = f.ctx;
      var W = f.w;
      var H = f.h;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = C.paper;
      ctx.fillRect(0, 0, W, H);

      var L = 44;
      var R = 12;
      var TOP = 26;
      var BOT = 20;
      var pw = W - L - R;
      var ph = H - TOP - BOT;
      if (pw < 60 || ph < 60) return;

      function y(us) { return TOP + (us / DISP) * ph; }

      var dl = y(T);

      /* 截止线以下：超时区着淡红 */
      ctx.save();
      ctx.globalAlpha = 0.07;
      ctx.fillStyle = C.sig;
      ctx.fillRect(L, dl, pw, TOP + ph - dl);
      ctx.restore();

      /* 横向网格 */
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var g = 0; g <= DISP; g += 200) {
        if (g === T) continue;
        var gy = Math.round(y(g)) + 0.5;
        ctx.moveTo(L, gy);
        ctx.lineTo(L + pw, gy);
      }
      ctx.stroke();

      /* 纵轴刻度 */
      ctx.font = FONT;
      ctx.fillStyle = C.muted;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText('0', L - 6, y(0));
      ctx.fillText('500', L - 6, y(500));
      ctx.fillText('1000', L - 6, y(T));
      ctx.fillText('1400', L - 6, y(DISP));
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('µs', 4, TOP + 2);

      /* 每列的竖条 */
      var colW = pw / N;
      var missCount = 0;
      var i;
      for (i = 0; i < rows.length; i++) {
        var s = rows[i];
        if (s.miss) missCount++;
        var x = L + i * colW + Math.max(0.5, colW * 0.12);
        var w = Math.max(1.5, colW * 0.76);
        var a = s.j > 0 ? s.j : 0;
        var b = s.j + cost;
        if (b > DISP) b = DISP;
        if (b <= a) continue;
        var y0 = y(a);
        var y1 = y(b);
        ctx.fillStyle = s.miss ? C.sig : C.d1;
        ctx.globalAlpha = s.miss ? 0.9 : 0.72;
        ctx.fillRect(x, y0, w, Math.max(1, y1 - y0));
        ctx.globalAlpha = 1;
        if (s.miss) {
          ctx.fillStyle = C.sig;
          ctx.fillRect(x, dl - 2, w, 3);
        }
      }

      /* 截止线 */
      ctx.strokeStyle = C.sig;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(L, Math.round(dl) + 0.5);
      ctx.lineTo(L + pw, Math.round(dl) + 0.5);
      ctx.stroke();
      ctx.setLineDash([]);

      /* 顶部说明 */
      ctx.font = FONT;
      ctx.fillStyle = C.sigInk;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('1000 µs 截止 · 窗口 miss ' + missCount + ' / 40', L + pw, TOP - 6);

      /* 横轴刻度 */
      ctx.fillStyle = C.muted;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      var ticks = [0, 9, 19, 29];
      for (i = 0; i < ticks.length; i++) {
        ctx.fillText(String(ticks[i] + 1), L + (ticks[i] + 0.5) * colW, TOP + ph + 5);
      }
      ctx.textAlign = 'right';
      ctx.fillText('40 ms', L + pw, TOP + ph + 5);
    }

    /* ---- 下图：周期长度直方图 ---- */
    function drawHist() {
      var f = fit(hv);
      if (!f) return;
      var ctx = f.ctx;
      var W = f.w;
      var H = f.h;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = C.paper;
      ctx.fillRect(0, 0, W, H);

      var n = ring.length;
      if (!n) return;

      var lo = Infinity;
      var hi = -Infinity;
      var i;
      for (i = 0; i < n; i++) {
        var pv = ring[i].p;
        if (pv < lo) lo = pv;
        if (pv > hi) hi = pv;
      }
      if (hi - lo < 6) {
        lo = T - 8;
        hi = T + 8;
      }

      var BINS = 25;
      var step = (hi - lo) / BINS;
      var counts = new Array(BINS);
      for (i = 0; i < BINS; i++) counts[i] = 0;
      for (i = 0; i < n; i++) {
        var k = Math.floor((ring[i].p - lo) / step);
        if (k < 0) k = 0;
        else if (k >= BINS) k = BINS - 1;
        counts[k]++;
      }
      var mx = 1;
      for (i = 0; i < BINS; i++) if (counts[i] > mx) mx = counts[i];

      var L = 26;
      var R = 6;
      var TOP = 4;
      var BOT = 15;
      var pw = W - L - R;
      var ph = H - TOP - BOT;
      if (pw < 40 || ph < 16) return;
      var bw = pw / BINS;

      ctx.fillStyle = C.d1;
      ctx.globalAlpha = 0.55;
      for (i = 0; i < BINS; i++) {
        if (!counts[i]) continue;
        var hh = Math.max(1, (counts[i] / mx) * ph);
        ctx.fillRect(L + i * bw + 0.5, TOP + ph - hh, Math.max(1, bw - 1.2), hh);
      }
      ctx.globalAlpha = 1;

      if (T >= lo && T <= hi) {
        var tx = L + ((T - lo) / (hi - lo)) * pw;
        ctx.strokeStyle = C.d2;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(Math.round(tx) + 0.5, TOP);
        ctx.lineTo(Math.round(tx) + 0.5, TOP + ph);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.font = FONT_SM;
      ctx.fillStyle = C.muted;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('n=' + n, 2, TOP + 1);
      ctx.fillText(lo.toFixed(0), L, TOP + ph + 3);
      ctx.textAlign = 'right';
      ctx.fillText(hi.toFixed(0) + ' µs', W - R, TOP + ph + 3);
      if (T >= lo && T <= hi) {
        ctx.textAlign = 'center';
        ctx.fillStyle = C.muted;
        ctx.fillText('1000', L + ((T - lo) / (hi - lo)) * pw, TOP + ph + 3);
      }
    }

    function draw() {
      drawTimeline();
      drawHist();
    }

    /* ---- 控件 ---- */
    function syncLabels() {
      if (sigOut) sigOut.textContent = sigma + ' µs';
      if (costOut) costOut.textContent = cost + ' µs';
    }

    function readInputs() {
      var s = Number(sigEl.value);
      var c = Number(costEl.value);
      sigma = isFinite(s) ? s : 0;
      cost = isFinite(c) ? c : 660;
      syncLabels();
    }

    function clearPressed() {
      for (var i = 0; i < presets.length; i++) presets[i].setAttribute('aria-pressed', 'false');
    }

    function onInput() {
      readInputs();
      clearPressed();
      reset();
      draw();
      refresh();
    }

    sigEl.addEventListener('input', onInput);
    costEl.addEventListener('input', onInput);

    var PRESET = {
      gpos: { s: 300, c: 880 },
      rt: { s: 60, c: 880 }
    };

    function applyPreset(name) {
      var p = PRESET[name];
      if (!p) return;
      sigEl.value = String(p.s);
      costEl.value = String(p.c);
      readInputs();
      reset();
      draw();
      refresh();
      for (var i = 0; i < presets.length; i++) {
        var on = presets[i].getAttribute('data-preset') === name;
        presets[i].setAttribute('aria-pressed', on ? 'true' : 'false');
      }
    }

    for (var pi = 0; pi < presets.length; pi++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          applyPreset(btn.getAttribute('data-preset'));
        });
      })(presets[pi]);
    }

    /* ---- 滚动（尊重 prefers-reduced-motion） ---- */
    var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    var timer = 0;

    function reduced() {
      return !!(mq && mq.matches);
    }

    function step() {
      for (var k = 0; k < 2; k++) {
        var s = sample();
        ring.push(s);
        if (ring.length > RING) ring.shift();
        rows.push(s);
        if (rows.length > N) rows.shift();
      }
      draw();
      refresh();
    }

    function play() {
      if (timer || reduced()) return;
      timer = window.setInterval(step, 160);
    }

    function pause() {
      if (!timer) return;
      window.clearInterval(timer);
      timer = 0;
    }

    if (mq) {
      var onMotion = function () {
        if (reduced()) pause();
        else play();
        draw();
      };
      if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onMotion);
      else if (typeof mq.addListener === 'function') mq.addListener(onMotion);
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) pause();
      else play();
    });

    var raf = window.requestAnimationFrame || function (cb) { return window.setTimeout(cb, 16); };
    var queued = 0;
    window.addEventListener('resize', function () {
      if (queued) return;
      queued = raf(function () {
        queued = 0;
        draw();
      });
    });

    /* ---- 启动 ---- */
    readInputs();
    reset();
    draw();
    refresh();
    play();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
