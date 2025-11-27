# assets-manager

Webpack 插件：扫描项目中的本地图片资源并生成统计报告。

## 安装

- 将本项目作为依赖引入后安装开发依赖：
  - `npm i -D father typescript @types/node`
- 构建库产物：
  - `npm run build`

## 快速使用

在你的 `webpack.config.js` 中添加插件：

```js
const path = require('path');
const { AssetsManagerPlugin } = require('assets-manager'); // 如未发布到 npm，可改为相对路径引用 dist

module.exports = {
  output: { path: path.resolve(__dirname, 'dist') },
  plugins: [
    new AssetsManagerPlugin({
      enableService: true,   // 构建后生成并自动打开 HTML 报告
      outputJson: true,      // 生成 JSON 报告（assets-report.json）
      // includeExtensions: ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'] // 可选：自定义图片后缀
    })
  ]
};
```

## 功能说明

- 扫描本地图片资源，统计每个文件的相对路径与大小
- 标记未使用图片（以绿色文字在报告中展示）
- 汇总：全部大小、已使用大小、未使用大小
- 可选输出 JSON 报告与 HTML 报告
- 构建完成后自动打开 HTML 报告（开启 `enableService` 时）

## 报告文件

- `assets-report.html`：图文列表与统计信息
- `assets-report.json`：结构化数据
  - `allImages`: 所有图片 `{ path, size }`
  - `usedImages`: 已使用图片 `{ path, size }`
  - `unusedImages`: 未使用图片 `{ path, size }`
  - `totals`: `{ all, used, unused }`（单位为字节）

## 选项

- `enableService?: boolean` 是否在构建后生成并自动打开 HTML 报告，默认关闭
- `outputJson?: boolean` 是否输出 JSON 报告，默认关闭
- `includeExtensions?: string[]` 图片后缀白名单，默认 `['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp']`

## 开发与构建

- `npm run build` 使用 father 以 Bundless 模式分别产出 `esm` 与 `cjs`，并生成类型声明
- 产物位置：
  - `dist/esm/index.js`、`dist/esm/index.d.ts`
  - `dist/cjs/index.js`、`dist/cjs/index.d.ts`

## 兼容性提示

- 构建工具链建议使用较新版本 Node（≥18）；旧版本可能出现 `EBADENGINE` 警告，但不影响本库正常使用

## 许可证

MIT
