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

# TODO

- Clarify main engine concerns explicitly

# Limitations

- Sugarbox is fully headless. The concerns of rendering are left to consumers.

[^1]: Since they are not attached to conventional saves.
