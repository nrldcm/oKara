cmake_minimum_required(VERSION 3.22.1)
project(okaramonitor)

find_package(oboe REQUIRED CONFIG)

add_library(okaramonitor SHARED monitor_engine.cpp)
set_target_properties(okaramonitor PROPERTIES CXX_STANDARD 17)
target_link_libraries(okaramonitor oboe::oboe android log)
