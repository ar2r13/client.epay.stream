import { html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { api } from '../../controllers/api.ts'
import { money, short, date } from '../../lib/format.ts'
import { OpenElement } from '../../lib/element.ts'
import { getEnvironment } from '../../controllers/environment.ts'
import { copyButton } from '../../lib/copy.ts'

type Summary = Awaited<ReturnType<typeof api.liquiditySummary>>
type Provider = Awaited<ReturnType<typeof api.providerLiquidity>>
type Gas = Awaited<ReturnType<typeof api.gasLiquidity>>

// Each part has its own last known value, loading flag and error,
// so the slow PEXX and BSC calls never hold back the rest of the page.
interface Part<T> {
	data : T | null
	loading : boolean
	error : string
}

const CACHE_PREFIX = 'epay:liquidity:' + getEnvironment().id + ':'

function readCache<T> (key : string) : T | null {
	try {
		return JSON.parse(sessionStorage.getItem(CACHE_PREFIX + key) ?? 'null') as T | null
	} catch {
		return null
	}
}

function writeCache (key : string, data : unknown) {
	try {
		sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify(data))
	} catch {
		// storage unavailable, cache is optional
	}
}

function part<T> (key : string) : Part<T> {
	return { data: readCache<T>(key), loading: false, error: '' }
}

@customElement('dashboard-page')
export class DashboardPage extends OpenElement {
	@state() private summary = part<Summary>('summary')
	@state() private provider = part<Provider>('provider')
	@state() private gas = part<Gas>('gas')

	connectedCallback () {
		super.connectedCallback()
		this.load()
	}

	private load (refresh = false) {
		this.loadPart('summary', () => api.liquiditySummary())
		this.loadPart('provider', () => api.providerLiquidity(refresh))
		this.loadPart('gas', () => api.gasLiquidity(refresh))
	}

	// Shows the last known value immediately and revalidates in the background.
	private async loadPart<T> (key : 'summary' | 'provider' | 'gas', fetch : () => Promise<T>) {
		const set = (value : Part<T>) => { (this as unknown as Record<string, Part<T>>)[key] = value }
		const current = this[key] as Part<T>

		set({ ...current, loading: true, error: '' })

		try {
			const data = await fetch()

			writeCache(key, data)
			set({ data, loading: false, error: '' })
		} catch (error) {
			set({ ...(this[key] as Part<T>), loading: false, error: (error as Error).message })
		}
	}

	private get refreshing () {
		return this.summary.loading || this.provider.loading || this.gas.loading
	}

	protected render () {
		const summary = this.summary.data
		const provider = this.provider.data
		const gas = this.gas.data
		const errors = [
			this.summary.error && `Wallets: ${this.summary.error}`,
			this.provider.error && `PEXX balance: ${this.provider.error}`,
			this.gas.error && `Gas pool: ${this.gas.error}`
		].filter(Boolean)

		return html`
			<div class=heading>
				<div>
					<p class=eyebrow>Operations</p>
					<h1>Liquidity</h1>
				</div>
				<button class='button outlined' ?disabled=${this.refreshing} @click=${() => this.load(true)}>${this.refreshing ? 'Refreshing…' : 'Refresh'}</button>
			</div>
			${errors.map(error => html`<section class=notice role=alert>${error}</section>`)}
			${provider?.top_up_required ? html`<section class='notice warning' role=status>Provider liquidity requires a manual top-up.</section>` : null}
			<section class=metrics aria-label='Liquidity balances'>
				${this.metric('Provider balance', this.provider, provider && money(provider.provider_balance))}
				${this.metric('Reserved', provider ? this.provider : this.summary, money(provider?.provider_reserved ?? summary?.provider_reserved))}
				${this.metric('Available', this.provider, provider && money(provider.provider_available))}
				${this.metric('Gas pool', this.gas, gas && money(gas.gas_balance, 'BNB'))}
			</section>
			<section class=panel>
				<div class=section-title><h2>Wallets</h2><span class=muted>${summary ? `Updated ${date(provider?.updated_at ?? summary.updated_at)}` : 'Loading…'}</span></div>
				${this.wallet('Settlement', summary?.settlement_address)}
				${this.wallet('Fee', summary?.fee_address)}
				${this.wallet('Gas pool', summary?.gas_address)}
			</section>
		`
	}

	private metric (label : string, state : Part<unknown>, value : string | null | undefined) {
		const shown = value && value !== '—' ? value : (state.loading ? 'Loading…' : '—')

		return html`<article class=panel aria-busy=${state.loading}><span>${label}</span><strong>${shown}</strong></article>`
	}

	private wallet (label : string, address : string | undefined) {
		return html`
			<div class=wallet>
				<span>${label}</span>
				<code title=${address ?? ''}>${short(address)}</code>
				${address ? copyButton(address) : null}
			</div>
		`
	}
}
