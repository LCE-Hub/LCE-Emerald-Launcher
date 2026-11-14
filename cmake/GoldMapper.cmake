if(NOT GOLDMAPPER_DIR OR NOT RESOURCE_DIR)
    message(FATAL_ERROR "GOLDMAPPER_DIR and RESOURCE_DIR are required")
endif()
set(GM_MINGW_DIR "${GOLDMAPPER_DIR}/build")
set(GM_WIN_DIR "${GOLDMAPPER_DIR}/build/native")
set(GM_RESULT 1)
if(CMAKE_HOST_UNIX)
    find_program(GM_MAKE NAMES make gmake)
    find_program(GM_MINGW_GCC NAMES x86_64-w64-mingw32-gcc)
    if(NOT GM_MAKE)
        message(WARNING "GoldMapper: make not found, skipping")
        return()
    endif()
    if(NOT GM_MINGW_GCC)
        message(WARNING "GoldMapper: x86_64-w64-mingw32-gcc not found in PATH, skipping")
        return()
    endif()
    message(STATUS "Building GoldMapper (mingw-w64 cross, make=${GM_MAKE})...")
    execute_process(
        COMMAND "${GM_MAKE}"
        WORKING_DIRECTORY "${GOLDMAPPER_DIR}"
        RESULT_VARIABLE GM_RESULT
        ERROR_VARIABLE GM_ERR
    )
    if(NOT GM_RESULT EQUAL 0)
        message(WARNING "GoldMapper make stderr: ${GM_ERR}")
    endif()
else()
    message(STATUS "Building GoldMapper (native CMake)...")
    execute_process(
        COMMAND "${CMAKE_COMMAND}" -S "${GOLDMAPPER_DIR}" -B "${GM_WIN_DIR}" -DCMAKE_BUILD_TYPE=Release
        RESULT_VARIABLE GM_RESULT
    )
    if(GM_RESULT EQUAL 0)
        execute_process(
            COMMAND "${CMAKE_COMMAND}" --build "${GM_WIN_DIR}" --config Release
            RESULT_VARIABLE GM_RESULT
        )
    endif()
endif()
if(NOT GM_RESULT EQUAL 0)
    message(FATAL_ERROR "GoldMapper build failed (${GM_RESULT})")
endif()
set(GM_LIB "")
set(GM_EXE "")
set(GM_SDL3 "")
file(GLOB_RECURSE GM_LIBS
    "${GM_MINGW_DIR}/*GoldMapperLib.dll"
    "${GM_WIN_DIR}/*GoldMapperLib.dll"
)
file(GLOB_RECURSE GM_EXES
    "${GM_MINGW_DIR}/*GoldMapperLauncher.exe"
    "${GM_WIN_DIR}/*GoldMapperLauncher.exe"
)
file(GLOB_RECURSE GM_SDL3S
    "${GM_MINGW_DIR}/*SDL3.dll"
    "${GM_WIN_DIR}/*SDL3.dll"
)
if(GM_LIBS)
    list(SORT GM_LIBS)
    list(GET GM_LIBS 0 GM_LIB)
endif()
if(GM_EXES)
    list(SORT GM_EXES)
    list(GET GM_EXES 0 GM_EXE)
endif()
if(GM_SDL3S)
    list(SORT GM_SDL3S)
    list(GET GM_SDL3S 0 GM_SDL3)
endif()
if(NOT GM_SDL3)
    set(GM_SDL3 "${GOLDMAPPER_DIR}/third_party/SDL3-3.4.20/lib/x64/SDL3.dll")
endif()
if(NOT GM_LIB)
    message(FATAL_ERROR "GoldMapper: GoldMapperLib.dll not found after build")
endif()
if(NOT GM_EXE)
    message(FATAL_ERROR "GoldMapper: GoldMapperLauncher.exe not found after build")
endif()
function(gm_copy SRC DST)
    if(NOT EXISTS "${SRC}")
        return()
    endif()
    file(TIMESTAMP "${SRC}" GM_SRC_TS UTC)
    file(TIMESTAMP "${DST}" GM_DST_TS UTC)
    if(EXISTS "${DST}" AND GM_DST_TS AND NOT GM_DST_TS STRLESS GM_SRC_TS)
        return()
    endif()
    configure_file("${SRC}" "${DST}" COPYONLY)
    message(STATUS "GoldMapper: copied ${DST}")
endfunction()
gm_copy("${GM_LIB}" "${RESOURCE_DIR}/GoldMapperLib.dll")
gm_copy("${GM_EXE}" "${RESOURCE_DIR}/GoldMapperLauncher.exe")
gm_copy("${GM_SDL3}" "${RESOURCE_DIR}/SDL3.dll")
