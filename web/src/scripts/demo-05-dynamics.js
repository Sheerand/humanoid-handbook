/* 05 章演示 · 摩擦锥：质心、支撑脚、地面反力与半角 atan(μ)
   契约：IIFE，无依赖，不写 window；canvas 按 devicePixelRatio 缩放；
   只有打滑且未开启「减弱动效」时才用 rAF 做呼吸提示。 */
(function () {
  'use strict';

  var root = document.querySelector('[data-demo="friction-cone"]');
  if (!root) return;

  var canvas = root.querySelector('canvas');
  if (!canvas || typeof canvas.getContext !== 'function') return;
  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var G = 9.81;
  var azEl = root.querySelector('#demo51-az');
  var axEl = root.querySelector('#demo51-ax');
  var muEl = root.querySelector('#demo51-mu');
  var massEl = root.querySelector('#demo51-mass');
  if (!azEl || !axEl || !muEl || !massEl) return;

  var out = {
    az: root.querySelector('#demo51-az-out'),
    ax: root.querySelector('#demo51-ax-out'),
    mu: root.querySelector('#demo51-mu-out'),
    mass: root.querySelector('#demo51-mass-out')
  };
  var read = {
    fz: root.querySelector('[data-readout="fz"]'),
    fx: root.querySelector('[data-readout="fx"]'),
    mumin: root.querySelector('[data-readout="mumin"]'),
    axmax: root.querySelector('[data-readout="axmax"]')
  };
  var status = root.querySelector('#demo51-status');

  /* ---- 颜色：优先读设计令牌，读不到时退回同值 ---- */
  var rootEl = document.documentElement;
  var colorCache = {};
  function token(name, fallback) {
    if (colorCache[name]) return colorCache[name];
    var value = '';
    try {
      value = window.getComputedStyle(rootEl).getPropertyValue(name);
    } catch (err) {
      value = '';
    }
    value = (value || '').trim() || fallback;
    colorCache[name] = value;
    return value;
  }
  var C = {
    ink: token('--ink', '#14161A'),
    ink2: token('--ink-2', '#3A4048'),
    muted: token('--muted-ink', '#5C626B'),
    line: token('--line-2', '#C3BDAF'),
    soft: token('--line', '#DBD6CA'),
    d1: token('--d1', '#0E5A52'),
    d2: token('--d2', '#B0652C'),
    d3: token('--d3', '#41637F'),
    signal: token('--signal-ink', '#A23A22')
  };

  var FONT_SANS = 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
  var FONT_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  function setFont(px, weight, mono) {
    ctx.font = (weight || 400) + ' ' + px + 'px ' + (mono ? FONT_MONO : FONT_SANS);
  }

  var motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reduced() {
    return !!(motion && motion.matches);
  }

  var W = 0;
  var H = 0;

  function fit() {
    var rect = canvas.getBoundingClientRect();
    var w = Math.round(rect.width);
    var h = Math.round(rect.height);
    if (!w || !h) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    W = w;
    H = h;
    var px = Math.round(w * dpr);
    var py = Math.round(h * dpr);
    if (canvas.width !== px || canvas.height !== py) {
      canvas.width = px;
      canvas.height = py;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function num(el) {
    var v = parseFloat(el.value);
    return isFinite(v) ? v : 0;
  }

  function state() {
    return {
      az: num(azEl),
      ax: num(axEl),
      mu: Math.max(0.02, num(muEl)),
      m: Math.max(1, num(massEl))
    };
  }

  function model(s) {
    var fz = s.m * (G + s.az);
    var fx = s.m * s.ax;
    var limit = s.mu * fz;
    return {
      fz: fz,
      fx: fx,
      limit: limit,
      mumin: fz > 1e-6 ? Math.abs(fx) / fz : Infinity,
      slip: Math.abs(fx) > limit + 1e-6,
      axmax: s.mu * (G + s.az)
    };
  }

  function line(x0, y0, x1, y1, color, width, dash) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.restore();
  }

  function arrow(x0, y0, x1, y1, color, width) {
    var dx = x1 - x0;
    var dy = y1 - y0;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;
    var ux = dx / len;
    var uy = dy / len;
    var head = Math.min(10, len * 0.35);
    var hx = x1 - ux * head;
    var hy = y1 - uy * head;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(hx - uy * head * 0.5, hy + ux * head * 0.5);
    ctx.lineTo(hx + uy * head * 0.5, hy - ux * head * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /* 文字先描一圈舞台底色，压在锥面或箭头上仍然清楚 */
  function label(text, x, y, color, size, weight, mono, align) {
    ctx.save();
    ctx.textAlign = align || 'left';
    setFont(size || 12, weight || 400, mono);
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(251,250,246,0.92)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function draw(s, r, phase) {
    var w = W;
    var h = H;
    var groundY = h - Math.max(32, h * 0.14);
    var cx = w * 0.5;
    var top = 34;
    var avail = groundY - top - 4;
    if (avail < 40) return;

    var scale = Math.min(avail / 1800, (w * 0.40) / 960);

    ctx.clearRect(0, 0, w, h);

    /* 地面 */
    line(0, groundY + 0.5, w, groundY + 0.5, C.line, 1);
    ctx.save();
    ctx.strokeStyle = C.soft;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var x = -12; x < w + 16; x += 12) {
      ctx.moveTo(x, groundY + 1);
      ctx.lineTo(x + 7, groundY + 8);
    }
    ctx.stroke();
    ctx.restore();

    /* 支撑脚 */
    var footW = Math.min(96, w * 0.26);
    var footH = 7;
    ctx.save();
    ctx.fillStyle = C.ink2;
    ctx.globalAlpha = 0.08;
    ctx.fillRect(cx - footW / 2, groundY - footH, footW, footH);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = C.ink2;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(cx - footW / 2, groundY - footH, footW, footH);
    ctx.restore();

    /* 法向虚线 */
    line(cx, groundY - 2, cx, groundY - avail * 0.96, C.soft, 1, [4, 5]);

    /* 摩擦锥 */
    var theta = Math.atan(s.mu);
    var coneLen = Math.min(avail * 0.94, 160);
    var spread = Math.sin(theta) * coneLen;
    var rise = Math.cos(theta) * coneLen;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, groundY);
    ctx.lineTo(cx + spread, groundY - rise);
    ctx.lineTo(cx - spread, groundY - rise);
    ctx.closePath();
    ctx.globalAlpha = r.slip ? 0.13 : 0.09;
    ctx.fillStyle = r.slip ? C.signal : C.d1;
    ctx.fill();
    ctx.restore();

    line(cx, groundY, cx + spread, groundY - rise, r.slip ? C.signal : C.d1, 1.2);
    line(cx, groundY, cx - spread, groundY - rise, r.slip ? C.signal : C.d1, 1.2);

    /* 半角弧 */
    ctx.save();
    ctx.strokeStyle = r.slip ? C.signal : C.d1;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, groundY, 34, -Math.PI / 2 - theta, -Math.PI / 2 + theta);
    ctx.stroke();
    ctx.restore();

    /* 质心 */
    var comX = cx + Math.max(-w * 0.09, Math.min(w * 0.09, s.ax * 3));
    var comY = groundY - Math.min(avail * 0.62, 108);

    /* 重力：向左偏 16 px，避免与同一直线上的合力箭头重叠 */
    var gx = Math.max(18, comX - 16);
    var gLen = Math.min(s.m * G * scale, 96);
    line(comX, comY, gx, comY, C.d3, 1, [2, 3]);
    arrow(gx, comY, gx, comY + gLen, C.d3, 1.6);

    ctx.save();
    ctx.fillStyle = C.d3;
    ctx.beginPath();
    ctx.arc(comX, comY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    /* 合力：从接触点出发 */
    var tipX = cx + r.fx * scale;
    var tipY = groundY - r.fz * scale;

    ctx.save();
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = C.soft;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, groundY);
    ctx.lineTo(tipX, groundY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    ctx.restore();

    arrow(cx, groundY, tipX, tipY, r.slip ? C.signal : C.d2, 2.6);

    /* 力矢量标签：放在箭杆背侧，避免压住箭头 */
    var flip = r.fx < 0 || tipX + 96 > w;
    var labelX = tipX + (flip ? -10 : 10);
    var anchor = flip ? 'right' : 'left';
    label('F', labelX, tipY - 12, r.slip ? C.signal : C.d2, 12, 600, true, anchor);
    label('Fz ' + Math.round(r.fz) + ' N', labelX, tipY + 4, C.ink2, 12, 400, true, anchor);
    label('Fx ' + Math.round(r.fx) + ' N', labelX, tipY + 20, C.ink2, 12, 400, true, anchor);

    /* 质心标签 */
    label('c', comX + 11, comY + 4, C.ink, 12, 600, false, 'left');

    /* 重力标签 */
    label('mg ' + Math.round(s.m * G) + ' N', gx - 7, comY + gLen * 0.62 + 4, C.d3, 12, 400, true, 'right');

    /* 参数标签（右上） */
    label('μ ' + s.mu.toFixed(2) + '   θ ' + (theta * 180 / Math.PI).toFixed(1) + '°', w - 12, 18, C.muted, 12, 400, true, 'right');
    label('m ' + Math.round(s.m) + ' kg', w - 12, 34, C.muted, 12, 400, true, 'right');

    /* 状态徽标（左上） */
    ctx.save();
    ctx.globalAlpha = phase;
    ctx.fillStyle = r.slip ? C.signal : C.d1;
    ctx.beginPath();
    ctx.arc(17, 15, 4, 0, Math.PI * 2);
    ctx.fill();
    label(r.slip ? '打滑：合力穿出锥体' : '锥内：接触可维持', 27, 19, r.slip ? C.signal : C.d1, 12, 600, false, 'left');
    ctx.restore();
  }

  function write(s, r) {
    if (out.az) out.az.textContent = s.az.toFixed(1);
    if (out.ax) out.ax.textContent = s.ax.toFixed(1);
    if (out.mu) out.mu.textContent = s.mu.toFixed(2);
    if (out.mass) out.mass.textContent = String(Math.round(s.m));
    if (read.fz) read.fz.textContent = String(Math.round(r.fz));
    if (read.fx) read.fx.textContent = String(Math.round(r.fx));
    if (read.mumin) read.mumin.textContent = r.mumin.toFixed(2);
    if (read.axmax) read.axmax.textContent = r.axmax.toFixed(1);

    if (!status) return;
    var gap = Math.abs(r.limit) - Math.abs(r.fx);
    if (r.slip) {
      status.textContent = '打滑：|Fx| = ' + Math.round(Math.abs(r.fx)) + ' N，超过 μFz = ' +
        Math.round(r.limit) + ' N；所需 μ_min = ' + r.mumin.toFixed(2) +
        '，当前 μ = ' + s.mu.toFixed(2) + '。';
      status.classList.add('is-slip');
    } else {
      status.textContent = '锥内：|Fx| = ' + Math.round(Math.abs(r.fx)) + ' N，μFz = ' +
        Math.round(r.limit) + ' N，余量 ' + Math.round(gap) +
        ' N；此 μ 下水平加速度上限 ' + r.axmax.toFixed(1) + ' m/s²。';
      status.classList.remove('is-slip');
    }
  }

  var rafId = 0;

  function refresh(now) {
    var s = state();
    var r = model(s);
    write(s, r);
    if (!W || !H) fit();
    if (!W || !H) return false;
    var phase = 1;
    if (r.slip && !reduced()) phase = 0.55 + 0.45 * Math.sin(now / 260);
    draw(s, r, phase);
    return r.slip;
  }

  function frame(ts) {
    rafId = 0;
    var slipping = refresh(ts || 0);
    if (slipping && !reduced()) rafId = window.requestAnimationFrame(frame);
  }

  function schedule() {
    if (rafId) return;
    rafId = window.requestAnimationFrame(frame);
  }

  function onResize() {
    fit();
    schedule();
  }

  var i;
  var inputs = [azEl, axEl, muEl, massEl];
  for (i = 0; i < inputs.length; i += 1) {
    inputs[i].addEventListener('input', schedule);
  }

  window.addEventListener('resize', onResize, { passive: true });
  if (typeof window.ResizeObserver === 'function') {
    try {
      new window.ResizeObserver(onResize).observe(canvas.parentNode || canvas);
    } catch (err) {
      /* 旧浏览器没有 ResizeObserver，window resize 已经够用 */
    }
  }
  if (motion) {
    if (typeof motion.addEventListener === 'function') {
      motion.addEventListener('change', schedule);
    } else if (typeof motion.addListener === 'function') {
      motion.addListener(schedule);
    }
  }

  fit();
  schedule();
})();
