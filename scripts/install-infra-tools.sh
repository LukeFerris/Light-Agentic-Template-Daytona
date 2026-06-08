#!/bin/bash

echo "========================================="
echo "Installing Infrastructure Tools"
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

# Determine install directory based on privileges
if [ -w "/usr/local/bin" ]; then
    BIN_DIR="/usr/local/bin"
else
    BIN_DIR="$HOME/.local/bin"
    mkdir -p "$BIN_DIR"
    if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
        export PATH="$BIN_DIR:$PATH"
        echo "NOTE: Added $BIN_DIR to PATH for this session."
        echo "Add 'export PATH=\"$BIN_DIR:\$PATH\"' to your shell profile for persistence."
    fi
fi

# Download helper with HTTP error detection
download_file() {
    local url="$1"
    local output="$2"

    if command -v curl &> /dev/null; then
        if ! curl -fSL "$url" -o "$output" 2>&1; then
            echo "ERROR: Download failed (HTTP error or network issue): $url"
            rm -f "$output"
            return 1
        fi
    elif command -v wget &> /dev/null; then
        if ! wget --server-response -q "$url" -O "$output" 2>&1; then
            echo "ERROR: Download failed (HTTP error or network issue): $url"
            rm -f "$output"
            return 1
        fi
    else
        echo "ERROR: Neither curl nor wget found."
        return 1
    fi

    if [ ! -s "$output" ]; then
        echo "ERROR: Downloaded file is empty or missing: $output"
        rm -f "$output"
        return 1
    fi

    return 0
}

# Install Terraform
install_terraform() {
    if command -v terraform &> /dev/null; then
        echo "✓ Terraform is already installed"
        terraform --version | head -1
        return 0
    fi

    echo "Installing Terraform..."

    if [[ "$OS" == "macos" ]]; then
        if command -v brew &> /dev/null; then
            brew tap hashicorp/tap
            brew install hashicorp/tap/terraform
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
            *)       echo "ERROR: Unsupported architecture: $(uname -m)"; return 1 ;;
        esac

        local TF_VERSION="1.12.0"
        local TF_ZIP="terraform_${TF_VERSION}_linux_${ARCH}.zip"
        local TF_URL="https://releases.hashicorp.com/terraform/${TF_VERSION}/${TF_ZIP}"

        echo "Downloading Terraform v${TF_VERSION} for linux/${ARCH}..."
        if ! download_file "$TF_URL" "/tmp/${TF_ZIP}"; then
            return 1
        fi

        if ! command -v unzip &> /dev/null; then
            echo "ERROR: unzip not found. Please install unzip first."
            rm -f "/tmp/${TF_ZIP}"
            return 1
        fi

        if ! unzip -o -q "/tmp/${TF_ZIP}" -d "$BIN_DIR"; then
            echo "ERROR: Failed to extract Terraform archive."
            rm -f "/tmp/${TF_ZIP}"
            return 1
        fi

        chmod +x "$BIN_DIR/terraform"
        rm -f "/tmp/${TF_ZIP}"
    fi

    if command -v terraform &> /dev/null; then
        echo "✓ Terraform installed successfully"
        terraform --version | head -1
    else
        echo "WARNING: Terraform installation may have failed. Please verify manually."
    fi
}

# Install AWS CLI v2
install_aws_cli() {
    if command -v aws &> /dev/null; then
        echo "✓ AWS CLI is already installed"
        aws --version
        return 0
    fi

    echo "Installing AWS CLI v2..."

    if [[ "$OS" == "macos" ]]; then
        if command -v brew &> /dev/null; then
            brew install awscli
        else
            echo "Downloading AWS CLI installer for macOS..."
            if ! download_file "https://awscli.amazonaws.com/AWSCLIV2.pkg" "/tmp/AWSCLIV2.pkg"; then
                return 1
            fi
            sudo installer -pkg /tmp/AWSCLIV2.pkg -target /
            rm -f /tmp/AWSCLIV2.pkg
        fi
    elif [[ "$OS" == "linux" ]]; then
        local ARCH
        case $(uname -m) in
            x86_64)  ARCH="x86_64" ;;
            aarch64) ARCH="aarch64" ;;
            *)       echo "ERROR: Unsupported architecture: $(uname -m)"; return 1 ;;
        esac

        echo "Downloading AWS CLI v2 for linux/${ARCH}..."
        if ! download_file "https://awscli.amazonaws.com/awscli-exe-linux-${ARCH}.zip" "/tmp/awscliv2.zip"; then
            return 1
        fi

        if ! command -v unzip &> /dev/null; then
            echo "ERROR: unzip not found. Please install unzip first."
            rm -f "/tmp/awscliv2.zip"
            return 1
        fi

        if ! unzip -o -q "/tmp/awscliv2.zip" -d /tmp; then
            echo "ERROR: Failed to extract AWS CLI archive."
            rm -f "/tmp/awscliv2.zip"
            return 1
        fi

        if [ -w "/usr/local" ]; then
            /tmp/aws/install --update 2>/dev/null || /tmp/aws/install
        else
            /tmp/aws/install --install-dir "$HOME/.local/aws-cli" --bin-dir "$BIN_DIR" --update 2>/dev/null \
                || /tmp/aws/install --install-dir "$HOME/.local/aws-cli" --bin-dir "$BIN_DIR"
        fi
        rm -rf /tmp/aws /tmp/awscliv2.zip
    fi

    if command -v aws &> /dev/null; then
        echo "✓ AWS CLI installed successfully"
        aws --version
    else
        echo "WARNING: AWS CLI installation may have failed. Please verify manually."
    fi
}

# Run installations
install_terraform
echo ""
install_aws_cli

echo ""
echo "========================================="
echo "Infrastructure Tools Installation Complete"
echo "========================================="
echo ""
echo "Installed tools:"
echo "  - Terraform (IaC)"
echo "  - AWS CLI v2 (Cloud management)"
echo ""
