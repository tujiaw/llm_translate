#!/usr/bin/env node
/**
 * Edge / Chrome 扩展打包脚本（零依赖，Node >= 18）
 *
 * 用法:  node package-extension.mjs
 *
 * - 自动读取 manifest.json 的 name / version 生成输出文件名
 * - manifest.json 位于压缩包根目录（符合商店发布规范）
 * - 仅打包明确列出的文件，排除 .git / 隐藏文件 / README 等
 * - 输出到 dist/<slug>-<version>.zip
 */
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));

/* ---------------- 打包文件清单 ---------------- */
const ROOT_FILES = [
  'manifest.json',
  'api.js',
  'background.js',
  'config.js',
  'content.css',
  'content.js',
  'messaging.js',
  'popup.css',
  'popup.html',
  'popup.js',
  'preview.html',
  'translator.js',
  'ui.js',
  'utils.js',
  'webpage_translator.js',
];

function collectImageFiles() {
  const dir = join(ROOT, 'images');
  return readdirSync(dir)
    .filter((f) => /\.(png|svg)$/i.test(f))
    .sort()
    .map((f) => `images/${f}`);
}

/* ---------------- 校验 + 读取 manifest ---------------- */
function loadManifest() {
  const raw = readFileSync(join(ROOT, 'manifest.json'), 'utf8');
  const m = JSON.parse(raw);
  if (m.manifest_version !== 3) {
    console.error(`[错误] manifest_version 必须为 3，当前为 ${m.manifest_version}`);
    process.exit(1);
  }
  return m;
}

/* ---------------- 最小 ZIP 写入器（DEFLATE, UTF-8 文件名） ---------------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function toDosDateTime(d) {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

function makeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const { name, data, mtime } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const compressed = deflateRawSync(data);
    const crc = crc32(data);
    const { time, date } = toDosDateTime(mtime);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // PK\x03\x04
    local.writeUInt16LE(20, 4);         // version needed
    local.writeUInt16LE(0x0800, 6);     // flags: UTF-8 names
    local.writeUInt16LE(8, 8);          // method: DEFLATE
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);         // extra len
    const localEntry = Buffer.concat([local, nameBuf, compressed]);
    locals.push(localEntry);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); // PK\x01\x02
    cen.writeUInt16LE(20, 4);          // version made by
    cen.writeUInt16LE(20, 6);          // version needed
    cen.writeUInt16LE(0x0800, 8);      // UTF-8
    cen.writeUInt16LE(8, 10);          // DEFLATE
    cen.writeUInt16LE(time, 12);
    cen.writeUInt16LE(date, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(compressed.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt16LE(0, 30);          // extra
    cen.writeUInt16LE(0, 32);          // comment
    cen.writeUInt16LE(0, 34);          // disk number
    cen.writeUInt16LE(0, 36);          // internal attrs
    cen.writeUInt32LE(0, 38);          // external attrs
    cen.writeUInt32LE(offset, 42);     // local header offset
    centrals.push(Buffer.concat([cen, nameBuf]));

    offset += localEntry.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // PK\x05\x06
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, centralBuf, eocd]);
}

/* ---------------- 收集文件 ---------------- */
function collectEntries() {
  const files = [...ROOT_FILES, ...collectImageFiles()];
  const entries = [];
  for (const rel of files) {
    const abs = join(ROOT, rel);
    try {
      const data = readFileSync(abs);
      if (data.length === 0) {
        console.warn(`[警告] ${rel} 为空文件，商店会拒绝空文件`);
      }
      entries.push({ name: rel, data, mtime: statSync(abs).mtime });
      console.log(`  + ${rel}`);
    } catch (err) {
      console.error(`[错误] 缺少文件: ${rel} (${err.code})`);
      process.exit(1);
    }
  }
  return entries;
}

/* ---------------- 主流程 ---------------- */
const manifest = loadManifest();
const slug = manifest.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const outDir = join(ROOT, 'dist');
const outFile = join(outDir, `${slug}-${manifest.version}.zip`);

console.log(`打包扩展: ${manifest.name} v${manifest.version}`);
console.log('文件清单:');
const entries = collectEntries();

const zip = makeZip(entries);
mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, zip);

const sizeMB = (zip.length / 1024 / 1024).toFixed(2);
console.log(`\n完成: ${outFile} (${zip.length} 字节, ${sizeMB} MB, ${entries.length} 个文件)`);
console.log('manifest 位于包根目录: 是');
