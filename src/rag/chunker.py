import re
from typing import List, Dict, Any

from src.rag.document_metadata import infer_document_metadata, create_document_id

def clean_financial_text(text: str) -> str:
    """Normalize text while preserving financial numbers and symbols."""
    if not text:
        return ""
    
    # Replace multiple spaces with a single space
    cleaned = re.sub(r'[ \t]+', ' ', text)
    # Replace multiple newlines with a single newline
    cleaned = re.sub(r'\n{2,}', '\n', cleaned)
    
    return cleaned.strip()

def chunk_documents(
    pages: List[Dict[str, Any]],
    chunk_size: int = 800,
    chunk_overlap: int = 150
) -> List[Dict[str, Any]]:
    """Chunk documents while preserving metadata.
    
    Args:
        pages: List of dictionaries from document loader.
        chunk_size: Target characters per chunk.
        chunk_overlap: Overlapping characters.
        
    Returns:
        List of chunk dictionaries.
    """
    chunks = []
    
    for page in pages:
        text = clean_financial_text(page.get("text", ""))
        if not text:
            continue
            
        source_file = page.get("source_file", "unknown")
        page_number = page.get("page_number", 1)
        
        # Infer metadata
        metadata = infer_document_metadata(source_file, text[:500])
        
        # Simple text chunking by characters
        text_length = len(text)
        start = 0
        chunk_index = 0
        
        while start < text_length:
            end = start + chunk_size
            
            # If we're not at the end, try to find a nice boundary (newline or period)
            if end < text_length:
                boundary = max(text.rfind('. ', start, end), text.rfind('\n', start, end))
                # If we found a boundary that doesn't make the chunk too small, use it
                if boundary != -1 and boundary > start + (chunk_size // 2):
                    end = boundary + 1
            
            chunk_text = text[start:end].strip()
            if chunk_text:
                chunk_id = f"{create_document_id(source_file, page_number)}_c{chunk_index}"
                
                chunks.append({
                    "chunk_id": chunk_id,
                    "text": chunk_text,
                    "source_file": source_file,
                    "page_number": page_number,
                    "chunk_index": chunk_index,
                    "document_type": metadata["document_type"],
                    "ticker": metadata["ticker"],
                    "company": metadata["company"],
                    "fiscal_year": metadata["fiscal_year"]
                })
                chunk_index += 1
                
            start = end - chunk_overlap
            
            # Prevent infinite loop if overlap >= size
            if start <= 0 or start >= text_length or chunk_overlap >= (end - start):
                start = end
                
    return chunks
