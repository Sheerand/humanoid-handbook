# 人形机器人全栈手册 · 交接说明

读者：下一个接手这个项目的人。本文只写事实、路径、命令与判断。

- 交付物：`web/index.html`，906,699 字节（构建器打印 885 KB），自包含单文件，中文长文档。
- 最终统计（`temp/build/report.json`）：9 章、69,846 汉字、44 个 `<figure>`、46 个 SVG、8 个 canvas、14 个 `<pre>`、8 个交互演示、124 个外链、0 error、0 warning。
- 构建环境：Python 3.14.6、Node v22.14.0（`temp/toolchain/node/bin/node`）、Playwright Chromium（`temp/toolchain/browsers/`）。

---

## 1. 项目目标与交付物

**是什么**：一本面向「会 Python、无机器人背景」读者的技术读物，从机械、硬件、实时软件讲到动力学、步态、强化学习与感知，共 9 章；正文由 `web/src/sections/` 的 9 个 HTML 片段生成，最终压成一个 HTML 文件。

**怎么打开**：双击 `web/index.html` 即可；无需服务器、无需联网、无外部字体/CDN/图片。渲染脚本也是用 `file://` 打开的（`temp/toolchain/render.py:73`）。命令行等价写法：

```bash
xdg-open web/index.html
```

**怎么重建**（在仓库根目录执行，写文件 + 打印 `BUILD_JSON`）：

```bash
python3 web/build.py              # 写 web/index.html、temp/build/report.json、temp/build/page.txt
python3 web/build.py --no-write   # 只跑检查，不覆盖产物
python3 web/build.py --links      # 额外探测全部外链（需 requests，已装 2.34.2）
```

构建器读取 `web/src/template.html`、`web/src/styles/*.css`、`web/src/scripts/*.js`、`web/src/sections/NN-*.html`，把 CSS/JS 内联，把 `<!-- SECTIONS -->` 替换成九章正文，并自动追加模板未引用的脚本（`web/build.py:243-263`）。退出码 0 表示无 error（warning 不算失败），最后一行是 `BUILD_JSON:{...}`（`web/build.py:360-371`）。

**怎么截图**（两条命令就是本次评审用的原始命令，见 `temp/wf/humanoid-stack.ts:1113-1122`）：

```bash
python3 temp/toolchain/render.py web/index.html temp/render/r2 --sections --width 1440 --max-per-section 5
python3 temp/toolchain/render.py web/index.html temp/render/m2 --width 390  --slices 8
```

输出：`full.png`、`sec-<id>-<k>.png`（按节截图）、`slice-XX.png`（滚动切片）、`render.json`（报错、溢出、尺寸、计数）。必须用 `python3` 从仓库根目录跑，脚本会把浏览器路径设成 `temp/toolchain/browsers`（`render.py:21`）。

**改哪里**：正文改 `web/src/sections/NN-slug.html`；外壳/导航/Hero 改 `web/src/template.html`；视觉改 `web/src/styles/site.css`；演示改 `web/src/scripts/demo-0N-*.js`。**不要手改 `web/index.html`**，每次构建都会覆盖。

---

## 2. 内容架构

九章是线性依赖链：`ch-01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09`；每章结尾的 `.next-chapter` 指向下一章，09 指回 01。`web/src/OUTLINE.md:27` 把 05/06 标为「腰」——跳过这两章，后面的内容接不上。

