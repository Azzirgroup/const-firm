frappe.ui.form.on("Task", {
	refresh(frm) {
		if (frm.is_new()) return;

		const is_completed = frm.doc.status === "Completed";
		const is_group = !!frm.doc.is_group;

		// No "Create Field Job Card" button for completed or parent (group) tasks.
		if (!is_completed && !is_group) {
			frm.add_custom_button(__("Field Job Card"), () => {
				frappe.new_doc("Field Job Card", {
					task: frm.doc.name,
					project: frm.doc.project,
				});
			}, __("Create"));
		}

		// Create Sales Invoice from the task (carries BOQ costing, project & sales order).
		frm.add_custom_button(__("Sales Invoice"), () => {
			frappe.confirm(
				__("Create a draft Sales Invoice for this task using its BOQ costing?"),
				() => {
					frappe.call({
						method: "regence.api.create_sales_invoice_from_task",
						args: { task: frm.doc.name },
						freeze: true,
						freeze_message: __("Creating Sales Invoice..."),
						callback: r => {
							if (r.message) {
								frm.reload_doc();
								frappe.set_route("Form", "Sales Invoice", r.message);
							}
						},
					});
				}
			);
		}, __("Create"));

		render_job_cards(frm);
	},

	status(frm) {
		// Re-render so the add button reflects completion state.
		render_job_cards(frm);
	},
});

function render_job_cards(frm) {
	const field = frm.get_field("custom_job_cards_html");
	if (!field) return;

	const is_completed = frm.doc.status === "Completed";
	const is_group = !!frm.doc.is_group;

	frappe.call({
		method: "regence.api.get_task_job_cards",
		args: { task: frm.doc.name },
		callback: r => {
			const cards = r.message || [];
			const fmt = v => frappe.format(v || 0, { fieldtype: "Currency" });

			// Job cards are logged against leaf tasks; parent tasks aggregate
			// their sub-tasks' cards, so no direct "Add" on a group task.
			const add_btn = (is_completed || is_group)
				? ""
				: `<button class="btn btn-sm btn-primary" id="add-job-card-btn">
						<i class="fa fa-plus"></i> ${__("Add Job Card")}
					</button>`;

			let rows = "";
			let total = 0;
			if (!cards.length) {
				rows = `<tr><td colspan="6" style="text-align:center;color:#9ca3af;padding:18px">
					${__("No job cards yet.")}</td></tr>`;
			} else {
				const status_col = {
					Draft: "#6B7280", "In Progress": "#2563EB",
					Completed: "#16A34A", Cancelled: "#DC2626",
				};
				rows = cards.map(c => {
					total += c.total_cost || 0;
					const col = status_col[c.status] || "#6b7280";
					const open = c.status !== "Completed"
						? `<a class="btn btn-xs btn-default" href="/app/field-job-card/${c.name}">${__("Open")}</a>`
						: `<a href="/app/field-job-card/${c.name}" style="color:#6b7280">${__("View")}</a>`;
					const task_cell = (c.task && c.task !== frm.doc.name)
						? `<a href="/app/task/${c.task}">${c.task}</a>`
						: `<span style="color:#9ca3af">—</span>`;
					return `<tr>
						<td><a href="/app/field-job-card/${c.name}">${c.name}</a></td>
						<td>${task_cell}</td>
						<td><span style="background:${col}18;border:1px solid ${col}40;border-radius:20px;
							padding:2px 10px;font-size:.75rem;color:${col};font-weight:600">${__(c.status)}</span></td>
						<td style="text-align:right">${fmt(c.total_material_cost)}</td>
						<td style="text-align:right">${fmt(c.total_service_cost)}</td>
						<td style="text-align:right;font-weight:600">${fmt(c.total_cost)}</td>
						<td style="text-align:right">${open}</td>
					</tr>`;
				}).join("");
			}

			const heading = is_group
				? __("Field Job Cards (sub-tasks)")
				: __("Field Job Cards");

			const html = `
				<div style="margin-bottom:10px;display:flex;justify-content:space-between;align-items:center">
					<span style="font-weight:600;color:#374151">${heading} (${cards.length})</span>
					${add_btn}
				</div>
				<table class="table table-sm" style="font-size:.85rem">
					<thead style="background:#f9fafb"><tr>
						<th>${__("Job Card")}</th><th>${__("Task")}</th><th>${__("Status")}</th>
						<th style="text-align:right">${__("Material")}</th>
						<th style="text-align:right">${__("Service")}</th>
						<th style="text-align:right">${__("Total Cost")}</th>
						<th></th>
					</tr></thead>
					<tbody>${rows}</tbody>
					<tfoot><tr style="border-top:2px solid #e5e7eb">
						<td colspan="5" style="text-align:right;font-weight:600">${__("Total")}</td>
						<td style="text-align:right;font-weight:700;color:#1e40af">${fmt(total)}</td>
						<td></td>
					</tr></tfoot>
				</table>`;

			field.$wrapper.html(html);
			field.$wrapper.find("#add-job-card-btn").on("click", () => {
				frappe.new_doc("Field Job Card", {
					task: frm.doc.name,
					project: frm.doc.project,
				});
			});
		},
	});
}
