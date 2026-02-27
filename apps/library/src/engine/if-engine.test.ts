import { describe, expectTypeOf, it } from "bun:test";
import { SugarboxEngineBuilder } from "./builder";
import { SugarboxEngine } from "./if-engine";

describe(SugarboxEngine.name, () => {
	it("should have strict types", async () => {
		const engine = await new SugarboxEngineBuilder()
			.withName("Greg")
			.withVars(async ({ prng }) => {
				return {
					bar: prng,
					baz: 2n,
					foo: "",
					nested: { barbaz: 3n, foobar: "1" },
				};
			})
			.withPassages(
				{
					data: "Greg",
					name: "Gregged",
					tags: ["Gregs", "2nd greg", "3rd grg :D"],
				},
				{ data: "Not Greg :(", name: "Not Gregged :((", tags: ["Greg???"] },
			)
			.withAchievements({ bar: 2 })
			.withSettings({ booze: 3n })
			.build();

		expectTypeOf(engine.name).toExtend<"Greg">();
		expectTypeOf(engine.vars.foo).toBeString();
		expectTypeOf(engine.vars.bar).toBeNumber();
		expectTypeOf(engine.vars.baz).toBeBigInt();
		expectTypeOf(engine.vars.nested.foobar).toBeString();
		expectTypeOf(engine.vars.nested.barbaz).toBeBigInt();
		expectTypeOf(engine.passageId).toBeString();
		expectTypeOf(engine.achievements.bar).toBeNumber();
		expectTypeOf(engine.settings.booze).toBeBigInt();
		expectTypeOf(engine.index).toBeNumber();
		expectTypeOf(engine.random).toBeNumber();
	});
});
