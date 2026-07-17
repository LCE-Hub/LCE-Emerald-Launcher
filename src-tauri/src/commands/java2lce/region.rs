use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::Path;
use flate2::read::ZlibDecoder;
use flate2::write::ZlibEncoder;
use flate2::Compression;
use super::nbt::{self, NbtCompound, NbtValue};
const SECTOR_BYTES: usize = 4096;
pub struct JavaWorldReader {
    world_path: String,
    region_readers: HashMap<String, JavaRegionReader>,
}

pub struct JavaRegionReader {
    pub data: Vec<u8>,
    pub offsets: [u32; 1024],
}

impl JavaWorldReader {
    pub fn new(world_path: &str) -> Self {
        Self {
            world_path: world_path.to_string(),
            region_readers: HashMap::new(),
        }
    }

    pub fn read_level_dat(&self) -> Result<NbtCompound, String> {
        let path = Path::new(&self.world_path).join("level.dat");
        let data = fs::read(&path).map_err(|e| format!("Failed to read level.dat: {}", e))?;
        nbt::read_gzip_nbt(&data)
    }

    pub fn get_region_dir(&self, dimension: &str) -> String {
        if dimension.is_empty() {
            Path::new(&self.world_path)
                .join("region")
                .to_string_lossy()
                .to_string()
        } else {
            Path::new(&self.world_path)
                .join(dimension)
                .join("region")
                .to_string_lossy()
                .to_string()
        }
    }

    pub fn get_region_files(&self, dimension: &str) -> Vec<(i32, i32, String)> {
        let mut result = Vec::new();
        let dir = self.get_region_dir(dimension);
        let dir_path = Path::new(&dir);
        if !dir_path.is_dir() {
            return result;
        }

        if let Ok(entries) = fs::read_dir(dir_path) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                let lower = name.to_lowercase();
                if lower.ends_with(".mcr") || lower.ends_with(".mca") {
                    let parts: Vec<&str> = name.split('.').collect();
                    if parts.len() == 4 && parts[0] == "r" {
                        if let (Ok(rx), Ok(rz)) =(parts[1].parse::<i32>(), parts[2].parse::<i32>())
                        {
                            result.push((rx, rz, entry.path().to_string_lossy().to_string()));
                        }
                    }
                }
            }
        }

        result
    }

    pub fn is_anvil_world(&self) -> bool {
        let region_dir = self.get_region_dir("");
        let dir_path = Path::new(&region_dir);
        if !dir_path.is_dir() {
            return false;
        }
        if let Ok(entries) = fs::read_dir(dir_path) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.to_lowercase().ends_with(".mca") {
                    return true;
                }
            }
        }
        false
    }

    fn get_or_create_reader(&mut self, region_path: &str) -> Result<&JavaRegionReader, String> {
        if !self.region_readers.contains_key(region_path) {
            let reader = JavaRegionReader::open(region_path)?;
            self.region_readers.insert(region_path.to_string(), reader);
        }
        Ok(self.region_readers.get(region_path).unwrap())
    }

    pub fn has_chunk(&mut self, region_path: &str, local_x: i32, local_z: i32) -> bool {
        let reader = match self.get_or_create_reader(region_path) {
            Ok(r) => r,
            Err(_) => return false,
        };
        let index = (local_x & 31) + (local_z & 31) * 32;
        reader.offsets[index as usize] != 0
    }

    pub fn read_chunk_nbt(
        &mut self,
        region_path: &str,
        local_x: i32,
        local_z: i32,
    ) -> Result<Option<NbtCompound>, String> {
        let reader = self.get_or_create_reader(region_path)?;
        let index = (local_x & 31) + (local_z & 31) * 32;
        let offset_entry = reader.offsets[index as usize];
        if offset_entry == 0 {
            return Ok(None);
        }

        let sector_offset = (offset_entry >> 8) as usize;
        let chunk_pos = sector_offset * SECTOR_BYTES;
        let data_len = reader.data.len();
        if chunk_pos + 5 > data_len {
            return Ok(None);
        }

        let length = u32::from_be_bytes([
            reader.data[chunk_pos],
            reader.data[chunk_pos + 1],
            reader.data[chunk_pos + 2],
            reader.data[chunk_pos + 3],
        ]) as usize;
        let compression_type = reader.data[chunk_pos + 4];
        if length <= 1 {
            return Ok(None);
        }

        let compressed_length = length - 1;
        if chunk_pos + 5 + compressed_length > data_len {
            return Ok(None);
        }

        let compressed_data = &reader.data[chunk_pos + 5..chunk_pos + 5 + compressed_length];
        let decompressed = match compression_type {
            1 => {
                let mut decoder = flate2::read::GzDecoder::new(compressed_data);
                let mut buf = Vec::new();
                decoder.read_to_end(&mut buf).map_err(|e| format!("gzip decompress failed: {}", e))?;
                buf
            }
            2 => {
                let mut decoder = ZlibDecoder::new(compressed_data);
                let mut buf = Vec::new();
                decoder
                    .read_to_end(&mut buf)
                    .map_err(|e| format!("zlib decompress failed: {}", e))?;
                buf
            }
            _ => return Ok(None),
        };

        if decompressed.is_empty() {
            return Ok(None);
        }

        let compound = nbt::read_nbt(&decompressed)?;
        Ok(Some(compound))
    }
}

