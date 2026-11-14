export interface Route {
	pattern : URLPattern
	load : (match : URLPatternResult) => Promise<HTMLElement>
}

class Router extends EventTarget {
	#routes : Route[] = []
	#outlet : HTMLElement | null = null
	#currentPathname = ''

	start (outlet : HTMLElement, routes : Route[]) {
		this.#outlet = outlet
		this.#routes = routes

		navigation.addEventListener('navigate', event => {
			const url = new URL(event.destination.url)

			// A reload must stay a real page load: the environment switch relies on it to re-read
			// the API origin, which modules capture once at startup.
			if (!event.canIntercept || event.navigationType === 'reload' || event.hashChange || event.downloadRequest !== null) return
			if (url.origin !== location.origin) return
			// Do not recreate the page component when only query params change on the same path
			if (url.pathname === this.#currentPathname && this.#outlet?.children.length) return

			event.intercept({ handler: () => this.render(url) })
		})

		return this.render(new URL(location.href))
	}

	async render (url : URL) {
		const route = this.#routes.find(item => item.pattern.test(url))
		const match = route?.pattern.exec(url)

		if (!route || !match || !this.#outlet) {
			navigation.navigate('/')
			return
		}

		this.#currentPathname = url.pathname
		const page = await route.load(match)
		const replace = () => this.#outlet!.replaceChildren(page)

		if (document.startViewTransition) document.startViewTransition(replace)
		else replace()

		this.dispatchEvent(new Event('route'))
	}
}

export const router = new Router()
