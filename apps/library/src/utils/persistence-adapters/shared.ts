/**
 * Iterates keys from a Web Storage instance (`localStorage` / `sessionStorage`)
 * in a spec-compliant way (via `.length` + `.key(i)`).
 */
export function* _getKeysFromWebStorage(
	storage: Storage,
): IterableIterator<string> {
	const { length } = storage;

	for (let i = 0; i < length; i++) {
		const key = storage.key(i);
		if (key !== null) yield key;
	}
}
