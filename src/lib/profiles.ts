import { getEnvironment } from '../controllers/environment.ts'

export type Values = Record<string, string>

export interface RecentSender {
	id : string
	label : string
	accountType : 'PERSONAL' | 'BUSINESS'
	values : Values
	usedAt : string
}

export interface RecentBeneficiary {
	id : string
	label : string
	sublabel : string
	currency : string
	accountType : 'PERSONAL' | 'BUSINESS'
	values : Values
	usedAt : string
}

export interface PayoutDraft {
	clientId? : string
	currency? : string
	transactionType? : string
	amount? : string
	sender? : Values
	beneficiary? : Values
	message? : string
	isRecipientSelf? : boolean
}

export interface PayoutPrefill {
	clientId? : string
	currency? : string
	transactionType? : string
	amount? : string
	sender? : Values
	beneficiary? : Values
	message? : string
	isRecipientSelf? : boolean
}

const SENDERS_KEY = 'epay-recent-senders:v1'
const BENEFICIARIES_KEY = 'epay-recent-beneficiaries:v1'
const LEGACY_SENDER_KEY = `epay-test-payout-sender:${getEnvironment().id}`
const DRAFT_KEY = `epay-payout-draft:${getEnvironment().id}`
const PREFILL_KEY = 'epay-payout-prefill'

function readJson<T> (storage : Storage, key : string, fallback : T) : T {
	try {
		const raw = storage.getItem(key)
		if (!raw) return fallback
		return JSON.parse(raw) as T
	} catch {
		return fallback
	}
}

function writeJson (storage : Storage, key : string, value : unknown) {
	try {
		if (value === null || value === undefined) storage.removeItem(key)
		else storage.setItem(key, JSON.stringify(value))
	} catch {
		// Ignore storage errors
	}
}

export function cleanValues (values : Record<string, unknown> | null | undefined) : Values {
	if (!values || typeof values !== 'object') return {}
	const out : Values = {}
	for (const [key, val] of Object.entries(values)) {
		if (key === 'accountType') continue
		if (val !== undefined && val !== null && String(val).trim() !== '') {
			out[key] = String(val).trim()
		}
	}
	return out
}

export function senderDisplayName (values : Values) : string {
	return values.name
		|| [values.firstName, values.lastName].filter(Boolean).join(' ')
		|| values.email
		|| values.registrationNumber
		|| 'Sender'
}

export function beneficiaryDisplay (values : Values, currency : string) : { label : string, sublabel : string } {
	const label = values.name
		|| [values.firstName, values.lastName].filter(Boolean).join(' ')
		|| [values.nativeLastName, values.nativeFirstName].filter(Boolean).join('')
		|| values.nativeName
		|| values.accountNumber
		|| values.bankAccountNumber
		|| 'Recipient'
	const bank = values.bankCode || values.napasCode || values.ifsc || values.swiftCode || (values.bankId ? `Bank #${values.bankId}` : '')
	const acct = values.accountNumber || values.bankAccountNumber || values.vpa || ''
	const shortAcct = acct.length > 10 ? `…${acct.slice(-6)}` : acct
	const sublabel = [currency, bank, shortAcct].filter(Boolean).join(' · ')
	return { label, sublabel }
}

export function getRecentSenders () : RecentSender[] {
	const list = readJson<RecentSender[]>(localStorage, SENDERS_KEY, [])
	if (Array.isArray(list) && list.length > 0) return list

	const legacy = readJson<Record<string, string> | null>(localStorage, LEGACY_SENDER_KEY, null)
	if (legacy && typeof legacy === 'object') {
		const cleaned = cleanValues(legacy)
		if (Object.keys(cleaned).length > 0) {
			const migrated : RecentSender = {
				id: 'snd_legacy',
				accountType: 'PERSONAL',
				values: cleaned,
				label: senderDisplayName(cleaned),
				usedAt: new Date().toISOString()
			}
			writeJson(localStorage, SENDERS_KEY, [migrated])
			return [migrated]
		}
	}
	return []
}

