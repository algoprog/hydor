"""E5: a small-model scorer that scores each example with the checkpoint of its own (UTC) day.

scripts/online_sim.py saves runs/<x>/day_YYYY-MM-DD.pt: the model as it was when that day began. Give the harness
`--slm day:runs/<x>` to score every test message with the model it would have met that day.
"""
from __future__ import annotations

import datetime
import glob
import os
from collections import OrderedDict

from .slm import SLMScorer


class DayRoutedSLMScorer:
    def __init__(self, folder: str, threads: int = 4, keep: int = 6):
        self.threads, self.keep = threads, keep
        self.days = {os.path.basename(p)[4:14]: p for p in glob.glob(os.path.join(folder, "day_*.pt"))}
        if not self.days:
            raise SystemExit(f"no day_*.pt checkpoints in {folder}")
        self.name = f"slm:day:{os.path.basename(os.path.normpath(folder))}"
        self.cache: OrderedDict = OrderedDict()

    def _for(self, ex) -> SLMScorer:
        day = datetime.datetime.fromtimestamp(ex.ts / 1000, datetime.timezone.utc).strftime("%Y-%m-%d")
        if day not in self.days:  # outside the simulated days: the nearest earlier checkpoint, else the first
            earlier = [d for d in self.days if d <= day]
            day = max(earlier) if earlier else min(self.days)
        if day in self.cache:
            self.cache.move_to_end(day)
        else:
            if len(self.cache) >= self.keep:
                self.cache.popitem(last=False)
            self.cache[day] = SLMScorer(self.days[day], threads=self.threads)
        return self.cache[day]

    @property
    def vocab(self):
        return self._for_any().vocab

    def _for_any(self) -> SLMScorer:
        if not self.cache:
            d = min(self.days)
            self.cache[d] = SLMScorer(self.days[d], threads=self.threads)
        return next(iter(self.cache.values()))

    def slm_logprobs(self, ex):
        return self._for(ex).slm_logprobs(ex)

    def logprobs(self, ex, llm_lp=None):
        return self._for(ex).logprobs(ex, llm_lp)
