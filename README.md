# LMS AI Solver

AI-powered solver for Mobius, Smartwork5, Canvas, and other LMS platforms.

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) browser extension
2. Click here to install: [install.js](https://raw.githubusercontent.com/scrxpted7327/lms-solver/refs/heads/main/install.js)
3. On first run, you'll be prompted for a GitHub Personal Access Token

## GitHub Token Setup

This userscript loads modules from a **private repository**. You need a GitHub PAT:

1. Go to [github.com/settings/tokens/new](https://github.com/settings/tokens/new?scopes=repo)
2. Create a token with **`repo`** scope
3. Copy the token (starts with `ghp_`)
4. When prompted by the userscript, paste the token

Your token is stored locally in Tampermonkey storage and never shared.

## Architecture

- **This repo (public):** Shell loader (`install.js`) + version manifest (`version.json`)
- **Private repo:** Core implementation + all modules

The shell loader handles:
- GitHub PAT management (prompt, validate, store)
- Loading core.js from the private repo via GitHub API
- Transparent re-auth after shell updates

## Supported LMS Platforms

| Platform | Status | Question Types |
|----------|--------|----------------|
| **Mobius** | Stable | simple_radio, multi_radio, binary_choice, checkbox, fillin_math, fillin_numeric, fillin_math_sentence, fillin_numeric_sentence |
| **Smartwork5** | Beta | multiple_choice, free_response, matching, ordering |
| **Canvas** | Beta | multiple_choice, true_false, short_answer, essay, fill_in_blanks, multiple_answers, matching, numerical |

## Configuration

Click the Tampermonkey icon → "LMS AI Solver" to access settings:
- Server URL (default: `http://localhost:5055`)
- Solve mode (basic/complex/ultra)
- Auto-solve, auto-submit, auto-next options
- Debug mode

## Backend Server

The solver requires a backend server running locally:

```bash
git clone https://github.com/scrxpted7327/mobius_solver.git
cd mobius_solver
pip install -r requirements.txt
export GROQ_API_KEY="your-key"
python server.py
```

## License

Private - All rights reserved.
