import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

function collectJavaScriptFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectJavaScriptFiles(path));
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(path);
  }
  return files;
}

const root = fileURLToPath(new URL('..', import.meta.url));
const directories = ['js', 'scripts', 'test']
  .map((directory) => join(root, directory))
  .filter((directory) => statSync(directory, { throwIfNoEntry: false }));

const files = directories.flatMap(collectJavaScriptFiles).sort();
for (const file of files) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
console.log(`構文検査: ${files.length}ファイル成功`);
