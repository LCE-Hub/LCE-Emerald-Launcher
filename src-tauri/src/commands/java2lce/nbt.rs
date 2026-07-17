use std::io::{Read, Write};
use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;
#[derive(Debug, Clone, PartialEq)]
pub enum NbtValue {
    Byte(i8),
    Short(i16),
    Int(i32),
    Long(i64),
    Float(f32),
    Double(f64),
    ByteArray(Vec<u8>),
    String(String),
    List(Vec<NbtValue>),
    Compound(NbtCompound),
    IntArray(Vec<i32>),
    LongArray(Vec<i64>),
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct NbtCompound {
    pub name: String,
    pub tags: Vec<(String, NbtValue)>,
}

impl NbtCompound {
    pub fn new(name: &str) -> Self {
        Self {
            name: name.to_string(),
            tags: Vec::new(),
        }
    }

    pub fn insert(&mut self, name: &str, value: NbtValue) {
        self.tags.retain(|(n, _)| n != name);
        self.tags.push((name.to_string(), value));
    }

    pub fn get(&self, name: &str) -> Option<&NbtValue> {
        self.tags.iter().find(|(n, _)| n == name).map(|(_, v)| v)
    }

    pub fn get_mut(&mut self, name: &str) -> Option<&mut NbtValue> {
        self.tags.iter_mut().find(|(n, _)| n == name).map(|(_, v)| v)
    }

    pub fn contains(&self, name: &str) -> bool {
        self.tags.iter().any(|(n, _)| n == name)
    }

    pub fn remove(&mut self, name: &str) {
        self.tags.retain(|(n, _)| n != name);
    }

    pub fn compound(&self, name: &str) -> Option<&NbtCompound> {
        self.get(name).and_then(|v| match v {
            NbtValue::Compound(c) => Some(c),
            _ => None,
        })
    }

    pub fn compound_mut(&mut self, name: &str) -> Option<&mut NbtCompound> {
        self.get_mut(name).and_then(|v| match v {
            NbtValue::Compound(c) => Some(c),
            _ => None,
        })
    }

    pub fn byte(&self, name: &str) -> Option<i8> {
        self.get(name).and_then(|v| match v {
            NbtValue::Byte(b) => Some(*b),
            _ => None,
        })
    }

    pub fn short(&self, name: &str) -> Option<i16> {
        self.get(name).and_then(|v| match v {
            NbtValue::Short(s) => Some(*s),
            _ => None,
        })
    }

    pub fn int(&self, name: &str) -> Option<i32> {
        self.get(name).and_then(|v| match v {
            NbtValue::Int(i) => Some(*i),
            _ => None,
        })
    }

    pub fn long(&self, name: &str) -> Option<i64> {
        self.get(name).and_then(|v| match v {
            NbtValue::Long(l) => Some(*l),
            _ => None,
        })
    }

    pub fn float(&self, name: &str) -> Option<f32> {
        self.get(name).and_then(|v| match v {
            NbtValue::Float(f) => Some(*f),
            _ => None,
        })
    }

    pub fn double(&self, name: &str) -> Option<f64> {
        self.get(name).and_then(|v| match v {
            NbtValue::Double(d) => Some(*d),
            _ => None,
        })
    }

    pub fn string(&self, name: &str) -> Option<&str> {
        self.get(name).and_then(|v| match v {
            NbtValue::String(s) => Some(s.as_str()),
            _ => None,
        })
    }

    pub fn byte_array(&self, name: &str) -> Option<&[u8]> {
        self.get(name).and_then(|v| match v {
            NbtValue::ByteArray(b) => Some(b.as_slice()),
            _ => None,
        })
    }

    pub fn int_array(&self, name: &str) -> Option<&[i32]> {
        self.get(name).and_then(|v| match v {
            NbtValue::IntArray(a) => Some(a.as_slice()),
            _ => None,
        })
    }

    pub fn long_array(&self, name: &str) -> Option<&[i64]> {
        self.get(name).and_then(|v| match v {
            NbtValue::LongArray(a) => Some(a.as_slice()),
            _ => None,
        })
    }

