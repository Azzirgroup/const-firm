frappe.pages["financial-analytics"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Financial Analytics"),
		single_column: true,
	});
	page.add_action_item(__("Refresh"),          () => render_all());
	page.add_action_item(__("Sales Invoice"),    () => frappe.new_doc("Sales Invoice"));
	page.add_action_item(__("Payment Entry"),    () => frappe.new_doc("Payment Entry"));
	$(page.body).html(`<div id="fa-root" style="padding:20px"></div>`);
	render_all();
};

async function render_all() {
	const root = $("#fa-root").html(
		`<div style="text-align:center;padding:40px;color:#888">${__("Loading…")}</div>`);

	const r = await frappe.call({ method: "regence.regence.api.get_financial_analytics" });
	const d = r.message || {};
	const {
		ar_total = {total:0,count:0}, ap_total = {total:0,count:0},
		ar_aging = {}, ap_aging = {},
		monthly_trend = [], top_customers_ar = [], top_suppliers_ap = [],
		payments_in = {total:0,count:0}, payments_out = {total:0,count:0},
		si_month = {total:0,count:0}, pi_month = {total:0,count:0},
	} = d;

	const net_pos = ar_total.total - ap_total.total;

	root.html(`
		<!-- Banner -->
		<div style="background:linear-gradient(135deg,#064e3b 0%,#059669 100%);border-radius:12px;padding:22px 26px;margin-bottom:20px;color:#fff">
			<div style="font-size:1.4rem;font-weight:700">${__("Financial Analytics")}</div>
			<div class="row" style="margin-top:18px">
				${top_stat(__("Total Receivable"),   frappe.format(ar_total.total,{fieldtype:"Currency"}), "💰", ar_total.count+" inv")}
				${top_stat(__("Total Payable"),      frappe.format(ap_total.total,{fieldtype:"Currency"}), "📤", ap_total.count+" inv")}
				${top_stat(__("Net Position"),        frappe.format(Math.abs(net_pos),{fieldtype:"Currency"}), net_pos>=0?"📈":"📉", net_pos>=0?__("Favourable"):__("Deficit"))}
				${top_stat(__("Revenue This Month"),  frappe.format(si_month.total,{fieldtype:"Currency"}), "🧾", si_month.count+" SI")}
				${top_stat(__("Spend This Month"),    frappe.format(pi_month.total,{fieldtype:"Currency"}), "🛒", pi_month.count+" PI")}
				${top_stat(__("Payments In"),         frappe.format(payments_in.total,{fieldtype:"Currency"}), "⬇️", payments_in.count+" entries")}
			</div>
		</div>

		<!-- Monthly trend -->
		<div class="frappe-card" style="padding:16px;margin-bottom:16px">
			<h5 style="margin:0 0 16px">${__("Revenue vs Expense — Last 6 Months")}</h5>
			${monthly_bar_chart(monthly_trend)}
		</div>

		<!-- AR & AP aging side by side -->
		<div class="row" style="margin-bottom:16px">
			<div class="col-md-6">
				<div class="frappe-card" style="padding:16px;height:100%">
					<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
						<h5 style="margin:0;color:#16A34A">${__("Receivables Aging")} (AR)</h5>
						<a href="/app/sales-invoice?outstanding_amount=>0" style="font-size:.8rem">${__("View all →")}</a>
					</div>
					${aging_chart(ar_aging, "#16A34A")}
				</div>
			</div>
			<div class="col-md-6">
				<div class="frappe-card" style="padding:16px;height:100%">
					<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
						<h5 style="margin:0;color:#DC2626">${__("Payables Aging")} (AP)</h5>
						<a href="/app/purchase-invoice?outstanding_amount=>0" style="font-size:.8rem">${__("View all →")}</a>
					</div>
					${aging_chart(ap_aging, "#DC2626")}
				</div>
			</div>
		</div>

		<!-- Top customers & suppliers -->
		<div class="row" style="margin-bottom:16px">
			<div class="col-md-6">
				<div class="frappe-card" style="padding:16px">
					<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
						<h5 style="margin:0">${__("Top Customers by Outstanding")}</h5>
						<a href="/app/sales-invoice" style="font-size:.8rem">${__("View all →")}</a>
					</div>
					${party_table(top_customers_ar, "Customer", "#16A34A")}
				</div>
			</div>
			<div class="col-md-6">
				<div class="frappe-card" style="padding:16px">
					<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
						<h5 style="margin:0">${__("Top Suppliers by Outstanding")}</h5>
						<a href="/app/purchase-invoice" style="font-size:.8rem">${__("View all →")}</a>
					</div>
					${party_table(top_suppliers_ap, "Supplier", "#DC2626")}
				</div>
			</div>
		</div>

		<!-- Payments this month -->
		<div class="frappe-card" style="padding:16px">
			<h5 style="margin:0 0 12px">${__("Payments This Month")}</h5>
			<div class="row">
				<div class="col-md-6">
					<div style="display:flex;align-items:center;gap:14px;padding:12px;background:#f0fdf4;border-radius:8px">
						<div style="font-size:2rem">⬇️</div>
						<div>
							<div style="font-size:1.2rem;font-weight:700;color:#16A34A">${frappe.format(payments_in.total,{fieldtype:"Currency"})}</div>
							<div style="font-size:.8rem;color:#6b7280">${__("Received")} · ${payments_in.count} ${__("entries")}</div>
						</div>
					</div>
				</div>
				<div class="col-md-6">
					<div style="display:flex;align-items:center;gap:14px;padding:12px;background:#fef2f2;border-radius:8px">
						<div style="font-size:2rem">⬆️</div>
						<div>
							<div style="font-size:1.2rem;font-weight:700;color:#DC2626">${frappe.format(payments_out.total,{fieldtype:"Currency"})}</div>
							<div style="font-size:.8rem;color:#6b7280">${__("Paid Out")} · ${payments_out.count} ${__("entries")}</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	`);
}

