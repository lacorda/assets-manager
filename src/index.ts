import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import http from "http";

type PluginOptions = {
  openInBrowser?: boolean;
  outputJson?: boolean;
  includeExtensions?: string[];
  mode?: "static" | "watch";
  reportFilename?: string;
  reportJson?: string;
  ignorePaths?: string[];
};

type ImageInfo = {
  absolutePath: string;
  relativePath: string;
  size: number;
};

type modeType = "static" | "watch";

const defaultExts = [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"];

function isImage(file: string, exts: string[]): boolean {
  const ext = path.extname(file).toLowerCase();
  return exts.includes(ext);
}

// 扫描目录下的所有图片文件
function scanImages(
  root: string,
  exts: string[],
  ignoreNames: Set<string>,
  gitPatterns: string[]
): ImageInfo[] {
  const results: ImageInfo[] = [];
  const stack: string[] = [root];

  const toPosix = (p: string) => p.split(path.sep).join("/");

  const matchGitignore = (rel: string): boolean => {
    const r = toPosix(rel);
    for (const pat of gitPatterns) {
      const p = pat;
      if (!p) continue;
      if (p.startsWith("/")) {
        const pp = p.slice(1);
        if (r.startsWith(pp)) return true;
      } else {
        if (r.startsWith(p)) return true;
      }
    }
    return false;
  };

  // 遍历目录
  // 初始stack为root目录
  while (stack.length) {
    // 从stack弹出一个目录，第一个为当前目录
    const dir = stack.pop() as string;

    let ents: fs.Dirent[] = [];
    try {
      // 读取当前目录下的所有文件和目录
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    // 遍历当前目录下的所有文件和目录
    for (const ent of ents) {
      // 拼接当前目录和文件名/目录名，得到绝对路径
      const p = path.join(dir, ent.name);
      // 计算当前文件/目录的相对路径，相对于root目录
      const rel = path.relative(root, p);

      // 如果是目录
      if (ent.isDirectory()) {
        // 如果目录名不在忽略列表中，且未命中 .gitignore 规则
        if (!ignoreNames.has(ent.name) && !matchGitignore(rel)) {
          stack.push(p);
        } else {
        }
        continue;
      }

      // 如果不是文件
      if (!ent.isFile()) {
        continue;
      }

      // 如果命中 .gitignore 规则
      if (matchGitignore(rel)) {
        continue;
      }

      // 如果不是图片类型
      if (!isImage(p, exts)) {
        continue;
      }

      let stat: fs.Stats | null = null;
      try {
        // 读取文件信息
        stat = fs.statSync(p);
      } catch {
        stat = null;
      }

      if (!stat) {
        continue;
      }

      //  absolutePath: 图片的绝对路径
      //  relativePath: 图片的相对路径，相对于root目录
      //  size: 图片文件大小
      results.push({
        absolutePath: path.resolve(p),
        relativePath: path.relative(root, p),
        size: stat.size,
      });
    }
  }
  return results;
}

function collectUsedImages(compilation: any, exts: string[]): Set<string> {
  const used = new Set<string>();
  const mods = Array.from(compilation.modules || []) as any[];

  // 遍历所有模块
  for (const m of mods) {
    const r = (m && (m.resource || (m as any).request)) as string | undefined;
    if (!r) {
      continue;
    }

    if (isImage(r, exts)) {
      const abs = path.resolve(r);
      used.add(abs);
    }
  }

  const assets = (
    typeof compilation.getAssets === "function" ? compilation.getAssets() : []
  ) as any[];

  // 遍历资产，记录使用的图片
  for (const a of assets) {
    const info: any = (a as any).info || {};
    const src = info.sourceFilename as string | undefined;
    if (src && isImage(src, exts)) {
      const abs = path.resolve(src);
      used.add(abs);
    }
  }
  return used;
}

function formatSize(size: number): string {
  const kb = size / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(2)} KB`;
  }
  return `${(kb / 1024).toFixed(2)} MB`;
}

function buildHtml(
  all: ImageInfo[],
  used: Set<string>,
  mode: "static" | "watch",
  projectName: string,
  faviconHref: string
) {
  const total = all.reduce((s, i) => s + i.size, 0);
  const usedList = all.filter((i) => used.has(i.absolutePath));
  const unusedList = all.filter((i) => !used.has(i.absolutePath));
  const totalUsed = usedList.reduce((s, i) => s + i.size, 0);
  const totalUnused = unusedList.reduce((s, i) => s + i.size, 0);
  const usedRows = usedList
    .map((i) => {
      const previewSrc =
        mode === "watch"
          ? `/preview?path=${encodeURIComponent(i.absolutePath)}`
          : `file://${i.absolutePath}`;
      return `<tr><td><img src="${previewSrc}" alt="" style="max-width:64px;max-height:64px;object-fit:contain" /></td><td>${
        i.relativePath
      }</td><td>${formatSize(i.size)}</td><td>已使用</td></tr>`;
    })
    .join("");
  const unusedRows = unusedList
    .map((i) => {
      const previewSrc =
        mode === "watch"
          ? `/preview?path=${encodeURIComponent(i.absolutePath)}`
          : `file://${i.absolutePath}`;
      return `<tr style="color:green"><td><img src="${previewSrc}" alt="" style="max-width:64px;max-height:64px;object-fit:contain" /></td><td>${
        i.relativePath
      }</td><td>${formatSize(i.size)}</td><td>未使用</td></tr>`;
    })
    .join("");
  const refreshMeta =
    mode === "watch" ? '<meta http-equiv="refresh" content="2">' : "";
  const html = `<!doctype html><html><head><meta charset="utf-8">${refreshMeta}<link rel="icon" href="${faviconHref}"><title>${projectName} - 图片资源管理</title><style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px}th{background:#f7f7f7;text-align:left}</style></head><body><h1>图片资源报告</h1><ul><li>全部大小：${formatSize(
    total
  )}</li><li>已使用大小：${formatSize(
    totalUsed
  )}</li><li>未使用大小：${formatSize(totalUnused)}</li><li>全部数量：${
    all.length
  }</li><li>已使用数量：${usedList.length}</li><li>未使用数量：${
    unusedList.length
  }</li></ul><table><thead><tr><th>预览</th><th>路径</th><th>大小</th><th>状态</th></tr></thead><tbody>${usedRows}${unusedRows}</tbody></table></body></html>`;
  return html;
}

