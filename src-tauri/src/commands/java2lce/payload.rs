use super::nbt;
const SAVE_FILE_VERSION_COMPRESSED_CHUNK_STORAGE: i16 = 8;
const SAVE_FILE_VERSION_CHUNK_INHABITED_TIME: i16 = 9;
const COMPRESSED_CHUNK_SECTION_HEIGHT: usize = 128;
const BLOCKS_PER_SECTION: usize = COMPRESSED_CHUNK_SECTION_HEIGHT * 16 * 16;
const NIBBLES_PER_SECTION: usize = BLOCKS_PER_SECTION / 2;
const FULL_CHUNK_BLOCKS: usize = 256 * 16 * 16;
const FULL_CHUNK_NIBBLES: usize = FULL_CHUNK_BLOCKS / 2;
const INDEX_TYPE_MASK: u16 = 0x0003;
const INDEX_TYPE_1BIT: u16 = 0x0000;
const INDEX_TYPE_2BIT: u16 = 0x0001;
const INDEX_TYPE_4BIT: u16 = 0x0002;
const INDEX_TYPE_0_OR_8BIT: u16 = 0x0003;
const INDEX_TYPE_0BIT_FLAG: u16 = 0x0004;
const SPARSE_ALL_ZERO_INDEX: u8 = 128;
const SPARSE_ALL_FIFTEEN_INDEX: u8 = 129;
fn read_be_i16(data: &[u8], off: usize) -> i16 {
    i16::from_be_bytes([data[off], data[off + 1]])
}

fn read_be_i32(data: &[u8], off: usize) -> i32 {
    i32::from_be_bytes([data[off], data[off + 1], data[off + 2], data[off + 3]])
}

fn read_be_i64(data: &[u8], off: usize) -> i64 {
    i64::from_be_bytes([
        data[off], data[off + 1], data[off + 2], data[off + 3], data[off + 4], data[off + 5],
        data[off + 6], data[off + 7],
    ])
}

fn write_be_i16(out: &mut Vec<u8>, v: i16) {
    out.extend_from_slice(&v.to_be_bytes());
}

fn write_be_i32(out: &mut Vec<u8>, v: i32) {
    out.extend_from_slice(&v.to_be_bytes());
}

fn write_be_i64(out: &mut Vec<u8>, v: i64) {
    out.extend_from_slice(&v.to_be_bytes());
}

fn get_compressed_tile_index(block: usize, tile: usize) -> usize {
    let mut index = ((block & 0x180) << 6) | ((block & 0x060) << 4) | ((block & 0x01F) << 2);
    index |= ((tile & 0x30) << 7) | ((tile & 0x0C) << 5) | (tile & 0x03);
    index
}

fn get_nibble_value(nibble_data: &[u8], xz: usize, y: usize) -> u8 {
    let pos = (xz << 7) | y;
    let slot = pos >> 1;
    let part = pos & 1;
    if slot >= nibble_data.len() {
        return 0;
    }
    let b = nibble_data[slot];
    if part == 0 {
        b & 0x0F
    } else {
        (b >> 4) & 0x0F
    }
}

fn set_nibble_value(nibble_data: &mut [u8], xz: usize, y: usize, value: u8) {
    let pos = (xz << 7) | y;
    let slot = pos >> 1;
    let part = pos & 1;
    if slot >= nibble_data.len() {
        return;
    }
    let val = value & 0x0F;
    if part == 0 {
        nibble_data[slot] = (nibble_data[slot] & 0xF0) | val;
    } else {
        nibble_data[slot] = (nibble_data[slot] & 0x0F) | (val << 4);
    }
}

fn ensure_length(input: &[u8], expected_len: usize) -> Vec<u8> {
    if input.len() == expected_len {
        return input.to_vec();
    }
    let mut v = vec![0u8; expected_len];
    let copy_len = input.len().min(expected_len);
    v[..copy_len].copy_from_slice(&input[..copy_len]);
    v
}

