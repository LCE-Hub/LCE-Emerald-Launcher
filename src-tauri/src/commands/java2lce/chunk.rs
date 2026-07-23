use std::collections::HashMap;
use super::block_mapping::{self, LegacyBlockState};
use super::nbt;
use super::payload;
const CHUNK_BLOCKS: usize = 65536;
const CHUNK_NIBBLES: usize = 32768;
const HEIGHTMAP_SIZE: usize = 256;
const BIOMES_SIZE: usize = 256;
const STAIR_UPSIDE_DOWN_BIT: u8 = 4;
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum JavaChunkFormat {
    Unknown,
    LegacyBlockArray,
    LegacyAnvil,
    ModernPalette,
    ModernExtendedHeight,
}

#[derive(Debug, Clone, Copy)]
pub struct JavaChunkFormatInfo {
    pub format: JavaChunkFormat,
    pub has_level_wrapper: bool,
    pub data_version: i32,
    pub min_section_y: Option<i32>,
    pub max_section_y: Option<i32>,
    pub has_modern_entity_tags: bool,
}

impl JavaChunkFormatInfo {
    pub fn is_section_based(&self) -> bool {
        matches!(
            self.format,
            JavaChunkFormat::LegacyAnvil
                | JavaChunkFormat::ModernPalette
                | JavaChunkFormat::ModernExtendedHeight
        )
    }

    pub fn uses_palette_sections(&self) -> bool {
        matches!(
            self.format,
            JavaChunkFormat::ModernPalette | JavaChunkFormat::ModernExtendedHeight
        )
    }

    pub fn uses_modern_content_schema(&self) -> bool {
        self.uses_palette_sections() || self.has_modern_entity_tags
    }

    pub fn requires_section_shift(&self) -> bool {
        self.format == JavaChunkFormat::ModernExtendedHeight
    }
}

pub fn inspect_chunk(root_tag: &nbt::NbtCompound) -> JavaChunkFormatInfo {
    let has_level_wrapper = root_tag.get("Level").is_some();
    let source_level = root_tag
        .compound("Level")
        .unwrap_or(root_tag);

    let data_version = root_tag
        .int("DataVersion")
        .or_else(|| {
            root_tag
                .compound("Level")
                .and_then(|l| l.int("DataVersion"))
        })
        .unwrap_or(0);

    let has_modern_entity_tags = source_level.contains("block_entities") || source_level.contains("entities");
    let has_legacy_block_arrays = source_level.contains("Blocks");
    let sections = source_level
        .list("Sections")
        .or_else(|| source_level.list("sections"));

    let mut has_sections = false;
    let mut has_palette_sections = false;
    let mut min_section_y: Option<i32> = None;
    let mut max_section_y: Option<i32> = None;
    if let Some(sects) = sections {
        has_sections = !sects.is_empty();
        for tag in sects {
            if let nbt::NbtValue::Compound(section) = tag {
                if let Some(sy) = read_section_y(section) {
                    min_section_y = Some(min_section_y.map_or(sy, |v| v.min(sy)));
                    max_section_y = Some(max_section_y.map_or(sy, |v| v.max(sy)));
                }
                if section_uses_palette_storage(section) {
                    has_palette_sections = true;
                }
            }
        }
    }

    let format = if has_palette_sections {
        let has_extended = min_section_y.map_or(false, |v| v < 0)
            || max_section_y.map_or(false, |v| v > 15);
        if has_extended {
            JavaChunkFormat::ModernExtendedHeight
        } else {
            JavaChunkFormat::ModernPalette
        }
    } else if has_sections {
        JavaChunkFormat::LegacyAnvil
    } else if has_legacy_block_arrays {
        JavaChunkFormat::LegacyBlockArray
    } else {
        JavaChunkFormat::Unknown
    };

    JavaChunkFormatInfo {
        format,
        has_level_wrapper,
        data_version,
        min_section_y,
        max_section_y,
        has_modern_entity_tags,
    }
}

pub fn read_section_y(section: &nbt::NbtCompound) -> Option<i32> {
    if let Some(b) = section.byte("Y") {
        return Some(b as i8 as i32);
    }
    if let Some(i) = section.int("Y") {
        return Some(i);
    }
    if let Some(s) = section.short("Y") {
        return Some(s as i32);
    }
    None
}

fn section_uses_palette_storage(section: &nbt::NbtCompound) -> bool {
    section.contains("block_states")
        || section.contains("Palette")
        || section.contains("BlockStates")
}

fn get_byte_array_or_default(compound: &nbt::NbtCompound, name: &str, default_size: usize) -> Vec<u8> {
    match compound.byte_array(name) {
        Some(bytes) => {
            let mut v = bytes.to_vec();
            if v.len() < default_size {
                v.resize(default_size, 0);
            } else {
                v.truncate(default_size);
            }
            v
        }
        None => vec![0u8; default_size],
    }
}

struct DecodedSection {
    section_y: i32,
    blocks: Vec<u8>,
    data: Vec<u8>,
    sky_light: Option<Vec<u8>>,
    block_light: Option<Vec<u8>>,
    non_air_count: u32,
}

fn count_non_air(blocks: &[u8]) -> u32 {
    blocks.iter().filter(|&&b| b != 0).count() as u32
}

fn try_decode_section_blocks(
    section: &nbt::NbtCompound,
) -> Option<(Vec<u8>, Vec<u8>)> {
    if let Some(old_blocks) = section.byte_array("Blocks") {
        if old_blocks.len() >= 4096 {
            let blocks = old_blocks[..4096].to_vec();
            let data = section
                .byte_array("Data")
                .map(|d| d.to_vec())
                .unwrap_or_else(|| vec![0u8; CHUNK_NIBBLES]);
            return Some((blocks, data));
        }
    }
    try_decode_palette_section(section)
}

fn try_decode_palette_section(section: &nbt::NbtCompound) -> Option<(Vec<u8>, Vec<u8>)> {
    let mut blocks = vec![0u8; 4096];
    let mut data = vec![0u8; 2048];
    let block_states_container = section.compound("block_states");
    let palette = section
        .list("Palette")
        .or_else(|| {
            block_states_container
                .and_then(|bs| bs.list("palette"))
        });

    let palette = palette?;
    if palette.is_empty() {
        return None;
    }

    if palette.len() == 1 {
        if let nbt::NbtValue::Compound(entry) = &palette[0] {
            let lb = block_mapping::map_modern_block_state(entry);
            blocks.fill(lb.id);
            if lb.data != 0 {
                for i in 0..4096 {
                    nbt::set_nibble(&mut data, i, lb.data);
                }
            }
            return Some((blocks, data));
        }
        return None;
    }

    let block_states_tag = section
        .long_array("BlockStates")
        .or_else(|| {
            block_states_container
                .and_then(|bs| bs.long_array("data"))
        })?;

    if block_states_tag.is_empty() {
        return None;
    }

    let bits_per_block = get_bits_required(palette.len() - 1).max(4);
    let values_per_long = (64 / bits_per_block).max(1);
    let expected_long_count = (4096 + values_per_long - 1) / values_per_long;
    let use_padded = block_states_tag.len() == expected_long_count;
    for i in 0..4096 {
        let palette_index = if use_padded {
            read_padded_block_state(block_states_tag, bits_per_block, i)
        } else {
            read_compact_block_state(block_states_tag, bits_per_block, i)
        };

        if (palette_index as usize) >= palette.len() {
            continue;
        }

        if let nbt::NbtValue::Compound(entry) = &palette[palette_index] {
            let legacy = block_mapping::map_modern_block_state(entry);
            blocks[i] = legacy.id;
            if legacy.data != 0 {
                nbt::set_nibble(&mut data, i, legacy.data);
            }
        }
    }

    Some((blocks, data))
}