export function recordSenderHistory (accountType : 'PERSONAL' | 'BUSINESS', rawValues : Record<string, unknown>) : RecentSender | null {
	const values = cleanValues(rawValues)
	if (Object.keys(values).length === 0) return null

	const label = senderDisplayName(values)
	const list = getRecentSenders()
	const now = new Date().toISOString()
	const key = `${accountType}:${label.toLowerCase()}`

	const idx = list.findIndex(item => `${item.accountType}:${item.label.toLowerCase()}` === key)
	let entry : RecentSender
	if (idx >= 0) {
		entry = {
			...list[idx],
			label,
			accountType,
			values: { ...list[idx].values, ...values },
			usedAt: now
		}
		list.splice(idx, 1)
		list.unshift(entry)
	} else {
		entry = {
			id: `snd_${crypto.randomUUID().slice(0, 8)}`,
			label,
			accountType,
			values,
			usedAt: now
		}
		list.unshift(entry)
	}
	writeJson(localStorage, SENDERS_KEY, list.slice(0, 15))
	writeJson(localStorage, LEGACY_SENDER_KEY, entry.values)
	return entry
}

export function removeSenderHistory (id : string) : RecentSender[] {
	const next = getRecentSenders().filter(item => item.id !== id)
	writeJson(localStorage, SENDERS_KEY, next)
	return next
}

export function getRecentBeneficiaries () : RecentBeneficiary[] {
	const list = readJson<RecentBeneficiary[]>(localStorage, BENEFICIARIES_KEY, [])
	return Array.isArray(list) ? list : []
}

export function recordBeneficiaryHistory (
	currency : string,
	accountType : 'PERSONAL' | 'BUSINESS',
	rawValues : Record<string, unknown>
) : RecentBeneficiary | null {
	const values = cleanValues(rawValues)
	if (Object.keys(values).length === 0) return null

	const { label, sublabel } = beneficiaryDisplay(values, currency)
	const list = getRecentBeneficiaries()
	const now = new Date().toISOString()
	const acctKey = values.accountNumber || values.bankAccountNumber || values.vpa || label.toLowerCase()

	const idx = list.findIndex(item =>
		item.currency === currency &&
		item.accountType === accountType &&
		((item.values.accountNumber || item.values.bankAccountNumber || item.values.vpa || item.label.toLowerCase()) === acctKey)
	)

	let entry : RecentBeneficiary
	if (idx >= 0) {
		entry = {
			...list[idx],
			label,
			sublabel,
			currency,
			accountType,
			values: { ...list[idx].values, ...values },
			usedAt: now
		}
		list.splice(idx, 1)
		list.unshift(entry)
	} else {
		entry = {
			id: `bnf_${crypto.randomUUID().slice(0, 8)}`,
			label,
			sublabel,
			currency,
			accountType,
			values,
			usedAt: now
		}
		list.unshift(entry)
	}

	writeJson(localStorage, BENEFICIARIES_KEY, list.slice(0, 25))
	return entry
}

export function removeBeneficiaryHistory (id : string) : RecentBeneficiary[] {
	const next = getRecentBeneficiaries().filter(item => item.id !== id)
	writeJson(localStorage, BENEFICIARIES_KEY, next)
	return next
}

export function loadPayoutDraft () : PayoutDraft {
	const draft = readJson<PayoutDraft>(localStorage, DRAFT_KEY, {})
	if (!draft.sender || Object.keys(draft.sender).length === 0) {
		const legacy = readJson<Record<string, string> | null>(localStorage, LEGACY_SENDER_KEY, null)
		if (legacy && typeof legacy === 'object') {
			draft.sender = cleanValues(legacy)
		}
	}
	return draft
}

export function savePayoutDraft (draft : PayoutDraft) {
	const current = loadPayoutDraft()
	const merged = { ...current, ...draft }
	writeJson(localStorage, DRAFT_KEY, merged)
	if (draft.sender) {
		writeJson(localStorage, LEGACY_SENDER_KEY, draft.sender)
	}
}

export function setPayoutPrefill (prefill : PayoutPrefill) {
	writeJson(sessionStorage, PREFILL_KEY, prefill)
}

export function consumePayoutPrefill () : PayoutPrefill | null {
	const data = readJson<PayoutPrefill | null>(sessionStorage, PREFILL_KEY, null)
	if (data) writeJson(sessionStorage, PREFILL_KEY, null)
	return data
}
