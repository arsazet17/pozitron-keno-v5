
import fs from 'node:fs';
import crypto from 'node:crypto';

const indexPath = 'index.html';
let html = fs.readFileSync(indexPath, 'utf8');

const assets = ['k62-ui-patch.css','k62-ui-patch.js'];
for (const asset of assets) {
  if (!fs.existsSync(asset)) continue;
  const hash = crypto.createHash('sha256').update(fs.readFileSync(asset)).digest('hex').slice(0,12);
  const esc = asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(${esc})(?:\\?v=[^"'<>\\s]+)?`, 'g');
  html = html.replace(re, `$1?v=${hash}`);
}
fs.writeFileSync(indexPath, html);
