export type TypeDocTextNode = { kind?: string; text?: string };

export type TypeDocComment = {
	summary?: TypeDocTextNode[];
	blockTags?: Array<{
		tag?: string;
		content?: TypeDocTextNode[];
	}>;
};

export type TypeDocSource = {
	fileName?: string;
	line?: number;
	character?: number;
	url?: string;
};

export type TypeDocReflection = {
	id?: number;
	name?: string;
	kind?: number;
	kindString?: string;
	flags?: Record<string, unknown>;
	comment?: TypeDocComment;
	sources?: TypeDocSource[];

	children?: TypeDocReflection[];
	signatures?: TypeDocReflection[];
	getSignature?: TypeDocReflection;
	setSignature?: TypeDocReflection;
	parameters?: TypeDocReflection[];
	typeParameters?: TypeDocReflection[];

	type?: unknown;
};

export type TypeDocProject = TypeDocReflection & {
	children?: TypeDocReflection[];
	groups?: Array<{ title?: string; children?: number[] }>;
};

export type ReferenceItem = {
	id: number;
	name: string;
	kind: string;
	summary: string;
	source?: TypeDocSource;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export function joinText(nodes: TypeDocTextNode[] | undefined): string {
	if (!nodes?.length) return "";
	return nodes
		.map((n) => (typeof n.text === "string" ? n.text : ""))
		.join("")
		.trim();
}

export function readableKind(r: TypeDocReflection): string {
	if (typeof r.kindString === "string" && r.kindString.trim())
		return r.kindString.trim();
	if (typeof r.kind === "number") return `Kind ${r.kind}`;
	return "Unknown";
}

export function bestSource(r: TypeDocReflection): TypeDocSource | undefined {
	return r.sources?.[0];
}

export function flattenReflections(
	root: TypeDocReflection | undefined,
): TypeDocReflection[] {
	if (!root) return [];
	const out: TypeDocReflection[] = [];
	const stack: TypeDocReflection[] = [root];

	while (stack.length) {
		const node = stack.pop();
		if (!node) continue;
		out.push(node);

		if (node.children?.length) stack.push(...node.children);
		if (node.signatures?.length) stack.push(...node.signatures);
		if (node.getSignature) stack.push(node.getSignature);
		if (node.setSignature) stack.push(node.setSignature);
		if (node.parameters?.length) stack.push(...node.parameters);
		if (node.typeParameters?.length) stack.push(...node.typeParameters);
	}

	return out;
}

export function renderTypeInline(t: unknown): string {
	if (!t) return "";
	if (!isRecord(t)) return "";
	if (typeof t.type !== "string") return "";

	const kind = t.type;

	if (kind === "intrinsic" && typeof t.name === "string") return t.name;
	if (kind === "reference" && typeof t.name === "string") return t.name;

	if (kind === "literal") {
		const v = (t as Record<string, unknown>).value;
		if (typeof v === "string") return JSON.stringify(v);
		if (typeof v === "number") return String(v);
		if (typeof v === "boolean") return String(v);
	}

	if (kind === "array") {
		return `${renderTypeInline((t as Record<string, unknown>).elementType)}[]`;
	}

	if (kind === "union") {
		const types = (t as Record<string, unknown>).types;
		if (Array.isArray(types)) {
			const parts = types.map((x) => renderTypeInline(x)).filter(Boolean);
			return parts.join(" | ");
		}
	}

	if (kind === "intersection") {
		const types = (t as Record<string, unknown>).types;
		if (Array.isArray(types)) {
			const parts = types.map((x) => renderTypeInline(x)).filter(Boolean);
			return parts.join(" & ");
		}
	}

	return kind;
}

export function createReferenceItems(project: TypeDocProject): ReferenceItem[] {
	const out: ReferenceItem[] = [];
	const seen = new Set<number>();

	for (const r of flattenReflections(project)) {
		const id = r.id;
		const name = r.name;

		if (typeof id !== "number" || !Number.isFinite(id)) continue;
		if (typeof name !== "string" || !name.trim()) continue;
		if (name.startsWith("__")) continue;

		if (seen.has(id)) continue;
		seen.add(id);

		out.push({
			id,
			kind: readableKind(r),
			name,
			source: bestSource(r),
			summary: joinText(r.comment?.summary),
		});
	}

	out.sort((a, b) => {
		if (a.kind < b.kind) return -1;
		if (a.kind > b.kind) return 1;
		return a.name.localeCompare(b.name);
	});

	return out;
}

export async function loadTypeDocProject(): Promise<TypeDocProject> {
	const json = (await import("../generated/docs.json")).default;
	return json as unknown as TypeDocProject;
}
