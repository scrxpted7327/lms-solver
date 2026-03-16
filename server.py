import base64
import json
import os
import sys
import time
import traceback
import hashlib
import subprocess
import threading
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
from pathlib import Path
from main import AutomationHub
from lib.progress_server import ProgressServer
from lib.platform_utils import get_platform_info, sanitize_filename, get_base_dir
from version import (
    get_version,
    get_short_version,
    is_release,
    MAJOR,
    MINOR,
    PATCH,
    PRERELEASE,
)

app = Flask(__name__)
CORS(app)

# Debug mode - set DEBUG=1 environment variable to log requests/responses
DEBUG = os.getenv("DEBUG", "").lower() in ("1", "true", "yes")
if DEBUG:
    print("[DEBUG] Server debug mode enabled")

# Auto-update configuration
AUTO_UPDATE_ENABLED = os.getenv("AUTO_UPDATE_ENABLED", "true").lower() in (
    "1",
    "true",
    "yes",
)
AUTO_UPDATE_CHECK_INTERVAL = int(
    os.getenv("AUTO_UPDATE_CHECK_INTERVAL", "3600")
)  # 1 hour default
LAST_UPDATE_CHECK = 0

hub = AutomationHub()  # Initialize the hub once


def check_for_server_updates():
    """Check for and apply server-side updates from GitHub."""
    global LAST_UPDATE_CHECK

    # Only check if enabled and enough time has passed
    if not AUTO_UPDATE_ENABLED:
        return

    current_time = time.time()
    if current_time - LAST_UPDATE_CHECK < AUTO_UPDATE_CHECK_INTERVAL:
        return

    LAST_UPDATE_CHECK = current_time

    try:
        print("[Auto-Update] Checking for server updates...")

        # Fetch latest commit SHA from private repo
        result = subprocess.run(
            [
                "git",
                "ls-remote",
                "https://github.com/scrxpted7327/mobius_solver.git",
                "refs/heads/main",
            ],
            capture_output=True,
            text=True,
            timeout=10,
        )

        if result.returncode != 0:
            print(f"[Auto-Update] Failed to fetch remote info: {result.stderr}")
            return

        remote_sha = result.stdout.split()[0] if result.stdout.strip() else None
        if not remote_sha:
            print("[Auto-Update] Could not determine remote SHA")
            return

        # Get local commit SHA
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"], capture_output=True, text=True, timeout=10
        )

        if result.returncode != 0:
            print(f"[Auto-Update] Failed to get local SHA: {result.stderr}")
            return

        local_sha = result.stdout.strip()

        # Compare SHAs
        if remote_sha != local_sha:
            print(f"[Auto-Update] Update available: {local_sha[:7]} → {remote_sha[:7]}")
            print("[Auto-Update] Pulling latest changes...")

            # Pull updates
            result = subprocess.run(
                ["git", "pull", "origin", "main"],
                capture_output=True,
                text=True,
                timeout=30,
            )

            if result.returncode == 0:
                print(f"[Auto-Update] Successfully updated to {remote_sha[:7]}")
                print("[Auto-Update] Restarting server to apply updates...")
                os.execv(sys.executable, ["python"] + sys.argv)
            else:
                print(f"[Auto-Update] Failed to pull updates: {result.stderr}")
        else:
            print("[Auto-Update] Server is up to date")

    except Exception as e:
        print(f"[Auto-Update] Error checking for updates: {e}")


# Start background update checker if enabled
if AUTO_UPDATE_ENABLED:

    def update_checker():
        while True:
            check_for_server_updates()
            time.sleep(AUTO_UPDATE_CHECK_INTERVAL)

    update_thread = threading.Thread(target=update_checker, daemon=True)
    update_thread.start()
    print(
        f"[Auto-Update] Background update checker started (interval: {AUTO_UPDATE_CHECK_INTERVAL}s)"
    )

