Sure, here's the content for the file `/compliance-framework/compliance-framework/src/dashboard/App.tsx`:

import React from 'react';
import LatencyChart from './components/LatencyChart';
import EventsChart from './components/EventsChart';
import BreakerStatus from './components/BreakerStatus';

const App: React.FC = () => {
    return (
        <div>
            <h1>Compliance Dashboard</h1>
            <LatencyChart />
            <EventsChart />
            <BreakerStatus />
        </div>
    );
};

export default App;