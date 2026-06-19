import frappe
from frappe import _


@frappe.whitelist()
def get_construction_dashboard():
	today = frappe.utils.today()
	month_start = frappe.utils.get_first_day(today)

	projects = frappe.db.sql("""
		SELECT name, project_name, customer, percent_complete, expected_end_date,
		       estimated_costing, status, priority
		FROM `tabProject`
		WHERE status = 'Open'
		ORDER BY expected_end_date ASC
		LIMIT 10
	""", as_dict=True)

	tasks = frappe.db.sql("""
		SELECT name, subject, project, exp_end_date, priority, status
		FROM `tabTask`
		WHERE status IN ('Open', 'Working')
		ORDER BY exp_end_date ASC
		LIMIT 30
	""", as_dict=True)

	overdue = frappe.db.sql("""
		SELECT name, subject, project, exp_end_date, priority
		FROM `tabTask`
		WHERE status IN ('Open', 'Working')
		AND exp_end_date IS NOT NULL AND exp_end_date < %s
		ORDER BY exp_end_date ASC
		LIMIT 8
	""", (today,), as_dict=True)

	fjc = frappe.db.sql("""
		SELECT name, task, project, status, scheduled_date, total_material_cost, total_service_cost
		FROM `tabField Job Card`
		WHERE DATE(creation) >= %s
		ORDER BY creation DESC
		LIMIT 8
	""", (month_start,), as_dict=True)

	mr = frappe.db.sql("""
		SELECT name, material_request_type, status, transaction_date
		FROM `tabMaterial Request`
		WHERE docstatus = 0
		LIMIT 5
	""", as_dict=True)

	pi = frappe.db.sql("""
		SELECT name, supplier, grand_total, posting_date, project
		FROM `tabPurchase Invoice`
		WHERE docstatus = 0
		ORDER BY posting_date DESC
		LIMIT 5
	""", as_dict=True)

	# Task counts by project
	task_by_project = frappe.db.sql("""
		SELECT project, status, COUNT(*) as cnt
		FROM `tabTask`
		WHERE project IS NOT NULL AND project != ''
		GROUP BY project, status
	""", as_dict=True)

	# Tasks completed this month
	completed_month = frappe.db.sql("""
		SELECT COUNT(*) as cnt FROM `tabTask`
		WHERE status = 'Completed'
		AND modified >= %s
	""", (month_start,), as_dict=True)[0].cnt or 0

	# Weekly task completions (last 4 weeks)
	weekly_completions = frappe.db.sql("""
		SELECT YEARWEEK(modified, 1) as wk, COUNT(*) as cnt
		FROM `tabTask`
		WHERE status = 'Completed'
		AND modified >= DATE_SUB(%s, INTERVAL 28 DAY)
		GROUP BY wk ORDER BY wk ASC
	""", (today,), as_dict=True)

	return {
		"projects": projects,
		"tasks": tasks,
		"overdue": overdue,
		"fjc": fjc,
		"mr": mr,
		"pi": pi,
		"task_by_project": task_by_project,
		"completed_month": completed_month,
		"weekly_completions": weekly_completions,
	}


@frappe.whitelist()
def get_equipment_tracker():
	today = frappe.utils.today()
	thirty_days = frappe.utils.add_days(today, 30)

	assets = frappe.db.sql("""
		SELECT name, asset_name, asset_category, location, status,
		       purchase_date, purchase_amount, custodian
		FROM `tabAsset`
		WHERE docstatus = 1
		ORDER BY asset_name ASC
		LIMIT 50
	""", as_dict=True)

	maintenance_tasks = frappe.db.sql("""
		SELECT parent, maintenance_type, next_due_date, assign_to, description
		FROM `tabAsset Maintenance Task`
		WHERE next_due_date IS NOT NULL AND next_due_date <= %s
		ORDER BY next_due_date ASC
		LIMIT 20
	""", (thirty_days,), as_dict=True)

	repairs = frappe.db.sql("""
		SELECT name, asset_name, failure_date, repair_status, repair_cost
		FROM `tabAsset Repair`
		WHERE docstatus = 1
		ORDER BY failure_date DESC
		LIMIT 10
	""", as_dict=True)

	# Category breakdown: count + total value
	by_category = frappe.db.sql("""
		SELECT asset_category,
		       COUNT(*) as cnt,
		       SUM(purchase_amount) as total_value
		FROM `tabAsset`
		WHERE docstatus = 1 AND asset_category IS NOT NULL
		GROUP BY asset_category
		ORDER BY total_value DESC
		LIMIT 10
	""", as_dict=True)

	total_value = frappe.db.sql("""
		SELECT SUM(purchase_amount) as total FROM `tabAsset` WHERE docstatus = 1
	""", as_dict=True)[0].total or 0

	# Repair cost this year
	repair_cost_ytd = frappe.db.sql("""
		SELECT SUM(repair_cost) as total FROM `tabAsset Repair`
		WHERE docstatus = 1 AND YEAR(failure_date) = YEAR(%s)
	""", (today,), as_dict=True)[0].total or 0

	return {
		"assets": assets,
		"maintenance_tasks": maintenance_tasks,
		"repairs": repairs,
		"by_category": by_category,
		"total_value": total_value,
		"repair_cost_ytd": repair_cost_ytd,
		"today": today,
	}


