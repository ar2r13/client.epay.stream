import { html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { api, type ClientDetail } from '../../controllers/api.ts'
import { money, date, short } from '../../lib/format.ts'
import { OpenElement } from '../../lib/element.ts'

@customElement('client-page')
export class ClientPage extends OpenElement {
	@property({ attribute: false }) clientId = ''
	@state() private client : ClientDetail | null = null
	@state() private error = ''
	@state() private key = ''

	protected updated (changed : Map<string, unknown>) {
		if (changed.has('clientId') && this.clientId) this.load()
	}

	private async load () {
		this.error = ''

		try {
			this.client = await api.client(this.clientId)
		} catch (error) {
			this.error = (error as Error).message
		}
	}

	private async issueKey () {
		try {
			this.key = (await api.issueKey(this.clientId)).api_key
			await this.load()
		} catch (error) {
			this.error = (error as Error).message
		}
	}

	private async revokeKey (id : string) {
		try {
			await api.revokeKey(this.clientId, id)
			await this.load()
		} catch (error) {
			this.error = (error as Error).message
		}
	}

	private async commission (event : SubmitEvent) {
		event.preventDefault()
		const form = new FormData(event.currentTarget as HTMLFormElement)

		try {
			await api.commission(this.clientId, String(form.get('commission_percent')))
			await this.load()
		} catch (error) {
			this.error = (error as Error).message
		}
	}

	protected render () {
		if (this.error && !this.client) return html`<section class=notice role=alert>${this.error}</section>`
		if (!this.client) return html`<p class=muted>Loading client…</p>`

		const client = this.client

		return html`
			<a class=back href=/clients>← Clients</a>
			<div class=heading>
				<div><p class=eyebrow>Client</p><h1>${client.name}</h1></div>
				<span class=${`status ${client.blocked ? 'danger' : 'success'}`}>${client.blocked ? 'Blocked' : 'Active'}</span>
			</div>
			${this.error ? html`<section class=notice role=alert>${this.error}</section>` : null}
			${this.key ? html`
				<section class='notice success' role=status>
					<strong>New API key.</strong> Copy it now; it will not be shown again.
					<code>${this.key}</code>
					<button class='button outlined' @click=${() => navigator.clipboard.writeText(this.key)}>Copy key</button>
				</section>
			` : null}
			<section class=metrics>
				<article class=panel><span>Available</span><strong>${money(client.available_balance)}</strong></article>
				<article class=panel><span>Reserved</span><strong>${money(client.reserved_balance)}</strong></article>
				<article class=panel><span>Pending</span><strong>${money(client.pending_balance)}</strong></article>
			</section>
			<section class=split>
				<article class=panel>
					<h2>Configuration</h2>
					<form class=form @submit=${this.commission}>
						<label>Commission, %<input name=commission_percent required inputmode=decimal .value=${client.commission_percent}></label>
						<button class='button solid' type=submit>Update commission</button>
					</form>
					<div class=datum><span>Deposit address</span><code title=${client.deposit_address}>${short(client.deposit_address)}</code></div>
					<div class=datum><span>Webhook</span><strong>${client.webhook_url ?? 'Not configured'}</strong></div>
					<div class=datum><span>Webhook status</span><strong>${client.webhook_status ?? '—'}</strong></div>
				</article>
				<article class=panel>
					<div class=section-title><h2>API keys</h2><button class='button outlined' @click=${this.issueKey}>Issue key</button></div>
					${client.keys.map(key => html`
						<div class=key-row>
							<div><code>${key.prefix}…</code><small>Created ${date(key.created_at)}</small></div>
							${key.revoked_at ? html`<span class='status muted'>Revoked</span>` : html`<button class='button danger' @click=${() => this.revokeKey(key.id)}>Revoke</button>`}
						</div>
					`)}
				</article>
			</section>
			${this.orders(client)}
			${this.deposits(client)}
		`
	}

	private orders (client : ClientDetail) {
		return html`
			<section class='panel table-wrap'>
				<div class=section-title><h2>Orders</h2><span class=muted>${client.orders.length} total</span></div>
				<table><thead><tr><th>ID</th><th>Reference</th><th>Payout</th><th>Debit</th><th>Status</th><th>Created</th></tr></thead>
				<tbody>${client.orders.map(order => html`<tr>
					<td><code title=${order.id}>${short(order.id)}</code></td><td>${order.reference_id}</td>
					<td>${money(order.payout_amount, order.payout_currency)}</td><td>${money(order.total_debit)}</td>
					<td><span class=status>${order.status}</span></td><td>${date(order.created_at)}</td>
				</tr>`)}</tbody></table>
				${client.orders.length === 0 ? html`<p class=empty>No orders yet.</p>` : null}
			</section>
		`
	}

	private deposits (client : ClientDetail) {
		return html`
			<section class='panel table-wrap'>
				<div class=section-title><h2>Deposits</h2><span class=muted>${client.deposits.length} total</span></div>
				<table><thead><tr><th>Transaction</th><th>Amount</th><th>Status</th><th>Created</th></tr></thead>
				<tbody>${client.deposits.map(deposit => html`<tr>
					<td><code title=${deposit.tx_hash}>${short(deposit.tx_hash)}</code></td><td>${money(deposit.amount)}</td>
					<td><span class=status>${deposit.status}</span></td><td>${date(deposit.created_at)}</td>
				</tr>`)}</tbody></table>
				${client.deposits.length === 0 ? html`<p class=empty>No deposits yet.</p>` : null}
			</section>
		`
	}
}
