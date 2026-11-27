#include "Skins/SkinPck.hpp"
#include <cstring>
namespace emerald::skins {
namespace {
void put_u32(std::vector<std::uint8_t> &out, std::uint64_t offset, bool little,
             std::uint32_t value) {
  for (int i = 0; i < 4; ++i) {
    const int shift = little ? i * 8 : (3 - i) * 8;
    out[offset + static_cast<std::size_t>(i)] =
        static_cast<std::uint8_t>((value >> shift) & 0xFFU);
  }
}

void put_u16_str(std::vector<std::uint8_t> &out, std::uint64_t offset,
                 bool little, const std::string &text) {
  for (std::size_t i = 0; i < text.size(); ++i) {
    const std::uint16_t unit = static_cast<std::uint16_t>(text[i]);
    if (little) {
      out[offset + i * 2] = static_cast<std::uint8_t>(unit & 0xFFU);
      out[offset + i * 2 + 1] = static_cast<std::uint8_t>((unit >> 8) & 0xFFU);
    } else {
      out[offset + i * 2] = static_cast<std::uint8_t>((unit >> 8) & 0xFFU);
      out[offset + i * 2 + 1] = static_cast<std::uint8_t>(unit & 0xFFU);
    }
  }
}

std::size_t length_of(const std::string &text) {
  return sizeof(std::uint32_t) + sizeof(std::uint32_t) + text.size() * 2 +
         sizeof(std::uint32_t);
}
} // namespace

std::vector<std::uint8_t> serialize_pck(const PckFile &pck) {
  const bool little = pck.endianness == "little";
  std::uint64_t total_size = 4 + 4;
  std::vector<std::string> property_set;
  const auto push_unique_property = [&property_set](const std::string &key) {
    for (const std::string &existing : property_set) {
      if (existing == key) {
        return;
      }
    }
    property_set.push_back(key);
  };
  if (pck.xml_support) {
    push_unique_property("XMLVERSION");
  }
  for (const PckAsset &file : pck.files) {
    for (const PckProperty &property : file.properties) {
      push_unique_property(property.key);
    }
  }
  for (const std::string &property : property_set) {
    total_size += length_of(property);
  }
  if (pck.xml_support) {
    total_size += 4;
  }
  total_size += 4;
  for (const PckAsset &file : pck.files) {
    total_size += 4 + 4 + 4 + file.path.size() * 2 + 4;
  }
  for (const PckAsset &file : pck.files) {
    total_size += 4;
    for (const PckProperty &property : file.properties) {
      total_size += length_of(property.value);
    }
    total_size += file.data.size();
  }

  std::vector<std::uint8_t> buffer(total_size, 0);
  std::uint64_t offset = 0;
  put_u32(buffer, offset, little, pck.version);
  offset += 4;
  put_u32(buffer, offset, little,
          static_cast<std::uint32_t>(property_set.size()));
  offset += 4;
  for (std::size_t index = 0; index < property_set.size(); ++index) {
    put_u32(buffer, offset, little, static_cast<std::uint32_t>(index));
    offset += 4;
    const std::string &property = property_set[index];
    put_u32(buffer, offset, little, static_cast<std::uint32_t>(property.size()));
    offset += 4;
    put_u16_str(buffer, offset, little, property);
    offset += property.size() * 2;
    put_u32(buffer, offset, little, 0);
    offset += 4;
  }
  if (pck.xml_support) {
    put_u32(buffer, offset, little, 3);
    offset += 4;
  }
  put_u32(buffer, offset, little, static_cast<std::uint32_t>(pck.files.size()));
  offset += 4;
  for (const PckAsset &file : pck.files) {
    put_u32(buffer, offset, little, static_cast<std::uint32_t>(file.data.size()));
    offset += 4;
    put_u32(buffer, offset, little, static_cast<std::uint32_t>(file.type));
    offset += 4;
    put_u32(buffer, offset, little, static_cast<std::uint32_t>(file.path.size()));
    offset += 4;
    put_u16_str(buffer, offset, little, file.path);
    offset += file.path.size() * 2;
    put_u32(buffer, offset, little, 0);
    offset += 4;
  }
  for (const PckAsset &file : pck.files) {
    put_u32(buffer, offset, little,
            static_cast<std::uint32_t>(file.properties.size()));
    offset += 4;
    for (const PckProperty &property : file.properties) {
      for (std::size_t index = 0; index < property_set.size(); ++index) {
        if (property_set[index] == property.key) {
          put_u32(buffer, offset, little, static_cast<std::uint32_t>(index));
          break;
        }
      }
      offset += 4;
      const std::string &value = property.value;
      put_u32(buffer, offset, little, static_cast<std::uint32_t>(value.size()));
      offset += 4;
      put_u16_str(buffer, offset, little, value);
      offset += value.size() * 2;
      put_u32(buffer, offset, little, 0);
      offset += 4;
    }
    if (!file.data.empty()) {
      std::memcpy(buffer.data() + offset, file.data.data(), file.data.size());
    }
    offset += file.data.size();
  }
  return buffer;
}
} // namespace emerald::skins
