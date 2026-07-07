const statusEl = document.getElementById("status");
const tableSelect = document.getElementById("tableSelect");
const tableMeta = document.getElementById("tableMeta");
const keyList = document.getElementById("keyList");
const rowFilterInput = document.getElementById("rowFilterInput");
const rowTitle = document.getElementById("rowTitle");
const rowMeta = document.getElementById("rowMeta");
const rowEditor = document.getElementById("rowEditor");
const csvPreview = document.getElementById("csvPreview");
const pendingList = document.getElementById("pendingList");
const logEl = document.getElementById("log");
const cellLineInput = document.getElementById("cellLineInput");
const cellColumnInput = document.getElementById("cellColumnInput");
const cellValueInput = document.getElementById("cellValueInput");
const showEmptyCells = document.getElementById("showEmptyCells");

const state = {
  tables: [],
  table: null,
  summary: null,
  key: "",
  row: null,
  pending: [],
};

function log(message) {
  const line = `[${new Date().toLocaleTimeString()}] ${message}`;
  logEl.textContent = `${line}\n${logEl.textContent}`.slice(0, 12000);
}

async function request(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(data?.error || res.statusText);
  return data;
}

function postJson(url, body) {
  return request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;",
  }[ch]));
}

function renderStatus(data) {
  const profile = data.profile ? `${data.profile.label} ${data.profile.resVersion || ""}` : "no profile";
  statusEl.textContent = `${profile} | overlay: ${data.targetStore} | full: ${data.sourceArchiveDir || data.sourceStore || "-"} | cdn: ${data.cdnRoot}`;
}

function renderTables(data) {
  state.tables = data.tables || [];
  state.pending = data.pending || [];
  tableSelect.innerHTML = "";
  for (const table of state.tables) {
    const opt = document.createElement("option");
    opt.value = table.alias;
    opt.textContent = `${table.alias}${table.exists ? "" : " (source/fallback)"}`;
    tableSelect.appendChild(opt);
  }
  if (!state.table && state.tables.length) state.table = state.tables[0].alias;
  tableSelect.value = state.table || "";
  renderPending();
}

function renderPending() {
  if (!state.pending.length) {
    pendingList.innerHTML = "<p class=\"muted\">暂无待发布文件</p>";
    return;
  }
  pendingList.innerHTML = state.pending.map(item => `<div class="pendingItem">${escapeHtml(item)}</div>`).join("");
}

function renderKeyList() {
  keyList.innerHTML = "";
  const keys = state.summary?.keys || [];
  const q = rowFilterInput.value.trim().toLowerCase();
  const shown = keys.filter(item => !q || item.key.toLowerCase().includes(q) || String(item.label || "").toLowerCase().includes(q)).slice(0, 600);
  for (const item of shown) {
    const btn = document.createElement("button");
    btn.className = item.key === state.key ? "key active" : "key";
    btn.innerHTML = `<span><b>${escapeHtml(item.key)}</b>${item.label ? `<em>${escapeHtml(item.label)}</em>` : ""}</span><small>${item.size} B</small>`;
    btn.onclick = () => openRow(item.key).catch(error => log(error.message));
    keyList.appendChild(btn);
  }
  if (shown.length === 0) keyList.innerHTML = "<p class=\"muted\">没有匹配 key</p>";
}

function renderCsv(rowData) {
  const annotated = rowData?.annotatedRows;
  const rows = annotated || rowData?.rows || [];
  const includeEmpty = showEmptyCells.checked;
  if (!rows || rows.length === 0) {
    csvPreview.innerHTML = "<p class=\"muted\">无 CSV 行</p>";
    return;
  }
  const head = rows.slice(0, 80).map((row, rowIndex) => {
    const normalized = row.map((cell, colIndex) => (typeof cell === "object" && cell !== null
      ? cell
      : { index: colIndex, name: `c${colIndex}`, value: cell, ref: "" }));
    const visible = includeEmpty
      ? normalized
      : normalized.filter(cell => String(cell.value ?? "") !== "" || cell.ref);
    const cells = visible.slice(0, includeEmpty ? 140 : 80).map((cell, colIndex) => {
      const data = typeof cell === "object" && cell !== null
        ? cell
        : { index: colIndex, name: `c${colIndex}`, value: cell, ref: "" };
      return `<td>
        <b>${data.index} ${escapeHtml(data.name || "")}</b>
        ${data.zh ? `<small>${escapeHtml(data.zh)}</small>` : ""}
        ${data.type ? `<i>${escapeHtml(data.type)}</i>` : ""}
        <span>${escapeHtml(data.value)}</span>
        ${data.ref ? `<em>${escapeHtml(data.ref)}</em>` : ""}
      </td>`;
    }).join("");
    const rowHead = rowData?.rowLabels?.[rowIndex] || String(rowIndex + 1);
    return `<tr><th>${escapeHtml(rowHead)}</th>${cells}</tr>`;
  }).join("");
  csvPreview.innerHTML = `<table>${head}</table>`;
}

async function loadStatus() {
  const data = await request("/api/status");
  renderStatus(data);
  state.pending = data.pending || [];
  renderPending();
}

async function loadTables() {
  const data = await request("/api/mod/tables");
  renderTables(data);
}

