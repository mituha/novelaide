import { readFileSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { cwd } from 'node:process';
import typescript from '@rollup/plugin-typescript';

const pkg = JSON.parse(readFileSync(join(cwd(), 'package.json'), 'utf8'));

// CSSを dist-js に結合コピー
function copyCssPlugin() {
  return {
    name: 'copy-css',
    writeBundle() {
      const outDir = join(cwd(), 'dist-js');
      if (!existsSync(outDir)) {
        mkdirSync(outDir, { recursive: true });
      }
      const cssSrc = join(cwd(), 'guest-js', 'styles.css');
      const cssDest = join(outDir, 'styles.css');
      if (existsSync(cssSrc)) {
        copyFileSync(cssSrc, cssDest);
      }
    },
  };
}

export default {
  input: 'guest-js/index.ts',
  output: [
    {
      file: pkg.exports['.'].import,
      format: 'esm',
      sourcemap: true,
    },
    {
      file: pkg.exports['.'].require,
      format: 'cjs',
      sourcemap: true,
    },
  ],
  plugins: [
    typescript({
      declaration: true,
      declarationDir: dirname(pkg.exports['.'].import),
      tsconfig: './tsconfig.json',
    }),
    copyCssPlugin(),
  ],
  external: [
    /^@tauri-apps\/api/,
    /^@earendil-works\//,
    'react',
    'react-dom',
    'react/jsx-runtime',
    'lucide-react',
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.peerDependencies || {}),
  ],
};
