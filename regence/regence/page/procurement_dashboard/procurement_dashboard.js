frappe.pages["procurement-dashboard"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Procurement Dashboard"),
		single_column: true,
	});
	page.add_action_item(__("Refresh"),            () => render_all());
	page.add_action_item(__("New Material Request"), () => frappe.new_doc("Material Request"));
	page.add_action_item(__("New Purchase Order"),   () => frappe.new_doc("Purchase Order"));
	$(page.body).html(`<div id="pr-root" style="padding:20px"></div>`);
	render_all();
};

async function render_all() {
	const root = $("#pr-root").html(
		`<div style="text-align:center;padding:40px;color:#888">${__("Loading…")}</div>`);

	const r = await frappe.call({ method: "regence.regence.api.get_procurement" });
	const d = r.message || {};
	const {
		mr_status = [], mr_list = [],
		po_status = [], po_list = [],
		supplier_spend = [], grn = [],
		top_items = [],
		pending_receipt = {total:0,count:0},
	} = d;

	const mr_map = {};
	mr_status.forEach(s => { mr_map[s.status] = s.cnt; });
	const po_map = {};
	po_status.forEach(s => { po_map[s.status] = {cnt: s.cnt, total: s.total||0}; });

	const draft_mr  = mr_map["Draft"]       || 0;
	const open_mr   = mr_map["Pending"]     || mr_map["Submitted"] || 0;
	const total_mr  = Object.values(mr_map).reduce((s,n)=>s+n,0);
	const draft_po  = (po_map["Draft"]||{}).cnt  || 0;
	const to_rcv    = ((po_map["To Receive"]||{}).cnt||0) + ((po_map["To Receive and Bill"]||{}).cnt||0);

	root.html(`
		<!-- Banner -->
		<div style="background:linear-gradient(135deg,#1e3a5f 0%,#0891B2 100%);border-radius:12px;padding:22px 26px;margin-bottom:20px;color:#fff">
			<div style="font-size:1.4rem;font-weight:700">${__("Procurement Dashboard")}</div>
			<div class="row" style="margin-top:18px">
				${kpi_card(__("Total MRs"),         total_mr,                       "📋")}
				${kpi_card(__("Draft MRs"),         draft_mr,                       "📝")}
				${kpi_card(__("Draft POs"),         draft_po,                       "🛒")}
				${kpi_card(__("Pending Receipt"),   to_rcv,                         "📦")}
				${kpi_card(__("Receipt Value"),     frappe.format(pending_receipt.total,{fieldtype:"Currency","currency":""}), "💵")}
				${kpi_card(__("GRNs This Month"),   grn.length,                     "✅")}
			</div>
		</div>

		<!-- MR Pipeline -->
		<div class="frappe-card" style="padding:16px;margin-bottom:16px">
			<h5 style="margin:0 0 14px">${__("Material Request Pipeline")}</h5>
			${mr_pipeline(mr_status)}
		</div>

		<div class="row" style="margin-bottom:16px">
			<!-- MR List -->
			<div class="col-md-6">
				<div class="frappe-card" style="padding:16px;height:100%">
					<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
						<h5 style="margin:0">${__("Recent Material Requests")}</h5>
						<a href="/app/material-request" style="font-size:.8rem">${__("View all →")}</a>
					</div>
					${mr_table(mr_list)}
				</div>
			</div>
			<!-- PO Status -->
			<div class="col-md-6">
				<div class="frappe-card" style="padding:16px;height:100%">
					<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
						<h5 style="margin:0">${__("Purchase Order Status")}</h5>
						<a href="/app/purchase-order" style="font-size:.8rem">${__("View all →")}</a>
					</div>
					${po_status_chart(po_status)}
					<div style="margin-top:14px">${po_list_section(po_list)}</div>
				</div>
			</div>
		</div>

		<div class="row" style="margin-bottom:16px">
			<!-- Supplier spend -->
			<div class="col-md-6">
				<div class="frappe-card" style="padding:16px;height:100%">
					<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
						<h5 style="margin:0">${__("Supplier Spend This Month")}</h5>
						<a href="/app/purchase-invoice" style="font-size:.8rem">${__("View all →")}</a>
					</div>
					${supplier_chart(supplier_spend)}
				</div>
			</div>
			<!-- Top requested items -->
			<div class="col-md-6">
				<div class="frappe-card" style="padding:16px;height:100%">
					<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
						<h5 style="margin:0">${__("Top Requested Items")}</h5>
					</div>
					${top_items_table(top_items)}
				</div>
			</div>
		</div>

		<!-- Recent GRNs -->
		${grn.length ? `<div class="frappe-card" style="padding:16px">
			<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
				<h5 style="margin:0">${__("Purchase Receipts This Month")}</h5>
				<a href="/app/purchase-receipt" style="font-size:.8rem">${__("View all →")}</a>
			</div>
			${grn_table(grn)}
		</div>` : ""}
	`);
}

