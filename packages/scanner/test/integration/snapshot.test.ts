import { describe, expect, it } from "vitest";
import { FORMATS } from "../../src/formats";
import { decode } from "../../src/index.node";
import { computeSnapshot, loadSnapshot, SNAPSHOT_DIRS, saveSnapshot } from "../snapshot";

describe.skipIf(!SNAPSHOT_DIRS.length)(
  "snapshot de resultados (samples zxing-cpp, 13 formatos, balanced)",
  () => {
    it("coincide con test/fixtures/samples-snapshot.json", async () => {
      const got = await computeSnapshot((b) => decode(b, { formats: FORMATS }));
      const want = loadSnapshot();
      if (!want || process.env.UPDATE_SNAPSHOT) {
        saveSnapshot(got);
        return;
      }
      expect(got).toEqual(want);
    }, 300_000);
  },
);
