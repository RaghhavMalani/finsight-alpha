"""Frozen robustness masks preserve existing feature/regime clocks."""
import numpy as np
import pandas as pd


def subset_mask(months,variant):
    dates=pd.PeriodIndex(months,freq="M")
    if variant in {"WITHOUT_2008","WITHOUT_2020"}:
        year=int(variant.rsplit("_",1)[1])
        if year not in dates.year: raise ValueError("Excluded crisis is absent from this evaluation sample")
        return np.asarray(dates.year!=year)
    half=len(dates)//2
    if variant=="FIRST_HALF": return np.arange(len(dates))<half
    if variant=="SECOND_HALF": return np.arange(len(dates))>=half
    if variant=="SECTOR_OUT": raise ValueError("Sector exclusion unavailable: no constituent security panel")
    return np.ones(len(dates),dtype=bool)
