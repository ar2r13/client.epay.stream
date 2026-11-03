export async function onRequest (context) {
	const source = new URL(context.request.url)
	const target = new URL(`${source.pathname}${source.search}`, context.env.API_ORIGIN)

	return fetch(new Request(target, context.request))
}