fn get_bits_required(value: usize) -> usize {
    let mut bits = 0;
    let mut v = value;
    while v > 0 {
        bits += 1;
        v >>= 1;
    }
    bits.max(1)
}

fn read_padded_block_state(block_states: &[i64], bits_per_block: usize, index: usize) -> usize {
    let values_per_long = (64 / bits_per_block).max(1);
    let long_index = index / values_per_long;
    let bit_offset = (index % values_per_long) * bits_per_block;
    let mask = (1u64 << bits_per_block) - 1;
    ((block_states[long_index] as u64 >> bit_offset) & mask) as usize
}

fn read_compact_block_state(block_states: &[i64], bits_per_block: usize, index: usize) -> usize {
    let start_bit = index * bits_per_block;
    let long_index = start_bit >> 6;
    let bit_offset = start_bit & 63;
    let mask = (1u64 << bits_per_block) - 1;
    let mut value = block_states[long_index] as u64 >> bit_offset;
    let bits_read = 64 - bit_offset;
    if bits_read < bits_per_block && long_index + 1 < block_states.len() {
        value |= (block_states[long_index + 1] as u64) << bits_read;
    }
    (value & mask) as usize
}

fn flatten_anvil_sections(
    level: &nbt::NbtCompound,
    format_info: &JavaChunkFormatInfo,
    global_section_shift: &mut Option<i32>,
) -> (Vec<u8>, Vec<u8>, Vec<u8>, Vec<u8>) {
    let mut blocks = vec![0u8; CHUNK_BLOCKS];
    let mut data = vec![0u8; CHUNK_NIBBLES];
    let mut sky_light = vec![0xFFu8; CHUNK_NIBBLES];
    let mut block_light = vec![0u8; CHUNK_NIBBLES];
    let sections = level
        .list("Sections")
        .or_else(|| level.list("sections"));

    let sections = match sections {
        Some(s) => s,
        None => return (blocks, data, sky_light, block_light),
    };

    let mut decoded_sections: Vec<DecodedSection> = Vec::new();
    for tag in sections {
        if let nbt::NbtValue::Compound(section) = tag {
            let section_y = match read_section_y(section) {
                Some(y) => y,
                None => continue,
            };

            let (s_blocks, s_data) = match try_decode_section_blocks(section) {
                Some(v) => v,
                None => continue,
            };

            let s_sky = section
                .byte_array("SkyLight")
                .or_else(|| section.byte_array("sky_light"))
                .map(|b| b.to_vec());
            let s_block = section
                .byte_array("BlockLight")
                .or_else(|| section.byte_array("block_light"))
                .map(|b| b.to_vec());

            let non_air = count_non_air(&s_blocks);
            decoded_sections.push(DecodedSection {
                section_y,
                blocks: s_blocks,
                data: s_data,
                sky_light: s_sky,
                block_light: s_block,
                non_air_count: non_air,
            });
        }
    }

    if decoded_sections.is_empty() {
        return (blocks, data, sky_light, block_light);
    }

    let mut section_shift = 0;
    if format_info.requires_section_shift() {
        if global_section_shift.is_none() {
            let anchor = decoded_sections
                .iter()
                .max_by_key(|s| (s.non_air_count, -(s.section_y - 4).abs()))
                .map(|s| s.section_y)
                .unwrap_or(4);
            *global_section_shift = Some(anchor - 4);
        }
        section_shift = global_section_shift.unwrap_or(0);
    }

    for section in &decoded_sections {
        let remapped_y = section.section_y - section_shift;
        if remapped_y < 0 || remapped_y > 15 {
            continue;
        }

        let base_y = remapped_y * 16;
        for i in 0..4096 {
            let x = i & 0x0F;
            let z = (i >> 4) & 0x0F;
            let y = (i >> 8) & 0x0F;
            let global_y = base_y + y as i32;
            if global_y < 0 || global_y >= 256 {
                continue;
            }
            let flat_index = ((x * 16) + z) * 256 + global_y as usize;
            if flat_index < CHUNK_BLOCKS {
                blocks[flat_index] = section.blocks[i];
                if section.data.len() > i {
                    nbt::set_nibble(&mut data, flat_index, nbt::get_nibble(&section.data, i));
                }
                if let Some(ref sky) = section.sky_light {
                    if sky.len() > i {
                        nbt::set_nibble(&mut sky_light, flat_index, nbt::get_nibble(sky, i));
                    }
                }
                if let Some(ref bl) = section.block_light {
                    if bl.len() > i {
                        nbt::set_nibble(&mut block_light, flat_index, nbt::get_nibble(bl, i));
                    }
                }
            }
        }
    }

    (blocks, data, sky_light, block_light)
}

pub fn convert_chunk(
    root_tag: &nbt::NbtCompound,
    new_chunk_x: i32,
    new_chunk_z: i32,
    preserve_dynamic: bool,
) -> Vec<u8> {
    let level = build_legacy_chunk_level(root_tag, new_chunk_x, new_chunk_z, preserve_dynamic);
    payload::encode_legacy_nbt(&level)
}

pub fn convert_chunk_for_save(
    root_tag: &nbt::NbtCompound,
    new_chunk_x: i32,
    new_chunk_z: i32,
    preserve_dynamic: bool,
) -> Vec<u8> {
    let level = build_legacy_chunk_level(root_tag, new_chunk_x, new_chunk_z, preserve_dynamic);
    payload::encode_compressed_storage(&level)
}

fn build_legacy_chunk_level(
    root_tag: &nbt::NbtCompound,
    new_chunk_x: i32,
    new_chunk_z: i32,
    preserve_dynamic: bool,
) -> nbt::NbtCompound {
    let format_info = inspect_chunk(root_tag);
    let source_level = root_tag
        .compound("Level")
        .unwrap_or(root_tag);
    let is_modern = format_info.uses_modern_content_schema();
    let (mut blocks, mut data, mut sky_light, mut block_light) =
        if format_info.is_section_based() {
            flatten_anvil_sections(source_level, &format_info, &mut None)
        } else {
            let b = get_byte_array_or_default(source_level, "Blocks", CHUNK_BLOCKS);
            let d = get_byte_array_or_default(source_level, "Data", CHUNK_NIBBLES);
            let s = get_byte_array_or_default(source_level, "SkyLight", CHUNK_NIBBLES);
            let bl = get_byte_array_or_default(source_level, "BlockLight", CHUNK_NIBBLES);
            (b, d, s, bl)
        };

    let height_map = get_byte_array_or_default(source_level, "HeightMap", HEIGHTMAP_SIZE);
    let mut biomes = get_byte_array_or_default(source_level, "Biomes", BIOMES_SIZE);
    if is_modern {
        biomes.fill(1);
    }

    block_mapping::remap_blocks(&mut blocks, &mut data);
    let last_update = source_level.long("LastUpdate").unwrap_or(0);
    let inhabited_time = source_level.long("InhabitedTime").unwrap_or(0);
    const TERRAIN_POPULATED_FLAGS: i16 = 0;
    sky_light.fill(0);
    block_light.fill(0);
    let mut level = nbt::NbtCompound::new("Level");
    level.insert("xPos", nbt::NbtValue::Int(new_chunk_x));
    level.insert("zPos", nbt::NbtValue::Int(new_chunk_z));
    level.insert("LastUpdate", nbt::NbtValue::Long(last_update));
    level.insert("InhabitedTime", nbt::NbtValue::Long(inhabited_time));
    level.insert("Blocks", nbt::NbtValue::ByteArray(blocks));
    level.insert("Data", nbt::NbtValue::ByteArray(data));
    level.insert("SkyLight", nbt::NbtValue::ByteArray(sky_light));
    level.insert("BlockLight", nbt::NbtValue::ByteArray(block_light));
    level.insert("HeightMap", nbt::NbtValue::ByteArray(height_map));
    level.insert("TerrainPopulatedFlags", nbt::NbtValue::Short(TERRAIN_POPULATED_FLAGS));
    level.insert("Biomes", nbt::NbtValue::ByteArray(biomes));
    let source_chunk_x = source_level.int("xPos").unwrap_or(new_chunk_x);
    let source_chunk_z = source_level.int("zPos").unwrap_or(new_chunk_z);
    let block_offset_x = (source_chunk_x - new_chunk_x) * 16;
    let block_offset_z = (source_chunk_z - new_chunk_z) * 16;
    if preserve_dynamic && !is_modern {
        let mut entities: Vec<nbt::NbtValue> = source_level
            .list("Entities")
            .map(|l| l.to_vec())
            .unwrap_or_default();
        remap_entity_positions(&mut entities, block_offset_x, block_offset_z);
        level.insert("Entities", nbt::NbtValue::List(entities));
    } else {
        level.insert("Entities", nbt::NbtValue::List(Vec::new()));
    }

    let mut tile_entities = if preserve_dynamic && !is_modern {
        build_compatible_tile_entities(source_level, false)
    } else {
        build_safe_sign_tile_entities(source_level, is_modern)
    };
    remove_unsupported_tile_entities(&mut tile_entities);
    remap_tile_entity_positions(&mut tile_entities, block_offset_x, block_offset_z);
    level.insert("TileEntities", nbt::NbtValue::List(tile_entities));
    if preserve_dynamic && !is_modern {
        if let Some(ticks) = source_level.list("TileTicks") {
            let remapped = remap_tile_tick_positions(ticks, block_offset_x, block_offset_z);
            level.insert("TileTicks", nbt::NbtValue::List(remapped));
        } else if let Some(ticks) = source_level.list("block_ticks") {
            let remapped = remap_tile_tick_positions(ticks, block_offset_x, block_offset_z);
            level.insert("TileTicks", nbt::NbtValue::List(remapped));
        }
    }

    level
}

