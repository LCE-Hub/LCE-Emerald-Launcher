use std::collections::HashMap;
use std::collections::HashSet;
use std::fs;
use std::io::{Read, Write};
use std::path::Path;
use tauri::AppHandle;
const STFS_MAGIC: [u8; 4] = *b"CON ";
const STFS_BASE_OFFSET: usize = 0xA000;
const STFS_BLOCK_SIZE: usize = 0x1000;
const STFS_BLOCKS_PER_GRP: usize = 170;
const FILE_ENTRY_SIZE: usize = 144;
const REGION_SECT_COUNT: usize = 1024;
const LZX_BLOCK_SIZE: usize = 0x8000;
const SFO_FMT_UTF8_RAW: u16 = 0x0004;
const SFO_FMT_UTF8_STR: u16 = 0x0204;
const SFO_FMT_INT32: u16 = 0x0404;
const LEVELNAME_SIG: &[u8] = b"\x08\x00\x09LevelName";
const PLAYER_POS_SIG: &[u8] = b"\x09\x00\x03Pos\x06\x00\x00\x00\x03";
struct StfsEntry {
    name: String,
    start_block: usize,
    size: usize,
}

struct FileEntry {
    filename: String,
    length: u32,
    start_offset: u32,
    last_mod: i64,
}

fn s32(buf: &mut [u8], o: usize) {
    buf[o..o + 4].reverse();
}

fn read_hdr_be(data: &[u8]) -> (u32, u32, i16, i16) {
    let ho = u32::from_be_bytes([data[0], data[1], data[2], data[3]]);
    let ne = u32::from_be_bytes([data[4], data[5], data[6], data[7]]);
    let ov = i16::from_be_bytes([data[8], data[9]]);
    let cv = i16::from_be_bytes([data[10], data[11]]);
    (ho, ne, ov, cv)
}

fn parse_ftable_be(data: &[u8], ho: u32, ne: u32) -> Vec<FileEntry> {
    let mut out = Vec::new();
    for i in 0..ne {
        let base = ho as usize + i as usize * FILE_ENTRY_SIZE;
        if base + FILE_ENTRY_SIZE > data.len() {
            break;
        }
        let raw = &data[base..base + FILE_ENTRY_SIZE];
        let fn_u16s: Vec<u16> = (0..64)
            .map(|j| u16::from_be_bytes([raw[j * 2], raw[j * 2 + 1]]))
            .collect();
        let fn_str: String = fn_u16s
            .iter()
            .take_while(|&&c| c != 0)
            .filter_map(|&c| char::from_u32(c as u32))
            .collect();
        let length = u32::from_be_bytes([raw[128], raw[129], raw[130], raw[131]]);
        let start_offset = u32::from_be_bytes([raw[132], raw[133], raw[134], raw[135]]);
        let last_mod = i64::from_be_bytes([
            raw[136], raw[137], raw[138], raw[139], raw[140], raw[141], raw[142], raw[143],
        ]);
        if !fn_str.is_empty() && length > 0 {
            out.push(FileEntry {
                filename: fn_str,
                length,
                start_offset,
                last_mod,
            });
        }
    }
    out
}

fn sanitise(name: &str) -> String {
    let mut s = String::new();
    let mut prev_underscore = false;
    for c in name.chars() {
        let replace = c.is_control()
            || matches!(
                c,
                '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'
            );
        let c = if replace { '_' } else { c };
        if c == '_' {
            if !prev_underscore {
                s.push(c);
            }
            prev_underscore = true;
        } else {
            s.push(c);
            prev_underscore = false;
        }
    }
    let s = s.trim_matches(|c: char| c == '_' || c == '.' || c == ' ');
    let s = if s.len() > 64 { &s[..64] } else { s };
    if s.is_empty() {
        "MinecraftSave".to_string()
    } else {
        s.to_string()
    }
}

fn stfs_block_offset(block_num: usize, table_shift: usize) -> usize {
    let g = block_num / STFS_BLOCKS_PER_GRP;
    let hash_before = if g == 0 {
        2
    } else {
        3 + 2 * g + table_shift
    };
    STFS_BASE_OFFSET + (block_num + hash_before) * STFS_BLOCK_SIZE
}

fn stfs_get_hash_entry(raw: &[u8], block_num: usize, table_shift: usize) -> Option<usize> {
    let group = block_num / STFS_BLOCKS_PER_GRP;
    let first_data = stfs_block_offset(group * STFS_BLOCKS_PER_GRP, table_shift);
    let idx = (block_num % STFS_BLOCKS_PER_GRP) * 0x18;
    for gap in &[2, 1] {
        let hash_off = first_data - STFS_BLOCK_SIZE * gap;
        let entry_off = hash_off + idx;
        if entry_off + 0x18 > raw.len() {
            continue;
        }
        let nxt = ((raw[entry_off + 0x15] as usize) << 16)
            | ((raw[entry_off + 0x16] as usize) << 8)
            | raw[entry_off + 0x17] as usize;
        if nxt != 0xFFFFFF {
            return Some(nxt);
        }
    }
    None
}

fn stfs_read_file(raw: &[u8], start: usize, size: usize, table_shift: usize) -> Vec<u8> {
    let max_block = (raw.len().saturating_sub(STFS_BASE_OFFSET)) / STFS_BLOCK_SIZE;
    let mut out = Vec::with_capacity(size);
    let mut blk = start;
    let mut rem = size;
    while rem > 0 {
        let off = stfs_block_offset(blk, table_shift);
        let end = (off + STFS_BLOCK_SIZE).min(raw.len());
        if off >= raw.len() {
            break;
        }
        let chunk = &raw[off..end];
        let take = rem.min(chunk.len());
        out.extend_from_slice(&chunk[..take]);
        rem -= take;
        match stfs_get_hash_entry(raw, blk, table_shift) {
            Some(nxt) if nxt > 0 && nxt < max_block => blk = nxt,
            _ => blk += 1,
        }
    }
    out
}

struct StfsPackage {
    raw: Vec<u8>,
    table_shift: usize,
}

