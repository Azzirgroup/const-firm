import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
	# Remove legacy empty stub tabs that duplicate the new populated tabs.
	for dt, fieldname in LEGACY_FIELDS:
		name = frappe.db.get_value("Custom Field", {"dt": dt, "fieldname": fieldname})
		if name:
			frappe.delete_doc("Custom Field", name, ignore_permissions=True, force=True)

	create_custom_fields(CUSTOM_FIELDS, ignore_validate=True)
	frappe.db.commit()


# (doctype, fieldname) stubs superseded by the fields created below.
LEGACY_FIELDS = [
	("Project", "custom_boq"),
	("Project", "custom_tasks"),
	("Task", "custom_field_job_cards"),
	# Tasks tab is now a child table, not an HTML field.
	("Project", "custom_tasks_html"),
]


CUSTOM_FIELDS = {
	"Project": [
		{
			"fieldname": "custom_boq_tab",
			"label": "BOQ",
			"fieldtype": "Tab Break",
			"insert_after": "notes",
		},
		{
			"fieldname": "custom_boq_section_break",
			"label": "Bill of Quantities",
			"fieldtype": "Section Break",
			"insert_after": "custom_boq_tab",
		},
		{
			"fieldname": "custom_boq_items",
			"label": "BOQ Lines",
			"fieldtype": "Table",
			"options": "Project BOQ Line",
			"insert_after": "custom_boq_section_break",
			"description": "Use 'Section' rows for parent tasks and 'Sub-Section' rows for child tasks.",
		},
		{
			"fieldname": "custom_boq_total",
			"label": "BOQ Total",
			"fieldtype": "Currency",
			"read_only": 1,
			"insert_after": "custom_boq_items",
		},
		{
			"fieldname": "custom_import_boq_so_btn",
			"label": "Import from Sales Order",
			"fieldtype": "Button",
			"insert_after": "custom_boq_total",
		},
		{
			"fieldname": "custom_upload_boq_btn",
			"label": "Bulk Upload BOQ Lines",
			"fieldtype": "Button",
			"insert_after": "custom_import_boq_so_btn",
		},
		{
			"fieldname": "custom_create_tasks_btn",
			"label": "Create / Sync Tasks from BOQ",
			"fieldtype": "Button",
			"insert_after": "custom_upload_boq_btn",
		},
		{
			"fieldname": "custom_tasks_tab",
			"label": "Tasks",
			"fieldtype": "Tab Break",
			"insert_after": "custom_create_tasks_btn",
		},
		{
			"fieldname": "custom_project_tasks",
			"label": "Project Tasks",
			"fieldtype": "Table",
			"options": "Project Task",
			"insert_after": "custom_tasks_tab",
			"read_only": 0,
			"description": "Live view of the project's tasks. Change a Status here to update the task; complete tasks centrally from the project.",
		},
	],
	"Task": [
		{
			"fieldname": "custom_boq_costing_section",
			"label": "BOQ Costing",
			"fieldtype": "Section Break",
			"insert_after": "total_billing_amount",
			"collapsible": 1,
		},
		{
			"fieldname": "custom_boq_section",
			"label": "BOQ Section",
			"fieldtype": "Data",
			"read_only": 1,
			"insert_after": "custom_boq_costing_section",
		},
		{
			"fieldname": "custom_item_type",
			"label": "BOQ Type",
			"fieldtype": "Select",
			"options": "\nMaterial\nLabour\nEquipment\nSubcontract\nPreliminary",
			"insert_after": "custom_boq_section",
		},
		{
			"fieldname": "custom_item_code",
			"label": "BOQ Item Code",
			"fieldtype": "Link",
			"options": "Item",
			"insert_after": "custom_item_type",
		},
		{
			"fieldname": "custom_uom",
			"label": "UOM",
			"fieldtype": "Link",
			"options": "UOM",
			"insert_after": "custom_item_code",
		},
		{
			"fieldname": "custom_col_break_boq",
			"fieldtype": "Column Break",
			"insert_after": "custom_uom",
		},
		{
			"fieldname": "custom_qty",
			"label": "BOQ Qty",
			"fieldtype": "Float",
			"insert_after": "custom_col_break_boq",
		},
		{
			"fieldname": "custom_rate",
			"label": "BOQ Rate",
			"fieldtype": "Currency",
			"insert_after": "custom_qty",
		},
		{
			"fieldname": "custom_boq_amount",
			"label": "BOQ Amount (Budget)",
			"fieldtype": "Currency",
			"read_only": 1,
			"insert_after": "custom_rate",
		},
		{
			"fieldname": "custom_sales_order",
			"label": "Sales Order",
			"fieldtype": "Link",
			"options": "Sales Order",
			"read_only": 1,
			"insert_after": "custom_boq_amount",
		},
		{
			"fieldname": "custom_sales_invoice",
			"label": "Sales Invoice",
			"fieldtype": "Link",
			"options": "Sales Invoice",
			"read_only": 1,
			"insert_after": "custom_sales_order",
		},
		{
			"fieldname": "custom_job_cards_tab",
			"label": "Job Cards",
			"fieldtype": "Tab Break",
			"insert_after": "column_break_vvfp",
		},
		{
			"fieldname": "custom_job_cards_html",
			"label": "Job Cards",
			"fieldtype": "HTML",
			"insert_after": "custom_job_cards_tab",
		},
	],
}