impl JavaRegionReader {
    fn open(path: &str) -> Result<Self, String> {
        let data = fs::read(path).map_err(|e| format!("Failed to read region file: {}", e))?;
        let mut offsets = [0u32; 1024];
        for i in 0..1024 {
            let off = i * 4;
            if off + 4 > data.len() {
                break;
            }
            offsets[i] = u32::from_be_bytes([data[off], data[off + 1], data[off + 2], data[off + 3]]);
        }

        Ok(Self { data, offsets })
    }

    pub fn open_from_bytes(data: &[u8]) -> Self {
        let data = data.to_vec();
        let mut offsets = [0u32; 1024];
        for i in 0..1024 {
            let off = i * 4;
            if off + 4 > data.len() {
                break;
            }
            offsets[i] = u32::from_be_bytes([data[off], data[off + 1], data[off + 2], data[off + 3]]);
        }

        Self { data, offsets }
    }

    pub fn read_chunk(
        &mut self,
        local_x: i32,
        local_z: i32,
    ) -> Result<Option<Vec<u8>>, String> {
        let index = (local_x & 31) + (local_z & 31) * 32;
        let offset_entry = self.offsets[index as usize];
        if offset_entry == 0 {
            return Ok(None);
        }

        let sector_offset = (offset_entry >> 8) as usize;
        let chunk_pos = sector_offset * SECTOR_BYTES;
        let data_len = self.data.len();
        if chunk_pos + 5 > data_len {
            return Ok(None);
        }

        let length = u32::from_be_bytes([
            self.data[chunk_pos],
            self.data[chunk_pos + 1],
            self.data[chunk_pos + 2],
            self.data[chunk_pos + 3],
        ]) as usize;
        let compression_type = self.data[chunk_pos + 4];
        if length <= 1 {
            return Ok(None);
        }

        let compressed_length = length - 1;
        if chunk_pos + 5 + compressed_length > data_len {
            return Ok(None);
        }

        let compressed_data = &self.data[chunk_pos + 5..chunk_pos + 5 + compressed_length];
        let decompressed = match compression_type {
            1 => {
                let mut decoder = flate2::read::GzDecoder::new(compressed_data);
                let mut buf = Vec::new();
                decoder
                    .read_to_end(&mut buf)
                    .map_err(|e| format!("gzip decompress failed: {}", e))?;
                buf
            }
            2 => {
                let mut decoder = ZlibDecoder::new(compressed_data);
                let mut buf = Vec::new();
                decoder
                    .read_to_end(&mut buf)
                    .map_err(|e| format!("zlib decompress failed: {}", e))?;
                buf
            }
            _ => return Ok(None),
        };

        if decompressed.is_empty() {
            return Ok(None);
        }

        Ok(Some(decompressed))
    }
}

pub struct JavaRegionFileWriter {
    path: String,
    buffer: Vec<u8>,
    offsets: [i32; 1024],
    timestamps: [i32; 1024],
    next_sector: usize,
}

