import frappe
from frappe import _
from frappe.utils import flt


# ---------------------------------------------------------------------------
# BOQ -> Tasks
# ---------------------------------------------------------------------------
@frappe.whitelist()
def create_tasks_from_boq(project: str) -> dict:
	"""Create Project Tasks from the BOQ lines on a Project.

	Section rows become parent (group) tasks; Sub-Section rows become child
	tasks linked to the preceding Section. Re-running updates existing tasks
	instead of creating duplicates (each line stores its linked task).
	"""
	proj = frappe.get_doc("Project", project)
	rows = proj.get("custom_boq_items") or []
	if not rows:
		frappe.throw(_("Add BOQ lines before creating tasks."))

	# Group sub-sections under their preceding section, preserving order.
	groups: list[dict] = []
	loose: dict = {"section": None, "children": []}
	for row in rows:
		row.amount = flt(row.qty) * flt(row.rate)
		if row.row_type == "Section":
			groups.append({"section": row, "children": []})
		else:
			(groups[-1] if groups else loose)["children"].append(row)
	if loose["children"]:
		groups.insert(0, loose)

	# Validate: a Section's amount must equal the sum of its sub-sections.
	mismatches = []
	for grp in groups:
		section_row = grp["section"]
		if section_row is None or not grp["children"]:
			continue
		own_amount = flt(section_row.amount)
		section_amount = sum(flt(c.amount) for c in grp["children"])
		if own_amount and abs(own_amount - section_amount) > 0.01:
			mismatches.append((section_row.title or _("(untitled)"), own_amount, section_amount))

	if mismatches:
		msg = _("Each Section's amount must equal the total of its sub-sections:") + "<ul>"
		for title, own, total in mismatches:
			msg += "<li>{0}: {1} &ne; {2}</li>".format(
				frappe.bold(title),
				frappe.format_value(own, {"fieldtype": "Currency"}),
				frappe.format_value(total, {"fieldtype": "Currency"}),
			)
		msg += "</ul>" + _(
			"Leave the Section row's Qty/Rate blank (it rolls up from its sub-sections), "
			"or correct the sub-section amounts."
		)
		frappe.throw(msg, title=_("BOQ Totals Don't Reconcile"))

	created = updated = 0
	grand_total = 0.0
	for grp in groups:
		section_row = grp["section"]
		children = grp["children"]
		section_amount = sum(flt(c.amount) for c in children)

		parent_task = None
		if section_row is not None:
			# Section with sub-sections rolls up their total; a standalone
			# section keeps its own line amount.
			section_total = section_amount if children else flt(section_row.amount)
			section_row.amount = section_total
			grand_total += section_total
			task, is_new = _upsert_task(
				section_row, project, parent_task=None, is_group=1,
				costing_amount=section_total,
			)
			parent_task = task.name
			created += int(is_new)
			updated += int(not is_new)
		else:
			# Loose sub-sections with no parent section.
			grand_total += section_amount

		for child in children:
			task, is_new = _upsert_task(
				child, project, parent_task=parent_task, is_group=0,
				costing_amount=child.amount,
				section_title=(section_row.title if section_row is not None else None),
			)
			created += int(is_new)
			updated += int(not is_new)

	# Keep the BOQ Total in sync with the rolled-up section totals.
	proj.custom_boq_total = grand_total

	# Refresh the read-only Tasks child table mirror.
	_rebuild_project_tasks(proj)

	# Persist the line -> task links written by _upsert_task and the task mirror.
	proj.save(ignore_permissions=True)

	frappe.msgprint(
		_("Tasks synced from BOQ: {0} created, {1} updated.").format(created, updated),
		alert=True,
	)
	return {"created": created, "updated": updated}


