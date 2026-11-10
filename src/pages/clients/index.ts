import { html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { api, type ClientSummary } from '../../controllers/api.ts'
import { money, date } from '../../lib/format.ts'
import { OpenElement } from '../../lib/element.ts'
import { copyButton } from '../../lib/copy.ts'

@customElement('clients-page')
export class ClientsPage extends OpenElement {
	@state() private clients : ClientSummary[] | null = null
	@state() private error = ''
	@state() private key = ''

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
			</div>
			${this.error ? html`<section class=notice role=alert>${this.error}</section>` : null}
			${this.key ? html`
				<section class='notice success' role=status>
					<strong>API key created.</strong> Copy it now; it will not be shown again.
					<code>${this.key}</code>
					${copyButton(this.key, 'Copy key', 'button outlined')}
				</section>
			` : null}
			<section class=panel>
				<h2>Create client</h2>
				<form class=form @submit=${this.create}>
					<label>Name<input name=name required autocomplete=off></label>
					<label>Commission, %<input name=commission_percent required inputmode=decimal value=5></label>
					<button class='button solid' type=submit>Create and issue key</button>
				</form>
			</section>
			<section class='panel table-wrap'>
				<table>
					<thead><tr><th>Client</th><th>Commission</th><th>Available</th><th>Status</th><th>Created</th></tr></thead>
					<tbody>${this.clients?.map(client => html`
						<tr>
							<td><a href=${`/clients/${client.id}`}>${client.name}</a></td>
							<td>${client.commission_percent}%</td>
							<td>${money(client.available_balance)}</td>
							<td><span class=${`status ${client.blocked ? 'danger' : 'success'}`}>${client.blocked ? 'Blocked' : 'Active'}</span></td>
							<td>${date(client.created_at)}</td>
						</tr>
					`)}</tbody>
				</table>
				${this.clients?.length === 0 ? html`<p class=empty>No clients yet.</p>` : null}
			</section>
		`
	}
}