function top_stat(label, value, icon, sub) {
	return `<div class="col" style="padding:4px">
		<div style="background:rgba(255,255,255,.13);border-radius:8px;padding:12px 10px;text-align:center">
			<div style="font-size:1.1rem">${icon}</div>
			<div style="font-size:1rem;font-weight:700;line-height:1.2;margin-top:4px">${value}</div>
			<div style="font-size:.7rem;opacity:.85;margin-top:2px">${label}</div>
			<div style="font-size:.68rem;opacity:.7;margin-top:1px">${sub}</div>
		</div>
	</div>`;
}

function monthly_bar_chart(trend) {
	if (!trend.length) return `<p class="text-muted small">${__("No data available")}</p>`;
	const max_val = Math.max(...trend.map(t => Math.max(t.revenue||0, t.expense||0)), 1);
	const BAR_H = 120;

	return `<div style="overflow-x:auto">
		<div style="display:flex;align-items:flex-end;gap:8px;min-width:${trend.length*90}px;padding:0 8px">
			${trend.map(t => {
				const rev = t.revenue || 0;
				const exp = t.expense || 0;
				const rh  = Math.round(rev / max_val * BAR_H);
				const eh  = Math.round(exp / max_val * BAR_H);
				return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;min-width:72px">
					<div style="font-size:.7rem;color:#6b7280;margin-bottom:4px;text-align:center">
						<div style="font-weight:600;color:#16A34A">${rev ? frappe.format(rev,{fieldtype:"Currency",currency:""}).replace(/[^0-9KMB,.]/g,"") : "—"}</div>
					</div>
					<div style="display:flex;align-items:flex-end;gap:4px;height:${BAR_H}px">
						<div style="width:22px;background:#16A34A;border-radius:4px 4px 0 0;height:${rh}px;min-height:${rev?2:0}px" title="${__('Revenue')}: ${frappe.format(rev,{fieldtype:'Currency'})}"></div>
						<div style="width:22px;background:#DC2626;border-radius:4px 4px 0 0;height:${eh}px;min-height:${exp?2:0}px" title="${__('Expense')}: ${frappe.format(exp,{fieldtype:'Currency'})}"></div>
					</div>
					<div style="font-size:.72rem;color:#6b7280;margin-top:6px;text-align:center">${t.month}</div>
				</div>`;
			}).join("")}
		</div>
		<div style="display:flex;gap:16px;margin-top:10px;padding-left:8px">
			<div style="display:flex;align-items:center;gap:5px;font-size:.78rem">
				<div style="width:12px;height:12px;border-radius:3px;background:#16A34A"></div> ${__("Revenue")}
			</div>
			<div style="display:flex;align-items:center;gap:5px;font-size:.78rem">
				<div style="width:12px;height:12px;border-radius:3px;background:#DC2626"></div> ${__("Expense")}
			</div>
		</div>
	</div>`;
}

function aging_chart(ag, color) {
	const buckets = [
		{label: __("Not Due"),   val: ag.not_due  || 0, bg: "#f0fdf4", fg: "#16A34A"},
		{label: __("0–30 days"), val: ag.b0_30    || 0, bg: "#fef9c3", fg: "#92400e"},
		{label: __("31–60"),     val: ag.b31_60   || 0, bg: "#ffedd5", fg: "#c2410c"},
		{label: __("61–90"),     val: ag.b61_90   || 0, bg: "#fee2e2", fg: "#b91c1c"},
		{label: __("90+ days"),  val: ag.b90plus  || 0, bg: "#fce7f3", fg: "#9d174d"},
	];
	const total = buckets.reduce((s,b)=>s+b.val,0) || 1;
	return `<div>
		${buckets.map(b => {
			const pct = Math.round(b.val/total*100);
			return `<div style="margin-bottom:10px">
				<div style="display:flex;justify-content:space-between;font-size:.82rem;margin-bottom:3px">
					<span style="color:#374151">${b.label}</span>
					<span style="font-weight:700;color:${b.fg}">${frappe.format(b.val,{fieldtype:"Currency"})}</span>
				</div>
				<div style="display:flex;align-items:center;gap:8px">
					<div style="flex:1;background:#e5e7eb;border-radius:4px;height:8px">
						<div style="background:${b.fg};width:${pct}%;height:8px;border-radius:4px"></div>
					</div>
					<span style="font-size:.72rem;color:#6b7280;min-width:32px;text-align:right">${pct}%</span>
				</div>
			</div>`;
		}).join("")}
	</div>`;
}

function party_table(rows, type, color) {
	if (!rows.length) return `<p class="text-muted small">${__("No outstanding invoices")}</p>`;
	const max_val = Math.max(...rows.map(r=>r.amount), 1);
	return `<div>${rows.map(r => `
		<div style="margin-bottom:10px">
			<div style="display:flex;justify-content:space-between;align-items:center;font-size:.82rem;margin-bottom:2px">
				<a href="/app/${type.toLowerCase()}/${encodeURIComponent(r.name)}" style="font-weight:600;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.name}</a>
				<span style="font-weight:700;color:${color}">${frappe.format(r.amount,{fieldtype:"Currency"})}</span>
			</div>
			<div style="display:flex;align-items:center;gap:6px">
				<div style="flex:1;background:#e5e7eb;border-radius:3px;height:5px">
					<div style="background:${color};width:${Math.round(r.amount/max_val*100)}%;height:5px;border-radius:3px"></div>
				</div>
				<span style="font-size:.7rem;color:#6b7280">${r.invoices} ${__("inv")}</span>
			</div>
		</div>`).join("")}</div>`;
}