fn extract_lower_block_section(full_blocks: &[u8]) -> Vec<u8> {
    if full_blocks.len() == BLOCKS_PER_SECTION {
        return full_blocks.to_vec();
    }
    let mut lower = vec![0u8; BLOCKS_PER_SECTION];
    for xz in 0..256 {
        let src_start = xz * 256;
        let dst_start = xz * COMPRESSED_CHUNK_SECTION_HEIGHT;
        let copy_len = COMPRESSED_CHUNK_SECTION_HEIGHT.min(full_blocks.len() - src_start.min(full_blocks.len()));
        if src_start + copy_len <= full_blocks.len() && dst_start + copy_len <= BLOCKS_PER_SECTION {
            lower[dst_start..dst_start + copy_len]
                .copy_from_slice(&full_blocks[src_start..src_start + copy_len]);
        }
    }
    lower
}

fn extract_upper_block_section(full_blocks: &[u8]) -> Vec<u8> {
    if full_blocks.len() < FULL_CHUNK_BLOCKS {
        return vec![0u8; BLOCKS_PER_SECTION];
    }
    let mut upper = vec![0u8; BLOCKS_PER_SECTION];
    for xz in 0..256 {
        let src_start = xz * 256 + COMPRESSED_CHUNK_SECTION_HEIGHT;
        let dst_start = xz * COMPRESSED_CHUNK_SECTION_HEIGHT;
        upper[dst_start..dst_start + COMPRESSED_CHUNK_SECTION_HEIGHT].copy_from_slice(&full_blocks[src_start..src_start + COMPRESSED_CHUNK_SECTION_HEIGHT]);
    }
    upper
}

fn extract_lower_nibble_section(full_nibbles: &[u8]) -> Vec<u8> {
    let nibble_height = COMPRESSED_CHUNK_SECTION_HEIGHT / 2;
    if full_nibbles.len() == NIBBLES_PER_SECTION {
        return full_nibbles.to_vec();
    }
    let mut lower = vec![0u8; NIBBLES_PER_SECTION];
    for xz in 0..256 {
        let src_start = xz * nibble_height * 2;
        let dst_start = xz * nibble_height;
        let copy_len = nibble_height.min(
            full_nibbles.len().saturating_sub(src_start),
        );
        if copy_len > 0 {
            lower[dst_start..dst_start + copy_len].copy_from_slice(&full_nibbles[src_start..src_start + copy_len]);
        }
    }
    lower
}

fn extract_upper_nibble_section(full_nibbles: &[u8]) -> Vec<u8> {
    let nibble_height = COMPRESSED_CHUNK_SECTION_HEIGHT / 2;
    if full_nibbles.len() < FULL_CHUNK_NIBBLES {
        return vec![0u8; NIBBLES_PER_SECTION];
    }
    let mut upper = vec![0u8; NIBBLES_PER_SECTION];
    for xz in 0..256 {
        let src_start = xz * nibble_height * 2 + nibble_height;
        let dst_start = xz * nibble_height;
        upper[dst_start..dst_start + nibble_height]
            .copy_from_slice(&full_nibbles[src_start..src_start + nibble_height]);
    }
    upper
}

fn combine_block_sections(lower: &[u8], upper: &[u8]) -> Vec<u8> {
    if lower.len() == FULL_CHUNK_BLOCKS {
        return lower.to_vec();
    }
    let mut combined = vec![0u8; FULL_CHUNK_BLOCKS];
    for xz in 0..256 {
        let lower_start = xz * COMPRESSED_CHUNK_SECTION_HEIGHT;
        let out_start = xz * 256;
        let copy_len = COMPRESSED_CHUNK_SECTION_HEIGHT.min(lower.len().saturating_sub(lower_start));
        if copy_len > 0 {
            combined[out_start..out_start + copy_len].copy_from_slice(&lower[lower_start..lower_start + copy_len]);
        }
        let upper_start = xz * COMPRESSED_CHUNK_SECTION_HEIGHT;
        let out_upper = out_start + COMPRESSED_CHUNK_SECTION_HEIGHT;
        let copy_len2 = COMPRESSED_CHUNK_SECTION_HEIGHT.min(upper.len().saturating_sub(upper_start));
        if copy_len2 > 0 {
            combined[out_upper..out_upper + copy_len2]
                .copy_from_slice(&upper[upper_start..upper_start + copy_len2]);
        }
    }
    combined
}

