import test from "node:test";
import assert from "node:assert/strict";
import { articleHash, parseRouteHash } from "../public/route-utils.mjs";

test("article heading hashes retain both the article and section", () => {
  const hash = articleHash("Creatures/Deep Crows", "source-0-ancient-deep-crow-0");
  assert.equal(hash, "#article/Creatures%2FDeep%20Crows?heading=source-0-ancient-deep-crow-0");
  assert.deepEqual(parseRouteHash(hash), {
    routeName: "article",
    encoded: "Creatures%2FDeep%20Crows",
    heading: "source-0-ancient-deep-crow-0"
  });
});

test("ordinary routes remain unchanged", () => {
  assert.deepEqual(parseRouteHash("#home"), { routeName: "home", encoded: "", heading: "" });
  assert.deepEqual(parseRouteHash("#article/Notes%2FSession"), { routeName: "article", encoded: "Notes%2FSession", heading: "" });
});
