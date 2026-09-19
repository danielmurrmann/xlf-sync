import { XMLParser } from "fast-xml-parser";

type OrderedXmlNode = Record<string, unknown>;

const ATTRIBUTES_KEY = ":@";
const TEXT_KEY = "#text";

const orderedXmlParser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: "@_",
	preserveOrder: true,
	trimValues: false,
});

function asArray<T>(value: T | T[] | undefined | null): T[] {
	if (value === undefined || value === null) {
		return [];
	}
	return Array.isArray(value) ? value : [value];
}

function isOrderedXmlNode(value: unknown): value is OrderedXmlNode {
	return typeof value === "object" && value !== null;
}

export function escapeXml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}

export function parseOrderedXml(xml: string): unknown {
	return orderedXmlParser.parse(xml);
}

export function orderedChildElements(
	nodes: unknown,
	tagName: string,
): OrderedXmlNode[] {
	return asArray(nodes).filter(
		(node): node is OrderedXmlNode =>
			isOrderedXmlNode(node) && Object.hasOwn(node, tagName),
	);
}

export function orderedElementChildren(
	node: unknown,
	tagName: string,
): OrderedXmlNode[] {
	if (!isOrderedXmlNode(node) || !Object.hasOwn(node, tagName)) {
		return [];
	}

	const value = node[tagName];
	return asArray(value).filter(isOrderedXmlNode);
}

function serializeAttributes(attributes: Record<string, unknown> | undefined): string {
	if (!attributes) {
		return "";
	}

	let serialized = "";
	for (const [key, value] of Object.entries(attributes)) {
		if (key.startsWith("@_")) {
			serialized += ` ${key.slice(2)}="${escapeXml(String(value))}"`;
		}
	}

	return serialized;
}

function serializeOrderedNode(node: OrderedXmlNode): string {
	if (TEXT_KEY in node) {
		return escapeXml(String(node[TEXT_KEY] ?? ""));
	}

	const element = Object.entries(node).find(([key]) => key !== ATTRIBUTES_KEY);
	if (!element) {
		return "";
	}

	const [tagName, children] = element;
	const attrs = serializeAttributes(node[ATTRIBUTES_KEY] as Record<string, unknown> | undefined);
	const childNodes = asArray(children).filter(isOrderedXmlNode);

	if (childNodes.length === 0) {
		return `<${tagName}${attrs}/>`;
	}

	return `<${tagName}${attrs}>${orderedNodesToInnerXml(childNodes)}</${tagName}>`;
}

export function orderedNodesToInnerXml(nodes: unknown): string {
	return asArray(nodes)
		.filter(isOrderedXmlNode)
		.map((node) => serializeOrderedNode(node))
		.join("");
}

export function normalizeInlineXmlFragment(fragment: string): string {
	if (fragment === "") {
		return "";
	}

	const ordered = parseOrderedXml(`<root>${fragment}</root>`);
	const root = orderedChildElements(ordered, "root")[0];
	if (!root) {
		return escapeXml(fragment);
	}

	return orderedNodesToInnerXml(orderedElementChildren(root, "root"));
}