# All file paths relative to project root (where server.py lives), not CWD
BASE_DIR = get_base_dir()
TEMP_IMG_DIR = BASE_DIR / "temp_imgs"
TEMP_IMG_DIR.mkdir(exist_ok=True)

# --- Progress WebSocket Server ---
progress = ProgressServer(port=8766)
progress.start()


def process_image(b64_data):
    """Fixes padding and handles malformed base64 to prevent 500 errors."""
    try:
        if not b64_data or not isinstance(b64_data, str):
            return None
        if "base64," in b64_data:
            b64_data = b64_data.split("base64,")[1]

        # FIX: Add missing padding (Python's b64decode is strict)
        b64_data = b64_data.strip()
        padding = len(b64_data) % 4
        if padding:
            b64_data += "=" * (4 - padding)

        filename = (
            TEMP_IMG_DIR / f"img_{int(time.time() * 1000)}_{os.urandom(4).hex()}.png"
        )
        filename.write_bytes(base64.b64decode(b64_data))
        return str(filename.absolute())
    except Exception as e:
        print(f"[Image Error] {e}")
        return None


def build_prompt(data):
    """
    Builds a structured prompt from the MOBIUS.md compliant scraper payload.

    The scraper sends (per MOBIUS.md structure):
    {
      "questions": [
        {
          "id": "questionstyle.0",
          "index": 0,
          "number": "Question 1",
          "text": "Question text...",
          "type": "simple_radio|multi_radio|binary_choice|checkbox|fillin_math|fillin_numeric|fillin_math_sentence|fillin_numeric_sentence",
          "parts": [
            { "name": "ans.0.value", "type": "radio", "options": [{"value": "0", "label": "Option A"}] },
            { "name": "ans.0.0.0", "type": "fillin_math", "placeholder": "", "context": "..." },
            { "name": "ans.0.0.0", "type": "checkbox", "options": [...] }
          ],
          "mobiusMeta": { "ansType": "string|multi", "partTypes": [...], ... },
          "imageUrls": [{"url": "...", "isMaplePlot": true}],
          "answerOptionImages": [{"url": "..."}]
        }
      ],
      "images": ["base64...", ...],
      "solve_mode": "basic|complex|ultra"
    }
    """
    questions = data.get("questions", [])

    # Fallback: legacy flat payload from older client versions
    if not questions and data.get("question"):
        return data["question"], data.get("images", [])

    prompt_lines = []

    for q in questions:
        q_type = q.get("type", "unknown")
        q_number = q.get("number", f"Question {q.get('index', '?')}")
        mobius_meta = q.get("mobiusMeta", {})

        prompt_lines.append(f"--- {q_number} (Type: {q_type}) ---")
        prompt_lines.append(q.get("text", ""))
        prompt_lines.append("")

        # Add Mobius type context
        if mobius_meta.get("ansType"):
            prompt_lines.append(f'MOBIUS TYPE: ans.N.type = "{mobius_meta["ansType"]}"')

        if q.get("parts"):
            prompt_lines.append("ANSWER FIELDS:")
            for part in q["parts"]:
                name = part.get("name", "unknown")
                ptype = part.get("type", "text")
                desc = f"  - {name} [{ptype}]"

                if ptype in ("select", "radio") and part.get("options"):
                    opts = [
                        f'VALUE={o.get("value", "")}: "{o.get("label", "")}"'
                        for o in part["options"]
                    ]
                    desc += f"\n    Options: {' | '.join(opts)}"
                    # Note image options
                    img_opts = [o for o in part["options"] if o.get("hasImage")]
                    if img_opts:
                        desc += f"\n    ({len(img_opts)} options are IMAGES - see attached images)"

                if ptype == "checkbox" and part.get("options"):
                    opts = [
                        f'VALUE={o.get("value", "")}: "{o.get("label", "")}"'
                        for o in part["options"]
                    ]
                    desc += f"\n    Options (select ALL that apply): {' | '.join(opts)}"

                if ptype in ("fillin_math", "fillin_numeric"):
                    if part.get("placeholder"):
                        desc += f' Placeholder: "{part["placeholder"]}"'
                    if part.get("context"):
                        desc += f'\n    Context: "{part["context"]}"'

                if ptype in ("fillin_math_sentence", "fillin_numeric_sentence"):
                    if part.get("context"):
                        desc += f'\n    Sentence context: "{part["context"]}"'

                prompt_lines.append(desc)

        prompt_lines.append("")

        # Note question images (graphs, diagrams)
        image_urls = q.get("imageUrls", [])
        if image_urls:
            maple = [img for img in image_urls if img.get("isMaplePlot")]
            course = [img for img in image_urls if img.get("isCourseContent")]
            if maple:
                prompt_lines.append(
                    f"[See QUESTION IMAGE - {len(maple)} Maple plot(s) attached]"
                )
            if course:
                prompt_lines.append(
                    f"[See QUESTION IMAGE - {len(course)} course diagram(s) attached]"
                )

        # Note answer option images
        answer_images = q.get("answerOptionImages", [])
        if answer_images:
            prompt_lines.append(
                f"[See ANSWER OPTION IMAGES - {len(answer_images)} options are images, attached below]"
            )

    raw_images = data.get("images", [])
    image_paths = [path for path in [process_image(img) for img in raw_images] if path]

    return "\n".join(prompt_lines), image_paths


