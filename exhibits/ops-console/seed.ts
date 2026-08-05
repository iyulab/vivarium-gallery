/**
 * ops-console 시드 — 이 전시물의 단일 출처 (exhibit.ts · scripted.ts · knowledge.ts 공유).
 *
 * 이 전시물이 세워진 이유는 도메인이 아니라 **크기**다. 앞선 다섯 전시물은 전부
 * 아티팩트 1개 · 25~60줄 · 1.1~2.8 KB · 엔티티 ≤1 · 행 ≤3 의 한 점에 서 있었고,
 * 그래서 diff 최소성 · 롤백 바이트 일치 · 판정 하한들이 **작은 화면에서만** 증명돼
 * 있었다. 하나는 이미 측정됐다: 값이 전부 빠진 화면을 텍스트 하한이 19자에서 잡고,
 * 카드 하나만 늘면 29자로 통과시킨다. 그 판정의 유효 범위는 **옳음이 아니라 화면
 * 크기**로 정해진다는 뜻이다.
 *
 * 그래서 시드는 **크게** 만들어져 있다:
 *   - 아티팩트가 300줄을 넘는다 — 실모델 최대 산출(286줄)보다 위여야 이미 도달한
 *     규모를 다시 재는 것이 아니게 된다.
 *   - 엔티티 셋 · 행 39건 · capability 넷 — 부분만 죽는 실패가 가능해지는 크기다.
 *     엔티티가 하나면 "일부만 비었다"는 상태를 만들 수 없다.
 *   - 규모가 **반복이 아니라 구조**에서 나온다. 같은 행을 늘려 줄 수만 채우면 국소
 *     변경의 diff 가 무엇인지 물을 수 없다. 표마다 열 정의·행 렌더·빈 상태가 있고
 *     필터가 하나 붙는다.
 *
 * 아티팩트는 **하나로 유지한다**. 다중 아티팩트는 이 전시물의 산출이 그 필요를 말한
 * 뒤의 별건이다.
 */

export interface ServiceRow {
  id: string;
  name: string;
  tier: string;
  owner: string;
  status: string;
}

export interface IncidentRow {
  id: string;
  serviceId: string;
  severity: string;
  openedAt: string;
  summary: string;
  resolved: boolean;
}

export interface DeployRow {
  id: string;
  serviceId: string;
  version: string;
  at: string;
  result: string;
}

/** 12행 — 티어 필터가 걸리는 표. */
export const MOCK_SERVICES: ServiceRow[] = [
  { id: "svc-01", name: "checkout", tier: "tier-1", owner: "payments", status: "healthy" },
  { id: "svc-02", name: "catalog", tier: "tier-1", owner: "storefront", status: "healthy" },
  { id: "svc-03", name: "search", tier: "tier-2", owner: "storefront", status: "degraded" },
  { id: "svc-04", name: "identity", tier: "tier-1", owner: "platform", status: "healthy" },
  { id: "svc-05", name: "billing", tier: "tier-1", owner: "payments", status: "healthy" },
  { id: "svc-06", name: "notifications", tier: "tier-3", owner: "platform", status: "healthy" },
  { id: "svc-07", name: "media", tier: "tier-3", owner: "storefront", status: "degraded" },
  { id: "svc-08", name: "reporting", tier: "tier-2", owner: "insights", status: "healthy" },
  { id: "svc-09", name: "ingest", tier: "tier-2", owner: "insights", status: "healthy" },
  { id: "svc-10", name: "scheduler", tier: "tier-3", owner: "platform", status: "healthy" },
  { id: "svc-11", name: "gateway", tier: "tier-1", owner: "platform", status: "healthy" },
  { id: "svc-12", name: "audit", tier: "tier-3", owner: "compliance", status: "healthy" },
];

