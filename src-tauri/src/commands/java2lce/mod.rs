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
use chunk::{convert_chunk_for_save, build_modern_anvil_level};
use level_dat::{read_spawn, convert_java_to_lce, convert_lce_to_java};
const REGION_SECT_COUNT: usize = 1024;
#[tauri::command]
#[allow(non_snake_case)]
pub async fn java_to_lce(
    _app: AppHandle,
    java_world_path: String,
    output_ms_path: String,
) -> Result<String, String> {
    let reader = JavaWorldReader::new(&java_world_path);
    let java_root = reader.read_level_dat().map_err(|e| format!("Failed to read level.dat: {}", e))?;
    let spawn = read_spawn(&java_root);
    let spawn_chunk_x = spawn.x >> 4;
    let spawn_chunk_z = spawn.z >> 4;
    let region_files = reader.get_region_files("");
    let total_regions = region_files.len();
    let mut container = SaveDataContainer::new(0, 0);
    let level_dat_bytes = convert_java_to_lce(
        &java_root,
        spawn_chunk_x,
        spawn_chunk_z,
        864,
        false,
        None,
    );
    let ld_idx = container.create_file("level.dat");
    container.write_to_file(ld_idx, &level_dat_bytes);
    let mut java_reader = JavaWorldReader::new(&java_world_path);
    let mut chunks_written: usize = 0;
    let mut errors: Vec<String> = Vec::new();
    for (ri, &(_, _, ref region_path)) in region_files.iter().enumerate() {
        let parts: Vec<&str> = region_path.split('.').collect();
        let region_x: i32 = if parts.len() >= 2 {
            parts[parts.len() - 3].parse().unwrap_or(0)
        } else {
            0
        };
        let region_z: i32 = if parts.len() >= 2 {
            parts[parts.len() - 2].parse().unwrap_or(0)
        } else {
            0
        };

        let region_filename = format!("r.{}.{}.mcr", region_x, region_z);
        let mut lce_region = LceRegionFile::new(&region_filename);
        let mut chunk_count = 0;
        for local_z in 0..32 {
            for local_x in 0..32 {
                if !java_reader.has_chunk(region_path, local_x, local_z) {
                    continue;
                }

                match java_reader.read_chunk_nbt(region_path, local_x, local_z) {
                    Ok(Some(root)) => {
                        let chunk_x = region_x * 32 + local_x;
                        let chunk_z = region_z * 32 + local_z;
                        let payload = convert_chunk_for_save(&root, chunk_x, chunk_z, false);
                        lce_region.write_chunk(local_x, local_z, payload);
                        chunk_count += 1;
                    }
                    Ok(None) => {}
                    Err(e) => {
                        errors.push(format!("r.{}/{}: {}", local_x, local_z, e));
                    }
                }
            }
        }

        if chunk_count > 0 {
            lce_region.write_to_container(&mut container);
            chunks_written += chunk_count;
        }

        if ri % 10 == 0 {
            eprintln!("java2lce: processed region {}/{}", ri + 1, total_regions);
        }
    }

    container.save(&output_ms_path).map_err(|e| format!("Failed to save output: {}", e))?;
    let mut msg = format!(
        "Conversion complete!\nChunks: {}\nRegions: {}",
        chunks_written, total_regions
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