| 章 | 标题（`web/src/template.html:84-92`） | 一句话 | 汉字 / 图 / 代码块 |
|---|---|---|---|
| 01 | 全景：人形机器人到底难在哪 | 给出六层系统栈与 60 kg/30 DoF 的力矩预算，结论是难点在单边接触与带宽，不在关节数（OUTLINE 里仍写作「五层栈」，正文已统一为六层） | 6,514 / 5 / 1 |
| 02 | 机械设计：自由度、连杆与关节模组 | 用构型→运动学→雅可比→静力学，把「摆姿势」翻译成关节力矩需求 | 6,118 / 4 / 2 |
| 03 | 硬件系统：电机、驱动、传感、电源与算力 | 把力矩需求变成硬件规格（FOC、电压圆、热限、电源树、总线），回答能否持续输出 | 7,347 / 4 / 2 |
| 04 | 嵌入式软件：1 kHz 的实时世界 | 建立周期/抖动/截止期语义与分层频率，证明「准时」必须测量，并交出 1 kHz 力矩/位置接口 | 7,253 / 5 / 3 |
| 05 | 动力学与全身控制：让 30 个关节协同工作 | 在 1 kHz 接口上写浮基动力学与分层 QP，把「站住」变成带摩擦锥的任务优化 | 7,697 / 6 / 1 |
| 06 | 步态与 MPC：从 ZMP 到预测控制 | 用 LIPM、ZMP、DCM 与凸 MPC 决定脚落在哪，把平衡变成 0.5–1.6 s 的滚动优化 | 6,676 / 5 / 1 |
| 07 | 强化学习与 Sim2Real：在仿真里摔一百万次 | 当模型不可信时改用海量并行仿真、域随机化与 sim2sim 闸门 | 9,518 / 6 / 1 |
| 08 | 感知、状态估计与操作：机器人的眼睛和手 | 补上「我在哪、脚踩实没、手用多大力」，把开环闭成环 | 8,776 / 5 / 2 |
| 09 | 全栈路线图与经典论文索引 | 12 周 / 6 月 / 12 月路线、七级项目阶梯、30 篇论文与 15 个开源项目 | 9,102 / 4 / 1 |

难度曲线（`web/src/OUTLINE.md:283`）：01 俯瞰 → 02–04 单点深挖 → 05–06 系统耦合 → 07–08 换范式 → 09 收束。OUTLINE 标了两处最可能断层：04→05（从「时间」跳到「方程」）与 06→07（从「模型对」跳到「模型错」），并给了补桥建议（`web/src/OUTLINE.md:285-287`）；这是设计判断，不是已验证的教学效果。

每章固定包含：`.chapter-head` 导语、自动生成的 `.mini-toc`、≥2 个 `h2`、≥2 张图、≥1 段代码、`data-takeaways` 小结、`.next-chapter`。延伸阅读多数用 `.paper-list`（04 章没有该组件，7 个外链散在正文与图注里）。

---

## 3. 技术实现

### 3.1 自包含单文件与构建期内联

- `web/index.html` 内：`<img>` 0 个、`<link>` 1 个（favicon 是 `data:image/svg+xml` 内联 URI）、`@import` 0 处、外部 `src=` 0 处（本次用 grep 计数）。所有图示为手绘内联 SVG，无外链图片。
- 构建时 `<link rel="stylesheet" href="styles/site.css">` 变成 `<style>`，`<script src="scripts/site.js">` 变成内联 `<script>`（`web/build.py:127-159`）；`web/src/scripts/` 下未被模板引用的脚本按文件名排序追加到 `</body>` 前（`web/build.py:253-261`）。当前顺序：`site.js, core.js, demo-02…09`（`temp/build/report.json` 的 `scripts`）。
- 体积代价：906,699 字节、手机端页面高 222,376 px（`temp/render/m2/render.json`），首屏要下载并解析全部内容。

### 3.2 设计令牌

全部定义在 `web/src/styles/site.css` 的 `:root`，共 68 个自定义属性，全文 438 处 `var()` 引用。核心：

