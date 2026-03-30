# GitHub Projects Overview

Generated: 2026-03-29

## Summary

You have **25 GitHub projects** cloned in `~/OneDrive/Documents/GitHub/`. These are a mix of personal utilities, educational projects, security tools, and game automation scripts.

---

## Project Categories

### AI & Automation
- **mobius_solver** - Multi-model AI pipeline for automated Mobius assessment solving using OpenRouter free models + Tampermonkey userscript
- **CanvasAI** - Canvas LMS integration tool (extract events, syllabi, API client)
- **Tools** - Collection of AI discovery and model testing scripts
- **lms-solver** - LMS solver utility
- **autoweb** - Web automation tool

### Music/Media
- **amazon-music-to-spotify** - Playlist migration tool
- **spotify_to_tidal** - Spotify to Tidal migration
- **tiktok-downloader** - TikTok content downloader

### Gaming & Bots
- **haydaybot** - Hay Day bot automation
- **VapeV4ForRoblox** - Roblox mod/exploit
- **moses** - Rust-based NTFS testing tool

### Security & Scripting
- **XSStrike** - XSS vulnerability scanner (security testing)
- **Userscripts** - Browser automation scripts (AutoLogin, CoffeeShop)
- **osint** - OSINT toolkit
- **cell_plan_scraper** - Data scraping utility

### Educational
- **University** - University coursework/projects
- **cs30** - CS 30 course (JavaScript sketches)
- **python** - Python learning/projects
- **revanced-patches** - ReVanced patches (YouTube mods)

### Other
- **KeyboxChecker** - Keybox utility
- **WiFi** - WiFi-related tool
- **markets** - Market/trading tool (Tailwind config, no remote)
- **New folder** - Empty placeholder
- **archive** - Not a repo

---

## Detailed Project Breakdown

### 🔴 PRIORITY: mobius_solver
**Location:** `/GitHub/mobius_solver`  
**Remote:** https://github.com/scrxpted7327/mobius_solver.git  
**Language:** Python (Flask backend) + JavaScript (Tampermonkey userscript)  
**Purpose:** Automated solving of Mobius LMS assessment questions

**Key Files:**
- `server.py` - Flask API server (port 5055)
- `main.py` - CLI entry point
- `lib/multi_model_client.py` - Two-stage AI pipeline (classifier + solver)
- `lib/gemini_api_client.py` - LLM integration
- `lib/hybrid_solver.py` - Hybrid solving strategy
- `userscript/` - Tampermonkey browser extension
- `requirements.txt` - Dependencies (Flask, OpenRouter, Pillow)

**Architecture:**
1. **Stage 1:** Classifier (Nemotron VL) analyzes problem type
2. **Stage 2:** Routes to specialized solver (Trinity Mini/Large or Nemotron 3 Nano)
3. **UI Integration:** Tampermonkey script injects "SOLVE" button into Mobius pages
4. **API:** OpenRouter (free models) with configurable model routing

**Current State:**
- Last updated: Mar 27, 2026
- DOM snapshots: Recent captures from MATH 134 course (Mar 20)
- Solve logs: Extensive logging from recent test runs
- Test files: `e2e_test.py`, `integration_test.py`, `test_hybrid_solver.py`
- Documentation: Multiple guides (QUICKSTART, SETUP, INTEGRATION_GUIDE)

**Configuration:**
- Requires OpenRouter API key (free models available with credits)
- WebSocket progress server (port 8766)
- Configurable delay, auto-fill, auto-submit behavior

---

### Other Notable Projects

**CanvasAI** (Mar 26)
- Extracts course info from Canvas LMS
- Python Flask backend for Canvas API integration

**Tools** (Mar 24)
- AI model discovery scripts
- Free AI API testing

**lms-solver** (Mar 20)
- LMS-agnostic solver
- Installable via npm

**haydaybot** (Mar 5)
- Hay Day game bot
- Controller + action system

**XSStrike** (Mar 7)
- XSS vulnerability scanner
- Security research tool

**osint** (Mar 25)
- Open source intelligence toolkit

---

## Recommendations

1. **Update mobius_solver documentation** - Several .md files show different versions; consolidate
2. **Clean up DOM snapshots** - 70+ snapshot files from testing; archive old ones
3. **Organize project folders** - Consider grouping by category (ai/, games/, security/)
4. **Check deprecated projects** - KeyboxChecker (Oct 2024), VapeV4ForRoblox (Nov 2024) may be unused

