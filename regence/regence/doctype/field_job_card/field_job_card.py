import frappe
from frappe.model.document import Document


class FieldJobCard(Document):
	def validate(self) -> None:
		self.calculate_totals()

	def calculate_totals(self) -> None:
		self.total_material_cost = sum(row.amount or 0 for row in self.materials)
		self.total_service_cost = sum(row.amount or 0 for row in self.services)

	def on_submit(self) -> None:
		"""Consume raw materials (submit Stock Entry) and bill the services
		(create Purchase Invoice) automatically when the card is submitted."""
		messages = []
		se = self._ensure_materials_consumed()
		if se:
			messages.append(frappe._("Materials consumed via {0}").format(
				frappe.utils.get_link_to_form("Stock Entry", se)))

		invoices = self._ensure_services_billed()
		if invoices:
			messages.append(frappe._("Purchase Invoice(s) created: {0}").format(
				", ".join(frappe.utils.get_link_to_form("Purchase Invoice", n) for n in invoices)))

		if self.status != "Completed":
			self.db_set("status", "Completed")

		if messages:
			frappe.msgprint("<br>".join(messages), title=frappe._("Field Job Card Submitted"), indicator="green")

	def on_cancel(self) -> None:
		"""Reverse the auto-created Stock Entry / Purchase Invoice."""
		self.ignore_linked_doctypes = ("GL Entry", "Stock Ledger Entry", "Repost Item Valuation")

		if self.stock_entry and frappe.db.get_value("Stock Entry", self.stock_entry, "docstatus") == 1:
			se = frappe.get_doc("Stock Entry", self.stock_entry)
			se.flags.ignore_permissions = True
			se.cancel()

		if self.purchase_invoice and frappe.db.get_value("Purchase Invoice", self.purchase_invoice, "docstatus") == 1:
			pi = frappe.get_doc("Purchase Invoice", self.purchase_invoice)
			pi.flags.ignore_permissions = True
			pi.cancel()

		if self.status != "Cancelled":
			self.db_set("status", "Cancelled")

	# ------------------------------------------------------------------
	# Submit-time automation
	# ------------------------------------------------------------------
	def _ensure_materials_consumed(self) -> str | None:
		if not self.materials:
			return None
		if self.stock_entry:
			# Submit a previously created draft entry, if any.
			if frappe.db.get_value("Stock Entry", self.stock_entry, "docstatus") == 0:
				se = frappe.get_doc("Stock Entry", self.stock_entry)
				se.flags.ignore_permissions = True
				se.submit()
			return self.stock_entry
		return self._make_stock_entry(submit=True)

	def _ensure_services_billed(self) -> list[str]:
		if not self.services or self.purchase_invoice:
			return []
		return self._make_purchase_invoices()

	def _make_stock_entry(self, submit: bool = False) -> str:
		for row in self.materials:
			warehouse = row.warehouse or self.set_warehouse
			if not warehouse:
				frappe.throw(
					frappe._("Source Warehouse is required for item {0} (row {1})").format(
						row.item_code, row.idx
					)
				)

		stock_entry = frappe.new_doc("Stock Entry")
		stock_entry.stock_entry_type = "Material Issue"
		stock_entry.project = self.project
		stock_entry.from_warehouse = self.set_warehouse
		stock_entry.remarks = frappe._("Field Job Card: {0}").format(self.name)

		for row in self.materials:
			stock_entry.append("items", {
				"item_code": row.item_code,
				"qty": row.qty,
				"uom": row.uom,
				"s_warehouse": row.warehouse or self.set_warehouse,
				"basic_rate": row.rate,
			})

		stock_entry.flags.ignore_permissions = True
		stock_entry.insert()
		if submit:
			stock_entry.submit()
		self.db_set("stock_entry", stock_entry.name)
		return stock_entry.name

	def _make_purchase_invoices(self) -> list[str]:
		suppliers: dict[str, list] = {}
		for row in self.services:
			if not row.supplier:
				frappe.throw(frappe._("Supplier is required for service row: {0}").format(row.item_name))
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

			pi.flags.ignore_permissions = True
			pi.insert()
			pi.submit()
			invoices.append(pi.name)

		if len(invoices) == 1:
			self.db_set("purchase_invoice", invoices[0])
		return invoices

	# ------------------------------------------------------------------
	# Manual actions (kept for callers / API use)
	# ------------------------------------------------------------------
	@frappe.whitelist()  # type: ignore[misc]
	def consume_materials(self) -> str:
		if not self.materials:
			frappe.throw(frappe._("No materials to consume"))
		if self.stock_entry:
			frappe.throw(frappe._("Materials already consumed via {0}").format(self.stock_entry))
		return self._make_stock_entry(submit=True)

	@frappe.whitelist()  # type: ignore[misc]
	def create_purchase_invoice(self) -> list[str]:
		if not self.services:
			frappe.throw(frappe._("No services to create invoice for"))
		if self.purchase_invoice:
			frappe.throw(frappe._("Purchase Invoice {0} already exists").format(self.purchase_invoice))
		invoices = self._make_purchase_invoices()
		frappe.msgprint(frappe._("Purchase Invoice(s) created: {0}").format(", ".join(invoices)))
		return invoices