@frappe.whitelist()
def get_site_labour():
	today = frappe.utils.today()
	month_start = frappe.utils.get_first_day(today)

	all_emp = frappe.db.sql("""
		SELECT name, employee_name, department, designation
		FROM `tabEmployee`
		WHERE status = 'Active'
		LIMIT 200
	""", as_dict=True)

	att_today = frappe.db.sql("""
		SELECT employee, employee_name, status, in_time, out_time, working_hours
		FROM `tabAttendance`
		WHERE attendance_date = %s AND docstatus = 1
		ORDER BY employee_name ASC
		LIMIT 100
	""", (today,), as_dict=True)

	att_month = frappe.db.sql("""
		SELECT status, COUNT(*) as count
		FROM `tabAttendance`
		WHERE attendance_date >= %s AND docstatus = 1
		GROUP BY status
	""", (month_start,), as_dict=True)

	leaves = frappe.db.sql("""
		SELECT name, employee, employee_name, leave_type, from_date, to_date, total_leave_days
		FROM `tabLeave Application`
		WHERE status = 'Open' AND docstatus = 0
		ORDER BY from_date ASC
		LIMIT 15
	""", as_dict=True)

	slips = frappe.db.sql("""
		SELECT name, employee, employee_name, gross_pay, net_pay, start_date, end_date
		FROM `tabSalary Slip`
		WHERE docstatus = 0
		ORDER BY modified DESC
		LIMIT 10
	""", as_dict=True)

	dept = frappe.db.sql("""
		SELECT department, COUNT(*) as count
		FROM `tabEmployee`
		WHERE status = 'Active'
		GROUP BY department
		ORDER BY count DESC
		LIMIT 10
	""", as_dict=True)

	# Monthly attendance trend — last 6 months by month
	monthly_trend = frappe.db.sql("""
		SELECT DATE_FORMAT(attendance_date, '%%Y-%%m') as month,
		       SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) as present,
		       SUM(CASE WHEN status = 'Absent'  THEN 1 ELSE 0 END) as absent,
		       SUM(CASE WHEN status = 'On Leave' THEN 1 ELSE 0 END) as on_leave,
		       SUM(CASE WHEN status = 'Half Day' THEN 1 ELSE 0 END) as half_day
		FROM `tabAttendance`
		WHERE attendance_date >= DATE_SUB(%s, INTERVAL 6 MONTH)
		AND docstatus = 1
		GROUP BY month
		ORDER BY month ASC
	""", (today,), as_dict=True)

	# Overtime: employees who worked more than 8 hrs today
	overtime = frappe.db.sql("""
		SELECT employee_name, working_hours
		FROM `tabAttendance`
		WHERE attendance_date = %s AND docstatus = 1
		AND working_hours > 8
		ORDER BY working_hours DESC
		LIMIT 10
	""", (today,), as_dict=True)

	# Salary totals for draft slips
	slip_totals = frappe.db.sql("""
		SELECT SUM(gross_pay) as gross, SUM(net_pay) as net
		FROM `tabSalary Slip` WHERE docstatus = 0
	""", as_dict=True)[0]

	return {
		"all_emp": all_emp,
		"att_today": att_today,
		"att_month": att_month,
		"leaves": leaves,
		"slips": slips,
		"dept": dept,
		"monthly_trend": monthly_trend,
		"overtime": overtime,
		"slip_totals": {
			"gross": slip_totals.gross or 0,
			"net":   slip_totals.net   or 0,
		},
		"today": today,
	}


