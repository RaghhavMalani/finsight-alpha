"""Independent arithmetic/reference cases, counted separately at the engine gate."""
import numpy as np
import pytest
from scipy import stats
from scipy.optimize import brentq
from src.research_os.statistics import hac,welch,paired,bootstrap_mean,permutation_mean
from src.research_os.multiple_testing import correct
from src.research_os.sharpe import psr_formula,expected_max_sharpe,sharpe_diagnostics
from src.research_os.power import prospective_power,wilson


@pytest.mark.parametrize("seed",range(8))
@pytest.mark.parametrize("alternative",["greater","two-sided"])
def test_welch_scipy_reference(seed,alternative):
    rng=np.random.default_rng(seed);a=rng.normal(.1,2,83);b=rng.normal(0,1,61)
    result=welch(a,b,alternative)
    ref=stats.ttest_ind(a,b,equal_var=False,alternative=alternative)
    ci=stats.ttest_ind(a,b,equal_var=False).confidence_interval()
    assert result.p_value==pytest.approx(ref.pvalue,abs=1e-12)
    assert (result.ci_lower,result.ci_upper)==pytest.approx((ci.low,ci.high))


@pytest.mark.parametrize("seed",range(8))
def test_paired_scipy_reference(seed):
    rng=np.random.default_rng(seed);a=rng.normal(0,1,120);b=a+rng.normal(.1,.4,120)
    result=paired(a,b);ref=stats.ttest_rel(a,b);ci=ref.confidence_interval()
    assert result.p_value==pytest.approx(ref.pvalue)
    assert (result.ci_lower,result.ci_upper)==pytest.approx((ci.low,ci.high))


@pytest.mark.parametrize("lags",[0,1,3,6])
@pytest.mark.parametrize("seed",range(3))
def test_hac_independent_newey_west_matrix(seed,lags):
    rng=np.random.default_rng(seed);z=rng.normal(size=(240,2));y=.1+z@np.array([.4,-.1])+rng.normal(size=240)
    x=np.column_stack([np.ones(len(y)),z]);inverse=np.linalg.inv(x.T@x)
    beta=inverse@(x.T@y);u=y-x@beta;scores=x*u[:,None];meat=scores.T@scores
    for lag in range(1,lags+1):
        cross=scores[lag:].T@scores[:-lag];meat+=(1-lag/(lags+1))*(cross+cross.T)
    cov=inverse@meat@inverse*len(y)/(len(y)-x.shape[1]);se=np.sqrt(cov[0,0])
    result=hac(y,z,lags=lags)
    assert result.estimate==pytest.approx(beta[0],abs=1e-12)
    assert result.ci_upper==pytest.approx(beta[0]+stats.norm.ppf(.975)*se)
    assert result.p_value==pytest.approx(stats.norm.sf(beta[0]/se))


@pytest.mark.parametrize("seed",range(4))
def test_bootstrap_analytic_normal_interval(seed):
    y=np.random.default_rng(seed).normal(.2,1,400)
    result=bootstrap_mean(y,seed=101+seed,resamples=9999)
    se=y.std(ddof=1)/np.sqrt(len(y))
    assert result.estimate==pytest.approx(y.mean())
    assert result.ci_lower==pytest.approx(y.mean()-1.96*se,abs=.012)
    assert result.ci_upper==pytest.approx(y.mean()+1.96*se,abs=.012)


@pytest.mark.parametrize("seed",range(4))
def test_permutation_scipy_reference(seed):
    y=np.random.default_rng(seed).normal(.3,1,50)
    # Independent SciPy sign-flip test must agree within Monte Carlo error.
    ref=stats.permutation_test((y,np.zeros(len(y))),lambda a,b:np.mean(a-b),
        permutation_type="samples",alternative="greater",n_resamples=9999,rng=np.random.default_rng(seed))
    result=permutation_mean(y,seed=seed,resamples=9999)
    assert abs(result.p_value-ref.pvalue)<.025


