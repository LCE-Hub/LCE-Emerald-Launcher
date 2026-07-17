use super::nbt::{self, NbtCompound, NbtValue};
pub struct SpawnPoint {
    pub x: i32,
    pub y: i32,
    pub z: i32,
}

pub fn read_spawn(root: &NbtCompound) -> SpawnPoint {
    let data = match root.compound("Data") {
        Some(d) => d,
        None => {
            return SpawnPoint { x: 0, y: 64, z: 0 };
        }
    };

    if let (Some(sx), Some(sz)) = (data.int("SpawnX"), data.int("SpawnZ")) {
        return SpawnPoint {
            x: sx,
            y: data.int("SpawnY").unwrap_or(64),
            z: sz,
        };
    }

    if let Some(spawn_comp) = data.compound("spawn") {
        if let Some(pos) = spawn_comp.int_array("pos") {
            if pos.len() >= 3 {
                return SpawnPoint {
                    x: pos[0],
                    y: pos[1],
                    z: pos[2],
                };
            }
        }
    }

    SpawnPoint { x: 0, y: 64, z: 0 }
}

pub fn convert_java_to_lce(
    java_root: &NbtCompound,
    spawn_chunk_x: i32,
    spawn_chunk_z: i32,
    xz_size: i32,
    flat_world: bool,
    override_spawn_y: Option<i32>,
) -> Vec<u8> {
    let java_data = java_root
        .compound("Data")
        .expect("Java level.dat missing 'Data' compound tag");

    let data_version = java_data
        .int("DataVersion")
        .or_else(|| java_root.int("DataVersion"))
        .unwrap_or(0);
    let is_modern_world = data_version >= 1519;
    let hell_scale: i32 = 3;
    let spawn = read_spawn(java_root);
    let spawn_x = spawn.x;
    let spawn_y = if let Some(oy) = override_spawn_y {
        oy.clamp(1, 127)
    } else if is_modern_world {
        64
    } else {
        spawn.y.clamp(1, 127)
    };
    let spawn_z = spawn.z;
    let new_spawn_x = spawn_x - (spawn_chunk_x * 16);
    let new_spawn_z = spawn_z - (spawn_chunk_z * 16);
    let safe_generator_name = if flat_world {
        "flat".to_string()
    } else if is_modern_world {
        "default".to_string()
    } else {
        get_string(java_data, "generatorName", "default")
    };
    let safe_generator_version = if flat_world {
        0
    } else if is_modern_world {
        1
    } else {
        get_int(java_data, "generatorVersion")
    };
    let safe_generator_options = if flat_world {
        get_string(java_data, "generatorOptions", "2;7,2x3,2;1;")
    } else if is_modern_world {
        "".to_string()
    } else {
        get_string(java_data, "generatorOptions", "")
    };

    let mut lce_data = NbtCompound::new("Data");
    lce_data.insert("RandomSeed", NbtValue::Long(get_long(java_data, "RandomSeed")));
    lce_data.insert("generatorName", NbtValue::String(safe_generator_name));
    lce_data.insert("generatorVersion", NbtValue::Int(safe_generator_version));
    lce_data.insert("generatorOptions", NbtValue::String(safe_generator_options));
    lce_data.insert("GameType", NbtValue::Int(get_int(java_data, "GameType")));
    lce_data.insert("MapFeatures", NbtValue::Byte(get_bool(java_data, "MapFeatures", true)));
    lce_data.insert("SpawnX", NbtValue::Int(new_spawn_x));
    lce_data.insert("SpawnY", NbtValue::Int(spawn_y));
    lce_data.insert("SpawnZ", NbtValue::Int(new_spawn_z));
    lce_data.insert("Time", NbtValue::Long(get_long(java_data, "Time")));
    lce_data.insert("DayTime", NbtValue::Long(get_long(java_data, "DayTime")));
    lce_data.insert("SizeOnDisk", NbtValue::Long(0));
    lce_data.insert("LastPlayed", NbtValue::Long(unix_timestamp_millis()));
    lce_data.insert(
        "LevelName",
        NbtValue::String(get_string(java_data, "LevelName", "Converted World")),
    );
    lce_data.insert("version", NbtValue::Int(19133));
    lce_data.insert("rainTime", NbtValue::Int(get_int(java_data, "rainTime")));
    lce_data.insert("raining", NbtValue::Byte(get_bool(java_data, "raining", false)));
    lce_data.insert("thunderTime", NbtValue::Int(get_int(java_data, "thunderTime")));
    lce_data.insert(
        "thundering",
        NbtValue::Byte(get_bool(java_data, "thundering", false)),
    );
    lce_data.insert(
        "hardcore",
        NbtValue::Byte(get_bool(java_data, "hardcore", false)),
    );
    lce_data.insert(
        "allowCommands",
        NbtValue::Byte(get_bool(java_data, "allowCommands", false)),
    );
    lce_data.insert(
        "initialized",
        NbtValue::Byte(get_bool(java_data, "initialized", true)),
    );

    lce_data.insert("newSeaLevel", NbtValue::Byte(1));
    lce_data.insert(
        "hasBeenInCreative",
        NbtValue::Byte(get_bool(java_data, "hasBeenInCreative", false)),
    );
    lce_data.insert(
        "spawnBonusChest",
        NbtValue::Byte(get_bool(java_data, "spawnBonusChest", false)),
    );

    lce_data.insert("hasStronghold", NbtValue::Byte(0));
    lce_data.insert("StrongholdX", NbtValue::Int(0));
    lce_data.insert("StrongholdY", NbtValue::Int(0));
    lce_data.insert("StrongholdZ", NbtValue::Int(0));
    lce_data.insert("hasStrongholdEndPortal", NbtValue::Byte(0));
    lce_data.insert("StrongholdEndPortalX", NbtValue::Int(0));
    lce_data.insert("StrongholdEndPortalZ", NbtValue::Int(0));
    lce_data.insert("XZSize", NbtValue::Int(xz_size));
    lce_data.insert("HellScale", NbtValue::Int(hell_scale));
    if !is_modern_world {
        if let Some(game_rules) = java_data.get("GameRules") {
            lce_data.insert("GameRules", game_rules.clone());
        }
    }

    let mut root = NbtCompound::new("");
    root.insert("Data", NbtValue::Compound(lce_data));
    nbt::write_nbt(&root)
}

