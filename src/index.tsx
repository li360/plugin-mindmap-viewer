/**
 * 思维导图查看器插件入口
 *
 * 监听 file:open 事件（.mindmap 文件），将 Markdown 标题/缩进列表
 * 解析为树，并用 SVG 渲染为横向思维导图。
 *
 * 交互：滚轮缩放（以光标为中心）、拖拽平移、工具栏缩放/适应窗口、
 * 导图/源码视图切换。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { PluginContext, PluginManifest, RoutedPayload } from "plugin-protocol"
import { createMultiInstanceFilter } from "./multiInstance"
import { parseMindmap } from "./parser"
import { layoutMindmap, fitLabel } from "./layout"
import type { LaidNode } from "./layout"

/** file:open 载荷类型（与内置查看器一致） */
type OpenPayload = {
  path: string
  name: string
  ext: string
  content?: string | Uint8Array
} & RoutedPayload

/** 缩放范围 */
const MIN_ZOOM = 0.1
const MAX_ZOOM = 4

/** 按层级取色的调色板（循环使用） */
const PALETTE = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"]

/** 工具栏按钮样式（复用宿主 CSS 变量，融入明暗主题） */
const toolbarBtnStyle: React.CSSProperties = {
  border: "1px solid var(--color-border)",
  background: "var(--color-bg-secondary)",
  color: "var(--color-text-primary)",
  borderRadius: 6,
  padding: "3px 10px",
  fontSize: 13,
  cursor: "pointer",
  lineHeight: "20px",
}

/**
 * 生成父子节点之间的三次贝塞尔连线路径
 */
