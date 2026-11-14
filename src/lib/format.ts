export function money (value : string | number | null | undefined, currency = 'USDT') {
	if (value === null || value === undefined || value === '') return '—'

	return `${value} ${currency}`
}

export function date (value : string | null | undefined) {
	if (!value) return '—'

	try {
		return new Intl.DateTimeFormat('en', {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(new Date(value))
	} catch {
		return value
	}
}

export function short (value : string | null | undefined) {
	if (!value) return '—'
	if (value.length < 16) return value

	return `${value.slice(0, 8)}…${value.slice(-6)}`
}

export function statusTone (status : string | null | undefined) : 'success' | 'warning' | 'danger' | 'muted' {
	const upper = (status ?? '').toUpperCase()
	if (['PAID', 'CONFIRMED', 'DELIVERED', 'ACTIVE', 'COMPLETE'].includes(upper)) return 'success'
	if (['PENDING', 'SUBMITTING', 'SUBMISSION_UNKNOWN', 'SWEEPING', 'DETECTED', 'PROCESSING'].includes(upper)) return 'warning'
	if (['CANCELLED', 'REVERSED', 'FAILED', 'REJECTED', 'BLOCKED', 'DISABLED'].includes(upper)) return 'danger'
	return 'muted'
}

export function bscScanUrl (chainId : number | undefined, kind : 'tx' | 'address', value : string | null | undefined) : string | null {
	if (!value) return null
	const base = chainId === 97 ? 'https://testnet.bscscan.com' : 'https://bscscan.com'
	return `${base}/${kind}/${value}`
}