    pub fn list(&self, name: &str) -> Option<&[NbtValue]> {
        self.get(name).and_then(|v| match v {
            NbtValue::List(l) => Some(l.as_slice()),
            _ => None,
        })
    }

    pub fn list_compounds(&self, name: &str) -> Vec<&NbtCompound> {
        self.list(name)
            .unwrap_or(&[])
            .iter()
            .filter_map(|v| match v {
                NbtValue::Compound(c) => Some(c),
                _ => None,
            })
            .collect()
    }
}

fn tag_type_id(v: &NbtValue) -> u8 {
    match v {
        NbtValue::Byte(_) => 1,
        NbtValue::Short(_) => 2,
        NbtValue::Int(_) => 3,
        NbtValue::Long(_) => 4,
        NbtValue::Float(_) => 5,
        NbtValue::Double(_) => 6,
        NbtValue::ByteArray(_) => 7,
        NbtValue::String(_) => 8,
        NbtValue::List(_) => 9,
        NbtValue::Compound(_) => 10,
        NbtValue::IntArray(_) => 11,
        NbtValue::LongArray(_) => 12,
    }
}

fn read_be_i16(data: &[u8], off: usize) -> i16 {
    i16::from_be_bytes([data[off], data[off + 1]])
}

fn read_be_i32(data: &[u8], off: usize) -> i32 {
    i32::from_be_bytes([data[off], data[off + 1], data[off + 2], data[off + 3]])
}

fn read_be_i64(data: &[u8], off: usize) -> i64 {
    i64::from_be_bytes([
        data[off],
        data[off + 1],
        data[off + 2],
        data[off + 3],
        data[off + 4],
        data[off + 5],
        data[off + 6],
        data[off + 7],
    ])
}

fn read_be_f32(data: &[u8], off: usize) -> f32 {
    f32::from_be_bytes([data[off], data[off + 1], data[off + 2], data[off + 3]])
}

fn read_be_f64(data: &[u8], off: usize) -> f64 {
    f64::from_be_bytes([
        data[off],
        data[off + 1],
        data[off + 2],
        data[off + 3],
        data[off + 4],
        data[off + 5],
        data[off + 6],
        data[off + 7],
    ])
}

fn read_string(data: &[u8], off: usize) -> Result<(String, usize), String> {
    let len = read_be_i16(data, off) as usize;
    let start = off + 2;
    if start + len > data.len() {
        return Err("string extends past end of data".into());
    }
    let s = String::from_utf8_lossy(&data[start..start + len]).to_string();
    Ok((s, start + len))
}

pub fn read_nbt(data: &[u8]) -> Result<NbtCompound, String> {
    if data.is_empty() {
        return Err("empty NBT data".into());
    }
    let mut pos = 0;
    let tag_type = data[pos];
    pos += 1;
    if tag_type != 10 {
        return Err(format!("root tag is not compound (type={})", tag_type));
    }
    let (name, new_pos) = read_string(data, pos)?;
    pos = new_pos;
    let (compound, _new_pos) = read_compound_payload(data, pos)?;
    let mut result = compound;
    result.name = name;
    Ok(result)
}

fn read_compound_payload(data: &[u8], mut pos: usize) -> Result<(NbtCompound, usize), String> {
    let mut compound = NbtCompound::default();
    loop {
        if pos >= data.len() {
            return Err("unexpected end in compound".into());
        }
        let tag_type = data[pos];
        pos += 1;
        if tag_type == 0 {
            break;
        }
        let (name, new_pos) = read_string(data, pos)?;
        pos = new_pos;
        let (value, new_pos) = read_value(data, pos, tag_type)?;
        pos = new_pos;
        compound.tags.push((name, value));
    }
    Ok((compound, pos))
}

fn read_value(data: &[u8], pos: usize, tag_type: u8) -> Result<(NbtValue, usize), String> {
    match tag_type {
        1 => Ok((NbtValue::Byte(data[pos] as i8), pos + 1)),
        2 => Ok((NbtValue::Short(read_be_i16(data, pos)), pos + 2)),
        3 => Ok((NbtValue::Int(read_be_i32(data, pos)), pos + 4)),
        4 => Ok((NbtValue::Long(read_be_i64(data, pos)), pos + 8)),
        5 => Ok((NbtValue::Float(read_be_f32(data, pos)), pos + 4)),
        6 => Ok((NbtValue::Double(read_be_f64(data, pos)), pos + 8)),
        7 => {
            let len = read_be_i32(data, pos) as usize;
            let start = pos + 4;
            if start + len > data.len() {
                return Err("byte array extends past end".into());
            }
            Ok((NbtValue::ByteArray(data[start..start + len].to_vec()), start + len))
        }
        8 => {
            let (s, new_pos) = read_string(data, pos)?;
            Ok((NbtValue::String(s), new_pos))
        }
        9 => {
            let elem_type = data[pos];
            let count = read_be_i32(data, pos + 1) as usize;
            let mut list_pos = pos + 5;
            let mut list = Vec::with_capacity(count);
            for _ in 0..count {
                let (val, new_pos) = read_value(data, list_pos, elem_type)?;
                list_pos = new_pos;
                list.push(val);
            }
            Ok((NbtValue::List(list), list_pos))
        }
        10 => {
            let (compound, new_pos) = read_compound_payload(data, pos)?;
            Ok((NbtValue::Compound(compound), new_pos))
        }
        11 => {
            let len = read_be_i32(data, pos) as usize;
            let start = pos + 4;
            let mut arr = Vec::with_capacity(len);
            for i in 0..len {
                let off = start + i * 4;
                if off + 4 > data.len() {
                    return Err("int array extends past end".into());
                }
                arr.push(read_be_i32(data, off));
            }
            Ok((NbtValue::IntArray(arr), start + len * 4))
        }
        12 => {
            let len = read_be_i32(data, pos) as usize;
            let start = pos + 4;
            let mut arr = Vec::with_capacity(len);
            for i in 0..len {
                let off = start + i * 8;
                if off + 8 > data.len() {
                    return Err("long array extends past end".into());
                }
                arr.push(read_be_i64(data, off));
            }
            Ok((NbtValue::LongArray(arr), start + len * 8))
        }
        _ => Err(format!("unknown NBT tag type: {}", tag_type)),
    }
}

pub fn write_nbt(compound: &NbtCompound) -> Vec<u8> {
    let mut out = Vec::new();
    out.push(10);
    write_string(&mut out, &compound.name);
    write_compound_payload(&mut out, compound);
    out.push(0);
    out
}

fn write_string(out: &mut Vec<u8>, s: &str) {
    let bytes = s.as_bytes();
    let len = (bytes.len() as i16).to_be_bytes();
    out.extend_from_slice(&len);
    out.extend_from_slice(bytes);
}

fn write_compound_payload(out: &mut Vec<u8>, compound: &NbtCompound) {
    for (name, value) in &compound.tags {
        out.push(tag_type_id(value));
        write_string(out, name);
        write_value(out, value);
    }
}

fn write_value(out: &mut Vec<u8>, value: &NbtValue) {
    match value {
        NbtValue::Byte(b) => out.push(*b as u8),
        NbtValue::Short(s) => out.extend_from_slice(&s.to_be_bytes()),
        NbtValue::Int(i) => out.extend_from_slice(&i.to_be_bytes()),
        NbtValue::Long(l) => out.extend_from_slice(&l.to_be_bytes()),
        NbtValue::Float(f) => out.extend_from_slice(&f.to_be_bytes()),
        NbtValue::Double(d) => out.extend_from_slice(&d.to_be_bytes()),
        NbtValue::ByteArray(arr) => {
            out.extend_from_slice(&(arr.len() as i32).to_be_bytes());
            out.extend_from_slice(arr);
        }
        NbtValue::String(s) => write_string(out, s),
        NbtValue::List(list) => {
            let elem_type = list.first().map(|v| tag_type_id(v)).unwrap_or(0);
            out.push(elem_type);
            out.extend_from_slice(&(list.len() as i32).to_be_bytes());
            for item in list {
                write_value(out, item);
            }
        }
        NbtValue::Compound(c) => {
            write_compound_payload(out, c);
            out.push(0);
        }
        NbtValue::IntArray(arr) => {
            out.extend_from_slice(&(arr.len() as i32).to_be_bytes());
            for i in arr {
                out.extend_from_slice(&i.to_be_bytes());
            }
        }
        NbtValue::LongArray(arr) => {
            out.extend_from_slice(&(arr.len() as i32).to_be_bytes());
            for l in arr {
                out.extend_from_slice(&l.to_be_bytes());
            }
        }
    }
}

pub fn read_gzip_nbt(data: &[u8]) -> Result<NbtCompound, String> {
    let mut decoder = GzDecoder::new(data);
    let mut buf = Vec::new();
    decoder
        .read_to_end(&mut buf)
        .map_err(|e| format!("gzip decompress failed: {}", e))?;
    read_nbt(&buf)
}

pub fn write_gzip_nbt(compound: &NbtCompound) -> Vec<u8> {
    let raw = write_nbt(compound);
    let mut encoder = GzEncoder::new(Vec::new(), Compression::best());
    encoder.write_all(&raw).unwrap();
    encoder.finish().unwrap()
}

pub fn read_zlib_nbt(data: &[u8]) -> Result<NbtCompound, String> {
    use flate2::read::ZlibDecoder;
    let mut decoder = ZlibDecoder::new(data);
    let mut buf = Vec::new();
    decoder
        .read_to_end(&mut buf)
        .map_err(|e| format!("zlib decompress failed: {}", e))?;
    read_nbt(&buf)
}

pub fn write_zlib_nbt(compound: &NbtCompound) -> Vec<u8> {
    use flate2::write::ZlibEncoder;
    let raw = write_nbt(compound);
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::best());
    encoder.write_all(&raw).unwrap();
    encoder.finish().unwrap()
}

