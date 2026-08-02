pub mod block_mapping;
pub mod chunk;
pub mod payload;
pub mod level_dat;
pub mod nbt;
pub mod region;
use std::fs;
use std::path::Path;
use tauri::AppHandle;
use std::collections::HashMap;
use region::{JavaWorldReader, JavaRegionFileWriter, LceRegionFile, SaveDataContainer};
use chunk::{convert_chunk, build_modern_anvil_level};
use level_dat::{read_spawn, convert_java_to_lce, convert_lce_to_java};
const DEFAULT_XZ_SIZE: i32 = 54;
fn floor_div(a: i32, b: i32) -> i32 {
    let q = a / b;
    let r = a % b;
    if r != 0 && ((r < 0) != (b < 0)) {
        q - 1
    } else {
        q
    }
}
fn estimate_safe_spawn_y(
    reader: &mut JavaWorldReader,
    spawn_x: i32,
    source_spawn_y: i32,
    spawn_z: i32,
    spawn_chunk_x: i32,
    spawn_chunk_z: i32,
) -> Option<i32> {
    let region_x = floor_div(spawn_chunk_x, 32);
    let region_z = floor_div(spawn_chunk_z, 32);
    let region_path = reader
        .get_region_files("")
        .into_iter()
        .find(|(rx, rz, _)| *rx == region_x && *rz == region_z)
        .map(|(_, _, path)| path)?;

    let local_chunk_x = ((spawn_chunk_x % 32) + 32) % 32;
    let local_chunk_z = ((spawn_chunk_z % 32) + 32) % 32;
    let root = match reader.read_chunk_nbt(&region_path, local_chunk_x, local_chunk_z) {
        Ok(Some(r)) => r,
        _ => return None,
    };

    let level = root.compound("Level").unwrap_or(&root);
    let lx = ((spawn_x % 16) + 16) % 16;
    let lz = ((spawn_z % 16) + 16) % 16;
    let idx2d = (lx + lz * 16) as usize;
    if let Some(hm) = level.byte_array("HeightMap") {
        if hm.len() >= 256 {
            let height = hm[idx2d];
            if height > 0 {
                return Some((height as i32 + 1).clamp(1, 127));
            }
        }
    }

    if let Some(hm) = level.int_array("HeightMap") {
        if hm.len() >= 256 {
            let height = hm[idx2d];
            if height > 0 {
                return Some((height + 1).clamp(1, 127));
            }
        }
    }

    if let Some(blocks) = level.byte_array("Blocks") {
        if blocks.len() >= 32768 {
            for y in (1..=127).rev() {
                let flat_index = (y * 256 + lz * 16 + lx) as usize;
                if blocks[flat_index] != 0 {
                    return Some((y + 1).clamp(1, 127));
                }
            }
        }
    }

    if let Some(sections) = level.list("Sections").or_else(|| level.list("sections")) {
        let mut max_y = -1;
        for tag in sections {
            if let nbt::NbtValue::Compound(section) = tag {
                let section_y = match chunk::read_section_y(section) {
                    Some(y) if (0..=7).contains(&y) => y,
                    _ => continue,
                };
                if let Some(section_blocks) = section.byte_array("Blocks") {
                    if section_blocks.len() >= 4096 {
                        for y in (0..=15).rev() {
                            let index = (lx + lz * 16 + y * 256) as usize;
                            if section_blocks[index] != 0 {
                                let global_y = section_y * 16 + y;
                                if global_y > max_y {
                                    max_y = global_y;
                                }
                                break;
                            }
                        }
                    }
                }
            }
        }
        if max_y >= 0 {
            return Some((max_y + 1).clamp(1, 127));
        }
    }

    Some(source_spawn_y.clamp(1, 127))
}

