#!/usr/bin/env python3
"""
Kandela Kulture - Image WebP Refinement Utility
Refines all raster assets (PNG & JPEG) in public/assets/freeform to modern WebP format:
- Specs & Graphic Sheets -> Lossless WebP (pixel-perfect vector/text fidelity, up to 80% smaller)
- Moodboard Collages     -> High-Fidelity Lossy WebP (q=90, 80%+ smaller)
- Gathering Photographs  -> Crisp Photo Lossy WebP (q=88, 50%+ smaller)
"""

import os
import sys
import json
import hashlib
from PIL import Image

FREEFORM_DIR = os.path.abspath('public/assets/freeform')

def sha256_short(path):
    with open(path, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()[:16]

def refine_image(src_path, dst_path, is_photo=False, is_moodboard=False):
    im = Image.open(src_path)
    # Ensure RGB if RGBA without transparency
    if im.mode == 'RGBA' and not is_photo:
        # Keep RGBA for graphics/lockups
        pass
    elif im.mode not in ('RGB', 'RGBA'):
        im = im.convert('RGB')
    
    orig_bytes = os.path.getsize(src_path)
    
    if is_photo:
        # Photo: lossy q=88
        im.save(dst_path, 'WEBP', quality=88, method=6)
    elif is_moodboard:
        # Moodboard photo collage: lossy q=90
        im.save(dst_path, 'WEBP', quality=90, method=6)
    else:
        # Spec sheet / brand lockup: lossless
        im.save(dst_path, 'WEBP', lossless=True, method=6)
        
    new_bytes = os.path.getsize(dst_path)
    ratio = (1 - (new_bytes / orig_bytes)) * 100
    
    # Verify readability
    test_im = Image.open(dst_path)
    test_im.verify()
    
    # Remove original source file
    os.remove(src_path)
    
    return {
        'old': os.path.basename(src_path),
        'new': os.path.basename(dst_path),
        'orig_bytes': orig_bytes,
        'new_bytes': new_bytes,
        'saved_bytes': orig_bytes - new_bytes,
        'ratio': ratio,
        'dimensions': f"{im.width}x{im.height}"
    }

def main():
    print("Refining all raster images in public/assets/freeform to WebP...")
    results = []
    total_orig = 0
    total_new = 0
    
    # 1. Brand lockups
    brand_dir = os.path.join(FREEFORM_DIR, 'brand')
    for f in sorted(os.listdir(brand_dir)):
        if f.endswith('.png'):
            src = os.path.join(brand_dir, f)
            dst = os.path.join(brand_dir, os.path.splitext(f)[0] + '.webp')
            res = refine_image(src, dst, is_photo=False)
            results.append(('brand', res))
            print(f"  [brand] {res['old']} -> {res['new']}: {res['orig_bytes']//1024}KB -> {res['new_bytes']//1024}KB (-{res['ratio']:.1f}%)")
            total_orig += res['orig_bytes']
            total_new += res['new_bytes']
            
    # 2. Specs & Moodboards
    specs_dir = os.path.join(FREEFORM_DIR, 'specs')
    for f in sorted(os.listdir(specs_dir)):
        if f.endswith('.png'):
            src = os.path.join(specs_dir, f)
            dst = os.path.join(specs_dir, os.path.splitext(f)[0] + '.webp')
            is_mb = 'moodboard' in f
            res = refine_image(src, dst, is_moodboard=is_mb)
            results.append(('specs', res))
            print(f"  [specs] {res['old']} -> {res['new']}: {res['orig_bytes']//1024}KB -> {res['new_bytes']//1024}KB (-{res['ratio']:.1f}%)")
            total_orig += res['orig_bytes']
            total_new += res['new_bytes']
            
    # 3. Gathering Photography
    photos_dir = os.path.join(FREEFORM_DIR, 'photos')
    manifest_path = os.path.join(photos_dir, 'manifest.json')
    old_manifest = []
    if os.path.exists(manifest_path):
        with open(manifest_path, 'r', encoding='utf-8') as f:
            old_manifest = json.load(f)
            
    manifest_map = {item['file']: item for item in old_manifest}
    new_manifest = []
    
    for root, _, files in sorted(os.walk(photos_dir)):
        for f in sorted(files):
            if f.endswith('.jpg') or f.endswith('.jpeg'):
                src = os.path.join(root, f)
                rel_src = os.path.relpath(src, FREEFORM_DIR).replace('\\', '/')
                dst_name = os.path.splitext(f)[0] + '.webp'
                dst = os.path.join(root, dst_name)
                rel_dst = os.path.relpath(dst, FREEFORM_DIR).replace('\\', '/')
                
                res = refine_image(src, dst, is_photo=True)
                results.append(('photos', res))
                print(f"  [photo] {res['old']} -> {res['new']}: {res['orig_bytes']//1024}KB -> {res['new_bytes']//1024}KB (-{res['ratio']:.1f}%)")
                total_orig += res['orig_bytes']
                total_new += res['new_bytes']
                
                # Update manifest entry
                meta = manifest_map.get(rel_src, {})
                im = Image.open(dst)
                new_manifest.append({
                    'file': rel_dst,
                    'originalName': meta.get('originalName', res['old']),
                    'dimensions': f"{im.width}x{im.height}",
                    'aspectRatio': 'landscape' if im.width > im.height else 'portrait' if im.width < im.height else 'square',
                    'bytes': res['new_bytes'],
                    'origBytes': res['orig_bytes'],
                    'savingsPercent': f"{res['ratio']:.1f}%",
                    'sha256': sha256_short(dst),
                    'caption': meta.get('caption', f"Community gathering photograph ({dst_name})")
                })
                
    # Save updated manifest
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(new_manifest, f, indent=2)
        
    print("\nSummary:")
    print(f"  Total images refined: {len(results)}")
    print(f"  Original total size:  {total_orig / (1024*1024):.2f} MB")
    print(f"  Refined WebP size:    {total_new / (1024*1024):.2f} MB")
    saved_mb = (total_orig - total_new) / (1024*1024)
    saved_pct = (1 - (total_new / total_orig)) * 100
    print(f"  Total space saved:    {saved_mb:.2f} MB ({saved_pct:.1f}% reduction)")

if __name__ == '__main__':
    main()