impl StfsPackage {
    const DISP_OFF: usize = 0x0411;
    const DISP_LEN: usize = 128;
    const THUMB_OFF: usize = 0x171A;
    fn new(raw: Vec<u8>) -> Result<Self, String> {
        if raw.len() < 4 || raw[..4] != STFS_MAGIC {
            return Err(format!(
                "Not an STFS CON file (magic={:?})",
                &raw[..4.min(raw.len())]
            ));
        }
        Ok(Self {
            raw,
            table_shift: 1,
        })
    }

    fn read_block(&self, b: usize) -> Vec<u8> {
        let o = stfs_block_offset(b, self.table_shift);
        let end = (o + STFS_BLOCK_SIZE).min(self.raw.len());
        self.raw[o..end].to_vec()
    }

    fn display_name(&self) -> String {
        let start = Self::DISP_OFF;
        let end = (start + Self::DISP_LEN * 2).min(self.raw.len());
        let nb = &self.raw[start..end];
        let mut name = String::new();
        let mut i = 0;
        while i + 1 < nb.len() {
            let c = u16::from_be_bytes([nb[i], nb[i + 1]]);
            if c == 0 {
                break;
            }
            if let Some(ch) = char::from_u32(c as u32) {
                name.push(ch);
            }
            i += 2;
        }
        if name.is_empty() {
            "Unknown".to_string()
        } else {
            name
        }
    }

    fn thumbnail(&self) -> Option<Vec<u8>> {
        let png_magic = b"\x89PNG\r\n\x1a\n";
        let search_start = Self::THUMB_OFF;
        let idx = self.raw[search_start..]
            .windows(png_magic.len())
            .position(|w| w == png_magic)?;
        let abs_idx = search_start + idx;
        let iend = self.raw[abs_idx..].windows(4).position(|w| w == b"IEND")?;
        let abs_iend = abs_idx + iend;
        Some(self.raw[abs_idx..(abs_iend + 12).min(self.raw.len())].to_vec())
    }

    fn file_table(&self) -> Vec<StfsEntry> {
        let ft_block = (self.raw[0x37E] as usize)
            | ((self.raw[0x37F] as usize) << 8)
            | ((self.raw[0x380] as usize) << 16);
        let blk_data = self.read_block(ft_block);
        let mut entries = Vec::new();
        for i in 0..64 {
            let base = i * 64;
            if base + 64 > blk_data.len() {
                break;
            }
            let e = &blk_data[base..base + 64];
            let name_len = (e[0x28] & 0x3F) as usize;
            if name_len == 0 {
                continue;
            }
            if (e[0x28] >> 6) & 0x02 != 0 {
                continue;
            }
            let name: String = e[..name_len].iter().map(|&b| b as char).collect();
            let start_block = (e[0x2F] as usize)
                | ((e[0x30] as usize) << 8)
                | ((e[0x31] as usize) << 16);
            let file_size =
                u32::from_be_bytes([e[0x34], e[0x35], e[0x36], e[0x37]]) as usize;
            if !name.is_empty() && file_size > 0 {
                entries.push(StfsEntry {
                    name,
                    start_block,
                    size: file_size,
                });
            }
        }
        entries
    }

    fn extract_savegame_dat(&self) -> Option<Vec<u8>> {
        for cand in &["savegame.dat", "SAVEGAME.DAT"] {
            for entry in self.file_table() {
                if entry.name.to_lowercase() == cand.to_lowercase() {
                    return Some(stfs_read_file(
                        &self.raw,
                        entry.start_block,
                        entry.size,
                        self.table_shift,
                    ));
                }
            }
        }
        None
    }
}

fn parse_region_filename(name: &str) -> Option<(&'static str, i32, i32)> {
    let n = name.to_lowercase().replace('\\', "/");
    if let Some(rest) = n.strip_prefix("dim1/r.") {
        if let Some(coords) = rest.strip_suffix(".mcr") {
            let dot_pos = coords.find('.')?;
            let x = coords[..dot_pos].parse().ok()?;
            let z = coords[dot_pos + 1..].parse().ok()?;
            return Some(("end", x, z));
        }
    }
    if let Some(rest) = n.strip_prefix("dim-1r.") {
        if let Some(coords) = rest.strip_suffix(".mcr") {
            let dot_pos = coords.find('.')?;
            let x = coords[..dot_pos].parse().ok()?;
            let z = coords[dot_pos + 1..].parse().ok()?;
            return Some(("nether", x, z));
        }
    }
    if let Some(rest) = n.strip_prefix("r.") {
        if let Some(coords) = rest.strip_suffix(".mcr") {
            let dot_pos = coords.find('.')?;
            let x = coords[..dot_pos].parse().ok()?;
            let z = coords[dot_pos + 1..].parse().ok()?;
            return Some(("overworld", x, z));
        }
    }
    None
}

fn spawn_sig(axis: char) -> [u8; 9] {
    let mut sig = [0u8; 9];
    sig[0] = 0x03;
    sig[1] = 0x00;
    sig[2] = 0x06;
    sig[3..9].copy_from_slice(format!("Spawn{}", axis).as_bytes());
    sig
}

fn read_spawn(level_dat: &[u8]) -> Option<(i32, i32, i32)> {
    let mut coords = Vec::new();
    for axis in ['X', 'Y', 'Z'] {
        let sig = spawn_sig(axis);
        let idx = level_dat
            .windows(sig.len())
            .position(|w| w == sig)?;
        let val_off = idx + sig.len();
        if val_off + 4 > level_dat.len() {
            return None;
        }
        coords.push(i32::from_be_bytes([
            level_dat[val_off],
            level_dat[val_off + 1],
            level_dat[val_off + 2],
            level_dat[val_off + 3],
        ]));
    }
    Some((coords[0], coords[1], coords[2]))
}

fn patch_spawn(level_dat: &mut [u8], x: i32, y: i32, z: i32) {
    for (axis, val) in [('X', x), ('Y', y), ('Z', z)] {
        let sig = spawn_sig(axis);
        if let Some(idx) = level_dat.windows(sig.len()).position(|w| w == sig) {
            let val_off = idx + sig.len();
            if val_off + 4 <= level_dat.len() {
                level_dat[val_off..val_off + 4].copy_from_slice(&val.to_be_bytes());
            }
        }
    }
}

