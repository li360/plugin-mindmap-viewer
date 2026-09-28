import { build } from "esbuild"
import { copyFile, mkdir, rm } from "node:fs/promises"

/**
 * 构建脚本 — 将 src/index.tsx 打包为 GeWu 插件产物 dist/index.js
 * 关键点：react / plugin-protocol 等由主程序提供，必须 external，
 * 否则会出现双 React 实例导致 hooks 失效。
 */
async function main() {
  await rm("dist", { recursive: true, force: true })
  await mkdir("dist", { recursive: true })

  await build({
    entryPoints: ["src/index.tsx"],
    bundle: true,
    format: "esm",
    outfile: "dist/index.js",
    jsx: "automatic",
    target: "es2020",
    external: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "plugin-protocol",
      "kmgr-api",
      "workspace",
    ],
  })

  await copyFile("manifest.json", "dist/manifest.json")
  console.log("✅ 打包完成：dist/index.js + dist/manifest.json")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