# System prompt - MOBIUS.md compliant, type-specific instructions
SYSTEM_PROMPT = (
    "You are an expert automated solver for the Mobius assessment platform.\n"
    "OBJECTIVE: Solve each question accurately and provide the FINAL COMPUTED answer.\n\n"
    "OUTPUT FORMAT (CRITICAL):\n"
    "You MUST output ONLY a valid JSON object. No markdown. No code blocks. No explanations.\n"
    "No step-by-step reasoning in the output. Think internally, output JSON only.\n\n"
    "Expected format:\n"
    '  {"answers": {"ans.1.1": "42", "ans.1.2": "Option B"}}\n\n'
    ' - Use the "answers" key with a dictionary mapping each field name to its answer.\n'
    " - EVERY field name listed under ANSWER FIELDS must have a corresponding key in your response.\n\n"
    "TYPE-SPECIFIC ANSWER RULES (CRITICAL):\n\n"
    "1. RADIO/CHOICE QUESTIONS (simple_radio, multi_radio, binary_choice):\n"
    "   - Return the EXACT 'value' from the option, NOT the label text.\n"
    '   - Example: If options are VALUE=0: "3x^2" | VALUE=1: "x^2", return "0" (the value string).\n'
    '   - For binary_choice (True/False, Yes/No): return "0" for first option, "1" for second.\n\n'
    "2. CHECKBOX QUESTIONS (checkbox):\n"
    "   - Return the VALUE string for EACH selected option.\n"
    "   - Return as comma-separated if multiple answers in one field, or separate keys.\n"
    '   - Example: If selecting options 0 and 2, return "0,2" or separate answer keys.\n\n'
    "3. FILL-IN MATH QUESTIONS (fillin_math, fillin_math_sentence):\n"
    "   - Return the mathematical EXPRESSION in calculator notation.\n"
    "   - Use explicit * for multiplication: 3*x^2 NOT 3x^2\n"
    "   - Use sqrt(x) for square roots, (numerator)/(denominator) for fractions.\n"
    "   - NEVER use LaTeX: no \\frac, \\int, \\pi, \\sqrt{} in answers.\n"
    "   - If there's sentence context, return the expression that completes the sentence.\n\n"
    "4. FILL-IN NUMERIC QUESTIONS (fillin_numeric, fillin_numeric_sentence):\n"
    "   - Return ONLY the number (or simple fraction like 32/3).\n"
    "   - No units, no explanations, just the value.\n"
    '   - Example: "42", "-3.14", "32/3", "sqrt(2)"\n\n'
    "CRITICAL ANSWER FORMAT RULES:\n"
    " - NEVER return function definitions like 'f(x) = ...' or 'h(y) = ...'. Return only the expression or value.\n"
    " - NEVER return the question rephrased as an answer.\n"
    " - For area/volume/mass problems: COMPUTE the final numerical value. Do NOT return an integral expression.\n"
    " - Example WRONG: '\\int_{-2}^{2} (4-y^2) dy' -> Example RIGHT: '32/3' or '10.667'\n"
    " - Example WRONG: 'h(y) = 4 - y^2' -> Example RIGHT: '4 - y^2' or the computed value\n"
    " - Always evaluate integrals, derivatives, and limits to their final form.\n\n"
    "STRICT MATHEMATICAL RULES:\n"
    " - All multiplication MUST use the '*' symbol explicitly. Never use implicit multiplication.\n"
    " - Use proper mathematical notation that can be parsed.\n"
    " - For square roots: use sqrt(x)\n"
    " - For powers: use x^n\n"
    " - For fractions: use (numerator)/(denominator)\n"
    " - NEVER use LaTeX notation like \\frac, \\int, \\pi in answers. Use plain text: pi, sqrt(), etc.\n\n"
    "Think internally, output JSON only.\n"
)


