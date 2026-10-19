set(EMERALD_GENERATED_DIR "${CMAKE_BINARY_DIR}/generated")
file(MAKE_DIRECTORY "${EMERALD_GENERATED_DIR}")
set(EMERALD_EMBED_OUTPUT "${EMERALD_GENERATED_DIR}/EmbeddedAssets.cpp")
add_executable(emerald_embed "${CMAKE_SOURCE_DIR}/tools/EmbedAssets.cpp")
set_target_properties(emerald_embed PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/tools"
)

file(GLOB_RECURSE EMERALD_ASSET_FILES CONFIGURE_DEPENDS
    "${EMERALD_PUBLIC_DIR}/*"
    "${EMERALD_RESOURCE_DIR}/*"
    "${EMERALD_UI_DOCS_DIR}/*"
)

add_custom_command(
    OUTPUT "${EMERALD_EMBED_OUTPUT}"
    COMMAND emerald_embed "${EMERALD_EMBED_OUTPUT}"
            public "${EMERALD_PUBLIC_DIR}"
            resources "${EMERALD_RESOURCE_DIR}"
            UiDocs "${EMERALD_UI_DOCS_DIR}"
    DEPENDS emerald_embed ${EMERALD_ASSET_FILES}
    COMMENT "Embedding public/, resources/ and UiDocs/ into the executable"
    VERBATIM
)

set(EMERALD_CORE_SOURCES
    Core/EmbeddedAssets.cpp
    ${EMERALD_EMBED_OUTPUT}
    Core/Fs.cpp
    Core/Log.cpp
    Core/Paths.cpp
    Config/ConfigSchema.cpp
    Config/ConfigStore.cpp
    Platform/Platform.cpp
    Platform/Process.cpp
    Launch/Servers.cpp
    Launch/GoldMapper.cpp
    Launch/LaunchPlan.cpp
    Launch/GameLauncher.cpp
    Launch/MacosRuntime.cpp
    Launch/LaunchService.cpp
    Instances/InstanceManager.cpp
    Instances/ArgsSchema.cpp
    Instances/Downloader.cpp
    Instances/Installer.cpp
    Instances/Dlc.cpp
    Instances/Backup.cpp
    Instances/Editions.cpp
    Instances/DownloadManager.cpp
    Instances/InstanceSync.cpp
    Instances/Runners.cpp
    Instances/Workshop.cpp
    Net/HttpClient.cpp
    Playtime/PlaytimeStore.cpp
    State/StateStore.cpp
    Migration/Migration.cpp
)

if(WIN32)
    list(APPEND EMERALD_CORE_SOURCES Migration/LeveldbStorage.cpp)
else()
    list(APPEND EMERALD_CORE_SOURCES Migration/WebkitStorage.cpp)
endif()
add_library(emerald_core STATIC ${EMERALD_CORE_SOURCES})
target_include_directories(emerald_core
    PUBLIC
        "${CMAKE_CURRENT_SOURCE_DIR}"
)

target_link_libraries(emerald_core
    PUBLIC
        SDL3::SDL3
        nlohmann_json::nlohmann_json
)

if(NOT WIN32)
    target_link_libraries(emerald_core PRIVATE SQLite::SQLite3)
endif()
target_link_libraries(emerald_core
    PRIVATE
        CURL::libcurl
        PkgConfig::EMERALD_ARCHIVE
)

emerald_apply_warnings(emerald_core)
find_package(Threads REQUIRED)
add_library(emerald_miniaudio STATIC Audio/MiniaudioImpl.cpp)
target_include_directories(emerald_miniaudio SYSTEM PUBLIC "${EMERALD_MINIAUDIO_INCLUDE_DIR}")
if(EXISTS "${EMERALD_MINIAUDIO_INCLUDE_DIR}/extras/stb_vorbis.c")
    target_compile_definitions(emerald_miniaudio PRIVATE EMERALD_MINIAUDIO_VORBIS)
endif()
if(WIN32)
    target_link_libraries(emerald_miniaudio PUBLIC winmm ole32 user32)
elseif(APPLE)
    target_link_libraries(emerald_miniaudio PUBLIC
        Threads::Threads
        "-framework CoreFoundation"
        "-framework CoreAudio"
        "-framework AudioToolbox"
    )
else()
    target_link_libraries(emerald_miniaudio PUBLIC
        Threads::Threads
        ${CMAKE_DL_LIBS}
        m
    )
endif()

add_library(emerald_audio STATIC
    Audio/AudioEngine.cpp
)

target_link_libraries(emerald_audio
    PUBLIC
        emerald_core
    PRIVATE
        emerald_miniaudio
)

emerald_apply_warnings(emerald_audio)
set(EMERALD_UI_SOURCES
    Ui/Style.cpp
    Ui/Element.cpp
    Ui/EditionResolver.cpp
    Ui/Binding.cpp
    Ui/I18n.cpp
    Ui/Xml.cpp
    Ui/Handlers.cpp
    Ui/UiSystem.cpp
    Ui/Render/TextureCache.cpp
    Ui/Render/SvgRaster.cpp
    Ui/Render/FontCache.cpp
    Ui/Render/Panorama.cpp
    Ui/Render/SdlRenderer.cpp
    Ui/Views/HomeView.cpp
    Ui/Views/SettingsView.cpp
    Ui/Views/VersionsView.cpp
    Ui/Views/CreditsView.cpp
)

add_library(emerald_ui STATIC ${EMERALD_UI_SOURCES})
target_include_directories(emerald_ui PRIVATE "${CMAKE_SOURCE_DIR}/third_party/nanosvg")
target_link_libraries(emerald_ui
    PUBLIC
        emerald_core
        emerald_audio
    PRIVATE
        SDL3::SDL3
        SDL3_ttf::SDL3_ttf
        pugixml::pugixml
        emerald_stb
)

emerald_apply_warnings(emerald_ui)
add_executable(emerald
    WIN32
    MACOSX_BUNDLE
    Main.cpp
    App/Application.cpp
)

target_link_libraries(emerald
    PRIVATE
        emerald_ui
        emerald_integrations
        discord_ipc_cpp
)

emerald_apply_warnings(emerald)
set_target_properties(emerald PROPERTIES
    MACOSX_BUNDLE_BUNDLE_NAME "Emerald Legacy Launcher"
    MACOSX_BUNDLE_GUI_IDENTIFIER "com.emerald.legacy"
    MACOSX_BUNDLE_BUNDLE_VERSION "${PROJECT_VERSION}"
    MACOSX_BUNDLE_SHORT_VERSION_STRING "${PROJECT_VERSION}"
    OUTPUT_NAME "emerald-legacy-launcher"
)
set(EMERALD_INTEGRATIONS_SOURCES
    Integrations/DiscordRpc.cpp
)
add_library(emerald_integrations STATIC ${EMERALD_INTEGRATIONS_SOURCES})
target_link_libraries(emerald_integrations
    PUBLIC
        emerald_core
    PRIVATE
        CURL::libcurl
)

emerald_apply_warnings(emerald_integrations)
add_subdirectory(discord_ipc_cpp)
target_include_directories(emerald_integrations PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}/discord_ipc_cpp/include")
