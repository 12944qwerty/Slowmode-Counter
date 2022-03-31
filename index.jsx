const { React, getModule, getModuleByDisplayName, constants: { Durations }, i18n: { Messages } } = require('powercord/webpack');
const { inject, uninject } = require('powercord/injector');
const { findInReactTree } = require('powercord/util');
const { Plugin } = require('powercord/entities');

const SlowmodeStore = require('./lib/Store');
const ErrorBoundary = require('./components/ErrorBoundary');

const moment = getModule([ 'momentProperties' ], false);

module.exports = class SlowmodeCounter extends Plugin {
	constructor () {
		super();

		this.slowmodeStore.initializeIfNeeded();
	}

	get slowmodeStore () {
		return SlowmodeStore;
	}

	startPlugin () {
		const _this = this;

		const { SlowmodeType } = getModule([ 'SlowmodeType' ], false);
		const { useStateFromStores } = getModule([ 'useStateFromStores' ], false);

		const SlowmodeCooldown = ({ channel, isThreadCreation, renderCounterOnly }) => {
			const { slowmodeCooldownGuess } = useStateFromStores([ SlowmodeStore ], () => ({
				slowmodeCooldownGuess: SlowmodeStore.getSlowmodeCooldownGuess(channel.id, isThreadCreation ? SlowmodeType.CreateThread : SlowmodeType.SendMessage)
			}));

			return `${renderCounterOnly ? '' : Messages.CHANNEL_SLOWMODE_DESC_IMMUNE}${slowmodeCooldownGuess > 0 ? ` ${this.millisecondsToReadableFormat(slowmodeCooldownGuess)}` : ''}`;
		};

		const TypingUsers = getModuleByDisplayName('FluxContainer(TypingUsers)', false).prototype?.render?.call({ memoizedGetStateFromStores: () => ({}) })?.type;
		if (!TypingUsers) return this.error('Missing “TypingUsers” component; skipping injection');

		inject('force-slowmode-timer', TypingUsers.prototype, 'render', function (_, res) {
			const { channel, isBypassSlowmode, isThreadCreation } = this.props;

			if (channel.rateLimitPerUser === 0 || !isBypassSlowmode) return res;

			const Tooltip = findInReactTree(res, n => typeof n.children === 'function');
			if (!Tooltip) return res;

			const { children } = Tooltip;

			Tooltip.children = (props) => {
				const res = children(props);

				res.props.children[0] = <ErrorBoundary main={_this}>
					<SlowmodeCooldown channel={channel} isThreadCreation={isThreadCreation} renderCounterOnly={res.props.children[0] !== Messages.CHANNEL_SLOWMODE_DESC_IMMUNE} />
				</ErrorBoundary>;

				return res;
			};

			return res;
		});
	}

	millisecondsToReadableFormat (ms) {
		const duration = moment.duration(ms);
		const seconds = String(duration.seconds()).padStart(2, '0');

		if (ms > 1e3 * Durations.HOUR) {
			const minutes = String(duration.minutes()).padStart(2, '0');

			return duration.hours() + ':' + minutes + ':' + seconds;
		} else {
			return duration.minutes() + ':' + seconds;
		}
	}

	pluginWillUnload () {
		uninject('force-slowmode-timer');
	}
}
