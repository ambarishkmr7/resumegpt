"""Invoice/receipt PDF for a completed payment.

Rendered with reportlab (already a dependency — see app/resumes/generator.py)
so no new packages are needed. Seller details come from admin app-settings so
they can be filled in without a schema change or redeploy; the fallbacks are
safe placeholders rather than invented registration numbers.
"""
from __future__ import annotations

import io
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from sqlalchemy.orm import Session

from app.models import Payment, User
from app.subscription.usage import get_setting

BRAND = colors.HexColor("#b45309")
INK = colors.HexColor("#2b2620")
SOFT = colors.HexColor("#6b6258")
LINE = colors.HexColor("#e2dccf")

_TITLE = ParagraphStyle("title", fontName="Helvetica-Bold", fontSize=20, textColor=BRAND, leading=24)
_H = ParagraphStyle("h", fontName="Helvetica-Bold", fontSize=10, textColor=INK, leading=14)
_P = ParagraphStyle("p", fontName="Helvetica", fontSize=9.5, textColor=INK, leading=13)
_MUTED = ParagraphStyle("muted", fontName="Helvetica", fontSize=8.5, textColor=SOFT, leading=12)


def invoice_number(payment: Payment) -> str:
    """Stable, human-readable invoice number derived from the payment row."""
    created = payment.created_at or datetime.utcnow()
    return f"RG-{created.strftime('%Y%m')}-{str(payment.id)[:8].upper()}"


def _seller(db: Session) -> dict:
    return {
        "name": get_setting(db, "invoice_company_name", "resumesGPT"),
        "address": get_setting(db, "invoice_company_address", ""),
        "email": get_setting(db, "invoice_support_email", "support@resumesgpt.com"),
        "gstin": get_setting(db, "invoice_gstin", ""),
        # Set this once you're GST-registered; until then the invoice states
        # that the amount is not tax-itemised rather than faking a tax split.
        "gst_percent": float(get_setting(db, "invoice_gst_percent", 0) or 0),
    }


_KIND_LABELS = {
    "subscription": "Subscription",
    "refill": "Refill pack",
    "mandate": "Auto-payment authorisation",
}


def _item_label(payment: Payment) -> str:
    kind = _KIND_LABELS.get(payment.type or "", "Purchase")
    plan = (payment.plan or "").replace("_", " ").title()
    return f"{kind} — {plan}" if plan else kind


def build_invoice_pdf(db: Session, payment: Payment, user: User) -> bytes:
    seller = _seller(db)
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm, topMargin=18 * mm, bottomMargin=18 * mm,
        title=f"Invoice {invoice_number(payment)}", author=seller["name"],
    )

    created = payment.created_at or datetime.utcnow()
    gross = int(payment.amount or 0)
    base = int(payment.base_amount_inr or gross)
    discount = int(payment.discount_inr or 0)

    story = [Paragraph("Invoice", _TITLE), Spacer(1, 2 * mm)]

    seller_lines = [f"<b>{seller['name']}</b>"]
    if seller["address"]:
        seller_lines.append(seller["address"])
    if seller["email"]:
        seller_lines.append(seller["email"])
    if seller["gstin"]:
        seller_lines.append(f"GSTIN: {seller['gstin']}")

    meta_lines = [
        f"<b>Invoice no.</b> {invoice_number(payment)}",
        f"<b>Date</b> {created.strftime('%d %b %Y, %H:%M')} UTC",
        f"<b>Status</b> {(payment.status or '').upper()}",
    ]
    if payment.razorpay_payment_id:
        meta_lines.append(f"<b>Payment ID</b> {payment.razorpay_payment_id}")
    if payment.razorpay_order_id:
        meta_lines.append(f"<b>Order ID</b> {payment.razorpay_order_id}")

    header = Table(
        [[Paragraph("<br/>".join(seller_lines), _P), Paragraph("<br/>".join(meta_lines), _P)]],
        colWidths=[85 * mm, 85 * mm],
    )
    header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story += [header, Spacer(1, 4 * mm)]

    billed = [f"<b>{user.full_name or 'Customer'}</b>"]
    if user.email:
        billed.append(user.email)
    story += [
        Paragraph("Billed to", _H),
        Paragraph("<br/>".join(billed), _P),
        Spacer(1, 6 * mm),
    ]

    rows = [["Description", "Amount (INR)"], [_item_label(payment), f"{base:,}"]]
    if discount:
        label = f"Discount ({payment.coupon_code})" if payment.coupon_code else "Discount"
        rows.append([label, f"-{discount:,}"])
    if seller["gst_percent"] > 0:
        # Amount charged is tax-inclusive; show the implied split.
        rate = seller["gst_percent"]
        net = round(gross / (1 + rate / 100))
        rows.append([f"Taxable value (excl. {rate:g}% GST)", f"{net:,}"])
        rows.append([f"GST @ {rate:g}%", f"{gross - net:,}"])
    rows.append(["Total paid", f"{gross:,}"])

    total_row = len(rows) - 1
    table = Table(rows, colWidths=[125 * mm, 45 * mm])
    table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, total_row), (-1, total_row), "Helvetica-Bold"),
        ("FONTNAME", (0, 1), (-1, total_row - 1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 9.5),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (0, 0), (-1, 0), BRAND),
        ("TEXTCOLOR", (0, 1), (-1, -1), INK),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("LINEBELOW", (0, 1), (-1, total_row - 1), 0.4, LINE),
        ("LINEABOVE", (0, total_row), (-1, total_row), 0.8, INK),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    story += [table, Spacer(1, 8 * mm)]

    if seller["gst_percent"] <= 0:
        story.append(Paragraph(
            "Amount shown is the total charged. This document is a payment receipt "
            "and is not a tax invoice.", _MUTED))
        story.append(Spacer(1, 2 * mm))
    story.append(Paragraph(
        f"Paid online via Razorpay. For any billing question, write to {seller['email']} "
        f"quoting the invoice number above.", _MUTED))
    story.append(Spacer(1, 2 * mm))
    story.append(Paragraph("This is a computer-generated document; no signature is required.", _MUTED))

    doc.build(story)
    return buf.getvalue()
