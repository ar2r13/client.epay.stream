import { html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { api, type ClientSummary } from '../../controllers/api.ts'
import { money, date, short } from '../../lib/format.ts'
import { OpenElement } from '../../lib/element.ts'
import { copyButton, copyable } from '../../lib/copy.ts'
import { getEnvironment } from '../../controllers/environment.ts'

const IS_PROD = getEnvironment().id === 'prod'

@customElement('clients-page')
export class ClientsPage extends OpenElement {
	@state() private clients : ClientSummary[] | null = null
	@state() private error = ''
	@state() private key = ''
	@state() private createdClientId = ''

	connectedCallback () {
		super.connectedCallback()
		this.load()
	}

	private async load () {
		try {
			this.clients = (await api.clients()).clients
		} catch (error) {
			this.error = (error as Error).message
		}
	}

	private async create (event : SubmitEvent) {
		event.preventDefault()
		const form = new FormData(event.currentTarget as HTMLFormElement)

		try {
			const result = await api.createClient(String(form.get('name')), String(form.get('commission_percent')))
			this.key = result.api_key
			this.createdClientId = result.id
			;(event.currentTarget as HTMLFormElement).reset()
			await this.load()
		} catch (error) {
			this.error = (error as Error).message
		}
	}

	protected render () {
		return html`
			<div class=heading>
				<div><p class=eyebrow>Accounts</p><h1>Clients</h1></div>
				<a class='button solid' href=/test-payout>${IS_PROD ? 'Create payout' : 'Test payout'}</a>
			</div>
			${this.error ? html`<section class=notice role=alert>${this.error}</section>` : null}
			${this.key ? html`
				<section class='notice success' role=status>
					<strong>API key created.</strong> Copy it now; it will not be shown again.
					<code>${this.key}</code>
					<div class=row-actions>
						${copyButton(this.key, 'Copy key', 'button outlined sm')}
						${this.createdClientId ? html`<a class='button solid sm' href=${`/clients/${this.createdClientId}`}>Open client →</a>` : null}
					</div>
				</section>
			` : null}
			<section class=panel>
				<h2>Create client</h2>
				<form class=form @submit=${this.create}>
					<label>Name<input name=name required autocomplete=off placeholder='e.g. Acme Corp'></label>
					<label>Commission, %<input name=commission_percent required inputmode=decimal value=5></label>
					<button class='button solid' type=submit>Create and issue key</button>
				</form>
			</section>
			<section class='panel table-wrap'>
				<table>
					<thead><tr><th>Client</th><th>Deposit address</th><th>Commission</th><th>Available</th><th>Reserved</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
					<tbody>${this.clients?.map(client => html`
						<tr class=clickable-row @click=${() => navigation.navigate(`/clients/${client.id}`)}>
							<td>
								<a href=${`/clients/${client.id}`}><strong>${client.name}</strong></a>
								<div><small class=muted><code>${client.id}</code></small></div>
							</td>
							<td @click=${(e : Event) => e.stopPropagation()}>${client.deposit_address ? copyable(client.deposit_address, short(client.deposit_address)) : '—'}</td>
							<td>${client.commission_percent}%</td>
							<td><strong>${money(client.available_balance)}</strong></td>
							<td>${money(client.reserved_balance)}</td>
							<td><span class=${`status ${client.blocked ? 'danger' : 'success'}`}>${client.blocked ? 'Blocked' : 'Active'}</span></td>
							<td>${date(client.created_at)}</td>
							<td @click=${(e : Event) => e.stopPropagation()}>
								<div class=row-actions>
									<a class='button outlined sm' href=${`/clients/${client.id}`}>Open</a>
									<a class='button text sm' href=${`/test-payout?client=${encodeURIComponent(client.id)}`}>${IS_PROD ? 'Payout' : 'Test payout'}</a>
								</div>
							</td>
						</tr>
					`)}</tbody>
				</table>
				${this.clients?.length === 0 ? html`<p class=empty>No clients yet.</p>` : null}
			</section>
		`
	}
}
