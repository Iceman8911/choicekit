# TODO

---

## HIGH PRIORITY

- [x] Add regression tests for save/load, passage navigation, and large-history performance.

---

## MEDIUM PRIORITY

- [ ] Define a passage authoring and registration workflow.
- [ ] Add a turn-based event system for delayed callbacks.
- [x] Add `getVisitCount` for determining how many times a passage has been navigated to.
- [ ] Add an interactive fiction helper toolkit (plugins + choice/branch UI helpers + practical docs).
	- [ ] Choice/branch UI helpers.
		- [ ] Add a choice-evaluation helper with explicit availability states (`available | hidden | locked`) and reason keys.
		- [ ] Add deterministic branch-ranking helper support (priority + weighted conditions + stable tie-breaking) for reproducible QA.
		- [ ] Add branch cooldown/anti-repeat helper support for ambient events and scene rotation.
		- [ ] Add UI-ready grouping helpers for primary/secondary/locked choice buckets.
	- [ ] Focused helper plugins.
		- [ ] Inventory plugin: text adventure/RPG item pickup, equip/unequip, consume, and combine checks that gate choices.
		- [ ] Conversation-state plugin: VN/dialogue trees with per-NPC node visits and trust values for reply availability.
		- [ ] Relationship plugin: affinity/faction alignment affecting route eligibility and ending branches.
		- [ ] Quest plugin: staged objectives and quest status that unlock or block story progression.
		- [ ] Location-state plugin: persistent world state per location (visited, looted, mutated room flags) across revisits.
		- [ ] Codex/journal plugin: lore/clue/NPC discovery that unlocks context-sensitive options and summaries.
		- [ ] Deliverables per plugin: `src/plugins/examples/{plugin}.ts` + `src/plugins/examples/{plugin}.test.ts` + one practical guide scenario.
	- [ ] Documentation coverage.
		- [ ] Add examples for conditional passages, branch filtering, and stat checks.
		- [ ] Document passage data types and custom serialization constraints.
- [ ] Add framework adapters or example bindings for react, vue, svelte, and solidjs.
- [ ] Detect and surface plugin dependency cycles during plugin mounting.
	- [ ] Keep this warning-based for now; revisit strict failure once `onOverride` semantics are cleaner.
- [x] Use maps instead of records where possible.
- [x] Remove the redundant readmes in the `library` repo since `docs` is the single source of truth.
- [x] Add an example cache adapter or lightweight cache package.
- [ ] See if bundle size reductions can be achieved without losing functionality or ergonomics.

---

## LOW PRIORITY

- [ ] Add validation around story state initialization and mutation.
	- [ ] Focus this on boundary validation hooks rather than validating every internal mutation.
	- [ ] Consider Standard Schema support only if it stays optional and lightweight.
- [x] Add tags to passages and query methods for passages based off their properties. 
- [ ] Consider a complementary module-scoped API alongside the class-based API.
- [ ] Evaluate patch-based snapshot generation only if profiling shows a real bottleneck.
- [ ] Define the right persistence adapter surface before adding more methods like `has`.

---

## COMPLETED / NON-PRIORITY

- [x] trim down persistence assertions
	- [x] I'll likely be able to do this by exporting premade persistence adapters; In Memory, Local Storage, Session Storage, and IndexedDB, and use the In Memory one as default. 
- [x] compress achievements and settings
- [x] only apply compression if it is enabled and the string is over 1kb
- [x] Reduce non-minifiable object prop names to 12 characters or less.
- [x] Convert to a monorepo for both the code and documentation (SolidStart ssg + pwa?)
	- Also link to the github Pages-hosted documentation via the library's readme.
- [x] Add tags to passages and query methods for passages based off their properties.
- [x] Add `getVisitCount` for determining how many times a passage has been navigated to.
- [x] Consider making the passage names optionally strongly typed?
- [-] ~~Consider using immer and it's patches for state management, since the current system may poorly perform for very large story state (e.g management sims)~~
  - No immer, cus it'll bloat up the bundle size real quick
- [x] Rename to "Choicekit" or smth 
- [x] Add a `once` param to the `TypedEventEmitter` and ensure to do the same with any wrappers in the entire monorepo
