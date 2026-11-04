import { html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { api, type TestPayout } from '../../controllers/api.ts'
import { money, short } from '../../lib/format.ts'
import { OpenElement } from '../../lib/element.ts'

const sender = JSON.stringify({
	accountType: 'PERSONAL',
	name: 'Test Sender',
	email: 'test@example.com',
	phone: '+66812345678',
	phoneCountryCode: '+66'
}, null, 2)

const beneficiary = JSON.stringify({
	accountType: 'PERSONAL',
	accountNumber: '0000000000',
	bankCode: 'bdouni',
	name: 'Test Recipient'
}, null, 2)

@customElement('test-payout-page')
export class TestPayoutPage extends OpenElement {
	@state() private error = ''
	@state() private result : TestPayout | null = null
	@state() private submitting = false
	@state() private reference = `test-${crypto.randomUUID()}`

	private async create (event : SubmitEvent) {
		event.preventDefault()
		this.error = ''
		this.result = null
		this.submitting = true
		const form = new FormData(event.currentTarget as HTMLFormElement)

		try {
			this.result = await api.testPayout({
				merchantReferenceId: String(form.get('merchant_reference_id')),
				payoutAmount: Number(form.get('payout_amount')),
				payoutCurrency: String(form.get('payout_currency')),
				deductionCurrency: 'USDT',
				transactionType: String(form.get('transaction_type')),
				sender: JSON.parse(String(form.get('sender'))),
				beneficiaryMethod: {
					...JSON.parse(String(form.get('beneficiary'))),
					currency: String(form.get('payout_currency'))
				},
				isRecipientSelf: form.get('is_recipient_self') === 'on',
				message: String(form.get('message')) || null
			})
			this.reference = `test-${crypto.randomUUID()}`
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
					<strong>Payout submitted.</strong>
					<div>Reference <code>${this.result.merchant_reference_id}</code></div>
					<div>Provider ID <code title=${this.result.provider_id}>${short(this.result.provider_id)}</code></div>
					<div>Status <span class=status>${this.result.status}</span></div>
					<div>Debit ${money(this.result.provider_debit)} · Fee ${money(this.result.provider_fee)} · Rate ${this.result.rate}</div>
				</section>
			` : null}
			<form class='panel payout-form' @submit=${this.create}>
				<div class=split>
					<label>Merchant reference<input name=merchant_reference_id required autocomplete=off .value=${this.reference}></label>
					<label>Amount<input name=payout_amount required inputmode=decimal value=100></label>
				</div>
				<div class=split>
					<label>Currency<select name=payout_currency><option>PHP</option><option>IDR</option><option>INR</option><option>VND</option><option>CNY</option><option>GBP</option><option>EUR</option><option>USD</option><option>PKR</option></select></label>
					<label>Transaction type<select name=transaction_type><option>C2C</option><option>C2B</option><option>B2C</option><option>B2B</option></select></label>
				</div>
				<div class=split>
					<label>Sender JSON<textarea name=sender required .value=${sender}></textarea></label>
					<label>Beneficiary JSON<textarea name=beneficiary required .value=${beneficiary}></textarea></label>
				</div>
				<label>Message<input name=message autocomplete=off value='Sandbox test payout'></label>
				<label><span><input name=is_recipient_self type=checkbox> Sender and recipient are the same person</span></label>
				<button class='button solid' type=submit ?disabled=${this.submitting}>${this.submitting ? 'Submitting…' : 'Create test payout'}</button>
			</form>
		`
	}
}
