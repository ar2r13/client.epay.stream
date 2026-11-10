import { html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { api, type Liquidity } from '../../controllers/api.ts'
import { money, short, date } from '../../lib/format.ts'
import { OpenElement } from '../../lib/element.ts'
import { getEnvironment } from '../../controllers/environment.ts'
import { copyButton } from '../../lib/copy.ts'

const CACHE_KEY = 'epay:liquidity:' + getEnvironment().id

function readCache () : Liquidity | null {
	try {
		return JSON.parse(sessionStorage.getItem(CACHE_KEY) ?? 'null') as Liquidity | null
	} catch {
		return null
	}
}

function writeCache (data : Liquidity) {
	try {
		sessionStorage.setItem(CACHE_KEY, JSON.stringify(data))
	} catch {
		// storage unavailable, cache is optional
	}
}

@customElement('dashboard-page')
export class DashboardPage extends OpenElement {
	@state() private data : Liquidity | null = readCache()
	@state() private error = ''
	@state() private refreshing = false

	connectedCallback () {
		super.connectedCallback()
		this.load()
	}

	// Shows the last known data immediately and revalidates in the background.
	private async load (refresh = false) {
		this.error = ''
		this.refreshing = true

		try {
			this.data = await api.liquidity(refresh)
			writeCache(this.data)
		} catch (error) {
			if (!this.data) this.error = (error as Error).message
		} finally {
			this.refreshing = false
		}
	}

	protected render () {
		if (this.error) return html`<section class=notice role=alert>${this.error}</section>`
		if (!this.data) return html`<p class=muted>Loading liquidity…</p>`

		const data = this.data

		return html`
			<div class=heading>
				<div>
					<p class=eyebrow>Operations</p>
					<h1>Liquidity</h1>
				</div>
				<button class='button outlined' ?disabled=${this.refreshing} @click=${() => this.load(true)}>${this.refreshing ? 'Refreshing…' : 'Refresh'}</button>
			</div>
			${data.top_up_required ? html`<section class='notice warning' role=status>Provider liquidity requires a manual top-up.</section>` : null}
			<section class=metrics aria-label='Liquidity balances'>
				<article class=panel><span>Provider balance</span><strong>${money(data.provider_balance)}</strong></article>
				<article class=panel><span>Reserved</span><strong>${money(data.provider_reserved)}</strong></article>
				<article class=panel><span>Available</span><strong>${money(data.provider_available)}</strong></article>
				<article class=panel><span>Gas pool</span><strong>${money(data.gas_balance, 'BNB')}</strong></article>
			</section>
			<section class=panel>
				<div class=section-title><h2>Wallets</h2><span class=muted>Updated ${date(data.updated_at)}</span></div>
				${this.wallet('Settlement', data.settlement_address)}
				${this.wallet('Fee', data.fee_address)}
				${this.wallet('Gas pool', data.gas_address)}
			</section>
		`
	}

	private wallet (label : string, address : string) {
		return html`
			<div class=wallet>
				<span>${label}</span>
				<code title=${address}>${short(address)}</code>
				${copyButton(address)}
			</div>
		`
	}
}
