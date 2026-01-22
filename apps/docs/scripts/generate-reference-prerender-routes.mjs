/**
 * Generates a prerender route list for the docs app's Reference section.
 *
 * Goal:
 * - Prerender `/reference/all`
 * - Prerender `/reference/id/:id` for "public/exported" symbols (best-effort)
 *
 * Output:
 * - Writes JSON array to `apps/docs/src/generated/reference-prerender-routes.json`
 *
 * Usage (from repo root):
 *   node apps/docs/scripts/generate-reference-prerender-routes.mjs
 *
 * Environment variables:
 * - TYPEDOC_JSON_PATH: override TypeDoc JSON path (default: apps/docs/src/generated/docs.json)
 * - OUTPUT_PATH: override output path (default: apps/docs/src/generated/reference-prerender-routes.json)
 * - MAX_ROUTES: optional integer cap after filtering (default: unlimited)
 *
 * Notes:
 * - We intentionally prefer `/reference/id/:id` over `/reference/symbol/:name` because names can collide.
 * - "Public/exported" is inferred. TypeDoc emits many internal reflections; we filter aggressively while
 *   staying robust to JSON shape differences.
 */

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, "../../..");

const DEFAULT_TYPEDOC_JSON = path.join(
	REPO_ROOT,
	"apps/docs/src/generated/docs.json",
);

const DEFAULT_OUTPUT = path.join(
	REPO_ROOT,
	"apps/docs/src/generated/reference-prerender-routes.json",
);

const typedocJsonPath = path.resolve(
	REPO_ROOT,
	process.env.TYPEDOC_JSON_PATH ?? "apps/docs/src/generated/docs.json",
);

const outputPath = path.resolve(
	REPO_ROOT,
	process.env.OUTPUT_PATH ??
		"apps/docs/src/generated/reference-prerender-routes.json",
);

const maxRoutesEnv = process.env.MAX_ROUTES;
const maxRoutes =
	typeof maxRoutesEnv === "string" && maxRoutesEnv.trim()
		? Number.parseInt(maxRoutesEnv, 10)
		: null;

function isRecord(value) {
	return typeof value === "object" && value !== null;
}

function normalizeName(name) {
	return String(name ?? "").trim();
}

function hasOwn(obj, key) {
	return Object.prototype.hasOwnProperty.call(obj, key);
}

function* walkReflections(root) {
	// Iterative DFS to avoid call-stack issues on large TypeDoc JSON
	const stack = [];
	if (root) stack.push(root);

	while (stack.length) {
		const node = stack.pop();
		if (!isRecord(node)) continue;

		yield node;

		// Common child containers
		const children = node.children;
		if (Array.isArray(children)) {
			for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
		}

		const signatures = node.signatures;
		if (Array.isArray(signatures)) {
			for (let i = signatures.length - 1; i >= 0; i--) stack.push(signatures[i]);
		}

		if (node.getSignature) stack.push(node.getSignature);
		if (node.setSignature) stack.push(node.setSignature);

		const parameters = node.parameters;
		if (Array.isArray(parameters)) {
			for (let i = parameters.length - 1; i >= 0; i--) stack.push(parameters[i]);
		}

		const typeParameters = node.typeParameters;
		if (Array.isArray(typeParameters)) {
			for (let i = typeParameters.length - 1; i >= 0; i--) stack.push(typeParameters[i]);
		}
	}
}

/**
 * Best-effort: determine whether a reflection is likely part of the public/exported API.
 *
 * Heuristics (kept conservative):
 * - must have numeric `id` and non-empty `name`
 * - exclude internal-ish names: starting with "__" or containing "__namedParameters"
 * - exclude obvious non-API containers: "Project" itself, unnamed, etc.
 * - favor items the project groups mention (when groups exist)
 */