/** 9행 — 서비스를 참조하는 표(참조 열이 개명·제거의 표적이 된다). */
export const MOCK_INCIDENTS: IncidentRow[] = [
  { id: "inc-01", serviceId: "svc-03", severity: "sev-2", openedAt: "2026-07-28", summary: "elevated query latency", resolved: false },
  { id: "inc-02", serviceId: "svc-07", severity: "sev-3", openedAt: "2026-07-29", summary: "thumbnail cache misses", resolved: false },
  { id: "inc-03", serviceId: "svc-01", severity: "sev-1", openedAt: "2026-07-21", summary: "payment retries stalled", resolved: true },
  { id: "inc-04", serviceId: "svc-05", severity: "sev-2", openedAt: "2026-07-22", summary: "invoice export timeout", resolved: true },
  { id: "inc-05", serviceId: "svc-09", severity: "sev-3", openedAt: "2026-07-24", summary: "batch lag above target", resolved: true },
  { id: "inc-06", serviceId: "svc-04", severity: "sev-2", openedAt: "2026-07-25", summary: "token refresh spikes", resolved: true },
  { id: "inc-07", serviceId: "svc-11", severity: "sev-1", openedAt: "2026-07-26", summary: "upstream pool exhausted", resolved: true },
  { id: "inc-08", serviceId: "svc-02", severity: "sev-3", openedAt: "2026-07-27", summary: "stale facet counts", resolved: true },
  { id: "inc-09", serviceId: "svc-08", severity: "sev-3", openedAt: "2026-07-30", summary: "scheduled report skew", resolved: false },
];

/** 18행 — 가장 긴 표. 세 표의 길이가 다른 것이 의도다(부분만 비는 실패가 가능해진다). */
export const MOCK_DEPLOYS: DeployRow[] = [
  { id: "dep-01", serviceId: "svc-01", version: "2026.07.30-a", at: "2026-07-30 09:12", result: "succeeded" },
  { id: "dep-02", serviceId: "svc-02", version: "2026.07.30-b", at: "2026-07-30 10:04", result: "succeeded" },
  { id: "dep-03", serviceId: "svc-03", version: "2026.07.30-c", at: "2026-07-30 11:38", result: "rolled-back" },
  { id: "dep-04", serviceId: "svc-04", version: "2026.07.29-a", at: "2026-07-29 08:20", result: "succeeded" },
  { id: "dep-05", serviceId: "svc-05", version: "2026.07.29-b", at: "2026-07-29 13:47", result: "succeeded" },
  { id: "dep-06", serviceId: "svc-06", version: "2026.07.29-c", at: "2026-07-29 16:02", result: "succeeded" },
  { id: "dep-07", serviceId: "svc-07", version: "2026.07.28-a", at: "2026-07-28 09:55", result: "failed" },
  { id: "dep-08", serviceId: "svc-08", version: "2026.07.28-b", at: "2026-07-28 12:31", result: "succeeded" },
  { id: "dep-09", serviceId: "svc-09", version: "2026.07.28-c", at: "2026-07-28 15:19", result: "succeeded" },
  { id: "dep-10", serviceId: "svc-10", version: "2026.07.27-a", at: "2026-07-27 09:03", result: "succeeded" },
  { id: "dep-11", serviceId: "svc-11", version: "2026.07.27-b", at: "2026-07-27 11:44", result: "succeeded" },
  { id: "dep-12", serviceId: "svc-12", version: "2026.07.27-c", at: "2026-07-27 14:26", result: "succeeded" },
  { id: "dep-13", serviceId: "svc-01", version: "2026.07.26-a", at: "2026-07-26 10:11", result: "succeeded" },
  { id: "dep-14", serviceId: "svc-03", version: "2026.07.26-b", at: "2026-07-26 13:52", result: "succeeded" },
  { id: "dep-15", serviceId: "svc-05", version: "2026.07.25-a", at: "2026-07-25 09:37", result: "succeeded" },
  { id: "dep-16", serviceId: "svc-07", version: "2026.07.25-b", at: "2026-07-25 15:08", result: "rolled-back" },
  { id: "dep-17", serviceId: "svc-09", version: "2026.07.24-a", at: "2026-07-24 10:45", result: "succeeded" },
  { id: "dep-18", serviceId: "svc-11", version: "2026.07.24-b", at: "2026-07-24 16:30", result: "succeeded" },
];

/**
 * 요약 카드 넷. capability 하나가 이것만 돌려준다 — 표와 **다른 응답**이라야
 * "요약은 살아 있는데 표가 죽었다" 같은 부분 실패가 만들어진다.
 */
export const MOCK_SUMMARY = {
  services: MOCK_SERVICES.length,
  degraded: MOCK_SERVICES.filter((s) => s.status !== "healthy").length,
  openIncidents: MOCK_INCIDENTS.filter((i) => !i.resolved).length,
  deploysThisWeek: MOCK_DEPLOYS.length,
  /**
   * capability 는 이 값을 이미 돌려주는데 시드 화면은 쓰지 않는다 — 카드 목록이
   * **아티팩트 소유**이기 때문이다(dashboard 의 widget-list 교훈과 같은 결합).
   * 그래서 "카드 한 장을 더한다"가 국소 UI 변경 하나로 성립하고, 그것이 규모에서
   * diff 최소성을 재는 턴이 된다.
   */
  rolledBack: MOCK_DEPLOYS.filter((d) => d.result === "rolled-back").length,
};

