use std::collections::HashMap;
use super::nbt::NbtCompound;
#[derive(Clone, Copy, Default)]
pub struct LegacyBlockState {
    pub id: u8,
    pub data: u8,
}

pub fn map_modern_block_state(compound: &NbtCompound) -> LegacyBlockState {
    map_modern_block_state_inner(compound, None)
}

pub fn map_modern_block_state_with_context(
    compound: &NbtCompound,
    unknown_blocks: Option<&mut Vec<String>>,
) -> LegacyBlockState {
    map_modern_block_state_inner(compound, unknown_blocks)
}

fn map_modern_block_state_inner(
    compound: &NbtCompound,
    mut unknown_blocks: Option<&mut Vec<String>>,
) -> LegacyBlockState {
    let name_raw = compound.string("Name").unwrap_or("minecraft:air");
    let name = name_raw.strip_prefix("minecraft:").unwrap_or(name_raw);
    let properties = compound.compound("Properties");
    if let Some(fluid) = try_map_fluid(name, properties) {
        return fluid;
    }
    if let Some(slab) = try_map_slab(name, properties) {
        return slab;
    }
    if let Some(directional) = try_map_directional(name, properties) {
        return directional;
    }
    if let Some(flattened) = try_map_flattened_colored(name) {
        return flattened;
    }
    if let Some(direct) = MODERN_DIRECT_MAP.get(name) {
        return *direct;
    }
    if let Some(colored) = try_map_colored(name, properties) {
        return colored;
    }
    if let Some(wood) = try_map_wood(name, properties) {
        return wood;
    }
    if let Some(variant) = try_map_variant(name, properties) {
        return variant;
    }

    if let Some(ref mut blocks) = unknown_blocks {
        if !name.is_empty() && name != "air" && name != "cave_air" && name != "void_air" {
            blocks.push(name.to_string());
        }
    }

    LegacyBlockState { id: 0, data: 0 }
}

fn get_property<'a>(properties: Option<&'a NbtCompound>, name: &str) -> String {
    properties
        .and_then(|p| p.string(name))
        .unwrap_or("")
        .to_string()
}

fn get_bool_property(properties: Option<&NbtCompound>, name: &str) -> bool {
    get_property(properties, name).to_lowercase() == "true"
}

fn get_int_property(properties: Option<&NbtCompound>, name: &str, default: i32) -> i32 {
    get_property(properties, name)
        .parse()
        .unwrap_or(default)
}

fn try_map_fluid(name: &str, properties: Option<&NbtCompound>) -> Option<LegacyBlockState> {
    if name != "water" && name != "lava" {
        return None;
    }
    let level = get_int_property(properties, "level", 0).clamp(0, 15);
    let is_source = level == 0;
    let data = level as u8;
    Some(if name == "water" {
        LegacyBlockState {
            id: if is_source { 9 } else { 8 },
            data,
        }
    } else {
        LegacyBlockState {
            id: if is_source { 11 } else { 10 },
            data,
        }
    })
}

fn try_map_directional(name: &str, properties: Option<&NbtCompound>) -> Option<LegacyBlockState> {
    match name {
        "ladder" => Some(LegacyBlockState {
            id: 65,
            data: map_ladder_facing(&get_property(properties, "facing")),
        }),
        "vine" => Some(LegacyBlockState {
            id: 106,
            data: map_vine_faces(properties),
        }),
        "lever" => {
            let mut data =
                map_lever_data(&get_property(properties, "face"), &get_property(properties, "facing"));
            if get_bool_property(properties, "powered") {
                data |= 8;
            }
            Some(LegacyBlockState { id: 69, data })
        }
        _ if name.ends_with("_button") => {
            let id = if is_wood_family(name) { 143 } else { 77 };
            let mut data = map_button_facing(&get_property(properties, "facing"));
            if get_bool_property(properties, "powered") {
                data |= 8;
            }
            Some(LegacyBlockState { id, data })
        }
        _ if name.ends_with("_fence_gate") => {
            let mut data = map_fence_gate_facing(&get_property(properties, "facing"));
            if get_bool_property(properties, "open") {
                data |= 4;
            }
            Some(LegacyBlockState { id: 107, data })
        }
        _ if name.ends_with("_pressure_plate") => {
            let id = match name {
                "light_weighted_pressure_plate" => 147,
                "heavy_weighted_pressure_plate" => 148,
                _ if is_wood_family(name) => 72,
                _ => 70,
            };
            let powered =
                get_bool_property(properties, "powered") || get_int_property(properties, "power", 0) > 0;
            Some(LegacyBlockState {
                id,
                data: if powered { 1 } else { 0 },
            })
        }
        _ if name.ends_with("_door") || name == "iron_door" => {
            let id = if name == "iron_door" { 71 } else { 64 };
            let half = get_property(properties, "half");
            let is_upper = half == "upper";
            if is_upper {
                let mut data = 8;
                if get_property(properties, "hinge") == "right" {
                    data |= 1;
                }
                if get_bool_property(properties, "powered") {
                    data |= 2;
                }
                Some(LegacyBlockState { id, data })
            } else {
                let mut data = map_door_facing(&get_property(properties, "facing"));
                if get_bool_property(properties, "open") {
                    data |= 4;
                }
                Some(LegacyBlockState { id, data })
            }
        }
        _ if try_get_stairs_id(name).is_some() => {
            let id = try_get_stairs_id(name).unwrap();
            let mut data = map_stairs_facing(&get_property(properties, "facing"));
            if get_property(properties, "half") == "top" {
                data |= 4;
            }
            Some(LegacyBlockState { id, data })
        }
        _ if name.ends_with("trapdoor") => {
            let mut data = map_trapdoor_facing(&get_property(properties, "facing"));
            if get_bool_property(properties, "open") {
                data |= 4;
            }
            if get_property(properties, "half") == "top" {
                data |= 8;
            }
            Some(LegacyBlockState { id: 96, data })
        }
        "dispenser" | "dropper" => {
            let id = if name == "dropper" { 158 } else { 23 };
            let mut data = map_facing_data(&get_property(properties, "facing"));
            if get_bool_property(properties, "triggered") {
                data |= 8;
            }
            Some(LegacyBlockState { id, data })
        }
        "piston" | "sticky_piston" => {
            let id = if name == "sticky_piston" { 29 } else { 33 };
            let mut data = map_facing_data(&get_property(properties, "facing"));
            if get_bool_property(properties, "extended") {
                data |= 8;
            }
            Some(LegacyBlockState { id, data })
        }
        "piston_head" => {
            let mut data = map_facing_data(&get_property(properties, "facing"));
            if get_property(properties, "type") == "sticky" {
                data |= 8;
            }
            Some(LegacyBlockState { id: 34, data })
        }
        "redstone_wire" => {
            let data = get_int_property(properties, "power", 0).clamp(0, 15) as u8;
            Some(LegacyBlockState { id: 55, data })
        }
        "repeater" => {
            let id = if get_bool_property(properties, "powered") { 94 } else { 93 };
            let dir = map_repeater_direction(&get_property(properties, "facing"));
            let delay = get_int_property(properties, "delay", 1).clamp(1, 4);
            Some(LegacyBlockState {
                id,
                data: dir | (((delay - 1) as u8) << 2),
            })
        }
        "comparator" => {
            let id = if get_bool_property(properties, "powered") { 150 } else { 149 };
            let dir = map_repeater_direction(&get_property(properties, "facing"));
            let mode = if get_property(properties, "mode") == "subtract" { 4 } else { 0 };
            Some(LegacyBlockState {
                id,
                data: dir | mode,
            })
        }
        "wall_torch" => Some(LegacyBlockState {
            id: 50,
            data: map_wall_torch_facing(&get_property(properties, "facing")),
        }),
        "redstone_wall_torch" => {
            let id = if get_bool_property(properties, "lit") { 76 } else { 75 };
            Some(LegacyBlockState {
                id,
                data: map_wall_torch_facing(&get_property(properties, "facing")),
            })
        }
        "nether_wart" => Some(LegacyBlockState {
            id: 115,
            data: get_int_property(properties, "age", 0).clamp(0, 3) as u8,
        }),
        "wheat" => Some(LegacyBlockState {
            id: 59,
            data: get_int_property(properties, "age", 0).clamp(0, 7) as u8,
        }),
        "pumpkin_stem" | "attached_pumpkin_stem" => Some(LegacyBlockState {
            id: 104,
            data: if name == "attached_pumpkin_stem" {
                7
            } else {
                get_int_property(properties, "age", 0).clamp(0, 7) as u8
            },
        }),
        "melon_stem" | "attached_melon_stem" => Some(LegacyBlockState {
            id: 105,
            data: if name == "attached_melon_stem" {
                7
            } else {
                get_int_property(properties, "age", 0).clamp(0, 7) as u8
            },
        }),
        "cocoa" => {
            let age = get_int_property(properties, "age", 0).clamp(0, 2) as u8;
            let dir = map_repeater_direction(&get_property(properties, "facing"));
            Some(LegacyBlockState {
                id: 127,
                data: (age << 2) | dir,
            })
        }
        "hay_block" => Some(LegacyBlockState {
            id: 170,
            data: match get_property(properties, "axis").as_str() {
                "x" => 4,
                "z" => 8,
                _ => 0,
            },
        }),
        "quartz_pillar" => Some(LegacyBlockState {
            id: 155,
            data: match get_property(properties, "axis").as_str() {
                "x" => 3,
                "z" => 4,
                _ => 2,
            },
        }),
        "nether_portal" => Some(LegacyBlockState {
            id: 90,
            data: if get_property(properties, "axis") == "z" { 2 } else { 1 },
        }),
        _ => None,
    }
}

