"""
Bridges the engine's synchronous generators to async Server-Sent Events.

Each step of the generator runs in a worker thread. When the browser disconnects (Pause,
closing the tab), the SSE response is cancelled: the current step finishes, then the generator
is closed, which closes the provider's stream so the model stops writing (and billing).
"""

import json
from collections.abc import AsyncIterator, Iterator
from typing import Any

import anyio
from anyio import to_thread

Event = tuple[str, dict[str, Any]]

_DONE = object()


async def iterate_in_thread(generator: Iterator[Any]) -> AsyncIterator[Any]:
    try:
        while True:
            # Not abandoned on cancel: we wait for the in-flight step, so close() below is safe
            item = await to_thread.run_sync(next, generator, _DONE)
            if item is _DONE:
                return
            yield item
    finally:
        with anyio.CancelScope(shield=True):
            await to_thread.run_sync(generator.close)


async def sse_events(events: Iterator[Event]) -> AsyncIterator[dict[str, str]]:
    """Formats (event, data) pairs for sse_starlette's EventSourceResponse."""
    async for name, data in iterate_in_thread(events):
        yield {"event": name, "data": json.dumps(data, ensure_ascii=False)}
