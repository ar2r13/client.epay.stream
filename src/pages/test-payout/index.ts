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
	deleteBeneficiaryProfile,
	deleteSenderProfile,
	formatBeneficiaryLabel,
	formatSenderLabel,
	getSavedBeneficiaries,
	getSavedSenders,
	loadPayoutDraft,
	saveBeneficiaryProfile,
	savePayoutDraft,
	saveSenderProfile,
	type SavedBeneficiary,
	type SavedSender,
	type Values
} from '../../lib/profiles.ts'

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
	napasCode: 'NAPAS bank code (or bankCode)', swiftCode: 'SWIFT / BIC code',
	bankId: 'Recipient bank ID from the PEXX bank list', bankState: 'State of the recipient bank branch', bankCity: 'City of the recipient bank branch'
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

const toValues = (value : Record<string, unknown>) : Values =>
	Object.fromEntries(Object.entries(value).map(([key, item]) => [key, String(item)]))

export const PRESETS : Record<string, Preset> = {
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
			swiftCode: 'COBADEFFXXX'
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
			phoneCountryCode: '+971',
			mobileNumber: '501234567',
			city: 'Dubai',
			address: '1 Sheikh Zayed Road',
			bankAccountNumber: 'AE070331234567890123456',
			swiftCode: 'EBILAEADXXX'
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
			dateOfBirth: '1985-05-15',
			idType: '1',
			idNumber: 'P1234567',
			address: '1 George St Sydney',
			bankState: 'New South Wales',
			bankCity: 'Sydney',
			bankId: '1',
			bankBranchCode: '062000',
			bankAccountNumber: '12345678'
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
			dateOfBirth: '1985-05-15',
			bankId: '1',
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
			dateOfBirth: '1985-05-15',
			address: '1 Chiyoda Tokyo',
			bankBranchCode: '001',
			bankId: '1',
			bankAccountNumber: '1234567'
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
			bankId: '1',
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
			dateOfBirth: '1985-05-15',
			phoneCountryCode: '+1',
			mobileNumber: '4165550100',
			address: '1 King St W',
			city: 'Toronto',
			zipCode: 'M5H1A1',
			bankBranchCode: '00012',
			bankId: '1',
			bankAccountNumber: '1234567'
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
			dateOfBirth: '1985-05-15',
			nationality: 'KOR',
			idType: '1',
			idNumber: 'M12345678',
			phoneCountryCode: '+82',
			mobileNumber: '1012345678',
			bankId: '1',
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
			dateOfBirth: '1985-05-15',
			address: '1 Queens Road Central',
			bankId: '1',
			bankAccountNumber: '123456789'
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
	@state() private sender : Values = {}
	@state() private beneficiary : Values = {}
	@state() private message = IS_PROD ? '' : 'Sandbox test payout'
	@state() private isRecipientSelf = false
	@state() private autoSaveOnSubmit = true

	@state() private savedSenders : SavedSender[] = []
	@state() private savedBeneficiaries : SavedBeneficiary[] = []
	@state() private selectedSenderProfileId = ''
	@state() private selectedBeneficiaryProfileId = ''
	@state() private senderCustomLabel = ''
	@state() private beneficiaryCustomLabel = ''
	@state() private flashNote = ''

	@state() private bankDirectories : Record<string, BankDirectoryEntry[]> = {}
	@state() private rates : Record<string, string> = {}

	@state() private error = ''
	@state() private result : TestPayout | null = null
	@state() private reconcilingResult = false
	@state() private submitting = false
	@state() private reference = `${IS_PROD ? 'admin' : 'test'}-${crypto.randomUUID()}`

	connectedCallback () {
		super.connectedCallback()
		this.savedSenders = getSavedSenders()
		this.savedBeneficiaries = getSavedBeneficiaries()
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
			this.showFlash('Order details loaded into the form.')
			return
		}

		if (urlClient) this.selectedClientId = urlClient
		else if (draft.clientId) this.selectedClientId = draft.clientId

		if (draft.currency) this.currency = draft.currency
		if (draft.transactionType) this.transactionType = draft.transactionType
		if (draft.amount !== undefined) this.amount = draft.amount
		if (draft.message !== undefined) this.message = draft.message
		if (draft.isRecipientSelf !== undefined) this.isRecipientSelf = draft.isRecipientSelf
		if (draft.autoSaveOnSubmit !== undefined) this.autoSaveOnSubmit = draft.autoSaveOnSubmit

		const preset = PRESETS[this.currency] ?? PRESETS.IDR
		const defaultSender = IS_PROD ? {} : toValues(preset.sender)
		const defaultBeneficiary = IS_PROD ? {} : toValues(preset.beneficiary)

		this.sender = Object.keys(draft.sender ?? {}).length > 0
			? draft.sender!
			: (this.savedSenders[0]?.values ? { ...defaultSender, ...this.savedSenders[0].values } : defaultSender)

		const matchingBeneficiary = this.savedBeneficiaries.find(item => item.currency === this.currency)
		this.beneficiary = Object.keys(draft.beneficiary ?? {}).length > 0
			? draft.beneficiary!
			: (matchingBeneficiary ? { ...defaultBeneficiary, ...matchingBeneficiary.values } : defaultBeneficiary)
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
			isRecipientSelf: this.isRecipientSelf,
			autoSaveOnSubmit: this.autoSaveOnSubmit
		})
	}

	private showFlash (text : string) {
		this.flashNote = text
		setTimeout(() => {
			if (this.flashNote === text) this.flashNote = ''
		}, 3000)
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

	/** Required fields, then corridor-specific optional ones. Before requirements load: whatever the preset has. */
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

	/** Only the fields shown for the current corridor, non-empty, plus accountType from the transaction type. */
	private payload (party : Party) {
		const { required, optional } = this.fields(party)
		const values = this[party]
		const result : Record<string, string> = { accountType: this.accountType(party) }
		for (const field of [...required, ...optional])
			if (filled(values[field]?.trim())) result[field] = values[field].trim()
		return result
	}

	private handleSaveSender () {
		const payload = this.payload('sender')
		const saved = saveSenderProfile(
			this.accountType('sender'),
			payload,
			this.senderCustomLabel,
			this.selectedSenderProfileId || undefined
		)
		if (saved) {
			this.savedSenders = getSavedSenders()
			this.selectedSenderProfileId = saved.id
			this.senderCustomLabel = ''
			this.showFlash(`Saved sender "${saved.label}" to localStorage`)
		}
	}

	private handleSelectSender (id : string) {
		this.selectedSenderProfileId = id
		const found = this.savedSenders.find(item => item.id === id)
		if (!found) return
		this.sender = { ...this.sender, ...found.values }
		this.persistDraft()
		this.showFlash(`Loaded sender "${found.label}"`)
	}

	private handleDeleteSender (id : string) {
		const found = this.savedSenders.find(item => item.id === id)
		this.savedSenders = deleteSenderProfile(id)
		if (this.selectedSenderProfileId === id) this.selectedSenderProfileId = ''
		if (found) this.showFlash(`Deleted sender "${found.label}"`)
	}

	private handleSaveBeneficiary () {
		const payload = this.payload('beneficiary')
		const saved = saveBeneficiaryProfile(
			this.currency,
			this.accountType('beneficiary'),
			payload,
			this.beneficiaryCustomLabel,
			this.selectedBeneficiaryProfileId || undefined
		)
		if (saved) {
			this.savedBeneficiaries = getSavedBeneficiaries()
			this.selectedBeneficiaryProfileId = saved.id
			this.beneficiaryCustomLabel = ''
			this.showFlash(`Saved recipient "${saved.label}" to localStorage`)
		}
	}

	private handleSelectBeneficiary (id : string) {
		this.selectedBeneficiaryProfileId = id
		const found = this.savedBeneficiaries.find(item => item.id === id)
		if (!found) return
		if (found.currency && found.currency !== this.currency) {
			this.currency = found.currency
		}
		// Match beneficiary accountType with transactionType if needed
		const wantBusiness = found.accountType === 'BUSINESS'
		const senderPrefix = this.transactionType.startsWith('B') ? 'B' : 'C'
		const nextTxType = `${senderPrefix}2${wantBusiness ? 'B' : 'C'}`
		const allowed = this.requirement?.transaction_types.map(t => t.transaction_type) ?? ['C2C', 'C2B', 'B2C', 'B2B']
		if (allowed.includes(nextTxType)) {
			this.transactionType = nextTxType
		}
		this.beneficiary = { ...found.values }
		this.persistDraft()
		this.showFlash(`Loaded recipient "${found.label}"`)
	}

	private handleDeleteBeneficiary (id : string) {
		const found = this.savedBeneficiaries.find(item => item.id === id)
		this.savedBeneficiaries = deleteBeneficiaryProfile(id)
		if (this.selectedBeneficiaryProfileId === id) this.selectedBeneficiaryProfileId = ''
		if (found) this.showFlash(`Deleted recipient "${found.label}"`)
	}

	private fillPartyPreset (party : Party) {
		const preset = PRESETS[this.currency]
		if (!preset) return
		this[party] = toValues(preset[party])
		if (party === 'sender') this.selectedSenderProfileId = ''
		else this.selectedBeneficiaryProfileId = ''
		this.persistDraft()
		this.showFlash(`Filled ${this.currency} preset for ${party}`)
	}

	private clearParty (party : Party) {
		this[party] = {}
		if (party === 'sender') this.selectedSenderProfileId = ''
		else this.selectedBeneficiaryProfileId = ''
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
			<label class=${required && !filled(value.trim()) ? 'field missing' : 'field'} title=${hint}>
				<span>${label(field)}${required ? html` <b class=required-mark>*</b>` : null}</span>
				${options ? html`
					<select ?required=${required} @change=${update}>
						<option value='' ?selected=${!value}>Select…</option>
						${options.map(([option, text]) => html`<option value=${option} ?selected=${option === value}>${text}</option>`)}
						${value && !options.some(([option]) => option === value) ? html`<option value=${value} selected>${value} (not allowed)</option>` : null}
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

	private renderSenderToolbar () {
		const acctType = this.accountType('sender')
		const autoLabel = formatSenderLabel(this.sender, acctType)
		return html`
			<div class=profile-bar>
				<div class=profile-bar-row>
					<select
						class=profile-select
						aria-label='Saved senders'
						.value=${this.selectedSenderProfileId}
						@change=${(e : Event) => this.handleSelectSender((e.currentTarget as HTMLSelectElement).value)}>
						<option value=''>Saved senders (${this.savedSenders.length})…</option>
						${this.savedSenders.map(item => html`
							<option value=${item.id} ?selected=${item.id === this.selectedSenderProfileId}>${item.label}</option>
						`)}
					</select>
					<input
						class=profile-label-input
						type=text
						placeholder=${`Save as: ${autoLabel}`}
						.value=${this.senderCustomLabel}
						@input=${(e : Event) => { this.senderCustomLabel = (e.currentTarget as HTMLInputElement).value }}>
					<button class='button outlined sm' type=button @click=${this.handleSaveSender}>
						${this.selectedSenderProfileId ? 'Update saved' : 'Save sender'}
					</button>
					${this.selectedSenderProfileId ? html`
						<button class='button danger sm' type=button @click=${() => this.handleDeleteSender(this.selectedSenderProfileId)}>Delete</button>
					` : null}
				</div>
				${this.savedSenders.length > 0 ? html`
					<div class=profile-chips>
						${this.savedSenders.slice(0, 6).map(item => html`
							<button
								type=button
								class=${`chip ${item.id === this.selectedSenderProfileId ? 'active' : ''}`}
								@click=${() => this.handleSelectSender(item.id)}>
								${item.label}
							</button>
						`)}
					</div>
				` : null}
			</div>
		`
	}

	private renderBeneficiaryToolbar () {
		const acctType = this.accountType('beneficiary')
		const autoLabel = formatBeneficiaryLabel(this.beneficiary, this.currency, acctType)
		const sameCurrency = this.savedBeneficiaries.filter(item => item.currency === this.currency)
		const otherCurrency = this.savedBeneficiaries.filter(item => item.currency !== this.currency)

		return html`
			<div class=profile-bar>
				<div class=profile-bar-row>
					<select
						class=profile-select
						aria-label='Saved recipients'
						.value=${this.selectedBeneficiaryProfileId}
						@change=${(e : Event) => this.handleSelectBeneficiary((e.currentTarget as HTMLSelectElement).value)}>
						<option value=''>Saved recipients (${this.savedBeneficiaries.length})…</option>
						${sameCurrency.length ? html`
							<optgroup label=${`${this.currency} recipients`}>
								${sameCurrency.map(item => html`<option value=${item.id} ?selected=${item.id === this.selectedBeneficiaryProfileId}>${item.label}</option>`)}
							</optgroup>
						` : null}
						${otherCurrency.length ? html`
							<optgroup label='Other currencies'>
								${otherCurrency.map(item => html`<option value=${item.id} ?selected=${item.id === this.selectedBeneficiaryProfileId}>${item.label}</option>`)}
							</optgroup>
						` : null}
					</select>
					<input
						class=profile-label-input
						type=text
						placeholder=${`Save as: ${autoLabel}`}
						.value=${this.beneficiaryCustomLabel}
						@input=${(e : Event) => { this.beneficiaryCustomLabel = (e.currentTarget as HTMLInputElement).value }}>
					<button class='button outlined sm' type=button @click=${this.handleSaveBeneficiary}>
						${this.selectedBeneficiaryProfileId ? 'Update saved' : 'Save recipient'}
					</button>
					${this.selectedBeneficiaryProfileId ? html`
						<button class='button danger sm' type=button @click=${() => this.handleDeleteBeneficiary(this.selectedBeneficiaryProfileId)}>Delete</button>
					` : null}
				</div>
				${sameCurrency.length > 0 ? html`
					<div class=profile-chips>
						${sameCurrency.slice(0, 6).map(item => html`
							<button
								type=button
								class=${`chip ${item.id === this.selectedBeneficiaryProfileId ? 'active' : ''}`}
								@click=${() => this.handleSelectBeneficiary(item.id)}>
								${item.label}
							</button>
						`)}
					</div>
				` : null}
			</div>
		`
	}

	private renderParty (party : Party) {
		const { required, optional } = this.fields(party)
		const missing = required.filter(field => !filled(this[party][field]?.trim())).length
		const hasPreset = Boolean(PRESETS[this.currency])
		return html`
			<fieldset class=party>
				<legend>${party === 'sender' ? 'Sender' : 'Beneficiary (Recipient)'} · ${this.accountType(party)}</legend>
				<div class=party-head>
					${this.corridor ? html`<span class=${missing ? 'status danger' : 'status success'}>${missing ? `${missing} required missing` : 'All required filled'}</span>` : null}
					<div class=party-actions>
						${hasPreset ? html`<button class='button text sm' type=button @click=${() => this.fillPartyPreset(party)}>Fill ${this.currency} preset</button>` : null}
						<button class='button text sm' type=button @click=${() => this.clearParty(party)}>Clear fields</button>
					</div>
				</div>
				${party === 'sender' ? this.renderSenderToolbar() : this.renderBeneficiaryToolbar()}
				<div class=fields>${required.map(field => this.renderInput(party, field, true))}</div>
				${optional.length ? html`
					${required.length ? html`<p class='eyebrow optional'>Optional / Corridor-specific</p>` : null}
					<div class=fields>${optional.map(field => this.renderInput(party, field, false))}</div>
				` : null}
			</fieldset>
		`
	}

	private renderQuotePreview () {
		const client = this.clients.find(item => item.id === this.selectedClientId) ?? this.clients[0]
		const rateStr = this.rates[this.currency]
		const rateNum = Number(rateStr)
		const amountNum = Number(this.amount)
		if (!rateStr || !Number.isFinite(rateNum) || rateNum <= 0 || !Number.isFinite(amountNum) || amountNum <= 0) {
			return null
		}
		const estProviderUsdt = amountNum / rateNum
		const commPct = Number(client?.commission_percent ?? 0)
		const estCommUsdt = estProviderUsdt * (commPct / 100)
		const estTotalUsdt = estProviderUsdt + estCommUsdt
		const availNum = Number(client?.available_balance ?? NaN)
		const insufficient = Number.isFinite(availNum) && estTotalUsdt > availNum

		return html`
			<div class=${`quote-bar ${insufficient ? 'insufficient' : ''}`}>
				<div class=quote-item>
					<span>Indicative rate</span>
					<strong>1 USDT ≈ ${rateStr} ${this.currency}</strong>
				</div>
				<div class=quote-item>
					<span>Est. provider debit</span>
					<strong>~${estProviderUsdt.toFixed(2)} USDT</strong>
				</div>
				<div class=quote-item>
					<span>Commission (${commPct}%)</span>
					<strong>~${estCommUsdt.toFixed(2)} USDT</strong>
				</div>
				<div class=quote-item>
					<span>Est. total debit</span>
					<strong>~${estTotalUsdt.toFixed(2)} USDT</strong>
				</div>
				${client ? html`
					<div class=quote-item>
						<span>Client available</span>
						<strong class=${insufficient ? 'text-danger' : ''}>${money(client.available_balance)} ${insufficient ? '(Insufficient)' : ''}</strong>
					</div>
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
			// Ignore if clients cannot be loaded yet
		}
	}

	private onCurrencyChange (event : Event) {
		const next = (event.currentTarget as HTMLSelectElement).value
		this.currency = next
		const types = this.requirement?.transaction_types.map(item => item.transaction_type) ?? []
		if (types.length && !types.includes(this.transactionType)) this.transactionType = types[0]

		const savedRecip = this.savedBeneficiaries.find(item => item.currency === next)
		const preset = PRESETS[next]
		if (savedRecip) {
			this.selectedBeneficiaryProfileId = savedRecip.id
			this.beneficiary = { ...(preset && !IS_PROD ? toValues(preset.beneficiary) : {}), ...savedRecip.values }
		} else if (preset && !IS_PROD) {
			this.selectedBeneficiaryProfileId = ''
			this.amount = preset.amount
			this.beneficiary = toValues(preset.beneficiary)
		}
		if (preset && !IS_PROD) {
			const activeSender = this.savedSenders.find(item => item.id === this.selectedSenderProfileId) ?? this.savedSenders[0]
			this.sender = { ...toValues(preset.sender), ...(activeSender ? activeSender.values : this.sender) }
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
			if (!confirm(`Create a REAL payout of ${form.get('payout_amount')} ${form.get('payout_currency')} for ${client.name}? It will be reserved from the client's balance and sent to PEXX.`)) return
		}
		this.error = ''
		this.result = null
		this.submitting = true
		const sender = this.payload('sender')
		const beneficiary = this.payload('beneficiary')

		if (this.autoSaveOnSubmit) {
			const savedSnd = saveSenderProfile(this.accountType('sender'), sender, this.senderCustomLabel, this.selectedSenderProfileId || undefined)
			const savedBnf = saveBeneficiaryProfile(this.currency, this.accountType('beneficiary'), beneficiary, this.beneficiaryCustomLabel, this.selectedBeneficiaryProfileId || undefined)
			this.savedSenders = getSavedSenders()
			this.savedBeneficiaries = getSavedBeneficiaries()
			if (savedSnd) this.selectedSenderProfileId = savedSnd.id
			if (savedBnf) this.selectedBeneficiaryProfileId = savedBnf.id
		}
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
					<p class=eyebrow>${IS_PROD ? 'Production' : 'PEXX sandbox'}</p>
					<h1>${IS_PROD ? 'Create payout' : 'Test payout'}</h1>
				</div>
				<div class=heading-actions>
					${this.flashNote ? html`<span class='status success'>${this.flashNote}</span>` : null}
					${!IS_PROD ? html`
						<button class='button outlined' type=button @click=${() => {
							this.fillPartyPreset('sender')
							this.fillPartyPreset('beneficiary')
							if (PRESETS[this.currency]) this.amount = PRESETS[this.currency].amount
						}}>Reset to ${this.currency} preset</button>
					` : null}
				</div>
			</div>
			${this.error ? html`<section class=notice role=alert>${this.error}</section>` : null}
			${this.result ? html`
				<section class=${['CANCELLED', 'REVERSED', 'SUBMISSION_UNKNOWN'].includes(this.result.status) ? 'notice warning' : 'notice success'} role=status>
					<div class=result-head>
						<strong>${this.result.status === 'CANCELLED' ? 'Payout was rejected.' : this.result.status === 'SUBMISSION_UNKNOWN' ? 'Payout outcome is unknown, reconciling.' : 'Payout order created.'}</strong>
						<div class=result-actions>
							${this.result.order_id ? html`
								<button class='button outlined sm' type=button ?disabled=${this.reconcilingResult} @click=${this.refreshResultStatus}>
									${this.reconcilingResult ? 'Checking PEXX…' : 'Refresh status from PEXX'}
								</button>
							` : null}
							${this.result.client_id && this.result.order_id ? html`
								<a class='button solid sm' href=${`/clients/${this.result.client_id}?order=${this.result.order_id}`}>Inspect transaction →</a>
							` : null}
						</div>
					</div>
					${this.result.error_message ? html`<div>Reason <code>${this.result.error_code ? `${this.result.error_code} · ` : ''}${this.result.error_message}</code></div>` : null}
					<div>
						Status <span class=${`status ${statusTone(this.result.status)}`}>${this.result.status}</span>
						${this.result.client_id ? html` · Client <a href=${`/clients/${this.result.client_id}`}>${this.result.client_name ?? this.result.client_id}</a>` : null}
					</div>
					${this.result.order_id ? html`<div>Order ID <code>${this.result.order_id}</code> ${copyButton(this.result.order_id)} · Reference <code>${this.result.reference_id ?? this.result.merchant_reference_id}</code> ${copyButton(this.result.reference_id ?? this.result.merchant_reference_id)}</div>` : html`<div>Reference <code>${this.result.merchant_reference_id}</code></div>`}
					<div>Provider ID <code title=${this.result.provider_id}>${short(this.result.provider_id || '—')}</code> ${copyButton(this.result.provider_id)}</div>
					<div>Provider debit <strong>${money(this.result.provider_debit)}</strong> · Fee ${money(this.result.provider_fee)} · Commission ${money(this.result.commission_amount ?? '0')} · Total debit <strong>${money(this.result.total_debit ?? this.result.provider_debit)}</strong> · Rate ${this.result.rate}</div>
				</section>
			` : null}
			<form class='panel payout-form' @submit=${this.create}>
				<div class=split>
					<label>Client
						<select name=client_id required .value=${this.selectedClientId} @change=${(e : Event) => {
							this.selectedClientId = (e.currentTarget as HTMLSelectElement).value
							this.persistDraft()
						}}>
							${IS_PROD ? html`<option value='' ?selected=${!this.selectedClientId}>Select client…</option>` : null}
							${this.clients.map(client => html`<option value=${client.id} ?selected=${client.id === this.selectedClientId}>${client.name} (Available: ${money(client.available_balance)}, Commission: ${client.commission_percent}%)</option>`)}
						</select>
					</label>
					<label>Merchant reference
						<div class=input-with-action>
							<input name=merchant_reference_id required autocomplete=off .value=${this.reference} @input=${(e : Event) => { this.reference = (e.currentTarget as HTMLInputElement).value }}>
							<button class='button outlined sm' type=button @click=${() => { this.reference = `${IS_PROD ? 'admin' : 'test'}-${crypto.randomUUID()}` }}>New ID</button>
						</div>
					</label>
				</div>
				<div class=split-3>
					<label>Currency
						<select name=payout_currency .value=${this.currency} @change=${this.onCurrencyChange}>
							<option>IDR</option><option>PHP</option><option>INR</option><option>VND</option><option>CNY</option><option>GBP</option><option>EUR</option><option>USD</option><option>PKR</option><option>AED</option><option>AUD</option><option>THB</option><option>JPY</option><option>MYR</option><option>CAD</option><option>KRW</option><option>HKD</option>
						</select>
					</label>
					<label>Transaction type
						<select name=transaction_type .value=${this.transactionType} @change=${(e : Event) => {
							this.transactionType = (e.currentTarget as HTMLSelectElement).value
							this.persistDraft()
							this.loadRates()
						}}>
							${(this.requirement?.transaction_types.map(item => item.transaction_type) ?? ['C2C', 'C2B', 'B2C', 'B2B']).map(type => html`<option ?selected=${type === this.transactionType}>${type}</option>`)}
						</select>
					</label>
					<label>Payout amount (${this.currency})
						<input name=payout_amount required inputmode=decimal .value=${this.amount} @input=${(e : Event) => {
							this.amount = (e.currentTarget as HTMLInputElement).value
							this.persistDraft()
						}}>
					</label>
				</div>
				${this.renderQuotePreview()}
				<div class=split>${this.renderParty('sender')}${this.renderParty('beneficiary')}</div>
				${this.requirement?.rules.length ? html`<ul class=rules>${this.requirement.rules.map(rule => html`<li>${rule}</li>`)}</ul>` : null}
				<label>Message / Remark
					<input name=message autocomplete=off .value=${this.message} @input=${(e : Event) => {
						this.message = (e.currentTarget as HTMLInputElement).value
						this.persistDraft()
					}}>
				</label>
				<div class=checkbox-row>
					<label class=checkbox-label>
						<input name=is_recipient_self type=checkbox .checked=${this.isRecipientSelf} @change=${(e : Event) => {
							this.isRecipientSelf = (e.currentTarget as HTMLInputElement).checked
							this.persistDraft()
						}}>
						<span>Sender and recipient are the same person</span>
					</label>
					<label class=checkbox-label>
						<input type=checkbox .checked=${this.autoSaveOnSubmit} @change=${(e : Event) => {
							this.autoSaveOnSubmit = (e.currentTarget as HTMLInputElement).checked
							this.persistDraft()
						}}>
						<span>Automatically save sender & recipient in browser on submit</span>
					</label>
				</div>
				<button class='button solid' type=submit ?disabled=${this.submitting}>${this.submitting ? 'Submitting…' : IS_PROD ? 'Create payout' : 'Create test payout'}</button>
			</form>
		`
	}
}
