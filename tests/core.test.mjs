import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import { webcrypto } from "node:crypto";

const html = readFileSync(
  new URL("../public/index.html", import.meta.url),
  "utf8",
);
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
  (m) => m[1],
);
// Syntax-check both scripts; load the same core that the browser uses.
for (const script of scripts) new vm.Script(script);
const context = vm.createContext({
  crypto: webcrypto,
  TextEncoder,
  btoa,
  setTimeout,
});
vm.runInContext(scripts[0], context);
const C = context.SantaCore;
const plain = (value) => JSON.parse(JSON.stringify(value));
function family(n = 5) {
  const f = C.newFamily("Winter family");
  f.people = Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `Person ${i}`,
    email: `p${i}@example.com`,
  }));
  return f;
}
function assertCircle(f, pairs) {
  assert.equal(pairs.length, f.people.length);
  assert.equal(new Set(pairs.map((p) => p.giverId)).size, f.people.length);
  assert.equal(new Set(pairs.map((p) => p.recipientId)).size, f.people.length);
  for (const p of pairs) {
    assert.notEqual(p.giverId, p.recipientId);
    assert(!f.blocks.some(([a, b]) => a === p.giverId && b === p.recipientId));
  }
  const next = new Map(pairs.map((p) => [p.giverId, p.recipientId])),
    visited = new Set();
  let id = pairs[0].giverId;
  while (!visited.has(id)) {
    visited.add(id);
    id = next.get(id);
  }
  assert.equal(visited.size, f.people.length, "must be one circle");
  assert.equal(id, pairs[0].giverId);
}
function hasCircle(f) {
  const permitted = (a, b) =>
    a !== b && !f.blocks.some(([x, y]) => x === a && y === b);
  const first = f.people[0].id;
  function visit(last, remaining) {
    if (!remaining.length) return permitted(last, first);
    return remaining.some(
      (next, i) =>
        permitted(last, next) &&
        visit(
          next,
          remaining.filter((_, j) => j !== i),
        ),
    );
  }
  return visit(
    first,
    f.people.slice(1).map((p) => p.id),
  );
}
test("draws exactly one circular chain with directional and mutual restrictions", async () => {
  const f = family(8);
  f.blocks = [
    ["p0", "p1"],
    ["p1", "p0"],
    ["p2", "p3"],
    ["p4", "p5"],
    ["p5", "p4"],
  ];
  for (let i = 0; i < 60; i++) assertCircle(f, await C.draw(f));
});
test("two-person exchange is a valid single circle", async () =>
  assertCircle(family(2), await C.draw(family(2))));