fn build_compatible_tile_entities(
    source_level: &nbt::NbtCompound,
    is_modern: bool,
) -> Vec<nbt::NbtValue> {
    if !is_modern {
        let tiles = source_level.list("TileEntities");
        if let Some(t) = tiles {
            return t.to_vec();
        }
        let tiles2 = source_level.list("block_entities");
        if let Some(t) = tiles2 {
            return t.to_vec();
        }
        return Vec::new();
    }
    build_safe_sign_tile_entities(source_level, true)
}

fn build_safe_sign_tile_entities(
    source_level: &nbt::NbtCompound,
    is_modern: bool,
) -> Vec<nbt::NbtValue> {
    let mut result = Vec::new();
    let source = if is_modern {
        source_level
            .list("block_entities")
            .or_else(|| source_level.list("TileEntities"))
    } else {
        source_level
            .list("TileEntities")
            .or_else(|| source_level.list("block_entities"))
    };

    let source = match source {
        Some(s) => s,
        None => return result,
    };

    for tag in source {
        if let nbt::NbtValue::Compound(block_entity) = tag {
            let id = block_entity.string("id").unwrap_or("");
            let is_sign = if is_modern {
                is_modern_sign_tile_entity(id)
            } else {
                id == "Sign" || id == "minecraft:sign"
            };
            if !is_sign {
                continue;
            }
            let sign = build_safe_legacy_sign_tile_entity(block_entity, is_modern);
            result.push(nbt::NbtValue::Compound(sign));
        }
    }

    result
}

fn is_modern_sign_tile_entity(id: &str) -> bool {
    let stripped = id.strip_prefix("minecraft:").unwrap_or(id);
    matches!(
        stripped,
        "sign"
            | "hanging_sign"
            | "oak_sign"
            | "spruce_sign"
            | "birch_sign"
            | "jungle_sign"
            | "acacia_sign"
            | "dark_oak_sign"
            | "mangrove_sign"
            | "cherry_sign"
            | "bamboo_sign"
            | "crimson_sign"
            | "warped_sign"
            | "oak_hanging_sign"
            | "spruce_hanging_sign"
            | "birch_hanging_sign"
            | "jungle_hanging_sign"
            | "acacia_hanging_sign"
            | "dark_oak_hanging_sign"
            | "mangrove_hanging_sign"
            | "cherry_hanging_sign"
            | "bamboo_hanging_sign"
            | "crimson_hanging_sign"
            | "warped_hanging_sign"
    )
}

fn read_tile_entity_coord(compound: &nbt::NbtCompound, name: &str) -> i32 {
    compound.int(name)
        .map(|v| v as i32)
        .or_else(|| compound.short(name).map(|v| v as i32))
        .or_else(|| compound.byte(name).map(|v| v as i32))
        .unwrap_or(0)
}

fn extract_modern_sign_lines(block_entity: &nbt::NbtCompound) -> [String; 4] {
    let mut lines: [String; 4] = Default::default();
    if let Some(front_text) = block_entity.compound("front_text") {
        if let Some(messages) = front_text.list("messages") {
            for i in 0..4.min(messages.len()) {
                if let nbt::NbtValue::String(s) = &messages[i] {
                    lines[i] = sanitize_legacy_sign_line(&simplify_sign_text(s));
                }
            }
            return lines;
        }
    }

    for i in 0..4 {
        let key = format!("Text{}", i + 1);
        let value = block_entity.string(&key).unwrap_or("");
        lines[i] = sanitize_legacy_sign_line(&simplify_sign_text(value));
    }

    lines
}

fn extract_legacy_sign_lines(block_entity: &nbt::NbtCompound) -> [String; 4] {
    let mut lines: [String; 4] = Default::default();
    for i in 0..4 {
        let key = format!("Text{}", i + 1);
        let value = block_entity.string(&key).unwrap_or("");
        lines[i] = sanitize_legacy_sign_line(&simplify_sign_text(value));
    }
    lines
}

fn sanitize_legacy_sign_line(raw: &str) -> String {
    let mut builder = String::new();
    for ch in raw.chars() {
        if ch == '\r' || ch == '\n' || ch == '\t' || ch == '\0' {
            continue;
        }
        if ch.is_control() {
            continue;
        }
        builder.push(ch);
        if builder.len() >= 15 {
            break;
        }
    }
    builder
}

fn simplify_sign_text(raw: &str) -> String {
    let raw = raw.trim();
    if !(raw.starts_with('{') || raw.starts_with('[') || raw.starts_with('"')) {
        return raw.to_string();
    }

    if let Ok(doc) = serde_json::from_str::<serde_json::Value>(raw) {
        let mut builder = String::new();
        append_json_text(&doc, &mut builder);
        return builder;
    }

    raw.trim_matches('"').to_string()
}

fn append_json_text(element: &serde_json::Value, builder: &mut String) {
    match element {
        serde_json::Value::String(s) => builder.push_str(s),
        serde_json::Value::Array(arr) => {
            for item in arr {
                append_json_text(item, builder);
            }
        }
        serde_json::Value::Object(obj) => {
            if let Some(serde_json::Value::String(text)) = obj.get("text") {
                builder.push_str(text);
            }
            if let Some(extra) = obj.get("extra") {
                append_json_text(extra, builder);
            }
        }
        _ => {}
    }
}

