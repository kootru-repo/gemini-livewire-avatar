"""
Gemini Live Avatar Backend Server
Modern SDK-based architecture with modular components
Supports both local development and Cloud Run deployment
"""

import asyncio
import logging
import os
from collections import defaultdict
from time import time

import websockets
from websockets.legacy.server import WebSocketServerProtocol

from core.websocket_handler import handle_client
from core.session import get_active_session_count
from core.auth import is_cloud_run, is_auth_enabled, get_auth_instance

# Environment configuration (load before logging)
DEBUG = os.getenv("DEBUG", "false").lower() == "true"

# Configure logging
logging.basicConfig(
    level=logging.DEBUG if DEBUG else logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Other environment configuration
BACKEND_PORT = int(os.getenv("BACKEND_PORT", "8080"))
BACKEND_HOST = os.getenv("BACKEND_HOST") or "0.0.0.0"

# Security configuration - environment-aware defaults
def get_default_allowed_origins():
    """Get default allowed origins based on environment."""
    if is_cloud_run():
        # Cloud Run: Require explicit configuration via env var
        # No default, must be set in Cloud Run environment
        firebase_project = os.getenv("FIREBASE_PROJECT_ID", "")
        if firebase_project:
            return f"https://{firebase_project}.web.app,https://{firebase_project}.firebaseapp.com"
        return ""  # Must be explicitly set
    else:
        # Local development: Allow localhost
        return "http://localhost:8000,http://localhost:8080"

ALLOWED_ORIGINS_STR = os.getenv("ALLOWED_ORIGINS", get_default_allowed_origins())
ALLOWED_ORIGINS = [origin.strip() for origin in ALLOWED_ORIGINS_STR.split(",") if origin.strip()]

MAX_MESSAGE_SIZE = 1024 * 1024  # 1MB max message size

# ALLOW_NO_ORIGIN: Auto-detect based on environment
# Local: Allow for easier testing
# Cloud: Must be false for security
def get_default_allow_no_origin():
    if is_cloud_run():
        return "false"  # ALWAYS false in cloud for security
    else:
        return "true"   # Allow in local dev for convenience

ALLOW_NO_ORIGIN = os.getenv("ALLOW_NO_ORIGIN", get_default_allow_no_origin()).lower() == "true"

# Rate limiting: max 10 connections per IP per minute
connection_attempts = defaultdict(list)
MAX_CONNECTIONS_PER_MINUTE = 10
RATE_LIMIT_WINDOW_SECONDS = 60  # Rate limit window (1 minute)
RATE_LIMITER_CLEANUP_INTERVAL = 300  # Clean up old entries every 5 minutes

# Connection limiting
MAX_CONCURRENT_CONNECTIONS = 100
active_connections = 0
connection_semaphore = asyncio.Semaphore(MAX_CONCURRENT_CONNECTIONS)


def check_rate_limit(ip_address: str) -> bool:
    """Check if IP is within rate limits."""
    now = time()

    # Remove old attempts (older than rate limit window)
    connection_attempts[ip_address] = [
        t for t in connection_attempts[ip_address] if now - t < RATE_LIMIT_WINDOW_SECONDS
    ]

    if len(connection_attempts[ip_address]) >= MAX_CONNECTIONS_PER_MINUTE:
        logger.warning(f"⚠️ Rate limit exceeded for {ip_address}")
        return False

    # Add current attempt to dict (not local list!)
    connection_attempts[ip_address].append(now)
    return True


async def validate_origin(client_websocket: WebSocketServerProtocol) -> bool:
    """
    Validate WebSocket origin header.
    SECURITY: Fails closed - returns False on error or missing origin (unless ALLOW_NO_ORIGIN=true)
    """
    try:
        # New API (websockets 13.0+)
        if hasattr(client_websocket, 'request') and hasattr(client_websocket.request, 'headers'):
            origin = client_websocket.request.headers.get("Origin")
        # Old API (websockets 12.0 and earlier)
        elif hasattr(client_websocket, 'request_headers'):
            origin = client_websocket.request_headers.get("Origin")
        else:
            logger.error("❌ Could not access request headers - blocking connection")
            return False  # SECURITY: Fail closed on error
    except Exception as e:
        logger.error(f"❌ Error accessing Origin header: {e} - blocking connection")
        return False  # SECURITY: Fail closed on error

    if not origin:
        if ALLOW_NO_ORIGIN:
            logger.warning("⚠️ No Origin header - allowing (ALLOW_NO_ORIGIN=true)")
            return True
        else:
            logger.error("❌ No Origin header - blocking connection (set ALLOW_NO_ORIGIN=true to allow)")
            return False  # SECURITY: Fail closed when no origin

    if origin not in ALLOWED_ORIGINS:
        logger.error(f"❌ Blocked connection from unauthorized origin: {origin}")
        logger.info(f"   Allowed origins: {', '.join(ALLOWED_ORIGINS)}")
        return False

    logger.info(f"✅ Origin validated: {origin}")
    return True


async def cleanup_rate_limiter():
    """Periodically clean up old rate limiter entries to prevent memory leak."""
    while True:
        try:
            await asyncio.sleep(RATE_LIMITER_CLEANUP_INTERVAL)
            now = time()
            old_size = len(connection_attempts)

            # Remove IPs with no recent attempts
            ips_to_remove = [
                ip for ip, attempts in connection_attempts.items()
                if not attempts or all(now - t > RATE_LIMIT_WINDOW_SECONDS for t in attempts)
            ]

            for ip in ips_to_remove:
                del connection_attempts[ip]

            cleaned = old_size - len(connection_attempts)
            if cleaned > 0:
                logger.info(f"🧹 Cleaned up {cleaned} old IP entries from rate limiter")

        except Exception as e:
            logger.error(f"Error in rate limiter cleanup: {e}")


async def handle_connection(websocket: WebSocketServerProtocol) -> None:
    """Handle new WebSocket connection with security checks."""
    global active_connections

    client_addr = websocket.remote_address
    client_ip = client_addr[0] if client_addr else "unknown"

    # SECURITY: Check max concurrent connections
    if not connection_semaphore.locked():
        async with connection_semaphore:
            active_connections += 1
            try:
                await _handle_connection_inner(websocket, client_addr, client_ip)
            finally:
                active_connections -= 1
    else:
        logger.warning(f"❌ Max concurrent connections ({MAX_CONCURRENT_CONNECTIONS}) reached")
        await websocket.close(code=1008, reason="Server at capacity. Please try again later.")


async def _handle_connection_inner(websocket: WebSocketServerProtocol, client_addr, client_ip: str) -> None:
    """Inner connection handler with security checks."""
    logger.info("=" * 80)
    logger.info(f"🔌 New WebSocket connection from {client_addr}")
    logger.info(f"   Active connections: {active_connections}/{MAX_CONCURRENT_CONNECTIONS}")
    logger.info(f"   Active sessions: {get_active_session_count()}")
    logger.info("=" * 80)

    # SECURITY: Check rate limiting
    if not check_rate_limit(client_ip):
        logger.warning(f"❌ Rate limit exceeded for {client_ip}")
        await websocket.close(code=1008, reason="Rate limit exceeded. Please try again later.")
        return

    # SECURITY: Validate origin
    if not await validate_origin(websocket):
        logger.warning(f"❌ Unauthorized origin for connection from {client_ip}")
        await websocket.close(code=1008, reason="Unauthorized origin")
        return

    try:
        # Handle the client connection
        await handle_client(websocket)
    except Exception as e:
        logger.error(f"Error handling connection: {e}")
        import traceback
        traceback.print_exc()
    finally:
        logger.info("=" * 80)
        logger.info(f"🔚 Connection closed for {client_addr}")
        logger.info(f"   Active connections: {active_connections}/{MAX_CONCURRENT_CONNECTIONS}")
        logger.info(f"   Active sessions: {get_active_session_count()}")
        logger.info("=" * 80)


async def main() -> None:
    """Start the WebSocket server with graceful shutdown."""
    logger.info("=" * 80)
    logger.info(f"Starting Gemini Live Avatar Backend Server")
    logger.info(f"Host: {BACKEND_HOST}:{BACKEND_PORT}")
    logger.info(f"Debug mode: {DEBUG}")
    logger.info(f"Max concurrent connections: {MAX_CONCURRENT_CONNECTIONS}")
    logger.info(f"Architecture: SDK-based with modular components")

    # Environment detection
    if is_cloud_run():
        logger.info("🌩️  Environment: Google Cloud Run")
        logger.info(f"   Service: {os.getenv('K_SERVICE', 'unknown')}")
        logger.info(f"   Revision: {os.getenv('K_REVISION', 'unknown')}")
    else:
        logger.info("💻 Environment: Local Development")

    # Authentication status
    if is_auth_enabled():
        logger.info("🔒 Authentication: ENABLED (Firebase)")
        logger.info(f"   Project: {os.getenv('FIREBASE_PROJECT_ID', 'not set')}")
        # Initialize Firebase Auth
        try:
            get_auth_instance()
        except Exception as e:
            logger.error(f"Failed to initialize Firebase Auth: {e}")
            raise
    else:
        logger.info("🔓 Authentication: DISABLED (local dev mode)")

    # Security configuration
    logger.info(f"🔒 Allowed origins: {', '.join(ALLOWED_ORIGINS) if ALLOWED_ORIGINS else 'NONE SET!'}")
    logger.info(f"   Allow no origin: {ALLOW_NO_ORIGIN}")
    if is_cloud_run() and not ALLOWED_ORIGINS:
        logger.warning("⚠️  WARNING: No allowed origins set in Cloud Run!")
        logger.warning("   Set ALLOWED_ORIGINS or FIREBASE_PROJECT_ID environment variable")

    logger.info("=" * 80)

    # Import config to initialize (once at startup)
    from config import api_config
    await api_config.initialize()

    logger.info("✅ API Configuration loaded")
    logger.info("   Gemini API: Google AI Developer API (API Key)")
    logger.info("=" * 80)

    # Start background tasks
    cleanup_task = asyncio.create_task(cleanup_rate_limiter())

    from core.session import cleanup_timed_out_sessions
    session_timeout_task = asyncio.create_task(cleanup_timed_out_sessions())

    # Start health check server
    from core.health_check import start_health_check_server
    HEALTH_CHECK_PORT = int(os.getenv("HEALTH_CHECK_PORT", "8081"))
    health_runner = await start_health_check_server(HEALTH_CHECK_PORT)

    async with websockets.serve(
        handle_connection,
        BACKEND_HOST,
        BACKEND_PORT,
        ping_interval=20,
        ping_timeout=10,
        max_size=MAX_MESSAGE_SIZE
    ):
        logger.info(f"✅ WebSocket server running on {BACKEND_HOST}:{BACKEND_PORT}")
        logger.info("   Ready to accept connections")
        logger.info("=" * 80)

        try:
            # Run forever
            await asyncio.Future()
        finally:
            # Graceful shutdown
            logger.info("=" * 80)
            logger.info("🛑 Initiating graceful shutdown...")
            logger.info("=" * 80)

            # Cancel background tasks
            cleanup_task.cancel()
            session_timeout_task.cancel()

            try:
                await cleanup_task
            except asyncio.CancelledError:
                pass

            try:
                await session_timeout_task
            except asyncio.CancelledError:
                pass

            # Stop health check server
            try:
                await health_runner.cleanup()
                logger.info("Health check server stopped")
            except Exception as e:
                logger.error(f"Error stopping health check server: {e}")

            # Clean up all sessions
            from core.session import list_sessions
            sessions = await list_sessions()
            logger.info(f"Cleaning up {len(sessions)} active sessions...")

            # Note: Gemini sessions are now managed by async with context managers
            # in handle_client(). They will be automatically closed when connections end.
            # No need to manually close them here.

            logger.info("✅ Graceful shutdown complete")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("\n🛑 Server shutdown requested (KeyboardInterrupt)")
    except Exception as e:
        logger.error(f"❌ Fatal error: {e}")
        import traceback
        traceback.print_exc()
        raise