fn combine_nibble_sections(lower: &[u8], upper: &[u8]) -> Vec<u8> {
    let nibble_height = COMPRESSED_CHUNK_SECTION_HEIGHT / 2;
    if lower.len() == FULL_CHUNK_NIBBLES {
        return lower.to_vec();
    }
    let mut combined = vec![0u8; FULL_CHUNK_NIBBLES];
    for xz in 0..256 {
        let lower_start = xz * nibble_height;
        let out_start = xz * nibble_height * 2;
        let copy_len = nibble_height.min(lower.len().saturating_sub(lower_start));
        if copy_len > 0 {
            combined[out_start..out_start + copy_len]
                .copy_from_slice(&lower[lower_start..lower_start + copy_len]);
        }
        let upper_start = xz * nibble_height;
        let out_upper = out_start + nibble_height;
        let copy_len2 = nibble_height.min(upper.len().saturating_sub(upper_start));
        if copy_len2 > 0 {
            combined[out_upper..out_upper + copy_len2]
                .copy_from_slice(&upper[upper_start..upper_start + copy_len2]);
        }
    }
    combined
}

pub fn encode_legacy_nbt(level: &nbt::NbtCompound) -> Vec<u8> {
    let mut root = nbt::NbtCompound::new("");
    root.insert("Level", nbt::NbtValue::Compound(level.clone()));
    nbt::write_nbt(&root)
}

fn write_compressed_tile_storage(out: &mut Vec<u8>, blocks: &[u8]) {
    let normalized = ensure_length(blocks, BLOCKS_PER_SECTION);
    let mut blob = vec![0u8; 1024 + BLOCKS_PER_SECTION];
    let mut data_offset: usize = 0;
    for block in 0..512 {
        let index = (INDEX_TYPE_0_OR_8BIT | ((data_offset as u16) << 1)) as u16;
        blob[block * 2..block * 2 + 2].copy_from_slice(&index.to_le_bytes());
        for tile in 0..64 {
            blob[1024 + data_offset + tile] = normalized[get_compressed_tile_index(block, tile)];
        }
        data_offset += 64;
    }

    write_be_i32(out, blob.len() as i32);
    out.extend_from_slice(&blob);
}

fn write_empty_compressed_tile_storage(out: &mut Vec<u8>) {
    let mut blob = vec![0u8; 1024];
    for block in 0..512 {
        let index = (INDEX_TYPE_0_OR_8BIT | INDEX_TYPE_0BIT_FLAG) as u16;
        blob[block * 2..block * 2 + 2].copy_from_slice(&index.to_le_bytes());
    }
    write_be_i32(out, blob.len() as i32);
    out.extend_from_slice(&blob);
}

fn write_sparse_nibble_storage(out: &mut Vec<u8>, nibble_data: &[u8], supports_all_fifteen: bool) {
    let normalized = ensure_length(nibble_data, NIBBLES_PER_SECTION);
    let mut plane_indices = [0u8; 128];
    let mut planes: Vec<Vec<u8>> = Vec::new();
    for y in 0..128 {
        let mut all_zero = true;
        let mut all_fifteen = supports_all_fifteen;
        let mut plane = vec![0u8; 128];
        let mut plane_cursor = 0;
        for xz in 0..128 {
            let first = get_nibble_value(&normalized, xz * 2, y);
            let second = get_nibble_value(&normalized, xz * 2 + 1, y);

            if first != 0 || second != 0 {
                all_zero = false;
            }
            if supports_all_fifteen && (first != 15 || second != 15) {
                all_fifteen = false;
            }

            plane[plane_cursor] = first | (second << 4);
            plane_cursor += 1;
        }

        if all_zero {
            plane_indices[y] = SPARSE_ALL_ZERO_INDEX;
            continue;
        }
        if supports_all_fifteen && all_fifteen {
            plane_indices[y] = SPARSE_ALL_FIFTEEN_INDEX;
            continue;
        }

        plane_indices[y] = planes.len() as u8;
        planes.push(plane);
    }

    write_be_i32(out, planes.len() as i32);
    out.extend_from_slice(&plane_indices);
    for plane in &planes {
        out.extend_from_slice(plane);
    }
}

fn write_empty_sparse_nibble_storage(out: &mut Vec<u8>, supports_all_fifteen: bool, fill_with_fifteen: bool) {
    write_be_i32(out, 0);
    let fill = if supports_all_fifteen && fill_with_fifteen {
        SPARSE_ALL_FIFTEEN_INDEX
    } else {
        SPARSE_ALL_ZERO_INDEX
    };
    let plane_indices = [fill; 128];
    out.extend_from_slice(&plane_indices);
}

