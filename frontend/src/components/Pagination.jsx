// Reusable pagination control for admin tables. Works with the backend's
// { items, total, page, page_size, pages } envelope.
export default function Pagination({ page, pages, total, pageSize, onChange }) {
  if (!pages || pages <= 1) {
    return total != null ? (
      <div className="admin-pagination" style={{ color: "var(--ink-soft)", fontSize: 13, padding: "8px 4px" }}>
        {total} total
      </div>
    ) : null;
  }
  const go = (p) => onChange(Math.max(1, Math.min(pages, p)));
  return (
    <div className="admin-pagination" style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 4px", flexWrap: "wrap" }}>
      <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => go(1)}>« First</button>
      <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => go(page - 1)}>‹ Prev</button>
      <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>
        Page {page} of {pages}{total != null ? ` · ${total} total` : ""}
        {pageSize ? ` · ${pageSize}/page` : ""}
      </span>
      <button className="btn btn-ghost btn-sm" disabled={page >= pages} onClick={() => go(page + 1)}>Next ›</button>
      <button className="btn btn-ghost btn-sm" disabled={page >= pages} onClick={() => go(pages)}>Last »</button>
    </div>
  );
}
