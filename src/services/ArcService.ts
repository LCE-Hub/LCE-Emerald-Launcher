import { ArcEntry, ArcFile, LocFile, LocLanguage, LocString } from "../types/arc";
export class ArcService {
  private static enc = new TextEncoder();
  private static dec = new TextDecoder('utf-8');
  private static readUTF(view: DataView, off: number): { str: string; next: number } {
    const len = view.getUint16(off, false);
    const bytes = new Uint8Array(view.buffer, view.byteOffset + off + 2, len);
    return { str: this.dec.decode(bytes), next: off + 2 + len };
  }

  private static writeUTF(str: string): Uint8Array {
    const b = this.enc.encode(str);
    const out = new Uint8Array(2 + b.length);
    new DataView(out.buffer).setUint16(0, b.length, false);
    out.set(b, 2);
    return out;
  }

  static async readARC(buffer: ArrayBuffer): Promise<ArcFile> {
    const view = new DataView(buffer);
    const raw = new Uint8Array(buffer);
    let off = 0;
    const count = view.getInt32(off, false);
    off += 4;
    if (count < 0 || count > 200000) throw new Error("Invalid file count");
    const entries: ArcEntry[] = [];
    for (let i = 0; i < count; i++) {
      const { str: rawName, next } = this.readUTF(view, off);
      off = next;
      const ptr = view.getInt32(off, false);
      off += 4;
      const size = view.getInt32(off, false);
      off += 4;
      let filename = rawName;
      let isCompressed = false;
      if (filename.charCodeAt(0) === 42) {
        isCompressed = true;
        filename = filename.slice(1);
      }

      const data = (ptr + size <= raw.length) ? raw.slice(ptr, ptr + size) : new Uint8Array(0);
      entries.push({ filename, ptr, size, isCompressed, data });
    }

    return { name: "", entries };
  }

  static serializeARC(arc: ArcFile): ArrayBuffer {
    let headerSize = 4;
    arc.entries.forEach(e => {
      const nameWithFlag = (e.isCompressed ? "*" : "") + e.filename;
      headerSize += 2 + this.enc.encode(nameWithFlag).length + 8;
    });

    let currentOffset = headerSize;
    const offsets = arc.entries.map(e => {
      const o = currentOffset;
      currentOffset += e.size;
      return o;
    });

    const buffer = new ArrayBuffer(currentOffset);
    const view = new DataView(buffer);
    const out = new Uint8Array(buffer);
    let pos = 0;
    view.setInt32(pos, arc.entries.length, false);
    pos += 4;
    arc.entries.forEach((e, i) => {
      const nb = this.enc.encode((e.isCompressed ? "*" : "") + e.filename);
      view.setUint16(pos, nb.length, false);
      pos += 2;
      out.set(nb, pos);
      pos += nb.length;
      view.setInt32(pos, offsets[i], false);
      pos += 4;
      view.setInt32(pos, e.size, false);
      pos += 4;
    });

    arc.entries.forEach((e, i) => {
      if (e.data.length > 0) {
        out.set(e.data, offsets[i]);
      }
    });

    return buffer;
  }

  static parseLOC(data: Uint8Array): LocFile {
    const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    const view = new DataView(buf);
    let off = 0;
    const version = view.getInt32(off, false);
    off += 4;
    const langCount = view.getInt32(off, false);
    off += 4;
    const langMeta: { id: string, size: number }[] = [];
    for (let i = 0; i < langCount; i++) {
      const { str: id, next } = this.readUTF(view, off);
      off = next;
      const size = view.getInt32(off, false);
      off += 4;
      langMeta.push({ id, size });
    }

    const languages: LocLanguage[] = [];
    for (let i = 0; i < langMeta.length; i++) {
      const blobView = new DataView(buf, off, langMeta[i].size);
      let boff = 0;
      const langVer = blobView.getInt32(boff, false);
      boff += 4;
      let isStatic = false;
      if (langVer > 0) {
        isStatic = blobView.getUint8(boff) !== 0;
        boff += 1;
      }
      const { str: langId, next: n2 } = this.readUTF(blobView, boff);
      boff = n2;
      const total = blobView.getInt32(boff, false);
      boff += 4;
      const strings: LocString[] = [];
      if (!isStatic) {
        for (let j = 0; j < total; j++) {
          const { str: key, next: nk } = this.readUTF(blobView, boff);
          boff = nk;
          const { str: val, next: nv } = this.readUTF(blobView, boff);
          boff = nv;
          strings.push({ key, value: val });
        }
      } else {
        for (let j = 0; j < total; j++) {
          const { str: val, next: nv } = this.readUTF(blobView, boff);
          boff = nv;
          strings.push({ value: val });
        }
      }

      languages.push({ id: langMeta[i].id, version: langVer, isStatic, langId, strings });
      off += langMeta[i].size;
    }

    return { version, languages };
  }

  static serializeLOC(loc: LocFile): Uint8Array {
    const blobs = loc.languages.map(lang => {
      const parts: Uint8Array[] = [];
      const vh = new Uint8Array(4);
      new DataView(vh.buffer).setInt32(0, lang.version, false);
      parts.push(vh);
      if (lang.version > 0) {
        parts.push(new Uint8Array([lang.isStatic ? 1 : 0]));
      }

      parts.push(this.writeUTF(lang.langId));
      const sc = new Uint8Array(4);
      new DataView(sc.buffer).setInt32(0, lang.strings.length, false);
      parts.push(sc);
      lang.strings.forEach(s => {
        if (!lang.isStatic && s.key) {
          parts.push(this.writeUTF(s.key));
        }
        parts.push(this.writeUTF(s.value));
      });

      const total = parts.reduce((a, b) => a + b.length, 0);
      const blob = new Uint8Array(total);
      let p = 0;
      parts.forEach(b => {
        blob.set(b, p);
        p += b.length;
      });
      return blob;
    });

    const headerParts: Uint8Array[] = [];
    const vh = new Uint8Array(4);
    new DataView(vh.buffer).setInt32(0, loc.version, false);
    headerParts.push(vh);
    const lc = new Uint8Array(4);
    new DataView(lc.buffer).setInt32(0, loc.languages.length, false);
    headerParts.push(lc);
    loc.languages.forEach((lang, i) => {
      headerParts.push(this.writeUTF(lang.id));
      const sz = new Uint8Array(4);
      new DataView(sz.buffer).setInt32(0, blobs[i].length, false);
      headerParts.push(sz);
    });

    const allParts = [...headerParts, ...blobs];
    const total = allParts.reduce((a, b) => a + b.length, 0);
    const out = new Uint8Array(total);
    let p = 0;
    allParts.forEach(b => {
      out.set(b, p);
      p += b.length;
    });
    return out;
  }
}
