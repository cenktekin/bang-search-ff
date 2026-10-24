"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const BangLib = require("../src/common/lib/bangs.js");

test("normalizeBang reads DuckDuckGo shorthand keys", () => {
  const bang = BangLib.normalizeBang({
    t: "hb",
    s: "Hepsiburada",
    d: "hepsiburada.com",
    u: "https://www.hepsiburada.com/ara?q={{{s}}}",
    c: "Shopping",
    sc: "Market",
    r: 8,
  });
  assert.deepEqual(bang, {
    t: "hb",
    s: "Hepsiburada",
    d: "hepsiburada.com",
    u: "https://www.hepsiburada.com/ara?q={{{s}}}",
    c: "Shopping",
    sc: "Market",
    r: 8,
  });
});

test("normalizeBang accepts long-form aliases and numeric strings", () => {
  const bang = BangLib.normalizeBang({
    trigger: " gh ",
    name: "GitHub",
    domain: "github.com",
    url: "https://github.com/search?q={{{s}}}",
    category: "Tech",
    rank: "4",
  });
  assert.equal(bang.t, "gh");
  assert.equal(bang.s, "GitHub");
  assert.equal(bang.r, 4);
});

test("normalizeBang rejects entries without a trigger", () => {
  assert.equal(BangLib.normalizeBang(null), null);
  assert.equal(BangLib.normalizeBang("gh"), null);
  assert.equal(BangLib.normalizeBang({ s: "No trigger" }), null);
  assert.equal(BangLib.normalizeBang({ t: "   " }), null);
});

test("buildSearchUrl replaces both placeholder variants", () => {
  assert.equal(
    BangLib.buildSearchUrl({ t: "w", u: "https://x.test/?q={{{s}}}" }, "a b"),
    "https://x.test/?q=a%20b"
  );
  assert.equal(
    BangLib.buildSearchUrl({ t: "w", u: "https://x.test/?q={{s}}" }, "a b"),
    "https://x.test/?q=a%20b"
  );
});

test("buildSearchUrl falls back to the DuckDuckGo bang redirect", () => {
  assert.equal(
    BangLib.buildSearchUrl({ t: "gh" }, "react hooks"),
    "https://duckduckgo.com/?q=!gh react%20hooks"
  );
  assert.equal(
    BangLib.buildSearchUrl({ t: "gh" }, ""),
    "https://duckduckgo.com/?q=!gh "
  );
});

test("rankBangs orders exact > prefix > substring", () => {
  const list = [
    { t: "wiki", s: "Wikipedia", r: 10 },
    { t: "w", s: "Wikipedia", r: 1 },
    { t: "wtr", s: "Wikipedia TR", r: 2 },
    { t: "not-a-match", s: "Nothing", r: 0 },
  ];
  const ranked = BangLib.rankBangs(list, "w", 8).map((b) => b.t);
  assert.deepEqual(ranked, ["w", "wtr", "wiki"]);
});

test("rankBangs honors the limit and ignores invalid entries", () => {
  const list = [
    null,
    { s: "missing trigger" },
    { t: "a1", s: "Alpha", r: 3 },
    { t: "a2", s: "Alpha", r: 2 },
    { t: "a3", s: "Alpha", r: 1 },
  ];
  assert.deepEqual(
    BangLib.rankBangs(list, "a", 2).map((b) => b.t),
    ["a3", "a2"]
  );
  assert.deepEqual(BangLib.rankBangs(list, "", 8), []);
  assert.deepEqual(BangLib.rankBangs([], "a", 8), []);
});

test("rankBangs matches on site name, domain, category and subcategory", () => {
  const list = [
    { t: "x1", s: "Sahibinden", d: "sahibinden.com", c: "Shopping", sc: "Türkiye" },
  ];
  assert.equal(BangLib.rankBangs(list, "sahibinden", 8).length, 1);
  assert.equal(BangLib.rankBangs(list, "türkiye", 8).length, 1);
});

test("normalizeCustomBang strips a leading ! and validates the template", () => {
  const bang = BangLib.normalizeCustomBang({
    t: "!forum",
    s: "Forum",
    u: "https://forum.example.com/ara?q={{{s}}}",
  });
  assert.equal(bang.t, "forum");
  assert.equal(bang.c, "");
});

test("normalizeCustomBang rejects unsafe or unusable templates", () => {
  const base = { t: "forum", s: "Forum" };
  assert.equal(
    BangLib.normalizeCustomBang({ ...base, u: "ftp://forum.example.com/?q={{{s}}}" }),
    null
  );
  assert.equal(
    BangLib.normalizeCustomBang({ ...base, u: "https://forum.example.com/ara" }),
    null
  );
  assert.equal(
    BangLib.normalizeCustomBang({ ...base, t: "bad trigger", u: "https://x.test/?q={{{s}}}" }),
    null
  );
});

test("mergeBangs puts custom bangs first and wins trigger collisions", () => {
  const registry = [
    { t: "sh", s: "Shell", u: "https://shell.test/?q={{{s}}}", r: 5 },
    { t: "w", s: "Wikipedia", u: "https://w.test/?q={{{s}}}", r: 1 },
  ];
  const custom = [
    { t: "SH", s: "Sahibinden", u: "https://s.test/?q={{{s}}}" },
    { t: "bad", s: "Bad", u: "no-placeholder" },
  ];
  const merged = BangLib.mergeBangs(registry, custom);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].t, "SH");
  assert.equal(merged[0].r, -1);
  assert.deepEqual(
    merged.map((b) => b.t.toLowerCase()),
    ["sh", "w"]
  );
});

test("mergeBangs tolerates missing inputs", () => {
  assert.deepEqual(BangLib.mergeBangs(null, null), []);
  assert.deepEqual(BangLib.mergeBangs(undefined, [{ t: "x", u: "https://x.test/?q={{{s}}}" }]).length, 1);
});

test("FALLBACK_BANGS is unique, searchable and includes Turkish sites", () => {
  const triggers = BangLib.FALLBACK_BANGS.map((b) => b.t.toLowerCase());
  assert.equal(new Set(triggers).size, triggers.length);

  for (const bang of BangLib.FALLBACK_BANGS) {
    assert.ok(bang.u.includes("{{{s}}}"), `${bang.t} lacks a query placeholder`);
    assert.ok(/^https?:\/\//.test(bang.u), `${bang.t} has a non-http URL`);
  }

  for (const expected of ["sahibinden", "yemeksepeti", "migros", "tdk", "tefas"]) {
    assert.ok(triggers.includes(expected), `missing ${expected}`);
  }
});
