# 人形机器人全栈手册

一本面向「会一点 Python、没有机器人背景」读者的中文技术读物：从机械设计、硬件系统、嵌入式实时软件，一路讲到动力学与全身控制、步态与 MPC、强化学习与 Sim2Real、感知与操作，最后给出 12 周学习路线和经典论文索引。

**在线阅读**：<https://sheerand.github.io/humanoid-handbook/>

- 9 章，约 7 万汉字，44 张图（内联 SVG 与 canvas）、14 个代码块、8 个可交互演示
- 单文件、零外部依赖：不加载任何 CDN、网络字体或图片，断网也能看

## 本地打开

双击 `docs/index.html` 即可，无需服务器。它是构建产物，所有 CSS/JS 都已内联。

## 目录

```
docs/
  index.html        构建产物，GitHub Pages 直接发布这个文件
  .nojekyll         告诉 GitHub Pages 不要走 Jekyll 处理
web/
  src/sections/     9 章正文（HTML 片段，一章一个文件）
  src/styles/       设计系统（色彩令牌、排版、组件）
  src/scripts/      全站交互 + 每个演示的脚本
  src/template.html 页面外壳（导航、hero、页脚）
  src/OUTLINE.md    课程结构与术语约定
  DESIGN.md         组件手册（改版式时先读这个）
  build.py          构建 + 静态检查（内联 CSS/JS、结构校验、JS 语法）
agent.md            工作记录：调研来源、质量门禁、已知局限
temp/               过程文件（调研底稿、截图、工具链），不入库
```

## 重新构建

```bash
python3 web/build.py                 # 生成 web/index.html，并打印检查结果
cp web/index.html docs/index.html    # 同步到发布目录
```

`build.py` 会检查：9 章是否齐全、元素 id 是否唯一、锚点是否可解析、CSS 变量是否有定义、内联 JS 的语法、占位残留，以及每章的图/代码/链接数量。退出码 0 表示没有 error。

想改内容就改 `web/src/sections/NN-*.html`；想改版式先读 `web/DESIGN.md`，组件片段都在里面。

## 部署到 GitHub Pages

本仓库已按这套配置部署：`main` 分支的 `/docs` 目录。下面是重新搭建时的步骤。

1. 在 GitHub 新建一个 **public** 仓库（不要勾选初始化 README）。
2. 本地推送：

   ```bash
   git remote add origin https://github.com/<你的用户名>/<仓库名>.git
   git push -u origin main
   ```

3. 仓库 **Settings → Pages**：Source 选 `Deploy from a branch`，Branch 选 `main`、目录选 `/docs`，保存。
4. 等 1–2 分钟，访问 `https://<你的用户名>.github.io/<仓库名>/`。

私有仓库也能用 Pages，但需要 GitHub Pro；这个页面的内容全部来自公开资料，公开仓库即可。

## 说明

- 页面中的控制算法与交互演示均为教学简化模型，未在真机上验证，正文里逐处标注了「简化」。
- 产品参数与论文信息来自公开资料，未逐篇精读原文，引用前请核对原始出处。
- 外链指向论文、项目与课程官网；若某条失效，直接改对应章节的 `<a href="...">` 后重新构建。