@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint."""
    return jsonify({"status": "ok", "server": "mobius_solver"})


@app.route("/solve", methods=["POST"])
def solve():
    """
    Handle POST /solve endpoint.

    Expects JSON payload with 'questions' array and optional 'images' array.
    Returns JSON with 'answers' dict mapping field names to answers.
    """
    data = request.json

    # Log request payload summary
    questions_count = len(data.get("questions", []))
    images_count = len(data.get("images", []))
    solve_mode = data.get("solve_mode", "basic")  # basic, complex, ultra
    print(
        f"[Debug] Request: {questions_count} questions, {images_count} images, mode={solve_mode}"
    )

    if DEBUG:
        print(f"[DEBUG] Request payload: {json.dumps(data, indent=2)[:500]}")
        print(f"[DEBUG] Env keys: GROQ={bool(os.getenv('GROQ_API_KEY'))}")

    # --- Progress: Received ---
    progress.update("received", "Building prompt...", 10, step=1, total_steps=4)

    prompt_text, image_paths = build_prompt(data)

    full_prompt = SYSTEM_PROMPT + "\n" + prompt_text

    try:
        # --- Progress: Thinking ---
        # Define callback to bridge AI client updates to WebSocket server
        def on_ai_progress(status, message, percentage):
            progress.update(status, message, percentage, step=2)

        result = hub.ask_ai(
            full_prompt,
            image_paths=image_paths,
            progress_callback=on_ai_progress,
            solve_mode=solve_mode,
        )

        # Capture raw AI response for debug logging
        raw_response_str = (
            json.dumps(result) if isinstance(result, (dict, list)) else str(result)
        )

        if DEBUG:
            print(f"[DEBUG] AI result: {json.dumps(result, indent=2)[:500]}")

        # --- Progress: Processing ---
        progress.update("processing", "Parsing AI response...", 95, step=3)

        # Ensure the result is a dict with 'answers' key
        if isinstance(result, dict):
            # Read model_used from result (set by multi_model_client)
            model_used = result.get(
                "model_used", getattr(hub.client, "_last_model_used", "unknown")
            )
            # Always attach debug info for solve_log forwarding (not gated by DEBUG mode)
            result["_debug"] = {
                "prompt": full_prompt,
                "raw_response": raw_response_str,
                "model_used": model_used,
            }
            # If the AI returned {"answer": ...} instead of {"answers": ...}, adapt
            if "answer" in result and "answers" not in result:
                answer = result["answer"]
                # Try to build named answers from flat answer
                questions = data.get("questions", [])
                all_parts = []
                for q in questions:
                    for p in q.get("parts", []):
                        all_parts.append(p)

                if isinstance(answer, list):
                    named = {}
                    for idx, ans in enumerate(answer):
                        if idx < len(all_parts):
                            named[all_parts[idx]["name"]] = ans
                    result["answers"] = named
                elif isinstance(answer, str) and len(all_parts) == 1:
                    result["answers"] = {all_parts[0]["name"]: answer}
                elif isinstance(answer, str):
                    # Single answer, assign to first part
                    if all_parts:
                        result["answers"] = {all_parts[0]["name"]: answer}
                    else:
                        result["answers"] = {}
                        result["answer"] = answer  # Keep legacy fallback

            # Check for complete failure (all models failed)
            if isinstance(result, dict) and result.get("error"):
                # Return 500 status code for complete AI failure
                return jsonify(result), 500

            # --- Progress: Complete ---
            progress.update("complete", "Answer ready!", 100, step=4)

            return jsonify(result)
        else:
            progress.update("error", "AI returned non-dict result", 0)
            return jsonify(
                {"error": "AI returned non-dict result", "raw": str(result)}
            ), 500

    except Exception as e:
        # Log full traceback and request details for debugging
        questions_count = len(data.get("questions", []))
        images_count = len(data.get("images", []))
        print(
            f"[Debug] Failed Request: {questions_count} questions, {images_count} images"
        )
        traceback.print_exc()
        progress.update("error", str(e), 0)
        return jsonify({"error": str(e)}), 500

    finally:
        # Always cleanup temp images
        for img in image_paths:
            try:
                os.remove(img)
            except Exception:
                pass


@app.route("/progress", methods=["GET"])
def get_progress():
    """
    HTTP fallback endpoint for progress state.

    Returns current progress state as JSON. Used when WebSocket is unavailable
    or for simple polling.
    """
    return jsonify(progress.state)


@app.route("/dom_snapshot", methods=["POST"])
def dom_snapshot():
    """
    Receive and save DOM snapshots for debugging unknown question structures.

    Expects JSON payload with fields like url, html_snippet, selector_used, timestamp.
    Saves to ./dom_snapshots/ with timestamp and hash suffix.
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data"}), 400

    # Ensure directory exists (absolute path, not CWD-relative)
    snap_dir = BASE_DIR / "dom_snapshots"
    snap_dir.mkdir(parents=True, exist_ok=True)

    timestamp = data.get("timestamp", datetime.now().isoformat())
    safe_timestamp = sanitize_filename(timestamp)

    # Build context prefix from course/assignment/question for uniqueness
    course = sanitize_filename(data.get("course", "unknown_course"))
    assignment = sanitize_filename(data.get("assignment", "unknown_assignment"))
    question = sanitize_filename(data.get("question", "unknown_question"))
    context_prefix = f"{course}_{assignment}_{question}"

    content = json.dumps(data, sort_keys=True).encode("utf-8")
    hash_suffix = hashlib.md5(content).hexdigest()[:8]
    filename = snap_dir / f"{context_prefix}_{safe_timestamp}_{hash_suffix}.json"
    with open(filename, "w") as f:
        json.dump(data, f, indent=2)
    app.logger.info(f"DOM snapshot saved to {filename}")
    return jsonify({"status": "saved", "path": str(filename)}), 200