impl JavaRegionFileWriter {
    pub fn new(path: &str) -> Self {
        let buffer = vec![0u8; SECTOR_BYTES * 2];
        let offsets = [0i32; 1024];
        let timestamps = [0i32; 1024];
        Self {
            path: path.to_string(),
            buffer,
            offsets,
            timestamps,
            next_sector: 2,
        }
    }

    pub fn load_from_file(path: &str) -> Self {
        if let Ok(data) = fs::read(path) {
            let buffer = data.clone();
            let mut offsets = [0i32; 1024];
            let mut timestamps = [0i32; 1024];
            for i in 0..1024 {
                let pos = i * 4;
                if pos + 4 <= data.len() {
                    offsets[i] = i32::from_be_bytes([data[pos], data[pos + 1], data[pos + 2], data[pos + 3]]);
                }
            }

            for i in 0..1024 {
                let pos = SECTOR_BYTES + i * 4;
                if pos + 4 <= data.len() {
                    timestamps[i] = i32::from_be_bytes([data[pos], data[pos + 1], data[pos + 2], data[pos + 3]]);
                }
            }

            let mut max_sector = 2;
            for &off in &offsets {
                if off != 0 {
                    let sector = (off >> 8) as usize;
                    let count = (off & 0xFF) as usize;
                    let end = sector + count;
                    if end > max_sector {
                        max_sector = end;
                    }
                }
            }

            Self {
                path: path.to_string(),
                buffer,
                offsets,
                timestamps,
                next_sector: max_sector,
            }
        } else {
            Self::new(path)
        }
    }

    pub fn write_chunk(&mut self, local_x: i32, local_z: i32, uncompressed_nbt: &[u8]) {
        if local_x < 0 || local_x > 31 || local_z < 0 || local_z > 31 {
            return;
        }

        let compressed = compress_zlib(uncompressed_nbt);
        let payload_length = 1 + compressed.len();
        let total_length = 4 + payload_length;
        let sectors_needed = (total_length + SECTOR_BYTES - 1) / SECTOR_BYTES;
        if sectors_needed >= 256 {
            return;
        }

        let sector_start = self.next_sector;
        self.next_sector += sectors_needed;
        while self.buffer.len() < (sector_start + sectors_needed) * SECTOR_BYTES {
            self.buffer.extend(std::iter::repeat(0u8).take(SECTOR_BYTES));
        }

        let write_pos = sector_start * SECTOR_BYTES;
        self.buffer[write_pos..write_pos + 4]
            .copy_from_slice(&(payload_length as u32).to_be_bytes());
        self.buffer[write_pos + 4] = 2;
        self.buffer[write_pos + 5..write_pos + 5 + compressed.len()]
            .copy_from_slice(&compressed);

        let padding = sectors_needed * SECTOR_BYTES - total_length;
        if padding > 0 {
            for i in 0..padding {
                self.buffer[write_pos + total_length + i] = 0;
            }
        }

        let offset_index = (local_x & 31) + (local_z & 31) * 32;
        self.offsets[offset_index as usize] = ((sector_start as i32) << 8) | (sectors_needed as i32);
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i32;
        self.timestamps[offset_index as usize] = now;
    }

    pub fn save(&mut self) -> Result<(), String> {
        while self.buffer.len() < self.next_sector * SECTOR_BYTES {
            self.buffer.extend(std::iter::repeat(0u8).take(SECTOR_BYTES));
        }

        for i in 0..1024 {
            let pos = i * 4;
            self.buffer[pos..pos + 4].copy_from_slice(&(self.offsets[i] as u32).to_be_bytes());
        }

        for i in 0..1024 {
            let pos = SECTOR_BYTES + i * 4;
            self.buffer[pos..pos + 4]
                .copy_from_slice(&(self.timestamps[i] as u32).to_be_bytes());
        }

        let total = self.next_sector * SECTOR_BYTES;
        let data = &self.buffer[..total];
        if let Some(parent) = Path::new(&self.path).parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create region directory: {}", e))?;
        }

        fs::write(&self.path, data)
            .map_err(|e| format!("Failed to write region file: {}", e))?;
        Ok(())
    }
}

pub struct LceRegionFile {
    filename: String,
    data: Vec<u8>,
    offsets: [i32; 1024],
    timestamps: [i32; 1024],
    region_x: i32,
    region_z: i32,
    sector_count: usize,
}

