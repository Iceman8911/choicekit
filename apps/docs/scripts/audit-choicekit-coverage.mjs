import fs from "node:fs";
import path from "node:path";

const docsRoot = process.cwd();
const apiRoot = path.join(docsRoot, "src/content/docs/reference/api");

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

function walkMarkdownFiles(dirPath) {
	const entries = fs.readdirSync(dirPath, { withFileTypes: true });
	const files = [];

	for (const entry of entries) {
		const nextPath = path.join(dirPath, entry.name);
		if (entry.isDirectory()) {
			files.push(...walkMarkdownFiles(nextPath));
			continue;
		}
		if (entry.isFile() && nextPath.endsWith(".md")) {
			files.push(nextPath);
		}
	}

	return files;
}

function getLinkTargets(content) {
	const targets = [];
	for (const match of content.matchAll(/\]\(([^)]+)\)/g)) {
		targets.push(match[1]?.trim() ?? "");
	}
	return targets;
}

function isInternalLink(target) {
	return Boolean(target) && !/^(https?:|mailto:|#|\/)/i.test(target);
}

function toRouteId(fromAbsolutePath) {
	const rel = path
		.relative(apiRoot, fromAbsolutePath)
		.split(path.sep)
		.join("/");
	const noExt = rel.replace(/\.md$/i, "");
	return noExt
		.split("/")
		.map((segment) => segment.toLowerCase())
		.join("/");
}

function resolveTargetRoute(fromRouteId, rawTarget) {
	const [pathAndQuery] = rawTarget.split("#");
	const [pathPart] = pathAndQuery.split("?");
	if (!pathPart) return "";

	const withoutExt = pathPart.replace(/\.md$/i, "");
	const fileDir = path.posix.dirname(fromRouteId);
	const resolved = path.posix.normalize(path.posix.join(fileDir, withoutExt));

	return resolved
		.replace(/\/$/, "")
		.split("/")
		.map((segment) => segment.toLowerCase())
		.join("/");
}

function validateApiLinks() {
	if (!fs.existsSync(apiRoot)) {
		return [
			{
				file: "src/content/docs/reference/api",
				target: "(directory missing)",
				reason: "API reference directory does not exist",
			},
		];
	}

	const markdownFiles = walkMarkdownFiles(apiRoot);
	const routeIds = new Set(
		markdownFiles.map((filePath) => toRouteId(filePath)),
	);
	const failures = [];

	for (const filePath of markdownFiles) {
		const content = fs.readFileSync(filePath, "utf8");
		const targets = getLinkTargets(content);
		const fromRouteId = toRouteId(filePath);

		for (const target of targets) {
			if (!isInternalLink(target)) continue;

			const targetRoute = resolveTargetRoute(fromRouteId, target);
			const hasMatch = targetRoute && routeIds.has(targetRoute);

			if (!hasMatch) {
				failures.push({
					file: path.relative(docsRoot, filePath),
					target,
					reason: "No matching markdown file for internal link target",
				});
			}
		}
	}

	return failures;
}

const missing = mustExist.filter(
	(rel) => !fs.existsSync(path.join(docsRoot, rel)),
);
const stillPresent = mustNotExist.filter((rel) =>
	fs.existsSync(path.join(docsRoot, rel)),
);
const linkFailures = validateApiLinks();

if (
	missing.length === 0 &&
	stillPresent.length === 0 &&
	linkFailures.length === 0
) {
	console.log("Coverage audit passed.");
	console.log(
		`Checked ${mustExist.length} required docs assets, ${mustNotExist.length} legacy exclusions, and API link integrity.`,
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
if (linkFailures.length > 0) {
	console.error("Broken internal API markdown links:");
	for (const failure of linkFailures.slice(0, 25)) {
		console.error(`- ${failure.file} -> ${failure.target} (${failure.reason})`);
	}
	if (linkFailures.length > 25) {
		console.error(`- ... and ${linkFailures.length - 25} more`);
	}
}
process.exit(1);
