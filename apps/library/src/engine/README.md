# Choicekit Engine

This is the core of Choicekit, deliberately designed to stay minimal and composable through a plugin architecture.

## Initialization

Create an engine with `ChoicekitEngine.init(...)` and provide, at minimum, a `name`, initial `passages` (first entry is the start passage), and `vars`.

Example:

```ts
const engine = await ChoicekitEngine.init({
	name: "MyStory",
	passages: [
		{ name: "Start", data: "You wake up in a dim hallway.", tags: ["intro"] },
		{ name: "Hallway", data: "Two doors. One locked.", tags: ["hub"] },
	],
	vars: { keys: 0, lastChoice: "" },
});
```

If you use plugins, they must be provided during initialization through the `plugins` init argument (plugins are mounted on startup).

## Passages

The engine stores passages in an internal map keyed by passage name. You can provide passages on startup and add more later with `addPassage()` / `addPassages()`.

Each passage includes `name`, `data`, and optional `tags`. The current passage is derived from the active state's `$$id`.

In interactive fiction, a passage is one unit of story content (scene, room, dialogue node, etc). Because Choicekit is headless, `data` can be plain text, markdown, rich JSON, a JSX component, or anything your renderer understands.

Example:

```ts
const engine = await ChoicekitEngine.init({
	name: "MyStory",
	passages: [
		{ name: "Start", data: "You wake up in a dim hallway.", tags: ["intro"] },
		{ name: "Hallway", data: "Two doors. One locked.", tags: ["hub"] },
	],
	vars: { keys: 0 },
});

engine.addPassage({
	name: "SecretRoom",
	data: "Dusty relics surround you.",
	tags: ["secret"],
});
```

## Navigation

Navigation is handled by `navigateTo(passageId)`, which appends a new snapshot and advances the active history index.

The engine also supports `backward(step)` and `forward(step)` to move through existing snapshots without creating new ones.

In interactive fiction terms, navigation is the act of resolving a choice and moving to the next story node / passage.

Example:

```ts
// Player selects "Open the left door"
engine.navigateTo("Hallway");

// Rewind one step (for custom rewind UI)
engine.backward();

// Move forward again
engine.forward();
```

## State and State History

Story state is represented as an immutable initial state plus a list of mutable snapshots. Calls to `setVars()` and `navigateTo()` update snapshots, and the current state is reconstructed from history.

This model enables deterministic undo/redo-like behavior by moving the active index instead of mutating a single global object in place.

In interactive fiction, this state is your run-specific memory: flags, inventory, relationship scores, quest progress, and any values your choices depend on.

Example:

```ts
engine.setVars((s) => {
	s.keys += 1;
	s.lastChoice = "inspect-desk";
});

// In a handler somewhere
if (engine.vars.keys > 0) {
	engine.navigateTo("SecretRoom");
}
```

Functionality that is typically implemented via plugins includes:

- Achievements 
- Settings
- Storylets
- Turn-based event systems
- And more...

## Saving and Persistence

There are 2 types of persisted data: **story** save data and **plugin** save data.

Story save data includes initial state, state snapshots, story index, and save version.

Plugin payloads for plugins configured with `withSave: true` are stored inside story snapshots (`$$plugins`) and therefore move with history (`backward` / `forward`) and save/load.

Data can be stored either in user-facing save slots (manual slots and autosave) or in plugin-specific persistent partitions that are independent from normal story save slots.

There is also **export** data (`saveToExport` / `loadFromExport`), which contains story save data plus plugin data for plugins configured with `withSave: false`.

Story saves can be written to numbered slots (`saveToSaveSlot(slot)`) or to the autosave slot (`saveToSaveSlot()` with no slot). The adapter used for storage is configurable, with in-memory as the default.

Key config options related to saving include `autoSave`, `loadOnStart`, `saveSlots`, `saveVersion`, `saveCompat`, and `compress`.

In interactive fiction, save data represents a full run checkpoint: where the player is, what happened so far, and any plugin-managed progress tied to that run.

Example:

```ts
// Manual save into slot 2
await engine.saveToSaveSlot(2);

// Quickload from slot 2
await engine.loadFromSaveSlot(2);

// Shareable backup string
const exported = await engine.saveToExport();
await engine.loadFromExport(exported);
```

## PRNG

The engine uses a seeded pseudo-random number generator and exposes it as `engine.random` for deterministic randomness.

