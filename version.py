"""
Version configuration for Mobius AI Solver.

Format: MAJOR.MINOR.PATCH[-PRERELEASE_TAG]
Examples:
  1.0.0          - Release
  1.0.0-rc.1     - Release candidate 1
  1.0.0-beta.2   - Beta 2
  1.0.0-dev      - Development build

Bump rules:
  - MAJOR: Breaking changes, incompatible API changes
  - MINOR: New features, backward-compatible
  - PATCH: Bug fixes, backward-compatible
  - PRERELEASE: rc, beta, dev suffixes for pre-release builds
"""

# Version components
MAJOR = 2
MINOR = 0
PATCH = 28

# Pre-release tag: None for release, string for pre-release (e.g., "rc.1", "beta.2", "dev")
PRERELEASE = None


# Computed version strings
def get_version():
    """Return full version string (e.g., '2.1.0' or '2.1.0-rc.1')."""
    base = f"{MAJOR}.{MINOR}.{PATCH}"
    if PRERELEASE:
        return f"{base}-{PRERELEASE}"
    return base


def get_short_version():
    """Return MAJOR.MINOR.PATCH without prerelease tag."""
    return f"{MAJOR}.{MINOR}.{PATCH}"


def is_release():
    """Return True if this is a release build (no prerelease tag)."""
    return PRERELEASE is None


def bump(component):
    """
    Bump a version component and return the new version string.

    Args:
        component: One of 'major', 'minor', 'patch'

    Returns:
        New version string
    """
    global MAJOR, MINOR, PATCH, PRERELEASE

    if component == "major":
        MAJOR += 1
        MINOR = 0
        PATCH = 0
    elif component == "minor":
        MINOR += 1
        PATCH = 0
    elif component == "patch":
        PATCH += 1
    else:
        raise ValueError(
            f"Invalid component: {component}. Use 'major', 'minor', or 'patch'."
        )

    # Clear prerelease on bump
    PRERELEASE = None
    return get_version()


def set_prerelease(tag):
    """Set the prerelease tag. Pass None to clear."""
    global PRERELEASE
    PRERELEASE = tag


# For userscript header compatibility
USERSCRIPT_VERSION = get_version()
