project(jieonist_visioncameraocrscanner)
cmake_minimum_required(VERSION 3.9.0)

set(PACKAGE_NAME jieonist_visioncameraocrscanner)
set(CMAKE_VERBOSE_MAKEFILE ON)
set(CMAKE_CXX_STANDARD 20)

# Define C++ library and add all sources
add_library(${PACKAGE_NAME} SHARED src/main/cpp/cpp-adapter.cpp)

# Add Nitrogen specs :)
include(${CMAKE_SOURCE_DIR}/../nitrogen/generated/android/jieonist_visioncameraocrscanner+autolinking.cmake)

# Set up local includes
include_directories("src/main/cpp" "../cpp")

find_library(LOG_LIB log)

# VisionCamera prefab: the nitrogen-generated spec #includes
# <VisionCamera/HybridFrameSpec.hpp>, so we must link VisionCamera's C++ prefab.
find_package(react-native-vision-camera REQUIRED CONFIG)

# Link all libraries together
target_link_libraries(
        ${PACKAGE_NAME}
        ${LOG_LIB}
        android # <-- Android core
        react-native-vision-camera::VisionCamera # <-- VisionCamera Frame C++ types
)
