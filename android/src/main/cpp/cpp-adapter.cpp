#include <jni.h>
#include "jieonist_visioncameraocrscannerOnLoad.hpp"

#include <fbjni/fbjni.h>


JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void*) {
  return facebook::jni::initialize(vm, []() {
    margelo::nitro::jieonist_visioncameraocrscanner::registerAllNatives();
  });
}