import { useOpenCard } from './useOpenCard.js';

export function ConnectButton({
  className,
  connectLabel = 'Connect',
  disconnectLabel = 'Disconnect',
  connectingLabel = 'Connecting...',
  onConnect,
  onDisconnect,
}) {
  const { connected, connecting, connect, disconnect, profile } = useOpenCard();

  const handleClick = async () => {
    try {
      if (connected) {
        await disconnect();
        onDisconnect?.();
      } else {
        await connect();
        onConnect?.();
      }
    } catch (error) {
      console.error('Connection action failed:', error);
    }
  };

  const getButtonText = () => {
    if (connecting) return connectingLabel;
    if (connected && profile?.name) return profile.name;
    if (connected) return disconnectLabel;
    return connectLabel;
  };

  return (
    <button
      className={className}
      onClick={handleClick}
      disabled={connecting}
      aria-busy={connecting}
    >
      {getButtonText()}
    </button>
  );
}