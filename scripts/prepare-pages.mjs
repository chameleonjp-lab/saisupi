import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const site = resolve(root, '_site');
// Fresh staging only. Preserve any previous output rather than force-deleting it.
mkdirSync(site);
for (const entry of ['index.html', 'css', 'js', 'assets']) cpSync(resolve(root, entry), resolve(site, entry), { recursive: true });
writeFileSync(resolve(site, '.nojekyll'), '');
