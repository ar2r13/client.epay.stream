import { html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { api, type ClientSummary, type PayoutRequirement, type TestPayout } from '../../controllers/api.ts'
import { money, short } from '../../lib/format.ts'
import { OpenElement } from '../../lib/element.ts'
import { copyButton } from '../../lib/copy.ts'
import { getEnvironment } from '../../controllers/environment.ts'

const IS_PROD = getEnvironment().id === 'prod'

interface Preset {
	amount : string
	sender : Record<string, unknown>
	beneficiary : Record<string, unknown>
}

// Plain-language hints for field names. Required lists come from the API (/payout-requirements).
const FIELD_HINTS : Record<string, string> = {
	accountType: 'PERSONAL or BUSINESS, set by the transaction type',
	name: 'Full name (or company name for BUSINESS)',
	firstName: 'First name', lastName: 'Last name',
	nativeFirstName: 'First name in Chinese characters', nativeLastName: 'Last name in Chinese characters', nativeName: 'Company name in Chinese characters',
	email: 'Email', phone: 'Phone number with country code', phoneCountryCode: 'Country dialling code, e.g. +65', mobileNumber: 'Mobile number',
	dateOfBirth: 'Date of birth, YYYY-MM-DD', gender: 'Gender',
	idType: 'ID document type code from the PEXX list', idSubType: 'ID document sub-type, e.g. PASSPORT', idValue: 'ID document number', idNumber: 'ID document number',
	idIssueDate: 'ID issue date, YYYY-MM-DD', idExpireDate: 'ID expiry date, YYYY-MM-DD', idIssueCountry: 'Country that issued the ID',
	nationality: 'Nationality, ISO 3166 alpha-3 (e.g. SGP)', country: 'Country of residence, ISO alpha-3', registrationCountry: 'Country of registration, ISO alpha-3',
	address: 'Street address', city: 'City', region: 'State or region', zipCode: 'Postal code', postalCode: 'Postal code',
	occupation: 'Occupation', remark: 'Free-text remark',
	registrationNumber: 'Company registration number', incorporationDate: 'Incorporation date, YYYY-MM-DD', structure: 'Company legal structure', type: 'Company type',
	accountNumber: 'Recipient account number', bankAccountNumber: 'Recipient bank account number (IBAN where the country uses IBAN)',
	bankCode: 'Recipient bank code', bankBranchCode: 'Bank branch code (sort code, BSB, …)', bankAccountType: 'Bank account type, e.g. CHECKING',
	transactionType: 'Transfer rail, e.g. IMPS',
	ifsc: 'IFSC code (with accountNumber)', vpa: 'UPI address (instead of accountNumber + IFSC)',
	napasCode: 'NAPAS bank code (or bankCode)', swiftCode: 'SWIFT / BIC code'
}

// Fields that are not on the required list but that a corridor rule needs (see /payout-requirements rules).
const OPTIONAL_FIELDS : Record<string, { sender? : string[], beneficiary? : string[] }> = {
	INR: { beneficiary: ['accountNumber', 'ifsc', 'vpa'] },
	VND: { beneficiary: ['napasCode', 'bankCode'] },
	EUR: { beneficiary: ['swiftCode'] }
}

type Party = 'sender' | 'beneficiary'
type Values = Record<string, string>

const filled = (value : unknown) => value !== undefined && value !== null && value !== ''

const label = (field : string) => field
	.replace(/([a-z])([A-Z])/g, '$1 $2')
	.replace(/^./, char => char.toUpperCase())

const isDate = (field : string) => field === 'dateOfBirth' || field.endsWith('Date')

const toValues = (value : Record<string, unknown>) : Values =>
	Object.fromEntries(Object.entries(value).map(([key, item]) => [key, String(item)]))

const PRESETS : Record<string, Preset> = {
	IDR: {
		amount: '50000',
		sender: {
			accountType: 'PERSONAL',
			name: 'Jane Doe',
			email: 'jane@example.com',
			phone: '+6581234567',
			phoneCountryCode: '+65',
			idSubType: 'PASSPORT',
			idValue: 'A12345678',
			nationality: 'SGP'
		},
		beneficiary: {
			accountType: 'PERSONAL',
			accountNumber: '1234567890',
			bankCode: '014',
			name: 'Budi Santoso'
		}
	},
	PHP: {
		amount: '100',
		sender: {
			accountType: 'PERSONAL',
			name: 'Test Sender',
			email: 'test@example.com',
			phone: '+66812345678',
			phoneCountryCode: '+66'
		},
		beneficiary: {
			accountType: 'PERSONAL',
			accountNumber: '0000000000',
			bankCode: 'bdouni',
			name: 'Test Recipient'
		}
	},
	INR: {
		amount: '500',
		sender: {
			accountType: 'PERSONAL',
			name: 'Jane Doe',
			email: 'jane@example.com',
			phone: '+6581234567',
			phoneCountryCode: '+65',
			dateOfBirth: '1990-01-01',
			idSubType: 'PASSPORT',
			idValue: 'A12345678',
			nationality: 'SGP',
			address: '1 Main St',
			city: 'Singapore',
			country: 'SGP'
		},
		beneficiary: {
			accountType: 'PERSONAL',
			name: 'Rahul Sharma',
			transactionType: 'IMPS',
			accountNumber: '123456789012',
			ifsc: 'HDFC0000123'
		}
	},
	VND: {
		amount: '100000',
		sender: {
			accountType: 'PERSONAL',
			name: 'Jane Doe',
			email: 'jane@example.com',
			phone: '+6581234567',
			phoneCountryCode: '+65'
		},
		beneficiary: {
			accountType: 'PERSONAL',
			name: 'Nguyen Van A',
			firstName: 'Van A',
			lastName: 'Nguyen',
			accountNumber: '1234567890',
			napasCode: '970436'
		}
	},
	CNY: {
		amount: '200',
		sender: {
			accountType: 'PERSONAL',
			name: 'Jane Doe',
			firstName: 'Jane',
			lastName: 'Doe',
			email: 'jane@example.com',
			phone: '+6581234567',
			phoneCountryCode: '+65',
			dateOfBirth: '1990-01-01',
			gender: 'F',
			idType: '1',
			idValue: 'A12345678',
			idIssueCountry: 'SGP',
			nationality: 'SGP',
			country: 'SGP'
		},
		beneficiary: {
			accountType: 'PERSONAL',
			bankAccountNumber: '6222021234567890123',
			idNumber: '110101199001011234',
			idType: '2',
			nativeFirstName: '三',
			nativeLastName: '张'
		}
	},
	GBP: {
		amount: '50',
		sender: {
			accountType: 'PERSONAL',
			name: 'Jane Doe',
			firstName: 'Jane',
			lastName: 'Doe',
			email: 'jane@example.com',
			phone: '+6581234567',
			phoneCountryCode: '+65',
			dateOfBirth: '1990-01-01',
			idType: '1',
			idValue: 'A12345678',
			nationality: 'SGP',
			address: '1 Main St',
			postalCode: '018989',
			city: 'Singapore',
			country: 'SGP'
		},
		beneficiary: {
			accountType: 'PERSONAL',
			firstName: 'John',
			lastName: 'Smith',
			dateOfBirth: '1985-05-15',
			bankBranchCode: '200000',
			bankAccountNumber: '55779911'
		}
	},
	EUR: {
		amount: '50',
		sender: {
			accountType: 'PERSONAL',
			name: 'Jane Doe',
			firstName: 'Jane',
			lastName: 'Doe',
			email: 'jane@example.com',
			phone: '+6581234567',
			phoneCountryCode: '+65',
			dateOfBirth: '1990-01-01',
			idType: '1',
			idValue: 'A12345678',
			nationality: 'SGP',
			city: 'Singapore',
			address: '1 Main St',
			zipCode: '018989',
			country: 'SGP',
			occupation: '6'
		},
		beneficiary: {
			accountType: 'PERSONAL',
			firstName: 'Hans',
			lastName: 'Mueller',
			dateOfBirth: '1985-05-15',
			bankAccountType: '5',
			bankAccountNumber: 'DE89370400440532013000',
			swiftCode: 'COBADEFFXXX',
			address: 'Hauptstrasse 1 Berlin',
			idType: '1',
			idNumber: 'P1234567'
		}
	},
	USD: {
		amount: '50',
		sender: {
			accountType: 'PERSONAL',
			name: 'Jane Doe',
			firstName: 'Jane',
			lastName: 'Doe',
			email: 'jane@example.com',
			phone: '+6581234567',
			phoneCountryCode: '+65',
			dateOfBirth: '1990-01-01',
			idType: '1',
			idValue: 'A12345678',
			nationality: 'SGP',
			address: '1 Main St',
			city: 'Singapore',
			postalCode: '018989',
			region: 'SG',
			country: 'SGP'
		},
		beneficiary: {
			accountType: 'PERSONAL',
			firstName: 'John',
			lastName: 'Doe',
			dateOfBirth: '1985-05-15',
			bankCode: '021000021',
			phoneCountryCode: '+1',
			mobileNumber: '2125550100',
			zipCode: '10001',
			idType: '1',
			idNumber: '123456789',
			nationality: 'USA',
			region: 'Northeast',
			city: 'New York',
			address: '1 Main Street',
			bankAccountType: '5',
			bankAccountNumber: '123456789'
		}
	},
	PKR: {
		amount: '5000',
		sender: {
			accountType: 'PERSONAL',
			name: 'Jane Doe',
			email: 'jane@example.com',
			phone: '+6581234567',
			phoneCountryCode: '+65'
		},
		beneficiary: {
			accountType: 'PERSONAL',
			accountNumber: 'PK36SCBL0000001123456702',
			bankCode: 'SCBL',
			name: 'Ali Khan'
		}
	},
	AED: {
		amount: '100',
		sender: {
			accountType: 'PERSONAL',
			name: 'Jane Doe',
			firstName: 'Jane',
			lastName: 'Doe',
			email: 'jane@example.com',
			phone: '+6581234567',
			phoneCountryCode: '+65',
			dateOfBirth: '1990-01-01',
			idType: '1',
			idValue: 'A12345678',
			nationality: 'SGP',
			idIssueDate: '2020-01-01',
			idExpireDate: '2030-01-01',
			zipCode: '00000'
		},
		beneficiary: {
			accountType: 'PERSONAL',
			firstName: 'John',
			lastName: 'Smith',
			bankAccountNumber: '1234567890'
		}
	},
	AUD: {
		amount: '50',
		sender: {
			accountType: 'PERSONAL',
			name: 'Jane Doe',
			firstName: 'Jane',
			lastName: 'Doe',
			email: 'jane@example.com',
			phone: '+6581234567',
			phoneCountryCode: '+65',
			dateOfBirth: '1990-01-01',
			idType: '1',
			idValue: 'A12345678',
			nationality: 'SGP',
			city: 'Sydney',
			country: 'AUS',
			remark: 'Test payout'
		},
		beneficiary: {
			accountType: 'PERSONAL',
			firstName: 'John',
			lastName: 'Smith',
			bankAccountNumber: '1234567890'
		}
	},
	THB: {
		amount: '1000',
		sender: {
			accountType: 'PERSONAL',
			name: 'Jane Doe',
			firstName: 'Jane',
			lastName: 'Doe',
			email: 'jane@example.com',
			phone: '+6581234567',
			phoneCountryCode: '+65',
			dateOfBirth: '1990-01-01',
			idType: '1',
			idValue: 'A12345678',
			nationality: 'SGP',
			address: '1 Main St'
		},
		beneficiary: {
			accountType: 'PERSONAL',
			firstName: 'John',
			lastName: 'Smith',
			bankAccountNumber: '1234567890'
		}
	},
	JPY: {
		amount: '5000',
		sender: {
			accountType: 'PERSONAL',
			name: 'Jane Doe',
			firstName: 'Jane',
			lastName: 'Doe',
			email: 'jane@example.com',
			phone: '+6581234567',
			phoneCountryCode: '+65',
			dateOfBirth: '1990-01-01',
			idType: '1',
			idValue: 'A12345678',
			nationality: 'SGP',
			address: '1 Main St',
			city: 'Tokyo',
			country: 'JPN'
		},
		beneficiary: {
			accountType: 'PERSONAL',
			firstName: 'John',
			lastName: 'Smith',
			bankAccountNumber: '1234567890'
		}
	},
	MYR: {
		amount: '100',
		sender: {
			accountType: 'PERSONAL',
			name: 'Jane Doe',
			firstName: 'Jane',
			lastName: 'Doe',
			email: 'jane@example.com',
			phone: '+6581234567',
			phoneCountryCode: '+65',
			dateOfBirth: '1990-01-01',
			idType: '1',
			idValue: 'A12345678',
			nationality: 'SGP',
			address: '1 Main St',
			country: 'MYS'
		},
		beneficiary: {
			accountType: 'PERSONAL',
			firstName: 'John',
			lastName: 'Smith',
			bankAccountNumber: '1234567890'
		}
	},
	CAD: {
		amount: '50',
		sender: {
			accountType: 'PERSONAL',
			name: 'Jane Doe',
			firstName: 'Jane',
			lastName: 'Doe',
			email: 'jane@example.com',
			phone: '+6581234567',
			phoneCountryCode: '+65',
			dateOfBirth: '1990-01-01',
			idType: '1',
			idValue: 'A12345678',
			nationality: 'SGP',
			city: 'Toronto',
			address: '1 Main St',
			postalCode: 'M5V2T6',
			country: 'CAN'
		},
		beneficiary: {
			accountType: 'PERSONAL',
			firstName: 'John',
			lastName: 'Smith',
			bankAccountNumber: '1234567890'
		}
	},
	KRW: {
		amount: '50000',
		sender: {
			accountType: 'PERSONAL',
			name: 'Jane Doe',
			firstName: 'Jane',
			lastName: 'Doe',
			email: 'jane@example.com',
			phone: '+6581234567',
			phoneCountryCode: '+65',
			dateOfBirth: '1990-01-01',
			idType: '1',
			idValue: 'A12345678',
			nationality: 'SGP',
			country: 'KOR'
		},
		beneficiary: {
			accountType: 'PERSONAL',
			firstName: 'John',
			lastName: 'Smith',
			bankAccountNumber: '1234567890'
		}
	},
	HKD: {
		amount: '300',
		sender: {
			accountType: 'PERSONAL',
			name: 'Jane Doe',
			firstName: 'Jane',
			lastName: 'Doe',
			email: 'jane@example.com',
			phone: '+6581234567',
			phoneCountryCode: '+65',
			dateOfBirth: '1990-01-01',
			idType: '1',
			idValue: 'A12345678',
			nationality: 'SGP',
			country: 'HKG',
			city: 'Hong Kong',
			address: '1 Main St',
			zipCode: '000000'
		},
		beneficiary: {
			accountType: 'PERSONAL',
			firstName: 'John',
			lastName: 'Smith',
			bankAccountNumber: '1234567890'
		}
	}
}

@customElement('test-payout-page')
export class TestPayoutPage extends OpenElement {
	@state() private clients : ClientSummary[] = []
	@state() private selectedClientId = ''
	@state() private currency = 'IDR'
	@state() private transactionType = 'C2C'
	@state() private requirements : PayoutRequirement[] = []
	@state() private amount = IS_PROD ? '' : PRESETS.IDR.amount
	@state() private sender : Values = IS_PROD ? {} : toValues(PRESETS.IDR.sender)
	@state() private beneficiary : Values = IS_PROD ? {} : toValues(PRESETS.IDR.beneficiary)
	@state() private error = ''
	@state() private result : TestPayout | null = null
	@state() private submitting = false
	@state() private reference = `${IS_PROD ? 'admin' : 'test'}-${crypto.randomUUID()}`

	connectedCallback () {
		super.connectedCallback()
		this.loadClients()
		api.payoutRequirements().then(items => { this.requirements = items }).catch(() => {})
	}

	private get requirement () {
		return this.requirements.find(item => item.currency === this.currency)
	}

	private get corridor () {
		return this.requirement?.transaction_types.find(item => item.transaction_type === this.transactionType)
	}

	private accountType (party : Party) {
		const corridor = this.corridor
		if (corridor) return party === 'sender' ? corridor.sender_account_type : corridor.beneficiary_account_type
		return (party === 'sender' ? this.transactionType[0] : this.transactionType[2]) === 'B' ? 'BUSINESS' : 'PERSONAL'
	}

	private required (party : Party) {
		return (this.corridor?.[party] ?? []).filter(field => field !== 'accountType')
	}

	/** Required fields, then corridor-specific optional ones. Before requirements load: whatever the preset has. */
	private fields (party : Party) {
		const required = this.required(party)
		const optional = [...(OPTIONAL_FIELDS[this.currency]?.[party] ?? []), ...(this.corridor ? [] : Object.keys(this[party]))]
			.filter(field => field !== 'accountType' && !required.includes(field))
		return { required, optional: [...new Set(optional)] }
	}

	private setValue (party : Party, field : string, value : string) {
		this[party] = { ...this[party], [field]: value }
	}

	/** Only the fields shown for the current corridor, non-empty, plus accountType from the transaction type. */
	private payload (party : Party) {
		const { required, optional } = this.fields(party)
		const values = this[party]
		const result : Record<string, string> = { accountType: this.accountType(party) }
		for (const field of [...required, ...optional])
			if (filled(values[field]?.trim())) result[field] = values[field].trim()
		return result
	}

	private renderInput (party : Party, field : string, required : boolean) {
		const value = this[party][field] ?? ''
		const hint = FIELD_HINTS[field] ?? ''
		return html`
			<label class=${required && !filled(value.trim()) ? 'field missing' : 'field'} title=${hint}>
				<span>${label(field)}${required ? html` <b class=required-mark>*</b>` : null}</span>
				<input
					type=${isDate(field) ? 'date' : field === 'email' ? 'email' : 'text'}
					autocomplete=off
					?required=${required}
					placeholder=${hint}
					.value=${value}
					@input=${(e : Event) => this.setValue(party, field, (e.currentTarget as HTMLInputElement).value)}>
			</label>
		`
	}

	private renderParty (party : Party) {
		const { required, optional } = this.fields(party)
		const missing = required.filter(field => !filled(this[party][field]?.trim())).length
		return html`
			<fieldset class=party>
				<legend>${party === 'sender' ? 'Sender' : 'Beneficiary'} · ${this.accountType(party)}</legend>
				${this.corridor ? html`<span class=${missing ? 'status danger' : 'status success'}>${missing ? `${missing} missing` : 'complete'}</span>` : null}
				<div class=fields>${required.map(field => this.renderInput(party, field, true))}</div>
				${optional.length ? html`
					${required.length ? html`<p class='eyebrow optional'>Optional</p>` : null}
					<div class=fields>${optional.map(field => this.renderInput(party, field, false))}</div>
				` : null}
			</fieldset>
		`
	}

	private async loadClients () {
		try {
			const { clients } = await api.clients()
			this.clients = clients
			if (!IS_PROD && !this.selectedClientId && clients.length > 0) {
				this.selectedClientId = clients[0].id
			}
		} catch {
			// Ignore if clients cannot be loaded yet
		}
	}

	private onCurrencyChange (event : Event) {
		const next = (event.currentTarget as HTMLSelectElement).value
		this.currency = next
		const types = this.requirement?.transaction_types.map(item => item.transaction_type) ?? []
		if (types.length && !types.includes(this.transactionType)) this.transactionType = types[0]
		const preset = PRESETS[next]
		if (preset && !IS_PROD) {
			this.amount = preset.amount
			this.sender = toValues(preset.sender)
			this.beneficiary = toValues(preset.beneficiary)
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
			if (!confirm(`Create a REAL payout of ${form.get('payout_amount')} ${form.get('payout_currency')} for ${client.name}? It will be reserved from the client's balance and sent to PEXX.`)) return
		}
		this.error = ''
		this.result = null
		this.submitting = true
		const sender = this.payload('sender')
		const beneficiary = this.payload('beneficiary')

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
				is_recipient_self: form.get('is_recipient_self') === 'on',
				isRecipientSelf: form.get('is_recipient_self') === 'on',
				message: String(form.get('message')) || null
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
				<div><p class=eyebrow>${IS_PROD ? 'Production' : 'PEXX sandbox'}</p><h1>${IS_PROD ? 'Create payout' : 'Test payout'}</h1></div>
			</div>
			${this.error ? html`<section class=notice role=alert>${this.error}</section>` : null}
			${this.result ? html`
				<section class=${['CANCELLED', 'SUBMISSION_UNKNOWN'].includes(this.result.status) ? 'notice warning' : 'notice success'} role=status>
					<strong>${this.result.status === 'CANCELLED' ? 'Payout was rejected.' : this.result.status === 'SUBMISSION_UNKNOWN' ? 'Payout outcome is unknown, reconciling.' : 'Payout order created.'}</strong>
					${this.result.error_message ? html`<div>Reason <code>${this.result.error_code ? `${this.result.error_code} · ` : ''}${this.result.error_message}</code></div>` : null}
					${this.result.client_id ? html`<div>Client <a href=${`/clients/${this.result.client_id}`}>${this.result.client_name ?? this.result.client_id}</a></div>` : null}
					${this.result.order_id ? html`<div>Order ID <code>${this.result.order_id}</code> ${copyButton(this.result.order_id)} · Reference <code>${this.result.reference_id ?? this.result.merchant_reference_id}</code></div>` : html`<div>Reference <code>${this.result.merchant_reference_id}</code></div>`}
					<div>Provider ID <code title=${this.result.provider_id}>${short(this.result.provider_id || '—')}</code> ${copyButton(this.result.provider_id)}</div>
					<div>Status <span class=status>${this.result.status}</span></div>
					<div>Provider debit ${money(this.result.provider_debit)} · Fee ${money(this.result.provider_fee)} · Commission ${money(this.result.commission_amount ?? '0')} · Total debit ${money(this.result.total_debit ?? this.result.provider_debit)} · Rate ${this.result.rate}</div>
				</section>
			` : null}
			<form class='panel payout-form' @submit=${this.create}>
				<label>Client
					<select name=client_id required .value=${this.selectedClientId} @change=${(e : Event) => { this.selectedClientId = (e.currentTarget as HTMLSelectElement).value }}>
						${IS_PROD ? html`<option value='' ?selected=${!this.selectedClientId}>Select client…</option>` : null}
							${this.clients.map(client => html`<option value=${client.id} ?selected=${client.id === this.selectedClientId}>${client.name} (Available: ${money(client.available_balance)}, Commission: ${client.commission_percent}%)</option>`)}
					</select>
				</label>
				<div class=split>
					<label>Merchant reference<input name=merchant_reference_id required autocomplete=off .value=${this.reference}></label>
					<label>Amount<input name=payout_amount required inputmode=decimal .value=${this.amount} @input=${(e : Event) => { this.amount = (e.currentTarget as HTMLInputElement).value }}></label>
				</div>
				<div class=split>
					<label>Currency<select name=payout_currency .value=${this.currency} @change=${this.onCurrencyChange}><option>IDR</option><option>PHP</option><option>INR</option><option>VND</option><option>CNY</option><option>GBP</option><option>EUR</option><option>USD</option><option>PKR</option><option>AED</option><option>AUD</option><option>THB</option><option>JPY</option><option>MYR</option><option>CAD</option><option>KRW</option><option>HKD</option></select></label>
					<label>Transaction type<select name=transaction_type .value=${this.transactionType} @change=${(e : Event) => { this.transactionType = (e.currentTarget as HTMLSelectElement).value }}>${(this.requirement?.transaction_types.map(item => item.transaction_type) ?? ['C2C', 'C2B', 'B2C', 'B2B']).map(type => html`<option ?selected=${type === this.transactionType}>${type}</option>`)}</select></label>
				</div>
				<div class=split>${this.renderParty('sender')}${this.renderParty('beneficiary')}</div>
				${this.requirement?.rules.length ? html`<ul class=rules>${this.requirement.rules.map(rule => html`<li>${rule}</li>`)}</ul>` : null}
				<label>Message<input name=message autocomplete=off value=${IS_PROD ? '' : 'Sandbox test payout'}></label>
				<label><span><input name=is_recipient_self type=checkbox> Sender and recipient are the same person</span></label>
				<button class='button solid' type=submit ?disabled=${this.submitting}>${this.submitting ? 'Submitting…' : IS_PROD ? 'Create payout' : 'Create test payout'}</button>
			</form>
		`
	}
}