def _rebuild_project_tasks(proj) -> bool:
	"""Repopulate the Project Tasks child table from the project's tasks.

	Returns True only if the table actually changed, so callers can avoid
	saving the Project on every load.
	"""
	tasks = frappe.get_all(
		"Task",
		filters={"project": proj.name},
		fields=[
			"name", "subject", "is_group", "status",
			"custom_boq_amount", "custom_sales_invoice",
		],
		order_by="lft asc",
	)
	desired = [
		(
			t.name, t.subject or "", int(t.is_group or 0), t.status or "",
			flt(t.custom_boq_amount), t.custom_sales_invoice or None,
		)
		for t in tasks
	]
	existing = [
		(
			r.task, r.subject or "", int(r.is_group or 0), r.status or "",
			flt(r.boq_amount), r.sales_invoice or None,
		)
		for r in (proj.get("custom_project_tasks") or [])
	]
	if desired == existing:
		return False

	proj.set("custom_project_tasks", [])
	for t in tasks:
		proj.append("custom_project_tasks", {
			"task": t.name,
			"subject": t.subject,
			"is_group": t.is_group,
			"status": t.status,
			"boq_amount": t.custom_boq_amount,
			"sales_invoice": t.custom_sales_invoice,
		})
	return True


@frappe.whitelist()
def sync_project_tasks(project: str) -> dict:
	"""Refresh the Project Tasks child table from the live task data.
	Called on Project load so the table stays current."""
	proj = frappe.get_doc("Project", project)
	changed = _rebuild_project_tasks(proj)
	if changed:
		proj.save(ignore_permissions=True)
	return {"changed": changed}


def sync_project_task_rows(doc, method=None):
	"""Project validate hook: create real Tasks for new rows typed into the
	Project Tasks table. Edits to existing rows propagate via explicit
	field-change events (see update_task_field), not here, to avoid a stale
	row silently overwriting a task changed elsewhere."""
	for row in (doc.get("custom_project_tasks") or []):
		if row.task:
			continue
		subject = (row.subject or "").strip()
		if not subject:
			continue
		t = frappe.new_doc("Task")
		t.project = doc.name
		t.subject = subject
		t.is_group = row.is_group or 0
		t.status = row.status or "Open"
		if row.boq_amount:
			t.custom_boq_amount = row.boq_amount
		t.flags.ignore_permissions = True
		t.insert()
		row.task = t.name
		row.status = t.status


# Fields that may be edited on a Task from the Project Tasks table.
_EDITABLE_TASK_FIELDS = {
	"status": "status",
	"subject": "subject",
	"boq_amount": "custom_boq_amount",
}


@frappe.whitelist()
def update_task_field(task: str, fieldname: str, value=None):
	"""Push an explicit edit of an existing Project Tasks row to its Task."""
	target = _EDITABLE_TASK_FIELDS.get(fieldname)
	if not target:
		frappe.throw(_("Field {0} cannot be updated from the project.").format(fieldname))

	t = frappe.get_doc("Task", task)
	if fieldname == "boq_amount":
		if flt(t.get(target)) == flt(value):
			return t.get(target)
	elif (t.get(target) or None) == (value or None):
		return t.get(target)

	t.set(target, value)
	t.flags.ignore_permissions = True
	t.save()
	return t.get(target)


def _upsert_task(row, project, parent_task, is_group, costing_amount=0, section_title=None):
	"""Create or update the Task linked to a BOQ line. Returns (task, is_new)."""
	is_new = False
	if row.task and frappe.db.exists("Task", row.task):
		task = frappe.get_doc("Task", row.task)
	else:
		task = frappe.new_doc("Task")
		is_new = True

	task.subject = row.title
	task.project = project
	task.is_group = is_group
	# Parent (Section) tasks are flagged as milestones automatically.
	task.is_milestone = 1 if is_group else 0
	task.parent_task = parent_task
	if row.description:
		task.description = row.description

	# BOQ costing carried onto the task.
	task.custom_boq_section = section_title or (row.title if is_group else None)
	task.custom_item_type = row.item_type
	task.custom_item_code = row.item_code
	task.custom_uom = row.uom
	task.custom_qty = flt(row.qty)
	task.custom_rate = flt(row.rate)
	task.custom_boq_amount = flt(costing_amount)

	task.flags.ignore_permissions = True
	task.save()

	if row.task != task.name:
		row.task = task.name
	return task, is_new