pub fn encode_compressed_storage(level: &nbt::NbtCompound) -> Vec<u8> {
    let blocks = level.byte_array("Blocks").unwrap_or(&[]);
    let data = level.byte_array("Data").unwrap_or(&[]);
    let sky_light_raw = level.byte_array("SkyLight").unwrap_or(&[]);
    let block_light_raw = level.byte_array("BlockLight").unwrap_or(&[]);
    let height_map = level.byte_array("HeightMap").unwrap_or(&[]);
    let biomes = level.byte_array("Biomes").unwrap_or(&[]);
    let default_sky = vec![0xFF; NIBBLES_PER_SECTION];
    let default_light = vec![0u8; NIBBLES_PER_SECTION];
    let sky_light = if sky_light_raw.is_empty() { default_sky.as_slice() } else { sky_light_raw };
    let block_light = if block_light_raw.is_empty() { default_light.as_slice() } else { block_light_raw };
    let mut out = Vec::new();
    write_be_i16(&mut out, SAVE_FILE_VERSION_CHUNK_INHABITED_TIME);
    write_be_i32(&mut out, level.int("xPos").unwrap_or(0));
    write_be_i32(&mut out, level.int("zPos").unwrap_or(0));
    write_be_i64(&mut out, level.long("LastUpdate").unwrap_or(0));
    write_be_i64(&mut out, level.long("InhabitedTime").unwrap_or(0));
    write_compressed_tile_storage(&mut out, &extract_lower_block_section(blocks));
    write_compressed_tile_storage(&mut out, &extract_upper_block_section(blocks));
    write_sparse_nibble_storage(&mut out, &extract_lower_nibble_section(data), false);
    write_sparse_nibble_storage(&mut out, &extract_upper_nibble_section(data), false);
    write_sparse_nibble_storage(&mut out, &extract_lower_nibble_section(sky_light), true);
    write_sparse_nibble_storage(&mut out, &extract_upper_nibble_section(sky_light), true);
    write_sparse_nibble_storage(&mut out, &extract_lower_nibble_section(block_light), true);
    write_sparse_nibble_storage(&mut out, &extract_upper_nibble_section(block_light), true);
    let hm = ensure_length(height_map, 256);
    out.extend_from_slice(&hm[..256]);
    write_be_i16(&mut out, level.short("TerrainPopulatedFlags").unwrap_or(0));
    let bio = ensure_length(biomes, 256);
    out.extend_from_slice(&bio[..256]);
    let dynamic_root = nbt::NbtCompound::new("");
    let dynamic_bytes = nbt::write_nbt(&dynamic_root);
    out.extend_from_slice(&dynamic_bytes);
    out
}

fn is_compressed_chunk_storage(data: &[u8]) -> bool {
    if data.len() < 2 + 4 + 4 + 8 {
        return false;
    }
    let version = read_be_i16(data, 0);
    version == SAVE_FILE_VERSION_COMPRESSED_CHUNK_STORAGE || version == SAVE_FILE_VERSION_CHUNK_INHABITED_TIME
}

pub fn try_read_chunk_coordinates(
    data: &[u8],
) -> Option<(i32, i32, bool)> {
    if let Some((cx, cz, wrapped)) = try_read_legacy_level_coords(data) {
        return Some((cx, cz, wrapped));
    }

    if is_compressed_chunk_storage(data) {
        let cx = read_be_i32(data, 2);
        let cz = read_be_i32(data, 6);
        return Some((cx, cz, false));
    }

    None
}

fn try_read_legacy_level_coords(data: &[u8]) -> Option<(i32, i32, bool)> {
    if data.is_empty() || data[0] != 10 {
        return None;
    }
    let compound = nbt::read_nbt(data).ok()?;
    let (level, has_wrapper) = if let Some(nbt::NbtValue::Compound(c)) = compound.get("Level") {
        (c, true)
    } else {
        (&compound, false)
    };
    let cx = level.int("xPos")?;
    let cz = level.int("zPos")?;
    Some((cx, cz, has_wrapper))
}