impl LceRegionFile {
    pub fn new(filename: &str) -> Self {
        let (region_x, region_z) = parse_region_coordinates(filename);
        let data = vec![0u8; SECTOR_BYTES * 2];
        Self {
            filename: filename.to_string(),
            data,
            offsets: [0i32; 1024],
            timestamps: [0i32; 1024],
            region_x,
            region_z,
            sector_count: 2,
        }
    }

    pub fn write_chunk(&mut self, x: i32, z: i32, mut uncompressed_data: Vec<u8>) {
        if x < 0 || x >= 32 || z < 0 || z >= 32 {
            return;
        }
        if uncompressed_data.is_empty() {
            return;
        }

        uncompressed_data = force_chunk_coordinates(
            &uncompressed_data,
            self.region_x * 32 + x,
            self.region_z * 32 + z,
        );
        if uncompressed_data.is_empty() {
            return;
        }

        let compressed = compress_zlib_only(&uncompressed_data);
        let total_size = 8 + compressed.len();
        let sectors_needed = (total_size + SECTOR_BYTES - 1) / SECTOR_BYTES;
        if sectors_needed >= 256 {
            return;
        }

        let sector_number = self.sector_count;
        self.sector_count += sectors_needed;
        while self.data.len() < (sector_number + sectors_needed) * SECTOR_BYTES {
            self.data.extend(std::iter::repeat(0u8).take(SECTOR_BYTES));
        }

        let write_pos = sector_number * SECTOR_BYTES;
        let stored_length = compressed.len() as u32;
        self.data[write_pos..write_pos + 4]
            .copy_from_slice(&stored_length.to_le_bytes());
        self.data[write_pos + 4..write_pos + 8]
            .copy_from_slice(&(uncompressed_data.len() as u32).to_le_bytes());
        self.data[write_pos + 8..write_pos + 8 + compressed.len()]
            .copy_from_slice(&compressed);

        let padding = sectors_needed * SECTOR_BYTES - total_size;
        if padding > 0 {
            for i in 0..padding {
                self.data[write_pos + total_size + i] = 0;
            }
        }

        let offset_index = (x + z * 32) as usize;
        self.offsets[offset_index] = ((sector_number as i32) << 8) | (sectors_needed as i32);
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i32;
        self.timestamps[offset_index] = now;
    }

    pub fn write_to_container(&mut self, container: &mut SaveDataContainer) {
        let _sorted_entries: Vec<(usize, i32, i32)> = (0..1024)
            .map(|i| (i, self.offsets[i], self.timestamps[i]))
            .filter(|(_, off, _)| *off != 0)
            .collect();

        for i in 0..1024 {
            let pos = i * 4;
            self.data[pos..pos + 4].copy_from_slice(&(self.offsets[i] as u32).to_le_bytes());
        }

        for i in 0..1024 {
            let pos = SECTOR_BYTES + i * 4;
            self.data[pos..pos + 4]
                .copy_from_slice(&(self.timestamps[i] as u32).to_le_bytes());
        }

        let total = self.sector_count * SECTOR_BYTES;
        let region_bytes = self.data[..total].to_vec();
        let entry = container.create_file(&self.filename);
        container.write_to_file(entry, &region_bytes);
    }
}

fn parse_region_coordinates(filename: &str) -> (i32, i32) {
    let name = Path::new(filename)
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let parts: Vec<&str> = name.split('.').collect();
    if parts.len() < 3 {
        return (0, 0);
    }
    let rx = parts[parts.len() - 2].parse().unwrap_or(0);
    let rz = parts[parts.len() - 1].parse().unwrap_or(0);
    (rx, rz)
}

