const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../js/router.js");
const routes = [{ id: "overview", sections: ["hero", "stats"] }, { id: "board", sections: ["board"] }, { id: "calendar", sections: ["calendar"] }];
const aliases = { stats: "overview", board: "board", calendar: "calendar", top: "overview" };
const special = (h) => /^#(import|pipely-gist)=/.test(h);
const has = (id) => id === "main";
test("routes, deep links and defaults", () => {
  assert.deepEqual(R.resolve("", routes, aliases, special, has), { route: "overview" });
  assert.deepEqual(R.resolve("#/", routes, aliases, special, has), { route: "overview" });
  assert.deepEqual(R.resolve("#/board", routes, aliases, special, has), { route: "board" });
  assert.deepEqual(R.resolve("#/Calendar/", routes, aliases, special, has), { route: "calendar" });
  assert.deepEqual(R.resolve("#/nope", routes, aliases, special, has), { route: "overview", replace: "#/" });
});
test("old anchors map to their page; special one-tap hashes are left alone", () => {
  assert.deepEqual(R.resolve("#board", routes, aliases, special, has), { route: "board", anchor: "board", replace: "#/board" });
  assert.deepEqual(R.resolve("#top", routes, aliases, special, has), { route: "overview", anchor: "top", replace: "#/" });
  assert.deepEqual(R.resolve("#import=abc", routes, aliases, special, has), { route: "overview", special: true });
  assert.deepEqual(R.resolve("#pipely-gist=abc", routes, aliases, special, has), { route: "overview", special: true });
  assert.deepEqual(R.resolve("#main", routes, aliases, special, has), { route: null, anchorOnly: "main" });
  assert.deepEqual(R.resolve("#zzz", routes, aliases, special, has), { route: "overview", replace: "#/" });
});
