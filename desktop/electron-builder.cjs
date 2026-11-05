// How the desktop apps are packed (scripts/dist.sh runs it once scripts/stage.sh has put the server, Node.js and tmux in
// build/), each on its own system:
//   macOS    Hydor-<version>-<arch>-mac.dmg (what people download) and .zip (what the app's updater downloads). With a
//            Developer ID certificate (CSC_LINK, CSC_KEY_PASSWORD) it is signed with the hardened runtime, and with
//            Apple's notary credentials (APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID) notarized; without them it
//            is signed with Hydor's own certificate (scripts/sign.cjs), the same for every version, so macOS keeps the
//            permissions people give it from one version to the next; without that either, ad hoc. Apple silicon needs
//            a signature to run it at all.
//   Windows  Hydor-<version>-<arch>-win.exe, an installer for your own account (no administrator needed), which the
//            app's updater also runs, without its window. It is not signed: Windows SmartScreen asks the first time.
//   Linux    Hydor-<version>-<arch>.AppImage (one file that runs on most systems and replaces itself to update) and
//            Hydor-<version>-<arch>.deb (Debian and Ubuntu; it updates with your password).
const signed = !!process.env.CSC_LINK;

module.exports = {
  appId: 'com.hydor.app',
  productName: 'Hydor',
  copyright: 'Copyright © Hydor Devs',
  directories: { output: 'dist', buildResources: 'resources' },
  files: ['main.cjs', 'glow.cjs', 'preload.cjs', 'package.json'],
  extraResources: [
    // build/ as a whole, not build/server: electron-builder always leaves out a node_modules at the top of
    // a folder it copies, and the server's packages are in server/node_modules.
    { from: 'build', to: '.', filter: ['server/**/*', 'node/**/*', 'bin/**/*', 'BUILD'] },
    { from: 'resources', to: '.', filter: ['trayTemplate*.png', 'tray.ico', 'tray-linux.png', 'icon-256.png'] },
  ],
  publish: null,
  mac: {
    icon: 'resources/icon.png',
    category: 'public.app-category.developer-tools',
    target: ['zip', 'dmg'],
    artifactName: 'Hydor-${version}-${arch}-mac.${ext}',
    electronLanguages: ['en', 'zh_CN', 'el'],
    minimumSystemVersion: '12.0',
    identity: signed ? undefined : null,
    hardenedRuntime: signed,
    gatekeeperAssess: false,
    entitlements: 'resources/entitlements.plist',
    entitlementsInherit: 'resources/entitlements.plist',
    notarize: signed && !!process.env.APPLE_TEAM_ID,
    extendInfo: {
      NSMicrophoneUsageDescription: 'Hydor uses the microphone when you talk to it.',
      LSMultipleInstancesProhibited: true,
    },
  },
  dmg: { title: 'Hydor ${version}' },
  afterSign: signed ? undefined : 'scripts/sign.cjs',
  win: {
    icon: 'resources/icon.ico',
    target: ['nsis'],
    electronLanguages: ['en-US', 'zh-CN', 'el'],
  },
  nsis: {
    // One click, for your account only: it installs in your local programs folder, which the app may update by itself.
    oneClick: true,
    perMachine: false,
    runAfterFinish: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'Hydor',
    deleteAppDataOnUninstall: false,
    artifactName: 'Hydor-${version}-${arch}-win.${ext}',
  },
  linux: {
    icon: 'resources/icon-square.png',
    target: ['AppImage', 'deb'],
    category: 'Development',
    executableName: 'hydor',
    synopsis: 'Claude Code, Codex and any model on your own computer, from any device',
    description:
      'Hydor runs Claude Code, Codex and other agents, with any model, on your own computer: follow their work, approve what they ask, and carry on from your phone.',
    maintainer: 'Hydor <5434641+algoprog@users.noreply.github.com>',
    // The window's app id is the .desktop entry's (hydor.desktop), so the dock and the task switcher show its icon.
    syncDesktopName: true,
    electronLanguages: ['en-US', 'zh-CN', 'el'],
  },
  appImage: { artifactName: 'Hydor-${version}-${arch}.${ext}' },
  // git for projects and their history, python3 for computer use on X11 (with libxtst6, in electron-builder's own list
  // of what Electron needs).
  deb: { artifactName: 'Hydor-${version}-${arch}.${ext}', recommends: ['git', 'python3'] },
};
