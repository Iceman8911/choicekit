/// <reference path="./map.d.ts" />

import { beforeEach, describe, expect, test } from "bun:test";
import "./map";

describe("Map.prototype.getOrInsert", () => {
	let map: Map<string, number>;

	beforeEach(() => {
		map = new Map<string, number>();
	});

	test("should insert and return default value when key does not exist", () => {
		const result = map.getOrInsert("key1", 42);
		expect(result).toBe(42);
		expect(map.get("key1")).toBe(42);
	});

	test("should return existing value when key exists", () => {
		map.set("key1", 100);
		const result = map.getOrInsert("key1", 42);
		expect(result).toBe(100);
		expect(map.get("key1")).toBe(100);
	});

	test("should work with zero as default value", () => {
		const result = map.getOrInsert("counter", 0);
		expect(result).toBe(0);
		expect(map.has("counter")).toBe(true);
	});

	test("should work with null as default value", () => {
		const mapWithNull = new Map<string, number | null>();
		const result = mapWithNull.getOrInsert("nullable", null);
		expect(result).toBe(null);
		expect(mapWithNull.has("nullable")).toBe(true);
	});

	test("should work with undefined as default value", () => {
		const mapWithUndefined = new Map<string, number | undefined>();
		const result = mapWithUndefined.getOrInsert("maybe", undefined);
		expect(result).toBe(undefined);
		expect(mapWithUndefined.has("maybe")).toBe(true);
	});

	test("should work with objects as values", () => {
		const mapWithObjects = new Map<string, { count: number }>();
		const defaultObj = { count: 0 };
		const result = mapWithObjects.getOrInsert("obj", defaultObj);
		expect(result).toBe(defaultObj);
		expect(result.count).toBe(0);
	});

	test("should work with arrays as values", () => {
		const mapWithArrays = new Map<string, string[]>();
		const defaultArray = ["a", "b"];
		const result = mapWithArrays.getOrInsert("list", defaultArray);
		expect(result).toBe(defaultArray);
		expect(result).toEqual(["a", "b"]);
	});

	test("should handle multiple keys independently", () => {
		map.getOrInsert("key1", 10);
		map.getOrInsert("key2", 20);
		map.getOrInsert("key3", 30);

		expect(map.get("key1")).toBe(10);
		expect(map.get("key2")).toBe(20);
		expect(map.get("key3")).toBe(30);
		expect(map.size).toBe(3);
	});
});

describe("Map.prototype.getOrInsertComputed", () => {
	let map: Map<string, number>;
	let callCount: number;

	beforeEach(() => {
		map = new Map<string, number>();
		callCount = 0;
	});

	test("should compute and insert value when key does not exist", () => {
		const result = map.getOrInsertComputed("key1", (key) => {
			callCount++;
			return key.length * 10;
		});

		expect(result).toBe(40);
		expect(map.get("key1")).toBe(40);
		expect(callCount).toBe(1);
	});

	test("should not call callback when key exists", () => {
		map.set("key1", 100);

		const result = map.getOrInsertComputed("key1", (key) => {
			callCount++;
			return key.length * 10;
		});

		expect(result).toBe(100);
		expect(map.get("key1")).toBe(100);
		expect(callCount).toBe(0);
	});

	test("should pass correct key to callback", () => {
		let receivedKey = "";

		map.getOrInsertComputed("test-key", (key) => {
			receivedKey = key;
			return 42;
		});

		expect(receivedKey).toBe("test-key");
	});

	test("should work with complex computed values", () => {
		const mapWithObjects = new Map<string, { id: string; value: number }>();

		const result = mapWithObjects.getOrInsertComputed("item", (key) => ({
			id: key,
			value: Math.random(),
		}));

		expect(result.id).toBe("item");
		expect(typeof result.value).toBe("number");
	});

	test("should work with arrays as computed values", () => {
		const mapWithArrays = new Map<string, string[]>();

		const result = mapWithArrays.getOrInsertComputed("list", (key) =>
			key.split(""),
		);

		expect(result).toEqual(["l", "i", "s", "t"]);
	});

	test("should handle multiple keys with different computations", () => {
		map.getOrInsertComputed("a", (k) => k.charCodeAt(0));
		map.getOrInsertComputed("b", (k) => k.charCodeAt(0));
		map.getOrInsertComputed("c", (k) => k.charCodeAt(0));

		expect(map.get("a")).toBe(97);
		expect(map.get("b")).toBe(98);
		expect(map.get("c")).toBe(99);
	});

	test("should work with memoization pattern", () => {
		const fibonacci = (n: number): number => {
			if (n <= 1) return n;
			return map.getOrInsertComputed(`fib_${n}`, (_key) => {
				callCount++;
				return fibonacci(n - 1) + fibonacci(n - 2);
			});
		};

		const result1 = fibonacci(10);
		const initialCallCount = callCount;

		const result2 = fibonacci(10);

		expect(result1).toBe(55);
		expect(result2).toBe(55);
		expect(callCount).toBe(initialCallCount);
	});
});

describe("Map polyfill installation", () => {
	test("Map.prototype.getOrInsert should be installed", () => {
		expect(typeof Map.prototype.getOrInsert).toBe("function");
	});

	test("Map.prototype.getOrInsertComputed should be installed", () => {
		expect(typeof Map.prototype.getOrInsertComputed).toBe("function");
	});
});