fn try_map_slab(name: &str, properties: Option<&NbtCompound>) -> Option<LegacyBlockState> {
    if !name.ends_with("_slab") {
        return None;
    }

    let slab_type = get_property(properties, "type");
    let is_top = slab_type == "top";
    let is_double = slab_type == "double";
    if let Some(wood_variant) = get_wood_slab_variant(name) {
        return Some(if is_double {
            LegacyBlockState {
                id: 125,
                data: wood_variant,
            }
        } else {
            LegacyBlockState {
                id: 126,
                data: wood_variant | if is_top { 8 } else { 0 },
            }
        });
    }

    if let Some(slab_variant) = get_stone_slab_variant(name) {
        return Some(if is_double {
            LegacyBlockState {
                id: 43,
                data: slab_variant,
            }
        } else {
            LegacyBlockState {
                id: 44,
                data: slab_variant | if is_top { 8 } else { 0 },
            }
        });
    }

    Some(if is_double {
        LegacyBlockState { id: 43, data: 0 }
    } else {
        LegacyBlockState {
            id: 44,
            data: if is_top { 8 } else { 0 },
        }
    })
}

fn get_wood_slab_variant(name: &str) -> Option<u8> {
    match name {
        "oak_slab" => Some(0),
        "spruce_slab" => Some(1),
        "birch_slab" => Some(2),
        "jungle_slab" => Some(3),
        "acacia_slab" => Some(4),
        "dark_oak_slab" => Some(5),
        _ => None,
    }
}

fn get_stone_slab_variant(name: &str) -> Option<u8> {
    match name {
        "stone_slab" | "smooth_stone_slab" | "andesite_slab" | "polished_andesite_slab"
        | "diorite_slab" | "polished_diorite_slab" | "granite_slab" | "polished_granite_slab" => {
            Some(0)
        }
        "sandstone_slab" | "smooth_sandstone_slab" | "cut_sandstone_slab"
        | "red_sandstone_slab" | "smooth_red_sandstone_slab" | "cut_red_sandstone_slab" => Some(1),
        "cobblestone_slab" | "mossy_cobblestone_slab" | "cobbled_deepslate_slab"
        | "deepslate_brick_slab" | "deepslate_tile_slab" => Some(3),
        "brick_slab" => Some(4),
        "stone_brick_slab" | "mossy_stone_brick_slab" => Some(5),
        "nether_brick_slab" | "red_nether_brick_slab" => Some(6),
        "quartz_slab" | "smooth_quartz_slab" | "purpur_slab" | "prismarine_slab"
        | "prismarine_brick_slab" | "dark_prismarine_slab" => Some(7),
        _ => None,
    }
}

fn try_get_stairs_id(name: &str) -> Option<u8> {
    match name {
        "oak_stairs" | "spruce_stairs" | "birch_stairs" | "jungle_stairs" | "acacia_stairs"
        | "dark_oak_stairs" => Some(53),
        "cobblestone_stairs" | "stone_stairs" | "mossy_cobblestone_stairs"
        | "cobbled_deepslate_stairs" | "blackstone_stairs" => Some(67),
        "brick_stairs" => Some(108),
        "stone_brick_stairs" | "dark_prismarine_stairs" | "prismarine_stairs"
        | "prismarine_brick_stairs" | "polished_blackstone_brick_stairs"
        | "mossy_stone_brick_stairs" | "deepslate_brick_stairs" | "deepslate_tile_stairs" => {
            Some(109)
        }
        "nether_brick_stairs" | "crimson_stairs" | "warped_stairs" => Some(114),
        "sandstone_stairs" | "red_sandstone_stairs" => Some(128),
        "quartz_stairs" | "purpur_stairs" => Some(156),
        "spruce_stairs" => Some(134),
        "birch_stairs" => Some(135),
        "jungle_stairs" => Some(136),
        "acacia_stairs" => Some(163),
        "dark_oak_stairs" => Some(164),
        _ => None,
    }
}

