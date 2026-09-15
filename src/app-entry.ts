const normalizedPath = window.location.pathname.replace(/\/+$/, "") || "/";

if (normalizedPath === "/city-posters") {
  void import("./city-posters/entry");
} else if (normalizedPath === "/cinema/approval") {
  void import("./cinema-approval/entry");
} else {
  void import("./main");
}