fn build_safe_legacy_sign_tile_entity(
    block_entity: &nbt::NbtCompound,
    is_modern: bool,
) -> nbt::NbtCompound {
    let x = read_tile_entity_coord(block_entity, "x");
    let y = read_tile_entity_coord(block_entity, "y");
    let z = read_tile_entity_coord(block_entity, "z");
    let lines = if is_modern {
        extract_modern_sign_lines(block_entity)
    } else {
        extract_legacy_sign_lines(block_entity)
    };

    let mut sign = nbt::NbtCompound::new("");
    sign.insert("id", nbt::NbtValue::String("Sign".to_string()));
    sign.insert("x", nbt::NbtValue::Int(x));
    sign.insert("y", nbt::NbtValue::Int(y));
    sign.insert("z", nbt::NbtValue::Int(z));
    sign.insert("Text1", nbt::NbtValue::String(lines[0].clone()));
    sign.insert("Text2", nbt::NbtValue::String(lines[1].clone()));
    sign.insert("Text3", nbt::NbtValue::String(lines[2].clone()));
    sign.insert("Text4", nbt::NbtValue::String(lines[3].clone()));
    sign
}

fn remap_tile_tick_positions(
    ticks: &[nbt::NbtValue],
    block_offset_x: i32,
    block_offset_z: i32,
) -> Vec<nbt::NbtValue> {
    if block_offset_x == 0 && block_offset_z == 0 {
        return ticks.to_vec();
    }
    let mut result = Vec::new();
    for tag in ticks {
        if let nbt::NbtValue::Compound(mut tick) = tag.clone() {
            if let Some(nbt::NbtValue::Int(x)) = tick.get_mut("x") {
                *x -= block_offset_x;
            }
            if let Some(nbt::NbtValue::Int(z)) = tick.get_mut("z") {
                *z -= block_offset_z;
            }
            result.push(nbt::NbtValue::Compound(tick));
        }
    }
    result
}

fn remap_entity_positions(entities: &mut Vec<nbt::NbtValue>, block_offset_x: i32, block_offset_z: i32) {
    if block_offset_x == 0 && block_offset_z == 0 {
        return;
    }
    for tag in entities.iter_mut() {
        if let nbt::NbtValue::Compound(entity) = tag {
            if let Some(nbt::NbtValue::List(pos)) = entity.get_mut("Pos") {
                if pos.len() >= 3 {
                    if let nbt::NbtValue::Double(x) = &mut pos[0] {
                        *x -= block_offset_x as f64;
                    }
                    if let nbt::NbtValue::Double(z) = &mut pos[2] {
                        *z -= block_offset_z as f64;
                    }
                }
            }
            if let Some(nbt::NbtValue::Compound(riding)) = entity.get_mut("Riding") {
                let mut inner = vec![nbt::NbtValue::Compound(riding.clone())];
                remap_entity_positions(&mut inner, block_offset_x, block_offset_z);
                if let Some(nbt::NbtValue::Compound(updated)) = inner.into_iter().next() {
                    *riding = updated;
                }
            }
        }
    }
}

fn remove_unsupported_tile_entities(tile_entities: &mut Vec<nbt::NbtValue>) {
    tile_entities.retain(|tag| {
        if let nbt::NbtValue::Compound(te) = tag {
            let id = te.string("id").unwrap_or("");
            return id != "Control" && id != "minecraft:command_block" && id != "CommandBlock";
        }
        false
    });
}

fn remap_tile_entity_positions(tile_entities: &mut Vec<nbt::NbtValue>, block_offset_x: i32, block_offset_z: i32) {
    if block_offset_x == 0 && block_offset_z == 0 {
        return;
    }
    for tag in tile_entities.iter_mut() {
        if let nbt::NbtValue::Compound(te) = tag {
            if let Some(nbt::NbtValue::Int(x)) = te.get_mut("x") {
                *x -= block_offset_x;
            }
            if let Some(nbt::NbtValue::Int(z)) = te.get_mut("z") {
                *z -= block_offset_z;
            }
        }
    }
}

pub fn build_modern_anvil_level(
    legacy_level: &nbt::NbtCompound,
    chunk_x: i32,
    chunk_z: i32,
) -> nbt::NbtCompound {
    let default_blocks = vec![0u8; 32768];
    let default_data = vec![0u8; 16384];
    let old_blocks_ref = legacy_level
        .byte_array("Blocks")
        .unwrap_or(&default_blocks);
    let old_data_ref = legacy_level
        .byte_array("Data")
        .unwrap_or(&default_data);

    let mut section_tags: Vec<nbt::NbtValue> = Vec::new();
    for section_y in 0..8 {
        let mut palette_list: Vec<String> = Vec::new();
        let mut palette_dict: HashMap<String, usize> = HashMap::new();
        let mut indices = [0i32; 4096];
        let mut has_non_air = false;
        for y in 0..16 {
            for z in 0..16 {
                for x in 0..16 {
                    let global_y = section_y * 16 + y;
                    let legacy_flat_index = ((x * 16) + z) * 128 + global_y;
                    if legacy_flat_index >= old_blocks_ref.len() {
                        continue;
                    }
                    let block_id = old_blocks_ref[legacy_flat_index];
                    let meta = nbt::get_nibble(old_data_ref, legacy_flat_index);
                    let modern_state = get_contextual_block_state(block_id, meta, x, global_y, z, old_blocks_ref, old_data_ref);
                    if modern_state != "minecraft:air" {
                        has_non_air = true;
                    }

                    let idx = *palette_dict
                        .entry(modern_state.clone())
                        .or_insert_with(|| {
                            let idx = palette_list.len();
                            palette_list.push(modern_state);
                            idx
                        });

                    indices[y * 256 + z * 16 + x] = idx as i32;
                }
            }
        }

        if !has_non_air && section_y > 0 {
            continue;
        }

        let mut section_tag = nbt::NbtCompound::new("");
        section_tag.insert("Y", nbt::NbtValue::Byte(section_y as i8));
        let mut block_states_tag = nbt::NbtCompound::new("block_states");
        let mut nbt_palette: Vec<nbt::NbtValue> = Vec::new();
        for state in &palette_list {
            let mut p_tag = nbt::NbtCompound::new("");
            if let Some(bracket_idx) = state.find('[') {
                let name = &state[..bracket_idx];
                let props_str = &state[bracket_idx + 1..state.len() - 1];
                p_tag.insert("Name", nbt::NbtValue::String(name.to_string()));
                let mut props_compound = nbt::NbtCompound::new("Properties");
                for prop in props_str.split(',') {
                    let kv: Vec<&str> = prop.splitn(2, '=').collect();
                    if kv.len() == 2 {
                        props_compound
                            .insert(kv[0], nbt::NbtValue::String(kv[1].to_string()));
                    }
                }
                p_tag.insert("Properties", nbt::NbtValue::Compound(props_compound));
            } else {
                p_tag.insert("Name", nbt::NbtValue::String(state.to_string()));
            }
            nbt_palette.push(nbt::NbtValue::Compound(p_tag));
        }
        block_states_tag.insert("palette", nbt::NbtValue::List(nbt_palette));
        if palette_list.len() > 1 {
            let bits_per_block = (64.0 / (palette_list.len() as f64).log2().ceil()).floor().max(4.0) as usize;
            let values_per_long = 64 / bits_per_block;
            let long_count = ((4096.0 / values_per_long as f64).ceil()) as usize;
            let mut data_array = vec![0i64; long_count];
            let mut current_long: u64 = 0;
            let mut blocks_in_current_long = 0;
            let mut long_index = 0;
            for i in 0..4096 {
                let val = indices[i] as u64;
                current_long |= val << (blocks_in_current_long * bits_per_block);
                blocks_in_current_long += 1;
                if blocks_in_current_long >= values_per_long {
                    data_array[long_index] = current_long as i64;
                    long_index += 1;
                    current_long = 0;
                    blocks_in_current_long = 0;
                }
            }

            if blocks_in_current_long > 0 {
                data_array[long_index] = current_long as i64;
            }

            block_states_tag.insert("data", nbt::NbtValue::LongArray(data_array));
        }

        section_tag.insert("block_states", nbt::NbtValue::Compound(block_states_tag));
        let mut biomes_tag = nbt::NbtCompound::new("biomes");
        let biome_palette = nbt::NbtValue::List(vec![nbt::NbtValue::String(
            "minecraft:plains".to_string(),
        )]);
        biomes_tag.insert("palette", biome_palette);
        section_tag.insert("biomes", nbt::NbtValue::Compound(biomes_tag));
        section_tags.push(nbt::NbtValue::Compound(section_tag));
    }

    let mut root = nbt::NbtCompound::new("");
    root.insert("xPos", nbt::NbtValue::Int(chunk_x));
    root.insert("zPos", nbt::NbtValue::Int(chunk_z));
    root.insert("yPos", nbt::NbtValue::Int(0));
    root.insert("Status", nbt::NbtValue::String("full".to_string()));
    let mut block_entities: Vec<nbt::NbtValue> = Vec::new();
    if let Some(old_te_list) = legacy_level.list("TileEntities") {
        for old_te in old_te_list {
            if let nbt::NbtValue::Compound(old_te_comp) = old_te {
                let mut new_te = old_te_comp.clone();
                let id = new_te.string("id").unwrap_or("").to_string();
                let new_id = match id.as_str() {
                    "Chest" => Some("minecraft:chest"),
                    "Furnace" => Some("minecraft:furnace"),
                    "BrewingStand" => Some("minecraft:brewing_stand"),
                    "EnchantTable" => Some("minecraft:enchanting_table"),
                    "Trap" => Some("minecraft:dispenser"),
                    "MobSpawner" => Some("minecraft:mob_spawner"),
                    "Control" => Some("minecraft:command_block"),
                    "Beacon" => Some("minecraft:beacon"),
                    "Skull" => Some("minecraft:skull"),
                    "Sign" => Some("minecraft:sign"),
                    "Cauldron" => Some("minecraft:cauldron"),
                    "Dropper" => Some("minecraft:dropper"),
                    "Hopper" => Some("minecraft:hopper"),
                    "Comparator" => Some("minecraft:comparator"),
                    "RecordPlayer" => Some("minecraft:jukebox"),
                    "Banner" => Some("minecraft:banner"),
                    _ if id.starts_with("minecraft:") => Some(id.as_str()),
                    _ => None,
                };

                if let Some(nid) = new_id {
                    new_te.insert("id", nbt::NbtValue::String(nid.to_string()));
                    block_entities.push(nbt::NbtValue::Compound(new_te));
                }
            }
        }
    }

    for i in 0..old_blocks_ref.len().min(32768) {
        if old_blocks_ref[i] == 26 {
            let y = i % 128;
            let z = (i / 128) % 16;
            let x = i / 2048;
            let mut bed_te = nbt::NbtCompound::new("");
            bed_te.insert("id", nbt::NbtValue::String("minecraft:bed".to_string()));
            bed_te.insert("color", nbt::NbtValue::Int(14));
            bed_te.insert("x", nbt::NbtValue::Int(chunk_x * 16 + x as i32));
            bed_te.insert("y", nbt::NbtValue::Int(y as i32));
            bed_te.insert("z", nbt::NbtValue::Int(chunk_z * 16 + z as i32));
            block_entities.push(nbt::NbtValue::Compound(bed_te));
        }
    }

    root.insert(
        "block_entities",
        nbt::NbtValue::List(block_entities),
    );
    root.insert("sections", nbt::NbtValue::List(section_tags));
    root
}

