import { html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { api, type ClientDetail, type Deposit, type Order, type OrderDetail } from '../../controllers/api.ts'
import { bscScanUrl, date, money, short, statusTone } from '../../lib/format.ts'
import { OpenElement } from '../../lib/element.ts'
import { copyButton, copyable } from '../../lib/copy.ts'
import { getEnvironment } from '../../controllers/environment.ts'
import {
	cleanValues,
	recordBeneficiaryHistory,
	recordSenderHistory,
	setPayoutPrefill
} from '../../lib/profiles.ts'

const IS_PROD = getEnvironment().id === 'prod'

const fieldLabel = (field : string) => field
	.replace(/([a-z])([A-Z])/g, '$1 $2')
	.replace(/^./, char => char.toUpperCase())

function beneficiarySummary (beneficiary : Record<string, unknown> | null | undefined) : { name : string, detail : string } {
	if (!beneficiary) return { name: '—', detail: '' }
	const name = String(
		beneficiary.name
		|| [beneficiary.firstName, beneficiary.lastName].filter(Boolean).join(' ')
		|| [beneficiary.nativeLastName, beneficiary.nativeFirstName].filter(Boolean).join('')
		|| beneficiary.nativeName
		|| '—'
	)
	const bank = beneficiary.bankCode || beneficiary.napasCode || beneficiary.ifsc || beneficiary.swiftCode || (beneficiary.bankId ? `Bank #${beneficiary.bankId}` : '')
	const account = beneficiary.accountNumber || beneficiary.bankAccountNumber || beneficiary.vpa || ''
	const detail = [bank, account].filter(Boolean).join(' · ')
	return { name, detail }
}

@customElement('client-page')
export class ClientPage extends OpenElement {
	@property({ attribute: false }) clientId = ''
	@state() private client : ClientDetail | null = null
	@state() private loading = false
	@state() private error = ''
	@state() private key = ''

	@state() private orderFilter = 'ALL'
	@state() private orderSearch = ''
	@state() private selectedOrderId = ''
	@state() private orderDetail : OrderDetail | null = null
	@state() private orderLoading = false
	@state() private reconcilingOrderId = ''
	@state() private sweepingDepositId = ''

	#onKeyDown = (event : KeyboardEvent) => {
		if (event.key === 'Escape' && this.selectedOrderId) {
			this.closeOrder()
		}
	}

	connectedCallback () {
		super.connectedCallback()
		window.addEventListener('keydown', this.#onKeyDown)
	}

	disconnectedCallback () {
		window.removeEventListener('keydown', this.#onKeyDown)
		super.disconnectedCallback()
	}

	protected updated (changed : Map<string, unknown>) {
		if (changed.has('clientId') && this.clientId) {
			const params = new URLSearchParams(location.search)
			const initialOrder = params.get('order') || ''
			this.load(initialOrder)
		}
	}

	private async load (openOrderId = '') {
		this.error = ''
		this.loading = true

		try {
			this.client = await api.client(this.clientId)
			if (openOrderId) {
				await this.inspectOrder(openOrderId)
			}
		} catch (error) {
			this.error = (error as Error).message
		} finally {
			this.loading = false
		}
	}

	private async inspectOrder (orderId : string) {
		this.selectedOrderId = orderId

		const cached = this.client?.orders.find(item => item.id === orderId)
		if (cached && (!this.orderDetail || this.orderDetail.id !== orderId)) {
			this.orderDetail = { ...cached, ledger: [], webhooks: [] }
		}

		this.orderLoading = true
		try {
			const detail = await api.order(orderId)
			if (this.selectedOrderId === orderId) {
				this.orderDetail = detail
			}
			if (this.client) {
				this.client = {
					...this.client,
					orders: this.client.orders.map(item => item.id === orderId ? { ...item, ...detail } : item)
				}
			}
		} catch (error) {
			this.error = (error as Error).message
		} finally {
			this.orderLoading = false
		}
	}

	private closeOrder () {
		this.selectedOrderId = ''
		this.orderDetail = null
	}

	private async reconcileOrder (orderId : string) {
		this.reconcilingOrderId = orderId
		this.error = ''
		try {
			const updated = await api.reconcileOrder(orderId)
			this.orderDetail = updated
			const refreshed = await api.client(this.clientId)
			this.client = refreshed
		} catch (error) {
			this.error = (error as Error).message
		} finally {
			this.reconcilingOrderId = ''
		}
	}

	private repeatOrder (order : Order) {
		if (order.sender) {
			const sType = String(order.sender.accountType || (order.transaction_type?.startsWith('B') ? 'BUSINESS' : 'PERSONAL')) === 'BUSINESS' ? 'BUSINESS' : 'PERSONAL'
			recordSenderHistory(sType, order.sender)
		}
		if (order.beneficiary) {
			const bType = String(order.beneficiary.accountType || (order.transaction_type?.endsWith('B') ? 'BUSINESS' : 'PERSONAL')) === 'BUSINESS' ? 'BUSINESS' : 'PERSONAL'
			recordBeneficiaryHistory(order.payout_currency, bType, order.beneficiary)
		}
		setPayoutPrefill({
			clientId: this.client?.id ?? order.client_id,
			currency: order.payout_currency,
			transactionType: order.transaction_type ?? 'C2C',
			amount: order.payout_amount,
			sender: cleanValues(order.sender),
			beneficiary: cleanValues(order.beneficiary),
			message: order.message ?? '',
			isRecipientSelf: Boolean(order.is_recipient_self)
		})
		navigation.navigate('/test-payout')
	}

	private async sweepDeposit (deposit : Deposit) {
		this.sweepingDepositId = deposit.id
		this.error = ''
		try {
			await api.sweepDeposit(deposit.id)
			await this.load()
		} catch (error) {
			this.error = (error as Error).message
		} finally {
			this.sweepingDepositId = ''
		}
	}

	private async toggleClientStatus () {
		if (!this.client) return
		const next = this.client.blocked ? 'ACTIVE' : 'BLOCKED'
		if (next === 'BLOCKED' && !confirm(`Block client "${this.client.name}" from creating new payout orders?`)) return
		try {
			await api.clientStatus(this.client.id, next)
			await this.load()
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
		if (!confirm('Revoke this API key?')) return
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
		const addrUrl = bscScanUrl(client.chain_id, 'address', client.deposit_address)

		return html`
			<a class=back href=/clients>← Clients</a>
			<div class=heading>
				<div class=client-title-group>
					<div class=title-row>
						<h1>${client.name}</h1>
						<span class=${`status ${client.blocked ? 'danger' : 'success'}`}>${client.blocked ? 'Blocked' : 'Active'}</span>
					</div>
					<div class=client-submeta>
						<span>ID: <code>${client.id}</code> ${copyButton(client.id)}</span>
						<span class=sep>·</span>
						<span>Deposit: <code title=${client.deposit_address}>${short(client.deposit_address)}</code> ${copyButton(client.deposit_address)} ${addrUrl ? html`<a class=ext-link href=${addrUrl} target=_blank rel=noopener>BscScan ↗</a>` : null}</span>
					</div>
				</div>
				<div class=heading-actions>
					<button class='button outlined' type=button ?disabled=${this.loading} @click=${() => this.load()}>${this.loading ? 'Refreshing…' : 'Refresh'}</button>
					<a class='button solid' href=${`/test-payout?client=${encodeURIComponent(client.id)}`}>${IS_PROD ? 'Create payout' : 'New test payout'}</a>
				</div>
			</div>

			${this.error ? html`<section class=notice role=alert>${this.error}</section>` : null}
			${this.key ? html`
				<section class='notice success' role=status>
					<strong>New API key issued.</strong> Copy it now; it will not be shown again.
					<code>${this.key}</code>
					${copyButton(this.key, 'Copy key', 'button outlined sm')}
				</section>
			` : null}

			<section class=metrics>
				<article class=panel><span>Available</span><strong>${money(client.available_balance)}</strong></article>
				<article class=panel><span>Reserved</span><strong>${money(client.reserved_balance)}</strong></article>
				<article class=panel><span>Pending deposits</span><strong>${money(client.pending_balance)}</strong></article>
				<article class=panel><span>Commission</span><strong>${client.commission_percent}%</strong></article>
			</section>

			<section class=split>
				<article class=panel>
					<div class=section-title>
						<h2>Settings</h2>
						<button class=${`button ${client.blocked ? 'outlined' : 'danger'} sm`} type=button @click=${this.toggleClientStatus}>
							${client.blocked ? 'Unblock client' : 'Block client'}
						</button>
					</div>
					<form class=form @submit=${this.commission}>
						<label>Commission rate (%)<input name=commission_percent required inputmode=decimal .value=${client.commission_percent}></label>
						<button class='button outlined' type=submit>Save</button>
					</form>
					<div class=datum><span>Webhook URL</span><strong>${client.webhook_url ?? 'Not configured'}</strong></div>
					<div class=datum><span>Webhook status</span><strong>${client.webhook_status ?? '—'}</strong></div>
				</article>
				<article class=panel>
					<div class=section-title><h2>API keys</h2><button class='button outlined sm' @click=${this.issueKey}>Issue key</button></div>
					${client.keys.map(key => html`
						<div class=key-row>
							<div><code>${key.prefix}…</code><small>Created ${date(key.created_at)}</small></div>
							${key.revoked_at ? html`<span class='status muted'>Revoked</span>` : html`<button class='button danger sm' @click=${() => this.revokeKey(key.id)}>Revoke</button>`}
						</div>
					`)}
				</article>
			</section>

			${this.orders(client)}
			${this.deposits(client)}
			${this.orderDetail ? this.renderDrawer(this.orderDetail) : null}
		`
	}

	private renderPartyList (title : string, data : Record<string, unknown> | null | undefined) {
		const entries = Object.entries(data ?? {}).filter(([key, val]) => key !== 'accountType' && val !== undefined && val !== null && val !== '')
		const acctType = data?.accountType ? String(data.accountType) : ''
		return html`
			<div class=drawer-section>
				<div class=drawer-section-head>
					<h3>${title}</h3>
					${acctType ? html`<span class=badge-subtle>${acctType}</span>` : null}
				</div>
				${entries.length ? html`
					<dl class=dl-list>
						${entries.map(([key, value]) => html`
							<div class=dl-row>
								<dt>${fieldLabel(key)}</dt>
								<dd>${copyable(String(value), String(value))}</dd>
							</div>
						`)}
					</dl>
				` : html`<p class=muted>No details recorded.</p>`}
			</div>
		`
	}

	private renderDrawer (order : OrderDetail) {
		const reconciling = this.reconcilingOrderId === order.id
		return html`
			<div class=drawer-backdrop @click=${this.closeOrder}>
				<aside class=drawer @click=${(e : Event) => e.stopPropagation()} aria-label='Transaction details'>
					<header class=drawer-header>
						<div>
							<div class=drawer-amount-row>
								<strong>${money(order.payout_amount, order.payout_currency)}</strong>
								<span class=${`status ${statusTone(order.status)}`}>${order.status}</span>
								${order.provider_status ? html`<span class='status muted'>PEXX: ${order.provider_status}</span>` : null}
							</div>
							<div class=drawer-subid>
								<code>${order.id}</code> ${copyButton(order.id)}
								<span>· ${date(order.created_at)}</span>
							</div>
						</div>
						<button class=drawer-close type=button aria-label='Close' @click=${this.closeOrder}>✕</button>
					</header>

					<div class=drawer-toolbar>
						<button class='button outlined sm' type=button ?disabled=${reconciling} @click=${() => this.reconcileOrder(order.id)}>
							${reconciling ? 'Syncing…' : 'Sync with PEXX'}
						</button>
						<button class='button outlined sm' type=button @click=${() => this.repeatOrder(order)}>
							Repeat payout
						</button>
						${order.status === 'PAID' ? html`
							<a class='button outlined sm' href=${api.orderReceiptUrl(order.id)} target=_blank rel=noopener>PDF Receipt ↗</a>
						` : null}
					</div>

					<div class=drawer-body>
						${order.error_message || order.error_code ? html`
							<div class=notice role=alert>
								<strong>Rejection / Error</strong>
								<code>${order.error_code ? `${order.error_code}: ` : ''}${order.error_message ?? 'Unknown error'}</code>
							</div>
						` : null}

						<div class=receipt-box>
							<div class=receipt-row>
								<span>Payout amount</span>
								<strong>${money(order.payout_amount, order.payout_currency)} (${order.transaction_type ?? 'C2C'})</strong>
							</div>
							<div class=receipt-row>
								<span>Exchange rate</span>
								<strong>${order.provider_rate ? `1 USDT = ${order.provider_rate} ${order.payout_currency}` : '—'}</strong>
							</div>
							<div class=receipt-row>
								<span>Provider debit</span>
								<span>${money(order.provider_debit ?? order.estimated_provider_debit)} ${order.provider_fee && order.provider_fee !== '0' ? `(incl. ${money(order.provider_fee)} fee)` : ''}</span>
							</div>
							<div class=receipt-row>
								<span>Client commission (${order.commission_percent ?? '—'}%)</span>
								<span>${money(order.commission_amount)}</span>
							</div>
							<div class='receipt-row total'>
								<span>Total client debit</span>
								<strong>${money(order.total_debit ?? order.reserved_amount)}</strong>
							</div>
						</div>

						<div class=drawer-section>
							<h3>Identifiers & References</h3>
							<dl class=dl-list>
								<div class=dl-row><dt>Client reference</dt><dd>${copyable(order.reference_id, order.reference_id)}</dd></div>
								<div class=dl-row><dt>PEXX payout ID</dt><dd>${order.provider_payout_id ? copyable(order.provider_payout_id, order.provider_payout_id) : '—'}</dd></div>
								<div class=dl-row><dt>Bank UTR / Trace</dt><dd>${order.utr ? copyable(order.utr, order.utr) : '—'}</dd></div>
								<div class=dl-row><dt>Recipient is self</dt><dd>${order.is_recipient_self ? 'Yes' : 'No'}</dd></div>
								${order.message ? html`<div class=dl-row><dt>Message</dt><dd>${order.message}</dd></div>` : null}
								${order.paid_at ? html`<div class=dl-row><dt>Paid at</dt><dd>${date(order.paid_at)}</dd></div>` : null}
							</dl>
						</div>

						${this.renderPartyList('Recipient (Beneficiary)', order.beneficiary)}
						${this.renderPartyList('Sender', order.sender)}

						<div class=drawer-section>
							<h3>Ledger movements</h3>
							${this.orderLoading && !order.ledger.length ? html`<p class=muted>Loading…</p>` : null}
							${order.ledger.length ? html`
								<div class=ledger-list>
									${order.ledger.map(tx => html`
										<div class=ledger-tx>
											<div class=ledger-tx-head>
												<strong>${tx.type}</strong>
												<span class=muted>${date(tx.created_at)}</span>
											</div>
											<div class=ledger-entries>
												${tx.entries.map(entry => html`
													<span class=${`ledger-chip ${entry.amount.startsWith('-') ? 'neg' : 'pos'}`}>
														${entry.kind}: ${entry.amount.startsWith('-') ? '' : '+'}${entry.amount} USDT
													</span>
												`)}
											</div>
										</div>
									`)}
								</div>
							` : (!this.orderLoading ? html`<p class=muted>No ledger entries.</p>` : null)}
						</div>

						${order.webhooks.length ? html`
							<div class=drawer-section>
								<h3>Webhooks</h3>
								<div class=ledger-list>
									${order.webhooks.map(wh => html`
										<div class=ledger-tx>
											<div class=ledger-tx-head>
												<strong>${wh.type} ${wh.attempt ? `#${wh.attempt}` : ''}</strong>
												<span class=${`status ${statusTone(wh.status)}`}>${wh.status ?? 'QUEUED'} ${wh.response_status ? `(${wh.response_status})` : ''}</span>
											</div>
											${wh.last_error ? html`<small class=muted>${wh.last_error}</small>` : null}
										</div>
									`)}
								</div>
							</div>
						` : null}
					</div>
				</aside>
			</div>
		`
	}

	private orders (client : ClientDetail) {
		const counts : Record<string, number> = { ALL: client.orders.length }
		for (const o of client.orders) {
			counts[o.status] = (counts[o.status] ?? 0) + 1
		}
		const query = this.orderSearch.trim().toLowerCase()
		const filtered = client.orders.filter(order => {
			if (this.orderFilter !== 'ALL' && order.status !== this.orderFilter) return false
			if (!query) return true
			const bnf = beneficiarySummary(order.beneficiary)
			const haystack = [
				order.id,
				order.reference_id,
				order.provider_payout_id,
				order.payout_currency,
				order.payout_amount,
				order.status,
				order.utr,
				bnf.name,
				bnf.detail
			].filter(Boolean).join(' ').toLowerCase()
			return haystack.includes(query)
		})

		const statuses = ['ALL', 'PAID', 'PENDING', 'CANCELLED', 'REVERSED', 'SUBMISSION_UNKNOWN']
			.filter(st => st === 'ALL' || counts[st])

		return html`
			<section class='panel table-panel'>
				<div class=table-header>
					<div class=filter-tabs>
						${statuses.map(st => html`
							<button
								type=button
								class=${`tab-btn ${this.orderFilter === st ? 'active' : ''}`}
								@click=${() => { this.orderFilter = st }}>
								${st === 'ALL' ? 'All orders' : st} <span>${counts[st] ?? 0}</span>
							</button>
						`)}
					</div>
					<input
						class=search-input
						type=search
						placeholder='Filter orders…'
						.value=${this.orderSearch}
						@input=${(e : Event) => { this.orderSearch = (e.currentTarget as HTMLInputElement).value }}>
				</div>
				<div class=table-wrap>
					<table>
						<thead>
							<tr>
								<th>Order</th>
								<th>Recipient</th>
								<th>Payout</th>
								<th>Total debit</th>
								<th>Status</th>
								<th>Created</th>
								<th></th>
							</tr>
						</thead>
						<tbody>${filtered.map(order => {
							const bnf = beneficiarySummary(order.beneficiary)
							const selected = this.selectedOrderId === order.id
							return html`
								<tr class=${`clickable-row ${selected ? 'selected' : ''}`} @click=${() => this.inspectOrder(order.id)}>
									<td>
										<code class=row-id>${short(order.id)}</code>
										<small class=cell-sub title=${order.reference_id}>${short(order.reference_id)}</small>
									</td>
									<td>
										<div class=cell-main>${bnf.name}</div>
										${bnf.detail ? html`<small class=cell-sub>${bnf.detail}</small>` : null}
									</td>
									<td>
										<div class=cell-main>${money(order.payout_amount, order.payout_currency)}</div>
										<small class=cell-sub>${order.transaction_type ?? 'C2C'}${order.provider_rate ? ` · ${order.provider_rate}` : ''}</small>
									</td>
									<td>
										<div class=cell-main>${money(order.total_debit ?? order.reserved_amount)}</div>
										${order.commission_amount ? html`<small class=cell-sub>Fee ${money(order.commission_amount)}</small>` : null}
									</td>
									<td>
										<span class=${`status ${statusTone(order.status)}`}>${order.status}</span>
										${order.error_message ? html`<small class=reason title=${order.error_message}>${order.error_message}</small>` : null}
									</td>
									<td class=muted>${date(order.created_at)}</td>
									<td class=cell-end @click=${(e : Event) => e.stopPropagation()}>
										<button class='button outlined sm' type=button @click=${() => this.repeatOrder(order)}>Repeat</button>
									</td>
								</tr>
							`
						})}</tbody>
					</table>
				</div>
				${filtered.length === 0 ? html`<p class=empty>No matching orders.</p>` : null}
			</section>
		`
	}

	private deposits (client : ClientDetail) {
		return html`
			<section class='panel table-panel'>
				<div class=table-header>
					<h2>Deposits <span class=muted>(${client.deposits.length})</span></h2>
				</div>
				<div class=table-wrap>
					<table>
						<thead>
							<tr>
								<th>Transaction</th>
								<th>Block</th>
								<th>Amount</th>
								<th>Split (Provider / Fee)</th>
								<th>Status</th>
								<th>Created</th>
								<th></th>
							</tr>
						</thead>
						<tbody>${client.deposits.map(deposit => {
							const txUrl = bscScanUrl(deposit.chain_id ?? client.chain_id, 'tx', deposit.tx_hash)
							return html`
								<tr>
									<td>
										${copyable(deposit.tx_hash, short(deposit.tx_hash))}
										${txUrl ? html`<a class=ext-link href=${txUrl} target=_blank rel=noopener>↗</a>` : null}
									</td>
									<td class=muted>${deposit.block_number ?? '—'}</td>
									<td><strong>${money(deposit.amount)}</strong></td>
									<td class=muted>
										${deposit.provider_reserve ? `${money(deposit.provider_reserve)} / ${money(deposit.fee_reserve ?? '0')}` : '—'}
									</td>
									<td>
										<span class=${`status ${statusTone(deposit.status)}`}>${deposit.status}</span>
										${deposit.error_code ? html`<small class=reason>${deposit.error_code}</small>` : null}
									</td>
									<td class=muted>${date(deposit.created_at)}</td>
									<td class=cell-end>
										${deposit.status !== 'CONFIRMED' ? html`
											<button
												class='button outlined sm'
												type=button
												?disabled=${this.sweepingDepositId === deposit.id}
												@click=${() => this.sweepDeposit(deposit)}>
												${this.sweepingDepositId === deposit.id ? 'Queueing…' : 'Sweep'}
											</button>
										` : null}
									</td>
								</tr>
							`
						})}</tbody>
					</table>
				</div>
				${client.deposits.length === 0 ? html`<p class=empty>No deposits yet.</p>` : null}
			</section>
		`
	}
}
