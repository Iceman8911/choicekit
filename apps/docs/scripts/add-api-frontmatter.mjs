import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_DIR = new URL("../src/content/docs/reference/api/", import.meta.url);

async function walk(dirPath) {
	const entries = await fs.readdir(dirPath, { withFileTypes: true });
	const files = [];

	for (const entry of entries) {
		const nextPath = path.join(dirPath, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await walk(nextPath)));
			continue;
		}
		if (entry.isFile() && nextPath.endsWith(".md")) {
			files.push(nextPath);
		}
	}

	return files;
}

function cleanTitle(rawHeading) {
	return rawHeading
		.replace(/^#+\s*/, "")
		.replace(/`/g, "")
		.replace(/\\/g, "")
		.trim();
}

function cleanDescription(text) {
	return text.replace(/\s+/g, " ").trim();
}

function yamlEscapeSingleQuoted(value) {
	return value.replace(/'/g, "''");
}

function normalizeApiLinkTarget(target) {
	const [pathAndQuery, hash = ""] = target.split("#");
	const [pathPart, query = ""] = pathAndQuery.split("?");
	if (!pathPart || pathPart === "." || pathPart === "..") return target;
	if (/^(https?:|mailto:|\/)/i.test(pathPart)) return target;

	const normalizedPath = pathPart
		.split("/")
		.map((segment) => {
			if (!segment || segment === "." || segment === "..") return segment;
			const withoutExt = segment.replace(/\.md$/i, "");
			return withoutExt.toLowerCase();
		})
		.join("/");

	const withQuery = query ? `${normalizedPath}?${query}` : normalizedPath;
	return hash ? `${withQuery}#${hash}` : withQuery;
}

function normalizeMarkdownLinks(content) {
	return content.replace(/\]\(([^)]+)\)/g, (match, rawTarget) => {
		const target = rawTarget.trim();
		if (!target || /^(https?:|mailto:|#)/i.test(target)) return match;
		const normalized = normalizeApiLinkTarget(target);
		return `](${normalized})`;
	});
}

function extractHeading(content) {
	const headingMatch = content.match(/^#\s+(.+)$/m);
	if (!headingMatch?.[1]) return "API Reference";
	return cleanTitle(headingMatch[1]);
}

function extractDescription(content) {
	const lines = content.split(/\r?\n/);
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		if (trimmed.startsWith("#")) continue;
		if (trimmed.startsWith("Defined in:")) continue;
		if (trimmed.startsWith("***")) continue;
		if (trimmed.startsWith("- [")) continue;
		return cleanDescription(trimmed);
	}
	return "Generated API reference for Choicekit.";
}

async function addFrontmatter(filePath) {
	const rawContent = await fs.readFile(filePath, "utf8");
	const content = normalizeMarkdownLinks(rawContent);

	if (content.startsWith("---\n")) {
		if (content !== rawContent) {
			await fs.writeFile(filePath, content, "utf8");
		}
		return;
	}

	const title = extractHeading(content);
	const description = extractDescription(content);

	const frontmatter = [
		"---",
		`title: '${yamlEscapeSingleQuoted(title)}'`,
		`description: '${yamlEscapeSingleQuoted(description)}'`,
		"---",
		"",
	].join("\n");

	await fs.writeFile(filePath, frontmatter + content, "utf8");
}

async function main() {
	const apiDirPath = fileURLToPath(API_DIR);
	const files = await walk(apiDirPath);
	await Promise.all(files.map((filePath) => addFrontmatter(filePath)));
	console.log(`Added frontmatter to ${files.length} API markdown files.`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
