// Shared by both view modules. Kept separate so app-view.js can import
// reference-view.js without the two escaping helpers forming a cycle.
export const esc = value =>
  String(value ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
