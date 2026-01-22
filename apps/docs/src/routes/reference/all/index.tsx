import type { JSX } from "solid-js";
import { createMemo, createSignal, For, Show } from "solid-js";

/**
 * This route renders an API Reference index by parsing the generated TypeDoc JSON.
 *
 * It is intentionally "data-driven": when `apps/docs/src/generated/docs.json` is regenerated,
 * rebuilding the docs app will automatically reflect those changes.
 *
 * Notes:
 * - This uses a static import so the JSON is bundled and available in SSR/build outputs.
 * - We keep parsing logic defensive because TypeDoc JSON can vary slightly by version/config.
 */
import typedocJson from "../../../generated/docs.json";

type TypeDocKindString = string;
type TypeDocID = number;

type TypeDocComment = {
	summary?: Array<{ kind?: string; text?: string }>;
	blockTags?: Array<{
		tag?: string;
		content?: Array<{ kind?: string; text?: string }>;
	}>;
};

type TypeDocSource = {
	fileName?: string;
	line?: number;
	character?: number;
	url?: string;
};

type TypeDocReflection = {
	id?: TypeDocID;
	name?: string;
	kind?: number;
	kindString?: TypeDocKindString;
	flags?: Record<string, unknown>;
	sources?: TypeDocSource[];
	comment?: TypeDocComment;
	signatures?: TypeDocReflection[];
	getSignature?: TypeDocReflection;
	setSignature?: TypeDocReflection;
	children?: TypeDocReflection[];
	typeParameters?: TypeDocReflection[];
	parameters?: TypeDocReflection[];
	type?: unknown;
};

type TypeDocProject = TypeDocReflection & {
	children?: TypeDocReflection[];
	groups?: Array<{ title?: string; children?: TypeDocID[] }>;
};

type ReferenceItem = {
	id: TypeDocID;
	name: string;
	kind: string;
	summary: string;
	source?: TypeDocSource;
};

function joinCommentText(nodes: Array<{ text?: string }> | undefined): string {
	if (!nodes || nodes.length === 0) return "";
	return nodes
		.map((n) => (typeof n.text === "string" ? n.text : ""))
		.join("")
		.trim();
}

function getSummary(r: TypeDocReflection): string {
	const summary = joinCommentText(r.comment?.summary);
	return summary;
}

function getBestSource(r: TypeDocReflection): TypeDocSource | undefined {
	if (r.sources && r.sources.length > 0) return r.sources[0];
	return undefined;
}

function guessKind(r: TypeDocReflection): string {
	// Prefer kindString when available; otherwise fall back to numeric kind.
	if (typeof r.kindString === "string" && r.kindString.trim())
		return r.kindString.trim();
	if (typeof r.kind === "number") return `Kind ${r.kind}`;
	return "Unknown";
}

function flattenReflections(
	root: TypeDocReflection | undefined,
): ReferenceItem[] {
	const out: ReferenceItem[] = [];
	const seen = new Set<number>();

	const walk = (node: TypeDocReflection | undefined) => {
		if (!node) return;

		// Collect the "primary" reflection itself when it looks like a named symbol.
		const id = node.id;
		const name = node.name;

		if (typeof id === "number" && typeof name === "string" && name.trim()) {
			if (!seen.has(id)) {
				seen.add(id);

				out.push({
					id,
					kind: guessKind(node),
					name,
					source: getBestSource(node),
					summary: getSummary(node),
				});
			}
		}

		// Also traverse other reflection-like fields TypeDoc uses.
		const children = node.children ?? [];
		for (const c of children) walk(c);

		if (node.signatures) {
			for (const s of node.signatures) walk(s);
		}

		// Accessors:
		if (node.getSignature) walk(node.getSignature);
		if (node.setSignature) walk(node.setSignature);

		// Params / generics often contain nested reflections worth scanning (e.g. inline types).
		if (node.parameters) {
			for (const p of node.parameters) walk(p);
		}
		if (node.typeParameters) {
			for (const tp of node.typeParameters) walk(tp);
		}
	};

	walk(root);
	return out;
}

function normalizeSearch(s: string): string {
	return s.trim().toLowerCase();
}

function sortByKindThenName(a: ReferenceItem, b: ReferenceItem): number {
	if (a.kind < b.kind) return -1;
	if (a.kind > b.kind) return 1;
	return a.name.localeCompare(b.name);
}

function groupByKind(
	items: ReferenceItem[],
): Array<{ kind: string; items: ReferenceItem[] }> {
	const map = new Map<string, ReferenceItem[]>();
	for (const item of items) {
		const list = map.get(item.kind) ?? [];
		list.push(item);
		map.set(item.kind, list);
	}

	return Array.from(map.entries())
		.map(([kind, kindItems]) => ({
			items: kindItems.sort((a, b) => a.name.localeCompare(b.name)),
			kind,
		}))
		.sort((a, b) => a.kind.localeCompare(b.kind));
}

