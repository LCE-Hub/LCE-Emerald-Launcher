#include "Ui/Xml.hpp"
#include "Core/Log.hpp"
#include "Ui/Binding.hpp"
#include <sstream>
namespace emerald::ui {
namespace {
constexpr std::size_t kMaxDepth = 16;
std::vector<std::string> split_classes(const std::string &text) {
  std::vector<std::string> classes;
  std::istringstream stream(text);
  std::string token;
  while (stream >> token) {
    classes.push_back(token);
  }
  return classes;
}

std::string trimmed(std::string_view text) {
  while (!text.empty() && (text.front() == ' ' || text.front() == '\t' ||
                           text.front() == '\n' || text.front() == '\r')) {
    text.remove_prefix(1);
  }
  while (!text.empty() && (text.back() == ' ' || text.back() == '\t' ||
                           text.back() == '\n' || text.back() == '\r')) {
    text.remove_suffix(1);
  }
  return std::string(text);
}

bool is_path_expression(std::string_view value, std::string &path) {
  const std::string text = trimmed(value);
  if (text.size() < 4 || !text.starts_with("{{") || !text.ends_with("}}")) {
    return false;
  }
  path = trimmed(text.substr(2, text.size() - 4));
  return true;
}

bool is_style_attribute(const std::string &name) {
  return name == "width" || name == "height" || name == "max-height" ||
         name == "padding" || name == "gap" || name == "margin" ||
         name == "margin-top" || name == "margin-bottom" ||
         name == "background" || name == "color" || name == "font-family" ||
         name == "font-size" || name == "align" || name == "background-image" ||
         name == "flex" || name == "border-width" || name == "border-image" ||
         name == "letter-spacing" || name == "line-height" ||
         name == "font-weight" || name == "text-align";
}
} // namespace

bool UiDocument::load(const std::filesystem::path &path) {
  std::set<std::string> visited;
  return process_file(path, visited, 0);
}

bool UiDocument::load_directory(const std::filesystem::path &directory) {
  std::set<std::string> visited;
  std::error_code error;
  for (const std::filesystem::directory_entry &entry :
       std::filesystem::directory_iterator(directory, error)) {
    if (!entry.is_regular_file() || entry.path().extension() != ".xml") {
      continue;
    }
    process_file(entry.path(), visited, 0);
  }
  return errors_.empty();
}

bool UiDocument::load_from_string(std::string_view xml,
                                  const std::filesystem::path &base_dir) {
  auto document = std::make_unique<pugi::xml_document>();
  const pugi::xml_parse_result result =
      document->load_buffer(xml.data(), xml.size());
  if (!result) {
    errors_.push_back(std::string{"xml parse error: "} + result.description());
    return false;
  }
  const pugi::xml_node root = document->child("ui");
  if (!root) {
    errors_.push_back("missing <ui> root");
    return false;
  }
  documents_.push_back(std::move(document));
  collect(root);
  (void)base_dir;
  ++revision_;
  return errors_.empty();
}

void UiDocument::collect(pugi::xml_node root) {
  for (const pugi::xml_node child : root.children()) {
    const std::string name = child.name();
    if (name == "style") {
      for (const StyleRule &rule : parse_style_block(child.text().get())) {
        styles_.rules.push_back(rule);
      }
    } else if (name == "template") {
      templates_[child.attribute("name").as_string()] = child;
    } else if (name == "view") {
      ViewDefinition definition;
      definition.id = child.attribute("id").as_string();
      definition.base = child.attribute("base").as_string();
      for (const pugi::xml_node tooltip : child.children("tooltip")) {
        TooltipDefinition entry;
        entry.icon = tooltip.attribute("icon").as_string();
        entry.label = trimmed(tooltip.text().get());
        definition.tooltips.push_back(std::move(entry));
      }
      views_.push_back(definition);
      view_nodes_[definition.id] = child;
    }
  }
}

bool UiDocument::process_file(const std::filesystem::path &path,
                              std::set<std::string> &visited,
                              std::size_t depth) {
  if (depth > kMaxDepth) {
    errors_.push_back("import depth exceeded at " + path.string());
    return false;
  }
  std::error_code error;
  const std::string key =
      std::filesystem::weakly_canonical(path, error).string();
  if (visited.contains(key)) {
    errors_.push_back("import cycle at " + key);
    return false;
  }
  if (loaded_.contains(key)) {
    return true;
  }
  visited.insert(key);
  auto document = std::make_unique<pugi::xml_document>();
  const pugi::xml_parse_result result = document->load_file(path.c_str());
  if (!result) {
    errors_.push_back(path.string() + ": " + result.description());
    return false;
  }
  const pugi::xml_node root = document->child("ui");
  if (!root) {
    errors_.push_back(path.string() + ": missing <ui> root");
    return false;
  }
  documents_.push_back(std::move(document));
  collect(root);
  const std::filesystem::path base_dir = path.parent_path();
  for (const pugi::xml_node child : root.children("import")) {
    const std::string href = child.attribute("href").as_string();
    if (!href.empty()) {
      if (!process_file(base_dir / href, visited, depth + 1)) {
        return false;
      }
    }
  }
  visited.erase(key);
  loaded_.insert(key);
  ++revision_;
  return errors_.empty();
}

bool UiDocument::has_view(const std::string &id) const {
  return view_nodes_.contains(id);
}

const ViewDefinition *UiDocument::find_view(const std::string &id) const {
  for (const ViewDefinition &definition : views_) {
    if (definition.id == id) {
      return &definition;
    }
  }
  return nullptr;
}

bool UiDocument::has_template(const std::string &name) const {
  return templates_.contains(name);
}

ViewBuilder::ViewBuilder(const UiDocument &document, ElementRegistry &registry)
    : document_(document), registry_(registry) {}

ElementPtr ViewBuilder::build(const std::string &view_id,
                              DataContext &context) const {
  const auto found = document_.view_nodes().find(view_id);
  if (found == document_.view_nodes().end()) {
    core::error(std::string{"ui: unknown view "} + view_id);
    return nullptr;
  }
  ElementPtr root = registry_.create("column");
  if (root == nullptr) {
    return nullptr;
  }
  root->set_id(view_id);
  ComputedStyle root_style;
  root_style.align = Align::Start;
  root->set_style(root_style);
  for (const pugi::xml_node child : found->second.children()) {
    ElementPtr element = build_node(child, context, 0);
    if (element != nullptr) {
      root->add_child(std::move(element));
    }
  }
  return root;
}

ElementPtr ViewBuilder::build_node(const pugi::xml_node &node,
                                   DataContext &context,
                                   std::size_t depth) const {
  if (node.type() != pugi::node_element) {
    return nullptr;
  }
  const std::string tag = node.name();
  if (tag == "style" || tag == "import" || tag == "template" ||
      tag == "tooltip") {
    return nullptr;
  }

  if (const pugi::xml_attribute condition = node.attribute("if")) {
    std::string path;
    if (is_path_expression(condition.value(), path) && !context.truthy(path)) {
      return nullptr;
    }
  }

  if (const pugi::xml_attribute foreach_attr = node.attribute("foreach")) {
    std::string path;
    if (!is_path_expression(foreach_attr.value(), path)) {
      path = foreach_attr.value();
    }
    const Json *items = context.lookup(path);
    ElementPtr wrapper = registry_.create("column");
    ComputedStyle wrapper_style;
    wrapper_style.gap = node.attribute("gap").as_float(0.0F);
    wrapper->set_style(wrapper_style);
    if (const pugi::xml_attribute wrapper_id = node.attribute("id")) {
      wrapper->set_id(wrapper_id.as_string());
    }

    if (items != nullptr && items->is_array()) {
      const std::string binding = node.attribute("as").as_string();
      std::size_t index = 0;
      for (const Json &item : *items) {
        Json scope = Json::object();
        scope[binding.empty() ? "item" : binding] = item;
        scope["index"] = index;
        context.push_scope(scope);
        ElementPtr element = build_element(node, context, depth + 1);
        context.pop_scope();
        if (element != nullptr) {
          wrapper->add_child(std::move(element));
        }
        ++index;
      }
    }
    return wrapper;
  }

  return build_element(node, context, depth);
}

ElementPtr ViewBuilder::build_element(const pugi::xml_node &node,
                                      DataContext &context,
                                      std::size_t depth) const {
  const std::string tag = node.name();
  if (tag == "use") {
    const std::string template_name = node.attribute("template").as_string();
    return instantiate_template(template_name, node, context, depth + 1);
  }
  if (tag == "slot") {
    return nullptr;
  }

  ElementPtr element = registry_.create(tag);
  if (element == nullptr) {
    core::error(std::string{"ui: unknown element <"} + tag + ">");
    return nullptr;
  }

  StringMap attributes;
  std::vector<std::string> classes;
  for (const pugi::xml_attribute attribute : node.attributes()) {
    const std::string name = attribute.name();
    if (name == "foreach" || name == "if" || name == "as") {
      continue;
    }
    std::string value;
    if (const char *raw = attribute.as_string(nullptr); raw != nullptr) {
      value = context.resolve(raw);
    }
    if (name == "id") {
      element->set_id(value);
    } else if (name == "class") {
      classes = split_classes(value);
    } else if (name == "onclick") {
      element->set_click_handler(value);
    } else if (!is_style_attribute(name)) {
      attributes[name] = value;
    }
  }
  element->set_attributes(std::move(attributes));
  element->set_classes(std::move(classes));
  apply_styles(*element, node);
  for (const pugi::xml_node child : node.children()) {
    ElementPtr child_element = build_node(child, context, depth + 1);
    if (child_element != nullptr) {
      element->add_child(std::move(child_element));
    }
  }
  return element;
}

ElementPtr ViewBuilder::instantiate_template(const std::string &name,
                                             const pugi::xml_node &use_node,
                                             DataContext &context,
                                             std::size_t depth) const {
  const auto found = document_.templates().find(name);
  if (found == document_.templates().end()) {
    core::error(std::string{"ui: unknown template "} + name);
    return nullptr;
  }

  Json scope = Json::object();
  for (const pugi::xml_attribute attribute : use_node.attributes()) {
    if (std::string(attribute.name()) == "template") {
      continue;
    }
    if (const char *raw = attribute.as_string(nullptr); raw != nullptr) {
      scope[attribute.name()] = context.resolve(raw);
    }
  }
  context.push_scope(scope);
  ElementPtr result = nullptr;
  for (const pugi::xml_node child : found->second.children()) {
    if (child.type() != pugi::node_element) {
      continue;
    }
    ElementPtr element = build_element(child, context, depth + 1);
    if (element != nullptr && result == nullptr) {
      result = std::move(element);
    }
  }

  context.pop_scope();
  return result;
}

void ViewBuilder::apply_styles(Element &element,
                               const pugi::xml_node &node) const {
  const auto build = [&](bool hovered) {
    ComputedStyle style;
    style = document_.styles().applyTo(style, node.name(), element.id(),
                                       element.classes(), hovered);
    for (const pugi::xml_attribute attribute : node.attributes()) {
      const std::string name = attribute.name();
      const std::string value = attribute.as_string();
      if (name == "style") {
        style = ComputedStyle::merge(style, parse_inline_style(value));
      } else if (is_style_attribute(name)) {
        apply_style_property(style, name, value);
      }
    }
    return style;
  };

  element.set_style(build(false));
  ComputedStyle hover = build(true);
  if (hover.hovered) {
    element.set_hover_style(std::move(hover));
  }
}
} // namespace emerald::ui