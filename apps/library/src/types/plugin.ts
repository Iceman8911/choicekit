import type { SugarboxEngine } from "../engine/if-engine";
import type { GenericObject } from "./shared";

export interface SugarboxPlugin<
	TNamespace extends `$${string}`,
	TConfig extends GenericObject,
	TEngine extends SugarboxEngine,
> {
	/** Namespace on the engine instance where all methods and functionality are mounted.
	 *
	 * All namespaces are prefixed with a `$`
	 *
	 * If multiple plugins have the same namespace, plugin instantiation throws.
	 */
	name: TNamespace;

	/** Plugin functionality for mutating the engine */
	plugin: (engine: TEngine, config: TConfig) => TEngine;
}
