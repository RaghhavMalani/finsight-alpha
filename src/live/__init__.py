"""Live spine: append-only provenance store, feeds, scheduler, event bus.

Live becomes history: every observation is appended with ``available_at`` set to
ingestion time by the store, so today's stream replays identically tomorrow.
"""
