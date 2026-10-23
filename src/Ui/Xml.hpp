#pragma once
#include "Ui/Element.hpp"
#include "Ui/Style.hpp"
#include <cstdint>
#include <filesystem>
#include <map>
#include <memory>
#include <pugixml.hpp>
#include <set>
#include <string>
#include <vector>
namespace emerald::ui {
class DataContext;
struct TooltipDefinition {
  std::string icon;
  std::string label;
};

struct ViewDefinition {
  std::string id;
  std::string base;
  std::vector<TooltipDefinition> tooltips;
};

class UiDocument {
public:
  bool load(const std::filesystem::path &path);
  bool load_directory(const std::filesystem::path &directory);
  bool load_from_string(std::string_view xml,
                        const std::filesystem::path &base_dir);

  const StyleSheet &styles() const { return styles_; }
  const std::vector<ViewDefinition> &views() const { return views_; }
  const ViewDefinition *find_view(const std::string &id) const;
  bool has_view(const std::string &id) const;
  bool has_template(const std::string &name) const;
  const std::vector<std::string> &errors() const { return errors_; }
  const std::map<std::string, pugi::xml_node> &templates() const {
    return templates_;
  }
  const std::map<std::string, pugi::xml_node> &view_nodes() const {
    return view_nodes_;
  }

  uint64_t revision() const { return revision_; }

private:
  bool process_file(const std::filesystem::path &path,
                    std::set<std::string> &visited, std::size_t depth);
  void collect(pugi::xml_node root);
  std::vector<std::unique_ptr<pugi::xml_document>> documents_;
  std::map<std::string, pugi::xml_node> templates_;
  std::vector<ViewDefinition> views_;
  std::map<std::string, pugi::xml_node> view_nodes_;
  StyleSheet styles_;
  std::vector<std::string> errors_;
  std::set<std::string> loaded_;
  uint64_t revision_ = 0;
};

class ViewBuilder {
public:
  ViewBuilder(const UiDocument &document, ElementRegistry &registry);
  ElementPtr build(const std::string &view_id, DataContext &context) const;

private:
  ElementPtr build_node(const pugi::xml_node &node, DataContext &context,
                        std::size_t depth) const;
  ElementPtr build_element(const pugi::xml_node &node, DataContext &context,
                           std::size_t depth) const;
  ElementPtr instantiate_template(const std::string &name,
                                  const pugi::xml_node &use_node,
                                  DataContext &context,
                                  std::size_t depth) const;
  void apply_styles(Element &element, const pugi::xml_node &node,
                    const std::string &inline_style,
                    const std::map<std::string, std::string> &style_attributes) const;
  const UiDocument &document_;
  ElementRegistry &registry_;
};

} // namespace emerald::ui