fn get_contextual_block_state(
    block_id: u8,
    meta: u8,
    x: usize,
    global_y: usize,
    z: usize,
    old_blocks: &[u8],
    old_data: &[u8],
) -> String {
    let modern_state = get_modern_block_name(block_id, meta);
    let get_neighbor = |nx: i32, ny: i32, nz: i32| -> (u8, u8) {
        if nx < 0 || nx > 15 || ny < 0 || ny > 127 || nz < 0 || nz > 15 {
            return (0, 0);
        }
        let idx = ((nx as usize * 16) + nz as usize) * 128 + ny as usize;
        if idx >= old_blocks.len() {
            return (0, 0);
        }
        let n_id = old_blocks[idx];
        let n_meta = nbt::get_nibble(old_data, idx);
        (n_id, n_meta)
    };

    let bracket_index = modern_state.find('[');
    let name = if let Some(bi) = bracket_index {
        &modern_state[..bi]
    } else {
        &modern_state
    };
    let mut properties: HashMap<String, String> = HashMap::new();
    if let Some(bi) = bracket_index {
        let props_str = &modern_state[bi + 1..modern_state.len() - 1];
        for prop in props_str.split(',') {
            let kv: Vec<&str> = prop.splitn(2, '=').collect();
            if kv.len() == 2 {
                properties.insert(kv[0].to_string(), kv[1].to_string());
            }
        }
    }

    let mut properties_changed = false;
    if block_id == 64 || block_id == 71 || (block_id >= 193 && block_id <= 197) {
        let is_top = (meta & 8) == 8;
        properties.insert("half".to_string(), if is_top { "upper" } else { "lower" }.to_string());
        if is_top {
            properties.insert(
                "hinge".to_string(),
                if (meta & 1) == 1 { "right" } else { "left" }.to_string(),
            );
            let (bottom_id, bottom_meta) = get_neighbor(x as i32, global_y as i32 - 1, z as i32);
            if bottom_id == block_id {
                let facing_meta = bottom_meta & 3;
                properties.insert(
                    "facing".to_string(),
                    match facing_meta {
                        0 => "east",
                        1 => "south",
                        2 => "west",
                        _ => "north",
                    }
                    .to_string(),
                );
                properties.insert(
                    "open".to_string(),
                    if (bottom_meta & 4) == 4 { "true" } else { "false" }.to_string(),
                );
            } else {
                properties.insert("facing".to_string(), "east".to_string());
                properties.insert("open".to_string(), "false".to_string());
            }
        } else {
            let facing_meta = meta & 3;
            properties.insert(
                "facing".to_string(),
                match facing_meta {
                    0 => "east",
                    1 => "south",
                    2 => "west",
                    _ => "north",
                }
                .to_string(),
            );
            properties.insert(
                "open".to_string(),
                if (meta & 4) == 4 { "true" } else { "false" }.to_string(),
            );
            let (top_id, top_meta) = get_neighbor(x as i32, global_y as i32 + 1, z as i32);
            properties.insert(
                "hinge".to_string(),
                if top_id == block_id {
                    if (top_meta & 1) == 1 { "right" } else { "left" }
                } else {
                    "left"
                }
                .to_string(),
            );
        }
        properties_changed = true;
    } else if block_id == 63 || block_id == 68 {
        if block_id == 68 {
            properties.insert(
                "facing".to_string(),
                match meta {
                    2 => "north",
                    3 => "south",
                    4 => "west",
                    _ => "east",
                }
                .to_string(),
            );
        } else {
            properties.insert("rotation".to_string(), meta.to_string());
        }
        properties.remove("waterlogged");
        properties_changed = true;
    } else if block_id == 50 || block_id == 75 || block_id == 76 {
        if meta >= 1 && meta <= 4 {
            properties.insert(
                "facing".to_string(),
                match meta {
                    1 => "east",
                    2 => "west",
                    3 => "south",
                    _ => "north",
                }
                .to_string(),
            );
        }
        if block_id == 76 {
            properties.insert("lit".to_string(), "true".to_string());
        } else if block_id == 75 {
            properties.insert("lit".to_string(), "false".to_string());
        }
        properties_changed = true;
    } else if block_id == 54 || block_id == 146 {
        let facing = match meta {
            2 => "north",
            3 => "south",
            4 => "west",
            5 => "east",
            _ => "south",
        };
        properties.insert("type".to_string(), "single".to_string());
        properties.insert("facing".to_string(), facing.to_string());
        let dirs = [(-1i32, 0i32), (1, 0), (0, -1), (0, 1)];
        for (dx, dz) in dirs {
            let (nid, _) = get_neighbor(x as i32 + dx, global_y as i32, z as i32 + dz);
            if nid == block_id {
                let is_left = match facing {
                    "north" => dx == -1,
                    "south" => dx == 1,
                    "west" => dz == 1,
                    "east" => dz == -1,
                    _ => false,
                };
                properties.insert(
                    "type".to_string(),
                    if is_left { "right" } else { "left" }.to_string(),
                );
                break;
            }
        }
        properties_changed = true;
    } else if is_stair_legacy(block_id) {
        let facing = get_stair_facing(meta);
        let half = if (meta & STAIR_UPSIDE_DOWN_BIT) != 0 {
            "top"
        } else {
            "bottom"
        };
        properties.insert("facing".to_string(), facing.to_string());
        properties.insert("half".to_string(), half.to_string());
        properties.insert("shape".to_string(), "straight".to_string());
        let (front_dx, front_dz) = match facing {
            "north" => (0i32, 1i32),
            "south" => (0, -1),
            "west" => (1, 0),
            "east" => (-1, 0),
            _ => (0, 0),
        };
        let (back_dx, back_dz) = match facing {
            "north" => (0i32, -1i32),
            "south" => (0, 1),
            "west" => (-1, 0),
            "east" => (1, 0),
            _ => (0, 0),
        };

        let back_neighbor = get_neighbor(x as i32 + back_dx, global_y as i32, z as i32 + back_dz);
        if is_stair_legacy(back_neighbor.0) {
            let back_facing = get_stair_facing(back_neighbor.1);
            let back_half = if (back_neighbor.1 & STAIR_UPSIDE_DOWN_BIT) != 0 {
                "top"
            } else {
                "bottom"
            };
            if back_half == half {
                if let Some(side) = get_relative_side(facing, &back_facing) {
                    properties.insert("shape".to_string(), format!("outer_{}", side));
                }
            }
        } else {
            let front_neighbor = get_neighbor(x as i32 + front_dx, global_y as i32, z as i32 + front_dz);
            if is_stair_legacy(front_neighbor.0) {
                let front_facing = get_stair_facing(front_neighbor.1);
                let front_half = if (front_neighbor.1 & STAIR_UPSIDE_DOWN_BIT) != 0 {
                    "top"
                } else {
                    "bottom"
                };
                if front_half == half {
                    if let Some(side) = get_relative_side(facing, &front_facing) {
                        properties.insert("shape".to_string(), format!("inner_{}", side));
                    }
                }
            }
        }
        properties_changed = true;
    } else if is_fence_legacy(block_id) {
        let (n_id, _) = get_neighbor(x as i32, global_y as i32, z as i32 - 1);
        let (e_id, _) = get_neighbor(x as i32 + 1, global_y as i32, z as i32);
        let (s_id, _) = get_neighbor(x as i32, global_y as i32, z as i32 + 1);
        let (w_id, _) = get_neighbor(x as i32 - 1, global_y as i32, z as i32);
        properties.insert(
            "north".to_string(),
            (is_fence_legacy(n_id) || is_fence_gate_legacy(n_id) || is_likely_solid_attachment(n_id))
                .to_string(),
        );
        properties.insert(
            "east".to_string(),
            (is_fence_legacy(e_id) || is_fence_gate_legacy(e_id) || is_likely_solid_attachment(e_id))
                .to_string(),
        );
        properties.insert(
            "south".to_string(),
            (is_fence_legacy(s_id) || is_fence_gate_legacy(s_id) || is_likely_solid_attachment(s_id))
                .to_string(),
        );
        properties.insert(
            "west".to_string(),
            (is_fence_legacy(w_id) || is_fence_gate_legacy(w_id) || is_likely_solid_attachment(w_id))
                .to_string(),
        );
        properties_changed = true;
    } else if is_pane_legacy(block_id) {
        let (n_id, _) = get_neighbor(x as i32, global_y as i32, z as i32 - 1);
        let (e_id, _) = get_neighbor(x as i32 + 1, global_y as i32, z as i32);
        let (s_id, _) = get_neighbor(x as i32, global_y as i32, z as i32 + 1);
        let (w_id, _) = get_neighbor(x as i32 - 1, global_y as i32, z as i32);
        properties.insert(
            "north".to_string(),
            (is_pane_legacy(n_id) || is_glass_legacy(n_id) || is_likely_solid_attachment(n_id))
                .to_string(),
        );
        properties.insert(
            "east".to_string(),
            (is_pane_legacy(e_id) || is_glass_legacy(e_id) || is_likely_solid_attachment(e_id))
                .to_string(),
        );
        properties.insert(
            "south".to_string(),
            (is_pane_legacy(s_id) || is_glass_legacy(s_id) || is_likely_solid_attachment(s_id))
                .to_string(),
        );
        properties.insert(
            "west".to_string(),
            (is_pane_legacy(w_id) || is_glass_legacy(w_id) || is_likely_solid_attachment(w_id))
                .to_string(),
        );
        properties_changed = true;
    }

    if properties_changed || name == "minecraft:red_bed" {
        if !properties.is_empty() {
            let parts: Vec<String> = properties.iter().map(|(k, v)| format!("{}={}", k, v)).collect();
            return format!("{}[{}]", name, parts.join(","));
        }
        return name.to_string();
    }

    modern_state
}

