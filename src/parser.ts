/**
 * Markdown 思维导图解析器
 *
 * 支持两种写法（可混用，按层级深度挂接）：
 * 1. ATX 标题：# / ## / ### ...，# 数量即层级
 * 2. 缩进列表：- / * / + / 1. 开头，每 2 个空格（或 1 个 Tab）缩进一级
 *
 * 混用语义（与 markmap 一致）：顶层列表项挂在"最近一个标题"之下，
 * 即列表层级 = 当前标题深度 + 缩进层级；纯列表文件则从第 1 级开始。
 *
 * 代码围栏（```）内的内容一律忽略，避免代码示例里的 # 被误判为标题。
 */

/** 思维导图节点（解析产物） */
export interface MindmapNode {
  /** 节点纯文本（已去除内联 Markdown 标记） */
  text: string
  /** 层级深度，从 1 开始 */
  depth: number
  /** 原文行号（从 1 开始），便于定位 */
  line: number
  /** 子节点 */
  children: MindmapNode[]
}

/** 解析结果 */
export interface ParseResult {
  /** 根节点列表（可能有多个一级节点） */
  roots: MindmapNode[]
  /** 被识别为节点的总行数 */
  nodeCount: number
}

/** 标题行正则：#{1,6} 空格 文本（允许行尾闭合 #） */
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/

/** 列表行正则：前导缩进 + 列表符号（短横、星号、加号或数字点）+ 空格 + 文本 */
const LIST_RE = /^(\s*)(?:[-*+]|\d+[.)])\s+(.+)$/

/**
 * 去除内联 Markdown 标记，只保留可读纯文本
 * 处理：加粗/斜体、行内代码、链接 [text](url)、图片
 */
export function stripInlineMarkdown(raw: string): string {
  let text = raw.trim()
  // 图片/链接：保留展示文本
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
  // 加粗、斜体、行内代码标记
  text = text.replace(/(\*\*|__|``?|\*\*?|__?)/g, "")
  return text.trim()
}

/**
 * 将 Markdown 文本解析为多棵思维导图树
 * @param markdown 文件原始文本
 * @returns 根节点数组与统计信息
 */
export function parseMindmap(markdown: string): ParseResult {
  const lines = markdown.split(/\r?\n/)
  /** 建树栈：栈顶为当前父节点候选 */
  const stack: MindmapNode[] = []
  const roots: MindmapNode[] = []
  let nodeCount = 0
  /** 是否处于代码围栏中 */
  let inFence = false
  /** 最近一个标题的深度 — 混写时列表层级叠加在它之下（0 表示尚无标题） */
  let currentHeadingDepth = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // 代码围栏开关（``` 或 ~~~）
    if (/^(`{3,}|~{3,})/.test(trimmed)) {
      inFence = !inFence
      continue
    }
    if (inFence || !trimmed) continue

    let depth = 0
    let text = ""

    const headingMatch = trimmed.match(HEADING_RE)
    if (headingMatch) {
      depth = headingMatch[1].length
      text = headingMatch[2]
      currentHeadingDepth = depth
    } else {
      const listMatch = line.match(LIST_RE)
      if (listMatch) {
        // 前导缩进：Tab 统一按 2 空格计，每 2 空格一级；
        // 顶层列表项叠加到当前标题之下（混写场景）
        const indent = listMatch[1].replace(/\t/g, "  ")
        depth = currentHeadingDepth + Math.floor(indent.length / 2) + 1
        text = listMatch[2]
      }
    }

    if (depth === 0) continue

    const node: MindmapNode = {
      text: stripInlineMarkdown(text),
      depth,
      line: i + 1,
      children: [],
    }

    // 弹出深度 >= 当前的栈顶，找到真正的父节点
    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
      stack.pop()
    }
    if (stack.length === 0) {
      roots.push(node)
    } else {
      stack[stack.length - 1].children.push(node)
    }
    stack.push(node)
    nodeCount++
  }

  return { roots, nodeCount }
}
