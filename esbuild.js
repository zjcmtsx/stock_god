const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node16',
  outfile: 'dist/extension.js',
  external: ['vscode'],
  sourcemap: !production,
  minify: production,
  logLevel: 'info'
};

(async () => {
  if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    console.log('[esbuild] watching...');
  } else {
    await esbuild.build(options);
    console.log('[esbuild] build complete');
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