function kpi_card(label, value, icon) {
	return `<div class="col" style="padding:4px">
		<div style="background:rgba(255,255,255,.13);border-radius:8px;padding:12px 10px;text-align:center">
			<div style="font-size:1.1rem">${icon}</div>
			<div style="font-size:1.2rem;font-weight:700;line-height:1.2;margin-top:4px">${value}</div>
			<div style="font-size:.72rem;opacity:.85;margin-top:3px">${label}</div>
		</div>
	</div>`;
}

function mr_pipeline(statuses) {
	if (!statuses.length) return `<p class="text-muted small">${__("No material requests")}</p>`;
	const sc = {
		Draft: "#6B7280", Pending: "#D97706", Submitted: "#2563EB",
		Transferred: "#7C3AED", Issued: "#16A34A", Ordered: "#0891B2",
		Cancelled: "#DC2626", Stopped: "#DC2626",
	};
	const total = statuses.reduce((s,x)=>s+x.cnt,0) || 1;
	return `<div>
		<div style="display:flex;height:32px;border-radius:8px;overflow:hidden;margin-bottom:12px">
			${statuses.map(s=>`
				<div style="width:${Math.round(s.cnt/total*100)}%;background:${sc[s.status]||"#94a3b8"};display:flex;align-items:center;justify-content:center"
				     title="${__(s.status)}: ${s.cnt}">
					${s.cnt/total > 0.08 ? `<span style="color:#fff;font-size:.72rem;font-weight:700">${s.cnt}</span>` : ""}
				</div>`).join("")}
		</div>
		<div style="display:flex;flex-wrap:wrap;gap:10px">
			${statuses.map(s=>`
				<div style="display:flex;align-items:center;gap:5px;font-size:.8rem">
					<div style="width:10px;height:10px;border-radius:50%;background:${sc[s.status]||"#94a3b8"}"></div>
					<span>${__(s.status)}</span> <strong>${s.cnt}</strong>
				</div>`).join("")}
		</div>
	</div>`;
}

function mr_table(rows) {
	if (!rows.length) return `<p class="text-muted small">${__("No material requests")}</p>`;
	const sc = {Draft:"gray",Pending:"orange",Submitted:"blue",Transferred:"purple",
		Issued:"green",Ordered:"cyan",Cancelled:"red",Stopped:"red"};
	const purple = {purple:"#ede9fe|#7C3AED", cyan:"#cffafe|#0891B2"};
	return `<table class="table table-sm" style="font-size:.82rem;margin:0">
		<thead style="background:#f9fafb"><tr>
			<th>${__("MR")}</th><th>${__("Type")}</th>
			<th>${__("Status")}</th><th>${__("Date")}</th><th>${__("Required")}</th>
		</tr></thead>
		<tbody>${rows.map(m=>`<tr>
			<td><a href="/app/material-request/${m.name}">${m.name}</a></td>
			<td style="color:#6b7280;font-size:.75rem">${m.material_request_type||"—"}</td>
			<td>${pill(m.status, sc, purple)}</td>
			<td style="color:#6b7280;font-size:.78rem">${m.transaction_date ? frappe.format(m.transaction_date,{fieldtype:"Date"}) : "—"}</td>
			<td style="color:#6b7280;font-size:.78rem">${m.schedule_date ? frappe.format(m.schedule_date,{fieldtype:"Date"}) : "—"}</td>
		</tr>`).join("")}</tbody>
	</table>`;
}

function po_status_chart(statuses) {
	if (!statuses.length) return `<p class="text-muted small">${__("No purchase orders")}</p>`;
	const sc = {
		Draft:"#9CA3AF","To Receive and Bill":"#2563EB","To Receive":"#D97706",
		"To Bill":"#7C3AED",Completed:"#16A34A",Cancelled:"#DC2626",Closed:"#6B7280",
	};
	return `<div style="display:flex;flex-direction:column;gap:8px">
		${statuses.map(s=>`
			<div style="display:flex;align-items:center;justify-content:space-between;font-size:.82rem">
				<div style="display:flex;align-items:center;gap:6px">
					<div style="width:10px;height:10px;border-radius:50%;background:${sc[s.status]||"#94a3b8"}"></div>
					<span>${__(s.status)}</span>
				</div>
				<div style="display:flex;gap:12px;align-items:center">
					<span style="font-weight:700">${s.cnt}</span>
					<span style="color:#6b7280;font-size:.75rem">${frappe.format(s.total||0,{fieldtype:"Currency"})}</span>
				</div>
			</div>`).join("")}
	</div>`;
}