fn read_player_pos(player_dat: &[u8]) -> Option<(f64, f64, f64)> {
    let idx = player_dat
        .windows(PLAYER_POS_SIG.len())
        .position(|w| w == PLAYER_POS_SIG)?;
    let p = idx + PLAYER_POS_SIG.len();
    if p + 24 > player_dat.len() {
        return None;
    }
    let x = f64::from_be_bytes(player_dat[p..p + 8].try_into().ok()?);
    let y = f64::from_be_bytes(player_dat[p + 8..p + 16].try_into().ok()?);
    let z = f64::from_be_bytes(player_dat[p + 16..p + 24].try_into().ok()?);
    Some((x, y, z))
}

fn patch_player_pos(player_dat: &mut [u8], x: f64, y: f64, z: f64) {
    if let Some(idx) = player_dat
        .windows(PLAYER_POS_SIG.len())
        .position(|w| w == PLAYER_POS_SIG)
    {
        let p = idx + PLAYER_POS_SIG.len();
        if p + 24 <= player_dat.len() {
            player_dat[p..p + 8].copy_from_slice(&x.to_be_bytes());
            player_dat[p + 8..p + 16].copy_from_slice(&y.to_be_bytes());
            player_dat[p + 16..p + 24].copy_from_slice(&z.to_be_bytes());
        }
    }
}

fn compress_rle(data: &[u8]) -> Vec<u8> {
    let mut out = Vec::new();
    let n = data.len();
    let mut i = 0;
    while i < n {
        let b = data[i];
        let mut run = 1usize;
        while i + run < n && data[i + run] == b && run < 256 {
            run += 1;
        }
        if b == 0xFF {
            if run <= 3 {
                out.push(0xFF);
                out.push((run - 1) as u8);
            } else {
                out.push(0xFF);
                out.push((run - 1) as u8);
                out.push(0xFF);
            }
        } else if run < 4 {
            out.extend(std::iter::repeat(b).take(run));
        } else {
            out.push(0xFF);
            out.push((run - 1) as u8);
            out.push(b);
        }
        i += run;
    }
    out
}

fn build_empty_chunk_nbt(chunk_x: i32, chunk_z: i32) -> Vec<u8> {
    let mut out = Vec::new();
    out.extend_from_slice(b"\x0a\x00\x00");
    out.extend_from_slice(b"\x0a\x00\x05Level");
    out.extend_from_slice(b"\x07\x00\x06Blocks");
    out.extend_from_slice(&32768i32.to_be_bytes());
    out.extend(std::iter::repeat(0u8).take(32768));
    out.extend_from_slice(b"\x07\x00\x04Data");
    out.extend_from_slice(&16384i32.to_be_bytes());
    out.extend(std::iter::repeat(0u8).take(16384));
    out.extend_from_slice(b"\x07\x00\x08SkyLight");
    out.extend_from_slice(&16384i32.to_be_bytes());
    out.extend(std::iter::repeat(0xffu8).take(16384));
    out.extend_from_slice(b"\x07\x00\x0aBlockLight");
    out.extend_from_slice(&16384i32.to_be_bytes());
    out.extend(std::iter::repeat(0u8).take(16384));
    out.extend_from_slice(b"\x07\x00\x09HeightMap");
    out.extend_from_slice(&256i32.to_be_bytes());
    out.extend(std::iter::repeat(0u8).take(256));
    out.extend_from_slice(b"\x03\x00\x04xPos");
    out.extend_from_slice(&chunk_x.to_be_bytes());
    out.extend_from_slice(b"\x03\x00\x04zPos");
    out.extend_from_slice(&chunk_z.to_be_bytes());
    out.extend_from_slice(b"\x04\x00\x0aLastUpdate");
    out.extend_from_slice(&0i64.to_be_bytes());
    out.extend_from_slice(b"\x01\x00\x10TerrainPopulated\x01");
    out.extend_from_slice(b"\x09\x00\x08Entities\x0a\x00\x00\x00\x00");
    out.extend_from_slice(b"\x09\x00\x0cTileEntities\x0a\x00\x00\x00\x00");
    out.push(0x00);
    out.push(0x00);
    out
}

fn find_safe_spawn(
    dropped: &HashSet<(i32, i32)>,
    orig: (i32, i32, i32),
) -> Option<(i32, i32, i32)> {
    if dropped.is_empty() {
        return None;
    }
    let (sx, sy, sz) = orig;
    let sc_x = sx >> 4;
    let sc_z = sz >> 4;
    let too_close = |cx: i32, cz: i32| -> bool {
        dropped
            .iter()
            .any(|&(dx, dz)| (cx - dx).abs().max((cz - dz).abs()) < 12)
    };
    if !too_close(sc_x, sc_z) {
        return None;
    }
    for radius in 1..200i32 {
        for dz in -radius..=radius {
            for dx in -radius..=radius {
                if dx.abs().max(dz.abs()) != radius {
                    continue;
                }
                let cx = sc_x + dx;
                let cz = sc_z + dz;
                if !too_close(cx, cz) {
                    return Some((cx * 16 + 8, sy, cz * 16 + 8));
                }
            }
        }
    }
    None
}

fn lzxd_window_from_bits(bits: usize) -> Option<lzxd::WindowSize> {
    match bits {
        15 => Some(lzxd::WindowSize::KB32),
        16 => Some(lzxd::WindowSize::KB64),
        17 => Some(lzxd::WindowSize::KB128),
        18 => Some(lzxd::WindowSize::KB256),
        19 => Some(lzxd::WindowSize::KB512),
        20 => Some(lzxd::WindowSize::MB1),
        21 => Some(lzxd::WindowSize::MB2),
        _ => None,
    }
}

