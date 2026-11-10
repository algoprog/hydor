// What the Chat apps settings (Discord and Slack) tell the person to set up in the other service: shared by the page,
// which shows it, and the server, which builds the invitation from it (server/chatapps).

/** Discord permissions the bot needs: View Channels, Send Messages and Read Message History. */
export const DISCORD_PERMISSIONS = 1024 + 2048 + 65536;

/** The link that adds a Discord application's bot to a server of the person's own. */
export const discordInvite = (applicationId: string) =>
  `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(applicationId)}&scope=${encodeURIComponent('bot applications.commands')}&permissions=${DISCORD_PERMISSIONS}`;

/**
 * The Slack app as a manifest (Create New App → From a manifest): Socket Mode, so no address on the internet; direct
 * messages and mentions in channels as events; buttons as interactivity; the /hydor command; and the scopes it needs.
 */
export const SLACK_MANIFEST = {
  display_information: { name: 'Hydor', description: 'Your Hydor agents, in Slack' },
  features: {
    app_home: { home_tab_enabled: false, messages_tab_enabled: true, messages_tab_read_only_enabled: false },
    bot_user: { display_name: 'Hydor', always_online: true },
    slash_commands: [{ command: '/hydor', description: 'Steer your agents', usage_hint: 'new | sessions | stop | status | help', should_escape: false }],
  },
  oauth_config: { scopes: { bot: ['app_mentions:read', 'chat:write', 'commands', 'im:history', 'reactions:write', 'users:read'] } },
  settings: {
    event_subscriptions: { bot_events: ['app_mention', 'message.im'] },
    interactivity: { is_enabled: true },
    org_deploy_enabled: false,
    socket_mode_enabled: true,
    token_rotation_enabled: false,
  },
};
export const slackManifest = () => JSON.stringify(SLACK_MANIFEST, null, 2);
