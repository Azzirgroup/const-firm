frappe.ui.form.on("Project", {
	refresh(frm) {
		if (frm.is_new()) return;

		recalc_boq_total(frm);

		// Tasks table: new rows are allowed (they create tasks on save);
		// row deletion is blocked since it's a live mirror of real tasks.
		const tasks_grid = frm.get_field("custom_project_tasks")
			&& frm.get_field("custom_project_tasks").grid;
		if (tasks_grid) {
			tasks_grid.cannot_add_rows = false;
			tasks_grid.cannot_delete_rows = true;
		}

		// Auto-refresh the Tasks table from live task data (only when clean).
		if (!frm.is_dirty()) {
			frappe.call({
				method: "regence.api.sync_project_tasks",
				args: { project: frm.doc.name },
				callback: r => {
					if (r.message && r.message.changed) frm.reload_doc();
				},
			});
		}
	},

	// Bulk upload BOQ lines by pasting CSV / spreadsheet rows.
	custom_upload_boq_btn(frm) {
		const d = new frappe.ui.Dialog({
			title: __("Bulk Upload BOQ Lines"),
			size: "large",
			fields: [
				{
					fieldtype: "HTML",
					fieldname: "help",
					options: `<div style="font-size:.85rem;color:#374151;margin-bottom:8px">
						${__("Paste rows (comma or tab separated). One line per BOQ row. Columns:")}
						<div style="margin-top:6px;font-family:monospace;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:8px">
							Row Type, Title, Type, Item Code, UOM, Qty, Rate, Description
						</div>
						<div style="margin-top:6px;color:#6b7280">
							${__("Row Type = 'Section' or 'Sub-Section'. A header row (containing 'Title') is ignored. Only Row Type &amp; Title are required.")}
						</div>
					</div>`,
				},
				{
					fieldtype: "Code",
					fieldname: "data",
					label: __("Paste Data"),
					reqd: 1,
					options: "Text",
				},
				{
					fieldtype: "Check",
					fieldname: "replace",
					label: __("Replace existing BOQ lines"),
				},
			],
			primary_action_label: __("Upload"),
			primary_action(values) {
				const parsed = parse_boq_paste(values.data);
				if (!parsed.length) {
					frappe.msgprint(__("No valid rows found."));
					return;
				}
				if (values.replace) frm.clear_table("custom_boq_items");
				parsed.forEach(r => {
					const row = frm.add_child("custom_boq_items", r);
					row.amount = (row.qty || 0) * (row.rate || 0);
				});
				frm.refresh_field("custom_boq_items");
				recalc_boq_total(frm);
				d.hide();
				frappe.show_alert({
					message: __("{0} BOQ line(s) added. Remember to Save.", [parsed.length]),
					indicator: "green",
				});
			},
		});
		d.show();
	},

	// Import BOQ lines from the project's linked Sales Order.
	custom_import_boq_so_btn(frm) {
		const run = (replace) => {
			frappe.call({
				method: "regence.api.import_boq_from_sales_order",
				args: { project: frm.doc.name, replace: replace ? 1 : 0 },
				freeze: true,
				freeze_message: __("Importing from Sales Order..."),
				callback: r => {
					if (!r.message) return;
					frappe.show_alert({
						message: __("{0} item(s) imported from {1}", [r.message.added, r.message.sales_order]),
						indicator: "green",
					});
					frm.reload_doc();
				},
			});
		};
		const ask = () => {
			const d = new frappe.ui.Dialog({
				title: __("Import BOQ from Sales Order"),
				fields: [
					{
						fieldtype: "HTML",
						options: `<div style="font-size:.85rem;color:#374151">
							${__("Pull item codes, quantities and rates from the Sales Order linked to this project into the BOQ as sub-sections.")}
						</div>`,
					},
					{
						fieldtype: "Check",
						fieldname: "replace",
						label: __("Replace existing BOQ lines"),
					},
				],
				primary_action_label: __("Import"),
				primary_action(v) { d.hide(); run(v.replace); },
			});
			d.show();
		};
		if (frm.is_dirty()) {
			frappe.warn(
				__("Save changes first?"),
				__("The project has unsaved changes. Save before importing?"),
				() => frm.save().then(ask),
				__("Save & Continue")
			);
		} else {
			ask();
		}
	},

	// Button custom field on the BOQ tab.
	custom_create_tasks_btn(frm) {
		const run = () => {
			frappe.call({
				method: "regence.api.create_tasks_from_boq",
				args: { project: frm.doc.name },
				freeze: true,
				freeze_message: __("Creating tasks from BOQ..."),
				callback: () => frm.reload_doc(),
			});
		};
		if (frm.is_dirty()) {
			frappe.warn(
				__("Save changes first?"),
				__("The BOQ has unsaved changes. Save before creating tasks?"),
				() => frm.save().then(run),
				__("Save & Continue")
			);
		} else {
			run();
		}
	},
});

