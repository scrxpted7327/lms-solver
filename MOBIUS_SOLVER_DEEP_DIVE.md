# Mobius Solver - Deep Technical Analysis

**Project:** mobius_solver  
**Repository:** https://github.com/scrxpted7327/mobius_solver.git  
**Language:** Python + JavaScript  
**Last Update:** Mar 27, 2026  
**Status:** Active Development

---

## 1. Project Purpose

Automates solving of Mobius LMS assessment questions by:
1. Analyzing problem types with AI classifier
2. Routing to specialized AI solvers
3. Automatically filling answers via Tampermonkey userscript
4. Submitting without manual intervention

**Academic Integrity Note:** Designed for educational/research purposes with explicit disclaimer in README.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Mobius Platform                           │
│                  (Canvas/Blackboard LMS)                     │
└────────────────────────────┬────────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │  Tampermonkey   │
                    │  Userscript     │
                    │  mobius_client  │
                    └────────┬────────┘
                             │ (captures Q + screenshots)
                    ┌────────▼────────────────────┐
                    │   Flask Server (5055)       │
                    │  - /solve endpoint          │
                    │  - Image processing         │
                    │  - JSON parsing             │
                    └────────┬──────────────────┬─┘
                             │                  │
              ┌──────────────┴──────────────┐   │
              │                             │   │
      ┌───────▼──────────┐    ┌────────────▼──────┐
      │ MultiModelClient │    │ ProgressServer    │
      │ (two-stage AI)   │    │ (WebSocket 8766)  │
      └───────┬──────────┘    └───────────────────┘
              │
    ┌─────────┴──────────────────────┐
    │                                │
┌───▼────────────────┐  ┌───────────▼─────────┐
│ Stage 1: Classifier │  │ Stage 2: Solvers    │
│ Nemotron VL        │  │ - Trinity Mini      │
│ (problem analysis) │  │ - Trinity Large     │
│                    │  │ - Nemotron 3 Nano   │
└────────────────────┘  └─────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   OpenRouter API        │
                    │   (free models)         │
                    └─────────────────────────┘
```

---

## 3. Core Components

### 3.1 Backend (Python)

#### `server.py` - Flask API Server
- **Port:** 5055
- **Endpoint:** `POST /solve`
- **Handles:**
  - Receives question data + screenshots from userscript
  - Invokes MultiModelClient for AI solving
  - Returns JSON answers to userscript
  - CORS enabled for cross-origin requests
  - Image processing via PIL/Pillow

#### `main.py` - CLI Entry Point
- Direct testing without server
- Interactive mode for manual input
- Used for development/debugging

#### `lib/multi_model_client.py` - Two-Stage Pipeline
```python
def classify_and_solve(question, image):
    # Stage 1: Classification
    category = classifier.classify(question, image)
    # Options: "trinity_mini", "trinity_large", "nemotron_3_nano"
    
    # Stage 2: Solver Selection
    if category == "trinity_mini":
        solver = TrinityMini()
    elif category == "trinity_large":
        solver = TrinityLarge()
    else:
        solver = Nemotron3Nano()
    
    return solver.solve(question, image)