| 类别 | 令牌 | 值 | 用途 |
|---|---|---|---|
| 纸/墨 | `--paper` / `--ink` | `#F7F5F0` / `#14161A` | 底色与正文（对比度 16.6:1） |
| 结构色 | `--accent` | `#0E5A52` | 链接、当前章节、主按钮（7.4:1） |
| 编辑色 | `--accent-2` | `#B0652C` | kicker、图号、时间线（4.06:1，仅大字/线条） |
| 边界色 | `--signal` | `#C6472C` | 危险与失效（4.44:1，仅大字/线条） |
| 数据色 | `--d1`–`--d5` | 绿/铜/蓝/紫/金 | 图示数据系列，单图 ≤4 系列 |
| 小字替代 | `--muted-ink` / `--accent-2-ink` / `--signal-ink` | 5.6 / 6.0 / 6.1:1 | 12px 以下文字必须用这三个 |
| 版式 | `--measure-cn` / `--rail` / `--maxw` | `36em` / `268px` / `1180px` | 中文行长、桌面导航轨、最大内容宽 |

规则（`web/DESIGN.md:28-48`）：暗色只出现在 Hero、代码块、演示读数条；层次用发丝线、留白、字号对比，不用卡片阴影与圆角胶囊；图示必须有 `.fig-note`「读者应看出：…」。

### 3.3 交互演示清单（8 个，`data-demo` 与脚本注册名一致）

| `data-demo` | 章 | 演示什么 | 控件 → 读数 |
|---|---|---|---|
| `ik-2link` | 02 | 双连杆解析逆解：拖足端看膝前/膝后两组解与奇异 | 拖动 SVG（支持方向键）→ 髋角 θ1、膝角 θ2、足端 x/z、\|det J\| |
| `foc` | 03 | FOC 与六步换相：电流矢量轨迹与 dq 分量 | 电角速度、负载转矩 → iα、iβ、id、iq |
| `jitter` | 04 | 抖动与计算耗时如何吃掉 1 ms 截止期 | σ、计算耗时 c → 平均周期、p99、miss 率、每秒 miss |
| `friction-cone` | 05 | 摩擦锥约束下的水平加速度上限（canvas 侧视） | 竖直 a、水平 a、μ、质量 → Fz、Fx、μ_min、a_x,max |
| `lipm` | 06 | LIPM 侧视仿真：推一下看迈几步、捕获点偏多少 | 步频、步长、质心高度 → 质心速度、上一步步长、DCM 偏差、需求 μ |
| `reward` | 07 | 奖励塑形：三个权重把跳跃推成三种样子 | 目标高度、能耗权重、平滑权重 → 顶点高度、峰值力、能耗、10 s 平均奖励 |
| `fusion` | 08 | 一维位置估计：IMU 与腿里程计按增益 K 融合 | 零偏、噪声、里程计比例误差、K → 纯 IMU / 纯里程计 / 融合 RMSE、终点误差 |
| `roadmap-check` | 09 | 12 周清单勾选与工时累计 | 12 个复选框 → 已完成、累计投入、距第 12 周 |

01 章没有演示（它承担全站地图与难度定标）。演示统一用 `window.RoboDemo.register(name, fn)` 注册（`web/src/scripts/site.js:358-407`），控件必须是原生可聚焦元素，读数 2–4 项且带单位（`web/DESIGN.md:6.10`）。

### 3.4 无障碍

- `<body>` 第一个可聚焦元素是跳过链接 `跳到正文` → `#main`（`web/src/template.html:17`）；`#main` 带 `tabindex="-1"`（`:102`）。
- 顶部进度条 `#progress-bar` 为 `aria-hidden`（`:18`）；抽屉 `#menu-toggle` 有 `aria-controls`/`aria-expanded`（`:39`），`#toc-drawer` 有 `aria-hidden`（`:73`），Esc 关闭与焦点陷阱由外壳脚本实现。
- 复制代码后由 `#live-region`（`aria-live="polite"`，`:362`）播报。
- 焦点样式统一 `:focus-visible { outline: 2px solid var(--accent-2); outline-offset: 3px }`（`site.css:81`），未移除 outline。
- 图示全部 `role="img"` + `<title>` + `<desc>`，用 `aria-labelledby` 同时指向两者；表格有 `<caption>`。
- `prefers-reduced-motion: reduce` 时 CSS 动效关闭（`site.css:1213`），7 个演示脚本与 `core.js` 各自用 `matchMedia` 判断后停掉 rAF（如 `demo-07-rl.js:512`）。
- 无 JS 时不会白屏：入场隐藏只写在 `html.js [data-reveal]` 下（`site.css:1065-1070`），`template.html:2` 默认 `class="no-js"`；但演示、迷你目录、复制按钮会失效。

