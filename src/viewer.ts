import { createServer } from "node:http";
import { getDatabase } from "./database.js";

const db = getDatabase();
const PORT = parseInt(process.env.PORT || "8642", 10);

interface TableInfo {
  name: string;
}

interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

function getTables(): string[] {
  const rows = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    .all() as TableInfo[];
  return rows.map((r) => r.name);
}

function getColumns(table: string): ColumnInfo[] {
  return db.pragma(`table_info(${table})`) as ColumnInfo[];
}

function getRows(
  table: string,
  limit: number,
  offset: number
): { rows: Record<string, unknown>[]; total: number } {
  const countRow = db
    .prepare(`SELECT COUNT(*) as cnt FROM "${table}"`)
    .get() as { cnt: number };
  const total = countRow.cnt;
  const rows = db
    .prepare(`SELECT * FROM "${table}" LIMIT ? OFFSET ?`)
    .all(limit, offset) as Record<string, unknown>[];
  return { rows, total };
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatVal(val: unknown): { display: string; full: string } {
  if (val === null || val === undefined)
    return { display: '<span class="null">NULL</span>', full: "" };
  if (val instanceof Buffer || val instanceof Uint8Array)
    return { display: `<span class="blob">[BLOB ${val.length} bytes]</span>`, full: "" };
  const s = String(val);
  if (s.length > 150) {
    return {
      display: escapeHtml(s.slice(0, 150)) + '<span class="ellipsis">...</span>',
      full: escapeHtml(s),
    };
  }
  return { display: escapeHtml(s), full: "" };
}

const CSS = `
  :root {
    --bg: #0a0a0f;
    --surface: #12121a;
    --surface-raised: #1a1a26;
    --border: #2a2a3a;
    --border-subtle: #1e1e2e;
    --text: #d4d4e8;
    --text-dim: #6e6e8a;
    --text-bright: #f0f0ff;
    --accent: #7c6aef;
    --accent-soft: rgba(124, 106, 239, 0.12);
    --accent-glow: rgba(124, 106, 239, 0.25);
    --teal: #5ccfcf;
    --rose: #e85d75;
    --amber: #d4a847;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Noto Sans JP', 'Outfit', sans-serif;
    background: var(--bg); color: var(--text); line-height: 1.7;
    -webkit-font-smoothing: antialiased;
  }
  .header {
    background: var(--surface);
    border-bottom: 1px solid var(--border-subtle);
    padding: 0 28px; height: 52px;
    display: flex; align-items: center; gap: 14px;
    position: relative; z-index: 100;
  }
  .header::after {
    content: ''; position: absolute; bottom: -1px; left: 0; right: 0; height: 1px;
    background: linear-gradient(90deg, transparent, var(--accent-glow), transparent);
  }
  .header .logo {
    font-family: 'DM Mono', monospace;
    font-size: 14px; font-weight: 500; color: var(--text-bright);
    letter-spacing: -0.3px;
  }
  .header .logo span { color: var(--accent); }
  .header .badge {
    font-family: 'DM Mono', monospace;
    background: var(--accent-soft); color: var(--accent);
    font-size: 10px; font-weight: 500;
    padding: 3px 10px; border-radius: 4px;
    letter-spacing: 1.5px; text-transform: uppercase;
  }
  .header .spacer { flex: 1; }
  .header .db-path {
    font-family: 'DM Mono', monospace;
    font-size: 11px; color: var(--text-dim);
  }
  .container { display: flex; height: calc(100vh - 52px); }
  .sidebar {
    width: 200px; min-width: 200px;
    background: var(--surface);
    border-right: 1px solid var(--border-subtle);
    padding: 20px 0; overflow-y: auto;
    display: flex; flex-direction: column;
  }
  .sidebar .section-label {
    font-family: 'DM Mono', monospace;
    font-size: 9px; text-transform: uppercase; color: var(--text-dim);
    padding: 0 20px 8px; letter-spacing: 2px;
  }
  .sidebar a {
    display: flex; align-items: center; gap: 8px;
    padding: 7px 20px; color: var(--text-dim); text-decoration: none;
    font-size: 13px; font-weight: 400;
    transition: all 0.15s ease;
    border-left: 2px solid transparent;
  }
  .sidebar a .icon { width: 16px; text-align: center; font-size: 12px; opacity: 0.6; }
  .sidebar a:hover { color: var(--text); background: rgba(255,255,255,0.02); }
  .sidebar a.active {
    color: var(--accent); background: var(--accent-soft);
    border-left-color: var(--accent); font-weight: 500;
  }
  .sidebar a.active .icon { opacity: 1; }
  .sidebar .bottom { margin-top: auto; padding: 16px 20px; border-top: 1px solid var(--border-subtle); }
  .sidebar .bottom .count {
    font-family: 'DM Mono', monospace;
    font-size: 11px; color: var(--text-dim);
  }
  .main { flex: 1; overflow: auto; padding: 28px 32px; background: var(--bg); }
  .stats { display: flex; gap: 16px; margin-bottom: 28px; flex-wrap: wrap; }
  .stat-card {
    background: var(--surface); border: 1px solid var(--border-subtle);
    border-radius: 10px; padding: 18px 22px; min-width: 160px;
    position: relative; overflow: hidden; transition: border-color 0.2s;
  }
  .stat-card:hover { border-color: var(--border); }
  .stat-card::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
    background: var(--accent); opacity: 0.5;
  }
  .stat-card .label {
    font-family: 'DM Mono', monospace;
    font-size: 10px; color: var(--text-dim);
    text-transform: uppercase; letter-spacing: 1.5px;
  }
  .stat-card .value {
    font-family: 'Outfit', sans-serif;
    font-size: 28px; font-weight: 600; color: var(--text-bright);
    margin-top: 6px; letter-spacing: -1px;
  }
  .table-header { display: flex; align-items: baseline; gap: 12px; margin-bottom: 16px; }
  .table-header h2 {
    font-family: 'Outfit', sans-serif;
    font-size: 18px; font-weight: 500; color: var(--text-bright);
  }
  .table-header .row-count {
    font-family: 'DM Mono', monospace;
    font-size: 12px; color: var(--text-dim);
  }
  .table-wrap {
    border: 1px solid var(--border-subtle); border-radius: 10px;
    overflow: hidden; background: var(--surface);
  }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  thead { position: sticky; top: 0; z-index: 10; }
  th {
    text-align: left; padding: 10px 16px;
    background: var(--surface-raised);
    color: var(--teal);
    font-family: 'DM Mono', monospace;
    font-weight: 500; font-size: 11px;
    text-transform: uppercase; letter-spacing: 0.8px;
    border-bottom: 1px solid var(--border);
    position: relative; user-select: none;
  }
  th .col-type {
    color: var(--text-dim); font-weight: 400;
    text-transform: lowercase; letter-spacing: 0;
    margin-left: 4px; font-size: 10px;
  }
  th .resizer {
    position: absolute; right: -8px; top: 0; width: 20px; height: 100%;
    cursor: col-resize; z-index: 20;
    display: flex; align-items: center; justify-content: center;
  }
  th .resizer::after {
    content: ''; width: 3px; height: 18px;
    background: var(--border); border-radius: 2px;
    transition: background 0.15s;
  }
  th .resizer:hover::after { background: var(--accent); box-shadow: 0 0 8px var(--accent-glow); }
  th .resizer.active::after { background: var(--accent); }
  td {
    padding: 10px 16px;
    border-bottom: 1px solid var(--border-subtle);
    font-size: 13px; line-height: 1.6;
    vertical-align: top;
    max-height: 120px; overflow: hidden;
    cursor: default; transition: background 0.1s;
  }
  td.expandable { cursor: pointer; }
  tr:hover td { background: rgba(124, 106, 239, 0.03); }
  .ellipsis { color: var(--accent); font-weight: 500; margin-left: 2px; }
  .null { color: var(--text-dim); font-style: italic; font-size: 12px; }
  .blob { color: var(--amber); font-family: 'DM Mono', monospace; font-size: 11px; }
  .pagination {
    margin-top: 20px; display: flex; gap: 8px; align-items: center; justify-content: center;
  }
  .pagination a, .pagination span {
    font-family: 'DM Mono', monospace;
    font-size: 12px; padding: 6px 14px; border-radius: 6px; text-decoration: none;
  }
  .pagination a {
    color: var(--accent); border: 1px solid var(--border);
    background: var(--surface); transition: all 0.15s;
  }
  .pagination a:hover { border-color: var(--accent); background: var(--accent-soft); }
  .pagination span { color: var(--text-dim); }
  .sql-section { margin-bottom: 28px; }
  .sql-section label {
    font-family: 'DM Mono', monospace;
    font-size: 10px; text-transform: uppercase; color: var(--text-dim);
    letter-spacing: 1.5px; display: block; margin-bottom: 8px;
  }
  .sql-section .editor-wrap {
    border: 1px solid var(--border-subtle); border-radius: 10px;
    overflow: hidden; background: var(--surface); transition: border-color 0.2s;
  }
  .sql-section .editor-wrap:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .sql-section textarea {
    width: 100%; min-height: 100px;
    background: transparent; color: var(--text-bright);
    border: none; padding: 16px;
    font-family: 'DM Mono', monospace; font-size: 13px;
    line-height: 1.6; resize: vertical;
  }
  .sql-section textarea:focus { outline: none; }
  .sql-section textarea::placeholder { color: var(--text-dim); }
  .sql-section .toolbar {
    display: flex; justify-content: space-between; align-items: center;
    padding: 8px 12px; border-top: 1px solid var(--border-subtle);
    background: var(--surface-raised);
  }
  .sql-section .hint {
    font-family: 'DM Mono', monospace;
    font-size: 10px; color: var(--text-dim);
  }
  .sql-section button {
    font-family: 'DM Mono', monospace;
    background: var(--accent); color: #fff; border: none;
    padding: 7px 20px; border-radius: 6px;
    font-size: 12px; font-weight: 500; letter-spacing: 0.5px;
    cursor: pointer; transition: all 0.15s;
  }
  .sql-section button:hover {
    background: #8b7bf7; box-shadow: 0 2px 12px var(--accent-glow);
  }
  .info {
    font-family: 'DM Mono', monospace;
    color: var(--text-dim); font-size: 12px; margin-bottom: 16px;
  }
  .error {
    color: var(--rose); background: rgba(232, 93, 117, 0.08);
    border: 1px solid rgba(232, 93, 117, 0.2);
    padding: 14px 18px; border-radius: 8px; margin: 16px 0;
    font-size: 13px; font-family: 'DM Mono', monospace;
  }
  .modal-overlay {
    display: none; position: fixed; inset: 0;
    background: rgba(0,0,0,0.7); backdrop-filter: blur(4px);
    z-index: 1000; align-items: center; justify-content: center; padding: 40px;
  }
  .modal-overlay.open { display: flex; }
  .modal {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 12px; max-width: 800px; width: 100%; max-height: 80vh;
    display: flex; flex-direction: column;
    box-shadow: 0 24px 80px rgba(0,0,0,0.5);
  }
  .modal-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 16px 20px; border-bottom: 1px solid var(--border-subtle);
  }
  .modal-header .col-name {
    font-family: 'DM Mono', monospace;
    font-size: 12px; color: var(--teal);
    text-transform: uppercase; letter-spacing: 0.8px;
  }
  .modal-close {
    background: none; border: 1px solid var(--border);
    color: var(--text-dim); width: 28px; height: 28px;
    border-radius: 6px; cursor: pointer; font-size: 14px;
    display: flex; align-items: center; justify-content: center;
    transition: all 0.15s;
  }
  .modal-close:hover { color: var(--text); border-color: var(--text-dim); }
  .modal-body {
    padding: 20px; overflow-y: auto;
    font-size: 14px; line-height: 1.8;
    white-space: pre-wrap; word-break: break-word;
    color: var(--text-bright);
  }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--text-dim); }
`;

const JS = `
document.querySelectorAll('table').forEach(function(table) {
  var cols = table.querySelectorAll('th');
  cols.forEach(function(th) {
    var resizer = document.createElement('div');
    resizer.className = 'resizer';
    th.appendChild(resizer);
    var startX, startW;
    resizer.addEventListener('mousedown', function(e) {
      e.preventDefault();
      startX = e.pageX;
      startW = th.offsetWidth;
      resizer.classList.add('active');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      function onMove(e2) {
        var w = Math.max(60, startW + e2.pageX - startX);
        th.style.width = w + 'px';
        th.style.minWidth = w + 'px';
      }
      function onUp() {
        resizer.classList.remove('active');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });
});

var modal = document.getElementById('modal');
var modalCol = document.getElementById('modal-col');
var modalBody = document.getElementById('modal-body');
var modalClose = document.getElementById('modal-close');

document.querySelectorAll('td[data-full]').forEach(function(td) {
  td.classList.add('expandable');
  td.addEventListener('click', function() {
    modalCol.textContent = td.getAttribute('data-col') || '';
    modalBody.textContent = td.getAttribute('data-full');
    modal.classList.add('open');
  });
});

if (modalClose) {
  modalClose.addEventListener('click', function() { modal.classList.remove('open'); });
}
if (modal) {
  modal.addEventListener('click', function(e) {
    if (e.target === modal) modal.classList.remove('open');
  });
}
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && modal) modal.classList.remove('open');
});

var textarea = document.querySelector('.sql-section textarea');
if (textarea) {
  textarea.addEventListener('keydown', function(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      textarea.closest('form').submit();
    }
  });
}
`;

function renderPage(body: string, title = "claude-memex viewer"): string {
  return (
    '<!DOCTYPE html><html lang="ja"><head>' +
    '<meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    "<title>" + escapeHtml(title) + "</title>" +
    '<link rel="preconnect" href="https://fonts.googleapis.com">' +
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
    '<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Noto+Sans+JP:wght@300;400;500;700&family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">' +
    "<style>" + CSS + "</style>" +
    "</head><body>" +
    '<div class="header">' +
    '  <div class="logo">claude<span>.</span>memex</div>' +
    '  <div class="badge">viewer</div>' +
    '  <div class="spacer"></div>' +
    '  <div class="db-path">~/.claude-memex/memory.db</div>' +
    "</div>" +
    '<div class="container">' +
    body +
    "</div>" +
    '<div class="modal-overlay" id="modal">' +
    '  <div class="modal">' +
    '    <div class="modal-header">' +
    '      <span class="col-name" id="modal-col"></span>' +
    '      <button class="modal-close" id="modal-close">&times;</button>' +
    "    </div>" +
    '    <div class="modal-body" id="modal-body"></div>' +
    "  </div>" +
    "</div>" +
    "<script>" + JS + "</script>" +
    "</body></html>"
  );
}

function renderSidebar(activeTable?: string): string {
  const tables = getTables();
  let totalRows = 0;
  for (const t of tables) {
    try {
      const row = db.prepare('SELECT COUNT(*) as cnt FROM "' + t + '"').get() as { cnt: number };
      totalRows += row.cnt;
    } catch {
      // skip
    }
  }

  let html =
    '<div class="sidebar">' +
    '<div class="section-label">Navigation</div>' +
    '<a href="/" ' + (!activeTable ? 'class="active"' : "") + '><span class="icon">&gt;_</span>Query</a>' +
    '<div class="section-label" style="margin-top:20px">Tables</div>';
  for (const t of tables) {
    const active = t === activeTable ? 'class="active"' : "";
    html +=
      '<a href="/table/' + encodeURIComponent(t) + '" ' + active + ">" +
      '<span class="icon">#</span>' + escapeHtml(t) + "</a>";
  }
  html +=
    '<div class="bottom"><div class="count">' + totalRows + " total records</div></div>" +
    "</div>";
  return html;
}

function renderHome(): string {
  const tables = getTables();
  const stats: { name: string; count: number }[] = [];
  for (const t of tables) {
    try {
      const row = db.prepare('SELECT COUNT(*) as cnt FROM "' + t + '"').get() as { cnt: number };
      stats.push({ name: t, count: row.cnt });
    } catch {
      stats.push({ name: t, count: -1 });
    }
  }

  let body = renderSidebar();
  body += '<div class="main">';
  body += '<div class="stats">';
  for (const s of stats) {
    body +=
      '<div class="stat-card">' +
      '<div class="label">' + escapeHtml(s.name) + "</div>" +
      '<div class="value">' + (s.count >= 0 ? s.count : "N/A") + "</div>" +
      "</div>";
  }
  body += "</div>";
  body +=
    '<div class="sql-section">' +
    "<label>SQL Query</label>" +
    '<form method="GET" action="/query">' +
    '<div class="editor-wrap">' +
    '<textarea name="sql" placeholder="SELECT * FROM memories ORDER BY id DESC LIMIT 20;" spellcheck="false"></textarea>' +
    '<div class="toolbar">' +
    '<span class="hint">Cmd + Enter to run</span>' +
    '<button type="submit">Execute</button>' +
    "</div></div></form></div>";
  body += "</div>";
  return renderPage(body);
}

function renderTableView(table: string, page: number, perPage: number): string {
  const columns = getColumns(table);
  const offset = (page - 1) * perPage;
  const { rows, total } = getRows(table, perPage, offset);
  const totalPages = Math.ceil(total / perPage);

  let body = renderSidebar(table);
  body += '<div class="main">';
  body +=
    '<div class="table-header">' +
    "<h2>" + escapeHtml(table) + "</h2>" +
    '<span class="row-count">' + total + " rows</span>" +
    "</div>";
  body += '<div class="table-wrap"><table><thead><tr>';
  for (const col of columns) {
    body +=
      "<th>" + escapeHtml(col.name) +
      '<span class="col-type">' + escapeHtml(col.type) + "</span></th>";
  }
  body += "</tr></thead><tbody>";
  for (const row of rows) {
    body += "<tr>";
    for (const col of columns) {
      const { display, full } = formatVal(row[col.name]);
      if (full) {
        body += '<td data-full="' + escapeHtml(full) + '" data-col="' + escapeHtml(col.name) + '">' + display + "</td>";
      } else {
        body += "<td>" + display + "</td>";
      }
    }
    body += "</tr>";
  }
  body += "</tbody></table></div>";

  if (totalPages > 1) {
    body += '<div class="pagination">';
    if (page > 1)
      body += '<a href="/table/' + encodeURIComponent(table) + "?page=" + (page - 1) + '">&larr; Prev</a>';
    body += "<span>Page " + page + " / " + totalPages + "</span>";
    if (page < totalPages)
      body += '<a href="/table/' + encodeURIComponent(table) + "?page=" + (page + 1) + '">Next &rarr;</a>';
    body += "</div>";
  }
  body += "</div>";
  return renderPage(body, table + " - claude-memex viewer");
}

function renderQueryResult(sql: string): string {
  let body = renderSidebar();
  body += '<div class="main">';
  body +=
    '<div class="sql-section">' +
    "<label>SQL Query</label>" +
    '<form method="GET" action="/query">' +
    '<div class="editor-wrap">' +
    '<textarea name="sql" spellcheck="false">' + escapeHtml(sql) + "</textarea>" +
    '<div class="toolbar">' +
    '<span class="hint">Cmd + Enter to run</span>' +
    '<button type="submit">Execute</button>' +
    "</div></div></form></div>";

  try {
    const stmt = db.prepare(sql);
    if (
      sql.trim().toUpperCase().startsWith("SELECT") ||
      sql.trim().toUpperCase().startsWith("PRAGMA") ||
      sql.trim().toUpperCase().startsWith("WITH")
    ) {
      const rows = stmt.all() as Record<string, unknown>[];
      if (rows.length === 0) {
        body += '<div class="info">No results returned</div>';
      } else {
        const keys = Object.keys(rows[0]);
        body += '<div class="info">' + rows.length + " rows returned</div>";
        body += '<div class="table-wrap"><table><thead><tr>';
        for (const k of keys) body += "<th>" + escapeHtml(k) + "</th>";
        body += "</tr></thead><tbody>";
        for (const row of rows) {
          body += "<tr>";
          for (const k of keys) {
            const { display: d, full: f } = formatVal(row[k]);
            if (f) {
              body += '<td data-full="' + escapeHtml(f) + '" data-col="' + escapeHtml(k) + '">' + d + "</td>";
            } else {
              body += "<td>" + d + "</td>";
            }
          }
          body += "</tr>";
        }
        body += "</tbody></table></div>";
      }
    } else {
      const result = stmt.run();
      body += '<div class="info">Query executed. Changes: ' + result.changes + "</div>";
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    body += '<div class="error">' + escapeHtml(msg) + "</div>";
  }

  body += "</div>";
  return renderPage(body, "Query - claude-memex viewer");
}

const server = createServer((req, res) => {
  const url = new URL(req.url || "/", "http://localhost:" + PORT);
  const pathname = url.pathname;

  res.setHeader("Content-Type", "text/html; charset=utf-8");

  if (pathname === "/") {
    res.end(renderHome());
  } else if (pathname.startsWith("/table/")) {
    const table = decodeURIComponent(pathname.slice(7));
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    try {
      res.end(renderTableView(table, page, 50));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      let errBody = renderSidebar();
      errBody += '<div class="main"><div class="error">' + escapeHtml(msg) + "</div></div>";
      res.end(renderPage(errBody));
    }
  } else if (pathname === "/query") {
    const sql = url.searchParams.get("sql") || "";
    if (!sql) {
      res.writeHead(302, { Location: "/" });
      res.end();
    } else {
      res.end(renderQueryResult(sql));
    }
  } else {
    res.writeHead(404);
    res.end(
      renderPage(
        renderSidebar() + '<div class="main"><div class="info">Not found</div></div>'
      )
    );
  }
});

server.listen(PORT, () => {
  console.log("claude-memex viewer running at http://localhost:" + PORT);
});