fn map_stairs_facing(facing: &str) -> u8 {
    match facing {
        "east" => 0,
        "west" => 1,
        "south" => 2,
        "north" => 3,
        _ => 0,
    }
}

fn map_ladder_facing(facing: &str) -> u8 {
    match facing {
        "north" => 2,
        "south" => 3,
        "west" => 4,
        "east" => 5,
        _ => 2,
    }
}

fn map_button_facing(facing: &str) -> u8 {
    match facing {
        "east" => 1,
        "west" => 2,
        "south" => 3,
        "north" => 4,
        _ => 1,
    }
}

fn map_fence_gate_facing(facing: &str) -> u8 {
    match facing {
        "south" => 0,
        "west" => 1,
        "north" => 2,
        "east" => 3,
        _ => 0,
    }
}

fn map_vine_faces(properties: Option<&NbtCompound>) -> u8 {
    let mut data = 0;
    if get_bool_property(properties, "south") {
        data |= 1;
    }
    if get_bool_property(properties, "west") {
        data |= 2;
    }
    if get_bool_property(properties, "north") {
        data |= 4;
    }
    if get_bool_property(properties, "east") {
        data |= 8;
    }
    data
}

fn map_lever_data(face: &str, facing: &str) -> u8 {
    match face {
        "floor" => {
            if facing == "east" || facing == "west" {
                6
            } else {
                5
            }
        }
        "ceiling" => {
            if facing == "east" || facing == "west" {
                7
            } else {
                0
            }
        }
        _ => map_button_facing(facing),
    }
}

fn map_door_facing(facing: &str) -> u8 {
    match facing {
        "east" => 0,
        "south" => 1,
        "west" => 2,
        "north" => 3,
        _ => 0,
    }
}

fn map_trapdoor_facing(facing: &str) -> u8 {
    match facing {
        "north" => 0,
        "south" => 1,
        "west" => 2,
        "east" => 3,
        _ => 0,
    }
}

fn map_facing_data(facing: &str) -> u8 {
    match facing {
        "down" => 0,
        "up" => 1,
        "north" => 2,
        "south" => 3,
        "west" => 4,
        "east" => 5,
        _ => 3,
    }
}

fn map_repeater_direction(facing: &str) -> u8 {
    match facing {
        "south" => 0,
        "west" => 1,
        "north" => 2,
        "east" => 3,
        _ => 0,
    }
}

fn map_wall_torch_facing(facing: &str) -> u8 {
    match facing {
        "east" => 1,
        "west" => 2,
        "south" => 3,
        "north" => 4,
        _ => 1,
    }
}

fn try_map_colored(name: &str, properties: Option<&NbtCompound>) -> Option<LegacyBlockState> {
    let color = get_color_data(&get_property(properties, "color"));
    match name {
        "wool" => Some(LegacyBlockState { id: 35, data: color }),
        "stained_glass" => Some(LegacyBlockState { id: 95, data: color }),
        "stained_glass_pane" => Some(LegacyBlockState { id: 160, data: color }),
        "stained_hardened_clay" | "terracotta" => {
            Some(LegacyBlockState { id: 159, data: color })
        }
        "concrete" => Some(LegacyBlockState {
            id: 172,
            data: color,
        }),
        "concrete_powder" => Some(LegacyBlockState { id: 12, data: color }),
        "glazed_terracotta" => Some(LegacyBlockState { id: 159, data: color }),
        _ => None,
    }
}

fn try_map_flattened_colored(name: &str) -> Option<LegacyBlockState> {
    let (color_data, suffix) = split_color_prefix(name)?;
    let data = color_data;
    match suffix.as_str() {
        "wool" => Some(LegacyBlockState { id: 35, data }),
        "stained_glass" | "glass" => Some(LegacyBlockState { id: 95, data }),
        "stained_glass_pane" | "glass_pane" => Some(LegacyBlockState { id: 160, data }),
        "stained_hardened_clay" | "terracotta" => Some(LegacyBlockState { id: 159, data }),
        "concrete" => Some(LegacyBlockState { id: 172, data }),
        "concrete_powder" => Some(LegacyBlockState { id: 12, data }),
        "glazed_terracotta" => Some(LegacyBlockState { id: 159, data }),
        "carpet" => Some(LegacyBlockState { id: 171, data }),
        _ => None,
    }
}

fn split_color_prefix(name: &str) -> Option<(u8, String)> {
    for color_name in COLOR_NAMES {
        let prefix = format!("{}_", color_name);
        if name.starts_with(&prefix) {
            let suffix = name[prefix.len()..].to_string();
            return Some((get_color_data(color_name), suffix));
        }
    }
    None
}

const COLOR_NAMES: &[&str] = &[
    "white", "orange", "magenta", "light_blue", "yellow", "lime", "pink", "gray", "silver",
    "light_gray", "cyan", "purple", "blue", "brown", "green", "red", "black",
];

fn get_color_data(color: &str) -> u8 {
    match color {
        "white" => 0,
        "orange" => 1,
        "magenta" => 2,
        "light_blue" => 3,
        "yellow" => 4,
        "lime" => 5,
        "pink" => 6,
        "gray" => 7,
        "light_gray" => 8,
        "cyan" => 9,
        "purple" => 10,
        "blue" => 11,
        "brown" => 12,
        "green" => 13,
        "red" => 14,
        "black" => 15,
        _ => 0,
    }
}

fn try_map_wood(name: &str, properties: Option<&NbtCompound>) -> Option<LegacyBlockState> {
    let wood_type = get_property(properties, "variant");
    let wood_type = if wood_type.is_empty() {
        get_prefix_before_underscore(name)
    } else {
        wood_type
    };

    let data_value = match wood_type.as_str() {
        "spruce" => 1,
        "birch" => 2,
        "jungle" => 3,
        "acacia" => 0,
        "dark_oak" => 1,
        _ => 0,
    };

    if name.ends_with("_planks") || name == "planks" {
        return Some(LegacyBlockState { id: 5, data: data_value });
    }
    if name.ends_with("_sapling") || name == "sapling" {
        return Some(LegacyBlockState { id: 6, data: data_value });
    }
    if name.ends_with("_log") || name == "log" {
        return Some(LegacyBlockState {
            id: 17,
            data: data_value.min(3),
        });
    }
    if name.ends_with("_leaves") || name == "leaves" {
        return Some(LegacyBlockState {
            id: 18,
            data: data_value.min(3),
        });
    }
    if name.ends_with("_stairs") && name.contains("wood") {
        return Some(LegacyBlockState { id: 53, data: 0 });
    }
    if name.ends_with("_door") {
        return Some(LegacyBlockState { id: 64, data: 0 });
    }
    if name.ends_with("_fence") {
        return Some(LegacyBlockState { id: 85, data: 0 });
    }
    if name.ends_with("_fence_gate") {
        return Some(LegacyBlockState { id: 107, data: 0 });
    }
    if name.ends_with("_pressure_plate") && is_wood_family(name) {
        return Some(LegacyBlockState { id: 72, data: 0 });
    }

    None
}

