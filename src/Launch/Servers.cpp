#include "Launch/Servers.hpp"
#include "Core/Fs.hpp"
#include <cstdint>
#include <set>
#include <string>
namespace emerald::launch {
namespace {
constexpr const char *kServerFile = "servers.db";
void push_u16(std::string &out, std::uint16_t value) {
  out.push_back(static_cast<char>(value & 0xFF));
  out.push_back(static_cast<char>((value >> 8) & 0xFF));
}

void push_u32(std::string &out, std::uint32_t value) {
  out.push_back(static_cast<char>(value & 0xFF));
  out.push_back(static_cast<char>((value >> 8) & 0xFF));
  out.push_back(static_cast<char>((value >> 16) & 0xFF));
  out.push_back(static_cast<char>((value >> 24) & 0xFF));
}

std::uint16_t read_u16(const std::string &data, std::size_t position) {
  return static_cast<std::uint16_t>(
      static_cast<std::uint8_t>(data[position]) |
      (static_cast<std::uint16_t>(static_cast<std::uint8_t>(data[position + 1]))
       << 8));
}

std::uint32_t read_u32(const std::string &data, std::size_t position) {
  return static_cast<std::uint32_t>(
      static_cast<std::uint8_t>(data[position]) |
      (static_cast<std::uint32_t>(static_cast<std::uint8_t>(data[position + 1]))
       << 8) |
      (static_cast<std::uint32_t>(static_cast<std::uint8_t>(data[position + 2]))
       << 16) |
      (static_cast<std::uint32_t>(static_cast<std::uint8_t>(data[position + 3]))
       << 24));
}

} // namespace

std::vector<config::McServer>
read_server_list(const std::filesystem::path &instance_dir) {
  std::vector<config::McServer> servers;
  const std::optional<std::string> contents =
      core::read_file(instance_dir / kServerFile);
  if (!contents.has_value()) {
    return servers;
  }
  const std::string &data = *contents;
  if (data.size() < 12 || data.compare(0, 4, "MCSV") != 0) {
    return servers;
  }
  const std::uint32_t count = read_u32(data, 8);
  std::size_t position = 12;
  for (std::uint32_t index = 0; index < count; ++index) {
    if (position + 2 > data.size()) {
      break;
    }
    const std::size_t ip_length = read_u16(data, position);
    position += 2;
    if (position + ip_length > data.size()) {
      break;
    }
    config::McServer server;
    server.ip = data.substr(position, ip_length);
    position += ip_length;
    if (position + 2 > data.size()) {
      break;
    }
    server.port = read_u16(data, position);
    position += 2;
    if (position + 2 > data.size()) {
      break;
    }
    const std::size_t name_length = read_u16(data, position);
    position += 2;
    if (position + name_length > data.size()) {
      break;
    }
    server.name = data.substr(position, name_length);
    position += name_length;
    servers.push_back(std::move(server));
  }
  return servers;
}

void write_server_list(const std::filesystem::path &instance_dir,
                       const std::vector<config::McServer> &servers) {
  std::vector<config::McServer> unique;
  std::set<std::pair<std::string, std::uint16_t>> seen;
  for (const config::McServer &server : servers) {
    if (seen.insert({server.ip, server.port}).second) {
      unique.push_back(server);
    }
  }

  std::string data;
  data += "MCSV";
  push_u32(data, 1);
  push_u32(data, static_cast<std::uint32_t>(unique.size()));
  for (const config::McServer &server : unique) {
    push_u16(data, static_cast<std::uint16_t>(server.ip.size()));
    data += server.ip;
    push_u16(data, server.port);
    push_u16(data, static_cast<std::uint16_t>(server.name.size()));
    data += server.name;
  }
  core::write_file(instance_dir / kServerFile, data);
}

void ensure_server_list(const std::filesystem::path &instance_dir,
                        const std::vector<config::McServer> &servers) {
  std::vector<config::McServer> all = read_server_list(instance_dir);
  all.insert(all.end(), servers.begin(), servers.end());
  write_server_list(instance_dir, all);
}

std::vector<config::McServer> lce_online_server() {
  return {config::McServer{"LCEOnline Game", "127.0.0.1", 61000}};
}

std::vector<config::McServer> partnership_servers() {
  return {
      config::McServer{"Kowhaifans Clubhouse", "lce.kowhaifan.net", 25565},
      config::McServer{"BluerNetwork", "bluer-network.ddns.net", 25565},
      config::McServer{"LapboardMC", "104.168.125.227", 4444},
  };
}
} // namespace emerald::launch