```

**Model Routing Logic:**
- Trinity Mini: Simple arithmetic, basic algebra
- Trinity Large: Physics, chemistry, engineering
- Nemotron 3 Nano: Calculus, proofs, advanced (default fallback)

#### `lib/gemini_api_client.py` - LLM Integration
- Handles OpenRouter API calls
- Model management and switching
- Error handling and retry logic
- API key validation

#### `lib/hybrid_solver.py` - Advanced Solving
- Multiple solving strategies
- Fallback mechanisms
- Answer validation

#### `lib/progress_server.py` - WebSocket
- Real-time progress updates
- WebSocket server on port 8766
- Broadcasts solving steps to userscript

#### `lib/temperature_config.py`
- Temperature settings for different model types
- Affects randomness/creativity of responses

#### `lib/platform_utils.py`
- Platform-specific utilities
- File handling across OS

---

### 3.2 Frontend (JavaScript/Tampermonkey)

#### `userscript/mobius_client.js`
- Injects **SOLVE** button into Mobius assessment pages
- Captures question text and screenshots
- Handles user interactions
- Auto-fills form fields with answers
- Auto-submits if configured

**Key Features:**
- Question detection and parsing
- Screenshot capture (via html2canvas)
- FormData collection
- Answer injection
- Auto-submit mechanism
- Settings panel (gear icon)

**Settings Available:**
- Auto Wait: Delay between fill and submit (simulates human)
- Auto Complete: Auto-advance to next question
- Auto-Solve on Load: Begin immediately
- Progress Bar Position: Toggle display

---

## 4. Configuration & Setup

### OpenRouter API
- **Endpoint:** https://openrouter.ai
- **Models Used:**
  - `nvidia/nemotron-nano-12b-v2-vl:free` (Classifier)
  - `arcee-ai/trinity-mini:free` (Solver 1)
  - `arcee-ai/trinity-large-preview:free` (Solver 2)
  - `nvidia/nemotron-3-nano-30b-a3b:free` (Solver 3)
- **Cost:** Free with credits (usually <$0.10/question with free models)
- **Authentication:** API key in env var or `lib/credentials.json`

### Environment Variables
```bash
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_APP_NAME=Mobius Solver
OPENROUTER_APP_URL=https://github.com/scrxpted7327/mobius_solver
```

---

## 5. Data Flow Example

### Complete Request/Response Cycle

```
1. USER CLICKS "SOLVE" ON MOBIUS
   ↓
2. USERSCRIPT CAPTURES
   - Question text: "What is 2+2?"
   - Screenshot: [diagram PNG]
   - Form fields: ans.1.1, ans.1.2, etc.
   ↓
3. POST /solve (to server.py)
   {
     "questions": [{"text": "What is 2+2?", "image_base64": "..."}],
     "form_ids": ["ans.1.1"]
   }
   ↓
4. SERVER PROCESSES (multi_model_client.py)
   Stage 1: Nemotron VL classifies
      Output: {"category": "trinity_mini"}
   
   Stage 2: Trinity Mini solves
      Output: {"answers": {"ans.1.1": "4"}}
   ↓
5. RESPONSE SENT TO USERSCRIPT
   {
     "success": true,
     "answers": {"ans.1.1": "4"}
   }
   ↓
6. USERSCRIPT AUTO-FILLS
   - Sets form field value
   - Triggers change events (for validation)
   ↓
7. AUTO-SUBMIT (if enabled)
   - Waits random delay (human-like)
   - Clicks submit button
   - Advances to next question
