const state = {
  items: [],
  period: null,
  selected: new Set(),
  filtered: [],
  serviceBase: "",
  serviceOnline: false,
  isStaticPage: !["127.0.0.1", "localhost"].includes(window.location.hostname),
};

const els = {
  periodText: document.querySelector("#periodText"),
  searchInput: document.querySelector("#searchInput"),
  categoryFilter: document.querySelector("#categoryFilter"),
  regionFilter: document.querySelector("#regionFilter"),
  sourceFilter: document.querySelector("#sourceFilter"),
  selectedOnly: document.querySelector("#selectedOnly"),
  selectVisibleBtn: document.querySelector("#selectVisibleBtn"),
  clearSelectedBtn: document.querySelector("#clearSelectedBtn"),
  updateBtn: document.querySelector("#updateBtn"),
  serviceInput: document.querySelector("#serviceInput"),
  serviceStatus: document.querySelector("#serviceStatus"),
  saveServiceBtn: document.querySelector("#saveServiceBtn"),
  downloadBtn: document.querySelector("#downloadBtn"),
  resultCount: document.querySelector("#resultCount"),
  selectedCount: document.querySelector("#selectedCount"),
  statusText: document.querySelector("#statusText"),
  cards: document.querySelector("#cards"),
};

function uniqueValues(key) {
  return [...new Set(state.items.map((item) => item[key]).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "zh-CN"),
  );
}

function fillSelect(select, values) {
  const current = select.value;
  while (select.options.length > 1) {
    select.remove(1);
  }
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }
  select.value = values.includes(current) ? current : "";
}

function matchesFilters(item) {
  const keyword = els.searchInput.value.trim().toLowerCase();
  const category = els.categoryFilter.value;
  const region = els.regionFilter.value;
  const source = els.sourceFilter.value;

  if (category && item.category !== category) return false;
  if (region && item.region !== region) return false;
  if (source && item.source_level !== source) return false;
  if (els.selectedOnly.checked && !state.selected.has(item.id)) return false;

  if (!keyword) return true;
  const haystack = [
    item.title,
    item.summary,
    item.report_value,
    item.source_name,
    item.source_level,
    item.subcategory,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(keyword);
}

function render() {
  state.filtered = state.items.filter(matchesFilters);
  els.resultCount.textContent = state.filtered.length;
  els.selectedCount.textContent = state.selected.size;
  els.downloadBtn.disabled = state.selected.size === 0 || !state.serviceOnline;
  els.updateBtn.disabled = !state.serviceOnline;
  els.cards.innerHTML = "";

  if (!state.filtered.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "没有符合筛选条件的候选信息。";
    els.cards.appendChild(empty);
    return;
  }

  for (const item of state.filtered) {
    const card = document.createElement("article");
    card.className = "card";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = state.selected.has(item.id);
    checkbox.setAttribute("aria-label", `选择 ${item.title}`);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        state.selected.add(item.id);
      } else {
        state.selected.delete(item.id);
      }
      render();
    });

    const body = document.createElement("div");

    const title = document.createElement("h2");
    title.textContent = item.title;

    const meta = document.createElement("div");
    meta.className = "meta";
    const tags = [
      item.category,
      item.subcategory,
      item.region,
      item.date,
      item.source_level,
      item.source_type,
    ].filter(Boolean);

    for (const tagText of tags) {
      const tag = document.createElement("span");
      tag.className = `tag ${item.source_level.includes("官网") || item.source_level.includes("组织") ? "official" : ""}`;
      tag.textContent = tagText;
      meta.appendChild(tag);
    }

    const summary = document.createElement("p");
    summary.className = "summary-text";
    summary.textContent = item.summary;

    const value = document.createElement("p");
    value.className = "value-text";
    const strong = document.createElement("strong");
    strong.textContent = "汇报价值：";
    value.appendChild(strong);
    value.append(item.report_value);

    const source = document.createElement("div");
    source.className = "source-row";
    const sourceName = document.createElement("span");
    sourceName.textContent = `${item.source_name}｜${item.date_note || "按本期口径纳入"}`;
    const link = document.createElement("a");
    link.href = item.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "查看原文";
    source.append(sourceName, link);

    body.append(title, meta, summary, value, source);
    card.append(checkbox, body);
    els.cards.appendChild(card);
  }
}

