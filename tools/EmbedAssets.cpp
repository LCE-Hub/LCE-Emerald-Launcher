#include <algorithm>
#include <cstdint>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <string>
#include <vector>
namespace fs = std::filesystem;
namespace {
constexpr std::size_t kChunk = 6000;
struct Asset {
  std::string logical_path;
  std::vector<unsigned char> bytes;
};

std::string base64_encode(const std::vector<unsigned char> &data) {
  static constexpr char kAlphabet[] =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  std::string out;
  out.reserve(((data.size() + 2) / 3) * 4);
  std::size_t i = 0;
  for (; i + 3 <= data.size(); i += 3) {
    const std::uint32_t triple =
        (static_cast<std::uint32_t>(data[i]) << 16) |
        (static_cast<std::uint32_t>(data[i + 1]) << 8) |
        static_cast<std::uint32_t>(data[i + 2]);
    out.push_back(kAlphabet[(triple >> 18) & 0x3F]);
    out.push_back(kAlphabet[(triple >> 12) & 0x3F]);
    out.push_back(kAlphabet[(triple >> 6) & 0x3F]);
    out.push_back(kAlphabet[triple & 0x3F]);
  }
  const std::size_t remaining = data.size() - i;
  if (remaining == 1) {
    const std::uint32_t triple = static_cast<std::uint32_t>(data[i]) << 16;
    out.push_back(kAlphabet[(triple >> 18) & 0x3F]);
    out.push_back(kAlphabet[(triple >> 12) & 0x3F]);
    out.push_back('=');
    out.push_back('=');
  } else if (remaining == 2) {
    const std::uint32_t triple = (static_cast<std::uint32_t>(data[i]) << 16) |
                                 (static_cast<std::uint32_t>(data[i + 1]) << 8);
    out.push_back(kAlphabet[(triple >> 18) & 0x3F]);
    out.push_back(kAlphabet[(triple >> 12) & 0x3F]);
    out.push_back(kAlphabet[(triple >> 6) & 0x3F]);
    out.push_back('=');
  }
  return out;
}

std::string escape(const std::string &text) {
  std::string out;
  out.reserve(text.size());
  for (const char ch : text) {
    if (ch == '\\' || ch == '"') {
      out.push_back('\\');
    }
    out.push_back(ch);
  }
  return out;
}

std::uint64_t fnv1a(std::uint64_t hash, const unsigned char *data,
                    std::size_t size) {
  for (std::size_t i = 0; i < size; ++i) {
    hash ^= data[i];
    hash *= 1099511628211ULL;
  }
  return hash;
}

bool read_bytes(const fs::path &path, std::vector<unsigned char> &out) {
  std::ifstream stream(path, std::ios::binary);
  if (!stream) {
    return false;
  }
  stream.seekg(0, std::ios::end);
  const std::streamoff size = stream.tellg();
  stream.seekg(0, std::ios::beg);
  if (size > 0) {
    out.resize(static_cast<std::size_t>(size));
    stream.read(reinterpret_cast<char *>(out.data()), size);
  }
  return static_cast<bool>(stream) || stream.eof();
}

std::vector<Asset> collect(const std::string &root_name, const fs::path &dir) {
  std::vector<Asset> assets;
  std::error_code error;
  if (!fs::is_directory(dir)) {
    return assets;
  }
  for (const fs::directory_entry &entry :
       fs::recursive_directory_iterator(dir, error)) {
    if (error || !entry.is_regular_file()) {
      continue;
    }
    const fs::path relative = fs::relative(entry.path(), dir, error);
    if (error) {
      continue;
    }
    Asset asset;
    asset.logical_path = root_name + "/" + relative.generic_string();
    if (!read_bytes(entry.path(), asset.bytes)) {
      std::cerr << "embed: failed to read " << entry.path() << "\n";
      std::exit(1);
    }
    assets.push_back(std::move(asset));
  }
  return assets;
}
} // namespace

int main(int argc, char **argv) {
  if (argc < 2 || ((argc - 2) % 2) != 0) {
    std::cerr << "usage: embed_assets <output.cpp> [<root> <dir>]...\n";
    return 2;
  }
  const fs::path output = argv[1];
  std::vector<Asset> assets;
  for (int i = 2; i + 1 < argc; i += 2) {
    std::vector<Asset> found = collect(argv[i], argv[i + 1]);
    assets.insert(assets.end(), std::make_move_iterator(found.begin()),
                  std::make_move_iterator(found.end()));
  }
  std::sort(assets.begin(), assets.end(), [](const Asset &a, const Asset &b) {
    return a.logical_path < b.logical_path;
  });

  std::uint64_t hash = 1469598103934665603ULL;
  for (const Asset &asset : assets) {
    hash = fnv1a(
        hash,
        reinterpret_cast<const unsigned char *>(asset.logical_path.data()),
        asset.logical_path.size());
    hash = fnv1a(hash, asset.bytes.data(), asset.bytes.size());
  }
  char build_id[17];
  std::snprintf(build_id, sizeof(build_id), "%016llx",
                static_cast<unsigned long long>(hash));

  std::ofstream out(output, std::ios::binary | std::ios::trunc);
  if (!out) {
    std::cerr << "embed: cannot write " << output << "\n";
    return 1;
  }

  out << "//autogen\n";
  out << "#include \"Core/EmbeddedAssets.hpp\"\n\n";
  out << "namespace emerald::core::embedded::detail {\n\n";
  out << "const char kBuildId[] = \"" << build_id << "\";\n\n";
  out << "const unsigned long long kFileCount = " << assets.size() << ";\n\n";
  out << "const RawFile kFiles[] = {\n";
  for (const Asset &asset : assets) {
    const std::string encoded = base64_encode(asset.bytes);
    out << "  {\"" << escape(asset.logical_path) << "\",\n";
    if (encoded.empty()) {
      out << "   \"\"";
    } else {
      for (std::size_t offset = 0; offset < encoded.size(); offset += kChunk) {
        out << "   \"" << encoded.substr(offset, kChunk) << "\"\n";
      }
    }
    out << "   , " << asset.bytes.size() << "},\n";
  }
  out << "};\n\n}\n";
  out.close();
  std::cout << "embed: " << assets.size() << " files, build " << build_id
            << "\n";
  return 0;
}
