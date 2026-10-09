"""Four fixed candidates. Bootstrap schemes are independently specified."""
from __future__ import annotations
import math
import numpy as np
from scipy import stats


def ols(x,y):
    """Vectorized full-rank OLS and target-weight Bartlett HAC covariance."""
    x=np.asarray(x,dtype=float);y=np.asarray(y,dtype=float)
    single=x.ndim==2
    if single: x=x[None]; y=y[None]
    b,n,k=x.shape
    if y.shape!=(b,n) or n<k+10 or not np.isfinite(x).all() or not np.isfinite(y).all():
        raise ValueError("Invalid regression input")
    gram=np.einsum("bni,bnj->bij",x,x)
    inverse=np.linalg.inv(gram)
    beta=np.einsum("bij,bnj,bn->bi",inverse,x,y)
    residual=y-np.einsum("bni,bi->bn",x,beta)
    weight=np.einsum("bni,bi->bn",x,inverse[:,0,:])
    score=weight*residual
    variance=np.sum(score**2,axis=1)
    for lag in range(1,7):
        variance+=2*(1-lag/7)*np.sum(score[:,lag:]*score[:,:-lag],axis=1)
    variance*=n/(n-k)
    if np.any(variance<=0) or not np.isfinite(variance).all(): raise ValueError("Invalid HAC variance")
    result=(beta[:,0],np.sqrt(variance),residual,beta)
    return tuple(v[0] for v in result) if single else result


def moving_indices(n,length,b,rng):
    starts=rng.integers(0,n-length+1,size=(b,math.ceil(n/length)))
    return (starts[:,:,None]+np.arange(length)).reshape(b,-1)[:,:n]


def fixed_ols(x,ys):
    """Same OLS/HAC arithmetic with one fixed design for residual resamples."""
    n,k=x.shape
    inverse=np.linalg.inv(x.T@x)
    pinv=inverse@x.T
    beta=ys@pinv.T
    residual=ys-beta@x.T
    score=residual*pinv[0]
    variance=np.sum(score**2,axis=1)
    for lag in range(1,7):
        variance+=2*(1-lag/7)*np.sum(score[:,lag:]*score[:,:-lag],axis=1)
    variance*=n/(n-k)
    if np.any(variance<=0) or not np.isfinite(variance).all(): raise ValueError("Invalid fixed-design HAC variance")
    return beta[:,0],np.sqrt(variance),residual,beta


def stationary_indices(n,length,b,rng):
    starts=rng.integers(0,n,size=(b,n))
    restart=rng.random((b,n))<1/length
    restart[:,0]=True
    places=np.arange(n)[None,:]
    anchors=np.maximum.accumulate(np.where(restart,places,-1),axis=1)
    return (np.take_along_axis(starts,anchors,axis=1)+places-anchors)%n


def pvalues(t,bootstrap):
    return ((1+np.count_nonzero(bootstrap>=t))/(len(bootstrap)+1),
            (1+np.count_nonzero(np.abs(bootstrap)>=abs(t)))/(len(bootstrap)+1))


def infer(x,y,method,*,seed,effects=(0,.1,.2,.4),resamples=999):
    if method not in ("HAC_NORMAL","HAC_T","NULL_MBB_T","STATIONARY_PAIRS_T"):
        raise ValueError("Undeclared inference method")
    estimate,se,residual,beta=ols(x,y)
    n,k=x.shape
    if method in ("HAC_NORMAL","HAC_T"):
        reference=stats.norm if method=="HAC_NORMAL" else stats.t(df=n-k)
        critical=reference.ppf(.975)
        greater=[float(reference.sf((estimate+d)/se)) for d in effects]
        two=[float(2*reference.sf(abs((estimate+d)/se))) for d in effects]
        return np.array([estimate,se,estimate-critical*se,estimate+critical*se,se,*greater,*two])
    rng=np.random.default_rng(seed);length=math.ceil(math.sqrt(n));b=resamples
    if b<99: raise ValueError("Insufficient bootstrap budget")
    greater=[];two=[]
    if method=="STATIONARY_PAIRS_T":
        indices=stationary_indices(n,length,b,rng)
        boot_b,boot_se,_,_=fixed_ols(x,y[indices]) if k==1 else ols(x[indices],y[indices])
        pivotal=(boot_b-estimate)/boot_se
        for effect in effects:
            g,t=pvalues((estimate+effect)/se,pivotal);greater.append(g);two.append(t)
        reported_se=float(np.std(boot_b,ddof=1))
    else:
        indices=moving_indices(n,length,b,rng)
        # A separate unrestricted residual distribution supplies the bootstrap-t CI.
        unrestricted=residual-residual.mean()
        boot_b,boot_se,_,_=fixed_ols(x,(x@beta)[None,:]+unrestricted[indices])
        pivotal=(boot_b-estimate)/boot_se
        reported_se=float(np.std(boot_b,ddof=1))
        nuisance=x[:,1:]
        mean_null=fixed_ols(x,unrestricted[indices]) if k==1 else None
        for effect in effects:
            shifted=y+effect*x[:,0]
            if k>1:
                restricted_beta=np.linalg.lstsq(nuisance,shifted,rcond=None)[0]
                null_fit=nuisance@restricted_beta
            else: null_fit=np.zeros(n)
            null_error=shifted-null_fit;null_error-=null_error.mean()
            if k==1:
                # Centering removes a constant shift; p-values still use each effect's observed t.
                null_b,null_se,_,_=mean_null
            else:
                null_b,null_se,_,_=fixed_ols(x,null_fit[None,:]+null_error[indices])
            g,t=pvalues((estimate+effect)/se,null_b/null_se);greater.append(g);two.append(t)
    q=np.quantile(pivotal,[.025,.975],method="linear")
    result=np.array([estimate,reported_se,estimate-q[1]*se,estimate-q[0]*se,se,*greater,*two])
    if not np.isfinite(result).all() or reported_se<=0: raise ValueError("Invalid bootstrap result")
    return result