fn try_map_variant(name: &str, properties: Option<&NbtCompound>) -> Option<LegacyBlockState> {
    if let Some(fallback) = try_map_common_fallback(name, properties) {
        return Some(fallback);
    }

    if name == "redstone_lamp" {
        let lit = get_bool_property(properties, "lit");
        return Some(LegacyBlockState {
            id: if lit { 124 } else { 123 },
            data: 0,
        });
    }

    let result = match name {
        "deepslate" | "polished_deepslate" | "tuff" | "calcite" | "dripstone_block" => {
            Some(LegacyBlockState { id: 1, data: 0 })
        }
        "cobbled_deepslate" => Some(LegacyBlockState { id: 4, data: 0 }),
        "deepslate_bricks" | "deepslate_tiles" => Some(LegacyBlockState { id: 98, data: 0 }),
        "cracked_deepslate_bricks" | "cracked_deepslate_tiles" => {
            Some(LegacyBlockState { id: 98, data: 2 })
        }
        "chiseled_deepslate" => Some(LegacyBlockState { id: 98, data: 3 }),
        "deepslate_coal_ore" => Some(LegacyBlockState { id: 16, data: 0 }),
        "deepslate_iron_ore" | "deepslate_copper_ore" => {
            Some(LegacyBlockState { id: 15, data: 0 })
        }
        "deepslate_gold_ore" => Some(LegacyBlockState { id: 14, data: 0 }),
        "deepslate_redstone_ore" => Some(LegacyBlockState { id: 73, data: 0 }),
        "deepslate_lapis_ore" => Some(LegacyBlockState { id: 21, data: 0 }),
        "deepslate_diamond_ore" => Some(LegacyBlockState { id: 56, data: 0 }),
        "deepslate_emerald_ore" => Some(LegacyBlockState { id: 129, data: 0 }),
        "deepslate_tile_stairs" | "deepslate_brick_stairs" | "cobbled_deepslate_stairs" => {
            Some(LegacyBlockState { id: 67, data: 0 })
        }
        "deepslate_tile_slab" | "deepslate_brick_slab" | "cobbled_deepslate_slab" => {
            Some(LegacyBlockState { id: 44, data: 3 })
        }
        "deepslate_tile_wall" | "deepslate_brick_wall" | "cobbled_deepslate_wall" => {
            Some(LegacyBlockState { id: 139, data: 0 })
        }
        "grass_block" => Some(LegacyBlockState { id: 2, data: 0 }),
        "coarse_dirt" | "podzol" => Some(LegacyBlockState { id: 3, data: 0 }),
        "grass_path" | "dirt_path" | "moss_carpet" => Some(LegacyBlockState { id: 2, data: 0 }),
        "cobblestone_wall" => Some(LegacyBlockState { id: 139, data: 0 }),
        "mossy_cobblestone_wall" => Some(LegacyBlockState { id: 139, data: 1 }),
        "smooth_stone_slab" => Some(LegacyBlockState { id: 44, data: 0 }),
        "stone_brick_stairs" => Some(LegacyBlockState { id: 109, data: 0 }),
        "mossy_stone_bricks" => Some(LegacyBlockState { id: 98, data: 1 }),
        "cracked_stone_bricks" => Some(LegacyBlockState { id: 98, data: 2 }),
        "chiseled_stone_bricks" => Some(LegacyBlockState { id: 98, data: 3 }),
        "red_sand" => Some(LegacyBlockState { id: 12, data: 1 }),
        "red_sandstone" => Some(LegacyBlockState { id: 24, data: 0 }),
        "smooth_sandstone" => Some(LegacyBlockState { id: 24, data: 2 }),
        "chiseled_sandstone" | "cut_sandstone" => Some(LegacyBlockState { id: 24, data: 1 }),
        "smooth_red_sandstone" | "chiseled_red_sandstone" | "cut_red_sandstone" => {
            Some(LegacyBlockState { id: 24, data: 0 })
        }
        "red_sandstone_stairs" => Some(LegacyBlockState { id: 128, data: 0 }),
        "red_sandstone_slab" => Some(LegacyBlockState { id: 44, data: 1 }),
        "prismarine" | "prismarine_bricks" | "dark_prismarine" => {
            Some(LegacyBlockState { id: 1, data: 0 })
        }
        "sea_lantern" => Some(LegacyBlockState { id: 89, data: 0 }),
        "purpur_block" | "purpur_pillar" => Some(LegacyBlockState { id: 155, data: 0 }),
        "purpur_stairs" => Some(LegacyBlockState { id: 156, data: 0 }),
        "purpur_slab" => Some(LegacyBlockState { id: 44, data: 0 }),
        "end_stone_bricks" => Some(LegacyBlockState { id: 121, data: 0 }),
        "magma_block" => Some(LegacyBlockState { id: 87, data: 0 }),
        "nether_wart_block" | "red_nether_bricks" => Some(LegacyBlockState { id: 112, data: 0 }),
        "bone_block" => Some(LegacyBlockState { id: 1, data: 0 }),
        "packed_ice" | "blue_ice" => Some(LegacyBlockState { id: 79, data: 0 }),
        "observer" | "beetroots" | "kelp" | "kelp_plant" | "seagrass" | "tall_seagrass"
        | "coral_block" | "tube_coral_block" | "brain_coral_block" | "bubble_coral_block"
        | "fire_coral_block" | "horn_coral_block" | "end_rod" | "chorus_plant"
        | "chorus_flower" | "end_gateway" | "structure_void" => {
            Some(LegacyBlockState { id: 0, data: 0 })
        }
        "sunflower" | "lilac" | "rose_bush" | "peony" => {
            if get_property(properties, "half") == "upper" {
                Some(LegacyBlockState { id: 0, data: 0 })
            } else {
                Some(LegacyBlockState { id: 38, data: 0 })
            }
        }
        "tall_grass" => {
            if get_property(properties, "half") == "upper" {
                Some(LegacyBlockState { id: 0, data: 0 })
            } else {
                let grass_type = get_property(properties, "type");
                Some(LegacyBlockState {
                    id: 31,
                    data: if grass_type == "fern" { 2 } else { 1 },
                })
            }
        }
        "large_fern" => {
            if get_property(properties, "half") == "upper" {
                Some(LegacyBlockState { id: 0, data: 0 })
            } else {
                Some(LegacyBlockState { id: 31, data: 2 })
            }
        }
        "stone" => {
            let _type = get_property(properties, "type");
            Some(LegacyBlockState { id: 1, data: 0 })
        }
        "sandstone" => {
            let stype = get_property(properties, "type");
            Some(LegacyBlockState {
                id: 24,
                data: match stype.as_str() {
                    "chiseled" => 1,
                    "smooth" => 2,
                    _ => 0,
                },
            })
        }
        "stone_bricks" => {
            let stype = get_property(properties, "type");
            Some(LegacyBlockState {
                id: 98,
                data: match stype.as_str() {
                    "mossy" => 1,
                    "cracked" => 2,
                    "chiseled" => 3,
                    _ => 0,
                },
            })
        }
        _ => None,
    };

    result
}