Each snapshot carries a `$$seed`, and seed behavior is controlled by config (for example `regenSeed: "passage"` advances seed on passage navigation).

In interactive fiction, this is useful for repeatable randomness such as encounter rolls, loot variation, and chance-based branches that should stay reproducible across loads.

Example:

```ts
engine.setVars((s) => {
	const roll = engine.random;

	s.encounter = roll < 0.5 ? "rat" : "ghost";
});
```

## Lifecycle and Event Hooks

The engine exposes a small set of custom events for lifecycle hooks and state/history observation. Subscribe with `engine.on(...)` and unsubscribe with `engine.off(...)` or the returned callback from `engine.on(...)`.

In interactive fiction apps, these hooks are typically used to sync UI, analytics, autosave indicators, and plugin behavior with story progression.

Example:

```ts
const offPassage = engine.on("passageChange", ({ oldPassage, newPassage }) => {
	console.log("navigated", oldPassage?.name, "->", newPassage?.name);
});

const offSave = engine.on("saveEnd", (event) => {
	if (event.type === "success") console.log("save complete", event.slot);
});

// later
offPassage();
offSave();
```

### Emitted events

- `engineReset`: emitted after `reset()` completes. The payload is `{ newSeed }`.
- `historyChange`: emitted whenever the active story index changes, including `navigateTo()`, `backward()`, `forward()`, `reset()`, and save loads. The payload is `{ oldIndex, newIndex }`.
- `passageChange`: emitted whenever the active passage changes. This happens after history/index changes and after a save load. The payload is `{ oldPassage, newPassage }`.
- `stateChange`: emitted whenever the visible state changes. This happens after `setVars()`, history/index changes, resets, and save loads. The payload is `{ oldState, newState }`.
- `saveStart`: emitted right before a save operation begins. The payload includes the target slot, which is `autosave`, `export`, or a numeric save slot.
- `saveEnd`: emitted after a save finishes, whether it succeeds or fails. The payload includes the same slot and a `type` of `success` or `error`.
- `loadStart`: emitted right before a load operation begins. The payload includes the target slot, which is `autosave`, `recent`, or a numeric save slot.
- `loadEnd`: emitted after a load finishes, whether it succeeds or fails. The payload includes the same slot and a `type` of `success` or `error`.
- `deleteStart`: emitted right before a save slot is deleted. The payload includes the target slot, which is `autosave` or a numeric save slot.
- `deleteEnd`: emitted after a delete finishes, whether it succeeds or fails. The payload includes the same slot and a `type` of `success` or `error`.
- `migrationStart`: emitted while loading an older save and before each migration step runs. The payload is `{ fromVersion, toVersion }`.
- `migrationEnd`: emitted after each migration step finishes. On success the payload is `{ type: "success", fromVersion, toVersion }`; on failure it also includes `error`.

## Core API Reference

### Common methods

- `addPassage(passage)` / `addPassages(...passages)`: register passages at runtime.
- `navigateTo(passageId?)`: create a new history snapshot and move story flow.
- `setVars(producer, emitEvent?)`: update story state.
- `backward(step?)` / `forward(step?)`: move through history.
- `saveToSaveSlot(slot?)` / `loadFromSaveSlot(slot?)`: manual save/load.
- `saveToExport()` / `loadFromExport(data)`: portable save export/import.
- `loadRecentSave()`: best-effort load of latest available save.
- `getSaves()`: async generator yielding autosave and normal slot saves.
- `deleteSaveSlot(slot?)` / `deleteAllSaveSlots()`: remove save data.
- `registerMigrators(...)`: register save-data migrations by semantic version.
- `registerClasses(...)`: register custom classes for serializer support.
- `getPassages({ type, tags })`: query passages by tags.
- `getVisitCount(passageId?)`: count visits to a passage.
- `reset(resetSeed?)`: restart state/history and optionally reseed.

### Event methods

- `on(eventName, listener)`: subscribe and receive an unsubscribe callback.
- `once(eventName, listener)`: subscribe for one event emission.
- `off(eventName, listener)`: unsubscribe manually.

### Useful getters

- `engine.vars`: current read-only reconstructed story state.
- `engine.passage`: current passage payload (or `null` if missing).
- `engine.passageId`: current passage id.
- `engine.index`: current state history index.
- `engine.random`: seeded PRNG draw value.

## Limitations

- Choicekit is fully headless. Rendering is entirely consumer-defined.
- Plugins can only be mounted during engine initialization.

