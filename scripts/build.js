import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import process from 'node:process'
import * as esbuild from 'esbuild'

const watch = process.argv.includes('--watch')

await rm('dist', { recursive: true, force: true })
await mkdir('dist', { recursive: true })
await Promise.all([
	cp('src/manifest.json', 'dist/manifest.json'),
	cp('public', 'dist', { recursive: true })
])

// The Cloudflare zone caches fixed-name files in the browser for 4 hours, whatever _headers says.
// So the entry script and the stylesheet get content-hashed names, and index.html
// (served with no-store) points at the current ones.
async function writeHtml (metafile) {
	const entry = Object.entries(metafile.outputs)
		.find(([, output]) => output.entryPoint === 'src/index.ts')?.[0]
	const css = await readFile('src/style.css')
	const cssName = `assets/style-${createHash('sha256').update(css).digest('hex').slice(0, 8)}.css`

	await mkdir('dist/assets', { recursive: true })
	await writeFile(`dist/${cssName}`, css)

	const html = (await readFile('src/index.html', 'utf8'))
		.replace('/index.js', `/${entry.replace(/^dist\//, '')}`)
		.replace('/style.css', `/${cssName}`)

	await writeFile('dist/index.html', html)
}

const app = {
	entryPoints: { index: 'src/index.ts' },
	outdir: 'dist',
	bundle: true,
	format: 'esm',
	splitting: true,
	target: 'es2023',
	entryNames: 'assets/[name]-[hash]',
	chunkNames: 'assets/[name]-[hash]',
	sourcemap: true,
	metafile: true,
	plugins: [{
		name: 'html',
		setup (build) {
			build.onEnd(result => result.metafile ? writeHtml(result.metafile) : undefined)
		}
	}]
}

// The service worker must keep a fixed URL; browsers revalidate it themselves.
const worker = {
	entryPoints: { sw: 'src/sw.ts' },
	outdir: 'dist',
	bundle: true,
	format: 'esm',
	target: 'es2023',
	sourcemap: true
}

if (watch) {
	await Promise.all([app, worker].map(async config => (await esbuild.context(config)).watch()))
	console.log('Watching client sources')
} else {
	await Promise.all([esbuild.build(app), esbuild.build(worker)])
}
