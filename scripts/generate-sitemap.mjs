/**
 * 构建期生成网站地图（out/sitemap.xml）。
 *
 * 与 PidanUI / CFO 站的同名脚本思路一致：构建期扫描可收录路由，写出 sitemap.xml，
 * 交给 verify-output.mjs 对账；CI 与 Cloudflare Workers Builds 都会跑到。
 *
 * Next.js 的差异与对应调整：
 *   - 产物目录是 out/（output: 'export'），不是 Nuxt 的 .output/public；
 *   - 脚本是纯 .mjs，无法直接 import src/data 下的 .ts 模块（tools.ts / site.ts），
 *     因此路由改为扫描 out/ 里实际生成的 index.html —— 这也让「构建成功」与
 *     「页面真实存在」天然一致，不必维护第二份 slug 清单，新增工具页只要被
 *     generateStaticParams 产出，就会自动进入 sitemap；
 *   - trailingSlash: true 下产物是目录式 xxx/index.html，路由即目录路径 + 尾斜杠，
 *     与站内 toolPath() 生成的链接、Workers 的 auto-trailing-slash 三者对齐。
 */
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = fileURLToPath(new URL('../out', import.meta.url));
// 与 src/data/site.ts 的 SITE.url 保持一致（.mjs 不 import .ts，故在此声明同一常量）
const SITE_URL = 'https://www.skystarlight.top';

// 不进 sitemap 的顶层目录：Next 内部产物、错误兜底页与静态资源
const EXCLUDED_DIRS = new Set(['404', '_not-found', '_next', 'fonts', 'images']);

if (!existsSync(OUT_DIR)) {
  console.error('[sitemap] 找不到 out/，先跑 next build');
  process.exit(1);
}

// 递归找所有 index.html，其所在目录即一条路由
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });

const routes = walk(OUT_DIR)
  .filter((path) => basename(path) === 'index.html')
  .map((path) => {
    const rel = relative(OUT_DIR, dirname(path));
    // 顶层 index.html → '/'；其余 → '/tools/base64/'
    return rel === '' ? '/' : `/${rel.split(sep).join('/')}/`;
  })
  .filter((route) => !EXCLUDED_DIRS.has(route.split('/')[1]))
  .sort();

if (!routes.includes('/')) {
  console.error('[sitemap] 产物里没有首页 index.html，疑似构建不完整');
  process.exit(1);
}

const escapeXml = (value) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const urls = routes
  .map(
    (route) =>
      `  <url>\n    <loc>${escapeXml(new URL(route, `${SITE_URL}/`).href)}</loc>\n  </url>`,
  )
  .join('\n');
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

writeFileSync(join(OUT_DIR, 'sitemap.xml'), sitemap);
console.log(`[sitemap] 已生成 ${routes.length} 个页面 → out/sitemap.xml`);
