#!/usr/bin/env bash
# Deploy one app to a UTM/VM running Home Assistant OS
# Usage: ./scripts/deploy-vm.sh [--ip 192.168.x.x]
#
# This script syncs the addon source code to the HA VM's local addons folder
# so that it can be installed/rebuilt directly from the HA supervisor.
#
# Prerequisites:
#   - SSH access to the VM as root (ssh root@VM_IP)
#   - The VM must be running Home Assistant OS
#   - VM_IP is auto-detected from UTM (VM named "HAOS"), or set manually
#
# Example:
#   ./scripts/deploy-vm.sh                        # Auto-detect IP from UTM
#   ./scripts/deploy-vm.sh --ip 192.168.64.2      # Manual IP

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ADDON="duplicati"
VM_USER="root"
VM_ADDONS_PATH="/root/addons"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --addon)
            ADDON="$2"; shift 2 ;;
        --ip)
            VM_IP="$2"; shift 2 ;;
        --user)
            VM_USER="$2"; shift 2 ;;
        --path)
            VM_ADDONS_PATH="$2"; shift 2 ;;
        -h|--help)
            echo "Usage: $0 [--addon <app>] [--ip <vm-ip>] [--user <ssh-user>] [--path <remote-addons-path>]"
            echo ""
            echo "Options:"
            echo "  --ip      VM IP address (or set VM_IP env var)"
            echo "  --user    SSH user (default: root)"
            echo "  --path    Remote addons path (default: /root/addons)"
            echo ""
            echo "Environment variables:"
            echo "  VM_IP     VM IP address (auto-detected from UTM VM 'HAOS' if not set)"
            echo ""
            echo "Examples:"
            echo "  export VM_IP=192.168.64.2"
            echo "  $0                                    # Deploy duplicati"
            echo "  $0 --ip 192.168.64.5                  # Manual IP"
            exit 0 ;;
        *)
            echo "Unknown option: $1"; exit 1 ;;
    esac
done

if [[ ! "$ADDON" =~ ^[a-z0-9_-]+$ ]] || [[ ! -f "${REPO_ROOT}/${ADDON}/config.yaml" ]]; then
    echo "Unknown app: $ADDON"; exit 1
fi
if [[ ! "$VM_USER" =~ ^[a-z_][a-z0-9_-]*$ ]] || [[ ! "$VM_ADDONS_PATH" =~ ^/[a-zA-Z0-9_/-]+$ ]]; then
    echo "Unsupported VM user or path"; exit 1
fi
ADDON_DIR="${REPO_ROOT}/${ADDON}"

# Auto-detect VM_IP from UTM if not set
if [[ -z "${VM_IP:-}" ]]; then
    if command -v osascript &>/dev/null; then
        echo "VM_IP not set, querying UTM for HAOS VM IP..."
        VM_IP=$(osascript -e 'tell application "UTM" to get item 1 of (query ip of virtual machine named "HAOS")' 2>/dev/null || true)
        if [[ -n "$VM_IP" ]]; then
            echo "Detected VM_IP from UTM: ${VM_IP}"
        fi
    fi
fi

if [[ ! "$VM_IP" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]]; then
    echo "Unsupported VM address"; exit 1
fi

if [[ -z "${VM_IP:-}" ]]; then
    echo "Error: VM_IP not set and could not auto-detect from UTM."
    echo "  Use --ip flag, export VM_IP=<ip>, or ensure UTM VM 'HAOS' is running."
    echo "  Example: export VM_IP=192.168.64.2"
    exit 1
fi

echo "============================================"
echo " Deploy to HA VM"
echo "============================================"
echo "  Addon:     ${ADDON}"
echo "  VM:        ${VM_USER}@${VM_IP}"
echo "  Remote:    ${VM_ADDONS_PATH}/${ADDON}/"
echo "============================================"
echo ""

# Check SSH connectivity
echo "Checking SSH connectivity..."
if ! ssh -o ConnectTimeout=5 -o BatchMode=yes "${VM_USER}@${VM_IP}" "echo ok" &>/dev/null; then
    echo "Error: Cannot connect to ${VM_USER}@${VM_IP}"
    echo "Make sure:"
    echo "  1. The VM is running"
    echo "  2. SSH is enabled on the VM"
    echo "  3. You can connect with: ssh ${VM_USER}@${VM_IP}"
    exit 1
fi
echo "SSH connection OK"
echo ""

# Create remote addon directory
echo "Creating remote directory..."
ssh "${VM_USER}@${VM_IP}" "mkdir -p '${VM_ADDONS_PATH}/${ADDON}'"

# Sync entire addon directory
echo "Syncing ${ADDON} app..."
rsync -avz --progress --delete \
    --exclude '.DS_Store' \
    "${ADDON_DIR}/" \
    "${VM_USER}@${VM_IP}:${VM_ADDONS_PATH}/${ADDON}/"

# Remove image field so HA builds locally from Dockerfile
echo ""
echo "Removing image field for local build..."
ssh "${VM_USER}@${VM_IP}" "sed -i '/^image:/d' '${VM_ADDONS_PATH}/${ADDON}/config.yaml'"

echo ""
echo "============================================"
echo " Deploy complete!"
echo "============================================"
echo ""
echo "Next steps on the VM:"
echo "  1. Open HA at http://${VM_IP}:8123"
echo "  2. Go to Settings > Add-ons > Add-on Store"
echo "  3. Click the three dots menu > Check for updates"
echo "  4. The '${ADDON}' app should appear under 'Local add-ons'"
echo "  5. Install or rebuild the addon"
echo ""
echo "To rebuild after changes:"
echo "  ha addons rebuild local_${ADDON}"
echo ""
echo "To watch logs:"
echo "  ssh ${VM_USER}@${VM_IP} 'ha addons logs local_${ADDON} --follow'"
