import fs from 'node:fs';

/*
  Совместимый защитный файл.
  Раньше MAIN запускал его после каждого тиража и тем самым переписывал
  версию приложения и все ?v= в index.html. Теперь тиражи не имеют права
  менять клиентскую сборку. Версия меняется только workflow AUTO VERSION.
*/
const VERSION_FILE = 'version-v622.json';
const version = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8'));
const value = String(version?.version || '').trim();

if (!/^\d+\.\d+\.\d+$/.test(value)) {
  throw new Error(`${VERSION_FILE}: отсутствует корректная единая версия`);
}

console.log(`KENO ${value}: версия клиента не изменяется обработчиком тиража`);
