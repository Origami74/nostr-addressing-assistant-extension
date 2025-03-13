import "./index.css";
import { useNostrAddressing } from './hooks/useNostrAddressing';
import { NostrAddressingInfo } from './components/NostrAddressingInfo';

export function App() {
  const nostrAddressingState = useNostrAddressing();

  return (
    <NostrAddressingInfo state={nostrAddressingState} />
  );
}

export default App;
