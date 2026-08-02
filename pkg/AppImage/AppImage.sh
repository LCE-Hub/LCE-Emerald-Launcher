#!/bin/sh
#neo: credits: https://github.com/cjonas1999/OverBind/blob/master/pkg/AppImage/AppImage.sh
set -eu
ARCH="$(uname -m)"
SHARUN_REPO="https://raw.githubusercontent.com/pkgforge-dev/Anylinux-AppImages"
_commits_json=$(mktemp)
wget -qO "$_commits_json" \
    "https://api.github.com/repos/pkgforge-dev/Anylinux-AppImages/commits?path=useful-tools/&per_page=100"

STABLE_SHA=$(node -e "
const data = JSON.parse(require('fs').readFileSync('$_commits_json', 'utf8'));
const now = Date.now(), h24 = 864e5;
for (let i = 0; i < data.length; i++) {
    const t = new Date(data[i].commit.committer.date).getTime();
    if (now - t < h24) continue;
    const prev = data[i - 1];
    if (!prev || new Date(prev.commit.committer.date).getTime() - t >= h24) {
        process.stdout.write(data[i].sha);
        process.exit(0);
    }
}
process.stderr.write('No settled commit found in last 100 commits\n');
process.exit(1);
")
rm -f "$_commits_json"
echo "Pinning sharun scripts to settled commit $STABLE_SHA"
SHARUN="$SHARUN_REPO/$STABLE_SHA/useful-tools/quick-sharun.sh"
DEBLOATED_PKGS="$SHARUN_REPO/$STABLE_SHA/useful-tools/get-debloated-pkgs.sh"
#export UPINFO="gh-releases-zsync|${GITHUB_REPOSITORY%/*}|${GITHUB_REPOSITORY#*/}|latest|*$ARCH.AppImage.zsync"
export OUTNAME=Emerald-Legacy-Launcher-anylinux-"$ARCH".AppImage
export DESKTOP="/usr/share/applications/LCE Emerald Launcher.desktop"
export ICON=/usr/share/icons/hicolor/256x256@2/apps/emerald-legacy-launcher.png
export DEPLOY_OPENGL=1
rm -rf AppDir dist appinfo
wget --retry-connrefused --tries=30 "$DEBLOATED_PKGS" -O ./get-debloated-pkgs
wget --retry-connrefused --tries=30 "$SHARUN" -O ./quick-sharun
chmod +x ./quick-sharun ./get-debloated-pkgs
./get-debloated-pkgs --add-common --prefer-nano
./quick-sharun \
        /usr/bin/emerald-legacy-launcher \
        /usr/lib/libayatana-appindicator*.so*

mkdir -p "AppDir/usr/lib"
cp -r "/usr/lib/LCE Emerald Launcher" "AppDir/usr/lib/"
./quick-sharun --make-appimage
mkdir -p ./dist
mv -v ./*.AppImage* ./dist
echo "All Done!"
