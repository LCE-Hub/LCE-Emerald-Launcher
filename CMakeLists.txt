cmake_minimum_required(VERSION 3.24)
project(EmeraldLegacyLauncher
    VERSION 2.0.0
    DESCRIPTION "LCE Emerald Launcher" #neo: very descriptive ikr
    LANGUAGES CXX
)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)
option(EMERALD_USE_SYSTEM_DEPS "Prefer system-installed dependencies over FetchContent" ON)
option(EMERALD_WARNINGS_AS_ERRORS "Treat compiler warnings as errors" OFF)
if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
    set(CMAKE_BUILD_TYPE Debug CACHE STRING "Build type" FORCE)
endif()
list(APPEND CMAKE_MODULE_PATH "${CMAKE_CURRENT_SOURCE_DIR}/cmake")
include(cmake/Dependencies.cmake)
include(cmake/CompilerWarnings.cmake)
include(GNUInstallDirs)
set(EMERALD_LAZULI_DIR "${CMAKE_CURRENT_SOURCE_DIR}/Lazuli" CACHE PATH "Lazuli UI framework checkout")
if(EXISTS "${EMERALD_LAZULI_DIR}/CMakeLists.txt")
    add_subdirectory("${EMERALD_LAZULI_DIR}" "${CMAKE_BINARY_DIR}/Lazuli")
else()
    message(FATAL_ERROR
        "Lazuli not found at ${EMERALD_LAZULI_DIR}.")
endif()
set(EMERALD_RESOURCE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/resources")
set(EMERALD_PUBLIC_DIR "${CMAKE_CURRENT_SOURCE_DIR}/public")
set(EMERALD_UI_DOCS_DIR "${CMAKE_CURRENT_SOURCE_DIR}/UiDocs")
add_subdirectory(src)
target_compile_definitions(emerald_core PUBLIC
    EMERALD_VERSION_TEXT="v${CMAKE_PROJECT_VERSION}")
target_compile_definitions(emerald_core PUBLIC
    EMERALD_VERSION="${CMAKE_PROJECT_VERSION}")
install(TARGETS emerald RUNTIME DESTINATION "${CMAKE_INSTALL_BINDIR}")
option(EMERALD_BUILD_GOLDMAPPER "Build GoldMapper and refresh resources/ binaries" ON)
if(EMERALD_BUILD_GOLDMAPPER)
    set(GOLDMAPPER_CMAKE_ARGS
        "-DGOLDMAPPER_DIR=${CMAKE_CURRENT_SOURCE_DIR}/GoldMapper"
        "-DRESOURCE_DIR=${EMERALD_RESOURCE_DIR}"
    )
    add_custom_target(goldmapper ALL
        COMMAND "${CMAKE_COMMAND}" ${GOLDMAPPER_CMAKE_ARGS}
            -P "${CMAKE_CURRENT_SOURCE_DIR}/cmake/GoldMapper.cmake"
        WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}"
        COMMENT "Building GoldMapper and refreshing resources/"
        VERBATIM
    )
    if(TARGET emerald_core)
        add_dependencies(emerald_core goldmapper)
    endif()
endif()
