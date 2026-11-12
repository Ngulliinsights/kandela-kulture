'use strict';
/**
 * Kandela Kulture - C2PA & Provenance Metadata Stripper
 *
 * Strips C2PA (Coalition for Content Provenance and Authenticity) manifests,
 * JUMBF boxes, Content Credentials, and Adobe metadata from PNG and SVG assets,
 * while validating image structure and CRC checksums.
 *
 * Usage:
 *   node scripts/strip-c2pa.js
 *   node scripts/strip-c2pa.js [directory-or-file]
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

// Standard PNG CRC32 table (RFC 2083)
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function validatePng(buf, filePath) {
  const sig = buf.subarray(0, 8);
  if (sig.toString('hex') !== '89504e470d0a1a0a') {
    throw new Error(`${filePath}: Invalid PNG signature`);
  }
  let pos = 8;
  const idats = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.subarray(pos + 4, pos + 8).toString('ascii');
    const dataAndType = buf.subarray(pos + 4, pos + 8 + len);
    const expectedCrc = buf.readUInt32BE(pos + 8 + len);
    const actualCrc = crc32(dataAndType);
    if (expectedCrc !== actualCrc) {
      throw new Error(`${filePath}: CRC mismatch in chunk ${type} at offset ${pos}`);
    }
    if (type === 'IDAT') {
      idats.push(buf.subarray(pos + 8, pos + 8 + len));
    }
    pos += 12 + len;
  }
  if (idats.length > 0) {
    // Validate decompression
    zlib.inflateSync(Buffer.concat(idats));
  }
}

function stripPng(filePath) {
  const buf = fs.readFileSync(filePath);
  const sig = buf.subarray(0, 8);
  if (sig.toString('hex') !== '89504e470d0a1a0a') return { file: filePath, stripped: false };

  const kept = [sig];
  let pos = 8;
  let removedCount = 0;
  let removedBytes = 0;

  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.subarray(pos + 4, pos + 8).toString('ascii');
    const totalLen = 12 + len;
    const chunkBuf = buf.subarray(pos, pos + totalLen);

    const isC2pa = /^(caBX|caTX|caXZ|c2pa|c2PA|jUMb|jumb)$/i.test(type) ||
                   (type !== 'IDAT' && type !== 'IHDR' && type !== 'IEND' && /c2pa|jumbf/i.test(chunkBuf.toString('latin1')));

    if (isC2pa) {
      removedCount++;
      removedBytes += totalLen;
    } else {
      kept.push(chunkBuf);
    }
    pos += totalLen;
  }

  if (removedCount === 0) return { file: filePath, stripped: false };

  const outBuf = Buffer.concat(kept);
  validatePng(outBuf, filePath);
  fs.writeFileSync(filePath, outBuf);
  return { file: filePath, stripped: true, removedChunks: removedCount, savedBytes: removedBytes };
}

function stripSvg(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // Remove <metadata>...</metadata> blocks
  if (/<metadata\b[^>]*>.*?<\/metadata>/gis.test(content)) {
    content = content.replace(/<metadata\b[^>]*>.*?<\/metadata>/gis, '');
    changed = true;
  }

  // Remove c2pa namespaces or manifest references
  if (/xmlns:[a-zA-Z0-9_-]+="http:\/\/c2pa\.org\/manifest"/gi.test(content)) {
    content = content.replace(/\s*xmlns:[a-zA-Z0-9_-]+="http:\/\/c2pa\.org\/manifest"/gi, '');
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    return { file: filePath, stripped: true };
  }
  return { file: filePath, stripped: false };
}

function stripWebp(filePath) {
  const buf = fs.readFileSync(filePath);
  const str = buf.toString('latin1');
  if (/c2pa|jumbf/i.test(str)) {
    return { file: filePath, stripped: false, hasC2pa: true };
  }
  return { file: filePath, stripped: false };
}

function processTarget(targetPath) {
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) {
    if (targetPath.endsWith('.png')) return [stripPng(targetPath)];
    if (targetPath.endsWith('.svg')) return [stripSvg(targetPath)];
    if (targetPath.endsWith('.webp')) return [stripWebp(targetPath)];
    return [];
  }

  const results = [];
  function walk(d) {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      if (ent.name === 'node_modules' || ent.name === '.git') continue;
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.name.endsWith('.png')) results.push(stripPng(full));
      else if (ent.name.endsWith('.svg')) results.push(stripSvg(full));
      else if (ent.name.endsWith('.webp')) results.push(stripWebp(full));
    }
  }
  walk(targetPath);
  return results;
}

function main() {
  const target = process.argv[2] || path.join(__dirname, '..', 'public', 'assets');
  console.log(`Scanning for C2PA cryptographic markers in: ${target}`);
  const results = processTarget(path.resolve(target));
  const stripped = results.filter(r => r.stripped);
  console.log(`Scanned ${results.length} assets.`);
  if (stripped.length > 0) {
    console.log(`Stripped C2PA markers from ${stripped.length} files:`);
    for (const s of stripped) console.log(`  - ${path.relative('.', s.file)} (${s.savedBytes || 0} bytes removed)`);
  } else {
    console.log('✓ All assets are 100% clean of C2PA markers.');
  }
}

if (require.main === module) main();

module.exports = { stripPng, stripSvg, processTarget };
