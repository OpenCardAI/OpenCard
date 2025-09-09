import { useOpenCard } from './useOpenCard';

export interface ConnectButtonProps {
  className?: string;
  connectLabel?: string;
  disconnectLabel?: string;
  connectingLabel?: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export function ConnectButton({
  className,
  connectLabel = 'Connect',
  disconnectLabel = 'Disconnect',
  connectingLabel = 'Connecting...',
  onConnect,
  onDisconnect,
}: ConnectButtonProps) {
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