fn try_lzxd(lzx_raw: &[u8], output_size: usize, window: lzxd::WindowSize) -> Option<Vec<u8>> {
    let mut lzxd = lzxd::Lzxd::new(window);
    lzxd.decompress_next(lzx_raw, output_size)
        .ok()
        .map(|slice| slice.to_vec())
}

fn decompress_region_chunk(xbox_data: &[u8]) -> Result<Vec<u8>, String> {
    let hi = xbox_data[0];
    let (output_size, _src_sz, lzx_raw) = if hi == 0xFF {
        let output_size =
            ((xbox_data[1] as usize) << 8) | xbox_data[2] as usize;
        let src_sz =
            ((xbox_data[3] as usize) << 8) | xbox_data[4] as usize;
        let lzx_raw = &xbox_data[5..(5 + src_sz).min(xbox_data.len())];
        (output_size, src_sz, lzx_raw)
    } else {
        let src_sz =
            ((hi as usize) << 8) | xbox_data[1] as usize;
        let lzx_raw = &xbox_data[2..(2 + src_sz).min(xbox_data.len())];
        (LZX_BLOCK_SIZE, src_sz, lzx_raw)
    };

    if let Some(out) = try_lzxd(lzx_raw, output_size, lzxd::WindowSize::KB128) {
        return Ok(out);
    }
    for w in [16, 15, 18, 19, 20, 21] {
        if let Some(ws) = lzxd_window_from_bits(w) {
            if let Some(out) = try_lzxd(lzx_raw, output_size, ws) {
                return Ok(out);
            }
        }
    }
    Err("LZX decode failed (all window sizes rejected the chunk)".to_string())
}

fn convert_region(
    data: &[u8],
    dropped_slots: &mut Vec<usize>,
    region_coords: Option<(i32, i32)>,
) -> Result<Vec<u8>, String> {
    let sect = 4096usize;
    let mut buf = data.to_vec();
    for i in 0..REGION_SECT_COUNT * 2 {
        if (i + 1) * 4 <= buf.len() {
            s32(&mut buf, i * 4);
        }
    }
    let mut chunk_positions: HashMap<usize, (usize, usize, usize)> = HashMap::new();
    for slot in 0..REGION_SECT_COUNT {
        if (slot + 1) * 4 > buf.len() {
            break;
        }
        let off = u32::from_le_bytes([
            buf[slot * 4],
            buf[slot * 4 + 1],
            buf[slot * 4 + 2],
            buf[slot * 4 + 3],
        ]) as usize;
        if off == 0 {
            continue;
        }
        let sn = (off >> 8) & 0xFFFFFF;
        let count = off & 0xFF;
        if sn < 2 {
            continue;
        }
        let fo = sn * sect;
        if fo + 8 > data.len() {
            continue;
        }
        chunk_positions.insert(fo, (slot, sn, count));
    }
    if chunk_positions.is_empty() {
        return Ok(buf);
    }
    let mut new_buf = vec![0u8; buf.len()];
    let copy_end = (sect * 2).min(buf.len()).min(new_buf.len());
    new_buf[..copy_end].copy_from_slice(&buf[..copy_end]);
    let mut next_sector = 2usize;
    let mut sorted_fos: Vec<usize> = chunk_positions.keys().copied().collect();
    sorted_fos.sort();
    for fo in sorted_fos {
        let (slot, _sn, _count) = chunk_positions[&fo];
        let raw_comp_len = u32::from_be_bytes([
            data[fo],
            data[fo + 1],
            data[fo + 2],
            data[fo + 3],
        ]);
        let raw_decomp_len = u32::from_be_bytes([
            data[fo + 4],
            data[fo + 5],
            data[fo + 6],
            data[fo + 7],
        ]);
        let use_rle = (raw_comp_len & 0x80000000) != 0;
        let comp_len = (raw_comp_len & 0x7FFFFFFF) as usize;
        let decomp_len = raw_decomp_len as usize;
        if comp_len == 0 || fo + 8 + comp_len > data.len() {
            continue;
        }
        let xbox_data = &data[fo + 8..fo + 8 + comp_len];
        let rle_data = match decompress_region_chunk(xbox_data) {
            Ok(d) => d,
            Err(_) => {
                dropped_slots.push(slot);
                if let Some((rx, rz)) = region_coords {
                    let cx = rx * 32 + (slot % 32) as i32;
                    let cz = rz * 32 + (slot / 32) as i32;
                    let synth_nbt = build_empty_chunk_nbt(cx, cz);
                    let synth_rle = compress_rle(&synth_nbt);
                    let mut synth_encoder =
                        flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::new(6));
                    let _ = synth_encoder.write_all(&synth_rle);
                    let synth_zlib = synth_encoder.finish().unwrap_or_default();
                    let new_comp_len = synth_zlib.len();
                    let needed = (8 + new_comp_len + sect - 1) / sect;
                    let dest_off = next_sector * sect;
                    while dest_off + 8 + new_comp_len > new_buf.len() {
                        new_buf.extend(std::iter::repeat(0u8).take(sect));
                    }
                    new_buf[dest_off..dest_off + 4]
                        .copy_from_slice(&(new_comp_len as u32 | 0x80000000).to_le_bytes());
                    new_buf[dest_off + 4..dest_off + 8]
                        .copy_from_slice(&(synth_nbt.len() as u32).to_le_bytes());
                    new_buf[dest_off + 8..dest_off + 8 + new_comp_len]
                        .copy_from_slice(&synth_zlib);
                    new_buf[slot * 4..slot * 4 + 4]
                        .copy_from_slice(&((next_sector << 8) | needed).to_le_bytes());
                    next_sector += needed;
                } else {
                    new_buf[slot * 4..slot * 4 + 4].copy_from_slice(&0u32.to_le_bytes());
                }
                continue;
            }
        };
        let zlib_data = flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::new(6));
        let mut encoder = zlib_data;
        encoder.write_all(&rle_data).map_err(|e| e.to_string())?;
        let zlib_data = encoder.finish().map_err(|e| e.to_string())?;
        let new_comp_len = zlib_data.len();
        let needed = (8 + new_comp_len + sect - 1) / sect;
        let dest_off = next_sector * sect;
        while dest_off + 8 + new_comp_len > new_buf.len() {
            new_buf.extend(std::iter::repeat(0u8).take(sect));
        }
        let comp_flag = if use_rle {
            new_comp_len as u32 | 0x80000000
        } else {
            new_comp_len as u32
        };
        new_buf[dest_off..dest_off + 4].copy_from_slice(&comp_flag.to_le_bytes());
        new_buf[dest_off + 4..dest_off + 8].copy_from_slice(&(decomp_len as u32).to_le_bytes());
        new_buf[dest_off + 8..dest_off + 8 + new_comp_len].copy_from_slice(&zlib_data);
        let new_off = (next_sector << 8) | needed;
        new_buf[slot * 4..slot * 4 + 4].copy_from_slice(&(new_off as u32).to_le_bytes());
        next_sector += needed;
    }
    let end = (next_sector * sect).min(new_buf.len());
    new_buf.truncate(end);
    Ok(new_buf)
}

