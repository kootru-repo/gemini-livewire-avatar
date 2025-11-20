/**
 * Firebase Authentication Module
 * Handles user authentication for cloud deployment
 * In local dev (firebase.enabled=false), auth is bypassed
 */

class FirebaseAuthManager {
    constructor() {
        this.user = null;
        this.idToken = null;
        this.config = null;
        this.auth = null;
        this.provider = null;
        this.enabled = false;
        this.onAuthStateChangedCallback = null;
    }

    /**
     * Initialize Firebase Auth from config
     * @param {Object} config - Firebase configuration from config.json
     */
    async initialize(config) {
        this.config = config.firebase;
        this.enabled = config.firebase?.enabled !== false;

        if (!this.enabled) {
            console.log('🔓 Firebase Auth disabled (local development mode)');
            return;
        }

        if (!this.config || !this.config.apiKey) {
            console.error('❌ Firebase configuration missing in config.json');
            throw new Error('Firebase configuration required');
        }

        try {
            // Initialize Firebase
            const firebaseConfig = {
                apiKey: this.config.apiKey,
                authDomain: this.config.authDomain,
                projectId: this.config.projectId,
                appId: this.config.appId
            };

            firebase.initializeApp(firebaseConfig);
            this.auth = firebase.auth();
            this.provider = new firebase.auth.GoogleAuthProvider();

            // Set up auth state observer
            this.auth.onAuthStateChanged(async (user) => {
                this.user = user;

                if (user) {
                    // User signed in
                    console.log(`✅ User authenticated: ${user.email}`);
                    this.idToken = await user.getIdToken();

                    if (this.onAuthStateChangedCallback) {
                        this.onAuthStateChangedCallback(user);
                    }
                } else {
                    // User signed out
                    console.log('🔓 User signed out');
                    this.idToken = null;

                    if (this.onAuthStateChangedCallback) {
                        this.onAuthStateChangedCallback(null);
                    }
                }
            });

            console.log('✅ Firebase Auth initialized');

        } catch (error) {
            console.error('❌ Firebase initialization failed:', error);
            throw error;
        }
    }

    /**
     * Sign in with Google
     */
    async signInWithGoogle() {
        if (!this.enabled) {
            console.log('Auth disabled, skipping sign-in');
            return { email: 'dev@localhost', displayName: 'Local Dev User' };
        }

        try {
            const result = await this.auth.signInWithPopup(this.provider);
            this.user = result.user;
            this.idToken = await result.user.getIdToken();
            console.log(`✅ Signed in as: ${this.user.email}`);
            return this.user;
        } catch (error) {
            console.error('❌ Sign-in failed:', error);
            throw error;
        }
    }

    /**
     * Sign out
     */
    async signOut() {
        if (!this.enabled) {
            return;
        }

        try {
            await this.auth.signOut();
            this.user = null;
            this.idToken = null;
            console.log('✅ Signed out successfully');
        } catch (error) {
            console.error('❌ Sign-out failed:', error);
            throw error;
        }
    }

    /**
     * Get current Firebase ID token
     * @param {boolean} forceRefresh - Force token refresh
     * @returns {Promise<string|null>} ID token or null if not authenticated
     */
    async getIdToken(forceRefresh = false) {
        if (!this.enabled) {
            return null; // No token needed in local dev
        }

        if (!this.user) {
            return null;
        }

        try {
            this.idToken = await this.user.getIdToken(forceRefresh);
            return this.idToken;
        } catch (error) {
            console.error('❌ Failed to get ID token:', error);
            return null;
        }
    }

    /**
     * Check if user is authenticated
     * @returns {boolean}
     */
    isAuthenticated() {
        if (!this.enabled) {
            return true; // Always authenticated in local dev
        }

        return this.user !== null;
    }

    /**
     * Get current user info
     * @returns {Object|null}
     */
    getCurrentUser() {
        if (!this.enabled) {
            return {
                email: 'dev@localhost',
                displayName: 'Local Dev User',
                uid: 'local-dev-uid'
            };
        }

        if (!this.user) {
            return null;
        }

        return {
            email: this.user.email,
            displayName: this.user.displayName,
            photoURL: this.user.photoURL,
            uid: this.user.uid
        };
    }

    /**
     * Set callback for auth state changes
     * @param {Function} callback - Function to call on auth state change
     */
    onAuthStateChanged(callback) {
        this.onAuthStateChangedCallback = callback;
    }

    /**
     * Show sign-in UI (redirect to login page or show modal)
     */
    showSignInUI() {
        if (!this.enabled) {
            console.log('Auth disabled, no sign-in UI needed');
            return;
        }

        // For simplicity, trigger sign-in immediately
        // In production, you might want to show a proper UI
        this.signInWithGoogle().catch(error => {
            console.error('Sign-in failed:', error);
            alert('Sign-in failed. Please try again.');
        });
    }
}

// Create global instance
window.authManager = new FirebaseAuthManager();

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FirebaseAuthManager;
}