async function downloadReport() {
  if (!state.selected.size) {
    els.statusText.textContent = "请先勾选要汇报的信息。";
    return;
  }
  if (!state.serviceOnline) {
    els.statusText.textContent = "本机服务未连接，暂时不能下载 Word。";
    return;
  }

  els.statusText.textContent = "正在生成 Word...";
  els.downloadBtn.disabled = true;

  try {
    const response = await fetch(`${state.serviceBase}/api/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selected_ids: [...state.selected] }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "下载失败");
    }

    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") || "";
    const utf8Name = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    const fallbackName = disposition.match(/filename="?([^";]+)"?/i);
    const filename = utf8Name
      ? decodeURIComponent(utf8Name[1])
      : fallbackName
        ? decodeURIComponent(fallbackName[1])
        : "汽车行业动态监控.docx";
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    els.statusText.textContent = "Word 已生成。";
  } catch (error) {
    els.statusText.textContent = error.message || "生成失败。";
  } finally {
    els.downloadBtn.disabled = state.selected.size === 0 || !state.serviceOnline;
  }
}

async function loadData() {
  const dataUrl = state.isStaticPage && !state.serviceOnline
    ? "data/items-2026-05.json"
    : `${state.serviceBase}/api/items`;
  const response = await fetch(dataUrl, { cache: "no-store" });
  const payload = await response.json();
  state.items = payload.items;
  state.period = payload.period;

  els.periodText.textContent = `统计周期：${state.period.start} 至 ${state.period.end}｜纳入口径：${state.period.basis}｜更新时间：${state.period.updated_at}`;

  fillSelect(els.categoryFilter, uniqueValues("category"));
  fillSelect(els.regionFilter, uniqueValues("region"));
  fillSelect(els.sourceFilter, uniqueValues("source_level"));
  render();
}

async function updateNow() {
  if (!state.serviceOnline) {
    els.statusText.textContent = "本机服务未连接，暂时不能立即更新。";
    return;
  }

  els.statusText.textContent = "正在更新官方来源...";
  els.updateBtn.disabled = true;

  try {
    const response = await fetch(`${state.serviceBase}/api/update`, { method: "POST" });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.description || "更新失败");
    }
    await loadData();
    els.statusText.textContent = `更新完成：检查 ${payload.checked_count} 条，新增 ${payload.added_count} 条。`;
  } catch (error) {
    els.statusText.textContent = error.message || "更新失败。";
  } finally {
    els.updateBtn.disabled = !state.serviceOnline;
  }
}

function defaultServiceBase() {
  if (!state.isStaticPage) {
    return "";
  }
  return localStorage.getItem("autoMonitorServiceBase") || "";
}

async function checkService() {
  state.serviceBase = defaultServiceBase().replace(/\/$/, "");
  if (els.serviceInput) {
    els.serviceInput.value = state.serviceBase;
  }

  if (!state.isStaticPage) {
    state.serviceOnline = true;
    if (els.serviceStatus) els.serviceStatus.textContent = "本机服务已连接";
    return;
  }

  if (!state.serviceBase) {
    state.serviceOnline = false;
    if (els.serviceStatus) els.serviceStatus.textContent = "仅浏览模式：未配置本机服务地址";
    return;
  }

  try {
    const response = await fetch(`${state.serviceBase}/health`, { cache: "no-store" });
    state.serviceOnline = response.ok;
    if (els.serviceStatus) {
      els.serviceStatus.textContent = response.ok ? "本机服务已连接" : "本机服务不可用";
    }
  } catch {
    state.serviceOnline = false;
    if (els.serviceStatus) els.serviceStatus.textContent = "本机服务离线，当前只能浏览";
  }
}

async function saveServiceBase() {
  const value = (els.serviceInput?.value || "").trim().replace(/\/$/, "");
  if (value) {
    localStorage.setItem("autoMonitorServiceBase", value);
  } else {
    localStorage.removeItem("autoMonitorServiceBase");
  }
  await checkService();
  render();
}

async function init() {
  els.downloadBtn.disabled = true;
  await checkService();
  await loadData();

  for (const el of [
    els.searchInput,
    els.categoryFilter,
    els.regionFilter,
    els.sourceFilter,
    els.selectedOnly,
  ]) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  }

  els.selectVisibleBtn.addEventListener("click", () => {
    for (const item of state.filtered) {
      state.selected.add(item.id);
    }
    render();
  });

  els.clearSelectedBtn.addEventListener("click", () => {
    state.selected.clear();
    render();
  });

  els.downloadBtn.addEventListener("click", downloadReport);
  els.updateBtn.addEventListener("click", updateNow);
  els.saveServiceBtn?.addEventListener("click", saveServiceBase);
}

init().catch((error) => {
  els.statusText.textContent = error.message || "页面初始化失败。";
});
