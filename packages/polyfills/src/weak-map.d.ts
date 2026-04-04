declare global {
	interface WeakMap<K extends object, V> {
		/**
		 * Gets the value for the given key, or inserts and returns the default value if the key doesn't exist.
		 * @param key - The key to look up
		 * @param defaultValue - The value to insert if the key doesn't exist
		 * @returns The existing value or the newly inserted default value
		 */
		getOrInsert(key: K, defaultValue: V): V;

		/**
		 * Gets the value for the given key, or computes, inserts, and returns a new value if the key doesn't exist.
		 * @param key - The key to look up
		 * @param callbackFunction - A function that computes the value to insert if the key doesn't exist
		 * @returns The existing value or the newly computed and inserted value
		 */
		getOrInsertComputed(key: K, callbackFunction: (key: K) => V): V;
	}
}

export {};
