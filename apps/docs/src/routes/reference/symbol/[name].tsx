import { useParams } from "@solidjs/router";
import { createMemo, For, type JSX, Show } from "solid-js";

/**
 * Dynamic Reference route:
 * - URL: /reference/symbol/:name
 * - Reads from the generated TypeDoc JSON and looks up reflections by `name`.
 *
 * This is intentionally data-driven: regenerate `src/generated/docs.json` with TypeDoc,
 * rebuild the docs app, and the reference updates automatically.
 */
import typedocJson from "../../../generated/docs.json";

type TypeDocTextNode = { kind?: string; text?: string };

type TypeDocComment = {
	summary?: TypeDocTextNode[];
	blockTags?: Array<{
		tag?: string;
		content?: TypeDocTextNode[];
	}>;
};

type TypeDocSource = {
	fileName?: string;
	line?: number;
	character?: number;
	url?: string;
};

type TypeDocType =
	| {
			type: string;
			name?: string;
			value?: string;
			operator?: string;
			target?: unknown;
			elementType?: unknown;
			types?: unknown[];
			declaration?: unknown;
	  }
	| unknown;

type TypeDocReflection = {
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

	type?: TypeDocType;
};

type TypeDocProject = TypeDocReflection & {
	children?: TypeDocReflection[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function joinText(nodes: TypeDocTextNode[] | undefined): string {
	if (!nodes?.length) return "";
	return nodes
		.map((n) => (typeof n.text === "string" ? n.text : ""))
		.join("")
		.trim();
}

function normalize(s: string): string {
	return s.trim().toLowerCase();
}

function bestSource(r: TypeDocReflection): TypeDocSource | undefined {
	return r.sources?.[0];
}

function readableKind(r: TypeDocReflection): string {
	if (typeof r.kindString === "string" && r.kindString.trim())
		return r.kindString.trim();
	if (typeof r.kind === "number") return `Kind ${r.kind}`;
	return "Unknown";
}

function renderTypeInline(t: unknown): string {
	if (!t) return "";
	if (!isRecord(t)) return "";
	if (typeof t.type !== "string") return "";

	// Keep this conservative: TypeDoc type payloads can vary a lot.
	// Provide something useful without inventing structure.
	const kind = t.type;
	if (kind === "intrinsic" && typeof t.name === "string") return t.name;
	if (kind === "reference" && typeof t.name === "string") return t.name;
	if (kind === "literal" && typeof t.value === "string")
		return JSON.stringify(t.value);
	if (kind === "literal" && typeof t.value === "number") return String(t.value);
	if (kind === "literal" && typeof t.value === "boolean")
		return String(t.value);
	if (kind === "array") return `${renderTypeInline(t.elementType)}[]`;
	if (kind === "union" && Array.isArray(t.types)) {
		const parts = t.types.map((x) => renderTypeInline(x)).filter(Boolean);
		return parts.join(" | ");
	}
	if (kind === "intersection" && Array.isArray(t.types)) {
		const parts = t.types.map((x) => renderTypeInline(x)).filter(Boolean);
		return parts.join(" & ");
	}
	if (kind === "tuple" && Array.isArray(t.elements)) {
		// Some TypeDoc variants use `elements`; keep it best-effort.
		const els = (t.elements as unknown[])
			.map((x) => renderTypeInline(x))
			.filter(Boolean);
		return `[${els.join(", ")}]`;
	}

	// Fallback to the kind itself if we can't do better.
	return kind;
}

function flatten(root: TypeDocReflection | undefined): TypeDocReflection[] {
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

export default function ReferenceSymbolRoute(): JSX.Element {
	const params = useParams<{ name: string }>();

	const requestedName = createMemo(() => {
		// `useParams()` already decodes, but keep this defensive.
		const raw = typeof params.name === "string" ? params.name : "";
		try {
			return decodeURIComponent(raw);
		} catch {
			return raw;
		}
	});

	const project = typedocJson as unknown as TypeDocProject;

	const matches = createMemo(() => {
		const wanted = normalize(requestedName());
		if (!wanted) return [];

		const all = flatten(project);

		// Match by exact normalized name.
		const exact = all.filter(
			(r) => typeof r.name === "string" && normalize(r.name) === wanted,
		);

		// If no exact matches, fall back to contains match so the route is still useful.
		if (exact.length > 0) return exact;

		return all.filter(
			(r) => typeof r.name === "string" && normalize(r.name).includes(wanted),
		);
	});

	return (
		<main style={{ "max-width": "72rem" }}>
			<header style={{ "margin-bottom": "1.25rem" }}>
				<h1 style={{ "margin-bottom": "0.25rem" }}>
					Reference: <code>{requestedName()}</code>
				</h1>
				<p style={{ margin: 0, opacity: 0.85 }}>
					Generated from <code>apps/docs/src/generated/docs.json</code>
				</p>
			</header>

			<Show
				fallback={
					<section>
						<p>
							No symbols found for <code>{requestedName()}</code>.
						</p>
						<p style={{ opacity: 0.85 }}>
							Tips: confirm the symbol is exported from the package entrypoint,
							then regenerate TypeDoc and rebuild the docs app.
						</p>
					</section>
				}
				when={matches().length > 0}
			>
				<For each={matches()}>
					{(r) => {
						const summary = joinText(r.comment?.summary);
						const source = bestSource(r);
						const typePreview = renderTypeInline(r.type);

						return (
							<article
								style={{
									background: "rgba(127,127,127,0.04)",
									border: "1px solid rgba(127,127,127,0.18)",
									"border-radius": "0.75rem",
									"margin-bottom": "1rem",
									padding: "1rem",
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
									<div style={{ "font-size": "1.1rem" }}>
										<code>
											{typeof r.name === "string" ? r.name : "(unnamed)"}
										</code>
									</div>
									<span style={{ opacity: 0.8 }}>{readableKind(r)}</span>
									<Show when={typeof r.id === "number"}>
										<span style={{ opacity: 0.7 }}>id: {r.id}</span>
									</Show>
								</div>

								<Show when={summary}>
									<p style={{ margin: "0.6rem 0 0" }}>{summary}</p>
								</Show>

								<Show when={typePreview}>
									<p style={{ margin: "0.6rem 0 0", opacity: 0.9 }}>
										<strong>Type:</strong> <code>{typePreview}</code>
									</p>
								</Show>

								<Show when={source?.fileName}>
									<p style={{ margin: "0.6rem 0 0", opacity: 0.9 }}>
										<strong>Source:</strong>{" "}
										<code>
											{source?.fileName}
											{typeof source?.line === "number"
												? `:${source.line}`
												: ""}
										</code>
										<Show when={source?.url}>
											{" "}
											<a href={source?.url} rel="noreferrer" target="_blank">
												(view)
											</a>
										</Show>
									</p>
								</Show>

								<Show when={r.comment?.blockTags?.length}>
									<div style={{ margin: "0.75rem 0 0" }}>
										<strong>Tags</strong>
										<ul
											style={{
												margin: "0.4rem 0 0",
												"padding-left": "1.25rem",
											}}
										>
											<For each={r.comment?.blockTags ?? []}>
												{(tag) => (
													<li>
														<code>{tag.tag ?? "@tag"}</code>
														<Show when={joinText(tag.content)}>
															{" — "}
															<span>{joinText(tag.content)}</span>
														</Show>
													</li>
												)}
											</For>
										</ul>
									</div>
								</Show>
							</article>
						);
					}}
				</For>
			</Show>
		</main>
	);
}
