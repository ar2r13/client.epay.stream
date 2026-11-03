export interface Route {
	pattern : URLPattern
	load : (match : URLPatternResult) => Promise<HTMLElement>
}

class Router extends EventTarget {
	#routes : Route[] = []
	#outlet : HTMLElement | null = null

	start (outlet : HTMLElement, routes : Route[]) {
		this.#outlet = outlet
		this.#routes = routes

		navigation.addEventListener('navigate', event => {
			const url = new URL(event.destination.url)

			if (!event.canIntercept || url.origin !== location.origin) return

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

		const page = await route.load(match)
		const replace = () => this.#outlet!.replaceChildren(page)

		if (document.startViewTransition) document.startViewTransition(replace)
		else replace()

		this.dispatchEvent(new Event('route'))
	}
}

export const router = new Router()