pub fn force_chunk_coordinates(data: &[u8], expected_x: i32, expected_z: i32) -> Vec<u8> {
    if data.is_empty() {
        return Vec::new();
    }

    if let Ok(mut compound) = nbt::read_nbt(data) {
        let has_level = compound.get("Level").is_some();
        if has_level {
            if let Some(nbt::NbtValue::Compound(ref mut c)) = compound.get_mut("Level") {
                c.insert("xPos", NbtValue::Int(expected_x));
                c.insert("zPos", NbtValue::Int(expected_z));
            }
        } else {
            compound.insert("xPos", NbtValue::Int(expected_x));
            compound.insert("zPos", NbtValue::Int(expected_z));
        }

        let mut root = NbtCompound::new("");
        root.insert("Level", NbtValue::Compound(compound));
        nbt::write_nbt(&root)
    } else if data.len() >= 10 {
        let version = i16::from_be_bytes([data[0], data[1]]);
        if version == 8 || version == 9 {
            let mut patched = data.to_vec();
            patched[2..6].copy_from_slice(&expected_x.to_be_bytes());
            patched[6..10].copy_from_slice(&expected_z.to_be_bytes());
            return patched;
        }
        Vec::new()
    } else {
        Vec::new()
    }
}

pub struct SaveDataContainer {
    original_save_version: i16,
    current_save_version: i16,
    entries: Vec<SaveFileEntry>,
    blob: Vec<u8>,
    data_end: usize,
}

pub struct SaveFileEntry {
    pub name: String,
    pub length: u32,
    pub start_offset: u32,
    pub last_mod: i64,
    pub current_pointer: u32,
}

impl SaveDataContainer {
    pub const FILE_ENTRY_SIZE: usize = 144;
    pub fn new(original_save_version: i16, current_save_version: i16) -> Self {
        Self {
            original_save_version,
            current_save_version,
            entries: Vec::new(),
            blob: vec![0u8; 2 * 1024 * 1024],
            data_end: 12,
        }
    }

    pub fn create_file(&mut self, name: &str) -> usize {
        if let Some(idx) = self.entries.iter().position(|e| e.name == name) {
            return idx;
        }
        let entry = SaveFileEntry {
            name: name.to_string(),
            length: 0,
            start_offset: self.data_end as u32,
            last_mod: 0,
            current_pointer: self.data_end as u32,
        };
        self.entries.push(entry);
        self.entries.len() - 1
    }

    pub fn write_to_file(&mut self, index: usize, data: &[u8]) {
        if data.is_empty() {
            return;
        }

        let needs_reinit = self.entries[index].length == 0;
        if needs_reinit {
            self.entries[index].start_offset = self.data_end as u32;
            self.entries[index].current_pointer = self.data_end as u32;
        }

        let write_pos = self.entries[index].current_pointer as usize;
        let end_pos = write_pos + data.len();
        self.ensure_capacity(end_pos);
        self.blob[write_pos..write_pos + data.len()].copy_from_slice(data);
        self.entries[index].current_pointer += data.len() as u32;
        let written = self.entries[index].current_pointer - self.entries[index].start_offset;
        if written > self.entries[index].length {
            self.entries[index].length = written;
        }

        let entry_end = (self.entries[index].start_offset + self.entries[index].length) as usize;
        if entry_end > self.data_end {
            self.data_end = entry_end;
        }

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;
        self.entries[index].last_mod = now;
    }

    pub fn save(&mut self, output_path: &str) -> Result<(), String> {
        self.write_header();
        let total_size = self.data_end + self.entries.len() * Self::FILE_ENTRY_SIZE;
        self.ensure_capacity(total_size);
        self.write_footer();
        let raw_blob = self.blob[..total_size].to_vec();
        let mut encoder = ZlibEncoder::new(Vec::new(), Compression::best());
        encoder
            .write_all(&raw_blob)
            .map_err(|e| format!("zlib compress failed: {}", e))?;
        let compressed_data = encoder
            .finish()
            .map_err(|e| format!("zlib finish failed: {}", e))?;

        if let Some(parent) = Path::new(output_path).parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create output directory: {}", e))?;
        }

