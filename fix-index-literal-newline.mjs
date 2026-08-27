import fs from 'node:fs';

let s=fs.readFileSync('index.html','utf8');

// Убираем буквальные \n, которые могли попасть в HTML как текст.
s=s.replace(/\\n(?=<\/head>)/g,'\n');
s=s.replace(/\\n(?=<\/body>)/g,'\n');
s=s.replace(/\\n(?=<script\b)/g,'\n');
s=s.replace(/\\n(?=<link\b)/g,'\n');

fs.writeFileSync('index.html',s);
console.log('PASS: literal \\\\n removed from index.html');
