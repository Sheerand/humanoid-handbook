# 人形机器人全栈手册 · 设计系统与组件手册

> 这份文档是撰稿人唯一的排版依据。它定义页面的视觉语言、可复制的组件片段、图示与文案规范。
> 原则只有一句：**让页面像一本做得极好的技术出版物，而不是一个文档站。**
>
> 视觉实现全部在 `web/src/styles/site.css`；本手册中的类名、结构、DOM 钩子必须逐字使用。
> 每次修改样式后，用 `python3 web/build.py` 构建，并在 1440 / 390 两个宽度自检。

---

## 目录

1. [设计原则](#1-设计原则)
2. [文件、构建与校验](#2-文件构建与校验)
3. [设计令牌](#3-设计令牌)
4. [排版层级](#4-排版层级)
5. [章节文件骨架](#5-章节文件骨架)
6. [组件手册](#6-组件手册)
7. [图示规范](#7-图示规范)
8. [代码块规范](#8-代码块规范)
9. [中文文案规范](#9-中文文案规范)
10. [允许与禁止](#10-允许与禁止)
11. [无障碍、响应式与打印](#11-无障碍响应式与打印)
12. [交付前检查清单](#12-交付前检查清单)

---

## 1. 设计原则

### 原则一：纸面优先，用线条与留白建立层次

页面底色是纸（`--paper`），文字是墨（`--ink`）。层次来自三样东西：**发丝线、留白、字号对比**。
不要用卡片阴影、彩色底板、圆角胶囊来区分内容。需要分隔时，先问「一条 1px 线够不够」；需要强调时，先问「换字号或字重够不够」。
暗色只出现在四个地方：Hero、代码块、演示读数条、极少量仪表盘式区块。正文永远是纸。

### 原则二：一个结构色，一个强调色，数据只用 d1–d5

- `--accent`（深绿）承担结构：链接、当前章节、关键动作。
- `--accent-2`（铜）承担编辑性提示：kicker、图号、下一章、时间线圆点。
- `--signal`（砖红）只承担危险与边界，不得用于装饰。
- 图示中的数据系列只用 `--d1`–`--d5`；文字用 ink / muted，线框用 line / line-2。
- 小字号禁止使用 `--accent-2`、`--signal`、`--muted` 原值（对比度不足），改用 `--accent-2-ink`、`--signal-ink`、`--muted-ink`。

### 原则三：每一张图都在回答一个问题

图不是排版填充物。每张图必须能补全这句话：「读者看完这张图，应该看出 ______。」
这句话就写在 `figcaption` 的 `.fig-note` 里。没有这句话的图，删掉。
数据图必须有坐标轴、单位、图例；示意图必须标注方向、关节、约束；没有标注的线稿只是涂鸦。

---

## 2. 文件、构建与校验

### 2.1 文件结构

```
web/
├── build.py                    构建 + 校验（不要改）
├── index.html                  构建产物（自包含单文件，不要手改）
└── src/
    ├── template.html           页面外壳：head、导航、Hero、全书地图、<!-- SECTIONS -->、页脚
    ├── styles/site.css         设计系统（全站视觉唯一来源）
    ├── scripts/site.js         外壳交互 + RoboDemo 注册接口
    └── sections/
        ├── 01-overview.html
        ├── 02-mechanical.html
        └── … 09-roadmap.html   每章一个文件，NN-slug.html
```

### 2.2 构建

```bash
python3 web/build.py            # 写 web/index.html，并打印 BUILD_JSON
python3 web/build.py --links    # 额外探测所有外链（发布前跑一次）
```

构建会把 `template.html` 里的 `<link rel="stylesheet" href="styles/site.css">` 与
`<script src="scripts/site.js"></script>` 内联成单文件，把 `<!-- SECTIONS -->` 替换为九章内容，
并自动追加 `src/scripts/` 下未被模板引用的脚本（章节演示脚本放在这里即可）。

### 2.3 构建器强制的章节契约

`build.py` 会对每个 `sections/NN-*.html` 做硬性检查。**任何一条不满足，构建失败：**

| 检查 | 要求 |
|---|---|
| 文件开头 | `<section id="ch-NN" data-chapter="NN" class="chapter">` |
| 图示 | 至少 2 个 `<figure>` |
| 代码 | 至少 1 个 `<pre>` |
| 小节 | 至少 2 个 `<h2>` |
| 外链 | 至少 2 个 `href="https://…"` |
| 小结 | 至少 1 个 `data-takeaways` |
| 正文 | 至少 1400 个汉字（硬下限 700，低于 1400 会警告） |

> 外链请优先指向 DOI、arXiv、出版社或项目主页；发布前跑 `--links`，不要留死链。

### 2.4 DOM 契约（不要改 id，不要重复）

| 钩子 | 作用 | 由谁创建 |
|---|---|---|
| `#progress-bar` | 顶部 2px 进度条，脚本只改 `scaleX` | 模板 |
| `#nav-rail` | 桌面左侧导航，内部 `a.nav-link[href="#ch-NN"]`，当前章加 `.is-current` | 模板 |
| `#menu-toggle` | 移动端目录按钮，`aria-controls="toc-drawer"`、`aria-expanded` | 模板 |
| `#toc-drawer` | 抽屉目录；`body.is-drawer-open` 控制显示；Esc 关闭、焦点陷阱 | 模板 |
| `#main` | 主内容区，skip-link 的落点 | 模板 |
| `section.chapter#ch-NN` | 每章 | 章节作者 |
| `pre[data-lang] > code` | 代码块；脚本自动包一层 `.code-block` 并插入 `.copy-btn` | 章节作者 |
| `.mini-toc` | 每章迷你目录 | **脚本自动生成，不要手写** |
| `#to-top` | 回到顶部 | 模板 |
| `#live-region` | 复制成功的读屏播报 | 模板 |
| `[data-reveal]` | 入场元素；脚本加 `.is-visible` | 章节作者（可选） |

---

## 3. 设计令牌

所有令牌定义在 `web/src/styles/site.css` 的 `:root`。**不要替换、不要覆写；可以补充。**

### 3.1 基础色

| 令牌 | 值 | 用途 |
|---|---|---|
| `--paper` | `#F7F5F0` | 页面底色（纸） |
| `--paper-2` | `#EFEBE2` | 次级纸面：小结块、页脚、演示标题栏 |
| `--surface` | `#FFFFFF` | 图示底板、输入框、悬浮卡片 |
| `--ink` | `#14161A` | 正文与标题（16.6:1） |
| `--ink-2` | `#3A4048` | 次级正文、表格单元（9.6:1） |
| `--muted` | `#6C727B` | 仅用于大字或非文本装饰（4.45:1，**小字勿用**） |
| `--line` | `#DBD6CA` | 发丝分隔线 |
| `--line-2` | `#C3BDAF` | 较强的边框、图示网格、四角标记 |
| `--accent` | `#0E5A52` | 结构色：链接、当前章节、主按钮（7.4:1） |
| `--accent-2` | `#B0652C` | 强调色：kicker、图号、时间线（仅大字/线条） |
| `--accent-3` | `#6B4A63` | 备用：图表第四系列、脚注强调 |
| `--signal` | `#C6472C` | 危险/边界（仅大字/线条/背景） |
| `--night` | `#0C1116` | Hero、代码块、演示读数条 |
| `--night-2` | `#151D24` | 暗场次级面 |
| `--night-ink` | `#E9E4D9` | 暗场正文（15.0:1） |
| `--night-muted` | `#9AA5B0` | 暗场次级文字（7.6:1） |

### 3.2 数据色（图示专用）

| 令牌 | 值 | 建议语义 |
|---|---|---|
| `--d1` | `#0E5A52` | 主序列、连续量、控制系统 |
| `--d2` | `#B0652C` | 次序列、峰值/上限、机械 |
| `--d3` | `#41637F` | 第三序列、感知、估计 |
| `--d4` | `#6B4A63` | 第四序列、阈值、注释 |
| `--d5` | `#B9962F` | 第五序列、硬件、能量 |

> 同一张图最多用 4 个系列色。超过 4 条线时，先考虑拆图，而不是加颜色。

### 3.3 版式与尺度

| 令牌 | 值 | 说明 |
|---|---|---|
| `--maxw` | `1180px` | 全站最大内容宽（Hero、全书地图、页脚） |
| `--measure` | `68ch` | 西文阅读行长基准 |
| `--measure-cn` | `36em` | 中文阅读行长：约 36 字/行（正文实际使用） |
| `--rail` | `268px` | 桌面左侧导航轨宽度 |
| `--pad` | `clamp(20px, 4.4vw, 64px)` | 页面水平留白 |
| `--bleed` | `clamp(0px, 4.2vw, 96px)` | `.fig-wide` 向两侧扩展的距离 |
| `--fs-body` | `17.5px` | 桌面正文；平板 17px；手机 16px |
| `--lh-body` | `1.85` | 正文行高 |
| `--serif` | 宋体栈 | 标题、引文、数字、术语 |
| `--sans` | 系统中文无衬线栈 | 正文、UI |
| `--mono` | 等宽栈 | 小标签、代码、图号、读数 |

### 3.4 补充令牌

| 令牌 | 值 | 为什么存在 |
|---|---|---|
| `--muted-ink` | `#5C626B` | `--muted` 小字对比度不足；此值 5.6:1 |
| `--accent-2-ink` | `#8A4A20` | 铜色小字可用版本（6.0:1） |
| `--signal-ink` | `#A23A22` | 砖红小字可用版本（6.1:1） |
| `--paper-line` / `--paper-line-soft` | 半透明线 | 纸面上的次级分隔 |
| `--tint-green` / `--tint-copper` / `--tint-red` | 浅纸色 | 三种 callout 的底色 |
| `--hero-*` | 暗场色 | Hero 专用；章节内不要使用 |
| `--corner-ticks` | 8 层渐变 | `.figure` 的四角标记 |
| `--dur` | `.32s` | 常规过渡时长 |
| `--reveal-delay` | `0s` | `[data-reveal]` 的入场延迟；可内联覆写做错峰 |

---

## 4. 排版层级

| 元素 | 字号 | 字重 | 行高 | 用途 |
|---|---|---|---|---|
| Hero `h1` | `clamp(44–80px)` | 500 | 1.12 | 只出现一次，在模板里 |
| 章标题 `h2` | `clamp(28–38px)` | 600 | 1.3 | 每章一个，位于 `.chapter-head` |
| 节标题 `.chapter > h2` | 同上 | 600 | 1.3 | 每章 ≥2 个；自动编号 `01.1` |
| `h3` | `clamp(20–23px)` | 600 | 1.45 | 节内分组，不编号 |
| 正文 `p` | 17.5 / 17 / 16 | 400 | 1.85 | 行长 36 字 |
| `.lede` | 17–19.5px | 400 | 1.95 | 章首导语，2–4 句 |
| `.small` | 13px | 400 | 1.75 | 补充说明（少用） |
| `.kicker` | 10.5px mono | 500 | 1.4 | 大写 + `.18em` 字距 |
| `.fig-no` / `.label` | 10px mono | 500 | — | 图号、表号、栏目标签 |

**规则**

- 一章只能有一个章标题（`.chapter-head h2`）。正文里的节标题一律 `<h2>`，不要用 `<h3>` 替代。
- `<h2>` 的编号由 CSS 自动生成，**不要手写「01.1」**。迷你目录的编号由脚本对齐。
- `<h3>` 不编号；用于「误解一 / 实现细节 / 三个子问题」这类分组。
- 不要使用 `<h1>`；不要跳级（h2 后直接用 h4）。
- 标题不加句号；中英文标题都不加。

---

## 5. 章节文件骨架

每个 `web/src/sections/NN-slug.html` **必须以 `<section>` 开头**（构建器按此匹配），不要在外面包 `<div>` 或注释块。

```html
<section class="chapter" id="ch-03" data-chapter="03">
  <header class="chapter-head">
    <div class="ch-meta">
      <span class="ch-num" aria-hidden="true">03</span>
      <p class="kicker">Hardware Systems</p>
    </div>
    <h2>硬件系统：电机、驱动、传感、电源与算力</h2>
    <p class="lede">一到两句话说清这一章要解决的问题，以及读者读完后能判断什么。不要在这里展开论证。</p>
  </header>

  <p>正文从整机视角开始。第一段不要用「本章将介绍……」这种元叙述，直接进入问题。</p>

  <h2>第一个小节</h2>
  <p>……</p>

  <!-- 组件按需插入：figure / table / formula / pre / callout / stat / timeline / demo …… -->

  <section class="takeaways" data-takeaways aria-labelledby="ch03-takeaways">
    <p class="kicker" id="ch03-takeaways">本章要点 <span>Takeaways</span></p>
    <ol>
      <li><strong>一句话结论。</strong>一句解释。</li>
    </ol>
  </section>

  <a class="next-chapter" href="#ch-04">
    <span class="next-kicker">下一章 · Next</span>
    <span class="next-title">04｜嵌入式软件：1 kHz 的实时世界</span>
    <span class="next-arrow" aria-hidden="true">→</span>
  </a>
</section>
```

**注意**

- `.chapter-head` 必须在 `<section>` 的最前面，迷你目录会被插在它后面。
- `.ch-num` 是装饰数字，加 `aria-hidden="true"`；章标题文字里不要重复编号。
- 每章结尾放 `.takeaways` 与 `.next-chapter`；最后一章（09）的 `.next-chapter` 指回 `#ch-01` 或省略。
- 不要给 `<section class="chapter">` 加 `style`、`data-reveal`（整章淡入会拖慢阅读）。

---

## 6. 组件手册

> 以下片段可以直接复制。类名不要改；不要额外套 `<div class="container">`。

### 6.1 章标题 `.chapter-head` / 导语 `.lede`

```html
<header class="chapter-head">
  <div class="ch-meta">
    <span class="ch-num" aria-hidden="true">03</span>
    <p class="kicker">Hardware Systems</p>
  </div>
  <h2>硬件系统：电机、驱动、传感、电源与算力</h2>
  <p class="lede">把一个关节拆到零件级：电机、减速器、编码器、驱动器、电源与散热，任何一项选错，控制算法都救不回来。</p>
</header>
```

- 英文 kicker 用**标题式大写**（Hardware Systems），CSS 会转成大写并加字距。
- 导语 ≤ 4 行；不要在导语里放链接、列表、公式。
- 导语后的第一个 `<h2>` 不要重复导语内容。

### 6.2 节标题 `h2` / `h3`

```html
<h2>三个时间尺度</h2>
<p>……</p>

<h3>误解一：自由度越多越灵活</h3>
<p>……</p>
```

- `h2` 自动获得 `01.1` 这样的编号；`h3` 带一条 18px 铜色短线。
- 不要在 `h2` 里写「一、」「1.」或章节号。
- `h2` 之间至少隔两段正文；不要连续两个 `h2`。

### 6.3 图示 `.figure` / `.fig-wide`

```html
<figure class="figure" data-reveal>
  <div class="fig-scroll">
    <svg viewBox="0 0 600 320" role="img" aria-labelledby="ch03-fig1-title ch03-fig1-desc">
      <title id="ch03-fig1-title">关节模组的扭矩—转速包络</title>
      <desc id="ch03-fig1-desc">横轴为输出转速 0 到 120 转每分钟，纵轴为扭矩 0 到 40 牛米；实线为连续扭矩，虚线为峰值扭矩。</desc>
      <!-- 图形内容 -->
    </svg>
  </div>
  <figcaption>
    <span class="fig-no">图 3.1</span>一句话说明这张图画了什么，包含单位与数据来源。
    <span class="fig-note read-for">读者应看出：工作点必须落在连续包络内，而不是踩在峰值线上。</span>
    <span class="fig-src">来源：作者绘制，数值为量级示意。</span>
  </figcaption>
</figure>
```

加宽版（突破正文栏，桌面最多 96px 每侧；手机自动收为整宽）：

```html
<figure class="figure fig-wide" data-reveal>
  <div class="fig-scroll"><svg …>…</svg></div>
  <figcaption>…</figcaption>
</figure>
```

- `.fig-scroll` 是**必需**的底板与横滚容器：桌面宽 100%，小屏保持 600 单位最小宽度，避免 SVG 文字被缩到 12px 以下。
- 图号格式：`图 <章号>.<序号>`；表号 `表 <章号>.<序号>`；正文引用写「如图 3.2」。
- 每张图必须有 `<figcaption>`，且包含 `.fig-no`、说明、`.fig-note`、`.fig-src` 四部分。
- 图注 13px；`.fig-note` 会另起一段；`.fig-src` 小一号，放在最后。
- 不要用 `<img>`、外链图片、截图；全部手绘内联 SVG。
- 不要给 `.figure` 加背景色或阴影；四角标记由 CSS 提供。

### 6.4 表格 `.table-wrap`

```html
<div class="table-wrap">
  <table>
    <caption>表 3.1 三种执行器的量级对比</caption>
    <thead>
      <tr><th>类型</th><th>峰值扭矩</th><th class="num">带宽</th><th>适用位置</th></tr>
    </thead>
    <tbody>
      <tr><td>准直驱</td><td>40 N·m</td><td class="num">1–2 kHz</td><td>髋、膝</td></tr>
      <tr><td>谐波 + 无框电机</td><td>120 N·m</td><td class="num">200–500 Hz</td><td>肩、肘、腕</td></tr>
    </tbody>
  </table>
</div>
```

- 必须包在 `.table-wrap` 里（负责横滚与上下发丝线）。
- 表头用 `<th>`；数值列加 `class="num"` 右对齐并使用等宽数字。
- 表格最小宽度 520px，手机横滚；不要为了塞下而删列或缩到 10px。
- 不要合并单元格做复杂排版；需要复杂表格时拆成两张。
- `caption` 写在 `<table>` 内第一行，格式同上。

### 6.5 公式 `.formula-block`

```html
<div class="formula-block">
  <span class="formula">τ = M(q) <span class="qddot">q</span> + C(q, <span class="qdot">q</span>) <span class="qdot">q</span> + g(q) + J<sup>⊤</sup> f<sub>ext</sub></span>
  <span class="formula-no">3.1</span>
</div>
```

- `.formula-no` 里只写 `3.1`，括号由 CSS 自动补；不要手写 `(3.1)`。
- 一阶/二阶导用 `<span class="qdot">q</span>` / `<span class="qddot">q</span>`，**不要**直接输入组合字符 `q̇`（部分字体里会错位成撇号）。
- 希腊字母、上下标用 `<sub>` / `<sup>`；矩阵转置用 `⊤`。
- 行内公式：`<span class="formula-inline">M(q)</span>`；中文里夹公式时前后各留一个空格。
- 公式过长时容器可横滚；不要缩小到 14px 以下。

### 6.6 代码块 `pre[data-lang]`

**只写 `<pre>`，不要手写 `.code-block` 或复制按钮**——`site.js` 会自动包容器、加语言条与「复制」按钮。

```html
<pre data-lang="cpp"><code><span class="tok-c">// 1 kHz 控制循环</span>
<span class="tok-k">void</span> control_loop(<span class="tok-k">const</span> State&amp; s) {
  <span class="tok-k">auto</span> tau = wbc.solve(s);  <span class="tok-c">// ~380 µs</span>
}</code></pre>
```

- `data-lang` 用短标签：`cpp` / `python` / `rust` / `cmake` / `bash` / `xml` / `yaml`；CSS 会转大写。
- 代码里的 `<`、`>`、`&` 必须转义为 `&lt;`、`&gt;`、`&amp;`。
- 不要写行号（CSS 没有行号系统）；不要用 Tab，用 2 空格。
- 单行尽量 ≤ 80 字符；超长行会横滚，不会撑破页面，但阅读体验差。
- 可选语法着色只使用这四个类：`.tok-c`（注释）、`.tok-k`（关键字）、`.tok-s`（字符串）、`.tok-n`（数字）、`.tok-f`（函数名）。没有高亮器，全部手工标注；不确定时宁可不上色。
- 一段代码只讲一件事；超过 40 行考虑拆成两段并加过渡说明。

### 6.7 提示块 `.callout`（三种）

```html
<aside class="callout callout--intuition" data-reveal>
  <p class="callout-kicker">直觉 <span>Intuition</span></p>
  <p>把双足行走看成倒立摆：控制器的任务不是消除误差，而是在误差发散前把支撑点挪到重心下面。</p>
</aside>

<aside class="callout callout--warning" data-reveal>
  <p class="callout-kicker">警告 <span>Warning</span></p>
  <p>不要把「平均 1 ms」当成「1 ms 截止」：硬实时看的是最坏执行时间。</p>
</aside>

<aside class="callout callout--field" data-reveal>
  <p class="callout-kicker">工程经验 <span>Field Note</span></p>
  <p>先把所有传感器的时间戳对齐到同一个时钟，再谈控制。</p>
</aside>
```

| 变体 | 用途 | 禁止 |
|---|---|---|
| `callout--intuition` | 给出一个可迁移的直觉、类比 | 不要放公式推导 |
| `callout--warning` | 常见错误、失效模式、安全边界 | 不要用来强调普通结论 |
| `callout--field` | 只有做过才知道的工程细节 | 不要写成个人轶事 |

- 一节最多两个 callout；连续两个 callout 会显得在喊口号。
- 正文 15px，控制在 3–5 行；超过就改成普通段落。

### 6.8 指标行 `.stat-row` / `.stat`

```html
<div class="stat-row" data-reveal>
  <div class="stat">
    <span class="stat-value">1<small>kHz</small></span>
    <span class="stat-label">控制周期</span>
  </div>
  <div class="stat">
    <span class="stat-value">29<small>DOF</small></span>
    <span class="stat-label">不含手指</span>
  </div>
  <div class="stat">
    <span class="stat-value">68<small>kg</small></span>
    <span class="stat-label">整机质量</span>
  </div>
</div>
```

- 3–4 个指标；数字用衬线体，单位放在 `<small>` 里。
- 指标必须来自同一量级/同一对象，不要混用「章节数」和「扭矩」。
- 不要在 `.stat-value` 里写长句；标签 ≤ 8 个汉字。

### 6.9 时间线 `.timeline`

```html
<ol class="timeline">
  <li class="is-key">
    <span class="timeline-year">1972</span>
    <div class="timeline-body">
      <h4>WABOT-1 起步</h4>
      <p>早稻田大学完成第一台全尺寸人形机器人，能缓慢步行与抓取。</p>
    </div>
  </li>
  <li>
    <span class="timeline-year">1996</span>
    <div class="timeline-body">
      <h4>Honda P2</h4>
      <p>第一次让「人形」看起来像产品：内置电池、无线遥控、连续行走。</p>
    </div>
  </li>
</ol>
```

- 4–6 个节点；`is-key` 标记 1–2 个转折点（实心圆点）。
- 年份用 4 位数字；不要写月份（除非事件本身以月为单位）。
- `<h4>` 只允许出现在 `.timeline-body` 与 `.demo-bar` 中。

### 6.10 演示 `.demo`

```html
<section class="demo" data-demo="joint-ratio" aria-labelledby="demo31-title">
  <div class="demo-bar">
    <span class="demo-live"><i aria-hidden="true"></i>Live</span>
    <h4 class="demo-title" id="demo31-title">减速比如何换走速度、换回扭矩</h4>
    <span class="demo-tag">Demo 3.1</span>
  </div>

  <div class="demo-stage">
    <svg viewBox="0 0 480 240" role="img" aria-labelledby="demo31-svg">
      <title id="demo31-svg">小齿轮驱动大齿轮的示意图</title>
      <!-- 图形；可用 JS 修改的属性加 data-part -->
    </svg>
  </div>

  <div class="demo-controls">
    <label for="demo31-ratio">减速比 i</label>
    <input id="demo31-ratio" type="range" min="10" max="120" step="1" value="50">
    <output class="demo-out" for="demo31-ratio" id="demo31-out">50 : 1</output>
  </div>

  <dl class="demo-readout">
    <div><dt>输出转速</dt><dd><span data-readout="rpm">60.0</span><small>rpm</small></dd></div>
    <div><dt>输出扭矩</dt><dd><span data-readout="torque">32.0</span><small>N·m</small></dd></div>
    <div><dt>折算惯量</dt><dd><span data-readout="inertia">0.125</span><small>kg·m²</small></dd></div>
  </dl>
</section>
```

演示脚本放到 `web/src/scripts/demo-03.js`（构建时自动内联）：

```js
RoboDemo.register('joint-ratio', function (root, ui) {
  var input = ui.el('#demo31-ratio');
  var output = ui.el('#demo31-out');
  var stage = ui.el('.demo-stage');

  function update() {
    var i = Number(input.value);
    output.textContent = i + ' : 1';
    stage.style.setProperty('--ratio', i);
    ui.out('rpm', ui.fmt(3000 / i, 1));
    ui.out('torque', ui.fmt(0.8 * i * 0.8, 1));
    ui.out('inertia', ui.fmt(5e-5 * i * i, 3));
  }

  input.addEventListener('input', update);
  update();
});
```

- `data-demo` 的名字必须与脚本注册名一致，否则构建器会警告。
- `ui.el(sel)` / `ui.all(sel)` 在演示根节点内查询；`ui.out(key, value)` 写入所有 `[data-readout="key"]`；`ui.fmt(v, digits)`。
- 控件必须是原生可聚焦元素（`input[type=range]`、`button`、`select`）；不要用 `<div onclick>`。
- 演示的读数至少 2 项、至多 4 项；每项都要有单位。
- 演示只在「必须动手才能理解」时使用；能用一张静态图说清就不要做演示。
- 尊重 `prefers-reduced-motion`：CSS 动画会被全站规则关闭，但 JS 自己启动的 `requestAnimationFrame` 需要手动判断 `matchMedia('(prefers-reduced-motion: reduce)')`。

### 6.11 本章要点 `.takeaways`

```html
<section class="takeaways" data-takeaways aria-labelledby="ch03-takeaways">
  <p class="kicker" id="ch03-takeaways">本章要点 <span>Takeaways</span></p>
  <ol>
    <li><strong>一句结论。</strong>一句解释，不要重复正文原句。</li>
    <li><strong>一句结论。</strong>最好带一个数字。</li>
  </ol>
</section>
```

- 3–5 条；每条 1–2 行。
- 用 `<strong>` 标出结论部分，后面跟普通文本；不要整条加粗。
- 位置固定在正文末尾、延伸阅读之前。

### 6.12 论文清单 `.paper-list`

```html
<ol class="paper-list">
  <li>
    <span class="paper-idx">[01]</span>
    <div>
      <p class="paper-title">Learning to Walk in Minutes Using Massively Parallel Deep Reinforcement Learning</p>
      <p class="paper-meta">Nikita Rudin 等 · CoRL, 2021 · 大规模并行仿真里的步态学习</p>
    </div>
    <a class="paper-link" href="https://arxiv.org/abs/2109.11978">arXiv ↗</a>
  </li>
</ol>
```

- 按主题或时间排序；编号手动写 `[01]`。
- 标题保留英文原题，不翻译；`paper-meta` 给作者、会议/期刊、年份与一句中文注释。
- 链接文字用 `DOI ↗` / `arXiv ↗` / `PDF ↗`，不要贴裸 URL。
- 每条外链发布前验证；`build.py` 的 `--links` 会批量探测。

### 6.13 术语表 `.glossary`

```html
<dl class="glossary">
  <div>
    <dt>WBC<span>Whole-Body Control</span></dt>
    <dd>全身控制：把任务、接触约束与关节限位写进同一个优化，求出满足全部优先级的关节力矩。</dd>
  </div>
  <div>
    <dt>ZMP<span>Zero Moment Point</span></dt>
    <dd>零矩点：地面上使重力和惯性力的合力矩水平分量为零的点。</dd>
  </div>
</dl>
```

- 每章 3–6 个术语；只解释本章反复使用的词。
- 中文释义 + 英文全称；不要写百科式长段落。

### 6.14 清单 `.checklist`

```html
<ul class="checklist">
  <li class="is-done">能用拉格朗日或牛顿—欧拉写出两连杆的动力学方程。</li>
  <li class="is-done">知道控制周期、延迟与相位裕度之间的关系。</li>
  <li>读过一篇 WBC 或 MPC 的论文，能说清它的决策变量。</li>
</ul>
```

- 用于「读前自检」或「实验前检查」；4–6 项。
- `is-done` 只表示「已完成/应已掌握」，不是交互复选框。
- 不要把它当 todo 列表塞满整章。

### 6.15 下一章 `.next-chapter`

```html
<a class="next-chapter" href="#ch-04">
  <span class="next-kicker">下一章 · Next</span>
  <span class="next-title">04｜嵌入式软件：1 kHz 的实时世界</span>
  <span class="next-arrow" aria-hidden="true">→</span>
</a>
```

- 标题必须与固定章节标题一致（含 `04｜`）。
- 放在 `.chapter` 的最后，不要包在 `<div>` 里。
- 最后一章指回 `#ch-01`，文字改为「回到第一章 · Start Over」。

### 6.16 迷你目录 `.mini-toc`（自动）

**不要手写。** 脚本会在每章 `.chapter-head` 之后插入：

```html
<nav class="mini-toc" aria-label="本章目录">
  <p class="mini-toc-kicker">本章目录 <span>IN THIS CHAPTER</span></p>
  <ol>
    <li><a href="#ch-03-sec-1"><span class="mt-num">03.1</span><span>第一个小节</span></a></li>
    <li>…</li>
  </ol>
</nav>
```

- 只收集 `.chapter` 的**直接子级** `<h2>`，章标题不计入；至少有 2 个才生成。
- 标题没有 `id` 时自动生成 `ch-NN-sec-K`；如需固定锚点，可给 `<h2 id="my-anchor">`。
- 迷你目录在桌面双栏、手机单栏。

### 6.17 工具类

| 类名 | 作用 | 用法 |
|---|---|---|
| `.small` | 13px 灰色补充说明 | 图后、表后 |
| `.tight` | 收紧段落下边距 | 连续短语 |
| `.keyline` | 一条横向发丝线 | `<hr class="keyline">` |
| `.formula-inline` | 行内公式 | 正文中夹公式 |
| `.qdot` / `.qddot` | 单/双点导数 | 公式与正文 |
| `.sr-only` | 仅读屏可见 | 补充标签 |
| `.t-mono` | SVG 内等宽文字 | 图示坐标/单位 |

---

## 7. 图示规范

### 7.1 结构（强制）

```html
<figure class="figure" data-reveal>
  <div class="fig-scroll">
    <svg viewBox="0 0 600 320" role="img" aria-labelledby="ch03-fig1-title ch03-fig1-desc">
      <title id="ch03-fig1-title">…</title>
      <desc id="ch03-fig1-desc">…</desc>
      <defs>
        <marker id="ch03-fig1-arrow" viewBox="0 0 10 10" refX="8" refY="5"
                markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 Z" fill="#B0652C"/>
        </marker>
      </defs>
      …
    </svg>
  </div>
  <figcaption>
    <span class="fig-no">图 3.1</span>说明。
    <span class="fig-note read-for">读者应看出：……</span>
    <span class="fig-src">来源：作者绘制。</span>
  </figcaption>
</figure>
```

### 7.2 硬性规则

| # | 规则 | 说明 |
|---|---|---|
| 1 | **`viewBox` 宽度 ≈ 600** | 桌面按 1:1 渲染，12 单位 = 12px；手机保持 600 单位横滚，不缩小文字。 |
| 2 | **`role="img"` + `<title>` + `<desc>`** | 用 `aria-labelledby` 同时指向两者；这比单一 `aria-label` 更完整。id 必须全页唯一。 |
| 3 | **线宽 1.5** | 主轮廓 1.5（±0.1）；辅助线 0.8–1；网格 0.5。不要出现 3px 以上的装饰线。 |
| 4 | **颜色只用 `--d1`–`--d5`** | 数据系列与结构线都从这五个里选。文字用 `--ink` / `--ink-2` / `--muted-ink`；线框用 `--line` / `--line-2`。禁止自定义 hex（`#B0652C` 只在 marker 的 `fill` 里作为 `--d2` 的等价物出现时也尽量改用 `style="fill:var(--d2)"`）。 |
| 5 | **文字 ≥ 12px** | `<text font-size="12">` 起步；条目标签 13–13.5；不要用 9–10px 的注释。 |
| 6 | **箭头定义一次** | 每图在 `<defs>` 里定义一次 `<marker>`，id 以章节号开头（`ch03-fig1-arrow`）；不要每个箭头重复定义。 |
| 7 | **必须有 `<figcaption>`** | 图号 + 说明 + `.fig-note` + `.fig-src`，四件套。 |
| 8 | **数据图必须有轴、单位、图例** | 横轴/纵轴的刻度与单位缺一不可；单条堆叠条也必须有时间轴与图例。 |
| 9 | **示意图必须标注「读者应看出什么」** | 写在 `.fig-note`，而不是图里的小字。 |
| 10 | **不引用外部资源** | 不用 `<image href="...">`、外链字体、图标库；全部路径内联。 |

### 7.3 数据图

- 坐标轴从 0 开始（除非有充分理由截断，并在图注说明）。
- 单位写在轴标题里：`转速 / rpm`、`时间 / µs`、`扭矩 / N·m`。
- 图例 12px，色块 9–12px；图例顺序与数据顺序一致。
- 阈值/截止线用 `--d4` 虚线，并在图内标注数值。
- 数据来源与「示意/实测」必须写进 `.fig-src`；不要伪造精度。
- 至少要能回答：最大值在哪、拐点在哪、工作点是否安全。

### 7.4 示意图

- 每个关节画圆心 + 轴线；每条连杆画双线或加粗单线（2px），不要只画一根火柴棍。
- 用弧形箭头标出旋转方向；箭头大小 7–8，颜色与对应关节一致。
- 尺寸线用两端短横线（不是箭头），标注真实单位（`0.38 m`）。
- 标签用引线指向元素，不要悬空；引线 0.8px `--line-2`。
- 一张图只讲一个机构/一个流程；超过 7 个元素就拆图。
- 标注要写「J1 · roll 外展 / 内收」这种「编号 + 英文轴 + 中文动作」，不要只写「关节 1」。

### 7.5 图注与正文引用

```html
<p>如图 3.2 所示，连续扭矩在 50 rpm 之后进入恒功率区。</p>
```

- 图号与图注一致；正文引用用「图 3.2」，不要写「上图」「下图」。
- 图注第一句是陈述句，不是「本图展示了……」。
- `.fig-note` 以「读者应看出：」开头；这是给作者的检查项，也是给读者的提示。
- `.fig-src` 写「来源：作者绘制」或「来源：<作者>，<年份>，基于公开数据重绘」。

---

## 8. 代码块规范

### 8.1 结构

```html
<pre data-lang="cpp"><code><span class="tok-c">// 注释</span>
<span class="tok-k">for</span> (<span class="tok-k">int</span> i = 0; i &lt; n; ++i) {
  sum += x[i];
}</code></pre>
```

- 只用 `<pre data-lang="…"><code>…</code></pre>`；不要加 `<div class="code-block">`，脚本会包。
- 首行不要空行；末尾不要多余空行。
- 缩进 2 空格；不要 Tab。
- 必须有 `data-lang`，否则没有语言标签。
- 代码里的 HTML 特殊字符必须转义。

### 8.2 语言标签

| 用途 | `data-lang` |
|---|---|
| C / C++ | `cpp` |
| Python | `python` |
| Rust | `rust` |
| CMake | `cmake` |
| Shell | `bash` |
| XML / URDF / MJCF | `xml` |
| YAML | `yaml` |
| 伪代码 | `text` |

### 8.3 内容

- 一段代码只回答一个问题；超过 40 行拆段，每段前用一句话说明「这段在干什么」。
- 真实可运行的代码优先；伪代码要标 `text` 并在正文说明省略了什么。
- 注释写「为什么」，不写「这行在赋值」。
- 不要出现密钥、真实 IP、个人路径。
- 行内代码用 `` `code` ``；不要给整段解释加行内代码底色。

### 8.4 复制与打印

- 复制按钮由脚本插入；点击后读屏会播报「代码已复制到剪贴板」。
- 打印时 `.copy-btn` 与语言条会被隐藏，代码改为浅底黑字、自动换行。
- 不要把关键信息只放在代码注释里；正文要复述结论。

---

## 9. 中文文案规范

### 9.1 标点与空格

- 中文用全角标点：，。；：！？（）「」——……
- 中英文之间加一个半角空格：`1 kHz 的控制环`、`用 PPO 训练`、`Sim2Real 的 gap`。
- 数字与单位之间加半角空格：`40 N·m`、`50 rpm`、`1.75 m`、`±30%` 例外（百分号紧贴）、`25 °C` 按 SI 加空格。
- 范围用 en dash：`100–500 Hz`、`1–4 kHz`；不要用 `~` 或 `-`。
- 乘号用 `×`：`30 × float`；转置用 `⊤`；点乘用 `·`。
- 引号统一用「」；英文原文引用用 “ ”；不要混用直角引号。
- 省略号用 `……`，破折号用 `——`（占两格）。

### 9.2 语气

- 第二人称「你」可以用，但不要每段都出现；不用「我们」「大家」「众所周知」。
- 陈述事实，不写营销词：禁用「颠覆」「革命性」「最强」「完美」「轻松」。
- 不用感叹号；不用 emoji；不用「简单来说」开头超过一次。
- 句子平均 25–40 字；一段 3–5 句；一段只讲一个论点。
- 术语首现给中文 + 英文全称，之后用缩写：`全身控制（Whole-Body Control, WBC）`。

### 9.3 结构与标题

- 章标题固定，不得改写（见目录）。
- `h2` 用名词短语或判断句：「三个时间尺度」「稳定性不是一个指标」；不要用「浅谈」「漫谈」。
- `h3` 用于「误解一：…」「实现细节：…」这类分组；不加编号。
- 列表项保持同一语法结构；每项以句号结尾（短语列表可不加）。
- 图注、表注、公式说明都要能独立阅读。

### 9.4 数字与事实

- 数字用半角阿拉伯数字；不要用全角数字。
- 近似值给范围或量级，并说明来源：「约 380 µs（公开系统报道）」。
- 不要伪造精确到小数点后两位的实测值；没有数据就写「量级示意」。
- 单位统一：`N·m`、`kg·m²`、`µs`、`ms`、`kHz`、`rpm`、`DOF`。
- 章节编号格式固定为 `01｜标题`（全角竖线），只用于导航、交叉引用和下一章卡片；`h2` 内不写。

### 9.5 推荐术语

| 中文 | 英文 | 不要写成 |
|---|---|---|
| 自由度 | DOF / degree of freedom | 维度 |
| 全身控制 | whole-body control (WBC) | 全身控制器 |
| 零矩点 | zero moment point (ZMP) | 零力矩点（可接受，但全书统一用「零矩点」） |
| 模型预测控制 | model predictive control (MPC) | 预测控制（首现后可用） |
| 质心 | center of mass (CoM) | 重心（除非指重力作用点） |
| 关节模组 | joint module / actuator module | 关节电机 |
| 准直驱 | quasi-direct drive (QDD) | 半直驱 |
| 域随机化 | domain randomization | 领域随机化 |
| 实机迁移 | sim-to-real transfer | 模拟到现实 |

---

## 10. 允许与禁止

### 10.1 允许

- 语义标签：`section`、`header`、`footer`、`nav`、`aside`、`figure`、`figcaption`、`table`、`dl`、`ol`、`ul`、`blockquote`、`cite`。
- 行内语义：`strong`、`em`、`code`、`sub`、`sup`、`abbr`（少用）。
- 组件：本手册第 6 节的全部类。
- 内联 SVG 图示（符合第 7 节）。
- 可选：`data-reveal`（仅用于图、callout、stat-row 等块级元素）。
- 可选：给 `<h2>` 加稳定 `id` 以便外部链接。

### 10.2 禁止

- 任何外部资源：字体、CSS、JS、图片、CDN、iframe、视频、追踪脚本。
- `<img>` 标签（图示必须内联 SVG）。
- 自定义颜色、阴影、渐变、圆角超过 6px。
- 在章节里写 `<h1>`；用 `<br>` 制造间距；用空 `<p>` 占位。
- 手动章节编号（`01.1`）或手动迷你目录。
- 绕过 `.table-wrap`、`.fig-scroll`、`.figure` 的裸表格/裸 SVG。
- 在 `.chapter` 内使用 `.hero`、`.rail`、`.map-card`、`.masthead` 等外壳类。
- 重复 `id`；用 `#ch-01` 以外的章节锚点格式。
- 表情符号、颜文字、装饰性符号（→ 仅用于按钮/下一章，✓ 仅用于清单）。
- 直接写 `--accent-2` / `--signal` / `--muted` 作为 12px 以下文字颜色。
- 把重点句整段加粗；一段最多一个 `<strong>`。
- 在正文里贴裸 URL；外链必须走 `.paper-link` 或正文链接。

---

## 11. 无障碍、响应式与打印

### 11.1 对比度（实测）

| 前景 / 背景 | 比值 | 结论 |
|---|---|---|
| `--ink` on `--paper` | 16.6 | AAA |
| `--ink-2` on `--paper` | 9.6 | AAA |
| `--muted-ink` on `--paper` | 5.6 | AA |
| `--accent` on `--paper` | 7.4 | AAA |
| `--accent-2-ink` on `--paper` | 6.0 | AA |
| `--signal-ink` on `--paper` | 6.1 | AA |
| `--night-ink` on `--night` | 15.0 | AAA |
| `--night-muted` on `--night` | 7.6 | AAA |
| `--muted` on `--paper` | 4.45 | **仅大字** |
| `--accent-2` on `--paper` | 4.06 | **仅大字/线条** |
| `--signal` on `--paper` | 4.44 | **仅大字/线条** |

### 11.2 无障碍

- skip-link 必须是 `<body>` 的第一个可聚焦元素（模板已提供）。
- 所有图标按钮有 `aria-label`；装饰性 SVG 加 `aria-hidden="true"`。
- 图示必须有 `role="img"` + 可读名称 + `<desc>`。
- 焦点样式由 `:focus-visible` 提供；不要移除 outline。
- 动效遵循 `prefers-reduced-motion`：Hero 行走循环、入场、Live 脉冲全部停止。
- 抽屉：`aria-expanded`、`aria-hidden`、Esc 关闭、焦点陷阱、关闭后焦点回到按钮（脚本已实现）。
- 表格有 `<caption>`；图有 `<figcaption>`；不要只靠颜色传达信息。

### 11.3 响应式

| 宽度 | 行为 |
|---|---|
| ≥ 1200 | 左侧 268px 导航轨；正文 36 字/行；`.fig-wide` 向两侧扩展最多 96px |
| 768–1199 | 导航收为顶部条（01–09 快速跳转 + 抽屉）；正文仍居中；Hero 双栏 |
| < 768 | 单列；正文 16px；Hero 图在上、文字在下；图示/表格/代码横滚；页脚单列 |

- 不要用 `position: fixed` 的元素遮挡正文；`#to-top` 已在右下角留出 42px。
- 图示在手机上自动出现「↔ 图示可横向滑动」提示；不要删除 `.fig-scroll`。
- 代码块横滚不撑破页面（`overflow-x: auto`），不要改成 `white-space: pre-wrap` 除非确实需要。

### 11.4 打印

- 导航、抽屉、进度条、回到顶部、复制按钮、演示控件全部隐藏。
- 每章从新页开始；图示/表格/代码块避免跨页断裂。
- 外链在打印时自动追加 URL；代码块改为浅底黑字、自动换行。
- 打印使用 `@page { margin: 18mm 16mm 20mm }`；不要另写打印样式。

---

## 12. 交付前检查清单

### 12.1 构建

- [ ] 文件名 `NN-slug.html`，开头是 `<section id="ch-NN" data-chapter="NN" class="chapter">`。
- [ ] `python3 web/build.py` 退出码为 0，无 ERR。
- [ ] 外链 ≥ 2，且 `--links` 无 dead。
- [ ] 汉字 ≥ 1400（目标 2000–3500）。
- [ ] 至少 2 图、1 代码块、2 个 `h2`、1 个 `data-takeaways`。
- [ ] 没有重复 `id`；没有指向不存在锚点的链接。
- [ ] 没有 `TODO` / `FIXME` / 占位文本 / `Lorem ipsum`。

### 12.2 视觉（1440 与 390 各看一遍）

- [ ] 正文行长 34–40 字，没有一行超过 42 字。
- [ ] 每张图的 SVG 文字在 390 宽下仍 ≥ 12px（靠 `.fig-scroll` 横滚）。
- [ ] 图注四件套齐全；数据图有轴、单位、图例。
- [ ] 表格没有撑破页面；手机可横滚。
- [ ] 代码块语言标签正确；复制按钮可用。
- [ ] 三种 callout 没有连续出现。
- [ ] 每个 `h2` 前有足够留白；章节之间有细线 + 大号数字。
- [ ] 暗色只出现在允许的地方。
- [ ] 390 宽下 Hero 不超过一屏；抽屉可用、Esc 可关。

### 12.3 文案

- [ ] 中英文之间、数字与单位之间有空格。
- [ ] 没有营销词、感叹号、emoji。
- [ ] 术语首现给了英文全称；全书用词统一。
- [ ] 图注、表注、公式说明能独立阅读。
- [ ] 章标题与固定标题逐字一致。

---

**版本**：Edition 1.0 · 2026
**维护**：样式只改 `web/src/styles/site.css`；组件结构只改本手册与模板；章节作者只写 `web/src/sections/`。
