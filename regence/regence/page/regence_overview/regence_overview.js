frappe.pages["regence-overview"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Overview"),
		single_column: true,
	});
	page.add_action_item(__("Refresh"), () => render_all());
	$(page.body).html(`<div id="ov-root" style="padding:20px"></div>`);
	render_all();
};

async function render_all() {
	const root = $("#ov-root").html(
		`<div style="text-align:center;padding:40px;color:#888">${__("Loading…")}</div>`);

	const r = await frappe.call({ method: "regence.regence.api.get_overview" });
	const d = r.message || {};
	const {
		projects = [], open_tasks = 0, overdue_tasks = 0,
		fjc = [], mr_count = 0, att_today = [],
		emp_count = 0, assets = [],
		invoices_due = {total:0,count:0},
		pi_month = 0, si_month = 0,
		pos = {total:0,count:0}, sos = {total:0,count:0},
		today = "",
	} = d;

	const att_map = {};
	att_today.forEach(a => { att_map[a.status] = a.cnt || 0; });
	const present    = att_map["Present"] || 0;
	const att_rate   = emp_count ? Math.round(present / emp_count * 100) : 0;
	const assets_ok  = assets.filter(a => ["In Location","Submit"].includes(a.status)).reduce((s,a)=>s+a.cnt,0);
	const assets_bad = assets.filter(a => a.status === "Out of Order").reduce((s,a)=>s+a.cnt,0);
	const total_assets = assets.reduce((s,a)=>s+a.cnt,0);
	const fjc_cost   = fjc.reduce((s,c) => s+(c.total_material_cost||0)+(c.total_service_cost||0), 0);
	const fjc_comp   = fjc.filter(c => c.status === "Completed").length;
	const profit_mtd = si_month - pi_month;

	root.html(`
		<!-- Hero banner -->
		<div style="background:linear-gradient(135deg,#064e3b 0%,#16A34A 100%);border-radius:12px;padding:24px 28px;margin-bottom:20px;color:#fff">
			<div style="font-size:1.5rem;font-weight:700">${__("Regence — Construction Overview")}</div>
			<div style="opacity:.8;font-size:.9rem;margin-top:4px">${frappe.datetime.str_to_user(today)} · ${__("Real-time snapshot")}</div>
			<div class="row" style="margin-top:20px">
				${top_stat(__("Active Projects"),  projects.length,           "📁")}
				${top_stat(__("Open Tasks"),       open_tasks,                "✅")}
				${top_stat(__("Overdue Tasks"),    overdue_tasks,             "⚠️")}
				${top_stat(__("Pending MRs"),      mr_count,                  "📦")}
				${top_stat(__("FJC This Month"),   fjc.length,                "🔧")}
				${top_stat(__("Staff Present"),    `${present}/${emp_count}`, "👷")}
			</div>
		</div>

		<!-- Revenue vs Spend this month -->
		<div class="row" style="margin-bottom:16px">
			<div class="col-md-3">
				<div style="background:linear-gradient(135deg,#064e3b,#059669);border-radius:10px;padding:14px 18px;color:#fff;text-align:center;height:100%">
					<div style="font-size:.8rem;opacity:.85">${__("Revenue / Month")}</div>
					<div style="font-size:1.2rem;font-weight:700;margin-top:4px">${frappe.format(si_month,{fieldtype:"Currency"})}</div>
				</div>
			</div>
			<div class="col-md-3">
				<div style="background:linear-gradient(135deg,#7f1d1d,#DC2626);border-radius:10px;padding:14px 18px;color:#fff;text-align:center;height:100%">
					<div style="font-size:.8rem;opacity:.85">${__("Spend / Month")}</div>
					<div style="font-size:1.2rem;font-weight:700;margin-top:4px">${frappe.format(pi_month,{fieldtype:"Currency"})}</div>
				</div>
			</div>
			<div class="col-md-3">
				<div style="background:linear-gradient(135deg,${profit_mtd>=0?"#14532d,#16A34A":"#7f1d1d,#DC2626"});border-radius:10px;padding:14px 18px;color:#fff;text-align:center;height:100%">
					<div style="font-size:.8rem;opacity:.85">${__("Profit / Month")}</div>
					<div style="font-size:1.2rem;font-weight:700;margin-top:4px">${frappe.format(Math.abs(profit_mtd),{fieldtype:"Currency"})}</div>
					<div style="font-size:.7rem;opacity:.8">${profit_mtd>=0?"▲ "+__("Surplus"):"▼ "+__("Deficit")}</div>
				</div>
			</div>
			<div class="col-md-3">
				<div style="background:linear-gradient(135deg,#7f1d1d,#9f1239);border-radius:10px;padding:14px 18px;color:#fff;text-align:center;height:100%">
					<div style="font-size:.8rem;opacity:.85">${__("Draft Payables")}</div>
					<div style="font-size:1.2rem;font-weight:700;margin-top:4px">${frappe.format(invoices_due.total,{fieldtype:"Currency"})}</div>
					<div style="font-size:.7rem;opacity:.8">${invoices_due.count} ${__("invoices")}</div>
				</div>
			</div>
		</div>

		<div class="row" style="margin-bottom:16px">
			<div class="col-md-6">
				<div class="frappe-card" style="padding:16px;height:100%">
					<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
						<h5 style="margin:0;font-size:1rem">${__("Active Projects")}</h5>
						<a href="/app/project" style="font-size:.8rem">${__("View all →")}</a>
					</div>
					${projects_section(projects, today)}
				</div>
			</div>
			<div class="col-md-6">
				<div class="frappe-card" style="padding:16px;height:100%">
					<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
						<h5 style="margin:0;font-size:1rem">${__("Tasks At a Glance")}</h5>
					</div>
					${task_donut(open_tasks, overdue_tasks)}
				</div>
			</div>
		</div>

		<div class="row" style="margin-bottom:16px">
			<div class="col-md-4">
				<div class="frappe-card" style="padding:16px;height:100%">
					<h5 style="margin:0 0 14px;font-size:1rem">${__("Finance Snapshot")}</h5>
					${finance_section(invoices_due, pi_month, pos, sos)}
				</div>
			</div>
			<div class="col-md-4">
				<div class="frappe-card" style="padding:16px;height:100%">
					<h5 style="margin:0 0 14px;font-size:1rem">${__("Field Job Cards – This Month")}</h5>
					${fjc_section(fjc, fjc_cost, fjc_comp)}
				</div>
			</div>
			<div class="col-md-4">
				<div class="frappe-card" style="padding:16px;height:100%">
					<h5 style="margin:0 0 14px;font-size:1rem">${__("Assets & HR")}</h5>
					${assets_hr_section(total_assets, assets_ok, assets_bad, emp_count, present, att_rate)}
				</div>
			</div>
		</div>

		<!-- Quick Navigation -->
		<div class="frappe-card" style="padding:16px">
			<h5 style="margin:0 0 14px;font-size:1rem">${__("Quick Navigation")}</h5>
			<div style="display:flex;flex-wrap:wrap;gap:10px">
				${qlink("construction-dashboard", __("Construction Dashboard"), "#2563EB",  "📊")}
				${qlink("equipment-tracker",      __("Equipment Tracker"),      "#D97706",  "🔩")}
				${qlink("site-labour",            __("Site Labour"),            "#16A34A",  "👷")}
				${qlink("financial-analytics",    __("Financial Analytics"),    "#059669",  "💰")}
				${qlink("procurement-dashboard",  __("Procurement"),            "#0891B2",  "📦")}
				${qlink_doc("Field Job Card",     __("Field Job Cards"),        "#7C3AED",  "🔧")}
				${qlink_doc("Material Request",   __("Material Requests"),      "#D97706",  "📦")}
				${qlink_doc("Asset",              __("Assets"),                 "#EA580C",  "🏗️")}
				${qlink_doc("Project",            __("Projects"),               "#4F46E5",  "📁")}
				${qlink_doc("Purchase Invoice",   __("Purchase Invoices"),      "#DC2626",  "🧾")}
				${qlink_doc("Sales Invoice",      __("Sales Invoices"),         "#16A34A",  "💵")}
			</div>
		</div>
	`);
}