@frappe.whitelist()
def get_overview():
	today = frappe.utils.today()
	month_start = frappe.utils.get_first_day(today)

	projects = frappe.db.sql("""
		SELECT name, project_name, percent_complete, expected_end_date, customer
		FROM `tabProject` WHERE status = 'Open'
		ORDER BY expected_end_date ASC LIMIT 5
	""", as_dict=True)

	open_tasks = frappe.db.sql("""
		SELECT COUNT(*) as cnt FROM `tabTask`
		WHERE status IN ('Open', 'Working')
	""", as_dict=True)[0].cnt or 0

	overdue_tasks = frappe.db.sql("""
		SELECT COUNT(*) as cnt FROM `tabTask`
		WHERE status IN ('Open', 'Working')
		AND exp_end_date IS NOT NULL AND exp_end_date < %s
	""", (today,), as_dict=True)[0].cnt or 0

	fjc = frappe.db.sql("""
		SELECT name, status, total_material_cost, total_service_cost
		FROM `tabField Job Card` WHERE DATE(creation) >= %s LIMIT 100
	""", (month_start,), as_dict=True)

	mr_count = frappe.db.sql("""
		SELECT COUNT(*) as cnt FROM `tabMaterial Request` WHERE docstatus = 0
	""", as_dict=True)[0].cnt or 0

	att_today = frappe.db.sql("""
		SELECT status, COUNT(*) as cnt FROM `tabAttendance`
		WHERE attendance_date = %s AND docstatus = 1
		GROUP BY status
	""", (today,), as_dict=True)

	emp_count = frappe.db.sql("""
		SELECT COUNT(*) as cnt FROM `tabEmployee` WHERE status = 'Active'
	""", as_dict=True)[0].cnt or 0

	assets = frappe.db.sql("""
		SELECT status, COUNT(*) as cnt FROM `tabAsset`
		WHERE docstatus = 1 GROUP BY status
	""", as_dict=True)

	invoices_due = frappe.db.sql("""
		SELECT SUM(grand_total) as total, COUNT(*) as cnt
		FROM `tabPurchase Invoice` WHERE docstatus = 0
	""", as_dict=True)[0]

	pi_month = frappe.db.sql("""
		SELECT SUM(grand_total) as total FROM `tabPurchase Invoice`
		WHERE docstatus = 1 AND posting_date >= %s
	""", (month_start,), as_dict=True)[0].total or 0

	si_month = frappe.db.sql("""
		SELECT SUM(grand_total) as total FROM `tabSales Invoice`
		WHERE docstatus = 1 AND posting_date >= %s
	""", (month_start,), as_dict=True)[0].total or 0

	pos = frappe.db.sql("""
		SELECT SUM(grand_total) as total, COUNT(*) as cnt
		FROM `tabPurchase Order`
		WHERE docstatus = 1 AND status = 'To Receive and Bill'
	""", as_dict=True)[0]

	sos = frappe.db.sql("""
		SELECT SUM(grand_total) as total, COUNT(*) as cnt
		FROM `tabSales Order`
		WHERE docstatus = 1 AND status IN ('To Deliver and Bill', 'To Bill')
	""", as_dict=True)[0]

	return {
		"projects": projects,
		"open_tasks": open_tasks,
		"overdue_tasks": overdue_tasks,
		"fjc": fjc,
		"mr_count": mr_count,
		"att_today": att_today,
		"emp_count": emp_count,
		"assets": assets,
		"invoices_due": {
			"total": invoices_due.total or 0,
			"count": invoices_due.cnt or 0,
		},
		"pi_month": pi_month,
		"si_month": si_month,
		"pos": {"total": pos.total or 0, "count": pos.cnt or 0},
		"sos": {"total": sos.total or 0, "count": sos.cnt or 0},
		"today": today,
	}


