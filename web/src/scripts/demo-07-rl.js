/* 07 章演示 · 奖励塑形沙盒：一维弹簧腿跳跃
   契约：IIFE，无依赖，不写 window；canvas 按 devicePixelRatio 缩放并监听 resize；
   prefers-reduced-motion 下不做 rAF 动画，直接跑满 10 s 画静态轨迹。
   物理是简化的一维质点 + 弹簧腿，不是真实机器人；控制器是解析的，不是学出来的。 */
(function () {
  'use strict';

  var root = document.querySelector('[data-demo="reward"]');
  if (!root) return;

  var canvas = root.querySelector('canvas');
  if (!canvas || typeof canvas.getContext !== 'function') return;
  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var hEl = root.querySelector('#demo71-h');
  var weEl = root.querySelector('#demo71-we');
  var wsEl = root.querySelector('#demo71-ws');
  if (!hEl || !weEl || !wsEl) return;

  var out = {
    h: root.querySelector('#demo71-h-out'),
    we: root.querySelector('#demo71-we-out'),
    ws: root.querySelector('#demo71-ws-out')
  };
  var read = {
    apex: root.querySelector('[data-readout="apex"]'),
    peak: root.querySelector('[data-readout="peak"]'),
    work: root.querySelector('[data-readout="work"]'),
    reward: root.querySelector('[data-readout="reward"]')
  };
  var bars = {
    h: root.querySelector('[data-rw="h"]'),
    e: root.querySelector('[data-rw="e"]'),
    s: root.querySelector('[data-rw="s"]')
  };
  var vals = {
    h: root.querySelector('[data-rwv="h"]'),
    e: root.querySelector('[data-rwv="e"]'),
    s: root.querySelector('[data-rwv="s"]'),
    total: root.querySelector('[data-rwv="total"]')
  };
  var status = root.querySelector('#demo71-status');

  /* ---------- 设计令牌 ---------- */
  var tokenCache = {};
  function token(name, fallback) {
    if (tokenCache[name]) return tokenCache[name];
    var v = '';
    try {
      v = window.getComputedStyle(document.documentElement).getPropertyValue(name);
    } catch (err) {
      v = '';
    }
    v = (v || '').trim() || fallback;
    tokenCache[name] = v;
    return v;
  }
  var COL = {
    ink2: token('--ink-2', '#3A4048'),
    muted: token('--muted-ink', '#5C626B'),
    line: token('--line', '#DBD6CA'),
    line2: token('--line-2', '#C3BDAF'),
    d1: token('--d1', '#0E5A52'),
    d2: token('--d2', '#B0652C'),
    d3: token('--d3', '#41637F'),
    d4: token('--d4', '#6B4A63'),
    surface: token('--surface', '#FFFFFF')
  };

  var FONT_SANS = 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
  var FONT_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

  /* ---------- 简化物理 ----------
     m = 1 kg 的单腿模型：y 为质心高度，ℓ0 = 0.65 m 为腿的自然长度。
     支撑相：F = k(ℓ0−y) + c·ℓ̇（ℓ̇ 为压缩速率，等于 −v）+ 推力 F_act。
     飞行相：只受重力。子步固定 1 ms。 */
  var M = 1.0, G = 9.81, L0 = 0.65, K = 60.0, C = 1.0;
  var FMAX = 80.0, LMIN = 0.15, KP = 300.0, BIAS = 0.09, DT = 0.001;
  var YMAX = 1.40, WINDOW = 10.0;

  var hdes = 0.85;
  var y, v, stance, tSim, tdTime;
  var cur, apex, lastHop, hopHistory, trail, peakMarks;
  var aRing;

  function newRec() {
    return { td: tSim, to: tSim, peak: 0, work: 0, jsum: 0, jn: 0, apex: 0, jrms: 0 };
  }

  function reset() {
    y = L0 - M * G / K;
    v = 0;
    stance = true;
    tSim = 0;
    tdTime = 0;
    apex = y;
    cur = newRec();
    lastHop = null;
    hopHistory = [];
    trail = [];
    peakMarks = [];
    aRing = [];
    sample();
  }

  function weights() {
    return {
      h: Math.max(0.3, Math.min(1.3, parseFloat(hEl.value) || 0.95)),
      we: Math.max(0, Math.min(1, parseFloat(weEl.value) || 0)),
      ws: Math.max(0, Math.min(2, parseFloat(wsEl.value) || 0))
    };
  }

  function rewardOf(hop, w) {
    var rh = Math.exp(-Math.pow((hop.apex - w.h) / 0.20, 2));
    var re = -w.we * hop.work / 3.0;
    var rs = -w.ws * Math.min(Math.pow(hop.jrms / 2000, 2), 4);
    return { h: rh, e: re, s: rs, total: rh + re + rs };
  }

  function sample() {
    trail.push({ t: tSim, y: y, st: stance });
    var cut = tSim - WINDOW - 0.2;
    while (trail.length > 1 && trail[0].t < cut) trail.shift();
  }

  function step() {
    var F = 0, thrust = 0, a;
    if (stance) {
      var spring = K * (L0 - y) - C * v;        // 阻尼抵抗压缩：v<0 时该项为正
      if (spring < 0) spring = 0;
      var e = 0.5 * M * v * v + M * G * y;      // 当前机械能（含弹簧储能）
      if (y > 0 && y < L0) e += 0.5 * K * (L0 - y) * (L0 - y);
      var hpred = e / (M * G);                  // 折算成「现在离地能到多高」
      // 对预测顶点做 PD：P 项为高度误差，微分作用已由 hpred 里的 v² 带入；
      // BIAS 补偿阻尼与有限行程造成的稳态落差
      var target = hdes > L0 ? hdes + BIAS : hdes;
      thrust = KP * (target - hpred);
      if (thrust < 0) thrust = 0;
      else if (thrust > FMAX) thrust = FMAX;
      F = spring + thrust;
      a = F / M - G;
      if (F > cur.peak) cur.peak = F;
      cur.work += Math.abs(thrust * v) * DT;
      aRing.push(a);
      if (aRing.length > 20) aRing.shift();
      if (aRing.length === 20) {
        var j = (a - aRing[0]) / 0.019;
        cur.jsum += j * j;
        cur.jn += 1;
      }
    } else {
      a = -G;
      if (y > apex) apex = y;
    }

    v += a * DT;
    y += v * DT;
    if (y < LMIN) {
      y = LMIN;
      if (v < 0) v = 0;
    }

    if (stance && tSim - tdTime > 0.012 && y >= L0 && v > 0) {
      stance = false;
      cur.to = tSim;
      apex = y;
      aRing = [];
    } else if (!stance && y <= L0 && v < 0) {
      land();
    }
    tSim += DT;
  }

  function land() {
    stance = true;
    tdTime = tSim;
    cur.apex = apex;
    cur.jrms = cur.jn ? Math.sqrt(cur.jsum / cur.jn) : 0;
    cur.reward = rewardOf(cur, weights());
    lastHop = cur;
    hopHistory.push({ t: tSim, hop: cur });
    while (hopHistory.length && hopHistory[0].t < tSim - WINDOW) hopHistory.shift();
    peakMarks.push({ t: tSim, peak: cur.peak });
    if (peakMarks.length > 3) peakMarks.shift();
    showReward(cur.reward);
    cur = newRec();
    aRing = [];
  }

  function advance(sec) {
    var steps = Math.round(sec / DT);
    if (steps > 200000) steps = 200000;
    for (var i = 0; i < steps; i++) {
      step();
      if (i % 10 === 0) sample();
    }
  }

  /* ---------- 画布 ---------- */
  var W = 0, H = 0;

  function fit() {
    var rect = canvas.getBoundingClientRect();
    var w = Math.round(rect.width);
    var h = Math.round(rect.height);
    if (!w || !h) return false;
    var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    W = w;
    H = h;
    var pw = Math.round(w * dpr);
    var ph = Math.round(h * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }

  function fmt(x, d) {
    if (!isFinite(x)) return '—';
    return x.toFixed(d);
  }

  function drawHopper(gx0, gy0, gx1, gy1, px) {
    var gx = (gx0 + gx1) / 2;
    var groundY = gy1;
    var massY = px(y);
    if (massY < gy0) massY = gy0;
    var legLen = stance ? Math.max(0.02, y) : L0;
    var footY = px(Math.max(0, y - legLen));
    if (footY > groundY) footY = groundY;

    ctx.strokeStyle = COL.line2;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(gx0, groundY);
    ctx.lineTo(gx1, groundY);
    ctx.stroke();

    ctx.strokeStyle = COL.d3;
    ctx.lineWidth = 1.2;
    var top = massY + 5;
    var bot = footY - 3;
    if (bot > top + 8) {
      var n = 6, amp = 4;
      ctx.beginPath();
      ctx.moveTo(gx, top);
      for (var k = 0; k < n; k++) {
        var yy = top + (bot - top) * (k + 0.5) / n;
        ctx.lineTo(gx + (k % 2 === 0 ? amp : -amp), yy);
      }
      ctx.lineTo(gx, bot);
      ctx.stroke();
    }

    ctx.fillStyle = COL.ink2;
    ctx.fillRect(gx - 7, footY - 3, 14, 3);

    ctx.fillStyle = COL.d1;
    ctx.fillRect(gx - 9, massY - 5, 18, 10);
    ctx.fillStyle = COL.surface;
    ctx.fillRect(gx - 4, massY - 2, 8, 4);

    ctx.fillStyle = COL.muted;
    ctx.font = '10px ' + FONT_MONO;
    ctx.textAlign = 'center';
    ctx.fillText('m = 1 kg', gx, gy1 + 12);
    ctx.fillText('ℓ0 = 0.65 m', gx, gy1 + 24);
  }

  function draw() {
    if (!W || !H) return;
    ctx.clearRect(0, 0, W, H);

    var compact = W < 560;
    var padL = compact ? 40 : 48;
    var padR = compact ? 14 : 96;
    var padT = 18;
    var padB = compact ? 36 : 44;
    var x0 = padL, x1 = W - padR;
    var y0 = padT, y1 = H - padB;
    if (x1 - x0 < 80 || y1 - y0 < 60) return;

    function px(val) { return y1 - (val / YMAX) * (y1 - y0); }
    function tx(tt) { return x1 - ((tSim - tt) / WINDOW) * (x1 - x0); }

    /* 网格 */
    ctx.strokeStyle = COL.line;
    ctx.lineWidth = 0.5;
    ctx.setLineDash([2, 4]);
    var g;
    for (g = 0; g <= YMAX + 1e-6; g += 0.25) {
      var gy = px(g);
      ctx.beginPath();
      ctx.moveTo(x0, gy);
      ctx.lineTo(x1, gy);
      ctx.stroke();
    }
    for (g = 0; g <= WINDOW + 1e-6; g += 2) {
      var gx = tx(tSim - (WINDOW - g));
      if (gx < x0 - 0.5) continue;
      ctx.beginPath();
      ctx.moveTo(gx, y0);
      ctx.lineTo(gx, y1);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    /* 坐标轴 */
    ctx.strokeStyle = COL.line2;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, y1);
    ctx.lineTo(x1, y1);
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0, y1);
    ctx.stroke();

    /* 刻度 */
    ctx.fillStyle = COL.muted;
    ctx.font = '11px ' + FONT_MONO;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (g = 0; g <= YMAX + 1e-6; g += 0.5) {
      ctx.fillText(g.toFixed(1), x0 - 6, px(g));
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (g = 0; g <= WINDOW + 1e-6; g += 2) {
      var gx2 = tx(tSim - (WINDOW - g));
      if (gx2 < x0 - 0.5) continue;
      var lbl = WINDOW - g;
      ctx.fillText(lbl === 0 ? '0' : '−' + lbl, gx2, y1 + 6);
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = COL.ink2;
    ctx.font = '11.5px ' + FONT_SANS;
    ctx.fillText('高度 / m', x0 - 2, y0 - 14);
    ctx.textAlign = 'right';
    ctx.fillText('时间 / s', x1, y0 - 14);
    ctx.textAlign = 'left';

    /* 目标线 */
    var w = weights();
    ctx.strokeStyle = COL.d2;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(x0, px(w.h));
    ctx.lineTo(x1, px(w.h));
    ctx.stroke();
    ctx.strokeStyle = COL.d4;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(x0, px(hdes));
    ctx.lineTo(x1, px(hdes));
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = '10.5px ' + FONT_MONO;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = COL.d2;
    ctx.fillText('h* ' + fmt(w.h, 2), x0 + 4, px(w.h) - 6);
    ctx.fillStyle = COL.d4;
    var hdY = px(hdes) + 14;
    if (Math.abs(px(w.h) - px(hdes)) < 14) hdY = px(hdes) + 26;
    ctx.fillText('h_des ' + fmt(hdes, 2), x0 + 4, hdY);

    /* 触地条带 */
    var stripY = y1 + (compact ? 24 : 32);
    ctx.fillStyle = COL.line;
    ctx.fillRect(x0, stripY, x1 - x0, 3);
    for (var i = 0; i < trail.length; i++) {
      var s = trail[i];
      if (!s.st) continue;
      var sx = tx(s.t);
      if (sx < x0 || sx > x1) continue;
      ctx.fillStyle = COL.d3;
      ctx.fillRect(sx - 1, stripY, 2.4, 3);
    }

    /* 轨迹 */
    if (trail.length > 1) {
      ctx.strokeStyle = COL.d1;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      var started = false;
      for (i = 0; i < trail.length; i++) {
        var p = trail[i];
        var ax = tx(p.t), ay = px(p.y);
        if (!started) { ctx.moveTo(ax, ay); started = true; }
        else ctx.lineTo(ax, ay);
      }
      ctx.stroke();
    }

    /* 最近三次触地的峰值力 */
    ctx.font = '10.5px ' + FONT_MONO;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (i = 0; i < peakMarks.length; i++) {
      var mk = peakMarks[i];
      var mx = tx(mk.t);
      if (mx < x0 + 12 || mx > x1 - 8) continue;
      var my = px(L0);
      ctx.fillStyle = COL.d2;
      ctx.beginPath();
      ctx.arc(mx, my, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COL.ink2;
      ctx.fillText(fmt(mk.peak, 0) + ' N', mx, my + 12 + i * 14);
    }

    /* 当前点 */
    ctx.fillStyle = COL.d1;
    ctx.beginPath();
    ctx.arc(tx(tSim), px(y), 3.4, 0, Math.PI * 2);
    ctx.fill();

    if (!compact) drawHopper(W - 82, y0 + 4, W - 18, y1, px);
  }

  /* ---------- 读数与奖励分项 ---------- */
  function setBar(el, val) {
    if (!el) return;
    var zero = 60, width, left;
    if (val >= 0) {
      width = Math.min(1, val) * 40;
      left = zero;
    } else {
      width = Math.min(1, -val / 1.5) * 60;
      left = zero - width;
    }
    el.style.left = left + '%';
    el.style.width = width + '%';
    el.className = 'rw-bar ' + (val >= 0 ? 'is-pos' : 'is-neg');
  }

  function showReward(r) {
    if (!r) return;
    setBar(bars.h, r.h);
    setBar(bars.e, r.e);
    setBar(bars.s, r.s);
    if (vals.h) vals.h.textContent = (r.h >= 0 ? '+' : '') + fmt(r.h, 2);
    if (vals.e) vals.e.textContent = (r.e >= 0 ? '+' : '') + fmt(r.e, 2);
    if (vals.s) vals.s.textContent = (r.s >= 0 ? '+' : '') + fmt(r.s, 2);
    if (vals.total) vals.total.textContent = (r.total >= 0 ? '+' : '') + fmt(r.total, 2);
  }

  function showReadouts(w) {
    if (read.apex) read.apex.textContent = lastHop ? fmt(lastHop.apex, 3) : '—';
    if (read.peak) read.peak.textContent = lastHop ? fmt(lastHop.peak, 1) : '—';
    if (read.work) read.work.textContent = lastHop ? fmt(lastHop.work, 2) : '—';
    if (read.reward) {
      if (!hopHistory.length) {
        read.reward.textContent = '—';
      } else {
        var sum = 0;
        for (var i = 0; i < hopHistory.length; i++) sum += rewardOf(hopHistory[i].hop, w).total;
        read.reward.textContent = fmt(sum / hopHistory.length, 2);
      }
    }
  }

  var lastStatus = 0;
  function showStatus() {
    if (!status) return;
    var now = Date.now();
    if (now - lastStatus < 240) return;
    lastStatus = now;
    var w = weights();
    var head = 'h* = ' + fmt(w.h, 2) + ' m，w_e = ' + fmt(w.we, 2) +
      ' → h_des = ' + fmt(hdes, 2) + ' m。';
    var body;
    if (hdes < L0) {
      body = 'h_des 已低于腿的自然长度 0.65 m：控制器不再注入能量，机器人站着不动——省力，但高度项归零。';
    } else if (!lastHop) {
      body = '正在建立第一跳……';
    } else {
      var bw = lastHop.peak / (M * G);
      body = '实测顶点 ' + fmt(lastHop.apex, 2) + ' m，峰值力 ' + fmt(lastHop.peak, 0) +
        ' N（' + fmt(bw, 1) + ' 倍体重），单跳能耗 ' + fmt(lastHop.work, 2) +
        ' J。高度项 ' + fmt(lastHop.reward.h, 2) + '，能耗项 ' + fmt(lastHop.reward.e, 2) +
        '，jerk 项 ' + fmt(lastHop.reward.s, 2) + '。';
    }
    status.textContent = head + body;
  }

  function refresh() {
    var w = weights();
    hdes = w.h / (1 + 0.8 * w.we);
    if (out.h) out.h.textContent = fmt(w.h, 2);
    if (out.we) out.we.textContent = fmt(w.we, 2);
    if (out.ws) out.ws.textContent = fmt(w.ws, 2);
    if (lastHop) {
      lastHop.reward = rewardOf(lastHop, w);
      showReward(lastHop.reward);
    } else {
      showReward({ h: 0, e: 0, s: 0, total: 0 });
    }
    showReadouts(w);
    lastStatus = 0;
    showStatus();
  }

  /* ---------- 动效偏好 ---------- */
  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reduced() { return !!(mq && mq.matches); }

  var raf = 0, lastFrame = 0;

  function frame(ts) {
    if (!lastFrame) lastFrame = ts;
    var dt = (ts - lastFrame) / 1000;
    lastFrame = ts;
    if (dt > 0.1) dt = 0.1;
    if (dt > 0) advance(dt);
    draw();
    showReadouts(weights());
    showStatus();
    raf = window.requestAnimationFrame(frame);
  }

  function start() {
    if (raf) return;
    lastFrame = 0;
    raf = window.requestAnimationFrame(frame);
  }

  function stop() {
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
  }

  function restart() {
    reset();
    var w = weights();
    hdes = w.h / (1 + 0.8 * w.we);
    if (reduced()) {
      stop();
      advance(WINDOW);
      refresh();
      draw();
    } else {
      refresh();
      draw();
      start();
    }
  }

  /* 三个滑块：h* 与 w_e 改控制器目标，w_s 只改奖励（控制器是解析的） */
  hEl.addEventListener('input', restart);
  weEl.addEventListener('input', restart);
  wsEl.addEventListener('input', function () {
    refresh();
    draw();
  });

  var resizeTimer = 0;
  function onResize() {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () {
      if (fit()) draw();
    }, 80);
  }

  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('orientationchange', onResize, { passive: true });
  if (typeof window.ResizeObserver === 'function') {
    try {
      var ro = new window.ResizeObserver(function () {
        if (fit()) draw();
      });
      ro.observe(canvas);
    } catch (err) { /* 老浏览器忽略 */ }
  }

  if (mq) {
    var onMotion = function () {
      if (reduced()) {
        stop();
        restart();
      } else {
        restart();
      }
    };
    if (mq.addEventListener) mq.addEventListener('change', onMotion);
    else if (mq.addListener) mq.addListener(onMotion);
  }

  if (!fit()) {
    window.setTimeout(function () { if (fit()) draw(); }, 60);
  }
  restart();
})();
