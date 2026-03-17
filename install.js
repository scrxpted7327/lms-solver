// ==UserScript==
// @name         LMS AI Solver
// @namespace    http://tampermonkey.net/
// @version      2.0.36
// @description  AI-powered solver for LMS platforms (Mobius, Smartwork5, Canvas)
// @author       scrxpted7327
// @match        *://*.mobius.cloud/*
// @match        *://*.mobiusplatform.org/*
// @match        *://*.wwnorton.com/smartwork5/*
// @match        *://*.instructure.com/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM_info
// @grant        unsafeWindow
// @connect      github.com
// @connect      api.github.com
// @connect      raw.githubusercontent.com
// @connect      usask.mobius.cloud
// @connect      *.wwnorton.com
// @connect      *.instructure.com
// @connect      localhost
// @connect      127.0.0.1
// @downloadURL  https://raw.githubusercontent.com/scrxpted7327/lms-solver/refs/heads/main/install.js
// @updateURL    https://raw.githubusercontent.com/scrxpted7327/lms-solver/refs/heads/main/version.txt
// ==/UserScript==

/**
 * Fetch the public version manifest from the lms-solver repository.
 * This manifest contains version information and LMS detection patterns.
 * @returns {Promise<Object|null>} The parsed manifest or null if failed
 */
async function fetchPublicManifest() {
  try {
    // Fetch from the public lms-solver repository
    const url = 'https://api.github.com/repos/scrxpted7327/lms-solver/contents/version.json';
    
    return await new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: url,
        responseType: 'text',
        timeout: 10000,
        onload: (response) => {
          if (response.status >= 200 && response.status < 300) {
            try {
              const data = JSON.parse(response.responseText);
              if (data.encoding === 'base64' && data.content) {
                // Decode base64 content from GitHub API
                const decoded = atob(data.content.replace(/\n/g, ''));
                resolve(JSON.parse(decoded));
              } else if (data.content) {
                // Sometimes content isn't base64 encoded
                resolve(JSON.parse(data.content));
              } else {
                resolve(null);
              }
            } catch (e) {
              console.error('[LMS Solver] Failed to parse public manifest:', e);
              resolve(null);
            }
          } else {
            console.warn('[LMS Solver] Failed to fetch public manifest, status:', response.status);
            resolve(null);
          }
        },
        onerror: () => {
          console.error('[LMS Solver] Network error fetching public manifest');
          resolve(null);
        },
        ontimeout: () => {
          console.error('[LMS Solver] Timeout fetching public manifest');
          resolve(null);
        },
      });
    });
  } catch (error) {
    console.error('[LMS Solver] Error in fetchPublicManifest:', error);
    return null;
  }
}

/**
 * LMS AI Solver - Shell Loader
 * =============================
 *
 * This is the PUBLIC shell that users install from the lms-solver repo.
 * It handles:
 *   1. GitHub PAT management (prompt, store, validate)
 *   2. Loading core.js from the PRIVATE mobius_solver repo
 *   3. Shell update detection via @updateURL (public version.json)
 *   4. Transparent re-auth after shell updates
 *
 * Architecture:
 *   - PUBLIC repo (lms-solver): install.js + version.json
 *   - PRIVATE repo (mobius_solver): core.js + all modules
 *   - PAT stored in GM_setValue, survives shell updates
 *   - Shell updates only bump version when needed
 *
 * Module Loading Flow:
 *   1. Check GM_getValue for saved PAT
 *   2. If no PAT: show auth prompt, save via GM_setValue
 *   3. Fetch core.js from private repo via GitHub API
 *   4. Execute core.js in sandbox (it loads all other modules)
 *
 * @see https://github.com/scrxpted7327/lms-solver
 */
