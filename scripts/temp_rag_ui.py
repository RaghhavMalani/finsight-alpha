# -------------------------------------------------------------------------
# RAG Page: AI Equity Research Terminal
# -------------------------------------------------------------------------
def page_ai_equity_research_terminal() -> None:
    import pandas as pd
    import json
    import glob
    import os
    from src.rag.vector_store import LocalVectorStore
    from src.config import config
    
    st.markdown("<h2 class='finsight-title'>AI Equity Research Terminal</h2>", unsafe_allow_html=True)
    st.markdown("<div class='finsight-subtitle'>Document-grounded company research, factor extraction, and ML-ready intelligence.</div>", unsafe_allow_html=True)
    
    st.markdown("---")
    
    # -------------------------------------------------------------------------
    # SECTION 1: Workspace Setup
    # -------------------------------------------------------------------------
    st.subheader("Research Workspace Setup")
    
    col1, col2, col3 = st.columns([2, 1, 1])
    with col1:
        selected_ticker = st.selectbox("Select Company Ticker", config.ALL_TICKERS, key="term_ticker")
    with col2:
        research_depth = st.selectbox("Research Depth", ["Quick Scan", "Standard Research", "Deep Research"])
    with col3:
        market = st.selectbox("Market", ["India", "US", "Custom"])
        
    c1, c2 = st.columns([3, 1])
    with c1:
        sources = st.multiselect(
            "Discovery Sources", 
            ["company_ir", "screener", "nse", "bse", "web_search", "local_documents"], 
            default=["company_ir", "screener", "local_documents"]
        )
    with c2:
        respect_robots = st.checkbox("Respect robots.txt", value=True)
        
    colA, colB, colC = st.columns(3)
    
    if "workspace_built" not in st.session_state:
        st.session_state["workspace_built"] = False
        
    with colA:
        if st.button("Build Research Workspace", type="primary"):
            st.session_state["workspace_built"] = True
            st.session_state["active_ticker"] = selected_ticker
            
            from src.rag.screener_snapshot import fetch_screener_snapshot
            with st.spinner("Fetching company snapshot..."):
                snap = fetch_screener_snapshot(selected_ticker)
                st.session_state["company_snapshot"] = snap
                
    with colB:
        if st.button("Discover Documents"):
            if not st.session_state.get("workspace_built"):
                st.warning("Build Workspace first.")
            else:
                from src.rag.document_discovery import discover_financial_documents
                with st.spinner("Discovering documents..."):
                    candidates = discover_financial_documents(
                        ticker=st.session_state["active_ticker"],
                        sources=[s for s in sources if s != "local_documents"],
                        document_types=["annual_report", "earnings_transcript", "investor_presentation"],
                        max_candidates=15,
                        respect_robots=respect_robots
                    )
                    st.session_state["disc_candidates"] = candidates
                    if candidates:
                        st.success(f"Discovered {len(candidates)} candidate documents.")
                    else:
                        st.warning("No candidates discovered.")
                        
    with colC:
        if st.button("Process Selected Documents"):
            from src.rag.document_loader import load_documents_from_folder
            from src.rag.chunker import chunk_documents
            from src.rag.embeddings import embed_texts
            
            with st.spinner("Processing local and downloaded documents..."):
                pages = load_documents_from_folder("data/documents")
                if not pages:
                    st.warning("No documents found in data/documents. Download or upload first.")
                else:
                    chunks = chunk_documents(pages)
                    active_chunks = [c for c in chunks if c.get("ticker") == st.session_state.get("active_ticker")]
                    if not active_chunks:
                        active_chunks = chunks
                    
                    texts = [c["text"] for c in active_chunks]
                    embeddings = embed_texts(texts)
                    vs = LocalVectorStore()
                    vs.build_index(active_chunks, embeddings)
                    vs.save("data/rag_index")
                    
                    st.session_state["rag_store"] = vs
                    st.session_state["rag_chunks"] = active_chunks
                    st.success(f"Indexed {len(active_chunks)} chunks into Workspace.")
                    
    st.markdown("---")
    
    if not st.session_state.get("workspace_built"):
        st.info("Please select a ticker and click 'Build Research Workspace' to begin.")
        return
        
    active_ticker = st.session_state["active_ticker"]
    
    # -------------------------------------------------------------------------
    # SECTION 2: Company Research Header
    # -------------------------------------------------------------------------
    st.subheader("Company Snapshot")
    snap = st.session_state.get("company_snapshot", {})
    
    c_name = snap.get("company_name", active_ticker) if snap.get("success") else active_ticker
    st.markdown(f"### {c_name}")
    
    if snap.get("success"):
        metrics = snap.get("snapshot_metrics", {})
        
        m_cols = st.columns(4)
        m_keys = list(metrics.keys())
        for i, col in enumerate(m_cols):
            if i < len(m_keys):
                k = m_keys[i]
                col.metric(k, metrics[k])
                
        m_cols2 = st.columns(4)
        for i, col in enumerate(m_cols2):
            idx = i + 4
            if idx < len(m_keys):
                k = m_keys[idx]
                col.metric(k, metrics[k])
                
        with st.expander("Business Overview"):
            st.write(snap.get("about", "No summary available."))
    else:
        st.info(f"Screener snapshot unavailable. ({snap.get('message', '')}). Continue with document-based research.")
        
    st.markdown("---")
    
    # -------------------------------------------------------------------------
    # SECTION 3: Research Document Library
    # -------------------------------------------------------------------------
    st.subheader("Research Document Library")
    
    tab1, tab2, tab3, tab4 = st.tabs(["Indexed Documents", "Discovered Candidates", "Manual Upload", "Source Health"])
    
    with tab1:
        if "rag_store" not in st.session_state:
            vs = LocalVectorStore()
            if vs.load("data/rag_index"):
                st.session_state["rag_store"] = vs
                st.session_state["rag_chunks"] = vs.chunks
                
        chunks = st.session_state.get("rag_chunks", [])
        active_chunks = [c for c in chunks if c.get("ticker") == active_ticker]
        
        col1, col2, col3 = st.columns(3)
        col1.metric("Indexed Chunks", len(active_chunks))
        sources = list(set(c.get("source_file", "unknown") for c in active_chunks))
        col2.metric("Indexed Documents", len(sources))
        types = list(set(c.get("document_type", "unknown") for c in active_chunks))
        col3.metric("Document Types", len(types))
        
        if sources:
            st.write("Files in index:")
            st.write(sources)
        else:
            st.info("No documents indexed for this ticker.")
            
    with tab2:
        if "disc_candidates" in st.session_state and st.session_state["disc_candidates"]:
            candidates = st.session_state["disc_candidates"]
            df_c = pd.DataFrame(candidates)
            df_c["Select"] = False
            
            cols = ["Select", "title", "source_name", "document_type", "confidence", "downloadable", "document_url"]
            df_c = df_c[[c for c in cols if c in df_c.columns]]
            
            edited_df = st.data_editor(
                df_c,
                column_config={
                    "Select": st.column_config.CheckboxColumn("Download", default=False),
                    "document_url": st.column_config.LinkColumn("URL")
                },
                hide_index=True,
                key="disc_editor_workspace"
            )
            
            if st.button("Download Selected Documents", type="primary"):
                selected_indices = edited_df[edited_df["Select"] == True].index.tolist()
                selected_candidates = [candidates[i] for i in selected_indices]
                
                if not selected_candidates:
                    st.warning("Please select at least one document.")
                else:
                    from src.rag.download_manager import download_documents_batch
                    from src.rag.source_health import record_source_status, summarize_source_health
                    
                    with st.spinner(f"Downloading {len(selected_candidates)} documents..."):
                        results = download_documents_batch(
                            selected_candidates,
                            output_dir="data/documents",
                            max_downloads=5,
                            respect_robots=respect_robots
                        )
                        health_records = []
                        success_count = 0
                        
                        for r in results:
                            source = r["candidate"].get("source_name", "Unknown")
                            url = r["result"]["url"]
                            if r["result"]["success"]:
                                success_count += 1
                                health_records.append(record_source_status(source, "Success", "Download successful", url))
                            else:
                                msg = r['result']['message']
                                status_label = "Blocked by robots.txt" if "robots.txt" in msg.lower() else "Failed"
                                health_records.append(record_source_status(source, status_label, msg, url))
                                
                        if "health_records" not in st.session_state:
                            st.session_state["health_records"] = []
                        st.session_state["health_records"].extend(health_records)
                        
                        st.success(f"Downloaded {success_count} documents. View Source Health tab for details.")
        else:
            st.info("Click 'Discover Documents' to find candidates.")
            
    with tab3:
        st.markdown("If a document is blocked by robots.txt or missing, manually upload it here.")
        uploaded_files = st.file_uploader("Upload financial documents (PDF, TXT, DOCX)", accept_multiple_files=True)
        if st.button("Save Uploaded Files"):
            if uploaded_files:
                os.makedirs("data/documents", exist_ok=True)
                for f in uploaded_files:
                    path = f"data/documents/{f.name}"
                    with open(path, "wb") as out_f:
                        out_f.write(f.read())
                    meta = {"ticker": active_ticker, "source_name": "Manual Upload", "document_type": "unknown"}
                    with open(path + ".meta.json", "w") as out_m:
                        json.dump(meta, out_m)
                st.success("Files saved. Go back to Section 1 and click 'Process Selected Documents' to index them.")
                
    with tab4:
        records = st.session_state.get("health_records", [])
        if records:
            from src.rag.source_health import summarize_source_health
            summary_df = summarize_source_health(records)
            st.dataframe(summary_df, hide_index=True, use_container_width=True)
        else:
            st.info("No download actions performed yet.")
            
    st.markdown("---")
    
    # -------------------------------------------------------------------------
    # SECTION 4: AI Research Workspace
    # -------------------------------------------------------------------------
    st.subheader("AI Research Workspace")
    
    preset_questions = [
        "What are the key risks for this company?",
        "What are the main growth drivers?",
        "What does management say about margins?",
        "What are the capex plans?",
        "What are the debt and leverage concerns?",
        "What are the key business segments?"
    ]
    
    q_col1, q_col2 = st.columns([1, 2])
    with q_col1:
        selected_preset = st.radio("Preset Questions", preset_questions)
    with q_col2:
        custom_query = st.text_input("Or ask a custom question:")
        
    query = custom_query if custom_query else selected_preset
    
    if st.button("Search & Answer") and query:
        chunks = st.session_state.get("rag_chunks", [])
        active_chunks = [c for c in chunks if c.get("ticker") == active_ticker]
        vs = st.session_state.get("rag_store")
        
        if not active_chunks or not vs:
            st.warning("No indexed documents found. Discover, download, or upload documents first, then Process them.")
        else:
            from src.rag.retriever import hybrid_retrieve
            from src.rag.reranker import rerank_chunks
            from src.rag.rag_answer import generate_llm_answer
            
            with st.spinner("Generating answer..."):
                retrieved = hybrid_retrieve(query, active_chunks, vector_store=vs, top_k=10)
                reranked = rerank_chunks(query, retrieved, top_k=5)
                answer_data = generate_llm_answer(query, reranked, llm_provider="none")
                
                st.markdown("#### Summary Answer")
                st.info(answer_data["answer"])
                
                st.markdown("#### Supporting Evidence")
                for i, chunk in enumerate(answer_data["retrieved_chunks"]):
                    with st.expander(f"Evidence {i+1} | Score: {chunk.get('rerank_score', 0.0):.2f} | {chunk.get('source_file')}"):
                        st.write(chunk["text"])
                        
    st.markdown("---")
    
    # -------------------------------------------------------------------------
    # SECTION 5: Investment Research Brief
    # -------------------------------------------------------------------------
    st.subheader("Investment Research Brief")
    
    if st.button("Generate Research Brief", type="primary"):
        chunks = st.session_state.get("rag_chunks", [])
        active_chunks = [c for c in chunks if c.get("ticker") == active_ticker]
        snap = st.session_state.get("company_snapshot")
        
        if not active_chunks:
            st.warning("No indexed documents found to generate a brief.")
        else:
            from src.rag.research_brief import generate_research_brief
            with st.spinner("Compiling structured brief..."):
                brief = generate_research_brief(active_ticker, active_chunks, snap)
                st.session_state["research_brief"] = brief
                
    if "research_brief" in st.session_state:
        brief = st.session_state["research_brief"]
        
        col_b1, col_b2 = st.columns(2)
        with col_b1:
            st.markdown("#### Business Overview")
            st.write(brief.get("business_summary", ""))
            
            st.markdown("#### Growth Drivers")
            for g in brief.get("key_growth_drivers", []):
                st.write("- " + g)
                
            st.markdown("#### Margins & Capex")
            st.write(brief.get("margin_outlook", ""))
            st.write(brief.get("capex_and_cashflow", ""))
            
        with col_b2:
            st.markdown("#### Key Risks")
            for r in brief.get("key_risks", []):
                st.write("- " + r)
                
            st.markdown("#### Debt & Balance Sheet")
            st.write(brief.get("debt_and_balance_sheet", ""))
            
            st.markdown("#### Open Questions")
            for oq in brief.get("open_questions", []):
                st.warning(oq)
                
    st.markdown("---")
    
    # -------------------------------------------------------------------------
    # SECTION 6: Factor Extraction Matrix
    # -------------------------------------------------------------------------
    st.subheader("Factor Extraction Matrix")
    st.markdown("Extract structured quant factors from qualitative text.")
    
    if st.button("Compute Factor Matrix"):
        chunks = st.session_state.get("rag_chunks", [])
        active_chunks = [c for c in chunks if c.get("ticker") == active_ticker]
        
        if not active_chunks:
            st.warning("No indexed documents found.")
        else:
            from src.rag.factor_extractor import extract_financial_factors_llm
            from src.visualization import rag_plots
            
            with st.spinner("Extracting institutional factors..."):
                factor_record = extract_financial_factors_llm(active_chunks, ticker=active_ticker)
                st.session_state["last_factor_record"] = factor_record
                
    if "last_factor_record" in st.session_state:
        factor_record = st.session_state["last_factor_record"]
        from src.visualization import rag_plots
        
        st.markdown("#### Multi-Factor Scores")
        
        m1, m2, m3, m4 = st.columns(4)
        m1.metric("Overall Sentiment", f"{factor_record['overall_sentiment_score']:.2f}")
        m2.metric("Growth", f"{factor_record['growth_score']:.2f}")
        m3.metric("Risk", f"{factor_record['risk_score']:.2f}")
        m4.metric("Debt Risk", f"{factor_record['debt_risk_score']:.2f}")
        
        m5, m6, m7, m8 = st.columns(4)
        m5.metric("Capex Intensity", f"{factor_record['capex_intensity_score']:.2f}")
        m6.metric("Margin Pressure", f"{factor_record['margin_pressure_score']:.2f}")
        m7.metric("Cash Flow Quality", f"{factor_record.get('cash_flow_quality_score', 0.5):.2f}")
        m8.metric("Management Tone", f"{factor_record.get('management_tone_score', 0.5):.2f}")
        
        p1, p2 = st.columns(2)
        with p1:
            st.plotly_chart(rag_plots.plot_factor_scores(factor_record), use_container_width=True)
        with p2:
            st.plotly_chart(rag_plots.plot_risk_growth_radar(factor_record), use_container_width=True)
            
    st.markdown("---")
    
    # -------------------------------------------------------------------------
    # SECTION 7: Segment Intelligence
    # -------------------------------------------------------------------------
    st.subheader("Segment Intelligence")
    st.markdown("Detect sub-segment performance (e.g. O2C vs Jio vs Retail).")
    
    if st.button("Extract Segment Intelligence"):
        chunks = st.session_state.get("rag_chunks", [])
        active_chunks = [c for c in chunks if c.get("ticker") == active_ticker]
        
        if not active_chunks:
            st.warning("No indexed documents found.")
        else:
            from src.rag.segment_intelligence import extract_segment_intelligence
            with st.spinner("Isolating segments..."):
                seg_intel = extract_segment_intelligence(active_chunks, ticker=active_ticker)
                st.session_state["segment_intelligence"] = seg_intel
                
    if "segment_intelligence" in st.session_state:
        seg_intel = st.session_state["segment_intelligence"]
        segments = seg_intel.get("segments", {})
        
        if not segments:
            st.info("No major business segments cleanly detected in text.")
        else:
            for s_name, s_data in segments.items():
                with st.expander(f"Segment: {s_name} | Sentiment: {s_data['sentiment_score']:.2f} | Evidence: {s_data['evidence_count']}"):
                    c1, c2 = st.columns(2)
                    c1.metric("Growth Score", f"{s_data['growth_score']:.2f}")
                    c2.metric("Risk Score", f"{s_data['risk_score']:.2f}")
                    
                    st.write("**Top Evidence Snippets:**")
                    for ev in s_data["evidence"]:
                        st.write("- " + ev)
                        
    st.markdown("---")
    
    # -------------------------------------------------------------------------
    # SECTION 8: Export to ML Signal Lab
    # -------------------------------------------------------------------------
    st.subheader("Export to ML Signal Lab")
    st.write("These extracted factors are mapped to dates and exported to `data/factors/factor_records.csv` to be used by the Signal Engine.")
    
    if "last_factor_record" in st.session_state:
        factor_record = st.session_state["last_factor_record"]
        if st.button("Save Factor Record"):
            from src.rag.factor_store import save_factor_record
            save_factor_record(factor_record)
            st.success("Factor record securely saved and ready for ML integration.")
    else:
        st.info("Compute Factor Matrix first.")
        
    st.markdown("---")
    
    # -------------------------------------------------------------------------
    # SECTION 9: Limitations
    # -------------------------------------------------------------------------
    with st.expander("Limitations & Compliance"):
        st.markdown(
            "- **PDF Extraction:** Extracted text from PDFs can be imperfect due to formatting.\n"
            "- **RAG Answers:** RAG answers depend strictly on indexed documents.\n"
            "- **Rule-based Extraction:** Rule-based factor extraction is approximate.\n"
            "- **Robots.txt:** The downloader respects source policies and will skip blocked files.\n"
            "- **Not Financial Advice:** This is an educational and research tool."
        )
