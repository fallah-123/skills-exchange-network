import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';

// Node's test runner uses the same JSX transform as Vite, without loading styles.
export async function load(url, context, nextLoad) {
  if (url.endsWith('.css')) return { format: 'module', source: 'export default {};', shortCircuit: true };
  if (url.endsWith('.jsx')) {
    const result = await transform(await readFile(new URL(url), 'utf8'), { loader: 'jsx', jsx: 'automatic', format: 'esm' });
    return { format: 'module', source: result.code, shortCircuit: true };
  }
  return nextLoad(url, context);
}
