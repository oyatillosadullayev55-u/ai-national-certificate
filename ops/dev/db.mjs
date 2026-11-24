// Development uchun o'rnatishsiz PostgreSQL (npm orqali yuklanadi). Ma'lumotlar: ops/dev/.pgdata
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';

const dir = new URL('./.pgdata', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'anc', password: 'anc', port: 5433, persistent: true,
  // Windows'da standart kodirovka WIN1252 bo'lib qoladi — kirill/o'zbek matnlari uchun UTF8 shart
  initdbFlags: ['--encoding=UTF8', '--no-locale'] });

if (!existsSync(dir)) {
  console.log('PostgreSQL birinchi marta sozlanmoqda...');
  await pg.initialise();
}
await pg.start();
try {
  await pg.createDatabase('anc');
} catch {
  /* baza allaqachon bor */
}
console.log('PostgreSQL ishlayapti: localhost:5433 (anc/anc). To\'xtatish uchun Ctrl+C');

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