```

---

## 6. Project Structure

```
mobius_solver/
├── server.py                 # Flask API
├── main.py                   # CLI entry point
├── requirements.txt          # Python dependencies
├── version.py               # Version info
│
├── lib/
│   ├── multi_model_client.py    # Two-stage pipeline
│   ├── gemini_api_client.py     # OpenRouter integration
│   ├── hybrid_solver.py         # Hybrid solving
│   ├── progress_server.py       # WebSocket server
│   ├── temperature_config.py    # Model temperature
│   ├── platform_utils.py        # OS utilities
│   └── credentials.json.example # Template
│
├── userscript/
│   ├── mobius_client.js         # Tampermonkey script
│   ├── version.json             # Version tracking
│   ├── README.md                # Userscript docs
│   ├── lms-solver/              # Alternate solver
│   └── changelogs/              # Version history (v2.0.11 - v2.0.36)
│
├── tests/
│   ├── test_multi_model.py      # Unit tests
│   ├── test_hybrid_solver.py    # Hybrid solver tests
│   ├── integration_test.py      # Integration tests
│   ├── e2e_test.py              # End-to-end tests
│   └── test_complexity.py       # Complexity estimation
│
├── logs/
│   ├── solve_logs/              # ~50+ solve execution logs (JSON)
│   └── dom_snapshots/           # ~70+ DOM captures (MATH 134)
│
├── documentation/
│   ├── README.md                # Main documentation
│   ├── QUICKSTART_HYBRID.md     # Quick start guide
│   ├── SETUP.md                 # Installation steps
│   ├── INTEGRATION_GUIDE.md     # API integration
│   ├── HYBRID_SOLVER.md         # Hybrid approach docs
│   ├── CLAUDE.md                # Claude AI integration
│   ├── AGENTS.md                # Agent system
│   └── [20+ other MD files]     # Reports and guides
│
├── archive/
│   ├── ai_studio_client.py      # Legacy
│   ├── gemini_client.py         # Legacy
│   └── test_payload.json        # Test data
│
└── models.json                  # Model configuration
```

---

## 7. Recent Activity & Testing

### Last Activity: Mar 27, 2026
- Latest solve logs from Mar 20 (MATH 134 course testing)
- DOM snapshots showing Question 1-9 from assessments
- Test coverage for hybrid solver and multi-model routing

### Test Data Available
- 50+ solve execution logs (JSON)
- 70+ DOM snapshots from live testing
- Test images in `create_test_images.py`
- Integration and E2E test suites

### Documentation
- 30+ markdown files with guides, reports, and analysis
- Version changelog (2.0.11 through 2.0.36)
- API integration documentation
- Setup and troubleshooting guides

---

## 8. Key Dependencies

```
flask==3.0.0              # Web framework
flask-cors==4.0.0         # CORS handling
openai==1.0.0+            # OpenRouter compatibility
Pillow==10.0.0+           # Image processing
websocket-client==11.0+   # WebSocket support
python-dotenv==1.0.0+     # Environment variables
requests==2.31.0+         # HTTP client
```

---

## 9. Potential Issues & Optimization

### Known Limitations
1. **Rate Limiting:** Free models have usage quotas
2. **Accuracy:** Depends on problem complexity and model selection
3. **Image Processing:** Complex diagrams may need manual intervention
4. **Platform Compatibility:** Tested primarily on Mobius; canvas/blackboard untested
5. **Session Management:** May need re-authentication for long sessions

### Optimization Opportunities
1. **Cache Classifier Results** - Store classifications locally
2. **Batch Processing** - Solve multiple questions in parallel
3. **Model Fine-tuning** - Create custom models for specific problem types
4. **Answer Validation** - Cross-check answers with multiple models
5. **Screenshot Optimization** - Reduce image sizes for faster API calls

---

## 10. Security Considerations

### API Key Protection
- Never commit API keys to git
- Use environment variables or credentials.json
- Rotate keys regularly
- Monitor OpenRouter usage dashboard

### Browser Security
- Tampermonkey runs in browser sandbox
- No sensitive data stored in userscript
- CORS policies respected

### Server Security
- Flask runs on localhost only (by default)
- Consider authentication if exposed
- Input validation on all API endpoints

---

## 11. Usage Examples

### Run Server
```bash
python server.py
# Server runs at http://localhost:5055
# WebSocket at ws://localhost:8766
```

### Interactive CLI
```bash
python main.py
# Prompts for question text
# Returns JSON answer
```

### Run Tests
```bash
python test_multi_model.py
python test_hybrid_solver.py
python integration_test.py
python e2e_test.py
```

---

## 12. Recommendations

### Short Term (1-2 weeks)
1. ✅ Consolidate documentation (15+ guide files could be merged)
2. ✅ Archive old solve logs and DOM snapshots (clean up project)
3. ✅ Update version tracking (sync version.py with userscript version.json)
4. ✅ Test on current Mobius platform (compatibility check)

### Medium Term (1 month)
1. 📊 Add model performance benchmarking
2. 📊 Implement answer validation system
3. 📊 Create batch solving capability
4. 📊 Add support for equation answers (complex math formatting)

### Long Term (ongoing)
1. 🔄 Fine-tune custom models if possible
2. 🔄 Extend to other LMS platforms (Canvas, Blackboard)
3. 🔄 Build dashboard for usage tracking
4. 🔄 Community contribution framework

---

## 13. Files to Review First

1. **README.md** - Overview and setup (5 min read)
2. **lib/multi_model_client.py** - Core logic (15 min)
3. **userscript/mobius_client.js** - Frontend (20 min)
4. **QUICKSTART_HYBRID.md** - Quick deployment (10 min)
5. **models.json** - Model configuration (5 min)

---

## 14. Contact & Support

- **Repository:** https://github.com/scrxpted7327/mobius_solver
- **Issues:** Check GitHub issues for known problems
- **Documentation:** See INTEGRATION_GUIDE.md for API details

