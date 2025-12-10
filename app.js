// ================================================================================================
// APP.JS - SINGLE ENTRY POINT (OPTIONAL - ALTERNATIVE TO INLINE SCRIPT)
// ================================================================================================

/**
 * Main application entry point
 * Handles module loading, lazy loading, and initialization
 */

let modulesLoaded = {
    config: false,
    utils: false,
    slots: false,
    lookup: false,
    signup: false
};

/**
 * Initialize the application
 */
async function initApp() {
    const startTime = performance.now();
    
    try {
        console.log('🚀 App starting...');
        
        // ✅ STEP 1: Load core modules in parallel (fastest)
        const [config, utils, slots] = await Promise.all([
            import('./config.js'),
            import('./utils.js'),
            import('./slots.js')
        ]);
        
        modulesLoaded.config = true;
        modulesLoaded.utils = true;
        modulesLoaded.slots = true;
        
        console.log('✅ Core modules loaded');
        
        // ✅ STEP 2: Wait for DOM if needed
        if (document.readyState === 'loading') {
            await new Promise(resolve => {
                document.addEventListener('DOMContentLoaded', resolve, { once: true });
            });
        }
        
        console.log('✅ DOM ready');
        
        // ✅ STEP 3: Initialize critical path (slots)
        await slots.loadSlots();
        console.log('✅ Slots loaded');
        
        // ✅ STEP 4: Setup lazy loading for non-critical modules
        setupLazyLoading();
        
        // ✅ STEP 5: Expose debug API
        exposeDebugAPI(config, slots);
        
        const loadTime = performance.now() - startTime;
        console.log(`🎉 App ready in ${loadTime.toFixed(0)}ms`);
        
        // Performance metrics
        if (performance.getEntriesByType) {
            const perfData = performance.getEntriesByType('navigation')[0];
            if (perfData) {
                console.log('📊 Performance:', {
                    DNS: `${perfData.domainLookupEnd - perfData.domainLookupStart}ms`,
                    TCP: `${perfData.connectEnd - perfData.connectStart}ms`,
                    Request: `${perfData.responseEnd - perfData.requestStart}ms`,
                    DOM: `${perfData.domComplete - perfData.domLoading}ms`,
                    Total: `${perfData.loadEventEnd - perfData.fetchStart}ms`
                });
            }
        }
        
    } catch (error) {
        console.error('❌ App initialization failed:', error);
        showInitError(error);
    }
}

/**
 * Setup lazy loading for non-critical modules
 */
function setupLazyLoading() {
    // Lazy load lookup module (only when user clicks)
    const lookupBtn = document.getElementById('lookupToggle');
    if (lookupBtn) {
        lookupBtn.addEventListener('click', async () => {
            if (!modulesLoaded.lookup) {
                console.log('📦 Lazy loading lookup...');
                const start = performance.now();
                
                await import('./lookup.js');
                modulesLoaded.lookup = true;
                
                console.log(`✅ Lookup loaded in ${(performance.now() - start).toFixed(0)}ms`);
            }
        }, { once: true, passive: true });
    }
    
    // Lazy load signup module (only when user selects a slot)
    window.addEventListener('showSignupForm', async () => {
        if (!modulesLoaded.signup) {
            console.log('📦 Lazy loading signup...');
            const start = performance.now();
            
            await import('./signup-frontend.js');
            modulesLoaded.signup = true;
            
            console.log(`✅ Signup loaded in ${(performance.now() - start).toFixed(0)}ms`);
        }
    }, { once: true });
    
    console.log('✅ Lazy loading configured');
}

/**
 * Expose debug API to window
 */
function exposeDebugAPI(config, slots) {
    window.__APP__ = {
        // State management
        getState: config.getStateSnapshot,
        resetState: config.resetAppState,
        
        // Slots
        loadSlots: slots.loadSlots,
        forceReload: slots.forceReloadSlots,
        
        // Selection
        getSelection: config.getSelectedSlots,
        clearSelection: slots.clearAllSelections,
        
        // Cache
        invalidateCache: config.invalidateCache,
        isCacheValid: config.isCacheValid,
        
        // Cleanup
        cleanup: () => {
            slots.cleanup();
            console.log('🧹 App cleaned up');
        },
        
        // Module status
        modules: () => modulesLoaded,
        
        // Performance
        perf: () => {
            if (performance.memory) {
                return {
                    memory: {
                        used: `${(performance.memory.usedJSHeapSize / 1048576).toFixed(2)}MB`,
                        total: `${(performance.memory.totalJSHeapSize / 1048576).toFixed(2)}MB`,
                        limit: `${(performance.memory.jsHeapSizeLimit / 1048576).toFixed(2)}MB`
                    },
                    timing: performance.timing
                };
            }
            return { message: 'Memory API not available' };
        }
    };
    
    console.log('💡 Debug API available at window.__APP__');
    console.log('💡 Try: __APP__.getState(), __APP__.perf()');
}

/**
 * Show initialization error to user
 */
function showInitError(error) {
    const loadingMsg = document.getElementById('loadingMsg');
    if (!loadingMsg) return;
    
    loadingMsg.innerHTML = `
        <div class="msg-box error" role="alert" style="text-align: center; padding: 20px;">
            <h3>⚠️ Failed to Load Application</h3>
            <p>An error occurred while initializing the booking system.</p>
            <details style="margin: 15px 0; text-align: left;">
                <summary style="cursor: pointer; font-weight: 600;">Error Details</summary>
                <pre style="background: #f8fafc; padding: 10px; border-radius: 4px; overflow-x: auto; margin-top: 10px; font-size: 12px;">${error.message}\n\n${error.stack}</pre>
            </details>
            <button onclick="location.reload()" class="btn secondary-btn" style="margin-top: 15px;">
                🔄 Refresh Page
            </button>
        </div>
    `;
}

// ================================================================================================
// START THE APP
// ================================================================================================

initApp();
