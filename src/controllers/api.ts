import { getEnvironment } from './environment.ts'

export interface Liquidity {
	provider_balance : string
	provider_reserved : string
	provider_available : string
	settlement_address : string
	fee_address : string
	gas_address : string
	gas_balance : string
	top_up_required : boolean
	updated_at : string
}

export interface CorridorRequirement {
	transaction_type : string
	sender_account_type : string
	beneficiary_account_type : string
	sender : string[]
	beneficiary : string[]
}

export interface PayoutRequirement {
	currency : string
	transaction_types : CorridorRequirement[]
	rules : string[]
}

export interface ApiKey {
	id : string
	prefix : string
	created_at : string
	revoked_at : string | null
}

export interface Deposit {
	id : string
	chain_id? : number
	block_number? : number
	log_index? : number
	amount : string
	commission_percent? : string | null
	provider_reserve? : string | null
	fee_reserve? : string | null
	status : string
	tx_hash : string
	gas_tx_hash? : string | null
	settlement_tx_hash? : string | null
	fee_tx_hash? : string | null
	error_code? : string | null
	created_at : string
	confirmed_at? : string | null
}

export interface Order {
	id : string
	client_id? : string
	reference_id : string
	merchant_reference_id? : string
	provider_payout_id? : string | null
	status : string
	provider_status : string | null
	transaction_type? : string
	deduction_currency? : string
	estimated_provider_debit? : string
	reserved_amount? : string
	provider_debit? : string | null
	provider_fee? : string | null
	provider_rate? : string | null
	commission_bps? : number
	commission_percent? : string
	commission_amount? : string | null
	total_debit : string | null
	settlement_delta? : string | null
	is_recipient_self? : boolean
	message? : string | null
	utr? : string | null
	error_code : string | null
	error_message : string | null
	payout_amount : string
	payout_currency : string
	sender? : Record<string, unknown> | null
	beneficiary? : Record<string, unknown> | null
	created_at : string
	updated_at? : string
	paid_at? : string | null
}

export interface OrderLedgerTransaction {
	id : string
	type : string
	reference_type : string
	created_at : string
	entries : Array<{
		id : string
		account_id : string
		kind : string
		amount : string
	}>
}

export interface OrderWebhookAttempt {
	event_id : string
	type : string
	created_at : string
	attempt : number | null
	status : string | null
	response_status : number | null
	last_error : string | null
	updated_at : string | null
}

export interface OrderDetail extends Order {
	client_name? : string
	ledger : OrderLedgerTransaction[]
	webhooks : OrderWebhookAttempt[]
}

export interface ClientSummary {
	id : string
	name : string
	status? : string
	commission_percent : string
	available_balance : string
	reserved_balance : string
	deposit_address? : string
	blocked : boolean
	created_at : string
}

export interface ClientDetail extends ClientSummary {
	chain_id : number
	deposit_address : string
	pending_balance : string
	syncing? : boolean
	webhook_url : string | null
	webhook_status : string | null
	keys : ApiKey[]
	deposits : Deposit[]
	orders : Order[]
}

export interface TestPayout {
	order_id? : string
	client_id? : string
	client_name? : string
	reference_id? : string
	merchant_reference_id : string
	provider_id : string
	status : string
	rate : string
	provider_debit : string
	provider_fee : string
	commission_amount? : string
	total_debit? : string
	error_code? : string | null
	error_message? : string | null
}

export interface BankDirectoryEntry {
	code? : string
	bankCode? : string
	napasCode? : string
	swiftCode? : string
	name : string
}

const API_ORIGIN = getEnvironment().apiOrigin

let bankDirPromise : Promise<Record<string, BankDirectoryEntry[]>> | null = null

class Api {
	async request<T> (path : string, init? : RequestInit) : Promise<T> {
		const response = await fetch(`${API_ORIGIN}/admin/api${path}`, {
			...init,
			credentials: 'include',
			headers: {
				'content-type': 'application/json',
				...init?.headers
			}
		})

		if (!response.ok) {
			const body = await response.json().catch(() => null) as {
				message? : string
				error? : { message? : string }
			} | null

			throw new Error(body?.error?.message ?? body?.message ?? `Request failed (${response.status})`)
		}

		if (response.status === 204) return undefined as T

		return response.json() as Promise<T>
	}

	bankDirectories () : Promise<Record<string, BankDirectoryEntry[]>> {
		if (!bankDirPromise) {
			bankDirPromise = fetch('/bank-directories.json')
				.then(res => res.ok ? res.json() : {})
				.catch(() => ({}))
		}
		return bankDirPromise
	}

	liquidity (refresh = false) {
		return this.request<{
			provider_balance : string
			provider_reserved : string
			provider_available : string
			settlement_address : string | null
			fee_address : string | null
			gas_wallet_address : string | null
			gas_balance_bnb : string
			top_up_required : boolean
			updated_at : string
		}>(refresh ? '/liquidity?refresh=1' : '/liquidity').then(data => ({
			...data,
			settlement_address: data.settlement_address ?? '',
			fee_address: data.fee_address ?? '',
			gas_address: data.gas_wallet_address ?? '',
			gas_balance: data.gas_balance_bnb,
			updated_at: data.updated_at
		}))
	}

	payoutRequirements () {
		return this.request<{ currencies : PayoutRequirement[] }>('/payout-requirements').then(data => data.currencies)
	}

