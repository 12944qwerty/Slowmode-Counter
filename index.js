const { Plugin } = require('powercord/entities');
const { getModule, channels, React, getModuleByDisplayName, FluxDispatcher } = require('powercord/webpack');
const { inject, uninject } = require('powercord/injector');
const { getChannel } = getModule(['getMutableGuildChannels'], false);
const { findInReactTree } = require('powercord/util');

const { getCurrentUser } = getModule([ 'getCurrentUser', 'getUser' ], false);

lastMessage = {}

module.exports = class SandBox extends Plugin {
    async startPlugin() {
		const currentUser = getCurrentUser()

		FluxDispatcher.subscribe("MESSAGE_CREATE", this.cacheMessage = (args) => {
			if (args.message.author.id !== currentUser.id) return

			let msg = args.message;

			if (!lastMessage[msg.channel_id]) lastMessage[msg.channel_id];

			lastMessage[msg.channel_id] = {id: msg.id, timestamp: new Date(msg.timestamp)}
		})

		const TypingUsers = (await getModuleByDisplayName('FluxContainer(TypingUsers)')).prototype.render.call({ memoizedGetStateFromStores: () => ({}) }).type;
		const Timer = ({calculate}) => {
			const [state, setState] = React.useState(calculate());
		  
			React.useEffect(() => {
				const interval = setInterval(() => {
					setState(calculate());
				}, 100);
			
				return clearInterval.bind(null, interval);
			}, []);

			if (state) return this.msToTime(state);
			else return null
		}
		  
		inject("edit-timer", TypingUsers.prototype, "render", (args, res) => {
			const tooltip = findInReactTree(res, e => typeof e?.children === "function");

			if (!tooltip) return res;
			const original = tooltip.children;
			tooltip.children = (props) => {
				const ret = original(props);
				if (ret.props.children[0] !== "Slowmode is enabled, but you are immune. Amazing!") return ret;
		
				let currentChannel = getChannel(channels.getChannelId());
		
				ret.props.children[0] = React.createElement(React.Fragment, null, 
					"Slowmode is enabled, but you are immune. Amazing! ", 
					React.createElement(Timer, {
						calculate() {
							let msg = lastMessage[currentChannel.id]
					
							if (!msg) return 0;
					
							let rateLimit = currentChannel.rateLimitPerUser * 1000 + 1000;
							let d = ((new Date()) - msg.timestamp);
							let difference = rateLimit - d;
							console.log(rateLimit, d, difference)

							if (difference < 0) return 0
							return difference;
						}
					})
				);
				return ret;
			}
		
			return res;
		});	
	}
	
	msToTime(duration) {
		let milliseconds = Math.floor((duration % 1000) / 100),
			seconds = Math.floor((duration / 1000) % 60),
			minutes = Math.floor((duration / (1000 * 60)) % 60),
			hours = Math.floor((duration / (1000 * 60 * 60)) % 24);
	  
		hours = (hours < 10) ? hours < 1 ? "" : "0" + hours + ":": hours + ":";
		minutes = (minutes < 10) ? "0" + minutes : minutes;
		seconds = (seconds < 10) ? "0" + seconds : seconds;
	  
		return hours + minutes + ":" + seconds;
	}

    pluginWillUnload() {
		uninject('edit-timer');
		FluxDispatcher.unsubscribe("MESSAGE_CREATE", this.cacheMessage)
    }
}