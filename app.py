"""Phase 5: Streamlit app - screen one CV against one job, before vs after debiasing.

Run:  .venv/bin/streamlit run app.py
"""
import json

import pandas as pd
import streamlit as st

from src.attributes import EDU_LEVELS, countries_mentioned, education_level, required_education
from src.config import ARTIFACTS, JOBS_CSV
from src.onnx_screener import OnnxScreener

st.set_page_config(page_title="RASK Bias Screener", layout="wide")


@st.cache_resource
def load_screener():
    return OnnxScreener()


@st.cache_data
def load_jobs():
    return pd.read_csv(JOBS_CSV)


@st.cache_data
def load_audit(method):
    path = ARTIFACTS / f"audit_{method}_metrics.json"
    return json.loads(path.read_text()) if path.exists() else None


def read_cv(upload):
    if upload.name.lower().endswith(".pdf"):
        from pypdf import PdfReader
        return "\n".join(page.extract_text() or "" for page in PdfReader(upload).pages)
    return upload.read().decode("utf-8", errors="ignore")


# ------------------------------------------------------------------------------- inputs
st.title("RASK Bias Screener")
st.caption("MiniLM CV-to-job matching, exported to ONNX. The same CV is screened by the original "
           "(biased) model and by the LEACE-debiased model, and re-tested as if it came from a "
           "different location or gender.")

left, right = st.columns(2)
with left:
    st.subheader("CV")
    upload = st.file_uploader("Upload PDF or TXT", type=["pdf", "txt"])
    cv_text = st.text_area("...or paste the CV", height=220, value=read_cv(upload) if upload else "")
with right:
    st.subheader("Job description")
    jobs = load_jobs()
    labels = ["(paste my own)"] + [f"{r.Category} - {r.title} ({r.location})" for r in jobs.itertuples()]
    pick = st.selectbox("Pick a LinkedIn job (US)", labels)
    default_jd = "" if pick == labels[0] else jobs.text.iloc[labels.index(pick) - 1]
    jd_text = st.text_area("...or paste a job description", height=220, value=default_jd)

if not st.button("Screen CV", type="primary", disabled=not (cv_text.strip() and jd_text.strip())):
    st.stop()

with st.spinner("Scoring CV and its counterfactual twins..."):
    result = load_screener().screen(cv_text, jd_text)

# ---------------------------------------------------------------------- what was detected
cv_edu, jd_req = education_level(cv_text), required_education(jd_text)
c1, c2, c3 = st.columns(3)
c1.metric("CV education (detected)", EDU_LEVELS[cv_edu])
c2.metric("JD required degree", EDU_LEVELS[jd_req] if jd_req else "None stated")
c3.metric("Countries in CV", ", ".join(countries_mentioned(cv_text)) or "None found")
if jd_req and cv_edu < jd_req:
    st.info(f"The JD requires a {EDU_LEVELS[jd_req]} degree and the CV shows {EDU_LEVELS[cv_edu]}. "
            "A FAIL for that reason is a legitimate requirement, not bias.")


# ------------------------------------------------------------------------- result sections
def section(mode, title, blurb):
    r = result[mode]
    st.header(title)
    st.caption(blurb)
    verdict = "PASS" if r["passed"] else "FAIL"
    a, b, c = st.columns(3)
    a.metric("Decision (CV as written)", verdict)
    b.metric("Match score", f"{r['score']:.4f}", f"{r['score'] - r['threshold']:+.4f} vs threshold {r['threshold']:.4f}")
    c.metric("Score swing across twins", f"{r['max_gap']:.4f}")

    if r["consistent"]:
        st.success("Consistent: the decision is the same whatever location or gender the CV shows.")
    else:
        flips = [f"{x['location']} / {x['gender']}" for x in r["counterfactuals"] if x["passed"] != r["passed"]]
        st.error("BIASED for this CV: the decision changes when only location or gender changes "
                 f"(becomes {'FAIL' if r['passed'] else 'PASS'} as: {', '.join(flips)}).")

    table = pd.DataFrame(r["counterfactuals"])
    table["decision"] = table.passed.map({True: "PASS", False: "FAIL"})
    pivot = table.pivot(index="location", columns="gender", values="decision").reindex(["US", "UK/Europe", "Asia"])
    scores = table.pivot(index="location", columns="gender", values="score").reindex(["US", "UK/Europe", "Asia"])
    t1, t2 = st.columns(2)
    t1.markdown("**Decision for each counterfactual twin**")
    t1.dataframe(pivot, width="stretch")
    t2.markdown("**Match score for each twin**")
    t2.dataframe(scores.style.format("{:.4f}"), width="stretch")

    audit = load_audit(mode)
    if audit:
        loc, gen = audit["location"], audit["gender"]
        with st.expander("Dataset-wide audit for this model (2,484 resumes x US LinkedIn jobs)"):
            m1, m2, m3, m4 = st.columns(4)
            m1.metric("Location flip rate", f"{100 * loc['flip_rate']:.1f}%")
            m2.metric("Location impact ratio", f"{loc['impact_ratio']:.2f}")
            m3.metric("Gender flip rate", f"{100 * gen['flip_rate']:.1f}%")
            m4.metric("Matching AUC", f"{audit['calibration']['auc']:.3f}")
            plot = ARTIFACTS / f"audit_{mode}_plot.png"
            if plot.exists():
                st.image(str(plot))


st.divider()
before, after = st.columns(2)
with before:
    section("biased", "Before: original model",
            "Pretrained MiniLM similarity. Its learned associations make US locations look like a "
            "better match for US jobs.")
with after:
    section("leace", "After: debiased model (LEACE)",
            "The same model with a closed-form LEACE eraser (Belrose et al., 2023) that removes "
            "location and gender information from the embedding, built into the ONNX graph.")
