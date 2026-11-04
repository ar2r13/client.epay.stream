import { html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { api, type ClientSummary, type TestPayout } from '../../controllers/api.ts'
import { money, short } from '../../lib/format.ts'
import { OpenElement } from '../../lib/element.ts'

interface Preset {
	amount : string
	sender : Record<string, unknown>
	beneficiary : Record<string, unknown>
}

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
	}
}

@customElement('test-payout-page')
export class TestPayoutPage extends OpenElement {
	@state() private clients : ClientSummary[] = []
	@state() private selectedClientId = ''
	@state() private currency = 'IDR'
	@state() private amount = PRESETS.IDR.amount
	@state() private senderJson = JSON.stringify(PRESETS.IDR.sender, null, 2)
	@state() private beneficiaryJson = JSON.stringify(PRESETS.IDR.beneficiary, null, 2)
	@state() private error = ''
	@state() private result : TestPayout | null = null
	@state() private submitting = false
	@state() private reference = `test-${crypto.randomUUID()}`

	connectedCallback () {
		super.connectedCallback()
		this.loadClients()
	}

	private async loadClients () {
		try {
			const { clients } = await api.clients()
			this.clients = clients
			if (!this.selectedClientId && clients.length > 0) {
				this.selectedClientId = clients[0].id
			}
		} catch {
			// Ignore if clients cannot be loaded yet
		}
	}

	private onCurrencyChange (event : Event) {
		const next = (event.currentTarget as HTMLSelectElement).value
		this.currency = next
		const preset = PRESETS[next]
		if (preset) {
			this.amount = preset.amount
			this.senderJson = JSON.stringify(preset.sender, null, 2)
			this.beneficiaryJson = JSON.stringify(preset.beneficiary, null, 2)
		}
	}

	private async create (event : SubmitEvent) {
		event.preventDefault()
		this.error = ''
		this.result = null
		this.submitting = true
		const form = new FormData(event.currentTarget as HTMLFormElement)

		try {
			this.result = await api.testPayout({
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
				sender: JSON.parse(String(form.get('sender'))),
				beneficiary: JSON.parse(String(form.get('beneficiary'))),
				beneficiaryMethod: {
					...JSON.parse(String(form.get('beneficiary'))),
					currency: String(form.get('payout_currency'))
				},
				is_recipient_self: form.get('is_recipient_self') === 'on',
				isRecipientSelf: form.get('is_recipient_self') === 'on',
				message: String(form.get('message')) || null
			})
			this.reference = `test-${crypto.randomUUID()}`
			await this.loadClients()
		} catch (error) {
			this.error = error instanceof SyntaxError ? 'Sender and beneficiary must be valid JSON.' : (error as Error).message
		} finally {
			this.submitting = false
		}
	}

	protected render () {
		return html`
			<div class=heading>
				<div><p class=eyebrow>PEXX sandbox</p><h1>Test payout</h1></div>
			</div>
			${this.error ? html`<section class=notice role=alert>${this.error}</section>` : null}
			${this.result ? html`
				<section class='notice success' role=status>
					<strong>Payout order created.</strong>
					${this.result.client_id ? html`<div>Client <a href=${`/clients/${this.result.client_id}`}>${this.result.client_name ?? this.result.client_id}</a></div>` : null}
					${this.result.order_id ? html`<div>Order ID <code>${this.result.order_id}</code> · Reference <code>${this.result.reference_id ?? this.result.merchant_reference_id}</code></div>` : html`<div>Reference <code>${this.result.merchant_reference_id}</code></div>`}
					<div>Provider ID <code title=${this.result.provider_id}>${short(this.result.provider_id || '—')}</code></div>
					<div>Status <span class=status>${this.result.status}</span></div>
					<div>Provider debit ${money(this.result.provider_debit)} · Fee ${money(this.result.provider_fee)} · Commission ${money(this.result.commission_amount ?? '0')} · Total debit ${money(this.result.total_debit ?? this.result.provider_debit)} · Rate ${this.result.rate}</div>
				</section>
			` : null}
			<form class='panel payout-form' @submit=${this.create}>
				<label>Client
					<select name=client_id .value=${this.selectedClientId} @change=${(e : Event) => { this.selectedClientId = (e.currentTarget as HTMLSelectElement).value }}>
						${this.clients.map(client => html`<option value=${client.id} ?selected=${client.id === this.selectedClientId}>${client.name} (Available: ${money(client.available_balance)}, Commission: ${client.commission_percent}%)</option>`)}
					</select>
				</label>
				<div class=split>
					<label>Merchant reference<input name=merchant_reference_id required autocomplete=off .value=${this.reference}></label>
					<label>Amount<input name=payout_amount required inputmode=decimal .value=${this.amount} @input=${(e : Event) => { this.amount = (e.currentTarget as HTMLInputElement).value }}></label>
				</div>
				<div class=split>
					<label>Currency<select name=payout_currency .value=${this.currency} @change=${this.onCurrencyChange}><option>IDR</option><option>PHP</option><option>INR</option><option>VND</option><option>CNY</option><option>GBP</option><option>EUR</option><option>USD</option><option>PKR</option></select></label>
					<label>Transaction type<select name=transaction_type><option>C2C</option><option>C2B</option><option>B2C</option><option>B2B</option></select></label>
				</div>
				<div class=split>
					<label>Sender JSON<textarea name=sender required .value=${this.senderJson} @input=${(e : Event) => { this.senderJson = (e.currentTarget as HTMLTextAreaElement).value }}></textarea></label>
					<label>Beneficiary JSON<textarea name=beneficiary required .value=${this.beneficiaryJson} @input=${(e : Event) => { this.beneficiaryJson = (e.currentTarget as HTMLTextAreaElement).value }}></textarea></label>
				</div>
				<label>Message<input name=message autocomplete=off value='Sandbox test payout'></label>
				<label><span><input name=is_recipient_self type=checkbox> Sender and recipient are the same person</span></label>
				<button class='button solid' type=submit ?disabled=${this.submitting}>${this.submitting ? 'Submitting…' : 'Create test payout'}</button>
			</form>
		`
	}
}
