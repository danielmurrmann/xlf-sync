import type { MessageEntry, ParsedXlf } from "../../types/model.js";
import {
	orderedChildElements,
	orderedElementChildren,
	orderedNodesToInnerXml,
} from "./inline-xml.js";

function asArray<T>(v: T | T[] | undefined | null): T[] {
	if (!v) return [];
	return Array.isArray(v) ? v : [v];
}

export function parseV20(doc: unknown, orderedDoc?: unknown): ParsedXlf {
	const entries = new Map<string, MessageEntry>();
	const duplicates: string[] = [];
	const inlineSegmentsByUnit = orderedDoc
		? collectInlineSegmentsByUnit(orderedDoc)
		: new Map<string, Array<{ sourceXml: string; targetXml?: string }>>();

	const d = doc as { xliff: any };
	const xliff = d.xliff;
	const locale = xliff?.["@_trgLang"]; // optional

	const file = xliff.file;
	if (!file) throw new Error("Invalid XLF 2.0: missing <file>");

	const units = asArray(file.unit);
	for (const unit of units) {
		const unitId = unit?.["@_id"];
		if (!unitId) continue;

		if (entries.has(unitId)) {
			duplicates.push(unitId);
		}

		// Custom attributes
		const attributes: Record<string, string> = {};
		for (const [k, v] of Object.entries(unit)) {
			if (k.startsWith("@_") && k !== "@_id") {
				attributes[k] = String(v);
			}
		}

		// Notes
		const notesWrapper = unit.notes;
		const notes = notesWrapper
			? asArray(notesWrapper.note).map((n: Record<string, unknown>) => ({
				content: toXmlText(n),
				category: (n?.["@_category"] as string) ?? undefined,
				id: (n?.["@_id"] as string) ?? undefined,
				priority: (n?.["@_priority"] as string) ?? undefined,
			}))
			: [];

		const segments = asArray(unit.segment);
		const inlineSegments = inlineSegmentsByUnit.get(unitId);
		// Angular exports usually have one segment, but support many
		segments.forEach((seg, idx) => {
			const source = seg?.source ?? "";
			const target = seg?.target;
			const inlineSegment = inlineSegments?.[idx];

			const key = segments.length > 1 ? `${unitId}:${idx}` : unitId;

			// Ideally we'd only attach notes to the first segment if we split,
			// but for safety/sync we attach to all derived entries.
			entries.set(key, {
				key,
				sourceXml: inlineSegment?.sourceXml ?? toXmlText(source),
				targetXml:
					target !== undefined
						? inlineSegment?.targetXml ?? toXmlText(target)
						: undefined,
				attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
				notes: notes.length > 0 ? notes : undefined,
			});
		});
	}

	return {
		version: "2.0",
		locale,
		entries,
		duplicates: duplicates.length > 0 ? duplicates : undefined,
		raw: doc,
	};
}

function collectInlineSegmentsByUnit(
	orderedDoc: unknown,
): Map<string, Array<{ sourceXml: string; targetXml?: string }>> {
	const inlineSegmentsByUnit = new Map<string, Array<{ sourceXml: string; targetXml?: string }>>();
	const xliff = orderedChildElements(orderedDoc, "xliff")[0];
	if (!xliff) {
		return inlineSegmentsByUnit;
	}

	for (const file of orderedChildElements(orderedElementChildren(xliff, "xliff"), "file")) {
		for (const unit of orderedChildElements(orderedElementChildren(file, "file"), "unit")) {
			const unitId = unit[":@"] && typeof unit[":@"] === "object"
				? (unit[":@"] as Record<string, unknown>)["@_id"]
				: undefined;
			if (!unitId) {
				continue;
			}

			const segments = orderedChildElements(orderedElementChildren(unit, "unit"), "segment").map((segment) => {
				const children = orderedElementChildren(segment, "segment");
				const source = orderedChildElements(children, "source")[0];
				const target = orderedChildElements(children, "target")[0];

				return {
					sourceXml: source ? orderedNodesToInnerXml(orderedElementChildren(source, "source")) : "",
					targetXml: target
						? orderedNodesToInnerXml(orderedElementChildren(target, "target"))
						: undefined,
				};
			});

			inlineSegmentsByUnit.set(String(unitId), segments);
		}
	}

	return inlineSegmentsByUnit;
}

function toXmlText(v: unknown): string {
	if (v === null || v === undefined) return "";
	if (typeof v === "string") return v;
	if (typeof v === "number" || typeof v === "boolean") return String(v);

	if (typeof v === "object" && v !== null) {
		const obj = v as Record<string, unknown>;
		if (obj["#text"] !== undefined && obj["#text"] !== null) {
			return String(obj["#text"]);
		}
	}
	return String(v);
}
