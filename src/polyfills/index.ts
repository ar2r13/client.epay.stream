if (!('URLPattern' in globalThis)) {
	const { URLPattern } = await import('urlpattern-polyfill')

	Object.defineProperty(globalThis, 'URLPattern', { value: URLPattern, configurable: true, writable: true })
}
