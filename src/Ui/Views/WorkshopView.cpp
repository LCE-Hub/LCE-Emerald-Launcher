#include "Ui/Views/WorkshopView.hpp"
#include "Instances/InstanceManager.hpp"
#include "Instances/WorkshopStore.hpp"
#include "Ui/EditionResolver.hpp"
#include "lazuli/I18n.hpp"
#include <algorithm>
#include <cctype>
#include <set>
#include <utility>
namespace emerald::ui {
namespace {
constexpr std::size_t kColumns = 4;
constexpr std::size_t kDescriptionClamp = 160;
std::string translate(const UiServices &services, const std::string &key,
                      const std::string &fallback) {
  return services.i18n != nullptr ? services.i18n->translate(key) : fallback;
}

std::string substitute(std::string text, const std::string &key,
                       const std::string &value) {
  const std::string token = "{{" + key + "}}";
  std::size_t position = text.find(token);
  while (position != std::string::npos) {
    text.replace(position, token.size(), value);
    position = text.find(token, position + value.size());
  }
  return text;
}

std::string clamp_text(const std::string &text, std::size_t max_chars) {
  if (text.size() <= max_chars) {
    return text;
  }
  return text.substr(0, max_chars) + "...";
}

std::vector<std::string> split_action(const std::string &action) {
  std::vector<std::string> parts;
  std::size_t cursor = 0;
  while (true) {
    const std::size_t colon = action.find(':', cursor);
    if (colon == std::string::npos) {
      parts.push_back(action.substr(cursor));
      break;
    }
    parts.push_back(action.substr(cursor, colon - cursor));
    cursor = colon + 1;
  }
  return parts;
}

std::string join_parts(const std::vector<std::string> &parts) {
  std::string joined;
  for (std::size_t index = 1; index < parts.size(); ++index) {
    if (index > 1) {
      joined += ", ";
    }
    joined += parts[index];
  }
  return joined;
}

bool matches_search(const instances::WorkshopPackage &package,
                    const std::string &query) {
  const std::string lower = [&query] {
    std::string value;
    value.reserve(query.size());
    for (const char character : query) {
      value.push_back(static_cast<char>(std::tolower(
          static_cast<unsigned char>(character))));
    }
    return value;
  }();
  const auto contains = [&lower](const std::string &text) {
    std::string hay;
    hay.reserve(text.size());
    for (const char character : text) {
      hay.push_back(static_cast<char>(
          std::tolower(static_cast<unsigned char>(character))));
    }
    return hay.find(lower) != std::string::npos;
  };
  return contains(package.name) || contains(package.author) ||
         contains(package.description);
}

const std::vector<instances::WorkshopPackage> &
list_for_tab(const instances::WorkshopCatalog &catalog,
             const std::string &tab) {
  if (tab == "Versions") {
    return catalog.versions;
  }
  if (tab == "Server") {
    return catalog.servers;
  }
  return catalog.packages;
}

bool category_matches(const instances::WorkshopPackage &package,
                      const std::string &tab) {
  return std::find(package.category.begin(), package.category.end(), tab) !=
         package.category.end();
}
} // namespace

WorkshopView::WorkshopView() = default;
void WorkshopView::on_enter() {
  tab_ = "Skin";
  search_.clear();
  selected_id_.clear();
  install_target_.clear();
  uninstall_target_.clear();
  server_category_ = "all";
  deps_open_ = false;
  install_open_ = false;
  uninstall_open_ = false;
  pending_queue_.clear();
}

Json WorkshopView::data(const UiServices &services) const {
  Json data = Json::object();
  data["loading"] = true;
  data["hasError"] = false;
  data["error"] = "";
  data["tab"] = tab_;
  data["search"] = search_;
  data["items"] = Json::array();
  data["rows"] = Json::array();
  data["count"] = 0;
  data["modalOpen"] = false;
  data["depsOpen"] = deps_open_;
  data["installOpen"] = false;
  data["uninstallOpen"] = false;
  data["serverCategories"] = Json::array();
  data["showSearch"] = tab_ == "Installed" || tab_ == "Versions" ||
                       tab_ == "Search" || tab_ == "Server";
  data["showSearchTabPrompt"] = tab_ == "Search" && search_.empty();
  data["showLceLogo"] = false;
  data["hasSearch"] = !search_.empty();
  data["showBulkActions"] = false;
  data["updateAllLabel"] = "";
  data["reinstallAllLabel"] = "";
  data["jobActive"] = false;
  data["showContent"] = false;
  data["tabSkinClass"] = tab_ == "Skin" ? "ws-tab-active" : "";
  data["tabTextureClass"] = tab_ == "Texture" ? "ws-tab-active" : "";
  data["tabWorldClass"] = tab_ == "World" ? "ws-tab-active" : "";
  data["tabModClass"] = tab_ == "Mod" ? "ws-tab-active" : "";
  data["tabDlcClass"] = tab_ == "DLC" ? "ws-tab-active" : "";
  data["tabVersionsClass"] = tab_ == "Versions" ? "ws-tab-active" : "";
  data["tabInstalledClass"] = tab_ == "Installed" ? "ws-tab-active" : "";
  data["tabSearchClass"] = tab_ == "Search" ? "ws-tab-active" : "";
  data["tabServerClass"] = tab_ == "Server" ? "ws-tab-active" : "";
  Json tabs = Json::array();
  for (const char *tab_id :
       {"Skin", "Texture", "World", "Mod", "DLC", "Versions", "Installed",
        "Search", "Server"}) {
    Json tab = Json::object();
    tab["id"] = tab_id;
    const std::string key =
        "workshop.tabs." + std::string(tab_id);
    std::string lower_key;
    for (const char character : key) {
      lower_key.push_back(static_cast<char>(
          std::tolower(static_cast<unsigned char>(character))));
    }
    tab["label"] = translate(services, lower_key, tab_id);
    tab["cls"] = tab_ == tab_id ? "lce-tab-active" : "";
    tabs.push_back(std::move(tab));
  }
  data["tabs"] = std::move(tabs);
  data["searchLabel"] =
      tab_ == "Installed"
          ? translate(services, "workshop.filterInstalled",
                      "FILTER INSTALLED...")
          : tab_ == "Versions"
              ? translate(services, "workshop.filterVersions",
                          "FILTER VERSIONS...")
              : tab_ == "Server"
                  ? translate(services, "workshop.filterServers",
                              "FILTER SERVERS...")
                  : translate(services, "workshop.enterKeywords",
                              "ENTER KEYWORDS...");

  if (services.workshop == nullptr) {
    return data;
  }
  const instances::WorkshopCatalog catalog = services.workshop->catalog();
  const std::vector<instances::InstalledPackageEntry> installed_entries =
      services.workshop->installed();
  data["loading"] = catalog.loading;
  data["hasError"] = !catalog.error.empty();
  data["error"] = translate(services, "workshop.failedToLoadRegistry",
                            "Failed to load registry");
  data["showContent"] = !catalog.loading && catalog.error.empty() &&
                        !(tab_ == "Search" && search_.empty());
  const config::AppConfig &config = services.config->data();
  const instances::InstanceManager instance_manager(config);
  const auto is_installed = [&](const instances::WorkshopPackage &package) {
    if (tab_ == "Versions") {
      if (!config.custom_editions.has_value()) {
        return false;
      }
      for (const config::CustomEdition &edition : *config.custom_editions) {
        if (edition.id == package.id || edition.url == package.url) {
          return true;
        }
      }
      return false;
    }
    if (tab_ == "Server") {
      return false;
    }
    return std::any_of(installed_entries.begin(), installed_entries.end(),
                       [&](const instances::InstalledPackageEntry &entry) {
                         return entry.package_id == package.id;
                       });
  };
  const auto has_update = [&](const instances::WorkshopPackage &package) {
    if (tab_ == "Versions" || tab_ == "Server") {
      return false;
    }
    bool installed = false;
    for (const instances::InstalledPackageEntry &entry : installed_entries) {
      if (entry.package_id != package.id) {
        continue;
      }
      installed = true;
      if (entry.version != package.version) {
        return true;
      }
    }
    return false;
  };
  const auto installed_entries_for =
      [&](const instances::WorkshopPackage &package) {
        std::vector<instances::InstalledPackageEntry> entries;
        if (tab_ == "Versions") {
          const bool added = is_installed(package);
          if (added) {
            entries.push_back(instances::InstalledPackageEntry{
                package.id, package.id, package.version});
          }
          return entries;
        }
        for (const instances::InstalledPackageEntry &entry :
             installed_entries) {
          if (entry.package_id == package.id) {
            entries.push_back(entry);
          }
        }
        return entries;
      };

  const bool is_installed_tab = tab_ == "Installed";
  const bool is_search_tab = tab_ == "Search";
  const bool is_server_tab = tab_ == "Server";
  std::vector<instances::WorkshopPackage> items;
  if (!catalog.loading && catalog.error.empty()) {
    if (is_installed_tab) {
      for (const instances::WorkshopPackage &package : catalog.packages) {
        if (is_installed(package)) {
          items.push_back(package);
        }
      }
    } else if (is_search_tab) {
      if (!search_.empty()) {
        for (const instances::WorkshopPackage &package : catalog.packages) {
          if (matches_search(package, search_)) {
            items.push_back(package);
          }
        }
      }
    } else {
      const std::vector<instances::WorkshopPackage> &source =
          list_for_tab(catalog, tab_);
      for (const instances::WorkshopPackage &package : source) {
        if (!is_server_tab && tab_ != "Versions" &&
            !category_matches(package, tab_)) {
          continue;
        }
        if (is_server_tab && server_category_ != "all" &&
            !category_matches(package, server_category_)) {
          continue;
        }
        if (!search_.empty() && !matches_search(package, search_)) {
          continue;
        }
        items.push_back(package);
      }
    }
  }

  const auto empty_message = [&]() {
    if (is_installed_tab) {
      return translate(services, "workshop.nothingInstalled",
                       "Nothing Installed");
    }
    if (is_server_tab) {
      return translate(services, "workshop.noServersAvailable",
                       "No servers available");
    }
    return translate(services, "common.noResults", "No results");
  }();

  Json items_json = Json::array();
  for (const instances::WorkshopPackage &package : items) {
    Json item = Json::object();
    item["id"] = package.id;
    item["name"] = package.name;
    item["author"] = package.author;
    item["version"] = package.version;
    item["desc"] = clamp_text(package.description, kDescriptionClamp);
    item["thumb"] = package.thumbnail_data;
    item["hasThumb"] = !package.thumbnail_data.empty();
    item["noThumb"] = package.thumbnail_data.empty();
    item["badge"] = package.category.empty() ? std::string()
                                             : package.category.front();
    const bool installed = is_installed(package);
    const bool update = has_update(package);
    item["installed"] = installed;
    item["notInstalled"] = !installed;
    item["update"] = update;
    item["showInstalled"] = installed && !update;
    item["installedLabel"] =
        translate(services, tab_ == "Versions" && installed
                                ? "workshop.added"
                                : "workshop.installed",
                  tab_ == "Versions" && installed ? "Added" : "Installed");
    item["updateLabel"] =
        translate(services, "workshop.update", "Update");
    item["noImageLabel"] =
        translate(services, "workshop.noImage", "No Image");
    item["action"] = "workshop.open:" + package.id;
    item["cardId"] = "workshop-card-" + package.id;
    items_json.push_back(std::move(item));
  }
  data["items"] = items_json;
  data["count"] = items_json.size();
  data["emptyMessage"] = empty_message;
  Json rows = Json::array();
  Json current_row = Json::object();
  std::size_t col = 0;
  for (const Json &item : items_json) {
    current_row["c" + std::to_string(col)] = item;
    current_row["has" + std::to_string(col)] = true;
    ++col;
    if (col == kColumns) {
      rows.push_back(std::move(current_row));
      current_row = Json::object();
      col = 0;
    }
  }
  if (col > 0) {
    for (std::size_t i = col; i < kColumns; ++i) {
      current_row["has" + std::to_string(i)] = false;
    }
    rows.push_back(std::move(current_row));
  }
  data["rows"] = std::move(rows);
  data["noItems"] = items_json.empty();
  std::set<std::string> server_categories;
  for (const instances::WorkshopPackage &package : catalog.servers) {
    server_categories.insert(package.server_type);
  }
  Json category_json = Json::array();
  Json all_category = Json::object();
  all_category["id"] = "all";
  all_category["label"] = translate(services, "common.all", "All");
  all_category["selected"] = server_category_ == "all";
  all_category["cls"] = server_category_ == "all" ? "ws-cat-active" : "";
  all_category["action"] = "workshop.serverCategory:all";
  category_json.push_back(std::move(all_category));
  for (const std::string &category : server_categories) {
    if (category.empty()) {
      continue;
    }
    Json entry = Json::object();
    entry["id"] = category;
    entry["label"] = category;
    entry["selected"] = server_category_ == category;
    entry["cls"] = server_category_ == category ? "ws-cat-active" : "";
    entry["action"] = "workshop.serverCategory:" + category;
    category_json.push_back(std::move(entry));
  }
  data["serverCategories"] = std::move(category_json);
  data["showServerCategories"] = is_server_tab;
  int update_count = 0;
  if (!catalog.loading && catalog.error.empty()) {
    for (const instances::WorkshopPackage &package : catalog.packages) {
      const bool installed_tab_visible = is_installed(package);
      if (installed_tab_visible && has_update(package)) {
        ++update_count;
      }
    }
  }
  const int installed_count = static_cast<int>(std::count_if(
      items.begin(), items.end(),
      [&](const instances::WorkshopPackage &package) {
        return is_installed(package);
      }));
  data["showBulkActions"] =
      is_installed_tab && !items.empty() && search_.empty();
  data["updateAllLabel"] =
      substitute(translate(services, "workshop.updateAll", "Update All ({{count}})"),
                 "count", std::to_string(update_count));
  data["reinstallAllLabel"] =
      substitute(translate(services, "workshop.reinstallAll", "Reinstall All ({{count}})"),
                 "count", std::to_string(items.size()));
  data["updateCount"] = update_count;
  data["installedCount"] = installed_count;
  const instances::WorkshopPackage *selected = nullptr;
  if (!selected_id_.empty()) {
    for (const std::vector<instances::WorkshopPackage> *list :
         {&catalog.packages, &catalog.versions, &catalog.servers}) {
      for (const instances::WorkshopPackage &package : *list) {
        if (package.id == selected_id_) {
          selected = &package;
          break;
        }
      }
      if (selected != nullptr) {
        break;
      }
    }
  }

  const instances::WorkshopJobSnapshot job = services.workshop->job();
  data["jobActive"] = job.active();
  data["jobKind"] = job.kind;
  data["jobFinished"] = job.state == instances::WorkshopJobState::finished;
  data["jobFailed"] = job.state == instances::WorkshopJobState::failed;
  data["jobLabel"] = job.label;
  data["jobMessage"] = job.message;
  data["jobPercent"] = std::to_string(static_cast<int>(job.percent));
  if (selected != nullptr) {
    const bool is_version_tab = tab_ == "Versions";
    const std::vector<instances::InstalledPackageEntry> entries =
        installed_entries_for(*selected);
    const bool has_installed = !entries.empty();
    const bool needs_update = has_installed && std::any_of(
        entries.begin(), entries.end(),
        [&](const instances::InstalledPackageEntry &entry) {
          return entry.version != selected->version;
        });
    bool server_saved = false;
    if (is_server_tab && config.saved_servers.has_value()) {
      server_saved = std::any_of(
          config.saved_servers->begin(), config.saved_servers->end(),
          [&](const config::McServer &server) {
            return server.ip == selected->server_address;
          });
    }
    const std::string install_label =
        is_server_tab
            ? translate(services, server_saved ? "workshop.added"
                                               : "workshop.add",
                        server_saved ? "Added" : "ADD")
            : is_version_tab
                ? translate(services, has_installed ? "workshop.added"
                                                    : "workshop.add",
                            has_installed ? "Added" : "ADD")
                : !has_installed
                    ? translate(services, "workshop.install", "INSTALL")
                    : needs_update
                        ? translate(services, "workshop.update", "Update")
                        : translate(services, "workshop.reinstall",
                                    "REINSTALL");
    const std::string install_action =
        is_server_tab ? "workshop.server.toggle:" + selected->id
                      : is_version_tab ? "workshop.version.add"
                                       : "workshop.install.open";

    Json modal = Json::object();
    modal["open"] = true;
    modal["id"] = selected->id;
    modal["name"] = selected->name;
    modal["author"] = selected->author;
    modal["desc"] = selected->description;
    modal["extended"] = selected->extended_description;
    modal["hasExtended"] = !selected->extended_description.empty();
    modal["thumb"] = selected->thumbnail_data;
    modal["hasThumb"] = !selected->thumbnail_data.empty();
    modal["noThumb"] = selected->thumbnail_data.empty();
    modal["version"] = selected->version;
    modal["packageId"] = selected->id;
    modal["noImageLabel"] =
        translate(services, "workshop.noImage", "No Image");
    modal["byAuthor"] = substitute(
        translate(services, "workshop.byAuthor", "By {{author}}"), "author",
        selected->author);
    modal["detailsLabel"] =
        translate(services, "workshop.details", "Details");
    modal["metadataLabel"] =
        translate(services, "workshop.metadata", "Metadata");
    modal["categoriesLabel"] =
        translate(services, "workshop.categories", "Categories");
    modal["versionLabel"] = translate(services, "workshop.version", "Version:");
    modal["packageIdLabel"] =
        translate(services, "workshop.packageId", "Package ID:");
    modal["installedLabel"] =
        translate(services, "workshop.installed", "Installed");
    modal["outdatedLabel"] =
        translate(services, "workshop.outdated", " (outdated)");
    modal["addressLabel"] = translate(services, "workshop.address", "Address:");
    modal["typeLabel"] = translate(services, "workshop.type", "Type:");
    modal["ownerLabel"] = translate(services, "workshop.owner", "Owner:");
    modal["discordLabel"] =
        translate(services, "workshop.discordServer", "Discord Server:");
    modal["installLabel"] = install_label;
    modal["removeLabel"] = translate(services, "workshop.remove", "REMOVE");
    modal["backLabel"] = translate(services, "workshop.back", "Back");
    modal["installedBadge"] = translate(services, "workshop.installed",
                                        "Installed");
    modal["updateAvailableBadge"] =
        translate(services, "workshop.updateAvailable", "Update Available");
    modal["savedBadge"] = translate(services, "workshop.saved", "Saved");
    modal["hasInstalled"] = has_installed;
    modal["needsUpdate"] = needs_update;
    modal["showInstalledBadge"] = has_installed && !needs_update;
    modal["showSavedBadge"] =
        server_saved && !has_installed && !needs_update;
    modal["installedVersion"] =
        entries.empty() ? std::string() : entries.front().version;
    modal["installedVersionCls"] =
        needs_update ? "ws-meta-value-update" : "ws-meta-value-ok";
    modal["isServer"] = is_server_tab;
    modal["isVersion"] = is_version_tab;
    modal["isContent"] = !is_server_tab && !is_version_tab;
    modal["serverAddress"] = selected->server_address;
    modal["serverType"] = selected->server_type;
    modal["serverOwner"] = selected->author;
    modal["serverVersion"] = selected->version;
    modal["serverDiscord"] = selected->server_discord;
    modal["hasDiscord"] = !selected->server_discord.empty();
    modal["serverSaved"] = server_saved;
    modal["installAction"] = install_action;
    Json categories = Json::array();
    std::string categories_text;
    for (std::size_t index = 0; index < selected->category.size(); ++index) {
      categories.push_back(selected->category[index]);
      if (index > 0) {
        categories_text += ", ";
      }
      categories_text += selected->category[index];
    }
    modal["categories"] = std::move(categories);
    modal["categoriesText"] = categories_text;
    modal["hasCategories"] = !selected->category.empty();
    Json dependencies = Json::array();
    Json unresolved = Json::array();
    bool has_unresolved_deps = false;
    for (const std::string &dependency_id : selected->dependencies) {
      const instances::WorkshopPackage *dependency = nullptr;
      for (const instances::WorkshopPackage &package : catalog.packages) {
        if (package.id == dependency_id) {
          dependency = &package;
          break;
        }
      }
      const bool dependency_installed =
          std::any_of(installed_entries.begin(), installed_entries.end(),
                      [&](const instances::InstalledPackageEntry &entry) {
                        return entry.package_id == dependency_id;
                      });
      if (!dependency_installed) {
        has_unresolved_deps = true;
        Json missing = Json::object();
        missing["id"] = dependency_id;
        missing["name"] =
            dependency != nullptr ? dependency->name : dependency_id;
        missing["version"] =
            dependency != nullptr ? dependency->version : std::string("?");
        unresolved.push_back(std::move(missing));
      }
      Json entry = Json::object();
      entry["id"] = dependency_id;
      entry["name"] =
          dependency != nullptr ? dependency->name : dependency_id;
      entry["version"] =
          dependency != nullptr ? dependency->version : std::string("?");
      entry["installed"] = dependency_installed;
      entry["cls"] =
          dependency_installed ? "ws-chip-dep-installed" : "ws-chip-dep";
      entry["label"] =
          (dependency != nullptr ? dependency->name : dependency_id) +
          (dependency_installed
               ? translate(services, "workshop.installedSuffix",
                           " (installed)")
               : std::string());
      dependencies.push_back(std::move(entry));
    }
    modal["dependencies"] = std::move(dependencies);
    modal["unresolvedDeps"] = unresolved;
    modal["hasDependencies"] = !selected->dependencies.empty();
    modal["hasUnresolvedDeps"] = has_unresolved_deps;
    Json required = Json::array();
    for (const std::string &version_id : selected->required_versions) {
      std::string display_name;
      const std::vector<instances::Edition> editions =
          resolve_config_editions(config);
      for (const instances::Edition &edition : editions) {
        if (edition.id == version_id) {
          display_name = edition.name;
          break;
        }
      }
      for (const instances::WorkshopPackage &package : catalog.versions) {
        if (display_name.empty() && package.id == version_id) {
          display_name = package.name;
          break;
        }
      }
      if (display_name.empty()) {
        continue;
      }
      Json entry = Json::object();
      entry["name"] = display_name;
      required.push_back(std::move(entry));
    }
    modal["requiredEditions"] = std::move(required);
    modal["hasRequiredEditions"] = !selected->required_versions.empty();
    const std::vector<instances::WorkshopGroup> groups =
        instances::group_archives(selected->zips);
    Json files = Json::array();
    for (const instances::WorkshopGroup &group : groups) {
      Json entry = Json::object();
      entry["main"] = group.parts.front();
      entry["parts"] = join_parts(group.parts);
      entry["dest"] = group.dest;
      entry["split"] = group.parts.size() > 1;
      entry["splitLabel"] = substitute(
          translate(services, "workshop.splitArchive",
                    "Split archive - {{count}} parts"),
          "count", std::to_string(group.parts.size()));
      files.push_back(std::move(entry));
    }
    modal["files"] = std::move(files);
    modal["hasFiles"] = !selected->zips.empty();
    modal["filesLabel"] = translate(services, "workshop.files", "Files");
    data["unresolvedDeps"] = modal["unresolvedDeps"];
    data["modal"] = std::move(modal);
    data["modalOpen"] = true;
    std::vector<instances::InstalledPackageEntry> uninstall_entries = entries;
    Json uninstall_list = Json::array();
    for (const instances::InstalledPackageEntry &entry : uninstall_entries) {
      std::string name = entry.instance_id;
      const std::optional<instances::Edition> edition =
          find_config_edition(config, entry.instance_id);
      if (edition.has_value()) {
        name = edition->name;
      }
      Json item = Json::object();
      item["id"] = entry.instance_id;
      item["name"] = name;
      item["version"] = entry.version;
      item["selected"] = entry.instance_id == uninstall_target_;
      item["cls"] =
          entry.instance_id == uninstall_target_ ? "ws-target-selected-danger"
                                                 : "";
      uninstall_list.push_back(std::move(item));
    }
    if (!uninstall_list.empty() && uninstall_target_.empty()) {
      uninstall_target_ = uninstall_list[0].value("id", std::string());
      uninstall_list[0]["selected"] = true;
      uninstall_list[0]["cls"] = "ws-target-selected-danger";
    }
    data["uninstallList"] = std::move(uninstall_list);
    data["uninstallOpen"] = uninstall_open_;
    data["uninstallTitle"] = translate(services, "workshop.removeContentTitle",
                                       "REMOVE CONTENT");
    data["uninstallSubtitle"] = substitute(
        translate(services, "workshop.selectEditionToRemove",
                  "Select edition to remove \"{{name}}\""),
        "name", selected->name);
    data["removingLabel"] = translate(services, "workshop.removing", "Removing...");
    data["deletingLabel"] =
        translate(services, "workshop.deletingFiles", "Deleting installed files");
    data["removedLabel"] = translate(services, "workshop.removedSuccessfully",
                                     "Removed Successfully!");
    data["removalFailedLabel"] =
        translate(services, "workshop.removalFailed", "Removal Failed");
    data["uninstallBusy"] =
        job.active() && job.kind == "uninstall";
    data["uninstallDone"] =
        job.state == instances::WorkshopJobState::finished &&
        job.kind == "uninstall";
    data["uninstallError"] =
        job.state == instances::WorkshopJobState::failed &&
                job.kind == "uninstall"
            ? job.message
            : std::string();
    data["uninstallHasError"] =
        !data["uninstallError"].get<std::string>().empty();
    data["uninstallReady"] = uninstall_open_ &&
                             !data["uninstallBusy"].get<bool>() &&
                             !data["uninstallDone"].get<bool>() &&
                             !data["uninstallHasError"].get<bool>();
    data["uninstallClosable"] = !data["uninstallBusy"].get<bool>();

    Json targets = Json::array();
    if (install_open_ && !is_server_tab && !is_version_tab) {
      const std::vector<instances::Edition> editions =
          resolve_config_editions(config);
      for (const instances::Edition &edition : editions) {
        if (!instance_manager.is_installed(edition.id)) {
          continue;
        }
        if (!selected->required_versions.empty()) {
          const bool matches_any = std::any_of(
              selected->required_versions.begin(),
              selected->required_versions.end(),
              [&](const std::string &required) {
                return edition.id == required ||
                       edition.id.rfind(required + "_", 0) == 0;
              });
          if (!matches_any) {
            continue;
          }
        }
        Json item = Json::object();
        item["id"] = edition.id;
        item["name"] = edition.name;
        item["selected"] = edition.id == install_target_;
        item["cls"] = edition.id == install_target_ ? "ws-target-selected"
                                                    : "";
        targets.push_back(std::move(item));
      }
      if (!targets.empty() && install_target_.empty()) {
        install_target_ = targets[0].value("id", std::string());
        targets[0]["selected"] = true;
        targets[0]["cls"] = "ws-target-selected";
      }
    }
    data["installTargets"] = std::move(targets);
    data["installOpen"] = install_open_ && !is_server_tab && !is_version_tab;
    data["installTitle"] =
        translate(services, "workshop.installContentTitle",
                  "INSTALL CONTENT");
    data["installSubtitle"] = substitute(
        translate(services, "workshop.targetEdition",
                  "Target Edition for \"{{name}}\""),
        "name", selected->name);
    data["noTargetsLabel"] = translate(services, "workshop.noInstalledEditions",
                                       "No installed editions found");
    data["installingLabel"] =
        translate(services, "workshop.installing", "Installing...");
    data["installingDepsLabel"] = translate(services,
                                            "workshop.installingDependencies",
                                            "Installing dependencies...");
    data["downloadingLabel"] =
        translate(services, "workshop.downloadingAssets",
                  "Downloading and extracting assets");
    data["downloadingDepsLabel"] =
        translate(services, "workshop.downloadingDependencies",
                  "Downloading and extracting required dependencies");
    data["installedOkLabel"] = translate(services,
                                         "workshop.installedSuccessfully",
                                         "Installed Successfully!");
    data["pressKeyLabel"] = translate(services,
                                      "workshop.pressAnyKeyToContinue",
                                      "Press any key or click to continue");
    data["installFailedLabel"] = translate(services,
                                           "workshop.installationFailed",
                                           "Installation Failed");
    data["retryLabel"] = translate(services, "workshop.retry", "Retry");
    data["installBusy"] = job.active() && job.kind == "install";
    data["installDone"] =
        job.state == instances::WorkshopJobState::finished &&
        job.kind == "install";
    data["installError"] =
        job.state == instances::WorkshopJobState::failed &&
                job.kind == "install"
            ? job.message
            : std::string();
    data["installHasError"] = !data["installError"].get<std::string>().empty();
    data["installHasDeps"] = !selected->dependencies.empty();
    data["installHasNoDeps"] = selected->dependencies.empty();
    data["noTargets"] = data["installTargets"].empty();
    data["installReady"] = install_open_ && !is_server_tab &&
                           !is_version_tab && !data["installBusy"].get<bool>() &&
                           !data["installDone"].get<bool>() &&
                           !data["installHasError"].get<bool>();
    data["installClosable"] = !data["installBusy"].get<bool>();
    data["depsTitle"] = translate(services, "workshop.dependenciesRequired",
                                  "Dependencies Required");
    data["depsSubtitle"] = translate(services,
                                     "workshop.dependenciesRequiredDesc",
                                     "This package requires the following to "
                                     "be installed first");
    data["depsNote"] = translate(services, "workshop.dependenciesAutoInstall",
                                 "These will be installed automatically "
                                 "before the main package.");
    data["cancelLabel"] = translate(services, "common.cancel", "Cancel");
  }

  return data;
}

bool WorkshopView::action(std::string_view name, UiServices &services) {
  if (services.workshop == nullptr || services.config == nullptr) {
    return false;
  }
  const std::string action(name);
  const std::vector<std::string> parts = split_action(action);
  const std::string &verb = parts[0];
  const auto confirm_install = [&]() {
    const instances::WorkshopCatalog catalog = services.workshop->catalog();
    const instances::WorkshopPackage *selected = nullptr;
    for (const instances::WorkshopPackage &package : catalog.packages) {
      if (package.id == selected_id_) {
        selected = &package;
        break;
      }
    }
    if (selected == nullptr || selected->zips.empty() ||
        install_target_.empty()) {
      return;
    }
    std::vector<instances::WorkshopInstallStep> steps;
    for (const std::string &dependency_id : selected->dependencies) {
      for (const instances::WorkshopPackage &package : catalog.packages) {
        if (package.id != dependency_id || package.zips.empty()) {
          continue;
        }
        instances::WorkshopInstallStep step;
        step.package_id = package.id;
        step.instance_id = install_target_;
        step.zips = package.zips;
        step.version = package.version;
        step.label = package.name;
        steps.push_back(std::move(step));
        break;
      }
    }
    instances::WorkshopInstallStep step;
    step.package_id = selected->id;
    step.instance_id = install_target_;
    step.zips = selected->zips;
    step.version = selected->version;
    step.label = selected->name;
    steps.push_back(std::move(step));
    if (services.workshop->enqueue_installs(steps)) {
      pending_queue_ = steps;
    } else if (services.notify != nullptr) {
      services.notify(translate(services, "workshop.install", "INSTALL"),
                      translate(services, "workshop.installationRunning",
                                "An installation is already running"),
                      ToastVariant::Error, "");
    }
  };
  const auto confirm_uninstall = [&]() {
    const std::string instance_id = uninstall_target_;
    if (instance_id.empty()) {
      return;
    }
    if (tab_ == "Versions") {
      config::AppConfig &config = services.config->data();
      if (config.custom_editions.has_value()) {
        config.custom_editions->erase(
            std::remove_if(config.custom_editions->begin(),
                           config.custom_editions->end(),
                           [&](const config::CustomEdition &edition) {
                             return edition.id == selected_id_;
                           }),
            config.custom_editions->end());
        services.config->save();
      }
      const instances::InstanceManager instance_manager(config);
      instance_manager.delete_instance(instance_id);
      uninstall_open_ = false;
      selected_id_.clear();
      if (services.focus_scope) {
        services.focus_scope("");
      }
      if (services.notify != nullptr) {
        services.notify(translate(services, "workshop.removedSuccessfully",
                                  "Removed Successfully!"),
                        "", ToastVariant::Update, "");
      }
      return;
    }
    std::string label = selected_id_;
    const instances::WorkshopCatalog catalog = services.workshop->catalog();
    for (const instances::WorkshopPackage &package : catalog.packages) {
      if (package.id == selected_id_) {
        label = package.name;
        break;
      }
    }
    if (!services.workshop->enqueue_uninstall(instance_id, selected_id_,
                                              label) &&
        services.notify != nullptr) {
      services.notify(translate(services, "workshop.remove", "REMOVE"),
                      translate(services, "workshop.installationRunning",
                                "An installation is already running"),
                      ToastVariant::Error, "");
    }
  };

  if (verb == "workshop.tab" && parts.size() >= 2) {
    if (tab_ != parts[1]) {
      tab_ = parts[1];
      search_.clear();
      server_category_ = "all";
      selected_id_.clear();
      if (services.i18n != nullptr && tab_ == "Search" && services.focus_element) {
        services.focus_element("workshop-search");
      }
    }
    return true;
  }
  if (verb == "workshop.serverCategory" && parts.size() >= 2) {
    server_category_ = parts[1];
    return true;
  }
  if (verb == "workshop.search") {
    if (services.read_text_input) {
      search_ = services.read_text_input();
    }
    return true;
  }
  if (verb == "workshop.search.clear") {
    search_.clear();
    if (services.focus_element) {
      services.focus_element("workshop-search");
    }
    return true;
  }
  if (verb == "workshop.open" && parts.size() >= 2) {
    selected_id_ = parts[1];
    install_target_.clear();
    uninstall_target_.clear();
    deps_open_ = false;
    install_open_ = false;
    uninstall_open_ = false;
    if (services.focus_scope) {
      services.focus_scope("workshop-modal");
    }
    return true;
  }
  if (action == "workshop.modal.block") {
    return true;
  }
  if (action == "workshop.close") {
    if (deps_open_) {
      deps_open_ = false;
      if (services.focus_scope) {
        services.focus_scope("workshop-modal");
      }
    } else if (install_open_) {
      if (services.workshop->job().active()) {
        return true;
      }
      install_open_ = false;
      pending_queue_.clear();
      services.workshop->clear_job();
      if (services.focus_scope) {
        services.focus_scope("workshop-modal");
      }
    } else if (uninstall_open_) {
      if (services.workshop->job().active()) {
        return true;
      }
      uninstall_open_ = false;
      services.workshop->clear_job();
      if (services.focus_scope) {
        services.focus_scope("workshop-modal");
      }
    } else if (!selected_id_.empty()) {
      selected_id_.clear();
      if (services.focus_scope) {
        services.focus_scope("");
      }
      if (services.audio != nullptr) {
        services.audio->play_back();
      }
    }
    return true;
  }
  if (verb == "workshop.install.open") {
    const instances::WorkshopCatalog catalog = services.workshop->catalog();
    const std::vector<instances::InstalledPackageEntry> installed_entries =
        services.workshop->installed();
    const instances::WorkshopPackage *selected = nullptr;
    for (const instances::WorkshopPackage &package : catalog.packages) {
      if (package.id == selected_id_) {
        selected = &package;
        break;
      }
    }
    bool unresolved = false;
    if (selected != nullptr) {
      for (const std::string &dependency_id : selected->dependencies) {
        const bool dependency_installed =
            std::any_of(installed_entries.begin(), installed_entries.end(),
                        [&](const instances::InstalledPackageEntry &entry) {
                          return entry.package_id == dependency_id;
                        });
        if (!dependency_installed) {
          unresolved = true;
          break;
        }
      }
    }
    if (unresolved) {
      deps_open_ = true;
      install_open_ = false;
      if (services.focus_scope) {
        services.focus_scope("workshop-deps");
      }
    } else {
      deps_open_ = false;
      install_open_ = true;
      if (services.focus_scope) {
        services.focus_scope("workshop-install");
      }
    }
    return true;
  }
  if (action == "workshop.deps.confirm") {
    deps_open_ = false;
    install_open_ = true;
    if (services.focus_scope) {
      services.focus_scope("workshop-install");
    }
    return true;
  }
  if (action == "workshop.deps.cancel") {
    deps_open_ = false;
    if (services.focus_scope) {
      services.focus_scope("workshop-modal");
    }
    return true;
  }
  if (verb == "workshop.install.target" && parts.size() >= 2) {
    install_target_ = parts[1];
    confirm_install();
    return true;
  }
  if (action == "workshop.install.confirm") {
    confirm_install();
    return true;
  }
  if (action == "workshop.install.retry") {
    if (!pending_queue_.empty() &&
        services.workshop->enqueue_installs(pending_queue_)) {
      return true;
    }
    return true;
  }
  if (action == "workshop.install.close") {
    install_open_ = false;
    pending_queue_.clear();
    services.workshop->clear_job();
    if (services.focus_scope) {
      services.focus_scope("workshop-modal");
    }
    return true;
  }
  if (verb == "workshop.uninstall.open") {
    uninstall_open_ = true;
    uninstall_target_.clear();
    if (services.focus_scope) {
      services.focus_scope("workshop-uninstall");
    }
    return true;
  }
  if (verb == "workshop.uninstall.target" && parts.size() >= 2) {
    uninstall_target_ = parts[1];
    confirm_uninstall();
    return true;
  }
  if (action == "workshop.uninstall.confirm") {
    confirm_uninstall();
    return true;
  }
  if (action == "workshop.uninstall.close") {
    uninstall_open_ = false;
    services.workshop->clear_job();
    if (services.focus_scope) {
      services.focus_scope("workshop-modal");
    }
    return true;
  }
  if (verb == "workshop.server.toggle" && parts.size() >= 2) {
    const instances::WorkshopCatalog catalog = services.workshop->catalog();
    const instances::WorkshopPackage *selected = nullptr;
    for (const instances::WorkshopPackage &package : catalog.servers) {
      if (package.id == parts[1]) {
        selected = &package;
        break;
      }
    }
    if (selected == nullptr || selected->server_address.empty()) {
      return true;
    }
    config::AppConfig &config = services.config->data();
    std::vector<config::McServer> servers =
        config.saved_servers.value_or(std::vector<config::McServer>{});
    const auto found = std::find_if(
        servers.begin(), servers.end(),
        [&](const config::McServer &server) {
          return server.ip == selected->server_address;
        });
    if (found != servers.end()) {
      servers.erase(found);
    } else {
      servers.push_back(config::McServer{selected->name,
                                         selected->server_address, 25565});
    }
    config.saved_servers = servers;
    services.config->save();
    return true;
  }
  if (action == "workshop.updateAll" || action == "workshop.reinstallAll") {
    const instances::WorkshopCatalog catalog = services.workshop->catalog();
    const std::vector<instances::InstalledPackageEntry> installed_entries =
        services.workshop->installed();
    std::vector<instances::WorkshopInstallStep> steps;
    for (const instances::WorkshopPackage &package : catalog.packages) {
      if (package.zips.empty()) {
        continue;
      }
      if (action == "workshop.updateAll") {
        bool installed = false;
        bool update = false;
        for (const instances::InstalledPackageEntry &entry :
             installed_entries) {
          if (entry.package_id != package.id) {
            continue;
          }
          installed = true;
          if (entry.version != package.version) {
            update = true;
          }
        }
        if (!installed || !update) {
          continue;
        }
      } else {
        const bool installed = std::any_of(
            installed_entries.begin(), installed_entries.end(),
            [&](const instances::InstalledPackageEntry &entry) {
              return entry.package_id == package.id;
            });
        if (!installed) {
          continue;
        }
      }
      for (const instances::InstalledPackageEntry &entry : installed_entries) {
        if (entry.package_id != package.id) {
          continue;
        }
        instances::WorkshopInstallStep step;
        step.package_id = package.id;
        step.instance_id = entry.instance_id;
        step.zips = package.zips;
        step.version = package.version;
        step.label = package.name;
        steps.push_back(std::move(step));
      }
    }
    if (!steps.empty()) {
      services.workshop->enqueue_installs(steps);
    }
    return true;
  }
  if (action == "workshop.version.add") {
    const instances::WorkshopCatalog catalog = services.workshop->catalog();
    for (const instances::WorkshopPackage &package : catalog.versions) {
      if (package.id != selected_id_) {
        continue;
      }
      const config::AppConfig &config = services.config->data();
      bool already = false;
      if (config.custom_editions.has_value()) {
        for (const config::CustomEdition &edition : *config.custom_editions) {
          if (edition.id == package.id || edition.url == package.url) {
            already = true;
            break;
          }
        }
      }
      if (!already) {
        services.workshop->add_version(config, package);
      }
      break;
    }
    return true;
  }
  return false;
}

bool WorkshopView::on_escape(UiServices &services) {
  if (deps_open_) {
    deps_open_ = false;
    if (services.focus_scope) {
      services.focus_scope("workshop-modal");
    }
    if (services.audio != nullptr) {
      services.audio->play_back();
    }
    return true;
  }
  if (install_open_) {
    const instances::WorkshopJobSnapshot job =
        services.workshop != nullptr ? services.workshop->job()
                                     : instances::WorkshopJobSnapshot{};
    if (job.active()) {
      return true;
    }
    install_open_ = false;
    pending_queue_.clear();
    if (services.workshop != nullptr) {
      services.workshop->clear_job();
    }
    if (services.focus_scope) {
      services.focus_scope("workshop-modal");
    }
    if (services.audio != nullptr) {
      services.audio->play_back();
    }
    return true;
  }
  if (uninstall_open_) {
    const instances::WorkshopJobSnapshot job =
        services.workshop != nullptr ? services.workshop->job()
                                     : instances::WorkshopJobSnapshot{};
    if (job.active()) {
      return true;
    }
    uninstall_open_ = false;
    if (services.workshop != nullptr) {
      services.workshop->clear_job();
    }
    if (services.focus_scope) {
      services.focus_scope("workshop-modal");
    }
    if (services.audio != nullptr) {
      services.audio->play_back();
    }
    return true;
  }
  if (!selected_id_.empty()) {
    selected_id_.clear();
    if (services.focus_scope) {
      services.focus_scope("");
    }
    if (services.audio != nullptr) {
      services.audio->play_back();
    }
    return true;
  }
  if (services.audio != nullptr) {
    services.audio->play_back();
  }
  if (services.navigate) {
    services.navigate("home");
  }
  return true;
}
} // namespace emerald::ui