fn convert_region_ps3(data: &[u8]) -> Result<Vec<u8>, String> {
    let sect = 4096usize;
    let mut buf = data.to_vec();
    for i in 0..REGION_SECT_COUNT * 2 {
        if (i + 1) * 4 <= buf.len() {
            s32(&mut buf, i * 4);
        }
    }
    let mut chunk_positions: HashMap<usize, (usize, usize, usize)> = HashMap::new();
    for slot in 0..REGION_SECT_COUNT {
        if (slot + 1) * 4 > buf.len() {
            break;
        }
        let off = u32::from_le_bytes([
            buf[slot * 4],
            buf[slot * 4 + 1],
            buf[slot * 4 + 2],
            buf[slot * 4 + 3],
        ]) as usize;
        if off == 0 {
            continue;
        }
        let sn = (off >> 8) & 0xFFFFFF;
        let count = off & 0xFF;
        if sn < 2 {
            continue;
        }
        let fo = sn * sect;
        if fo + 8 > data.len() {
            continue;
        }
        chunk_positions.insert(fo, (slot, sn, count));
    }
    if chunk_positions.is_empty() {
        return Ok(buf);
    }
    let mut new_buf = vec![0u8; buf.len()];
    let copy_end = (sect * 2).min(buf.len()).min(new_buf.len());
    new_buf[..copy_end].copy_from_slice(&buf[..copy_end]);
    let mut next_sector = 2usize;
    let mut sorted_fos: Vec<usize> = chunk_positions.keys().copied().collect();
    sorted_fos.sort();
    for fo in sorted_fos {
        let (slot, _sn, _count) = chunk_positions[&fo];
        let raw_comp_len = u32::from_be_bytes([
            data[fo],
            data[fo + 1],
            data[fo + 2],
            data[fo + 3],
        ]);
        let raw_decomp_len = u32::from_be_bytes([
            data[fo + 4],
            data[fo + 5],
            data[fo + 6],
            data[fo + 7],
        ]);
        let use_rle = (raw_comp_len & 0x80000000) != 0;
        let comp_len = (raw_comp_len & 0x7FFFFFFF) as usize;
        let decomp_len = raw_decomp_len as usize;
        if comp_len == 0 || fo + 8 + comp_len > data.len() {
            continue;
        }
        let chunk_body = &data[fo + 8..fo + 8 + comp_len];
        if chunk_body.len() < 5 {
            new_buf[slot * 4..slot * 4 + 4].copy_from_slice(&0u32.to_le_bytes());
            continue;
        }
        let mut decoder = flate2::read::DeflateDecoder::new(&chunk_body[4..]);
        let mut rle_data = Vec::new();
        if decoder.read_to_end(&mut rle_data).is_err() {
            new_buf[slot * 4..slot * 4 + 4].copy_from_slice(&0u32.to_le_bytes());
            continue;
        }
        let mut encoder =
            flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::new(6));
        encoder.write_all(&rle_data).map_err(|e| e.to_string())?;
        let zlib_data = encoder.finish().map_err(|e| e.to_string())?;
        let new_comp_len = zlib_data.len();
        let needed = (8 + new_comp_len + sect - 1) / sect;
        let dest_off = next_sector * sect;
        while dest_off + 8 + new_comp_len > new_buf.len() {
            new_buf.extend(std::iter::repeat(0u8).take(sect));
        }
        let comp_flag = if use_rle {
            new_comp_len as u32 | 0x80000000
        } else {
            new_comp_len as u32
        };
        new_buf[dest_off..dest_off + 4].copy_from_slice(&comp_flag.to_le_bytes());
        new_buf[dest_off + 4..dest_off + 8].copy_from_slice(&(decomp_len as u32).to_le_bytes());
        new_buf[dest_off + 8..dest_off + 8 + new_comp_len].copy_from_slice(&zlib_data);
        let new_off = (next_sector << 8) | needed;
        new_buf[slot * 4..slot * 4 + 4].copy_from_slice(&(new_off as u32).to_le_bytes());
        next_sector += needed;
    }
    let end = (next_sector * sect).min(new_buf.len());
    new_buf.truncate(end);
    Ok(new_buf)
}

