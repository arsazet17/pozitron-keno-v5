import fs from 'node:fs';
import path from 'node:path';

const DEST='OLD_PATCHES_TO_DELETE';

const OLD_FILES=[
  'k62-ui-patch.js',
  'k62-ui-patch.css',
  'k62-fingerprint-exact.js',
  'k62-fingerprint-exact.css',
  'install-k62-ui-patch.mjs',
  'install-k62-fingerprint-exact.mjs',
  'patch-fingerprint-native.mjs',
  'patch-fingerprint-real-order.mjs',
  'refresh-fingerprint-version.mjs',
  'fix-fingerprint-button.mjs',
  'fix-fingerprint-wait.mjs',
  'fix-fingerprint-direct-button.mjs',
  'fix-fingerprint-one-active-row.mjs',
  'patch-fingerprint-archive-overlay.mjs',
  'patch-fingerprint-vm-pairs.mjs',
  'patch-fingerprint-vm-big-split.mjs',
  'patch-fingerprint-vm-big-cell-only.mjs',
  'patch-fingerprint-forecast-asc-toggle.mjs',
  'fix-fingerprint-forecast-buttons-final.mjs',
  'fix-update-no-hang.mjs',
  'fix-no-old-draw-flash.mjs',
  'fix-index-literal-newline.mjs',
  'finalize-keno62.mjs',
  'keno-update-v62.js',
  'update-keno-v62.yml',
  'update-keno-v62.yaml',
  'UPLOAD_NOTE.txt',
  'fingerprint-v622-server.mjs',
  'cluster-tracker-v622.js.',
  'index.html.',
  'keno-v622-server.yml.'
];

const OLD_WORKFLOWS=[
  '.github/workflows/fingerprint-exact.yml',
  '.github/workflows/fingerprint-native.yml',
  '.github/workflows/fingerprint-real-order.yml',
  '.github/workflows/fix-fingerprint-button.yml',
  '.github/workflows/fix-fingerprint-wait.yml',
  '.github/workflows/fix-fingerprint-direct-button.yml',
  '.github/workflows/fix-fingerprint-one-active-row.yml',
  '.github/workflows/fingerprint-archive-overlay.yml',
  '.github/workflows/fingerprint-vm-pairs.yml',
  '.github/workflows/fingerprint-vm-big-split.yml',
  '.github/workflows/fingerprint-vm-big-cell-only.yml',
  '.github/workflows/fingerprint-forecast-asc-toggle.yml',
  '.github/workflows/fingerprint-forecast-buttons-final.yml',
  '.github/workflows/update-no-hang.yml',
  '.github/workflows/no-old-draw-flash.yml',
  '.github/workflows/keno62-final.yml'
];

// Рабочие серверные workflow НЕ ТРОГАЕМ:
// .github/workflows/auto-version.yml
// .github/workflows/fingerprint-v622-server.yml
// .github/workflows/keno-v622-server.yml
// .github/workflows/stoloto-v622-main.yml
// .github/workflows/stoloto-v622-reserve.yml

function safeName(rel){
  return rel
    .replace(/^\.github\/workflows\//,'WORKFLOW__')
    .replace(/[\/\\]/g,'__');
}

fs.mkdirSync(DEST,{recursive:true});

const moved=[];
for(const rel of [...OLD_FILES,...OLD_WORKFLOWS]){
  if(!fs.existsSync(rel)) continue;

  const target=path.join(DEST,safeName(rel));

  // Если имя уже занято, добавляем числовой хвост.
  let finalTarget=target;
  let n=2;
  while(fs.existsSync(finalTarget)){
    finalTarget=`${target}__${n++}`;
  }

  fs.renameSync(rel,finalTarget);
  moved.push(`${rel} -> ${finalTarget}`);
}

// Переносим сам одноразовый сборщик и workflow в ту же папку,
// чтобы после этого в рабочем репозитории они тоже не оставались.
for(const rel of [
  'collect-old-patches.mjs',
  '.github/workflows/collect-old-patches.yml'
]){
  if(!fs.existsSync(rel)) continue;
  const target=path.join(DEST,safeName(rel));
  fs.renameSync(rel,target);
  moved.push(`${rel} -> ${target}`);
}

fs.writeFileSync(
  path.join(DEST,'ЧТО_ПЕРЕНЕСЕНО.txt'),
  [
    'ПОЗИТРОН КЕНО v6.2 — СТАРЫЕ ФАЙЛЫ ДЛЯ УДАЛЕНИЯ',
    '',
    'ЭТУ ПАПКУ МОЖНО УДАЛИТЬ ЦЕЛИКОМ.',
    '',
    ...moved
  ].join('\n')+'\n'
);

console.log(`Перенесено файлов: ${moved.length}`);
console.log(`Все старые файлы собраны в: ${DEST}/`);
