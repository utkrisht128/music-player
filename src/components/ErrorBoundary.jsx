import React from "react";
import Icon from "./Icon";

/**
 * Catches render errors so a bug in one page shows a recoverable message
 * instead of unmounting the whole app (and killing playback) with a blank
 * white screen. The stack goes to the console, never to the user.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("Render error", error, info);
  }

  componentDidUpdate(prevProps) {
    // A new route is a fresh chance to render successfully.
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      // eslint-disable-next-line react/no-did-update-set-state
      this.setState({ hasError: false });
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="empty empty--error" role="alert">
        <Icon name="warning" size={36} className="empty__icon" />
        <h2 className="empty__title">This page ran into a problem</h2>
        <p className="empty__message">
          Your music keeps playing. Try again, or head back to the home page.
        </p>
        <button
          type="button"
          className="btn btn--ghost empty__action"
          onClick={() => this.setState({ hasError: false })}
        >
          Try again
        </button>
      </div>
    );
  }
}