function SourceChip(props: { source?: TypeDocSource }): JSX.Element {
	return (
		<Show when={props.source?.fileName}>
			<span
				style={{
					background: "rgba(127,127,127,0.15)",
					border: "1px solid rgba(127,127,127,0.25)",
					"border-radius": "999px",
					display: "inline-block",
					"font-size": "0.85em",
					padding: "0.1rem 0.45rem",
				}}
				title={[
					props.source?.fileName,
					typeof props.source?.line === "number"
						? `:${props.source?.line}`
						: "",
				].join("")}
			>
				{props.source?.fileName}
				<Show when={typeof props.source?.line === "number"}>
					{" : " + props.source?.line}
				</Show>
			</span>
		</Show>
	);
}

export default function ReferenceAllRoute(): JSX.Element {
	const project = typedocJson as unknown as TypeDocProject;

	const [query, setQuery] = createSignal("");

	const allItems = createMemo(() => {
		// TypeDoc JSON structure commonly has top-level `children`.
		// We flatten the whole project so this page is a one-stop listing.
		const items = flattenReflections(project);

		// Filter out some noisy/internal-ish items if needed. Keep it light and safe:
		// - TypeDoc emits `__type`/`__namedParameters` sometimes; those are not useful for browsing.
		const filtered = items.filter((i) => {
			if (!i.name) return false;
			if (i.name.startsWith("__")) return false;
			return true;
		});

		return filtered.sort(sortByKindThenName);
	});

	const filteredItems = createMemo(() => {
		const q = normalizeSearch(query());
		if (!q) return allItems();

		return allItems().filter((i) => {
			const hay = `${i.kind} ${i.name} ${i.summary}`.toLowerCase();
			return hay.includes(q);
		});
	});

	const grouped = createMemo(() => groupByKind(filteredItems()));

	return (
		<main style={{ "max-width": "72rem" }}>
			<header style={{ "margin-bottom": "1.5rem" }}>
				<h1 style={{ "margin-bottom": "0.25rem" }}>Reference</h1>
				<p style={{ "margin-top": 0, "max-width": "56rem" }}>
					This page is generated by parsing the TypeDoc JSON output at build
					time. It will update automatically when you regenerate{" "}
					<code>generated/docs.json</code> and rebuild the docs app.
				</p>

				<div
					style={{
						"align-items": "center",
						display: "flex",
						gap: "0.75rem",
						"margin-top": "1rem",
					}}
				>
					<label for="reference-search" style={{ "min-width": "7rem" }}>
						Search
					</label>
					<input
						id="reference-search"
						onInput={(e) => setQuery(e.currentTarget.value)}
						placeholder="Filter by name/kind/summary…"
						style={{
							background: "rgba(127,127,127,0.07)",
							border: "1px solid rgba(127,127,127,0.35)",
							"border-radius": "0.5rem",
							"max-width": "36rem",
							padding: "0.55rem 0.7rem",
							width: "100%",
						}}
						type="search"
						value={query()}
					/>
					<span
						style={{ "font-variant-numeric": "tabular-nums", opacity: 0.8 }}
					>
						{filteredItems().length} items
					</span>
				</div>
			</header>

			<Show
				fallback={
					<p>
						No results. If this seems wrong, confirm{" "}
						<code>apps/docs/src/generated/docs.json</code> exists and is
						up-to-date.
					</p>
				}
				when={grouped().length > 0}
			>
				<For each={grouped()}>
					{(group) => (
						<section style={{ "margin-bottom": "2rem" }}>
							<h2 style={{ "margin-bottom": "0.75rem" }}>{group.kind}</h2>

							<ul style={{ "list-style": "none", margin: 0, padding: 0 }}>
								<For each={group.items}>
									{(item) => (
										<li
											style={{
												"border-top": "1px solid rgba(127,127,127,0.18)",
												padding: "0.75rem 0",
											}}
										>
											<div
												style={{
													"align-items": "baseline",
													display: "flex",
													"flex-wrap": "wrap",
													gap: "0.75rem",
												}}
											>
												<a
													href={`/reference/symbol/${encodeURIComponent(item.name)}`}
												>
													<code>{item.name}</code>
												</a>
												<SourceChip source={item.source} />
											</div>

											<Show when={item.summary}>
												<p style={{ margin: "0.35rem 0 0", opacity: 0.9 }}>
													{item.summary}
												</p>
											</Show>
										</li>
									)}
								</For>
							</ul>
						</section>
					)}
				</For>
			</Show>
		</main>
	);
}
