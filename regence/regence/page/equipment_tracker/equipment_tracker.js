frappe.pages["equipment-tracker"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Equipment Tracker"),
		single_column: true,
	});
	page.add_action_item(__("Refresh"),           () => render_all());
	page.add_action_item(__("New Asset"),         () => frappe.new_doc("Asset"));
	page.add_action_item(__("New Maintenance"),   () => frappe.new_doc("Asset Maintenance"));
	$(page.body).html(`<div id="et-root" style="padding:20px"></div>`);
	render_all();
};

async function render_all() {
	const root = $("#et-root").html(
		`<div style="text-align:center;padding:40px;color:#888">${__("Loading…")}</div>`);

	const r = await frappe.call({ method: "regence.regence.api.get_equipment_tracker" });
	const { assets = [], maintenance_tasks = [], repairs = [],
	        by_category = [], total_value = 0, repair_cost_ytd = 0, today = "" } = r.message || {};

	const status_map = {};
	assets.forEach(a => { status_map[a.status] = (status_map[a.status]||0)+1; });
	const maint      = status_map["Under Maintenance"] || 0;
	const out        = status_map["Out of Order"] || 0;
	const overdue_m  = maintenance_tasks.filter(t => t.next_due_date < today).length;
	const operational = (status_map["In Location"]||0) + (status_map["Submit"]||0);

	root.html(`
		<!-- KPIs -->
		<div class="row" style="margin-bottom:20px">
			${kpi(__("Total Assets"),        assets.length,                    "#2563EB")}
			${kpi(__("Operational"),         operational,                       "#16A34A")}
			${kpi(__("Under Maintenance"),   maint,                             maint ? "#D97706" : "#16A34A")}
			${kpi(__("Out of Order"),        out,                               out   ? "#DC2626" : "#16A34A")}
			${kpi(__("Maintenance Due"),     maintenance_tasks.length,          maintenance_tasks.length ? "#7C3AED" : "#16A34A")}
			${kpi(__("Overdue Maint."),      overdue_m,                        overdue_m ? "#DC2626" : "#16A34A")}
		</div>

		<!-- Value + repair cost banner -->
		<div class="row" style="margin-bottom:16px">
			<div class="col-md-4">
				<div style="background:linear-gradient(135deg,#1e3a5f,#2563EB);border-radius:10px;padding:16px;color:#fff;text-align:center">
					<div style="font-size:.8rem;opacity:.85">${__("Total Asset Value")}</div>
					<div style="font-size:1.5rem;font-weight:700;margin-top:4px">${frappe.format(total_value,{fieldtype:"Currency"})}</div>
					<div style="font-size:.72rem;opacity:.7;margin-top:2px">${assets.length} ${__("assets")}</div>
				</div>
			</div>
			<div class="col-md-4">
				<div style="background:linear-gradient(135deg,#7f1d1d,#DC2626);border-radius:10px;padding:16px;color:#fff;text-align:center">
					<div style="font-size:.8rem;opacity:.85">${__("Repair Cost YTD")}</div>
					<div style="font-size:1.5rem;font-weight:700;margin-top:4px">${frappe.format(repair_cost_ytd,{fieldtype:"Currency"})}</div>
					<div style="font-size:.72rem;opacity:.7;margin-top:2px">${repairs.length} ${__("repairs")}</div>
				</div>
			</div>
			<div class="col-md-4">
				<div style="background:linear-gradient(135deg,#14532d,#16A34A);border-radius:10px;padding:16px;color:#fff;text-align:center">
					<div style="font-size:.8rem;opacity:.85">${__("Operational Rate")}</div>
					<div style="font-size:1.5rem;font-weight:700;margin-top:4px">
						${assets.length ? Math.round(operational/assets.length*100) : 0}%
					</div>
					<div style="font-size:.72rem;opacity:.7;margin-top:2px">${operational} / ${assets.length} ${__("assets")}</div>
				</div>
			</div>
		</div>

		<!-- Status + category breakdown -->
		<div class="row" style="margin-bottom:16px">
			<div class="col-md-5">
				<div class="frappe-card" style="padding:16px;height:100%">
					<h5 style="margin:0 0 12px">${__("Asset Status")}</h5>
					${status_breakdown(status_map, assets.length)}
				</div>
			</div>
			<div class="col-md-7">
				<div class="frappe-card" style="padding:16px;height:100%">
					<h5 style="margin:0 0 12px">${__("Value by Category")}</h5>
					${category_chart(by_category, total_value)}
				</div>
			</div>
		</div>

		<div class="row">
			<div class="col-md-8">
				<div class="frappe-card" style="padding:16px;margin-bottom:16px">
					<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
						<h5 style="margin:0">${__("Asset Register")}</h5>
						<a href="/app/asset" style="font-size:.8rem">${__("View all →")}</a>
					</div>
					${assets_table(assets)}
				</div>
			</div>
			<div class="col-md-4">
				<div class="frappe-card" style="padding:16px;margin-bottom:16px">
					<h5 style="margin:0 0 12px;color:${maintenance_tasks.length?"#D97706":"inherit"}">${__("Maintenance Due")}</h5>
					${maintenance_list(maintenance_tasks, today)}
				</div>
				<div class="frappe-card" style="padding:16px">
					<h5 style="margin:0 0 12px">${__("Recent Repairs")}</h5>
					${repairs_list(repairs)}
				</div>
			</div>
		</div>
	`);
}

