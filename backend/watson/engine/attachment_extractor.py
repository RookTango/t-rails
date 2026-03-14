"""
Extract text from attachments before sending to Watson.
Watson cannot read binary files — we extract text server-side and include it in the prompt.
"""
import os
import logging

logger = logging.getLogger(__name__)

MAX_CHARS_PER_ATTACHMENT = 3000  # keep prompts from blowing up on large runbooks


def extract_text(file_path: str, filename: str) -> str:
    """
    Extract readable text from a file. Returns empty string if not extractable.
    """
    ext = os.path.splitext(filename)[1].lower()

    try:
        if ext == '.pdf':
            return _extract_pdf(file_path)
        elif ext in ('.docx', '.doc'):
            return _extract_docx(file_path)
        elif ext in ('.txt', '.md', '.log', '.sh', '.py', '.yaml', '.yml', '.json'):
            return _extract_plain(file_path)
        else:
            return ''  # images, binaries — not extractable
    except Exception as e:
        logger.warning(f"Could not extract text from {filename}: {e}")
        return ''


def _extract_pdf(path: str) -> str:
    try:
        import pdfminer.high_level
        text = pdfminer.high_level.extract_text(path)
        return (text or '').strip()[:MAX_CHARS_PER_ATTACHMENT]
    except ImportError:
        logger.warning("pdfminer not installed — pip install pdfminer.six")
        return ''


def _extract_docx(path: str) -> str:
    try:
        import docx
        doc = docx.Document(path)
        text = '\n'.join(p.text for p in doc.paragraphs if p.text.strip())
        return text[:MAX_CHARS_PER_ATTACHMENT]
    except ImportError:
        logger.warning("python-docx not installed — pip install python-docx")
        return ''


def _extract_plain(path: str) -> str:
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        return f.read(MAX_CHARS_PER_ATTACHMENT)


def build_attachments_section(attachments: list) -> str:
    """
    Build the attachments section of the Watson prompt.
    attachments: list of dicts with keys: filename, file_path, attachment_type
    """
    if not attachments:
        return "=== ATTACHMENTS ===\nNone provided."

    lines = ["=== ATTACHMENTS ==="]
    for att in attachments:
        filename = att.get('filename', '')
        file_path = att.get('file_path', '')
        att_type  = att.get('attachment_type', '')

        extracted = ''
        if file_path and os.path.exists(file_path):
            extracted = extract_text(file_path, filename)

        lines.append(f"\nFile: {filename} (type: {att_type})")
        if extracted:
            lines.append(f"Extracted content:\n{extracted}")
        else:
            lines.append("(binary or image — content not extractable)")

    return '\n'.join(lines)
