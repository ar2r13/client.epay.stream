import { getEnvironment } from '../controllers/environment.ts'

export type Values = Record<string, string>

export interface SavedSender {
	id : string
	label : string
	accountType : 'PERSONAL' | 'BUSINESS'
	values : Values
	updatedAt : string
}

export interface SavedBeneficiary {
	id : string
	label : string
	currency : string
	accountType : 'PERSONAL' | 'BUSINESS'
	values : Values
	updatedAt : string
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
	autoSaveOnSubmit? : boolean
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

const SENDERS_KEY = 'epay-saved-senders:v1'
const BENEFICIARIES_KEY = 'epay-saved-beneficiaries:v1'
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
		// Ignore quota or privacy mode errors
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

export function formatSenderLabel (values : Values, accountType : 'PERSONAL' | 'BUSINESS') : string {
	const name = values.name
		|| [values.firstName, values.lastName].filter(Boolean).join(' ')
		|| values.email
		|| values.registrationNumber
		|| 'Unnamed sender'
	const country = values.nationality || values.country || ''
	return [name, accountType === 'BUSINESS' ? 'Business' : 'Personal', country].filter(Boolean).join(' · ')
}

export function formatBeneficiaryLabel (values : Values, currency : string, accountType : 'PERSONAL' | 'BUSINESS') : string {
	const name = values.name
		|| [values.firstName, values.lastName].filter(Boolean).join(' ')
		|| [values.nativeLastName, values.nativeFirstName].filter(Boolean).join('')
		|| values.nativeName
		|| 'Recipient'
	const bank = values.bankCode || values.napasCode || values.ifsc || values.swiftCode || (values.bankId ? `Bank #${values.bankId}` : '')
	const acct = values.accountNumber || values.bankAccountNumber || values.vpa || ''
	const shortAcct = acct.length > 8 ? `…${acct.slice(-4)}` : acct
	const method = [bank, shortAcct].filter(Boolean).join(' ')
	return [name, currency, method || (accountType === 'BUSINESS' ? 'Business' : 'Personal')].filter(Boolean).join(' · ')
}

export function getSavedSenders () : SavedSender[] {
	const list = readJson<SavedSender[]>(localStorage, SENDERS_KEY, [])
	if (Array.isArray(list) && list.length > 0) return list

	// Migrate legacy single sender if present
	const legacy = readJson<Record<string, string> | null>(localStorage, LEGACY_SENDER_KEY, null)
	if (legacy && typeof legacy === 'object' && Object.keys(legacy).length > 0) {
		const cleaned = cleanValues(legacy)
		if (Object.keys(cleaned).length > 0) {
			const migrated : SavedSender = {
				id: 'snd_legacy',
				accountType: 'PERSONAL',
				values: cleaned,
				label: formatSenderLabel(cleaned, 'PERSONAL'),
				updatedAt: new Date().toISOString()
			}
			writeJson(localStorage, SENDERS_KEY, [migrated])
			return [migrated]
		}
	}
	return []
}

export function saveSenderProfile (
	accountType : 'PERSONAL' | 'BUSINESS',
	rawValues : Record<string, unknown>,
	customLabel? : string,
	existingId? : string
) : SavedSender | null {
	const values = cleanValues(rawValues)
	if (Object.keys(values).length === 0) return null

	const list = getSavedSenders()
	const label = customLabel?.trim() || formatSenderLabel(values, accountType)
	const now = new Date().toISOString()

	// Update existing by ID or by matching label + accountType
	const matchIndex = list.findIndex(item =>
		(existingId && item.id === existingId) ||
		(item.accountType === accountType && item.label.toLowerCase() === label.toLowerCase())
	)

	let saved : SavedSender
	if (matchIndex >= 0) {
		saved = {
			...list[matchIndex],
			label,
			accountType,
			values: { ...list[matchIndex].values, ...values },
			updatedAt: now
		}
		list.splice(matchIndex, 1)
		list.unshift(saved)
	} else {
		saved = {
			id: `snd_${crypto.randomUUID().slice(0, 8)}`,
			label,
			accountType,
			values,
			updatedAt: now
		}
		list.unshift(saved)
	}

	writeJson(localStorage, SENDERS_KEY, list.slice(0, 50))
	return saved
}

export function deleteSenderProfile (id : string) : SavedSender[] {
	const next = getSavedSenders().filter(item => item.id !== id)
	writeJson(localStorage, SENDERS_KEY, next)
	try {
		if (next.length === 0) localStorage.removeItem(LEGACY_SENDER_KEY)
	} catch {
		// ignore
	}
	return next
}

export function getSavedBeneficiaries () : SavedBeneficiary[] {
	const list = readJson<SavedBeneficiary[]>(localStorage, BENEFICIARIES_KEY, [])
	return Array.isArray(list) ? list : []
}

export function saveBeneficiaryProfile (
	currency : string,
	accountType : 'PERSONAL' | 'BUSINESS',
	rawValues : Record<string, unknown>,
	customLabel? : string,
	existingId? : string
) : SavedBeneficiary | null {
	const values = cleanValues(rawValues)
	if (Object.keys(values).length === 0) return null

	const list = getSavedBeneficiaries()
	const label = customLabel?.trim() || formatBeneficiaryLabel(values, currency, accountType)
	const now = new Date().toISOString()
	const acctKey = values.accountNumber || values.bankAccountNumber || values.vpa || ''

	const matchIndex = list.findIndex(item =>
		(existingId && item.id === existingId) ||
		(item.currency === currency && item.accountType === accountType && (
			item.label.toLowerCase() === label.toLowerCase() ||
			(acctKey && (item.values.accountNumber === acctKey || item.values.bankAccountNumber === acctKey || item.values.vpa === acctKey))
		))
	)

	let saved : SavedBeneficiary
	if (matchIndex >= 0) {
		saved = {
			...list[matchIndex],
			label,
			currency,
			accountType,
			values: { ...list[matchIndex].values, ...values },
			updatedAt: now
		}
		list.splice(matchIndex, 1)
		list.unshift(saved)
	} else {
		saved = {
			id: `bnf_${crypto.randomUUID().slice(0, 8)}`,
			label,
			currency,
			accountType,
			values,
			updatedAt: now
		}
		list.unshift(saved)
	}

	writeJson(localStorage, BENEFICIARIES_KEY, list.slice(0, 100))
	return saved
}

export function deleteBeneficiaryProfile (id : string) : SavedBeneficiary[] {
	const next = getSavedBeneficiaries().filter(item => item.id !== id)
	writeJson(localStorage, BENEFICIARIES_KEY, next)
	return next
}

export function loadPayoutDraft () : PayoutDraft {
	return readJson<PayoutDraft>(localStorage, DRAFT_KEY, {})
}

export function savePayoutDraft (draft : PayoutDraft) {
	const current = loadPayoutDraft()
	writeJson(localStorage, DRAFT_KEY, { ...current, ...draft })
}

export function setPayoutPrefill (prefill : PayoutPrefill) {
	writeJson(sessionStorage, PREFILL_KEY, prefill)
}

export function consumePayoutPrefill () : PayoutPrefill | null {
	const data = readJson<PayoutPrefill | null>(sessionStorage, PREFILL_KEY, null)
	if (data) writeJson(sessionStorage, PREFILL_KEY, null)
	return data
}
