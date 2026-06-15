import json
import os

import frappe


def execute():
    try:
        app_path = frappe.get_app_path("regence")
        sidebar_path = os.path.join(app_path, "workspace_sidebar", "regence.json")
        workspace_path = os.path.join(app_path, "regence", "workspace", "regence", "regence.json")

        if os.path.exists(sidebar_path):
            try:
                sync_workspace_sidebar(sidebar_path)
            except Exception as e:
                frappe.log_error(f"Error syncing workspace sidebar: {str(e)}", "regence.workspace_patch")

        if os.path.exists(workspace_path):
            try:
                sync_workspace(workspace_path)
            except Exception as e:
                frappe.log_error(f"Error syncing workspace: {str(e)}", "regence.workspace_patch")

        # Clean up old records
        try:
            delete_old_workspace_sidebars("Regence")
        except Exception as e:
            frappe.log_error(f"Error deleting old workspace sidebars: {str(e)}", "regence.workspace_patch")

        try:
            delete_old_workspaces("Regence")
        except Exception as e:
            frappe.log_error(f"Error deleting old workspaces: {str(e)}", "regence.workspace_patch")

        frappe.db.commit()
    except Exception as e:
        frappe.log_error(f"Critical error in regence workspace patch: {str(e)}", "regence.workspace_patch")
        # Don't re-raise; allow migration to continue


def sync_workspace_sidebar(path):
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    name = data.get("name")
    if not name:
        frappe.log_error("Missing name in Regence Workspace Sidebar JSON", "regence.workspace_patch")
        return

    try:
        if frappe.db.exists("Workspace Sidebar", name):
            doc = frappe.get_doc("Workspace Sidebar", name)
        else:
            doc = frappe.new_doc("Workspace Sidebar")
            doc.name = name

        doc.app = data.get("app", doc.app)
        doc.title = data.get("title", getattr(doc, "title", ""))
        doc.standard = data.get("standard", getattr(doc, "standard", 0))
        
        # Clear existing items and add new ones from JSON
        doc.items = []
        for item_data in data.get("items", []):
            # Skip items with invalid link_to references
            link_to = item_data.get("link_to")
            link_type = item_data.get("link_type")
            
            if link_to and link_type == "DocType":
                if not frappe.db.exists("DocType", link_to):
                    frappe.log_warning(f"Skipping sidebar item '{item_data.get('label')}': DocType '{link_to}' not found", "regence.workspace_patch")
                    continue
            
            row = frappe.new_doc("Workspace Sidebar Item")
            for field, value in item_data.items():
                if field != "doctype":
                    row.set(field, value)
            row.parent = name
            row.parenttype = "Workspace Sidebar"
            row.parentfield = "items"
            doc.append("items", row)
        
        doc.flags.ignore_mandatory = True
        doc.save(ignore_permissions=True)
        frappe.db.commit()
    except Exception as e:
        frappe.log_error(f"Error in sync_workspace_sidebar: {str(e)}", "regence.workspace_patch")


def delete_old_workspace_sidebars(current_name):
    try:
        old_sidebars = frappe.get_all(
            "Workspace Sidebar",
            filters={"app": "regence", "name": ["!=", current_name]},
            pluck="name",
        )
        for old_name in old_sidebars:
            try:
                frappe.delete_doc("Workspace Sidebar", old_name, force=True)
            except Exception as e:
                frappe.log_warning(f"Could not delete old Workspace Sidebar '{old_name}': {str(e)}", "regence.workspace_patch")
    except Exception as e:
        frappe.log_warning(f"Error querying old Workspace Sidebars: {str(e)}", "regence.workspace_patch")


def sync_workspace(path):
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    name = data.get("name")
    if not name:
        frappe.log_error("Missing name in Regence Workspace JSON", "regence.workspace_patch")
        return

    try:
        if frappe.db.exists("Workspace", name):
            doc = frappe.get_doc("Workspace", name)
        else:
            doc = frappe.new_doc("Workspace")
            doc.name = name

        doc.app = data.get("app", doc.app)
        doc.module = data.get("module", getattr(doc, "module", ""))
        doc.label = data.get("label", getattr(doc, "label", ""))
        doc.title = data.get("title", getattr(doc, "title", ""))
        doc.icon = data.get("icon", getattr(doc, "icon", ""))
        doc.indicator_color = data.get("indicator_color", getattr(doc, "indicator_color", ""))
        doc.content = data.get("content", getattr(doc, "content", ""))
        doc.public = data.get("public", getattr(doc, "public", 0))
        doc.is_hidden = data.get("is_hidden", getattr(doc, "is_hidden", 0))
        
        # Clear and sync number_cards
        doc.number_cards = []
        for card_data in data.get("number_cards", []):
            card = frappe.new_doc("Workspace Number Card")
            for field, value in card_data.items():
                if field != "doctype":
                    card.set(field, value)
            card.parent = name
            card.parenttype = "Workspace"
            card.parentfield = "number_cards"
            doc.append("number_cards", card)
        
        # Clear and sync shortcuts
        doc.shortcuts = []
        for shortcut_data in data.get("shortcuts", []):
            link_to = shortcut_data.get("link_to")
            if link_to and not frappe.db.exists("DocType", link_to):
                frappe.log_warning(f"Skipping shortcut '{shortcut_data.get('label')}': DocType '{link_to}' not found", "regence.workspace_patch")
                continue
            
            shortcut = frappe.new_doc("Workspace Shortcut")
            for field, value in shortcut_data.items():
                if field != "doctype":
                    shortcut.set(field, value)
            shortcut.parent = name
            shortcut.parenttype = "Workspace"
            shortcut.parentfield = "shortcuts"
            doc.append("shortcuts", shortcut)
        
        # Clear and sync links
        doc.links = []
        for link_data in data.get("links", []):
            link_to = link_data.get("link_to")
            if link_to and not frappe.db.exists("DocType", link_to):
                frappe.log_warning(f"Skipping workspace link '{link_data.get('label')}': DocType '{link_to}' not found", "regence.workspace_patch")
                continue
            
            link = frappe.new_doc("Workspace Link")
            for field, value in link_data.items():
                if field != "doctype":
                    link.set(field, value)
            link.parent = name
            link.parenttype = "Workspace"
            link.parentfield = "links"
            doc.append("links", link)
        
        doc.flags.ignore_mandatory = True
        doc.save(ignore_permissions=True)
        frappe.db.commit()
    except Exception as e:
        frappe.log_error(f"Error in sync_workspace: {str(e)}", "regence.workspace_patch")


def delete_old_workspaces(current_name):
    try:
        old_workspaces = frappe.get_all(
            "Workspace",
            filters={"app": "regence", "name": ["!=", current_name]},
            pluck="name",
        )
        for old_name in old_workspaces:
            try:
                frappe.delete_doc("Workspace", old_name, force=True)
            except Exception as e:
                frappe.log_warning(f"Could not delete old Workspace '{old_name}': {str(e)}", "regence.workspace_patch")
    except Exception as e:
        frappe.log_warning(f"Error querying old Workspaces: {str(e)}", "regence.workspace_patch")