pub fn force_chunk_coordinates(data: &[u8], expected_x: i32, expected_z: i32) -> Vec<u8> {
    if data.is_empty() {
        return Vec::new();
    }

    if let Ok((mut level, _)) = read_legacy_level(data) {
        level.insert("xPos", nbt::NbtValue::Int(expected_x));
        level.insert("zPos", nbt::NbtValue::Int(expected_z));
        return encode_legacy_nbt(&level);
    }

    if is_compressed_chunk_storage(data) {
        let mut patched = data.to_vec();
        patched[2..6].copy_from_slice(&expected_x.to_be_bytes());
        patched[6..10].copy_from_slice(&expected_z.to_be_bytes());
        return patched;
    }

    Vec::new()
}

fn read_compressed_tile_storage(data: &[u8], offset: &mut usize) -> Result<Vec<u8>, String> {
    let allocated_size = read_be_i32(data, *offset) as usize;
    *offset += 4;
    if allocated_size < 1024 || *offset + allocated_size > data.len() {
        return Err("Invalid CompressedTileStorage payload.".into());
    }

    let blob = &data[*offset..*offset + allocated_size];
    *offset += allocated_size;
    let data_region = &blob[1024..];
    let mut blocks = vec![0u8; BLOCKS_PER_SECTION];
    for block in 0..512 {
        let block_index = u16::from_le_bytes([blob[block * 2], blob[block * 2 + 1]]);
        let index_type = block_index & INDEX_TYPE_MASK;
        if index_type == INDEX_TYPE_0_OR_8BIT {
            if (block_index & INDEX_TYPE_0BIT_FLAG) != 0 {
                let value = ((block_index >> 8) & 0xFF) as u8;
                for tile in 0..64 {
                    blocks[get_compressed_tile_index(block, tile)] = value;
                }
            } else {
                let data_offset = ((block_index >> 1) & 0x7FFE) as usize;
                if data_offset + 64 > data_region.len() {
                    return Err("Invalid 8-bit CompressedTileStorage offset.".into());
                }
                for tile in 0..64 {
                    blocks[get_compressed_tile_index(block, tile)] = data_region[data_offset + tile];
                }
            }
            continue;
        }

        let bits_per_tile = match index_type {
            INDEX_TYPE_1BIT => 1,
            INDEX_TYPE_2BIT => 2,
            INDEX_TYPE_4BIT => 4,
            _ => return Err("Unsupported CompressedTileStorage index type.".into()),
        };

        let tile_type_count = 1usize << bits_per_tile;
        let tile_type_mask = (tile_type_count - 1) as u8;
        let index_shift = 3 - index_type as usize;
        let index_mask_bits = (7 >> index_type) as usize;
        let index_mask_bytes = (62 >> index_shift) as usize;
        let packed_data_size = (8usize << index_type) as usize;
        let data_offset_packed = ((block_index >> 1) & 0x7FFE) as usize;
        if data_offset_packed + tile_type_count + packed_data_size > data_region.len() {
            return Err("Invalid packed CompressedTileStorage offset.".into());
        }

        let tile_types = &data_region[data_offset_packed..data_offset_packed + tile_type_count];
        let packed = &data_region[data_offset_packed + tile_type_count..data_offset_packed + tile_type_count + packed_data_size];
        for tile in 0..64 {
            let idx = (tile >> index_shift) & index_mask_bytes;
            let bit = (tile & index_mask_bits) * bits_per_tile;
            let palette_index = (packed[idx] >> bit) & tile_type_mask;
            blocks[get_compressed_tile_index(block, tile)] = tile_types[palette_index as usize];
        }
    }

    Ok(blocks)
}

fn skip_compressed_tile_storage(data: &[u8], offset: &mut usize) -> Result<(), String> {
    let allocated_size = read_be_i32(data, *offset) as usize;
    *offset += 4;
    if *offset + allocated_size > data.len() {
        return Err("Invalid CompressedTileStorage payload.".into());
    }
    *offset += allocated_size;
    Ok(())
}