fn convert_dimension(
    reader: &mut JavaWorldReader,
    container: &mut SaveDataContainer,
    dimension: &str,
    half_size: i32,
    offset_chunk_x: i32,
    offset_chunk_z: i32,
    global_section_shift: &mut Option<i32>,
    errors: &mut Vec<String>,
) -> usize {
    let region_files = reader.get_region_files(dimension);
    let region_lookup: HashMap<(i32, i32), String> = region_files
        .into_iter()
        .map(|(rx, rz, path)| ((rx, rz), path))
        .collect();

    let lce_prefix = match dimension {
        "DIM-1" => "DIM-1",
        "DIM1" => "DIM1/",
        _ => "",
    };

    let mut lce_regions: HashMap<(i32, i32), LceRegionFile> = HashMap::new();
    let mut converted = 0usize;
    for lcx in -half_size..half_size {
        for lcz in -half_size..half_size {
            let jx = lcx + offset_chunk_x;
            let jz = lcz + offset_chunk_z;
            let jrx = floor_div(jx, 32);
            let jrz = floor_div(jz, 32);
            let region_path = match region_lookup.get(&(jrx, jrz)) {
                Some(p) => p,
                None => continue,
            };
            let local_x = ((jx % 32) + 32) % 32;
            let local_z = ((jz % 32) + 32) % 32;
            let root = match reader.read_chunk_nbt(region_path, local_x, local_z) {
                Ok(Some(r)) => r,
                Ok(None) => continue,
                Err(e) => {
                    errors.push(format!("{} ({},{}): {}", dimension, lcx, lcz, e));
                    continue;
                }
            };

            let payload = convert_chunk(&root, lcx, lcz, false, global_section_shift);
            if payload.is_empty() {
                continue;
            }

            let lrx = floor_div(lcx, 32);
            let lrz = floor_div(lcz, 32);
            let lce_local_x = ((lcx % 32) + 32) % 32;
            let lce_local_z = ((lcz % 32) + 32) % 32;
            let region = lce_regions.entry((lrx, lrz)).or_insert_with(|| {
                LceRegionFile::new(&format!("{}r.{}.{}.mcr", lce_prefix, lrx, lrz))
            });
            region.write_chunk(lce_local_x, lce_local_z, payload);
            converted += 1;
        }
    }

    for (_, region) in lce_regions.iter_mut() {
        region.write_to_container(container);
    }

    converted
}
#[tauri::command]
#[allow(non_snake_case)]
pub async fn java_to_lce(
    _app: AppHandle,
    java_world_path: String,
    output_ms_path: String,
) -> Result<String, String> {
    let mut reader = JavaWorldReader::new(&java_world_path);
    let java_root = reader.read_level_dat().map_err(|e| format!("Failed to read level.dat: {}", e))?;
    let spawn = read_spawn(&java_root);
    let spawn_chunk_x = spawn.x >> 4;
    let spawn_chunk_z = spawn.z >> 4;
    let xz_size = DEFAULT_XZ_SIZE;
    let half_size = xz_size / 2;
    let hell_scale = 3;
    let hell_half_size = (xz_size / hell_scale) / 2;
    let end_half_size = 9;
    let mut container = SaveDataContainer::new(7, 9);
    let default_region_order = [
        "DIM-1r.-1.-1.mcr", "DIM-1r.0.-1.mcr", "DIM-1r.0.0.mcr", "DIM-1r.-1.0.mcr",
        "DIM1/r.-1.-1.mcr", "DIM1/r.0.-1.mcr", "DIM1/r.0.0.mcr", "DIM1/r.-1.0.mcr",
        "r.-1.-1.mcr", "r.0.-1.mcr", "r.0.0.mcr", "r.-1.0.mcr",
    ];
    for name in default_region_order {
        container.create_file(name);
    }

    let estimated_spawn_y = estimate_safe_spawn_y(
        &mut reader,
        spawn.x,
        spawn.y,
        spawn.z,
        spawn_chunk_x,
        spawn_chunk_z,
    );

    let mut global_section_shift: Option<i32> = None;
    let mut errors: Vec<String> = Vec::new();
    let ow = convert_dimension(
        &mut reader,
        &mut container,
        "",
        half_size,
        spawn_chunk_x,
        spawn_chunk_z,
        &mut global_section_shift,
        &mut errors,
    );
    let nether = convert_dimension(
        &mut reader,
        &mut container,
        "DIM-1",
        hell_half_size,
        floor_div(spawn_chunk_x, 8),
        floor_div(spawn_chunk_z, 8),
        &mut global_section_shift,
        &mut errors,
    );
    let end = convert_dimension(
        &mut reader,
        &mut container,
        "DIM1",
        end_half_size,
        0,
        0,
        &mut global_section_shift,
        &mut errors,
    );

    let level_dat_bytes = convert_java_to_lce(
        &java_root,
        spawn_chunk_x,
        spawn_chunk_z,
        xz_size,
        false,
        estimated_spawn_y,
    );
    let ld_idx = container.create_file("level.dat");
    container.write_to_file(ld_idx, &level_dat_bytes);
    container.save(&output_ms_path).map_err(|e| format!("Failed to save output: {}", e))?;
    let chunks_written = ow + nether + end;
    let mut msg = format!(
        "Conversion complete!\nChunks: {}\nOverworld: {}\nNether: {}\nEnd: {}",
        chunks_written, ow, nether, end
    );
    if !errors.is_empty() {
        msg.push_str(&format!("\nErrors: {}", errors.len()));
        for err in errors.iter().take(5) {
            msg.push_str(&format!("\n  {}", err));
        }
        if errors.len() > 5 {
            msg.push_str(&format!("\n  ... and {} more", errors.len() - 5));
        }
    }
    eprintln!("{}",msg);
    Ok(msg)
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn lce_to_java(
    _app: AppHandle,
    input_ms_path: String,
    java_world_output: String,
) -> Result<String, String> {
    let ms_data = fs::read(&input_ms_path).map_err(|e| format!("Failed to read saveData.ms: {}", e))?;
    let decompressed = region::decompress_zlib(&ms_data[8..]).map_err(|e| format!("Failed to decompress save data: {}", e))?;
    let footer_offset = u32::from_le_bytes([
        decompressed[0], decompressed[1], decompressed[2], decompressed[3],
    ]) as usize;
    let entry_count = u32::from_le_bytes([
        decompressed[4], decompressed[5], decompressed[6], decompressed[7],
    ]) as usize;
    let mut files: Vec<(String, Vec<u8>)> = Vec::new();
    for i in 0..entry_count {
        let base = footer_offset + i * 144;
        if base + 144 > decompressed.len() {
            break;
        }

        let name_bytes = &decompressed[base..base + 128];
        let name: String = name_bytes
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .take_while(|&c| c != 0)
            .filter_map(|c| char::from_u32(c as u32))
            .collect();

        let length = u32::from_le_bytes([
            decompressed[base + 128],
            decompressed[base + 129],
            decompressed[base + 130],
            decompressed[base + 131],
        ]) as usize;
        let start_offset = u32::from_le_bytes([
            decompressed[base + 132],
            decompressed[base + 133],
            decompressed[base + 134],
            decompressed[base + 135],
        ]) as usize;
        if !name.is_empty() && length > 0 && start_offset + length <= decompressed.len() {
            let data = decompressed[start_offset..start_offset + length].to_vec();
            files.push((name, data));
        }
    }

    let out_dir = Path::new(&java_world_output);
    fs::create_dir_all(out_dir).map_err(|e| format!("Failed to create output directory: {}", e))?;
    fs::create_dir_all(out_dir.join("region")).map_err(|e| format!("Failed to create region directory: {}", e))?;
    let mut chunks_written: usize = 0;
    let mut errors: Vec<String> = Vec::new();
    let mut region_writers: HashMap<String, JavaRegionFileWriter> = HashMap::new();
    for (name, data) in &files {
        if name == "level.dat" {
            let lce_root = nbt::read_nbt(data).map_err(|e| format!("Failed to parse level.dat: {}", e))?;
            let java_level_bytes = convert_lce_to_java(&lce_root, None, None, None, None);
            fs::write(out_dir.join("level.dat"), &java_level_bytes).map_err(|e| format!("Failed to write level.dat: {}", e))?;
            continue;
        }

        if name.ends_with(".mcr") || name.ends_with(".mca") {
            let mut reader = region::JavaRegionReader::open_from_bytes(data);
            let parts: Vec<&str> = name.split('.').collect();
            let region_x: i32 = if parts.len() >= 4 { parts[1].parse().unwrap_or(0) } else { 0 };
            let region_z: i32 = if parts.len() >= 4 { parts[2].parse().unwrap_or(0) } else { 0 };
            for local_z in 0..32 {
                for local_x in 0..32 {
                    let index = (local_x & 31) + (local_z & 31) * 32;
                    if reader.offsets[index as usize] == 0 {
                        continue;
                    }

                    match reader.read_chunk(local_x, local_z) {
                        Ok(Some(lce_chunk_data)) => {
                            if let Some(legacy_nbt) = payload::try_decode_to_legacy_nbt(&lce_chunk_data) {
                                let root = nbt::read_nbt(&legacy_nbt).unwrap_or_default();
                                let source_level = root.compound("Level").unwrap_or(&root);
                                let cx = region_x * 32 + local_x;
                                let cz = region_z * 32 + local_z;
                                let modern_root = build_modern_anvil_level(source_level, cx, cz);
                                let modern_nbt = nbt::write_nbt(&modern_root);
                                let out_region_x = cx >> 5;
                                let out_region_z = cz >> 5;
                                let out_local_x = cx & 31;
                                let out_local_z = cz & 31;
                                let section_region = format!("r.{}.{}.mca", out_region_x, out_region_z);
                                let region_path = out_dir.join("region").join(&section_region);
                                let region_path_str = region_path.to_string_lossy().to_string();
                                let writer = region_writers.entry(section_region.clone()).or_insert_with(|| {
                                    JavaRegionFileWriter::load_from_file(&region_path_str)
                                });
                                writer.write_chunk(out_local_x, out_local_z, &modern_nbt);
                                chunks_written += 1;
                            }
                        }
                        Ok(None) => {}
                        Err(e) => {
                            errors.push(format!("{}/{}: {}", name, local_x * 32 + local_z, e));
                        }
                    }
                }
            }
            continue;
        }
    }

    for (region_name, writer) in &mut region_writers {
        if let Err(e) = writer.save() {
            errors.push(format!("Failed to save region {}: {}", region_name, e));
        }
    }

    let mut msg = format!(
        "Conversion complete!\nChunks: {}\nFiles: {}",
        chunks_written, files.len()
    );
    if !errors.is_empty() {
        msg.push_str(&format!("\nErrors: {}", errors.len()));
        for err in errors.iter().take(5) {
            msg.push_str(&format!("\n  {}", err));
        }
    }
    eprintln!("{}", msg);
    Ok(msg)
}