pub fn convert_lce_to_java(
    lce_root: &NbtCompound,
    override_spawn_x: Option<i32>,
    override_spawn_y: Option<i32>,
    override_spawn_z: Option<i32>,
    embedded_player: Option<&NbtCompound>,
) -> Vec<u8> {
    let lce_data = lce_root.compound("Data").unwrap_or(lce_root);
    let mut java_data = lce_data.clone();
    let lce_only_fields = [
        "newSeaLevel",
        "hasBeenInCreative",
        "spawnBonusChest",
        "XZSize",
        "xzSize",
        "HellScale",
        "hellScale",
        "hasStronghold",
        "StrongholdX",
        "StrongholdY",
        "StrongholdZ",
        "hasStrongholdEndPortal",
        "StrongholdEndPortalX",
        "StrongholdEndPortalZ",
        "xStronghold",
        "yStronghold",
        "zStronghold",
        "hasStrongholdEP",
        "xStrongholdEP",
        "zStrongholdEP",
    ];

    for field in lce_only_fields {
        java_data.remove(field);
    }

    if let Some(sx) = override_spawn_x {
        java_data.insert("SpawnX", NbtValue::Int(sx));
    }
    if let Some(sy) = override_spawn_y {
        java_data.insert("SpawnY", NbtValue::Int(sy));
    }
    if let Some(sz) = override_spawn_z {
        java_data.insert("SpawnZ", NbtValue::Int(sz));
    }

    java_data.insert("version", NbtValue::Int(19133));
    java_data.insert("DataVersion", NbtValue::Int(1343));
    let mut version_compound = NbtCompound::new("Version");
    version_compound.insert("Id", NbtValue::Int(1343));
    version_compound.insert("Name", NbtValue::String("1.12.2".to_string()));
    version_compound.insert("Snapshot", NbtValue::Byte(0));
    java_data.insert("Version", NbtValue::Compound(version_compound));
    if let Some(player) = embedded_player {
        let mut player_tag = player.clone();
        player_tag.name = "Player".to_string();
        java_data.insert("Player", NbtValue::Compound(player_tag));
    }

    java_data.insert("LastPlayed", NbtValue::Long(unix_timestamp_millis()));
    let mut java_root = NbtCompound::new("");
    let mut data_tag = NbtCompound::new("Data");
    for (name, value) in &java_data.tags {
        data_tag.insert(name, value.clone());
    }
    java_root.insert("Data", NbtValue::Compound(data_tag));

    nbt::write_gzip_nbt(&java_root)
}

fn get_long(compound: &NbtCompound, name: &str) -> i64 {
    compound.long(name).unwrap_or(0)
}

fn get_int(compound: &NbtCompound, name: &str) -> i32 {
    compound.int(name).unwrap_or(0)
}

fn get_string(compound: &NbtCompound, name: &str, default: &str) -> String {
    compound.string(name).unwrap_or(default).to_string()
}

fn get_bool(compound: &NbtCompound, name: &str, default: bool) -> i8 {
    compound.byte(name).unwrap_or(if default { 1 } else { 0 })
}

fn unix_timestamp_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
