/// <reference path="./map.d.ts" />

Map.prototype.getOrInsert ??= function <K, V>(
	this: Map<K, V>,
	key: K,
	defaultValue: V,
): V {
	if (!this.has(key)) {
		this.set(key, defaultValue);
	}
	return this.get(key) as V;
};

Map.prototype.getOrInsertComputed ??= function <K, V>(
	this: Map<K, V>,
	key: K,
	callbackFunction: (key: K) => V,
): V {
	if (!this.has(key)) {
		this.set(key, callbackFunction(key));
	}
	return this.get(key) as V;
};

export {};