function edgePath(from: LaidNode, to: LaidNode): string {
  const x1 = from.x + from.w
  const y1 = from.y + from.h / 2
  const x2 = to.x
  const y2 = to.y + to.h / 2
  const midX = (x1 + x2) / 2
  return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`
}

/** 思维导图查看器组件 */
function MindmapViewer({ containerId, on }: PluginContext) {
  /** 当前打开的文件名 */
  const [fileName, setFileName] = useState("")
  /** 文件原始文本 */
  const [rawText, setRawText] = useState("")
  /** 是否处于纯前端无内容模式 */
  const [noContent, setNoContent] = useState(false)
  /** 视图：导图 / 源码 */
  const [view, setView] = useState<"mindmap" | "source">("mindmap")
  /** 缩放与平移 */
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  /** 是否正在拖拽平移 */
  const draggingRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 })

  /** 容器 DOM 与尺寸（用于适应窗口与光标缩放） */
  const containerRef = useRef<HTMLDivElement>(null)
  const [viewSize, setViewSize] = useState({ w: 0, h: 0 })

  /** 解析 + 布局（文本变化时重算） */
  const layout = useMemo(() => {
    const parsed = parseMindmap(rawText)
    return { ...layoutMindmap(parsed.roots), nodeCount: parsed.nodeCount }
  }, [rawText])

  /** 让 ref 始终持有最新容器尺寸，供非 React 事件回调读取 */
  const viewSizeRef = useRef(viewSize)
  viewSizeRef.current = viewSize

  /**
   * 计算"适应窗口"的缩放与平移 — 整张图居中完整可见
   */
  const computeFit = useCallback(() => {
    const { w: vw, h: vh } = viewSizeRef.current
    if (!vw || !vh || layout.width === 0) return { zoom: 1, x: 0, y: 0 }
    const z = Math.min(vw / layout.width, vh / layout.height, 1.2)
    return {
      zoom: z,
      x: (vw - layout.width * z) / 2,
      y: (vh - layout.height * z) / 2,
    }
  }, [layout.width, layout.height])

  /** 监听容器尺寸变化 */
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect
      setViewSize({ w: rect.width, h: rect.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /** 订阅 file:open — 多实例过滤 + 扩展名过滤 + 文本解码 */
  useEffect(() => {
    const shouldHandle = createMultiInstanceFilter(containerId)
    const unsub = on("file:open", (payload: unknown) => {
      const p = payload as OpenPayload
      if (!shouldHandle(p)) return
      if (p.ext.toLowerCase() !== ".mindmap") return

      setFileName(p.name || p.path.split(/[\\/]/).pop() || "")
      setNoContent(false)

      if (typeof p.content === "string") {
        setRawText(p.content)
      } else if (p.content instanceof Uint8Array) {
        setRawText(new TextDecoder("utf-8").decode(p.content))
      } else {
        // 非 Tauri 环境无预加载内容
        setRawText("")
        setNoContent(true)
      }
      setView("mindmap")
    })
    return unsub
  }, [on, containerId])

  /** 文件首次加载或容器尺寸就绪后自动适应窗口 */
  const autoFitRef = useRef(false)
  useEffect(() => {
    if (!autoFitRef.current && viewSize.w > 0 && viewSize.h > 0 && rawText) {
      autoFitRef.current = true
      const fit = computeFit()
      setZoom(fit.zoom)
      setPan({ x: fit.x, y: fit.y })
    }
  }, [viewSize, rawText, computeFit])

  /**
   * 滚轮缩放 — 以光标位置为缩放锚点
   * 需非 passive 监听以便 preventDefault 阻止页面滚动
   */
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
      setZoom((z) => {
        const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * factor))
        const realFactor = next / z
        // 保持光标下的图点不动：mouse - (mouse - pan) * factor
        setPan((prev) => ({
          x: mx - (mx - prev.x) * realFactor,
          y: my - (my - prev.y) * realFactor,
        }))
        return next
      })
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [])

  /** 拖拽平移 */
  const onMouseDown = (e: React.MouseEvent) => {
    draggingRef.current = true
    dragStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }
  }
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return
      setPan({
        x: dragStartRef.current.panX + (e.clientX - dragStartRef.current.x),
        y: dragStartRef.current.panY + (e.clientY - dragStartRef.current.y),
      })
    }
    const onUp = () => {
      draggingRef.current = false
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [])

  /** 工具栏：缩放 */
  const zoomBy = (factor: number) => {
    setZoom((z) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * factor))
      const { w: vw, h: vh } = viewSize
      // 以视口中心为锚点
      setPan((prev) => ({
        x: vw / 2 - (vw / 2 - prev.x) * (next / z),
        y: vh / 2 - (vh / 2 - prev.y) * (next / z),
      }))
      return next
    })
  }
  /** 工具栏：适应窗口 */
  const fitToView = () => {
    const fit = computeFit()
    setZoom(fit.zoom)
    setPan({ x: fit.x, y: fit.y })
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--color-bg-primary)",
        color: "var(--color-text-primary)",
        fontFamily: "var(--font-sans)",
        overflow: "hidden",
      }}
    >
      {/* 工具栏 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 10px",
          borderBottom: "1px solid var(--color-border)",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600 }}>🧠 思维导图</span>
        {fileName && (
          <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{fileName}</span>
        )}
        <div style={{ flex: 1 }} />
        <button type="button" style={toolbarBtnStyle} onClick={() => zoomBy(1 / 1.2)} title="缩小">
          －
        </button>
        <span style={{ fontSize: 12, minWidth: 44, textAlign: "center" }}>
          {Math.round(zoom * 100)}%
        </span>
        <button type="button" style={toolbarBtnStyle} onClick={() => zoomBy(1.2)} title="放大">
          ＋
        </button>
        <button type="button" style={toolbarBtnStyle} onClick={fitToView} title="适应窗口">
          适应
        </button>
        <button
          type="button"
          style={toolbarBtnStyle}
          onClick={() => setView((v) => (v === "mindmap" ? "source" : "mindmap"))}
        >
          {view === "mindmap" ? "源码" : "导图"}
        </button>
      </div>

      {/* 内容区 */}
      {!fileName ? (
        <EmptyHint text="双击 .mindmap 文件在此查看思维导图" />
      ) : noContent ? (
        <EmptyHint text="当前环境无法加载文件内容，请在 GeWu 桌面端打开" />
      ) : layout.nodeCount === 0 ? (
        view === "source" ? (
          <SourceView text={rawText} />
        ) : (
          <EmptyHint text="未识别到标题（#）或列表（-）条目，请切换到源码视图检查内容" />
        )
      ) : view === "source" ? (
        <SourceView text={rawText} />
      ) : (
        <div
          ref={containerRef}
          onMouseDown={onMouseDown}
          style={{ flex: 1, cursor: "grab", position: "relative", userSelect: "none" }}
        >
          <svg width="100%" height="100%">
            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
              {/* 连线 */}
              {layout.edges.map((edge, i) => (
                <path
                  key={`e-${i}`}
                  d={edgePath(edge.from, edge.to)}
                  fill="none"
                  stroke={PALETTE[(edge.from.level - 1) % PALETTE.length]}
                  strokeWidth={1.6}
                  strokeOpacity={0.5}
                />
              ))}
              {/* 节点 */}
              {layout.nodes.map((n, i) => {
                const fill = PALETTE[(n.level - 1) % PALETTE.length]
                const label = fitLabel(n.node.text, n.w)
                return (
                  <g key={`n-${i}`}>
                    <rect
                      x={n.x}
                      y={n.y}
                      width={n.w}
                      height={n.h}
                      rx={8}
                      ry={8}
                      fill={fill}
                      opacity={n.level === 1 ? 1 : 0.92}
                    />
                    <text
                      x={n.x + 11}
                      y={n.y + n.h / 2}
                      dominantBaseline="central"
                      fontSize={13}
                      fill="#ffffff"
                      fontWeight={n.level === 1 ? 700 : 500}
                    >
                      {label}
                      {label !== n.node.text && <title>{n.node.text}</title>}
                    </text>
                  </g>
                )
              })}
            </g>
          </svg>
        </div>
      )}
    </div>
  )
}

/** 居中提示 */
function EmptyHint({ text }: { text: string }) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--color-text-secondary)",
        fontSize: 13,
        textAlign: "center",
        padding: 24,
      }}
    >
      {text}
    </div>
  )
}

/** 只读源码视图 */
function SourceView({ text }: { text: string }) {
  return (
    <pre
      style={{
        flex: 1,
        margin: 0,
        padding: "12px 16px",
        overflow: "auto",
        fontSize: 13,
        lineHeight: 1.6,
        fontFamily: "var(--font-mono, monospace)",
        background: "var(--color-bg-primary)",
        color: "var(--color-text-primary)",
        whiteSpace: "pre-wrap",
      }}
    >
      {text}
    </pre>
  )
}

/** 插件声明 — GeWu 插件唯一入口 */
const manifest: PluginManifest = {
  id: "plugin-mindmap-viewer",
  name: "思维导图查看器",
  icon: "🧠",
  component: MindmapViewer,
  isEditor: true,
  preferredExtensions: [".mindmap"],
  handles: ["file:open"],
  emits: [],
}

export default manifest
