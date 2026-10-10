/* Runs before first paint. Light is the default for everyone; dark only when chosen with the toggle
   (stored under the previous app's key "brice-job-apps-theme"). The system setting is not used. */
(function () {
  var t = "light";
  try { t = localStorage.getItem("brice-job-apps-theme") === "dark" ? "dark" : "light"; } catch (e) { /* private mode */ }
  document.documentElement.setAttribute("data-theme", t);
})();
