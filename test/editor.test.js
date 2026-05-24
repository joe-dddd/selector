const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { JSDOM } = require("jsdom");

const editorScript = fs.readFileSync(path.join(__dirname, "..", "assets", "editor.js"), "utf8");

function createEditorDom(bodyHtml) {
  const clipboardWrites = [];
  const dom = new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`, {
    pretendToBeVisual: true,
    runScripts: "outside-only",
    url: "https://example.test/joe-dddd/selector",
  });

  Object.defineProperty(dom.window.navigator, "clipboard", {
    configurable: true,
    value: {
      writeText(text) {
        clipboardWrites.push(text);
        return Promise.resolve();
      },
    },
  });

  dom.window.eval(editorScript);
  if (!dom.window.document.querySelector(".ai-editor-root")) {
    dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded", { bubbles: true }));
  }
  return { dom, clipboardWrites };
}

function click(window, element) {
  element.dispatchEvent(new window.MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    button: 0,
  }));
}

function keydown(window, key, options = {}) {
  const event = new window.KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key,
    ...options,
  });
  window.document.dispatchEvent(event);
  return event;
}

test("copy prompt truncates selected element html at 200 chars", () => {
  const longText = "Latest commit ".repeat(30);
  const { dom, clipboardWrites } = createEditorDom(`
    <table>
      <tbody>
        <tr>
          <td colspan="3" class="bgColor-muted p-1 rounded-top-2"><div><h2>${longText}</h2></div></td>
        </tr>
      </tbody>
    </table>
  `);

  click(dom.window, dom.window.document.querySelector("td"));
  keydown(dom.window, "c", { metaKey: true });

  assert.equal(clipboardWrites.length, 1);
  const htmlLine = clipboardWrites[0]
    .split("\n")
    .find((line) => line.trimStart().startsWith("html: "));

  assert.ok(htmlLine, "expected copied prompt to include an html line");
  const htmlValue = htmlLine.replace(/^.*html:\s*/, "");
  assert.equal(htmlValue.length, 200);
  assert.ok(htmlValue.startsWith("<td"), htmlValue);
  assert.ok(!htmlValue.includes("</td>"), htmlValue);
});

test("paused selector does not intercept native copy shortcut", () => {
  const { dom, clipboardWrites } = createEditorDom(`<p id="target">Native copy should work while paused</p>`);

  click(dom.window, dom.window.document.querySelector("#target"));
  keydown(dom.window, " ");
  const copyEvent = keydown(dom.window, "c", { metaKey: true });

  assert.equal(clipboardWrites.length, 0);
  assert.equal(copyEvent.defaultPrevented, false);
});
