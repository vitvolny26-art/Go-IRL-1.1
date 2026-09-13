const normalizedPath = window.location.pathname.replace(/\/+$/, "") || "/";

if (normalizedPath === "/city-posters") {
  void import("./city-posters/entry");
} else {
  void import("./main");
}
