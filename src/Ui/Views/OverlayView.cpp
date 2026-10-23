#include "Ui/Views/OverlayView.hpp"
#include "Ui/EditionResolver.hpp"
#include "Ui/I18n.hpp"
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <optional>
namespace emerald::ui {
namespace {
const char *toast_icon_for(ToastVariant variant) {
  switch (variant) {
  case ToastVariant::Update:
    return "/images/Update_Icon.png";
  case ToastVariant::Steam:
    return "/images/steam.png";
  case ToastVariant::Error:
    break;
  }
  return "/images/Error_Cross_Icon.png";
}

std::string percent_string(double percent) {
  char buffer[16];
  std::snprintf(buffer, sizeof(buffer), "%.1f", percent);
  return buffer;
}
} // namespace

bool OverlayView::is_remote_source(const std::string &source) {
  return source.rfind("http", 0) == 0 || source.rfind("data:", 0) == 0 ||
         source.rfind("blob:", 0) == 0;
}

std::string OverlayView::icon_for_edition(
    const std::optional<instances::Edition> &edition) {
  if (edition.has_value()) {
    if (!edition->logo.empty() && !is_remote_source(edition->logo)) {
      return edition->logo;
    }
    if (!edition->title_image.empty() &&
        !is_remote_source(edition->title_image)) {
      return edition->title_image;
    }
  }
  return "/images/Download_Icon.png";
}

Json OverlayView::data(const UiServices &services) const {
  Json data = Json::object();
  data["downloads"] = Json::array();
  data["toasts"] = Json::array();
  data["showDownloads"] = false;
  data["showToasts"] = false;
  data["overlayVisible"] = false;

  const auto translate = [&services](const char *key, const char *fallback) {
    return services.i18n != nullptr ? services.i18n->translate(key)
                                    : std::string(fallback);
  };

  if (services.downloads != nullptr) {
    for (const std::string &id : services.downloads->active_ids()) {
      const instances::DownloadSnapshot snapshot =
          services.downloads->snapshot(id);
      std::optional<instances::Edition> edition;
      if (services.config != nullptr) {
        edition = find_config_edition(services.config->data(), id);
      }
      const double percent = std::clamp(snapshot.percent, 0.0, 100.0);
      const int shown = static_cast<int>(std::floor(percent));
      const std::string name =
          edition.has_value()
              ? edition->name
              : id.rfind("runner_", 0) == 0
                    ? id.substr(7)
                    : translate("download.gameFiles", "Game Files");
      Json entry = Json::object();
      entry["id"] = id;
      entry["name"] = name;
      entry["icon"] = icon_for_edition(edition);
      entry["percent"] = percent_string(percent);
      entry["percentText"] = std::to_string(shown);
      data["downloads"].push_back(std::move(entry));
    }
    data["showDownloads"] = !data["downloads"].empty();
  }

  if (services.notifications != nullptr) {
    const std::string error_title =
        translate("common.error", "Error");
    for (const Toast &toast : services.notifications->toasts()) {
      Json entry = Json::object();
      entry["id"] = toast.id;
      entry["title"] =
          toast.title.empty() ? error_title : toast.title;
      entry["message"] = toast.message;
      entry["icon"] = toast_icon_for(toast.variant);
      data["toasts"].push_back(std::move(entry));
    }
    data["showToasts"] = !data["toasts"].empty();
  }

  data["overlayVisible"] =
      data["showDownloads"].get<bool>() || data["showToasts"].get<bool>();
  return data;
}
} // namespace emerald::ui
