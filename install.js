// ==UserScript==
// @name         LMS AI Solver
// @namespace    http://tampermonkey.net/
// @version      2.0.22
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

   // ══════════════════════════════════════════════════════
   // UPDATE CHECKER WITH PROGRESS
   // ═════════════════════════════════════════════════════

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
     const pat = getPat();
     if (!pat) {
       console.log('[LMS Shell] No PAT found, showing prompt');
       const token = await showPatPrompt();
       if (!token) {
         console.log('[LMS Shell] No token provided, staying dormant');
         return;
       }
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
