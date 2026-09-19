import { XMLParser } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { syncLocale } from "../src/core/sync.js";
import { parseXlf, writeXlf } from "../src/core/xlf/index.js";
import { parseV12 } from "../src/core/xlf/v12";
import { parseV20 } from "../src/core/xlf/v20";
import { writeV12 } from "../src/core/xlf/write-v12";

const parserV12 = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: "@_",
});

describe("Regression Tests (v1.3.5)", () => {
	describe("Numeric/Boolean Serialization (Fix [object Object])", () => {
		it("should correctly extract numeric values from V12 contexts", () => {
			const xml = `
            <xliff version="1.2">
              <file source-language="en" datatype="plaintext" original="ng2.template">
                <body>
                  <trans-unit id="test">
                    <source>Hello</source>
                    <context-group purpose="location">
                      <context context-type="linenumber">42</context>
                      <context context-type="flag">true</context>
                    </context-group>
                  </trans-unit>
                </body>
              </file>
            </xliff>`;

			const doc = parserV12.parse(xml);
			const parsed = parseV12(doc);
			const entry = parsed.entries.get("test");

			expect(entry).toBeDefined();
			const lineCtx = entry?.contexts?.find((c) => c.type === "linenumber");
			const flagCtx = entry?.contexts?.find((c) => c.type === "flag");

			expect(lineCtx?.content).toBe("42");
			expect(flagCtx?.content).toBe("true");
		});

		it("should correctly extract numeric values from V20 notes", () => {
			const xml = `
            <xliff version="2.0" srcLang="en">
              <file id="ngi18n">
                <unit id="test">
                  <notes>
                    <note category="priority">1</note>
                  </notes>
                  <segment>
                    <source>Hello</source>
                  </segment>
                </unit>
              </file>
            </xliff>`;

			const doc = parserV12.parse(xml);
			const parsed = parseV20(doc);
			const entry = parsed.entries.get("test");

			expect(entry).toBeDefined();
			expect(entry?.notes?.[0].content).toBe("1");
		});
	});

	describe("Empty Body Handling (Fix missing body crashing)", () => {
		it("should handle missing text inside body gracefully in V12", () => {
			const xml = `
            <xliff version="1.2">
              <file source-language="en" original="ng2.template">
                <body></body>
              </file>
            </xliff>`;

			const doc = parserV12.parse(xml);
			const parsed = parseV12(doc);
			expect(parsed.entries.size).toBe(0);
		});

		it("should check write loop handles empty body re-initialization", () => {
			const xml = `
            <xliff version="1.2">
              <file source-language="en" original="ng2.template">
                <body></body>
              </file>
            </xliff>`;

			const doc = parserV12.parse(xml);
			const parsed = parseV12(doc);

			parsed.entries.set("new", {
				key: "new",
				sourceXml: "New Key",
			});

			const output = writeV12(doc, parsed.entries, [], {
				newTarget: "todo",
				obsolete: "mark",
			});
			expect(output).toContain('<trans-unit id="new"');
		});
	});

	describe("XLIFF 2.0 inline placeholders", () => {
		it("should preserve placeholder markup when syncing a new unit into a locale", () => {
				const sourceXml = `<?xml version="1.0" encoding="UTF-8" ?>
	<xliff version="2.0" xmlns="urn:oasis:names:tc:xliff:document:2.0" srcLang="en" trgLang="de">
	  <file id="f1">
	    <unit id="existing">
	      <segment>
	        <source>Existing</source>
	        <target>Bestehend</target>
	      </segment>
	    </unit>
	    <unit id="greeting">
	      <segment>
	        <source>Page <ph id="0" equiv="INTERPOLATION" disp="{{ currentPage() }}"/> of <ph id="1" equiv="INTERPOLATION_1" disp="{{ pageCount() }}"/></source>
	      </segment>
	    </unit>
	  </file>
	</xliff>`;

				const localeXml = `<?xml version="1.0" encoding="UTF-8" ?>
	<xliff version="2.0" xmlns="urn:oasis:names:tc:xliff:document:2.0" srcLang="en" trgLang="de">
	  <file id="f1">
	    <unit id="existing">
	      <segment>
	        <source>Existing</source>
	        <target>Bestehend</target>
	      </segment>
	    </unit>
	  </file>
	</xliff>`;

				const source = parseXlf(sourceXml);
				const locale = parseXlf(localeXml);
				const result = syncLocale(source.entries, locale.entries, {
					newTarget: "source",
					obsolete: "mark",
				});

				const output = writeXlf(locale, result.merged, result.obsoleteKeys, {
					newTarget: "source",
					obsolete: "mark",
				});
				const reparsed = parseXlf(output);

				expect(reparsed.entries.get("greeting")?.sourceXml).toBe('Page <ph id="0" equiv="INTERPOLATION" disp="{{ currentPage() }}"/> of <ph id="1" equiv="INTERPOLATION_1" disp="{{ pageCount() }}"/>');
				expect(reparsed.entries.get("greeting")?.targetXml).toBe('Page <ph id="0" equiv="INTERPOLATION" disp="{{ currentPage() }}"/> of <ph id="1" equiv="INTERPOLATION_1" disp="{{ pageCount() }}"/>');
		});

		it("should preserve a translation unit that contains only a placeholder", () => {
			const sourceXml = `<?xml version="1.0" encoding="UTF-8" ?>
<xliff version="2.0" xmlns="urn:oasis:names:tc:xliff:document:2.0" srcLang="en" trgLang="de">
  <file id="f1">
    <unit id="only-ph">
      <segment>
        <source><ph id="0" equiv="INTERPOLATION" disp="{{ value() }}"/></source>
      </segment>
    </unit>
  </file>
</xliff>`;

			const localeXml = `<?xml version="1.0" encoding="UTF-8" ?>
<xliff version="2.0" xmlns="urn:oasis:names:tc:xliff:document:2.0" srcLang="en" trgLang="de">
  <file id="f1"></file>
</xliff>`;

			const source = parseXlf(sourceXml);
			const locale = parseXlf(localeXml);
			const result = syncLocale(source.entries, locale.entries, {
				newTarget: "source",
				obsolete: "mark",
			});

			const output = writeXlf(locale, result.merged, result.obsoleteKeys, {
				newTarget: "source",
				obsolete: "mark",
			});
			const reparsed = parseXlf(output);

			expect(reparsed.entries.get("only-ph")?.sourceXml).toBe(
				'<ph id="0" equiv="INTERPOLATION" disp="{{ value() }}"/>',
			);
			expect(reparsed.entries.get("only-ph")?.targetXml).toBe(
				'<ph id="0" equiv="INTERPOLATION" disp="{{ value() }}"/>',
			);
		});
		});
});
