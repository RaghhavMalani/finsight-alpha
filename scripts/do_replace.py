import re

with open('app/streamlit_app.py', 'r', encoding='utf-8') as f:
    content = f.read()

with open('scripts/temp_rag_ui.py', 'r', encoding='utf-8') as f:
    repl = f.read()

# Replace from the RAG Page banner down to the if __name__ == "__main__": block
new_content = re.sub(
    r'# ---+\n# RAG Page.*?(?=if __name__ == "__main__":)',
    repl + '\n\n',
    content,
    flags=re.DOTALL
)

with open('app/streamlit_app.py', 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Replacement successful.")