### 3.5 响应式与打印

- ≥1200 px：左侧 268 px 导航轨，正文 36 字/行，`.fig-wide` 向两侧最多扩 96 px。
- 768–1199 px：导航收为顶部 01–09 快速跳转 + 抽屉。
- <768 px：单列、正文 16 px、Hero 图在上文字在下；图/表/代码各自横滚（`.fig-scroll`、`.table-wrap`、`pre` 的 `overflow-x`）。
- 断点写在 `site.css:1073-1203`（1200/1024/899/767/639/400）。
- 打印：`@page { margin: 18mm 16mm 20mm }`（`site.css:1226-1227`），隐藏导航/抽屉/进度条/复制按钮/演示控件，每章另起页。
- 实测 1440 与 390 两种宽度横向溢出均为 0（`temp/render/r2/render.json`、`temp/render/m2/render.json` 的 `overflow`）。

---

## 4. 调研来源

七份底稿在 `temp/research/`，每份含概念地图、公式、工程数值、对比、误区、论文、开源项目、图示建议、进阶路径。以下只列最关键条目，★ 为经典必读。

**1) 机械与机构学**（`temp/research/01-mechanical.md`）
- Modern Robotics（教材与代码）https://hades.mech.northwestern.edu/index.php/Modern_Robotics ★
- Pratt & Williamson 1995, *Series Elastic Actuators* https://doi.org/10.1109/IROS.1995.525827
- Wensing et al. 2017, *Proprioceptive Actuator Design in the MIT Cheetah* https://doi.org/10.1109/TRO.2016.2640183 ★

**2) 硬件系统**（`temp/research/02-hardware.md`）
- Seok et al. 2015, *Design Principles for Energy-Efficient Legged Locomotion* https://doi.org/10.1109/TMECH.2014.2339013 ★
- Grimminger et al. 2019, 开源力矩控制关节（ODRI）https://arxiv.org/abs/1910.00093
- SimpleFOC https://github.com/simplefoc/Arduino-FOC （学 Clarke/Park 与电流环的最小实现）

**3) 嵌入式与实时**（`temp/research/03-embedded.md`）
- Liu & Layland 1973, *Scheduling Algorithms for Multiprogramming in a Hard-Real-Time Environment* https://doi.org/10.1145/321738.321743 ★
- Reghenzani et al. 2019, *The Real-Time Linux Kernel: A Survey on PREEMPT_RT* https://doi.org/10.1145/3297714
- Kim et al. 2019, *Highly Dynamic Quadruped Locomotion via Whole-Body Impulse Control and MPC* https://arxiv.org/abs/1909.06586 （40 kHz / 0.5 kHz / 40 Hz 三层频率的工程样本）

**4) 经典控制、步态与 MPC**（`temp/research/04-control-gait.md`）
- Kajita et al. 2003, *Biped Walking Pattern Generation by using Preview Control of ZMP* https://doi.org/10.1109/ROBOT.2003.1241826 ★
- Pratt et al. 2006, *Capture Point* https://doi.org/10.1109/ICHR.2006.321385 ★
- Herzog et al. 2014, *Balancing experiments … with hierarchical inverse dynamics* https://arxiv.org/abs/1305.2042

**5) 强化学习与 Sim2Real**（`temp/research/05-rl-sim2real.md`）
- PPO https://arxiv.org/abs/1707.06347 ★
- Rudin et al. 2021, *Learning to Walk in Minutes* https://arxiv.org/abs/2109.11978 ★
- RMA https://arxiv.org/abs/2107.04034

