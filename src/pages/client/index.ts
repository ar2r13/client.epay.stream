import { html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { api, type ClientDetail, type Deposit, type Order, type OrderDetail } from '../../controllers/api.ts'
import { bscScanUrl, date, money, short, statusTone } from '../../lib/format.ts'
import { OpenElement } from '../../lib/element.ts'
import { copyButton, copyable } from '../../lib/copy.ts'
import { getEnvironment } from '../../controllers/environment.ts'
import {
	cleanValues,
	saveBeneficiaryProfile,
	saveSenderProfile,
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
	@state() private flash = ''
	@state() private key = ''

	@state() private orderFilter = 'ALL'
	@state() private orderSearch = ''
	@state() private selectedOrderId = ''
	@state() private orderDetail : OrderDetail | null = null
	@state() private orderLoading = false
	@state() private reconcilingOrderId = ''
	@state() private sweepingDepositId = ''

	protected updated (changed : Map<string, unknown>) {
		if (changed.has('clientId') && this.clientId) {
			const params = new URLSearchParams(location.search)
			const initialOrder = params.get('order') || ''
			this.load(initialOrder)
		}
	}

	private showFlash (message : string) {
		this.flash = message
		setTimeout(() => {
			if (this.flash === message) this.flash = ''
		}, 3000)
	}

	private async load (openOrderId = this.selectedOrderId) {
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
		const url = new URL(location.href)
		url.searchParams.set('order', orderId)
		history.replaceState(null, '', url.toString())

		const cached = this.client?.orders.find(item => item.id === orderId)
		if (cached && (!this.orderDetail || this.orderDetail.id !== orderId)) {
			this.orderDetail = { ...cached, ledger: [], webhooks: [] }
		}

		this.orderLoading = true
		try {
			this.orderDetail = await api.order(orderId)
			if (this.client) {
				this.client = {
					...this.client,
					orders: this.client.orders.map(item => item.id === orderId ? { ...item, ...this.orderDetail! } : item)
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
		const url = new URL(location.href)
		url.searchParams.delete('order')
		history.replaceState(null, '', url.toString())
	}

	private async reconcileOrder (orderId : string) {
		this.reconcilingOrderId = orderId
		this.error = ''
		try {
			const updated = await api.reconcileOrder(orderId)
			this.orderDetail = updated
			await this.load(orderId)
			this.showFlash(`Reconciled order ${orderId} with PEXX (${updated.status})`)
		} catch (error) {
			this.error = (error as Error).message
		} finally {
			this.reconcilingOrderId = ''
		}
	}

	private repeatOrder (order : Order) {
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

	private savePartyFromOrder (party : 'sender' | 'beneficiary', order : Order) {
		if (party === 'sender' && order.sender) {
			const acctType = String(order.sender.accountType || (order.transaction_type?.startsWith('B') ? 'BUSINESS' : 'PERSONAL')) === 'BUSINESS' ? 'BUSINESS' : 'PERSONAL'
			const saved = saveSenderProfile(acctType, order.sender)
			if (saved) this.showFlash(`Saved sender "${saved.label}" to browser`)
		}
		if (party === 'beneficiary' && order.beneficiary) {
			const acctType = String(order.beneficiary.accountType || (order.transaction_type?.endsWith('B') ? 'BUSINESS' : 'PERSONAL')) === 'BUSINESS' ? 'BUSINESS' : 'PERSONAL'
			const saved = saveBeneficiaryProfile(order.payout_currency, acctType, order.beneficiary)
			if (saved) this.showFlash(`Saved recipient "${saved.label}" to browser`)
		}
	}

	private async sweepDeposit (deposit : Deposit) {
		this.sweepingDepositId = deposit.id
		this.error = ''
		try {
			await api.sweepDeposit(deposit.id)
			this.showFlash(`Queued sweep job for deposit ${short(deposit.tx_hash)}`)
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
			this.showFlash(`Client status updated to ${next}`)
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
		if (!confirm('Revoke this API key immediately?')) return
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
			this.showFlash('Commission updated')
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
				<div>
					<p class=eyebrow>Client · <code>${client.id}</code> ${copyButton(client.id)}</p>
					<h1>${client.name}</h1>
				</div>
				<div class=heading-actions>
					${this.flash ? html`<span class='status success'>${this.flash}</span>` : null}
					<span class=${`status ${client.blocked ? 'danger' : 'success'}`}>${client.blocked ? 'Blocked' : 'Active'}</span>
					<button class='button outlined' type=button ?disabled=${this.loading} @click=${() => this.load()}>${this.loading ? 'Refreshing…' : 'Refresh'}</button>
					<a class='button solid' href=${`/test-payout?client=${encodeURIComponent(client.id)}`}>${IS_PROD ? 'Create payout' : 'Test payout'}</a>
				</div>
			</div>
			${this.error ? html`<section class=notice role=alert>${this.error}</section>` : null}
			${this.key ? html`
				<section class='notice success' role=status>
					<strong>New API key.</strong> Copy it now; it will not be shown again.
					<code>${this.key}</code>
					${copyButton(this.key, 'Copy key', 'button outlined')}
				</section>
			` : null}
			<section class=metrics>
				<article class=panel><span>Available balance</span><strong>${money(client.available_balance)}</strong></article>
				<article class=panel><span>Reserved in orders</span><strong>${money(client.reserved_balance)}</strong></article>
				<article class=panel><span>Pending deposits</span><strong>${money(client.pending_balance)}</strong></article>
				<article class=panel><span>Total orders</span><strong>${client.orders.length}</strong></article>
			</section>
			<section class=split>
				<article class=panel>
					<div class=section-title>
						<h2>Configuration</h2>
						<button class=${`button ${client.blocked ? 'outlined' : 'danger'} sm`} type=button @click=${this.toggleClientStatus}>
							${client.blocked ? 'Unblock client' : 'Block client'}
						</button>
					</div>
					<form class=form @submit=${this.commission}>
						<label>Commission, %<input name=commission_percent required inputmode=decimal .value=${client.commission_percent}></label>
						<button class='button solid' type=submit>Update commission</button>
					</form>
					<div class=datum>
						<span>Deposit address</span>
						<code title=${client.deposit_address}>${short(client.deposit_address)}</code>
						${copyButton(client.deposit_address)}
						${addrUrl ? html`<a class='button text sm' href=${addrUrl} target=_blank rel=noopener>BscScan ↗</a>` : null}
					</div>
					<div class=datum><span>Webhook</span><strong>${client.webhook_url ?? 'Not configured'}</strong></div>
					<div class=datum><span>Webhook status</span><strong>${client.webhook_status ?? '—'}</strong></div>
				</article>
				<article class=panel>
					<div class=section-title><h2>API keys</h2><button class='button outlined' @click=${this.issueKey}>Issue key</button></div>
					${client.keys.map(key => html`
						<div class=key-row>
							<div><code>${key.prefix}…</code><small>Created ${date(key.created_at)}</small></div>
							${key.revoked_at ? html`<span class='status muted'>Revoked</span>` : html`<button class='button danger sm' @click=${() => this.revokeKey(key.id)}>Revoke</button>`}
						</div>
					`)}
				</article>
			</section>
			${this.orderDetail ? this.renderOrderInspector(this.orderDetail) : null}
			${this.orders(client)}
			${this.deposits(client)}
		`
	}

	private renderPartyEntries (party : 'sender' | 'beneficiary', data : Record<string, unknown> | null | undefined, order : OrderDetail) {
		const entries = Object.entries(data ?? {}).filter(([, val]) => val !== undefined && val !== null && val !== '')
		return html`
			<article class='panel subpanel'>
				<div class=section-title>
					<h3>${party === 'sender' ? 'Sender details' : 'Beneficiary (Recipient) details'}</h3>
					${entries.length ? html`
						<button class='button outlined sm' type=button @click=${() => this.savePartyFromOrder(party, order)}>
							Save ${party === 'sender' ? 'sender' : 'recipient'} to browser
						</button>
					` : null}
				</div>
				${entries.length ? html`
					<div class=kv-grid>
						${entries.map(([key, value]) => html`
							<div class=kv-item>
								<span>${fieldLabel(key)}</span>
								<strong>${copyable(String(value), String(value))}</strong>
							</div>
						`)}
					</div>
				` : html`<p class=muted>No details recorded.</p>`}
			</article>
		`
	}

	private renderOrderInspector (order : OrderDetail) {
		const reconciling = this.reconcilingOrderId === order.id
		return html`
			<section class='panel inspector' aria-label='Transaction details'>
				<div class=inspector-head>
					<div>
						<p class=eyebrow>Transaction inspector</p>
						<h2>
							<code>${order.id}</code> ${copyButton(order.id)}
							<span class=${`status ${statusTone(order.status)}`}>${order.status}</span>
							${order.provider_status ? html`<span class='status muted'>PEXX: ${order.provider_status}</span>` : null}
						</h2>
					</div>
					<div class=inspector-actions>
						<button class='button outlined sm' type=button ?disabled=${reconciling} @click=${() => this.reconcileOrder(order.id)}>
							${reconciling ? 'Syncing with PEXX…' : 'Sync status with PEXX'}
						</button>
						${order.status === 'PAID' ? html`
							<a class='button outlined sm' href=${api.orderReceiptUrl(order.id)} target=_blank rel=noopener>PDF Receipt ↗</a>
						` : null}
						<button class='button solid sm' type=button @click=${() => this.repeatOrder(order)}>
							Repeat / Clone payout
						</button>
						<button class='button text sm' type=button @click=${this.closeOrder}>Close ✕</button>
					</div>
				</div>

				${order.error_message || order.error_code ? html`
					<div class=notice role=alert>
						<strong>Failure / Rejection reason</strong>
						<code>${order.error_code ? `${order.error_code} · ` : ''}${order.error_message ?? 'No error message'}</code>
					</div>
				` : null}

				<div class=metrics>
					<article class='panel subpanel'>
						<span>Payout amount</span>
						<strong>${money(order.payout_amount, order.payout_currency)}</strong>
						<small class=muted>${order.transaction_type ?? 'C2C'} · ${order.is_recipient_self ? 'Self-recipient' : 'Third-party'}</small>
					</article>
					<article class='panel subpanel'>
						<span>Provider debit & rate</span>
						<strong>${money(order.provider_debit ?? order.estimated_provider_debit)}</strong>
						<small class=muted>Rate: ${order.provider_rate ?? '—'} · Fee: ${money(order.provider_fee ?? '0')}</small>
					</article>
					<article class='panel subpanel'>
						<span>Client commission (${order.commission_percent ?? '—'}%)</span>
						<strong>${money(order.commission_amount)}</strong>
						<small class=muted>Settlement delta: ${money(order.settlement_delta)}</small>
					</article>
					<article class='panel subpanel'>
						<span>Total client debit</span>
						<strong>${money(order.total_debit ?? order.reserved_amount)}</strong>
						<small class=muted>Currently reserved: ${money(order.reserved_amount)}</small>
					</article>
				</div>

				<div class='panel subpanel'>
					<h3>Identifiers & Timeline</h3>
					<div class=kv-grid>
						<div class=kv-item><span>Order ID</span><strong>${copyable(order.id, order.id)}</strong></div>
						<div class=kv-item><span>Client reference ID</span><strong>${copyable(order.reference_id, order.reference_id)}</strong></div>
						<div class=kv-item><span>Merchant reference ID</span><strong>${copyable(order.merchant_reference_id ?? order.id, order.merchant_reference_id ?? order.id)}</strong></div>
						<div class=kv-item><span>PEXX provider ID</span><strong>${order.provider_payout_id ? copyable(order.provider_payout_id, order.provider_payout_id) : '—'}</strong></div>
						<div class=kv-item><span>Bank UTR / Trace</span><strong>${order.utr ? copyable(order.utr, order.utr) : '—'}</strong></div>
						<div class=kv-item><span>Message / Remark</span><strong>${order.message || '—'}</strong></div>
						<div class=kv-item><span>Created at</span><strong>${date(order.created_at)}</strong></div>
						<div class=kv-item><span>Updated at</span><strong>${date(order.updated_at)}</strong></div>
						<div class=kv-item><span>Paid at</span><strong>${date(order.paid_at)}</strong></div>
					</div>
				</div>

				<div class=split>
					${this.renderPartyEntries('sender', order.sender, order)}
					${this.renderPartyEntries('beneficiary', order.beneficiary, order)}
				</div>

				<div class=split>
					<article class='panel subpanel'>
						<h3>Internal ledger movements</h3>
						${this.orderLoading && !order.ledger.length ? html`<p class=muted>Loading ledger…</p>` : null}
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
						` : (!this.orderLoading ? html`<p class=muted>No ledger entries found.</p>` : null)}
					</article>
					<article class='panel subpanel'>
						<h3>Webhook deliveries</h3>
						${order.webhooks.length ? html`
							<div class=ledger-list>
								${order.webhooks.map(wh => html`
									<div class=ledger-tx>
										<div class=ledger-tx-head>
											<strong>${wh.type} ${wh.attempt ? `(Attempt #${wh.attempt})` : ''}</strong>
											<span class=${`status ${statusTone(wh.status)}`}>${wh.status ?? 'QUEUED'} ${wh.response_status ? `· HTTP ${wh.response_status}` : ''}</span>
										</div>
										<small class=muted>${date(wh.updated_at ?? wh.created_at)} ${wh.last_error ? `· ${wh.last_error}` : ''}</small>
									</div>
								`)}
							</div>
						` : html`<p class=muted>No webhook events recorded for this order.</p>`}
					</article>
				</div>
			</section>
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
			<section class='panel table-wrap'>
				<div class=section-title>
					<h2>Orders</h2>
					<div class=table-controls>
						<div class=filter-pills>
							${statuses.map(st => html`
								<button
									type=button
									class=${`chip ${this.orderFilter === st ? 'active' : ''}`}
									@click=${() => { this.orderFilter = st }}>
									${st} (${counts[st] ?? 0})
								</button>
							`)}
						</div>
						<input
							class=search-input
							type=search
							placeholder='Search ID, ref, recipient, bank…'
							.value=${this.orderSearch}
							@input=${(e : Event) => { this.orderSearch = (e.currentTarget as HTMLInputElement).value }}>
					</div>
				</div>
				<table>
					<thead>
						<tr>
							<th>Order / Ref</th>
							<th>Recipient</th>
							<th>Payout</th>
							<th>Total debit</th>
							<th>Status</th>
							<th>PEXX</th>
							<th>Created</th>
							<th>Actions</th>
						</tr>
					</thead>
					<tbody>${filtered.map(order => {
						const bnf = beneficiarySummary(order.beneficiary)
						const selected = this.selectedOrderId === order.id
						return html`
							<tr class=${`clickable-row ${selected ? 'selected' : ''}`} @click=${() => this.inspectOrder(order.id)}>
								<td>
									<div @click=${(e : Event) => e.stopPropagation()}>${copyable(order.id, short(order.id))}</div>
									<small class=muted title=${order.reference_id}>Ref: ${short(order.reference_id)}</small>
								</td>
								<td>
									<strong>${bnf.name}</strong>
									${bnf.detail ? html`<small class=reason>${bnf.detail}</small>` : null}
								</td>
								<td>
									<strong>${money(order.payout_amount, order.payout_currency)}</strong>
									<small class=reason>${order.transaction_type ?? 'C2C'} ${order.provider_rate ? `· Rate ${order.provider_rate}` : ''}</small>
								</td>
								<td>
									<strong>${money(order.total_debit ?? order.reserved_amount)}</strong>
									${order.commission_amount ? html`<small class=reason>Fee: ${money(order.commission_amount)}</small>` : null}
								</td>
								<td>
									<span class=${`status ${statusTone(order.status)}`}>${order.status}</span>
									${order.error_message ? html`<small class=reason title=${order.error_code ?? ''}>${order.error_message}</small>` : null}
								</td>
								<td>
									${order.provider_status ? html`<span class=${`status ${statusTone(order.provider_status)}`}>${order.provider_status}</span>` : html`<span class=muted>—</span>`}
									${order.provider_payout_id ? html`<small class=reason>${short(order.provider_payout_id)}</small>` : null}
								</td>
								<td>
									<div>${date(order.created_at)}</div>
									${order.paid_at ? html`<small class=reason>Paid ${date(order.paid_at)}</small>` : null}
								</td>
								<td @click=${(e : Event) => e.stopPropagation()}>
									<div class=row-actions>
										<button class='button outlined sm' type=button @click=${() => this.inspectOrder(order.id)}>Details</button>
										<button class='button text sm' type=button @click=${() => this.repeatOrder(order)}>Repeat</button>
									</div>
								</td>
							</tr>
						`
					})}</tbody>
				</table>
				${filtered.length === 0 ? html`<p class=empty>No matching orders.</p>` : null}
			</section>
		`
	}

	private deposits (client : ClientDetail) {
		return html`
			<section class='panel table-wrap'>
				<div class=section-title><h2>Deposits</h2><span class=muted>${client.deposits.length} total</span></div>
				<table>
					<thead>
						<tr>
							<th>Transaction</th>
							<th>Block</th>
							<th>Amount</th>
							<th>Reserve / Fee split</th>
							<th>Status</th>
							<th>Sweep Txs</th>
							<th>Created</th>
							<th>Actions</th>
						</tr>
					</thead>
					<tbody>${client.deposits.map(deposit => {
						const txUrl = bscScanUrl(deposit.chain_id ?? client.chain_id, 'tx', deposit.tx_hash)
						const settleUrl = bscScanUrl(deposit.chain_id ?? client.chain_id, 'tx', deposit.settlement_tx_hash)
						const feeUrl = bscScanUrl(deposit.chain_id ?? client.chain_id, 'tx', deposit.fee_tx_hash)
						return html`
							<tr>
								<td>
									${copyable(deposit.tx_hash, short(deposit.tx_hash))}
									${txUrl ? html`<a class='button text sm' href=${txUrl} target=_blank rel=noopener>BscScan ↗</a>` : null}
								</td>
								<td>${deposit.block_number ?? '—'}</td>
								<td><strong>${money(deposit.amount)}</strong></td>
								<td>
									${deposit.provider_reserve ? html`
										<small class=reason>Provider: ${money(deposit.provider_reserve)} · Fee: ${money(deposit.fee_reserve ?? '0')}</small>
									` : html`<span class=muted>—</span>`}
								</td>
								<td>
									<span class=${`status ${statusTone(deposit.status)}`}>${deposit.status}</span>
									${deposit.error_code ? html`<small class=reason>${deposit.error_code}</small>` : null}
								</td>
								<td>
									${settleUrl ? html`<a class='button text sm' href=${settleUrl} target=_blank rel=noopener>Settle ↗</a>` : null}
									${feeUrl ? html`<a class='button text sm' href=${feeUrl} target=_blank rel=noopener>Fee ↗</a>` : null}
									${!settleUrl && !feeUrl ? html`<span class=muted>—</span>` : null}
								</td>
								<td>
									<div>${date(deposit.created_at)}</div>
									${deposit.confirmed_at ? html`<small class=reason>Confirmed ${date(deposit.confirmed_at)}</small>` : null}
								</td>
								<td>
									${deposit.status !== 'CONFIRMED' ? html`
										<button
											class='button outlined sm'
											type=button
											?disabled=${this.sweepingDepositId === deposit.id}
											@click=${() => this.sweepDeposit(deposit)}>
											${this.sweepingDepositId === deposit.id ? 'Queueing…' : 'Retry sweep'}
										</button>
									` : html`<span class=muted>—</span>`}
								</td>
							</tr>
						`
					})}</tbody>
				</table>
				${client.deposits.length === 0 ? html`<p class=empty>No deposits yet.</p>` : null}
			</section>
		`
	}
}
