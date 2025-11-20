"""
Health check HTTP server for monitoring and Cloud Run
Runs on separate port from WebSocket server
"""

import logging
import asyncio
from aiohttp import web

logger = logging.getLogger(__name__)


async def health_handler(request: web.Request) -> web.Response:
    """
    Health check endpoint.
    Returns current service health status and active session count.
    """
    from core.session import get_active_session_count

    health_data = {
        "status": "healthy",
        "service": "gemini-live-avatar",
        "active_sessions": get_active_session_count(),
    }

    return web.json_response(health_data, status=200)


async def readiness_handler(request: web.Request) -> web.Response:
    """
    Readiness check endpoint.
    Returns whether the service is ready to accept connections.
    """
    from config import api_config

    # Check if service account is configured
    if not api_config._credentials:
        return web.json_response(
            {"status": "not_ready", "reason": "Service account not configured"},
            status=503
        )

    return web.json_response({"status": "ready"}, status=200)


async def start_health_check_server(port: int = 8081) -> web.AppRunner:
    """Start HTTP health check server on separate port."""
    app = web.Application()
    app.router.add_get('/health', health_handler)
    app.router.add_get('/ready', readiness_handler)
    app.router.add_get('/', health_handler)  # Default route

    runner = web.AppRunner(app)
    await runner.setup()

    site = web.TCPSite(runner, '0.0.0.0', port)
    await site.start()

    logger.info(f"✅ Health check server running on port {port}")
    logger.info(f"   Endpoints: /health, /ready")

    return runner