fn try_map_common_fallback(name: &str, properties: Option<&NbtCompound>) -> Option<LegacyBlockState> {
    if name.ends_with("_button") {
        return Some(LegacyBlockState {
            id: if is_wood_family(name) { 143 } else { 77 },
            data: 0,
        });
    }
    if name.ends_with("_wall_sign") {
        return Some(LegacyBlockState {
            id: 68,
            data: map_wall_sign_facing(&get_property(properties, "facing")),
        });
    }
    if name.ends_with("_sign") {
        return Some(LegacyBlockState {
            id: 63,
            data: (get_int_property(properties, "rotation", 0) & 0x0F) as u8,
        });
    }
    if name.ends_with("_wall") {
        return Some(LegacyBlockState { id: 139, data: 0 });
    }
    if name.ends_with("_bed") {
        let mut data = map_bed_facing(&get_property(properties, "facing"));
        if get_property(properties, "part") == "head" {
            data |= 8;
        }
        return Some(LegacyBlockState { id: 26, data });
    }
    if name.ends_with("_banner") {
        return Some(LegacyBlockState { id: 0, data: 0 });
    }

    match name {
        "barrier" | "structure_void" => Some(LegacyBlockState { id: 0, data: 0 }),
        "bamboo" => Some(LegacyBlockState { id: 83, data: 0 }),
        "cake" => Some(LegacyBlockState { id: 92, data: 0 }),
        "brewing_stand" => Some(LegacyBlockState { id: 117, data: 0 }),
        "barrel" => Some(LegacyBlockState { id: 54, data: 0 }),
        "blast_furnace" => Some(LegacyBlockState { id: 61, data: 0 }),
        "campfire" => Some(LegacyBlockState { id: 50, data: 0 }),
        "azure_bluet" | "blue_orchid" => Some(LegacyBlockState { id: 38, data: 0 }),
        "attached_melon_stem" => Some(LegacyBlockState { id: 105, data: 7 }),
        "attached_pumpkin_stem" => Some(LegacyBlockState { id: 104, data: 7 }),
        "andesite" | "diorite" | "granite" | "polished_andesite" | "polished_diorite"
        | "polished_granite" => Some(LegacyBlockState { id: 1, data: 0 }),
        "andesite_stairs" | "diorite_stairs" | "granite_stairs" | "polished_andesite_stairs"
        | "polished_diorite_stairs" | "polished_granite_stairs" => {
            Some(LegacyBlockState { id: 109, data: 0 })
        }
        "bubble_column" => Some(LegacyBlockState { id: 9, data: 0 }),
        "amethyst_block" | "budding_amethyst" | "amethyst_cluster" => {
            Some(LegacyBlockState { id: 20, data: 0 })
        }
        _ => None,
    }
}

fn map_bed_facing(facing: &str) -> u8 {
    match facing {
        "south" => 0,
        "west" => 1,
        "north" => 2,
        "east" => 3,
        _ => 0,
    }
}

fn map_wall_sign_facing(facing: &str) -> u8 {
    match facing {
        "north" => 2,
        "south" => 3,
        "west" => 4,
        "east" => 5,
        _ => 2,
    }
}

fn get_prefix_before_underscore(value: &str) -> String {
    let index = value.find('_');
    match index {
        Some(i) if i > 0 => value[..i].to_string(),
        _ => value.to_string(),
    }
}

fn is_wood_family(name: &str) -> bool {
    name.contains("oak")
        || name.contains("spruce")
        || name.contains("birch")
        || name.contains("jungle")
        || name.contains("acacia")
        || name.contains("dark_oak")
        || name.contains("mangrove")
        || name.contains("cherry")
        || name.contains("bamboo")
        || name.contains("crimson")
        || name.contains("warped")
}

pub fn is_valid_lce_tile_id(id: u8) -> bool {
    id <= 160 || (id >= 170 && id <= 173)
}

pub fn remap_blocks(blocks: &mut [u8], _data: &mut [u8]) {
    for id in blocks.iter_mut() {
        let mut bid = *id;
        if bid == 137 {
            bid = 1;
        }
        if bid >= 165 {
            if let Some(&replacement) = BLOCK_REMAP_TABLE.get(&bid) {
                bid = replacement;
            }
        }
        if !is_valid_lce_tile_id(bid) {
            bid = 0;
        }
        *id = bid;
    }
}

