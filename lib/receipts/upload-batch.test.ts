import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { uploadReceiptFilesIndividually } from "./upload-batch";

describe("uploadReceiptFilesIndividually", () => {
  it("continues after one file fails and reports that file", async () => {
    const attempted: string[] = [];
    let settled = 0;
    const files = ["first.pdf", "broken.pdf", "last.png"];

    const failures = await uploadReceiptFilesIndividually(
      files,
      async (file) => {
        attempted.push(file);
        if (file === "broken.pdf") {
          throw new Error("synthetic upload failure");
        }
      },
      () => {
        settled++;
      },
    );

    assert.deepEqual(attempted, files);
    assert.deepEqual(failures, [
      {
        file: "broken.pdf",
        error: new Error("synthetic upload failure"),
      },
    ]);
    assert.equal(settled, files.length);
  });
});
