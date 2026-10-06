const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "public", "national-tools", "aurora", "index.html"), "utf8");

test("emitted national aurora graph names its canonical author and publisher", () => {
  const jsonLd = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(jsonLd, "JSON-LD script is present");
  const graph = JSON.parse(jsonLd[1])["@graph"];
  const personId = "https://chrisizworski.com/#person";
  const person = graph.find((entity) => entity["@type"] === "Person" && entity["@id"] === personId);
  const page = graph.find((entity) => entity["@id"] === "https://chrisizworski.com/national-tools/aurora/#page");

  assert.ok(person, "canonical Person node exists");
  assert.equal(person.name, "Chris Izworski");
  assert.equal(person.url, "https://chrisizworski.com/");
  assert.ok(page, "national aurora SoftwareApplication node exists");
  assert.ok(
    page.author?.["@id"] === personId || page.creator?.["@id"] === personId,
    "application author or creator resolves to the canonical Person",
  );
  assert.equal(page.publisher?.["@id"], personId, "application publisher resolves to the canonical Person");
});
