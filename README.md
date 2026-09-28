# 思维导图查看器（GeWu 插件）

将 Markdown 标题 / 缩进列表渲染为横向思维导图的 GeWu 查看器插件，纯前端实现，不请求任何额外权限。

## 文件格式

新建扩展名为 `.mindmap` 的文本文件，用 Markdown 语法书写，支持两种写法：

### 写法一：标题层级

```markdown
# 项目启动
## 需求
### 用户调研
### 竞品分析
## 设计
### 信息架构
### 视觉稿
## 交付
```

### 写法二：缩进列表

```markdown
- 项目启动
  - 需求
    - 用户调研
    - 竞品分析
  - 设计
    - 信息架构
```

两种写法可混用；代码围栏（```` ``` ````）内的内容会被忽略。

## 功能

- 双击 `.mindmap` 文件自动在思维导图视图打开
- 滚轮缩放（以光标为中心）、拖拽平移
- 工具栏：放大 / 缩小 / 适应窗口 / 导图·源码切换
- 超长节点自动截断，悬停查看全文

## 开发

```powershell
npm install
npm run build      # 产物输出到 dist/
npm run typecheck
```

## 打包发布

```powershell
.\pack.ps1 -Version 0.1.0 `
  -DownloadUrl "https://github.com/li360/plugin-mindmap-viewer/releases/latest/download/gewu-plugin.zip"
```

将 `dist/gewu-plugin.zip` 与 `dist/update.json` 上传到 GitHub Release 即可被 GeWu 的「URL 安装」识别。
