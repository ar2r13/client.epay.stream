import { cp, mkdir, rm } from 'node:fs/promises'
import process from 'node:process'
import * as esbuild from 'esbuild'

const watch = process.argv.includes('--watch')

await rm('dist', { recursive: true, force: true })
await mkdir('dist', { recursive: true })
await Promise.all([
	cp('src/index.html', 'dist/index.html'),
	cp('src/manifest.json', 'dist/manifest.json'),
	cp('src/style.css', 'dist/style.css'),
	cp('public', 'dist', { recursive: true })
])

const config = {
	entryPoints: {
		index: 'src/index.ts',
		sw: 'src/sw.ts'
	},
	outdir: 'dist',
	bundle: true,
	format: 'esm',
	splitting: true,
	target: 'es2023',
	chunkNames: 'assets/[name]-[hash]',
	sourcemap: true
}

if (watch) {
	const context = await esbuild.context(config)

	await context.watch()
	console.log('Watching client sources')
} else {
	await esbuild.build(config)
}
