#!/usr/bin/env bash
set -euo pipefail

#
# Wait for disk with given ID to be available
# Supports multiple cloud providers with different disk identification methods
#

TARGET_ID="$1"
TIMEOUT=${2:-180}
INTERVAL=2
ELAPSED=0

# Normalize volume ID: AWS stores vol-xxxxx as volxxxxx in serial numbers
# Remove the hyphen for comparison
TARGET_ID_NORMALIZED="${TARGET_ID/vol-/vol}"

# Get root disk to exclude it from search
get_root_disk() {
    local root_part=$(df / | awk 'NR==2 {print $1}')
    local root_disk=$(lsblk -no PKNAME "$root_part" 2>/dev/null || true)
    
    # Fallback if PKNAME is empty
    if [ -z "$root_disk" ]; then
        root_disk=$(echo "$root_part" | sed 's|^/dev/||; s/[0-9]*$//' | sed 's/p$//')
    fi
    
    echo "$root_disk"
}

while [ $ELAPSED -lt $TIMEOUT ]; do

    # Method 1: Generic approach - find disk by volume ID
    # Works for all cloud providers (AWS, Scaleway, GCP, etc.)
    if [ -d /dev/disk/by-id ]; then
        root_disk=$(get_root_disk)
        
        # Look through all block devices in by-id
        for id in /dev/disk/by-id/*; do
            # Skip if glob didn't match anything
            [ -e "$id" ] || continue
            
            # Skip symbolic links that are just aliases (dm-, lvm-, etc.)
            [[ "$id" == *"by-id/dm-"* ]] && continue
            [[ "$id" == *"by-id/lvm-"* ]] && continue
            [[ "$id" == *"-part"* ]] && continue
            
            # For AWS: Skip ephemeral/instance store disks (only check EBS volumes)
            # Instance store disks have "nvme-Amazon_EC2_NVMe_Instance_Storage" in their name
            [[ "$id" == *"Instance_Storage"* ]] && continue
            [[ "$id" == *"nvme-nvme."* ]] && continue
            
            # Extract volume ID from the by-id path for exact matching
            # For AWS: nvme-Amazon_Elastic_Block_Store_vol020e58e4e338d31a2
            # For Scaleway/others: may have UUID format
            vol_id_in_path=$(echo "$id" | grep -oP '(vol-?[0-9a-f]+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})' | head -n1 || true)
            
            # Skip if no volume ID found in path
            [ -z "$vol_id_in_path" ] && continue
            
            # Normalize both for comparison
            vol_id_normalized="${vol_id_in_path/vol-/vol}"
            target_normalized="${TARGET_ID/vol-/vol}"
            
            # Check if this is our target volume (exact match after normalization)
            if [ "$vol_id_normalized" == "$target_normalized" ]; then
                dev=$(readlink -f "$id")
                base=$(basename "$dev")
                disk_name=$(echo "$base" | sed 's/[0-9]*$//' | sed 's/p$//')
                
                # Verify it's not the root disk and is a block device
                if [ "$disk_name" != "$root_disk" ] && [ -b "$dev" ]; then
                    echo "$(basename "$dev")"
                    exit 0
                fi
            fi
        done
    fi

    # Method 2: Direct NVMe check for AWS (if nvme-cli is available)
    if command -v nvme &> /dev/null; then
        root_disk=$(get_root_disk)
        
        for dev in /dev/nvme*n1; do
            [ -b "$dev" ] || continue
            
            base=$(basename "$dev")
            disk_name=$(echo "$base" | sed 's/[0-9]*$//' | sed 's/p$//')
            
            # Skip root disk
            [ "$disk_name" == "$root_disk" ] && continue
            
            # Try multiple methods to get volume ID
            vol_id=$(nvme id-ctrl -v "$dev" 2>/dev/null | grep -i 'sn\s*:' | grep -oP 'vol-[0-9a-f]+' | head -n1 || true)
            
            if [ -z "$vol_id" ]; then
                vol_id=$(nvme id-ctrl "$dev" 2>/dev/null | grep -oP 'vol-[0-9a-f]+' | head -n1 || true)
            fi
            
            # If no vol-xxx found, it's likely an instance store disk, skip it
            [ -z "$vol_id" ] && continue
            
            # Normalize for comparison (AWS stores without hyphen)
            vol_id_normalized="${vol_id/vol-/vol}"
            target_normalized="${TARGET_ID/vol-/vol}"
            
            if [ "$vol_id" == "$TARGET_ID" ] || [ "$vol_id_normalized" == "$target_normalized" ]; then
                echo "$(basename "$dev")"
                exit 0
            fi
        done
    fi

    # Method 3: Fallback using lsblk serial numbers
    if command -v lsblk &> /dev/null; then
        root_disk=$(get_root_disk)
        
        # Get all disks with their serial numbers
        while IFS= read -r line; do
            disk_name=$(echo "$line" | awk '{print $1}')
            serial=$(echo "$line" | awk '{print $2}')
            
            # Skip if no serial or doesn't match target (check both with and without hyphen)
            [ -z "$serial" ] && continue
            if [[ "$serial" != *"$TARGET_ID"* ]] && [[ "$serial" != *"$TARGET_ID_NORMALIZED"* ]]; then
                continue
            fi
            
            # For AWS: Skip instance store disks (they don't have vol-xxx IDs)
            # Only accept disks with proper volume IDs (vol-xxxxx format)
            if [[ "$TARGET_ID" == vol-* ]] && [[ "$serial" != *"vol-"* ]]; then
                continue
            fi
            
            # Get the base disk name without partition numbers
            base_disk=$(echo "$disk_name" | sed 's/[0-9]*$//' | sed 's/p$//')
            
            # Skip root disk
            [ "$base_disk" == "$root_disk" ] && continue
            
            echo "$disk_name"
            exit 0
        done < <(lsblk -o NAME,SERIAL -rn 2>/dev/null)
    fi

    sleep $INTERVAL
    ELAPSED=$((ELAPSED + INTERVAL))
done

echo "Device with ID $TARGET_ID not found within timeout" >&2
exit 1