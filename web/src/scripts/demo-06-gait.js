/* 人形机器人全栈手册 · 第 06 章演示 ---------------------------------------------
   LIPM 侧视仿真：ẍ = ω²(x − p)，落脚点由捕获点 ξ = x + ẋ/ω 决定。
   纯原生 DOM + Canvas 2D，无依赖；IIFE，不写 window，不产生全局变量。
   参数与传感器读数见 web/src/sections/06-gait.html 的 .demo 区块。
   ----------------------------------------------------------------------------- */
(function () {
  'use strict';

  var root = document.querySelector('[data-demo="lipm"]');
  if (!root) return;
  var canvas = root.querySelector('canvas');
  if (!canvas || typeof canvas.getContext !== 'function') return;
  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var ui = {
    freq: root.querySelector('#demo61-freq'),
    freqOut: root.querySelector('#demo61-freq-out'),
    step: root.querySelector('#demo61-step'),
    stepOut: root.querySelector('#demo61-step-out'),
    zc: root.querySelector('#demo61-zc'),
    zcOut: root.querySelector('#demo61-zc-out'),
    push: root.querySelector('#demo61-push'),
    shove: root.querySelector('#demo61-shove'),
    reset: root.querySelector('#demo61-reset'),
    single: root.querySelector('#demo61-single')
  };
  if (!ui.freq || !ui.step || !ui.zc) return;

  /* ---- 设计令牌：Canvas 不能直接用 var()，初始化时读一次 --------------------- */
  var css = getComputedStyle(document.documentElement);
  function token(name, fallback) {
    var v = css.getPropertyValue(name);
    return v && v.trim() ? v.trim() : fallback;
  }
  var C = {
    ink: token('--ink', '#14161A'),
    ink2: token('--ink-2', '#3A4048'),
    muted: token('--muted-ink', '#5C626B'),
    line: token('--line', '#DBD6CA'),
    line2: token('--line-2', '#C3BDAF'),
    d1: token('--d1', '#0E5A52'),
    d2: token('--d2', '#B0652C'),
    d3: token('--d3', '#41637F'),
    d4: token('--d4', '#6B4A63'),
    signal: token('--signal-ink', '#A23A22'),
    paper: token('--paper', '#F7F5F0')
  };
  var MONO = '11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  var MONO_S = '10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

  /* ---- 模型常数 ------------------------------------------------------------ */
  var G = 9.81;
  var S_MAX = 0.55;      /* 单步最大步长，m（腿长与关节行程决定的硬限） */
  var MU = 0.60;         /* 需求摩擦系数上限，超过即滑倒 */
  var T_SWING = 0.18;    /* 摆动相时长，s */
  var H = 0.001;         /* 固定 1 ms 子步 */
  var REACH = 0.85;      /* 质心到支撑脚的水平距离硬限，m */
  var PUSH = 0.8;        /* 轻推的纵向脉冲，m/s */
  var SHOVE = 2.2;       /* 重推，m/s */

  var params = { f: 1.6, s: 0.35, zc: 0.8 };
  var gait = null;
  var cssW = 880, cssH = 300;
  var camX = 0;
  var trail = [];        /* 最近 4 s 的 {t, xm, xi}，用于底部时序条 */
  var paused = false;
  var resetAt = 0;
  var lastOut = 0;
  var rafId = 0;
  var lastTs = 0;

  /* ---- 初始状态：取极限环的解析初值，避免一开场就乱摆 ---------------------- */
  function makeGait(f, stepLen, zc) {
    var w = Math.sqrt(G / zc);
    var T = 1 / f;
    var b = stepLen / (Math.exp(w * T) - 1);
    var c = Math.cosh(w * T), sh = Math.sinh(w * T);
    var u = b * (c - 1) / (c - sh - 1);
    return {
      w: w, T: T, b: b, zc: zc,
      ch: Math.cosh(w * H), shh: Math.sinh(w * H),
      x: u, v: w * (b - u), p: 0,
      t: 0, tNext: 0,
      swinging: false, tSwing: 0, dur: 0, from: 0, pTo: 0,
      other: -0.35, side: 0,
      lastStep: stepLen, reflex: false, steps: 0,
      fell: false, fellT: 0
    };
  }

  function reset() {
    gait = makeGait(params.f, params.s, params.zc);
    trail.length = 0;
    camX = gait.x;
    resetAt = 0;
    trail.push({ t: 0, xm: gait.x - gait.p, xi: gait.x + gait.v / gait.w - gait.p });
    draw();
    updateOut();
  }

  /* ---- 物理：常值 p 下的精确解（不是欧拉积分，2 s 的长步也不会漂） ---------- */
  function integrate(g, h) {
    var dx = g.x - g.p;
    var nx = g.p + dx * g.ch + (g.v / g.w) * g.shh;
    var nv = dx * g.w * g.shh + g.v * g.ch;
    g.x = nx;
    g.v = nv;
    g.t += h;
  }

  function stepOnce(g, h) {
    if (g.fell) return;
    integrate(g, h);
    var xi = g.x + g.v / g.w;
    var mu = Math.abs(g.x - g.p) / g.zc;
    if (mu > MU || Math.abs(g.x - g.p) > REACH) {
      g.fell = true;
      g.fellT = g.t;
      return;
    }
    var tIn = g.t - g.tNext;
    if (!g.swinging) {
      var toLand = g.T - tIn;
      var reflex = false;
      if (toLand > T_SWING && tIn > 0.06) {
        /* 预测：若按节拍到点，捕获点会跑出这一步能迈到的长度 → 提前换脚 */
        var xiNom = g.p + (xi - g.p) * Math.exp(g.w * toLand);
        if (Math.abs(xiNom - g.p - g.b) > S_MAX) {
          reflex = true;
          toLand = T_SWING;
        }
      }
      if (tIn >= g.T - T_SWING || reflex) {
        var xiLand = g.p + (xi - g.p) * Math.exp(g.w * toLand);
        var target = xiLand - g.b;
        var d = target - g.p;
        if (Math.abs(d) > S_MAX) target = g.p + (d < 0 ? -S_MAX : S_MAX);
        g.pTo = target;
        g.from = g.p;
        g.dur = Math.min(T_SWING, Math.max(0.03, toLand));
        g.tSwing = 0;
        g.swinging = true;
        g.reflex = reflex;
        g.steps += 1;
        g.lastStep = Math.abs(target - g.p);
      }
    } else {
      g.tSwing += h;
      if (g.tSwing >= g.dur - 1e-9) {
        g.other = g.p;
        g.p = g.pTo;
        g.swinging = false;
        g.tNext = g.t;
        g.side = 1 - g.side;
      }
    }
  }

  function advance(seconds) {
    if (!gait || gait.fell) return;
    var n = Math.max(1, Math.round(seconds / H));
    for (var i = 0; i < n; i += 1) {
      stepOnce(gait, H);
      if (gait.fell) break;
    }
    pushTrail();
  }

  function pushTrail() {
    var g = gait;
    trail.push({ t: g.t, xm: g.x - g.p, xi: g.x + g.v / g.w - g.p });
    while (trail.length > 1 && trail[0].t < g.t - 4.4) trail.shift();
  }

  /* ---- 尺寸与 DPR ---------------------------------------------------------- */
  function resize() {
    var rect = canvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    var w = Math.round(rect.width || canvas.width || 640);
    var h = Math.round(rect.height || 300);
    cssW = Math.max(280, w);
    cssH = Math.max(180, h);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  /* ---- 绘图 ---------------------------------------------------------------- */
  function draw() {
    var g = gait;
    if (!g) return;
    var W = cssW, Hh = cssH;
    var stripH = Hh < 250 ? 46 : 58;
    var groundY = Hh - stripH - 26;
    var scale = Math.min(W / 4.2, (groundY - 36) / g.zc);
    camX += (g.x - camX) * 0.12;
    var cx = function (wx) { return W * 0.5 + (wx - camX) * scale; };
    var cy = function (wz) { return groundY - wz * scale; };

    ctx.clearRect(0, 0, W, Hh);
    ctx.lineJoin = 'round';

    /* 地面 */
    ctx.strokeStyle = C.ink2;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(W, groundY);
    ctx.stroke();
    ctx.strokeStyle = C.line2;
    ctx.lineWidth = 0.8;
    for (var gx = ((camX * scale) % 26) + 10; gx < W; gx += 26) {
      ctx.beginPath();
      ctx.moveTo(gx, groundY);
      ctx.lineTo(gx - 8, groundY + 8);
      ctx.stroke();
    }

    /* 支撑脚（实心）与后脚（空心） */
    var footW = Math.max(14, 0.24 * scale);
    drawFoot(g.p, 0, true);
    drawFoot(g.other, 0, false);
    if (g.swinging) {
      var u = Math.min(1, g.tSwing / g.dur);
      var s = u * u * (3 - 2 * u);
      var fx = g.from + (g.pTo - g.from) * s;
      var lift = 0.06 * Math.sin(Math.PI * u);
      drawFoot(fx, lift, false);
    }

    /* 腿：支撑脚到质心 */
    ctx.strokeStyle = C.ink2;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx(g.p), groundY);
    ctx.lineTo(cx(g.x), cy(g.zc));
    ctx.stroke();

    /* 捕获点 ξ */
    var xi = g.x + g.v / g.w;
    ctx.strokeStyle = C.d4;
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx(xi), groundY - 2);
    ctx.lineTo(cx(xi), cy(g.zc) + 6);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = C.paper;
    ctx.strokeStyle = C.d4;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(cx(xi), groundY - 10, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = C.d4;
    ctx.font = MONO_S;
    ctx.textAlign = 'center';
    ctx.fillText('ξ', cx(xi), groundY - 20);

    /* ZMP：支撑脚中心 */
    ctx.fillStyle = C.d2;
    ctx.beginPath();
    ctx.moveTo(cx(g.p), groundY - 3);
    ctx.lineTo(cx(g.p) - 5, groundY - 12);
    ctx.lineTo(cx(g.p) + 5, groundY - 12);
    ctx.closePath();
    ctx.fill();

    /* 质心 */
    ctx.fillStyle = C.paper;
    ctx.strokeStyle = C.d1;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx(g.x), cy(g.zc), 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = C.d1;
    ctx.beginPath();
    ctx.arc(cx(g.x), cy(g.zc), 2.5, 0, Math.PI * 2);
    ctx.fill();

    /* 速度箭头 */
    var vlen = Math.max(-110, Math.min(110, g.v * 70));
    if (Math.abs(vlen) > 6) {
      arrow(cx(g.x), cy(g.zc) - 18, cx(g.x) + vlen, cy(g.zc) - 18, C.d1);
      ctx.fillStyle = C.d1;
      ctx.font = MONO_S;
      ctx.textAlign = vlen > 0 ? 'left' : 'right';
      ctx.fillText(g.v.toFixed(2) + ' m/s', cx(g.x) + vlen + (vlen > 0 ? 6 : -6), cy(g.zc) - 22);
    }

    /* 状态与图例 */
    ctx.font = MONO_S;
    ctx.textAlign = 'left';
    ctx.fillStyle = C.muted;
    ctx.fillText('● 质心　◆ ZMP　○ 捕获点 ξ', 12, 18);
    ctx.textAlign = 'right';
    if (g.fell) {
      ctx.fillStyle = C.signal;
      ctx.font = 'bold 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
      ctx.fillText('摔倒：需求摩擦 μ > 0.60', W - 12, 20);
      ctx.font = MONO_S;
      ctx.fillText('1.4 s 后自动重置', W - 12, 36);
    } else {
      ctx.fillStyle = g.reflex ? C.d2 : C.muted;
      ctx.fillText(g.swinging ? '摆动相' : (g.reflex ? '反射步（提前换脚）' : '支撑相'), W - 12, 18);
    }

    drawStrip(groundY + 18, Hh - 6);
  }

  function drawFoot(wx, lift, solid) {
    var W = cssW;
    var groundY = cssH - (cssH < 250 ? 46 : 58) - 26;
    var scale = Math.min(W / 4.2, (groundY - 36) / (gait ? gait.zc : 0.8));
    var fx = W * 0.5 + (wx - camX) * scale;
    var w = Math.max(14, 0.24 * scale);
    var h = Math.max(4, 0.07 * scale);
    var y = groundY - lift * scale;
    ctx.beginPath();
    ctx.rect(fx - w / 2, y - h, w, h);
    if (solid) {
      ctx.fillStyle = C.d1;
      ctx.globalAlpha = 0.22;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = C.d1;
      ctx.lineWidth = 1.4;
    } else {
      ctx.strokeStyle = C.line2;
      ctx.lineWidth = 1;
    }
    ctx.stroke();
  }

  function arrow(x0, y0, x1, y1, color) {
    var a = Math.atan2(y1 - y0, x1 - x0);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - 7 * Math.cos(a - 0.42), y1 - 7 * Math.sin(a - 0.42));
    ctx.lineTo(x1 - 7 * Math.cos(a + 0.42), y1 - 7 * Math.sin(a + 0.42));
    ctx.closePath();
    ctx.fill();
  }

  function drawStrip(top, bottom) {
    var W = cssW;
    var h = bottom - top;
    if (h < 24) return;
    var t1 = gait.t;
    var t0 = Math.max(0, t1 - 4.0);
    var span = Math.max(0.6, t1 - t0);
    var y0 = top + h / 2;
    var amp = (h / 2 - 6) / 0.55;
    var px = function (t) { return 10 + (t - t0) / span * (W - 20); };
    var py = function (m) { return y0 - Math.max(-0.55, Math.min(0.55, m)) * amp; };

    ctx.strokeStyle = C.line;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(0, y0);
    ctx.lineTo(W, y0);
    ctx.stroke();

    /* μ 极限线：±0.48 m（μ=0.6、z_c=0.8） */
    ctx.strokeStyle = C.line2;
    ctx.setLineDash([2, 4]);
    var lim = MU * gait.zc;
    ctx.beginPath();
    ctx.moveTo(0, py(lim));
    ctx.lineTo(W, py(lim));
    ctx.moveTo(0, py(-lim));
    ctx.lineTo(W, py(-lim));
    ctx.stroke();
    ctx.setLineDash([]);

    var i;
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = C.d4;
    ctx.beginPath();
    for (i = 0; i < trail.length; i += 1) {
      var px1 = px(trail[i].t), py1 = py(trail[i].xi);
      if (i === 0) ctx.moveTo(px1, py1); else ctx.lineTo(px1, py1);
    }
    ctx.stroke();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = C.d1;
    ctx.beginPath();
    for (i = 0; i < trail.length; i += 1) {
      var px2 = px(trail[i].t), py2 = py(trail[i].xm);
      if (i === 0) ctx.moveTo(px2, py2); else ctx.lineTo(px2, py2);
    }
    ctx.stroke();

    ctx.font = MONO_S;
    ctx.textAlign = 'left';
    ctx.fillStyle = C.muted;
    ctx.fillText('c − p（绿）与 ξ − p（紫）／m', 10, top - 2);
  }

  /* ---- 读数 ---------------------------------------------------------------- */
  function setOut(key, text) {
    var el = root.querySelector('[data-readout="' + key + '"]');
    if (el) el.textContent = text;
  }

  function updateOut() {
    if (!gait) return;
    var g = gait;
    var xi = g.x + g.v / g.w;
    setOut('speed', g.v.toFixed(2));
    setOut('step', g.lastStep.toFixed(2));
    setOut('dcm', ((xi - g.p) * 100).toFixed(1));
    setOut('mu', (Math.abs(g.x - g.p) / g.zc).toFixed(2));
    ui.freqOut.textContent = params.f.toFixed(2) + ' 步/秒';
    ui.stepOut.textContent = params.s.toFixed(2) + ' m';
    ui.zcOut.textContent = params.zc.toFixed(2) + ' m';
  }

  /* ---- 主循环 -------------------------------------------------------------- */
  function frame(ts) {
    if (!lastTs) lastTs = ts;
    var dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;
    if (!paused) {
      if (gait.fell) {
        if (!resetAt) resetAt = ts + 1400;
        else if (ts >= resetAt) { reset(); resetAt = 0; }
      } else {
        advance(dt);
      }
      if (ts - lastOut > 90) { lastOut = ts; updateOut(); }
      draw();
    }
    rafId = window.requestAnimationFrame(frame);
  }

  function start() {
    if (rafId) return;
    lastTs = 0;
    rafId = window.requestAnimationFrame(frame);
  }

  function stop() {
    if (!rafId) return;
    window.cancelAnimationFrame(rafId);
    rafId = 0;
  }

  /* ---- 交互 ---------------------------------------------------------------- */
  function onRange() {
    params.f = parseFloat(ui.freq.value) || 1.6;
    params.s = parseFloat(ui.step.value) || 0.35;
    params.zc = parseFloat(ui.zc.value) || 0.8;
    updateOut();
    reset();
  }

  [ui.freq, ui.step, ui.zc].forEach(function (input) {
    input.addEventListener('input', onRange);
  });

  if (ui.push) ui.push.addEventListener('click', function () { impulse(PUSH); });
  if (ui.shove) ui.shove.addEventListener('click', function () { impulse(SHOVE); });
  if (ui.reset) ui.reset.addEventListener('click', function () { reset(); });

  function impulse(dv) {
    if (!gait) return;
    if (gait.fell) return;
    gait.v += dv;
  }

  if (ui.single) {
    ui.single.addEventListener('click', function () {
      if (!gait) return;
      advance(0.05);
      updateOut();
      draw();
    });
  }

  /* ---- prefers-reduced-motion --------------------------------------------- */
  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  function applyMotion() {
    paused = !!(mq && mq.matches);
    if (ui.single) {
      if (paused) ui.single.removeAttribute('hidden');
      else ui.single.setAttribute('hidden', 'hidden');
    }
    if (paused) {
      stop();
      draw();
      updateOut();
    } else {
      start();
    }
  }

  if (mq) {
    if (typeof mq.addEventListener === 'function') mq.addEventListener('change', applyMotion);
    else if (typeof mq.addListener === 'function') mq.addListener(applyMotion);
  }

  window.addEventListener('resize', resize);

  /* ---- 启动 ---------------------------------------------------------------- */
  function init() {
    resize();
    reset();
    applyMotion();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
