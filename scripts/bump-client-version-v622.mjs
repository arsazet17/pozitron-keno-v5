import fs from 'node:fs';

const INDEX = 'index.html';
const VERSION_FILE = 'version-v622.json';

const now = new Date();
const stamp =
  String(process.env.BUILD_ID || '').trim() ||
  now.toISOString().replace(/\D/g, '').slice(0, 14);

let html = fs.readFileSync(INDEX, 'utf8');

/*
  Главный закон KENO 6.2.2:
  изменился JS/CSS/manifest -> новый ?v= в index.html.
  Меняем версии автоматически на каждом MAIN GitHub Action.
*/
const localAsset = /((?:src|href)=["'])(\.?\/?[^"'?#]+?\.(?:js|css|webmanifest))(\?v=[^"']*)?(["'])/gi;

html = html.replace(localAsset, (_m, open, file, _oldQuery, close) => {
  // CDN и внешние URL не трогаем.
  if (/^(?:https?:)?\/\//i.test(file)) return _m;
  return `${open}${file}?v=${stamp}${close}`;
});

/*
  Вставляем клиентский контроллер версии один раз.
  Он сам проверяет version-v622.json с cache:no-store.
*/
if (!html.includes('app-version-v622.js')) {
  const tag = `<script src="./app-version-v622.js?v=${stamp}"></script>\n`;
  html = html.replace('</body>', `${tag}</body>`);
}

/*
  Meta — дополнительная страховка. Основной механизм всё равно ?v= + version JSON.
*/
if (!/http-equiv=["']Cache-Control["']/i.test(html)) {
  html = html.replace(
    '<head>',
    `<head>
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="0">`
  );
}

fs.writeFileSync(INDEX, html, 'utf8');

const version = {
  app: 'KENO 6.2.2',
  build: stamp,
  updatedAt: now.toISOString(),
  runId: process.env.GITHUB_RUN_ID || null,
  runAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
  sha: process.env.GITHUB_SHA || null
};

fs.writeFileSync(VERSION_FILE, JSON.stringify(version, null, 2) + '\n', 'utf8');

console.log(`KENO 6.2.2 client build: ${stamp}`);