function kpi(label, value, color) {
	return `<div class="col" style="padding:4px">
		<div style="background:${color};color:#fff;border-radius:10px;padding:18px 16px;text-align:center">
			<div style="font-size:1.8rem;font-weight:700;line-height:1">${value}</div>
			<div style="font-size:.78rem;margin-top:6px;opacity:.9;line-height:1.3">${label}</div>
		</div>
	</div>`;
}

function status_breakdown(map, total) {
	if (!total) return `<p class="text-muted small">${__("No assets found")}</p>`;
	const cmap = {"In Location":"#16A34A","Submit":"#16A34A","Under Maintenance":"#D97706",
		"Out of Order":"#DC2626","Scrapped":"#6B7280","Sold":"#6B7280","Draft":"#9CA3AF"};
	return `<div>
		<div style="display:flex;height:24px;border-radius:6px;overflow:hidden;margin-bottom:12px">
			${Object.entries(map).map(([s,n])=>
				`<div style="width:${Math.round(n/total*100)}%;background:${cmap[s]||"#94a3b8"}" title="${__(s)}: ${n}"></div>`
			).join("")}
		</div>
		${Object.entries(map).map(([s,n])=>`
			<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid #f3f4f6;font-size:.82rem">
				<div style="display:flex;align-items:center;gap:6px">
					<div style="width:10px;height:10px;border-radius:50%;background:${cmap[s]||"#94a3b8"}"></div>
					<span>${__(s)}</span>
				</div>
				<span style="font-weight:700">${n}</span>
			</div>`).join("")}
	</div>`;
}

function category_chart(cats, total_val) {
	if (!cats.length) return `<p class="text-muted small">${__("No category data")}</p>`;
	const max_v = Math.max(...cats.map(c=>c.total_value||0), 1);
	const colors = ["#2563EB","#7C3AED","#0891B2","#D97706","#16A34A","#DC2626","#EA580C","#64748b","#0f766e","#92400e"];
	return `<div>${cats.map((c,i)=>`
		<div style="margin-bottom:10px">
			<div style="display:flex;justify-content:space-between;font-size:.82rem;margin-bottom:3px">
				<span style="font-weight:500">${c.asset_category}</span>
				<div style="text-align:right">
					<span style="font-weight:700;color:${colors[i%colors.length]}">${frappe.format(c.total_value||0,{fieldtype:"Currency"})}</span>
					<span style="color:#6b7280;font-size:.72rem;margin-left:6px">(${c.cnt})</span>
				</div>
			</div>
			<div style="background:#e5e7eb;border-radius:4px;height:7px">
				<div style="background:${colors[i%colors.length]};width:${Math.round((c.total_value||0)/max_v*100)}%;height:7px;border-radius:4px"></div>
			</div>
		</div>`).join("")}</div>`;
}

function assets_table(rows) {
	if (!rows.length) return `<p class="text-muted small">${__("No assets")}</p>`;
	const sc = {"In Location":"green","Submit":"green","Under Maintenance":"orange",
		"Out of Order":"red","Scrapped":"gray","Sold":"gray"};
	return `<table class="table table-sm" style="font-size:.82rem;margin:0">
		<thead style="background:#f9fafb"><tr>
			<th>${__("Asset")}</th><th>${__("Category")}</th>
			<th>${__("Location")}</th><th>${__("Status")}</th>
			<th style="text-align:right">${__("Value")}</th>
		</tr></thead>
		<tbody>${rows.map(a=>`<tr>
			<td><a href="/app/asset/${a.name}">${a.asset_name}</a></td>
			<td style="color:#6b7280">${a.asset_category||"—"}</td>
			<td style="color:#6b7280">${a.location||"—"}</td>
			<td>${pill(a.status, sc)}</td>
			<td style="text-align:right">${frappe.format(a.purchase_amount||0,{fieldtype:"Currency"})}</td>
		</tr>`).join("")}</tbody>
	</table>`;
}

function maintenance_list(tasks, today) {
	if (!tasks.length) return `<p class="text-muted small">✓ ${__("None due in 30 days")}</p>`;
	return `<div>${tasks.map(t=>{
		const overdue = t.next_due_date < today;
		return `<div style="padding:8px 0;border-bottom:1px solid #f3f4f6">
			<div style="display:flex;justify-content:space-between">
				<a href="/app/asset-maintenance/${t.parent}" style="font-size:.83rem;font-weight:500">${t.parent}</a>
				<span style="font-size:.75rem;color:${overdue?"#DC2626":"#D97706"};font-weight:${overdue?"700":"400"}">
					${frappe.format(t.next_due_date,{fieldtype:"Date"})}
					${overdue ? " ⚠️" : ""}
				</span>
			</div>
			<div style="font-size:.75rem;color:#6b7280">${t.maintenance_type}${t.assign_to ? " · "+t.assign_to : ""}</div>
		</div>`;
	}).join("")}</div>`;
}

function repairs_list(rows) {
	if (!rows.length) return `<p class="text-muted small">${__("No recent repairs")}</p>`;
	const sc = {Pending:"orange","Work in Progress":"blue",Completed:"green"};
	return `<div>${rows.map(r=>`
		<div style="padding:8px 0;border-bottom:1px solid #f3f4f6">
			<div style="display:flex;justify-content:space-between;align-items:center">
				<a href="/app/asset-repair/${r.name}" style="font-size:.83rem;font-weight:500">${r.asset_name}</a>
				${pill(r.repair_status, sc)}
			</div>
			<div style="display:flex;justify-content:space-between;margin-top:2px">
				<span style="font-size:.75rem;color:#6b7280">${frappe.format(r.failure_date,{fieldtype:"Date"})}</span>
				<span style="font-size:.75rem;font-weight:600">${frappe.format(r.repair_cost||0,{fieldtype:"Currency"})}</span>
			</div>
		</div>`).join("")}</div>`;
}

function pill(label, color_map) {
	const colors = {green:"#dcfce7|#16A34A",blue:"#dbeafe|#2563EB",red:"#fee2e2|#DC2626",
		orange:"#ffedd5|#D97706",gray:"#f3f4f6|#6B7280"};
	const [bg,fg] = (colors[color_map[label]||"gray"]||colors.gray).split("|");
	return `<span style="background:${bg};color:${fg};border-radius:12px;padding:2px 9px;font-size:.72rem;font-weight:600">${__(label)}</span>`;
}
