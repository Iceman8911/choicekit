# Plugins

## Introduction


Plugins are a means for extending the Sugarbox [[apps/library/src/engine/README|engine's]] core beyond the basics available. Plugins are defined as plain objects (the recommended helper is `definePlugin`) with a well-known shape.

A plugin exposes public functionality / apiwhich the engine mounts under the plugin's namespace on `engine.$`. Instead of a single `init` function, the plugin API exposes lifecycle hooks such as `initState` (to create per-engine state), `initApi` (to return the public API attached under the plugin id), and optional serialization hooks.


A plugin consists of:

- a unique `id` that defines the namespace on which this plugin's API will be mounted, e.g. a plugin with `id: "meta"` will be mounted onto `engine.$.meta`.
- an optional `dependencies` array. Each entry is a `{ plugin, config }` pair (the runtime expects a plugin plus its mount-time config) and will be loaded/mounted before this plugin's `initApi` is called.
- an optional `onOverride` option that determines the engine behavior when conflicting plugins attempt to mount to the same `id`. Values:
  - `err` — Keep the original plugin and throw an error when a conflicting mount is attempted.
  - `ignore` — Keep the original plugin; do not throw, but log a warning.
  - `override` — Replace the original plugin; do not throw, but log a warning.
- optional life-cycle hooks instead of a single `init`:
  - `initState` — (optional) initialize per-engine private state. Must return a fresh state object and is called once per engine instance.
  - `initApi` — (optional) attach public functionality to the engine. Signature: `(arg: { engine, config, state, triggerSave }) => api`. All declared `dependencies` are available on `engine.$` when this is called. Use this to add listeners to the engine's events or other mounted plugin events. The `triggerSave` function allows the plugin to immediately persist its state if applicable.
- an optional `version` to help with save-data migrations and dependency compatibility checks.
- optional persistence hooks if you need to save internal state:
  - `serialize` — an object with a `withSave: boolean` flag and a `method(state)` function that returns the serializable form of the plugin state. `withSave` controls whether this data is stored with normal saves (`true`) or only with exports (`false)`. This property is always an object.
  - `onDeserialize` — called when serialized data is loaded. Signature: `(arg: { data, state, version }) => void | Promise<void>` to restore/migrate internal state. The `state` argument is the plugin's internal state object.

Use the `definePlugin` and `ValidatePluginGenerics` helpers to get correct typing for these properties when authoring plugins.

## Mounting


Plugins are mounted onto the engine during initialization, before any story save data is loaded. Plugins cannot be added or removed after engine startup. When a plugin is mounted, the following steps are carried out:

- Store the plugin's reference in an internal record in the engine, indexed by the plugin's `id`.
  - If a plugin is already mounted at that namespace, mounting throws, is ignored, or replaced silently depending on the already-present plugin's `onOverride` property.
- Call the plugin's `initState` method where available and initialize the plugin's state in the engine.
- Load any separate stored data for the plugin if `serialize.withSave` is `false`. Otherwise, its save data will be restored when the engine loads previous story data.
- Call the plugin's `initApi` method, passing `{ engine, config, state, triggerSave }`.


# Plugin State Saving & Persistence

- Plugin save data is scoped to their namespace and cannot be accessed by other plugins[^2].
- Migrations are handled by the plugin itself based on the version number difference (the `version` property).


# Dependency Resolution

Plugins can rely on external functionality enabled by other plugins by including the necessary plugins in their `dependencies` array. Each dependency is a `{ plugin, config }` pair. During mounting, the engine will attempt to load and mount dependencies beforehand. This preloading may fail and throw an error when:

- An existing plugin with the same namespace exists, and its override behavior is set to `err`.
- Circular dependencies are encountered.
- A plugin dependency itself throws during initialization.
- An existing plugin with the same namespace exists, its override behavior is set to `override`, but their versions aren't compatible according to semver.[^3]


# Limitations

- Plugins cannot access the engine's internal state (any property or method gated behind `#`).
- Plugins cannot be unmounted from an engine instance.
- Plugins can only be mounted on engine startup.
  - During initialization, plugins are processed sequentially to prevent race conditions when more than one plugin has the same `id` but conflicting `onOverride` behavior. Otherwise, plugins are processed as soon as their dependencies are resolved.
- For type safety when using `definePlugin`, the generic object parameter must be deifned upfront since typescript will be unable to infer it normally and will fall back to a widened catch-all. Use `ValidatePluginGenerics`.

## API Exposure

Each plugin's public API returned from `initApi` is mounted under its `id` on `engine.$`. The type of `engine.$` is automatically inferred from the plugins provided to the engine.

[^1]: By original, I mean the first plugin to be mounted.

[^2]: A plugin would explicitly have to expose events to workaround this.

[^3]: If the versions differ by their majors.
