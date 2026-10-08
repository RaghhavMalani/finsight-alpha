import numpy as np
import pandas as pd
import pytest
from src.research_os.costs import strategy_returns,indian_statutory_costs
from src.research_os.momentum import momentum_signal,monthly_factors,forward_filter
from src.research_os.placebos import negative_control
from src.research_os.robustness import subset_mask
from src.research_os.dag import validate_dag
from src.research_os.replication import compare


def test_12_1_excludes_recent_month_and_future():
    months=pd.period_range("2000-01",periods=25,freq="M").astype(str)
    frame=pd.DataFrame({"MKT":[.01]*25},index=months)
    base=momentum_signal(frame)
    frame.loc[months[11],"MKT"]=-.9
    assert momentum_signal(frame).iloc[12]==base.iloc[12] # t-1 ignored
    frame.loc[months[10],"MKT"]=-.9
    assert momentum_signal(frame).iloc[12]==-1 # t-2 admitted
    frame.loc[months[13]:,"MKT"]=100
    assert momentum_signal(frame).iloc[12]==-1
    assert base.iloc[:12].isna().all()


def test_monthly_compounding_and_missing_month_no_compression():
    dates=pd.to_datetime(["2000-01-03","2000-01-04","2000-03-01"],utc=True)
    frame=pd.DataFrame({"Date":dates,**{c:[.1,-.1,.02] for c in ("MKT","SMB","HML","MOM")}})
    monthly=monthly_factors(frame)
    assert monthly.loc["2000-01","MKT"]==pytest.approx(-.01)
    assert monthly.loc["2000-02"].isna().all()


def test_hmm_filter_prefix_independent_of_future():
    class Model:
        n_components=2;startprob_=np.array([.5,.5]);transmat_=np.array([[.9,.1],[.1,.9]])
        means_=np.array([[-1.],[1.]]);covars_=np.array([[[1.]],[[1.]]])
    x=np.linspace(-1,1,20)[:,None]
    first=forward_filter(Model(),x[:10]);full=forward_filter(Model(),x)
    assert full[:10]==pytest.approx(first)
    assert full.sum(axis=1)==pytest.approx(np.ones(20))
    x[10:]=-100
    assert forward_filter(Model(),x)[:10]==pytest.approx(first)


def test_known_costs_entry_reversal_and_liquidation():
    net,turnover,costs=strategy_returns([.1,.1,.1],[1,-1,-1],10)
    assert turnover.tolist()==[1,2,1]
    assert net==pytest.approx([.099,-.102,-.101])
    wrong=strategy_returns([.1,.1,.1],[-1,1,1],10)[0]
    assert wrong==pytest.approx([-.101,.098,.099])
    assert np.all(strategy_returns([.1]*3,[1,-1,-1],50)[0]<=net)
    assert indian_statutory_costs()["status"]=="UNAVAILABLE"


@pytest.mark.parametrize("variant",["WRONG_DIRECTION","RANDOM_SIGNAL","SHUFFLED_DATES","PERMUTED_OUTCOME","SHUFFLED_REGIME_HMM"])
def test_placebo_determinism_and_input_immutability(variant):
    s=np.ones(20);m=np.arange(20,dtype=float)/100;r=np.arange(20)%2
    a=negative_control(s,m,r,variant,23);b=negative_control(s,m,r,variant,23)
    for x,y in zip(a,b): assert np.array_equal(x,y)
    assert np.all(s==1) and np.array_equal(m,np.arange(20)/100)


def test_subsamples_are_disjoint_and_absent_crisis_fails():
    months=pd.period_range("2008-01",periods=24,freq="M").astype(str)
    first=subset_mask(months,"FIRST_HALF");second=subset_mask(months,"SECOND_HALF")
    assert not (first&second).any() and (first|second).all()
    assert subset_mask(months,"WITHOUT_2008").sum()==12
    with pytest.raises(ValueError): subset_mask(months,"WITHOUT_2020")
    with pytest.raises(ValueError): subset_mask(months,"SECTOR_OUT")


@pytest.mark.parametrize("sabotage",["cycle","dangling","hypothesis"])
def test_dag_lineage_guards(sabotage):
    nodes=[{"id":"a","hypothesis_hash":"h"},{"id":"b","hypothesis_hash":"h"}]
    edges=[{"from":"a","to":"b","kind":"EXECUTION"}]
    validate_dag(nodes,edges)
    if sabotage=="cycle": edges.append({"from":"b","to":"a","kind":"EXECUTION"})
    if sabotage=="dangling": edges[0]["to"]="c"
    if sabotage=="hypothesis": nodes[1]["hypothesis_hash"]="different"
    with pytest.raises(ValueError): validate_dag(nodes,edges)


def test_paper_exact_unavailable_and_replication_scope_guards():
    original={"run_hash":"a"*64,"country":"US","start":"2000-01","end":"2010-01","unit":"monthly"}
    other={**original,"run_hash":"b"*64,"start":"2005-01","end":"2015-01"}
    result=compare("EXACT",original,other,differences=("No original data",))
    assert result.status.value=="UNAVAILABLE"
    with pytest.raises(ValueError): compare("CROSS_MARKET",original,other,differences=("Source",))
    with pytest.raises(ValueError): compare("TEMPORAL",original,other,differences=("Window",))
