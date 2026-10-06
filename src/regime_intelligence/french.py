"""Free French source library: never backdate a current revised download."""

from __future__ import annotations

import calendar
import csv
from datetime import date, datetime, time, timedelta, timezone
import hashlib
import io
import json
from pathlib import Path
import re
from urllib.parse import unquote, urljoin, urlparse
import zipfile

from bs4 import BeautifulSoup
import requests

from src.dynamics.market_regime_inputs import digest, utc
from src.regime_intelligence.alpaca import NY
from src.regime_intelligence.contracts import FactorRelease, Observation

BASE = "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/"
FILES = {
    "FF3": "F-F_Research_Data_Factors",
    "FF5": "F-F_Research_Data_5_Factors_2x3",
    "MOM": "F-F_Momentum_Factor",
}
ARCHIVES = {
    "FF3": BASE + "Data_Library/f-f_factors_archive.html",
    "FF5": BASE + "Data_Library/f-f_5_factors_2x3_archive.html",
}
NAMES = {"Mkt-RF": "MKT", "SMB": "SMB", "HML": "HML", "RF": "RF",
         "RMW": "RMW", "CMA": "CMA", "Mom": "MOM"}


def release_month_end(year: int, month: int) -> datetime:
    """Only a release MONTH is evidenced: admit after that entire month."""
    next_day = date(year, month, calendar.monthrange(year, month)[1]) + timedelta(days=1)
    return datetime.combine(next_day, time.min, NY).astimezone(timezone.utc)


def parse_zip(raw: bytes, *, family: str, source_url: str, captured_at: str,
              available_at: datetime, release_identity: str, quality: str,
              start: date) -> list[FactorRelease]:
    if len(raw) > 16 * 1024 * 1024:
        raise ValueError("French response exceeds 16 MB")
    raw_hash = hashlib.sha256(raw).hexdigest()
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        members = [m for m in archive.infolist() if m.filename.lower().endswith((".csv", ".txt"))]
        if len(members) != 1 or members[0].file_size > 16 * 1024 * 1024:
            raise ValueError("Ambiguous or oversized French archive")
        text = archive.read(members[0]).decode("utf-8-sig")
    header, rows = None, []
    for fields in csv.reader(io.StringIO(text)):
        fields = [f.strip() for f in fields]
        if fields and any(f in NAMES for f in fields) and not fields[0]:
            header = fields[1:]
            continue
        if not header or not fields or not re.fullmatch(r"\d{6}(?:\d{2})?", fields[0]):
            continue
        day_string = fields[0]
        if len(fields) != len(header) + 1:
            raise ValueError("French columns do not match their header")
        frequency = "daily" if len(day_string) == 8 else "monthly"
        day = date(int(day_string[:4]), int(day_string[4:6]), int(day_string[6:]) if frequency == "daily" else 1)
        if day < start:
            continue
        end_day = day + timedelta(days=1) if frequency == "daily" else (
            day + timedelta(days=calendar.monthrange(day.year, day.month)[1])
        )
        values = {NAMES[name]: float(value) / 100 for name, value in zip(header, fields[1:]) if name in NAMES}
        if any(float(v) in (-99.99, -999.0) for v in fields[1:]):
            continue
        observed = datetime.combine(end_day, time.min, NY)
        if observed > available_at:
            raise ValueError("French factor observation follows its alleged release")
        rows.append(FactorRelease(
            family=family, frequency=frequency, observed_at=observed,
            available_at=available_at, as_of=captured_at, source="KENNETH_FRENCH",
            source_url=source_url, content_hash=raw_hash, release_identity=release_identity,
            quality=quality, values=values,
        ))
    if not rows:
        raise ValueError("No dated French returns found")
    return rows