fn decompress_xmemcompress(dat: &[u8]) -> Result<Vec<u8>, String> {
    if dat.len() < 8 {
        return Err("savegame.dat too small".to_string());
    }
    let meta_off = u32::from_be_bytes([dat[0], dat[1], dat[2], dat[3]]) as usize;
    if meta_off > dat.len() {
        return Err("invalid metadata offset".to_string());
    }
    let lzx_stream = &dat[8..meta_off];
    if lzx_stream.len() < 4 {
        return Err("LZX stream too small".to_string());
    }
    let uncomp_total = u32::from_be_bytes([
        lzx_stream[0],
        lzx_stream[1],
        lzx_stream[2],
        lzx_stream[3],
    ]) as usize;
    let mut lzxd = lzxd::Lzxd::new(lzxd::WindowSize::KB128);
    let mut output = Vec::with_capacity(uncomp_total);
    let mut pos = 4;
    while pos < lzx_stream.len() && output.len() < uncomp_total {
        let hi = lzx_stream[pos];
        let (src_sz, dst_sz, header_len) = if hi == 0xFF {
            if pos + 5 > lzx_stream.len() {
                break;
            }
            let dst_sz = ((lzx_stream[pos + 1] as usize) << 8) | lzx_stream[pos + 2] as usize;
            let src_sz = ((lzx_stream[pos + 3] as usize) << 8) | lzx_stream[pos + 4] as usize;
            (src_sz, dst_sz, 5)
        } else {
            if pos + 2 > lzx_stream.len() {
                break;
            }
            let src_sz = ((hi as usize) << 8) | lzx_stream[pos + 1] as usize;
            (src_sz, LZX_BLOCK_SIZE, 2)
        };
        pos += header_len;
        if src_sz == 0 || dst_sz == 0 {
            break;
        }
        if pos + src_sz > lzx_stream.len() {
            break;
        }
        let lzx_raw = &lzx_stream[pos..pos + src_sz];
        let remaining = uncomp_total - output.len();
        let out_sz = dst_sz.min(remaining);
        match lzxd.decompress_next(lzx_raw, out_sz) {
            Ok(decompressed) => output.extend_from_slice(decompressed),
            Err(e) => {
                return Err(format!("LZX decompression failed at offset {}: {}", pos, e))
            }
        }
        pos += src_sz;
    }
    Ok(output)
}

fn patch_level_name(nbt: &[u8], new_name: &str) -> Vec<u8> {
    let idx = match nbt
        .windows(LEVELNAME_SIG.len())
        .position(|w| w == LEVELNAME_SIG)
    {
        Some(i) => i,
        None => return nbt.to_vec(),
    };
    let str_off = idx + LEVELNAME_SIG.len();
    if str_off + 2 > nbt.len() {
        return nbt.to_vec();
    }
    let old_len = u16::from_be_bytes([nbt[str_off], nbt[str_off + 1]]) as usize;
    let end = str_off + 2 + old_len;
    let mut new_val = new_name.as_bytes().to_vec();
    if new_val.len() > 0xFFFF {
        new_val.truncate(0xFFFF);
    }
    let mut payload = Vec::with_capacity(2 + new_val.len());
    payload.extend_from_slice(&(new_val.len() as u16).to_be_bytes());
    payload.extend_from_slice(&new_val);
    let mut out = Vec::with_capacity(str_off + payload.len() + nbt.len().saturating_sub(end));
    out.extend_from_slice(&nbt[..str_off]);
    out.extend_from_slice(&payload);
    if end < nbt.len() {
        out.extend_from_slice(&nbt[end..]);
    }
    out
}

fn parse_param_sfo(path: &Path) -> HashMap<String, String> {
    let data = match fs::read(path) {
        Ok(d) => d,
        Err(_) => return HashMap::new(),
    };
    if data.len() < 0x14 || &data[..4] != b"\x00PSF" {
        return HashMap::new();
    }
    let key_tbl = u32::from_le_bytes(data[8..12].try_into().unwrap()) as usize;
    let data_tbl = u32::from_le_bytes(data[12..16].try_into().unwrap()) as usize;
    let entries = u32::from_le_bytes(data[16..20].try_into().unwrap()) as usize;
    let mut result = HashMap::new();
    for i in 0..entries {
        let e = 0x14 + i * 16;
        if e + 16 > data.len() {
            break;
        }
        let key_off = u16::from_le_bytes([data[e], data[e + 1]]) as usize;
        let fmt = u16::from_le_bytes([data[e + 2], data[e + 3]]);
        let dlen = u16::from_le_bytes([data[e + 4], data[e + 5]]) as usize;
        let doff = u32::from_le_bytes(data[e + 8..e + 12].try_into().unwrap()) as usize;
        let ka = key_tbl + key_off;
        let ke = data[ka..]
            .iter()
            .position(|&b| b == 0)
            .map(|p| ka + p)
            .unwrap_or(data.len());
        let key = String::from_utf8_lossy(&data[ka..ke]).to_string();
        let da = data_tbl + doff;
        let val = if (fmt == SFO_FMT_UTF8_RAW || fmt == SFO_FMT_UTF8_STR) && da + dlen <= data.len()
        {
            let raw = &data[da..da + dlen];
            let null_pos = raw.iter().position(|&b| b == 0).unwrap_or(raw.len());
            String::from_utf8_lossy(&raw[..null_pos]).to_string()
        } else if fmt == SFO_FMT_INT32 && da + 4 <= data.len() {
            u32::from_le_bytes(data[da..da + 4].try_into().unwrap()).to_string()
        } else {
            continue;
        };
        result.insert(key, val);
    }
    result
}

fn looks_like_4j_header(data: &[u8]) -> bool {
    if data.len() < 12 {
        return false;
    }
    let (ho, ne, _ov, cv) = read_hdr_be(data);
    if ho < 12 || ho as usize >= data.len() {
        return false;
    }
    if data.len() - ho as usize != ne as usize * FILE_ENTRY_SIZE {
        return false;
    }
    if ne == 0 || ne > 4096 {
        return false;
    }
    if cv < 0 || cv > 20 {
        return false;
    }
    true
}

