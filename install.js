// ==UserScript==
// @name         LMS AI Solver
// @version      2.0.5
// @description  AI-powered solver for Mobius, Smartwork5, Canvas, and other LMS platforms
// @namespace    http://tampermonkey.net/
// @author       scrxpted7327
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_addElement
// @grant        unsafeWindow
// @connect      api.github.com
// @connect      raw.githubusercontent.com
// @connect      localhost
// @run-at       document-idle
// @homepage     https://github.com/scrxpted7327/lms-solver
// @supportURL   https://github.com/scrxpted7327/lms-solver/issues
// @updateURL    https://raw.githubusercontent.com/scrxpted7327/lms-solver/refs/heads/main/version.txt
// @downloadURL  https://raw.githubusercontent.com/scrxpted7327/lms-solver/refs/heads/main/install.js
// ==/UserScript==

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

  // ═══════════════════════════════════════════════════
  // CONFIGURATION
  // ═══════════════════════════════════════════════════

  /** Private repo containing the actual implementation */
  const PRIVATE_REPO = 'scrxpted7327/mobius_solver';
  const PRIVATE_BRANCH = 'main';

  /** GitHub API endpoint for private repo content */
  const GH_API_BASE = `https://api.github.com/repos/${PRIVATE_REPO}/contents/userscript/`;

  /** Storage keys */
  const KEY_PAT = 'lms_solver_github_token';
  const KEY_MODULES = 'lms_solver_modules_';
  const KEY_SHELL_VERSION = 'lms_solver_shell_version';

  /** Cache TTL: 24 hours */
  const CACHE_TTL = 86400000;

  /** Request timeout: 30 seconds */
  const FETCH_TIMEOUT = 30000;

  // ═══════════════════════════════════════════════════
  // TOKEN MANAGEMENT
  // ═══════════════════════════════════════════════════

  /**
   * Get stored GitHub Personal Access Token.
   * @returns {string|null} Token or null
   */
  function getPat() {
    try {
      return GM_getValue(KEY_PAT, null);
    } catch (e) {
      return null;
    }
  }

  /**
   * Save GitHub PAT to persistent storage.
   * @param {string} token - Personal Access Token
   */
  function savePat(token) {
    GM_setValue(KEY_PAT, token);
  }

  /**
   * Clear stored PAT.
   */
  function clearPat() {
    GM_setValue(KEY_PAT, null);
  }

  /**
   * Get auth headers for GitHub API requests.
   * @returns {Object} Headers object
   */
  function getAuthHeaders() {
    const pat = getPat();
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
    };
    if (pat) {
      headers['Authorization'] = `token ${pat}`;
    }
    return headers;
  }

  // ═══════════════════════════════════════════════════
  // GITHUB API
  // ═══════════════════════════════════════════════════

  /**
   * Fetch a file from the private repo via GitHub API.
   * Decodes base64 content from the API response.
   *
   * @param {string} path - File path relative to userscript/
   * @param {boolean} useCache - Whether to use cached content
   * @returns {Promise<string>} File content
   */
  async function fetchFromPrivateRepo(path, useCache = true) {
    // Check cache first
    if (useCache) {
      const cached = GM_getValue(KEY_MODULES + path, null);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        console.log(`[LMS Shell] Using cached: ${path}`);
        return cached.content;
      }
    }

    const url = GH_API_BASE + path + `?ref=${PRIVATE_BRANCH}&t=${Date.now()}`;
    console.log(`[LMS Shell] Fetching: ${path}`);

    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: url,
        headers: getAuthHeaders(),
        timeout: FETCH_TIMEOUT,
        onload: function (response) {
          if (response.status === 200) {
            try {
              const data = JSON.parse(response.responseText);
              const content = atob(data.content.replace(/[\r\n]/g, ''));
              // Cache the result
              GM_setValue(KEY_MODULES + path, {
                content: content,
                timestamp: Date.now(),
              });
              resolve(content);
            } catch (e) {
              reject(new Error(`Failed to decode ${path}: ${e.message}`));
            }
          } else if (response.status === 401) {
            reject(new Error('Invalid GitHub token. Please re-enter your PAT.'));
          } else if (response.status === 403) {
            reject(new Error('Token lacks repo scope. Create a new PAT with "repo" scope.'));
          } else if (response.status === 404) {
            reject(new Error(`File not found: ${path}. Check repo access.`));
          } else {
            reject(new Error(`HTTP ${response.status} fetching ${path}`));
          }
        },
        onerror: function () {
          reject(new Error(`Network error fetching ${path}`));
        },
        ontimeout: function () {
          reject(new Error(`Timeout fetching ${path}`));
        },
      });
    });
  }

  /**
   * Validate a GitHub PAT by making a test API call.
   * @param {string} token - PAT to validate
   * @returns {Promise<boolean>} True if valid
   */
  async function validatePat(token) {
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: `https://api.github.com/repos/${PRIVATE_REPO}`,
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `token ${token}`,
        },
        timeout: 10000,
        onload: function (response) {
          resolve(response.status === 200);
        },
        onerror: function () {
          resolve(false);
        },
        ontimeout: function () {
          resolve(false);
        },
      });
    });
  }

  // ═══════════════════════════════════════════════════
  // AUTH PROMPT UI
  // ═══════════════════════════════════════════════════

  /**
   * Show a modal prompting the user to enter their GitHub PAT.
   * @returns {Promise<string|null>} The entered token or null if cancelled
   */
  function showPatPrompt() {
    return new Promise((resolve) => {
      // Remove any existing prompt
      const existing = document.getElementById('lms_pat_prompt');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.id = 'lms_pat_prompt';
      overlay.innerHTML = `
        <div style="
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.7); z-index: 999999;
          display: flex; align-items: center; justify-content: center;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        ">
          <div style="
            background: #1e1e2e; color: #cdd6f4; padding: 24px;
            border-radius: 12px; max-width: 480px; width: 90%;
            box-shadow: 0 8px 32px rgba(0,0,0,0.4);
          ">
            <h2 style="margin: 0 0 8px; color: #89b4fa; font-size: 18px;">
              🔐 GitHub Authentication Required
            </h2>
            <p style="margin: 0 0 16px; color: #a6adc8; font-size: 14px; line-height: 1.5;">
              LMS AI Solver loads modules from a private GitHub repository.
              Please enter your Personal Access Token (PAT) with <code style="color: #f9e2af;">repo</code> scope.
            </p>
            <p style="margin: 0 0 12px; font-size: 12px; color: #6c7086;">
              Create one at: <a href="https://github.com/settings/tokens/new?scopes=repo"
              target="_blank" style="color: #89b4fa;">github.com/settings/tokens</a>
            </p>
            <input type="password" id="lms_pat_input" placeholder="ghp_xxxxxxxxxxxxxxxxxxxx" style="
              width: 100%; padding: 10px 12px; border: 1px solid #45475a;
              border-radius: 6px; background: #313244; color: #cdd6f4;
              font-size: 14px; box-sizing: border-box; margin-bottom: 12px;
            ">
            <div id="lms_pat_status" style="
              font-size: 12px; margin-bottom: 12px; min-height: 18px;
            "></div>
            <div style="display: flex; gap: 8px; justify-content: flex-end;">
              <button id="lms_pat_cancel" style="
                padding: 8px 16px; border: 1px solid #45475a; border-radius: 6px;
                background: transparent; color: #cdd6f4; cursor: pointer;
                font-size: 14px;
              ">Cancel</button>
              <button id="lms_pat_save" style="
                padding: 8px 16px; border: none; border-radius: 6px;
                background: #89b4fa; color: #1e1e2e; cursor: pointer;
                font-size: 14px; font-weight: 600;
              ">Save Token</button>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      const input = document.getElementById('lms_pat_input');
      const status = document.getElementById('lms_pat_status');
      const saveBtn = document.getElementById('lms_pat_save');
      const cancelBtn = document.getElementById('lms_pat_cancel');

      input.focus();

      saveBtn.addEventListener('click', async () => {
        const token = input.value.trim();
        if (!token) {
          status.style.color = '#f38ba8';
          status.textContent = 'Please enter a token';
          return;
        }

        saveBtn.disabled = true;
        saveBtn.textContent = 'Validating...';
        status.style.color = '#a6adc8';
        status.textContent = 'Checking token access...';

        const valid = await validatePat(token);
        if (valid) {
          savePat(token);
          overlay.remove();
          resolve(token);
        } else {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Token';
          status.style.color = '#f38ba8';
          status.textContent = 'Invalid token or no access to private repo';
        }
      });

      cancelBtn.addEventListener('click', () => {
        overlay.remove();
        resolve(null);
      });

      // Enter key submits
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveBtn.click();
      });
    });
  }

  // ═══════════════════════════════════════════════════
  // LMS DETECTION (before core loads)
  // ═══════════════════════════════════════════════════

  /** Public repo for manifest/version checking (no auth needed) */
  const PUBLIC_REPO = 'scrxpted7327/lms-solver';
  const PUBLIC_BRANCH = 'refs/heads/main';
  const PUBLIC_MANIFEST_URL = `https://raw.githubusercontent.com/${PUBLIC_REPO}/${PUBLIC_BRANCH}/version.json`;

  /**
   * Fetch the public manifest to check LMS patterns.
   * This is called BEFORE requiring a PAT or loading core.
   *
   * @returns {Promise<Object|null>} Manifest or null
   */
  async function fetchPublicManifest() {
    // Cache bust with timestamp to avoid stale raw.githubusercontent.com cache
    const url = PUBLIC_MANIFEST_URL + '?t=' + Date.now();
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: url,
        cache: 'no-cache',
        timeout: 10000,
        onload: (resp) => {
          if (resp.status === 200) {
            try {
              resolve(JSON.parse(resp.responseText));
            } catch (e) {
              console.warn('[LMS Shell] Failed to parse manifest:', e.message);
              resolve(null);
            }
          } else {
            resolve(null);
          }
        },
        onerror: () => resolve(null),
        ontimeout: () => resolve(null),
      });
    });
  }

  /**
   * Check if current page matches any LMS URL pattern.
   *
   * @param {Object} manifest - Version manifest with lms config
   * @returns {boolean}
   */
  function isOnLMSPage(manifest) {
    if (!manifest || !manifest.lms) return false;
    const url = window.location.href.toLowerCase();
    const urlPatterns = manifest.lms.url_patterns || {};

    for (const [, patterns] of Object.entries(urlPatterns)) {
      for (const pattern of patterns) {
        const regexStr = pattern
          .toLowerCase()
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '.*');
        if (new RegExp(`^${regexStr}$`).test(url)) {
          return true;
        }
      }
    }
    return false;
  }

  // ═══════════════════════════════════════════════════
  // CORE LOADER
  // ═══════════════════════════════════════════════════

  /**
   * Load and execute core.js from the private repo.
   * Uses multiple execution strategies to handle CSP restrictions.
   */
  async function loadCore() {
    console.log('[LMS Shell] Loading core from private repo...');

    try {
      const coreCode = await fetchFromPrivateRepo('core.js');

      // Expose GM_* functions to page context via unsafeWindow
      // core.js will read them from window.__GM_* when running in page context
      unsafeWindow.__GM_xmlhttpRequest = GM_xmlhttpRequest;
      unsafeWindow.__GM_setValue = GM_setValue;
      unsafeWindow.__GM_getValue = GM_getValue;
      unsafeWindow.__GM_registerMenuCommand = GM_registerMenuCommand;

      // Use GM_addElement to inject script - bypasses CSP restrictions
      // This is Tampermonkey's privileged injection method
      try {
        GM_addElement('script', {
          textContent: coreCode,
        });
        console.log('[LMS Shell] Core injected via GM_addElement (CSP-safe)');
        return;
      } catch (gmErr) {
        console.warn('[LMS Shell] GM_addElement failed:', gmErr.message);
      }

      // Fallback: direct eval (works in TM sandbox on pages without strict CSP)
      try {
        eval(coreCode); // eslint-disable-line no-eval
        console.log('[LMS Shell] Core loaded via eval()');
        return;
      } catch (evalErr) {
        console.warn('[LMS Shell] eval() failed:', evalErr.message);
      }

      showError('Could not execute core.js. Please report this issue.');
    } catch (e) {
      console.error('[LMS Shell] Failed to load core:', e);

      if (e.message.includes('token') || e.message.includes('401') || e.message.includes('403')) {
        clearPat();
        showError('Authentication failed. Refresh to re-enter token.');
      } else {
        showError(e.message);
      }
    }
  }

  /**
   * Show an error notification on the page.
   * @param {string} message - Error message
   */
  function showError(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed; bottom: 20px; right: 20px; z-index: 999999;
      background: #f38ba8; color: #1e1e2e; padding: 12px 20px;
      border-radius: 8px; font-family: monospace; font-size: 13px;
      max-width: 400px; box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    `;
    toast.textContent = 'LMS Solver: ' + message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 10000);
  }

  // ═══════════════════════════════════════════════════
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
    const pat = getPat();
    if (!pat) {
      console.log('[LMS Shell] No PAT found, showing prompt');
      const token = await showPatPrompt();
      if (!token) {
        console.log('[LMS Shell] No token provided, staying dormant');
        return;
      }
    }

    // Step 3: Load core from private repo
    await loadCore();
  }

  // Wait for DOM, then initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