fn read_sparse_nibble_storage(data: &[u8], offset: &mut usize, supports_all_fifteen: bool) -> Result<Vec<u8>, String> {
    let count = read_be_i32(data, *offset) as usize;
    *offset += 4;
    let storage_bytes = 128 + count * 128;
    if count > data.len() || *offset + storage_bytes > data.len() {
        return Err("Invalid SparseStorage payload.".into());
    }

    let blob = &data[*offset..*offset + storage_bytes];
    *offset += storage_bytes;
    let plane_indices = &blob[..128];
    let plane_data = &blob[128..];
    let mut nibble_data = vec![0u8; NIBBLES_PER_SECTION];
    for y in 0..128 {
        let plane_index = plane_indices[y];
        if plane_index == SPARSE_ALL_ZERO_INDEX {
            continue;
        }
        if supports_all_fifteen && plane_index == SPARSE_ALL_FIFTEEN_INDEX {
            for xz in 0..256 {
                set_nibble_value(&mut nibble_data, xz, y, 15);
            }
            continue;
        }

        let plane_offset = plane_index as usize * 128;
        if plane_offset + 128 > plane_data.len() {
            return Err("Invalid sparse plane index.".into());
        }

        let plane = &plane_data[plane_offset..plane_offset + 128];
        for xz in 0..128 {
            let packed = plane[xz];
            set_nibble_value(&mut nibble_data, xz * 2, y, packed & 0x0F);
            set_nibble_value(&mut nibble_data, xz * 2 + 1, y, (packed >> 4) & 0x0F);
        }
    }

    Ok(nibble_data)
}

fn skip_sparse_nibble_storage(data: &[u8], offset: &mut usize) -> Result<(), String> {
    let count = read_be_i32(data, *offset) as usize;
    *offset += 4;
    let storage_bytes = 128 + count * 128;
    if count > data.len() || *offset + storage_bytes > data.len() {
        return Err("Invalid SparseStorage payload.".into());
    }
    *offset += storage_bytes;
    Ok(())
}

fn read_sized_bytes(data: &[u8], offset: &mut usize, length: usize) -> Vec<u8> {
    let end = (*offset + length).min(data.len());
    let result = data[*offset..end].to_vec();
    *offset += length;
    result
}

fn read_legacy_level(data: &[u8]) -> Result<(nbt::NbtCompound, bool), String> {
    if data.is_empty() || data[0] != 10 {
        return Err("Not NBT compound".into());
    }
    let file = nbt::read_nbt(data)?;
    let has_level = file.get("Level").is_some();
    let level = if let Some(nbt::NbtValue::Compound(c)) = file.get("Level") {
        let mut cloned = c.clone();
        cloned.name = "Level".to_string();
        cloned
    } else {
        let mut cloned = file.clone();
        cloned.name = "Level".to_string();
        cloned
    };
    Ok((level, has_level))
}

pub fn try_decode_to_legacy_nbt(data: &[u8]) -> Option<Vec<u8>> {
    if let Ok((mut level, _)) = read_legacy_level(data) {
        level.name = "Level".to_string();
        return Some(encode_legacy_nbt(&level));
    }

    if !is_compressed_chunk_storage(data) {
        return None;
    }

    decode_compressed_chunk_to_legacy_root(data).ok().map(|root| nbt::write_nbt(&root))
}