fn get_modern_block_name(block_id: u8, meta: u8) -> String {
    let name = get_contextual_modern_name(block_id, meta);
    if let Some(props) = get_contextual_properties(block_id, meta) {
        format!("{}[{}]", name, props)
    } else {
        name
    }
}

fn get_contextual_modern_name(block_id: u8, meta: u8) -> String {
    match block_id {
        0 => "minecraft:air".into(),
        1 => "minecraft:stone".into(),
        2 => "minecraft:grass_block".into(),
        3 => "minecraft:dirt".into(),
        4 => "minecraft:cobblestone".into(),
        5 => match meta {
            1 => "minecraft:spruce_planks",
            2 => "minecraft:birch_planks",
            3 => "minecraft:jungle_planks",
            _ => "minecraft:oak_planks",
        }
        .into(),
        6 => match meta {
            1 => "minecraft:spruce_sapling",
            2 => "minecraft:birch_sapling",
            3 => "minecraft:jungle_sapling",
            _ => "minecraft:oak_sapling",
        }
        .into(),
        7 => "minecraft:bedrock".into(),
        8 | 9 => "minecraft:water".into(),
        10 | 11 => "minecraft:lava".into(),
        12 => "minecraft:sand".into(),
        13 => "minecraft:gravel".into(),
        14 => "minecraft:gold_ore".into(),
        15 => "minecraft:iron_ore".into(),
        16 => "minecraft:coal_ore".into(),
        17 => match meta & 3 {
            1 => "minecraft:spruce_log",
            2 => "minecraft:birch_log",
            3 => "minecraft:jungle_log",
            _ => "minecraft:oak_log",
        }
        .into(),
        18 => match meta & 3 {
            1 => "minecraft:spruce_leaves",
            2 => "minecraft:birch_leaves",
            3 => "minecraft:jungle_leaves",
            _ => "minecraft:oak_leaves",
        }
        .into(),
        19 => "minecraft:sponge".into(),
        20 => "minecraft:glass".into(),
        21 => "minecraft:lapis_ore".into(),
        22 => "minecraft:lapis_block".into(),
        23 => "minecraft:dispenser".into(),
        24 => match meta {
            1 => "minecraft:chiseled_sandstone",
            2 => "minecraft:smooth_sandstone",
            _ => "minecraft:sandstone",
        }
        .into(),
        25 => "minecraft:note_block".into(),
        26 => "minecraft:red_bed".into(),
        27 => "minecraft:powered_rail".into(),
        28 => "minecraft:detector_rail".into(),
        29 => "minecraft:sticky_piston".into(),
        30 => "minecraft:cobweb".into(),
        31 => "minecraft:short_grass".into(),
        32 => "minecraft:dead_bush".into(),
        33 => "minecraft:piston".into(),
        35 => match meta {
            1 => "minecraft:orange_wool",
            2 => "minecraft:magenta_wool",
            3 => "minecraft:light_blue_wool",
            4 => "minecraft:yellow_wool",
            5 => "minecraft:lime_wool",
            6 => "minecraft:pink_wool",
            7 => "minecraft:gray_wool",
            8 => "minecraft:light_gray_wool",
            9 => "minecraft:cyan_wool",
            10 => "minecraft:purple_wool",
            11 => "minecraft:blue_wool",
            12 => "minecraft:brown_wool",
            13 => "minecraft:green_wool",
            14 => "minecraft:red_wool",
            15 => "minecraft:black_wool",
            _ => "minecraft:white_wool",
        }
        .into(),
        37 => "minecraft:dandelion".into(),
        38 => "minecraft:poppy".into(),
        39 => "minecraft:brown_mushroom".into(),
        40 => "minecraft:red_mushroom".into(),
        41 => "minecraft:gold_block".into(),
        42 => "minecraft:iron_block".into(),
        44 => {
            let variant = meta & 7;
            let name = match variant {
                1 => "minecraft:sandstone_slab",
                2 => "minecraft:stone_slab",
                3 => "minecraft:cobblestone_slab",
                4 => "minecraft:brick_slab",
                5 => "minecraft:stone_brick_slab",
                6 => "minecraft:nether_brick_slab",
                7 => "minecraft:quartz_slab",
                _ => "minecraft:stone_slab",
            };
            return name.to_string();
        }
        45 => "minecraft:bricks".into(),
        46 => "minecraft:tnt".into(),
        47 => "minecraft:bookshelf".into(),
        48 => "minecraft:mossy_cobblestone".into(),
        49 => "minecraft:obsidian".into(),
        50 => "minecraft:torch".into(),
        51 => "minecraft:fire".into(),
        52 => "minecraft:mob_spawner".into(),
        53 => "minecraft:oak_stairs".into(),
        54 => "minecraft:chest".into(),
        55 => "minecraft:redstone_wire".into(),
        56 => "minecraft:diamond_ore".into(),
        57 => "minecraft:diamond_block".into(),
        58 => "minecraft:crafting_table".into(),
        59 => "minecraft:wheat".into(),
        60 => "minecraft:farmland".into(),
        61 => "minecraft:furnace".into(),
        63 => "minecraft:oak_sign".into(),
        64 => "minecraft:oak_door".into(),
        65 => "minecraft:ladder".into(),
        66 => "minecraft:rail".into(),
        67 => "minecraft:cobblestone_stairs".into(),
        68 => "minecraft:oak_wall_sign".into(),
        69 => "minecraft:lever".into(),
        70 => "minecraft:stone_pressure_plate".into(),
        71 => "minecraft:iron_door".into(),
        72 => "minecraft:oak_pressure_plate".into(),
        73 => "minecraft:redstone_ore".into(),
        75 => "minecraft:redstone_wall_torch".into(),
        76 => "minecraft:redstone_torch".into(),
        77 => "minecraft:stone_button".into(),
        78 => "minecraft:snow".into(),
        79 => "minecraft:ice".into(),
        80 => "minecraft:snow_block".into(),
        81 => "minecraft:cactus".into(),
        82 => "minecraft:clay".into(),
        83 => "minecraft:sugar_cane".into(),
        84 => "minecraft:jukebox".into(),
        85 => "minecraft:oak_fence".into(),
        86 => "minecraft:carved_pumpkin".into(),
        87 => "minecraft:netherrack".into(),
        88 => "minecraft:soul_sand".into(),
        89 => "minecraft:glowstone".into(),
        90 => "minecraft:nether_portal".into(),
        91 => "minecraft:jack_o_lantern".into(),
        92 => "minecraft:cake".into(),
        93 => "minecraft:unpowered_repeater".into(),
        94 => "minecraft:powered_repeater".into(),
        96 => "minecraft:trapdoor".into(),
        98 => "minecraft:stone_bricks".into(),
        101 => "minecraft:iron_bars".into(),
        102 => "minecraft:glass_pane".into(),
        103 => "minecraft:melon".into(),
        104 => "minecraft:pumpkin_stem".into(),
        105 => "minecraft:melon_stem".into(),
        106 => "minecraft:vine".into(),
        107 => "minecraft:oak_fence_gate".into(),
        108 => "minecraft:brick_stairs".into(),
        109 => "minecraft:stone_brick_stairs".into(),
        110 => "minecraft:mycelium".into(),
        111 => "minecraft:lily_pad".into(),
        112 => "minecraft:nether_bricks".into(),
        113 => "minecraft:nether_brick_fence".into(),
        114 => "minecraft:nether_brick_stairs".into(),
        115 => "minecraft:nether_wart".into(),
        116 => "minecraft:enchanting_table".into(),
        117 => "minecraft:brewing_stand".into(),
        118 => "minecraft:cauldron".into(),
        121 => "minecraft:end_stone".into(),
        122 => "minecraft:dragon_egg".into(),
        123 => "minecraft:redstone_lamp".into(),
        124 => "minecraft:redstone_lamp".into(),
        125 => "minecraft:double_wooden_slab".into(),
        126 => "minecraft:wooden_slab".into(),
        127 => "minecraft:cocoa".into(),
        128 => "minecraft:sandstone_stairs".into(),
        129 => "minecraft:emerald_ore".into(),
        130 => "minecraft:ender_chest".into(),
        131 => "minecraft:tripwire_hook".into(),
        132 => "minecraft:tripwire".into(),
        133 => "minecraft:emerald_block".into(),
        134 => "minecraft:spruce_stairs".into(),
        135 => "minecraft:birch_stairs".into(),
        136 => "minecraft:jungle_stairs".into(),
        138 => "minecraft:beacon".into(),
        139 => "minecraft:cobblestone_wall".into(),
        140 => "minecraft:flower_pot".into(),
        141 => "minecraft:carrots".into(),
        142 => "minecraft:potatoes".into(),
        143 => "minecraft:wooden_button".into(),
        144 => "minecraft:skull".into(),
        145 => "minecraft:anvil".into(),
        146 => "minecraft:trapped_chest".into(),
        147 => "minecraft:light_weighted_pressure_plate".into(),
        148 => "minecraft:heavy_weighted_pressure_plate".into(),
        149 => "minecraft:unpowered_comparator".into(),
        150 => "minecraft:powered_comparator".into(),
        151 => "minecraft:daylight_detector".into(),
        152 => "minecraft:redstone_block".into(),
        153 => "minecraft:nether_quartz_ore".into(),
        154 => "minecraft:hopper".into(),
        155 => match meta {
            1 => "minecraft:chiseled_quartz_block",
            2 => "minecraft:quartz_pillar",
            3 => "minecraft:quartz_pillar",
            _ => "minecraft:quartz_block",
        }
        .into(),
        156 => "minecraft:quartz_stairs".into(),
        157 => "minecraft:activator_rail".into(),
        158 => "minecraft:dropper".into(),
        159 => match meta {
            0 => "minecraft:white_stained_hardened_clay",
            1 => "minecraft:orange_stained_hardened_clay",
            2 => "minecraft:magenta_stained_hardened_clay",
            3 => "minecraft:light_blue_stained_hardened_clay",
            4 => "minecraft:yellow_stained_hardened_clay",
            5 => "minecraft:lime_stained_hardened_clay",
            6 => "minecraft:pink_stained_hardened_clay",
            7 => "minecraft:gray_stained_hardened_clay",
            8 => "minecraft:light_gray_stained_hardened_clay",
            9 => "minecraft:cyan_stained_hardened_clay",
            10 => "minecraft:purple_stained_hardened_clay",
            11 => "minecraft:blue_stained_hardened_clay",
            12 => "minecraft:brown_stained_hardened_clay",
            13 => "minecraft:green_stained_hardened_clay",
            14 => "minecraft:red_stained_hardened_clay",
            15 => "minecraft:black_stained_hardened_clay",
            _ => "minecraft:white_stained_hardened_clay",
        }
        .into(),
        160 => match meta {
            0 => "minecraft:white_stained_glass_pane",
            1 => "minecraft:orange_stained_glass_pane",
            2 => "minecraft:magenta_stained_glass_pane",
            3 => "minecraft:light_blue_stained_glass_pane",
            4 => "minecraft:yellow_stained_glass_pane",
            5 => "minecraft:lime_stained_glass_pane",
            6 => "minecraft:pink_stained_glass_pane",
            7 => "minecraft:gray_stained_glass_pane",
            8 => "minecraft:light_gray_stained_glass_pane",
            9 => "minecraft:cyan_stained_glass_pane",
            10 => "minecraft:purple_stained_glass_pane",
            11 => "minecraft:blue_stained_glass_pane",
            12 => "minecraft:brown_stained_glass_pane",
            13 => "minecraft:green_stained_glass_pane",
            14 => "minecraft:red_stained_glass_pane",
            15 => "minecraft:black_stained_glass_pane",
            _ => "minecraft:white_stained_glass_pane",
        }
        .into(),
        161 => match meta & 3 {
            1 => "minecraft:acacia_leaves",
            _ => "minecraft:dark_oak_leaves",
        }
        .into(),
        162 => match meta & 3 {
            1 => "minecraft:acacia_log",
            _ => "minecraft:dark_oak_log",
        }
        .into(),
        163 => "minecraft:acacia_stairs".into(),
        164 => "minecraft:dark_oak_stairs".into(),
        170 => "minecraft:hay_block".into(),
        171 => match meta {
            0 => "minecraft:white_carpet",
            1 => "minecraft:orange_carpet",
            2 => "minecraft:magenta_carpet",
            3 => "minecraft:light_blue_carpet",
            4 => "minecraft:yellow_carpet",
            5 => "minecraft:lime_carpet",
            6 => "minecraft:pink_carpet",
            7 => "minecraft:gray_carpet",
            8 => "minecraft:light_gray_carpet",
            9 => "minecraft:cyan_carpet",
            10 => "minecraft:purple_carpet",
            11 => "minecraft:blue_carpet",
            12 => "minecraft:brown_carpet",
            13 => "minecraft:green_carpet",
            14 => "minecraft:red_carpet",
            15 => "minecraft:black_carpet",
            _ => "minecraft:white_carpet",
        }
        .into(),
        172 => match meta {
            0 => "minecraft:white_concrete",
            1 => "minecraft:orange_concrete",
            2 => "minecraft:magenta_concrete",
            3 => "minecraft:light_blue_concrete",
            4 => "minecraft:yellow_concrete",
            5 => "minecraft:lime_concrete",
            6 => "minecraft:pink_concrete",
            7 => "minecraft:gray_concrete",
            8 => "minecraft:light_gray_concrete",
            9 => "minecraft:cyan_concrete",
            10 => "minecraft:purple_concrete",
            11 => "minecraft:blue_concrete",
            12 => "minecraft:brown_concrete",
            13 => "minecraft:green_concrete",
            14 => "minecraft:red_concrete",
            15 => "minecraft:black_concrete",
            _ => "minecraft:white_concrete",
        }
        .into(),
        173 => "minecraft:coal_block".into(),
        95 => match meta {
            0 => "minecraft:white_stained_glass",
            1 => "minecraft:orange_stained_glass",
            2 => "minecraft:magenta_stained_glass",
            3 => "minecraft:light_blue_stained_glass",
            4 => "minecraft:yellow_stained_glass",
            5 => "minecraft:lime_stained_glass",
            6 => "minecraft:pink_stained_glass",
            7 => "minecraft:gray_stained_glass",
            8 => "minecraft:light_gray_stained_glass",
            9 => "minecraft:cyan_stained_glass",
            10 => "minecraft:purple_stained_glass",
            11 => "minecraft:blue_stained_glass",
            12 => "minecraft:brown_stained_glass",
            13 => "minecraft:green_stained_glass",
            14 => "minecraft:red_stained_glass",
            15 => "minecraft:black_stained_glass",
            _ => "minecraft:white_stained_glass",
        }
        .into(),
        _ => "minecraft:air".into(),
    }
}