static MODERN_DIRECT_MAP: once_cell::sync::Lazy<HashMap<&'static str, LegacyBlockState>> =
    once_cell::sync::Lazy::new(|| {
        let mut m = HashMap::new();
        m.insert("air", LegacyBlockState { id: 0, data: 0 });
        m.insert("cave_air", LegacyBlockState { id: 0, data: 0 });
        m.insert("void_air", LegacyBlockState { id: 0, data: 0 });
        m.insert("stone", LegacyBlockState { id: 1, data: 0 });
        m.insert("grass", LegacyBlockState { id: 31, data: 1 });
        m.insert("short_grass", LegacyBlockState { id: 31, data: 1 });
        m.insert("short_dry_grass", LegacyBlockState { id: 31, data: 1 });
        m.insert("dirt", LegacyBlockState { id: 3, data: 0 });
        m.insert("cobblestone", LegacyBlockState { id: 4, data: 0 });
        m.insert("bedrock", LegacyBlockState { id: 7, data: 0 });
        m.insert("water", LegacyBlockState { id: 8, data: 0 });
        m.insert("lava", LegacyBlockState { id: 10, data: 0 });
        m.insert("sand", LegacyBlockState { id: 12, data: 0 });
        m.insert("gravel", LegacyBlockState { id: 13, data: 0 });
        m.insert("gold_ore", LegacyBlockState { id: 14, data: 0 });
        m.insert("iron_ore", LegacyBlockState { id: 15, data: 0 });
        m.insert("coal_ore", LegacyBlockState { id: 16, data: 0 });
        m.insert("oak_log", LegacyBlockState { id: 17, data: 0 });
        m.insert("oak_leaves", LegacyBlockState { id: 18, data: 0 });
        m.insert("glass", LegacyBlockState { id: 20, data: 0 });
        m.insert("lapis_ore", LegacyBlockState { id: 21, data: 0 });
        m.insert("lapis_block", LegacyBlockState { id: 22, data: 0 });
        m.insert("dispenser", LegacyBlockState { id: 23, data: 0 });
        m.insert("sandstone", LegacyBlockState { id: 24, data: 0 });
        m.insert("note_block", LegacyBlockState { id: 25, data: 0 });
        m.insert("powered_rail", LegacyBlockState { id: 27, data: 0 });
        m.insert("detector_rail", LegacyBlockState { id: 28, data: 0 });
        m.insert("sticky_piston", LegacyBlockState { id: 29, data: 0 });
        m.insert("cobweb", LegacyBlockState { id: 30, data: 0 });
        m.insert("dead_bush", LegacyBlockState { id: 32, data: 0 });
        m.insert("piston", LegacyBlockState { id: 33, data: 0 });
        m.insert("wool", LegacyBlockState { id: 35, data: 0 });
        m.insert("dandelion", LegacyBlockState { id: 37, data: 0 });
        m.insert("poppy", LegacyBlockState { id: 38, data: 0 });
        m.insert("brown_mushroom", LegacyBlockState { id: 39, data: 0 });
        m.insert("red_mushroom", LegacyBlockState { id: 40, data: 0 });
        m.insert("gold_block", LegacyBlockState { id: 41, data: 0 });
        m.insert("iron_block", LegacyBlockState { id: 42, data: 0 });
        m.insert("stone_slab", LegacyBlockState { id: 44, data: 0 });
        m.insert("bricks", LegacyBlockState { id: 45, data: 0 });
        m.insert("tnt", LegacyBlockState { id: 46, data: 0 });
        m.insert("bookshelf", LegacyBlockState { id: 47, data: 0 });
        m.insert("mossy_cobblestone", LegacyBlockState { id: 48, data: 0 });
        m.insert("obsidian", LegacyBlockState { id: 49, data: 0 });
        m.insert("torch", LegacyBlockState { id: 50, data: 0 });
        m.insert("fire", LegacyBlockState { id: 51, data: 0 });
        m.insert("mob_spawner", LegacyBlockState { id: 52, data: 0 });
        m.insert("oak_stairs", LegacyBlockState { id: 53, data: 0 });
        m.insert("chest", LegacyBlockState { id: 54, data: 0 });
        m.insert("diamond_ore", LegacyBlockState { id: 56, data: 0 });
        m.insert("diamond_block", LegacyBlockState { id: 57, data: 0 });
        m.insert("crafting_table", LegacyBlockState { id: 58, data: 0 });
        m.insert("farmland", LegacyBlockState { id: 60, data: 0 });
        m.insert("furnace", LegacyBlockState { id: 61, data: 0 });
        m.insert("ladder", LegacyBlockState { id: 65, data: 0 });
        m.insert("rail", LegacyBlockState { id: 66, data: 0 });
        m.insert("lever", LegacyBlockState { id: 69, data: 0 });
        m.insert("stone_pressure_plate", LegacyBlockState { id: 70, data: 0 });
        m.insert("oak_pressure_plate", LegacyBlockState { id: 72, data: 0 });
        m.insert("redstone_ore", LegacyBlockState { id: 73, data: 0 });
        m.insert("redstone_torch", LegacyBlockState { id: 76, data: 0 });
        m.insert("stone_button", LegacyBlockState { id: 77, data: 0 });
        m.insert("snow", LegacyBlockState { id: 78, data: 0 });
        m.insert("ice", LegacyBlockState { id: 79, data: 0 });
        m.insert("snow_block", LegacyBlockState { id: 80, data: 0 });
        m.insert("cactus", LegacyBlockState { id: 81, data: 0 });
        m.insert("clay", LegacyBlockState { id: 82, data: 0 });
        m.insert("jukebox", LegacyBlockState { id: 84, data: 0 });
        m.insert("oak_fence", LegacyBlockState { id: 85, data: 0 });
        m.insert("netherrack", LegacyBlockState { id: 87, data: 0 });
        m.insert("soul_sand", LegacyBlockState { id: 88, data: 0 });
        m.insert("glowstone", LegacyBlockState { id: 89, data: 0 });
        m.insert("jack_o_lantern", LegacyBlockState { id: 91, data: 0 });
        m.insert("stone_bricks", LegacyBlockState { id: 98, data: 0 });
        m.insert("brown_mushroom_block", LegacyBlockState { id: 99, data: 0 });
        m.insert("red_mushroom_block", LegacyBlockState { id: 100, data: 0 });
        m.insert("iron_bars", LegacyBlockState { id: 101, data: 0 });
        m.insert("glass_pane", LegacyBlockState { id: 102, data: 0 });
        m.insert("melon", LegacyBlockState { id: 103, data: 0 });
        m.insert("vine", LegacyBlockState { id: 106, data: 0 });
        m.insert("oak_fence_gate", LegacyBlockState { id: 107, data: 0 });
        m.insert("brick_stairs", LegacyBlockState { id: 108, data: 0 });
        m.insert("stone_brick_stairs", LegacyBlockState { id: 109, data: 0 });
        m.insert("mycelium", LegacyBlockState { id: 110, data: 0 });
        m.insert("lily_pad", LegacyBlockState { id: 111, data: 0 });
        m.insert("nether_bricks", LegacyBlockState { id: 112, data: 0 });
        m.insert("nether_brick_fence", LegacyBlockState { id: 113, data: 0 });
        m.insert("nether_brick_stairs", LegacyBlockState { id: 114, data: 0 });
        m.insert("enchanting_table", LegacyBlockState { id: 116, data: 0 });
        m.insert("end_stone", LegacyBlockState { id: 121, data: 0 });
        m.insert("sandstone_stairs", LegacyBlockState { id: 128, data: 0 });
        m.insert("emerald_ore", LegacyBlockState { id: 129, data: 0 });
        m.insert("ender_chest", LegacyBlockState { id: 130, data: 0 });
        m.insert("tripwire_hook", LegacyBlockState { id: 131, data: 0 });
        m.insert("emerald_block", LegacyBlockState { id: 133, data: 0 });
        m.insert("spruce_stairs", LegacyBlockState { id: 134, data: 0 });
        m.insert("birch_stairs", LegacyBlockState { id: 135, data: 0 });
        m.insert("jungle_stairs", LegacyBlockState { id: 136, data: 0 });
        m.insert("command_block", LegacyBlockState { id: 1, data: 0 });
        m.insert("beacon", LegacyBlockState { id: 138, data: 0 });
        m.insert("cobblestone_wall", LegacyBlockState { id: 139, data: 0 });
        m.insert("flower_pot", LegacyBlockState { id: 140, data: 0 });
        m.insert("carrots", LegacyBlockState { id: 141, data: 0 });
        m.insert("potatoes", LegacyBlockState { id: 142, data: 0 });
        m.insert("oak_button", LegacyBlockState { id: 143, data: 0 });
        m.insert("anvil", LegacyBlockState { id: 145, data: 0 });
        m.insert("trapped_chest", LegacyBlockState { id: 146, data: 0 });
        m.insert("light_weighted_pressure_plate", LegacyBlockState { id: 147, data: 0 });
        m.insert("heavy_weighted_pressure_plate", LegacyBlockState { id: 148, data: 0 });
        m.insert("daylight_detector", LegacyBlockState { id: 151, data: 0 });
        m.insert("redstone_block", LegacyBlockState { id: 152, data: 0 });
        m.insert("quartz_ore", LegacyBlockState { id: 153, data: 0 });
        m.insert("hopper", LegacyBlockState { id: 154, data: 0 });
        m.insert("quartz_block", LegacyBlockState { id: 155, data: 0 });
        m.insert("quartz_stairs", LegacyBlockState { id: 156, data: 0 });
        m.insert("activator_rail", LegacyBlockState { id: 157, data: 0 });
        m.insert("dropper", LegacyBlockState { id: 158, data: 0 });
        m.insert("stained_hardened_clay", LegacyBlockState { id: 159, data: 0 });
        m.insert("stained_glass", LegacyBlockState { id: 95, data: 0 });
        m.insert("stained_glass_pane", LegacyBlockState { id: 160, data: 0 });
        m.insert("leaves2", LegacyBlockState { id: 161, data: 0 });
        m.insert("log2", LegacyBlockState { id: 162, data: 0 });
        m.insert("acacia_stairs", LegacyBlockState { id: 163, data: 0 });
        m.insert("dark_oak_stairs", LegacyBlockState { id: 164, data: 0 });
        m.insert("fern", LegacyBlockState { id: 31, data: 2 });
        m.insert("sugar_cane", LegacyBlockState { id: 83, data: 0 });
        m.insert("pumpkin", LegacyBlockState { id: 86, data: 0 });
        m.insert("carved_pumpkin", LegacyBlockState { id: 86, data: 0 });
        m.insert("nether_quartz_ore", LegacyBlockState { id: 153, data: 0 });
        m.insert("dragon_egg", LegacyBlockState { id: 122, data: 0 });
        m.insert("spawner", LegacyBlockState { id: 52, data: 0 });
        m.insert("tripwire", LegacyBlockState { id: 132, data: 0 });
        m.insert("sponge", LegacyBlockState { id: 19, data: 0 });
        m.insert("wet_sponge", LegacyBlockState { id: 19, data: 0 });
        m.insert("cauldron", LegacyBlockState { id: 118, data: 0 });
        m.insert("water_cauldron", LegacyBlockState { id: 118, data: 3 });
        m.insert("coal_block", LegacyBlockState { id: 173, data: 0 });
        m.insert("mushroom_stem", LegacyBlockState { id: 99, data: 10 });
        m.insert("smooth_stone", LegacyBlockState { id: 1, data: 0 });
        m.insert("infested_stone", LegacyBlockState { id: 1, data: 0 });
        m.insert("infested_stone_bricks", LegacyBlockState { id: 98, data: 0 });
        m.insert("infested_deepslate", LegacyBlockState { id: 1, data: 0 });
        m.insert(
            "polished_blackstone_bricks",
            LegacyBlockState { id: 98, data: 0 },
        );
        m.insert(
            "cracked_polished_blackstone_bricks",
            LegacyBlockState { id: 98, data: 2 },
        );
        m.insert("blackstone", LegacyBlockState { id: 4, data: 0 });
        m.insert("quartz_bricks", LegacyBlockState { id: 155, data: 0 });
        m.insert(
            "chiseled_quartz_block",
            LegacyBlockState { id: 155, data: 1 },
        );
        m.insert(
            "chiseled_nether_bricks",
            LegacyBlockState { id: 112, data: 0 },
        );
        m.insert("smooth_basalt", LegacyBlockState { id: 1, data: 0 });
        m.insert("pointed_dripstone", LegacyBlockState { id: 1, data: 0 });
        m.insert("lodestone", LegacyBlockState { id: 1, data: 0 });
        m.insert("structure_block", LegacyBlockState { id: 1, data: 0 });
        m.insert("stonecutter", LegacyBlockState { id: 4, data: 0 });
        m.insert("rooted_dirt", LegacyBlockState { id: 3, data: 0 });
        m.insert("moss_block", LegacyBlockState { id: 48, data: 0 });
        m.insert(
            "dried_kelp_block",
            LegacyBlockState { id: 170, data: 0 },
        );
        m.insert("crimson_stem", LegacyBlockState { id: 17, data: 0 });
        m.insert("warped_stem", LegacyBlockState { id: 17, data: 0 });
        m.insert(
            "stripped_crimson_stem",
            LegacyBlockState { id: 17, data: 0 },
        );
        m.insert(
            "stripped_warped_stem",
            LegacyBlockState { id: 17, data: 0 },
        );
        m.insert("azalea", LegacyBlockState { id: 18, data: 0 });
        m.insert("flowering_azalea", LegacyBlockState { id: 18, data: 0 });
        m.insert(
            "big_dripleaf",
            LegacyBlockState { id: 111, data: 0 },
        );
        m.insert(
            "big_dripleaf_stem",
            LegacyBlockState { id: 17, data: 0 },
        );
        m.insert("small_dripleaf", LegacyBlockState { id: 0, data: 0 });
        m.insert("hanging_roots", LegacyBlockState { id: 0, data: 0 });
        m.insert("spore_blossom", LegacyBlockState { id: 38, data: 0 });
        m.insert(
            "twisting_vines",
            LegacyBlockState { id: 106, data: 0 },
        );
        m.insert(
            "twisting_vines_plant",
            LegacyBlockState { id: 106, data: 0 },
        );
        m.insert("cave_vines", LegacyBlockState { id: 0, data: 0 });
        m.insert(
            "cave_vines_plant",
            LegacyBlockState { id: 0, data: 0 },
        );
        m.insert("glow_lichen", LegacyBlockState { id: 0, data: 0 });
        m.insert("cornflower", LegacyBlockState { id: 38, data: 0 });
        m.insert(
            "lily_of_the_valley",
            LegacyBlockState { id: 38, data: 0 },
        );
        m.insert("oxeye_daisy", LegacyBlockState { id: 38, data: 0 });
        m.insert("pink_tulip", LegacyBlockState { id: 38, data: 0 });
        m.insert("brain_coral", LegacyBlockState { id: 38, data: 0 });
        m.insert("bubble_coral", LegacyBlockState { id: 38, data: 0 });
        m.insert("fire_coral", LegacyBlockState { id: 38, data: 0 });
        m.insert("horn_coral", LegacyBlockState { id: 38, data: 0 });
        m.insert("tube_coral", LegacyBlockState { id: 38, data: 0 });
        m.insert(
            "horn_coral_fan",
            LegacyBlockState { id: 38, data: 0 },
        );
        m.insert(
            "tube_coral_fan",
            LegacyBlockState { id: 38, data: 0 },
        );
        m.insert("smoker", LegacyBlockState { id: 61, data: 0 });
        m.insert(
            "grindstone",
            LegacyBlockState { id: 145, data: 0 },
        );
        m.insert("bell", LegacyBlockState { id: 145, data: 0 });
        m.insert("loom", LegacyBlockState { id: 58, data: 0 });
        m.insert(
            "smithing_table",
            LegacyBlockState { id: 58, data: 0 },
        );
        m.insert(
            "target",
            LegacyBlockState { id: 70, data: 0 },
        );
        m.insert("chain", LegacyBlockState { id: 101, data: 0 });
        m.insert(
            "lightning_rod",
            LegacyBlockState { id: 101, data: 0 },
        );
        m.insert("lantern", LegacyBlockState { id: 50, data: 0 });
        m.insert(
            "shroomlight",
            LegacyBlockState { id: 89, data: 0 },
        );
        m.insert(
            "soul_campfire",
            LegacyBlockState { id: 51, data: 0 },
        );
        m.insert(
            "bee_nest",
            LegacyBlockState { id: 54, data: 0 },
        );
        m.insert(
            "wither_skeleton_skull",
            LegacyBlockState { id: 144, data: 0 },
        );
        m.insert(
            "dragon_wall_head",
            LegacyBlockState { id: 144, data: 0 },
        );
        m.insert(
            "nether_portal",
            LegacyBlockState { id: 90, data: 0 },
        );
        m.insert(
            "white_candle",
            LegacyBlockState { id: 50, data: 0 },
        );
        m.insert(
            "orange_candle",
            LegacyBlockState { id: 50, data: 0 },
        );
        m.insert(
            "gray_candle",
            LegacyBlockState { id: 50, data: 0 },
        );
        m.insert(
            "cyan_candle",
            LegacyBlockState { id: 50, data: 0 },
        );
        m.insert(
            "lime_candle",
            LegacyBlockState { id: 50, data: 0 },
        );
        m.insert(
            "potted_blue_orchid",
            LegacyBlockState { id: 140, data: 0 },
        );
        m.insert(
            "potted_brown_mushroom",
            LegacyBlockState { id: 140, data: 0 },
        );
        m.insert(
            "potted_cactus",
            LegacyBlockState { id: 140, data: 0 },
        );
        m.insert(
            "potted_dandelion",
            LegacyBlockState { id: 140, data: 0 },
        );
        m.insert(
            "potted_oxeye_daisy",
            LegacyBlockState { id: 140, data: 0 },
        );
        m.insert(
            "potted_poppy",
            LegacyBlockState { id: 140, data: 0 },
        );
        m.insert(
            "potted_red_mushroom",
            LegacyBlockState { id: 140, data: 0 },
        );
        m.insert(
            "powder_snow",
            LegacyBlockState { id: 80, data: 0 },
        );
        m.insert(
            "copper_ore",
            LegacyBlockState { id: 15, data: 0 },
        );
        m.insert(
            "oxidized_copper",
            LegacyBlockState { id: 15, data: 0 },
        );
        m.insert(
            "weathered_copper",
            LegacyBlockState { id: 15, data: 0 },
        );
        m.insert(
            "raw_copper_block",
            LegacyBlockState { id: 42, data: 0 },
        );
        m.insert(
            "raw_iron_block",
            LegacyBlockState { id: 42, data: 0 },
        );
        m.insert(
            "small_amethyst_bud",
            LegacyBlockState { id: 20, data: 0 },
        );
        m.insert(
            "medium_amethyst_bud",
            LegacyBlockState { id: 20, data: 0 },
        );
        m.insert(
            "large_amethyst_bud",
            LegacyBlockState { id: 20, data: 0 },
        );
        m.insert(
            "slime_block",
            LegacyBlockState { id: 0, data: 0 },
        );
        m.insert("light", LegacyBlockState { id: 0, data: 0 });
        m.insert(
            "scaffolding",
            LegacyBlockState { id: 0, data: 0 },
        );
        m.insert(
            "powder_snow_cauldron",
            LegacyBlockState { id: 118, data: 0 },
        );
        m.insert(
            "lava_cauldron",
            LegacyBlockState { id: 118, data: 0 },
        );
        m
    });

