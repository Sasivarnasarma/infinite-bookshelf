"""
Bridges the engine's synchronous generators to async Server-Sent Events.

Each step of the generator runs in a worker thread. When the browser disconnects (Pause,
closing the tab), the SSE response is cancelled: the current step finishes, then the generator
is closed, which closes the provider's stream so the model stops writing (and billing).

A step holds its thread while it waits for the model, which can be a minute for a reasoning
model. So streams get their own, larger pool of threads (STREAM_THREADS): a busy server keeps
answering health checks, the config and PDF exports, which use the default pool of 40.
"""

import json
from collections.abc import AsyncIterator, Iterator
from typing import Any

import anyio
from anyio import to_thread
from anyio.lowlevel import RunVar

Event = tuple[str, dict[str, Any]]

# Streams that can wait on a model at once; more queue until one finishes. Threads that are only
# waiting on the network cost little, so this is generous.
STREAM_THREADS = 200

_DONE = object()
_stream_limiter: RunVar[anyio.CapacityLimiter] = RunVar("stream_limiter")


def stream_limiter() -> anyio.CapacityLimiter:
    """The streams' thread limit, made on first use in each event loop."""
    try:
        return _stream_limiter.get()
    except LookupError:
        limiter = anyio.CapacityLimiter(STREAM_THREADS)
        _stream_limiter.set(limiter)
        return limiter


async def iterate_in_thread(generator: Iterator[Any]) -> AsyncIterator[Any]:
    limiter = stream_limiter()
    try:
        while True:
            # Not abandoned on cancel: we wait for the in-flight step, so close() below is safe
            item = await to_thread.run_sync(next, generator, _DONE, limiter=limiter)
            if item is _DONE:
                return
            yield item
    finally:
        with anyio.CancelScope(shield=True):
            await to_thread.run_sync(generator.close, limiter=limiter)


async def sse_events(events: Iterator[Event]) -> AsyncIterator[dict[str, str]]:
    """Formats (event, data) pairs for sse_starlette's EventSourceResponse."""
    async for name, data in iterate_in_thread(events):
        yield {"event": name, "data": json.dumps(data, ensure_ascii=False)}
