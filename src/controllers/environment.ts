export type EnvironmentId = 'dev' | 'prod' | 'local'

export interface Environment {
	id : EnvironmentId
	label : string
	apiOrigin : string
}

const isLocalHost = location.hostname === 'localhost' || location.hostname === '127.0.0.1'

export const environments : Environment[] = [
	{ id: 'dev', label: 'Dev (sandbox)', apiOrigin: 'https://dev-api.epay.stream' },
	{ id: 'prod', label: 'Prod', apiOrigin: 'https://api.epay.stream' },
	...(isLocalHost ? [{ id: 'local' as const, label: 'Local', apiOrigin: 'http://localhost:8787' }] : [])
]

const storageKey = 'epay-admin-environment'
const defaultEnvironment : EnvironmentId = isLocalHost ? 'local' : 'dev'

function readStored () : string | null {
	try {
		return localStorage.getItem(storageKey)
	} catch {
		return null
	}
}

export function getEnvironment () : Environment {
	const stored = readStored()

	return environments.find(environment => environment.id === stored)
		?? environments.find(environment => environment.id === defaultEnvironment)
		?? environments[0]!
}

export function setEnvironment (id : EnvironmentId) {
	try {
		localStorage.setItem(storageKey, id)
	} catch {
		// Storage can be blocked; the default environment stays in effect.
	}
	location.reload()
}
