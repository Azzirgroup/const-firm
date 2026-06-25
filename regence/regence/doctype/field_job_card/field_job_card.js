frappe.ui.form.on("Field Job Card", {
	refresh(frm) {
		if (!frm.is_new()) {
			if ((frm.doc.materials || []).length && !frm.doc.stock_entry) {
				frm.add_custom_button(__("Consume Materials"), () => {
					frm.call("consume_materials").then(r => {
						if (r.message) {
							frappe.set_route("Form", "Stock Entry", r.message);
						}
					});
				}, __("Actions"));
			}

			if ((frm.doc.services || []).length) {
				frm.add_custom_button(__("Create Purchase Invoice"), () => {
					frappe.confirm(__("Create Purchase Invoice(s) for the listed services?"), () => {
						frm.call("create_purchase_invoice").then(() => frm.refresh());
					});
				}, __("Actions"));
			}

			if (frm.doc.stock_entry) {
				frm.add_custom_button(__("Stock Entry"), () => {
					frappe.set_route("Form", "Stock Entry", frm.doc.stock_entry);
				}, __("View"));
			}

			if (frm.doc.purchase_invoice) {
				frm.add_custom_button(__("Purchase Invoice"), () => {
					frappe.set_route("Form", "Purchase Invoice", frm.doc.purchase_invoice);
				}, __("View"));
			}
		}
	},

	// Push the header default warehouse onto material rows.
	set_warehouse(frm) {
		if (!frm.doc.set_warehouse) return;
		(frm.doc.materials || []).forEach(row => {
			if (!row.warehouse) {
				frappe.model.set_value(row.doctype, row.name, "warehouse", frm.doc.set_warehouse);
			}
		});
	},
});

frappe.ui.form.on("Field Job Card Material", {
	materials_add(frm, cdt, cdn) {
		// Default new rows to the header source warehouse.
		if (frm.doc.set_warehouse) {
			frappe.model.set_value(cdt, cdn, "warehouse", frm.doc.set_warehouse);
		}
	},
	item_code(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		if (!row.item_code) return;
		if (!row.warehouse && frm.doc.set_warehouse) {
			frappe.model.set_value(cdt, cdn, "warehouse", frm.doc.set_warehouse);
		}
		frappe.db.get_value("Item", row.item_code, ["item_name", "stock_uom"], (v) => {
			frappe.model.set_value(cdt, cdn, "item_name", v.item_name);
			frappe.model.set_value(cdt, cdn, "uom", v.stock_uom);
			fetch_jc_rate(frm, cdt, cdn, "material", calc_material_amount);
		});
	},
	warehouse: (frm, cdt, cdn) => fetch_jc_rate(frm, cdt, cdn, "material", calc_material_amount),
	qty: (frm, cdt, cdn) => calc_material_amount(frm, cdt, cdn),
});

frappe.ui.form.on("Field Job Card Service", {
	item_code(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		if (!row.item_code) return;
		frappe.db.get_value("Item", row.item_code, ["item_name", "stock_uom"], (v) => {
			frappe.model.set_value(cdt, cdn, "item_name", v.item_name);
			frappe.model.set_value(cdt, cdn, "uom", v.stock_uom);
			fetch_jc_rate(frm, cdt, cdn, "service", calc_service_amount);
		});
	},
	supplier: (frm, cdt, cdn) => fetch_jc_rate(frm, cdt, cdn, "service", calc_service_amount),
	qty: (frm, cdt, cdn) => calc_service_amount(frm, cdt, cdn),
});

// Resolve the cost rate server-side (the rate field is read-only) then recompute.
function fetch_jc_rate(frm, cdt, cdn, kind, after) {
	const row = locals[cdt][cdn];
	if (!row.item_code) return;
	frappe.call({
		method: "regence.api.get_job_card_item_rate",
		args: {
			item_code: row.item_code,
			kind: kind,
			uom: row.uom,
			supplier: row.supplier,
			warehouse: row.warehouse,
		},
		callback: r => {
			frappe.model.set_value(cdt, cdn, "rate", flt(r.message));
			after(frm, cdt, cdn);
		},
	});
}

function calc_material_amount(frm, cdt, cdn) {
	const row = locals[cdt][cdn];
	frappe.model.set_value(cdt, cdn, "amount", (row.qty || 0) * (row.rate || 0));
	frm.set_value("total_material_cost", (frm.doc.materials || []).reduce((s, r) => s + (r.amount || 0), 0));
}

function calc_service_amount(frm, cdt, cdn) {
	const row = locals[cdt][cdn];
	frappe.model.set_value(cdt, cdn, "amount", (row.qty || 0) * (row.rate || 0));
	frm.set_value("total_service_cost", (frm.doc.services || []).reduce((s, r) => s + (r.amount || 0), 0));
}
