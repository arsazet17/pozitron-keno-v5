'use strict';

import fs from 'node:fs/promises';

const file = 'index.html';
let html = await fs.readFile(file, 'utf8');

const cssTag = '<link rel="stylesheet" href="k62-ui-patch.css?v=1">';
const jsTag = '<script src="k62-ui-patch.js?v=1"></script>';

if (!html.includes('k62-ui-patch.css')) {
  html = html.replace(/<\/head>/i, `${cssTag}\n</head>`);
}

if (!html.includes('k62-ui-patch.js')) {
  html = html.replace(/<\/body>/i, `${jsTag}\n</body>`);
}

await fs.writeFile(file, html, 'utf8');
console.log('PASS: KENO 6.2 patch files connected to index.html');
