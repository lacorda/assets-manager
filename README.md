# assets-manager

Webpack 插件：扫描项目中的本地图片资源并生成统计报告。

## 安装

- 安装依赖：
  - `npm i @lacorda/assets-manager`
- 构建（仅开发者需要）：
  - `npm i -D tsup typescript @types/node`
  - `npm run build`

## 快速使用

在你的 `webpack.config.js` 中添加插件：

```js
const path = require('path');
const { AssetsManagerPlugin } = require('@lacorda/assets-manager'); // 如未发布到 npm，可改为相对路径引用 dist/index.cjs

module.exports = {
  output: { path: path.resolve(__dirname, 'dist') },
  plugins: [
    new AssetsManagerPlugin({
      mode: 'static',
      openInBrowser: true,
      outputJson: true,
      reportFilename: 'assets-report.html',
      reportJson: 'asset-report.json',
      ignorePaths: ['node_modules', '.git', 'dist']
    })
  ]
};
```

## 在 Taro 中使用

- 使用 `webpackChain` 注入插件（可在 `mini` 与 `h5` 下分别配置）：

```js
// config/index.js
module.exports = {
  mini: {
    webpackChain(chain) {
      chain
        .plugin('assets-manager')
        .use(require('@lacorda/assets-manager').AssetsManagerPlugin, [
          {
            mode: 'static',
            openInBrowser: true,
            outputJson: true,
          },
        ]);
    },
  },
  h5: {
    webpackChain(chain) {
      chain
        .plugin('assets-manager')
        .use(require('@lacorda/assets-manager').AssetsManagerPlugin, [
          {
            mode: 'static',
            openInBrowser: true,
            outputJson: true,
          },
        ]);
    },
  },
};
```

- 若使用 ESM/TS 配置：

```ts
// taro.config.ts 或 config/index.ts
import { AssetsManagerPlugin } from '@lacorda/assets-manager';

export default {
  mini: {
    webpackChain(chain) {
      chain.plugin('assets-manager').use(AssetsManagerPlugin, [
        { mode: 'static', openInBrowser: true, outputJson: true },
      ]);
    },
  },
  h5: {
    webpackChain(chain) {
      chain.plugin('assets-manager').use(AssetsManagerPlugin, [
        { mode: 'static', openInBrowser: true, outputJson: true },
      ]);
    },
  },
};
```

## 功能说明

- 扫描本地图片资源，统计每个文件的相对路径与大小
- 标记未使用图片（以绿色文字在报告中展示）
- 汇总：全部大小、已使用大小、未使用大小
- 可选输出 JSON 报告与 HTML 报告
- 构建完成后自动打开报告（开启 `openInBrowser` 时）

## 报告文件

- `assets-report.html`：图文列表与统计信息
- `assets-report.json`：结构化数据
  - `allImages`: 所有图片 `{ path, size }`
  - `usedImages`: 已使用图片 `{ path, size }`
  - `unusedImages`: 未使用图片 `{ path, size }`
  - `totals`: `{ all, used, unused }`（单位为字节）

## 选项

- `openInBrowser?: boolean` 构建完成后自动打开报告，默认关闭
- `outputJson?: boolean` 是否输出 JSON 报告，默认关闭
- `includeExtensions?: string[]` 图片后缀白名单，默认 `['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp']`
- `mode?: 'static' | 'watch'` 报告输出模式，默认 `'static'`
- `reportFilename?: string` HTML 报告文件名，默认 `assets-report.html`
- `reportJson?: string` JSON 报告文件名（当 `outputJson: true` 时有效），默认 `asset-report.json`
- `ignorePaths?: string[]` 额外忽略扫描的路径，默认 `['node_modules', '.git', 'dist']`，并自动合并 `.gitignore`

### 模式说明
- `static`：在输出目录写入 HTML/JSON；若 `openInBrowser: true` 则打开生成的 HTML 文件
- `watch`：开启本地服务（默认端口 `8099`）实时展示报告并每 2 秒刷新；若 `openInBrowser: true` 则打开服务地址

### 忽略规则
- 默认忽略：`node_modules`、`.git`、`dist`
- 自动读取并合并根目录 `.gitignore`（基础前缀匹配）

### 兼容说明
- Webpack 5 优先使用 `processAssets` 与 `Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE`
- 若构建环境未暴露上述能力，自动回退到 `compiler.hooks.emit` 注入报告

## 开发与构建

- `npm run build` 使用 tsup 产出 `esm` 与 `cjs`，并生成类型声明
- 产物位置：
  - `dist/index.js`（ESM）
  - `dist/index.cjs`（CJS）
  - `dist/index.d.ts`（类型声明）

## 兼容性提示

- 构建工具链建议使用较新版本 Node（≥18）；在较旧版本可能出现 `EBADENGINE` 警告，但通常不影响本库产物使用

## 许可证

MIT
