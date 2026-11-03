import { html } from 'lit'
import { customElement } from 'lit/decorators.js'
import { OpenElement } from './lib/element.ts'
import { router, type Route } from './controllers/router.ts'

const routes : Route[] = [
	{
		pattern: new URLPattern({ pathname: '/' }),
		load: async () => {
			const { DashboardPage } = await import('./pages/dashboard/index.ts')

			return new DashboardPage()
		}
	},
	{
		pattern: new URLPattern({ pathname: '/clients' }),
		load: async () => {
			const { ClientsPage } = await import('./pages/clients/index.ts')

			return new ClientsPage()
		}
	},
	{
		pattern: new URLPattern({ pathname: '/clients/:id' }),
		load: async match => {
			const { ClientPage } = await import('./pages/client/index.ts')
			const page = new ClientPage()

			page.clientId = match.pathname.groups.id ?? ''
			return page
		}
	}
]

@customElement('epay-app')
export class App extends OpenElement {
	protected firstUpdated () {
		const outlet = this.querySelector<HTMLElement>('main')

		if (outlet) router.start(outlet, routes)
	}

	protected render () {
		return html`
			<header class=topbar>
				<a class=brand href=/ aria-label='ePay admin home'>ePay <span>Admin</span></a>
				<nav aria-label=Primary>
					<a href=/>Liquidity</a>
					<a href=/clients>Clients</a>
				</nav>
			</header>
			<main class=content aria-live=polite></main>
		`
	}
}