test("detects impossible rules, including disconnected subcircles", async () => {
  const f = family(4);
  for (const a of ["p0", "p1"])
    for (const b of ["p2", "p3"]) f.blocks.push([a, b], [b, a]);
  await assert.rejects(C.draw(f), /No valid circle/);
  const g = family(3);
  g.blocks = [
    ["p0", "p1"],
    ["p0", "p2"],
  ];
  await assert.rejects(C.draw(g), /No valid circle/);
});
test("solver agrees with exhaustive independent oracle for all 3-person directed graphs", async () => {
  for (let mask = 0; mask < 64; mask++) {
    const f = family(3);
    let bit = 0;
    for (const a of f.people)
      for (const b of f.people)
        if (a !== b) {
          if (mask & (1 << bit)) f.blocks.push([a.id, b.id]);
          bit++;
        }
    if (hasCircle(f)) assertCircle(f, await C.draw(f));
    else await assert.rejects(C.draw(f), /No valid circle/);
  }
});
test("solver agrees with independent oracle across 4-person directed graphs", async () => {
  for (let mask = 0; mask < 4096; mask += 7) {
    const f = family(4);
    let bit = 0;
    for (const a of f.people)
      for (const b of f.people)
        if (a !== b) {
          if (mask & (1 << bit)) f.blocks.push([a.id, b.id]);
          bit++;
        }
    if (hasCircle(f)) assertCircle(f, await C.draw(f));
    else await assert.rejects(C.draw(f), /No valid circle/);
  }
});
test("search budget exhaustion is distinguished from impossible rules", async () => {
  await assert.rejects(
    C.draw(family(), { maxSteps: 0 }),
    /does not mean the rules are impossible/,
  );
});
test("rejects invalid entries, header injection, and unrecognized placeholders", () => {
  for (const change of [
    (f) => f.people.splice(1),
    (f) => (f.people[0].email = "bad@example.com\r\nBcc: leak@example.com"),
    (f) => (f.people[0].name = "Name\nBcc:"),
    (f) => (f.subject = "Hello\r\nBcc:"),
    (f) => (f.senderName = "Santa\r\nBcc:"),
    (f) => (f.body = "No assignment"),
    (f) => (f.subject = "{unknown}"),
  ]) {
    const f = family();
    change(f);
    assert.throws(() => C.validateFamily(f));
  }
});
test("replaces placeholders in a single pass without interpreting participant data", () => {
  assert.equal(
    C.renderTemplate("{giver} buys for {recipient} in {family}", {
      giver: "{recipient}",
      recipient: "Jamie $&",
      family: "Family",
    }),
    "{recipient} buys for Jamie $& in Family",
  );
});
test("MIME message preserves Unicode, plain text, long headers and CRLF", () => {
  const f = family(2);
  f.people[0].name = "Zoë 🎄";
  f.people[1].name = "李明";
  f.senderName = "Père Noël 🎅";
  f.subject = "{giver} — " + "🎁".repeat(45);
  f.body =
    "Hi {giver},\nYou buy for {recipient}.\n<script>literal text</script>";
  const raw = C.buildMessage(
    f,
    { giverId: "p0", recipientId: "p1" },
    "santa@example.com",
  );
  assert.match(raw, /^[\w-]+$/);
  const mime = Buffer.from(raw, "base64url").toString("utf8");
  const [headers, body] = mime.split("\r\n\r\n");
  assert(headers.includes("<santa@example.com>"));
  assert(headers.includes("<p0@example.com>"));
  assert.equal(
    Buffer.from(body.replace(/\s/g, ""), "base64").toString("utf8"),
    "Hi Zoë 🎄,\r\nYou buy for 李明.\r\n<script>literal text</script>",
  );
  for (const line of mime.split("\r\n")) assert(line.length <= 998);
  for (const match of headers.matchAll(/=\?UTF-8\?B\?(.+?)\?=/g)) {
    assert(match[0].length <= 75);
    assert(!Buffer.from(match[1], "base64").toString("utf8").includes("�"));
  }
  assert.throws(() =>
    C.buildMessage(
      f,
      { giverId: "p0", recipientId: "p1" },
      "bad\r\nBcc:x@example.com",
    ),
  );
});
test("storage roundtrip retains multiple independent families and strips unapproved fields", () => {
  const a = family(3),
    b = family(2);
  a.blocks = [["p0", "p1"]];
  a.organizerId = "p0";
  a.subject = "Custom {family}";
  const original = {
    version: 1,
    activeId: b.id,
    clientId: "public-client-id",
    families: [a, b],
    token: "never load",
    pairs: [["p0", "p1"]],
  };
  a.token = "never load";
  a.people[0].recipient = "never load";
  const restored = plain(C.parseStore(JSON.stringify(original)));
  assert.equal(restored.families.length, 2);
  assert.equal(restored.activeId, b.id);
  assert.deepEqual(restored.families[0].blocks, [["p0", "p1"]]);
  assert.equal(restored.families[0].subject, "Custom {family}");
  assert(!JSON.stringify(restored).includes("never load"));
  assert(!("pairs" in restored));
});
test("invalid or corrupt saved data is rejected", () => {
  for (const raw of [
    "{",
    "null",
    "{}",
    JSON.stringify({ version: 2, families: [] }),
  ])
    assert.throws(() => C.parseStore(raw));
  const f = family();
  f.blocks = [["missing", "p0"]];
  assert.throws(() =>
    C.parseStore(
      JSON.stringify({
        version: 1,
        activeId: f.id,
        clientId: "",
        families: [f],
      }),
    ),
  );
});
