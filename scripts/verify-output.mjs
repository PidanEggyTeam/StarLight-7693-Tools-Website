/**
 * 产物断言：页面齐全 / 网站地图 / 字体自包含 / 无字体 CDN 请求 / 无服务端入口。
 *
 * next build 的 output: 'export' 只保证「构建没报错」，路由漏生成、字体漏同步
 * 这类问题它发现不了；这条脚本在 build 之后兜底，CI 与 Cloudflare 构建都会跑到。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC_DIR = fileURLToPath(new URL('../out', import.meta.url));
// 与 src/data/site.ts 的 SITE.url / generate-sitemap.mjs 保持一致
const SITE_URL = 'https://www.skystarlight.top';
const errors = [];
const assert = (ok, msg) => {
  if (!ok) errors.push(msg);
};

if (!existsSync(PUBLIC_DIR)) {
  console.error('[verify] 找不到 out/，先跑 pnpm build');
  process.exit(1);
}

// 1) 静态导出页面齐全（首页 / 404 / 五个工具页）
const TOOL_SLUGS = ['base64', 'unicode', 'url', 'timestamp', 'eggy-map-text'];
const PAGES = ['index.html', '404.html', ...TOOL_SLUGS.map((slug) => `tools/${slug}/index.html`)];
for (const page of PAGES) {
  assert(existsSync(join(PUBLIC_DIR, page)), `缺少页面产物：${page}`);
}

// 2) sitemap.xml：构建期生成、含标准 urlset、可收录路由与产物一一对应
const sitemapFile = join(PUBLIC_DIR, 'sitemap.xml');
if (!existsSync(sitemapFile)) {
  assert(false, '缺少 sitemap.xml：构建期网站地图没有生成');
} else {
  const sitemap = readFileSync(sitemapFile, 'utf8');
  const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(([, url]) => url);
  // 生成端扫描产物后按路径排序，这里对期望值同样排序，避免声明顺序差异造成误报
  const expected = ['/', ...TOOL_SLUGS.map((slug) => `/tools/${slug}/`)]
    .map((route) => new URL(route, `${SITE_URL}/`).href)
    .sort();
  assert(
    sitemap.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'),
    'sitemap.xml 缺少 sitemap.org 标准 urlset 根节点',
  );
  assert(
    urls.length === expected.length && urls.every((url, i) => url === expected[i]),
    `sitemap.xml 页面地址与可收录路由不一致（期望 ${expected.length} 条，实际 ${urls.length} 条）`,
  );
}

// 3) 字体随产物自包含
const fontDir = join(PUBLIC_DIR, 'fonts');
assert(existsSync(join(fontDir, 'fonts.css')), '缺少 fonts/fonts.css');
assert(existsSync(join(fontDir, 'material-icons.woff2')), '缺少 fonts/material-icons.woff2');
assert(existsSync(join(fontDir, 'files')), '缺少 fonts/files/（Cascadia Code 分片）');
const woff2 = existsSync(fontDir)
  ? readdirSync(fontDir).filter((file) => file.endsWith('.woff2')).length
  : 0;
assert(woff2 >= 246, `HarmonyOS Sans SC 分片数量异常：${woff2}`);

// 4) 所有 HTML / CSS 都不能再向 CDN 要字体
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
// 友链里的 devicon SVG 仍走 jsDelivr，那是图片不是字体；这里只卡字体链路
const FONT_CDN =
  /cdn\.jsdelivr\.net\/npm\/(?:harmonyos-sans-sc-webfont-splitted|@fontsource\/cascadia-code|material-icons)|url\(\s*['"]?https?:[^)]*\.(?:woff2?|ttf|otf)/i;
for (const file of walk(PUBLIC_DIR).filter((path) => /\.(html|css)$/i.test(path))) {
  const text = readFileSync(file, 'utf8');
  assert(!FONT_CDN.test(text), `产物仍引用远程字体：${file}`);
}
assert(
  readFileSync(join(PUBLIC_DIR, 'index.html'), 'utf8').includes('/fonts/fonts.css'),
  '首页没有引用本地 /fonts/fonts.css',
);

// 5) assets-only Worker：产物里不应有服务端 / Worker 入口
assert(!existsSync(join(PUBLIC_DIR, '_worker.js')), '产物里出现 _worker.js（应为纯静态 assets）');
assert(!existsSync(join(PUBLIC_DIR, 'server')), '产物里出现 server/ 目录');

if (errors.length) {
  console.error(`[verify] 产物校验失败：\n  - ${errors.join('\n  - ')}`);
  process.exit(1);
}
console.log(
  `[verify] ${PAGES.length} 个页面齐全 ✓ sitemap ${TOOL_SLUGS.length + 1} 页 ✓ ${woff2} 个顶层字体分片自包含 ✓ 无 CDN / Worker 入口 ✓`,
);
