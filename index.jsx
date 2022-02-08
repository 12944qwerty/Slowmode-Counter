const { React, getModule, getModuleByDisplayName, i18n: { Messages } } = require('powercord/webpack');
const { inject, uninject } = require('powercord/injector');
const { findInReactTree } = require('powercord/util');
const { Plugin } = require('powercord/entities');

const SlowmodeStore = require('./lib/Store');
const ErrorBoundary = require('./components/ErrorBoundary');

module.exports = class SlowmodeCounter extends Plugin {
	get slowmodeStore () {
		return SlowmodeStore;
	}

	async startPlugin () {
		const _this = this;

		const { SlowmodeType } = await getModule([ 'SlowmodeType' ]);
		const { useStateFromStores } = await getModule([ 'useStateFromStores' ]);

		const SlowmodeCooldown = ({ channel, isThreadCreation }) => {
			const { slowmodeCooldownGuess } = useStateFromStores([ SlowmodeStore ], () => ({
				slowmodeCooldownGuess: SlowmodeStore.getSlowmodeCooldownGuess(channel.id, isThreadCreation ? SlowmodeType.CreateThread : SlowmodeType.SendMessage)
			}));

			return `${Messages.CHANNEL_SLOWMODE_DESC_IMMUNE}${slowmodeCooldownGuess > 0 ? ` ${this.millisecondsToReadableFormat(slowmodeCooldownGuess)}` : ''}`;
		};

		const TypingUsers = (await getModuleByDisplayName('FluxContainer(TypingUsers)')).prototype.render.call({ memoizedGetStateFromStores: () => ({}) }).type;
		if (!TypingUsers) return this.error('Missing “TypingUsers” component - skipping injection');

		inject('force-slowmode-timer', TypingUsers.prototype, 'render', function (_, res) {
			const tooltip = findInReactTree(res, n => typeof n.children === 'function');
			if (!tooltip) return res;

			const oldMethod = tooltip.children;
			tooltip.children = (props) => {
				const res = oldMethod(props);
				if (res.props.children[0] !== Messages.CHANNEL_SLOWMODE_DESC_IMMUNE) return res;

				res.props.children[0] = <ErrorBoundary main={_this}>
					<SlowmodeCooldown channel={this.props.channel} isThreadCreation={this.props.isThreadCreation} />
				</ErrorBoundary>;

				return res;
			};

			return res;
		});
	}

	millisecondsToReadableFormat (ms) {
		let seconds = Math.floor((ms / 1000) % 60),
			minutes = Math.floor((ms / (1000 * 60)) % 60),
			hours = Math.floor((ms / (1000 * 60 * 60)) % 24);

		hours = (hours < 10) ? hours < 1 ? '' : '0' + hours + ':': hours + ':';
		minutes = (minutes < 10) ? '0' + minutes : minutes;
		seconds = (seconds < 10) ? '0' + seconds : seconds;

		return hours + minutes + ':' + seconds;
	}

	pluginWillUnload () {
		uninject('force-slowmode-timer');
	}
}
