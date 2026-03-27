# Sugarbox Engine

This is the core of Sugarbox, deliberately designed to be minimal, since it's structured around a [[apps/library/src/plugins/README|plugin]] architecture. This allows new features and enhancements to be optionally added without bloat. 

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

# Saving and Persistence

There are 2 types of save data to be persisted; **story** and **plugin** save data. Story data includes user / engine-initiated save data with other related metadata, and, plugin state. 

There are also 2 options of storing this data; either alongside user / engine-initiated saves, like manual saves or auto-saves, or in a separate area persistent across user-facing saves.

There's also **export** data which is a super-set of normal story data that also includes plugin state, as well as anything else that should be persisted but not attached to story data.

Story data (i.e. story variables and their snapshots, metadata like date saved, etc) can be manually saved in an internal name-spaced "slot", (e.g. `slot1`, `slot2`, etc) or automatically saved by the engine, when appropriate, as an *autosave*.


# TODO

- Clarify main engine concerns explicitly

# Limitations

- Sugarbox is fully headless. The concerns of rendering are left to consumers.

[^1]: Since they are not attached to conventional saves.
