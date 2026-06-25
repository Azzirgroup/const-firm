frappe.pages["project-gantt"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Project Gantt View"),
		single_column: true,
	});

	const state = { project: null, zoom: 40, collapsed: new Set(), data: null, scrollLeft: 0 };
	page._state = state;

	page.add_field({
		fieldname: "project",
		label: __("Project"),
		fieldtype: "Link",
		options: "Project",
		change() {
			const v = this.get_value();
			if (v !== state.project) { state.project = v; state.collapsed.clear(); load(page, state); }
		},
	});

	page.add_inner_button(__("Expand All"), () => { state.collapsed.clear(); draw(page, state); });
	page.add_inner_button(__("Collapse All"), () => { collapse_all(state); draw(page, state); });
	page.add_inner_button("＋", () => { state.zoom = Math.min(84, state.zoom + 8); draw(page, state); });
	page.add_inner_button("－", () => { state.zoom = Math.max(16, state.zoom - 8); draw(page, state); });
	page.add_inner_button(__("Refresh"), () => load(page, state));
	page.set_indicator(__("Live"), "green");

	ensure_styles();
	$(page.body).html(`<div id="pg-root" style="padding:6px 2px 26px"></div>`);
	load(page, state);
};

const PG = {
	statusColor(s) {
		return {
			Completed: "#15A34A", Working: "#2563EB", Open: "#94A3B8",
			"Pending Review": "#D97706", Overdue: "#E11D48", Cancelled: "#94A3B8",
			Draft: "#94A3B8", "In Progress": "#2563EB",
		}[s] || "#64748B";
	},
	parseDate(s) {
		if (!s) return null;
		const d = frappe.datetime.str_to_obj(s);
		return isNaN(d) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
	},
	addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; },
	dayDiff(a, b) { return Math.round((b - a) / 86400000); },
	fmtMoney(v) { return frappe.format(v || 0, { fieldtype: "Currency" }); },
	fmtDate(d) { return d ? frappe.datetime.obj_to_user(d) : "—"; },
};