/** 논리 스키마 시드 — 엔티티 **셋**. */
export const SEED_SCHEMA = {
  entities: {
    Service: {
      fields: {
        id: { name: "id", type: "string" },
        name: { name: "name", type: "string" },
        tier: { name: "tier", type: "string" },
        owner: { name: "owner", type: "string" },
        status: { name: "status", type: "string" },
      },
      constraints: [],
    },
    Incident: {
      fields: {
        id: { name: "id", type: "string" },
        serviceId: { name: "serviceId", type: "string" },
        severity: { name: "severity", type: "string" },
        openedAt: { name: "openedAt", type: "date" },
        summary: { name: "summary", type: "string" },
        resolved: { name: "resolved", type: "boolean" },
      },
      constraints: [],
    },
    Deploy: {
      fields: {
        id: { name: "id", type: "string" },
        serviceId: { name: "serviceId", type: "string" },
        version: { name: "version", type: "string" },
        at: { name: "at", type: "datetime" },
        result: { name: "result", type: "string" },
      },
      constraints: [],
    },
  },
};

/** 데이터 시드 — 39행. */
export const SEED_DATA = {
  Service: MOCK_SERVICES,
  Incident: MOCK_INCIDENTS,
  Deploy: MOCK_DEPLOYS,
};

/**
 * UI 아티팩트 시드. Plain-JS contract: default-export `mount(root, api)`.
 *
 * 빈 칸을 "—" 로 채우는 것은 의도다 — 표기가 없으면 값 실종이 텍스트 길이로 구별되지
 * 않는다. 자리 선언의 `placeholder` 가 그 표기를 읽는다.
 */