@pytest.mark.parametrize("seed",range(6))
def test_holm_bh_independent_sorted_formula(seed,spec):
    rng=np.random.default_rng(seed);p=rng.uniform(0,.2,2);ids=spec.family.trial_ids
    out=correct(spec.family,dict(zip(ids,p)))
    order=np.argsort(p);holm=np.minimum(1,np.maximum.accumulate(p[order]*np.arange(2,0,-1)))
    bh=np.minimum(1,np.minimum.accumulate((p[order]*2/np.arange(1,3))[::-1])[::-1])
    for j,ix in enumerate(order):
        assert out[ids[ix]]["HOLM"]==pytest.approx(holm[j])
        assert out[ids[ix]]["BH"]==pytest.approx(bh[j])


@pytest.mark.parametrize("sr,skew,kurt,n",[(.1,0,3,101),(.2,-.5,5,240),(-.1,1,4,360),(.02,0,3,1250)])
def test_psr_published_equation(sr,skew,kurt,n):
    # Paper Eq (2): unannualized SR, Pearson kurtosis, n-1.
    from math import erf,sqrt
    z=(sr-.01)*sqrt((n-1)/(1-skew*sr+(kurt-1)*sr*sr/4))
    reference=(1+erf(z/sqrt(2)))/2
    assert psr_formula(sr,n,skew,kurt,.01)==pytest.approx(reference)


@pytest.mark.parametrize("trials",[1,10,100,1000])
def test_dsr_expected_max_published_equation(trials):
    reference=0 if trials==1 else .2*((1-.5772156649015329)*stats.norm.isf(1/trials)+.5772156649015329*stats.norm.isf(1/(trials*np.e)))
    assert expected_max_sharpe(trials,.2)==pytest.approx(reference)


@pytest.mark.parametrize("n,rho",[(120,0),(240,0),(240,.3),(600,.3)])
def test_power_independent_noncentral_t(n,rho):
    result=prospective_power(n,effect=.01,sigma=.05,rho=rho)
    eff=n*(1-rho)/(1+rho);critical=stats.t.ppf(.95,eff-1)
    reference=stats.nct.sf(critical,eff-1,.2*np.sqrt(eff))
    assert result["power"]==pytest.approx(reference,abs=1e-10)
    mde=brentq(lambda e:stats.nct.sf(critical,eff-1,e/.05*np.sqrt(eff))-.8,1e-8,.3)
    assert result["mde_80"]==pytest.approx(mde,rel=1e-5)


def test_wilson_known_binomial_fixture():
    r=wilson(50,1000)
    assert r["ci_lower"]==pytest.approx(.038130,abs=1e-5)
    assert r["ci_upper"]==pytest.approx(.065314,abs=1e-5)


@pytest.mark.parametrize("test",[welch,paired])
def test_translation_scale_and_pair_sign_metamorphism(test):
    rng=np.random.default_rng(88);a=rng.normal(.1,1,120);b=rng.normal(0,1,120)
    base=test(a,b);translated=test(a+12,b+12);scaled=test(3*a,3*b);swapped=test(b,a)
    assert translated.p_value==pytest.approx(base.p_value)
    assert scaled.estimate==pytest.approx(3*base.estimate)
    assert swapped.estimate==pytest.approx(-base.estimate)
    assert swapped.p_value==pytest.approx(base.p_value)


def test_family_omission_and_unavailable_retention(spec):
    with pytest.raises(ValueError): correct(spec.family,{"primary":.001})
    corrected=correct(spec.family,{"primary":.001,"placebo":None})
    assert corrected["primary"]["HOLM"]==.002
    assert corrected["placebo"]["HOLM"] is None


def test_dsr_unavailable_when_correlated_search_unspecified():
    result=sharpe_diagnostics(np.random.default_rng(5).normal(size=100),trial_sharpes=[.1,.2])
    assert result["status"]=="UNAVAILABLE" and result["dsr"] is None


@pytest.mark.parametrize("values",[[1]*20,[1,2,float("nan")],[1,2,float("inf")],[1,2]])
def test_degenerate_inference_rejected(values):
    with pytest.raises(ValueError): hac(values)