function ensure_styles() {
	if (document.getElementById("pg-styles")) return;
	const css = `
	#pg-root *{box-sizing:border-box}
	.pg-wrap{border:1px solid #e6e9ef;border-radius:16px;overflow:hidden;background:#fff;
		box-shadow:0 1px 2px rgba(16,24,40,.04),0 8px 24px -12px rgba(16,24,40,.12)}
	.pg-head{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:15px 20px;
		background:linear-gradient(180deg,#fbfcfe 0%,#f3f6fb 100%);border-bottom:1px solid #e9edf3}
	.pg-proj-name{font-size:1.08rem;font-weight:800;color:#0f172a;letter-spacing:-.01em}
	.pg-proj-sub{font-size:.78rem;color:#64748b;margin-top:4px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
	.pg-pill{display:inline-flex;align-items:center;gap:5px;font-size:.68rem;font-weight:800;
		padding:2px 10px;border-radius:999px;letter-spacing:.02em}
	.pg-head-right{display:flex;align-items:center;gap:18px}
	.pg-ring-wrap{display:flex;align-items:center;gap:10px}
	.pg-ring-num{font-size:1.15rem;font-weight:800;color:#0f172a;line-height:1}
	.pg-ring-lbl{font-size:.66rem;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
	.pg-scroll{overflow:auto;max-height:70vh;scrollbar-width:thin;scrollbar-color:#cbd5e1 transparent}
	.pg-scroll::-webkit-scrollbar{height:11px;width:11px}
	.pg-scroll::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:9px;border:3px solid #fff}
	.pg-scroll::-webkit-scrollbar-thumb:hover{background:#94a3b8}
	.pg-hrow{display:flex;position:sticky;top:0;z-index:6;background:#fff;border-bottom:1px solid #e6e9ef;
		box-shadow:0 3px 8px -4px rgba(16,24,40,.18)}
	.pg-hcell{position:sticky;z-index:7;background:#fff;display:flex;align-items:flex-end;
		padding:8px 16px 9px;font-weight:800;font-size:.72rem;color:#64748b;text-transform:uppercase;
		letter-spacing:.05em;border-right:1px solid #e6e9ef}
	.pg-row{display:flex;align-items:stretch;border-bottom:1px solid #f4f5f7;transition:background .1s}
	.pg-row:hover{background:#f1f6fe}
	.pg-row--project{background:#f8fafc}
	.pg-sticky{position:sticky;background:#fff;display:flex;align-items:center;border-right:1px solid #eef0f3}
	.pg-row--project .pg-sticky{background:#f8fafc}
	.pg-row:hover .pg-sticky{background:#f1f6fe}
	.pg-name a{color:#0f172a;text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:.84rem}
	.pg-name a:hover{color:#2563eb;text-decoration:underline}
	.pg-caret{cursor:pointer;width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;
		color:#94a3b8;border-radius:5px;transition:transform .14s ease,background .12s,color .12s;font-size:.58rem}
	.pg-caret:hover{background:#e2e8f0;color:#334155}
	.pg-badge{font-size:.58rem;font-weight:800;border-radius:999px;padding:2px 8px;white-space:nowrap;
		letter-spacing:.04em;text-transform:uppercase}
	.pg-tl{position:relative}
	.pg-bar{position:absolute;top:50%;transform:translateY(-50%);cursor:pointer;
		transition:filter .12s,box-shadow .12s;display:flex;align-items:center}
	.pg-bar:hover{filter:brightness(1.05) saturate(1.05);box-shadow:0 4px 12px -3px rgba(16,24,40,.3)}
	.pg-fill{height:100%;border-radius:inherit;box-shadow:inset 0 1px 0 rgba(255,255,255,.4)}
	.pg-bar-label{position:absolute;right:8px;font-size:.6rem;font-weight:800;color:#fff;
		text-shadow:0 1px 1.5px rgba(0,0,0,.3);pointer-events:none}
	.pg-dot{position:absolute;top:50%;transform:translateY(-50%);cursor:pointer;border-radius:50%;
		border:2px solid #fff;transition:transform .1s}
	.pg-dot:hover{transform:translateY(-50%) scale(1.25)}
	.pg-today-pill{position:absolute;top:4px;transform:translateX(-50%);background:#e11d48;color:#fff;
		font-size:.58rem;font-weight:800;padding:1px 7px;border-radius:7px;white-space:nowrap;z-index:7;
		box-shadow:0 2px 6px -1px rgba(225,29,72,.5)}
	.pg-empty{padding:50px;text-align:center;color:#94a3b8}
	`;
	const s = document.createElement("style");
	s.id = "pg-styles";
	s.textContent = css;
	document.head.appendChild(s);
}

async function load(page, state) {
	$("#pg-root").html(`<div class="pg-empty">${__("Loading…")}</div>`);
	const r = await frappe.call({
		method: "regence.regence.api.get_project_gantt",
		args: { project: state.project },
	});
	state.data = r.message || {};
	if (state.data.project && state.data.project.name !== state.project) {
		state.project = state.data.project.name;
		page.fields_dict.project.set_value(state.project);
	}
	draw(page, state);
}

function ring(pct) {
	pct = Math.max(0, Math.min(100, Math.round(pct || 0)));
	const R = 16, C = 2 * Math.PI * R;
	const col = pct >= 100 ? "#15A34A" : pct >= 50 ? "#2563EB" : pct > 0 ? "#D97706" : "#94A3B8";
	return `<div class="pg-ring-wrap">
		<svg width="44" height="44" viewBox="0 0 40 40">
			<circle cx="20" cy="20" r="${R}" fill="none" stroke="#e8edf3" stroke-width="4"/>
			<circle cx="20" cy="20" r="${R}" fill="none" stroke="${col}" stroke-width="4" stroke-linecap="round"
				stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct / 100)}"
				transform="rotate(-90 20 20)"/>
		</svg>
		<div><div class="pg-ring-num" style="color:${col}">${pct}%</div>
			<div class="pg-ring-lbl">${__("Overall")}</div></div>
	</div>`;
}