fn convert_bin_to_win64(bin_path: &str, game_dir: &str) -> Result<String, String> {
    let raw = fs::read(bin_path).map_err(|e| format!("Failed to read file: {}", e))?;
    let pkg = StfsPackage::new(raw)?;
    let name = pkg.display_name();
    let dat = pkg
        .extract_savegame_dat()
        .ok_or("savegame.dat not found in STFS package")?;
    let decompressed = decompress_xmemcompress(&dat)?;
    let (ho, ne, ov, cv) = read_hdr_be(&decompressed);
    let entries = parse_ftable_be(&decompressed, ho, ne);
    let mut file_blobs: Vec<Vec<u8>> = Vec::new();
    let mut dropped_overworld: HashSet<(i32, i32)> = HashSet::new();
    for e in &entries {
        let fn_lower = e.filename.to_lowercase();
        let s = e.start_offset as usize;
        let l = e.length as usize;
        let raw_file = if s + l <= decompressed.len() {
            decompressed[s..s + l].to_vec()
        } else {
            Vec::new()
        };
        if fn_lower.ends_with(".mcr") && !raw_file.is_empty() {
            let dim_info = parse_region_filename(&e.filename);
            let region_xy = dim_info.map(|d| (d.1, d.2));
            let mut slots = Vec::new();
            let converted =
                convert_region(&raw_file, &mut slots, region_xy)?;
            if let Some(("overworld", rx, rz)) = dim_info {
                for slot in slots {
                    let cx = rx * 32 + (slot % 32) as i32;
                    let cz = rz * 32 + (slot / 32) as i32;
                    dropped_overworld.insert((cx, cz));
                }
            }
            file_blobs.push(converted);
        } else {
            file_blobs.push(raw_file);
        }
    }
    if !dropped_overworld.is_empty() {
        let mut new_spawn: Option<(i32, i32, i32)> = None;
        let mut spawn: Option<(i32, i32, i32)> = None;
        for (i, e) in entries.iter().enumerate() {
            if e.filename.to_lowercase() != "level.dat" {
                continue;
            }
            spawn = read_spawn(&file_blobs[i]);
            if let Some(s) = spawn {
                if let Some(ns) = find_safe_spawn(&dropped_overworld, s) {
                    let blob = &mut file_blobs[i];
                    patch_spawn(blob, ns.0, ns.1, ns.2);
                    new_spawn = Some(ns);
                }
            }
            break;
        }
        let safe = new_spawn.or(spawn);
        if let Some((sx, sy, sz)) = safe {
            let _sx_chunk = sx >> 4;
            let _sz_chunk = sz >> 4;
            let too_close = |cx: i32, cz: i32| -> bool {
                dropped_overworld
                    .iter()
                    .any(|&(dx, dz)| (cx - dx).abs().max((cz - dz).abs()) < 12)
            };
            let mut moved_players = 0i32;
            for (i, e) in entries.iter().enumerate() {
                if !e.filename.starts_with("players/") || !e.filename.ends_with(".dat") {
                    continue;
                }
                if let Some((px, _py, pz)) = read_player_pos(&file_blobs[i]) {
                    let cx = px as i32 / 16;
                    let cz = pz as i32 / 16;
                    if too_close(cx, cz) {
                        let blob = &mut file_blobs[i];
                        patch_player_pos(blob, sx as f64 + 0.5, sy as f64, sz as f64 + 0.5);
                        moved_players += 1;
                    }
                }
            }
            if moved_players > 0 {
                eprintln!("Relocated {} player(s) to safe spawn", moved_players);
            }
        }
    }
    let header_size = 12usize;
    let mut body = Vec::new();
    let mut new_entries: Vec<FileEntry> = Vec::new();
    let mut cursor = header_size;
    for (i, e) in entries.iter().enumerate() {
        let blob = &file_blobs[i];
        new_entries.push(FileEntry {
            filename: e.filename.clone(),
            length: blob.len() as u32,
            start_offset: cursor as u32,
            last_mod: e.last_mod,
        });
        body.extend_from_slice(blob);
        cursor += blob.len();
    }
    let new_fto = cursor;
    let out_cv = if cv <= 9 { cv } else { 9 };
    let mut header = Vec::with_capacity(header_size);
    header.extend_from_slice(&(new_fto as u32).to_le_bytes());
    header.extend_from_slice(&(entries.len() as u32).to_le_bytes());
    header.extend_from_slice(&ov.to_le_bytes());
    header.extend_from_slice(&out_cv.to_le_bytes());
    let mut raw_le = Vec::with_capacity(header.len() + body.len() + ne as usize * FILE_ENTRY_SIZE);
    raw_le.extend_from_slice(&header);
    raw_le.extend_from_slice(&body);
    for ne_entry in &new_entries {
        let fn_bytes: Vec<u16> = ne_entry.filename.encode_utf16().map(|c| c.to_le()).collect();
        let mut fn_padded = vec![0u16; 64];
        for (j, &c) in fn_bytes.iter().take(64).enumerate() {
            fn_padded[j] = c;
        }
        for &c in &fn_padded {
            raw_le.extend_from_slice(&c.to_le_bytes());
        }
        raw_le.extend_from_slice(&ne_entry.length.to_le_bytes());
        raw_le.extend_from_slice(&ne_entry.start_offset.to_le_bytes());
        raw_le.extend_from_slice(&ne_entry.last_mod.to_le_bytes());
    }
    let mut encoder =
        flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::new(6));
    encoder.write_all(&raw_le).map_err(|e| e.to_string())?;
    let compressed = encoder.finish().map_err(|e| e.to_string())?;
    let mut win64 = Vec::with_capacity(8 + compressed.len());
    win64.extend_from_slice(&0u32.to_le_bytes());
    win64.extend_from_slice(&(raw_le.len() as u32).to_le_bytes());
    win64.extend_from_slice(&compressed);
    let folder = sanitise(&name);
    let dst = Path::new(game_dir).join(&folder);
    fs::create_dir_all(&dst).map_err(|e| format!("Failed to create output directory: {}", e))?;
    fs::write(dst.join("saveData.ms"), &win64)
        .map_err(|e| format!("Failed to write saveData.ms: {}", e))?;
    if let Some(thumb) = pkg.thumbnail() {
        let thumb_dir = dst.join("thumbnails");
        let _ = fs::create_dir_all(&thumb_dir);
        let _ = fs::write(thumb_dir.join("thumbData.png"), &thumb);
    }
    Ok(dst.to_string_lossy().to_string())
}