**6) 感知、状态估计与操作**（`temp/research/06-perception.md`）
- Forster et al. 2015, *On-Manifold Preintegration* https://arxiv.org/abs/1512.02363 ★
- Hartley et al. 2018, *Contact-Aided Invariant EKF* https://arxiv.org/abs/1805.10410
- Zhao et al. 2023, ACT https://arxiv.org/abs/2304.13705

**7) 论文与开源项目索引**（`temp/research/07-papers.md`）
- Raibert 1986, *Legged Robots That Balance* https://underactuated.mit.edu/simple_legs.html ★
- Hwangbo et al. 2019, *Learning agile and dynamic motor skills for legged robots* https://arxiv.org/abs/1901.08652 ★
- Radosavovic et al. 2023, *Real-World Humanoid Locomotion with RL* https://arxiv.org/abs/2303.03381

底稿的可信度标注：`03-embedded.md` 记录 4 条 DOI 用 `curl -sI` 实测返回 302、跟随后被出版商 403/202 挡住；`05-rl-sim2real.md` 明确标注 GAE 的会议归属未核验。引用具体数值前先回底稿看它的来源等级。

---

## 5. 质量门禁

### 5.1 构建器检查（`python3 web/build.py`）

**章节契约**（`web/build.py:187-218`），任一不满足即 error：

| 检查 | 阈值 |
|---|---|
| 文件开头 | 必须匹配 `<section id="ch-NN" …>`，且含 `data-chapter="NN"` |
| 图示 | ≥2 个 `<figure>` |
| 代码 | ≥1 个 `<pre>` |
| 小节 | ≥2 个 `<h2>` |
| 外链 | ≥2 个 `href="https://…"` |
| 小结 | ≥1 个 `data-takeaways` |
| 正文 | <700 汉字 error；700–1400 warning（目标 1400+） |
| 文件命名 | 必须 `NN-slug.html`；重号、缺章、未知章号都 error（`:162-184`） |

**全站检查**（`web/build.py:265-330`）：

| 检查 | 行为 |
|---|---|
| 标签闭合 | 自定义 `HTMLParser` 栈检查，未闭合/多余闭合报 error（`:52-109`） |
| id 唯一 | 重复 id 报 error，列出前 12 个（`:273-275`） |
| 锚点 | `href="#x"` 必须存在对应 id，否则 error（`:276-279`） |
| 章节锚点 | 每章必须有 `id="ch-NN"`；没有导航链接引用则 warning（`:281-285`） |
| 外部资源 | 出现 `<img>`、外链 script/link/iframe 即 error；CSS `@import url(http…)` 也 error（`:289-292`） |
| 占位残留 | `TODO` / `FIXME` / `待补充` / `占位文本` / `Lorem ipsum` → error（`:294-296`） |
| 模板拼接 | 正文出现 `undefined` / `[object Object]` / `NaN%` → warning（`:297-298`） |
| CSS 变量 | 用了未在页面里定义的 `var(--x)` → error（`:301-305`） |
| 演示接线 | `data-demo` 名字在脚本里找不到 → warning（`:308-314`） |
| JS 语法 | 用 `temp/toolchain/node/bin/node --check` 逐个检查 `web/src/scripts/*.js`；找不到 node 则 warning 跳过（`:317-330`） |
| SVG 数量 | 全页 <10 个 `<svg>` → warning（`:286-287`） |

### 5.2 渲染检查（`temp/toolchain/render.py`）

用 Playwright Chromium 打开 `file://`，收集 `consoleErrors`、`pageErrors`、`failedRequests`；量 `scrollWidth - clientWidth` 作为横向溢出；按 `section[id]` 记录每节 top/height 并切片截图；统计 `svg/canvas/pre/figure/demos/links/headings`；写 `render.json`（`render.py:84-145`）。

编排脚本把三条当 blocker（`temp/wf/humanoid-stack.ts:963-995`）：溢出 >2 px、任一 console/page error、构建 error；演示 <4 个记 major（最终要求 ≥6，实际 8 个）。桌面 1440 与手机 390 都跑。

### 5.3 评审与修订轮次