function draw(page, state) {
	const d = state.data || {};
	const root = $("#pg-root");
	if (!d.project) {
		root.html(`<div class="pg-wrap"><div class="pg-empty">${__("No projects found.")}</div></div>`);
		return;
	}

	const prev = document.getElementById("pg-scroll");
	if (prev) state.scrollLeft = prev.scrollLeft;

	const p = d.project;
	const statusCol = PG.statusColor(p.status === "Completed" ? "Completed" : p.status === "Cancelled" ? "Cancelled" : "Working");
	const head = `<div class="pg-head">
		<div>
			<div class="pg-proj-name">${frappe.utils.escape_html(p.project_name || p.name)}</div>
			<div class="pg-proj-sub">
				${p.customer ? `<span>👤 ${frappe.utils.escape_html(p.customer)}</span>` : ""}
				<span class="pg-pill" style="color:${statusCol};background:${statusCol}1a">${__(p.status || "—")}</span>
				<span>${(d.tasks || []).length} ${__("tasks")} · ${(d.job_cards || []).length} ${__("job cards")}</span>
			</div>
		</div>
		<div class="pg-head-right">${ring(p.percent_complete)}</div>
	</div>`;

	root.html(`<div class="pg-wrap">${head}${gantt(d, state)}</div>${legend()}`);

	const sc = document.getElementById("pg-scroll");
	if (sc) sc.scrollLeft = state.scrollLeft || Math.max(0, parseInt(sc.dataset.todayLeft || "0", 10) - 280);

	root.find(".pg-caret").on("click", function (e) {
		e.preventDefault(); e.stopPropagation();
		const k = $(this).attr("data-key");
		if (state.collapsed.has(k)) state.collapsed.delete(k); else state.collapsed.add(k);
		draw(page, state);
	});
	root.find("[data-route]").on("click", function (e) {
		if ($(e.target).closest(".pg-caret").length) return;
		const parts = ($(this).attr("data-route") || "").split("/").filter(Boolean);
		if (parts.length) frappe.set_route(parts.slice(1));
	});
}

function build_rows(d) {
	const rows = [];
	const p = d.project;
	const pkey = "P::" + p.name;

	const childrenOf = {};
	d.tasks.forEach(t => {
		const k = t.parent_task || "__root__";
		(childrenOf[k] = childrenOf[k] || []).push(t);
	});
	const cardsOf = {};
	(d.job_cards || []).forEach(c => { (cardsOf[c.task] = cardsOf[c.task] || []).push(c); });

	const topLevel = childrenOf["__root__"] || [];
	rows.push({
		key: pkey, parentKey: null, kind: "project", depth: 0,
		badge: __("Project"), badgeColor: "#4F46E5",
		label: p.project_name || p.name, route: `/app/project/${encodeURIComponent(p.name)}`,
		status: p.status === "Completed" ? "Completed" : "Working", progress: p.percent_complete || 0,
		start: PG.parseDate(p.expected_start_date), end: PG.parseDate(p.expected_end_date),
		hasChildren: topLevel.length > 0,
	});

	const today = d.today;
	const emit = (task, depth, parentKey) => {
		const tkey = "T::" + task.name;
		const kids = childrenOf[task.name] || [];
		const cards = cardsOf[task.name] || [];
		const overdue = task.status !== "Completed" && task.status !== "Cancelled"
			&& task.exp_end_date && String(task.exp_end_date) < today;
		rows.push({
			key: tkey, parentKey, kind: task.is_group ? "parent" : "child", depth,
			badge: task.is_group ? __("Phase") : __("Task"),
			badgeColor: task.is_group ? "#0D9488" : "#2563EB",
			label: task.subject, route: `/app/task/${encodeURIComponent(task.name)}`,
			status: overdue ? "Overdue" : task.status, progress: task.progress || 0,
			start: PG.parseDate(task.exp_start_date), end: PG.parseDate(task.exp_end_date),
			cost: task.custom_boq_amount,
			hasChildren: kids.length > 0 || cards.length > 0,
		});
		cards.forEach(c => {
			const s = PG.parseDate(c.scheduled_date);
			const e = PG.parseDate(c.completion_date) || s;
			rows.push({
				key: "J::" + c.name, parentKey: tkey, kind: "jobcard", depth: depth + 1,
				badge: "", badgeColor: "#7C3AED",
				label: c.name, route: `/app/field-job-card/${encodeURIComponent(c.name)}`,
				status: c.status, progress: c.status === "Completed" ? 100 : 0,
				start: s, end: e,
				cost: (c.total_material_cost || 0) + (c.total_service_cost || 0),
				hasChildren: false,
			});
		});
		kids.forEach(ch => emit(ch, depth + 1, tkey));
	};
	topLevel.forEach(t => emit(t, 1, pkey));
	return rows;
}