fn convert_ps3_to_win64(ps3_save_dir: &str, game_dir: &str) -> Result<String, String> {
    let src = Path::new(ps3_save_dir);
    if !src.is_dir() {
        return Err(format!(
            "'{}' is not a folder",
            src.display()
        ));
    }
    let gamedata_path = src.join("GAMEDATA");
    if !gamedata_path.exists() {
        return Err(format!(
            "GAMEDATA not found in {}",
            src.file_name().unwrap_or_default().to_string_lossy()
        ));
    }
    let sfo = parse_param_sfo(&src.join("PARAM.SFO"));
    let save_title = sfo
        .get("SUB_TITLE")
        .cloned()
        .unwrap_or_else(|| {
            src.file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string()
        });
    let decompressed =
        fs::read(&gamedata_path).map_err(|e| format!("Failed to read GAMEDATA: {}", e))?;
    if !looks_like_4j_header(&decompressed) {
        return Err("GAMEDATA does not look like a valid Minecraft PS3 save".to_string());
    }
    let (ho, ne, ov, _cv) = read_hdr_be(&decompressed);
    let entries = parse_ftable_be(&decompressed, ho, ne);
    let mut file_blobs: Vec<Vec<u8>> = Vec::new();
    for e in &entries {
        let fn_lower = e.filename.to_lowercase();
        let s = e.start_offset as usize;
        let l = e.length as usize;
        let mut raw_file = if s + l <= decompressed.len() {
            decompressed[s..s + l].to_vec()
        } else {
            Vec::new()
        };
        if fn_lower.ends_with(".mcr") && !raw_file.is_empty() {
            raw_file = convert_region_ps3(&raw_file)?;
        } else if fn_lower == "level.dat" && !save_title.is_empty() && !raw_file.is_empty() {
            raw_file = patch_level_name(&raw_file, &save_title);
        }
        file_blobs.push(raw_file);
    }
    let header_size = 12usize;
    let mut body = Vec::new();
    let mut new_entries: Vec<FileEntry> = Vec::new();
    let mut cursor = header_size;
    for (i, e) in entries.iter().enumerate() {
        let blob = &file_blobs[i];
        new_entries.push(FileEntry {
            filename: e.filename.clone(),
            length: blob.len() as u32,
            start_offset: cursor as u32,
            last_mod: e.last_mod,
        });
        body.extend_from_slice(blob);
        cursor += blob.len();
    }
    let new_fto = cursor;
    let mut raw_le = Vec::with_capacity(header_size + body.len() + ne as usize * FILE_ENTRY_SIZE);
    raw_le.extend_from_slice(&(new_fto as u32).to_le_bytes());
    raw_le.extend_from_slice(&ne.to_le_bytes());
    raw_le.extend_from_slice(&ov.to_le_bytes());
    raw_le.extend_from_slice(&9i16.to_le_bytes());
    raw_le.extend_from_slice(&body);
    for ne_entry in &new_entries {
        let fn_bytes: Vec<u16> = ne_entry.filename.encode_utf16().map(|c| c.to_le()).collect();
        let mut fn_padded = vec![0u16; 64];
        for (j, &c) in fn_bytes.iter().take(64).enumerate() {
            fn_padded[j] = c;
        }
        for &c in &fn_padded {
            raw_le.extend_from_slice(&c.to_le_bytes());
        }
        raw_le.extend_from_slice(&ne_entry.length.to_le_bytes());
        raw_le.extend_from_slice(&ne_entry.start_offset.to_le_bytes());
        raw_le.extend_from_slice(&ne_entry.last_mod.to_le_bytes());
    }
    let mut encoder =
        flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::new(6));
    encoder.write_all(&raw_le).map_err(|e| e.to_string())?;
    let compressed = encoder.finish().map_err(|e| e.to_string())?;
    let mut win64 = Vec::with_capacity(8 + compressed.len());
    win64.extend_from_slice(&0u32.to_le_bytes());
    win64.extend_from_slice(&(raw_le.len() as u32).to_le_bytes());
    win64.extend_from_slice(&compressed);
    let folder = sanitise(&save_title);
    let dst = Path::new(game_dir).join(&folder);
    fs::create_dir_all(&dst).map_err(|e| format!("Failed to create output directory: {}", e))?;
    fs::write(dst.join("saveData.ms"), &win64)
        .map_err(|e| format!("Failed to write saveData.ms: {}", e))?;
    let thumb_path = src.join("THUMB");
    if thumb_path.exists() {
        if let Ok(thumb_bytes) = fs::read(&thumb_path) {
            if thumb_bytes.len() >= 8 && thumb_bytes[..8] == *b"\x89PNG\r\n\x1a\n" {
                let thumb_dir = dst.join("thumbnails");
                let _ = fs::create_dir_all(&thumb_dir);
                let _ = fs::write(thumb_dir.join("thumbData.png"), &thumb_bytes);
            }
        }
    }
    Ok(dst.to_string_lossy().to_string())
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn import_world(
    _app: AppHandle,
    input_path: String,
    output_path: String,
) -> Result<String, String> {
    let output_parent = Path::new(&output_path).parent();
    if let Some(parent) = output_parent {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create output directory {:?}: {}", parent, e))?;
        }
    }
    fs::copy(&input_path, &output_path)
        .map_err(|e| format!("Failed to copy .ms file: {}", e))?;
    Ok(format!(
        "World imported successfully!\nOutput: {}",
        output_path
    ))
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn import_lce_save(
    _app: AppHandle,
    input_path: String,
    output_dir: String,
) -> Result<String, String> {
    let path = Path::new(&input_path);
    if path.is_file() {
        let ext = path
            .extension()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase();
        if ext == "ms" {
            let dst = Path::new(&output_dir);
            fs::create_dir_all(dst)
                .map_err(|e| format!("Failed to create output directory: {}", e))?;
            fs::copy(&input_path, dst.join("saveData.ms"))
                .map_err(|e| format!("Failed to copy .ms file: {}", e))?;
            return Ok(dst.to_string_lossy().to_string());
        }
        if ext == "bin" || ext == "" {
            return convert_bin_to_win64(&input_path, &output_dir);
        }
        return Err(format!("Unrecognised file extension: .{}", ext));
    }
    if path.is_dir() && path.join("GAMEDATA").is_file() {
        return convert_ps3_to_win64(&input_path, &output_dir);
    }
    Err("Input is not a valid LCE save (expected .bin file, .ms file, or PS3 folder with GAMEDATA)".to_string())
}