fn decode_compressed_chunk_to_legacy_root(data: &[u8]) -> Result<nbt::NbtCompound, String> {
    let mut offset = 0;
    let version = read_be_i16(data, offset);
    offset = 2;
    if version != SAVE_FILE_VERSION_COMPRESSED_CHUNK_STORAGE
        && version != SAVE_FILE_VERSION_CHUNK_INHABITED_TIME
    {
        return Err(format!("Unsupported compressed chunk version: {}", version));
    }

    let chunk_x = read_be_i32(data, offset);
    offset += 4;
    let chunk_z = read_be_i32(data, offset);
    offset += 4;
    let last_update = read_be_i64(data, offset);
    offset += 8;
    let inhabited_time = if version >= SAVE_FILE_VERSION_CHUNK_INHABITED_TIME {
        let v = read_be_i64(data, offset);
        offset += 8;
        v
    } else {
        0
    };

    let lower_blocks = read_compressed_tile_storage(data, &mut offset)?;
    let upper_blocks = read_compressed_tile_storage(data, &mut offset)?;
    let lower_data = read_sparse_nibble_storage(data, &mut offset, false)?;
    let upper_data = read_sparse_nibble_storage(data, &mut offset, false)?;
    let lower_sky = read_sparse_nibble_storage(data, &mut offset, true)?;
    let upper_sky = read_sparse_nibble_storage(data, &mut offset, true)?;
    let lower_block_light = read_sparse_nibble_storage(data, &mut offset, true)?;
    let upper_block_light = read_sparse_nibble_storage(data, &mut offset, true)?;
    let height_map = read_sized_bytes(data, &mut offset, 256);
    let terrain_populated_flags = read_be_i16(data, offset);
    offset += 2;
    let biomes = read_sized_bytes(data, &mut offset, 256);
    let dynamic_root = if offset < data.len() {
        nbt::read_nbt(&data[offset..]).unwrap_or_default()
    } else {
        nbt::NbtCompound::default()
    };

    let mut level = nbt::NbtCompound::new("Level");
    level.insert("xPos", nbt::NbtValue::Int(chunk_x));
    level.insert("zPos", nbt::NbtValue::Int(chunk_z));
    level.insert("LastUpdate", nbt::NbtValue::Long(last_update));
    level.insert("InhabitedTime", nbt::NbtValue::Long(inhabited_time));
    level.insert(
        "Blocks",
        nbt::NbtValue::ByteArray(combine_block_sections(&lower_blocks, &upper_blocks)),
    );
    level.insert(
        "Data",
        nbt::NbtValue::ByteArray(combine_nibble_sections(&lower_data, &upper_data)),
    );
    level.insert(
        "SkyLight",
        nbt::NbtValue::ByteArray(combine_nibble_sections(&lower_sky, &upper_sky)),
    );
    level.insert(
        "BlockLight",
        nbt::NbtValue::ByteArray(combine_nibble_sections(
            &lower_block_light,
            &upper_block_light,
        )),
    );
    level.insert("HeightMap", nbt::NbtValue::ByteArray(height_map));
    level.insert(
        "TerrainPopulatedFlags",
        nbt::NbtValue::Short(terrain_populated_flags),
    );
    level.insert("Biomes", nbt::NbtValue::ByteArray(biomes));
    let entities = dynamic_root
        .list("Entities")
        .map(|l| nbt::NbtValue::List(l.to_vec()))
        .unwrap_or_else(|| nbt::NbtValue::List(Vec::new()));
    level.insert("Entities", entities);
    let tile_entities = dynamic_root
        .list("TileEntities")
        .map(|l| nbt::NbtValue::List(l.to_vec()))
        .unwrap_or_else(|| nbt::NbtValue::List(Vec::new()));
    level.insert("TileEntities", tile_entities);
    if let Some(tile_ticks) = dynamic_root.get("TileTicks") {
        level.insert("TileTicks", tile_ticks.clone());
    }

    let mut root = nbt::NbtCompound::new("");
    root.insert("Level", nbt::NbtValue::Compound(level));
    Ok(root)
}

pub fn try_get_compressed_chunk_nbt_offset(data: &[u8]) -> Option<usize> {
    if !is_compressed_chunk_storage(data) {
        return None;
    }

    let mut offset = 0;
    let version = read_be_i16(data, offset);
    offset = 2;
    if version != SAVE_FILE_VERSION_COMPRESSED_CHUNK_STORAGE
        && version != SAVE_FILE_VERSION_CHUNK_INHABITED_TIME
    {
        return None;
    }

    offset += 8;
    if version >= SAVE_FILE_VERSION_CHUNK_INHABITED_TIME {
        offset += 8;
    }

    let r1 = skip_compressed_tile_storage(data, &mut offset);
    if r1.is_err() { return None; }
    let r2 = skip_compressed_tile_storage(data, &mut offset);
    if r2.is_err() { return None; }
    let r3 = skip_sparse_nibble_storage(data, &mut offset);
    if r3.is_err() { return None; }
    let r4 = skip_sparse_nibble_storage(data, &mut offset);
    if r4.is_err() { return None; }
    let r5 = skip_sparse_nibble_storage(data, &mut offset);
    if r5.is_err() { return None; }
    let r6 = skip_sparse_nibble_storage(data, &mut offset);
    if r6.is_err() { return None; }
    let r7 = skip_sparse_nibble_storage(data, &mut offset);
    if r7.is_err() { return None; }
    let r8 = skip_sparse_nibble_storage(data, &mut offset);
    if r8.is_err() { return None; }
    offset += 256;
    offset += 2;
    offset += 256;
    if offset > data.len() {
        return None;
    }

    Some(offset)
}