function collapse_all(state) {
	const rows = build_rows(state.data || {});
	rows.forEach(r => { if (r.hasChildren && r.kind !== "project") state.collapsed.add(r.key); });
}

function visible_rows(rows, collapsed) {
	const parentOf = {};
	rows.forEach(r => { parentOf[r.key] = r.parentKey; });
	const hidden = (r) => {
		let pk = r.parentKey;
		while (pk) { if (collapsed.has(pk)) return true; pk = parentOf[pk]; }
		return false;
	};
	return rows.filter(r => !hidden(r));
}

function gantt(d, state) {
	const allRows = build_rows(d);
	const rows = visible_rows(allRows, state.collapsed);

	let min = null, max = null;
	allRows.forEach(r => {
		[r.start, r.end].forEach(x => {
			if (!x) return;
			if (!min || x < min) min = x;
			if (!max || x > max) max = x;
		});
	});
	if (!min || !max) { min = PG.parseDate(d.today); max = PG.addDays(min, 30); }
	min = PG.addDays(min, -2);
	max = PG.addDays(max, 3);

	const DAY = state.zoom, NAME_W = 348, PROG_W = 196, LEFT = NAME_W + PROG_W;
	const totalDays = PG.dayDiff(min, max) + 1;
	const gridW = totalDays * DAY;
	const fullW = LEFT + gridW;
	const ROW_H = 38;

	const days = [];
	for (let i = 0; i < totalDays; i++) days.push(PG.addDays(min, i));

	const today = PG.parseDate(d.today);
	const todayIdx = today ? PG.dayDiff(min, today) : -1;
	const todayLeft = todayIdx >= 0 ? LEFT + todayIdx * DAY : -1;

	// Month bands
	const months = [];
	days.forEach(dt => {
		const key = dt.getFullYear() + "-" + dt.getMonth();
		const last = months[months.length - 1];
		if (last && last.key === key) last.span++;
		else months.push({ key, span: 1, idx: months.length, label: dt.toLocaleString("default", { month: "short", year: "numeric" }) });
	});
	const monthHtml = months.map(m =>
		`<div style="width:${m.span * DAY}px;flex:0 0 ${m.span * DAY}px;text-align:center;font-size:.74rem;
			font-weight:800;color:#475569;border-right:1px solid #e6e9ef;padding:7px 0;
			background:${m.idx % 2 ? "#fbfcfe" : "#f6f8fc"}">${m.label}</div>`
	).join("");

	const showDayNum = DAY >= 26;
	const dayHtml = days.map(dt => {
		const wknd = dt.getDay() === 0 || dt.getDay() === 6;
		const isToday = todayIdx >= 0 && PG.dayDiff(min, dt) === todayIdx;
		const dn = ["S", "M", "T", "W", "T", "F", "S"][dt.getDay()];
		return `<div style="width:${DAY}px;flex:0 0 ${DAY}px;text-align:center;padding:5px 0;
			border-right:1px solid #f1f3f6;${wknd ? "background:#f7f9fc;" : ""}${isToday ? "background:#eff5ff;" : ""}">
			<div style="font-size:.6rem;font-weight:700;color:${isToday ? "#2563EB" : (dt.getDay() === 0 ? "#E11D48" : "#a8b2c0")}">${dn}</div>
			${showDayNum ? `<div style="font-size:.72rem;font-weight:700;color:${isToday ? "#2563EB" : "#475569"}">${dt.getDate()}</div>` : ""}
		</div>`;
	}).join("");

	// Timeline background: daily gridlines + weekend shading aligned to the axis.
	const sunOff = (0 - min.getDay() + 7) % 7;
	const satOff = (6 - min.getDay() + 7) % 7;
	const wk = "#f8fafc";
	const tlBg =
		`repeating-linear-gradient(90deg,#f1f3f6 0 1px,transparent 1px ${DAY}px),` +
		`repeating-linear-gradient(90deg,transparent 0 ${sunOff * DAY}px,${wk} ${sunOff * DAY}px ${(sunOff + 1) * DAY}px,transparent ${(sunOff + 1) * DAY}px ${7 * DAY}px),` +
		`repeating-linear-gradient(90deg,transparent 0 ${satOff * DAY}px,${wk} ${satOff * DAY}px ${(satOff + 1) * DAY}px,transparent ${(satOff + 1) * DAY}px ${7 * DAY}px)`;

	const stickyLeft = (left, w) => `position:sticky;left:${left}px;width:${w}px;flex:0 0 ${w}px`;

	const todayPill = todayIdx >= 0
		? `<div class="pg-today-pill" style="left:${todayIdx * DAY + DAY / 2}px">${__("Today")}</div>` : "";

	const header = `
		<div class="pg-hrow" style="min-width:${fullW}px">
			<div class="pg-hcell" style="${stickyLeft(0, NAME_W)};z-index:8">${__("Task Name")}</div>
			<div class="pg-hcell" style="${stickyLeft(NAME_W, PROG_W)};z-index:8">${__("Progress")}</div>
			<div style="flex:0 0 ${gridW}px;width:${gridW}px;position:relative">
				<div style="display:flex">${monthHtml}</div>
				<div style="display:flex">${dayHtml}</div>
				${todayPill}
			</div>
		</div>`;

	const bodyRows = rows.map(r => {
		const indent = r.depth * 18;
		const icon = { project: "🏢", parent: "📂", child: "🗂️", jobcard: "📅" }[r.kind] || "";
		const isJC = r.kind === "jobcard";
		const nameWeight = r.kind === "project" ? 800 : r.kind === "parent" ? 700 : isJC ? 400 : 600;
		const collapsed = state.collapsed.has(r.key);
		const caret = r.hasChildren
			? `<span class="pg-caret" data-key="${r.key}" style="transform:rotate(${collapsed ? 0 : 90}deg)">▶</span>`
			: `<span style="display:inline-block;width:18px"></span>`;
		const badge = r.badge
			? `<span class="pg-badge" style="margin-left:8px;color:${r.badgeColor};background:${r.badgeColor}17">${r.badge}</span>`
			: "";

		const col = PG.statusColor(r.status);
		const tip = `${r.label}  ·  ${r.status || ""}\n${PG.fmtDate(r.start)} → ${PG.fmtDate(r.end)}` +
			(!isJC ? `\n${__("Progress")}: ${Math.round(r.progress || 0)}%` : "") +
			(r.cost ? `\n${__("Amount")}: ${PG.fmtMoney(r.cost)}` : "");

		let bar = "";
		if (r.start && r.end) {
			const si = Math.max(0, PG.dayDiff(min, r.start));
			const ei = Math.min(totalDays - 1, PG.dayDiff(min, r.end));
			const left = si * DAY, w = Math.max(DAY * 0.55, (ei - si + 1) * DAY - 5);
			const h = r.kind === "project" ? 17 : r.kind === "parent" ? 15 : 12;
			const prog = Math.max(0, Math.min(100, r.progress || 0));
			const fillGrad = `linear-gradient(180deg,${col}f2,${col})`;
			const showLbl = w > 42 && !isJC;
			bar = `<div class="pg-bar" data-route="${r.route}" title="${frappe.utils.escape_html(tip)}"
				style="left:${left + 2}px;width:${w}px;height:${h}px;border-radius:${h}px;background:${col}24">
				<div class="pg-fill" style="width:${prog}%;background:${fillGrad}"></div>
				${showLbl ? `<span class="pg-bar-label">${Math.round(prog)}%</span>` : ""}
			</div>`;
		} else if (isJC && r.start) {
			const si = Math.max(0, PG.dayDiff(min, r.start));
			bar = `<div class="pg-dot" data-route="${r.route}" title="${frappe.utils.escape_html(tip)}"
				style="left:${si * DAY + DAY / 2 - 5}px;width:11px;height:11px;background:${col};box-shadow:0 0 0 1.5px ${col}66"></div>`;
		}

		const statusPill = isJC
			? `<span class="pg-pill" style="color:${col};background:${col}18">${__(r.status || "")}</span>`
			: `<div style="flex:1;background:#eaedf1;border-radius:5px;height:8px;overflow:hidden">
					<div style="width:${Math.round(r.progress || 0)}%;height:8px;border-radius:5px;background:linear-gradient(90deg,${col}cc,${col})"></div>
				</div>
				<span style="font-size:.74rem;font-weight:800;color:${col};min-width:36px;text-align:right">${Math.round(r.progress || 0)}%</span>`;

		const rowCls = "pg-row" + (r.kind === "project" ? " pg-row--project" : "");
		return `<div class="${rowCls}" style="min-width:${fullW}px;height:${ROW_H}px">
			<div class="pg-sticky pg-name" style="${stickyLeft(0, NAME_W)};padding:0 12px 0 ${12 + indent}px">
				${caret}<span style="margin:0 7px">${icon}</span>
				<a href="${r.route}" style="font-weight:${nameWeight}">${frappe.utils.escape_html(r.label)}</a>
				${badge}
			</div>
			<div class="pg-sticky" style="${stickyLeft(NAME_W, PROG_W)};gap:9px;padding:0 16px">${statusPill}</div>
			<div class="pg-tl" style="flex:0 0 ${gridW}px;width:${gridW}px;background-image:${tlBg}">
				${todayIdx >= 0 ? `<div style="position:absolute;left:${todayIdx * DAY + DAY / 2}px;top:0;bottom:0;width:2px;background:linear-gradient(180deg,#fb7185,#e11d48);z-index:0;opacity:.7"></div>` : ""}
				${bar}
			</div>
		</div>`;
	}).join("");

	return `<div id="pg-scroll" class="pg-scroll" data-today-left="${todayLeft}">${header}${bodyRows}</div>`;
}

function legend() {
	const item = (c, t) =>
		`<span style="display:inline-flex;align-items:center;gap:6px;font-size:.75rem;color:#64748b;font-weight:600">
			<span style="width:16px;height:9px;border-radius:5px;background:linear-gradient(90deg,${c}cc,${c})"></span>${t}</span>`;
	return `<div style="display:flex;gap:20px;flex-wrap:wrap;margin:14px 6px 0;align-items:center">
		${item("#15A34A", __("Completed"))}
		${item("#2563EB", __("In Progress"))}
		${item("#94A3B8", __("Pending"))}
		${item("#D97706", __("Pending Review"))}
		${item("#E11D48", __("Delayed"))}
		<span style="font-size:.75rem;color:#94a3b8;margin-left:auto;font-weight:500">${__("Click a bar to open · ▶ to collapse · ＋／－ to zoom")}</span>
	</div>`;
}
