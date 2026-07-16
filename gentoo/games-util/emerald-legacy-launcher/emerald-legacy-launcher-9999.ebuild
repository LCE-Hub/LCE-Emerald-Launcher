# Copyright 2026 Gentoo Authors
# Distributed under the terms of the GNU General Public License v2

EAPI=8

inherit desktop git-r3 xdg

DESCRIPTION="FOSS cross-platform launcher for Minecraft Legacy Console Edition"
HOMEPAGE="https://github.com/LCE-Hub/LCE-Emerald-Launcher"
EGIT_REPO_URI="https://github.com/LCE-Hub/LCE-Emerald-Launcher.git"

LICENSE="GPL-3"
SLOT="0"
PROPERTIES="live"

# Cargo crates and npm packages are fetched at build time.
RESTRICT="network-sandbox"

RDEPEND="
	dev-libs/glib:2
	dev-libs/libayatana-appindicator
	dev-libs/openssl:=
	net-libs/libsoup:3.0
	net-libs/webkit-gtk:4.1
	x11-libs/cairo
	x11-libs/gdk-pixbuf:2
	x11-libs/gtk+:3
	x11-libs/pango
"
DEPEND="${RDEPEND}"
BDEPEND="
	|| (
		>=dev-lang/rust-1.77.0:*
		>=dev-lang/rust-bin-1.77.0:*
	)
	net-libs/nodejs[npm]
	virtual/pkgconfig
"

# Rust binaries ignore *FLAGS from make.conf.
QA_FLAGS_IGNORED="usr/bin/emerald-legacy-launcher"

src_prepare() {
	default

	# Prefer npm for the frontend build; disable updater artifact signing
	# (no Tauri signing key in distro builds).
	sed -i \
		-e 's/"createUpdaterArtifacts": true/"createUpdaterArtifacts": false/' \
		src-tauri/tauri.conf.json || die
}

src_compile() {
	local -x CI=true
	local -x npm_config_audit=false
	local -x npm_config_fund=false
	local -x npm_config_update_notifier=false

	npm install || die "npm install failed"
	npm run tauri -- build --no-bundle || die "tauri build failed"
}

src_install() {
	dobin src-tauri/target/release/emerald-legacy-launcher

	newicon -s 32 src-tauri/icons/32x32.png emerald-legacy-launcher.png
	newicon -s 64 src-tauri/icons/64x64.png emerald-legacy-launcher.png
	newicon -s 128 src-tauri/icons/128x128.png emerald-legacy-launcher.png
	newicon -s 256 src-tauri/icons/128x128@2x.png emerald-legacy-launcher.png
	newicon -s 512 src-tauri/icons/icon.png emerald-legacy-launcher.png

	domenu "${FILESDIR}"/emerald-legacy-launcher.desktop

	insinto /usr/share/metainfo
	newins flatpak/io.github.Emerald_Legacy_Launcher.Emerald_Legacy_Launcher.metainfo.xml \
		io.github.Emerald_Legacy_Launcher.Emerald_Legacy_Launcher.metainfo.xml

	dodoc README.md LICENSE
}
