import { describe, expect, it } from "bun:test";
import { ChoicekitEngineBuilder } from "./builder";
import { ChoicekitEngine } from "./if-engine";

describe(ChoicekitEngine.name, () => {
	it("should regenerate random seed according to regenSeed mode", async () => {
		const getCurrentSeed = async (engine: ChoicekitEngine, slot: number) => {
			const saveResult = await engine.saveToSaveSlot(slot);
			expect(saveResult.success).toBe(true);

			for await (const save of engine.getSaves()) {
				if (save.type === "normal" && save.slot === slot) {
					const saveData = await save.getData();
					return saveData.snapshots[saveData.storyIndex]?.$$seed;
				}
			}

			throw Error(`Unable to read save data from slot ${slot}`);
		};

		const baseConfig = {
			initialSeed: 12345,
			loadOnStart: false,
			saveVersion: "1.0.0" as const,
		};

		const noRegen = await new ChoicekitEngineBuilder()
			.withName("RegenSeedFalse")
			.withVars({})
			.withPassages({ data: "main", name: "main", tags: [] })
			.withConfig({ ...baseConfig, regenSeed: false })
			.build();

		const noRegenSeedBefore = await getCurrentSeed(noRegen, 0);
		void noRegen.random;
		void noRegen.random;
		void noRegen.random;
		const noRegenSeedAfter = await getCurrentSeed(noRegen, 1);

		expect(noRegenSeedAfter).toBe(noRegenSeedBefore);

		const eachCall = await new ChoicekitEngineBuilder()
			.withName("RegenSeedEachCall")
			.withVars({})
			.withPassages({ data: "main", name: "main", tags: [] })
			.withConfig({ ...baseConfig, regenSeed: "eachCall" })
			.build();

		const eachCallSeedBefore = await getCurrentSeed(eachCall, 0);
		void eachCall.random;
		void eachCall.random;
		void eachCall.random;
		const eachCallSeedAfter = await getCurrentSeed(eachCall, 1);

		expect(eachCallSeedAfter).not.toBe(eachCallSeedBefore);

		const onPassage = await new ChoicekitEngineBuilder()
			.withName("RegenSeedPassage")
			.withVars({})
			.withPassages(
				{ data: "A", name: "a", tags: [] },
				{ data: "B", name: "b", tags: [] },
			)
			.withConfig({ ...baseConfig, regenSeed: "passage" })
			.build();

		const onPassageSeedBefore = await getCurrentSeed(onPassage, 0);
		void onPassage.random;
		const onPassageSeedAfterRandomCall = await getCurrentSeed(onPassage, 1);

		onPassage.navigateTo("b");
		const onPassageSeedAfterNavigation = await getCurrentSeed(onPassage, 2);

		expect(onPassageSeedAfterRandomCall).toBe(onPassageSeedBefore);
		expect(onPassageSeedAfterNavigation).not.toBe(onPassageSeedBefore);
	});
});
