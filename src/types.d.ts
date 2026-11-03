interface NavigationDestination {
	readonly url : string
}

interface NavigateEvent extends Event {
	readonly canIntercept : boolean
	readonly destination : NavigationDestination
	intercept (options : { handler : () => Promise<void> | void }) : void
}

interface Navigation extends EventTarget {
	addEventListener (type : 'navigate', listener : (event : NavigateEvent) => void) : void
	navigate (url : string) : void
}

declare const navigation : Navigation
