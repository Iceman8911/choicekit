# Plugins

Plugins are how you extend the engine beyond core concerns. A plugin is a plain object (usually created with `definePlugin`) that the engine mounts under `engine.$[id]`.

In interactive fiction terms, plugins are where you add higher-level systems like achievements, settings, storylets, quest logs, codex entries, analytics, and similar features.

## Plugin shape

A plugin can define:

- `id` (required): unique namespace key under `engine.$`.
- `onOverride` (optional): conflict policy when another plugin already uses the same `id`.
  - `err`: throw.
  - `ignore`: keep existing plugin and warn.
  - `override`: replace existing plugin and warn.
- `dependencies` (optional): array of `{ plugin, config }` entries to attempt mounting before this plugin's `initApi`.
- `initState` (optional): initialize per-engine private plugin state.
- `initApi` (optional): return the public API mounted at `engine.$[id]`.
- `serialize` (optional): plugin-state serializer with `withSave` and `method(state)`.
- `onDeserialize` (optional): restore plugin state from serialized payload.
- `version` (optional): included in serialized plugin payload.

Use `definePlugin` and `ValidatePluginGenerics` to keep plugin types precise.

## TypeScript note

When authoring typed plugins, define the plugin generics object up front (with `ValidatePluginGenerics`) instead of relying on inline inference from `definePlugin(...)` alone.

If you skip this, TypeScript can widen parts of the plugin shape (`config`, `state`, `api`, and events) to overly broad object types, which reduces autocomplete quality and weakens type safety on `engine.$`.

Recommended pattern:

```ts
type MyPluginGenerics = ValidatePluginGenerics<{
  id: "myPlugin";
  config: { enabled: boolean };
  state: { count: number };
  api: {
    getCount(): number;
  };
}>;

const myPlugin: ChoicekitPlugin<MyPluginGenerics> = definePlugin({
  id: "myPlugin",
  initState() {
    return { count: 0 };
  },
  initApi({ state }) {
    return {
      getCount() {
        return state.count;
      },
    };
  },
});
```

## Mounting lifecycle

Plugins are mounted during engine initialization via the `plugins` init argument (or through the builder's `withPlugin(...)` chain before `build()`).

At mount time, the engine:

1. Resolves namespace conflicts using `onOverride`.
2. Attempts to mount declared dependencies.
3. Creates plugin state using `initState` (or `{}` if omitted).
4. Calls `initApi({ engine, config, state, triggerSave })` and mounts returned API under `engine.$[id]`.

After mounting all plugins, the engine attempts to restore plugin data that is stored outside story save slots (`serialize.withSave === false`).

## Persistence model

Plugin persistence is opt-in (`serialize` + `onDeserialize`).

- `withSave: true`: plugin data is stored with normal story save data.
- `withSave: false`: plugin data is stored in plugin-specific persistent storage and included in export data.

`triggerSave()` is provided to `initApi` so plugins can explicitly persist their own state when needed.

## Dependency behavior

Dependencies are mounted recursively as best effort. If a dependency fails to mount, the engine currently warns and continues mounting the parent plugin.

Because of that, a plugin should not assume dependencies always mounted successfully; guard access if dependency absence is possible.

## API exposure

A plugin's public API is whatever `initApi` returns. That value is attached to `engine.$[id]`.

With typed plugins, `engine.$` is inferred from the plugin list passed to the engine.

## Limitations

- Plugins cannot access private engine fields (anything behind `#`).
- Plugins cannot be unmounted from an engine instance.
- Plugins can only be mounted during initialization.

## Example plugins

- Achievements example plugin: `src/plugins/examples/achievements.ts`
- Settings example plugin: `src/plugins/examples/settings.ts`

Companion docs:

- `src/plugins/examples/achievements.README.md`
- `src/plugins/examples/settings.README.md`
