/* 人形机器人全栈手册 · 全站交互 ---------------------------------------------
   进度条 · 章节高亮 · 移动抽屉 · 入场 · 代码复制 · 迷你目录 · 回到顶部
   契约见 web/DESIGN.md §2.4；样式来自 site.css。IIFE，无依赖，不写 window。 */
(function () {
  'use strict';
  var doc = document;
  var html = doc.documentElement;
  /* 模板与构建器可能各内联一次，只初始化一次 */
  if (html.getAttribute('data-core-ready') === '1') return;
  html.setAttribute('data-core-ready', '1');
  var motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reduced() { return !!(motionQuery && motionQuery.matches); }
  function all(selector, scope) { return Array.prototype.slice.call((scope || doc).querySelectorAll(selector)); }
  function one(selector, scope) { return (scope || doc).querySelector(selector); }
  function closest(node, selector) { return node && typeof node.closest === 'function' ? node.closest(selector) : null; }
  function listen(target, type, handler, options) { if (target) target.addEventListener(type, handler, options || false); }
  function watchMedia(query, handler) {
    if (!query) return;
    if (typeof query.addEventListener === 'function') query.addEventListener('change', handler);
    else if (typeof query.addListener === 'function') query.addListener(handler);
  }
  function scrollTop() { return window.pageYOffset || html.scrollTop || 0; }
  /* reduced-motion 时瞬时跳转；平滑滚动失败也退回瞬时 */
  function glide(target) {
    var numeric = typeof target === 'number';
    if (!numeric && !target) return;
    if (reduced()) return numeric ? window.scrollTo(0, target) : target.scrollIntoView();
    try {
      return numeric ? window.scrollTo({ top: target, behavior: 'smooth' })
        : target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) { return numeric ? window.scrollTo(0, target) : target.scrollIntoView(); }
  }
  /* 读屏播报 */
  var liveRegion = doc.getElementById('live-region');
  var liveTimer = 0;
  function announce(message) {
    if (!liveRegion) return;
    window.clearTimeout(liveTimer);
    liveRegion.textContent = '';
    liveTimer = window.setTimeout(function () { liveRegion.textContent = message; }, 40);
  }
  /* 一个 rAF 循环跑完所有随滚动更新的模块，scroll / resize 共用 */
  var pendingFrame = 0;
  var scrollers = [];
  function runFrame() {
    pendingFrame = 0;
    for (var i = 0; i < scrollers.length; i += 1) scrollers[i]();
  }
  function schedule() {
    if (pendingFrame) return;
    pendingFrame = window.requestAnimationFrame(runFrame);
  }

  /* ---- 1. 进度条：只写 transform，不动布局 ---- */
  function setupProgress() {
    var bar = doc.getElementById('progress-bar');
    if (!bar) return;
    scrollers.push(function () {
      var max = html.scrollHeight - window.innerHeight;
      var ratio = max > 0 ? scrollTop() / max : 0;
      bar.style.transform = 'scaleX(' + Math.max(0, Math.min(1, ratio)).toFixed(4) + ')';
    });
  }

  /* ---- 7. 回到顶部：1.5 屏后出现，下滑让路、上滑回来，隐藏时移出 Tab 顺序 ---- */
  function setupToTop() {
    var link = doc.getElementById('to-top');
    if (!link) return;
    var shown = null, direction = 0, anchorY = scrollTop();
    scrollers.push(function () {
      var y = scrollTop();
      /* 6px 死区：避免触控板/像素级抖动反复翻转 */
      if (Math.abs(y - anchorY) > 6) {
        direction = y > anchorY ? 1 : -1;
        anchorY = y;
      }
      var nearTop = y < window.innerHeight * 1.4;
      var next = !nearTop && direction < 0;
      /* 向下阅读时收起，只有上滑才出现；顶部附近保持隐藏 */
      if (next !== shown) {
        shown = next;
        link.setAttribute('tabindex', next ? '0' : '-1');
        link.setAttribute('aria-hidden', next ? 'false' : 'true');
      }
      link.classList.toggle('is-shown', next);
      link.classList.toggle('is-scroll-hidden', !next);
    });
    listen(link, 'click', function (event) { event.preventDefault(); glide(0); });
  }

  /* ---- 4. 入场：只加一次 .is-visible ---- */
  function setupReveal() {
    var items = all('[data-reveal]');
    if (!items.length) return;
    function show(el) { el.classList.add('is-visible'); }
    if (reduced() || !('IntersectionObserver' in window)) { items.forEach(show); return; }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { show(entry.target); observer.unobserve(entry.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    items.forEach(function (el) { observer.observe(el); });
    /* 阅读中途切到「减弱动效」时，剩余元素直接可见 */
    watchMedia(motionQuery, function () {
      if (reduced()) items.forEach(function (el) { observer.unobserve(el); show(el); });
    });
  }

  /* ---- 5. 代码复制：包 .code-block、插按钮，点击委托到 document ---- */
  var copyTimers = typeof WeakMap === 'function' ? new WeakMap() : null;
  function setCopyLabel(button, label, copied) { button.textContent = label; button.classList.toggle('is-copied', !!copied); }
  function restoreCopyLabel(button, delay) {
    var old = copyTimers ? copyTimers.get(button) : 0;
    if (old) window.clearTimeout(old);
    var timer = window.setTimeout(function () { setCopyLabel(button, '复制', false); }, delay);
    if (copyTimers) copyTimers.set(button, timer);
  }
  function selectCode(node) {
    var selection = window.getSelection ? window.getSelection() : null;
    if (!selection || !node) return false;
    try {
      var range = doc.createRange();
      range.selectNodeContents(node);
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    } catch (err) { return false; }
  }
  function legacyCopy(text) {
    if (typeof doc.execCommand !== 'function' || !doc.body) return false;
    var area = doc.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', 'readonly');
    area.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    doc.body.appendChild(area);
    var ok = false;
    try { area.select(); ok = doc.execCommand('copy'); } catch (err) { ok = false; }
    doc.body.removeChild(area);
    return ok;
  }
  function copyCode(button, code) {
    if (!button || !code) return;
    var text = code.textContent;
    function settle(ok) {
      if (ok) {
        setCopyLabel(button, '已复制', true); announce('代码已复制到剪贴板');
        restoreCopyLabel(button, 1500);
        return;
      }
      /* 剪贴板不可用：退到手动选择，至少让用户能按 Ctrl+C */
      var selected = selectCode(code);
      setCopyLabel(button, selected ? '按 Ctrl+C' : '复制失败', false);
      announce(selected ? '剪贴板不可用，已选中代码，请按 Ctrl+C 复制' : '复制失败，请手动选择代码');
      restoreCopyLabel(button, 2000);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try { navigator.clipboard.writeText(text).then(function () { settle(true); }, function () { settle(legacyCopy(text)); }); return; }
      catch (err) { /* 降级 */ }
    }
    settle(legacyCopy(text));
  }
  function enhanceCodeBlock(pre) {
    if (!pre || !pre.parentNode) return;
    var block = pre.parentNode;
    if (!block.classList || !block.classList.contains('code-block')) {
      block = doc.createElement('div');
      block.className = 'code-block';
      pre.parentNode.insertBefore(block, pre);
      block.appendChild(pre);
    }
    var lang = pre.getAttribute('data-lang');
    if (lang) block.setAttribute('data-lang', lang);
    if (block.querySelector('.copy-btn')) return;
    var button = doc.createElement('button');
    button.type = 'button';
    button.className = 'copy-btn';
    button.textContent = '复制';
    button.setAttribute('aria-label', '复制代码到剪贴板' + (lang ? '（' + lang + '）' : ''));
    block.appendChild(button);
  }
  function setupCode() {
    var blocks = all('pre[data-lang]');
    if (!blocks.length) return;
    blocks.forEach(enhanceCodeBlock);
    listen(doc, 'click', function (event) {
      var button = closest(event.target, '.copy-btn');
      if (!button) return;
      var block = button.parentNode;
      copyCode(button, block ? block.querySelector('pre code') || block.querySelector('pre') : null);
    });
  }

  /* ---- 2 + 6. 章节、迷你目录与当前小节 ---- */
  var chapters = [], navLinks = [], miniTocs = {}, miniActive = null;
  var currentId = '', currentChapter = null;
  var wideQuery = window.matchMedia ? window.matchMedia('(min-width: 1200px)') : null;
  function isWide() { return wideQuery ? wideQuery.matches : window.innerWidth >= 1200; }
  function hasOwn(object, key) { return Object.prototype.hasOwnProperty.call(object, key); }
  function setMiniActive(item) {
    if (item === miniActive) return;
    if (miniActive) {
      miniActive.link.classList.remove('is-current');
      miniActive.link.removeAttribute('aria-current');
      miniActive.link.style.color = '';
    }
    miniActive = item || null;
    if (!miniActive) return;
    miniActive.link.classList.add('is-current');
    miniActive.link.setAttribute('aria-current', 'location');
    miniActive.link.style.color = 'var(--accent)'; /* site.css 暂无该状态规则 */
  }
  function updateMini() {
    if (!currentChapter) return;
    var data = miniTocs[currentChapter.id];
    if (!data || data.nav.hidden) return;
    var line = window.innerHeight * 0.3, active = null;
    data.items.forEach(function (item) { if (item.heading.getBoundingClientRect().top <= line) active = item; });
    setMiniActive(active);
  }
  function applyMiniVisibility() {
    var wide = isWide();
    for (var id in miniTocs) if (hasOwn(miniTocs, id)) miniTocs[id].nav.hidden = !wide;
  }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; });
  }
  function buildMiniToc(chapter) {
    if (!chapter || !chapter.id) return;
    /* 章标题本身不算小节；已有目录会被重建，保证 h2/h3 都进来且不重复 */
    var heads = all('h2, h3', chapter).filter(function (heading) {
      return !closest(heading, '.chapter-head') && !closest(heading, '.mini-toc') && (heading.textContent || '').trim();
    });
    if (heads.length < 2) return;
    all('.mini-toc', chapter).forEach(function (old) { if (old.parentNode === chapter) chapter.removeChild(old); });
    var number = chapter.getAttribute('data-chapter') || (chapter.id.match(/\d+/) || ['00'])[0];
    var section = 0;
    /* 先分配 id，再按「节 + 其子项」分组：一个组是不可拆块，栏目按列优先读取 */
    heads.forEach(function (heading, index) {
      if (heading.id) return;
      var base = chapter.id + '-sec-' + (index + 1), id = base, suffix = 2;
      while (doc.getElementById(id)) id = base + '-' + (suffix++);
      heading.id = id;
    });
    var groups = [], current = null;
    heads.forEach(function (heading) {
      var sub = heading.tagName === 'H3';
      if (!sub) section += 1;
      var link = '<a href="#' + escapeHtml(heading.id) + '"' + (sub ? ' class="mt-sub"' : '') +
        '><span class="mt-num">' + (sub ? '–' : number + '.' + section) + '</span><span class="mt-title">' +
        escapeHtml((heading.textContent || '').trim()) + '</span></a>';
      if (sub && current) {
        current.subs.push(link);
      } else {
        current = { main: link, subs: [] };
        groups.push(current);
      }
    });
    var rows = groups.map(function (group) {
      var sublist = group.subs.length
        ? '<ol class="mt-subs">' + group.subs.map(function (link) { return '<li>' + link + '</li>'; }).join('') + '</ol>'
        : '';
      return '<li class="mt-group">' + group.main + sublist + '</li>';
    });
    var nav = doc.createElement('nav');
    nav.className = 'mini-toc';
    nav.setAttribute('aria-label', '本章目录');
    nav.innerHTML = '<p class="mini-toc-kicker">本章目录 <span>IN THIS CHAPTER</span></p><ol class="mt-list">' + rows.join('') + '</ol>';
    var head = one('.chapter-head', chapter);
    chapter.insertBefore(nav, head && head.parentNode === chapter ? head.nextSibling : chapter.firstChild);
    var links = all('a', nav);
    miniTocs[chapter.id] = { nav: nav, items: heads.map(function (heading, index) { return { link: links[index], heading: heading }; }) };
  }
  function setupMiniToc() {
    if (!chapters.length) return;
    chapters.forEach(buildMiniToc);
    if (!Object.keys(miniTocs).length) return;
    applyMiniVisibility();
    scrollers.push(updateMini);
    watchMedia(wideQuery, function () { applyMiniVisibility(); updateMini(); });
    listen(doc, 'click', function (event) {
      var link = closest(event.target, '.mini-toc a[href^="#"]');
      if (!link) return;
      var target = doc.getElementById(link.getAttribute('href').slice(1));
      if (!target) return;
      event.preventDefault();
      glide(target);
      var chapter = closest(link, 'section.chapter');
      var data = chapter ? miniTocs[chapter.id] : null;
      if (data) data.items.forEach(function (item) { if (item.link === link) setMiniActive(item); });
      try { window.history.replaceState(null, '', link.getAttribute('href')); } catch (err) { /* 忽略 */ }
    });
  }
  /* ---- 8. 参考文献：给没有小标题的章末文献清单补一个可见 eyebrow ---- */
  function setupReferenceTitles() {
    function addKicker(list) {
      if (!list || !list.classList || !list.classList.contains('paper-list')) return;
      if (list.previousElementSibling && list.previousElementSibling.classList.contains('refs-kicker')) return;
      var title = doc.createElement('p');
      title.className = 'kicker refs-kicker';
      title.innerHTML = '参考文献 <span>References</span>';
      list.parentNode.insertBefore(title, list);
    }
    function hasReferenceHeading(list) {
      var node = list.previousElementSibling;
      for (var i = 0; node && i < 6; i += 1, node = node.previousElementSibling) {
        if (/^H[2-4]$/.test(node.tagName)) {
          return /(延伸阅读|论文|文献|阅读|references?)/i.test(node.textContent || '');
        }
      }
      return false;
    }
    /* 两种章末顺序：要点卡 → 文献（ch03/05/07），文献 → 要点卡（ch06） */
    all('.takeaways').forEach(function (take) { addKicker(take.nextElementSibling); });
    all('.paper-list').forEach(function (list) {
      var next = list.nextElementSibling;
      if (next && next.classList && next.classList.contains('takeaways') && !hasReferenceHeading(list)) addKicker(list);
    });
  }

  /* ---- 8b. 引导语统一：ch-03/05/07 的两种旧措辞收束为一种 ---- */
  function setupPromptWording() {
    all('.chapter p').forEach(function (p) {
      var first = p.firstChild;
      if (!first || first.nodeType !== 3) return;
      var text = first.nodeValue;
      if (/^\s*这一节解决(?:的问题|一个问题)：/.test(text)) {
        first.nodeValue = text.replace(/^(\s*)这一节解决(?:的问题|一个问题)：/, '$1这一节解决什么问题：');
      }
    });
  }

  /* ---- 9. 横向溢出提示：只在真实溢出时出现，随宽度变化收放 ---- */
  function setupScrollHints() {
    var pairs = [];
    function makeHint(el, text) {
      var next = el.nextElementSibling;
      if (next && next.classList && next.classList.contains('scroll-hint')) return next;
      var hint = doc.createElement('p');
      hint.className = 'scroll-hint';
      hint.textContent = text;
      hint.hidden = true;
      el.parentNode.insertBefore(hint, el.nextSibling);
      return hint;
    }
    function overflow(el) { return el.scrollWidth > el.clientWidth + 2; }
    all('.table-wrap').forEach(function (wrap) {
      if (!wrap.querySelector('table')) return;
      var hint = makeHint(wrap, '↔ 表格可横向滑动');
      pairs.push({ el: wrap, hint: hint, test: wrap });
    });
    all('.code-block').forEach(function (block) {
      var pre = block.querySelector('pre');
      if (!pre) return;
      var hint = makeHint(block, '↔ 代码可横向滑动');
      var fade = function () {
        var over = overflow(pre);
        block.classList.toggle('is-scrollable', over);
        block.classList.toggle('is-at-end', over && pre.scrollLeft + pre.clientWidth >= pre.scrollWidth - 2);
      };
      listen(pre, 'scroll', fade, { passive: true });
      pairs.push({ el: block, hint: hint, test: pre, extra: fade });
    });
    function refresh() {
      pairs.forEach(function (pair) {
        var over = overflow(pair.test);
        pair.hint.hidden = !over;
        pair.el.classList.toggle('is-scrollable', over);
        if (pair.extra) pair.extra();
      });
    }
    refresh();
    listen(window, 'resize', refresh);
    if (typeof window.ResizeObserver === 'function') {
      var observer = new window.ResizeObserver(refresh);
      pairs.forEach(function (pair) { observer.observe(pair.el); });
    }
  }

  /* ---- 10. 数字与单位/区间不拆行：在正文文本层包 .nb（不改文案） ---- */
  function setupNoBreak() {
    var UNIT = 'kg·m²|kg·m|kW·h|N·m|m/s²|m/s|rad/s|kWh|MHz|GHz|kHz|Wh|kN|kW|DOF|rpm|°C|kg|mg|km|cm|mm|µm|μm|nm|Hz|ms|µs|μs|min|g|t|m|s|h|N|W|V|A';
    /* 单元必须整体分组，否则上面的 | 会把整条正则拆散，单个字母 s/g/t 也会被包起来 */
    var U = '(?:' + UNIT + ')';
    var pattern = new RegExp(
      '(\\d+(?:[.,]\\d+)?\\s*' + U + '\\s*[\\/／]\\s*\\d+(?:[.,]\\d+)?\\s*' + U + ')' +
      '|(\\d+(?:[.,]\\d+)?\\s*[–—-]\\s*\\d+(?:[.,]\\d+)?(?:\\s*' + U + ')?)' +
      '|(\\d+(?:[.,]\\d+)?)\\s+(' + U + ')' +
      '|(\\d+(?:[.,]\\d+)?\\s*[\\/／]\\s*\\d+(?:[.,]\\d+)?)' +
      '|(\\d+(?:[.,]\\d+)?\\s*[\\/／]\\s*' + U + ')',
      'g'
    );
    var skipTags = { PRE: 1, CODE: 1, KBD: 1, SAMP: 1, SCRIPT: 1, STYLE: 1, SVG: 1, TEXTAREA: 1 };
    function skip(node) {
      var el = node.parentElement;
      for (var depth = 0; el && depth < 8; depth += 1) {
        /* SVG 元素的 tagName 是小写（text/svg），必须统一大小写再判断 */
        if (skipTags[el.tagName.toUpperCase()]) return true;
        if (el.classList && (el.classList.contains('formula') || el.classList.contains('formula-inline') ||
            el.classList.contains('demo') || el.classList.contains('nb') ||
            /* 表格有自己的列宽约束：不在这里加 nowrap，避免把整张表撑宽 */
            el.classList.contains('table-wrap'))) return true;
        el = el.parentElement;
      }
      return false;
    }
    function wrap(node) {
      var text = node.nodeValue;
      if (!text || !pattern.test(text)) return;
      pattern.lastIndex = 0;
      var frag = doc.createDocumentFragment(), last = 0, match;
      while ((match = pattern.exec(text))) {
        if (match.index > last) frag.appendChild(doc.createTextNode(text.slice(last, match.index)));
        var span = doc.createElement('span');
        span.className = 'nb';
        span.textContent = match[0];
        frag.appendChild(span);
        last = match.index + match[0].length;
      }
      if (!last) return;
      if (last < text.length) frag.appendChild(doc.createTextNode(text.slice(last)));
      node.parentNode.replaceChild(frag, node);
    }
    var walker = doc.createTreeWalker(doc.querySelector('main') || doc.body, 4 /* NodeFilter.SHOW_TEXT */);
    var nodes = [];
    while (walker.nextNode()) {
      var node = walker.currentNode;
      if (node.nodeValue && node.nodeValue.trim() && node.parentElement && !skip(node)) nodes.push(node);
    }
    nodes.forEach(wrap);
  }

  function setCurrent(id) {
    if (!id || id === currentId) return;
    currentId = id;
    currentChapter = doc.getElementById(id);
    navLinks.forEach(function (link) {
      var active = link.getAttribute('href') === '#' + id;
      link.classList.toggle('is-current', active);
      if (active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
    updateMini();
  }
  /* 没有 IntersectionObserver 时的兜底：按视口 38% 处的那条线判定 */
  function computeCurrent() {
    var line = window.innerHeight * 0.38, pick = null;
    chapters.forEach(function (chapter) { if (chapter.getBoundingClientRect().top <= line) pick = chapter; });
    var max = html.scrollHeight - window.innerHeight;
    if (max > 0 && scrollTop() >= max - 2) pick = chapters[chapters.length - 1];
    if (pick) setCurrent(pick.id);
  }
  function setupChapters() {
    if (!chapters.length) return;
    navLinks = all('#nav-rail a.nav-link[href^="#ch-"], #toc-drawer a.nav-link[href^="#ch-"], .quick-link[href^="#ch-"]');
    if (scrollTop() < 4) setCurrent(chapters[0].id);
    if (!('IntersectionObserver' in window)) { scrollers.push(computeCurrent); return; }
    /* 视口 18%–40% 的横带：章节顶部进入即视为「正在读」。
       相邻两章会短暂同时命中，取文档中靠后的那个，避免边界抖动。 */
    var lit = [];
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var at = lit.indexOf(entry.target);
        if (entry.isIntersecting && at === -1) lit.push(entry.target);
        else if (!entry.isIntersecting && at !== -1) lit.splice(at, 1);
      });
      var pick = null;
      chapters.forEach(function (chapter) { if (lit.indexOf(chapter) !== -1) pick = chapter; });
      if (pick) setCurrent(pick.id);
    }, { rootMargin: '-18% 0px -60% 0px', threshold: 0 });
    chapters.forEach(function (chapter) { observer.observe(chapter); });
    /* 滚到文档末尾时，最后一章可能已离开横带 */
    scrollers.push(function () {
      var max = html.scrollHeight - window.innerHeight;
      if (max > 0 && scrollTop() >= max - 2) setCurrent(chapters[chapters.length - 1].id);
    });
  }

  /* ---- 3. 移动端抽屉 ---- */
  function setupDrawer() {
    var toggle = doc.getElementById('menu-toggle');
    var drawer = doc.getElementById('toc-drawer');
    var panel = drawer ? one('.drawer-panel', drawer) : null;
    if (!toggle || !drawer || !panel) return;
    panel.setAttribute('tabindex', '-1');
    var lastFocus = null;
    function isOpen() { return doc.body.classList.contains('is-drawer-open'); }
    function focusable() {
      return all('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])', panel).filter(function (el) { return el.getClientRects().length > 0; });
    }
    function onKeydown(event) {
      if (!isOpen()) { doc.removeEventListener('keydown', onKeydown, true); return; }
      if (event.key === 'Escape' || event.key === 'Esc') { event.preventDefault(); closeDrawer(true); return; }
      if (event.key !== 'Tab') return;
      var list = focusable();
      if (!list.length) { event.preventDefault(); panel.focus(); return; }
      var first = list[0], last = list[list.length - 1], active = doc.activeElement;
      if (!panel.contains(active)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
      else if (event.shiftKey && active === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
    }
    function openDrawer() {
      if (isOpen()) return;
      lastFocus = doc.activeElement;
      doc.body.classList.add('is-drawer-open');
      toggle.setAttribute('aria-expanded', 'true');
      drawer.setAttribute('aria-hidden', 'false');
      doc.addEventListener('keydown', onKeydown, true);
      window.requestAnimationFrame(function () {
        if (isOpen()) (panel.querySelector('a[href]') || panel).focus({ preventScroll: true });
      });
    }
    function closeDrawer(returnFocus) {
      if (!isOpen()) return;
      doc.body.classList.remove('is-drawer-open');
      toggle.setAttribute('aria-expanded', 'false');
      doc.removeEventListener('keydown', onKeydown, true);
      var target = lastFocus && doc.contains(lastFocus) ? lastFocus : toggle;
      var active = doc.activeElement;
      lastFocus = null;
      /* 先把焦点移出，再设 aria-hidden，避免隐藏仍带焦点的子树 */
      if (returnFocus && target && target.focus) target.focus();
      else if (active && panel.contains(active) && active.blur) active.blur();
      drawer.setAttribute('aria-hidden', 'true');
    }
    /* 捕获阶段接管：即便旧脚本也绑了这个按钮，也不会出现一开一关 */
    listen(doc, 'click', function (event) {
      if (!closest(event.target, '#menu-toggle')) return;
      event.preventDefault();
      event.stopPropagation();
      if (isOpen()) closeDrawer(true);
      else openDrawer();
    }, true);
    listen(drawer, 'click', function (event) {
      if (!event.target) return;
      if (closest(event.target, '[data-drawer-close]') || !panel.contains(event.target)) closeDrawer(true);
      else if (closest(event.target, 'a[href^="#"]')) closeDrawer(false);
    });
    watchMedia(wideQuery, function () { if (isWide() && isOpen()) closeDrawer(false); });
  }

  /* ------------------------------------------------------------------------
     图内一次性动画：进入视口时重播
     曲线生长等 forwards 动画在元素进入视口 35% 时强制重启。
     prefers-reduced-motion 下跳过。
     ------------------------------------------------------------------------ */
  function setupReplayAnimations() {
    var nodes = all('[data-replay-on-view]');
    if (!nodes.length) return;
    if (!('IntersectionObserver' in window)) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        el.style.animation = 'none';
        void el.getBoundingClientRect(); // 强制重排
        el.style.animation = '';
      });
    }, { threshold: 0.35 });

    nodes.forEach(function (el) { io.observe(el); });
  }

  /* ---- 启动 ---- */
  function init() {
    if (!doc.body) return;
    chapters = all('section.chapter[id]');
    setupProgress(); setupToTop(); setupPromptWording(); setupNoBreak();
    setupReveal(); setupCode(); setupScrollHints(); setupReferenceTitles();
    setupMiniToc(); setupChapters(); setupDrawer(); setupReplayAnimations();
    listen(window, 'scroll', schedule, { passive: true });
    listen(window, 'resize', schedule);
    schedule();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();
})();