        let mut file = fs::File::create(output_path)
            .map_err(|e| format!("Failed to create output file: {}", e))?;
        file.write_all(&(0u32).to_le_bytes())
            .map_err(|e| format!("write failed: {}", e))?;
        file.write_all(&(total_size as u32).to_le_bytes())
            .map_err(|e| format!("write failed: {}", e))?;
        file.write_all(&compressed_data)
            .map_err(|e| format!("write failed: {}", e))?;
        Ok(())
    }

    fn write_header(&mut self) {
        self.blob[0..4]
            .copy_from_slice(&(self.data_end as u32).to_le_bytes());
        self.blob[4..8]
            .copy_from_slice(&(self.entries.len() as u32).to_le_bytes());
        self.blob[8..10]
            .copy_from_slice(&self.original_save_version.to_le_bytes());
        self.blob[10..12]
            .copy_from_slice(&self.current_save_version.to_le_bytes());
    }

    fn write_footer(&mut self) {
        let mut sorted: Vec<usize> = (0..self.entries.len()).collect();
        sorted.sort_by_key(|&i| self.entries[i].start_offset);
        let mut pos = self.data_end;
        for &i in &sorted {
            let entry = &self.entries[i];
            let mut name_bytes = vec![0u8; 128];
            let encoded: Vec<u8> = entry
                .name
                .encode_utf16()
                .flat_map(|c| c.to_le_bytes())
                .collect();
            let copy_len = encoded.len().min(126);
            name_bytes[..copy_len].copy_from_slice(&encoded[..copy_len]);
            self.blob[pos..pos + 128].copy_from_slice(&name_bytes);
            pos += 128;
            self.blob[pos..pos + 4].copy_from_slice(&entry.length.to_le_bytes());
            pos += 4;
            self.blob[pos..pos + 4].copy_from_slice(&entry.start_offset.to_le_bytes());
            pos += 4;
            self.blob[pos..pos + 8].copy_from_slice(&entry.last_mod.to_le_bytes());
            pos += 8;
        }
    }

    fn ensure_capacity(&mut self, required: usize) {
        if required <= self.blob.len() {
            return;
        }
        let mut new_size = self.blob.len();
        while new_size < required {
            new_size *= 2;
        }
        self.blob.resize(new_size, 0);
    }
}

pub fn compress_zlib(data: &[u8]) -> Vec<u8> {
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::best());
    encoder.write_all(data).unwrap();
    encoder.finish().unwrap()
}

pub fn compress_zlib_only(data: &[u8]) -> Vec<u8> {
    compress_zlib(data)
}

pub fn decompress_zlib(data: &[u8]) -> Result<Vec<u8>, String> {
    let mut decoder = ZlibDecoder::new(data);
    let mut buf = Vec::new();
    decoder.read_to_end(&mut buf).map_err(|e| format!("zlib decompress failed: {}", e))?;
    Ok(buf)
}

pub fn decompress_rle_zlib(data: &[u8], decompressed_size: usize) -> Result<Vec<u8>, String> {
    let rle_data = decompress_zlib(data)?;
    Ok(rle_decode(&rle_data, decompressed_size))
}

pub fn rle_encode(data: &[u8]) -> Vec<u8> {
    let mut out = Vec::new();
    let mut i = 0;
    while i < data.len() {
        let current = data[i];
        i += 1;
        let mut count = 1usize;
        while i < data.len() && data[i] == current && count < 256 {
            i += 1;
            count += 1;
        }

        if count <= 3 {
            if current == 0xFF {
                out.push(0xFF);
                out.push((count - 1) as u8);
            } else {
                for _ in 0..count {
                    out.push(current);
                }
            }
        } else {
            out.push(0xFF);
            out.push((count - 1) as u8);
            out.push(current);
        }
    }
    out
}

pub fn rle_decode(data: &[u8], expected_size: usize) -> Vec<u8> {
    let mut output = vec![0u8; expected_size];
    let mut in_pos = 0;
    let mut out_pos = 0;
    while in_pos < data.len() && out_pos < expected_size {
        let current = data[in_pos];
        in_pos += 1;
        if current == 0xFF {
            if in_pos >= data.len() {
                break;
            }
            let count = data[in_pos] as usize;
            in_pos += 1;
            if count < 3 {
                let run = count + 1;
                for _ in 0..run {
                    if out_pos < expected_size {
                        output[out_pos] = 0xFF;
                        out_pos += 1;
                    }
                }
            } else {
                let run = count + 1;
                if in_pos >= data.len() {
                    break;
                }
                let value = data[in_pos];
                in_pos += 1;
                for _ in 0..run {
                    if out_pos < expected_size {
                        output[out_pos] = value;
                        out_pos += 1;
                    }
                }
            }
        } else {
            output[out_pos] = current;
            out_pos += 1;
        }
    }

    output
}
