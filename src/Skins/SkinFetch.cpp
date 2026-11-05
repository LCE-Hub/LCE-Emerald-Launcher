#include "Skins/SkinFetch.hpp"
#include "Skins/SkinAssets.hpp"
#include "Net/HttpClient.hpp"
namespace emerald::skins {
std::optional<FetchedSkin> fetch_skin(const std::string &username,
                                      const std::string &proxy,
                                      std::string &error) {
  net::HttpClient client(proxy.empty()
                             ? std::optional<std::string>{}
                             : std::optional<std::string>{proxy});
  const std::string trim = [](std::string text) {
    while (!text.empty() && (text.front() == ' ' || text.front() == '\t')) {
      text.erase(text.begin());
    }
    while (!text.empty() && (text.back() == ' ' || text.back() == '\t')) {
      text.pop_back();
    }
    return text;
  }(username);

  const std::string mojang_url =
      "https://api.mojang.com/users/profiles/minecraft/" + trim;
  net::HttpResponse mojang_response = client.get(mojang_url);
  if (mojang_response.status <= 0) {
    error = "Failed request to mojang";
    return std::nullopt;
  }
  if (mojang_response.status < 200 || mojang_response.status >= 300) {
    error = "Player not found";
    return std::nullopt;
  }
  Json mojang_data = Json::parse(mojang_response.body, nullptr, false);
  if (mojang_data.is_discarded()) {
    mojang_data = Json::object();
  }
  const auto id_iterator = mojang_data.find("id");
  if (id_iterator == mojang_data.end() || !id_iterator->is_string()) {
    error = "Invalid Moajng response format";
    return std::nullopt;
  }
  const std::string id = id_iterator->get<std::string>();
  const auto name_iterator = mojang_data.find("name");
  const std::string name_exact =
      name_iterator != mojang_data.end() && name_iterator->is_string()
          ? name_iterator->get<std::string>()
          : trim;

  const std::string mc_api_url =
      "https://api.minecraftapi.net/v3/profile/" + id;
  net::HttpResponse mc_api_response = client.get(mc_api_url);
  if (mc_api_response.status <= 0) {
    error = "Failed request to mc api";
    return std::nullopt;
  }
  if (mc_api_response.status < 200 || mc_api_response.status >= 300) {
    error = "Error fetching skin data";
    return std::nullopt;
  }
  Json mc_api_data = Json::parse(mc_api_response.body, nullptr, false);
  if (mc_api_data.is_discarded()) {
    mc_api_data = Json::object();
  }
  const auto skin_iterator = mc_api_data.find("skin");
  if (skin_iterator != mc_api_data.end()) {
    const auto image_iterator = skin_iterator->find("image");
    if (image_iterator != skin_iterator->end() && image_iterator->is_string()) {
      FetchedSkin result;
      result.base64 = image_iterator->get<std::string>();
      result.name = name_exact;
      return result;
    }
    const auto url_iterator = skin_iterator->find("url");
    if (url_iterator != skin_iterator->end() && url_iterator->is_string()) {
      net::HttpResponse skin_response =
          client.get(url_iterator->get<std::string>());
      if (skin_response.status <= 0) {
        error = "Failed to fetch skin image";
        return std::nullopt;
      }
      if (skin_response.status < 200 || skin_response.status >= 300) {
        error = "Failed to download skin image: " +
                std::to_string(skin_response.status);
        return std::nullopt;
      }
      const std::optional<std::string> encoded =
          base64_encode(reinterpret_cast<const std::uint8_t *>(
                            skin_response.body.data()),
                        skin_response.body.size());
      if (!encoded.has_value()) {
        error = "Failed to encode skin image";
        return std::nullopt;
      }
      FetchedSkin result;
      result.base64 = *encoded;
      result.name = name_exact;
      return result;
    }
  }
  error = "No skin found";
  return std::nullopt;
}
} // namespace emerald::skins
