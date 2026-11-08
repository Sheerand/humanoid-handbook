/* 03 章演示 · 电流矢量：FOC 与六步换相 ---------------------------------------
   契约见 web/DESIGN.md §6.10。IIFE，无依赖，不写 window，不产生 console 输出。
   ia = Im·cos θe，ib = Im·cos(θe−120°)，ic = Im·cos(θe+120°)
   合成矢量 = 三相直接相加，幅值 1.5·Im、方向 θe（不乘 2/3，见正文说明）
   六步：矢量只能停在 6 个方向，相对 q 轴误差 ±30°，转矩以 6 倍电频率脉动。 */
(function () {
  'use strict';

  var root = document.querySelector('[data-demo="foc"]');
  if (!root) return;

  var phasor = root.querySelector('canvas[data-part="phasor"]');
  var wave = root.querySelector('canvas[data-part="wave"]');
  if (!phasor || !wave) return;

  var speedIn = root.querySelector('input[data-control="speed"]');
  var loadIn = root.querySelector('input[data-control="load"]');
  var sixBtn = root.querySelector('button[data-control="six"]');
  var focBtn = root.querySelector('button[data-control="foc"]');
  var stepBtn = root.querySelector('button[data-control="step"]');
  var speedOut = root.querySelector('[data-out="speed"]');
  var loadOut = root.querySelector('[data-out="load"]');

  var TAU = Math.PI * 2;
  var D2R = Math.PI / 180;
  var KT = 0.11;                 /* N·m/A，电机 q 轴力矩常数 */
  var IMAX = 130;                /* A，绘图满量程 */
  var SIX = [[1, -1, 0], [1, 0, -1], [0, 1, -1], [-1, 1, 0], [-1, 0, 1], [0, -1, 1]];
  var FONT = '12.5px system-ui, -apple-system, "Segoe UI", "Noto Sans CJK SC", sans-serif';
  var MONO = '12px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';

  function readVar(name, fallback) {
    try {
      var v = window.getComputedStyle(document.documentElement).getPropertyValue(name);
      v = v ? v.replace(/^\s+|\s+$/g, '') : '';
      return v || fallback;
    } catch (err) { return fallback; }
  }

  var C = {
    d1: readVar('--d1', '#0E5A52'),
    d2: readVar('--d2', '#B0652C'),
    d3: readVar('--d3', '#41637F'),
    d4: readVar('--d4', '#6B4A63'),
    ink: readVar('--ink', '#14161A'),
    ink2: readVar('--ink-2', '#3A4048'),
    muted: readVar('--muted-ink', '#5C626B'),
    line: readVar('--line', '#DBD6CA'),
    line2: readVar('--line-2', '#C3BDAF')
  };

  var theta = 0.6;               /* rad，电角度 θe */
  var omega = 162 * D2R;         /* rad/s，电角速度 */
  var load = 12;                 /* N·m，电机轴负载 */
  var mode = 'foc';
  var raf = 0, last = 0, onScreen = true;

  var motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reduced() { return !!(motion && motion.matches); }

  /* ---------------- 电气量 ---------------- */

  function phaseCurrents(ang) {
    var im = load / (1.5 * KT);                    /* 相电流幅值 */
    if (mode === 'foc') {
      return [im * Math.cos(ang),
              im * Math.cos(ang - TAU / 3),
              im * Math.cos(ang + TAU / 3)];
    }
    var k = Math.round((ang / D2R + 30) / 60);     /* 最近的基本矢量扇区 */
    k = ((k % 6) + 6) % 6;
    var im6 = im * 1.5 / Math.sqrt(3);             /* 峰值 iq 与 FOC 对齐，便于比较脉动 */
    return [SIX[k][0] * im6, SIX[k][1] * im6, SIX[k][2] * im6];
  }

  function currents(ang) {
    var c = phaseCurrents(ang);
    var ia = c[0], ib = c[1], ic = c[2];
    var al = ia - 0.5 * (ib + ic);                 /* Σ i·cosφ，φ = 0/120/240 */
    var be = (ib - ic) * Math.sqrt(3) / 2;         /* Σ i·sinφ */
    var tr = ang - Math.PI / 2;                    /* 转子 d 轴：滞后电流矢量 90° */
    var ct = Math.cos(tr), st = Math.sin(tr);
    return {
      ia: ia, ib: ib, ic: ic,
      al: al, be: be,
      id: al * ct + be * st,
      iq: -al * st + be * ct,
      mag: Math.sqrt(al * al + be * be)
    };
  }

  /* ---------------- 画布 ---------------- */

  function fit(canvas) {
    var rect = canvas.getBoundingClientRect();
    var w = Math.round(rect.width), h = Math.round(rect.height);
    if (w < 40 || h < 40) return null;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx: ctx, w: w, h: h };
  }

  function arrowHead(ctx, x, y, ang, size, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-ang);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-size, size * 0.45);
    ctx.lineTo(-size, -size * 0.45);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  function drawPhasor() {
    var g = fit(phasor);
    if (!g) return;
    var ctx = g.ctx, w = g.w, h = g.h;
    var cx = w * 0.5, cy = 40 + (h - 40) / 2;
    var R = Math.min(w * 0.34, (h - 40) / 2 - 22);
    var cur = currents(theta);
    var s = (R * 0.94) / (1.5 * IMAX);

    /* 定子内圆 */
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.stroke();

    /* 三相轴 A/B/C */
    var names = ['A', 'B', 'C'];
    var cols = [C.d1, C.d3, C.d4];
    var vals = [cur.ia, cur.ib, cur.ic];
    for (var k = 0; k < 3; k += 1) {
      var a = k * TAU / 3;
      var ex = cx + R * Math.cos(a), ey = cy - R * Math.sin(a);
      ctx.strokeStyle = C.line2;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.fillStyle = C.muted;
      ctx.font = FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(names[k], cx + (R + 15) * Math.cos(a), cy - (R + 15) * Math.sin(a));
      /* 每相瞬时电流：沿自身轴的有符号长度 */
      var L = vals[k] * s;
      if (Math.abs(L) > 1) {
        ctx.strokeStyle = cols[k];
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + L * Math.cos(a), cy - L * Math.sin(a));
        ctx.stroke();
      }
    }

    /* 转子：d 轴 + 磁钢 N/S */
    var dr = theta - Math.PI / 2;
    ctx.strokeStyle = C.line2;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.46, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = C.ink2;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - R * 0.40 * Math.cos(dr), cy + R * 0.40 * Math.sin(dr));
    ctx.lineTo(cx + R * 0.40 * Math.cos(dr), cy - R * 0.40 * Math.sin(dr));
    ctx.stroke();
    ctx.fillStyle = C.ink2;
    ctx.font = FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', cx + (R * 0.40 + 11) * Math.cos(dr), cy - (R * 0.40 + 11) * Math.sin(dr));
    ctx.fillText('S', cx - (R * 0.40 + 11) * Math.cos(dr), cy + (R * 0.40 + 11) * Math.sin(dr));
    ctx.strokeStyle = C.muted;
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + R * Math.cos(dr), cy - R * Math.sin(dr));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = C.muted;
    ctx.fillText('d', cx + (R + 15) * Math.cos(dr), cy - (R + 15) * Math.sin(dr));

    /* 合成矢量 */
    var vm = cur.mag * s;
    var vx = cx + vm * Math.cos(theta), vy = cy - vm * Math.sin(theta);
    ctx.strokeStyle = C.d2;
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(vx, vy);
    ctx.stroke();
    arrowHead(ctx, vx, vy, theta, 9, C.d2);
    ctx.beginPath();
    ctx.arc(cx, cy, 2.6, 0, TAU);
    ctx.fillStyle = C.d2;
    ctx.fill();

    /* 六步：标出与 q 轴的 ±30° 误差 */
    if (mode === 'six') {
      var vr = R * 0.72;
      var va = Math.atan2(-(vy - cy), vx - cx);
      var span = theta - va;
      while (span > Math.PI) span -= TAU;
      while (span < -Math.PI) span += TAU;
      ctx.strokeStyle = C.d2;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, vr, -theta, -va, span < 0);
      ctx.stroke();
      ctx.fillStyle = C.d2;
      ctx.font = MONO;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      var mid = theta - span / 2;
      ctx.fillText('±30°', cx + (vr + 16) * Math.cos(mid), cy - (vr + 16) * Math.sin(mid));
    }

    /* 顶部说明 */
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = FONT;
    ctx.fillStyle = C.ink2;
    ctx.fillText(mode === 'foc' ? 'FOC：矢量钉在 q 轴，随转子连续旋转'
      : '六步：矢量每 60° 跳一次', 10, 18);
    ctx.font = MONO;
    ctx.fillStyle = C.muted;
    ctx.fillText('|is| = 1.5·Im = ' + cur.mag.toFixed(0) + ' A', 10, 34);
  }

  function drawWave() {
    var g = fit(wave);
    if (!g) return;
    var ctx = g.ctx, w = g.w, h = g.h;
    var x0 = 40, x1 = w - 10, y0 = 12, y1 = h - 20;
    var mid = (y0 + y1) / 2, half = (y1 - y0) / 2;
    var span = 4 * Math.PI;                       /* 两个电周期 */

    ctx.strokeStyle = C.line;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x0, mid);
    ctx.lineTo(x1, mid);
    ctx.stroke();

    ctx.strokeStyle = C.line;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y0);
    ctx.moveTo(x0, y1);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = MONO;
    ctx.fillStyle = C.muted;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('+' + IMAX, x0 - 5, y0);
    ctx.fillText('0', x0 - 5, mid);
    ctx.fillText('−' + IMAX, x0 - 5, y1);

    var n = Math.max(2, Math.round(x1 - x0));
    var buf = new Array(n + 1);
    for (var xi = 0; xi <= n; xi += 1) {
      buf[xi] = phaseCurrents(theta - (1 - xi / n) * span);
    }
    function trace(idx, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (var i = 0; i <= n; i += 1) {
        var y = mid - (buf[i][idx] / IMAX) * half;
        if (i === 0) ctx.moveTo(x0 + i * (x1 - x0) / n, y);
        else ctx.lineTo(x0 + i * (x1 - x0) / n, y);
      }
      ctx.stroke();
    }
    trace(0, C.d1);
    trace(1, C.d3);

    ctx.textAlign = 'left';
    ctx.font = FONT;
    ctx.fillStyle = C.muted;
    ctx.fillText('−2 周期', x0, y1 + 11);
    ctx.textAlign = 'center';
    ctx.fillText('−1 周期', (x0 + x1) / 2, y1 + 11);
    ctx.textAlign = 'right';
    ctx.fillText('现在', x1, y1 + 11);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.d1;
    ctx.fillText('ia', x0 + 2, y0 - 1);
    ctx.fillStyle = C.d3;
    ctx.fillText('ib', x0 + 22, y0 - 1);
  }

  function num(v) {
    return (Math.abs(v) < 0.05 ? 0 : v).toFixed(1);
  }

  function setOut(node, text) {
    if (node && node.textContent !== text) node.textContent = text;
  }

  function render() {
    drawPhasor();
    drawWave();
    var c = currents(theta);
    setOut(root.querySelector('[data-readout="ialpha"]'), num(c.al));
    setOut(root.querySelector('[data-readout="ibeta"]'), num(c.be));
    setOut(root.querySelector('[data-readout="id"]'), num(c.id));
    setOut(root.querySelector('[data-readout="iq"]'), num(c.iq));
  }

  /* ---------------- 循环 ---------------- */

  function running() {
    return !reduced() && onScreen && omega > 1e-3;
  }

  function ensure() {
    if (running()) {
      if (!raf) { last = 0; raf = window.requestAnimationFrame(frame); }
    } else if (raf) {
      window.cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  function frame(ts) {
    raf = 0;
    if (!last) last = ts;
    var dt = (ts - last) / 1000;
    last = ts;
    if (dt > 0) {
      theta = (theta + omega * Math.min(dt, 0.05)) % TAU;
      render();
    }
    if (running()) raf = window.requestAnimationFrame(frame);
  }

  function setMode(next) {
    if (mode === next) return;
    mode = next;
    if (sixBtn) sixBtn.setAttribute('aria-pressed', String(next === 'six'));
    if (focBtn) focBtn.setAttribute('aria-pressed', String(next === 'foc'));
    render();
    ensure();
  }

  if (speedIn) {
    speedIn.addEventListener('input', function () {
      omega = Number(speedIn.value) * 3.6 * D2R;   /* 0–100 → 0–360 °/s */
      setOut(speedOut, (Number(speedIn.value) * 3.6).toFixed(0) + ' °/s');
      ensure();
      if (!running()) render();
    });
    omega = Number(speedIn.value) * 3.6 * D2R;
    setOut(speedOut, (Number(speedIn.value) * 3.6).toFixed(0) + ' °/s');
  }

  if (loadIn) {
    loadIn.addEventListener('input', function () {
      load = Number(loadIn.value);
      setOut(loadOut, load.toFixed(1) + ' N·m');
      if (!running()) render();
    });
    load = Number(loadIn.value);
    setOut(loadOut, load.toFixed(1) + ' N·m');
  }

  if (sixBtn) sixBtn.addEventListener('click', function () { setMode('six'); });
  if (focBtn) focBtn.addEventListener('click', function () { setMode('foc'); });
  if (stepBtn) {
    stepBtn.addEventListener('click', function () {
      theta = (theta + 15 * D2R) % TAU;
      render();
    });
  }

  window.addEventListener('resize', function () { render(); }, false);

  if (motion) {
    var onMotion = function () {
      root.classList.toggle('is-reduced', reduced());
      ensure();
      if (!running()) render();
    };
    onMotion();
    if (typeof motion.addEventListener === 'function') motion.addEventListener('change', onMotion);
    else if (typeof motion.addListener === 'function') motion.addListener(onMotion);
  }

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i += 1) onScreen = entries[i].isIntersecting;
      ensure();
    }, { threshold: 0.05 });
    io.observe(root);
  }

  if (sixBtn) sixBtn.setAttribute('aria-pressed', 'false');
  if (focBtn) focBtn.setAttribute('aria-pressed', 'true');
  render();
  ensure();
})();