@frappe.whitelist()
def get_financial_analytics():
	today = frappe.utils.today()
	month_start = frappe.utils.get_first_day(today)

	# AR — submitted unpaid sales invoices
	ar_total = frappe.db.sql("""
		SELECT SUM(outstanding_amount) as total, COUNT(*) as cnt
		FROM `tabSales Invoice`
		WHERE docstatus = 1 AND outstanding_amount > 0
	""", as_dict=True)[0]

	# AR aging buckets
	ar_aging = frappe.db.sql("""
		SELECT
		  SUM(CASE WHEN DATEDIFF(%s, due_date) BETWEEN 0  AND 30  THEN outstanding_amount ELSE 0 END) as b0_30,
		  SUM(CASE WHEN DATEDIFF(%s, due_date) BETWEEN 31 AND 60  THEN outstanding_amount ELSE 0 END) as b31_60,
		  SUM(CASE WHEN DATEDIFF(%s, due_date) BETWEEN 61 AND 90  THEN outstanding_amount ELSE 0 END) as b61_90,
		  SUM(CASE WHEN DATEDIFF(%s, due_date) > 90                THEN outstanding_amount ELSE 0 END) as b90plus,
		  SUM(CASE WHEN due_date > %s                              THEN outstanding_amount ELSE 0 END) as not_due
		FROM `tabSales Invoice`
		WHERE docstatus = 1 AND outstanding_amount > 0
	""", (today, today, today, today, today), as_dict=True)[0]

	# AP — submitted unpaid purchase invoices
	ap_total = frappe.db.sql("""
		SELECT SUM(outstanding_amount) as total, COUNT(*) as cnt
		FROM `tabPurchase Invoice`
		WHERE docstatus = 1 AND outstanding_amount > 0
	""", as_dict=True)[0]

	ap_aging = frappe.db.sql("""
		SELECT
		  SUM(CASE WHEN DATEDIFF(%s, due_date) BETWEEN 0  AND 30  THEN outstanding_amount ELSE 0 END) as b0_30,
		  SUM(CASE WHEN DATEDIFF(%s, due_date) BETWEEN 31 AND 60  THEN outstanding_amount ELSE 0 END) as b31_60,
		  SUM(CASE WHEN DATEDIFF(%s, due_date) BETWEEN 61 AND 90  THEN outstanding_amount ELSE 0 END) as b61_90,
		  SUM(CASE WHEN DATEDIFF(%s, due_date) > 90                THEN outstanding_amount ELSE 0 END) as b90plus,
		  SUM(CASE WHEN due_date > %s                              THEN outstanding_amount ELSE 0 END) as not_due
		FROM `tabPurchase Invoice`
		WHERE docstatus = 1 AND outstanding_amount > 0
	""", (today, today, today, today, today), as_dict=True)[0]

	# Monthly revenue vs expense (last 6 months)
	monthly_trend = frappe.db.sql("""
		SELECT
		  DATE_FORMAT(posting_date, '%%Y-%%m') as month,
		  SUM(CASE WHEN doctype = 'SI' THEN grand_total ELSE 0 END) as revenue,
		  SUM(CASE WHEN doctype = 'PI' THEN grand_total ELSE 0 END) as expense
		FROM (
		  SELECT posting_date, grand_total, 'SI' as doctype FROM `tabSales Invoice`
		  WHERE docstatus = 1 AND posting_date >= DATE_SUB(%s, INTERVAL 6 MONTH)
		  UNION ALL
		  SELECT posting_date, grand_total, 'PI' as doctype FROM `tabPurchase Invoice`
		  WHERE docstatus = 1 AND posting_date >= DATE_SUB(%s, INTERVAL 6 MONTH)
		) t
		GROUP BY month ORDER BY month ASC
	""", (today, today), as_dict=True)

	# Top customers by outstanding AR
	top_customers_ar = frappe.db.sql("""
		SELECT customer as name, SUM(outstanding_amount) as amount, COUNT(*) as invoices
		FROM `tabSales Invoice`
		WHERE docstatus = 1 AND outstanding_amount > 0
		GROUP BY customer ORDER BY amount DESC LIMIT 8
	""", as_dict=True)

	# Top suppliers by outstanding AP
	top_suppliers_ap = frappe.db.sql("""
		SELECT supplier as name, SUM(outstanding_amount) as amount, COUNT(*) as invoices
		FROM `tabPurchase Invoice`
		WHERE docstatus = 1 AND outstanding_amount > 0
		GROUP BY supplier ORDER BY amount DESC LIMIT 8
	""", as_dict=True)

	# Payments received this month
	payments_in = frappe.db.sql("""
		SELECT SUM(paid_amount) as total, COUNT(*) as cnt
		FROM `tabPayment Entry`
		WHERE docstatus = 1 AND payment_type = 'Receive'
		AND posting_date >= %s
	""", (month_start,), as_dict=True)[0]

	# Payments made this month
	payments_out = frappe.db.sql("""
		SELECT SUM(paid_amount) as total, COUNT(*) as cnt
		FROM `tabPayment Entry`
		WHERE docstatus = 1 AND payment_type = 'Pay'
		AND posting_date >= %s
	""", (month_start,), as_dict=True)[0]

	# SI/PI this month
	si_month = frappe.db.sql("""
		SELECT SUM(grand_total) as total, COUNT(*) as cnt
		FROM `tabSales Invoice`
		WHERE docstatus = 1 AND posting_date >= %s
	""", (month_start,), as_dict=True)[0]

	pi_month = frappe.db.sql("""
		SELECT SUM(grand_total) as total, COUNT(*) as cnt
		FROM `tabPurchase Invoice`
		WHERE docstatus = 1 AND posting_date >= %s
	""", (month_start,), as_dict=True)[0]

	return {
		"ar_total":        {"total": ar_total.total or 0, "count": ar_total.cnt or 0},
		"ap_total":        {"total": ap_total.total or 0, "count": ap_total.cnt or 0},
		"ar_aging":        {k: (v or 0) for k, v in (ar_aging or {}).items()},
		"ap_aging":        {k: (v or 0) for k, v in (ap_aging or {}).items()},
		"monthly_trend":   monthly_trend,
		"top_customers_ar": top_customers_ar,
		"top_suppliers_ap": top_suppliers_ap,
		"payments_in":     {"total": payments_in.total or 0, "count": payments_in.cnt or 0},
		"payments_out":    {"total": payments_out.total or 0, "count": payments_out.cnt or 0},
		"si_month":        {"total": si_month.total or 0, "count": si_month.cnt or 0},
		"pi_month":        {"total": pi_month.total or 0, "count": pi_month.cnt or 0},
		"today": today,
	}