pub fn get_byte_array_or(compound: &NbtCompound, name: &str, default_len: usize) -> Vec<u8> {
    compound
        .byte_array(name)
        .map(|b| {
            let mut v = b.to_vec();
            if v.len() < default_len {
                v.resize(default_len, 0);
            }
            v
        })
        .unwrap_or_else(|| vec![0u8; default_len])
}

pub fn get_int_array_or(compound: &NbtCompound, name: &str, default_len: usize) -> Vec<i32> {
    compound
        .int_array(name)
        .map(|a| {
            let mut v = a.to_vec();
            if v.len() < default_len {
                v.resize(default_len, 0);
            }
            v
        })
        .unwrap_or_else(|| vec![0i32; default_len])
}

pub fn get_long_array_or(compound: &NbtCompound, name: &str, default_len: usize) -> Vec<i64> {
    compound
        .long_array(name)
        .map(|a| {
            let mut v = a.to_vec();
            if v.len() < default_len {
                v.resize(default_len, 0);
            }
            v
        })
        .unwrap_or_else(|| vec![0i64; default_len])
}

pub fn get_nibble(data: &[u8], index: usize) -> u8 {
    let byte_index = index >> 1;
    if byte_index >= data.len() {
        return 0;
    }
    let b = data[byte_index];
    if index & 1 == 0 {
        b & 0x0F
    } else {
        (b >> 4) & 0x0F
    }
}

pub fn set_nibble(data: &mut [u8], index: usize, value: u8) {
    let byte_index = index >> 1;
    if byte_index >= data.len() {
        return;
    }
    let val = value & 0x0F;
    if index & 1 == 0 {
        data[byte_index] = (data[byte_index] & 0xF0) | val;
    } else {
        data[byte_index] = (data[byte_index] & 0x0F) | (val << 4);
    }
}

pub fn clone_or_empty_list(compound: &NbtCompound, name: &str) -> Vec<NbtValue> {
    compound
        .list(name)
        .map(|l| l.to_vec())
        .unwrap_or_default()
}
