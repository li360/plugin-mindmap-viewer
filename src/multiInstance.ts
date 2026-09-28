/**
 * 多实例事件过滤器（本地实现）
 *
 * 与 plugin-protocol 的 createMultiInstanceFilter 行为完全一致。
 * GeWu 0.30.0 的外部插件加载器仅代理 react / react/jsx-runtime，
 * 尚未代理 plugin-protocol 的运行时导出，因此此处自带纯函数实现；
 * 类型仍从 plugin-protocol 以 import type 方式引用（编译后擦除，不产生导入）。
 *
 * 后续主程序版本支持 plugin-protocol 代理后，可改回：
 *   import { createMultiInstanceFilter } from "plugin-protocol"
 */
import type { RoutedPayload } from "plugin-protocol"

/**
 * 创建多实例过滤谓词 — 插件订阅公共事件（file:open 等）时必须使用
 * @param containerId 当前插件组件所属容器 ID
 * @returns 谓词函数，返回 true 表示当前实例应处理该事件载荷
 */
export function createMultiInstanceFilter(
  containerId: string,
): (payload: RoutedPayload) => boolean {
  const isDynamic = containerId.includes("#")
  return (payload: RoutedPayload) => {
    if (payload.__targetContainer !== undefined) {
      // 路由事件：仅匹配的容器响应
      return payload.__targetContainer === containerId
    }
    // 原始事件：动态实例忽略；原生实例不响应 openIn:"new"
    if (isDynamic) return false
    if (payload.openIn === "new") return false
    return true
  }
}
