/* Hash router: one page per section group (#/board, #/calendar ...). Works on GitHub Pages, back/forward and
   deep links. Old in-page anchors (#board) map to their page. Special one-tap hashes are left alone for the app. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api; else root.PageRouter = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  // Pure: decide what a hash means. routes: [{id, sections}], aliases: {anchorId: routeId}.
  function resolve(hash, routes, aliases, isSpecial, hasElement) {
    var h = String(hash || "");
    var def = routes[0].id;
    if (isSpecial && isSpecial(h)) return { route: def, special: true };
    if (h === "" || h === "#" || h === "#/") return { route: def };
    if (h.slice(0, 2) === "#/") {
      var id = decodeURIComponent(h.slice(2)).replace(/\/+$/, "").toLowerCase();
      for (var i = 0; i < routes.length; i++) if (routes[i].id === id) return { route: id };
      return { route: def, replace: "#/" };
    }
    var anchor = h.slice(1);
    if (aliases && Object.prototype.hasOwnProperty.call(aliases, anchor)) return { route: aliases[anchor], anchor: anchor, replace: "#/" + (aliases[anchor] === def ? "" : aliases[anchor]) };
    if (hasElement && hasElement(anchor)) return { route: null, anchorOnly: anchor };
    return { route: def, replace: "#/" };
  }
  function start(opts) {
    var routes = opts.routes, current = null, pendingAnchor = null;
    var all = [];
    routes.forEach(function (r) { r.sections.forEach(function (s) { if (all.indexOf(s) < 0) all.push(s); }); });
    var nav = opts.nav;
    nav.textContent = "";
    var links = {};
    routes.forEach(function (r, i) {
      var a = document.createElement("a");
      a.href = "#/" + (i === 0 ? "" : r.id);
      a.textContent = r.label;
      a.setAttribute("data-route", r.id);
      nav.appendChild(a);
      links[r.id] = a;
    });
    function byId(id) { return document.getElementById(id); }
    function show(id, anchor) {
      var route = routes.filter(function (r) { return r.id === id; })[0] || routes[0];
      var changed = current !== route.id;
      current = route.id;
      all.forEach(function (s) { var el = byId(s); if (el) el.hidden = route.sections.indexOf(s) < 0; });
      // first section of a page gets a shorter top gap (the hero keeps its own spacing)
      all.forEach(function (s) { var el = byId(s); if (el && el.classList) el.classList.toggle("page-first", s === route.sections[0]); });
      Object.keys(links).forEach(function (k) {
        if (k === route.id) { links[k].setAttribute("aria-current", "page"); } else links[k].removeAttribute("aria-current");
      });
      document.title = (route.id === routes[0].id ? "" : route.label + " · ") + opts.siteTitle;
      // keep the active tab visible in the scrollable tab row
      var link = links[route.id];
      if (link && nav.scrollWidth > nav.clientWidth) {
        var l = link.offsetLeft - nav.offsetLeft, target = l - (nav.clientWidth - link.offsetWidth) / 2;
        nav.scrollLeft = Math.max(0, target);
      }
      if (opts.onShow) opts.onShow(route.id, changed);
      var el = anchor && route.sections[0] !== anchor ? byId(anchor) : null;
      if (el) el.scrollIntoView({ block: "start" }); else window.scrollTo(0, 0);
    }
    function apply() {
      var r = resolve(location.hash, routes, opts.aliases, opts.isSpecial, function (id) { return !!byId(id); });
      if (r.anchorOnly) { if (!current) show(routes[0].id); return; }
      if (r.replace != null) { try { history.replaceState(null, "", location.pathname + location.search + r.replace); } catch (e) { /* ignore */ } }
      var pa = pendingAnchor; pendingAnchor = null;
      show(r.route, r.anchor || pa);
    }
    window.addEventListener("hashchange", apply);
    apply();
    return {
      go: function (id, anchor) {
        var target = "#/" + (id === routes[0].id ? "" : id);
        if (location.hash === target || (target === "#/" && (location.hash === "" || location.hash === "#"))) show(id, anchor);
        else { pendingAnchor = anchor || null; location.hash = target; }
      },
      current: function () { return current; },
      routeOf: function (sectionId) { var r = routes.filter(function (x) { return x.sections.indexOf(sectionId) >= 0; })[0]; return r ? r.id : null; }
    };
  }
  return { resolve: resolve, start: start };
});