export const SEED_CONTENT = `export default async function mount(root, api) {
  // Four capabilities, four independent failure surfaces. Declaring only one of
  // them as expected would let the other three die unnoticed — the screen would
  // still have a summary, or still have a table, and the totals would hold up.
  const [summary, services, incidents, deploys] = await Promise.all([
    api.invoke("ops.summary", {}),
    api.invoke("ops.services", {}),
    api.invoke("ops.incidents", {}),
    api.invoke("ops.deploys", {}),
  ]);

  const serviceNameById = {};
  for (const service of services) {
    serviceNameById[service.id] = service.name;
  }

  root.innerHTML = "";
  const page = document.createElement("div");
  page.className = "ops-page";
  page.style.cssText =
    "font:14px/1.5 system-ui,-apple-system,sans-serif;color:#1d2129;padding:16px;" +
    "display:grid;gap:22px;max-width:1080px";

  // ── Summary cards ────────────────────────────────────────────────────────
  const cardSpecs = [
    { key: "services", label: "Services" },
    { key: "degraded", label: "Degraded" },
    { key: "openIncidents", label: "Open incidents" },
    { key: "deploysThisWeek", label: "Deploys this week" },
  ];
  const cards = document.createElement("section");
  cards.className = "ops-summary";
  cards.style.cssText =
    "display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px";
  for (const spec of cardSpecs) {
    const card = document.createElement("article");
    card.className = "ops-card";
    card.style.cssText = "border:1px solid #dde1e8;border-radius:10px;padding:12px 14px";
    const label = document.createElement("h3");
    label.className = "ops-card-label";
    label.style.cssText =
      "margin:0;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#5b6472";
    label.textContent = spec.label;
    const value = document.createElement("p");
    value.className = "ops-card-value";
    value.style.cssText = "margin:6px 0 0;font-size:26px;font-weight:600";
    const raw = summary[spec.key];
    value.textContent = raw === undefined || raw === null ? "—" : String(raw);
    card.append(label, value);
    cards.append(card);
  }
  page.append(cards);

  // ── A badge ──────────────────────────────────────────────────────────────
  // A second render primitive, not a repetition of the first. Cells that carry
  // a state word go through here; cells that carry a plain value do not. That
  // split is what makes "half the screen still renders" a reachable state.
  const BADGE_TONE = {
    healthy: "#1f7a4d",
    degraded: "#a5601b",
    resolved: "#1f7a4d",
    open: "#a5601b",
    succeeded: "#1f7a4d",
    failed: "#a83232",
    "rolled-back": "#a5601b",
    "sev-1": "#a83232",
    "sev-2": "#a5601b",
    "sev-3": "#5b6472",
  };
  function renderBadge(text) {
    const badge = document.createElement("span");
    badge.className = "ops-badge";
    const tone = BADGE_TONE[text] || "#5b6472";
    badge.style.cssText =
      "display:inline-block;padding:1px 8px;border-radius:999px;font-size:12px;" +
      "border:1px solid " + tone + ";color:" + tone;
    badge.textContent = text;
    return badge;
  }

  // ── One table ────────────────────────────────────────────────────────────
  // Each table declares its own columns, its own row renderer and its own empty
  // state. Growing the screen by repeating rows would not exercise any of that.
  function renderTable(config) {
    const section = document.createElement("section");
    section.className = "ops-table " + config.className;

    const heading = document.createElement("h2");
    heading.className = "ops-table-title";
    heading.style.cssText = "margin:0 0 8px;font-size:16px;font-weight:600";
    heading.textContent = config.title;
    section.append(heading);

    const table = document.createElement("table");
    table.style.cssText = "width:100%;border-collapse:collapse;font-size:13px";

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    for (const column of config.columns) {
      const th = document.createElement("th");
      th.className = "ops-head ops-head-" + column.key;
      th.style.cssText =
        "text-align:left;border-bottom:2px solid #dde1e8;padding:6px 8px;" +
        "font-weight:600;color:#3d4451";
      if (config.onSort) {
        // A header that sorts is a header that can be dead. Mount-time judgement
        // cannot tell it apart from one that works.
        th.style.cssText += ";cursor:pointer;user-select:none";
        th.textContent = column.label + (config.sortKey === column.key ? " ▾" : "");
        th.addEventListener("click", () => config.onSort(column.key));
      } else {
        th.textContent = column.label;
      }
      headRow.append(th);
    }
    thead.append(headRow);
    table.append(thead);

    const tbody = document.createElement("tbody");
    if (config.rows.length === 0) {
      const emptyRow = document.createElement("tr");
      const cell = document.createElement("td");
      cell.className = "ops-empty";
      cell.colSpan = config.columns.length;
      cell.style.cssText = "padding:12px 8px;color:#5b6472";
      cell.textContent = config.emptyText;
      emptyRow.append(cell);
      tbody.append(emptyRow);
    }
    for (const row of config.rows) {
      const tr = document.createElement("tr");
      for (const column of config.columns) {
        const td = document.createElement("td");
        td.className = "ops-cell ops-cell-" + column.key;
        td.style.cssText = "border-bottom:1px solid #eef0f4;padding:6px 8px";
        const raw = column.render ? column.render(row) : row[column.key];
        const text = raw === undefined || raw === null || raw === "" ? "—" : String(raw);
        if (column.badge && text !== "—") {
          td.append(renderBadge(text));
        } else {
          td.textContent = text;
        }
        tr.append(td);
      }
      tbody.append(tr);
    }
    table.append(tbody);
    section.append(table);
    return section;
  }

  // ── Services, with a tier filter ─────────────────────────────────────────
  const serviceColumns = [
    { key: "name", label: "Service" },
    { key: "tier", label: "Tier" },
    { key: "owner", label: "Owner" },
    { key: "status", label: "Status", badge: true },
  ];

  const servicesHost = document.createElement("section");
  servicesHost.className = "ops-services-host";

  const filterBar = document.createElement("div");
  filterBar.className = "ops-filter";
  filterBar.style.cssText = "display:flex;gap:8px;align-items:center;margin-bottom:8px";
  const filterLabel = document.createElement("span");
  filterLabel.style.cssText = "font-size:12px;color:#5b6472";
  filterLabel.textContent = "Tier";
  const filterSelect = document.createElement("select");
  filterSelect.className = "ops-tier-filter";
  filterSelect.style.cssText = "font:inherit;padding:2px 6px";
  const tiers = ["all"];
  for (const service of services) {
    if (!tiers.includes(service.tier)) tiers.push(service.tier);
  }
  for (const tier of tiers) {
    const option = document.createElement("option");
    option.value = tier;
    option.textContent = tier;
    filterSelect.append(option);
  }
  filterBar.append(filterLabel, filterSelect);

  const servicesTableHost = document.createElement("div");
  function paintServices() {
    const tier = filterSelect.value;
    const rows = tier === "all" ? services : services.filter((s) => s.tier === tier);
    servicesTableHost.innerHTML = "";
    servicesTableHost.append(
      renderTable({
        title: "Services",
        className: "ops-services",
        columns: serviceColumns,
        rows: rows,
        emptyText: "No services in this tier.",
      }),
    );
  }
  filterSelect.addEventListener("change", paintServices);
  paintServices();
  servicesHost.append(filterBar, servicesTableHost);
  page.append(servicesHost);

  // ── Ownership rollup ─────────────────────────────────────────────────────
  // Not a table. A screen whose every region is the same shape cannot show a
  // failure that takes out one shape and leaves the other standing.
  const owners = {};
  for (const service of services) {
    const key = service.owner === undefined || service.owner === null ? "—" : String(service.owner);
    if (!owners[key]) owners[key] = { total: 0, degraded: 0 };
    owners[key].total += 1;
    if (service.status !== "healthy") owners[key].degraded += 1;
  }
  const rollup = document.createElement("section");
  rollup.className = "ops-owners";
  const rollupTitle = document.createElement("h2");
  rollupTitle.className = "ops-table-title";
  rollupTitle.style.cssText = "margin:0 0 8px;font-size:16px;font-weight:600";
  rollupTitle.textContent = "Ownership";
  rollup.append(rollupTitle);
  const rollupList = document.createElement("dl");
  rollupList.style.cssText =
    "margin:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px";
  for (const owner of Object.keys(owners).sort()) {
    const entry = document.createElement("div");
    entry.style.cssText = "border-left:3px solid #dde1e8;padding:2px 0 2px 10px";
    const term = document.createElement("dt");
    term.className = "ops-owner-name";
    term.style.cssText = "font-weight:600";
    term.textContent = owner;
    const detail = document.createElement("dd");
    detail.className = "ops-owner-count";
    detail.style.cssText = "margin:2px 0 0;color:#5b6472;font-size:13px";
    const counts = owners[owner];
    detail.textContent =
      counts.total + " service" + (counts.total === 1 ? "" : "s") +
      (counts.degraded > 0 ? " · " + counts.degraded + " degraded" : "");
    entry.append(term, detail);
    rollupList.append(entry);
  }
  rollup.append(rollupList);
  page.append(rollup);

  // ── Incidents ────────────────────────────────────────────────────────────
  page.append(
    renderTable({
      title: "Incidents",
      className: "ops-incidents",
      columns: [
        { key: "id", label: "ID" },
        { key: "serviceId", label: "Service", render: (row) => serviceNameById[row.serviceId] },
        { key: "severity", label: "Severity", badge: true },
        { key: "openedAt", label: "Opened" },
        { key: "summary", label: "Summary" },
        {
          key: "resolved",
          label: "State",
          badge: true,
          render: (row) => (row.resolved ? "resolved" : "open"),
        },
      ],
      rows: incidents,
      emptyText: "No incidents recorded.",
    }),
  );

  // ── Deploys, sortable ────────────────────────────────────────────────────
  const deployColumns = [
    { key: "id", label: "ID" },
    { key: "serviceId", label: "Service", render: (row) => serviceNameById[row.serviceId] },
    { key: "version", label: "Version" },
    { key: "at", label: "When" },
    { key: "result", label: "Result", badge: true },
  ];
  const deployHost = document.createElement("div");
  deployHost.className = "ops-deploys-host";
  let deploySortKey = "at";
  function paintDeploys() {
    const rows = deploys.slice().sort((a, b) => {
      const left = a[deploySortKey] === undefined ? "" : String(a[deploySortKey]);
      const right = b[deploySortKey] === undefined ? "" : String(b[deploySortKey]);
      return left < right ? 1 : left > right ? -1 : 0;
    });
    deployHost.innerHTML = "";
    deployHost.append(
      renderTable({
        title: "Deploys",
        className: "ops-deploys",
        columns: deployColumns,
        rows: rows,
        emptyText: "No deploys recorded.",
        sortKey: deploySortKey,
        onSort: (key) => {
          deploySortKey = key;
          paintDeploys();
        },
      }),
    );
  }
  paintDeploys();
  page.append(deployHost);

  root.append(page);
}
`;