# ---------------------------------------------------------------------------
# Task -> Sales Invoice
# ---------------------------------------------------------------------------
@frappe.whitelist()
def create_sales_invoice_from_task(task: str) -> str:
	"""Create a draft Sales Invoice for a Task using its BOQ costing,
	capturing the related Project and Sales Order."""
	t = frappe.get_doc("Task", task)

	if not t.project:
		frappe.throw(_("Task is not linked to a Project."))

	customer = frappe.db.get_value("Project", t.project, "customer")
	if not customer:
		frappe.throw(_("Project {0} has no Customer set.").format(t.project))

	if not t.custom_item_code:
		frappe.throw(_("Set a BOQ Item Code on the task before creating a Sales Invoice."))

	sales_order = _find_sales_order(t.project)

	qty = flt(t.custom_qty) or 1
	rate = flt(t.custom_rate)
	if not rate:
		# Fall back to budgeted amount spread across qty.
		rate = flt(t.custom_boq_amount) / qty if qty else flt(t.custom_boq_amount)

	si = frappe.new_doc("Sales Invoice")
	si.customer = customer
	si.project = t.project
	si.remarks = _("Generated from Task {0}").format(t.name)

	item = {
		"item_code": t.custom_item_code,
		"description": t.description or t.subject,
		"qty": qty,
		"rate": rate,
		"project": t.project,
	}
	if sales_order:
		item["sales_order"] = sales_order
	si.append("items", item)

	si.flags.ignore_permissions = True
	si.insert()

	t.db_set("custom_sales_invoice", si.name)
	frappe.msgprint(
		_("Sales Invoice {0} created.").format(
			frappe.utils.get_link_to_form("Sales Invoice", si.name)
		),
		alert=True,
	)
	return si.name


def _find_sales_order(project: str) -> str | None:
	"""Best-effort lookup of a submitted Sales Order for the project."""
	# Prefer the Sales Order set directly on the Project.
	direct = frappe.db.get_value("Project", project, "sales_order")
	if direct:
		return direct
	so = frappe.get_all(
		"Sales Order",
		filters={"project": project, "docstatus": 1},
		pluck="name",
		order_by="creation desc",
		limit=1,
	)
	return so[0] if so else None


def _guess_item_type(item_code: str) -> str:
	"""Map an item's group to a BOQ cost type."""
	grp = (frappe.db.get_value("Item", item_code, "item_group") or "").lower()
	if "labour" in grp or "labor" in grp:
		return "Labour"
	if "equipment" in grp or "plant" in grp:
		return "Equipment"
	if "subcontract" in grp:
		return "Subcontract"
	return "Material"


@frappe.whitelist()
def import_boq_from_sales_order(project: str, replace=0) -> dict:
	"""Populate the Project BOQ lines from the items of the linked Sales Order,
	so each BOQ item code mirrors the sold item."""
	replace = int(replace)
	proj = frappe.get_doc("Project", project)

	so_name = _find_sales_order(project)
	if not so_name:
		frappe.throw(_("No Sales Order is linked to this project."))

	so_items = frappe.get_all(
		"Sales Order Item",
		filters={"parent": so_name},
		fields=["item_code", "item_name", "description", "uom", "qty", "rate"],
		order_by="idx asc",
	)
	if not so_items:
		frappe.throw(_("Sales Order {0} has no items.").format(so_name))

	if replace:
		proj.set("custom_boq_items", [])
	existing = {r.item_code for r in (proj.get("custom_boq_items") or []) if r.item_code}

	added = 0
	for it in so_items:
		if not replace and it.item_code in existing:
			continue
		proj.append("custom_boq_items", {
			"row_type": "Sub-Section",
			"title": it.item_name or it.item_code,
			"item_type": _guess_item_type(it.item_code),
			"item_code": it.item_code,
			"uom": it.uom,
			"qty": it.qty,
			"rate": it.rate,
			"amount": flt(it.qty) * flt(it.rate),
			"description": it.description,
		})
		existing.add(it.item_code)
		added += 1

	proj.custom_boq_total = sum(
		flt(r.qty) * flt(r.rate)
		for r in proj.get("custom_boq_items") if r.row_type != "Section"
	)
	proj.save(ignore_permissions=True)

	return {"added": added, "sales_order": so_name}