function top_stat(label, value, icon) {
	return `<div class="col" style="padding:4px">
		<div style="background:rgba(255,255,255,.12);border-radius:8px;padding:12px 10px;text-align:center">
			<div style="font-size:1.1rem">${icon}</div>
			<div style="font-size:1.4rem;font-weight:700;line-height:1.2">${value}</div>
			<div style="font-size:.72rem;opacity:.85;margin-top:3px">${label}</div>
		</div>
	</div>`;
}

function projects_section(projects, today) {
	if (!projects.length) return `<p class="text-muted small">${__("No active projects")}</p>`;
	return projects.map(p => {
		const pct   = p.percent_complete || 0;
		const color = pct >= 75 ? "#16A34A" : pct >= 40 ? "#D97706" : "#DC2626";
		const late  = p.expected_end_date && p.expected_end_date < today;
		return `<div style="margin-bottom:14px">
			<div style="display:flex;justify-content:space-between;font-size:.85rem;margin-bottom:3px">
				<a href="/app/project/${p.name}" style="font-weight:600">${p.project_name}</a>
				<span style="color:${late?"#DC2626":"#6b7280"};font-size:.75rem">
					${p.expected_end_date ? frappe.format(p.expected_end_date,{fieldtype:"Date"}) : ""}
				</span>
			</div>
			<div style="display:flex;align-items:center;gap:8px">
				<div style="flex:1;background:#e5e7eb;border-radius:4px;height:8px">
					<div style="background:${color};width:${pct}%;height:8px;border-radius:4px"></div>
				</div>
				<span style="font-size:.75rem;font-weight:600;color:${color};min-width:32px">${pct}%</span>
			</div>
		</div>`;
	}).join("");
}

