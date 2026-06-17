"""Resume parsing: file bytes -> raw text (for LLM parsing).

Keeps only the text extraction utilities needed by the LLM parser
(DOCX path) and other AI features. All heuristic/fuzzy-matching parsing
has been replaced by the LLM-powered parser in llm_parser.py.
"""
import io
from typing import List

import pdfplumber
from docx import Document

from app.schemas import ResumeContent


# ---------- Text extraction (kept for DOCX path + other AI features) ----------

def extract_text(file_bytes: bytes, filename: str) -> str:
    """Extract raw text from a PDF or DOCX file.

    Raises ValueError for unsupported file types.
    """
    name = (filename or "").lower()
    if name.endswith(".pdf"):
        return _extract_pdf(file_bytes)
    if name.endswith(".docx"):
        return _extract_docx(file_bytes)
    if name.endswith(".doc"):
        raise ValueError("Legacy .doc not supported. Please upload .docx or .pdf.")
    # Fall back to sniffing: try PDF, then DOCX.
    try:
        return _extract_pdf(file_bytes)
    except Exception:
        try:
            return _extract_docx(file_bytes)
        except Exception:
            raise ValueError("Unsupported file type. Upload a .pdf or .docx file.")


def _extract_pdf(file_bytes: bytes) -> str:
    pages: List[str] = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            text = page.extract_text(layout=False) or ""
            pages.append(text)
    return "\n".join(pages)


def _extract_docx(file_bytes: bytes) -> str:
    doc = Document(io.BytesIO(file_bytes))
    parts: List[str] = []
    for block in _iter_docx_blocks(doc):
        parts.append(block)
    return "\n".join(parts)


def _iter_docx_blocks(doc) -> List[str]:
    """Yield paragraph AND table text in true document order by walking the
    underlying XML body element, so table-based contact blocks appear at the
    top rather than being appended at the end."""
    from docx.table import Table
    from docx.text.paragraph import Paragraph as DocxParagraph
    out: List[str] = []
    body = doc.element.body
    for child in body:
        tag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
        if tag == "p":
            p = DocxParagraph(child, doc)
            out.append(p.text)
        elif tag == "tbl":
            table = Table(child, doc)
            for row in table.rows:
                cells = [c.text.strip() for c in row.cells if c.text.strip()]
                # de-dupe merged cells
                seen = []
                for c in cells:
                    if c not in seen:
                        seen.append(c)
                if seen:
                    out.append("  ".join(seen))
    return out


# ---------- LLM-powered parsing entry point ----------

def parse_resume(storage_key: str, filename: str, storage) -> ResumeContent:
    """Parse a resume file from storage using the LLM-powered parser.

    Delegates to llm_parser.parse_resume_file which handles:
      - PDF: upload to Gemini File API for native PDF understanding
      - DOCX: extract text locally, then send to Gemini as prompt text

    Raises:
        RuntimeError: If GEMINI_API_KEY is not set or LLM parsing fails.
        ValueError:   If the file type is not supported.
    """
    from app.resumes.llm_parser import parse_resume_file

    return parse_resume_file(storage_key, filename, storage)
