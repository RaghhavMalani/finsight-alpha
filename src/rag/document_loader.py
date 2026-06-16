import os
from pathlib import Path
from typing import List, Dict, Any

try:
    from pypdf import PdfReader
except ImportError:
    PdfReader = None

try:
    import docx
except ImportError:
    docx = None

def load_pdf_document(file_path: str) -> List[Dict[str, Any]]:
    """Load a PDF document into a list of page dictionaries."""
    try:
        from pypdf import PdfReader
    except ImportError:
        raise ImportError("pypdf is required to read PDFs. Install with `pip install pypdf`.")
        
    pages = []
    file_name = Path(file_path).name
    try:
        reader = PdfReader(file_path)
        for i, page in enumerate(reader.pages):
            text = page.extract_text()
            if text and text.strip():
                pages.append({
                    "text": text.strip(),
                    "page_number": i + 1,
                    "source_file": file_name,
                    "file_path": str(file_path),
                    "document_type": "pdf"
                })
    except Exception as e:
        print(f"Error reading PDF {file_path}: {e}")
    return pages

def load_txt_document(file_path: str) -> List[Dict[str, Any]]:
    """Load a TXT document. Treats the entire file as one 'page'."""
    file_name = Path(file_path).name
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            text = f.read()
            if text and text.strip():
                return [{
                    "text": text.strip(),
                    "page_number": 1,
                    "source_file": file_name,
                    "file_path": str(file_path),
                    "document_type": "txt"
                }]
    except Exception as e:
        print(f"Error reading TXT {file_path}: {e}")
    return []

def load_docx_document(file_path: str) -> List[Dict[str, Any]]:
    """Load a DOCX document. Treats the entire file as one 'page'."""
    try:
        import docx
    except ImportError:
        raise ImportError("python-docx is required to read DOCX files. Install with `pip install python-docx`.")
        
    file_name = Path(file_path).name
    try:
        doc = docx.Document(file_path)
        full_text = [para.text for para in doc.paragraphs]
        text = "\n".join(full_text)
        if text and text.strip():
            return [{
                "text": text.strip(),
                "page_number": 1,
                "source_file": file_name,
                "file_path": str(file_path),
                "document_type": "docx"
            }]
    except Exception as e:
        print(f"Error reading DOCX {file_path}: {e}")
    return []

def load_document(file_path: str) -> List[Dict[str, Any]]:
    """Auto-detect document type by extension and load it."""
    ext = Path(file_path).suffix.lower()
    if ext == ".pdf":
        return load_pdf_document(file_path)
    elif ext == ".txt":
        return load_txt_document(file_path)
    elif ext == ".docx":
        return load_docx_document(file_path)
    else:
        raise ValueError(f"Unsupported document extension: {ext}")

def load_documents_from_folder(folder_path: str) -> List[Dict[str, Any]]:
    """Load all supported documents from a folder."""
    all_pages = []
    folder = Path(folder_path)
    if not folder.exists() or not folder.is_dir():
        return all_pages
        
    for item in folder.rglob('*'):
        if item.is_file() and item.suffix.lower() in [".pdf", ".txt", ".docx"]:
            try:
                pages = load_document(str(item))
                all_pages.extend(pages)
            except Exception as e:
                print(f"Failed to load {item}: {e}")
                
    return all_pages