function task_donut(open, overdue) {
	const ok = open - overdue;
	const pct_overdue = open ? Math.round(overdue/open*100) : 0;
	return `
		<div style="display:flex;justify-content:center;margin:8px 0 16px">
			<div style="position:relative;width:120px;height:120px">
				<svg viewBox="0 0 36 36" style="width:120px;height:120px;transform:rotate(-90deg)">
					<circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" stroke-width="3.5"/>
					<circle cx="18" cy="18" r="15.9" fill="none" stroke="#DC2626" stroke-width="3.5"
						stroke-dasharray="${pct_overdue} ${100-pct_overdue}" stroke-linecap="round"/>
				</svg>
				<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
					<div style="font-size:1.4rem;font-weight:700">${open}</div>
					<div style="font-size:.65rem;color:#6b7280">OPEN</div>
				</div>
			</div>
		</div>
		<div style="display:flex;justify-content:center;gap:24px;font-size:.82rem">
			<div style="text-align:center">
				<div style="font-size:1.2rem;font-weight:700;color:#16A34A">${ok}</div>
				<div style="color:#6b7280">${__("On Track")}</div>
			</div>
			<div style="text-align:center">
				<div style="font-size:1.2rem;font-weight:700;color:#DC2626">${overdue}</div>
				<div style="color:#6b7280">${__("Overdue")}</div>
			</div>
		</div>`;
}

function finance_section(inv, pi_month, pos, sos) {
	return `
		${stat_row(__("Draft Invoices (Payable)"), frappe.format(inv.total,{fieldtype:"Currency"}), "#DC2626")}
		${stat_row(__("Purchases This Month"),     frappe.format(pi_month,{fieldtype:"Currency"}), "#D97706")}
		${stat_row(__("POs Pending Receipt"),      `${pos.count} — ${frappe.format(pos.total,{fieldtype:"Currency"})}`, "#2563EB")}
		${stat_row(__("SOs Pending Billing"),      `${sos.count} — ${frappe.format(sos.total,{fieldtype:"Currency"})}`, "#16A34A")}`;
}

function fjc_section(fjc, total_cost, completed) {
	const pending = fjc.filter(c=>c.status==="In Progress").length;
	const draft   = fjc.filter(c=>c.status==="Draft").length;
	return `
		${stat_row(__("Total This Month"), fjc.length, "#2563EB")}
		${stat_row(__("Completed"),        completed,  "#16A34A")}
		${stat_row(__("In Progress"),      pending,    "#D97706")}
		${stat_row(__("Draft"),            draft,      "#6B7280")}
		${stat_row(__("Total Cost"), frappe.format(total_cost,{fieldtype:"Currency"}), "#7C3AED")}`;
}

function assets_hr_section(total_assets, ok, bad, emp, present, att_rate) {
	return `
		<div style="font-size:.78rem;font-weight:600;color:#6b7280;margin-bottom:8px">${__("ASSETS")}</div>
		${stat_row(__("Total Assets"), total_assets, "#2563EB")}
		${stat_row(__("Operational"),  ok,           "#16A34A")}
		${stat_row(__("Out of Order"), bad,          bad ? "#DC2626" : "#16A34A")}
		<div style="font-size:.78rem;font-weight:600;color:#6b7280;margin:14px 0 8px">${__("WORKFORCE")}</div>
		${stat_row(__("Active Employees"), emp,          "#2563EB")}
		${stat_row(__("Present Today"),    `${present} (${att_rate}%)`, att_rate >= 80 ? "#16A34A" : "#D97706")}`;
}

function stat_row(label, value, color) {
	return `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #f3f4f6;font-size:.83rem">
		<span style="color:#374151">${label}</span>
		<span style="font-weight:700;color:${color}">${value}</span>
	</div>`;
}

function qlink(route, label, color, icon) {
	return `<a href="/app/${route}" style="display:flex;align-items:center;gap:8px;background:${color}18;color:${color};border:1px solid ${color}40;border-radius:8px;padding:8px 14px;font-size:.83rem;font-weight:600;text-decoration:none;white-space:nowrap">
		<span>${icon}</span><span>${label}</span>
	</a>`;
}

function qlink_doc(doctype, label, color, icon) {
	return `<a href="/app/${frappe.router.slug(doctype)}" style="display:flex;align-items:center;gap:8px;background:${color}18;color:${color};border:1px solid ${color}40;border-radius:8px;padding:8px 14px;font-size:.83rem;font-weight:600;text-decoration:none;white-space:nowrap">
		<span>${icon}</span><span>${label}</span>
	</a>`;
}
