# Settings Plugin (Example)

This file documents `createSettingsPlugin` from `./settings`.

## What it does

The settings plugin adds a namespaced API at `engine.$.settings` for user-preference state (audio, accessibility, UI, etc).

This example plugin serializes with `withSave: false`, so settings persist independently from story save slots and are included in exports.

## Factory

```ts
import { createSettingsPlugin } from "./settings";

const settingsPlugin = createSettingsPlugin({
  musicEnabled: true,
  volume: 0.6,
  notifications: {
    show: true,
    type: "all",
  },
});
```

## Mounting

```ts
const defaultSettings = {
  musicEnabled: true,
  volume: 0.6,
  notifications: {
    show: true,
    type: "all",
  },
};

const engine = await new ChoicekitEngineBuilder()
  .withName("my-story")
  .withPassages({ name: "Start", data: "...", tags: [] })
  .withVars({})
  .withPlugin(createSettingsPlugin(defaultSettings), {
    default: defaultSettings,
  })
  .build();
```

## API

`engine.$.settings` exposes:

- `get(): ReadonlyDeep<T>`: read current settings.
- `set(producer, emitEvent = true): void`: update settings with an immer-style producer.
- `save(): Promise<void>`: force persistence now.
- `on("change", listener)`: subscribe to change events.
- `once("change", listener)`: subscribe once.
- `off("change", listener)`: unsubscribe.

Change event payload:

```ts
{
  old: T;
  new: T;
}
```

## Usage example

```ts
engine.$.settings.set((s) => {
  s.musicEnabled = false;
  s.volume = 0.3;
});

const currentVolume = engine.$.settings.get().volume;
```

## Persistence notes

- `set(...)` triggers asynchronous persistence but does not await it.
- Use `await engine.$.settings.save()` when persistence timing matters.
- If the producer passed to `set(...)` throws, changes are rolled back and error is rethrown.
