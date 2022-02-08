const { React } = require('powercord/webpack');

const encounteredErrors = [];

module.exports = class ErrorBoundary extends React.PureComponent {
  constructor (props) {
    super(props);

    this.state = {
      hasError: false,
      error: null,
      info: null
    };
  }

  componentDidCatch (error, info) {
    this.setState({
      hasError: true,
      error,
      info
    });
  }

  render () {
    if (this.state.hasError) {
      if (!encounteredErrors.includes(this.state.error)) {
        const { author } = this.props.main.manifest;
        const authors = author.split(/, /).map((username, index) => index > 0 ? `or ${username}` : username).join(' ');

        console.log(
          '%c[ErrorBoundary:SlowmodeCounter]', 'color: #f04747',
          `An error has occurred while rendering the slow mode counter. Please contact either ${authors}, or open an issue on the GitHub repository.`,
          { error: this.state.error, info: this.state.info }
        );

        encounteredErrors.push(this.state.error);
      }

      return 'Something went wrong! Check the console for more information.';
    }

    return this.props.children;
  }
};
