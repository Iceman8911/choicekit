# Choicekit Engine

This is the core of Choicekit, deliberately designed to be minimal, since it's structured around a [[apps/library/src/plugins/README|plugin]] architecture. This allows new features and enhancements to be optionally added without bloat. 

The engine class is only responsible for a few concerns, namely:

- Passages
- Navigation
- State & State History (undo, redo, etc)
- Saving & Persistence
- PRNG
- Lifecycle / Event Hooks

Functionality that will be reserved for plugins; official or not, include: 

- Achievements & Settings (aka metadata[^1])
- Storylets
- Turn-based event systems
- And more...

## Saving and Persistence

There are 2 types of save data to be persisted; **story** and **plugin** save data. Story data includes user / engine-initiated save data with other related metadata, and, plugin state. 

There are also 2 options of storing this data; either alongside user / engine-initiated saves, like manual saves or auto-saves, or in a separate area persistent across user-facing saves.

There's also **export** data which is a super-set of normal story data that also includes plugin state, as well as anything else that should be persisted but not attached to story data.

Story data (i.e. story variables and their snapshots, metadata like date saved, etc) can be manually saved in an internal name-spaced "slot", (e.g. `slot1`, `slot2`, etc) or automatically saved by the engine, when appropriate, as an *autosave*.

## Events

The engine exposes a small set of custom events for lifecycle hooks and state/history observation. Subscribe with `engine.on(...)` and unsubscribe with `engine.off(...)` or the returned callback from `engine.on(...)`.

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


# TODO

- Clarify main engine concerns explicitly

# Limitations

- Choicekit is fully headless. The concerns of rendering are left to consumers.

[^1]: Since they are not attached to conventional saves.
