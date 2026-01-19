# TODO

- [ ] Figure out the best way for adding passages
- [ ] trim down persistence assertions
- [x] compress achievements and settings
- [x] only apply compression if it is enabled and the string is over 1kb
- [ ] maybe tie autosaving to a custom setting instead of at the engine level
- [ ] introduce `has` for the persistence adapter
- [ ] Consider a complementary **module-scoped** api in addition to the present **class-based** api. 
	- Functions internally and export them at the module scope as well as a class wrapper for those who prefer the ergonomics. 
- [x] Reduce non-minifiable object prop names to 12 characters or less.
- [x] Convert to a monorepo for both the code and documentation (SolidStart ssg + pwa?)
	- Also link to the github Pages-hosted documentation via the library's readme.
- [ ] Add more useful interactive fiction method helpers.
	- [x] Add tags to passages and query methods for passages based off their properties.
	- [ ] Maybe some simple text templating? (i.e converting `You have {{ player.gold }} gold` to `You have 100 gold).
		- Although I'm not sure how much use this has.
	- [ ] Add a turn-based event system (i.e a way to have callbacks run after a certain number of "turns")
	- [ ] Add Storylet support.