@frappe.whitelist()
def get_procurement():
	today = frappe.utils.today()
	month_start = frappe.utils.get_first_day(today)

	# MR status breakdown
	mr_status = frappe.db.sql("""
		SELECT status, COUNT(*) as cnt
		FROM `tabMaterial Request`
		WHERE docstatus IN (0, 1)
		GROUP BY status ORDER BY cnt DESC
	""", as_dict=True)

	# Recent MRs
	mr_list = frappe.db.sql("""
		SELECT name, material_request_type, status, transaction_date, schedule_date
		FROM `tabMaterial Request`
		WHERE docstatus IN (0, 1)
		ORDER BY transaction_date DESC
		LIMIT 12
	""", as_dict=True)

	# PO status breakdown
	po_status = frappe.db.sql("""
		SELECT status, COUNT(*) as cnt, SUM(grand_total) as total
		FROM `tabPurchase Order`
		WHERE docstatus IN (0, 1)
		GROUP BY status ORDER BY cnt DESC
	""", as_dict=True)

	# Recent POs
	po_list = frappe.db.sql("""
		SELECT name, supplier, status, transaction_date, grand_total, schedule_date
		FROM `tabPurchase Order`
		WHERE docstatus IN (0, 1)
		ORDER BY transaction_date DESC
		LIMIT 10
	""", as_dict=True)

	# Supplier spend this month (from PIs)
	supplier_spend = frappe.db.sql("""
		SELECT supplier, SUM(grand_total) as total, COUNT(*) as invoices
		FROM `tabPurchase Invoice`
		WHERE docstatus = 1 AND posting_date >= %s
		GROUP BY supplier ORDER BY total DESC LIMIT 8
	""", (month_start,), as_dict=True)

	# Purchase Receipts this month
	grn = frappe.db.sql("""
		SELECT name, supplier, posting_date, total
		FROM `tabPurchase Receipt`
		WHERE docstatus = 1 AND posting_date >= %s
		ORDER BY posting_date DESC
		LIMIT 10
	""", (month_start,), as_dict=True)

	# Top requested items this month (from MR items)
	top_items = frappe.db.sql("""
		SELECT i.item_code, i.item_name, SUM(i.qty) as total_qty, i.uom,
		       COUNT(DISTINCT i.parent) as requests
		FROM `tabMaterial Request Item` i
		JOIN `tabMaterial Request` m ON m.name = i.parent
		WHERE m.docstatus IN (0,1) AND m.transaction_date >= %s
		GROUP BY i.item_code, i.item_name, i.uom
		ORDER BY total_qty DESC LIMIT 8
	""", (month_start,), as_dict=True)

	# Pending GRN value (POs To Receive)
	pending_receipt = frappe.db.sql("""
		SELECT SUM(grand_total) as total, COUNT(*) as cnt
		FROM `tabPurchase Order`
		WHERE docstatus = 1 AND status IN ('To Receive', 'To Receive and Bill')
	""", as_dict=True)[0]

	return {
		"mr_status":       mr_status,
		"mr_list":         mr_list,
		"po_status":       po_status,
		"po_list":         po_list,
		"supplier_spend":  supplier_spend,
		"grn":             grn,
		"top_items":       top_items,
		"pending_receipt": {"total": pending_receipt.total or 0, "count": pending_receipt.cnt or 0},
		"today":           today,
	}
