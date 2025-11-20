"""
Firebase Authentication for Cloud Deployment
Verifies Firebase ID tokens from authenticated users
"""

import logging
import os
from typing import Optional, Dict
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

# Try to import Firebase Admin SDK (optional for local dev)
try:
    import firebase_admin
    from firebase_admin import credentials, auth
    FIREBASE_AVAILABLE = True
except ImportError:
    FIREBASE_AVAILABLE = False
    logger.warning("firebase-admin not installed - authentication disabled")


class FirebaseAuth:
    """
    Firebase Authentication handler for Cloud Run deployment.

    In local development, authentication is bypassed (REQUIRE_AUTH=false).
    In cloud production, verifies Firebase ID tokens from frontend.
    """

    def __init__(self):
        self.enabled = os.getenv("REQUIRE_AUTH", "false").lower() == "true"
        self.firebase_project_id = os.getenv("FIREBASE_PROJECT_ID", "")
        self.initialized = False

        # Session cache for verified tokens (avoid re-verification)
        self.token_cache: Dict[str, Dict] = {}
        self.cache_ttl = timedelta(minutes=5)

        if self.enabled:
            self._initialize_firebase()

    def _initialize_firebase(self):
        """Initialize Firebase Admin SDK."""
        if not FIREBASE_AVAILABLE:
            logger.error("Firebase Admin SDK not available but REQUIRE_AUTH=true")
            raise RuntimeError("firebase-admin package required for authentication")

        if not self.firebase_project_id:
            logger.error("FIREBASE_PROJECT_ID not set but REQUIRE_AUTH=true")
            raise ValueError("FIREBASE_PROJECT_ID environment variable required")

        try:
            # Cloud Run provides Application Default Credentials automatically
            # No need for service account JSON file
            if not firebase_admin._apps:
                firebase_admin.initialize_app(options={
                    'projectId': self.firebase_project_id
                })

            self.initialized = True
            logger.info(f"✅ Firebase Auth initialized for project: {self.firebase_project_id}")

        except Exception as e:
            logger.error(f"Failed to initialize Firebase Auth: {e}")
            raise

    async def verify_token(self, id_token: str) -> Optional[Dict]:
        """
        Verify Firebase ID token and return decoded claims.

        Args:
            id_token: Firebase ID token from client

        Returns:
            Dict with user claims if valid, None if invalid
            Example: {'uid': 'abc123', 'email': 'user@example.com', ...}
        """
        # If auth not enabled, allow all (local development)
        if not self.enabled:
            return {
                'uid': 'local-dev-user',
                'email': 'dev@localhost',
                'name': 'Local Development User'
            }

        # Check cache first
        if id_token in self.token_cache:
            cached = self.token_cache[id_token]
            if datetime.now() < cached['expires']:
                logger.debug("Token verified from cache")
                return cached['claims']
            else:
                # Cache expired, remove it
                del self.token_cache[id_token]

        # Verify token with Firebase
        try:
            decoded_token = auth.verify_id_token(id_token)

            # Cache the result
            self.token_cache[id_token] = {
                'claims': decoded_token,
                'expires': datetime.now() + self.cache_ttl
            }

            logger.info(f"✅ Token verified for user: {decoded_token.get('uid')}")
            return decoded_token

        except auth.InvalidIdTokenError:
            logger.warning("Invalid Firebase ID token")
            return None
        except auth.ExpiredIdTokenError:
            logger.warning("Expired Firebase ID token")
            return None
        except Exception as e:
            logger.error(f"Error verifying token: {e}")
            return None

    def extract_token_from_message(self, message: dict) -> Optional[str]:
        """
        Extract Firebase ID token from WebSocket message.

        Expected format:
        {
            "type": "auth",
            "token": "eyJhbGciOiJSUzI1NiIsImtpZCI..."
        }

        Or included in other messages:
        {
            "type": "audio",
            "data": "...",
            "auth_token": "eyJhbGciOiJSUzI1NiIsImtpZCI..."
        }
        """
        # Check for dedicated auth message
        if message.get('type') == 'auth':
            return message.get('token')

        # Check for token in other messages
        return message.get('auth_token')

    def cleanup_cache(self):
        """Remove expired tokens from cache."""
        now = datetime.now()
        expired = [token for token, data in self.token_cache.items()
                  if now >= data['expires']]

        for token in expired:
            del self.token_cache[token]

        if expired:
            logger.debug(f"Cleaned up {len(expired)} expired tokens from cache")


# Global instance
_auth_instance: Optional[FirebaseAuth] = None


def get_auth_instance() -> FirebaseAuth:
    """Get or create global FirebaseAuth instance."""
    global _auth_instance

    if _auth_instance is None:
        _auth_instance = FirebaseAuth()

    return _auth_instance


def is_auth_enabled() -> bool:
    """Check if authentication is enabled."""
    return os.getenv("REQUIRE_AUTH", "false").lower() == "true"


def is_cloud_run() -> bool:
    """Check if running in Cloud Run environment."""
    return os.getenv('K_SERVICE') is not None
