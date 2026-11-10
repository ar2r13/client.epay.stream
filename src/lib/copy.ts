import { html } from 'lit'

async function copy (event : Event, value : string) {
	const button = event.currentTarget as HTMLButtonElement
	const label = button.dataset.label ?? button.textContent ?? 'Copy'

	button.dataset.label = label
	try {
		await navigator.clipboard.writeText(value)
		button.textContent = 'Copied'
	} catch {
		button.textContent = 'Failed'
	}
	setTimeout(() => { button.textContent = label }, 1500)
}

export function copyButton (value : string | null | undefined, label = 'Copy', className = 'button text copy') {
	if (!value) return null

	return html`<button type=button class=${className} aria-label=${`${label} ${value}`} @click=${(event : Event) => copy(event, value)}>${label}</button>`
}

export function copyable (value : string | null | undefined, display : string = value ?? '—') {
	if (!value) return html`<code>—</code>`

	return html`<span class=copyable><code title=${value}>${display}</code>${copyButton(value)}</span>`
}
