// Minimal, dependency-free ZIP reader (enough for .docx: stored + deflate).
import zlib from 'node:zlib';

export function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip archive');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('bad central directory');
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const local = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    files.set(name, { method, csize, local });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return {
    names: () => [...files.keys()],
    read(name) {
      const f = files.get(name);
      if (!f) return null;
      const start = f.local + 30 + buf.readUInt16LE(f.local + 26) + buf.readUInt16LE(f.local + 28);
      const data = buf.subarray(start, start + f.csize);
      if (f.method === 0) return data;
      if (f.method === 8) return zlib.inflateRawSync(data);
      throw new Error(`unsupported zip compression method ${f.method}`);
    },
  };
}
