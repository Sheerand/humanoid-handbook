/* ==========================================================================
   人形机器人全栈手册 · 外壳交互
   --------------------------------------------------------------------------
   只做五件事：
   1. 顶部阅读进度（#progress-bar 只改变换）
   2. 章节滚动高亮（#nav-rail / .quick-link / 抽屉）
   3. 移动端目录抽屉（#menu-toggle → body.is-drawer-open，含焦点陷阱）
   4. 代码复制按钮、每章 mini-toc、入场 [data-reveal]、#to-top
   5. 给章节演示脚本一个极小的注册接口 window.RoboDemo

   依赖 DOM 契约，不依赖任何库。
   ========================================================================== */

(function () {
  'use strict';

  var doc = document;
  var body = doc.body;
  var reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  function prefersReduced() {
    return reduceQuery && reduceQuery.matches;
  }

  var live = doc.getElementById('live-region');
  var liveTimer = null;

  function announce(message) {
    if (!live) return;
    window.clearTimeout(liveTimer);
    live.textContent = '';
    liveTimer = window.setTimeout(function () {
      live.textContent = message;
    }, 40);
  }

  /* ------------------------------------------------------------------------
     进度条与章节高亮
     ------------------------------------------------------------------------ */

  var progressBar = doc.getElementById('progress-bar');
  var toTop = doc.getElementById('to-top');
  var chapters = Array.prototype.slice.call(doc.querySelectorAll('section.chapter[id]'));
  var navLinks = Array.prototype.slice.call(
    doc.querySelectorAll('a.nav-link[href^="#ch-"], a.quick-link[href^="#ch-"]')
  );
  var currentId = '';
  var scrollQueued = false;

  function setCurrent(id) {
    if (!id || id === currentId) return;
    currentId = id;
    navLinks.forEach(function (link) {
      var on = link.getAttribute('href') === '#' + id;
      link.classList.toggle('is-current', on);
      if (on) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
  }

  function updateOnScroll() {
    var y = window.pageYOffset || doc.documentElement.scrollTop || 0;
    var docEl = doc.documentElement;
    var max = docEl.scrollHeight - window.innerHeight;

    if (progressBar) {
      var ratio = max > 0 ? Math.min(1, Math.max(0, y / max)) : 0;
      progressBar.style.transform = 'scaleX(' + ratio + ')';
    }

    if (toTop) toTop.classList.toggle('is-shown', y > 620);

    if (chapters.length) {
      var probe = y + Math.min(window.innerHeight * 0.3, 240);
      var current = chapters[0].id;
      for (var i = 0; i < chapters.length; i++) {
        var top = chapters[i].getBoundingClientRect().top + y;
        if (top <= probe) current = chapters[i].id;
      }
      if (max > 0 && y >= max - 2) current = chapters[chapters.length - 1].id;
      setCurrent(current);
    }
    scrollQueued = false;
  }

  function onScroll() {
    if (scrollQueued) return;
    scrollQueued = true;
    window.requestAnimationFrame(updateOnScroll);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);

  if (toTop) {
    toTop.addEventListener('click', function (event) {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: prefersReduced() ? 'auto' : 'smooth' });
    });
  }

  /* ------------------------------------------------------------------------
     移动端抽屉目录
     ------------------------------------------------------------------------ */

  var menuToggle = doc.getElementById('menu-toggle');
  var drawer = doc.getElementById('toc-drawer');
  var drawerPanel = drawer ? drawer.querySelector('.drawer-panel') : null;
  var drawerClose = drawer ? drawer.querySelector('[data-drawer-close]') : null;
  var drawerOpen = false;
  var lastFocused = null;

  function drawerFocusables() {
    if (!drawerPanel) return [];
    return Array.prototype.slice
      .call(drawerPanel.querySelectorAll('a[href], button:not([disabled])'))
      .filter(function (el) {
        return el.offsetParent !== null && el.getClientRects().length > 0;
      });
  }

  function onDrawerKeydown(event) {
    if (event.key === 'Escape' || event.key === 'Esc') {
      event.preventDefault();
      closeDrawer();
      return;
    }
    if (event.key !== 'Tab') return;

    var focusables = drawerFocusables();
    if (!focusables.length) return;
    var first = focusables[0];
    var last = focusables[focusables.length - 1];

    if (event.shiftKey && doc.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && doc.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function openDrawer() {
    if (!drawer || drawerOpen) return;
    drawerOpen = true;
    lastFocused = doc.activeElement;
    body.classList.add('is-drawer-open');
    if (menuToggle) menuToggle.setAttribute('aria-expanded', 'true');
    drawer.setAttribute('aria-hidden', 'false');
    doc.addEventListener('keydown', onDrawerKeydown);
    window.setTimeout(function () {
      var focusables = drawerFocusables();
      (focusables[0] || drawerClose || drawerPanel).focus();
    }, prefersReduced() ? 0 : 80);
  }

  function closeDrawer(returnFocus) {
    if (!drawer || !drawerOpen) return;
    drawerOpen = false;
    body.classList.remove('is-drawer-open');
    if (menuToggle) menuToggle.setAttribute('aria-expanded', 'false');
    drawer.setAttribute('aria-hidden', 'true');
    doc.removeEventListener('keydown', onDrawerKeydown);
    if (returnFocus !== false) {
      var target = lastFocused && doc.contains(lastFocused) ? lastFocused : menuToggle;
      if (target) target.focus();
    }
  }

  if (menuToggle && drawer) {
    menuToggle.addEventListener('click', function () {
      if (drawerOpen) closeDrawer();
      else openDrawer();
    });

    if (drawerClose) drawerClose.addEventListener('click', function () { closeDrawer(); });

    drawer.addEventListener('click', function (event) {
      if (event.target === drawer) closeDrawer();
      var link = event.target.closest ? event.target.closest('a[href^="#"]') : null;
      if (link) closeDrawer(false);
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth >= 1200 && drawerOpen) closeDrawer(false);
    });
  }

  /* ------------------------------------------------------------------------
     代码块：包裹容器 + 复制按钮
     ------------------------------------------------------------------------ */

  function legacyCopy(text) {
    var area = doc.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', 'readonly');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    area.style.opacity = '0';
    doc.body.appendChild(area);
    area.select();
    var ok = false;
    try {
      ok = doc.execCommand('copy');
    } catch (err) {
      ok = false;
    }
    doc.body.removeChild(area);
    return ok;
  }

  function copyText(text) {
    return new Promise(function (resolve, reject) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(resolve, function () {
          if (legacyCopy(text)) resolve();
          else reject(new Error('copy failed'));
        });
      } else if (legacyCopy(text)) {
        resolve();
      } else {
        reject(new Error('copy failed'));
      }
    });
  }

  function enhanceCodeBlock(pre) {
    if (!pre || !pre.parentNode) return;
    if (pre.parentElement && pre.parentElement.classList.contains('code-block')) return;

    var lang = pre.getAttribute('data-lang') || 'code';
    var block = doc.createElement('div');
    block.className = 'code-block';
    block.setAttribute('data-lang', lang);

    pre.parentNode.insertBefore(block, pre);
    block.appendChild(pre);

    var button = doc.createElement('button');
    button.type = 'button';
    button.className = 'copy-btn';
    button.textContent = '复制';
    button.setAttribute('aria-label', '复制代码到剪贴板');
    block.appendChild(button);

    var resetTimer = null;

    button.addEventListener('click', function () {
      var text = pre.innerText;
      copyText(text).then(function () {
        button.textContent = '已复制';
        button.classList.add('is-copied');
        announce('代码已复制到剪贴板');
      }, function () {
        button.textContent = '复制失败';
        button.classList.remove('is-copied');
        announce('复制失败，请手动选择代码');
      }).then(function () {
        window.clearTimeout(resetTimer);
        resetTimer = window.setTimeout(function () {
          button.textContent = '复制';
          button.classList.remove('is-copied');
        }, 1800);
      });
    });
  }

  Array.prototype.forEach.call(doc.querySelectorAll('pre[data-lang]'), enhanceCodeBlock);

  /* ------------------------------------------------------------------------
     每章迷你目录
     ------------------------------------------------------------------------ */

  function buildMiniToc(chapter) {
    var headings = Array.prototype.slice.call(chapter.querySelectorAll('h2')).filter(function (h) {
      return h.parentElement === chapter;
    });
    if (headings.length < 2) return;

    var chapterNo = chapter.getAttribute('data-chapter') ||
      (chapter.id.match(/\d+/) || ['00'])[0];

    var nav = doc.createElement('nav');
    nav.className = 'mini-toc';
    nav.setAttribute('aria-label', '本章目录');

    var kicker = doc.createElement('p');
    kicker.className = 'mini-toc-kicker';
    kicker.appendChild(doc.createTextNode('本章目录'));
    var kickerEn = doc.createElement('span');
    kickerEn.textContent = 'IN THIS CHAPTER';
    kicker.appendChild(kickerEn);
    nav.appendChild(kicker);

    var list = doc.createElement('ol');

    headings.forEach(function (heading, index) {
      if (!heading.id) heading.id = chapter.id + '-sec-' + (index + 1);

      var item = doc.createElement('li');
      var link = doc.createElement('a');
      link.setAttribute('href', '#' + heading.id);

      var num = doc.createElement('span');
      num.className = 'mt-num';
      num.textContent = chapterNo + '.' + (index + 1);

      var title = doc.createElement('span');
      title.textContent = heading.textContent.trim();

      link.appendChild(num);
      link.appendChild(title);
      item.appendChild(link);
      list.appendChild(item);
    });

    nav.appendChild(list);

    var head = chapter.querySelector('.chapter-head');
    if (head && head.parentNode === chapter) {
      chapter.insertBefore(nav, head.nextSibling);
    } else {
      chapter.insertBefore(nav, chapter.firstChild);
    }
  }

  chapters.forEach(buildMiniToc);

  /* ------------------------------------------------------------------------
     入场
     ------------------------------------------------------------------------ */

  var revealItems = Array.prototype.slice.call(doc.querySelectorAll('[data-reveal]'));

  if (!revealItems.length) {
    /* 无 */
  } else if (prefersReduced() || !('IntersectionObserver' in window)) {
    revealItems.forEach(function (el) { el.classList.add('is-visible'); });
  } else {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });

    revealItems.forEach(function (el) { revealObserver.observe(el); });
  }

  /* ------------------------------------------------------------------------
     章节演示注册接口
     ------------------------------------------------------------------------
     章节作者在 web/src/scripts/ 里新增一个脚本，build.py 会自动内联：

       RoboDemo.register('joint-ratio', function (root, ui) {
         var input = ui.el('#ratio');
         input.addEventListener('input', function () {
           ui.out('speed', ui.fmt(3000 / input.value, 1));
         });
       });

     ui 提供 el / all / out / fmt；out(key, value) 会写入
     <span data-readout="key">，无需手动查找。
     ------------------------------------------------------------------------ */

  var demoRegistry = {};
  var demosBooted = false;

  function demoApi(root) {
    return {
      root: root,
      el: function (selector) { return root.querySelector(selector); },
      all: function (selector) {
        return Array.prototype.slice.call(root.querySelectorAll(selector));
      },
      out: function (key, value) {
        Array.prototype.forEach.call(
          root.querySelectorAll('[data-readout="' + key + '"]'),
          function (node) { node.textContent = value; }
        );
      },
      fmt: function (value, digits) {
        return Number(value).toFixed(digits == null ? 1 : digits);
      }
    };
  }

  function bootDemo(root) {
    var name = root.getAttribute('data-demo');
    var init = demoRegistry[name];
    if (typeof init !== 'function') return;
    try {
      init(root, demoApi(root));
    } catch (err) {
      if (window.console && console.warn) console.warn('[RoboDemo] ' + name + ' 初始化失败', err);
    }
  }

  function bootDemos() {
    demosBooted = true;
    Array.prototype.forEach.call(doc.querySelectorAll('[data-demo]'), bootDemo);
  }

  window.RoboDemo = {
    register: function (name, init) {
      if (!name || typeof init !== 'function') return;
      demoRegistry[name] = init;
      if (demosBooted) {
        Array.prototype.forEach.call(doc.querySelectorAll('[data-demo]'), function (root) {
          if (root.getAttribute('data-demo') === name) bootDemo(root);
        });
      }
    }
  };

  if (doc.querySelector('[data-demo]')) bootDemos();

  /* 初次进入与页面恢复滚动位置 */
  updateOnScroll();
})();
