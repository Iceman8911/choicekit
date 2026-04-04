import fs from "node:fs";
import path from "node:path";

const docsRoot = process.cwd();

const mustExist = [
	"src/content/docs/guides/index.mdx",
	"src/content/docs/guides/about.mdx",
	"src/content/docs/guides/choicekit/index.mdx",
	"src/content/docs/guides/choicekit/1-passage.mdx",
	"src/content/docs/guides/choicekit/2-state.mdx",
	"src/content/docs/guides/choicekit/3-save.mdx",
	"src/content/docs/guides/choicekit/4-migration.mdx",
	"src/content/docs/guides/choicekit/5-event.mdx",
	"src/content/docs/guides/choicekit/6-plugins.mdx",
	"src/content/docs/guides/choicekit/7-methods.mdx",
	"src/content/docs/guides/choicekit/adapter.mdx",
	"src/content/docs/guides/choicekit/classes.mdx",
	"src/content/docs/guides/choicekit/config.mdx",
	"src/content/docs/guides/choicekit/prng.mdx",
	"src/content/docs/guides/choicekit/typescript.mdx",
	"src/content/docs/reference/api/README.md",
	"src/content/docs/reference/api/classes/ChoicekitEngine.md",
	"src/content/docs/reference/api/classes/ChoicekitEngineBuilder.md",
	"src/content/docs/reference/api/functions/createAchievementsPlugin.md",
	"src/content/docs/reference/api/functions/createSettingsPlugin.md",
	"src/content/docs/reference/api/functions/definePlugin.md",
	"src/content/docs/reference/api/variables/InMemoryPersistenceAdapter.md",
	"src/content/docs/reference/api/variables/IndexedDbPersistenceAdapter.md",
	"src/content/docs/reference/api/variables/LocalStoragePersistenceAdapter.md",
	"src/content/docs/reference/api/variables/SessionStoragePersistenceAdapter.md",
];

const mustNotExist = [
	"src/pages/reference.astro",
	"src/pages/reference/all/index.astro",
	"src/pages/reference/id/[id].astro",
	"src/pages/reference/symbol/[name].astro",
	"src/lib/typedoc-data.ts",
	"src/generated/docs.json",
];

const missing = mustExist.filter(
	(rel) => !fs.existsSync(path.join(docsRoot, rel)),
);
const stillPresent = mustNotExist.filter((rel) =>
	fs.existsSync(path.join(docsRoot, rel)),
);

if (missing.length === 0 && stillPresent.length === 0) {
	console.log("Coverage audit passed.");
	console.log(
		`Checked ${mustExist.length} required docs assets and ${mustNotExist.length} legacy exclusions.`,
	);
	process.exit(0);
}

console.error("Coverage audit failed.");
if (missing.length > 0) {
	console.error("Missing required docs assets:");
	for (const item of missing) console.error(`- ${item}`);
}
if (stillPresent.length > 0) {
	console.error("Legacy assets still present:");
	for (const item of stillPresent) console.error(`- ${item}`);
}
process.exit(1);