- 首轮：7 位评审并行——3 位视觉（只凭 `temp/render/r1` 截图）、2 位技术审校（对照 `temp/research/` 底稿）、2 位「零基础读者」通读 `temp/build/page.txt`（`humanoid-stack.ts:1002-1032`）。
- 修订：4 路并行——全局设计（`template.html`/`site.css`/`core.js`）、01–03 章、04–06 章、07–09 章（`humanoid-stack.ts:1044-1090`）；每条 issue 必须改掉或写明跳过理由。
- 终检：视觉 + 技术各 1 位，核对修订是否真的落地；只报 blocker/major（`humanoid-stack.ts:1152-1178`）。
- 第二轮：仅当仍有 blocker 才触发定向修复，并重新构建、渲染到 `temp/render/r3`（`humanoid-stack.ts:1180-1234`）。
- 构建失败时另有最多 2 轮按章节修复（`humanoid-stack.ts:885-927`）。

### 5.4 最终结论

本次（2026-11-09）重跑 `python3 web/build.py --no-write`：退出码 0，输出 `章节 9 | 汉字 69846 | svg 46 | canvas 8 | figure 44 | code 14 | demo 8 | 外链 124 | 885 KB`，`errors: []`、`warnings: []`。

- `temp/render/r2/render.json`：1440 宽，`scrollHeight` 184,699，`overflow` 0，console/page/failed 全为 `[]`。
- `temp/render/m2/render.json`：390 宽，`scrollHeight` 222,376，`overflow` 0，全为 `[]`。
- 首轮 `r1/m1`：178,837 / 211,029 px，`overflow` 0，同样无报错。
- 目录中不存在 `temp/render/r3`；按脚本逻辑，这意味着终检后没有剩余 blocker、第二轮未触发（这是从目录与脚本推得，运行日志未落盘，具体 issue 条数无法核对）。

---

## 6. 已知局限

1. **教学简化模型**：06 章的 LIPM 假设腿无质量、质心等高，凸 MPC 用单刚体动力学（SRBD，`05-dynamics.html:121` 自己说明腿摆角动量占 5–10%），02 章的 IK 只做双连杆平面；`web/src/sections/06-gait.html:148` 直接写「粗暴简化」。这些用于建立直觉，不能当控制器设计依据。
2. **没有真机与实测数据**：8 个演示全部是浏览器里的解析计算/数值积分，脚本中 `fetch`/`XHR`/`WebSocket` 均为 0 处；没有连接真实机器人、真实日志或数据集。页脚也写明「图示为手绘 SVG，非工程图纸」。
3. **数值是量级估计**：全站 32 处图注写「来源：作者绘制」，3 处写「量级示意」，2 处写「不是实测」；`04-embedded.html:152` 明确说分段取值是「量级估计」。不要把这些数当规格书。
4. **年份会过期**：Edition 1.0 · 2026；09 章价格取「2026 年公开报价」（`09-roadmap.html:468`）、许可证「2026 年 11 月核对」（`:931`）、论文时间轴止于 2025（`:560`）。机型参数、价格、论文数量都会随时间失真。
5. **外链未做最终全量核验**：124 个外链；最终 `temp/build/report.json` 没有 `links` 字段，说明最后一次构建没跑 `--links`。`temp/verify/url_log.txt` 只有 22 个唯一 URL 的抽样（且只打印 6 条状态）。发布前请跑 `python3 web/build.py --links`，它把 403/405/429 也算可达（`build.py:374-401`），仍可能漏掉付费墙后的死链。
6. **单文件体积**：906,699 字节、46 个内联 SVG + 8 个 canvas，手机页面高 222,376 px；低端机首屏解析成本高，没有做懒加载或分页。
7. **依赖 JS 的部分**：无 JS 时正文可读，但演示、迷你目录、复制按钮、抽屉目录全部失效；没有 `<noscript>` 提示。
8. **单语言、无搜索**：没有英文版、全文搜索或术语跳转；126 个标题只能靠导航轨与浏览器查找。

---

## 7. 目录结构与文件清单

