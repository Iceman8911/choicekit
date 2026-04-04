# Achievements Plugin (Example)

This file documents `createAchievementsPlugin` from `./achievements`.

## What it does

The achievements plugin adds a namespaced API at `engine.$.achievements` for achievement-style state that should persist across story save loads.

This example plugin serializes with `withSave: false`, so its data is stored in plugin storage / exports rather than being tied to story save slots.

## Factory

```ts
import { createAchievementsPlugin } from "./achievements";

const achievementsPlugin = createAchievementsPlugin({
  foundKey: false,
  endings: {
    trueEnding: false,
    badEnding: false,
  },
});
```

## Mounting

```ts
const defaultAchievements = {
  foundKey: false,
  endings: {
    trueEnding: false,
    badEnding: false,
  },
};

const engine = await new ChoicekitEngineBuilder()
  .withName("my-story")
  .withPassages({ name: "Start", data: "...", tags: [] })
  .withVars({})
  .withPlugin(createAchievementsPlugin(defaultAchievements), {
    default: defaultAchievements,
  })
  .build();
```

## API

`engine.$.achievements` exposes:

- `get(): ReadonlyDeep<T>`: read current achievement state.
- `set(producer, emitEvent = true): void`: update achievement state with an immer-style producer.
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
engine.$.achievements.set((a) => {
  a.foundKey = true;
});

const hasFoundKey = engine.$.achievements.get().foundKey;

if (!hasFoundKey) {
  // lock alternate route
}
```

## Persistence notes

- `set(...)` triggers asynchronous persistence but does not await it.
- Use `await engine.$.achievements.save()` when you need deterministic persistence timing (before export, before shutdown, etc).
- If the producer passed to `set(...)` throws, the mutation is rolled back and error rethrown.