function po_list_section(rows) {
	if (!rows.length) return "";
	const sc = {Draft:"gray","To Receive and Bill":"blue","To Receive":"orange",
		"To Bill":"purple",Completed:"green",Cancelled:"red",Closed:"gray"};
	const extra = {purple:"#ede9fe|#7C3AED"};
	return `<div style="border-top:1px solid #e5e7eb;margin-top:12px;padding-top:12px">
		<div style="font-size:.78rem;font-weight:600;color:#6b7280;margin-bottom:8px">${__("RECENT POs")}</div>
		${rows.slice(0,5).map(p=>`
			<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #f3f4f6;font-size:.82rem">
				<div>
					<a href="/app/purchase-order/${p.name}" style="font-weight:500">${p.name}</a>
					<div style="font-size:.72rem;color:#6b7280">${p.supplier||"—"}</div>
				</div>
				<div style="text-align:right">
					${pill(p.status, sc, extra)}
					<div style="font-size:.72rem;color:#6b7280;margin-top:2px">${frappe.format(p.grand_total||0,{fieldtype:"Currency"})}</div>
				</div>
			</div>`).join("")}
	</div>`;
}

function supplier_chart(rows) {
	if (!rows.length) return `<p class="text-muted small">${__("No supplier spend this month")}</p>`;
	const max_val = Math.max(...rows.map(r=>r.total), 1);
	return `<div>${rows.map(r=>`
		<div style="margin-bottom:10px">
			<div style="display:flex;justify-content:space-between;font-size:.82rem;margin-bottom:2px">
				<span style="font-weight:500;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.supplier}</span>
				<span style="font-weight:700;color:#0891B2">${frappe.format(r.total,{fieldtype:"Currency"})}</span>
			</div>
			<div style="display:flex;align-items:center;gap:6px">
				<div style="flex:1;background:#e5e7eb;border-radius:4px;height:7px">
					<div style="background:#0891B2;width:${Math.round(r.total/max_val*100)}%;height:7px;border-radius:4px"></div>
				</div>
				<span style="font-size:.7rem;color:#6b7280">${r.invoices} ${__("inv")}</span>
			</div>
		</div>`).join("")}</div>`;
}

function top_items_table(rows) {
	if (!rows.length) return `<p class="text-muted small">${__("No items requested this month")}</p>`;
	return `<table class="table table-sm" style="font-size:.82rem;margin:0">
		<thead style="background:#f9fafb"><tr>
			<th>${__("Item")}</th><th style="text-align:right">${__("Qty")}</th>
			<th>${__("UOM")}</th><th style="text-align:right">${__("MRs")}</th>
		</tr></thead>
		<tbody>${rows.map(i=>`<tr>
			<td><a href="/app/item/${encodeURIComponent(i.item_code)}">${i.item_name||i.item_code}</a></td>
			<td style="text-align:right;font-weight:600">${frappe.format(i.total_qty,{fieldtype:"Float"})}</td>
			<td style="color:#6b7280">${i.uom||"—"}</td>
			<td style="text-align:right;color:#6b7280">${i.requests}</td>
		</tr>`).join("")}</tbody>
	</table>`;
}

function grn_table(rows) {
	return `<table class="table table-sm" style="font-size:.82rem;margin:0">
		<thead style="background:#f9fafb"><tr>
			<th>${__("GRN")}</th><th>${__("Supplier")}</th>
			<th>${__("Date")}</th><th style="text-align:right">${__("Value")}</th>
		</tr></thead>
		<tbody>${rows.map(g=>`<tr>
			<td><a href="/app/purchase-receipt/${g.name}">${g.name}</a></td>
			<td style="color:#6b7280">${g.supplier||"—"}</td>
			<td style="color:#6b7280;font-size:.78rem">${frappe.format(g.posting_date,{fieldtype:"Date"})}</td>
			<td style="text-align:right;font-weight:600">${frappe.format(g.total||0,{fieldtype:"Currency"})}</td>
		</tr>`).join("")}</tbody>
	</table>`;
}

function pill(label, color_map, extra) {
	const colors = {
		green:"#dcfce7|#16A34A", blue:"#dbeafe|#2563EB", red:"#fee2e2|#DC2626",
		orange:"#ffedd5|#D97706", gray:"#f3f4f6|#6B7280", cyan:"#cffafe|#0891B2",
		purple:"#ede9fe|#7C3AED",
	};
	const key = color_map[label] || "gray";
	const [bg,fg] = (colors[key]||colors.gray).split("|");
	return `<span style="background:${bg};color:${fg};border-radius:12px;padding:2px 9px;font-size:.72rem;font-weight:600">${__(label)}</span>`;
}
