/**
 * 思维导图横向树布局算法
 *
 * 将 parser 产出的多棵树计算为带坐标的节点与连线：
 * - 叶子节点按顺序纵向排列，父节点居中于其所有子节点
 * - 层级（depth）决定横向列位置，列宽取该层最长文本
 * - 深度可能不规范（如文件直接从 ## 开始），布局时统一平移到从 1 起
 */
import type { MindmapNode } from "./parser"

/** 布局后的节点（含坐标与尺寸） */
export interface LaidNode {
  /** 原始节点 */
  node: MindmapNode
  /** 左上角 X */
  x: number
  /** 左上角 Y */
  y: number
  /** 节点宽 */
  w: number
  /** 节点高 */
  h: number
  /** 归一化后的层级（从 1 起） */
  level: number
}

/** 父子连线（两端均为布局后节点） */
export interface LaidEdge {
  from: LaidNode
  to: LaidNode
}

/** 布局结果 */
export interface LayoutResult {
  nodes: LaidNode[]
  edges: LaidEdge[]
  roots: LaidNode[]
  width: number
  height: number
}

/** 节点固定高度 */
const NODE_H = 32
/** 同级节点纵向间距 */
const V_GAP = 10
/** 列间距 */
const H_GAP = 56
/** 画布四周留白 */
const PAD_X = 32
const PAD_Y = 28
/** 多棵树根节点之间的额外间距 */
const ROOT_GAP = 28
/** 节点宽度上下限 */
const MIN_W = 64
const MAX_W = 260
/** 文本左右内边距 */
const TEXT_PAD_X = 22

/**
 * 估算文本显示宽度 — 中日韩等宽角字符按 15px，其余按 8px
 */
function measureText(text: string): number {
  let width = 0
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    width += code >= 0x2e80 ? 15 : 8
  }
  return Math.min(MAX_W, Math.max(MIN_W, width + TEXT_PAD_X))
}

/**
 * 计算横向树布局
 * @param forestRoots parser 产出的根节点数组
 * @returns 全部节点坐标、连线与画布尺寸
 */
export function layoutMindmap(forestRoots: MindmapNode[]): LayoutResult {
  const nodes: LaidNode[] = []
  const edges: LaidEdge[] = []
  const laidRoots: LaidNode[] = []
  if (forestRoots.length === 0) {
    return { nodes, edges, roots: [], width: 0, height: 0 }
  }

  // 第一遍：求最小深度（用于归一化）与每层最大节点宽
  let minDepth = Infinity
  const colWidth = new Map<number, number>()
  const walk = (n: MindmapNode): void => {
    minDepth = Math.min(minDepth, n.depth)
    const w = measureText(n.text)
    colWidth.set(n.depth, Math.max(colWidth.get(n.depth) ?? 0, w))
    n.children.forEach(walk)
  }
  forestRoots.forEach(walk)

  // 各列起点 X：按深度顺序累加列宽
  const depths = [...colWidth.keys()].sort((a, b) => a - b)
  const xForDepth = new Map<number, number>()
  let cursorX = PAD_X
  for (const d of depths) {
    xForDepth.set(d, cursorX)
    cursorX += (colWidth.get(d) ?? MIN_W) + H_GAP
  }
  const canvasWidth = cursorX - H_GAP + PAD_X

  // 第二遍：DFS 分配 Y（叶子占行，父节点居中）
  let cursorY = PAD_Y
  const dfs = (node: MindmapNode): LaidNode => {
    const w = colWidth.get(node.depth) ?? MIN_W
    const x = xForDepth.get(node.depth) ?? PAD_X
    let y: number
    let laid: LaidNode

    if (node.children.length === 0) {
      y = cursorY
      cursorY += NODE_H + V_GAP
      laid = { node, x, y, w, h: NODE_H, level: node.depth - minDepth + 1 }
    } else {
      const childLaid = node.children.map((c) => dfs(c))
      const first = childLaid[0]
      const last = childLaid[childLaid.length - 1]
      const centerY = (first.y + first.h / 2 + last.y + last.h / 2) / 2
      y = centerY - NODE_H / 2
      laid = { node, x, y, w, h: NODE_H, level: node.depth - minDepth + 1 }
      for (const child of childLaid) {
        edges.push({ from: laid, to: child })
      }
    }

    nodes.push(laid)
    return laid
  }

  forestRoots.forEach((root, idx) => {
    const laidRoot = dfs(root)
    laidRoots.push(laidRoot)
    // 多棵树之间拉开额外间距
    if (idx < forestRoots.length - 1) cursorY += ROOT_GAP
  })

  const canvasHeight = cursorY - V_GAP + PAD_Y
  return { nodes, edges, roots: laidRoots, width: canvasWidth, height: canvasHeight }
}

/**
 * 按节点宽度截断显示文本（超长加省略号），完整文本通过 title 提示展示
 */
export function fitLabel(text: string, width: number): string {
  const budget = width - TEXT_PAD_X
  let used = 0
  let result = ""
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    used += code >= 0x2e80 ? 15 : 8
    if (used > budget - 10) {
      return result + "…"
    }
    result += ch
  }
  return result
}