# ---------------------------------------------------------------------------
# Task -> Field Job Cards (for the Job Cards tab HTML)
# ---------------------------------------------------------------------------
@frappe.whitelist()
def get_task_job_cards(task: str) -> list[dict]:
	"""Return the Field Job Cards for a task with their costing.

	For a parent (group) task, aggregate the job cards of all its descendant
	tasks, since field work is logged against the sub-section tasks.
	"""
	tasks = _task_and_descendants(task)
	cards = frappe.get_all(
		"Field Job Card",
		filters={"task": ["in", tasks]},
		fields=[
			"name", "task", "status", "scheduled_date", "completion_date",
			"total_material_cost", "total_service_cost",
		],
		order_by="creation desc",
	)
	for c in cards:
		c["total_cost"] = flt(c.total_material_cost) + flt(c.total_service_cost)
	return cards


def _task_and_descendants(task: str) -> list[str]:
	"""Return the task plus all descendant tasks (for group tasks)."""
	is_group, lft, rgt = frappe.db.get_value("Task", task, ["is_group", "lft", "rgt"]) or (0, 0, 0)
	if is_group and lft and rgt:
		descendants = frappe.get_all(
			"Task",
			filters={"lft": [">=", lft], "rgt": ["<=", rgt]},
			pluck="name",
		)
		return descendants or [task]
	return [task]


# ---------------------------------------------------------------------------
# Field Job Card -> item rate resolution
# ---------------------------------------------------------------------------
@frappe.whitelist()
def get_job_card_item_rate(item_code: str, kind: str, uom: str = None,
		supplier: str = None, warehouse: str = None) -> float:
	"""Resolve the cost rate for a Field Job Card line.

	Materials: last purchase rate -> warehouse/item valuation -> standard rate.
	Services:  buying price list (supplier-aware) -> last purchase rate -> standard rate.
	"""
	item = frappe.db.get_value(
		"Item", item_code,
		["stock_uom", "last_purchase_rate", "valuation_rate", "standard_rate"],
		as_dict=True,
	)
	if not item:
		return 0.0

	uom = uom or item.stock_uom
	rate = 0.0

	if kind == "service":
		price_list = frappe.db.get_single_value("Buying Settings", "buying_price_list")
		if price_list:
			rate = _buying_price(item_code, price_list, uom, supplier)
		if not rate:
			rate = flt(item.last_purchase_rate)
	else:  # material
		rate = flt(item.last_purchase_rate)
		if not rate and warehouse:
			rate = flt(frappe.db.get_value(
				"Bin", {"item_code": item_code, "warehouse": warehouse}, "valuation_rate"))
		if not rate:
			rate = flt(item.valuation_rate)

	if not rate:
		rate = flt(item.standard_rate)
	return rate


def _buying_price(item_code, price_list, uom, supplier=None):
	"""Look up an Item Price in the buying price list, preferring the supplier."""
	from erpnext.stock.get_item_details import get_item_price

	pctx = {
		"price_list": price_list,
		"uom": uom,
		"supplier": supplier,
		"transaction_date": frappe.utils.nowdate(),
	}
	res = []
	if supplier:
		res = get_item_price(pctx, item_code)
	if not res:
		res = get_item_price(pctx, item_code, ignore_party=True)
	return flt(res[0].price_list_rate) if res else 0.0
