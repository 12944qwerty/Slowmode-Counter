const { Flux, FluxDispatcher, getModule, constants, constants: { ActionTypes, Permissions } } = require('powercord/webpack');
const { SlowmodeType } = getModule([ 'SlowmodeType' ], false);
const { Timeout } = getModule([ 'DelayedCall' ], false);

const ChannelStore = getModule([ 'getMutableGuildChannels' ], false);
const PermissionsStore = getModule([ 'getChannelPermissions' ], false);

const slowmodeCooldowns = {
  [SlowmodeType.SendMessage]: {},
  [SlowmodeType.CreateThread]: {}
};

/* Event Handlers */
function handleResetSlowmodeCooldown ({ channelId, slowmodeType }) {
  return resetSlowmodeCooldown(channelId, slowmodeType);
}

function handleSetSlowmodeCooldown ({ channelId, slowmodeType, cooldownMs }) {
  const channel = ChannelStore.getChannel(channelId);
  if (!channel) return false;

  initSlowmodeCooldown(channel, slowmodeType, cooldownMs === 0 ? 0 : cooldownMs + constants.SLOWMODE_COOLDOWN_BUFFER_MS);
}

function handleChannelUpdates ({ updates }) {
  [ SlowmodeType.SendMessage, SlowmodeType.CreateThread ].forEach(type => {
    updates.reduce((_, update) => {
      const { channel } = update;
      const slowmodeCooldown = slowmodeCooldowns[type][channel.id];

      if (slowmodeCooldown?.rateLimitPerUser !== channel.rateLimitPerUser) {
        initSlowmodeCooldown(channel, type, Math.min(slowmodeCooldown?.cooldownMs ?? 0, channel.rateLimitPerUser * 1e3));
      }
    }, []);
  });
}

function handleStartUpload ({ channelId }) {
  return resetSlowmodeCooldown(channelId, SlowmodeType.SendMessage);
}

function handleLogout () {
  [ SlowmodeType.SendMessage, SlowmodeType.CreateThread ].forEach(type => {
    Object.keys(slowmodeCooldowns[type]).forEach(channelId =>
      slowmodeCooldowns[type][channelId].timer.stop()
    );

    slowmodeCooldowns[type] = {};
  });
}

/* Helper Methods */
function initSlowmodeCooldown (channel, slowmodeType, cooldownMs) {
  if (slowmodeCooldowns[slowmodeType][channel.id]) {
    slowmodeCooldowns[slowmodeType][channel.id].timer.stop();

    delete slowmodeCooldowns[slowmodeType][channel.id];
  }

  const hasManagePermissions = slowmodeType === SlowmodeType.SendMessage
    ? PermissionsStore.can(Permissions.MANAGE_CHANNELS, channel) || PermissionsStore.can(Permissions.MANAGE_MESSAGES, channel)
    : PermissionsStore.can(Permissions.MANAGE_THREADS, channel);

  if (hasManagePermissions && cooldownMs > 0) {
    const cooldownEndTimestamp = cooldownMs + Date.now();

    slowmodeCooldowns[slowmodeType][channel.id] = {
      rateLimitPerUser: channel.rateLimitPerUser,
      cooldownMs,
      cooldownEndTimestamp,
      timer: new Timeout
    };

    slowmodeCooldowns[slowmodeType][channel.id].timer.start(1e3, () => {
      FluxDispatcher.dispatch({
        type: ActionTypes.SLOWMODE_SET_COOLDOWN,
        channelId: channel.id,
        slowmodeType,
        cooldownMs: Math.max(cooldownEndTimestamp - Date.now(), 0)
      });
    }, true);
  }
}

function resetSlowmodeCooldown (channelId, slowmodeType) {
  const channel = ChannelStore.getChannel(channelId);
  if (!channel) return false;

  initSlowmodeCooldown(channel, slowmodeType, channel.rateLimitPerUser === 0 ? 0 : (channel.rateLimitPerUser * 1e3) + constants.SLOWMODE_COOLDOWN_BUFFER_MS);
}

class SlowmodeStore extends Flux.Store {
  initialize () {
    this.waitFor(ChannelStore);
  }

  getSlowmodeCooldowns () {
    return slowmodeCooldowns;
  }

  getSlowmodeCooldownGuess (channelId, slowmodeType = SlowmodeType.SendMessage) {
    const slowmodeCooldown = slowmodeCooldowns[slowmodeType][channelId];

    return slowmodeCooldown?.cooldownMs ?? 0;
  }
};

module.exports = new SlowmodeStore(FluxDispatcher, {
  [ActionTypes.SLOWMODE_RESET_COOLDOWN]: handleResetSlowmodeCooldown,
  [ActionTypes.SLOWMODE_SET_COOLDOWN]: handleSetSlowmodeCooldown,
  [ActionTypes.CHANNEL_UPDATES]: handleChannelUpdates,
  [ActionTypes.UPLOAD_START]: handleStartUpload,
  [ActionTypes.LOGOUT]: handleLogout
});