frappe.ui.form.on("Project BOQ Line", {
	item_code(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		if (!row.item_code) return;
		frappe.db.get_value("Item", row.item_code,
			["item_name", "stock_uom", "standard_rate", "item_group"], r => {
				if (!r) return;
				frappe.model.set_value(cdt, cdn, "uom", r.stock_uom || "Nos");
				if (!row.rate) frappe.model.set_value(cdt, cdn, "rate", r.standard_rate || 0);
				if (!row.title) frappe.model.set_value(cdt, cdn, "title", r.item_name || row.item_code);

				const grp = (r.item_group || "").toLowerCase();
				let type = "Material";
				if (grp.includes("labour") || grp.includes("labor")) type = "Labour";
				else if (grp.includes("equipment") || grp.includes("plant")) type = "Equipment";
				else if (grp.includes("subcontract")) type = "Subcontract";
				frappe.model.set_value(cdt, cdn, "item_type", type);
				calc_line(frm, cdt, cdn);
			}
		);
	},
	qty(frm, cdt, cdn)  { calc_line(frm, cdt, cdn); },
	rate(frm, cdt, cdn) { calc_line(frm, cdt, cdn); },
	custom_boq_items_remove(frm) { recalc_boq_total(frm); },
});

// Edit a task straight from the Project Tasks table.
// New (unsaved) rows have no linked task yet — their task is created on save.
frappe.ui.form.on("Project Task", {
	status(frm, cdt, cdn)     { push_task_field(frm, cdt, cdn, "status", "status"); },
	subject(frm, cdt, cdn)    { push_task_field(frm, cdt, cdn, "subject", "subject"); },
	boq_amount(frm, cdt, cdn) { push_task_field(frm, cdt, cdn, "boq_amount", "boq_amount"); },
});

function push_task_field(frm, cdt, cdn, row_field, task_field) {
	const row = locals[cdt][cdn];
	// Only existing (linked) rows push live; new rows are created on save.
	if (!row.task) return;
	const value = row[row_field];

	frappe.call({
		method: "regence.api.update_task_field",
		args: { task: row.task, fieldname: task_field, value: value },
		freeze: true,
		freeze_message: __("Updating task..."),
		callback: r => {
			const actual = r.message;
			if (actual !== undefined && actual !== null && actual !== row[row_field]) {
				row[row_field] = actual;
				frm.refresh_field("custom_project_tasks");
			}
			frappe.show_alert({
				message: __("Task {0} updated", [row.task]),
				indicator: "green",
			});
		},
		error: () => {
			// Revert just this field to the task's real value (keeps unsaved rows intact).
			const fetch_field = task_field === "boq_amount" ? "custom_boq_amount" : task_field;
			frappe.db.get_value("Task", row.task, fetch_field, v => {
				if (v) {
					row[row_field] = v[fetch_field];
					frm.refresh_field("custom_project_tasks");
				}
			});
		},
	});
}

function calc_line(frm, cdt, cdn) {
	const row = locals[cdt][cdn];
	frappe.model.set_value(cdt, cdn, "amount", (row.qty || 0) * (row.rate || 0));
	recalc_boq_total(frm);
}

function recalc_boq_total(frm) {
	// Total = sum of Sub-Section amounts (sections roll up their children).
	const total = (frm.doc.custom_boq_items || []).reduce((s, r) => {
		if (r.row_type === "Section") return s;
		return s + (r.qty || 0) * (r.rate || 0);
	}, 0);
	frm.set_value("custom_boq_total", total);
}

// Parse pasted CSV/TSV text into Project BOQ Line row objects.
function parse_boq_paste(text) {
	const VALID_TYPES = ["Material", "Labour", "Equipment", "Subcontract", "Preliminary"];
	const rows = [];

	(text || "").split(/\r?\n/).forEach(line => {
		if (!line.trim()) return;

		// Split on tab if present (spreadsheet paste), else comma.
		const cols = (line.indexOf("\t") >= 0 ? line.split("\t") : line.split(","))
			.map(c => c.trim().replace(/^"|"$/g, ""));

		// Skip a header row.
		if (/^row\s*type$/i.test(cols[0]) || /title/i.test(cols[1] || "")) return;
		if (!cols[0] || !cols[1]) return;

		let row_type = /^sec/i.test(cols[0]) ? "Section" : "Sub-Section";
		let item_type = cols[2] || "Material";
		item_type = VALID_TYPES.find(t => t.toLowerCase() === item_type.toLowerCase()) || "Material";

		rows.push({
			row_type: row_type,
			title: cols[1],
			item_type: item_type,
			item_code: cols[3] || undefined,
			uom: cols[4] || undefined,
			qty: flt_num(cols[5]),
			rate: flt_num(cols[6]),
			description: cols[7] || undefined,
		});
	});

	return rows;
}

function flt_num(v) {
	const n = parseFloat((v || "").toString().replace(/,/g, ""));
	return isNaN(n) ? 0 : n;
}
