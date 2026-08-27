'use strict';

import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const indexFile = 'index.html';
let html = await fs.readFile(indexFile, 'utf8');

const css = 'k62-fingerprint-exact.css';
const js  = 'k62-fingerprint-exact.js';

async function hash(path) {
  const buf = await fs.readFile(path);
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0,12);
}

const cssV = await hash(css);
const jsV = await hash(js);

const cssTag = `<link rel="stylesheet" href="${css}?v=${cssV}">`;
const jsTag  = `<script src="${js}?v=${jsV}"></script>`;

if (/k62-fingerprint-exact\.css/.test(html)) {
  html = html.replace(
    /<link[^>]+href=["']k62-fingerprint-exact\.css(?:\?v=[^"']*)?["'][^>]*>/,
    cssTag
  );
} else {
  html = html.replace(/<\/head>/i, `${cssTag}\n</head>`);
}

if (/k62-fingerprint-exact\.js/.test(html)) {
  html = html.replace(
    /<script[^>]+src=["']k62-fingerprint-exact\.js(?:\?v=[^"']*)?["'][^>]*><\/script>/,
    jsTag
  );
} else {
  html = html.replace(/<\/body>/i, `${jsTag}\n</body>`);
}

await fs.writeFile(indexFile, html, 'utf8');
console.log(`PASS FINGERPRINT exact: css=${cssV}, js=${jsV}`);
