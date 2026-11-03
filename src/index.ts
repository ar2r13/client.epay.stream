import './types.d.ts'
import './polyfills/index.ts'
import './app.ts'

if ('serviceWorker' in navigator) {
	addEventListener('load', () => navigator.serviceWorker.register('/sw.js', { scope: '/' }))
}
