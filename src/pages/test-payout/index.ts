import { html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { api, type BankDirectoryEntry, type ClientSummary, type PayoutRequirement, type TestPayout } from '../../controllers/api.ts'
import { money, short, statusTone } from '../../lib/format.ts'
import { OpenElement } from '../../lib/element.ts'
import { copyButton } from '../../lib/copy.ts'
import { getEnvironment } from '../../controllers/environment.ts'
import {
	cleanValues,
	consumePayoutPrefill,
	getRecentBeneficiaries,
	getRecentSenders,
	loadPayoutDraft,
	recordBeneficiaryHistory,
	recordSenderHistory,
	removeBeneficiaryHistory,
	removeSenderHistory,
	savePayoutDraft,
	type RecentBeneficiary,
	type RecentSender,
	type Values
} from '../../lib/profiles.ts'

const IS_PROD = getEnvironment().id === 'prod'

// Plain-language hints for field names. Required lists come from the API (/payout-requirements).
const FIELD_HINTS : Record<string, string> = {
	accountType: 'PERSONAL or BUSINESS, set by the transaction type',
	name: 'Full name (or company name for BUSINESS)',
	firstName: 'First name', lastName: 'Last name',
	nativeFirstName: 'First name in Chinese characters', nativeLastName: 'Last name in Chinese characters', nativeName: 'Company name in Chinese characters',
	email: 'name@example.com', phone: 'Phone with country code', phoneCountryCode: 'e.g. +65', mobileNumber: 'Mobile number',
	dateOfBirth: 'YYYY-MM-DD', gender: 'M or F',
	idType: 'PEXX ID type code', idSubType: 'Document type', idValue: 'Document number', idNumber: 'Document number',
	idIssueDate: 'YYYY-MM-DD', idExpireDate: 'YYYY-MM-DD', idIssueCountry: 'ISO alpha-3, e.g. SGP',
	nationality: 'ISO alpha-3, e.g. SGP', country: 'ISO alpha-3, e.g. SGP', registrationCountry: 'ISO alpha-3',
	address: 'Street address', city: 'City', region: 'State or region', zipCode: 'Postal code', postalCode: 'Postal code',
	occupation: 'Occupation code', remark: 'Remark',
	registrationNumber: 'Company registration number', incorporationDate: 'YYYY-MM-DD', structure: 'Legal structure', type: 'Company type',
	accountNumber: 'Account number', bankAccountNumber: 'Bank account / IBAN',
	bankCode: 'Bank code', bankBranchCode: 'Branch / sort code / BSB', bankAccountType: 'Account type code',
	transactionType: 'e.g. IMPS',
	ifsc: 'IFSC code', vpa: 'UPI VPA address',
	napasCode: 'NAPAS bank code', swiftCode: 'SWIFT / BIC',
	bankId: 'PEXX bank ID', bankState: 'Bank state', bankCity: 'Bank city'
}

// Fields that are not on the required list but that a corridor rule needs (see /payout-requirements rules).
const OPTIONAL_FIELDS : Record<string, { sender? : string[], beneficiary? : string[] }> = {
	INR: { beneficiary: ['accountNumber', 'ifsc', 'vpa'] },
	VND: { beneficiary: ['napasCode', 'bankCode'] }
}

type Party = 'sender' | 'beneficiary'

const filled = (value : unknown) => value !== undefined && value !== null && value !== ''

const label = (field : string) => field
	.replace(/([a-z])([A-Z])/g, '$1 $2')
	.replace(/^./, char => char.toUpperCase())

const isDate = (field : string) => field === 'dateOfBirth' || field.endsWith('Date')

// Fixed value lists from the PEXX fiat-payout/create docs, per currency.
const ID_SUB_TYPES : Record<string, string[]> = {
	IDR: ['PASSPORT', 'ID_CARD'],
	INR: ['PASSPORT', 'ID_CARD', 'DRIVER_LICENSE', 'LOCAL_ID', 'EMIRATES_ID']
}
const ID_SUB_TYPE_LABELS : Record<string, string> = {
	PASSPORT: 'Passport', ID_CARD: 'ID card', DRIVER_LICENSE: 'Driver licence', LOCAL_ID: 'Local ID', EMIRATES_ID: 'Emirates ID'
}

@customElement('test-payout-page')
export class TestPayoutPage extends OpenElement {
	@state() private clients : ClientSummary[] = []
	@state() private selectedClientId = ''
	@state() private currency = 'IDR'
	@state() private transactionType = 'C2C'
	@state() private requirements : PayoutRequirement[] = []
	@state() private amount = ''
	@state() private sender : Values = {}
	@state() private beneficiary : Values = {}
	@state() private message = ''
	@state() private isRecipientSelf = false

	@state() private recentSenders : RecentSender[] = []
	@state() private recentBeneficiaries : RecentBeneficiary[] = []

	@state() private bankDirectories : Record<string, BankDirectoryEntry[]> = {}
	@state() private rates : Record<string, string> = {}

	@state() private error = ''
	@state() private result : TestPayout | null = null
	@state() private reconcilingResult = false
	@state() private submitting = false
	@state() private reference = `${IS_PROD ? 'admin' : 'test'}-${crypto.randomUUID()}`

	connectedCallback () {
		super.connectedCallback()
		this.recentSenders = getRecentSenders()
		this.recentBeneficiaries = getRecentBeneficiaries()
		this.initFormState()
		this.loadClients()
		api.payoutRequirements().then(items => { this.requirements = items }).catch(() => {})
		api.bankDirectories().then(dirs => { this.bankDirectories = dirs }).catch(() => {})
		this.loadRates()
	}

	private initFormState () {
		const params = new URLSearchParams(location.search)
		const urlClient = params.get('client') || ''
		const prefill = consumePayoutPrefill()
		const draft = loadPayoutDraft()

		if (prefill) {
			if (prefill.clientId) this.selectedClientId = prefill.clientId
			if (prefill.currency) this.currency = prefill.currency
			if (prefill.transactionType) this.transactionType = prefill.transactionType
			if (prefill.amount) this.amount = prefill.amount
			if (prefill.sender) this.sender = cleanValues(prefill.sender)
			if (prefill.beneficiary) this.beneficiary = cleanValues(prefill.beneficiary)
			if (prefill.message !== undefined) this.message = prefill.message
			if (prefill.isRecipientSelf !== undefined) this.isRecipientSelf = prefill.isRecipientSelf
			this.persistDraft()
			return
		}

		if (urlClient) this.selectedClientId = urlClient
		else if (draft.clientId) this.selectedClientId = draft.clientId

		if (draft.currency) this.currency = draft.currency
		if (draft.transactionType) this.transactionType = draft.transactionType
		if (draft.amount !== undefined) this.amount = draft.amount
		if (draft.message !== undefined) this.message = draft.message
		if (draft.isRecipientSelf !== undefined) this.isRecipientSelf = draft.isRecipientSelf

		if (draft.sender && Object.keys(draft.sender).length > 0) {
			this.sender = draft.sender
		} else if (this.recentSenders[0]) {
			this.sender = { ...this.recentSenders[0].values }
		}

		if (draft.beneficiary && Object.keys(draft.beneficiary).length > 0) {
			this.beneficiary = draft.beneficiary
		} else {
			const recentForCurrency = this.recentBeneficiaries.find(item => item.currency === this.currency)
			if (recentForCurrency) this.beneficiary = { ...recentForCurrency.values }
		}
	}

	private persistDraft () {
		savePayoutDraft({
			clientId: this.selectedClientId,
			currency: this.currency,
			transactionType: this.transactionType,
			amount: this.amount,
			sender: this.sender,
			beneficiary: this.beneficiary,
			message: this.message,
			isRecipientSelf: this.isRecipientSelf
		})
	}

	private async loadRates () {
		try {
			const data = await api.rates(false, this.transactionType)
			const map : Record<string, string> = {}
			for (const item of data.rates) map[item.currency] = item.rate
			this.rates = map
		} catch {
			// Indicative rates are optional
		}
	}

	private get requirement () {
		return this.requirements.find(item => item.currency === this.currency)
	}

	private get corridor () {
		return this.requirement?.transaction_types.find(item => item.transaction_type === this.transactionType)
	}

	private accountType (party : Party) : 'PERSONAL' | 'BUSINESS' {
		const corridor = this.corridor
		if (corridor) {
			const raw = party === 'sender' ? corridor.sender_account_type : corridor.beneficiary_account_type
			return raw === 'BUSINESS' ? 'BUSINESS' : 'PERSONAL'
		}
		return (party === 'sender' ? this.transactionType[0] : this.transactionType[2]) === 'B' ? 'BUSINESS' : 'PERSONAL'
	}

	private required (party : Party) {
		return (this.corridor?.[party] ?? []).filter(field => field !== 'accountType')
	}

	private fields (party : Party) {
		const required = this.required(party)
		const optional = [...(OPTIONAL_FIELDS[this.currency]?.[party] ?? []), ...(this.corridor ? [] : Object.keys(this[party]))]
			.filter(field => field !== 'accountType' && !required.includes(field))
		return { required, optional: [...new Set(optional)] }
	}

	private setValue (party : Party, field : string, value : string) {
		this[party] = { ...this[party], [field]: value }
		this.persistDraft()
	}

	private payload (party : Party) {
		const { required, optional } = this.fields(party)
		const values = this[party]
		const result : Record<string, string> = { accountType: this.accountType(party) }
		for (const field of [...required, ...optional])
			if (filled(values[field]?.trim())) result[field] = values[field].trim()
		return result
	}

	private applyRecentSender (item : RecentSender) {
		this.sender = { ...this.sender, ...item.values }
		this.persistDraft()
	}

	private deleteRecentSender (event : Event, id : string) {
		event.stopPropagation()
		this.recentSenders = removeSenderHistory(id)
	}

	private applyRecentBeneficiary (item : RecentBeneficiary) {
		if (item.currency && item.currency !== this.currency) {
			this.currency = item.currency
		}
		const wantBusiness = item.accountType === 'BUSINESS'
		const senderPrefix = this.transactionType.startsWith('B') ? 'B' : 'C'
		const nextTxType = `${senderPrefix}2${wantBusiness ? 'B' : 'C'}`
		const allowed = this.requirement?.transaction_types.map(t => t.transaction_type) ?? ['C2C', 'C2B', 'B2C', 'B2B']
		if (allowed.includes(nextTxType)) {
			this.transactionType = nextTxType
		}
		this.beneficiary = { ...item.values }
		this.persistDraft()
	}

	private deleteRecentBeneficiary (event : Event, id : string) {
		event.stopPropagation()
		this.recentBeneficiaries = removeBeneficiaryHistory(id)
	}

	private clearParty (party : Party) {
		this[party] = {}
		this.persistDraft()
	}

	private options (party : Party, field : string) : [string, string][] | null {
		if (party === 'sender' && field === 'idSubType') {
			const values = ID_SUB_TYPES[this.currency] ?? Object.keys(ID_SUB_TYPE_LABELS)
			return values.map(value => [value, ID_SUB_TYPE_LABELS[value] ?? value])
		}
		return null
	}

	private datalistFor (party : Party, field : string) : { id : string, items : Array<{ value : string, label : string }> } | null {
		if (party !== 'beneficiary') return null
		const dir = this.bankDirectories[this.currency]
		if (!dir?.length) return null
		if (field === 'bankCode') {
			const items = dir
				.map(entry => ({ value: entry.code ?? entry.bankCode ?? '', label: entry.name }))
				.filter(item => item.value)
			if (items.length) return { id: `bank-code-${this.currency}`, items }
		}
		if (field === 'napasCode') {
			const items = dir
				.map(entry => ({ value: entry.napasCode ?? '', label: entry.name }))
				.filter(item => item.value)
			if (items.length) return { id: `napas-code-${this.currency}`, items }
		}
		return null
	}

	private renderInput (party : Party, field : string, required : boolean) {
		const value = this[party][field] ?? ''
		const hint = FIELD_HINTS[field] ?? ''
		const options = this.options(party, field)
		const datalist = this.datalistFor(party, field)
		const update = (e : Event) => this.setValue(party, field, (e.currentTarget as HTMLInputElement | HTMLSelectElement).value)
		return html`
			<label class=field title=${hint}>
				<span>${label(field)}${required ? html` <i class=req>*</i>` : null}</span>
				${options ? html`
					<select ?required=${required} @change=${update}>
						<option value='' ?selected=${!value}>Select…</option>
						${options.map(([option, text]) => html`<option value=${option} ?selected=${option === value}>${text}</option>`)}
						${value && !options.some(([option]) => option === value) ? html`<option value=${value} selected>${value}</option>` : null}
					</select>
				` : html`
					<input
						type=${isDate(field) ? 'date' : field === 'email' ? 'email' : 'text'}
						list=${datalist?.id ?? ''}
						autocomplete=off
						?required=${required}
						placeholder=${hint}
						.value=${value}
						@input=${update}>
					${datalist ? html`
						<datalist id=${datalist.id}>
							${datalist.items.map(item => html`<option value=${item.value}>${item.label}</option>`)}
						</datalist>
					` : null}
				`}
			</label>
		`
	}

	private renderParty (party : Party) {
		const { required, optional } = this.fields(party)
		const filledCount = required.filter(field => filled(this[party][field]?.trim())).length
		const hasValues = Object.values(this[party]).some(v => filled(v?.trim()))

		const recentSenders = this.recentSenders
		const recentBeneficiaries = [
			...this.recentBeneficiaries.filter(b => b.currency === this.currency),
			...this.recentBeneficiaries.filter(b => b.currency !== this.currency)
		]

		return html`
			<fieldset class=party-card>
				<div class=party-header>
					<div>
						<h3>${party === 'sender' ? 'Sender' : 'Beneficiary'} <span class=badge-subtle>${this.accountType(party)}</span></h3>
					</div>
					<div class=party-meta>
						${this.corridor ? html`<span class=counter>${filledCount}/${required.length} required</span>` : null}
						${hasValues ? html`<button class='link-btn' type=button @click=${() => this.clearParty(party)}>Clear</button>` : null}
					</div>
				</div>

				${party === 'sender' && recentSenders.length > 0 ? html`
					<div class=recent-strip>
						<span class=recent-label>Recent:</span>
						<div class=recent-list>
							${recentSenders.slice(0, 6).map(item => html`
								<div class=history-pill @click=${() => this.applyRecentSender(item)} title='Click to fill sender'>
									<span>${item.label}</span>
									<button type=button class=pill-del aria-label='Remove' @click=${(e : Event) => this.deleteRecentSender(e, item.id)}>×</button>
								</div>
							`)}
						</div>
					</div>
				` : null}

				${party === 'beneficiary' && recentBeneficiaries.length > 0 ? html`
					<div class=recent-strip>
						<span class=recent-label>Recent:</span>
						<div class=recent-list>
							${recentBeneficiaries.slice(0, 8).map(item => html`
								<div class=${`history-pill ${item.currency === this.currency ? 'match' : ''}`} @click=${() => this.applyRecentBeneficiary(item)} title=${`${item.label} (${item.sublabel})`}>
									<strong>${item.label}</strong>
									<small>${item.sublabel}</small>
									<button type=button class=pill-del aria-label='Remove' @click=${(e : Event) => this.deleteRecentBeneficiary(e, item.id)}>×</button>
								</div>
							`)}
						</div>
					</div>
				` : null}

				<div class=fields-grid>${required.map(field => this.renderInput(party, field, true))}</div>
				${optional.length ? html`
					<div class=optional-divider><span>Corridor options</span></div>
					<div class=fields-grid>${optional.map(field => this.renderInput(party, field, false))}</div>
				` : null}
			</fieldset>
		`
	}

	private renderQuoteStrip () {
		const client = this.clients.find(item => item.id === this.selectedClientId) ?? this.clients[0]
		const rateStr = this.rates[this.currency]
		const rateNum = Number(rateStr)
		const amountNum = Number(this.amount)
		if (!rateStr || !Number.isFinite(rateNum) || rateNum <= 0) return null

		const hasAmount = Number.isFinite(amountNum) && amountNum > 0
		const estProviderUsdt = hasAmount ? amountNum / rateNum : 0
		const commPct = Number(client?.commission_percent ?? 0)
		const estCommUsdt = estProviderUsdt * (commPct / 100)
		const estTotalUsdt = estProviderUsdt + estCommUsdt
		const availNum = Number(client?.available_balance ?? NaN)
		const insufficient = hasAmount && Number.isFinite(availNum) && estTotalUsdt > availNum

		return html`
			<div class=${`quote-strip ${insufficient ? 'warn' : ''}`}>
				<span>Rate: <strong>1 USDT = ${rateStr} ${this.currency}</strong></span>
				${hasAmount ? html`
					<span class=sep>·</span>
					<span>Provider debit: <strong>~${estProviderUsdt.toFixed(2)} USDT</strong></span>
					<span class=sep>·</span>
					<span>Fee (${commPct}%): <strong>~${estCommUsdt.toFixed(2)} USDT</strong></span>
					<span class=sep>·</span>
					<span>Total debit: <strong class=${insufficient ? 'text-danger' : ''}>~${estTotalUsdt.toFixed(2)} USDT</strong></span>
					${insufficient ? html`<span class='status danger'>Exceeds available balance (${money(client?.available_balance)})</span>` : null}
				` : null}
			</div>
		`
	}

	private async loadClients () {
		try {
			const { clients } = await api.clients()
			this.clients = clients
			if (!this.selectedClientId && !IS_PROD && clients.length > 0) {
				this.selectedClientId = clients[0].id
			}
		} catch {
			// Ignore
		}
	}

	private onCurrencyChange (event : Event) {
		const next = (event.currentTarget as HTMLSelectElement).value
		this.currency = next
		const types = this.requirement?.transaction_types.map(item => item.transaction_type) ?? []
		if (types.length && !types.includes(this.transactionType)) this.transactionType = types[0]

		const recentForCurrency = this.recentBeneficiaries.find(item => item.currency === next)
		if (recentForCurrency) {
			this.beneficiary = { ...recentForCurrency.values }
		}
		this.persistDraft()
	}

	private async refreshResultStatus () {
		if (!this.result?.order_id) return
		this.reconcilingResult = true
		try {
			const updated = await api.reconcileOrder(this.result.order_id)
			this.result = {
				...this.result,
				status: updated.status,
				provider_id: updated.provider_payout_id ?? this.result.provider_id,
				rate: updated.provider_rate ?? this.result.rate,
				provider_debit: updated.provider_debit ?? this.result.provider_debit,
				provider_fee: updated.provider_fee ?? this.result.provider_fee,
				commission_amount: updated.commission_amount ?? this.result.commission_amount,
				total_debit: updated.total_debit ?? this.result.total_debit,
				error_code: updated.error_code,
				error_message: updated.error_message
			}
			await this.loadClients()
		} catch (error) {
			this.error = (error as Error).message
		} finally {
			this.reconcilingResult = false
		}
	}

	private async create (event : SubmitEvent) {
		event.preventDefault()
		const form = new FormData(event.currentTarget as HTMLFormElement)
		if (IS_PROD) {
			const client = this.clients.find(item => item.id === String(form.get('client_id') || ''))
			if (!client) {
				this.error = 'Select a client.'
				return
			}
			if (!confirm(`Create a REAL payout of ${form.get('payout_amount')} ${form.get('payout_currency')} for ${client.name}?`)) return
		}
		this.error = ''
		this.result = null
		this.submitting = true
		const sender = this.payload('sender')
		const beneficiary = this.payload('beneficiary')

		// Automatically record both sender and beneficiary into local history
		recordSenderHistory(this.accountType('sender'), sender)
		recordBeneficiaryHistory(this.currency, this.accountType('beneficiary'), beneficiary)
		this.recentSenders = getRecentSenders()
		this.recentBeneficiaries = getRecentBeneficiaries()
		this.persistDraft()

		try {
			this.result = await (IS_PROD ? api.createPayout : api.testPayout).call(api, {
				client_id: String(form.get('client_id') || this.selectedClientId || ''),
				reference_id: String(form.get('merchant_reference_id')),
				merchantReferenceId: String(form.get('merchant_reference_id')),
				payout_amount: String(form.get('payout_amount')),
				payoutAmount: Number(form.get('payout_amount')),
				payout_currency: String(form.get('payout_currency')),
				payoutCurrency: String(form.get('payout_currency')),
				deductionCurrency: 'USDT',
				transaction_type: String(form.get('transaction_type')),
				transactionType: String(form.get('transaction_type')),
				sender,
				beneficiary,
				beneficiaryMethod: { ...beneficiary, currency: String(form.get('payout_currency')) },
				is_recipient_self: this.isRecipientSelf,
				isRecipientSelf: this.isRecipientSelf,
				message: this.message || null
			})
			this.reference = `${IS_PROD ? 'admin' : 'test'}-${crypto.randomUUID()}`
			await this.loadClients()
		} catch (error) {
			this.error = (error as Error).message
		} finally {
			this.submitting = false
		}
	}

	protected render () {
		return html`
			<div class=heading>
				<div>
					<p class=eyebrow>${IS_PROD ? 'Production' : 'Sandbox'}</p>
					<h1>${IS_PROD ? 'Create payout' : 'Test payout'}</h1>
				</div>
			</div>
			${this.error ? html`<section class=notice role=alert>${this.error}</section>` : null}
			${this.result ? html`
				<section class=${['CANCELLED', 'REVERSED', 'SUBMISSION_UNKNOWN'].includes(this.result.status) ? 'notice warning' : 'notice success'} role=status>
					<div class=result-head>
						<div class=result-title>
							<span class=${`status ${statusTone(this.result.status)}`}>${this.result.status}</span>
							<strong>${this.result.status === 'CANCELLED' ? 'Payout rejected' : this.result.status === 'SUBMISSION_UNKNOWN' ? 'Reconciling payout' : 'Payout created'}</strong>
							${this.result.order_id ? html`<code>${this.result.order_id}</code> ${copyButton(this.result.order_id)}` : null}
						</div>
						<div class=result-actions>
							${this.result.order_id ? html`
								<button class='button outlined sm' type=button ?disabled=${this.reconcilingResult} @click=${this.refreshResultStatus}>
									${this.reconcilingResult ? 'Checking…' : 'Refresh status'}
								</button>
							` : null}
							${this.result.client_id && this.result.order_id ? html`
								<a class='button solid sm' href=${`/clients/${this.result.client_id}?order=${this.result.order_id}`}>View order →</a>
							` : null}
						</div>
					</div>
					${this.result.error_message ? html`<code>${this.result.error_code ? `${this.result.error_code}: ` : ''}${this.result.error_message}</code>` : null}
					<div class=result-meta>
						<span>Provider ID: <code>${short(this.result.provider_id || '—')}</code></span>
						<span>Rate: <strong>${this.result.rate}</strong></span>
						<span>Provider debit: <strong>${money(this.result.provider_debit)}</strong></span>
						<span>Commission: <strong>${money(this.result.commission_amount ?? '0')}</strong></span>
						<span>Total debit: <strong>${money(this.result.total_debit ?? this.result.provider_debit)}</strong></span>
					</div>
				</section>
			` : null}

			<form class=payout-layout @submit=${this.create}>
				<section class=panel>
					<div class=corridor-grid>
						<label class=span-2>Client account
							<select name=client_id required .value=${this.selectedClientId} @change=${(e : Event) => {
								this.selectedClientId = (e.currentTarget as HTMLSelectElement).value
								this.persistDraft()
							}}>
								${IS_PROD ? html`<option value='' ?selected=${!this.selectedClientId}>Select client…</option>` : null}
								${this.clients.map(client => html`<option value=${client.id} ?selected=${client.id === this.selectedClientId}>${client.name} — ${money(client.available_balance)} (${client.commission_percent}% fee)</option>`)}
							</select>
						</label>
						<label>Currency
							<select name=payout_currency .value=${this.currency} @change=${this.onCurrencyChange}>
								<option>IDR</option><option>PHP</option><option>INR</option><option>VND</option><option>CNY</option><option>GBP</option><option>EUR</option><option>USD</option><option>PKR</option><option>AED</option><option>AUD</option><option>THB</option><option>JPY</option><option>MYR</option><option>CAD</option><option>KRW</option><option>HKD</option>
							</select>
						</label>
						<label>Type
							<select name=transaction_type .value=${this.transactionType} @change=${(e : Event) => {
								this.transactionType = (e.currentTarget as HTMLSelectElement).value
								this.persistDraft()
								this.loadRates()
							}}>
								${(this.requirement?.transaction_types.map(item => item.transaction_type) ?? ['C2C', 'C2B', 'B2C', 'B2B']).map(type => html`<option ?selected=${type === this.transactionType}>${type}</option>`)}
							</select>
						</label>
						<label>Amount (${this.currency})
							<input name=payout_amount required inputmode=decimal placeholder='0.00' .value=${this.amount} @input=${(e : Event) => {
								this.amount = (e.currentTarget as HTMLInputElement).value
								this.persistDraft()
							}}>
						</label>
						<label>Reference ID
							<div class=input-group>
								<input name=merchant_reference_id required autocomplete=off .value=${this.reference} @input=${(e : Event) => { this.reference = (e.currentTarget as HTMLInputElement).value }}>
								<button class='button outlined sm' type=button title='Generate new reference' @click=${() => { this.reference = `${IS_PROD ? 'admin' : 'test'}-${crypto.randomUUID()}` }}>↻</button>
							</div>
						</label>
					</div>
					${this.renderQuoteStrip()}
				</section>

				<div class=parties-grid>
					${this.renderParty('sender')}
					${this.renderParty('beneficiary')}
				</div>

				<section class='panel payout-footer'>
					<div class=footer-inputs>
						<label class=msg-field>Remark / Message (optional)
							<input name=message autocomplete=off placeholder='Optional note for the payout' .value=${this.message} @input=${(e : Event) => {
								this.message = (e.currentTarget as HTMLInputElement).value
								this.persistDraft()
							}}>
						</label>
						<label class=checkbox-inline>
							<input name=is_recipient_self type=checkbox .checked=${this.isRecipientSelf} @change=${(e : Event) => {
								this.isRecipientSelf = (e.currentTarget as HTMLInputElement).checked
								this.persistDraft()
							}}>
							<span>Sender and recipient are the same person</span>
						</label>
					</div>
					${this.requirement?.rules.length ? html`<p class=rules-inline>${this.requirement.rules.join(' · ')}</p>` : null}
					<div class=submit-row>
						<button class='button solid lg' type=submit ?disabled=${this.submitting}>
							${this.submitting ? 'Submitting payout…' : IS_PROD ? 'Submit payout' : 'Send test payout'}
						</button>
					</div>
				</section>
			</form>
		`
	}
}
