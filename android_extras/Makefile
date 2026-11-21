HERE := $(patsubst %/,%,$(dir $(abspath $(lastword $(MAKEFILE_LIST)))))
ROOT := $(HERE)/..
SDK ?= $(HOME)/Android/Sdk
NDK ?= $(if $(ANDROID_NDK_HOME),$(ANDROID_NDK_HOME),$(SDK)/ndk/28.2.13676358)
HOSTTAG := linux-x86_64
TOOLCHAIN := $(NDK)/build/cmake/android.toolchain.cmake
CROSS := $(NDK)/toolchains/llvm/prebuilt/$(HOSTTAG)
SYSROOT := $(CROSS)/sysroot
CC := $(CROSS)/bin/aarch64-linux-android26-clang
BUILD := $(HERE)/build
STAMPS := $(BUILD)/stamps
PREFIX := $(HERE)/prefix
GEN := $(BUILD)/generated
APPSRC := $(ROOT)/android/app/src/main
ASSETS := $(APPSRC)/assets
JNILIBS := $(APPSRC)/jniLibs/arm64-v8a
JAVA := $(APPSRC)/java
APK := $(ROOT)/android/app/build/outputs/apk/release/app-release.apk
ADB := $(SDK)/platform-tools/adb
GRADLE := cd $(ROOT)/android && ./gradlew
JAVA_HOME := $(if $(JAVA_HOME:/*=),$(if $(wildcard $(HOME)/android-studio/jbr/bin/java),$(HOME)/android-studio/jbr,),$(JAVA_HOME))
export JAVA_HOME
define gradle
	$(GRADLE) $(1)
endef
ZLIB_VERSION := 1.3.1
ZSTD_VERSION := 1.5.6
MBEDTLS_VERSION := 2.28.8
CURL_VERSION := 8.14.1
LIBARCHIVE_VERSION := 3.7.7
SQLITE_VERSION := 3450000
ASSET_REPO := LCE-Hub/LCE-Emerald-Launcher
ASSET_TAG := android-assets-v1
IMAGEFS_SHA256 := 7838756e6a05c91afff68f4bf12aa2780f815877753f8dd354e203e99b9caf8a
PROTON_SHA256 := ceb768396c2d44256518f94ae236f0c1f40738cf050a52e990e2fef67ff161df
ANDROID_CONFIG := \
	-DCMAKE_TOOLCHAIN_FILE=$(TOOLCHAIN) \
	-DANDROID_ABI=arm64-v8a \
	-DANDROID_PLATFORM=android-26 \
	-DANDROID_STL=c++_shared \
	-DCMAKE_BUILD_TYPE=Release \
	-DCMAKE_POLICY_VERSION_MINIMUM=3.5 \
	"-DCMAKE_FIND_ROOT_PATH=$(PREFIX);$(SYSROOT)" \
	-DCMAKE_FIND_ROOT_PATH_MODE_PROGRAM=NEVER \
	-DCMAKE_FIND_ROOT_PATH_MODE_LIBRARY=ONLY \
	-DCMAKE_FIND_ROOT_PATH_MODE_INCLUDE=ONLY \
	-DCMAKE_FIND_ROOT_PATH_MODE_PACKAGE=ONLY

export PKG_CONFIG_LIBDIR := $(PREFIX)/lib/pkgconfig
export PKG_CONFIG_PATH := $(PREFIX)/lib/pkgconfig
.PHONY: all assets deps native java apk build debug install logcat keys clean check-ndk
all: build
check-ndk:
	@test -d "$(NDK)" || { echo "error: Android NDK not found at $(NDK) (set ANDROID_NDK_HOME)"; exit 1; }

$(STAMPS) $(GEN) $(PREFIX)/lib $(PREFIX)/include $(ASSETS) $(JNILIBS) $(JAVA):
	mkdir -p $@

assets: $(ASSETS)/imagefs.tar.zst $(ASSETS)/proton-11.0-arm64ec.tar.zst $(ASSETS)/cacert.pem | $(ASSETS)
	@cd $(ASSETS) && echo "$(IMAGEFS_SHA256)  imagefs.tar.zst" | sha256sum -c -
	@cd $(ASSETS) && echo "$(PROTON_SHA256)  proton-11.0-arm64ec.tar.zst" | sha256sum -c -

$(ASSETS)/imagefs.tar.zst: | $(ASSETS)
	curl -fL --retry 3 -o $@.part https://github.com/$(ASSET_REPO)/releases/download/$(ASSET_TAG)/imagefs.tar.zst
	mv $@.part $@

$(ASSETS)/proton-11.0-arm64ec.tar.zst: | $(ASSETS)
	curl -fL --retry 3 -o $@.part https://github.com/$(ASSET_REPO)/releases/download/$(ASSET_TAG)/proton-11.0-arm64ec.tar.zst
	mv $@.part $@

$(ASSETS)/cacert.pem: | $(ASSETS)
	curl -fL --retry 3 -o $@.part https://curl.se/ca/cacert.pem
	mv $@.part $@

deps: $(STAMPS)/zlib.stamp $(STAMPS)/zstd.stamp $(STAMPS)/mbedtls.stamp $(STAMPS)/curl.stamp $(STAMPS)/libarchive.stamp $(STAMPS)/sqlite.stamp | check-ndk
$(STAMPS)/zlib.stamp: | $(STAMPS) $(PREFIX)/lib $(PREFIX)/include check-ndk
	rm -rf $(BUILD)/zlib-$(ZLIB_VERSION)
	curl -fL --retry 3 -o $(BUILD)/zlib-$(ZLIB_VERSION).tar.gz https://github.com/madler/zlib/archive/refs/tags/v$(ZLIB_VERSION).tar.gz
	tar -xzf $(BUILD)/zlib-$(ZLIB_VERSION).tar.gz -C $(BUILD)
	cd $(BUILD)/zlib-$(ZLIB_VERSION) && \
	$(CC) -shared -fPIC -O2 -DZ_HAVE_UNISTD_H -Wl,-soname,libz.so -I. \
		-o $(PREFIX)/lib/libz.so \
		adler32.c compress.c crc32.c deflate.c gzclose.c gzlib.c gzread.c gzwrite.c \
		infback.c inffast.c inflate.c inftrees.c trees.c uncompr.c zutil.c
	cp $(BUILD)/zlib-$(ZLIB_VERSION)/zlib.h $(BUILD)/zlib-$(ZLIB_VERSION)/zconf.h $(PREFIX)/include/
	touch $@

$(STAMPS)/zstd.stamp: | $(STAMPS) check-ndk
	rm -rf $(BUILD)/zstd $(BUILD)/zstd-$(ZSTD_VERSION)
	curl -fL --retry 3 -o $(BUILD)/zstd-$(ZSTD_VERSION).tar.gz https://github.com/facebook/zstd/archive/refs/tags/v$(ZSTD_VERSION).tar.gz
	tar -xzf $(BUILD)/zstd-$(ZSTD_VERSION).tar.gz -C $(BUILD)
	cmake -S $(BUILD)/zstd-$(ZSTD_VERSION)/build/cmake -B $(BUILD)/zstd -G Ninja \
		$(ANDROID_CONFIG) -DZSTD_BUILD_PROGRAMS=OFF -DZSTD_BUILD_TESTS=OFF \
		-DZSTD_LEGACY_SUPPORT=0 -DZSTD_BUILD_STATIC=ON -DZSTD_BUILD_SHARED=ON \
		-DCMAKE_INSTALL_PREFIX=$(PREFIX)
	cmake --build $(BUILD)/zstd
	cmake --install $(BUILD)/zstd
	touch $@

$(STAMPS)/mbedtls.stamp: | $(STAMPS) check-ndk
	rm -rf $(BUILD)/mbedtls $(BUILD)/mbedtls-$(MBEDTLS_VERSION)
	curl -fL --retry 3 -o $(BUILD)/mbedtls-$(MBEDTLS_VERSION).tar.gz https://github.com/Mbed-TLS/mbedtls/archive/refs/tags/v$(MBEDTLS_VERSION).tar.gz
	tar -xzf $(BUILD)/mbedtls-$(MBEDTLS_VERSION).tar.gz -C $(BUILD)
	cmake -S $(BUILD)/mbedtls-$(MBEDTLS_VERSION) -B $(BUILD)/mbedtls -G Ninja \
		$(ANDROID_CONFIG) \
		-DENABLE_PROGRAMS=OFF -DENABLE_TESTING=OFF \
		-DUSE_SHARED_MBEDTLS_LIBRARY=ON -DUSE_STATIC_MBEDTLS_LIBRARY=OFF \
		-DCMAKE_INSTALL_PREFIX=$(PREFIX)
	cmake --build $(BUILD)/mbedtls
	cmake --install $(BUILD)/mbedtls
	touch $@

$(STAMPS)/curl.stamp: $(STAMPS)/mbedtls.stamp $(STAMPS)/zlib.stamp | check-ndk
	rm -rf $(BUILD)/curl $(BUILD)/curl-curl-$(subst .,_,$(CURL_VERSION))
	curl -fL --retry 3 -o $(BUILD)/curl-$(CURL_VERSION).tar.gz https://github.com/curl/curl/archive/refs/tags/curl-$(subst .,_,$(CURL_VERSION)).tar.gz
	tar -xzf $(BUILD)/curl-$(CURL_VERSION).tar.gz -C $(BUILD)
	cmake -S $(BUILD)/curl-curl-$(subst .,_,$(CURL_VERSION)) -B $(BUILD)/curl -G Ninja \
		$(ANDROID_CONFIG) -DBUILD_SHARED_LIBS=ON -DBUILD_TESTING=OFF \
		-DCURL_USE_MBEDTLS=ON -DCURL_USE_OPENSSL=OFF -DCURL_ZLIB=OFF \
		-DCURL_DISABLE_LDAP=ON -DCURL_DISABLE_LDAPS=ON -DCURL_USE_LIBSSH2=OFF \
		-DCURL_BROTLI=OFF -DUSE_LIBIDN2=OFF -DCURL_USE_LIBPSL=OFF \
		-DCMAKE_INSTALL_PREFIX=$(PREFIX)
	cmake --build $(BUILD)/curl
	cmake --install $(BUILD)/curl
	touch $@

$(STAMPS)/libarchive.stamp: $(STAMPS)/zlib.stamp $(STAMPS)/zstd.stamp | check-ndk
	rm -rf $(BUILD)/libarchive $(BUILD)/libarchive-$(LIBARCHIVE_VERSION)
	curl -fL --retry 3 -o $(BUILD)/libarchive-$(LIBARCHIVE_VERSION).tar.gz https://github.com/libarchive/libarchive/archive/refs/tags/v$(LIBARCHIVE_VERSION).tar.gz
	tar -xzf $(BUILD)/libarchive-$(LIBARCHIVE_VERSION).tar.gz -C $(BUILD)
	cmake -S $(BUILD)/libarchive-$(LIBARCHIVE_VERSION) -B $(BUILD)/libarchive -G Ninja \
		$(ANDROID_CONFIG) -DBUILD_SHARED_LIBS=ON -DENABLE_TEST=OFF \
		-DENABLE_TAR=OFF -DENABLE_CPIO=OFF -DENABLE_CAT=OFF \
		-DENABLE_ZSTD=ON -DZSTD_INCLUDE_DIR=$(PREFIX)/include -DZSTD_LIBRARY=$(PREFIX)/lib/libzstd.so \
		-DENABLE_ZLIB=ON -DZLIB_INCLUDE_DIR=$(PREFIX)/include -DZLIB_LIBRARY=$(PREFIX)/lib/libz.so \
		-DENABLE_BZip2=OFF -DENABLE_LZMA=OFF -DENABLE_LZ4=OFF \
		-DENABLE_OPENSSL=OFF -DENABLE_NETTLE=OFF -DENABLE_XML2=OFF \
		-DENABLE_EXPAT=OFF -DENABLE_ICONV=OFF -DENABLE_ACL=OFF \
		-DCMAKE_INSTALL_PREFIX=$(PREFIX)
	cmake --build $(BUILD)/libarchive
	cmake --install $(BUILD)/libarchive
	touch $@

$(STAMPS)/sqlite.stamp: | $(STAMPS) $(PREFIX)/lib $(PREFIX)/include check-ndk
	rm -rf $(BUILD)/sqlite $(BUILD)/sqlite-amalgamation-$(SQLITE_VERSION)
	curl -fL --retry 3 -o $(BUILD)/sqlite-amalgamation-$(SQLITE_VERSION).zip https://www.sqlite.org/2024/sqlite-amalgamation-$(SQLITE_VERSION).zip
	unzip -q -o $(BUILD)/sqlite-amalgamation-$(SQLITE_VERSION).zip -d $(BUILD)
	$(CC) -O2 -fPIC -DSQLITE_THREADSAFE=1 -c $(BUILD)/sqlite-amalgamation-$(SQLITE_VERSION)/sqlite3.c -o $(BUILD)/sqlite3.o
	ar rcs $(PREFIX)/lib/libsqlite3.a $(BUILD)/sqlite3.o
	cp $(BUILD)/sqlite-amalgamation-$(SQLITE_VERSION)/sqlite3.h $(BUILD)/sqlite-amalgamation-$(SQLITE_VERSION)/sqlite3ext.h $(PREFIX)/include/
	touch $@

$(BUILD)/emerald_embed: $(ROOT)/tools/EmbedAssets.cpp
	c++ -std=c++20 -O2 -o $@ $<

$(GEN)/EmbeddedAssets.cpp: $(BUILD)/emerald_embed | $(GEN)
	$< $@ public $(ROOT)/public resources $(ROOT)/resources UiDocs $(ROOT)/UiDocs

native: $(STAMPS)/native.stamp
$(STAMPS)/native.stamp: $(GEN)/EmbeddedAssets.cpp deps | check-ndk $(STAMPS)
	cmake -S $(ROOT) -B $(BUILD)/app -G Ninja \
		$(ANDROID_CONFIG) \
		-DEMERALD_ANDROID=ON \
		-DEMERALD_USE_SYSTEM_DEPS=ON \
		-DEMERALD_BUILD_GOLDMAPPER=OFF \
		-DEMERALD_PREGENERATED_EMBED=$(GEN)/EmbeddedAssets.cpp
	cmake --build $(BUILD)/app --target emerald --parallel $(shell nproc)
	touch $@

libs: $(STAMPS)/libs.stamp
$(STAMPS)/libs.stamp: $(STAMPS)/native.stamp | $(JNILIBS)
	rm -f $(JNILIBS)/*.so
	cp $(BUILD)/app/src/libmain.so $(JNILIBS)/
	cp $(BUILD)/app/_deps/sdl3-build/libSDL3.so $(JNILIBS)/
	cp $(BUILD)/app/_deps/sdl3_ttf-build/libSDL3_ttf.so $(JNILIBS)/
	cp $(BUILD)/app/_deps/pugixml-build/libpugixml.so $(JNILIBS)/
	cp $(SYSROOT)/usr/lib/aarch64-linux-android/libc++_shared.so $(JNILIBS)/
	cp $(PREFIX)/lib/libcurl.so $(PREFIX)/lib/libarchive.so $(PREFIX)/lib/libzstd.so \
		$(PREFIX)/lib/libmbedtls.so $(PREFIX)/lib/libmbedx509.so $(PREFIX)/lib/libmbedcrypto.so \
		$(PREFIX)/lib/libz.so $(JNILIBS)/
	touch $@

java: $(STAMPS)/java.stamp
$(STAMPS)/java.stamp: $(STAMPS)/libs.stamp | $(JAVA)
	rm -rf $(JAVA)/org
	cp -r $(BUILD)/app/_deps/sdl3-src/android-project/app/src/main/java/org $(JAVA)/
	touch $@

apk: $(APK)
$(APK): $(STAMPS)/java.stamp keys
	@test -f $(ROOT)/android/local.properties || printf 'sdk.dir=%s\n' "$(SDK)" > $(ROOT)/android/local.properties
	$(call gradle,:app:assembleRelease)

keys:
	@if [ ! -f $(ROOT)/android/app/release.keystore ]; then \
		if [ -f $(HOME)/.tauri/release.keystore ]; then \
			cp $(HOME)/.tauri/release.keystore $(ROOT)/android/app/release.keystore; \
		elif [ -f $(ROOT)/old/src-tauri/gen/android/app/release.keystore ]; then \
			cp $(ROOT)/old/src-tauri/gen/android/app/release.keystore $(ROOT)/android/app/release.keystore; \
		else \
			echo "error: no release.keystore found in $(HOME)/.tauri or $(ROOT)/old"; exit 1; \
		fi; \
	fi
	@if [ ! -f $(ROOT)/android/app/key.properties ]; then \
		echo "error: $(ROOT)/android/app/key.properties missing"; exit 1; \
	fi

build: assets deps native libs java apk
debug: assets deps native libs java keys
	@test -f $(ROOT)/android/local.properties || printf 'sdk.dir=%s\n' "$(SDK)" > $(ROOT)/android/local.properties
	$(call gradle,:app:assembleDebug)

install: $(APK)
	$(ADB) install -r $(APK)

logcat:
	$(ADB) logcat -v time

clean:
	rm -rf $(BUILD) $(PREFIX)
	rm -rf $(JNILIBS)
	rm -rf $(JAVA)/org
	-$(GRADLE) clean