function openFileInBrowser(file: string) {
  const platform = process.platform;
  let cmd = "";
  let args: string[] = [];
  if (platform === "darwin") {
    cmd = "open";
    args = [file];
  } else if (platform === "win32") {
    cmd = "cmd";
    args = ["/c", "start", '""', file];
  } else {
    cmd = "xdg-open";
    args = [file];
  }

  try {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.unref();
  } catch {}
}

export class AssetsManagerPlugin {
  private options: PluginOptions;
  private server?: http.Server;
  private currentHtml: string = "";
  private currentJson: string = "";
  private serverPort: number = 8099;
  constructor(options: PluginOptions = {}) {
    this.options = options;
  }
  apply(compiler: any) {
    const exts =
      this.options.includeExtensions && this.options.includeExtensions.length
        ? this.options.includeExtensions.map((e) => e.toLowerCase())
        : defaultExts;

    const mode: modeType = this.options.mode || "static";
    const htmlName = this.options.reportFilename || "assets-report.html";
    const jsonName = this.options.reportJson || "asset-report.json";

    const pluginName = "AssetsManagerPlugin";

    compiler.hooks.thisCompilation.tap(pluginName, (compilation: any) => {
      const wpVersion =
        compiler?.webpack?.version ||
        (() => {
          try {
            return require("webpack").version;
          } catch {
            return undefined;
          }
        })() ||
        "unknown";
      console.log("[AssetsManager] 检测到 Webpack 版本", wpVersion);

      // 生成报告
      const generate = (comp: any) => {
        const root = compiler.context || process.cwd();

        const defaultIgnore = ["node_modules", ".git", "dist"];
        const ignoreNames = new Set(
          this.options.ignorePaths && this.options.ignorePaths.length
            ? this.options.ignorePaths
            : defaultIgnore
        );
        let gitPatterns: string[] = [];

        try {
          const giPath = path.join(root, ".gitignore");
          if (fs.existsSync(giPath)) {
            const raw = fs.readFileSync(giPath, "utf8");
            gitPatterns = raw
              .split(/\r?\n/)
              .map((s) => s.trim())
              .filter((s) => s && !s.startsWith("#") && !s.startsWith("!"))
              .map((s) => s.replace(/\\/g, "/"));
          }
        } catch {}

        const all = scanImages(root, exts, ignoreNames, gitPatterns);
        const used = collectUsedImages(comp, exts);

        const usedList = all.filter((i) => used.has(i.absolutePath));
        const unusedList = all.filter((i) => !used.has(i.absolutePath));

        const total = all.reduce((s, i) => s + i.size, 0);
        const totalUsed = usedList.reduce((s, i) => s + i.size, 0);
        const totalUnused = unusedList.reduce((s, i) => s + i.size, 0);

        let projectName = path.basename(root);
        try {
          const pkgPath = path.join(root, "package.json");
          if (fs.existsSync(pkgPath)) {
            const raw = fs.readFileSync(pkgPath, "utf8");
            const pkg = JSON.parse(raw);
            if (pkg && typeof pkg.name === "string" && pkg.name.trim()) {
              projectName = pkg.name.trim();
            }
          }
        } catch {}
        const jsonObj = {
          allImages: all.map((i) => ({ path: i.relativePath, size: i.size })),
          usedImages: usedList.map((i) => ({
            path: i.relativePath,
            size: i.size,
          })),
          unusedImages: unusedList.map((i) => ({
            path: i.relativePath,
            size: i.size,
          })),
          totals: { all: total, used: totalUsed, unused: totalUnused },
          counts: {
            all: all.length,
            used: usedList.length,
            unused: unusedList.length,
          },
        };

        // favicon 处理：优先使用本地 src/favicon.icon 或 src/favicon.ico；否则使用远程 URL
        let faviconHref = "https://lacorda.github.io/img/favicon.ico";
        try {
          const iconCandidates = [
            path.join(root, "src", "favicon.icon"),
            path.join(root, "src", "favicon.ico"),
          ];
          let iconPath: string | undefined;
          for (const c of iconCandidates) {
            if (fs.existsSync(c)) {
              iconPath = c;
              break;
            }
          }
          if (iconPath) {
            const buf = fs.readFileSync(iconPath);
            const b64 = buf.toString("base64");
            faviconHref = `data:image/x-icon;base64,${b64}`;
          }
        } catch {}

        const html = buildHtml(all, used, mode, projectName, faviconHref);
        const jsonStr = JSON.stringify(jsonObj, null, 2);
        this.currentHtml = html;
        if (this.options.outputJson) this.currentJson = jsonStr;

        return { html, jsonStr };
      };

      // 确保服务已启动
      const ensureServer = () => {
        if (mode === "watch" && !this.server) {
          this.server = http.createServer((req, res) => {
            try {
              const urlStr = req.url || "/";
              const u = new URL(urlStr, `http://localhost:${this.serverPort}`);
              if (u.pathname === "/preview") {
                const p = u.searchParams.get("path");
                if (p && fs.existsSync(p)) {
                  const ext = path.extname(p).toLowerCase();
                  const type =
                    ext === ".png"
                      ? "image/png"
                      : ext === ".jpg" || ext === ".jpeg"
                      ? "image/jpeg"
                      : ext === ".gif"
                      ? "image/gif"
                      : ext === ".svg"
                      ? "image/svg+xml"
                      : ext === ".webp"
                      ? "image/webp"
                      : "image/x-icon";
                  res.statusCode = 200;
                  res.setHeader("Content-Type", type);
                  fs.createReadStream(p).pipe(res);
                  return;
                }
                res.statusCode = 404;
                res.setHeader("Content-Type", "text/plain; charset=utf-8");
                res.end("Not Found");
                return;
              }
              res.setHeader("Content-Type", "text/html; charset=utf-8");
              res.statusCode = 200;
              res.end(
                this.currentHtml ||
                  "<!doctype html><html><body><p>报告尚未生成</p></body></html>"
              );
            } catch {
              res.statusCode = 500;
              res.setHeader("Content-Type", "text/plain; charset=utf-8");
              res.end("Server Error");
            }
          });
          this.server.listen(this.serverPort, () => {
            console.log(
              "[AssetsManager] 监听服务",
              `http://localhost:${this.serverPort}/`
            );
          });
        }
      };

      const wp = compiler?.webpack || require("webpack");
      const processAssets = compilation.hooks.processAssets;
      const stageSummarize = wp?.Compilation?.PROCESS_ASSETS_STAGE_SUMMARIZE;
      if (!processAssets || !stageSummarize) {
        compiler.hooks.emit.tap(pluginName, (comp: any) => {
          const { html, jsonStr } = generate(comp);

          // 旧版兼容：通过 compilation.assets 注入
          compilation.assets[htmlName] = {
            source: () => html,
            size: () => Buffer.byteLength(html),
          } as any;

          this.currentHtml = html;

          if (this.options.outputJson) {
            compilation.assets[jsonName] = {
              source: () => jsonStr,
              size: () => Buffer.byteLength(jsonStr),
            } as any;
          }

          ensureServer();
        });
        return;
      }

      processAssets.tap(
        {
          name: pluginName,
          stage: stageSummarize,
        },
        () => {
          const { html, jsonStr } = generate(compilation);

          const sources =
            compiler?.webpack?.sources || require("webpack").sources;

          if (this.options.outputJson) {
            compilation.emitAsset(jsonName, new sources.RawSource(jsonStr));
          }

          // 输出 HTML 报告
          compilation.emitAsset(htmlName, new sources.RawSource(html));

          ensureServer();
        }
      );
    });

    compiler.hooks.done.tap(pluginName, () => {
      const outDir = compiler.outputPath || process.cwd();
      const htmlPath = path.join(outDir, htmlName);

      try {
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        if (!fs.existsSync(htmlPath)) {
          fs.writeFileSync(htmlPath, this.currentHtml || "");
        }

        if (this.options.outputJson) {
          const jsonPath = path.join(outDir, jsonName);
          if (!fs.existsSync(jsonPath)) {
            fs.writeFileSync(jsonPath, this.currentJson || "{}");
          }
        }
      } catch {}

      if (!this.options.openInBrowser) {
        return;
      }

      if (mode === "watch") {
        const url = `http://localhost:${this.serverPort}/`;
        console.log("[AssetsManager] 打开浏览器", url);
        openFileInBrowser(url);
        return;
      }

      console.log("[AssetsManager] 打开浏览器", htmlPath);
      if (fs.existsSync(htmlPath)) openFileInBrowser(htmlPath);
      else {
      }
    });
  }
}

export default AssetsManagerPlugin;
