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

export interface ApiKey {
	id : string
	prefix : string
	created_at : string
	revoked_at : string | null
}

export interface Deposit {
	id : string
	amount : string
	status : string
	tx_hash : string
	created_at : string
}

export interface Order {
	id : string
	reference_id : string
	status : string
	payout_amount : string
	payout_currency : string
	total_debit : string | null
	created_at : string
}

export interface ClientSummary {
	id : string
	name : string
	commission_percent : string
	available_balance : string
	reserved_balance : string
	blocked : boolean
	created_at : string
}

export interface ClientDetail extends ClientSummary {
	deposit_address : string
	pending_balance : string
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
}

const API_ORIGIN = getEnvironment().apiOrigin

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

	liquidity () {
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
		}>('/liquidity').then(data => ({
			...data,
			settlement_address: data.settlement_address ?? '',
			fee_address: data.fee_address ?? '',
			gas_address: data.gas_wallet_address ?? '',
			gas_balance: data.gas_balance_bnb,
			updated_at: data.updated_at
		}))
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

	async clients () {
		const data = await this.request<{ items : Array<{
			id : string
			name : string
			status : string
			commission_percent : string
			available_balance? : string
			reserved_balance? : string
			created_at : string
		}> }>('/clients')

		return { clients: data.items.map(client => ({
			...client,
			available_balance: client.available_balance ?? '—',
			reserved_balance: client.reserved_balance ?? '—',
			blocked: client.status !== 'ACTIVE'
		})) }
	}

	async client (id : string) {
		const data = await this.request<{
			id : string
			name : string
			status : string
			commission_percent : string
			deposit_address : string
			balance : { available : string, reserved : string, pending : string }
			keys : Array<{ id : string, key_prefix : string, created_at : string, revoked_at : string | null }>
			deposits : Deposit[]
			orders : Order[]
			webhook : { url : string, updated_at : string, status : string | null } | null
		}>(`/clients/${encodeURIComponent(id)}`)

		return {
			id: data.id,
			name: data.name,
			commission_percent: data.commission_percent,
			available_balance: data.balance.available,
			reserved_balance: data.balance.reserved,
			pending_balance: data.balance.pending,
			blocked: data.status !== 'ACTIVE',
			created_at: '',
			deposit_address: data.deposit_address,
			webhook_url: data.webhook?.url ?? null,
			webhook_status: data.webhook?.status ?? (data.webhook ? 'Configured' : null),
			keys: data.keys.map(key => ({ ...key, prefix: key.key_prefix })),
			deposits: data.deposits,
			orders: data.orders
		}
	}

	async createClient (name : string, commissionPercent : string) {
		const data = await this.request<{ api_key : { key : string } }>('/clients', {
			method: 'POST',
			body: JSON.stringify({ name, commission_percent: commissionPercent })
		})

		return { api_key: data.api_key.key }
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
}

export const api = new Api()
