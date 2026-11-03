// How the Mac app is packed (scripts/dist.sh runs it once scripts/stage.sh has put the server, Node.js and tmux in
// build/). With a Developer ID certificate (CSC_LINK, CSC_KEY_PASSWORD) it is signed with the hardened runtime,
// and with Apple's notary credentials (APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID) notarized; without
// them it is signed ad hoc (scripts/adhoc-sign.cjs), which Apple silicon needs to run it at all.
const signed = !!process.env.CSC_LINK;

module.exports = {
  appId: 'com.naget.agent',
  productName: 'Naget Agent',
  copyright: 'Copyright © Naget, Inc.',
  directories: { output: 'dist', buildResources: 'resources' },
  files: ['main.cjs', 'package.json'],
  extraResources: [
    { from: 'build/server', to: 'server' },
    { from: 'build/node', to: 'node' },
    { from: 'build/bin', to: 'bin' },
    { from: 'resources', to: '.', filter: ['trayTemplate*.png'] },
  ],
  electronLanguages: ['en', 'zh_CN', 'el'],
  artifactName: 'Naget-Agent-${version}-${arch}-mac.${ext}',
  publish: null,
  mac: {
    icon: 'resources/icon.png',
    category: 'public.app-category.developer-tools',
    target: ['zip', 'dmg'],
    minimumSystemVersion: '12.0',
    identity: signed ? undefined : null,
    hardenedRuntime: signed,
    gatekeeperAssess: false,
    entitlements: 'resources/entitlements.plist',
    entitlementsInherit: 'resources/entitlements.plist',
    notarize: signed && !!process.env.APPLE_TEAM_ID,
    extendInfo: {
      NSMicrophoneUsageDescription: 'Naget Agent uses the microphone when you talk to it.',
      LSMultipleInstancesProhibited: true,
    },
  },
  dmg: { title: 'Naget Agent ${version}' },
  afterSign: signed ? undefined : 'scripts/adhoc-sign.cjs',
};
