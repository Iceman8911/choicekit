import { useParams } from "@solidjs/router";
import type { JSX } from "solid-js";
import { createMemo, For, Show } from "solid-js";

import typedocJson from "~/generated/docs.json";

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

	type?: unknown;
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

function readableKind(r: TypeDocReflection): string {
	if (typeof r.kindString === "string" && r.kindString.trim())
		return r.kindString.trim();
	if (typeof r.kind === "number") return `Kind ${r.kind}`;
	return "Unknown";
}

function bestSource(r: TypeDocReflection): TypeDocSource | undefined {
	return r.sources?.[0];
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

function renderTypeInline(t: unknown): string {
	if (!t) return "";
	if (!isRecord(t)) return "";
	if (typeof t.type !== "string") return "";

	const kind = t.type;

	// Best-effort preview for common TypeDoc type nodes.
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

	// Fallback to the kind itself.
	return kind;
}

export default function ReferenceByIdRoute(): JSX.Element {
	const params = useParams<{ id: string }>();
	const project = typedocJson as unknown as TypeDocProject;

	const requestedId = createMemo(() => {
		const raw = typeof params.id === "string" ? params.id : "";
		// Accept only base-10 integers.
		const parsed = Number.parseInt(raw, 10);
		return Number.isFinite(parsed) ? parsed : null;
	});

	const matches = createMemo(() => {
		const id = requestedId();
		if (id === null) return [];
		return flatten(project)
			.filter((r) => typeof r.id === "number" && r.id === id)
			.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
	});

	return (
		<main style={{ "max-width": "72rem" }}>
			<header style={{ "margin-bottom": "1.25rem" }}>
				<h1 style={{ "margin-bottom": "0.25rem" }}>
					Reference: id <code>{requestedId() ?? "(invalid)"}</code>
				</h1>
				<p style={{ margin: 0, opacity: 0.85 }}>
					Generated from <code>apps/docs/src/generated/docs.json</code>
				</p>
			</header>

			<Show
				fallback={
					<section>
						<p>
							Invalid id:{" "}
							<code>{typeof params.id === "string" ? params.id : ""}</code>
						</p>
						<p style={{ opacity: 0.85 }}>
							Expected a numeric TypeDoc reflection id (for example:{" "}
							<code>/reference/id/1234</code>).
						</p>
					</section>
				}
				when={requestedId() !== null}
			>
				<Show
					fallback={
						<section>
							<p>
								No reflection found for id <code>{requestedId() ?? ""}</code>.
							</p>
							<p style={{ opacity: 0.85 }}>
								Tip: visit <a href="/reference/all">/reference/all</a> and click
								an item to get a valid id.
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

									<Show
										when={
											typeof r.name === "string" && r.name.trim().length > 0
										}
									>
										<p style={{ margin: "0.75rem 0 0" }}>
											<a
												href={`/reference/symbol/${encodeURIComponent(r.name!)}`}
											>
												View by name: <code>{r.name}</code>
											</a>
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
			</Show>
		</main>
	);
}
