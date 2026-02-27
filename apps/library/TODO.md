# TODO

---

## HIGH PRIORITY

- [ ] Split up engine into minimal core (history, state, prng) + plugins (settings, achievements, storylet, persistence, etc)
- [ ] Make the "vars" possible callback async
- [ ] Add Storylet support
- [ ] Add external validation support via Standard Schema compatible solutions like zod, valibot, arktype, typebox, etc
- [ ] Consider exporting a base abstract class instead of an interface for all userland-compatible classes to extend from.
- [ ] Rewrite the AI-generated test suite cus it's garbage.

---

## MEDIUM PRIORITY

- [ ] Figure out the best way for adding passages
- [ ] Add a turn-based event system (i.e a way to have callbacks run after a certain number of "turns")
- [ ] Add more useful interactive fiction method helpers.
- [ ] Add `getVisitCount` for determining how many times a passage has been navigated to.
- [ ] To save memory with large story state, maybe I should semi regularly flush caches??? Or smth.

---

## LOW PRIORITY

- [ ] maybe tie autosaving to a custom setting instead of at the engine level
- [ ] introduce `has` for the persistence adapter
- [ ] Maybe some simple text templating? (i.e converting `You have {{ player.gold }} gold` to `You have 100 gold).
- [ ] Add tags to passages and query methods for passages based off their properties.
- [ ] Consider a complementary **module-scoped** api in addition to the present **class-based** api. 
	- Functions internally and export them at the module scope as well as a class wrapper for those who prefer the ergonomics. Similar to how valibot and formisch work.

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
