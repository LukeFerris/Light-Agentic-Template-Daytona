#!/bin/bash

echo "========================================="
echo "Installing Security Tools"
echo "========================================="
echo ""

# Detect OS
detect_os() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "macos"
    elif [[ "$OSTYPE" == "linux"* ]]; then
        echo "linux"
    else
        echo "unknown"
    fi
}

OS=$(detect_os)
echo "Detected OS: $OS"
echo ""

if [[ "$OS" == "unknown" ]]; then
    echo "ERROR: Unsupported operating system: $OSTYPE"
    echo "This script supports macOS and Linux only."
    exit 1
fi

# Install Semgrep
install_semgrep() {
    if command -v semgrep &> /dev/null; then
        echo "✓ Semgrep is already installed"
        semgrep --version
        return 0
    fi

    echo "Installing Semgrep..."

    if [[ "$OS" == "macos" ]]; then
        if command -v brew &> /dev/null; then
            brew install semgrep
        else
            echo "Homebrew not found, falling back to pip..."
            pip3 install semgrep
        fi
    elif [[ "$OS" == "linux" ]]; then
        if command -v pip3 &> /dev/null; then
            pip3 install semgrep
        elif command -v pip &> /dev/null; then
            pip install semgrep
        else
            echo "ERROR: pip not found. Please install Python pip first."
            return 1
        fi
    fi

    if command -v semgrep &> /dev/null; then
        echo "✓ Semgrep installed successfully"
    else
        echo "WARNING: Semgrep installation may have failed. Please verify manually."
    fi
}

# Install GitHub CLI (gh)
install_gh() {
    if command -v gh &> /dev/null; then
        echo "✓ GitHub CLI (gh) is already installed"
        gh --version
        return 0
    fi

    echo "Installing GitHub CLI (gh)..."

    if [[ "$OS" == "macos" ]]; then
        if command -v brew &> /dev/null; then
            brew install gh
        else
            echo "ERROR: Homebrew not found. Please install Homebrew first:"
            echo "  https://brew.sh"
            return 1
        fi
    elif [[ "$OS" == "linux" ]]; then
        local ARCH
        case $(uname -m) in
            x86_64)  ARCH="amd64" ;;
            aarch64) ARCH="arm64" ;;
            armv7l)  ARCH="armv6" ;;
            *)       echo "ERROR: Unsupported architecture: $(uname -m)"; return 1 ;;
        esac

        local GH_VERSION="2.63.2"
        local GH_TARBALL="gh_${GH_VERSION}_linux_${ARCH}.tar.gz"
        local GH_URL="https://github.com/cli/cli/releases/download/v${GH_VERSION}/${GH_TARBALL}"
        local INSTALL_DIR="/usr/local/bin"

        echo "Downloading gh v${GH_VERSION} for linux/${ARCH}..."
        if command -v curl &> /dev/null; then
            curl -sL "$GH_URL" -o "/tmp/${GH_TARBALL}"
        elif command -v wget &> /dev/null; then
            wget -q "$GH_URL" -O "/tmp/${GH_TARBALL}"
        else
            echo "ERROR: Neither curl nor wget found."
            return 1
        fi

        if [[ -f "/tmp/${GH_TARBALL}" ]]; then
            tar -xzf "/tmp/${GH_TARBALL}" -C /tmp
            cp "/tmp/gh_${GH_VERSION}_linux_${ARCH}/bin/gh" "$INSTALL_DIR/gh"
            chmod +x "$INSTALL_DIR/gh"
            rm -rf "/tmp/${GH_TARBALL}" "/tmp/gh_${GH_VERSION}_linux_${ARCH}"
        else
            echo "ERROR: Failed to download gh tarball."
            return 1
        fi
    fi

    if command -v gh &> /dev/null; then
        echo "✓ GitHub CLI (gh) installed successfully"
    else
        echo "WARNING: GitHub CLI (gh) installation may have failed. Please verify manually."
    fi
}

# Install OSV-Scanner
install_osv_scanner() {
    if command -v osv-scanner &> /dev/null; then
        echo "✓ OSV-Scanner is already installed"
        osv-scanner --version
        return 0
    fi

    echo "Installing OSV-Scanner..."

    if [[ "$OS" == "macos" ]]; then
        if command -v brew &> /dev/null; then
            brew install osv-scanner
        elif command -v go &> /dev/null; then
            echo "Homebrew not found, falling back to Go install..."
            go install github.com/google/osv-scanner/cmd/osv-scanner@latest
        else
            echo "ERROR: Neither Homebrew nor Go found. Please install one of them first."
            return 1
        fi
    elif [[ "$OS" == "linux" ]]; then
        if command -v go &> /dev/null; then
            go install github.com/google/osv-scanner/cmd/osv-scanner@latest
        else
            echo "ERROR: Go not found. Please install Go first:"
            echo "  https://go.dev/doc/install"
            return 1
        fi
    fi

    if command -v osv-scanner &> /dev/null; then
        echo "✓ OSV-Scanner installed successfully"
    else
        echo "WARNING: OSV-Scanner installation may have failed."
        echo "If using Go, ensure \$GOPATH/bin is in your PATH."
    fi
}

# Run installations
install_gh
echo ""
install_semgrep
echo ""
install_osv_scanner

echo ""
echo "========================================="
echo "Security Tools Installation Complete"
echo "========================================="
echo ""
echo "Installed tools:"
echo "  - GitHub CLI (gh)"
echo "  - Semgrep (SAST)"
echo "  - OSV-Scanner (SCA)"
echo ""
echo "Next steps:"
echo "  1. Run 'yarn install' to install npm dependencies"
echo "  2. Run 'yarn prepare' to setup Husky git hooks"
echo ""
