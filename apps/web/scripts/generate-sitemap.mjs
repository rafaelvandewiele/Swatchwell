import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = resolve(dirname(fileURLToPath(import.meta.url)), '../public');
const baseUrl = 'https://swatchwell.veyca.dev';

const routes = ['/'];

const entries = routes.map((route) => {
  const location = `${baseUrl}${route}`;
  return `  <url><loc>${location}</loc></url>`;
});

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>
`;

await mkdir(directory, { recursive: true });
await writeFile(resolve(directory, 'sitemap.xml'), sitemap, 'utf8');

console.log(`Generated sitemap.xml with ${routes.length} routes.`);