async function loadTable() {
  state.table = tableSelect.value;
  state.key = "";
  state.row = null;
  rowEditor.value = "";
  rowTitle.textContent = "未选择行";
  rowMeta.textContent = "正在读取 orderedmap 索引";
  csvPreview.innerHTML = "";
  const data = await request(`/api/mod/table?table=${encodeURIComponent(state.table)}&limit=5000`);
  state.summary = data;
  tableMeta.textContent = `${data.logicalPath} | ${data.count} rows | ${data.rawRows ? "raw outer rows" : "csv rows"} | columns=${data.columns?.length || 0}`;
  rowMeta.textContent = `来源: ${data.sourcePath}`;
  renderKeyList();
  log(`loaded ${state.table}: ${data.count} rows`);
}

async function openRow(key) {
  if (!state.table) return;
  const data = await request(`/api/mod/row?table=${encodeURIComponent(state.table)}&key=${encodeURIComponent(key)}`);
  state.key = key;
  state.row = data;
  rowTitle.textContent = key;
  if (data.rawRows) {
    rowMeta.textContent = `${data.table} | ${data.label || ""} | raw row | ${data.size} bytes${data.nestedRows ? ` | nested rows: ${data.rows?.length || 0}` : ""}`;
    rowEditor.value = data.base64 || "";
    renderCsv(data.nestedRows ? data : null);
  } else {
    rowMeta.textContent = `${data.table} | ${data.label || ""} | CSV rows: ${data.rows?.length || 0}`;
    rowEditor.value = data.text || "";
    renderCsv(data);
  }
  renderKeyList();
}

async function saveRow() {
  if (!state.table || !state.key) return log("先选择一行");
  if (state.row?.rawRows) return log("raw-row 外层表暂不支持直接文本保存");
  const data = await postJson("/api/mod/row", {
    table: state.table,
    key: state.key,
    text: rowEditor.value,
  });
  state.pending = data.pending || state.pending;
  renderPending();
  await openRow(state.key);
  log(`saved row ${state.table}/${state.key}`);
}

async function saveCell() {
  if (!state.table || !state.key) return log("先选择一行");
  if (state.row?.rawRows && !state.row?.rowMap) return log("raw-row 外层表暂不支持单元格保存");
  if (state.row?.rawRows) {
    const visibleLine = Math.max(1, Number(cellLineInput.value || 1));
    const mapped = state.row.rowMap[visibleLine - 1];
    if (!mapped) return log(`找不到嵌套 CSV 行: ${visibleLine}`);
    const data = await postJson("/api/mod/nested-cell", {
      table: state.table,
      key: state.key,
      nestedKey: mapped.nestedKey,
      line: mapped.line,
      column: Number(cellColumnInput.value || 0),
      value: cellValueInput.value,
    });
    state.pending = data.pending || state.pending;
    renderPending();
    await openRow(state.key);
    log(`saved nested cell ${state.key}/${mapped.nestedKey} line=${mapped.line} col=${cellColumnInput.value}`);
    return;
  }
  const data = await postJson("/api/mod/cell", {
    table: state.table,
    key: state.key,
    line: Number(cellLineInput.value || 1),
    column: Number(cellColumnInput.value || 0),
    value: cellValueInput.value,
  });
  state.pending = data.pending || state.pending;
  renderPending();
  await openRow(state.key);
  log(`saved cell ${state.key} line=${cellLineInput.value} col=${cellColumnInput.value}`);
}

async function previewPublish() {
  const data = await postJson("/api/mod/publish", { listOnly: true });
  log(`preview ${data.fromVersion} -> ${data.toVersion}\n${data.files.map(f => f.archivePath).join("\n")}`);
}

async function publish() {
  const data = await postJson("/api/mod/publish", { listOnly: false });
  state.pending = [];
  renderPending();
  const outputs = data.outputs.map(o => `${o.path} (${o.count} files, ${o.size} B)`).join("\n");
  log(`published ${data.fromVersion} -> ${data.toVersion}\n${outputs}`);
}

async function clearPending() {
  const data = await postJson("/api/mod/pending/clear", {});
  state.pending = data.pending || [];
  renderPending();
  log("cleared pending list");
}

async function refreshAll() {
  await loadStatus();
  await loadTables();
  if (tableSelect.value) await loadTable();
}

document.getElementById("refreshAllBtn").onclick = () => refreshAll().catch(error => log(error.message));
document.getElementById("loadTableBtn").onclick = () => loadTable().catch(error => log(error.message));
document.getElementById("reloadRowBtn").onclick = () => openRow(state.key).catch(error => log(error.message));
document.getElementById("saveRowBtn").onclick = () => saveRow().catch(error => log(error.message));
document.getElementById("saveCellBtn").onclick = () => saveCell().catch(error => log(error.message));
document.getElementById("previewPublishBtn").onclick = () => previewPublish().catch(error => log(error.message));
document.getElementById("publishBtn").onclick = () => publish().catch(error => log(error.message));
document.getElementById("clearPendingBtn").onclick = () => clearPending().catch(error => log(error.message));
tableSelect.onchange = () => loadTable().catch(error => log(error.message));
rowFilterInput.oninput = renderKeyList;
showEmptyCells.onchange = () => renderCsv(state.row);

refreshAll().catch(error => log(error.message));
