include(FetchContent)
set(EMERALD_PC_MODULES CURL::libcurl Archive::libarchive)
if(EMERALD_USE_SYSTEM_DEPS)
    find_package(CURL QUIET)
    find_package(PkgConfig QUIET)
    if(PkgConfig_FOUND)
        pkg_check_modules(EMERALD_ARCHIVE IMPORTED_TARGET libarchive)
    endif()
elseif()
    message(FATAL_ERROR "libcurl/libarchive system deps required")
endif()
function(emerald_find_sdl3)
    if(EMERALD_USE_SYSTEM_DEPS)
        find_package(SDL3 3.2 CONFIG QUIET)
        if(SDL3_FOUND)
            message(STATUS "Using system SDL3 ${SDL3_VERSION}")
            return()
        endif()
    endif()

    FetchContent_Declare(SDL3
        GIT_REPOSITORY https://github.com/libsdl-org/SDL.git
        GIT_TAG release-3.2.30
        GIT_SHALLOW TRUE
        EXCLUDE_FROM_ALL
    )
    FetchContent_MakeAvailable(SDL3)
    message(STATUS "SDL3 fetched from source")
endfunction()
function(emerald_find_sdl3_ttf)
    if(EMERALD_USE_SYSTEM_DEPS)
        find_package(SDL3_ttf CONFIG QUIET)
        if(SDL3_ttf_FOUND)
            message(STATUS "Using system SDL3_ttf ${SDL3_ttf_VERSION}")
            return()
        endif()
    endif()

    FetchContent_Declare(SDL3_ttf
        GIT_REPOSITORY https://github.com/libsdl-org/SDL_ttf.git
        GIT_TAG release-3.2.2
        GIT_SHALLOW TRUE
        EXCLUDE_FROM_ALL
    )
    FetchContent_MakeAvailable(SDL3_ttf)
    message(STATUS "SDL3_ttf fetched from source")
endfunction()

function(emerald_find_pugixml)
    if(EMERALD_USE_SYSTEM_DEPS)
        find_package(pugixml CONFIG QUIET)
        if(pugixml_FOUND)
            message(STATUS "Using system pugixml ${pugixml_VERSION}")
            return()
        endif()
    endif()
    FetchContent_Declare(pugixml
        GIT_REPOSITORY https://github.com/zeux/pugixml.git
        GIT_TAG v1.15
        GIT_SHALLOW TRUE
        EXCLUDE_FROM_ALL
    )
    set(BUILD_TESTS OFF CACHE BOOL "" FORCE)
    FetchContent_MakeAvailable(pugixml)
    message(STATUS "pugixml fetched from source")
endfunction()
function(emerald_find_stb)
    if(EMERALD_USE_SYSTEM_DEPS AND EXISTS "${EMERALD_SYSTEM_STB_DIR}/stb_image.h")
        message(STATUS "Using system stb headers")
        return()
    endif()

    FetchContent_Declare(stb
        GIT_REPOSITORY https://github.com/nothings/stb.git
        GIT_TAG master
        GIT_SHALLOW TRUE
        EXCLUDE_FROM_ALL
    )
    FetchContent_MakeAvailable(stb)
    set(stb_SOURCE_DIR "${stb_SOURCE_DIR}" PARENT_SCOPE) #neo: make stb_SOURCE_DIR visible outside this function scope
    message(STATUS "stb fetched from source")
endfunction()
function(emerald_find_miniaudio)
    if(EMERALD_USE_SYSTEM_DEPS)
        find_path(EMERALD_MINIAUDIO_INCLUDE_DIR NAMES miniaudio.h)
        if(EMERALD_MINIAUDIO_INCLUDE_DIR)
            message(STATUS "Using system miniaudio (${EMERALD_MINIAUDIO_INCLUDE_DIR})")
            return()
        endif()
    endif()

    FetchContent_Declare(miniaudio
        GIT_REPOSITORY https://github.com/mackron/miniaudio.git
        GIT_TAG 0.11.25
        GIT_SHALLOW TRUE
        SOURCE_SUBDIR cmake/emerald-miniaudio-no-subdir
        EXCLUDE_FROM_ALL
    )
    FetchContent_MakeAvailable(miniaudio)
    set(EMERALD_MINIAUDIO_INCLUDE_DIR "${miniaudio_SOURCE_DIR}" CACHE PATH "miniaudio include directory" FORCE)
    message(STATUS "miniaudio fetched from source")
endfunction()
function(emerald_find_json)
    if(EMERALD_USE_SYSTEM_DEPS)
        find_package(nlohmann_json 3.11 CONFIG QUIET)
        if(nlohmann_json_FOUND)
            message(STATUS "Using system nlohmann_json")
            return()
        endif()
    endif()

    FetchContent_Declare(nlohmann_json
        URL https://github.com/nlohmann/json/releases/download/v3.11.3/json.tar.xz
        DOWNLOAD_EXTRACT_TIMESTAMP TRUE
        EXCLUDE_FROM_ALL
    )
    FetchContent_MakeAvailable(nlohmann_json)
    message(STATUS "nlohmann_json fetched from source")
endfunction()
set(EMERALD_SYSTEM_STB_DIR "/usr/include/stb")
emerald_find_sdl3()
emerald_find_sdl3_ttf()
emerald_find_json()
emerald_find_pugixml()
emerald_find_stb()
emerald_find_miniaudio()
if(NOT WIN32)
    find_package(SQLite3 REQUIRED)
endif()

add_library(emerald_stb INTERFACE)
if(EXISTS "${EMERALD_SYSTEM_STB_DIR}/stb_image.h")
    target_include_directories(emerald_stb SYSTEM INTERFACE "${EMERALD_SYSTEM_STB_DIR}")
else()
    target_include_directories(emerald_stb SYSTEM INTERFACE "${stb_SOURCE_DIR}")
endif()
