import test from "node:test";
import assert from "node:assert/strict";
import { prettifyMarkdown } from "../public/editor-utils.mjs";

test("Markdown formatting normalizes prose without changing fenced code", () => {
  const source = [
    "",
    "##    Heading   ",
    "",
    "",
    ">quote\t",
    "+   item",
    "2) item",
    "* * *",
    "hard break    ",
    "```js   ",
    "\tconst untouched = true;   ",
    "```   ",
    ""
  ].join("\r\n");

  assert.equal(prettifyMarkdown(source), [
    "## Heading",
    "",
    "> quote",
    "- item",
    "1. item",
    "---",
    "hard break  ",
    "```js",
    "\tconst untouched = true;   ",
    "```",
    ""
  ].join("\n"));
});
