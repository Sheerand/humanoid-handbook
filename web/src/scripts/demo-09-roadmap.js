/* 09 章演示 · 12 周清单 ------------------------------------------------------
   契约：IIFE，无库，不写 window；localStorage 不可用时退回本次会话。
   数据键固定为 humanoid-roadmap-v1，值为 12 个 0/1 的 JSON 数组。 */
(function () {
  'use strict';

  var root = document.querySelector('[data-demo="roadmap-check"]');
  if (!root) return;
  if (root.getAttribute('data-rm-ready') === '1') return;
  root.setAttribute('data-rm-ready', '1');

  var KEY = 'humanoid-roadmap-v1';
  /* 与图 9.2 的每周总学时一致 */
  var HOURS = [7, 7, 7, 8, 6, 8, 7, 8, 7, 7, 7, 8];

  var items = Array.prototype.slice.call(root.querySelectorAll('.rm-item'));
  var N = items.length;
  if (!N) return;

  var inputs = [];
  var i;
  for (i = 0; i < N; i += 1) {
    inputs.push(items[i].querySelector('input[type="checkbox"]'));
  }

  var fill = root.querySelector('[data-role="fill"]');
  var bar = root.querySelector('[data-role="bar"]');
  var doneEl = root.querySelector('[data-role="done"]');
  var nextEl = root.querySelector('[data-role="next"]');
  var allEl = root.querySelector('[data-role="all"]');
  var statusEl = root.querySelector('[data-role="status"]');
  var resetBtn = root.querySelector('[data-role="reset"]');
  var outDone = root.querySelector('[data-readout="done"]');
  var outHours = root.querySelector('[data-readout="hours"]');
  var outLeft = root.querySelector('[data-readout="left"]');

  var state = [];
  for (i = 0; i < N; i += 1) state.push(false);

  /* 探测本机存储：隐私模式或配额满时 setItem 会抛，直接退回内存 */
  var store = null;
  try {
    var probe = '__rm_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    store = window.localStorage;
  } catch (err) {
    store = null;
  }

  function load() {
    if (!store) return;
    var raw = null;
    try {
      raw = store.getItem(KEY);
    } catch (err) {
      return;
    }
    if (!raw) return;
    var saved = null;
    try {
      saved = JSON.parse(raw);
    } catch (err) {
      return;
    }
    if (!saved || typeof saved.length !== 'number') return;
    for (var k = 0; k < N; k += 1) {
      state[k] = saved[k] === 1 || saved[k] === true;
    }
  }

  function save() {
    if (!store) return;
    var packed = [];
    for (var k = 0; k < N; k += 1) packed.push(state[k] ? 1 : 0);
    try {
      store.setItem(KEY, JSON.stringify(packed));
    } catch (err) {
      /* 写入失败不影响当前会话 */
    }
  }

  function announce(message) {
    if (statusEl) statusEl.textContent = message;
  }

  function render() {
    var done = 0;
    var hours = 0;
    var nextIndex = -1;

    for (var k = 0; k < N; k += 1) {
      var on = state[k] === true;
      if (inputs[k]) inputs[k].checked = on;
      if (on) {
        done += 1;
        hours += HOURS[k] || 0;
      } else if (nextIndex < 0) {
        nextIndex = k;
      }
      if (items[k]) {
        if (on) items[k].classList.add('is-done');
        else items[k].classList.remove('is-done');
      }
    }

    if (fill) fill.style.width = (done / N * 100).toFixed(1) + '%';
    if (bar) {
      bar.setAttribute('aria-valuenow', String(done));
      bar.setAttribute('aria-valuetext', done + ' / ' + N + ' 周');
    }
    if (doneEl) doneEl.textContent = String(done);
    if (outDone) outDone.textContent = String(done);
    if (outHours) outHours.textContent = String(hours);
    if (outLeft) outLeft.textContent = String(N - done);

    if (nextEl) {
      if (nextIndex < 0) {
        nextEl.textContent = '下一步：进入 6 个月阶段 · 平面行走';
      } else {
        var label = items[nextIndex].querySelector('.rm-task');
        nextEl.textContent = '下一步：第 ' + (nextIndex + 1) + ' 周 · '
          + (label ? label.textContent : '');
      }
    }

    if (allEl) {
      if (done === N) allEl.removeAttribute('hidden');
      else allEl.setAttribute('hidden', '');
    }
  }

  function bindChange(index) {
    return function () {
      state[index] = inputs[index].checked === true;
      save();
      render();
      announce(state[index]
        ? '第 ' + (index + 1) + ' 周已完成，共 ' + countDone() + ' / ' + N + ' 周'
        : '第 ' + (index + 1) + ' 周已取消');
    };
  }

  function countDone() {
    var n = 0;
    for (var k = 0; k < N; k += 1) if (state[k]) n += 1;
    return n;
  }

  for (i = 0; i < N; i += 1) {
    if (inputs[i]) inputs[i].addEventListener('change', bindChange(i));
  }

  /* 重置要两次点击：第一次进入待确认，4 秒无操作自动取消 */
  var armed = false;
  var armTimer = 0;

  function disarm() {
    armed = false;
    window.clearTimeout(armTimer);
    if (resetBtn) {
      resetBtn.textContent = '重置进度';
      resetBtn.classList.remove('is-armed');
      resetBtn.setAttribute('aria-label', '重置进度');
    }
  }

  function arm() {
    armed = true;
    if (resetBtn) {
      resetBtn.textContent = '再点一次确认重置';
      resetBtn.classList.add('is-armed');
      resetBtn.setAttribute('aria-label', '再点一次确认重置进度，4 秒后自动取消');
    }
    armTimer = window.setTimeout(disarm, 4000);
    announce('再点一次确认重置，4 秒后自动取消');
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      if (!armed) {
        arm();
        return;
      }
      disarm();
      for (var k = 0; k < N; k += 1) state[k] = false;
      save();
      render();
      announce('进度已重置');
    });
  }

  root.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && armed) {
      disarm();
      announce('已取消重置');
    }
  });

  /* 减少动效：不靠 CSS 兜底，JS 也把过渡关掉 */
  var motion = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

  function applyMotion() {
    if (!fill) return;
    fill.style.transition = (motion && motion.matches) ? 'none' : '';
  }

  if (motion) {
    if (typeof motion.addEventListener === 'function') {
      motion.addEventListener('change', applyMotion);
    } else if (typeof motion.addListener === 'function') {
      motion.addListener(applyMotion);
    }
  }

  /* 另一个标签页改了同一份进度时同步过来 */
  if (store) {
    window.addEventListener('storage', function (ev) {
      if (!ev || ev.key !== KEY) return;
      load();
      render();
    });
  }

  load();
  applyMotion();
  render();
  if (!store) {
    var hint = root.querySelector('.rm-hint');
    if (hint) hint.textContent = '本机存储不可用（隐私模式或配额已满），进度只在本次会话有效。';
    announce('本机存储不可用，进度只在本次会话有效');
  }
})();