function isCandidatePublicSymbol(reflection, groupIdSet) {
	if (!isRecord(reflection)) return false;

	const id = reflection.id;
	const name = normalizeName(reflection.name);

	if (typeof id !== "number" || !Number.isFinite(id)) return false;
	if (!name) return false;

	// Internal / noise
	if (name.startsWith("__")) return false;
	if (name.includes("__namedParameters")) return false;

	// If TypeDoc groups exist, treat group membership as the strongest signal.
	if (groupIdSet && groupIdSet.size > 0) {
		return groupIdSet.has(id);
	}

	// Otherwise, a conservative fallback: only include reflections that have a kindString
	// (signals a meaningful declaration) and are not obviously parameter-only.
	if (typeof reflection.kindString === "string" && reflection.kindString.trim()) {
		const kind = reflection.kindString.trim();
		// These are typically useful public declarations.
		return [
			"Class",
			"Interface",
			"Function",
			"Variable",
			"Enum",
			"Type alias",
			"Namespace",
			"Module",
		].includes(kind);
	}

	return false;
}

function collectGroupIds(project) {
	// TypeDoc JSON often has `groups: [{ title, children: [id, ...] }, ...]`
	// Those children IDs are typically "exported surface" for the entry.
	if (!isRecord(project)) return new Set();
	const groups = project.groups;
	if (!Array.isArray(groups)) return new Set();

	const ids = new Set();
	for (const g of groups) {
		if (!isRecord(g)) continue;
		const children = g.children;
		if (!Array.isArray(children)) continue;
		for (const id of children) if (typeof id === "number") ids.add(id);
	}
	return ids;
}

async function readJson(jsonPath) {
	const raw = await fs.readFile(jsonPath, "utf8");
	// TypeDoc JSON is standard JSON (not JSONC), so JSON.parse is fine.
	return JSON.parse(raw);
}

function uniqueSortedRoutes(routes) {
	const set = new Set(routes);
	return Array.from(set).sort((a, b) => a.localeCompare(b));
}

async function main() {
	// Helpful error messages
	const existsTypedoc = await fs
		.access(typedocJsonPath)
		.then(() => true)
		.catch(() => false);

	if (!existsTypedoc) {
		throw new Error(
			[
				`TypeDoc JSON not found at: ${typedocJsonPath}`,
				`Expected default at: ${DEFAULT_TYPEDOC_JSON}`,
				`Generate it first (your typedoc build step should write docs.json there).`,
			].join("\n"),
		);
	}

	const json = await readJson(typedocJsonPath);

	// The top-level object is usually the project reflection.
	const project = json;

	const groupIds = collectGroupIds(project);

	const publicIds = new Set();
	for (const r of walkReflections(project)) {
		if (isCandidatePublicSymbol(r, groupIds)) {
			publicIds.add(r.id);
		}
	}

	const routes = ["/reference", "/reference/all", ...Array.from(publicIds, (id) => `/reference/id/${id}`)];

	const finalRoutes = uniqueSortedRoutes(routes);

	const limitedRoutes =
		typeof maxRoutes === "number" && Number.isFinite(maxRoutes) && maxRoutes > 0
			? finalRoutes.slice(0, maxRoutes)
			: finalRoutes;

	await fs.mkdir(path.dirname(outputPath), { recursive: true });
	await fs.writeFile(outputPath, JSON.stringify(limitedRoutes, null, 2) + "\n", "utf8");

	// eslint-disable-next-line no-console
	console.log(
		[
			`Generated reference prerender routes.`,
			`TypeDoc: ${typedocJsonPath}`,
			`Output: ${outputPath}`,
			`Routes: ${limitedRoutes.length}${limitedRoutes.length !== finalRoutes.length ? ` (capped from ${finalRoutes.length})` : ""}`,
			`Group-based export inference: ${groupIds.size > 0 ? "yes" : "no"}`,
		].join("\n"),
	);
}

main().catch((err) => {
	// eslint-disable-next-line no-console
	console.error(err);
	process.exitCode = 1;
});
