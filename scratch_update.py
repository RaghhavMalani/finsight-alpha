import re
import sys

def update_streamlit_ml_lab():
    with open("app/streamlit_app.py", "r", encoding="utf-8") as f:
        content = f.read()

    # Part I: Regime Feature Impact
    fi_old = """        # -------------------------------------------------------------------------
        # SECTION 8: Feature Intelligence
        # -------------------------------------------------------------------------
        st.markdown("---")
        st.subheader("Feature Intelligence")
        st.caption("Feature importance shows which signals the model used most, not guaranteed causal drivers.")
        
        fi = suite_results["feature_importance"]
        
        fic1, fic2 = st.columns(2)
        with fic1:
            st.plotly_chart(ml_plots.plot_feature_importance(fi.head(15)), use_container_width=True)
        with fic2:
            st.plotly_chart(ml_plots.plot_feature_group_importance(fi), use_container_width=True)"""
            
    fi_new = """        # -------------------------------------------------------------------------
        # SECTION 8: Feature Intelligence
        # -------------------------------------------------------------------------
        st.markdown("---")
        st.subheader("Feature Intelligence")
        st.caption("Feature importance shows which signals the model used most, not guaranteed causal drivers.")
        
        fi = suite_results["feature_importance"]
        
        fic1, fic2 = st.columns(2)
        with fic1:
            st.plotly_chart(ml_plots.plot_feature_importance(fi.head(15)), use_container_width=True)
        with fic2:
            st.plotly_chart(ml_plots.plot_feature_group_importance(fi), use_container_width=True)
            
        if use_regime:
            st.markdown("#### Regime Feature Impact")
            regime_feats = ["regime_code", "regime_probability", "regime_duration", "regime_risk_level_code", "regime_probability_feature", "current_regime_flag"]
            regime_fi = fi[fi["feature"].isin(regime_feats)]
            if not regime_fi.empty and regime_fi["importance"].sum() > 0.01:
                st.dataframe(regime_fi[["feature", "importance"]].sort_values("importance", ascending=False).style.format({"importance": "{:.2%}"}), use_container_width=True)
            else:
                st.info("Regime features were included but did not materially influence this model.")"""
                
    content = content.replace(fi_old, fi_new)
    
    with open("app/streamlit_app.py", "w", encoding="utf-8") as f:
        f.write(content)
        
if __name__ == "__main__":
    update_streamlit_ml_lab()
