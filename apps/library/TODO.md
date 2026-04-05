# TODO

---

## HIGH PRIORITY

- [x] Split up engine into minimal core (history, state, prng) + plugins (settings, achievements, storylet, persistence, etc)
- [x] Make the "vars" possible callback async
- [x] Add Storylet support
- [ ] Add external validation support via Standard Schema compatible solutions like zod, valibot, arktype, typebox, etc
- [ ] Consider exporting a base abstract class instead of an interface for all userland-compatible classes to extend from.
- [x] Rewrite the AI-generated test suite cus it's garbage.
- [ ] Add explicit tests for state compaction / engine state after 100s to 1000s / 10000s of navigations. The engine should support as much as possible without horrible perf degradation.
	- [ ] In fact, add tests for every config option.
- [x] For plugins with `withSave: true`, I should prolly store their state in the state snapshots of the engine, rather than just in the save data.

---

## MEDIUM PRIORITY

- [ ] Figure out the best way for adding passages
- [ ] Add a turn-based event system (i.e a way to have callbacks run after a certain number of "turns")
- [ ] Add more useful interactive fiction method helpers.
- [x] Add `getVisitCount` for determining how many times a passage has been navigated to.
- [ ] To save memory with large story state, maybe I should semi regularly flush caches??? Or smth.
- [ ] Add framework adapters (react, vue, svelte, solidjs, etc) for reactivity, or at the very least, show examples.
- [ ] Use maps instead of records were possible.
- [ ] Remove the redundant readmes in the `library` repo since `docs` is the single source of truth.

---

## LOW PRIORITY

- [ ] maybe tie autosaving to a custom setting instead of at the engine level
- [ ] introduce `has` for the persistence adapter
- [ ] Maybe some simple text templating? (i.e converting `You have {{ player.gold }} gold` to `You have 100 gold).
- [x] Add tags to passages and query methods for passages based off their properties.
- [ ] Consider a complementary **module-scoped** api in addition to the present **class-based** api. 
	- Functions internally and export them at the module scope as well as a class wrapper for those who prefer the ergonomics. Similar to how valibot and formisch work.
- [ ] Allow Choicekit class instances to provide a `.clone()` method for more efficient cloning, in comparison to the more expensive way of serializing and de-serializing.
- [ ] Make types better.
- [ ] Use `const` over `function` for better minifcation.
- [ ] Consider using [Craft](https://github.com/SylphxAI/craft) or [Mutative](https://github.com/unadlib/mutative) for more efficient snapshot generation via their patches.
- [ ] Add some form of save recovery.

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
