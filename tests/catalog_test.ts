import { strict as assert } from "node:assert";
import { findCatalog } from "../http/utils.ts";
import { IFLASH_3000_TESTS } from "../machines/iflash/catalog.ts";
import { parseIFlashMessage } from "../machines/iflash/inbound.ts";
import { parseMaglumiMessage } from "../machines/maglumi800/inbound.ts";
import { parseCobasC111Message } from "../machines/rocheCobasC111/inbound.ts";
import { parseSysmexKx21nPayload } from "../machines/sysmexKx21n/inbound.ts";
import { parseAstmMessage } from "../protocols/astm/records.ts";

Deno.test("every iFlash catalog result code matches the numeric ASTM channel", () => {
    const catalog = findCatalog("YHLO iFlash 3000")!;
    for (const test of IFLASH_3000_TESTS) {
        const parsed = parseIFlashMessage(parseAstmMessage(
            `H|\\^&|||YHLO^iFlash3000^123O|1||SAMPLER|1|${test.channelNumber}^${test.testName}^^F|8.67|pg/mLL|1|N`
        ), "test");
        const published = catalog.tests.find((entry) => entry.code === test.testCode)!;
        assert.equal(published.code, test.testCode);
        assert.equal(published.analytes[0].code, parsed.result!.results[0].assayNo);
    }
    assert.deepEqual(catalog.tests.find((test) => test.code === "FT4_1")?.analytes,
        [{ code: "339", name: "FT4_1" }]);
});
Deno.test("MAGLUMI aliases return the published canonical assay code", () => {
    const parsed = parseMaglumiMessage(parseAstmMessage("O|1|SAMPLE\rR|1|HCG/B-HCG II|8.67|mIU/mL"), "test");
    const test = findCatalog("SNIBE MAGLUMI 800")!.tests.find((test) => test.code === "T-B HCG II")!;
    assert.equal(parsed.result!.results[0].assayNo, test.analytes[0].code);
});
Deno.test("cobas publishes numeric host codes while displaying assay names", () => {
    const parsed = parseCobasC111Message(parseAstmMessage("O|1|SAMPLE\rR|1|158|8.67|U/L"), "test");
    const test = findCatalog("Roche cobas c111")!.tests.find((test) => test.code === "158")!;
    assert.equal(test.name, "ALP2S");
    assert.equal(parsed.result!.results[0].assayNo, test.analytes[0].code);
});
Deno.test("Sysmex CBC publishes individual analytes, not the panel code", () => {
    const test = findCatalog("Sysmex KX-21N")!.tests.find((test) => test.code === "CBC")!;
    const raw = "O|1|SAMPLE\r" + test.analytes.map((analyte, i) => `R|${i + 1}|${analyte.code}|8.67`).join("\r");
    const parsed = parseSysmexKx21nPayload(raw, { outputFormat: "auto", dateOrder: "ymd" });
    assert.deepEqual(parsed.result!.payload.results.map((result) => result.assayNo), test.analytes.map((analyte) => analyte.code));
    assert(!test.analytes.some((analyte) => analyte.code === "CBC"));
});
