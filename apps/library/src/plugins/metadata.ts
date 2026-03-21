import { definePlugin, type SugarboxPlugin } from "../types/plugin";
import "@packages/polyfills/weak-map";
import type { ReadonlyDeep } from "type-fest";
import type { SugarboxEngine } from "../engine/if-engine";
import { createStateSetter } from "../shared/utils/producers";
import type { StateSetter } from "../types/producers";
import type { GenericObject, GenericSerializableObject } from "../types/shared";

interface SharedGenerics extends GenericObject {
	settings: GenericSerializableObject;
	achievements: GenericSerializableObject;
}

interface MetadataPluginEvents<
	TGenerics extends SharedGenerics = SharedGenerics,
> {
	settingsChange: { new: TGenerics["settings"]; old: TGenerics["settings"] };
	achievementChange: {
		new: TGenerics["achievements"];
		old: TGenerics["achievements"];
	};
}

interface MetadataPluginNamespaceProps<
	TGenerics extends SharedGenerics = SharedGenerics,
> extends GenericObject {
	settings: ReadonlyDeep<TGenerics["settings"]>;
	achievements: ReadonlyDeep<TGenerics["achievements"]>;
	set: {
		settings: StateSetter<TGenerics["settings"], "settingsChange">;
		achievements: StateSetter<TGenerics["achievements"], "achievementChange">;
	};
}

interface MetadataPluginConfig<
	TGenerics extends SharedGenerics = SharedGenerics,
> extends GenericObject {
	settings: TGenerics["settings"];
	achievements: TGenerics["achievements"];
}

interface PrivateEngineProps<
	TGenerics extends SharedGenerics = SharedGenerics,
> {
	settings: TGenerics["settings"];
	achievements: TGenerics["achievements"];
	evTarget: EventTarget;
}

const privateEngineProps = new WeakMap<
	SugarboxEngine<any>,
	PrivateEngineProps
>();

const metadataPlugin = definePlugin({
	init(
		engine,
		{ achievements, settings }: MetadataPluginConfig,
	): MetadataPluginNamespaceProps {
		const DEFAULT_PRIVATE_PROPS = {
			achievements,
			evTarget: new EventTarget(),
			settings,
		} as const satisfies PrivateEngineProps;

		const privateProps = () =>
			privateEngineProps.getOrInsert(engine, DEFAULT_PRIVATE_PROPS);

		return {
			achievements: privateProps().achievements,
			set: {
				achievements: createStateSetter(privateProps().achievements),
				settings: createStateSetter(privateProps().settings),
			},
			settings: privateProps().settings,
		};
	},
	name: "meta",
	onOverride: "err",
});

/** For full type safety on achievement and settings props.
 *
 * @returns a tuple with the plugin as the first parameter and the config as the second
 */
function createMetadataPlugin<
	TGenerics extends SharedGenerics = SharedGenerics,
>(
	config: TGenerics,
): typeof metadataPlugin extends SugarboxPlugin<infer PluginGenerics>
	? readonly [
			SugarboxPlugin<
				PluginGenerics & {
					readonly config: MetadataPluginConfig<TGenerics>;
					readonly mutations: MetadataPluginNamespaceProps<TGenerics>;
				}
			>,
			MetadataPluginConfig<TGenerics>,
		]
	: never {
	//@ts-expect-error TypeScript cannot track the generic constraint flow from SharedGenerics to TGenerics through the tuple return type, but runtime behavior is correct since metadataPlugin accepts any TGenerics extending SharedGenerics
	return [metadataPlugin, config];
}

export default createMetadataPlugin;
