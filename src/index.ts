import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

type PluginOptions = {
  enableService?: boolean;
  outputJson?: boolean;
  includeExtensions?: string[];
};

type ImageInfo = {
  absolutePath: string;
  relativePath: string;
  size: number;
};

const defaultExts = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'];

function isImage(file: string, exts: string[]): boolean {
  const ext = path.extname(file).toLowerCase();
  return exts.includes(ext);
}

function scanImages(root: string, exts: string[]): ImageInfo[] {
  const ignore = new Set(['node_modules', '.git', 'dist', 'build', 'out']);
  const results: ImageInfo[] = [];
  const stack: string[] = [root];
  while (stack.length) {
    const dir = stack.pop() as string;
    let ents: fs.Dirent[] = [];
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of ents) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (!ignore.has(ent.name)) stack.push(p);
        continue;
      }
      if (!ent.isFile()) continue;
      if (!isImage(p, exts)) continue;
      let stat: fs.Stats | null = null;
      try {
        stat = fs.statSync(p);
      } catch {
        stat = null;
      }
      if (!stat) continue;
      results.push({
        absolutePath: path.resolve(p),
        relativePath: path.relative(root, p),
        size: stat.size
      });
    }
  }
  return results;
}

function collectUsedImages(compilation: any, exts: string[]): Set<string> {
  const used = new Set<string>();
  const mods = Array.from(compilation.modules || []) as any[];
  for (const m of mods) {
    const r = (m && (m.resource || (m as any).request)) as string | undefined;
    if (!r) continue;
    if (isImage(r, exts)) used.add(path.resolve(r));
  }
  const assets = (typeof compilation.getAssets === 'function' ? compilation.getAssets() : []) as any[];
  for (const a of assets) {
    const info: any = (a as any).info || {};
    const src = info.sourceFilename as string | undefined;
    if (src && isImage(src, exts)) used.add(path.resolve(src));
  }
  return used;
}

function formatSize(size: number): string {
  const kb = size / 1024;
  if (kb < 1024) return `${kb.toFixed(2)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function buildHtml(all: ImageInfo[], used: Set<string>) {
  const total = all.reduce((s, i) => s + i.size, 0);
  const usedList = all.filter(i => used.has(i.absolutePath));
  const unusedList = all.filter(i => !used.has(i.absolutePath));
  const totalUsed = usedList.reduce((s, i) => s + i.size, 0);
  const totalUnused = unusedList.reduce((s, i) => s + i.size, 0);
  const rows = all
    .map(i => {
      const isUnused = !used.has(i.absolutePath);
      const color = isUnused ? 'green' : 'inherit';
      const status = isUnused ? '未使用' : '已使用';
      return `<tr style="color:${color}"><td>${i.relativePath}</td><td>${formatSize(i.size)}</td><td>${status}</td></tr>`;
    })
    .join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Assets Manager Report</title><style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px}th{background:#f7f7f7;text-align:left}</style></head><body><h1>图片资源报告</h1><ul><li>全部大小：${formatSize(total)}</li><li>已使用大小：${formatSize(totalUsed)}</li><li>未使用大小：${formatSize(totalUnused)}</li></ul><table><thead><tr><th>路径</th><th>大小</th><th>状态</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
  return html;
}

function openInBrowser(file: string) {
  const platform = process.platform;
  let cmd = '';
  let args: string[] = [];
  if (platform === 'darwin') {
    cmd = 'open';
    args = [file];
  } else if (platform === 'win32') {
    cmd = 'cmd';
    args = ['/c', 'start', '""', file];
  } else {
    cmd = 'xdg-open';
    args = [file];
  }
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.unref();
  } catch {}
}

export class AssetsManagerPlugin {
  private options: PluginOptions;
  constructor(options: PluginOptions = {}) {
    this.options = options;
  }
  apply(compiler: any) {
    const exts = (this.options.includeExtensions && this.options.includeExtensions.length)
      ? this.options.includeExtensions.map(e => e.toLowerCase())
      : defaultExts;
    compiler.hooks.thisCompilation.tap('AssetsManagerPlugin', (compilation: any) => {
      const processAssets = compilation.hooks.processAssets;
      if (!processAssets || !compilation.PROCESS_ASSETS_STAGE_SUMMARIZE) return;
      processAssets.tap({ name: 'AssetsManagerPlugin', stage: compilation.PROCESS_ASSETS_STAGE_SUMMARIZE }, () => {
        const root = compiler.context || process.cwd();
        const all = scanImages(root, exts);
        const used = collectUsedImages(compilation, exts);
        const usedList = all.filter(i => used.has(i.absolutePath));
        const unusedList = all.filter(i => !used.has(i.absolutePath));
        const total = all.reduce((s, i) => s + i.size, 0);
        const totalUsed = usedList.reduce((s, i) => s + i.size, 0);
        const totalUnused = unusedList.reduce((s, i) => s + i.size, 0);
        const json = {
          allImages: all.map(i => ({ path: i.relativePath, size: i.size })),
          usedImages: usedList.map(i => ({ path: i.relativePath, size: i.size })),
          unusedImages: unusedList.map(i => ({ path: i.relativePath, size: i.size })),
          totals: { all: total, used: totalUsed, unused: totalUnused }
        };
        const html = buildHtml(all, used);
        const sources = compiler?.webpack?.sources || require('webpack').sources;
        if (this.options.outputJson) {
          compilation.emitAsset('assets-report.json', new sources.RawSource(JSON.stringify(json, null, 2)));
        }
        if (this.options.enableService) {
          compilation.emitAsset('assets-report.html', new sources.RawSource(html));
        }
      });
    });
    compiler.hooks.done.tap('AssetsManagerPlugin', () => {
      if (!this.options.enableService) return;
      const filePath = path.join(compiler.outputPath || process.cwd(), 'assets-report.html');
      if (fs.existsSync(filePath)) openInBrowser(filePath);
    });
  }
}

export default AssetsManagerPlugin;
