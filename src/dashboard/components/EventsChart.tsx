Sure, here's the content for the file `/compliance-framework/compliance-framework/src/dashboard/components/EventsChart.tsx`:

import React from 'react';
import { Line } from 'react-chartjs-2';

interface EventsChartProps {
    data: {
        labels: string[];
        values: number[];
    };
}

const EventsChart: React.FC<EventsChartProps> = ({ data }) => {
    const chartData = {
        labels: data.labels,
        datasets: [
            {
                label: 'Number of Flagged Events',
                data: data.values,
                borderColor: 'rgba(75, 192, 192, 1)',
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                borderWidth: 1,
            },
        ],
    };

    const options = {
        scales: {
            y: {
                beginAtZero: true,
            },
        },
    };

    return (
        <div>
            <h2>Flagged Events Over Time</h2>
            <Line data={chartData} options={options} />
        </div>
    );
};

export default EventsChart;