```
web/
├── index.html            906,699 B  产物（唯一交付物），构建覆盖，不要手改
├── build.py               16,708 B  构建 + 校验（405 行），改检查逻辑前先读第 187–330 行
├── DESIGN.md              40,237 B  设计系统与组件手册，撰稿唯一排版依据
├── __pycache__/                     构建缓存，可删
└── src/
    ├── template.html      21,098 B  外壳：head、导航轨、Hero、全书地图、<!-- SECTIONS -->、页脚（366 行）
    ├── OUTLINE.md         22,668 B  九章施工图、符号表、30 条术语
    ├── styles/site.css    62,023 B  全站视觉唯一来源（1,286 行，:root 68 个令牌）
    ├── scripts/           10 个 js   site.js 14,116；core.js 25,976；demo-02…09 共 109,079 B
    └── sections/          9 个 html  01:53,986 … 06:107,601 B，合计 673,950 B
```

```
temp/                    合计约 1.4 GB（大头是 toolchain/browsers 681 MB、node 192 MB、pylib 144 MB）
├── build/               产物：report.json（最终统计）、page.txt（329,166 B 纯文本，供评审）、js-check/（node --check 副本）
├── render/              产物：r1/r2（1440）、m1/m2（390）的 full.png + sec-*/slice-*.png + render.json
├── toolchain/           工具：render.py、node/（v22.14.0）、pylib/（playwright）、browsers/；重建截图与 JS 检查都靠它，别删
├── research/            素材：7 份底稿（01–07）+ 论文 PDF 与 URL 抓取
├── wf/humanoid-stack.ts 本次运行的编排脚本（10 个 phase：调研→设计→撰写→构建→评审→修订→终检→[第二轮]→[最终验收]→交付，方括号为条件分支）
└── 其余                 过程文件，可删：ch01/ch02/ch04、preview/、preview05/、figs/、parts/、sim/、probe/、raw/、pdfs/、verify/、shots08/、shots09/、shots09-m/、revise07-09/、fixture/、smoke/、buildtest/
```

判断：要交付只需 `web/`；要重建只需 `web/` + `temp/toolchain/`；`temp/build/report.json` 与 `temp/render/*/render.json` 是验收证据，建议保留；其余 `temp/` 内容都是中间稿。

---

## 8. 后续可做

1. **补 01 章演示**：现在唯一没有交互的章是 01。可在 `web/src/sections/01-overview.html` 的「六层栈」后加一个延迟预算滑块（感知 40 ms / 规划 20 ms / WBC 0.5 ms / 伺服 0.05 ms），配 `web/src/scripts/demo-01-overview.js`，用 `RoboDemo.register('stack-latency', …)` 注册；构建会自动内联，无需改模板。
2. **接真实数据**：把 `demo-08-perception.js` 的合成 IMU 换成公开数据集的一段真值轨迹（内联成 JS 数组，保持单文件），把 03 章的转矩-转速工作点换成实测采样。改完同步更新图注里的「量级示意」措辞，否则图与数据不一致。
3. **拆分多页**：`web/build.py` 目前硬编码把九章拼进一个文件（`build.py:33-43, 236-248`）。可加 `--split` 模式，输出 `web/ch/01.html … 09.html` 加共享 `site.css`/`core.js`，并在模板加跨页导航；单文件版保留作离线副本。
4. **加搜索**：标题 126 个、正文 69,846 字，可在构建时生成 `[{id,title,text}]` 的 JSON 内联进页面，抽屉里加输入框做子串/拼音首字母匹配；索引直接复用 `build.py` 已有的 `text_of()`（`build.py:112-119`）与 `temp/build/page.txt`。
5. **英文版**：复制 `web/src/sections/` 为 `sections-en/`，在 `build.py` 加 `--lang en` 选择章节目录与 `template-en.html`，保留同一套 `site.css`；先做 01/09 两章验证排版（中文 36 字行长与英文 68ch 行长不同，需要 `--measure` 切换）。
