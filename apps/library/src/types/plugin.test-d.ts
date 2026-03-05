import { expectTypeOf } from "bun:test";
import type { SugarboxEngine } from "../engine/if-engine";
import { definePlugin } from "./plugin";

// Test 1: Basic plugin with simple types
const simplePlugin = definePlugin({
	init(_engine, config: { value: number }) {
		return { result: config.value * 2 };
	},
	name: "simple",
	onOverride: "err",
} as const);

expectTypeOf(simplePlugin.name).toEqualTypeOf<"simple">();
expectTypeOf<Parameters<typeof simplePlugin.init>[1]>().toEqualTypeOf<{
	value: number;
}>();

// Test 2: Plugin with complex return type
const complexPlugin = definePlugin({
	init(_engine, config: { items: string[]; count: bigint }) {
		return {
			doubleCount: config.count * 2n,
			metadata: { engineName: _engine.name, timestamp: new Date() },
			processedItems: config.items.map((x) => x.toUpperCase()),
		};
	},
	name: "complex",
	onOverride: "override",
} as const);

expectTypeOf(complexPlugin.name).toEqualTypeOf<"complex">();
expectTypeOf<Parameters<typeof complexPlugin.init>[1]>().toEqualTypeOf<{
	items: string[];
	count: bigint;
}>();

// Test 3: Plugin that uses engine methods
const engineUsingPlugin = definePlugin({
	init(engine: SugarboxEngine, config: { multiplier: number }) {
		return {
			getCurrentPassage: () => engine.passage,
			getRandomMultiplied: () => engine.random * config.multiplier,
		};
	},
	name: "engineUser",
	onOverride: "ignore",
} as const);

expectTypeOf(engineUsingPlugin.name).toEqualTypeOf<"engineUser">();
expectTypeOf<Parameters<typeof engineUsingPlugin.init>[1]>().toEqualTypeOf<{
	multiplier: number;
}>();

// Test 4: Async plugin
const asyncPlugin = definePlugin({
	async init(_engine, config: { delay: number }) {
		return Promise.resolve({
			asyncMethod: async () => "done",
			delayedValue: config.delay + 100,
		});
	},
	name: "async",
	onOverride: "err",
} as const);

expectTypeOf<ReturnType<typeof asyncPlugin.init>>().resolves.toHaveProperty(
	"delayedValue",
);
expectTypeOf<ReturnType<typeof asyncPlugin.init>>().resolves.toHaveProperty(
	"asyncMethod",
);
