export function money (value : string | number | null | undefined, currency = 'USDT') {
	if (value === null || value === undefined || value === '') return '—'

	return `${value} ${currency}`
}

export function date (value : string | null | undefined) {
	if (!value) return '—'

	return new Intl.DateTimeFormat('en', {
		dateStyle: 'medium',
		timeStyle: 'short'
	}).format(new Date(value))
}

export function short (value : string | null | undefined) {
	if (!value) return '—'
	if (value.length < 16) return value

	return `${value.slice(0, 8)}…${value.slice(-6)}`
}