class FrenchLibraryProvider:
    def __init__(self, root: Path, *, session=None):
        self.root = root
        self.session = session or requests.Session()

    def _fetch(self, url: str) -> tuple[bytes, str]:
        if urlparse(url).hostname != "mba.tuck.dartmouth.edu" or not url.startswith(BASE):
            raise ValueError("French source must belong to the official library")
        # Fixed archive ZIPs are immutable; discovery pages/current files can
        # advance on another day without erasing an earlier capture.
        capture_day = None if "Historical_Archives/" in url else date.today().isoformat()
        directory = self.root / digest({"source_url": url, "capture_day": capture_day})
        index = directory / "capture.json"
        if index.exists():
            meta = json.loads(index.read_text(encoding="utf-8"))
            raw = (directory / (meta["content_hash"] + ".bin")).read_bytes()
            if hashlib.sha256(raw).hexdigest() != meta["content_hash"]:
                raise ValueError("French raw snapshot hash mismatch")
            return raw, meta["captured_at"]
        response = self.session.get(url, timeout=(5, 30))
        if response.status_code != 200:
            raise RuntimeError(f"French library unavailable: HTTP {response.status_code}")
        raw = response.content
        if len(raw) > 16 * 1024 * 1024:
            raise ValueError("French source is oversized")
        captured = datetime.now(timezone.utc).isoformat()
        content_hash = hashlib.sha256(raw).hexdigest()
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / (content_hash + ".bin")
        with path.open("xb") as handle:
            handle.write(raw)
        index.write_text(json.dumps({"source_url": url, "content_hash": content_hash,
                                    "captured_at": captured}, sort_keys=True), encoding="utf-8")
        return raw, captured

    def load(self, start: date) -> list[FactorRelease]:
        rows = []
        for family, page in ARCHIVES.items():
            raw_page, _ = self._fetch(page)
            links = BeautifulSoup(raw_page, "html.parser").find_all("a", href=True)
            for link in links:
                url = urljoin(page, link["href"])
                match = re.search(r"Historical_Archives/(\d{2}) (\d{4}) Update/", unquote(url))
                if not match or not url.endswith(FILES[family] + "_CSV.zip"):
                    continue
                month, year = map(int, match.groups())
                if year < start.year:
                    continue
                available = release_month_end(year, month)
                if available > datetime.now(timezone.utc):
                    continue
                raw, captured = self._fetch(url)
                rows.extend(parse_zip(raw, family=family, source_url=url, captured_at=captured,
                                      available_at=available, release_identity=f"archive-release:{year}-{month:02}",
                                      quality="CONSERVATIVE_RELEASE_MONTH", start=start))
        for family, filename in FILES.items():
            url = BASE + "ftp/" + filename + "_daily_CSV.zip"
            raw, captured = self._fetch(url)
            rows.extend(parse_zip(raw, family=family, source_url=url, captured_at=captured,
                                  available_at=utc(captured), release_identity="current-capture:" + captured,
                                  quality="CAPTURE_ONLY", start=start))
        return rows


def daily_factor_observations(releases: list[FactorRelease]) -> list[Observation]:
    """Keep available daily FF3 and momentum; never upsample monthly archives."""
    groups = {}
    for row in releases:
        if row.frequency != "daily" or row.family not in ("FF3", "MOM"):
            continue
        groups.setdefault(row.observed_at, []).append(row)
    result = []
    for observed, rows in sorted(groups.items()):
        values = {k: v for row in rows for k, v in row.values.items() if k in ("MKT", "SMB", "HML", "MOM")}
        evidence = [{"source_url": r.source_url, "content_hash": r.content_hash,
                     "release_identity": r.release_identity, "quality": r.quality} for r in rows]
        result.append(Observation(
            stream="factors", observed_at=observed,
            available_at=max(r.available_at for r in rows), as_of=max(r.as_of for r in rows),
            source="KENNETH_FRENCH:DAILY_FF3_MOM", revision="french:" + digest(evidence),
            quality="CAPTURE_ONLY", publication_evidence=json.dumps({
                "evidence_mode": "CAPTURE_ONLY", "disclosure": "Current revised daily file available only at actual local capture; no historical publication timing claimed.",
                "sources": evidence,
            }, sort_keys=True), values={"values": values},
        ))
    return result
