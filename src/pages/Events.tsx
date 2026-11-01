import { EonetPanel } from '../components/EonetPanel';
import { HelpTip } from '../components/HelpTip';
import { useApp } from '../store/AppContext';

/** Events tab: natural events NASA is tracking right now (EONET), on a map,
 *  each one a tap away from its matching training simulator. */
export function Events() {
  const { connection, requestSim } = useApp();
  return (
    <div>
      <div className="hero">
        <h1>Natural <span className="accent">events now</span>{' '}
          <HelpTip label="the Events tab">
            Wildfires, storms, volcanoes and more that NASA is tracking today. Tap an event to try it in its simulator.
          </HelpTip>
        </h1>
        {connection === 'offline' && <p>You are offline. Showing the last saved events.</p>}
      </div>
      <EonetPanel onLaunchSim={requestSim} />
    </div>
  );
}
