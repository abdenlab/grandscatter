type Listener<T> = (event: T) => void;

export class Emitter<Events extends { [K in keyof Events]: unknown }> {
	#listeners = new Map<string, Set<(arg: never) => void>>();

	on<K extends keyof Events & string>(
		event: K,
		fn: Listener<Events[K]>,
	): () => void {
		if (!this.#listeners.has(event)) {
			this.#listeners.set(event, new Set());
		}
		this.#listeners.get(event)!.add(fn);
		return () => {
			this.#listeners.get(event)?.delete(fn);
		};
	}

	emit<K extends keyof Events & string>(event: K, data: Events[K]): void {
		for (const fn of this.#listeners.get(event) ?? []) {
			(fn as Listener<Events[K]>)(data);
		}
	}
}
