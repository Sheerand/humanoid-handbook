/* 人形机器人全栈手册 · 第 08 章演示 ---------------------------------------------
   一维位置估计：纯 IMU 二次积分 / 腿里程计 / 互补滤波融合，三条曲线同图对比。
   纯原生 DOM + Canvas 2D，无依赖；IIFE，不挂 window，不产生全局变量。
   模型与读数说明见 web/src/sections/08-perception.html 的 .demo 区块。
   ----------------------------------------------------------------------------- */
(function () {
  'use strict';

  var root = document.querySelector('[data-demo="fusion"]');
  if (!root) return;
  var canvas = root.querySelector('canvas');
  if (!canvas || typeof canvas.getContext !== 'function') return;
  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var ui = {
    bias: root.querySelector('#demo81-bias'),
    biasOut: root.querySelector('#demo81-bias-out'),
    noise: root.querySelector('#demo81-noise'),
    noiseOut: root.querySelector('#demo81-noise-out'),
    scale: root.querySelector('#demo81-scale'),
    scaleOut: root.querySelector('#demo81-scale-out'),
    gain: root.querySelector('#demo81-gain'),
    gainOut: root.querySelector('#demo81-gain-out'),
    verdict: root.querySelector('[data-demo-verdict]')
  };
  if (!ui.bias || !ui.noise || !ui.scale || !ui.gain) return;

  /* ---- 设计令牌：Canvas 读不到 var()，启动时取一次 ------------------------- */
  var cssRoot = window.getComputedStyle ? getComputedStyle(document.documentElement) : null;
  function token(name, fallback) {
    if (!cssRoot) return fallback;
    var v = cssRoot.getPropertyValue(name);
    return v && v.trim() ? v.trim() : fallback;
  }
  var C = {
    ink: token('--ink', '#14161A'),
    muted: token('--muted-ink', '#5C626B'),
    line: token('--line', '#DBD6CA'),
    line2: token('--line-2', '#C3BDAF'),
    d1: token('--d1', '#0E5A52'),
    d2: token('--d2', '#B0652C'),
    d3: token('--d3', '#41637F'),
    d4: token('--d4', '#6B4A63'),
    paper: token('--paper', '#F7F5F0')
  };
  var MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

  /* ---- 模型常数 ------------------------------------------------------------ */
  var T_END = 10.0;      /* 仿真时长，s */
  var DT = 0.002;        /* 积分步长，s */
  var T_UPD = 0.02;      /* 里程计更新周期，s（50 Hz） */
  var JIT = 0.04;        /* 里程计每拍等效位置抖动，m */
  var SLIP = [           /* 两次足滑：[起始 s, 持续 s, 速度偏差 m/s] */
    [2.0, 0.06, 0.30],
    [5.2, 0.06, -0.35]
  ];

  function accelAt(t) {
    if (t >= 1.0 && t < 2.5) return 0.6;     /* 加速 */
    if (t >= 7.0 && t < 8.5) return -0.6;    /* 减速 */
    return 0;                                /* 匀速 / 静止 */
  }

  function slipVel(t) {
    var v = 0;
    for (var i = 0; i < SLIP.length; i += 1) {
      var s = SLIP[i];
      if (t >= s[0] && t < s[0] + s[1]) v += s[2];
    }
    return v;
  }

  /* ---- 确定性随机：同一组参数永远画出同一条曲线 --------------------------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function makeGauss(rnd) {
    return function () {
      var u = 0, v = 0;
      while (u === 0) u = rnd();
      while (v === 0) v = rnd();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };
  }

  var params = { bias: 0.008, noise: 0.05, scale: 0.015, gain: 0.15 };
  var data = null;
  var cssW = 880, cssH = 340;
  var reveal = 1;
  var rafId = 0;
  var rafT0 = 0;
  var frames = 0;

  /* ---- 仿真 ---------------------------------------------------------------- */
  function simulate(p) {
    var gauss = makeGauss(mulberry32(20260808));
    var alpha = 1 - Math.exp(-p.gain);   /* K = T/τ：K 大 → τ 小 → 更信里程计 */
    var t = 0;
    var pT = 0, vT = 0;                  /* 真值 */
    var pI = 0, vI = 0;                  /* 纯 IMU：加速度二次积分 */
    var pL = 0;                          /* 腿里程计：速度积分 */
    var pF = 0, eF = 0;                  /* 融合：pF = pI + 低通(里程计 − IMU) */
    var zL = 0;                          /* 里程计最近一次报告的位置 */
    var nextUpd = T_UPD;
    var nextSample = 0;
    var n = Math.round(T_END / DT);
    var out = { t: [], truth: [], imu: [], leg: [], fused: [] };

    for (var i = 0; i < n; i += 1) {
      var a = accelAt(t);
      var am = a + p.bias + p.noise * gauss();

      pT += vT * DT + 0.5 * a * DT * DT;
      vT += a * DT;

      pI += vI * DT + 0.5 * am * DT * DT;
      vI += am * DT;

      pL += (vT * (1 + p.scale) + slipVel(t)) * DT;

      t += DT;

      if (t >= nextUpd - 1e-9) {
        nextUpd += T_UPD;
        zL = pL + JIT * gauss();          /* 每拍的等效位置抖动 */
        eF += alpha * ((zL - pI) - eF);   /* 低通：只把低频差补进来 */
        pF = pI + eF;
      }

      if (t >= nextSample - 1e-9) {
        nextSample += 0.01;
        out.t.push(t);
        out.truth.push(pT);
        out.imu.push(pI);
        out.leg.push(zL);
        out.fused.push(pF);
      }
    }

    var si = 0, sl = 0, sf = 0, m = out.t.length, k, d;
    for (k = 0; k < m; k += 1) {
      d = out.imu[k] - out.truth[k]; si += d * d;
      d = out.leg[k] - out.truth[k]; sl += d * d;
      d = out.fused[k] - out.truth[k]; sf += d * d;
    }
    out.rmse = {
      imu: Math.sqrt(si / m) * 100,
      leg: Math.sqrt(sl / m) * 100,
      fused: Math.sqrt(sf / m) * 100
    };
    out.final = {
      imu: (out.imu[m - 1] - out.truth[m - 1]) * 100,
      leg: (out.leg[m - 1] - out.truth[m - 1]) * 100,
      fused: (out.fused[m - 1] - out.truth[m - 1]) * 100
    };
    return out;
  }

  /* ---- 尺寸与 DPR ---------------------------------------------------------- */
  function resize() {
    var rect = canvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    var w = Math.round(rect.width || cssW);
    var h = Math.round(rect.height || cssH);
    if (!w || w < 40) w = 640;
    if (!h || h < 120) h = 320;
    cssW = w; cssH = h;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function niceStep(range, target) {
    var raw = range / Math.max(1, target);
    var pow = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var n = raw / pow;
    var s = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return s * pow;
  }

  function fmtTick(v, step) {
    var dec = step < 0.1 ? 2 : step < 1 ? 1 : 0;
    return v.toFixed(dec);
  }

  /* ---- 绘图 ---------------------------------------------------------------- */
  function draw() {
    if (!data) return;
    var W = cssW, H = cssH;
    var padL = 52, padR = 16, padT = 28, padB = 36, gap = 30;
    var plotW = Math.max(60, W - padL - padR);
    var usable = Math.max(80, H - padT - padB - gap);
    var hA = usable * 0.62;
    var hB = usable - hA;
    var aTop = padT, aBot = padT + hA;
    var bTop = aBot + gap, bBot = bTop + hB;

    var nAll = data.t.length;
    var nShow = Math.max(2, Math.min(nAll, Math.floor(nAll * reveal)));

    var tMax = T_END;
    function X(t) { return padL + (t / tMax) * plotW; }

    /* 位置轴范围：四条曲线一起定，留 8% 余量 */
    var lo = Infinity, hi = -Infinity, i, v;
    for (i = 0; i < nShow; i += 1) {
      v = Math.min(data.truth[i], data.imu[i], data.leg[i], data.fused[i]);
      if (v < lo) lo = v;
      v = Math.max(data.truth[i], data.imu[i], data.leg[i], data.fused[i]);
      if (v > hi) hi = v;
    }
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    var span = Math.max(0.4, hi - lo);
    lo -= span * 0.08; hi += span * 0.08;
    span = hi - lo;
    function YA(p) { return aBot - ((p - lo) / span) * (aBot - aTop); }

    /* 误差轴：从 0 起 */
    var eMax = 0.1;
    for (i = 0; i < nShow; i += 1) {
      eMax = Math.max(eMax,
        Math.abs(data.imu[i] - data.truth[i]),
        Math.abs(data.leg[i] - data.truth[i]),
        Math.abs(data.fused[i] - data.truth[i]));
    }
    eMax = eMax * 1.12 * 100;   /* cm */
    function YB(e) { return bBot - (e / eMax) * (bBot - bTop); }

    ctx.clearRect(0, 0, W, H);

    /* --- 相位底纹：加速 / 减速 --- */
    var bands = [[1.0, 2.5, '加速'], [7.0, 8.5, '减速']];
    ctx.font = '10px ' + MONO;
    for (i = 0; i < bands.length; i += 1) {
      var x0 = X(bands[i][0]), x1 = X(bands[i][1]);
      ctx.fillStyle = C.line;
      ctx.globalAlpha = 0.28;
      ctx.fillRect(x0, aTop, x1 - x0, aBot - aTop);
      ctx.fillRect(x0, bTop, x1 - x0, bBot - bTop);
      ctx.globalAlpha = 1;
      ctx.fillStyle = C.muted;
      ctx.textAlign = 'center';
      ctx.fillText(bands[i][2], (x0 + x1) / 2, aTop + 11);
    }

    /* --- 位置面板 --- */
    var yStep = niceStep(span, 5);
    var yStart = Math.ceil(lo / yStep) * yStep;
    ctx.textAlign = 'right';
    ctx.font = '10px ' + MONO;
    for (v = yStart; v <= hi + 1e-9; v += yStep) {
      var yy = YA(v);
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(padL, yy);
      ctx.lineTo(padL + plotW, yy);
      ctx.stroke();
      ctx.fillStyle = C.muted;
      ctx.fillText(fmtTick(v, yStep), padL - 6, yy + 3.5);
    }

    /* 足滑竖线 */
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = C.d4;
    for (i = 0; i < SLIP.length; i += 1) {
      var xs = X(SLIP[i][0]);
      ctx.beginPath();
      ctx.moveTo(xs, aTop);
      ctx.lineTo(xs, bBot);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.strokeStyle = C.line2;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, aBot + 0.5);
    ctx.lineTo(padL + plotW, aBot + 0.5);
    ctx.moveTo(padL, bBot + 0.5);
    ctx.lineTo(padL + plotW, bBot + 0.5);
    ctx.stroke();

    /* 曲线 */
    function line(arr, yFn, color, width, dash) {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      if (dash) ctx.setLineDash(dash);
      for (var j = 0; j < nShow; j += 1) {
        var px = X(data.t[j]), py = yFn(arr[j]);
        if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      if (dash) ctx.setLineDash([]);
    }
    line(data.truth, YA, C.ink, 1.2, [5, 4]);
    line(data.imu, YA, C.d2, 1.5, null);
    line(data.leg, YA, C.d3, 1.0, null);
    line(data.fused, YA, C.d1, 2.0, null);

    /* 误差面板 */
    ctx.strokeStyle = C.line2;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, bTop);
    ctx.lineTo(padL, bBot + 0.5);
    ctx.stroke();
    var eStep = niceStep(eMax, 3);
    ctx.textAlign = 'right';
    ctx.font = '10px ' + MONO;
    for (v = 0; v <= eMax + 1e-9; v += eStep) {
      var ey = YB(v);
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(padL, ey);
      ctx.lineTo(padL + plotW, ey);
      ctx.stroke();
      ctx.fillStyle = C.muted;
      ctx.fillText(v.toFixed(0), padL - 6, ey + 3.5);
    }
    function errLine(arr, color, width) {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      for (var j = 0; j < nShow; j += 1) {
        var px = X(data.t[j]);
        var py = YB(Math.abs(arr[j] - data.truth[j]) * 100);
        if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    errLine(data.imu, C.d2, 1.3);
    errLine(data.leg, C.d3, 1.0);
    errLine(data.fused, C.d1, 1.8);

    /* 轴标题 */
    ctx.fillStyle = C.ink;
    ctx.font = '11px ' + MONO;
    ctx.textAlign = 'left';
    ctx.fillText('位置 / m', padL, aTop - 8);
    ctx.fillStyle = C.muted;
    ctx.fillText('误差 / cm', padL, bTop - 8);
    ctx.textAlign = 'right';
    ctx.fillText('时间 / s', padL + plotW, bBot + 31);

    /* 横轴刻度 */
    ctx.textAlign = 'center';
    ctx.font = '10px ' + MONO;
    var tStep = 2;
    for (v = 0; v <= tMax + 1e-9; v += tStep) {
      var tx = X(v);
      ctx.strokeStyle = C.line2;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tx, bBot + 1);
      ctx.lineTo(tx, bBot + 5);
      ctx.stroke();
      ctx.fillStyle = C.muted;
      ctx.fillText(v.toFixed(0), tx, bBot + 15);
    }

    /* 图例：右对齐；窄屏换短标签，避免压住轴标题或越界 */
    var narrow = plotW < 520;
    var items = [
      ['真值', C.ink, 1.2, true],
      [narrow ? 'IMU' : '纯 IMU', C.d2, 1.5, false],
      [narrow ? '里程' : '里程计', C.d3, 1.0, false],
      ['融合', C.d1, 2.0, false]
    ];
    var seg = narrow ? 12 : 14;
    var gapL = narrow ? 10 : 14;
    ctx.font = narrow ? '9px ' + MONO : '10px ' + MONO;
    var total = 0, j0;
    for (j0 = 0; j0 < items.length; j0 += 1) {
      total += seg + 4 + ctx.measureText(items[j0][0]).width + gapL;
    }
    var lx = padL + plotW - total + gapL;
    if (lx < padL + 60) lx = padL + 60;
    var ly = aTop - 8;
    ctx.textAlign = 'left';
    for (i = 0; i < items.length; i += 1) {
      var label = items[i][0];
      var tw = ctx.measureText(label).width;
      ctx.strokeStyle = items[i][1];
      ctx.lineWidth = items[i][2];
      if (items[i][3]) ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(lx, ly - 3.5);
      ctx.lineTo(lx + seg, ly - 3.5);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = C.muted;
      ctx.fillText(label, lx + seg + 4, ly);
      lx += seg + 4 + tw + gapL;
    }

    /* 足滑标注 */
    if (nShow > 3) {
      ctx.fillStyle = C.d4;
      ctx.textAlign = 'left';
      ctx.font = '9px ' + MONO;
      ctx.fillText('足滑', X(SLIP[0][0]) + 3, bTop + 10);
    }
  }

  /* ---- 读数 ---------------------------------------------------------------- */
  function setOut(key, text) {
    var el = root.querySelector('[data-readout="' + key + '"]');
    if (el) el.textContent = text;
  }

  function updateOut() {
    if (!data) return;
    var r = data.rmse;
    ui.biasOut.textContent = params.bias.toFixed(3) + ' m/s²';
    ui.noiseOut.textContent = params.noise.toFixed(3) + ' m/s²';
    ui.scaleOut.textContent = (params.scale * 100).toFixed(1) + '%';
    ui.gainOut.textContent = params.gain.toFixed(2);

    setOut('imu', r.imu.toFixed(1));
    setOut('leg', r.leg.toFixed(1));
    setOut('fused', r.fused.toFixed(1));
    setOut('final', data.final.fused.toFixed(1));

    if (ui.verdict) {
      var best = Math.min(r.imu, r.leg);
      var txt;
      if (r.fused <= best) {
        txt = '融合 ' + r.fused.toFixed(1) + ' cm 最优：比纯 IMU 好 '
          + (r.imu / Math.max(0.01, r.fused)).toFixed(1) + ' 倍，比纯里程计好 '
          + Math.max(0, (1 - r.fused / Math.max(0.01, r.leg)) * 100).toFixed(0) + '%。';
        ui.verdict.className = '';
      } else {
        var cause;
        if (params.bias <= 0.002) {
          cause = '零偏接近 0，IMU 自己就是最准的——这时融合只会把里程计的系统误差引进来。';
        } else if (params.scale >= 0.03) {
          cause = '瓶颈在里程计 ' + (params.scale * 100).toFixed(1)
            + '% 的比例误差：融合只能继承系统误差，去不掉它。';
        } else if (params.bias >= 0.02) {
          cause = '瓶颈在零偏 ' + params.bias.toFixed(3) + ' m/s²：10 s 内速度漂 '
            + (params.bias * T_END).toFixed(2) + ' m/s，K 的时间常数追不上。';
        } else {
          cause = 'K 落在两端：K→0 退化成纯 IMU，K→1 退化成纯里程计，中间才有增益。';
        }
        txt = '融合 ' + r.fused.toFixed(1) + ' cm 未胜出（纯 IMU ' + r.imu.toFixed(1)
          + '、纯里程计 ' + r.leg.toFixed(1) + '）。' + cause;
        ui.verdict.className = 'is-warn';
      }
      ui.verdict.textContent = txt;
    }
  }

  /* ---- 参数变化 ------------------------------------------------------------ */
  function readParams() {
    params.bias = parseFloat(ui.bias.value) || 0;
    params.noise = parseFloat(ui.noise.value) || 0;
    params.scale = parseFloat(ui.scale.value) || 0;
    params.gain = Math.min(0.95, Math.max(0.01, parseFloat(ui.gain.value) || 0.15));
  }

  function recompute() {
    readParams();
    data = simulate(params);
    reveal = 1;
    stopAnim();
    draw();
    updateOut();
  }

  /* ---- 首次绘制的左到右展开；reduced-motion 下直接出全图 ------------------ */
  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function prefersReduced() { return !!(mq && mq.matches); }

  function stopAnim() {
    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  function tick(ts) {
    if (!rafT0) rafT0 = ts;
    frames += 1;
    reveal = Math.min(1, (ts - rafT0) / 420);
    if (frames > 60) reveal = 1;      /* 时间戳不推进时的保险：直接出全图 */
    draw();
    if (reveal < 1) rafId = window.requestAnimationFrame(tick);
    else rafId = 0;
  }

  function animateIn() {
    stopAnim();
    if (prefersReduced()) {
      reveal = 1;
      draw();
      return;
    }
    reveal = 0;
    rafT0 = 0;
    frames = 0;
    rafId = window.requestAnimationFrame(tick);
  }

  [ui.bias, ui.noise, ui.scale, ui.gain].forEach(function (input) {
    input.addEventListener('input', recompute);
  });

  window.addEventListener('resize', resize);

  if (mq) {
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', function () {
        if (prefersReduced()) {
          stopAnim();
          reveal = 1;
          draw();
        }
      });
    } else if (typeof mq.addListener === 'function') {
      mq.addListener(function () {
        if (prefersReduced()) {
          stopAnim();
          reveal = 1;
          draw();
        }
      });
    }
  }

  /* ---- 启动 ---------------------------------------------------------------- */
  function init() {
    readParams();
    data = simulate(params);
    resize();
    updateOut();
    animateIn();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
