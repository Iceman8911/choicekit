import { describe, expect, test } from "bun:test";
import * as v from "valibot";

import { TransformableOrJsonSerializableSchema } from "./serializable.schemas";

describe("TransformableOrJsonSerializableSchema", () => {
	test("accepts supported primitive and structured values", () => {
		expect(v.is(TransformableOrJsonSerializableSchema, 1)).toBe(true);
		expect(v.is(TransformableOrJsonSerializableSchema, "hello")).toBe(true);
		expect(v.is(TransformableOrJsonSerializableSchema, true)).toBe(true);
		expect(v.is(TransformableOrJsonSerializableSchema, null)).toBe(true);
		expect(v.is(TransformableOrJsonSerializableSchema, undefined)).toBe(true);
		expect(
			v.is(TransformableOrJsonSerializableSchema, [1, "hello", null]),
		).toBe(true);
		expect(v.is(TransformableOrJsonSerializableSchema, { foo: "bar" })).toBe(
			true,
		);
		expect(
			v.is(
				TransformableOrJsonSerializableSchema,
				Object.create(null, { foo: { enumerable: true, value: "bar" } }),
			),
		).toBe(true);
		expect(v.is(TransformableOrJsonSerializableSchema, new Date())).toBe(true);
		expect(
			v.is(TransformableOrJsonSerializableSchema, new Map([[1, "one"]])),
		).toBe(true);
		expect(
			v.is(TransformableOrJsonSerializableSchema, new Set([1, "two"])),
		).toBe(true);
		expect(v.is(TransformableOrJsonSerializableSchema, 1n)).toBe(true);
	});

	test("accepts custom class instances with serialization hooks", () => {
		class Player {
			static classId = "Player";

			static fromJSON(data: { name: string }) {
				return new Player(data.name);
			}

			constructor(public name: string) {}

			toJSON() {
				return { name: this.name };
			}
		}

		expect(v.is(TransformableOrJsonSerializableSchema, new Player("Bob"))).toBe(
			true,
		);
	});

	test("rejects unsupported values", () => {
		expect(v.is(TransformableOrJsonSerializableSchema, () => null)).toBe(false);
		expect(v.is(TransformableOrJsonSerializableSchema, Symbol("nope"))).toBe(
			false,
		);
		expect(
			v.is(TransformableOrJsonSerializableSchema, { foo: () => null }),
		).toBe(false);
		expect(
			v.is(TransformableOrJsonSerializableSchema, Promise.resolve(1)),
		).toBe(false);
		expect(v.is(TransformableOrJsonSerializableSchema, new Error("boom"))).toBe(
			false,
		);
		expect(v.is(TransformableOrJsonSerializableSchema, /abc/)).toBe(false);
	});
});