@app.route("/version", methods=["GET"])
def version():
    """Return server version information."""
    return jsonify(
        {
            "version": get_version(),
            "short_version": get_short_version(),
            "major": MAJOR,
            "minor": MINOR,
            "patch": PATCH,
            "prerelease": PRERELEASE,
            "is_release": is_release(),
        }
    )


@app.route("/platform", methods=["GET"])
def platform_info():
    """Return server platform information for client adaptation."""
    return jsonify(get_platform_info())


@app.route("/solve_log", methods=["POST"])
def solve_log():
    """
    Receive and save post-solve analysis logs.

    Expects JSON payload with solve results including question metadata,
    fill success/failure, error diagnostics, and timing.
    Saves to ./solve_logs/ directory for AI analysis.
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data"}), 400

    log_dir = BASE_DIR / "solve_logs"
    log_dir.mkdir(parents=True, exist_ok=True)

    timestamp = data.get("timestamp", datetime.now().isoformat())
    safe_timestamp = sanitize_filename(timestamp)

    # Generate summary for console output
    summary = data.get("summary", {})
    total_q = summary.get("total_questions", 0)
    total_f = summary.get("total_fields", 0)
    filled = summary.get("filled", 0)
    failed = summary.get("failed", 0)
    rate = summary.get("fill_rate", 0)

    # Info line: level, model, type
    solve_mode = data.get("solve_mode", "unknown")
    ai_info = data.get("ai", {})
    model = ai_info.get("model_used", "unknown")
    questions_list = data.get("questions", [])
    first_q = questions_list[0] if questions_list else {}
    has_images = first_q.get("has_images", False)
    q_type = first_q.get("type", "unknown")
    type_str = "image" if has_images else "text"
    print(
        f"  [Info] level={solve_mode} model={model} type={type_str} question_type={q_type}"
    )

    print(
        f"[SolveLog] Q={total_q} Fields={total_f} Filled={filled} Failed={failed} Rate={rate}%"
    )

    # Log question types and variants for analysis
    for q in data.get("questions", []):
        q_type = q.get("type", "unknown")
        variants = q.get("variants", [])
        parts = q.get("parts", [])
        failed_parts = [p for p in parts if p.get("fill_error")]
        if failed_parts:
            print(
                f"  Q[{q.get('id', '?')}] type={q_type} variants={','.join(variants)} - {len(failed_parts)} errors:"
            )
            for fp in failed_parts:
                print(f"    - {fp['name']}: {fp['fill_error']}")

    # Save full log
    content = json.dumps(data, sort_keys=True).encode("utf-8")
    hash_suffix = hashlib.md5(content).hexdigest()[:8]
    filename = log_dir / f"{safe_timestamp}_{hash_suffix}.json"
    with open(filename, "w") as f:
        json.dump(data, f, indent=2)

    return jsonify(
        {
            "status": "logged",
            "path": str(filename),
            "summary": {
                "total_questions": total_q,
                "filled": filled,
                "failed": failed,
                "fill_rate": rate,
            },
        }
    ), 200


@app.route("/html2canvas.min.js", methods=["GET"])
def serve_html2canvas():
    """
    Serve html2canvas library from workspace.
    Used by the userscript for image capture.
    """
    import os
    from flask import send_file

    file_path = str(BASE_DIR / "html2canvas.min.js")
    if os.path.exists(file_path):
        return send_file(file_path, mimetype="application/javascript")
    else:
        return jsonify({"error": "html2canvas.min.js not found"}), 404


@app.route("/status", methods=["GET"])
def status():
    """
    Health check endpoint.

    Returns server status and basic info. Used by frontend to verify connectivity.
    """
    global hub
    if hub is None:
        return jsonify({"status": "error", "message": "Hub not initialized"}), 500

     try:
         # Check if hub has a driver with current_url (legacy). Otherwise return generic ready.
         driver = getattr(hub, "driver", None)
         if driver is not None and hasattr(driver, "current_url"):
             current_url = driver.current_url
             return jsonify(
                 {
                     "status": "ready",
                     "browser_url": current_url,
                 }
             )
         else:
             return jsonify(
                 {"status": "ready", "message": "MultiModelClient hub active"}
             )
     except Exception as e:
         return jsonify({"status": "error", "error": str(e)}), 500


if __name__ == "__main__":
    print(app.url_map)
    # Initialize here or at top level, but ensure it's not None
    if hub is None:
        hub = AutomationHub()

    print(f"[INFO] Starting server on port 5055. Debug mode: {DEBUG}")
    app.run(port=5055, debug=False, use_reloader=False)
