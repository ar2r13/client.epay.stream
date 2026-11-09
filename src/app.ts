import { html } from 'lit'
import { customElement } from 'lit/decorators.js'
import { OpenElement } from './lib/element.ts'
import { router, type Route } from './controllers/router.ts'
import { environments, getEnvironment, setEnvironment, type EnvironmentId } from './controllers/environment.ts'

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
		pattern: new URLPattern({ pathname: '/test-payout' }),
		load: async () => {
			const { TestPayoutPage } = await import('./pages/test-payout/index.ts')

			return new TestPayoutPage()
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
		const environment = getEnvironment()

		return html`
			<header class=topbar data-environment=${environment.id}>
				<a class=brand href=/ aria-label='ePay admin home'>ePay <span>Admin</span></a>
				<nav aria-label=Primary>
					<a href=/>Liquidity</a>
					<a href=/clients>Clients</a>
					${environment.id === 'prod' ? null : html`<a href=/test-payout>Test payout</a>`}
					<select class=env-switch aria-label=Environment .value=${environment.id} @change=${(event : Event) => setEnvironment((event.target as HTMLSelectElement).value as EnvironmentId)}>
						${environments.map(item => html`<option value=${item.id} ?selected=${item.id === environment.id}>${item.label}</option>`)}
					</select>
				</nav>
			</header>
			<main class=content aria-live=polite></main>
		`
	}
}
