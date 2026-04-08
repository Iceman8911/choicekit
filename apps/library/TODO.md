# TODO

---

## HIGH PRIORITY

- [x] Add regression tests for save/load, passage navigation, and large-history performance.

---

## MEDIUM PRIORITY

- [ ] Define a passage authoring and registration workflow.
- [ ] Add a turn-based event system for delayed callbacks.
- [x] Add `getVisitCount` for determining how many times a passage has been navigated to.
- [ ] Add a focused set of interactive fiction helper plugins.
	- [ ] Add examples for conditional passages, branch filtering, and stat checks.
	- [ ] Document passage data types and custom serialization constraints.
- [ ] Add framework adapters or example bindings for react, vue, svelte, and solidjs.
- [ ] Detect and surface plugin dependency cycles during plugin mounting.
	- [ ] Keep this warning-based for now; revisit strict failure once `onOverride` semantics are cleaner.
- [x] Use maps instead of records where possible.
- [x] Remove the redundant readmes in the `library` repo since `docs` is the single source of truth.
- [x] Add an example cache adapter or lightweight cache package.
- [ ] See if bundle size reductions can be achieved without losing functionality or ergonomics.
- [ ] Add clearer choice and branch helpers for interactive fiction UI layers.

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
