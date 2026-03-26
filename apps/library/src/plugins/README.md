# Plugins

## Introduction

Plugins are a means for extending the Sugarbox [[apps/library/src/engine/README|engine's]] core beyond the basics available. Plugins are defined as plain objects (the recommended helper is `definePlugin`) with a well-known shape rather than a single `init` function.

A plugin can expose public functionality (commonly called “mutations”) which the engine mounts under the plugin's namespace on `engine.$`. Instead of a single `init` function the plugin API exposes lifecycle hooks such as `initState` (to create per-engine state), `initMutations` (to return the public API attached under the plugin id) and optional serialization hooks.

A plugin consists of:

- a unique `id` that defines the namespace on which this plugin's mutations will be mounted, e.g. a plugin with `id: "meta"` will be mounted onto `engine.$.meta`.
- an optional `dependencies` array. Each entry is a `{ plugin, config }` pair (the runtime expects a plugin plus its mount-time config) and will be loaded/mounted before this plugin's `initMutations` is called.
- an optional `onOverride` option that determines the engine behavior when conflicting plugins attempt to mount to the same `id`. Values:
  - `err` — Keep the original plugin and throw an error when a conflicting mount is attempted.
  - `ignore` — Keep the original plugin; do not throw, but log a warning.
  - `override` — Replace the original plugin; do not throw, but log a warning.
- optional life-cycle hooks instead of a single `init`:
  - `initState` — (optional) initialize per-engine private state. Must return a fresh state object and is called once per engine instance.
  - `initApi` — (optional) attach public functionality to the engine. Signature: `(arg: { engine, config, state }) => api`. All declared `dependencies` are available on `engine.$` when this is called.
	  - This is where the bulk of the plugin code will be. Use this to add listeners to the engine's events or other mounted plugin events
- an optional `version` to help with save-data migrations and dependency compatibility checks.
- optional persistence hooks if you need to save internal state:
  - `serialize` — an object with a `withSave?: boolean` flag and a `method(state)` function that returns the serializable form of the plugin state. `withSave` controls whether this data is stored with normal saves (`true`) or only with exports (`false`).
  - `onDeserialize` — called when serialized data is loaded. Signature: `(arg: { data, version?, state }) => void | Promise<void>` to restore/migrate internal state.

Use the `definePlugin` and `ValidatePluginGenerics` helpers to get correct typing for these properties when authoring plugins.

# Plugin State Saving & Persistence

- Plugin save data is scoped to their namespace.
- A plugin cannot access the save data of another plugin[^2].
- Migrations are to be handled by the plugin itself based off the versioning number difference.

# Dependency Resolution

So plugins can rely on external functionality enabled by other plugins, they can opt into include the necessary plugins into their `dependencies` array. During mounting, the engine will attempt to load and mount the dependencies beforehand. However, this preloading may fail and throw an error when:

- An existing plugin with the same namespace exists, and it's override behavior is set to `err`.
- Circular dependencies are encountered.
- A plugin dependency itself throws during initialization.
- An existing plugin with the same namespace exists, its override behavior is set to `override`, but their versions aren't compatible according to semver.[^3]

# Limitations

- Plugins cannot access the engine's internal state, i.e. any property or method gated behind `#`.
- Plugins cannot be unmounted from an engine instance.
- All required plugins should ideally be mounted on engine startup.

[^1]: By original, I mean the first plugin to be mounted.

[^2]: A plugin would explicitly have to expose events to workaround this.

[^3]: If the versions differ by their majors.
