"""Independent library/loop references, using fixtures outside study seed domains."""
import math
from pathlib import Path
import numpy as np
import pytest
from scipy import stats
import statsmodels.api as sm
from src.research_os.calibration_v011.methods import ols,fixed_ols,infer,moving_indices,stationary_indices
from src.research_os.calibration_v011.metrics import bound
from src.research_os.statistics import hac


def fixture(n,k,seed):
    rng=np.random.default_rng(seed)
    x=np.column_stack((np.ones(n),rng.normal(size=(n,k-1))+.2))
    error=rng.normal(size=n)
    for i in range(1,n): error[i]+=.4*error[i-1]
    y=x@np.linspace(.1,.3,k)+error
    return x,y


def ref_fit(x,y):
    return sm.OLS(y,x).fit(cov_type="HAC",cov_kwds={"maxlags":6,"use_correction":True},use_t=False)


@pytest.mark.parametrize("n",[120,240,480])
@pytest.mark.parametrize("k",[1,3])
@pytest.mark.parametrize("seed",[11,12,13])
def test_independent_statsmodels_and_untouched_incumbent(n,k,seed):
    x,y=fixture(n,k,seed);b,se,_,_=ols(x,y);ref=ref_fit(x,y)
    assert b==pytest.approx(ref.params[0],abs=1e-12)
    assert se==pytest.approx(ref.bse[0],abs=1e-12)
    incumbent=hac(y,x[:,1:] if k>1 else None,lags=6)
    result=infer(x,y,"HAC_NORMAL",seed=0)
    assert result[5]==pytest.approx(incumbent.p_value,abs=1e-12)
    assert result[2:4]==pytest.approx([incumbent.ci_lower,incumbent.ci_upper],abs=1e-12)


@pytest.mark.parametrize("n",[120,240,480])
@pytest.mark.parametrize("k",[1,3])
@pytest.mark.parametrize("seed",[21,22])
def test_independent_statsmodels_finite_df_t(n,k,seed):
    x,y=fixture(n,k,seed)
    ref=sm.OLS(y,x).fit(cov_type="HAC",cov_kwds={"maxlags":6,"use_correction":True},use_t=True)
    result=infer(x,y,"HAC_T",seed=0)
    assert result[5]==pytest.approx(stats.t.sf(ref.params[0]/ref.bse[0],ref.df_resid),abs=1e-12)
    assert result[2:4]==pytest.approx(ref.conf_int()[0],abs=1e-12)


@pytest.mark.parametrize("n",[40,61,120])
def test_moving_indices_independent_non_circular_loops(n):
    length=math.ceil(math.sqrt(n));rng=np.random.default_rng(918)
    starts=rng.integers(0,n-length+1,size=(99,math.ceil(n/length)))
    ref=np.asarray([[index for start in row for index in range(start,start+length)][:n] for row in starts])
    actual=moving_indices(n,length,99,np.random.default_rng(918))
    np.testing.assert_array_equal(actual,ref)
    assert np.min(actual)>=0 and np.max(actual)<n


@pytest.mark.parametrize("n",[40,61,120])
def test_stationary_indices_independent_recursion(n):
    length=math.ceil(math.sqrt(n));rng=np.random.default_rng(712)
    starts=rng.integers(0,n,size=(99,n));uniform=rng.random((99,n));ref=np.empty((99,n),int)
    for draw in range(99):
        ref[draw,0]=starts[draw,0]
        for t in range(1,n):
            ref[draw,t]=starts[draw,t] if uniform[draw,t]<1/length else (ref[draw,t-1]+1)%n
    np.testing.assert_array_equal(stationary_indices(n,length,99,np.random.default_rng(712)),ref)


@pytest.mark.parametrize("k",[1,3])
def test_stationary_bootstrap_independent_scalar_regression(k):
    x,y=fixture(60,k,817);seed=774;effects=[0,.1,.2,.4];ref=ref_fit(x,y)
    ix=stationary_indices(60,8,99,np.random.default_rng(seed))
    fits=[ref_fit(x[row],y[row]) for row in ix]
    estimates=np.array([f.params[0] for f in fits]);ses=np.array([f.bse[0] for f in fits])
    pivots=(estimates-ref.params[0])/ses;q=np.quantile(pivots,[.025,.975])
    expected=[ref.params[0],estimates.std(ddof=1),ref.params[0]-q[1]*ref.bse[0],ref.params[0]-q[0]*ref.bse[0],ref.bse[0]]
    expected += [(1+sum(pivots>=(ref.params[0]+d)/ref.bse[0]))/100 for d in effects]
    expected += [(1+sum(np.abs(pivots)>=abs((ref.params[0]+d)/ref.bse[0])))/100 for d in effects]
    np.testing.assert_allclose(infer(x,y,"STATIONARY_PAIRS_T",seed=seed,resamples=99),expected,atol=1e-12,rtol=1e-12)


@pytest.mark.parametrize("k",[1,3])
def test_restricted_mbb_independent_scalar_regressions(k):
    x,y=fixture(60,k,889);seed=832;effects=[0,.1,.2,.4];ref=ref_fit(x,y)
    ix=moving_indices(60,8,99,np.random.default_rng(seed));e=ref.resid-ref.resid.mean()
    fits=[ref_fit(x,ref.fittedvalues+e[row]) for row in ix]
    estimates=np.array([f.params[0] for f in fits]);ses=np.array([f.bse[0] for f in fits]);pivots=(estimates-ref.params[0])/ses
    q=np.quantile(pivots,[.025,.975]);g=[];tw=[]
    for effect in effects:
        shifted=y+effect
        nullfit=sm.OLS(shifted,x[:,1:]).fit().fittedvalues if k>1 else np.zeros(len(y))
        errors=shifted-nullfit;errors-=errors.mean()
        fits_null=[ref_fit(x,nullfit+errors[row]) for row in ix]
        tstar=np.asarray([f.params[0]/f.bse[0] for f in fits_null]);t=(ref.params[0]+effect)/ref.bse[0]
        g.append((1+sum(tstar>=t))/100);tw.append((1+sum(abs(tstar)>=abs(t)))/100)
    expected=[ref.params[0],estimates.std(ddof=1),ref.params[0]-q[1]*ref.bse[0],ref.params[0]-q[0]*ref.bse[0],ref.bse[0],*g,*tw]
    np.testing.assert_allclose(infer(x,y,"NULL_MBB_T",seed=seed,resamples=99),expected,atol=1e-12,rtol=1e-12)


@pytest.mark.parametrize("successes",[0,1,5,50,100])
@pytest.mark.parametrize("tail",[.025,.04/90])
@pytest.mark.parametrize("upper",[False,True])
def test_exact_binomial_scipy_reference(successes,tail,upper):
    ref=stats.binomtest(successes,100).proportion_ci(confidence_level=1-2*tail,method="exact")
    assert bound(successes,100,tail,upper)==pytest.approx(ref.high if upper else ref.low,abs=1e-11)


@pytest.mark.parametrize("k",[1,3])
def test_fixed_design_vectorization_matches_independent_ols(k):
    x,y=fixture(83,k,156);ys=np.stack([y,y+.1,y-.2]);b,se,_,_=fixed_ols(x,ys)
    for index,row in enumerate(ys):
        ref=ref_fit(x,row)
        assert b[index]==pytest.approx(ref.params[0],abs=1e-12)
        assert se[index]==pytest.approx(ref.bse[0],abs=1e-12)
