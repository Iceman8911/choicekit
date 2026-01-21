import { describe, expect, test } from "bun:test";
import type {
	SugarBoxClassConstructor,
	SugarBoxClassInstance,
} from "@packages/engine-class";
import {
	deserialize,
	registerClass,
	serialize,
	type TransformableOrJsonSerializableType,
} from "./serializer";

const foobar1 = { baz: null, foo: "bar" };

function serialiseThenDeserialize<
	T extends TransformableOrJsonSerializableType,
>(val: T): T {
	// console.log(serialize(val))

	//@ts-expect-error :/
	return deserialize(serialize(val));
}

// Since I'm only concerned that stringifying  na dparsing yield the same result
describe("Serialization and Deserialization", () => {
	test("Numbers & Bigint", () => {
		expect(serialiseThenDeserialize(1)).toBe(1);

		expect(serialiseThenDeserialize(1e10)).toBe(10000000000);

		expect(serialiseThenDeserialize(-31)).toBe(-31);

		expect(serialiseThenDeserialize(NaN)).toBeNaN();

		expect(serialiseThenDeserialize(Infinity)).toBe(Infinity);

		expect(serialiseThenDeserialize(-Infinity)).toBe(-Infinity);

		expect(serialiseThenDeserialize(1n)).toBe(1n);

		const bigOlNumber = BigInt(
			"23132131231231231231231231231231231231231231231232131231231231231231312312312312412412412412441241241241241241241241241241241241241241241241241241241412749147237491748917417894128947128947128974127894127894712748912748912789471274891274128947128947891279473470892374896897589289573389124791274127418947128947127412748912749127489127489127489127489128749128471289749127489128978914789174198471289471247289675632682341768567817689768723478341348347893134134781237813476834783478348348347834834",
		);

		expect(serialiseThenDeserialize(bigOlNumber)).toBe(bigOlNumber);
	});

	test("Booleans", () => {
		expect(serialiseThenDeserialize(true)).toBeTrue();

		expect(serialiseThenDeserialize(false)).toBeFalse();
	});

	test("Nullish", () => {
		expect(serialiseThenDeserialize(null)).toBeNull();

		expect(serialiseThenDeserialize(undefined)).toBeNull();
	});

	test("Plain Objects", () => {
		const foobar2 = { bar: foobar1.baz, baz: null, foo: foobar1 };

		expect(serialiseThenDeserialize(foobar1)).toStrictEqual(foobar1);

		expect(serialiseThenDeserialize(foobar2)).toStrictEqual(foobar2);
	});

	test("Arrays", () => {
		const foobar2 = [foobar1, foobar1.baz, null];

		expect(serialiseThenDeserialize(foobar2)).toStrictEqual(foobar2);
	});

	test("Maps", () => {
		const map1 = new Map();

		expect(serialiseThenDeserialize(map1)).toStrictEqual(map1);
	});

	test("Plain Objects with more complex value types", () => {
		const foobar2 = {
			bigint: 1n,
			date: new Date(),
			foo: foobar1,
			map: new Map([[foobar1, foobar1]]),
			set: new Set([foobar1]),
		};

		expect(serialiseThenDeserialize(foobar2)).toStrictEqual(foobar2);
	});

	test("Arrays with more complex value types", () => {
		const foobar2 = [
			foobar1,
			new Map([[foobar1, foobar1]]),
			new Set([foobar1]),
			new Date(),
			1n,
		];

		expect(serialiseThenDeserialize(foobar2)).toStrictEqual(foobar2);
	});

	test("Custom Classes", () => {
		type SerializedPlayer = {
			age: number;
			name: string;
			gold: number;
			weapons: ("stick" | "fist")[];
		};

		class Player implements SugarBoxClassInstance<SerializedPlayer> {
			constructor(
				public age: number,
				public name: string,
				public gold: number,
				public weapons: ("stick" | "fist")[],
			) {}

			toJSON() {
				return { ...this };
			}

			static classId = "Player";

			static fromJSON(data: SerializedPlayer) {
				return new Player(data.age, data.name, data.gold, data.weapons);
			}
		}

		Player satisfies SugarBoxClassConstructor<SerializedPlayer>;

		const playerInstance = new Player(10, "Bob", 100, ["stick"]);

		registerClass(Player);

		expect(serialiseThenDeserialize(playerInstance)).toStrictEqual(
			playerInstance,
		);
	});

	test("Circular references", () => {
		const foobar2: Record<string, TransformableOrJsonSerializableType> = {
			baz: foobar1,
			foo: "bar",
		};
		foobar2.foobaz = foobar2;
		foobar2.map = new Map([[foobar2, foobar2]]);
		foobar2.set = new Set([foobar2]);
		foobar2.arr = [foobar2, [foobar2]];
		foobar2.arr[2] = foobar2.arr;
		foobar2.date = new Date();
		foobar2.map2 = new Map([[foobar2.map, foobar2.map]]);
		foobar2.set2 = new Set([foobar2.map, foobar2.set]);

		expect(serialiseThenDeserialize(foobar2)).toStrictEqual(foobar2);
	});
});
