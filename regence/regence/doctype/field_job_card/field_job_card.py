import frappe
from frappe.model.document import Document


class FieldJobCard(Document):
	def validate(self) -> None:
		self.calculate_totals()

	def calculate_totals(self) -> None:
		self.total_material_cost = sum(row.amount or 0 for row in self.materials)
		self.total_service_cost = sum(row.amount or 0 for row in self.services)

	@frappe.whitelist() # type: ignore[misc]
	def consume_materials(self) -> str:
		if not self.materials:
			frappe.throw(frappe._("No materials to consume"))

		if self.stock_entry:
			frappe.throw(frappe._("Materials already consumed via {0}").format(self.stock_entry))

		for row in self.materials:
			if not row.warehouse:
				frappe.throw(
					frappe._("Source Warehouse is required for item {0} (row {1})").format(
						row.item_code, row.idx
					)
				)

		stock_entry = frappe.new_doc("Stock Entry")
		stock_entry.stock_entry_type = "Material Issue"
		stock_entry.project = self.project
		stock_entry.remarks = frappe._("Field Job Card: {0}").format(self.name)

		for row in self.materials:
			stock_entry.append("items", {
				"item_code": row.item_code,
				"qty": row.qty,
				"uom": row.uom,
				"s_warehouse": row.warehouse,
				"basic_rate": row.rate,
			})

		stock_entry.insert()
		self.db_set("stock_entry", stock_entry.name)
		return stock_entry.name

	@frappe.whitelist() # type: ignore[misc]
	def create_purchase_invoice(self) -> list[str]:
		if not self.services:
			frappe.throw(frappe._("No services to create invoice for"))

		suppliers: dict[str, list] = {}
		for row in self.services:
			if not row.supplier:
				frappe.throw(frappe._("Supplier is required for row: {0}").format(row.item_name))
			suppliers.setdefault(row.supplier, []).append(row)

		invoices = []
		for supplier, rows in suppliers.items():
			pi = frappe.new_doc("Purchase Invoice")
			pi.supplier = supplier
			pi.project = self.project
			pi.remarks = frappe._("Field Job Card: {0}").format(self.name)

			for row in rows:
				pi.append("items", {
					"item_code": row.item_code,
					"item_name": row.item_name,
					"description": row.description,
					"qty": row.qty,
					"uom": row.uom,
					"rate": row.rate,
					"amount": row.amount,
					# Link each line to the project so Project costing
					# (total_purchase_cost) picks it up once the invoice is submitted.
					"project": self.project,
				})

			pi.insert()
			invoices.append(pi.name)

		if len(invoices) == 1:
			self.db_set("purchase_invoice", invoices[0])

		frappe.msgprint(frappe._("Purchase Invoice(s) created: {0}").format(", ".join(invoices)))
		return invoices