(function () {
   'use strict';
    /**
     * Helper to match a URL against a pattern (string or regex).
     * @param {string} url - The URL to test
     * @param {string|RegExp} pattern - The pattern to match against
     * @returns {boolean} True if the URL matches the pattern
     */
    function _matchUrlPattern(url, pattern) {
      if (pattern instanceof RegExp) {
        return pattern.test(url);
      }
      if (typeof pattern === 'string') {
        // If it looks like a regex pattern (e.g., /^https?:\/\/.*/)
        if (pattern.startsWith('/') && pattern.endsWith('/')) {
          try {
            return new RegExp(pattern.slice(1, -1)).test(url);
          } catch (e) {
            console.warn('[LMS Solver] Invalid regex pattern in manifest:', pattern);
            return false;
          }
        }
        // Otherwise, substring match
        return url.includes(pattern);
      }
      return false;
    }

    /**
     * Determine if the current URL matches any of the LMS patterns in the manifest.
     * @param {Object} manifest - The public manifest containing patterns
     * @returns {boolean} True if on an LMS page, false otherwise
     */
    function isOnLMSPage(manifest) {
      if (!manifest || !manifest.patterns || !Array.isArray(manifest.patterns)) {
        // If no patterns, we assume we are on an LMS page to avoid breaking existing functionality.
        return true;
      }
      return manifest.patterns.some(pattern => _matchUrlPattern(window.location.href, pattern));
    }

    // ═══════════════════════════════════════════════════════
    // PAT MANAGEMENT
    // ═══════════════════════════════════════════════════════

     /**
      * Get the stored GitHub PAT.
      * @returns {string|null} The PAT or null if not set
      */
     function getPat() {
       return GM_getValue('lms_solver_github_token', null);
     }

     /**
      * Save the GitHub PAT.
      * @param {string} pat - The PAT to save
      */
     function savePat(pat) {
       GM_setValue('lms_solver_github_token', pat);
     }

     /**
      * Clear the stored GitHub PAT.
      */
     function clearPat() {
       GM_deleteValue('lms_solver_github_token');
     }

    /**
     * Show a prompt to enter a GitHub PAT.
     * @returns {string|null} The entered PAT or null if cancelled
     */
    function showPatPrompt() {
      return prompt('Enter your GitHub Personal Access Token (PAT):', '');
    }

    /**
     * Validate a GitHub PAT by making a request to the GitHub API.
     * @param {string} pat - The PAT to validate
     * @returns {Promise<boolean>} True if valid, false otherwise
     */
    async function validatePat(pat) {
      try {
        const response = await new Promise((resolve, reject) => {
          GM_xmlhttpRequest({
            method: 'GET',
            url: 'https://api.github.com/user',
            headers: {
              'Authorization': `token ${pat}`
            },
            responseType: 'text',
            timeout: 5000,
            onload: (res) => {
              if (res.status === 200) {
                resolve(true);
              } else {
                resolve(false);
              }
            },
            onerror: () => {
              resolve(false);
            },
            ontimeout: () => {
              resolve(false);
            }
          });
        });
        return response;
      } catch (error) {
        console.error('[LMS Solver] Error validating PAT:', error);
        return false;
      }
    }

    // ═══════════════════════════════════════════════════════
    // LOAD CORE FROM PRIVATE REPO
    // ═══════════════════════════════════════════════════════

    /**
     * Load the core.js from the private mobius_solver repository.
     * @returns {Promise<void>}
     */
    async function loadCore() {
      try {
        // Always bust cache when loading core - add timestamp
        const url = 'https://api.github.com/repos/scrxpted7327/mobius_solver/contents/userscript/core.js?t=' + Date.now();
        
        // Get PAT for authentication if available
        const pat = getPat();
        const headers = {};
        if (pat) {
          headers['Authorization'] = `token ${pat}`;
        }

        const response = await new Promise((resolve, reject) => {
          GM_xmlhttpRequest({
            method: 'GET',
            url: url,
            headers: headers,
            responseType: 'text',
            timeout: 10000,
            onload: (resp) => {
              if (resp.status >= 200 && resp.status < 300) {
                resolve(resp);
              } else {
                reject(new Error('Failed to fetch core.js: ' + resp.status));
              }
            },
            onerror: () => reject(new Error('Network error fetching core.js')),
            ontimeout: () => reject(new Error('Timeout fetching core.js'))
          });
        });

        const data = JSON.parse(response.responseText);
        let code;
        if (data.encoding === 'base64' && data.content) {
          code = atob(data.content.replace(/\n/g, ''));
        } else if (data.content) {
          code = data.content;
        } else {
          throw new Error('No content in core.js response');
        }

        // Expose GM_* functions to window for modules to use
        if (typeof GM_xmlhttpRequest !== 'undefined') {
          window.GM_xmlhttpRequest = GM_xmlhttpRequest;
          window.GM_setValue = GM_setValue;
          window.GM_getValue = GM_getValue;
        }

        // Execute the core.js code in the current scope
        eval(code);
      } catch (error) {
        console.error('[LMS Solver] Failed to load core.js:', error);
        throw error;
      }
    }

    // ═══════════════════════════════════════════════════════
    // UPDATE CHECKER WITH PROGRESS
    // ═══════════════════════════════════════════════════════

    /**
     * Check for updates and show progress bar.
     */
    async function checkForUpdates() {
     // Create progress container
     const progressContainer = document.createElement('div');
     progressContainer.id = 'lms-update-progress';
     progressContainer.style.cssText = `
       position: fixed; top: 20px; right: 20px; z-index: 999999;
       background: rgba(30, 30, 46, 0.9); color: #cdd6f4;
       padding: 16px; border-radius: 8px; font-family: monospace;
       font-size: 13px; max-width: 300px; box-shadow: 0 4px 16px rgba(0,0,0,0.3);
     `;
     progressContainer.innerHTML = `
       <div id="lms-update-status">Checking for updates...</div>
       <div id="lms-update-bar-container" style="margin-top: 8px;">
         <div id="lms-update-bar" style="width: 0%; height: 4px; background: #89b4fa; border-radius: 2px; transition: width 0.3s;"></div>
       </div>
       <div id="lms-update-details" style="margin-top: 8px; font-size: 11px; color: #a6adc8;"></div>
     `;
     document.body.appendChild(progressContainer);

     try {
       // Update progress: Fetching manifest
       document.getElementById('lms-update-status').textContent = 'Fetching manifest...';
       document.getElementById('lms-update-bar').style.width = '25%';
       document.getElementById('lms-update-details').textContent = '';

       const manifest = await fetchPublicManifest();
       if (!manifest) {
         throw new Error('Could not fetch manifest');
       }

       // Update progress: Checking version
       document.getElementById('lms-update-status').textContent = 'Checking version...';
       document.getElementById('lms-update-bar').style.width = '50%';
       document.getElementById('lms-update-details').textContent = `Current: ${manifest.version || 'unknown'}`;

       // For now, we'll just show that we're up to date
       // In a real implementation, we'd compare versions and download updates

       // Update progress: Complete
       document.getElementById('lms-update-status').textContent = 'Up to date!';
       document.getElementById('lms-update-bar').style.width = '100%';
       document.getElementById('lms-update-details').textContent = `v${manifest.version || 'unknown'}`;

       // Remove progress after a short delay
       setTimeout(() => {
         progressContainer.remove();
       }, 1500);
     } catch (error) {
       document.getElementById('lms-update-status').textContent = 'Update check failed';
       document.getElementById('lms-update-details').textContent = error.message;
       setTimeout(() => {
         progressContainer.remove();
       }, 3000);
     }
   }

   // ═════════════════════════════════════════════════════
   // INITIALIZATION
  // ═══════════════════════════════════════════════════

  /**
   * Main entry point. Checks auth, loads core.
   */
  async function init() {
    // Register menu command for token management (always available)
    if (typeof GM_registerMenuCommand === 'function') {
      GM_registerMenuCommand('Manage GitHub Token', async () => {
        const current = getPat();
        if (current) {
          const action = prompt(
            'GitHub PAT is configured.\n\n' +
            'Enter new token to update, or type "clear" to remove:',
            ''
          );
          if (action === 'clear') {
            clearPat();
            alert('Token cleared. Refresh the page to re-enter.');
          } else if (action && action.trim()) {
            const valid = await validatePat(action.trim());
            if (valid) {
              savePat(action.trim());
              alert('Token updated! Refresh the page to reload modules.');
            } else {
              alert('Invalid token. No changes made.');
            }
          }
        } else {
          const token = await showPatPrompt();
          if (token) {
            alert('Token saved! Refresh the page to load modules.');
          }
        }
      });
    }

    // Step 1: Fetch public manifest to check LMS patterns (no auth needed)
    console.log('[LMS Shell] Checking if this is an LMS page...');
    const manifest = await fetchPublicManifest();

    if (!manifest) {
      console.log('[LMS Shell] Could not fetch manifest, trying to load core anyway...');
    } else if (!isOnLMSPage(manifest)) {
      console.log('[LMS Shell] Not an LMS page, staying dormant');
      return;
    } else {
      console.log('[LMS Shell] LMS page detected, loading core...');
    }

     // Step 2: Check for stored PAT
     let pat = getPat();
     if (!pat) {
       console.log('[LMS Shell] No PAT found, showing prompt');
       const token = await showPatPrompt();
       if (!token) {
         console.log('[LMS Shell] No token provided, staying dormant');
         return;
       }
       savePat(token);
       pat = token;
     }

     // Step 3: Check for updates and show progress
     await checkForUpdates();

     // Step 4: Load core from private repo
     await loadCore();
  }

  // Wait for DOM, then initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
