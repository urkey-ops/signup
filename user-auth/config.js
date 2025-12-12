export const API_URL = '/api/user-auth';

// Session configuration
export const SESSION_CONFIG = {
    idleTimeout: 5 * 60 * 1000, // 5 minutes
    maxSession: 2 * 60 * 60 * 1000, // 2 hours
    checkInterval: 60 * 1000 // 1 minute
};