	liquiditySummary () {
		return this.request<{
			provider_reserved : string
			settlement_address : string | null
			fee_address : string | null
			gas_wallet_address : string | null
			updated_at : string
		}>('/liquidity/summary').then(data => ({
			provider_reserved: data.provider_reserved,
			settlement_address: data.settlement_address ?? '',
			fee_address: data.fee_address ?? '',
			gas_address: data.gas_wallet_address ?? '',
			updated_at: data.updated_at
		}))
	}

	providerLiquidity (refresh = false) {
		return this.request<{
			provider_balance : string
			provider_reserved : string
			provider_available : string
			top_up_required : boolean
			updated_at : string
		}>(refresh ? '/liquidity/provider?refresh=1' : '/liquidity/provider')
	}

	gasLiquidity (refresh = false) {
		return this.request<{ gas_balance_bnb : string, updated_at : string }>(refresh ? '/liquidity/gas?refresh=1' : '/liquidity/gas')
			.then(data => ({ gas_balance: data.gas_balance_bnb, updated_at: data.updated_at }))
	}

	rates (refresh = false, transactionType = 'C2C') {
		const params = new URLSearchParams()
		if (refresh) params.set('refresh', '1')
		if (transactionType) params.set('transaction_type', transactionType)
		const qs = params.toString()
		return this.request<{
			source_currency : string
			transaction_type : string
			scene : string
			rates : Array<{ currency : string, rate : string, rate_id : string | null, rate_time : string | null }>
			missing : string[]
			updated_at : string
		}>(qs ? `/rates?${qs}` : '/rates')
	}

	testPayout (body : Record<string, unknown>) {
		return this.request<TestPayout>('/test-payouts', {
			method: 'POST',
			body: JSON.stringify(body)
		})
	}

	createPayout (body : Record<string, unknown>) {
		return this.request<TestPayout>('/payouts', {
			method: 'POST',
			body: JSON.stringify(body)
		})
	}

	order (id : string, reconcile = false) {
		return this.request<OrderDetail>(`/orders/${encodeURIComponent(id)}${reconcile ? '?reconcile=1' : ''}`)
	}

	reconcileOrder (id : string) {
		return this.request<OrderDetail>(`/orders/${encodeURIComponent(id)}/reconcile`, {
			method: 'POST'
		})
	}

	orderReceiptUrl (id : string) {
		return `${API_ORIGIN}/admin/api/orders/${encodeURIComponent(id)}/receipt`
	}

	sweepDeposit (id : string) {
		return this.request<{ deposit_id : string, status : string, queued : boolean }>(`/deposits/${encodeURIComponent(id)}/sweep`, {
			method: 'POST'
		})
	}

	async clients () {
		const data = await this.request<{ items : Array<{
			id : string
			name : string
			status : string
			commission_percent : string
			available_balance? : string
			reserved_balance? : string
			deposit_address? : string
			created_at : string
		}> }>('/clients')

		return { clients: data.items.map(client => ({
			...client,
			available_balance: client.available_balance ?? '—',
			reserved_balance: client.reserved_balance ?? '—',
			blocked: client.status !== 'ACTIVE'
		})) }
	}

	async client (id : string) : Promise<ClientDetail> {
		const data = await this.request<{
			id : string
			name : string
			status : string
			chain_id? : number
			commission_percent : string
			deposit_address : string
			created_at? : string
			balance : { available : string, reserved : string, pending : string, syncing? : boolean }
			keys : Array<{ id : string, key_prefix : string, created_at : string, revoked_at : string | null }>
			deposits : Deposit[]
			orders : Order[]
			webhook : { url : string, updated_at : string, status : string | null } | null
		}>(`/clients/${encodeURIComponent(id)}`)

		return {
			id: data.id,
			name: data.name,
			status: data.status,
			chain_id: data.chain_id ?? (getEnvironment().id === 'prod' ? 56 : 97),
			commission_percent: data.commission_percent,
			available_balance: data.balance.available,
			reserved_balance: data.balance.reserved,
			pending_balance: data.balance.pending,
			syncing: data.balance.syncing,
			blocked: data.status !== 'ACTIVE',
			created_at: data.created_at ?? '',
			deposit_address: data.deposit_address,
			webhook_url: data.webhook?.url ?? null,
			webhook_status: data.webhook?.status ?? (data.webhook ? 'Configured' : null),
			keys: data.keys.map(key => ({ ...key, prefix: key.key_prefix })),
			deposits: data.deposits,
			orders: data.orders
		}
	}

	async createClient (name : string, commissionPercent : string) {
		const data = await this.request<{ id : string, api_key : { key : string } }>('/clients', {
			method: 'POST',
			body: JSON.stringify({ name, commission_percent: commissionPercent })
		})

		return { id: data.id, api_key: data.api_key.key }
	}

	async issueKey (id : string) {
		const data = await this.request<{ id : string, key : string }>(`/clients/${encodeURIComponent(id)}/keys`, {
			method: 'POST'
		})

		return { id: data.id, api_key: data.key }
	}

	revokeKey (clientId : string, keyId : string) {
		return this.request<void>(`/clients/${encodeURIComponent(clientId)}/keys/${encodeURIComponent(keyId)}`, {
			method: 'DELETE'
		})
	}

	commission (id : string, commissionPercent : string) {
		return this.request<void>(`/clients/${encodeURIComponent(id)}/commission`, {
			method: 'PATCH',
			body: JSON.stringify({ commission_percent: commissionPercent })
		})
	}

	clientStatus (id : string, status : 'ACTIVE' | 'BLOCKED') {
		return this.request<{ status : string }>(`/clients/${encodeURIComponent(id)}/status`, {
			method: 'PATCH',
			body: JSON.stringify({ status })
		})
	}
}

export const api = new Api()