static BLOCK_REMAP_TABLE: once_cell::sync::Lazy<HashMap<u8, u8>> =
    once_cell::sync::Lazy::new(|| {
        let mut m = HashMap::new();
        m.insert(174, 79);
        m.insert(175, 0);
        m.insert(165, 0);
        m.insert(166, 0);
        m.insert(167, 96);
        m.insert(168, 1);
        m.insert(169, 89);
        m.insert(176, 0);
        m.insert(177, 0);
        m.insert(178, 151);
        m.insert(179, 24);
        m.insert(180, 128);
        m.insert(181, 43);
        m.insert(182, 44);
        m.insert(183, 107);
        m.insert(184, 107);
        m.insert(185, 107);
        m.insert(186, 107);
        m.insert(187, 107);
        m.insert(188, 85);
        m.insert(189, 85);
        m.insert(190, 85);
        m.insert(191, 85);
        m.insert(192, 85);
        m.insert(193, 64);
        m.insert(194, 64);
        m.insert(195, 64);
        m.insert(196, 64);
        m.insert(197, 64);
        m.insert(198, 0);
        m.insert(199, 0);
        m.insert(200, 0);
        m.insert(201, 155);
        m.insert(202, 155);
        m.insert(203, 156);
        m.insert(204, 43);
        m.insert(205, 44);
        m.insert(206, 121);
        m.insert(207, 0);
        m.insert(208, 2);
        m.insert(209, 0);
        m.insert(210, 1);
        m.insert(211, 1);
        m.insert(212, 79);
        m.insert(213, 87);
        m.insert(214, 112);
        m.insert(215, 112);
        m.insert(216, 1);
        m.insert(217, 0);
        m.insert(218, 0);
        for i in 219..=234 {
            m.insert(i, 0);
        }
        for i in 235..=250 {
            m.insert(i, 159);
        }
        m.insert(251, 172);
        m.insert(252, 12);
        m
    });
