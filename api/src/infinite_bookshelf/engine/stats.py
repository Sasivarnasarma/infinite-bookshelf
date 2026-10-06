"""
Token and timing statistics for one or more model calls.
"""

from dataclasses import dataclass


@dataclass
class GenerationStatistics:
    model_name: str
    input_time: float = 0.0
    output_time: float = 0.0
    input_tokens: int = 0
    output_tokens: int = 0
    total_time: float = 0.0  # Queue + prompt (input) + completion (output) time

    def add(self, other: "GenerationStatistics") -> None:
        """Accumulates another call's statistics into this one."""
        if not isinstance(other, GenerationStatistics):
            raise TypeError("Can only add GenerationStatistics objects")
        self.input_time += other.input_time
        self.output_time += other.output_time
        self.input_tokens += other.input_tokens
        self.output_tokens += other.output_tokens
        self.total_time += other.total_time
