/* 第 02 章演示 · 两连杆解析逆运动学 -----------------------------------------
   data-demo="ik-2link"；纯 SVG + 原生 DOM，无依赖，不写 window。
   髋为原点，L1 = L2 = 120 SVG 单位 = 0.30 m；足端可拖动，方向键可微调。 */
(function () {
  'use strict';

  var root = document.querySelector('[data-demo="ik-2link"]');
  if (!root) return;

  var svg = root.querySelector('svg');
  if (!svg) return;

  var L1 = 120;                       /* 大腿，SVG 单位 */
  var L2 = 120;                       /* 小腿，SVG 单位 */
  var PX_PER_M = 400;                 /* 120 单位 = 0.30 m */
  var HIP = { x: 250, y: 64 };
  var REACH = L1 + L2;                /* 240 单位 = 0.60 m */
  var DET_MAX = (L1 / PX_PER_M) * (L2 / PX_PER_M);   /* 0.09 m²/rad² */
  var DET_LIMIT = 0.015;              /* 约等于膝角 10° */
  var HOME = { x: 40, y: 220 };       /* 默认足端 (0.10, 0.55) m */
  var STEP = 8;                       /* 方向键步长，0.02 m */
  var motion = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

  var el = {};
  var names = ['thigh', 'shank', 'knee', 'handle', 'ext',
               'arc1', 'arc2', 'label1', 'label2', 'ghost',
               'crossx', 'crossy'];
  for (var i = 0; i < names.length; i += 1) {
    el[names[i]] = svg.querySelector('[data-part="' + names[i] + '"]');
  }

  var out = {
    t1: root.querySelector('[data-readout="theta1"]'),
    t2: root.querySelector('[data-readout="theta2"]'),
    foot: root.querySelector('[data-readout="foot"]'),
    det: root.querySelector('[data-readout="det"]')
  };
  var detCell = root.querySelector('[data-cell="det"]');
  var statusEl = root.querySelector('[data-part="status"]');
  var announceEl = root.querySelector('[data-part="announce"]');
  var branchBtn = root.querySelector('#ch02-ik-branch');
  var straightBtn = root.querySelector('#ch02-ik-straight');
  var resetBtn = root.querySelector('#ch02-ik-reset');
  if (!out.t1 || !out.t2 || !out.foot || !out.det) return;

  var branch = 1;                     /* +1 膝前，-1 膝后 */
  var goal = { x: HOME.x, y: HOME.y };
  var cur = { x: HOME.x, y: HOME.y };
  var dragging = false;
  var frame = 0;
  var announced = '';

  function clampToReach(p) {
    var r = Math.sqrt(p.x * p.x + p.y * p.y);
    if (r > REACH) {
      return { x: p.x * REACH / r, y: p.y * REACH / r, snapped: true, r: r };
    }
    if (r < 0.5) {                    /* 完全折叠：θ2 = ±180°，避开 atan2(0,0) */
      return { x: 0.5, y: 0, snapped: false, r: r };
    }
    return { x: p.x, y: p.y, snapped: false, r: r };
  }

  /* 解析逆解：branch 选 ±acos 分支，返回弧度 */
  function solve(x, y, sign) {
    var c2 = (x * x + y * y - L1 * L1 - L2 * L2) / (2 * L1 * L2);
    c2 = Math.max(-1, Math.min(1, c2));
    var t2 = Math.acos(c2) * sign;
    var t1 = Math.atan2(y, x) - Math.atan2(L2 * Math.sin(t2), L1 + L2 * Math.cos(t2));
    return { t1: t1, t2: t2 };
  }

  function toDeg(rad) {
    var d = (rad * 180 / Math.PI) % 360;
    if (d <= -180) d += 360;
    if (d > 180) d -= 360;
    return d;
  }

  function arcPath(cx, cy, r, a0, a1) {
    var sweep = a1 >= a0 ? 1 : 0;
    var large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
    var x0 = cx + r * Math.cos(a0);
    var y0 = cy + r * Math.sin(a0);
    var x1 = cx + r * Math.cos(a1);
    var y1 = cy + r * Math.sin(a1);
    return 'M' + x0.toFixed(1) + ' ' + y0.toFixed(1) +
      'A' + r + ' ' + r + ' 0 ' + large + ' ' + sweep + ' ' +
      x1.toFixed(1) + ' ' + y1.toFixed(1);
  }

  function setLine(node, x1, y1, x2, y2) {
    if (!node) return;
    node.setAttribute('x1', x1.toFixed(1));
    node.setAttribute('y1', y1.toFixed(1));
    node.setAttribute('x2', x2.toFixed(1));
    node.setAttribute('y2', y2.toFixed(1));
  }

  function setText(node, x, y, text) {
    if (!node) return;
    node.setAttribute('x', x.toFixed(1));
    node.setAttribute('y', y.toFixed(1));
    if (text !== undefined) node.textContent = text;
  }

  function render() {
    var p = clampToReach(cur);
    var s = solve(p.x, p.y, branch);
    var kx = HIP.x + L1 * Math.cos(s.t1);
    var ky = HIP.y + L1 * Math.sin(s.t1);
    var fx = HIP.x + p.x;
    var fy = HIP.y + p.y;

    setLine(el.thigh, HIP.x, HIP.y, kx, ky);
    setLine(el.shank, kx, ky, fx, fy);
    if (el.knee) {
      el.knee.setAttribute('cx', kx.toFixed(1));
      el.knee.setAttribute('cy', ky.toFixed(1));
    }
    if (el.handle) {
      el.handle.setAttribute('cx', fx.toFixed(1));
      el.handle.setAttribute('cy', fy.toFixed(1));
    }
    setLine(el.crossx, fx - 10, fy, fx + 10, fy);
    setLine(el.crossy, fx, fy - 10, fx, fy + 10);

    /* 另一组解：同一足端、膝盖在反侧 */
    if (el.ghost) {
      var alt = solve(p.x, p.y, -branch);
      var akx = HIP.x + L1 * Math.cos(alt.t1);
      var aky = HIP.y + L1 * Math.sin(alt.t1);
      el.ghost.setAttribute('points',
        HIP.x + ',' + HIP.y + ' ' + akx.toFixed(1) + ',' + aky.toFixed(1) +
        ' ' + fx.toFixed(1) + ',' + fy.toFixed(1));
    }

    /* 关节角弧线：θ1 从 +x 量起，θ2 从大腿延长线量起 */
    if (el.ext) {
      setLine(el.ext, kx, ky,
        kx + 26 * Math.cos(s.t1), ky + 26 * Math.sin(s.t1));
    }
    if (el.arc1) el.arc1.setAttribute('d', arcPath(HIP.x, HIP.y, 40, 0, s.t1));
    if (el.arc2) el.arc2.setAttribute('d', arcPath(kx, ky, 30, s.t1, s.t1 + s.t2));
    setText(el.label1,
      HIP.x + 56 * Math.cos(s.t1 / 2),
      HIP.y + 56 * Math.sin(s.t1 / 2));
    setText(el.label2,
      kx + 44 * Math.cos(s.t1 + s.t2 / 2),
      ky + 44 * Math.sin(s.t1 + s.t2 / 2));

    var d1 = toDeg(s.t1);
    var d2 = toDeg(s.t2);
    var det = Math.abs(DET_MAX * Math.sin(s.t2));
    var ratio = det / DET_MAX;
    var nearSing = det < DET_LIMIT;

    out.t1.textContent = d1.toFixed(1);
    out.t2.textContent = d2.toFixed(1);
    out.foot.textContent = (p.x / PX_PER_M).toFixed(2) + ', ' +
      (p.y / PX_PER_M).toFixed(2);
    out.det.textContent = det.toFixed(4);

    if (el.handle) el.handle.classList.toggle('is-snapped', p.snapped);
    if (detCell) detCell.classList.toggle('is-warn', nearSing);
    if (statusEl) statusEl.classList.toggle('is-warn', p.snapped || nearSing);

    var text;
    var cat;
    if (p.snapped) {
      cat = 'unreachable';
      text = '不可达：目标距髋 ' + (p.r / PX_PER_M).toFixed(2) +
        ' m，超过 L1 + L2 = 0.60 m，已吸附到可达域边界。' +
        '边界上膝角 0°、|det J| = 0，正是奇异位形。';
    } else if (nearSing) {
      cat = 'singular';
      text = '接近奇异：膝角 ' + d2.toFixed(1) + '°，|det J| 只剩最大值的 ' +
        (ratio * 100).toFixed(1) + '%。腿伸直时足端沿腿方向的力臂消失，' +
        '同样的地面反力要几倍关节力矩。';
    } else {
      cat = 'ok';
      text = '可达：膝角 ' + d2.toFixed(1) + '°，|det J| 为最大值的 ' +
        (ratio * 100).toFixed(1) + '%。';
    }
    if (statusEl) statusEl.textContent = text;

    /* 只在状态类别跳变时播报，避免拖动时刷屏 */
    if (announceEl && cat !== announced) {
      announced = cat;
      announceEl.textContent = text;
    }
  }

  function stopFrame() {
    if (frame) {
      window.cancelAnimationFrame(frame);
      frame = 0;
    }
  }

  function tick() {
    frame = 0;
    var dx = goal.x - cur.x;
    var dy = goal.y - cur.y;
    if (Math.abs(dx) < 0.4 && Math.abs(dy) < 0.4) {
      cur.x = goal.x;
      cur.y = goal.y;
      render();
      return;
    }
    cur.x += dx * 0.34;
    cur.y += dy * 0.34;
    render();
    frame = window.requestAnimationFrame(tick);
  }

  function setGoal(x, y, instant) {
    goal.x = x;
    goal.y = y;
    if (instant || (motion && motion.matches)) {
      stopFrame();
      cur.x = goal.x;
      cur.y = goal.y;
      render();
      return;
    }
    if (!frame) frame = window.requestAnimationFrame(tick);
  }

  function toLocal(clientX, clientY) {
    if (!svg.getScreenCTM || !svg.createSVGPoint) return null;
    var ctm = svg.getScreenCTM();
    if (!ctm) return null;
    var pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    var q = pt.matrixTransform(ctm.inverse());
    return { x: q.x - HIP.x, y: q.y - HIP.y };
  }

  function onDown(ev) {
    if (typeof ev.button === 'number' && ev.button !== 0) return;
    var p = toLocal(ev.clientX, ev.clientY);
    if (!p) return;
    dragging = true;
    if (svg.setPointerCapture && ev.pointerId !== undefined) {
      try { svg.setPointerCapture(ev.pointerId); } catch (err) { /* 忽略 */ }
    }
    setGoal(p.x, p.y, true);
    ev.preventDefault();
    if (svg.focus) {
      try { svg.focus({ preventScroll: true }); } catch (e2) { svg.focus(); }
    }
  }

  function onMove(ev) {
    if (!dragging) return;
    var p = toLocal(ev.clientX, ev.clientY);
    if (!p) return;
    setGoal(p.x, p.y, true);
    ev.preventDefault();
  }

  function onUp(ev) {
    if (!dragging) return;
    dragging = false;
    if (svg.releasePointerCapture && ev.pointerId !== undefined) {
      try { svg.releasePointerCapture(ev.pointerId); } catch (err) { /* 忽略 */ }
    }
  }

  function nudge(dx, dy) {
    setGoal(goal.x + dx, goal.y + dy, false);
  }

  function onKey(ev) {
    var step = ev.shiftKey ? STEP * 3 : STEP;
    switch (ev.key) {
      case 'ArrowLeft': nudge(-step, 0); break;
      case 'ArrowRight': nudge(step, 0); break;
      case 'ArrowUp': nudge(0, -step); break;
      case 'ArrowDown': nudge(0, step); break;
      case 'Home': setGoal(HOME.x, HOME.y, false); break;
      default: return;
    }
    ev.preventDefault();
  }

  function labelBranch() {
    if (!branchBtn) return;
    branchBtn.textContent = branch > 0 ? '膝盖朝向：前' : '膝盖朝向：后';
    branchBtn.setAttribute('aria-pressed', branch > 0 ? 'true' : 'false');
    branchBtn.setAttribute('aria-label',
      '切换膝盖朝向，当前朝' + (branch > 0 ? '前' : '后'));
  }

  if (branchBtn) {
    branchBtn.addEventListener('click', function () {
      branch = -branch;
      labelBranch();
      render();
    });
  }

  if (straightBtn) {
    straightBtn.addEventListener('click', function () {
      setGoal(0, REACH, false);     /* 恰好落在边界上：θ2 = 0、det J = 0 */
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      branch = 1;
      labelBranch();
      setGoal(HOME.x, HOME.y, false);
    });
  }

  svg.addEventListener('pointerdown', onDown);
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerup', onUp);
  svg.addEventListener('pointercancel', onUp);
  svg.addEventListener('keydown', onKey);

  labelBranch();
  render();
})();