fn get_contextual_properties(block_id: u8, meta: u8) -> Option<String> {
    match block_id {
        63 => Some(format!("rotation={}", meta & 0x0F)),
        68 => Some(format!(
            "facing={}",
            match meta {
                2 => "north",
                3 => "south",
                4 => "west",
                _ => "east",
            }
        )),
        50 | 75 | 76 => {
            if meta >= 1 && meta <= 4 {
                Some(format!(
                    "facing={}",
                    match meta {
                        1 => "east",
                        2 => "west",
                        3 => "south",
                        _ => "north",
                    }
                ))
            } else {
                None
            }
        }
        _ => None,
    }
}

fn is_stair_legacy(id: u8) -> bool {
    matches!(
        id,
        53 | 67 | 108 | 109 | 114 | 128 | 134 | 135 | 136 | 156 | 163 | 164 | 180
    )
}

fn get_stair_facing(meta: u8) -> &'static str {
    match meta & 0x3 {
        0 => "east",
        1 => "west",
        2 => "south",
        3 => "north",
        _ => "north",
    }
}

fn get_relative_side(current_facing: &str, neighbor_facing: &str) -> Option<&'static str> {
    match current_facing {
        "north" => {
            if neighbor_facing == "west" {
                return Some("left");
            }
            if neighbor_facing == "east" {
                return Some("right");
            }
        }
        "south" => {
            if neighbor_facing == "east" {
                return Some("left");
            }
            if neighbor_facing == "west" {
                return Some("right");
            }
        }
        "west" => {
            if neighbor_facing == "south" {
                return Some("left");
            }
            if neighbor_facing == "north" {
                return Some("right");
            }
        }
        "east" => {
            if neighbor_facing == "north" {
                return Some("left");
            }
            if neighbor_facing == "south" {
                return Some("right");
            }
        }
        _ => {}
    }
    None
}

fn is_fence_legacy(id: u8) -> bool {
    matches!(id, 85 | 113 | 188 | 189 | 190 | 191 | 192)
}

fn is_fence_gate_legacy(id: u8) -> bool {
    matches!(id, 107 | 183 | 184 | 185 | 186 | 187)
}

fn is_pane_legacy(id: u8) -> bool {
    matches!(id, 101 | 102 | 160)
}

fn is_glass_legacy(id: u8) -> bool {
    matches!(id, 20 | 95)
}

fn is_likely_solid_attachment(id: u8) -> bool {
    if id == 0 {
        return false;
    }
    if id >= 8 && id <= 11 {
        return false;
    }
    !matches!(
        id,
        6 | 27 | 28 | 30 | 31 | 32 | 37 | 38 | 39 | 40 | 50 | 51 | 55 | 59 | 63 | 65 | 66
            | 68 | 69 | 70 | 71 | 72 | 75 | 76 | 77 | 78 | 83 | 90 | 92 | 93 | 94 | 96 | 101
            | 102 | 104 | 105 | 106 | 107 | 111 | 115 | 119 | 127 | 131 | 132 | 141 | 142 | 143
            | 147 | 148 | 149 | 150 | 157 | 160 | 171 | 175
    )
}
